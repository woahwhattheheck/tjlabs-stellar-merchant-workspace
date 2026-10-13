"""MIT. Revision-pinned programme reads and document downloads over the original console."""
from __future__ import annotations

from domain import identifier, require, revision, shape
from native_sources import file_info
from programme import (COLLECTIONS, PROGRAMME_SCHEMA, indexes, position, programme_schema,
                       qa_pack, record_ref)


def _version(value):
    if isinstance(value, str):
        require(value.isascii() and value.isdigit() and len(value) <= 10,
                "Select a complete original portfolio revision")
        value = int(value)
    return revision(value)


def selection(workspace, query, extra=()):
    shape(query, ("portfolioId", "revision", *extra), ("portfolioId", "revision"))
    portfolio = workspace.portfolio(identifier(query["portfolioId"]), _version(query["revision"]))
    model = portfolio["definition"].get("programme")
    require(model is not None, "This saved portfolio has no programme records", "PROGRAMME_NOT_PRESENT", 404)
    envelope = {"schema": PROGRAMME_SCHEMA, "portfolioId": portfolio["id"],
        "revision": portfolio["revision"], "snapshot": portfolio["snapshot"],
        "programmeRevision": model["revision"]}
    return portfolio, model, envelope


def read_programme(workspace, route, query):
    if route == "schema":
        shape(query, ())
        return programme_schema()
    if route == "record":
        _, model, envelope = selection(workspace, query, ("collection", "id"))
        require(query.get("collection") in COLLECTIONS, "Select a programme register")
        ident = identifier(query.get("id"))
        record = indexes(model)[query["collection"]].get(ident)
        require(record is not None, "The original programme record was not found", "NOT_FOUND", 404)
        return {**envelope, "collection": query["collection"], "record": record}
    if route in {"position", "qa"}:
        portfolio, model, envelope = selection(workspace, query, ("nodeId", "grantId"))
        node_id = identifier(query.get("nodeId"))
        grant_id = identifier(query["grantId"]) if query.get("grantId") else None
        _, entities, financial = workspace._selected(portfolio["sources"])
        if route == "qa":
            require(grant_id is None, "The QA workshop selects the complete original project")
            result = qa_pack(model, node_id, entities, financial)
            result["basis"] = envelope
        else:
            result = position(model, node_id, entities, financial, grant_id)
        return {**envelope, route: result}
    if route == "history":
        portfolio, _, envelope = selection(workspace, query, ("collection", "id"))
        name, ident = query.get("collection"), identifier(query.get("id"))
        require(name in COLLECTIONS, "Select a programme register")
        history, previous = [], None
        for version in range(1, portfolio["revision"] + 1):
            earlier = workspace.portfolio(portfolio["id"], version)
            model = earlier["definition"].get("programme")
            if model is None:
                continue
            row = indexes(model)[name].get(ident)
            if row and row["sha256"] != previous:
                history.append({"portfolioRevision": version, "snapshot": earlier["snapshot"],
                    "operationId": earlier["operationId"], "record": row})
                previous = row["sha256"]
        require(history, "The original programme record was not found", "NOT_FOUND", 404)
        return {**envelope, "collection": name, "id": ident, "history": history}
    raise ValueError("Unknown programme read route")


def programme_document(workspace, query):
    _, model, envelope = selection(workspace, query, ("id",))
    row = indexes(model)["documents"].get(identifier(query.get("id")))
    require(row is not None and row.get("object"),
            "This original document has no uploaded file", "NOT_FOUND", 404)
    descriptor = row["object"]
    path = workspace.object(descriptor["sha256"])
    require(file_info(path) == {"sha256": descriptor["sha256"], "bytes": descriptor["bytes"]},
            "The original document bytes changed", "PROGRAMME_DOCUMENT_CHANGED", 409)
    return path, descriptor, {**envelope, "document": record_ref("documents", row)}
