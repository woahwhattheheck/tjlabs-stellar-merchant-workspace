"""MIT. Original pipeline engine and browser under the existing private owner."""
from __future__ import annotations
import importlib.util
import shutil
import sys
import tempfile
import threading
import zipfile
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit, parse_qs
from preparation import PreparationError, Busy, dumps, parse_json, digest
from transfer import merchant_delivery

HERE = Path(__file__).resolve().parent / 'pipelines'
# The original standalone engine uses local imports. This application owns one
# dedicated Python interpreter; preserve its original modules and their bodies.
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

def original_module(name, module_name=None):
    key = module_name or name
    path = HERE / (name + '.py')
    old = sys.modules.get(key)
    if old is not None:
        if Path(old.__file__).resolve() != path:
            raise PreparationError('The installed pipeline module belongs to a different source directory')
        return old
    spec = importlib.util.spec_from_file_location(key, path)
    if spec is None or spec.loader is None:
        raise PreparationError('The complete selected pipeline source is unavailable')
    module = importlib.util.module_from_spec(spec)
    sys.modules[key] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(key, None)
        raise
    return module

engine = original_module('engine')
delivery = original_module('delivery')
native_server = original_module('server', '_starforge_managed_pipeline_server')

def pipeline_snapshot(workspace):
    with workspace.connection() as db:
        db.execute('BEGIN')
        value = workspace.snapshot(db)
        db.execute('COMMIT')
    return value, engine.sha(value)

def pipeline_status(workspace, native_snapshot):
    native, native_sha = native_snapshot(workspace.native)
    state, state_sha = pipeline_snapshot(workspace)
    return {
        'schema': engine.SCHEMA, 'label': native['label'],
        'stateSha256': native_sha, 'pipelineStateSha256': state_sha,
        'pipelines': len({value['id'] for value in state['definitions']}),
        'editions': len(state['definitions']), 'executions': len(state['executions']),
        'events': len(state['events']),
        'running': sum(value['status'] == 'RUNNING' for value in state['executions']),
    }

def prepare_pipeline_file(workspace, request, destination, native_snapshot):
    """Publish original engine output only for the exact reviewed pair of states.

    Original export functions take their own native and pipeline locks. Compare
    both retained metadata editions before and after their complete export rather
    than wrapping those functions in conflicting duplicate writer locks.
    """
    before = pipeline_status(workspace, native_snapshot)
    if before['stateSha256'] != request['expectedStateSha256'] or before['pipelineStateSha256'] != request.get('expectedPipelineSha256'):
        raise PreparationError('The preparation or pipeline state changed; reopen its current saved state')
    kind, execution = request['kind'], request.get('executionId')
    stage = request.get('stageId')
    if kind == 'pipeline-project':
        delivery.export_project(workspace, destination)
        name, media = 'preparation-pipeline-project.zip', 'application/zip'
    elif kind == 'pipeline-results':
        delivery.deliver_results(workspace, execution, destination)
        name, media = 'preparation-pipeline-results.zip', 'application/zip'
    elif kind == 'pipeline-report':
        delivery.report(workspace, execution, destination)
        name, media = 'preparation-pipeline-report.html', 'text/html; charset=utf-8'
    elif kind == 'pipeline-merchant':
        native = workspace.stage_result(execution, stage)
        with tempfile.TemporaryDirectory(dir=destination.parent, prefix='pipeline-merchant-') as temporary:
            folder = Path(temporary) / 'merchant'
            merchant_delivery(workspace.native, native['id'], folder, label=request.get('label'))
            with zipfile.ZipFile(destination, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                for file in sorted(folder.rglob('*')):
                    archive.write(file, file.relative_to(folder))
        name, media = 'prepared-pipeline-dataset.zip', 'application/zip'
    elif kind == 'pipeline-result':
        native = workspace.stage_result(execution, stage)
        name = request.get('file', 'result.jsonl')
        source = workspace.native.result_file(native['id'], name)
        media = {'result.csv':'text/csv', 'result.jsonl':'application/x-ndjson', 'schema.json':'application/json'}[name]
        with source.open('rb') as original, destination.open('xb') as output:
            shutil.copyfileobj(original, output, 1024 * 1024)
    else:
        raise PreparationError('Choose an original pipeline delivery')
    after = pipeline_status(workspace, native_snapshot)
    if after['stateSha256'] != before['stateSha256'] or after['pipelineStateSha256'] != before['pipelineStateSha256']:
        raise PreparationError('The saved pipeline changed during export; inspect its current edition and create a new delivery operation')
    return name, media, before['pipelineStateSha256']

class PipelineRuntime:
    """Reuse the original job methods without opening a second root HTTP socket."""
    def __init__(self, owner, listener):
        self.owner, self.listener = owner, listener
        self.workspace = engine.PipelineWorkspace(owner.workspace.root)
        self.origin = owner.origin
        self.downloads = self.workspace.root / 'pipeline-deliveries'
        self.downloads.mkdir(mode=0o700, exist_ok=True)
        self.jobs = {}
        self.job_lock = threading.Lock()
        self.receiving_lock = threading.RLock()
        self.received_servers = {}
        self.closed = False
        self.commissioning = None
        self.commissioning_lock = threading.RLock()

    mark_inactive = native_server.OperatorServer.mark_inactive
    receive_project = native_server.OperatorServer.receive_project

    def start_job(self, execution_id, resume=False):
        with self.receiving_lock:
            if self.closed or self.owner.closing:
                raise Busy('Applications is stopping; the original pipeline execution remains saved')
            return native_server.OperatorServer.start_job(self, execution_id, resume)

    def open_received(self, identifier):
        record = original_module('receiving').received_project(self.workspace, identifier)
        return self.open_received_record(record)

    def open_received_record(self, record):
        identifier = record['id']
        with self.receiving_lock:
            if self.closed or self.owner.closing:
                raise Busy('Applications is stopping; reopen this completed receiving from its saved project')
            current = self.received_servers.get(identifier)
            if current is None:
                args = SimpleNamespace(workspace=record['path'], workspace_sha256=None,
                                       label=record['label'], port=0)
                context = self.listener(args)
                child, announcement = context.__enter__()
                worker = threading.Thread(target=child.serve_forever,
                    kwargs={'poll_interval':0.2}, name='managed-pipeline-received-' + identifier, daemon=False)
                try:
                    worker.start()
                except BaseException:
                    context.__exit__(*sys.exc_info())
                    raise
                self.received_servers[identifier] = child, worker, context, announcement
            else:
                child, worker, context, announcement = current
                if not worker.is_alive() or child.closing:
                    raise PreparationError('The received project listener stopped; reopen its saved Applications workspace')
            # Native browser navigation consumes "origin" as its full opening URL.
            # Typed clients also receive the exact private connection filename.
            url = child.origin + '/pipelines/#' + child.token
            return {**record, 'origin':url, 'url':url,
                    'connectionFile':announcement['connectionFile'],
                    'workspaceSha256':child.workspace_sha, 'instanceId':child.instance}

    def download(self, relative):
        parsed = urlsplit(relative)
        if parsed.scheme or parsed.netloc or parsed.fragment:
            raise PreparationError('Choose a local original pipeline download')
        query = {key:values[-1] for key,values in parse_qs(parsed.query).items()}
        if parsed.path == '/api/pipelines/commissioning/file':
            if set(query) != {'kind','id','file'}:
                raise PreparationError('Choose one complete commissioning file')
            return original_module('commissioning').desk(self).download(query['kind'], query['id'], query['file'])
        if parsed.path == '/api/pipelines/result':
            if set(query) != {'id','stage','file'}:
                raise PreparationError('Choose one original pipeline execution, stage and file')
            result = self.workspace.stage_result(query['id'], query['stage'])
            name = query['file']
            return self.workspace.native.result_file(result['id'], name), 'application/octet-stream', name
        import re
        match = re.fullmatch(r'/api/pipelines/downloads/([a-f0-9]{32}\.(zip|html))', parsed.path)
        if not match or parsed.query:
            raise PreparationError('Choose an original pipeline result or completed download')
        name = match[1]
        return self.downloads / name, 'application/octet-stream', 'preparation-pipeline.' + name.rsplit('.',1)[1]

    def dispatch(self, parent):
        target = urlsplit(parent.path)
        suffix = target.path.removeprefix('/api/pipelines/')
        path = '/' + suffix if suffix.startswith('downloads/') else '/api/' + suffix
        if target.query:
            path += '?' + target.query
        child = object.__new__(ManagedPipelineHandler)
        child.__dict__.update(parent.__dict__)
        child.parent = parent
        child.server = self
        child.path = path
        try:
            if parent.command == 'GET':
                child.do_GET()
            elif parent.command == 'POST':
                child.do_POST()
            else:
                raise PreparationError('Use an original pipeline read or command')
        finally:
            parent.close_connection = child.close_connection

    def close(self):
        with self.receiving_lock:
            if self.closed:
                return
            self.closed = True
            children = list(self.received_servers.values())
        with self.job_lock:
            jobs = list(self.jobs.items())
        errors = []
        with self.commissioning_lock:
            commissioning = self.commissioning
        if commissioning is not None:
            try:
                commissioning.close()
            except BaseException as exc:
                errors.append(exc)
        for execution_id, worker in jobs:
            if worker.is_alive():
                try:
                    self.workspace.cancel(execution_id)
                except BaseException as exc:
                    errors.append(exc)
        for child, worker, context, _ in children:
            try:
                child.shutdown()
            except BaseException as exc:
                errors.append(exc)
            try:
                context.__exit__(None, None, None)
            except BaseException as exc:
                errors.append(exc)
            finally:
                try:
                    worker.join()
                except BaseException as exc:
                    errors.append(exc)
        for _, worker in jobs:
            try:
                worker.join()
            except BaseException as exc:
                errors.append(exc)
        self.received_servers.clear()
        if errors:
            raise errors[0]

class ManagedPipelineHandler(native_server.OperatorHandler):
    timeout = 60
    def check_origin(self, write=False):
        self.parent.check_host(write)
    def send_headers(self, status, kind, length, filename=None):
        self.parent.response_headers(status, kind, length, filename)
        self.close_connection = True
    def answer(self, body, status=200):
        if isinstance(body, dict) and isinstance(body.get('download'), str):
            body = {**body, 'download':'/api/pipelines' + body['download']}
        super().answer(body, status)
    def do_POST(self):
        parsed = urlsplit(self.path)
        expected = self.headers.get('X-Preparation-Source-SHA256')
        if parsed.path != '/api/receive' or expected is None:
            return super().do_POST()
        try:
            self.check_origin(True)
            import re
            if not re.fullmatch(r'[a-f0-9]{64}', expected):
                raise PreparationError('Use the complete reviewed project SHA-256')
            query = {key:values[-1] for key,values in parse_qs(parsed.query).items()}
            remaining = self.content_length(20 * 1024**3)
            with tempfile.TemporaryDirectory(dir=self.ws.root / 'staging', prefix='managed-pipeline-receive-') as temporary:
                archive = Path(temporary) / 'project.zip'
                with archive.open('xb') as output:
                    while remaining:
                        block = self.rfile.read(min(1024 * 1024, remaining))
                        if not block:
                            raise PreparationError('The original project ended before its declared length')
                        output.write(block)
                        remaining -= len(block)
                if digest(archive) != expected:
                    raise PreparationError('The complete project differs from its reviewed SHA-256')
                result = self.server.receive_project(archive, query.get('requestKey'))
            self.answer(result, 201)
        except (ValueError, OSError, KeyError, TypeError) as exc:
            self.fail(exc)
