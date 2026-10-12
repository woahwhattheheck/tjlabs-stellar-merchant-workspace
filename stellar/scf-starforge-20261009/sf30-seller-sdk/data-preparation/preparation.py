"""MIT. Saved, disk-backed preparation of operator-selected tabular sources.

The control store retains immutable input and recipe editions. Query connections
can read only the selected source views. Neither payments nor remote queries are
implemented here; completed editions can feed the original SF30 dataset service.
"""
from __future__ import annotations

import contextlib
import csv
import decimal
import fcntl
import hashlib
import io
import json
import os
import re
import shutil
import sqlite3
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, BinaryIO, Iterator

VERSION = 'stellar-forge.data-preparation.v1'
NAME = re.compile(r'^[A-Za-z][A-Za-z0-9_]{0,47}$')
KEY = re.compile(r'^[srq]_[a-f0-9]{32,64}$')
RESERVED = {'constructor', 'prototype', '__proto__', 'sqlite_master', 'sqlite_schema'}
MAX_CELL = 1024 * 1024
csv.field_size_limit(MAX_CELL)

class PreparationError(ValueError):
    """An actionable source, recipe or delivery error."""

class Busy(PreparationError):
    pass

class Cancelled(PreparationError):
    pass


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def digest(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def ident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def name(value: str, label: str = 'Name') -> str:
    if not isinstance(value, str) or not NAME.fullmatch(value) or value.lower() in RESERVED or value.lower().startswith('sqlite_'):
        raise PreparationError(f'{label} must start with a letter and contain at most 48 letters, digits or underscores')
    return value


def title(value: str, label: str = 'Title') -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > 128 or any(ord(c) < 32 for c in value):
        raise PreparationError(f'{label} must be printable text, 1–128 characters')
    return value.strip()


def key(value: str) -> str:
    if not isinstance(value, str) or not KEY.fullmatch(value):
        raise PreparationError('Invalid saved record identifier')
    return value


def atomic_json(path: Path, value: Any) -> None:
    tmp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with tmp.open('x', encoding='utf-8') as stream:
            stream.write(dumps(value) + '\n'); stream.flush(); os.fsync(stream.fileno())
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def _json_object(pairs):
    result = {}
    for k, v in pairs:
        if k in result:
            raise PreparationError(f'Duplicate JSON property: {k}')
        result[k] = v
    return result


def parse_json(text: str) -> Any:
    return json.loads(text, object_pairs_hook=_json_object,
                      parse_constant=lambda value: (_ for _ in ()).throw(PreparationError('Non-finite JSON number')))


def _text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, (str, int, decimal.Decimal)):
        result = str(value)
    elif isinstance(value, float):
        raise PreparationError('JSON numbers must be parsed without binary-float conversion')
    else:
        raise PreparationError('JSONL columns must contain scalar values; flatten nested objects explicitly')
    if len(result) > MAX_CELL or '\x00' in result:
        raise PreparationError('Cell contains NUL or exceeds one million characters')
    return result


def _columns(values: list[str]) -> list[str]:
    if not values or len(values) > 256:
        raise PreparationError('Inputs and results require 1–256 columns')
    if any(not isinstance(v, str) or not v or len(v) > 256 or '\x00' in v for v in values):
        raise PreparationError('Column names must be nonempty text, at most 256 characters')
    if len({v.casefold() for v in values}) != len(values):
        raise PreparationError('Column names must be unique, ignoring case')
    return values


def rows_from(path: Path, kind: str, null_token: str | None) -> tuple[list[str], Iterator[list[str | None]]]:
    """Read full UTF-8 CSV or flat JSON Lines while retaining raw files separately."""
    stream = path.open(encoding='utf-8-sig', newline='')
    try:
        if kind == 'csv':
            reader = csv.reader(stream, strict=True)
            columns = _columns(next(reader, []))
            def rows():
                try:
                    for number, row in enumerate(reader, 2):
                        if len(row) != len(columns):
                            raise PreparationError(f'CSV record {number} has {len(row)} cells; expected {len(columns)}')
                        yield [None if null_token is not None and v == null_token else _text(v) for v in row]
                finally:
                    stream.close()
            return columns, rows()
        if kind == 'jsonl':
            # Parse numeric lexemes as text: SQLite never coerces source amounts or IDs.
            def objects():
                for number, line in enumerate(stream, 1):
                    if not line.strip():
                        continue
                    try:
                        obj = json.loads(line, parse_int=str, parse_float=str,
                                         object_pairs_hook=_json_object,
                                         parse_constant=lambda v: (_ for _ in ()).throw(PreparationError('Non-finite JSON number')))
                    except (ValueError, TypeError) as exc:
                        raise PreparationError(f'JSONL line {number}: {exc}') from exc
                    if not isinstance(obj, dict):
                        raise PreparationError(f'JSONL line {number} is not an object')
                    yield number, obj
            source = objects()
            first = next(source, None)
            if first is None:
                raise PreparationError('JSONL input requires at least one object to declare its columns')
            columns = _columns(list(first[1]))
            def rows():
                try:
                    yield [_text(first[1][c]) for c in columns]
                    for number, obj in source:
                        if set(obj) != set(columns):
                            raise PreparationError(f'JSONL line {number} has a different column set; normalize source editions explicitly')
                        yield [_text(obj[c]) for c in columns]
                finally:
                    stream.close()
            return columns, rows()
        raise PreparationError('Format must be csv or jsonl')
    except BaseException:
        stream.close(); raise


# Use a finite, generous decimal context and trap rounding instead of silently
# returning approximate financial values. Operators can explicitly round with
# decimal_quantize. Ordinary SQLite arithmetic retains SQLite's numeric semantics.
def dec(value):
    if value is None:
        return None
    value = decimal.Decimal(str(value))
    if not value.is_finite() or len(value.as_tuple().digits) > 512 or abs(value.adjusted()) > 4096:
        raise PreparationError('Decimal value exceeds supported exact precision or exponent')
    return value


def dec_op(op, a, b):
    if a is None or b is None:
        return None
    with decimal.localcontext() as ctx:
        ctx.prec = 1024; ctx.traps[decimal.Inexact] = True
        return format(op(dec(a), dec(b)), 'f')


class DecimalSum:
    def __init__(self):
        self.total = None
    def step(self, value):
        if value is not None:
            self.total = str(dec(value)) if self.total is None else dec_op(lambda a,b:a+b, self.total, value)
    def finalize(self):
        return self.total


def decimal_functions(connection):
    connection.create_function('decimal_add', 2, lambda a,b:dec_op(lambda x,y:x+y,a,b), deterministic=True)
    connection.create_function('decimal_sub', 2, lambda a,b:dec_op(lambda x,y:x-y,a,b), deterministic=True)
    connection.create_function('decimal_mul', 2, lambda a,b:dec_op(lambda x,y:x*y,a,b), deterministic=True)
    connection.create_function('decimal_cmp', 2, lambda a,b:None if a is None or b is None else (dec(a)>dec(b))-(dec(a)<dec(b)), deterministic=True)
    def quantize(a, places):
        if a is None: return None
        if not isinstance(places, int) or not -100 <= places <= 100:
            raise PreparationError('decimal_quantize places must be an integer from -100 to 100')
        with decimal.localcontext() as ctx:
            ctx.prec = 1024
            return format(dec(a).quantize(decimal.Decimal(1).scaleb(-places), rounding=decimal.ROUND_HALF_EVEN), 'f')
    connection.create_function('decimal_quantize', 2, quantize, deterministic=True)
    connection.create_aggregate('decimal_sum', 1, DecimalSum)


class Workspace:
    def __init__(self, root: str | Path, *, create: bool = False, label: str = 'Data preparation'):
        self.root = Path(root).resolve()
        if create:
            if self.root.exists() and any(self.root.iterdir()):
                raise PreparationError('Create requires a new or empty workspace directory')
            self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
            for folder in ('originals', 'runs', 'cancel', 'staging'):
                (self.root / folder).mkdir(mode=0o700)
            atomic_json(self.root / 'workspace.json', {'schema': VERSION, 'label': title(label), 'createdAt': now()})
            with self.connection() as db:
                db.executescript('''
                CREATE TABLE sources (id TEXT PRIMARY KEY, body TEXT NOT NULL);
                CREATE TABLE recipes (id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(id,revision));
                CREATE TABLE runs (id TEXT PRIMARY KEY, body TEXT NOT NULL);
                CREATE TABLE reviews (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL);
                ''')
        if not (self.root / 'workspace.json').is_file() or not (self.root / 'workspace.sqlite').is_file():
            raise PreparationError('No saved data-preparation workspace at that path')
        self.info = parse_json((self.root / 'workspace.json').read_text())
        if self.info.get('schema') != VERSION:
            raise PreparationError('Unsupported workspace format')

    def connection(self, readonly=False):
        uri = (self.root / 'workspace.sqlite').as_uri() + ('?mode=ro' if readonly else '?mode=rwc')
        db = sqlite3.connect(uri, uri=True, timeout=15, isolation_level=None)
        db.execute('PRAGMA trusted_schema=OFF')
        if not readonly:
            db.execute('PRAGMA journal_mode=WAL'); db.execute('PRAGMA synchronous=FULL')
        return contextlib.closing(db)

    @contextlib.contextmanager
    def mutation(self, blocking=False):
        with (self.root / 'workspace.lock').open('a+b') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
            except BlockingIOError as exc:
                raise Busy('Another workspace operation is running; its status and cancellation remain available') from exc
            try:
                yield
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)

    def records(self, table):
        if table not in {'sources','recipes','runs','reviews'}: raise PreparationError('Unknown collection')
        with self.connection(True) as db:
            return [parse_json(row[0]) for row in db.execute(f'SELECT body FROM {table} ORDER BY rowid')]

    def get(self, table, id, revision=None):
        key(id)
        if table not in {'sources','recipes','runs','reviews'}: raise PreparationError('Unknown collection')
        with self.connection(True) as db:
            if table == 'recipes':
                row = db.execute('SELECT body FROM recipes WHERE id=?' + (' AND revision=?' if revision is not None else ' ORDER BY revision DESC LIMIT 1'),
                                 (id, revision) if revision is not None else (id,)).fetchone()
            else:
                row = db.execute(f'SELECT body FROM {table} WHERE id=?', (id,)).fetchone()
        if row is None: raise PreparationError(f'Saved {table} record was not found')
        return parse_json(row[0])

    def state(self):
        sources, recipes, runs = self.records('sources'), self.records('recipes'), self.records('runs')
        return {**self.info, 'sources': sources, 'recipes': recipes, 'runs': runs, 'reviews': self.records('reviews')}

    def _set_run(self, run):
        with self.connection() as db:
            db.execute('INSERT OR REPLACE INTO runs VALUES(?,?)', (run['id'], dumps(run)))

    def recover(self):
        recovered = []
        with self.mutation():
            for run in self.records('runs'):
                if run['status'] == 'RUNNING':
                    run.update(status='INTERRUPTED', finishedAt=now(), message='Execution stopped before a complete result was saved. Rerun preserves these exact inputs and recipe.')
                    self._set_run(run); recovered.append(run['id'])
        return {'recovered': recovered}

    def import_file(self, file: str | Path, alias: str, kind: str = 'csv', *, label: str | None = None, null_token: str | None = None, original_name: str | None = None):
        file = Path(file).resolve(); name(alias, 'Source alias')
        original_name = title(original_name or file.name, 'Original filename')
        if '/' in original_name or '\\' in original_name: raise PreparationError('Original filename must not contain a directory')
        if not file.is_file(): raise PreparationError('Input must be a regular local file')
        if kind not in {'csv','jsonl'}: raise PreparationError('Format must be csv or jsonl')
        if null_token is not None and (not isinstance(null_token,str) or len(null_token)>256 or kind!='csv'):
            raise PreparationError('A CSV null token must be text of at most 256 characters')
        with self.mutation():
            # Copy before parsing: the original cannot change underneath ingestion.
            fd, tmpname = tempfile.mkstemp(dir=self.root/'staging', prefix='source-')
            tmp = Path(tmpname)
            try:
                with os.fdopen(fd,'wb') as out, file.open('rb') as src:
                    shutil.copyfileobj(src,out,1024*1024); out.flush(); os.fsync(out.fileno())
                sha = digest(tmp)
                source_id = 's_' + hashlib.sha256(dumps([sha,kind,null_token,alias]).encode()).hexdigest()
                with self.connection(True) as db:
                    previous = db.execute('SELECT body FROM sources WHERE id=?',(source_id,)).fetchone()
                if previous: return parse_json(previous[0])
                columns, rows = rows_from(tmp,kind,null_token)
                table = source_id
                count = 0
                with self.connection() as db:
                    db.execute('BEGIN IMMEDIATE')
                    try:
                        db.execute(f'CREATE TABLE {ident(table)} ({",".join(ident(c)+" TEXT" for c in columns)})')
                        insert = f'INSERT INTO {ident(table)} VALUES ({",".join("?" for c in columns)})'
                        nulls = [0]*len(columns); empty = [0]*len(columns)
                        batch = []
                        for row in rows:
                            for n,v in enumerate(row):
                                nulls[n] += v is None; empty[n] += v == ''
                            batch.append(row); count += 1
                            if len(batch) == 1000:
                                db.executemany(insert,batch); batch.clear()
                        if batch: db.executemany(insert,batch)
                        original = self.root/'originals'/sha
                        if original.exists():
                            if digest(original) != sha: raise PreparationError('Retained original has changed')
                        else: os.replace(tmp,original)
                        record = {'id':source_id,'alias':alias,'label':title(label or file.name), 'format':kind,
                                  'originalName':original_name,'sha256':sha,'bytes':original.stat().st_size,'rows':count,
                                  'columns':columns,'nullCounts':nulls,'emptyCounts':empty,'nullToken':null_token,'createdAt':now()}
                        db.execute('INSERT INTO sources VALUES(?,?)',(source_id,dumps(record))); db.execute('COMMIT')
                    except BaseException:
                        db.execute('ROLLBACK'); raise
                    finally:
                        if hasattr(rows,'close'): rows.close()
                return record
            finally:
                tmp.unlink(missing_ok=True)

    def source_page(self, source_id, offset=0, limit=100):
        source = self.get('sources',source_id); offset,limit = self._page(offset,limit)
        with self.connection(True) as db:
            rows = db.execute(f'SELECT * FROM {ident(source_id)} LIMIT ? OFFSET ?',(limit,offset)).fetchall()
        return {'columns':source['columns'],'rows':rows,'offset':offset,'total':source['rows'],
                'nextOffset':offset+len(rows) if offset+len(rows)<source['rows'] else None}

    @staticmethod
    def _page(offset,limit):
        if type(offset)!=int or offset<0 or type(limit)!=int or not 1<=limit<=200:
            raise PreparationError('Page offset must be nonnegative; limit must be 1–200')
        return offset,limit

    def save_recipe(self, label, sql, bindings, parameters=None, *, id=None, expected_revision=0, note=''):
        label = title(label)
        if not isinstance(sql,str) or not sql.strip() or len(sql)>100000:
            raise PreparationError('Enter a single SQL SELECT, up to 100,000 characters')
        if not isinstance(bindings,dict) or not bindings or len(bindings)>32:
            raise PreparationError('Select 1–32 source aliases for the recipe')
        if len({a.casefold() for a in bindings}) != len(bindings): raise PreparationError('Source aliases must be unique ignoring case')
        for alias,source_id in bindings.items():
            name(alias,'Recipe alias'); self.get('sources',source_id)
        parameters = {} if parameters is None else parameters
        if not isinstance(parameters,dict) or any(not NAME.fullmatch(k) or not (v is None or type(v) in (str,int,bool)) for k,v in parameters.items()):
            raise PreparationError('Parameters must be a named object of text, null, boolean or integer values; use text for decimal amounts')
        if not isinstance(note,str) or len(note)>20000: raise PreparationError('Recipe note exceeds 20,000 characters')
        with self.mutation():
            if id:
                previous = self.get('recipes',id)
                if previous['revision'] != expected_revision: raise PreparationError('Recipe changed; reload before saving another edition')
                revision = expected_revision+1
            else:
                id = 'q_'+uuid.uuid4().hex; revision = 1
            record = {'id':id,'revision':revision,'label':label,'sql':sql,'bindings':bindings,'parameters':parameters,'note':note,'createdAt':now()}
            with self.connection() as db:
                db.execute('INSERT INTO recipes VALUES(?,?,?)',(id,revision,dumps(record)))
            return record

    def enqueue(self, recipe_id, revision=None, *, previous_run=None):
        recipe = self.get('recipes',recipe_id,revision)
        with self.mutation():
            run = {'id':'r_'+uuid.uuid4().hex,'label':recipe['label'],'recipe':recipe,'status':'QUEUED',
                   'createdAt':now(),'rows':0,'previousRun':previous_run}
            self._set_run(run)
            return run

    def rerun(self, run_id):
        run = self.get('runs',run_id)
        return self.enqueue(run['recipe']['id'],run['recipe']['revision'],previous_run=run_id)

    def cancel(self, run_id):
        run = self.get('runs',run_id)
        if run['status'] in {'QUEUED','RUNNING'}:
            (self.root/'cancel'/key(run_id)).touch(mode=0o600,exist_ok=True)
        return {'id':run_id,'requested':run['status'] in {'QUEUED','RUNNING'}}

    def _query_connection(self, recipe):
        db = sqlite3.connect((self.root/'workspace.sqlite').as_uri()+'?mode=ro',uri=True,timeout=15)
        db.execute('PRAGMA trusted_schema=OFF'); db.execute('PRAGMA temp_store=FILE')
        db.execute('PRAGMA cache_size=-16384')
        db.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 2 * MAX_CELL)
        db.setlimit(sqlite3.SQLITE_LIMIT_SQL_LENGTH, 100000)
        db.setlimit(sqlite3.SQLITE_LIMIT_COLUMN, 256)
        decimal_functions(db)
        aliases = set(recipe['bindings']); tables = set(recipe['bindings'].values())
        for alias,source_id in recipe['bindings'].items():
            source = self.get('sources',source_id)
            db.execute(f'CREATE TEMP VIEW {ident(alias)} AS SELECT {",".join(ident(c) for c in source["columns"])} FROM main.{ident(source_id)}')
        selected_reads = set()
        def authorizer(action, arg1,arg2, database,source):
            if action in {sqlite3.SQLITE_SELECT,sqlite3.SQLITE_RECURSIVE}: return sqlite3.SQLITE_OK
            if action==sqlite3.SQLITE_FUNCTION:
                return sqlite3.SQLITE_DENY if str(arg2).lower() in {'load_extension','readfile','writefile','fts3_tokenizer'} else sqlite3.SQLITE_OK
            if action==sqlite3.SQLITE_READ:
                if database=='temp' and arg1 in aliases: return sqlite3.SQLITE_OK
                if database=='main' and arg1 in tables and source in aliases:
                    selected_reads.add(arg1)
                    return sqlite3.SQLITE_OK
                # SQLite count(*) may emit a second column-free table read with
                # no view context. Permit it only after that selected view has
                # authorized the table; unrelated/control tables remain denied.
                # https://sqlite.org/c3ref/set_authorizer.html
                if database=='main' and arg1 in selected_reads and arg2=='':
                    return sqlite3.SQLITE_OK
            return sqlite3.SQLITE_DENY
        db.set_authorizer(authorizer)
        return db

    def execute(self, run_id):
        run_id = key(run_id)
        with self.mutation():
            run = self.get('runs',run_id)
            if run['status']!='QUEUED': raise PreparationError('Only queued runs can execute; use rerun for a saved edition')
            cancel = self.root/'cancel'/run_id
            run.update(status='RUNNING',startedAt=now(),rows=0)
            self._set_run(run)
            staging = self.root/'staging'/run_id
            staging.mkdir(mode=0o700,exist_ok=False)
            db = result = None
            last = time.monotonic()
            try:
                if cancel.exists(): raise Cancelled('Cancelled before execution')
                db = self._query_connection(run['recipe'])
                db.set_progress_handler(lambda: 1 if cancel.exists() else 0,10000)
                cursor = db.execute(run['recipe']['sql'],run['recipe']['parameters'])
                if cursor.description is None: raise PreparationError('Recipe must return rows')
                columns = _columns([d[0] for d in cursor.description])
                result = sqlite3.connect(staging/'result.sqlite')
                result.execute('CREATE TABLE data ('+','.join(ident(c)+' TEXT' for c in columns)+')')
                insert = 'INSERT INTO data VALUES ('+','.join('?' for c in columns)+')'
                counts = [0]*len(columns); empties = [0]*len(columns); output_rows = 0
                with (staging/'result.csv').open('x',encoding='utf-8',newline='') as csv_out, (staging/'result.jsonl').open('x',encoding='utf-8') as json_out:
                    writer = csv.writer(csv_out,lineterminator='\n'); writer.writerow(columns)
                    batch = []
                    for values in cursor:
                        if cancel.exists(): raise Cancelled('Cancelled by operator')
                        # SQL expression results are text in the delivery. SQLite REAL
                        # remains explicitly approximate; decimal helpers return exact text.
                        row = []
                        for n,v in enumerate(values):
                            if isinstance(v,bytes): raise PreparationError('BLOB result requires an explicit SQL hex() conversion')
                            if isinstance(v,float):
                                if not __import__('math').isfinite(v): raise PreparationError('Non-finite SQL result')
                                v = repr(v)
                            else: v = _text(v)
                            counts[n] += v is None; empties[n] += v==''; row.append(v)
                        writer.writerow(row); json_out.write(dumps(dict(zip(columns,row)))+'\n')
                        batch.append(row); output_rows += 1
                        if len(batch)==1000:
                            result.executemany(insert,batch); batch.clear()
                        if time.monotonic()-last>0.5:
                            run['rows']=output_rows; self._set_run(run); last=time.monotonic()
                    if batch: result.executemany(insert,batch)
                    result.commit(); result.close(); result=None
                    for out in (csv_out,json_out): out.flush(); os.fsync(out.fileno())
                schema = {'schema':VERSION+'.result','columns':columns,'rows':output_rows,'nullCounts':counts,'emptyCounts':empties,
                          'values':'Text or null. JSONL preserves null versus empty text; CSV writes both as empty cells.',
                          'numericSemantics':'Source numbers are text. Use decimal_* functions for exact decimal arithmetic; SQLite REAL expressions are approximate.'}
                atomic_json(staging/'schema.json',schema)
                run.update(status='COMPLETE',finishedAt=now(),rows=output_rows,columns=columns,
                           files={p.name:{'bytes':p.stat().st_size,'sha256':digest(p)} for p in staging.iterdir()})
                os.replace(staging,self.root/'runs'/run_id)
                self._set_run(run)
            except Exception as exc:
                run.update(status='CANCELLED' if cancel.exists() or isinstance(exc,Cancelled) else 'FAILED',
                           finishedAt=now(),message=str(exc))
                self._set_run(run)
            finally:
                if result is not None: result.close()
                if db is not None: db.close()
                cancel.unlink(missing_ok=True)
                if staging.exists(): shutil.rmtree(staging)
            return run

    def result_page(self, run_id, offset=0, limit=100):
        run = self.get('runs',run_id); offset,limit = self._page(offset,limit)
        if run['status']!='COMPLETE': raise PreparationError('The run has no complete result')
        with contextlib.closing(sqlite3.connect((self.root/'runs'/run_id/'result.sqlite').as_uri()+'?mode=ro',uri=True)) as db:
            values = db.execute('SELECT * FROM data LIMIT ? OFFSET ?',(limit,offset)).fetchall()
        return {'columns':run['columns'],'rows':values,'offset':offset,'total':run['rows'],
                'nextOffset':offset+len(values) if offset+len(values)<run['rows'] else None}

    def review(self, run_id, decision, reviewer, note, *, expected_revision=0):
        run = self.get('runs',run_id)
        if run['status']!='COMPLETE': raise PreparationError('Review requires a complete result edition')
        if decision not in {'accept','revise','withdraw'}: raise PreparationError('Decision must be accept, revise or withdraw')
        reviewer = title(reviewer,'Reviewer')
        if not isinstance(note,str) or len(note)>20000: raise PreparationError('Review note exceeds 20,000 characters')
        with self.mutation():
            with self.connection() as db:
                old = db.execute('SELECT body FROM reviews WHERE id=?',(run_id,)).fetchone()
                previous = parse_json(old[0]) if old else {'revision':0,'history':[]}
                if expected_revision!=previous['revision']: raise PreparationError('Review changed; reload before saving')
                entry = {'decision':decision,'reviewer':reviewer,'note':note,'createdAt':now()}
                record = {'id':run_id,'revision':expected_revision+1,'history':previous['history']+[entry]}
                db.execute('INSERT OR REPLACE INTO reviews VALUES(?,?,?)',(run_id,record['revision'],dumps(record)))
        return record

    def result_file(self, run_id, file):
        run = self.get('runs',run_id)
        if run['status']!='COMPLETE' or file not in {'result.csv','result.jsonl','schema.json'}:
            raise PreparationError('Unknown complete result download')
        path = self.root/'runs'/key(run_id)/file
        if digest(path)!=run['files'][file]['sha256']: raise PreparationError('Saved result file has changed')
        return path
