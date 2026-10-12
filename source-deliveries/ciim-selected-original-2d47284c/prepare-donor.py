#!/usr/bin/env python3
"""Reassemble the pinned CIIM source donor for the original Git-object receiver."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

SOURCE_COMMIT = "2d47284c866c8d5fdd6b21c8ca49d0bcc3e80e43"
ARCHIVE_SHA256 = "77f20666d4dfa88ad1d92e12f87aad42826c444cf69ec3ab757885031c29ed69"

def fetch(url, maximum):
    with urlopen(Request(url, headers={"User-Agent": "CIIM-original-source-receiving"}), timeout=60) as response:
        data = response.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError("Source carrier exceeds its retained length")
    return data

def check(data, record):
    if len(data) != record["bytes"] or hashlib.sha256(data).hexdigest() != record["sha256"]:
        raise ValueError("Original source carrier identity differs")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", required=True, help="Immutable raw Git URL of source-index.json")
    parser.add_argument("--output", required=True, help="Absolute donor archive path")
    args = parser.parse_args()
    source_url = urlparse(args.index)
    if source_url.scheme != "https" or source_url.netloc != "raw.githubusercontent.com":
        raise ValueError("Use the pinned raw Git source index URL")
    index = json.loads(fetch(args.index, 1024 * 1024))
    if index["sourceCommit"] != SOURCE_COMMIT or index["selectedFiles"] != 323 or index["selectedBytes"] != 4064047:
        raise ValueError("Original CIIM selected source differs")
    archive = index["archive"]
    if archive["sha256"] != ARCHIVE_SHA256:
        raise ValueError("Original donor archive digest differs")
    parts = []
    for record in archive["parts"]:
        if Path(record["name"]).name != record["name"]:
            raise ValueError("Carrier part must remain beside the original index")
        data = fetch(urljoin(args.index, record["name"]), record["bytes"])
        check(data, record)
        parts.append(data)
    encoded = b"".join(parts)
    if len(encoded) != archive["encodedBytes"]:
        raise ValueError("Complete source encoding length differs")
    data = base64.b64decode(encoded, validate=True)
    check(data, archive)
    output = Path(args.output)
    if not output.is_absolute() or output.is_symlink():
        raise ValueError("Use an absolute ordinary donor archive path")
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        if not output.is_file():
            raise ValueError("Existing donor target is not a regular file")
        check(output.read_bytes(), archive)
    else:
        with output.open("xb") as stream:
            stream.write(data)
    print(json.dumps({"sourceCommit": SOURCE_COMMIT, "selectedFiles": 323, "selectedBytes": 4064047,
                      "archive": str(output.resolve()), "archiveBytes": len(data),
                      "archiveSha256": ARCHIVE_SHA256}, separators=(",", ":")))

if __name__ == "__main__":
    main()
