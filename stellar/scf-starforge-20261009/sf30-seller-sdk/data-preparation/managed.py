#!/usr/bin/env python3
"""MIT. Managed access and complete receiving for the original preparation engine."""
from __future__ import annotations
import argparse
import contextlib
import fcntl
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import signal
import stat
import tempfile
import threading
import time
import uuid
import zipfile
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from preparation import Workspace, PreparationError, Busy, parse_json, dumps, digest, now
from server import OperatorServer, OperatorHandler, STATIC
from transfer import export_workspace, receive_workspace, merchant_delivery, result_report, ARCHIVE

CONNECTION = 'preparation-connection.json'
CONNECTION_SCHEMA = 'stellar-forge.data-preparation-listener.v1'
STARTUP_SCHEMA = 'stellar-forge.data-preparation-managed-startup.v1'
DELIVERY_SCHEMA = 'stellar-forge.data-preparation-delivery.v1'
RECEIVING_SCHEMA = 'stellar-forge.data-preparation-received.v1'
HASH = re.compile(r'^[a-f0-9]{64}$')
OPERATION = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$')
COLLECTIONS = ('sources', 'recipes', 'runs', 'reviews')

def need(condition, message):
    if not condition: raise PreparationError(message)

def private_directory(path):
    path = Path(path)
    need(path.is_absolute() and path == path.resolve(), 'Use a canonical absolute private directory')
    info = path.lstat()
    need(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and info.st_mode & 0o077 == 0,
         'The selected directory must be owned by this user with mode 0700')
    return path

def private_file(path, maximum=None):
    path = Path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    stream = os.fdopen(fd, 'rb')
    try:
        info = os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid(), 'Use an owned regular source file')
        if maximum is not None: need(info.st_size <= maximum, 'The source metadata exceeds its supported size')
        return stream
    except BaseException:
        stream.close(); raise

def write_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.partial')
    try:
        with temporary.open('x', encoding='utf-8') as out:
            os.chmod(temporary, 0o600)
            out.write(dumps(value) + '\n'); out.flush(); os.fsync(out.fileno())
        os.replace(temporary, path)
        fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(fd)
        finally: os.close(fd)
    finally:
        temporary.unlink(missing_ok=True)

def read_json(path, maximum=64*1024*1024):
    with private_file(path, maximum) as source: return parse_json(source.read().decode('utf-8'))

def snapshot(ws):
    # One native read transaction preserves a coherent metadata edition while a
    # source query runs; this does not acquire or replace the original writer.
    with ws.connection(True) as db:
        db.execute('BEGIN')
        result = {**ws.info}
        for collection in COLLECTIONS:
            result[collection] = [parse_json(row[0]) for row in db.execute('SELECT body FROM '+collection+' ORDER BY rowid')]
        db.commit()
    return result, hashlib.sha256(dumps(result).encode()).hexdigest()

class LockedWorkspace:
    """Transfer's original nested mutation is already held by this caller."""
    def __init__(self, ws, state): self.ws, self.saved = ws, state
    def __getattr__(self, key): return getattr(self.ws, key)
    def state(self): return self.saved
    def mutation(self): return contextlib.nullcontext()

def delivery_directory(ws):
    root = ws.root/'managed-deliveries'
    root.mkdir(mode=0o700, exist_ok=True)
    return private_directory(root)

def verify_delivery(root, record):
    need(record.get('schema') == DELIVERY_SCHEMA and HASH.fullmatch(record.get('fileId', '')) and
         HASH.fullmatch(record.get('sha256', '')) and type(record.get('bytes')) is int,
         'Choose a completed native delivery')
    path = root/(record['fileId']+'.content')
    with private_file(path) as source:
        need(os.fstat(source.fileno()).st_size == record['bytes'] and
             hashlib.file_digest(source, 'sha256').hexdigest() == record['sha256'],
             'The completed delivery bytes differ from their saved digest')
    return record

def prepare_delivery(ws, workspace_sha, body):
    need(isinstance(body, dict) and set(body) <= {'operationId','kind','runId','file','label','expectedStateSha256'},
         'Use the declared delivery arguments')
    operation = body.get('operationId')
    kind = body.get('kind')
    need(isinstance(operation, str) and OPERATION.fullmatch(operation), 'Use a delivery operation ID of 1–96 letters, numbers, underscores or hyphens')
    need(kind in {'project','merchant','report','result'}, 'Choose project, merchant, report or result delivery')
    need(HASH.fullmatch(body.get('expectedStateSha256', '')), 'Select the reviewed workspace state SHA-256')
    need(kind != 'project' or not any(k in body for k in ('runId','file','label')), 'A project export uses the complete workspace')
    need(kind == 'result' or 'file' not in body, 'A result filename belongs to a result delivery')
    need(kind == 'merchant' or 'label' not in body, 'A label belongs to a merchant delivery')
    file_id = hashlib.sha256(dumps([workspace_sha, operation]).encode()).hexdigest()
    root = delivery_directory(ws)
    intent = {'schema':DELIVERY_SCHEMA+'.intent','workspaceSha256':workspace_sha,'request':body}
    with (root/'delivery.lock').open('a+b') as lock:
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc: raise Busy('Another complete delivery is being prepared; continue this operation afterward') from exc
        intent_path, receipt_path = root/(file_id+'.intent.json'), root/(file_id+'.json')
        if intent_path.exists(): need(read_json(intent_path) == intent, 'This operation ID belongs to different delivery arguments')
        else: write_json(intent_path, intent)
        if receipt_path.exists(): return {**verify_delivery(root, read_json(receipt_path)), 'reused':True}
        staged_receipt, content = root/(file_id+'.prepared.json'), root/(file_id+'.content')
        if staged_receipt.exists():
            record = read_json(staged_receipt)
            temporary = root/(file_id+'.ready')
            if not content.exists() and temporary.exists(): os.link(temporary, content)
            verify_delivery(root, record)
            write_json(receipt_path, record); temporary.unlink(missing_ok=True); staged_receipt.unlink(missing_ok=True)
            return {**record, 'reused':True}
        need(not content.exists(), 'The delivery has unpublished bytes without a matching prepared record')
        temporary = root/(file_id+'.ready')
        # A stopped producer before its prepared record published no delivery.
        temporary.unlink(missing_ok=True)
        with ws.mutation():
            state, state_sha = snapshot(ws)
            need(state_sha == body['expectedStateSha256'], 'The workspace changed; inspect its current state before creating a new delivery operation')
            bound = LockedWorkspace(ws, state)
            if kind == 'project':
                export_workspace(bound, temporary)
                filename, media = 'preparation-project.zip', 'application/zip'
            elif kind == 'merchant':
                folder = Path(tempfile.mkdtemp(dir=root, prefix='merchant-')); folder.rmdir()
                try:
                    merchant_delivery(bound, body.get('runId'), folder, label=body.get('label'))
                    with zipfile.ZipFile(temporary, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                        for path in sorted(folder.iterdir()): archive.write(path, path.name)
                finally: shutil.rmtree(folder, ignore_errors=True)
                filename, media = 'prepared-dataset.zip', 'application/zip'
            elif kind == 'report':
                result_report(bound, body.get('runId'), temporary)
                filename, media = 'preparation-report.html', 'text/html; charset=utf-8'
            else:
                filename = body.get('file', 'result.jsonl')
                source = bound.result_file(body.get('runId'), filename)
                media = {'result.csv':'text/csv','result.jsonl':'application/x-ndjson','schema.json':'application/json'}[filename]
                with source.open('rb') as original, temporary.open('xb') as out:
                    shutil.copyfileobj(original, out, 1024*1024)
            os.chmod(temporary, 0o600)
            with temporary.open('rb') as stream: os.fsync(stream.fileno())
            record = {'schema':DELIVERY_SCHEMA,'fileId':file_id,'operationId':operation,'kind':kind,
                      'workspaceSha256':workspace_sha,'stateSha256':state_sha,'request':body,
                      'createdAt':now(),'filename':filename,'mediaType':media,
                      'bytes':temporary.stat().st_size,'sha256':digest(temporary)}
            write_json(staged_receipt, record)
            os.link(temporary, content)
            write_json(receipt_path, record)
            temporary.unlink(); staged_receipt.unlink()
            return {**record, 'reused':False}

class ManagedServer(OperatorServer):
    daemon_threads = False
    block_on_close = True
    def __init__(self, ws, port, workspace_sha):
        self.closing = False
        self.workspace_sha = workspace_sha
        self.instance = str(uuid.uuid4())
        self.token = secrets.token_hex(32)
        self.tickets = {}; self.ticket_lock = threading.Lock()
        root = private_directory(ws.root).stat()
        self.directory_identity = {'dev':str(root.st_dev),'ino':str(root.st_ino)}
        super().__init__(ws, port)
        self.RequestHandlerClass = ManagedHandler
        self.descriptor = {'schema':CONNECTION_SCHEMA,'directory':str(ws.root),'directoryIdentity':self.directory_identity,
                           'workspaceSha256':workspace_sha,'instanceId':self.instance,'pid':os.getpid(),'startedAt':now(),
                           'origin':f'http://127.0.0.1:{self.server_port}','token':self.token}
        self.descriptor['url'] = self.descriptor['origin']+'/#'+self.token
    def check_identity(self):
        info = private_directory(self.workspace.root).stat()
        need({'dev':str(info.st_dev),'ino':str(info.st_ino)} == self.directory_identity and
             digest(self.workspace.root/'workspace.json') == self.workspace_sha,
             'The selected original workspace identity changed')
    def run_job(self, run_id):
        if self.closing: raise Busy('Applications is stopping; the saved run remains queued')
        return super().run_job(run_id)
    def public_connection(self):
        return {key:value for key,value in self.descriptor.items() if key not in {'token','url'}}
    def download(self, relative):
        url = urlparse(relative)
        need(not url.scheme and not url.netloc and not url.fragment, 'Choose an original local download')
        query = {key:values[-1] for key,values in parse_qs(url.query).items()}
        if url.path == '/api/file':
            need(set(query) == {'id','file'}, 'Choose an original result file')
            name = query['file']
            path = self.workspace.result_file(query['id'], name)
            return path, {'result.csv':'text/csv','result.jsonl':'application/x-ndjson','schema.json':'application/json'}[name], name
        if re.fullmatch(r'/downloads/[a-f0-9]{32}\.(zip|html)', url.path) and not url.query:
            name = url.path.rsplit('/',1)[1]
            return self.downloads/name, 'application/zip' if name.endswith('.zip') else 'text/html; charset=utf-8', name
        match = re.fullmatch(r'/api/managed/file/([a-f0-9]{64})', url.path)
        need(match and not url.query, 'Choose a retained project, result, report or dataset file')
        root = delivery_directory(self.workspace)
        record = read_json(root/(match[1]+'.json'))
        need(record['workspaceSha256'] == self.workspace_sha, 'The delivery belongs to another original workspace')
        return root/(match[1]+'.content'), record['mediaType'], record['filename']
    def server_close(self):
        self.closing = True
        with self.jobs_lock: active = list(self.jobs.items())
        for run_id,_ in active: self.workspace.cancel(run_id)
        # Close the socket and drain actual requests before removing downloads.
        ThreadingHTTPServer.server_close(self)
        with self.jobs_lock: active = list(self.jobs.items())
        for run_id,_ in active: self.workspace.cancel(run_id)
        for _,worker in active: worker.join()
        shutil.rmtree(self.downloads, ignore_errors=True)

class ManagedHandler(OperatorHandler):
    def authorized(self):
        supplied = self.headers.get('Authorization', '')
        instance = self.headers.get('X-Preparation-Instance-ID')
        return hmac.compare_digest(supplied, 'Bearer '+self.server.token) and (instance is None or instance == self.server.instance)
    def check_host(self, write=False):
        super().check_host(write)
        self.server.check_identity()
        if self.server.closing: raise Busy('The original application is stopping')
        need(self.authorized(), 'Open the private Applications URL or attach with the current connection file')
    def response_headers(self, status, kind, length, filename=None):
        self.send_response(status)
        self.send_header('Content-Type',kind); self.send_header('Content-Length',str(length))
        self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('X-Preparation-Instance-ID',self.server.instance)
        self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        self.send_header('Connection','close'); self.close_connection = True
        if filename: self.send_header('Content-Disposition','attachment; filename="'+filename+'"')
        self.end_headers()
    def do_GET(self):
        try:
            url = urlparse(self.path)
            if url.path in {'/','/app.js','/style.css','/managed-browser.mjs'} and not url.query:
                OperatorHandler.check_host(self)
                if url.path == '/':
                    original = (STATIC/'index.html').read_text(encoding='utf-8')
                    marker = '<script type="module" src="/app.js"></script>'
                    need(original.count(marker) == 1, 'The original browser entry changed; update its managed bootstrap')
                    data = original.replace(marker, '<script type="module" src="/managed-browser.mjs"></script>').encode()
                    self.response_headers(200,'text/html; charset=utf-8',len(data)); self.wfile.write(data)
                else:
                    self.send_file(STATIC/url.path[1:], 'text/css; charset=utf-8' if url.path == '/style.css' else 'text/javascript; charset=utf-8')
                return
            ticket = re.fullmatch(r'/managed-download/([a-f0-9]{64})', url.path)
            if ticket and not url.query:
                OperatorHandler.check_host(self); self.server.check_identity()
                with self.server.ticket_lock: selected = self.server.tickets.pop(ticket[1], None)
                need(selected is not None and selected['expires'] >= time.monotonic(), 'The single-use download link expired; reopen this file')
                path, media, name = self.server.download(selected['path'])
                self.send_file(path, media, name); return
            self.check_host()
            if url.path == '/api/managed/connection':
                self.answer(self.server.public_connection()); return
            if url.path in {'/api/managed/state','/api/managed/records'}:
                state, sha = snapshot(self.ws)
                if url.path.endswith('/state'):
                    self.answer({'schema':state['schema'],'label':state['label'],'createdAt':state['createdAt'],
                                 'workspaceSha256':self.server.workspace_sha,'stateSha256':sha,
                                 'counts':{key:len(state[key]) for key in COLLECTIONS},
                                 'running':sum(run['status']=='RUNNING' for run in state['runs'])}); return
                query = {key:values[-1] for key,values in parse_qs(url.query).items()}
                collection = query.get('collection')
                offset, limit = int(query.get('offset',0)), int(query.get('limit',50))
                need(collection in COLLECTIONS and offset >= 0 and 1 <= limit <= 200, 'Select an original collection and a page of 1–200 records')
                need('expectedStateSha256' not in query or query['expectedStateSha256'] == sha, 'The workspace changed between pages; reopen its current state')
                records = state[collection]
                self.answer({'collection':collection,'records':records[offset:offset+limit],'stateSha256':sha,
                             'offset':offset,'limit':limit,'total':len(records),
                             'nextOffset':offset+limit if offset+limit<len(records) else None}); return
            if re.fullmatch(r'/api/managed/file/[a-f0-9]{64}', url.path):
                path, media, name = self.server.download(self.path)
                self.send_file(path, media, name); return
            return super().do_GET()
        except (BrokenPipeError, ConnectionResetError): pass
        except Exception as exc: self.fail(exc)
    def do_POST(self):
        try:
            self.check_host(True)
            url = urlparse(self.path)
            if url.path == '/api/import' and self.headers.get('X-Preparation-Source-SHA256'):
                expected = self.headers['X-Preparation-Source-SHA256']
                need(HASH.fullmatch(expected), 'Use the reviewed input SHA-256')
                query = {key:values[-1] for key,values in parse_qs(url.query,keep_blank_values=True).items()}
                length = self.body_length(2*1024**3)
                fd, name = tempfile.mkstemp(dir=self.ws.root/'staging',prefix='managed-upload-')
                try:
                    with os.fdopen(fd,'wb') as out:
                        remaining, hasher = length, hashlib.sha256()
                        while remaining:
                            chunk = self.rfile.read(min(1024*1024,remaining))
                            need(bool(chunk), 'The original upload ended before its declared length')
                            out.write(chunk); hasher.update(chunk); remaining -= len(chunk)
                        out.flush(); os.fsync(out.fileno())
                    need(hasher.hexdigest() == expected, 'The source changed before import; no source edition was created')
                    self.answer(self.ws.import_file(name,query['alias'],query.get('format','csv'),label=query.get('label'),
                                null_token=query.get('nullToken'),original_name=query.get('filename')))
                finally: Path(name).unlink(missing_ok=True)
                return
            if url.path in {'/api/managed/ticket','/api/managed/export'}:
                length = self.body_length(256*1024); raw = self.rfile.read(length)
                need(len(raw) == length, 'The request ended before its declared length')
                body = parse_json(raw.decode('utf-8'))
                if url.path.endswith('/export'):
                    self.answer(prepare_delivery(self.ws,self.server.workspace_sha,body)); return
                need(isinstance(body,dict) and set(body) == {'path'}, 'Choose one original download path')
                self.server.download(body['path'])
                with self.server.ticket_lock:
                    current = time.monotonic()
                    self.server.tickets = {key:value for key,value in self.server.tickets.items() if value['expires'] >= current}
                    need(len(self.server.tickets) < 64, 'Finish an active download before opening another')
                    ticket = secrets.token_hex(32)
                    self.server.tickets[ticket] = {'path':body['path'],'expires':current+300}
                self.answer({'url':'/managed-download/'+ticket,'expiresInSeconds':300}); return
            return super().do_POST()
        except (BrokenPipeError, ConnectionResetError): pass
        except Exception as exc: self.fail(exc)

def comparable_state(value):
    value = json.loads(dumps(value))
    for run in value['runs']:
        if 'files' in run: run['files'].pop('result.sqlite', None)
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',',':'))

def received_info(destination):
    root = private_directory(destination)
    record = read_json(root/'managed-received.json')
    need(record.get('schema') == RECEIVING_SCHEMA, 'Choose an original received preparation workspace')
    state, sha = snapshot(Workspace(root))
    return {**record,'directory':str(root),'stateSha256':sha,
            'workspaceSha256':digest(root/'workspace.json'),
            'counts':{key:len(state[key]) for key in COLLECTIONS},'application':'data-preparation-workspace'}

def receive_original(archive, destination, expected_sha, maximum):
    archive, destination = Path(archive), Path(destination)
    need(HASH.fullmatch(expected_sha), 'Use the complete original archive SHA-256')
    need(type(maximum) is int and maximum > 0, 'Use a positive expanded receiving allowance')
    parent = private_directory(destination.parent)
    need(destination.is_absolute() and destination == destination.resolve(), 'Use the declared canonical customer destination')
    fd, name = tempfile.mkstemp(dir=parent, prefix='.managed-preparation-receive-')
    temporary = Path(name)
    try:
        with os.fdopen(fd,'wb') as out, private_file(archive) as source:
            hasher = hashlib.sha256()
            while chunk := source.read(1024*1024): out.write(chunk); hasher.update(chunk)
            out.flush(); os.fsync(out.fileno())
        need(hasher.hexdigest() == expected_sha, 'The complete source archive differs from its reviewed SHA-256')
        if destination.exists() and (destination/'managed-received.json').exists():
            record = received_info(destination)
            need(record['sourceSha256'] == expected_sha, 'The destination belongs to a different original project archive')
            return {**record,'reused':True}
        with zipfile.ZipFile(temporary) as archive_file:
            need(archive_file.getinfo('manifest.json').file_size <= 64*1024*1024, 'The project manifest exceeds 64 MiB')
            manifest = parse_json(archive_file.read('manifest.json').decode('utf-8'))
            names = archive_file.namelist()
            need(manifest.get('schema') == ARCHIVE and isinstance(manifest.get('members'),dict) and
                 len(names) == len(set(names)) and set(names) == set(manifest['members']) | {'manifest.json'},
                 'Use a complete original project archive with exactly its declared members')
        reused = destination.exists()
        if not reused: receive_workspace(temporary, destination, max_bytes=maximum)
        else:
            # Recover the narrow crash after native publication and before our
            # receiving receipt. Preserve any independently edited workspace.
            state, _ = snapshot(Workspace(private_directory(destination)))
            need(comparable_state(state) == comparable_state(manifest['workspace']),
                 'The existing customer directory has a different or edited native project')
            for member, expected in manifest['members'].items():
                need(re.fullmatch(r'originals/[a-f0-9]{64}|runs/r_[a-f0-9]{32}/(?:result\.csv|result\.jsonl|schema\.json)', member),
                     'The archive member path is invalid')
                path = destination/member
                need(path.stat().st_size == expected['bytes'] and digest(path) == expected['sha256'],
                     'The received original files differ from the selected complete archive')
        write_json(destination/'managed-received.json',
                   {'schema':RECEIVING_SCHEMA,'sourceSha256':expected_sha,'receivedAt':now(),
                    'originalStateSha256':hashlib.sha256(dumps(manifest['workspace']).encode()).hexdigest()})
        return {**received_info(destination),'reused':reused}
    finally: temporary.unlink(missing_ok=True)

def serve_managed(args):
    directory = Path(args.workspace)
    need(directory.is_absolute() and directory == directory.resolve(), 'Use a canonical absolute workspace directory')
    parent = private_directory(directory.parent)
    lock_path = parent/('.preparation-listener-'+hashlib.sha256(str(directory).encode()).hexdigest()+'.lock')
    fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd,'a+b') as lock:
        info = os.fstat(lock.fileno())
        need(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_mode & 0o077 == 0, 'The original listener lease must be private')
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc: raise Busy('This workspace already has an Applications owner; attach to its current connection') from exc
        exists = directory.exists() and (directory/'workspace.json').exists()
        if exists:
            private_directory(directory)
            workspace_sha = digest(directory/'workspace.json')
            need(args.workspace_sha256 in (None, workspace_sha), 'The reviewed original workspace identity changed')
            ws = Workspace(directory)
        else:
            need(args.workspace_sha256 is None, 'The selected original workspace is absent')
            if directory.exists(): private_directory(directory)
            ws = Workspace(directory, create=True, label=args.label)
            workspace_sha = digest(directory/'workspace.json')
        server = ManagedServer(ws, args.port, workspace_sha)
        connection_path = directory/CONNECTION
        connection_sha = None
        previous = {}
        try:
            write_json(connection_path, server.descriptor)
            connection_sha = digest(connection_path)
            announcement = {**server.descriptor,'schema':STARTUP_SCHEMA,'status':'DATA_PREPARATION_READY',
                            'connectionFile':str(connection_path),'connectionSha256':connection_sha}
            announcement.pop('token')
            print(dumps(announcement), flush=True)
            def stop(_signum, _frame):
                if not server.closing:
                    server.closing = True
                    threading.Thread(target=server.shutdown, name='preparation-stop', daemon=True).start()
            for signum in (signal.SIGINT, signal.SIGTERM): previous[signum] = signal.signal(signum, stop)
            server.serve_forever(poll_interval=0.2)
        finally:
            server.server_close()
            if connection_sha and connection_path.exists() and digest(connection_path) == connection_sha: connection_path.unlink()
            for signum, handler in previous.items(): signal.signal(signum, handler)

def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description='Managed original preparation and complete customer receiving')
    commands = parser.add_subparsers(dest='command', required=True)
    serve = commands.add_parser('serve')
    serve.add_argument('--workspace',required=True); serve.add_argument('--workspace-sha256')
    serve.add_argument('--label',default='Data preparation'); serve.add_argument('--port',type=int,default=0)
    receive = commands.add_parser('receive')
    receive.add_argument('--workspace',required=True); receive.add_argument('--archive',required=True)
    receive.add_argument('--sha256',required=True); receive.add_argument('--max-bytes',type=int,default=20*1024**3)
    inspect = commands.add_parser('received'); inspect.add_argument('--workspace',required=True)
    args = parser.parse_args()
    if args.command == 'serve':
        need(0 <= args.port <= 65535, 'Use a port from 0 to 65535'); serve_managed(args); return
    def cancel_receiving(_signum, _frame): raise KeyboardInterrupt('The original receiving process is stopping')
    signal.signal(signal.SIGTERM, cancel_receiving)
    result = receive_original(args.archive,args.workspace,args.sha256,args.max_bytes) if args.command == 'receive' else received_info(args.workspace)
    print(dumps(result),flush=True)

if __name__ == '__main__':
    try: main()
    except (PreparationError, ValueError, OSError, KeyError, TypeError) as exc:
        print(dumps({'error':str(exc)}),file=__import__('sys').stderr); __import__('sys').exit(1)
