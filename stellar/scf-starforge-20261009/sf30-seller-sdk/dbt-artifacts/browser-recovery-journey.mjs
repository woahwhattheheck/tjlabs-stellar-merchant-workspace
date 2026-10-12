import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {JobJournal,DraftSession} from './ui/recovery.js';
const [startupFile,originalResult,output]=process.argv.slice(2);
if(!startupFile||!originalResult||!output)throw Error('Usage: node browser-recovery-journey.mjs STARTUP_JSON ORIGINAL_RESULT_JSON OUTPUT_DIRECTORY');
const startup=JSON.parse(readFileSync(startupFile,'utf8'));
const outfile=name=>join(output,name);
const token=readFileSync(startup.tokenFile,'utf8').trim();
const captures={};
async function request(path,body,method='POST'){
 const r=await fetch(new URL(path,startup.url),{method,headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
 const value=await r.json(); if(!r.ok)throw Object.assign(Error(value.message),{code:value.error,status:r.status});
 if(path==='/api/read')captures[JSON.stringify(body)]=value;
 return value;
}
const read=(action,input={})=>request('/api/read',{action,input});
const storage=new Map(); storage.setItem=(k,v)=>storage.set(k,v);storage.getItem=k=>storage.get(k)||null;
const binding=await read('binding'),before=await read('status'),editions=await read('editions');
const result=JSON.parse(readFileSync(originalResult,'utf8'));
const edition=result.edition,baseline=result.baseline;
const nodes=await read('nodes',{edition,limit:30,offset:0}); const uid=nodes.items.find(n=>n.type==='model').uid;
const ctx={edition,baseline,review:null,selection:[uid],decisions:{[uid]:{status:'investigate',note:'Original browser work retained through restart.'}},form:{name:'U12 browser handover',reviewer:'U12',note:'Complete native browser recovery journey'},node:uid,editor:{status:'investigate',note:'Unsaved editor text survives.',proposed_code:'select 9007199254740993'},tab:'review',query:'',type:'',page:0};
const draft=new DraftSession({request,uuid:randomUUID});await draft.save(ctx);assert.equal(draft.revision,1);
const copied=new DraftSession({request,uuid:randomUUID});assert.deepEqual(await copied.open(draft.id),ctx);
await draft.save({...ctx,form:{...ctx.form,note:'Changed from original browser'}});
await assert.rejects(copied.save({...ctx,form:{...ctx.form,note:'Concurrent stale edit'}}),{code:'BROWSER_DRAFT_CONFLICT'});
await copied.fork();await copied.save(ctx);assert.notEqual(copied.id,draft.id);
// The native write completes; only the browser's completion response is lost.
let failOnce=true,submitted=[];
const flaky=async(path,body,method)=>{const value=await request(path,body,method);if(path==='/api/jobs'){submitted.push(body.id);if(failOnce){failOnce=false;throw Error('Authored lost response after native acceptance');}}return value;};
const options={request:flaky,storage,scope:binding.sha256,uuid:randomUUID,pause:()=>new Promise(r=>setTimeout(r,5))};
const journal=new JobJournal(options);
const input={name:ctx.form.name+' '+randomUUID().slice(0,8),edition,baseline,selection:[uid],decisions:ctx.decisions,reviewer:'U12',note:ctx.form.note,expected_revision:0};
await assert.rejects(journal.run('review.save',input),/lost response/);
const reopened=new JobJournal({...options,request:async(path,body,method)=>{if(path==='/api/jobs')submitted.push(body.id);return request(path,body,method);}});
const review=await reopened.run('review.save',input);
assert.equal(submitted.length,2);assert.equal(submitted[0],submitted[1]);assert.equal(review.revision,1);assert.equal(reopened.pending().length,0);
const after=await read('status');assert.equal(after.counts.reviews,before.counts.reviews+1);
// Replay a native draft write whose HTTP completion was lost.
const same={expected_revision:draft.revision,context:{...ctx,review:{id:review.id,name:review.name,revision:review.revision}}};
const once=await request('/api/browser/'+draft.id,same,'PUT'),twice=await request('/api/browser/'+draft.id,same,'PUT');assert.deepEqual(once,twice);
const normal=new JobJournal({...options,request});
const reports={};for(const format of ['json','csv','html']){
 const descriptor=await normal.run('report',{edition,review:review.id,format});
 const response=await fetch(new URL('/api/objects/'+descriptor.sha256,startup.url),{headers:{Authorization:'Bearer '+token}});
 const bytes=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),descriptor.sha256);
 writeFileSync(outfile('browser-review.'+format),bytes);reports[format]={bytes:bytes.length,sha256:descriptor.sha256};
}
const exported=await normal.run('export');
const r=await fetch(new URL('/api/objects/'+exported.sha256,startup.url),{headers:{Authorization:'Bearer '+token}});const archive=Buffer.from(await r.arrayBuffer());
assert.equal(createHash('sha256').update(archive).digest('hex'),exported.sha256);writeFileSync(outfile('browser-project.zip'),archive);
const name='u12-browser-received-'+randomUUID().slice(0,8);
const received=await normal.run('receive',{sha256:exported.sha256,name});
const child=await request('/api/received/open',{name});
const childToken=readFileSync(child.tokenFile,'utf8').trim();
const cr=await fetch(new URL('/api/read',child.url),{method:'POST',headers:{Authorization:'Bearer '+childToken,'Content-Type':'application/json'},body:JSON.stringify({action:'status',input:{}})});const childStatus=await cr.json();
assert.equal(childStatus.counts.reviews,after.counts.reviews);
const cj=await fetch(new URL('/api/jobs',child.url),{method:'POST',headers:{Authorization:'Bearer '+childToken,'Content-Type':'application/json'},body:JSON.stringify({id:randomUUID(),action:'review.save',input:{...input,note:'Independent received-project edit',expected_revision:1}})});let childJob=await cj.json();
while(['queued','running'].includes(childJob.state)){await new Promise(r=>setTimeout(r,10));const poll=await fetch(new URL('/api/jobs/'+childJob.id,child.url),{headers:{Authorization:'Bearer '+childToken}});childJob=await poll.json();}
assert.equal(childJob.state,'complete');assert.equal(childJob.result.revision,2);
// Keep real read responses for separate offline UI rendering. No browser transport claim.
for(const action of ['status','editions','artifacts','reviews','binding'])await read(action);
for(const ed of editions){await read('nodes',{edition:ed.id,q:'',type:'',offset:0,limit:30});for(const item of (await read('nodes',{edition:ed.id,offset:0,limit:30})).items)await read('node',{edition:ed.id,uid:item.uid});}
await read('review',{id:review.id});
const report={state:'complete',operation:'SCF-DBT-BROWSER-RECOVERY-U12-20261012',transport:'native HTTP from Node; browser navigation separate',draftId:draft.id,draftRevision:once.revision,conflictingCopyId:copied.id,originalJob:submitted[0],submissions:submitted.length,review:review.id,reviewCountBefore:before.counts.reviews,reviewCountAfter:after.counts.reviews,receivedReviewRevision:childJob.result.revision,reports,archive:{bytes:archive.length,sha256:exported.sha256},childDirectory:received.path};
writeFileSync(outfile('native-recovery-result.json'),JSON.stringify(report,null,2));writeFileSync(outfile('native-read-captures.json'),JSON.stringify(captures));
console.log(JSON.stringify(report,null,2));
