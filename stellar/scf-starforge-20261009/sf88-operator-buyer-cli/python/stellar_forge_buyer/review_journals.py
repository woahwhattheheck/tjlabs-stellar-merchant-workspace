"""Complete returned journals, delegated to the original native review engine."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, TYPE_CHECKING

from ._review_transport import absolute
from ._review_transfer import copy_native_file

if TYPE_CHECKING:
    from .review_library import ResourceLibrary, Comparison


def _present(**values):
    return {key: value for key, value in values.items() if value is not None}


@dataclass
class ReviewReception:
    """The selected native format and its unchanged receiving result."""
    format: str
    observed: dict[str, Any]

    @property
    def id(self) -> str:
        return self.observed["id"]


class JournalDelivery:
    def receive_review(self, path, *, operation_id: str, stage_return=False,
                       return_format="auto", label=None, expected_sha256=None) -> ReviewReception:
        result = self.invoke("review.receive", _present(path=absolute(path),
            operationId=operation_id, stageReturn=stage_return, returnFormat=return_format,
            label=label, sha256=expected_sha256))
        return ReviewReception(result["format"], result["result"])

    def receive_journal(self, path, *, operation_id: str, expected_sha256=None) -> Comparison:
        from .review_library import Comparison
        record = self.invoke("reviewReturns.receive", _present(path=absolute(path),
            operationId=operation_id, sha256=expected_sha256))
        return Comparison(record["id"], self, record)

    def stage_journal(self, path, *, operation_id: str, label=None,
                      expected_sha256=None) -> JournalReturn:
        record = self.invoke("reviewReturns.stage", _present(path=absolute(path),
            operationId=operation_id, label=label, sha256=expected_sha256))
        return JournalReturn(record["id"], self, record)

    def journal_return(self, plan_id: str, *, offset=0, limit=50,
                       classification="") -> JournalReturn:
        record = self.invoke("reviewReturns.inspect", {"id": plan_id, "options":
            dict(offset=offset, limit=limit, classification=classification)})
        return JournalReturn(record["id"], self, record)

    def journal_returns(self, *, comparison_id=None, offset=0, limit=50):
        return self.invoke("reviewReturns.list", _present(comparisonId=comparison_id,
            offset=offset, limit=limit))

    def iter_journal_returns(self, *, comparison_id=None, page_size=100):
        from .review_library import _iterate
        return _iterate(self.journal_returns, comparison_id=comparison_id, page_size=page_size)

    def journal_history(self, source_id: str, *, target=None, offset=0, limit=100):
        return self.invoke("reviewReturns.sourceHistory", {"id": source_id,
            "options": _present(target=target, offset=offset, limit=limit)})

    def iter_journal_history(self, source_id: str, *, target=None, page_size=100):
        from .review_library import _iterate
        return _iterate(lambda **options: self.journal_history(source_id, **options),
                        target=target, page_size=page_size)

    def verify_journal(self, path, *, expected_sha256=None):
        return self.invoke("reviewReturns.verify", _present(path=absolute(path),
            sha256=expected_sha256))

    def export_journal(self, comparison_id: str, destination, *, format="json", **options):
        """Stream the complete comparison, every source journal, plan and receipt."""
        return copy_native_file(self, {"kind": "review-journal", "id": comparison_id,
            "format": format}, destination, **options)


@dataclass
class JournalReturn:
    """A native full-journal plan ID; source IDs and comparison ID remain separate."""
    id: str
    _library: ResourceLibrary = field(repr=False)
    observed: dict[str, Any] = field(repr=False)

    def inspect(self, *, offset=0, limit=50, classification=""):
        self.observed = self._library.invoke("reviewReturns.inspect", {"id": self.id,
            "options": dict(offset=offset, limit=limit, classification=classification)})
        return self.observed

    @property
    def comparison_id(self) -> str:
        return self.observed["comparisonId"]

    def targets(self, *, offset=0, limit=50, classification=""):
        return self.inspect(offset=offset, limit=limit, classification=classification)["targets"]

    def iter_targets(self, *, classification="", page_size=100):
        from .review_library import _iterate
        return _iterate(self.targets, classification=classification, page_size=page_size)

    def restage(self, *, operation_id: str, label=None) -> JournalReturn:
        record = self._library.invoke("reviewReturns.restage", {"id": self.id,
            "input": _present(operationId=operation_id, label=label)})
        return JournalReturn(record["id"], self._library, record)

    def apply(self, *, operation_id: str, expected_base_id: str, actor: str,
              resolutions=None):
        return self._library.invoke("reviewReturns.apply", {"id": self.id, "input":
            _present(operationId=operation_id, expectedBaseId=expected_base_id,
                     actor=actor, resolutions=resolutions)})

    def export(self, destination, *, format="json", **options):
        return self._library.export_journal(self.comparison_id, destination, format=format, **options)


__all__ = ["JournalDelivery", "JournalReturn", "ReviewReception"]
