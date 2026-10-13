"""Build the complete original signed staff plugin, with a resumable local record.

No Dataverse call or cloud build occurs. Use an installed .NET SDK and an external
original signing key. The build keeps original package archives, lock files,
compiler/inspection output and all source bytes beside the resulting DLL.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys

from dataverse_contract import DataverseError, require, json_bytes, parse_json, identity, sha256
from staff_spec import ASSEMBLY, SOURCE_FILES, PLUGIN_TYPES

BUILD_SCHEMA = "tjlabs.pmrs.staff-build/v1"
INPUTS = tuple("powerplatform/staff/plugin/" + x for x in SOURCE_FILES) + (
    "powerplatform/staff/plugin/TJLabs.GrantStaff.csproj",
    "powerplatform/staff/build/Inspect.csproj", "powerplatform/staff/build/Inspect.cs")
ALLOWED_REFERENCES = {"mscorlib", "System", "System.Core", "System.Runtime.Serialization", "System.ServiceModel",
                      "Microsoft.Xrm.Sdk", "Microsoft.Crm.Sdk.Proxy"}
MAX_BUILD_FILES = 30000
MAX_BUILD_BYTES = 1024 * 1024 * 1024

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

def file_info(path):
    p = Path(path)
    require(p.is_file() and not p.is_symlink(), "STAFF_BUILD_FILE", "Select an unchanged regular file.", filename=p.name)
    h, size = hashlib.sha256(), 0
    with p.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            size += len(chunk); h.update(chunk)
    return {"bytes": size, "sha256": h.hexdigest()}

def sync_dir(path):
    if os.name == "posix":
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try: os.fsync(fd)
        finally: os.close(fd)

def immutable(path, raw):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        require(file_info(path) == {"bytes": len(raw), "sha256": sha256(raw)},
                "STAFF_BUILD_IMMUTABLE", "An original retained build file differs.", filename=path.name)
        return
    with path.open("xb") as out:
        out.write(raw); out.flush(); os.fsync(out.fileno())
    sync_dir(path.parent)

def read_json(path):
    return parse_json(Path(path).read_bytes())

def _relative(path):
    p = PurePosixPath(path)
    require(isinstance(path, str) and str(p) == path and not p.is_absolute()
            and all(x not in ("", ".", "..") for x in p.parts),
            "STAFF_BUILD_PATH", "Use a declared relative original build path.")
    return p

def verify_build_directory(directory):
    root = Path(directory).resolve(strict=True)
    report = read_json(root / "build.json")
    require(report.get("schema") == BUILD_SCHEMA and report.get("state") == "COMPLETE",
            "STAFF_BUILD_INCOMPLETE", "The original native build has not completed.")
    manifest = report["files"]
    require(isinstance(manifest, list) and 0 < len(manifest) <= MAX_BUILD_FILES,
            "STAFF_BUILD_MANIFEST", "Retain the complete bounded build file closure.")
    names, total = set(), 0
    for item in manifest:
        path = str(_relative(item["path"]))
        require(path not in names and path != "build.json", "STAFF_BUILD_MANIFEST", "Each original member occurs once.")
        names.add(path); total += item["bytes"]
        require(total <= MAX_BUILD_BYTES and file_info(root / path) == {k: item[k] for k in ("bytes", "sha256")},
                "STAFF_BUILD_CHANGED", "The complete original build member differs.", path=path)
    actual = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}
    require(actual == names | {"build.json"}, "STAFF_BUILD_CLOSURE", "The original completed build has extra or absent files.")
    require(report["dll"]["path"] in names, "STAFF_BUILD_DLL", "The complete original DLL is outside the closure.")
    return report

def _command(root, name, arguments, environment):
    """Retain every attempt. Local build repeats do not dispatch tenant changes."""
    logs = root / "commands"; logs.mkdir(exist_ok=True)
    previous = sorted(logs.glob(name + "-*.json"))
    sequence = len(previous) + 1
    prefix = name + "-" + str(sequence).zfill(4)
    intent = {"schema": "tjlabs.pmrs.staff-build-command/v1", "name": name, "attempt": sequence,
              "argv": arguments, "started_at": now(), "state": "DISPATCHING",
              "credential_environment_values_retained": False}
    immutable(logs / (prefix + ".intent.json"), json_bytes(intent))
    stdout, stderr = logs / (prefix + ".stdout"), logs / (prefix + ".stderr")
    with stdout.open("xb") as out, stderr.open("xb") as err:
        try:
            result = subprocess.run(arguments, cwd=root, env=environment, stdin=subprocess.DEVNULL,
                                    stdout=out, stderr=err, check=False)
        finally:
            out.flush(); os.fsync(out.fileno()); err.flush(); os.fsync(err.fileno())
    receipt = {**intent, "state": "RETURNED", "returncode": result.returncode, "completed_at": now(),
               "stdout": {"path": stdout.relative_to(root).as_posix(), **file_info(stdout)},
               "stderr": {"path": stderr.relative_to(root).as_posix(), **file_info(stderr)}}
    immutable(logs / (prefix + ".json"), json_bytes(receipt))
    require(result.returncode == 0, "STAFF_BUILD_COMMAND_FAILED",
            "The native build command failed; its complete output remains retained.", command=name,
            returncode=result.returncode, receipt=(logs / (prefix + ".json")).relative_to(root).as_posix())
    return receipt

def build_plugin(source_root, destination, signing_key, version, *, dotnet="dotnet", resume=False):
    source = Path(source_root).resolve(strict=True)
    key = Path(signing_key).expanduser().resolve(strict=True)
    key_raw = Path(signing_key).expanduser().absolute()
    require(key == key_raw and key.is_file() and not key_raw.is_symlink() and file_info(key)["bytes"] <= 16384,
            "STAFF_SIGNING_KEY", "Select one complete external original strong-name key.")
    if os.name == "posix":
        info = key.stat()
        require(info.st_uid == os.getuid() and not stat.S_IMODE(info.st_mode) & 0o077,
                "STAFF_SIGNING_KEY_MODE", "The private signing key must remain accessible only to its owner.")
    require(isinstance(version, str) and re.fullmatch(r"\d+\.\d+\.\d+\.\d+", version)
            and all(0 <= int(x) <= 65535 for x in version.split(".")),
            "STAFF_ASSEMBLY_VERSION", "Select the complete original four-part version.")
    root = Path(destination).expanduser().absolute()
    require(key != root and root not in key.parents and source != root and source not in root.parents,
            "STAFF_BUILD_LOCATION", "Keep generated build output and the external key outside the authored source tree.")
    if root.exists():
        require(resume and root.is_dir() and not root.is_symlink(), "STAFF_BUILD_EXISTS",
                "Use a new build directory or explicitly resume this original build.")
    else:
        root.mkdir(parents=True, mode=0o700)
    root = root.resolve(strict=True)
    executable = shutil.which(dotnet) if not Path(dotnet).is_absolute() else dotnet
    require(executable and Path(executable).is_file(), "STAFF_BUILD_SDK", "Use the selected installed .NET SDK executable.")
    executable = str(Path(executable).resolve(strict=True))
    files = []
    for path in INPUTS:
        original = source / path
        item = {"path": path, **file_info(original)}
        immutable(root / "source" / path, original.read_bytes()); files.append(item)
    intent = {"schema": BUILD_SCHEMA + ".intent", "assembly_name": ASSEMBLY, "assembly_version": version,
              "sources": files, "signing_key_sha256": file_info(key)["sha256"],
              "target_framework": "net48", "dotnet_file": file_info(executable),
              "package_sources": ["https://api.nuget.org/v3/index.json"],
              "meaning": "Local source build only. No target deployment, customer acceptance or private key bytes are recorded."}
    immutable(root / "intent.json", json_bytes(intent))
    if (root / "build.json").exists():
        return verify_build_directory(root)
    # Pass the key only through the child's environment. It is never copied,
    # put into argv, included in source resources or included in this report.
    environment = dict(os.environ)
    environment.update(PMRS_SIGNING_KEY_FILE=str(key), PMRS_ASSEMBLY_VERSION=version,
        DOTNET_CLI_TELEMETRY_OPTOUT="1", DOTNET_SKIP_FIRST_TIME_EXPERIENCE="1",
        DOTNET_NOLOGO="1", NUGET_PACKAGES=str(root / "packages"))
    commands = []
    version_receipt = _command(root, "sdk-version", [executable, "--version"], environment); commands.append(version_receipt)
    sdk_version = (root / version_receipt["stdout"]["path"]).read_text("utf-8").strip()
    require(re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][A-Za-z0-9._-]+)?", sdk_version),
            "STAFF_BUILD_SDK", "Retain the actual returned SDK version.")
    runtimes = _command(root, "runtimes", [executable, "--list-runtimes"], environment); commands.append(runtimes)
    choices = []
    for line in (root / runtimes["stdout"]["path"]).read_text("utf-8").splitlines():
        match = re.match(r"Microsoft\.NETCore\.App (\d+)\.\d+\.\d+(?:[^\s]*) \[", line)
        if match and 8 <= int(match.group(1)) <= min(10, int(sdk_version.split(".")[0])):
            choices.append(int(match.group(1)))
    require(choices, "STAFF_INSPECTOR_RUNTIME", "An installed supported .NET 8–10 runtime is required for native metadata inspection.")
    environment["PMRS_INSPECTOR_TFM"] = "net" + str(max(choices)) + ".0"
    configuration = b'<?xml version="1.0" encoding="utf-8"?><configuration><packageSources><clear/><add key="nuget.org" value="https://api.nuget.org/v3/index.json"/></packageSources></configuration>\n'
    immutable(root / "NuGet.Config", configuration)
    projects = [
        ("plugin", "source/powerplatform/staff/plugin/TJLabs.GrantStaff.csproj"),
        ("inspector", "source/powerplatform/staff/build/Inspect.csproj")]
    for name, path in projects:
        lock = root / Path(path).parent / "packages.lock.json"
        args = [executable, "restore", path, "--configfile", "NuGet.Config", "--packages", "packages"]
        if lock.exists(): args.append("--locked-mode")
        commands.append(_command(root, name + "-restore", args, environment))
        commands.append(_command(root, name + "-build",
            [executable, "build", path, "--no-restore", "--configuration", "Release", "--nologo"], environment))
    original_dll = root / "source/powerplatform/staff/plugin/bin/Release/net48" / (ASSEMBLY + ".dll")
    require(original_dll.is_file(), "STAFF_BUILD_DLL", "The actual native compiler did not produce the selected complete assembly.")
    dll = original_dll.read_bytes()
    require(0 < len(dll) < 16 * 1024 * 1024, "STAFF_BUILD_DLL_SIZE", "The original assembly must remain below Dataverse's 16 MiB limit.")
    immutable(root / "artifacts" / (ASSEMBLY + ".dll"), dll)
    inspector = "source/powerplatform/staff/build/bin/Release/" + environment["PMRS_INSPECTOR_TFM"] + "/PMRS.Staff.BuildInspector.dll"
    inspected = _command(root, "inspect", [executable, inspector, "artifacts/" + ASSEMBLY + ".dll"], environment)
    commands.append(inspected)
    assembly = read_json(root / inspected["stdout"]["path"])
    require(assembly["name"] == ASSEMBLY and assembly["version"] == version
            and assembly["strong_name_signed"] is True
            and re.fullmatch(r"[a-f0-9]{16}", assembly["public_key_token"])
            and set(assembly["plugin_types"]) == {ASSEMBLY + "." + name for name in PLUGIN_TYPES},
            "STAFF_BUILD_ASSEMBLY", "The actual signed assembly identity or plugin set differs.")
    require(set(assembly["references"]) <= ALLOWED_REFERENCES, "STAFF_BUILD_DEPENDENCY",
            "The native plugin has a dependency not supplied by its selected sandbox contract.",
            references=assembly["references"])
    packages = []
    for path in sorted((root / "packages").rglob("*.nupkg")):
        packages.append({"path": path.relative_to(root).as_posix(), **file_info(path)})
    require(packages, "STAFF_BUILD_PACKAGES", "Retain the actual package archives used by this build.")
    members, total = [], 0
    for path in sorted(root.rglob("*")):
        require(not path.is_symlink(), "STAFF_BUILD_LINK", "The complete retained build cannot include links.")
        if path.is_file():
            item = {"path": path.relative_to(root).as_posix(), **file_info(path)}
            total += item["bytes"]; members.append(item)
    require(len(members) <= MAX_BUILD_FILES and total <= MAX_BUILD_BYTES,
            "STAFF_BUILD_CLOSURE_SIZE", "The complete original build closure exceeds the bounded receiving profile.")
    report = {"schema": BUILD_SCHEMA, "state": "COMPLETE", "assembly": assembly,
        "dll": {"path": "artifacts/" + ASSEMBLY + ".dll", "bytes": len(dll), "sha256": sha256(dll)},
        "sources": [row for row in files if row["path"].endswith(".cs") and "/plugin/" in row["path"]],
        "commands": commands, "files": members, "packages": packages,
        "tool": {"name": "dotnet", "version": sdk_version, "framework": "net48",
                 "inspector_framework": environment["PMRS_INSPECTOR_TFM"],
                 "source_intent_sha256": identity(intent), "signing_key_bytes_retained": False},
        "meaning": "Actual local compiler and PE inspection outputs with complete source/package/log closure. No tenant registration, security acceptance or UAT is claimed."}
    immutable(root / "build.json", json_bytes(report))
    return verify_build_directory(root)

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build")
    build.add_argument("--source-root", required=True); build.add_argument("--destination", required=True)
    build.add_argument("--signing-key", required=True); build.add_argument("--version", required=True)
    build.add_argument("--dotnet", default="dotnet"); build.add_argument("--resume", action="store_true")
    verify = sub.add_parser("verify"); verify.add_argument("--directory", required=True)
    args = parser.parse_args(argv)
    result = (build_plugin(args.source_root, args.destination, args.signing_key, args.version,
                          dotnet=args.dotnet, resume=args.resume) if args.command == "build"
              else verify_build_directory(args.directory))
    sys.stdout.buffer.write(json_bytes(result))

if __name__ == "__main__":
    main()
