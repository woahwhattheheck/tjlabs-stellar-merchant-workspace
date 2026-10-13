#!/usr/bin/env python3
"""Continue the accepted full review customer package through both source installers.

The original customer builder and original receiving programme perform the work.
This command retains their source selection, phase outputs and provider journal.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

OPERATION = "SCF-REVIEW-RETURNS-COMPOSITION-B41A-20261012"
CONTINUATION = "SCF-CUSTOMER-CONTINUATION-90ED-20261013"
BASE = "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/"
PYTHON = BASE + "python/"
ACCEPTED = {"bytes": 4513584,
            "sha256": "68d20e9923d9a05b15c48f1b109a0b72c9777b4b97a987e411b76b2393ee0aa1"}
PINNED = {
    "apply_review_continuation.py": "4d201f3afccf3f915079373083dcf2993bee2846df4d4349a4820451f18a2050",
    "native-patches/customer-journal-continuation.json": "94eb78d75b3f2e1a56c5c90b02cce639fe14f6cd3ee9937682862ed4f1106424",
    "apply_review_entrypoints.py": "dd6313588833aea0cb72011b3c8857333c5b0b83d79209589fadbe49181b7e48",
    "native-patches/customer-review-entrypoints.json": "9e05aa4e7c78d3c473ef91c92589ebf066c6870fd279290c1917057acfafb323",
}
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024


def now():
    return datetime.now(timezone.utc).isoformat()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def relative(name):
    if not isinstance(name, str):
        raise ValueError("A selected path must be text")
    path = PurePosixPath(name)
    if not name or str(path) != name or path.is_absolute() or ".." in path.parts or "\\" in name:
        raise ValueError("Invalid selected relative path: " + name)
    return path


def identity(path):
    path = Path(path)
    if not path.is_absolute() or path.resolve(strict=True) != path:
        raise ValueError("A canonical absolute file is required: " + str(path))
    value, count = hashlib.sha256(), 0
    with path.open("rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode):
            raise ValueError("A regular file is required: " + str(path))
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
            count += len(chunk)
        after = os.fstat(stream.fileno())
    fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
    if count != before.st_size or any(getattr(before, k) != getattr(after, k) for k in fields):
        raise ValueError("The selected file changed during its read: " + str(path))
    return {"bytes": count, "sha256": value.hexdigest()}


def checked_row(row):
    if (not isinstance(row, dict) or type(row.get("bytes")) is not int or row["bytes"] < 0
            or not isinstance(row.get("sha256"), str) or len(row["sha256"]) != 64
            or any(c not in "0123456789abcdef" for c in row["sha256"])):
        raise ValueError("Every selected file requires its byte length and SHA-256")
    return {"bytes": row["bytes"], "sha256": row["sha256"]}


def read_json(path):
    identity(path)
    return json.loads(Path(path).read_text(encoding="utf-8"))


def sync(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def directory(path):
    path = Path(path)
    if not path.is_absolute():
        raise ValueError("An absolute working directory is required")
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.resolve(strict=True) != path or not path.is_dir():
        raise ValueError("A canonical working directory is required: " + str(path))
    return path


def publish_bytes(path, raw, *, replace=False):
    path = Path(path)
    directory(path.parent)
    if path.exists() or path.is_symlink():
        identity(path)
        if path.read_bytes() == raw:
            return
        if not replace:
            raise ValueError("A different retained output already exists: " + str(path))
    fd, name = tempfile.mkstemp(prefix=".customer-continuation-", dir=path.parent)
    temp = Path(name)
    try:
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        if replace:
            os.replace(temp, path)
        else:
            try:
                os.link(temp, path)
            except FileExistsError:
                identity(path)
                if path.read_bytes() != raw:
                    raise ValueError("The retained output was concurrently replaced: " + str(path))
        sync(path.parent)
    finally:
        temp.unlink(missing_ok=True)


def publish_json(path, value, *, replace=False):
    publish_bytes(path, encoded(value), replace=replace)


def copy_exact(source, target):
    before = identity(source)
    if target.exists() or target.is_symlink():
        if identity(target) != before:
            raise ValueError("A different retained file occupies: " + str(target))
        return before
    directory(target.parent)
    fd, name = tempfile.mkstemp(prefix=".customer-copy-", dir=target.parent)
    stage = Path(name)
    try:
        with os.fdopen(fd, "wb") as out, source.open("rb") as inp:
            shutil.copyfileobj(inp, out, 1024 * 1024)
            out.flush()
            os.fsync(out.fileno())
        if identity(source) != before or identity(stage) != before:
            raise ValueError("The selected file changed while copying: " + str(source))
        try:
            os.link(stage, target)
        except FileExistsError:
            if identity(target) != before:
                raise ValueError("A different file was concurrently retained: " + str(target))
        sync(target.parent)
    finally:
        stage.unlink(missing_ok=True)
    return before


def module(path, label, expected=None):
    observed = identity(path)
    if expected is not None and observed["sha256"] != expected:
        raise ValueError("The selected module differs from its pinned source: " + str(path))
    spec = importlib.util.spec_from_file_location(label, path)
    if spec is None or spec.loader is None:
        raise ValueError("The selected Python module cannot be loaded")
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    if Path(result.__file__).resolve() != path or identity(path) != observed:
        raise ValueError("The selected module changed while loading")
    return result


@contextmanager
def working_lock(work):
    path = work / "continuation.lock"
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError("A regular continuation lock is required")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("The original continuation or its child still owns this workspace") from error
        yield fd
    finally:
        os.close(fd)


def package_index(archive, *, expected=None):
    before = identity(archive)
    if expected is not None and before != expected:
        raise ValueError("The selected customer archive differs from the accepted complete package")
    with zipfile.ZipFile(archive) as zipped:
        entries = zipped.infolist()
        if len(entries) > 8192 or sum(x.file_size for x in entries) > MAX_ARCHIVE_BYTES:
            raise ValueError("The customer archive exceeds the complete-package receiving limit")
        names = {}
        for info in entries:
            if info.is_dir():
                continue
            relative(info.filename)
            mode = info.external_attr >> 16
            if stat.S_IFMT(mode) not in (0, stat.S_IFREG) or info.flag_bits & 1:
                raise ValueError("Customer members must be ordinary unencrypted files")
            if info.filename in names:
                raise ValueError("The customer archive repeats a member")
            names[info.filename] = info
        raw = zipped.read("customer-review/PACKAGE.json")
        manifest = json.loads(raw)
        if manifest.get("schema") != "stellar-forge.python-review-customer.v1":
            raise ValueError("The original customer package schema is required")
        rows = {}
        for row in manifest["files"]:
            name = str(relative(row["path"]))
            if name in rows or name == "PACKAGE.json":
                raise ValueError("The customer manifest repeats a member")
            rows[name] = checked_row(row)
        expected_names = {"customer-review/" + name for name in rows} | {"customer-review/PACKAGE.json"}
        if set(names) != expected_names:
            raise ValueError("The archive and its complete customer manifest select different files")
        for name, expected_row in rows.items():
            info = names["customer-review/" + name]
            value, count = hashlib.sha256(), 0
            with zipped.open(info) as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    value.update(chunk)
                    count += len(chunk)
            if {"bytes": count, "sha256": value.hexdigest()} != expected_row:
                raise ValueError("A customer archive member differs: " + name)
        if identity(archive) != before:
            raise ValueError("The complete customer archive changed during receiving")
        return manifest, rows, raw


def extract_package(archive, destination, manifest, rows, raw, *, source_only=False):
    directory(destination)
    chosen = {name: row for name, row in rows.items() if not source_only or name.startswith("source/")}
    with zipfile.ZipFile(archive) as zipped:
        for name, expected in chosen.items():
            target = destination / relative(name)
            if target.exists() or target.is_symlink():
                if identity(target) != expected:
                    raise ValueError("A retained installed member differs: " + name)
                continue
            directory(target.parent)
            with zipped.open("customer-review/" + name) as source:
                raw_member = source.read()
            if len(raw_member) != expected["bytes"] or hashlib.sha256(raw_member).hexdigest() != expected["sha256"]:
                raise ValueError("The customer member changed while extracting: " + name)
            publish_bytes(target, raw_member)
    if not source_only:
        publish_bytes(destination / "PACKAGE.json", raw)


def source_selection(rows, archive_identity):
    files = [{"path": name[len("source/"):], **row}
             for name, row in rows.items() if name.startswith("source/")]
    selected = {row["path"] for row in files}
    needed = {PYTHON + "build_review_customer.py", PYTHON + "review-bridge.mjs",
              PYTHON + "stellar_forge_buyer/review_library.py",
              BASE + "resource-library/library.mjs", BASE + "resource-library/review-returns.mjs"}
    if not needed.issubset(selected) or not files:
        raise ValueError("The complete Python and resource runtime must be selected together")
    return {"schema": "commons.scf-review-source-selection.v1",
            "operation_id": OPERATION, "customer_archive": archive_identity,
            "package_manifest_files": len(rows), "files": sorted(files, key=lambda x: x["path"])}


def verify_selection(checkout, selection):
    seen = set()
    for row in selection["files"]:
        name = str(relative(row["path"]))
        if name in seen or identity(checkout / name) != checked_row(row):
            raise ValueError("The selected customer source differs: " + name)
        seen.add(name)
    return seen


def original_build_inputs(baseline, manifest, rows):
    reviews = []
    for name in manifest.get("reviewFiles", []):
        relative(name)
        if name not in rows or not name.startswith("reviews/") or Path(name).suffix.lower() not in {".json", ".html", ".csv"}:
            raise ValueError("The original portable review selection is invalid")
        reviews.append(baseline / name)
    wheels = [baseline / name for name in rows if name.startswith("wheels/")]
    if len(wheels) > 1 or any(path.suffix != ".whl" for path in wheels):
        raise ValueError("The original customer builder supports one explicitly selected wheel")
    guide = baseline / "REVIEWS.md"
    example_data = guide.exists() and "authored local example data" in guide.read_text(encoding="utf-8")
    return reviews, wheels[0] if wheels else None, example_data


def build_customer(builder, checkout, selection_path, out, reviews, wheel, example_data):
    selected = read_json(selection_path)
    verify_selection(checkout, selected)
    if not out.exists() and not out.is_symlink():
        builder.build(checkout, out, selection_path, reviews, wheel, example_data)
    manifest, rows, _ = package_index(out)
    desired = {"source/" + row["path"]: checked_row(row) for row in selected["files"]}
    actual_sources = {name: row for name, row in rows.items() if name.startswith("source/")}
    if actual_sources != desired:
        raise ValueError("The retained customer ZIP contains a different complete source selection")
    desired_reviews = {"reviews/" + path.name: identity(path) for path in reviews}
    if (set(manifest.get("reviewFiles", [])) != set(desired_reviews)
            or any(rows.get(name) != row for name, row in desired_reviews.items())):
        raise ValueError("The retained customer ZIP contains different portable reviews")
    generated = {"README.md": builder.GUIDE, "review.py": builder.LAUNCH, "verify.py": builder.VERIFY}
    for name, text in generated.items():
        raw = text.encode("utf-8")
        if rows.get(name) != {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}:
            raise ValueError("The retained customer guide or launcher differs from its selected builder")
    expected_wheels = {} if wheel is None else {"wheels/" + wheel.name: identity(wheel)}
    if {n: r for n, r in rows.items() if n.startswith("wheels/")} != expected_wheels:
        raise ValueError("The retained customer ZIP changed the original wheel")
    return {"path": str(out), **identity(out), "files": len(rows) + 1,
            "sourceFiles": len(desired), "reviewFiles": manifest["reviewFiles"],
            "browserPages": manifest["browserPages"]}


def prepare(args, work):
    delivery = args.delivery_python.resolve(strict=True)
    pins = {}
    for name, expected in PINNED.items():
        path = delivery / name
        pins[name] = identity(path)
        if pins[name]["sha256"] != expected:
            raise ValueError("Use the merged complete installer source: " + name)
    manifest, rows, package_raw = package_index(args.customer_zip, expected=ACCEPTED)
    original = source_selection(rows, ACCEPTED)
    baseline = work / "accepted-customer"
    checkout = work / "composed-source"
    selections = directory(work / "selections")
    baseline_selection = selections / "00-accepted.json"
    ui_selection = selections / "10-journal-ui.json"
    final_selection = selections / "20-customer-entrypoints.json"
    phase = work / "source-prepared.json"
    if not baseline_selection.exists():
        extract_package(args.customer_zip, baseline, manifest, rows, package_raw)
        directory(checkout)
        for row in original["files"]:
            copy_exact(baseline / "source" / row["path"], checkout / row["path"])
        publish_json(baseline_selection, original)
    elif read_json(baseline_selection) != original:
        raise ValueError("The retained baseline selection belongs to another complete customer archive")
    # Baseline is immutable; the separate composed checkout carries both overlays.
    for name, row in rows.items():
        if identity(baseline / name) != row:
            raise ValueError("The retained accepted customer member changed: " + name)
    if not final_selection.exists():
        # Once the UI manifest is present its downstream entrypoint edits must not
        # be fed back into the upstream UI installer.
        if not ui_selection.exists():
            installer = module(delivery / "apply_review_continuation.py", "_scf_journal_continuation",
                               PINNED["apply_review_continuation.py"])
            returned = installer.apply(checkout, baseline_selection, ui_selection,
                                       delivery / "native-patches/customer-journal-continuation.json")
            publish_json(work / "ui-installer-result.json", returned)
        installer = module(delivery / "apply_review_entrypoints.py", "_scf_customer_entrypoints",
                           PINNED["apply_review_entrypoints.py"])
        returned = installer.apply(checkout, ui_selection, final_selection,
                                   delivery / "native-patches/customer-review-entrypoints.json")
        publish_json(work / "entrypoint-installer-result.json", returned)
    selection = read_json(final_selection)
    if (selection.get("overlay_sha256") != PINNED["native-patches/customer-journal-continuation.json"]
            or selection.get("input_manifest_sha256") != identity(baseline_selection)["sha256"]
            or selection.get("customerEntrypoints", {}).get("packetSha256")
                != PINNED["native-patches/customer-review-entrypoints.json"]):
        raise ValueError("The continued selection is not bound to both ordered source installers")
    verify_selection(checkout, selection)
    reviews, wheel, example_data = original_build_inputs(baseline, manifest, rows)
    builder_path = checkout / PYTHON / "build_review_customer.py"
    packet = read_json(delivery / "native-patches/customer-review-entrypoints.json")
    builder_row = next(row for row in packet["files"] if row["path"] == PYTHON + "build_review_customer.py")
    builder = module(builder_path, "_scf_selected_customer_builder", builder_row["sha256"])
    package_path = work / "Review_Customer_Installed_Input.zip"
    built = build_customer(builder, checkout, final_selection, package_path, reviews, wheel, example_data)
    installed = work / "installed" / "customer-review"
    installed_manifest, installed_rows, installed_raw = package_index(package_path)
    extract_package(package_path, installed, installed_manifest, installed_rows, installed_raw)
    expected_verify = installed_rows["verify.py"]["sha256"]
    verifier = module(installed / "verify.py", "_scf_installed_customer_verify", expected_verify)
    verified = verifier.verify(installed)
    record = {"schema": "commons.scf-customer-source-prepared.v1", "operation_id": OPERATION,
              "continuation_id": CONTINUATION, "accepted_archive": ACCEPTED,
              "baseline_manifest": identity(baseline_selection), "source_manifest": identity(final_selection),
              "selected_source_files": len(selection["files"]), "package": built,
              "installed_customer": str(installed), "verification": verified,
              "installers": pins, "original_review_files": manifest.get("reviewFiles", []),
              "original_wheel": str(wheel) if wheel else None, "example_data": example_data}
    publish_json(phase, record)
    return {"record": record, "builder": builder, "checkout": checkout,
            "selection": final_selection, "installed": installed, "reviews": reviews,
            "wheel": wheel, "example_data": example_data, "delivery": delivery}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--customer-zip", required=True, type=Path)
    parser.add_argument("--work-dir", required=True, type=Path)
    parser.add_argument("--delivery-python", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--programme", required=True, type=Path,
                        help="Captured original B41A receiving argv, source files and result paths")
    parser.add_argument("--node", required=True, type=Path)
    parser.add_argument("--chromium", required=True, type=Path)
    parser.add_argument("--playwright-root", required=True, type=Path)
    parser.add_argument("--library-host", required=True, type=Path)
    parser.add_argument("--library-helpers", required=True, type=Path)
    args = parser.parse_args(argv)
    if sys.version_info < (3, 11) or os.name != "posix":
        parser.error("The accepted customer runtime requires Python 3.11+ on POSIX")
    try:
        for name in ("customer_zip", "programme", "node", "chromium"):
            value = getattr(args, name)
            if not value.is_absolute():
                raise ValueError("Use an absolute " + name.replace("_", " ") + " path")
            identity(value)
        work = directory(args.work_dir)
        receiver_path = Path(__file__).resolve().with_name("review_continuation_receiving.py")
        receiving = module(receiver_path, "_scf_customer_continuation_receiving")
        with working_lock(work) as lock_fd:
            intent = receiving.bind(args, work, receiver_path)
            context = prepare(args, work)
            result = receiving.continue_original(args, work, intent, context, lock_fd)
            print(json.dumps(result, ensure_ascii=False, indent=2))
    except (OSError, ValueError, KeyError, TypeError, RuntimeError, subprocess.SubprocessError) as error:
        parser.exit(2, str(error) + "\n")


if __name__ == "__main__":
    main()
