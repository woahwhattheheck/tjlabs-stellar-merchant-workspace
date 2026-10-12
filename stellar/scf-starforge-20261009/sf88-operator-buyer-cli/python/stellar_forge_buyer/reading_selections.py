"""Original-byte selections shared by the research desk and reading workspace.

The existing reading workspace owns revisions, retained originals and portable
projects. This module resolves a selected range against its immutable handover
record; it does not create another index or reconstruct a different search.
"""
from __future__ import annotations

import hashlib
import os
import re

from .reading_workspace import ReadingError, HASH, canonical

RANGE_KIND = "source-range"
LINE_CONVENTION = "CRLF_OR_CR_OR_LF"
MAX_RANGE_BYTES = 1024 * 1024


def compact_lineage(record):
    """Keep source identities and annotations without adopting another machine's paths."""
    result, seen = [], set()
    current = record
    for _ in range(64):
        if not isinstance(current, dict):
            break
        origin = current.get("origin")
        if not isinstance(origin, dict):
            break
        source = origin.get("resource")
        if not isinstance(source, dict):
            break
        entry = {key: origin[key] for key in
                 ("manifestSha256", "collectionId", "collectionRevision") if key in origin}
        entry["resource"] = {key: source[key] for key in
            ("id", "sha256", "bytes", "name", "url", "intentId", "inboxId") if key in source}
        annotation = origin.get("annotation")
        if isinstance(annotation, dict):
            entry["annotation"] = {key: annotation[key] for key in
                ("revision", "note", "tags", "starred", "inheritedRevision") if key in annotation}
        marker = canonical(entry)
        if marker in seen:
            raise ReadingError("SOURCE_LINEAGE_CYCLE")
        seen.add(marker)
        result.append(entry)
        current = source
    else:
        raise ReadingError("SOURCE_LINEAGE_DEPTH")
    return result


def handover_summary(record):
    source = record["manifest"]
    query = source["capture"]["query"]
    return {"id": record["id"], "revision": record["revision"], "created": record["created"],
            "name": record["name"], "capture_sha256": source["captureSha256"],
            "query": query, "selected_passages": len(source["capture"]["items"]),
            "source_files": len(source["capture"]["resources"]),
            "collection": source["collection"], "archive": source["sourceArchive"],
            "reading_list_id": record["reading_list_id"]}


def _binding(workspace, item, context):
    citation = item.get("citation")
    if not isinstance(citation, dict) or set(citation) != {"handover_id", "selection_id"}:
        raise ReadingError("READING_CITATION_REQUIRED")
    handover_id, selection_id = citation["handover_id"], citation["selection_id"]
    cache = context.setdefault("handovers", {})
    if handover_id not in cache:
        record = workspace.head("handover", handover_id, revision=1)
        manifest = record["manifest"]
        capture = manifest["capture"]
        cache[handover_id] = (record, {entry["id"]: entry for entry in capture["items"]},
                              {entry["source_id"]: entry for entry in record["resource_mapping"]})
    record, selections, mappings = cache[handover_id]
    selected = selections.get(selection_id)
    if selected is None:
        raise ReadingError("READING_SELECTION_NOT_FOUND")
    mapping = mappings.get(selected["resourceId"])
    if mapping is None or mapping["resource_id"] != item.get("resource_id") or mapping["sha256"] != item.get("sha"):
        raise ReadingError("READING_SOURCE_BINDING")
    for local, original in (("start_byte", "byteStart"), ("end_byte", "byteEnd"),
                             ("digest", "sha256"), ("start_line", "lineStart"), ("end_line", "lineEnd")):
        if local in item and item[local] != selected[original]:
            raise ReadingError("READING_SELECTION_CHANGED")
    if item.get("line_convention", LINE_CONVENTION) != LINE_CONVENTION:
        raise ReadingError("READING_LINE_CONVENTION")
    return selected, mapping, citation


def _line_at(stream, sha, offset, context):
    """Count all original CRLF, CR and LF separators, reusing ascending reads."""
    cursors = context.setdefault("line_cursors", {})
    cursor = cursors.get(sha, {"offset": 0, "line": 1, "cr": False})
    if offset < cursor["offset"]:
        cursor = {"offset": 0, "line": 1, "cr": False}
    stream.seek(cursor["offset"])
    remaining = offset - cursor["offset"]
    while remaining:
        block = stream.read(min(128 * 1024, remaining))
        if not block:
            raise ReadingError("ORIGINAL_SIZE_MISMATCH")
        count = len(re.findall(rb"\r\n|\r|\n", block))
        if cursor["cr"] and block.startswith(b"\n"):
            count -= 1
        cursor["line"] += count
        cursor["cr"] = block.endswith(b"\r")
        cursor["offset"] += len(block)
        remaining -= len(block)
    cursors[sha] = cursor
    return cursor["line"]


def selected_passage(workspace, item, *, context=None):
    """Read either the native segmented passage or its exact imported source span."""
    if not isinstance(item, dict):
        raise ReadingError("INVALID_READING_SELECTION")
    if item.get("selection_kind") != RANGE_KIND:
        if item.get("selection_kind") not in (None, "native-passage"):
            raise ReadingError("READING_SELECTION_KIND")
        return workspace.passage(item["resource_id"], item["ordinal"], expected_sha=item.get("sha"))
    context = context if context is not None else {}
    selected, mapping, citation = _binding(workspace, item, context)
    start, end = selected["byteStart"], selected["byteEnd"]
    if type(start) is not int or type(end) is not int or start < 0 or not start < end or end - start > MAX_RANGE_BYTES:
        raise ReadingError("READING_RANGE_INVALID")
    sha = mapping["sha256"]
    if not isinstance(sha, str) or not HASH.fullmatch(sha):
        raise ReadingError("INVALID_SOURCE_HASH")
    sources = context.setdefault("sources", {})
    if item["resource_id"] not in sources:
        sources[item["resource_id"]] = workspace.source_file(item["resource_id"])
    path, metadata = sources[item["resource_id"]]
    if metadata.get("sha256") != sha or end > metadata.get("bytes", -1):
        raise ReadingError("READING_SOURCE_BINDING")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        before = os.fstat(stream.fileno())
        line_start = _line_at(stream, sha, start, context)
        line_end = _line_at(stream, sha, end, context)
        stream.seek(start)
        raw = stream.read(end - start)
        after = os.fstat(stream.fileno())
    if len(raw) != end - start or hashlib.sha256(raw).hexdigest() != selected["sha256"]:
        raise ReadingError("PASSAGE_HASH_MISMATCH")
    if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
        raise ReadingError("SOURCE_CHANGED")
    if (line_start, line_end) != (selected["lineStart"], selected["lineEnd"]):
        raise ReadingError("READING_LINE_BINDING")
    try:
        body = raw.decode("utf-8", "strict")
    except UnicodeDecodeError as exc:
        raise ReadingError("READING_UTF8_BOUNDARY") from exc
    return {"resource_id": item["resource_id"], "sha": sha, "ordinal": None,
            "selection_kind": RANGE_KIND, "line_convention": LINE_CONVENTION,
            "start_byte": start, "end_byte": end, "start_line": line_start, "end_line": line_end,
            "digest": selected["sha256"], "name": metadata.get("name") or "Source file",
            "citation": dict(citation), "body": body, "has_next": False}


def selection_key(item):
    return (item["resource_id"], item["start_byte"], item["end_byte"], item["digest"])


def list_item(passage, note):
    fields = ("resource_id", "sha", "ordinal", "digest", "start_byte", "end_byte",
              "start_line", "end_line", "name", "selection_kind", "line_convention", "citation")
    return {key: passage[key] for key in fields if key in passage} | {"note": note}


def validate_handover_records(workspace):
    """Recheck every retained handover and every saved list revision after receiving."""
    with workspace._db() as db:
        records = [__import__("json").loads(row[0]) for row in
                   db.execute("SELECT payload FROM revisions WHERE kind='handover' ORDER BY id,revision")]
        lists = [__import__("json").loads(row[0]) for row in
                 db.execute("SELECT payload FROM revisions WHERE kind='list' ORDER BY id,revision")]
    from .reading_exchange import validate_manifest
    for record in records:
        if record.get("revision") != 1:
            raise ReadingError("READING_HANDOVER_IMMUTABLE")
        validate_manifest(record["manifest"])
    context = {}
    for record in lists:
        for item in record["items"]:
            actual = selected_passage(workspace, item, context=context)
            if any(actual[key] != item[key] for key in
                   ("sha", "digest", "start_byte", "end_byte", "start_line", "end_line")):
                raise ReadingError("PROJECT_SELECTION")
