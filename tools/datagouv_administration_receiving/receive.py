#!/usr/bin/env python3
"""Receive and preserve the original Data.gouv Linux administration operation."""
import argparse
import ast
import copy
import fcntl
import gzip
import hashlib
import io
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import tempfile
import time
import uuid
import zipfile

HERE = pathlib.Path(__file__).resolve().parent
OPERATION = "DATACTIVIST-LINUX-ADMIN-018A-20261012-01"
INVENTORY = "products/datagouv/application-files.json"
ADMIN = "products/datagouv/admin/publisher_admin.py"
GUIDE = "products/datagouv/ADMINISTRATION.md"
HEX = re.compile(r"[0-9a-f]{64}\Z")
FILE_LIMIT = 128 * 1024 * 1024
CAPSULE_LIMIT = 32 * 1024 * 1024
ARCHIVE_LIMIT = 512 * 1024 * 1024
STATE_SCHEMA = "datagouv.administration-receiver/v1"


class ReceivingError(RuntimeError):
    pass


def require(value, message):
    if not value:
        raise ReceivingError(message)


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()


def encoded(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, indent=2).encode() + b"\n"


def identity(st):
    return st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns


def relative(name):
    require(isinstance(name, str) and name and "\\" not in name and "\x00" not in name,
            "Select a regular relative member name")
    p = pathlib.PurePosixPath(name)
    require(not p.is_absolute() and ".." not in p.parts and str(p) == name and
            all(part not in ("", ".") for part in p.parts), "Invalid relative member: " + name)
    return p


def absolute(value):
    p = pathlib.Path(value)
    require(p.is_absolute() and ".." not in p.parts and str(p) == str(p.absolute()), "Use a normalized absolute path")
    for candidate in (p,) + tuple(p.parents):
        if candidate.exists() or candidate.is_symlink():
            require(not candidate.is_symlink(), "A selected path traverses a symlink: " + str(candidate))
    return p


def regular(path, limit=FILE_LIMIT):
    path = absolute(str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and 0 <= before.st_size <= limit,
                "Expected a bounded regular file: " + str(path))
        chunks, size = [], 0
        while True:
            block = os.read(fd, min(1024 * 1024, limit + 1 - size))
            if not block:
                break
            chunks.append(block)
            size += len(block)
            require(size <= limit, "File exceeded its selected bound")
        require(identity(before) == identity(os.fstat(fd)), "Selected file changed while read")
        return b"".join(chunks)
    finally:
        os.close(fd)


def pin(path, limit=ARCHIVE_LIMIT):
    path = absolute(str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_size <= limit,
                "Expected a bounded regular artifact")
        hashed = hashlib.sha256()
        size = 0
        while True:
            block = os.read(fd, 1024 * 1024)
            if not block:
                break
            size += len(block)
            require(size <= limit, "Artifact exceeded its selected bound")
            hashed.update(block)
        require(identity(before) == identity(os.fstat(fd)), "Artifact changed while hashed")
        return {"bytes": size, "sha256": hashed.hexdigest()}
    finally:
        os.close(fd)


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def directory(path, mode=0o700):
    path = absolute(str(path))
    if not path.exists():
        require(path.parent.is_dir(), "Create the selected parent first: " + str(path.parent))
        try:
            path.mkdir(mode=mode)
        except FileExistsError:
            pass
    st = path.lstat()
    require(stat.S_ISDIR(st.st_mode) and not stat.S_ISLNK(st.st_mode) and
            st.st_uid == os.geteuid(), "Expected an administrator-owned ordinary directory")
    require(stat.S_IMODE(st.st_mode) == mode, "Directory permissions differ: " + str(path))
    return path


def parents(path, root, mode=0o755):
    require(path.is_relative_to(root), "Output escaped its selected root")
    for p in reversed(path.parent.parents):
        if p.is_relative_to(root) and p != root:
            directory(p, mode)
    if path.parent != root:
        directory(path.parent, mode)


def immutable(path, raw, mode=0o600):
    path = absolute(str(path))
    require(path.parent.is_dir(), "Create the selected output parent first")
    if path.exists() or path.is_symlink():
        require(regular(path, max(len(raw), 1)) == raw, "Conflicting retained bytes: " + str(path))
        require(stat.S_IMODE(path.stat().st_mode) == mode, "Retained file permissions differ")
        return
    fd, temporary = tempfile.mkstemp(prefix=".publish-", dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb") as out:
            out.write(raw)
            out.flush()
            os.fsync(out.fileno())
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError:
            require(regular(path, max(len(raw), 1)) == raw, "A conflicting file appeared")
        sync_directory(path.parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def atomic_json(path, value):
    fd, temporary = tempfile.mkstemp(prefix=".state-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as out:
            out.write(encoded(value))
            out.flush()
            os.fsync(out.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def emit(stage, **fields):
    print(json.dumps(dict(operation_id=OPERATION, stage=stage, **fields), sort_keys=True), flush=True)


def read_json(path):
    return json.loads(regular(path, CAPSULE_LIMIT))


def decompress(raw):
    with gzip.GzipFile(fileobj=io.BytesIO(raw), mode="rb") as source:
        result = source.read(CAPSULE_LIMIT + 1)
    require(len(result) <= CAPSULE_LIMIT, "Complete source capsule exceeds its declared bound")
    return result


def capsule(raw):
    require(len(raw) <= CAPSULE_LIMIT, "Complete source capsule exceeds its bound")
    value = json.loads(raw)
    require(value.get("schema") == "datactivist.customer-source.v1" and
            isinstance(value.get("files"), list) and 1 <= len(value["files"]) <= 512,
            "Expected the complete native customer source capsule")
    rows, total = {}, 0
    for row in value["files"]:
        require(isinstance(row, dict), "Invalid source member")
        name = str(relative(row["path"]))
        require(name not in rows and isinstance(row.get("content"), str), "Repeated or missing source member")
        body = row["content"].encode()
        require(type(row.get("bytes")) is int and len(body) == row["bytes"] and
                digest(body) == row.get("sha256"), "Source member bytes differ: " + name)
        total += len(body)
        require(len(body) <= CAPSULE_LIMIT and total <= 256 * 1024 * 1024, "Source selection is too large")
        if name.endswith(".py"):
            ast.parse(body, filename=name)
        rows[name] = body
    require(INVENTORY in rows, "Complete native application inventory is missing")
    inv = json.loads(rows[INVENTORY])
    names = inv.get("files")
    require(inv.get("schema") == "stellar-forge.datagouv-application-files.v1" and
            inv.get("entrypoint") == "start-publisher.mjs" and isinstance(names, list) and
            len(names) == len(rows) == len(set(names)) and set(names) == set(rows),
            "Capsule and complete native application inventory disagree")
    return value, rows, {"bytes": len(rows[INVENTORY]), "sha256": digest(rows[INVENTORY])}


def file_pins(rows):
    return {name: {"bytes": len(body), "sha256": digest(body)} for name, body in sorted(rows.items())}


def changes(before, after):
    return {"added": sorted(set(after) - set(before)), "removed": sorted(set(before) - set(after)),
            "modified": sorted(name for name in set(before) & set(after) if before[name] != after[name])}


def apply_correction(value, selection):
    value = copy.deepcopy(value)
    for correction in (selection["administration_amendment"]["source"],
                       selection["administration_amendment"]["guide"]):
        rows = [row for row in value["files"] if row["path"] == correction["path"]]
        require(len(rows) == 1, "Original administration member is missing")
        row = rows[0]
        body = row["content"].encode()
        if digest(body) == correction["sha256"]:
            require(len(body) == correction["bytes"], "Corrected source length differs")
            continue
        require(digest(body) == correction["preimage_sha256"], "Administration preimage differs")
        text = body.decode()
        for replacement in correction["replacements"]:
            require(text.count(replacement["old"]) == 1, "Administration correction occurrence differs")
            text = text.replace(replacement["old"], replacement["next"], 1)
        body = text.encode()
        require(len(body) == correction["bytes"] and digest(body) == correction["sha256"],
                "Administration correction postimage differs")
        row.update(content=text, bytes=len(body), sha256=digest(body))
        row.pop("sha", None)
    value["administrationAmendment"] = {
        "commit": selection["administration_commit"],
        "files": [{"path": item["path"], "sha256": item["sha256"]}
                  for item in (selection["administration_amendment"]["source"],
                               selection["administration_amendment"]["guide"])]}
    return value


def own_source():
    manifest = read_json(HERE / "SOURCE_MANIFEST.json")
    require(manifest.get("schema") == "datagouv.administration-receiver-source/v1",
            "The receiver's complete source manifest is missing")
    expected = {"operate.py", "receive.py", "SOURCE_SELECTION.json", "RECEIVING.md"}
    rows = manifest.get("files", [])
    require(isinstance(rows, list) and len(rows) == len(expected) and
            {row.get("path") for row in rows} == expected, "Receiver source closure differs")
    result = {"SOURCE_MANIFEST.json": regular(HERE / "SOURCE_MANIFEST.json")}
    for row in rows:
        body = regular(HERE / row["path"])
        require(len(body) == row["bytes"] and digest(body) == row["sha256"],
                "Receiver source differs: " + row["path"])
        if row["path"].endswith(".py"):
            ast.parse(body, filename=row["path"])
        result[row["path"]] = body
    return result


class SelectedArchive:
    def __init__(self, path, expected):
        require(pin(path) == expected, "The exact selected receiving artifact differs")
        self.path = path
        self.fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        self.before = os.fstat(self.fd)
        self.stream = os.fdopen(os.dup(self.fd), "rb")
        self.archive = zipfile.ZipFile(self.stream)
        self.rows = {}
        total = 0
        for row in self.archive.infolist():
            name = str(relative(row.filename))
            require(name not in self.rows and not row.is_dir() and
                    not stat.S_ISLNK(row.external_attr >> 16) and
                    not row.flag_bits & 1 and row.file_size <= FILE_LIMIT,
                    "Selected ZIP must contain unique bounded ordinary files")
            total += row.file_size
            require(len(self.rows) < 20000 and total <= ARCHIVE_LIMIT, "Selected ZIP is too large")
            self.rows[name] = row

    def find(self, suffix, optional=False):
        found = [name for name in self.rows if name == suffix or name.endswith("/" + suffix)]
        require(len(found) == 1 or optional and not found, "Ambiguous or missing retained member: " + suffix)
        return found[0] if found else None

    def read(self, suffix, optional=False, limit=FILE_LIMIT):
        name = self.find(suffix, optional)
        if name is None:
            return None
        require(self.rows[name].file_size <= limit, "Selected member exceeds its input bound")
        raw = self.archive.read(name)
        require(len(raw) == self.rows[name].file_size, "Incomplete selected ZIP member")
        return raw

    def close(self):
        try:
            require(identity(self.before) == identity(os.fstat(self.fd)), "Selected ZIP changed during receiving")
        finally:
            self.archive.close()
            self.stream.close()
            os.close(self.fd)


class Receiver:
    def __init__(self, args, source):
        self.args, self.source = args, source
        self.selection = json.loads(source["SOURCE_SELECTION.json"])
        require(self.selection["operation_id"] == OPERATION, "Different original receiving operation")
        self.root = directory(absolute(args.root), 0o755)
        self.control = directory(self.root / "control")
        lock_path = self.control / "receiver.lock"
        self.lock_fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        require(stat.S_ISREG(os.fstat(self.lock_fd).st_mode), "Invalid original receiving lock")
        fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.path = self.control / "receiver.json"
        self.history = directory(self.root / "history")
        self.receipts = directory(self.root / "receipts")
        self.packets = directory(self.root / "source-packets")
        self.operator = directory(self.root / "operator", 0o755)
        self.delivery = directory(self.root / "delivery")
        selected = {"package": {"bytes": args.package_bytes, "sha256": args.package_sha256},
                    "root": str(self.root), "node": str(pathlib.Path(args.node).resolve()),
                    "service_user": args.service_user, "port": args.port,
                    "after_source": None, "reason": args.handoff_reason,
                    "lifecycle": {"mode": "fresh_selected", "existing": None}}
        if args.existing_installation:
            selected["lifecycle"] = {"mode": "existing_upgrade", "existing": {
                "root": str(absolute(args.existing_installation)), "revision": args.existing_revision,
                "release_id": args.existing_release, "workspace_id": args.existing_workspace_id}}
        if args.after_source_capsule:
            selected["after_source"] = {"bytes": args.after_source_bytes,
                                       "sha256": args.after_source_sha256, "source_ref": args.after_source_ref}
        self.input = selected
        if self.path.exists():
            self.state = read_json(self.path)
            require(self.state.get("schema") == STATE_SCHEMA and self.state.get("operation_id") == OPERATION and
                    self.state.get("selection") == selected, "Keep the original selected receiver root and inputs")
        else:
            self.state = {"schema": STATE_SCHEMA, "operation_id": OPERATION, "selection": selected,
                          "created_at": now(), "attempts": [], "prepared": False}
            self.save()
        for name, body in self.source.items():
            immutable(self.operator / name, body, 0o444)
        immutable(self.root / "README.md", ("# Data.gouv administration receiving\n\n"
            "Read operator/RECEIVING.md for exact preparation, original-operation resume and preservation commands.\n"
            "The actual source edition is recorded in receipts/received-source-selection.json.\n"
            "Each receipts/attempt-N/outcome.json or receiver-error.json records the actual native outcome.\n"
            "A PREPARED or NATIVE_INCOMPLETE artifact is not an installed service.\n"
            "history/received.zip preserves the complete earlier artifact. All original release receipts and\n"
            "archives remain under operating/evidence. No provider credential is included.\n").encode())
        self.attempt = None

    def save(self):
        atomic_json(self.path, self.state)

    def retained_copy(self):
        destination = self.history / "received.zip"
        expected = self.input["package"]
        if destination.exists():
            require(pin(destination) == expected, "Retained original artifact changed")
            return destination
        original = absolute(self.args.package)
        require(pin(original) == expected, "Supplied original artifact differs")
        fd, temp = tempfile.mkstemp(prefix=".original-", dir=self.history)
        try:
            os.fchmod(fd, 0o600)
            source_fd = os.open(original, os.O_RDONLY | os.O_NOFOLLOW)
            before = os.fstat(source_fd)
            hashed, count = hashlib.sha256(), 0
            try:
                with os.fdopen(fd, "wb") as target:
                    while True:
                        block = os.read(source_fd, 1024 * 1024)
                        if not block:
                            break
                        count += len(block)
                        require(count <= ARCHIVE_LIMIT, "Original artifact exceeds its selected bound")
                        target.write(block)
                        hashed.update(block)
                    target.flush()
                    os.fsync(target.fileno())
                require(identity(before) == identity(os.fstat(source_fd)) and
                        {"bytes": count, "sha256": hashed.hexdigest()} == expected,
                        "Original artifact changed during retention")
            finally:
                os.close(source_fd)
            os.link(temp, destination, follow_symlinks=False)
            sync_directory(self.history)
        finally:
            if os.path.exists(temp):
                os.unlink(temp)
        return destination

    def prepare(self):
        archive = SelectedArchive(self.retained_copy(), self.input["package"])
        try:
            raw_record = archive.read("operating/evidence/receiving.json", limit=CAPSULE_LIMIT)
            origin = json.loads(raw_record)
            require(origin.get("schema") == "datagouv.linux-administration-receiving/v1" and
                    origin.get("operation_id") == OPERATION and
                    isinstance(origin.get("steps"), dict), "Different original administration record")
            prior = origin["input"]
            require(prior.get("schema") == "datagouv.linux-administration-receiving-input/v1" and
                    prior.get("operation_id") == OPERATION and
                    digest(canonical(prior)) == origin["input_sha256"],
                    "Original input and retained digest disagree")
            require(not origin.get("result"), "This original administration operation is already complete")
            require(not any("/installation/" in "/" + name or "/initial-workspace/" in "/" + name
                            for name in archive.rows),
                    "A commissioned installation must resume at its existing host and original locks")
            immutable(self.receipts / "origin-record.json", raw_record)
            selected_capsules = {}
            selected_rows = {}
            inventories = {}
            for item in self.selection["original_sources"]:
                name = item["kind"]
                packed = archive.read("source-packets/" + name + ".json.gz", limit=CAPSULE_LIMIT)
                raw = decompress(packed)
                require({"bytes": len(raw), "sha256": digest(raw)} ==
                        {"bytes": item["bytes"], "sha256": item["sha256"]},
                        "The preserved original complete source capsule differs: " + name)
                value, rows, inv = capsule(raw)
                require(len(rows) == item["count"], "Original source member count differs")
                immutable(self.packets / (name + ".json.gz"), packed)
                selected_capsules[name], selected_rows[name], inventories[name] = value, rows, inv
            require(prior["before_inventory"] == inventories["before"] == self.selection["before_inventory"],
                    "The original predecessor inventory changed")
            selected_after = apply_correction(selected_capsules["after"], self.selection)
            after_ref = self.selection["corrected_after_ref"]
            retained_after = archive.read("source-packets/after-selected.json.gz", optional=True, limit=CAPSULE_LIMIT)
            retained_selection = archive.read("receipts/received-source-selection.json", optional=True, limit=CAPSULE_LIMIT)
            if retained_after is not None:
                require(retained_selection is not None, "The retained later edition has no complete selection receipt")
                retained_raw = decompress(retained_after)
                receipt = json.loads(retained_selection)
                require(receipt.get("operation_id") == OPERATION and
                        len(retained_raw) == receipt["after"]["capsule_bytes"] and
                        digest(retained_raw) == receipt["after"]["capsule_sha256"],
                        "The retained later complete source identity differs")
                selected_after, kept_rows, kept_inventory = capsule(retained_raw)
                require(kept_inventory == receipt["after"]["inventory"] and
                        len(kept_rows) == receipt["after"]["files"] and
                        digest(canonical(file_pins(kept_rows))) == receipt["after"]["pins_sha256"] and
                        set(selected_rows["after"]) <= set(kept_rows),
                        "The retained later edition differs from its complete source receipt")
                after_ref = receipt["after"]["source_ref"]
            elif archive.read("source-packets/after-corrected.json.gz", optional=True, limit=CAPSULE_LIMIT) is not None:
                corrected_raw = decompress(archive.read("source-packets/after-corrected.json.gz", limit=CAPSULE_LIMIT))
                corrected, corrected_rows, corrected_inventory = capsule(corrected_raw)
                require(file_pins(corrected_rows) == file_pins(capsule(canonical(selected_after))[1]) and
                        corrected_inventory == inventories["after"],
                        "The earlier corrected release differs from the exact merged administration amendment")
                selected_after = corrected
                after_ref = prior["after_ref"]
            if self.args.after_source_capsule:
                source_path = absolute(self.args.after_source_capsule)
                raw = regular(source_path, CAPSULE_LIMIT)
                expected = self.input["after_source"]
                require(len(raw) == expected["bytes"] and digest(raw) == expected["sha256"],
                        "The selected later complete source capsule differs")
                selected_after, later_rows, unused = capsule(raw)
                require(set(selected_rows["after"]) <= set(later_rows),
                        "A later additive edition omitted an original application member")
                after_ref = expected["source_ref"]
                immutable(self.packets / "after-supplied.json", raw)
                original_pins = file_pins(later_rows)
                selected_after = apply_correction(selected_after, self.selection)
                corrected_pins = file_pins(capsule(canonical(selected_after))[1])
                if corrected_pins != original_pins:
                    suffix = " + admin " + self.selection["administration_commit"]
                    require(len(after_ref + suffix) <= 256, "Record a shorter exact source revision before its administration amendment")
                    after_ref += suffix
            after_raw = canonical(selected_after)
            selected_capsules["after"], selected_rows["after"], inventories["after"] = capsule(after_raw)
            require(digest(selected_rows["after"].get(ADMIN, b"")) == self.selection["administrator_sha256"] and
                    digest(selected_rows["after"].get(GUIDE, b"")) == self.selection["administration_guide_sha256"],
                    "The selected later edition must preserve the reviewed administration source and guide")
            immutable(self.packets / "after-selected.json.gz", gzip.compress(after_raw, mtime=0))
            for name in ("before", "after"):
                target = directory(self.root / ("source-" + name), 0o755)
                for filename, body in sorted(selected_rows[name].items()):
                    path = target.joinpath(*relative(filename).parts)
                    parents(path, target)
                    immutable(path, body, 0o444)
            selected = dict(prior)
            selected.update(output=str(self.root / "operating"),
                            before_source=str(self.root / "source-before"),
                            after_source=str(self.root / "source-after"),
                            after_ref=after_ref, after_inventory=inventories["after"],
                            expected_changes=changes(file_pins(selected_rows["before"]), file_pins(selected_rows["after"])),
                            administrator_sha256=self.selection["administrator_sha256"],
                            node=self.input["node"], service_user=self.args.service_user, port=self.args.port,
                            lifecycle=self.input["lifecycle"])
            output = directory(self.root / "operating", 0o755)
            evidence = directory(output / "evidence")
            releases = directory(evidence / "releases")
            record_path = evidence / "receiving.json"
            if not record_path.exists():
                immutable(record_path, raw_record)
            else:
                current = read_json(record_path)
                require(current.get("operation_id") == OPERATION, "Current receiving record belongs to another operation")
            handoff = None
            if origin["steps"] == {}:
                handoff = {"schema": "datagouv.linux-administration-source-amendment/v1",
                           "operation_id": OPERATION, "from_input_sha256": origin["input_sha256"],
                           "to_input_sha256": digest(canonical(selected)), "reason": self.args.handoff_reason,
                           "original_record_sha256": digest(raw_record),
                           "selected_sources": {name: {"inventory": inventories[name], "files": len(selected_rows[name]),
                               "pins_sha256": digest(canonical(file_pins(selected_rows[name])))}
                               for name in ("before", "after")}}
                handoff_name, handoff_option = "source-amendment.json", "--amendment"
            else:
                require(set(origin["steps"]) == {"package_before", "package_after", "preflight"},
                        "Original native installation was requested; resume its existing selected host")
                require(prior["administrator_sha256"] == selected["administrator_sha256"],
                        "A runtime handoff cannot replace the original administrator")
                received = {}
                for name in ("before", "after"):
                    row = origin["steps"]["package_" + name]
                    result = row.get("result", {})
                    require(row.get("completed") and type(result.get("bytes")) is int and
                            HEX.fullmatch(result.get("sha256", "")), "Original complete release receipt is missing")
                    old_path = pathlib.PurePosixPath(result["path"])
                    old_root = pathlib.PurePosixPath(prior["output"])
                    require(old_path.is_absolute() and old_path.is_relative_to(old_root / "evidence/releases"),
                            "Original release path escaped its selected output")
                    member = "operating/" + str(old_path.relative_to(old_root))
                    body = archive.read(member, limit=result["bytes"])
                    require(len(body) == result["bytes"] and digest(body) == result["sha256"],
                            "Original complete native release bytes differ")
                    destination = releases / ("retained-" + name + "-" + result["sha256"] + ".tar.gz")
                    immutable(destination, body)
                    received[name] = str(destination)
                edition = prior["after_inventory"] != selected["after_inventory"]
                handoff = {"schema": "datagouv.linux-administration-runtime-handoff/v1",
                           "operation_id": OPERATION, "kind": "source_edition" if edition else "runtime",
                           "reason": self.args.handoff_reason, "from_input_sha256": origin["input_sha256"],
                           "to_input_sha256": digest(canonical(selected)), "from_record_sha256": digest(raw_record),
                           "received_releases": received,
                           "selected_sources": {name: {"inventory": inventories[name], "files": len(selected_rows[name]),
                               "pins_sha256": digest(canonical(file_pins(selected_rows[name])))}
                               for name in ("before", "after")}}
                handoff_name, handoff_option = "runtime-handoff.json", "--runtime-handoff"
            immutable(self.receipts / "input.json", encoded(selected))
            immutable(self.receipts / handoff_name, encoded(handoff))
            selection_receipt = {
                "schema": "datagouv.administration-received-sources/v1", "operation_id": OPERATION,
                "original_artifact": self.input["package"], "original_record_sha256": digest(raw_record),
                "before": {"files": len(selected_rows["before"]), "inventory": inventories["before"],
                           "pins_sha256": digest(canonical(file_pins(selected_rows["before"])))},
                "after": {"files": len(selected_rows["after"]), "inventory": inventories["after"],
                          "capsule_bytes": len(after_raw), "capsule_sha256": digest(after_raw),
                          "source_ref": after_ref,
                          "pins_sha256": digest(canonical(file_pins(selected_rows["after"])))},
                "transition": selected["expected_changes"],
                "provider_writes": 0, "servers_started": 0}
            immutable(self.receipts / "received-source-selection.json", encoded(selection_receipt))
            self.state.update(prepared=True, handoff_file=str(self.receipts / handoff_name),
                              handoff_option=handoff_option, sources=selection_receipt)
            self.save()
            emit("complete_sources_prepared", before_files=len(selected_rows["before"]),
                 after_files=len(selected_rows["after"]), installation_dispatched=False)
        finally:
            archive.close()

    def current_attempt(self):
        if self.state["attempts"]:
            return self.state["attempts"][-1]
        return None

    def attempt_folder(self, attempt):
        return directory(self.receipts / ("attempt-" + str(attempt["number"])))

    def begin(self):
        current = self.current_attempt()
        if current and not self.args.resume:
            self.attempt = current
            return False
        if current:
            require(current.get("artifact"), "Finish preserving the original attempt before resuming it")
            require(current.get("outcome", {}).get("status") != "PASS",
                    "Completed original receiving is returned unchanged")
        self.attempt = {"number": len(self.state["attempts"]) + 1, "created_at": now(), "phase": "preparing"}
        self.state["attempts"].append(self.attempt)
        self.save()
        self.attempt_folder(self.attempt)
        return True

    def operate(self):
        folder = self.attempt_folder(self.attempt)
        argv = [sys.executable, "-B", str(self.operator / "operate.py"),
                "--input", str(self.receipts / "input.json"),
                self.state["handoff_option"], self.state["handoff_file"],
                "--lock-fd", str(self.lock_fd)]
        immutable(folder / "dispatch.json", encoded({"operation_id": OPERATION, "argv": argv,
                  "input_sha256": digest(regular(self.receipts / "input.json")),
                  "requested_at": self.attempt["created_at"]}))
        self.attempt["phase"] = "dispatched"
        self.save()
        environment = {"PATH": str(pathlib.Path(self.input["node"]).parent) + ":/usr/bin:/bin",
                       "LANG": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1"}
        stdout_path, stderr_path = folder / "stdout.txt", folder / "stderr.txt"
        require(not stdout_path.exists() and not stderr_path.exists(), "Original child output already exists")
        process = None
        with stdout_path.open("xb") as stdout, stderr_path.open("xb") as stderr:
            os.chmod(stdout_path, 0o600)
            os.chmod(stderr_path, 0o600)
            try:
                process = subprocess.Popen(argv, cwd="/", env=environment, stdout=stdout, stderr=stderr,
                                           pass_fds=(self.lock_fd,))
                self.attempt["pid"] = process.pid
                self.save()
                emit("original_operator_dispatched", attempt=self.attempt["number"], pid=process.pid)
                code = process.wait()
            finally:
                # A receiver exception must not release custody while its native
                # child still owns the original command. Do not kill that child.
                if process is not None and process.poll() is None:
                    process.wait()
                stdout.flush()
                stderr.flush()
                os.fsync(stdout.fileno())
                os.fsync(stderr.fileno())
        native = read_json(self.root / "operating/evidence/receiving.json")
        complete = native.get("result", {}).get("status") == "PASS" and code == 0
        outcome = {"schema": "datagouv.administration-receiver-outcome/v1", "operation_id": OPERATION,
                   "finished_at": now(), "status": "PASS" if complete else "NATIVE_INCOMPLETE",
                   "exit_code": code, "native_record_sha256": digest(regular(self.root / "operating/evidence/receiving.json")),
                   "native_result": native.get("result"), "native_error": native.get("last_error"),
                   "source_selection": self.state["sources"], "provider_writes": 0, "servers_started": 0}
        immutable(folder / "outcome.json", encoded(outcome))
        self.attempt.update(phase="terminal", outcome=outcome)
        self.save()
        emit("original_operator_returned", exit_code=code, status=outcome["status"])

    def selected_delivery(self, folder):
        entries = {}
        readme = self.root / "README.md"
        if readme.exists():
            entries["README.md"] = {"path": str(readme), **pin(readme, FILE_LIMIT)}
        for prefix in ("operator", "source-packets", "history", "operating", "receipts"):
            root = self.root / prefix
            if not root.exists():
                continue
            for path in sorted(root.rglob("*")):
                require(not path.is_symlink(), "Unexpected symlink in the selected complete delivery")
                if path.is_file():
                    name = str(path.relative_to(self.root))
                    if name.endswith("/package-selection.json") or name.endswith("/artifact.json"):
                        continue
                    entries[name] = {"path": str(path), **pin(path, FILE_LIMIT)}
        existing = self.input["lifecycle"]["existing"]
        if existing is not None:
            record_path = self.root / "operating/evidence/receiving.json"
            if record_path.exists():
                record = read_json(record_path)
                receipt = record.get("steps", {}).get("backup", {}).get("result", {}).get("backup")
                if receipt is not None:
                    backup = absolute(receipt["path"])
                    selected_root = absolute(existing["root"]) / "backups" / (OPERATION + "-backup")
                    require(backup.is_relative_to(selected_root), "The original backup escaped its selected operation")
                    actual = pin(backup, FILE_LIMIT)
                    require(actual == {"bytes": receipt["bytes"], "sha256": receipt["sha256"]},
                            "The complete existing-workspace backup changed")
                    entries["existing-installation/original-workspace.datawork"] = {"path": str(backup), **actual}
        require(sum(row["bytes"] for row in entries.values()) <= ARCHIVE_LIMIT,
                "Complete delivery exceeds its selected bound")
        return entries

    def verify_zip(self, path, entries):
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            require(len(infos) == len(entries) and len({row.filename for row in infos}) == len(infos) and
                    {row.filename for row in infos} == set(entries), "Preserved delivery member set differs")
            for row in infos:
                wanted = entries[row.filename]
                require(row.file_size == wanted["bytes"] and
                        digest(archive.read(row)) == wanted["sha256"], "Preserved delivery member differs")

    def freeze(self):
        folder = self.attempt_folder(self.attempt)
        selection_path = folder / "package-selection.json"
        if selection_path.exists():
            entries = read_json(selection_path)["files"]
        else:
            entries = self.selected_delivery(folder)
            immutable(selection_path, encoded({"schema": "datagouv.administration-delivery-selection/v1",
                      "operation_id": OPERATION, "attempt": self.attempt["number"], "files": entries}))
        output = self.delivery / ("Datactivist_Linux_Administration_Receiving_20261012_018A_attempt-" +
                                  str(self.attempt["number"]) + ".zip")
        if not output.exists():
            staging = self.delivery / (".package-" + str(self.attempt["number"]) + "-" + uuid.uuid4().hex + ".zip")
            self.attempt.setdefault("package_stages", []).append(str(staging))
            self.save()
            with zipfile.ZipFile(staging, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                os.chmod(staging, 0o600)
                for name, row in sorted(entries.items()):
                    raw = regular(pathlib.Path(row["path"]), FILE_LIMIT)
                    require(len(raw) == row["bytes"] and digest(raw) == row["sha256"],
                            "A selected delivery file changed before packaging")
                    item = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                    item.compress_type = zipfile.ZIP_DEFLATED
                    item.external_attr = (stat.S_IFREG | 0o600) << 16
                    archive.writestr(item, raw)
            with staging.open("rb") as stream:
                os.fsync(stream.fileno())
            self.verify_zip(staging, entries)
            try:
                os.link(staging, output, follow_symlinks=False)
            except FileExistsError:
                self.verify_zip(output, entries)
            staging.unlink()
            sync_directory(self.delivery)
        self.verify_zip(output, entries)
        artifact = {"schema": "datagouv.administration-delivery/v1", "operation_id": OPERATION,
                    "attempt": self.attempt["number"], "path": str(output), "file_name": output.name,
                    **pin(output), "members": len(entries), "outcome": self.attempt.get("outcome")}
        immutable(folder / "artifact.json", encoded(artifact))
        self.attempt.update(artifact=artifact, phase="preserved")
        self.save()
        emit("complete_artifact_preserved", path=str(output), bytes=artifact["bytes"],
             sha256=artifact["sha256"], members=artifact["members"],
             status=(artifact.get("outcome") or {}).get("status"))
        return artifact

    def preserve_remote(self, artifact):
        if not self.args.library_helper_dir:
            return
        folder = self.attempt_folder(self.attempt)
        upload_root = directory(self.control / ("upload-" + str(self.attempt["number"])))
        request_path, result_path = upload_root / "request.json", upload_root / "result.json"
        request = {"artifact": {"bytes": artifact["bytes"], "sha256": artifact["sha256"]},
                   "uploads": [{"local_path": artifact["path"], "purpose": "replace_library_file",
                                "library_file_id": self.args.library_file_id,
                                "expected_current_version": self.args.expected_current_version,
                                "version_reason": "Preserve the same Linux administration receiving operation"}]}
        if result_path.exists():
            result = read_json(result_path)
            require(read_json(request_path) == request, "Original preservation selection changed")
        else:
            require(not request_path.exists(),
                    "The original artifact save has an unknown outcome. Reconcile its exact helper journal before another save.")
            helper = absolute(self.args.library_helper_dir)
            for name, expected in self.selection["optional_library_helpers"].items():
                raw = regular(helper / name)
                require({"bytes": len(raw), "sha256": digest(raw)} == expected, "Current supported upload helper differs")
            require(pin(pathlib.Path(artifact["path"])) ==
                    {"bytes": artifact["bytes"], "sha256": artifact["sha256"]}, "Frozen artifact changed before preservation")
            immutable(request_path, encoded(request))
            sys.path.insert(0, str(helper))
            from library_upload import LibraryUploadWorkflow, HostedAppsClient, LibraryFileMaterializer, SignedUrlUploader
            workflow = LibraryUploadWorkflow(apps_client=HostedAppsClient(), materializer=LibraryFileMaterializer(),
                                             uploader=SignedUrlUploader(), state_parent=upload_root)
            result = workflow.run({"uploads": request["uploads"]})
            immutable(result_path, encoded(result))
        rows = result.get("results", [])
        require(len(rows) == 1 and rows[0].get("status") == "succeeded" and
                rows[0].get("library_file_id") == self.args.library_file_id and
                rows[0].get("current_version_number") == self.args.expected_current_version + 1,
                "The same artifact save did not return the selected finalized identity and next version")
        self.attempt["remote_saved"] = {key: rows[0].get(key) for key in
            ("library_file_id", "file_id", "current_version_number", "file_name", "local_metadata_applied")}
        self.save()
        emit("same_artifact_save_complete", **self.attempt["remote_saved"])

    def run(self):
        fresh = self.begin()
        error = None
        try:
            if fresh:
                self.prepare()
                if self.args.prepare_only:
                    outcome = {"schema": "datagouv.administration-receiver-outcome/v1", "operation_id": OPERATION,
                               "status": "PREPARED", "finished_at": now(), "source_selection": self.state["sources"],
                               "operator_dispatched": False, "provider_writes": 0, "servers_started": 0}
                    immutable(self.attempt_folder(self.attempt) / "outcome.json", encoded(outcome))
                    self.attempt.update(phase="terminal", outcome=outcome)
                    self.save()
                else:
                    rows = capsule(decompress(regular(self.packets / "after-selected.json.gz", CAPSULE_LIMIT)))[1]
                    require(len(rows) >= 189 and set(self.selection["required_complete_members"]) <= set(rows),
                            "The current complete application edition is required before installation; keep the 177/182 releases as provenance")
                    self.operate()
            elif self.attempt.get("phase") == "dispatched":
                raise ReceivingError("The prior native dispatch has no terminal receiver receipt. Keep this host and original native record; inspect its result before explicit recovery.")
        except BaseException as exc:
            error = exc
            if fresh:
                self.attempt["outcome"] = {"schema": "datagouv.administration-receiver-outcome/v1",
                    "operation_id": OPERATION, "status": "RECEIVER_INCOMPLETE", "finished_at": now(),
                    "error": {"type": type(exc).__name__, "message": str(exc)},
                    "provider_writes": 0, "servers_started": 0}
                self.attempt["phase"] = "terminal"
                atomic_json(self.attempt_folder(self.attempt) / "receiver-error.json", self.attempt["outcome"])
                self.save()
            emit("receiver_incomplete", error_type=type(exc).__name__, message=str(exc))
        finally:
            # Complete inputs, source, original record and actual outcome remain
            # usable even when preflight or a native administration step fails.
            if self.attempt is not None:
                artifact = self.freeze()
                self.preserve_remote(artifact)
        if error:
            raise error
        return (self.attempt.get("outcome") or {}).get("status") in ("PASS", "PREPARED")

    def close(self):
        os.close(self.lock_fd)


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--package", required=True, help="Exact retained original receiving ZIP")
    result.add_argument("--package-bytes", type=int, required=True)
    result.add_argument("--package-sha256", required=True)
    result.add_argument("--root", required=True, help="Owned persistent receiving root with an existing parent")
    result.add_argument("--node", required=True, help="Actual Node 24+ executable")
    result.add_argument("--service-user", required=True, help="Existing mapped unprivileged Linux account")
    result.add_argument("--port", type=int, default=8429)
    result.add_argument("--handoff-reason", required=True)
    result.add_argument("--after-source-capsule")
    result.add_argument("--after-source-bytes", type=int)
    result.add_argument("--after-source-sha256")
    result.add_argument("--after-source-ref")
    result.add_argument("--existing-installation", help="Explicit original managed installation for real upgrade coverage")
    result.add_argument("--existing-revision", type=int)
    result.add_argument("--existing-release", help="Exact current release ID from the original native status")
    result.add_argument("--existing-workspace-id")
    result.add_argument("--prepare-only", action="store_true")
    result.add_argument("--resume", action="store_true", help="Resume this same failed/prepared original operation after preserving its prior attempt")
    result.add_argument("--library-helper-dir", help="Optional existing current supported upload helper directory")
    result.add_argument("--library-file-id")
    result.add_argument("--expected-current-version", type=int)
    return result


def main():
    args = parser().parse_args()
    require(0 < args.package_bytes <= ARCHIVE_LIMIT and HEX.fullmatch(args.package_sha256 or ""),
            "Supply the original artifact's exact byte length and SHA-256")
    require(1024 <= args.port <= 65535 and args.handoff_reason.strip(), "Select the existing port and explicit handoff reason")
    later = (args.after_source_capsule, args.after_source_bytes, args.after_source_sha256, args.after_source_ref)
    require(all(value is None for value in later) or all(value is not None for value in later),
            "A later source edition needs its complete capsule, bytes, SHA-256 and source revision")
    if args.after_source_capsule:
        require(0 < args.after_source_bytes <= CAPSULE_LIMIT and HEX.fullmatch(args.after_source_sha256 or "") and
                0 < len(args.after_source_ref) <= 256 and not any(ord(c) < 32 for c in args.after_source_ref),
                "Invalid later complete source selection")
    existing = (args.existing_installation, args.existing_revision, args.existing_release, args.existing_workspace_id)
    require(all(value is None for value in existing) or all(value is not None for value in existing),
            "An existing upgrade needs the original root, revision, release and workspace identity")
    if args.existing_installation:
        require(args.existing_revision >= 0 and HEX.fullmatch(args.existing_release or "") and
                isinstance(args.existing_workspace_id, str) and args.existing_workspace_id.strip(),
                "Invalid existing installation selection")
    remote = (args.library_helper_dir, args.library_file_id, args.expected_current_version)
    require(all(value is None for value in remote) or all(value is not None for value in remote),
            "Same-item preservation requires the current helper, existing file ID and expected version")
    if args.expected_current_version is not None:
        require(args.expected_current_version >= 0, "Select the actual existing artifact version")
    receiver = Receiver(args, own_source())
    try:
        return 0 if receiver.run() else 1
    finally:
        receiver.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ReceivingError, BlockingIOError) as error:
        print(json.dumps({"operation_id": OPERATION, "error": type(error).__name__, "message": str(error)}),
              file=sys.stderr, flush=True)
        raise SystemExit(1)
