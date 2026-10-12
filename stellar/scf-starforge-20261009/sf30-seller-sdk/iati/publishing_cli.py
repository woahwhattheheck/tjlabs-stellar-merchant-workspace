"""MIT. Complete participant operations through the original IATI command."""
from __future__ import annotations
from pathlib import Path
from workspace import load_json
from iati_source import InputError
from publishing import MAX_METADATA

ACTIONS=("create","feedback","evidence","triage","correct","candidate","finance","review","release")
def register(sub):
    sub.add_parser("publishing-list")
    sub.add_parser("publishing-methodology")
    for name in ("project","history"):
        selected=sub.add_parser("publishing-"+name)
        selected.add_argument("--id",required=True);selected.add_argument("--revision",type=int)
    selected=sub.add_parser("publishing-activities")
    selected.add_argument("--id",required=True);selected.add_argument("--offset",type=int,default=0)
    selected.add_argument("--limit",type=int,default=50);selected.add_argument("--revision",type=int)
    selected=sub.add_parser("publishing-fields")
    selected.add_argument("--id",required=True);selected.add_argument("--activity",required=True)
    selected.add_argument("--revision",type=int)
    for name in (*ACTIONS,"preview"):
        selected=sub.add_parser("publishing-"+name);selected.add_argument("--file",required=True)
    selected=sub.add_parser("publishing-export")
    selected.add_argument("--id",required=True);selected.add_argument("--revision",type=int)
    selected.add_argument("--out",required=True)
    selected=sub.add_parser("publishing-receive");selected.add_argument("--file",required=True)

def original(filename):
    with Path(filename).open("rb")as source:raw=source.read(MAX_METADATA+1)
    if len(raw)>MAX_METADATA:raise InputError("Participant original request exceeds 64 MiB")
    value=load_json(raw)
    if not isinstance(value,dict):raise InputError("Use a complete participant request object")
    return value

def command(ws,args):
    action=args.command.removeprefix("publishing-")
    p=ws.publishing
    if action=="list":return {"projects":p.list()}
    if action=="methodology":return p.methodology()
    if action=="project":return p.project(args.id,args.revision)
    if action=="history":return {"history":p.history(args.id,args.revision)}
    if action=="activities":return p.activities(args.id,args.offset,args.limit,args.revision)
    if action=="fields":return p.fields(args.id,args.activity,args.revision)
    if action=="export":return p.export(args.id,Path(args.out).expanduser().absolute(),args.revision)
    if action=="receive":return p.receive(Path(args.file).expanduser().absolute())
    value=original(args.file)
    if action=="preview":
        if set(value)!={"id","patches","expectedRevision"}:raise InputError("Preview the exact participant source revision")
        return p.preview(value["id"],value["patches"],value["expectedRevision"])
    functions={"create":p.create,"feedback":p.import_feedback,"evidence":p.evidence,
               "triage":p.triage,"correct":p.correct,"candidate":p.replace_candidate,
               "finance":p.finance,"review":p.review,"release":p.release}
    if action not in functions:raise InputError("Unknown participant command")
    return functions[action](value)
