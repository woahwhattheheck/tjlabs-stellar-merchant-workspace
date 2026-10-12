"""Portable customer reading projects and complete, source-pinned reading reports."""
from __future__ import annotations

from contextlib import contextmanager
import csv
import hashlib
import html
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import zipfile

from .reading_workspace import ReadingWorkspace, ReadingError, SCHEMA, HASH, canonical, file_digest

PORTABLE = "stellar-forge.sf88.reading-project.v1"
TABLES = {
    "metadata": ("key", "value"),
    "resources": ("id", "sha", "metadata"),
    "snapshots": ("id", "label", "created", "source_identity", "native_generation", "counts"),
    "snapshot_resources": ("snapshot", "resource", "metadata"),
    "syncs": ("id", "request_digest", "plan", "state", "completed", "total", "error", "result"),
    "revisions": ("kind", "id", "revision", "created", "payload"),
    "receipts": ("id", "digest", "result"),
    "deliveries": ("id", "request", "state", "result"),
}
MAX_MANIFEST = 64 * 1024 * 1024


@contextmanager
def new_output(destination):
    """fsync then create-only publication. Never overwrite an unrelated artifact."""
    target = Path(destination).absolute()
    if target.parent.resolve() != target.parent or not target.parent.is_dir():
        raise ReadingError("OUTPUT_PARENT_REQUIRED")
    if target.exists() or target.is_symlink():
        raise ReadingError("OUTPUT_EXISTS", "Choose a new file name.")
    fd, temporary = tempfile.mkstemp(prefix=".reading-export-", dir=target.parent)
    temporary = Path(temporary)
    os.close(fd)
    try:
        yield temporary
        with temporary.open("rb") as stream:
            os.fsync(stream.fileno())
        os.link(temporary, target)
        directory = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def export_project(workspace: ReadingWorkspace, destination) -> dict:
    """Include all retained originals, snapshots, revisions and delivery receipts.

    The searchable index is rebuilt by the receiver rather than trusting a database
    supplied by an archive. Browser credentials, native paths, dependencies and
    incomplete transfer buffers are not project data and are not exported.
    """
    with workspace._exclusive(), workspace._db() as db:
        tables = {table: [dict(r) for r in db.execute("SELECT " + ",".join(columns) + " FROM " + table + " ORDER BY rowid")]
                  for table, columns in TABLES.items()}
        assets = [dict(r) for r in db.execute("SELECT * FROM assets ORDER BY sha")]
        manifest = {"schema": PORTABLE, "workspace_schema": SCHEMA, "capabilities": ["source-ranges-v1"], "tables": tables, "originals": assets}
        encoded = (canonical(manifest) + "\n").encode()
        if len(encoded) > MAX_MANIFEST:
            raise ReadingError("MANIFEST_LIMIT", "Project metadata exceeds the 64 MiB portable manifest limit.")
        with new_output(destination) as temporary, zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
            archive.writestr("project.json", encoded)
            for asset in assets:
                path = workspace.assets / asset["sha"]
                if file_digest(path) != (asset["sha"], asset["bytes"]):
                    raise ReadingError("ORIGINAL_HASH_MISMATCH")
                archive.write(path, "originals/" + asset["sha"])
    sha, size = file_digest(Path(destination).absolute())
    return {"path": str(Path(destination).absolute()), "sha256": sha, "bytes": size,
            "originals": len(assets), "source_bytes": sum(a["bytes"] for a in assets)}


def receive_project(archive_path, directory, *, max_total_bytes=20 * 1024**3) -> dict:
    """Create a new editable project, checking every original and rebuilding FTS.

    Extraction accepts only declared hash-named regular members. No embedded SQL,
    archive paths, symlinks, or scripts are executed. A failure removes only the
    new directory that this operation created; existing directories are untouched.
    """
    target = Path(directory).absolute()
    if target.parent.resolve() != target.parent or target.exists() or target.is_symlink():
        raise ReadingError("NEW_RECEIVING_DIRECTORY_REQUIRED")
    if type(max_total_bytes) is not int or max_total_bytes < 0:
        raise ReadingError("INVALID_RECEIVING_LIMIT")
    source = Path(archive_path).absolute()
    source_sha, source_size = file_digest(source)
    with zipfile.ZipFile(source) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or "project.json" not in names:
            raise ReadingError("ARCHIVE_MEMBERS")
        info = archive.getinfo("project.json")
        if info.file_size > MAX_MANIFEST:
            raise ReadingError("MANIFEST_LIMIT")
        with archive.open(info) as stream:
            raw = stream.read(MAX_MANIFEST + 1)
        if len(raw) != info.file_size:
            raise ReadingError("MANIFEST_LIMIT")
        manifest = json.loads(raw.decode("utf-8", "strict"))
        if manifest.get("schema") != PORTABLE or manifest.get("workspace_schema") != SCHEMA:
            raise ReadingError("PROJECT_VERSION")
        if not isinstance(manifest.get("capabilities", []), list) or any(c not in ("source-ranges-v1",) for c in manifest.get("capabilities", [])):
            raise ReadingError("PROJECT_CAPABILITY_REQUIRED")
        assets, tables = manifest.get("originals"), manifest.get("tables")
        if not isinstance(assets, list) or not isinstance(tables, dict) or set(tables) != set(TABLES):
            raise ReadingError("PROJECT_STRUCTURE")
        expected, total = {"project.json"}, 0
        for asset in assets:
            sha, size = asset.get("sha"), asset.get("bytes")
            if not isinstance(sha, str) or not HASH.fullmatch(sha) or type(size) is not int or size < 0:
                raise ReadingError("PROJECT_ORIGINAL")
            member = "originals/" + sha
            if member in expected:
                raise ReadingError("DUPLICATE_ORIGINAL")
            expected.add(member)
            total += size
            if total > max_total_bytes:
                raise ReadingError("RECEIVING_SIZE_LIMIT")
            if member not in names or archive.getinfo(member).file_size != size:
                raise ReadingError("ORIGINAL_SIZE_MISMATCH")
        if set(names) != expected:
            raise ReadingError("ARCHIVE_MEMBERS")
        target.mkdir(mode=0o700)
        try:
            with ReadingWorkspace(target) as workspace:
                for asset in assets:
                    sha, size = asset["sha"], asset["bytes"]
                    with archive.open("originals/" + sha) as incoming, (workspace.assets / sha).open("xb") as output:
                        copied, checksum = 0, hashlib.sha256()
                        for block in iter(lambda: incoming.read(1024 * 1024), b""):
                            copied += len(block)
                            if copied > size:
                                raise ReadingError("ORIGINAL_SIZE_MISMATCH")
                            output.write(block)
                            checksum.update(block)
                        output.flush()
                        os.fsync(output.fileno())
                    os.chmod(workspace.assets / sha, 0o600)
                    if copied != size or checksum.hexdigest() != sha:
                        raise ReadingError("ORIGINAL_HASH_MISMATCH")
                    workspace._index(sha, size)
                    with workspace._db() as db:
                        actual = dict(db.execute("SELECT * FROM assets WHERE sha=?", (sha,)).fetchone())
                    if actual != asset:
                        raise ReadingError("INDEX_VERSION_MISMATCH")
                with workspace._db(write=True) as db:
                    db.execute("DELETE FROM metadata")
                    for table, columns in TABLES.items():
                        rows = tables[table]
                        if not isinstance(rows, list):
                            raise ReadingError("PROJECT_TABLE")
                        for row in rows:
                            if not isinstance(row, dict) or set(row) != set(columns):
                                raise ReadingError("PROJECT_ROW")
                            db.execute("INSERT INTO " + table + " (" + ",".join(columns) + ") VALUES(" + ",".join("?" for _ in columns) + ")", [row[c] for c in columns])
                    if workspace._meta(db, "schema") != SCHEMA:
                        raise ReadingError("PROJECT_VERSION")
                    if db.execute("SELECT count(*) FROM snapshot_resources sr LEFT JOIN resources r ON r.id=sr.resource LEFT JOIN snapshots s ON s.id=sr.snapshot WHERE r.id IS NULL OR s.id IS NULL").fetchone()[0]:
                        raise ReadingError("PROJECT_REFERENCE")
                    if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                        raise ReadingError("PROJECT_DATABASE")
                # Re-read every retained list revision and captured range through
                # the same original source reader, including earlier revisions.
                from .reading_selections import validate_handover_records
                validate_handover_records(workspace)
                status = workspace.status()
            if file_digest(source) != (source_sha, source_size):
                raise ReadingError("ARCHIVE_CHANGED")
            return {"directory": str(target), "archive_sha256": source_sha, "archive_bytes": source_size,
                    "originals": len(assets), "source_bytes": total, "workspace": status}
        except BaseException:
            shutil.rmtree(target)
            raise


def _report_rows(workspace, *, list_id=None, list_revision=None, query=None, snapshot=None, resource_id=None):
    if bool(list_id) == bool(query):
        raise ReadingError("REPORT_SELECTION", "Choose a reading list or a search query.")
    if list_id:
        record = workspace.head("list", list_id, revision=list_revision)
        context = {}
        for item in record["items"]:
            p = workspace.selected_passage(item, context=context)
            yield {**item, "text": p["body"]}
    else:
        offset, pinned = 0, snapshot
        while True:
            page = workspace.search(query, snapshot=pinned, resource_id=resource_id, offset=offset, limit=200)
            pinned = page["snapshot"]
            for item in page["items"]:
                p = workspace.passage(item["resource_id"], item["ordinal"], expected_sha=item["sha"])
                yield {k: item[k] for k in ("resource_id", "sha", "ordinal", "digest", "start_byte", "end_byte", "start_line", "end_line", "name")} | {"note": "", "text": p["body"]}
            offset += len(page["items"])
            if offset >= page["total"]:
                break


def export_report(workspace, destination, *, format="html", list_id=None, list_revision=None,
                  query=None, snapshot=None, resource_id=None) -> dict:
    if format not in ("html", "json", "csv"):
        raise ReadingError("REPORT_FORMAT")
    # Freeze a list head/current snapshot once. Edits cannot change an export mid-page.
    if list_id:
        record = workspace.head("list", list_id, revision=list_revision)
        list_revision = record["revision"]
        heading, note = record["name"], record["note"]
    else:
        page = workspace.search(query, snapshot=snapshot, resource_id=resource_id, limit=1)
        snapshot, heading, note = page["snapshot"], "Reading results", "Search: " + query
    selection = {"list_id": list_id, "list_revision": list_revision, "query": query,
                 "snapshot": snapshot, "resource_id": resource_id}
    handovers, seen = [], set()
    if list_id:
        from .reading_selections import handover_summary
        for item in record["items"]:
            handover_id = item.get("citation", {}).get("handover_id")
            if handover_id and handover_id not in seen:
                source_record = workspace.head("handover", handover_id, revision=1)
                handovers.append(handover_summary(source_record) | {"source": source_record["manifest"]["capture"]["source"]})
                seen.add(handover_id)
    handover_by_id = {entry["id"]: entry for entry in handovers}
    count = 0
    with new_output(destination) as temporary, temporary.open("w", encoding="utf-8", newline="") as output:
        if format == "html":
            output.write('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + html.escape(heading) + '</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#252525;background:#f4f4f2;margin:0}main{max-width:960px;margin:32px auto;padding:24px}article{background:white;border:1px solid #ccc;padding:22px;margin:22px 0}h1{font-size:30px;line-height:1.2}h2{font-size:20px}pre{font:14px/1.7 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}small{color:#555}p{white-space:pre-wrap}details{overflow-wrap:anywhere}@media(max-width:500px){main{padding:16px;margin:0}article{padding:14px}}</style><main><h1>' + html.escape(heading) + '</h1><p>' + html.escape(note) + '</p><small>Complete selected passages from retained originals. Byte ranges use an exclusive end. Native reading passages count LF separators; research handover passages retain the original CRLF, CR and LF line convention. Original files are included in the editable reading project.</small>')
            for handover in handovers:
                q = handover["query"]
                output.write('<section><h2>Original research question</h2><p>' + html.escape(q["q"]) + '</p><p>' +
                    html.escape(("All words across each original file" if q["mode"] == "all" else "Any word across each original file") +
                    (("; saved search revision " + str(q["savedQuery"]["revision"])) if q.get("savedQuery") else "")) +
                    '</p><small>Captured build: ' + q["build"] + '<br>Selection: ' + handover["capture_sha256"] +
                    '<br>Original collection revision: ' + str(handover["collection"]["revision"]) + '</small></section>')
        elif format == "json":
            output.write('{"schema":"stellar-forge.sf88.reading-report.v1","title":' + canonical(heading) + ',"note":' + canonical(note) + ',"selection":' + canonical(selection) + ',"handovers":' + canonical(handovers) + ',"items":[')
        else:
            writer = csv.writer(output)
            columns = ("name", "start_line", "end_line", "start_byte", "end_byte", "note", "text", "resource_id", "sha", "ordinal", "digest", "line_convention", "handover_id", "selection_id", "original_query", "query_mode", "search_build")
            writer.writerow(columns)
        for row in _report_rows(workspace, **selection):
            citation = row.get("citation", {})
            original = handover_by_id.get(citation.get("handover_id"), {}).get("query", {})
            row = {**row, "line_convention": row.get("line_convention", "LF"),
                   "handover_id": citation.get("handover_id", ""), "selection_id": citation.get("selection_id", ""),
                   "original_query": original.get("q", ""), "query_mode": original.get("mode", ""),
                   "search_build": original.get("build", "")}
            if format == "html":
                output.write('<article><h2>' + html.escape(row["name"]) + '</h2><small>Lines ' + str(row["start_line"]) + '–' + str(row["end_line"]) + '</small><p>' + html.escape(row["note"]) + '</p><pre>' + html.escape(row["text"]) + '</pre><details><summary>Source reference</summary><p>Original SHA-256: ' + row["sha"] + '<br>Bytes: ' + str(row["start_byte"]) + '–' + str(row["end_byte"]) + '<br>Passage SHA-256: ' + row["digest"] + '</p></details></article>')
            elif format == "json":
                output.write(("," if count else "") + canonical(row))
            else:
                # Prevent spreadsheet formula execution without changing the JSON/original bytes.
                writer.writerow(("'" + str(row[c]) if isinstance(row[c], str) and row[c].lstrip().startswith(("=", "+", "-", "@")) else row[c]) for c in columns)
            count += 1
        output.write('</main></html>' if format == "html" else ']}' if format == "json" else "")
    sha, size = file_digest(Path(destination).absolute())
    return {"path": str(Path(destination).absolute()), "format": format, "passages": count, "sha256": sha, "bytes": size, "selection": selection}
