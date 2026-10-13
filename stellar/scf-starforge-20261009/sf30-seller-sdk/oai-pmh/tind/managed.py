"""MIT. Original OAI identity with the complete TIND source and native listener."""
from __future__ import annotations
import hashlib
import importlib.util
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("stellar_original_oai_managed_tind", HERE.parent / "managed.py")
original = importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)

SCHEMA = "stellar-forge.tind-managed-binding.v1"
STARTUP = "stellar-forge.tind-workspace-launch.v1"
SOURCE_FILES = (
    "marc.py", "migration.py", "native.py", "native_jobs.py", "source_cases.py", "source_files.py", "production_waves.py", "cli.py", "cli.mjs", "server.py",
    "managed.py", "browser.mjs", "index.html", "style.css", "application-provider.mjs",
)

def inspect_binding(directory):
    result = original.inspect_binding(directory)
    result.pop("sha256")
    result["schema"] = SCHEMA
    for name in SOURCE_FILES:
        result["source"]["oai-pmh/tind/" + name] = original.source_digest(HERE / name)
    core = {key: value for key, value in result.items() if key != "sourceRoot"}
    return {**result, "sha256": hashlib.sha256(original.encoded(core)).hexdigest()}

def require_binding(directory, expected=None):
    value = inspect_binding(directory)
    if expected is not None and value["sha256"] != expected:
        raise original.InputError("The selected repository, Python or TIND source changed; reopen its current application settings")
    return value

def startup(server, binding, token):
    console = "http://127.0.0.1:" + str(server.server_port) + "/#" + token
    return {"schema": STARTUP, "status": "TIND_WORKSPACE_READY", "workspace": binding["workspace"],
            "bindingSha256": binding["sha256"], "sourceRoot": binding["sourceRoot"], "python": binding["python"],
            "console": console, "url": console, "pid": os.getpid()}
