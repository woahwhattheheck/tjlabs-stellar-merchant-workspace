"""MIT. Participant feedback, immutable corrections, review and release in IatiWorkspace."""
from __future__ import annotations
import base64
import copy
import csv
import hashlib
import html
import io
import json
import math
import os
from pathlib import Path
import re
import stat
import time
import zipfile
from threading import RLock
from types import SimpleNamespace

from iati_source import InputError
from workspace import json_bytes, load_json, digest, checked_id, private_write, regular, file_digest, sync_dir
from publishing_xml import Publisher, prepare_corrections, text, day, MAX_EDIT_SOURCE
from publishing_validation import validate_source

HERE = Path(__file__).resolve().parent
SCHEMA = "stellar-forge.iati-participant-project.v1"
PACKET = "stellar-forge.iati-participant-release.v1"
MAX_METADATA = 64 * 1024 * 1024
MAX_ASSET = 16 * 1024 * 1024
REQUEST = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,159}\Z")

def actor(value):
    return text(value, "Named operator", 160).strip()

def decoded(value):
    if not isinstance(value,str):
        raise InputError("Supply the complete original file as base64")
    try:
        raw=base64.b64decode(value,validate=True)
    except (ValueError,TypeError) as error:
        raise InputError("The complete file is not valid base64") from error
    if len(raw)>MAX_ASSET:
        raise InputError("Feedback and evidence files have a 16 MiB capacity")
    return raw

def csv_cell(value):
    """Protect derived spreadsheet text without changing retained source values."""
    if isinstance(value,str) and (value.startswith(("\t","\r","\n")) or value.lstrip().startswith(("=","+","-","@"))):
        return "'"+value
    return value

def csv_bytes(rows,columns):
    output=io.StringIO(newline="")
    writer=csv.DictWriter(output,fieldnames=columns,extrasaction="ignore",lineterminator="\n")
    writer.writeheader()
    writer.writerows({key:csv_cell(value) for key,value in row.items()} for row in rows)
    return output.getvalue().encode("utf-8")


def request_identity(raw,allowed,creating=False):
    if not isinstance(raw,dict) or set(raw)-({"requestId","actor"}|allowed|({"id","expectedRevision"} if not creating else set())):
        raise InputError("Unknown or incomplete participant request")
    key=raw.get("requestId")
    if not isinstance(key,str) or not REQUEST.fullmatch(key):
        raise InputError("Supply a stable requestId of 1 to 160 ordinary identifier characters")
    who=actor(raw.get("actor"))
    if len(json_bytes(raw))>MAX_METADATA:
        raise InputError("Complete participant request exceeds 64 MiB")
    return key,who

def revision_record(request,who,previous,value,action,now):
    value=copy.deepcopy(value)
    ident=previous["id"] if previous else digest(json_bytes({"requestId":request["requestId"],"publisher":value["publisherRef"]}))
    revision=previous["revision"]+1 if previous else 1
    value.update({"schema":SCHEMA,"id":ident,"revision":revision,
        "previousRevision":previous["revision"] if previous else None,
        "created":previous["created"] if previous else now,"updated":now,
        "lastAction":{"kind":action,"actor":who,"requestId":request["requestId"],"at":now}})
    if len(json_bytes(value))>MAX_METADATA:
        raise InputError("Complete participant revision exceeds 64 MiB")
    return value

class IatiPublishing:
    def __init__(self, workspace):
        self.ws=workspace
        self.root=workspace.root/"publishing"
        self.root.mkdir(mode=0o700,exist_ok=True)
        if self.root.is_symlink() or self.root.resolve()!=self.root:
            raise InputError("Participant storage must be an original workspace directory")
        self.assets=self.root/"assets"
        self.assets.mkdir(mode=0o700,exist_ok=True)
        self.exports=self.root/"portfolio-exports"
        self.exports.mkdir(mode=0o700,exist_ok=True)
        if self.exports.is_symlink() or self.exports.resolve()!=self.exports:
            raise InputError("Participant export custody must be an original workspace directory")
        if self.assets.is_symlink() or self.assets.resolve()!=self.assets:
            raise InputError("Participant assets must be an original workspace directory")
        workspace.db.executescript("""
            CREATE TABLE IF NOT EXISTS iati_publishing_projects(
              id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,revision));
            CREATE TABLE IF NOT EXISTS iati_publishing_requests(
              id TEXT PRIMARY KEY,input_sha TEXT NOT NULL,project TEXT NOT NULL,
              revision INTEGER NOT NULL,input TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS iati_publishing_assets(
              id TEXT PRIMARY KEY,body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS iati_publishing_identity(
              key TEXT PRIMARY KEY,value TEXT NOT NULL);
        """)
        with workspace.db:
            saved=workspace.db.execute("SELECT value FROM iati_publishing_identity WHERE key='workspace'").fetchone()
            if saved is None:
                self.identity=digest(os.urandom(32))
                workspace.db.execute("INSERT INTO iati_publishing_identity VALUES('workspace',?)",(self.identity,))
            else:self.identity=checked_id(saved["value"])

    def context(self):
        return {"schema":"stellar-forge.iati-participant-context.v1","workspaceSha256":self.identity}

    def methodology(self):
        raw=(HERE/"publishing-methodology.json").read_bytes()
        value=load_json(raw)
        return {"id":digest(raw),"body":value,"bytes":len(raw),"sha256":digest(raw)}

    def list(self):
        with self.ws.mutex:
            return [load_json(r["body"]) for r in self.ws.db.execute("""
                SELECT p.body FROM iati_publishing_projects p JOIN
                (SELECT id,MAX(revision) AS revision FROM iati_publishing_projects GROUP BY id) latest
                ON p.id=latest.id AND p.revision=latest.revision ORDER BY p.id""")]

    def project(self,ident,revision=None):
        checked_id(ident)
        with self.ws.mutex:
            if revision is None:
                row=self.ws.db.execute("SELECT body FROM iati_publishing_projects WHERE id=? ORDER BY revision DESC LIMIT 1",(ident,)).fetchone()
            else:
                if type(revision)is not int or revision<1:
                    raise InputError("Use a positive participant project revision")
                row=self.ws.db.execute("SELECT body FROM iati_publishing_projects WHERE id=? AND revision=?",(ident,revision)).fetchone()
            if row is None:raise InputError("Unknown retained participant project")
            return load_json(row["body"])

    def history(self,ident,through=None):
        self.project(ident,through)
        with self.ws.mutex:
            return [load_json(r["body"]) for r in self.ws.db.execute(
                "SELECT body FROM iati_publishing_projects WHERE id=? AND revision<=? ORDER BY revision",
                (ident,through or self.project(ident)["revision"]))]

    def _request(self,raw,allowed,creating=False):
        key,who=request_identity(raw,allowed,creating)
        body=json_bytes(raw)
        original=self.ws.db.execute("SELECT * FROM iati_publishing_requests WHERE id=?",(key,)).fetchone()
        if original:
            if original["input_sha"]!=digest(body):
                raise InputError("This requestId belongs to another complete input")
            return key,who,self.project(original["project"],original["revision"]),True
        if creating:return key,who,None,False
        selected=self.project(raw.get("id"))
        if type(raw.get("expectedRevision"))is not int or raw["expectedRevision"]!=selected["revision"]:
            raise InputError(f"Participant work changed; reopen revision {selected['revision']}")
        return key,who,selected,False

    def _now(self):
        return time.time()

    def _validation(self,source):
        return validate_source(source)

    def _save(self,request,who,previous,value,action):
        value=revision_record(request,who,previous,value,action,self._now())
        ident=value["id"];revision=value["revision"]
        encoded=json_bytes(value)
        if len(encoded)>MAX_METADATA:raise InputError("Complete participant revision exceeds 64 MiB")
        with self.ws.db:
            if previous:
                actual=self.ws.db.execute("SELECT MAX(revision) FROM iati_publishing_projects WHERE id=?",(ident,)).fetchone()[0]
                if actual!=previous["revision"]:raise InputError("Participant revision changed during preparation")
            self.ws.db.execute("INSERT INTO iati_publishing_projects VALUES(?,?,?)",(ident,revision,encoded.decode()))
            self.ws.db.execute("INSERT INTO iati_publishing_requests VALUES(?,?,?,?,?)",
                (request["requestId"],digest(json_bytes(request)),ident,revision,json_bytes(request).decode()))
        return value

    def _source_bytes(self,source_id):
        self.ws.source(source_id)
        path=self.ws.root/"sources"/(checked_id(source_id)+".iati")
        if file_digest(path,MAX_EDIT_SOURCE)!=source_id:
            raise InputError("The selected complete source bytes differ")
        return path.read_bytes()

    def _asset(self,raw,name,media,role):
        if not isinstance(raw,bytes) or len(raw)>MAX_ASSET:
            raise InputError("Complete original evidence exceeds 16 MiB")
        ident=digest(raw)
        path=self.assets/(ident+".bin")
        if path.exists():
            if file_digest(path,MAX_ASSET)!=ident:
                raise InputError("An original evidence file changed")
        else:
            private_write(path,raw);sync_dir(self.assets)
        prior=self.ws.db.execute("SELECT body FROM iati_publishing_assets WHERE id=?",(ident,)).fetchone()
        if prior:return load_json(prior["body"])
        result={"id":ident,"sha256":ident,"bytes":len(raw),"name":text(name,"Original filename",160),
                "media":text(media,"Media type",160),"role":role}
        with self.ws.db:
            self.ws.db.execute("INSERT INTO iati_publishing_assets VALUES(?,?)",(ident,json_bytes(result).decode()))
        return result

    def create(self,raw):
        with self.ws.mutex:
            _,who,prior,reused=self._request(raw,{"name","publisherRef","sourceId","activityIds","cutoff","notes"},True)
            if reused:return prior
            source_id=checked_id(raw.get("sourceId"))
            source=self._source_bytes(source_id)
            publisher=Publisher(source)
            ref=text(raw.get("publisherRef"),"Reporting organisation reference",1000)
            rows=list(publisher.rows(ref))
            if not rows:raise InputError("The source contains no activities for that reporting organisation")
            choices=raw.get("activityIds",[])
            if not isinstance(choices,list) or len(choices)>100000 or any(not isinstance(x,str) for x in choices) or len(choices)!=len(set(choices)):
                raise InputError("Select distinct original activity identifiers")
            eligible={r["activityId"] for r in rows}
            if choices and set(choices)-eligible:
                raise InputError("Selected activities must belong to this source and reporting organisation")
            cutoff=raw.get("cutoff");day(cutoff)
            original_validation=self._validation(source)
            value={"name":text(raw.get("name"),"Participant work name",160),"publisherRef":ref,
                "cutoff":cutoff,"notes":text(raw.get("notes",""),"Participant notes",16000,True),
                "activityIds":sorted(choices or eligible),"methodology":self.methodology(),
                "baselineSource":source_id,"candidateSource":source_id,"state":"DRAFT",
                "feedback":[],"feedbackAssets":[],"evidence":[],"corrections":[],
                "baselineValidation":original_validation,"candidateValidation":original_validation,
                "review":None,"release":None,"finance":None,"lastEditor":who}
            return self._save(raw,who,None,value,"create")

    def activities(self,ident,offset=0,limit=50,revision=None):
        if type(offset)is not int or offset<0 or type(limit)is not int or not 1<=limit<=200:
            raise InputError("Use a nonnegative offset and a page size from 1 to 200")
        with self.ws.mutex:
            p=self.project(ident,revision)
            source=Publisher(self._source_bytes(p["candidateSource"]))
            selected=set(p["activityIds"])
            rows=[r for r in source.rows(p["publisherRef"]) if r["activityId"] in selected]
            return {"project":ident,"revision":p["revision"],"sourceId":p["candidateSource"],
                    "rows":rows[offset:offset+limit],"total":len(rows),"offset":offset,"limit":limit}

    def fields(self,ident,activity_id,revision=None):
        with self.ws.mutex:
            p=self.project(ident,revision)
            if activity_id not in p["activityIds"]:raise InputError("Select an activity in this participant cohort")
            result=Publisher(self._source_bytes(p["candidateSource"])).fields(activity_id)
            return {"project":ident,"revision":p["revision"],"sourceId":p["candidateSource"],**result}

    def import_feedback(self,raw):
        with self.ws.mutex:
            _,who,p,reused=self._request(raw,{"fileBase64","filename"})
            if reused:return p
            data=decoded(raw.get("fileBase64"))
            try:
                stream=io.StringIO(data.decode("utf-8-sig"),newline="")
                reader=csv.DictReader(stream)
                headers=reader.fieldnames
                required={"finding_id","activity_id","indicator_id","finding"}
                if not headers or len(headers)!=len(set(headers)) or not required<=set(headers):
                    raise InputError("Feedback CSV needs unique finding_id, activity_id, indicator_id and finding columns")
                rows=list(reader)
            except UnicodeError as error:
                raise InputError("Use a complete UTF-8 feedback CSV") from error
            if not rows or len(rows)>50000:raise InputError("Import 1 to 50,000 complete feedback rows")
            known={i["id"] for i in p["methodology"]["body"]["indicators"]}
            existing={x["id"]:x for x in p["feedback"]}
            selected=set(p["activityIds"]);batch=set();incoming=[]
            for index,row in enumerate(rows,2):
                if None in row or any(v is None for v in row.values()):
                    raise InputError(f"Feedback line {index} does not match its original header")
                fid=text(row["finding_id"],"Original finding identifier",300)
                if fid in batch:raise InputError("Feedback file repeats a finding identifier")
                if fid in existing:raise InputError("This finding is already retained; use its existing review or a new original finding ID")
                batch.add(fid)
                activity_id=row["activity_id"].strip()
                if activity_id and activity_id not in selected:
                    raise InputError(f"Feedback line {index} names an activity outside this participant cohort")
                indicator=row["indicator_id"].strip()
                if indicator not in known:raise InputError(f"Feedback line {index} has no indicator in the selected methodology")
                due=row.get("due_date","").strip()
                if due:day(due)
                priority=row.get("priority","normal").strip() or "normal"
                if priority not in {"normal","blocking"}:raise InputError("Feedback priority must be normal or blocking")
                incoming.append({"id":fid,"activityId":activity_id,"indicatorId":indicator,
                    "finding":text(row["finding"],"Original finding",16000),"priority":priority,
                    "owner":text(row.get("owner",""),"Finding owner",160,True),"dueDate":due,
                    "status":"open","note":"","evidenceIds":[],"sourceRow":index,"original":row})
            asset=self._asset(data,raw.get("filename","feedback.csv"),"text/csv","feedback")
            for row in incoming:row["sourceAsset"]=asset["id"]
            value=copy.deepcopy(p)
            value["feedback"].extend(incoming);value["feedbackAssets"].append(asset)
            value.update(state="DRAFT",review=None,release=None,lastEditor=who)
            return self._save(raw,who,p,value,"feedback")

    def evidence(self,raw):
        with self.ws.mutex:
            _,who,p,reused=self._request(raw,{"fileBase64","filename","media","label","sourceUrl"})
            if reused:return p
            asset=self._asset(decoded(raw.get("fileBase64")),raw.get("filename","evidence.bin"),
                raw.get("media","application/octet-stream"),"participant-evidence")
            item={**asset,"label":text(raw.get("label"),"Evidence label",160),
                  "sourceUrl":text(raw.get("sourceUrl",""),"Evidence source reference",8000,True),
                  "retainedBy":who,"retainedAt":self._now()}
            value=copy.deepcopy(p);value["evidence"].append(item)
            value.update(state="DRAFT",review=None,release=None,lastEditor=who)
            return self._save(raw,who,p,value,"evidence")

    def triage(self,raw):
        with self.ws.mutex:
            _,who,p,reused=self._request(raw,{"findingId","status","owner","note","evidenceIds"})
            if reused:return p
            if raw.get("status")not in {"open","planned","resolved","deferred"}:
                raise InputError("Select open, planned, resolved or deferred")
            matches=[x for x in p["feedback"] if x["id"]==raw.get("findingId")]
            if len(matches)!=1:raise InputError("Select the exact retained feedback finding")
            note=text(raw.get("note",""),"Finding decision",16000,raw["status"]in {"open","planned"})
            evidence_ids=raw.get("evidenceIds",[])
            known={x["id"] for x in p["evidence"]}
            if not isinstance(evidence_ids,list) or len(evidence_ids)!=len(set(evidence_ids)) or any(x not in known for x in evidence_ids):
                raise InputError("Select retained evidence files from this participant work")
            value=copy.deepcopy(p)
            item=next(x for x in value["feedback"] if x["id"]==raw["findingId"])
            item.update(status=raw["status"],owner=text(raw.get("owner",item["owner"]),"Finding owner",160,True),
                note=note,evidenceIds=evidence_ids,decidedBy=who,decidedAt=self._now(),
                candidateSource=p["candidateSource"])
            value.update(state="DRAFT",review=None,release=None,lastEditor=who)
            return self._save(raw,who,p,value,"finding-decision")

    def preview(self,ident,patches,expected_revision):
        with self.ws.mutex:
            p=self.project(ident)
            if expected_revision!=p["revision"]:raise InputError("Reopen the current participant revision")
            if not isinstance(patches,list) or not patches or any(not isinstance(x,dict) or x.get("activityId")not in p["activityIds"] for x in patches):
                raise InputError("Correct only activities in this participant cohort")
            candidate,audit=prepare_corrections(self._source_bytes(p["candidateSource"]),patches,p["publisherRef"])
            validation=self._validation(candidate)
            audit.pop("candidateInventory",None)
            result={"project":ident,"revision":p["revision"],"sourceId":p["candidateSource"],
                "candidateId":digest(candidate),"audit":audit,"validation":validation}
            result["previewSha256"]=digest(json_bytes(result))
            return result

    def correct(self,raw):
        with self.ws.mutex:
            _,who,p,reused=self._request(raw,{"patches","expectedPreviewSha256","note"})
            if reused:return p
            preview=self.preview(p["id"],raw.get("patches"),p["revision"])
            if raw.get("expectedPreviewSha256")!=preview["previewSha256"]:
                raise InputError("Apply the exact complete correction preview you reviewed")
            candidate,audit=prepare_corrections(self._source_bytes(p["candidateSource"]),raw["patches"],p["publisherRef"])
            source=self.ws.add_source(io.BytesIO(candidate),p["name"]+" correction","participant-candidate.xml")
            if source["id"]!=preview["candidateId"]:raise InputError("Candidate source identity changed")
            audit.pop("candidateInventory",None)
            value=copy.deepcopy(p)
            value["corrections"].append({"kind":"structured-correction","actor":who,"at":self._now(),
                "requestId":raw["requestId"],"note":text(raw.get("note"),"Correction note",16000),
                "previewSha256":preview["previewSha256"],"audit":audit})
            value.update(candidateSource=source["id"],candidateValidation=preview["validation"],
                state="DRAFT",review=None,release=None,finance=None,lastEditor=who)
            for item in value["feedback"]:
                if item["status"]=="resolved":item.update(status="planned",note=item["note"]+"\nRecheck against the new candidate source.")
            return self._save(raw,who,p,value,"correction")

    def replace_candidate(self,raw):
        with self.ws.mutex:
            _,who,p,reused=self._request(raw,{"sourceId","note"})
            if reused:return p
            source_id=checked_id(raw.get("sourceId"))
            source=self._source_bytes(source_id)
            parsed=Publisher(source)
            present={x["activityId"] for x in parsed.rows(p["publisherRef"])}
            if set(p["activityIds"])-present:
                raise InputError("Replacement must retain every selected publisher activity; record a separately agreed cohort for removals")
            validation=self._validation(source)
            value=copy.deepcopy(p)
            value["corrections"].append({"kind":"publisher-supplied-edition","actor":who,"at":self._now(),
                "requestId":raw["requestId"],"note":text(raw.get("note"),"Replacement source note",16000),
                "beforeSource":p["candidateSource"],"afterSource":source_id})
            value.update(candidateSource=source_id,candidateValidation=validation,state="DRAFT",
                         review=None,release=None,finance=None,lastEditor=who)
            for item in value["feedback"]:
                if item["status"]=="resolved":item.update(status="planned",note=item["note"]+"\nRecheck against the new publisher edition.")
            return self._save(raw,who,p,value,"publisher-edition")

    def finance(self,raw):
        with self.ws.mutex:
            _,who,p,reused=self._request(raw,set())
            if reused:return p
            key="participant:"+digest(raw["requestId"].encode())
            before=self.ws.save_portfolio({"requestId":key+":before","name":p["name"]+" finance",
                "sources":[p["baselineSource"]],"selection":{"activityIds":p["activityIds"]},
                "notes":"Participant baseline source and exact selected activity scope."})
            after=self.ws.save_portfolio({"requestId":key+":candidate","id":before["id"],
                "expectedRevision":before["revision"],"name":p["name"]+" finance",
                "sources":[p["candidateSource"]],"selection":{"activityIds":p["activityIds"]},
                "notes":"Participant candidate source and exact selected activity scope."})
            comparison=self.ws.compare_portfolio({"id":before["id"],"beforeRevision":before["revision"],"afterRevision":after["revision"]})
            value=copy.deepcopy(p)
            value["finance"]={"portfolioId":before["id"],"beforeRevision":before["revision"],
                "candidateRevision":after["revision"],"comparisonId":comparison["id"],
                "baselineSource":p["baselineSource"],"candidateSource":p["candidateSource"],
                "comparedBy":who,"comparedAt":self._now()}
            value.update(state="DRAFT",review=None,release=None)
            return self._save(raw,who,p,value,"finance-comparison")

    def review(self,raw):
        with self.ws.mutex:
            _,who,p,reused=self._request(raw,{"decision","note"})
            if reused:return p
            if raw.get("decision")not in {"accepted","needs-correction"}:raise InputError("Select accepted or needs-correction")
            if who.casefold()==p["lastEditor"].casefold():raise InputError("The release reviewer must be a different named operator from the last editor")
            if raw["decision"]=="accepted":
                if p["candidateValidation"]["state"]!="VALID":
                    raise InputError("Resolve the candidate's original IATI schema findings before release review")
                if not p.get("finance") or p["finance"]["candidateSource"]!=p["candidateSource"]:
                    raise InputError("Prepare the complete original baseline/candidate finance comparison")
                if any(x["status"]not in {"resolved","deferred"} or not x["note"].strip() for x in p["feedback"]):
                    raise InputError("Record a resolution or explicit deferral for every retained feedback item")
            note=text(raw.get("note"),"Named review decision",16000)
            value=copy.deepcopy(p)
            value["review"]={"decision":raw["decision"],"reviewer":who,"note":note,"at":self._now(),
                "sourceId":p["candidateSource"],"reviewedRevision":p["revision"],
                "definitionSha256":digest(json_bytes({k:p[k] for k in ("candidateSource","feedback","corrections","finance","candidateValidation")}))}
            value.update(state="REVIEWED" if raw["decision"]=="accepted" else "NEEDS_CORRECTION",release=None)
            return self._save(raw,who,p,value,"review")

    def release(self,raw):
        with self.ws.mutex:
            _,who,p,reused=self._request(raw,{"label","note"})
            if reused:return p
            if p["state"]!="REVIEWED" or not p["review"] or p["review"]["decision"]!="accepted" or p["review"]["sourceId"]!=p["candidateSource"]:
                raise InputError("Use the accepted review of this exact candidate")
            expected=digest(json_bytes({k:p[k] for k in ("candidateSource","feedback","corrections","finance","candidateValidation")}))
            if expected!=p["review"]["definitionSha256"]:raise InputError("The reviewed participant definition changed")
            value=copy.deepcopy(p)
            value["release"]={"id":digest(json_bytes({"project":p["id"],"revision":p["revision"],"request":raw["requestId"]})),
                "label":text(raw.get("label"),"Release label",160),"note":text(raw.get("note"),"Release handover note",16000),
                "sourceId":p["candidateSource"],"sourceSha256":p["candidateSource"],"releasedBy":who,
                "releasedAt":self._now(),"review":p["review"],"publicationState":"READY_FOR_PUBLISHER"}
            value["state"]="RELEASED"
            return self._save(raw,who,p,value,"release")

    def export(self,ident,output,revision=None):
        from iati_workspace import packet_write
        output=Path(output).expanduser().absolute()
        with self.ws.mutex,self.ws.scratch() as temp:
            p=self.project(ident,revision)
            if p["state"]!="RELEASED" or not p["release"]:
                raise InputError("Select a retained released revision")
            history=self.history(ident,p["revision"])
            requests=[dict(r) for r in self.ws.db.execute(
                "SELECT * FROM iati_publishing_requests WHERE project=? AND revision<=? ORDER BY revision",(ident,p["revision"]))]
            source_ids=set()
            assets={}
            portfolios={}
            for row in history:
                source_ids.update((row["baselineSource"],row["candidateSource"]))
                for item in row["feedbackAssets"]+row["evidence"]:assets[item["id"]]=item
                if row.get("finance"):
                    f=row["finance"];portfolios[f["portfolioId"]]=max(portfolios.get(f["portfolioId"],0),f["candidateRevision"])
            entries={}
            def put(name,value):
                path=temp/name;path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
                private_write(path,value);entries[name]=path
            put("participant.json",json_bytes(p));put("history.json",json_bytes(history))
            put("requests.json",json_bytes(requests))
            put("methodology.json",json_bytes(p["methodology"]))
            put("feedback.csv",csv_bytes([{**x,"evidenceIds":"|".join(x["evidenceIds"])} for x in p["feedback"]],
                ["id","activityId","indicatorId","finding","priority","owner","dueDate","status","note","evidenceIds","sourceAsset","sourceRow"]))
            put("corrections.json",json_bytes(p["corrections"]))
            put("validation.json",json_bytes(p["candidateValidation"]))
            for source_id in sorted(source_ids):
                self._source_bytes(source_id)
                entries["sources/"+source_id+".xml"]=self.ws.root/"sources"/(source_id+".iati")
            entries["publisher-release.xml"]=entries["sources/"+p["candidateSource"]+".xml"]
            for asset_id,item in assets.items():
                path=self.assets/(asset_id+".bin")
                if file_digest(path,MAX_ASSET)!=asset_id:raise InputError("Retained source evidence changed")
                entries["evidence/"+asset_id+".bin"]=path
            put("evidence.json",json_bytes(assets))
            for portfolio_id,selected_revision in portfolios.items():
                target=self.exports/(portfolio_id+"-r"+str(selected_revision)+".zip")
                self.ws.export_portfolio(portfolio_id,target,selected_revision)
                entries["portfolios/"+portfolio_id+".zip"]=target
            source_rows=list(Publisher(self._source_bytes(p["candidateSource"])).rows(p["publisherRef"]))
            put("activities.csv",csv_bytes(source_rows,["activityId","title","reportingOrgRef","hierarchy","status","documents","sha256"]))
            for name in ("PUBLISHING.md","PUBLISHING_SOURCES.md","publishing-methodology.json","publishing-schema-source.json"):
                put("guides/"+name,(HERE/name).read_bytes())
            schema_index=load_json((HERE/"publishing-schema-source.json").read_bytes())
            for name,item in schema_index["files"].items():
                body=(HERE/"publishing-schema"/name).read_bytes()
                if digest(body)!=item["sha256"]:raise InputError("The installed schema differs from its original source")
                put("schema/"+name,body)
            put("release.html",self._report_html(p).encode())
            return {**packet_write(output,entries,PACKET,{"project":ident,"revision":p["revision"],
                "release":p["release"]["id"],"candidateSource":p["candidateSource"]}),
                "project":ident,"revision":p["revision"],"release":p["release"]["id"]}

    def _report_html(self,p):
        e=html.escape
        rows="".join("<tr><td>"+e(x["id"])+"</td><td>"+e(x["activityId"] or "Organisation")+"</td><td>"+
            e(x["indicatorId"])+"</td><td>"+e(x["finding"])+"</td><td>"+e(x["status"])+"</td><td>"+
            e(x["note"])+"</td></tr>" for x in p["feedback"])
        return "<!doctype html><html lang=en><meta charset=utf-8><title>"+e(p["name"])+"</title><style>body{font:16px/1.5 system-ui;max-width:1100px;margin:40px auto;color:#171717}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:9px;vertical-align:top;text-align:left}code{overflow-wrap:anywhere}@media print{body{margin:0;font-size:11pt}tr{break-inside:avoid}}</style><h1>"+e(p["name"])+"</h1><p>Participant release "+e(p["release"]["label"])+" · revision "+str(p["revision"])+"</p><p>Reporting organisation: "+e(p["publisherRef"])+" · "+str(len(p["activityIds"]))+" selected activities.</p><p>Exact publisher source: <code>"+p["candidateSource"]+"</code></p><h2>Review</h2><p>"+e(p["review"]["reviewer"])+": "+e(p["review"]["note"])+"</p><h2>Feedback disposition</h2><table><thead><tr><th>Finding</th><th>Activity</th><th>Indicator</th><th>Original feedback</th><th>Disposition</th><th>Decision</th></tr></thead><tbody>"+rows+"</tbody></table><h2>Publisher handover</h2><p>"+e(p["release"]["note"])+"</p><p>The package contains the complete publisher XML, source editions, original feedback and evidence, correction history, schema findings and native finance portfolio. The publisher operates its existing publication process and retains its publication receipt with this release.</p></html>"


    def _verify_delivery(self,p,history,requests,assets,temp,manifest):
        """Check cross-file selection before joining any received participant history."""
        if not isinstance(assets,dict):
            raise InputError("Participant evidence inventory must be complete")
        if any(not isinstance(x,dict) for x in history+requests):
            raise InputError("Participant history contains an invalid row")
        first=history[0]
        fixed=("id","publisherRef","activityIds","baselineSource","cutoff","methodology","created")
        source_ids=set();asset_ids=set();portfolios={}
        for number,row in enumerate(history,1):
            if any(row.get(key)!=first.get(key) for key in fixed):
                raise InputError("A participant history changed its original publisher, cohort or methodology")
            if row.get("previousRevision")!=(number-1 if number>1 else None):
                raise InputError("Participant predecessor history is incomplete")
            if not all(isinstance(row.get(key),list) for key in ("feedback","feedbackAssets","evidence","corrections")):
                raise InputError("Participant work omits a complete operating collection")
            source_ids.update((checked_id(row["baselineSource"]),checked_id(row["candidateSource"])))
            for item in row["feedbackAssets"]+row["evidence"]:
                if not isinstance(item,dict) or item.get("id")not in assets:
                    raise InputError("A referenced original feedback or evidence asset is absent")
                aid=checked_id(item["id"]);record=assets[aid]
                if not isinstance(record,dict) or any(item.get(key)!=record.get(key) for key in ("id","sha256","bytes","name","media","role")) or record.get("sha256")!=aid:
                    raise InputError("Evidence metadata differs from its original referenced file")
                asset_ids.add(aid)
            if row.get("finance"):
                f=row["finance"];fid=checked_id(f["portfolioId"])
                if f["baselineSource"]!=row["baselineSource"] or f["candidateSource"]!=row["candidateSource"]:
                    raise InputError("A finance comparison selects different publisher editions")
                portfolios[fid]=max(portfolios.get(fid,0),f["candidateRevision"])
        if asset_ids!=set(assets):
            raise InputError("The evidence inventory must contain exactly the referenced original assets")
        exact={"sources/"+sid+".xml"for sid in source_ids}
        if {n for n in manifest["files"]if n.startswith("sources/")}!=exact:
            raise InputError("The release must contain exactly every retained publisher edition")
        if {n for n in manifest["files"]if n.startswith("evidence/")}!={"evidence/"+aid+".bin"for aid in asset_ids}:
            raise InputError("The release evidence file set differs from its complete history")
        if {n for n in manifest["files"]if n.startswith("portfolios/")}!={"portfolios/"+fid+".zip"for fid in portfolios}:
            raise InputError("The release omits a referenced full native finance portfolio")
        for name,expected in (("methodology.json",p["methodology"]),("corrections.json",p["corrections"]),
                              ("validation.json",p["candidateValidation"])):
            if load_json((temp/name).read_bytes())!=expected:
                raise InputError("A release companion differs from the selected participant revision: "+name)
        method=(temp/"guides"/"publishing-methodology.json").read_bytes()
        if digest(method)!=p["methodology"]["sha256"] or digest(method)!=p["methodology"]["id"] or len(method)!=p["methodology"]["bytes"] or load_json(method)!=p["methodology"]["body"]:
            raise InputError("The full original methodology differs from its selected edition")
        schema_bytes=(temp/"guides"/"publishing-schema-source.json").read_bytes()
        schema_index=load_json(schema_bytes)
        if not isinstance(schema_index,dict) or not isinstance(schema_index.get("files"),dict):
            raise InputError("The original schema source manifest is absent")
        if {n for n in manifest["files"]if n.startswith("schema/")}!={"schema/"+n for n in schema_index["files"]}:
            raise InputError("The original schema and complete licence closure differ")
        for name,item in schema_index["files"].items():
            if Path(name).name!=name or manifest["files"]["schema/"+name]!={"bytes":item["bytes"],"sha256":item["sha256"]}:
                raise InputError("An original validation source differs from its schema manifest")
        if p["candidateValidation"].get("sourceSha256")!=p["candidateSource"] or p["candidateValidation"].get("schemaManifestSha256")!=digest(schema_bytes):
            raise InputError("The retained validation selects different source or schema bytes")
        review=p.get("review");release=p.get("release")
        definition=digest(json_bytes({k:p[k]for k in ("candidateSource","feedback","corrections","finance","candidateValidation")}))
        if not review or not release or review.get("decision")!="accepted" or review.get("definitionSha256")!=definition or review.get("reviewer","").casefold()==p["lastEditor"].casefold() or release.get("review")!=review or review.get("sourceId")!=p["candidateSource"] or release.get("sourceId")!=p["candidateSource"] or release.get("sourceSha256")!=p["candidateSource"]:
            raise InputError("The release has no complete distinct review of its exact candidate")
        if p["candidateValidation"].get("state")!="VALID" or not p.get("finance"):
            raise InputError("The released candidate lacks its original schema and finance review")
        expected_csv=csv_bytes([{**x,"evidenceIds":"|".join(x["evidenceIds"])}for x in p["feedback"]],
            ["id","activityId","indicatorId","finding","priority","owner","dueDate","status","note","evidenceIds","sourceAsset","sourceRow"])
        if (temp/"feedback.csv").read_bytes()!=expected_csv or (temp/"release.html").read_bytes()!=self._report_html(p).encode():
            raise InputError("The complete feedback or printable handover differs")
        originals={}
        for sid in source_ids:
            source=temp/"sources"/(sid+".xml")
            if not source.is_file() or file_digest(source,MAX_EDIT_SOURCE)!=sid:
                raise InputError("A full original publisher edition is absent")
            originals[sid]=Publisher(source.read_bytes())
            present={r["activityId"]for r in originals[sid].rows(p["publisherRef"])}
            if set(p["activityIds"])-present:
                raise InputError("The original publisher source omits a selected activity")
        rows=list(originals[p["candidateSource"]].rows(p["publisherRef"]))
        if (temp/"activities.csv").read_bytes()!=csv_bytes(rows,["activityId","title","reportingOrgRef","hierarchy","status","documents","sha256"]):
            raise InputError("The complete activity census differs from the candidate")
        feedback_inputs={}
        for row in history:
            for item in row["feedbackAssets"]:
                aid=item["id"]
                if aid not in feedback_inputs:
                    raw=(temp/"evidence"/(aid+".bin")).read_bytes()
                    try:feedback_inputs[aid]=list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"),newline="")))
                    except (UnicodeError,csv.Error)as error:raise InputError("Original feedback CSV is unreadable")from error
            for finding in row["feedback"]:
                aid=finding.get("sourceAsset");number=finding.get("sourceRow")
                if aid not in feedback_inputs or type(number)is not int or number<2 or number-2>=len(feedback_inputs[aid]) or feedback_inputs[aid][number-2]!=finding.get("original"):
                    raise InputError("A feedback finding differs from its original complete source row")
                if finding["original"].get("finding_id")!=finding["id"] or finding["original"].get("finding")!=finding["finding"]:
                    raise InputError("The original feedback identity or text changed")
                if any(x not in {a["id"]for a in row["evidence"]} for x in finding["evidenceIds"]):
                    raise InputError("A finding refers to unretained evidence")
        for number,request in enumerate(requests,1):
            if set(request)!={"id","input_sha","project","revision","input"} or request["project"]!=p["id"] or request["revision"]!=number or not isinstance(request["input"],str) or digest(request["input"].encode())!=request["input_sha"]:
                raise InputError("Participant request identity or order differs")
            raw=load_json(request["input"])
            if not isinstance(raw,dict) or raw.get("requestId")!=request["id"] or not REQUEST.fullmatch(request["id"]) or history[number-1]["lastAction"].get("requestId")!=request["id"] or history[number-1]["lastAction"].get("actor")!=actor(raw.get("actor")):
                raise InputError("Participant action history differs from its original request")
        if len({r["id"]for r in requests})!=len(requests) or digest(json_bytes({"requestId":requests[0]["id"],"publisher":p["publisherRef"]}))!=p["id"]:
            raise InputError("Participant project or request identity differs")
        for aid,item in assets.items():
            source=temp/"evidence"/(aid+".bin")
            if not source.is_file() or file_digest(source,MAX_ASSET)!=aid or source.stat().st_size!=item["bytes"]:
                raise InputError("An original feedback or evidence file is absent")
        for fid,last in portfolios.items():
            with zipfile.ZipFile(temp/"portfolios"/(fid+".zip"))as original:
                for name in ("manifest.json","portfolio-history.json","comparisons.json"):
                    if original.getinfo(name).file_size>MAX_METADATA:
                        raise InputError("A nested portfolio metadata file exceeds its declared capacity")
                original_manifest=load_json(original.read("manifest.json"))
                ph=load_json(original.read("portfolio-history.json"))
                comparisons=load_json(original.read("comparisons.json"))
            if original_manifest.get("portfolio")!=fid or original_manifest.get("revision")!=last or len(ph)!=last:
                raise InputError("The full native finance archive selects another revision")
            for row in history:
                if not row.get("finance")or row["finance"]["portfolioId"]!=fid:continue
                f=row["finance"]
                before=ph[f["beforeRevision"]-1];after=ph[f["candidateRevision"]-1]
                if before.get("id")!=fid or after.get("id")!=fid or before.get("sources")!=[f["baselineSource"]] or after.get("sources")!=[f["candidateSource"]] or before["selection"].get("activityIds")!=p["activityIds"] or after["selection"].get("activityIds")!=p["activityIds"] or not any(c.get("id")==f["comparisonId"]for c in comparisons):
                    raise InputError("The participant finance selection differs from its native archive")
        _TransitionVerification(history,requests,originals,assets,temp).verify()
        return source_ids,portfolios

    def receive(self,filename):
        """Verify all original bytes, then join one immutable participant history."""
        with self.ws.mutex,self.ws.scratch() as temp:
            path=Path(filename)
            regular(path,4*1024*1024*1024)
            with zipfile.ZipFile(path) as archive:
                infos=archive.infolist();names=[x.filename for x in infos]
                if len(names)!=len(set(names)) or len(names)>16384 or "manifest.json"not in names:
                    raise InputError("Participant packet member inventory is invalid")
                if archive.getinfo("manifest.json").file_size>MAX_METADATA:
                    raise InputError("Participant manifest exceeds 64 MiB")
                manifest=load_json(archive.read("manifest.json"))
                if not isinstance(manifest,dict) or manifest.get("schema")!=PACKET or set(manifest.get("files",{}))!=set(names)-{"manifest.json"}:
                    raise InputError("Participant packet does not declare all original members")
                required={"participant.json","history.json","requests.json","methodology.json","feedback.csv",
                    "corrections.json","validation.json","evidence.json","activities.csv","publisher-release.xml","release.html",
                    "guides/PUBLISHING.md","guides/PUBLISHING_SOURCES.md","guides/publishing-methodology.json","guides/publishing-schema-source.json"}
                if not required<=set(names):raise InputError("Participant packet omits a required complete deliverable")
                total=0
                for info in infos:
                    if info.filename=="manifest.json":continue
                    if info.is_dir() or info.flag_bits&1 or stat.S_ISLNK(info.external_attr>>16) or info.compress_type not in {zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED}:
                        raise InputError("Participant packet member type is invalid")
                    if not re.fullmatch(r"(?:[a-z-]+\.(?:json|csv|xml|html)|sources/[0-9a-f]{64}\.xml|evidence/[0-9a-f]{64}\.bin|portfolios/[0-9a-f]{64}\.zip|guides/[A-Za-z0-9_.-]+|schema/[A-Za-z0-9_.-]+)",info.filename):
                        raise InputError("Participant packet contains an unsupported member path")
                    if info.filename.endswith(".json") and info.file_size>MAX_METADATA:
                        raise InputError("Participant metadata member exceeds 64 MiB")
                    total+=info.file_size
                    if total>4*1024*1024*1024:raise InputError("Participant expanded packet exceeds 4 GiB")
                    target=temp/info.filename;target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
                    h=hashlib.sha256();count=0
                    with archive.open(info) as source,os.fdopen(os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600),"wb") as out:
                        while block:=source.read(65536):
                            count+=len(block)
                            if count>info.file_size:raise InputError("Participant member exceeds its declared bytes")
                            h.update(block);out.write(block)
                        out.flush();os.fsync(out.fileno())
                    if manifest["files"][info.filename]!={"bytes":count,"sha256":h.hexdigest()}:
                        raise InputError("Participant member differs from its complete original identity")
            p=load_json((temp/"participant.json").read_bytes());history=load_json((temp/"history.json").read_bytes())
            requests=load_json((temp/"requests.json").read_bytes());assets=load_json((temp/"evidence.json").read_bytes())
            if not isinstance(p,dict) or p.get("schema")!=SCHEMA or p.get("state")!="RELEASED" or not isinstance(history,list) or not history or history[-1]!=p:
                raise InputError("Participant history does not end at its selected release")
            checked_id(p["id"])
            if [x.get("revision")for x in history]!=list(range(1,p["revision"]+1)) or any(x.get("id")!=p["id"] or x.get("schema")!=SCHEMA for x in history):
                raise InputError("Participant revision history is incomplete")
            if manifest.get("project")!=p["id"] or manifest.get("revision")!=p["revision"] or manifest.get("candidateSource")!=p["candidateSource"] or manifest.get("release")!=p["release"]["id"]:
                raise InputError("Participant selection differs from its complete manifest")
            if digest((temp/"publisher-release.xml").read_bytes())!=p["candidateSource"]:
                raise InputError("Publisher release XML differs from its selected source")
            if not isinstance(requests,list) or len(requests)!=len(history):
                raise InputError("Participant request history is incomplete")
            required_sources,required_portfolios=self._verify_delivery(p,history,requests,assets,temp,manifest)
            for sid in required_sources:
                source=temp/"sources"/(checked_id(sid)+".xml")
                if not source.is_file() or file_digest(source,MAX_EDIT_SOURCE)!=sid:
                    raise InputError("A full original publisher edition is absent")
                with source.open("rb")as stream:self.ws.add_source(stream,"Received participant edition",sid+".xml")
            for aid,item in assets.items():
                source=temp/"evidence"/(checked_id(aid)+".bin")
                if not source.is_file() or file_digest(source,MAX_ASSET)!=aid or source.stat().st_size!=item["bytes"]:
                    raise InputError("An original feedback or evidence file is absent")
                self._asset(source.read_bytes(),item["name"],item["media"],item["role"])
            for member in sorted(manifest["files"]):
                if member.startswith("portfolios/"):self.ws.receive_portfolio(temp/member)
            if validate_source(self._source_bytes(p["candidateSource"]))["state"]!="VALID":
                raise InputError("The received release fails the original IATI schema")
            for index,request in enumerate(requests):
                if request.get("project")!=p["id"] or request.get("revision")!=index+1 or digest(request["input"].encode())!=request.get("input_sha"):
                    raise InputError("Participant request identity or order differs")
                raw=load_json(request["input"])
                if raw.get("requestId")!=request["id"] or history[index]["lastAction"]["requestId"]!=request["id"]:
                    raise InputError("Participant action history differs from its source request")
            with self.ws.db:
                for row in history:
                    old=self.ws.db.execute("SELECT body FROM iati_publishing_projects WHERE id=? AND revision=?",(p["id"],row["revision"])).fetchone()
                    body=json_bytes(row).decode()
                    if old and old["body"]!=body:raise InputError("A received participant revision conflicts with retained work")
                    if not old:self.ws.db.execute("INSERT INTO iati_publishing_projects VALUES(?,?,?)",(p["id"],row["revision"],body))
                for request in requests:
                    old=self.ws.db.execute("SELECT * FROM iati_publishing_requests WHERE id=?",(request["id"],)).fetchone()
                    if old and dict(old)!=request:raise InputError("A received participant request conflicts with retained work")
                    if not old:self.ws.db.execute("INSERT INTO iati_publishing_requests VALUES(?,?,?,?,?)",
                        tuple(request[k]for k in ("id","input_sha","project","revision","input")))
            return {"schema":"stellar-forge.iati-participant-receiving.v1","state":"COMPLETE",
                "project":self.project(p["id"],p["revision"]),"revisions":len(history),
                "sources":len(required_sources),"evidenceFiles":len(assets),
                "packet":{"bytes":path.stat().st_size,"sha256":file_digest(path,4*1024*1024*1024)}}

class _TransitionVerification(IatiPublishing):
    """Derive received revisions through the same live actions without writing state.

    Original source files and native finance request hashes supply all external
    results. Recorded times are replayed as observations; the entire resulting
    revision must equal the selected immutable row. This class never runs a
    publisher API, a dataset build, or a new application operation.
    """
    def __init__(self,history,requests,originals,assets,directory):
        self.history_rows=history;self.request_rows=requests
        self.originals=originals;self.asset_records=assets;self.directory=directory
        self.previous=None;self.expected=None;self.times=[];self.validation_cache={}
        self.portfolio_cache={}
        self.ws=SimpleNamespace(mutex=RLock(),add_source=self._observed_source,
            save_portfolio=self._observed_portfolio,compare_portfolio=self._observed_comparison)

    def project(self,ident,revision=None):
        if self.previous is None or ident!=self.previous["id"] or revision not in (None,self.previous["revision"]):
            raise InputError("A received action selects a different original participant revision")
        return copy.deepcopy(self.previous)

    def methodology(self):
        return copy.deepcopy(self.expected["methodology"])

    def _request(self,raw,allowed,creating=False):
        key,who=request_identity(raw,allowed,creating)
        if creating:
            if self.previous is not None:raise InputError("A participant creation appears after its first revision")
            return key,who,None,False
        if self.previous is None or raw.get("id")!=self.previous["id"] or type(raw.get("expectedRevision"))is not int or raw["expectedRevision"]!=self.previous["revision"]:
            raise InputError("A received action does not select its exact preceding revision")
        return key,who,copy.deepcopy(self.previous),False

    def _source_bytes(self,source_id):
        checked_id(source_id)
        if source_id not in self.originals:
            raise InputError("A received action selects an unretained publisher source")
        return self.originals[source_id].raw

    def _observed_source(self,stream,label,name):
        raw=stream.read(MAX_EDIT_SOURCE+1);sid=digest(raw)
        if sid not in self.originals or self.originals[sid].raw!=raw:
            raise InputError("A correction request does not reproduce its complete saved candidate XML")
        return {"id":sid}

    def _asset(self,raw,name,media,role):
        if not isinstance(raw,bytes) or len(raw)>MAX_ASSET:
            raise InputError("The original complete participant file is outside capacity")
        aid=digest(raw);record=self.asset_records.get(aid)
        if not isinstance(record,dict) or record.get("id")!=aid or record.get("sha256")!=aid or record.get("bytes")!=len(raw):
            raise InputError("A received action's file bytes differ from its complete evidence")
        # Content-addressed asset metadata uses the original pool's first writer,
        # including an already-retained asset reused by another participant work.
        if (self.directory/"evidence"/(aid+".bin")).read_bytes()!=raw:
            raise InputError("A received action does not contain its exact original file")
        return {key:copy.deepcopy(record[key]) for key in ("id","sha256","bytes","name","media","role")}

    def _validation(self,raw):
        sid=digest(raw)
        selected=self.expected["baselineValidation"] if self.previous is None else self.expected["candidateValidation"]
        if sid not in self.validation_cache:
            self.validation_cache[sid]=validate_source(raw)
        actual=self.validation_cache[sid]
        stable=lambda value:{key:item for key,item in value.items()if key!="engine"}
        if json_bytes(stable(actual))!=json_bytes(stable(selected)):
            raise InputError("A received action's complete XSD result does not reconstruct from its source")
        return copy.deepcopy(selected)

    def _now(self):
        if not self.times:raise InputError("A received action's observation sequence is incomplete")
        value=self.times.pop(0)
        if type(value)not in (int,float) or not math.isfinite(value) or value<0:
            raise InputError("A received participant time is invalid")
        return value

    def _save(self,request,who,previous,value,action):
        result=revision_record(request,who,previous,value,action,self._now())
        if result!=self.expected or self.times:
            raise InputError("A received participant revision is not the result of its complete original "+action+" request")
        return result

    def _portfolio(self):
        finance=self.expected.get("finance")
        if not isinstance(finance,dict):raise InputError("A finance action omits its complete native result")
        fid=checked_id(finance["portfolioId"])
        if fid not in self.portfolio_cache:
            with zipfile.ZipFile(self.directory/"portfolios"/(fid+".zip"))as archive:
                selected={}
                for name in ("portfolio-history.json","requests.json","comparisons.json"):
                    if archive.getinfo(name).file_size>MAX_METADATA:
                        raise InputError("Native finance metadata exceeds its original capacity")
                    selected[name]=load_json(archive.read(name))
            self.portfolio_cache[fid]=selected
        return fid,finance,self.portfolio_cache[fid]

    def _observed_portfolio(self,raw):
        fid,finance,saved=self._portfolio()
        matches=[row for row in saved["requests.json"]if row.get("id")==raw.get("requestId")]
        if len(matches)!=1 or matches[0].get("request_sha")!=digest(json_bytes(raw)) or matches[0].get("portfolio")!=fid:
            raise InputError("A participant finance action differs from the complete native request")
        revision=matches[0].get("revision")
        if type(revision)is not int or revision<1 or revision>len(saved["portfolio-history.json"]):
            raise InputError("A native finance request has no exact retained result")
        result=saved["portfolio-history.json"][revision-1]
        if result.get("id")!=fid or result.get("revision")!=revision:
            raise InputError("Native finance request and saved result differ")
        return copy.deepcopy(result)

    def _observed_comparison(self,raw):
        fid,finance,saved=self._portfolio()
        if raw!={"id":fid,"beforeRevision":finance["beforeRevision"],"afterRevision":finance["candidateRevision"]}:
            raise InputError("The participant's original native comparison selection differs")
        matches=[row for row in saved["comparisons.json"]if row.get("id")==finance["comparisonId"]]
        if len(matches)!=1 or matches[0].get("portfolio")!=fid or matches[0].get("beforeRevision")!=raw["beforeRevision"] or matches[0].get("afterRevision")!=raw["afterRevision"]:
            raise InputError("The exact original native finance comparison is absent")
        return copy.deepcopy(matches[0])

    def verify(self):
        functions={"create":self.create,"feedback":self.import_feedback,"evidence":self.evidence,
            "finding-decision":self.triage,"correction":self.correct,"publisher-edition":self.replace_candidate,
            "finance-comparison":self.finance,"review":self.review,"release":self.release}
        for row,request in zip(self.history_rows,self.request_rows):
            self.expected=row
            kind=row["lastAction"].get("kind")
            if kind not in functions:raise InputError("Unknown original participant action in received history")
            stamps=[]
            try:
                if kind=="evidence":stamps.append(row["evidence"][-1]["retainedAt"])
                elif kind=="finding-decision":
                    raw=load_json(request["input"])
                    matches=[x for x in row["feedback"]if x["id"]==raw.get("findingId")]
                    if len(matches)!=1:raise InputError("A finding action has no exact saved finding")
                    stamps.append(matches[0]["decidedAt"])
                elif kind in {"correction","publisher-edition"}:stamps.append(row["corrections"][-1]["at"])
                elif kind=="finance-comparison":stamps.append(row["finance"]["comparedAt"])
                elif kind=="review":stamps.append(row["review"]["at"])
                elif kind=="release":stamps.append(row["release"]["releasedAt"])
                stamps.append(row["updated"])
                self.times=stamps
                result=functions[kind](load_json(request["input"]))
            except (KeyError,IndexError,TypeError)as error:
                raise InputError("A received participant action omits its complete original inputs or result")from error
            if result!=row or self.times:
                raise InputError("The received participant action did not reproduce its saved revision")
            self.previous=copy.deepcopy(row)
        return True
