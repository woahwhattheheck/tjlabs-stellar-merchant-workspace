"""DNN-specific release planning and exact native receiving contracts."""
from __future__ import annotations
import hashlib
import json
from pathlib import PurePosixPath
import re
import stat
import zipfile
from xml.etree import ElementTree as ET

SCHEMA = "commons.dnn-maintenance/v1"
NATIVE_SCHEMA = "commons.dnn-native/v1"
CHUNK = 1024 * 1024
# DNN's published path, captured 2026-10-12. A selected target is explicit.
MILESTONES = ["3.1.1", "3.2.2", "4.3.7", "4.4.1", "4.6.2", "4.9.5",
              "5.4.4", "5.6.8", "6.2.8", "7.4.2", "8.0.4", "9.1.1",
              "9.3.2", "9.13.9", "10.2.5", "10.3.3"]
DOCS = {
    "upgrades": "https://docs.dnncommunity.org/content/getting-started/setup/upgrades/index.html",
    "legacy": "https://docs.dnncommunity.org/content/getting-started/setup/upgrades/pre-10.2.0-steps.html",
    "modern": "https://docs.dnncommunity.org/content/getting-started/setup/upgrades/post-10.2.0-steps.html",
    "path": "https://docs.dnncommunity.org/content/getting-started/setup/upgrades/suggested-upgrade-path/index.html",
    "requirements": "https://docs.dnncommunity.org/content/getting-started/setup/requirements/index.html",
    "releases": "https://github.com/dnnsoftware/Dnn.Platform/releases",
    "sql_copy": "https://learn.microsoft.com/en-us/sql/relational-databases/backup-restore/copy-only-backups-sql-server",
    "sql_verify": "https://learn.microsoft.com/en-us/sql/t-sql/statements/restore-statements-verifyonly-transact-sql",
}
SHA = re.compile(r"^[0-9a-f]{64}$")
ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$")
VERSION = re.compile(r"^0*(\d{1,4})\.0*(\d{1,4})\.0*(\d{1,4})(?:\.0*(\d{1,4}))?$")

def canonical(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else canonical(value)).hexdigest()

def version(value):
    match = VERSION.fullmatch(str(value or "").strip())
    if not match:
        raise ValueError("Use a complete DNN version such as 9.13.9 or 10.2.5.")
    parts = tuple(int(x or 0) for x in match.groups())
    return parts[:3]

def extension_version(value):
    match = VERSION.fullmatch(str(value or "").strip())
    if not match:
        raise ValueError("Use the extension's complete original numeric package version.")
    return tuple(int(part or 0) for part in match.groups())

def extension_version_text(value):
    result = extension_version(value)
    return ".".join(map(str, result if result[3] else result[:3]))

def version_text(value):
    return ".".join(map(str, version(value)))

def upgrades(current, target):
    start, finish = version(current), version(target)
    if finish < start:
        raise ValueError("An upgrade target must be newer; use the original paired backup for rollback.")
    if finish == start:
        return []
    stops = [x for x in MILESTONES if start < version(x) < finish]
    stops.append(version_text(target))
    source = version_text(current)
    result = []
    for destination in stops:
        modern = version(source) >= (10, 2, 0)
        result.append({"from": source, "to": destination,
                       "package_type": "Install" if modern else "Upgrade",
                       "route": "host-upgrades" if modern else "offline-upgrade-wizard",
                       "manual_upload_workaround": version(source) == (10, 2, 3),
                       "source": DOCS["modern" if modern else "legacy"]})
        source = destination
    return result

def ordinary(value):
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value or any(x in ("", ".", "..") for x in value.rstrip("/").split("/")):
        raise ValueError("Use an ordinary relative archive member.")
    p = PurePosixPath(value.rstrip("/"))
    if p.is_absolute() or any(x in {"", ".", ".."} or x.rstrip(" .") != x or ":" in x for x in p.parts):
        raise ValueError("The archive contains an unsafe Windows path.")
    for x in p.parts:
        if re.fullmatch(r"(?i)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?", x):
            raise ValueError("The archive uses a reserved Windows device name.")
    return str(p)

def zip_members(archive, max_entries=100000, max_total=128 * 1024**3):
    members, seen, total = [], set(), 0
    for member in archive.infolist():
        name = ordinary(member.filename)
        key = name.casefold()
        if key in seen:
            raise ValueError("The archive contains duplicate or case-aliased members.")
        seen.add(key)
        mode = member.external_attr >> 16
        if stat.S_ISLNK(mode) or (mode and stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
            raise ValueError("The archive contains a link or special member.")
        if member.flag_bits & 1:
            raise ValueError("Decrypt the selected archive in the private receiving environment first.")
        total += member.file_size
        if len(seen) > max_entries or total > max_total:
            raise ValueError("The archive exceeds the configured receiving size.")
        if not member.is_dir():
            members.append((name, member))
    return members

def read_member(archive, member, limit):
    if member.file_size > limit:
        raise ValueError("The selected metadata member exceeds its allowed size.")
    with archive.open(member) as source:
        raw = source.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("The metadata member exceeds its declared size.")
    return raw

def package_info(path, filename):
    with zipfile.ZipFile(path) as archive:
        members = zip_members(archive, max_total=8 * 1024**3)
        by_name = {name.casefold(): member for name, member in members}
        result = {"filename": filename, "member_count": len(members),
                  "expanded_bytes": sum(member.file_size for _, member in members),
                  "manifests": [], "kind": "extension", "dependencies": []}
        match = re.fullmatch(r"(?i)DNN_Platform_(\d+\.\d+\.\d+)_(Install|Upgrade)\.zip", filename)
        if match:
            if "bin/dotnetnuke.dll" not in by_name:
                raise ValueError("The platform package has no original bin/DotNetNuke.dll.")
            result.update(kind="platform", version=version_text(match[1]), package_type=match[2].title(),
                          assembly_sha256=digest(read_member(archive, by_name["bin/dotnetnuke.dll"], 64 * CHUNK)))
            if "app_data/upgrade/upgrade.json" in by_name:
                settings = json.loads(read_member(archive, by_name["app_data/upgrade/upgrade.json"], CHUNK).decode("utf-8-sig"))
                result["minimum_dnn"] = version_text(settings.get("minimumDnnVersion", "0.0.0"))
                result["upgrade_exclude"] = settings.get("upgradeExclude", [])
        for name, member in members:
            if not name.casefold().endswith(".dnn") or member.file_size > 8 * CHUNK:
                continue
            raw = read_member(archive, member, 8 * CHUNK)
            if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
                raise ValueError("The extension manifest declares an external entity.")
            document = ET.fromstring(raw)
            for package in document.findall(".//package"):
                item = {"name": package.get("name", ""), "version": package.get("version", ""),
                        "type": package.get("type", ""), "manifest": name, "manifest_sha256": digest(raw),
                        "friendly_name": package.findtext("friendlyName", "")}
                if item["name"]:
                    item["version"] = extension_version_text(item["version"])
                    result["manifests"].append(item)
                for node in package.findall("./dependencies/dependency"):
                    result["dependencies"].append({"package": item["name"], "type": node.get("type", ""),
                                                   "value": (node.text or "").strip()})
        if result["kind"] == "extension" and not result["manifests"]:
            raise ValueError("Select a DNN extension ZIP with its original package manifest.")
        return result

def environment_fingerprint(inventory):
    target = inventory.get("target", {})
    platform = inventory.get("platform", {})
    runtime, sql, iis = (inventory.get(k, {}) for k in ("runtime", "sql", "iis"))
    # Keep technical identity; observation timestamps and transient pool state stay outside the comparison.
    return digest({"target": {k: target.get(k) for k in
                    ("site_id", "environment_id", "iis_site", "application_path", "url",
                     "database", "server", "root_identity")},
                   "platform": {k: platform.get(k) for k in
                     ("assembly_version", "assembly_sha256", "database_version")},
                   "runtime": {k: runtime.get(k) for k in ("net_release", "processor_architecture")},
                   "sql": {k: sql.get(k) for k in ("version", "engine_edition", "database_owner", "object_qualifier")},
                   "iis": {k: iis.get(k) for k in
                     ("application_pool", "managed_runtime_version", "pipeline", "enable_32_bit")},
                   "packages": sorted([{"name": p.get("name"), "version": p.get("version"),
                                        "package_type": p.get("package_type")} for p in inventory.get("packages", [])],
                                      key=lambda p: (str(p["name"]), str(p["version"]))) })

def plan_audit(release, inventories, packages):
    problems, notices, steps = [], [], []
    prod, stage = (inventories.get(release.get(k)) for k in ("production_inventory_id", "staging_inventory_id"))
    if not prod:
        problems.append("Receive the actual production inventory.")
    if not stage:
        problems.append("Receive the actual paired staging inventory.")
    selected = [packages.get(x) for x in release.get("package_ids", [])]
    if not selected or any(x is None for x in selected):
        problems.append("Select the complete original package set.")
    target = release.get("target_version")
    try:
        version(target)
    except ValueError:
        problems.append("Set the agreed target DNN version.")
        target = None
    if prod and stage and target:
        p, s = prod["inventory"], stage["inventory"]
        pv = p.get("platform", {}).get("database_version")
        sv = s.get("platform", {}).get("database_version")
        try:
            if version(pv) != version(sv):
                problems.append("Production and the paired staging baseline use different DNN versions.")
            if any(version(x["platform"].get("assembly_version")) != version(x["platform"].get("database_version"))
                   for x in (p, s)):
                problems.append("Reconcile the installed assembly and database versions before this release.")
            steps = upgrades(pv, target)
        except (ValueError, KeyError, TypeError):
            problems.append("The native baseline needs its complete platform and database versions.")
        if not release.get("compatibility_review", "").strip():
            problems.append("Retain the installed module, theme and integration compatibility review.")
        for label, inventory in (("Production", p), ("Staging", s)):
            if version(target) >= (10, 0, 0):
                if int(inventory.get("runtime", {}).get("net_release") or 0) < 528040:
                    problems.append(label + " needs the DNN 10 .NET Framework 4.8 prerequisite.")
                if int(inventory.get("sql", {}).get("major") or 0) < 14:
                    problems.append(label + " needs the DNN 10 SQL Server 2017 prerequisite.")
            if int(inventory.get("sql", {}).get("engine_edition") or 0) in (5, 8):
                problems.append(label + " uses an Azure database service; select its original provider backup/restore implementation before native release.")
            if inventory.get("telerik", {}).get("dependent_assemblies"):
                notices.append(label + " has assemblies referencing Telerik; retain their named compatibility decisions.")
            if inventory.get("runtime", {}).get("app_pool_consumers", 1) != 1:
                notices.append(label + " shares an IIS application pool; the receiver uses only this application's offline file.")
        used = set()
        for step in steps:
            matches = [x for x in selected if x and x["package"]["kind"] == "platform"
                       and x["package"].get("version") == step["to"]
                       and x["package"].get("package_type") == step["package_type"]]
            if len(matches) != 1:
                problems.append("Select exactly one %s %s package for %s → %s." %
                                (step["to"], step["package_type"], step["from"], step["to"]))
            else:
                step["package_id"] = matches[0]["id"]
                used.add(matches[0]["id"])
                minimum = matches[0]["package"].get("minimum_dnn")
                if step["route"] == "host-upgrades" and minimum and version(step["from"]) < version(minimum):
                    problems.append("The selected Install package requires DNN " + minimum + " before its native upgrade step.")
        for item in selected:
            if item and item["package"]["kind"] == "platform" and item["id"] not in used:
                problems.append("Remove the platform package that is outside this exact upgrade path: " + item["file"]["filename"])
            if item and item["package"]["kind"] == "extension":
                for dep in item["package"].get("dependencies", []):
                    if dep["type"].casefold() in ("coreversion", "dnnversion"):
                        try:
                            if version(target) < version(dep["value"]):
                                problems.append(item["file"]["filename"] + " requires DNN " + dep["value"])
                        except ValueError:
                            notices.append("Review the original dependency expression: " + dep["value"])
    checks = release.get("checks", [])
    if not checks or any(not x.get("path") or not x.get("label") for x in checks):
        problems.append("Set the real public/editorial/integration acceptance checks for this release.")
    for check in checks:
        if not str(check.get("path", "")).startswith("/") or str(check.get("path", "")).startswith("//"):
            problems.append("Acceptance check paths must stay inside the selected site.")
    if not release.get("rollback_note", "").strip():
        problems.append("Record the paired restore target, operating window and rollback decision.")
    return {"ready": not problems, "problems": list(dict.fromkeys(problems)),
            "notices": list(dict.fromkeys(notices)), "steps": steps, "sources": DOCS}
