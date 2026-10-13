"""One native JSON command for the retained Zarr source workspace."""
from __future__ import annotations
import argparse,json,sys
from pathlib import Path
from files import ZarrWorkspaceError,require,encoded,read_json
from workspace import Workspace

def main(argv=None):
    parser=argparse.ArgumentParser(description="Retain and review original Zarr stores through zarr-python.")
    commands=parser.add_subparsers(dest="command",required=True)
    for name in ("init","status","operation","result","frozen","apply","export"):
        command=commands.add_parser(name)
        command.add_argument("--directory",required=True)
        if name in ("operation","result","frozen","export"):command.add_argument("--id",required=True)
        if name=="result":
            command.add_argument("--offset",type=int,default=0)
            command.add_argument("--limit",type=int,default=100)
        if name=="export":command.add_argument("--out",required=True)
    receive=commands.add_parser("receive")
    receive.add_argument("--archive",required=True);receive.add_argument("--directory",required=True)
    verify=commands.add_parser("verify-packet");verify.add_argument("--archive",required=True)
    commands.add_parser("runtime")
    args=parser.parse_args(argv)
    if args.command=="runtime":
        import native
        result=native.runtime()
    elif args.command in ("receive","verify-packet"):
        import packet
        result=packet.receive_packet(args.archive,args.directory) if args.command=="receive" else packet.inspect_packet(args.archive)
    elif args.command=="export":
        import packet
        result=packet.export_packet(args.directory,args.id,args.out)
    else:
        if args.command=="init":
            directory=Path(args.directory)
            if directory.exists():
                with Workspace(directory,readonly=True) as workspace:result={**workspace.status(),"reopened":True}
            else:
                with Workspace(directory,create=True) as workspace:result=workspace.status()
        else:
            with Workspace(args.directory,readonly=args.command!="apply") as workspace:
                if args.command=="status":result=workspace.status()
                elif args.command=="operation":result=workspace.operation(args.id)
                elif args.command=="result":result=workspace.read_result(args.id,args.offset,args.limit)
                elif args.command=="frozen":result=workspace.frozen_source(args.id)
                else:
                    raw=sys.stdin.buffer.read(1024*1024+1)
                    require(len(raw)<=1024*1024,"ZARR_REQUEST_LIMIT","The exact original request exceeds 1 MiB")
                    result=workspace.execute(json.loads(raw))
    sys.stdout.buffer.write(encoded(result));sys.stdout.flush()
    return 0

if __name__=="__main__":
    try:raise SystemExit(main())
    except Exception as error:
        value={"code":getattr(error,"code","ZARR_NATIVE_ERROR"),"message":str(error)[:2000],"status":getattr(error,"status",400)}
        sys.stderr.buffer.write(encoded(value));sys.stderr.flush();raise SystemExit(1)
