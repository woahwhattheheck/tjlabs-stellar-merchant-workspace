#!/usr/bin/env python3
"""Keep the original role lease and exec the selected immutable Node host."""
from pathlib import Path
import argparse,os,sys
from files import *
from source import read_edition,verify_node,build,locked
import manage
def main():
    p=argparse.ArgumentParser(description=__doc__)
    for key in ("directory","installation-id","source-identity","ready-file"):p.add_argument("--"+key,required=True)
    p.add_argument("--port",type=int,default=0);a=p.parse_args()
    root=directory(a.directory,private=True);ready=absolute(a.ready_file);directory(ready.parent,private=True)
    need(not ready.exists(),"ready_file_exists","Select a new private process-ready file.")
    need(0<=a.port<=65535,"port_invalid","Select an available loopback port.")
    with locked(root/"services"/"operator.lock") as fd:
        os.set_inheritable(fd,True)
        value=manage.installation(root);manage.check_binding(value,{"installation_id":a.installation_id,"source_identity":a.source_identity})
        need(Path(sys.executable).resolve()==Path(value["python"]["path"]),"interpreter_changed","Use the selected original Python.")
        verify_node(value["node"]);edition,_,_=read_edition(root,value["source_identity"]);build(root,value["source_identity"],value["node"])
        need((edition/"bridge"/"launch.py").resolve()==Path(__file__).resolve(),"launcher_changed","Launch the actual installed bridge.")
        info=root.stat();args=[value["node"]["path"],str(edition/"bridge"/"host.mjs"),"--directory",str(root),"--installation-id",value["installation_id"],"--source-identity",value["source_identity"],"--workspace-id",value["workspace_id"],"--device",str(info.st_dev),"--inode",str(info.st_ino),"--ready-file",str(ready),"--port",str(a.port)]
        os.execve(args[0],args,dict(os.environ))
if __name__=="__main__":
    try:main()
    except (WorkbenchError,ValueError,KeyError,TypeError,OSError) as error:
        print(encoded({"schema":"stellar-forge.odr-process-error.v1","code":getattr(error,"code","original_service_failed"),"message":str(error)[:2000]}).decode(),file=sys.stderr,flush=True);raise SystemExit(2)
