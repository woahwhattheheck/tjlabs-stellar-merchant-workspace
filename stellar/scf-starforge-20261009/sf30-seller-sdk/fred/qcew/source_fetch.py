#!/usr/bin/env python3
"""Acquire complete original BLS QCEW area members for one retained production operation.
Standard-library only. Reuses saved complete members and performs read-only HTTPS requests.
"""
import argparse, base64, collections, csv, datetime, fcntl, gzip, hashlib, io, json, os
import pathlib, re, shutil, sys, tempfile, time, urllib.error, urllib.request, zipfile
SCHEMA = "stellar-forge.qcew-original-intake.v1"
MAX_MEMBER = 64 * 1024 * 1024
MAX_ARCHIVE = 1024 * 1024 * 1024
AREAS = ["06001","06013","06041","06055","06075","06081","06085","06095","06097","06000","US000"]
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
def digest(data): return hashlib.sha256(data).hexdigest()
def emit(value): print(json.dumps(value, separators=(",", ":")), flush=True)
def atomic(path, data):
    path = pathlib.Path(path)
    fd, temporary = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as output:
            output.write(data); output.flush(); os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)
def save_json(path, value): atomic(path, (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode())
def fetch(url, headers=None):
    started = now()
    request = urllib.request.Request(url, headers={"User-Agent": "TJLabs-QCEW-Report/1.0 (+https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace)", "Accept-Encoding":"identity", **(headers or {})})
    response = urllib.request.urlopen(request, timeout=90)
    final = response.geturl()
    if not final.startswith("https://data.bls.gov/cew/"):
        response.close(); raise ValueError("Original BLS request redirected outside the official QCEW data host: " + final)
    return response, {"requestedUrl":url,"finalUrl":final,"requestedAt":started,"receivedAt":now(),"status":response.status,"headers":dict(response.headers.items()),"requestHeaders":headers or {}}
def original_summary(raw, area, year):
    body = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(body, newline=""))
    required = {"area_fips","own_code","industry_code","agglvl_code","size_code","year","qtr","disclosure_code","month1_emplvl","month2_emplvl","month3_emplvl","total_qtrly_wages","avg_wkly_wage","qtrly_estabs"}
    columns = reader.fieldnames or []
    establishment_columns = [key for key in ("qtrly_estabs","qtrly_estabs_count") if key in columns]
    if len(establishment_columns) != 1: raise ValueError("Original establishment column is absent or ambiguous")
    establishment = establishment_columns[0]
    mapped_required = (required - {"qtrly_estabs"}) | {establishment}
    if not columns or any(columns.count(key) != 1 for key in mapped_required):
        raise ValueError("Original quarterly QCEW header differs: " + json.dumps({"columns":columns,"required":sorted(mapped_required)}, separators=(",",":")))
    periods, count, unavailable, diagnostic = set(), 0, 0, []
    for row in reader:
        count += 1
        if row.get(None) or any(value is None for value in row.values()): raise ValueError("Original CSV row width differs")
        row["qtrly_estabs"] = row[establishment]
        if row["area_fips"].strip().upper() != area or row["year"].strip() != str(year): raise ValueError("Archive member area/year differs")
        if row["qtr"].strip() not in ("1","2","3","4"): raise ValueError("Expected original quarterly rows")
        periods.add(str(year) + "-Q" + row["qtr"].strip())
        if row["disclosure_code"].strip() == "N": unavailable += 1
        if row["industry_code"].strip() in {"10","1011","1012","1013","1021","1022","1023","1024","1025","1026","1027","1028","1029"} and row["own_code"].strip() in {"0","1","2","3","5"} and row["size_code"].strip() == "0":
            diagnostic.append({key:row[key].strip() for key in required})
    if not count: raise ValueError("Original member is empty")
    return {"columns":reader.fieldnames,"rowCount":count,"withheldRows":unavailable,"periods":sorted(periods),"diagnosticRows":diagnostic}
class RemoteZip(io.RawIOBase):
    """Seekable original HTTP representation with validated byte ranges and a full-file fallback."""
    def __init__(self, url, cache_directory):
        self.url, self.directory, self.position = url, pathlib.Path(cache_directory), 0
        self.total, self.validator, self.receipts, self.local = None, {}, [], None
        self.cache = collections.OrderedDict()
        self._range(0, 0)
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.position
    def seek(self, offset, whence=0):
        target = offset if whence == 0 else self.position + offset if whence == 1 else self.total + offset
        if target < 0: raise ValueError("Negative original ZIP seek")
        self.position = target; return target
    def _range(self, start, end):
        headers = {"Range":"bytes=" + str(start) + "-" + str(end)}
        if self.validator.get("etag") and not self.validator["etag"].startswith("W/"):
            headers["If-Range"] = self.validator["etag"]
        elif self.validator.get("last-modified"): headers["If-Range"] = self.validator["last-modified"]
        response, receipt = fetch(self.url, headers)
        try:
            if response.status == 200:
                for key, value in self.validator.items():
                    if response.headers.get(key) != value: raise ValueError("Original archive validator changed before full-file fallback")
                length = int(response.headers.get("Content-Length", "0"))
                if length and (length > MAX_ARCHIVE or shutil.disk_usage(self.directory).free < length + 32 * 1024 * 1024):
                    raise ValueError("The server requires a full original ZIP and this operation has insufficient archive capacity")
                # The complete fallback is private and unlinked immediately on POSIX.
                # Process death cannot leave a name that rejects the same intake's retry.
                archive = tempfile.TemporaryFile(mode="w+b", prefix=".qcew-archive-", dir=self.directory)
                received, hash_value = 0, hashlib.sha256()
                try:
                    os.fchmod(archive.fileno(), 0o600)
                    while True:
                        block = response.read(1024 * 1024)
                        if not block: break
                        received += len(block)
                        if received > MAX_ARCHIVE: raise ValueError("Original annual ZIP exceeds one GiB")
                        archive.write(block); hash_value.update(block)
                    archive.flush(); os.fsync(archive.fileno())
                    if length and received != length: raise ValueError("Full original ZIP Content-Length differs")
                    if self.total is not None and received != self.total:
                        raise ValueError("Original archive size changed before full-file fallback")
                    self.total = received
                    receipt.update({"completedAt":now(),"bytes":received,"sha256":hash_value.hexdigest(),"mode":"complete_archive"})
                    self.receipts.append(receipt)
                    self.full_sha256 = hash_value.hexdigest()
                    self.validator = {key:response.headers.get(key) for key in ("etag","last-modified") if response.headers.get(key)}
                    archive.seek(start)
                    result = archive.read(end - start + 1)
                    self.local, archive = archive, None
                    return result
                finally:
                    if archive is not None: archive.close()
            if response.status != 206: raise ValueError("Original range response is neither 206 nor a full 200")
            match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", response.headers.get("Content-Range", ""))
            if not match: raise ValueError("Original byte range lacks a complete Content-Range")
            first, last, total = map(int, match.groups())
            if first != start or last != min(end, total - 1) or not (0 < total <= MAX_ARCHIVE):
                raise ValueError("Original byte range offsets differ")
            if self.total is not None and self.total != total: raise ValueError("Original archive size changed during intake")
            for key, value in self.validator.items():
                if response.headers.get(key) != value: raise ValueError("Original archive validator changed during intake")
            self.total = total
            self.validator = {key:response.headers.get(key) for key in ("etag","last-modified") if response.headers.get(key)}
            raw = response.read(last - first + 2)
            if len(raw) != last - first + 1: raise ValueError("Original range response length differs")
            receipt.update({"completedAt":now(),"bytes":len(raw),"sha256":digest(raw),"range":{"start":first,"end":last,"total":total},"mode":"archive_range"})
            self.receipts.append(receipt); return raw
        finally: response.close()
    def read(self, size=-1):
        if self.position >= self.total: return b""
        if size < 0: size = self.total - self.position
        size = min(size, self.total - self.position)
        if self.local is not None:
            self.local.seek(self.position); result = self.local.read(size); self.position += len(result); return result
        result = bytearray()
        block_size = 256 * 1024
        while len(result) < size:
            index = self.position // block_size
            start = index * block_size
            if index not in self.cache:
                self.cache[index] = self._range(start, min(self.total - 1, start + block_size - 1))
                if self.local is not None:
                    self.local.seek(self.position)
                    remainder = self.local.read(size - len(result)); result.extend(remainder); self.position += len(remainder); break
            self.cache.move_to_end(index)
            while len(self.cache) > 16: self.cache.popitem(last=False)
            block = self.cache[index]
            offset = self.position - start
            piece = block[offset:offset + size - len(result)]
            if not piece: raise ValueError("Original ZIP range produced no bytes")
            result.extend(piece); self.position += len(piece)
        return bytes(result)
    def close(self):
        if self.local is not None:
            self.local.close()
            self.local = None
        super().close()
def acquire(directory, years, areas):
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(directory, 0o700)
    lock = open(directory / "source.lock", "a+b")
    fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    manifest_path = directory / "source-manifest.json"
    request = {"years":years,"areas":areas,"sourceKind":"current_published_annual_naics_archives","reportPeriods":["2025-Q4","2026-Q1"]}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        if manifest.get("schema") != SCHEMA or manifest.get("request") != request: raise ValueError("Retained source directory belongs to another intake")
        for source in manifest["sources"]:
            packed = (directory / source["file"]).read_bytes()
            raw = gzip.decompress(packed)
            if len(raw) != source["bytes"] or digest(raw) != source["sha256"] or digest(packed) != source["gzipSha256"]: raise ValueError("Retained complete original source changed")
    else:
        manifest = {"schema":SCHEMA,"operation":"NEED-REGIONAL-REPORTS-9B2C-20261012","request":request,"startedAt":now(),"sources":[],"archives":[],"seed":None,"complete":False}
        save_json(manifest_path, manifest)
    if not manifest.get("seed"):
        url = "https://data.bls.gov/cew/data/api/2025/4/area/06075.csv"
        response, receipt = fetch(url)
        try: raw = response.read(MAX_MEMBER + 1)
        finally: response.close()
        if len(raw) > MAX_MEMBER: raise ValueError("Original county slice exceeds capacity")
        expected_seed = os.environ.get("QCEW_EXPECTED_SEED_SHA256")
        if expected_seed and digest(raw) != expected_seed: raise ValueError("The original current seed revision changed from the retained operation; preserve a separate intake before selecting a new revision")
        packed = gzip.compress(raw, mtime=0)
        atomic(directory / "seed-2025-q4-06075.csv.gz", packed)
        summary = original_summary(raw, "06075", 2025)
        receipt.update({"completedAt":now(),"bytes":len(raw),"sha256":digest(raw)})
        manifest["seed"] = {"file":"seed-2025-q4-06075.csv.gz","bytes":len(raw),"sha256":digest(raw),"gzipSha256":digest(packed),"receipt":receipt,**summary}
        save_json(manifest_path, manifest)
        emit({"phase":"seed_complete","directory":str(directory),"file":manifest["seed"]["file"],"bytes":len(raw),"sha256":digest(raw),"columns":summary["columns"],"rows":summary["rowCount"],"diagnosticRows":summary["diagnosticRows"]})
    completed = {entry["year"] for entry in manifest["archives"] if entry.get("complete")}
    for year in years:
        if year in completed:
            emit({"phase":"year_reused","year":year}); continue
        url = "https://data.bls.gov/cew/data/files/" + str(year) + "/csv/" + str(year) + "_qtrly_by_area.zip"
        emit({"phase":"year_start","year":year,"url":url})
        remote = RemoteZip(url, directory)
        try:
            with zipfile.ZipFile(remote) as archive:
                inventory = [{"name":info.filename,"bytes":info.file_size,"compressedBytes":info.compress_size,"crc32":format(info.CRC,"08x"),"compression":info.compress_type,"headerOffset":info.header_offset} for info in archive.infolist()]
                previous = next((item for item in manifest["archives"] if item["year"] == year), None)
                if previous and (previous.get("archiveBytes") != remote.total or previous.get("validator") != remote.validator or previous.get("inventory") != inventory):
                    raise ValueError("The retained original annual archive changed before continuation: " + str(year))
                archive_entry = previous or {"year":year,"sourceUrl":url,"archiveBytes":remote.total,"validator":remote.validator,"complete":False,"selectedMemberCount":0,"inventory":inventory,"requests":[]}
                archive_entry["requests"].extend(remote.receipts)
                remote.receipts.clear()
                manifest["archives"] = [item for item in manifest["archives"] if item["year"] != year] + [archive_entry]
                save_json(manifest_path, manifest)
                retained = []
                for area in areas:
                    candidates = [info for info in archive.infolist() if not info.is_dir() and info.filename.lower().endswith(".csv") and re.search(r"(^|[\s._-])" + re.escape(area) + r"([\s._-]|$)", info.filename, re.I)]
                    if not candidates: raise ValueError("Original annual ZIP has no area member for " + area)
                    for info in candidates:
                        if info.flag_bits & 1 or info.file_size > MAX_MEMBER or info.compress_type not in (0,8): raise ValueError("Original area ZIP member has unsupported size or compression")
                        member_id = digest((url + "\n" + info.filename).encode())[:16]
                        filename = str(year) + "-" + area + "-" + member_id + ".csv.gz"
                        saved = next((item for item in manifest["sources"] + manifest.get("pendingMembers", []) if item["sourceUrl"] == url and item["member"] == info.filename), None)
                        if saved:
                            packed = (directory / saved["file"]).read_bytes()
                            raw = gzip.decompress(packed)
                            if len(raw) != info.file_size or digest(raw) != saved["sha256"] or digest(packed) != saved["gzipSha256"] or format(__import__("zlib").crc32(raw) & 0xffffffff, "08x") != format(info.CRC,"08x"):
                                raise ValueError("Retained original member differs during source continuation")
                        else:
                            with archive.open(info) as source: raw = source.read(MAX_MEMBER + 1)
                            if len(raw) != info.file_size: raise ValueError("Complete original ZIP member length differs")
                            packed = gzip.compress(raw, mtime=0)
                            atomic(directory / filename, packed)
                            pending = {"area":area,"year":year,"file":filename,"bytes":len(raw),"sha256":digest(raw),"gzipBytes":len(packed),"gzipSha256":digest(packed),"sourceUrl":url,"member":info.filename,"memberCrc32":format(info.CRC,"08x"),"memberCompressedBytes":info.compress_size}
                            manifest["pendingMembers"] = [item for item in manifest.get("pendingMembers",[]) if not (item["sourceUrl"] == url and item["member"] == info.filename)] + [pending]
                            archive_entry["requests"].extend(remote.receipts)
                            remote.receipts.clear()
                            save_json(manifest_path, manifest)
                        try:
                            summary = original_summary(raw, area, year)
                        except Exception as error:
                            emit({"phase":"original_member_preserved","year":year,"area":area,"file":filename,"bytes":len(raw),"sha256":digest(raw),"header":next(csv.reader(io.StringIO(raw.decode("utf-8-sig"), newline=""))),"message":str(error)})
                            raise
                        entry = {"area":area,"year":year,"file":filename,"bytes":len(raw),"sha256":digest(raw),"gzipBytes":len(packed),"gzipSha256":digest(packed),"sourceUrl":url,"member":info.filename,"memberCrc32":format(info.CRC,"08x"),"memberCompressedBytes":info.compress_size,"rowCount":summary["rowCount"],"columns":summary["columns"],"periods":summary["periods"],"classification": "NAICS reconstructed from original SIC records" if year <= 2000 else "NAICS"}
                        retained.append(entry)
                        manifest["pendingMembers"] = [item for item in manifest.get("pendingMembers",[]) if not (item["sourceUrl"] == url and item["member"] == info.filename)]
                        manifest["sources"] = [item for item in manifest["sources"] if not (item["sourceUrl"] == url and item["member"] == info.filename)] + [entry]
                        save_json(manifest_path, manifest)
                        emit({"phase":"member_complete","year":year,"area":area,"bytes":len(raw),"gzipBytes":len(packed),"rows":summary["rowCount"],"periods":summary["periods"],"sha256":digest(raw)})
                archive_entry["requests"].extend(remote.receipts)
                remote.receipts.clear()
                archive_entry.update({"complete":True,"selectedMemberCount":len(retained),"completedAt":now()})
                if hasattr(remote,"full_sha256"): archive_entry["archiveSha256"] = remote.full_sha256
                manifest["archives"] = [item for item in manifest["archives"] if item["year"] != year] + [archive_entry]
                save_json(manifest_path, manifest)
                emit({"phase":"year_complete","year":year,"selectedMembers":len(retained),"archiveBytes":remote.total,"requests":len(archive_entry["requests"]),"mode":"complete_archive" if hasattr(remote,"full_sha256") else "validated_ranges"})
        finally: remote.close()
    manifest.update({"complete":True,"completedAt":now(),"originalBytes":sum(source["bytes"] for source in manifest["sources"]),"storedBytes":sum(source["gzipBytes"] for source in manifest["sources"])})
    save_json(manifest_path, manifest)
    emit({"phase":"complete","manifest":str(manifest_path),"members":len(manifest["sources"]),"years":len(manifest["archives"]),"originalBytes":manifest["originalBytes"],"storedBytes":manifest["storedBytes"],"manifestSha256":digest(manifest_path.read_bytes())})
    return manifest
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--years", default="1990:2026")
    parser.add_argument("--areas", default=",".join(AREAS))
    options = parser.parse_args()
    ends = options.years.split(":")
    if len(ends) == 1: years = [int(ends[0])]
    else:
        if len(ends) != 2: raise ValueError("Use YEAR or FIRST:LAST")
        years = list(range(int(ends[0]), int(ends[1]) + 1))
    if not years or min(years) < 1990 or max(years) > 2100: raise ValueError("Choose original NAICS archive years")
    areas = list(dict.fromkeys(options.areas.split(",")))
    if not areas or any(not re.fullmatch(r"(?:US000|\d{5})", area) for area in areas): raise ValueError("Use original BLS area codes")
    acquire(pathlib.Path(options.directory).resolve(), years, areas)
if __name__ == "__main__":
    try: main()
    except Exception as error:
        emit({"phase":"interrupted","errorType":type(error).__name__,"message":str(error),"at":now()})
        raise
