#!/usr/bin/env python3
"""Finish the retained SCF review from its complete saved receiving case."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import uuid
import zipfile

def digest(body):
    return hashlib.sha256(body).hexdigest()

def write_json(path, value):
    temporary = path.with_name(path.name + ".new")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(path)

def relative_path(raw):
    if not isinstance(raw, str) or not raw or "\\" in raw or "\0" in raw:
        raise ValueError("Invalid case member")
    selected = PurePosixPath(raw)
    if selected.is_absolute() or ".." in selected.parts or str(selected) != raw:
        raise ValueError("Invalid case member: " + raw)
    return selected

def unpack_case(archive, destination):
    with zipfile.ZipFile(archive) as bundle:
        members = bundle.infolist()
        names = [row.filename for row in members]
        if len(set(names)) != len(names):
            raise ValueError("The complete case contains duplicate member paths")
        for item in members:
            relative = relative_path(item.filename.rstrip("/") if item.is_dir() else item.filename)
            mode = (item.external_attr >> 16) & 0o170000
            if mode not in (0, stat.S_IFREG, stat.S_IFDIR):
                raise ValueError("The complete case must contain ordinary source files")
            target = destination.joinpath(*relative.parts)
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True, mode=0o700)
                continue
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with target.open("xb") as out:
                with bundle.open(item) as inp:
                    shutil.copyfileobj(inp, out)
            target.chmod(0o600)
    return len(members)

def observations():
    answer = {}
    for name in ("memory.events", "memory.current", "memory.max", "memory.peak"):
        source = Path("/sys/fs/cgroup") / name
        try:
            answer[name] = source.read_text().strip()
        except OSError:
            pass
    return answer

def stop_owned(process):
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        return process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        return process.wait(timeout=10)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", type=Path, required=True)
    parser.add_argument("--expected-case-sha256", required=True)
    parser.add_argument("--parent", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--node-modules", type=Path, required=True)
    parser.add_argument("--chromium", type=Path, required=True)
    parser.add_argument("--timeout-seconds", type=int, default=900)
    parser.add_argument("--save-library", action="store_true")
    parser.add_argument("--replace-library-file-id")
    parser.add_argument("--expected-library-version", type=int)
    args = parser.parse_args()
    os.umask(0o077)
    if not 60 <= args.timeout_seconds <= 3600:
        raise ValueError("Choose a timeout from 60 to 3600 seconds")
    if bool(args.replace_library_file_id) != (args.expected_library_version is not None):
        raise ValueError("A replacement requires the exact original file ID and current version")
    if args.expected_library_version is not None and args.expected_library_version < 0:
        raise ValueError("Select an existing Library version")
    for selected in (args.case, args.parent, args.node, args.node_modules, args.chromium):
        if not selected.is_absolute() or not selected.exists():
            raise ValueError("Supply existing absolute input and runtime paths: " + str(selected))
    if not args.case.is_file() or not args.parent.is_dir() or not args.node_modules.is_dir():
        raise ValueError("Select the complete saved ZIP and actual host directories")
    body = args.case.read_bytes()
    selected_hash = digest(body)
    if selected_hash != args.expected_case_sha256:
        raise ValueError("The complete case differs from the selected saved version")

    root = Path(tempfile.mkdtemp(prefix="scf-review-continuation-", dir=args.parent))
    case, private, temporary = root / "case", root / "private", root / "tmp"
    for directory in (case, private, temporary):
        directory.mkdir(mode=0o700)
    members = unpack_case(args.case, case)
    runtime, previous = case / "runtime", case / "receiving"
    output = previous / "review-continuation"
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    config = json.loads((case / "config.json").read_text(encoding="utf-8"))
    if not config.get("files") or not config.get("reviewDecisions") or not config.get("reviewResolutions"):
        raise ValueError("The case does not include its selected source and substantive review")
    for selected in (previous / "downloads/Current_Complete_Submission.json",
                     previous / "saved-submission-record.json",
                     previous / "application/RESULT.json",
                     previous / "companion/companion-receiving.json"):
        if not selected.is_file():
            raise ValueError("Continue the original complete reader and saved draft: " + str(selected))

    attempt = output / "attempts" / (time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + "-" + uuid.uuid4().hex[:8])
    retained = ("native-process.log", "progress.json", "INCOMPLETE.json", "Failure.html", "RESULT.json")
    for name in retained:
        source = output / name
        if source.is_file():
            attempt.mkdir(parents=True, exist_ok=True, mode=0o700)
            shutil.copyfile(source, attempt / name)
    old_native = case / "review-continuation-native.json"
    if old_native.is_file():
        attempt.mkdir(parents=True, exist_ok=True, mode=0o700)
        shutil.copyfile(old_native, attempt / "native-result.json")
    # Keep the original full checkpoint at its established path. The browser
    # imports it and skips already-recorded matching decisions and resolutions.
    driver = runtime / "receive-review-continuation.cjs"
    driver.write_bytes(Path(__file__).with_name(driver.name).read_bytes())
    driver.chmod(0o600)
    runtime.joinpath("receive_review.py").write_bytes(Path(__file__).read_bytes())
    config.update(sourceRoot=str(case / "source"), outputDirectory=str(output),
                  previousOutputDirectory=str(previous), temporaryDirectory=str(temporary),
                  nodeModules=str(args.node_modules), chromium=str(args.chromium), port=0)
    config_path = case / "review-continuation-config.json"
    write_json(config_path, config)
    environment = dict(os.environ)
    environment.update(TMPDIR=str(temporary), TEMP=str(temporary), TMP=str(temporary),
                       PYTHONDONTWRITEBYTECODE="1")
    parse = subprocess.run([str(args.node), "--check", str(driver)],
                           capture_output=True, text=True, timeout=30, env=environment)
    if parse.returncode:
        raise ValueError("The native parser rejected the retained review programme: " + parse.stderr)
    browser_version = subprocess.run([str(args.chromium), "--version"], capture_output=True,
                                     text=True, timeout=30, env=environment)
    if browser_version.returncode:
        raise ValueError("The selected host browser did not start")
    print("SCF_REVIEW_RESUME_START " + json.dumps({
        "root": str(root), "retainedMembers": members, "sourceCommit": config["sourceCommit"],
        "browserVersion": browser_version.stdout.strip()}), flush=True)
    before, started, timed_out, maximum_rss = observations(), time.monotonic(), False, None
    log_path = output / "native-process.log"
    with log_path.open("wb") as log:
        process = subprocess.Popen([str(args.node), str(driver), str(config_path)],
                                   cwd=case, env=environment, stdin=subprocess.DEVNULL,
                                   stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        position = 0
        while process.poll() is None:
            with log_path.open("r", errors="replace") as inp:
                inp.seek(position)
                text = inp.read()
                position = inp.tell()
                if text:
                    print(text, end="", flush=True)
            try:
                for row in Path("/proc", str(process.pid), "status").read_text().splitlines():
                    if row.startswith("VmRSS:"):
                        maximum_rss = max(maximum_rss or 0, int(row.split()[1]))
            except (OSError, ValueError):
                pass
            if time.monotonic() - started > args.timeout_seconds:
                timed_out = True
                stop_owned(process)
                break
            time.sleep(0.4)
        with log_path.open("r", errors="replace") as inp:
            inp.seek(position)
            text = inp.read()
            if text:
                print(text, end="", flush=True)
    complete = output / "RESULT.json"
    result = json.loads(complete.read_text()) if complete.is_file() else None
    state = "COMPLETE" if process.returncode == 0 and result and result.get("state") == "COMPLETE" else "INCOMPLETE"
    native = {
        "schema": "stellar-forge.review-continuation-native.v1", "state": state,
        "processExit": process.returncode, "timedOut": timed_out,
        "durationSeconds": round(time.monotonic() - started, 3),
        "sourceCommit": config["sourceCommit"], "sourceFiles": len(config["files"]),
        "originalCase": {"bytes": len(body), "sha256": selected_hash},
        "nodeMaxObservedRssKiB": maximum_rss, "cgroupBefore": before, "cgroupAfter": observations(),
        "browser": str(args.chromium), "browserVersion": browser_version.stdout.strip(),
        "originalDraftId": result.get("originalDraftId") if result else None,
        "originalReviewId": result.get("originalReviewId") if result else None,
        "reviewActions": result.get("reviewActions") if result else None,
    }
    write_json(case / "review-continuation-native.json", native)
    archive = root / ("SCF-Current-Application-and-Review" + ("" if state == "COMPLETE" else "-Partial") + ".zip")
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        for file in sorted(case.rglob("*")):
            if file.is_symlink():
                raise ValueError("The retained case must contain ordinary files")
            if file.is_file():
                if file.is_relative_to(output / "captures") or file.name == "Failure.png":
                    continue
                bundle.write(file, file.relative_to(case).as_posix())
    meta = {"path": str(archive), "bytes": archive.stat().st_size,
            "sha256": digest(archive.read_bytes())}
    print("SCF_REVIEW_RESUME_RESULT " + json.dumps({**native, "archive": meta}), flush=True)
    if args.save_library or args.replace_library_file_id:
        spec = importlib.util.spec_from_file_location("original_receiver", runtime / "receive_current.py")
        receiver = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(receiver)
        replacement = ((args.replace_library_file_id, args.expected_library_version)
                       if args.replace_library_file_id else None)
        saved = receiver.save_outputs(runtime, [archive], private, replacement)
        if not saved["all_saved"]:
            return 2
    return 0 if state == "COMPLETE" else 1

if __name__ == "__main__":
    raise SystemExit(main())
