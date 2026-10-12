"""MIT. Participant operations on the existing authenticated IATI HTTP carrier."""
from __future__ import annotations
from pathlib import Path
import shutil
from iati_source import InputError
from workspace import load_json, file_digest
from publishing import MAX_METADATA, MAX_ASSET, csv_bytes

PREFIX = "/api/iati/publishing/"

def integer(value,default=None,minimum=1):
    if value is None:return default
    if not isinstance(value,str)or not value.isdecimal()or str(int(value))!=value or int(value)<minimum:
        raise InputError("Use an exact nonnegative page or positive revision number")
    return int(value)

def fields(q,required,optional=()):
    if not set(required)<=set(q)or set(q)-set(required)-set(optional):
        raise InputError("Select the complete participant route fields")

def get(handler,path,q):
    if not path.startswith(PREFIX):return False
    route=path[len(PREFIX):];ws=handler.server.workspace;work=ws.publishing
    if route=="context":
        fields(q,())
        with ws.mutex:
            handler._json(work.context())
    elif route=="request":
        fields(q,{"requestId"})
        with ws.mutex:
            selected=ws.db.execute("SELECT * FROM iati_publishing_requests WHERE id=?",(q["requestId"],)).fetchone()
            handler._json({"requestId":q["requestId"],"state":"NOT_RECORDED"} if selected is None else
                {"requestId":selected["id"],"state":"RECORDED","input":load_json(selected["input"]),
                 "inputSha256":selected["input_sha"],"project":work.project(selected["project"],selected["revision"])})
    elif route=="methodology":
        fields(q,());handler._json(work.methodology())
    elif route=="projects":
        fields(q,());handler._json({"projects":work.list()})
    elif route=="project":
        fields(q,{"id"},{"revision"});handler._json(work.project(q["id"],integer(q.get("revision"))))
    elif route=="history":
        fields(q,{"id"},{"revision"});handler._json({"history":work.history(q["id"],integer(q.get("revision")))})
    elif route=="activities":
        fields(q,{"id"},{"offset","limit","revision"})
        handler._json(work.activities(q["id"],integer(q.get("offset"),0,0),integer(q.get("limit"),50),integer(q.get("revision"))))
    elif route=="fields":
        fields(q,{"id","activity"},{"revision"});handler._json(work.fields(q["id"],q["activity"],integer(q.get("revision"))))
    elif route=="export":
        fields(q,{"id"},{"revision"})
        with ws.mutex,ws.scratch()as temp:
            target=temp/"IATI_Participant_Release.zip"
            work.export(q["id"],target,integer(q.get("revision")))
            handler._download(target,target.name,"application/zip")
    elif route=="feedback-template":
        fields(q,())
        with ws.scratch()as temp:
            target=temp/"feedback-template.csv"
            target.write_bytes(csv_bytes([],["finding_id","activity_id","indicator_id","finding","priority","owner","due_date"]))
            target.chmod(0o600);handler._download(target,target.name,"text/csv; charset=utf-8")
    elif route=="source":
        fields(q,{"id"},{"revision","edition"})
        with ws.mutex:
            project=work.project(q["id"],integer(q.get("revision")))
            selected=q.get("edition","candidate")
            if selected not in {"baseline","candidate"}:raise InputError("Select the baseline or candidate source")
            ident=project["baselineSource"if selected=="baseline"else"candidateSource"]
            work._source_bytes(ident)
            handler._download(ws.root/"sources"/(ident+".iati"),selected+"-publisher.xml","application/xml")
    elif route=="evidence":
        fields(q,{"id","asset"},{"revision"})
        with ws.mutex:
            project=work.project(q["id"],integer(q.get("revision")))
            found=[x for x in project["feedbackAssets"]+project["evidence"]if x["id"]==q["asset"]]
            if not found:raise InputError("Select a full original evidence file in this participant work")
            path=work.assets/(q["asset"]+".bin")
            if file_digest(path,MAX_ASSET)!=q["asset"]:raise InputError("Original evidence differs")
            handler._download(path,"evidence-"+q["asset"][:12]+".bin","application/octet-stream")
    else:
        handler._json({"error":"Unknown participant publishing read"},404)
    return True

def post(handler,path):
    if not path.startswith(PREFIX):return False
    route=path[len(PREFIX):];ws=handler.server.workspace;work=ws.publishing
    if route=="receive":
        with ws.mutex,ws.scratch()as temp:
            target=temp/"participant-release.zip"
            with target.open("xb")as stream:
                target.chmod(0o600)
                shutil.copyfileobj(handler._body(4*1024*1024*1024),stream,65536)
            handler._json(work.receive(target),201)
        return True
    payload=load_json(handler._body(MAX_METADATA).read())
    if not isinstance(payload,dict):raise InputError("Use one complete participant object")
    if route=="preview":
        if set(payload)!={"id","expectedRevision","patches"}:raise InputError("Preview the exact selected source revision and corrections")
        handler._json(work.preview(payload["id"],payload["patches"],payload["expectedRevision"]))
        return True
    actions={"create":work.create,"feedback":work.import_feedback,"evidence":work.evidence,
             "triage":work.triage,"correct":work.correct,"candidate":work.replace_candidate,
             "finance":work.finance,"review":work.review,"release":work.release}
    if route not in actions:handler._json({"error":"Unknown participant publishing action"},404)
    else:handler._json(actions[route](payload),201)
    return True
