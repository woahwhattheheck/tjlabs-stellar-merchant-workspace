#!/usr/bin/env python3
"""Durable, tenant-routed Slack notices for actionable engineering jobs.

Python 3.11+ standard library. Import Outbox or use the CLI/loopback ingress.
The event envelope is this adapter's contract; map product job events into it.
"""
from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ACTION_STATES = {
    "clarification_required": ("Clarification required", "Provide clarification"),
    "execution_blocked": ("Execution needs attention", "Review the next step"),
    "qa_failed": ("QA needs attention", "Review the failed check"),
    "preview_ready": ("Preview ready", "Review the preview"),
    "approval_requested": ("Approval requested", "Review in the dashboard"),
}
ALL_STATES = set(ACTION_STATES) | {"quiet"}
FIELDS = {
    "event_id", "job_id", "store_id", "version", "state", "title",
    "reason", "review_url", "occurred_at",
}
ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$")
ENV = re.compile(r"^[A-Z][A-Z0-9_]{2,127}$")
SLACK_ID = re.compile(r"^[A-Z][A-Z0-9]{7,31}$")
SECRET = re.compile(
    r"(?i)(?:xox[baprs]-[A-Za-z0-9-]{10,}|hooks\.slack(?:-gov)?\.com/services/"
    r"|Bearer\s+\S{8,}|(?:password|api[_-]?key|access[_-]?token|secret)\s*[:=]\s*\S+)"
)
MAX_BODY = 32_768


class InputError(ValueError):
    pass


def compact(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def identifier(value, label):
    if not isinstance(value, str) or not ID.fullmatch(value):
        raise InputError(f"{label} must be a stable identifier of at most 160 characters")
    return value


def text_value(value, label, maximum, required=True):
    if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()):
        raise InputError(f"{label} must contain {'1' if required else '0'}–{maximum} characters")
    if any(ord(c) < 32 and c not in "\n\t" for c in value):
        raise InputError(f"{label} contains control characters")
    if SECRET.search(value):
        raise InputError(f"{label} must contain a short customer-safe summary")
    return value.strip()


def utc_epoch(value):
    if not isinstance(value, str):
        raise InputError("occurred_at must be an ISO 8601 timestamp with a timezone")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise InputError("occurred_at must be an ISO 8601 timestamp") from exc
    if parsed.tzinfo is None:
        raise InputError("occurred_at requires a timezone")
    return parsed.timestamp()


def safe_review_url(value, origins):
    if not isinstance(value, str) or len(value) > 1500:
        raise InputError("review_url must be an authenticated dashboard URL")
    p = urllib.parse.urlsplit(value)
    if p.scheme != "https" or not p.hostname or p.username or p.password or p.query or p.fragment:
        raise InputError("review_url must be HTTPS and contain no credentials, query, or fragment")
    try:
        port = p.port
    except ValueError as exc:
        raise InputError("review_url has an invalid port") from exc
    origin = f"https://{p.hostname.lower()}" + (f":{port}" if port and port != 443 else "")
    if origin not in origins:
        raise InputError("review_url origin is not configured for this tenant")
    if any(c.isspace() or ord(c) < 32 or c in "<>|" for c in value):
        raise InputError("review_url contains whitespace or message markup delimiters")
    return value


def load_config(path):
    config = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(config, dict) or config.get("version") != 1:
        raise InputError("config.version must be 1")
    if set(config) - {"version", "product_name", "tenants", "routes"}:
        raise InputError("config has unknown fields")
    config["product_name"] = text_value(config.get("product_name", "TaskerArmy"), "product_name", 60)
    tenants = config.get("tenants")
    routes = config.get("routes")
    if not isinstance(tenants, dict) or not isinstance(routes, list):
        raise InputError("config requires a tenants object and routes list")
    ingress_references = set()
    for tenant, value in tenants.items():
        identifier(tenant, "tenant_id")
        if not isinstance(value, dict) or set(value) - {"ingress_token_env", "review_origins"}:
            raise InputError(f"invalid tenant settings for {tenant}")
        key = value.get("ingress_token_env")
        if not isinstance(key, str) or not ENV.fullmatch(key):
            raise InputError(f"{tenant} needs an ingress_token_env reference")
        if key in ingress_references:
            raise InputError("each tenant requires a distinct ingress_token_env reference")
        ingress_references.add(key)
        origins = value.get("review_origins")
        if not isinstance(origins, list) or not origins:
            raise InputError(f"{tenant} needs at least one review origin")
        for origin in origins:
            p = urllib.parse.urlsplit(origin) if isinstance(origin, str) else None
            if not p or p.scheme != "https" or not p.hostname or p.username or p.password:
                raise InputError("review origins must be HTTPS origins")
            if p.path or p.query or p.fragment or origin.endswith(":443"):
                raise InputError("review origins must use the canonical origin without a slash")
    seen = set()
    for route in routes:
        allowed = {"id", "tenant_id", "store_ids", "states", "team_id", "channel_id",
                   "webhook_env", "generation", "enabled"}
        if not isinstance(route, dict) or set(route) - allowed:
            raise InputError("route has unknown fields")
        rid = identifier(route.get("id"), "route.id")
        if rid in seen:
            raise InputError(f"duplicate route id: {rid}")
        seen.add(rid)
        if route.get("tenant_id") not in tenants:
            raise InputError(f"route {rid} has no configured tenant")
        stores = route.get("store_ids")
        if not isinstance(stores, list) or not stores:
            raise InputError(f"route {rid} requires store_ids; use ['*'] for all stores")
        for store in stores:
            if store != "*":
                identifier(store, "store_id")
        if "*" in stores and len(stores) != 1:
            raise InputError("the all-stores selector cannot be mixed with store ids")
        states = route.get("states")
        if (not isinstance(states, list) or not states
                or any(not isinstance(s, str) or s not in ACTION_STATES for s in states)):
            raise InputError(f"route {rid} requires supported actionable states")
        for field in ("team_id", "channel_id"):
            if not isinstance(route.get(field), str) or not SLACK_ID.fullmatch(route[field]):
                raise InputError(f"route {rid} requires the Slack installation's {field}")
        if not isinstance(route.get("webhook_env"), str) or not ENV.fullmatch(route["webhook_env"]):
            raise InputError(f"route {rid} requires a webhook_env reference")
        if type(route.get("generation")) is not int or route["generation"] < 1:
            raise InputError(f"route {rid} requires a positive generation")
        if type(route.get("enabled")) is not bool:
            raise InputError(f"route {rid} requires enabled=true or false")
    return config


def route_fingerprint(route):
    return hashlib.sha256(compact(route).encode("utf-8")).hexdigest()


def validate_event(tenant_id, event, config, now):
    if tenant_id not in config["tenants"]:
        raise InputError("tenant is not configured")
    if not isinstance(event, dict) or set(event) - FIELDS:
        raise InputError("event contains unknown fields")
    required = FIELDS - {"reason"}
    if required - set(event):
        raise InputError("event is missing: " + ", ".join(sorted(required - set(event))))
    cleaned = dict(event)
    for key in ("event_id", "job_id", "store_id"):
        identifier(cleaned[key], key)
    if type(cleaned["version"]) is not int or not 1 <= cleaned["version"] <= 9_223_372_036_854_775_807:
        raise InputError("version must be the positive monotonically increasing job revision")
    if not isinstance(cleaned["state"], str) or cleaned["state"] not in ALL_STATES:
        raise InputError("state is not supported")
    cleaned["title"] = text_value(cleaned["title"], "title", 180)
    cleaned["reason"] = text_value(cleaned.get("reason", ""), "reason", 500, required=False)
    cleaned["review_url"] = safe_review_url(
        cleaned["review_url"], config["tenants"][tenant_id]["review_origins"]
    )
    occurred = utc_epoch(cleaned["occurred_at"])
    if occurred > now + 300:
        raise InputError("occurred_at is more than five minutes in the future")
    return cleaned, occurred


def slack_escape(value):
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def slack_payload(event, product_name):
    state = event["state"]
    if state not in ACTION_STATES:
        raise InputError("quiet events have no Slack payload")
    label, action = ACTION_STATES[state]
    summary = event["reason"] or action
    title = f"{product_name}: {label}"
    detail = f'{event["title"]}\nStore: {event["store_id"]}\n{summary}'
    return {
        "text": slack_escape(f'{title} — {event["title"]}. {summary} {event["review_url"]}'),
        "mrkdwn": False,
        "unfurl_links": False,
        "unfurl_media": False,
        "blocks": [
            {"type": "header", "text": {"type": "plain_text", "text": title, "emoji": False}},
            {"type": "section", "text": {"type": "plain_text", "text": detail, "emoji": False}},
            {"type": "context", "elements": [
                {"type": "plain_text",
                 "text": f'Job {event["job_id"]} · revision {event["version"]}',
                 "emoji": False}
            ]},
            {"type": "section", "text": {
                "type": "mrkdwn", "verbatim": True,
                "text": f'<{slack_escape(event["review_url"])}|{action}>'
            }},
        ],
    }


SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL);
INSERT INTO schema_version SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM schema_version);
CREATE TABLE IF NOT EXISTS events(
 tenant_id TEXT NOT NULL, event_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
 job_id TEXT NOT NULL, version INTEGER NOT NULL, received_at REAL NOT NULL,
 outcome TEXT NOT NULL, state TEXT NOT NULL, event_json TEXT NOT NULL,
 PRIMARY KEY(tenant_id,event_id), UNIQUE(tenant_id,job_id,version));
CREATE TABLE IF NOT EXISTS jobs(
 tenant_id TEXT NOT NULL, job_id TEXT NOT NULL, store_id TEXT NOT NULL,
 version INTEGER NOT NULL, event_id TEXT NOT NULL, state TEXT NOT NULL,
 updated_at REAL NOT NULL, PRIMARY KEY(tenant_id,job_id));
CREATE TABLE IF NOT EXISTS deliveries(
 id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, route_id TEXT NOT NULL,
 route_fingerprint TEXT NOT NULL, channel_key TEXT NOT NULL,
 event_id TEXT NOT NULL, job_id TEXT NOT NULL, version INTEGER NOT NULL,
 event_json TEXT NOT NULL, message_json TEXT NOT NULL, message_sha256 TEXT NOT NULL,
 status TEXT NOT NULL, due_at REAL NOT NULL,
 expires_at REAL NOT NULL, created_at REAL NOT NULL, updated_at REAL NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, lease_token TEXT, lease_until REAL,
 last_error TEXT, http_status INTEGER, sent_at REAL, resolution TEXT,
 UNIQUE(tenant_id,route_id,event_id));
CREATE INDEX IF NOT EXISTS due_deliveries ON deliveries(status,due_at);
CREATE TABLE IF NOT EXISTS channels(channel_key TEXT PRIMARY KEY, next_allowed REAL NOT NULL);
CREATE TABLE IF NOT EXISTS route_failures(
 route_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, reason TEXT NOT NULL,
 failed_at REAL NOT NULL);
"""


class Outbox:
    def __init__(self, database, config_path):
        self.database = str(database)
        self.config_path = str(config_path)
        self.config = load_config(config_path)
        path = Path(database)
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            try:
                fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            except FileExistsError:
                pass
            else:
                os.close(fd)
        with contextlib.closing(self.connect()) as db:
            db.executescript(SCHEMA)
            versions = [r[0] for r in db.execute("SELECT version FROM schema_version")]
            if versions != [1]:
                raise InputError("unsupported database schema version")

    def connect(self):
        db = sqlite3.connect(self.database, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=FULL")
        db.execute("PRAGMA busy_timeout=10000")
        return db

    @contextlib.contextmanager
    def transaction(self):
        db = self.connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def record(self, tenant_id, event, ttl_seconds=86400):
        if type(ttl_seconds) is not int or not 60 <= ttl_seconds <= 604800:
            raise InputError("ttl_seconds must be 60–604800")
        config = load_config(self.config_path)
        now = time.time()
        event, occurred = validate_event(tenant_id, event, config, now)
        payload = compact(event)
        digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        with self.transaction() as db:
            prior = db.execute(
                "SELECT payload_hash,outcome FROM events WHERE tenant_id=? AND event_id=?",
                (tenant_id, event["event_id"])).fetchone()
            if prior:
                if prior["payload_hash"] != digest:
                    raise InputError("event_id was already used for different content")
                return {"outcome": "duplicate", "original_outcome": prior["outcome"], "queued": 0}
            revision = db.execute(
                "SELECT event_id FROM events WHERE tenant_id=? AND job_id=? AND version=?",
                (tenant_id, event["job_id"], event["version"])).fetchone()
            if revision:
                raise InputError("job version was already used by a different event")
            current = db.execute(
                "SELECT * FROM jobs WHERE tenant_id=? AND job_id=?",
                (tenant_id, event["job_id"])).fetchone()
            if current and current["store_id"] != event["store_id"]:
                raise InputError("a job cannot move between stores")
            if current and event["version"] == current["version"]:
                raise InputError("job version was already used by a different event")
            stale = bool(current and event["version"] < current["version"])
            expired = occurred + ttl_seconds <= now
            outcome = "stale" if stale else ("expired" if expired else "recorded")
            db.execute("INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?)",
                       (tenant_id, event["event_id"], digest, event["job_id"],
                        event["version"], now, outcome, event["state"], payload))
            if stale:
                return {"outcome": outcome, "queued": 0}
            db.execute("""
                INSERT INTO jobs VALUES(?,?,?,?,?,?,?)
                ON CONFLICT(tenant_id,job_id) DO UPDATE SET
                 version=excluded.version,event_id=excluded.event_id,state=excluded.state,
                 updated_at=excluded.updated_at""",
                (tenant_id, event["job_id"], event["store_id"], event["version"],
                 event["event_id"], event["state"], now))
            db.execute("""UPDATE deliveries SET status='superseded',updated_at=?
                WHERE tenant_id=? AND job_id=? AND version<? AND status IN ('pending','failed')""",
                (now, tenant_id, event["job_id"], event["version"]))
            count = 0
            destinations = set()
            if not expired and event["state"] in ACTION_STATES:
                message = compact(slack_payload(event, config["product_name"]))
                message_sha = hashlib.sha256(message.encode("utf-8")).hexdigest()
                for route in config["routes"]:
                    if not route["enabled"] or route["tenant_id"] != tenant_id:
                        continue
                    if "*" not in route["store_ids"] and event["store_id"] not in route["store_ids"]:
                        continue
                    if event["state"] not in route["states"]:
                        continue
                    channel_key = route["team_id"] + ":" + route["channel_id"]
                    if channel_key in destinations:
                        continue
                    destinations.add(channel_key)
                    db.execute("""
                        INSERT INTO deliveries(tenant_id,route_id,route_fingerprint,channel_key,
                          event_id,job_id,version,event_json,message_json,message_sha256,
                          status,due_at,expires_at,created_at,updated_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,?)""",
                        (tenant_id, route["id"], route_fingerprint(route),
                         channel_key, event["event_id"],
                         event["job_id"], event["version"], payload, message, message_sha, now,
                         occurred + ttl_seconds, now, now))
                    count += 1
            return {"outcome": outcome, "queued": count}

    def _claim(self):
        config = load_config(self.config_path)
        routes = {r["id"]: r for r in config["routes"]}
        now = time.time()
        with self.transaction() as db:
            db.execute("""UPDATE deliveries SET status='uncertain',last_error='worker_interrupted',
                updated_at=? WHERE status='dispatching' AND lease_until<=?""", (now, now))
            db.execute("""UPDATE deliveries SET status='expired',updated_at=?
                WHERE status='pending' AND expires_at<=?""", (now, now))
            for failure in db.execute("SELECT route_id,fingerprint FROM route_failures").fetchall():
                current_route = routes.get(failure["route_id"])
                if (not current_route or not current_route["enabled"]
                        or route_fingerprint(current_route) != failure["fingerprint"]):
                    db.execute("DELETE FROM route_failures WHERE route_id=?", (failure["route_id"],))
            rows = db.execute("""SELECT d.* FROM deliveries d
                WHERE d.status='pending' AND d.due_at<=? AND NOT EXISTS (
                  SELECT 1 FROM route_failures f WHERE f.route_id=d.route_id
                    AND f.fingerprint=d.route_fingerprint)
                AND NOT EXISTS (SELECT 1 FROM channels c WHERE c.channel_key=d.channel_key
                    AND c.next_allowed>?)
                ORDER BY d.due_at,d.id LIMIT 200""",
                (now, now)).fetchall()
            for row in rows:
                route = routes.get(row["route_id"])
                if not route or not route["enabled"] or route_fingerprint(route) != row["route_fingerprint"]:
                    db.execute("UPDATE deliveries SET status='route_changed',updated_at=? WHERE id=?",
                               (now, row["id"]))
                    continue
                try:
                    retained_event = json.loads(row["event_json"])
                    safe_review_url(
                        retained_event["review_url"],
                        config["tenants"][row["tenant_id"]]["review_origins"],
                    )
                except InputError:
                    db.execute("UPDATE deliveries SET status='route_changed',"
                               "last_error='review_origin_changed',updated_at=? WHERE id=?",
                               (now, row["id"]))
                    continue
                latest = db.execute("SELECT version FROM jobs WHERE tenant_id=? AND job_id=?",
                                    (row["tenant_id"], row["job_id"])).fetchone()
                if not latest or latest["version"] != row["version"]:
                    db.execute("UPDATE deliveries SET status='superseded',updated_at=? WHERE id=?",
                               (now, row["id"]))
                    continue
                failure = db.execute("SELECT fingerprint FROM route_failures WHERE route_id=?",
                                     (route["id"],)).fetchone()
                if failure and failure["fingerprint"] == row["route_fingerprint"]:
                    continue
                throttle = db.execute("SELECT next_allowed FROM channels WHERE channel_key=?",
                                      (row["channel_key"],)).fetchone()
                if throttle and throttle["next_allowed"] > now:
                    db.execute("UPDATE deliveries SET due_at=? WHERE id=?",
                               (throttle["next_allowed"], row["id"]))
                    continue
                token = secrets.token_hex(16)
                db.execute("""UPDATE deliveries SET status='dispatching',attempts=attempts+1,
                    lease_token=?,lease_until=?,updated_at=? WHERE id=?""",
                    (token, now + 45, now, row["id"]))
                db.execute("""INSERT INTO channels VALUES(?,?)
                    ON CONFLICT(channel_key) DO UPDATE SET next_allowed=excluded.next_allowed""",
                    (row["channel_key"], now + 1.1))
                claimed = dict(row)
                claimed.update(lease_token=token, attempts=row["attempts"] + 1)
                return claimed, route
        return None

    def _finish(self, row, outcome, http_status=None, code=None, retry_after=None):
        now = time.time()
        due = now
        if outcome == "retry":
            due = now + (retry_after if retry_after is not None else min(3600, 30 * 2 ** min(row["attempts"], 7)))
            status = "failed" if row["attempts"] >= 8 and retry_after is None else "pending"
        else:
            status = outcome
        with self.transaction() as db:
            changed = db.execute("""UPDATE deliveries SET status=?,due_at=?,updated_at=?,
                last_error=?,http_status=?,sent_at=?,lease_token=NULL,lease_until=NULL
                WHERE id=? AND status='dispatching' AND lease_token=?""",
                (status, due, now, code, http_status, now if status == "sent" else None,
                 row["id"], row["lease_token"])).rowcount
            if changed != 1:
                raise RuntimeError("delivery lease was lost; inspect the retained delivery")
            if retry_after is not None:
                db.execute("""INSERT INTO channels VALUES(?,?) ON CONFLICT(channel_key)
                    DO UPDATE SET next_allowed=MAX(next_allowed,excluded.next_allowed)""",
                    (row["channel_key"], due))
            if outcome == "route_failed":
                db.execute("""INSERT INTO route_failures VALUES(?,?,?,?)
                    ON CONFLICT(route_id) DO UPDATE SET fingerprint=excluded.fingerprint,
                    reason=excluded.reason,failed_at=excluded.failed_at""",
                    (row["route_id"], row["route_fingerprint"], code or "route_failed", now))
        return {"delivery_id": row["id"], "status": status, "http_status": http_status, "error": code}

    def deliver_one(self):
        claim = self._claim()
        if claim is None:
            return None
        row, route = claim
        secret = os.environ.get(route["webhook_env"], "")
        try:
            p = urllib.parse.urlsplit(secret)
            valid = (p.scheme == "https" and p.hostname in {"hooks.slack.com", "hooks.slack-gov.com"}
                     and not p.username and not p.password and p.port in (None, 443)
                     and not p.query and not p.fragment
                     and re.fullmatch(r"/services/[A-Za-z0-9]+/[A-Za-z0-9]+/[A-Za-z0-9]+", p.path))
        except ValueError:
            valid = False
        if not valid:
            return self._finish(row, "route_failed", code="webhook_configuration")
        body = row["message_json"].encode("utf-8")
        if hashlib.sha256(body).hexdigest() != row["message_sha256"]:
            return self._finish(row, "failed", code="retained_message_digest_mismatch")
        request = urllib.request.Request(secret, data=body, method="POST",
                                         headers={"Content-Type": "application/json; charset=utf-8"})
        opener = urllib.request.build_opener(NoRedirect)
        try:
            with opener.open(request, timeout=12) as response:
                status = response.status
                answer = response.read(4096).decode("utf-8", errors="replace").strip()
        except urllib.error.HTTPError as exc:
            status = exc.code
            rejection = ""
            try:
                answer = exc.read(256).decode("utf-8", errors="replace").strip()
                if answer in {"invalid_payload", "user_not_found", "action_prohibited",
                              "channel_not_found", "channel_is_archived", "no_service",
                              "no_service_id", "no_team", "team_disabled", "invalid_token",
                              "no_active_hooks", "no_text", "posting_to_general_channel_denied",
                              "too_many_attachments"}:
                    rejection = answer
            except (OSError, TimeoutError):
                pass
            finally:
                exc.close()
            if status == 429:
                raw = exc.headers.get("Retry-After", "")
                retry = int(raw) if raw.isdecimal() else 60
                return self._finish(row, "retry", status, "rate_limited", max(1, retry))
            if 500 <= status < 600:
                return self._finish(row, "retry", status, "slack_server_error")
            if status in (400, 401, 403, 404, 410):
                return self._finish(row, "route_failed", status, rejection or "slack_rejected_route_or_payload")
            return self._finish(row, "failed", status, "unexpected_http_response")
        except (urllib.error.URLError, TimeoutError, OSError):
            return self._finish(row, "uncertain", code="transport_outcome_unknown")
        if status == 200 and answer == "ok":
            return self._finish(row, "sent", status)
        return self._finish(row, "uncertain", status, "unexpected_acknowledgement")

    def status(self, tenant=None, limit=100):
        with contextlib.closing(self.connect()) as db:
            where, args = ("WHERE tenant_id=?", [tenant]) if tenant else ("", [])
            counts = [dict(r) for r in db.execute(
                f"SELECT status,COUNT(*) AS count FROM deliveries {where} GROUP BY status", args)]
            rows = [dict(r) for r in db.execute(f"""SELECT id,tenant_id,route_id,event_id,job_id,
                version,channel_key,message_sha256,status,attempts,due_at,expires_at,
                updated_at,http_status,last_error,sent_at,resolution
                FROM deliveries {where} ORDER BY id DESC LIMIT ?""", [*args, min(max(limit, 1), 1000)])]
            route_ids = {r["id"] for r in load_config(self.config_path)["routes"]
                         if tenant is None or r["tenant_id"] == tenant}
            failures = [dict(r) for r in db.execute(
                "SELECT route_id,reason,failed_at FROM route_failures") if r["route_id"] in route_ids]
            return {"counts": counts, "deliveries": rows, "route_failures": failures}

    def inspect(self, delivery_id):
        with contextlib.closing(self.connect()) as db:
            row = db.execute("SELECT * FROM deliveries WHERE id=?", (delivery_id,)).fetchone()
            if row is None:
                raise InputError("delivery_id does not exist")
            result = dict(row)
            result["event"] = json.loads(result.pop("event_json"))
            result["message"] = json.loads(result.pop("message_json"))
            result.pop("lease_token", None)
            return result

    def job_timeline(self, tenant_id, job_id, before_version=None, limit=100):
        identifier(tenant_id, "tenant_id")
        identifier(job_id, "job_id")
        if tenant_id not in load_config(self.config_path)["tenants"]:
            raise InputError("tenant is not configured")
        if type(limit) is not int or not 1 <= limit <= 1000:
            raise InputError("limit must be 1–1000")
        if before_version is not None and (type(before_version) is not int or before_version < 1):
            raise InputError("before_version must be a positive revision")
        with contextlib.closing(self.connect()) as db:
            job = db.execute("SELECT * FROM jobs WHERE tenant_id=? AND job_id=?",
                             (tenant_id, job_id)).fetchone()
            args = [tenant_id, job_id]
            prior = ""
            if before_version is not None:
                prior = " AND version<?"
                args.append(before_version)
            events = [dict(r) for r in db.execute(
                "SELECT event_id,version,state,received_at,outcome,payload_hash FROM events "
                "WHERE tenant_id=? AND job_id=?" + prior + " ORDER BY version DESC LIMIT ?",
                [*args, limit + 1])]
            more = len(events) > limit
            events = events[:limit]
            for event in events:
                event["deliveries"] = [dict(r) for r in db.execute(
                    "SELECT id,route_id,channel_key,status,attempts,http_status,last_error,"
                    "sent_at,resolution,message_sha256 FROM deliveries "
                    "WHERE tenant_id=? AND event_id=? ORDER BY id",
                    (tenant_id, event["event_id"]))]
            return {"job": dict(job) if job else None, "events": events,
                    "next_before_version": events[-1]["version"] if more else None}

    def resume_route(self, route_id):
        route = next((r for r in load_config(self.config_path)["routes"] if r["id"] == route_id), None)
        if not route or not route["enabled"]:
            raise InputError("enable and correct the configured route before resuming it")
        fingerprint = route_fingerprint(route)
        with self.transaction() as db:
            db.execute("DELETE FROM route_failures WHERE route_id=?", (route_id,))
            updated = db.execute("""UPDATE deliveries SET status='pending',due_at=?,updated_at=?,
                last_error=NULL WHERE route_id=? AND route_fingerprint=? AND status='route_failed'""",
                (time.time(), time.time(), route_id, fingerprint)).rowcount
        return {"route_id": route_id, "resumed": updated}

    def resolve(self, delivery_id, outcome, note):
        if outcome not in {"sent", "retry", "cancelled"}:
            raise InputError("resolution must be sent, retry, or cancelled")
        note = text_value(note, "resolution note", 300)
        with self.transaction() as db:
            row = db.execute("SELECT * FROM deliveries WHERE id=?", (delivery_id,)).fetchone()
            if not row or row["status"] not in {"uncertain", "failed", "route_changed", "route_failed"}:
                raise InputError("only uncertain, failed, or changed-route deliveries can be resolved")
            if outcome == "retry":
                route = next((r for r in load_config(self.config_path)["routes"]
                              if r["id"] == row["route_id"]), None)
                if not route or route_fingerprint(route) != row["route_fingerprint"]:
                    raise InputError("retry requires the original route; ingest a new revision for a new destination")
            status = "pending" if outcome == "retry" else outcome
            db.execute("""UPDATE deliveries SET status=?,due_at=?,updated_at=?,resolution=?,
                attempts=CASE WHEN ?='pending' THEN 0 ELSE attempts END,
                sent_at=CASE WHEN ?='sent' THEN ? ELSE sent_at END WHERE id=?""",
                (status, time.time(), time.time(), note, status, status, time.time(), delivery_id))
        return {"delivery_id": delivery_id, "status": status}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def serve(outbox, host, port):
    class Handler(BaseHTTPRequestHandler):
        server_version = "JobNotice/1"
        def log_message(self, format, *args):
            return

        def reply(self, code, value):
            body = compact(value).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/healthz":
                self.reply(200, {"status": "ready"})
            else:
                self.reply(404, {"error": "not_found"})

        def do_POST(self):
            if self.path != "/v1/events":
                self.reply(404, {"error": "not_found"})
                return
            try:
                config = load_config(outbox.config_path)
                tenant = self.headers.get("X-Notification-Tenant", "")
                definition = config["tenants"].get(tenant)
                expected = os.environ.get(definition["ingress_token_env"], "") if definition else ""
                supplied = self.headers.get("Authorization", "")
                if len(expected) < 32 or not hmac.compare_digest(supplied, "Bearer " + expected):
                    self.reply(401, {"error": "invalid_ingress_authorization"})
                    return
                if self.headers.get("Transfer-Encoding") is not None:
                    raise InputError("chunked request bodies are not supported")
                if self.headers.get_content_type() != "application/json":
                    self.reply(415, {"error": "application_json_required"})
                    return
                raw_length = self.headers.get("Content-Length", "")
                if not raw_length.isdecimal() or not 1 <= int(raw_length) <= MAX_BODY:
                    self.reply(413, {"error": "request_body_limit", "limit_bytes": MAX_BODY})
                    return
                self.connection.settimeout(10)
                raw = self.rfile.read(int(raw_length))
                if len(raw) != int(raw_length):
                    raise InputError("request body is incomplete")
                result = outbox.record(tenant, json.loads(raw.decode("utf-8")))
                self.reply(202, result)
            except (InputError, ValueError, UnicodeError) as exc:
                self.reply(400, {"error": "invalid_event", "detail": str(exc)[:300]})
            except (sqlite3.Error, OSError):
                self.reply(503, {"error": "ingress_unavailable_retry_same_event_id"})
    ThreadingHTTPServer((host, port), Handler).serve_forever()


def read_event(path):
    return json.loads(sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8"))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="state/notices.sqlite3")
    parser.add_argument("--config", default="notices.json")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init", help="Create an empty private configuration and database")
    p = sub.add_parser("ingest", help="Record one real product job revision")
    p.add_argument("--tenant", required=True)
    p.add_argument("--event", required=True, help="UTF-8 JSON path or - for stdin")
    p = sub.add_parser("render", help="Render a real event as a Slack JSON message")
    p.add_argument("--tenant", required=True)
    p.add_argument("--event", required=True)
    p = sub.add_parser("deliver", help="Deliver currently due notifications")
    p.add_argument("--limit", type=int, default=100)
    p = sub.add_parser("run", help="Run the delivery worker continuously")
    p.add_argument("--interval", type=float, default=2.0)
    p = sub.add_parser("status", help="Inspect saved delivery outcomes")
    p.add_argument("--tenant")
    p.add_argument("--limit", type=int, default=100)
    p = sub.add_parser("timeline", help="Read a job revision history and its delivery outcomes")
    p.add_argument("--tenant", required=True)
    p.add_argument("--job", required=True)
    p.add_argument("--before-version", type=int)
    p.add_argument("--limit", type=int, default=100)
    p = sub.add_parser("inspect", help="Read one retained event, exact message and destination")
    p.add_argument("delivery_id", type=int)
    p = sub.add_parser("resume-route", help="Resume delivery after correcting Slack installation settings")
    p.add_argument("route_id")
    p = sub.add_parser("resolve", help="Reconcile an uncertain or failed delivery using its actual outcome")
    p.add_argument("delivery_id", type=int)
    p.add_argument("outcome", choices=["sent", "retry", "cancelled"])
    p.add_argument("--note", required=True)
    p = sub.add_parser("serve", help="Run authenticated loopback event ingress")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8094)
    args = parser.parse_args(argv)
    if args.command == "init":
        config_path = Path(args.config)
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with os.fdopen(os.open(config_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "w", encoding="utf-8") as f:
            f.write(json.dumps({"version": 1, "product_name": "TaskerArmy", "tenants": {}, "routes": []}, indent=2) + "\n")
    outbox = Outbox(args.db, args.config)
    if args.command == "init":
        result = {"database": args.db, "config": args.config, "status": "initialized"}
    elif args.command in {"ingest", "render"}:
        event = read_event(args.event)
        if args.command == "ingest":
            result = outbox.record(args.tenant, event)
        else:
            event, _ = validate_event(args.tenant, event, outbox.config, time.time())
            result = slack_payload(event, outbox.config["product_name"])
    elif args.command == "status":
        result = outbox.status(args.tenant, args.limit)
    elif args.command == "timeline":
        result = outbox.job_timeline(args.tenant, args.job, args.before_version, args.limit)
    elif args.command == "inspect":
        result = outbox.inspect(args.delivery_id)
    elif args.command == "resolve":
        result = outbox.resolve(args.delivery_id, args.outcome, args.note)
    elif args.command == "resume-route":
        result = outbox.resume_route(args.route_id)
    elif args.command == "serve":
        serve(outbox, args.host, args.port)
        return 0
    elif args.command == "run":
        if not 0.1 <= args.interval <= 60:
            raise InputError("interval must be 0.1–60 seconds")
        while True:
            result = outbox.deliver_one()
            if result is not None:
                print(compact(result), flush=True)
            else:
                time.sleep(args.interval)
    else:
        if not 1 <= args.limit <= 1000:
            raise InputError("limit must be 1–1000")
        result = []
        for _ in range(args.limit):
            item = outbox.deliver_one()
            if item is None:
                break
            result.append(item)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except (InputError, FileExistsError, json.JSONDecodeError) as exc:
        print(compact({"error": str(exc)}), file=sys.stderr)
        raise SystemExit(2)
