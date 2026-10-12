"""Loopback-only operator HTTP desk for the retained customer scenario engine."""
from __future__ import annotations

from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import stat
import threading
from urllib.parse import parse_qs, urlsplit, quote
import zipfile

from .errors import StateError
from .scenario_delivery import build_delivery, DELIVERY
from .scenario_reports import export_report
from .scenario_types import SCHEMA, checksum, encode, fail, file_digest, identifier
from .scenario_ui import HTML, CSS, JS

BODY_LIMIT = 4 * 1024**2
COOKIE = 'scenario_download'


def package_export(workspace, value):
    """An acknowledged identifier always refers to the same complete archive."""
    if not isinstance(value, dict) or set(value) - {'id'}:
        fail('A workspace delivery request requires only its retained identifier.')
    operation = identifier(value.get('id'))
    request_sha = checksum({'id': operation, 'format': 'workspace'})
    with workspace.guard:
        with workspace.database._connection(readonly=True) as db:
            old = db.execute('SELECT * FROM sf_scenario_exports WHERE id=?', (operation,)).fetchone()
            if old:
                if old['request_sha256'] != request_sha:
                    fail('This delivery identifier belongs to another operation.')
                result = workspace._record(old)
                target = workspace.exports / result['filename']
                if target.is_symlink() or not target.is_file() or file_digest(target) != result['sha256']:
                    fail('This saved delivery changed or is missing. Create a new delivery identifier.')
                return result
        target = workspace.exports / (operation + '.workspace.zip')
        if target.exists():
            # Recover a completely published ZIP after its response/database
            # acknowledgement was interrupted. Never regenerate it from new data.
            if target.is_symlink():
                fail('The retained delivery file is linked.')
            with zipfile.ZipFile(target) as archive:
                manifest = json.loads(archive.read('manifest.json'))
                if manifest.get('schema') != DELIVERY or manifest.get('request_id') != operation:
                    fail('An existing archive does not belong to this delivery request.')
                entries = manifest['files']
                if len({i.filename for i in archive.infolist()}) != len(archive.infolist()) or set(i.filename for i in archive.infolist()) != {'manifest.json'} | {f['path'] for f in entries}:
                    fail('The complete delivery inventory changed.')
                for item in entries:
                    digest, size = hashlib.sha256(), 0
                    with archive.open(item['path']) as source:
                        for block in iter(lambda: source.read(1024**2), b''):
                            digest.update(block)
                            size += len(block)
                    if size != item['bytes'] or digest.hexdigest() != item['sha256']:
                        fail('The retained complete delivery changed.')
                info = {'bytes': target.stat().st_size, 'sha256': file_digest(target),
                        'files': len(entries), 'workspace': manifest['workspace']}
        else:
            info = build_delivery(workspace, target, request_id=operation)
        result = {'schema': SCHEMA + '/export', 'id': operation, 'format': 'workspace',
                  'filename': target.name, 'download_name': 'customer-scenario-workspace.zip',
                  'content_type': 'application/zip', **{k: info[k] for k in ('bytes', 'sha256', 'files', 'workspace')}}
        raw = encode(result)
        with workspace.database._connection() as db:
            db.execute('INSERT INTO sf_scenario_exports VALUES(?,?,?,?)',
                       (operation, request_sha, raw, hashlib.sha256(raw.encode()).hexdigest()))
        return result


class ScenarioHTTPServer(ThreadingHTTPServer):
    daemon_threads = False
    block_on_close = True
    allow_reuse_address = True

    def __init__(self, workspace, port=0):
        if type(port) is not int or not 0 <= port <= 65535:
            fail('Choose a local port between zero and 65535.')
        self.workspace = workspace
        self.token = secrets.token_urlsafe(32)
        self.download_token = secrets.token_urlsafe(32)
        super().__init__(('127.0.0.1', port), Handler)
        self.origin = 'http://127.0.0.1:' + str(self.server_port)
        self.hosts = {'127.0.0.1:' + str(self.server_port), 'localhost:' + str(self.server_port)}
        self.origins = {'http://' + host for host in self.hosts}
        self.connection_path = workspace.database.directory / 'scenario-connection.json'
        data = {'schema': SCHEMA + '/connection', 'url': self.origin + '/#token=' + self.token,
                'base_url': self.origin, 'token': self.token, 'pid': os.getpid()}
        temporary = self.connection_path.with_name('.scenario-connection-' + secrets.token_hex(8))
        workspace._write_private(temporary, (encode(data) + '\n').encode())
        try:
            if self.connection_path.is_symlink():
                fail('The local connection file is linked.')
            os.replace(temporary, self.connection_path)
        finally:
            temporary.unlink(missing_ok=True)

    def server_close(self):
        super().server_close()
        try:
            if not self.connection_path.is_symlink() and json.loads(self.connection_path.read_text()).get('token') == self.token:
                self.connection_path.unlink()
        except (FileNotFoundError, ValueError):
            pass


class Handler(BaseHTTPRequestHandler):
    server_version = 'CustomerScenario/1'
    sys_version = ''
    protocol_version = 'HTTP/1.1'

    def setup(self):
        super().setup()
        self.connection.settimeout(60)

    def log_message(self, *args):
        # Query text, workspace paths and local credentials are not server logs.
        pass

    def _headers(self, status, content_type='application/json', length=0, *, authenticated=False, extra=None):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(length))
        self.close_connection = True
        self.send_header('Connection', 'close')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
        if authenticated:
            self.send_header('Set-Cookie', COOKIE + '=' + self.server.download_token + '; HttpOnly; SameSite=Strict; Path=/api/download')
        for name, value in (extra or {}).items():
            self.send_header(name, value)
        self.end_headers()

    def _json(self, value, status=200, *, authenticated=False):
        raw = (encode(value) + '\n').encode()
        self._headers(status, length=len(raw), authenticated=authenticated)
        if self.command != 'HEAD':
            self.wfile.write(raw)

    def _authorized(self, download=False):
        supplied = self.headers.get('Authorization', '')
        ok = hmac.compare_digest(supplied.encode(), ('Bearer ' + self.server.token).encode())
        if download and not ok:
            cookie = SimpleCookie()
            try:
                cookie.load(self.headers.get('Cookie', ''))
                value = cookie.get(COOKIE)
                ok = value is not None and hmac.compare_digest(value.value, self.server.download_token)
            except (ValueError, TypeError):
                ok = False
        return ok

    def _boundary(self):
        if self.headers.get('Host') not in self.server.hosts:
            self._json({'error': 'Use the original local connection address.'}, 421)
            return False
        origin = self.headers.get('Origin')
        if origin is not None and origin not in self.server.origins:
            self._json({'error': 'This request came from a different site.'}, 403)
            return False
        return True

    def _body(self):
        if self.headers.get('Transfer-Encoding'):
            fail('Use a JSON request with a complete Content-Length.')
        try:
            length = int(self.headers.get('Content-Length', ''))
        except ValueError:
            fail('This request needs a valid Content-Length.')
        if not 0 < length <= BODY_LIMIT or self.headers.get_content_type() != 'application/json':
            fail('Use a JSON object no larger than 4 MiB.')
        raw = self.rfile.read(length)
        if len(raw) != length:
            fail('The complete JSON request was not received.')
        def pairs(items):
            result = {}
            for key, value in items:
                if key in result:
                    fail('A JSON object repeats a property name.')
                result[key] = value
            return result
        value = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs,
                           parse_constant=lambda value: fail('JSON numbers must be finite.'))
        if not isinstance(value, dict):
            fail('Use a JSON object for this operation.')
        return value

    @staticmethod
    def _parameters(query):
        values = parse_qs(query, keep_blank_values=True)
        if any(len(v) != 1 for v in values.values()):
            fail('A request parameter is repeated.')
        return {k: v[0] for k, v in values.items()}

    def _get(self, path, q):
        w = self.server.workspace
        integer = lambda key, default=0: int(q.get(key, default))
        paging = {'after': integer('after'), 'limit': integer('limit', 50)}
        if path == '/api/context':
            with w.database._connection(readonly=True) as db:
                return {'workspace_id': db.execute('SELECT workspace_id FROM sf_analysis_format WHERE id=1').fetchone()[0],
                        'queries': [dict(r) for r in db.execute('SELECT name,revision FROM sf_analysis_queries ORDER BY name')],
                        'views': w.database._views(db)}
        if path == '/api/query':
            return w.analysis.saved_query(q.get('name'), revision=integer('revision') if 'revision' in q else None)
        if path == '/api/definitions':
            return w.definitions(**paging)
        if path == '/api/definition':
            return w.get_definition(q.get('name'), integer('revision') if 'revision' in q else None)
        if path == '/api/plan':
            return w.plan(q.get('name'), integer('revision') if 'revision' in q else None)
        if path == '/api/runs':
            return w.runs(**paging)
        if path == '/api/run':
            return w.run(q.get('id'))
        if path == '/api/rows':
            return w.rows(q.get('id'), integer('task'), **paging)
        if path == '/api/comparison':
            return w.comparison(q.get('id'), integer('pair'), status=q.get('status', 'all'), **paging)
        if path == '/api/reviews':
            return w.reviews(q.get('id'), **paging)
        raise LookupError('The requested operation does not exist.')

    def _post(self, path, value):
        w = self.server.workspace
        if path == '/api/definitions':
            return w.save(value)
        if path == '/api/run':
            return w.start(value)
        if path == '/api/resume':
            return w.resume(value.get('id'))
        if path == '/api/cancel':
            return w.cancel(value.get('id'))
        if path == '/api/review':
            return w.review(value.get('run_id'), value)
        if path == '/api/export':
            return export_report(w, value)
        if path == '/api/package':
            return package_export(w, value)
        raise LookupError('The requested operation does not exist.')

    def _download(self, q):
        key = identifier(q.get('id'))
        w = self.server.workspace
        with w.database._connection(readonly=True) as db:
            result = w._record(db.execute('SELECT * FROM sf_scenario_exports WHERE id=?', (key,)).fetchone())
        path = w.exports / result['filename']
        if path.name != result['filename']:
            fail('The retained export name is invalid.')
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, 'rb') as source:
            info = os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_size != result['bytes']:
                fail('The retained export is missing or changed.')
            sha = hashlib.sha256()
            for block in iter(lambda: source.read(1024**2), b''):
                sha.update(block)
            if sha.hexdigest() != result['sha256']:
                fail('The retained export changed.')
            size, start, end = info.st_size, 0, info.st_size - 1
            tag = '"' + result['sha256'] + '"'
            selected_range = self.headers.get('Range')
            status = 200
            if selected_range and self.headers.get('If-Range', tag) == tag:
                match = re.fullmatch(r'bytes=(\d+)-(\d*)', selected_range)
                if not match:
                    self._headers(416, extra={'Content-Range': 'bytes */' + str(size)})
                    return
                start = int(match[1]); end = min(int(match[2]), end) if match[2] else end
                if start > end or start >= size:
                    self._headers(416, extra={'Content-Range': 'bytes */' + str(size)})
                    return
                status = 206
            extras = {'Content-Disposition': "attachment; filename*=UTF-8''" + quote(result['download_name']),
                      'ETag': tag, 'Accept-Ranges': 'bytes'}
            if status == 206:
                extras['Content-Range'] = f'bytes {start}-{end}/{size}'
            self._headers(status, result['content_type'], end - start + 1, extra=extras)
            if self.command != 'HEAD':
                source.seek(start)
                remaining = end - start + 1
                while remaining:
                    block = source.read(min(1024**2, remaining))
                    if not block:
                        break
                    self.wfile.write(block)
                    remaining -= len(block)

    def _dispatch(self):
        if not self._boundary():
            self.close_connection = True
            return
        target = urlsplit(self.path)
        if target.scheme or target.netloc:
            fail('Use an origin-relative local request.')
        path, q = target.path, self._parameters(target.query)
        if self.command in ('GET', 'HEAD') and path in ('/', '/desk.js', '/desk.css'):
            raw, content_type = {'/': (HTML, 'text/html; charset=utf-8'), '/desk.js': (JS, 'text/javascript; charset=utf-8'), '/desk.css': (CSS, 'text/css; charset=utf-8')}[path]
            raw = raw.encode()
            self._headers(200, content_type, len(raw))
            if self.command != 'HEAD':
                self.wfile.write(raw)
            return
        if not self._authorized(download=path == '/api/download'):
            self.close_connection = True
            self._json({'error': 'Open the private connection URL to use this local workspace.'}, 401)
            return
        if path == '/api/download' and self.command in ('GET', 'HEAD'):
            self._download(q)
            return
        result = self._post(path, self._body()) if self.command == 'POST' else self._get(path, q)
        self._json(result, authenticated=True)

    def _safe_dispatch(self):
        try:
            self._dispatch()
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            self.close_connection = True
        except LookupError:
            self.close_connection = True
            self._json({'error': 'The requested operation does not exist.'}, 404)
        except (StateError, ValueError, TypeError, UnicodeError) as error:
            self.close_connection = True
            message = str(error) if isinstance(error, StateError) else 'A request field or JSON value is invalid.'
            self._json({'error': message}, 400)
        except BaseException:
            self.close_connection = True
            self._json({'error': 'The operation stopped. Reload its saved state before retrying the same request.'}, 500)

    do_GET = _safe_dispatch
    do_HEAD = _safe_dispatch
    do_POST = _safe_dispatch
