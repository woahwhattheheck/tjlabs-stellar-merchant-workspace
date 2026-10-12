"""MIT. Whole participant correction/release/independent receiving on the original IATI core.

The caller owns the admitted operation, selected source/runtime and complete input files.
This module does not publish externally, alter a payer account or create a native queue.
"""
from __future__ import annotations
import argparse
import base64
import copy
import csv
import fcntl
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import sys
import time
import uuid
import zipfile

SCHEMA="stellar-forge.iati-participant-core-receiving.v1"
SDK="stellar/scf-starforge-20261009/sf30-seller-sdk"

def encoded(value):
    return (json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2,allow_nan=False)+"\n").encode()
def sha(value):
    return hashlib.sha256(value).hexdigest()
def require(value,message):
    if not value:raise ValueError(message)
def read_json(path):
    try:return json.loads(Path(path).read_bytes())
    except FileNotFoundError:return None
def directory(value):
    path=Path(value)
    require(path.is_absolute()and path!=Path("/")and path.absolute()==path,"Use complete private directory paths")
    path.mkdir(mode=0o700,parents=True,exist_ok=True)
    st=path.lstat()
    require(stat.S_ISDIR(st.st_mode)and not path.is_symlink()and path.resolve()==path and
            st.st_uid==os.getuid()and not st.st_mode&0o077,"Retain the original owned private directory")
    return path
def identity(path,maximum=4*1024**3):
    path=Path(path)
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),"rb")as source:
        before=os.fstat(source.fileno())
        require(stat.S_ISREG(before.st_mode)and before.st_size<=maximum,"Use a complete regular file within its capacity")
        digest=hashlib.sha256();count=0
        for block in iter(lambda:source.read(65536),b""):digest.update(block);count+=len(block)
        after=os.fstat(source.fileno())
    require(count==before.st_size and all(getattr(before,k)==getattr(after,k)for k in
            ("st_dev","st_ino","st_size","st_mtime_ns","st_ctime_ns")),"Original file changed during read")
    return {"path":str(path),"bytes":count,"sha256":digest.hexdigest()}
def publish(path,value,immutable=False):
    path=Path(path);data=value if isinstance(value,bytes)else encoded(value)
    if path.exists()and immutable:
        require(path.read_bytes()==data,"A retained original receiving input differs")
        return
    temporary=path.parent/(".participant-receiving-"+uuid.uuid4().hex)
    with os.fdopen(os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),"wb")as stream:
        stream.write(data);stream.flush();os.fsync(stream.fileno())
    os.replace(temporary,path)
    fd=os.open(path.parent,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)

def materialize_original(config,out):
    """Accept a whole retained XML or a losslessly compressed original with its exact receipt."""
    selected=Path(config["publisherFile"])
    original=identity(selected,32*1024**2)
    receipt_path=Path(config["publisherReceipt"])
    receipt=read_json(receipt_path)
    require(isinstance(receipt,dict)and isinstance(receipt.get("bytes"),int)and
            isinstance(receipt.get("sha256"),str),"Retain the complete publisher acquisition receipt")
    if selected.name.endswith(".gz"):
        target=out/"original-publisher.xml"
        if not target.exists():
            temporary=out/"original-publisher.xml.incomplete"
            if temporary.exists():
                previous=identity(temporary,32*1024**2)
                attempts=directory(str(out/"source-attempts"))
                attempt=uuid.uuid4().hex
                complete=previous["bytes"]==receipt["bytes"]and previous["sha256"]==receipt["sha256"]
                retained=target if complete else attempts/("original-publisher-"+attempt+".partial")
                publish(attempts/(attempt+".json"),{"state":"COMPLETE_SOURCE_RECOVERED"if complete else "PARTIAL_SOURCE_RETAINED",
                    "originalTemporary":previous,"retainedAs":str(retained),"selectedGzip":original,
                    "expectedOriginal":{"bytes":receipt["bytes"],"sha256":receipt["sha256"]}},True)
                os.replace(temporary,retained)
                for folder in {out,attempts}:
                    fd=os.open(folder,os.O_RDONLY)
                    try:os.fsync(fd)
                    finally:os.close(fd)
            if not target.exists():
                with gzip.open(selected,"rb")as source,os.fdopen(os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),"wb")as destination:
                    count=0;digest=hashlib.sha256()
                    for block in iter(lambda:source.read(65536),b""):
                        count+=len(block);require(count<=32*1024**2,"Complete publisher exceeds the correction capacity")
                        digest.update(block);destination.write(block)
                    destination.flush();os.fsync(destination.fileno())
                require(count==receipt["bytes"]and digest.hexdigest()==receipt["sha256"],"Compressed source does not reconstruct the complete original")
                os.replace(temporary,target)
                fd=os.open(out,os.O_RDONLY)
                try:os.fsync(fd)
                finally:os.close(fd)
    else:target=selected
    observed=identity(target,32*1024**2)
    require(observed["bytes"]==receipt["bytes"]and observed["sha256"]==receipt["sha256"],"Selected publisher differs from its complete original receipt")
    publish(out/"publisher-receipt.json",receipt,True)
    publish(out/"publisher-source.json",{"selected":original,"original":observed,"receipt":identity(receipt_path)},True)
    return target,receipt,observed

def run(config):
    require(isinstance(config,dict),"Supply the complete receiving selection")
    required={"operationId","sourceRoot","workspaceDirectory","receivedDirectory","outputDirectory",
              "publisherFile","publisherReceipt","publisherRef","activityIds","cutoff","actor","reviewer",
              "feedbackFile","feedbackSha256","corrections","findingDecisions","scopeNote","correctionNote","reviewNote","releaseNote"}
    require(required<=set(config)and set(config)<=required|{"name","evidenceFiles"},"Use the complete original receiving input fields")
    operation=config["operationId"]
    require(isinstance(operation,str)and 1<=len(operation)<=90 and all(c.isalnum()or c in "._:-"for c in operation),
            "Retain one original receiving operation ID")
    require(isinstance(config["activityIds"],list)and 1<=len(config["activityIds"])<=100 and
            len(set(config["activityIds"]))==len(config["activityIds"]),"Select the agreed actual publisher cohort")
    require(isinstance(config["corrections"],list)and 1<=len(config["corrections"])<=1000,"Supply the publisher's explicit correction selections")
    require(isinstance(config["findingDecisions"],list)and config["findingDecisions"],"Supply the complete explicit original finding decisions")
    require(config["actor"].strip().casefold()!=config["reviewer"].strip().casefold(),"Use a different named release reviewer")
    source_root=Path(config["sourceRoot"])
    require(source_root.is_absolute()and source_root.resolve()==source_root,"Select the complete original installed source")
    out=directory(config["outputDirectory"])
    workspace=Path(config["workspaceDirectory"]);received=Path(config["receivedDirectory"])
    for p in (workspace,received):
        require(p.is_absolute()and p!=out and out not in p.parents and p not in out.parents,"Keep independent source, receiving and output directories")
    require(workspace!=received and workspace not in received.parents and received not in workspace.parents,"Independent receiving needs its own original workspace")
    lock=os.open(out/"core-receiving.lock",os.O_RDWR|os.O_CREAT,0o600)
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    try:
        requests=directory(str(out/"requests"));results=directory(str(out/"results"))
        critical=["publishing.py","publishing_xml.py","publishing_validation.py","publishing-methodology.json",
                  "publishing-schema-source.json","iati_workspace.py","iati_source.py","PUBLISHING.md","PUBLISHING_SOURCES.md"]
        modules=[{"name":name,**identity(source_root/SDK/"iati"/name,4*1024**2)}for name in critical]
        selection={"schema":SCHEMA,"configuration":config,"modules":modules}
        publish(out/"selection.json",selection,True)
        complete=read_json(out/"result.json")
        if complete:
            require(complete.get("state")=="COMPLETE"and complete.get("selectionSha256")==sha(encoded(selection)),"Original completed result selection differs")
            for file in complete["files"]:
                require(identity(file["path"])==file,"An original completed receiving file changed")
            return {**complete,"reused":True}
        source,receipt,source_identity=materialize_original(config,out)
        sys.path[:0]=[str(source_root/SDK/"iati"),str(source_root/SDK/"xml")]
        from iati_workspace import IatiWorkspace
        from publishing_xml import Publisher
        from publishing import csv_bytes
        def saved(name,producer):
            path=results/(name+".json")
            value=read_json(path)
            if value is not None:return value
            value=producer();publish(path,value,True);return value
        def action(name,method,previous,extra,who=None):
            path=requests/(name+".json")
            value=read_json(path)
            if value is None:
                value={"requestId":operation+":"+name,"actor":who or config["actor"],**extra}
                if previous is not None:value.update(id=previous["id"],expectedRevision=previous["revision"])
                publish(path,value,True)
            require(value["requestId"]==operation+":"+name and value["actor"]==(who or config["actor"]),
                    "Original action identity differs")
            # The source engine verifies the complete request hash and returns the original
            # revision on replay, including after a lost response or partial finance build.
            actual=method(copy.deepcopy(value))
            publish(results/(name+".json"),actual,True)
            return actual
        def initialize(path):
            if (path/"workspace.json").exists():return False
            require(not path.exists()or not any(path.iterdir()),"Reconcile the original uninitialised workspace before continuing")
            return True
        with IatiWorkspace(workspace,create=initialize(workspace))as ws:
            with source.open("rb")as stream:observed=ws.add_source(stream,"Original public publisher receiving source",source.name)
            require(observed["id"]==source_identity["sha256"],"Original IATI source intake changed its identity")
            p=action("create",ws.publishing.create,None,{"name":config.get("name","Participant publishing receiving"),
                "publisherRef":config["publisherRef"],"sourceId":observed["id"],"activityIds":config["activityIds"],
                "cutoff":config["cutoff"],"notes":config["scopeNote"]})
            baseline=copy.deepcopy(p)
            saved("baseline-fields",lambda:{ident:ws.publishing.fields(p["id"],ident,p["revision"])for ident in p["activityIds"]})
            feedback=Path(config["feedbackFile"]);feedback_identity=identity(feedback,16*1024**2)
            require(feedback_identity["sha256"]==config["feedbackSha256"],"Complete original feedback differs")
            p=action("feedback",ws.publishing.import_feedback,p,{"filename":feedback.name,"fileBase64":base64.b64encode(feedback.read_bytes()).decode()})
            evidence_ids=[]
            for index,selected in enumerate(config.get("evidenceFiles",[])):
                require(set(selected)=={"path","sha256","label","media","sourceUrl"},"Retain each complete original evidence selection")
                file=identity(selected["path"],16*1024**2);require(file["sha256"]==selected["sha256"],"Original evidence differs")
                p=action("evidence-"+str(index),ws.publishing.evidence,p,{"filename":Path(selected["path"]).name,
                    "fileBase64":base64.b64encode(Path(selected["path"]).read_bytes()).decode(),"media":selected["media"],
                    "label":selected["label"],"sourceUrl":selected["sourceUrl"]})
                evidence_ids.append(p["evidence"][-1]["id"])
            patches=saved("selected-corrections",lambda:select_corrections(ws,p,config["corrections"]))
            preview=saved("correction-preview",lambda:ws.publishing.preview(p["id"],patches,p["revision"]))
            require(preview["validation"]["state"]=="VALID","The actual full publisher candidate must pass the unchanged source XSD before release")
            p=action("correct",ws.publishing.correct,p,{"patches":patches,
                "expectedPreviewSha256":preview["previewSha256"],"note":config["correctionNote"]})
            corrected=copy.deepcopy(p)
            saved("corrected-fields",lambda:{ident:ws.publishing.fields(p["id"],ident,p["revision"])for ident in p["activityIds"]})
            # Reopening the baseline now must use its original XML, even after a later candidate.
            old=ws.publishing.activities(p["id"],0,200,baseline["revision"])
            current=ws.publishing.activities(p["id"],0,200,corrected["revision"])
            require(old["sourceId"]==baseline["candidateSource"]and current["sourceId"]==corrected["candidateSource"],
                    "A historical activity view selected the latest publisher")
            for ident,fields in read_json(results/"baseline-fields.json").items():
                require(ws.publishing.fields(p["id"],ident,baseline["revision"])==fields,"A historical field view changed")
            publish(results/"historical-activities.json",{"baseline":old,"candidate":current},True)
            decisions={}
            for decision in config["findingDecisions"]:
                require(isinstance(decision,dict)and set(decision)=={"findingId","status","owner","note","evidenceIndices"},
                        "Retain every complete original finding decision")
                require(decision["findingId"]not in decisions and decision["status"]in {"resolved","deferred"}and
                        isinstance(decision["owner"],str)and isinstance(decision["note"],str)and decision["note"].strip(),
                        "Select one explicit resolved or deferred decision and rationale per finding")
                indices=decision["evidenceIndices"]
                require(isinstance(indices,list)and all(type(i)is int and 0<=i<len(evidence_ids)for i in indices)and
                        len(set(indices))==len(indices),"Select exact original retained evidence indices")
                decisions[decision["findingId"]]=decision
            require(set(decisions)=={item["id"]for item in p["feedback"]},
                    "Explicit decisions must cover the complete original feedback, without extra findings")
            for index,item in enumerate(p["feedback"]):
                decision=decisions[item["id"]]
                p=action("finding-"+str(index),ws.publishing.triage,p,{"findingId":item["id"],"status":decision["status"],
                    "owner":decision["owner"],"note":decision["note"],
                    "evidenceIds":[evidence_ids[i]for i in decision["evidenceIndices"]]})
            p=action("finance",ws.publishing.finance,p,{})
            p=action("review",ws.publishing.review,p,{"decision":"accepted","note":config["reviewNote"]},config["reviewer"])
            p=action("release",ws.publishing.release,p,{"label":"Reviewed participant publisher edition","note":config["releaseNote"]})
            require(p["state"]=="RELEASED"and p["release"]["publicationState"]=="READY_FOR_PUBLISHER","The original release is not ready for its publisher")
            original_project=copy.deepcopy(p);original_history=ws.publishing.history(p["id"],p["revision"])
            packet=out/"IATI_Participant_Release.zip"
            if not packet.exists():ws.publishing.export(p["id"],packet,p["revision"])
            finance=p["finance"]
            report_before=ws.portfolio(finance["portfolioId"],finance["beforeRevision"])
            report_after=ws.portfolio(finance["portfolioId"],finance["candidateRevision"])
            publish(results/"native-finance.json",{"selection":finance,"baseline":report_before,"candidate":report_after},True)
            publish(results/"source-state.json",ws.state(),True)
            with zipfile.ZipFile(packet)as archive:
                require(json.loads(archive.read("participant.json"))==p,"A retained release ZIP belongs to another project revision")
                # Exact shared derived output is verified without changing original source/JSON.
                member=json.loads(archive.read("manifest.json"))
                require(archive.read("publisher-release.xml")==ws.publishing._source_bytes(p["candidateSource"]),
                        "The whole publisher release XML differs")
                publish(results/"release-manifest.json",member,True)
            packet_identity=identity(packet)
        # Complete original importer rederives all requests, XML corrections, XSD,
        # native finance and derived exports, then joins the independent workspace.
        with IatiWorkspace(received,create=initialize(received))as ws:
            imported=ws.publishing.receive(packet)
            again=ws.publishing.receive(packet)
            require(ws.publishing.project(original_project["id"],original_project["revision"])==original_project,
                    "Independent project receiving differs")
            require(ws.publishing.history(original_project["id"],original_project["revision"])==original_history,
                    "Independent immutable history differs")
            for revision,selected in ((baseline["revision"],baseline),(corrected["revision"],corrected)):
                page=ws.publishing.activities(original_project["id"],0,200,revision)
                require(page["sourceId"]==selected["candidateSource"],"Independent historical source selection differs")
            publish(results/"independent-receiving.json",{"first":imported,"replay":again,"state":ws.state()},True)
        with IatiWorkspace(received)as reopened:
            require(reopened.publishing.project(original_project["id"],original_project["revision"])==original_project,
                    "Closed-and-reopened receiving lost its original release")
            publish(results/"reopened-project.json",reopened.publishing.project(original_project["id"],original_project["revision"]),True)
        files=[identity(path)for folder in (requests,results)for path in sorted(folder.glob("*.json"))]
        files.extend([packet_identity,identity(out/"publisher-receipt.json"),identity(out/"publisher-source.json")])
        if (out/"source-attempts").exists():
            files.extend(identity(path)for path in sorted((out/"source-attempts").iterdir()))
        result={"schema":SCHEMA,"state":"COMPLETE","operationId":operation,"selectionSha256":sha(encoded(selection)),
                "source":source_identity,"project":original_project,"historyRevisions":len(original_history),
                "baselineRevision":baseline["revision"],"correctedRevision":corrected["revision"],
                "customerHandover":packet_identity,"workspaceDirectory":str(workspace),"receivedDirectory":str(received),
                "files":files,"completedAt":time.time()}
        publish(out/"result.json",result,True)
        return result
    finally:
        fcntl.flock(lock,fcntl.LOCK_UN);os.close(lock)

def select_corrections(ws,p,choices):
    output=[]
    for selected in choices:
        require(isinstance(selected,dict),"Supply each complete explicit correction selection")
        activity=selected.get("activityId")
        require(activity in p["activityIds"],"Select an activity in the agreed original cohort")
        fields=ws.publishing.fields(p["id"],activity,p["revision"])
        patch=copy.deepcopy(selected)
        if patch.get("kind")=="add-document":
            require("expectedSha256"not in patch or patch["expectedSha256"]==fields["activitySha256"],"The explicit original activity review hash differs")
            patch["expectedSha256"]=fields["activitySha256"]
        else:
            matches=[field for field in fields["fields"]if field["field"]==patch.get("field")and field["index"]==patch.get("index")]
            require(len(matches)==1,"Select one actual original publisher field")
            field=matches[0]
            require("expectedSha256"not in patch or patch["expectedSha256"]==field["sha256"],"The explicit original field review hash differs")
            patch["expectedSha256"]=field["sha256"]
            if patch.get("kind")=="narrative"and patch.get("narrativeIndex")is not None:
                narratives=[row for row in field["narratives"]if row["index"]==patch["narrativeIndex"]]
                require(len(narratives)==1,"Select one original narrative")
                require("expectedNarrativeSha256"not in patch or patch["expectedNarrativeSha256"]==narratives[0]["sha256"],"The explicit original narrative review hash differs")
                patch["expectedNarrativeSha256"]=narratives[0]["sha256"]
                patch["language"]=narratives[0]["language"]
        output.append(patch)
    return output

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",required=True)
    args=parser.parse_args()
    config=read_json(args.input)
    print(json.dumps(run(config),ensure_ascii=False,sort_keys=True,allow_nan=False),flush=True)
if __name__=="__main__":main()
