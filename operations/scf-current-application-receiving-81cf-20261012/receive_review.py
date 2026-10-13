#!/usr/bin/env python3
"""Finish the retained SCF review from its complete saved receiving case."""
import argparse
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import sys
import tempfile
import time
import uuid
import zipfile

sys.dont_write_bytecode = True
from scf_native_process import (
    preserve_console, record_runtime_selection, retain_runtime_edition, run_receiving_program,
)

from receive_current import pending_writer_phases

OPERATION = "SCF-GRANT-CURRENT-REVIEW-81CF-20261012"

def digest(body):
    return hashlib.sha256(body).hexdigest()

def write_json(path, value):
    temporary = path.with_name(path.name + ".new")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(path)

def relative_path(raw):
    if not isinstance(raw, str) or not raw or "\\" in raw or "\0" in raw:
        raise ValueError("Invalid case member")
    selected = PurePosixPath(raw)
    if selected.is_absolute() or ".." in selected.parts or str(selected) != raw:
        raise ValueError("Invalid case member: " + raw)
    return selected

def file_digest(path):
    selected = hashlib.sha256()
    with path.open("rb") as source:
        for piece in iter(lambda: source.read(1024 * 1024), b""):
            selected.update(piece)
    return selected.hexdigest()

def unpack_case(archive, destination, native_review=False, additional_members=()):
    with zipfile.ZipFile(archive) as bundle:
        members = bundle.infolist()
        names = [row.filename for row in members]
        if len(set(names)) != len(names):
            raise ValueError("The complete case contains duplicate member paths")
        selected_names = None
        if native_review:
            config = json.loads(bundle.read("config.json"))
            selected_names = {str(relative_path(name)) for name in additional_members}
            selected_names.update({"config.json", "review-continuation-native.json",
                              "review-continuation-config.json", "runtime-selection.json"})
            selected_names.update("source/" + str(relative_path(row["path"])) for row in config["files"])
            if config.get("retainedReviewPath"):
                selected_names.add(str(relative_path(config["retainedReviewPath"])))
            else:
                selected_names.add("source/" + str(relative_path(config["originalReviewPath"])))
            selected_names.update(("receiving/downloads/Current_Complete_Submission.json",
                "receiving/saved-submission-record.json", "receiving/application/RESULT.json",
                "receiving/companion/companion-receiving.json"))
            selected_names.update("receiving/review-continuation/" + name for name in (
                "Current_Review_Checkpoint.json", "native-process.log", "progress.json",
                "INCOMPLETE.json", "Failure.html", "RESULT.json", "prepared-native-progress.json",
                "PREPARED_REVIEW_INCOMPLETE.json", "prepared-native-review-record.json",
                "native-process.json", "javascript-parse.log", "node-version.log",
                "browser-version.log", "independent-native-receiving.log", "producer-console.log"))
        materialized = 0
        for item in members:
            relative = relative_path(item.filename.rstrip("/") if item.is_dir() else item.filename)
            mode = (item.external_attr >> 16) & 0o170000
            if mode not in (0, stat.S_IFREG, stat.S_IFDIR):
                raise ValueError("The complete case must contain ordinary source files")
            if selected_names is not None and item.filename not in selected_names and not item.filename.startswith("runtime/"):
                continue
            target = destination.joinpath(*relative.parts)
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True, mode=0o700)
                continue
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with target.open("xb") as out:
                with bundle.open(item) as inp:
                    shutil.copyfileobj(inp, out)
            target.chmod(0o600)
            materialized += 1
    return len(members), materialized

def archive_case(original, case, archive, output, retired):
    replacements = {}
    for file in sorted(case.rglob("*")):
        if file.is_symlink():
            raise ValueError("The retained case must contain ordinary files")
        if file.is_file():
            if file.is_relative_to(output / "captures") or file.name == "Failure.png":
                continue
            replacements[file.relative_to(case).as_posix()] = file
    with zipfile.ZipFile(original) as retained:
        with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
            for item in retained.infolist():
                if item.filename in replacements or item.filename in retired:
                    continue
                if item.is_dir():
                    bundle.writestr(copy.copy(item), b"")
                    continue
                with retained.open(item) as inp:
                    with bundle.open(copy.copy(item), "w") as out:
                        shutil.copyfileobj(inp, out, 1024 * 1024)
            for name, file in replacements.items():
                bundle.write(file, name)
    with zipfile.ZipFile(original) as retained, zipfile.ZipFile(archive) as complete:
        incoming, final = set(retained.namelist()), set(complete.namelist())
        expected = {retired.get(name, name) for name in incoming}
        if not expected.issubset(final) or len(final) != len(complete.namelist()):
            raise ValueError("Retain every original member in the complete continued case")
        for original_name, history_name in retired.items():
            if original_name not in incoming:
                raise ValueError("An archived prior attempt must name its original member")
            before, after = retained.getinfo(original_name), complete.getinfo(history_name)
            if (before.file_size, before.CRC) != (after.file_size, after.CRC):
                raise ValueError("The original attempt changed while moving to history: " + original_name)



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", type=Path, required=True)
    parser.add_argument("--expected-case-sha256", required=True)
    parser.add_argument("--parent", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--engine", choices=("browser", "native"), default="browser")
    parser.add_argument("--source-input", type=Path)
    parser.add_argument("--source-browser", action="store_true",
                        help="Continue the selected native source through its full browser journey before saving")
    parser.add_argument("--expected-source-input-sha256")
    parser.add_argument("--node-modules", type=Path)
    parser.add_argument("--chromium", type=Path)
    parser.add_argument("--timeout-seconds", type=int, default=900)
    parser.add_argument("--save-library", action="store_true")
    parser.add_argument("--replace-library-file-id")
    parser.add_argument("--expected-library-version", type=int)
    args = parser.parse_args()
    os.umask(0o077)
    if not 60 <= args.timeout_seconds <= 3600:
        raise ValueError("Choose a timeout from 60 to 3600 seconds")
    if bool(args.replace_library_file_id) != (args.expected_library_version is not None):
        raise ValueError("A replacement requires the exact original file ID and current version")
    if args.expected_library_version is not None and args.expected_library_version < 0:
        raise ValueError("Select an existing Library version")
    if bool(args.source_input) != bool(args.expected_source_input_sha256):
        raise ValueError("A complete source input requires its selected SHA-256.")
    if args.source_input and args.engine != "native":
        raise ValueError("Continue the current source package through the native receiving engine.")
    if args.source_browser and (not args.source_input or args.engine != "native"):
        raise ValueError("--source-browser continues the existing --engine native --source-input operation.")
    selected_paths = [args.case, args.parent, args.node]
    if args.source_input:
        selected_paths.append(args.source_input)
    if args.engine == "browser" or args.source_browser:
        if args.node_modules is None or args.chromium is None:
            raise ValueError("The browser engine requires --node-modules and --chromium")
        selected_paths.extend((args.node_modules, args.chromium))
    for selected in selected_paths:
        if not selected.is_absolute() or not selected.exists():
            raise ValueError("Supply existing absolute input and runtime paths: " + str(selected))
    if not args.case.is_file() or not args.parent.is_dir() or ((args.engine == "browser" or args.source_browser) and not args.node_modules.is_dir()):
        raise ValueError("Select the complete saved ZIP and actual host directories")
    selected_hash = file_digest(args.case)
    original_case_bytes = args.case.stat().st_size
    if selected_hash != args.expected_case_sha256:
        raise ValueError("The complete case differs from the selected saved version")
    if args.source_input:
        from receive_source import receive_source
        return receive_source(args, sys.modules[__name__])

    root = Path(tempfile.mkdtemp(prefix="scf-review-continuation-", dir=args.parent))
    case, private, temporary = root / "case", root / "private", root / "tmp"
    for directory in (case, private, temporary):
        directory.mkdir(mode=0o700)
    preserve_console(root / "producer-console.log")
    print("SCF_REVIEW_CASE_PREPARE " + json.dumps({"root": str(root), "engine": args.engine}), flush=True)
    members, materialized = unpack_case(args.case, case, native_review=args.engine == "native")
    runtime, previous = case / "runtime", case / "receiving"
    output = previous / "review-continuation"
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    config = json.loads((case / "config.json").read_text(encoding="utf-8"))
    if not config.get("files") or not config.get("reviewDecisions") or not config.get("reviewResolutions"):
        raise ValueError("The case does not include its selected source and substantive review")
    for selected in (previous / "downloads/Current_Complete_Submission.json",
                     previous / "saved-submission-record.json",
                     previous / "application/RESULT.json",
                     previous / "companion/companion-receiving.json"):
        if not selected.is_file():
            raise ValueError("Continue the original complete reader and saved draft: " + str(selected))

    attempt = output / "attempts" / (time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + "-" + uuid.uuid4().hex[:8])
    retired = {}

    def retain_attempt(source, name):
        if source.is_file():
            attempt.mkdir(parents=True, exist_ok=True, mode=0o700)
            target = attempt / name
            retired[source.relative_to(case).as_posix()] = target.relative_to(case).as_posix()
            source.replace(target)

    retained = (
        "native-process.log", "native-process.json", "progress.json", "INCOMPLETE.json",
        "Failure.html", "RESULT.json", "javascript-parse.log", "node-version.log",
        "browser-version.log", "producer-console.log", "independent-native-receiving.log",
        "prepared-native-progress.json", "PREPARED_REVIEW_INCOMPLETE.json",
        "prepared-native-review-record.json",
    )
    for name in retained:
        retain_attempt(output / name, name)
    retain_attempt(case / "review-continuation-native.json", "native-result.json")
    retain_attempt(case / "review-continuation-config.json", "review-continuation-config.json")
    retain_attempt(case / "runtime-selection.json", "runtime-selection.json")
    # Both engines continue the same complete checkpoint and its matching decisions.
    preceding_runtime = retain_runtime_edition(runtime, case)
    runtime_versions = []
    for name in (
        "receive-review-continuation.cjs", "receive-prepared-review.mjs",
        "receive_review.py", "receive_current.py", "scf_native_process.py", "README.md",
    ):
        latest = Path(__file__).with_name(name)
        target = runtime / name
        selected_body = latest.read_bytes()
        target.write_bytes(selected_body)
        target.chmod(0o600)
        runtime_versions.append({"path": name, "bytes": len(selected_body), "sha256": digest(selected_body)})
    actual_runtime = record_runtime_selection(runtime, case, preceding_runtime)
    driver = runtime / ("receive-prepared-review.mjs" if args.engine == "native" else "receive-review-continuation.cjs")
    config.update(sourceRoot=str(case / "source"), outputDirectory=str(output),
                  previousOutputDirectory=str(previous), temporaryDirectory=str(temporary),
                  nodeModules=str(args.node_modules) if args.node_modules else None,
                  chromium=str(args.chromium) if args.chromium else None, port=0)
    config_path = case / "review-continuation-config.json"
    write_json(config_path, config)
    environment = dict(os.environ)
    environment.update(TMPDIR=str(temporary), TEMP=str(temporary), TMP=str(temporary),
                       PYTHONDONTWRITEBYTECODE="1")
    print("SCF_REVIEW_RESUME_START " + json.dumps({
        "operationId": OPERATION, "root": str(root), "engine": args.engine,
        "retainedMembers": members, "materializedMembers": materialized,
        "sourceCommit": config["sourceCommit"],
        "nativeRecord": str(output / "native-process.json"),
        "previousRuntime": preceding_runtime,
    }), flush=True)
    native, result = run_receiving_program(
        OPERATION, root, output,
        {"source_commit": config["sourceCommit"],
         "original_case": {"bytes": original_case_bytes, "sha256": selected_hash},
         "runtime_selection": actual_runtime, "retained_attempt": str(attempt),
         "retired_members": retired,
         "original_review_id": "SCF-TECHNICAL-BUYER-REVIEW-7108-20261012",
         "original_publication_operation": "SCF-GRANT-REVIEWER-PUBLICATION-8910-20261012",
         "library_replacement": {
             "library_file_id": args.replace_library_file_id,
             "expected_version": args.expected_library_version,
         }},
        args.node, args.chromium, driver, config_path, case, environment,
        args.timeout_seconds, args.engine + "-review", engine=args.engine,
    )
    state = native["state"]
    process_phases = native["phases"]
    native.update({
        "process_phases": process_phases,
        "phases": [
            {"phase": name, **phase, "processExit": phase["exit_code"],
             "durationSeconds": phase.get("duration_seconds")}
            for name, phase in process_phases.items()
            if name in (args.engine + "-review", "independent-native-receiving")
        ],
        "schema": "stellar-forge.review-continuation-native.v1",
        "sourceCommit": config["sourceCommit"], "sourceFiles": len(config["files"]),
        "originalCase": {"bytes": original_case_bytes, "sha256": selected_hash},
        "runtime": runtime_versions, "retainedMembers": members, "materializedMembers": materialized,
        "nodeMaxResidentSetKiB": result.get("maxResidentSetKiB") if result else None,
        "cgroupBefore": native["memory_before"], "cgroupAfter": native["memory_after"],
        "browser": str(args.chromium) if args.engine == "browser" else None,
        "originalDraftId": result.get("originalDraftId") if result else None,
        "originalReviewId": result.get("originalReviewId") if result else None,
        "reviewActions": result.get("reviewActions") if result else None,
    })
    pending = pending_writer_phases(native, "review-continuation")
    if pending:
        native.update(state="INCOMPLETE", archiveState="WAITING_FOR_OWNED_PROCESS_EXIT",
                      pendingWriterPhases=pending, retainedOperationDirectory=str(root))
        write_json(case / "review-continuation-native.json", native)
        print("SCF_REVIEW_RESUME_RESULT " + json.dumps(native), flush=True)
        return 1
    write_json(case / "review-continuation-native.json", native)
    archive = root / ("SCF-Current-Application-and-Review" + ("" if state == "COMPLETE" else "-Partial") + ".zip")
    archive_case(args.case, case, archive, output, retired)
    meta = {"path": str(archive), "bytes": archive.stat().st_size,
            "sha256": file_digest(archive)}
    print("SCF_REVIEW_RESUME_RESULT " + json.dumps({**native, "archive": meta}), flush=True)
    if args.save_library or args.replace_library_file_id:
        spec = importlib.util.spec_from_file_location("original_receiver", runtime / "receive_current.py")
        receiver = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(receiver)
        replacement = ((args.replace_library_file_id, args.expected_library_version)
                       if args.replace_library_file_id else None)
        saved = receiver.save_outputs(runtime, [archive], private, replacement)
        if not saved["all_saved"]:
            return 2
    return 0 if state == "COMPLETE" else 1

if __name__ == "__main__":
    raise SystemExit(main())
