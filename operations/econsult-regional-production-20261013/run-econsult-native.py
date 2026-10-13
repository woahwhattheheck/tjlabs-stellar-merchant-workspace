#!/usr/bin/env python3
"""Receive and operate the complete Econsult regional reporting programme.
Uses the maintained original source collector, report production and browser receiving.
"""
import argparse, datetime, fcntl, hashlib, json, os, pathlib, re, shutil
import signal, stat, subprocess, sys, tempfile, uuid, zipfile

OPERATION = "ECONSULT-REGIONAL-PRODUCTION-9B2C-20261013"
SCHEMA = "commons.complete-source-transfer.v1"
PREFIX = "stellar/scf-starforge-20261009/sf30-seller-sdk"

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
    check(len(names) == packet["inventory"]["files"] and total == packet["inventory"]["bytes"], "Complete source inventory differs.")
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

def run_stage(name, command, root, lock, state, environment, result_path=None):
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
    if code == 0 and result_path is not None:
        raw_result = read_regular(result_path)
        entry["resultFile"] = {"path": str(result_path), "bytes": len(raw_result), "sha256": sha(raw_result)}
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
    destination = private_directory(archive_directory) / ("econsult-regional-production-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8] + ".zip")
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


def selected_input(path, destination):
    raw = read_regular(pathlib.Path(path).absolute())
    value = json.loads(raw.decode("utf-8"))
    retain_exact(destination, raw)
    return value, {"bytes": len(raw), "sha256": sha(raw)}

def completed_stage(state, name, result):
    completed = [item for item in state["stages"] if item["name"] == name and item["status"] == "completed"]
    if not completed:
        return False
    raw = read_regular(result)
    expected = completed[-1].get("resultFile")
    check(expected == {"path": str(result), "bytes": len(raw), "sha256": sha(raw)},
          "The complete retained " + name + " result changed.")
    return True

def complete_stage(name, command, result, root, lock, state, environment):
    if completed_stage(state, name, result):
        emit({"event": "econsult_stage_reused", "name": name, "result": str(result)})
        return
    run_stage(name, command, root, lock, state, environment, result_path=result)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packet", required=True)
    parser.add_argument("--packet-sha256", required=True)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--programme", required=True)
    parser.add_argument("--received-slices")
    parser.add_argument("--research-catalogue", action="store_true",
                        help="Compose the retained research catalogue into this complete original company project")
    parser.add_argument("--node", default="node")
    parser.add_argument("--chromium", required=True)
    parser.add_argument("--playwright-module", required=True)
    parser.add_argument("--pdfinfo", default="pdfinfo")
    parser.add_argument("--archive-directory")
    options = parser.parse_args()
    packet, packet_bytes = read_packet(options.packet, options.packet_sha256)
    root = private_directory(options.directory)
    intake = root / "intake"
    inputs = private_directory(root / "inputs")
    archive_directory = pathlib.Path(options.archive_directory).absolute() if options.archive_directory else root.parent / (root.name + "-archives")
    with os.fdopen(os.open(root / "operation.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600), "a+b") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        programme, programme_identity = selected_input(options.programme, inputs / "econsult-programme.json")
        profile, profile_identity = selected_input(options.profile, inputs / "econsult-profile.json")
        check(programme == {"schema": "stellar-forge.qcew-native-programme.v1", "operation": OPERATION,
              "initial": {"year": 2025, "quarter": 1}, "successor": {"year": 2026, "quarter": 1}},
              "Keep this original Econsult production selection.")
        definition = profile.get("definition", profile)
        region_areas = {area for region in definition["regions"] for area in region["areas"]}
        check(region_areas == {"42017", "42029", "42045", "42091", "42101", "42000", "US000"},
              "Keep the complete five-county, Pennsylvania and United States programme.")
        received_identity = None
        if options.received_slices:
            _, received_identity = selected_input(options.received_slices, inputs / "received-slices.json")
        identity = {"operation": OPERATION, "packetSha256": options.packet_sha256,
                    "programme": programme_identity, "profile": profile_identity,
                    "receivedSlices": received_identity, "intakeDirectory": str(intake)}
        research_relative = "receiving/esi-research-catalog-4593/input.json"
        if options.research_catalogue:
            research_inputs = [file for file in packet["files"] if file["path"] == research_relative]
            check(len(research_inputs) == 1, "The complete source packet must contain the original research catalogue input.")
            research_file = research_inputs[0]
            research_selection = json.loads(research_file["content"])
            check(research_selection.get("schema") == "stellar-forge.research-native-input.v1" and
                  research_selection.get("operation") == "ESI-RESEARCH-CATALOG-4593-20261013",
                  "Keep the original Econsult research catalogue course and complete selected sources.")
            identity["researchCatalogue"] = {"operation": research_selection["operation"],
                "input": {"path": research_relative, "bytes": research_file["bytes"], "sha256": research_file["sha256"]}}
        header = root / "operation.json"
        retain_exact(header, (json.dumps(identity, ensure_ascii=False, indent=2) + "\n").encode())
        retain_exact(root / "source-packet.json", packet_bytes)
        controller_bytes = read_regular(pathlib.Path(__file__).absolute())
        controllers = private_directory(root / "controllers")
        retain_exact(controllers / ("run-" + sha(controller_bytes) + ".py"), controller_bytes)
        source = materialize(root, packet)
        product = source / PREFIX
        (root / "logs").mkdir(mode=0o700, exist_ok=True)
        node = shutil.which(options.node) or options.node
        versions = json.loads(subprocess.check_output([node, "-p", "JSON.stringify(process.versions)"], text=True))
        check(tuple(int(item) for item in versions["node"].split(".")[:2]) >= (22, 16),
              "Use the installed Node 22.16 or newer runtime.")
        browser = pathlib.Path(options.chromium).resolve(strict=True)
        playwright = pathlib.Path(options.playwright_module).resolve(strict=True)
        check(browser.is_file() and os.access(browser, os.X_OK) and playwright.is_file(),
              "Select the existing browser executable and complete Playwright module.")
        # Reuse the installed browser. Keep its temporary profiles in this operation.
        launcher = controllers / "chromium-owned-tmp.py"
        launcher_bytes = ("#!" + sys.executable + "\nimport os,sys\nbrowser=" + repr(str(browser))
                          + "\nos.execv(browser,[browser,'--disable-dev-shm-usage',*sys.argv[1:]])\n").encode()
        retain_exact(launcher, launcher_bytes)
        os.chmod(launcher, 0o700)
        environment = dict(os.environ)
        environment["TMPDIR"] = str(private_directory(root.parent / (root.name + "-runtime-tmp")))
        state_path = root / "run.json"
        if state_path.exists():
            state = json.loads(read_regular(state_path).decode("utf-8"))
            check(state.get("schema") == "stellar-forge.qcew-native-controller.v1" and state.get("identity") == identity,
                  "Continue the original retained operation and full inputs.")
        else:
            state = {"schema": "stellar-forge.qcew-native-controller.v1", "identity": identity,
                     "startedAt": now(), "stages": []}
        state.update({"lastStartedAt": now(), "status": "running",
                      "runtime": {"node": versions, "python": sys.version, "chromium": str(browser),
                                  "playwright": str(playwright)}})
        state.pop("error", None)
        state.pop("completedAt", None)
        atomic_json(state_path, state)
        failed = None
        try:
            fetch = [sys.executable, "-u", str(product / "fred/qcew/source_fetch.py"),
                     "--directory", str(intake), "--periods", "2025-Q1,2026-Q1",
                     "--areas", "42017,42029,42045,42091,42101,42000,US000", "--operation", OPERATION,
                     "--programme", str(inputs / "econsult-programme.json")]
            if options.received_slices:
                fetch += ["--received-slices", str(inputs / "received-slices.json")]
            complete_stage("original-source", fetch, intake / "source-manifest.json", root, lock, state, environment)
            native = [node, str(product / "fred/qcew/native-journey.mjs"),
                      "--directory", str(root / "native"), "--intake-directory", str(intake),
                      "--cpi", str(product / "fred/sources/cpiaucsl-20261012.public-table.json"),
                      "--profile", str(inputs / "econsult-profile.json"), "--programme", str(inputs / "econsult-programme.json"),
                      "--chromium", str(launcher), "--pdfinfo", options.pdfinfo]
            complete_stage("complete-production-receiving", native, root / "native/native-result.json",
                           root, lock, state, environment)
            full_result = json.loads(read_regular(root / "native/native-result.json"))
            check(full_result["operation"] == OPERATION and len(full_result["reports"]) == 2
                  and {str(report["edition"]["period"]["year"]) + "-Q" + str(report["edition"]["period"]["quarter"])
                       for report in full_result["reports"]} == {"2025-Q1", "2026-Q1"},
                  "Reopen both complete selected Econsult report editions.")
            browser_command = [node, str(product / "fred/qcew/workspace-journey.mjs"),
                               "--directory", str(root / "native"), "--chromium", str(launcher),
                               "--playwright-module", str(playwright)]
            complete_stage("original-browser-receiving", browser_command,
                           root / "native/browser-workspace/workspace-result.json", root, lock, state, environment)
            browser_result = json.loads(read_regular(root / "native/browser-workspace/workspace-result.json"))
            check(browser_result["projectId"] == full_result["project"]["projectId"],
                  "Receive and reopen this complete original production project in the browser.")
            final_project = root / "native/complete-project.json"
            if options.research_catalogue:
                research_directory = root / "research"
                research_command = [node, str(product / "fred/research/native-journey.mjs"),
                    "--directory", str(research_directory),
                    "--input", str(source / research_relative),
                    "--cpi", str(product / "fred/sources/cpiaucsl-20261012.public-table.json"),
                    "--original-project", str(final_project),
                    "--chromium", str(launcher), "--playwright-module", str(playwright)]
                complete_stage("complete-research-catalogue-receiving", research_command,
                    research_directory / "journey.json", root, lock, state, environment)
                research_result = json.loads(read_regular(research_directory / "journey.json"))
                check(research_result.get("status") == "COMPLETE" and
                      research_result.get("identity", {}).get("operation") == identity["researchCatalogue"]["operation"],
                      "Complete the original research catalogue course.")
                browser_steps = [step for step in research_result["steps"]
                                 if step["name"] == "complete_http_operator_receiving" and step["status"] == "COMPLETE"]
                check(len(browser_steps) == 1 and browser_steps[0]["result"].get("rendered") ==
                      {"desktop": True, "phone": True, "download": True},
                      "Receive the research catalogue, complete CSV and original sources in the actual browser.")
                before = json.loads(read_regular(final_project))
                final_project = research_directory / "complete-economic-project.json"
                after = json.loads(read_regular(final_project))
                check(after["state"]["id"] == before["state"]["id"] and
                      after.get("qcew") == before.get("qcew") and
                      after["state"].get("qcew") == before["state"].get("qcew") and
                      after["captures"] == before["captures"],
                      "Retain the complete original quantitative source, reports and project identity in the research handover.")
                research = after["state"].get("research", {})
                check(len(research.get("sources", [])) == len(research_selection["sources"]) and
                      sum(len(product["editions"]) for product in research.get("products", [])) == 2,
                      "Retain every selected research source and both original issued research-product editions.")
            final_bytes = read_regular(final_project)
            state["completeCustomerProject"] = {"path": str(final_project),
                "bytes": len(final_bytes), "sha256": sha(final_bytes)}
            state.update({"status": "completed", "completedAt": now()})
        except BaseException as error:
            failed = error
            state.update({"status": "interrupted", "interruptedAt": now(),
                          "error": {"type": type(error).__name__, "message": str(error)}})
        atomic_json(state_path, state)
        archive = preserve_archive(root, intake, archive_directory)
        result = {"event": "econsult_native_delivered", "operation": OPERATION, "status": state["status"],
                  "directory": str(root), "archive": archive, "stages": state["stages"]}
        if state.get("completeCustomerProject"):
            result["completeCustomerProject"] = state["completeCustomerProject"]
        if failed:
            result["error"] = state["error"]
        atomic_json(root / "archive-result.json", result)
        emit(result)
        if failed:
            raise failed
        return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        emit({"event": "econsult_native_error", "type": type(error).__name__, "message": str(error)})
        raise SystemExit(1)
