#!/usr/bin/env python3
"""MIT. Complete original-model publisher-refresh receiving; no acquisition or scheduler."""
from __future__ import annotations
import argparse
import hashlib
import os
from pathlib import Path
import stat
import sys
import time
import uuid
import zipfile

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from iati_workspace import IatiWorkspace, InputError, packet_write, MAX_PACKET, MAX_METADATA
from workspace import load_json, json_bytes, digest, file_digest, regular, private_write, sync_dir
from refresh import native_selection

SCHEMA = "stellar-forge.iati-refresh-core-receiving.v1"


def private_directory(path):
    path = Path(path).expanduser().absolute()
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.resolve() != path or path.is_symlink():
        raise InputError("Use a real private receiving directory")
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode) or (os.name == "posix" and (info.st_uid != os.getuid() or info.st_mode & 0o077)):
        raise InputError("Receiving directories must be private and operator-owned")
    return path


def publish(path, value):
    encoded = value if isinstance(value, bytes) else json_bytes(value)
    maximum = MAX_PACKET if isinstance(value, bytes) else MAX_METADATA
    if len(encoded) > maximum:
        raise InputError("Complete receiving metadata exceeds its original limit")
    if path.exists() or path.is_symlink():
        if file_digest(path, maximum) != digest(encoded) or path.read_bytes() != encoded:
            raise InputError("The original receiving selection/result differs: " + str(path.name))
        return value
    temporary = path.with_name("." + path.name + "." + uuid.uuid4().hex + ".partial")
    private_write(temporary, encoded)
    if file_digest(temporary, maximum) != digest(encoded) or temporary.read_bytes() != encoded:
        raise InputError("The complete staged receiving bytes changed")
    os.rename(temporary, path)
    sync_dir(path.parent)
    return value


def existing(path):
    if not path.exists():
        return None
    regular(path, MAX_METADATA)
    return load_json(path.read_bytes())


def descriptor(path, base):
    return {"path": path.relative_to(base).as_posix(), "bytes": regular(path, MAX_PACKET).st_size,
            "sha256": file_digest(path, MAX_PACKET)}


def verify_files(base, rows):
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or set(row) != {"path", "bytes", "sha256"}:
            raise InputError("The complete receiving output descriptor is invalid")
        name = row["path"]
        if not isinstance(name, str) or not name or Path(name).is_absolute() or "\\" in name or ".." in Path(name).parts or name in seen:
            raise InputError("The original receiving output path is invalid")
        seen.add(name)
        path = base / name
        if descriptor(path, base) != row:
            raise InputError("A complete original receiving output changed: " + name)


class SelectedInterruption(Exception):
    pass


def run(raw):
    required = {"operationId", "sourceRoot", "workspaceDirectory", "receivedDirectory", "outputDirectory",
                "before", "after", "actor", "reviewer", "baselineNote", "reviewNote", "promotionNote"}
    optional = {"selection", "nextSelection", "sourceChangeNote", "selectionNote", "name"}
    if not isinstance(raw, dict) or set(raw) - required - optional or not required <= set(raw):
        raise InputError("Use the complete original receiving input")
    op = raw["operationId"]
    if not isinstance(op, str) or not op or len(op) > 100 or not op[0].isalnum() or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-" for c in op):
        raise InputError("Choose one stable receiving operation ID up to 100 characters")
    for key in ("actor", "reviewer", "baselineNote", "reviewNote", "promotionNote"):
        if not isinstance(raw[key], str) or not raw[key].strip():
            raise InputError("Provide the explicit named receiving review and decision notes")
    root = Path(raw["sourceRoot"]).expanduser().resolve(strict=True)
    if HERE.parent != root / "stellar/scf-starforge-20261009/sf30-seller-sdk/iati":
        raise InputError("Run the exact selected original source module")
    output = private_directory(raw["outputDirectory"])
    workspace = Path(raw["workspaceDirectory"]).expanduser().absolute()
    received_directory = Path(raw["receivedDirectory"]).expanduser().absolute()
    locations = [output, workspace, received_directory]
    if any(a == b or a in b.parents or b in a.parents for i, a in enumerate(locations) for b in locations[i + 1:]):
        raise InputError("Use separate source, received and output directories")
    if root == output or root in output.parents or root == workspace or root in workspace.parents or root == received_directory or root in received_directory.parents:
        raise InputError("Receiving workspaces and outputs must remain outside the immutable installed source")
    os.umask(0o077)
    lock = os.fdopen(os.open(output / ".receiving.lock", os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600), "r+b")
    try:
        regular(output / ".receiving.lock", 4096)
        if os.name == "posix":
            import fcntl
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        else:
            import msvcrt
            if not lock.read(1):
                lock.write(b"0"); lock.flush()
            lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        selection = {"schema": "stellar-forge.iati-refresh-receiving-selection.v1", "input": raw,
                     "sourceFiles": []}
        for name in ("refresh.py", "refresh_packet.py", "refresh_http.py", "refresh_cli.py",
                     "iati_workspace.py", "iati_source.py", "REFRESH.md", "receiving/refresh.py"):
            source = HERE.parent / name
            if not stat.S_ISREG(source.lstat().st_mode):
                raise InputError("The complete selected original source is missing " + name)
            data = source.read_bytes()
            selection["sourceFiles"].append({"path": name, "bytes": len(data), "sha256": digest(data)})
        selection["sha256"] = digest(json_bytes(selection))
        publish(output / "selection.json", selection)
        done = existing(output / "result.json")
        if done is not None:
            if done.get("schema") != SCHEMA or done.get("state") != "COMPLETE" or done.get("operationId") != op or done.get("selectionSha256") != selection["sha256"]:
                raise InputError("The saved complete receiving result belongs to another selection")
            verify_files(output, done["files"])
            return done
        for name in ("actions", "observations", "exports"):
            private_directory(output / name)

        def step(name, make_input, action):
            selected_path = output / "actions" / (name + "-input.json")
            selected = existing(selected_path)
            if selected is None:
                selected = publish(selected_path, make_input())
            result = action(selected)
            publish(output / "actions" / (name + "-result.json"), result)
            return result

        def source_input(value):
            if not isinstance(value, dict) or not {"path", "bytes", "sha256", "label", "provenance"} <= set(value):
                raise InputError("Select a full publisher input, its SHA/size and original provenance")
            path = Path(value["path"]).expanduser().absolute()
            info = path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_size != value["bytes"]:
                raise InputError("The complete selected publisher file differs")
            h = hashlib.sha256()
            with path.open("rb") as stream:
                while block := stream.read(1048576):
                    h.update(block)
            if h.hexdigest() != value["sha256"]:
                raise InputError("The complete selected publisher SHA-256 differs")
            return path

        summary = existing(output / "core-summary.json")
        if summary is None:
            before_path, after_path = source_input(raw["before"]), source_input(raw["after"])
            if not workspace.parent.is_dir() or not received_directory.parent.is_dir():
                raise InputError("Create the original private parent directories before selecting this receiving")
            with IatiWorkspace(workspace, create=not workspace.exists()) as ws:
                with before_path.open("rb") as stream:
                    before = ws.add_source(stream, raw["before"]["label"], before_path.name)
                with after_path.open("rb") as stream:
                    after = ws.add_source(stream, raw["after"]["label"], after_path.name)
                if before["id"] != raw["before"]["sha256"] or after["id"] != raw["after"]["sha256"]:
                    raise InputError("Original source ingestion changed a publisher identity")
                publish(output / "observations" / "publishers.json", {"before": before, "after": after,
                    "beforeProvenance": raw["before"]["provenance"], "afterProvenance": raw["after"]["provenance"],
                    "samePublisherBytes": before["id"] == after["id"]})
                baseline = step("baseline", lambda: {"requestId": op + ":baseline",
                    "name": raw.get("name", "Original publisher refresh receiving"),
                    "notes": raw["baselineNote"], "sources": [before["id"]], "selection": raw.get("selection", {}),
                    "review": {"status": "reviewed", "reviewer": raw["reviewer"], "note": raw["baselineNote"]}}, ws.save_portfolio)
                plan_reply = step("plan", lambda: {"requestId": op + ":plan",
                    "name": raw.get("name", "Saved publisher refresh"), "owner": raw["actor"],
                    "portfolioId": baseline["id"], "baselineRevision": baseline["revision"],
                    "note": "Complete original-source and interruption receiving; labels do not invent a new publisher period."},
                    lambda value: ws.refresh.save("plan-save", value))
                plan_id = plan_reply["plan"]["id"]
                pairs = [] if before["id"] == after["id"] else [{"before": before["id"], "after": after["id"]}]

                def start_input(label, suffix, selection=None, note=None):
                    current = ws.refresh.status(plan_id)
                    preview_input = {"planId": plan_id, "expectedPlanRevision": current["plan"]["revision"],
                        "expectedPortfolioRevision": current["portfolio"]["revision"], "sources": [after["id"]],
                        "pairs": pairs if current["plan"]["baseline"]["sources"] == [before["id"]] else [],
                        "sourceChangeNote": raw.get("sourceChangeNote", ""),
                        "selectionNote": note if note is not None else raw.get("selectionNote", "")}
                    if selection is not None:
                        preview_input["selection"] = selection
                    preview = ws.refresh.preview(preview_input)
                    return {**preview_input, "requestId": op + ":" + suffix, "previewSha256": preview["sha256"],
                            "label": label, "actor": raw["actor"], "note": "Full retained publisher bytes; original native engine."}

                # A single controlled interruption after the REAL native commit
                # exercises the exact lost-reply boundary without inventing a result.
                lost_path = output / "actions" / "lost-reply-input.json"
                lost = existing(lost_path)
                if lost is None:
                    lost = publish(lost_path, start_input("Original native reply recovery", "lost-reply", raw.get("nextSelection")))
                observation = output / "observations" / "lost-native-reply.json"
                if existing(observation) is None:
                    original_save = ws.save_portfolio
                    def interrupt_after_original(value):
                        result = original_save(value)
                        if value["requestId"] == ws.refresh._native_id(plan_id, lost["requestId"], "candidate"):
                            publish(observation, {"kind": "CONTROLLED_AFTER_ORIGINAL_NATIVE_COMMIT",
                                "requestId": value["requestId"], "inputSha256": digest(json_bytes(value)),
                                "portfolio": native_selection(result)})
                            raise SelectedInterruption("Original native commit retained; its refresh pointer reply was interrupted")
                        return result
                    ws.save_portfolio = interrupt_after_original
                    try:
                        ws.refresh.save("start", lost)
                    except SelectedInterruption:
                        pass
                    finally:
                        ws.save_portfolio = original_save
                pending = ws.refresh.request(lost["requestId"])
                if pending["state"] == "PREPARED":
                    selected = pending["prepared"]["nativeRequest"]
                    native = ws.save_portfolio(selected)
                    step("unrelated-native-edit", lambda: {**{key: native[key] for key in ("name", "sources", "selection", "review")},
                        "notes": native["notes"] + "\nReceiving observation: a later original native edit preceded refresh response recovery.",
                        "requestId": op + ":later-native", "id": native["id"], "expectedRevision": native["revision"]},
                        ws.save_portfolio)
                recovered = ws.refresh.resume(lost["requestId"])
                publish(output / "actions" / "lost-reply-result.json", recovered)
                original_pointer = existing(observation)["portfolio"]
                if recovered["run"]["candidate"] != original_pointer:
                    raise InputError("Lost-reply continuation followed a later native revision")
                step("cancel-recovered", lambda: {"requestId": op + ":cancel-recovered", "planId": plan_id,
                    "runId": recovered["run"]["id"], "expectedRevision": recovered["run"]["revision"],
                    "actor": raw["actor"], "note": "Close the explicitly recovered original run; retain its later-native-edit observation."},
                    lambda value: ws.refresh.save("cancel", value))

                current_run = step("run", lambda: start_input("Complete selected publisher review", "run", raw.get("nextSelection")),
                                   lambda value: ws.refresh.save("start", value))
                reviewed = step("review", lambda: {"requestId": op + ":review", "planId": plan_id,
                    "runId": current_run["run"]["id"], "expectedRevision": current_run["run"]["revision"],
                    "expectedPortfolioRevision": current_run["run"]["candidate"]["revision"],
                    "review": {"status": "reviewed", "reviewer": raw["reviewer"], "note": raw["reviewNote"]}},
                    lambda value: ws.refresh.save("review", value))
                promoted = step("promote", lambda: {"requestId": op + ":promote", "planId": plan_id,
                    "runId": reviewed["run"]["id"], "expectedRevision": reviewed["run"]["revision"],
                    "expectedPlanRevision": ws.refresh.plan(plan_id)["revision"], "actor": raw["actor"],
                    "note": raw["promotionNote"]}, lambda value: ws.refresh.save("promote", value))
                if promoted["plan"]["baseline"] != reviewed["run"]["candidate"]:
                    raise InputError("Explicit promotion did not preserve the reviewed native pointer")
                paused = step("pause-plan", lambda: {"requestId": op + ":pause", "id": plan_id,
                    "expectedRevision": promoted["plan"]["revision"], "name": promoted["plan"]["name"],
                    "owner": promoted["plan"]["owner"], "note": promoted["plan"]["note"], "state": "PAUSED"},
                    lambda value: ws.refresh.save("plan-save", value))
                active = step("reactivate-plan", lambda: {"requestId": op + ":reactivate", "id": plan_id,
                    "expectedRevision": paused["plan"]["revision"], "name": paused["plan"]["name"],
                    "owner": paused["plan"]["owner"], "note": paused["plan"]["note"], "state": "ACTIVE"},
                    lambda value: ws.refresh.save("plan-save", value))
                if active["plan"]["baseline"] != promoted["plan"]["baseline"]:
                    raise InputError("Plan metadata editing moved the selected baseline")

                next_path = output / "actions" / "next-pending-input.json"
                next_input = existing(next_path)
                if next_input is None:
                    next_input = publish(next_path, start_input("Next original selection retained for receiving", "next-pending"))
                next_state = ws.refresh.request(next_input["requestId"])
                if next_state["state"] == "NOT_RECORDED":
                    original_save = ws.save_portfolio
                    def interrupt_before_original(value):
                        raise SelectedInterruption("Exact refresh preparation retained before its native save")
                    ws.save_portfolio = interrupt_before_original
                    try:
                        ws.refresh.save("start", next_input)
                    except SelectedInterruption:
                        pass
                    finally:
                        ws.save_portfolio = original_save
                next_state = ws.refresh.request(next_input["requestId"])
                if next_state["state"] != "PREPARED":
                    raise InputError("The original next request should remain prepared for independent receiving")
                publish(output / "observations" / "pending-before-receive.json", next_state)
                status = ws.refresh.status(plan_id)
                first_archive = output / "exports" / "IATI_Refresh_Original_Pending.zip"
                first = ws.refresh.export(plan_id, first_archive, status["snapshot"])
                repeated = ws.refresh.export(plan_id, first_archive, status["snapshot"])
                if first["sha256"] != repeated["sha256"] or not repeated["reused"]:
                    raise InputError("Same-selection original archive retry changed its bytes")
                publish(output / "observations" / "source-archive.json", {
                    "path": first_archive.relative_to(output).as_posix(), "bytes": first["bytes"], "sha256": first["sha256"],
                    "plan": plan_id, "snapshot": status["snapshot"]})
            with IatiWorkspace(received_directory, create=not received_directory.exists()) as receiving:
                received = receiving.refresh.receive(first_archive)
                received_again = receiving.refresh.receive(first_archive)
                retained_request = receiving.refresh.request(next_input["requestId"])
                if (not received_again["reused"] or retained_request["state"] not in {"PREPARED", "COMPLETE"}
                        or retained_request["input"] != next_input):
                    raise InputError("Independent receiving did not preserve the original pending or completed request")
                resumed = receiving.refresh.resume(next_input["requestId"])
                publish(output / "observations" / "received-resume.json", resumed)
                cancelled = step("cancel-received-next", lambda: {"requestId": op + ":cancel-received-next",
                    "planId": plan_id, "runId": resumed["run"]["id"], "expectedRevision": resumed["run"]["revision"],
                    "actor": raw["actor"], "note": "Independent receiving resumed the same pending source selection; baseline remains explicitly promoted."},
                    lambda value: receiving.refresh.save("cancel", value))
                before_old = receiving.refresh.status(plan_id)
                old = receiving.refresh.receive(first_archive)
                after_old = receiving.refresh.status(plan_id)
                if before_old != after_old or not old["reused"]:
                    raise InputError("An older received packet changed later local request or run history")
                final_archive = output / "exports" / "IATI_Refresh_Received_Complete.zip"
                final = receiving.refresh.export(plan_id, final_archive, after_old["snapshot"])
                publish(output / "observations" / "received-status.json", after_old)
                publish(output / "observations" / "old-packet-retry.json", old)
                publish(output / "observations" / "received-archive.json", {
                    "path": final_archive.relative_to(output).as_posix(), "bytes": final["bytes"], "sha256": final["sha256"],
                    "plan": plan_id, "snapshot": after_old["snapshot"]})
            with IatiWorkspace(workspace) as source:
                source_status = source.refresh.status(plan_id)
                source_history = source.refresh.history(plan_id)
                source_runs = source.refresh.runs(plan_id)
            with IatiWorkspace(received_directory) as receiving:
                received_status = receiving.refresh.status(plan_id)
                if (source_status["pendingRequest"]["requestId"] != next_input["requestId"]
                        or received_status["pendingRequest"] is not None
                        or received_status["plan"]["baseline"] != promoted["plan"]["baseline"]):
                    raise InputError("Original source and independently received workspaces did not reopen their exact saved states")
                histories = {"sourcePlan": source_history, "receivedPlan": receiving.refresh.history(plan_id),
                    "sourceRuns": source_runs, "receivedRuns": receiving.refresh.runs(plan_id)}
                publish(output / "observations" / "reopened-history.json", histories)
                for name, archive in (("original", first_archive), ("received", final_archive)):
                    with zipfile.ZipFile(archive) as contents:
                        manifest = load_json(contents.read("manifest.json"))
                        for member in ("reports/refresh.json", "reports/refresh.html", "reports/refresh.csv"):
                            data = contents.read(member)
                            if len(data) != manifest["files"][member]["bytes"] or digest(data) != manifest["files"][member]["sha256"]:
                                raise InputError("A complete extracted refresh report differs")
                            publish_name = output / "observations" / (name + "-" + Path(member).name)
                            publish(publish_name, data)
            rows = [descriptor(path, output) for path in sorted(output.rglob("*"))
                    if path.is_file() and not path.name.startswith(".") and path.name not in {"result.json", "core-summary.json"}
                    and not any(part.startswith(".") for part in path.relative_to(output).parts)]
            summary = {"schema": SCHEMA, "state": "COMPLETE", "operationId": op, "selectionSha256": selection["sha256"],
                "planId": plan_id, "promotedRunId": promoted["run"]["id"], "baseline": promoted["plan"]["baseline"],
                "pendingRequestId": next_input["requestId"], "workspaceDirectory": str(workspace),
                "receivedDirectory": str(received_directory), "sourceArchive": descriptor(first_archive, output),
                "receivedArchive": descriptor(final_archive, output), "files": rows, "completedAt": time.time()}
            publish(output / "core-summary.json", summary)
        else:
            if summary.get("operationId") != op or summary.get("selectionSha256") != selection["sha256"]:
                raise InputError("The original completed core selection differs")
            verify_files(output, summary["files"])
        bundle_files = {row["path"]: output / row["path"] for row in summary["files"]}
        bundle_files["core-summary.json"] = output / "core-summary.json"
        for name in ("REFRESH.md", "OPERATIONS.md", "DOMAIN.md", "receiving/REFRESH.md"):
            data = (HERE.parent / name).read_bytes()
            saved = output / ("guide-" + name.replace("/", "-"))
            publish(saved, data)
            bundle_files["guides/" + ("RECEIVING.md" if name == "receiving/REFRESH.md" else name)] = saved
        customer = output / "IATI_Publisher_Refresh_Complete_Receiving.zip"
        archive = packet_write(customer, bundle_files, "stellar-forge.iati-refresh-receiving-customer.v1",
                               {"operationId": op, "selectionSha256": selection["sha256"], "plan": summary["planId"]})
        final_files = [*summary["files"], descriptor(output / "core-summary.json", output),
                       descriptor(customer, output)]
        result = {**summary, "files": final_files,
                  "customerHandover": {"path": str(customer), "bytes": archive["bytes"], "sha256": archive["sha256"]}}
        publish(output / "result.json", result)
        return result
    finally:
        lock.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    with Path(args.input).open("rb") as stream:
        data = stream.read(131073)
    if len(data) > 131072:
        raise InputError("Use the complete original receiving selection within 128 KiB")
    result = run(load_json(data))
    print(json_bytes(result).decode(), end="", flush=True)


if __name__ == "__main__":
    main()
