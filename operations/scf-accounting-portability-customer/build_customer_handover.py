#!/usr/bin/env python3
"""Deliver the complete closed accounting account, application and receiving history."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(part)
    return h.hexdigest()

def checked(path, row):
    assert path.is_file() and not path.is_symlink(), str(path)
    assert path.stat().st_size == row["bytes"] and digest(path) == row["sha256"], str(path)

def descriptor(path, relative=None):
    return {"path": str(relative or path.name), "bytes": path.stat().st_size, "sha256": digest(path)}

def copy(source, target):
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if target.exists():
        assert target.stat().st_size == source.stat().st_size and digest(target) == digest(source), str(target)
        return
    with source.open("rb") as src, target.open("xb") as dst:
        shutil.copyfileobj(src, dst, 1024 * 1024)
        dst.flush()
        os.fsync(dst.fileno())
    target.chmod(0o600)

def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")
    path.chmod(0o600)

def publish_zip(archive, entries):
    def valid():
        if not archive.exists():
            return False
        try:
            with zipfile.ZipFile(archive) as z:
                assert z.testzip() is None
                assert len(z.namelist()) == len(set(z.namelist())) == len(entries)
                assert set(z.namelist()) == {name for name, _ in entries}
                for name, origin in entries:
                    data = z.read(name)
                    assert len(data) == origin.stat().st_size and hashlib.sha256(data).hexdigest() == digest(origin)
            return True
        except (AssertionError, OSError, zipfile.BadZipFile, KeyError):
            return False
    if valid():
        return
    if archive.exists():
        retained = archive.with_name(archive.name + ".incomplete-" + digest(archive))
        if retained.exists():
            assert digest(retained) == digest(archive)
            archive.unlink()
        else:
            os.rename(archive, retained)
    with tempfile.NamedTemporaryFile(dir=archive.parent, prefix=".publishing-", suffix=".zip", delete=False) as stream:
        temporary = Path(stream.name)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for name, origin in entries:
                z.write(origin, name)
        with temporary.open("rb") as stream:
            os.fsync(stream.fileno())
        os.link(temporary, archive)
        assert valid(), "The complete published ZIP differs from the retained input files."
    finally:
        temporary.unlink(missing_ok=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--instance", type=Path, required=True)
    parser.add_argument("--original-account", type=Path, required=True)
    parser.add_argument("--operator-result", type=Path, required=True)
    parser.add_argument("--cold-result", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--node", default="node")
    args = parser.parse_args()
    os.umask(0o077)
    source_root, instance, output = args.source.resolve(), args.instance.resolve(), args.output.resolve()
    assert output != instance and not output.is_relative_to(instance) and not instance.is_relative_to(output), "Keep output separate from the account."
    source = json.loads((source_root / "SOURCE.json").read_text())
    for row in source["files"]:
        checked(source_root / "application" / row["path"], row)
    for row in source["fulfillmentFiles"]:
        checked(source_root / "tools" / Path(row["path"]).name, row)
    original = descriptor(args.original_account.resolve())
    physical_state_path = instance / "state/account/workspace.json"
    physical_state = json.loads(physical_state_path.read_text())
    request = {"schema": "stellar-forge.accounting-customer-delivery-request.v1",
               "applicationCommit": source["applicationCommit"], "sourceSelectionSha256": source["sourceSelectionSha256"],
               "originalAccount": original,
               "operatorResultSha256": digest(args.operator_result), "coldResultSha256": digest(args.cold_result),
               "closedWorkspaceSha256": digest(physical_state_path)}
    operator, cold = [json.loads(path.read_text()) for path in (args.operator_result, args.cold_result)]
    for report in (operator, cold):
        assert report["status"] == "COMPLETE" and report["nativeOwnerClosed"] and report["browserClosed"], "Finish and close the customer operation first."
        assert report["pageErrors"] == [], "Resolve the recorded browser errors."
    assert all(physical_state[key] == cold["after"][key] for key in ("revision", "runs", "exports", "proofs", "termsImports")), "The current account differs from its closed cold-open result."
    assert physical_state.get("recoveredEntries", []) == cold["after"]["recovery"]["entries"], "Recovered original entries changed."
    binding = json.loads((instance / "INSTANCE.json").read_text())
    for report in (operator, cold):
        assert all(report["binding"][key] == binding[key] for key in ("workspaceId", "sourcesSha256")), "Different account identity."
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    request_path = output / "DELIVERY_INPUT.json"
    if request_path.exists():
        assert json.loads(request_path.read_text()) == request, "This output belongs to different delivery inputs."
    else:
        write(request_path, request)
    native_source = source_root / "application/stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/server.mjs"
    backup = output / "current-encrypted-backup"
    environment = dict(os.environ)
    pass_env = "STARFORGE_ACCOUNTING_DELIVERY_PASSPHRASE"
    environment[pass_env] = (instance / "private/restore-key.txt").read_text().removesuffix("\n").removesuffix("\r")
    if not backup.exists():
        command = [args.node, str(native_source), "backup", "--workspace", str(instance / "state/account"),
                   "--state-root", str(instance / "state"), "--out", str(backup), "--pass-env", pass_env, "--quiesced"]
        result = subprocess.run(command, env=environment, capture_output=True, text=True)
        (output / "native-backup-stdout.json").write_text(result.stdout)
        (output / "native-backup-stderr.txt").write_text(result.stderr)
        assert result.returncode == 0, "Original operating backup failed; inspect the retained native output."
    manifest = json.loads((backup / "backup.json").read_text())
    assert digest(physical_state_path) == request["closedWorkspaceSha256"], "The closed source account changed during delivery."
    verification = subprocess.run([args.node, str(native_source), "verify-backup", "--bundle", str(backup),
                                   "--expected-sha256", manifest["manifestSha256"], "--pass-env", pass_env],
                                  env=environment, capture_output=True, text=True)
    (output / "native-backup-verification.json").write_text(verification.stdout)
    assert verification.returncode == 0, "Authenticate the complete retained backup before delivery."
    bundle = output / "bundle"
    bundle.mkdir(mode=0o700, exist_ok=True)
    for row in source["files"]:
        copy(source_root / "application" / row["path"], bundle / "application" / row["path"])
    for row in source["fulfillmentFiles"]:
        name = Path(row["path"]).name
        copy(source_root / "tools" / name, bundle / "tools" / name)
    copy(source_root / "SOURCE.json", bundle / "SOURCE.json")
    copy(source_root / "application/LICENSE", bundle / "LICENSE")
    copy(source_root / "tools/CUSTOMER_HANDOVER.md", bundle / "START_HERE.md")
    copy(args.original_account, bundle / "native/original-account.zip")
    copy(instance / "private/restore-key.txt", bundle / "private/restore-key.txt")
    current_archive = bundle / "native/current-account-backup.zip"
    members = sorted(path for path in backup.rglob("*") if path.is_file())
    current_archive.parent.mkdir(mode=0o700, exist_ok=True)
    for path in members:
        assert not path.is_symlink(), str(path)
    publish_zip(current_archive, [("backups/retained-current/" + str(path.relative_to(backup)), path) for path in members])
    with zipfile.ZipFile(current_archive) as z:
        assert z.testzip() is None
        assert set(z.namelist()) == {"backups/retained-current/" + str(path.relative_to(backup)) for path in members}
        for path in members:
            assert hashlib.sha256(z.read("backups/retained-current/" + str(path.relative_to(backup)))).hexdigest() == digest(path)
    for phase, path, report in (("receiving", args.operator_result, operator), ("cold-open", args.cold_result, cold)):
        copy(path, bundle / "results" / phase / "operator-result.json")
        for item in report["downloads"]:
            rel = Path(item["path"])
            assert not rel.is_absolute() and ".." not in rel.parts
            origin = path.parent / rel
            checked(origin, item)
            copy(origin, bundle / "results" / phase / rel)
        for name in ("state-before.json", "state-after.json", "maintenance.json"):
            copy(path.parent / name, bundle / "results" / phase / name)
    for path in sorted((instance / "backups/operations").glob("*.json")):
        copy(path, bundle / "receiving/operations" / path.name)
    copy(instance / "backups/maintenance.json", bundle / "receiving/controller-state.json")
    copy(instance / "INSTANCE.json", bundle / "receiving/instance-identity.json")
    copy(output / "native-backup-stdout.json", bundle / "receiving/native-backup-result.json")
    copy(output / "native-backup-verification.json", bundle / "receiving/native-backup-verification.json")
    state = cold["after"]
    handover = {"schema": "stellar-forge.accounting-customer-handover.v1", "applicationCommit": source["applicationCommit"],
                "operatedSourceCommit": source["operatedSourceCommit"], "sourceSelectionSha256": source["sourceSelectionSha256"],
                "binding": {key: binding[key] for key in ("workspaceId", "sourcesSha256")},
                "receivingBackup": {**descriptor(current_archive, "native/current-account-backup.zip"),
                                    "memberPrefix": "backups/retained-current/", "manifestSha256": manifest["manifestSha256"]},
                "originalAccount": descriptor(bundle / "native/original-account.zip", "native/original-account.zip"),
                "recoveryKey": descriptor(bundle / "private/restore-key.txt", "private/restore-key.txt"),
                "nativeState": {"revision": state["revision"], "runs": len(state["runs"]), "exports": len(state["exports"]),
                                "proofs": len(state["proofs"]), "termsImports": len(state["termsImports"]),
                                "reviewCounts": state["reviewCounts"], "recoveredEntries": len(state["recovery"]["entries"])},
                "restoreRequestId": operator["restoreRequestId"], "sourceFiles": source["sourceFiles"],
                "sourceBytes": source["sourceBytes"], "receivingResult": "results/receiving/operator-result.json",
                "coldResult": "results/cold-open/operator-result.json"}
    write(bundle / "HANDOVER.json", handover)
    files = [descriptor(path, path.relative_to(bundle)) for path in sorted(bundle.rglob("*")) if path.is_file() and path != bundle / "MANIFEST.json"]
    inventory = {"schema": "stellar-forge.accounting-customer-files.v1", "files": files}
    write(bundle / "MANIFEST.json", inventory)
    archive = output / "SCF_Complete_Accounting_Customer_Handover.zip"
    publish_zip(archive, [(row["path"], bundle / row["path"]) for row in files] + [("MANIFEST.json", bundle / "MANIFEST.json")])
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert len(z.namelist()) == len(set(z.namelist())) == len(files) + 1
        assert set(z.namelist()) == {row["path"] for row in files} | {"MANIFEST.json"}
        assert z.read("MANIFEST.json") == (bundle / "MANIFEST.json").read_bytes()
        for row in files:
            data = z.read(row["path"])
            assert len(data) == row["bytes"] and hashlib.sha256(data).hexdigest() == row["sha256"], row["path"]
    result = {"status": "COMPLETE", "archive": str(archive), **descriptor(archive), "members": len(files) + 1,
              "applicationCommit": source["applicationCommit"], "nativeState": handover["nativeState"]}
    write(output / "delivery-result.json", result)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
