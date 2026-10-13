#!/usr/bin/env python3
"""Pirate project policy over the maintained streaming source-archive engine."""
from pathlib import Path
import base64, hashlib, json, sys, zipfile
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from source_bundle_archive import ArchivePolicy, ArchiveFault, archive, inspect, extract, file_hash
SCHEMA = "stellar-forge.pirate-weather-project.v1"
POLICY = ArchivePolicy(SCHEMA, max_expanded_bytes=1024**3, max_members=20000,
                      max_file_bytes=512*1024**2, receipt_name="source-handover.json",
                      prefix="PIRATE_PROJECT")
def main(value):
    action = value.pop("action")
    if action == "runtime-source":
        # Parse the selected original archive with its maintained trusted helper.
        # This performs no extraction, dependency installation or source execution.
        import importlib.util
        helper = Path(__file__).resolve().parents[2] / "distribution" / "runtime-unpack.py"
        spec = importlib.util.spec_from_file_location("pirate_original_runtime_unpack", helper)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        selected, files, contents, manifest_sha = module.inspect(Path(value["archive"]), value["expectedArchiveSha256"])
        if manifest_sha != value["expectedManifestSha256"]:
            POLICY.fail("RUNTIME_SOURCE_MANIFEST_CHANGED")
        return {"status": "SOURCE_ARCHIVE_VERIFIED", "archiveSha256": value["expectedArchiveSha256"],
                "manifestSha256": manifest_sha, "sourceCommit": selected["sourceCommit"],
                "sourceFiles": len(selected["files"]), "fileCount": len(files)}
    if action == "archive":
        return archive(value, policy=POLICY)
    result = inspect({"archive": value["archive"]}, policy=POLICY)
    if value.get("expectedArchiveSha256") is not None and result["archive"]["sha256"] != value["expectedArchiveSha256"]:
        POLICY.fail("SOURCE_CHANGED")
    manifest = result["manifest"]
    selected_member = None
    if not isinstance(manifest.get("workspace"), dict) or not isinstance(manifest.get("application"), dict):
        POLICY.fail("MANIFEST_INVALID")
    names = {f["path"]: f for f in manifest["files"]}
    if "workspace/workspace.json" not in names or "application/manifest.json" not in names:
        POLICY.fail("SOURCE_MISSING")
    for name in names:
        if not (name.startswith("workspace/") or name.startswith("application/") or name.startswith("runtime/")):
            POLICY.fail("UNEXPECTED_MEMBER")
    with zipfile.ZipFile(value["archive"]) as original:
        raw = original.read("handover.json")
        if json.loads(raw) != manifest: POLICY.fail("SOURCE_CHANGED")
        result["manifestSha256"] = hashlib.sha256(raw).hexdigest()
        if int(names["workspace/workspace.json"]["bytes"]) > 64*1024**2:
            POLICY.fail("STATE_CAPACITY")
        state_raw = original.read("files/workspace/workspace.json")
        if (len(state_raw) != int(names["workspace/workspace.json"]["bytes"]) or
                hashlib.sha256(state_raw).hexdigest() != names["workspace/workspace.json"]["sha256"]):
            POLICY.fail("SOURCE_CHANGED")
        state = json.loads(state_raw)
        if state.get("schema") != "stellar-forge.pirate-weather-workspace.v1" or (
            state.get("workspaceId") != manifest["workspace"].get("workspaceId") or
            state.get("revision") != manifest["workspace"].get("revision")):
            POLICY.fail("STATE_IDENTITY")
        actual = {name: len(state.get(name, [])) for name in
                  ("captures", "contractEditions", "reportIds", "reviews", "datasets", "releases", "receipts")}
        actual["operations"] = len(state.get("operations", {}))
        if actual != manifest["workspace"].get("counts"):
            POLICY.fail("STATE_COUNTS")
        if action == "member":
            name = value["member"]
            if name not in names or int(names[name]["bytes"]) > 64*1024**2:
                POLICY.fail("MEMBER_SELECTION")
            body = original.read("files/"+name)
            if len(body) != int(names[name]["bytes"]) or hashlib.sha256(body).hexdigest() != names[name]["sha256"]:
                POLICY.fail("SOURCE_CHANGED")
            selected_member = {"path": name, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(),
                               "encoding": "base64", "data": base64.b64encode(body).decode("ascii")}
    if file_hash(value["archive"], POLICY, maximum=POLICY.max_archive_bytes) != result["archive"]:
        POLICY.fail("SOURCE_CHANGED")
    if selected_member is not None:
        return {**selected_member, "archive": result["archive"]}
    if action == "inspect":
        return result
    if action == "extract":
        received = extract({"archive": value["archive"], "destination": value["destination"]}, policy=POLICY)
        if received["archive"] != result["archive"]: POLICY.fail("SOURCE_CHANGED")
        return {**received, "manifestSha256": result["manifestSha256"], "members": result["members"]}
    POLICY.fail("ACTION")
if __name__ == "__main__":
    try:
        raw = sys.stdin.buffer.read(40*1024**2+1)
        if len(raw)>40*1024**2: POLICY.fail("INPUT_CAPACITY")
        print(json.dumps(main(json.loads(raw)), ensure_ascii=False, separators=(",",":")), flush=True)
    except Exception as error:
        print(json.dumps({"error": getattr(error,"code","PIRATE_PROJECT_FAILED"),
                          "message": str(error)}, ensure_ascii=False), file=sys.stderr, flush=True)
        raise SystemExit(1)
