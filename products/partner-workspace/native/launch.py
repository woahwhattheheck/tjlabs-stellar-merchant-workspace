#!/usr/bin/env python3
"""Run the original workbench server in the existing Applications child."""
from __future__ import annotations
import argparse,io,json,os,signal,sys,uuid
from pathlib import Path
from urllib.parse import urlsplit
from files import *
from source import application,read_edition
import manage
PROCESS_SCHEMA="stellar-forge.partner-process.v1"
class OriginalAnnouncement(io.TextIOBase):
    def __init__(self,stream,identity,metadata,ready,port):
        self.stream=stream;self.identity=identity;self.metadata=metadata;self.ready=ready;self.port=port;self.pending="";self.received=False
    @property
    def encoding(self):return "utf-8"
    def writable(self):return True
    def write(self,text):
        count=len(text);self.pending+=text
        while "\n" in self.pending:
            line,self.pending=self.pending.split("\n",1)
            try:value=json.loads(line)
            except (ValueError,TypeError):value=None
            if not self.received and isinstance(value,dict) and "url" in value:
                need(value.get("workspace")==self.metadata,"original_workspace_changed","The server announced a different original workspace.")
                parsed=urlsplit(value["url"]);need(parsed.scheme=="http" and parsed.hostname=="127.0.0.1" and parsed.port and parsed.path in ("","/") and not parsed.query and not parsed.fragment and not parsed.username and not parsed.password and (not self.port or parsed.port==self.port),"original_service_url","The original server announced an invalid local URL.")
                result={**self.identity,"url":value["url"],"origin":"http://127.0.0.1:"+str(parsed.port)}
                once(self.ready,encoded(result));self.stream.write(encoded({k:v for k,v in result.items() if k!="url"}).decode());self.stream.flush();self.received=True
            else:self.stream.write(line+"\n")
        return count
    def flush(self):self.stream.flush()
def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ("directory","installation-id","source-identity","ready-file"):p.add_argument("--"+name,required=True)
    p.add_argument("--port",type=int,default=0);a=p.parse_args()
    need(0<=a.port<=65535,"port_invalid","Select a loopback port.")
    root=directory(a.directory,private=True);ready=absolute(a.ready_file);directory(ready.parent,private=True)
    need(not ready.exists(),"ready_file_exists","Use a new original ready file.")
    with locked(root/"services"/"operator.lock") as fd:
        os.set_inheritable(fd,True)
        value=manage.installation(root);manage.check_binding(value,{"installation_id":a.installation_id,"source_identity":a.source_identity})
        need(Path(sys.executable).resolve()==Path(value["python"]["path"]),"interpreter_changed","Use the selected original Python.")
        edition,manifest=read_edition(root,value["source_identity"]);source=Path(edition["source"])
        identity={"schema":PROCESS_SCHEMA,"role":"operator","product":value["product"],"workspace_id":value["workspace_id"],"pid":os.getpid(),"instance_id":str(uuid.uuid4()),"started_at":manage.now(),"installation_id":value["installation_id"],"source_identity":value["source_identity"],"directory":str(root),"workspace":value["workspace"],"application":str(source),"entry_sha256":file_identity(source/"workbench"/"app.py")["sha256"],"launcher_sha256":file_identity(Path(__file__).resolve())["sha256"],"device":str(root.stat().st_dev),"inode":str(root.stat().st_ino),"ready_file":str(ready)}
        old_stdout=sys.stdout;old_signal=signal.getsignal(signal.SIGTERM)
        def stop(signum,frame):raise KeyboardInterrupt
        signal.signal(signal.SIGTERM,stop)
        try:
            with application(root,value) as ctx:
                ws=ctx["Workspace"](value["workspace"],value["product"]);ws.validate()
                need(ws.meta["id"]==value["workspace_id"],"workspace_changed","The original workspace identity changed.")
                sys.stdout=OriginalAnnouncement(old_stdout,identity,ws.meta,ready,a.port)
                ctx["app"].serve(ws,a.port)
        finally:sys.stdout=old_stdout;signal.signal(signal.SIGTERM,old_signal)
if __name__=="__main__":
    try:main()
    except KeyboardInterrupt:pass
    except (WorkbenchError,ValueError,KeyError,TypeError,OSError) as error:
        print(json.dumps({"schema":"stellar-forge.partner-process-error.v1","code":getattr(error,"code","original_service_failed"),"message":str(error)[:2000]}),file=sys.stderr,flush=True);raise SystemExit(2)
