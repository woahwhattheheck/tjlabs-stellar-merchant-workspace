"""One native owner for source import, review, serving and complete receiving."""
import argparse,csv,io,json,mimetypes,signal,sys,threading,uuid
from pathlib import Path
from .common import *
from .workspace import Workspace
from .exchange import source_inventory,export_workspace,validate_archive,receive_archive
from .server import Application
from . import domain

def selected(root,selection_path=None):
    root=Path(root).resolve(strict=True)
    value=loads(read_regular(selection_path or root/"source-selection.json"))
    source_inventory(root,value)
    return root,value

def import_source(workspace,body_path,file_path,request_id,actor,at,expected_revision):
    body=loads(read_regular(body_path));raw=read_regular(file_path)
    descriptor={"sha256":sha(raw),"bytes":len(raw),"mediaType":mimetypes.guess_type(str(file_path))[0] or "application/octet-stream","name":Path(file_path).name}
    if body.get("blob") is not None:
        require(set(body["blob"])==set(descriptor),"SOURCE_DESCRIPTOR","Use the complete original file descriptor.")
        require(body["blob"]["sha256"]==descriptor["sha256"] and body["blob"]["bytes"]==descriptor["bytes"],"SOURCE_CHANGED","Original source bytes differ.")
        descriptor=body["blob"]
    body["blob"]=descriptor
    identifier(request_id);timestamp(at)
    command={"requestId":request_id,"kind":"source.import","actor":actor,"at":at,"body":body}
    intent={"expectedRevision":expected_revision,"command":command}
    path=workspace.directory/"source-imports"/request_id/"intent.json"
    atomic_file(path,canonical(intent),immutable=True)
    workspace.put_blob(raw,descriptor["sha256"])
    return workspace.execute(command,expected_revision)

def report_bytes(workspace,record_id,fmt):
    state=workspace.current()["state"]
    if fmt=="html":
        value=domain.report_html(state,record_id,workspace.read_blob)
        return value.encode("utf-8") if isinstance(value,str) else value
    value=domain.report(state,record_id,workspace.read_blob)
    if fmt=="json":return canonical(value)
    rows=value["rows"];columns=sorted({key for row in rows for key in row})
    output=io.StringIO(newline="");writer=csv.writer(output,lineterminator="\r\n");writer.writerow(columns)
    for row in rows:writer.writerow([canonical(row.get(key)).decode("utf-8") for key in columns])
    return output.getvalue().encode("utf-8")

def main(argv=None):
    parser=argparse.ArgumentParser(description="Property continuity, reconciliation and receiving workspace")
    subs=parser.add_subparsers(dest="action",required=True)
    create=subs.add_parser("create");create.add_argument("--workspace",required=True);create.add_argument("--id",required=True);create.add_argument("--title",required=True);create.add_argument("--at")
    for name in ("show","history","request","command","blob","import-source","source-rows","report","export","serve"):
        p=subs.add_parser(name);p.add_argument("--workspace",required=True);p.add_argument("--source-root",default=str(Path(__file__).resolve().parent.parent));p.add_argument("--selection")
        if name in ("history","source-rows"):p.add_argument("--offset",type=int,default=0);p.add_argument("--limit",type=int,default=100)
        if name in ("request","source-rows","report"):p.add_argument("--id",required=True)
        if name=="command":p.add_argument("--command",required=True);p.add_argument("--expected-revision",type=int,required=True)
        if name=="blob":p.add_argument("--file",required=True);p.add_argument("--sha256")
        if name=="import-source":
            for key in ("body","file","request-id","actor-id","actor-name","at"):p.add_argument("--"+key,required=True)
            p.add_argument("--expected-revision",type=int,required=True)
        if name=="report":p.add_argument("--format",choices=("json","html","csv"),default="html");p.add_argument("--output",required=True)
        if name=="export":p.add_argument("--publication-id",required=True);p.add_argument("--revision",type=int,required=True)
        if name=="serve":p.add_argument("--host",default="127.0.0.1");p.add_argument("--port",type=int,default=0);p.add_argument("--receiving-root")
    inspect=subs.add_parser("inspect");inspect.add_argument("--archive",required=True);inspect.add_argument("--sha256");inspect.add_argument("--bytes",type=int)
    receive=subs.add_parser("receive");receive.add_argument("--archive",required=True);receive.add_argument("--destination",required=True);receive.add_argument("--operation-id",required=True);receive.add_argument("--sha256",required=True);receive.add_argument("--bytes",type=int,required=True)
    args=parser.parse_args(argv)
    if args.action=="create":
        path=Path(args.workspace);path.parent.mkdir(parents=True,exist_ok=True)
        prior=loads(read_regular(path/"creation.json")) if (path/"creation.json").is_file() else None
        at=args.at or (prior["createdAt"] if prior else now())
        with Workspace(path,create=True,workspace_id=args.id,title=args.title,created_at=at) as workspace:return workspace.current()
    if args.action=="inspect":
        descriptor,archive,_=validate_archive(args.archive,args.sha256,args.bytes)
        try:return descriptor
        finally:archive.close()
    if args.action=="receive":return receive_archive(args.archive,args.destination,args.operation_id,args.sha256,args.bytes)
    root,selection=selected(args.source_root,args.selection)
    with Workspace(args.workspace) as workspace:
        if args.action=="show":return {**workspace.current(),"view":domain.view(workspace.current()["state"],workspace.read_blob,as_of=now())}
        if args.action=="history":return workspace.history(args.offset,args.limit)
        if args.action=="request":return workspace.request(args.id)
        if args.action=="command":return workspace.execute(loads(read_regular(args.command)),args.expected_revision)
        if args.action=="blob":return workspace.put_blob(read_regular(args.file),args.sha256)
        if args.action=="import-source":return import_source(workspace,args.body,args.file,args.request_id,{"id":args.actor_id,"name":args.actor_name},args.at,args.expected_revision)
        if args.action=="source-rows":return domain.source_rows(workspace.current()["state"],args.id,workspace.read_blob,args.offset,args.limit)
        if args.action=="report":
            data=report_bytes(workspace,args.id,args.format);atomic_file(args.output,data,immutable=True)
            return {"path":str(Path(args.output).absolute()),"bytes":len(data),"sha256":sha(data)}
        if args.action=="export":return export_workspace(workspace,args.publication_id,root,selection,args.revision)
        stop=threading.Event();app=None
        for sig in (signal.SIGINT,signal.SIGTERM):signal.signal(sig,lambda *_:stop.set())
        try:
            app=Application(workspace,root,selection,host=args.host,port=args.port,receiving_root=args.receiving_root)
            print(json.dumps({"running":True,"url":app.url,"workspaceId":workspace.current()["state"]["id"]}),flush=True)
            stop.wait()
        finally:
            if app:app.close()
        return {"closed":True}
if __name__=="__main__":
    try:print(canonical(main()).decode("utf-8"))
    except CommissioningError as error:
        print(canonical({"error":{"code":error.code,"message":str(error)}}).decode("utf-8"),file=sys.stderr);raise SystemExit(1)
