"""MIT. Complete saved document-case input for the existing Operating Plans product."""
from __future__ import annotations

from copy import deepcopy
from .workspace import MAX_METADATA, now
from iati_source import InputError
from workspace import json_bytes, load_json

SCHEMA = "stellar-forge.iati-document-operating-source.v1"


def operating_source(work, ident, revision=None):
    """Read one immutable case edition under its existing workspace mutex.

    The original evidence/organisation models validate their retained records.
    This function performs no acquisition, review, correction or receiving.
    """
    with work.ws.mutex:
        plan = work.plan(ident, revision)
        history = [item for item in work.history(ident)
                   if item["revision"] <= plan["revision"]]
        if len(history) != plan["revision"] or history[-1] != plan:
            raise InputError("Retain the complete original evidence history through this revision")
        selected = plan["selection"]
        organisation = work.ws.organisation.plan(selected["id"], selected["revision"])
        if organisation["recordSha256"] != selected["recordSha256"]:
            raise InputError("The saved organisation selection differs from its original record")
        page = work.rows({"id": plan["id"], "revision": plan["revision"], "offset": 0,
                          "limit": 500, "expectedSnapshot": plan["recordSha256"]})
        if len(page["rows"]) != page["total"]:
            raise InputError("Keep every selected document row in the operating source")
        observations = [work.observation(key) for key in plan["observationIds"]]
        comparisons = []
        for stored in work.ws.db.execute(
                "SELECT body FROM iati_document_evidence_comparisons ORDER BY id"):
            value = load_json(stored["body"])
            before, after = value.get("before", {}), value.get("after", {})
            if (before.get("id") == plan["id"] and after.get("id") == plan["id"]
                    and before.get("revision", plan["revision"] + 1) <= plan["revision"]
                    and after.get("revision", plan["revision"] + 1) <= plan["revision"]):
                comparisons.append(work.comparison(value["id"]))
        value = {
            "schema": SCHEMA, "capturedAt": now(),
            "workspaceSha256": work.ws.publishing.context()["workspaceSha256"],
            "plan": plan, "history": history, "organisation": organisation,
            "rows": page["rows"], "snapshotSha256": page["snapshotSha256"],
            "observations": observations, "comparisons": comparisons,
            "correction": work.correction(plan["id"], plan["revision"]),
        }
        if len(json_bytes(value)) > MAX_METADATA:
            raise InputError("The complete operating source exceeds the original 64 MiB JSON capacity")
        return deepcopy(value)
