"""Original workspace catalogue, immutable objects and same-request operation journals."""
import contextlib
import fcntl
import hashlib
import os
import shutil
import tempfile
import threading
from pathlib import Path
from .canonical import (atomic, decode, digest, encode, full_sha, fsync_directory,
                        guid, json_file, now, private_directory, read_bytes,
                        regular_file, request_id, sha_bytes)
from .errors import PMRSError, require

_REGISTRY = {}
_REGISTRY_LOCK = threading.Lock()
MAX_OBJECT_BYTES = 512 * 1024 * 1024

@contextlib.contextmanager
def file_lock(path, *, shared=False, nonblocking=False):
    path = Path(path)
    private_directory(path.parent)
    with _REGISTRY_LOCK:
        lock = _REGISTRY.setdefault(str(path), threading.RLock())
    acquired = lock.acquire(blocking=not nonblocking)
    require(acquired, "OPERATION_BUSY", "The original operation is already active.")
    descriptor = None
    try:
        descriptor = os.open(path, os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
        mode = fcntl.LOCK_SH if shared else fcntl.LOCK_EX
        try: fcntl.flock(descriptor, mode | (fcntl.LOCK_NB if nonblocking else 0))
        except BlockingIOError:
            raise PMRSError("OPERATION_BUSY", "The original operation is already active.", status=409)
        yield
    finally:
        if descriptor is not None: os.close(descriptor)
        lock.release()

class Store:
    def __init__(self, root, *, create=True):
        self.root = Path(root).absolute()
        if create:
            private_directory(self.root)
        require(self.root.is_dir() and not self.root.is_symlink(),
                "WORKSPACE_NOT_FOUND", "The selected PMRS workspace does not exist.")
        for folder in ("objects", "records", "operations", "locks", "exports", "delivery-claims"):
            if create: private_directory(self.root / folder)
        with self.locked():
            manifest = self.root / "workspace.json"
            if not manifest.exists():
                require(create, "WORKSPACE_NOT_FOUND", "Workspace identity is absent.")
                import uuid
                json_file(manifest, {"schema": "commons.pmrs-workspace.v1",
                                    "workspace_id": str(uuid.uuid4()), "created_at": now()})
            self.identity = decode(read_bytes(manifest))
            require(self.identity.get("schema") == "commons.pmrs-workspace.v1",
                    "WORKSPACE_SCHEMA", "Unsupported PMRS workspace.")
            guid(self.identity.get("workspace_id"))
            catalogue = self.root / "catalogue.json"
            if not catalogue.exists():
                require(create, "WORKSPACE_INCOMPLETE", "The workspace catalogue is absent.")
                json_file(catalogue, {"schema": "commons.pmrs-catalogue.v1", "revision": 0, "items": []})

    def locked(self):
        return file_lock(self.root / "locks" / "catalogue.lock")

    @contextlib.contextmanager
    def work(self, operation_id):
        request_id(operation_id)
        # Readers may inspect a running journal; export alone drains this shared activity lock.
        with file_lock(self.root / "locks" / "activity.lock", shared=True):
            with file_lock(self.root / "locks" / (operation_id + ".lock"), nonblocking=True):
                yield

    def object_path(self, sha):
        sha = full_sha(sha)
        return self.root / "objects" / sha[:2] / sha

    def put_bytes(self, value):
        require(isinstance(value, bytes) and len(value) <= MAX_OBJECT_BYTES,
                "OBJECT_LIMIT", "Retained object exceeds 512 MiB.")
        sha = sha_bytes(value)
        atomic(self.object_path(sha), value)
        return {"sha256": sha, "bytes": len(value)}

    def put_json(self, value):
        return self.put_bytes(encode(value))

    def put_file(self, source):
        source = regular_file(source)
        before = source.stat()
        require(before.st_size <= MAX_OBJECT_BYTES, "OBJECT_LIMIT", "Retained object exceeds 512 MiB.")
        temporary_root = private_directory(self.root / "objects" / ".incoming")
        descriptor, temporary = tempfile.mkstemp(prefix="object-", dir=temporary_root)
        try:
            h, length = hashlib.sha256(), 0
            with source.open("rb") as inp, os.fdopen(descriptor, "wb") as out:
                observed = os.fstat(inp.fileno())
                require((observed.st_dev, observed.st_ino, observed.st_size, observed.st_mtime_ns) ==
                        (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns),
                        "SOURCE_CHANGED", "The original file changed before receiving.")
                while True:
                    part = inp.read(1024 * 1024)
                    if not part: break
                    h.update(part); out.write(part); length += len(part)
                after = os.fstat(inp.fileno())
                require((after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) ==
                        (observed.st_dev, observed.st_ino, observed.st_size, observed.st_mtime_ns, observed.st_ctime_ns),
                        "SOURCE_CHANGED", "The original file changed during receiving.")
                out.flush(); os.fsync(out.fileno())
            sha = h.hexdigest()
            destination = self.object_path(sha)
            private_directory(destination.parent)
            try: os.link(temporary, destination)
            except FileExistsError: self.verify_object({"sha256": sha, "bytes": length})
            fsync_directory(destination.parent)
            return {"sha256": sha, "bytes": length}
        finally:
            try: os.unlink(temporary)
            except FileNotFoundError: pass

    def verify_object(self, descriptor):
        path = regular_file(self.object_path(descriptor["sha256"]))
        require(path.stat().st_size == descriptor["bytes"], "OBJECT_CHANGED", "Retained object size changed.")
        with path.open("rb") as stream:
            actual = hashlib.file_digest(stream, "sha256").hexdigest()
        require(actual == descriptor["sha256"], "OBJECT_CHANGED", "Retained object hash changed.")
        return path

    def get_bytes(self, descriptor, *, limit=32 * 1024 * 1024):
        path = self.verify_object(descriptor)
        require(path.stat().st_size <= limit, "OBJECT_READ_LIMIT", "Use streaming for this retained object.", limit=limit)
        return path.read_bytes()

    def get_json(self, descriptor, *, limit=32 * 1024 * 1024):
        return decode(self.get_bytes(descriptor, limit=limit), limit=limit)

    def _catalogue(self):
        value = decode(read_bytes(self.root / "catalogue.json"))
        require(value.get("schema") == "commons.pmrs-catalogue.v1", "CATALOGUE_SCHEMA", "Invalid workspace catalogue.")
        return value

    def add_record(self, kind, body):
        require(kind in {"source", "mapping", "reconciliation", "target-review", "delivery", "receipt"},
                "RECORD_KIND", "Unsupported retained record kind.")
        record = {"schema": "commons.pmrs-record.v1", "kind": kind, "body": body}
        record_id = digest(record)
        path = self.root / "records" / (record_id + ".json")
        with self.locked():
            json_file(path, record)
            catalogue = self._catalogue()
            old = next((item for item in catalogue["items"] if item["id"] == record_id), None)
            if old is None:
                catalogue["revision"] += 1
                catalogue["items"].append({"id": record_id, "kind": kind,
                    "sequence": catalogue["revision"], "created_at": body.get("created_at", now()),
                    "label": body.get("label", kind)})
                json_file(self.root / "catalogue.json", catalogue, replace=True)
        return {"id": record_id, **record}

    def record(self, record_id, kind=None):
        record_id = full_sha(record_id)
        path = self.root / "records" / (record_id + ".json")
        require(path.exists(), "RECORD_NOT_FOUND", "The retained record does not exist.", record_id=record_id)
        value = decode(read_bytes(path))
        require(digest(value) == record_id and value.get("schema") == "commons.pmrs-record.v1",
                "RECORD_CHANGED", "The retained record identity changed.")
        require(kind is None or value["kind"] == kind, "RECORD_KIND", "The selected record has a different kind.")
        return {"id": record_id, **value}

    def list_records(self, kind=None, *, before=None, limit=25):
        require(type(limit) is int and 1 <= limit <= 100, "PAGE_LIMIT", "Choose 1–100 records.")
        with self.locked(): catalogue = self._catalogue()
        rows = [r for r in reversed(catalogue["items"])
                if (kind is None or r["kind"] == kind) and (before is None or r["sequence"] < before)]
        page = rows[:limit]
        return {"items": page, "next_before": page[-1]["sequence"] if len(rows) > limit else None,
                "catalogue_revision": catalogue["revision"], "total": len(rows)}

    def claim_delivery(self, review_id, operation_id, connection, *, already_locked=False):
        review_id, operation_id = full_sha(review_id), request_id(operation_id)
        path = self.root / "delivery-claims" / (review_id + ".json")
        request = {"review_id": review_id, "connection": connection}
        with contextlib.nullcontext() if already_locked else self.locked():
            operation_path = self.operation_path(operation_id)
            original = decode(read_bytes(operation_path)) if operation_path.exists() else None
            if original is not None:
                require(original.get("schema") == "commons.pmrs-operation.v1"
                        and original["id"] == operation_id and original["kind"] == "target-delivery"
                        and original["request"] == request
                        and digest(original["request"]) == original["request_sha256"] == digest(request),
                        "REQUEST_CHANGED", "This operation ID already belongs to a different original request.")
            value = decode(read_bytes(path)) if path.exists() else None
            if value is not None:
                require(value.get("schema") == "commons.pmrs-delivery-claim.v1"
                        and value["review_id"] == review_id
                        and digest(value["request"]) == value["request_sha256"],
                        "DELIVERY_CLAIM_CHANGED", "The original review delivery claim differs.")
                if value["delivery_id"] != operation_id:
                    raise PMRSError("DELIVERY_REVIEW_ALREADY_OWNED",
                        "This exact review already has an original delivery; reopen that operation.",
                        status=409, details={"review_id": review_id, "delivery_id": value["delivery_id"],
                            "action_id": value["delivery_id"] if (self.root / "commands" / (value["delivery_id"] + ".json")).is_file() else None})
                require(value["request"] == request, "DELIVERY_CLAIM_CHANGED",
                        "The selected connection differs from the original review delivery.")
            # Reserve the operation identity under this same lock, before publishing
            # the review claim. A second review cannot use the claim→journal gap.
            if original is None:
                original = {"schema": "commons.pmrs-operation.v1", "id": operation_id,
                            "kind": "target-delivery", "request": request, "request_sha256": digest(request),
                            "state": "PREPARED", "created_at": now(), "updated_at": now(),
                            "progress": {}, "history": []}
                json_file(operation_path, original)
            if value is None:
                value = {"schema": "commons.pmrs-delivery-claim.v1", "review_id": review_id,
                         "delivery_id": operation_id, "request": request, "request_sha256": digest(request)}
                json_file(path, value)
            return value

    def delivery_for_review(self, review_id):
        review_id = full_sha(review_id)
        self.record(review_id, "target-review")
        path = self.root / "delivery-claims" / (review_id + ".json")
        with self.locked():
            if not path.exists(): return {"review_id": review_id, "delivery_id": None, "action_id": None, "operation_exists": False}
            value = decode(read_bytes(path))
            require(value.get("schema") == "commons.pmrs-delivery-claim.v1" and value["review_id"] == review_id
                    and digest(value["request"]) == value["request_sha256"],
                    "DELIVERY_CLAIM_CHANGED", "The original delivery claim differs.")
            identifier = request_id(value["delivery_id"])
            return {"review_id": review_id, "delivery_id": identifier,
                    "action_id": identifier if (self.root / "commands" / (identifier + ".json")).is_file() else None,
                    "operation_exists": self.operation_path(identifier).is_file()}

    def operation_path(self, op):
        return self.root / "operations" / (request_id(op) + ".json")

    def operation(self, op, kind=None, request=None):
        path = self.operation_path(op)
        with self.locked():
            if path.exists():
                value = decode(read_bytes(path))
                require(value.get("id") == op, "OPERATION_CHANGED", "Original operation identity changed.")
                if kind is not None:
                    require(value["kind"] == kind and value["request_sha256"] == digest(request)
                            and value["request"] == request, "REQUEST_CHANGED",
                            "This request ID already belongs to a different operation.", operation_id=op)
                return value
            require(kind is not None, "OPERATION_NOT_FOUND", "The original operation does not exist.", operation_id=op)
            value = {"schema": "commons.pmrs-operation.v1", "id": op, "kind": kind,
                     "request": request, "request_sha256": digest(request),
                     "state": "PREPARED", "created_at": now(), "updated_at": now(),
                     "progress": {}, "history": []}
            json_file(path, value)
            return value

    def update_operation(self, op, *, state=None, progress=None, result=None, event=None):
        path = self.operation_path(op)
        with self.locked():
            value = decode(read_bytes(path))
            require(value["id"] == op and digest(value["request"]) == value["request_sha256"],
                    "OPERATION_CHANGED", "Original request bytes changed.")
            if state is not None: value["state"] = state
            if progress is not None: value["progress"] = progress
            if result is not None: value["result"] = result
            value["updated_at"] = now()
            if event is not None: value["history"].append({"at": now(), **event})
            json_file(path, value, replace=True)
        return value

    def operations(self):
        rows = []
        for path in sorted((self.root / "operations").glob("*.json")):
            value = decode(read_bytes(path))
            rows.append({k: value[k] for k in ("id", "kind", "state", "created_at", "updated_at")})
        return sorted(rows, key=lambda x: x["created_at"], reverse=True)
