"""Reviewed native Dataverse requests, conditional delivery and explicit uncertainty recovery."""
from decimal import Decimal
from .canonical import (decimal, digest, full_sha, guid, identifier, now, request_id,
                        stable_text, ui_value)
from .connection import parsed, query
from .dataverse import (Dataverse, NativeReads, attribute_type, equivalent, etag,
                        logical_read_name, required_level, scalar_value)
from .errors import PMRSError, ProviderError, require
from .reconcile import verify_reconciliation

FINAL_ROW_STATES = {"APPLIED", "UNCHANGED", "ACCEPTED_OBSERVATION"}
UNSENT_ROW_STATES = {"PREPARED", "READY_SAME_REQUEST", "REJECTED"}
UNCERTAIN_ROW_STATES = {"INVOKING", "UNKNOWN", "OBSERVED_MATCH_UNCONFIRMED", "PROVIDER_ACCEPTED"}

def target_profile(value):
    require(isinstance(value, dict) and set(value) <= {"schema", "entity", "rows", "reviewer", "note", "label"}
            and value.get("schema") == "commons.pmrs-target.v1", "TARGET_PROFILE", "Use the original target-review schema.")
    result = {"schema": value["schema"], "entity": identifier(value.get("entity")),
              "reviewer": stable_text(value.get("reviewer"), 256),
              "note": stable_text(value.get("note", ""), 8192),
              "label": stable_text(value.get("label", "PMRS finance delivery"), 256), "rows": []}
    require(result["reviewer"].strip(), "TARGET_REVIEWER", "Name the reviewer of this exact target request.")
    require(isinstance(value.get("rows"), list) and 1 <= len(value["rows"]) <= 200,
            "TARGET_ROWS", "Select 1–200 native target rows.")
    row_ids, native_ids = set(), set()
    for row in value["rows"]:
        require(isinstance(row, dict) and set(row) <= {"id", "record_id", "mode", "fields", "currency_id", "note"},
                "TARGET_ROW", "Unknown target row field.")
        row_id, native_id = request_id(row.get("id")), guid(row.get("record_id"))
        require(row_id not in row_ids and native_id not in native_ids,
                "TARGET_DUPLICATE_ROW", "One native record may occur only once in a reviewed delivery.")
        row_ids.add(row_id); native_ids.add(native_id)
        require(row.get("mode") in {"create", "update"}, "TARGET_MODE", "Select conditional create or versioned update.")
        fields = row.get("fields")
        require(isinstance(fields, dict) and 1 <= len(fields) <= 100, "TARGET_FIELDS", "Select 1–100 native columns.")
        normalized = {}
        for name, spec in fields.items():
            identifier(name)
            require(isinstance(spec, dict), "TARGET_VALUE", "Every selected column needs an explicit value source.")
            kind = spec.get("kind")
            if kind == "metric":
                require(set(spec) == {"kind", "group_key", "metric"} and
                        spec["metric"] in {"budget_cost", "billable_amount", "usage_cost", "sale_amount",
                                           "cost_variance", "billable_difference"}, "TARGET_METRIC", "Select an exact report metric.")
                normalized[name] = {"kind": kind, "group_key": full_sha(spec["group_key"]), "metric": spec["metric"]}
            elif kind == "literal":
                require(set(spec) == {"kind", "value"}, "TARGET_LITERAL", "Literal values have kind and value only.")
                require(spec["value"] is None or isinstance(spec["value"], (str, int, bool, Decimal)),
                        "TARGET_LITERAL", "Use one explicit scalar literal.")
                normalized[name] = spec
            elif kind == "reference":
                require(set(spec) == {"kind", "entity", "record_id"}, "TARGET_REFERENCE", "Select the exact native lookup table and record.")
                normalized[name] = {"kind": kind, "entity": identifier(spec["entity"]), "record_id": guid(spec["record_id"])}
            else:
                raise PMRSError("TARGET_VALUE_KIND", "Use a report metric, scalar literal or native reference.")
        selected = {"id": row_id, "record_id": native_id, "mode": row["mode"],
                    "fields": normalized, "note": stable_text(row.get("note", ""), 4096)}
        if row.get("currency_id") is not None: selected["currency_id"] = guid(row["currency_id"])
        result["rows"].append(selected)
    return result

def _metric(summary, specification):
    rows = [row for row in summary["totals"] if row["key"] == specification["group_key"]]
    require(len(rows) == 1, "TARGET_METRIC_GROUP", "The exact report group is absent.")
    row = rows[0]; name = specification["metric"]
    if name in {"cost_variance", "billable_difference"}:
        value = row[name]["value"]
    else:
        selected = row["metrics"][name]
        require(selected["status"] == "COMPLETE", "TARGET_METRIC_INCOMPLETE", "A partial or empty total cannot be delivered.")
        value = selected["total"]
    require(value is not None, "TARGET_METRIC_INCOMPLETE", "This derived report value is not complete.")
    return value, {"reconciliation_group": row["key"], "metric": name,
                   "currency": row["currency"], "currency_basis": row["currency_basis"],
                   "project_id": row["project_id"], "grant_key": row["grant_key"]}

def _expected_match(row, native):
    if native is None: return False
    return all(equivalent(column["attribute"], native.get(column["read_name"]), column["expected"])
               for column in row["columns"])

def _target_record(dataverse, metadata, row, *, label):
    fields = [column["read_name"] for column in row["columns"]]
    if row.get("currency"): fields.append("_transactioncurrencyid_value")
    return dataverse.read_record(metadata, row["record_id"], fields, name=label)

def review_target(store, http, operation_id, reconciliation_id, profile):
    profile = target_profile(profile)
    reconciliation = verify_reconciliation(store, reconciliation_id)
    require(reconciliation["body"]["summary"]["ready"], "RECONCILIATION_NOT_READY",
            "Resolve source and allocation findings before preparing a target delivery.")
    request = {"connection": http.public, "reconciliation_id": reconciliation_id, "profile": profile}
    operation = store.operation(operation_id, "target-review", request)
    if operation.get("result"): return store.record(operation["result"]["record_id"], "target-review")
    with store.work(operation_id):
        operation = store.operation(operation_id, "target-review", request)
        if operation.get("result"): return store.record(operation["result"]["record_id"], "target-review")
        progress = operation["progress"]
        save = lambda: store.update_operation(operation_id, state="RUNNING", progress=progress)
        native = Dataverse(http, NativeReads(store, http, progress, save))
        actor = native.identity()
        metadata = native.entity(profile["entity"])
        require(metadata["entity"].get("IsOptimisticConcurrencyEnabled") is True,
                "TARGET_CONCURRENCY", "The target table must expose native optimistic concurrency.")
        rows = []
        for index, selected in enumerate(profile["rows"]):
            attributes = {}
            for name in selected["fields"]:
                require(name != metadata["entity"]["PrimaryIdAttribute"], "TARGET_PRIMARY_KEY",
                        "The original native record ID is selected in the route, not as an editable field.")
                attributes[name] = native.attribute(metadata, name)
            has_money = any(attribute_type(a) == "Money" for a in attributes.values())
            currency = None
            if has_money:
                require("transactioncurrencyid" not in selected["fields"], "TARGET_CURRENCY_DUPLICATE",
                        "Currency is selected once through currency_id, for both create and update.")
                require(selected.get("currency_id"), "TARGET_CURRENCY",
                        "Select the exact native transaction currency for Money columns.")
                currency = native.currency(selected["currency_id"])
            fields = [logical_read_name(a) for a in attributes.values()]
            if has_money: fields.append("_transactioncurrencyid_value")
            before = native.read_record(metadata, selected["record_id"], fields, name="before:" + selected["id"])
            require((before is None) == (selected["mode"] == "create"), "TARGET_EXISTENCE",
                    "The native record's current existence differs from the reviewed create/update choice.",
                    record_id=selected["record_id"])
            if has_money and before is not None:
                require(guid(before.get("_transactioncurrencyid_value")) == selected["currency_id"],
                        "TARGET_CURRENCY_CHANGED", "The existing record uses a different native transaction currency.")
            payload, columns = {}, []
            for name, specification in selected["fields"].items():
                attribute = attributes[name]; kind = attribute_type(attribute)
                require(attribute.get("IsValidForRead") is True and
                        attribute.get("IsValidForCreate" if selected["mode"] == "create" else "IsValidForUpdate") is True
                        and attribute.get("SourceType") in {None, 0} and not attribute.get("AttributeOf"),
                        "TARGET_COLUMN_WRITABLE", "The native column is not a writable, readable simple value.", attribute=name)
                if specification["kind"] == "reference":
                    require(kind == "Lookup" and specification["entity"] in attribute.get("Targets", []),
                            "TARGET_LOOKUP", "The selected reference is not an observed native lookup target.")
                    navigation, relationship = native.relationship(metadata, name, specification["entity"])
                    referenced = native.entity(specification["entity"])
                    target_row = native.read_record(referenced, specification["record_id"],
                        [referenced["entity"]["PrimaryIdAttribute"]], name="lookup:" + selected["id"] + ":" + name)
                    require(target_row is not None, "TARGET_LOOKUP_ABSENT", "The selected native lookup record does not exist.")
                    payload[navigation + "@odata.bind"] = "/" + referenced["entity"]["EntitySetName"] + "(" + specification["record_id"] + ")"
                    expected = specification["record_id"]
                    provenance = {"kind": "native_lookup", "entity": specification["entity"],
                                  "record_id": expected, "relationship": relationship}
                else:
                    if specification["kind"] == "metric":
                        require(kind in {"Money", "Decimal"}, "TARGET_METRIC_TYPE",
                                "Finance metrics must use native Money or Decimal columns.")
                        value, provenance = _metric(reconciliation["body"]["summary"], specification)
                        if kind == "Money":
                            require(provenance["currency"].casefold() == currency["isocurrencycode"].casefold(),
                                    "TARGET_CURRENCY_CODE", "The source and native target currency codes differ; no conversion is implied.")
                        elif kind == "Decimal":
                            # A Decimal column carries no currency; the review retains the explicit basis alongside it.
                            provenance["target_currency_semantics"] = "plain_decimal_exact_source_basis_retained_in_review"
                    else:
                        value, provenance = specification["value"], {"kind": "reviewed_literal"}
                    pricing = native.pricing_precision() if kind == "Money" and attribute.get("PrecisionSource") == 1 else None
                    expected = scalar_value(attribute, value, currency=currency, pricing_precision=pricing)
                    payload[name] = expected
                columns.append({"attribute": attribute, "read_name": logical_read_name(attribute),
                                "expected": expected, "source": provenance})
            if has_money:
                currency_attribute = native.attribute(metadata, "transactioncurrencyid")
                require(attribute_type(currency_attribute) == "Lookup"
                        and currency_attribute.get("IsValidForRead") is True
                        and "transactioncurrency" in currency_attribute.get("Targets", []),
                        "TARGET_CURRENCY_ATTRIBUTE", "The actual native transaction currency must be readable.")
                navigation, relationship = native.relationship(metadata, "transactioncurrencyid", "transactioncurrency")
                if selected["mode"] == "create":
                    require(currency_attribute.get("IsValidForCreate") is True,
                            "TARGET_CURRENCY_ATTRIBUTE", "The native target does not permit its currency on create.")
                    payload[navigation + "@odata.bind"] = "/transactioncurrencies(" + selected["currency_id"] + ")"
                columns.append({"attribute": currency_attribute, "read_name": "_transactioncurrencyid_value",
                    "expected": selected["currency_id"], "source": {"kind": "selected_native_currency",
                        "relationship": relationship, "mode": "created_with_record" if selected["mode"] == "create" else "original_currency_preserved"}})
            for name, attribute in metadata["attributes"].items():
                if required_level(attribute) == "ApplicationRequired" and attribute.get("IsValidForCreate") is True:
                    if selected["mode"] == "create":
                        require(name in selected["fields"] or name == "transactioncurrencyid" and has_money,
                                "TARGET_REQUIRED", "A native application-required column is not explicitly supplied.", attribute=name)
            row = {"id": selected["id"], "record_id": selected["record_id"], "mode": selected["mode"],
                   "url": http.public["url"] + metadata["entity"]["EntitySetName"] + "(" + selected["record_id"] + ")",
                   "payload": payload, "payload_sha256": digest(payload), "columns": columns,
                   "before": before, "before_etag": None if before is None else etag(before),
                   "currency": currency, "note": selected["note"]}
            row["conditional_headers"] = {"If-None-Match": "*"} if before is None else {"If-Match": row["before_etag"]}
            row["disposition"] = "UNCHANGED" if before is not None and _expected_match(row, before) else "PATCH_REQUIRED"
            rows.append(row)
        result = store.add_record("target-review", {"schema": "commons.pmrs-target-review.v1",
            "label": profile["label"], "connection": http.public, "reconciliation_id": reconciliation_id,
            "profile": profile, "native_actor": actor, "entity": metadata["entity"],
            "metadata": native.entities, "observations": progress["reads"], "rows": rows,
            "created_at": operation["created_at"], "ready": True,
            "write_semantics": "one_conditional_patch_per_native_record_no_accounting_posting"})
        store.update_operation(operation_id, state="COMPLETE", progress=progress, result={"record_id": result["id"]})
        return result

def _progress(store, operation_id, progress, state, event=None):
    return store.update_operation(operation_id, state=state, progress=progress, event=event)

def _metadata_preflight(store, http, operation_id, review, progress):
    # Metadata URLs and expected bodies are the exact accepted observations.
    original = review["body"]
    current = {"reads": {}}
    save = lambda: _progress(store, operation_id, progress, "RUNNING")
    reader = NativeReads(store, http, current, lambda: None, reuse=False)
    actor = reader.get("current-actor", http.public["url"] + "WhoAmI")
    require(guid(actor.get("OrganizationId")) == original["connection"]["organization_id"],
            "TARGET_ORGANIZATION", "Current native organization differs from the review.")
    # User identity is part of the original reviewed write authority.
    require(guid(actor.get("UserId")) == guid(original["native_actor"]["UserId"]),
            "TARGET_ACTOR_CHANGED", "Current native user differs from the target reviewer connection.")
    for name, selected in original["observations"].items():
        if not name.startswith(("entity:", "attributes:", "relationships:", "attribute:", "currency:", "organization-pricing")):
            continue
        body = reader.get(name, selected["url"])
        expected = store.get_json(selected["object"], limit=8 * 1024 * 1024)
        require(body == expected, "TARGET_METADATA_CHANGED",
                "Native target schema, currency or precision changed after review.", observation=name)
    progress.setdefault("preflights", []).append({"at": now(), "reads": current["reads"]})
    save()

def _read_current(store, http, operation_id, progress, review, row):
    observation = {"reads": {}}
    reader = NativeReads(store, http, observation, lambda: None, reuse=False)
    native = Dataverse(http, reader)
    metadata = review["body"]["metadata"][review["body"]["entity"]["LogicalName"]]
    current = _target_record(native, metadata, row, label="current:" + row["id"])
    saved = {"at": now(), "row_id": row["id"], "native": current, "reads": observation["reads"]}
    saved["sha256"] = digest(saved)
    progress.setdefault("observations", []).append(saved)
    _progress(store, operation_id, progress, "RUNNING")
    return current, saved

def _precondition_holds(row, current):
    if row["mode"] == "create": return current is None
    return current is not None and etag(current) == row["before_etag"]

def _finish_delivery(store, operation_id, progress, review):
    accepted = all(item["state"] in FINAL_ROW_STATES for item in progress["rows"])
    state = "COMPLETE" if accepted else "AWAITING_OPERATOR"
    if not accepted: return _progress(store, operation_id, progress, state)
    record = store.add_record("delivery", {"schema": "commons.pmrs-delivery.v1",
        "label": review["body"]["label"], "operation_id": operation_id, "review_id": review["id"],
        "reconciliation_id": review["body"]["reconciliation_id"], "connection": review["body"]["connection"],
        "rows": progress["rows"], "observations": progress.get("observations", []),
        "preflights": progress.get("preflights", []), "created_at": store.operation(operation_id)["created_at"],
        "provider_accepted_rows": sum(r["state"] == "APPLIED" for r in progress["rows"]),
        "operator_accepted_observations": sum(r["state"] == "ACCEPTED_OBSERVATION" for r in progress["rows"]),
        "unchanged_rows": sum(r["state"] == "UNCHANGED" for r in progress["rows"])})
    return store.update_operation(operation_id, state="COMPLETE", progress=progress,
                                  result={"record_id": record["id"]},
                                  event={"kind": "DELIVERY_COMPLETE", "record_id": record["id"]})

def publish(store, http, operation_id, review_id, *, execute=False, continue_same=False, stopped=lambda: False):
    review = store.record(review_id, "target-review")
    require(review["body"]["connection"] == http.public, "TARGET_CONNECTION_CHANGED",
            "The original delivery connection changed.")
    request = {"review_id": review_id, "connection": http.public}
    store.claim_delivery(review_id, operation_id, http.public)
    operation = store.operation(operation_id, "target-delivery", request)
    if operation.get("result"): return operation
    with store.work(operation_id):
        operation = store.operation(operation_id, "target-delivery", request)
        if operation.get("result"): return operation
        progress = operation["progress"]
        if not progress:
            progress = {"rows": [{"id": row["id"], "state": "PREPARED", "attempts": []} for row in review["body"]["rows"]],
                        "observations": [], "preflights": []}
            _progress(store, operation_id, progress, "PREPARED")
        if all(row["state"] in FINAL_ROW_STATES for row in progress["rows"]):
            return _finish_delivery(store, operation_id, progress, review)
        verify_reconciliation(store, review["body"]["reconciliation_id"])
        _metadata_preflight(store, http, operation_id, review, progress)
        for selected, retained in zip(review["body"]["rows"], progress["rows"], strict=True):
            require(selected["id"] == retained["id"], "DELIVERY_ROWS_CHANGED", "The original row order changed.")
            if retained["state"] in FINAL_ROW_STATES: continue
            if stopped():
                return _progress(store, operation_id, progress, "PAUSED", {"kind": "PAUSED_BEFORE_NEXT_ROW"})
            current, observation = _read_current(store, http, operation_id, progress, review, selected)
            retained["last_observation_sha256"] = observation["sha256"]
            if retained["state"] == "PROVIDER_ACCEPTED":
                if _expected_match(selected, current):
                    retained["state"] = "APPLIED"; retained["readback"] = observation
                    _progress(store, operation_id, progress, "RUNNING")
                    continue
                retained["state"] = "ACCEPTED_RESULT_CHANGED"
                return _progress(store, operation_id, progress, "AWAITING_OPERATOR",
                                 {"kind": "ACCEPTED_NATIVE_RESULT_DIFFERS", "row_id": selected["id"]})
            was_uncertain = retained["state"] in UNCERTAIN_ROW_STATES
            if was_uncertain and _expected_match(selected, current):
                retained["state"] = "OBSERVED_MATCH_UNCONFIRMED"; retained["readback"] = observation
                return _progress(store, operation_id, progress, "AWAITING_OPERATOR",
                                 {"kind": "MATCH_REQUIRES_NATIVE_ATTRIBUTION_REVIEW", "row_id": selected["id"]})
            if not _precondition_holds(selected, current):
                retained["state"] = "CONFLICT"; retained["readback"] = observation
                return _progress(store, operation_id, progress, "AWAITING_OPERATOR",
                                 {"kind": "ORIGINAL_PRECONDITION_CHANGED", "row_id": selected["id"]})
            if selected["disposition"] == "UNCHANGED" and _expected_match(selected, current) and not retained["attempts"]:
                retained["state"] = "UNCHANGED"; retained["readback"] = observation
                _progress(store, operation_id, progress, "RUNNING"); continue
            if retained["state"] in {"CONFLICT", "ACCEPTED_RESULT_CHANGED"}:
                return _progress(store, operation_id, progress, "AWAITING_OPERATOR")
            if was_uncertain:
                retained["state"] = "READY_SAME_REQUEST"
                _progress(store, operation_id, progress, "AWAITING_OPERATOR",
                          {"kind": "ORIGINAL_PRECONDITION_STILL_OBSERVED", "row_id": selected["id"]})
                if not continue_same: return store.operation(operation_id)
            if not execute:
                return _progress(store, operation_id, progress, "AWAITING_OPERATOR")
            attempt = {"number": len(retained["attempts"]) + 1, "request_sha256": selected["payload_sha256"],
                       "url": selected["url"], "headers": selected["conditional_headers"], "created_at": now(), "state": "NOT_SENT"}
            def admit():
                require(not stopped(), "DELIVERY_PAUSED", "Paused before the original native request.")
                attempt["state"] = "INVOKING"
                retained["attempts"].append(attempt); retained["state"] = "INVOKING"
                _progress(store, operation_id, progress, "RUNNING",
                          {"kind": "NATIVE_DISPATCH_ADMITTED", "row_id": selected["id"], "attempt": attempt["number"]})
            try:
                response = http.request("PATCH", selected["url"], body=selected["payload"],
                                        headers=selected["conditional_headers"], admit=admit)
                response_descriptor = store.put_bytes(response["body"])
                attempt["response"] = {"status": response["status"], "headers": response["headers"],
                                       "object": response_descriptor, "received_at": now()}
                if response["status"] in {200, 201, 204}:
                    # Acceptance is retained before any later read or cancellation observation.
                    attempt["state"] = "PROVIDER_ACCEPTED"; retained["state"] = "PROVIDER_ACCEPTED"
                    _progress(store, operation_id, progress, "RUNNING",
                              {"kind": "PROVIDER_ACCEPTED", "row_id": selected["id"], "status": response["status"]})
                    current, observation = _read_current(store, http, operation_id, progress, review, selected)
                    retained["readback"] = observation
                    retained["state"] = "APPLIED" if _expected_match(selected, current) else "ACCEPTED_RESULT_CHANGED"
                    _progress(store, operation_id, progress, "RUNNING")
                    if retained["state"] != "APPLIED": return _finish_delivery(store, operation_id, progress, review)
                elif response["status"] in {400, 401, 403, 404, 409, 412, 422, 429}:
                    attempt["state"] = "REJECTED"
                    retained["state"] = "CONFLICT" if response["status"] in {404, 409, 412} else "REJECTED"
                    return _progress(store, operation_id, progress, "AWAITING_OPERATOR",
                                     {"kind": "PROVIDER_REJECTED", "row_id": selected["id"], "status": response["status"],
                                      "retry_after": response["headers"].get("retry-after")})
                else:
                    attempt["state"] = "UNKNOWN"; retained["state"] = "UNKNOWN"
                    return _progress(store, operation_id, progress, "AWAITING_OPERATOR",
                                     {"kind": "PROVIDER_UNCERTAIN", "row_id": selected["id"], "status": response["status"]})
            except BaseException as error:
                # Never demote an admitted or provider-accepted request to NOT_SENT.
                if retained["state"] == "INVOKING":
                    retained["state"] = "UNKNOWN"; attempt["state"] = "UNKNOWN"
                try:
                    _progress(store, operation_id, progress, "AWAITING_OPERATOR",
                              {"kind": "DELIVERY_INTERRUPTED", "row_id": selected["id"],
                               "code": getattr(error, "code", type(error).__name__)})
                except Exception: pass
                raise
        return _finish_delivery(store, operation_id, progress, review)

def accept_observation(store, operation_id, delivery_id, row_id, observation_sha256, *, reviewer, note):
    request = {"delivery_id": request_id(delivery_id), "row_id": request_id(row_id),
               "observation_sha256": full_sha(observation_sha256),
               "reviewer": stable_text(reviewer, 256), "note": stable_text(note, 8192)}
    require(request["reviewer"].strip() and request["note"].strip(), "OBSERVATION_REVIEW",
            "Name the reviewer and explain acceptance of the observed native result.")
    original = store.operation(operation_id, "accept-observation", request)
    if original.get("result"): return original
    with store.work(delivery_id):
        delivery = store.operation(delivery_id)
        require(delivery["kind"] == "target-delivery", "DELIVERY_KIND", "Select the original target delivery.")
        rows = [r for r in delivery["progress"]["rows"] if r["id"] == row_id]
        require(len(rows) == 1, "DELIVERY_ROW", "The original native row is absent.")
        row = rows[0]
        if row["state"] == "ACCEPTED_OBSERVATION":
            require(row.get("acceptance_request") == operation_id and row.get("acceptance") == request,
                    "OBSERVATION_ALREADY_ACCEPTED", "This observation has a different accepted review.")
        else:
            require(row["state"] == "OBSERVED_MATCH_UNCONFIRMED"
                    and row["readback"]["sha256"] == observation_sha256,
                    "OBSERVATION_CHANGED", "Read the exact current retained matching observation first.")
            row["state"] = "ACCEPTED_OBSERVATION"
            row["acceptance_request"] = operation_id; row["acceptance"] = request
            _progress(store, delivery_id, delivery["progress"], "AWAITING_OPERATOR",
                      {"kind": "OBSERVATION_ACCEPTED_BY_REVIEW", "row_id": row_id, "request_id": operation_id})
        return store.update_operation(operation_id, state="COMPLETE",
                                      result={"delivery_id": delivery_id, "row_id": row_id,
                                              "attribution": "operator_accepted_observed_result_without_provider_receipt"})
