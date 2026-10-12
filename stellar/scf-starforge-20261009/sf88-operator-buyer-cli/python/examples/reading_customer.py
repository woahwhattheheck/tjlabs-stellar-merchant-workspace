"""Operate a full received-file reading project using authored office source files.

Creates the original SF88 inbox snapshot (no provider, purchase or payment calls),
receives and searches complete sources, edits a reading list, publishes through
the native collection writer, hands over all bytes, deletes the sender and edits
an independently received project. Output paths must be new.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import threading
import time

from stellar_forge_buyer.review_library import ResourceLibrary
from stellar_forge_buyer.reading_workspace import ReadingWorkspace, ReadingError
from stellar_forge_buyer.reading_delivery import export_project, receive_project, export_report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkout", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--rows", type=int, default=60000)
    a = parser.parse_args()
    if not 20000 <= a.rows <= 1000000:
        parser.error("--rows must be between 20,000 and 1,000,000")
    root = a.out.resolve()
    root.mkdir(mode=0o700)
    sender, files, delivered = root / "sender", root / "sender" / "files", root / "delivered"
    files.mkdir(parents=True, mode=0o700)
    delivered.mkdir(mode=0o700)
    notes = files / "Service operations — field notes.txt"
    with notes.open("w", encoding="utf-8", newline="") as stream:
        stream.write("Service operations reading example\nAuthored source records for this editable customer example.\n\n")
        areas = ["North collection area", "Central service district", "West river corridor", "East industrial district"]
        activities = ["Scheduled inspection recorded; photographs attached to the daily record.",
                      "A missing instrument label was referred to the asset records coordinator.",
                      "Access timing was updated after coordination with the site operator.",
                      "The field sheet and maintenance order were reconciled before the monthly review."]
        for n in range(a.rows):
            stream.write(f"Record {n+1:06d} | {areas[n%4]} | {activities[n%4]}\n")
        stream.write("\nMONTH-END TECHNICAL REVIEW\nThe ultrasonic calibration memorandum belongs with the instrument inventory, the dated field sheets, and the supplier's service record. Retain the original calibration sheet rather than copying a result into a disconnected spreadsheet.\nThe review coordinator should record the disposition of each unresolved record in the next edition.\n")
    with (files / "Supplier correspondence.jsonl").open("w", encoding="utf-8", newline="") as stream:
        for n in range(a.rows // 2):
            stream.write(json.dumps({"reference": n+1, "subject": ["Delivery schedule", "Part identification", "Purchase order clarification"][n%3], "message": "The item description and receiving reference have been matched to the retained order.", "reviewer": ["Operations desk", "Purchasing desk"][n%2]}, ensure_ascii=False) + "\n")
        stream.write(json.dumps({"reference": a.rows//2+1, "subject": "Supplier reconciliation", "message": "The ultrasonic calibration memorandum has been filed with the September service handover. The remaining item is the replacement sensor serial-number cross-reference."}) + "\n")
    (files / "Asset register.csv").write_text("asset,location,record,notes\nSensor A,North collection area,9007199254740993,Retain the full identifier as text\nSensor B,West river corridor,9007199254740995,Ultrasonic calibration memorandum received\n", encoding="utf-8")
    (files / "Instrument attachment.bin").write_bytes(bytes(range(256)) * 128)
    h = lambda b: hashlib.sha256(b).hexdigest()
    jobs = []
    for n, path in enumerate(sorted(files.iterdir())):
        raw, intent = path.read_bytes(), f"reading-example-{n+1}"
        mime = {".txt": "text/plain", ".jsonl": "application/x-ndjson", ".csv": "text/csv"}.get(path.suffix, "application/octet-stream")
        jobs.append({"schema": "stellar-forge.sf88.buyer-inbox.v1", "id": h(intent.encode()), "state": "COMPLETE",
            "configSha256": h((intent+"-config").encode()), "createdAt": "2026-10-12T00:00:00.000Z",
            "operation": {"intentId": intent, "method": "GET", "url": "https://example.invalid/received-records"},
            "outcome": {"intentId": intent, "mode": "ORIGINAL_OPERATOR_APPROVED_BUYER_ATTEMPT", "status": "COMPLETE", "httpStatus": 200,
                "responseFile": {"status": "SAVED", "path": str(path), "bytes": len(raw), "sha256": h(raw), "contentType": mime}}})
    (sender / "inbox.json").write_text(json.dumps(jobs), encoding="utf-8")
    started = time.monotonic()
    result = {"source_kind": "authored office records", "rows": a.rows, "original_bytes": sum(j["outcome"]["responseFile"]["bytes"] for j in jobs)}
    with ResourceLibrary(checkout=a.checkout.resolve(), state=sender/"library", kind="snapshot", source=sender/"inbox.json", roots=[files], index_bytes=1024*1024) as native, ReadingWorkspace(root/"reading") as w:
        native.scan()
        stop = threading.Event()
        def interrupt(progress):
            if progress["completed"] == 2:
                stop.set()
        try:
            w.sync(native, operation_id="september-records", label="September service handover", cancel_event=stop, progress=interrupt)
            raise AssertionError("interruption was not exercised")
        except ReadingError as exc:
            assert exc.code == "CANCELLED"
        assert w.status()["syncs"][0]["state"] == "interrupted"
        assert not w.status().get("current_snapshot")
        stop.clear()
        snapshot = w.sync(native, operation_id="september-records", label="September service handover", cancel_event=stop)
        assert snapshot["counts"]["indexed"] == 3 and snapshot["counts"]["download_only"] == 1
        assert w.sync(native, operation_id="september-records", label="September service handover") == snapshot
        q = '"ultrasonic calibration memorandum"'
        page = w.search(q)
        late = [p for p in page["items"] if p["start_byte"] > 1024*1024]
        assert len(late) >= 2
        result["beyond_preview_matches"] = [{"file": p["name"], "start_byte": p["start_byte"], "start_line": p["start_line"]} for p in late]
        original_ids = {r["id"] for r in native.search(q=q)["items"]}
        assert all(p["resource_id"] not in original_ids for p in late)
        saved = w.save_search(record_id="calibration-records", name="Calibration records across the handover", query=q,
                            expected_revision=0, operation_id="save-calibration-search", snapshot=snapshot["id"])
        items = [{**p, "note": "Read with the instrument inventory and the supplier service record."} for p in late]
        reading = w.save_list(record_id="monthly-handover", name="Monthly service handover", note="Start with the field review, then resolve the supplier cross-reference. These are authored practice records.", items=items,
                              expected_revision=0, operation_id="save-monthly-list")
        assert w.save_list(record_id=reading["id"], name=reading["name"], note=reading["note"], items=items, expected_revision=0, operation_id="save-monthly-list") == reading
        try:
            w.save_list(record_id=reading["id"], name="Conflicting editor", note="", items=[], expected_revision=0, operation_id="stale-editor")
            raise AssertionError("stale editor accepted")
        except ReadingError as exc:
            assert exc.code == "REVISION_CONFLICT"
        first = native.resource(items[0]["resource_id"])
        native.annotate(first["id"], expected_revision=first["annotation"]["revision"], operation_id="mark-source", note="Original annotation retained by the library.", tags=["service"], starred=True)
        class InterruptedCollection:
            def __getattr__(self, name):
                return getattr(native, name)
            def save_collection(self, **parameters):
                native.save_collection(**parameters)
                raise ConnectionError("Example lost response after original collection commit")
        args = dict(list_id=reading["id"], list_revision=reading["revision"], collection_id="monthly-handover", expected_revision=0, operation_id="publish-monthly-handover")
        try:
            w.publish_collection(InterruptedCollection(), **args)
            raise AssertionError("lost response was not exercised")
        except ConnectionError:
            pass
        original = w.publish_collection(native, **args)
        assert original["revision"] == 1 and len(original["members"]) == 2
        assert any(m["annotation"]["note"] == "Original annotation retained by the library." for m in original["members"])
        assert native.collection_history("monthly-handover")["total"] == 1
        result["native_collection"] = {"revision": original["revision"], "members": len(original["members"]), "lost_response_recovered": True}
        result["reports"] = [export_report(w, delivered/('monthly-handover.'+fmt), format=fmt, list_id=reading["id"]) for fmt in ("html", "csv", "json")]
        result["search_report"] = export_report(w, delivered/"complete-search.json", format="json", query="the", snapshot=snapshot["id"])
        assert result["search_report"]["passages"] > 200
        result["project"] = export_project(w, delivered/"reading-project.zip")
        # Retain immutable first-snapshot searches while a following scan adds a new original.
        extra = files/"Following month.txt"
        extra.write_text("The ultrasonic calibration memorandum is now part of the following handover.\n", encoding="utf-8")
        j = json.loads(json.dumps(jobs[0])); intent="reading-example-following"
        j["id"],j["configSha256"]=h(intent.encode()),h((intent+"-config").encode())
        j["operation"]["intentId"]=intent;j["outcome"]["intentId"]=intent
        j["outcome"]["responseFile"]={"status":"SAVED","path":str(extra),"sha256":h(extra.read_bytes()),"bytes":extra.stat().st_size,"contentType":"text/plain"}
        (sender/"inbox.json").write_text(json.dumps([*jobs,j]))
        native.scan()
        following=w.sync(native,operation_id="following-records",label="Following service handover")
        assert w.run_search(saved["id"])["items"] == page["items"]
        assert w.search(q)["total"] == page["total"]+1
        result["following_snapshot"]={"resources":following["counts"]["resources"],"saved_search_stayed_pinned":True}
        # Preserve the second snapshot and all earlier revisions in the final project.
        result["project"] = export_project(w, delivered/"reading-project-complete.zip")
    shutil.rmtree(sender)
    received = receive_project(delivered/"reading-project-complete.zip", root/"received")
    with ReadingWorkspace(root/"received",create=False) as w:
        assert w.run_search("calibration-records")["items"] == page["items"]
        for fmt in ("html","csv","json"):
            target=delivered/('received-monthly-handover.'+fmt)
            export_report(w,target,format=fmt,list_id="monthly-handover")
            assert target.read_bytes()==(delivered/('monthly-handover.'+fmt)).read_bytes()
        r=w.head("list","monthly-handover")
        edited=w.save_list(record_id=r["id"],name=r["name"],note=r["note"]+" Receiving desk: supplier reference recorded for the next review.",items=list(reversed(r["items"])),expected_revision=r["revision"],operation_id="receiving-desk-edit")
        assert edited["revision"]==2 and len(w.history("list",r["id"]))==2
        result["received"]={"originals":received["originals"],"source_bytes":received["source_bytes"],"list_revision":2,"sender_deleted":not sender.exists(),"reports_byte_identical":True}
        result["editable_project"]=export_project(w,delivered/"editable-reading-project.zip")
        result["final_status"]=w.status()
    result["elapsed_seconds"]=round(time.monotonic()-started,3)
    (root/"customer-result.json").write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n")
    print(json.dumps({k:result[k] for k in ("original_bytes","beyond_preview_matches","native_collection","following_snapshot","received","elapsed_seconds")},indent=2,ensure_ascii=False))


if __name__=="__main__":
    main()
