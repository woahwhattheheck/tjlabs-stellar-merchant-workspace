#!/usr/bin/env python3
"""Receive the two original CanadaBuys CSV sources into the existing source operation."""
import argparse
import csv
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from urllib.request import Request, urlopen

OPERATION = "SCF-CANADABUYS-PROCUREMENT-9FCD-20261012"
HERE = Path(__file__).resolve().parent

def now():
    return datetime.now(timezone.utc).isoformat()

def digest_file(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(part)
    return result.hexdigest()

def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".writing")
    with temporary.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)

def inspect_csv(path, selected, dictionary):
    csv.field_size_limit(min(sys.maxsize, 2**63 - 1))
    count, malformed, blank = 0, [], 0
    sample, score = None, -1
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = csv.reader(stream, strict=True)
        headers = next(rows)
        if len(headers) != len(set(headers)):
            raise ValueError("The original CSV contains repeated column labels.")
        missing = sorted(set(selected["required_identifiers"]) - set(headers))
        if missing:
            raise ValueError("The original CSV is missing expected identifiers: " + repr(missing))
        for row in rows:
            if not row:
                blank += 1
                continue
            count += 1
            if len(row) != len(headers):
                if len(malformed) < 20:
                    malformed.append({"record": count, "columns": len(row)})
                continue
            value = dict(zip(headers, row))
            current = sum(bool(value.get(name)) for name in selected["sample_identifiers"])
            if current > score:
                score, sample = current, {"record": count, "values": value}
    if malformed:
        raise ValueError("The original CSV has column-count differences: " + repr(malformed))
    return {
        "records": count, "columns": headers, "column_count": len(headers),
        "blank_records": blank, "sample": sample,
        "dictionary_labels": dictionary,
        "columns_outside_dictionary": sorted(set(headers) - set(dictionary)),
        "text_encoding": "utf-8-sig", "numeric_values": "original strings",
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True, help="The original private CanadaBuys source-operation directory.")
    args = parser.parse_args()
    os.umask(0o077)
    root = Path(args.directory).expanduser().absolute()
    root.mkdir(parents=True, exist_ok=True)
    if root.resolve() != root:
        raise ValueError("Use the original ordinary absolute source directory.")
    originals = root / "originals"
    originals.mkdir(exist_ok=True)
    contract = json.loads((HERE / "source-contract.json").read_text(encoding="utf-8"))
    manifest = json.loads((HERE / "source-manifest.json").read_text(encoding="utf-8"))
    for item in manifest["files"]:
        source = HERE / item["path"]
        if source.stat().st_size != item["bytes"] or digest_file(source) != item["sha256"]:
            raise ValueError("The selected issuer source differs: " + item["path"])
        destination = root / "issuer" / item["path"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            if digest_file(destination) != item["sha256"]:
                raise ValueError("Preserve the earlier different source: " + str(destination))
        else:
            shutil.copyfile(source, destination)
    state_path = root / "source-receiving.json"
    if state_path.exists():
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if state.get("schema") != "commons.canadabuys.original-source-receiving.v1" or state.get("operation_id") != OPERATION:
            raise ValueError("Keep the original CanadaBuys source operation.")
    else:
        state = {"schema": "commons.canadabuys.original-source-receiving.v1",
                 "operation_id": OPERATION, "started_at": now(), "sources": {}}
    for selected in contract["requested_csv_inputs"]:
        name = selected["id"]
        prior = state["sources"].get(name)
        if prior and prior.get("status") == "COMPLETE":
            if prior["requested_url"] != selected["url"]:
                raise ValueError("Preserve the earlier selected source URL.")
            for key in ["response_body", "csv"]:
                saved = prior[key]
                path = root / saved["path"]
                if path.stat().st_size != saved["bytes"] or digest_file(path) != saved["sha256"]:
                    raise ValueError("Restore the complete retained original: " + saved["path"])
            print(json.dumps({"source": name, "status": "REUSED", "records": prior["csv"]["records"]}), flush=True)
            continue
        record = dict(prior or {})
        record.update(status="RECEIVING", requested_url=selected["url"])
        record.setdefault("started_at", now())
        record.pop("error", None)
        state["sources"][name] = record
        write_json(state_path, state)
        body_path = originals / (name + ".http-body")
        csv_path = originals / (name + ".csv")
        response_hash, size = hashlib.sha256(), 0
        temporary = None
        try:
            retained = record.get("response_body")
            if retained:
                if body_path.stat().st_size != retained["bytes"] or digest_file(body_path) != retained["sha256"]:
                    raise ValueError("Restore the complete original response body before continuation.")
                encoding = retained["content_encoding"]
            else:
                request = Request(selected["url"], headers={
                    "User-Agent": "CanadaBuys-original-source-reader/1.0",
                    "Accept": "text/csv,application/octet-stream;q=0.9,*/*;q=0.1",
                    "Accept-Encoding": "identity",
                })
                with urlopen(request, timeout=90) as response:
                    record.update(final_url=response.geturl(), http_status=response.status,
                                  response_headers=list(response.headers.items()))
                    write_json(state_path, state)
                    with tempfile.NamedTemporaryFile(dir=originals, prefix=name + "-", suffix=".receiving", delete=False) as output:
                        temporary = Path(output.name)
                        for block in iter(lambda: response.read(1024 * 1024), b""):
                            output.write(block)
                            response_hash.update(block)
                            size += len(block)
                        output.flush()
                        os.fsync(output.fileno())
                    length = response.headers.get("Content-Length")
                    if length and int(length) != size:
                        raise ValueError("The original response ended before its declared length.")
                    encoding = response.headers.get("Content-Encoding", "").strip().lower()
                if body_path.exists():
                    if digest_file(body_path) != response_hash.hexdigest():
                        raise ValueError("Keep the earlier different complete response body.")
                    temporary.unlink()
                else:
                    os.replace(temporary, body_path)
                temporary = None
                record["response_body"] = {"path": str(body_path.relative_to(root)),
                                          "bytes": size, "sha256": response_hash.hexdigest(),
                                          "content_encoding": encoding or "identity"}
            write_json(state_path, state)
            if encoding not in ("", "identity", "gzip"):
                raise ValueError("Receive the original Content-Encoding explicitly: " + encoding)
            incoming = gzip.open(body_path, "rb") if encoding == "gzip" else body_path.open("rb")
            decoded_hash = hashlib.sha256()
            with incoming, tempfile.NamedTemporaryFile(dir=originals, prefix=name + "-", suffix=".csv-receiving", delete=False) as output:
                temporary = Path(output.name)
                for block in iter(lambda: incoming.read(1024 * 1024), b""):
                    output.write(block)
                    decoded_hash.update(block)
                output.flush()
                os.fsync(output.fileno())
            if csv_path.exists():
                if digest_file(csv_path) != decoded_hash.hexdigest():
                    raise ValueError("Preserve the different earlier decoded CSV.")
                temporary.unlink()
            else:
                os.replace(temporary, csv_path)
            temporary = None
            labels = contract["dictionaries"][selected["dictionary"]]["labels"]
            observed = inspect_csv(csv_path, selected, labels)
            record["csv"] = {"path": str(csv_path.relative_to(root)),
                             "bytes": csv_path.stat().st_size, "sha256": digest_file(csv_path), **observed}
            record.update(status="COMPLETE", ended_at=now())
            write_json(state_path, state)
            print(json.dumps({"source": name, "status": "COMPLETE", "bytes": record["csv"]["bytes"],
                              "sha256": record["csv"]["sha256"], "records": observed["records"],
                              "columns": observed["column_count"]}), flush=True)
        except Exception as error:
            record.update(status="INCOMPLETE", error=str(error), ended_at=now())
            if temporary:
                record["partial_body"] = str(temporary.relative_to(root))
            write_json(state_path, state)
            raise
    state.update(status="COMPLETE", completed_at=now())
    write_json(state_path, state)
    print(json.dumps({"operation_id": OPERATION, "status": "COMPLETE",
                      "result": str(state_path), "source_directory": str(root),
                      "sources": list(state["sources"])}), flush=True)

if __name__ == "__main__":
    main()
