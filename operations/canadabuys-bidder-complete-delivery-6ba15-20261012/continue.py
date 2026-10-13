#!/usr/bin/env python3
"""Receive the complete merged CanadaBuys application with its original operating cases."""
from __future__ import annotations
import argparse
import ast
import gc
import hashlib
import json
from pathlib import Path
import stat
import sys

HERE = Path(__file__).resolve().parent
PINS = {
  "input.json": {
    "sha256": "60de2486a2db1d2f7fe702d2d6e6feb2dd25338805f4111d77a33f34cffd47cf",
    "bytes": 2815260
  },
  "complete_canadabuys_delivery.py": {
    "sha256": "699e3e4b1cb69675b3f69c4fa9e7d1af207a85b8188988a761c5ac9620f11c64",
    "bytes": 28307
  },
  "run-canadabuys-bidder-receiving.mjs": {
    "bytes": 89006,
    "sha256": "c2e11f67957a9466cda91dd305b5b9ee5ff0771cad703c3c85b80794f30c2b8f"
  },
  "integrated-source-selection.json": {
    "bytes": 14297,
    "sha256": "4f6decb00ee1488c4bcb15948753ab72282baa6441b5d9fd2eba27dec4295c3d"
  },
  "original-attempt-recovery.json": {
    "bytes": 6281,
    "sha256": "70643d3613d6d63112c4ec8203152953faac3807ad6bf43015159a0b810a1126"
  },
  "integrated-attempt-history.json": {
    "bytes": 10541,
    "sha256": "cb7bc950f51f7fcc8413006d3337e7bf4c473f9c6277861d303c7e26e187d933"
  },
  "official_library_save_bridge.py": {
    "bytes": 6048,
    "sha256": "e9715e42eea200b04489da61f05e5058bd21dc5c817f3830a379b7c541afe21d"
  },
  "runtime-attempt-history.json": {
    "sha256": "70050b45a6e2671c9658e96921793d34af60ab2a49b7c0ec24cca2d484187a53",
    "bytes": 16535
  }
}

def read_member(name):
    path = HERE / name
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode):
        raise RuntimeError("Selected delivery member is not an original regular file: " + name)
    raw = path.read_bytes()
    expected = PINS[name]
    if len(raw) != expected["bytes"] or hashlib.sha256(raw).hexdigest() != expected["sha256"]:
        raise RuntimeError("Complete delivery source differs: " + name)
    return raw

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", help="Actual installed Node executable")
    parser.add_argument("--playwright", help="Actual installed Playwright index.mjs")
    parser.add_argument("--chromium", help="Actual installed Chromium executable")
    parser.add_argument("--shared-directory", help="Absolute artifact staging directory available to the current file tool")
    parser.add_argument("--directory-parent", action="append",
                        help="Existing writable parent for this complete operation; may repeat")
    parser.add_argument("--batch", action="store_true",
                        help="Exit after all native results and saves; default retains the command loop for image review")
    options = parser.parse_args()
    selected = {name: read_member(name) for name in PINS}
    payload = json.loads(selected["input.json"])
    producer = selected["complete_canadabuys_delivery.py"].decode("utf-8")
    if payload["program"] != producer:
        raise RuntimeError("The complete input selects a different producer")
    runner = next(item for item in payload["programmeFiles"]
                  if item["path"] == payload["receiving"]["runnerFile"])
    if runner["content"].encode("utf-8") != selected["run-canadabuys-bidder-receiving.mjs"]:
        raise RuntimeError("The complete input selects a different receiving programme")
    if payload["priorAttemptRecovery"]["content"].encode("utf-8") != selected["original-attempt-recovery.json"]:
        raise RuntimeError("The original execution history differs")
    transition = next(item for item in payload["historyFiles"]
                      if item["path"] == "integrated-source-selection.json")
    if transition["content"].encode("utf-8") != selected["integrated-source-selection.json"]:
        raise RuntimeError("The integrated source selection differs")
    fixture = json.loads(next(item["content"] for item in payload["programmeFiles"]
                             if item["path"] == payload["receiving"]["fixtureFile"]))
    original = json.loads(next(item["content"] for item in payload["historyFiles"]
                               if item["path"] == "original-receiving-input.json"))
    if any(fixture[key] != original[key] for key in ("captures", "documents", "profile", "expected")):
        raise RuntimeError("The original complete operating cases changed")
    if payload["libraryBridgePin"] != PINS["official_library_save_bridge.py"]:
        raise RuntimeError("The supported save transport pin differs")
    bridge = next(item for item in payload["programmeFiles"]
                  if item["path"] == "official_library_save_bridge.py")
    if bridge["content"].encode("utf-8") != selected["official_library_save_bridge.py"]:
        raise RuntimeError("The selected complete save transport differs")
    original_runtime = dict(payload["runtime"])
    for name in ("node", "playwright", "chromium"):
        value = getattr(options, name)
        if value is not None:
            payload["runtime"][name] = str(Path(value).resolve(strict=True))
    if options.shared_directory:
        payload["sharedDirectory"] = str(Path(options.shared_directory).resolve())
    if options.directory_parent:
        payload["directoryParents"] = [str(Path(value).resolve(strict=True))
                                      for value in options.directory_parent]
    payload["keepAlive"] = not options.batch
    selection = {
        "schema": "commons.canadabuys.worker-runtime-selection.v1",
        "operationId": "CANADABUYS-BIDDER-DESK-6BA15-20261012",
        "publishedInput": PINS["input.json"],
        "originalRuntime": original_runtime,
        "selectedRuntime": payload["runtime"],
        "sharedDirectory": payload["sharedDirectory"],
        "librarySaveTool": "library_create_library_file",
        "directoryParents": payload["directoryParents"],
        "keepAlive": payload["keepAlive"],
        "entrypoint": str(HERE / "continue.py"),
        "pythonExecutable": sys.executable
    }
    raw = (json.dumps(selection, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    payload["historyFiles"].append({
        "path": "worker-runtime-selection.json", "content": raw.decode("utf-8"),
        "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()
    })
    history = next(item for item in payload["historyFiles"]
                   if item["path"] == "integrated-12385-receiving-history.json")
    if history["content"].encode("utf-8") != selected["integrated-attempt-history.json"]:
        raise RuntimeError("The retained integrated receiving history differs")
    runtime_history = next(item for item in payload["historyFiles"]
                           if item["path"] == "integrated-61367-runtime-history.json")
    if runtime_history["content"].encode("utf-8") != selected["runtime-attempt-history.json"]:
        raise RuntimeError("The original runtime attempt history differs")
    del runtime_history
    selected.clear()
    del fixture, original, runner, transition, history, bridge, raw, selection
    gc.collect()
    ast.parse(producer, filename=str(HERE / "complete_canadabuys_delivery.py"))
    print(json.dumps({"phase": "COMPLETE_CANADABUYS_INPUT_VERIFIED",
                      "sourceCommit": payload["sourceCommit"],
                      "publishedInput": PINS["input.json"],
                      "runtime": payload["runtime"], "keepAlive": payload["keepAlive"]}),
          flush=True)
    exec(compile(producer, str(HERE / "complete_canadabuys_delivery.py"), "exec"),
         {"__name__": "__main__", "PAYLOAD": payload})

if __name__ == "__main__":
    main()
