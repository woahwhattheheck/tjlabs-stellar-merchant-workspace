"""MIT. Saved IATI geography reviews on the original workspace and immutable editions."""
from __future__ import annotations

from collections import Counter, defaultdict
from contextlib import contextmanager
from datetime import datetime
import os
from pathlib import Path
import sqlite3
import time

from geography_source import CONTRACT, COORDINATE_STATUSES, EXACTNESS, LOCATION_CLASS, LOCATION_REACH
from iati_source import FIELDS, InputError, MAX_SOURCE, preset
from iati_workspace import MAX_METADATA, REQUEST, revision_number, short_text, stable_build
from workspace import checked_id, digest, json_bytes, load_json, regular

SCHEMA = "stellar-forge.iati-geography-review.v1"
COMPARE = "stellar-forge.iati-geography-comparison.v1"
DECISIONS = ("accepted", "needs-correction", "note")
DEFINITION_FIELDS = ("name", "notes", "sources", "selection", "portfolio", "acquisition",
                     "review", "baselineRevision", "findings")
INDEX_FIELDS = ("row_id", "activity_id", "title", "reporting_org_ref", "location_name", "location_ref",
                "coordinate_status", "location_present", "exactness", "location_class",
                "location_reach", "latitude", "longitude")
MAX_PAGE_BYTES = 8 * 1024 * 1024

def exact_object(value, fields, label):
    if not isinstance(value, dict) or set(value) - set(fields):
        raise InputError(label + " contains unknown fields or is not an object")
    return value

def page_number(value, name, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise InputError(f"{name} must be an integer from {minimum} to {maximum}")
    return value

class IatiGeography:
    def __init__(self, workspace):
        self.ws, self.db, self.mutex = workspace, workspace.db, workspace.mutex
        self._verified = {}
        with self.mutex:
            self.db.executescript("""
                CREATE TABLE IF NOT EXISTS iati_geo_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS iati_geo_reviews(
                    id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,revision));
                CREATE TABLE IF NOT EXISTS iati_geo_requests(
                    id TEXT PRIMARY KEY,request_sha TEXT NOT NULL,review_id TEXT NOT NULL,
                    revision INTEGER NOT NULL,body TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS iati_geo_comparisons(
                    id TEXT PRIMARY KEY,review_id TEXT NOT NULL,before_revision INTEGER NOT NULL,
                    after_revision INTEGER NOT NULL,body TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS iati_geo_builds(
                    build TEXT PRIMARY KEY,rows_sha TEXT NOT NULL,row_count INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS iati_geo_index(
                    build TEXT NOT NULL,ordinal INTEGER NOT NULL,row_id TEXT NOT NULL,
                    activity_id TEXT NOT NULL,title TEXT NOT NULL,reporting_org_ref TEXT NOT NULL,
                    location_name TEXT NOT NULL,location_ref TEXT NOT NULL,coordinate_status TEXT NOT NULL,
                    location_present TEXT NOT NULL,exactness TEXT NOT NULL,location_class TEXT NOT NULL,
                    location_reach TEXT NOT NULL,latitude TEXT NOT NULL,longitude TEXT NOT NULL,
                    issue_count INTEGER NOT NULL,search_text TEXT NOT NULL,PRIMARY KEY(build,row_id));
                CREATE INDEX IF NOT EXISTS iati_geo_activity ON iati_geo_index(build,activity_id,row_id);
                CREATE INDEX IF NOT EXISTS iati_geo_coordinates ON iati_geo_index(build,coordinate_status,row_id);
                CREATE TABLE IF NOT EXISTS iati_geo_findings(
                    review_id TEXT NOT NULL,revision INTEGER NOT NULL,source TEXT NOT NULL,
                    row_id TEXT NOT NULL,decision TEXT NOT NULL,body TEXT NOT NULL,
                    PRIMARY KEY(review_id,revision,source,row_id));
                CREATE TABLE IF NOT EXISTS iati_geo_exports(
                    id TEXT PRIMARY KEY,body TEXT NOT NULL);
            """)
            with self.db:
                self.db.execute("INSERT OR IGNORE INTO iati_geo_meta VALUES(?,?)",
                                ("workspaceSha256", digest(os.urandom(32))))
            self.workspace_sha256 = self.db.execute(
                "SELECT value FROM iati_geo_meta WHERE key=?", ("workspaceSha256",)).fetchone()[0]
            checked_id(self.workspace_sha256)

    def state(self):
        with self.mutex:
            rows = self.db.execute("""SELECT r.body FROM iati_geo_reviews r JOIN
                (SELECT id,MAX(revision) AS revision FROM iati_geo_reviews GROUP BY id) current
                ON r.id=current.id AND r.revision=current.revision ORDER BY r.id""").fetchall()
            keys = ("id", "revision", "name", "review", "sources", "report", "updated")
            reviews = [{key: value[key] for key in keys}
                       for row in rows for value in [load_json(row["body"])]]
            return {"schema": "stellar-forge.iati-geography-state.v1", "reviews": reviews,
                    "contract": CONTRACT, "workspaceSha256": self.workspace_sha256}

    def review(self, ident, revision=None):
        checked_id(ident)
        with self.mutex:
            if revision is None:
                row = self.db.execute("SELECT body FROM iati_geo_reviews WHERE id=? ORDER BY revision DESC LIMIT 1",
                                      (ident,)).fetchone()
            else:
                row = self.db.execute("SELECT body FROM iati_geo_reviews WHERE id=? AND revision=?",
                                      (ident, revision_number(revision))).fetchone()
            if row is None:
                raise InputError("Unknown saved geography review revision")
            return load_json(row["body"])

    def history(self, ident, revision=None):
        selected = self.review(ident, revision)
        with self.mutex:
            return [load_json(row["body"]) for row in self.db.execute(
                "SELECT body FROM iati_geo_reviews WHERE id=? AND revision<=? ORDER BY revision",
                (ident, selected["revision"]))]

    def _definition(self, raw, prior_revisions=None):
        exact_object(raw, (*DEFINITION_FIELDS, "requestId", "id", "expectedRevision"), "Geography review")
        request = raw.get("requestId")
        if not isinstance(request, str) or not REQUEST.fullmatch(request):
            raise InputError("Use a unique requestId of 1–160 letters, digits, dots, dashes, underscores or colons")
        if ("id" in raw) != ("expectedRevision" in raw):
            raise InputError("Editing a geography review requires both id and expectedRevision")
        ident = checked_id(raw["id"]) if "id" in raw else None
        expected = revision_number(raw["expectedRevision"]) if ident else None
        portfolio = raw.get("portfolio")
        linked = None
        if portfolio is not None:
            if not isinstance(portfolio, dict) or set(portfolio) != {"id", "revision"}:
                raise InputError("A linked portfolio requires its exact id and revision")
            linked = self.ws.portfolio(checked_id(portfolio["id"]), revision_number(portfolio["revision"]))
            portfolio = {"id": linked["id"], "revision": linked["revision"]}
        sources = raw.get("sources", linked["sources"] if linked else None)
        if linked and sources == []:
            sources = linked["sources"]
        if (not isinstance(sources, list) or not 1 <= len(sources) <= 32 or
                any(not isinstance(source, str) for source in sources) or len(set(sources)) != len(sources)):
            raise InputError("Select 1–32 distinct complete publisher source IDs")
        sources = sorted(checked_id(source) for source in sources)
        if linked and sources != sorted(linked["sources"]):
            raise InputError("Geography must select the linked portfolio's exact publisher source editions")
        for source in sources:
            self.ws.source(source)
        selected = exact_object(raw.get("selection", {}), ("activityIds", "language"), "Geography selection")
        activities = selected.get("activityIds", [])
        if not isinstance(activities, list) or any(not isinstance(item, str) for item in activities):
            raise InputError("Activity selection requires an array of exact IATI identifiers")
        if linked:
            wanted = linked["selection"].get("activityIds", [])
            if activities and sorted(set(activities)) != wanted:
                raise InputError("Geography must use the linked portfolio's activity selection")
            activities = wanted
        plan = preset("locations", name="IATI geography locations", language=selected.get("language", ""),
                      selection={"activityIds": activities}, allowEmpty=True,
                      maxBytes=MAX_SOURCE, maxRows=1000000, maxLimit=1000)
        selection = {"activityIds": plan["selection"].get("activityIds", []), "language": plan["language"]}
        review = raw.get("review", {"status": "draft", "reviewer": "", "note": ""})
        if (not isinstance(review, dict) or set(review) != {"status", "reviewer", "note"} or
                review["status"] not in {"draft", "reviewed", "needs-correction"}):
            raise InputError("Review requires status draft/reviewed/needs-correction, reviewer and note")
        review = {"status": review["status"],
                  "reviewer": short_text(review["reviewer"], "Reviewer", 160, empty=review["status"] == "draft"),
                  "note": short_text(review["note"], "Review note", 4000, empty=True)}
        baseline = raw.get("baselineRevision")
        if baseline is not None:
            revision_number(baseline)
            if ident is None or baseline > expected:
                raise InputError("The baseline must be an existing earlier revision of this review")
            if prior_revisions is None:
                self.review(ident, baseline)
            elif baseline not in prior_revisions or prior_revisions[baseline]["id"] != ident:
                raise InputError("The baseline is absent from the complete received history")
        acquisitions = raw.get("acquisition", [])
        if not isinstance(acquisitions, list) or len(acquisitions) > len(sources):
            raise InputError("Acquisition metadata may describe each selected source once")
        acquisition, acquired = [], set()
        for item in acquisitions:
            exact_object(item, ("source", "publisher", "url", "retrievedAt", "license", "citation"), "Source acquisition")
            source = checked_id(item.get("source"))
            if source not in sources or source in acquired:
                raise InputError("Each acquisition must identify one distinct selected source")
            acquired.add(source)
            row = {"source": source}
            for key, limit in (("publisher", 500), ("url", 4000), ("retrievedAt", 100),
                               ("license", 4000), ("citation", 16000)):
                row[key] = short_text(item.get(key, ""), "Acquisition " + key, limit, empty=True)
            if row["retrievedAt"]:
                try:
                    stamp = datetime.fromisoformat(row["retrievedAt"].replace("Z", "+00:00"))
                    if stamp.tzinfo is None:
                        raise ValueError("timezone")
                except ValueError as error:
                    raise InputError("Acquisition retrievedAt requires an ISO timestamp with timezone") from error
            acquisition.append(row)
        findings = raw.get("findings", [])
        if not isinstance(findings, list) or len(findings) > 100000:
            raise InputError("A review may retain at most 100,000 exact location findings")
        normalized, seen = [], set()
        for item in findings:
            if not isinstance(item, dict) or set(item) != {"source", "rowId", "decision", "reviewer", "note"}:
                raise InputError("Each finding requires source, rowId, decision, reviewer and note")
            source, row_id = checked_id(item["source"]), checked_id(item["rowId"])
            if source not in sources or (source, row_id) in seen or item["decision"] not in DECISIONS:
                raise InputError("Each finding must select one distinct location in these exact source editions")
            seen.add((source, row_id))
            normalized.append({"source": source, "rowId": row_id, "decision": item["decision"],
                               "reviewer": short_text(item["reviewer"], "Finding reviewer", 160),
                               "note": short_text(item["note"], "Finding note", 8000, empty=True)})
        definition = {
            "name": short_text(raw.get("name"), "Geography review name", 160),
            "notes": short_text(raw.get("notes", ""), "Geography notes", 16000, empty=True),
            "sources": sources, "selection": selection, "portfolio": portfolio,
            "acquisition": sorted(acquisition, key=lambda row: row["source"]),
            "review": review, "baselineRevision": baseline,
            "findings": sorted(normalized, key=lambda row: (row["source"], row["rowId"])),
        }
        if len(json_bytes(definition)) > MAX_METADATA:
            raise InputError("The complete geography definition exceeds 64 MiB")
        return request, ident, expected, definition, plan

    def _file(self, build_id, name):
        path = self.ws.root / "builds" / checked_id(build_id) / name
        info = regular(path, 4 * MAX_SOURCE)
        signature = (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
        key = (build_id, name)
        if self._verified.get(key) != signature:
            path = self.ws._build_path(build_id, name)
            after = regular(path, 4 * MAX_SOURCE)
            if signature != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                raise InputError("The original immutable geography edition changed during verification")
            self._verified[key] = signature
        return path

    @contextmanager
    def _native_rows(self, build):
        path = self._file(build["id"], "rows.sqlite")
        db = sqlite3.connect(path.as_uri() + "?mode=ro&immutable=1", uri=True)
        db.row_factory = sqlite3.Row
        try:
            yield db
        finally:
            db.close()

    def _index(self, build):
        actual = self.ws.build_view(build["id"])
        if stable_build(actual) != stable_build(build):
            raise InputError("The selected geography build differs from its original completed edition")
        plan = self.ws.plan(actual["plan"])
        if plan["collection"] != "locations" or plan["fields"] != FIELDS["locations"]:
            raise InputError("Geography reviews require the complete native locations collection")
        self._file(actual["id"], "rows.sqlite")
        self._file(actual["id"], "data.csv")
        existing = self.db.execute("SELECT * FROM iati_geo_builds WHERE build=?", (actual["id"],)).fetchone()
        if existing is not None:
            if existing["rows_sha"] != actual["files"]["rows.sqlite"]["sha256"] or existing["row_count"] != actual["rowCount"]:
                raise InputError("The geography search index belongs to another native edition")
            return
        with self.db:
            count = 0
            for count, row in enumerate(self.ws._rows(actual), 1):
                problems = load_json(row["issues_json"])
                if not isinstance(problems, list):
                    raise InputError("Native geography issues must be an array")
                issue_count = sum(item.get("severity", "warning") != "info" for item in problems)
                search = "\n".join(row[key] for key in
                                   ("activity_id", "title", "reporting_org_ref", "location_name", "location_ref")).casefold()
                values = (actual["id"], count, *(row[key] for key in INDEX_FIELDS), issue_count, search)
                self.db.execute("INSERT INTO iati_geo_index VALUES(" + ",".join("?" for _ in values) + ")", values)
            if count != actual["rowCount"]:
                raise InputError("Geography search indexing did not consume the complete native edition")
            self.db.execute("INSERT INTO iati_geo_builds VALUES(?,?,?)",
                            (actual["id"], actual["files"]["rows.sqlite"]["sha256"], count))

    def _check_findings(self, editions, findings):
        builds = {edition["source"]: edition["locations"]["id"] for edition in editions}
        grouped = defaultdict(list)
        for finding in findings:
            if finding["source"] not in builds:
                raise InputError("The finding belongs to another source edition")
            grouped[builds[finding["source"]]].append(finding["rowId"])
        for build, ids in grouped.items():
            for offset in range(0, len(ids), 500):
                batch = ids[offset:offset + 500]
                found = {row[0] for row in self.db.execute(
                    "SELECT row_id FROM iati_geo_index WHERE build=? AND row_id IN (" +
                    ",".join("?" for _ in batch) + ")", [build, *batch])}
                if found != set(batch):
                    raise InputError("A finding no longer identifies a row in the selected complete edition: " +
                                     next(iter(set(batch) - found)))

    def _summary(self, editions, findings, portfolio=None):
        for edition in editions:
            if edition["locations"]["source"] != edition["source"]:
                raise InputError("A geography edition belongs to another publisher source")
            self._index(edition["locations"])
        ids = [edition["locations"]["id"] for edition in editions]
        placeholders = ",".join("?" for _ in ids)
        overlap = self.db.execute(
            "SELECT activity_id FROM iati_geo_index WHERE build IN (" + placeholders +
            ") GROUP BY activity_id HAVING COUNT(DISTINCT build)>1 LIMIT 1", ids).fetchone()
        if overlap:
            raise InputError("Activity " + overlap["activity_id"] + " occurs in more than one selected source; select one publisher edition")
        self._check_findings(editions, findings)
        by_source, totals = [], Counter()
        statuses = {name: 0 for name in COORDINATE_STATUSES}
        for edition in editions:
            build = edition["locations"]["id"]
            counts = dict(self.db.execute("""SELECT COUNT(*) AS rows,
                COUNT(DISTINCT activity_id) AS activities,
                COALESCE(SUM(location_present='true'),0) AS locations,
                COALESCE(SUM(coordinate_status='valid'),0) AS mapped,
                COALESCE(SUM(coordinate_status='missing'),0) AS unlocated,
                COALESCE(SUM(coordinate_status='invalid'),0) AS invalid,
                COALESCE(SUM(location_present='false'),0) AS activitiesWithoutLocation,
                COUNT(DISTINCT CASE WHEN coordinate_status='valid' THEN activity_id END) AS activitiesWithCoordinates,
                COALESCE(SUM(issue_count>0),0) AS recordsWithIssues
                FROM iati_geo_index WHERE build=?""", (build,)).fetchone())
            counts["activitiesWithoutCoordinates"] = counts["activities"] - counts["activitiesWithCoordinates"]
            orgs = [row[0] for row in self.db.execute(
                "SELECT DISTINCT reporting_org_ref FROM iati_geo_index WHERE build=? ORDER BY reporting_org_ref", (build,))]
            by_source.append({"source": edition["source"], **counts, "reportingOrgRefs": orgs})
            totals.update(counts)
            for row in self.db.execute(
                    "SELECT coordinate_status,COUNT(*) AS n FROM iati_geo_index WHERE build=? GROUP BY coordinate_status", (build,)):
                if row["coordinate_status"] not in statuses:
                    raise InputError("The native edition contains an unknown coordinate status")
                statuses[row["coordinate_status"]] += row["n"]
        decisions = {name: 0 for name in DECISIONS}
        decisions.update(Counter(item["decision"] for item in findings))
        decisions["unreviewed"] = totals["rows"] - len(findings)
        linked = None
        if portfolio is not None:
            value = self.ws.portfolio(portfolio["id"], portfolio["revision"])
            linked = {"id": value["id"], "revision": value["revision"],
                      "definitionSha256": value["definitionSha256"],
                      "financialReview": value["review"], "counts": value["report"]["counts"]}
        return {"schema": "stellar-forge.iati-geography-report.v1",
                "counts": {"sources": len(editions), **dict(totals)}, "bySource": by_source,
                "coordinateStatuses": statuses, "decisions": decisions, "portfolio": linked,
                "semantics": CONTRACT["semantics"]}

    def _insert(self, value):
        self.db.execute("INSERT INTO iati_geo_reviews VALUES(?,?,?)",
                        (value["id"], value["revision"], json_bytes(value).decode()))
        for finding in value["findings"]:
            self.db.execute("INSERT INTO iati_geo_findings VALUES(?,?,?,?,?,?)",
                            (value["id"], value["revision"], finding["source"], finding["rowId"],
                             finding["decision"], json_bytes(finding).decode()))

    def save(self, raw):
        with self.mutex:
            request, ident, expected, definition, plan = self._definition(raw)
            request_sha = digest(json_bytes(raw))
            retained = self.db.execute("SELECT * FROM iati_geo_requests WHERE id=?", (request,)).fetchone()
            if retained:
                if retained["request_sha"] != request_sha:
                    raise InputError("requestId was already used for a different geography review")
                return self.review(retained["review_id"], retained["revision"])
            previous = self.review(ident) if ident else None
            if previous and previous["revision"] != expected:
                raise InputError(f"Geography review changed; current revision is {previous['revision']}")
            mapped = self.ws.save_plan(plan)
            editions = [{"source": source, "locations": self.ws.build(source, mapped["id"])}
                        for source in definition["sources"]]
            report = self._summary(editions, definition["findings"], definition["portfolio"])
            now = time.time()
            ident = ident or digest(os.urandom(32))
            revision = previous["revision"] + 1 if previous else 1
            value = {"schema": SCHEMA, "id": ident, "revision": revision, **definition,
                     "editions": editions, "report": report, "definitionSha256": digest(json_bytes(definition)),
                     "created": previous["created"] if previous else now, "updated": now,
                     "previousRevision": previous["revision"] if previous else None}
            if len(json_bytes(value)) > MAX_METADATA:
                raise InputError("The complete geography review exceeds 64 MiB")
            with self.db:
                self._insert(value)
                self.db.execute("INSERT INTO iati_geo_requests VALUES(?,?,?,?,?)",
                                (request, request_sha, ident, revision, json_bytes(raw).decode()))
            return value

    def report(self, ident, revision=None):
        with self.mutex:
            value = self.review(ident, revision)
            report = self._summary(value["editions"], value["findings"], value["portfolio"])
            if report != value["report"]:
                raise InputError("The saved geography report differs from its complete original editions")
            return {**report, "id": value["id"], "revision": value["revision"],
                    "name": value["name"], "review": value["review"],
                    "definitionSha256": value["definitionSha256"]}

    def rows(self, raw, points=False):
        allowed = ("id", "revision", "source", "search", "activityId", "rowId", "coordinateStatus", "decision",
                   "exactness", "locationClass", "locationReach", "offset", "limit")
        exact_object(raw, allowed, "Geography row query")
        offset = page_number(raw.get("offset", 0), "offset", 0, 1000000)
        limit = page_number(raw.get("limit", 50), "limit", 1, 1000)
        with self.mutex:
            value = self.review(raw.get("id"), revision_number(raw.get("revision")))
            editions = {edition["locations"]["id"]: edition for edition in value["editions"]}
            for edition in editions.values():
                self._index(edition["locations"])
            parameters = []
            pairs = []
            for build, edition in editions.items():
                pairs.append("(?,?)")
                parameters.extend((build, edition["source"]))
            sql = "WITH selected(build,source) AS (VALUES " + ",".join(pairs) + """)
                SELECT s.source,i.*,f.body AS finding FROM selected s
                JOIN iati_geo_index i ON i.build=s.build LEFT JOIN iati_geo_findings f
                ON f.review_id=? AND f.revision=? AND f.source=s.source AND f.row_id=i.row_id"""
            parameters.extend((value["id"], value["revision"]))
            where = []
            filters = {"source": "s.source", "activityId": "i.activity_id", "rowId": "i.row_id",
                       "coordinateStatus": "i.coordinate_status", "exactness": "i.exactness",
                       "locationClass": "i.location_class", "locationReach": "i.location_reach"}
            for key, column in filters.items():
                if key in raw and raw[key] != "":
                    candidate = short_text(raw[key], key, 1024)
                    if key in {"source", "rowId"}:
                        checked_id(candidate)
                    where.append(column + "=?"); parameters.append(candidate)
            if "decision" in raw and raw["decision"] != "":
                if raw["decision"] == "unreviewed":
                    where.append("f.row_id IS NULL")
                elif raw["decision"] in DECISIONS:
                    where.append("f.decision=?"); parameters.append(raw["decision"])
                else:
                    raise InputError("Unknown finding decision")
            if raw.get("search", ""):
                search = short_text(raw["search"], "Geography search", 2000).casefold()
                where.append("instr(i.search_text,?)>0"); parameters.append(search)
            if points:
                if raw.get("coordinateStatus") not in (None, "", "valid"):
                    raise InputError("Map points select valid reported coordinates")
                where.append("i.coordinate_status='valid'")
            if where:
                sql += " WHERE " + " AND ".join(where)
            total = self.db.execute("SELECT COUNT(*) FROM (" + sql + ")", parameters).fetchone()[0]
            selected = self.db.execute(sql + " ORDER BY s.source,i.activity_id,i.row_id LIMIT ? OFFSET ?",
                                       [*parameters, limit, offset]).fetchall()
            rows, used = [], 0
            if points:
                for item in selected:
                    row = {key: item[key] for key in ("source", *INDEX_FIELDS)}
                    row["finding"] = load_json(item["finding"]) if item["finding"] else None
                    encoded = json_bytes(row)
                    if used + len(encoded) > MAX_PAGE_BYTES:
                        if not rows:
                            raise InputError("This map label exceeds the interactive page size; use the full export")
                        break
                    rows.append(row); used += len(encoded)
            else:
                # Fetch native cells in small groups. The shared search index stores
                # references and filters, never a second copy of publisher records.
                for start in range(0, len(selected), 25):
                    batch = selected[start:start + 25]
                    full = {}
                    for build in {item["build"] for item in batch}:
                        wanted = [item["ordinal"] for item in batch if item["build"] == build]
                        with self._native_rows(editions[build]["locations"]) as native:
                            for item in native.execute("SELECT ordinal,cells FROM rows WHERE ordinal IN (" +
                                                       ",".join("?" for _ in wanted) + ")", wanted):
                                cells = load_json(item["cells"])
                                if not isinstance(cells, list) or len(cells) != len(FIELDS["locations"]):
                                    raise InputError("Original location cells differ from the complete mapping")
                                full[(build, item["ordinal"])] = dict(zip(FIELDS["locations"], cells))
                    stop = False
                    for item in batch:
                        row = full.get((item["build"], item["ordinal"]))
                        if row is None or row["row_id"] != item["row_id"]:
                            raise InputError("The search result does not identify the original location row")
                        row = {"source": item["source"], **row,
                               "finding": load_json(item["finding"]) if item["finding"] else None}
                        encoded = json_bytes(row)
                        if used + len(encoded) > MAX_PAGE_BYTES:
                            if not rows:
                                raise InputError("This location exceeds the interactive page size; use the full export")
                            stop = True; break
                        rows.append(row); used += len(encoded)
                    if stop:
                        break
            next_offset = offset + len(rows)
            return {"id": value["id"], "revision": value["revision"], "offset": offset, "limit": limit,
                    "total": total, "rows": rows, "nextOffset": next_offset if next_offset < total else None}

    def _compare(self, before, after, supplied=None):
        if before["id"] != after["id"] or before["revision"] >= after["revision"]:
            raise InputError("Select an earlier and a later revision of the same geography review")
        left = {item["source"]: item["locations"] for item in before["editions"]}
        right = {item["source"]: item["locations"] for item in after["editions"]}
        common = sorted(set(left) & set(right))
        pairs = [{"before": source, "after": source} for source in common]
        remaining_left, remaining_right = set(left) - set(right), set(right) - set(left)
        if supplied is not None:
            if not isinstance(supplied, list):
                raise InputError("Replacement source pairs must be an array")
            for pair in supplied:
                if (not isinstance(pair, dict) or set(pair) != {"before", "after"} or
                        pair["before"] not in remaining_left or pair["after"] not in remaining_right):
                    raise InputError("Each replacement must pair one distinct earlier source with one distinct later source")
                remaining_left.remove(pair["before"]); remaining_right.remove(pair["after"])
                pairs.append(dict(pair))
        comparisons = []
        totals = Counter({"added": 0, "removed": 0, "changed": 0, "unchanged": 0})
        for pair in pairs:
            native = self.ws.compare(left[pair["before"]]["id"], right[pair["after"]]["id"], compatible_plans=True)
            comparisons.append({**pair, "native": native})
            totals.update(native["counts"])
        for source in remaining_left:
            totals["removed"] += left[source]["rowCount"]
        for source in remaining_right:
            totals["added"] += right[source]["rowCount"]
        old_findings = {(row["source"], row["rowId"]): row for row in before["findings"]}
        new_findings = {(row["source"], row["rowId"]): row for row in after["findings"]}
        findings = [{"source": key[0], "rowId": key[1], "before": old_findings.get(key), "after": new_findings.get(key)}
                    for key in sorted(set(old_findings) | set(new_findings))
                    if old_findings.get(key) != new_findings.get(key)]
        changes = {key: {"before": before[key], "after": after[key]}
                   for key in DEFINITION_FIELDS if key != "findings" and before[key] != after[key]}
        value = {"schema": COMPARE, "review": before["id"], "beforeRevision": before["revision"],
                 "afterRevision": after["revision"], "pairs": pairs, "comparisons": comparisons,
                 "sourcesRemoved": sorted(remaining_left), "sourcesAdded": sorted(remaining_right),
                 "counts": dict(totals), "definitionChanges": changes, "findingChanges": findings,
                 "beforeReport": before["report"], "afterReport": after["report"],
                 "semantics": "Whole native location editions; exact source-bound review findings; unpaired sources are complete additions or removals."}
        value["id"] = digest(json_bytes(value))
        if len(json_bytes(value)) > MAX_METADATA:
            raise InputError("The complete geography comparison exceeds 64 MiB")
        return value

    def compare(self, raw):
        exact_object(raw, ("id", "beforeRevision", "afterRevision", "pairs"), "Geography comparison")
        with self.mutex:
            before = self.review(raw.get("id"), revision_number(raw.get("beforeRevision")))
            after = self.review(raw.get("id"), revision_number(raw.get("afterRevision")))
            self.report(before["id"], before["revision"]); self.report(after["id"], after["revision"])
            value = self._compare(before, after, raw.get("pairs"))
            with self.db:
                self.db.execute("INSERT OR IGNORE INTO iati_geo_comparisons VALUES(?,?,?,?,?)",
                                (value["id"], before["id"], before["revision"], after["revision"], json_bytes(value).decode()))
            return value

    def comparison(self, ident):
        checked_id(ident)
        with self.mutex:
            row = self.db.execute("SELECT body FROM iati_geo_comparisons WHERE id=?", (ident,)).fetchone()
            if row is None:
                raise InputError("Unknown saved geography comparison")
            return load_json(row["body"])

    def changes(self, ident, native_id, offset=0, limit=50):
        with self.mutex:
            value = self.comparison(ident)
            if native_id not in {pair["native"]["id"] for pair in value["comparisons"]}:
                raise InputError("Select a native comparison from this saved geography comparison")
            return self.ws.comparison_page(native_id, offset, limit)

    def export(self, raw):
        from geography_portable import export
        with self.mutex:
            return export(self, raw)

    def download(self, ident):
        from geography_portable import download
        with self.mutex:
            return download(self, ident)

    def receive(self, raw):
        from geography_portable import receive
        with self.mutex:
            return receive(self, raw)
