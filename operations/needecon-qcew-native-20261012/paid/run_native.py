#!/usr/bin/env python3
"""Receive and run the original complete NEED county-report operation.
Python standard library only. The original source, production and browser
programme can be followed by the complete paid Merchant/Customer continuation
against the same retained native project and configured testnet installation.
"""
import argparse, datetime, fcntl, hashlib, json, os, pathlib, re, shutil
import signal, stat, subprocess, sys, tempfile, uuid, zipfile

OPERATION = "NEED-REGIONAL-REPORTS-9B2C-20261012"
SCHEMA = "stellar-forge.qcew-native-source-packet.v1"
PREFIX = "stellar/scf-starforge-20261009/sf30-seller-sdk"
SEED_SHA = "a9cdafc2b51bd8571149ef7abd3d628f88713a5195c7a5099111393e012f21b9"

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
def emit(value):
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")), flush=True)
def sha(raw):
    return hashlib.sha256(raw).hexdigest()
def git_blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()
def check(value, message):
    if not value:
        raise ValueError(message)
def private_directory(path):
    path = pathlib.Path(path).absolute()
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    check(stat.S_ISDIR(info.st_mode) and not path.is_symlink(), "Use an ordinary private operation directory: " + str(path))
    check(info.st_uid == os.getuid() and info.st_mode & 0o077 == 0, "Use an owned private operation directory: " + str(path))
    return path
def read_regular(path):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        check(stat.S_ISREG(os.fstat(stream.fileno()).st_mode), "Use a complete ordinary file: " + str(path))
        return stream.read()
def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
def atomic_json(path, value):
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    descriptor, temporary = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
def retain_exact(path, raw):
    if path.exists():
        check(read_regular(path) == raw, "Retained operation bytes differ: " + str(path))
        return
    descriptor, temporary = tempfile.mkstemp(prefix=".retain-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            check(read_regular(path) == raw, "Retained operation bytes differ: " + str(path))
        sync_directory(path.parent)
    finally:
        os.unlink(temporary)

def read_packet(path, expected):
    raw = read_regular(path)
    check(sha(raw) == expected, "Complete source packet SHA256 differs from the published handoff.")
    packet = json.loads(raw.decode("utf-8"))
    check(packet.get("schema") == SCHEMA and packet.get("operation") == OPERATION, "Use this original county-report source packet.")
    names, total = set(), 0
    for file in packet["files"]:
        name = file["path"]
        parts = pathlib.PurePosixPath(name).parts
        check(isinstance(name, str) and name and not name.startswith("/") and "\\" not in name and
              name == "/".join(parts) and all(part not in ("", ".", "..") for part in parts),
              "Source packet contains a noncanonical relative path.")
        check(name not in names, "Source packet repeats a source path.")
        names.add(name)
        body = file["content"].encode("utf-8")
        check(len(body) == file["bytes"] and sha(body) == file["sha256"] and git_blob(body) == file["gitSha1"],
              "Complete source bytes differ: " + name)
        total += len(body)
    check(len(names) == packet["source"]["files"] and total == packet["source"]["bytes"], "Complete source inventory differs.")
    return packet, raw

def materialize(root, packet):
    source = root / "source"
    if not source.exists():
        stage = root / ("source-stage-" + str(uuid.uuid4()))
        stage.mkdir(mode=0o700)
        for file in packet["files"]:
            path = stage / file["path"]
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with open(path, "xb") as stream:
                os.fchmod(stream.fileno(), 0o600)
                stream.write(file["content"].encode("utf-8"))
                stream.flush()
                os.fsync(stream.fileno())
        os.rename(stage, source)
        sync_directory(root)
    check(not source.is_symlink(), "The retained source directory changed.")
    names = set()
    for directory, dirs, files in os.walk(source, followlinks=False):
        check(all(not (pathlib.Path(directory) / item).is_symlink() for item in dirs), "Source directories must remain ordinary directories.")
        for name in files:
            names.add((pathlib.Path(directory) / name).relative_to(source).as_posix())
    check(names == {file["path"] for file in packet["files"]}, "The retained source file inventory changed.")
    for file in packet["files"]:
        raw = read_regular(source / file["path"])
        check(len(raw) == file["bytes"] and sha(raw) == file["sha256"] and git_blob(raw) == file["gitSha1"],
              "The retained source bytes changed: " + file["path"])
    return source

def run_stage(name, command, root, lock, state, environment):
    started = now()
    entry = {"name": name, "startedAt": started, "command": command, "status": "running"}
    state["stages"].append(entry)
    atomic_json(root / "run.json", state)
    emit({"event": "qcew_native_stage_start", **entry})
    log_path = root / "logs" / (str(len(state["stages"])).zfill(3) + "-" + name + ".log")
    with open(log_path, "xb") as log:
        os.fchmod(log.fileno(), 0o600)
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            env=environment, start_new_session=True, pass_fds=(lock.fileno(),))
        entry["pid"] = process.pid
        atomic_json(root / "run.json", state)
        try:
            while True:
                block = process.stdout.read1(65536)
                if not block:
                    break
                log.write(block)
                log.flush()
                sys.stdout.buffer.write(block)
                sys.stdout.buffer.flush()
            code = process.wait()
        except BaseException:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
            raise
        finally:
            process.stdout.close()
            log.flush()
            os.fsync(log.fileno())
    entry.update({"completedAt": now(), "exitCode": code, "status": "completed" if code == 0 else "interrupted",
                  "log": str(log_path)})
    atomic_json(root / "run.json", state)
    check(code == 0, "Original " + name + " programme exited " + str(code) + "; its full output and retained workspace are preserved.")

def under(path, parent):
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False

def preserve_archive(root, intake, archive_directory):
    destination = private_directory(archive_directory) / ("needecon-qcew-native-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8] + ".zip")
    check(not under(destination, root) and not under(destination, intake), "Save the complete archive outside the original working directories.")
    roots = [(root, "operation")]
    if not under(intake, root):
        roots.append((intake, "original-intake"))
    records = []
    with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        os.chmod(destination, 0o600)
        for source_root, prefix in roots:
            if not source_root.exists():
                continue
            for directory, dirs, files in os.walk(source_root, followlinks=False):
                dirs.sort()
                check(all(not (pathlib.Path(directory) / item).is_symlink() for item in dirs), "An output directory is a symlink.")
                for name in sorted(files):
                    source = pathlib.Path(directory) / name
                    relative = prefix + "/" + source.relative_to(source_root).as_posix()
                    with os.fdopen(os.open(source, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
                        info = os.fstat(stream.fileno())
                        check(stat.S_ISREG(info.st_mode), "An output is not an ordinary file: " + str(source))
                        checksum, length = hashlib.sha256(), 0
                        with archive.open(relative, "w", force_zip64=True) as output:
                            while True:
                                block = stream.read(1024 * 1024)
                                if not block:
                                    break
                                checksum.update(block)
                                length += len(block)
                                output.write(block)
                        check(length == info.st_size, "An output changed while preserving the complete original archive.")
                        records.append({"path": relative, "bytes": length, "sha256": checksum.hexdigest()})
        archive.writestr("archive-manifest.json", json.dumps({"schema": "stellar-forge.qcew-native-archive.v1",
            "operation": OPERATION, "createdAt": now(), "files": records}, ensure_ascii=False, indent=2) + "\n")
    descriptor = os.open(destination, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    sync_directory(destination.parent)
    length = destination.stat().st_size
    digest256 = hashlib.sha256()
    digest_git = hashlib.sha1(b"blob " + str(length).encode("ascii") + b"\0")
    with open(destination, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest256.update(block)
            digest_git.update(block)
    return {"path": str(destination), "bytes": length, "sha256": digest256.hexdigest(),
            "gitSha1": digest_git.hexdigest(), "files": len(records) + 1}

SDK_INSPECTOR = "import { readFile } from 'node:fs/promises';\nimport { dirname, join } from 'node:path';\nimport { createRequire } from 'node:module';\nimport { pathToFileURL } from 'node:url';\nimport { createHash } from 'node:crypto';\nimport { HTTPFacilitatorClient, x402ResourceServer, x402HTTPResourceServer } from '@x402/core/server';\nimport { ExactStellarScheme } from '@x402/stellar/exact/server';\nimport { bazaarResourceServerExtension, validateBazaarRouteExtensions } from '@x402/extensions/bazaar';\nconst { NATIVE_SDK_VERSION } = await import(pathToFileURL(process.argv[2]).href);\nif ([HTTPFacilitatorClient, x402ResourceServer, x402HTTPResourceServer, ExactStellarScheme,\n  validateBazaarRouteExtensions].some(value => typeof value !== 'function') ||\n  !bazaarResourceServerExtension) throw new Error('The installed original native seller SDK is incomplete.');\nconst require = createRequire(import.meta.url), packages = [];\nfor (const [name, specifier] of [['@x402/core','@x402/core/server'],\n  ['@x402/stellar','@x402/stellar/exact/server'], ['@x402/extensions','@x402/extensions/bazaar']]) {\n  let directory = dirname(require.resolve(specifier)), found = null;\n  for (;;) {\n    try {\n      const bytes = await readFile(join(directory, 'package.json'));\n      const value = JSON.parse(bytes);\n      if (value.name === name) {\n        if (value.version !== NATIVE_SDK_VERSION) throw new Error('Use the original ' + name + '@' + NATIVE_SDK_VERSION + '.');\n        found = { name, version: value.version, packageSha256: createHash('sha256').update(bytes).digest('hex') };\n        break;\n      }\n    } catch (error) { if (error.code !== 'ENOENT') throw error; }\n    const parent = dirname(directory);\n    if (parent === directory) break;\n    directory = parent;\n  }\n  if (!found) throw new Error('Read the installed original package metadata for ' + name + '.');\n  packages.push(found);\n}\nconsole.log(JSON.stringify({ event: 'qcew_native_sdk_ready', nativeSdk: NATIVE_SDK_VERSION, packages }));\n"

def select_merchant_dependencies(root, paid_root, selected):
    if selected:
        modules = pathlib.Path(selected).resolve(strict=True)
        check(modules.is_dir() and modules.name == "node_modules", "Select the existing installed seller node_modules directory.")
        parent = private_directory(root.parent)
        link = parent / "node_modules"
        if link.exists() or link.is_symlink():
            check(link.resolve(strict=True) == modules, "Use this operation parent's already selected seller dependencies.")
        else:
            os.symlink(str(modules), link, target_is_directory=True)
            sync_directory(parent)
        selection = {"schema": "stellar-forge.qcew-native-sdk-selection.v1",
                     "installedDirectory": str(modules), "resolutionPath": str(link)}
        retain_exact(paid_root / "seller-dependencies.json",
                     (json.dumps(selection, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    inspector = paid_root / "inspect-sdk.mjs"
    retain_exact(inspector, SDK_INSPECTOR.encode("utf-8"))
    return inspector

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packet", required=True)
    parser.add_argument("--packet-sha256", required=True)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--intake-directory")
    parser.add_argument("--node", default="node")
    parser.add_argument("--chromium")
    parser.add_argument("--playwright-module")
    parser.add_argument("--pdfinfo", default="pdfinfo")
    parser.add_argument("--profile")
    parser.add_argument("--original-project")
    parser.add_argument("--archive-directory")
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--merchant-packet")
    parser.add_argument("--merchant-packet-sha256")
    parser.add_argument("--buyer-config")
    parser.add_argument("--seller-node-modules", help="Existing installed native seller dependencies, outside the original source/archive.")
    parser.add_argument("--payment")
    parser.add_argument("--origin")
    parser.add_argument("--merchant-path", default="/county-reports")
    parser.add_argument("--facilitator")
    parser.add_argument("--allow-local-facilitator", action="store_true")
    parser.add_argument("--merchant-port", type=int)
    parser.add_argument("--accept-index", type=int, default=0)
    parser.add_argument("--paid-only", action="store_true",
        help="Append the paid phase to this operation's completed original native and browser results.")
    options = parser.parse_args()
    packet, packet_bytes = read_packet(options.packet, options.packet_sha256)
    merchant_packet, merchant_bytes = None, None
    check(bool(options.merchant_packet) == bool(options.merchant_packet_sha256),
          "Supply the complete paid source packet together with its published SHA256.")
    if options.merchant_packet:
        merchant_packet, merchant_bytes = read_packet(options.merchant_packet, options.merchant_packet_sha256)
        check(merchant_packet.get("originalPacketSha256") == options.packet_sha256,
              "Continue this original native source operation with its corresponding complete paid source.")
        check(merchant_packet.get("entrypoints", {}).get("merchant") == PREFIX + "/fred/qcew/merchant-journey.mjs" and
              any(file["path"] == merchant_packet["entrypoints"]["merchant"] for file in merchant_packet["files"]),
              "Use the complete installed paid Merchant/Customer programme.")
        if not options.prepare_only:
            check(all((options.buyer_config, options.payment, options.origin, options.facilitator)) and
                  options.merchant_port is not None and 0 < options.merchant_port <= 65535 and options.accept_index >= 0,
                  "Select the existing testnet Buyer, public payment file, HTTPS origin, facilitator and fixed merchant port.")
    else:
        check(not options.paid_only and not any((options.buyer_config, options.payment, options.origin,
              options.facilitator, options.merchant_port, options.allow_local_facilitator, options.seller_node_modules)),
              "Use the complete paid source packet for the selected Merchant/Customer continuation.")
    root = private_directory(options.directory)
    intake = pathlib.Path(options.intake_directory).absolute() if options.intake_directory else root / "intake"
    archive_directory = pathlib.Path(options.archive_directory).absolute() if options.archive_directory else root.parent / (root.name + "-archives")
    with os.fdopen(os.open(root / "operation.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600), "a+b") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        identity = {"operation": OPERATION, "packetSha256": options.packet_sha256,
            "sourceCommit": packet["source"]["baseCommit"], "sourceOverlays": packet["source"].get("overlays", []),
            "intakeDirectory": str(intake), "profile": str(pathlib.Path(options.profile).absolute()) if options.profile else None,
            "originalProject": str(pathlib.Path(options.original_project).absolute()) if options.original_project else None}
        header = root / "operation.json"
        check(not options.paid_only or header.exists(), "Append the paid phase to the retained original operation directory.")
        if header.exists():
            check(json.loads(read_regular(header).decode("utf-8")) == identity, "Continue this original operation with the same retained inputs and source.")
        else:
            atomic_json(header, identity)
        retain_exact(root / "source-packet.json", packet_bytes)
        controller_bytes = read_regular(pathlib.Path(__file__).absolute())
        controllers = private_directory(root / "controllers")
        controller_path = controllers / ("run-native-" + sha(controller_bytes) + ".py")
        retain_exact(controller_path, controller_bytes)
        if not (root / "run_native.py").exists():
            retain_exact(root / "run_native.py", controller_bytes)
        source = materialize(root, packet)
        merchant_source, sdk_inspector = None, None
        if merchant_packet is not None:
            paid_root = private_directory(root / "paid-sources" / options.merchant_packet_sha256)
            retain_exact(paid_root / "source-packet.json", merchant_bytes)
            merchant_source = materialize(paid_root, merchant_packet)
            sdk_inspector = select_merchant_dependencies(root, paid_root, options.seller_node_modules)
            emit({"event": "qcew_paid_source_ready", "operation": OPERATION, "directory": str(paid_root),
                "source": str(merchant_source), "files": merchant_packet["source"]["files"],
                "sourceBytes": merchant_packet["source"]["bytes"], "packetSha256": options.merchant_packet_sha256,
                "controller": str(controller_path)})
        (root / "logs").mkdir(mode=0o700, exist_ok=True)
        available = os.statvfs(root)
        emit({"event": "qcew_source_ready", "operation": OPERATION, "directory": str(root), "source": str(source),
            "files": packet["source"]["files"], "sourceBytes": packet["source"]["bytes"], "packetSha256": options.packet_sha256,
            "availableBytes": available.f_bavail * available.f_frsize})
        if options.prepare_only:
            return 0
        check(options.chromium and options.playwright_module, "Select the installed Chromium and Playwright module for the full PDF/browser operation.")
        node = shutil.which(options.node) or options.node
        versions = json.loads(subprocess.check_output([node, "-p", "JSON.stringify(process.versions)"], text=True))
        version = tuple(int(item) for item in versions["node"].split(".")[:2])
        check(version >= (22, 16), "Run the maintained product on Node 22.16 or newer.")
        check(pathlib.Path(options.chromium).is_file() and pathlib.Path(options.playwright_module).is_file(),
              "Use the existing complete browser executable and Playwright module.")
        if (root / "run.json").exists():
            state = json.loads(read_regular(root / "run.json").decode("utf-8"))
            check(state.get("schema") == "stellar-forge.qcew-native-controller.v1" and state.get("identity") == identity,
                  "The retained native controller belongs to another original operation.")
        else:
            state = {"schema": "stellar-forge.qcew-native-controller.v1", "identity": identity,
                     "startedAt": now(), "stages": []}
        state.update({"lastStartedAt": now(), "status": "running", "runtime": {"node": versions, "python": sys.version}})
        state.pop("completedAt", None)
        state.pop("error", None)
        atomic_json(root / "run.json", state)
        product = source / PREFIX
        environment = dict(os.environ)
        environment["QCEW_EXPECTED_SEED_SHA256"] = SEED_SHA
        failed = None
        try:
            completed_original = all(any(stage.get("name") == name and stage.get("status") == "completed"
                for stage in state["stages"]) for name in ("complete-production-receiving", "original-browser-receiving"))
            reuse_original = options.paid_only or merchant_source is not None and completed_original
            if not reuse_original:
                run_stage("original-source", [sys.executable, "-u", str(product / "fred/qcew/source_fetch.py"),
                    "--directory", str(intake), "--years", "1990:2026"], root, lock, state, environment)
                native = [node, str(product / "fred/qcew/native-journey.mjs"), "--directory", str(root / "native"),
                    "--intake-directory", str(intake), "--cpi", str(product / "fred/sources/cpiaucsl-20261012.public-table.json"),
                    "--chromium", str(pathlib.Path(options.chromium).absolute()), "--pdfinfo", options.pdfinfo]
                if options.profile:
                    native += ["--profile", str(pathlib.Path(options.profile).absolute())]
                if options.original_project:
                    native += ["--original-project", str(pathlib.Path(options.original_project).absolute())]
                run_stage("complete-production-receiving", native, root, lock, state, environment)
                run_stage("original-browser-receiving", [node, str(product / "fred/qcew/workspace-journey.mjs"),
                    "--directory", str(root / "native"), "--chromium", str(pathlib.Path(options.chromium).absolute()),
                    "--playwright-module", str(pathlib.Path(options.playwright_module).absolute())],
                    root, lock, state, environment)
            if reuse_original:
                native_result = json.loads(read_regular(root / "native" / "native-result.json").decode("utf-8"))
                browser_result = json.loads(read_regular(root / "native" / "browser-workspace" / "workspace-result.json").decode("utf-8"))
                check(native_result.get("schema") == "stellar-forge.qcew-native-result.v1" and
                      native_result.get("operation") == OPERATION and len(native_result.get("reports", [])) >= 2 and
                      browser_result.get("schema") == "stellar-forge.qcew-workspace-result.v1" and
                      browser_result.get("projectId") == native_result["project"]["projectId"],
                      "Use this operation's complete original native production and browser receiving results.")
                emit({"event": "qcew_original_production_reopened", "operation": OPERATION,
                      "projectId": native_result["project"]["projectId"],
                      "reports": [item["edition"]["id"] for item in native_result["reports"]],
                      "originalNativeResultSha256": sha(read_regular(root / "native" / "native-result.json")),
                      "originalBrowserResultSha256": sha(read_regular(root / "native" / "browser-workspace" / "workspace-result.json"))})
            if merchant_source is not None:
                run_stage("original-native-seller-sdk", [node, str(sdk_inspector),
                    str(merchant_source / PREFIX / "native-version.mjs")], root, lock, state, environment)
                paid = [node, str(merchant_source / merchant_packet["entrypoints"]["merchant"]),
                    "--directory", str(root / "native"), "--chromium", str(pathlib.Path(options.chromium).absolute()),
                    "--playwright-module", str(pathlib.Path(options.playwright_module).absolute()),
                    "--buyer-config", str(pathlib.Path(options.buyer_config).absolute()),
                    "--payment", str(pathlib.Path(options.payment).absolute()),
                    "--origin", options.origin, "--path", options.merchant_path, "--facilitator", options.facilitator,
                    "--merchant-port", str(options.merchant_port), "--accept-index", str(options.accept_index)]
                if options.allow_local_facilitator:
                    paid.append("--allow-local-facilitator")
                state["paidSource"] = {"packetSha256": options.merchant_packet_sha256,
                    "source": str(merchant_source), "controller": str(controller_path)}
                atomic_json(root / "run.json", state)
                run_stage("complete-paid-merchant-customer-receiving", paid, root, lock, state, environment)
            state.update({"status": "completed", "completedAt": now()})
        except BaseException as error:
            failed = error
            state.update({"status": "interrupted", "interruptedAt": now(),
                          "error": {"type": type(error).__name__, "message": str(error)}})
        atomic_json(root / "run.json", state)
        archive = preserve_archive(root, intake, archive_directory)
        result = {"event": "qcew_native_delivered", "operation": OPERATION, "status": state["status"],
                  "directory": str(root), "archive": archive, "stages": state["stages"]}
        if failed:
            result["error"] = state["error"]
        atomic_json(root / "archive-result.json", result)
        emit(result)
        if failed:
            raise failed
        return 0

if __name__ == "__main__":
    def interrupted(signum, _frame):
        raise InterruptedError("Original native operation interrupted by signal " + str(signum))
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        sys.exit(main())
    except BaseException as error:
        if isinstance(error, SystemExit):
            raise
        emit({"event": "qcew_native_controller_error", "operation": OPERATION,
              "type": type(error).__name__, "message": str(error)})
        raise
