"""Compare complete financing options through the original Forecast calculator."""
from __future__ import annotations

import forecast as forecasts
import operations_domain as domain
from model import Problem, digest, short_id, text

SCHEMA = "stellar-forge.forecast-financing-preview.v1"
MAX_OPTIONS = 24


def preview(context, options):
    """Read one caller-locked original case; retain every full native preview."""
    if not isinstance(options, list) or not 1 <= len(options) <= MAX_OPTIONS:
        domain.fail("Select from one through 24 complete financing options.", "INVALID_FORECAST_OPTIONS")
    selected, seen = [], set()
    for index, option in enumerate(options, 1):
        try:
            if not isinstance(option, dict) or set(option) != {"id", "name", "inputs"}:
                domain.fail("Use exactly id, name and complete inputs.", "INVALID_FORECAST_OPTIONS")
            ident = short_id(option["id"], "Financing option identity")
            name = text(option["name"], "Financing option name", 200, True)
            if ident in seen:
                domain.fail("Select each financing option identity once.", "INVALID_FORECAST_OPTIONS")
            if not isinstance(option["inputs"], dict):
                domain.fail("Retain the complete Forecast inputs object.", "INVALID_FORECAST_OPTIONS")
            seen.add(ident)
            selected.append({"id": ident, "name": name, "inputs": option["inputs"]})
        except Problem as exc:
            raise Problem(f"Financing option {index}: {exc}", exc.status, exc.code) from exc

    source = forecasts.source_identity(context)
    results = []
    for option in selected:
        try:
            calculated = forecasts.preview(context, option["inputs"])
        except Problem as exc:
            raise Problem(
                f"Financing option {option['name']} ({option['id']}): {exc}",
                exc.status, exc.code) from exc
        if calculated["source"] != source:
            domain.fail("The original case changed during financing comparison.",
                        "OPERATIONS_CONFLICT", 409)
        results.append({"id": option["id"], "name": option["name"],
                        "inputSha256": digest(option["inputs"]), "preview": calculated})
    result = {"schema": SCHEMA, "source": source, "options": results,
              "requestSha256": digest({"expectedVersion": context["program"]["version"], "options": options})}
    result["sha256"] = digest(result)
    return result
