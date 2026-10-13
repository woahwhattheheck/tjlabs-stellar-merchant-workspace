#!/usr/bin/env python3
"""Start the original operator on an installed notification workspace."""
from __future__ import annotations
import argparse, importlib.util, json, os, pathlib, re, secrets, sys, uuid
sys.dont_write_bytecode = True
import manage
import archive as package

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--ready-file", required=True)
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--token-env", default="TASKER_OPERATOR_TOKEN")
    args = parser.parse_args(argv)
    if not 0 <= args.port <= 65535:
        parser.error("port must be between 0 and 65535")
    current = manage.installation(args.directory)
    application = pathlib.Path(current["paths"]["application"])
    source = manage.ordinary(application / "operator_server.py")
    html = manage.ordinary(application / "operator.html")
    # These two original modules are selected from the same installed source.
    worker = manage.worker_module(application)
    sys.modules["notification_outbox"] = worker
    spec = importlib.util.spec_from_file_location("taskerarmy_original_operator", source)
    operator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(operator)
    token = os.environ.get(args.token_env) or secrets.token_urlsafe(48)
    if len(token) < 32 or not re.fullmatch(r"[A-Za-z0-9_-]+", token):
        raise ValueError("The selected operator credential must be at least 32 URL-safe characters")
    ready = pathlib.Path(args.ready_file).absolute()
    if ready.exists() or ready.is_symlink():
        raise FileExistsError("Use a new ready file for this exact process")
    server = operator.OperatorServer(args.port, pathlib.Path(current["paths"]["database"]),
        pathlib.Path(current["paths"]["configuration"]), token, html.read_bytes())
    identity = {"schema": "taskerarmy.operator-process.v1", "instance_id": str(uuid.uuid4()),
        "installation_id": current["installation_id"], "operation_id": current["operation_id"],
        "pid": os.getpid(), "started_at": manage.utc(), "origin": server.origin,
        "url": server.origin + "/#token=" + token, "application": str(application),
        "database": current["paths"]["database"], "configuration": current["paths"]["configuration"],
        "operator_source_sha256": package.digest_file(source), "html_sha256": package.digest_file(html)}
    package.atomic_json(ready, identity)
    print(json.dumps({key: value for key, value in identity.items() if key != "url"}), flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError) as exc:
        print(json.dumps({"error": type(exc).__name__, "detail": str(exc)}), file=sys.stderr, flush=True)
        raise SystemExit(2)
