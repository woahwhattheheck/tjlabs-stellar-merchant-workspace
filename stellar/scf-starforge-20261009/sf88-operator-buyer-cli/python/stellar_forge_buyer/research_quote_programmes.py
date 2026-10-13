"""Retained Research quotation programmes and complete original receiving.

This client calls the installed Node programme, handover and receiving engines.
Python owns the local call journal and complete files; the existing native case
and dossier writers own their saved histories.
"""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import re
from typing import TYPE_CHECKING

from .errors import StateError
from .research_workspace import _json, _request_id
from .research_quotes import (
    ResearchQuotes, COMMANDS, _snapshot, _need, _hash, _absolute, _retained_input,
    _retained_file, _input_maximum, _INPUT_LIMIT, _FILE_LIMIT, _CASE_TRANSFER_LIMIT,
)
from .storage import digest, parse, private_directory, read

if TYPE_CHECKING:
    from .research_workspace import ResearchWorkspace
    from .research_quote_programme_types import (
        QuoteProgrammeInput, QuoteProgrammeStep, QuoteProgrammeState,
        QuoteProgrammeHandoverInput, QuoteProgrammeReceivingInput,
    )

_STEP = re.compile(r"[a-z0-9][a-z0-9._-]{0,79}")
_MEMBER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,179}")
_WORKSPACE = re.compile(r"research_[a-f0-9]{64}")
_PROGRAMME = "sf88-research-quotation-programme/v1"
_HANDOVER = "sf88-research-quotation-handover/v1"
_HANDOVER_INSPECTED = "sf88-research-quotation-handover-inspected/v1"
_RECEIVING = "sf88-research-quotation-programme-receiving/v1"
_RECEIVED = "sf88-research-quotation-programme-received/v1"
_MEMBER_LIMIT = max(_FILE_LIMIT, _CASE_TRANSFER_LIMIT + 65536)
_WRITES = {
    "quotes-programme-create", "quotes-programme-submit", "quotes-programme-apply",
    "quotes-programme-replay", "quotes-programme-export", "quotes-programme-copy",
    "quotes-programme-receive-prepare", "quotes-programme-receive",
}
_LOCAL = {
    "quotes-programme-state", "quotes-programme-step", "quotes-programme-inspect",
    "quotes-programme-copy", "quotes-programme-receiving",
}


def _step_id(value):
    _need(isinstance(value, str) and _STEP.fullmatch(value), "RESEARCH_QUOTE_PROGRAMME_STEP_REQUIRED")
    return value


def _member(value):
    _need(isinstance(value, str) and 0 < len(value) <= 1200, "RESEARCH_QUOTE_HANDOVER_FILE_INVALID")
    parts = value.split("/")
    _need(len(parts) <= 10 and all(_MEMBER.fullmatch(part) and part not in {".", ".."}
                                 for part in parts), "RESEARCH_QUOTE_HANDOVER_FILE_INVALID")
    return parts


def _member_path(root, name):
    parts = _member(name)
    selected = root
    for part in parts[:-1]:
        selected = private_directory(selected / part, create=False)
    return selected / parts[-1]


def _programme_file(root, selected, *, maximum):
    _need(isinstance(selected, dict) and isinstance(selected.get("name"), str) and
          type(selected.get("bytes")) is int and 0 <= selected["bytes"] <= maximum,
          "RESEARCH_QUOTE_PROGRAMME_FILE_CHANGED")
    _hash(selected.get("sha256"))
    return _retained_file({**selected, "path": str(_member_path(root, selected["name"]))}, maximum)


def _verify_programme(value):
    _need(isinstance(value, dict) and value.get("schema") == _PROGRAMME,
          "RESEARCH_QUOTE_PROGRAMME_CHANGED")
    header = value.get("programme")
    _need(isinstance(header, dict) and
          header.get("schema") == "sf88-research-quotation-programme-retained/v1" and
          _WORKSPACE.fullmatch(header.get("workspaceId", "")),
          "RESEARCH_QUOTE_PROGRAMME_CHANGED")
    _hash(header.get("inputSha256")); _hash(header.get("sourceSha256"))
    root = private_directory(Path(value["directory"]), create=False)
    selected = header.get("inputFile")
    _need(isinstance(selected, dict) and selected.get("name") == "programme-input.json",
          "RESEARCH_QUOTE_PROGRAMME_INPUT_CHANGED")
    file = _programme_file(root, selected, maximum=_INPUT_LIMIT)
    _need(file.json(limit=_INPUT_LIMIT) == header.get("input"), "RESEARCH_QUOTE_PROGRAMME_INPUT_CHANGED")
    return value


def _verify_step(value):
    _need(isinstance(value, dict) and value.get("schema") == "sf88-research-quotation-programme-step/v1",
          "RESEARCH_QUOTE_PROGRAMME_STEP_CHANGED")
    record, file = value.get("record"), value.get("inputFile")
    _need(isinstance(record, dict) and isinstance(file, dict) and
          record.get("stepId") == value.get("summary", {}).get("stepId"),
          "RESEARCH_QUOTE_PROGRAMME_STEP_CHANGED")
    _step_id(record["stepId"])
    selected = record.get("inputFile")
    _need(isinstance(selected, dict) and selected.get("name") == "step-input.json" and
          file.get("path") == str(Path(value["directory"]) / "step-input.json") and
          file.get("bytes") == selected.get("bytes") and file.get("sha256") == selected.get("sha256"),
          "RESEARCH_QUOTE_PROGRAMME_INPUT_CHANGED")
    maximum = _input_maximum(record["selection"]["command"])
    with _retained_file(file, maximum).open():
        pass
    return value


class ResearchQuoteProgrammeHandover:
    """Complete portable package with offline, whole-file reopening.

    The supplied manifest SHA is the original native handoff promise. Reopening
    verifies that exact manifest and every roster member. Native receiving also
    runs the original semantic inspector before the original writers are called.
    """
    def __init__(self, result):
        value = _snapshot(result)
        _need(isinstance(value, dict) and value.get("schema") == _HANDOVER_INSPECTED,
              "RESEARCH_QUOTE_HANDOVER_REQUIRED")
        directory = value.get("directory")
        _need(isinstance(directory, str) and Path(directory).is_absolute(),
              "RESEARCH_QUOTE_HANDOVER_DIRECTORY_CHANGED")
        self.directory = private_directory(Path(directory), create=False)
        _hash(value.get("manifestSha256"))
        _need(type(value.get("manifestBytes")) is int and 0 < value["manifestBytes"] <= _FILE_LIMIT,
              "RESEARCH_QUOTE_HANDOVER_MANIFEST_CHANGED")
        self._manifest_file = _retained_file({
            "path": str(self.directory / "quotation-programme.json"),
            "bytes": value["manifestBytes"], "sha256": value["manifestSha256"],
        })
        manifest = self._manifest_file.json(limit=_FILE_LIMIT)
        _need(isinstance(manifest, dict) and manifest.get("schema") == _HANDOVER and
              isinstance(manifest.get("selection"), dict) and
              manifest.get("selection") == value.get("selection") and
              (value.get("manifest") is None or value["manifest"] == manifest),
              "RESEARCH_QUOTE_HANDOVER_MANIFEST_CHANGED")
        roster = manifest.get("files")
        _need(isinstance(roster, list) and 0 < len(roster) <= 40000,
              "RESEARCH_QUOTE_HANDOVER_FILES_CHANGED")
        files = value.get("files")
        _need(isinstance(files, list) and len(files) == len(roster),
              "RESEARCH_QUOTE_HANDOVER_FILES_CHANGED")
        self._files = {}
        for selected, file in zip(roster, files):
            _need(isinstance(selected, dict) and set(selected) == {"name", "bytes", "sha256"} and
                  isinstance(file, dict) and set(file) == {"name", "bytes", "sha256", "path"} and
                  {key: item for key, item in file.items() if key != "path"} == selected and
                  selected["name"] != "quotation-programme.json" and selected["name"] not in self._files,
                  "RESEARCH_QUOTE_HANDOVER_FILES_CHANGED")
            path = _member_path(self.directory, selected["name"])
            _need(file["path"] == str(path), "RESEARCH_QUOTE_HANDOVER_FILE_CHANGED")
            self._files[selected["name"]] = _programme_file(self.directory, selected, maximum=_MEMBER_LIMIT)
        selected_case = manifest["selection"].get("caseRecord")
        _need(isinstance(selected_case, dict) and selected_case.get("name") in self._files and
              selected_case in roster, "RESEARCH_QUOTE_HANDOVER_CASE_CHANGED")
        self._record, self._manifest = value, manifest
        self.verify()

    @classmethod
    def reopen(cls, directory, *, expected_manifest_sha256):
        root = private_directory(Path(directory).expanduser().absolute(), create=False)
        body = read(root / "quotation-programme.json", _FILE_LIMIT)
        _need(digest(body) == _hash(expected_manifest_sha256), "RESEARCH_QUOTE_HANDOVER_MANIFEST_CHANGED")
        value = parse(body)
        _need(isinstance(value, dict) and isinstance(value.get("files"), list),
              "RESEARCH_QUOTE_HANDOVER_MANIFEST_CHANGED")
        files = [{**item, "path": str(_member_path(root, item["name"]))} for item in value["files"]]
        return cls({"schema": _HANDOVER_INSPECTED, "directory": str(root),
                    "manifestSha256": expected_manifest_sha256, "manifestBytes": len(body),
                    "manifest": value, "selection": value.get("selection"), "files": files})

    @property
    def record(self):
        return deepcopy(self._record)

    @property
    def manifest(self):
        return deepcopy(self._manifest)

    @property
    def selection(self):
        return deepcopy(self._manifest["selection"])

    @property
    def names(self):
        return tuple(self._files)

    @property
    def case_record(self):
        """Return the original complete CASE_RECORD file with its dedicated native bound."""
        return self.file(self._manifest["selection"]["caseRecord"]["name"])

    def operation_export(self, operation_id):
        """Open one complete original native operation/export selection."""
        selected = [item for item in self._manifest["selection"]["operations"] if item["id"] == operation_id]
        _need(len(selected) == 1, "RESEARCH_QUOTE_HANDOVER_OPERATION_UNKNOWN")
        return self.file(selected[0]["name"])

    def step_input(self, step_id):
        """Open the complete original request body for a selected saved step."""
        _need(_step_id(step_id) in self._manifest["selection"]["stepIds"],
              "RESEARCH_QUOTE_HANDOVER_STEP_UNKNOWN")
        return self.file("requests/" + step_id + ".json")

    def file(self, name):
        _need(name in self._files, "RESEARCH_QUOTE_HANDOVER_FILE_UNKNOWN")
        return self._files[name]

    def verify(self):
        with self._manifest_file.open():
            pass
        for file in self._files.values():
            with file.open():
                pass
        return {"directory": str(self.directory), "manifestSha256": self._record["manifestSha256"],
                "manifestBytes": self._record["manifestBytes"], "selection": self.selection,
                "files": deepcopy(self._manifest["files"])}


class ResearchQuoteProgrammes(ResearchQuotes):
    """Native programme creation, execution, full handover and destination receiving."""
    _writes = _WRITES
    _local = _LOCAL

    def __init__(self, workspace: ResearchWorkspace):
        super().__init__(workspace)

    @staticmethod
    def _verify_completed(action, result):
        if action == "quotes-programme-create":
            return _verify_programme(result)
        if action in {"quotes-programme-submit", "quotes-programme-apply", "quotes-programme-replay"}:
            return _verify_step(result)
        if action in {"quotes-programme-export", "quotes-programme-copy"}:
            ResearchQuoteProgrammeHandover(result)
        elif action == "quotes-programme-receive-prepare":
            _verify_receiving(result)
        elif action == "quotes-programme-receive":
            _need(isinstance(result, dict) and result.get("schema") == _RECEIVED and
                  isinstance(result.get("destination"), dict), "RESEARCH_QUOTE_PROGRAMME_RECEIVING_RESULT_CHANGED")
            package = ResearchQuoteProgrammeHandover.reopen(
                result["sourceDirectory"], expected_manifest_sha256=result["manifestSha256"])
            _need(package.selection == result.get("source"), "RESEARCH_QUOTE_PROGRAMME_RECEIVING_SOURCE_CHANGED")
        else:
            _need(action in _WRITES, "RESEARCH_QUOTE_PROGRAMME_ACTION_INVALID")
        return result

    def _input_write(self, action, selected, *, value=None, input_file=None,
                     expected_input_sha256=None, call_id, resume=False, cancel_event=None):
        selected = _snapshot(selected)
        captured = _snapshot(value) if value is not None else None
        with self.workspace._operation(cancel_event) as event:
            root = self.workspace._directory_for_call(_request_id(call_id), create=True)
            pins, _ = _retained_input(root / "quote-input", value=captured, source=input_file,
                expected_sha256=expected_input_sha256, maximum=_input_maximum(selected.get("command")))
            return self._write(action, {**selected, **pins}, call_id=call_id, resume=resume, _owned_event=event)

    def create(self, directory, value: QuoteProgrammeInput | None = None, *,
               input_file=None, expected_input_sha256=None, call_id, resume=False, cancel_event=None):
        return self._input_write("quotes-programme-create", {"directory": _absolute(directory)},
            value=value, input_file=input_file, expected_input_sha256=expected_input_sha256,
            call_id=call_id, resume=resume, cancel_event=cancel_event)

    def state(self, directory, *, cancel_event=None) -> QuoteProgrammeState:
        return _verify_programme(self._read("quotes-programme-state",
            {"directory": _absolute(directory)}, cancel_event=cancel_event))

    def step(self, directory, step_id, *, cancel_event=None) -> QuoteProgrammeStep:
        return _verify_step(self._read("quotes-programme-step",
            {"directory": _absolute(directory), "stepId": _step_id(step_id)}, cancel_event=cancel_event))

    @staticmethod
    def step_input(result):
        """Open the whole original raw input; large cases are never placed in stdout."""
        _verify_step(result)
        return _retained_file(result["inputFile"], _input_maximum(result["record"]["selection"]["command"]))

    def submit(self, directory, step_id, command, value=None, *, input_file=None,
               expected_input_sha256=None, action=None, profile=None, call_id,
               resume=False, cancel_event=None) -> QuoteProgrammeStep:
        _need(command in COMMANDS, "RESEARCH_QUOTE_COMMAND_INVALID")
        selected = {"directory": _absolute(directory), "stepId": _step_id(step_id), "command": command}
        for key, item in (("action", action), ("profile", profile)):
            if item is not None:
                selected[key] = item
        return self._input_write("quotes-programme-submit", selected, value=value, input_file=input_file,
            expected_input_sha256=expected_input_sha256, call_id=call_id, resume=resume, cancel_event=cancel_event)

    def apply(self, directory, source_step_id, step_id, *, review_sha256,
              call_id, resume=False, cancel_event=None) -> QuoteProgrammeStep:
        _need(source_step_id != step_id, "RESEARCH_QUOTE_PROGRAMME_DISTINCT_STEP_REQUIRED")
        return self._write("quotes-programme-apply", {"directory": _absolute(directory),
            "sourceStepId": _step_id(source_step_id), "stepId": _step_id(step_id),
            "reviewSha256": _hash(review_sha256)}, call_id=call_id, resume=resume, cancel_event=cancel_event)

    def replay(self, directory, source_step_id, step_id, *, call_id,
               resume=False, cancel_event=None) -> QuoteProgrammeStep:
        """Reach the exact original request through a distinct native step and durable Python write."""
        _need(source_step_id != step_id, "RESEARCH_QUOTE_PROGRAMME_DISTINCT_STEP_REQUIRED")
        return self._write("quotes-programme-replay", {"directory": _absolute(directory),
            "sourceStepId": _step_id(source_step_id), "stepId": _step_id(step_id)},
            call_id=call_id, resume=resume, cancel_event=cancel_event)

    def export(self, directory, value: QuoteProgrammeHandoverInput | None = None, *,
               input_file=None, expected_input_sha256=None, call_id, resume=False, cancel_event=None):
        return self._input_write("quotes-programme-export", {"directory": _absolute(directory)},
            value=value, input_file=input_file, expected_input_sha256=expected_input_sha256,
            call_id=call_id, resume=resume, cancel_event=cancel_event)

    def inspect(self, directory, *, manifest_sha256=None, cancel_event=None):
        selected = {"directory": _absolute(directory)}
        if manifest_sha256 is not None:
            selected["manifestSha256"] = _hash(manifest_sha256)
        result = self._read("quotes-programme-inspect", selected, cancel_event=cancel_event)
        ResearchQuoteProgrammeHandover(result)
        return result

    def copy(self, directory, *, source_directory=None, manifest_sha256=None,
             call_id, resume=False, cancel_event=None):
        selected = {"directory": _absolute(directory)}
        if source_directory is not None:
            selected["sourceDirectory"] = _absolute(source_directory)
        if manifest_sha256 is not None:
            selected["manifestSha256"] = _hash(manifest_sha256)
        return self._write("quotes-programme-copy", selected, call_id=call_id,
                           resume=resume, cancel_event=cancel_event)

    def prepare_receiving(self, directory, value: QuoteProgrammeReceivingInput | None = None, *,
                          source_directory=None, manifest_sha256=None, input_file=None,
                          expected_input_sha256=None, call_id, resume=False, cancel_event=None):
        selected = {"directory": _absolute(directory)}
        if source_directory is not None:
            selected["sourceDirectory"] = _absolute(source_directory)
        if manifest_sha256 is not None:
            selected["manifestSha256"] = _hash(manifest_sha256)
        return self._input_write("quotes-programme-receive-prepare", selected,
            value=value, input_file=input_file, expected_input_sha256=expected_input_sha256,
            call_id=call_id, resume=resume, cancel_event=cancel_event)

    def receive(self, directory, *, review_sha256, call_id, resume=False, cancel_event=None):
        return self._write("quotes-programme-receive", {"directory": _absolute(directory),
            "reviewSha256": _hash(review_sha256)}, call_id=call_id,
            resume=resume, cancel_event=cancel_event)

    def receiving(self, directory, *, cancel_event=None):
        result = self._read("quotes-programme-receiving", {"directory": _absolute(directory)},
                            cancel_event=cancel_event)
        return _verify_receiving(result)

    @staticmethod
    def handover(result):
        return ResearchQuoteProgrammeHandover(result)


def _verify_receiving(value):
    _need(isinstance(value, dict) and value.get("schema") == _RECEIVING and
          value.get("status") in {"PREPARING", "REVIEWED", "COMPLETE"},
          "RESEARCH_QUOTE_PROGRAMME_RECEIVING_CHANGED")
    selected = value.get("source")
    _need(isinstance(selected, dict), "RESEARCH_QUOTE_PROGRAMME_RECEIVING_SOURCE_CHANGED")
    package = ResearchQuoteProgrammeHandover.reopen(
        selected["directory"], expected_manifest_sha256=selected["manifestSha256"])
    _need(package.selection == selected.get("selection") and
          package.selection == value.get("request", {}).get("source"),
          "RESEARCH_QUOTE_PROGRAMME_RECEIVING_SOURCE_CHANGED")
    if value["status"] == "COMPLETE":
        _need(value.get("result", {}).get("schema") == _RECEIVED and
              value["result"].get("source") == package.selection,
              "RESEARCH_QUOTE_PROGRAMME_RECEIVING_RESULT_CHANGED")
    return value
