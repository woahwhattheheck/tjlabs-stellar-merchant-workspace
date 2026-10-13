"""MIT. Complete retained risk-study output -> original Research run.import.

No model, evaluator, network, dossier writer, or alternative artifact store runs
here. The caller supplies original output bytes and the actual destination report.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .evaluation import canonical, sha, validate_plan, retain_output, StudyError

SCHEMA = "sf88.risk-study-import-selection.v1"
EXECUTION_SCHEMA = "sf88.risk-study-execution.v1"
RESULT_SCHEMA = "sf88.risk-study-import-preparation.v1"
RUN_SCHEMA = "sf88-research-comparison-run/v1"
MAX_RUN = 64 * 1024 * 1024
MAX_REQUEST = 128 * 1024 * 1024 + 65536  # Original comparison/routes.mjs.
MAX_FILE = 256 * 1024 * 1024
MAX_TOTAL = 768 * 1024 * 1024
MAX_JSON_METADATA = 1024 * 1024
SAFE_INTEGER = 9007199254740991
METRICS = frozenset(("n", "weight", "actualWeightedSum", "predictedWeightedSum",
                    "actualMean", "predictedMean", "bias", "mae", "mse", "rmse",
                    "rSquared", "predictiveRatio", "normalizedMAE"))
DECIMAL = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\Z")
IDENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}\Z")
HASH = re.compile(r"[a-f0-9]{64}\Z")


def need(condition, code, message):
    if not condition:
        raise StudyError(code, message)


def fields(value, names, where):
    need(isinstance(value, dict) and set(value) == set(names), "FIELDS", where + " fields differ")
    return value


def utf16_units(value):
    """The original JavaScript text contract counts UTF-16 code units."""
    return sum(2 if ord(char) > 0xFFFF else 1 for char in value)


def text(value, where, maximum=20000, empty=False):
    need(isinstance(value, str) and utf16_units(value) <= maximum and (empty or bool(value.strip())),
         "TEXT", where + " must be bounded text")
    return value


def ident(value, where):
    need(isinstance(value, str) and IDENT.fullmatch(value), "IDENTITY", where + " is invalid")
    return value


def digest(value, where):
    need(isinstance(value, str) and HASH.fullmatch(value), "DIGEST", where + " is invalid")
    return value


def integer(value, where, lower=0, upper=SAFE_INTEGER):
    need(type(value) is int and lower <= value <= upper, "INTEGER", where + " is outside capacity")
    return value


def path(value):
    text(value, "artifact.path", 1024)
    need(not value.startswith("/") and "\\" not in value and
         all(x and x not in (".", "..") for x in value.split("/")) and
         not any(ord(c) < 32 or ord(c) == 127 for c in value),
         "PATH", "Use a relative original artifact path")
    return value


def timestamp(value):
    text(value, "execution timestamp", 24)
    need(re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z", value),
         "TIME", "Use the actual canonical UTC timestamp with milliseconds")
    try:
        return datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        raise StudyError("TIME", "Invalid actual execution timestamp") from None


def _pairs(items):
    out = {}
    for key, value in items:
        need(key not in out, "JSON_DUPLICATE", "Original JSON contains duplicate keys")
        out[key] = value
    return out


def read_json(raw, where):
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_pairs,
                           parse_constant=lambda x: (_ for _ in ()).throw(
                               StudyError("JSON_NUMBER", "Nonfinite JSON number")))
    except (ValueError, UnicodeError) as error:
        if isinstance(error, StudyError):
            raise
        raise StudyError("JSON", where + " is not exact UTF-8 JSON") from None
    _json_safe(value, where)
    return value


def _json_safe(value, where, depth=0):
    """Never let JS JSON.parse silently change a retained numeric identity."""
    need(depth <= 128, "JSON_DEPTH", where + " nesting exceeds capacity")
    if isinstance(value, str):
        need(not any(0xD800 <= ord(char) <= 0xDFFF for char in value),
             "JSON_UNICODE", where + " contains a surrogate code point; retain Unicode scalar text")
        return
    if value is None or type(value) is bool:
        return
    if type(value) is int:
        need(abs(value) <= SAFE_INTEGER, "JSON_PRECISION",
             where + " contains an unsafe JSON integer; retain explicit typed text")
        return
    if type(value) is float:
        need(math.isfinite(value), "JSON_NUMBER", where + " contains a nonfinite number")
        return
    if isinstance(value, list):
        for x in value:
            _json_safe(x, where, depth + 1)
        return
    need(isinstance(value, dict) and all(isinstance(k, str) for k in value),
         "JSON_TYPE", where + " must contain ordinary JSON values")
    for key, x in value.items():
        _json_safe(key, where, depth + 1)
        _json_safe(x, where, depth + 1)


def _native_json_bound(value, level=0):
    """Upper bound for original JSON.stringify(value, null, 2) UTF-8 bytes.

    Strings, keys, safe integers, booleans, null and pretty structure are exact.
    Finite binary64 numbers reserve 32 bytes, covering the native decimal and
    exponential forms without changing an original value or pretending Python's
    float spelling is JavaScript's. The root newline is added by the caller.
    """
    if isinstance(value, dict):
        if not value:
            return 2
        return (2 + 2 * level + 1 + len(value) - 1 +
                sum(2 * (level + 1) + len(canonical(key)) + 2 +
                    _native_json_bound(item, level + 1) + 1
                    for key, item in value.items()))
    if isinstance(value, list):
        if not value:
            return 2
        return (2 + 2 * level + 1 + len(value) - 1 +
                sum(2 * (level + 1) + _native_json_bound(item, level + 1) + 1
                    for item in value))
    if type(value) is float:
        return 32
    return len(canonical(value))


def _native_json_bytes_bound(value):
    return _native_json_bound(value) + 1  # Original node/store.mjs jsonBytes.


def _metadata(value, where):
    need(isinstance(value, dict), "JSON_TYPE", where + " must be an object")
    _json_safe(value, where)
    return _native_json_bytes_bound(value) <= MAX_JSON_METADATA


@dataclass(frozen=True)
class _OriginalBase64:
    descriptor: dict


def _json_chunks(value, read_blob=None):
    """Exact sorted compact UTF-8 run JSON; original binaries are streamed."""
    if isinstance(value, _OriginalBase64):
        need(read_blob is not None, "INTERNAL", "Original artifact resolver is required")
        data = original_bytes(value.descriptor, read_blob)
        yield b'"'
        for offset in range(0, len(data), 3 * 16384):
            yield base64.b64encode(data[offset:offset + 3 * 16384])
        yield b'"'
    elif isinstance(value, dict):
        yield b"{"
        for index, key in enumerate(sorted(value)):
            if index:
                yield b","
            yield canonical(key)
            yield b":"
            yield from _json_chunks(value[key], read_blob)
        yield b"}"
    elif isinstance(value, list):
        yield b"["
        for index, item in enumerate(value):
            if index:
                yield b","
            yield from _json_chunks(item, read_blob)
        yield b"]"
    else:
        yield canonical(value)


def _json_length(value):
    if isinstance(value, _OriginalBase64):
        return 2 + 4 * ((value.descriptor["bytes"] + 2) // 3)
    if isinstance(value, dict):
        return 2 + max(0, len(value) - 1) + sum(
            len(canonical(k)) + 1 + _json_length(v) for k, v in value.items())
    if isinstance(value, list):
        return 2 + max(0, len(value) - 1) + sum(_json_length(v) for v in value)
    return len(canonical(value))



def _escaped_json_length(value):
    """Size of complete run JSON inside rawText, excluding its outer quotes."""
    if isinstance(value, _OriginalBase64):
        return 4 + 4 * ((value.descriptor["bytes"] + 2) // 3)
    if isinstance(value, dict):
        return 2 + max(0, len(value) - 1) + sum(
            _escaped_json_length(k) + 1 + _escaped_json_length(v)
            for k, v in value.items())
    if isinstance(value, list):
        return 2 + max(0, len(value) - 1) + sum(_escaped_json_length(v) for v in value)
    raw = canonical(value)
    return len(raw) + raw.count(b'"') + raw.count(b"\\")

def original_bytes(meta, read_blob):
    value = read_blob(meta["sha256"])
    need(type(value) is bytes and len(value) == meta["bytes"] and sha(value) == meta["sha256"],
         "ORIGINAL_CHANGED", "An original artifact differs from its full bytes/SHA256")
    return value


def inventory(artifacts, read_blob):
    need(isinstance(artifacts, list) and 1 <= len(artifacts) <= 2000,
         "ARTIFACT_COUNT", "Retain every artifact within the 2000-file contract")
    out, paths, total = {}, set(), 0
    for entry in artifacts:
        fields(entry, ("id", "path", "role", "mediaType", "bytes", "sha256"), "Artifact")
        ident(entry["id"], "artifact.id"); path(entry["path"])
        text(entry["role"], "artifact.role", 160); text(entry["mediaType"], "artifact.mediaType", 240)
        integer(entry["bytes"], "artifact.bytes", 0, MAX_FILE); digest(entry["sha256"], "artifact.sha256")
        need(entry["id"] not in out and entry["path"] not in paths,
             "ARTIFACT_DUPLICATE", "Artifact IDs and relative paths must be unique")
        total += entry["bytes"]
        need(total <= MAX_TOTAL, "ARTIFACT_CAPACITY",
             "Complete originals exceed 768 MiB; retain the original complete source outside this bounded preparation")
        original_bytes(entry, read_blob)  # Validate every file, including oversized-import outcomes.
        out[entry["id"]] = dict(entry)
        paths.add(entry["path"])
    return out, total


def _select(items, key, value, where):
    found = [x for x in items if isinstance(x, dict) and x.get(key) == value]
    need(len(found) == 1, "SELECTION", "Select one exact " + where)
    return found[0]


def _destination(selection, value):
    need(isinstance(value, dict) and value.get("schema") == "sf88-research-comparison/v1",
         "DESTINATION", "Use the complete actual comparisonReport from the original dossier")
    ident(value.get("dossierId"), "dossierId")
    need(value["dossierId"] == selection["dossierId"] and
         value.get("revision") == selection["request"]["expectedRevision"],
         "DESTINATION_REVISION", "The original dossier/report selection changed")
    case = value.get("case")
    need(isinstance(case, dict) and case.get("id") == selection["caseId"] and
         case.get("versionId") == selection["caseVersionId"],
         "CASE_VERSION", "Use the exact original case version")
    candidate = _select(value.get("candidateEditions", []), "versionId",
                        selection["candidateVersionId"], "candidate edition")
    need(candidate.get("caseId") == case["id"] and
         candidate.get("caseVersionId") == case["versionId"],
         "CANDIDATE_VERSION", "Candidate belongs to another case edition")
    definition = case.get("definition")
    need(isinstance(definition, dict) and isinstance(definition.get("criteria"), list),
         "CASE_DEFINITION", "The original case definition and criteria are required")
    criteria = {}
    for criterion in definition["criteria"]:
        ident(criterion.get("id"), "criterion.id")
        need(criterion["id"] not in criteria, "CRITERION_DUPLICATE", "Original criteria repeat")
        criteria[criterion["id"]] = criterion
    return case, candidate, criteria


def _source_refs(selection, destination, case, files):
    refs = selection["sourceRefs"]
    need(isinstance(refs, list) and len(refs) <= 500, "SOURCES", "Too many source-edition bindings")
    editions = {}
    for value in destination.get("sourceEditions", []):
        ident(value.get("id"), "source edition")
        need(value["id"] not in editions, "SOURCE_DUPLICATE", "Destination source editions repeat")
        editions[value["id"]] = value
    result, coverage, seen = [], set(), set()
    for ref in refs:
        fields(ref, ("editionId", "locator", "note", "artifactIds"), "Source binding")
        ident(ref["editionId"], "source edition"); text(ref["locator"], "source locator", 4000)
        text(ref["note"], "source note", 12000, True)
        key = (ref["editionId"], ref["locator"])
        need(key not in seen, "SOURCE_DUPLICATE", "Source-edition locator repeats")
        seen.add(key)
        edition = editions.get(ref["editionId"])
        need(edition is not None and edition.get("questionId") == case["definition"]["questionId"],
             "SOURCE_QUESTION", "Source edition is not retained for this original research question")
        linked = ref["artifactIds"]
        need(isinstance(linked, list) and len(linked) <= 1000 and len(set(linked)) == len(linked)
             and all(i in files for i in linked), "SOURCE_ARTIFACT", "Source binding must reference retained original files")
        coverage.update(linked)
        result.append({k: ref[k] for k in ("editionId", "locator", "note")})
    return result, coverage


def _metric_set(report, candidate_index, scope):
    fields(scope, ("kind", "index"), "Metric scope")
    kind, index = scope["kind"], scope["index"]
    root = "/candidates/" + str(candidate_index)
    candidate = report["candidates"][candidate_index]
    if kind in ("COMMON", "UNCAPPED_COMMON"):
        need(index is None, "METRIC_SCOPE", "Common scope has no index")
        field = "commonCohort" if kind == "COMMON" else "uncappedCommonCohort"
        return candidate[field], root + "/" + field, {"kind": kind, "rowSelection": "/rows/*/commonIncluded"}
    integer(index, "scope.index", 0, 250000)
    if kind == "SUBGROUP":
        need(index < len(candidate["subgroups"]), "METRIC_SCOPE", "Subgroup index is absent")
        group = candidate["subgroups"][index]
        return group["metrics"], root + "/subgroups/" + str(index) + "/metrics", {
            "kind": kind, "groupId": group["groupId"], "value": group["value"],
            "rowSelection": "/rows/*/commonIncluded and matching original group value"}
    need(kind == "PAIRWISE" and index < len(report["pairwise"]), "METRIC_SCOPE", "Select an original metric population")
    pair = report["pairwise"][index]
    need(candidate["id"] in (pair["left"], pair["right"]), "METRIC_CANDIDATE", "Pair does not include selected candidate")
    side = "leftMetrics" if pair["left"] == candidate["id"] else "rightMetrics"
    return pair[side], "/pairwise/" + str(index) + "/" + side, {
        "kind": kind, "left": pair["left"], "right": pair["right"],
        "identitiesPointer": "/pairwise/" + str(index) + "/identities"}


def _display(value, unavailable):
    if value is None:
        return None, text(unavailable, "undefined metric reason", 12000)
    if type(value) is int:
        integer(value, "metric integer")
        return str(value), ""
    need(isinstance(value, dict), "METRIC_VALUE", "Select an original numeric metric")
    if "value" in value:
        return _display(value["value"], value.get("unavailable") or unavailable)
    rendered = value.get("display")
    need(isinstance(rendered, str) and len(rendered) <= 1000 and DECIMAL.fullmatch(rendered),
         "METRIC_VALUE", "Original metric display is not accepted decimal text")
    return rendered, ""


def _metrics(selection, report, criteria, report_id):
    mappings = selection["metrics"]
    need(isinstance(mappings, list) and len(mappings) <= 10000,
         "METRIC_COUNT", "Too many explicit metric mappings")
    if report is None:
        need(not mappings, "METRIC_RESULT", "Failed/cancelled execution without a report has no metrics")
        return []
    candidates = [i for i, c in enumerate(report["candidates"]) if c["id"] == selection["studyCandidateId"]]
    need(len(candidates) == 1, "METRIC_CANDIDATE", "Selected study candidate is absent or repeated")
    out, seen = [], set()
    for mapping in mappings:
        fields(mapping, ("id", "criterionId", "label", "unit", "definition", "scope", "metric", "cohortRef"),
               "Metric mapping")
        ident(mapping["id"], "metric.id"); ident(mapping["criterionId"], "criterion.id")
        need(mapping["id"] not in seen, "METRIC_DUPLICATE", "Mapped metric IDs repeat")
        seen.add(mapping["id"])
        criterion = criteria.get(mapping["criterionId"])
        need(criterion is not None and criterion.get("kind") == "MEASURED",
             "METRIC_CRITERION", "Use an original measured criterion")
        text(mapping["label"], "metric.label", 500); text(mapping["unit"], "metric.unit", 160)
        text(mapping["definition"], "metric.definition", 11000); text(mapping["cohortRef"], "metric.cohortRef", 1000)
        need(not criterion.get("unit") or criterion["unit"] == mapping["unit"],
             "METRIC_UNIT", "Metric unit differs from the saved criterion")
        need(mapping["metric"] in METRICS, "METRIC_NAME", "Select a supported original metric field")
        record, pointer, scope = _metric_set(report, candidates[0], mapping["scope"])
        original = record.get(mapping["metric"])
        value, reason = _display(original, record.get("unavailable"))
        denominator = {"schema": "sf88.risk-study-denominator.v1",
                       "completeReportArtifactId": report_id, "reportSha256": report["sha256"],
                       "metricSetPointer": pointer, "metricField": mapping["metric"],
                       "metricOriginal": original, "population": scope,
                       "n": record["n"], "weight": record["weight"],
                       "populationComplete": report["populationComplete"],
                       "countsPointer": "/counts", "findingsPointer": "/findings",
                       "cohortDefinitionPointer": "/plan/cohort", "weighting": report["weighting"],
                       "weightMeaning": report.get("weightMeaning"), "costCap": report.get("costCap"),
                       "capApplied": report.get("costCap") is not None and mapping["scope"]["kind"] != "UNCAPPED_COMMON"}
        definition = mapping["definition"] + (
            " Imported scalar is the producer's labelled display, not a newly computed exact decimal. "
            "The complete original metric, including any exact numerator/denominator or squared quantity, "
            "is retained in denominator.metricOriginal and the unmodified report artifact.")
        out.append({"id": mapping["id"], "criterionId": mapping["criterionId"], "label": mapping["label"],
                    "value": value, "unit": mapping["unit"], "undefinedReason": reason,
                    "definition": definition, "denominator": denominator,
                    "cohortRef": mapping["cohortRef"], "artifactIds": [report_id]})
    return out


def prepare_import(selection, artifacts, read_blob):
    """Return {result, rawText, request}; no provider call or file mutation.

    Original artifact bytes are verified before either READY or TOO_LARGE.
    rawText/request are None on overflow; no original file or report is truncated.
    """
    # Freeze caller-owned metadata before any read callback can execute.
    _json_safe(selection, "selection")
    _json_safe(artifacts, "artifact inventory")
    selection = read_json(canonical(selection), "selection")
    artifacts = read_json(canonical(artifacts), "artifact inventory")
    fields(selection, ("schema", "request", "dossierId", "caseId", "caseVersionId",
                       "candidateVersionId", "studyCandidateId", "reportArtifactId",
                       "destinationArtifactId", "executionArtifactId", "sourceRefs", "metrics",
                       "candidateMappingRationale", "cohortId", "protocolId"), "Selection")
    need(selection["schema"] == SCHEMA, "SCHEMA", "Unsupported import selection")
    request = fields(selection["request"], ("requestId", "expectedRevision", "actor"), "Original request")
    ident(request["requestId"], "requestId"); integer(request["expectedRevision"], "expectedRevision", 1)
    actor = fields(request["actor"], ("id", "name"), "Actor")
    ident(actor["id"], "actor.id"); text(actor["name"], "actor.name", 200)
    for key in ("dossierId", "caseId", "caseVersionId", "candidateVersionId", "studyCandidateId",
                "destinationArtifactId", "executionArtifactId", "cohortId", "protocolId"):
        ident(selection[key], key)
    text(selection["candidateMappingRationale"], "candidate mapping rationale", 12000)
    files, total = inventory(artifacts, read_blob)
    for key in ("destinationArtifactId", "executionArtifactId"):
        need(selection[key] in files, "ARTIFACT_SELECTION", key + " is not retained")
    destination = read_json(original_bytes(files[selection["destinationArtifactId"]], read_blob), "destination report")
    case, candidate, criteria = _destination(selection, destination)
    execution = read_json(original_bytes(files[selection["executionArtifactId"]], read_blob), "execution receipt")
    fields(execution, ("schema", "externalRunId", "kind", "status", "startedAt", "finishedAt",
                       "elapsedMs", "engine", "inputArtifactIds", "outputArtifactIds",
                       "limitations"), "Original execution")
    need(execution["schema"] == EXECUTION_SCHEMA, "EXECUTION", "Use the original producer execution receipt")
    ident(execution["externalRunId"], "externalRunId")
    need(execution["kind"] in ("SOURCE_NATIVE", "IMPORTED_MEASUREMENT", "TRAINING_FIXTURE"),
         "EXECUTION_KIND", "Select the actual original execution kind")
    need(execution["status"] in ("SUCCEEDED", "FAILED", "CANCELLED"), "EXECUTION_STATUS", "Unsupported original status")
    need(timestamp(execution["finishedAt"]) >= timestamp(execution["startedAt"]),
         "EXECUTION_TIME", "The actual finish precedes the actual start")
    duration = execution["elapsedMs"]
    need(duration is None or type(duration) in (int, float) and math.isfinite(duration) and duration >= 0,
         "EXECUTION_DURATION", "Retain the actual finite duration or null")
    engine = fields(execution["engine"], ("name", "version", "command", "runtime", "configuration"), "Engine")
    text(engine["name"], "engine.name", 500); text(engine["version"], "engine.version", 500)
    need(isinstance(engine["command"], list) and len(engine["command"]) <= 1000 and
         all(isinstance(x, str) and utf16_units(x) <= 20000 for x in engine["command"]),
         "ENGINE_COMMAND", "Retain the actual executed command")
    metadata_limits = []
    for field in ("runtime", "configuration"):
        if not _metadata(engine[field], "engine." + field):
            metadata_limits.append("engine." + field)
    for field in ("inputArtifactIds", "outputArtifactIds"):
        values = execution[field]
        need(isinstance(values, list) and len(values) <= 1000 and len(set(values)) == len(values)
             and all(x in files for x in values), "EXECUTION_FILES", "Retain every original " + field)
    limitations = execution["limitations"]
    need(isinstance(limitations, list) and len(limitations) <= 990 and
         all(isinstance(x, str) and utf16_units(x) <= 12000 for x in limitations),
         "LIMITATIONS", "Retain bounded original limitations")
    report_id = selection["reportArtifactId"]
    report = None
    if report_id is not None:
        ident(report_id, "report artifact")
        need(report_id in files and report_id in execution["outputArtifactIds"],
             "REPORT_OUTPUT", "The complete report must be an actual retained producer output")
        report = read_json(original_bytes(files[report_id], read_blob), "evaluation report")
        need(isinstance(report, dict) and report.get("schema") == "commons.risk-study-evaluation.v1",
             "REPORT_SCHEMA", "Unsupported original evaluation report")
        need(sha(canonical({k: v for k, v in report.items() if k != "sha256"})) == report.get("sha256"),
             "REPORT_HASH", "Original report content differs from its producer digest")
        validate_plan(report["plan"])
        need(sha(canonical(report["plan"])) == report["planSha256"] and report["plan"]["id"] == report["studyId"],
             "PLAN_HASH", "Complete original plan identity changed")
        _select(report["plan"]["candidates"], "id", selection["studyCandidateId"], "original study candidate")
        for original in report["inputs"]:
            matches = [f for f in files.values() if f["sha256"] == original["sha256"] and f["bytes"] == original["bytes"]]
            need(matches and any(f["id"] in execution["inputArtifactIds"] for f in matches),
                 "INCOMPLETE_INPUTS", "Every evaluated original input must remain a declared execution input artifact")
    need(execution["status"] != "SUCCEEDED" or report is not None,
         "REPORT_REQUIRED", "A successful evaluator execution requires its complete report")
    refs, covered = _source_refs(selection, destination, case, files)
    need(set(execution["inputArtifactIds"]) <= covered, "SOURCE_MAPPING",
         "Bind every execution input to its actual retained dossier source edition")
    metrics = _metrics(selection, report, criteria, report_id)
    for metric in metrics:
        if not _metadata(metric["denominator"], "metric.denominator"):
            metadata_limits.append("metric:" + metric["id"] + ".denominator")
    definition = {"schema": SCHEMA, "studyId": report["studyId"] if report else None,
                  "planSha256": report["planSha256"] if report else None,
                  "studyCandidateId": selection["studyCandidateId"],
                  "destination": {"dossierId": selection["dossierId"], "caseId": selection["caseId"],
                                  "caseVersionId": selection["caseVersionId"],
                                  "candidateVersionId": selection["candidateVersionId"],
                                  "destinationArtifactId": selection["destinationArtifactId"]},
                  "candidateMappingRationale": selection["candidateMappingRationale"],
                  "completeReportArtifactId": report_id,
                  "executionArtifactId": selection["executionArtifactId"],
                  "sourceArtifactMappings": selection["sourceRefs"]}
    if not _metadata(definition, "input.definition"):
        metadata_limits.append("input.definition")
    full_result = {"schema": "sf88.risk-study-producer-result.v1", "evaluation": report,
                   "execution": execution, "selection": selection,
                   "originalDestinationCase": case, "originalDestinationCandidate": candidate,
                   "completeOriginalInventory": artifacts}
    _json_safe(full_result, "complete producer result")
    native_result_bound = _native_json_bytes_bound(full_result)
    if native_result_bound > MAX_RUN:
        metadata_limits.append("result")
    run = {"schema": RUN_SCHEMA, "externalRunId": execution["externalRunId"], "kind": execution["kind"],
           "status": execution["status"], "startedAt": execution["startedAt"], "finishedAt": execution["finishedAt"],
           "elapsedMs": duration, "engine": engine,
           "input": {"cohortId": selection["cohortId"], "protocolId": selection["protocolId"],
                     "definition": definition, "sourceRefs": refs, "artifactIds": execution["inputArtifactIds"]},
           "metrics": metrics,
           "artifacts": [{**f, "bodyBase64": _OriginalBase64(f)} for f in artifacts],
           "result": full_result,
           "limitations": limitations + [
               "This adapter preserves existing producer output; it does not invoke, fit, rank or substitute a risk model.",
               "The selected original dossier owns case/candidate/source correspondence; receipt of this prepared file does not prove a dossier import.",
               "Metric scalar strings preserve the producer display. Exact original quantities, cohort definitions, all findings and all files remain retained."]}
    measured = _json_length(run)
    request_value = {**request, "action": "run.import",
                     "payload": {key: selection[key] for key in ("caseId", "caseVersionId", "candidateVersionId")}}
    request_value["payload"]["rawText"] = ""
    measured_request = len(canonical(request_value)) + _escaped_json_length(run)
    too_large = (measured > MAX_RUN or measured_request > MAX_REQUEST or
                 any(f["bytes"] > MAX_RUN for f in artifacts) or total > MAX_RUN or bool(metadata_limits))
    result = {"schema": RESULT_SCHEMA, "status": "COMPLETE_OUTPUT_TOO_LARGE" if too_large else "READY",
              "dossierId": selection["dossierId"], "caseId": selection["caseId"],
              "caseVersionId": selection["caseVersionId"], "candidateVersionId": selection["candidateVersionId"],
              "requestId": request["requestId"], "externalRunId": execution["externalRunId"],
              "selectionSha256": sha(canonical(selection)), "inventorySha256": sha(canonical(artifacts)),
              "completeOriginalBytes": total, "completeOriginalFiles": artifacts,
              "encodedRunBytes": measured, "maximumRunBytes": MAX_RUN,
              "encodedRequestBytes": measured_request, "maximumRequestBytes": MAX_REQUEST,
              "oversizedMetadata": metadata_limits, "metricCount": len(metrics),
              "nativeResultBytesUpperBound": native_result_bound,
              "maximumNativeResultBytes": MAX_RUN,
              "nativeJsonCapacityRule": "JSON.stringify(value,null,2) UTF-8 plus newline; finite floats reserve 32 bytes",
              "providerInvoked": False, "modelInvoked": False, "filesTruncated": False}
    if too_large:
        result["meaning"] = "All original files verified and retained by the caller; no partial run.import was prepared."
        return {"result": result, "rawText": None, "request": None}
    raw = b"".join(_json_chunks(run, read_blob))
    need(len(raw) == measured and len(raw) <= MAX_RUN, "ENCODING", "Measured complete UTF-8 run changed")
    result["rawSha256"] = sha(raw)
    request_value["payload"]["rawText"] = raw.decode("utf-8")
    need(len(canonical(request_value)) == measured_request and measured_request <= MAX_REQUEST,
         "REQUEST_ENCODING", "Measured complete HTTP request changed")
    return {"result": result, "rawText": raw.decode("utf-8"), "request": request_value}


def publish_import(directory, selection, artifacts, read_blob):
    """Preserve complete source/output plus optional import using original immutable writer."""
    _json_safe(selection, "selection")
    _json_safe(artifacts, "artifact inventory")
    selection = read_json(canonical(selection), "selection")
    artifacts = read_json(canonical(artifacts), "artifact inventory")
    prepared = prepare_import(selection, artifacts, read_blob)
    root = Path(directory)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Freeze operation identity first. A different selection cannot reuse this directory.
    retain_output(root / "selection.json", canonical(selection))
    retain_output(root / "artifacts.json", canonical(artifacts))
    for meta in artifacts:
        target = root / "originals" / path(meta["path"])
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        retain_output(target, original_bytes(meta, read_blob))
    if prepared["rawText"] is not None:
        retain_output(root / "run.json", prepared["rawText"].encode("utf-8"))
        retain_output(root / "request.json", canonical(prepared["request"]))
    result = {**prepared["result"], "originalsDirectory": str((root / "originals").resolve())}
    retain_output(root / "preparation.json", canonical(result))
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selection", required=True)
    parser.add_argument("--artifacts", required=True)
    parser.add_argument("--input-root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    selection = read_json(Path(args.selection).read_bytes(), "selection")
    artifacts = read_json(Path(args.artifacts).read_bytes(), "artifacts")
    root = Path(args.input_root).resolve(strict=True)
    lookup = {}
    for meta in artifacts:
        path(meta["path"])
        lookup.setdefault(meta["sha256"], []).append(meta)
    def read_blob(digest):
        need(digest in lookup, "ORIGINAL_MISSING", "Original artifact is absent")
        meta = lookup[digest][0]
        selected = (root / meta["path"]).resolve(strict=True)
        need(selected.is_relative_to(root) and selected.is_file(), "ORIGINAL_PATH", "Artifact escapes original input directory")
        need(selected.stat().st_size <= MAX_FILE, "ORIGINAL_CAPACITY", "Original file exceeds capacity")
        return selected.read_bytes()
    result = publish_import(args.output, selection, artifacts, read_blob)
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
