"""A browser lifetime attached to the existing ResourceLibrary's one Node process."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, TYPE_CHECKING
from urllib.parse import urlsplit, urlunsplit, urlencode
import uuid

from .errors import StateError
from ._review_transport import ReviewError

if TYPE_CHECKING:
    from .review_library import ResourceLibrary

BrowserPage = Literal["resources", "comparisons", "returns", "review-returns", "collections"]


@dataclass(repr=False)
class ReviewBrowser:
    """Own the original private listener, not the library or a second native process.

    `url` is a private capability. It is deliberately absent from repr and metadata.
    Closing the ResourceLibrary also closes this listener and its active HTTP work.
    """
    _library: ResourceLibrary = field(repr=False)
    _connection: dict[str, Any] = field(repr=False)
    _closed: bool = field(default=False, repr=False)

    @classmethod
    def start(cls, library: ResourceLibrary, *, port: int = 0,
              page: BrowserPage = "resources", operation_id: str | None = None) -> ReviewBrowser:
        if type(port) is not int or not 0 <= port <= 65535:
            raise StateError("PORT_INVALID")
        operation_id = str(uuid.uuid4()) if operation_id is None else operation_id
        connection = library.invoke("browser.start", {"port": port, "page": page, "operationId": operation_id})
        return cls(library, connection)

    @property
    def session_id(self) -> str:
        return self._connection["sessionId"]

    @property
    def url(self) -> str:
        """Private local URL; send only to this operator's browser."""
        if self._closed:
            raise StateError("REVIEW_BROWSER_HANDLE_CLOSED")
        return self._connection["url"]

    @property
    def pages(self) -> dict[str, str]:
        return dict(self._connection["pages"])

    def metadata(self) -> dict[str, Any]:
        """Token-free launch details suitable for normal operational logs."""
        return {key: value for key, value in self._connection.items() if key != "url"}

    @property
    def observed(self) -> dict[str, Any]:
        result = self._library.invoke("browser.status")
        if result.get("state") == "RUNNING" and result.get("sessionId") != self.session_id:
            raise StateError("REVIEW_BROWSER_STALE_SESSION")
        return result

    def page_url(self, page: BrowserPage, *, return_id: str | None = None,
                 plan_id: str | None = None, comparison_id: str | None = None) -> str:
        """Open the actual native page with its original case or plan identifier."""
        if page not in self.pages:
            raise StateError("REVIEW_BROWSER_PAGE_UNAVAILABLE")
        values = {"return_id": return_id, "plan_id": plan_id, "comparison_id": comparison_id}
        for value in values.values():
            if value is not None and (not isinstance(value, str) or len(value) != 64
                    or any(c not in "0123456789abcdef" for c in value)):
                raise StateError("REVIEW_BROWSER_ID_INVALID")
        if return_id is not None and page != "returns":
            raise StateError("REVIEW_RETURN_PAGE_INVALID")
        if plan_id is not None and page != "review-returns":
            raise StateError("REVIEW_JOURNAL_PAGE_INVALID")
        if comparison_id is not None and page not in {"comparisons", "returns", "review-returns"}:
            raise StateError("REVIEW_COMPARISON_PAGE_INVALID")
        query = {}
        if page == "comparisons" and comparison_id is not None:
            query["id"] = comparison_id
        else:
            if return_id is not None:
                query["id"] = return_id
            if plan_id is not None:
                query["id"] = plan_id
            if comparison_id is not None:
                query["comparison"] = comparison_id
        source = urlsplit(self.url)
        return urlunsplit((source.scheme, source.netloc, self.pages[page],
                          urlencode(query), source.fragment))

    def open_tab(self, page: BrowserPage | None = None, *, return_id: str | None = None,
                 plan_id: str | None = None, comparison_id: str | None = None) -> bool:
        """Explicit desktop action. Never automatically called during native startup."""
        import webbrowser
        if page is None and any(value is not None for value in (return_id, plan_id, comparison_id)):
            raise StateError("REVIEW_BROWSER_PAGE_REQUIRED")
        url = self.url if page is None else self.page_url(page, return_id=return_id,
            plan_id=plan_id, comparison_id=comparison_id)
        return bool(webbrowser.open(url, new=2))

    def close(self) -> None:
        if self._closed:
            return
        try:
            self._library.invoke("browser.stop", {"sessionId": self.session_id})
        except ReviewError as error:
            if error.code != "REVIEW_SESSION_CLOSED":
                raise
        finally:
            self._closed = True

    def __enter__(self) -> ReviewBrowser:
        if self._closed:
            raise StateError("REVIEW_BROWSER_HANDLE_CLOSED")
        return self

    def __exit__(self, *_):
        self.close()

    def __repr__(self) -> str:
        return f"ReviewBrowser(session_id={self.session_id!r}, closed={self._closed!r})"
