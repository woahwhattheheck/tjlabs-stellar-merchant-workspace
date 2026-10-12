"""MIT. Whole-scope decisions over the retained original financial rows."""
from __future__ import annotations
from .codec import fields, text, identity, fingerprint
from iati_source import InputError

FILTERS = {
    "publisherRefs": lambda item: item["publisherRef"],
    "activityIds": lambda item: item["activityId"],
    "collections": lambda item: item["collection"],
    "currencies": lambda item: item["row"].get("currency", ""),
    "transactionTypes": lambda item: item["row"].get("transaction_type", ""),
    "keys": lambda item: item["key"],
}


def select(rows, selection, decisions):
    fields(selection, (), set(FILTERS) | {"all", "undecidedOnly"})
    if not selection or (not any(key in selection for key in FILTERS) and selection.get("all") is not True):
        raise InputError("Select the original programme, financial groups or explicit whole portfolio")
    for key in ("all", "undecidedOnly"):
        if key in selection and type(selection[key]) is not bool:
            raise InputError("Use explicit true or false for the original scope selection")
    for key in FILTERS:
        if key in selection:
            values = selection[key]
            if not isinstance(values, list) or not values or len(values) > 100000 or len(set(values)) != len(values):
                raise InputError("Use a nonempty distinct original " + key + " selection")
            for value in values:
                text(value, "Original " + key, 4096)
                if key == "keys":
                    identity(value)
            if key == "collections" and set(values) - {"transactions", "budgets"}:
                raise InputError("Select retained transactions or budgets")
    chosen = []
    for row in rows:
        if selection.get("undecidedOnly") and decisions.get(row["key"], {}).get("action") in {"include", "exclude"}:
            continue
        if all(key not in selection or getter(row) in selection[key] for key, getter in FILTERS.items()):
            chosen.append(row)
    return chosen


def preview(plan, rows, selection):
    chosen = select(rows, selection, plan["definition"]["decisions"])
    groups = {}
    for row in chosen:
        dimensions = {**row["dimensions"], "publisherRef": row["publisherRef"]}
        key = fingerprint(dimensions)
        groups.setdefault(key, {"dimensions": dimensions, "count": 0})
        groups[key]["count"] += 1
    selected = [{"key": row["key"], "sourceRowSha256": row["sourceRowSha256"]} for row in chosen]
    return {"id": plan["id"], "revision": plan["revision"], "selection": selection,
            "selectedSha256": fingerprint({"id": plan["id"], "revision": plan["revision"], "selection": selection, "rows": selected}),
            "count": len(chosen), "groups": list(groups.values()), "rows": selected}
