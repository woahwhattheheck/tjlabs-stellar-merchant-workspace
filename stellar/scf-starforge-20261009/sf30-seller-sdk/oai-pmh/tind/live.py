"""MIT. Private live attachment to the original TIND workspace owner."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import tempfile
from bridge import InputError
from harvest import jbytes

SCHEMA = "stellar-forge.tind-live-connection.v1"
RELATIVE = "oai/tind/live.json"

def publish(owner, announcement):
    target = owner.root / RELATIVE
    if target.is_symlink() or target.exists() and not target.is_file():
        raise InputError("The original TIND live attachment must be a regular private file")
    document = {"schema": SCHEMA, "workspace": str(owner.root), "instanceId": announcement["instanceId"],
                "launch": announcement}
    content = jbytes(document)
    fd, temporary = tempfile.mkstemp(prefix=".live-", suffix=".partial", dir=owner.area)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(content); output.flush(); os.fsync(output.fileno())
        os.replace(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return {"path": str(target), "sha256": hashlib.sha256(content).hexdigest(),
            "instanceId": announcement["instanceId"]}

def retire(attachment):
    target = Path(attachment["path"])
    if target.is_symlink():
        return
    try:
        content = target.read_bytes()
        if hashlib.sha256(content).hexdigest() == attachment["sha256"]:
            selected = json.loads(content)
            if selected.get("instanceId") == attachment["instanceId"]:
                target.unlink()
    except (OSError, ValueError):
        pass
