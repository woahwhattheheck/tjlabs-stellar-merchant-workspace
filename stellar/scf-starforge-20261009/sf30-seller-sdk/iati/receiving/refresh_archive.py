#!/usr/bin/env python3
"""MIT. Full original refresh packet inspection and customer archive publication."""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import stat
import sys
import uuid

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from iati_workspace import InputError, MAX_METADATA, MAX_PACKET, packet_write
from workspace import load_json, json_bytes, file_digest, regular, digest, private_write, sync_dir
from refresh_packet import read_packet


def write_once(path, value):
    data = json_bytes(value)
    if path.exists() or path.is_symlink():
        regular(path, MAX_METADATA)
        if path.read_bytes() != data:
            raise InputError("The complete retained archive observation changed")
        return
    temporary = path.with_name("." + path.name + "." + uuid.uuid4().hex + ".partial")
    private_write(temporary, data)
    os.rename(temporary, path)
    sync_dir(path.parent)


def descriptor(path):
    return {"path": str(path), "bytes": regular(path, MAX_PACKET).st_size,
            "sha256": file_digest(path, MAX_PACKET)}


def safe_name(value):
    if (not isinstance(value, str) or not value or value.startswith("/") or "\\" in value
            or any(part in {"", ".", ".."} for part in value.split("/"))):
        raise InputError("Use each complete original member under one safe relative path")
    return value


def run(raw):
    if not isinstance(raw, dict) or raw.get("mode") not in {"inspect", "bundle"}:
        raise InputError("Select the complete original packet inspection or customer publication")
    if raw["mode"] == "inspect":
        if set(raw) != {"mode", "packet", "outputDirectory"}:
            raise InputError("Retain the exact complete inspection input")
        selected = raw["packet"]
        if not isinstance(selected, dict) or not {"path", "bytes", "sha256"} <= set(selected):
            raise InputError("Select the complete original packet identity")
        packet = Path(selected["path"]).absolute()
        if descriptor(packet) != {key: selected[key] for key in ("path", "bytes", "sha256")}:
            raise InputError("The complete selected packet differs")
        output = Path(raw["outputDirectory"]).absolute()
        output.mkdir(mode=0o700, parents=True, exist_ok=True)
        if output.is_symlink() or output.resolve() != output or output.stat().st_mode & 0o077:
            raise InputError("Use the selected private packet inspection directory")
        write_once(output / "input.json", raw)
        done = output / "result.json"
        if done.exists():
            value = load_json(done.read_bytes())
            if value.get("packet") != selected:
                raise InputError("The original completed packet selection differs")
            for row in [value["manifest"], *value["files"]]:
                if descriptor(Path(row["path"])) != {key: row[key] for key in ("path", "bytes", "sha256")}:
                    raise InputError("A complete retained inspected packet file changed")
            return value
        target = output / "expanded"
        if target.exists() or target.is_symlink():
            if target.is_symlink() or not target.is_dir():
                raise InputError("The original incomplete inspection directory is not regular")
            os.rename(target, output / ("expanded.interrupted-" + uuid.uuid4().hex))
            sync_dir(output)
        target.mkdir(mode=0o700)
        manifest = read_packet(packet, target)
        journal = load_json((target / "refresh" / "journal.json").read_bytes())
        if (digest(json_bytes(journal)) != manifest["snapshot"]
                or journal["id"] != manifest["plan"] or journal["portfolioId"] != manifest["portfolio"]):
            raise InputError("The complete packet manifest lost its original journal binding")
        write_once(output / "manifest.json", manifest)
        rows = [{"name": name, **descriptor(target / name)} for name in sorted(manifest["files"])]
        value = {"schema": "stellar-forge.iati-refresh-packet-inspection.v1", "packet": selected,
                 "plan": manifest["plan"], "snapshot": manifest["snapshot"], "portfolio": manifest["portfolio"],
                 "portfolioRevision": manifest["portfolioRevision"],
                 "planRevision": journal["plans"][-1]["revision"], "runCount": len(journal["runs"]),
                 "actionCount": len(journal["actions"]), "manifest": descriptor(output / "manifest.json"),
                 "files": rows}
        write_once(done, value)
        return value
    if set(raw) != {"mode", "output", "operationId", "selectionSha256", "summary", "files"}:
        raise InputError("Retain the exact complete customer publication input")
    if not isinstance(raw["files"], list) or not raw["files"]:
        raise InputError("Select every complete original customer member")
    files = {}
    for row in raw["files"]:
        if not isinstance(row, dict) or set(row) != {"name", "path", "bytes", "sha256"}:
            raise InputError("Every complete member requires its exact native file identity")
        name = safe_name(row["name"])
        if name in files:
            raise InputError("The complete customer member selection contains a duplicate")
        path = Path(row["path"]).absolute()
        if descriptor(path) != {key: row[key] for key in ("path", "bytes", "sha256")}:
            raise InputError("A complete selected customer file changed before publication")
        files[name] = path
    output = Path(raw["output"]).absolute()
    value = packet_write(output, files, "stellar-forge.iati-refresh-operator-customer.v1",
                         {"operationId": raw["operationId"], "selectionSha256": raw["selectionSha256"],
                          "summarySha256": digest(json_bytes(raw["summary"]))})
    return {"path": str(output), "bytes": value["bytes"], "sha256": value["sha256"], "reused": value["reused"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    path = Path(args.input).absolute()
    regular(path, MAX_METADATA)
    print(json_bytes(run(load_json(path.read_bytes()))).decode(), end="", flush=True)


if __name__ == "__main__":
    os.umask(0o077)
    main()
