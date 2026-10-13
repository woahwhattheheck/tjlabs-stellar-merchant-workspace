"""MIT. Revision-pinned awards reads over the original portfolio and row reader."""
from __future__ import annotations

from domain import digest, identifier, require, revision, shape, short
from awards import (AWARDS_SCHEMA, COLLECTIONS, application_position, awards_schema,
                    indexes, round_position)


def _integer(value, name, *, minimum=0, maximum=2147483647):
    if isinstance(value, str):
        require(value.isascii() and value.isdigit() and len(value) <= 10, "Select a complete " + name)
        value = int(value)
    require(type(value) is int and minimum <= value <= maximum, "Select a valid " + name)
    return value


def selection(workspace, query, extra=(), *, required=True):
    shape(query, ("portfolioId", "revision", *extra), ("portfolioId", "revision"))
    portfolio = workspace.portfolio(identifier(query["portfolioId"]),
                                    revision(_integer(query["revision"], "portfolio revision", minimum=1)))
    model = portfolio["definition"].get("awards")
    require(not required or model is not None, "This saved portfolio has no awards administration",
            "AWARDS_NOT_PRESENT", 404)
    envelope = {"schema": AWARDS_SCHEMA, "portfolioId": portfolio["id"],
                "revision": portfolio["revision"], "snapshot": portfolio["snapshot"],
                "awardsRevision": model["revision"] if model else 0}
    return portfolio, model, envelope


def read_awards(workspace, route, query):
    if route == "schema":
        shape(query, ())
        return awards_schema()
    if route == "financial":
        portfolio, _, envelope = selection(workspace, query, ("offset", "limit", "search"), required=False)
        offset = _integer(query.get("offset", 0), "row offset")
        limit = _integer(query.get("limit", 50), "row limit", minimum=1, maximum=250)
        search = short(query.get("search", ""), "Financial row search", 1000, empty=True)
        page = workspace.rows(portfolio["id"], portfolio["revision"], "financial",
                              offset=offset, limit=limit, search=search)
        rows = [{"record": row, "reference": {"sourceId": row["sourceId"],
                 "rowKey": row["rowKey"], "sha256": digest(row)}} for row in page["rows"]]
        return {**page, **envelope, "rows": rows}
    if route == "record":
        _, model, envelope = selection(workspace, query, ("collection", "id"))
        name, ident = query.get("collection"), identifier(query.get("id"))
        require(name in COLLECTIONS, "Select an awards register")
        record = indexes(model)[name].get(ident)
        require(record is not None, "The original awards record was not found", "NOT_FOUND", 404)
        return {**envelope, "collection": name, "record": record}
    if route == "history":
        portfolio, _, envelope = selection(workspace, query, ("collection", "id"))
        name, ident = query.get("collection"), identifier(query.get("id"))
        require(name in COLLECTIONS, "Select an awards register")
        history, previous = [], None
        for version in range(1, portfolio["revision"] + 1):
            earlier = workspace.portfolio(portfolio["id"], version)
            model = earlier["definition"].get("awards")
            row = indexes(model)[name].get(ident) if model else None
            if row and row["sha256"] != previous:
                history.append({"portfolioRevision": version, "snapshot": earlier["snapshot"],
                                "operationId": earlier["operationId"], "record": row})
                previous = row["sha256"]
        require(history, "The original awards record was not found", "NOT_FOUND", 404)
        return {**envelope, "collection": name, "id": ident, "history": history}
    if route == "round":
        _, model, envelope = selection(workspace, query, ("roundId",))
        return {**envelope, "round": round_position(model, identifier(query.get("roundId")))}
    if route == "position":
        _, model, envelope = selection(workspace, query, ("applicationId",))
        return {**envelope, "position": application_position(model, identifier(query.get("applicationId")))}
    raise ValueError("Unknown awards read route")
