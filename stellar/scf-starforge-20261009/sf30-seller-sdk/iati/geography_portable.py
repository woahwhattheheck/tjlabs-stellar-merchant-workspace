"""MIT. Complete IATI geography handovers and original-workspace receiving."""
from __future__ import annotations

import csv
from decimal import Decimal
import hashlib
import io
import math
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import zipfile

from geography import SCHEMA, COMPARE, DEFINITION_FIELDS, exact_object
from geography_source import CONTRACT
from iati_source import FIELDS, InputError, MAX_SOURCE
from iati_workspace import (MAX_PACKET, MAX_METADATA, MAX_FILES, export_lease, packet_write,
                            reconcile_export_stage, stable_build)
from publishing import csv_cell
from workspace import checked_id, digest, file_digest, json_bytes, load_json, private_write, regular, sync_dir

PACKET = "stellar-forge.iati-geography-packet.v1"
DATA = "stellar-forge.iati-geography-data.v1"
FORMATS = {
    "packet": ("zip", "application/zip"),
    "geojson": ("geojson", "application/geo+json"),
    "csv": ("csv", "text/csv; charset=utf-8"),
    "json": ("json", "application/json"),
    "html": ("html", "text/html; charset=utf-8"),
}
REQUIRED = frozenset({
    "review.json", "history.json", "requests.json", "comparisons.json",
    "source-contract.json", "acquisition.json", "locations.jsonl", "locations.csv",
    "locations.geojson", "review.html", "README.md",
})

def snapshot(geo, ident, revision=None):
    view = geo.review(ident, revision)
    geo.report(view["id"], view["revision"])
    history = geo.history(view["id"], view["revision"])
    requests = []
    for item in geo.db.execute(
            "SELECT * FROM iati_geo_requests WHERE review_id=? AND revision<=? ORDER BY revision,id",
            (view["id"], view["revision"])):
        requests.append({**dict(item), "body": load_json(item["body"])})
    comparisons = [load_json(item["body"]) for item in geo.db.execute(
        "SELECT body FROM iati_geo_comparisons WHERE review_id=? AND after_revision<=? ORDER BY id",
        (view["id"], view["revision"]))]
    sources = sorted({edition["source"] for item in history for edition in item["editions"]})
    source_metadata = {source: geo.source_metadata(view["id"], source) for source in sources}
    identity = {"schema": PACKET, "history": history, "requests": requests,
                "comparisons": comparisons, "contract": CONTRACT, "sourceMetadata": source_metadata}
    return {"view": view, "history": history, "requests": requests,
            "comparisons": comparisons, "sourceMetadata": source_metadata,
            "selectionSha256": digest(json_bytes(identity))}

def rows(geo, view):
    findings = {(item["source"], item["rowId"]): item for item in view["findings"]}
    for edition in view["editions"]:
        build = geo.ws.build_view(edition["locations"]["id"])
        if stable_build(build) != stable_build(edition["locations"]):
            raise InputError("A geography export selected another original edition")
        for row in geo.ws._rows(build):
            yield {"source": edition["source"], **row,
                   "finding": findings.get((edition["source"], row["row_id"]))}

def open_output(path):
    return os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb")

def checked_size(path):
    regular(path, MAX_PACKET)
    return path

def feature(row):
    properties = {}
    for key, value in row.items():
        if key.endswith("_json"):
            properties[key[:-5]] = load_json(value)
        else:
            properties[key] = value
    geometry = b"null"
    if row["coordinate_status"] == "valid":
        latitude, longitude = Decimal(row["latitude"]), Decimal(row["longitude"])
        if (not latitude.is_finite() or not longitude.is_finite() or
                not Decimal("-90") <= latitude <= Decimal("90") or
                not Decimal("-180") <= longitude <= Decimal("180")):
            raise InputError("A mapped native location has invalid coordinates")
        geometry = (b'{"type":"Point","coordinates":[' + str(longitude).encode("ascii") +
                    b"," + str(latitude).encode("ascii") + b"]}")
    return (b'{"type":"Feature","id":' + json_bytes(row["source"] + ":" + row["row_id"]).rstrip(b"\n") +
            b',"geometry":' + geometry + b',"properties":' + json_bytes(properties).rstrip(b"\n") + b"}")

def write_data(geo, view, path, format):
    if format == "csv":
        fields = ["source", *FIELDS["locations"], "finding_decision", "finding_reviewer", "finding_note"]
        with open_output(path) as binary:
            with io.TextIOWrapper(binary, encoding="utf-8", newline="", write_through=True) as stream:
                writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
                writer.writeheader()
                for row in rows(geo, view):
                    finding = row.pop("finding") or {}
                    selected = {**row, **{"finding_" + key: finding.get(key, "")
                                          for key in ("decision", "reviewer", "note")}}
                    writer.writerow({key: csv_cell(value) for key, value in selected.items()})
                    if stream.tell() > MAX_PACKET:
                        raise InputError("The complete geography CSV exceeds 4 GiB")
                stream.flush(); os.fsync(stream.fileno())
        return checked_size(path)
    with open_output(path) as stream:
        if format == "json":
            stream.write(b'{"schema":' + json_bytes(DATA).rstrip(b"\n") +
                         b',"review":' + json_bytes(view).rstrip(b"\n") +
                         b',"contract":' + json_bytes(CONTRACT).rstrip(b"\n") + b',"rows":[')
        elif format == "geojson":
            stream.write(b'{"type":"FeatureCollection","iati":' +
                         json_bytes({"review": view, "contract": CONTRACT}).rstrip(b"\n") + b',"features":[')
        elif format != "jsonl":
            raise InputError("Unknown complete geography data format")
        first = True
        for row in rows(geo, view):
            if format == "jsonl":
                stream.write(json_bytes(row))
            else:
                if not first:
                    stream.write(b",")
                stream.write(feature(row) if format == "geojson" else json_bytes(row).rstrip(b"\n"))
            first = False
            if stream.tell() > MAX_PACKET:
                raise InputError("The complete geography data file exceeds 4 GiB")
        if format != "jsonl":
            stream.write(b"]}\n")
        stream.flush(); os.fsync(stream.fileno())
    return checked_size(path)

def write_readme(view, path):
    body = """# IATI geography review handover

Open review.html for the complete offline map, location register, record details,
source attribution and review decisions. Locations without valid reported
coordinates remain in the register and in the GeoJSON with null geometry.
The source contract explains latitude/longitude order, accepted CRS, exactness
and activity/location association. Financial amounts remain in the original
linked portfolio and are not allocated across locations.

This archive carries every original publisher XML edition, original native
mapping/build packet, selected review and preceding revisions, complete original
save requests, saved comparison changes, acquisition metadata and the linked
financial portfolio history when selected. locations.jsonl, locations.csv and
locations.geojson contain the complete selected edition. Derived CSV text is
neutralized for spreadsheet opening; JSON, GeoJSON and publisher XML retain the
original values. Complete source inventories and original labels remain attached
to this review after receiving and later editing.

Receive the ZIP with the original application's geography-receive command, the
Geography panel, or its typed HTTP client. The receiving workspace rebuilds the
native editions, checks the complete review history and original request bodies,
and retains the same review identity and revisions. Replaying an original
requestId returns its original saved revision. A new edit selects the current
revision and uses a new requestId. The offline HTML can download that complete
edit request for the original application.

Review: {id}
Revision: {revision}
Name: {name}
Review status: {status}
Reviewer: {reviewer}

Source attribution is retained in acquisition.json and displayed in review.html.
Publisher XML is complete in sources/. Native edition packets are in packets/.
Any linked financial portfolios are complete in portfolios/. Full native
comparison records are in changes/. manifest.json identifies every member's
complete bytes and SHA-256.
""".format(id=view["id"], revision=view["revision"], name=view["name"],
           status=view["review"]["status"], reviewer=view["review"]["reviewer"])
    private_write(path, body.encode("utf-8"))
    return path

def handover_files(geo, view, directory):
    directory.mkdir(mode=0o700, exist_ok=True)
    result = {}
    for name, value in (("review.json", view), ("source-contract.json", CONTRACT),
                        ("acquisition.json", view["acquisition"])):
        private_write(directory / name, json_bytes(value))
        result[name] = directory / name
    for name, format in (("locations.jsonl", "jsonl"), ("locations.csv", "csv"),
                         ("locations.geojson", "geojson")):
        result[name] = write_data(geo, view, directory / name, format)
    from geography_html import write_html
    result["review.html"] = write_html(geo, view, directory / "review.html")
    result["README.md"] = write_readme(view, directory / "README.md")
    return result

def output_directory(geo):
    path = geo.ws.root / "exports" / "geography"
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or
            (os.name == "posix" and (info.st_uid != os.getuid() or info.st_mode & 0o077))):
        raise InputError("The geography export directory must be private and owned by the operator")
    return path

def default_output(geo, selected, format):
    view = selected["view"]
    extension = FORMATS[format][0]
    return output_directory(geo) / (
        f'{view["id"]}-r{view["revision"]}-{selected["selectionSha256"][:16]}.{extension}')

def selected_output(geo, selected, format, supplied=None):
    if supplied is None:
        return default_output(geo, selected, format)
    if not isinstance(supplied, (str, Path)) or not str(supplied):
        raise InputError("Choose an existing output directory and a complete filename")
    output = Path(supplied).expanduser().absolute()
    if output.parent.resolve(strict=True) != output.parent or not output.name:
        raise InputError("Choose an original output directory without linked parents")
    return output

def publish_file(source, output):
    source = Path(source)
    size = regular(source, MAX_PACKET).st_size
    sha = file_digest(source, MAX_PACKET)
    stage = output.parent / ("." + output.name + ".geography.partial")
    with export_lease(output):
        if stage.exists() or stage.is_symlink():
            info = stage.lstat()
            if (not stat.S_ISREG(info.st_mode) or
                    (os.name == "posix" and (info.st_uid != os.getuid() or info.st_mode & 0o077))):
                raise InputError("The original geography export stage is not private")
            if output.exists() and not output.is_symlink() and os.path.samefile(stage, output):
                if info.st_nlink != 2:
                    raise InputError("The published geography export has additional links")
                stage.unlink(); sync_dir(output.parent)
            else:
                regular(stage, MAX_PACKET)
                stage.rename(stage.with_name(stage.name + ".retained-" + os.urandom(8).hex()))
                sync_dir(output.parent)
        if output.exists() or output.is_symlink():
            if regular(output, MAX_PACKET).st_size != size or file_digest(output, MAX_PACKET) != sha:
                raise InputError("The existing output contains another complete handover; choose another filename")
            return output
        with source.open("rb") as incoming, open_output(stage) as outgoing:
            shutil.copyfileobj(incoming, outgoing, 65536)
            outgoing.flush(); os.fsync(outgoing.fileno())
        if regular(stage, MAX_PACKET).st_size != size or file_digest(stage, MAX_PACKET) != sha:
            raise InputError("The complete geography export changed while publishing")
        os.link(stage, output); sync_dir(output.parent)
        stage.unlink(); sync_dir(output.parent)
    return output

def reconcile_completed_output(output):
    """Finish only the two original private no-replace publication stages."""
    with export_lease(output):
        for suffix in (".iati-export.partial", ".geography.partial"):
            stage = output.parent / ("." + output.name + suffix)
            reconcile_export_stage(output, stage)

def artifact_id(selected, format, output):
    return digest(json_bytes({"selectionSha256": selected["selectionSha256"],
                              "format": format, "path": str(output)}))

def descriptor(geo, selected, format, output):
    ident = artifact_id(selected, format, output)
    value = {"id": ident, "path": str(output), "filename": output.name,
             "bytes": regular(output, MAX_PACKET).st_size, "sha256": file_digest(output, MAX_PACKET),
             "format": format, "contentType": FORMATS[format][1],
             "selectionSha256": selected["selectionSha256"],
             "review": selected["view"]["id"], "revision": selected["view"]["revision"],
             "url": "/api/iati/geography/download/" + ident}
    with geo.db:
        prior = geo.db.execute("SELECT body FROM iati_geo_exports WHERE id=?", (ident,)).fetchone()
        if prior is not None and load_json(prior["body"]) != value:
            raise InputError("The original geography export descriptor changed")
        geo.db.execute("INSERT OR IGNORE INTO iati_geo_exports VALUES(?,?)",
                       (ident, json_bytes(value).decode()))
    return value

def download(geo, ident):
    checked_id(ident)
    row = geo.db.execute("SELECT body FROM iati_geo_exports WHERE id=?", (ident,)).fetchone()
    if row is None:
        raise InputError("Unknown completed geography export")
    value = load_json(row["body"])
    path = Path(value["path"])
    if regular(path, MAX_PACKET).st_size != value["bytes"] or file_digest(path, MAX_PACKET) != value["sha256"]:
        raise InputError("The original complete geography export changed")
    return value

def export(geo, raw):
    exact_object(raw, ("id", "revision", "format", "output"), "Geography export")
    format = raw.get("format", "packet")
    if format not in FORMATS:
        raise InputError("Choose packet, geojson, csv, json or html")
    selected = snapshot(geo, raw.get("id"), raw.get("revision"))
    output = selected_output(geo, selected, format, raw.get("output"))
    reconcile_completed_output(output)
    ident = artifact_id(selected, format, output)
    if geo.db.execute("SELECT 1 FROM iati_geo_exports WHERE id=?", (ident,)).fetchone():
        return download(geo, ident)
    if format == "packet" and (output.exists() or output.is_symlink()):
        manifest = read_manifest(output)
        if (manifest.get("selectionSha256") != selected["selectionSha256"] or
                manifest.get("review") != selected["view"]["id"] or
                manifest.get("revision") != selected["view"]["revision"]):
            raise InputError("The existing output contains another geography selection")
        receive(geo, {"path": output})
        return descriptor(geo, selected, format, output)
    with geo.ws.scratch() as temp:
        if format != "packet":
            path = temp / ("geography." + FORMATS[format][0])
            if format == "html":
                from geography_html import write_html
                write_html(geo, selected["view"], path)
            else:
                write_data(geo, selected["view"], path, format)
            publish_file(path, output)
        else:
            sources = handover_files(geo, selected["view"], temp)
            for name, value in (("history.json", selected["history"]),
                                ("requests.json", selected["requests"]),
                                ("comparisons.json", selected["comparisons"])):
                private_write(temp / name, json_bytes(value))
                sources[name] = temp / name
            for directory in ("packets", "sources", "portfolios", "changes"):
                (temp / directory).mkdir(mode=0o700)
            editions = {edition["locations"]["id"]: edition for view in selected["history"]
                        for edition in view["editions"]}
            for build in sorted(editions):
                path = temp / "packets" / (build + ".zip")
                geo.ws.export_packet(build, path)
                sources["packets/" + path.name] = path
            for source in sorted({edition["source"] for edition in editions.values()}):
                path = geo.ws.root / "sources" / (source + ".iati")
                if file_digest(path, MAX_SOURCE) != source:
                    raise InputError("A complete original publisher source changed")
                sources["sources/" + source + ".iati"] = path
                metadata = temp / "sources" / (source + ".json")
                private_write(metadata, json_bytes(selected["sourceMetadata"][source]))
                sources["sources/" + metadata.name] = metadata
            portfolios = {(view["portfolio"]["id"], view["portfolio"]["revision"])
                          for view in selected["history"] if view["portfolio"] is not None}
            for portfolio, revision in sorted(portfolios):
                path = temp / "portfolios" / f"{portfolio}-r{revision}.zip"
                geo.ws.export_portfolio(portfolio, path, revision)
                sources["portfolios/" + path.name] = path
            native_comparisons = {item["native"]["id"] for comparison in selected["comparisons"]
                                  for item in comparison["comparisons"]}
            for native in sorted(native_comparisons):
                sources["changes/" + native + ".jsonl"] = geo.ws.comparison_file(native)
            packet_write(output, sources, PACKET, {
                "review": selected["view"]["id"], "revision": selected["view"]["revision"],
                "selectionSha256": selected["selectionSha256"]})
    return descriptor(geo, selected, format, output)


def read_manifest(path):
    regular(Path(path), MAX_PACKET)
    with zipfile.ZipFile(path) as archive:
        selected = [item for item in archive.infolist() if item.filename == "manifest.json"]
        if len(selected) != 1 or selected[0].file_size > MAX_METADATA:
            raise InputError("The complete geography packet needs one bounded manifest")
        return load_json(archive.read(selected[0]))

def extract_packet(path, directory):
    regular(path, MAX_PACKET)
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        names = [item.filename for item in infos]
        if len(names) != len(set(names)) or len(names) > MAX_FILES + 1:
            raise InputError("The geography packet repeats a member or exceeds its file capacity")
        selected = [item for item in infos if item.filename == "manifest.json"]
        if len(selected) != 1 or selected[0].file_size > MAX_METADATA:
            raise InputError("The geography packet needs one complete bounded manifest")
        manifest = load_json(archive.read(selected[0]))
        if (not isinstance(manifest, dict) or
                set(manifest) != {"schema", "files", "review", "revision", "selectionSha256"} or
                manifest["schema"] != PACKET or not isinstance(manifest["files"], dict) or
                set(manifest["files"]) != set(names) - {"manifest.json"} or
                type(manifest["revision"]) is not int or manifest["revision"] < 1):
            raise InputError("The geography manifest does not identify one complete review packet")
        checked_id(manifest["review"]); checked_id(manifest["selectionSha256"])
        expanded = 0
        for info in infos:
            name = info.filename
            parsed = PurePosixPath(name)
            if (not name or "\\" in name or "\x00" in name or parsed.is_absolute() or
                    str(parsed) != name or any(part in {"", ".", ".."} for part in parsed.parts) or
                    info.flag_bits & 1 or info.is_dir() or
                    stat.S_ISLNK(info.external_attr >> 16) or
                    info.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}):
                raise InputError("The geography packet contains an invalid original member")
            maximum = MAX_METADATA if name.endswith(".json") else MAX_SOURCE if name.endswith(".iati") else MAX_PACKET
            expanded += info.file_size
            if info.file_size > maximum or expanded > MAX_PACKET:
                raise InputError("The complete geography packet exceeds its expanded size capacity")
            if name == "manifest.json":
                continue
            declared = manifest["files"][name]
            if (not isinstance(declared, dict) or set(declared) != {"bytes", "sha256"} or
                    type(declared["bytes"]) is not int or declared["bytes"] != info.file_size):
                raise InputError("The complete geography member size differs: " + name)
            checked_id(declared["sha256"])
            target = directory / name
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            actual = hashlib.sha256()
            total = 0
            with archive.open(info) as incoming, open_output(target) as outgoing:
                while block := incoming.read(65536):
                    total += len(block)
                    if total > declared["bytes"]:
                        raise InputError("The original member expanded beyond its complete declaration")
                    actual.update(block); outgoing.write(block)
                outgoing.flush(); os.fsync(outgoing.fileno())
            if total != declared["bytes"] or actual.hexdigest() != declared["sha256"]:
                raise InputError("The complete geography member bytes differ: " + name)
    return manifest

def expected_members(history, comparisons):
    expected = set(REQUIRED)
    for view in history:
        for edition in view["editions"]:
            source, build = checked_id(edition["source"]), checked_id(edition["locations"]["id"])
            expected.update(("sources/" + source + ".iati", "sources/" + source + ".json",
                             "packets/" + build + ".zip"))
        if view["portfolio"] is not None:
            selected = view["portfolio"]
            ident = checked_id(selected["id"])
            revision = selected["revision"]
            if type(revision) is not int or revision < 1:
                raise InputError("A linked portfolio revision is invalid")
            expected.add(f"portfolios/{ident}-r{revision}.zip")
    for comparison in comparisons:
        for pair in comparison["comparisons"]:
            expected.add("changes/" + checked_id(pair["native"]["id"]) + ".jsonl")
    return expected

def history_envelope(manifest, history, selected):
    keys = {"schema", "id", "revision", *DEFINITION_FIELDS, "editions", "report",
            "definitionSha256", "created", "updated", "previousRevision"}
    if (not isinstance(history, list) or len(history) != manifest["revision"] or not history or
            selected != history[-1] or selected.get("id") != manifest["review"] or
            selected.get("revision") != manifest["revision"]):
        raise InputError("The complete geography history does not end at the selected review")
    created, updated = None, None
    prior = {}
    for revision, view in enumerate(history, 1):
        if (not isinstance(view, dict) or set(view) != keys or view["schema"] != SCHEMA or
                view["id"] != manifest["review"] or type(view["revision"]) is not int or
                view["revision"] != revision or view["previousRevision"] != (revision - 1 if revision > 1 else None) or
                not isinstance(view["editions"], list)):
            raise InputError("The received geography history is not complete and contiguous")
        checked_id(view["definitionSha256"])
        for field in ("created", "updated"):
            stamp = view[field]
            if type(stamp) not in (int, float) or not math.isfinite(stamp) or stamp < 0:
                raise InputError("A geography history timestamp is invalid")
        if revision == 1:
            created, updated = view["created"], view["created"]
        if view["created"] != created or view["updated"] < updated:
            raise InputError("The geography history timestamps contradict its revision order")
        updated = view["updated"]
        prior[revision] = view
    return prior

def request_definition(geo, view, prior):
    raw = {"requestId": "geography-receive-check-" + str(view["revision"]),
           **{key: view[key] for key in DEFINITION_FIELDS}}
    if view["revision"] > 1:
        raw.update(id=view["id"], expectedRevision=view["revision"] - 1)
    _, _, _, definition, plan = geo._definition(raw, prior_revisions=prior)
    if (definition != {key: view[key] for key in DEFINITION_FIELDS} or
            digest(json_bytes(definition)) != view["definitionSha256"]):
        raise InputError("The complete saved geography definition differs from its original request")
    return definition, plan

def check_requests(geo, history, requests, prior):
    if not isinstance(requests, list) or len(requests) != len(history):
        raise InputError("The packet must retain the complete original request for every saved revision")
    expected_fields = {"id", "request_sha", "review_id", "revision", "body"}
    seen_ids, seen_revisions = set(), set()
    for item in requests:
        if (not isinstance(item, dict) or set(item) != expected_fields or
                not isinstance(item["body"], dict) or type(item["revision"]) is not int or
                item["revision"] not in prior or item["revision"] in seen_revisions or
                item["id"] in seen_ids or item["review_id"] != history[-1]["id"]):
            raise InputError("The original geography request history is incomplete or inconsistent")
        checked_id(item["request_sha"])
        view = prior[item["revision"]]
        request, ident, expected, definition, _ = geo._definition(item["body"], prior_revisions=prior)
        if (request != item["id"] or digest(json_bytes(item["body"])) != item["request_sha"] or
                definition != {key: view[key] for key in DEFINITION_FIELDS} or
                (view["revision"] == 1 and (ident is not None or expected is not None)) or
                (view["revision"] > 1 and (ident != view["id"] or expected != view["revision"] - 1))):
            raise InputError("An original save request does not reproduce its saved geography revision")
        seen_ids.add(request); seen_revisions.add(view["revision"])
    if requests != sorted(requests, key=lambda row: (row["revision"], row["id"])):
        raise InputError("The original geography request order differs")

def commit_history(geo, history, requests, comparisons, source_metadata):
    for view in history:
        existing = geo.db.execute("SELECT body FROM iati_geo_reviews WHERE id=? AND revision=?",
                                  (view["id"], view["revision"])).fetchone()
        if existing is not None and load_json(existing["body"]) != view:
            raise InputError("This workspace has a different saved revision; edit its current geography review with the returned findings")
    for item in requests:
        old = geo.db.execute("SELECT * FROM iati_geo_requests WHERE id=?", (item["id"],)).fetchone()
        if old is not None:
            retained = {**dict(old), "body": load_json(old["body"])}
            if retained != item:
                raise InputError("This original requestId already identifies a different saved action")
    for comparison in comparisons:
        old = geo.db.execute("SELECT body FROM iati_geo_comparisons WHERE id=?", (comparison["id"],)).fetchone()
        if old is not None and load_json(old["body"]) != comparison:
            raise InputError("This original comparison ID already identifies another complete result")
    with geo.db:
        geo._capture_sources(history[-1]["id"], source_metadata, supplied=source_metadata)
        for view in history:
            if not geo.db.execute("SELECT 1 FROM iati_geo_reviews WHERE id=? AND revision=?",
                                  (view["id"], view["revision"])).fetchone():
                geo._insert(view)
        for item in requests:
            geo.db.execute("INSERT OR IGNORE INTO iati_geo_requests VALUES(?,?,?,?,?)",
                           (item["id"], item["request_sha"], item["review_id"], item["revision"],
                            json_bytes(item["body"]).decode()))
        for comparison in comparisons:
            geo.db.execute("INSERT OR IGNORE INTO iati_geo_comparisons VALUES(?,?,?,?,?)",
                           (comparison["id"], comparison["review"], comparison["beforeRevision"],
                            comparison["afterRevision"], json_bytes(comparison).decode()))

def receive(geo, raw):
    try:
        return receive_complete(geo, raw)
    except InputError:
        raise
    except (KeyError, TypeError, ValueError, zipfile.BadZipFile, zipfile.LargeZipFile) as error:
        raise InputError("The complete geography packet has an invalid record: " + str(error)) from error

def receive_complete(geo, raw):
    exact_object(raw, ("path",), "Geography packet receive")
    if not isinstance(raw.get("path"), (str, Path)) or not str(raw["path"]):
        raise InputError("Select the complete original geography packet path")
    path = Path(raw["path"]).expanduser().absolute()
    original_sha = file_digest(path, MAX_PACKET)
    with geo.ws.scratch() as temp:
        manifest = extract_packet(path, temp)
        def data(name):
            return load_json((temp / name).read_bytes())
        if not REQUIRED <= set(manifest["files"]):
            raise InputError("The geography packet is missing complete handover members")
        history, selected, requests, comparisons = (
            data("history.json"), data("review.json"), data("requests.json"), data("comparisons.json"))
        if data("source-contract.json") != CONTRACT or not isinstance(comparisons, list):
            raise InputError("The complete geography source contract or comparison history differs")
        prior = history_envelope(manifest, history, selected)
        if expected_members(history, comparisons) != set(manifest["files"]):
            raise InputError("The geography packet has missing or unrelated original editions")
        sources = {edition["source"] for view in history for edition in view["editions"]}
        source_metadata = {}
        for source in sorted(sources):
            source_file = temp / "sources" / (source + ".iati")
            metadata = data("sources/" + source + ".json")
            if (file_digest(source_file, MAX_SOURCE) != source or not isinstance(metadata, dict) or
                    set(metadata) != {"id", "label", "name", "bytes", "inventory", "created"} or
                    metadata["id"] != source or type(metadata["bytes"]) is not int or
                    metadata["bytes"] != source_file.stat().st_size or
                    not isinstance(metadata["inventory"], dict) or
                    not isinstance(metadata["label"], str) or not metadata["label"].strip() or
                    len(metadata["label"]) > 160 or not isinstance(metadata["name"], str) or
                    len(metadata["name"]) > 160 or
                    Path(metadata["name"].replace("\\", "/")).name != metadata["name"] or
                    type(metadata["created"]) not in (int, float) or
                    not math.isfinite(metadata["created"]) or metadata["created"] < 0):
                raise InputError("The original source XML and its complete inventory differ")
            source_metadata[source] = metadata
        identity = {"schema": PACKET, "history": history, "requests": requests,
                    "comparisons": comparisons, "contract": CONTRACT, "sourceMetadata": source_metadata}
        if digest(json_bytes(identity)) != manifest["selectionSha256"]:
            raise InputError("The complete geography selection and source metadata do not match its manifest")
        portfolios = {(view["portfolio"]["id"], view["portfolio"]["revision"])
                      for view in history if view["portfolio"] is not None}
        for ident, revision in sorted(portfolios):
            geo.ws.receive_portfolio(temp / "portfolios" / f"{ident}-r{revision}.zip")
            geo.ws.portfolio(ident, revision)
        builds = {edition["locations"]["id"] for view in history for edition in view["editions"]}
        for build in sorted(builds):
            imported = geo.ws.import_packet(temp / "packets" / (build + ".zip"))
            if not isinstance(imported, dict) or imported.get("build", {}).get("id") != build:
                raise InputError("An original geography native packet reconstructed a different edition")
        for source, metadata in source_metadata.items():
            actual = geo.ws.source(source)
            if any(actual[key] != metadata[key] for key in ("id", "bytes", "inventory")):
                raise InputError("The original full source inventory did not reproduce from its publisher XML")
        for view in history:
            definition, plan = request_definition(geo, view, prior)
            mapped = geo.ws.save_plan(plan)
            if (len(view["editions"]) != len(definition["sources"]) or
                    [edition["source"] for edition in view["editions"]] != definition["sources"]):
                raise InputError("A complete geography review selected different publisher editions")
            for edition in view["editions"]:
                if set(edition) != {"source", "locations"}:
                    raise InputError("An original geography edition has unexpected fields")
                actual = geo.ws.build(edition["source"], mapped["id"])
                if stable_build(actual) != stable_build(edition["locations"]):
                    raise InputError("The complete geography native mapping did not reproduce its saved edition")
            if geo._summary(view["editions"], view["findings"], view["portfolio"]) != view["report"]:
                raise InputError("The complete original geography report did not reproduce")
        check_requests(geo, history, requests, prior)
        seen = set()
        for comparison in comparisons:
            if (comparison.get("schema") != COMPARE or comparison.get("review") != selected["id"] or
                    type(comparison.get("beforeRevision")) is not int or
                    type(comparison.get("afterRevision")) is not int or
                    comparison["beforeRevision"] not in prior or comparison["afterRevision"] not in prior or
                    comparison["id"] in seen):
                raise InputError("The original comparison history is inconsistent")
            supplied = [pair for pair in comparison["pairs"] if pair["before"] != pair["after"]]
            actual = geo._compare(prior[comparison["beforeRevision"]], prior[comparison["afterRevision"]], supplied)
            if actual != comparison:
                raise InputError("The original full geography comparison did not reproduce")
            for pair in comparison["comparisons"]:
                native = pair["native"]["id"]
                original = temp / "changes" / (native + ".jsonl")
                rebuilt = geo.ws.comparison_file(native)
                if (regular(original, MAX_PACKET).st_size != regular(rebuilt, MAX_PACKET).st_size or
                        file_digest(original, MAX_PACKET) != file_digest(rebuilt, MAX_PACKET)):
                    raise InputError("The complete native comparison changes differ")
            seen.add(comparison["id"])
        if comparisons != sorted(comparisons, key=lambda row: row["id"]):
            raise InputError("The complete saved comparison order differs")
        if data("acquisition.json") != selected["acquisition"]:
            raise InputError("The complete source attribution differs from the selected review")
        regenerated = handover_files(geo, selected, temp / "reconstructed-handover")
        for name, rebuilt in regenerated.items():
            expected = manifest["files"][name]
            if regular(rebuilt, MAX_PACKET).st_size != expected["bytes"] or file_digest(rebuilt, MAX_PACKET) != expected["sha256"]:
                raise InputError("The complete human-readable geography handover differs: " + name)
        if file_digest(path, MAX_PACKET) != original_sha:
            raise InputError("The complete original geography packet changed during receiving")
        commit_history(geo, history, requests, comparisons, source_metadata)
        received = {"view": selected, "history": history, "requests": requests,
                    "comparisons": comparisons, "sourceMetadata": source_metadata,
                    "selectionSha256": manifest["selectionSha256"]}
        # Retain the exact original archive. Additional comparisons already in
        # this workspace remain intact and belong to a subsequent complete export.
        output = default_output(geo, received, "packet")
        publish_file(path, output)
        packet = descriptor(geo, received, "packet", output)
        return {"schema": "stellar-forge.iati-geography-receive.v1", "review": geo.review(selected["id"], selected["revision"]),
                "history": history, "comparisons": comparisons, "requests": len(requests),
                "sourceCount": len(sources), "packet": packet}
