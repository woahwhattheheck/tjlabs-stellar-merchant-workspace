#!/usr/bin/env python3
"""Receive the complete original material catalogue Customer Installation.

Reuse the complete selected source, the original Operations and Installation
writers, actual browser, all source bytes and an independent cold recipient.
"""
from __future__ import annotations
import argparse
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import threading
import uuid
import zipfile

HERE = Path(__file__).resolve().parent
REPOSITORY = HERE.parents[3]
DISTRIBUTION = Path("stellar/scf-starforge-20261009/distribution")
WORKSPACE = Path("stellar/scf_2026/sf47_budget_model/workspace")
SCHEMA = "stellar-forge.material-catalogue-source-desk-receiving.v1"
MAX_FILE = 512 * 1024 * 1024


def need(value, message):
    if not value:
        raise ValueError(message)


def raw(path, limit=MAX_FILE):
    path = Path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_size <= limit, "Select a bounded complete regular file.")
        chunks, size = [], 0
        while True:
            block = os.read(fd, min(262144, limit + 1 - size))
            if not block:
                break
            chunks.append(block)
            size += len(block)
            need(size <= limit, "The complete original file exceeds its selected bound.")
        after = os.fstat(fd)
        need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
             (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns), "The original file changed while receiving.")
        return b"".join(chunks)
    finally:
        os.close(fd)


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n").encode()


def sha(body):
    return hashlib.sha256(body).hexdigest()


def identity(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode), "Select an original regular artifact.")
        digest, size = hashlib.sha256(), 0
        while True:
            block = os.read(fd, 1024 * 1024)
            if not block:
                break
            size += len(block)
            digest.update(block)
        after = os.fstat(fd)
        need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
             (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns), "Artifact changed during receiving.")
        return {"path": str(Path(path).resolve()), "bytes": size, "sha256": digest.hexdigest()}
    finally:
        os.close(fd)


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write(path, value, immutable=False):
    path = Path(path)
    data = value if isinstance(value, bytes) else encoded(value)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    need(not path.is_symlink(), "Use the original owned regular output.")
    if path.exists() and immutable:
        need(raw(path) == data, "The original immutable receiving file differs: " + path.name)
        return identity(path)
    temp = path.with_name("." + path.name + "." + uuid.uuid4().hex)
    try:
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if immutable:
            try:
                os.link(temp, path)
            except FileExistsError:
                need(raw(path) == data, "The retained original file changed during publication.")
        else:
            os.replace(temp, path)
        sync_directory(path.parent)
    finally:
        temp.unlink(missing_ok=True)
    return identity(path)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--node", required=True, type=Path)
    parser.add_argument("--playwright", required=True, type=Path)
    parser.add_argument("--chromium", required=True, type=Path)
    parser.add_argument("--repository", type=Path, default=REPOSITORY)
    parser.add_argument("--ref", required=True, help="Exact full selected public source commit")
    parser.add_argument("--source-archive", type=Path)
    parser.add_argument("--source-sha256")
    parser.add_argument("--scenario", type=Path)
    args = parser.parse_args(argv)
    need(re.fullmatch(r"[a-f0-9]{40}", args.ref), "Select the exact complete source commit.")
    need(bool(args.source_archive) == bool(args.source_sha256), "Select both complete source archive and SHA256.")
    root = args.directory.expanduser().absolute()
    need(not root.is_symlink(), "Use the original private receiving directory.")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    need(not root.stat().st_mode & 0o077, "Keep the complete private case private.")
    lock = os.open(root / "receiving.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    sys.dont_write_bytecode = True
    os.environ["GRANT_MATERIAL_NODE"] = str(args.node.resolve())
    input_raw = raw(args.input, 8 * 1024 * 1024)
    source = json.loads(input_raw)
    need(source.get("schema") == "stellar-forge.material-catalogue-source-desk-input.v1", "Select the full original private material catalogue desk input.")
    need(isinstance(source.get("operationId"), str) and source["operationId"].strip(),
         "Select the actual retained material catalogue receiving operation.")
    need(isinstance(source.get("actor"), str) and source["actor"].strip(), "Name the actual receiving operator.")
    need(isinstance(source.get("selection"), dict) and isinstance(source.get("bindings"), dict),
         "Select the complete original catalogue and explicit receiving bindings.")
    raw_intake = source.get("supplierIntake") is not None
    need((not source.get("sourceId") and not source.get("sourceFile")) if raw_intake else
         bool(source.get("sourceId")) != bool(source.get("sourceFile")),
         "Select either the complete original supplier receiving input or one complete existing bundle.")
    report_path = root / "Material_Catalogue_Source_Desk_Receiving.json"
    report = json.loads(raw(report_path)) if report_path.exists() else {
        "schema": SCHEMA, "inputSha256": sha(input_raw), "sourceCommit": args.ref,
        "operationId": source["operationId"], "state": "PREPARED", "phases": {}, "artifacts": {}, "commands": []}
    need(report["inputSha256"] == sha(input_raw) and report["sourceCommit"] == args.ref,
         "Resume the same complete input and selected source release.")
    server = thread = child = workspace = supplier_runtime = None
    old_handlers, failure = {}, None
    report["state"] = "RUNNING"

    def save():
        write(report_path, report)

    def keep(name, data, immutable=True):
        result = write(root / name, data, immutable)
        report["artifacts"][name] = result
        save()
        return result

    def command(label, argv):
        nonlocal child
        ident = label + "-" + uuid.uuid4().hex
        out, err = root / "commands" / (ident + ".stdout"), root / "commands" / (ident + ".stderr")
        out.parent.mkdir(mode=0o700, exist_ok=True)
        item = {"name": label, "argv": list(map(str, argv)), "stdout": str(out), "stderr": str(err)}
        report["commands"].append(item)
        save()
        with out.open("xb") as stdout, err.open("xb") as stderr:
            child = subprocess.Popen(item["argv"], stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
                                     start_new_session=True, env=os.environ.copy())
            item["pid"] = child.pid
            save()
            item["exitCode"] = child.wait()
        child = None
        save()
        need(item["exitCode"] == 0, "Receive the original " + label + " stdout/stderr and continue its same operation.")
        return raw(out)

    def stop(signum, frame):
        raise InterruptedError("The original receiving lifetime was interrupted.")

    try:
        for sig in (signal.SIGINT, signal.SIGTERM):
            old_handlers[sig] = signal.signal(sig, stop)
        keep("Original_Desk_Input.json", input_raw)
        for record in report["artifacts"].values():
            need(identity(record["path"]) == record, "A retained complete artifact changed.")

        # The maintained producer creates one full original source release. A
        # recipient can instead supply that exact already-built archive.
        build = root / "selected-source-build"
        unpacker = args.repository.resolve() / DISTRIBUTION / "runtime-unpack.py"
        if args.source_archive:
            archive_body = raw(args.source_archive, 64 * 1024 * 1024)
            need(sha(archive_body) == args.source_sha256, "The complete selected source TGZ differs.")
            keep("Material_Catalogue_Installation_Source.tgz", archive_body)
            archive_path, archive_sha = root / "Material_Catalogue_Installation_Source.tgz", args.source_sha256
            package = root / "selected-source-package"
        else:
            cmd = [args.node.resolve(), args.repository.resolve() / DISTRIBUTION / "build.mjs",
                   "--repo", args.repository.resolve(), "--ref", args.ref,
                   "--selection", "material-catalogue-installation", "--out", build, "--offline", "--python", sys.executable]
            if build.exists():
                cmd.append("--resume")
            command("complete-selected-source-build", cmd)
            distribution = json.loads(raw(build / "distribution.json"))
            need(distribution["status"] == "PACKAGED" and distribution["sourceCommit"] == args.ref
                 and distribution["sourceSelection"]["id"] == "material-catalogue-installation",
                 "Receive the complete original Material catalogue Installation selection.")
            archive_path = Path(distribution["archive"])
            need(archive_path.parent == build and identity(archive_path)["sha256"] == distribution["sha256"]
                 and archive_path.stat().st_size == distribution["archiveBytes"], "The selected source archive differs.")
            archive_sha, package = distribution["sha256"], build / "package"
            keep("Source_Distribution_Receipt.json", raw(build / "distribution.json"))
            keep("Source_Build_Intent.json", raw(build / "build.json"))
            keep("Material_Catalogue_Installation_Source.tgz", raw(archive_path, 64 * 1024 * 1024))
            pack = build / "pack-work"
            if pack.exists():
                for path in sorted(pack.rglob("*")):
                    if path.is_file() and not path.is_symlink() and path.suffix in (".json", ".log"):
                        keep("source-pack-records/" + path.relative_to(pack).as_posix(), raw(path))
        verify_args = [sys.executable, unpacker, "--archive", archive_path, "--sha256", archive_sha, "--out", package]
        if package.exists():
            verify_args.append("--verify")
        verification = json.loads(command("verify-complete-selected-source", verify_args))
        need(verification["sourceCommit"] == args.ref, "The original source commit changed.")
        app = package / "source"
        manifest_raw = raw(package / "manifest.json")
        manifest = json.loads(manifest_raw)
        need(manifest["sourceSelection"]["id"] == "material-catalogue-installation" and manifest["sourceCommit"] == args.ref,
             "Select the original complete Material catalogue Installation recipe.")
        keep("Complete_Source_Manifest.json", manifest_raw)
        # Verification mode/status can differ on replay; preserve its stable
        # complete identity and every actual invocation log separately.
        binding = {key: verification[key] for key in ("packageName", "packageVersion", "sourceCommit", "sourceFiles", "manifestSha256")}
        keep("Source_Verification.json", binding)
        keep("runtime-unpack.py", raw(unpacker))
        listed = {row["path"]: row for row in manifest["files"]}
        for rel, body in ((str(DISTRIBUTION / "runtime-unpack.py"), raw(unpacker)),
                          (str(WORKSPACE / Path(__file__).name), raw(__file__))):
            need(rel in listed and listed[rel]["sha256"] == sha(body) and listed[rel]["bytes"] == len(body),
                 "Run the original receiver and unpacker selected by this complete source release.")
        installed = app / WORKSPACE
        need(raw(installed / Path(__file__).name) == raw(__file__), "The selected complete receiver edition differs.")
        sys.path.insert(0, str(installed))
        from model import Workspace
        from operations import Operations
        from operations_material_catalogue import perform, _engine
        from server import create_server
        from material_supplier_intake_receiving import OriginalSupplierRuntime
        scenario = args.scenario.resolve() if args.scenario else installed.parent / "sf10_current_candidate.json"
        keep("Original_Scenario.json", raw(scenario))
        report["phases"]["complete-software"] = {"archive": identity(root / "Material_Catalogue_Installation_Source.tgz"),
                                                "selection": manifest["sourceSelection"], **binding}
        save()

        workspace = Workspace(args.workspace, scenario)
        ops = Operations(workspace)
        case = ops.read(source["caseId"])
        need(case["program"]["planId"] == source["planId"], "The selected original case belongs to another plan.")
        if not report["phases"].get("browser"):
            # A resumed browser may already have committed original commands.
            # Its exact request history is reconciled before any new mutation.
            browser_report = root / "Material_Catalogue_Source_Desk_Browser.json"
            if not browser_report.exists():
                need(case["program"]["version"] == source["expectedVersion"], "Read the actual current case before first receiving.")
        if raw_intake:
            supplier_runtime = OriginalSupplierRuntime(
                source=source, root=root, app=app, node=args.node.resolve(),
                raw=raw, write=write, identity=identity, need=need)
            supplier_input = supplier_runtime.start()
            for name, record in supplier_runtime.files.items():
                report["artifacts"][name] = record
            save()
            full_source = None
        else:
            if source.get("sourceFile"):
                full_source = raw(source["sourceFile"], 128 * 1024 * 1024)
                need(sha(full_source) == source["sourceSha256"], "The selected full material catalogue file differs.")
            else:
                source_meta, full_source = ops.source(source["caseId"], source["sourceId"])
                need(source_meta["sha256"] == source["sourceSha256"], "The selected original material catalogue attachment differs.")
            keep("Original_Material_Catalogue.jsonl", full_source)
            inspection = _engine({"action": "inspect", "sourceBase64": base64.b64encode(full_source).decode("ascii")})
            need(inspection["file"]["sha256"] == source["sourceSha256"] and
                 inspection["file"]["bytes"] == len(full_source),
                 "The actual original material reader received different source bytes.")
            selection = source["selection"]
            need(selection.get("operationId") == source["operationId"] and
                 selection.get("bundleSha256") == source["sourceSha256"] and
                 selection.get("catalogId") == inspection["summary"]["catalogId"] and
                 selection.get("catalogRevision") == inspection["summary"]["revision"] and
                 selection.get("activeEditionId") == inspection["summary"]["activeEditionId"],
                 "The retained material selection must bind this exact catalogue edition.")
            editions = {row["id"] for row in inspection["editions"]}
            need(source.get("beforeEditionId") in editions and source.get("afterEditionId") in editions and
                 source["beforeEditionId"] != source["afterEditionId"],
                 "Choose two distinct original saved catalogue editions for the receiving comparison.")
            keep("Original_Native_Inspection.json", inspection)
        keep("Original_Commercial_Document.json", encoded(source["document"]))
        workspace.close()
        workspace = None

        access_path, listener_path = root / "private-browser-access.json", root / "Original_Listener.json"
        listener = json.loads(raw(listener_path)) if listener_path.exists() else None
        server = create_server(args.workspace, scenario, port=listener["port"] if listener else 0)
        if listener:
            need(server.origin == listener["origin"], "Preserve the original browser storage origin.")
        else:
            write(listener_path, {"port": server.server_port, "origin": server.origin}, True)
        write(access_path, {"origin": server.origin, "token": server.token})
        thread = threading.Thread(target=server.serve_forever, daemon=False)
        thread.start()
        browser_input = {**source, "directory": str(root), "inputSha256": sha(input_raw),
                         "playwright": str(args.playwright.resolve()), "chromium": str(args.chromium.resolve()),
                         "documentPath": str(root / "Original_Commercial_Document.json"),
                         "handoverPath": str(root / "Original_Material_Catalogue.jsonl")}
        if raw_intake:
            browser_input["supplierIntake"] = supplier_input
        from material_installation_following_receiving import capture_original, verify_native, receive_customer, verify_cold
        if source.get("followingInstallation"):
            browser_input["followingInstallation"] = capture_original(source["followingInstallation"], root, raw, keep)
        keep("Browser_Input.json", browser_input)
        command("original-complete-browser-course",
                [args.node.resolve(), installed / "material-catalogue-source-desk-browser.mjs", root / "Browser_Input.json", access_path])
        browser = json.loads(raw(root / "Material_Catalogue_Source_Desk_Browser.json"))
        need(browser["state"] == "COMPLETE" and browser["inputSha256"] == sha(input_raw),
             "Receive the complete actual browser course before completing this case.")
        report["phases"]["browser"] = {"phases": browser["phases"], "installation": browser["installation"]}
        save()
        server.shutdown()
        thread.join()
        thread = None
        server.server_close()
        server.workspace.close()
        server = None

        workspace = Workspace(args.workspace, scenario)
        ops = Operations(workspace)
        if raw_intake:
            def template(source_id, source_sha):
                return perform(ops, source["caseId"], "template", {
                    "expectedVersion": ops.read(source["caseId"])["program"]["version"],
                    "sourceId": source_id, "expectedSourceSha256": source_sha,
                    "document": source["document"], "operationId": source["operationId"]})
            source, full_source = supplier_runtime.finish(browser, _engine, template)
            for name, record in supplier_runtime.files.items():
                report["artifacts"][name] = record
            report["phases"]["original-supplier-intake"] = browser["supplierIntake"]
            supplier_runtime.close()
            save()
        actual_source_id = browser["sourceId"]
        source_meta, retained = ops.source(source["caseId"], actual_source_id)
        need(retained == full_source and source_meta["sha256"] == source["sourceSha256"],
             "The original source changed during native intake.")
        selected = browser["installation"]
        saved = ops.installation(source["caseId"], selected["id"], selected["revision"])
        need(saved["sha256"] == selected["sha256"], "The actual saved Installation changed.")
        need(actual_source_id in saved["preview"]["document"]["source"]["sourceIds"],
             "The complete original material source must survive the original Installation save.")
        keep("Original_Saved_Installation.json", saved)
        customer = root / "Material_Catalog_Complete_Handover.zip"
        need(identity(customer) == browser["materialHandover"],
             "The downloaded complete customer handover differs from its actual browser receipt.")
        # Validate every original ZIP member before any independent installation.
        independent = root / "independent-material-handover"
        with zipfile.ZipFile(customer) as archive:
            members = archive.infolist()
            names, total = set(), 0
            need(0 < len(members) <= 1000, "Keep the complete bounded customer handover.")
            for member in members:
                name, mode = member.filename, member.external_attr >> 16
                need(name and not name.startswith("/") and chr(92) not in name and
                     all(part not in ("", ".", "..") for part in name.split("/")) and
                     name not in names and not member.is_dir() and
                     stat.S_IFMT(mode) in (0, stat.S_IFREG),
                     "Receive only unique complete regular customer members.")
                names.add(name)
                total += member.file_size
                need(total <= 512 * 1024 * 1024, "Keep the complete 512 MiB handover bound.")
            need(archive.testzip() is None, "The complete original customer member check failed.")
            independent.mkdir(mode=0o700, exist_ok=True)
            for member in members:
                write(independent / member.filename, archive.read(member), True)
        reopened_material = json.loads(command("independent-complete-material-reopen", [
            args.node.resolve(), independent / "application/products/material-catalog/commissioning/cli.mjs",
            "reopen", "--directory", independent]))
        keep("Independent_Material_Reopen.json", reopened_material)
        need(raw(independent / "source/customer-catalog.jsonl", 128 * 1024 * 1024) == full_source,
             "The complete customer's retained original source changed.")
        report["phases"]["complete-material-handover"] = {
            "archive": identity(customer), "members": len(members),
            "originalBytes": len(full_source), "independentReopen": "COMPLETE"}
        keep("Original_Selected_Catalogue.json", source["selection"])
        following_result = verify_native(ops, source["caseId"], browser, source, root, raw, keep)
        if following_result:
            report["phases"]["following-customer"] = receive_customer(
                following_result, root, args.node.resolve(), raw, identity, write, command, keep)
        case_export_path = root / "Complete_Operations_Case.zip"
        case_export = raw(case_export_path) if case_export_path.exists() else ops.export(source["caseId"])
        keep(case_export_path.name, case_export)
        workspace.close()
        workspace = None
        receiver = root / "independent-recipient"
        workspace = Workspace(receiver, scenario)
        received = Operations(workspace)
        request_id = str(uuid.uuid5(uuid.NAMESPACE_URL, source["operationId"] + "/" + sha(input_raw) + "/installation-case-receiving"))
        receipt = received.import_bundle(case_export, "Material catalogue Installation independent receiving", request_id, source["actor"])
        keep("Independent_Case_Receiving.json", receipt)
        receiving_id = receipt["id"]
        row = received.installation(receiving_id, selected["id"], selected["revision"])
        need(row["sha256"] == saved["sha256"], "Independent receiving changed the complete Installation.")
        for ident in (actual_source_id,):
            metadata, data = received.source(receiving_id, ident)
            need(metadata["sha256"] == sha(data), "Independent receiving changed an original attachment.")
            need(data == full_source,
                 "Independent receiving changed a complete original source attachment.")
        verify_cold(received, receiving_id, following_result, source, root, raw)
        # Replaying the original imported case must preserve its current version.
        before = received.read(receiving_id)["program"]["version"]
        replay = received.import_bundle(case_export, "Material catalogue Installation independent receiving", request_id, source["actor"])
        need(replay == receipt and received.read(receiving_id)["program"]["version"] == before,
             "Original case import replay changed later receiving state.")
        workspace.close()
        workspace = Workspace(receiver, scenario)
        cold = Operations(workspace).installation(receiving_id, selected["id"], selected["revision"])
        need(cold["sha256"] == saved["sha256"], "Cold reopen changed the original Installation.")
        verify_cold(Operations(workspace), receiving_id, following_result, source, root, raw)
        keep("Independent_Cold_Installation.json", cold)
        report["phases"]["independent-receiving"] = {"caseId": receiving_id, "installation": selected,
                                                   "sourceIds": [actual_source_id]}
        report["state"] = "COMPLETE"
        report["visualReview"] = "PENDING_PRODUCING_SEAT_OPEN_AND_LOOK"
        report.pop("error", None)
    except BaseException as exc:
        failure = exc
        report["state"] = "INTERRUPTED"
        report["error"] = {"type": type(exc).__name__, "message": str(exc), "code": getattr(exc, "code", None)}
    finally:
        if child is not None:
            try:
                os.killpg(child.pid, signal.SIGTERM)
                child.wait(timeout=15)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                child.wait()
        if thread is not None and thread.is_alive():
            server.shutdown()
            thread.join()
        if server is not None:
            server.server_close()
            server.workspace.close()
        if workspace is not None:
            workspace.close()
        if supplier_runtime is not None:
            try:
                supplier_runtime.close()
            except BaseException as exc:
                report.setdefault("cleanupErrors", []).append(
                    {"type": type(exc).__name__, "message": str(exc)})
                if failure is None:
                    failure = exc
                    report["state"] = "INTERRUPTED"
                    report["error"] = {"type": type(exc).__name__, "message": str(exc),
                                       "code": getattr(exc, "code", None)}
                else:
                    failure.add_note("Original supplier cleanup also failed: " + repr(exc))
        for sig, handler in old_handlers.items():
            signal.signal(sig, handler)
        (root / "private-browser-access.json").unlink(missing_ok=True)
        report["lifetimes"] = ("SUPPLIER_CLOSE_INCOMPLETE"
                               if supplier_runtime is not None and supplier_runtime.process is not None
                               else "CLOSED")
        save()
        output = root / "Material_Catalogue_Installation_Complete.zip"
        temp = root / (".complete-" + uuid.uuid4().hex + ".zip")
        # Complete selected software TGZ is included, not just changed UI leaves.
        # Browser credentials/profile, case DB/WAL and mutable build/runtime trees
        # stay private; their complete portable source/case exports are included.
        with zipfile.ZipFile(temp, "w", zipfile.ZIP_STORED) as z:
            for path in sorted(root.iterdir()):
                if path.is_file() and not path.is_symlink() and not path.name.startswith(".") and path.name not in (
                        output.name, "receiving.lock", "Original_Listener.json"):
                    z.write(path, "receiving/" + path.name)
            for name in ("artifacts", "commands", "source-pack-records"):
                folder = root / name
                if folder.exists():
                    for path in sorted(folder.rglob("*")):
                        if path.is_file() and not path.is_symlink():
                            z.write(path, name + "/" + path.relative_to(folder).as_posix())
        os.replace(temp, output)
        sync_directory(root)
        print(json.dumps({"state": report["state"], "report": identity(report_path),
                          "completeArchive": identity(output), "phases": list(report["phases"]),
                          "visualReview": report.get("visualReview", "NOT_REACHED")}), flush=True)
        os.close(lock)
    if failure:
        raise failure
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
