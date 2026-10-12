#!/usr/bin/env python3
"""Review and launch the complete Support receiving through the existing native caller."""
from __future__ import annotations
import argparse, fcntl, hashlib, json, os, stat, sys
from pathlib import Path

def need(value, code):
    if not value: raise RuntimeError(code)

def save(path, value):
    path = Path(path); raw = (json.dumps(value, sort_keys=True, indent=2) + "\n").encode()
    if path.exists():
        need(path.read_bytes() == raw, "ORIGINAL_RETAINED_SELECTION_CHANGED")
        return
    temporary = path.with_name("." + path.name + "." + str(os.getpid()) + ".tmp")
    with open(temporary, "xb") as stream:
        os.fchmod(stream.fileno(), 0o600); stream.write(raw); stream.flush(); os.fsync(stream.fileno())
    try: os.link(temporary, path)
    finally: temporary.unlink()
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(directory)
    finally: os.close(directory)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True); parser.add_argument("--configuration-sha256", required=True)
    args = parser.parse_args()
    selected = Path(args.config).resolve(strict=True); raw = selected.read_bytes()
    need(hashlib.sha256(raw).hexdigest() == args.configuration_sha256, "ORIGINAL_CONFIGURATION_CHANGED")
    cfg = json.loads(raw); project = Path(cfg["project"]); dev = Path(cfg["private_dev_root"])
    need(project.is_absolute() and project.resolve(strict=True) == project, "PERSISTENT_PROJECT_REQUIRED")
    item = project.stat(); need(item.st_uid == os.getuid() and item.st_mode & 0o077 == 0, "PRIVATE_PROJECT_REQUIRED")
    lock = open(project / "launcher.lock", "a+b"); fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    need(dev.parent == Path("/dev") and dev.name == "scf-object-support-33e6-20261012", "PRIVATE_CONTEXT_SELECTION")
    sys.path.insert(0, cfg["native_host"])
    import swarm_cloud_job as native
    from native_foreground import ForegroundLaunch
    from cloud_job_workspace import Workspace, initialize
    need(Path(native.__file__).resolve() == (Path(cfg["native_host"]) / "swarm_cloud_job.py").resolve(strict=True),
         "ORIGINAL_NATIVE_RUNTIME_CHANGED")
    record = native.run_path(cfg["operation_id"], cfg["records_root"])
    need(not (record / "request.json").exists(), "ORIGINAL_NATIVE_RECORD_EXISTS_RECONCILE_BEFORE_CONTROL")
    need(not dev.exists(), "ORIGINAL_PRIVATE_CONTEXT_EXISTS_RECONCILE")
    dev.mkdir(mode=0o700)
    save(dev / "context.json", {"operationId":cfg["operation_id"],
         "configurationSha256":args.configuration_sha256, "launcherPid":os.getpid()})
    (dev / "worker").mkdir(mode=0o700); (dev / "native-tmp").mkdir(mode=0o700)
    operator = project / "operator"
    if not operator.exists():
        initialize(operator, peer="33e6-object-support", projects=[str(project)],
                   records_root=cfg["records_root"], worker_root=str(dev / "worker"),
                   temp_root=str(dev / "native-tmp"), label="Original Object monitoring and Support receiving")
    workspace = Workspace(operator)
    request = {"operation_id":cfg["operation_id"], "project":str(project),
               "command":[cfg["python"], "-B", cfg["runner"], "--config", str(selected)],
               "artifacts":["native-outcome.json"], "memory_mib":cfg["resources"]["memory_mib"],
               "memory_reserve_mib":cfg["resources"]["memory_reserve_mib"],
               "memory_reclaim":"clean-cache", "memory_reservations_root":cfg["memory_reservations_root"],
               "disk_space":cfg["resources"]["disk_space"], "disk_inodes":cfg["resources"]["disk_inodes"],
               "disk_reserve_mib":cfg["resources"]["disk_reserve_mib"],
               "disk_reserve_inodes":cfg["resources"]["disk_reserve_inodes"],
               "disk_reservations_root":cfg["disk_reservations_root"],
               "runtime_paths":cfg["runtime_paths"], "runtime_consumers_root":cfg["runtime_consumers_root"]}
    save(project / "reviewed-intent.json", request)
    saved_plan = project / "launch-plan.json"
    if saved_plan.exists():
        plan = json.loads(saved_plan.read_bytes())
    else:
        with workspace.own(): plan = workspace.prepare(request)
        save(saved_plan, plan)
    reopened = Workspace(operator).plan(plan["id"])
    need(reopened["id"] == plan["id"] and reopened["sha256"] == plan["sha256"],
         "ORIGINAL_PREPARED_PLAN_CHANGED")
    print(json.dumps({"phase":"ORIGINAL_SUPPORT_PLAN_REOPENED", "operationId":cfg["operation_id"],
          "planId":plan["id"], "planSha256":plan["sha256"], "record":str(record)}), flush=True)
    launch = ForegroundLaunch(native)
    try:
        with workspace.own(): acknowledgement = workspace.start(plan["id"], plan["sha256"], launcher=launch)
        save(project / "start-acknowledgement.json", acknowledgement)
        print(json.dumps({"phase":"ORIGINAL_SUPPORT_START_RETURNED", "acknowledgement":acknowledgement}), flush=True)
    finally: launch.handoff()

if __name__ == "__main__":
    main()
