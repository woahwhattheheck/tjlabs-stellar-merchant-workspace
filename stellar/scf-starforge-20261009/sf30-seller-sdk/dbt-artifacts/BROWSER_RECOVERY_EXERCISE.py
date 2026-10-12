"""Run the original project journey, then native browser recovery. MIT."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import subprocess
import sys
import threading
from dbt_core import Project
from dbt_http import start_server
from dbt_store import json_bytes, create_file


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", required=True, help="New, create-only private output directory")
    parser.add_argument("--node", default="node")
    args = parser.parse_args()
    work = Path(args.work).absolute()
    work.mkdir(mode=0o700, parents=True, exist_ok=False)
    source = Path(__file__).parent
    native = work / "original"
    with (work / "original-native.log").open("wb") as log:
        subprocess.run([sys.executable, str(source / "EXERCISE.py"), "--work", str(native)], stdout=log, stderr=subprocess.STDOUT, check=True)
    original = json.loads((native / "result.json").read_bytes())
    server = start_server(Project(original["project"]), receive_root=str(work / "received"))
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
    thread.start()
    startup = work / "startup.json"
    create_file(startup, json_bytes(server.application.ready))
    try:
        subprocess.run([args.node, str(source / "browser-recovery-journey.mjs"), str(startup), str(native / "result.json"), str(work)], check=True)
    finally:
        server.shutdown()
        thread.join()
        server.server_close()
        server.application.close()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
