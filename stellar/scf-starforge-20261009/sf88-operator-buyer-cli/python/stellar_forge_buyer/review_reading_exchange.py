"""Typed Python calls into the original Node research and handover owners."""
from __future__ import annotations

from typing import Any, Iterator

from ._review_transfer import ReviewFile, copy_native_file
from .errors import StateError


class ResearchDelivery:
    """Shares ResourceLibrary's existing process, private transport and file receiver."""

    def research_status(self) -> dict[str, Any]:
        return self.invoke("research.status")

    def research_index(self, *, timeout=None, cancel_event=None):
        return self.invoke("research.index", timeout=timeout, cancel_event=cancel_event)

    def research_search(self, query: str, *, mode="all", build=None, resource_id=None, offset=0, limit=25):
        values = {"q": query, "mode": mode, "offset": offset, "limit": limit}
        if build is not None:
            values["build"] = build
        if resource_id is not None:
            values["resourceId"] = resource_id
        return self.invoke("research.search", values)

    def iter_research_results(self, query: str, *, mode="all", build=None, resource_id=None, page_size=100) -> Iterator[dict[str, Any]]:
        offset, pinned = 0, build
        while True:
            page = self.research_search(query, mode=mode, build=pinned, resource_id=resource_id, offset=offset, limit=page_size)
            if pinned is not None and page["build"] != pinned:
                raise StateError("RESEARCH_BUILD_CHANGED")
            pinned = page["build"]
            yield from page["items"]
            following = page["nextOffset"]
            if following is None:
                return
            if following != offset + len(page["items"]) or following <= offset:
                raise StateError("RESEARCH_CURSOR_INVALID")
            offset = following

    def research_saved(self):
        return self.invoke("research.saved")

    def save_research_query(self, *, name, query, operation_id, mode="all", record_id=None, expected_revision=0):
        value = {"name": name, "q": query, "mode": mode, "operationId": operation_id, "expectedRevision": expected_revision}
        if record_id is not None:
            value["id"] = record_id
        return self.invoke("research.save", value)

    def capture_reading(self, *, name, note="", query=None, mode="all", build=None, resource_id=None,
                        saved_query_id=None, saved_query_revision=None, selection_mode="passage", items=None):
        """Pin all findings or an explicit sequence of native resource/ordinal choices."""
        values = {"name": name, "note": note, "selectionMode": selection_mode, "query": {}}
        if query is not None:
            values["query"].update(q=query, mode=mode)
        if build is not None:
            values["query"]["build"] = build
        if resource_id is not None:
            values["query"]["resourceId"] = resource_id
        if saved_query_id is not None:
            values.update(savedQueryId=saved_query_id, savedQueryRevision=saved_query_revision)
        if items is not None:
            values["items"] = items
        return self.invoke("research.capture", values)

    def prepare_reading(self, capture_sha256, *, collection_id, expected_revision, operation_id,
                        timeout=None, cancel_event=None):
        return self.invoke("research.prepare", {"captureSha256": capture_sha256, "collectionId": collection_id,
            "expectedRevision": expected_revision, "operationId": operation_id}, timeout=timeout, cancel_event=cancel_event)

    def reading_handover_status(self):
        return self.invoke("research.handovers")

    def reading_handover_operation(self, operation_id):
        return self.invoke("research.operation", {"operationId": operation_id})

    def download_reading_handover(self, operation_id, destination, **transfer_options) -> ReviewFile:
        """Use the existing complete, resumable, create-only native download."""
        return copy_native_file(self, {"kind": "reading-handover", "id": operation_id, "format": "zip"},
                                destination, **transfer_options)
