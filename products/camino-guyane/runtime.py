"""Receive the exact original Camino Analysis runtime and workbook sources.

This module prepares original source files only. AnalysisWorkspace continues to
own imports, queries, reports, workbooks, exports and workspace receiving.
"""
from __future__ import annotations

from contextlib import contextmanager
import fcntl
import gzip
import hashlib
import importlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import tarfile

SOURCE_REF = "c12e248ac955672d9744163aef526d9ea9547692"
RUNTIME_SHA = "6cb9bb2d196d80a4b0c3639076050fed4eb0b91259b5ddff5a6405905fb8a995"
RUNTIME_BYTES = 2176666
ARCHIVE_SHA = "7845ba47fd9952304f55b199118b7daab60127f918c555fd21784ee1569f2a4e"
ARCHIVE_BYTES = 529153
DESCRIPTOR_SHA = "09cb74a1fb7c5b455753d4f59c69dd493044345bbb694d7ea02c11a120a01292"
WORKBOOK_SHA = "fe21c73f6ff95a55d66b30b0f1b773832f75b4ae67ca495ef1c2eebdcc39f01b"
PYTHON_ROOT = "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python"
PARSER = "products/conapi/supplier-report/supplier-report.mjs"
PACKAGES = (
    ("openpyxl", "3.1.5", "openpyxl-3.1.5.tar.gz", 186464,
     "cf0e3cf56142039133628b5acffe8ef0c12bc902d2aadd3e0fe5878dc08d1050"),
    ("et_xmlfile", "2.0.0", "et_xmlfile-2.0.0.tar.gz", 17234,
     "dab3f4764309081ce75662649be815c4c9081e88f0837825f90fd28317d4da54"),
)


class RuntimeSourceError(ValueError):
    pass


def _need(condition, code):
    if not condition:
        raise RuntimeSourceError(code)


def _sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _json(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            _need(key not in result, "RUNTIME_DUPLICATE_JSON_KEY")
            result[key] = value
        return result
    return json.loads(raw.decode("utf-8"), object_pairs_hook=unique,
                      parse_constant=lambda value: (_ for _ in ()).throw(
                          RuntimeSourceError("RUNTIME_NONFINITE_JSON")))


def _encoded(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False,
                       sort_keys=True, indent=2) + "\n").encode("utf-8")


def _regular(path, maximum):
    path = Path(path).expanduser().absolute()
    _need(path.resolve() == path, "RUNTIME_CANONICAL_FILE_REQUIRED")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        _need(stat.S_ISREG(before.st_mode) and before.st_size <= maximum, "RUNTIME_REGULAR_FILE_REQUIRED")
        raw = stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
    current = path.lstat()
    fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
    _need(len(raw) == before.st_size and len(raw) <= maximum
          and all(getattr(before, k) == getattr(after, k) == getattr(current, k)
                  for k in fields), "RUNTIME_INPUT_CHANGED")
    return raw


def _private_directory(path):
    path = Path(path).absolute()
    _need(path.resolve() == path, "RUNTIME_CANONICAL_DIRECTORY_REQUIRED")
    path.mkdir(mode=0o700, exist_ok=True)
    info = path.lstat()
    _need(stat.S_ISDIR(info.st_mode) and not info.st_mode & 0o077,
          "RUNTIME_PRIVATE_DIRECTORY_REQUIRED")
    return path


def _member(value):
    _need(isinstance(value, str) and value and "\\" not in value
          and "\0" not in value, "RUNTIME_MEMBER_INVALID")
    parts = value.split("/")
    _need(not PurePosixPath(value).is_absolute()
          and all(part not in {"", ".", ".."} for part in parts),
          "RUNTIME_MEMBER_INVALID")
    return parts


def _parent(root, relative):
    parts = _member(relative)
    current = root
    for part in parts[:-1]:
        current = _private_directory(current / part)
    return current / parts[-1]


def _sync(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _put(root, relative, raw):
    """Publish one complete original without replacing a conflicting file.

    A link published just before interruption can still share its own receiving
    name. Reconcile that exact inode before returning the original complete file.
    """
    target = _parent(root, relative)
    temporary = target.with_name("." + target.name + ".receiving")
    if target.exists() or target.is_symlink():
        _need(_regular(target, len(raw)) == raw, "RUNTIME_MEMBER_CONFLICT:" + relative)
        target_info = target.lstat()
        _need(not target_info.st_mode & 0o077, "RUNTIME_PRIVATE_MEMBER_REQUIRED")
        if temporary.exists() or temporary.is_symlink():
            partial_info = temporary.lstat()
            _need(stat.S_ISREG(partial_info.st_mode)
                  and not partial_info.st_mode & 0o077,
                  "RUNTIME_PRIVATE_PARTIAL_REQUIRED")
            same_inode = ((target_info.st_dev, target_info.st_ino) ==
                          (partial_info.st_dev, partial_info.st_ino))
            _need((same_inode and target_info.st_nlink == 2)
                  or (not same_inode and partial_info.st_nlink == 1
                      and target_info.st_nlink == 1),
                  "RUNTIME_MEMBER_LINK_CONFLICT")
            temporary.unlink()
            _sync(target.parent)
        _need(target.lstat().st_nlink == 1, "RUNTIME_MEMBER_LINK_CONFLICT")
        return target
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        _need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
              and not info.st_mode & 0o077, "RUNTIME_PRIVATE_PARTIAL_REQUIRED")
        os.ftruncate(fd, 0)
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(fd)
    finally:
        os.close(fd)
    try:
        os.link(temporary, target, follow_symlinks=False)
    except FileExistsError:
        _need(_regular(target, len(raw)) == raw, "RUNTIME_MEMBER_CONFLICT:" + relative)
    temporary.unlink()
    _sync(target.parent)
    _need(target.lstat().st_nlink == 1, "RUNTIME_MEMBER_LINK_CONFLICT")
    return target


@contextmanager
def _receiving_lock(root):
    fd = os.open(root / ".runtime.lock",
                 os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        _need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
              and not info.st_mode & 0o077, "RUNTIME_PRIVATE_LOCK_REQUIRED")
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)


def _receive_package(root, name, version, filename, raw):
    """Retain the whole original tar and extract only original ordinary files."""
    _put(root, "originals/" + filename, raw)
    roots = set()
    selected = {}
    directories = set()
    total = 0
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as archive:
        members = archive.getmembers()
        _need(len(members) <= 4096, "RUNTIME_PACKAGE_MEMBER_LIMIT")
        for member in members:
            relative = member.name.rstrip("/") if member.isdir() else member.name
            parts = _member(relative)
            roots.add(parts[0])
            _need(len(roots) == 1, "RUNTIME_PACKAGE_ROOT_CHANGED")
            _need(member.isdir() or member.isfile(), "RUNTIME_PACKAGE_MEMBER_TYPE")
            if member.isdir():
                _need(relative not in selected, "RUNTIME_PACKAGE_MEMBER_COLLISION")
                directories.add(relative)
                continue
            _need(relative not in selected and relative not in directories,
                  "RUNTIME_PACKAGE_MEMBER_DUPLICATE")
            _need(0 <= member.size <= 8 * 1024 * 1024, "RUNTIME_PACKAGE_MEMBER_SIZE")
            total += member.size
            _need(total <= 32 * 1024 * 1024, "RUNTIME_PACKAGE_TOTAL_SIZE")
            stream = archive.extractfile(member)
            _need(stream is not None, "RUNTIME_PACKAGE_MEMBER_UNREADABLE")
            with stream:
                body = stream.read(member.size + 1)
            _need(len(body) == member.size, "RUNTIME_PACKAGE_MEMBER_TRUNCATED")
            selected[relative] = body
    _need(len(roots) == 1, "RUNTIME_PACKAGE_ROOT_MISSING")
    prefix = next(iter(roots))
    _need(prefix + "/" + name + "/__init__.py" in selected
          and prefix + "/PKG-INFO" in selected, "RUNTIME_PACKAGE_SOURCE_MISSING")
    metadata = selected[prefix + "/PKG-INFO"].decode("utf-8")
    expected_name = name.replace("_", "-")
    fields = {}
    for line in metadata.splitlines():
        if not line:
            break
        if ":" in line:
            key, value = line.split(":", 1)
            fields.setdefault(key, []).append(value.strip())
    actual_name = (fields.get("Name") or [""])[0].replace("_", "-").lower()
    _need(actual_name == expected_name
          and fields.get("Version") == [version], "RUNTIME_PACKAGE_IDENTITY_CHANGED")
    records = []
    for relative, body in sorted(selected.items()):
        target = "packages/" + relative
        _put(root, target, body)
        records.append({"path": target, "bytes": len(body), "sha256": _sha(body)})
    return {"name": name, "version": version, "source_root": "packages/" + prefix,
            "archive": "originals/" + filename, "archive_sha256": _sha(raw),
            "members": records}


def prepare_runtime(directory, *, runtime_archive, runtime_descriptor,
                    workbook_descriptor, package_archives):
    """Receive the fixed source closure; replay completes the same original root.

    package_archives maps the two exact original .tar.gz filenames to existing
    complete local files. No provider fetch, pip install or product run occurs.
    """
    _need(sys.version_info >= (3, 11), "RUNTIME_PYTHON_311_REQUIRED")
    _need(isinstance(package_archives, dict)
          and set(package_archives) == {x[2] for x in PACKAGES},
          "RUNTIME_ORIGINAL_PACKAGE_PAIR_REQUIRED")
    root = _private_directory(Path(directory).expanduser().absolute())
    archive_raw = _regular(runtime_archive, ARCHIVE_BYTES)
    descriptor_raw = _regular(runtime_descriptor, 28690)
    workbook_raw = _regular(workbook_descriptor, 13315)
    _need(len(archive_raw) == ARCHIVE_BYTES and _sha(archive_raw) == ARCHIVE_SHA,
          "RUNTIME_ORIGINAL_ARCHIVE_CHANGED")
    _need(_sha(descriptor_raw) == DESCRIPTOR_SHA
          and _sha(workbook_raw) == WORKBOOK_SHA, "RUNTIME_DESCRIPTOR_CHANGED")
    descriptor = _json(descriptor_raw)
    _json(workbook_raw)
    with gzip.GzipFile(fileobj=io.BytesIO(archive_raw), mode="rb") as stream:
        raw = stream.read(RUNTIME_BYTES + 1)
    _need(len(raw) == RUNTIME_BYTES and _sha(raw) == RUNTIME_SHA,
          "RUNTIME_SOURCE_PACKET_CHANGED")
    packet = _json(raw)
    _need(packet.get("schema") == "commons.camino-analysis-runtime-closure.v1"
          and packet.get("source_ref") == SOURCE_REF
          and len(packet.get("files", [])) == 88, "RUNTIME_SOURCE_SELECTION_CHANGED")
    manifest = {item["path"]: item for item in descriptor["files"]}
    _need(len(manifest) == 88, "RUNTIME_MANIFEST_DUPLICATE")
    contents = {}
    for item in packet["files"]:
        path = item["path"]
        _member(path)
        _need(path not in contents, "RUNTIME_SOURCE_MEMBER_DUPLICATE")
        body = item["content"].encode("utf-8")
        metadata = {key: value for key, value in item.items() if key != "content"}
        _need(metadata == manifest.get(path) and len(body) == item["bytes"]
              and _sha(body) == item["sha256"], "RUNTIME_SOURCE_MEMBER_CHANGED:" + path)
        contents[path] = body
    _need(set(contents) == set(manifest), "RUNTIME_SOURCE_MEMBERS_CHANGED")
    inputs = {"schema": "commons.camino-runtime-selection.v1",
              "source_ref": SOURCE_REF, "source_sha256": RUNTIME_SHA,
              "archive_sha256": ARCHIVE_SHA,
              "descriptor_sha256": DESCRIPTOR_SHA, "workbook_descriptor_sha256": WORKBOOK_SHA,
              "packages": [{"name": name, "version": version, "filename": filename,
                            "bytes": size, "sha256": digest}
                           for name, version, filename, size, digest in PACKAGES]}
    with _receiving_lock(root):
        reused = (root / "runtime.json").is_file()
        _put(root, "selection.json", _encoded(inputs))
        _put(root, "originals/runtime-source.json.gz", archive_raw)
        _put(root, "originals/runtime-source.json", descriptor_raw)
        _put(root, "originals/workbook-runtime.json", workbook_raw)
        for path, body in sorted(contents.items()):
            _put(root, "source/" + path, body)
        packages = []
        for name, version, filename, size, digest in PACKAGES:
            package_raw = _regular(package_archives[filename], size)
            _need(len(package_raw) == size and _sha(package_raw) == digest,
                  "RUNTIME_ORIGINAL_PACKAGE_CHANGED:" + name)
            packages.append(_receive_package(root, name, version, filename, package_raw))
        receipt = {"schema": "commons.camino-prepared-runtime.v1",
                   "selection": inputs, "source_root": "source",
                   "python_root": "source/" + PYTHON_ROOT,
                   "parser": "source/" + PARSER,
                   "parser_sha256": manifest[PARSER]["sha256"],
                   "source_members": descriptor["files"], "packages": packages}
        _put(root, "runtime.json", _encoded(receipt))
    return {"directory": str(root), "source_ref": SOURCE_REF,
            "source_root": str(root / "source"), "python_root": str(root / "source" / PYTHON_ROOT),
            "parser": str(root / "source" / PARSER), "parser_sha256": receipt["parser_sha256"],
            "package_roots": {item["name"]: str(root / item["source_root"]) for item in packages},
            "receipt_file": str(root / "runtime.json"), "reused": reused}


def activate_runtime(prepared):
    """Bind this Python process to the received original sources before import."""
    root = _private_directory(Path(prepared["directory"]))
    # Reopen all original bytes before importing: a retained receipt alone does
    # not establish the current extracted modules or parser are still selected.
    reopened = prepare_runtime(
        root, runtime_archive=root / "originals/runtime-source.json.gz",
        runtime_descriptor=root / "originals/runtime-source.json",
        workbook_descriptor=root / "originals/workbook-runtime.json",
        package_archives={item[2]: root / "originals" / item[2] for item in PACKAGES})
    for field in ("directory", "source_ref", "source_root", "python_root", "parser",
                  "parser_sha256", "package_roots", "receipt_file"):
        _need(prepared.get(field) == reopened[field],
              "RUNTIME_PREPARED_BINDING_CHANGED:" + field)
    receipt = _json(_regular(root / "runtime.json", 4 * 1024 * 1024))
    python_root = (root / receipt["python_root"]).resolve()
    _need(python_root == Path(prepared["python_root"]).resolve(),
          "RUNTIME_PYTHON_BINDING_CHANGED")
    package_roots = {item["name"]: (root / item["source_root"]).resolve()
                     for item in receipt["packages"]}
    import_roots = {"stellar_forge_buyer": python_root, **package_roots}
    for module_name, existing in list(sys.modules.items()):
        family = module_name.split(".", 1)[0]
        if family in import_roots and existing is not None:
            module_file = getattr(existing, "__file__", None)
            _need(module_file is not None
                  and Path(module_file).resolve().is_relative_to(import_roots[family]),
                  "RUNTIME_MODULE_ALREADY_IMPORTED:" + module_name)
    for name, package_root in package_roots.items():
        existing = sys.modules.get(name)
        if existing is not None:
            _need(Path(existing.__file__).resolve().is_relative_to(package_root),
                  "RUNTIME_PACKAGE_ALREADY_IMPORTED:" + name)
    for path in [python_root, *package_roots.values()]:
        value = str(path)
        if value not in sys.path:
            sys.path.insert(0, value)
    loaded = []
    for name, version, _, _, _ in reversed(PACKAGES):
        module = importlib.import_module(name)
        module_file = Path(module.__file__).resolve()
        _need(str(getattr(module, "__version__", "")) == version
              and module_file.is_relative_to(package_roots[name]),
              "RUNTIME_IMPORTED_PACKAGE_CHANGED:" + name)
        loaded.append({"name": name, "version": version, "file": str(module_file)})
    binding = {"schema": "commons.camino-runtime-binding.v1",
               "source_ref": SOURCE_REF, "runtime_directory": str(root),
               "python_executable": sys.executable, "python_version": sys.version,
               "python_root": str(python_root), "packages": loaded}
    raw = _encoded(binding)
    with _receiving_lock(root):
        path = _put(root, "bindings/" + _sha(raw) + ".json", raw)
    return {**binding, "binding_file": str(path)}
