"""Customer scenario workspace CLI; all data work uses the original engine."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import signal
import sys
import threading
import time
import uuid

from .errors import StateError
from .scenario_types import encode, fail
from .scenario_store import ScenarioWorkspace

ACTIVE = ('QUEUED', 'PREPARING', 'RUNNING', 'CANCEL_REQUESTED')

def parser():
    root = argparse.ArgumentParser(description='Retained customer SQL scenario analysis and delivery.')
    commands = root.add_subparsers(dest='command', required=True)
    example = commands.add_parser('example', help='Create the explicitly authored merchandise example.')
    example.add_argument('directory'); example.add_argument('--rows', type=int, default=80)
    receive = commands.add_parser('receive', help='Receive an exact complete workspace archive into a new directory.')
    receive.add_argument('archive'); receive.add_argument('directory'); receive.add_argument('--resume', action='store_true')
    receive.add_argument('--max-bytes', type=int, default=8 * 1024**3)
    client = commands.add_parser('client', help='Call the already-running original local server.')
    client.add_argument('operation'); client.add_argument('--connection', required=True); client.add_argument('--file')
    client.add_argument('--query', default='{}', help='JSON query parameter object for read operations.')
    for name in ('serve', 'definitions', 'save', 'plan', 'run', 'resume', 'status', 'export', 'package', 'review', 'query-save'):
        command = commands.add_parser(name)
        command.add_argument('--workspace', required=True)
        if name == 'serve':
            command.add_argument('--port', type=int, default=0)
        if name in ('save', 'query-save', 'review'):
            command.add_argument('--file', required=True)
        if name in ('plan', 'run'):
            command.add_argument('--name', required=True); command.add_argument('--revision', type=int)
        if name == 'run':
            command.add_argument('--id', default=None, help='Retain this identifier to repeat the same run request.')
            command.add_argument('--timeout', type=float, default=300); command.add_argument('--result-limit', type=int, default=1024**3)
        if name in ('resume', 'status', 'export'):
            command.add_argument('--id', required=True, help='Original run identifier.')
        if name == 'export':
            command.add_argument('--format', choices=('html', 'json', 'csv'), required=True)
            command.add_argument('--review-revision', type=int); command.add_argument('--output', required=True)
        if name == 'package':
            command.add_argument('--output', required=True)
    return root


def _wait(workspace, value):
    print(encode({'run_id': value['id'], 'status': value['status']}), file=sys.stderr, flush=True)
    try:
        while value['status'] in ACTIVE:
            time.sleep(.1)
            value = workspace.run(value['id'])
    except KeyboardInterrupt:
        workspace.cancel(value['id'])
        while workspace.run(value['id'])['status'] in ACTIVE:
            time.sleep(.05)
        raise
    return value


def _serve(workspace, port):
    from .scenario_server import ScenarioHTTPServer
    server = ScenarioHTTPServer(workspace, port)
    print(encode({'status': 'LISTENING', 'base_url': server.origin,
                  'connection_file': str(server.connection_path)}), flush=True)
    prior = {}
    def stop(*unused):
        threading.Thread(target=server.shutdown, daemon=True).start()
    for key in (signal.SIGINT, signal.SIGTERM):
        prior[key] = signal.signal(key, stop)
    try:
        server.serve_forever(poll_interval=.1)
    finally:
        server.server_close()
        for key, handler in prior.items():
            signal.signal(key, handler)
    return {'status': 'STOPPED'}


def execute(args):
    if args.command == 'example':
        from .scenario_example import create_example
        return create_example(args.directory, rows=args.rows)
    if args.command == 'receive':
        from .scenario_delivery import receive
        return receive(args.archive, args.directory, resume=args.resume, max_bytes=args.max_bytes)
    if args.command == 'client':
        from .scenario_client import ScenarioClient
        return ScenarioClient.from_file(args.connection).call(args.operation, json.loads(Path(args.file).read_text()) if args.file else None, **json.loads(args.query))
    with ScenarioWorkspace(args.workspace) as workspace:
        if args.command == 'serve':
            return _serve(workspace, args.port)
        if args.command == 'definitions':
            output, after = [], 0
            while True:
                page = workspace.definitions(after=after, limit=100)
                output.extend(page['items'])
                if page['next_after'] is None:
                    return {'items': output}
                after = page['next_after']
        if args.command == 'save':
            return workspace.save(json.loads(Path(args.file).read_text()))
        if args.command == 'query-save':
            value = json.loads(Path(args.file).read_text())
            return workspace.analysis.save_query(value['name'], value['query'], expected_revision=value['expected_revision'])
        if args.command == 'plan':
            return workspace.plan(args.name, args.revision)
        if args.command == 'run':
            plan = workspace.plan(args.name, args.revision)
            return _wait(workspace, workspace.start({'id': args.id or uuid.uuid4().hex, 'name': args.name,
                'revision': plan['definition']['revision'], 'definition_sha256': plan['sha256'],
                'expected_views': plan['expected_views'], 'options': {'query_timeout_seconds': args.timeout, 'result_limit_bytes': args.result_limit}}))
        if args.command == 'resume':
            return _wait(workspace, workspace.resume(args.id))
        if args.command == 'status':
            return workspace.run(args.id)
        if args.command == 'review':
            value = json.loads(Path(args.file).read_text())
            return workspace.review(value['run_id'], value)
        if args.command == 'package':
            from .scenario_delivery import build_delivery
            return build_delivery(workspace, args.output)
        if args.command == 'export':
            import os, shutil
            from .scenario_reports import export_report
            run = workspace.run(args.id)
            selected_revision = args.review_revision if args.review_revision is not None else (run['review']['revision'] if run['review'] else 0)
            result = export_report(workspace, {'id': uuid.uuid4().hex, 'run_id': args.id, 'format': args.format,
                'review_revision': selected_revision, 'result_sha256': run['result_sha256']})
            destination = Path(args.output).expanduser().absolute()
            fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as output, (workspace.exports / result['filename']).open('rb') as source:
                shutil.copyfileobj(source, output); output.flush(); os.fsync(output.fileno())
            return {**result, 'path': str(destination)}


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        result = execute(args)
        print(encode(result), flush=True)
        return 0 if not isinstance(result, dict) or result.get('status') not in ('FAILED', 'CANCELLED', 'INTERRUPTED') else 2
    except KeyboardInterrupt:
        print(encode({'error': 'Interrupted. Complete cases remain available for explicit resume.'}), file=sys.stderr)
        return 130
    except (StateError, ValueError, OSError, KeyError) as error:
        print(encode({'error': str(error)}), file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
