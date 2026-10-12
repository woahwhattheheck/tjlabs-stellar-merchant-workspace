"""A run-optimization desk on the original private dbt HTTP application. MIT.

The original Application owns session authentication, uploads, durable review
jobs, object downloads, complete project export/receive, and its single lock.
"""
from __future__ import annotations
import json
from pathlib import Path
import signal
import threading
from urllib.parse import urlsplit
from engine import RunOptimization, READ_ACTIONS
from dbt_store import require
import dbt_http as original

ROOT = Path(__file__).parent


class OptimizationHandler(original.Handler):
    def route(self):
        path = urlsplit(self.path).path
        if path.startswith('/optimization'):
            self.check_boundary()
            assets = {'/optimization': ('ui/index.html', 'text/html; charset=utf-8'),
                      '/optimization/': ('ui/index.html', 'text/html; charset=utf-8'),
                      '/optimization/app.js': ('ui/app.js', 'text/javascript; charset=utf-8'),
                      '/optimization/style.css': ('ui/style.css', 'text/css; charset=utf-8')}
            require(path in assets and self.command in ('GET', 'HEAD'), 'NOT_FOUND', status=404)
            filename, mime = assets[path]
            body = (ROOT / filename).read_bytes()
            self.headers_out(200, len(body), mime)
            if self.command != 'HEAD':
                self.wfile.write(body)
            return
        if path.startswith('/api/optimization/'):
            self.check_boundary()
            require(self.app.authenticate(self.headers), 'UNAUTHORIZED', status=401)
            require(self.command == 'POST', 'POST_REQUIRED', status=405)
            value = self.json_body()
            with self.server.optimization_mutex:
                engine = self.server.optimization
                if path == '/api/optimization/read':
                    require(set(value) == {'action', 'input'} and value['action'] in READ_ACTIONS, 'READ_ACTION_REQUIRED')
                    return self.reply(engine.call(value['action'], value['input']))
                if path == '/api/optimization/save':
                    require(set(value) == {'id', 'input'} and isinstance(value['input'], dict), 'INVALID_SAVE')
                    require('request_id' not in value['input'], 'REQUEST_ID_SELECTED_BY_JOB')
                    payload = engine.plan_payload(value['input'])
                    # Reuse the original job protocol and original review writer.
                    return self.reply(self.app.start_job({'id': value['id'], 'action': 'review.save', 'input': payload}), 202)
                if path == '/api/optimization/report':
                    return self.reply(engine.report(**value))
                if path == '/api/optimization/open-received':
                    require(set(value) == {'name'}, 'INVALID_RECEIVED_SELECTION')
                    child = self.app.open_received(value['name'])
                    server, _ = self.app.children[value['name']]
                    attach(server)
                    return self.reply({**child.ready, 'optimizationUrl': child.ready['url']+'optimization/'},
                                      extra={'Set-Cookie': child.cookie+'='+child.token+'; HttpOnly; SameSite=Strict; Path=/'})
            require(False, 'NOT_FOUND', status=404)
        return super().route()


def attach(server):
    if not hasattr(server, 'optimization'):
        server.optimization = RunOptimization(server.application.project)
        server.optimization_mutex = threading.RLock()
        server.RequestHandlerClass = OptimizationHandler
    return server


def start_server(project, **options):
    return attach(original.start_server(project, **options))


def serve(project, **options):
    server = start_server(project, **options)
    print(json.dumps(server.application.ready, separators=(',', ':')), flush=True)
    stopped = threading.Event()
    def stop(*_):
        if not stopped.is_set():
            stopped.set()
            threading.Thread(target=server.shutdown, daemon=True).start()
    previous = {sig: signal.signal(sig, stop) for sig in (signal.SIGTERM, signal.SIGINT)}
    try:
        server.serve_forever(poll_interval=0.1)
    finally:
        server.server_close()
        server.application.close()
        for sig, handler in previous.items():
            signal.signal(sig, handler)
    return 0
