import { createMarineJobCore } from './marine-job-core.mjs';
import { createArchiveCodec } from './vendor/archive-codec.mjs';
function runMarineOperatingCourse(api){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error("Operating course: "+name);checks.push(name);},clone=x=>JSON.parse(JSON.stringify(x));
 const source=clone(api.sampleSources),baseSettings=clone(api.sampleSettings),at=hh=>"2026-10-20T"+hh+":00+13:00";
 let w=api.create({id:"marine-full-course",label:"Marine job, selected customer record and technician week"});
 const stages=[["original","12:25","Original logged time, selected customer record and approved week"],["correction","13:25","Corrected time and returned part retain original approvals"],["uncertain","14:20","Replacement installed; corrected handover and uncertain accounting"],["accounted-unpaid","14:55","Recorded accounting success with invoice still unpaid"],["current","16:00","Actual receipt/refund and supplied material cost arrived"]];
 const a={};
 for(const [id,hh,label]of stages){const settings={...baseSettings,asOf:at(hh)};w=api.receive(w,{id,label,receivedAt:at(hh),settings,notes:"Authored software operating example with explicit supplied records.",sources:source});a[id]=api.analyse(w,id);}
 const job=(stage,id)=>a[stage].bookings.find(r=>r.jobId===id),sub=(stage,id)=>a[stage].weekSubmissions.find(r=>r.key===id),handover=(stage,id)=>a[stage].handovers.find(r=>r.key===id),request=(stage,id)=>a[stage].accountingRequests.find(r=>r.key===id);
 assert(job("original","JOB-A").actualCostMinor==="38000"&&job("original","JOB-A").quotedMinor==="100000","Original current quote and independently supplied actual cost");
 assert(job("original","JOB-B").actualCostMinor===null&&job("original","JOB-B").knownCostMinor==="12000","Missing material cost retains known labour subtotal");
 assert(sub("original","SUBMISSION-A1").snapshotSeconds===10800&&!sub("original","SUBMISSION-A1").requiresNewSubmission,"Original three-hour week snapshot approved");
 assert(job("correction","JOB-A").actualCostMinor==="15500"&&a.correction.materialEntries.find(r=>r.key==="MAT-A2").current,"Correction and explicit returned-part version change current job only");
 assert(sub("correction","SUBMISSION-A1").snapshotSeconds===10800&&sub("correction","SUBMISSION-A1").requiresNewSubmission,"Previously approved week retains original duration after correction");
 assert(handover("correction","HANDOVER-ORIGINAL").supersededMemberIds.includes("TIME-A1"),"Original customer handover retains selected original version");
 assert(job("uncertain","JOB-A").actualCostMinor==="30500"&&job("uncertain","JOB-A").billableMinor==="55000"&&job("uncertain","JOB-A").quotedLessCostMinor==="69500","Corrected time and quantities reconcile independently at supplied cost and bill rates");
 assert(job("uncertain","JOB-C").actualCostMinor===null&&job("uncertain","JOB-C").runningEntries===1,"Open timer never accumulates invented duration or cost");
 assert(sub("uncertain","SUBMISSION-A2").snapshotSeconds===9000&&sub("uncertain","SUBMISSION-A2").decision==="approved"&&sub("uncertain","SUBMISSION-A2").openCurrentEntryIds.includes("TIME-C1"),"New approval binds corrected version and shows unfinished current week time");
 assert(request("uncertain","REQ-INVOICE").outcome==="unknown"&&job("uncertain","JOB-A").balanceMinor==="100000","Uncertain accounting request leaves actual invoice unpaid");
 assert(request("accounted-unpaid","REQ-INVOICE").outcome==="succeeded"&&job("accounted-unpaid","JOB-A").balanceMinor==="100000","Accounting success does not create an invented payment");
 assert(job("current","JOB-A").balanceMinor==="65000"&&job("current","JOB-C").unappliedCreditMinor==="15000"&&a.current.payments.find(r=>r.paymentId==="RECEIPT-1").availableCreditMinor==="5000","Actual receipt, partial settlement, deposit and refund reconcile");
 assert(handover("current","HANDOVER-ORIGINAL").transportStatus==="bounced"&&request("current","REQ-INVOICE").outcome==="succeeded","Late observation of older outcomes preserves later occurred outcomes");
 assert(handover("current","HANDOVER-CORRECTED").acknowledged&&handover("current","HANDOVER-CORRECTED").transportStatus==="delivered","Customer acknowledgement remains independent of later transport");
 const customerHTML=api.customerReport(w,"current","HANDOVER-CORRECTED"),selected=JSON.parse(customerHTML.match(/id='selected-record'>([\s\S]*?)<\/script>/)[1]);
 assert(selected.time[0].versionId==="TIME-A2"&&selected.media.length===1&&!customerHTML.includes("MEDIA-A-INTERNAL")&&!customerHTML.includes("cost_rate")&&!customerHTML.includes("authorization")&&!customerHTML.includes("originalSources"),"Customer export contains exact selected customer fields only");
 for(const [type,table]of [["booking","bookings"],...api.reviewTypes.slice(5).map((x,i)=>[x,api.analysisTables[i]])]){const aNow=api.analyse(w,"current"),subject=aNow[table][0];if(!subject)continue;w=api.review(w,{id:"REVIEW-"+type,editionId:"current",subjectType:type,subjectId:subject.key,disposition:"investigate",reviewer:"Authored operator",reason:"Compare original "+type+" record with the current working edition.",evidence:"Authored course review, retained separately from operating source.",previousReviewId:null});}
 const reopened=api.reopen(JSON.parse(JSON.stringify(w)));
 assert(api.canonical(reopened)===api.canonical(w)&&reopened.editions[0].sources.vessels.text.charCodeAt(0)===65279&&reopened.editions[0].sources.time_versions.text.endsWith("\r\n"),"Full five-edition workspace/reviews and original BOM/CRLF reopen exactly");
 let rejected=false;const bad=clone(source);bad.handover_records.text=bad.handover_records.text.replace('[""TIME-A1""]','[""TIME-B1""]');try{api.receive(w,{id:"cross-job",label:"Invalid cross-job handover",receivedAt:baseSettings.asOf,settings:baseSettings,notes:"Meaningful source boundary check",sources:bad});}catch{rejected=true;}assert(rejected,"Customer selection rejects another job's time version");
 assert(api.report(w,"current").includes("Marine Job Workbench")&&api.csv(w,"current","weekSubmissions").includes("SUBMISSION-A1"),"Complete operator report and week comparison exports reopen from current workspace");
 return{checks,workspace:w,analysis:api.analyse(w,"current"),customerHTML,selectedCustomerRecord:selected};
}
const result=runMarineOperatingCourse(createMarineJobCore({codec:createArchiveCodec()}));
console.log(JSON.stringify({checks:result.checks,editions:result.workspace.editions.length,reviews:result.workspace.reviews.length},null,2));
