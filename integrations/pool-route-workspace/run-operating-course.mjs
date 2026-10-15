import {createArchiveCodec} from './runtime-codec.mjs';
import {createPoolRouteCore} from './pool-route-core.mjs';
function runPoolRouteCourse(api){
const checks=[],ok=(name,condition)=>{if(!condition)throw Error(name);checks.push(name);},copy=x=>JSON.parse(JSON.stringify(x));
const sources=copy(api.sampleSources),settings=copy(api.sampleSettings);let workspace=api.create({id:"pool-route-operating-course",label:"Pool Route Workbench: complete operating example"});
function receive(id,asOf,source=sources){workspace=api.receive(workspace,{id,label:id,receivedAt:settings.asOf,notes:"Authored complete operating example with actual retained CSV and artifact bodies",settings:{...settings,asOf},sources:source});return api.analyse(workspace,id);}
const before=receive("before-offline-sync","2026-10-20T12:00:00-05:00");
ok("Offline service, measurements, media and reports remain future before receipt",before.serviceRecords.length===0&&before.readings.length===0&&before.media.length===0&&before.reportArtifacts.length===0&&before.poolFuture.serviceRecords.length===4);
const original=receive("original-report-received","2026-10-20T12:42:00-05:00"),originalReport=original.reportArtifacts.find(x=>x.key==="REPORT-A1");
ok("Original report binds its original reading, media and service version",originalReport.service_version_id==="SERVICE-A1"&&!originalReport.supersededService&&originalReport.parentsObserved&&originalReport.readingIds.join()==="READ-A1"&&originalReport.mediaIds.join()==="MEDIA-A1");
ok("Delivered observation is visible before a later bounce",original.reportDeliveries.find(x=>x.key==="DELIVERY-A1").status==="delivered");
const corrected=receive("corrected-report-received","2026-10-20T13:25:00-05:00"),old=corrected.reportArtifacts.find(x=>x.key==="REPORT-A1"),replacement=corrected.reportArtifacts.find(x=>x.key==="REPORT-A2");
ok("Correction retains original report bytes and adds an independent replacement",old.artifact_sha256===originalReport.artifact_sha256&&old.supersededService&&replacement.service_version_id==="SERVICE-A2"&&!replacement.supersededService&&corrected.readings.find(x=>x.key==="READ-A1").value_text==="7.8"&&corrected.readings.find(x=>x.key==="READ-A2").value_text==="7.4");
ok("Measurements retain exact method, unit and literal source value",corrected.readings.find(x=>x.key==="READ-A2-CL").unit==="mg/L"&&corrected.readings.find(x=>x.key==="READ-A2-CL").value_text==="3.0");
ok("Replacement report has its own acknowledged delivery",corrected.reportDeliveries.find(x=>x.key==="DELIVERY-A2").status==="acknowledged"&&corrected.reportDeliveries.find(x=>x.key==="DELIVERY-A2").report_id==="REPORT-A2");
const current=receive("current",settings.asOf),delivery=current.reportDeliveries.find(x=>x.key==="DELIVERY-A1"),bill=current.billingPeriods[0];
ok("Late older delivery callback preserves the newer occurred bounce",delivery.status==="bounced"&&delivery.latestEventId==="EVENT-A1-BOUNCED"&&delivery.lastObservedEventId==="EVENT-A1-LATE-DELIVERY"&&delivery.lastObservedKind==="delivered");
ok("Repeated original-report attempts retain their separate identities",delivery.repeatedDeliveryIds.length===2&&current.reportDeliveries.find(x=>x.key==="DELIVERY-A1-RETRY").status==="submitted");
ok("Route revision, actual technician and observed arrival order remain independent",current.routeStops.find(x=>x.key==="STOP-C1").selected===false&&current.routeStops.find(x=>x.key==="STOP-C2").selected&&current.attention.some(x=>x.code==="ROUTE_TECHNICIAN_CHANGED")&&current.attention.some(x=>x.code==="OBSERVED_ROUTE_ORDER_CHANGED"));
ok("Explicit unassigned recurrence stays visible without inventing a job",current.expectedVisits.find(x=>x.key==="OCC-E").state==="unassigned"&&current.attention.some(x=>x.code==="EXPECTED_VISIT_UNRESOLVED"&&x.subjectId==="OCC-E")&&!current.bookings.some(x=>x.poolId==="POOL-E"));
ok("Monthly count deduplicates pool jobs and honors observed paused/inactive states",bill.distinctEligiblePools===4&&bill.activePoolCount===2&&bill.countedPools.find(x=>x.poolId==="POOL-A").reasons.length===2&&bill.excludedPools.length===2&&bill.comparisonComplete&&bill.comparisonMinor==="2198");
ok("Subscription comparison stays separate from customer invoice and retained credit",current.totalsByCurrency[0].invoicedMinor==="6000"&&current.totalsByCurrency[0].invoiceBalanceMinor==="4000"&&current.totalsByCurrency[0].unappliedCreditMinor==="1500");
const later=receive("late-service-upload","2026-10-20T15:00:00-05:00");
ok("Late offline upload retains its original older dispatch revision",later.serviceRecords.find(x=>x.key==="SERVICE-C1").revision_id==="C1"&&later.attention.some(x=>x.code==="SERVICE_USES_OLDER_BOOKING"&&x.subjectId==="SERVICE-C1"));
const mapping={pool:"pools",poolStatus:"poolStatuses",expectedVisit:"expectedVisits",routeStop:"routeStops",serviceRecord:"serviceRecords",reading:"readings",media:"media",reportArtifact:"reportArtifacts",reportDelivery:"reportDeliveries",deliveryEvent:"deliveryEvents",billingPeriod:"billingPeriods"};
for(const [type,table]of Object.entries(mapping)){const subject=current[table][0];workspace=api.review(workspace,{id:"review-"+type,editionId:"current",subjectType:type,subjectId:subject.key,disposition:"investigate",reviewer:"Authored operations reviewer",reason:"Inspect this exact source-bound operational record",evidence:"Authored complete operating example",previousReviewId:null});}
workspace=api.reopen(copy(workspace));ok("All eleven added review domains survive complete reopening",workspace.reviews.length===11&&api.analyse(workspace,"current").reviewHistory.length===11);
const exports=Object.fromEntries(api.analysisTables.map(k=>[k,api.csv(workspace,"current",k)]));
for(const[k,body]of Object.entries(exports))ok("Complete domain CSV "+k,api.parseCSV(body,["key"],k).length===current[k].length);
const report=api.report(workspace,"current");ok("Complete report retains every source family, original notes and full core workspace",Object.keys(api.columns).every(k=>report.includes(k))&&report.includes("internal_notes")&&report.includes("Download full core workspace"));
const unknown=copy(sources);unknown.pool_statuses.text=unknown.pool_statuses.text.split("\r\n").filter(line=>!line.startsWith("STATE-C-1,")).join("\r\n");const unknownA=receive("missing-status-source",settings.asOf,unknown);
ok("Missing eligible pool status produces an unresolved comparison",unknownA.billingPeriods[0].comparisonMinor===null&&unknownA.billingPeriods[0].unresolvedPools.some(x=>x.poolId==="POOL-C"));
let rejected=false;try{const changed=copy(sources);changed.service_versions.text=changed.service_versions.text.replace("2,SERVICE-A1,","2,ABSENT,");receive("broken-service-history",settings.asOf,changed);}catch{rejected=true;}ok("Broken immutable service predecessor is rejected",rejected);
const afterAck=copy(sources);afterAck.delivery_events.text+="EVENT-A2-AFTER-ACK,DELIVERY-A2,delivered,2026-10-20T13:30:00-05:00,2026-10-20T13:31:00-05:00,Authored later transport evidence,Independent source peer\r\n";
const observed=receive("acknowledged-with-later-transport",settings.asOf,afterAck),acknowledged=observed.reportDeliveries.find(x=>x.key==="DELIVERY-A2");
ok("Acknowledgement and later transport keep independent event identities",acknowledged.status==="delivered"&&acknowledged.transportEventId==="EVENT-A2-AFTER-ACK"&&acknowledged.acknowledged&&acknowledged.acknowledgementEventId==="EVENT-A2-ACK");
return{schema:"tjlabs.pool-route-operating-course.v1",checks,workspace:api.reopen(workspace),analysis:api.analyse(workspace,"current"),exports,report};
}
const result=runPoolRouteCourse(createPoolRouteCore({codec:createArchiveCodec()}));
console.log(JSON.stringify({checks:result.checks,editions:result.workspace.editions.length,reviews:result.workspace.reviews.length},null,2));
