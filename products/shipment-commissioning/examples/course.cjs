'use strict';
const core=require('../runtime/shipment-review.cjs'),codec=require('../runtime/archive-codec.cjs');
function runCourse(){
let w=core.blank({id:"shipment-worked-20261015",title:"Two-shipment amendment and replay commissioning — authored example",created_at:"2026-10-15T00:40:00Z"}),commands=[],checks=[];
function command(kind,value){const c={id:"op-"+String(commands.length+1).padStart(3,"0"),kind,value,actor:"TJL worked-course operator",at:"2026-10-15T00:40:00Z",expected_revision:w.revision,expected_hash:core.hash(w)};w=core.apply(w,c);commands.push(c);return c}
function original(id,name,content,description){command("add_original",{id,name,media_type:"application/json",data:codec.base64Encode(codec.utf8Encode(content)),description,origin:"Authored commissioning fixture; fictional companies and shipment identifiers."})}
const input=[
{id:"booking-a",shipment:"SHIP-A",booking:"BOOK-A",container:"SHARED-CONTAINER-EXAMPLE",consignee:"Example Alpha",quantity:100},
{id:"booking-b",shipment:"SHIP-B",booking:"BOOK-B",container:"SHARED-CONTAINER-EXAMPLE",consignee:"Example Beta",quantity:20},
{id:"amend-a",shipment:"SHIP-A",booking:"BOOK-A",revision:2,quantity:90},
{id:"retry-amend-a",shipment:"SHIP-A",event_id:"amend-a",delivery_attempt:2,quantity:90},
{id:"late-original-a",shipment:"SHIP-A",event_id:"booking-a",revision:1,quantity:100},
{id:"operator-edit",shipment:"SHIP-A",field:"consignee",owner:"locked",value:"Example Alpha reviewed"}
];
input.forEach(x=>original(x.id,x.id+".json",JSON.stringify(x,null,2),"Authored input sequence record "+x.id));
const typed=(type,text)=>({type,text});
function expected(q){return {bindings:[{document:"DOC-A",shipment:"SHIP-A"},{document:"DOC-B",shipment:"SHIP-B"}],fields:[{shipment:"SHIP-A",field:"quantity",value:typed("number",q),owner:"proposed"},{shipment:"SHIP-A",field:"consignee",value:typed("string","Example Alpha reviewed"),owner:"locked"},{shipment:"SHIP-B",field:"reference_number",value:typed("number","9007199254740993"),owner:"human_edited"}],gates:[{shipment:"SHIP-A",gate:"invoice-ready",status:"blocked",missing:["po_number"]},{shipment:"SHIP-B",gate:"invoice-ready",status:"ready",missing:[]}]}}
const defs=[
["initial","Two distinct bookings sharing a weak container reference","Keep the two booking/document identities separate. Preserve a reviewed locked consignee and an exact large numeric reference.",["booking-a","booking-b","operator-edit"],"100"],
["amendment","Accepted quantity amendment","Observe revision2 of BOOK-A changing quantity from100 to90; retain the same shipment and protected fields.",["amend-a"],"90"],
["retry","Duplicate delivery of the same amendment","Deliver the same amend-a event again; the resulting state must still match the accepted amendment.",["retry-amend-a"],"90"],
["late","Late delivery of original booking","After revision2, deliver revision1 of BOOK-A. The selected approved state remains90; the older observation should not replace it.",["late-original-a"],"90"]
];
command("save_case",{id:"CASE-01",title:"Two separate shipments, amendment, retry and late original",scope:"Authored checkpoint reference v1; shipment/document identity exact; agreed fields only; invoice-ready is an illustrative operator label, not a compliance determination.",authored:true,reference_owner:"TJL authored reference",steps:defs.map(([id,title,scenario,ids,q])=>({id,title,scenario,input_refs:ids.map(original_id=>({original_id,locator:"Whole authored JSON record"})),expected:expected(q)}))});
command("review_case",{id:"CASE-01",expected_case_hash:core.caseBasis(w.cases[0]),status:"approved",reviewer:"TJL authored-case reviewer",note:"Reviewed fictional reference against the authored input sequence. No Parsela service or customer outputs used.",source_refs:[{original_id:"operator-edit",locator:"Locked consignee expectation"}]});
command("save_contract",{id:"canonical",title:"Worked interchange mapping",edition:"Authored canonical state arrays v1",notes:"Explicit example interchange schema; replace mapping with actual supplier output pointers at commissioning.",bindings:{list:"/documents",columns:{document:"/document",shipment:"/shipment"}},fields:{list:"/fields",columns:{shipment:"/shipment",field:"/field",value:"/value",owner:"/owner"}},gates:{list:"/gates",columns:{shipment:"/shipment",gate:"/gate",status:"/status",missing:"/missing"}}});
function output(q,bad,step){const result={documents:[{document:"DOC-A",shipment:"SHIP-A"},{document:"DOC-B",shipment:bad?"SHIP-A":"SHIP-B"}],fields:[{shipment:"SHIP-A",field:"quantity",value:"NUMBER_QUANTITY",owner:"proposed"},{shipment:"SHIP-A",field:"consignee",value:bad?"Example Alpha unreviewed":"Example Alpha reviewed",owner:bad?"proposed":"locked"},{shipment:"SHIP-B",field:"reference_number",value:"NUMBER_LARGE",owner:"human_edited"}],gates:[{shipment:"SHIP-A",gate:"invoice-ready",status:bad?"ready":"blocked",missing:bad?[]:["po_number"]},{shipment:"SHIP-B",gate:"invoice-ready",status:"ready",missing:[]}]};return JSON.stringify(result,null,2).replace('"NUMBER_QUANTITY"',bad&&step==="late"?"100":q).replace('"NUMBER_LARGE"',"9007199254740993")}
for(const method of["observed-A","observed-B"]){command("create_run",{id:method,case_id:"CASE-01",method,product_edition:"Authored output fixture "+method+"; no live product run",scope:"Four exact checkpoints; same document/field/gate scope. A contains deliberate defects; B contains corrected authored observations."});for(const [step,,,ids,q]of defs){const oid=method+"-"+step;original(oid,oid+".json",output(q,method==="observed-A",step),"Authored full observed-state fixture for "+method+" / "+step);command("add_capture",{id:"capture-"+oid,run_id:method,step_id:step,original_id:oid,contract_id:"canonical",observed_at:"2026-10-15T00:39:00Z",transport_note:step==="retry"?"Same event ID delivered twice; capture after second delivery.":step==="late"?"Capture after an older revision was delivered after revision2.":"Capture after the named ordered input checkpoint."})}}
const a=core.reportRun(w,"observed-A"),b=core.reportRun(w,"observed-B");
function assert(condition,name){if(!condition)throw Error(name);checks.push(name)}
assert(a.findings.filter(f=>f.code==="wrong_shipment_binding").length===4,"Same weak container never justifies reference identity merge");
assert(a.findings.filter(f=>f.code==="protected_field_changed").length===4,"Protected consignee differences remain material");
assert(a.findings.filter(f=>f.code==="readiness_observation_changed").length===4,"Incorrect readiness and missing-field set are reported");
assert(a.findings.some(f=>f.step_id==="late"&&f.code==="field_value_changed"),"Late original can expose overwritten amendment");
assert(b.complete&&b.findings.length===0,"Corrected four-checkpoint authored run matches exact reference");
assert(w.captures.some(c=>c.observations.fields.some(f=>f.value.text==="9007199254740993")),"Large numeric source literal is exact");
const good=w.runs.find(r=>r.id==="observed-B");command("review_run",{id:good.id,expected_run_hash:core.runBasis(w,good),status:"accepted",reviewer:"TJL authored-case reviewer",note:"All agreed authored checkpoint observations match. This acceptance concerns the example, not Parsela performance.",source_refs:[{original_id:"observed-B-late",locator:"Complete final state"}]});
const effort=(id,run,phase,start,end,seconds)=>command("record_effort",{id,run_id:run,phase,performer:"Authored timing participant",started_at:start,ended_at:end,active_seconds:seconds,comparable:true,note:"Authored illustrative timing only; replace with actual measurements for customer conclusions.",source_refs:[]});
effort("a-review","observed-A","review","2026-10-14T22:00:00Z","2026-10-14T22:20:00Z",1200);
effort("b-review","observed-B","review","2026-10-14T22:30:00Z","2026-10-14T22:46:00Z",960);
effort("a-handover","observed-A","handover","2026-10-14T23:00:00Z","2026-10-14T23:05:00Z",300);
assert(core.effortReport(w,"observed-A","observed-B").difference_seconds===null,"Different work-phase coverage suppresses savings");
effort("b-handover","observed-B","handover","2026-10-14T23:10:00Z","2026-10-14T23:15:00Z",300);
assert(core.effortReport(w,"observed-A","observed-B").difference_seconds===240,"Equal phases yield only the authored case-specific difference");
const retried=core.apply(w,commands[0]);assert(core.hash(retried)===core.hash(w),"Original request retry after later operations preserves current state");
let threw=false;try{core.apply(w,{...commands[0],value:{...commands[0].value,description:"Changed request"}})}catch{threw=true}assert(threw,"Changed request under same operation ID rejected");
const reopened=core.validate(JSON.parse(JSON.stringify(w)));assert(core.hash(reopened)===core.hash(w),"Full source and command journal reopen exactly");
const badWorkspace=JSON.parse(JSON.stringify(w));badWorkspace.runs[0].method="tampered";threw=false;try{core.validate(badWorkspace)}catch{threw=true}assert(threw,"Unrecorded imported workspace edit rejected by replay");
const last=w.cases[0];const edited=core.apply(w,{id:"peer-reference-edit",kind:"save_case",value:{...last,expected_case_hash:core.caseBasis(last),scope:last.scope+" Successor review pending."},actor:"TJL reviewer",at:"2026-10-15T00:41:00Z",expected_revision:w.revision,expected_hash:core.hash(w)});
assert(edited.cases[0].review===null&&edited.cases[0].history.length===1&&!core.reportRun(edited,"observed-B").current_reference,"Reference edits retain previous edition and expire approval while old run keeps frozen reference");
const exported=core.exportFiles(w);assert(Object.keys(exported).filter(k=>k.startsWith("originals/")&&k.endsWith(".base64")).length===w.originals.length,"Complete handover includes every retained original");
return {workspace:w,commands,checks,reports:{a,b,effort:core.effortReport(w,"observed-A","observed-B")},export_files:exported};
}
module.exports={runCourse};
