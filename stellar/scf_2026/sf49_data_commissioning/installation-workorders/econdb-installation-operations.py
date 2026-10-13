#!/usr/bin/env python3
"""Inspect original SF47 Installation archives; the original importer owns validation and writes."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import sys

ROOT = Path(__file__).resolve().parents[2] / "sf47_budget_model" / "workspace"
sys.path.insert(0, str(ROOT))
from operations import Operations
import operations_installations as installations

SCHEMA = "stellar-forge.econdb-installation-complete-receiving.v1"
def need(value, message):
    if not value:
        raise ValueError(message)

def read(path, maximum):
    path = Path(path)
    before = path.lstat()
    need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
         not (before.st_mode & 0o077) and before.st_size <= maximum,
         "Select the complete private original regular file")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        opened = os.fstat(fd)
        need((opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino),
             "The original file selection changed")
        with os.fdopen(fd, "rb", closefd=False) as stream:
            raw = stream.read(maximum + 1)
        after = os.fstat(fd)
        signature = lambda x: (x.st_dev, x.st_ino, x.st_size, x.st_mtime_ns, x.st_ctime_ns)
        need(signature(before) == signature(after) and len(raw) == before.st_size,
             "The selected complete file changed while reading")
        return raw
    finally:
        os.close(fd)

def identity(raw):
    return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}

def selected(document, files, expected, case_id):
    need(document["program"]["id"] == case_id, "The archive belongs to another original case")
    actual = installations.selection_from_files(document, files)
    need(actual == expected["installation"], "The archive selected another Installation edition")
    row = next(x for x in document["installations"]
               if x["id"] == actual["id"] and x["revision"] == actual["revision"])
    need(row["preview"]["document"] == expected["document"],
         "The complete original Installation document differs")
    for source in expected["sources"]:
        body = files.get("sources/" + source["id"])
        need(body is not None and identity(body) == {"bytes": source["bytes"], "sha256": source["sha256"]},
             "The complete original selected source differs: " + source["id"])
    return actual

def compare(original, original_files, received, received_files):
    # The native importer intentionally gives the receiving case and plan new IDs.
    # Immutable original event and source identities remain unchanged.
    events, later = original["events"], received["events"]
    need(len(later) >= len(events) and later[:len(events)] == events,
         "The receiving case lost or changed original native history")
    sources = {x["id"]: x for x in received["sources"]}
    for item in original["sources"]:
        need(sources.get(item["id"]) == item, "An original case source identity changed")
        name = "sources/" + item["id"]
        need(received_files.get(name) == original_files.get(name),
             "An original complete case source changed")
    # These are native immutable saved editions; later editions are allowed.
    totals = {}
    for key in ("reviews", "installations", "forecasts", "portfolios", "completionPlans",
                "amendments", "workIntakes"):
        before = original.get(key, [])
        after = received.get(key, [])
        if not isinstance(before, list):
            continue
        need(isinstance(after, list), "A native saved-edition collection is missing: " + key)
        for row in before:
            need(row in after, "An original native saved edition changed: " + key)
        totals[key] = {"original": len(before), "received": len(after)}
    changes = []
    for kind, rows in original["records"].items():
        later_rows = {x["id"]: x for x in received["records"][kind]}
        for row in rows:
            current = later_rows.get(row["id"])
            need(current is not None, "The receiving case lost an original native record")
            if current != row:
                need(len(later) > len(events), "A native record changed without later case history")
                changes.append({"kind": kind, "id": row["id"], "originalVersion": row.get("version"),
                                "receivedVersion": current.get("version")})
    return {"originalEvents": len(events), "receivedEvents": len(later),
            "originalSources": len(original["sources"]), "receivedSources": len(received["sources"]),
            "savedEditions": totals, "laterRecordChanges": changes}

def following_native(args):
    """Original local custody read; the unchanged Installation writer performs saves."""
    from model import Workspace
    import operations_econdb_sources as sources
    need(args.workspace is not None and args.case is not None,
         "Select the existing original native workspace and case")
    root = args.workspace.absolute()
    need(root.resolve() == root and root.is_dir() and
         stat.S_ISREG((root / "planning.sqlite3").lstat().st_mode),
         "Open the existing original Operations workspace, not a new or linked directory")
    workspace = Workspace(root, ROOT.parent / "sf10_current_candidate.json")
    try:
        ops = Operations(workspace)
        if args.following_context:
            value = json.loads(read(args.following_context, 64 * 1024 * 1024))
            need(isinstance(value, dict) and set(value) == {"selection", "priorPreparation"},
                 "Use the complete actual following context input")
            snapshot, source = sources._following_snapshot(ops, args.case,
                value["selection"], value["priorPreparation"])
            return {"snapshot": snapshot, "source": source}
        need(args.native_snapshot is not None, "Select the retained original native snapshot")
        proof = json.loads(read(args.following_proof, 64 * 1024 * 1024))
        snapshot = json.loads(read(args.native_snapshot, 8 * 1024 * 1024))
        checked = sources.verify_following_native(proof, snapshot)
        need(checked["caseSource"]["caseId"] == args.case,
             "The following proof belongs to another original case")
        with ops._snapshot():
            context = ops._context(args.case)
            for field in ("priorInstallation", "installation"):
                selected = snapshot[field]
                actual = installations.get(ops, args.case, selected["id"], selected["revision"])
                need(sources._same_json(actual, selected), "The original saved native row changed")
            head = installations.get(ops, args.case, checked["installation"]["id"])
            current_source = installations._source(context)
            current = (current_source == checked["caseSource"] and
                       head["revision"] == checked["installation"]["revision"] and
                       head["sha256"] == checked["installation"]["sha256"])
            preview = installations.preview(ops, context, checked["preview"]) if current else None
            if preview is not None:
                need(sources._same_json(preview["document"], checked["document"]),
                     "The original native writer normalized different following content")
        return {**checked, "nativePreview": preview, "requiresCurrentPreview": not current,
                "actualCurrentSource": current_source}
    finally:
        workspace.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--selection", type=Path)
    parser.add_argument("--workspace", type=Path)
    parser.add_argument("--case")
    parser.add_argument("--following-context", type=Path)
    parser.add_argument("--following-proof", type=Path)
    parser.add_argument("--native-snapshot", type=Path)
    parser.add_argument("--received", type=Path)
    parser.add_argument("--received-case")
    args = parser.parse_args()
    if args.following_context or args.following_proof:
        need(bool(args.following_context) != bool(args.following_proof) and
             not args.archive and not args.selection and not args.received and not args.received_case,
             "Select exactly one original following-native operation")
        print(json.dumps(following_native(args), ensure_ascii=False, allow_nan=False))
        return
    need(args.archive is not None and args.selection is not None and not args.workspace and
         not args.case and not args.native_snapshot, "Select the original archive and selection")
    need(bool(args.received) == bool(args.received_case), "Select both receiving archive and native case identity")
    raw = read(args.archive, 320 * 1024 * 1024)
    expected = json.loads(read(args.selection, 8 * 1024 * 1024))
    need(expected.get("schema") == SCHEMA + ".archive-selection", "Use the original complete Econdb Installation selection")
    document, files = Operations._unpack(raw)
    installation = selected(document, files, expected, expected["caseId"])
    result = {"schema": SCHEMA + ".archive-inspection", "archive": identity(raw),
              "caseId": expected["caseId"], "installation": installation,
              "sources": expected["sources"], "completeOriginalArchiveVerified": True}
    if args.received:
        received_raw = read(args.received, 320 * 1024 * 1024)
        received, received_files = Operations._unpack(received_raw)
        selected(received, received_files, expected, args.received_case)
        result.update({"received": identity(received_raw), "receivedCaseId": args.received_case,
                       "history": compare(document, files, received, received_files)})
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
