"""Remember only native review navigation; decisions and receipts stay in their engine."""
from __future__ import annotations

from .errors import StateError
from .storage import dump, parse, read

SCHEMA = "stellar-forge.python-review-location.v1"
FILE = "review-location.json"
PAGES = {"resources", "comparisons", "returns", "review-returns", "collections"}


def _id(value):
    if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
        raise StateError("REVIEW_LOCATION_ID_INVALID")
    return value


def receipt_location(received, *, return_format=None):
    if received.get("kind") == "collection":
        return {"page": "collections"}
    if return_format == "returned":
        if received.get("comparisonId") and received.get("baseId") and received.get("sourceId"):
            return {"page": "review-returns", "plan_id": _id(received["id"]),
                    "comparison_id": _id(received["comparisonId"])}
        if received.get("planId") and received.get("comparisonId"):
            return {"page": "review-returns", "plan_id": _id(received["planId"]),
                    "comparison_id": _id(received["comparisonId"])}
        return {"page": "comparisons", "comparison_id": _id(received["id"])}
    pending = received.get("receiving")
    if pending and pending.get("state") == "PENDING":
        return {"page": "returns", "return_id": _id(pending["id"]),
                "comparison_id": _id(received["id"])}
    if received.get("comparisonId") and received.get("planSha256"):
        return {"page": "returns", "return_id": _id(received["id"]),
                "comparison_id": _id(received["comparisonId"])}
    return {"page": "comparisons", "comparison_id": _id(received["id"])}


def remember_location(library, location):
    # Atomic private view metadata, containing no URL or session capability.
    dump(library.state / FILE, {"schema": SCHEMA, **location})
    return location


def remember_receipt(library, received, *, return_format=None):
    location = receipt_location(received, return_format=return_format)
    if location.get("comparison_id"):
        library.select_comparison(location["comparison_id"])
    return remember_location(library, location)


def _resolve(library, location):
    if not isinstance(location, dict) or location.get("page") not in PAGES:
        raise StateError("REVIEW_LOCATION_INVALID")
    if set(location) - {"page", "comparison_id", "return_id", "plan_id"}:
        raise StateError("REVIEW_LOCATION_INVALID")
    result = dict(location)
    for key in ("comparison_id", "return_id", "plan_id"):
        if key in result:
            _id(result[key])
    if result.get("return_id"):
        if result["page"] != "returns" or result.get("plan_id"):
            raise StateError("REVIEW_LOCATION_INVALID")
        record = library.review_return(result["return_id"]).observed
    elif result.get("plan_id"):
        if result["page"] != "review-returns":
            raise StateError("REVIEW_LOCATION_INVALID")
        record = library.journal_return(result["plan_id"], limit=1).observed
    else:
        record = None
    if record is not None:
        comparison_id = _id(record["comparisonId"])
        if result.get("comparison_id") not in (None, comparison_id):
            raise StateError("REVIEW_LOCATION_COMPARISON_CHANGED")
        result["comparison_id"] = comparison_id
    if result.get("comparison_id"):
        if result["page"] not in {"comparisons", "returns", "review-returns"}:
            raise StateError("REVIEW_LOCATION_INVALID")
        library.comparison(result["comparison_id"])
    return result


def resolve_location(library, args, *, received=None, return_format=None):
    if received:
        if received.get("kind") == "collection":
            # Preserve the existing collection caller's explicit page choice.
            return _resolve(library, {"page": "collections" if args.page == "auto" else args.page})
        location = _resolve(library, receipt_location(received, return_format=return_format))
        if location.get("comparison_id"):
            library.select_comparison(location["comparison_id"])
        return remember_location(library, location)
    selectors = {key: getattr(args, key, None) for key in ("comparison_id", "return_id", "plan_id")}
    selectors = {key: value for key, value in selectors.items() if value is not None}
    if selectors:
        if len(selectors) != 1:
            raise StateError("REVIEW_LOCATION_SELECTION_CONFLICT")
        key = next(iter(selectors))
        page = {"comparison_id": "comparisons", "return_id": "returns", "plan_id": "review-returns"}[key]
        if args.page not in ("auto", page):
            raise StateError("REVIEW_LOCATION_PAGE_CONFLICT")
        location = _resolve(library, {"page": page, **selectors})
        if location.get("comparison_id"):
            library.select_comparison(location["comparison_id"])
        return remember_location(library, location)
    if args.page != "auto":
        return _resolve(library, {"page": args.page})
    path = library.state / FILE
    if path.exists() or path.is_symlink():
        saved = parse(read(path, 4096))
        if not isinstance(saved, dict) or saved.get("schema") != SCHEMA:
            raise StateError("REVIEW_LOCATION_INVALID")
        location = {key: value for key, value in saved.items() if key != "schema"}
        # Respect a newer native case selection made in the original browser.
        selected = library.comparisons(limit=1).get("selection") if library.capabilities.get("comparisons") else None
        if not location.get("comparison_id") or selected in (None, location.get("comparison_id")):
            return _resolve(library, location)
    page = "comparisons" if library.capabilities.get("comparisons") else "resources"
    return {"page": page}
