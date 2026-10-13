#!/usr/bin/env python3
"""Receive the declared customer fixture through its exact installed public release."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import urllib.request

REPOSITORY = "woahwhattheheck/tjlabs-stellar-merchant-workspace"
OPERATION = "SCF-RECEIVABLES-NATIVE-2A51-20261012"
PREFIX = "operations/scf-receivables-native-2a51-20261012"
FIXTURE_PASSPHRASE = "SCF-XERO-CUSTOMER-RECEIVING-FIXTURE-20261013"
SDK = "stellar/scf-starforge-20261009/sf88-operator-buyer-cli"
MCP = "stellar-forge/mcp-paid-agent"

def now():
    return datetime.now(timezone.utc).isoformat()

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def save_json(path, value):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    path.chmod(0o600)

def api(path):
    request = urllib.request.Request("https://api.github.com" + path, headers={
        "Accept": "application/vnd.github+json", "Authorization": "Bearer " + os.environ["GH_TOKEN"],
        "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "scf-installed-customer-receiving"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)

def child_environment(temporary):
    result = {key: os.environ[key] for key in ("PATH", "HOME", "LANG", "LC_ALL") if key in os.environ}
    result.update({"CI": "true", "PYTHONDONTWRITEBYTECODE": "1", "TMPDIR": str(temporary),
        "NPM_CONFIG_CACHE": str(temporary / "npm-cache"), "NPM_CONFIG_AUDIT": "false",
        "NPM_CONFIG_FUND": "false", "NPM_CONFIG_UPDATE_NOTIFIER": "false"})
    return result

def command(argv, cwd, env, target):
    started = now()
    completed = subprocess.run(argv, cwd=cwd, env=env, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, text=True)
    save_json(target, {"command": argv, "exitCode": completed.returncode,
        "stdout": completed.stdout, "stderr": completed.stderr, "startedAt": started, "completedAt": now()})
    print(json.dumps({"event": "CUSTOMER_PREPARATION_COMPLETE", "command": argv,
        "exitCode": completed.returncode, "result": str(target)}), flush=True)
    if completed.returncode:
        raise RuntimeError("Original preparation failed; retain " + str(target))
    return completed.stdout

def emit_file(path, root):
    raw = path.read_bytes()
    name = path.relative_to(root).as_posix()
    encoded = base64.b64encode(raw).decode("ascii")
    count = (len(encoded) + 8191) // 8192
    print("SCF_CUSTOMER_FILE " + json.dumps({"path": name, "bytes": len(raw),
        "sha256": digest(raw), "encoding": "base64", "chunks": count}), flush=True)
    for i in range(count):
        print("SCF_CUSTOMER_CHUNK " + json.dumps({"path": name, "index": i,
            "data": encoded[i * 8192:(i + 1) * 8192]}), flush=True)
    print("SCF_CUSTOMER_FILE_END " + json.dumps({"path": name, "sha256": digest(raw)}), flush=True)

def retain_complete_customer(root):
    operation = root / "customer-operation"
    if not operation.is_dir():
        return
    # The selected release archive is retained once. Every customer/workspace,
    # original encrypted backup, private case, request and phase file is retained.
    excluded = {"release-build/package", "installed/package"}
    entries = []
    for path in sorted(operation.rglob("*")):
        relative = path.relative_to(operation).as_posix()
        if any(relative == prefix or relative.startswith(prefix + "/") for prefix in excluded):
            continue
        if path.is_symlink():
            raise ValueError("Unexpected link in retained customer state: " + relative)
        if path.is_dir():
            continue
        if not path.is_file():
            raise ValueError("Unexpected special file in retained customer state: " + relative)
        raw = path.read_bytes()
        entries.append((path, {"path": relative, "bytes": len(raw), "sha256": digest(raw)}))
    installed = operation / "installed" / "package"
    for name in ("manifest.json", "package.json", "README.md", "LICENSE"):
        path = installed / name
        if path.is_file() and not path.is_symlink():
            raw = path.read_bytes()
            entries.append((path, {"path": path.relative_to(operation).as_posix(),
                "bytes": len(raw), "sha256": digest(raw)}))
    index = {"schema": "stellar-forge.hosted-customer-retained-files.v1", "operation": OPERATION,
        "sourceCommit": os.environ.get("GITHUB_SHA"), "scope": "CONTROLLED_ORIGINAL_CUSTOMER_RECEIVING",
        "fixturePassphrase": FIXTURE_PASSPHRASE,
        "releaseSource": "The complete original selected archive and manifest are retained in release-build; installed duplicate source files are represented by that exact archive.",
        "files": [row for _, row in entries], "totalBytes": sum(row["bytes"] for _, row in entries)}
    save_json(root / "retained-customer-files.json", index)
    target = root / "retained-customer-workspace.tar.gz"
    with tarfile.open(target, mode="x:gz", format=tarfile.PAX_FORMAT, dereference=False) as archive:
        for path, row in entries:
            info = archive.gettarinfo(str(path), arcname=row["path"])
            if not info.isfile():
                raise ValueError("Retained member changed during packaging")
            with path.open("rb") as handle:
                archive.addfile(info, handle)
    save_json(root / "retained-customer-archive.json", {"path": target.name,
        "bytes": target.stat().st_size, "sha256": digest(target.read_bytes()),
        "fileCount": len(entries), "originalBytes": index["totalBytes"]})

def receive(root):
    if os.environ.get("GITHUB_REPOSITORY") != REPOSITORY or os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch":
        raise ValueError("Use the original manually selected public repository operation")
    if os.environ.get("RUNNER_OS") != "Linux":
        raise ValueError("Use the standard public Ubuntu Linux runner")
    metadata = api("/repos/" + REPOSITORY)
    if metadata.get("private") is not False or metadata.get("id") != 1414985422:
        raise ValueError("The original public repository identity changed")
    ref = os.environ.get("GITHUB_SHA", "")
    if not re.fullmatch("[a-f0-9]{40}", ref):
        raise ValueError("The exact workflow source commit is required")
    for executable in ("node", "npm", "git", "flock"):
        if not shutil.which(executable):
            raise RuntimeError("Original runtime missing " + executable)
    temporary = root / "preparation-runtime"
    temporary.mkdir(mode=0o700)
    env = child_environment(temporary)
    node_version = subprocess.check_output(["node", "--version"], text=True).strip()
    version = tuple(map(int, node_version.lstrip("v").split(".")[:2]))
    if version < (22, 16):
        raise RuntimeError("Use Node22.16 or later")
    source = root / "original-source"
    source.mkdir(mode=0o700)
    command(["git", "init", "--quiet"], source, env, root / "source-init.json")
    command(["git", "remote", "add", "origin", "https://github.com/" + REPOSITORY + ".git"],
        source, env, root / "source-origin.json")
    command(["git", "fetch", "--depth=1", "--no-tags", "origin", ref],
        source, env, root / "source-fetch.json")
    command(["git", "checkout", "--detach", "FETCH_HEAD"], source, env, root / "source-checkout.json")
    actual = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
    if actual != ref or subprocess.check_output(["git", "-C", str(source), "status", "--porcelain"], text=True):
        raise ValueError("The complete original checkout differs")
    original_helper = source / PREFIX / "hosted-customer-receive.py"
    if original_helper.read_bytes() != Path(__file__).read_bytes():
        raise ValueError("The hosted receiver does not match the selected source commit")
    sdk = root / "sdk-dependencies"
    mcp = root / "mcp-dependencies"
    for directory, component in ((sdk, SDK), (mcp, MCP)):
        directory.mkdir(mode=0o700)
        shutil.copyfile(source / component / "package.json", directory / "package.json")
        lock = source / component / "package-lock.json"
        if lock.is_file():
            shutil.copyfile(lock, directory / "package-lock.json")
        install = "ci" if lock.is_file() else "install"
        command(["npm", install, "--ignore-scripts", "--no-audit", "--no-fund"], directory, env,
            root / (directory.name + "-install.json"))
        command(["npm", "ls", "--all", "--json"], directory, env, root / (directory.name + "-installed.json"))
    save_json(root / "host.json", {"operation": OPERATION, "sourceCommit": ref, "repository": REPOSITORY,
        "node": node_version, "python": sys.version, "runnerImage": os.environ.get("ImageVersion"),
        "startedAt": now(), "scope": "CONTROLLED_ORIGINAL_CUSTOMER_RECEIVING",
        "input": "The original XERO_CASH_CHECK scenario creates its own account; no live customer or continuation input is accepted.",
        "fixturePassphrase": FIXTURE_PASSPHRASE})
    env["STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE"] = FIXTURE_PASSPHRASE
    argv = ["node", str(source / PREFIX / "receive-installed-customer.mjs"), "--repo", str(source),
        "--ref", ref, "--out", str(root / "customer-operation"), "--sdk-profile", str(sdk / "package.json"),
        "--sdk-node-modules", str(sdk / "node_modules"), "--mcp-node-modules", str(mcp / "node_modules"),
        "--python", sys.executable, "--offline"]
    started = now()
    child = subprocess.Popen(argv, cwd=source, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    print(json.dumps({"event": "INSTALLED_CUSTOMER_RECEIVER_ADMITTED", "pid": child.pid,
        "sourceCommit": ref, "operation": OPERATION}), flush=True)
    stdout, stderr = child.communicate()
    save_json(root / "customer-programme.json", {"command": argv, "exitCode": child.returncode,
        "stdout": stdout, "stderr": stderr, "startedAt": started, "completedAt": now()})
    save_json(root / "hosted-customer-result.json", {"operation": OPERATION, "sourceCommit": ref,
        "exitCode": child.returncode, "completedAt": now(),
        "scope": "CONTROLLED_ORIGINAL_CUSTOMER_RECEIVING"})
    return child.returncode

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    root = args.out.absolute()
    root.mkdir(mode=0o700, parents=False, exist_ok=False)
    code = 1
    try:
        code = receive(root)
    except Exception as error:
        save_json(root / "hosted-customer-error.json", {"operation": OPERATION,
            "code": type(error).__name__, "message": str(error), "completedAt": now()})
    finally:
        try:
            retain_complete_customer(root)
        except Exception as error:
            code = 1
            save_json(root / "retention-error.json", {"code": type(error).__name__, "message": str(error)})
        paths = set(root.glob("*.json")) | set(root.glob("*.tar.gz"))
        for directory in ("sdk-dependencies", "mcp-dependencies"):
            for filename in ("package.json", "package-lock.json"):
                path = root / directory / filename
                if path.is_file():
                    paths.add(path)
        for path in sorted(paths):
            if path.is_file() and not path.is_symlink():
                emit_file(path, root)
    return code

if __name__ == "__main__":
    raise SystemExit(main())
