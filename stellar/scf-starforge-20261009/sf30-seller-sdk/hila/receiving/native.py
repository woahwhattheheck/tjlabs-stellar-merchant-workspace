"""MIT. Complete original HILA model receiving with retained requests and source fixtures.

The XForm is an actual acquired original. Every respondent and numeric methodology
in this operation is explicitly synthetic engineering data, never a HILA result.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from copy import deepcopy
import csv
from decimal import Decimal, localcontext
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import stat
import sys
import tempfile
import traceback
import uuid

SCHEMA = "stellar-forge.hila-native-receiving.v1"
RESULT = "stellar-forge.hila-native-receiving-result.v1"
FORM_SHA = "123abaf2dbe0d43db02d5ec491578280bb36457652d3e6f2874e6e619ceb04f1"
FORM_BYTES = 482188
SYNTHETIC = "Synthetic engineering data. These are not HILA survey responses or official scores."
UTC = "2026-10-12T21:55:22.761968Z"


def digest(body):
    return hashlib.sha256(body).hexdigest()


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def request_id(operation, name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "stellar-forge/hila/" + operation + "/" + name))


def fixture(form, round_number):
    """Generate complete original-coded source rows with explicit edge cases."""
    fields = form["fields"]
    items = [path for paths in form["dimensions"].values() for path in paths]
    count = 64 if round_number == 1 else 72
    coded = [path for path, field in fields.items() if field["analysisAllowed"]]
    def values(path):
        return [choice["value"] for choice in fields[path]["choices"]]
    for path, required in {
        "consent_cont/consent_acknowledge": {"yes", "no"},
        "assessment/section3a_info_avail/new_info": {"yes", "no", "no_response"},
        "respondent_info/geo_focus": {"regional", "country"},
        "respondent_info/regions": {"multiple"},
        "respondent_info/roles": {"data_specialist", "data_user"},
    }.items():
        check(required <= set(values(path)), "Fixture must use the complete actual questionnaire codes")
    country_codes = values("respondent_info/country")[:2]
    sector_codes = values("respondent_info/topic")[:2]
    organization_codes = values("respondent_info/org_type")[:2]
    check(len(country_codes) == len(sector_codes) == len(organization_codes) == 2,
          "Original questionnaire does not supply the expected comparison memberships")
    rows = []
    for ordinal in range(count):
        row = {"fixture_id": "synthetic-round-%d-row-%03d" % (round_number, ordinal)}
        for path in coded:
            choices = values(path)
            value = next((code for code in choices if code not in {"other", "no_response"}), choices[0] if choices else None)
            row[path] = [value] if fields[path]["kind"] == "select" and value is not None else value
        row["consent_cont/consent_acknowledge"] = "no" if ordinal < 2 else None if ordinal == 2 else "yes"
        row["assessment/section3a_info_avail/new_info"] = "no" if ordinal in {3, 4} else "no_response" if ordinal == 5 else "yes"
        row["respondent_info/geo_focus"] = "regional" if ordinal % 4 == 0 else "country"
        row["respondent_info/regions"] = ["multiple"] if ordinal % 4 == 0 else None
        row["respondent_info/country"] = country_codes if ordinal % 4 == 0 else None
        row["respondent_info/countries"] = None if ordinal % 4 == 0 else country_codes[ordinal % 2]
        row["respondent_info/topic"] = sector_codes[(ordinal + round_number) % 2]
        row["respondent_info/org_type"] = organization_codes[ordinal % 2]
        row["respondent_info/roles"] = ["data_specialist", "data_user"] if ordinal % 3 == 0 else [
            "data_specialist" if ordinal % 2 == 0 else "data_user"]
        for number, path in enumerate(items):
            codes = values(path)
            check(set(codes) == {"yes", "partial", "no", "no_response"},
                  "The synthetic calculation selects the actual four-code agreement items")
            row[path] = ["yes", "partial", "no"][(ordinal + number + round_number) % 3]
        # These observations exercise distinct source states without inventing new form codes.
        if ordinal == 7:
            for path in items:
                row[path] = "no_response"
        if ordinal == 8:
            row[items[0]] = None
        if ordinal == 9:
            row[items[0]] = "SYNTHETIC_INVALID_CODE"
        if ordinal == 10:
            row[items[0]] = "partial"
        if ordinal == 11:
            row.pop(items[1], None)
        for path in ["consent_cont/why_no", "respondent_info/org_name", "respondent_info/subnationals",
                     "respondent_info/opt_details", "support/final_txt", "support/final_aud"]:
            row[path] = "PRIVATE_SYNTHETIC_" + row["fixture_id"] + "_" + path
        rows.append(row)
    return {"round": round_number, "kind": "synthetic-engineering", "notice": SYNTHETIC,
            "rows": rows, "countries": country_codes, "sectors": sector_codes,
            "organizations": organization_codes, "items": items}


def fixture_bytes(selected):
    rows = selected["rows"]
    if selected["round"] == 2:
        return (json.dumps(rows, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n").encode(), "json"
    columns = sorted({key for row in rows for key in row})
    out = io.StringIO(newline="")
    writer = csv.DictWriter(out, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: " ".join(value) if isinstance(value, list) else "" if value is None else value
                         for key, value in row.items()})
    return out.getvalue().encode(), "csv"


def configured_rules(form, rules_module):
    raw = rules_module.template(form)
    raw.update({"name": "Explicit synthetic engineering score, never an official HILA methodology", "status": "approved"})
    raw["provenance"] = {
        "label": "Synthetic receiving procedure", "url": "", "version": "engineering-1",
        "approvedBy": "HILA product engineering receiver", "approvedAt": UTC,
        "notes": SYNTHETIC + " Scores and weights are selected solely to exercise the supported calculation."
    }
    for dimension in raw["dimensions"]:
        dimension["minimumAnswered"] = 2
        for item in dimension["items"]:
            item["weight"] = "1"
            item["scores"] = {"yes": "1", "partial": "0.5", "no": "0", "no_response": None}
    raw["dimensions"][0]["items"][0]["scores"]["partial"] = None
    raw["disclosure"] = {
        "status": "approved", "approvedBy": "HILA product engineering receiver", "approvedAt": UTC,
        "basis": SYNTHETIC + " These explicit thresholds exercise aggregate disclosure and whole-axis suppression.",
        "minimumRespondents": 2, "minimumScored": 2, "complementarySuppression": "whole-axis",
        "releaseComparisons": True
    }
    return rules_module.validate_rules(raw, form)


def reference_overall(fixture_value, edition, methodology, excluded_ordinals=()):
    """Independent direct source arithmetic for the controlled original-gate fixture."""
    original = fixture_value["rows"]
    counts = {
        "sourceRows": len(original),
        "declined": sum(row.get("consent_cont/consent_acknowledge") == "no" for row in original),
        "consentMissing": sum(row.get("consent_cont/consent_acknowledge") not in {"yes", "no"} for row in original),
        "consenting": sum(row.get("consent_cont/consent_acknowledge") == "yes" for row in original),
    }
    selected = [(index, row) for index, row in enumerate(original)
                if row.get("consent_cont/consent_acknowledge") == "yes" and index not in excluded_ordinals]
    counts["selected"] = len(selected)
    counts["excludedByReview"] = sum(index in excluded_ordinals and row.get("consent_cont/consent_acknowledge") == "yes"
                                    for index, row in enumerate(original))
    counts["newInformation"] = sum(row.get("assessment/section3a_info_avail/new_info") == "yes" for _, row in selected)
    counts["noNewInformation"] = sum(row.get("assessment/section3a_info_avail/new_info") == "no" for _, row in selected)
    counts["newInformationOther"] = len(selected) - counts["newInformation"] - counts["noNewInformation"]
    dimension_results = {}
    with localcontext() as context:
        context.prec = 60
        for dimension in methodology["dimensions"]:
            scores = []
            for _, row in selected:
                if row.get("assessment/section3a_info_avail/new_info") != "yes":
                    continue
                numerator, denominator, answered = Decimal(0), Decimal(0), 0
                for item in dimension["items"]:
                    if not item["included"] or item["field"] not in edition["mapping"]:
                        continue
                    value = row.get(item["field"])
                    score = item["scores"].get(value) if isinstance(value, str) else None
                    if score is None:
                        continue
                    weight = Decimal(item["weight"])
                    numerator += Decimal(score) * weight
                    denominator += weight
                    answered += 1
                if answered >= dimension["minimumAnswered"] and denominator:
                    scores.append(numerator / denominator)
            mean = sum(scores, Decimal(0)) / len(scores) if scores else None
            dimension_results[dimension["id"]] = {"respondents": len(selected), "scoredRespondents": len(scores),
                                                   "mean": str(mean) if mean is not None else None}
    return {"counts": counts, "dimensions": dimension_results}


def run(config):
    check(isinstance(config, dict) and config.get("schema") == SCHEMA, "Select the complete original receiving input")
    for name in ["operationId", "sourceRoot", "originalSdk", "directory", "receiverDirectory", "outputDirectory", "node"]:
        check(isinstance(config.get(name), str) and config[name], "Missing original " + name)
    source_root = Path(config["sourceRoot"]).resolve(strict=True)
    original_sdk = Path(config["originalSdk"]).resolve(strict=True)
    sys.path[:0] = [str(source_root / "hila"), str(original_sdk / "xml")]
    os.environ["SF30_XML_NODE"] = str(Path(config["node"]).resolve(strict=True))
    from hila_workspace import HilaWorkspace, InputError, DEFINITION_FIELDS, publish, strict_json, stable_build
    from hila_questionnaire import canonical, inventory
    import hila_rules as rules
    from hila_portable import output_lease, checked_size, inspect_archive, write_archive, copy_complete, PACKET
    output = Path(config["outputDirectory"]).expanduser().absolute()
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    check(not output.is_symlink() and stat.S_ISDIR(output.lstat().st_mode), "Output must be an original real directory")
    input_body = canonical(config)
    operation = config["operationId"]
    action_results = {}
    files = {}

    def emit(relative, value):
        body = value if isinstance(value, bytes) else canonical(value)
        path = publish(output / relative, body)
        files[relative] = path
        return path

    def track(relative):
        path = output / relative
        checked_size(path)
        files[relative] = path
        return path

    def action(workspace, name, operation_kind, payload, call):
        path = emit("actions/" + name + "-request.json", {"operation": operation_kind, "input": payload})
        # The saved complete input is authoritative before the first native mutation.
        retained = strict_json(path.read_bytes())
        value = call(retained["input"])
        original = workspace.request(retained["input"]["requestId"])
        check(original["kind"] == operation_kind and original["input"] == retained["input"] and original["result"] == value,
              "Native request lookup changed the original full input/result")
        emit("actions/" + name + "-result.json", value)
        emit("actions/" + name + "-lookup.json", original)
        action_results[name] = value
        return value

    def retained_report_export(name, legacy_key, call):
        """Reuse the first complete returned descriptor; retain later reuse observations."""
        path = output / "native" / (name + "-export.json")
        prior = strict_json(path.read_bytes()) if path.exists() else None
        legacy = output / "source-complete.json"
        if prior is None and legacy.exists():
            prior = strict_json(legacy.read_bytes()).get(legacy_key)
        observed = call()
        comparable = lambda value: {key: item for key, item in value.items() if key != "reused"}
        if prior is not None:
            check(comparable(prior) == comparable(observed),
                  "Existing report export selects different original bytes or revision")
        selected = prior if prior is not None else observed
        # The actual repeated result remains available without altering frozen bundle membership.
        observation = canonical(observed)
        publish(output / "export-observations" / (name + "-" + digest(observation) + ".json"), observation)
        emit("native/" + name + "-export.json", selected)
        return selected

    def native_dataset(workspace, edition, name):
        parent = output / "merchant-datasets"
        parent.mkdir(mode=0o700, exist_ok=True)
        stage_root = Path(tempfile.mkdtemp(prefix=".dataset-", dir=parent))
        staged = stage_root / name
        destination = parent / name
        try:
            workspace.export_dataset(edition["build"]["id"], staged)
            expected = {p.name: checked_size(p) for p in staged.iterdir()}
            check(set(expected) == {"data.csv", "dataset.json", "hila-lineage.json"},
                  "Original merchant dataset must retain all three members")
            if destination.exists():
                check(destination.is_dir() and not destination.is_symlink(), "Dataset destination changed")
                actual = {p.name: checked_size(p) for p in destination.iterdir()}
                check(actual == expected, "Existing original dataset output differs")
            else:
                os.replace(staged, destination)
                fd = os.open(parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
                try:
                    os.fsync(fd)
                finally:
                    os.close(fd)
            for member in expected:
                track("merchant-datasets/" + name + "/" + member)
            return {"directory": str(destination), "files": expected, "build": stable_build(edition["build"])}
        finally:
            shutil.rmtree(stage_root, ignore_errors=True)

    @contextmanager
    def model(path):
        workspace = HilaWorkspace(path, create=True)
        try:
            yield workspace
        finally:
            workspace.close()

    with output_lease(output / "operation.json"):
        emit("operation.json", config)
        completed = output / "result.json"
        if completed.exists():
            result = strict_json(completed.read_bytes())
            check(result.get("schema") == RESULT and result.get("inputSha256") == digest(input_body)
                  and result.get("operationId") == operation and result.get("state") == "COMPLETE",
                  "Completed receiving result selects a different original operation")
            for name, expected in result["files"].items():
                check(checked_size(output / name) == expected, "Completed original output changed: " + name)
            return result
        try:
            questionnaire = config["questionnaire"]
            original = Path(questionnaire["path"]).read_bytes()
            check(len(original) == questionnaire["bytes"] == FORM_BYTES and
                  digest(original) == questionnaire["sha256"] == FORM_SHA,
                  "Receiving must retain the exact actual acquired full XForm")
            form = inventory(original)
            check(len(form["languages"]) == 4 and [len(v) for v in form["dimensions"].values()] == [11, 10, 10, 10, 5],
                  "Actual questionnaire footprint changed")
            emit("originals/questionnaire.xml", original)
            emit("originals/questionnaire-acquisition.json", questionnaire)
            emit("originals/questionnaire-catalogue.json", form)
            fixtures = [fixture(form, number) for number in [1, 2]]
            approved_rules = configured_rules(form, rules)
            emit("originals/synthetic-methodology.json", approved_rules)
            emitted_inputs = []
            for selected in fixtures:
                body, suffix = fixture_bytes(selected)
                path = emit("originals/synthetic-round-%d.%s" % (selected["round"], suffix), body)
                emitted_inputs.append(path)
                emit("originals/synthetic-round-%d-description.json" % selected["round"],
                     {key: value for key, value in selected.items() if key != "rows"})
            emit("SYNTHETIC_INPUT_NOTICE.txt", (SYNTHETIC + "\nThe full actual questionnaire is retained separately with its original provenance.\n").encode())
            with model(config["directory"]) as ws:
                acquired = ws.add_questionnaire(io.BytesIO(original), questionnaire["provenance"])
                check(ws.add_questionnaire(io.BytesIO(original), questionnaire["provenance"]) == acquired,
                      "Questionnaire acquisition replay changed")
                editions = []
                native_exports = []
                native_rows = []
                for index, path in enumerate(emitted_inputs):
                    with path.open("rb") as source:
                        added = ws.add_source(source, "Synthetic engineering round " + str(index + 1), path.name)
                    check(added["bytes"] == path.stat().st_size and added["id"] == digest(path.read_bytes()),
                          "Original response intake changed source bytes")
                    preview = ws.mapping(form["sha256"], added["id"])
                    selected_mapping = dict(preview["mapping"])
                    # One intentionally unmapped item demonstrates changed coverage between editions.
                    if index == 0:
                        selected_mapping.pop(fixtures[index]["items"][-1])
                    emit("originals/mapping-round-%d.json" % (index + 1), preview | {"selectedMapping": selected_mapping})
                    payload = {
                        "requestId": request_id(operation, "edition-" + str(index + 1)),
                        "name": "Synthetic engineering round " + str(index + 1),
                        "source": added["id"], "questionnaire": form["sha256"], "acquisition": acquired["acquisition"]["id"],
                        "mapping": selected_mapping, "respondentKey": "fixture_id",
                        "provenance": {
                            "kind": "synthetic-engineering", "label": SYNTHETIC, "sourceUrl": "",
                            "obtainedAt": UTC, "periodStart": "2026-01-01" if index == 0 else "2026-07-01",
                            "periodEnd": "2026-06-30" if index == 0 else "2026-10-12",
                            "approvedBy": "HILA product engineering receiver", "approvedAt": UTC,
                            "approval": SYNTHETIC
                        }
                    }
                    edition = action(ws, "edition-" + str(index + 1), "edition.save", payload, ws.save_edition)
                    check(ws.save_edition(payload) == edition and edition["rows"] == len(fixtures[index]["rows"]),
                          "Native edition full-row count or replay differs")
                    rows = list(ws.rows(edition["id"]))
                    check(len(rows) == edition["rows"] and len({row["recordId"] for row in rows}) == edition["rows"],
                          "Original Dataset omitted or duplicated a complete source record")
                    check(all(not any(key in row["answers"] for key in form["excludedFromAnalysis"]) for row in rows),
                          "Private free-text fields entered the analysis projection")
                    query = ws.query(edition["build"]["id"], {"limit": "1000"})
                    emit("native/round-%d-query.json" % (index + 1), query)
                    emit("native/round-%d-coded-rows.json" % (index + 1), rows)
                    native_rows.append(rows)
                    editions.append(edition)
                    native_exports.append(native_dataset(ws, edition, "round-" + str(index + 1)))
                draft_payload = {
                    "requestId": request_id(operation, "review-draft"),
                    "name": "HILA original questionnaire: two synthetic editions",
                    "notes": SYNTHETIC, "editions": [edition["id"] for edition in editions],
                    "rules": rules.template(form), "selection": {axis: [] for axis in ["country", "sector", "organization", "role"]},
                    "review": {"status": "draft", "reviewer": "", "note": "Methodology is deliberately unconfigured."},
                    "rowDecisions": [], "cellDecisions": []
                }
                first = action(ws, "review-draft", "review.save", draft_payload, ws.save_review)
                raw_report = ws.report(first["id"], first["revision"])
                check(all(cell["meanScore"] is None for item in raw_report["editions"] for cell in item["cells"]),
                      "Unconfigured methodology fabricated a composite score")
                try:
                    ws.report(first["id"], first["revision"], public=True)
                except InputError:
                    pass
                else:
                    raise RuntimeError("Unconfigured public release was accepted")
                approved_payload = {key: deepcopy(first[key]) for key in DEFINITION_FIELDS}
                approved_payload.update({"requestId": request_id(operation, "review-methodology"), "id": first["id"],
                                         "expectedRevision": first["revision"], "rules": approved_rules,
                                         "review": {"status": "reviewed", "reviewer": "HILA product engineering receiver",
                                                    "note": "The explicit synthetic method and all denominator states are reviewed for mechanics."}})
                second = action(ws, "review-methodology", "review.save", approved_payload, ws.save_review)
                approved_report = ws.report(second["id"], second["revision"])
                old_packet = ws.export_review(second["id"], output / "hila-history-revision-2.zip", second["revision"])
                track("hila-history-revision-2.zip")
                first_cell = next(cell for cell in approved_report["editions"][0]["cells"] if cell["axis"] == "overall")
                exclude = {"edition": editions[0]["id"], "recordId": native_rows[0][6]["recordId"],
                           "decision": "exclude", "reviewer": "HILA product engineering receiver",
                           "note": "Explicit synthetic analyst exclusion; all original source bytes remain retained."}
                cell_note = {"key": first_cell["key"], "decision": "note",
                             "reviewer": "HILA product engineering receiver",
                             "note": "Independent editions have changed coverage and overlapping memberships; this is not longitudinal person matching."}
                focused = {key: deepcopy(second[key]) for key in DEFINITION_FIELDS}
                focused.update({"requestId": request_id(operation, "review-cohort"), "id": first["id"],
                                "expectedRevision": second["revision"],
                                "selection": {"country": [fixtures[0]["countries"][0]], "sector": [], "organization": [], "role": []},
                                "review": {"status": "needs-correction", "reviewer": "HILA product engineering receiver",
                                           "note": "The selected country cohort is being checked before restoring the whole edition comparison."},
                                "rowDecisions": [exclude], "cellDecisions": [cell_note]})
                third = action(ws, "review-cohort", "review.save", focused, ws.save_review)
                final_payload = {key: deepcopy(third[key]) for key in DEFINITION_FIELDS}
                final_payload.update({"requestId": request_id(operation, "review-full"), "id": first["id"],
                                      "expectedRevision": third["revision"],
                                      "selection": {axis: [] for axis in ["country", "sector", "organization", "role"]},
                                      "review": {"status": "reviewed", "reviewer": "HILA product engineering receiver",
                                                 "note": "Complete synthetic editions, original privacy boundaries, denominators and full portable history reviewed."}})
                final = action(ws, "review-full", "review.save", final_payload, ws.save_review)
                report = ws.report(final["id"], final["revision"])
                references = []
                for index, (selected, edition, actual) in enumerate(zip(fixtures, editions, report["editions"])):
                    expected = reference_overall(selected, edition, approved_rules, {6} if index == 0 else set())
                    for key, value in expected["counts"].items():
                        check(actual["counts"][key] == value, "Original source denominator mismatch: " + key)
                    for dimension, wanted in expected["dimensions"].items():
                        cell = next(cell for cell in actual["cells"] if cell["dimension"] == dimension and cell["axis"] == "overall")
                        check(cell["respondents"] == wanted["respondents"] and cell["scoredRespondents"] == wanted["scoredRespondents"],
                              "Independent source scoring denominator differs")
                        check((cell["meanScore"] is None) == (wanted["mean"] is None), "Composite availability differs")
                        if wanted["mean"] is not None:
                            check(abs(Decimal(cell["meanScore"]) - Decimal(wanted["mean"])) <= Decimal("0.000000000001"),
                                  "Independent source arithmetic differs from the complete report")
                    references.append(expected)
                check(len(ws.history(final["id"])) == 4 and final["revision"] == 4,
                      "Original review history did not retain all four complete revisions")
                check("PRIVATE_SYNTHETIC_" not in canonical(report).decode(),
                      "Private original free text entered the report")
                public = ws.report(final["id"], final["revision"], public=True)
                check("PRIVATE_SYNTHETIC_" not in canonical(public).decode() and
                      all("items" not in cell for item in public["editions"] for cell in item["cells"]),
                      "Public report disclosed private rows or item distributions")
                emit("reference-arithmetic.json", references)
                emit("report.json", report)
                emit("public-aggregates.json", public)
                emit("native/complete-editions.json", editions)
                emit("native/merchant-datasets.json", native_exports)
                final_packet = ws.export_review(final["id"], output / "hila-complete-history.zip", final["revision"])
                check(ws.export_review(final["id"], output / "hila-complete-history.zip", final["revision"]) == final_packet,
                      "Complete original export changed on repeat")
                track("hila-complete-history.zip")
                private_report = retained_report_export("private-report", "privateReport", lambda:
                    ws.write_report(final["id"], output / "hila-private-reports.zip", final["revision"]))
                public_report = retained_report_export("public-report", "publicReport", lambda:
                    ws.write_report(final["id"], output / "hila-public-aggregates.zip", final["revision"], public=True))
                track("hila-private-reports.zip")
                track("hila-public-aggregates.zip")
                private_inspection = inspect_archive(Path(private_report["file"]))
                public_inspection = inspect_archive(Path(public_report["file"]))
                emit("native/private-report-inspection.json", private_inspection)
                emit("native/public-report-inspection.json", public_inspection)
                # Complete exact CSV/HTML originals are useful directly, while their ZIP is retained.
                import zipfile
                with zipfile.ZipFile(private_report["file"]) as archive:
                    for member in archive.namelist():
                        if member != "manifest.json":
                            emit("report-files/" + member, archive.read(member))
                source_state = {"review": final, "history": ws.history(final["id"]),
                                "report": report, "packet": final_packet, "oldPacket": old_packet,
                                "privateReport": private_report, "publicReport": public_report}
                emit("source-complete.json", source_state)
            # The source model/engine is closed before opening the detached original receiver.
            with model(config["receiverDirectory"]) as receiver:
                received_old = receiver.receive_review(Path(old_packet["file"]))
                check(received_old["review"]["revision"] == 2, "Old packet selected the wrong historical revision")
                received = receiver.receive_review(Path(final_packet["file"]))
                repeated = receiver.receive_review(Path(final_packet["file"]))
                check(received["review"] == final and repeated["review"] == final,
                      "Full detached receiving or replay changed the original selected review")
                check(receiver.report(final["id"], final["revision"]) == report,
                      "Detached full report did not reconstruct")
                output_again = receiver.export_review(final["id"], output / "receiver-reexport-revision-4.zip", final["revision"])
                track("receiver-reexport-revision-4.zip")
                check(checked_size(Path(output_again["file"])) == checked_size(Path(final_packet["file"])),
                      "Whole received source/history archive is not byte-identical")
                local = {key: deepcopy(final[key]) for key in DEFINITION_FIELDS}
                local.update({"requestId": request_id(operation, "receiver-local-review"), "id": final["id"],
                              "expectedRevision": final["revision"],
                              "notes": final["notes"] + "\nIndependent recipient retained this separate local review continuation."})
                later = action(receiver, "receiver-local-review", "review.save", local, receiver.save_review)
                restored_old = receiver.receive_review(Path(old_packet["file"]))
                check(restored_old["review"]["revision"] == 2 and receiver.review(final["id"]) == later and later["revision"] == 5,
                      "Older packet replaced a later local continuation")
                local_packet = receiver.export_review(final["id"], output / "receiver-complete-history.zip", later["revision"])
                track("receiver-complete-history.zip")
                emit("receiving/full-result.json", received)
                emit("receiving/repeated-result.json", repeated)
                emit("receiving/older-prefix-result.json", restored_old)
                emit("receiving/local-complete.json", {"review": later, "packet": local_packet,
                                                       "history": receiver.history(final["id"])})
            # A cold reopen uses the same original native model and stored complete revision.
            with model(config["receiverDirectory"]) as reopened:
                check(reopened.review(final["id"]) == later and len(reopened.history(final["id"])) == 5,
                      "Original recipient cold reopen lost its complete local history")
                check(reopened.report(final["id"], final["revision"]) == report,
                      "Cold reopen changed the received original report")
                for edition in editions:
                    check(stable_build(reopened.edition(edition["id"])["build"]) == stable_build(edition["build"]),
                          "Cold reopen changed original Dataset capabilities or complete CSV")
                emit("receiving/cold-reopen.json", {"review": reopened.review(final["id"]),
                                                    "history": reopened.history(final["id"])})
            # Both original workspace/engine lifetimes are closed before final archive publication.
            selection = {"schema": RESULT, "operationId": operation, "inputSha256": digest(input_body),
                         "sourceReview": {"id": final["id"], "revision": final["revision"], "definitionSha256": final["definitionSha256"]},
                         "receivedReview": {"id": later["id"], "revision": later["revision"], "definitionSha256": later["definitionSha256"]},
                         "questionnaire": {"bytes": FORM_BYTES, "sha256": FORM_SHA}, "notice": SYNTHETIC}
            bundle_files = dict(sorted(files.items()))
            bundle = write_archive(output / "HILA_Complete_Engineering_Receiving.zip", bundle_files,
                                   "stellar-forge.hila-native-receiving-files.v1", selection)
            track("HILA_Complete_Engineering_Receiving.zip")
            result = {**selection, "state": "COMPLETE", "sourceDirectory": config["directory"],
                      "receiverDirectory": config["receiverDirectory"], "outputDirectory": str(output),
                      "editions": [{"id": edition["id"], "rows": edition["rows"], "source": edition["source"]} for edition in editions],
                      "counts": [item["counts"] for item in report["editions"]],
                      "privateBundle": bundle, "files": {name: checked_size(path) for name, path in sorted(files.items())}}
            publish(completed, canonical(result))
            return result
        except BaseException as error:
            failure = {"schema": "stellar-forge.hila-native-receiving-failure.v1",
                       "operationId": operation, "inputSha256": digest(input_body),
                       "error": type(error).__name__, "message": str(error), "traceback": traceback.format_exc()}
            publish(output / ("failure-" + digest(canonical(failure)) + ".json"), canonical(failure))
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    # Production strict parsing occurs again after the selected source imports.
    config = json.loads(Path(args.input).read_bytes())
    value = run(config)
    print(json.dumps(value, ensure_ascii=False, sort_keys=True), flush=True)


if __name__ == "__main__":
    main()
