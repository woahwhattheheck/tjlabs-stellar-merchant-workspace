#!/usr/bin/env python3
"""Receive the complete current SCF application and original technical review."""
import argparse
import ast
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sys
import subprocess
import tempfile
import time
import zipfile

sys.dont_write_bytecode = True
from scf_native_process import (
    preserve_console, record_runtime_selection, retain_runtime_edition, run_receiving_program,
)

OPERATION = "SCF-GRANT-CURRENT-REVIEW-81CF-20261012"

def digest(body):
    return hashlib.sha256(body).hexdigest()

def git_blob(body):
    return hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest()

def json_file(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    path.chmod(0o600)

def checked_relative(raw):
    if not isinstance(raw, str) or not raw or "\\" in raw or "\0" in raw:
        raise ValueError("Invalid supplied source path")
    path = PurePosixPath(raw)
    if path.is_absolute() or ".." in path.parts or str(path) != raw:
        raise ValueError("Invalid supplied source path: " + raw)
    return path

def stage_rows(rows, directory, require_git):
    seen = set()
    manifest = []
    for row in rows:
        relative = checked_relative(row["path"])
        if str(relative) in seen:
            raise ValueError("Duplicate supplied source: " + str(relative))
        seen.add(str(relative))
        if row.get("encoding", "utf-8") == "utf-8":
            body = row["content"].encode("utf-8")
        elif row["encoding"] == "base64":
            body = base64.b64decode("".join(row["content"].split()), validate=True)
        else:
            raise ValueError("Unsupported source encoding")
        if len(body) != row["bytes"] or digest(body) != row["sha256"]:
            raise ValueError("Complete supplied bytes differ: " + str(relative))
        if require_git and git_blob(body) != row["git_blob"]:
            raise ValueError("Selected Git source differs: " + str(relative))
        target = directory.joinpath(*relative.parts)
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if target.exists():
            raise ValueError("Use the private receiving directory created by this operation")
        target.write_bytes(body)
        target.chmod(0o600)
        if target.suffix == ".py":
            ast.parse(body, filename=str(relative))
        manifest.append({k: row[k] for k in ("path", "bytes", "sha256", "git_blob") if k in row})
    return manifest

def public_receipts(value):
    found = []
    if isinstance(value, dict):
        keep = ("status", "purpose", "library_file_id", "file_id", "file_name",
                "current_version_number", "local_path", "path", "error_code")
        row = {key: value[key] for key in keep
               if key in value and isinstance(value[key], (str, int, bool, type(None)))}
        if row:
            found.append(row)
        for child in value.values():
            found.extend(public_receipts(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(public_receipts(child))
    return found

def save_outputs(runtime, output_paths, private, replacement):
    uploads = []
    for index, path in enumerate(output_paths):
        if index == 0 and replacement:
            item = {"local_path": str(path), "purpose": "replace_library_file",
                    "library_file_id": replacement[0], "expected_current_version": replacement[1],
                    "version_reason": "Complete current SCF application, retained original review and independent receiving"}
        else:
            item = {"local_path": str(path), "purpose": "create_library_file",
                    "library_artifact_type": "image" if path.suffix.lower() == ".png" else "other"}
        uploads.append(item)
    request = {"uploads": uploads}
    adapter = """
import json,sys,time,traceback,urllib.error
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from library_upload import LibraryUploadWorkflow,HostedAppsClient,LibraryFileMaterializer,SignedUrlUploader
request=json.load(sys.stdin)
private=Path(sys.argv[2])
for attempt in range(3):
    try:
        result=LibraryUploadWorkflow(apps_client=HostedAppsClient(),
            materializer=LibraryFileMaterializer(),uploader=SignedUrlUploader(),
            state_parent=private).run(request)
        print(json.dumps(result,separators=(',',':')))
        break
    except Exception as error:
        frames={frame.name for frame in traceback.extract_tb(error.__traceback__)}
        cause=error.__cause__
        retry=('_prepare' in frames and isinstance(cause,urllib.error.HTTPError) and cause.code==502)
        (private/('library-prepare-attempt-'+str(attempt+1)+'.txt')).write_text(traceback.format_exc(),encoding='utf-8')
        if not retry or attempt==2:
            raise
        print('SCF_LIBRARY_PREPARE_RETRY '+str(attempt+1),file=sys.stderr,flush=True)
        time.sleep(1)
"""
    upload = subprocess.run([sys.executable, "-B", "-c", adapter, str(runtime), str(private)],
                            input=json.dumps(request), capture_output=True, text=True, timeout=300)
    (private / "library-upload-result.json").write_text(upload.stdout, encoding="utf-8")
    (private / "library-upload-stderr.txt").write_text(upload.stderr, encoding="utf-8")
    try:
        result = json.loads(upload.stdout)
    except json.JSONDecodeError:
        result = {"status": "failed", "error_code": "library_helper_returned_no_json"}
    receipts = public_receipts(result)
    saved_paths = {row.get("local_path") for row in receipts
                   if row.get("status") == "succeeded" and row.get("library_file_id")}
    expected_paths = {str(path) for path in output_paths}
    summary = {"helper_exit": upload.returncode, "receipts": receipts,
               "all_saved": expected_paths.issubset(saved_paths),
               "pending_paths": sorted(expected_paths - saved_paths),
               "private_result_path": str(private / "library-upload-result.json")}
    json_file(private / "library-public-result.json", summary)
    print("SCF_LIBRARY_RESULT " + json.dumps(summary), flush=True)
    return summary

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packet", required=True, type=Path)
    parser.add_argument("--expected-packet-sha256", required=True)
    parser.add_argument("--node", required=True, type=Path)
    parser.add_argument("--node-modules", required=True, type=Path)
    parser.add_argument("--chromium", required=True, type=Path)
    parser.add_argument("--parent", required=True, type=Path)
    parser.add_argument("--timeout-seconds", type=int, default=900)
    parser.add_argument("--replace-library-file-id")
    parser.add_argument("--expected-library-version", type=int)
    args = parser.parse_args()
    os.umask(0o077)
    packet_bytes = args.packet.read_bytes()
    if digest(packet_bytes) != args.expected_packet_sha256:
        raise ValueError("The complete received source packet differs from the selected carrier")
    packet = json.loads(packet_bytes)
    if packet.get("schema") != "stellar-forge.complete-current-receiving-source.v1":
        raise ValueError("Select the complete current application receiving source")
    if packet.get("operationId") != OPERATION:
        raise ValueError("Retain the original current-review operation")
    if not 60 <= args.timeout_seconds <= 3600:
        raise ValueError("Choose a receiving timeout from 60 to 3600 seconds")
    if bool(args.replace_library_file_id) != (args.expected_library_version is not None):
        raise ValueError("An existing output replacement needs its actual file ID and version")
    for selected in (args.node, args.node_modules, args.chromium, args.parent):
        if not selected.is_absolute() or not selected.exists():
            raise ValueError("Supply an existing absolute host runtime path: " + str(selected))
    if not args.parent.is_dir() or not args.node_modules.is_dir():
        raise ValueError("Select the actual writable receiving parent and installed module directory")
    root = Path(tempfile.mkdtemp(prefix="scf-current-81cf-", dir=args.parent))
    source = root / "source"
    runtime = root / "runtime"
    output = root / "receiving"
    private = root / "private"
    temporary = root / "tmp"
    for path in (source, runtime, output, private, temporary):
        path.mkdir(mode=0o700)
    preserve_console(output / "producer-console.log")
    source_manifest = stage_rows(packet["files"], source, True)
    runtime_manifest = stage_rows(packet["runtime"], runtime, False)
    preceding_runtime = retain_runtime_edition(runtime, root)
    # Keep the executed producer and shared controller in the saved runtime,
    # including when a maintained producer receives an older complete packet.
    for name in ("receive_current.py", "scf_native_process.py"):
        actual_source = Path(__file__).with_name(name).read_bytes()
        (runtime / name).write_bytes(actual_source)
        (runtime / name).chmod(0o600)
    actual_runtime = record_runtime_selection(runtime, root, preceding_runtime)
    json_file(root / "source-selection.json", {
        "operationId": OPERATION, "sourceRepository": packet["sourceRepository"],
        "sourceCommit": packet["sourceCommit"], "reviewCommit": packet["reviewCommit"],
        "overlayBlob": packet["overlayBlob"], "files": source_manifest,
        "runtime": runtime_manifest, "packetSha256": args.expected_packet_sha256})
    (root / "complete-source-packet.json").write_bytes(packet_bytes)
    config = {
        "sourceRoot": str(source), "outputDirectory": str(output),
        "temporaryDirectory": str(temporary), "nodeModules": str(args.node_modules),
        "chromium": str(args.chromium), "sourceCommit": packet["sourceCommit"],
        "overlayBlob": packet["overlayBlob"], "port": 0, "files": source_manifest,
        "reviewDecisions": packet["reviewDecisions"],
        "reviewResolutions": packet["reviewResolutions"],
        "originalReviewPath": packet["originalReviewPath"],
        "originalReviewActions": packet["originalReviewActions"],
        "originalDraftExportSHA256": packet["originalDraftExportSHA256"],
    }
    json_file(root / "config.json", config)
    environment = dict(os.environ)
    environment.update({"TMPDIR": str(temporary), "TEMP": str(temporary), "TMP": str(temporary),
                        "PYTHONDONTWRITEBYTECODE": "1"})
    print("SCF_NATIVE_START " + json.dumps({
        "operationId": OPERATION, "root": str(root), "sourceFiles": len(source_manifest),
        "sourceCommit": packet["sourceCommit"], "originalReview": packet["originalReviewId"],
        "nativeRecord": str(output / "native-process.json"),
    }), flush=True)
    native_summary, result = run_receiving_program(
        OPERATION, root, output,
        {"source_commit": packet["sourceCommit"], "packet_sha256": args.expected_packet_sha256,
         "original_review_id": packet["originalReviewId"], "runtime_selection": actual_runtime,
         "library_replacement": {
             "library_file_id": args.replace_library_file_id,
             "expected_version": args.expected_library_version,
         }},
        args.node, args.chromium, runtime / "receive-current.cjs", root / "config.json",
        root, environment, args.timeout_seconds, "current-application",
    )
    state = native_summary["state"]
    native_summary.update(sourceCommit=packet["sourceCommit"], outputDirectory=str(output))
    json_file(output / "native-runtime.json", {
        "node": str(args.node), "nodeVersion": native_summary["nodeVersion"],
        "chromium": str(args.chromium), "browserVersion": native_summary["browserVersion"],
        "nodeModules": str(args.node_modules), "python": sys.version,
        "startedAt": native_summary["started_utc"], "operationId": OPERATION,
        "sourceFiles": len(source_manifest),
        "sourceBytes": sum(row["bytes"] for row in source_manifest),
        "sourceCommit": packet["sourceCommit"], "root": str(root),
        "nativeRecord": str(output / "native-process.json"),
    })
    if result:
        native_summary.update({key: result[key] for key in
                               ("originalDraftId", "originalReviewId", "reviewActions", "retainedOriginalActions")
                               if key in result})
    json_file(root / "native-result.json", native_summary)
    archive = root / ("SCF-Current-Application-and-Review" + ("" if state == "COMPLETE" else "-Partial") + ".zip")
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        for directory in (source, runtime, output, root / "runtime-editions"):
            for file in sorted(directory.rglob("*")):
                if file.is_symlink():
                    raise ValueError("Receiving output must retain ordinary files: " + str(file))
                if file.is_file():
                    # Browser captures remain available for internal inspection.
                    if file.is_relative_to(output) and file.suffix.lower() == ".png":
                        continue
                    bundle.write(file, file.relative_to(root).as_posix())
        for file in (root / "source-selection.json", root / "complete-source-packet.json",
                     root / "config.json", root / "native-result.json", root / "runtime-selection.json"):
            bundle.write(file, file.relative_to(root).as_posix())
    archive_meta = {"path": str(archive), "bytes": archive.stat().st_size,
                    "sha256": digest(archive.read_bytes())}
    json_file(root / "archive.json", archive_meta)
    print("SCF_NATIVE_RESULT " + json.dumps({**native_summary, "archive": archive_meta}), flush=True)
    replacement = ((args.replace_library_file_id, args.expected_library_version)
                   if args.replace_library_file_id else None)
    try:
        saved = save_outputs(runtime, [archive], private, replacement)
        if not saved["all_saved"] and state == "COMPLETE":
            return 2
    except Exception as error:
        json_file(private / "save-error.json", {"type": type(error).__name__, "message": str(error)})
        print("SCF_LIBRARY_SAVE_ERROR " + json.dumps({"type": type(error).__name__,
              "localArchive": str(archive), "privateDetail": str(private / "save-error.json")}), flush=True)
        if state == "COMPLETE":
            return 2
    if state != "COMPLETE":
        incomplete = output / "INCOMPLETE.json"
        if incomplete.exists():
            print("SCF_NATIVE_FAILURE " + incomplete.read_text(), flush=True)
        else:
            print("SCF_NATIVE_FAILURE " + json.dumps({"logTail":
                  next((Path(row["stdout"]).read_text(errors="replace")[-8000:]
                        for row in reversed(list(native_summary["phases"].values()))
                        if Path(row["stdout"]).is_file()), "")}), flush=True)
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
