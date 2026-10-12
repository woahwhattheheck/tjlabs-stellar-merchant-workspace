"""Complete, create-only customer workspace delivery and resumable receiving."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import tempfile
import zipfile

from .scenario_types import SCHEMA, encode, fail, file_digest, now
from .storage import private_directory

DELIVERY = "stellar-forge.customer-scenario-delivery.v1"
START = '''"""Open the delivered scenario workspace with its included Python sources."""
from pathlib import Path
import sys
root = Path(__file__).resolve().parent
if (root / ".scenario-receive.json").exists():
    raise SystemExit("Workspace receiving is incomplete. Resume the same archive before opening it.")
sys.path.insert(0, str(root / "application"))
from stellar_forge_buyer.scenario_cli import main
main(["serve", "--workspace", str(root / "workspace"), *sys.argv[1:]])
'''
USAGE = '''# Customer scenario workspace

This package contains the complete analytical SQLite database, saved SQL,
scenario definitions, all retained case/comparison rows and operator reviews.
Earlier report files are included. Previous whole-workspace delivery archives are
recorded in history but are not nested recursively in this package.
It also contains the Python application source needed to reopen this scenario
desk. Any interrupted scenario operations include their original frozen input.
There is no wallet, signer, purchase operation or network download required to
read, compare, edit or run scenarios on these retained analytical data.

Use Python 3.11 or later on a POSIX system (Linux, macOS, or WSL):

    python start.py --port 8765

The command prints a local connection-file path. That private JSON file contains
a URL with a short-lived local access token. Open its `url` in your browser.
The server binds to loopback only and never places that token in HTTP query
parameters. Stop the process with Ctrl+C. A new server process rotates the token.

Scenarios select existing saved SQL revisions. Each case changes parameter text,
not the SQL or data. Save a new definition revision to change the analyses or
assumptions. The baseline and every case use one frozen original SQLite input.
A saved query's preview row limit does not truncate a scenario run. Long-running
operations retain complete cases and can resume after interruption on their
same frozen input. A changed current view cannot replace that input.

Result rows and comparison pages retain the original scalar types. Integers
are textual in JSON to prevent browser rounding. Decimal-text metrics must be
explicitly selected as `decimal`. SQL REAL metrics use the original decimal
rendering of their binary floating-point value. Delta arithmetic uses those
texts. Percentages use delta divided by absolute baseline, with 28 significant
decimal digits. Zero baseline, missing rows and unreported values remain distinct.
No metric direction or recommendation is inferred. Operator labels in review
history are supplied by the person using this local desk, not identity proofs.

HTML and JSON reports include every retained result and comparison row. The CSV
bundle includes complete typed JSON plus spreadsheet-safe CSV files. Text that
could be interpreted as a spreadsheet formula is prefixed with an apostrophe in
CSV only; the typed JSON preserves its exact original content.

The workspace package contains ALL analytical data and saved history in this
database, not merely the selected run. Review its contents before sharing it.
Original acquisition/session locations in old source metadata are historical
references. The included scenario desk operates on the retained SQL tables.
Fresh network acquisition remains in the separately installed original Buyer.

Use the installed receiver for validated, create-only import:

    python -m stellar_forge_buyer.scenario_cli receive package.zip new-directory
    python -m stellar_forge_buyer.scenario_cli receive package.zip new-directory --resume

Receiving verifies every file's complete length and SHA-256. A partial receive
keeps its checkpoint; retrying with `--resume` continues the SAME archive without
overwriting an existing completed file. Extra, changed, linked or unsafe files
are rejected. Do not open a package until receiving has completed.

manifest.json describes every delivered file. Source code and database hashes
identify the complete content delivered in this package; they are not a digital
signature or independent attestation of the source publisher.
'''


def _sync(directory):
    fd = os.open(directory, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _add_file(archive, source, target):
    source = Path(source)
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    digest, count = hashlib.sha256(), 0
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            fail("A delivery source is not a regular file.")
        with os.fdopen(fd, "rb", closefd=False) as stream, archive.open(target, "w", force_zip64=True) as output:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                output.write(block)
                digest.update(block)
                count += len(block)
        after = os.fstat(fd)
        if (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            fail("A delivery source changed while it was being read.")
    finally:
        os.close(fd)
    return {"path": target, "bytes": count, "sha256": digest.hexdigest()}


def build_delivery(workspace, destination, *, request_id=None):
    destination = Path(destination).expanduser().absolute()
    if destination.exists() or destination.is_symlink():
        fail("The workspace delivery destination already exists.")
    if not destination.parent.is_dir():
        fail("The workspace delivery parent directory does not exist.")
    stage = Path(tempfile.mkdtemp(prefix=".scenario-delivery-", dir=workspace.exports))
    temporary = stage / "package.zip"
    try:
        with workspace.guard:
            database_folder = private_directory(stage / "database")
            workspace.database.backup(database_folder)
            from .sqlite_dataset import DatasetDatabase
            snapshot = DatasetDatabase(database_folder, create=False)
            with snapshot._connection(readonly=True) as db:
                db.execute("BEGIN")
                workspace_id = db.execute("SELECT workspace_id FROM sf_analysis_format WHERE id=1").fetchone()[0]
                report_files = [json.loads(row[0]) for row in db.execute("SELECT record FROM sf_scenario_exports") if json.loads(row[0]).get("format") != "workspace"]
                pending = [dict(row) for row in db.execute("SELECT id,status,request_sha256 FROM sf_scenario_runs WHERE status!='COMPLETE'")]
                summary = {"workspace_id": workspace_id,
                           "scenario_definitions": db.execute("SELECT COUNT(*) FROM sf_scenario_definitions").fetchone()[0],
                           "scenario_runs": db.execute("SELECT COUNT(*) FROM sf_scenario_runs").fetchone()[0],
                           "retained_result_rows": db.execute("SELECT COUNT(*) FROM sf_scenario_rows").fetchone()[0]}
            files = []
            with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                files.append(_add_file(archive, snapshot.path, "workspace/datasets.sqlite3"))
                for run in pending:
                    folder = workspace.work / run["id"]
                    frozen, meta = folder / "input" / "datasets.sqlite3", folder / "input.json"
                    if not frozen.exists():
                        if meta.exists():
                            fail("An unfinished operation's frozen input is missing.")
                        continue
                    if not meta.exists():
                        # The exact SQLite copy may be complete just before its
                        # small input journal. The receiver validates/adopts it
                        # against the same reviewed definition before execution.
                        files.append(_add_file(archive, frozen, "workspace/scenario-work/" + run["id"] + "/input/datasets.sqlite3"))
                        continue
                    if meta.is_symlink():
                        fail("An unfinished input journal is linked.")
                    selected = json.loads(meta.read_text())
                    if selected.get("request_sha256") != run["request_sha256"] or file_digest(frozen) != selected.get("database_sha256"):
                        fail("An unfinished operation's retained input changed.")
                    files.append(_add_file(archive, frozen, "workspace/scenario-work/" + run["id"] + "/input/datasets.sqlite3"))
                    files.append(_add_file(archive, meta, "workspace/scenario-work/" + run["id"] + "/input.json"))
                for result in report_files:
                    filename = result["filename"]
                    if Path(filename).name != filename:
                        fail("A retained export name is invalid.")
                    source = workspace.exports / filename
                    if source.is_symlink() or not source.is_file() or file_digest(source) != result["sha256"]:
                        fail("A retained report export is missing or changed.")
                    files.append(_add_file(archive, source, "workspace/scenario-exports/" + filename))
                package = Path(__file__).parent
                for source in sorted(package.rglob("*.py")):
                    if "__pycache__" in source.parts:
                        continue
                    if source.is_symlink():
                        fail("A scenario application source is linked; its complete original bytes are required.")
                    target = "application/stellar_forge_buyer/" + source.relative_to(package).as_posix()
                    files.append(_add_file(archive, source, target))
                for target, content in (("start.py", START), ("README.md", USAGE)):
                    raw = content.encode()
                    archive.writestr(target, raw)
                    files.append({"path": target, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})
                guide = package.parent / "SCENARIOS.md"
                if guide.is_file() and not guide.is_symlink():
                    files.append(_add_file(archive, guide, "SCENARIOS.md"))
                manifest = {"schema": DELIVERY, "created_at": now(), "request_id": request_id, "workspace": summary,
                            "scope": "complete original analytical database and scenario application source",
                            "entry": "start.py", "python": ">=3.11; POSIX", "files": files}
                archive.writestr("manifest.json", encode(manifest).encode())
        with open(temporary, "rb") as stream:
            os.fsync(stream.fileno())
        os.link(temporary, destination)
        _sync(destination.parent)
        return {"path": str(destination), "bytes": destination.stat().st_size, "sha256": file_digest(destination),
                "files": len(files), "workspace": summary}
    finally:
        shutil.rmtree(stage)


def _safe_name(value):
    if not isinstance(value, str) or not value or "\\" in value or "\0" in value or ":" in value:
        fail("The archive contains an unsafe path.")
    path = PurePosixPath(value)
    if path.is_absolute() or value != path.as_posix() or any(part in ("", ".", "..") for part in path.parts):
        fail("The archive contains an unsafe path.")
    return path


def _private_parents(root, relative):
    current = root
    for part in relative.parts[:-1]:
        current = current / part
        try:
            current.mkdir(mode=0o700)
        except FileExistsError:
            if current.is_symlink() or not current.is_dir() or current.stat().st_mode & 0o077:
                fail("A receiving directory is linked, public or not a directory.")
    return root.joinpath(*relative.parts)


def _regular(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_mode & 0o077:
        fail("An existing receiving file is not private and regular.")


def receive(archive_path, destination, *, resume=False, max_bytes=8 * 1024**3):
    archive_path, destination = Path(archive_path).expanduser().absolute(), Path(destination).expanduser().absolute()
    if type(max_bytes) is not int or not 1024 <= max_bytes <= 1024**4:
        fail("The receiving byte limit is invalid.")
    if archive_path.is_symlink() or not archive_path.is_file():
        fail("The delivery archive must be a regular file.")
    archive_sha = file_digest(archive_path)
    with zipfile.ZipFile(archive_path) as archive:
        members = archive.infolist()
        if len(members) > 10000 or len({m.filename for m in members}) != len(members):
            fail("The archive has duplicate names or too many files.")
        for member in members:
            _safe_name(member.filename)
            mode = member.external_attr >> 16
            if member.is_dir() or stat.S_ISLNK(mode) or member.flag_bits & 1:
                fail("The delivery must contain ordinary, unencrypted file members.")
        try:
            info = archive.getinfo("manifest.json")
        except KeyError:
            fail("The delivery manifest was not found.")
        if info.file_size > 4 * 1024**2:
            fail("The delivery manifest is too large.")
        raw_manifest = archive.read(info)
        manifest = json.loads(raw_manifest)
        files = manifest.get("files")
        if manifest.get("schema") != DELIVERY or not isinstance(files, list) or not files:
            fail("This is not a supported scenario workspace delivery.")
        declared, total = {}, len(raw_manifest)
        for item in files:
            if not isinstance(item, dict):
                fail("A delivery member declaration is invalid.")
            path = _safe_name(item.get("path"))
            if item["path"] in declared or item["path"] in ("manifest.json", ".scenario-receive.json"):
                fail("A delivery member is declared more than once or uses a reserved name.")
            if type(item.get("bytes")) is not int or item["bytes"] < 0 or not isinstance(item.get("sha256"), str) or len(item["sha256"]) != 64 or any(c not in "0123456789abcdef" for c in item["sha256"]):
                fail("A delivery member has an invalid length or digest.")
            declared[item["path"]] = item
            total += item["bytes"]
        if total > max_bytes or set(declared) | {"manifest.json"} != {m.filename for m in members}:
            fail("The archive inventory differs from its manifest or exceeds the receiving byte limit.")
        for path, item in declared.items():
            if archive.getinfo(path).file_size != item["bytes"]:
                fail("An archive length differs from its declared complete length.")
        declared["manifest.json"] = {"path": "manifest.json", "bytes": len(raw_manifest), "sha256": hashlib.sha256(raw_manifest).hexdigest()}
        checkpoint = {"schema": DELIVERY + "/receiving", "archive_sha256": archive_sha,
                      "manifest_sha256": hashlib.sha256(raw_manifest).hexdigest(), "files": len(declared)}
        journal = destination / ".scenario-receive.json"
        if destination.exists():
            if not resume or destination.is_symlink() or not journal.is_file():
                fail("The destination exists. Resume is allowed only for this receiver's unfinished delivery.")
            _regular(journal)
            if json.loads(journal.read_text()) != checkpoint:
                fail("The receiving checkpoint belongs to another archive.")
        else:
            destination.mkdir(mode=0o700)
            from .scenario_store import ScenarioWorkspace
            ScenarioWorkspace._write_private(journal, encode(checkpoint).encode())
            _sync(destination)
        if destination.stat().st_mode & 0o077:
            fail("The receiving destination must be private.")
        partial_suffix = ".receiving-" + checkpoint["manifest_sha256"][:16]
        allowed = set(declared) | {".scenario-receive.json"}
        allowed.update(str(PurePosixPath(p).parent / ("." + PurePosixPath(p).name + partial_suffix)) for p in declared)
        for existing in destination.rglob("*"):
            if existing.is_symlink() or existing.is_file() and existing.relative_to(destination).as_posix() not in allowed:
                fail("The unfinished destination contains an unexpected or linked file.")
        completed = 0
        for path, item in declared.items():
            target = _private_parents(destination, _safe_name(path))
            if target.exists() or target.is_symlink():
                _regular(target)
                if target.stat().st_size != item["bytes"] or file_digest(target) != item["sha256"]:
                    fail("A completed receiving file has changed; it will not be overwritten.")
                completed += 1
                continue
            temporary = target.with_name("." + target.name + partial_suffix)
            if temporary.exists() or temporary.is_symlink():
                _regular(temporary)
                temporary.unlink()
            fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            digest, count = hashlib.sha256(), 0
            try:
                with os.fdopen(fd, "wb") as output, archive.open(path) as source:
                    for block in iter(lambda: source.read(1024 * 1024), b""):
                        count += len(block)
                        if count > item["bytes"]:
                            fail("An expanded archive member exceeds its declared length.")
                        output.write(block)
                        digest.update(block)
                    output.flush()
                    os.fsync(output.fileno())
                if count != item["bytes"] or digest.hexdigest() != item["sha256"]:
                    fail("A received member does not match its complete declared content.")
                os.link(temporary, target)
                _sync(target.parent)
            finally:
                temporary.unlink(missing_ok=True)
            completed += 1
        if file_digest(archive_path) != archive_sha:
            fail("The input archive changed while it was being received.")
        journal.unlink()
        _sync(destination)
        return {"directory": str(destination), "files": completed, "bytes": total, "sha256": archive_sha,
                "workspace": manifest["workspace"], "entry": str(destination / "start.py")}
