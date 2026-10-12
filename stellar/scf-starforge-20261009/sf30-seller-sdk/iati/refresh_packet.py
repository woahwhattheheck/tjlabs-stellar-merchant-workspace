"""MIT. Complete publisher-refresh handover through the original IATI packet engine."""
from __future__ import annotations

import csv
from datetime import datetime, timezone
import hashlib
import html
import io
import os
from pathlib import Path
import re
import stat
import zipfile

from refresh import (
    InputError, JOURNAL, PACKET, REPORT, GUIDES, HERE, clone, current_plan,
    pending_action, MAX_PACKET, MAX_METADATA, MAX_FILES, native_selection,
)
from workspace import json_bytes, load_json, digest, checked_id, private_write, regular, file_digest
from iati_workspace import packet_write, revision_number

MEMBER = re.compile(
    r"(?:refresh/journal\.json|portfolios/[0-9a-f]{64}\.zip|sources/[0-9a-f]{64}\.iati"
    r"|reports/refresh\.(?:json|html|csv)|guides/(?:REFRESH|OPERATIONS|DOMAIN)\.md)\Z")


def sources_for(doc):
    result = set()
    try:
        for plan in doc["plans"]:
            result.update(plan["baseline"]["sources"])
        for action in doc["actions"]:
            prepared = action["prepared"]
            if "preview" in prepared:
                result.update(prepared["preview"]["sources"])
                result.update(prepared["preview"]["baseline"]["sources"])
            if "nativeRequest" in prepared:
                result.update(prepared["nativeRequest"]["sources"])
    except (KeyError, TypeError, AttributeError) as error:
        raise InputError("The complete refresh source selection is invalid") from error
    return sorted(checked_id(value) for value in result)


def _iso(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat()


def _csv_value(value):
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    # Notes and labels are publisher/operator text, never spreadsheet formulas.
    if value.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


def report_files(work, doc, directory):
    directory.mkdir(mode=0o700)
    plan = current_plan(doc)
    source_files = [work._source(ident) for ident in sources_for(doc)]
    histories = [clone(rows) for _, rows in sorted(doc["runs"].items(),
                 key=lambda item: (item[1][0]["created"], item[0]))]
    report = {"schema": REPORT, "plan": plan, "planHistory": clone(doc["plans"]),
              "snapshot": digest(json_bytes(doc)), "sources": source_files, "runHistories": histories,
              "pendingRequest": clone(pending_action(doc)),
              "actions": [{key: clone(action[key]) for key in
                          ("ordinal", "requestId", "kind", "inputSha256", "created", "state")}
                          for action in doc["actions"]],
              "semantics": {
                  "publisher": "Every selected earlier and later XML body is retained whole and addressed by its original SHA-256.",
                  "baseline": "Only an explicit promotion changes the saved plan baseline. Cancellation preserves all native editions and prior decisions.",
                  "selection": "Native field comparisons cover identical mappings only. Source additions, removals and changed selections remain explicit separate facts.",
                  "finance": "The nested original portfolio packet retains complete reported decimals, native datasets, financial groups and review files; no cross-currency total is created.",
                  "receiving": "The receiver reconstructs each complete action and native result before publishing refresh history. Pending requests stay pending until explicitly resumed.",
              }}
    raw = json_bytes(report)
    if len(raw) > MAX_METADATA:
        raise InputError("The complete readable refresh report exceeds 64 MiB")
    private_write(directory / "refresh.json", raw)
    columns = ["record_kind", "id", "revision", "state", "request_id", "created_utc",
               "updated_utc", "label", "actor", "note", "baseline_portfolio", "baseline_revision",
               "candidate_revision", "sources_json", "selection_json", "review_status",
               "reviewer", "review_note", "source_change_note", "selection_change_note",
               "comparison_id", "activities", "transactions", "budgets"]
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\r\n")
    writer.writerow(columns)
    for item in doc["plans"]:
        values = {"record_kind": "plan", "id": item["id"], "revision": item["revision"],
                  "state": item["state"], "request_id": item["requestId"], "created_utc": _iso(item["created"]),
                  "updated_utc": _iso(item["updated"]), "label": item["name"], "actor": item["owner"], "note": item["note"],
                  "baseline_portfolio": item["baseline"]["id"], "baseline_revision": item["baseline"]["revision"],
                  "sources_json": json_bytes(item["baseline"]["sources"]).decode().strip(),
                  "selection_json": json_bytes(item["baseline"]["selection"]).decode().strip(),
                  "review_status": item["baseline"]["review"]["status"],
                  "reviewer": item["baseline"]["review"]["reviewer"], "review_note": item["baseline"]["review"]["note"]}
        writer.writerow([_csv_value(values.get(key)) for key in columns])
    for rows in histories:
        for item in rows:
            candidate, review, counts = item["candidate"], item["review"], item["afterCounts"]
            values = {"record_kind": "run", "id": item["id"], "revision": item["revision"],
                      "state": item["state"], "request_id": item["requestId"],
                      "created_utc": _iso(item["created"]), "updated_utc": _iso(item["updated"]),
                      "label": item["label"], "actor": item["actor"], "note": item["note"],
                      "baseline_portfolio": item["baseline"]["id"], "baseline_revision": item["baseline"]["revision"],
                      "candidate_revision": candidate["revision"] if candidate else None,
                      "sources_json": json_bytes(item["preview"]["sources"]).decode().strip(),
                      "selection_json": json_bytes(item["preview"]["selection"]).decode().strip(),
                      "review_status": review["status"] if review else None, "reviewer": review["reviewer"] if review else None,
                      "review_note": review["note"] if review else None,
                      "source_change_note": item["preview"]["sourceChangeNote"],
                      "selection_change_note": item["preview"]["selectionNote"],
                      "comparison_id": item["comparison"]["id"] if item["comparison"] else None,
                      **({key: counts[key] for key in ("activities", "transactions", "budgets")} if counts else {})}
            writer.writerow([_csv_value(values.get(key)) for key in columns])
    private_write(directory / "refresh.csv", stream.getvalue().encode("utf-8"))
    esc = lambda value: html.escape(str(value), quote=True)
    pre = lambda value: "<pre>" + esc(json_bytes(value).decode().strip()) + "</pre>"
    blocks = []
    for rows in histories:
        current = rows[-1]
        revision_blocks = []
        for item in rows:
            candidate = item["candidate"]
            comparison = item["comparison"]
            preview = item["preview"]
            details = [
                ("Original baseline", item["baseline"]), ("Selected candidate", candidate),
                ("Publisher replacements", preview["pairs"]),
                ("Unchanged publishers", preview["unchangedSources"]),
                ("Added publishers", preview["addedSources"]), ("Removed publishers", preview["removedSources"]),
                ("Selection", preview["selection"]), ("Counts before", preview["beforeCounts"]),
                ("Counts after", item["afterCounts"]), ("Named review", item["review"]),
                ("Baseline promotion", item["promotion"]), ("Cancellation", item["cancellation"]),
                ("Complete original comparison", comparison),
            ]
            revision_blocks.append("<details><summary>r" + str(item["revision"]) + " · " + esc(item["state"])
                + " · " + esc(_iso(item["updated"])) + "</summary><p><strong>Original request</strong> "
                + esc(item["requestId"]) + "</p><p>" + esc(item["note"]) + "</p>"
                + "<p><strong>Publisher change note:</strong> " + esc(preview["sourceChangeNote"])
                + "</p><p><strong>Selection change note:</strong> " + esc(preview["selectionNote"]) + "</p>"
                + "".join("<h4>" + esc(title) + "</h4>" + pre(value) for title, value in details) + "</details>")
        blocks.append("<section><h2>" + esc(current["label"]) + "</h2><p>" + esc(current["state"])
                      + " · " + esc(current["actor"]) + "</p>" + "".join(revision_blocks) + "</section>")
    source_rows = "".join("<tr><td><code>" + esc(row["id"]) + "</code></td><td>"
                          + str(row["bytes"]) + "</td><td><code>" + esc(row["inventorySha256"])
                          + "</code></td></tr>" for row in source_files)
    content = ("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>" + esc(plan["name"]) + " — publisher refresh</title><style>"
        "body{font:16px/1.55 system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;color:#202124;background:#fff}"
        "h1,h2,h3{line-height:1.2}section,details{border:1px solid #aaa;border-radius:.4rem;padding:1rem;margin:1rem 0}"
        "summary{cursor:pointer;font-weight:650}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f3f3;padding:1rem}"
        "code{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:.85rem}td,th{border:1px solid #aaa;padding:.5rem;text-align:left}"
        "@media(max-width:600px){body{margin:1rem auto}td,th{padding:.25rem}table{display:block;overflow:auto}}"
        "</style><main><h1>" + esc(plan["name"]) + "</h1><p>Saved publisher refresh · " + esc(plan["state"])
        + " · Plan r" + str(plan["revision"]) + "</p><p><strong>Owner:</strong> " + esc(plan["owner"])
        + "</p><p>" + esc(plan["note"]) + "</p><h2>Explicit saved baseline</h2>" + pre(plan["baseline"])
        + "<p>Snapshot <code>" + report["snapshot"] + "</code></p>"
        + "<h2>How to read this handover</h2>" + "".join("<p><strong>" + esc(key.title()) + ".</strong> " + esc(value) + "</p>"
          for key, value in report["semantics"].items())
        + "<h2>Complete publisher bodies</h2><table><thead><tr><th>Source SHA-256</th><th>Bytes</th><th>Inventory SHA-256</th></tr></thead><tbody>"
        + source_rows + "</tbody></table><p>The original portfolio ZIP is in <code>portfolios/" + esc(doc["portfolioId"])
        + ".zip</code>; it contains every native edition and the full financial and change reports.</p>"
        + "<h2>Plan history</h2>" + pre(doc["plans"]) + "".join(blocks)
        + "<h2>Pending original request</h2>" + pre(report["pendingRequest"])
        + "<h2>Original action index</h2>" + pre(report["actions"]) + "</main></html>")
    private_write(directory / "refresh.html", content.encode())
    return {name: directory / name for name in ("refresh.json", "refresh.html", "refresh.csv")}


def native_packet(work, doc):
    ws = work.ws
    revisions = [plan["baseline"]["revision"] for plan in doc["plans"]]
    for rows in doc["runs"].values():
        revisions.extend(row["candidate"]["revision"] for row in rows if row["candidate"] is not None)
    for action in doc["actions"]:
        request = action["prepared"].get("nativeRequest")
        if request is not None:
            revisions.append(request["expectedRevision"])
            native = ws.db.execute("SELECT * FROM iati_requests WHERE id=?", (request["requestId"],)).fetchone()
            if native is not None:
                if (native["portfolio"] != doc["portfolioId"]
                        or native["request_sha"] != digest(json_bytes(request))):
                    raise InputError("A pending refresh request is bound to another original native operation")
                revisions.append(native["revision"])
    # Export the full native history required by this saved journal, including a
    # committed native request whose refresh reply was lost. Unrelated later
    # portfolio edits do not silently change an already selected handover.
    current = ws.portfolio(doc["portfolioId"], max(revisions))
    history = [item for item in ws.history(doc["portfolioId"]) if item["revision"] <= current["revision"]]
    requests = [dict(row) for row in ws.db.execute(
        "SELECT * FROM iati_requests WHERE portfolio=? AND revision<=? ORDER BY id",
        (doc["portfolioId"], current["revision"]))]
    comparisons = [load_json(row["body"]) for row in ws.db.execute(
        "SELECT body FROM iati_portfolio_comparisons WHERE portfolio=? AND after_revision<=? ORDER BY id",
        (doc["portfolioId"], current["revision"]))]
    selected = digest(json_bytes({"history": history, "requests": requests, "comparisons": comparisons}))
    # A later comparison on the same native revision selects its own complete
    # packet. The earlier full ZIP remains immutable for interrupted outer exports.
    path = work.exports / (selected + ".zip")
    descriptor = ws.export_portfolio(doc["portfolioId"], path, current["revision"])
    return path, current["revision"], descriptor


def export_refresh(work, ident, output, expected_snapshot=None):
    with work.ws.mutex, work.ws.scratch() as temp:
        doc = work._document(ident)
        snapshot = digest(json_bytes(doc))
        if expected_snapshot is not None and checked_id(expected_snapshot) != snapshot:
            raise InputError("Refresh history changed; reopen the current full snapshot before exporting")
        nested, revision, _ = native_packet(work, doc)
        private_write(temp / "journal.json", json_bytes(doc))
        files = {"refresh/journal.json": temp / "journal.json",
                 "portfolios/" + doc["portfolioId"] + ".zip": nested}
        for source in sources_for(doc):
            work._source(source)
            files["sources/" + source + ".iati"] = work.ws.root / "sources" / (source + ".iati")
        files.update({"reports/" + name: path for name, path in report_files(work, doc, temp / "reports").items()})
        for name in GUIDES:
            # Guides are installed ordinary source. Copy the full current body into
            # a private file for the original packet writer's private-file contract.
            source = HERE / name
            info = source.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_METADATA:
                raise InputError("The complete installed refresh guide is unavailable")
            target = temp / name
            private_write(target, source.read_bytes())
            files["guides/" + name] = target
        return {**packet_write(Path(output), files, PACKET, {
                    "plan": doc["id"], "snapshot": snapshot,
                    "portfolio": doc["portfolioId"], "portfolioRevision": revision}),
                "plan": doc["id"], "snapshot": snapshot, "portfolio": doc["portfolioId"],
                "portfolioRevision": revision, "sourceCount": len(sources_for(doc)),
                "runCount": len(doc["runs"]), "actionCount": len(doc["actions"])}


def read_packet(path, target):
    regular(path, MAX_PACKET)
    try:
        with zipfile.ZipFile(path) as archive:
            members = archive.infolist()
            if (len(members) > MAX_FILES + 1 or len({x.filename for x in members}) != len(members)
                    or any(x.is_dir() or x.flag_bits & 1 or stat.S_IFMT(x.external_attr >> 16) not in {0, stat.S_IFREG}
                           for x in members)):
                raise InputError("The complete refresh ZIP must contain unique unencrypted regular files")
            names = {x.filename for x in members}
            if "manifest.json" not in names or any(name != "manifest.json" and not MEMBER.fullmatch(name) for name in names):
                raise InputError("The refresh ZIP contains an undeclared original member path")
            info = archive.getinfo("manifest.json")
            if info.file_size > MAX_METADATA:
                raise InputError("The complete refresh manifest exceeds 64 MiB")
            manifest = load_json(archive.read(info))
            if (not isinstance(manifest, dict) or set(manifest) != {
                    "schema", "files", "plan", "snapshot", "portfolio", "portfolioRevision"}
                    or manifest["schema"] != PACKET or not isinstance(manifest["files"], dict)
                    or set(manifest["files"]) != names - {"manifest.json"}):
                raise InputError("The refresh ZIP manifest must describe every complete member exactly")
            checked_id(manifest["plan"]); checked_id(manifest["snapshot"]); checked_id(manifest["portfolio"])
            revision_number(manifest["portfolioRevision"])
            total = 0
            for name, selected in manifest["files"].items():
                if (not isinstance(selected, dict) or set(selected) != {"bytes", "sha256"}
                        or type(selected["bytes"]) is not int or selected["bytes"] < 0):
                    raise InputError("Each complete refresh file needs an exact byte count and SHA-256")
                checked_id(selected["sha256"])
                total += selected["bytes"]
                if total > MAX_PACKET or archive.getinfo(name).file_size != selected["bytes"]:
                    raise InputError("The complete refresh ZIP exceeds its expanded capacity or declared sizes")
                if name.endswith((".json", ".md")) and selected["bytes"] > MAX_METADATA:
                    raise InputError("Complete refresh metadata exceeds 64 MiB")
                destination = target / name
                destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                h = hashlib.sha256()
                count = 0
                with archive.open(name) as source, os.fdopen(os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as out:
                    while block := source.read(1048576):
                        count += len(block)
                        if count > selected["bytes"]:
                            raise InputError("A refresh ZIP member expanded beyond its selected bytes")
                        h.update(block); out.write(block)
                    out.flush(); os.fsync(out.fileno())
                if count != selected["bytes"] or h.hexdigest() != selected["sha256"]:
                    raise InputError("The complete original refresh member does not match its manifest")
            return manifest
    except (zipfile.BadZipFile, RuntimeError, OSError, EOFError) as error:
        raise InputError("The complete refresh ZIP could not be read and verified") from error


def extends(later, earlier):
    if any(later.get(key) != earlier.get(key) for key in ("schema", "id", "portfolioId", "originWorkspace")):
        return False
    if (len(later["plans"]) < len(earlier["plans"])
            or later["plans"][:len(earlier["plans"])] != earlier["plans"]
            or len(later["actions"]) < len(earlier["actions"])):
        return False
    for ident, rows in earlier["runs"].items():
        current = later["runs"].get(ident, [])
        if current[:len(rows)] != rows:
            return False
    for index, action in enumerate(earlier["actions"]):
        current = later["actions"][index]
        if action["state"] != "PREPARED":
            if current != action:
                return False
            continue
        immutable = ("schema", "ordinal", "requestId", "kind", "input", "inputSha256", "created", "prepared")
        if any(current.get(key) != action.get(key) for key in immutable):
            return False
        native = action["native"]
        if native is not None:
            if current.get("native") is None or any(current["native"].get(key) != value for key, value in native.items()):
                return False
    return True


def receive_refresh(work, path):
    ws = work.ws
    with ws.mutex, ws.scratch() as temp:
        manifest = read_packet(Path(path), temp)
        if "refresh/journal.json" not in manifest["files"]:
            raise InputError("The packet is missing its complete original refresh journal")
        doc = load_json((temp / "refresh/journal.json").read_bytes())
        if not isinstance(doc, dict) or doc.get("schema") != JOURNAL:
            raise InputError("The selected refresh journal schema is invalid")
        if (doc.get("id") != manifest["plan"] or doc.get("portfolioId") != manifest["portfolio"]
                or digest(json_bytes(doc)) != manifest["snapshot"]):
            raise InputError("The complete refresh journal differs from its selected manifest")
        sources = sources_for(doc)
        required = {"refresh/journal.json", "portfolios/" + manifest["portfolio"] + ".zip"}
        required.update("sources/" + source + ".iati" for source in sources)
        required.update("reports/refresh." + ext for ext in ("json", "html", "csv"))
        required.update("guides/" + name for name in GUIDES)
        if set(manifest["files"]) != required:
            raise InputError("The refresh handover must retain exactly its whole original source, portfolio, reports and guides")
        # Immutable source/native preparation can survive a rejected packet. The
        # refresh domain is published only after every original transition and
        # every complete report file reconstructs.
        for source in sources:
            selected = temp / "sources" / (source + ".iati")
            if file_digest(selected) != source:
                raise InputError("The selected publisher ID differs from its original full XML")
            with selected.open("rb") as stream:
                received_source = ws.add_source(stream, "Received original refresh publisher", source + ".iati")
            if received_source["id"] != source:
                raise InputError("The original publisher import returned another source identity")
        nested = ws.receive_portfolio(temp / "portfolios" / (manifest["portfolio"] + ".zip"))
        if (nested["portfolio"]["id"] != manifest["portfolio"]
                or nested["portfolio"]["revision"] != manifest["portfolioRevision"]):
            raise InputError("The full original portfolio packet has a different selected revision")
        rebuilt = work._reconstruct(doc)
        reports = report_files(work, rebuilt, temp / "reconstructed-report")
        if any({"bytes": regular(file, MAX_PACKET).st_size, "sha256": file_digest(file, MAX_PACKET)}
               != manifest["files"]["reports/" + name] for name, file in reports.items()):
            raise InputError("The complete readable refresh report does not reconstruct from its native history")
        row = ws.db.execute("SELECT body FROM iati_refresh_journals WHERE id=?", (doc["id"],)).fetchone()
        reused = False
        if row:
            existing = load_json(row["body"])
            if extends(existing, rebuilt):
                selected = existing
                reused = True
            elif extends(rebuilt, existing):
                selected = rebuilt
            else:
                raise InputError("Receiving would replace a different original refresh request, decision or baseline history")
        else:
            selected = rebuilt
        work._store(selected)
        return {"schema": "stellar-forge.iati-refresh-receiving.v1", "plan": current_plan(rebuilt),
                "currentPlan": current_plan(selected), "snapshot": manifest["snapshot"],
                "currentSnapshot": digest(json_bytes(selected)), "reconstructed": True, "reused": reused,
                "sourceCount": len(sources), "runCount": len(rebuilt["runs"]),
                "actionCount": len(rebuilt["actions"]), "historyCount": len(rebuilt["plans"]),
                "pendingRequest": clone(pending_action(selected)),
                "portfolio": native_selection(nested["portfolio"]),
                "reportFiles": sorted(reports)}
