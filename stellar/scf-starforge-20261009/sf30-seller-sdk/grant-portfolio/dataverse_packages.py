"""Original native solution ZIP export, asynchronous import and target settings.

A solution ZIP is accepted only as complete provider-returned bytes or an
explicitly supplied original package. Reading a package never imports it.
"""
from __future__ import annotations

import base64
from decimal import Decimal
import hashlib
import io
import re
import stat
import uuid
import zipfile
from pathlib import PurePosixPath
from dataverse_contract import (
    MAX_JSON, NS, DataverseError, require, clone, identity, sha256, guid,
    binary, pack, parse_json, json_bytes, xml, Csdl, target_identity,
    validate_snapshot, resource_rows, exact_keys, identifier,
)
from dataverse_solution import (
    filter_query, literal, validate_settings, _comparison,
)
from dataverse_client import NativeResultUnknown, request_key
from dataverse_runtime import NativeWorkflow, exchange_ref, resource_ref, lookup_property, _component

PACKAGE_SCHEMA = "tjlabs.pmrs.dataverse-native-solution/v1"
IMPORT_SCHEMA = "tjlabs.pmrs.dataverse-native-import/v1"
MAX_NATIVE_ZIP = 40 * 1024 * 1024
MAX_EXPANDED_ZIP = 1024 * 1024 * 1024
JOB_NAMESPACE = uuid.UUID("fe4e12e6-4f2f-408f-9aba-931df5161c52")

def local_name(node):
    return node.tag.rsplit("}", 1)[-1]

def child(node, name, required=True):
    found = [n for n in list(node) if local_name(n).casefold() == name.casefold()]
    require(len(found) <= 1 and (found or not required), "SOLUTION_XML",
            "The original solution manifest must identify one " + name + ".")
    return found[0] if found else None

def child_text(node, name, required=True):
    found = child(node, name, required)
    if found is None:
        return None
    require(not list(found), "SOLUTION_XML", "The native solution identity field must contain plain text.", field=name)
    value = found.text or ""
    require(value.strip() == value and (value or not required), "SOLUTION_XML",
            "Retain the complete original solution identity text.", field=name)
    return value

def inspect_solution(raw):
    require(isinstance(raw, bytes) and 0 < len(raw) <= MAX_NATIVE_ZIP, "SOLUTION_ZIP_SIZE",
            "The complete native ZIP exceeds this receiving profile's 40 MiB bound.")
    members, names, expanded = {}, set(), 0
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            require(len(archive.infolist()) <= 100000, "SOLUTION_ZIP_MEMBERS", "The native solution archive has too many entries.")
            for item in archive.infolist():
                name = item.filename
                simple = name[:-1] if item.is_dir() else name
                parts = simple.split("/")
                require(simple and not simple.startswith("/") and "\\" not in simple
                        and all(x not in ("", ".", "..") for x in parts)
                        and not any(ord(x) < 32 for x in simple), "SOLUTION_ZIP_PATH",
                        "The native ZIP contains an unsafe member.")
                require(name not in names and not item.flag_bits & 1
                        and not stat.S_ISLNK(item.external_attr >> 16), "SOLUTION_ZIP_MEMBER",
                        "The native ZIP contains a repeated, linked or encrypted entry.")
                names.add(name)
                expanded += item.file_size
                require(expanded <= MAX_EXPANDED_ZIP, "SOLUTION_ZIP_EXPANSION", "The complete native solution exceeds the expanded bound.")
                if item.is_dir():
                    require(item.file_size == 0, "SOLUTION_ZIP_DIRECTORY", "A native directory member contains bytes.")
                    continue
                hasher, size = hashlib.sha256(), 0
                with archive.open(item) as stream:
                    while block := stream.read(131072):
                        size += len(block)
                        hasher.update(block)
                require(size == item.file_size, "SOLUTION_ZIP_TRUNCATED", "A complete native solution member is truncated.")
                members[name] = {"bytes": size, "sha256": hasher.hexdigest()}
            candidates = [name for name in members if name.casefold() == "solution.xml"]
            require(len(candidates) == 1, "SOLUTION_MANIFEST", "The original native package must contain one solution.xml.")
            source = archive.read(candidates[0])
            document = xml(source)
            manifests = [x for x in document.iter() if local_name(x).casefold() == "solutionmanifest"]
            require(len(manifests) == 1, "SOLUTION_MANIFEST", "The native ZIP must contain one complete SolutionManifest.")
            original = manifests[0]
            unique_name, version = child_text(original, "UniqueName"), child_text(original, "Version")
            identifier(unique_name, "unique")
            require(re.fullmatch(r"\d+\.\d+\.\d+\.\d+", version), "SOLUTION_VERSION", "The native package has no complete four-part version.")
            managed = child_text(original, "Managed")
            require(managed in ("0", "1"), "SOLUTION_MANAGED", "The native package must declare its original managed state.")
            publisher = child(original, "Publisher")
            publisher_name = child_text(publisher, "UniqueName")
            prefix = child_text(publisher, "CustomizationPrefix")
            require(any(n.casefold() == "customizations.xml" for n in members), "SOLUTION_CUSTOMIZATIONS",
                    "The original package omits its native customizations.")
    except (zipfile.BadZipFile, RuntimeError, EOFError) as error:
        raise DataverseError("SOLUTION_ZIP", "The native solution archive cannot be fully verified.") from error
    return {"schema": PACKAGE_SCHEMA + ".inspection", "bytes": len(raw), "sha256": sha256(raw),
            "solution": {"unique_name": unique_name, "version": version, "managed": managed == "1",
                         "publisher_unique_name": publisher_name, "customization_prefix": prefix},
            "manifest": {"path": candidates[0], **members[candidates[0]]},
            "members": members, "expanded_bytes": expanded, "complete": True}

def _workflow(client, snapshot, operation_id, observation_id):
    snapshot = validate_snapshot(snapshot)
    require(target_identity(client.profile) == target_identity(snapshot["profile"]), "TARGET_IDENTITY",
            "The actual native client belongs to another retained environment.")
    return NativeWorkflow(client, operation_id, observation_id,
                          csdl=Csdl(binary(snapshot["csdl"]["response"]["body"], "actual target CSDL")))

def export_solution(client, snapshot, operation_id, observation_id, *, solution_name, managed, created_at):
    identifier(solution_name, "unique")
    require(isinstance(managed, bool), "EXPORT_MANAGED", "Select the native managed export flag explicitly.")
    workflow = _workflow(client, snapshot, operation_id, observation_id)
    binding = {"operation_id": operation_id, "snapshot_id": snapshot["id"], "snapshot_sha256": identity(snapshot),
               "solution_name": solution_name, "managed": managed, "created_at": created_at}
    existing = workflow.result("native-export-complete")
    if existing is not None:
        require(existing["binding"] == binding, "EXPORT_IDENTITY", "The original native export input differs.")
        inspect_solution(binary(existing["archive"], "native export", MAX_NATIVE_ZIP))
        return existing
    workflow.retain("native-export-intent", binding)
    client.whoami(request_key(operation_id, "export-whoami", observation_id))
    before, rows = workflow.read("export-solution-before", filter_query("solutions", {"uniquename": solution_name}))
    require(len(rows) == 1, "EXPORT_SOLUTION_MISSING", "The actual source environment does not expose one selected solution.")
    source_solution = rows[0]
    payload = {"SolutionName": solution_name, "Managed": managed}
    workflow.csdl.operation("ExportSolution", payload)
    exchange, body = workflow.write("native-export", "POST", "ExportSolution", payload)
    require(isinstance(body, dict) and isinstance(body.get("ExportSolutionFile"), str),
            "EXPORT_RETURN", "The original native return omitted ExportSolutionFile.")
    try:
        raw = base64.b64decode(body["ExportSolutionFile"], validate=True)
    except (ValueError, TypeError) as error:
        raise DataverseError("EXPORT_RETURN", "The original native export is not complete base64.") from error
    require(base64.b64encode(raw).decode("ascii") == body["ExportSolutionFile"], "EXPORT_BASE64",
            "The original native export has a noncanonical binary representation.")
    inspected = inspect_solution(raw)
    require(inspected["solution"]["unique_name"] == solution_name and inspected["solution"]["managed"] is managed,
            "EXPORT_IDENTITY", "The native archive differs from the selected solution or managed flag.")
    # The returned ZIP supplies its own actual version. Preserve the before/
    # after bracket; a concurrent edit is not silently attributed to either read.
    after, later = workflow.read("export-solution-after", filter_query("solutions", {"uniquename": solution_name}))
    require(len(later) == 1, "EXPORT_SOURCE_BRACKET", "The source solution disappeared during export.")
    result = {"schema": PACKAGE_SCHEMA, "binding": binding, "state": "COMPLETE",
              "archive": pack(raw), "inspection": inspected, "native_return": exchange_ref(exchange),
              "source_before": {"source": resource_ref(before), "solution": source_solution},
              "source_after": {"source": resource_ref(after), "solution": later[0]},
              "source_bracket_equal": identity(source_solution) == identity(later[0]),
              "meaning": "The archive is the complete actual native ExportSolutionFile, with its own managed state/version."}
    return workflow.retain("native-export-complete", {"id": "native-solution-" + identity(result), **result})

def validate_import_options(value):
    exact_keys(value, ["overwrite_unmanaged_customizations", "publish_workflows", "review"],
               ["overwrite_unmanaged_customizations", "publish_workflows", "review"])
    require(isinstance(value["overwrite_unmanaged_customizations"], bool)
            and isinstance(value["publish_workflows"], bool), "IMPORT_OPTIONS", "Use explicit native import booleans.")
    review = value["review"]
    exact_keys(review, ["actor", "reason", "source_refs"], ["actor", "reason", "source_refs"])
    require(isinstance(review["actor"], str) and review["actor"].strip()
            and isinstance(review["reason"], str) and review["reason"].strip()
            and isinstance(review["source_refs"], list), "IMPORT_REVIEW", "Retain the actual target/import review.")
    return clone(value)

def import_job_meaning(row, solution_name):
    result = {"completed_on": row.get("completedon"), "progress": row.get("progress"),
              "solution_name": row.get("solutionname"), "xml_result": None, "xml_unique_name": None}
    data = row.get("data")
    if data:
        require(isinstance(data, str), "IMPORT_JOB_DATA", "The native import log must retain its original XML text.")
        root = xml(data)
        manifests = [n for n in root.iter() if local_name(n).casefold() == "solutionmanifest"]
        require(len(manifests) <= 1, "IMPORT_JOB_DATA", "The native import log repeats its solution manifest.")
        if manifests:
            manifest = manifests[0]
            result["xml_unique_name"] = child_text(manifest, "UniqueName", required=False)
            outcome = child(manifest, "result", required=False)
            if outcome is not None:
                result["xml_result"] = outcome.attrib.get("result")
                result["xml_result_attributes"] = dict(outcome.attrib)
        result["xml_sha256"] = sha256(data.encode("utf-8"))
    for name in (result["solution_name"], result["xml_unique_name"]):
        require(name is None or name == solution_name, "IMPORT_JOB_IDENTITY", "The original import job names another solution.")
    result["native_success"] = bool(result["completed_on"] and result["xml_result"] == "success"
                                    and result["xml_unique_name"] == solution_name)
    result["native_failure"] = bool(result["completed_on"] and result["xml_result"] not in (None, "success"))
    return result

def import_solution(client, snapshot, archive, operation_id, observation_id, *, options, created_at):
    """Submit once or observe the same original async job; this call never sleeps.

    PENDING retains complete native returns. A later original-operation resume
    supplies a new observation_id, while the import write and ImportJobId remain
    identical. Failed/unknown imports are never automatically resubmitted.
    """
    raw = binary(archive, "original native solution", MAX_NATIVE_ZIP)
    inspected, options = inspect_solution(raw), validate_import_options(options)
    workflow = _workflow(client, snapshot, operation_id, observation_id)
    solution = inspected["solution"]
    binding = {"operation_id": operation_id, "snapshot_id": snapshot["id"], "snapshot_sha256": identity(snapshot),
               "archive_sha256": inspected["sha256"], "archive_bytes": inspected["bytes"],
               "solution": solution, "options": options, "created_at": created_at}
    terminal = workflow.result("native-import-terminal")
    if terminal is not None:
        require(terminal["binding"] == binding, "IMPORT_IDENTITY", "The original native import selected another package.")
        return terminal
    workflow.retain("native-import-intent", binding)
    client.whoami(request_key(operation_id, "import-whoami", observation_id))
    target_query = filter_query("solutions", {"uniquename": solution["unique_name"]})
    original_entry = snapshot["resources"].get("component:solution")
    require(original_entry is not None and original_entry["path"] == target_query, "IMPORT_TARGET_SOURCE",
            "The selected original target capture must retain this exact solution identity.")
    original_rows = resource_rows(original_entry, snapshot["profile"], "component:solution")
    require(len(original_rows) <= 1, "IMPORT_TARGET_AMBIGUOUS", "The original target contains multiple selected solutions.")
    job_id = str(uuid.uuid5(JOB_NAMESPACE, identity({"binding": binding, "organization_id": client.profile["organization_id"]})))
    payload = {"OverwriteUnmanagedCustomizations": options["overwrite_unmanaged_customizations"],
               "PublishWorkflows": options["publish_workflows"], "CustomizationFile": archive["data_base64"],
               "ImportJobId": job_id, "ComponentParameters": []}
    workflow.csdl.operation("ImportSolutionAsync", payload)
    if not workflow.was_dispatched("native-import"):
        before, current = workflow.read("native-import-target-before", target_query)
        require(current == original_rows, "IMPORT_TARGET_CHANGED",
                "The actual target solution changed after its reviewed capture.", source=resource_ref(before))
        workflow.retain("native-import-before", {"source": resource_ref(before), "solutions": current})
    transport, returned = "UNKNOWN", None
    try:
        exchange, returned = workflow.write("native-import", "POST", "ImportSolutionAsync", payload)
        require(isinstance(returned, dict) and returned.get("AsyncOperationId") is not None
                and isinstance(returned.get("ImportJobKey"), str), "IMPORT_RETURN",
                "Retain the complete original asynchronous import return.")
        async_id = guid(returned["AsyncOperationId"])
        transport = "NATIVE_ASYNC_RETURN"
        request_source = exchange_ref(exchange)
    except NativeResultUnknown:
        async_id, request_source = None, None
    except DataverseError:
        retained = workflow.retained_request("native-import")
        if not retained or retained.get("exchange") is None:
            raise
        # A complete non-success or malformed async return is retained evidence.
        # Its client-selected ImportJobId can still be observed without a
        # second import. Do not invent the missing asynchronous identifier.
        exchange = retained["exchange"]
        request_source, async_id = exchange_ref(exchange), None
        transport = "NATIVE_RETURN_REQUIRES_RECONCILIATION"
        try:
            returned = parse_json(binary(exchange["response"]["body"], "native import return"))
        except DataverseError:
            returned = {"unparsed_body": clone(exchange["response"]["body"])}
    # ImportJobKey is retained verbatim. It is not treated as a GUID, a URL or
    # a replacement for the client-selected original ImportJobId.
    job_source, job_rows = workflow.read("native-import-job", "importjobs(" + job_id + ")")
    require(len(job_rows) <= 1, "IMPORT_JOB_AMBIGUOUS", "The native import job identifier is ambiguous.")
    job = job_rows[0] if job_rows else None
    if job is not None:
        require(guid(job.get("importjobid")) == job_id, "IMPORT_JOB_IDENTITY", "The target returned another import job.")
    async_source, async_row = None, None
    if async_id:
        async_source, async_rows = workflow.read("native-import-async", "asyncoperations(" + async_id + ")")
        require(len(async_rows) <= 1, "ASYNC_JOB_AMBIGUOUS", "The original asynchronous result is ambiguous.")
        async_row = async_rows[0] if async_rows else None
        if async_row is not None:
            require(guid(async_row.get("asyncoperationid")) == async_id, "ASYNC_JOB_IDENTITY", "The target returned another asynchronous operation.")
    meaning = import_job_meaning(job, solution["unique_name"]) if job else {"native_success": False, "native_failure": False}
    async_complete = bool(async_row and async_row.get("statecode") == 3)
    async_failed = bool(async_complete and async_row.get("statuscode") in (31, 32))
    failure = meaning["native_failure"] or async_failed
    success = bool(meaning["native_success"] and (async_id is None or
                   async_complete and async_row.get("statuscode") == 30))
    state = "FAILED" if failure else "COMPLETE" if success else "PENDING"
    result = {"schema": IMPORT_SCHEMA, "binding": binding, "state": state,
              "client_import_job_id": job_id, "transport": transport,
              "native_return": request_source, "native_response": returned,
              "job": job, "job_source": resource_ref(job_source), "job_meaning": meaning,
              "async_operation_id": async_id, "async_operation": async_row,
              "async_source": resource_ref(async_source) if async_source else None,
              "observation_id": observation_id,
              "meaning": "Original import status and exact native logs; observing an import never invokes source commands or repeats its write."}
    if state == "COMPLETE":
        after, current = workflow.read("native-import-target-after", target_query)
        require(len(current) == 1 and current[0].get("version") == solution["version"]
                and current[0].get("ismanaged") is solution["managed"], "IMPORT_SOLUTION_READBACK",
                "The native successful job has no matching solution version/managed-state readback.",
                original_import_job_id=job_id, source=resource_ref(after))
        result["target_solution"] = current[0]
        result["target_source"] = resource_ref(after)
        workflow.csdl.operation("RetrieveFormattedImportJobResults", {"ImportJobId": job_id}, function=True)
        formatted_exchange, formatted = workflow.get("import-formatted-log",
            "RetrieveFormattedImportJobResults(ImportJobId=" + job_id + ")", statuses=(200,))
        require(isinstance(formatted, dict) and isinstance(formatted.get("FormattedResults"), str),
                "IMPORT_FORMATTED_LOG", "The original completed job has no complete formatted result.")
        result["formatted_log"] = {"response": formatted, "source": exchange_ref(formatted_exchange)}
        if transport != "NATIVE_ASYNC_RETURN":
            workflow.journal.reconcile(workflow.write_id("native-import"),
                {"job": result["job_source"], "solution": result["target_source"]},
                {"original_import_job_id": job_id, "postcondition": "original job completed successfully"})
            result["transport"] = ("ORIGINAL_IMPORT_JOB_OBSERVED_TRANSPORT_UNKNOWN" if transport == "UNKNOWN"
                                   else "ORIGINAL_IMPORT_JOB_OBSERVED_AFTER_UNUSABLE_RETURN")
    result["id"] = "native-import-" + identity(result)
    workflow.retain("native-import-observation:" + observation_id, result)
    if state in ("COMPLETE", "FAILED"):
        return workflow.retain("native-import-terminal", result)
    return result

def _setting_update(workflow, key, entity_set, kind, current, desired, path, capability, query):
    stored = workflow.result(key + ":original")
    if stored is None:
        stored = workflow.retain(key + ":original", {"row": current, "desired": desired,
                                "entity_set": entity_set, "path": path, "query": query})
    require(stored["desired"] == desired and stored["entity_set"] == entity_set
            and stored["query"] == query, "SETTING_IDENTITY",
            "The original target setting selected different input.")
    original = stored["row"]
    path = stored["path"]
    native_key = workflow.csdl.key(entity_set)
    if original is None:
        reserved_id = str(uuid.uuid5(JOB_NAMESPACE, identity({"operation": workflow.operation_id, "setting": key})))
        body = {**clone(desired), native_key: reserved_id}
        disposition, method, route_path, headers = "CREATE", "POST", entity_set, {}
    elif _comparison(original, desired, workflow.csdl, entity_set):
        reserved_id, body = None, None
        disposition, method, route_path, headers = "REUSE", None, path, {}
    else:
        require(capability.get("IsOptimisticConcurrencyEnabled") is True and isinstance(original.get("@odata.etag"), str),
                "SETTING_CONCURRENCY", "The selected native setting requires actual ETag update support.")
        reserved_id, body = None, clone(desired)
        disposition, method, route_path, headers = "UPDATE", "PATCH", path, {"If-Match": original["@odata.etag"]}
    # Use the same component write/readback implementation, with an explicit
    # literal native selector. Configuration rows are not solution components.
    description = {"key": key, "kind": kind, "entity_set": entity_set, "id_field": native_key,
                   "definition": desired, "native_id": original.get(native_key) if original else None,
                   "reserved_id": reserved_id}
    selector = {"kind": kind, "match": query}
    op = {"key": key, "kind": "component", "component": key, "selector": selector, "body": body,
          "disposition": disposition, "method": method, "path": route_path, "headers": headers,
          "expected_original_sha256": identity(original) if original else None, "depends_on": []}
    return _component(workflow, op, description, {}, {})

def configure_target(client, snapshot, operation_id, observation_id, *, settings, solution_name, created_at):
    settings = validate_settings(settings)
    identifier(solution_name, "unique")
    workflow = _workflow(client, snapshot, operation_id, observation_id)
    binding = {"operation_id": operation_id, "snapshot_id": snapshot["id"], "snapshot_sha256": identity(snapshot),
               "settings_sha256": identity(settings), "solution_name": solution_name, "created_at": created_at}
    complete = workflow.result("configuration-complete")
    if complete is not None:
        require(complete["binding"] == binding, "SETTING_IDENTITY", "The completed target configuration input differs.")
        return complete
    workflow.retain("configuration-intent", binding)
    client.whoami(request_key(operation_id, "configuration-whoami", observation_id))
    _, solutions = workflow.read("configuration-solution", filter_query("solutions", {"uniquename": solution_name}))
    require(len(solutions) == 1, "CONFIGURATION_SOLUTION", "The target configuration requires its actually installed solution.")
    outputs = []
    for index, item in enumerate(settings["EnvironmentVariables"]):
        key = "environment:" + str(index)
        definitions, rows = workflow.read(key + ":definition", filter_query("environmentvariabledefinitions", {"schemaname": item["SchemaName"]}))
        require(len(rows) == 1, "ENVIRONMENT_DEFINITION", "The target does not expose one selected environment variable definition.",
                source=resource_ref(definitions))
        definition_id = guid(rows[0]["environmentvariabledefinitionid"])
        lookup = lookup_property(workflow.csdl, "environmentvariablevalues", "EnvironmentVariableDefinitionId")
        query = {lookup: {"$guid": definition_id}}
        source, values = workflow.read(key + ":values", filter_query("environmentvariablevalues", query))
        require("ismanaged" in workflow.csdl.properties(workflow.csdl.entity_set("environmentvariablevalues")),
                "ENVIRONMENT_LAYER", "The actual target must expose managed-state information for environment values.")
        unmanaged = [row for row in values if row.get("ismanaged") is False]
        require(len(unmanaged) <= 1, "ENVIRONMENT_VALUE_AMBIGUOUS",
                "Multiple unmanaged values require an explicit administrator correction; no layer was guessed.",
                source=resource_ref(source))
        current = unmanaged[0] if unmanaged else None
        actual_query = {**query, "ismanaged": False}
        desired = {"value": item["Value"], "EnvironmentVariableDefinitionId@odata.bind":
                   "/environmentvariabledefinitions(" + definition_id + ")"}
        cap_source, caps = workflow.read(key + ":capability",
            "EntityDefinitions(LogicalName='environmentvariablevalue')?$select=LogicalName,IsOptimisticConcurrencyEnabled")
        require(len(caps) == 1, "SETTING_CAPABILITY", "The target setting capability is absent.")
        path = "environmentvariablevalues(" + guid(current["environmentvariablevalueid"]) + ")" if current else "environmentvariablevalues"
        outputs.append(_setting_update(workflow, key, "environmentvariablevalues", "environmentvariablevalue",
                                       current, desired, path, caps[0], actual_query))
    for index, item in enumerate(settings["ConnectionReferences"]):
        key, query = "connection:" + str(index), {"connectionreferencelogicalname": item["LogicalName"]}
        source, rows = workflow.read(key + ":source", filter_query("connectionreferences", query))
        require(len(rows) == 1, "CONNECTION_REFERENCE", "The target must expose one original connection reference.",
                source=resource_ref(source))
        current = rows[0]
        desired = {"connectionid": item["ConnectionId"], "connectorid": item["ConnectorId"]}
        cap_source, caps = workflow.read(key + ":capability",
            "EntityDefinitions(LogicalName='connectionreference')?$select=LogicalName,IsOptimisticConcurrencyEnabled")
        require(len(caps) == 1, "SETTING_CAPABILITY", "The target connection capability is absent.")
        path = "connectionreferences(" + guid(current["connectionreferenceid"]) + ")"
        outputs.append(_setting_update(workflow, key, "connectionreferences", "connectionreference",
                                       current, desired, path, caps[0], query))
    result = {"schema": PACKAGE_SCHEMA + ".configuration", "binding": binding, "state": "COMPLETE", "settings": settings,
              "steps": outputs, "connection_owner_usability": "REQUIRES_NATIVE_CUSTOMER_UAT",
              "meaning": "Actual target values and connection references are read back. No user credential, connection usability or workflow activation is inferred."}
    return workflow.retain("configuration-complete", {"id": "configuration-" + identity(result), **result})
