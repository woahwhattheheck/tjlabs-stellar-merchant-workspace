"""Run the unchanged scientific operator with an owned parent-lifetime pipe."""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import signal
import stat
import sys
import threading

sys.dont_write_bytecode=True

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--application",required=True)
    parser.add_argument("--workspace",required=True)
    parser.add_argument("--workspace-id",required=True)
    parser.add_argument("--created",required=True)
    parser.add_argument("--db-dev",required=True)
    parser.add_argument("--db-ino",required=True)
    args=parser.parse_args()
    application=Path(args.application)
    workspace=Path(args.workspace)
    for selected in (application,workspace):
        if not selected.is_absolute() or selected.resolve()!=selected or not selected.is_dir():
            raise ValueError("Keep the selected original application and workspace directories.")
    database=workspace/"groundwater.sqlite"
    before=database.lstat()
    if not stat.S_ISREG(before.st_mode) or str(before.st_dev)!=args.db_dev or str(before.st_ino)!=args.db_ino:
        raise ValueError("The selected original scientific database was replaced.")
    # EOF means this launcher lost its parent. The original server's signal handler
    # drains its request threads; no child is deliberately detached from this pipe.
    def parent_closed():
        while sys.stdin.buffer.read(4096):
            pass
        os.kill(os.getpid(),signal.SIGTERM)
    threading.Thread(target=parent_closed,daemon=True).start()
    sys.path.insert(0,str(application))
    from groundwater_workspace import Workbench
    from groundwater_workspace.server import serve
    with Workbench(workspace,application,existing_only=True,initial_workspace_id=args.workspace_id) as work:
        original=work.state()["workspace"]
        after=database.lstat()
        if original["id"]!=args.workspace_id or original["created"]!=args.created or (
            after.st_dev,after.st_ino)!=(before.st_dev,before.st_ino):
            raise ValueError("The opened scientific workspace has another original identity.")
        return serve(work,"127.0.0.1",0)

if __name__=="__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        import json
        print(json.dumps({"error":{"code":getattr(error,"code",type(error).__name__),"message":str(error)}}),file=sys.stderr,flush=True)
        raise SystemExit(2)
