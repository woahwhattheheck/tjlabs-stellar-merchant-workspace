#!/usr/bin/env python3
"""Materialize the fourteen retained official Econsult QCEW CSVs once, with exact recovery."""
import argparse, base64, datetime, fcntl, hashlib, json, os, pathlib, re, stat, tempfile
import urllib.parse, urllib.request

OPERATION = "ECONSULT-REGIONAL-PRODUCTION-9B2C-20261013"
AREAS = {"42101", "42017", "42029", "42045", "42091", "42000", "US000"}
PERIODS = {(2025, 1), (2026, 1)}
MAX_BYTES = 64 * 1024 * 1024

def need(value, message):
    if not value: raise ValueError(message)

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")

def read(path):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        info = os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode) and info.st_size <= MAX_BYTES, "Select a complete ordinary input file.")
        return stream.read(MAX_BYTES + 1)

def directory(path):
    path = pathlib.Path(path).absolute()
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    need(stat.S_ISDIR(info.st_mode) and not path.is_symlink() and info.st_uid == os.getuid()
         and info.st_mode & 0o077 == 0, "Use an owned private directory.")
    return path

def sync(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)

def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

def write(path, raw, exclusive=False):
    fd, temporary = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        if exclusive:
            try: os.link(temporary, path)
            except FileExistsError: need(read(path) == raw, "Retained original bytes changed: " + path.name)
        else:
            os.replace(temporary, path)
        sync(path.parent)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

class HttpsRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        need(urllib.parse.urlsplit(newurl).scheme == "https", "Keep the provider download on HTTPS.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def fetch(url, length):
    parsed = urllib.parse.urlsplit(url)
    need(parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password,
         "Use the actual signed HTTPS download URL returned for the retained file.")
    request = urllib.request.Request(url, headers={"Accept": "text/csv", "User-Agent": "TokenJunkieLabs-original-source-receiving/1"})
    with urllib.request.build_opener(HttpsRedirect()).open(request, timeout=90) as response:
        need(response.status == 200, "The retained provider file did not return HTTP 200.")
        declared = response.headers.get("Content-Length")
        if declared is not None: need(int(declared) == length, "Provider response length differs from its original upload receipt.")
        raw = response.read(length + 1)
    need(len(raw) == length, "The complete retained original byte length differs.")
    return raw

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", required=True, help="Complete published fourteen-file acquisition metadata")
    parser.add_argument("--metadata-sha256", required=True)
    parser.add_argument("--downloads", required=True, help="JSON object mapping original upload filenames to current signed provider URLs")
    parser.add_argument("--directory", required=True)
    args = parser.parse_args()
    metadata_raw = read(args.metadata)
    need(digest(metadata_raw) == args.metadata_sha256, "The complete original acquisition metadata changed.")
    metadata = json.loads(metadata_raw)
    need(metadata["operation"] == OPERATION and metadata["periods"] == ["2025-Q1", "2026-Q1"],
         "Retain this complete original company programme.")
    files = metadata["files"]
    expected = {(year, quarter, area) for year, quarter in PERIODS for area in AREAS}
    keys = [(item["year"], item["quarter"], item["area"]) for item in files]
    need(len(keys) == 14 and set(keys) == expected and len(set(keys)) == len(keys),
         "Retain the complete fourteen-file county/state/national source matrix.")
    filenames = []
    for item in files:
        upload = item["upload"]
        url = "https://data.bls.gov/cew/data/api/%s/%s/area/%s.csv" % (item["year"], item["quarter"], item["area"])
        need(item["source_url"] == url and upload["status"] == "uploaded", "Keep the original official source and uploaded receipt.")
        need(re.fullmatch(r"[a-zA-Z0-9._-]+\.csv", upload["filename"]) and
             isinstance(upload["content_length"], int) and 0 < upload["content_length"] <= MAX_BYTES,
             "Keep the original uploaded CSV filename and complete length.")
        need("csv" in upload["content_type"].lower(), "Keep the original CSV media type.")
        need(re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", upload["file_upload_id"]),
             "Keep the original provider upload identity.")
        filenames.append(upload["filename"])
    need(len(set(filenames)) == len(filenames), "Original filenames must remain unique.")
    downloads = json.loads(read(args.downloads))
    need(isinstance(downloads, dict), "Use a filename-to-signed-URL map from the actual provider response.")
    root = directory(args.directory)
    originals = directory(root / "originals")
    with os.fdopen(os.open(root / "materialize.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600), "a+b") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        write(root / "acquisition-metadata.json", metadata_raw, exclusive=True)
        identity = {"operation": OPERATION, "metadataSha256": args.metadata_sha256}
        state_path = root / "materialization.json"
        state = json.loads(read(state_path)) if state_path.exists() else {"identity": identity, "sources": []}
        need(state["identity"] == identity, "Continue the original retained materialization.")
        saved = {}
        for entry in state["sources"]:
            key = (entry["year"], entry["quarter"], entry["area"])
            need(key in expected and key not in saved, "The materialization source inventory changed.")
            saved[key] = entry
        for item in files:
            key = (item["year"], item["quarter"], item["area"])
            filename = item["upload"]["filename"]
            target = originals / filename
            pending = root / (filename + ".pending.json")
            if key in saved:
                entry = saved[key]
                raw = read(target)
                need(entry["file"] == str(target) and entry["sourceUrl"] == item["source_url"] and
                     entry["receipt"]["upload"] == item["upload"] and
                     len(raw) == item["upload"]["content_length"] and digest(raw) == entry["sha256"],
                     "The retained complete original or its provider receipt changed.")
                if pending.exists():
                    checkpoint = json.loads(read(pending))
                    need(checkpoint["entry"] == entry and base64.b64decode(checkpoint["body"], validate=True) == raw,
                         "The retained pending original changed.")
                    pending.unlink()
                    sync(root)
                continue
            if pending.exists():
                checkpoint = json.loads(read(pending))
                entry = checkpoint["entry"]
                raw = base64.b64decode(checkpoint["body"], validate=True)
            else:
                need(filename in downloads, "Resolve this original provider file's current signed download URL: " + filename)
                raw = fetch(downloads[filename], item["upload"]["content_length"])
                entry = {"year": item["year"], "quarter": item["quarter"], "area": item["area"],
                         "sourceUrl": item["source_url"], "file": str(target), "sha256": digest(raw),
                         "receipt": {"kind": "retained_provider_file", "provider": "Notion",
                                     "sourceUrl": item["source_url"],
                                     "recordedAt": item.get("retrieved_at", metadata["created_at"]),
                                     "upload": item["upload"]}}
                # Save the whole original body and receipt atomically before its named file.
                write(pending, json_bytes({"entry": entry, "body": base64.b64encode(raw).decode("ascii")}))
            need((entry["year"], entry["quarter"], entry["area"]) == key and entry["file"] == str(target) and
                 entry["sourceUrl"] == item["source_url"] and entry["receipt"]["upload"] == item["upload"] and
                 len(raw) == item["upload"]["content_length"] and digest(raw) == entry["sha256"],
                 "The complete original checkpoint differs from the original acquisition.")
            write(target, raw, exclusive=True)
            state["sources"].append(entry)
            write(state_path, json_bytes(state))
            saved[key] = entry
            pending.unlink()
            sync(root)
            print(json.dumps({"phase":"original_materialized", "year":item["year"], "quarter":item["quarter"],
                              "area":item["area"], "bytes":len(raw), "sha256":entry["sha256"]}), flush=True)
        descriptor = {"schema":"stellar-forge.qcew-retained-slices.v1", "operation":OPERATION,
                      "sources":[saved[key] for key in keys]}
        body = json_bytes(descriptor)
        path = root / "received-slices.json"
        write(path, body, exclusive=True)
        print(json.dumps({"phase":"complete", "operation":OPERATION, "members":len(keys),
                          "originalBytes":sum(item["upload"]["content_length"] for item in files),
                          "descriptor":str(path), "descriptorBytes":len(body), "descriptorSha256":digest(body)}), flush=True)

if __name__ == "__main__":
    main()
