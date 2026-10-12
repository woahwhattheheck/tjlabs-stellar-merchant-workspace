#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { main } from './workspace/f/tjlabs_open311/workspace.ts';

const output = resolve(process.argv[2] || './.private/adapter-journey');
const assert = (value, message) => { if (!value) throw new Error(message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value)
  ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).sort().map(key => JSON.stringify(key)+':'+canonical(value[key])).join(',') + '}';
const equal = (a,b,message) => assert(canonical(a) === canonical(b), message);
const result = { schema:'tjlabs.windmill.open311.adapter-journey.v1', startedAt:new Date().toISOString(), node:process.version, steps:[] };
await mkdir(output, {recursive:true,mode:0o700});
async function saved(name, value) {
  await writeFile(join(output,name+'.json'), JSON.stringify(value,null,2)+'\n');
  result.steps.push({name,completedAt:new Date().toISOString()}); return value;
}
async function call(name, action, target='source', args={}) { return saved(name,await main(action,target,args)); }
async function capture(kind, runKey) {
  const query = kind==='services' ? {locale:'en'} : {start_date:'2026-10-08T08:00:00Z',end_date:'2026-10-08T12:00:00Z',extensions:true};
  const plan = await call(runKey+'-plan','prepare_capture','source',{kind,connectionId:'helsinki-public',query,runKey});
  const value = await call(runKey,'apply_plan','source',{plan});
  equal(value,await main('apply_plan','source',{plan}),'Repeating the exact prepared capture changed its result.');
  return value.capture.id;
}
try {
  const initial = await call('initial','overview');
  assert(initial.captures.length===0 && initial.reviews.length===0,'Use a fresh source workspace for this complete commissioning journey.');
  const receiverInitial = await call('receiver-initial','overview','receiver');
  assert(receiverInitial.captures.length===0&&receiverInitial.connections.length===0,'Use a fresh receiving workspace.');
  const servicesId = await capture('services','adapter-services');
  const firstId = await capture('requests','adapter-requests');
  const first = await call('first-source','capture','source',{captureId:firstId});
  const services = await call('services','services','source',{connectionId:'helsinki-public'});
  assert(services.items.length===5 && first.items.length===3,'The retained Helsinki catalogue/request inventory changed.');
  equal(first.items.map(row=>row.serviceRequestId).sort(),['3553245','3553339','3553509'],'The original Helsinki request identities changed.');
  const retained=JSON.parse(await readFile(new URL('./fixtures/helsinki-retained-source.json',import.meta.url),'utf8'));
  assert(retained.captures.some(c=>c.raw.sha256===first.raw.sha256&&c.raw.bytes===first.raw.bytes),'The response differs from its retained original.');
  const reviewPlan=await call('review-plan','prepare_review','source',{
    runKey:'adapter-assignment',captureId:firstId,
    selection:first.items.map(row=>({serviceRequestId:row.serviceRequestId,sourceSha256:row.sourceSha256,priorReviewId:row.review?.requestId||null})),
    review:{status:'assigned',assignee:'Operations desk',dueDate:'2026-10-16',note:'Review the retained Helsinki feedback and prepare the operator handover.'}
  });
  const reviews=await call('assignments','apply_reviews','source',{plan:reviewPlan,approval:{approved:true,method:'adapter commissioning'}});
  const repeatedReviews=await main('apply_reviews','source',{plan:reviewPlan,approval:{approved:true,method:'adapter commissioning'}});
  equal(reviews.results,repeatedReviews.results,'Repeating the approved batch duplicated or changed the original reviews.');
  const secondId=await capture('requests','adapter-repeat');
  const comparison=await call('comparison','diff','source',{before:firstId,after:secondId});
  assert(comparison.unchanged.length===3 && comparison.added.length===0 && comparison.changed.length===0 && comparison.missingFromCapture.length===0,'Repeated original requests changed.');
  const delivery=await call('delivery','export_pack','source',{captureId:secondId});
  await mkdir(join(output,'downloads'),{recursive:true});
  for(const file of delivery.files){
    const bytes=Buffer.from(file.body,'base64');
    assert(bytes.length===file.bytes&&hash(bytes)===file.sha256,'Download checksum differs.');
    await writeFile(join(output,'downloads',file.filename),bytes);
  }
  const sourceFinal=await call('source-final','overview');
  const transferPlan=await call('receive-plan','prepare_receive','receiver',{runKey:'adapter-receive',source:true});
  const received=await call('received','apply_plan','receiver',{plan:transferPlan});
  equal(received,await main('apply_plan','receiver',{plan:transferPlan}),'Repeating the complete receive changed its result.');
  const reopened=await call('receiver-reopened','overview','receiver');
  assert(reopened.workspaceId===sourceFinal.workspaceId,'Receiving changed the original workspace identity.');
  assert(reopened.captures.length===sourceFinal.captures.length && reopened.reviews.length===3,'Receiving lost captures or reviews.');
  equal(reopened.requests.items,sourceFinal.requests.items,'Receiving changed original request rows or reviews.');
  const receiverDelivery=await call('receiver-delivery','export_pack','receiver',{captureId:secondId});
  for(const file of delivery.files.filter(x=>!x.filename.startsWith('open311-workspace-'))){
    const receivedFile=receiverDelivery.files.find(x=>x.filename===file.filename);
    assert(receivedFile&&receivedFile.sha256===file.sha256&&receivedFile.bytes===file.bytes,'Receiving changed export '+file.filename);
  }
  const sourceBundle=JSON.parse(Buffer.from(delivery.files.find(x=>x.filename.startsWith('open311-workspace-')).body,'base64'));
  const receiverFile=await main('export','receiver',{kind:'workspace'});
  const receiverBundle=JSON.parse(Buffer.from(receiverFile.body,'base64'));
  for(const operation of sourceBundle.payload.operations)equal(operation,receiverBundle.payload.operations.find(x=>x.requestId===operation.requestId),'Receiving lost an original operation.');
  Object.assign(result,{status:'PASSED',workspaceId:sourceFinal.workspaceId,sourceRevision:sourceFinal.revision,receivedRevision:reopened.revision,
    services:services.items.length,requests:first.items.length,reviews:reopened.reviews.length,captures:reopened.captures.length,
    serviceCaptureId:servicesId,requestCaptureId:secondId,unchangedRequests:comparison.unchanged.length,
    downloadedFiles:delivery.files.map(({body,...file})=>file),completedAt:new Date().toISOString()});
} catch(error) {
  result.status='FAILED';result.error={message:error.message,stack:error.stack};process.exitCode=1;
} finally {
  await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}
