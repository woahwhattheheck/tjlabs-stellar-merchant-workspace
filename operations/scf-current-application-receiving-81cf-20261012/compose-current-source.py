#!/usr/bin/env python3
"""Compose the original SCF source receiver from the equipped owner's local inputs."""
import argparse
import ast
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import zipfile

OPERATION = "SCF-GRANT-CURRENT-REVIEW-81CF-20261012"
PHASE = "SCF-SUBMISSION-SOURCE-PACKAGE-A8CE-20261012"
ROOT = Path(__file__).resolve().parent
RUNTIME_FILES = (
    "source-phase.mjs", "receive-source-package.mjs", "receive_source.py",
    "receive_review.py", "receive_current.py", "scf_native_process.py",
    "SOURCE_RECEIVING.md", "receive-current-source-browser.mjs",
)

def sha(body):
    return hashlib.sha256(body).hexdigest()

def blob(body):
    return hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest()

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")

def safe_path(value):
    path = PurePosixPath(value)
    if not value or "\\" in value or "\0" in value or path.is_absolute() or ".." in path.parts or str(path) != value:
        raise ValueError("Select an exact source-relative path.")
    return path

def source_row(path, body):
    return {"path": path, "encoding": "utf-8", "bytes": len(body),
            "sha256": sha(body), "git_blob": blob(body),
            "content": body.decode("utf-8", errors="strict")}

def verified_asset(metadata, path):
    body = path.read_bytes()
    row = source_row(metadata["path"], body)
    if any(row[key] != metadata[key] for key in ("bytes", "sha256", "git_blob")):
        raise ValueError("The retained source differs from the selected asset: " + metadata["path"])
    return row

def write_exact(path, body):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + ".new")
    temporary.write_bytes(body)
    temporary.chmod(0o600)
    temporary.replace(path)

def original_payload(path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    assignments = [node for node in tree.body if isinstance(node, ast.Assign)
                   and any(isinstance(target, ast.Name) and target.id == "ENVELOPE"
                           for target in node.targets)]
    if len(assignments) != 1:
        raise ValueError("Select the original complete controller with its single source envelope.")
    envelope = ast.literal_eval(assignments[0].value)
    if envelope.get("codec") != "lzss16-base64":
        raise ValueError("Retain the selected original controller source codec.")
    packed = base64.b64decode(envelope["data"], validate=True)
    output = bytearray()
    offset = 0
    while offset < len(packed):
        flags = packed[offset]
        offset += 1
        for bit in range(8):
            if offset >= len(packed):
                break
            if flags & (1 << bit):
                if offset + 3 > len(packed):
                    raise ValueError("The original source envelope is incomplete.")
                distance = packed[offset] | (packed[offset + 1] << 8)
                count = packed[offset + 2] + 3
                offset += 3
                if not distance or distance > len(output):
                    raise ValueError("The original source envelope distance differs.")
                for _ in range(count):
                    output.append(output[-distance])
            else:
                output.append(packed[offset])
                offset += 1
            if len(output) > envelope["bytes"]:
                raise ValueError("The original source envelope exceeds its declared size.")
    if len(output) != envelope["bytes"] or sha(output) != envelope["sha256"]:
        raise ValueError("The original complete controller source differs.")
    payload = json.loads(output)
    if sha(payload["helper"].encode("utf-8")) != payload["helperSha256"]:
        raise ValueError("Retain the unchanged original official transfer helper.")
    return payload

def literal_envelope(payload):
    body = encoded(payload)
    packed = bytearray()
    # The existing LZSS decoder accepts complete literal groups. This local
    # composition needs no second compression library or remote data transfer.
    for offset in range(0, len(body), 8):
        packed.append(0)
        packed.extend(body[offset:offset + 8])
    return {"codec": "lzss16-base64", "bytes": len(body), "sha256": sha(body),
            "data": base64.b64encode(packed).decode("ascii")}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", type=Path, required=True)
    parser.add_argument("--expected-case-sha256", required=True)
    parser.add_argument("--source-package", type=Path, required=True)
    parser.add_argument("--reader-html", type=Path, required=True)
    parser.add_argument("--original-controller", type=Path, required=True)
    parser.add_argument("--prepared-review", type=Path,
                        help="The original authors' complete following application review.")
    parser.add_argument("--library-file-id", required=True)
    parser.add_argument("--library-file-version-id", required=True)
    parser.add_argument("--library-version", type=int, required=True)
    parser.add_argument("--expected-review-actions", type=int, default=135)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    for path in (args.case, args.source_package, args.reader_html, args.original_controller):
        if not path.is_absolute() or not path.is_file():
            raise ValueError("Select the equipped owner's existing absolute local input: " + str(path))
    if not args.output.is_absolute() or args.library_version < 0 or args.expected_review_actions < 1:
        raise ValueError("Select an absolute output directory and the actual saved case version.")
    selection = json.loads((ROOT / "source-assets-selection.json").read_text(encoding="utf-8"))
    case_bytes = args.case.stat().st_size
    with args.case.open("rb") as stream:
        case_sha = hashlib.file_digest(stream, "sha256").hexdigest()
    if case_sha != args.expected_case_sha256:
        raise ValueError("The complete original case differs from its selected local hash.")
    package_body = args.source_package.read_bytes()
    expected_package = selection["sourcePackage"]
    if len(package_body) != expected_package["bytes"] or sha(package_body) != expected_package["sha256"]:
        raise ValueError("Select the complete original reviewer source package for this phase.")
    package = json.loads(package_body)
    files = package["received"]["bundle"]["body"]["files"]
    expected_roles = {"application", "source-index", "budget", "product-and-finance"}
    if len(files) != 4 or {row["role"] for row in files} != expected_roles:
        raise ValueError("Receive all four complete reviewer source files.")
    objects = {row["sha256"]: row for row in package["received"]["objects"]}
    for file in files:
        stored = objects[file["sha256"]]
        body = base64.b64decode(stored["base64"], validate=True)
        if len(body) != file["bytes"] or len(body) != stored["bytes"] or sha(body) != file["sha256"]:
            raise ValueError("The complete reviewer file differs: " + file["name"])
        if file["role"] == "source-index":
            if len(json.loads(body)["sources"]) != expected_package["sourceRecords"]:
                raise ValueError("The selected complete source count differs.")

    baseline = {
        "draftPath": "receiving/downloads/Current_Complete_Submission.json",
        "reviewPath": "receiving/review-continuation/downloads/Current_Complete_Review.json",
        "recordPath": "receiving/saved-submission-record.json",
        "resultPath": "receiving/review-continuation/RESULT.json",
    }
    with zipfile.ZipFile(args.case) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("The retained case contains duplicate members.")
        for key in baseline:
            if baseline[key] not in names:
                raise ValueError("The complete original case is missing its " + key)
        config = json.loads(archive.read("config.json"))
        draft_body = archive.read(baseline["draftPath"])
        draft = json.loads(draft_body)["draft"]
        review_export = json.loads(archive.read(baseline["reviewPath"]))
        review = review_export["round"]
        result = json.loads(archive.read(baseline["resultPath"]))
    if config["sourceCommit"] != selection["originalSourceCommit"]:
        raise ValueError("Continue the selected original source in the saved case.")
    if result["state"] != "COMPLETE" or result["reviewActions"] != args.expected_review_actions:
        raise ValueError("Continue the actual completed original native review.")
    if len(review["events"]) != args.expected_review_actions or result["originalReviewId"] != review["id"] or result["originalDraftId"] != draft["id"]:
        raise ValueError("The retained review result, draft and complete history differ.")
    baseline.update(draftId=draft["id"], reviewId=review["id"],
                    actorId="scf-application-reviewer-81cf",
                    reviewEvents=args.expected_review_actions)

    assets = []
    for metadata in selection["assets"]:
        relative = safe_path(metadata["path"])
        if metadata["path"] == selection["readerPath"]:
            path = args.reader_html
        else:
            supplied = ROOT.joinpath("assets", *relative.parts)
            path = supplied if supplied.is_file() else ROOT.parents[1].joinpath(*relative.parts)
        assets.append(verified_asset(metadata, path))
    runtime = [source_row(name, (ROOT / name).read_bytes()) for name in RUNTIME_FILES]
    asset_metadata = [
        {key: row[key] for key in ("path", "bytes", "sha256", "git_blob")}
        for row in sorted(assets, key=lambda row: row["path"])
    ]
    basis = {
        "originalSourceCommit": config["sourceCommit"],
        "originalSourceFiles": len(config["files"]),
        "currentRuntimeSourceCommit": selection["currentRuntimeSourceCommit"],
        "currentApplicationSourceCommit": selection["currentApplicationSourceCommit"],
        "sourcePackageSha256": sha(package_body), "assets": asset_metadata,
    }
    source_selection = {"id": sha(encoded(basis).rstrip(b"\n")), **basis}
    current_input = {
        "schema": "stellar-forge.current-source-receiving-input.v1",
        "operationId": OPERATION, "phaseId": PHASE,
        "originalCase": {
            "libraryId": args.library_file_id, "version": args.library_version,
            "fileId": args.library_file_version_id, "bytes": case_bytes, "sha256": case_sha,
        },
        "baseline": baseline, "sourceSelection": source_selection,
        "sourcePackage": {
            "bytes": len(package_body), "sha256": sha(package_body),
            "sourceRecords": expected_package["sourceRecords"],
            "content": package_body.decode("utf-8", errors="strict"),
        },
        "assets": assets,
        "runtime": [{key: row[key] for key in ("path", "bytes", "sha256", "git_blob")}
                    for row in runtime],
    }
    prepared_path = args.prepared_review or ROOT / "following-application-review.json"
    if prepared_path.is_file():
        prepared_body = prepared_path.read_bytes()
        prepared = json.loads(prepared_body)
        if prepared.get("schema") != "scf.current-application-review.v1" or prepared.get("review_id") != review["id"]:
            raise ValueError("Select the original authors' complete current application review.")
        roles = {"application": "application", "companion": "product-and-finance", "index": "source-index"}
        for name, role in roles.items():
            selected_file = next(row for row in files if row["role"] == role)
            review_file = prepared["selection"][name]
            if any(selected_file[key] != review_file[key] for key in ("bytes", "sha256")):
                raise ValueError("The authored current review selects a different " + name)
        current_input["preparedReview"] = {
            "bytes": len(prepared_body), "sha256": sha(prepared_body),
            "content": prepared_body.decode("utf-8", errors="strict"),
        }
    elif args.prepared_review:
        raise ValueError("Select the existing complete local prepared review file.")
    input_body = encoded(current_input)
    input_row = source_row("complete-current-source-input.json", input_body)
    old = original_payload(args.original_controller)
    wrapper_payload = {
        "operation": OPERATION, "sourcePhase": PHASE,
        "files": [
            {"name": row["path"], "bytes": row["bytes"], "sha256": row["sha256"],
             "gitSha": row["git_blob"], "content": row["content"]}
            for row in runtime + [input_row]
        ],
        "helper": old["helper"], "helperSha256": old["helperSha256"],
        "caseBytes": case_bytes, "caseSha256": case_sha,
        "caseFileId": args.library_file_version_id, "libraryId": args.library_file_id,
        "expectedVersion": args.library_version, "sourceCommit": config["sourceCommit"],
        "sourceInputName": input_row["path"], "sourceInputSha256": input_row["sha256"],
        "sourceSelection": source_selection["id"],
        "sourceRecords": expected_package["sourceRecords"],
        "sourcePackageSha256": sha(package_body), "baseline": baseline,
        "originalSubmissionSha256": sha(draft_body),
    }
    template = (ROOT / "receive-original-grant-source.py.in").read_text(encoding="utf-8")
    if template.count("__SOURCE_ENVELOPE__") != 1:
        raise ValueError("Select the complete original controller template.")
    wrapper = template.replace("__SOURCE_ENVELOPE__", json.dumps(literal_envelope(wrapper_payload), separators=(",", ":")))
    ast.parse(wrapper)
    args.output.mkdir(parents=True, exist_ok=True, mode=0o700)
    for row in runtime:
        write_exact(args.output / row["path"], row["content"].encode("utf-8"))
    write_exact(args.output / input_row["path"], input_body)
    wrapper_path = args.output / "receive-original-grant-source.py"
    write_exact(wrapper_path, wrapper.encode("utf-8"))
    result = {
        "schema": "stellar-forge.local-source-receiver-composition.v1",
        "operationId": OPERATION, "phaseId": PHASE,
        "sourceRecords": expected_package["sourceRecords"], "assets": len(assets),
        "originalReviewEvents": args.expected_review_actions,
        "sourceSelection": source_selection["id"],
        "sourceInput": {key: input_row[key] for key in ("path", "bytes", "sha256", "git_blob")},
        "wrapper": {"path": str(wrapper_path), "bytes": len(wrapper.encode("utf-8")),
                    "sha256": sha(wrapper.encode("utf-8"))},
        "sourceReceivingGuide": str(args.output / "SOURCE_RECEIVING.md"),
    }
    write_exact(args.output / "LOCAL-COMPOSITION.json", encoded(result))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
