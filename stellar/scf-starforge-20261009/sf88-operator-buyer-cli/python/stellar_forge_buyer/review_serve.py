"""Foreground command lifetime for the original Python-owned review browser."""
from __future__ import annotations

import json
import os
from pathlib import Path
import signal
import threading
from typing import Any

from ._review_transport import absolute, ReviewError
from .storage import private_directory, read, write, sync_directory
from .errors import StateError
from .review_location import resolve_location


def browser_arguments(parser, *, selection=True):
    parser.add_argument("--port", type=int, default=0, help="Loopback port; zero selects a free port")
    parser.add_argument("--page", choices=["auto", "resources", "comparisons", "returns", "review-returns", "collections"], default="auto")
    parser.add_argument("--open-browser", action="store_true", help="Explicitly open the local desktop browser")
    parser.add_argument("--show-url", action="store_true", help="Print the private session URL to this terminal")
    parser.add_argument("--ready-file", help="New JSON file in an existing private directory; contains private session URL")
    parser.add_argument("--browser-operation-id", help="Optional identity for retrying this process's listener start")
    if selection:
        target = parser.add_mutually_exclusive_group()
        target.add_argument("--comparison-id", help="Open this original comparison")
        target.add_argument("--return-id", help="Open this saved incoming return")
        target.add_argument("--plan-id", help="Open this saved full-journal return plan")


def serve_foreground(library, args, *, received: dict[str, Any] | None = None, return_format=None):
    ready_path = None
    if args.ready_file:
        ready_path = Path(absolute(args.ready_file))
        if private_directory(ready_path.parent, create=False) != ready_path.parent:
            raise StateError("REVIEW_CANONICAL_CONNECTION_PATH_REQUIRED")
        if ready_path.exists() or ready_path.is_symlink():
            raise StateError("REVIEW_CONNECTION_FILE_EXISTS")
    location = resolve_location(library, args, received=received, return_format=return_format)
    page = location["page"]
    selectors = {key: value for key, value in location.items() if key != "page"}
    stop = threading.Event()
    prior = {}
    raw = None
    try:
        for sig in (signal.SIGINT, signal.SIGTERM):
            prior[sig] = signal.getsignal(sig)
            signal.signal(sig, lambda *_: stop.set())
        with library.browser(port=args.port, page=page, operation_id=args.browser_operation_id) as browser:
            url = browser.page_url(page, **selectors)
            private = {"schema": "stellar-forge.python-review-connection.v1", **browser.metadata(),
                       "stateDirectory": str(library.state), "location": location, "url": url}
            if ready_path:
                raw = (json.dumps(private, ensure_ascii=False, indent=2) + "\n").encode()
                write(ready_path, raw, exclusive=True)
            message = {"event": "listening", **browser.metadata(), "stateDirectory": str(library.state), "location": location}
            if ready_path:
                message["readyFile"] = str(ready_path)
            if args.show_url:
                message["url"] = url
            if args.open_browser:
                message["browserOpened"] = browser.open_tab(page, **selectors)
            if received:
                message["received"] = {key: received[key] for key in ("kind", "id", "state", "status", "comparisonId", "planId") if key in received}
                if return_format:
                    message["received"]["format"] = return_format
                if received.get("kind") == "collection" and received.get("receipt"):
                    message["received"].update({key: received["receipt"][key]
                        for key in ("collectionId", "revision", "manifestSha256", "sha256", "memberCount")})
            print(json.dumps(message, ensure_ascii=False), flush=True)
            while not stop.wait(0.25):
                if library._transport.process.poll() is not None:
                    raise ReviewError("REVIEW_PROCESS_ENDED", action="browser.wait")
            return {"event": "closed", "stateDirectory": str(library.state)}
    finally:
        for sig, handler in prior.items():
            signal.signal(sig, handler)
        # Do not delete a connection file someone else has replaced while running.
        if ready_path and raw is not None:
            try:
                if read(ready_path, 65536) == raw:
                    ready_path.unlink()
                    sync_directory(ready_path.parent)
            except (OSError, StateError):
                pass
