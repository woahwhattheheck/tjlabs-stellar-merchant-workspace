#!/usr/bin/env python3
"""MIT. Continue the one completed Results case through its original local console."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import zipfile

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from iati_workspace import IatiWorkspace, InputError
from server import OperatorServer
from managed import require_binding, startup
from workspace import json_bytes, load_json, regular, file_digest
from results.receiving import RESULT, private_directory, write_json
from results import get_results


def need(value, message):
    if not value:
        raise InputError(message)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Continue the completed native Results case in its original browser, client and Merchant tools")
    parser.add_argument("--root", required=True, help="Absolute completed results receiving root")
    parser.add_argument("--node", required=True, help="Installed Node executable")
    parser.add_argument("--playwright", required=True, help="Absolute installed Playwright module entry or directory")
    parser.add_argument("--chromium", required=True, help="Absolute installed Chromium executable")
    parser.add_argument("--merchant-root", required=True, help="The original mcp-merchant-operator source directory")
    parser.add_argument("--reviewer", required=True, help="Named local receiving reviewer")
    parser.add_argument("--review-note", required=True, help="Authored receiving review basis, distinct from publisher endorsement")
    args = parser.parse_args(argv)
    root = Path(args.root).absolute()
    need(root.resolve() == root, "Select the original receiving root without aliases")
    need((root / "result.json").is_file(), "Complete the original native Results receiving first")
    outcome = load_json((root / "result.json").read_bytes())
    need(outcome.get("schema") == RESULT and outcome.get("state") == "COMPLETE",
         "The original receiving outcome is not complete")
    for name in ("node", "playwright", "chromium", "merchant_root"):
        selected = Path(getattr(args, name)).absolute()
        need(selected.exists() and selected.resolve() == selected,
             "Select the original installed runtime or source path: " + name)
    need(args.reviewer.strip() and args.review_note.strip(), "Supply the receiving reviewer and authored basis")
    output = private_directory(root / "console-receiving")
    private = private_directory(root / "console-private")
    connection = private / "console-url.txt"
    configuration = private / "browser-selection.json"
    selection = {"schema": "stellar-forge.iati-results-browser-selection.v1",
        "root": str(root), "output": str(output), "sourceRoot": str(HERE.parent.parent),
        "operationId": outcome["operationId"], "connectionFile": str(connection),
        "node": str(Path(args.node).absolute()), "playwright": str(Path(args.playwright).absolute()),
        "chromium": str(Path(args.chromium).absolute()), "merchantRoot": str(Path(args.merchant_root).absolute()),
        "reviewer": args.reviewer, "reviewNote": args.review_note}
    write_json(configuration, selection, immutable=True)
    status = {"schema": "stellar-forge.iati-results-console-receiving.v1",
              "operationId": outcome["operationId"], "project": outcome["project"],
              "workspace": str(root / "receiver"), "output": str(output)}
    with IatiWorkspace(root / "receiver", create=False) as workspace:
        binding = require_binding(root / "receiver", None)
        server = OperatorServer(workspace, port=0)
        server.launch = startup(server, binding, str(connection))
        fd, temporary = tempfile.mkstemp(prefix=".console-", dir=private)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                os.fchmod(stream.fileno(), 0o600)
                stream.write(server.url + "\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, connection)
        finally:
            Path(temporary).unlink(missing_ok=True)
        thread = threading.Thread(target=server.serve_forever, name="Original-IATI-console")
        thread.start()
        print(json.dumps(status | {"state": "ORIGINAL_CONSOLE_RUNNING", "port": server.server_port}), flush=True)
        try:
            environment = os.environ.copy()
            environment["TMPDIR"] = str(private_directory(output / "tmp"))
            environment["TMP"] = environment["TMPDIR"]
            environment["TEMP"] = environment["TMPDIR"]
            result = subprocess.run([selection["node"], str(HERE / "browser_receiving.mjs"), str(configuration)],
                                    env=environment, stdin=subprocess.DEVNULL)
            need(result.returncode == 0, "The original console continuation remains incomplete; retain its exact progress and workspace")
        finally:
            server.shutdown()
            thread.join()
            server.server_close()

    # The browser, Node client, and Merchant file readers are all closed before
    # cold reopening the same original SQLite workspace.
    browser = load_json((output / "browser-result.json").read_bytes())
    with IatiWorkspace(root / "receiver", create=False) as workspace:
        api = get_results(workspace)
        edition = api.project(outcome["project"], browser["reviewRevision"])
        need(edition["sha256"] == browser["editionSha256"], "Original browser review changed on cold reopen")
        need(api.project(outcome["project"])["revision"] == browser["reviewRevision"],
             "Another operator selected a later head; retain that original choice")
        packet = Path(browser["artifacts"]["completeProject"]["file"])
        need(file_digest(packet, 4 * 1024 * 1024 * 1024) == browser["artifacts"]["completeProject"]["sha256"],
             "Complete Merchant receiving packet changed")
        with zipfile.ZipFile(packet) as archive:
            manifest = load_json(archive.read("manifest.json"))
            need(manifest["selectedEditionSha256"] == edition["sha256"]
                 and manifest["reportSha256"] == edition["report"]["reportSha256"],
                 "The original complete handover selects a different review")
        final = status | {"state": "COMPLETE", "coldReopen": True,
            "reviewRevision": edition["revision"], "editionSha256": edition["sha256"],
            "reportSha256": edition["report"]["reportSha256"],
            "browser": browser, "managedSource": binding["source"],
            "publisherRequests": 0, "providerRequests": 0, "financialDatasetBuilds": 0}
    write_json(output / "console-result.json", final, immutable=True)
    print(json.dumps(final, ensure_ascii=False, separators=(",", ":")), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (InputError, OSError, ValueError) as error:
        print(json.dumps({"state": "INCOMPLETE", "error": str(error)}), file=sys.stderr, flush=True)
        raise SystemExit(2)
