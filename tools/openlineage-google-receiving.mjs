import assert from "node:assert/strict";
import {promises as fs} from "node:fs";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
if(!process.argv[2])throw new Error("Provide the original receiving root with the complete archive unpacked in original/");
const root=resolve(process.argv[2]), app=resolve(process.argv[3]??join(root,"application"));
const google=await import(pathToFileURL(join(app,"dataplex.mjs")));
const {verifyBundle,LineageWorkspace,APPLICATION_FILES}=await import(pathToFileURL(join(app,"store.mjs")));
const expectedApplicationFiles=new Set([...APPLICATION_FILES,...google.GOOGLE_FILES]).size;
const {sha256,canonical}=await import(pathToFileURL(join(app,"model.mjs")));
const result={schema:"commons.openlineage.google-native-receiving.v1",startedAt:new Date().toISOString(),node:process.version,transport:"Injected Google REST contract responses with exact retained upstream producer bytes",cases:[]};
const save=()=>fs.writeFile(join(root,"native-result.json"),JSON.stringify(result,null,2)+"\n");
let earlierIds=null;
try{
 for(const [name,input] of [["baseline-v1","baseline/openlineage-workspace.json"],["merchant-v2","receiving/openlineage-workspace.json"],["producer-v2","producers/producer-workspace.json"]]){
  const sourceBytes=await fs.readFile(join(root,"original",input)),original=verifyBundle(sourceBytes),edition=original.state.editions.at(-1),names=new Map();
  for(const row of original.state.events)for(const direction of ["inputs","outputs"])for(const d of Array.isArray(row.event?.[direction])?row.event[direction]:[]){
   if(d&&typeof d.namespace==="string"&&typeof d.name==="string")names.set(canonical([d.namespace,d.name]),{namespace:d.namespace,name:d.name,fullyQualifiedName:google.googleFqn(d.namespace,d.name)??d.namespace+":"+d.name});
  }
  const options={directory:join(root,"operations",name),sourceBytes,project:"commons-receiving",location:"us-central1",quotaProject:"commons-client",editionId:edition.id,expectedFqns:[...names.values()],title:"Original producer Google delivery"};
  const status=await google.prepareGoogleDelivery(options),again=await google.prepareGoogleDelivery(options),delivery=new google.GoogleLineageDelivery(options.directory),eligible=status.plan.events.filter(x=>!x.diagnostics.length);
  assert.equal(again.plan.operationId,status.plan.operationId);assert.deepEqual(await fs.readFile(join(options.directory,"source-workspace.json")),sourceBytes);
  assert(eligible.length>0,"actual upstream producer edition is eligible after explicit catalog-name review");
  await delivery.approve({planSha256:status.plan.planSha256,operator:"Native receiving engineer",eventIds:eligible.map(x=>x.eventId)});
  const requestIds=Object.fromEntries(status.plan.events.map(x=>[x.eventId,x.requestId]));
  if(earlierIds){for(const [id,requestId]of Object.entries(requestIds))if(earlierIds[id])assert.equal(requestId,earlierIds[id]);}else earlierIds=requestIds;
  const row={name,input,sourceSha256:sha256(sourceBytes),workspaceId:original.state.workspaceId,revision:original.state.revision,originalApplicationFiles:original.application.size,sourceObjects:original.objects.size,sourceEvents:original.state.events.length,editionId:edition.id,planSha256:status.plan.planSha256,operationId:status.plan.operationId,requestIds,eligible:eligible.length};
  if(name==="merchant-v2"){
   const posted=[],remote=new Map();let loseFirst=true,readMode="omitted-links";
   const transport={accessToken:async()=>"native-receiving-token",fetchImpl:async(url,options)=>{
    const u=new URL(url);assert.equal(u.origin,"https://datalineage.googleapis.com");assert.equal(options.headers["X-Goog-User-Project"],"commons-client");assert.equal(options.headers.Authorization,"Bearer native-receiving-token");
    if(options.method==="POST"){
     const bodySha=sha256(Buffer.from(options.body)),item=eligible.find(x=>x.payloadSha256===bodySha);assert(item);assert.equal(canonical(JSON.parse(options.body)),options.body);assert.equal(u.searchParams.get("requestId"),item.requestId);
     const process="projects/123456789012/locations/us-central1/processes/p"+item.eventId.slice(0,20),run=process+"/runs/r"+item.eventId.slice(20,40),eventName=run+"/lineageEvents/original",response={process,run,lineageEvents:[eventName]};
     remote.set(eventName,item);posted.push({requestId:item.requestId,payloadSha256:bodySha,response});
     if(loseFirst){loseFirst=false;throw Object.assign(new Error("Injected lost API response"),{code:"ECONNRESET"});}
     return Response.json(response);
    }
    const name=u.pathname.slice("/v1/".length),item=remote.get(name);assert(item);
    if(readMode==="omitted-links")return Response.json({name});
    const field=readMode==="column-links"?{field:["id"]}:{};
    return Response.json({name,links:item.expectedLinks.map(link=>({source:{fullyQualifiedName:link.source,...field},target:{fullyQualifiedName:link.target,...field}}))});
   }};
   let sent=await delivery.publish(transport);assert.equal(Object.values(sent.journal.events)[0].state,"UNRESOLVED");
   sent=await delivery.publish(transport);assert(eligible.every(x=>sent.journal.events[x.eventId].state==="CONFIRMED"));assert.equal(posted[0].requestId,posted[1].requestId);assert.equal(posted[0].payloadSha256,posted[1].payloadSha256);
   let received=await delivery.reconcile(transport);assert(eligible.every(x=>received.journal.events[x.eventId].receiving.state==="MAPPING_REVIEW"));
   readMode="column-links";received=await delivery.reconcile(transport);assert(eligible.every(x=>received.journal.events[x.eventId].receiving.state==="MAPPING_REVIEW"));assert(eligible.every(x=>received.journal.events[x.eventId].receiving.columnLinks.length>0));
   readMode="table-links";received=await delivery.reconcile(transport);assert(eligible.every(x=>received.journal.events[x.eventId].receiving.state==="RECEIVED"));assert(eligible.every(x=>received.journal.events[x.eventId].receivingHistory.length===2));
   const before=posted.length;await delivery.publish(transport);assert.equal(posted.length,before);
   row.transport={posts:posted.length,confirmed:eligible.length,received:eligible.length,lostResponseRecovered:true,omittedLinksReviewed:true,columnEdgesDistinguished:true,previousReceivingAttemptsPerEvent:2,quotaProject:"commons-client"};
  }
  const exported=await delivery.exportPackage(join(root,name+"-google-delivery.json")),bytes=await fs.readFile(exported.path),checked=google.verifyGooglePackage(bytes);
  assert.deepEqual(checked.original,sourceBytes);assert.equal(checked.files.size,expectedApplicationFiles);assert(!bytes.includes(Buffer.from("native-receiving-token")));
  const receiving=await google.receiveGooglePackage(bytes,join(root,"received",name)),receiver=await import(pathToFileURL(join(receiving.directory,"application","dataplex.mjs")));
  const receivedStatus=await new receiver.GoogleLineageDelivery(receiving.directory).status();assert.deepEqual(receivedStatus.plan,status.plan);
  const originalRuntime=await import(pathToFileURL(join(receiving.directory,"workspace","application","store.mjs"))),reopened=await new originalRuntime.LineageWorkspace(join(receiving.directory,"workspace")).read();
  assert.equal(reopened.workspaceId,original.state.workspaceId);assert.deepEqual(reopened.editions,original.state.editions);assert.deepEqual(reopened.results,original.state.results);
  await delivery.writeReport(join(root,name+"-report.html"));
  row.delivery={bytes:exported.bytes,sha256:exported.sha256,applicationFiles:receiving.applicationFiles,reopenedWorkspaceId:reopened.workspaceId,totals:receivedStatus.totals};result.cases.push(row);await save();
 }
 const mixed=new LineageWorkspace(join(root,"unsupported-source"));await mixed.initialize("Original upstream run and standalone facet source");
 for(const name of ["fixture-event-simple.json","fixture-lineage-dataset.json","fixture-lineage-implicit-job.json"]){const state=await mixed.read();await mixed.importSource({bytes:await fs.readFile(join(app,name)),name,sourceUrl:"https://github.com/OpenLineage/OpenLineage",operationId:"original-"+name,expectedRevision:state.revision});}
 let state=await mixed.read();await mixed.saveEdition({title:"Complete original source selection",operationId:"save-original-selection",expectedRevision:state.revision});state=await mixed.read();
 const sourceExport=await mixed.exportBundle(),sourceBytes=await fs.readFile(join(mixed.directory,"exports",sourceExport.id+".json")),unsupported=await google.prepareGoogleDelivery({directory:join(root,"unsupported-google"),sourceBytes,project:"commons-receiving",location:"us-central1",editionId:state.editions.at(-1).id,title:"Complete original source review"});
 assert.equal(unsupported.plan.events.length,3);assert.equal(unsupported.plan.events.filter(x=>x.job===null).length,2);assert(unsupported.plan.events.every(x=>x.diagnostics.length>0));
 const unsupportedDelivery=new google.GoogleLineageDelivery(unsupported.directory);await unsupportedDelivery.writeReport(join(root,"unsupported-source-report.html"));
 const unsupportedPackage=await unsupportedDelivery.exportPackage(join(root,"unsupported-source-google-delivery.json"));assert.deepEqual(google.verifyGooglePackage(await fs.readFile(unsupportedPackage.path)).original,sourceBytes);
 await assert.rejects(()=>unsupportedDelivery.reconcile({accessToken:async()=>{throw new Error("unapproved operation requested a token");}}),/Approve the original Google plan/);
 result.originalUnsupportedSource={events:3,retainedFacetOnlyObjects:2,completeBytes:unsupportedPackage.bytes,report:"unsupported-source-report.html"};result.completedAt=new Date().toISOString();result.state="COMPLETE";await save();console.log(JSON.stringify(result,null,2));
}catch(error){result.state="FAILED";result.error={name:error.name,message:error.message,stack:error.stack};await save();throw error;}
