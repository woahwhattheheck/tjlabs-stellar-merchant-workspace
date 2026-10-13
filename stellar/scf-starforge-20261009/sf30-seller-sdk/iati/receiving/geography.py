#!/usr/bin/env python3
"""MIT. Complete original IATI geography workflow on retained AidData Nigeria XML."""
from __future__ import annotations
import argparse
from contextlib import contextmanager
from copy import deepcopy
import csv
from decimal import Decimal
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import traceback
import xml.etree.ElementTree as ET
import zipfile

HERE = Path(__file__).resolve().parent
IATI = HERE.parent
REPO = IATI.parents[3]
sys.path.insert(0, str(IATI))
from iati_workspace import IatiWorkspace, InputError, json_bytes, load_json, private_write, file_digest
from geography import DEFINITION_FIELDS
from geography_source import CRS
from geography_portable import rows, snapshot
from publishing import csv_cell
from server import OperatorServer

SOURCE_SHA = "4eddc914f4e5a60ca869f3d52046cb55fc7bb44cabb829d78b2f510fbff4ca9e"
SCHEMA = "stellar-forge.iati-geography-native-receiving.v1"

def require(condition, message):
    if not condition:
        raise AssertionError(message)

def saved(path, value):
    private_write(path, json_bytes(value))
    return value

def edit(view, request_id, **changes):
    return {"requestId": request_id, "id": view["id"], "expectedRevision": view["revision"],
            **{key: deepcopy(view[key]) for key in DEFINITION_FIELDS}, **changes}

def original_workspace(path):
    return IatiWorkspace(path, create=not (path / "workspace.json").exists())

def complete_pages(geo, view, points=False):
    collected, offset = [], 0
    while True:
        page = geo.rows({"id": view["id"], "revision": view["revision"],
                         "offset": offset, "limit": 37}, points=points)
        require(page["offset"] == offset and page["limit"] == 37, "The native page changed its selection")
        collected.extend(page["rows"])
        if page["nextOffset"] is None:
            require(len(collected) == page["total"], "The original register lost rows between pages")
            return collected
        require(page["nextOffset"] == offset + len(page["rows"]) and page["nextOffset"] > offset,
                "The native row continuation did not advance")
        offset = page["nextOffset"]

@contextmanager
def console(ws):
    server = OperatorServer(ws)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=False)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        thread.join()
        server.server_close()

def native_command(argv, output):
    result = subprocess.run([str(value) for value in argv], stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=900)
    saved(output, {"argv": [str(value) for value in argv], "exit": result.returncode,
                   "stdout": result.stdout.decode("utf-8", "replace"),
                   "stderr": result.stderr.decode("utf-8", "replace")})
    require(result.returncode == 0, "Original command failed; open " + str(output))
    return load_json(result.stdout)

def boundary_input():
    def activity(ident, locations):
        return ('<iati-activity default-currency="USD"><iati-identifier>fixture:' + ident +
                '</iati-identifier><reporting-org ref="fixture:operator" type="21"><narrative>Fixture operator</narrative>'
                '</reporting-org><title><narrative>=1+1 &lt;/script&gt;</narrative></title>' +
                '<activity-status code="2"/>' + locations + '</iati-activity>')
    zero = ('<location ref="zero"><name><narrative>@Exact origin &lt;/script&gt;</narrative></name>'
            '<point srsName="' + CRS + '"><pos>0 0</pos></point><exactness code="1"/></location>')
    unknown = '<location ref="unknown"><point srsName="urn:other"><pos>10 20</pos></point></location>'
    repeated = ('<location ref="repeat"><name><narrative>Repeated place</narrative></name>'
                '<point srsName="' + CRS + '"><pos>1.250 -2.500</pos></point><exactness code="2"/></location>')
    multi = ('<location ref="multiple"><point srsName="' + CRS +
             '"><pos>10 20</pos><pos>30 40</pos></point></location>')
    return ('<iati-activities version="2.03">' + activity("points", zero + unknown + repeated + repeated + multi) +
            activity("absence", "") + '</iati-activities>').encode()

def run(output, browser_driver=None):
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    (output / "tmp").mkdir(mode=0o700, exist_ok=True)
    os.environ["TMPDIR"] = str(output / "tmp")
    import tempfile
    tempfile.tempdir = str(output / "tmp")
    node = os.environ.get("SF30_XML_NODE", "node")
    fixture = IATI / "examples" / "aiddata-nigeria-2016" / "iati_2.03_NigeriaAIMS_GeocodedResearchRelease.xml"
    metadata = load_json((fixture.parent / "aiddata-nigeria.json").read_bytes())
    raw = fixture.read_bytes()
    require(len(raw) == 309331 and hashlib.sha256(raw).hexdigest() == SOURCE_SHA,
            "Use the complete retained AidData Nigeria XML")
    document = ET.fromstring(raw)
    activity_nodes = document.findall("iati-activity")
    independent = {"activities": len(activity_nodes),
                   "locations": sum(len(activity.findall("location")) for activity in activity_nodes),
                   "activitiesWithoutLocation": sum(not activity.findall("location") for activity in activity_nodes)}
    independent["rows"] = independent["locations"] + independent["activitiesWithoutLocation"]
    require(document.get("version") == "2.03", "The publisher edition changed IATI version")
    result = {"schema": SCHEMA, "startedAt": time.time(), "source": metadata["source"],
              "independentXml": independent, "python": sys.version.split()[0],
              "node": subprocess.check_output([node, "--version"], text=True).strip(), "checks": []}
    owner_path, receiving_path, agent_path = output / "owner", output / "receiver", output / "agent-receiver"
    request1 = {"requestId": "geography-nigeria-original-7108-v1",
                "name": "AidData Nigeria AIMS — publisher geography review",
                "notes": metadata["databaseLicense"]["attributionNotice"],
                "sources": [SOURCE_SHA], "selection": {"activityIds": [], "language": ""},
                "acquisition": [{"source": SOURCE_SHA, "publisher": metadata["publisher"],
                                 "url": metadata["source"]["url"], "retrievedAt": "",
                                 "license": metadata["databaseLicense"]["name"],
                                 "citation": metadata["databaseLicense"]["originalReleaseCitation"]}],
                "review": {"status": "draft", "reviewer": "", "note": ""},
                "baselineRevision": None, "findings": []}
    with original_workspace(owner_path) as owner:
        with fixture.open("rb") as stream:
            source = owner.add_source(stream, metadata["label"], fixture.name)
        original_metadata = owner.source(SOURCE_SHA)
        portfolio = owner.save_portfolio({"requestId": "geography-nigeria-finance-7108-v1",
                                          "name": "AidData Nigeria AIMS original finance",
                                          "notes": metadata["databaseLicense"]["attributionNotice"],
                                          "sources": [SOURCE_SHA], "selection": {},
                                          "review": {"status": "draft", "reviewer": "", "note": ""}})
        request1["portfolio"] = {"id": portfolio["id"], "revision": portfolio["revision"]}
        geo = owner.geography
        first = geo.save(request1)
        require(geo.save(request1) == first, "An original save request did not replay its exact first result")
        require(geo.request(request1["requestId"])["review"] == first, "Original request lookup lost its first result")
        counts = first["report"]["counts"]
        for key, expected in independent.items():
            require(counts[key] == expected, "Native publisher coverage differs from XML: " + key)
        all_rows = complete_pages(geo, first)
        require(len(all_rows) == counts["rows"], "The complete real publisher register is incomplete")
        points = complete_pages(geo, first, points=True)
        require(len(points) == counts["mapped"], "The whole map does not match native mapped coverage")
        by_identity = {(item["source"], item["row_id"]): item for item in all_rows}
        require(len(by_identity) == counts["rows"], "Distinct native source/location identities collided")
        for item in points:
            original = by_identity[item["source"], item["row_id"]]
            require(original["coordinate_status"] == "valid" and original["srs_name"] == CRS,
                    "The map selected a location without its required source CRS")
            require(Decimal(item["latitude"]) == Decimal(original["position_text"].split()[0]) and
                    Decimal(item["longitude"]) == Decimal(original["position_text"].split()[1]),
                    "Latitude and longitude differ from original IATI axis order")
        target = all_rows[0]
        finding = {"source": SOURCE_SHA, "rowId": target["row_id"], "decision": "note",
                   "reviewer": "Native receiving operator",
                   "note": "Original source, location identity and coordinate semantics inspected in the complete workflow."}
        request2 = edit(first, "geography-nigeria-findings-7108-v2", findings=[finding], baselineRevision=1)
        second = geo.save(request2)
        compared = geo.compare({"id": first["id"], "beforeRevision": 1, "afterRevision": 2})
        require(compared["counts"]["unchanged"] == counts["rows"] and len(compared["findingChanges"]) == 1,
                "Named review changes altered the underlying publisher edition")
        third = geo.save(edit(second, "geography-nigeria-selection-7108-v3",
                              selection={"activityIds": [target["activity_id"]], "language": ""},
                              portfolio=None, baselineRevision=2))
        selection_change = geo.compare({"id": first["id"], "beforeRevision": 2, "afterRevision": 3})
        require(third["report"]["counts"]["activities"] == 1 and "selection" in selection_change["definitionChanges"],
                "The exact activity filter did not change the complete native comparison")
        try:
            owner.compare(second["editions"][0]["locations"]["id"], third["editions"][0]["locations"]["id"])
        except InputError:
            pass
        else:
            raise AssertionError("The original default comparison stopped requiring the same mapping")
        fourth = geo.save(edit(third, "geography-nigeria-restore-selection-7108-v4",
                               selection=second["selection"], portfolio=second["portfolio"], baselineRevision=2))
        geo.compare({"id": first["id"], "beforeRevision": 3, "afterRevision": 4})
        require(fourth["report"] == second["report"], "Restoring the complete selection did not restore its report")
        result["checks"].append("complete real publisher coverage, map pages, linked finance, named revisions and native selection comparison")
        descriptors = {kind: geo.export({"id": first["id"], "revision": 4, "format": kind})
                       for kind in ("packet", "geojson", "csv", "json", "html")}
        packet = Path(descriptors["packet"]["path"])
        with zipfile.ZipFile(packet) as archive:
            geojson = json.loads(archive.read("locations.geojson"), parse_float=Decimal)
            archived_rows = [load_json(line) for line in archive.read("locations.jsonl").splitlines()]
            csv_rows = list(csv.DictReader(io.StringIO(archive.read("locations.csv").decode())))
            require(len(geojson["features"]) == len(archived_rows) == len(csv_rows) == counts["rows"],
                    "Complete handover formats disagree about publisher coverage")
            require(sum(feature["geometry"] is not None for feature in geojson["features"]) == counts["mapped"],
                    "GeoJSON dropped unlocated records or invented a location")
            for feature, row in zip(geojson["features"], archived_rows):
                if feature["geometry"] is not None:
                    lon, lat = feature["geometry"]["coordinates"]
                    require(Decimal(str(lon)) == Decimal(row["longitude"]) and
                            Decimal(str(lat)) == Decimal(row["latitude"]),
                            "GeoJSON changed original longitude/latitude order or decimal value")
            require(archive.read("sources/" + SOURCE_SHA + ".iati") == raw,
                    "The geography packet changed the original publisher XML")
            require(load_json(archive.read("sources/" + SOURCE_SHA + ".json")) == original_metadata,
                    "The complete packet lost original publisher metadata")
        require(geo.export({"id": first["id"], "revision": 4, "format": "packet"}) == descriptors["packet"],
                "The exact completed export did not replay")
        # Simulate the real no-replace publication interval, then continue its
        # original same-inode private stage under the maintained export lease.
        stage = packet.parent / ("." + packet.name + ".iati-export.partial")
        if not stage.exists():
            os.link(packet, stage)
        resumed = geo.export({"id": first["id"], "revision": 4, "format": "packet"})
        require(not stage.exists() and packet.stat().st_nlink == 1 and resumed == descriptors["packet"],
                "An interrupted original packet publication did not continue")
        result["checks"].append("complete packet, original XML/source metadata, all data formats and exact publication continuation")
        saved(output / "original-request.json", request1)
        saved(output / "review.json", fourth)
        result["ownerReview"] = {"id": fourth["id"], "revision": 4}
        result["coverage"] = counts
        result["exports"] = descriptors
        result["comparison"] = selection_change
        with original_workspace(receiving_path) as receiver:
            with fixture.open("rb") as stream:
                receiver.add_source(stream, "Receiving operator source label", fixture.name)
            receiving_source = receiver.source(SOURCE_SHA)
            received = receiver.geography.receive({"path": packet})
            require(received["review"] == fourth and received["requests"] == 4,
                    "The independent receiver lost the exact review or original request history")
            require(receiver.geography.save(request1) == first,
                    "The first original request did not replay after independent receiving")
            require(receiver.source(SOURCE_SHA) == receiving_source and
                    receiver.geography.source_metadata(first["id"], SOURCE_SHA) == original_metadata,
                    "Receiving replaced local source labels or lost the review's original custody")
            repeat = receiver.geography.export({"id": first["id"], "revision": 4, "format": "packet"})
            require(Path(repeat["path"]).read_bytes() == packet.read_bytes(),
                    "The fresh receiver did not return the exact complete original archive")
            fifth = receiver.geography.save(edit(fourth, "geography-receiver-review-7108-v5",
                                                 notes=fourth["notes"] + "\nReceived in the independent original workspace."))
            updated = receiver.geography.export({"id": first["id"], "revision": fifth["revision"], "format": "packet"})
            with zipfile.ZipFile(updated["path"]) as archive:
                require(load_json(archive.read("sources/" + SOURCE_SHA + ".json")) == original_metadata,
                        "A received edit replaced original source metadata")
            result["receivedReview"] = {"id": fifth["id"], "revision": fifth["revision"]}
        # A small semantic fixture exercises zero, unknown CRS, multiple positions,
        # duplicate refs, spreadsheet text and HTML source text in the same engine.
        boundary = boundary_input()
        boundary_source = owner.add_source(io.BytesIO(boundary), "Geography semantic receiving fixture", "geography-boundaries.xml")
        boundary_view = geo.save({"requestId": "geography-boundaries-7108-v1",
                                   "name": "Native geography boundary semantics", "sources": [boundary_source["id"]]})
        boundary_rows = list(rows(geo, boundary_view))
        require(len(boundary_rows) == 6 and len({row["row_id"] for row in boundary_rows}) == 6,
                "Missing locations or duplicate refs collided in the native register")
        zero = next(row for row in boundary_rows if row["location_ref"] == "zero")
        require(zero["coordinate_status"] == "valid" and Decimal(zero["latitude"]) == Decimal(0)
                and Decimal(zero["longitude"]) == Decimal(0), "Zero coordinates were lost")
        require(next(row for row in boundary_rows if row["location_ref"] == "unknown")["coordinate_status"] == "invalid",
                "An unknown CRS became a fabricated map coordinate")
        require(next(row for row in boundary_rows if row["location_ref"] == "multiple")["coordinate_status"] == "invalid",
                "Multiple source positions became an invented point")
        boundary_csv = geo.export({"id": boundary_view["id"], "format": "csv"})
        boundary_html = geo.export({"id": boundary_view["id"], "format": "html"})
        with Path(boundary_csv["path"]).open(newline="") as stream:
            require(all(row["title"] == csv_cell("=1+1 </script>") for row in csv.DictReader(stream)),
                    "Derived spreadsheet text was not neutralized")
        html = Path(boundary_html["path"]).read_text()
        require('"title":"=1+1 \\u003c/script\\u003e"' in html,
                "Full source text was not retained inertly in the offline report")
        result["checks"].append("independent complete receiving, exact archive replay, source custody after editing and native coordinate/text boundaries")
        with original_workspace(agent_path) as agent_receiver:
            with console(owner) as owner_console, console(agent_receiver) as receiving_console:
                agent_selection = {"sourceRoot": str(REPO), "outputRoot": str(output / "agent"),
                                   "ownerConsoleUrl": owner_console.url, "receiverConsoleUrl": receiving_console.url,
                                   "source": SOURCE_SHA, "review": result["ownerReview"], "request": request1,
                                   "expected": {"rows": counts["rows"], "activities": counts["activities"],
                                                "mapped": counts["mapped"]},
                                   "packet": descriptors["packet"]}
                (output / "agent").mkdir(mode=0o700, exist_ok=True)
                native_input = output / "agent" / "selection.json"
                saved(native_input, agent_selection)
                result["agent"] = native_command([node, HERE / "geography.mjs", native_input], output / "agent-command.json")
                if browser_driver:
                    browser_root = output / "browser"
                    browser_root.mkdir(mode=0o700, exist_ok=True)
                    browser_input = browser_root / "browser-input.json"
                    saved(browser_input, {"sourceRoot": str(REPO), "outputRoot": str(browser_root),
                                           "consoleUrl": owner_console.url, "ownerWorkspace": str(owner_path),
                                           "source": SOURCE_SHA, "review": result["ownerReview"],
                                           "offlineHtml": descriptors["html"]["path"],
                                           "expected": agent_selection["expected"]})
                    result["browser"] = native_command([node, browser_driver, browser_input], output / "browser-command.json")
        result["checks"].append("original live HTTP console, typed client and complete MCP retained-file transfer")
        result["workspaceSha256"] = geo.workspace_sha256
    # The original CLI owns a normal cold open after the HTTP writer has closed.
    result["cli"] = native_command([sys.executable, "-B", IATI / "cli.py", "--workspace", owner_path,
                                     "geography-request", "--request-id", request1["requestId"]],
                                    output / "cli-command.json")
    require(result["cli"]["review"]["revision"] == 1, "The original cold CLI lost the first request's result")
    with original_workspace(owner_path) as reopened, original_workspace(receiving_path) as received_again:
        require(reopened.geography.workspace_sha256 == result["workspaceSha256"], "Cold open changed original workspace identity")
        require(reopened.geography.save(request1)["revision"] == 1, "Cold open changed original request replay")
        require(received_again.geography.review(first["id"])["revision"] == 5,
                "The independent edited review did not survive cold reopen")
        require(received_again.geography.source_metadata(first["id"], SOURCE_SHA) == original_metadata,
                "Source custody was lost on independent cold reopen")
        result["binding"] = __import__("managed").inspect_binding(str(owner_path))
    result["checks"].append("original cold CLI, independent edited reopen and both managed source bindings")
    result["status"] = "COMPLETE"
    result["finishedAt"] = time.time()
    saved(output / "complete-receiving.json", result)
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--browser-driver")
    args = parser.parse_args()
    os.umask(0o077)
    output = Path(args.output).absolute()
    try:
        result = run(output, args.browser_driver)
    except BaseException as error:
        output.mkdir(mode=0o700, parents=True, exist_ok=True)
        saved(output / "receiving-error.json", {"schema": SCHEMA, "error": str(error),
                                               "type": type(error).__name__, "traceback": traceback.format_exc(),
                                               "observedAt": time.time()})
        raise
    print(json.dumps({"status": result["status"], "coverage": result["coverage"],
                      "ownerReview": result["ownerReview"], "receivedReview": result["receivedReview"],
                      "packet": result["exports"]["packet"], "checks": result["checks"],
                      "result": str(output / "complete-receiving.json")}, ensure_ascii=False), flush=True)

if __name__ == "__main__":
    main()
