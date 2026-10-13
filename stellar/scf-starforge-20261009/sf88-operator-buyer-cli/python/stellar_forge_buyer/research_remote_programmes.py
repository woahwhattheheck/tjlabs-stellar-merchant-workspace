"""Remote Research programme calls through the installed original Node owner.

Python retains exact inputs, complete replies and uncertain attempts. The
ResearchProgrammeOperator owns original HTTP clients, transfers and receiving.
"""
from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
import re
import os
import stat
import tempfile
import threading

from .errors import NativeError, StateError
from .result import FileDelivery
from .runtime import Runtime
from .research_workspace import _Cancellation, _json, _now, _request_id
from .storage import digest, dump, lock, parse, private_directory, read, sync_directory, write

REMOTE_PROGRAMME_COMMANDS = (
    "info", "jobs", "job", "resume", "state", "step", "submit", "receiving",
    "bundle", "files", "file_info", "retain", "retained", "read", "release",
    "archive", "upload", "upload_source", "transfer", "transfer_status", "export",
)
REMOTE_ARGUMENT_LIMIT = 16 * 1024 * 1024
REMOTE_REPLY_LIMIT = 603_027_776
REMOTE_ARCHIVE_LIMIT = 24_128_742_234_216
_SCHEMA = "stellar-forge.research-remote-python.v1"
_MODE = "RESEARCH_PROGRAMME_REMOTE_BRIDGE"
_HASH = re.compile(r"[a-f0-9]{64}")
_ALIAS = re.compile(r"[a-z][a-z0-9_-]{0,63}")
_WORKSPACE = re.compile(r"research_[a-f0-9]{64}")


def _need(value, code):
    if not value:
        raise StateError(code)


def _absolute(value):
    path = Path(os.path.abspath(os.path.expanduser(os.fspath(value))))
    _need(not any(ord(character) < 32 or ord(character) == 127 for character in str(path)),
          "RESEARCH_REMOTE_PATH_INVALID")
    return path

def _private_configuration(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        _need(stat.S_ISREG(before.st_mode) and before.st_size <= 1024 * 1024 and
              before.st_nlink == 1 and not before.st_mode & 0o077 and
              (not hasattr(os, "getuid") or before.st_uid == os.getuid()),
              "RESEARCH_REMOTE_PRIVATE_CONFIGURATION_REQUIRED")
        data = stream.read(1024 * 1024 + 1)
        after = os.fstat(stream.fileno())
        _need(len(data) == before.st_size and
              (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
              (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
              "RESEARCH_REMOTE_CONFIGURATION_CHANGED")
        return data


def _same_file(path, data):
    """Finish only this original create-only publication and its matching links."""
    try:
        write(path, data, exclusive=True)
    except FileExistsError:
        _need(read(path, len(data) + 1) == data, "RESEARCH_REMOTE_RETAINED_FILE_CHANGED")
    info = path.lstat()
    _need(stat.S_ISREG(info.st_mode), "RESEARCH_REMOTE_RETAINED_FILE_CHANGED")
    if info.st_nlink > 1:
        for stage in path.parent.iterdir():
            if not stage.name.startswith(".write-"):
                continue
            try:
                candidate = stage.lstat()
            except FileNotFoundError:
                continue
            if (stat.S_ISREG(candidate.st_mode) and
                    (candidate.st_dev, candidate.st_ino) == (info.st_dev, info.st_ino)):
                stage.unlink()
        _need(path.lstat().st_nlink == 1, "RESEARCH_REMOTE_RETAINED_FILE_LINK_CHANGED")
    sync_directory(path.parent)

def _file(metadata, maximum=REMOTE_REPLY_LIMIT):
    _need(isinstance(metadata, dict) and isinstance(metadata.get("path"), str) and
          Path(metadata["path"]).is_absolute() and type(metadata.get("bytes")) is int and
          0 <= metadata["bytes"] <= maximum and isinstance(metadata.get("sha256"), str) and
          _HASH.fullmatch(metadata["sha256"]), "RESEARCH_REMOTE_FILE_INVALID")
    return FileDelivery({"returncode": 0, "native": {"status": "SAVED", "file": deepcopy(metadata)}},
                        Path(metadata["path"]), maximum)


class ResearchRemoteError(NativeError):
    """The original attempt, including whether its remote outcome is uncertain."""
    def __init__(self, record, *, call_id):
        self.record = deepcopy(record)
        self.call_id = call_id
        native = record.get("native") or {}
        self.outcome_unknown = bool(record.get("outcomeUnknown"))
        self.file = deepcopy(native.get("file"))
        super().__init__(record.get("runtimeError") or native.get("error") or
                         "RESEARCH_REMOTE_CALL_FAILED",
                         returncode=record.get("returncode"), operation=call_id)


@dataclass(frozen=True)
class ResearchRemoteResult:
    """Whole immutable native JSON reply and, for export, complete product bytes."""
    _record: dict

    @property
    def record(self):
        return deepcopy(self._record)

    @property
    def file(self):
        return _file(self._record["result"]["file"])

    @property
    def workspace_id(self):
        return self._record["result"]["workspaceId"]

    @property
    def exported_file(self):
        value = self._record["result"].get("exportedFile")
        return None if value is None else _file(value, REMOTE_ARCHIVE_LIMIT)

    def json(self, *, limit=16 * 1024 * 1024):
        return self.file.json(limit=limit)

    def verify(self):
        with self.file.open():
            pass
        exported = self.exported_file
        if exported is not None:
            with exported.open():
                pass
        return self.record


class ResearchRemoteProgrammes:
    """All original remote programme operations with durable local call recovery.

    Every invoke retains its first complete response, including read snapshots.
    Use a fresh call_id for a fresh read, recover for an interrupted original
    call, and replay with a distinct call_id to submit that exact request again.
    """
    def __init__(self, *, directory, checkout=None, configuration_file=None,
                 node="node", environment=None, timeout=360):
        _need(type(timeout) in (int, float) and not isinstance(timeout, bool) and
              1 <= timeout <= 3600, "RUNTIME_LIMIT_INVALID")
        self.directory = private_directory(Path(directory))
        self.checkout = None if checkout is None else str(_absolute(checkout))
        self.configuration_file = None if configuration_file is None else _absolute(configuration_file)
        self.node = node
        self.environment = None if environment is None else dict(environment)
        self.timeout = timeout
        self._condition = threading.Condition()
        self._active = set()
        self._closed = False
        private_directory(self.directory / "calls")

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def close(self):
        with self._condition:
            self._closed = True
            for event in self._active:
                event.set()
            while self._active:
                self._condition.wait(0.5)

    @contextmanager
    def _operation(self, cancel_event=None):
        _need(cancel_event is None or isinstance(cancel_event, threading.Event),
              "NATIVE_CANCEL_EVENT_INVALID")
        event = _Cancellation(cancel_event)
        with self._condition:
            _need(not self._closed, "RESEARCH_REMOTE_CLIENT_CLOSED")
            self._active.add(event)
        try:
            yield event
        finally:
            with self._condition:
                self._active.discard(event)
                self._condition.notify_all()

    def _root(self, call_id, *, create=False):
        return private_directory(self.directory / "calls" / digest(_request_id(call_id).encode()),
                                 create=create)

    def _configuration(self, *, new_call):
        with lock(self.directory):
            selected = self.directory / "configuration-selection.json"
            data_file = self.directory / "configuration.json"
            if selected.exists():
                record = parse(read(selected, 65536))
                _need(record.get("schema") == _SCHEMA, "RESEARCH_REMOTE_CONFIGURATION_CHANGED")
                data = read(data_file, 1024 * 1024)
                _need(len(data) == record.get("bytes") and digest(data) == record.get("sha256"),
                      "RESEARCH_REMOTE_CONFIGURATION_CHANGED")
                _same_file(data_file, data)
                _same_file(selected, _json(record))
                if new_call and self.configuration_file is not None:
                    incoming = _private_configuration(self.configuration_file)
                    _need(incoming == data, "RESEARCH_REMOTE_CONFIGURATION_CHANGED")
                return record, parse(data)
            _need(self.configuration_file is not None, "RESEARCH_REMOTE_CONFIGURATION_REQUIRED")
            data = _private_configuration(self.configuration_file)
            value = parse(data)
            _need(isinstance(value, dict) and
                  value.get("schema") == "stellar-forge.research-programme-operator.v1" and
                  isinstance(value.get("directory"), str) and Path(value["directory"]).is_absolute() and
                  isinstance(value.get("workspaces"), list), "RESEARCH_REMOTE_CONFIGURATION_INVALID")
            original = Path(value["directory"]).resolve()
            _need(original != self.directory and original not in self.directory.parents and
                  self.directory not in original.parents, "RESEARCH_REMOTE_DIRECTORY_OVERLAP")
            for definition in value["workspaces"]:
                _need(isinstance(definition, dict) and _ALIAS.fullmatch(definition.get("id", "")) and
                      _WORKSPACE.fullmatch(definition.get("workspaceId", "")),
                      "RESEARCH_REMOTE_CONFIGURATION_INVALID")
            record = {"schema": _SCHEMA, "source": str(self.configuration_file),
                      "file": str(data_file), "bytes": len(data), "sha256": digest(data)}
            _same_file(data_file, data)
            _same_file(selected, _json(record))
            return record, value

    def configuration(self):
        """Inspect the complete retained declaration without opening either host."""
        record, value = self._configuration(new_call=False)
        return {**record, "configuration": value}

    def _arguments(self, root, arguments, input_file, expected_input_sha256):
        _need(arguments is None or input_file is None, "RESEARCH_REMOTE_ONE_INPUT_REQUIRED")
        if expected_input_sha256 is not None:
            _need(isinstance(expected_input_sha256, str) and _HASH.fullmatch(expected_input_sha256),
                  "RESEARCH_REMOTE_INPUT_HASH_INVALID")
        path = root / "arguments.json"
        if input_file is None:
            raw = _json({} if arguments is None else arguments)
            source = None
        else:
            source = str(_absolute(input_file))
            if Path(source).exists():
                raw = read(Path(source), REMOTE_ARGUMENT_LIMIT)
            else:
                _need(path.exists(), "RESEARCH_REMOTE_INPUT_UNAVAILABLE")
                raw = read(path, REMOTE_ARGUMENT_LIMIT)
        _need(len(raw) <= REMOTE_ARGUMENT_LIMIT and isinstance(parse(raw), dict),
              "RESEARCH_REMOTE_ARGUMENTS_INVALID")
        _need(expected_input_sha256 is None or digest(raw) == expected_input_sha256,
              "RESEARCH_REMOTE_INPUT_CHANGED")
        _same_file(path, raw)
        return {"path": str(path), "bytes": len(raw), "sha256": digest(raw), "source": source}

    def _request(self, root):
        request = parse(read(root / "request.json", 1024 * 1024))
        _need(request.get("schema") == _SCHEMA and request.get("command") in REMOTE_PROGRAMME_COMMANDS,
              "RESEARCH_REMOTE_REQUEST_CHANGED")
        _request_id(request.get("callId"))
        _need(self._root(request["callId"]) == root, "RESEARCH_REMOTE_REQUEST_CHANGED")
        args = request.get("arguments")
        _need(isinstance(args, dict) and args.get("path") == str(root / "arguments.json"),
              "RESEARCH_REMOTE_REQUEST_CHANGED")
        raw = read(root / "arguments.json", REMOTE_ARGUMENT_LIMIT)
        _need(len(raw) == args.get("bytes") and digest(raw) == args.get("sha256") and
              isinstance(parse(raw), dict), "RESEARCH_REMOTE_INPUT_CHANGED")
        _same_file(root / "arguments.json", raw)
        _same_file(root / "request.json", _json(request))
        return request

    def _finished(self, root, request):
        result_file = root / "completed.json"
        if not result_file.exists():
            return None
        result = parse(read(result_file, 1024 * 1024))
        _need(result.get("schema") == _SCHEMA and result.get("requestSha256") == digest(_json(request)) and
              result.get("workspaceId") == request.get("workspaceId") and
              result.get("file", {}).get("path") == str(root / "reply.json") and
              (request["command"] == "export") == (result.get("exportedFile") is not None) and
              (request["command"] != "export" or result["exportedFile"].get("path") == request["file"]),
              "RESEARCH_REMOTE_RESULT_CHANGED")
        details = {"request": request, "result": result}
        attempts = root / "attempts"
        if attempts.exists():
            records = sorted(p for p in attempts.iterdir() if p.is_dir())
            if records and (records[-1] / "result.json").exists():
                details["attempt"] = parse(read(records[-1] / "result.json", 1024 * 1024))
        value = ResearchRemoteResult(details)
        value.verify()
        return value

    def _guard_output(self, file, config, request_input=None):
        target = _absolute(file)
        _need(target != self.directory and self.directory not in target.resolve().parents,
              "RESEARCH_REMOTE_OUTPUT_OVERLAP")
        protected = [self.configuration_file, Path(config["directory"])]
        protected += [Path(x["connectionFile"]) for x in config["workspaces"]]
        protected += [Path(x["file"]) for x in config.get("sources", [])]
        if request_input is not None:
            protected.append(_absolute(request_input))
        _need(all(p is None or target.resolve() != p.resolve() for p in protected),
              "RESEARCH_REMOTE_OUTPUT_OVERLAP")
        return str(target)

    def invoke(self, workspace, command, arguments=None, *, input_file=None,
               expected_input_sha256=None, file=None, call_id, resume=False,
               cancel_event=None):
        # Capture mutable input before entering any blocking lock or native work.
        captured = None if arguments is None else parse(_json(arguments))
        _need(isinstance(workspace, str) and _ALIAS.fullmatch(workspace) and
              command in REMOTE_PROGRAMME_COMMANDS, "RESEARCH_REMOTE_COMMAND_INVALID")
        _need((command == "export") == (file is not None), "RESEARCH_REMOTE_EXPORT_FILE_REQUIRED")
        with self._operation(cancel_event) as event:
            root = self._root(call_id, create=True)
            with lock(root):
                existing = self._request(root) if (root / "request.json").exists() else None
                configuration, config = self._configuration(new_call=existing is None)
                matches = [x for x in config["workspaces"] if x["id"] == workspace]
                _need(len(matches) == 1, "RESEARCH_REMOTE_WORKSPACE_UNDECLARED")
                selected = self._arguments(root, captured, input_file, expected_input_sha256)
                request = {"schema": _SCHEMA, "callId": _request_id(call_id),
                    "workspace": workspace, "workspaceId": matches[0]["workspaceId"],
                    "command": command, "arguments": selected,
                    "configurationSha256": configuration["sha256"],
                    "file": None if file is None else self._guard_output(file, config, input_file),
                    "replayOf": None}
                if existing is not None:
                    _need(all(existing.get(k) == v for k, v in request.items()),
                          "RESEARCH_REMOTE_CALL_ID_REUSED")
                    request = existing
                else:
                    _same_file(root / "request.json", _json(request))
                return self._execute(root, request, resume=resume, event=event)

    def _execute(self, root, request, *, resume, event):
        completed = self._finished(root, request)
        if completed is not None:
            return completed
        # A native reply was published before stdout/cleanup failure. Its exact
        # first receipt precedes every possible connection or donor access.
        bridge_receipt = root / "native-completed.json"
        if bridge_receipt.exists():
            return self._complete(root, request, parse(read(bridge_receipt, 1024 * 1024)))
        attempts = private_directory(root / "attempts")
        previous = sorted(p for p in attempts.iterdir() if p.is_dir())
        if previous and not resume:
            last = previous[-1] / "result.json"
            record = parse(read(last, 1024 * 1024)) if last.exists() else {
                "runtimeError": "RESEARCH_REMOTE_CALL_INTERRUPTED", "outcomeUnknown": True}
            raise ResearchRemoteError(record, call_id=request["callId"])
        _need(self.checkout is not None, "ORIGINAL_NODE_RUNTIME_REQUIRED")
        configuration, _ = self._configuration(new_call=False)
        _need(configuration["sha256"] == request["configurationSha256"],
              "RESEARCH_REMOTE_CONFIGURATION_CHANGED")
        runtime = Runtime(self.checkout, node=self.node, environment=self.environment,
                          timeout=self.timeout, output_limit=1024 * 1024)
        attempt = private_directory(attempts / str(len(previous) + 1).zfill(8))
        bridge_request = {"schema": _SCHEMA, "request": request, "requestSha256": digest(_json(request)),
            "configuration": configuration, "replyFile": str(root / "reply.json"),
            "receiptFile": str(bridge_receipt), "journalDirectory": str(self.directory)}
        dump(attempt / "request.json", bridge_request, exclusive=True)
        dump(attempt / "started.json", {"number": len(previous) + 1, "startedAt": _now()}, exclusive=True)
        try:
            native = runtime.run(["--request", attempt / "request.json"],
                target="research-programme-remote", cancel_event=event)
            record = {"returncode": native.returncode, "runtimeError": native.error,
                "interrupted": native.interrupted, "processStarted": True,
                "outcomeUnknown": True, "native": native.output, "finishedAt": _now()}
        except NativeError as error:
            record = {"returncode": None, "runtimeError": error.code, "processStarted": False,
                      "outcomeUnknown": False, "native": None, "finishedAt": _now()}
        except StateError as error:
            if error.code not in {"NATIVE_CANCELLED_BEFORE_START", "NATIVE_CANCEL_EVENT_INVALID",
                                  "ORIGINAL_RUNTIME_TARGET_INVALID", "ORIGINAL_APPLICATION_RUNTIME_REQUIRED"}:
                raise
            record = {"returncode": None, "runtimeError": error.code, "processStarted": False,
                      "outcomeUnknown": False, "native": None, "finishedAt": _now()}
        if bridge_receipt.exists():
            result = self._complete(root, request, parse(read(bridge_receipt, 1024 * 1024)))
            record["outcomeUnknown"] = False
            dump(attempt / "result.json", record, exclusive=True)
            return self._finished(root, request)
        output = record.get("native") or {}
        if output.get("mode") == _MODE and output.get("outcomeUnknown") is False:
            record["outcomeUnknown"] = False
        dump(attempt / "result.json", record, exclusive=True)
        raise ResearchRemoteError(record, call_id=request["callId"])

    def _complete(self, root, request, result):
        _need(isinstance(result, dict) and result.get("schema") == _SCHEMA and
              result.get("requestSha256") == digest(_json(request)) and
              result.get("workspaceId") == request["workspaceId"] and
              result.get("file", {}).get("path") == str(root / "reply.json") and
              (request["command"] == "export") == (result.get("exportedFile") is not None) and
              (request["command"] != "export" or result["exportedFile"].get("path") == request["file"]),
              "RESEARCH_REMOTE_RESULT_CHANGED")
        value = ResearchRemoteResult({"request": request, "result": result})
        value.verify()
        _same_file(root / "completed.json", _json(result))
        return self._finished(root, request)

    def saved(self, call_id):
        root = self._root(call_id)
        with lock(root):
            request = self._request(root)
            result = self._finished(root, request)
            if result is None and (root / "native-completed.json").exists():
                result = self._complete(root, request, parse(read(root / "native-completed.json", 1024 * 1024)))
            _need(result is not None, "RESEARCH_REMOTE_CALL_NOT_COMPLETE")
            return result

    def recover(self, call_id, *, cancel_event=None):
        with self._operation(cancel_event) as event:
            root = self._root(call_id)
            with lock(root):
                return self._execute(root, self._request(root), resume=True, event=event)

    def replay(self, source_call_id, *, call_id, cancel_event=None, resume=False):
        _need(call_id != source_call_id, "RESEARCH_REMOTE_DISTINCT_REPLAY_REQUIRED")
        with self._operation(cancel_event) as event:
            source_root = self._root(source_call_id)
            original = self._request(source_root)
            raw = read(source_root / "arguments.json", REMOTE_ARGUMENT_LIMIT)
            root = self._root(call_id, create=True)
            with lock(root):
                selected = {**original["arguments"], "path": str(root / "arguments.json")}
                request = {**original, "callId": _request_id(call_id), "arguments": selected,
                           "replayOf": original["callId"]}
                if (root / "request.json").exists():
                    _need(self._request(root) == request, "RESEARCH_REMOTE_CALL_ID_REUSED")
                _same_file(root / "arguments.json", raw)
                _same_file(root / "request.json", _json(request))
                return self._execute(root, request, resume=resume, event=event)

    def calls(self, *, offset=0, limit=100):
        _need(type(offset) is int and offset >= 0 and type(limit) is int and
              1 <= limit <= 250, "RESEARCH_REMOTE_PAGE_INVALID")
        records = []
        for root in (self.directory / "calls").iterdir():
            if root.is_dir() and (root / "request.json").exists():
                value = self._request(root)
                records.append({k: value[k] for k in ("callId", "workspace", "workspaceId",
                                                     "command", "replayOf")})
                records[-1]["completed"] = (root / "completed.json").exists()
        records.sort(key=lambda x: x["callId"])
        end = offset + limit
        return {"items": records[offset:end], "total": len(records),
                "nextOffset": end if end < len(records) else None}
