"""Original Material Catalog source, customer preparation and complete handover.
The catalogue engine and SF49 preparer are reused unchanged. All case writes
remain in Operations.command; all Installation writes remain in its editor.
"""
from __future__ import annotations
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import zipfile
from copy import deepcopy
from model import Problem, canonical, digest
import operations_installations as installations
import operations_workshare_installations as workshares

ROUTE = re.compile(r"^/api/operations/(operation-[a-f0-9]{32})/material-catalog/(inspect|rows|member|compare|template|prepare|handover)$")
MAX_OUTPUT = 512 * 1024 * 1024
MAX_HANDOVER = 512 * 1024 * 1024
SOURCE_ID = re.compile(r"source-[a-f0-9]{32}")
FIELDS = {"expectedVersion", "sourceId", "expectedSourceSha256", "originalSourceId",
          "table", "offset", "limit", "beforeEditionId", "afterEditionId",
          "document", "installationId", "expectedRevision", "expectedInstallationSha256", "previousSourceId", "expectedPreviousSourceSha256", "followingReview", "operationId", "selection", "bindings", "expectedPreparationSha256"}
BASE = {"expectedVersion", "sourceId", "expectedSourceSha256"}
SCHEMA = "stellar-forge.material-source-desk-result.v1"


def fail(message, code="MATERIAL_CATALOGUE_INPUT", status=422):
    raise Problem(message, status, code)


def _engine(payload, *, with_identity=False):
    # Temporary output files bound the parent allocation while the original Node
    # reader runs. The subprocess is waited/closed before any case view returns.
    with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
        try:
            run = subprocess.run(
                [os.environ.get("GRANT_MATERIAL_NODE", "node"),
                 str(Path(__file__).with_name("operations_material_catalogue_engine.mjs"))],
                input=canonical(payload).encode("utf-8"), stdout=stdout, stderr=stderr,
                timeout=120, check=False)
        except FileNotFoundError as exc:
            raise Problem("Select the installed Node runtime for the original Material Catalog.", 503,
                          "MATERIAL_ENGINE_UNAVAILABLE") from exc
        except subprocess.TimeoutExpired as exc:
            raise Problem("The read-only material preparation did not finish. Its case is unchanged.", 504,
                          "MATERIAL_ENGINE_TIMEOUT") from exc
        if stdout.tell() > MAX_OUTPUT:
            fail("The original complete response exceeds the complete 512 MiB delivery bound.", status=413)
        stdout.seek(0)
        try:
            result = json.loads(stdout.read(MAX_OUTPUT + 1))
        except (ValueError, UnicodeDecodeError) as exc:
            raise Problem("The installed material reader returned no complete result.", 502,
                          "MATERIAL_ENGINE_RESPONSE") from exc
    if not isinstance(result, dict) or result.get("ok") is not True or run.returncode:
        error = result.get("error", {}) if isinstance(result, dict) else {}
        fail(str(error.get("message", "The original material reader rejected this edition.")))
    if not isinstance(result.get("result"), dict):
        fail("The original material reader returned no complete result.", status=502)
    if not isinstance(result.get("resultSha256"), str) or not re.fullmatch(r"[a-f0-9]{64}", result["resultSha256"]):
        fail("The original material engine returned no result identity.", status=502)
    return (result["result"], result["resultSha256"]) if with_identity else result["result"]


def _source(ops, case_id, source_id, expected_sha):
    if not isinstance(source_id, str) or not SOURCE_ID.fullmatch(source_id):
        fail("Select the original complete source in this case.")
    metadata, raw = ops.source(case_id, source_id)
    if metadata["sha256"] != expected_sha:
        fail("The selected source differs from the original reviewed edition.", "MATERIAL_SOURCE_CHANGED", 409)
    return metadata, raw


def _payload(ops, case_id, action, body, context, raw):
    payload = {"action": action, "sourceBase64": base64.b64encode(raw).decode("ascii")}
    for key in ("table", "originalSourceId", "offset", "limit", "beforeEditionId", "afterEditionId"):
        if key in body:
            payload[key] = deepcopy(body[key])
    if action in ("template", "prepare", "handover"):
        previous_installation = None
        if body.get("installationId") is not None:
            previous_installation = installations.get(ops, case_id, body["installationId"])
            if (previous_installation["revision"] != body.get("expectedRevision") or
                    previous_installation["sha256"] != body.get("expectedInstallationSha256")):
                fail("The selected saved Installation changed. Preserve the draft and reopen its actual current edition.", "MATERIAL_INSTALLATION_CHANGED", 409)
            document = deepcopy(previous_installation["preview"]["document"])
            if body.get("document") is not None and canonical(body["document"]) != canonical(document):
                fail("Use the exact current saved Installation; keep unsaved edits as a separate draft.", "MATERIAL_INSTALLATION_CHANGED", 409)
            previous_meta, previous_raw = _source(ops, case_id, body.get("previousSourceId"), body.get("expectedPreviousSourceSha256"))
            selected_meta, _ = _source(ops, case_id, body["sourceId"], body["expectedSourceSha256"])
            payload["following"] = {"schema": "stellar-forge.material-installation-following.v1.input",
                "installation": previous_installation, "previousSource": previous_meta, "source": selected_meta,
                "review": deepcopy(body.get("followingReview"))}
            payload["previousSourceBase64"] = base64.b64encode(previous_raw).decode("ascii")
        else:
            if any(body.get(k) is not None for k in ("expectedInstallationSha256", "previousSourceId", "expectedPreviousSourceSha256", "followingReview")):
                fail("Select the actual saved Installation before following-source inputs.")
            document = installations.normalized(context, body.get("document"))
        if not document.get("workshare"):
            fail("Receive the original complete commercial Workshare in the Installation editor first.")
        verified_workshare = workshares.verify_document(ops, context, document)
        workshare_row = verified_workshare['workshare']
        binding = document["workshare"]
        _, original = _source(ops, case_id, binding["sourceId"], binding["sourceSha256"])
        packet = None
        if binding.get("packetSourceId") is not None:
            _, packet = _source(ops, case_id, binding["packetSourceId"], binding["packetSha256"])
        excluded = {body["sourceId"], binding["sourceId"], binding.get("packetSourceId"),
                    body.get("previousSourceId") if previous_installation else None}
        selected_ids = set()
        def collect(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    if key == "sourceIds" or key.endswith("SourceIds"):
                        if isinstance(item, list):
                            selected_ids.update(ident for ident in item
                                                if isinstance(ident, str) and SOURCE_ID.fullmatch(ident))
                    elif key == "sourceId" or key.endswith("SourceId"):
                        if isinstance(item, str) and SOURCE_ID.fullmatch(item):
                            selected_ids.add(item)
                    if isinstance(item, (dict, list)):
                        collect(item)
            elif isinstance(value, list):
                for item in value:
                    collect(item)
        collect(document)
        collect(body.get("bindings"))
        collect(body.get("followingReview"))
        attachments = []
        for selected_id in sorted(selected_ids - excluded):
            descriptor, selected_bytes = ops.source(case_id, selected_id)
            if len(selected_bytes) > 64 * 1024 * 1024:
                fail("The complete selected additional source must remain within the original 64 MiB attachment bound: " + selected_id, status=413)
            attachments.append({"sourceId": selected_id, "filename": selected_id + ".bin",
                "purpose": "Selected original Installation source " + selected_id + ": " + descriptor["filename"],
                "bytes": len(selected_bytes), "sha256": descriptor["sha256"],
                "contentBase64": base64.b64encode(selected_bytes).decode("ascii")})
        payload["attachments"] = attachments
        payload.update(
            seed={"source": installations._source(context), "document": document,
                  "workshare": {"caseId": workshare_row["caseId"], "planSha256": workshare_row["planSha256"],
                      "commercial": deepcopy(workshare_row["plan"]["commercial"]), "hours": workshare_row["hours"],
                      "phaseCount": len(workshare_row["plan"]["phases"]), "resetPhaseIds": []},
                  "installationId": previous_installation["id"] if previous_installation else None,
                  "expectedRevision": previous_installation["revision"] if previous_installation else 0},
            caseValue=ops._read(case_id), operationId=body.get("operationId"),
            commissioningBase64=base64.b64encode(original).decode("ascii"),
            packetBase64=base64.b64encode(packet).decode("ascii") if packet is not None else None)
        if action in ("prepare", "handover"):
            if (not isinstance(body.get("selection"), dict) or
                    body["selection"].get("operationId") != body.get("operationId")):
                fail("Keep the same original operation in the reviewed material selection.")
            payload.update(selection=deepcopy(body.get("selection")), bindings=deepcopy(body.get("bindings")))
    return payload


def _zip(directory):
    directory = Path(directory)
    paths = sorted(directory.rglob("*"))
    files, total = [], 0
    for path in paths:
        info = path.lstat()
        if stat.S_ISLNK(info.st_mode) or not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
            fail("Preserve the complete original handover's regular-file closure.")
        if stat.S_ISREG(info.st_mode):
            total += info.st_size
            if total > MAX_HANDOVER or len(files) >= 1000:
                fail("The complete handover exceeds 512 MiB or 1,000 files.", status=413)
            files.append(path)
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in files:
            entry = zipfile.ZipInfo(path.relative_to(directory).as_posix(), (1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = (stat.S_IFREG | 0o600) << 16
            with path.open("rb") as incoming, archive.open(entry, "w") as outgoing:
                while data := incoming.read(262144):
                    outgoing.write(data)
            if output.tell() > MAX_HANDOVER:
                fail("The complete handover archive exceeds 512 MiB.", status=413)
    raw = output.getvalue()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if archive.testzip() is not None or len(archive.infolist()) != len(files):
            fail("The complete generated handover failed original-member readback.")
    return raw


def perform(ops, case_id, action, body):
    if (not isinstance(body, dict) or set(body) - FIELDS or not BASE <= set(body) or
            action not in ("inspect", "rows", "member", "compare", "template", "prepare", "handover")):
        fail("Use the complete declared material-source request.")
    with ops._snapshot():
        context = ops._context(case_id)
        installations._current(context, body.get("expectedVersion"))
        metadata, raw = _source(ops, case_id, body["sourceId"], body["expectedSourceSha256"])
        payload = _payload(ops, case_id, action, body, context, raw)
        if action == "handover":
            payload["action"] = "prepare"
        result, result_sha256 = _engine(payload, with_identity=True)
        if action in ("template", "prepare", "handover"):
            source_bindings = result.get("sourceBindings") if action == "template" else result.get("source", {}).get("sourceBindings")
            required_sources = {"source/customer-catalog.jsonl": metadata["id"]}
            required_sources.update({"attachments/" + row["filename"]: row["sourceId"]
                                     for row in payload.get("attachments", [])})
            for path, expected_id in required_sources.items():
                selected_original = next((row for row in (source_bindings or [])
                                          if row.get("path") == path), None)
                if not selected_original or selected_original.get("sourceId") != expected_id:
                    original_id = selected_original.get("sourceId") if selected_original else None
                    fail("This selected file has another original attachment chosen by the maintained preparer. Review source " +
                         str(original_id) + " against the selected " + expected_id +
                         " before preparing its recorded provenance.",
                         "MATERIAL_SOURCE_BINDING_CONFLICT", 409)
        view = {"schema": SCHEMA,
                "scope": {"caseId": case_id, "version": context["program"]["version"],
                          "planId": context["program"]["planId"]},
                "source": metadata, "result": result}
        if action in ("prepare", "handover"):
            view["nativePreview"] = installations.preview(ops, context, result["prepared"]["preview"])
            view["preparationSha256"] = digest(view)
        if action != "handover":
            return view
        if body.get("expectedPreparationSha256") != view["preparationSha256"]:
            fail("The original source, case, bindings or reviewed preparation changed.",
                 "MATERIAL_PREPARATION_CHANGED", 409)
        with tempfile.TemporaryDirectory(prefix="sf47-material-handover-") as directory:
            os.chmod(directory, 0o700)
            payload.update(action="handover", expectedPreparedSha256=result_sha256, outputRoot=str(Path(directory).resolve()))
            receipt = _engine(payload)
            expected = Path(directory) / "handover"
            if receipt.get("directory") != str(expected) or receipt.get("independentReopen", {}).get("complete") is not True:
                fail("The original full handover did not complete its independent reopening.")
            archive = _zip(expected)
        return {"archive": archive, "filename": "Material_Catalog_Complete_Handover.zip",
                "sha256": hashlib.sha256(archive).hexdigest(), "bytes": len(archive),
                "preparationSha256": view["preparationSha256"], "receipt": receipt["receipt"],
                "independentReopen": receipt["independentReopen"]}


def register_static(static):
    for name, media in {
        "operations_material_catalogue.mjs": "text/javascript; charset=utf-8",
        "operations_material_following.mjs": "text/javascript; charset=utf-8",
        "operations_material_following_model.mjs": "text/javascript; charset=utf-8",
        "operations_material_catalogue_model.mjs": "text/javascript; charset=utf-8",
        "operations_material_catalogue.css": "text/css; charset=utf-8",
        "MATERIAL_CATALOGUE_SOURCE_DESK.md": "text/markdown; charset=utf-8",
        "MATERIAL_CATALOGUE_OPERATOR.md": "text/markdown; charset=utf-8",
        "MATERIAL_INSTALLATION_FOLLOWING.md": "text/markdown; charset=utf-8",
    }.items():
        static["/" + name] = (name, media)


def handle(handler, parsed, ops, method):
    match = ROUTE.fullmatch(parsed.path)
    if not match:
        return False
    if method != "POST":
        raise Problem("Use the complete original read-only source request.", 405, "METHOD_NOT_ALLOWED")
    result = perform(ops, match[1], match[2], handler.json_body())
    if match[2] == "handover":
        handler.send(200, result["archive"], "application/zip", result["filename"],
                     headers={"X-Material-Package-Sha256": result["sha256"],
                              "X-Material-Preparation-Sha256": result["preparationSha256"]})
    else:
        handler.send(200, result)
    return True
