export function runFieldFilingCourse(api){
const checks=[],ok=(name,condition)=>{if(!condition)throw new Error(name);checks.push(name);};
const sources=JSON.parse(JSON.stringify(api.sampleSources)),settings=api.sampleSettings;
let w=api.create({id:"operating-course",label:"Field filing complete operating course"});
function receive(id,asOf,original=sources){w=api.receive(w,{id,label:id,receivedAt:settings.asOf,notes:"Authored end-to-end operating example",sources:original,settings:{...settings,asOf}});return api.analyse(w,id);}
const before=receive("before-sync","2026-10-20T12:00:00-04:00");ok("Offline field and form absent before their observed times",before.fieldRecords.length===0&&before.formInstances.length===0&&before.signatures.length===0&&before.filingAttempts.length===0);
const original=receive("original-received","2026-10-20T12:42:00-04:00");
ok("Original field and both signatures visible before correction",original.fieldRecords.find(r=>r.key==="FIELD-A1").current&&original.formInstances.find(r=>r.key==="FORM-A1").signatureState==="declared_roles_recorded"&&!original.formInstances.find(r=>r.key==="FORM-A1").supersededField);
ok("Old booking reference remains separately actionable",original.attention.some(r=>r.code==="FIELD_USES_OLDER_BOOKING"));
const accepted=receive("accepted-observation","2026-10-20T13:23:00-04:00");
ok("Actual acceptance visible before later rejection and revocation",accepted.filingAttempts.find(r=>r.key==="FILE-A1").status==="accepted"&&accepted.signatures.find(r=>r.key==="SIGN-A-OWNER-1").activeSigned);
const final=receive("current",settings.asOf),form=final.formInstances.find(r=>r.key==="FORM-A1");
ok("Correction preserves original signed/form artifact and identifies supersession",form.field_version_id==="FIELD-A1"&&form.supersededField&&form.artifact_sha256===original.formInstances.find(r=>r.key==="FORM-A1").artifact_sha256&&final.fieldRecords.length===3);
ok("Signature revocation retains the original event",final.signatures.find(r=>r.key==="SIGN-A-OWNER-2").current&&!final.signatures.find(r=>r.key==="SIGN-A-OWNER-1").activeSigned&&form.missingRoles.includes("owner"));
ok("Filing keeps acknowledgement, conflicting response and repeated attempts distinct",final.filingEvents.length===4&&final.filingAttempts.find(r=>r.key==="FILE-A1").status==="rejected"&&final.filingAttempts.find(r=>r.key==="FILE-A1").conflictingOutcomes&&final.filingAttempts.find(r=>r.key==="FILE-A1-REPEAT").status==="submitted");
ok("Unknown source requirements remain unknown",final.formInstances.find(r=>r.key==="FORM-B1").signatureState==="requirements_unspecified"&&final.attention.some(r=>r.code==="FILING_REQUIREMENTS_UNSPECIFIED"));
ok("Arrival promise, actual work and exact money remain independent",final.attention.some(r=>r.code==="PLANNED_ARRIVAL_OUTSIDE_PROMISE")&&final.attention.some(r=>r.code==="OBSERVED_ARRIVAL_OUTSIDE_PROMISE")&&final.bookings.find(r=>r.key==="JOB-A").actualStatus==="completed"&&final.invoices[0].balanceMinor==="35000"&&final.totalsByCurrency[0].unappliedCreditMinor==="7500");
const map={system:"systems",promise:"arrivalPromises",fieldRecord:"fieldRecords",formTemplate:"formTemplates",formInstance:"formInstances",signature:"signatures",filingAttempt:"filingAttempts",filingEvent:"filingEvents"};
for(const[type,table]of Object.entries(map)){const subject=final[table][0];w=api.review(w,{id:"review-"+type,editionId:"current",subjectType:type,subjectId:subject.key,disposition:"investigate",reviewer:"Authored office reviewer",reason:"Retain original source and inspect this exact operational subject",evidence:"Authored course source",previousReviewId:null});}

const delayed=JSON.parse(JSON.stringify(sources));delayed.filing_events.text+="EVENT-A1-LATE-DELIVERY,FILE-A1,delivered,2026-10-20T12:51:00-04:00,2026-10-20T13:50:00-04:00,LATE-DELIVERY-RECEIPT,Delayed transport observation after agency rejection\r\nEVENT-A1-LATE-ACCEPT,FILE-A1,accepted,2026-10-20T13:21:00-04:00,2026-10-20T13:51:00-04:00,LATE-ACCEPT-RECEIPT,Delayed older agency acceptance\r\n";
const later=receive("delayed-callbacks",settings.asOf,delayed),filing=later.filingAttempts.find(r=>r.key==="FILE-A1");
ok("Late transport and older agency observations preserve the newer rejection",filing.status==="rejected"&&filing.decisionEventId==="EVENT-A1-REJECT"&&filing.transportEventId==="EVENT-A1-LATE-DELIVERY"&&filing.acknowledgementEventId==="EVENT-A1-ACK"&&filing.lastObservedEventId==="EVENT-A1-LATE-ACCEPT"&&later.fieldSummary.rejectedFilings===1);

const reopened=api.reopen(JSON.parse(JSON.stringify(w)));ok("Every added review domain survives full workspace reopening",reopened.reviews.length===8&&api.analyse(reopened,"current").reviewHistory.length===8);
const exports=Object.fromEntries(api.analysisTables.map(kind=>[kind,api.csv(reopened,"current",kind)]));for(const[k,text]of Object.entries(exports))ok("Complete CSV export "+k,api.parseCSV(text,["key"],k).length===final[k].length);
const report=api.report(reopened,"current");ok("Full report preserves internal notes, original tables and exact full workspace",report.includes("internal_notes")&&report.includes("filing_attempts")&&report.includes("Download full core workspace")&&report.includes("Field Filing Workbench"));
let rejected=false;try{const bad=JSON.parse(JSON.stringify(sources));bad.field_versions.text=bad.field_versions.text.replace("2,FIELD-A1","2,UNKNOWN");receive("broken-predecessor",settings.asOf,bad);}catch{rejected=true;}ok("Changed predecessor cannot silently replace field history",rejected);
return{schema:"tjlabs.field-filing-course.v1",checks,workspace:reopened,analysis:api.analyse(reopened,"current"),exports,report};
}
