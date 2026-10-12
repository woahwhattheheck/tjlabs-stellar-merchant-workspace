#!/usr/bin/env python3
"""Pack, restore and open the original SCF commercial billing handover."""
import argparse
import hashlib
import json
import os
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import zipfile
from pathlib import Path, PurePosixPath

sys.dont_write_bytecode = True
SCHEMA = "commons.scf-commercial-handover.v1"
OPERATION = "SCF-COMMERCIAL-MILESTONE-BILLING-F8C1-20261012"
COMMIT = "5f4c92edc4278cb1b3da08d41fd11b6cacb9bc6f"
ORIGINAL = Path("/dev/f8c1-scf-commercial-vhiw4uxw")
WORK = ORIGINAL / "work"
ACCOUNT = WORK / "accounting"
TERMS = ORIGINAL / "private/terms.json"
APP = ORIGINAL / "app"
MARKER = ORIGINAL / "commercial-handover.json"
GRANT = "stellar/scf_2026/sf47_budget_model"
BINDING = "stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/binding.mjs"
RECEIVABLES = "stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/server.mjs"
NAME = "SCF_Customer_Billing_Complete_Workflow_20261012"
SOURCE_SELECTION_SHA256 = "a07defdc20af4b24766697e16f38f9b7df68b757c9c231497d69a51c126beaf4"

def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read_json(path):
    return json.loads(Path(path).read_bytes())

def node_path(value=None):
    executable = value or os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
    if not executable:
        raise RuntimeError("Install Node.js 22 or later to open this original workspace.")
    executable = shutil.which(executable) or str(Path(executable).expanduser().resolve())
    version = subprocess.run([executable, "--version"], capture_output=True, text=True, check=True).stdout.strip()
    if int(version.lstrip("v").split(".")[0]) < 22:
        raise RuntimeError("The original accounting service requires Node.js 22 or later.")
    return executable

def inspect_binding(repo, node):
    js = "const m=await import(process.argv[1]);console.log(JSON.stringify(await m.inspectAccountingWorkspaceBinding(process.argv[2])));"
    result = subprocess.run(
        [node, "--input-type=module", "-e", js, (repo / BINDING).as_uri(), str(ACCOUNT)],
        capture_output=True, text=True, check=True, timeout=30)
    binding = json.loads(result.stdout.strip().splitlines()[-1])
    expected_sources = {"outboxDir": str(WORK / "outbox"), "proofDir": str(WORK / "proofs"), "termsFile": str(TERMS)}
    if binding["directory"] != str(ACCOUNT) or binding["sources"] != expected_sources:
        raise RuntimeError("The selected account has different original source paths.")
    return binding

def private_directory(path):
    if path == ORIGINAL.parent:
        return
    if path != ORIGINAL and ORIGINAL not in path.parents:
        raise ValueError("The handover can create only its original private root.")
    private_directory(path.parent)
    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        pass
    value = path.lstat()
    if not stat.S_ISDIR(value.st_mode) or stat.S_ISLNK(value.st_mode):
        raise RuntimeError("Expected an original directory without symlinks: " + str(path))
    if hasattr(os, "getuid") and value.st_uid != os.getuid():
        raise RuntimeError("The original directory belongs to another operating-system user: " + str(path))
    if value.st_mode & 0o077:
        raise RuntimeError("The original handover directory must be private (mode0700): " + str(path))

def regular_private(path):
    value = path.lstat()
    if not stat.S_ISREG(value.st_mode) or stat.S_ISLNK(value.st_mode) or value.st_nlink != 1:
        raise RuntimeError("Expected a private regular file without links: " + str(path))
    if hasattr(os, "getuid") and value.st_uid != os.getuid():
        raise RuntimeError("The original file belongs to another operating-system user: " + str(path))
    if value.st_mode & 0o077:
        raise RuntimeError("The original handover file must be private (mode0600): " + str(path))

def put_new(path, body):
    private_directory(path.parent)
    if path.exists() or path.is_symlink():
        regular_private(path)
        if path.read_bytes() != body:
            raise RuntimeError("The existing file has later or different bytes; it was preserved: " + str(path))
        return False
    descriptor, temporary = tempfile.mkstemp(prefix=".commercial-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            regular_private(path)
            if path.read_bytes() != body:
                raise RuntimeError("The original path changed during receiving: " + str(path))
    finally:
        os.unlink(temporary)
    return True

def source_paths(root):
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise RuntimeError("Retain complete regular original source files: " + str(path))
        if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc":
            yield path

def guide(manifest):
    native = manifest["native"]
    return f"""# Customer milestone billing

This handover opens the same saved SCF delivery cases and their original customer accounting workspace. It contains both planning databases, the complete accounting directory, original commercial inputs, customer exports and all241 selected product source files.

The included operating example has two original USD4400 milestones. Its first invoice has USD{native.get('firstInvoicePaid', '4400.00')} paid and USD{native.get('firstInvoiceAmountDue', '0.00')} due. Invoice identities, the recorded receipt and allocation stay in the retained account. These example records are included for operating review.

## Open the complete handover

Use Linux with Python3.11 or later and Node.js22 or later. Extract the ZIP into a private folder. Run the opener from that folder:

    python3 -B open-commercial-handover.py inspect SCF_Customer_Billing_Complete_Workflow_20261012.zip

If the ZIP is elsewhere, supply its exact path. To restore and open:

    python3 -B open-commercial-handover.py open /absolute/path/SCF_Customer_Billing_Complete_Workflow_20261012.zip

The original service uses its absolute accounting path in its workspace identity. This opener restores the original private root at {ORIGINAL}; the Linux user running it must be able to create that root. The opener creates missing files, reuses identical files, and preserves any different existing state. It keeps the original account and source identities and reconnects the existing probe-accounting endpoint to the current local service port.

Open the private access HTML file printed by the command. Select Delivery operations, the retained case and Customer billing. Use the original pending-operation recovery control when the selected saved case has an unfinished invoice response. Refresh invoices and payments to read the retained account.

The default case is the original source planning workspace. The separately received case is available with:

    python3 -B open-commercial-handover.py open /absolute/path/SCF_Customer_Billing_Complete_Workflow_20261012.zip --case receiving

Stop the launcher with Ctrl+C. It closes the original planning and accounting services. Repeating open continues the current restored workspace; it does not overwrite later accounting or planning changes with the older archive. Use pack from a closed workspace to retain a later complete edition.

## What is retained

- source/: the exact selected product source and its file hashes.
- original-work/: both complete planning cases, the entire accounting workspace, original ZIP inputs, saved commercial operations and customer downloads.
- original-terms.json: the unchanged original accounting terms.
- commercial-handover.json: the complete source/file manifest and native accounting binding.
- open-commercial-handover.py: this restore/open/pack command.
- source-selection.json: selected commit and full original source list.

Selected commit: {COMMIT}.
Native workflow: {native.get('state')}. Browser receiving: {manifest['browser'].get('state', 'PENDING')}.
Original operation: {OPERATION}.
"""

def pack(args):
    repo = Path(args.repo).resolve()
    work = Path(args.work).resolve()
    if work != WORK:
        raise RuntimeError("Pack the closed original working directory at " + str(WORK))
    native = read_json(work / "workflow-result.json")
    if native.get("state") != "COMPLETE":
        raise RuntimeError("Complete the retained native financial operation before packing this handover.")
    browser_path = work / "browser-review/browser-result.json"
    browser = read_json(browser_path) if browser_path.is_file() else {"state": "PENDING"}
    if not args.allow_pending_browser and browser.get("state") != "COMPLETE":
        raise RuntimeError("The original browser receiving is still pending.")
    binding = inspect_binding(repo, node_path(args.node))
    for name in ("source", "receiving"):
        if not (work / name / "planning.sqlite3").is_file():
            raise RuntimeError("The complete original planning database is missing: " + name)
    sources = list(source_paths(repo))
    if len(sources) != 241:
        raise RuntimeError("Select the original241-file product source closure; received " + str(len(sources)))
    out = Path(args.out).resolve()
    out.mkdir(mode=0o700, parents=True, exist_ok=True)
    if out == work or work in out.parents:
        raise RuntimeError("Place the delivery outside the original work tree.")
    target = out / (NAME + ".zip")
    if target.exists():
        raise RuntimeError("The target handover already exists. Select a new delivery directory.")
    files, bodies = [], {}
    def add(name, body, role):
        if name in bodies:
            raise RuntimeError("Duplicate handover filename: " + name)
        bodies[name] = body
        files.append({"path": name, "role": role, "bytes": len(body), "sha256": sha(body)})
    for path in sources:
        add("source/" + path.relative_to(repo).as_posix(), path.read_bytes(), "source")
    for path in source_paths(work):
        if path.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp") or path.name in ("access.key", "open-workspace.html"):
            continue
        add("original-work/" + path.relative_to(work).as_posix(), path.read_bytes(), "work")
    add("original-terms.json", TERMS.read_bytes(), "terms")
    add("open-commercial-handover.py", Path(__file__).read_bytes(), "document")
    source_selection = {"commit": COMMIT, "files": [
        {"path": row["path"][7:], "bytes": row["bytes"], "sha256": row["sha256"]}
        for row in files if row["role"] == "source"]}
    if sha(canonical(source_selection)) != SOURCE_SELECTION_SHA256:
        raise RuntimeError("The source files differ from the original selected Git closure.")
    add("source-selection.json", canonical(source_selection) + b"\n", "document")
    manifest = {"schema": SCHEMA, "operation": OPERATION, "sourceCommit": COMMIT, "originalRoot": str(ORIGINAL),
                "binding": binding, "native": native, "browser": {k: v for k, v in browser.items() if k != "screens"},
                "files": files}
    text = guide(manifest)
    add("README.md", text.encode(), "document")
    manifest_bytes = canonical(manifest) + b"\n"
    with zipfile.ZipFile(target, "x", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, body in bodies.items():
            archive.writestr(name, body)
        archive.writestr("commercial-handover.json", manifest_bytes)
    with zipfile.ZipFile(target) as archive:
        if archive.testzip():
            raise RuntimeError("The complete archive failed its member readback.")
    guide_path = out / (NAME + "_Guide.md")
    guide_path.write_text(text)
    opener_path = out / "open-commercial-handover.py"
    if opener_path.resolve() != Path(__file__).resolve():
        opener_path.write_bytes(Path(__file__).read_bytes())
    print(json.dumps({"stage": "prepared", "archive": str(target), "bytes": target.stat().st_size,
                      "sha256": sha(target.read_bytes()), "manifestSha256": sha(canonical(manifest)),
                      "guide": str(guide_path), "opener": str(opener_path), "sourceFiles": len(sources),
                      "binding": binding, "browserState": browser.get("state")}), flush=True)

def destination(row):
    name = PurePosixPath(row["path"])
    if name.is_absolute() or ".." in name.parts or "\\" in row["path"]:
        raise RuntimeError("Unsafe handover filename.")
    role = row["role"]
    if role == "source" and name.parts[0] == "source":
        return APP.joinpath(*name.parts[1:])
    if role == "work" and name.parts[0] == "original-work":
        return WORK.joinpath(*name.parts[1:])
    if role == "terms" and row["path"] == "original-terms.json":
        return TERMS
    if role == "document" and len(name.parts) == 1:
        return ORIGINAL / "delivery" / name.name
    raise RuntimeError("Unexpected handover file role.")

def load_archive(path, expected_sha=None):
    path = Path(path).resolve()
    if expected_sha and sha(path.read_bytes()) != expected_sha:
        raise RuntimeError("The archive differs from the selected complete handover SHA256.")
    archive = zipfile.ZipFile(path)
    names = archive.namelist()
    if len(set(names)) != len(names):
        archive.close()
        raise RuntimeError("The archive contains duplicate member names.")
    try:
        manifest = json.loads(archive.read("commercial-handover.json"))
        if (manifest.get("schema") != SCHEMA or manifest.get("operation") != OPERATION
                or manifest.get("sourceCommit") != COMMIT or manifest.get("originalRoot") != str(ORIGINAL)):
            raise RuntimeError("Select this operation's complete original source handover.")
        selection = json.loads(archive.read("source-selection.json"))
        if sha(canonical(selection)) != SOURCE_SELECTION_SHA256:
            raise RuntimeError("The original pinned source selection has changed.")
        rows = manifest["files"]
        actual_sources = sorted(({"path": row["path"][7:], "bytes": row["bytes"], "sha256": row["sha256"]} for row in rows if row["role"] == "source"), key=lambda row: row["path"])
        if actual_sources != selection["files"]:
            raise RuntimeError("The source file records differ from the original pinned selection.")
        if len({row["path"] for row in rows}) != len(rows):
            raise RuntimeError("The handover manifest contains duplicate names.")
        if set(names) != {row["path"] for row in rows} | {"commercial-handover.json"}:
            raise RuntimeError("The archive and complete file manifest differ.")
        if sum(row["role"] == "source" for row in rows) != 241:
            raise RuntimeError("The complete original product source closure is missing.")
        for row in rows:
            destination(row)
            body = archive.read(row["path"])
            if len(body) != row["bytes"] or sha(body) != row["sha256"]:
                raise RuntimeError("A retained file differs from its manifest: " + row["path"])
        return archive, manifest
    except BaseException:
        archive.close()
        raise

def receive(archive, manifest):
    rows = manifest["files"]
    for row in rows:
        target = destination(row)
        if target.exists() or target.is_symlink():
            regular_private(target)
            if sha(target.read_bytes()) != row["sha256"]:
                raise RuntimeError("The existing original file has different state and was preserved: " + str(target))
        for parent in target.parents:
            if parent == ORIGINAL.parent:
                break
            if parent.exists() and parent.is_symlink():
                raise RuntimeError("A restored path has a symlink ancestor: " + str(parent))
    created = 0
    for row in rows:
        created += put_new(destination(row), archive.read(row["path"]))
    marker = {"schema": SCHEMA, "operation": OPERATION, "manifestSha256": sha(canonical(manifest)),
              "binding": manifest["binding"], "sourceCommit": COMMIT}
    put_new(MARKER, canonical(marker) + b"\n")
    return created

def stop_child(child):
    if child and child.poll() is None:
        child.terminate()
        try:
            child.wait(timeout=8)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()

def open_handover(args, archive, manifest):
    if MARKER.exists():
        regular_private(MARKER)
        marker = read_json(MARKER)
        if (marker.get("schema") != SCHEMA or marker.get("operation") != OPERATION
                or marker.get("sourceCommit") != COMMIT or marker.get("binding") != manifest["binding"]):
            raise RuntimeError("A different retained account or product source is already installed at the original path.")
        for row in manifest["files"]:
            if row["role"] == "source":
                target = destination(row)
                regular_private(target)
                if sha(target.read_bytes()) != row["sha256"]:
                    raise RuntimeError("The installed original product source has changed: " + row["path"])
    else:
        receive(archive, manifest)
    node = node_path(args.node)
    os.environ["PATH"] = str(Path(node).parent) + os.pathsep + os.environ.get("PATH", "")
    if inspect_binding(APP, node) != manifest["binding"]:
        raise RuntimeError("The original accounting binding has changed.")
    sys.path.insert(0, str(APP / GRANT / "workspace"))
    from server import create_server
    from operations_commercial_adapter import CommercialConnectionAdapter
    js = r"""
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
let raw='';for await(const chunk of process.stdin)raw+=chunk;const cfg=JSON.parse(raw);
const {createReceivablesServer}=await import(pathToFileURL(cfg.module));
const state=JSON.parse(await readFile(cfg.directory+'/workspace.json','utf8'));
const service=await createReceivablesServer({directory:cfg.directory,...state.sources,host:'127.0.0.1',port:0});
console.log(JSON.stringify({baseUrl:new URL('/api/receivables',service.url).href}));
let closing=false;async function close(){if(closing)return;closing=true;await service.close();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
"""
    log_path = ORIGINAL / "accounting-open.stderr"
    log = log_path.open("a")
    os.chmod(log_path, 0o600)
    child = server = None
    previous_signals = {}
    stopping = threading.Event()
    serving = closing = False
    def shutdown(_number, _frame):
        if closing:
            return
        if not serving:
            raise KeyboardInterrupt
        if not stopping.is_set():
            stopping.set()
            threading.Thread(target=server.shutdown, daemon=True).start()
    try:
        for name in (signal.SIGTERM, signal.SIGINT):
            previous_signals[name] = signal.signal(name, shutdown)
        child = subprocess.Popen([node, "--input-type=module", "-e", js], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=log, text=True, cwd=APP)
        child.stdin.write(json.dumps({"module": str(APP / RECEIVABLES), "directory": str(ACCOUNT)}))
        child.stdin.close()
        selector = selectors.DefaultSelector()
        selector.register(child.stdout, selectors.EVENT_READ)
        deadline, connection = time.monotonic() + 40, None
        try:
            while time.monotonic() < deadline:
                if selector.select(1):
                    line = child.stdout.readline()
                    if not line:
                        break
                    try:
                        value = json.loads(line)
                    except ValueError:
                        continue
                    if value.get("baseUrl"):
                        connection = value
                        break
                elif child.poll() is not None:
                    break
        finally:
            selector.close()
        if connection is None:
            raise RuntimeError("Original accounting startup failed; read " + str(log_path))
        case = WORK / args.case
        server = create_server(case, APP / GRANT / "sf10_current_candidate.json", args.port, case / "open-workspace.html")
        CommercialConnectionAdapter(server.workspace).configure({
            "id": "probe-accounting", "label": "Isolated native accounting review", "baseUrl": connection["baseUrl"],
            "requestId": "commercial-open-" + sha(canonical(connection))[:32], "actor": "Retained customer billing opener"})
        print(json.dumps({"stage": "OPEN", "case": args.case, "access_file": str(server.access_file),
                          "url": server.origin, "customerBillingApi": connection["baseUrl"],
                          "workspaceId": manifest["binding"]["workspaceId"]}), flush=True)
        serving = True
        server.serve_forever(poll_interval=0.2)
    finally:
        closing = True
        try:
            if server:
                try:
                    server.server_close()
                finally:
                    server.workspace.close()
        finally:
            try:
                stop_child(child)
            finally:
                log.close()
                for name, handler in previous_signals.items():
                    signal.signal(name, handler)

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    building = commands.add_parser("pack", help="Package the closed original operated workspace.")
    building.add_argument("--repo", required=True)
    building.add_argument("--work", default=str(WORK))
    building.add_argument("--out", required=True)
    building.add_argument("--node")
    building.add_argument("--allow-pending-browser", action="store_true")
    for command in ("inspect", "restore", "open"):
        action = commands.add_parser(command)
        action.add_argument("archive")
        action.add_argument("--sha256")
        if command == "open":
            action.add_argument("--node")
            action.add_argument("--case", choices=("source", "receiving"), default="source")
            action.add_argument("--port", type=int, default=0)
    args = parser.parse_args(argv)
    if args.command == "pack":
        pack(args)
        return
    archive, manifest = load_archive(args.archive, args.sha256)
    try:
        if args.command == "inspect":
            print(json.dumps({"schema": SCHEMA, "operation": OPERATION, "files": len(manifest["files"]),
                "sourceFiles": 241, "originalRoot": str(ORIGINAL), "binding": manifest["binding"],
                "nativeState": manifest["native"].get("state"), "browserState": manifest["browser"].get("state"),
                "manifestSha256": sha(canonical(manifest))}, indent=2))
        elif args.command == "restore":
            created = receive(archive, manifest)
            print(json.dumps({"stage": "RESTORED", "createdFiles": created, "root": str(ORIGINAL)}))
        else:
            if not 0 <= args.port <= 65535:
                parser.error("--port must be between0 and65535")
            open_handover(args, archive, manifest)
    finally:
        archive.close()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        raise SystemExit(130)
    except (RuntimeError, ValueError, OSError, subprocess.SubprocessError) as error:
        print(json.dumps({"state": "ERROR", "error": str(error)}), file=sys.stderr)
        raise SystemExit(1)
