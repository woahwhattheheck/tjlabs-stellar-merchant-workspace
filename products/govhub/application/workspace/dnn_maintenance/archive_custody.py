"""Retain exact historical handovers as flat, shared ZIP byte parts."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import tempfile
import zipfile

from .model import SHA, canonical, ordinary

SCHEMA = "commons.dnn-handoff-parts/v1"
PART_BYTES = 1024 * 1024
MAX_BYTES = 512 * 1024**3
MAX_PARTS = 1000000

def _delivery():
    from . import delivery
    return delivery

def _directory(path):
    path = Path(path)
    if path.is_symlink():
        raise ValueError("The retained handover store must be a private regular directory.")
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not path.is_dir():
        raise ValueError("The retained handover store is unavailable.")
    return path

def _identity(record, workspace_id):
    sha, size, name = record.get("archive_sha256"), record.get("bytes"), record.get("filename")
    if not SHA.fullmatch(str(sha or "")) or type(size) is not int or not 0 < size <= MAX_BYTES:
        raise ValueError("The original handover has no valid complete byte identity.")
    if not isinstance(name, str) or ordinary(name) != name or "/" in name or not name.endswith(".zip"):
        raise ValueError("Use the original handover's plain ZIP filename.")
    if record.get("operation", {}).get("workspace_id") != workspace_id:
        raise ValueError("The retained handover belongs to another original workspace.")
    return sha, size, name

def _publish_bytes(path, body, expected):
    d = _delivery()
    path = Path(path)
    _directory(path.parent)
    if path.exists():
        if d.file_hash(d.regular(path)) != expected:
            raise ValueError("A different original part occupies the retained handover path.")
        return path
    descriptor, pending = tempfile.mkstemp(prefix=path.name + ".", suffix=".pending", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as target:
            target.write(body)
            target.flush()
            os.fsync(target.fileno())
        try:
            os.link(pending, path)
        except FileExistsError:
            if d.file_hash(d.regular(path)) != expected:
                raise ValueError("The concurrent retained handover part differs.")
        d.sync_dir(path.parent)
    finally:
        Path(pending).unlink(missing_ok=True)
    return path

def retain_archive(directory, path, record, workspace_id):
    """Split the original bytes at ZIP headers/data boundaries; never re-compress them."""
    d = _delivery()
    directory, path = _directory(directory), d.regular(path)
    expected, total, name = _identity(record, workspace_id)
    recipe_path = directory / "recipes" / (expected + ".json")
    if recipe_path.exists():
        return verify_recipe(directory, record, workspace_id)
    before = path.stat()
    if before.st_size != total:
        raise ValueError("The retained handover length differs from its saved record.")
    intervals = []
    with zipfile.ZipFile(path) as archive, path.open("rb") as original:
        infos = sorted(archive.infolist(), key=lambda item: item.header_offset)
        cursor = 0
        for index, item in enumerate(infos):
            start = item.header_offset
            next_start = infos[index + 1].header_offset if index + 1 < len(infos) else archive.start_dir
            if start < cursor or start < 0 or next_start > total:
                raise ValueError("The original ZIP member offsets overlap.")
            if start > cursor:
                intervals.append((cursor, start))
            original.seek(start)
            header = original.read(30)
            if len(header) != 30 or header[:4] != b"PK\x03\x04":
                raise ValueError("The original ZIP local header is incomplete.")
            name_bytes, extra_bytes = struct.unpack_from("<HH", header, 26)
            data_start = start + 30 + name_bytes + extra_bytes
            data_end = data_start + item.compress_size
            if not start < data_start <= data_end <= next_start:
                raise ValueError("The original ZIP compressed member has invalid bounds.")
            intervals.extend(((start, data_start), (data_start, data_end), (data_end, next_start)))
            cursor = next_start
        if cursor > total:
            raise ValueError("The original ZIP directory exceeds its recorded bytes.")
        intervals.append((cursor, total))
    parts, whole, seen = [], hashlib.sha256(), 0
    with path.open("rb") as original:
        for begin, end in intervals:
            if begin != seen:
                raise ValueError("The original ZIP byte recipe has a gap.")
            original.seek(begin)
            remaining = end - begin
            while remaining:
                body = original.read(min(PART_BYTES, remaining))
                if not body:
                    raise ValueError("The original ZIP ended during custody.")
                sha = hashlib.sha256(body).hexdigest()
                _publish_bytes(directory / "parts" / sha, body, (sha, len(body)))
                parts.append({"sha256": sha, "bytes": len(body)})
                whole.update(body)
                seen += len(body)
                remaining -= len(body)
        after = os.fstat(original.fileno())
    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns):
        raise ValueError("The original handover changed during custody.")
    if seen != total or whole.hexdigest() != expected or len(parts) > MAX_PARTS:
        raise ValueError("The retained ZIP parts do not reproduce the original handover.")
    recipe = {"schema": SCHEMA, "workspace_id": workspace_id, "filename": name,
              "archive_sha256": expected, "bytes": total, "parts": parts}
    body = canonical(recipe)
    _publish_bytes(recipe_path, body, (hashlib.sha256(body).hexdigest(), len(body)))
    return recipe

def verify_recipe(directory, record, workspace_id):
    d = _delivery()
    directory = Path(directory)
    sha, size, name = _identity(record, workspace_id)
    path = d.regular(directory / "recipes" / (sha + ".json"))
    if path.stat().st_size > 128 * 1024**2:
        raise ValueError("The retained handover recipe exceeds its supported size.")
    recipe = json.loads(path.read_bytes())
    if any(recipe.get(key) != value for key, value in {
            "schema": SCHEMA, "workspace_id": workspace_id, "filename": name,
            "archive_sha256": sha, "bytes": size}.items()):
        raise ValueError("The original handover recipe differs from its saved identity.")
    parts = recipe.get("parts")
    if not isinstance(parts, list) or not 0 < len(parts) <= MAX_PARTS:
        raise ValueError("The original handover recipe has no complete part sequence.")
    whole, count = hashlib.sha256(), 0
    for part in parts:
        if not isinstance(part, dict) or not SHA.fullmatch(str(part.get("sha256", ""))) or (
                type(part.get("bytes")) is not int or not 0 < part["bytes"] <= PART_BYTES):
            raise ValueError("The retained handover part has an invalid identity.")
        source = d.regular(directory / "parts" / part["sha256"])
        if source.stat().st_size != part["bytes"]:
            raise ValueError("The retained handover part length changed.")
        body = source.read_bytes()
        if len(body) != part["bytes"] or hashlib.sha256(body).hexdigest() != part["sha256"]:
            raise ValueError("An original handover part changed.")
        whole.update(body)
        count += len(body)
        if count > size:
            raise ValueError("The original handover part sequence exceeds its length.")
    if count != size or whole.hexdigest() != sha:
        raise ValueError("The handover recipe does not reconstruct the original ZIP bytes.")
    return recipe

def export_entries(entries, directory, records, workspace_id):
    """Include each referenced historical part once, outside the workspace snapshot."""
    directory = Path(directory)
    for record in records:
        sha, _, name = _identity(record, workspace_id)
        if not (directory / "recipes" / (sha + ".json")).exists():
            retain_archive(directory, directory / name, record, workspace_id)
        recipe = verify_recipe(directory, record, workspace_id)
        entries["handover/recipes/" + sha + ".json"] = directory / "recipes" / (sha + ".json")
        for part in recipe["parts"]:
            entries["handover/parts/" + part["sha256"]] = directory / "parts" / part["sha256"]

def restore_entries(source, destination, records, workspace_id):
    """Adopt verified flat custody before exposing a restored workspace."""
    d = _delivery()
    source, destination = Path(source), _directory(destination)
    for record in records:
        recipe = verify_recipe(source, record, workspace_id)
        paths = [("recipes", recipe["archive_sha256"] + ".json")]
        paths.extend(("parts", part["sha256"]) for part in recipe["parts"])
        for group, name in paths:
            original = d.regular(source / group / name)
            target = _directory(destination / group) / name
            expected = d.file_hash(original)
            if target.exists():
                if d.file_hash(d.regular(target)) != expected:
                    raise ValueError("A different original handover occupies the receiving store.")
                continue
            try:
                os.link(original, target)
            except FileExistsError:
                if d.file_hash(d.regular(target)) != expected:
                    raise ValueError("The concurrent receiving handover part differs.")
            d.sync_dir(target.parent)

def reopen_archive(directory, record, workspace_id):
    d = _delivery()
    directory = _directory(directory)
    sha, size, name = _identity(record, workspace_id)
    target = directory / name
    if target.exists():
        if d.file_hash(d.regular(target)) != (sha, size):
            raise ValueError("The saved handover download differs from its original record.")
        return target
    recipe = verify_recipe(directory, record, workspace_id)
    descriptor, pending = tempfile.mkstemp(prefix=name + ".", suffix=".pending", dir=directory)
    try:
        whole, count = hashlib.sha256(), 0
        with os.fdopen(descriptor, "wb") as output:
            for part in recipe["parts"]:
                source = d.regular(directory / "parts" / part["sha256"])
                if source.stat().st_size != part["bytes"]:
                    raise ValueError("The retained handover part length changed during reconstruction.")
                body = source.read_bytes()
                if len(body) != part["bytes"] or hashlib.sha256(body).hexdigest() != part["sha256"]:
                    raise ValueError("A retained handover part changed during reconstruction.")
                output.write(body)
                whole.update(body)
                count += len(body)
            output.flush()
            os.fsync(output.fileno())
        if count != size or whole.hexdigest() != sha:
            raise ValueError("The reopened download differs from the complete original handover.")
        try:
            os.link(pending, target)
        except FileExistsError:
            if d.file_hash(d.regular(target)) != (sha, size):
                raise ValueError("A different download occupies the original handover name.")
        d.sync_dir(directory)
    finally:
        Path(pending).unlink(missing_ok=True)
    return target
