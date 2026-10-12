"""One complete native customer journey, including actual process interruption.

    python -m stellar_forge_buyer.scenario_receiving NEW_DIRECTORY --rows 12000

The input is the clearly labeled authored merchandise example. This program
uses the original database importer, SQL reader, operating CLI and receiver.
It is not a provider acquisition, SDK simulation or paid purchase fixture.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import sys
import time
import uuid

from .scenario_example import create_example
from .scenario_store import ScenarioWorkspace
from .scenario_types import encode, file_digest
from .scenario_reports import export_report
from .scenario_delivery import build_delivery, receive
from .sqlite_dataset import _FORMAT


def _wait(workspace, run, timeout=180):
    deadline = time.monotonic() + timeout
    while run['status'] in ('QUEUED', 'PREPARING', 'RUNNING', 'CANCEL_REQUESTED'):
        if time.monotonic() > deadline:
            raise RuntimeError('The original operation exceeded the receiving program timeout.')
        time.sleep(.02)
        run = workspace.run(run['id'])
    return run


def _selected_request(workspace, name):
    plan = workspace.plan(name)
    return {'id': uuid.uuid4().hex, 'name': name, 'revision': plan['definition']['revision'],
            'definition_sha256': plan['sha256'], 'expected_views': plan['expected_views']}


def _replacement(workspace, root):
    """Import genuinely different authored bytes through the original importer."""
    fields = ['sku', 'channel', 'units', 'price_cents', 'cost_cents', 'shipping_cents']
    raw = (encode({'sku': 'REPLACEMENT-ONLY', 'channel': 'Direct', 'units': 1,
                   'price_cents': 10, 'cost_cents': 1, 'shipping_cents': 1}) + '\n').encode()
    path = root / 'replacement-input.jsonl'; path.write_bytes(raw); path.chmod(0o600)
    source_sha = hashlib.sha256(raw).hexdigest()
    manifest = encode({'schema': 'stellar-forge.authored-example-input.v1', 'title': 'Later authored selection',
                       'rows': 1, 'fields': fields, 'bytes': len(raw), 'sha256': source_sha}).encode()
    identity = {'schema': _FORMAT, 'manifestSha256': hashlib.sha256(manifest).hexdigest(),
                'sourceBindingSha256': source_sha, 'columns': [[f, f] for f in fields]}
    result = workspace.database._import_rows(manifest_bytes=manifest, identity=identity, fields=fields, mapped=fields,
             total=1, source={'sha256': source_sha, 'bytes': len(raw)}, opener=lambda: path.open('rb'),
             details={'dataset': {'kind': 'authored-example', 'name': 'Later example input', 'rows': 1, 'projectedFields': fields}, 'source_pages': None})
    workspace.database.activate('merchandise', result['version_id'], expected_revision=1)
    return result['version_id']


def journey(destination, *, rows=12000):
    root = Path(destination).expanduser().absolute(); root.mkdir(mode=0o700)
    started = time.monotonic()
    original = create_example(root / 'workspace', rows=rows)
    workspace_path = root / 'workspace'
    run_id = uuid.uuid4().hex
    environment = dict(os.environ, PYTHONPATH=str(Path(__file__).parent.parent))
    command = [sys.executable, '-m', 'stellar_forge_buyer.scenario_cli', 'run', '--workspace', str(workspace_path),
               '--name', 'merchandise_terms', '--id', run_id]
    with (root / 'first-process.log').open('wb') as output:
        process = subprocess.Popen(command, env=environment, stdout=output, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 120
            completed_before = []
            while time.monotonic() < deadline:
                with sqlite3.connect('file:' + str(workspace_path / 'datasets.sqlite3') + '?mode=ro', uri=True) as db:
                    completed_before = db.execute('SELECT task,sha256 FROM sf_scenario_cases WHERE run_id=? ORDER BY task', (run_id,)).fetchall()
                if len(completed_before) >= 2:
                    break
                if process.poll() is not None:
                    raise RuntimeError('The original process ended before the interruption boundary: ' + (root / 'first-process.log').read_text()[-2000:])
                time.sleep(.01)
            else:
                raise RuntimeError('No complete case reached the interruption boundary.')
            os.kill(process.pid, signal.SIGKILL)
            process.wait(timeout=10)
        finally:
            if process.poll() is None:
                process.kill(); process.wait()
    with ScenarioWorkspace(workspace_path) as workspace:
        interrupted = workspace.run(run_id)
        assert interrupted['status'] == 'INTERRUPTED'
        with workspace.database._connection(readonly=True) as db:
            retained_before = dict(db.execute('SELECT task,sha256 FROM sf_scenario_cases WHERE run_id=?', (run_id,)))
        frozen = json.loads((workspace.work / run_id / 'input.json').read_text())
        replacement = _replacement(workspace, root)
        original_query = workspace.analysis.saved_query('contribution_by_line')
        workspace.analysis.save_query('contribution_by_line', {**original_query, 'sql': 'SELECT 1 AS changed_current_query'}, expected_revision=1)
        continued = _wait(workspace, workspace.resume(run_id))
        assert continued['status'] == 'COMPLETE', continued['error']
        assert continued['result']['frozen_input'] == frozen
        assert continued['request']['expected_views'][0]['version_id'] == original['version_id'] != replacement
        with workspace.database._connection(readonly=True) as db:
            retained_after = dict(db.execute('SELECT task,sha256 FROM sf_scenario_cases WHERE run_id=?', (run_id,)))
        assert all(retained_after[k] == v for k, v in retained_before.items())
        assert continued['cases'][0]['row_count'] > 1000
        first = workspace.comparison(run_id, 0, limit=1)['items'][0]
        assert next(m for m in first['metrics'] if m['column'] == 'requested_limit')['delta'] == '0.125'
        counted = 0
        for task in continued['cases']:
            after = 0
            while True:
                page = workspace.rows(run_id, task['task'], after=after, limit=100)
                counted += len(page['items'])
                if page['next_after'] is None:
                    break
                after = page['next_after']
        assert counted == continued['result']['total_result_rows']
        review_request = {'id': uuid.uuid4().hex, 'expected_revision': 0, 'result_sha256': continued['result_sha256'],
                          'reviewer': 'Example operator', 'selected_case': 'current',
                          'note': 'Keep the reference terms for the retained authored merchandise. Review the complete rebate, carrier and volume changes before choosing a different scope.'}
        review = workspace.review(run_id, review_request)
        assert workspace.review(run_id, review_request) == review
        exports = []
        for format in ('html', 'json', 'csv'):
            request = {'id': uuid.uuid4().hex, 'run_id': run_id, 'format': format, 'review_revision': 1, 'result_sha256': continued['result_sha256']}
            result = export_report(workspace, request)
            assert export_report(workspace, request) == result
            exports.append(result)
        # Restore current selection to the original table before independent edit.
        workspace.database.activate('merchandise', original['version_id'], expected_revision=2)
        delivery = build_delivery(workspace, root / 'complete-workspace.zip')
        result = {'schema': 'stellar-forge.scenario-native-receiving.v1', 'input_rows': rows,
                  'actual_killed_process': process.pid, 'killed_returncode': process.returncode,
                  'complete_cases_before_resume': len(retained_before), 'complete_cases_preserved': True,
                  'frozen_input_preserved_across_view_and_query_change': True,
                  'run_id': run_id, 'completed_tasks': continued['completed_tasks'],
                  'complete_result_rows': counted, 'comparison_rows': sum(p['row_count'] for p in continued['result']['comparisons']),
                  'decimal_delta': '0.125', 'report_exports': exports, 'delivery': delivery}
    received = receive(root / 'complete-workspace.zip', root / 'received')
    # A second Python process uses only the delivered package, without site packages.
    script = '''import json,sys,uuid,time
sys.path.insert(0,sys.argv[1])
from stellar_forge_buyer.scenario_store import ScenarioWorkspace
with ScenarioWorkspace(sys.argv[2]) as w:
 old=w.run(sys.argv[3]); assert old['status']=='COMPLETE' and old['review']['revision']==1
 spec=old['definition']; saved=w.save({**spec,'id':uuid.uuid4().hex,'expected_revision':spec['revision'],'title':spec['title']+' — independent review'})
 p=w.plan(spec['name']); r=w.start({'id':uuid.uuid4().hex,'name':spec['name'],'revision':saved['definition']['revision'],'definition_sha256':p['sha256'],'expected_views':p['expected_views']})
 while r['status'] in ('QUEUED','PREPARING','RUNNING','CANCEL_REQUESTED'):
  time.sleep(.05);r=w.run(r['id'])
 assert r['status']=='COMPLETE',r['error']
 assert r['result']['total_result_rows']==old['result']['total_result_rows']
 print(json.dumps({'status':r['status'],'definition_revision':saved['definition']['revision'],'rows':r['result']['total_result_rows'],'original_review_revision':old['review']['revision']}))
'''
    reopened = subprocess.run([sys.executable, '-S', '-c', script, str(root / 'received' / 'application'),
                              str(root / 'received' / 'workspace'), run_id], capture_output=True, text=True, timeout=180)
    if reopened.returncode:
        raise RuntimeError('Independent delivered operation failed: ' + reopened.stderr)
    result['received_files'] = received['files']; result['independent_reopen'] = json.loads(reopened.stdout)
    result['elapsed_seconds'] = round(time.monotonic() - started, 3)
    (root / 'native-result.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory'); parser.add_argument('--rows', type=int, default=12000)
    args = parser.parse_args(argv)
    if args.rows < 2000:
        parser.error('Use at least 2,000 rows for the real interruption and complete-receiving journey.')
    print(encode(journey(args.directory, rows=args.rows)))

if __name__ == '__main__':
    main()
