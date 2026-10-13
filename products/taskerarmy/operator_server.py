#!/usr/bin/env python3
"""Local operator console for the maintained TaskerArmy notification outbox."""
from __future__ import annotations

import argparse
import base64
import contextlib
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

from notification_outbox import Outbox, InputError, load_config

MAX_BODY = 256 * 1024
MATERIAL_ROUTE_FIELDS = ("tenant_id", "store_ids", "states", "team_id",
                         "channel_id", "webhook_env")
RESOLVABLE = {"uncertain", "failed", "route_changed", "route_failed"}


class OperatorError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code = status, code


def revision(raw):
    return hashlib.sha256(raw).hexdigest()


def exact_fields(value, allowed, label):
    if not isinstance(value, dict):
        raise InputError(label + " must be an object")
    unexpected = set(value) - set(allowed)
    if unexpected:
        raise InputError(label + " contains unsupported fields: " +
                         ", ".join(sorted(unexpected)))


def checked_document(config):
    exact_fields(config, {"version", "product_name", "tenants", "routes"},
                 "Configuration")
    tenants, routes = config.get("tenants"), config.get("routes")
    if not isinstance(tenants, dict) or not isinstance(routes, list):
        raise InputError("Configuration requires tenants and routes")
    for tenant_id, tenant in tenants.items():
        exact_fields(tenant, {"ingress_token_env", "review_origins"},
                     "Tenant " + str(tenant_id))
    for route in routes:
        exact_fields(route, {"id", *MATERIAL_ROUTE_FIELDS, "generation", "enabled"},
                     "Route")
    return config


def read_configuration(path):
    # Validate the same exact snapshot whose hash is returned. The loader reads
    # a temporary private file so an atomic concurrent replacement cannot make
    # the returned document and preimage refer to different revisions.
    raw = path.read_bytes()
    config = checked_document(json.loads(raw))
    fd, name = tempfile.mkstemp(prefix=".operator-read-", suffix=".json",
                                dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(raw)
        load_config(name)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(name)
    return config, revision(raw)


def save_configuration(path, expected, incoming):
    if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise InputError("Supply the configuration revision you opened")
    checked_document(incoming)
    encoded = (json.dumps(incoming, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if len(encoded) > MAX_BODY:
        raise InputError("Configuration is too large")
    # Cooperating operator writers share the lock; manual edits are composed
    # using the current revision. os.replace gives readers a complete document.
    lock_path = path.with_name(path.name + ".operator.lock")
    with open(lock_path, "a+b") as lock:
        os.chmod(lock_path, 0o600)
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        before = path.read_bytes()
        if not hmac.compare_digest(revision(before), expected):
            raise OperatorError(409, "configuration_changed",
                                "Configuration changed. Reload it and compose your edit.")
        previous = checked_document(json.loads(before))
        old_routes = {row["id"]: row for row in previous["routes"]}
        for route in incoming["routes"]:
            old = old_routes.get(route.get("id"))
            generation = route.get("generation")
            if old and (type(generation) is not int or generation < old["generation"]):
                raise InputError("Route generation cannot decrease: " +
                                 str(route.get("id")))
            if old and any(old.get(key) != route.get(key)
                           for key in MATERIAL_ROUTE_FIELDS):
                if (not isinstance(generation, int) or isinstance(generation, bool)
                        or generation <= old.get("generation", 0)):
                    raise InputError("Changed routing requires a higher generation: " +
                                     str(route.get("id")))
        fd, name = tempfile.mkstemp(prefix=".operator-write-", suffix=".json",
                                    dir=path.parent)
        try:
            with os.fdopen(fd, "wb") as output:
                output.write(encoded)
                output.flush()
                os.fsync(output.fileno())
            load_config(name)
            # A second preimage read catches a noncooperating editor that wrote
            # while validation ran. Deployment tools should use this API/lock.
            if path.read_bytes() != before:
                raise OperatorError(409, "configuration_changed",
                                    "Configuration changed during validation. Reload it.")
            os.chmod(name, 0o600)
            os.replace(name, path)
            directory = os.open(str(path.parent), os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            with contextlib.suppress(FileNotFoundError):
                os.unlink(name)
    return revision(encoded)


def public_configuration(path):
    config, current = read_configuration(path)
    return {
        "configuration": config,
        "revision": current,
        "credentials": {
            "tenants": {key: bool(os.environ.get(row["ingress_token_env"]))
                        for key, row in config["tenants"].items()},
            "routes": {row["id"]: bool(os.environ.get(row["webhook_env"]))
                       for row in config["routes"]},
        },
    }


def safe_delivery(row):
    if not isinstance(row, dict):
        raise OperatorError(404, "delivery_not_found", "Delivery was not found")
    fields = (
        "id", "tenant_id", "route_id", "event_id", "job_id", "store_id", "version",
        "channel_key", "message_sha256", "status", "attempts", "due_at",
        "expires_at", "updated_at", "http_status", "last_error", "sent_at",
        "resolution", "event", "message",
    )
    result = {key: row[key] for key in fields if key in row}
    result["can_resolve"] = row.get("status") in RESOLVABLE
    return result


def scalar(query, key, default=None):
    rows = query.get(key)
    if rows is None:
        return default
    if len(rows) != 1:
        raise InputError("Supply one " + key)
    return rows[0]


def integer(value, label, minimum=1, maximum=1000):
    if not isinstance(value, str) or not re.fullmatch(r"\d+", value):
        raise InputError(label + " must be an integer")
    parsed = int(value)
    if parsed < minimum or parsed > maximum:
        raise InputError(label + " is outside the supported range")
    return parsed


def identifier(value, label):
    if not isinstance(value, str) or not value.strip() or len(value) > 256:
        raise InputError(label + " is required")
    if any(ord(char) < 32 for char in value):
        raise InputError(label + " contains control characters")
    return value



def delivery_key(value):
    if type(value) is int:
        number = value
    elif isinstance(value, str) and re.fullmatch(r"\d+", value):
        number = int(value)
    else:
        raise InputError("delivery_id must be the saved numeric delivery identifier")
    if not 1 <= number <= 2**63 - 1:
        raise InputError("delivery_id is outside the saved identifier range")
    return number


def browser_record(value, field=None):
    # Python/SQLite revisions remain exact when a browser follows a cursor.
    if isinstance(value, dict):
        return {key: browser_record(item, key) for key, item in value.items()}
    if isinstance(value, list):
        return [browser_record(item) for item in value]
    if type(value) is int and field in {"id", "delivery_id", "version", "next_before_version"}:
        return str(value)
    return value


class OperatorServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, port, database, config, token, html):
        super().__init__(("127.0.0.1", port), OperatorHandler)
        self.database, self.config, self.token, self.html = database, config, token, html
        self._outbox = Outbox(str(database), str(config))
        self.origin = "http://127.0.0.1:" + str(self.server_port)
        hashes = []
        for tag in ("script", "style"):
            for source in re.findall(r"<" + tag + r"(?:\s[^>]*)?>(.*?)</" + tag + ">",
                                     html.decode("utf-8"), re.S | re.I):
                digest = base64.b64encode(hashlib.sha256(source.encode("utf-8")).digest()).decode()
                hashes.append((tag, "'sha256-" + digest + "'"))
        scripts = " ".join(value for kind, value in hashes if kind == "script")
        styles = " ".join(value for kind, value in hashes if kind == "style")
        self.csp = ("default-src 'none'; script-src " + scripts +
                    "; style-src " + styles + "; connect-src 'self'; img-src data:;"
                    " base-uri 'none'; frame-ancestors 'none'; form-action 'self'")

    def outbox(self):
        return self._outbox


class OperatorHandler(BaseHTTPRequestHandler):
    server_version = "TaskerArmyOperator/1"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def log_message(self, _format, *_args):
        # Request URLs and authorization material never enter access logs.
        pass

    def respond(self, status, payload, content_type="application/json; charset=utf-8"):
        raw = payload if isinstance(payload, bytes) else json.dumps(
            payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", self.server.csp)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def boundary(self, authenticated=True):
        hosts = self.headers.get_all("Host") or []
        if hosts != [urlsplit(self.server.origin).netloc]:
            raise OperatorError(403, "unexpected_host", "Open the printed local console URL")
        origins = self.headers.get_all("Origin") or []
        if origins and origins != [self.server.origin]:
            raise OperatorError(403, "unexpected_origin", "Use the local operator console")
        if authenticated:
            values = self.headers.get_all("Authorization") or []
            wanted = "Bearer " + self.server.token
            if len(values) != 1 or not hmac.compare_digest(values[0], wanted):
                raise OperatorError(401, "authentication_required",
                                    "Open the console link printed by the operator process")

    def body(self):
        if self.headers.get("Transfer-Encoding") is not None:
            raise InputError("Chunked request bodies are not supported")
        lengths = self.headers.get_all("Content-Length") or []
        if len(lengths) != 1:
            raise InputError("Supply one Content-Length")
        length = integer(lengths[0], "Content-Length", maximum=MAX_BODY)
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            raise InputError("Use an application/json request body")
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise InputError("Request body was incomplete")
        result = json.loads(raw.decode("utf-8"))
        if not isinstance(result, dict):
            raise InputError("Request body must be an object")
        return result

    def tenant(self, value, optional=False):
        if optional and not value:
            return None
        value = identifier(value, "tenant_id")
        config = load_config(str(self.server.config))
        if value not in config["tenants"]:
            raise OperatorError(404, "tenant_not_found", "Tenant is not in the current configuration")
        return value

    def dispatch(self):
        parsed = urlsplit(self.path)
        if parsed.scheme or parsed.netloc:
            raise InputError("Use an origin-relative request")
        path, query = parsed.path, parse_qs(parsed.query, keep_blank_values=True)
        if self.command == "GET" and path in ("/", "/healthz"):
            self.boundary(authenticated=False)
            if path == "/":
                return self.respond(200, self.server.html, "text/html; charset=utf-8")
            return self.respond(200, {"service": "taskerarmy-notification-operator", "status": "ready"})
        self.boundary()
        outbox = self.server.outbox()
        if self.command == "GET":
            if path == "/api/config":
                return self.respond(200, public_configuration(self.server.config))
            if path == "/api/status":
                tenant = self.tenant(scalar(query, "tenant_id"), optional=True)
                limit = integer(scalar(query, "limit", "200"), "limit", maximum=1000)
                return self.respond(200, browser_record(outbox.status(tenant, limit=limit)))
            if path.startswith("/api/deliveries/"):
                key = delivery_key(unquote(path.removeprefix("/api/deliveries/")))
                row = safe_delivery(outbox.inspect(key))
                self.tenant(row.get("tenant_id"))
                return self.respond(200, browser_record(row))
            if path == "/api/jobs":
                tenant = self.tenant(scalar(query, "tenant_id"))
                job = identifier(scalar(query, "job_id"), "job_id")
                before = scalar(query, "before_version")
                before = None if before is None else integer(before, "before_version",
                                                               minimum=1, maximum=2**63-1)
                limit = integer(scalar(query, "limit", "50"), "limit", maximum=100)
                return self.respond(200, browser_record(outbox.job_timeline(tenant, job, before_version=before,
                                                                           limit=limit)))
        if self.command == "POST":
            data = self.body()
            if path == "/api/config":
                exact_fields(data, {"expected_revision", "configuration"}, "Configuration request")
                saved = save_configuration(self.server.config, data.get("expected_revision"),
                                           data.get("configuration"))
                return self.respond(200, {"revision": saved, **public_configuration(self.server.config)})
            if path == "/api/resolve":
                exact_fields(data, {"delivery_id", "resolution", "note"}, "Resolution request")
                key = delivery_key(data.get("delivery_id"))
                row = safe_delivery(outbox.inspect(key))
                self.tenant(row.get("tenant_id"))
                note = data.get("note")
                if not isinstance(note, str) or len(note.strip()) < 8 or len(note) > 300:
                    raise InputError("Record a clear resolution note of 8 to 300 characters")
                if data.get("resolution") not in {"sent", "retry", "cancelled"}:
                    raise InputError("Choose sent, retry or cancelled")
                return self.respond(200, browser_record(outbox.resolve(key, data["resolution"], note.strip())))
            if path == "/api/resume-route":
                exact_fields(data, {"route_id"}, "Resume request")
                key = identifier(data.get("route_id"), "route_id")
                config = load_config(str(self.server.config))
                route = next((row for row in config["routes"] if row["id"] == key), None)
                if route is None:
                    raise OperatorError(404, "route_not_found", "Route is not in the current configuration")
                self.tenant(route["tenant_id"])
                return self.respond(200, outbox.resume_route(key))
        raise OperatorError(404, "not_found", "This operator route is not available")

    def handle_request(self):
        try:
            self.dispatch()
        except OperatorError as error:
            self.respond(error.status, {"error": error.code, "message": str(error)})
        except (InputError, ValueError, KeyError, TypeError) as error:
            self.respond(400, {"error": "invalid_request", "message": str(error)[:500]})
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            return
        except Exception:
            self.respond(500, {"error": "operator_error",
                               "message": "The operator could not complete this request. Check its configuration and database."})

    do_GET = handle_request
    do_POST = handle_request

    def do_OPTIONS(self):
        self.respond(405, {"error": "method_not_allowed"})


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, help="The worker's existing SQLite database")
    parser.add_argument("--config", required=True, help="The worker's existing JSON configuration")
    parser.add_argument("--port", type=int, default=8095)
    parser.add_argument("--token-env", default="TASKER_OPERATOR_TOKEN",
                        help="Environment variable holding an optional operator token")
    args = parser.parse_args(argv)
    if not 0 <= args.port <= 65535:
        parser.error("port must be between 0 and 65535")
    database, config = Path(args.database).resolve(), Path(args.config).resolve()
    load_config(str(config))
    token = os.environ.get(args.token_env) or secrets.token_urlsafe(32)
    if len(token) < 32 or not re.fullmatch(r"[A-Za-z0-9_-]+", token):
        parser.error("operator token must be at least 32 URL-safe characters")
    html = Path(__file__).with_name("operator.html").read_bytes()
    server = OperatorServer(args.port, database, config, token, html)
    print("TaskerArmy notification operator is ready on loopback.", flush=True)
    print("Open locally: " + server.origin + "/#token=" + token, flush=True)
    print("The worker continues delivery in its existing process. Ctrl-C closes this console.", flush=True)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
