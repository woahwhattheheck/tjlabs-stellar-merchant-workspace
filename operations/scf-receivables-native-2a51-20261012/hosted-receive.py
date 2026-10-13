#!/usr/bin/env python3
"""Run the existing frozen receivables receiving operation on a standard public runner."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import urllib.request

REPOSITORY = "woahwhattheheck/tjlabs-stellar-merchant-workspace"
OPERATION = "SCF-RECEIVABLES-NATIVE-2A51-20261012"
SOURCE_COMMIT = "94ad1dd33fd1616303d52faa8b1cd98745c6cfc5"
RUNNER_CAPSULE = "4ea4c09fde74c471ce7e497d5bcfb69c0cc3c842"
CORRECTION_CAPSULE = "bbc06b338f4ee7b51640ec0e241b05d39e71cee8"
SOURCE_CAPSULE = "7fcaec7a66deb03c5d9fed00f193138218d8c323"
DEPENDENCY_CAPSULE = "0907e1444c7418266e128db60b3e94a02496d34f"
SDK_LOCK = "320cee72638cf1d4bc0fc1e48c4fe9b8547dc223"
MCP_PACKAGE = "25c40f788e9be3ac932b3337bbce02bf7c37e64f"
SDK_PACKAGE = "038f1824d7e2703b449fe50a5446b988d8f3bc3f"
PREFIX = "operations/scf-receivables-native-2a51-20261012/"
RUNNER_FILES = {
    "receive-capsule.py": "0abd5865264c604dae2127131e80447f27818814",
    "source.json": "74781fd23abf0a37db88af5dc2c0c4574608cee6",
    "README.md": "f65e666a022b95bcd4a5e65ff305c7891e8b7c9d",
}

def now():
    return datetime.now(timezone.utc).isoformat()

def git_blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()

def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

def api(path):
    token = os.environ.get("GH_TOKEN")
    if not token:
        raise RuntimeError("The receiving step requires its read-only GitHub token")
    request = urllib.request.Request(
        "https://api.github.com" + path,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": "Bearer " + token,
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "scf-original-native-receiving",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)

def blob(identity):
    value = api("/repos/" + REPOSITORY + "/git/blobs/" + identity)
    if value.get("sha") != identity or value.get("encoding") != "base64":
        raise ValueError("Original Git blob response identity changed: " + identity)
    raw = base64.b64decode("".join(value["content"].split()), validate=True)
    if git_blob(raw) != identity:
        raise ValueError("Original Git blob bytes changed: " + identity)
    return value, raw

def package_from_capsules(capsules, path, identity):
    found = [row for capsule in capsules for row in capsule.get("files", []) if row.get("path") == path]
    if len(found) != 1:
        raise ValueError("Expected one original dependency profile: " + path)
    raw = found[0]["content"].encode("utf-8")
    if git_blob(raw) != identity:
        raise ValueError("Original dependency profile changed: " + path)
    return raw

def child_environment(temporary):
    # The read-only source token is confined to this acquisition process.
    result = {key: os.environ[key] for key in ("PATH", "HOME", "LANG", "LC_ALL") if key in os.environ}
    result.update({
        "CI": "true",
        "PYTHONDONTWRITEBYTECODE": "1",
        "TMPDIR": str(temporary),
        "NPM_CONFIG_CACHE": str(temporary / "npm-cache"),
        "NPM_CONFIG_AUDIT": "false",
        "NPM_CONFIG_FUND": "false",
        "NPM_CONFIG_UPDATE_NOTIFIER": "false",
    })
    return result

def command(argv, cwd, env, result_path):
    started = now()
    completed = subprocess.run(argv, cwd=cwd, env=env, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, text=True)
    save_json(result_path, {
        "command": argv, "exitCode": completed.returncode,
        "stdout": completed.stdout, "stderr": completed.stderr,
        "startedAt": started, "completedAt": now(),
    })
    print(json.dumps({"event": "PREPARATION_COMMAND_COMPLETE", "command": argv,
        "exitCode": completed.returncode, "result": result_path.name}), flush=True)
    if completed.returncode:
        raise RuntimeError("Original dependency preparation failed: " + result_path.name)

def emit_file(path, root):
    raw = path.read_bytes()
    name = str(path.relative_to(root))
    digest = hashlib.sha256(raw).hexdigest()
    encoded = base64.b64encode(raw).decode("ascii")
    size = 8192
    count = (len(encoded) + size - 1) // size
    print("SCF_RECEIVING_FILE " + json.dumps({
        "path": name, "bytes": len(raw), "sha256": digest,
        "encoding": "base64", "chunks": count,
    }), flush=True)
    for index in range(count):
        print("SCF_RECEIVING_CHUNK " + json.dumps({
            "path": name, "index": index,
            "data": encoded[index * size:(index + 1) * size],
        }), flush=True)
    print("SCF_RECEIVING_FILE_END " + json.dumps({"path": name, "sha256": digest}), flush=True)

def emit_results(root):
    paths = set(root.glob("*.json"))
    paths.update((root / "receiving" / "results").glob("*.json"))
    paths.update((root / "receiving").glob("*.json"))
    paths.update((root / "receiving" / "source").glob("*_RESULT.json"))
    for path in sorted(paths):
        if path.is_file():
            emit_file(path, root)
    lock = root / "mcp-dependencies" / "package-lock.json"
    if lock.is_file():
        emit_file(lock, root)

def receive(root):
    if os.environ.get("GITHUB_REPOSITORY") != REPOSITORY:
        raise ValueError("Use the original public merchant repository")
    if os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch":
        raise ValueError("This original operation is dispatched manually")
    if os.environ.get("RUNNER_OS") != "Linux":
        raise ValueError("Use the standard Ubuntu Linux runner")
    repository = api("/repos/" + REPOSITORY)
    if repository.get("private") is not False or repository.get("full_name") != REPOSITORY:
        raise ValueError("This receiving route requires the original public repository")
    if repository.get("id") != 1414985422:
        raise ValueError("Original repository identity changed")
    node = shutil.which("node")
    npm = shutil.which("npm")
    if not node or not npm or not shutil.which("flock"):
        raise RuntimeError("Use the standard runner's Node, npm and flock")
    node_version = subprocess.check_output([node, "--version"], text=True).strip()
    version = tuple(int(part) for part in node_version.lstrip("v").split(".")[:3])
    if version < (22, 13, 0):
        raise RuntimeError("The original MCP package requires Node >=22.13.0")
    save_json(root / "host.json", {
        "operation": OPERATION, "repository": REPOSITORY,
        "repositoryId": repository["id"], "visibility": repository["visibility"],
        "sourceCommit": SOURCE_COMMIT, "runnerImage": os.environ.get("ImageVersion"),
        "runnerOs": os.environ.get("RUNNER_OS"), "node": node_version,
        "python": sys.version, "runId": os.environ.get("GITHUB_RUN_ID"),
        "runAttempt": os.environ.get("GITHUB_RUN_ATTEMPT"), "startedAt": now(),
    })
    runner_object, runner_raw = blob(RUNNER_CAPSULE)
    source_object, source_raw = blob(SOURCE_CAPSULE)
    dependency_object, dependency_raw = blob(DEPENDENCY_CAPSULE)
    correction_object, _ = blob(CORRECTION_CAPSULE)
    runner = json.loads(runner_raw)
    source = json.loads(source_raw)
    dependencies = json.loads(dependency_raw)
    if source.get("sourceCommit") != SOURCE_COMMIT or dependencies.get("sourceCommit") != SOURCE_COMMIT:
        raise ValueError("Original receiving source commit changed")
    receiver = root / "receiver"
    receiver.mkdir()
    selected = {}
    for row in runner.get("files", []):
        path = row.get("path", "")
        if path.startswith(PREFIX):
            name = path[len(PREFIX):]
            if name in RUNNER_FILES:
                if name in selected:
                    raise ValueError("Duplicate original receiver source")
                raw = row["content"].encode("utf-8")
                if git_blob(raw) != RUNNER_FILES[name]:
                    raise ValueError("Original receiver leaf changed: " + name)
                selected[name] = raw
    if set(selected) != set(RUNNER_FILES):
        raise ValueError("Original receiver source closure is incomplete")
    for name, raw in selected.items():
        (receiver / name).write_bytes(raw)
    inputs = root / "inputs"
    inputs.mkdir()
    save_json(inputs / "original-capsule-object.json", source_object)
    save_json(inputs / "original-dependencies-object.json", dependency_object)
    save_json(inputs / "maintained-correction-object.json", correction_object)
    sdk = root / "sdk-dependencies"
    sdk.mkdir()
    sdk_profile = package_from_capsules([source, dependencies],
        "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/package.json", SDK_PACKAGE)
    _, sdk_lock = blob(SDK_LOCK)
    (sdk / "package.json").write_bytes(sdk_profile)
    (sdk / "package-lock.json").write_bytes(sdk_lock)
    mcp = root / "mcp-dependencies"
    mcp.mkdir()
    _, mcp_profile = blob(MCP_PACKAGE)
    (mcp / "package.json").write_bytes(mcp_profile)
    temporary = root / "preparation-runtime"
    temporary.mkdir()
    env = child_environment(temporary)
    command([npm, "ci", "--no-audit", "--no-fund"], sdk, env, root / "sdk-install.json")
    command([npm, "install", "--no-audit", "--no-fund"], mcp, env, root / "mcp-install.json")
    command([npm, "ls", "--all", "--json"], sdk, env, root / "sdk-installed.json")
    command([npm, "ls", "--all", "--json"], mcp, env, root / "mcp-installed.json")
    print(json.dumps({"event": "ORIGINAL_RECEIVER_START", "operation": OPERATION,
        "sourceCommit": SOURCE_COMMIT, "sourceCapsule": SOURCE_CAPSULE,
        "dependencyCapsule": DEPENDENCY_CAPSULE}), flush=True)
    completed = subprocess.run([
        sys.executable, str(receiver / "receive-capsule.py"),
        "--capsule-object", str(inputs / "original-capsule-object.json"),
        "--dependencies-object", str(inputs / "original-dependencies-object.json"),
        "--out", str(root / "receiving"),
        "--sdk-profile", str(sdk / "package.json"),
        "--sdk-node-modules", str(sdk / "node_modules"),
        "--mcp-node-modules", str(mcp / "node_modules"),
        "--node", node,
        "--correction-object", str(inputs / "maintained-correction-object.json"),
        "--program", "MCP_RECEIVABLES_CHECK.mjs",
    ], cwd=root, env=env)
    save_json(root / "hosted-result.json", {
        "operation": OPERATION, "sourceCommit": SOURCE_COMMIT,
        "exitCode": completed.returncode, "completedAt": now(),
        "correctionCapsule": CORRECTION_CAPSULE, "programs": ["MCP_RECEIVABLES_CHECK.mjs"],
    })
    return completed.returncode

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
        save_json(root / "hosted-error.json", {
            "operation": OPERATION, "code": type(error).__name__,
            "message": str(error), "completedAt": now(),
        })
        print(json.dumps({"event": "HOSTED_RECEIVING_FAILED",
            "code": type(error).__name__, "message": str(error)}), flush=True)
    finally:
        emit_results(root)
    return code

if __name__ == "__main__":
    raise SystemExit(main())
