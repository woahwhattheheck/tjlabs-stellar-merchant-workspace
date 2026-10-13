"""MIT. Saved multistage preparation using the original Workspace engine.

This module owns pipeline definitions and execution journals only. Original
sources, SQL authorization, decimal arithmetic, result files and reviews remain
with preparation.Workspace. A process-wide file lease covers each actual run;
SQLite transactions protect short metadata changes across independent callers.
"""
from __future__ import annotations

import contextlib
import fcntl
import hashlib
import json
import os
import re
import sqlite3
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any

sys.path.append(str(Path(__file__).resolve().parent.parent))
from preparation import (Workspace, PreparationError, Busy, name, title, now,
                         dumps, parse_json, digest, atomic_json)

SCHEMA = 'stellar-forge.preparation-pipelines.v1'
PID = re.compile(r'^p_[a-f0-9]{32}$')
EID = re.compile(r'^e_[a-f0-9]{32}$')
STATUSES = {'QUEUED', 'RUNNING', 'WAITING', 'INTERRUPTED', 'CANCELLED', 'FAILED', 'COMPLETE'}


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def sha(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()


def identifier(value: str, pattern=PID) -> str:
    if not isinstance(value, str) or not pattern.fullmatch(value):
        raise PreparationError('Invalid pipeline or execution identifier')
    return value


def validate_definition(value: dict, native: Workspace) -> dict:
    """Return a normalized immutable definition with a complete topological order."""
    if not isinstance(value, dict):
        raise PreparationError('A pipeline definition must be an object')
    allowed = {'label', 'description', 'inputs', 'stages', 'outputs'}
    if set(value) - allowed:
        raise PreparationError('Unknown pipeline fields: ' + ', '.join(sorted(set(value) - allowed)))
    label = title(value.get('label'))
    description = value.get('description', '')
    if not isinstance(description, str) or len(description) > 20000:
        raise PreparationError('Description must be text of at most 20,000 characters')
    inputs = value.get('inputs')
    if not isinstance(inputs, dict) or not 1 <= len(inputs) <= 128:
        raise PreparationError('Select 1–128 named original inputs')
    for alias, source_id in inputs.items():
        name(alias, 'Input name')
        native.get('sources', source_id)
    if len({k.casefold() for k in inputs}) != len(inputs):
        raise PreparationError('Input names must be unique ignoring case')
    stages = value.get('stages')
    if not isinstance(stages, list) or not 1 <= len(stages) <= 128:
        raise PreparationError('A pipeline requires 1–128 stages')
    normalized = []
    stage_ids = set()
    for stage in stages:
        if not isinstance(stage, dict) or set(stage) - {'id', 'label', 'sql', 'bindings', 'parameters', 'description'}:
            raise PreparationError('Each stage requires id, label, SQL and bindings; optional parameters and description')
        sid = name(stage.get('id'), 'Stage name')
        if sid.casefold() in {k.casefold() for k in stage_ids}:
            raise PreparationError('Stage names must be unique ignoring case')
        stage_ids.add(sid)
        sql = stage.get('sql')
        if not isinstance(sql, str) or not sql.strip() or len(sql) > 100000:
            raise PreparationError('Each stage requires one read-only SQL query of at most 100,000 characters')
        bindings = stage.get('bindings')
        if not isinstance(bindings, dict) or not 1 <= len(bindings) <= 32:
            raise PreparationError('Each stage requires 1–32 SQL aliases')
        if len({k.casefold() for k in bindings}) != len(bindings):
            raise PreparationError('SQL aliases must be unique ignoring case')
        for alias, selection in bindings.items():
            name(alias, 'SQL alias')
            if not isinstance(selection, dict) or set(selection) not in ({'input'}, {'stage'}):
                raise PreparationError('Each alias selects exactly one input or previous stage')
            selected = next(iter(selection.values()))
            name(selected, 'Selected input or stage')
            if 'input' in selection and selected not in inputs:
                raise PreparationError(f'{sid}: selected input {selected} is absent')
        parameters = stage.get('parameters', {})
        if not isinstance(parameters, dict):
            raise PreparationError('Parameters must be an object')
        for k, v in parameters.items():
            name(k, 'Parameter')
            if v is not None and type(v) not in (str, int, bool):
                raise PreparationError('Parameters accept text, integers, booleans or null; use text for decimal values')
        note = stage.get('description', '')
        if not isinstance(note, str) or len(note) > 20000:
            raise PreparationError('Stage description exceeds 20,000 characters')
        normalized.append({'id': sid, 'label': title(stage.get('label', sid)), 'description': note,
                           'sql': sql, 'parameters': parameters, 'bindings': bindings})
    dependencies = {}
    for stage in normalized:
        deps = {v['stage'] for v in stage['bindings'].values() if 'stage' in v}
        if deps - stage_ids:
            raise PreparationError(stage['id'] + ': unknown upstream stage ' + ', '.join(sorted(deps - stage_ids)))
        dependencies[stage['id']] = deps
    ordered = []
    pending = [s['id'] for s in normalized]
    while pending:
        ready = [sid for sid in pending if dependencies[sid].issubset(ordered)]
        if not ready:
            raise PreparationError('Stage dependencies contain a cycle: ' + ', '.join(pending))
        ordered.extend(ready)
        pending = [sid for sid in pending if sid not in ready]
    outputs = value.get('outputs')
    if outputs is None:
        consumed = set().union(*dependencies.values())
        outputs = [sid for sid in ordered if sid not in consumed]
    if not isinstance(outputs, list) or not outputs or any(v not in stage_ids for v in outputs) or len(set(outputs)) != len(outputs):
        raise PreparationError('Outputs must select one or more distinct saved stages')
    return {'label': label, 'description': description, 'inputs': inputs,
            'stages': normalized, 'outputs': outputs, 'order': ordered}


class PipelineWorkspace:
    def __init__(self, root: str | Path):
        self.native = Workspace(root)
        self.root = self.native.root
        self.database = self.root / 'pipelines.sqlite'
        self._verified_results = {}
        self.cancel_root = self.root / 'pipeline-cancel'
        self.cancel_root.mkdir(mode=0o700, exist_ok=True)
        with self.connection() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS pipeline_meta (name TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS pipeline_definitions
                    (id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(id, revision));
                CREATE TABLE IF NOT EXISTS pipeline_executions
                    (id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, body TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS pipeline_events
                    (sequence INTEGER PRIMARY KEY AUTOINCREMENT, execution TEXT NOT NULL, body TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS pipeline_event_execution ON pipeline_events(execution,sequence);
            ''')
            db.execute('INSERT OR IGNORE INTO pipeline_meta VALUES(?,?)', ('schema', SCHEMA))
            schema = db.execute('SELECT value FROM pipeline_meta WHERE name=?', ('schema',)).fetchone()[0]
            if schema != SCHEMA:
                raise PreparationError('Unsupported pipeline workspace schema')

    @contextlib.contextmanager
    def connection(self):
        db = sqlite3.connect(self.database, timeout=15, isolation_level=None)
        try:
            db.execute('PRAGMA trusted_schema=OFF')
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('PRAGMA synchronous=FULL')
            yield db
        finally:
            db.close()

    @contextlib.contextmanager
    def lease(self):
        with (self.root / 'pipeline-executor.lock').open('a+b') as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise Busy('A pipeline is executing in this workspace; its status and cancellation remain available') from exc
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)

    def definition(self, pipeline_id, revision=None):
        identifier(pipeline_id)
        with self.connection() as db:
            row = db.execute('SELECT body FROM pipeline_definitions WHERE id=? ' +
                ('ORDER BY revision DESC LIMIT 1' if revision is None else 'AND revision=?'),
                (pipeline_id,) if revision is None else (pipeline_id, revision)).fetchone()
        if not row:
            raise PreparationError('Saved pipeline edition was not found')
        return parse_json(row[0])

    def save(self, definition, *, pipeline_id=None, expected_revision=0):
        body = validate_definition(definition, self.native)
        if type(expected_revision) is not int or expected_revision < 0:
            raise PreparationError('Expected revision must be a nonnegative integer')
        pipeline_id = identifier(pipeline_id) if pipeline_id else 'p_' + uuid.uuid4().hex
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT MAX(revision) FROM pipeline_definitions WHERE id=?', (pipeline_id,)).fetchone()[0] or 0
            if old != expected_revision:
                raise PreparationError('Pipeline changed; reload its latest edition before saving')
            body.update(id=pipeline_id, revision=old + 1, createdAt=now())
            db.execute('INSERT INTO pipeline_definitions VALUES(?,?,?)', (pipeline_id, old + 1, dumps(body)))
            db.execute('COMMIT')
        return body

    def from_recipe(self, recipe_id, revision=None):
        recipe = self.native.get('recipes', recipe_id, revision)
        return {'label': recipe['label'], 'description': recipe.get('note', ''),
                'inputs': recipe['bindings'], 'outputs': ['prepare'],
                'stages': [{'id': 'prepare', 'label': recipe['label'], 'sql': recipe['sql'],
                            'parameters': recipe['parameters'],
                            'bindings': {k: {'input': k} for k in recipe['bindings']}}]}

    def list(self, collection='pipelines', offset=0, limit=100):
        offset, limit = self.native._page(offset, limit)
        with self.connection() as db:
            if collection == 'pipelines':
                query = '''SELECT d.body FROM pipeline_definitions d JOIN
                           (SELECT id,MAX(revision) revision FROM pipeline_definitions GROUP BY id) current
                           USING(id,revision) ORDER BY d.rowid DESC'''
                total = db.execute('SELECT COUNT(DISTINCT id) FROM pipeline_definitions').fetchone()[0]
            elif collection == 'executions':
                query = 'SELECT body FROM pipeline_executions ORDER BY rowid DESC'
                total = db.execute('SELECT COUNT(*) FROM pipeline_executions').fetchone()[0]
            else:
                raise PreparationError('Collection must be pipelines or executions')
            values = [parse_json(r[0]) for r in db.execute(query + ' LIMIT ? OFFSET ?', (limit, offset))]
        return {'items': values, 'total': total, 'offset': offset,
                'nextOffset': offset + len(values) if offset + len(values) < total else None}

    def state(self):
        state = self.native.state()
        return {'schema': SCHEMA, 'label': state['label'], 'sources': state['sources'],
                'recipes': state['recipes'], 'reviews': state['reviews'],
                'pipelines': self.list('pipelines'), 'executions': self.list('executions')}

    def execution(self, execution_id):
        identifier(execution_id, EID)
        with self.connection() as db:
            row = db.execute('SELECT body FROM pipeline_executions WHERE id=?', (execution_id,)).fetchone()
        if not row:
            raise PreparationError('Saved pipeline execution was not found')
        return parse_json(row[0])

    def _write(self, execution, event, *, details=None):
        execution['updatedAt'] = now()
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('UPDATE pipeline_executions SET body=? WHERE id=?', (dumps(execution), execution['id']))
            db.execute('INSERT INTO pipeline_events(execution,body) VALUES(?,?)',
                       (execution['id'], dumps({'type': event, 'at': execution['updatedAt'], 'details': details or {}})))
            db.execute('COMMIT')

    def events(self, execution_id, after=0, limit=100):
        self.execution(execution_id)
        after, limit = self.native._page(after, limit)
        with self.connection() as db:
            rows = db.execute('SELECT sequence,body FROM pipeline_events WHERE execution=? AND sequence>? ORDER BY sequence LIMIT ?',
                              (execution_id, after, limit + 1)).fetchall()
        items = [{'sequence': seq, **parse_json(body)} for seq, body in rows[:limit]]
        return {'items': items, 'nextAfter': items[-1]['sequence'] if len(rows) > limit else None}

    def enqueue(self, pipeline_id, request_key, *, revision=None, inputs=None, reuse_execution=None):
        from reuse import engine_identity
        if not isinstance(request_key, str) or not request_key.strip() or len(request_key) > 200:
            raise PreparationError('Supply a stable request key of 1–200 characters; reuse it after a lost response')
        definition = self.definition(pipeline_id, revision)
        bindings = definition['inputs'] if inputs is None else inputs
        if not isinstance(bindings, dict) or set(bindings) != set(definition['inputs']):
            raise PreparationError('An input selection must name every declared pipeline input, without extras')
        originals = {k: self.native.get('sources', v) for k, v in bindings.items()}
        selection = {'pipelineId': pipeline_id, 'revision': definition['revision'], 'inputs': bindings}
        if reuse_execution is not None:
            previous = self.execution(reuse_execution)
            if previous['status'] == 'RUNNING':
                raise PreparationError('Select a saved, non-running prior execution for explicit result reuse')
            selection['reuseExecution'] = previous['id']
        fingerprint = sha(selection)
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            previous = db.execute('SELECT body FROM pipeline_executions WHERE request_key=?', (request_key,)).fetchone()
            if previous:
                body = parse_json(previous[0])
                if body['requestDigest'] != fingerprint:
                    raise PreparationError('That request key already belongs to a different pipeline edition or input selection')
                return body
            body = {'id': 'e_' + uuid.uuid4().hex, 'requestKey': request_key, 'requestDigest': fingerprint,
                    **selection, 'definition': definition, 'inputOriginals': originals, 'nativeEngineSha256': engine_identity(),
                    'status': 'QUEUED', 'createdAt': now(), 'stages': {s['id']: {'status': 'PENDING', 'attempts': []} for s in definition['stages']}}
            db.execute('INSERT INTO pipeline_executions VALUES(?,?,?)', (body['id'], request_key, dumps(body)))
            db.execute('INSERT INTO pipeline_events(execution,body) VALUES(?,?)',
                       (body['id'], dumps({'type': 'QUEUED', 'at': body['createdAt'], 'details': selection})))
            db.execute('COMMIT')
        return body

    def cancel(self, execution_id):
        record = self.execution(execution_id)
        requested = record['status'] in {'QUEUED', 'RUNNING', 'WAITING', 'INTERRUPTED'}
        if requested:
            (self.cancel_root / execution_id).touch(mode=0o600, exist_ok=True)
            for stage in record['stages'].values():
                for attempt in stage['attempts'][-1:]:
                    if attempt.get('nativeRun'):
                        self.native.cancel(attempt['nativeRun'])
        return {'id': execution_id, 'requested': requested}

    def recover(self):
        with self.lease():
            original = self.native.recover()
            with self.connection() as db:
                records = [parse_json(r[0]) for r in db.execute('SELECT body FROM pipeline_executions')]
            changed = []
            for record in records:
                if record['status'] == 'RUNNING':
                    record.update(status='INTERRUPTED', message='The process ended. Resume keeps completed stages and retries only unfinished native queries.')
                    self._write(record, 'INTERRUPTED')
                    changed.append(record['id'])
            return {'executions': changed, 'native': original}

    def _validate_complete(self, state):
        run = self.native.get('runs', state['nativeRun'])
        if run['status'] != 'COMPLETE':
            raise PreparationError('A retained completed stage no longer has its original complete result')
        expected = run['files']['result.jsonl']['sha256']
        if expected != state['resultDigest']:
            raise PreparationError('A completed stage result changed')
        path = self.root / 'runs' / run['id'] / 'result.jsonl'
        stat = path.stat()
        stamp = (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns, expected)
        # Full byte verification once per unchanged local file identity. Paging a
        # 100,000-row result must not rehash its entire file for each 200-row page.
        # Downloads/export still use the original engine's complete verification.
        if self._verified_results.get(run['id']) != stamp:
            self.native.result_file(run['id'], 'result.jsonl')
            after = path.stat()
            if (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns, expected) != stamp:
                raise PreparationError('The completed result changed during verification')
            self._verified_results[run['id']] = stamp
        return run

    def _stage_bindings(self, execution, stage):
        result = {}
        lineage = {}
        for alias, selected in stage['bindings'].items():
            if 'input' in selected:
                source = self.native.get('sources', execution['inputs'][selected['input']])
                original = execution['inputOriginals'][selected['input']]
                if canonical(source) != canonical(original):
                    raise PreparationError('A pinned original input record changed')
                if digest(self.root / 'originals' / source['sha256']) != source['sha256']:
                    raise PreparationError('A pinned original input file changed')
            else:
                upstream = execution['stages'][selected['stage']]
                native = self._validate_complete(upstream)
                # JSONL carries original null/empty semantics. For an empty result,
                # a header-only CSV supplies the exact columns without a fake row.
                kind = 'jsonl' if native['rows'] else 'csv'
                file = self.native.result_file(native['id'], 'result.' + kind)
                stable_alias = 'pipe_' + sha([execution['id'], stage['id'], alias])[:32]
                source = self.native.import_file(file, stable_alias, kind,
                    label=next(s['label'] for s in execution['definition']['stages'] if s['id'] == selected['stage']),
                    original_name='pipeline-stage.' + kind)
                lineage[alias] = {'stage': selected['stage'], 'nativeRun': native['id'], 'sourceId': source['id'],
                                  'sha256': source['sha256'], 'format': kind, 'rows': source['rows']}
            result[alias] = source['id']
        return result, lineage

    def _attempt(self, execution, stage, state):
        if not state['attempts'] or state['attempts'][-1].get('retiredByAdoption') or state['attempts'][-1].get('status') in {'FAILED', 'CANCELLED', 'INTERRUPTED'}:
            number = len(state['attempts']) + 1
            state['attempts'].append({'number': number, 'status': 'PLANNED', 'createdAt': now(),
                                     'token': f'pipeline:{execution["id"]}:{stage["id"]}:{number}'})
            self._write(execution, 'STAGE_PLANNED', details={'stage': stage['id'], 'attempt': number})
        attempt = state['attempts'][-1]
        bindings, lineage = self._stage_bindings(execution, stage)
        attempt['bindings'], attempt['lineage'] = bindings, lineage
        # Each attempt owns one original recipe. Its persistent note makes the
        # save boundary recoverable after the native write but before our receipt.
        if not attempt.get('nativeRecipe'):
            recipes = [r for r in self.native.records('recipes') if r.get('note') == attempt['token']]
            if len(recipes) > 1:
                raise PreparationError('Multiple native recipes have the same attempt token; select the original source before resuming')
            recipe = recipes[0] if recipes else self.native.save_recipe(stage['label'], stage['sql'], bindings,
                                               stage['parameters'], note=attempt['token'])
            if recipe['sql'] != stage['sql'] or recipe['bindings'] != bindings or recipe['parameters'] != stage['parameters']:
                raise PreparationError('The native attempt recipe differs from its frozen stage')
            attempt['nativeRecipe'] = recipe['id']
            attempt['nativeRevision'] = recipe['revision']
            self._write(execution, 'NATIVE_RECIPE_SAVED', details={'stage': stage['id']})
        if not attempt.get('nativeRun'):
            candidates = [r for r in self.native.records('runs')
                          if r['recipe']['id'] == attempt['nativeRecipe'] and r['recipe']['revision'] == attempt['nativeRevision']]
            if len(candidates) > 1:
                raise PreparationError('Multiple native runs use this attempt recipe; the original run must be selected explicitly')
            run = candidates[0] if candidates else self.native.enqueue(attempt['nativeRecipe'], attempt['nativeRevision'])
            attempt['nativeRun'] = run['id']
            self._write(execution, 'NATIVE_RUN_QUEUED', details={'stage': stage['id']})
        run = self.native.get('runs', attempt['nativeRun'])
        if run['status'] == 'RUNNING':
            # This obtains the original engine's writer lock, so it cannot mark a
            # live native writer interrupted. Only abandoned native work is reset.
            self.native.recover()
            run = self.native.get('runs', attempt['nativeRun'])
        if run['status'] in {'FAILED', 'CANCELLED', 'INTERRUPTED'}:
            attempt.update(status=run['status'], message=run.get('message', ''), finishedAt=run.get('finishedAt'))
            self._write(execution, 'NATIVE_ATTEMPT_RETAINED', details={'stage': stage['id'], 'status': run['status']})
            return None
        if run['status'] == 'QUEUED':
            attempt['status'] = state['status'] = 'RUNNING'
            self._write(execution, 'STAGE_RUNNING', details={'stage': stage['id']})
            if (self.cancel_root / execution['id']).exists():
                self.native.cancel(run['id'])
            run = self.native.execute(run['id'])
        attempt.update(status=run['status'], finishedAt=run.get('finishedAt'), message=run.get('message', ''))
        if run['status'] != 'COMPLETE':
            state['status'] = run['status']
            return run
        state.update(status='COMPLETE', nativeRun=run['id'], rows=run['rows'], columns=run['columns'],
                     resultDigest=run['files']['result.jsonl']['sha256'], finishedAt=run['finishedAt'])
        self._write(execution, 'STAGE_COMPLETE', details={'stage': stage['id'], 'rows': run['rows']})
        return run

    def execute(self, execution_id, *, resume=False):
        with self.lease():
            execution = self.execution(execution_id)
            if execution['status'] == 'COMPLETE':
                for state in execution['stages'].values():
                    self._validate_complete(state)
                return execution
            if execution['status'] != 'QUEUED' and not resume:
                raise PreparationError('Use Resume for a saved unfinished execution; its inputs remain unchanged')
            from reuse import engine_identity, try_reuse
            recorded_engine = execution.get('nativeEngineSha256')
            if recorded_engine is not None and recorded_engine != engine_identity():
                raise PreparationError('The saved unfinished execution selects another preparation version. Save a new edition and execution with the current version; the original results remain available.')
            cancel = self.cancel_root / execution_id
            if resume:
                cancel.unlink(missing_ok=True)
            if cancel.exists():
                execution.update(status='CANCELLED', finishedAt=now(), message='Cancelled before execution')
                self._write(execution, 'CANCELLED')
                return execution
            execution.update(status='RUNNING', startedAt=execution.get('startedAt', now()), message='')
            self._write(execution, 'RESUMED' if resume else 'RUNNING')
            try:
                indexed = {s['id']: s for s in execution['definition']['stages']}
                for sid in execution['definition']['order']:
                    if cancel.exists():
                        execution.update(status='CANCELLED', message='Cancelled by operator')
                        break
                    state = execution['stages'][sid]
                    if state['status'] == 'COMPLETE':
                        self._validate_complete(state)
                        continue
                    if try_reuse(self, execution, sid):
                        continue
                    native = self._attempt(execution, indexed[sid], state)
                    if native is None:
                        # One abandoned/failed attempt was reconciled. A resume
                        # retries that stage once from its original frozen recipe.
                        native = self._attempt(execution, indexed[sid], state)
                    if native['status'] != 'COMPLETE':
                        execution.update(status=native['status'], message=f'{indexed[sid]["label"]}: {native.get("message", native["status"])}')
                        self._write(execution, 'STAGE_STOPPED', details={'stage': sid})
                        break
                else:
                    execution.update(status='COMPLETE', outputs={sid: execution['stages'][sid]['nativeRun'] for sid in execution['definition']['outputs']})
                execution['finishedAt'] = now()
                self._write(execution, execution['status'])
            except Busy as exc:
                execution.update(status='WAITING', message=str(exc))
                self._write(execution, 'WAITING')
            except Exception as exc:
                execution.update(status='FAILED', message=str(exc), finishedAt=now())
                self._write(execution, 'FAILED')
            return execution

    def stage_result(self, execution_id, stage_id):
        execution = self.execution(execution_id)
        if stage_id not in execution['stages']:
            raise PreparationError('Unknown execution stage')
        state = execution['stages'][stage_id]
        if state['status'] != 'COMPLETE':
            raise PreparationError('That stage has no completed result yet')
        return self._validate_complete(state)

    def rows(self, execution_id, stage_id, offset=0, limit=100):
        return self.native.result_page(self.stage_result(execution_id, stage_id)['id'], offset, limit)

    def review(self, execution_id, stage_id, decision, reviewer, note='', expected_revision=0):
        run = self.stage_result(execution_id, stage_id)
        return self.native.review(run['id'], decision, reviewer, note, expected_revision=expected_revision)

    def compare(self, before_id, after_id):
        before, after = self.execution(before_id), self.execution(after_id)
        stages = []
        names = list(dict.fromkeys(before['definition']['order'] + after['definition']['order']))
        labels = {s['id']: s['label'] for s in before['definition']['stages'] + after['definition']['stages']}
        for sid in names:
            a, b = before['stages'].get(sid), after['stages'].get(sid)
            stages.append({'stage': sid, 'label': labels[sid],
                           'beforeStatus': a and a['status'], 'afterStatus': b and b['status'],
                           'beforeRows': a and a.get('rows'), 'afterRows': b and b.get('rows'),
                           'sameOrderedResult': a.get('resultDigest') == b.get('resultDigest') if a and b and a.get('resultDigest') and b.get('resultDigest') else None,
                           'beforeDigest': a and a.get('resultDigest'), 'afterDigest': b and b.get('resultDigest')})
        return {'schema': SCHEMA + '.comparison', 'before': before_id, 'after': after_id,
                'beforeLabel': before['definition']['label'], 'afterLabel': after['definition']['label'],
                'inputChanges': [{'input': k, 'before': before['inputs'].get(k), 'after': after['inputs'].get(k)}
                                 for k in sorted(set(before['inputs']) | set(after['inputs'])) if before['inputs'].get(k) != after['inputs'].get(k)],
                'stages': stages, 'semantics': 'Equality compares complete ordered JSONL bytes. This is not a key-matched row diff.'}

    def snapshot(self, db):
        from interop import read_origins
        body = {'schema': SCHEMA, 'definitions': [parse_json(r[0]) for r in db.execute('SELECT body FROM pipeline_definitions ORDER BY rowid')],
                'executions': [parse_json(r[0]) for r in db.execute('SELECT body FROM pipeline_executions ORDER BY rowid')],
                'events': [{'sequence': seq, 'execution': execution, 'body': parse_json(body)}
                           for seq, execution, body in db.execute('SELECT sequence,execution,body FROM pipeline_events ORDER BY sequence')]}

        origins = read_origins(db)
        if origins:
            body['origins'] = origins
        return body
