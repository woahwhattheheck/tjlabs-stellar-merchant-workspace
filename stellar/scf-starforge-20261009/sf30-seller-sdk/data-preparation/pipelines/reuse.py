"""MIT. Explicit prior-result receiving for the maintained pipeline engine.

No second executor: the original PipelineWorkspace owns admission, execution,
results and reviews. A reused stage points to the original complete native run.
"""
from __future__ import annotations
import copy
import hashlib
import re
from pathlib import Path

from engine import canonical, sha
from preparation import PreparationError, now, digest
import preparation


def engine_identity():
    return digest(Path(preparation.__file__).resolve())


def request_selection(execution):
    selection = {k: execution[k] for k in ('pipelineId', 'revision', 'inputs')}
    if execution.get('reuseExecution') is not None:
        selection['reuseExecution'] = execution['reuseExecution']
    return selection


def stage_identity(workspace, execution, stage_id):
    stage = next((s for s in execution['definition']['stages'] if s['id'] == stage_id), None)
    if stage is None:
        raise PreparationError('The selected execution has no matching stage')
    identity = execution.get('nativeEngineSha256')
    if not isinstance(identity, str) or not re.fullmatch('[a-f0-9]{64}', identity):
        return None
    sources = {}
    for alias, ref in stage['bindings'].items():
        if 'input' in ref:
            sid = execution['inputs'][ref['input']]
            original = workspace.native.get('sources', sid)
            if canonical(original) != canonical(execution['inputOriginals'][ref['input']]):
                raise PreparationError('The retained source selection changed')
            sources[alias] = {'input': sid}
        else:
            prior = execution['stages'][ref['stage']]
            if prior['status'] != 'COMPLETE':
                return None
            native = workspace._validate_complete(prior)
            sources[alias] = {'nativeRun': native['id'], 'resultDigest': prior['resultDigest']}
    return sha({'sql': stage['sql'], 'parameters': stage['parameters'],
                'sources': sources, 'nativeEngineSha256': identity})


def try_reuse(workspace, execution, stage_id):
    """Called under the original execution lease, before a native attempt."""
    selected = execution.get('reuseExecution')
    state = execution['stages'][stage_id]
    if not selected or state['attempts'] or state['status'] == 'COMPLETE':
        return False
    previous = workspace.execution(selected)
    prior = previous['stages'].get(stage_id)
    if not prior or prior['status'] != 'COMPLETE':
        state['reuseDecision'] = 'The selected prior execution has no complete matching stage.'
        return False
    signature = stage_identity(workspace, execution, stage_id)
    original = stage_identity(workspace, previous, stage_id)
    if signature is None or signature != original:
        state['reuseDecision'] = 'Compute this stage: its query, parameter, selected original result or recorded engine differs.'
        return False
    native = workspace._validate_complete(prior)
    # There is no new native attempt. Its original history remains on the
    # explicitly selected predecessor execution and travels in the same project.
    state.update(status='COMPLETE', attempts=[], nativeRun=native['id'],
                 rows=native['rows'], columns=native['columns'],
                 resultDigest=prior['resultDigest'], finishedAt=prior['finishedAt'],
                 reuseFrom={'execution': selected, 'stage': stage_id, 'signature': signature},
                 reusedAt=now(), reuseDecision='Retained the explicitly selected original result.')
    workspace._write(execution, 'STAGE_REUSED', details={'stage': stage_id,
        'originalExecution': selected, 'nativeRun': native['id'], 'signature': signature})
    return True


def validate_reuse(workspace, executions):
    """Validate all cross-execution origins after the complete inventory exists."""
    edges = {}
    for eid, execution in executions.items():
        engine = execution.get('nativeEngineSha256')
        if engine is not None and (not isinstance(engine, str) or not re.fullmatch('[a-f0-9]{64}', engine)):
            raise PreparationError('Invalid native engine identity')
        chosen = execution.get('reuseExecution')
        if chosen is not None and (chosen not in executions or chosen == eid):
            raise PreparationError('Selected prior execution is missing or self-referential')
        for sid, state in execution['stages'].items():
            ref = state.get('reuseFrom')
            if not ref:
                continue
            if not isinstance(ref, dict) or set(ref) != {'execution', 'stage', 'signature'}:
                raise PreparationError('Invalid prior-result provenance')
            original = executions.get(ref['execution'])
            prior = original and original['stages'].get(ref['stage'])
            if (chosen != ref['execution'] or ref['stage'] != sid or not prior or
                    prior['status'] != 'COMPLETE' or state['status'] != 'COMPLETE' or state['attempts']):
                raise PreparationError('A borrowed result differs from its selected original stage')
            expected = stage_identity(workspace, execution, sid)
            before = stage_identity(workspace, original, sid)
            if not expected or expected != before or ref['signature'] != expected:
                raise PreparationError('The borrowed computation differs from its frozen query or input results')
            for key in ('nativeRun', 'resultDigest', 'rows', 'columns', 'finishedAt'):
                if canonical(state.get(key)) != canonical(prior.get(key)):
                    raise PreparationError('Borrowed result metadata differs from the original result')
            workspace._validate_complete(state)
            edges[(eid, sid)] = (ref['execution'], ref['stage'])
    for start in edges:
        seen = set(); current = start
        while current in edges:
            if current in seen:
                raise PreparationError('Prior-result history contains a cycle')
            seen.add(current); current = edges[current]
