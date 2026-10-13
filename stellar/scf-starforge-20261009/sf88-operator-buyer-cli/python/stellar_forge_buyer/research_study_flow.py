"""Study Flow on the original Research dossier, transport and request journal.

No flow arithmetic, source acquisition, server or independent history lives here.
"""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import re

from .errors import StateError
from .research_workspace import _json, _request_id
from .storage import read

FLOW_SECTIONS = ("overview", "flows", "editions", "records", "reports", "studies",
                 "counts", "issues", "operations")
FLOW_CSV_SECTIONS = ("counts", "records", "reports", "studies", "reasons", "issues")
FLOW_FORMATS = ("json", "svg", "html", "csv")
_INPUT_LIMIT = 16 * 1024 * 1024
_MAX_INTEGER = 9007199254740991


def _need(value, code):
    if not value:
        raise StateError(code)


def _id(value):
    _need(isinstance(value, str) and 0 < len(value) <= 160 and
          not any(ord(c) < 32 or ord(c) == 127 or c in "/\\" for c in value),
          "FLOW_ID_REQUIRED")
    return value


def _revision(value):
    _need(type(value) is int and 1 <= value <= _MAX_INTEGER,
          "FLOW_REVISION_REQUIRED")
    return value


def _options(revision, **selection):
    result = {}
    if revision is not None:
        result["revision"] = _revision(revision)
    for key, value in selection.items():
        if value is not None:
            result[key] = _id(value)
    return result


def _page(options, offset, limit):
    _need(type(offset) is int and 0 <= offset <= _MAX_INTEGER and
          type(limit) is int and 1 <= limit <= 100, "FLOW_PAGE_INVALID")
    _need(offset == 0 or "revision" in options, "FLOW_PAGE_REVISION_REQUIRED")
    return {**options, "offset": offset, "limit": limit}


def _body(value):
    _need(isinstance(value, dict), "FLOW_INPUT_OBJECT_REQUIRED")
    result = deepcopy(value)
    _need(len(_json(result)) <= _INPUT_LIMIT, "FLOW_INPUT_TOO_LARGE")
    return result


def _review_request(value):
    # The original domain parser validates the whole definition, source basis
    # and action data. Keep the caller's envelope and JSON values unchanged.
    value = _body(value)
    _need(set(value).issubset({"requestId", "expectedRevision", "actor", "action", "flowId", "data"})
          and {"requestId", "expectedRevision", "actor", "action", "data"}.issubset(value),
          "FLOW_REQUEST_FIELDS_INVALID")
    _request_id(value["requestId"])
    _need(re.fullmatch(r"[A-Za-z0-9_-]{8,100}", value["requestId"]) is not None,
          "FLOW_REQUEST_ID_REQUIRED")
    _revision(value["expectedRevision"])
    _need(value["action"] in ("save", "review", "withdraw") and
          isinstance(value["data"], dict), "FLOW_ACTION_INVALID")
    _need(isinstance(value["actor"], dict), "FLOW_ACTOR_REQUIRED")
    if "flowId" in value:
        _id(value["flowId"])
    return value


class ResearchStudyFlow:
    """Operate a selected dossier through one existing ResearchWorkspace."""

    def __init__(self, workspace, dossier_id):
        self.workspace, self.dossier_id = workspace, _id(dossier_id)

    def read(self, *, revision=None, flow_id=None, edition_id=None,
             section="overview", offset=0, limit=30, cancel_event=None):
        _need(section in FLOW_SECTIONS, "FLOW_SECTION_INVALID")
        options = _page(_options(revision, flowId=flow_id, editionId=edition_id), offset, limit)
        options["section"] = section
        return self.workspace._read("study-flow", {
            "dossierId": self.dossier_id, "options": options}, cancel_event=cancel_event)

    def sources(self, *, revision=None, question_id=None, review_id=None,
                work_set_id=None, offset=0, limit=30, cancel_event=None):
        options = _page(_options(revision, questionId=question_id,
                                reviewId=review_id, workSetId=work_set_id), offset, limit)
        return self.workspace._read("study-flow-sources", {
            "dossierId": self.dossier_id, "options": options}, cancel_event=cancel_event)

    def _rows(self, page, revision, offset, section, total=None):
        _need(isinstance(page, dict) and isinstance(page.get("dossier"), dict) and
              page["dossier"].get("id") == self.dossier_id,
              "FLOW_PAGE_SOURCE_CHANGED")
        selected = _revision(page["dossier"].get("revision"))
        _need(revision is None or selected == revision, "FLOW_PAGE_REVISION_CHANGED")
        _need(page.get("section") == section and page.get("offset") == offset and
              isinstance(page.get("items"), list) and type(page.get("total")) is int and
              page["total"] >= offset + len(page["items"]), "FLOW_PAGE_CHANGED")
        _need(total is None or total == page["total"], "FLOW_PAGE_TOTAL_CHANGED")
        following = page.get("nextOffset")
        end = offset + len(page["items"])
        _need((following is None and end == page["total"]) or
              (type(following) is int and following == end and offset < end < page["total"]),
              "FLOW_PAGE_CURSOR_CHANGED")
        return selected, page["items"], following, page["total"]

    def iter_records(self, *, section, revision=None, flow_id=None, edition_id=None,
                     limit=100, cancel_event=None):
        """Yield every selected row, pinning the first returned dossier revision."""
        _need(section in FLOW_SECTIONS and section != "overview", "FLOW_ROWS_SECTION_REQUIRED")
        offset, total = 0, None
        while True:
            page = self.read(revision=revision, flow_id=flow_id, edition_id=edition_id,
                             section=section, offset=offset, limit=limit, cancel_event=cancel_event)
            revision, rows, following, total = self._rows(page, revision, offset, section, total)
            yield from rows
            if following is None:
                return
            offset = following

    def iter_sources(self, *, revision=None, question_id=None, review_id=None,
                     work_set_id=None, limit=100, cancel_event=None):
        """Yield all original occurrences without mixing current source revisions."""
        offset, total = 0, None
        while True:
            page = self.sources(revision=revision, question_id=question_id,
                                review_id=review_id, work_set_id=work_set_id,
                                offset=offset, limit=limit, cancel_event=cancel_event)
            revision, rows, following, total = self._rows(page, revision, offset, "source", total)
            yield from rows
            if following is None:
                return
            offset = following

    def report(self, *, revision=None, flow_id=None, edition_id=None, cancel_event=None):
        return self.workspace._read("study-flow-report", {
            "dossierId": self.dossier_id,
            "options": _options(revision, flowId=flow_id, editionId=edition_id)},
            cancel_event=cancel_event)

    def preview(self, definition, *, expected_revision, flow_id=None,
                source_mode="current", basis_edition_id=None, cancel_event=None):
        """Ask the original engine to assess an unsaved definition at the current head."""
        _need(source_mode in ("current", "retained"), "FLOW_SOURCE_MODE_INVALID")
        body = {"expectedRevision": _revision(expected_revision),
                "definition": deepcopy(definition), "sourceMode": source_mode}
        if flow_id is not None:
            body["flowId"] = _id(flow_id)
        if basis_edition_id is not None:
            body["basisEditionId"] = _id(basis_edition_id)
        return self.workspace._read("study-flow-preview", {
            "dossierId": self.dossier_id, "body": _body(body)}, cancel_event=cancel_event)

    def import_counts(self, body, *, filename, expected_revision, reason,
                      reference=None, cancel_event=None):
        """Parse the complete original CSV without committing a review or revision."""
        _need(isinstance(body, str) and isinstance(filename, str) and
              isinstance(reason, str), "FLOW_COUNT_INPUT_REQUIRED")
        value = {"expectedRevision": _revision(expected_revision), "body": body,
                 "filename": filename, "reason": reason}
        if reference is not None:
            value["reference"] = reference
        return self.workspace._read("study-flow-import-counts", {
            "dossierId": self.dossier_id, "body": _body(value)}, cancel_event=cancel_event)

    def import_counts_file(self, file, *, expected_revision, reason, reference=None, cancel_event=None):
        """Strict UTF-8 decoding retains BOM, CRLF and every original character."""
        file = Path(file)
        original = read(file, _INPUT_LIMIT)
        body = original.decode("utf-8", errors="strict")
        _need(body.encode("utf-8") == original, "FLOW_CSV_ENCODING_CHANGED")
        return self.import_counts(body, filename=file.name, expected_revision=expected_revision,
                                  reason=reason, reference=reference, cancel_event=cancel_event)

    def review(self, request, *, resume=False, cancel_event=None):
        """Retain and submit one exact save, review or withdrawal request."""
        value = _review_request(request)
        return self.workspace._write("study-flow-review",
            {"dossierId": self.dossier_id, "body": value},
            request_id=value["requestId"], replay_safe=True, resume=resume,
            cancel_event=cancel_event)

    def saved_request(self, request_id):
        record = self.workspace.call_record(request_id)
        saved = record["request"]
        _need(saved["action"] == "study-flow-review" and
              saved["input"].get("dossierId") == self.dossier_id,
              "FLOW_CALL_SELECTION_CHANGED")
        return record

    def recover(self, request_id, *, cancel_event=None):
        """Resume only the retained request, with the same expected revision and actor."""
        self.saved_request(request_id)
        return self.workspace.resume(request_id, cancel_event=cancel_event)

    def export(self, file, *, revision, flow_id=None, edition_id=None,
               format="json", section=None, expected_sha256=None, cancel_event=None):
        """Publish the original complete native file and verify its retained bytes."""
        _need(format in FLOW_FORMATS, "FLOW_EXPORT_FORMAT_INVALID")
        _need(section is None or format == "csv" and section in FLOW_CSV_SECTIONS,
              "FLOW_EXPORT_SECTION_INVALID")
        options = _options(_revision(revision), flowId=flow_id, editionId=edition_id)
        options["format"] = format
        if section is not None:
            options["section"] = section
        with self.workspace._operation(cancel_event) as event:
            return self.workspace._download("study-flow-export",
                {"dossierId": self.dossier_id, "options": options},
                file=file, expected_sha256=expected_sha256, _owned_event=event)

    def export_portable(self, file, *, revision, format="json.gz",
                        expected_sha256=None, cancel_event=None):
        """Download the original complete dossier archive, including all flow history."""
        _need(format in ("json", "json.gz"), "FLOW_PORTABLE_FORMAT_INVALID")
        with self.workspace._operation(cancel_event) as event:
            return self.workspace._download("export-dossier",
                {"dossierId": self.dossier_id,
                 "options": {"revision": _revision(revision), "format": format}},
                file=file, expected_sha256=expected_sha256, _owned_event=event)
