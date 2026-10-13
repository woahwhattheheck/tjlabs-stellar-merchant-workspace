"""Loopback staff application over one original command and receiving owner."""
import base64,contextlib,csv,hashlib,io,json,os,re,secrets,threading,time,urllib.parse
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from .common import *
from .workspace import Workspace
from . import domain
from .exchange import source_inventory,export_workspace,receive_archive
class Application:
    def __init__(self,workspace,source_root,selection,*,receiving_root=None,host="127.0.0.1",port=0):
        require(host in ("127.0.0.1","::1","localhost"),"HOST","Use a loopback application host.")
        self.source_root,self.source_files=source_inventory(source_root,selection);self.selection=selection
        self.initial=workspace;self.active=workspace;self.workspaces={str(workspace.directory):workspace}
        self.lock=threading.RLock();self.server=None;self.thread=None;self.started=False;self.closing=False
        self.receiving_root=Path(receiving_root or workspace.directory.parent/"received-workspaces")
        self.receiving_root.mkdir(parents=True,exist_ok=True,mode=0o700);self.receiving_root=self.receiving_root.resolve(strict=True)
        require(not self.receiving_root.is_relative_to(workspace.directory.resolve()) and not workspace.directory.resolve().is_relative_to(self.receiving_root),"RECEIVING_ROOT","Keep receiving workspaces separate from the open original.")
        self.token=secrets.token_urlsafe(32);app=self
        class Handler(BaseHTTPRequestHandler):
            protocol_version="HTTP/1.1"
            def setup(self):
                super().setup();self.connection.settimeout(30)
            def log_message(self,*args):pass
            def _auth(self,query):
                header=self.headers.get("X-Workspace-Token","")
                cookie=dict(x.strip().split("=",1) for x in self.headers.get("Cookie","").split(";") if "=" in x)
                supplied=header or query.get("token",[""])[0] or cookie.get("bluewave-session","")
                require(secrets.compare_digest(supplied,app.token),"UNAUTHORIZED","Open the original application link.")
                origin=self.headers.get("Origin")
                if origin:require(origin==app.origin,"ORIGIN","Use this original local application.")
            def _send(self,status,data,media="application/json",headers=None):
                if not isinstance(data,bytes):data=canonical(data)
                self.send_response(status);self.send_header("Content-Type",media);self.send_header("Content-Length",str(len(data)));self.send_header("Cache-Control","no-store");self.send_header("Connection","close");self.close_connection=True
                self.send_header("X-Content-Type-Options","nosniff")
                self.send_header("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
                for key,value in (headers or {}).items():self.send_header(key,value)
                self.end_headers();self.wfile.write(data)
            def _json(self,limit=24*1024*1024):
                require(self.headers.get("Content-Type","").split(";")[0]=="application/json","CONTENT_TYPE","Use JSON for this operation.")
                try:length=int(self.headers.get("Content-Length","-1"))
                except ValueError:fail("CONTENT_LENGTH","A complete request length is required.")
                require(0<=length<=limit,"REQUEST_CAPACITY","Request exceeds its allowance.")
                data=self.rfile.read(length);require(len(data)==length,"REQUEST_INCOMPLETE","The complete original request is required.")
                return loads(data)
            def _selected(self,body):
                w=app.active
                require(body.get("workspaceId")==w.current()["state"]["id"],"WORKSPACE_CHANGED","The open workspace changed. Preserve this original request and reopen its workspace.")
                require(body.get("workspaceDirectory")==str(w.directory),"WORKSPACE_BRANCH_CHANGED","Open the exact original or receiving workspace directory for this saved operation.")
                return w
            def _error(self,error):
                if isinstance(error,CommissioningError):self._send(409 if error.code not in ("UNAUTHORIZED","ORIGIN") else 403,{"error":{"code":error.code,"message":str(error)}})
                else:self._send(500,{"error":{"code":"NATIVE_ERROR","message":type(error).__name__}})
            def do_GET(self):
                try:
                    parsed=urllib.parse.urlsplit(self.path);query=urllib.parse.parse_qs(parsed.query);self._auth(query)
                    with app.lock:
                        require(not app.closing,"CLOSED","Application is closing.")
                        p=parsed.path;w=app.active
                        if p.startswith("/api/") and p!="/api/state":
                            w=self._selected({"workspaceId":self.headers.get("X-Workspace-Id") or query.get("workspaceId",[None])[0],"workspaceDirectory":self.headers.get("X-Workspace-Directory") or query.get("workspaceDirectory",[None])[0]})
                        if p=="/api/state":
                            current=w.current();self._send(200,{**current,"view":domain.view(current["state"],w.read_blob,as_of=now()),"sourceSha256":app.selection["sha256"],"directory":str(w.directory),"openWorkspaces":[{"directory":path,"id":item.current()["state"]["id"],"title":item.current()["state"]["title"]} for path,item in app.workspaces.items()]})
                        elif p=="/api/history":self._send(200,w.history(int(query.get("offset",["0"])[0]),int(query.get("limit",["50"])[0])))
                        elif p.startswith("/api/request/"):self._send(200,w.request(p.rsplit("/",1)[1]))
                        elif p.startswith("/api/blob/"):
                            key=p.rsplit("/",1)[1];data=w.read_blob(key);name=query.get("name",["source.bin"])[0]
                            require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,179}",name) is not None,"FILENAME","Use a portable download filename.")
                            self._send(200,data,"application/octet-stream",{"Content-Disposition":'attachment; filename="'+name+'"'})
                        elif p.startswith("/api/source/"):
                            self._send(200,domain.source_rows(w.current()["state"],p.rsplit("/",1)[1],w.read_blob,int(query.get("offset",["0"])[0]),int(query.get("limit",["100"])[0])))
                        elif p.startswith("/api/findings/"):
                            self._send(200,domain.finding_rows(w.current()["state"],p.rsplit("/",1)[1],w.read_blob,int(query.get("offset",["0"])[0]),int(query.get("limit",["100"])[0]),query.get("severity",[None])[0]))
                        elif p.startswith("/api/report/"):
                            record_id=p.rsplit("/",1)[1];fmt=query.get("format",["page"])[0]
                            if fmt=="page":self._send(200,domain.report_rows(w.current()["state"],record_id,w.read_blob,int(query.get("offset",["0"])[0]),int(query.get("limit",["100"])[0]),query.get("status",[None])[0]))
                            elif fmt=="html":
                                document=domain.report_html(w.current()["state"],record_id,w.read_blob)
                                self._send(200,document.encode("utf-8") if isinstance(document,str) else document,"text/html; charset=utf-8",{"Content-Disposition":'attachment; filename="Property_Continuity_Report.html"'})
                            elif fmt=="json":self._send(200,domain.report(w.current()["state"],record_id,w.read_blob),"application/json",{"Content-Disposition":'attachment; filename="Property_Continuity_Report.json"'})
                            elif fmt=="csv":
                                result=domain.report(w.current()["state"],record_id,w.read_blob);rows=result["rows"];columns=sorted({key for row in rows for key in row})
                                stream=io.StringIO(newline="");writer=csv.writer(stream,lineterminator="\r\n");writer.writerow(columns)
                                for row in rows:writer.writerow([canonical(row.get(key)).decode() for key in columns])
                                self._send(200,stream.getvalue().encode("utf-8"),"text/csv; charset=utf-8",{"Content-Disposition":'attachment; filename="Property_Continuity_Rows.csv"'})
                            else:fail("FORMAT","Choose page, JSON, CSV or HTML.")
                        elif p.startswith("/api/export/"):
                            id=p.rsplit("/",1)[1];identifier(id);path=w.directory/"exports"/id/"Bluewave_Commissioning_Workspace.zip"
                            self._send(200,read_regular(path,MAX_ARCHIVE),"application/zip",{"Content-Disposition":'attachment; filename="Bluewave_Commissioning_Workspace.zip"'})
                        else:
                            names={"/":"public/index.html","/app.js":"public/app.js","/style.css":"public/style.css","/guide":"public/guide.html"}
                            require(p in names,"NOT_FOUND","This application page is unavailable.")
                            path=app.source_root/names[p];media="text/html; charset=utf-8" if p in ("/","/guide") else "text/javascript; charset=utf-8" if p=="/app.js" else "text/css; charset=utf-8"
                            self._send(200,read_regular(path),media,{"Set-Cookie":"bluewave-session="+app.token+"; HttpOnly; SameSite=Strict; Path=/"})
                except BaseException as error:
                    try:self._error(error)
                    except (BrokenPipeError,ConnectionResetError):pass
            def do_POST(self):
                try:
                    parsed=urllib.parse.urlsplit(self.path);self._auth(urllib.parse.parse_qs(parsed.query));body=self._json()
                    with app.lock:
                        require(not app.closing,"CLOSED","Application is closing.")
                        p=parsed.path
                        if p=="/api/open":
                            directory=body.get("directory")
                            require(directory in app.workspaces,"WORKSPACE_MISSING","Select an already received original workspace.")
                            app.active=app.workspaces[directory];self._send(200,{"opened":True,"workspaceId":app.active.current()["state"]["id"]});return
                        w=self._selected(body)
                        if p=="/api/command":
                            try:
                                outcome=w.execute(body["command"],body["expectedRevision"])
                            except CommissioningError as error:
                                request_id=body["command"].get("requestId")
                                prior=w.request(request_id) if isinstance(request_id,str) else None
                                self._send(409,{"error":{"code":error.code,"message":str(error)},"notCommitted":prior is None,"requestId":request_id})
                            else:self._send(200,outcome)
                        elif p=="/api/blob":
                            raw=base64.b64decode(body["base64"],validate=True);self._send(200,w.put_blob(raw,body.get("sha256")))
                        elif p=="/api/export":
                            require(type(body.get("revision")) is int,"REVISION","Freeze the selected revision before export.")
                            self._send(200,export_workspace(w,body["publicationId"],app.source_root,app.selection,body["revision"]))
                        elif p=="/api/receive":
                            id=identifier(body["operationId"]);key=sha_id(body["sha256"]);name=body["name"]
                            require(isinstance(name,str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}",name) is not None,"RECEIVE_NAME","Use a named receiving workspace.")
                            target=app.receiving_root/name;archive=app.initial.directory/"incoming"/(key+".zip")
                            result=receive_archive(archive,target,id,key,body["bytes"])
                            directory=str(target.resolve())
                            if directory not in app.workspaces:app.workspaces[directory]=Workspace(target)
                            self._send(200,{**result,"opened":False})
                        else:fail("NOT_FOUND","This application operation is unavailable.")
                except BaseException as error:
                    try:self._error(error)
                    except (BrokenPipeError,ConnectionResetError):pass
            def do_PUT(self):
                path=None
                try:
                    parsed=urllib.parse.urlsplit(self.path);self._auth(urllib.parse.parse_qs(parsed.query))
                    if parsed.path.startswith("/api/blob/"):
                        key=sha_id(parsed.path.rsplit("/",1)[1])
                        length=int(self.headers.get("Content-Length","-1"));require(0<=length<=MAX_BLOB,"BLOB_CAPACITY","Original file exceeds the complete file allowance.")
                        with app.lock:
                            require(not app.closing,"CLOSED","Application is closing.")
                            w=self._selected({"workspaceId":self.headers.get("X-Workspace-Id"),"workspaceDirectory":self.headers.get("X-Workspace-Directory")})
                            raw=self.rfile.read(length);require(len(raw)==length,"UPLOAD_INCOMPLETE","The complete original file is required.")
                            result=w.put_blob(raw,key)
                        self._send(200,result);return
                    require(parsed.path.startswith("/api/archive/"),"NOT_FOUND","This upload route is unavailable.")
                    key=sha_id(parsed.path.rsplit("/",1)[1]);length=int(self.headers.get("Content-Length","-1"));require(0<=length<=MAX_ARCHIVE,"ARCHIVE_CAPACITY","Archive exceeds its complete receiving allowance.")
                    with app.lock:
                        require(not app.closing,"CLOSED","Application is closing.")
                        self._selected({"workspaceId":self.headers.get("X-Workspace-Id"),"workspaceDirectory":self.headers.get("X-Workspace-Directory")})
                        directory=app.initial.directory/"incoming";directory.mkdir(mode=0o700,exist_ok=True);target=directory/(key+".zip");path=directory/(key+".partial")
                        h=hashlib.sha256();remaining=length
                        with open(path,"wb") as f:
                            while remaining:
                                data=self.rfile.read(min(1024*1024,remaining));require(bool(data),"UPLOAD_INCOMPLETE","Original archive upload is incomplete.")
                                h.update(data);f.write(data);remaining-=len(data)
                            f.flush();os.fsync(f.fileno())
                        require(h.hexdigest()==key,"ARCHIVE_CHANGED","Uploaded archive identity differs.")
                        if target.exists():require(read_regular(target,MAX_ARCHIVE)==read_regular(path,MAX_ARCHIVE),"ARCHIVE_CHANGED","Original upload conflicts.");path.unlink()
                        else:os.rename(path,target);fsync_directory(directory)
                    self._send(200,{"sha256":key,"bytes":length,"received":True})
                except BaseException as error:
                    try:self._error(error)
                    except (BrokenPipeError,ConnectionResetError):pass
        try:
            self.server=ThreadingHTTPServer((host,port),Handler);self.server.daemon_threads=False;self.server.block_on_close=True
            actual=self.server.server_address;self.origin="http://"+("["+actual[0]+"]" if ":" in actual[0] else actual[0])+":"+str(actual[1])
            self.url=self.origin+"/?token="+urllib.parse.quote(self.token)
            self.thread=threading.Thread(target=self.server.serve_forever,name="bluewave-http",daemon=True);self.thread.start();self.started=True
        except BaseException:
            if self.server:self.server.server_close()
            raise
    def close(self):
        errors=[];self.closing=True
        if self.server and self.started:
            try:self.server.shutdown()
            except BaseException as e:errors.append(e)
        if self.thread and self.started:
            try:self.thread.join(timeout=10);require(not self.thread.is_alive(),"SERVER_ACTIVE","Original service thread is still closing.")
            except BaseException as e:errors.append(e)
        if self.server:
            try:self.server.server_close()
            except BaseException as e:errors.append(e)
        for path,w in list(self.workspaces.items()):
            if w is self.initial:continue
            try:w.close()
            except BaseException as e:errors.append(e)
        if errors:raise errors[0]
