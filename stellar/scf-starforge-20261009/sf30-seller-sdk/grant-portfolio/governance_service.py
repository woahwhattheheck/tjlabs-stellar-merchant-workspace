"""MIT. Exact saved governance readers over the original portfolio."""
from domain import identifier, require, shape
from programme_service import _version
from governance import (GOVERNANCE_SCHEMA, COLLECTIONS, indexes, governance_position,
                        governance_schema, links)

def selection(workspace, query, extra=()):
    shape(query, ("portfolioId", "revision", *extra), ("portfolioId", "revision"))
    portfolio = workspace.portfolio(identifier(query["portfolioId"]), _version(query["revision"]))
    model = portfolio["definition"].get("governance")
    require(model is not None, "This original portfolio has no governance records", "GOVERNANCE_NOT_PRESENT", 404)
    return portfolio, model, {"schema": GOVERNANCE_SCHEMA, "portfolioId": portfolio["id"],
        "revision": portfolio["revision"], "snapshot": portfolio["snapshot"], "governanceRevision": model["revision"]}

def read_governance(workspace, route, query):
    if route == "schema":
        shape(query, ())
        return governance_schema()
    if route == "position":
        portfolio, model, envelope = selection(workspace, query, ("nodeId", "grantId"))
        return {**envelope, "position": governance_position(model, portfolio["definition"]["programme"],
            identifier(query.get("nodeId")), identifier(query["grantId"]) if query.get("grantId") else None)}
    if route in ("record", "history", "review"):
        portfolio, model, envelope = selection(workspace, query, ("collection", "id"))
        name, ident = query.get("collection"), identifier(query.get("id"))
        require(name in COLLECTIONS, "Select a governance register")
        row = indexes(model)[name].get(ident)
        require(row is not None, "The original governance record was not found", "NOT_FOUND", 404)
        if route == "record":
            return {**envelope, "collection": name, "record": row}
        if route == "review":
            idx = indexes(model)
            children = [{"collection": target, "record": record}
                for target in COLLECTIONS for record in model["records"][target]
                if (name, ident) in links(target, record)]
            return {**envelope, "collection": name, "record": row, "publication": row.get("publication"),
                "dependencies": [{"collection": target, "record": idx[target][key]} for target, key in links(name, row)],
                "following": children}
        history, previous = [], None
        for version in range(1, portfolio["revision"] + 1):
            earlier = workspace.portfolio(portfolio["id"], version)
            prior_model = earlier["definition"].get("governance")
            selected = indexes(prior_model)[name].get(ident) if prior_model else None
            if selected and selected["sha256"] != previous:
                history.append({"portfolioRevision": version, "snapshot": earlier["snapshot"],
                    "operationId": earlier["operationId"], "record": selected})
                previous = selected["sha256"]
        return {**envelope, "collection": name, "id": ident, "history": history}
    raise ValueError("Unknown governance read route")
