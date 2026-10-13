"""Native local-directory stage and atomic pointer operations.

Executed only by GovHub's existing worker under its original storage lease.
The target lock protects one configured filesystem pointer across workspaces.
"""
from __future__ import annotations
from contextlib import contextmanager
from pathlib import Path
import fcntl
import hashlib
import json
import os
import stat
import tempfile
import uuid

from .model import canonical, sha, relative
from .service import problem, edition, manifest, target, current_release, _environment, _latest_review


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _root(value):
    path = Path(value["release_root"])
    try:
        info = path.lstat()
        valid = stat.S_ISDIR(info.st_mode) and path.resolve(strict=True) == path
    except OSError:
        valid = False
        info = None
    if not valid or (info.st_dev, info.st_ino) != (value["root_device"], value["root_inode"]):
        problem("STATIC_ROOT_CHANGED", "The explicitly configured release directory moved or changed.", 409)
    return path


@contextmanager
def target_lock(value):
    root = _root(value)
    fd = os.open(root / ".govhub-static.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            problem("STATIC_LOCK_TYPE", "The existing target lock is not an ordinary file.", 409)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            problem("STATIC_TARGET_BUSY", "The original target is in use by another release operation.", 409)
        _root(value)
        yield root
    finally:
        os.close(fd)


def inspect_target(value):
    root = _root(value)
    current = root / value["current_name"]
    try:
        info = current.lstat()
    except FileNotFoundError:
        return {"pointer": None, "resolved_path": None}
    if not stat.S_ISLNK(info.st_mode):
        problem("STATIC_POINTER_TYPE", "The selected current entry must be an actual release symlink, or absent for the first edition.", 409)
    literal = os.readlink(current)
    path = current.resolve(strict=True)
    if not path.is_relative_to(root) or path == root or path.is_symlink() or not path.is_dir():
        problem("STATIC_POINTER_SCOPE", "The current release must resolve to an ordinary output directory inside its configured root.", 409)
    return {"pointer": literal, "resolved_path": str(path)}


def _file_digest(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            problem("STATIC_FILE_TYPE", "Static output must contain ordinary files.", 409)
        h = hashlib.sha256()
        length = 0
        with os.fdopen(os.dup(fd), "rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                h.update(block)
                length += len(block)
        after = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            problem("STATIC_FILE_CHANGED", "A static output file changed during verification.", 409)
        return h.hexdigest(), length
    finally:
        os.close(fd)


def verify_tree(path, rows):
    if path.is_symlink() or not path.is_dir():
        problem("STATIC_OUTPUT_MISSING", "The complete selected output directory is unavailable.", 409)
    expected = {r["path"]: r for r in rows}
    actual = set()
    for directory, directories, files in os.walk(path, followlinks=False):
        directories.sort()
        files.sort()
        for name in directories:
            child = Path(directory) / name
            if child.is_symlink() or not child.is_dir():
                problem("STATIC_OUTPUT_LINK", "The complete static edition cannot include linked directories.", 409)
        for name in files:
            child = Path(directory) / name
            key = relative(child.relative_to(path).as_posix())
            if key not in expected or child.is_symlink():
                problem("STATIC_OUTPUT_SET", "The output has an unretained path: " + key, 409)
            row = expected[key]
            if _file_digest(child) != (row["sha256"], row["bytes"]):
                problem("STATIC_OUTPUT_BYTES", "The output differs from the retained edition: " + key, 409)
            actual.add(key)
    if actual != set(expected):
        problem("STATIC_OUTPUT_SET", "The output is missing paths from the complete edition.", 409)


def _directory(path, mode=0o755):
    try:
        path.mkdir(mode=mode)
        sync_dir(path.parent)
    except FileExistsError:
        pass
    if path.is_symlink() or not path.is_dir():
        problem("STATIC_DIRECTORY_TYPE", "A retained release path is not an ordinary directory.", 409)
    return path


def immutable_json(path, value):
    raw = canonical(value)
    if path.exists() or path.is_symlink():
        if path.is_symlink() or not path.is_file() or path.read_bytes() != raw:
            problem("STATIC_RETAINED_CHANGED", "The original retained release file differs: " + path.name, 409)
        return
    fd, name = tempfile.mkstemp(prefix=".write-", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            if path.is_symlink() or path.read_bytes() != raw:
                problem("STATIC_RETAINED_CHANGED", "A different original release file already exists.", 409)
        sync_dir(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def _area(value):
    root = _root(value)
    base = _directory(_directory(root / ".govhub-static") / value["namespace"])
    immutable_json(base / "owner.json", {
        "schema": "govhub.static-target-directory.v1", "namespace": value["namespace"],
        "target_id": value["target_id"], "root_device": value["root_device"],
        "root_inode": value["root_inode"], "current_name": value["current_name"],
    })
    _directory(base / "editions")
    _directory(base / "releases")
    return base


def _cancel(ws, operation):
    from govhub import GovHubError
    with ws.connect() as db:
        current = ws._operation(db, operation["id"])
    if current.get("cancel_requested"):
        raise GovHubError("STATIC_CANCELLED", "The original static operation was cancelled; completed staged files remain retained.", 409)
    if ws._worker_stop.is_set():
        raise GovHubError("STATIC_PAUSED", "The original worker is closing; complete staged files and the original checkpoint remain retained.", 409)


def _checkpoint(ws, value, stage, detail, **extra):
    binding = {"schema": "govhub.static-resume.v1", "operation_id": value["id"],
               "target_id": value["static_target_id"], "target_sha256": value["static_target"]["sha256"],
               "edition_id": value["static_edition"]["id"], "edition_sha256": value["static_edition"]["sha256"]}
    binding.update(extra)
    unsafe = bool(value.get("native_attempted")) or stage == "PUBLISH_READY"
    ws._native_checkpoint(value["id"], {"stage": stage, "detail": detail,
        "safe_to_retry": not unsafe, "mutation_started": unsafe, "resume_checkpoint": binding})


def _stage(ws, operation, selected, rows, base):
    identifier = selected["id"]
    final = base / "editions" / identifier
    metadata = {"schema": "govhub.static-staged-edition.v1", "edition_id": identifier,
                "edition_sha256": selected["sha256"], "files_sha256": selected["files_sha256"],
                "file_count": selected["file_count"], "total_bytes": selected["total_bytes"],
                "files": [{k: row[k] for k in ("path", "bytes", "sha256")} for row in rows]}
    if final.exists() or final.is_symlink():
        if final.is_symlink() or not final.is_dir():
            problem("STATIC_STAGE_IDENTITY", "The retained edition path changed.", 409)
        immutable_json(final / "edition.json", metadata)
        verify_tree(final / "site", rows)
        return final
    stage = _directory(base / ("stage-" + operation["id"] + "-" + identifier))
    immutable_json(stage / "owner.json", {"operation_id": operation["id"], "edition_id": identifier,
                                        "edition_sha256": selected["sha256"]})
    site = _directory(stage / "site")
    temporary = _directory(stage / "transfer", 0o700)
    for index, row in enumerate(rows):
        _cancel(ws, operation)
        output = site
        parts = relative(row["path"]).split("/")
        for component in parts[:-1]:
            output = _directory(output / component)
        output /= parts[-1]
        if output.exists() or output.is_symlink():
            if output.is_symlink() or _file_digest(output) != (row["sha256"], row["bytes"]):
                problem("STATIC_STAGE_BYTES", "An already staged file differs from this original edition: " + row["path"], 409)
        else:
            with ws.connect() as db:
                item = ws._file_row(db, row["file_id"])
            if (item["sha256"], item["bytes"]) != (row["sha256"], row["bytes"]):
                problem("STATIC_SOURCE_BINDING", "A retained source row changed.", 409)
            source = ws._verify_file(item)
            scratch = temporary / (sha(row["path"].encode()) + ".partial")
            if scratch.is_symlink() or scratch.exists() and not scratch.is_file():
                problem("STATIC_PARTIAL_TYPE", "The retained partial transfer is not an ordinary file.", 409)
            scratch.unlink(missing_ok=True)
            fd = os.open(scratch, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            try:
                h = hashlib.sha256()
                size = 0
                with os.fdopen(fd, "wb") as out, source.open("rb") as original:
                    for block in iter(lambda: original.read(1024 * 1024), b""):
                        _cancel(ws, operation)
                        out.write(block)
                        h.update(block)
                        size += len(block)
                    out.flush()
                    os.fsync(out.fileno())
                if (h.hexdigest(), size) != (row["sha256"], row["bytes"]):
                    problem("STATIC_TRANSFER_BYTES", "The source changed while staging: " + row["path"], 409)
                os.chmod(scratch, 0o444)
                os.link(scratch, output)
                sync_dir(output.parent)
            finally:
                scratch.unlink(missing_ok=True)
        if index == 0 or (index + 1) % 50 == 0 or index + 1 == len(rows):
            _checkpoint(ws, operation, "STAGING", "Retained " + str(index + 1) + " of " + str(len(rows)) + " complete output files",
                        staged_edition_id=identifier, completed=index + 1, total=len(rows))
    verify_tree(site, rows)
    immutable_json(stage / "edition.json", metadata)
    for directory, directories, files in os.walk(site, topdown=False):
        os.chmod(directory, 0o555)
        sync_dir(directory)
    sync_dir(stage)
    # There is one original worker and the target lock is held. A preexisting
    # complete directory is still treated as an immutable identity, never replaced.
    if final.exists():
        immutable_json(final / "edition.json", metadata)
        verify_tree(final / "site", rows)
    else:
        os.rename(stage, final)
        sync_dir(final.parent)
    return final


def _pins(ws, db, value, *, completing=False):
    current = ws._operation(db, value["id"])
    if current.get("worker_owner") != ws._worker_owner or current["state"] != "RUNNING":
        problem("STATIC_WORKER_CHANGED", "The original worker no longer owns this operation.", 409)
    if completing:
        # This is only permission to inspect/reconcile the retained action.
        # Current account/configuration/review checks still precede a new replace.
        return current
    old = current_release(ws, db, value["static_target_id"])
    if (old["id"] if old else None) != (value["static_previous"]["id"] if value["static_previous"] else None):
        problem("STATIC_RELEASE_CHANGED", "Another retained release became current. Preserve this original operation and compare the current target.", 409)
    ws._authorize(value["queued_actor"])
    selected = target(ws, db, value["static_target_id"])
    if selected["id"] != value["static_target"]["id"]:
        problem("STATIC_TARGET_CHANGED", "The configured target changed after this original operation was queued.", 409)
    environment = _environment(ws, db, selected)
    if environment["revision"] != value["environment"]["revision"]:
        problem("STATIC_ENVIRONMENT_CHANGED", "The native environment changed after this operation was queued.", 409)
    if value["type"] == "STATIC_PUBLISH":
        review = _latest_review(ws, db, value["static_plan"]["id"])
        if not review or review["id"] != value["static_review"]["id"] or review["decision"] != "APPROVE":
            problem("STATIC_REVIEW_CHANGED", "The current review changed after publication was queued.", 409)
    if current.get("cancel_requested"):
        problem("STATIC_CANCELLED", "The original static operation was cancelled.", 409)
    return current


def is_unresolved_selection(value):
    checkpoint = value.get("resume_checkpoint") or {}
    return (value.get("type") in {"STATIC_PUBLISH", "STATIC_ROLLBACK"}
            and value.get("native_attempted") is True
            and checkpoint.get("schema") == "govhub.static-resume.v1")


def _resume_binding(value):
    if not is_unresolved_selection(value):
        return False
    checkpoint = value["resume_checkpoint"]
    expected = {"operation_id": value["id"], "target_id": value["static_target_id"],
                "target_sha256": value["static_target"]["sha256"],
                "edition_id": value["static_edition"]["id"],
                "edition_sha256": value["static_edition"]["sha256"]}
    if any(checkpoint.get(key) != val for key, val in expected.items()):
        problem("STATIC_RESUME_CHANGED", "The unresolved selection checkpoint belongs to different original input.", 409)
    return True


def _cancel_before_selection(ws, value, out, observed):
    from govhub import now
    body = {"schema": "govhub.static-cancellation.v1", "operation_id": value["id"],
            "target_id": value["static_target_id"], "target_sha256": value["static_target"]["sha256"],
            "observed_pointer": observed["pointer"], "action": "No pointer replacement performed"}
    receipt = _receipt(out / "static-cancelled.json", body)
    digest, count = _file_digest(out / "static-cancelled.json")
    result = {"status": "CANCELLED", "safe_to_retry": True, "observations": receipt,
              "artifacts": [{"role": "static_cancellation_receipt", "path": str(out / "static-cancelled.json"),
                             "size": count, "sha256": digest}]}
    with ws.connect(write=True) as db:
        current = _pins(ws, db, value, completing=True)
        capture, artifacts = ws._capture_result_files(db, current, result, out)
        current.update(state="CANCELLED", native_attempted=False, native_result=result,
                       actual_finished_at=receipt["completed_at"], error=None,
                       native_capture_file_id=capture["id"], retained_artifacts=list({(r["file"]["id"], r["role"]): r for r in [*current.get("retained_artifacts", []), *artifacts]}.values()),
                       progress={"completed": 0, "total": value["static_edition"]["file_count"],
                                 "stage": "CANCELLED", "detail": "Original current pointer unchanged; cancellation reconciled"})
        ws._write_operation(db, current, current["author"], "Static cancellation reconciled before selection")


def _context_now(ws, db, value):
    account = db.execute("SELECT u.name,u.role,COALESCE(d.disabled,0) AS disabled FROM users u LEFT JOIN govhub_disabled_users d ON d.username=u.name WHERE u.name=?", (value["author"],)).fetchone()
    environment = db.execute("SELECT revision FROM entities WHERE kind='environments' AND id=?", (value["environment_id"],)).fetchone()
    selected = ws._setting(db, "static.target:" + value["static_target_id"])
    current = current_release(ws, db, value["static_target_id"])
    review = _latest_review(ws, db, value["static_plan"]["id"]) if value.get("static_plan") else None
    expected = {"target_revision": value["static_target"]["id"], "environment_revision": value["environment"]["revision"],
                "release_id": (value.get("static_previous") or {}).get("id"),
                "review_id": (value.get("static_review") or {}).get("id"),
                "account": {"name": value["queued_actor"]["name"], "role": value["queued_actor"]["role"], "disabled": 0}}
    observed = {"target_revision": selected, "environment_revision": environment["revision"] if environment else None,
                "release_id": current["id"] if current else None, "review_id": review["id"] if review else None,
                "account": dict(account) if account else None}
    return {"expected_before_action": expected, "observed_when_recording": observed,
            "changed_fields": [key for key in expected if expected[key] != observed[key]]}


def _receipt(path, body):
    from govhub import now
    if path.exists() or path.is_symlink():
        if path.is_symlink() or not path.is_file():
            problem("STATIC_RECEIPT_CHANGED", "The retained operation receipt changed.", 409)
        value = json.loads(path.read_bytes())
        if any(value.get(key) != val for key, val in body.items()) or set(value) != set(body) | {"completed_at"}:
            problem("STATIC_RECEIPT_CHANGED", "The retained operation receipt belongs to different input.", 409)
        return value
    value = dict(body, completed_at=now())
    immutable_json(path, value)
    return value


def _reconciled_stage(configured, selected, rows, operation_id, before, after, observed):
    root = _root(configured)
    base = root / ".govhub-static" / configured["namespace"]
    staged = base / "editions" / selected["id"]
    selection = base / "releases" / operation_id
    for path in (root / ".govhub-static", base, base / "editions", staged,
                 staged / "site", base / "releases", selection):
        if path.is_symlink() or not path.is_dir() or path.resolve(strict=True) != path:
            problem("STATIC_SELECTION_CHANGED", "The already selected original release directory changed.", 409)
    expected_files = {
        base / "owner.json": {
            "schema": "govhub.static-target-directory.v1", "namespace": configured["namespace"],
            "target_id": configured["target_id"], "root_device": configured["root_device"],
            "root_inode": configured["root_inode"], "current_name": configured["current_name"]},
        staged / "edition.json": {
            "schema": "govhub.static-staged-edition.v1", "edition_id": selected["id"],
            "edition_sha256": selected["sha256"], "files_sha256": selected["files_sha256"],
            "file_count": selected["file_count"], "total_bytes": selected["total_bytes"],
            "files": [{k: row[k] for k in ("path", "bytes", "sha256")} for row in rows]},
        selection / "selection.json": {
            "schema": "govhub.static-selection.v1", "operation_id": operation_id,
            "target_id": configured["target_id"], "target_sha256": configured["sha256"],
            "edition_id": selected["id"], "edition_sha256": selected["sha256"],
            "before_pointer": before, "after_pointer": after},
    }
    for path, expected in expected_files.items():
        if path.is_symlink() or not path.is_file() or path.read_bytes() != canonical(expected):
            problem("STATIC_SELECTION_CHANGED", "The already selected pointer lacks its exact original retained identity.", 409)
    link = selection / "site"
    if not link.is_symlink() or os.readlink(link) != "../../editions/" + selected["id"] + "/site":
        problem("STATIC_SELECTION_CHANGED", "The actual original release selection changed.", 409)
    if observed["resolved_path"] != str(staged / "site"):
        problem("STATIC_SELECTION_CHANGED", "The current pointer resolves outside its original staged edition.", 409)
    verify_tree(staged / "site", rows)
    return staged


def run_operation(ws, value):
    from govhub import now
    selected = value["static_edition"]
    configured = value["static_target"]
    out = ws.root / "native-operations" / value["id"]
    out.mkdir(parents=True, exist_ok=True, mode=0o700)
    if out.is_symlink() or not out.resolve().is_relative_to(ws.root):
        problem("STATIC_OPERATION_DIRECTORY", "The original operation directory changed.", 409)
    unresolved = _resume_binding(value)
    with ws.connect(write=True) as db:
        current = _pins(ws, db, value, completing=unresolved)
        current["actual_started_at"] = current.get("actual_started_at") or now()
        value = ws._write_operation(db, current, current["author"], "Static native operation started")
        if ws._get(db, "static_target", configured["id"]) != configured or edition(ws, db, selected["id"]) != selected:
            problem("STATIC_QUEUED_SOURCE", "The queued operation differs from its immutable original target or edition.", 409)
        rows = manifest(ws, db, selected)
        previous_edition = edition(ws, db, value["static_previous"]["edition_id"]) if value["static_previous"] else None
        previous_rows = manifest(ws, db, previous_edition) if previous_edition else []
    with target_lock(configured):
        already_selected = False
        if unresolved:
            before = value["static_previous"]["pointer"] if value["static_previous"] else None
            after = ".govhub-static/" + configured["namespace"] + "/releases/" + value["id"] + "/site"
            observed = inspect_target(configured)
            if observed["pointer"] not in (before, after):
                problem("STATIC_POINTER_CHANGED", "The unresolved original selection has a different actual pointer.", 409)
            if observed["pointer"] == after:
                staged = _reconciled_stage(configured, selected, rows, value["id"], before, after, observed)
                before_pointer, after_pointer = before, after
                already_selected = True
            else:
                with ws.connect() as db:
                    current = ws._operation(db, value["id"])
                if current.get("cancel_requested"):
                    return _cancel_before_selection(ws, value, out, observed)
                with ws.connect() as db:
                    _pins(ws, db, value)
                value["native_attempted"] = False
        if not already_selected:
            _checkpoint(ws, value, "VERIFY_STATIC_SOURCE", "Verifying the complete retained static edition")
            base = _area(configured)
            staged = _stage(ws, value, selected, rows, base)
            before_pointer = value["static_previous"]["pointer"] if value["static_previous"] else None
            after_pointer = None
            if value["type"] != "STATIC_STAGE":
                if previous_edition:
                    _stage(ws, value, previous_edition, previous_rows, base)
                selected_release = _directory(base / "releases" / value["id"])
                link = selected_release / "site"
                literal = "../../editions/" + selected["id"] + "/site"
                if link.exists() or link.is_symlink():
                    if not link.is_symlink() or os.readlink(link) != literal:
                        problem("STATIC_SELECTION_CHANGED", "The retained release selection differs from this original operation.", 409)
                else:
                    os.symlink(literal, link)
                    sync_dir(selected_release)
                after_pointer = str(link.relative_to(_root(configured)))
                intent = {"schema": "govhub.static-selection.v1", "operation_id": value["id"],
                          "target_id": configured["target_id"], "target_sha256": configured["sha256"],
                          "edition_id": selected["id"], "edition_sha256": selected["sha256"],
                          "before_pointer": before_pointer, "after_pointer": after_pointer}
                immutable_json(selected_release / "selection.json", intent)
                observed = inspect_target(configured)
                completed_pointer = observed["pointer"] == after_pointer
                if not completed_pointer:
                    if observed["pointer"] != before_pointer:
                        problem("STATIC_POINTER_CHANGED", "The actual current pointer changed outside this original operation.", 409)
                    if previous_rows:
                        verify_tree(Path(observed["resolved_path"]), previous_rows)
                    _cancel(ws, value)
                    _checkpoint(ws, value, "PUBLISH_READY", "Complete edition and predecessor retained; ready for atomic pointer change",
                                before_pointer=before_pointer, after_pointer=after_pointer)
                    with ws.connect(write=True) as db:
                        _pins(ws, db, value)
                        # Hold the original database transaction across the single
                        # pointer replacement. Recovery uses this exact on-disk intent.
                        root = _root(configured)
                        temporary = root / (".current-" + value["id"])
                        if temporary.exists() or temporary.is_symlink():
                            if not temporary.is_symlink() or os.readlink(temporary) != after_pointer:
                                problem("STATIC_POINTER_TEMP", "A different pending pointer already exists.", 409)
                        else:
                            os.symlink(after_pointer, temporary)
                        sync_dir(root)
                        if inspect_target(configured)["pointer"] != before_pointer:
                            problem("STATIC_POINTER_CHANGED", "The current pointer changed immediately before publication.", 409)
                        os.replace(temporary, root / configured["current_name"])
                        sync_dir(root)
                if inspect_target(configured)["pointer"] != after_pointer:
                    problem("STATIC_POINTER_CHANGED", "The actual selected pointer differs after the original publication.", 409)
                verify_tree(staged / "site", rows)
            else:
                observed = inspect_target(configured)
                if observed["pointer"] != before_pointer:
                    problem("STATIC_POINTER_CHANGED", "The target's current pointer changed while this edition was staging.", 409)
        body = {"schema": "govhub.static-operation-result.v1", "operation_id": value["id"],
                "type": value["type"], "target_id": configured["target_id"],
                "target_sha256": configured["sha256"], "edition_id": selected["id"],
                "edition_sha256": selected["sha256"], "files_sha256": selected["files_sha256"],
                "file_count": selected["file_count"], "total_bytes": selected["total_bytes"],
                "staged_directory": str(staged), "before_pointer": before_pointer,
                "after_pointer": after_pointer, "plan_id": (value.get("static_plan") or {}).get("id"),
                "review_id": (value.get("static_review") or {}).get("id")}
        receipt = _receipt(out / "static-result.json", body)
        digest, count = _file_digest(out / "static-result.json")
        result = {"status": "COMPLETE", "safe_to_retry": True, "observations": receipt,
                  "artifacts": [{"role": "static_release_receipt", "path": str(out / "static-result.json"),
                                 "size": count, "sha256": digest}],
                  "provider_context": {"source_kind": "local-static-release",
                    "target_id": configured["target_id"], "release_root": configured["release_root"]}}
        with ws.connect(write=True) as db:
            current = _pins(ws, db, value, completing=after_pointer is not None)
            if after_pointer is not None and inspect_target(configured)["pointer"] != after_pointer:
                problem("STATIC_POINTER_CHANGED", "The actual pointer changed before original outcome retention.", 409)
            reconciliation = _context_now(ws, db, value)
            if value["type"] == "STATIC_STAGE":
                record = ws._object(db, "static_stage", dict(receipt, target_revision=configured["id"]),
                                    parent=value["static_plan"]["id"], actor=current["author"],
                                    object_id="static-stage-" + value["id"])
            else:
                record = ws._object(db, "static_release", {
                    "kind": "ROLLBACK" if value["type"] == "STATIC_ROLLBACK" else "PUBLISH",
                    "target_id": configured["target_id"], "target_revision": configured["id"],
                    "target": configured, "edition_id": selected["id"], "edition_sha256": selected["sha256"],
                    "pointer": after_pointer, "previous_release_id": (value["static_previous"] or {}).get("id"),
                    "restored_release_id": (value.get("static_rollback_to") or {}).get("id"),
                    "operation_id": value["id"], "plan_id": body["plan_id"], "review_id": body["review_id"],
                    "reason": value["reason"], "receipt": receipt, "reconciliation_context": reconciliation,
                }, parent=configured["target_id"], actor=current["author"],
                   object_id="static-release-" + value["id"])
                ws._set(db, "static.current:" + configured["target_id"], record["id"])
            current["native_result"] = result
            capture, artifacts = ws._capture_result_files(db, current, result, out)
            current.update(state="COMPLETE", native_attempted=False, actual_finished_at=receipt["completed_at"],
                           native_capture_file_id=capture["id"], retained_artifacts=list({(r["file"]["id"], r["role"]): r for r in [*current.get("retained_artifacts", []), *artifacts]}.values()),
                           static_result_id=record["id"], reconciliation_context=reconciliation, error=None,
                           progress={"completed": selected["file_count"], "total": selected["file_count"],
                                     "stage": "COMPLETE", "detail": "Complete static edition staged" if value["type"] == "STATIC_STAGE" else "Original atomic release selection retained"})
            ws._write_operation(db, current, current["author"], "Static release native result retained",
                                {"record_id": record["id"], "capture_file_id": capture["id"]})
