"""Following-source chapter for the same original Material receiving operation.

No host, browser, catalogue, case writer or independent controller is created.
The caller supplies its original Operations instances, output writer and command.
"""
from pathlib import Path
import hashlib
import stat
import zipfile

MAX_SOURCE = 128 * 1024 * 1024


def need(value, message):
    if not value:
        raise ValueError(message)


def capture_original(spec, root, raw, keep):
    data = raw(spec["sourcePath"], MAX_SOURCE)
    need(len(data) == spec["bytes"] and hashlib.sha256(data).hexdigest() == spec["sha256"],
         "The selected complete original following catalogue changed.")
    keep("Original_Following_Catalogue.jsonl", data)
    return {**spec, "sourcePath": str(root / "Original_Following_Catalogue.jsonl")}


def verify_native(ops, case_id, browser, source, root, raw, keep):
    result = browser.get("followingInstallation")
    if source.get("followingInstallation") is None:
        need(result is None, "An unselected following operation appeared.")
        return None
    spec = source["followingInstallation"]
    need(result and result["originalInstallation"] == browser["installation"],
         "Retain the same original saved Installation and actual following receipt.")
    selected = result["installation"]
    old = ops.installation(case_id, result["originalInstallation"]["id"], result["originalInstallation"]["revision"])
    row = ops.installation(case_id, selected["id"], selected["revision"])
    need(old["sha256"] == result["originalInstallation"]["sha256"] and selected["id"] == old["id"] and
         selected["revision"] == old["revision"] + 1 and row["sha256"] == selected["sha256"],
         "The complete same-ID Installation history differs.")
    for key, value in old["preview"]["document"].items():
        if key not in ("source", "receiving"):
            need(row["preview"]["document"][key] == value, "The following source changed original " + key)
    meta, data = ops.source(case_id, result["sourceId"])
    need(len(data) == spec["bytes"] and meta["sha256"] == spec["sha256"] and
         hashlib.sha256(data).hexdigest() == spec["sha256"] and
         data == raw(root / "Original_Following_Catalogue.jsonl", MAX_SOURCE),
         "The following original attachment changed.")
    for section in ("source", "receiving"):
        need(result["sourceId"] in row["preview"]["document"][section]["sourceIds"],
             "The following original source is absent from the saved bindings.")
    keep("Following_Actual_Saved_Installation.json", row)
    return result


def receive_customer(result, root, node, raw, identity, write, command, keep):
    if result is None:
        return None
    path = root / "Material_Following_Complete_Handover.zip"
    need(identity(path) == result["customer"], "The complete following customer archive differs.")
    target = root / "independent-following-material-handover"
    with zipfile.ZipFile(path) as archive:
        members, names, total = archive.infolist(), set(), 0
        need(0 < len(members) <= 1000, "Retain the complete bounded following customer archive.")
        for member in members:
            name, mode = member.filename, member.external_attr >> 16
            need(name and not name.startswith("/") and chr(92) not in name and
                 all(x not in ("", ".", "..") for x in name.split("/")) and name not in names and
                 not member.is_dir() and stat.S_IFMT(mode) in (0, stat.S_IFREG),
                 "Receive unique confined regular customer files.")
            names.add(name)
            total += member.file_size
            need(total <= 512 * 1024 * 1024, "Retain the complete original customer bound.")
        need(archive.testzip() is None, "A complete following customer member differs.")
        target.mkdir(mode=0o700, exist_ok=True)
        for member in members:
            write(target / member.filename, archive.read(member), True)
    import json
    reopened = json.loads(command("independent-following-material-reopen", [
        node, target / "application/products/material-catalog/commissioning/cli.mjs",
        "reopen", "--directory", target]))
    keep("Independent_Following_Material_Reopen.json", reopened)
    need(raw(target / "source/customer-catalog.jsonl", MAX_SOURCE) ==
         raw(root / "Original_Following_Catalogue.jsonl", MAX_SOURCE),
         "Cold following package changed its exact original catalogue.")
    return {"archive": identity(path), "members": len(members), "independentReopen": "COMPLETE"}


def verify_cold(ops, case_id, result, source, root, raw):
    if result is None:
        return
    for selected in (result["originalInstallation"], result["installation"]):
        row = ops.installation(case_id, selected["id"], selected["revision"])
        need(row["sha256"] == selected["sha256"], "Cold case receiving changed a saved Installation edition.")
    meta, data = ops.source(case_id, result["sourceId"])
    need(meta["sha256"] == source["followingInstallation"]["sha256"] and
         data == raw(root / "Original_Following_Catalogue.jsonl", MAX_SOURCE),
         "Cold case receiving changed the complete following original source.")
