#!/usr/bin/env python3
"""JSON operations for the complete selected partner installation."""
from __future__ import annotations
import argparse
import math
import os
from pathlib import Path
import subprocess
import sys
import zipfile
from files import WorkbenchError, absolute, decode, digest, encoded, exact, identifier, need, read
import manage
from source import selected_manifest, check_source

REQUEST = "stellar-forge.partner-operation-request.v1"
RESULT = "stellar-forge.partner-operation-result.v1"
CURRENT_REQUEST = {}
MAX_REQUEST = 2 * 1024 * 1024
READS = {"workspace.state": (), "workspace.record": ("kind","id"), "workspace.history": ("kind","id"),
         "workspace.source": ("id",), "workspace.compare": ("ids",), "workspace.stations": ("id",)}
FIELDS = {
    "source.inspect": (("source_root", "source_manifest"), ("source_root", "source_manifest")),
    "installation.prepare": (("source_root", "source_manifest", "directory", "python", "workspace_archive"),
                             ("source_root", "source_manifest", "directory")),
    "installation.inspect": ((), ()),
    "installation.receive": (("archive_path", "directory", "python"), ("archive_path", "directory")),
    "installation.snapshot": (("output",), ("output",)),
    "installation.adopt_source": (("source_root", "source_manifest"), ("source_root", "source_manifest")),
    "workspace.export": (("kind", "output"), ("kind", "output")),
    "commands.describe": (("ready_file", "port"), ("ready_file",)),
    "requests.get": (("request_id", "origin_installation_id"), ("request_id",)),
}
MUTATIONS = {"installation.prepare", "installation.receive", "installation.snapshot", "installation.adopt_source",
             "workspace.export"}


def safe_numbers(value):
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return value
    if isinstance(value, int):
        return str(value) if abs(value) > 9007199254740991 else value
    if isinstance(value, float):
        need(math.isfinite(value), "invalid_native_number", "The original result contains a non-finite number.")
        return value
    if isinstance(value, list):
        return [safe_numbers(item) for item in value]
    if isinstance(value, dict):
        return {key: safe_numbers(item) for key, item in value.items()}
    return value


def run(request):
    exact(request, ("schema", "operation", "arguments", "installation", "request_id", "binding"),
          ("schema", "operation"))
    need(request["schema"] == REQUEST, "request_schema", "Use the partner operation request schema.")
    operation = request["operation"]
    args = request.get("arguments", {})
    if operation in READS:
        exact(args, READS[operation], READS[operation])
    else:
        need(operation in FIELDS, "unknown_operation", "Select a declared partner product operation.")
        exact(args, *FIELDS[operation])
    request_id = request.get("request_id")
    if operation in MUTATIONS:
        identifier(request_id)
    elif request_id is not None:
        identifier(request_id)
    root = request.get("installation")
    if operation not in ("source.inspect", "installation.prepare", "installation.receive"):
        need(root is not None, "installation_required", "Select the original installed partner directory.")
    binding = request.get("binding")
    if root is not None and operation != "installation.adopt_source":
        selected = manage.installation(root)
        manage.check_binding(selected, binding)
    result = None; value = None
    if operation == "source.inspect":
        manifest, original = selected_manifest(args["source_manifest"])
        check_source(args["source_root"], manifest)
        result = {"source": manifest, "selection": original, "files": len(manifest["files"]),
                  "bytes": sum(x["bytes"] for x in manifest["files"])}
    elif operation == "installation.prepare":
        result = manage.prepare(source_root=args["source_root"], source_manifest=args["source_manifest"],
                                directory_path=args["directory"], python=args.get("python", str(Path(sys.executable).resolve())),
                                operation_id=request_id, workspace_archive=args.get("workspace_archive"))
        value = result["installation"]
    elif operation == "installation.receive":
        result = manage.receive(archive_path=args["archive_path"], directory_path=args["directory"],
                                python=args.get("python", str(Path(sys.executable).resolve())), operation_id=request_id)
        value = result["installation"]
    elif operation == "installation.inspect":
        result = manage.inspect(root); value = result["installation"]
    elif operation == "installation.snapshot":
        result = manage.snapshot(root, args["output"], request_id)
    elif operation == "installation.adopt_source":
        result = manage.adopt_source(root, args["source_root"], args["source_manifest"], request_id, binding)
        value = result["installation"]
    elif operation == "workspace.export":
        result = manage.export_original(root, args["kind"], args["output"], request_id)
    elif operation == "commands.describe":
        result = manage.describe_commands(root, args)
    elif operation == "requests.get":
        result = manage.request_record(root, args["request_id"], args.get("origin_installation_id"))
    else:
        result = manage.read_business(root, operation, args)
    if value is None and root is not None:
        value = manage.installation(root, verify=False)
    return {"schema": RESULT, "ok": True, "operation": operation, "request_id": request_id,
            "installation": manage.summary(value) if value else None, "result": result,
            "replayed": bool(isinstance(result, dict) and result.get("replayed")),
            "adapter_sha256": digest(Path(__file__).read_bytes())}


def main():
    global CURRENT_REQUEST
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", default="-")
    options = parser.parse_args()
    raw = sys.stdin.buffer.read(MAX_REQUEST + 1) if options.request == "-" else read(absolute(options.request), MAX_REQUEST)
    need(len(raw) <= MAX_REQUEST, "request_size", "The complete native JSON request exceeds two MiB.")
    request = decode(raw)
    need(isinstance(request, dict), "request_object", "The complete request must be a JSON object.")
    CURRENT_REQUEST = request
    need(isinstance(request.get("arguments", {}), dict), "arguments_object", "Operation arguments must be a JSON object.")
    # The selected original interpreter runs the original model and standard-library dependencies.
    # Forward one unchanged complete request if the adapter was opened by another
    # supported Python; never reinterpret source fields as shell commands.
    target = request.get("arguments", {}).get("python") if isinstance(request, dict) else None
    if target is None and isinstance(request, dict) and request.get("installation"):
        try:
            target = manage.installation(request["installation"], verify=False)["python"]["path"]
        except (FileNotFoundError, WorkbenchError):
            pass
    if target:
        resolved = absolute(target).resolve(strict=True)
        if resolved != Path(sys.executable).resolve():
            result = subprocess.run([str(resolved), "-B", str(Path(__file__).resolve())], input=raw)
            return result.returncode
    answer = run(request)
    print(encoded(safe_numbers(answer)).decode(), end="", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (WorkbenchError, ValueError, KeyError, TypeError, OSError, EOFError, ImportError, zipfile.BadZipFile, subprocess.SubprocessError) as error:
        # Source paths and original error descriptions are useful local detail.
        # Request values, process environments and native account secrets are not echoed.
        code = getattr(error, "code", "original_partner_operation_failed")
        reply = {"schema": RESULT, "ok": False, "operation": CURRENT_REQUEST.get("operation"),
                 "request_id": CURRENT_REQUEST.get("request_id"), "error": {"code": str(code), "message": str(error)[:2000]},
                 "adapter_sha256": digest(Path(__file__).read_bytes())}
        print(encoded(reply).decode(), end="", flush=True)
        raise SystemExit(2)
