#!/usr/bin/env python3
"""Commission the real Windmill jobs, native approval, exports and receiving workspace."""
import argparse
import base64
import hashlib
import json
import pathlib
import time
import urllib.parse
import uuid
from datetime import datetime, timezone
from commission import HERE, FOLDER, SCRIPT, Api, api_for, read_json, write_json, now

def check(ok, message):
    if not ok:
        raise RuntimeError(message)
def sha(value):
    return hashlib.sha256(value).hexdigest()
class Journey:
    def __init__(self, args):
        self.private,self.config,self.api=api_for(args)
        self.root=self.private/"journey"
        self.root.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.prefix="/api/w/"+self.config["workspace"]
        self.timeout=args.timeout
        self.approve=args.approve_review
        self.jobs={}
        self.started=now()
    def job(self, job_id, missing=False):
        return self.api.call("GET",self.prefix+"/jobs_u/get/"+job_id,missing=missing)
    def submit(self, name, kind, path, arguments):
        receipt=self.root/"jobs"/(name+"-submission.json")
        if receipt.exists():
            request=read_json(receipt)
            check(request["path"]==path and request["kind"]==kind and request["arguments"]==arguments,"Continue the saved "+name+" submission with its original inputs.")
        else:
            request={"name":name,"kind":kind,"path":path,"arguments":arguments,"jobId":str(uuid.uuid4()),"preparedAt":now()}
            write_json(receipt,request)
        job_id=request["jobId"]
        existing=self.job(job_id,missing=True)
        if existing is None:
            endpoint=self.prefix+("/jobs/run/f/"if kind=="flow"else"/jobs/run/p/")+path+"?job_id="+job_id
            try:
                returned=self.api.call("POST",endpoint,arguments)
                check(returned==job_id,"Windmill assigned another job identity.")
            except Exception:
                if self.job(job_id,missing=True) is None:
                    raise
        self.jobs[name]=job_id
        return job_id
    def wait(self,name,job_id,approval=False):
        deadline=time.monotonic()+self.timeout
        decision=self.root/"jobs"/(name+"-approval-submitted.json")
        while True:
            job=self.job(job_id)
            if job["type"]=="CompletedJob":
                write_json(self.root/"jobs"/(name+"-job.json"),job)
                result=self.api.call("GET",self.prefix+"/jobs_u/completed/get_result/"+job_id)
                write_json(self.root/"jobs"/(name+"-result.json"),result)
                check(job.get("success") is True,"Native Windmill job failed: "+name+" / "+job_id+". Inspect its saved result and logs.")
                return result
            if approval:
                modules=job.get("flow_status",{}).get("modules",[])
                step=next((m for m in modules if m.get("id")=="approval"),None)
                if step and step.get("job"):
                    child=self.job(step["job"])
                    if child.get("type")=="CompletedJob" and child.get("success"):
                        value=self.api.call("GET",self.prefix+"/jobs_u/completed/get_result/"+step["job"])
                        if value.get("resume") and not decision.exists():
                            write_json(self.root/"jobs"/(name+"-approval-job.json"),child)
                            write_json(self.root/"jobs"/(name+"-approval-request.json"),value)
                            if self.approve:
                                # This submits a real event to the URL issued by Windmill for this precise suspended job.
                                response=self.api.resume(value["resume"],{})
                                write_json(decision,{"submittedAt":now(),"flowJobId":job_id,"approvalJobId":step["job"],"method":"native approval endpoint","response":response})
                                print(json.dumps({"phase":"APPROVAL_SUBMITTED","jobId":job_id}),flush=True)
                            else:
                                print(json.dumps({"phase":"AWAITING_OPERATOR_APPROVAL","jobId":job_id,
                                    "run":self.config["base"]+"/run/"+job_id+"?workspace="+self.config["workspace"]}),flush=True)
                                approval=False
            if time.monotonic()>=deadline:
                write_json(self.root/"jobs"/(name+"-current-job.json"),job)
                raise RuntimeError("The saved native job remains available: "+job_id+". Continue this same journey to collect it.")
            time.sleep(1)
    def call(self,name,action,target="source",arguments=None):
        args={"action":action,"target":target,"args":arguments or {}}
        return self.wait(name,self.submit(name,"script",SCRIPT,args))
    def flow(self,name,flow,args,approval=False):
        return self.wait(name,self.submit(name,"flow","f/"+FOLDER+"/"+flow,args),approval=approval)
    def files(self,delivery,directory):
        destination=self.root/directory
        destination.mkdir(parents=True,exist_ok=True)
        for file in delivery["files"]:
            content=base64.b64decode(file["body"],validate=True)
            check(len(content)==file["bytes"] and sha(content)==file["sha256"],"The native download changed: "+file["filename"])
            check(pathlib.PurePath(file["filename"]).name==file["filename"],"Use an export filename without directory traversal.")
            (destination/file["filename"]).write_bytes(content)
    def run(self):
        check((self.private/"deployment.json").exists(),"Deploy the complete scripts, flows and built app first.")
        initial=self.call("initial","overview")
        receiver_initial=self.call("receiver-initial","overview","receiver")
        check(not initial["captures"] and not initial["reviews"],"Use a fresh source installation for this complete commissioning journey.")
        check(not receiver_initial["captures"] and not receiver_initial["connections"],"Use a fresh receiving destination.")
        capture_args={"runKey":"windmill-native-initial","connectionId":"helsinki-public","servicesQuery":{"locale":"en"},
                      "requestsQuery":{"start_date":"2026-10-08T08:00:00Z","end_date":"2026-10-08T12:00:00Z","extensions":True}}
        capture=self.flow("capture","refresh",capture_args)
        capture_id=capture["requests"]["capture"]["id"]
        source=self.call("original-requests","capture",arguments={"captureId":capture_id})
        services=self.call("services","services",arguments={"connectionId":"helsinki-public"})
        check(len(source["items"])==3 and len(services["items"])==5,"The original Helsinki catalogue/request inventory differs.")
        check(sorted(row["serviceRequestId"]for row in source["items"])==["3553245","3553339","3553509"],"The original request identities changed.")
        retained=read_json(HERE/"fixtures"/"helsinki-retained-source.json")
        check(any(c["raw"]["sha256"]==source["raw"]["sha256"] and c["raw"]["bytes"]==source["raw"]["bytes"]for c in retained["captures"]),"The captured source differs from its original retained body.")
        review_args={"runKey":"windmill-native-review","captureId":capture_id,
            "selection":[{"serviceRequestId":row["serviceRequestId"],"sourceSha256":row["sourceSha256"],"priorReviewId":(row.get("review")or{}).get("requestId")}for row in source["items"]],
            "review":{"status":"assigned","assignee":"Operations desk","dueDate":"2026-10-16",
                      "note":"Review the original Helsinki feedback and prepare the operator handover."}}
        reviewed=self.flow("review","review_delivery",review_args,approval=True)
        check(len(reviewed["reviews"]["results"])==3,"The approval did not apply all three selected assignments.")
        self.files(reviewed["delivery"],"approved-delivery")
        again_args={**capture_args,"runKey":"windmill-native-repeat"}
        repeated=self.flow("capture-repeat","refresh",again_args)
        second_id=repeated["requests"]["capture"]["id"]
        comparison=self.call("comparison","diff",arguments={"before":capture_id,"after":second_id})
        check(len(comparison["unchanged"])==3 and not comparison["added"] and not comparison["changed"] and not comparison["missingFromCapture"],"Repeated original captures changed request content.")
        before_replay=self.call("before-replay","overview")
        replay=self.flow("capture-replay","refresh",again_args)
        check(replay["requests"]["capture"]["id"]==second_id and replay["services"]["capture"]["id"]==repeated["services"]["capture"]["id"],"Repeating the flow created duplicate source captures.")
        source_final=self.call("source-final","overview")
        check(source_final["revision"]==before_replay["revision"],"The source changed while replaying the same native flow.")
        delivery=self.call("final-delivery","export_pack",arguments={"captureId":second_id})
        self.files(delivery,"downloads")
        received=self.flow("receive","transfer",{"runKey":"windmill-native-receive","source":True,"bundle":None})
        reopened=received["reopen"]
        check(reopened["workspaceId"]==source_final["workspaceId"],"Receiving changed the original workspace identity.")
        check(reopened["captures"]==source_final["captures"] and reopened["reviews"]==source_final["reviews"],"Receiving changed captures or reviews.")
        check(reopened["requests"]["items"]==source_final["requests"]["items"],"Receiving changed original request rows.")
        receiving_delivery=self.call("received-delivery","export_pack","receiver",{"captureId":second_id})
        self.files(receiving_delivery,"received-downloads")
        original_files={file["filename"]:file for file in delivery["files"]}
        for file in receiving_delivery["files"]:
            if file["filename"].startswith("open311-workspace-"):
                continue
            original=original_files.get(file["filename"])
            check(original and original["sha256"]==file["sha256"] and original["bytes"]==file["bytes"],"Receiving changed "+file["filename"])
        source_bundle=json.loads(base64.b64decode(next(f["body"]for f in delivery["files"]if f["filename"].startswith("open311-workspace-"))))
        receiving_bundle=json.loads(base64.b64decode(next(f["body"]for f in receiving_delivery["files"]if f["filename"].startswith("open311-workspace-"))))
        received_ops={o["requestId"]:o for o in receiving_bundle["payload"]["operations"]}
        for operation in source_bundle["payload"]["operations"]:
            check(received_ops.get(operation["requestId"])==operation,"An original workspace operation changed during receiving.")
        summary={"schema":"tjlabs.windmill.open311.native-journey.v1","status":"PASSED","startedAt":self.started,"completedAt":now(),
                 "base":self.config["base"],"workspace":self.config["workspace"],"sourceWorkspaceId":source_final["workspaceId"],
                 "sourceRevision":source_final["revision"],"receivedRevision":reopened["revision"],
                 "services":len(services["items"]),"requests":len(source["items"]),"reviews":len(reopened["reviews"]),
                 "captures":len(reopened["captures"]),"unchangedRequests":len(comparison["unchanged"]),
                 "approval":{"flowJobId":self.jobs["review"],"decisionSaved":(self.root/"jobs/review-approval-submitted.json").exists()},
                 "jobs":self.jobs,"downloads":[{k:v for k,v in f.items()if k!="body"}for f in delivery["files"]]}
        write_json(self.root/"result.json",summary)
        print(json.dumps(summary),flush=True)
        return summary
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--private",type=pathlib.Path,default=HERE/".private")
    parser.add_argument("--approve-review",action="store_true",help="Submit the commissioning review through its actual native Windmill approval URL.")
    parser.add_argument("--timeout",type=int,default=900,help="Seconds to wait per existing native job before saving its current state.")
    args=parser.parse_args()
    journey=Journey(args)
    try:
        journey.run()
    except Exception as error:
        write_json(journey.root/"failure.json",{"status":"FAILED","at":now(),"error":str(error),"jobs":journey.jobs})
        raise
if __name__=="__main__":
    main()
