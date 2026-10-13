#!/usr/bin/env python3
"""Restore, open and repack the complete SCF billing workflow in a chosen private directory."""
import argparse
import contextlib
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import secrets
import signal
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

sys.dont_write_bytecode = True
SCHEMA = "commons.scf-commercial-handover.v2"
OPERATION = "SCF-COMMERCIAL-MILESTONE-BILLING-F8C1-20261012"
MANIFEST = "portable-handover.json"
SELECTION = "portable-source-selection.json"
OPENER = "open-portable-commercial-handover.py"
LEGACY = "open-commercial-handover.py"
RECOVERY = "stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/recovery.mjs"
EXTRA_SOURCE = [
    "stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/recovery.mjs",
    "stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/relocation.mjs",
]
KEY_ENV = "SCF_CUSTOMER_HANDOVER_RESTORE_KEY"
EXPECTED_SOURCE_SHA256 = "b41e5904c97f6ed071ba524c7a604bbd3878fe9f3aa5f164e89ec1cc8bf503ee"

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read_json(path):
    return json.loads(Path(path).read_bytes())

def load_launcher():
    path = Path(__file__).with_name(LEGACY)
    spec = importlib.util.spec_from_file_location("scf_original_handover", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

L = load_launcher()

def safe_name(value):
    p = PurePosixPath(value)
    if not value or p.is_absolute() or ".." in p.parts or "\\" in value or p.as_posix() != value:
        raise RuntimeError("Unsafe complete-handover member: " + value)
    return p

def private_root(value):
    root = Path(os.path.abspath(os.path.expanduser(value)))
    for parent in reversed([root, *root.parents]):
        if parent.exists() or parent.is_symlink():
            mode = parent.lstat().st_mode
            if not stat.S_ISDIR(mode) or stat.S_ISLNK(mode):
                raise RuntimeError("Choose a directory with ordinary directory ancestors: " + str(parent))
    root.mkdir(mode=0o700, parents=False, exist_ok=True)
    mode = root.lstat()
    if mode.st_mode & 0o077 or (hasattr(os, "getuid") and mode.st_uid != os.getuid()):
        raise RuntimeError("The chosen SCF root must belong to this user and have mode0700: " + str(root))
    return root

def configure(root, selection_sha):
    L.ORIGINAL = root
    L.WORK = root / "work"
    L.ACCOUNT = L.WORK / "accounting"
    L.TERMS = root / "private/terms.json"
    L.APP = root / "app"
    L.MARKER = root / "commercial-handover.json"
    L.COMMIT = "source-selection:" + selection_sha

@contextlib.contextmanager
def root_lock(root):
    path = root / ".portable-handover.lock"
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        value = os.fstat(descriptor)
        if not stat.S_ISREG(value.st_mode) or value.st_nlink != 1 or value.st_mode & 0o077:
            raise RuntimeError("The retained handover lock must be a private regular file.")
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("This complete SCF workspace is already open or being received.")
        yield
    finally:
        os.close(descriptor)

def checkpoint(path, value):
    L.private_directory(path.parent)
    if path.exists():
        L.regular_private(path)
    fd, temporary = tempfile.mkstemp(prefix=".portable-state-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(canonical(value) + b"\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def destination(root, row):
    p = safe_name(row["path"])
    role = row["role"]
    if role == "source" and p.parts[0] == "source" and len(p.parts) > 1:
        return root / "app" / Path(*p.parts[1:])
    if role == "work" and p.parts[0] == "original-work" and len(p.parts) > 1:
        return root / "work" / Path(*p.parts[1:])
    if role == "backup" and p.parts[0] == "account-backup" and len(p.parts) > 1:
        return root / "portable-backup" / Path(*p.parts[1:])
    if role == "key" and row["path"] == "private/restore-key.txt":
        return root / "private/restore-key.txt"
    if role == "document" and len(p.parts) == 1:
        return root / "delivery" / p.name
    raise RuntimeError("Unexpected complete-handover file role: " + row["path"])

def load_package(path, expected_sha=None):
    path = Path(path).resolve()
    if expected_sha and sha(path.read_bytes()) != expected_sha:
        raise RuntimeError("The ZIP differs from the selected complete handover SHA256.")
    archive = zipfile.ZipFile(path)
    try:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise RuntimeError("Duplicate complete-handover members.")
        manifest = json.loads(archive.read(MANIFEST))
        if manifest.get("schema") != SCHEMA or manifest.get("operation") != OPERATION:
            raise RuntimeError("Select a complete portable SCF commercial handover.")
        rows = manifest["files"]
        if len(rows) != len({row["path"] for row in rows}):
            raise RuntimeError("Duplicate complete-handover manifest members.")
        if set(names) != {row["path"] for row in rows} | {MANIFEST}:
            raise RuntimeError("The ZIP and its complete file manifest differ.")
        selection = json.loads(archive.read(SELECTION))
        if sha(canonical(selection)) != manifest["sourceSelectionSha256"] or manifest["sourceSelectionSha256"] != EXPECTED_SOURCE_SHA256:
            raise RuntimeError("The product source selection has changed.")
        source_rows = sorted(
            ({"path": row["path"][7:], "bytes": row["bytes"], "sha256": row["sha256"]}
             for row in rows if row["role"] == "source"), key=lambda row: row["path"])
        if source_rows != selection["files"] or len(source_rows) != 243:
            raise RuntimeError("The complete243-file billing and recovery runtime is missing.")
        required = {"original-work/source/planning.sqlite3", "original-work/receiving/planning.sqlite3",
                    "private/restore-key.txt", "account-backup/backup.json", OPENER, LEGACY, SELECTION}
        if not required <= set(names):
            raise RuntimeError("The complete account, both planning cases, or customer opener is missing.")
        for row in rows:
            destination(Path("/complete-handover"), row)
            body = archive.read(row["path"])
            if len(body) != row["bytes"] or sha(body) != row["sha256"]:
                raise RuntimeError("A retained member differs from its file manifest: " + row["path"])
        receipt = json.loads(archive.read("account-backup/backup.json"))
        if receipt["manifestSha256"] != manifest["backup"]["manifestSha256"]:
            raise RuntimeError("The selected native account backup differs from this handover.")
        return archive, manifest
    except BaseException:
        archive.close()
        raise

def native(repo, node, action, arguments, key_path=None, timeout=180):
    env = os.environ.copy()
    if key_path is not None:
        key = Path(key_path).read_text().strip()
        if not 16 <= len(key.encode()) <= 65536:
            raise RuntimeError("The private restore key has an invalid length.")
        env[KEY_ENV] = key
        arguments = {**arguments, "passEnv": KEY_ENV}
    script = r"""
import {pathToFileURL} from 'node:url';
let raw='';for await(const part of process.stdin)raw+=part;
const cfg=JSON.parse(raw);const module=await import(pathToFileURL(cfg.module));
try{console.log(JSON.stringify(await module[cfg.action](cfg.arguments)));}
catch(error){console.error(JSON.stringify({error:error.message,code:error.code}));process.exitCode=1;}
"""
    child = subprocess.Popen([node, "--input-type=module", "-e", script],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, env=env, start_new_session=True)
    try:
        stdout, stderr = child.communicate(json.dumps({
            "module": str(repo / RECOVERY), "action": action, "arguments": arguments}), timeout=timeout)
        if child.returncode:
            raise RuntimeError("Native accounting recovery: " + stderr.strip()[-2000:])
        return json.loads(stdout.strip().splitlines()[-1])
    finally:
        # SF101 is a child of the native recovery driver. Close the owned group
        # when startup, a deadline, cancellation or parsing exits this call.
        try:
            os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            child.communicate(timeout=8)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.communicate(timeout=8)

def assert_identity(binding, manifest):
    original = manifest["binding"]
    if any(binding.get(name) != original.get(name) for name in ("workspaceId", "sourcesSha256")):
        raise RuntimeError("The selected account or original source identity differs from this complete handover.")

def assert_runtime(root, manifest):
    for row in manifest["files"]:
        if row["role"] == "source":
            target = destination(root, row)
            L.regular_private(target)
            if sha(target.read_bytes()) != row["sha256"]:
                raise RuntimeError("The installed product source has changed: " + row["path"])

def receive(root, archive, manifest, node):
    fingerprint = sha(canonical(manifest))
    completed = root / "portable-handover.json"
    pending = root / ".portable-receive.json"
    if completed.exists():
        L.regular_private(completed)
        installed = read_json(completed)
        if installed.get("manifestSha256") != fingerprint:
            raise RuntimeError("A different edition already occupies this root. Open its retained ZIP or choose a new root.")
        assert_runtime(root, manifest)
        binding = L.inspect_binding(L.APP, node)
        assert_identity(binding, manifest)
        return {"stage": "CONTINUED", "binding": binding, "root": str(root)}
    progress = {"schema": SCHEMA, "operation": OPERATION, "manifestSha256": fingerprint, "phase": "staging"}
    if pending.exists():
        L.regular_private(pending)
        progress = read_json(pending)
        if progress.get("manifestSha256") != fingerprint:
            raise RuntimeError("This root is receiving another complete edition; its progress was preserved.")
    else:
        checkpoint(pending, progress)
    for row in manifest["files"]:
        if row["role"] != "work":
            L.put_new(destination(root, row), archive.read(row["path"]))
    if progress["phase"] == "staging":
        backup = manifest["backup"]
        receipt = native(L.APP, node, "restoreAccountingWorkspace", {
            "bundle": str(root / "portable-backup"), "expectedSha256": backup["manifestSha256"],
            "directory": str(L.ACCOUNT), "stateRoot": str(root), "quiesced": True, "relocate": True,
            "expectedWorkspaceId": manifest["binding"]["workspaceId"],
            "expectedSourcesSha256": manifest["binding"]["sourcesSha256"],
        }, root / "private/restore-key.txt")
        if receipt.get("status") != "ACCOUNTING_WORKSPACE_RESTORED":
            raise RuntimeError("The native account has not finished receiving.")
        if receipt["originalWorkspaceSha256"] != backup["workspaceSha256"]:
            raise RuntimeError("The authenticated native backup belongs to a different saved account edition.")
        assert_identity(receipt["binding"], manifest)
        progress.update(phase="native-restored", receipt=receipt)
        checkpoint(pending, progress)
    binding = L.inspect_binding(L.APP, node)
    assert_identity(binding, manifest)
    for row in manifest["files"]:
        if row["role"] == "work":
            L.put_new(destination(root, row), archive.read(row["path"]))
    legacy_marker = {"schema": L.SCHEMA, "operation": OPERATION, "sourceCommit": L.COMMIT,
                     "manifestSha256": fingerprint, "binding": binding}
    L.put_new(L.MARKER, canonical(legacy_marker) + b"\n")
    L.put_new(root / "installed-portable-manifest.json", canonical(manifest) + b"\n")
    checkpoint(completed, {"schema": SCHEMA, "operation": OPERATION, "manifestSha256": fingerprint,
                          "sourceSelectionSha256": manifest["sourceSelectionSha256"], "binding": binding,
                          "nativeReceipt": progress["receipt"]})
    pending.unlink()
    return {"stage": "RESTORED", "binding": binding, "root": str(root),
            "sourceFiles": 243, "planningCases": ["source", "receiving"]}

def portable_guide(manifest):
    return """# Complete SCF customer billing workspace

This handover opens the original accounting workspace and both saved planning cases in a private directory you choose. The included operating example has two USD4400 milestones, with the first invoice paid4400.00 and due0.00. Its invoice, receipt and allocation identities are retained.

## Open

Use Linux, Python3.11 or later and Node.js22 or later. Keep the ZIP and its two opener scripts together in a private folder. Run:

    python3 -B open-portable-commercial-handover.py inspect COMPLETE.zip
    python3 -B open-portable-commercial-handover.py open COMPLETE.zip --root /absolute/private/scf-billing

Replace COMPLETE.zip with this archive's filename. The parent of the chosen root must already exist. The opener creates the root with mode0700; an existing root must already have that mode. The new root must be separate from the original account directory recorded in the archive.

Open the private access HTML printed by the command. Choose Delivery operations, the retained case and Customer billing. Select the saved Freeform Solutions schedule. Refresh invoices and payments to read the original account. Use the saved pending-operation recovery control when the selected case has an unfinished invoice response.

To use the separately received planning case, add --case receiving. Ctrl+C closes both services. Running open again continues later accounting and planning changes in the same root. An interrupted first receive resumes its original account operation and file installation.

## Save later work and move again

Close the workspace, then run:

    python3 -B open-portable-commercial-handover.py repack --root /absolute/private/scf-billing --out /absolute/private/SCF_Billing_Later.zip --quiesced

The new ZIP includes the current native account backup, both current planning databases, customer files and the complete243-file runtime. Open it with the same command and a different private root. Each move preserves the original logical accounting identity while the native engine updates physical source paths.

## Contents and privacy

The complete ZIP carries all243 selected product files, the native encrypted accounting backup, both complete planning cases, commercial working files, source selection, full file manifest and both opener scripts. It also carries a private, package-specific restore key so this handover can be opened end to end. Treat the entire ZIP as private account material; the co-delivered key makes the encrypted backup portable, and does not provide confidentiality from someone who possesses the whole ZIP. The opener passes that key privately to the native recovery process and does not print it.

The installed state retains a receiving marker and source hashes. A different existing file or another active opener is preserved and reported. Use a fresh private root for another saved edition. Source selection SHA256: """ + manifest["sourceSelectionSha256"] + "\n"

def covered_work_paths(binding):
    directory = Path(binding["directory"])
    work = directory.parent
    covered = [directory]
    for name, value in binding["sources"].items():
        p = Path(value)
        if p == work or work in p.parents:
            covered.append(p)
    return work, covered

def work_is_covered(relative, work, covered):
    p = work / Path(*PurePosixPath(relative).parts)
    return any(p == item or item in p.parents for item in covered)

def write_package(target, repo, paths, work_members, backup, key, binding, workspace_sha, source_history, native_record):
    target = Path(target).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    bodies = {}
    rows = []
    def add(name, body, role):
        safe_name(name)
        if name in bodies:
            raise RuntimeError("Duplicate complete package member: " + name)
        bodies[name] = body
        rows.append({"path": name, "role": role, "bytes": len(body), "sha256": sha(body)})
    selected = []
    for name in sorted(set(paths)):
        p = repo / Path(*PurePosixPath(name).parts)
        body = p.read_bytes()
        add("source/" + name, body, "source")
        selected.append({"path": name, "bytes": len(body), "sha256": sha(body)})
    if len(selected) != 243:
        raise RuntimeError("Select the complete243-file customer runtime.")
    selection = {**source_history, "files": selected}
    if sha(canonical(selection)) != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("The runtime differs from this opener\'s complete operated source selection.")
    for name, body in sorted(work_members.items()):
        add("original-work/" + name, body, "work")
    for path in L.source_paths(backup):
        add("account-backup/" + path.relative_to(backup).as_posix(), path.read_bytes(), "backup")
    add("private/restore-key.txt", Path(key).read_bytes(), "key")
    add(OPENER, Path(__file__).read_bytes(), "document")
    add(LEGACY, Path(__file__).with_name(LEGACY).read_bytes(), "document")
    add(SELECTION, canonical(selection) + b"\n", "document")
    receipt = read_json(backup / "backup.json")
    manifest = {"schema": SCHEMA, "operation": OPERATION,
                "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "binding": {k: binding[k] for k in ("workspaceId", "sourcesSha256")},
                "backup": {"manifestSha256": receipt["manifestSha256"], "workspaceSha256": workspace_sha,
                           "sourceDirectory": binding["directory"]},
                "sourceSelectionSha256": sha(canonical(selection)),
                "native": native_record, "files": rows}
    guide = portable_guide(manifest)
    add("README.md", guide.encode(), "document")
    descriptor, temporary = tempfile.mkstemp(prefix=".complete-scf-", suffix=".zip", dir=target.parent)
    os.close(descriptor)
    try:
        with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for name, body in bodies.items():
                archive.writestr(name, body)
            archive.writestr(MANIFEST, canonical(manifest) + b"\n")
        verified, _ = load_package(temporary)
        verified.close()
        os.link(temporary, target)
    finally:
        os.unlink(temporary)
    for name in (OPENER, LEGACY):
        copy = target.parent / name
        if copy.resolve() != Path(__file__).with_name(name).resolve():
            if copy.exists() and copy.read_bytes() != bodies[name]:
                raise RuntimeError("The ZIP was saved; preserve the different existing opener: " + str(copy))
            if not copy.exists():
                copy.write_bytes(bodies[name])
                os.chmod(copy, 0o600)
    guide_path = target.with_name(target.stem + "_Guide.md")
    if guide_path.exists() and guide_path.read_text() != guide:
        raise RuntimeError("The ZIP was saved; preserve the different existing guide: " + str(guide_path))
    if not guide_path.exists():
        guide_path.write_text(guide)
        os.chmod(guide_path, 0o600)
    return {"stage": "PACKED", "archive": str(target), "guide": str(guide_path),
            "bytes": target.stat().st_size, "sha256": sha(target.read_bytes()),
            "sourceFiles": 243, "sourceSelectionSha256": manifest["sourceSelectionSha256"],
            "binding": manifest["binding"]}

def build(args):
    archive, original = L.load_archive(args.legacy_archive, args.sha256)
    try:
        repo, backup, key = Path(args.repo).resolve(), Path(args.backup).resolve(), Path(args.key).resolve()
        node = L.node_path(args.node)
        native(repo, node, "verifyAccountingBackup", {"bundle": str(backup)}, key)
        rows = original["files"]
        paths = [row["path"][7:] for row in rows if row["role"] == "source"] + EXTRA_SOURCE
        work, covered = covered_work_paths(original["binding"])
        work_members = {row["path"][14:]: archive.read(row["path"]) for row in rows
                        if row["role"] == "work" and not work_is_covered(row["path"][14:], work, covered)}
        account_row = next(row for row in rows if row["path"] == "original-work/accounting/workspace.json")
        history = {"originalCommit": original["sourceCommit"],
                   "nativeRecoveryBase": "1530661cbb033d29fd955e66fb2a558078cc0af5"}
        result = write_package(args.out, repo, paths, work_members, backup, key, original["binding"],
                               account_row["sha256"], history, original["native"])
        print(json.dumps(result), flush=True)
    finally:
        archive.close()

def repack(args):
    root = private_root(args.root)
    manifest = read_json(root / "installed-portable-manifest.json")
    if manifest.get("schema") != SCHEMA or manifest.get("operation") != OPERATION:
        raise RuntimeError("Choose an installed complete portable customer handover.")
    configure(root, manifest["sourceSelectionSha256"])
    with root_lock(root):
        assert_runtime(root, manifest)
        node = L.node_path(args.node)
        binding = L.inspect_binding(L.APP, node)
        assert_identity(binding, manifest)
        with tempfile.TemporaryDirectory(prefix=".scf-portable-snapshot-", dir=root.parent) as temporary:
            stage = Path(temporary)
            key = stage / "restore-key.txt"
            key.write_text(secrets.token_urlsafe(48) + "\n")
            os.chmod(key, 0o600)
            backup = stage / "account-backup"
            snapshot = native(L.APP, node, "snapshotAccountingWorkspace", {
                "directory": str(L.ACCOUNT), "stateRoot": str(root), "output": str(backup), "quiesced": True,
            }, key)
            if snapshot["status"] != "ACCOUNTING_BACKUP_CREATED":
                raise RuntimeError("The current account backup is incomplete.")
            work, covered = covered_work_paths(binding)
            members = {}
            for path in L.source_paths(L.WORK):
                relative = path.relative_to(L.WORK).as_posix()
                if (work_is_covered(relative, work, covered) or path.name in ("access.key", "open-workspace.html")
                        or path.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")):
                    continue
                members[relative] = path.read_bytes()
            selection = read_json(root / "delivery" / SELECTION)
            result = write_package(args.out, L.APP, [r["path"] for r in selection["files"]],
                members, backup, key, binding, snapshot["workspaceSha256"],
                {k: v for k, v in selection.items() if k != "files"}, manifest["native"])
            print(json.dumps(result), flush=True)

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("inspect", "restore", "open"):
        sub = commands.add_parser(name)
        sub.add_argument("archive")
        sub.add_argument("--sha256")
        if name != "inspect":
            sub.add_argument("--root", required=True)
            sub.add_argument("--node")
        if name == "open":
            sub.add_argument("--case", choices=("source", "receiving"), default="source")
            sub.add_argument("--port", type=int, default=0)
    building = commands.add_parser("build", help="Assemble this original case and its verified native account backup.")
    for name in ("legacy-archive", "repo", "backup", "key", "out"):
        building.add_argument("--" + name, required=True)
    building.add_argument("--sha256")
    building.add_argument("--node")
    packing = commands.add_parser("repack", help="Save the current closed portable account and both planning cases.")
    packing.add_argument("--root", required=True)
    packing.add_argument("--out", required=True)
    packing.add_argument("--node")
    packing.add_argument("--quiesced", action="store_true", required=True)
    args = parser.parse_args(argv)
    if args.command == "build":
        build(args)
        return
    if args.command == "repack":
        repack(args)
        return
    archive, manifest = load_package(args.archive, args.sha256)
    try:
        if args.command == "inspect":
            print(json.dumps({"schema": SCHEMA, "operation": OPERATION, "files": len(manifest["files"]),
                              "sourceFiles": 243, "binding": manifest["binding"],
                              "backup": manifest["backup"],
                              "sourceSelectionSha256": manifest["sourceSelectionSha256"]}, indent=2))
            return
        if args.command == "open" and not 0 <= args.port <= 65535:
            parser.error("--port must be between0 and65535")
        root = private_root(args.root)
        configure(root, manifest["sourceSelectionSha256"])
        with root_lock(root):
            result = receive(root, archive, manifest, L.node_path(args.node))
            print(json.dumps(result), flush=True)
            if args.command == "open":
                runtime_manifest = {"binding": result["binding"],
                                    "files": [r for r in manifest["files"] if r["role"] == "source"]}
                L.open_handover(args, archive, runtime_manifest)
    finally:
        archive.close()

if __name__ == "__main__":
    def terminate_signal(number, _frame):
        raise SystemExit(128 + number)
    signal.signal(signal.SIGTERM, terminate_signal)
    try:
        main()
    except KeyboardInterrupt:
        raise SystemExit(130)
    except (RuntimeError, ValueError, KeyError, OSError, subprocess.SubprocessError, zipfile.BadZipFile) as error:
        print(json.dumps({"state": "ERROR", "error": str(error)}), file=sys.stderr)
        raise SystemExit(1)
