"""MIT. Full pipeline/native project delivery and independently editable receiving."""
from __future__ import annotations

import csv
import html
import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path

from engine import (PipelineWorkspace, SCHEMA, EID, STATUSES, identifier,
                    validate_definition, canonical, sha)
from preparation import PreparationError, digest, dumps, parse_json, now
from transfer import export_workspace, receive_workspace, merchant_delivery

ARCHIVE = SCHEMA + '.archive'


def _publish(path, destination):
    destination = Path(destination).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    os.link(path, destination)  # Create-only: never overwrite another delivery.
    return {'path': str(destination), 'bytes': destination.stat().st_size, 'sha256': digest(destination)}


def export_project(workspace: PipelineWorkspace, destination):
    destination = Path(destination).resolve()
    if destination.exists():
        raise PreparationError('Choose a new archive filename')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with workspace.lease(), workspace.connection() as db, tempfile.TemporaryDirectory(dir=destination.parent, prefix='.pipeline-export-') as temp:
        db.execute('BEGIN IMMEDIATE')
        snapshot = workspace.snapshot(db)
        if any(e['status'] == 'RUNNING' for e in snapshot['executions']):
            raise PreparationError('Recover the interrupted execution before exporting')
        temp = Path(temp)
        export_workspace(workspace.native, temp / 'preparation.zip')
        (temp / 'pipelines.json').write_text(dumps(snapshot) + '\n', encoding='utf-8')
        manifest = {'schema': ARCHIVE, 'createdAt': now(), 'members': {
            n: {'bytes': (temp / n).stat().st_size, 'sha256': digest(temp / n)} for n in ('preparation.zip', 'pipelines.json')}}
        archive = temp / 'project.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as out:
            out.writestr('manifest.json', dumps(manifest) + '\n')
            for member in manifest['members']:
                out.write(temp / member, member)
        result = _publish(archive, destination)
        db.execute('COMMIT')
    return {**result, 'pipelines': len(snapshot['definitions']), 'executions': len(snapshot['executions'])}


def _receive_metadata(workspace, snapshot):
    """Reconcile every execution to the received ORIGINAL recipes and results.

    Import only JSON, never an incoming SQLite file. Saved SQL is not executed
    during receiving. An actual run still requires an explicit operator action.
    """
    if snapshot.get('schema') != SCHEMA or set(snapshot) != {'schema', 'definitions', 'executions', 'events'}:
        raise PreparationError('Unsupported pipeline metadata')
    for collection in ('definitions', 'executions', 'events'):
        if not isinstance(snapshot[collection], list):
            raise PreparationError('Pipeline metadata collections must be arrays')
    definitions = {}
    native_runs = {r['id']: r for r in workspace.native.records('runs')}
    for definition in snapshot['definitions']:
        identifier(definition['id'])
        revision = definition['revision']
        key = (definition['id'], revision)
        if type(revision) is not int or revision < 1 or key in definitions:
            raise PreparationError('Duplicate or invalid pipeline edition')
        clean = validate_definition({k: definition[k] for k in ('label', 'description', 'inputs', 'stages', 'outputs')}, workspace.native)
        if canonical({**clean, 'id': definition['id'], 'revision': revision, 'createdAt': definition['createdAt']}) != canonical(definition):
            raise PreparationError('Pipeline definition or dependency order differs from its declared source')
        definitions[key] = definition
    for pipeline_id in {d[0] for d in definitions}:
        revisions = sorted(rev for p, rev in definitions if p == pipeline_id)
        if revisions != list(range(1, len(revisions) + 1)):
            raise PreparationError('Pipeline revision history has a gap')
    executions = {}
    request_keys = set()
    for execution in snapshot['executions']:
        eid = identifier(execution['id'], EID)
        if eid in executions or execution['requestKey'] in request_keys:
            raise PreparationError('Duplicate execution or request key')
        if not isinstance(execution['requestKey'], str) or not 1 <= len(execution['requestKey']) <= 200:
            raise PreparationError('Invalid saved request key')
        definition = definitions.get((execution['pipelineId'], execution['revision']))
        if definition is None or canonical(execution['definition']) != canonical(definition):
            raise PreparationError('Execution does not refer to its original pipeline edition')
        if execution['status'] not in STATUSES - {'RUNNING'}:
            raise PreparationError('A running execution must be recovered before delivery')
        inputs = execution['inputs']
        if set(inputs) != set(definition['inputs']) or set(execution['inputOriginals']) != set(inputs):
            raise PreparationError('Execution input names differ from its definition')
        if execution['requestDigest'] != sha({'pipelineId': definition['id'], 'revision': definition['revision'], 'inputs': inputs}):
            raise PreparationError('Execution request digest differs')
        for alias, source_id in inputs.items():
            if canonical(workspace.native.get('sources', source_id)) != canonical(execution['inputOriginals'][alias]):
                raise PreparationError('Execution input differs from the original received source')
        stage_defs = {s['id']: s for s in definition['stages']}
        if set(execution['stages']) != set(stage_defs):
            raise PreparationError('Execution stage inventory differs')
        for sid, stage_state in execution['stages'].items():
            if stage_state['status'] not in STATUSES | {'PENDING'}:
                raise PreparationError('Invalid stage status')
            stage = stage_defs[sid]
            for index, attempt in enumerate(stage_state['attempts'], 1):
                if attempt['number'] != index or attempt['token'] != f'pipeline:{eid}:{sid}:{index}':
                    raise PreparationError('Attempt identity differs from its original stage')
                if attempt.get('nativeRecipe'):
                    recipe = workspace.native.get('recipes', attempt['nativeRecipe'], attempt['nativeRevision'])
                    if recipe['note'] != attempt['token'] or recipe['sql'] != stage['sql'] or recipe['parameters'] != stage['parameters'] or recipe['bindings'] != attempt['bindings']:
                        raise PreparationError('Native recipe differs from the pipeline stage')
                    if set(attempt['bindings']) != set(stage['bindings']):
                        raise PreparationError('Native aliases differ from the stage')
                    for alias, selection in stage['bindings'].items():
                        source = workspace.native.get('sources', attempt['bindings'][alias])
                        if 'input' in selection:
                            if source['id'] != inputs[selection['input']]:
                                raise PreparationError('Native input selection differs')
                        else:
                            upstream = execution['stages'][selection['stage']]
                            run = native_runs.get(upstream.get('nativeRun'))
                            lineage = attempt['lineage'].get(alias)
                            kind = 'jsonl' if run and run['rows'] else 'csv'
                            if not run or run['status'] != 'COMPLETE' or not lineage or lineage['nativeRun'] != run['id'] or source['sha256'] != run['files']['result.' + kind]['sha256'] or lineage['sourceId'] != source['id']:
                                raise PreparationError('Stage input does not match its upstream complete result')
                if attempt.get('nativeRun'):
                    native = native_runs.get(attempt['nativeRun'])
                    if not native or native['recipe']['id'] != attempt['nativeRecipe'] or native['recipe']['revision'] != attempt['nativeRevision']:
                        raise PreparationError('Native run does not belong to its retained attempt')
            if stage_state['status'] == 'COMPLETE':
                native = workspace._validate_complete(stage_state)
                if not stage_state['attempts'] or native['id'] != stage_state['attempts'][-1].get('nativeRun') or native['rows'] != stage_state['rows'] or native['columns'] != stage_state['columns']:
                    raise PreparationError('Completed stage metadata differs from its native result')
        if execution['status'] == 'COMPLETE':
            if any(s['status'] != 'COMPLETE' for s in execution['stages'].values()):
                raise PreparationError('Complete execution contains an unfinished stage')
            if execution['outputs'] != {s: execution['stages'][s]['nativeRun'] for s in definition['outputs']}:
                raise PreparationError('Final output selection differs')
        executions[eid] = execution
        request_keys.add(execution['requestKey'])
    previous = 0
    for event in snapshot['events']:
        if type(event['sequence']) is not int or event['sequence'] <= previous or event['execution'] not in executions or not isinstance(event['body'], dict):
            raise PreparationError('Invalid execution event history')
        previous = event['sequence']
    with workspace.connection() as db:
        db.execute('BEGIN IMMEDIATE')
        for definition in definitions.values():
            db.execute('INSERT INTO pipeline_definitions VALUES(?,?,?)', (definition['id'], definition['revision'], dumps(definition)))
        for execution in executions.values():
            db.execute('INSERT INTO pipeline_executions VALUES(?,?,?)', (execution['id'], execution['requestKey'], dumps(execution)))
        for event in snapshot['events']:
            db.execute('INSERT INTO pipeline_events VALUES(?,?,?)', (event['sequence'], event['execution'], dumps(event['body'])))
        db.execute('COMMIT')


def receive_project(archive, destination, *, max_bytes=20 * 1024**3):
    archive, destination = Path(archive).resolve(), Path(destination).resolve()
    if destination.exists():
        raise PreparationError('Receiving requires a new directory')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent, prefix='.pipeline-receive-') as temp:
        temp = Path(temp)
        with zipfile.ZipFile(archive) as z:
            if sorted(z.namelist()) != ['manifest.json', 'pipelines.json', 'preparation.zip']:
                raise PreparationError('Pipeline archive must contain exactly its manifest, pipeline JSON and original project')
            if z.getinfo('manifest.json').file_size > 1024 * 1024 or z.getinfo('pipelines.json').file_size > 64 * 1024 * 1024:
                raise PreparationError('Pipeline metadata exceeds its receiving allowance')
            if sum(i.file_size for i in z.infolist()) > max_bytes:
                raise PreparationError('Pipeline archive exceeds its receiving allowance')
            manifest = parse_json(z.read('manifest.json').decode('utf-8'))
            if manifest.get('schema') != ARCHIVE or set(manifest.get('members', {})) != {'pipelines.json', 'preparation.zip'}:
                raise PreparationError('Unsupported pipeline archive')
            for member, info in manifest['members'].items():
                entry = z.getinfo(member)
                if entry.is_dir() or (entry.external_attr >> 16) & 0o170000 == 0o120000 or entry.file_size != info['bytes']:
                    raise PreparationError('Archive member size or kind differs')
                with z.open(member) as src, (temp / member).open('xb') as out:
                    shutil.copyfileobj(src, out, 1024 * 1024)
                if digest(temp / member) != info['sha256']:
                    raise PreparationError('Archive member digest differs: ' + member)
        native = temp / 'workspace'
        original = receive_workspace(temp / 'preparation.zip', native, max_bytes=max_bytes)
        received = PipelineWorkspace(native)
        snapshot = parse_json((temp / 'pipelines.json').read_text(encoding='utf-8'))
        _receive_metadata(received, snapshot)
        destination.mkdir(mode=0o700)
        try:
            os.rename(native, destination)
        except BaseException:
            try:
                destination.rmdir()
            except OSError:
                pass
            raise
    return {'path': str(destination), 'pipelines': len(snapshot['definitions']), 'executions': len(snapshot['executions']),
            'sources': original['sources'], 'nativeRuns': original['runs']}


def report(workspace, execution_id, destination):
    execution = workspace.execution(execution_id)
    definition = execution['definition']
    esc = lambda value: html.escape(str(value), quote=True)
    rows = []
    for sid in definition['order']:
        stage = next(s for s in definition['stages'] if s['id'] == sid)
        state = execution['stages'][sid]
        bindings = ', '.join(alias + ' ← ' + ('Input ' + v['input'] if 'input' in v else 'Stage ' + v['stage']) for alias, v in stage['bindings'].items())
        rows.append(f'<section><h2>{esc(stage["label"])}</h2><p>{esc(state["status"].capitalize())} · {state.get("rows", 0):,} rows · {len(state["attempts"])} attempts</p><p>{esc(bindings)}</p><pre>{esc(stage["sql"])}</pre><p>Parameters: {esc(canonical(stage["parameters"]))}</p></section>')
    inputs = ''.join(f'<tr><td>{esc(alias)}</td><td>{esc(src["label"])}</td><td>{src["rows"]:,}</td><td>{esc(src["originalName"])}</td></tr>' for alias, src in execution['inputOriginals'].items())
    text = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(definition['label'])}</title>
<style>body{{font:15px/1.6 system-ui,sans-serif;color:#222;background:#fff;max-width:1050px;margin:40px auto;padding:0 24px}}h1{{font-size:30px}}h2{{font-size:20px}}section{{border-top:1px solid #ccc;padding:20px 0}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f3f3;padding:16px}}table{{border-collapse:collapse;width:100%}}th,td{{padding:10px;border-bottom:1px solid #ddd;text-align:left}}@media(max-width:600px){{body{{margin:20px auto;padding:0 16px}}table{{font-size:12px}}}}@media print{{section{{break-inside:avoid}}}}</style>
<h1>{esc(definition['label'])}</h1><p>Pipeline edition {definition['revision']} · {esc(execution['status'].capitalize())}</p><p>{esc(definition['description'])}</p>
<h2>Selected original inputs</h2><table><thead><tr><th>Input</th><th>Edition label</th><th>Rows</th><th>Original filename</th></tr></thead><tbody>{inputs}</tbody></table>
{''.join(rows)}<section><h2>Receiving this work</h2><p>The project archive contains all original inputs, saved recipe editions, complete intermediate and final results, review histories and pipeline execution history. Receive it into a new directory with the pipeline CLI, then select a saved execution or edit another pipeline edition.</p><p>JSON Lines preserves null separately from empty text. CSV renders both as empty cells. Stage arithmetic uses the original preparation engine; exact decimal functions return text. Complete ordered-result equality is available in the execution comparison.</p></section></html>'''
    destination = Path(destination).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, filename = tempfile.mkstemp(dir=destination.parent, prefix='.pipeline-report-')
    with os.fdopen(fd, 'w', encoding='utf-8') as out:
        out.write(text)
    try:
        return _publish(Path(filename), destination)
    finally:
        Path(filename).unlink(missing_ok=True)


def deliver_results(workspace, execution_id, destination):
    execution = workspace.execution(execution_id)
    if execution['status'] != 'COMPLETE':
        raise PreparationError('Complete the pipeline before delivering all selected outputs')
    destination = Path(destination).resolve()
    if destination.exists():
        raise PreparationError('Choose a new result delivery filename')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent, prefix='.pipeline-results-') as temp:
        temp = Path(temp)
        report(workspace, execution_id, temp / 'report.html')
        outputs = {}
        for sid in execution['definition']['outputs']:
            run = workspace.stage_result(execution_id, sid)
            folder = temp / sid
            folder.mkdir()
            for filename in ('result.csv', 'result.jsonl', 'schema.json'):
                shutil.copyfile(workspace.native.result_file(run['id'], filename), folder / filename)
            outputs[sid] = {'rows': run['rows'], 'columns': run['columns'], 'jsonlSha256': run['files']['result.jsonl']['sha256']}
        (temp / 'outputs.json').write_text(dumps({'schema': SCHEMA + '.outputs', 'label': execution['definition']['label'], 'outputs': outputs}) + '\n', encoding='utf-8')
        archive = temp / 'results.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as out:
            for file in sorted(temp.rglob('*')):
                if file.is_file() and file != archive:
                    out.write(file, file.relative_to(temp))
        return {**_publish(archive, destination), 'outputs': outputs}
