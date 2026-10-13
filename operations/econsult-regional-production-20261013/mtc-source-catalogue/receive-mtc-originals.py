#!/usr/bin/env python3
"""Receive the two complete retained MTC PDFs and original table for the same catalogue."""
import argparse, datetime, fcntl, hashlib, json, os, pathlib, re, shutil, stat, sys
import subprocess, tempfile, urllib.parse, urllib.request, uuid

OPERATION = "MTC-PBA2050PLUS-SOURCE-IMPORT-20261013"
SCHEMA = "commons.mtc-original-receiving.v1"
PDF_PAGES = {"mtc-pba2050plus-final-2024-12-17": 2, "mtc-pba2050plus-faq-2026-02-12": 4}
TABLE = "MTC_PBA2050Plus_Full_Published_Growth_Table_2024_12_17.json"
TABLE_SHA = "6fce41e3b42febfc38eedb96f79400f7a1745c635d963571349eb50855e81e7c"

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
def sha(raw):
    return hashlib.sha256(raw).hexdigest()
def check(condition, message):
    if not condition:
        raise ValueError(message)
def raw(path):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        check(stat.S_ISREG(os.fstat(stream.fileno()).st_mode), "Use an ordinary complete file: " + str(path))
        return stream.read()
def private(path):
    path = pathlib.Path(path).absolute()
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    check(stat.S_ISDIR(info.st_mode) and not path.is_symlink() and info.st_uid == os.getuid() and
          info.st_mode & 0o077 == 0, "Use an owned private receiving directory: " + str(path))
    return path
def sync(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
def atomic(path, value):
    body = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
    fd, name = tempfile.mkstemp(prefix=".checkpoint-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        sync(path.parent)
    finally:
        if os.path.exists(name):
            os.unlink(name)
def optional(path):
    try:
        return json.loads(raw(path))
    except FileNotFoundError:
        return None
def exact(path, body):
    if path.exists():
        check(raw(path) == body, "The retained original bytes changed: " + str(path))
        return
    fd, name = tempfile.mkstemp(prefix=".complete-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(name, path)
        except FileExistsError:
            check(raw(path) == body, "A different original already occupies: " + str(path))
        sync(path.parent)
    finally:
        os.unlink(name)
def descriptor(path):
    body = raw(path)
    return {"path": str(path), "bytes": len(body), "sha256": sha(body)}
def checked_member(name):
    check(isinstance(name, str) and name and pathlib.PurePosixPath(name).name == name and
          "/" not in name and "\\" not in name and name not in (".", ".."), "Use the exact original filename.")
    return name
def safe_error(error, mapping):
    message = str(error)
    for item in mapping.values():
        message = message.replace(item["url"], "[private provider URL]")
    return message[:2000]
def source_identity(source):
    return {key: source[key] for key in ("entryId", "filename", "contentType", "bytes", "sha256",
                                        "sourceUrl", "sourceDate", "stableReference", "originalFileUploadId")}
def command(executable, arguments, timeout=120):
    selected = shutil.which(executable) or executable
    completed = subprocess.run([selected, *map(str, arguments)], capture_output=True, timeout=timeout)
    check(completed.returncode == 0, pathlib.Path(executable).name + " could not read the complete original PDF: " +
          completed.stderr.decode("utf-8", "replace")[:2000])
    return completed.stdout, completed.stderr
def validate_pdf(path, source, pdfinfo):
    body = raw(path)
    check(len(body) == source["bytes"] and body.startswith(b"%PDF-") and
          b"%%EOF" in body[-4096:], "The complete retained PDF size/signature/end marker differs.")
    if source.get("sha256"):
        check(sha(body) == source["sha256"], "Original published PDF SHA256 differs.")
    output, errors = command(pdfinfo, [path])
    match = re.search(rb"(?m)^Pages:\s+([0-9]+)\s*$", output)
    check(match and int(match.group(1)) == PDF_PAGES[source["entryId"]],
          "The original PDF page count differs from the retained source.")
    return {"bytes": len(body), "sha256": sha(body), "pages": int(match.group(1)),
            "pdfinfo": output.decode("utf-8", "replace"), "pdfinfoStderr": errors.decode("utf-8", "replace")}
class HTTPSRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        value = urllib.parse.urlsplit(newurl)
        check(value.scheme == "https" and not value.username and not value.password,
              "The original provider redirected outside HTTPS.")
        return super().redirect_request(request, fp, code, message, headers, newurl)

def receive_one(source, mapping, root, pdfinfo, state):
    entry = source["entryId"]
    destination = root / checked_member(source["filename"])
    staging = private(root / "pending" / entry)
    request_file, receipt_file = staging / "request.json", staging / "complete.json"
    identity = source_identity(source)
    request = optional(request_file)
    if request:
        check(request["source"] == identity and request["operation"] == OPERATION,
              "Continue the same original source request.")
    else:
        request = {"schema": "commons.mtc-original-request.v1", "operation": OPERATION,
                   "id": "mtc-original-" + sha((OPERATION + "\n" + entry).encode())[:48],
                   "source": identity, "createdAt": now(), "attempts": []}
        atomic(request_file, request)
    complete = optional(receipt_file)
    partial = staging / "original.partial"
    if complete:
        check(complete["source"] == identity and complete["requestId"] == request["id"],
              "The retained receiving receipt belongs to another original.")
        selected = destination if destination.exists() else partial
        body = raw(selected)
        check(len(body) == complete["bytes"] and sha(body) == complete["sha256"],
              "The whole previously received PDF changed.")
        if not destination.exists():
            exact(destination, body)
        return complete
    check(not destination.exists(), "An original PDF exists without its retained request receipt; reconcile it before receiving.")
    # A full body may have reached disk before its completion checkpoint. Validate
    # that exact body first; partial/interrupted bodies retain their own attempt.
    recovered = False
    if partial.exists():
        if partial.stat().st_size == source["bytes"]:
            try:
                validated = validate_pdf(partial, source, pdfinfo)
                recovered = True
            except (ValueError, subprocess.SubprocessError):
                recovered = False
        if not recovered:
            quarantine = staging / ("interrupted-" + str(uuid.uuid4()) + ".partial")
            os.rename(partial, quarantine)
            sync(staging)
    if not recovered:
        selected = mapping.get(source["stableReference"])
        check(selected is not None, "Resolve the exact stable original reference through Notion get_file_download_urls.")
        url = selected["url"]
        parsed = urllib.parse.urlsplit(url)
        check(parsed.scheme == "https" and not parsed.username and not parsed.password and not parsed.fragment,
              "Use the actual complete HTTPS download mapping.")
        attempt = {"number": len(request["attempts"]) + 1, "startedAt": now(),
                   "downloadUrlSha256": sha(url.encode()), "providerHost": parsed.hostname,
                   "mappingExpiry": selected.get("expiry_time"), "status": "STARTED"}
        request["attempts"].append(attempt)
        atomic(request_file, request)
        headers = {"Accept": "application/pdf", "Accept-Encoding": "identity",
                   "User-Agent": "TJLabs-original-MTC-receiving/1"}
        opener = urllib.request.build_opener(HTTPSRedirect())
        try:
            with opener.open(urllib.request.Request(url, headers=headers), timeout=90) as response:
                check(response.status == 200, "The original provider did not return a complete successful file.")
                declared = response.headers.get("Content-Length")
                if declared is not None:
                    check(declared.isdigit() and int(declared) == source["bytes"],
                          "Original provider Content-Length differs from the retained original.")
                coding = response.headers.get("Content-Encoding", "identity").lower()
                check(coding in ("", "identity"), "The original download changed its byte encoding.")
                media = response.headers.get("Content-Type", "")
                check("text/html" not in media.lower() and "application/json" not in media.lower(),
                      "The original provider returned an error representation.")
                attempt["response"] = {"status": response.status,
                    "headers": {key.lower(): response.headers[key] for key in
                                ("Content-Type", "Content-Length", "ETag", "Last-Modified", "Content-Disposition")
                                if response.headers.get(key) is not None},
                    "finalUrlSha256": sha(response.geturl().encode())}
                atomic(request_file, request)
                fd = os.open(partial, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                with os.fdopen(fd, "wb") as stream:
                    total = 0
                    while True:
                        chunk = response.read(65536)
                        if not chunk:
                            break
                        total += len(chunk)
                        check(total <= source["bytes"], "Original download exceeded its retained complete byte count.")
                        stream.write(chunk)
                    stream.flush()
                    os.fsync(stream.fileno())
                check(total == source["bytes"], "Original PDF download ended before the complete byte count.")
            validated = validate_pdf(partial, source, pdfinfo)
            attempt.update({"status": "COMPLETE", "completedAt": now(), "bytes": validated["bytes"],
                            "sha256": validated["sha256"]})
            atomic(request_file, request)
        except BaseException as error:
            attempt.update({"status": "INTERRUPTED", "interruptedAt": now(),
                            "error": {"type": type(error).__name__,
                                      "message": str(error).replace(url, "[private provider URL]")[:2000]}})
            atomic(request_file, request)
            raise
    else:
        attempt = request["attempts"][-1] if request["attempts"] else None
        check(attempt and attempt.get("response", {}).get("status") == 200,
              "The complete staged source lacks its original successful response receipt.")
        attempt.update({"status": "COMPLETE", "completedAt": now(), "recoveredCompleteBody": True,
                        "bytes": validated["bytes"], "sha256": validated["sha256"]})
        atomic(request_file, request)
    complete = {"schema": "commons.mtc-original-file.v1", "operation": OPERATION, "requestId": request["id"],
                "source": identity, "path": str(destination), "receivedAt": attempt["startedAt"],
                "bytes": validated["bytes"], "sha256": validated["sha256"], "pages": validated["pages"],
                "pdfinfo": validated["pdfinfo"], "pdfinfoStderr": validated["pdfinfoStderr"],
                "provider": attempt["response"], "downloadUrlSha256": attempt["downloadUrlSha256"]}
    atomic(receipt_file, complete)
    exact(destination, raw(partial))
    return complete

def render_original(source, complete, root, pdftoppm, pdftotext):
    directory = root / "rendered" / source["entryId"]
    manifest_file = directory / "rendering.json"
    if directory.exists():
        saved = optional(manifest_file)
        check(saved and saved["sourceSha256"] == complete["sha256"], "The original PDF render selection changed.")
        for file in saved["files"]:
            body = raw(directory / checked_member(file["name"]))
            check(len(body) == file["bytes"] and sha(body) == file["sha256"], "A retained PDF view changed.")
        return saved
    parent = private(root / "rendered")
    stage = private(parent / ("stage-" + source["entryId"] + "-" + str(uuid.uuid4())))
    pdf = pathlib.Path(complete["path"])
    output, errors = command(pdftotext, ["-layout", "-enc", "UTF-8", pdf, stage / "original.txt"])
    command(pdftoppm, ["-png", "-r", "110", pdf, stage / "page"], timeout=180)
    pages = sorted(stage.glob("page-*.png"))
    check(len(pages) == complete["pages"], "Render every page of the complete original PDF.")
    records = []
    for path in [stage / "original.txt", *pages]:
        body = raw(path)
        if path.suffix == ".png":
            check(body.startswith(b"\x89PNG\r\n\x1a\n"), "The native original PDF page did not render as PNG.")
        records.append({"name": path.name, "bytes": len(body), "sha256": sha(body)})
        os.chmod(path, 0o600)
    saved = {"schema": "commons.mtc-original-pdf-rendering.v1", "sourceSha256": complete["sha256"],
             "sourceEntryId": source["entryId"], "pages": complete["pages"], "renderedAt": now(),
             "tools": {"pdftoppm": str(shutil.which(pdftoppm) or pdftoppm),
                       "pdftotext": str(shutil.which(pdftotext) or pdftotext)},
             "files": records, "producerViewed": False}
    atomic(stage / "rendering.json", saved)
    os.rename(stage, directory)
    sync(parent)
    return saved

def run(options):
    root = private(options.directory)
    source_bytes = raw(pathlib.Path(options.catalogue_input).absolute())
    selection = json.loads(source_bytes)
    check(selection.get("schema") == "commons.mtc-catalogue-import.v1" and selection.get("operation") == OPERATION,
          "Use the exact original MTC source catalogue.")
    sources = selection["sources"]
    check(len(sources) == 3 and len({item["entryId"] for item in sources}) == 3,
          "Keep all three complete original source representations.")
    pdfs = [item for item in sources if item["contentType"] == "application/pdf"]
    check({item["entryId"] for item in pdfs} == set(PDF_PAGES), "Keep both original MTC PDF identities.")
    check(len({item["filename"] for item in sources}) == 3, "Keep distinct original source filenames.")
    for source in sources:
        checked_member(source["filename"])
        check(source["bytes"] > 0 and source["stableReference"].startswith("notion-file-block://"),
              "Keep the exact original source size and stable provider reference.")
    mapping_raw = raw(pathlib.Path(options.download_map).absolute())
    mapping_value = json.loads(mapping_raw)
    check(not mapping_value.get("unresolved"), "Resolve every selected original provider file.")
    mapping = {}
    for entry in mapping_value.get("files", []):
        check(entry["reference"] not in mapping, "The original download mapping repeats a stable reference.")
        mapping[entry["reference"]] = entry
    check(set(mapping) == {item["stableReference"] for item in pdfs},
          "Use a fresh exact two-file provider download mapping.")
    identity = {"operation": OPERATION, "catalogueSha256": sha(source_bytes),
                "sources": [source_identity(item) for item in sources]}
    with os.fdopen(os.open(root / "operation.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600), "a+b") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        state_file = root / "receiving.json"
        state = optional(state_file)
        if state:
            check(state["schema"] == SCHEMA and state["identity"] == identity, "Continue this original MTC receiving selection.")
        else:
            state = {"schema": SCHEMA, "identity": identity, "startedAt": now(), "status": "RECEIVING", "files": []}
            atomic(state_file, state)
        result_file = root / "receiving-result.json"
        completed = optional(result_file)
        if completed:
            check(completed["identity"] == identity and completed["status"] == "COMPLETE",
                  "The retained complete receiving result changed.")
            for file in completed["files"]:
                body = raw(root / file["source"]["filename"])
                check(len(body) == file["bytes"] and sha(body) == file["sha256"], "A complete original file changed.")
            for rendered in completed["renderings"]:
                for file in rendered["files"]:
                    body = raw(root / "rendered" / rendered["sourceEntryId"] / file["name"])
                    check(len(body) == file["bytes"] and sha(body) == file["sha256"], "A retained original page view changed.")
            return completed
        exact(root / "catalogue-input.json", source_bytes)
        try:
            records = []
            for source in pdfs:
                record = receive_one(source, mapping, root, options.pdfinfo, state)
                records.append(record)
                state["files"] = records
                atomic(state_file, state)
            table = next(item for item in sources if item["contentType"] == "application/json")
            check(table["filename"] == TABLE and table["bytes"] == 3946 and table["sha256"] == TABLE_SHA,
                  "Keep the original complete source-labelled table identity.")
            table_bytes = raw(pathlib.Path(options.catalogue_input).absolute().parent / TABLE)
            check(len(table_bytes) == table["bytes"] and sha(table_bytes) == TABLE_SHA,
                  "The original complete Table1 body changed.")
            json.loads(table_bytes.decode("utf-8"))
            exact(root / TABLE, table_bytes)
            records.append({"schema": "commons.mtc-original-file.v1", "operation": OPERATION,
                            "source": source_identity(table), "path": str(root / TABLE),
                            "bytes": len(table_bytes), "sha256": sha(table_bytes),
                            "representation": "COMPLETE_RETAINED_SOURCE_LABELLED_TRANSCRIPTION"})
            renderings = [render_original(source, record, root, options.pdftoppm, options.pdftotext)
                          for source, record in zip(pdfs, records)]
            result = {"schema": SCHEMA, "identity": identity, "status": "COMPLETE",
                      "startedAt": state["startedAt"], "completedAt": now(), "files": records,
                      "renderings": renderings, "producerViewRequired": True,
                      "originalsDirectory": str(root)}
            exact(result_file, (json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode())
            state.update({"status": "COMPLETE", "files": records, "completedAt": result["completedAt"],
                          "result": descriptor(result_file)})
            state.pop("error", None)
            atomic(state_file, state)
            return result
        except BaseException as error:
            state.update({"status": "INTERRUPTED", "interruptedAt": now(),
                          "error": {"type": type(error).__name__, "message": safe_error(error, mapping)}})
            atomic(state_file, state)
            raise RuntimeError(state["error"]["message"]) from None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalogue-input", required=True)
    parser.add_argument("--download-map", required=True)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--pdfinfo", default="pdfinfo")
    parser.add_argument("--pdftoppm", default="pdftoppm")
    parser.add_argument("--pdftotext", default="pdftotext")
    options = parser.parse_args()
    result = run(options)
    print(json.dumps({"operation": OPERATION, "status": result["status"],
                      "result": str(pathlib.Path(options.directory).absolute() / "receiving-result.json"),
                      "files": [{"filename": item["source"]["filename"], "bytes": item["bytes"],
                                 "sha256": item["sha256"]} for item in result["files"]],
                      "renderedPages": sum(item["pages"] for item in result["renderings"])}, ensure_ascii=False))

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"operation": OPERATION, "status": "INTERRUPTED",
                          "error": {"type": type(error).__name__, "message": str(error)[:2000]}}), file=sys.stderr)
        raise SystemExit(1)
