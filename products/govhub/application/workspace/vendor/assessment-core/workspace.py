"""Durable private assessment workspace, input versions and operator decisions."""
from contextlib import contextmanager
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
import base64
import calendar
import csv
import fcntl
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import shutil
import sqlite3
import tempfile
import uuid

from schema import Problem, SCHEMAS, SOURCE, MATURITY_LEVELS, MATURITY_DOMAINS, DOMAIN_OPTIONS, validate, text, identity

MAX_UPLOAD = 128 * 1024 * 1024
CSV_LIMIT = 4 * 1024 * 1024
JS_SPACE = '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
csv.field_size_limit(CSV_LIMIT)


def now(): return datetime.now(timezone.utc).isoformat(timespec='milliseconds')
def packed(value): return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
def sha(value): return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()
def identifier(): return uuid.uuid4().hex
def view_record(row):
    return dict(kind=row['kind'], id=row['id'], revision=row['revision'], data=json.loads(row['data']), archived=bool(row['archived']),
        origin=json.loads(row['origin']), author=row['author'], created_at=row['created_at'], updated_at=row['updated_at'])


def require_writer(user):
    if not user or user['role'] not in ('operator', 'reviewer', 'admin'): raise Problem('An operator account is required.', 403)


def require_reviewer(user):
    if not user or user['role'] not in ('reviewer', 'admin'): raise Problem('A reviewer account is required for a review decision.', 403)


def profile(value):
    if not isinstance(value, dict) or set(value) - {'name', 'integration_id', 'control_id', 'spec', 'notes'}: raise Problem('Invalid comparison profile.')
    name = text(value.get('name', ''), 160).strip()
    spec = value.get('spec')
    if not name or not isinstance(spec, dict) or spec.get('version') != 1: raise Problem('Name the check and provide a version-1 comparison specification.')
    keys, amounts = spec.get('keys'), spec.get('amounts')
    if not isinstance(keys, list) or not keys or len(keys) > 30 or any(not isinstance(k, str) or not k.strip() or len(k) > 160 for k in keys) or len(set(keys)) != len(keys): raise Problem('Define unique logical key columns.')
    if not isinstance(amounts, list) or not amounts or len(amounts) > 50: raise Problem('Define at least one measured numeric column.')
    names = []
    for amount in amounts:
        if not isinstance(amount, dict): raise Problem('Invalid measured column.')
        n, scale, tolerance = amount.get('name'), amount.get('scale'), amount.get('tolerance')
        if not isinstance(n, str) or not n.strip() or len(n) > 160 or isinstance(scale, bool) or not isinstance(scale, int) or not 0 <= scale <= 8 or not isinstance(tolerance, str): raise Problem('Measured columns need a name, scale 0–8 and an explicit decimal tolerance.')
        from decimal import Decimal, InvalidOperation
        try:
            t = Decimal(tolerance)
            if not re.fullmatch(r'[+-]?\d+(?:\.\d+)?', tolerance.strip(), re.ASCII) or not t.is_finite() or t < 0 or -t.as_tuple().exponent > scale: raise ValueError()
        except (InvalidOperation, ValueError): raise Problem('Use a nonnegative tolerance within its declared decimal scale.')
        names.append(n)
    if len(set(names)) != len(names) or set(names) & set(keys): raise Problem('Logical key and measured-column names must be distinct.')
    for side in ('source_columns', 'target_columns'):
        mapping = spec.get(side)
        if not isinstance(mapping, dict) or any(not isinstance(mapping.get(k), str) or not mapping[k].strip() or len(mapping[k]) > 160 for k in keys + names): raise Problem('Map every logical column to source and target headers.')
    groups = spec.get('group_by', [])
    if not isinstance(groups, list) or len(set(groups)) != len(groups) or any(k not in keys for k in groups): raise Problem('Grouping must select declared key columns.')
    cleaned = {'version': 1, 'dataset': name, 'keys': keys, 'amounts': amounts, 'source_columns': spec['source_columns'], 'target_columns': spec['target_columns'], 'group_by': groups}
    return dict(name=name, integration_id=text(value.get('integration_id', ''), 240), control_id=text(value.get('control_id', ''), 240), spec=cleaned, notes=text(value.get('notes', '')))


class Workspace:
    def __init__(self, directory, create=False, name='Systems assessment', mode='Supplied inputs'):
        raw = Path(directory)
        if not raw.is_absolute(): raise Problem('Choose an absolute private workspace directory.')
        if create: raw.mkdir(parents=True, exist_ok=True, mode=0o700)
        if raw.is_symlink() or not raw.is_dir() or raw.stat().st_mode & 0o077: raise Problem('The workspace directory must be private (mode 0700).')
        self.root = raw.resolve(); self.db = self.root / 'assessment.sqlite3'; self.blobs = self.root / 'sources'; self.key = self.root / 'reconciliation.key'
        if (self.root / 'BACKUP_INCOMPLETE').exists(): raise Problem('This backup is incomplete; open a completed backup instead.')
        if any(p.is_symlink() for p in (self.db, self.blobs, self.key)): raise Problem('Private storage must use regular local files.')
        if create:
            self.blobs.mkdir(mode=0o700, exist_ok=True)
            try: os.close(os.open(self.db, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600))
            except FileExistsError: pass
            with self.connect() as db:
                db.executescript('''
                  CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
                  CREATE TABLE IF NOT EXISTS users(name TEXT PRIMARY KEY,role TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL);
                  CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,revision TEXT NOT NULL,data TEXT NOT NULL,archived INTEGER NOT NULL,origin TEXT NOT NULL,author TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(kind,id));
                  CREATE TABLE IF NOT EXISTS revisions(revision TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,parent TEXT,data TEXT NOT NULL,archived INTEGER NOT NULL,origin TEXT NOT NULL,author TEXT NOT NULL,created_at TEXT NOT NULL,note TEXT NOT NULL);
                  CREATE TABLE IF NOT EXISTS activity(seq INTEGER PRIMARY KEY,created_at TEXT NOT NULL,actor TEXT NOT NULL,operation TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT NOT NULL,revision TEXT,details TEXT NOT NULL);
                  CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,filename TEXT NOT NULL,sha256 TEXT NOT NULL,bytes INTEGER NOT NULL,category TEXT NOT NULL,source_label TEXT NOT NULL,system_id TEXT NOT NULL,created_at TEXT NOT NULL,author TEXT NOT NULL);
                  CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,request_key TEXT UNIQUE NOT NULL,request_hash TEXT NOT NULL,file_id TEXT NOT NULL,kind TEXT NOT NULL,mapping TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL,author TEXT NOT NULL);
                  CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,request_key TEXT UNIQUE NOT NULL,request_hash TEXT NOT NULL,profile_id TEXT NOT NULL,profile_revision TEXT NOT NULL,profile TEXT NOT NULL,source_id TEXT NOT NULL,target_id TEXT NOT NULL,status TEXT NOT NULL,result_status TEXT,error TEXT,report TEXT,created_at TEXT NOT NULL,finished_at TEXT,author TEXT NOT NULL,parent_run_id TEXT);
                  CREATE TABLE IF NOT EXISTS exceptions(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,fingerprint TEXT NOT NULL,ordinal INTEGER NOT NULL,detail TEXT NOT NULL,revision TEXT NOT NULL,state TEXT NOT NULL,owner_role TEXT NOT NULL,reason TEXT NOT NULL,action_id TEXT NOT NULL,reviewed_at TEXT,reviewed_by TEXT);
                  CREATE INDEX IF NOT EXISTS revision_record ON revisions(kind,id,created_at);
                  CREATE INDEX IF NOT EXISTS exceptions_run ON exceptions(run_id,ordinal);
                  CREATE INDEX IF NOT EXISTS exceptions_fingerprint ON exceptions(fingerprint);
                  CREATE INDEX IF NOT EXISTS runs_profile ON runs(profile_id,created_at);
                ''')
                db.execute('INSERT OR IGNORE INTO meta VALUES(?,?)', ('head', '0'))
                db.execute('INSERT OR IGNORE INTO meta VALUES(?,?)', ('workspace', packed(dict(id=identifier(), name=name, mode=mode, created_at=now(), project_start=now()[:10]))))
            if not self.key.exists():
                fd = os.open(self.key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, 'w') as out: out.write(secrets.token_hex(32)); out.flush(); os.fsync(out.fileno())
            os.chmod(self.db, 0o600)
        if not self.db.is_file() or not self.key.is_file() or not self.blobs.is_dir(): raise Problem('Initialize this workspace first.')
        if any(p.stat().st_mode & 0o077 for p in (self.db, self.key, self.blobs)): raise Problem('Workspace data and key permissions must remain private.')

    @contextmanager
    def connect(self, write=False, snapshot=False):
        db = sqlite3.connect(self.db, timeout=15); db.row_factory = sqlite3.Row
        db.execute('PRAGMA journal_mode=WAL'); db.execute('PRAGMA synchronous=FULL')
        if write: db.execute('BEGIN IMMEDIATE')
        elif snapshot: db.execute('BEGIN')
        try: yield db; db.commit()
        except BaseException: db.rollback(); raise
        finally: db.close()

    @contextmanager
    def service_lease(self):
        # The OS owns this lifetime lease. A stopped process releases it without
        # deleting or replacing a lock file that another writer could acquire.
        path = self.root / 'service.lock'
        fd = os.open(path, os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        try:
            try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError: raise Problem('This workspace is already served by another process. Use that local service or stop it before reopening the workspace.', 409)
            yield
        finally: os.close(fd)

    def meta(self, db): return {r['key']: json.loads(r['value']) for r in db.execute('SELECT * FROM meta')}
    def bump(self, db): db.execute("UPDATE meta SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key='head'")
    def log(self, db, actor, operation, kind='', entity_id='', revision=None, details=None):
        db.execute('INSERT INTO activity(created_at,actor,operation,kind,entity_id,revision,details) VALUES(?,?,?,?,?,?,?)', (now(), actor, operation, kind, entity_id, revision, packed(details or {})))

    def add_user(self, name, password, role='admin'):
        name = identity(name)
        if role not in ('operator', 'reviewer', 'admin') or not isinstance(password, str) or not 12 <= len(password) <= 1024: raise Problem('Use a supported role and a password of at least 12 characters.')
        salt = secrets.token_bytes(16); result = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1).hex()
        with self.connect(write=True) as db:
            db.execute('INSERT INTO users VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET role=excluded.role,salt=excluded.salt,password_hash=excluded.password_hash', (name, role, salt.hex(), result))

    def user(self, name):
        with self.connect() as db: row = db.execute('SELECT name,role FROM users WHERE name=?', (name,)).fetchone()
        return dict(row) if row else None

    def authenticate(self, name, password):
        if not isinstance(name, str) or not isinstance(password, str) or len(password) > 1024: return None
        with self.connect() as db: row = db.execute('SELECT * FROM users WHERE name=?', (name,)).fetchone()
        salt = bytes.fromhex(row['salt']) if row else b'\0' * 16
        hashed = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1).hex()
        return dict(name=row['name'], role=row['role']) if row and hmac.compare_digest(hashed, row['password_hash']) else None

    def record(self, kind, ident, revision=None):
        with self.connect(snapshot=True) as db:
            if revision:
                row = db.execute('SELECT *,created_at AS updated_at FROM revisions WHERE kind=? AND id=? AND revision=?', (kind, ident, revision)).fetchone()
            else: row = db.execute('SELECT * FROM entities WHERE kind=? AND id=?', (kind, ident)).fetchone()
            if not row: raise Problem('Record not found.', 404)
            result = view_record(row)
            current = db.execute('SELECT revision FROM entities WHERE kind=? AND id=?', (kind, ident)).fetchone()
            result['current_revision'] = current['revision'] if current else result['revision']
            result['history'] = [dict(r) for r in db.execute('SELECT revision,parent,author,created_at,note,archived FROM revisions WHERE kind=? AND id=? ORDER BY rowid DESC', (kind, ident))]
            return result

    def _write(self, db, kind, ident, data, user, expected, note='', origin=None, archived=False):
        old = db.execute('SELECT * FROM entities WHERE kind=? AND id=?', (kind, ident)).fetchone()
        if (old['revision'] if old else None) != expected: raise Problem('A newer version exists. Your entries remain open; compare or download them before reloading.', 409)
        if data.get('review_state') == 'Reviewed' and (not old or data != json.loads(old['data']) or bool(old['archived']) != bool(archived)): require_reviewer(user)
        timestamp = now(); parent = old['revision'] if old else None
        retained = origin if origin is not None else json.loads(old['origin']) if old else []
        revision = sha(packed(dict(kind=kind, id=ident, parent=parent, data=data, archived=archived, origin=retained, at=timestamp, nonce=identifier())))
        db.execute('INSERT INTO revisions VALUES(?,?,?,?,?,?,?,?,?,?)', (revision, kind, ident, parent, packed(data), int(archived), packed(retained), user['name'], timestamp, text(note)))
        db.execute('INSERT INTO entities VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,data=excluded.data,archived=excluded.archived,origin=excluded.origin,author=excluded.author,updated_at=excluded.updated_at',
            (kind, ident, revision, packed(data), int(archived), packed(retained), user['name'], old['created_at'] if old else timestamp, timestamp))
        self.log(db, user['name'], 'Record archived' if archived else 'Record revised' if old else 'Record created', kind, ident, revision, dict(note=note, parent=parent))
        return revision

    def save(self, kind, ident, payload, user):
        require_writer(user); ident = identity(ident); data = profile(payload.get('data')) if kind == 'profiles' else validate(kind, payload.get('data'))
        if not isinstance(payload.get('archived', False), bool): raise Problem('Invalid archive state.')
        with self.connect(write=True) as db:
            self._write(db, kind, ident, data, user, payload.get('expected_revision'), payload.get('note', ''), archived=payload.get('archived', False)); self.bump(db)
        return self.record(kind, ident)

    def snapshot(self):
        with self.connect(snapshot=True) as db:
            meta = self.meta(db); entities = {kind: [] for kind in [*SCHEMAS, 'profiles']}
            for row in db.execute('SELECT * FROM entities ORDER BY kind,id'): entities.setdefault(row['kind'], []).append(view_record(row))
            files = [dict(r) for r in db.execute('SELECT * FROM files ORDER BY rowid DESC')]
            imports = [dict(r, mapping=json.loads(r['mapping']), result=json.loads(r['result'])) for r in db.execute('SELECT id,file_id,kind,mapping,result,created_at,author FROM imports ORDER BY rowid DESC')]
            runs = [dict(r) for r in db.execute('SELECT id,profile_id,profile_revision,source_id,target_id,status,result_status,error,created_at,finished_at,author,parent_run_id FROM runs ORDER BY rowid DESC')]
            counts = {r['run_id']: dict(total=r['total'], reviewed=r['reviewed']) for r in db.execute("SELECT run_id,count(*) AS total,sum(CASE WHEN state<>'Open' THEN 1 ELSE 0 END) AS reviewed FROM exceptions GROUP BY run_id")}
            for run in runs: run['exceptions'] = counts.get(run['id'], dict(total=0, reviewed=0))
        value = dict(**meta, entities=entities, files=files, imports=imports, runs=runs, schemas=SCHEMAS, source=SOURCE, maturity_model=MATURITY_LEVELS)
        value['analysis'] = analyze(value)
        return value

    def configure(self, payload, user):
        require_writer(user)
        name = text(payload.get('name', ''), 500).strip()
        try: project_start = date.fromisoformat(payload.get('project_start', '')).isoformat()
        except (TypeError, ValueError): raise Problem('Choose the roadmap start date in YYYY-MM-DD form.')
        if not name: raise Problem('Name the workspace.')
        with self.connect(write=True) as db:
            meta = self.meta(db)
            if payload.get('expected_head') != meta['head']: raise Problem('The workspace changed. Reload its settings before saving.', 409)
            value = dict(meta['workspace'], name=name, project_start=project_start)
            db.execute("UPDATE meta SET value=? WHERE key='workspace'", (packed(value),))
            self.log(db, user['name'], 'Workspace settings revised', details=dict(name=name, project_start=project_start)); self.bump(db)
        return self.snapshot()

    def _blob(self, content):
        digest = sha(content); target = self.blobs / digest
        if target.exists():
            if target.is_symlink() or sha(target.read_bytes()) != digest: raise Problem('Retained source content is inconsistent.', 503)
            return digest
        fd, temporary = tempfile.mkstemp(prefix='.incoming-', dir=self.blobs)
        try:
            with os.fdopen(fd, 'wb') as output: output.write(content); output.flush(); os.fsync(output.fileno())
            try: os.link(temporary, target)
            except FileExistsError:
                if target.is_symlink() or sha(target.read_bytes()) != digest: raise Problem('Retained source content is inconsistent.', 503)
            directory = os.open(self.blobs, os.O_RDONLY)
            try: os.fsync(directory)
            finally: os.close(directory)
        finally: Path(temporary).unlink(missing_ok=True)
        return digest

    def upload(self, payload, user):
        require_writer(user); filename = text(payload.get('filename', ''), 500)
        if not filename or filename in ('.', '..') or Path(filename).name != filename or '/' in filename or '\\' in filename: raise Problem('Use a plain filename.')
        encoded = payload.get('content_base64')
        if not isinstance(encoded, str) or len(encoded) > 4 * ((MAX_UPLOAD + 2) // 3): raise Problem('Each source file may be at most 128 MiB.', 413)
        try: content = base64.b64decode(encoded, validate=True)
        except ValueError: raise Problem('The file content is not valid base64.')
        if not content or len(content) > MAX_UPLOAD: raise Problem('Select a nonempty file within 128 MiB.', 413)
        category = payload.get('category', 'Evidence')
        if category not in ('Inventory', 'Extract', 'Evidence'): raise Problem('Choose a source-file category.')
        item = dict(id=identifier(), filename=filename, sha256=self._blob(content), bytes=len(content), category=category,
            source_label=text(payload.get('source_label', ''), 2000), system_id=text(payload.get('system_id', ''), 240), created_at=now(), author=user['name'])
        with self.connect(write=True) as db:
            db.execute('INSERT INTO files VALUES(:id,:filename,:sha256,:bytes,:category,:source_label,:system_id,:created_at,:author)', item)
            self.log(db, user['name'], 'Source version retained', 'files', item['id'], details={k: item[k] for k in ('filename', 'sha256', 'bytes', 'source_label')}); self.bump(db)
        return item

    def file(self, ident, content=False):
        with self.connect() as db: row = db.execute('SELECT * FROM files WHERE id=?', (ident,)).fetchone()
        if not row: raise Problem('Retained file not found.', 404)
        item = dict(row)
        if content:
            path = self.blobs / item['sha256']
            if path.is_symlink() or not path.is_file(): raise Problem('Retained source file is unavailable.', 503)
            value = path.read_bytes()
            if len(value) != item['bytes'] or sha(value) != item['sha256']: raise Problem('Retained source file changed.', 503)
            return item, value
        return item

    def csv(self, ident):
        item, value = self.file(ident, True)
        try: stream = io.StringIO(value.decode('utf-8-sig'), newline=''); reader = csv.reader(stream, strict=True); headers = next(reader)
        except (UnicodeError, csv.Error, StopIteration): raise Problem('Use a UTF-8 CSV file with a header row.')
        headers = [h.strip(JS_SPACE) for h in headers]
        if not headers or len(set(headers)) != len(headers): raise Problem('CSV headers must be unique. Map actual named headers to required fields.')
        rows = []
        try:
            for number, values in enumerate(reader, 2):
                if not values: values = ['']
                if len(values) == 1 and not values[0] and len(headers) != 1: continue
                if len(values) != len(headers): raise Problem('CSV row ' + str(number) + ' has a different number of columns.')
                rows.append((number, dict(zip(headers, values))))
        except csv.Error as exc: raise Problem('CSV format error: ' + str(exc))
        return item, headers, rows

    def file_preview(self, ident):
        item, headers, rows = self.csv(ident)
        return dict(file=item, headers=headers, row_count=len(rows), rows=[dict(row=n, values=v) for n, v in rows[:8]])

    def import_plan(self, payload, db=None):
        kind = payload.get('kind'); mapping = payload.get('mapping')
        if kind not in ('systems', 'integrations') or not isinstance(mapping, dict): raise Problem('Choose a systems or integrations inventory and map its columns.')
        fields = {f['name']: f for f in SCHEMAS[kind]['fields']}
        if set(mapping) - {'id', *fields} or any(not isinstance(v, str) for v in mapping.values()): raise Problem('Invalid inventory column map.')
        item, headers, rows = self.csv(payload.get('file_id'))
        if not mapping.get('id') or not mapping.get('name') or any(v and v not in headers for v in mapping.values()): raise Problem('Map a stable record ID and name to actual CSV headers.')
        if db is None:
            with self.connect(snapshot=True) as own: return self._plan(kind, mapping, item, rows, fields, own)
        return self._plan(kind, mapping, item, rows, fields, db)

    def _plan(self, kind, mapping, item, rows, fields, db):
        existing = {r['id']: r for r in db.execute('SELECT * FROM entities WHERE kind=?', (kind,))}; changes, errors, seen = [], [], set()
        for line, source in rows:
            try:
                ident = identity(source[mapping['id']])
                if ident in seen: raise Problem('Duplicate record ID in this inventory: ' + ident)
                seen.add(ident); old = existing.get(ident); data = json.loads(old['data']) if old else {}
                for key, column in mapping.items():
                    if key == 'id' or not column: continue
                    typ = fields[key]['type']; raw = source[column]
                    if typ in ('multi', 'list', 'references'): data[key] = [x.strip() for x in raw.split('|') if x.strip()]
                    elif typ == 'bool':
                        if raw.lower().strip() not in ('true', 'false', 'yes', 'no', '1', '0', ''): raise Problem('Use true/false for ' + key)
                        data[key] = raw.lower().strip() in ('true', 'yes', '1')
                    elif typ == 'number': data[key] = float(raw) if raw.strip() else None
                    else: data[key] = raw
                clean = validate(kind, data); changed = not old or clean != json.loads(old['data'])
                if changed and 'review_state' in clean: clean['review_state'] = 'Unreviewed'; clean['review_basis'] = ''
                changes.append(dict(id=ident, row=line, action='Add' if not old else 'Update' if changed or old['archived'] else 'Retain', data=clean, expected_revision=old['revision'] if old else None,
                    changed_fields=[key for key in clean if not old or clean[key] != json.loads(old['data']).get(key)]))
            except (Problem, ValueError) as exc: errors.append(dict(row=line, error=str(exc)))
        return dict(kind=kind, file=item, mapping=mapping, head=self.meta(db)['head'], rows=len(rows), changes=changes, errors=errors,
            counts={action.lower(): sum(c['action'] == action for c in changes) for action in ('Add', 'Update', 'Retain')})

    def commit_import(self, payload, user):
        require_writer(user); key = identity(payload.get('request_key', '')); fingerprint = sha(packed(payload))
        with self.connect(write=True) as db:
            prior = db.execute('SELECT * FROM imports WHERE request_key=?', (key,)).fetchone()
            if prior:
                if prior['request_hash'] != fingerprint: raise Problem('This retry identity belongs to a different import.', 409)
                return json.loads(prior['result'])
            plan = self.import_plan(payload, db)
            if plan['errors']: raise Problem('Correct the inventory errors before committing.', fields={'inventory': packed(plan['errors'][:20])})
            if payload.get('expected_head') != plan['head']: raise Problem('The workspace changed after preview. Preview this same file again to compare the latest versions.', 409)
            import_id = identifier()
            for change in plan['changes']:
                old = db.execute('SELECT origin FROM entities WHERE kind=? AND id=?', (plan['kind'], change['id'])).fetchone()
                origin = json.loads(old['origin']) if old else []
                origin.append(dict(import_id=import_id, file_id=plan['file']['id'], sha256=plan['file']['sha256'], row=change['row'], mapping=plan['mapping']))
                self._write(db, plan['kind'], change['id'], change['data'], user, change['expected_revision'], 'Accepted inventory ' + plan['file']['filename'] + ' row ' + str(change['row']), origin, False)
            result = dict(id=import_id, kind=plan['kind'], file_id=plan['file']['id'], rows=plan['rows'], counts=plan['counts'])
            db.execute('INSERT INTO imports(id,request_key,request_hash,file_id,kind,mapping,result,created_at,author) VALUES(?,?,?,?,?,?,?,?,?)', (import_id, key, fingerprint, plan['file']['id'], plan['kind'], packed(plan['mapping']), packed(result), now(), user['name']))
            self.bump(db); self.log(db, user['name'], 'Inventory committed', plan['kind'], import_id, details=result)
        return result

    def activity(self, offset=0):
        try: offset = max(0, int(offset))
        except ValueError: raise Problem('Invalid activity position.')
        with self.connect(snapshot=True) as db:
            total = db.execute('SELECT count(*) FROM activity').fetchone()[0]
            rows = [dict(r, details=json.loads(r['details'])) for r in db.execute('SELECT * FROM activity ORDER BY seq DESC LIMIT 100 OFFSET ?', (offset,))]
        return dict(items=rows, total=total, offset=offset, limit=100)

    def backup(self, output):
        target = Path(output)
        if not target.is_absolute() or target.exists(): raise Problem('Choose a new absolute backup directory.')
        target = target.parent.resolve() / target.name
        if target.is_relative_to(self.root): raise Problem('Choose a backup destination outside the live workspace.')
        target.mkdir(mode=0o700, parents=True); marker = target / 'BACKUP_INCOMPLETE'
        with marker.open('x') as file: file.write('Backup in progress.'); file.flush(); os.fsync(file.fileno())
        self._sync_dir(target)
        with self.connect(write=True) as db:
            out = sqlite3.connect(target / 'assessment.sqlite3'); reader = sqlite3.connect(self.db)
            try: reader.backup(out)
            finally: reader.close(); out.close()
            sources = [dict(row) for row in db.execute('SELECT DISTINCT sha256,bytes FROM files')]
            metadata = dict(format='systems-review-private-backup/v1', created_at=now(), workspace=self.meta(db)['workspace'])
        # Referenced source blobs are immutable and never deleted. Copy them after
        # releasing the writer lock; comparison completions can continue meanwhile.
        (target / 'sources').mkdir(mode=0o700)
        for row in sources:
            source = self.blobs / row['sha256']; content = source.read_bytes()
            if source.is_symlink() or len(content) != row['bytes'] or sha(content) != row['sha256']: raise Problem('A retained source is inconsistent; backup remains incomplete.', 503)
            self._durable_file(target / 'sources' / row['sha256'], content)
        self._durable_file(target / 'reconciliation.key', self.key.read_bytes())
        os.chmod(target / 'assessment.sqlite3', 0o600)
        with (target / 'assessment.sqlite3').open('rb') as file: os.fsync(file.fileno())
        self._durable_file(target / 'backup.json', packed(metadata).encode()); self._sync_dir(target / 'sources'); self._sync_dir(target)
        marker.unlink(); self._sync_dir(target); self._sync_dir(target.parent)
        return dict(directory=str(target), **metadata)

    @staticmethod
    def _sync_dir(path):
        fd = os.open(path, os.O_RDONLY)
        try: os.fsync(fd)
        finally: os.close(fd)

    @staticmethod
    def _durable_file(path, data):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as file: file.write(data); file.flush(); os.fsync(file.fileno())


def analyze(snapshot):
    current = {k: [x for x in v if not x['archived']] for k, v in snapshot['entities'].items()}
    systems = {x['id']: x for x in current['systems']}; issues = []
    def issue(kind, item, message): issues.append(dict(kind=kind, id=item['id'], name=item['data']['name'], message=message))
    for item in current['systems']:
        d = item['data']
        if not d['owner_role'] or not d['data_owner_role']: issue('systems', item, 'System or data owner role is not recorded.')
    for item in current['integrations']:
        d = item['data']
        if d['source_system'] not in systems or d['target_system'] not in systems: issue('integrations', item, 'A current source or target system is missing.')
        if not d['owner_role'] or not d['last_validated']: issue('integrations', item, 'Owner role or actual validation date is not recorded.')
        if not d['purpose'] or not d['data_exchanged']: issue('integrations', item, 'Business purpose or exchanged data is not documented.')
    matrix = []
    for domain in DOMAIN_OPTIONS:
        candidates = [x['id'] for x in current['systems'] if domain in x['data']['record_domains']]
        decisions = [x for x in current['record_decisions'] if x['data']['domain'] == domain]
        reviewed = [x for x in decisions if x['data']['review_state'] == 'Reviewed']
        selected = list(dict.fromkeys(x['data']['authoritative_system'] for x in reviewed if x['data']['authoritative_system']))
        state = 'Resolved' if len(selected) == 1 and selected[0] in systems else 'Competing decisions' if len(selected) > 1 else 'Needs review'
        if candidates or decisions or domain in DOMAIN_OPTIONS[:5]: matrix.append(dict(domain=domain, candidates=candidates, decisions=[x['id'] for x in decisions], authoritative=selected, state=state))
    urgent = []
    for item in current['risks']:
        d = item['data']
        if d['immediate_alert']:
            discovered = datetime.fromisoformat(d['discovered_at'].replace('Z', '+00:00')) if d['discovered_at'] else None
            deadline = discovered + timedelta(hours=48) if discovered else None
            recorded = bool(d['escalated_at'] and d['escalation_route'] and d['escalation_reference'])
            escalated = datetime.fromisoformat(d['escalated_at'].replace('Z', '+00:00')) if d['escalated_at'] else None
            invalid_order = bool(discovered and escalated and escalated < discovered)
            late = bool(recorded and deadline and escalated > deadline)
            urgent.append(dict(id=item['id'], name=d['name'], owner_role=d['owner_role'], due_at=deadline.isoformat() if deadline else None,
                recorded=recorded, escalated_at=d['escalated_at'] or None, recorded_late=late, invalid_order=invalid_order,
                overdue=bool(deadline and datetime.now(timezone.utc) > deadline and not recorded)))
    roadmap = sequence(current['actions'], snapshot['workspace']['project_start'])
    interviews = current['interviews']; staff_minutes = sum((x['data']['participants'] or 0) * (x['data']['minutes'] or 0) for x in interviews)
    return dict(review_tasks=issues, record_matrix=matrix, urgent=urgent, roadmap=roadmap, interview_staff_hours=round(staff_minutes / 60, 2),
        unreviewed=sum(x['data'].get('review_state') == 'Unreviewed' for rows in current.values() for x in rows),
        observations_unresolved=sum(x['data']['resolution_state'] == 'Unreconciled' for x in current['observations']))


def sequence(actions, project_start=None):
    active = {x['id']: x for x in actions if x['data']['status'] != 'Deferred'}; finished, rows, pending = {}, [], set(active)
    anchor = date.fromisoformat(project_start) if project_start else datetime.now(timezone.utc).date()
    def months(count):
        number = anchor.year * 12 + anchor.month - 1 + count; year, month = number // 12, number % 12 + 1
        return (date(year, month, min(anchor.day, calendar.monthrange(year, month)[1])) - anchor).days
    windows = {'0–90 days': (0, 90), '3–9 months': (months(3), months(9)), '9–24 months': (months(9), months(24))}
    priority = {'High': 0, 'Medium': 1, 'Low': 2}
    while pending:
        ready = sorted([ident for ident in pending if active[ident]['data']['status'] == 'Complete' or all(d in finished for d in active[ident]['data']['dependencies'])], key=lambda ident: (priority[active[ident]['data']['priority']], active[ident]['data']['top_five_rank'] or 99, ident))
        if not ready: break
        for ident in ready:
            item = active[ident]; d = item['data']; floor, ceiling = windows[d['horizon']]
            start = max([floor] + [finished.get(v, 0) for v in d['dependencies']]); end = start + (d['effort_days'] or 0)
            if d['status'] == 'Complete': start = end = 0
            warnings = []
            if end > ceiling: warnings.append('Prerequisites place this beyond its stated horizon.')
            if d['top_five_rank'] and end > 30: warnings.append('The declared Top 5 action cannot finish within 30 days on these dependencies.')
            if not d['owner_role']: warnings.append('Accountable role is missing.')
            if not all(d[k] for k in ('staff_change', 'manager_change', 'owner_change', 'reinforcement', 'non_adoption_risk')): warnings.append('Complete the staff, manager and owner adoption changes, reinforcement and non-adoption risk.')
            rows.append(dict(id=ident, name=d['name'], owner_role=d['owner_role'], priority=d['priority'], horizon=d['horizon'], start_day=start, finish_day=end, warnings=warnings, top_five_rank=d['top_five_rank']))
            finished[ident] = end; pending.remove(ident)
    for ident in sorted(pending):
        d = active[ident]['data']; missing = [v for v in d['dependencies'] if v not in active]
        rows.append(dict(id=ident, name=d['name'], owner_role=d['owner_role'], priority=d['priority'], horizon=d['horizon'], start_day=None, finish_day=None,
            warnings=['Missing or deferred prerequisites: ' + ', '.join(missing)] if missing else ['Dependency cycle or an unresolved prerequisite prevents sequencing.'], top_five_rank=d['top_five_rank']))
    ranks = {}
    for row in rows:
        if row['top_five_rank']: ranks.setdefault(row['top_five_rank'], []).append(row['id'])
    for row in rows:
        if row['top_five_rank'] and len(ranks[row['top_five_rank']]) > 1: row['warnings'].append('This Top 5 rank is assigned more than once.')
    return dict(items=rows, unscheduled=len(pending), duration_days=max(finished.values(), default=0), project_start=anchor.isoformat(),
        basis='Earliest dependency sequence in calendar days from ' + anchor.isoformat() + ', with month horizons calculated from that date. Staff capacity and non-working days are not modeled.')
