"""Run authored arithmetic fixtures through the actual study evaluator.

All identities, sources and numbers in this module are ARITHMETIC FIXTURES.
They are not patient data, model performance, CMS outputs or research findings.
"""
from __future__ import annotations
import argparse
import copy
import json
from pathlib import Path
from decimal import localcontext, ROUND_UP, Inexact
from uuid import NAMESPACE_URL, uuid5
from .evaluation import canonical, evaluate, report_html, retain_output, sha, StudyError

def ident(name):
    return str(uuid5(NAMESPACE_URL, "commons:risk-study:arithmetic-fixture:v1:" + name))

def build(directory):
    root = Path(directory)
    root.mkdir(parents=True, exist_ok=True)
    bodies, files = {}, []
    def put(name, body, media="application/json"):
        raw = body.encode("utf-8") if isinstance(body, str) else canonical(body)
        desc = {"name": name, "bytes": len(raw), "sha256": sha(raw), "mediaType": media}
        retain_output(root / name, raw)
        bodies[desc["sha256"]] = raw
        files.append({**desc, "path": name})
        return desc
    cohort = put("ARITHMETIC_FIXTURE_cohort.csv",
        "person,period,eligible,group,weight\nP1,2026,yes,A,1\nP2,2026,yes,A,1\nP3,2026,yes,B,1\nP4,2026,yes,B,1\nP5,2026,no,B,1\n",
        "text/csv")
    outcomes = put("ARITHMETIC_FIXTURE_outcomes.json",
        [{"person": "P1", "period": "2026", "amount": "100"},
         {"person": "P2", "period": "2026", "amount": "200"},
         {"person": "P3", "period": "2026", "amount": "0"},
         {"person": "P4", "period": "2026", "amount": "300"}])
    a_rows = [{"person": "P" + str(i+1), "period": "2026", "prediction": str(v)}
              for i, v in enumerate([90, 210, 10, 290])]
    b_rows = [{"person": "P" + str(i+1), "period": "2026", "prediction": str(v)}
              for i, v in enumerate([100, 250, 0, 250])]
    a = put("ARITHMETIC_FIXTURE_A.json", a_rows)
    b = put("ARITHMETIC_FIXTURE_B.json", b_rows)
    engine = put("ARITHMETIC_FIXTURE_definition.json",
                 {"label": "AUTHORED ARITHMETIC FIXTURE; NO RISK MODEL",
                  "equations": "Fixed values exercise weighted error arithmetic and receiving.",
                  "patientData": False, "cmsEngineInvoked": False})
    receipt = put("ARITHMETIC_FIXTURE_values.json",
                  {"label": "AUTHORED ARITHMETIC VALUES", "actual": [100, 200, 0, 300],
                   "A": [90, 210, 10, 290], "B": [100, 250, 0, 250],
                   "notes": "No external model execution. Pure evaluator fixture only."})
    def table(desc, count, fmt="JSON", value=None):
        result = {"file": desc, "format": fmt, "keys": ["/person", "/period"],
                  "scope": {"description": "Complete authored arithmetic fixture",
                            "authority": "Fixture author; no customer or patient data",
                            "asOf": "2026-10-13", "complete": True, "expectedRows": count}}
        if fmt == "CSV":
            result["csv"] = {"delimiter": ",", "nullToken": None}
        else:
            result["rowsPointer"] = ""
        if value:
            result["value"] = value
        return result
    cohort_spec = table(cohort, 5, "CSV")
    cohort_spec.update({"cluster": "/person", "eligible": "/eligible",
                        "eligibilityValues": {"true": "yes", "false": "no"}, "weight": "/weight"})
    def candidate(label, desc):
        return {"id": ident(label), "label": "ARITHMETIC FIXTURE " + label,
                "family": "AUTHORED_ARITHMETIC", "version": "1", "modelYear": 2026,
                "market": "ARITHMETIC_FIXTURE", "timing": "PROSPECTIVE",
                "nativeRunReference": "Authored values only; no model engine was executed",
                "engineSource": engine, "nativeResult": receipt,
                "outputs": table(desc, 4, value="/prediction"), "outputKind": "COST",
                "costUnit": "USD_PER_MEMBER_PERIOD", "currency": "USD",
                "costBasis": "AUTHORED_ARITHMETIC_AMOUNTS", "scale": None}
    plan = {"schema": "commons.risk-study-plan.v1", "id": ident("study"),
            "title": "ARITHMETIC FIXTURE — paired evaluation receiving course",
            "research": {"question": "Do the evaluator's exact arithmetic, coverage and receiving paths preserve these authored numbers?",
                         "investigator": "ARITHMETIC FIXTURE AUTHOR", "population": "Five authored rows, four explicitly eligible",
                         "market": "ARITHMETIC_FIXTURE", "costBasis": "AUTHORED_ARITHMETIC_AMOUNTS",
                         "currency": "USD", "costUnit": "USD_PER_MEMBER_PERIOD", "timing": "PROSPECTIVE",
                         "inputWindow": {"start": "2025-01-01", "end": "2025-12-31"},
                         "outcomeWindow": {"start": "2026-01-01", "end": "2026-12-31"},
                         "timingRationale": "Authored future-period labels exercise window validation; no research extraction is claimed.",
                         "allowNegativeCosts": False,
                         "limitations": "All records and predictions are arithmetic fixtures, not CMS model outputs, patient observations or research findings."},
            "cohort": cohort_spec, "outcomes": table(outcomes, 4, value="/amount"),
            "weighting": "UNIT", "weightMeaning": "One weight per eligible authored person-period",
            "groups": [{"id": "authored-group", "label": "Authored group", "field": "/group"}],
            "candidates": [candidate("A", a), candidate("B", b)],
            "costCap": None, "bootstrap": {"replicates": 20, "seed": 1729, "confidence": "0.95"}}
    retain_output(root / "plan.json", canonical(plan))
    retain_output(root / "files.json", canonical(files))
    return root, plan, files, bodies, put, candidate, b_rows

def _fraction(metric):
    if metric is None:
        return None
    return int(metric["numerator"]), int(metric["denominator"])

def run(directory):
    root, plan, files, bodies, put, candidate, b_rows = build(directory)
    checks = []
    report = evaluate(plan, bodies.__getitem__)
    assert report["counts"]["commonValid"] == 4 and report["populationComplete"] is True
    assert report["counts"]["explicitlyExcluded"] == 1
    a, b = (c["commonCohort"] for c in report["candidates"])
    assert _fraction(a["mae"]) == (10, 1)
    assert _fraction(b["mae"]) == (25, 1)
    assert _fraction(a["rSquared"]["value"]) == (124, 125)
    assert _fraction(b["rSquared"]["value"]) == (9, 10)
    assert _fraction(a["predictiveRatio"]["value"]) == (1, 1)
    assert _fraction(b["predictiveRatio"]["value"]) == (1, 1)
    assert report["bootstrap"]["sameClusterDrawForEveryCandidate"] is True
    assert all(r["sampledClusters"] == 4 and r["sampledRows"] == 4 for r in report["bootstrap"]["repetitions"])
    checks.append({"case": "whole paired arithmetic", "common": 4, "A_MAE": "10",
                   "B_MAE": "25", "A_R2": "124/125", "B_R2": "9/10",
                   "actualRatio": "1", "status": "PASS"})
    # Same original bytes and plan produce the same entire result.
    received = json.loads(canonical(plan))
    assert canonical(evaluate(received, lambda digest: bytes(bodies[digest]))) == canonical(report)
    checks.append({"case": "full original plan/raw-file independent receiving", "status": "PASS"})
    # A caller's global Decimal display policy must not change the retained result.
    with localcontext() as altered:
        altered.prec = 3
        altered.rounding = ROUND_UP
        altered.traps[Inexact] = True
        assert canonical(evaluate(plan, bodies.__getitem__)) == canonical(report)
    checks.append({"case": "caller Decimal precision/rounding/Inexact trap cannot alter result bytes",
                   "status": "PASS"})
    retain_output(root / "report.json", canonical(report))
    retain_output(root / "report.html", report_html(report).encode("utf-8"))

    missing = put("ARITHMETIC_FIXTURE_missing.json", b_rows[:3])
    p = copy.deepcopy(plan)
    p["id"] = ident("missing-third")
    c = candidate("C-missing", missing)
    c["outputs"]["scope"]["expectedRows"] = 4
    p["candidates"].append(c)
    p["bootstrap"] = None
    partial = evaluate(p, bodies.__getitem__)
    assert partial["counts"]["commonValid"] == 3 and partial["populationComplete"] is False
    assert next(r for r in partial["pairwise"] if r["left"] == ident("A") and r["right"] == ident("B"))["n"] == 4
    assert any(f["code"] == "MISSING_PREDICTION" for f in partial["findings"])
    retain_output(root / "partial-report.json", canonical(partial))
    checks.append({"case": "partial third candidate retains all-model 3 and paired A/B 4",
                   "status": "PASS"})

    duplicate = put("ARITHMETIC_FIXTURE_duplicate.json", b_rows + [b_rows[0]])
    p = copy.deepcopy(plan)
    p["id"] = ident("duplicate")
    p["candidates"][1]["outputs"]["file"] = duplicate
    p["candidates"][1]["outputs"]["scope"]["expectedRows"] = 5
    p["bootstrap"] = None
    duplicate_result = evaluate(p, bodies.__getitem__)
    assert duplicate_result["counts"]["commonValid"] == 3
    assert any(f["code"] == "DUPLICATE_IDENTITY" for f in duplicate_result["findings"])
    checks.append({"case": "duplicate prediction remains a finding and never overwrites",
                   "status": "PASS"})

    p = copy.deepcopy(plan)
    p["candidates"][0]["costBasis"] = "DIFFERENT_PAID_OR_ALLOWED_BASIS"
    try:
        evaluate(p, bodies.__getitem__)
        raise AssertionError("Different monetary basis was admitted")
    except StudyError as exc:
        assert exc.code == "UNIT"
    checks.append({"case": "paid/allowed basis mismatch refused", "status": "PASS"})
    p = copy.deepcopy(plan)
    p["research"]["inputWindow"]["end"] = "2026-01-01"
    try:
        evaluate(p, bodies.__getitem__)
        raise AssertionError("Prospective temporal leakage was admitted")
    except StudyError as exc:
        assert exc.code == "TEMPORAL_LEAKAGE"
    checks.append({"case": "overlapping prospective predictor/outcome window refused", "status": "PASS"})
    # Actual JSON number tokens, including exponent spelling, and a >53-bit identity.
    numeric_cohort = put("ARITHMETIC_FIXTURE_numeric_cohort.json",
        '[{"person":9007199254740993,"eligible":true,"group":1.50,"weight":1.0},'
        '{"person":9007199254740994,"eligible":true,"group":1e2,"weight":1.0},'
        '{"person":9007199254740995,"eligible":true,"group":null,"weight":1.0}]')
    numeric_actual = put("ARITHMETIC_FIXTURE_numeric_actual.json",
        '[{"person":9007199254740993,"amount":1.50},'
        '{"person":9007199254740994,"amount":1e2},'
        '{"person":9007199254740995,"amount":0.25}]')
    numeric_predictions = put("ARITHMETIC_FIXTURE_numeric_predictions.json",
        '[{"person":9007199254740993,"prediction":1.25},'
        '{"person":9007199254740994,"prediction":1e2},'
        '{"person":9007199254740995,"prediction":0.50}]')
    p = copy.deepcopy(plan)
    p["id"] = ident("numeric-originals")
    p["bootstrap"] = None
    p["weighting"] = "COHORT_FIELD"
    p["weightMeaning"] = "Authored exact JSON numeric weights"
    p["cohort"] = {"file": numeric_cohort, "format": "JSON", "keys": ["/person"],
                   "rowsPointer": "", "scope": {"description": "Complete numeric arithmetic fixture",
                   "authority": "Arithmetic fixture author", "asOf": "2026-10-13",
                   "complete": True, "expectedRows": 3},
                   "cluster": "/person", "eligible": "/eligible",
                   "eligibilityValues": {"true": True, "false": False}, "weight": "/weight"}
    p["outcomes"] = {"file": numeric_actual, "format": "JSON", "keys": ["/person"],
                     "rowsPointer": "", "scope": dict(p["cohort"]["scope"]), "value": "/amount"}
    p["candidates"] = [copy.deepcopy(plan["candidates"][0])]
    p["candidates"][0]["outputs"] = {"file": numeric_predictions, "format": "JSON",
                                    "keys": ["/person"], "rowsPointer": "",
                                    "scope": dict(p["cohort"]["scope"]), "value": "/prediction"}
    numeric = evaluate(p, bodies.__getitem__)
    assert numeric["counts"]["commonValid"] == 3
    assert _fraction(numeric["candidates"][0]["commonCohort"]["mae"]) == (1, 6)
    assert numeric["rows"][0]["identity"] == [{"type": "integer", "value": "9007199254740993"}]
    assert numeric["rows"][0]["groups"]["authored-group"]["lexeme"] == "1.50"
    assert numeric["rows"][1]["groups"]["authored-group"]["lexeme"] == "1e2"
    assert _fraction(numeric["rows"][0]["actual"]) == (3, 2)
    retain_output(root / "numeric-originals-report.json", canonical(numeric))
    checks.append({"case": "original JSON decimal/exponent lexemes and >53-bit integer identity",
                   "MAE": "1/6", "integerIdentity": "9007199254740993", "status": "PASS"})

    # Two original patient clusters expose undefined variance/total replicates.
    # The same fixed seed and full requested draw plan remain in the evaluator.
    tiny_cohort = put("ARITHMETIC_FIXTURE_bootstrap_cohort.json",
        [{"person": "ZERO", "eligible": True}, {"person": "ONE", "eligible": True}])
    tiny_a = put("ARITHMETIC_FIXTURE_bootstrap_A.json",
        [{"person": "ZERO", "prediction": "0"}, {"person": "ONE", "prediction": "1"}])
    tiny_b = put("ARITHMETIC_FIXTURE_bootstrap_B.json",
        [{"person": "ZERO", "prediction": "1"}, {"person": "ONE", "prediction": "0"}])
    tiny_scope = {"description": "Complete two-patient arithmetic fixture",
                  "authority": "Arithmetic fixture author", "asOf": "2026-10-13",
                  "complete": True, "expectedRows": 2}
    def tiny_plan(label, amounts):
        actual = put("ARITHMETIC_FIXTURE_bootstrap_" + label + "_actual.json",
            [{"person": "ZERO", "amount": amounts[0]}, {"person": "ONE", "amount": amounts[1]}])
        selected = copy.deepcopy(plan)
        selected["id"] = ident("bootstrap-" + label)
        selected["groups"] = []
        selected["cohort"] = {"file": tiny_cohort, "format": "JSON", "keys": ["/person"],
                              "rowsPointer": "", "scope": dict(tiny_scope), "cluster": "/person",
                              "eligible": "/eligible", "eligibilityValues": {"true": True, "false": False}}
        selected["outcomes"] = {"file": actual, "format": "JSON", "keys": ["/person"],
                                "rowsPointer": "", "scope": dict(tiny_scope), "value": "/amount"}
        for cid, output in enumerate((tiny_a, tiny_b)):
            selected["candidates"][cid]["outputs"] = {
                "file": output, "format": "JSON", "keys": ["/person"], "rowsPointer": "",
                "scope": dict(tiny_scope), "value": "/prediction"}
        return selected
    conditional_plan = tiny_plan("zero-one", ["0", "1"])
    conditional = evaluate(conditional_plan, bodies.__getitem__)
    bootstrap = conditional["bootstrap"]
    assert bootstrap["status"] == "COMPLETE_WITH_UNDEFINED_REPLICATES"
    assert len(bootstrap["pairedIntervals"]) == 6 and len(bootstrap["repetitions"]) == 20
    r2 = next(row for row in bootstrap["pairedIntervals"] if row["metric"] == "rSquared")
    assert r2["status"] == "CONDITIONAL_ON_DEFINED_REPLICATES"
    assert 0 < r2["validReplicates"] < 20
    assert r2["validReplicates"] + r2["undefinedReplicates"] == 20
    assert sum(x["replicates"] for x in r2["undefinedReasons"]) == r2["undefinedReplicates"]
    assert r2["conditionalOnDefinedReplicates"] is True
    for draw in bootstrap["repetitions"]:
        frequencies = draw["clusterFrequencies"]
        assert sha(canonical(frequencies)) == draw["sampleSha256"]
        assert sum(count for _, count in frequencies) == 2
        assert draw["sampledRows"] == 2 and draw["distinctRows"] == len(frequencies)
        diff = draw["pairedDifferences"][0]
        assert (diff["metrics"]["rSquared"] is None) == (len(frequencies) == 1)
        if len(frequencies) == 1:
            assert len(diff["undefinedMetrics"]["rSquared"]) == 2
            assert all(x["reason"] == "ZERO_ACTUAL_VARIANCE"
                       for x in diff["undefinedMetrics"]["rSquared"])
    assert canonical(evaluate(conditional_plan, bodies.__getitem__)) == canonical(conditional)
    retain_output(root / "bootstrap-conditional-report.json", canonical(conditional))
    retain_output(root / "bootstrap-conditional-report.html", report_html(conditional).encode("utf-8"))
    checks.append({"case": "two patient clusters preserve undefined paired draws and exact frequency lists",
                   "validR2Replicates": r2["validReplicates"],
                   "undefinedR2Replicates": r2["undefinedReplicates"], "status": "PASS"})
    unavailable = evaluate(tiny_plan("all-zero", ["0", "0"]), bodies.__getitem__)
    for name in ("rSquared", "predictiveRatio", "normalizedMAE"):
        interval = next(row for row in unavailable["bootstrap"]["pairedIntervals"]
                        if row["metric"] == name)
        assert interval["status"] == "UNAVAILABLE"
        assert interval["validReplicates"] == 0 and interval["undefinedReplicates"] == 20
        assert interval["lower"] is None and interval["upper"] is None
        assert interval["unavailable"] == "NO_DEFINED_REPLICATES"
        assert sum(x["replicates"] for x in interval["undefinedReasons"]) == 20
    assert len(unavailable["bootstrap"]["pairedIntervals"]) == 6
    assert unavailable["candidates"][0]["commonCohort"]["rSquared"]["value"] is None
    retain_output(root / "bootstrap-unavailable-report.json", canonical(unavailable))
    checks.append({"case": "all-undefined paired metrics remain explicit unavailable intervals with all draws",
                   "requestedReplicates": 20, "status": "PASS"})

    summary = {"schema": "commons.risk-study-arithmetic-course.v1", "label": "ARITHMETIC FIXTURE",
               "engineInvoked": False, "cmsEngineInvoked": False,
               "studyId": plan["id"], "reportSha256": report["sha256"],
               "checks": checks, "status": "COMPLETE"}
    retain_output(root / "course-result.json", canonical(summary))
    # Following input editions are retained separately; the first base inventory stays exact.
    retain_output(root / "all-fixture-files.json", canonical(files))
    return summary

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True)
    args = parser.parse_args()
    print(json.dumps(run(args.directory), ensure_ascii=False))
