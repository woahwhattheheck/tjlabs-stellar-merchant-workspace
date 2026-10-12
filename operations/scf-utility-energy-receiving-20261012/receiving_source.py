"""MIT. Select complete installed source for the original energy receivers."""
from __future__ import annotations
import json
from pathlib import Path
import re

PACKAGE_SCHEMA = "stellar-forge.merchant-distribution-manifest.v1"
REFERENCES = {
    "utility": ("stellar-forge.utility-receiving-source.v1",
                "operations/scf-utility-energy-receiving-20261012/source-manifest-891b.json"),
    "leap": ("stellar-forge.leap-receiving-source.v1",
             "operations/scf-leap-interval-receiving-20261012/source-manifest.json"),
    "leap-standalone": ("stellar-forge.leap-standalone-source.v1",
                        "operations/scf-leap-interval-receiving-20261012/source-application-manifest.json"),
}


def need(value, message):
    if not value:
        raise RuntimeError(message)


def member_path(value):
    need(isinstance(value, str) and 0 < len(value) <= 1000
         and "\\" not in value and not re.search(r"[\x00-\x1f\x7f]", value)
         and all(part not in ("", ".", "..") for part in value.split("/")),
         "Use canonical complete package source paths.")
    return value


def receiving_source(manifest, source_root, family):
    """Keep frozen declarations unchanged; bind new receiving to every package member.

    Callers retain the original manifest bytes and verify all returned members
    before opening their original product owner.
    """
    need(family in REFERENCES, "Choose the original Utility or Leap receiver.")
    schema, reference_path = REFERENCES[family]
    need(isinstance(manifest, dict), "Use a complete source declaration.")
    if manifest.get("schema") == schema:
        need(isinstance(manifest.get("files"), list) and manifest["files"],
             "Use the complete original source declaration.")
        return manifest

    need(manifest.get("schema") == PACKAGE_SCHEMA
         and manifest.get("packageName") == "@tokenjunkielabs/starforge-merchant"
         and isinstance(manifest.get("sourceCommit"), str)
         and re.fullmatch(r"[0-9a-f]{40}", manifest["sourceCommit"])
         and isinstance(manifest.get("files"), list) and 0 < len(manifest["files"]) <= 20000,
         "Use the complete maintained package manifest or the original frozen declaration.")
    names, total = set(), 0
    for row in manifest["files"]:
        need(isinstance(row, dict), "Invalid complete source member.")
        path = member_path(row.get("path"))
        need(path not in names and row.get("packagePath") == "source/" + path
             and type(row.get("bytes")) is int and 0 <= row["bytes"] <= 4 * 1024 * 1024
             and isinstance(row.get("sha256"), str) and re.fullmatch(r"[0-9a-f]{64}", row["sha256"])
             and isinstance(row.get("gitBlob"), str) and re.fullmatch(r"[0-9a-f]{40}", row["gitBlob"])
             and row.get("mode") in ("100644", "100755"),
             "Keep each complete package member and its original byte identity.")
        names.add(path)
        total += row["bytes"]
    need(type(manifest.get("sourceBytes")) is int and manifest["sourceBytes"] == total
         and total <= 512 * 1024 * 1024, "The complete package source length differs.")
    need(reference_path in names, "The package omits its original receiving declaration.")
    reference = json.loads((Path(source_root) / reference_path).read_text(encoding="utf-8"))
    need(reference.get("schema") == schema and isinstance(reference.get("files"), list),
         "The package contains a different original receiving declaration.")
    required = {member_path(row["path"]) for row in reference["files"]}
    required.update({
        reference_path,
        "operations/scf-utility-energy-receiving-20261012/receiving_source.py",
        "operations/scf-utility-energy-receiving-20261012/receiving-source.mjs",
    })
    need(required.issubset(names), "The package omits original receiving source: "
         + ", ".join(sorted(required - names)))
    result = {
        "schema": schema, "sourceCommit": manifest["sourceCommit"],
        "repository": manifest.get("sourceRepository"), "files": manifest["files"],
        "frozenDeclaration": {"path": reference_path, "sourceCommit": reference.get("sourceCommit")},
        "installedPackage": {
            key: manifest[key] for key in
            ("schema", "packageName", "packageVersion", "sourceCommit", "sourceRepository",
             "sourceSelection", "sourceBytes") if key in manifest
        },
    }
    for key in ("originalOperation", "toolNames"):
        if key in reference:
            result[key] = reference[key]
    return result
