"""MIT. Loopback operator for the saved preparation pipeline workspace."""
from __future__ import annotations

import contextlib
import mimetypes
import shutil
import tempfile
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from engine import PipelineWorkspace
from preparation import PreparationError, Busy, dumps, parse_json, now
from delivery import export_project, deliver_results, report
from transfer import merchant_delivery
import zipfile

HERE = Path(__file__).resolve().parent


class OperatorServer(ThreadingHTTPServer):
    daemon_threads = False
    block_on_close = True

    def __init__(self, workspace, port=8777):
        self.workspace = workspace
        self.closed = False
        self.commissioning = None
        self.commissioning_lock = threading.RLock()
        self.jobs = {}
        self.job_lock = threading.Lock()
        self.receiving_lock = threading.Lock()
        self.received_servers = {}
        self.downloads = workspace.root / 'pipeline-deliveries'
        self.downloads.mkdir(mode=0o700, exist_ok=True)
        super().__init__(('127.0.0.1', port), OperatorHandler)
        self.origin = 'http://127.0.0.1:' + str(self.server_port)

    def start_job(self, execution_id, resume=False):
        saved = self.workspace.execution(execution_id)
        if saved['status'] == 'COMPLETE':
            return saved
        if saved['status'] != 'QUEUED' and not resume:
            raise PreparationError('Select Resume to continue an unfinished execution')
        with self.job_lock:
            active = self.jobs.get(execution_id)
            if active and active.is_alive():
                return saved
            def execute():
                try:
                    self.workspace.execute(execution_id, resume=resume)
                except Busy as exc:
                    self.mark_inactive(execution_id, 'WAITING', str(exc))
                except Exception as exc:
                    self.mark_inactive(execution_id, 'FAILED', str(exc))
            worker = threading.Thread(target=execute, name='pipeline-' + execution_id, daemon=False)
            self.jobs[execution_id] = worker
            worker.start()
        return self.workspace.execution(execution_id)

    def mark_inactive(self, execution_id, status, message):
        # A rejected competing worker must not overwrite another process's
        # newly RUNNING/COMPLETE journal. Read and write one metadata snapshot.
        with self.workspace.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            found = db.execute('SELECT body FROM pipeline_executions WHERE id=?', (execution_id,)).fetchone()
            if found:
                row = parse_json(found[0])
                if row['status'] not in {'RUNNING', 'COMPLETE', 'CANCELLED'}:
                    row.update(status=status, message=message, updatedAt=now())
                    db.execute('UPDATE pipeline_executions SET body=? WHERE id=?', (dumps(row), execution_id))
                    db.execute('INSERT INTO pipeline_events(execution,body) VALUES(?,?)',
                        (execution_id, dumps({'type': status, 'at': row['updatedAt'], 'details': {}})))
            db.execute('COMMIT')

    def receive_project(self, archive, request_key):
        from receiving import receive_project_request
        record = receive_project_request(self.workspace, archive, request_key)
        return self.open_received(record['id'])

    def open_received(self, identifier):
        from receiving import received_project
        record = received_project(self.workspace, identifier)
        return self.open_received_record(record)

    def open_received_record(self, record):
        identifier = record['id']
        with self.receiving_lock:
            if self.closed:
                raise Busy('Applications is stopping; reopen this saved project')
            existing = self.received_servers.get(identifier)
            if existing is None:
                child = OperatorServer(PipelineWorkspace(record['path']), 0)
                thread = threading.Thread(target=child.serve_forever, name='received-' + identifier, daemon=False)
                self.received_servers[identifier] = child, thread
                thread.start()
            else:
                child, thread = existing
        return {**record, 'origin': child.origin}

    def server_close(self):
        if self.closed:
            return
        self.closed = True
        # Finish HTTP writers before collecting the final owned work and children.
        super().server_close()
        with self.commissioning_lock:
            commissioning = self.commissioning
        if commissioning is not None:
            commissioning.close()
        with self.receiving_lock:
            children = list(self.received_servers.values())
        for child, thread in children:
            child.shutdown()
            child.server_close()
            thread.join()

        with self.job_lock:
            jobs = list(self.jobs.items())
        for execution_id, worker in jobs:
            if worker.is_alive():
                self.workspace.cancel(execution_id)
        for _, worker in jobs:
            worker.join()
        # The root socket and request threads were drained above.


class OperatorHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    # Bound idle keep-alive readers so owned shutdown can drain HTTP threads.
    timeout = 30
    # Full-result clients page over one local persistent connection. Avoid the
    # delayed-ACK/Nagle pause between the separately written headers and body.
    disable_nagle_algorithm = True

    def log_message(self, *_):
        pass

    @property
    def ws(self):
        return self.server.workspace

    def check_origin(self, write=False):
        if self.server.closed:
            raise Busy('Applications is stopping; reopen the saved workspace')
        expected = urlsplit(self.server.origin).netloc
        if self.headers.get('Host') != expected:
            raise PreparationError('Use the exact local application address')
        origin = self.headers.get('Origin')
        if origin and origin != self.server.origin:
            raise PreparationError('The request must come from this local application')
        if write and self.headers.get('Sec-Fetch-Site') == 'cross-site':
            raise PreparationError('Cross-site writes are not supported')

    def send_headers(self, status, kind, length, filename=None):
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(length))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        if filename:
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        self.end_headers()

    def answer(self, body, status=200):
        encoded = dumps(body).encode('utf-8')
        self.send_headers(status, 'application/json; charset=utf-8', len(encoded))
        self.wfile.write(encoded)

    def file(self, path, kind, filename=None):
        self.send_headers(200, kind, path.stat().st_size, filename)
        with path.open('rb') as stream:
            shutil.copyfileobj(stream, self.wfile, 1024 * 1024)

    def fail(self, exc):
        self.close_connection = True  # An invalid request may still have an unread body.
        self.answer({'error': str(exc)}, 409 if isinstance(exc, Busy) else 400)

    def do_GET(self):
        try:
            self.check_origin()
            parsed = urlsplit(self.path)
            query = {k: v[-1] for k, v in parse_qs(parsed.query).items()}
            path = parsed.path
            if path.startswith('/api/commissioning/'):
                from commissioning import route
                if route(self, parsed, 'GET'):
                    return
            if path in {'/', '/app.js', '/style.css'}:
                filename = 'index.html' if path == '/' else path[1:]
                return self.file(HERE / filename, {'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8', 'style.css': 'text/css; charset=utf-8'}[filename])
            if path == '/api/received':
                from receiving import received_projects
                return self.answer({'items': received_projects(self.ws)})
            if path == '/api/state': return self.answer(self.ws.state())
            if path == '/api/list': return self.answer(self.ws.list(query.get('collection', 'pipelines'), int(query.get('offset', 0)), int(query.get('limit', 100))))
            if path == '/api/definition': return self.answer(self.ws.definition(query['id'], int(query['revision']) if 'revision' in query else None))
            if path == '/api/execution': return self.answer(self.ws.execution(query['id']))
            if path == '/api/events': return self.answer(self.ws.events(query['id'], int(query.get('after', 0)), int(query.get('limit', 100))))
            if path == '/api/rows': return self.answer(self.ws.rows(query['id'], query['stage'], int(query.get('offset', 0)), int(query.get('limit', 100))))
            if path == '/api/compare': return self.answer(self.ws.compare(query['before'], query['after']))
            if path == '/api/result':
                run = self.ws.stage_result(query['id'], query['stage'])
                name = query.get('file', 'result.jsonl')
                return self.file(self.ws.native.result_file(run['id'], name), 'application/octet-stream', name)
            if path.startswith('/downloads/'):
                import re
                name = path.removeprefix('/downloads/')
                if not re.fullmatch('[a-f0-9]{32}\\.(zip|html)', name):
                    raise PreparationError('Unknown saved delivery')
                file = self.server.downloads / name
                if not file.is_file(): raise PreparationError('Saved delivery was not found')
                return self.file(file, 'application/octet-stream', 'preparation-pipeline.' + file.suffix[1:])
            self.answer({'error': 'Unknown application route'}, 404)
        except (ValueError, OSError, KeyError, TypeError) as exc:
            self.fail(exc)

    def content_length(self, maximum):
        if self.headers.get('Transfer-Encoding'):
            raise PreparationError('Supply Content-Length for this request')
        length = int(self.headers.get('Content-Length', '-1'))
        if not 0 <= length <= maximum:
            raise PreparationError('Request body exceeds its receiving allowance')
        return length

    def do_POST(self):
        try:
            self.check_origin(True)
            parsed = urlsplit(self.path)
            if parsed.path.startswith('/api/commissioning/'):
                from commissioning import route
                if route(self, parsed, 'POST'):
                    return
            if parsed.path == '/api/receive':
                query = {k: v[-1] for k, v in parse_qs(parsed.query).items()}
                remaining = self.content_length(20 * 1024**3)
                with tempfile.TemporaryDirectory(dir=self.ws.root / 'staging', prefix='receiving-') as temp:
                    archive = Path(temp) / 'project.zip'
                    with archive.open('xb') as output:
                        while remaining:
                            block = self.rfile.read(min(1024 * 1024, remaining))
                            if not block: raise PreparationError('The project upload ended before all declared bytes arrived')
                            output.write(block); remaining -= len(block)
                    result = self.server.receive_project(archive, query.get('requestKey'))
                return self.answer(result, 201)
            if parsed.path == '/api/upload':
                query = {k: v[-1] for k, v in parse_qs(parsed.query, keep_blank_values=True).items()}
                remaining = self.content_length(1024**3)
                with tempfile.TemporaryDirectory(dir=self.ws.root / 'staging') as temp:
                    file = Path(temp) / 'input'
                    with file.open('xb') as output:
                        while remaining:
                            block = self.rfile.read(min(1024 * 1024, remaining))
                            if not block: raise PreparationError('The upload ended before all declared bytes arrived')
                            output.write(block); remaining -= len(block)
                    result = self.ws.native.import_file(file, query['alias'], query.get('format', 'csv'),
                        label=query.get('label') or query.get('filename') or 'Imported input',
                        original_name=query.get('filename', 'input.csv'), null_token=query.get('nullToken'))
                return self.answer(result, 201)
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                raise PreparationError('Use application/json for operator commands')
            length = self.content_length(16 * 1024**2)
            raw = self.rfile.read(length)
            if len(raw) != length: raise PreparationError('Incomplete command body')
            body = parse_json(raw.decode('utf-8'))
            if not isinstance(body, dict): raise PreparationError('Command must be an object')
            path = parsed.path
            if path == '/api/open-received': return self.answer(self.server.open_received(body['id']))
            if path == '/api/save': return self.answer(self.ws.save(**body), 201)
            if path == '/api/from-recipe': return self.answer(self.ws.from_recipe(**body))
            if path == '/api/enqueue': return self.answer(self.ws.enqueue(**body), 201)
            if path == '/api/execute': return self.answer(self.server.start_job(body['execution_id'], body.get('resume', False)), 202)
            if path == '/api/cancel': return self.answer(self.ws.cancel(body['execution_id']))
            if path == '/api/recover': return self.answer(self.ws.recover())
            if path == '/api/review': return self.answer(self.ws.review(**body))
            if path in {'/api/export', '/api/report', '/api/deliver', '/api/merchant'}:
                suffix = '.html' if path == '/api/report' else '.zip'
                destination = self.server.downloads / (uuid.uuid4().hex + suffix)
                if path == '/api/export': result = export_project(self.ws, destination)
                elif path == '/api/report': result = report(self.ws, body['execution_id'], destination)
                elif path == '/api/deliver': result = deliver_results(self.ws, body['execution_id'], destination)
                else:
                    with tempfile.TemporaryDirectory(dir=self.server.downloads) as temp:
                        native = self.ws.stage_result(body['execution_id'], body['stage_id'])
                        merchant_delivery(self.ws.native, native['id'], Path(temp) / 'merchant')
                        with zipfile.ZipFile(destination, 'x', zipfile.ZIP_DEFLATED) as out:
                            for file in sorted((Path(temp) / 'merchant').rglob('*')):
                                if file.is_file(): out.write(file, file.relative_to(Path(temp) / 'merchant'))
                    from preparation import digest
                    result = {'bytes': destination.stat().st_size, 'sha256': digest(destination)}
                result.pop('path', None)
                return self.answer({**result, 'download': '/downloads/' + destination.name})
            self.answer({'error': 'Unknown operator command'}, 404)
        except (ValueError, OSError, KeyError, TypeError) as exc:
            self.fail(exc)


def serve(workspace, port=8777):
    server = OperatorServer(workspace, port)
    print(dumps({'origin': server.origin, 'workspace': workspace.native.info['label']}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
