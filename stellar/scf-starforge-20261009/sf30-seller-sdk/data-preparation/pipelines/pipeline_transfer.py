"""MIT. Complete pipeline reports, customer datasets and independently editable projects."""
from __future__ import annotations
import html
import os
import re
import shutil
import tempfile
import zipfile
from pathlib import Path

from pipeline import (PipelineWorkspace, SCHEMA, STATUSES, record_id, checked_plan,
                      fingerprint, PreparationError, atomic_json, digest, dumps,
                      now, parse_json, Workspace)
from transfer import export_workspace, receive_workspace, merchant_delivery, result_report, _published

PROJECT_SCHEMA = SCHEMA + '.project'


def _public_file(path, destination):
    with path.open('rb') as stream:
        os.fsync(stream.fileno())
    _published(path, destination)
    return {'path': str(destination), 'bytes': destination.stat().st_size, 'sha256': digest(destination)}


def pipeline_report(pipe: PipelineWorkspace, run_id: str, destination: str | Path) -> dict:
    run = pipe.run(run_id)
    plan = run['plan']
    esc = lambda text: html.escape(str(text), quote=True)
    rows = []
    for step in plan['steps']:
        stage = run['stages'][step['id']]
        binds = ', '.join(f'{alias} ← {next(iter(ref))}:{next(iter(ref.values()))}'
                          for alias, ref in step['bindings'].items())
        lineage = 'Selected prior result' if stage.get('reuseFrom') else 'Native stage execution'
        rows.append(f'<section><h2>{esc(step["label"])}</h2><p>{esc(step["id"])} · '
                    f'{esc(stage["status"])} · {esc(stage.get("rows", "—"))} rows · {lineage}</p>'
                    f'<p>{esc(binds)}</p><pre>{esc(step["sql"])}</pre>'
                    f'<p>Parameters: <code>{esc(dumps(step["parameters"]))}</code></p>'
                    f'<p>Native result: <code>{esc(stage.get("nativeRunId", "Pending"))}</code></p>'
                    f'<p>Result SHA-256: <code>{esc(stage.get("resultSha256", "Pending"))}</code></p></section>')
    inputs = ''.join(f'<tr><td>{esc(alias)}</td><td>{esc(pipe.native.get("sources", sid)["label"])}</td>'
                     f'<td>{esc(pipe.native.get("sources", sid)["rows"])}</td><td><code>{esc(sid)}</code></td></tr>'
                     for alias, sid in plan['inputs'].items())
    doc = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(plan['label'])} — pipeline handover</title><style>
*{{box-sizing:border-box}}body{{font:15px/1.55 system-ui,sans-serif;max-width:1060px;margin:40px auto;padding:0 24px;color:#202020;background:#fff}}
h1{{font-size:30px}}h2{{font-size:21px}}header,section{{border-bottom:1px solid #ccc;padding:12px 0 22px}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;padding:16px}}code{{overflow-wrap:anywhere}}table{{border-collapse:collapse;width:100%}}td,th{{border:1px solid #ddd;padding:9px;text-align:left;vertical-align:top}}.table{{overflow:auto}}@media print{{section{{break-inside:avoid}}body{{margin:0}}}}
</style><header><p>STARFORGE / DATA PIPELINES</p><h1>{esc(plan['label'])}</h1>
<p>Plan edition {plan['revision']} · {esc(run['status'])} · {esc(run['createdAt'])}</p>
<p>{esc(plan['note'])}</p><p>Selected customer outputs: {esc(', '.join(plan['outputs']))}</p>
<p>Run: <code>{esc(run['id'])}</code><br>Plan digest: <code>{esc(plan['digest'])}</code></p></header>
<section><h2>Retained input editions</h2><div class="table"><table><thead><tr><th>Input</th><th>Original label</th><th>Rows</th><th>Identity</th></tr></thead><tbody>{inputs}</tbody></table></div></section>
{''.join(rows)}<section><h2>Receiving and use</h2><p>Each selected output contains its complete CSV, JSON Lines and schema, with the original preparation report. JSON Lines preserves null versus empty text. CSV is a data interchange format; import text columns explicitly in spreadsheet software.</p><p>The private project archive separately contains all original inputs, intermediate results, saved plan editions and reviews. Its receiver rebuilds the original preparation workspace and does not execute a supplied database or SQL while receiving.</p></section></html>'''
    destination = Path(destination).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=destination.parent, prefix='.pipeline-report-')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write(doc)
        return _public_file(Path(temp), destination)
    finally:
        Path(temp).unlink(missing_ok=True)


def customer_delivery(pipe: PipelineWorkspace, run_id: str, destination: str | Path,
                      *, include_merchant: bool = True) -> dict:
    if type(include_merchant) is not bool:
        raise PreparationError('include_merchant must be a boolean')
    run = pipe.run(run_id)
    if run['status'] != 'COMPLETE':
        raise PreparationError('Complete this pipeline before exporting its full customer delivery; individual completed stages remain downloadable')
    destination = Path(destination).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with pipe.lock('execution'), tempfile.TemporaryDirectory(dir=destination.parent, prefix='.pipeline-delivery-') as temporary:
        root = Path(temporary)
        payload = root / 'payload'; payload.mkdir()
        outputs = {}
        for sid in run['plan']['outputs']:
            stage = run['stages'][sid]
            folder = payload / 'outputs' / sid; folder.mkdir(parents=True)
            for file in ('result.csv', 'result.jsonl', 'schema.json'):
                shutil.copyfile(pipe.native.result_file(stage['nativeRunId'], file), folder / file)
            result_report(pipe.native, stage['nativeRunId'], folder / 'preparation-report.html')
            if include_merchant:
                merchant_delivery(pipe.native, stage['nativeRunId'], folder / 'merchant', label=(run['plan']['label'] + ' / ' + sid)[:128])
            outputs[sid] = {'nativeRunId': stage['nativeRunId'], 'rows': stage['rows'],
                            'resultSha256': stage['resultSha256']}
        pipeline_report(pipe, run_id, payload / 'pipeline-report.html')
        atomic_json(payload / 'plan.json', run['plan'])
        (payload / 'README.md').write_text('# ' + run['plan']['label'] + '\n\n'
            'Open pipeline-report.html for the complete transformation and input selections. '
            'Each outputs/<stage> directory has every data row and the exact schema. '
            'Use result.jsonl for exact null/text interchange. The CSV is not formula-escaped.\n\n'
            + ('Each merchant directory is a complete original SF30 CSV dataset delivery. Start the existing dataset-cli.mjs with --dataset <directory>/dataset.json and select your normal seller/payment configuration.\n\n' if include_merchant else '')
            + 'The independently editable PRIVATE project archive is a separate export and contains retained source data.\n', encoding='utf-8')
        members = {str(p.relative_to(payload)): {'bytes': p.stat().st_size, 'sha256': digest(p)}
                   for p in payload.rglob('*') if p.is_file()}
        atomic_json(payload / 'manifest.json', {'schema': SCHEMA + '.delivery', 'createdAt': now(),
                    'runId': run_id, 'outputs': outputs, 'members': members})
        archive = root / 'delivery.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as out:
            for p in sorted(payload.rglob('*')):
                if p.is_file(): out.write(p, str(p.relative_to(payload)))
        return {**_public_file(archive, destination), 'outputs': outputs}


def export_project(pipe: PipelineWorkspace, destination: str | Path) -> dict:
    destination = Path(destination).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with pipe.lock('execution'), pipe.lock(), tempfile.TemporaryDirectory(dir=destination.parent, prefix='.pipeline-project-') as temporary:
        plans, runs = pipe.plans(), pipe.runs()
        if any(r['status'] == 'RUNNING' for r in runs):
            raise PreparationError('Recover the interrupted pipeline before exporting the private project')
        temporary = Path(temporary)
        native = export_workspace(pipe.native, temporary / 'preparation.zip')
        manifest = {'schema': PROJECT_SCHEMA, 'createdAt': now(),
                    'native': {'bytes': native['bytes'], 'sha256': native['sha256']},
                    'plans': plans, 'runs': runs}
        archive = temporary / 'project.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as out:
            out.writestr('manifest.json', dumps(manifest) + '\n')
            # Already compressed; avoid recompressing large original artifacts.
            out.write(temporary / 'preparation.zip', 'preparation.zip', compress_type=zipfile.ZIP_STORED)
        return {**_public_file(archive, destination), 'plans': len(plans), 'runs': len(runs)}


def _validate_received(pipe: PipelineWorkspace, plans: list, runs: list) -> None:
    if not isinstance(plans, list) or not isinstance(runs, list):
        raise PreparationError('Project plans and runs must be arrays')
    saved_plans, saved_runs = {}, {}
    for plan in plans:
        if not isinstance(plan, dict) or plan.get('schema') != SCHEMA + '.plan':
            raise PreparationError('Unsupported pipeline plan edition')
        pid = record_id(plan['id'], 'p'); revision = plan['revision']
        if type(revision) is not int or revision < 1 or (pid, revision) in saved_plans:
            raise PreparationError('Invalid or duplicate plan edition')
        normalized = checked_plan(pipe.native, plan)
        if plan.get('digest') != fingerprint(normalized) or plan.get('order') != normalized['order']:
            raise PreparationError('Saved plan digest or dependency order changed')
        saved_plans[pid, revision] = plan
    for pid in {key[0] for key in saved_plans}:
        versions = sorted(v for p, v in saved_plans if p == pid)
        if versions != list(range(1, len(versions) + 1)):
            raise PreparationError('Plan history has a missing revision')
    for run in runs:
        if not isinstance(run, dict) or run.get('schema') != SCHEMA + '.run':
            raise PreparationError('Unsupported pipeline run')
        rid = record_id(run['id'], 'b')
        if rid in saved_runs or run.get('status') not in STATUSES - {'RUNNING'}:
            raise PreparationError('Invalid, active or duplicate pipeline run')
        plan = run['plan']
        if saved_plans.get((plan['id'], plan['revision'])) != plan:
            raise PreparationError('Run differs from its frozen saved plan edition')
        if not re.fullmatch('[a-f0-9]{64}', run.get('engineSha256', '')):
            raise PreparationError('Invalid native engine identity')
        if not isinstance(run.get('events'), list) or not isinstance(run.get('createdAt'), str):
            raise PreparationError('Invalid retained run history')
        stages = run.get('stages')
        if not isinstance(stages, dict) or set(stages) != set(plan['order']):
            raise PreparationError('Saved stage population differs from the plan')
        definitions = {s['id']: s for s in plan['steps']}
        for sid in plan['order']:
            stage = stages[sid]
            if stage.get('id') != sid or stage.get('status') not in STATUSES | {'PLANNED'}:
                raise PreparationError('Invalid saved stage state')
            if not isinstance(stage.get('attempts'), list):
                raise PreparationError('Stage attempts must be an array')
            for attempt in stage['attempts']:
                original = pipe.native.get('runs', attempt)
                if original['recipe']['note'] != f'PIPELINE-STAGE:{rid}:{sid}':
                    raise PreparationError('Native attempt belongs to another stage')
            native_id = stage.get('nativeRunId')
            if not native_id:
                if stage['status'] == 'COMPLETE':
                    raise PreparationError('Completed stage lacks a native result')
                continue
            original = pipe.native.get('runs', native_id)
            bindings = pipe._bindings(run, definitions[sid])
            expected = fingerprint({'sql': definitions[sid]['sql'], 'parameters': definitions[sid]['parameters'],
                                    'bindings': bindings, 'engineSha256': run['engineSha256']})
            actual = fingerprint({'sql': original['recipe']['sql'], 'parameters': original['recipe']['parameters'],
                                  'bindings': original['recipe']['bindings'], 'engineSha256': run['engineSha256']})
            if stage.get('signature') != expected or expected != actual:
                raise PreparationError('Native stage differs from its frozen computation')
            if stage['status'] == 'COMPLETE':
                if original['status'] != 'COMPLETE' or original['rows'] != stage['rows'] or original['columns'] != stage['columns']:
                    raise PreparationError('Completed stage differs from its native result')
                source = pipe.native.get('sources', stage['sourceId'])
                extension = 'jsonl' if original['rows'] else 'csv'
                expected_sha = original['files']['result.' + extension]['sha256']
                if (source['sha256'] != expected_sha or source['rows'] != original['rows'] or
                    source['columns'] != original['columns'] or source['format'] != extension or
                    source['alias'] != 'stage_' + native_id[2:] or source['nullToken'] is not None or
                    stage['resultSha256'] != original['files']['result.jsonl']['sha256']):
                    raise PreparationError('Promoted stage input differs from the complete original result')
        if run['status'] == 'COMPLETE' and any(s['status'] != 'COMPLETE' for s in stages.values()):
            raise PreparationError('Completed pipeline contains incomplete stages')
        saved_runs[rid] = run
    for run in runs:
        if run.get('reuseRun') and run['reuseRun'] not in saved_runs:
            raise PreparationError('Selected reuse history is missing')
        for sid, stage in run['stages'].items():
            ref = stage.get('reuseFrom')
            if ref:
                prior = saved_runs.get(ref.get('runId'), {}).get('stages', {}).get(ref.get('stageId'))
                if (not prior or ref.get('runId') != run.get('reuseRun') or prior['status'] != 'COMPLETE'
                    or prior.get('signature') != stage.get('signature')
                    or prior.get('nativeRunId') != stage.get('nativeRunId')
                    or prior.get('sourceId') != stage.get('sourceId')):
                    raise PreparationError('Prior-result receiving provenance changed')


def receive_project(archive: str | Path, destination: str | Path, *, max_bytes: int = 20 * 1024**3) -> dict:
    archive, destination = Path(archive).resolve(), Path(destination).resolve()
    if type(max_bytes) is not int or max_bytes < 1:
        raise PreparationError('Receiving allowance must be a positive byte count')
    if destination.exists():
        raise PreparationError('Receiving requires a new directory; the original workspace is preserved')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent, prefix='.pipeline-receive-') as temporary:
        root = Path(temporary)
        with zipfile.ZipFile(archive) as z:
            if sorted(z.namelist()) != ['manifest.json', 'preparation.zip']:
                raise PreparationError('Project must contain one manifest and one complete preparation archive')
            for info in z.infolist():
                if info.is_dir() or ((info.external_attr >> 16) & 0o170000) == 0o120000:
                    raise PreparationError('Project links and directories are not accepted')
            if z.getinfo('manifest.json').file_size > 32 * 1024**2 or sum(i.file_size for i in z.infolist()) > max_bytes:
                raise PreparationError('Project exceeds the selected receiving allowance')
            manifest = parse_json(z.read('manifest.json').decode('utf-8'))
            if not isinstance(manifest, dict) or manifest.get('schema') != PROJECT_SCHEMA:
                raise PreparationError('Unsupported pipeline project format')
            info = manifest['native']
            if type(info.get('bytes')) is not int or info['bytes'] != z.getinfo('preparation.zip').file_size or not re.fullmatch('[a-f0-9]{64}', info.get('sha256', '')):
                raise PreparationError('Invalid original preparation archive identity')
            with z.open('preparation.zip') as source, (root / 'preparation.zip').open('xb') as target:
                shutil.copyfileobj(source, target, 1024 * 1024)
            if digest(root / 'preparation.zip') != info['sha256']:
                raise PreparationError('Original preparation archive changed')
        native_path = root / 'native'
        native = receive_workspace(root / 'preparation.zip', native_path, max_bytes=max_bytes)
        pipe = PipelineWorkspace(native_path)
        _validate_received(pipe, manifest['plans'], manifest['runs'])
        for plan in manifest['plans']:
            folder = pipe.root / 'plans' / plan['id']; folder.mkdir(exist_ok=True)
            atomic_json(folder / f'{plan["revision"]}.json', plan)
        for run in manifest['runs']:
            atomic_json(pipe.root / 'runs' / (run['id'] + '.json'), run)
        destination.mkdir(mode=0o700)
        try:
            os.rename(native_path, destination)
        except BaseException:
            try: destination.rmdir()
            except OSError: pass
            raise
        return {'path': str(destination), 'plans': len(manifest['plans']), 'pipelineRuns': len(manifest['runs']),
                'sources': native['sources'], 'nativeRuns': native['runs']}
