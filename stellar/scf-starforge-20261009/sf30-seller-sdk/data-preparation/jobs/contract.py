"""MIT. Complete commissioned pipeline selection through the original engine."""
from __future__ import annotations

import contextlib
import fcntl
import hashlib
import json
import os
import re
import shutil
import stat
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "pipelines"))
from engine import PipelineWorkspace, canonical, sha, PID, EID
from delivery import receive_project, export_project, deliver_results, report
from preparation import PreparationError, parse_json, digest

ORDER = "stellar-forge.preparation-pipeline-order.v1"
REQUEST = "stellar-forge.preparation-pipeline-job.v1"
RESULT = "stellar-forge.preparation-pipeline-job-result.v1"
PREPARED = "stellar-forge.preparation-pipeline-job-prepared.v1"
RECEIVED = "stellar-forge.preparation-pipeline-job-received.v1"
MAX_PROJECT = 28 * 1024 * 1024
MAX_SELECTION = 1024 * 1024
MAX_EXPANDED = 512 * 1024 * 1024
OUTPUT_LIMITS = {"report": 2 * 1024 * 1024, "results": 28 * 1024 * 1024,
                 "project": 28 * 1024 * 1024, "execution": 2 * 1024 * 1024}
OUTPUT_NAMES = {"report": "pipeline-report.html", "results": "pipeline-results.zip",
                "project": "pipeline-project.zip", "execution": "pipeline-execution.json"}


def need(condition, message):
    if not condition:
        raise PreparationError(message)


def regular(path, maximum):
    path = Path(path)
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and not path.is_symlink() and info.st_size <= maximum,
         "Select a complete regular file within the stated byte allowance")
    return info


def identity(path, maximum):
    before = regular(path, maximum)
    value = digest(Path(path))
    after = regular(path, maximum)
    need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
         (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
         "The selected file changed while its full identity was read")
    return {"bytes": after.st_size, "sha256": value}


def checked(path, expected, maximum):
    need(isinstance(expected, dict) and type(expected.get("bytes")) is int and
         0 <= expected["bytes"] <= maximum and isinstance(expected.get("sha256"), str) and
         re.fullmatch(r"[a-f0-9]{64}", expected["sha256"]),
         "Select an exact complete file identity")
    actual = identity(path, maximum)
    need(actual == {"bytes": expected["bytes"], "sha256": expected["sha256"]},
         "The complete selected file differs from its retained identity")
    return actual


def read_json(path, maximum=MAX_SELECTION):
    regular(path, maximum)
    return parse_json(Path(path).read_text(encoding="utf-8"))


def write_new(path, body):
    path = Path(path)
    data = body if isinstance(body, bytes) else (canonical(body) + "\n").encode("utf-8")
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    return identity(path, max(len(data), MAX_SELECTION))


def copy_checked(source, destination, expected, maximum):
    checked(source, expected, maximum)
    with Path(source).open("rb") as inp, os.fdopen(
            os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb") as out:
        shutil.copyfileobj(inp, out, 1024 * 1024)
        out.flush()
        os.fsync(out.fileno())
    checked(destination, expected, maximum)
    checked(source, expected, maximum)


@contextlib.contextmanager
def destination_lock(directory):
    directory = Path(directory).absolute()
    directory.parent.mkdir(parents=True, exist_ok=True)
    directory = directory.parent.resolve() / directory.name
    need(not directory.is_symlink(), "Select a private directory, not a symbolic link")
    key = hashlib.sha256(str(directory).encode()).hexdigest()
    path = directory.parent / (".pipeline-job-" + key + ".lock")
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield directory
    finally:
        os.close(fd)


def publish_directory(staging, directory):
    """Reserve this absent destination before publishing its complete prepared files."""
    directory.mkdir(mode=0o700)
    try:
        os.rename(staging, directory)
    except BaseException:
        with contextlib.suppress(OSError):
            directory.rmdir()
        raise
    fd = os.open(directory.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def selected_order(workspace, project, pipeline_id, revision, *, inputs=None, reuse=None):
    need(isinstance(pipeline_id, str) and PID.fullmatch(pipeline_id) and
         type(revision) is int and revision > 0, "Select a saved pipeline and its explicit positive revision")
    definition = workspace.definition(pipeline_id, revision)
    bindings = definition["inputs"] if inputs is None else inputs
    need(isinstance(bindings, dict) and set(bindings) == set(definition["inputs"]),
         "Select every named original input, without missing or extra names")
    sources = {}
    for alias, source_id in bindings.items():
        need(isinstance(source_id, str), "Each input selects an original source identifier")
        sources[alias] = workspace.native.get("sources", source_id)
    prior = None
    if reuse is not None:
        need(isinstance(reuse, str) and EID.fullmatch(reuse), "Select an original saved execution for reuse")
        record = workspace.execution(reuse)
        need(record["status"] != "RUNNING", "A running execution cannot be the selected reuse source")
        prior = {"id": reuse, "sha256": sha(record)}
    return {"schema": ORDER, "project": project,
            "pipeline": {"id": pipeline_id, "revision": revision, "sha256": sha(definition)},
            "definition": definition, "inputs": bindings, "sourceRecords": sources, "reuseExecution": prior}


def validate_order(workspace, order, project):
    need(isinstance(order, dict) and set(order) ==
         {"schema", "project", "pipeline", "definition", "inputs", "sourceRecords", "reuseExecution"} and
         order.get("schema") == ORDER, "Use the complete prepared pipeline selection")
    selected = order.get("pipeline")
    need(isinstance(selected, dict) and set(selected) == {"id", "revision", "sha256"},
         "The selected pipeline edition is incomplete")
    prior = order.get("reuseExecution")
    need(prior is None or isinstance(prior, dict) and set(prior) == {"id", "sha256"},
         "The explicit reuse selection is incomplete")
    actual = selected_order(workspace, project, selected["id"], selected["revision"],
                            inputs=order["inputs"], reuse=prior["id"] if prior else None)
    need(canonical(actual) == canonical(order),
         "The approved pipeline, parameters, source editions or selected prior execution differ from this project")
    return actual


def verify_retained_execution(workspace, result):
    """Retain this delivered execution while permitting independent later editions."""
    need(isinstance(result, dict) and result.get("schema") == RESULT,
         "Select the complete commissioned pipeline result")
    original = result["execution"]
    current = workspace.execution(original["id"])
    if original["status"] == "COMPLETE":
        need(canonical(current) == canonical(original), "The delivered completed execution has changed")
    else:
        # Resume updates the same saved execution. Preserve its selection and all
        # already complete work while allowing the original unfinished attempt to finish.
        mutable = {"status", "updatedAt", "finishedAt", "message", "stages", "outputs"}
        for key, value in original.items():
            if key not in mutable:
                need(key in current and canonical(current[key]) == canonical(value),
                     "The resumed execution differs from its original selected identity")
        need(set(current["stages"]) == set(original["stages"]),
             "The resumed execution changed its original stage selection")
        terminal = {"COMPLETE", "FAILED", "CANCELLED", "INTERRUPTED"}
        for sid, saved_stage in original["stages"].items():
            stage = current["stages"][sid]
            if saved_stage["status"] == "COMPLETE":
                need(canonical(stage) == canonical(saved_stage),
                     "A completed delivered stage changed during continuation")
                continue
            saved_attempts, attempts = saved_stage["attempts"], stage["attempts"]
            need(len(attempts) >= len(saved_attempts), "The original native attempt history was removed")
            for index, saved_attempt in enumerate(saved_attempts):
                attempt = attempts[index]
                if saved_attempt.get("status") in terminal:
                    need(canonical(attempt) == canonical(saved_attempt),
                         "A completed original native attempt record changed")
                else:
                    for key, value in saved_attempt.items():
                        if key not in {"status", "message", "finishedAt"}:
                            need(key in attempt and canonical(attempt[key]) == canonical(value),
                                 "A continued native attempt changed its original saved identity")
    need(sha(workspace.definition(current["pipelineId"], current["revision"])) ==
         result["selection"]["pipeline"]["sha256"], "The delivered pipeline edition has changed")
    for alias, source in current["inputOriginals"].items():
        need(canonical(workspace.native.get("sources", source["id"])) == canonical(source),
             "The delivered original source record has changed")
        checked(
            workspace.root / "originals" / source["sha256"],
            {"bytes": source["bytes"], "sha256": source["sha256"]}, MAX_EXPANDED)
    for state in current["stages"].values():
        if state["status"] == "COMPLETE":
            workspace._validate_complete(state)
    return current
