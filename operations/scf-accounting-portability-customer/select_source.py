#!/usr/bin/env python3
"""Receive the complete pinned accounting application and its delivery tools."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

TOOLS = ("select_source.py", "SOURCE_REQUIREMENTS.json", "receive_customer.py",
         "serve_customer.mjs", "operate_customer.mjs", "build_customer_handover.py",
         "CUSTOMER_HANDOVER.md")
PREFIX = "operations/scf-accounting-portability-customer/"

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args])

def atom(path, data, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".receiving-", delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.chmod(mode)
    os.replace(temporary, path)

def receive(repo, ref, path):
    data = git(repo, "show", ref + ":" + path)
    blob = git(repo, "rev-parse", ref + ":" + path).decode().strip()
    assert hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == blob, path
    return data, {"path": path, "bytes": len(data), "sha256": sha(data), "gitSha": blob}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path)
    parser.add_argument("--application-ref", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    requirements = json.loads(Path(__file__).with_name("SOURCE_REQUIREMENTS.json").read_text())
    operated = requirements["sourceCommit"]
    application_ref = git(args.repo, "rev-parse", args.application_ref + "^{commit}").decode().strip()
    request = {"schema": "stellar-forge.accounting-customer-source-request.v1",
               "operatedSourceCommit": operated, "applicationCommit": application_ref,
               "originalSourceSelectionSha256": requirements["originalSourceSelectionSha256"],
               "requirementsSha256": sha(Path(__file__).with_name("SOURCE_REQUIREMENTS.json").read_bytes())}
    output = args.output.resolve()
    output.mkdir(mode=0o700, exist_ok=True)
    request_path = output / "SOURCE_REQUEST.json"
    if request_path.exists():
        assert json.loads(request_path.read_text()) == request, "This source directory belongs to different pins."
    else:
        atom(request_path, (json.dumps(request, indent=2) + "\n").encode())
    rows = []
    for row in requirements["files"]:
        rel = row["path"]
        data, original = receive(args.repo, operated, rel)
        assert all(original[key] == row[key] for key in ("bytes", "sha256", "gitSha")), rel
        if rel in requirements["frontendPaths"]:
            data, current = receive(args.repo, application_ref, rel)
            current["originalGitSha"] = original["gitSha"]
            current["originalSha256"] = original["sha256"]
        else:
            current = original
        target = output / "application" / rel
        if target.exists():
            assert target.read_bytes() == data, "Retained source differs: " + rel
        else:
            atom(target, data)
        rows.append(current)
    fulfillment = []
    for name in TOOLS:
        data, row = receive(args.repo, application_ref, PREFIX + name)
        target = output / "tools" / name
        if target.exists():
            assert target.read_bytes() == data, "Retained fulfillment source differs: " + name
        else:
            atom(target, data)
        fulfillment.append(row)
    selection = [{key: row[key] for key in ("path", "bytes", "gitSha")}
                 for row in sorted(rows, key=lambda row: row["path"])]
    index = {**request, "schema": "stellar-forge.accounting-customer-source.v1",
             "files": rows, "sourceFiles": len(rows), "sourceBytes": sum(row["bytes"] for row in rows),
             "sourceSelectionSha256": sha(json.dumps(selection, separators=(",", ":"), ensure_ascii=False).encode()),
             "fulfillmentFiles": fulfillment}
    atom(output / "SOURCE.json", (json.dumps(index, indent=2) + "\n").encode())
    print(json.dumps({"status": "COMPLETE", "sourceFiles": index["sourceFiles"],
                      "sourceBytes": index["sourceBytes"], "applicationCommit": application_ref,
                      "sourceSelectionSha256": index["sourceSelectionSha256"]}))

if __name__ == "__main__":
    main()
