"""Private SQLite receiving, immutable page history, cursor editions and local replay."""
from __future__ import annotations

import contextlib
import fcntl
import os
from pathlib import Path
import sqlite3
from typing import Any, Iterator
from urllib.parse import urlencode
import uuid

from .model import (
    API_BASE, CONTRACT, WorkspaceError, api_base, decode, digest, encode,
    error_details, integer, now, project, ticker, validate_page,
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS editions(
 id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL UNIQUE, created TEXT NOT NULL,
 completed TEXT, state TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0,
 has_more INTEGER NOT NULL DEFAULT 1, needs_reconcile INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS runs(
 id TEXT PRIMARY KEY, edition TEXT NOT NULL REFERENCES editions(id),
 created TEXT NOT NULL, finished TEXT, state TEXT NOT NULL, request_limit INTEGER NOT NULL,
 amount_limit TEXT NOT NULL, page_amount_limit TEXT NOT NULL,
 reserved_amount TEXT NOT NULL DEFAULT '0', options TEXT NOT NULL, error TEXT);
CREATE TABLE IF NOT EXISTS attempts(
 id TEXT PRIMARY KEY, run TEXT NOT NULL REFERENCES runs(id), edition TEXT NOT NULL REFERENCES editions(id),
 ordinal INTEGER NOT NULL, created TEXT NOT NULL, finished TEXT, state TEXT NOT NULL,
 since_cursor INTEGER NOT NULL, url TEXT NOT NULL, response TEXT, payment_amount TEXT,
 payment_requirements TEXT, payment_challenge TEXT, error TEXT, UNIQUE(run,ordinal));
CREATE TABLE IF NOT EXISTS responses(
 id TEXT PRIMARY KEY, attempt TEXT REFERENCES attempts(id), ordinal INTEGER NOT NULL,
 created TEXT NOT NULL, url TEXT NOT NULL, status INTEGER NOT NULL, headers TEXT NOT NULL,
 complete INTEGER NOT NULL DEFAULT 0, length INTEGER NOT NULL DEFAULT 0, sha256 TEXT,
 purpose TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chunks(
 response TEXT NOT NULL REFERENCES responses(id), ordinal INTEGER NOT NULL,
 body BLOB NOT NULL, PRIMARY KEY(response,ordinal));
CREATE TABLE IF NOT EXISTS events(
 edition TEXT NOT NULL REFERENCES editions(id), event_id INTEGER NOT NULL,
 catalyst_id INTEGER NOT NULL, attempt TEXT NOT NULL REFERENCES attempts(id),
 value TEXT NOT NULL, PRIMARY KEY(edition,event_id));
CREATE INDEX IF NOT EXISTS event_catalysts ON events(edition,catalyst_id,event_id);
CREATE TABLE IF NOT EXISTS watchlists(
 revision INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT NOT NULL, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS history(
 ordinal INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT NOT NULL, action TEXT NOT NULL, value TEXT NOT NULL);
"""


class Workspace:
    def __init__(self, directory: str | Path, *, create: bool = False,
                 name: str = "Biotech event monitor", base: str = API_BASE,
                 server_ticker: str | None = None, limit: int = 100,
                 preview: bool = False, allow_loopback: bool = False) -> None:
        self.root = Path(directory).expanduser().resolve()
        self.path = self.root / "workspace.sqlite3"
        if create:
            self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        if not self.path.exists() and not create:
            raise WorkspaceError("WORKSPACE_NOT_FOUND", "Open an existing workspace or create one with init.")
        existed = self.path.exists()
        if preview and server_ticker:
            raise WorkspaceError("PREVIEW_FILTER", "The public preview uses an unfiltered workspace.")
        if self.path.is_symlink():
            raise WorkspaceError("WORKSPACE_LINK", "The database must be an ordinary private file.")
        with self._db() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if existed and version != 1:
                raise WorkspaceError("WORKSPACE_VERSION", "This database is not a supported event workspace.")
            if not existed:
                if not create:
                    raise WorkspaceError("WORKSPACE_NOT_FOUND", "The workspace database is missing.")
                db.executescript(SCHEMA)
                config = {
                    "schema": "revecs.events.workspace.v1", "id": uuid.uuid4().hex,
                    "name": self._name(name), "base": api_base(base, allow_loopback=allow_loopback),
                    "ticker": ticker(server_ticker), "limit": integer(limit, "limit", 1, 500),
                    "mode": "preview" if preview else "live", "contract": CONTRACT, "created": now(),
                }
                db.execute("INSERT INTO settings VALUES('configuration',?)", (encode(config),))
                db.execute("INSERT INTO watchlists(created,value) VALUES(?,?)", (now(), "[]"))
                db.execute("PRAGMA user_version=1")
        os.chmod(self.path, 0o600)
        self.configuration = self.setting("configuration")
        if self.configuration.get("schema") != "revecs.events.workspace.v1":
            raise WorkspaceError("WORKSPACE_VERSION", "The stored workspace configuration is unsupported.")

    @staticmethod
    def _name(value: str) -> str:
        if not isinstance(value, str) or not value.strip() or len(value.strip()) > 120:
            raise WorkspaceError("INVALID_NAME", "Use a workspace name of 1–120 characters.")
        return value.strip()

    @contextlib.contextmanager
    def _db(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=15, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA synchronous=FULL")
        try:
            yield db
        finally:
            db.close()

    @contextlib.contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        with self._db() as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                yield db
                db.execute("COMMIT")
            except BaseException:
                db.execute("ROLLBACK")
                raise

    @contextlib.contextmanager
    def receiving(self) -> Iterator[None]:
        """Hold one kernel-owned receiving lease; reads and complete backups remain available."""
        fd = os.open(self.root / ".receiving.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise WorkspaceError("RECEIVER_ACTIVE", "This workspace already has an active receiver.") from error
            yield
        finally:
            os.close(fd)

    def setting(self, key: str) -> Any:
        with self._db() as db:
            row = db.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return decode(row["value"].encode()) if row else None

    def rename(self, name: str) -> None:
        with self._tx() as db:
            config = decode(db.execute("SELECT value FROM settings WHERE key='configuration'").fetchone()[0].encode())
            config["name"] = self._name(name)
            db.execute("UPDATE settings SET value=? WHERE key='configuration'", (encode(config),))
            db.execute("INSERT INTO history(created,action,value) VALUES(?,?,?)", (now(), "name", encode(config["name"])))
        self.configuration = config

    def watchlist(self) -> list[str]:
        with self._db() as db:
            row = db.execute("SELECT value FROM watchlists ORDER BY revision DESC LIMIT 1").fetchone()
        return decode(row["value"].encode())

    def set_watchlist(self, values: list[str]) -> list[str]:
        if not isinstance(values, list) or len(values) > 1000:
            raise WorkspaceError("INVALID_WATCHLIST", "Provide a list of at most 1,000 tickers.")
        selected = sorted({v for entry in values if (v := ticker(entry))})
        with self._tx() as db:
            previous = db.execute("SELECT value FROM watchlists ORDER BY revision DESC LIMIT 1").fetchone()[0]
            if previous != encode(selected):
                db.execute("INSERT INTO watchlists(created,value) VALUES(?,?)", (now(), encode(selected)))
        return selected

    def editions(self) -> list[dict[str, Any]]:
        with self._db() as db:
            return [dict(r) for r in db.execute("SELECT * FROM editions ORDER BY ordinal DESC")]

    def select_edition(self, refresh: bool = False) -> str:
        with self._tx() as db:
            rows = db.execute("SELECT * FROM editions ORDER BY ordinal DESC").fetchall()
            pending = next((r for r in rows if r["state"] == "receiving"), None)
            current = next((r for r in rows if r["state"] == "current"), None)
            if pending:
                return pending["id"]
            if current and not refresh:
                return current["id"]
            ident = uuid.uuid4().hex
            db.execute("INSERT INTO editions(id,ordinal,created,state) VALUES(?,?,?,'receiving')",
                       (ident, 1 + max((r["ordinal"] for r in rows), default=0), now()))
            return ident

    def request_url(self, since: int) -> str:
        params = {"since": since, "limit": self.configuration["limit"]}
        if self.configuration["ticker"]:
            params["ticker"] = self.configuration["ticker"]
        return self.configuration["base"] + "/v1/events?" + urlencode(params)

    def start_run(self, key: str, *, max_pages: int, max_amount: int, max_page_amount: int,
                  refresh: bool = False) -> tuple[dict[str, Any], bool]:
        if not isinstance(key, str) or not key.strip() or len(key) > 160:
            raise WorkspaceError("INVALID_OPERATION_KEY", "Use a stable operation key of 1–160 characters.")
        integer(max_pages, "max_pages", 1, 100000)
        if type(refresh) is not bool:
            raise WorkspaceError("INVALID_REFRESH", "History reconciliation must be a boolean.")
        integer(max_amount, "max_amount", 0)
        integer(max_page_amount, "max_page_amount", 0)
        options = encode({"max_pages": max_pages, "max_amount": str(max_amount),
                          "max_page_amount": str(max_page_amount), "refresh": refresh})
        with self._db() as db:
            existing = db.execute("SELECT * FROM runs WHERE id=?", (key,)).fetchone()
        if existing:
            if existing["options"] != options:
                raise WorkspaceError("OPERATION_CHANGED", "This operation key already names a different receiving request.")
            return dict(existing), False
        edition = self.select_edition(refresh)
        with self._tx() as db:
            # The kernel receiving lease is held by callers. An older running row
            # represents an exited receiver and remains part of the complete history.
            db.execute("UPDATE runs SET state='interrupted',finished=? WHERE state='running'", (now(),))
            db.execute("UPDATE attempts SET state='interrupted',finished=? WHERE state='dispatched'", (now(),))
            db.execute("""INSERT INTO runs(id,edition,created,state,request_limit,amount_limit,page_amount_limit,options)
                       VALUES(?,?,?,'running',?,?,?,?)""",
                       (key, edition, now(), max_pages, str(max_amount), str(max_page_amount), options))
            return dict(db.execute("SELECT * FROM runs WHERE id=?", (key,)).fetchone()), True

    def run(self, key: str) -> dict[str, Any]:
        with self._db() as db:
            row = db.execute("SELECT * FROM runs WHERE id=?", (key,)).fetchone()
        if not row:
            raise WorkspaceError("RUN_NOT_FOUND", "The receiving operation is not present.")
        result = dict(row)
        if result["error"]:
            result["error"] = decode(result["error"].encode())
        return result

    def prepare_attempt(self, run_key: str) -> dict[str, Any]:
        with self._tx() as db:
            run = db.execute("SELECT * FROM runs WHERE id=?", (run_key,)).fetchone()
            if not run or run["state"] != "running":
                raise WorkspaceError("RUN_CLOSED", "This receiving operation has finished.")
            count = db.execute("SELECT COUNT(*) FROM attempts WHERE run=?", (run_key,)).fetchone()[0]
            if count >= run["request_limit"]:
                raise WorkspaceError("PAGE_LIMIT", "The authorized request count has been used.")
            edition = db.execute("SELECT * FROM editions WHERE id=?", (run["edition"],)).fetchone()
            ident = uuid.uuid4().hex
            url = self.request_url(edition["cursor"])
            db.execute("""INSERT INTO attempts(id,run,edition,ordinal,created,state,since_cursor,url)
                          VALUES(?,?,?,?,?,'dispatched',?,?)""",
                       (ident, run_key, run["edition"], count + 1, now(), edition["cursor"], url))
            return dict(db.execute("SELECT * FROM attempts WHERE id=?", (ident,)).fetchone())

    def authorize(self, attempt_id: str, requirements: dict[str, Any], challenge: dict[str, Any]) -> None:
        amount = int(requirements["amount"])
        if amount < 0:
            raise WorkspaceError("PAYMENT_AMOUNT", "The payment amount must be nonnegative.")
        with self._tx() as db:
            attempt = db.execute("SELECT * FROM attempts WHERE id=?", (attempt_id,)).fetchone()
            run = db.execute("SELECT * FROM runs WHERE id=?", (attempt["run"],)).fetchone()
            if attempt["state"] != "dispatched" or attempt["payment_amount"] is not None:
                raise WorkspaceError("PAYMENT_ALREADY_AUTHORIZED", "A payment was already prepared for this request.")
            if amount > int(run["page_amount_limit"]) or int(run["reserved_amount"]) + amount > int(run["amount_limit"]):
                raise WorkspaceError("PAYMENT_LIMIT", "The current challenge exceeds this operation's authorized amount.")
            db.execute("UPDATE runs SET reserved_amount=? WHERE id=?",
                       (str(int(run["reserved_amount"]) + amount), run["id"]))
            db.execute("""UPDATE attempts SET payment_amount=?,payment_requirements=?,payment_challenge=? WHERE id=?""",
                       (str(amount), encode(requirements), encode(challenge), attempt_id))

    def begin_response(self, attempt_id: str | None, *, url: str, status: int,
                       headers: dict[str, str], purpose: str = "events") -> str:
        ident = uuid.uuid4().hex
        with self._tx() as db:
            count = db.execute("SELECT COUNT(*) FROM responses WHERE attempt IS ?", (attempt_id,)).fetchone()[0]
            db.execute("""INSERT INTO responses(id,attempt,ordinal,created,url,status,headers,purpose)
                          VALUES(?,?,?,?,?,?,?,?)""",
                       (ident, attempt_id, count + 1, now(), url, int(status), encode(dict(headers)), purpose))
        return ident

    def append(self, response_id: str, body: bytes) -> None:
        if not body:
            return
        with self._tx() as db:
            record = db.execute("SELECT complete FROM responses WHERE id=?", (response_id,)).fetchone()
            if not record or record["complete"]:
                raise WorkspaceError("RESPONSE_CLOSED", "This response body is already complete.")
            seq = db.execute("SELECT COALESCE(MAX(ordinal),-1)+1 FROM chunks WHERE response=?", (response_id,)).fetchone()[0]
            db.execute("INSERT INTO chunks VALUES(?,?,?)", (response_id, seq, sqlite3.Binary(body)))
            db.execute("UPDATE responses SET length=length+? WHERE id=?", (len(body), response_id))

    def iter_body(self, response_id: str, *, through_ordinal: int | None = None) -> Iterator[bytes]:
        if through_ordinal is not None:
            # Frozen prefixes are append-only. Release each short database read
            # before yielding bytes to a potentially slow downloading client.
            last = -1
            while last < through_ordinal:
                with self._db() as db:
                    rows = db.execute("SELECT ordinal,body FROM chunks WHERE response=? AND ordinal>? AND ordinal<=? ORDER BY ordinal LIMIT 32",
                                      (response_id, last, through_ordinal)).fetchall()
                if not rows:
                    break
                for row in rows:
                    last = row["ordinal"]
                    yield bytes(row["body"])
            return
        with self._db() as db:
            for row in db.execute("SELECT body FROM chunks WHERE response=? ORDER BY ordinal", (response_id,)):
                yield bytes(row["body"])

    def freeze_response(self, response_id: str) -> dict[str, Any]:
        """Capture one immutable body prefix and its metadata in a short read transaction."""
        with self._db() as db:
            db.execute("BEGIN")
            row = db.execute("SELECT * FROM responses WHERE id=?", (response_id,)).fetchone()
            if not row:
                raise WorkspaceError("RESPONSE_NOT_FOUND", "The retained response is not present.")
            prefix = db.execute("SELECT COALESCE(MAX(ordinal),-1),COALESCE(SUM(length(body)),0) FROM chunks WHERE response=?",
                                (response_id,)).fetchone()
            if prefix[1] != row["length"]:
                raise WorkspaceError("RESPONSE_CHANGED", "The selected response prefix differs from its stored length.")
            result = dict(row)
            result["last_chunk"] = prefix[0]
            result["headers"] = decode(result["headers"].encode())
            db.execute("COMMIT")
        return result

    def body(self, response_id: str) -> bytes:
        return b"".join(self.iter_body(response_id))

    def response(self, response_id: str) -> dict[str, Any]:
        with self._db() as db:
            row = db.execute("SELECT * FROM responses WHERE id=?", (response_id,)).fetchone()
        if not row:
            raise WorkspaceError("RESPONSE_NOT_FOUND", "The retained response is not present.")
        result = dict(row)
        result["headers"] = decode(result["headers"].encode())
        return result

    def finish_response(self, response_id: str) -> dict[str, Any]:
        import hashlib
        hasher, length = hashlib.sha256(), 0
        for chunk in self.iter_body(response_id):
            hasher.update(chunk)
            length += len(chunk)
        with self._tx() as db:
            row = db.execute("SELECT * FROM responses WHERE id=?", (response_id,)).fetchone()
            if length != row["length"]:
                raise WorkspaceError("RESPONSE_LENGTH", "The retained body has changed during receiving.")
            if row["complete"] and row["sha256"] != hasher.hexdigest():
                raise WorkspaceError("RESPONSE_CHANGED", "The complete retained body has changed.")
            db.execute("UPDATE responses SET complete=1,sha256=? WHERE id=?", (hasher.hexdigest(), response_id))
            # The full successful entity and its receiving state commit together.
            # A process exit between returning from the SDK and applying the page
            # can therefore reopen and apply this saved response without a new request.
            if row["attempt"] is not None and row["status"] == 200:
                attempt = db.execute("SELECT * FROM attempts WHERE id=?", (row["attempt"],)).fetchone()
                if attempt["response"] is None and attempt["state"] == "dispatched":
                    db.execute("UPDATE attempts SET response=?,state='received' WHERE id=?",
                               (response_id, row["attempt"]))
        return self.response(response_id)

    def accept_response(self, attempt_id: str, response_id: str) -> None:
        response = self.response(response_id)
        if not response["complete"] or response["attempt"] != attempt_id:
            raise WorkspaceError("RESPONSE_INCOMPLETE", "Retain the complete response for this exact attempt first.")
        with self._tx() as db:
            attempt = db.execute("SELECT * FROM attempts WHERE id=?", (attempt_id,)).fetchone()
            if attempt["state"] == "applied":
                if attempt["response"] != response_id:
                    raise WorkspaceError("RESPONSE_CHANGED", "An applied attempt already names its original response.")
                return
            if attempt["response"] and attempt["response"] != response_id:
                raise WorkspaceError("RESPONSE_CHANGED", "This attempt already has a retained final response.")
            db.execute("UPDATE attempts SET response=?,state='received' WHERE id=?", (response_id, attempt_id))

    def apply(self, attempt_id: str) -> dict[str, Any]:
        with self._db() as db:
            row = db.execute("SELECT * FROM attempts WHERE id=?", (attempt_id,)).fetchone()
        if not row or row["state"] not in ("received", "applied"):
            raise WorkspaceError("PAGE_NOT_RECEIVED", "The complete final response has not been retained.")
        attempt = dict(row)
        response = self.response(attempt["response"])
        body = self.body(response["id"])
        if not response["complete"] or digest(body) != response["sha256"] or len(body) != response["length"]:
            raise WorkspaceError("RESPONSE_CHANGED", "The complete response no longer matches its retained digest.")
        if response["status"] != 200:
            raise WorkspaceError("PROVIDER_RESPONSE", f"The provider returned HTTP {response['status']}.",
                                 response_id=response["id"], status=response["status"])
        page = validate_page(body, attempt["since_cursor"], self.configuration["limit"])
        with self._tx() as db:
            current = db.execute("SELECT * FROM attempts WHERE id=?", (attempt_id,)).fetchone()
            if current["state"] == "applied":
                return {"events": len(page["data"]), **page["meta"]}
            edition = db.execute("SELECT * FROM editions WHERE id=?", (attempt["edition"],)).fetchone()
            if edition["cursor"] != attempt["since_cursor"]:
                raise WorkspaceError("CURSOR_CHANGED", "Another page already advanced this exact edition.")
            for event in page["data"]:
                db.execute("INSERT INTO events VALUES(?,?,?,?,?)", (
                    attempt["edition"], event["event_id"], event["catalyst_id"], attempt_id, encode(event)))
            reconcile = any(e["event_type"] == "restored" or
                            (e["event_type"] == "retracted" and e.get("merged_into") is not None) for e in page["data"])
            db.execute("""UPDATE editions SET cursor=?,has_more=?,needs_reconcile=MAX(needs_reconcile,?) WHERE id=?""",
                       (page["meta"]["next_since"], int(page["meta"]["has_more"]), int(reconcile), attempt["edition"]))
            db.execute("UPDATE attempts SET state='applied',finished=? WHERE id=?", (now(), attempt_id))
            if not page["meta"]["has_more"]:
                # A full replay from zero becomes current only after its last page.
                if edition["state"] == "receiving":
                    db.execute("UPDATE editions SET state='previous' WHERE state='current'")
                    db.execute("UPDATE editions SET state='current',completed=?,needs_reconcile=0 WHERE id=?",
                               (now(), attempt["edition"]))
                else:
                    db.execute("UPDATE editions SET completed=? WHERE id=?", (now(), attempt["edition"]))
        return {"events": len(page["data"]), **page["meta"]}

    def recover_received(self) -> list[str]:
        """Apply complete saved responses after a crash, with zero HTTP calls."""
        with self._db() as db:
            rows = db.execute("SELECT id FROM attempts WHERE state='received' ORDER BY created,id").fetchall()
        recovered = []
        for row in rows:
            try:
                self.apply(row["id"])
                recovered.append(row["id"])
            except Exception as error:
                self.fail_attempt(row["id"], error)
                raise
        return recovered

    def fail_attempt(self, attempt_id: str, error: BaseException) -> None:
        # A post-body SDK failure or temporary application failure must not
        # strand a valid page that is already completely in the workspace.
        # Preserve the failed operation and its full error, while leaving this
        # exact request's validated successful response eligible for local apply.
        recoverable = False
        with self._db() as db:
            row = db.execute("SELECT * FROM attempts WHERE id=?", (attempt_id,)).fetchone()
        if row and row["state"] != "applied" and row["response"]:
            try:
                response = self.response(row["response"])
                body = self.body(response["id"])
                if (response["attempt"] == attempt_id and response["status"] == 200 and response["complete"]
                        and len(body) == response["length"] and digest(body) == response["sha256"]):
                    validate_page(body, row["since_cursor"], self.configuration["limit"])
                    recoverable = True
            except (WorkspaceError, UnicodeError, ValueError, TypeError):
                pass
        with self._tx() as db:
            db.execute("UPDATE attempts SET state=?,finished=?,error=? WHERE id=? AND state!='applied'",
                       ("received" if recoverable else "failed", now(), encode(error_details(error)), attempt_id))

    def finish_run(self, key: str, state: str, error: BaseException | None = None) -> dict[str, Any]:
        with self._tx() as db:
            db.execute("UPDATE runs SET state=?,finished=?,error=? WHERE id=?",
                       (state, now(), encode(error_details(error)) if error else None, key))
        return self.run(key)

    def retain_public(self, *, url: str, body: bytes, purpose: str,
                      headers: dict[str, str] | None = None, status: int = 200) -> dict[str, Any]:
        ident = self.begin_response(None, url=url, status=status, headers=headers or {}, purpose=purpose)
        self.append(ident, body)
        return self.finish_response(ident)

    def preview(self, body: bytes, *, source_url: str, operation_key: str = "provider-public-preview") -> dict[str, Any]:
        if self.configuration["mode"] != "preview":
            raise WorkspaceError("PREVIEW_WORKSPACE", "Import the public preview into its own preview workspace.")
        with self.receiving():
            self.recover_received()
            run, new = self.start_run(operation_key, max_pages=1, max_amount=0, max_page_amount=0, refresh=True)
            if not new:
                return self.run(run["id"])
            attempt = self.prepare_attempt(run["id"])
            response = self.begin_response(attempt["id"], url=source_url, status=200,
                                           headers={"Content-Type": "application/json"}, purpose="public-preview")
            self.append(response, body)
            self.finish_response(response)
            self.accept_response(attempt["id"], response)
            try:
                self.apply(attempt["id"])
            except Exception as error:
                self.fail_attempt(attempt["id"], error)
                self.finish_run(run["id"], "failed", error)
                raise
            return self.finish_run(run["id"], "caught_up")

    def replay(self, edition_id: str | None = None) -> dict[str, Any]:
        """Rebuild a selected edition from complete original pages; original observations remain."""
        with self.receiving():
            editions = self.editions()
            selected = next((e for e in editions if e["id"] == edition_id), None) if edition_id else next(
                (e for e in editions if e["state"] == "current"), editions[0] if editions else None)
            if not selected:
                raise WorkspaceError("EDITION_NOT_FOUND", "There is no retained history edition to replay.")
            with self._db() as db:
                attempts = [dict(r) for r in db.execute(
                    "SELECT * FROM attempts WHERE edition=? AND state='applied' ORDER BY since_cursor,created,id",
                    (selected["id"],))]
            cursor, events, last_more = 0, [], True
            for attempt in attempts:
                if attempt["since_cursor"] != cursor:
                    raise WorkspaceError("REPLAY_GAP", "The saved pages do not form one continuous cursor history.")
                response = self.response(attempt["response"])
                body = self.body(response["id"])
                if not response["complete"] or len(body) != response["length"] or digest(body) != response["sha256"]:
                    raise WorkspaceError("RESPONSE_CHANGED", "A saved response has changed.")
                page = validate_page(body, cursor, self.configuration["limit"])
                events.extend((event, attempt["id"]) for event in page["data"])
                cursor, last_more = page["meta"]["next_since"], page["meta"]["has_more"]
            with self._tx() as db:
                db.execute("DELETE FROM events WHERE edition=?", (selected["id"],))
                for event, attempt_id in events:
                    db.execute("INSERT INTO events VALUES(?,?,?,?,?)",
                               (selected["id"], event["event_id"], event["catalyst_id"], attempt_id, encode(event)))
                db.execute("UPDATE editions SET cursor=?,has_more=? WHERE id=?",
                           (cursor, int(last_more), selected["id"]))
                db.execute("INSERT INTO history(created,action,value) VALUES(?,?,?)",
                           (now(), "replay", encode({"edition": selected["id"], "pages": len(attempts), "events": len(events)})))
            return {"edition": selected["id"], "pages": len(attempts), "events": len(events), "cursor": str(cursor)}

    def snapshot(self, *, edition_id: str | None = None, include_timelines: bool = False) -> dict[str, Any]:
        with self._db() as db:
            editions = [dict(r) for r in db.execute("SELECT * FROM editions ORDER BY ordinal DESC")]
            selected = next((e for e in editions if e["id"] == edition_id), None) if edition_id else next(
                (e for e in editions if e["state"] == "current"), editions[0] if editions else None)
            if edition_id and selected is None:
                raise WorkspaceError("EDITION_NOT_FOUND", "The selected history edition is not present.")
            events = [decode(r["value"].encode()) for r in db.execute(
                "SELECT value FROM events WHERE edition=? ORDER BY event_id", (selected["id"],))] if selected else []
            attempts = [dict(r) for r in db.execute("""SELECT a.id,a.run,a.ordinal,a.created,a.finished,a.state,
                a.since_cursor,a.url,a.response,a.payment_amount,a.error,r.length,r.sha256,r.status
                FROM attempts a LEFT JOIN responses r ON r.id=a.response ORDER BY a.created DESC,a.ordinal DESC""")]
            responses = [dict(r) for r in db.execute(
                "SELECT id,attempt,ordinal,created,url,status,complete,length,sha256,purpose FROM responses ORDER BY created,id")]
            runs = [dict(r) for r in db.execute("SELECT * FROM runs ORDER BY created DESC")]
        view = project(events)
        for record in attempts + runs:
            if record.get("error"):
                full = decode(record["error"].encode())
                record["error"] = full.get("message", "Receiving failed.")
            if "since_cursor" in record:
                record["since_cursor"] = str(record["since_cursor"])
        for edition in editions:
            edition["cursor"] = str(edition["cursor"])
        answer = {
            "configuration": self.configuration, "watchlist": self.watchlist(), "editions": editions,
            "selected_edition": selected["id"] if selected else None, "events": len(events),
            "catalysts": view["catalysts"], "fda_extensions": view["fda_extensions"],
            "vendor_repairs": view["vendor_repairs"], "runs": runs, "attempts": attempts,
            "responses": responses, "as_of": now(),
        }
        if include_timelines:
            answer["timelines"] = view["timelines"]
        return answer

    def verify(self) -> dict[str, Any]:
        import hashlib
        with self._db() as db:
            check = db.execute("PRAGMA integrity_check").fetchall()
            if [row[0] for row in check] != ["ok"] or db.execute("PRAGMA foreign_key_check").fetchone():
                raise WorkspaceError("DATABASE_INTEGRITY", "The workspace database failed its integrity check.")
            responses = [dict(r) for r in db.execute("SELECT * FROM responses ORDER BY id")]
        total = 0
        for response in responses:
            hasher, length = hashlib.sha256(), 0
            for chunk in self.iter_body(response["id"]):
                hasher.update(chunk)
                length += len(chunk)
            if length != response["length"] or (response["complete"] and hasher.hexdigest() != response["sha256"]):
                raise WorkspaceError("RESPONSE_CHANGED", "A retained response body failed verification.", response=response["id"])
            total += length
        return {"responses": len(responses), "body_bytes": total, "database": "ok"}

    def backup(self, path: str | Path) -> None:
        destination = Path(path)
        with self._db() as source:
            target = sqlite3.connect(destination)
            try:
                source.backup(target)
            finally:
                target.close()
        os.chmod(destination, 0o600)
