"""MIT. Loopback operator server for the saved preparation workspace."""
from __future__ import annotations
import json
import os
import shutil
import tempfile
import threading
import uuid
import zipfile
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from preparation import Workspace,PreparationError,Busy,parse_json,dumps
from transfer import export_workspace,merchant_delivery,result_report
from cli import dispatch

STATIC=Path(__file__).parent


class OperatorServer(ThreadingHTTPServer):
    daemon_threads=True
    allow_reuse_address=True
    def __init__(self,workspace,port):
        self.workspace=workspace
        self.downloads=Path(tempfile.mkdtemp(prefix='preparation-downloads-'))
        self.jobs={}; self.jobs_lock=threading.Lock()
        super().__init__(('127.0.0.1',port),OperatorHandler)
    def run_job(self,run_id):
        def execute():
            try:
                self.workspace.execute(run_id)
            except Busy:
                # It remains explicitly queued; caller may start it again after
                # the active mutation finishes. Never lose a saved run request.
                pass
            finally:
                with self.jobs_lock: self.jobs.pop(run_id,None)
        with self.jobs_lock:
            if run_id in self.jobs: return
            worker=threading.Thread(target=execute,name='preparation-'+run_id,daemon=True)
            self.jobs[run_id]=worker; worker.start()
    def server_close(self):
        # A server shutdown requests cooperative cancellation, then waits for
        # those actual local jobs before removing temporary downloads.
        with self.jobs_lock: active=list(self.jobs.items())
        for run_id,_ in active: self.workspace.cancel(run_id)
        for _,worker in active: worker.join(timeout=15)
        super().server_close(); shutil.rmtree(self.downloads,ignore_errors=True)


class OperatorHandler(BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def log_message(self,format,*args):
        pass
    @property
    def ws(self): return self.server.workspace
    def check_host(self,write=False):
        port=self.server.server_port
        if self.headers.get('Host') not in {f'127.0.0.1:{port}',f'localhost:{port}'}:
            raise PreparationError('Use the displayed loopback workspace address')
        if write:
            if self.headers.get('X-Preparation-Request')!='1': raise PreparationError('Use the same-origin workspace client')
            origin=self.headers.get('Origin')
            if origin and origin not in {f'http://127.0.0.1:{port}',f'http://localhost:{port}'}:
                raise PreparationError('Cross-origin writes are not accepted')
        self.connection.settimeout(60)
    def response_headers(self,status,kind,length,filename=None):
        self.send_response(status)
        self.send_header('Content-Type',kind); self.send_header('Content-Length',str(length))
        self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        if filename: self.send_header('Content-Disposition','attachment; filename="'+filename+'"')
        self.end_headers()
    def answer(self,value,status=200):
        data=(dumps(value)+'\n').encode(); self.response_headers(status,'application/json; charset=utf-8',len(data)); self.wfile.write(data)
    def send_file(self,path,kind,filename=None):
        # Open once, calculate Content-Length from the same descriptor.
        with Path(path).open('rb') as source:
            self.response_headers(200,kind,os.fstat(source.fileno()).st_size,filename)
            shutil.copyfileobj(source,self.wfile,1024*1024)
    def fail(self,exc):
        self.close_connection=True
        self.answer({'error':str(exc)},409 if isinstance(exc,Busy) else 400)
    def do_GET(self):
        try:
            self.check_host()
            url=urlparse(self.path); query={k:v[-1] for k,v in parse_qs(url.query).items()}
            if url.path=='/api/state': self.answer(self.ws.state()); return
            if url.path=='/api/source': self.answer(self.ws.source_page(query['id'],int(query.get('offset',0)),int(query.get('limit',100)))); return
            if url.path=='/api/result': self.answer(self.ws.result_page(query['id'],int(query.get('offset',0)),int(query.get('limit',100)))); return
            if url.path=='/api/file':
                file=query['file']; path=self.ws.result_file(query['id'],file)
                self.send_file(path,{'result.csv':'text/csv','result.jsonl':'application/x-ndjson','schema.json':'application/json'}[file],file); return
            if url.path.startswith('/downloads/'):
                name=url.path[len('/downloads/'):]
                if not __import__('re').fullmatch(r'[a-f0-9]{32}\.(zip|html)',name): raise PreparationError('Unknown download')
                path=self.server.downloads/name
                self.send_file(path,'application/zip' if name.endswith('.zip') else 'text/html; charset=utf-8',name); return
            static={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}
            if url.path not in static:
                self.answer({'error':'Not found'},404); return
            self.send_file(STATIC/static[url.path],{'/':'text/html; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/style.css':'text/css; charset=utf-8'}[url.path])
        except (BrokenPipeError,ConnectionResetError): pass
        except Exception as exc: self.fail(exc)
    def body_length(self,maximum):
        if self.headers.get('Transfer-Encoding'): raise PreparationError('Send a fixed Content-Length upload')
        length=int(self.headers.get('Content-Length','-1'))
        if not 0<=length<=maximum: raise PreparationError('Request size is missing or exceeds this operation limit')
        return length
    def do_POST(self):
        try:
            self.check_host(True)
            url=urlparse(self.path); query={k:v[-1] for k,v in parse_qs(url.query,keep_blank_values=True).items()}
            if url.path=='/api/import':
                length=self.body_length(2*1024**3)
                fd,tmp=tempfile.mkstemp(dir=self.ws.root/'staging',prefix='upload-')
                try:
                    with os.fdopen(fd,'wb') as out:
                        remaining=length
                        while remaining:
                            chunk=self.rfile.read(min(1024*1024,remaining))
                            if not chunk: raise PreparationError('Upload ended before its declared length')
                            out.write(chunk); remaining-=len(chunk)
                    record=self.ws.import_file(tmp,query['alias'],query.get('format','csv'),label=query.get('label','Uploaded source'),null_token=query.get('nullToken'),original_name=query.get('filename','uploaded.'+query.get('format','csv')))
                    self.answer(record)
                finally: Path(tmp).unlink(missing_ok=True)
                return
            length=self.body_length(256*1024); raw=self.rfile.read(length)
            if len(raw)!=length: raise PreparationError('Request ended before its declared length')
            body=parse_json(raw.decode('utf-8'))
            if not isinstance(body,dict): raise PreparationError('Request must be a JSON object')
            if url.path=='/api/run':
                run=self.ws.enqueue(body['recipe_id'],body.get('revision')); self.server.run_job(run['id']); self.answer(run,202); return
            if url.path=='/api/start':
                run=self.ws.get('runs',body['run_id'])
                if run['status']!='QUEUED': raise PreparationError('Choose a queued run')
                self.server.run_job(run['id']); self.answer(run,202); return
            if url.path=='/api/rerun':
                run=self.ws.rerun(body['run_id']); self.server.run_job(run['id']); self.answer(run,202); return
            if url.path=='/api/export':
                path=self.server.downloads/(uuid.uuid4().hex+'.zip')
                result=export_workspace(self.ws,path); self.answer({'url':'/downloads/'+path.name,'bytes':result['bytes']}); return
            if url.path=='/api/merchant':
                id=uuid.uuid4().hex; folder=self.server.downloads/id
                result=merchant_delivery(self.ws,body['run_id'],folder,label=body.get('label'))
                path=self.server.downloads/(id+'.zip')
                with zipfile.ZipFile(path,'x',zipfile.ZIP_DEFLATED) as out:
                    for p in folder.iterdir(): out.write(p,p.name)
                shutil.rmtree(folder)
                self.answer({'url':'/downloads/'+path.name,'rows':result['rows']}); return
            if url.path=='/api/report':
                path=self.server.downloads/(uuid.uuid4().hex+'.html')
                result_report(self.ws,body['run_id'],path); self.answer({'url':'/downloads/'+path.name}); return
            allowed={'/api/recipe':'recipe','/api/cancel':'cancel','/api/review':'review','/api/recover':'recover'}
            if url.path not in allowed: self.answer({'error':'Not found'},404); return
            self.answer(dispatch(self.ws,allowed[url.path],body))
        except (BrokenPipeError,ConnectionResetError): pass
        except Exception as exc: self.fail(exc)


def serve(workspace:Workspace,port=8769):
    server=OperatorServer(workspace,port)
    print(dumps({'url':f'http://127.0.0.1:{server.server_port}','label':workspace.info['label']}),flush=True)
    try: server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt: pass
    finally: server.server_close()
