"""Native lifetime and original-source custody for the existing receiving course.

The original browser driver performs supplier mutations. This helper starts
only the original catalogue HTTP host and verifies its completed capture.
"""
from __future__ import annotations
import base64
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time
from urllib.request import ProxyHandler, Request, build_opener

PREFIX = Path("stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch")
SCHEMA = "stellar-forge.material-supplier-intake-receiving.v1"


class OriginalSupplierRuntime:
    def __init__(self, *, source, root, app, node, raw, write, identity, need):
        self.source, self.root, self.app, self.node = source, Path(root), Path(app), Path(node)
        self.raw, self.write, self.identity, self.need = raw, write, identity, need
        self.process = None
        self.stdout = self.stderr = None
        self.previous_configuration = os.environ.get("GRANT_MATERIAL_CATALOGUE_CONNECTIONS")
        self.listener = None
        self.captured = None
        self.files = {}
        self.input = None

    def _get(self, path, maximum=65536):
        self.need(self.listener is not None and path.startswith("/api/"), "Select the original native listener.")
        opener = build_opener(ProxyHandler({}))
        request = Request(self.listener["origin"] + path, headers={"Origin": self.listener["origin"]})
        with opener.open(request, timeout=30) as response:
            self.need(response.getcode() == 200, "The original native read did not complete.")
            body = response.read(maximum + 1)
            self.need(len(body) <= maximum, "The complete native read exceeds its declared bound.")
            return json.loads(body)

    def _copy(self, name, selected, maximum):
        original = Path(selected["path"]).expanduser()
        if not original.is_absolute():
            self.need(original.parts and all(part not in ("", ".", "..") for part in original.parts),
                      "Use an original source member confined to the selected application.")
            original = self.app / original
        original = original.absolute()
        data = self.raw(original, maximum)
        expected = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        self.need(expected == {key: selected[key] for key in ("bytes", "sha256")},
                  "The original supplier input changed: " + name)
        output = self.root / name
        self.write(output, data, True)
        self.files[name] = self.identity(output)
        return {**deepcopy(selected), "path": str(output)}

    def start(self):
        selected = deepcopy(self.source["supplierIntake"])
        self.need(isinstance(selected, dict), "Select the complete original supplier receiving input.")
        self.need(not any(key in selected for key in ("origin", "token", "workspaceId", "connectionSha256")),
                  "The receiver derives the actual listener identity; never supply browser credentials or origin.")
        self.need(isinstance(selected.get("connectionId"), str) and selected["connectionId"],
                  "Select an opaque receiving connection ID.")
        self.need(isinstance(selected.get("full"), dict) and isinstance(selected.get("update"), dict),
                  "Select both complete retained published input editions.")
        self.need(isinstance(selected.get("mapping"), dict) and isinstance(selected.get("updateMapping"), dict),
                  "Keep the original mapping and explicitly authored update mapping separately.")
        self.need(selected["update"].get("mode") in ("full", "delta"),
                  "Choose the source-backed update application mode explicitly.")
        for key in ("title", "tenantId"):
            self.need(isinstance(selected.get(key), str) and selected[key].strip(),
                      "Select the original " + key + ".")
        self.need(isinstance(selected.get("review"), dict) and
                  selected["review"].get("actor", self.source["actor"]) == self.source["actor"] and
                  isinstance(selected["review"].get("note"), str) and selected["review"]["note"].strip(),
                  "Retain the actual operator's scope and receiving review note.")
        selected["review"]["actor"] = self.source["actor"]
        selected["full"] = self._copy("Original_Supplier_Full.source", selected["full"], 16 * 1024 * 1024)
        selected["update"] = self._copy("Original_Supplier_Update.source", selected["update"], 16 * 1024 * 1024)
        self.write(self.root / "Original_Supplier_Mapping.json", selected["mapping"], True)
        self.write(self.root / "Reviewed_Supplier_Update_Mapping.json", selected["updateMapping"], True)
        for name in ("Original_Supplier_Mapping.json", "Reviewed_Supplier_Update_Mapping.json"):
            self.files[name] = self.identity(self.root / name)
        # This is the original generic source configuration. No OpenSearch query,
        # external endpoint, indexing, seller preparation or customer connector
        # is invoked by this catalogue-only receiving operation.
        configuration = self.app / PREFIX / "examples/source.json"
        configuration_bytes = self.raw(configuration, 262144)
        source_file = self.root / "Original_Catalogue_Source_Configuration.json"
        self.write(source_file, configuration_bytes, True)
        self.files[source_file.name] = self.identity(source_file)
        native_root = self.root / "original-catalogue-workspace"
        listener_file = self.root / "Original_Catalogue_Listener.json"
        owner_file = self.root / "Original_Catalogue_Lifetime.json"
        prior = json.loads(self.raw(listener_file, 65536)) if listener_file.exists() else None
        owner = json.loads(self.raw(owner_file, 65536)) if owner_file.exists() else None
        if owner and owner.get("closed") is not True:
            pid = owner.get("pid")
            self.need(type(pid) is int and pid > 0, "Inspect the retained original native lifetime.")
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                pass
            except PermissionError:
                self.need(False, "The original receiving host is still owned by another process.")
            else:
                self.need(False, "The retained original catalogue process is still active; preserve that same owner.")
        port = prior["port"] if prior else 0
        self.stdout = (self.root / "Original_Catalogue_Stdout.log").open("ab", buffering=0)
        self.stderr = (self.root / "Original_Catalogue_Stderr.log").open("ab", buffering=0)
        offset = self.stdout.tell()
        command = [str(self.node), str(self.app / PREFIX / "workspace/server.mjs"),
                   "--source", str(source_file), "--workspace", str(native_root), "--port", str(port)]
        self.process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=self.stdout,
                                        stderr=self.stderr, start_new_session=True, env=os.environ.copy())
        self.write(owner_file, {"schema": SCHEMA, "operationId": self.source["operationId"],
                               "pid": self.process.pid, "argv": command, "closed": False})
        deadline = time.monotonic() + 60
        ready = None
        while time.monotonic() < deadline:
            self.need(self.process.poll() is None, "The original catalogue host ended before readiness; retain its logs.")
            with (self.root / "Original_Catalogue_Stdout.log").open("rb") as stream:
                stream.seek(offset)
                line = stream.readline(65537)
            self.need(len(line) <= 65536, "The original listener receipt exceeds its bound.")
            if line.endswith(b"\n"):
                ready = json.loads(line)
                break
            time.sleep(0.1)
        self.need(isinstance(ready, dict), "The original catalogue host did not return a complete readiness receipt.")
        origin, workspace_id = ready.get("workspace"), ready.get("workspaceId")
        from urllib.parse import urlsplit
        parsed = urlsplit(origin)
        self.need(parsed.scheme == "http" and parsed.hostname == "127.0.0.1" and
                  parsed.port and not parsed.path and not parsed.query and not parsed.fragment and
                  not parsed.username and not parsed.password and isinstance(workspace_id, str),
                  "Receive the original loopback listener and complete native workspace identity.")
        self.listener = {"origin": origin, "port": parsed.port, "workspaceId": workspace_id}
        if prior:
            self.need(prior == self.listener, "The original catalogue listener or workspace changed.")
        self.write(listener_file, self.listener, True)
        session = self._get("/api/session")
        self.need(session.get("workspaceId") == workspace_id, "The listener changed before receiving.")
        config = {"schema": "stellar-forge.material-catalogue-connections.v1", "connections": [{
            "id": selected["connectionId"], "title": selected["title"],
            "origin": origin, "workspaceId": workspace_id, "caseIds": [self.source["caseId"]]}]}
        config_file = self.root / "Original_Catalogue_Connections.json"
        self.write(config_file, config, True)
        os.environ["GRANT_MATERIAL_CATALOGUE_CONNECTIONS"] = str(config_file)
        # Use the same backend loader that serves the browser; the receiver does
        # not invent another connection hash or public connection schema.
        import operations_material_supplier_intake as backend
        rows = backend.load_connections(self.source["caseId"])
        self.need(len(rows) == 1, "Keep this one original receiving connection.")
        row = rows[0]
        selected.update(workspaceId=row["workspaceId"],
                        connectionSha256=row["configurationSha256"])
        self.input = selected
        self.write(self.root / "Original_Supplier_Receiving_Input.json", selected, True)
        self.files["Original_Supplier_Receiving_Input.json"] = self.identity(self.root / "Original_Supplier_Receiving_Input.json")
        return selected

    def finish(self, browser, engine, template):
        result = browser.get("supplierIntake")
        self.need(isinstance(result, dict) and isinstance(result.get("nativeRequests"), list) and bool(result["nativeRequests"]),
                  "Receive the original full supplier intake before completing its Installation.")
        from operations_material_supplier_intake_cli import native_request_identity, same_json
        import re
        recorded = []
        for item in result["nativeRequests"]:
            self.need(isinstance(item, dict) and item.get("action") in ("upload", "save", "preview", "select")
                      and isinstance(item.get("body"), dict) and isinstance(item["body"].get("nativeRequest"), dict),
                      "Retain each complete original native mutation request.")
            request = item["body"]["nativeRequest"]
            request_id = request.get("requestId")
            self.need(isinstance(request_id, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,95}", request_id),
                      "Retain the exact original native request identity.")
            operation = self._get("/api/operations/" + request_id, 64 * 1024 * 1024)
            self.need(operation.get("state") == "COMPLETE" and
                      operation.get("kind") == "catalog-" + item["action"] and
                      same_json(operation.get("request"), native_request_identity(item["action"], request)),
                      "The original journal does not confirm this completed supplier request.")
            recorded.append(operation)
        self.need(len({row["id"] for row in recorded}) == len(recorded),
                  "Keep one retained entry per original native request.")
        uploads = [row["result"]["source"] for row in recorded if row["kind"] == "catalog-upload"]
        expected_uploads = {(row["bytes"], row["sha256"]) for row in (self.input["full"], self.input["update"])}
        self.need(expected_uploads <= {(row["bytes"], row["sha256"]) for row in uploads},
                  "The original native upload journal lost a selected supplier file.")
        selections = [row["result"] for row in recorded if row["kind"] == "catalog-select"]
        self.need(any(row["edition"]["id"] == result.get("fullEditionId") for row in selections) and
                  any(row["edition"]["id"] == result.get("updateEditionId") for row in selections),
                  "Both selected editions need their original completed selection operations.")
        previews = [row["result"]["edition"] for row in recorded if row["kind"] == "catalog-preview"]
        full_edition = next((row for row in previews if row["id"] == result["fullEditionId"]), None)
        update_edition = next((row for row in previews if row["id"] == result["updateEditionId"]), None)
        self.need(full_edition is not None and update_edition is not None and
                  full_edition["mode"] == "full" and full_edition["baseEditionId"] is None and
                  full_edition["source"]["sha256"] == self.input["full"]["sha256"] and
                  update_edition["mode"] == self.input["update"]["mode"] and
                  update_edition["baseEditionId"] == full_edition["id"] and
                  update_edition["source"]["sha256"] == self.input["update"]["sha256"],
                  "The preview journal differs from the original complete source/base/mode selections.")
        saves = [row for row in recorded if row["kind"] == "catalog-save"]
        for edition, mapping in ((full_edition, self.input["mapping"]),
                                 (update_edition, self.input["updateMapping"])):
            self.need(any(same_json(row["request"]["mapping"], mapping) and
                          row["result"]["catalog"]["mappingSha256"] == edition["mappingSha256"]
                          for row in saves), "The selected edition lost its original reviewed mapping.")
        self.write(self.root / "Original_Supplier_Native_Operations.json", recorded, True)
        self.files["Original_Supplier_Native_Operations.json"] = self.identity(self.root / "Original_Supplier_Native_Operations.json")
        captured = result.get("capture")
        self.need(isinstance(captured, dict), "Keep the original captured customer bundle receipt.")
        path = self.root / "Original_Material_Catalogue.jsonl"
        actual = self.identity(path)
        self.need(captured.get("path") == str(path) and captured.get("bytes") == actual["bytes"] and
                  captured.get("sha256") == actual["sha256"],
                  "The actual downloaded complete catalogue differs from its browser receipt.")
        raw = self.raw(path, 128 * 1024 * 1024)
        proof = engine({"action": "intake-custody", "sourceBase64": base64.b64encode(raw).decode("ascii")})
        self.need(proof["file"] == {"bytes": len(raw), "sha256": actual["sha256"]},
                  "The native reader rejected the original captured bytes.")
        header, catalog = proof["header"], proof["catalogue"]
        expected = captured.get("identity")
        final_selection = next((row for row in selections if row["edition"]["id"] == result["updateEditionId"]), None)
        self.need(final_selection is not None and final_selection["catalog"]["id"] == result.get("catalogId")
                  and final_selection["catalog"]["revision"] == result.get("catalogRevision"),
                  "The final exported catalogue differs from its exact completed selection.")
        identity = {"workspaceId": header.get("sourceWorkspaceId"), "catalogId": catalog.get("id"),
                    "revision": catalog.get("revision"), "activeEditionId": catalog.get("activeEditionId"),
                    "tenantId": catalog.get("tenantId"), "mappingSha256": catalog.get("mappingSha256")}
        self.need(identity == expected and identity["workspaceId"] == self.listener["workspaceId"]
                  and header.get("catalogId") == identity["catalogId"]
                  and header.get("catalogRevision") == identity["revision"]
                  and header.get("tenantId") == identity["tenantId"]
                  and identity["tenantId"] == self.input["tenantId"]
                  and identity["catalogId"] == result["catalogId"] and identity["revision"] == result["catalogRevision"]
                  and identity["mappingSha256"] == final_selection["catalog"]["mappingSha256"],
                  "The frozen export differs from the selected original workspace and catalogue.")
        inspection = engine({"action": "inspect", "sourceBase64": base64.b64encode(raw).decode("ascii")})
        editions = {row["id"] for row in inspection["editions"]}
        self.need(result.get("fullEditionId") in editions and result.get("updateEditionId") in editions
                  and result["fullEditionId"] != result["updateEditionId"]
                  and result["updateEditionId"] == identity["activeEditionId"],
                  "Keep both original saved editions and the selected final edition.")
        # Reopen the complete embedded original sources through the original
        # reader. Every retained supplier file must match its original bytes.
        expected_files = {(item["bytes"], item["sha256"]) for item in
                          (self.input["full"], self.input["update"])}
        retained_files = {(item["file"]["bytes"], item["file"]["sha256"]) for item in inspection["sources"]}
        self.need(expected_files <= retained_files, "The full customer bundle lost an original supplier file.")
        effective = result.get("effectiveSourceSelection")
        self.need(isinstance(effective, dict), "Receive the exact derived Source Desk selection.")
        allowed = {"sourceId", "sourceSha256", "handoverPath", "beforeEditionId", "afterEditionId", "selection", "bindings"}
        self.need(set(effective) == allowed and effective["sourceSha256"] == actual["sha256"]
                  and effective["beforeEditionId"] == result["fullEditionId"]
                  and effective["afterEditionId"] == result["updateEditionId"] and effective["handoverPath"] == str(path),
                  "The browser derived source selection differs from the original captured output.")
        original_template = template(effective["sourceId"], actual["sha256"])
        self.need(effective["selection"] == original_template["result"]["selection"] and
                  effective["bindings"] == original_template["result"]["bindings"],
                  "The derived source selection or bindings differs from the unchanged original document's native template.")
        self.need(effective["sourceId"] == browser["sourceId"], "The typed original attachment identity changed.")
        selected_source = {**deepcopy(self.source), **deepcopy(effective)}
        selected_source.pop("sourceFile", None)
        self.write(self.root / "Original_Native_Inspection.json", inspection, True)
        self.write(self.root / "Original_Supplier_Completed_Capture.json", result, True)
        self.write(self.root / "Derived_Material_Source_Selection.json", effective, True)
        for name in ("Original_Material_Catalogue.jsonl", "Original_Native_Inspection.json",
                     "Original_Supplier_Completed_Capture.json", "Derived_Material_Source_Selection.json"):
            self.files[name] = self.identity(self.root / name)
        self.captured = result
        return selected_source, raw

    def close(self):
        errors = []
        try:
            if self.process is not None:
                process = self.process
                if process.poll() is None:
                    try:
                        os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    try:
                        process.wait(timeout=30)
                    except subprocess.TimeoutExpired:
                        try:
                            os.killpg(process.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        process.wait()
                # Clear the owned handle only after the original child ended.
                # A failed signal/wait retains it for explicit cleanup recovery.
                self.process = None
                owner = {"schema": SCHEMA, "operationId": self.source["operationId"],
                         "pid": process.pid, "exitCode": process.returncode, "closed": True}
                self.write(self.root / "Original_Catalogue_Lifetime.json", owner)
        except BaseException as exc:
            errors.append(exc)
        finally:
            for name in ("stdout", "stderr"):
                stream = getattr(self, name)
                setattr(self, name, None)
                if stream is not None:
                    try:
                        stream.close()
                    except BaseException as exc:
                        errors.append(exc)
            try:
                if self.previous_configuration is None:
                    os.environ.pop("GRANT_MATERIAL_CATALOGUE_CONNECTIONS", None)
                else:
                    os.environ["GRANT_MATERIAL_CATALOGUE_CONNECTIONS"] = self.previous_configuration
            except BaseException as exc:
                errors.append(exc)
        if errors:
            for extra in errors[1:]:
                errors[0].add_note("Additional catalogue cleanup error: " + repr(extra))
            raise errors[0]
