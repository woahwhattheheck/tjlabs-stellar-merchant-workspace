#!/usr/bin/env python3
"""Receive the original SCF application, browser outputs and portable review."""
from __future__ import annotations

import argparse
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import signal
import subprocess
import sys
import uuid
import zipfile
from datetime import datetime, timezone

OPERATION = "DCE4-SCF-GRANT-APPLICATION-RECEIVING-20261012"
CAPSULE_BLOB = "2c9ae94bd53aa3aa0dbd6422ac35c8e3b14d43fb"
CAPSULE_BYTES = 1722772
SOURCE_COMMIT = "e6a15209e5d8877ac4261f77e66eb859e035b842"
CAPSULE_SCHEMA = "stellar-forge.exact-grant-reopening.v1"
CORRECTION_FILES = {
  "responsive-correction/source-revision.json": {
    "bytes": 2261,
    "sha256": "88511ef2f82fd6a8f3811167f0f59a9e47aa371610a9f2d68bd6e2aa66c13360"
  },
  "responsive-correction/source-changes.json": {
    "bytes": 2232,
    "sha256": "d6e6075a6f41da8f3bbb24b51f7818ce6dafb0325160e87f92724bb146f5f5fd"
  },
  "responsive-correction/original-attempt-report.json": {
    "bytes": 985,
    "sha256": "6380bbafba994c280604b90da830e7d89a5289c317cd0a0cdf19bac2be369d6e"
  },
  "responsive-correction/economic-layout-result.json": {
    "bytes": 2210,
    "sha256": "1d5c8385c6bdb92563649c4bdacc34293c64f2fbce641192a2eea5c39feadece"
  },
  "responsive-correction/economic-phone-corrected.png": {
    "bytes": 53530,
    "sha256": "7a7cd411536bdd3b1a5a9c7dc8b2231b0879ca67ab9b497bf13fa822687e1572"
  },
  "responsive-correction/fred-report.mjs": {
    "bytes": 15314,
    "sha256": "ce1c6934b10d0628e4bcac69ad53d3aa7118872361585c7c1bf5db07dcab6216"
  },
  "responsive-correction/fred-files.mjs": {
    "bytes": 13155,
    "sha256": "a3ced0b55bba5d62224b7e174fe26167f158c2dc2c815990334c38e872a37bcb"
  }
}
LAUNCHER = r"""
import { readFile, writeFile, rename, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const started = new Date().toISOString();
const errors = [];
let listener, browser, page, result, browserVersion;
let cleaning = Promise.resolve();
const write = async (path, value) => {
  const temporary = path + '.writing-' + process.pid;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, path);
};
const close = () => cleaning = cleaning.then(async () => {
  const ownedPage = page; page = null;
  if (ownedPage) await ownedPage.close().catch(error => errors.push({ phase: 'page-close', message: error.message }));
  const ownedBrowser = browser; browser = null;
  if (ownedBrowser) await ownedBrowser.close().catch(error => errors.push({ phase: 'browser-close', message: error.message }));
  const ownedListener = listener; listener = null;
  if (ownedListener) await ownedListener.stop().catch(error => errors.push({ phase: 'listener-close', message: error.message }));
});
let interrupted = false;
const interrupt = () => { interrupted = true; close(); };
const active = () => { if (interrupted) throw new Error('The original receiving was interrupted.'); };
process.once('SIGTERM', interrupt);
process.once('SIGINT', interrupt);
try {
  const { startGrantApplication } = await import(pathToFileURL(
    join(config.sourceRoot, 'stellar-forge/developer-site/grant.mjs')).href);
  const { inspectGrantApplication } = await import(pathToFileURL(
    join(config.sourceRoot, 'stellar-forge/developer-site/GRANT_RECEIVING.mjs')).href);
  const playwright = await import(pathToFileURL(config.playwrightModule).href);
  const chromium = playwright.chromium || playwright.default?.chromium;
  if (!chromium?.launch) throw new Error('Select the installed Playwright module that exports chromium.');
  await access(config.chromium);
  let previous;
  try { previous = JSON.parse(await readFile(config.listenerRecord, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  active();
  listener = await startGrantApplication({ port: previous?.port ?? 0 });
  active();
  const origin = new URL(listener.url).origin;
  if (previous && previous.origin !== origin)
    throw new Error('The original receiving listener origin changed.');
  await write(config.listenerRecord, {
    schema: 'stellar-forge.grant-visual-listener.v1', operation_id: config.operationId,
    source_commit: config.sourceCommit, source_root: config.sourceRoot,
    origin, port: listener.port
  });
  active();
  browser = await chromium.launch({
    executablePath: config.chromium, headless: true, args: ['--disable-dev-shm-usage']
  });
  active();
  browserVersion = await browser.version();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  active();
  await page.goto(listener.url, { waitUntil: 'load', timeout: 30000 });
  process.stdout.write(JSON.stringify({
    phase: 'original-grant-open', operation_id: config.operationId,
    source_commit: config.sourceCommit, node: process.version, chromium: browserVersion
  }) + '\n');
  result = await inspectGrantApplication(page, {
    sourceRoot: config.sourceRoot,
    outputDirectory: config.visualDirectory,
    expectedOrigin: origin,
    sourceCommit: config.sourceCommit,
    operationId: config.operationId,
    readPublishedFilm: config.readPublishedFilm,
    printPdf: config.printPdf
  });
} catch (error) {
  errors.push({ phase: 'original-receiving', name: error.name, code: error.code || null,
    message: error.message, stack: error.stack });
} finally {
  await close();
  process.off('SIGTERM', interrupt);
  process.off('SIGINT', interrupt);
}
const complete = result?.status === 'COMPLETE' && !errors.length && !interrupted;
const report = {
  schema: 'stellar-forge.grant-visual-native-attempt.v1',
  operation_id: config.operationId, status: complete ? 'COMPLETE' : 'INCOMPLETE',
  started_at: started, ended_at: new Date().toISOString(),
  source_commit: config.sourceCommit, source_revision: config.sourceRevision || null, node: process.version,
  chromium: browserVersion || null, result: result || null, errors, interrupted
};
await write(config.nodeReport, report);
process.stdout.write(JSON.stringify({
  status: report.status, operation_id: config.operationId,
  report: config.nodeReport, artifacts: result?.artifacts?.length || 0,
  errors: errors.map(({ phase, message }) => ({ phase, message }))
}) + '\n');
process.exitCode = complete ? 0 : 1;
"""


def now():
    return datetime.now(timezone.utc).isoformat()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def plain(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("Select an ordinary file: " + str(path))
    return path.read_bytes()


def write_new_or_equal(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists() or path.is_symlink():
        if plain(path) != data:
            raise ValueError("Preserve the different original file: " + str(path))
        return
    with path.open("xb") as output:
        os.chmod(path, 0o600)
        output.write(data)
        output.flush()
        os.fsync(output.fileno())


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + ".writing-" + uuid.uuid4().hex)
    with temporary.open("xb") as output:
        os.chmod(temporary, 0o600)
        output.write((json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode())
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def checked_relative(name):
    path = PurePosixPath(name)
    if not isinstance(name, str) or not name or "\\" in name or path.is_absolute() or any(
        part in ("", ".", "..") for part in name.split("/")
    ):
        raise ValueError("Invalid original source member: " + repr(name))
    return path


def materialize(capsule_bytes, root):
    if len(capsule_bytes) != CAPSULE_BYTES or git_blob(capsule_bytes) != CAPSULE_BLOB:
        raise ValueError("The complete original grant capsule bytes or Git identity differ.")
    capsule = json.loads(capsule_bytes)
    if capsule.get("schema") != CAPSULE_SCHEMA or capsule.get("source_commit") != SOURCE_COMMIT:
        raise ValueError("Select the original complete grant reopening capsule.")
    files = capsule.get("files")
    if not isinstance(files, list) or len(files) != 75:
        raise ValueError("The complete original capsule must contain all 75 members.")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    root = root.resolve()
    names, selected, total = set(), [], 0
    for item in files:
        relative = checked_relative(item["path"])
        if str(relative) in names:
            raise ValueError("Duplicate source member: " + str(relative))
        names.add(str(relative))
        if item["encoding"] == "base64":
            content = base64.b64decode("".join(item["content"].split()), validate=True)
        elif item["encoding"] == "utf-8":
            content = item["content"].encode("utf-8")
        else:
            raise ValueError("Unsupported original member encoding: " + str(relative))
        if len(content) != item["bytes"] or git_blob(content) != item["git_blob"]:
            raise ValueError("Original source member differs: " + str(relative))
        destination = root.joinpath(*relative.parts)
        if not destination.resolve().is_relative_to(root):
            raise ValueError("The source member resolves outside its original root.")
        write_new_or_equal(destination, content)
        if plain(destination) != content:
            raise ValueError("Source readback differs: " + str(relative))
        selected.append({"path": str(relative), "bytes": len(content),
                         "git_blob": item["git_blob"], "sha256": sha(content)})
        total += len(content)
    return {"schema": "stellar-forge.grant-visual-source.v1", "source_commit": SOURCE_COMMIT,
            "capsule_git_blob": CAPSULE_BLOB, "capsule_bytes": len(capsule_bytes),
            "capsule_sha256": sha(capsule_bytes), "source_revision": capsule.get("source_revision"), "files": selected, "source_bytes": total}


def selected_executable(value):
    path = Path(value).expanduser()
    if not path.is_absolute():
        found = shutil.which(value)
        if not found:
            raise ValueError("The selected installed executable is unavailable: " + value)
        path = Path(found)
    path = path.resolve(strict=True)
    if not path.is_file() or not os.access(path, os.X_OK):
        raise ValueError("The selected installed executable cannot run: " + str(path))
    return str(path)


def inventory(root, prefixes):
    members = []
    for prefix in prefixes:
        path = root / prefix
        if path.is_file():
            paths = [path]
        elif path.is_dir():
            paths = sorted(path.rglob("*"))
        else:
            continue
        for file in paths:
            if file.is_symlink():
                raise ValueError("Keep symbolic links outside the receiving package: " + str(file))
            if not file.is_file():
                continue
            data = plain(file)
            members.append({"path": file.relative_to(root).as_posix(), "bytes": len(data),
                            "sha256": sha(data)})
    return members


def make_package(root, attempt_id, status):
    members = inventory(root, [
        "source", "receiving", "attempts", "source-capsule.json",
        "source-manifest.json", "selection.json", "listener.json", "launch-receiving.mjs",
        "run-native.py", "NATIVE_RECEIVING.md", "responsive-correction",
    ])
    manifest = {"schema": "stellar-forge.grant-visual-portable.v1", "operation_id": OPERATION,
                "status": status, "source_commit": SOURCE_COMMIT,
                "source_revision": json.loads(plain(root / "source-manifest.json")).get("source_revision"),
                "attempt_id": attempt_id, "created_at": now(), "files": members}
    directory = root / "deliveries"
    directory.mkdir(mode=0o700, exist_ok=True)
    output = directory / ("SCF_Grant_Visual_Receiving_" + attempt_id + ".zip")
    temporary = output.with_suffix(".zip.preparing")
    with zipfile.ZipFile(temporary, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        archive.writestr("PACKAGE_MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        for item in members:
            data = plain(root / item["path"])
            if len(data) != item["bytes"] or sha(data) != item["sha256"]:
                raise ValueError("A receiving member changed during packaging: " + item["path"])
            archive.writestr(item["path"], data)
    os.replace(temporary, output)
    data = plain(output)
    with zipfile.ZipFile(output) as archive:
        for item in members:
            returned = archive.read(item["path"])
            if len(returned) != item["bytes"] or sha(returned) != item["sha256"]:
                raise ValueError("Packaged member differs: " + item["path"])
    return {"path": str(output), "bytes": len(data), "sha256": sha(data), "members": len(members) + 1}


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--capsule", required=True, help="Exact existing capsule file; '-' reads its exact bytes from stdin.")
    result.add_argument("--directory", required=True, help="Private persistent directory for this original operation.")
    result.add_argument("--node", required=True, help="Existing installed Node executable.")
    result.add_argument("--playwright-module", required=True, help="Existing Playwright index.mjs or index.js path.")
    result.add_argument("--chromium", required=True, help="Existing Chromium executable.")
    result.add_argument("--read-published-film", action="store_true", help="Also read the original published film metadata.")
    result.add_argument("--no-pdf", action="store_true", help="Retain the browser views without generating the A4 PDF.")
    result.add_argument("--inspect", action="store_true", help="Read the original operation state without opening a browser.")
    return result


def main():
    args = parser().parse_args()
    root = Path(args.directory).expanduser().absolute()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if root.resolve() != root:
        raise ValueError("Select an ordinary absolute receiving directory.")
    lock_path = root / ".native-receiving.lock"
    if lock_path.is_symlink():
        raise ValueError("Use the original ordinary receiving lock.")
    with lock_path.open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("This original grant receiving already has an active native owner.")
        prior_path = root / "last-result.json"
        if args.inspect:
            value = json.loads(plain(prior_path)) if prior_path.exists() else {
                "operation_id": OPERATION, "status": "PREPARED",
                "materialized": (root / "source-manifest.json").is_file(),
                "receiving_directory": str(root / "receiving")
            }
            print(json.dumps(value, ensure_ascii=False), flush=True)
            return 0
        if args.capsule == "-":
            print(json.dumps({"phase": "receive-original-capsule", "bytes": CAPSULE_BYTES,
                              "git_blob": CAPSULE_BLOB}), flush=True)
            capsule_bytes = sys.stdin.buffer.read(CAPSULE_BYTES)
        else:
            capsule_bytes = plain(Path(args.capsule).expanduser().resolve(strict=True))
        source = materialize(capsule_bytes, root / "source")
        write_new_or_equal(root / "source-capsule.json", capsule_bytes)
        write_new_or_equal(root / "source-manifest.json",
                           (json.dumps(source, ensure_ascii=False, indent=2) + "\n").encode())
        selection = {
            "schema": "stellar-forge.grant-visual-launch-selection.v1", "operation_id": OPERATION,
            "source_commit": SOURCE_COMMIT, "capsule_git_blob": CAPSULE_BLOB,
            "source_root": str(root / "source"), "source_revision": source.get("source_revision"), "node": selected_executable(args.node),
            "playwright_module": str(Path(args.playwright_module).expanduser().resolve(strict=True)),
            "chromium": selected_executable(args.chromium),
            "read_published_film": args.read_published_film, "print_pdf": not args.no_pdf,
        }
        if not Path(selection["playwright_module"]).is_file():
            raise ValueError("Select the original installed Playwright module file.")
        write_new_or_equal(root / "selection.json",
                           (json.dumps(selection, ensure_ascii=False, indent=2) + "\n").encode())
        if prior_path.exists():
            prior = json.loads(plain(prior_path))
            if prior.get("status") == "COMPLETE":
                package = prior["package"]
                archive = plain(Path(package["path"]))
                if len(archive) != package["bytes"] or sha(archive) != package["sha256"]:
                    raise ValueError("Restore the original complete receiving archive before reuse.")
                print(json.dumps({**prior, "reused": True}, ensure_ascii=False), flush=True)
                return 0
        write_new_or_equal(root / "run-native.py", plain(Path(__file__).resolve()))
        companion = Path(__file__).resolve().with_name("README.md")
        if companion.is_file():
            write_new_or_equal(root / "NATIVE_RECEIVING.md", plain(companion))
        source_directory = Path(__file__).resolve().parent
        for name, identity in CORRECTION_FILES.items():
            relative = checked_relative(name)
            content = plain(source_directory.joinpath(*relative.parts))
            if len(content) != identity["bytes"] or sha(content) != identity["sha256"]:
                raise ValueError("Restore the complete responsive companion: " + name)
            write_new_or_equal(root.joinpath(*relative.parts), content)
        write_new_or_equal(root / "launch-receiving.mjs", LAUNCHER.encode())
        attempt_id = uuid.uuid4().hex
        attempt = root / "attempts" / attempt_id
        attempt.mkdir(parents=True, mode=0o700)
        config = {
            "operationId": OPERATION, "sourceRoot": str(root / "source"),
            "sourceCommit": SOURCE_COMMIT, "sourceRevision": source.get("source_revision"), "playwrightModule": selection["playwright_module"],
            "chromium": selection["chromium"], "listenerRecord": str(root / "listener.json"),
            "visualDirectory": str(root / "receiving"),
            "readPublishedFilm": selection["read_published_film"], "printPdf": selection["print_pdf"],
            "nodeReport": str(attempt / "native-report.json"),
        }
        config_path = attempt / "arguments.json"
        write_json(config_path, config)
        print(json.dumps({"phase": "start-original-receiving", "operation_id": OPERATION,
                          "attempt_id": attempt_id, "source_files": len(source["files"]),
                          "source_bytes": source["source_bytes"]}), flush=True)
        env = os.environ.copy()
        native_tmp = root / "runtime-temporary"
        native_tmp.mkdir(mode=0o700, exist_ok=True)
        env["TMPDIR"] = str(native_tmp)
        log_path = attempt / "native.log"
        child = None
        native_launch_error = None
        prior_handlers = {}
        try:
            with log_path.open("wb") as log:
                child = subprocess.Popen(
                    [selection["node"], str(root / "launch-receiving.mjs"), str(config_path)],
                    stdout=log, stderr=subprocess.STDOUT, env=env, cwd=root,
                )
                def forward(signum, _frame):
                    if child.poll() is None:
                        child.send_signal(signum)
                for signum in (signal.SIGINT, signal.SIGTERM):
                    prior_handlers[signum] = signal.signal(signum, forward)
                exit_code = child.wait()
        except OSError as error:
            exit_code = None
            native_launch_error = {"error": type(error).__name__, "message": str(error)}
        finally:
            for signum, handler in prior_handlers.items():
                signal.signal(signum, handler)
        native_report_path = attempt / "native-report.json"
        native = json.loads(plain(native_report_path)) if native_report_path.is_file() else None
        complete = exit_code == 0 and native is not None and native.get("status") == "COMPLETE"
        report = {
            "schema": "stellar-forge.grant-visual-native.v1", "operation_id": OPERATION,
            "status": "COMPLETE" if complete else "INCOMPLETE", "attempt_id": attempt_id,
            "source_commit": SOURCE_COMMIT, "capsule_git_blob": CAPSULE_BLOB,
            "source_files": len(source["files"]), "source_bytes": source["source_bytes"],
            "native_exit_code": exit_code, "native_launch_error": native_launch_error,
            "native_report": str(native_report_path) if native else None,
            "native_log": str(log_path), "ended_at": now(),
        }
        write_json(attempt / "attempt-report.json", report)
        report["package"] = make_package(root, attempt_id, report["status"])
        write_json(prior_path, report)
        print(json.dumps(report, ensure_ascii=False), flush=True)
        return 0 if complete else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"operation_id": OPERATION, "status": "ERROR",
                          "error": type(error).__name__, "message": str(error)}),
              file=sys.stderr, flush=True)
        raise SystemExit(1)
