#!/usr/bin/env python3
"""Operate a retained dbt run, saved improvement plan, or complete handover. MIT."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys
from engine import RunOptimization, Project
from dbt_store import ProjectError, create_file, json_bytes, regular_open, require


def main(argv=None):
    parser = argparse.ArgumentParser(description='dbt run optimization', allow_abbrev=False)
    parser.add_argument('--project', required=True, help='Original initialized dbt project directory')
    commands = parser.add_subparsers(dest='command', required=True)
    cmd = commands.add_parser('call', help='Use one complete native operation')
    cmd.add_argument('action')
    cmd.add_argument('--input', help='JSON input file, or - for stdin')
    cmd.add_argument('--output', help='Create-only full JSON response file')
    commands.add_parser('stdio', help='One retained original project process for the typed client')
    web = commands.add_parser('serve', help='Open optimization and original artifact desks on one native owner')
    web.add_argument('--port', type=int, default=0)
    web.add_argument('--token-file')
    web.add_argument('--receive-root')
    web.add_argument('--expected-binding-sha256')
    web.add_argument('--max-upload-bytes', type=int, default=8*1024**3)
    args = parser.parse_args(argv)
    try:
        project = Project(args.project)
        if args.command == 'serve':
            from server import serve
            return serve(project, port=args.port, token_file=args.token_file, receive_root=args.receive_root,
                         expected_binding=args.expected_binding_sha256, max_upload=args.max_upload_bytes)
        engine = RunOptimization(project)
        if args.command == 'stdio':
            for line in sys.stdin.buffer:
                request = {}
                try:
                    request = json.loads(line)
                    require(isinstance(request, dict) and set(request) == {'id', 'action', 'input'}, 'INVALID_REQUEST')
                    require(type(request['id']) is int and request['id'] >= 0, 'INVALID_REQUEST_ID')
                    value = engine.call(request['action'], request['input'])
                    response = {'id': request['id'], 'result': value}
                except Exception as exc:
                    response = {'id': request.get('id') if isinstance(request, dict) else None, 'error': {'code': getattr(exc, 'code', 'INVALID_OPERATION'), 'message': str(exc)}}
                sys.stdout.buffer.write(json_bytes(response))
                sys.stdout.buffer.flush()
            return 0
        value = json.loads(sys.stdin.buffer.read() if args.input == '-' else Path(args.input).read_bytes()) if args.input else {}
        result = engine.call(args.action, value)
        body = json_bytes(result)
        if args.output:
            create_file(Path(args.output).absolute(), body)
        sys.stdout.buffer.write(body)
        return 0
    except (ProjectError, OSError, ValueError, TypeError, KeyError) as exc:
        sys.stderr.buffer.write(json_bytes({'error': getattr(exc, 'code', 'INVALID_OPERATION'), 'message': str(exc)}))
        return 2
    except KeyboardInterrupt:
        return 130


if __name__ == '__main__':
    raise SystemExit(main())
