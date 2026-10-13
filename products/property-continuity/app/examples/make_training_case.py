"""Build the labelled training case for the actual property-continuity application.

Every business record and scenario time is authored training data. The native
receiving programme runs the real application, store, exports and browser.
"""
import argparse,copy,json,sys,uuid
from datetime import datetime,timedelta,timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from bluewave import domain
from bluewave.common import atomic_file,canonical,digest,loads,read_regular,sha
from bluewave.exchange import source_inventory

FAMILIES=("PROPERTY","RENTAL_SPACE","LEASE","PROJECT","DOCUMENT","FINANCE","SPATIAL")
ROLE_FIELDS={
 "PROPERTY":{"identity":"id","parent":"parent"},
 "RENTAL_SPACE":{"identity":"id","property":"property"},
 "LEASE":{"identity":"id","rentalSpace":"space","leaseStatus":"status","effectiveStart":"start","effectiveEnd":"end"},
 "PROJECT":{"projectId":"id","property":"property"},
 "DOCUMENT":{"documentId":"id","documentVersion":"version","property":"property","documentHash":"hash","documentBytes":"bytes"},
 "FINANCE":{"identity":"id","counterparty":"counterparty","currency":"currency","amount":"amount"},
 "SPATIAL":{"identity":"id","crs":"crs","units":"units"},
}
NUMBER_A="1.0000000000000000000000000000000001"
NUMBER_B="1.0000000000000000000000000000000002"
def iso(day,hour,minute=0):
    return f"2026-01-{day:02d}T{hour:02d}:{minute:02d}:00+00:00"

class TrainingCase:
    def __init__(self,args):
        self.args=args;self.root=Path(args.directory).resolve()
        self.files_root=self.root/"files";self.files_root.mkdir(parents=True,exist_ok=True)
        self.namespace=uuid.UUID(args.operation_id);self.blobs={};self.files={}
        self.commands=[];self.receiving=[]
        self.actor={"id":args.actor_id,"name":"TRAINING / "+args.actor_name}
        self.clock=datetime.fromisoformat(iso(4,8))
        self.workspace_id=self.id("workspace")
        self.state=domain.new_state(self.workspace_id,"TRAINING — Property continuity software exercise",iso(1,0))
        self.evidence=self.file("training-scenario-evidence.txt",(
            "TRAINING CASE — authored software exercise.\n"
            "All property, lease, document, finance and spatial rows are fictional.\n"
            "Scenario times and reviewed load/decision observations exercise the local data model.\n"
            "The application, command store, reconciliation, portable receiving and browser are real.\n"
            "The fixture compiler is the writer of these local source and target-return files.\n"
            "This file records the training purpose and expected transitions; programme outputs record execution.\n"
        ).encode(),"text/plain")
        self.documents=[]
        for version in (1,2):
            self.documents.append(self.file(f"training-document-v{version}.txt",
                f"TRAINING CONTROLLED DOCUMENT\nFictional rental-space schedule, version {version}.\n".encode(),"text/plain"))
        self.mappings={}
    def id(self,label):
        return str(uuid.uuid5(self.namespace,"training/"+label))
    def file(self,path,raw,media="application/json"):
        destination=self.files_root/path;destination.parent.mkdir(parents=True,exist_ok=True)
        atomic_file(destination,raw,immutable=True)
        descriptor={"sha256":sha(raw),"bytes":len(raw),"mediaType":media,"name":Path(path).name}
        self.files[path]={"path":path,"bytes":len(raw),"sha256":descriptor["sha256"]}
        self.blobs[descriptor["sha256"]]=raw
        return descriptor
    def json_file(self,path,value):
        raw=json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":"))
        raw=raw.replace('"__TRAINING_NUMBER_A__"',NUMBER_A).replace('"__TRAINING_NUMBER_B__"',NUMBER_B)
        return self.file(path,raw.encode("utf-8"))
    def tick(self,seconds=1):
        self.clock+=timedelta(seconds=seconds);return self.clock.isoformat()
    def command(self,kind,body,label,receiving=False):
        destination=self.receiving if receiving else self.commands
        revision=len(self.commands)+len(self.receiving)
        envelope={"requestId":self.id("request/"+label),"kind":kind,"actor":copy.deepcopy(self.actor),"at":self.tick(),"body":body}
        next_state,outcome=domain.apply(self.state,envelope,self.blobs.__getitem__)
        self.state=next_state
        destination.append({"label":"TRAINING — "+label,"expectedRevision":revision,"command":envelope})
        return outcome
    def rows(self,family,stage,target=False):
        if family=="PROPERTY":
            return [
                {"id":"TRAINING-HOLDING","parent":None,"name":"Training holding",
                 "precision":"__TRAINING_NUMBER_B__"if target and stage==1 else"__TRAINING_NUMBER_A__"},
                {"id":"TRAINING-BUILDING","parent":"TRAINING-HOLDING","name":"Training building","precision":"__TRAINING_NUMBER_A__"}]
        if family=="RENTAL_SPACE":
            return [{"id":"TRAINING-SPACE","property":"TRAINING-BUILDING","name":"Training rental space"}]
        if family=="LEASE":
            rows=[{"id":"TRAINING-LEASE-1","space":"TRAINING-SPACE","status":"ACTIVE"if stage==1 else"TERMINATED",
                   "start":"2025-01-01T00:00:00+00:00","end":None if stage==1 else iso(2,0)}]
            if stage>1:rows.append({"id":"TRAINING-LEASE-2","space":"TRAINING-SPACE","status":"LIVE","start":iso(2,0),"end":None})
            return rows
        if family=="PROJECT":
            return [{"id":"TRAINING-KPN-001","property":"TRAINING-BUILDING","name":"Training capital project"}]
        if family=="DOCUMENT":
            return [{"id":"TRAINING-DOCUMENT","version":str(n+1),"property":"TRAINING-BUILDING",
                     "hash":d["sha256"],"bytes":str(d["bytes"])}
                    for n,d in enumerate(self.documents[:1 if stage==1 else 2])]
        if family=="FINANCE":
            return [{"id":"TRAINING-CHARGE","counterparty":"TRAINING-PARTY","currency":"EUR",
                     "amount":"1200.00"if stage==1 else"1250.00","status":"TRAINING_LOCAL_RETURN"}]
        return [{"id":"TRAINING-SPATIAL","crs":"TRAINING_LOCAL_METRE_GRID","units":"metre",
                 "x":"__TRAINING_NUMBER_A__","y":"__TRAINING_NUMBER_A__"}]
    def platforms(self,family):
        return ("CENTROS","SALESFORCE")if family=="FINANCE"else(
            ("ARCGIS","SALESFORCE")if family=="SPATIAL"else(
            ("LEGACY","DOCUSIGN_CLM")if family=="DOCUMENT"else("LEGACY","SALESFORCE")))
    def mapping(self,family):
        source,target=self.platforms(family);fields=[]
        for name in self.rows(family,1)[0]:
            typ=("DECIMAL"if name in("amount","bytes")else"DATETIME"if name in("start","end")else
                 "EXACT"if name in("parent","precision","x","y")else"TEXT")
            fields.append({"id":name,"label":"Training "+name,"source":"/"+name,"target":"/"+name,
                           "type":typ,"required":True,"allowNull":name in("parent","end")})
        relation="rentalSpace"if family=="LEASE"else"property"if family in("RENTAL_SPACE","PROJECT","DOCUMENT")else None
        references={}
        if relation:
            referenced_family="RENTAL_SPACE"if relation=="rentalSpace"else"PROPERTY"
            references[relation]={"sourcePlatform":"LEGACY","targetPlatform":"SALESFORCE",
                                  "identityNamespace":"training-"+referenced_family.lower()}
        key=["/id","/version"]if family=="DOCUMENT"else["/id"]
        body={"id":self.id("mapping/"+family),"previousId":None,"label":"TRAINING "+family+" mapping",
              "family":family,"sourcePlatform":source,"targetPlatform":target,"sourceKeys":key,"targetKeys":key,
              "fields":fields,"roles":ROLE_FIELDS[family],"identityNamespace":"training-"+family.lower(),
              "references":references,"activeStates":["LIVE","ACTIVE"],"endInclusive":False,
              "note":"TRAINING: reviewed comparison contract for authored fixture rows."}
        self.command("mapping.save",body,"mapping/"+family)
        self.command("mapping.review",{"id":self.id("review/"+family),"mappingId":body["id"],"decision":"APPROVED",
             "note":"TRAINING: review this declared local comparison, including numeric token semantics.",
             "evidence":[self.evidence]},"mapping-review/"+family)
        self.mappings[family]=body["id"]
    def source(self,family,stage,target,day,load_id):
        role="TARGET"if target else"SOURCE";source_platform,target_platform=self.platforms(family)
        rows=self.rows(family,stage,target);path=f"stage-{stage}/{family.lower()}-{role.lower()}.json"
        descriptor=self.json_file(path,rows);item_id=self.id(f"source/{stage}/{family}/{role}")
        body={"id":item_id,"label":f"TRAINING stage {stage} {family} {role}","role":role,
              "platform":target_platform if target else source_platform,"family":family,"format":"JSON",
              "blob":descriptor,"jsonPointer":"","csv":{"delimiter":",","nullToken":None},
              "extraction":{"id":self.id(f"acquisition/{stage}/{family}/{role}"),"at":iso(day,9,5 if target else 1),
                  "cutoff":iso(day,9),"mode":"FULL","scope":"TRAINING complete "+family+" population",
                  "complete":True,"expectedRows":len(rows),
                  "method":"Authored training target-return fixture"if target else"Authored training source fixture",
                  "reference":"TRAINING fixture compiler / "+path,"independent":bool(target),
                  "loadOperationId":load_id if target else None},
              "note":"TRAINING scenario metadata and times; retain the actual authored file bytes."}
        self.command("source.import",body,f"source/{stage}/{family}/{role}")
        return item_id,descriptor
    def stage(self,stage,day,previous_id):
        load_id=self.id(f"local-training-load/{stage}");pairs=[];inputs=[]
        for family in FAMILIES:
            source_id,descriptor=self.source(family,stage,False,day,load_id)
            target_id,_=self.source(family,stage,True,day,load_id)
            pairs.append({"mappingId":self.mappings[family],"sourceId":source_id,"targetId":target_id})
            inputs.append({"family":family,"source":descriptor})
        load_input=self.json_file(f"stage-{stage}/training-load-input.json",
            {"purpose":"TRAINING","writer":"Local authored fixture compiler","stage":stage,"sources":inputs})
        body={"id":self.id(f"reconciliation/{stage}"),"label":f"TRAINING complete stage {stage}",
              "stage":"CUTOVER"if stage==3 else"REHEARSAL_"+str(stage),"cutoff":iso(day,9),
              "previousId":previous_id,"pairs":pairs,
              "load":{"operationId":load_id,"startedAt":iso(day,9,3),"completedAt":iso(day,9,4),
                  "writer":"TRAINING local fixture compiler","reference":f"TRAINING authored load scenario stage {stage}",
                  "inputSha256":load_input["sha256"],"outcome":"SUCCESS","evidence":[load_input,self.evidence]},
              "note":"TRAINING: exercise the exact application on complete authored populations."}
        self.command("reconciliation.create",body,f"reconciliation/{stage}")
        report=domain.report(self.state,body["id"],self.blobs.__getitem__)
        if stage==1:
            expected=[x for x in report["findings"]if x["code"]=="FIELD_DIFFERENCE"]
            if len(expected)!=1 or len(report["findings"])!=1:
                raise RuntimeError("Training precision case must produce exactly its one intentional field difference.")
            self.command("finding.decide",{"id":self.id("precision-review"),"reconciliationId":body["id"],
                "findingId":expected[0]["id"],"disposition":"ACCEPT_EXCEPTION",
                "reason":"TRAINING: retain the intentional final-digit difference for this first rehearsal; the later authored return corrects it.",
                "evidence":[self.evidence]},"precision-review")
        elif report["findings"]:
            raise RuntimeError("Corrected training stages must reconcile the complete authored populations.")
        if stage<3:
            rehearsal_id=self.id(f"rehearsal/{stage}")
            self.command("rehearsal.record",{"id":rehearsal_id,"number":stage,"reconciliationId":body["id"],
                "previousId":self.id("rehearsal/1")if stage==2 else None,"decision":"ACCEPTED",
                "note":"TRAINING: save the actual software comparison of these authored files.",
                "evidence":[self.evidence]},f"rehearsal/{stage}")
        return body["id"]
    def build(self):
        for family in FAMILIES:self.mapping(family)
        first=self.stage(1,1,None)
        self.clock=datetime.fromisoformat(iso(4,10))
        second=self.stage(2,2,first)
        self.clock=datetime.fromisoformat(iso(4,11))
        plan_id=self.id("cutover-plan")
        self.command("cutover.plan",{"id":plan_id,"rehearsalIds":[self.id("rehearsal/1"),self.id("rehearsal/2")],
            "cutoff":iso(5,9),"scope":"TRAINING: complete seven-family local programme",
            "authority":"TRAINING operator for this software exercise","changeWindowStart":iso(5,9),"changeWindowEnd":iso(5,11),
            "deltaPolicy":"TRAINING: final complete fixture populations retain the later lease, charge and document-version changes.",
            "rollbackPlan":"TRAINING: preserve the original workspace; receive exports into separate directories and retain every earlier edition.",
            "recoveryEvidence":[self.evidence],"note":"TRAINING authored cutover scenario."},"cutover-plan")
        self.command("cutover.decide",{"id":self.id("cutover-authorization"),"planId":plan_id,"decision":"AUTHORIZED",
            "reason":"TRAINING: run the local application receiving exercise.","evidence":[self.evidence]},"cutover-authorization")
        self.clock=datetime.fromisoformat(iso(5,10))
        final=self.stage(3,5,second)
        close_id=self.id("cutover-close")
        self.command("cutover.close",{"id":close_id,"planId":plan_id,"reconciliationId":final,"decision":"ACCEPTED",
            "deltaEvidence":[self.evidence],"recoveryEvidence":[self.evidence],
            "note":"TRAINING: complete local fixture comparison.","reason":"TRAINING: every selected final authored row matches.",
            "loadObservation":None},"cutover-close")
        received=self.tick();reopened=self.tick()
        self.command("handover.record",{"id":self.id("handover"),"cutoverId":close_id,
            "recipient":"TRAINING receiving operator","receivedAt":received,"reopenedAt":reopened,
            "correctionRef":"TRAINING scenario; actual native receiving outcomes are produced by receiving_program.",
            "evidence":[self.evidence],"note":"TRAINING: exercise the handover record fields and temporal ordering."},"handover")
        original_state=copy.deepcopy(self.state)
        self.command("mapping.review",{"id":self.id("received-review"),"mappingId":self.mappings["PROPERTY"],
            "decision":"APPROVED","note":"TRAINING: independent received-branch follow-up review.",
            "evidence":[self.evidence]},"received-follow-up",receiving=True)
        source_root=Path(__file__).resolve().parents[1];selection=loads(read_regular(source_root/"source-selection.json"))
        source_inventory(source_root,selection)
        input_value={"schema":"bluewave.commissioning-programme.v1","operationId":str(self.namespace),
            "sourceSha256":selection["sha256"],"filesRoot":str(self.files_root),
            "files":[self.files[k]for k in sorted(self.files)],
            "workspace":{"directory":str(self.root/"original-workspace"),"mode":"create","id":self.workspace_id,
                "title":original_state["title"],"createdAt":original_state["createdAt"],"revision":0,"sha256":None},
            "commands":self.commands,"receiving":{"directory":str(self.root/"received-workspace"),"commands":self.receiving},
            "browser":{"node":str(Path(self.args.node).resolve()),"playwrightModule":str(Path(self.args.playwright_module).resolve()),
                "executablePath":str(Path(self.args.chromium).resolve()),"actor":self.actor,"timeoutSeconds":600}}
        input_path=self.root/"training-input.json";atomic_file(input_path,canonical(input_value),immutable=True)
        preview={"purpose":"TRAINING SOFTWARE EXERCISE","sourceSha256":selection["sha256"],
            "operationId":str(self.namespace),"files":len(self.files),"originalCommands":len(self.commands),
            "receivingCommands":len(self.receiving),"originalStateSha256":digest(original_state),
            "followingStateSha256":digest(self.state),"originalSummary":domain.view(original_state,self.blobs.__getitem__)["summary"],
            "scenario":"Authored historical scenario dates; no customer population or external platform operation is represented."}
        atomic_file(self.root/"training-preview.json",canonical(preview),immutable=True)
        return {"purpose":"TRAINING SOFTWARE EXERCISE","input":str(input_path),"operationDirectory":str(self.root/"operation"),
            "sourceRoot":str(source_root),"inputSha256":sha(canonical(input_value)),"preview":preview}

def main():
    parser=argparse.ArgumentParser(description="Prepare the complete labelled training case for the real Bluewave application.")
    parser.add_argument("--directory",required=True);parser.add_argument("--operation-id",required=True)
    parser.add_argument("--node",required=True);parser.add_argument("--playwright-module",required=True)
    parser.add_argument("--chromium",required=True);parser.add_argument("--actor-id",required=True);parser.add_argument("--actor-name",required=True)
    args=parser.parse_args()
    print(canonical(TrainingCase(args).build()).decode("utf-8"))
if __name__=="__main__":main()
