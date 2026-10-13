"""MIT. Original document acquisition on the retained TIND migration."""
from __future__ import annotations
import hashlib
import os
from pathlib import Path
from http.client import HTTPException
import re
import shutil
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urljoin, urlsplit
from urllib.request import Request, build_opener
from bridge import InputError, storage
from harvest import jbytes, decode, sha, stamp, plain, page_values
from marc import access
from migration import MAX_FILE, MAX_JSON, file_digest, https_url
from native import NoRedirect, headers, origin

SCHEMA = "stellar-forge.tind-source-acquisition.v1"
CHUNK = 1024 * 1024
CHECKPOINT = 8 * CHUNK

def tables(owner):
    owner.db.executescript("""
        CREATE TABLE IF NOT EXISTS tind_source_acquisitions(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tind_source_downloads(acquisition_id TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,
            PRIMARY KEY(acquisition_id,id));
    """)
    if not hasattr(owner, "source_download_lock"):
        owner.source_download_lock = threading.Lock()
        owner.source_download_stop = threading.Event()
        owner.source_download_active = False
        owner.source_download_active_id = None

def save(owner, item):
    owner.db.execute("UPDATE tind_source_downloads SET body=? WHERE acquisition_id=? AND id=?",
                     (jbytes(item).decode(), item["acquisitionId"], item["id"]))

def acquisition(owner, project_id, identity):
    value = owner._get("tind_source_acquisitions", identity)
    if value["projectId"] != project_id:
        raise InputError("The source acquisition belongs to another migration")
    return value

def source_url(value):
    value = https_url(value, "original document URL")
    if any(re.search(r"token|password|secret|signature|credential|api.?key|authorization", key, re.I)
           for key, _ in parse_qsl(urlsplit(value).query)):
        raise InputError("Use a stable source URL and the separate authorization environment variable")
    return value

def root(owner):
    path = owner.area / "acquisition-bytes"
    path.mkdir(mode=0o700, exist_ok=True)
    if path.is_symlink():
        raise InputError("The original source cache must be a real directory")
    return path

def original_path(owner, item):
    base = root(owner)
    folder = base / sha(item["acquisitionId"].encode())
    folder.mkdir(mode=0o700, exist_ok=True)
    if folder.is_symlink():
        raise InputError("The source acquisition directory changed")
    path = folder / item["id"]
    if path.is_symlink() or path.exists() and not path.is_file():
        raise InputError("The retained source document must be a regular file")
    return path

def plan(owner, project, value, operation):
    rows = value.get("files")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 5000:
        raise InputError("Prepare 1–5,000 complete original document rows")
    title = plain(value.get("title"), "source acquisition title", 512)
    reviewer = plain(value.get("reviewer"), "source selecting operator", 256)
    note = plain(value.get("note"), "original document selection and acquisition authority", 16384)
    interval = value.get("interval", 2.1)
    if type(interval) not in {int, float} or not 0 <= interval <= 3600:
        raise InputError("Choose 0–3600 seconds between original source documents")
    auth = value.get("authorizationEnvironment") or None
    if auth and (not isinstance(auth, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", auth)):
        raise InputError("Use the name of the existing source authorization environment variable")
    normalized, seen = [], set()
    for row in rows:
        if not isinstance(row, dict):
            raise InputError("Each original source file must be a complete object")
        allowed = {"identifier", "id", "filename", "url", "role", "mediaType", "access", "expectedSha256", "expectedBytes", "maximumBytes", "redirectOrigins"}
        if set(row) - allowed:
            raise InputError("Unknown original source file fields")
        identifier = plain(row.get("identifier"), "exact source record identifier", 4096)
        owner._record_row(project, identifier)
        file_id = plain(row.get("id"), "stable source file ID", 256)
        if (identifier, file_id) in seen:
            raise InputError("The acquisition repeats a source file identity")
        seen.add((identifier, file_id))
        url = source_url(row.get("url"))
        redirects = row.get("redirectOrigins", [])
        if not isinstance(redirects, list) or len(redirects) > 20:
            raise InputError("Select up to twenty original download redirect origins")
        selected_origins = []
        for candidate in redirects:
            candidate = source_url(candidate)
            parts = urlsplit(candidate)
            if parts.path not in {"", "/"} or parts.query:
                raise InputError("Redirect selections must be exact HTTPS origins")
            selected_origins.append(candidate.rstrip("/"))
        maximum = row.get("maximumBytes", MAX_FILE)
        if type(maximum) is not int or not 1 <= maximum <= MAX_FILE:
            raise InputError("Choose a positive source file allowance of at most 1 TiB")
        expected_size, expected_sha = row.get("expectedBytes"), row.get("expectedSha256")
        if expected_size is not None and (type(expected_size) is not int or not 0 <= expected_size <= maximum):
            raise InputError("The expected source length must fit its download allowance")
        if expected_sha is not None:
            storage.checked_id(expected_sha)
        normalized.append({"identifier": identifier, "fileId": file_id, "url": url,
            "filename": plain(row.get("filename"), "original file name", 1024),
            "role": plain(row.get("role"), "original document role", 256),
            "mediaType": plain(row.get("mediaType"), "expected media type", 256),
            "access": access(row.get("access", project["profile"]["defaultAccess"])),
            "maximumBytes": maximum, "expectedBytes": expected_size, "expectedSha256": expected_sha,
            "redirectOrigins": sorted(set(selected_origins))})
    original = owner.object(jbytes(value))
    result = {"schema": SCHEMA, "id": operation, "projectId": project["id"], "title": title, "reviewer": reviewer,
              "note": note, "editionId": project["editionId"], "projectRevision": project["revision"],
              "createdAt": stamp(), "interval": interval, "authorizationEnvironment": auth,
              "original": original, "files": len(normalized)}
    owner.db.execute("INSERT INTO tind_source_acquisitions VALUES(?,?,?)", (operation, project["id"], jbytes(result).decode()))
    for item in normalized:
        key = sha(jbytes([operation, item["identifier"], item["fileId"]]))
        current = {**item, "id": key, "acquisitionId": operation, "status": "ready", "bytes": 0,
                   "prefixSha256": hashlib.sha256(b"").hexdigest(), "attempts": [], "adoptions": []}
        owner.db.execute("INSERT INTO tind_source_downloads VALUES(?,?,?)", (operation, key, jbytes(current).decode()))
    return result

def view(owner, project_id, identity, offset=0, limit=50):
    page_values(offset, limit)
    result = acquisition(owner, project_id, identity)
    counts = {}
    for row in owner.db.execute("SELECT body FROM tind_source_downloads WHERE acquisition_id=?", (identity,)):
        item = decode(row[0])
        counts[item["status"]] = counts.get(item["status"], 0) + 1
    rows = owner.db.execute("SELECT body FROM tind_source_downloads WHERE acquisition_id=? ORDER BY id LIMIT ? OFFSET ?",
                            (identity, limit, offset)).fetchall()
    return {**result, "items": [decode(row[0]) for row in rows], "counts": counts,
            "offset": offset, "next": offset + len(rows) if offset + len(rows) < result["files"] else None,
            "running": owner.source_download_active_id == (project_id, identity)}

def list_acquisitions(owner, project_id, offset=0, limit=50):
    page_values(offset, limit)
    owner.project(project_id)
    count = owner.db.execute("SELECT COUNT(*) FROM tind_source_acquisitions WHERE project_id=?", (project_id,)).fetchone()[0]
    rows = owner.db.execute("SELECT body FROM tind_source_acquisitions WHERE project_id=? ORDER BY rowid DESC LIMIT ? OFFSET ?",
                           (project_id, limit, offset)).fetchall()
    return {"items": [decode(row[0]) for row in rows], "total": count, "offset": offset,
            "next": offset + len(rows) if offset + len(rows) < count else None}

def full_document(owner, project_id, identity):
    result = acquisition(owner, project_id, identity)
    return {**result, "selection": decode(owner.object_path(result["original"]).read_bytes()), "files": [decode(row[0]) for row in owner.db.execute(
        "SELECT body FROM tind_source_downloads WHERE acquisition_id=? ORDER BY id", (identity,))]}

def checkpoint(owner, item, stream, digest, size):
    with owner.mutex:
        stream.flush()
        os.fsync(stream.fileno())
        item["bytes"] = size
        item["prefixSha256"] = digest.hexdigest()
        item["updatedAt"] = stamp()
        with owner.db:
            save(owner, item)

def request_source(owner, acquisition_value, item, offset):
    requested = item["url"]
    allowed = {origin(item["url"]), *(origin(value) for value in item["redirectOrigins"])}
    original_origin = origin(requested)
    base_headers = headers(acquisition_value.get("authorizationEnvironment"))
    base_headers.update({"User-Agent": "TINDMigrationWorkspace/1", "Accept": "*/*", "Accept-Encoding": "identity"})
    if offset:
        base_headers["Range"] = "bytes=" + str(offset) + "-"
        base_headers["If-Range"] = item["etag"]
    opener = build_opener(NoRedirect())
    for _ in range(10):
        request_headers = dict(base_headers)
        if origin(requested) != original_origin:
            request_headers.pop("Authorization", None)
        try:
            response = opener.open(Request(requested, headers=request_headers, method="GET"), timeout=30)
        except HTTPError as error:
            response = error
        withheld = {"authorization", "proxy-authorization", "cookie", "set-cookie", "set-cookie2"}
        retained_headers = []
        for key, value in response.headers.items():
            if key.casefold() in withheld:
                continue
            if key.casefold() in {"location", "content-location"} and any(re.search(r"token|password|secret|signature|credential|api.?key|authorization", name, re.I) for name, _ in parse_qsl(urlsplit(value).query)):
                value = "[private redirect query withheld]"
            retained_headers.append([key, value])
        attempt = {"url": requested, "status": response.status, "offset": offset,
                   "headers": retained_headers,
                   "observedAt": stamp()}
        with owner.mutex, owner.db:
            item["attempts"].append(attempt)
            save(owner, item)
        if response.status in {301, 302, 303, 307, 308}:
            location = response.headers.get("Location")
            response.close()
            if not location:
                raise InputError("The original source redirect has no Location")
            requested = source_url(urljoin(requested, location))
            if origin(requested) not in allowed:
                raise InputError("The source redirected to an unselected origin; prepare a new selection with that actual download origin")
            continue
        return response, attempt
    raise InputError("The original source exceeded ten redirects")

def download_one(owner, selected, item):
    path = original_path(owner, item)
    if item["status"] == "complete" and path.exists():
        if file_digest(path) != {"sha256": item["sha256"], "bytes": item["bytes"]}:
            raise InputError("The completed original source document changed")
        return
    if not path.exists():
        # A metadata-only handover retains the acquisition but omits its binary tree.
        item["bytes"], item["prefixSha256"] = 0, hashlib.sha256(b"").hexdigest()
        item.pop("etag", None)
    digest = hashlib.sha256()
    count = item["bytes"]
    if path.exists():
        with path.open("r+b") as saved:
            if path.stat().st_size < count:
                raise InputError("The original download is shorter than its durable checkpoint")
            remaining = count
            while remaining:
                block = saved.read(min(CHUNK, remaining))
                if not block:
                    raise InputError("The original source prefix could not be read")
                digest.update(block); remaining -= len(block)
            if digest.hexdigest() != item["prefixSha256"]:
                raise InputError("The original source prefix differs from its saved checkpoint")
            saved.truncate(count)
            saved.flush(); os.fsync(saved.fileno())
    if count and (not re.fullmatch(r'"[^"\r\n]*"', item.get("etag") or "") or item.get("totalBytes") is not None and count >= item["totalBytes"]):
        count, digest = 0, hashlib.sha256()
    response, attempt = request_source(owner, selected, item, count)
    with response:
        status = response.status
        if status not in {200, 206}:
            raise InputError("Original source returned HTTP " + str(status))
        if response.headers.get("Content-Encoding", "identity").lower() not in {"", "identity"}:
            raise InputError("Original byte acquisition requires an identity-encoded response")
        total = None
        length_header = response.headers.get("Content-Length")
        if length_header is not None and not length_header.isdecimal():
            raise InputError("The original response has an invalid Content-Length")
        length = int(length_header) if length_header is not None else None
        if status == 206:
            match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", response.headers.get("Content-Range", ""))
            if not count or not match:
                raise InputError("The source returned a partial response without the original requested range")
            first, last, total = map(int, match.groups())
            if first != count or last < first or last >= total or length is not None and length != last-first+1:
                raise InputError("The source range differs from the retained document prefix")
            if response.headers.get("ETag") is not None and response.headers["ETag"] != item.get("etag"):
                raise InputError("The original source changed during its range continuation")
            if item.get("totalBytes") is not None and item["totalBytes"] != total:
                raise InputError("The original source length changed during its range continuation")
        else:
            count, digest = 0, hashlib.sha256()
            total = length
        if total is not None and total > item["maximumBytes"]:
            raise InputError("The original file exceeds its selected byte allowance")
        if total is not None and item["expectedBytes"] is not None and total != item["expectedBytes"]:
            raise InputError("The original response length differs from the selected source identity")
        etag = response.headers.get("ETag") or (item.get("etag") if status == 206 else "") or ""
        item["etag"] = etag if re.fullmatch(r'"[^"\r\n]*"', etag) else None
        item["totalBytes"] = total
        item["actualMediaType"] = response.headers.get("Content-Type", item.get("actualMediaType", "") if status == 206 else "").split(";", 1)[0].strip().lower()
        item["finalUrl"] = attempt["url"]
        item["status"], item["lastError"] = "downloading", None
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if count == 0:
            # Commit the reset before truncating an older durable prefix. A restart
            # can discard extra bytes, but must never require bytes already removed.
            with owner.mutex, owner.db:
                item["bytes"] = 0
                item["prefixSha256"] = hashlib.sha256(b"").hexdigest()
                save(owner, item)
        with path.open("r+b" if path.exists() else "w+b") as output:
            os.chmod(path, 0o600)
            output.truncate(count); output.seek(count)
            checkpoint(owner, item, output, digest, count)
            since_checkpoint = 0
            try:
                while True:
                    if owner.source_download_stop.is_set():
                        raise InterruptedError("Source acquisition paused with its original byte checkpoint")
                    block = response.read(CHUNK)
                    if not block:
                        break
                    if count + len(block) > item["maximumBytes"] or total is not None and count + len(block) > total:
                        raise InputError("The source body exceeds its selected or declared byte length")
                    output.write(block); digest.update(block); count += len(block); since_checkpoint += len(block)
                    if since_checkpoint >= CHECKPOINT:
                        checkpoint(owner, item, output, digest, count); since_checkpoint = 0
            finally:
                checkpoint(owner, item, output, digest, count)
        if total is not None and count != total:
            raise InputError("The original source body ended before its complete declared length")
        if item["expectedBytes"] is not None and count != item["expectedBytes"]:
            raise InputError("Original document bytes differ from the selected expected length")
        if item["expectedSha256"] is not None and digest.hexdigest() != item["expectedSha256"]:
            raise InputError("Original document bytes differ from the selected expected SHA-256")
        with owner.mutex, owner.db:
            item.update({"status": "complete", "sha256": digest.hexdigest(), "bytes": count, "completedAt": stamp(), "lastError": None})
            save(owner, item)

def run(owner, project_id, identity, *, only=None):
    if only is not None and (not isinstance(only, list) or len(only) > 5000 or any(not isinstance(x, str) for x in only) or len(set(only)) != len(only)):
        raise InputError("Choose complete unique source acquisition row IDs")
    with owner.mutex:
        selected = acquisition(owner, project_id, identity)
        headers(selected.get("authorizationEnvironment"))
        if not owner.source_download_lock.acquire(blocking=False):
            raise InputError("Continue or pause the current source acquisition")
        owner.source_download_active = True
        owner.source_download_active_id = (project_id, identity)
    try:
        with owner.mutex:
            all_rows = [decode(row[0]) for row in owner.db.execute("SELECT body FROM tind_source_downloads WHERE acquisition_id=? ORDER BY id", (identity,))]
        if only is not None and not set(only) <= {row["id"] for row in all_rows}:
            raise InputError("A selected source row is absent from this acquisition")
        rows = [row for row in all_rows if only is None or row["id"] in only]
        for index, item in enumerate(rows):
            if owner.source_download_stop.is_set():
                break
            if index and selected["interval"] and owner.source_download_stop.wait(selected["interval"]):
                break
            try:
                download_one(owner, selected, item)
            except (InputError, OSError, URLError, TimeoutError, HTTPException) as error:
                with owner.mutex, owner.db:
                    item["status"] = "paused" if owner.source_download_stop.is_set() else "retry"
                    item["lastError"] = str(error); item["updatedAt"] = stamp()
                    save(owner, item)
                # A source failure does not discard the other selected documents.
            except BaseException:
                with owner.mutex, owner.db:
                    item["status"], item["lastError"] = "paused", "Original process interrupted; continue this acquisition"
                    save(owner, item)
                raise
        with owner.mutex:
            result = view(owner, project_id, identity)
            result["running"] = False
            return result
    finally:
        with owner.mutex:
            owner.source_download_active = False
            owner.source_download_active_id = None
            owner.source_download_lock.release()

def adopt(owner, project, value, operation):
    selected = acquisition(owner, project["id"], value.get("acquisitionId"))
    reviewer = plain(value.get("reviewer"), "document receiving operator", 256)
    note = plain(value.get("note"), "original document and access review", 16384)
    choices = value.get("files")
    if not isinstance(choices, list) or not 1 <= len(choices) <= 5000:
        raise InputError("Select 1–5,000 complete document receiving rows")
    seen, adopted = set(), []
    if owner.source_download_active:
        raise InputError("Pause the acquisition before adopting its completed source files")
    tree = root(owner)
    if project.get("fileRoot"):
        tree = Path(project["fileRoot"]).resolve(strict=True)
        info = tree.stat()
        if not tree.is_dir() or project["fileRootIdentity"] != {"device": info.st_dev, "inode": info.st_ino}:
            raise InputError("Rebind the original source tree before receiving documents")
    else:
        owner._file_root(project, {"path": str(tree)}, operation)
    for choice in choices:
        if not isinstance(choice, dict) or set(choice) - {"id", "filename", "role", "mediaType", "access", "replaceSha256"}:
            raise InputError("Use complete document receiving rows")
        key = choice.get("id")
        if key in seen:
            raise InputError("Receive each completed original document once")
        seen.add(key)
        row = owner.db.execute("SELECT body FROM tind_source_downloads WHERE acquisition_id=? AND id=?", (selected["id"], key)).fetchone()
        if row is None:
            raise InputError("Select a retained original document")
        item = decode(row[0])
        if item["status"] != "complete":
            raise InputError("Finish the complete original document before receiving it")
        source = original_path(owner, item)
        if file_digest(source) != {"sha256": item["sha256"], "bytes": item["bytes"]}:
            raise InputError("The acquired original document changed")
        owner._record_row(project, item["identifier"])
        previous = owner.db.execute("SELECT body FROM tind_files WHERE project_id=? AND identifier=? AND id=?",
                                    (project["id"], item["identifier"], item["fileId"])).fetchone()
        old = decode(previous[0]) if previous else None
        if old and (old["sha256"], old["bytes"]) != (item["sha256"], item["bytes"]) and choice.get("replaceSha256") != old["sha256"]:
            raise InputError("Retain the current file SHA-256 in replaceSha256 to receive this replacement")
        relative = "received-source/" + item["sha256"]
        destination = tree / relative
        destination.parent.mkdir(mode=0o700, exist_ok=True)
        if destination.parent.is_symlink() or destination.is_symlink():
            raise InputError("Receive original documents into a real source tree")
        if destination.exists():
            if file_digest(destination) != {"sha256": item["sha256"], "bytes": item["bytes"]}:
                raise InputError("The selected receiving file differs from its original bytes")
        else:
            temporary = destination.with_name(destination.name + "." + sha(operation.encode())[:16] + ".partial")
            if temporary.is_symlink():
                raise InputError("The original receiving temporary path changed")
            with source.open("rb") as incoming, temporary.open("wb") as out:
                os.chmod(temporary, 0o600)
                shutil.copyfileobj(incoming, out, CHUNK); out.flush(); os.fsync(out.fileno())
            if file_digest(temporary) != {"sha256": item["sha256"], "bytes": item["bytes"]}:
                raise InputError("The complete document copy changed before receiving")
            os.replace(temporary, destination); storage.sync_dir(destination.parent)
        manifest = {"identifier": item["identifier"], "id": item["fileId"],
                    "filename": choice.get("filename", item["filename"]), "role": choice.get("role", item["role"]),
                    "mediaType": choice.get("mediaType", item["mediaType"]), "access": choice.get("access", item["access"]),
                    "url": item["url"], "path": relative, "sha256": item["sha256"], "bytes": item["bytes"],
                    "sourceAcquisition": {"id": selected["id"], "fileId": item["id"], "observedAt": item["completedAt"],
                                          "finalUrl": item["finalUrl"]}}
        owner._files(project, {"files": [manifest]}, operation)
        current = owner.db.execute("SELECT body FROM tind_files WHERE project_id=? AND identifier=? AND id=?",
                                   (project["id"], item["identifier"], item["fileId"])).fetchone()
        entry = decode(current[0])
        entry["verified"] = {"sha256": item["sha256"], "bytes": item["bytes"], "checkedAt": stamp()}
        owner.db.execute("UPDATE tind_files SET body=? WHERE project_id=? AND identifier=? AND id=?",
                         (jbytes(entry).decode(), project["id"], item["identifier"], item["fileId"]))
        receipt = {"operationId": operation, "reviewer": reviewer, "note": note, "receivedAt": stamp(),
                   "before": old, "after": entry}
        item["adoptions"].append(receipt); save(owner, item)
        adopted.append({"identifier": item["identifier"], "fileId": item["fileId"], "sha256": item["sha256"], "bytes": item["bytes"]})
    return {"acquisitionId": selected["id"], "files": adopted, "reviewer": reviewer, "note": note}

def import_source(owner, project, value, operation):
    """Receive an original file already acquired by the institution's native operator."""
    selected = acquisition(owner, project["id"], value.get("acquisitionId"))
    if owner.source_download_active:
        raise InputError("Pause the original acquisition before receiving its source file")
    row = owner.db.execute("SELECT body FROM tind_source_downloads WHERE acquisition_id=? AND id=?",
                           (selected["id"], value.get("id"))).fetchone()
    if row is None:
        raise InputError("Choose the original acquisition row")
    item = decode(row[0])
    reviewer = plain(value.get("reviewer"), "original source receiving operator", 256)
    note = plain(value.get("note"), "original source file receiving context", 16384)
    observed = value.get("transport")
    if not isinstance(observed, dict):
        raise InputError("Receive the actual original HTTP observation with the file")
    from migration import timestamp
    if observed.get("method", "GET") != "GET" or observed.get("status") != 200:
        raise InputError("Receive the original complete GET response with HTTP 200")
    requested = source_url(observed.get("url"))
    final_url = source_url(observed.get("finalUrl", requested))
    if requested != item["url"]:
        raise InputError("The original source receipt belongs to another selected URL")
    allowed = {origin(item["url"]), *(origin(url) for url in item["redirectOrigins"])}
    if origin(final_url) not in allowed:
        raise InputError("Select the actual original redirected source origin before receiving this file")
    original_headers = observed.get("headers", [])
    if not isinstance(original_headers, list) or len(original_headers) > 256:
        raise InputError("Receive the original response header pairs")
    retained_headers = []
    for pair in original_headers:
        if not isinstance(pair, list) or len(pair) != 2 or any(not isinstance(part, str) for part in pair):
            raise InputError("Original response headers must be literal string pairs")
        key, text = pair
        if not re.fullmatch(r"[A-Za-z0-9-]+", key) or "\r" in text or "\n" in text:
            raise InputError("Receive complete original header fields")
        if key.casefold() in {"authorization", "proxy-authorization", "cookie", "set-cookie", "set-cookie2"}:
            continue
        if re.search(r"token|password|secret|credential|api.?key", key, re.I):
            continue
        if key.casefold() in {"location", "content-location"}:
            source_url(urljoin(requested, text))
        retained_headers.append([key, text])
    observed_at = timestamp(observed.get("observedAt"), "original source observation time")
    path = Path(value["path"]).expanduser()
    if path.is_symlink():
        raise InputError("Receive an original regular file")
    path = path.resolve(strict=True)
    from migration import source_binding, source_binding_digest
    binding = source_binding(path, value.get("sourceBinding"))
    actual = file_digest(path, item["maximumBytes"])
    source_binding_digest(actual, binding)
    if item["expectedBytes"] is not None and actual["bytes"] != item["expectedBytes"] or item["expectedSha256"] is not None and actual["sha256"] != item["expectedSha256"]:
        raise InputError("The original received document differs from its selected expected identity")
    if item["status"] == "complete" and (item["sha256"], item["bytes"]) != (actual["sha256"], actual["bytes"]):
        raise InputError("Prepare a new original acquisition for a changed completed document")
    response_headers = {key.casefold(): text for key, text in retained_headers}
    if response_headers.get("content-encoding", "identity").lower() not in {"", "identity"}:
        raise InputError("Receive original identity-encoded document bytes")
    declared = response_headers.get("content-length")
    if declared is not None and (not declared.isdecimal() or int(declared) != actual["bytes"]):
        raise InputError("The original complete response length differs from the received file")
    destination = original_path(owner, item)
    if path != destination:
        temporary = destination.with_suffix(".receiving")
        if temporary.is_symlink():
            raise InputError("The original document receiving path changed")
        with path.open("rb") as incoming, temporary.open("wb") as output:
            os.chmod(temporary, 0o600)
            shutil.copyfileobj(incoming, output, CHUNK); output.flush(); os.fsync(output.fileno())
        if file_digest(temporary, item["maximumBytes"]) != actual:
            raise InputError("The original file changed while it was received")
        os.replace(temporary, destination); storage.sync_dir(destination.parent)
    source_binding(path, value.get("sourceBinding"))
    transport = {"url": requested, "finalUrl": final_url, "method": "GET", "status": 200,
                 "headers": retained_headers, "observedAt": observed_at}
    receipt = {"schema": "stellar-forge.tind-source-file-receiving.v1", "operationId": operation,
               "transport": transport, "sha256": actual["sha256"], "bytes": actual["bytes"],
               "reviewer": reviewer, "note": note, "receivedAt": stamp()}
    item.setdefault("sourceReceiving", []).append(receipt)
    item.update({"status": "complete", **actual, "prefixSha256": actual["sha256"], "totalBytes": actual["bytes"],
                 "finalUrl": final_url, "completedAt": observed_at, "lastError": None,
                 "actualMediaType": response_headers.get("content-type", "").split(";", 1)[0].strip().lower()})
    save(owner, item)
    return {"acquisitionId": selected["id"], "id": item["id"], "receipt": receipt}
