"""Run the complete original GSA migration and exact candidate receiving flow.

This is the operation driver, kept with its full native outputs rather than added
to the product's test suite. It never publishes a catalog endpoint.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import platform
import subprocess
import sys
import uuid
from pathlib import Path

OPERATION = "DCAT-GSA-MIGRATION-20261012-390E"
EXPECTED = {
    "engine": "2b6979da9f9554427d772607790b6b29843b1a1190c263b3ebf2b4851e751a3d",
    "legacy": "2eb635ae55e1a42904d084fa97a5bfdff870cf1421695752619de462fa351f46",
    "current": "b933be0d3bdf9f076a7ac5e493f71c97c073c6e73dfe1737e332736f24bfc34c",
}


def sha(value):
    return hashlib.sha256(value).hexdigest()


def encoded(value):
    return base64.b64encode(value).decode("ascii")


def json_bytes(value):
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False,
                       allow_nan=False) + "\n").encode("utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine-root", required=True, type=Path)
    parser.add_argument("--legacy", required=True, type=Path)
    parser.add_argument("--current", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--runtime-profile", choices=("original", "portable-python312"),
                        default="original")
    args = parser.parse_args()
    engine = args.engine_root.resolve() / "dcat_migration.py"
    legacy, current = args.legacy.read_bytes(), args.current.read_bytes()
    for key, raw in (("engine", engine.read_bytes()), ("legacy", legacy), ("current", current)):
        if sha(raw) != EXPECTED[key]:
            raise ValueError("Original operation bytes changed: " + key)
    if args.runtime_profile == "original":
        if not ((3, 13) <= sys.version_info < (4, 0)):
            raise ValueError("Use the original Python3.13+ environment")
    elif not ((3, 12) <= sys.version_info < (3, 13)):
        raise ValueError("The selected portable-python312 profile requires actual Python3.12")
    args.output.mkdir(parents=True, exist_ok=False)
    artifacts = []

    def save(name, raw):
        target = args.output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        artifacts.append({"path": name, "bytes": len(raw), "sha256": sha(raw)})
        return target

    save("originals/legacy-data.json", legacy)
    save("originals/current-data.json", current)
    save("operation-driver.py", Path(__file__).read_bytes())
    phases = []
    process_failures = []

    def run(label, request):
        save(label + "/request.json", json_bytes(request))
        result = subprocess.run([sys.executable, "-B", str(engine),
                                 "--runtime-profile", args.runtime_profile],
                                input=json_bytes(request), stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, check=False)
        save(label + "/stdout.json", result.stdout)
        save(label + "/stderr.txt", result.stderr)
        try:
            report = json.loads(result.stdout)
        except (UnicodeDecodeError, ValueError) as error:
            report = {"schema": "native-process-error.v1",
                      "error": {"code": "INVALID_ENGINE_JSON", "message": str(error)}}
        if not isinstance(report, dict):
            report = {"schema": "native-process-error.v1",
                      "error": {"code": "INVALID_ENGINE_SHAPE", "message": "The engine result is not an object"}}
        operation_ok = result.returncode in (0, 2) and report.get("schema") == "migration-review.v1"
        phase = {"name": label, "exit_code": result.returncode, "schema": report.get("schema"),
                 "operation_ok": operation_ok}
        if not operation_ok:
            process_failures.append({"phase": label, "exit_code": result.returncode,
                                     "schema": report.get("schema"), "error": report.get("error")})
        if report.get("schema") == "migration-review.v1":
            phase.update(summary=report["summary"], can_receive=report["can_receive"],
                         review_sha256=report["review_sha256"],
                         validation={key: None if value is None else {
                             "valid": value["valid"], "state": value["state"],
                             "catalog_errors": len(value["errors"]),
                             "invalid_records": sum(not row["valid"] for row in value["records"]),
                         } for key, value in report["validation"].items()},
                         source_sha256=report["source"]["sha256"],
                         candidate_sha256=report["candidate"]["sha256"] if report["candidate"] else None)
            if report.get("candidate_base64"):
                raw = base64.b64decode(report["candidate_base64"], validate=True)
                if sha(raw) != report["candidate"]["sha256"]:
                    raise RuntimeError("Candidate byte digest differs from the report")
                save(label + "/candidate.json", raw)
            if (report.get("converter_output") or {}).get("base64"):
                save(label + "/original-converter-output.json",
                     base64.b64decode(report["converter_output"]["base64"], validate=True))
        else:
            phase["error"] = report.get("error")
        phases.append(phase)
        print(json.dumps({"operation": OPERATION, "phase": phase}, ensure_ascii=False), flush=True)
        return report

    native_equality = None
    try:
        legacy_request = {"source_base64": encoded(legacy), "source_profile": "1.1",
                          "comparison_base64": encoded(current), "comparison_profile": "3.0"}
        converted = run("01-legacy-migration", legacy_request)
        preserved = run("02-current-preservation",
                        {"source_base64": encoded(current), "source_profile": "3.0"})
        if preserved.get("schema") == "migration-review.v1":
            if base64.b64decode(preserved["candidate_base64"]) != current:
                raise RuntimeError("The declared3.0 preservation changed original bytes")
        if converted.get("schema") == "migration-review.v1" and converted.get("candidate_base64"):
            # Independently join the wrapper output to the unmodified original
            # conversion function on this actual flat legacy catalog.
            spec = importlib.util.spec_from_file_location("dcat_operation_engine", engine)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            runtime = module._OriginalRuntime(args.engine_root / "vendor" / "gsa-dcat-us",
                                              runtime_profile=args.runtime_profile)
            import contextlib
            import io
            messages = io.StringIO()
            with contextlib.redirect_stdout(messages), contextlib.redirect_stderr(messages):
                original_result = runtime.original.convert_dcat_catalog(json.loads(legacy))
            original_raw = json.dumps(original_result, indent=2, ensure_ascii=False).encode("utf-8")
            wrapper_raw = base64.b64decode(converted["candidate_base64"])
            native_equality = {"original_sha256": sha(original_raw), "wrapper_sha256": sha(wrapper_raw),
                               "equal": original_raw == wrapper_raw}
            save("01-legacy-migration/direct-original-output.json", original_raw)
            save("01-legacy-migration/direct-original-messages.txt", messages.getvalue().encode("utf-8"))
            if not native_equality["equal"]:
                raise RuntimeError("Wrapper differs from unchanged original conversion on this source")
            from jsonschema.exceptions import FormatError
            candidate = json.loads(wrapper_raw)
            by_target = {row["target_path"]: row for row in converted["conservation"]["mappings"]}
            proposals, mappings = [], []
            # Explicit internal proposal: valid UUID URNs only for series identities
            # that the actual original format checker rejects. Each remains mapped
            # to its exact source record. No replacement is written to GSA.
            for index, series in enumerate(candidate.get("datasetSeries", [])):
                identifier = series.get("@id")
                try:
                    runtime.format_checker.check(identifier, "iri")
                except FormatError as error:
                    target_path = "/datasetSeries/" + str(index)
                    old = by_target[target_path]
                    new_identifier = "urn:uuid:" + str(uuid.uuid5(
                        uuid.NAMESPACE_URL, "merchant-catalog-review:" + sha(legacy) + ":" + str(identifier)))
                    proposals.append({"target_path": target_path, "before": identifier, "after": new_identifier,
                                      "reason": "Actual original IRI format exception",
                                      "original_exception": {"type": type(error).__name__, "message": str(error)},
                                      "origin": "Internal operator-proposed candidate identifier"})
                    series["@id"] = new_identifier
                    mappings.append({"source_path": old["source_path"], "target_path": target_path,
                                     "source_identifier": old["source_identifier"],
                                     "target_identifier": new_identifier})
            corrected_bytes = json_bytes(candidate)
            save("03-reviewed-candidate/proposed-identifier-changes.json", json_bytes(proposals))
            save("03-reviewed-candidate/edited-input.json", corrected_bytes)
            save("03-reviewed-candidate/identity-mappings.json", json_bytes(mappings))
            corrected_request = {**legacy_request, "candidate_base64": encoded(corrected_bytes),
                                 "identity_mappings": mappings}
            corrected = run("03-reviewed-candidate", corrected_request)
            if corrected.get("schema") == "migration-review.v1":
                if corrected["conservation"]["matched_count"] != len(json.loads(legacy)["dataset"]):
                    raise RuntimeError("The reviewed candidate did not conserve every original member")
    except Exception as error:
        failure = {"phase": "operation", "type": type(error).__name__, "message": str(error)}
        process_failures.append(failure)
        save("operation-error.json", json_bytes(failure))
    manifest = {"schema": "native-catalog-operation.v1", "operation": OPERATION,
                "python": platform.python_version(), "platform": platform.platform(),
                "runtime_profile": args.runtime_profile,
                "original_engine_sha256": "5f6f94e6d270338fedced59deadd97cd3bc2725ab70993dc65588822cadc4fc7",
                "original_operation_packet_sha256":
                "c39685031da3c6fd04bd3d6010b5ba0ddf17248823808a9a72cceb6ef6b586d4",
                "engine_sha256": EXPECTED["engine"], "source_commit":
                "4996591483b52f4ccc0cb72c42e4ec3fe59a4b06",
                "phases": phases, "original_converter_equality": native_equality,
                "operation_ok": not process_failures, "process_failures": process_failures,
                "artifacts": artifacts}
    (args.output / "run-manifest.json").write_bytes(json_bytes(manifest))
    print(json.dumps({"operation": OPERATION, "output": str(args.output),
                      "manifest_sha256": sha(json_bytes(manifest)),
                      "phases": phases, "original_converter_equality": native_equality,
                      "operation_ok": not process_failures, "process_failures": process_failures},
                     ensure_ascii=False), flush=True)
    return 1 if process_failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
