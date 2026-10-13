"""Loopback operator for the original class intake workspace."""
import argparse, base64, json, pathlib, secrets
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit,parse_qs
from class_intake import Workspace,Conflict,MAX_SOURCE,MAX_PACKET,atomic,canonical,sha,course_sheet
def serve(directory,port=0):
 root=pathlib.Path(directory).resolve();w=Workspace(root,True);w.close();token=secrets.token_urlsafe(32);assets=pathlib.Path(__file__).parent/"public"
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def send(self,status,body,mime="application/json"):
   self.send_response(status);self.send_header("Content-Type",mime);self.send_header("Content-Length",str(len(body)));self.send_header("Cache-Control","no-store");self.send_header("X-Content-Type-Options","nosniff");self.send_header("Content-Security-Policy","default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");self.end_headers();self.wfile.write(body)
  def json(self,status,v):self.send(status,canonical(v))
  def run(self,method):
   w=None
   try:
    parts=urlsplit(self.path);path=parts.path;q={k:v[0] for k,v in parse_qs(parts.query).items()}
    if self.headers.get("Host")!=self.server.expected_host:raise ValueError("Unexpected host")
    if method=="GET" and path in ("/","/app.js","/style.css"):
     name={"/":"index.html","/app.js":"app.js","/style.css":"style.css"}[path];self.send(200,(assets/name).read_bytes(),{"/":"text/html; charset=utf-8","/app.js":"text/javascript; charset=utf-8","/style.css":"text/css; charset=utf-8"}[path]);return
    w=Workspace(root)
    if method=="GET":
     if path=="/api/state":self.json(200,{**w.state(),"token":token});return
     if path=="/api/request":self.json(200,w.request(q["id"]));return
     if path=="/api/view":self.json(200,w.view(q["id"],int(q["revision"]) if "revision" in q else None));return
     if path=="/api/history":self.json(200,w.history(q["id"]));return
     if path.startswith("/download/"):
      id=path.rsplit("/",1)[1]
      if len(id)!=64 or any(ch not in "0123456789abcdef" for ch in id):raise ValueError("Bad artifact")
      f=root/"exports"/id
      body=f.read_bytes()
      if sha(body)!=id:raise ValueError("Artifact integrity failed")
      self.send(200,body,"application/octet-stream");return
     raise ValueError("Unknown route")
    if self.headers.get("X-Intake-Token")!=token:raise ValueError("Missing local operator token")
    origin=self.headers.get("Origin")
    if origin and origin!="http://"+self.server.expected_host:raise ValueError("Foreign origin")
    length=int(self.headers.get("Content-Length","-1"))
    limit=MAX_SOURCE if path=="/api/source" else MAX_PACKET if path=="/api/receive" else 4*1024*1024
    if not 0<=length<=limit:raise ValueError("Request length exceeds bound")
    body=self.rfile.read(length)
    if len(body)!=length:raise ValueError("Incomplete request")
    if path=="/api/source":
     meta=json.loads(base64.b64decode(self.headers["X-Source-Metadata"],validate=True));result=w.add_source(body,meta)
    elif path=="/api/receive":result=w.receive(body)
    else:
     data=json.loads(body)
     if path=="/api/table":result=w.table(data["source"],data["format"],data.get("sheet"))
     elif path=="/api/save":result=w.save(data)
     elif path=="/api/compare":result=w.compare(data["id"],data["before"],data["after"])
     elif path=="/api/export":
      if data.get("format","packet")=="packet":out=w.export(data["id"],data.get("revision"));filename="Class_Intake_Complete.zip"
      elif data["format"]=="catalogue":out=course_sheet(w.view(data["id"],data.get("revision")))["csv"];filename="CourseStorm_Reviewed_Catalogue.csv"
      else:raise ValueError("Unknown format")
      digest=sha(out);atomic(root/"exports"/digest,out);result={"filename":filename,"bytes":len(out),"sha256":digest,"url":"/download/"+digest}
     else:raise ValueError("Unknown route")
    self.json(200,result)
   except Conflict as error:self.json(409,{"error":str(error)})
   except (ValueError,KeyError,FileNotFoundError) as error:self.json(400,{"error":str(error)})
   except Exception as error:self.json(500,{"error":str(error),"type":type(error).__name__})
   finally:
    if w is not None:w.close()
  def do_GET(self):self.run("GET")
  def do_POST(self):self.run("POST")
 server=ThreadingHTTPServer(("127.0.0.1",port),Handler);server.expected_host="127.0.0.1:"+str(server.server_port)
 print(json.dumps({"state":"READY","url":"http://"+server.expected_host,"workspace":str(root)}),flush=True)
 try:server.serve_forever()
 finally:server.server_close()
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--workspace",required=True);p.add_argument("--port",type=int,default=0);a=p.parse_args();serve(a.workspace,a.port)
