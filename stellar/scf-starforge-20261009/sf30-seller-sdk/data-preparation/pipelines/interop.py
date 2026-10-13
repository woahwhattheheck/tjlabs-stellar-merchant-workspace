"""MIT. Receive the original PIPE12 project into the maintained pipeline writer.

Complete original preparation files and histories are preserved. Incoming SQL
and SQLite databases are never executed. The old project is validated by its
original receiver; the canonical receiver then validates the mapped native
relationships before committing its own metadata.
"""
from __future__ import annotations
import copy
import os
import re
import tempfile
import zipfile
from pathlib import Path

from engine import PipelineWorkspace, SCHEMA, canonical, sha, validate_definition
from preparation import PreparationError, digest, dumps, parse_json, now
from pipeline import PipelineWorkspace as OriginalWorkspace, SCHEMA as ORIGINAL_SCHEMA
from pipeline_transfer import receive_project as receive_original, _validate_received
from reuse import stage_identity, validate_reuse

ORIGIN_SCHEMA = ORIGINAL_SCHEMA + '.adoption'


def _definition(plan):
    return {'id': plan['id'], 'revision': plan['revision'], 'createdAt': plan['createdAt'],
            'label': plan['label'], 'description': plan.get('note',''), 'inputs': copy.deepcopy(plan['inputs']),
            'stages': [{**copy.deepcopy(s), 'description': ''} for s in plan['steps']],
            'outputs': list(plan['outputs']), 'order': list(plan['order'])}


def _execution_id(original_id):
    if not isinstance(original_id, str) or not re.fullmatch('b_[a-f0-9]{32}', original_id):
        raise PreparationError('Invalid original PIPE12 execution identity')
    return 'e_' + original_id[2:]


def ensure_origins(db):
    db.execute('CREATE TABLE IF NOT EXISTS pipeline_origins (id TEXT PRIMARY KEY, body TEXT NOT NULL)')


def read_origins(db):
    if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pipeline_origins'").fetchone():
        return []
    return [parse_json(row[0]) for row in db.execute('SELECT body FROM pipeline_origins ORDER BY rowid')]


def origin_inventory(workspace, origins, definitions):
    """Full original validation, including editions unused by any execution."""
    if not isinstance(origins, list):
        raise PreparationError('Original receiving history must be an array')
    indexed = {}
    old = OriginalWorkspace(workspace.native) if origins else None
    for origin in origins:
        if (not isinstance(origin, dict) or origin.get('schema') != ORIGIN_SCHEMA or
                set(origin) != {'schema','id','archiveSha256','plans','runs','receivedAt'}):
            raise PreparationError('Unsupported original pipeline receiving history')
        if not isinstance(origin['archiveSha256'],str) or not re.fullmatch('[a-f0-9]{64}',origin['archiveSha256']):
            raise PreparationError('Invalid original archive identity')
        expected = sha({k:origin[k] for k in ('schema','archiveSha256','plans','runs')})
        if origin['id'] != expected or origin['id'] in indexed:
            raise PreparationError('Original pipeline history changed or is duplicated')
        _validate_received(old, origin['plans'], origin['runs'])
        for original in origin['plans']:
            if canonical(definitions.get((original['id'],original['revision']))) != canonical(_definition(original)):
                raise PreparationError('An adopted plan edition differs from its complete original')
        indexed[origin['id']] = origin
    return indexed


def _original_run(origins, reference):
    if not isinstance(reference, dict) or set(reference) != {'origin','run'}:
        raise PreparationError('Invalid imported execution reference')
    origin = origins.get(reference['origin'])
    if not origin:
        raise PreparationError('Original pipeline history is missing')
    original = next((r for r in origin['runs'] if r['id'] == reference['run']), None)
    if original is None:
        raise PreparationError('Original pipeline execution is missing')
    return original


def validate_execution_origin(execution, origins):
    reference = execution.get('importedFrom')
    if reference is None:
        return
    original = _original_run(origins,reference)
    if (execution['id'] != _execution_id(original['id']) or
            canonical(execution['definition']) != canonical(_definition(original['plan'])) or
            canonical(execution['inputs']) != canonical(original['plan']['inputs']) or
            execution.get('nativeEngineSha256') != original['engineSha256'] or
            execution['createdAt'] != original['createdAt']):
        raise PreparationError('Adopted execution differs from its original selection')


def validate_attempt_origin(workspace, execution, stage_id, attempt, recipe, origins):
    """Return true only for a fully reconciled original native attempt."""
    reference = attempt.get('importedFrom')
    if reference is None:
        if attempt.get('retiredByAdoption'):
            raise PreparationError('Only an original imported attempt may be retired by adoption')
        return False
    if reference != execution.get('importedFrom'):
        raise PreparationError('Native attempt points to another imported execution')
    original = _original_run(origins,reference)
    stage = original['stages'].get(stage_id)
    if not stage:
        raise PreparationError('Original stage history is missing')
    expected_note = f'PIPELINE-STAGE:{original["id"]}:{stage_id}'
    if recipe['note'] != expected_note:
        raise PreparationError('Imported native recipe belongs to another original stage')
    native = workspace.native.get('runs',attempt['nativeRun']) if attempt.get('nativeRun') else None
    declared = stage['attempts']
    # A native write may have completed before the original orchestration
    # checkpoint. The immutable native recipe note is the original receiving key.
    if native and (native['recipe']['id'] != recipe['id'] or native['recipe']['revision'] != recipe['revision']):
        raise PreparationError('Imported native run differs from its original recipe')
    if native and native['id'] not in declared:
        existing = [r for r in workspace.native.records('runs')
                    if r['recipe']['note'] == expected_note]
        if native['id'] not in {r['id'] for r in existing}:
            raise PreparationError('The original lost-response native write was not found')
    if attempt.get('retiredByAdoption') and native and native['status'] == 'COMPLETE':
        raise PreparationError('A complete original result cannot be retired as unfinished')
    return True


def _lineage(original, stage, bindings, native):
    result = {}
    for alias, ref in stage['bindings'].items():
        if 'stage' in ref:
            upstream = original['stages'][ref['stage']]
            source = native.get('sources',bindings[alias])
            result[alias] = {'stage':ref['stage'],'nativeRun':upstream['nativeRunId'],
                'sourceId':source['id'],'sha256':source['sha256'],
                'format':source['format'],'rows':source['rows']}
    return result


def snapshot_from_original(workspace, plans, runs, archive_sha256):
    """Map complete original records; do not recompute any query or source."""
    origin = {'schema':ORIGIN_SCHEMA,'archiveSha256':archive_sha256,
              'plans':copy.deepcopy(plans),'runs':copy.deepcopy(runs)}
    origin['id'] = sha(origin); origin['receivedAt'] = now()
    definitions = [_definition(p) for p in plans]
    executions = []
    native_runs = workspace.native.records('runs')
    event_rows = []
    for original in runs:
        definition = _definition(original['plan']); eid = _execution_id(original['id'])
        selection = {'pipelineId':definition['id'],'revision':definition['revision'],
                     'inputs':copy.deepcopy(definition['inputs'])}
        if original.get('reuseRun'):
            selection['reuseExecution'] = _execution_id(original['reuseRun'])
        reference = {'origin':origin['id'],'run':original['id']}
        execution = {'id':eid,'requestKey':'pipe12-adopt:'+original['id'],
            'requestDigest':sha(selection),**selection,'definition':definition,
            'inputOriginals':{k:workspace.native.get('sources',v) for k,v in selection['inputs'].items()},
            'status':original['status'],'createdAt':original['createdAt'],
            'updatedAt':original.get('updatedAt',original['createdAt']),
            'nativeEngineSha256':original['engineSha256'],'importedFrom':reference,'stages':{}}
        for key in ('startedAt','finishedAt','message'):
            if key in original: execution[key]=original[key]
        for stage_def in original['plan']['steps']:
            sid=stage_def['id']; old=original['stages'][sid]
            state={'status':'PENDING' if old['status']=='PLANNED' else old['status'],'attempts':[]}
            for key in ('rows','columns','startedAt','finishedAt','message'):
                if key in old:state[key]=copy.deepcopy(old[key])
            if old.get('nativeRunId'):state['nativeRun']=old['nativeRunId']
            if old.get('resultSha256'):state['resultDigest']=old['resultSha256']
            if old['status']=='COMPLETE':
                state['finishedAt']=workspace.native.get('runs',old['nativeRunId'])['finishedAt']
                state['importedCompletedAt']=old.get('finishedAt')
            if old.get('reuseFrom'):
                state['reuseFrom']={'execution':_execution_id(old['reuseFrom']['runId']),
                                   'stage':old['reuseFrom']['stageId'],'signature':''}
            else:
                # Keep every actual native attempt, including an enqueue whose
                # response was lost before the original journal checkpoint.
                token=f'PIPELINE-STAGE:{original["id"]}:{sid}'
                found=[r for r in native_runs if r['recipe'].get('note')==token]
                ordered=list(old['attempts'])
                ordered.extend(r['id'] for r in sorted(found,key=lambda r:r['createdAt']) if r['id'] not in ordered)
                for index,rid in enumerate(ordered,1):
                    native=workspace.native.get('runs',rid);recipe=native['recipe']
                    attempt={'number':index,'status':native['status'],'createdAt':native['createdAt'],
                        'token':f'pipeline:{eid}:{sid}:{index}','bindings':copy.deepcopy(recipe['bindings']),
                        'lineage':_lineage(original,stage_def,recipe['bindings'],workspace.native),
                        'nativeRecipe':recipe['id'],'nativeRevision':recipe['revision'],
                        'nativeRun':rid,'importedFrom':reference}
                    for key in ('finishedAt','message'):
                        if key in native:attempt[key]=native[key]
                    if native['status']!='COMPLETE':attempt['retiredByAdoption']=True
                    state['attempts'].append(attempt)
                if state['status']=='COMPLETE' and (not state['attempts'] or state['attempts'][-1]['nativeRun']!=state['nativeRun']):
                    raise PreparationError('Complete original attempt order does not match its saved result')
            execution['stages'][sid]=state
        if execution['status']=='COMPLETE':
            execution['outputs']={sid:execution['stages'][sid]['nativeRun'] for sid in definition['outputs']}
        executions.append(execution)
        for index,event in enumerate(original['events']):
            event_rows.append((event.get('at',original['createdAt']),eid,index,
                {'type':event['event'],'at':event.get('at',original['createdAt']),
                 'details':{'importedOriginal':copy.deepcopy(event)}}))
        event_rows.append((origin['receivedAt'],eid,len(original['events']),
            {'type':'ORIGINAL_PROJECT_RECEIVED','at':origin['receivedAt'],
             'details':{'origin':origin['id'],'originalRun':original['id'],'archiveSha256':archive_sha256}}))
    indexed={e['id']:e for e in executions}
    for execution in executions:
        for sid,state in execution['stages'].items():
            if state.get('reuseFrom'):
                signature=stage_identity(workspace,execution,sid)
                prior=indexed[state['reuseFrom']['execution']]
                if signature is None or signature!=stage_identity(workspace,prior,sid):
                    raise PreparationError('Original reuse differs under canonical source/result identity')
                state['reuseFrom']['signature']=signature
    return {'schema':SCHEMA,'definitions':definitions,'executions':executions,
            'events':[{'sequence':i,'execution':eid,'body':body}
                for i,(_at,eid,_old,body) in enumerate(sorted(event_rows),1)],
            'origins':[origin]}


def is_original_archive(archive):
    with zipfile.ZipFile(archive) as z:
        if sorted(z.namelist())!=['manifest.json','preparation.zip']:
            return False
        if z.getinfo('manifest.json').file_size>32*1024**2:
            raise PreparationError('Original pipeline metadata exceeds its receiving allowance')
        manifest=parse_json(z.read('manifest.json').decode('utf-8'))
        return manifest.get('schema')==ORIGINAL_SCHEMA+'.project'


def receive_original_project(archive,destination,*,max_bytes=20*1024**3):
    from delivery import _receive_metadata
    archive=Path(archive).resolve();destination=Path(destination).resolve()
    if destination.exists():raise PreparationError('Receiving requires a new directory')
    destination.parent.mkdir(parents=True,exist_ok=True)
    before=digest(archive)
    with tempfile.TemporaryDirectory(dir=destination.parent,prefix='.pipeline-adoption-') as temporary:
        selected=Path(temporary)/'project'
        received=receive_original(archive,selected,max_bytes=max_bytes)
        if digest(archive)!=before:raise PreparationError('The selected archive changed during receiving')
        original=OriginalWorkspace(selected)
        workspace=PipelineWorkspace(selected)
        snapshot=snapshot_from_original(workspace,original.plans(),original.runs(),before)
        _receive_metadata(workspace,snapshot)
        destination.mkdir(mode=0o700)
        try:os.rename(selected,destination)
        except BaseException:
            try:destination.rmdir()
            except OSError:pass
            raise
    return {'path':str(destination),'pipelines':len(snapshot['definitions']),
        'executions':len(snapshot['executions']),'sources':received['sources'],
        'nativeRuns':received['nativeRuns'],'originalSchema':ORIGINAL_SCHEMA,
        'originalArchiveSha256':before,'origin':snapshot['origins'][0]['id']}
