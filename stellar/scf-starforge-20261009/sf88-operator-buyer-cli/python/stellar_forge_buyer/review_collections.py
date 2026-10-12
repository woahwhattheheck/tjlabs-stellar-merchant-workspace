"""Complete original collection files and immutable members for ResourceLibrary.

This module uses the existing Node collection package and Python verified-file
transfer. Received directories remain the original collection source; revisions,
annotations and files are owned by the maintained native library.
"""
from __future__ import annotations

from typing import Any, Iterator

from ._review_transport import absolute
from ._review_transfer import ReviewFile, copy_native_file
from .errors import StateError


def _present(**values):
    return {key: value for key, value in values.items() if value is not None}


class CollectionDelivery:
    """Mixed into ResourceLibrary so delivery shares its one native process."""

    @classmethod
    def from_collection(cls, *, checkout, state, directory, archive=None,
                        resume=False, expected_sha256=None, max_bytes=None, **options):
        """Receive and open, or reopen, one original complete collection.

        Supplying archive performs the original create-only/resumable receipt
        before opening the directory. Without archive, a previously received
        manifest is opened and its original collection is adopted once. Later
        local annotations and collection revisions remain editable on reopen.
        """
        if archive is None and (resume or expected_sha256 is not None or max_bytes is not None):
            raise StateError("COLLECTION_ARCHIVE_REQUIRED")
        return cls(checkout=checkout, state=state, received_directory=directory,
            collection_archive=archive, collection_resume=resume,
            collection_expected_sha256=expected_sha256, collection_max_bytes=max_bytes,
            **options)

    @property
    def collection_receipt(self) -> dict[str, Any] | None:
        """The actual original receipt returned while opening this process."""
        receipt = self.runtime.get("collectionReceipt")
        return None if receipt is None else dict(receipt)

    def collection_members(self, collection_id: str, *, revision=None, offset=0,
                           limit=100, timeout=None, cancel_event=None):
        """Page full immutable members; the reply pins the actual chosen revision."""
        return self.invoke("collections.members", _present(id=collection_id,
            revision=revision, offset=offset, limit=limit),
            timeout=timeout, cancel_event=cancel_event)

    def iter_collection_members(self, collection_id: str, *, revision=None,
                                page_size=100, timeout=None, cancel_event=None
                                ) -> Iterator[dict[str, Any]]:
        """Pin the first native revision, including during concurrent later saves."""
        if type(page_size) is not int or not 1 <= page_size <= 200:
            raise StateError("REVIEW_PAGE_SIZE_INVALID")
        offset, chosen_revision, identity = 0, revision, None
        while True:
            page = self.collection_members(collection_id, revision=chosen_revision,
                offset=offset, limit=page_size, timeout=timeout, cancel_event=cancel_event)
            total, items, actual_revision = page.get("total"), page.get("items"), page.get("revision")
            current = (page.get("id"), actual_revision, page.get("collectionSha256"), total)
            if (page.get("id") != collection_id or type(actual_revision) is not int
                    or actual_revision < 1 or (chosen_revision is not None and actual_revision != chosen_revision)
                    or type(total) is not int or total < 0 or not isinstance(items, list)
                    or page.get("offset") != offset or len(items) > page_size
                    or offset + len(items) > total):
                raise StateError("COLLECTION_MEMBERS_PAGE_INVALID")
            if identity is not None and current != identity:
                raise StateError("COLLECTION_MEMBERS_REVISION_CHANGED")
            chosen_revision, identity = actual_revision, current
            expected_next = offset + len(items) if offset + len(items) < total else None
            if page.get("nextOffset") != expected_next:
                raise StateError("COLLECTION_MEMBERS_CURSOR_INVALID")
            yield from items
            if expected_next is None:
                return
            if not items:
                raise StateError("COLLECTION_MEMBERS_PAGE_INCOMPLETE")
            offset = expected_next

    def inspect_collection(self, archive, *, expected_sha256=None, max_bytes=None,
                           timeout=None, cancel_event=None):
        """Verify every original archive byte and return its compact native summary.

        The complete collection manifest stays in the archive. Use
        iter_collection_members after receipt for all original member records.
        """
        return self.invoke("collections.inspectArchive", _present(archive=absolute(archive),
            expectedSha256=expected_sha256, maxBytes=max_bytes),
            timeout=timeout, cancel_event=cancel_event)

    def receive_collection(self, archive, destination, *, resume=False,
                           expected_sha256=None, max_bytes=None, timeout=None,
                           cancel_event=None):
        """Receive original files into a private directory without switching this library."""
        return self.invoke("collections.receiveArchive", _present(archive=absolute(archive),
            destination=absolute(destination), resume=resume,
            expectedSha256=expected_sha256, maxBytes=max_bytes),
            timeout=timeout, cancel_event=cancel_event)

    def export_collection(self, collection_id: str, destination, *, revision: int,
                          max_bytes=None, **transfer_options) -> ReviewFile:
        """Download one exact collection revision with original full verified files.

        An explicit revision makes retries stable after a later collection edit.
        Existing transfer_directory, chunk_bytes, resume, cancellation and progress
        options belong to the maintained Python file-transfer implementation.
        """
        if type(revision) is not int or revision < 1:
            raise StateError("COLLECTION_EXPORT_REVISION_REQUIRED")
        return copy_native_file(self, _present(kind="collection", id=collection_id,
            revision=revision, format="tar", maxBytes=max_bytes),
            destination, **transfer_options)


__all__ = ["CollectionDelivery"]
