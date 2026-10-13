"""Receive current source in the original saved SCF case and streaming controller."""
import base64
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time
import uuid
import zipfile

from scf_native_process import (
    preserve_console, record_runtime_selection, retain_runtime_edition, run_receiving_program,
)

OPERATION = "SCF-GRANT-CURRENT-REVIEW-81CF-20261012"
PHASE = "SCF-SUBMISSION-SOURCE-PACKAGE-A8CE-20261012"

def digest(body):
    return hashlib.sha256(body).hexdigest()

def git_blob(body):
    return hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest()

def source_bytes(row):
    content = row["content"]
    if not isinstance(content, str):
        raise ValueError("Retain a complete encoded source string: " + row["path"])
    encoding = row.get("encoding", "utf-8")
    if encoding in (None, "utf-8"):
        return content.encode("utf-8")
    if encoding == "base64":
        body = base64.b64decode(content, validate=True)
        if base64.b64encode(body).decode("ascii") != content:
            raise ValueError("Retain canonical complete base64 source: " + row["path"])
        return body
    raise ValueError("Select UTF-8 or base64 source encoding: " + row["path"])

def checked_body(row):
    body = source_bytes(row)
    if len(body) != row["bytes"] or digest(body) != row["sha256"] or git_blob(body) != row["git_blob"]:
        raise ValueError("Complete selected source differs: " + row["path"])
    return body

def replace_bytes(path, body):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + ".new")
    temporary.write_bytes(body)
    temporary.chmod(0o600)
    temporary.replace(path)

def copy_source(source, destination):
    try:
        os.link(source, destination)
    except OSError:
        shutil.copyfile(source, destination)
    return str(destination)

def receive_source(args, original):
    selected = args.source_input.read_bytes()
    if digest(selected) != args.expected_source_input_sha256:
        raise ValueError("Receive the complete selected current-source input.")
    packet = json.loads(selected)
    if packet.get("schema") != "stellar-forge.current-source-receiving-input.v1":
        raise ValueError("Select the complete current-source receiving input.")
    if packet.get("operationId") != OPERATION or packet.get("phaseId") != PHASE:
        raise ValueError("Continue the original SCF operation and source phase.")
    source_package = packet["sourcePackage"]
    package_body = source_package["content"].encode("utf-8")
    if len(package_body) != source_package["bytes"] or digest(package_body) != source_package["sha256"]:
        raise ValueError("The complete selected reviewer package differs.")
    original_case = packet["originalCase"]
    if args.replace_library_file_id and args.replace_library_file_id != original_case["libraryId"]:
        raise ValueError("Continue the same saved customer case.")
    baseline = packet["baseline"]
    source_edition = packet["sourceSelection"]["id"]
    if len(source_edition) != 64 or any(char not in "0123456789abcdef" for char in source_edition):
        raise ValueError("Select the complete source edition identity.")

    root = Path(tempfile.mkdtemp(prefix="scf-current-source-", dir=args.parent))
    case, private, temporary = root / "case", root / "private", root / "tmp"
    for directory in (case, private, temporary):
        directory.mkdir(mode=0o700)
    preserve_console(root / "producer-console.log")
    receiving_directory = packet.get("receivingDirectory", "receiving/source-package-continuation")
    receiving_directory = str(original.relative_path(receiving_directory))
    if packet.get("precedingSourceDirectory"):
        basis = packet.get("receivingBasis", {})
        basis_body = (json.dumps(basis, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        receiving_id = digest(basis_body)
        if (packet.get("receivingId") != receiving_id or
                receiving_directory != "receiving/source-package-editions/" + receiving_id or
                basis.get("sourceSelection") != source_edition):
            raise ValueError("Continue the exact selected following edition and baseline.")
    elif receiving_directory != "receiving/source-package-continuation":
        raise ValueError("Retain the original first source receiving directory.")
    prefix = receiving_directory + "/"
    additional = {
        str(original.relative_path(baseline[key]))
        for key in ("draftPath", "reviewPath", "recordPath", "resultPath", "browserRecordPath")
        if key in baseline
    }
    with zipfile.ZipFile(args.case) as archive:
        additional.update(name for name in archive.namelist()
                          if name.startswith(prefix) and not name.endswith("/"))
    members, materialized = original.unpack_case(
        args.case, case, native_review=True, additional_members=additional)
    config = json.loads((case / "config.json").read_text(encoding="utf-8"))
    previous = case / "receiving"
    output = case / receiving_directory
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    phase_config = output / "config.json"
    saved_config = json.loads(phase_config.read_text()) if phase_config.is_file() else None
    if saved_config and (saved_config.get("sourcePackageSha256") != source_package["sha256"] or
                         saved_config.get("sourceSelection", {}).get("id") != source_edition):
        raise ValueError("Continue the selected saved source phase before receiving another source edition.")
    if not saved_config and (args.case.stat().st_size != original_case["bytes"] or
                             original.file_digest(args.case) != original_case["sha256"]):
        raise ValueError("The first source phase requires its exact selected original case.")
    if args.expected_library_version is not None and not saved_config:
        if args.expected_library_version != original_case["version"]:
            raise ValueError("The first source phase requires the selected original saved version.")

    retired = {}
    attempt = output / "attempts" / (
        time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + "-" + uuid.uuid4().hex[:8])
    for name in ("RESULT.json", "prepared-native-progress.json", "native-process.log",
                 "native-process.json", "javascript-parse.log", "node-version.log",
                 "independent-native-receiving.log", "producer-console.log",
                 "SOURCE_RECEIVING_INCOMPLETE.json", "native-result.json"):
        source = output / name
        if source.is_file():
            attempt.mkdir(parents=True, exist_ok=True, mode=0o700)
            target = attempt / name
            retired[source.relative_to(case).as_posix()] = target.relative_to(case).as_posix()
            source.replace(target)

    # Retain the complete former selection and its absolute native configuration.
    # Both are already read before moving, and every prior member keeps its bytes.
    for source, name in ((case / "runtime-selection.json", "runtime-selection.json"),
                         (phase_config, "source-phase-config.json")):
        if source.is_file():
            attempt.mkdir(parents=True, exist_ok=True, mode=0o700)
            target = attempt / name
            retired[source.relative_to(case).as_posix()] = target.relative_to(case).as_posix()
            source.replace(target)

    runtime = case / "runtime"
    preceding_runtime = retain_runtime_edition(runtime, case)
    runtime_rows = []
    for row in packet["runtime"]:
        name = str(original.relative_path(row["path"]))
        if "/" in name:
            raise ValueError("Select an original receiving runtime sibling.")
        body = Path(__file__).with_name(name).read_bytes()
        if len(body) != row["bytes"] or digest(body) != row["sha256"] or git_blob(body) != row["git_blob"]:
            raise ValueError("The native receiving runtime differs: " + name)
        replace_bytes(runtime / name, body)
        runtime_rows.append({key: row[key] for key in ("path", "bytes", "sha256", "git_blob")})
    actual_runtime = record_runtime_selection(runtime, case, preceding_runtime)

    # Original source remains in its original directory. Changed files replace
    # hard links atomically in the following complete source edition.
    original_source = case / "source"
    source_root = case / "source-editions" / source_edition / "source"
    source_root.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    shutil.copytree(original_source, source_root, copy_function=copy_source)
    rows = {row["path"]: dict(row) for row in config["files"]}
    for row in packet["assets"]:
        relative = original.relative_path(row["path"])
        body = checked_body(row)
        replace_bytes(source_root.joinpath(*relative.parts), body)
        rows[row["path"]] = {key: row[key] for key in ("path", "bytes", "sha256", "git_blob")}
    package_path = output / "source-package-input.json"
    replace_bytes(package_path, package_body)
    envelope = json.loads(package_body)
    received = envelope["received"]
    objects = {row["sha256"]: row for row in received["objects"]}
    expected_roles = {
        "application": "application.md", "source-index": "source-index.json",
        "budget": "budget.csv", "product-and-finance": "product-and-finance.md",
    }
    files = received["bundle"]["body"]["files"]
    if len(files) != 4 or {row["role"] for row in files} != set(expected_roles):
        raise ValueError("Receive all four complete original reviewer files.")
    for row in files:
        if row["name"] != expected_roles[row["role"]]:
            raise ValueError("Retain the selected original reviewer file names.")
        stored = objects[row["sha256"]]
        body = base64.b64decode(stored["base64"], validate=True)
        if len(body) != row["bytes"] or len(body) != stored["bytes"] or digest(body) != row["sha256"]:
            raise ValueError("The complete reviewer object differs: " + row["name"])
        relative = "stellar-forge/developer-site/dist/grant-data/" + row["name"]
        replace_bytes(source_root / relative, body)
        rows[relative] = {"path": relative, "bytes": len(body),
                          "sha256": digest(body), "git_blob": git_blob(body)}
    source_manifest = {
        "schema": "stellar-forge.current-source-edition.v1", "operationId": OPERATION,
        "phaseId": PHASE, "selection": packet["sourceSelection"],
        "originalSourceCommit": config["sourceCommit"],
        "sourcePackageSha256": source_package["sha256"],
        "files": [rows[key] for key in sorted(rows)],
    }
    original.write_json(source_root.parent / "manifest.json", source_manifest)
    phase_time = (datetime.fromisoformat(saved_config["at"].replace("Z", "+00:00"))
                  if saved_config else datetime.now(timezone.utc))
    if phase_time.utcoffset() is None:
        raise ValueError("Retain the original phase time with its UTC offset.")
    at = phase_time.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    current = {
        "operationId": OPERATION, "phaseId": PHASE, "at": at,
        "draftId": baseline["draftId"], "reviewId": baseline["reviewId"],
        "actorId": baseline["actorId"], "previousReviewEvents": baseline["reviewEvents"],
        "sourceRecords": source_package["sourceRecords"],
        "sourcePackageSha256": source_package["sha256"],
        "sourcePackagePath": str(package_path), "sourceRoot": str(source_root),
        "sourceSelection": packet["sourceSelection"],
        "originalDraftPath": str(case / baseline["draftPath"]),
        "originalReviewPath": str(case / baseline["reviewPath"]),
        "originalRecordPath": str(case / baseline["recordPath"]),
        "originalBrowserRecordPath": str(case / baseline.get("browserRecordPath", baseline["recordPath"])),
        "caseRoot": str(case), "receivingDirectory": receiving_directory,
        "precedingSourceDirectory": packet.get("precedingSourceDirectory"),
        "baseline": baseline,
        "originalResultPath": str(case / baseline["resultPath"]),
        "outputDirectory": str(output), "temporaryDirectory": str(temporary),
        "nodeModules": str(args.node_modules) if args.node_modules else None,
        "chromium": str(args.chromium) if args.chromium else None,
        "sourceInputSha256": args.expected_source_input_sha256,
    }
    if packet.get("preparedReview"):
        prepared = packet["preparedReview"]
        prepared_body = prepared["content"].encode("utf-8")
        if len(prepared_body) != prepared["bytes"] or digest(prepared_body) != prepared["sha256"]:
            raise ValueError("Retain the complete original authored current review.")
        prepared_path = output / "prepared-application-review.json"
        replace_bytes(prepared_path, prepared_body)
        current.update(preparedReviewPath=str(prepared_path),
                       preparedReviewSha256=prepared["sha256"])
    original.write_json(phase_config, current)
    replace_bytes(output / "complete-current-source-input.json", selected)
    environment = dict(os.environ)
    environment.update(TMPDIR=str(temporary), TEMP=str(temporary), TMP=str(temporary),
                       PYTHONDONTWRITEBYTECODE="1")
    context = {
        "source_selection": packet["sourceSelection"],
        "source_package": {key: source_package[key] for key in ("bytes", "sha256", "sourceRecords")},
        "original_case": {"bytes": args.case.stat().st_size, "sha256": args.expected_case_sha256},
        "runtime_selection": actual_runtime, "retained_attempt": str(attempt),
        "retired_members": retired, "original_review_id": baseline["reviewId"],
        "original_publication_operation": "SCF-GRANT-REVIEWER-PUBLICATION-8910-20261012",
        "library_replacement": {"library_file_id": args.replace_library_file_id,
                                "expected_version": args.expected_library_version},
    }
    print("SCF_SOURCE_RESUME_START " + json.dumps({
        "operationId": OPERATION, "phaseId": PHASE, "root": str(root),
        "retainedMembers": members, "materializedMembers": materialized,
        "sourceRecords": source_package["sourceRecords"], "sourceFiles": len(rows),
        "originalReviewActions": baseline["reviewEvents"],
        "nativeRecord": str(output / "native-process.json"),
    }), flush=True)
    native, result = run_receiving_program(
        OPERATION, root, output, context, args.node, None,
        runtime / "receive-source-package.mjs", phase_config, case, environment,
        args.timeout_seconds, "current-source-receiving", engine="native",
    )
    native.update({
        "schema": "stellar-forge.source-package-continuation-native.v1",
        "phaseId": PHASE, "sourceRecords": source_package["sourceRecords"],
        "receivingDirectory": receiving_directory,
        "sourceFiles": len(rows), "sourceSelection": packet["sourceSelection"],
        "originalCase": context["original_case"], "runtime": runtime_rows,
        "retainedMembers": members, "materializedMembers": materialized,
        "originalDraftId": result.get("originalDraftId") if result else None,
        "originalReviewId": result.get("originalReviewId") if result else None,
        "reviewActions": result.get("reviewActions") if result else None,
        "reviewStatus": result.get("reviewStatus") if result else None,
    })
    state = native["state"]
    original.write_json(output / "native-result.json", native)
    archive = root / ("SCF-Current-Application-and-Review" +
                      ("" if state == "COMPLETE" else "-Partial") + ".zip")
    original.archive_case(args.case, case, archive, output, retired)
    metadata = {"path": str(archive), "bytes": archive.stat().st_size,
                "sha256": original.file_digest(archive)}
    print("SCF_REVIEW_RESUME_RESULT " + json.dumps({**native, "archive": metadata}), flush=True)
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
