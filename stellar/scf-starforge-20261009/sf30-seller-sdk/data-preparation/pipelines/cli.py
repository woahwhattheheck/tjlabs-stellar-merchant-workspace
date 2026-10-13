#!/usr/bin/env python3
"""MIT. Native pipeline CLI and retained-process JSON-lines interface."""
from __future__ import annotations
import argparse
import sys
from pathlib import Path
from engine import PipelineWorkspace
from preparation import Workspace, PreparationError, dumps, parse_json
from delivery import export_project, receive_project, report, deliver_results
from transfer import merchant_delivery


def dispatch(ws, operation, arguments):
    if not isinstance(arguments, dict):
        raise PreparationError('Arguments must be an object')
    operations = {
        'state': ws.state, 'list': ws.list, 'definition': ws.definition, 'save': ws.save,
        'from-recipe': ws.from_recipe, 'enqueue': ws.enqueue, 'execute': ws.execute,
        'resume': lambda execution_id: ws.execute(execution_id, resume=True),
        'execution': ws.execution, 'events': ws.events, 'cancel': ws.cancel,
        'recover': ws.recover, 'rows': ws.rows, 'review': ws.review, 'compare': ws.compare,
        'import': ws.native.import_file,
        'export': lambda destination: export_project(ws, destination),
        'report': lambda execution_id, destination: report(ws, execution_id, destination),
        'deliver': lambda execution_id, destination: deliver_results(ws, execution_id, destination),
        'merchant': lambda execution_id, stage_id, destination: merchant_delivery(ws.native, ws.stage_result(execution_id, stage_id)['id'], destination),
    }
    if operation not in operations:
        raise PreparationError('Unknown pipeline operation: ' + operation)
    return operations[operation](**arguments)


def main():
    p = argparse.ArgumentParser(description='Save, execute and deliver multistage data preparation.')
    p.add_argument('--workspace', required=True)
    commands = p.add_subparsers(dest='command', required=True)
    init = commands.add_parser('init'); init.add_argument('--label', default='Preparation pipelines')
    commands.add_parser('state'); commands.add_parser('rpc'); commands.add_parser('recover')
    save = commands.add_parser('save'); save.add_argument('definition'); save.add_argument('--id'); save.add_argument('--expected-revision', type=int, default=0)
    imp = commands.add_parser('import'); imp.add_argument('file'); imp.add_argument('--alias', required=True); imp.add_argument('--format', default='csv', choices=['csv', 'jsonl']); imp.add_argument('--label'); imp.add_argument('--null-token')
    run = commands.add_parser('run'); run.add_argument('pipeline_id'); run.add_argument('--request-key', required=True); run.add_argument('--revision', type=int)
    run.add_argument('--reuse-execution', help='Explicit prior execution; unchanged stages retain their original complete results'); run.add_argument('--inputs', help='Complete named source bindings as JSON')
    for command in ('execute', 'resume', 'cancel'):
        sub = commands.add_parser(command); sub.add_argument('execution_id')
    out = commands.add_parser('export'); out.add_argument('destination')
    rec = commands.add_parser('receive'); rec.add_argument('archive'); rec.add_argument('--max-bytes', type=int, default=20*1024**3)
    for command in ('report', 'deliver'):
        sub = commands.add_parser(command); sub.add_argument('execution_id'); sub.add_argument('destination')
    call = commands.add_parser('call'); call.add_argument('operation'); call.add_argument('--arguments', default='{}'); call.add_argument('--arguments-file')
    serve = commands.add_parser('serve'); serve.add_argument('--port', type=int, default=8777)
    a = p.parse_args()
    if a.command == 'receive':
        return receive_project(a.archive, a.workspace, max_bytes=a.max_bytes)
    if a.command == 'init':
        Workspace(a.workspace, create=True, label=a.label)
    ws = PipelineWorkspace(a.workspace)
    if a.command == 'serve':
        from server import serve
        return serve(ws, a.port)
    if a.command == 'rpc':
        for line in sys.stdin:
            request_id = None
            try:
                req = parse_json(line); request_id = req.get('id')
                result = dispatch(ws, req['operation'], req.get('arguments', {}))
                print(dumps({'id': request_id, 'ok': True, 'result': result}), flush=True)
            except Exception as exc:
                print(dumps({'id': request_id, 'ok': False, 'error': str(exc)}), flush=True)
        return None
    if a.command in {'state', 'init'}: return ws.state()
    if a.command == 'save': return ws.save(parse_json(Path(a.definition).read_text(encoding='utf-8')), pipeline_id=a.id, expected_revision=a.expected_revision)
    if a.command == 'import': return ws.native.import_file(a.file, a.alias, a.format, label=a.label, null_token=a.null_token)
    if a.command == 'run':
        execution = ws.enqueue(a.pipeline_id, a.request_key, revision=a.revision, inputs=parse_json(a.inputs) if a.inputs else None, reuse_execution=a.reuse_execution)
        return ws.execute(execution['id'], resume=execution['status'] not in {'QUEUED', 'COMPLETE'})
    if a.command == 'call':
        text = Path(a.arguments_file).read_text(encoding='utf-8') if a.arguments_file else a.arguments
        return dispatch(ws, a.operation, parse_json(text))
    if a.command in {'execute', 'resume', 'cancel'}: return dispatch(ws, a.command, {'execution_id': a.execution_id})
    if a.command == 'recover': return ws.recover()
    if a.command == 'export': return export_project(ws, a.destination)
    if a.command in {'report', 'deliver'}: return dispatch(ws, a.command, {'execution_id': a.execution_id, 'destination': a.destination})
    raise PreparationError('Unknown command')


if __name__ == '__main__':
    try:
        result = main()
        if result is not None:
            print(dumps(result))
            if isinstance(result, dict) and result.get('status') in {'FAILED', 'CANCELLED', 'WAITING', 'INTERRUPTED'}:
                sys.exit(2)
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print(dumps({'error': str(exc)}), file=sys.stderr)
        sys.exit(1)
