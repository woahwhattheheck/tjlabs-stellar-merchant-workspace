"""MIT. Saved, restartable multi-stage plans using the original preparation engine.

This module owns plan/run orchestration only. Workspace remains the sole source,
query, result and review writer. There are no remote calls or scheduled jobs.
"""
from __future__ import annotations

import contextlib
import hashlib
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Any

PARENT = Path(__file__).resolve().parent.parent
if str(PARENT) not in sys.path:
    sys.path.insert(0, str(PARENT))
from preparation import (Workspace, PreparationError, Busy, atomic_json, digest,
                         dumps, name, now, parse_json, title)

SCHEMA = 'stellar-forge.data-preparation.pipelines.v1'
RECORD = re.compile(r'^[pb]_[a-f0-9]{32}$')
ENGINE_SHA256 = digest(PARENT / 'preparation.py')
STATUSES = {'QUEUED', 'RUNNING', 'WAITING', 'INTERRUPTED', 'FAILED', 'CANCELLED', 'COMPLETE'}


def record_id(value: str, prefix: str) -> str:
    if not isinstance(value, str) or not RECORD.fullmatch(value) or not value.startswith(prefix + '_'):
        raise PreparationError('Invalid pipeline record identifier')
    return value


def fingerprint(value: Any) -> str:
    return hashlib.sha256(__import__('json').dumps(value, ensure_ascii=False,
        sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def tagged_id(prefix: str, request_key: str | None) -> str:
    if request_key is None:
        return prefix + '_' + uuid.uuid4().hex
    if not isinstance(request_key, str) or not 1 <= len(request_key) <= 128:
        raise PreparationError('Request key must contain 1–128 characters')
    return prefix + '_' + hashlib.sha256(request_key.encode()).hexdigest()[:32]


def checked_parameters(value: Any) -> dict:
    if not isinstance(value, dict):
        raise PreparationError('Stage parameters must be a named object')
    for key, item in value.items():
        name(key, 'Parameter')
        if item is not None and type(item) not in (str, int, bool):
            raise PreparationError('Use text for decimal parameters; values must be text, integer, boolean or null')
        if isinstance(item, int) and not isinstance(item, bool) and not -(2**63) <= item < 2**63:
            raise PreparationError('Integer parameter exceeds SQLite range; use text for large identifiers')
    return value


def checked_plan(native: Workspace, document: dict) -> dict:
    """Validate and normalize a complete graph without executing user SQL."""
    if not isinstance(document, dict):
        raise PreparationError('Plan must be an object')
    label = title(document.get('label'), 'Plan label')
    inputs = document.get('inputs')
    if not isinstance(inputs, dict) or not 1 <= len(inputs) <= 128:
        raise PreparationError('Select 1–128 retained input editions')
    if len({str(v).casefold() for v in inputs}) != len(inputs):
        raise PreparationError('Input names must be unique ignoring case')
    for alias, source in inputs.items():
        name(alias, 'Input name')
        native.get('sources', source)
    steps = document.get('steps')
    if not isinstance(steps, list) or not 1 <= len(steps) <= 128:
        raise PreparationError('Add 1–128 stages')
    ids, normalized = [], []
    for step in steps:
        if not isinstance(step, dict):
            raise PreparationError('Each stage must be an object')
        sid = name(step.get('id'), 'Stage identifier')
        if sid.casefold() in {item.casefold() for item in ids}:
            raise PreparationError('Stage identifiers must be unique ignoring case')
        ids.append(sid)
        sql = step.get('sql')
        if not isinstance(sql, str) or not sql.strip() or len(sql) > 100000:
            raise PreparationError(f'{sid}: enter one read-only SQL query of at most 100,000 characters')
        bindings = step.get('bindings')
        if not isinstance(bindings, dict) or not 1 <= len(bindings) <= 32:
            raise PreparationError(f'{sid}: select 1–32 query bindings')
        if len({str(key).casefold() for key in bindings}) != len(bindings):
            raise PreparationError(f'{sid}: query aliases must be unique ignoring case')
        copied = {}
        for alias, ref in bindings.items():
            name(alias, 'SQL alias')
            if not isinstance(ref, dict) or len(ref) != 1 or next(iter(ref)) not in {'input', 'stage'}:
                raise PreparationError(f'{sid}.{alias}: choose exactly one input or stage')
            kind, target = next(iter(ref.items()))
            if not isinstance(target, str):
                raise PreparationError('Binding target must be a name')
            if kind == 'input' and target not in inputs:
                raise PreparationError(f'{sid}: unknown input {target}')
            copied[alias] = {kind: target}
        normalized.append({'id': sid, 'label': title(step.get('label', sid), 'Stage label'),
                           'sql': sql, 'bindings': copied,
                           'parameters': checked_parameters(step.get('parameters', {}))})
    dependencies = {s['id']: {r['stage'] for r in s['bindings'].values() if 'stage' in r}
                    for s in normalized}
    for sid, edges in dependencies.items():
        if edges - set(ids):
            raise PreparationError(f'{sid}: unknown predecessor {sorted(edges-set(ids))[0]}')
    order, pending = [], set(ids)
    while pending:
        ready = [sid for sid in ids if sid in pending and dependencies[sid].issubset(order)]
        if not ready:
            raise PreparationError('Pipeline contains a dependency cycle: ' + ', '.join(sorted(pending)))
        order.extend(ready)
        pending.difference_update(ready)
    outputs = document.get('outputs')
    if not isinstance(outputs, list) or not outputs or any(not isinstance(s, str) or s not in ids for s in outputs) or len(set(outputs)) != len(outputs):
        raise PreparationError('Select one or more distinct stages for customer delivery')
    note = document.get('note', '')
    if not isinstance(note, str) or len(note) > 20000:
        raise PreparationError('Plan note exceeds 20,000 characters')
    return {'label': label, 'inputs': dict(inputs), 'steps': normalized,
            'outputs': list(outputs), 'note': note, 'order': order}


class PipelineWorkspace:
    def __init__(self, root: str | Path | Workspace):
        self.native = root if isinstance(root, Workspace) else Workspace(root)
        self.root = self.native.root / 'pipelines'
        self.root.mkdir(exist_ok=True, mode=0o700)
        for part in ('plans', 'runs', 'cancel'):
            (self.root / part).mkdir(exist_ok=True, mode=0o700)

    @contextlib.contextmanager
    def lock(self, kind='metadata'):
        import fcntl
        with (self.root / (kind + '.lock')).open('a+b') as stream:
            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise Busy('Another pipeline operation is active; status and cancellation remain available') from exc
            try:
                yield
            finally:
                fcntl.flock(stream, fcntl.LOCK_UN)

    def plans(self) -> list[dict]:
        return [parse_json(p.read_text(encoding='utf-8'))
                for p in sorted((self.root / 'plans').glob('p_*/*.json'))]

    def plan(self, plan_id: str, revision: int | None = None) -> dict:
        folder = self.root / 'plans' / record_id(plan_id, 'p')
        if revision is None:
            editions = list(folder.glob('*.json'))
            if not editions:
                raise PreparationError('Saved pipeline plan was not found')
            revision = max(int(p.stem) for p in editions)
        if type(revision) is not int or revision < 1:
            raise PreparationError('Plan revision must be a positive integer')
        file = folder / f'{revision}.json'
        if not file.is_file():
            raise PreparationError('Saved plan edition was not found')
        return parse_json(file.read_text(encoding='utf-8'))

    def run(self, run_id: str) -> dict:
        path = self.root / 'runs' / (record_id(run_id, 'b') + '.json')
        if not path.is_file():
            raise PreparationError('Saved pipeline run was not found')
        return parse_json(path.read_text(encoding='utf-8'))

    def runs(self) -> list[dict]:
        return sorted([parse_json(p.read_text(encoding='utf-8'))
                       for p in (self.root / 'runs').glob('b_*.json')], key=lambda r: r['createdAt'])

    def state(self) -> dict:
        return {'schema': SCHEMA, 'workspace': self.native.info,
                'engineSha256': ENGINE_SHA256, 'inputs': self.native.records('sources'),
                'plans': self.plans(), 'runs': self.runs()}

    def save(self, document: dict, *, plan_id: str | None = None,
             expected_revision: int = 0, request_key: str | None = None) -> dict:
        normalized = checked_plan(self.native, document)
        content_hash = fingerprint(normalized)
        if type(expected_revision) is not int or expected_revision < 0:
            raise PreparationError('Expected revision must be a nonnegative integer')
        with self.lock():
            existing = None
            pid = record_id(plan_id, 'p') if plan_id else tagged_id('p', request_key)
            folder = self.root / 'plans' / pid
            if folder.exists() and list(folder.glob('*.json')):
                existing = self.plan(pid)
            if plan_id:
                if existing is None:
                    raise PreparationError('Choose an existing plan to revise')
                if existing['revision'] != expected_revision:
                    if existing['revision'] == expected_revision + 1 and existing['digest'] == content_hash:
                        return existing  # Complete lost-response receiving of this exact edition.
                    raise PreparationError('Plan changed; reload before saving another edition')
                revision = expected_revision + 1
            else:
                if expected_revision:
                    raise PreparationError('A new plan starts at expected revision zero')
                if existing:
                    if existing['digest'] != content_hash:
                        raise PreparationError('Request key already belongs to another plan')
                    return existing
                revision = 1
            folder.mkdir(exist_ok=True, mode=0o700)
            saved = {'schema': SCHEMA + '.plan', 'id': pid, 'revision': revision,
                     'digest': content_hash, 'createdAt': now(), **normalized}
            atomic_json(folder / f'{revision}.json', saved)
            return saved

    def rebind(self, plan_id: str, expected_revision: int, inputs: dict,
               *, parameters: dict | None = None, note: str | None = None) -> dict:
        previous = self.plan(plan_id, expected_revision)
        if not isinstance(inputs, dict) or set(inputs) - set(previous['inputs']):
            raise PreparationError('Input replacements must name existing plan inputs')
        doc = {**previous, 'inputs': {**previous['inputs'], **inputs}}
        doc['steps'] = [dict(s) for s in previous['steps']]
        parameters = {} if parameters is None else parameters
        if not isinstance(parameters, dict) or set(parameters) - {s['id'] for s in doc['steps']}:
            raise PreparationError('Parameter replacements must name existing stages')
        for step in doc['steps']:
            if step['id'] in parameters:
                step['parameters'] = checked_parameters(parameters[step['id']])
        if note is not None:
            doc['note'] = note
        return self.save(doc, plan_id=plan_id, expected_revision=expected_revision)

    def compare(self, plan_id: str, before: int, after: int) -> dict:
        a, b = self.plan(plan_id, before), self.plan(plan_id, after)
        changed_inputs = [key for key in sorted(set(a['inputs']) | set(b['inputs']))
                          if a['inputs'].get(key) != b['inputs'].get(key)]
        aa, bb = {s['id']: s for s in a['steps']}, {s['id']: s for s in b['steps']}
        changed = {key for key in set(aa) | set(bb) if aa.get(key) != bb.get(key)}
        impacted = changed.copy()
        for sid in b['order']:
            for ref in bb[sid]['bindings'].values():
                if ref.get('input') in changed_inputs or ref.get('stage') in impacted:
                    impacted.add(sid)
        return {'schema': SCHEMA + '.comparison', 'planId': plan_id,
                'before': a, 'after': b, 'changedInputs': changed_inputs,
                'changedStages': sorted(changed), 'affectedStages': sorted(impacted),
                'outputsChanged': a['outputs'] != b['outputs']}

    def enqueue(self, plan_id: str, revision: int | None = None, *,
                reuse_run: str | None = None, request_key: str | None = None) -> dict:
        plan = self.plan(plan_id, revision)
        checked_plan(self.native, plan)
        if reuse_run:
            prior = self.run(reuse_run)
            if prior['status'] == 'RUNNING':
                raise PreparationError('Choose a saved, non-running reuse candidate')
        rid = tagged_id('b', request_key)
        with self.lock():
            path = self.root / 'runs' / (rid + '.json')
            if path.exists():
                old = self.run(rid)
                if (old['plan']['id'], old['plan']['revision'], old['plan']['digest'], old.get('reuseRun')) != (plan['id'], plan['revision'], plan['digest'], reuse_run):
                    raise PreparationError('Request key already belongs to another run')
                return old
            run = {'schema': SCHEMA + '.run', 'id': rid, 'plan': plan,
                   'engineSha256': ENGINE_SHA256, 'reuseRun': reuse_run,
                   'status': 'QUEUED', 'createdAt': now(), 'updatedAt': now(),
                   'events': [{'at': now(), 'event': 'QUEUED'}],
                   'stages': {sid: {'id': sid, 'status': 'PLANNED', 'attempts': []} for sid in plan['order']}}
            atomic_json(path, run)
            return run

    def _save_run(self, run: dict) -> None:
        run['updatedAt'] = now()
        with self.lock():
            atomic_json(self.root / 'runs' / (record_id(run['id'], 'b') + '.json'), run)

    def _event(self, run: dict, event: str, **fields) -> None:
        run['events'].append({'at': now(), 'event': event, **fields})

    def cancel(self, run_id: str) -> dict:
        run = self.run(run_id)
        if run['status'] == 'COMPLETE':
            return {'id': run_id, 'requested': False}
        (self.root / 'cancel' / run_id).touch(mode=0o600, exist_ok=True)
        for step in run['stages'].values():
            if step.get('nativeRunId'):
                self.native.cancel(step['nativeRunId'])
        return {'id': run_id, 'requested': True}

    def recover(self, run_id: str) -> dict:
        with self.lock('execution'):
            run = self.run(run_id)
            if run['status'] == 'COMPLETE':
                return run
            native = self.native.recover()
            for stage in run['stages'].values():
                if stage.get('nativeRunId') and stage['status'] != 'COMPLETE':
                    stage['status'] = self.native.get('runs', stage['nativeRunId'])['status']
            run.update(status='INTERRUPTED', message='Ready to resume the same frozen plan; completed native stages remain retained.')
            self._event(run, 'RECOVERED', nativeRuns=native['recovered'])
            self._save_run(run)
            return run

    def _bindings(self, run: dict, step: dict) -> dict:
        bindings = {}
        for alias, ref in step['bindings'].items():
            if 'input' in ref:
                bindings[alias] = run['plan']['inputs'][ref['input']]
            else:
                previous = run['stages'][ref['stage']]
                if previous['status'] != 'COMPLETE' or not previous.get('sourceId'):
                    raise PreparationError('Predecessor result has not been completely retained')
                bindings[alias] = previous['sourceId']
        return bindings

    def _signature(self, step: dict, bindings: dict) -> str:
        return fingerprint({'sql': step['sql'], 'parameters': step['parameters'],
                            'bindings': bindings, 'engineSha256': ENGINE_SHA256})

    def _native_recipe(self, run: dict, step: dict, bindings: dict) -> dict:
        marker = f'PIPELINE-STAGE:{run["id"]}:{step["id"]}'
        found = [recipe for recipe in self.native.records('recipes') if recipe.get('note') == marker]
        if len(found) > 1:
            raise PreparationError('Multiple native recipe editions share this stage identity; inspect the original workspace')
        if found:
            recipe = found[0]
            if (recipe['sql'], recipe['parameters'], recipe['bindings']) != (step['sql'], step['parameters'], bindings):
                raise PreparationError('Retained native stage differs from the frozen plan')
            return recipe
        return self.native.save_recipe(step['label'], step['sql'], bindings, step['parameters'], note=marker)

    def _native_attempt(self, recipe: dict, retry: bool) -> dict:
        # Receiving is keyed by original recipe identity, including the window
        # between native enqueue's commit and our own orchestration checkpoint.
        attempts = [r for r in self.native.records('runs')
                    if r['recipe']['id'] == recipe['id'] and r['recipe']['revision'] == recipe['revision']]
        if not attempts:
            return self.native.enqueue(recipe['id'], recipe['revision'])
        parent_ids = {r.get('previousRun') for r in attempts}
        heads = [r for r in attempts if r['id'] not in parent_ids]
        if len(heads) != 1:
            raise PreparationError('Native stage has competing execution heads; inspect its original run history')
        latest = heads[0]
        if latest['status'] == 'RUNNING':
            self.native.recover()  # Workspace lock refuses recovery of a live writer.
            latest = self.native.get('runs', latest['id'])
        if latest['status'] in {'FAILED', 'INTERRUPTED', 'CANCELLED'} and retry:
            return self.native.rerun(latest['id'])
        return latest

    def _promote(self, native_run: dict) -> dict:
        # Empty JSONL has no header. Its original header-only CSV supplies the
        # schema without inventing a sentinel row; nonempty JSONL preserves nulls.
        kind = 'jsonl' if native_run['rows'] else 'csv'
        file = self.native.result_file(native_run['id'], 'result.' + kind)
        return self.native.import_file(file, 'stage_' + native_run['id'][2:], kind,
            label=native_run['label'], original_name='result.' + kind)

    def _finish_stage(self, run: dict, stage: dict, native_run: dict, signature: str) -> None:
        self.native.result_file(native_run['id'], 'schema.json')
        source = self._promote(native_run)
        stage.update(status='COMPLETE', nativeRunId=native_run['id'], sourceId=source['id'],
                     signature=signature, rows=native_run['rows'], columns=native_run['columns'],
                     resultSha256=native_run['files']['result.jsonl']['sha256'], finishedAt=now())
        self._event(run, 'STAGE_COMPLETE', stage=stage['id'], nativeRunId=native_run['id'],
                    rows=native_run['rows'], reused=bool(stage.get('reuseFrom')))
        self._save_run(run)

    def execute(self, run_id: str, *, resume: bool = False) -> dict:
        with self.lock('execution'):
            run = self.run(run_id)
            if run['status'] == 'COMPLETE':
                return run
            if run['engineSha256'] != ENGINE_SHA256:
                raise PreparationError('Preparation engine changed. Enqueue a new run to select this engine explicitly')
            if run['status'] in {'FAILED', 'CANCELLED', 'INTERRUPTED', 'RUNNING'} and not resume:
                raise PreparationError('Use resume to continue this retained run explicitly')
            cancellation = self.root / 'cancel' / run_id
            if resume:
                cancellation.unlink(missing_ok=True)
                self.native.recover()
                self._event(run, 'RESUMED')
            run.update(status='RUNNING', startedAt=run.get('startedAt', now()))
            run.pop('message', None)
            self._save_run(run)
            definitions = {s['id']: s for s in run['plan']['steps']}
            try:
                for sid in run['plan']['order']:
                    if cancellation.exists():
                        run.update(status='CANCELLED', message='Cancelled by operator; completed stages remain available')
                        break
                    step, stage = definitions[sid], run['stages'][sid]
                    bindings = self._bindings(run, step)
                    signature = self._signature(step, bindings)
                    if stage['status'] == 'COMPLETE':
                        native = self.native.get('runs', stage['nativeRunId'])
                        if stage['signature'] != signature or native['status'] != 'COMPLETE':
                            raise PreparationError('A completed stage differs from this frozen plan')
                        self.native.result_file(native['id'], 'result.jsonl')
                        continue
                    prior = self.run(run['reuseRun'])['stages'].get(sid) if run.get('reuseRun') else None
                    if prior and prior['status'] == 'COMPLETE' and prior.get('signature') == signature:
                        native = self.native.get('runs', prior['nativeRunId'])
                        actual = self._signature(native['recipe'], native['recipe']['bindings'])
                        if actual != signature or native['status'] != 'COMPLETE':
                            raise PreparationError('Selected reuse result does not match the exact stage computation')
                        stage['reuseFrom'] = {'runId': run['reuseRun'], 'stageId': sid}
                        self._finish_stage(run, stage, native, signature)
                        continue
                    recipe = self._native_recipe(run, step, bindings)
                    native = self._native_attempt(recipe, resume)
                    if native['id'] not in stage['attempts']:
                        stage['attempts'].append(native['id'])
                    stage.update(status='RUNNING', nativeRunId=native['id'], signature=signature,
                                 startedAt=stage.get('startedAt', now()))
                    self._save_run(run)
                    if cancellation.exists():
                        self.native.cancel(native['id'])
                    if native['status'] == 'QUEUED':
                        native = self.native.execute(native['id'])
                    if native['status'] != 'COMPLETE':
                        stage.update(status=native['status'], message=native.get('message', 'Native stage did not finish'))
                        run.update(status=native['status'], message=f'{step["label"]}: {stage["message"]}')
                        self._event(run, 'STAGE_STOPPED', stage=sid, nativeRunId=native['id'], status=native['status'])
                        break
                    self._finish_stage(run, stage, native, signature)
                else:
                    run.update(status='COMPLETE', finishedAt=now())
                    self._event(run, 'COMPLETE')
            except Busy as exc:
                run.update(status='WAITING', message=str(exc))
                self._event(run, 'WAITING', message=str(exc))
            except Exception as exc:
                run.update(status='FAILED', message=str(exc))
                self._event(run, 'FAILED', message=str(exc))
            self._save_run(run)
            return run

    def result(self, run_id: str, stage_id: str, offset: int = 0, limit: int = 100) -> dict:
        run = self.run(run_id)
        stage = run['stages'].get(stage_id)
        if not stage or stage['status'] != 'COMPLETE':
            raise PreparationError('Choose a completed stage')
        return self.native.result_page(stage['nativeRunId'], offset, limit)

    def review(self, run_id: str, stage_id: str, decision: str, reviewer: str,
               note: str = '', expected_revision: int = 0) -> dict:
        stage = self.run(run_id)['stages'].get(stage_id)
        if not stage or stage['status'] != 'COMPLETE':
            raise PreparationError('Choose a completed stage to review')
        return self.native.review(stage['nativeRunId'], decision, reviewer, note,
                                  expected_revision=expected_revision)
