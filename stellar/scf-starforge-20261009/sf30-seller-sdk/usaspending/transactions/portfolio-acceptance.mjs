#!/usr/bin/env node
// MIT. Component acceptance with an explicit deterministic source-store fixture.
// This adapter exercises the public AwardTransactions interface; it is not a
// claim to have rerun the full original federal-award receiving programme.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPortfolio, validatePortfolio, viewPortfolio, exportPortfolioDirectory, receivePortfolio, addMoney, digest, canonical } from './portfolio.mjs';
import { servePortfolio } from './portfolio-server.mjs';
import { main } from './portfolio-cli.mjs';
const sealed = value => ({...value, sha256:digest(value)});
export function fixture(count=3) {
  const items = new Map(), received = new Map(); let failOn=null, closed=false;
  for(let i=0;i<count;i++) {
    const id='TC-fixture-'+i, awardKey='CONT_AWD_FIXTURE_'+i;
    const award={award_key:awardKey,recipient_name:'Example prime '+(i%2),awarding_agency:'Example agency '+(i%3),naics:'541512',description:'Implementation workshare fixture',source_url:'https://api.usaspending.gov/api/v2/transactions/'};award.row_sha256=digest(award);
    const obligation=i===0?'9007199254740993.01':i===1?'-0.02':'100.01';
    const row={award_key:awardKey,transaction_id:'TX-'+i,action_date:'2026-10-01',federal_action_obligation:obligation,row_sha256:digest({i,obligation})};
    const body=JSON.stringify({results:[{id:row.transaction_id,action_date:row.action_date,federal_action_obligation:obligation}],page_metadata:{page:1,next:null,previous:null,hasNext:false,hasPrevious:false}}),request={award_id:awardKey,page:1,limit:250,sort:'action_date',order:'asc'};
    const requestBytes=Buffer.from(JSON.stringify(request));
    const receipt={status:200,bytes:Buffer.byteLength(body),sha256:digest(body),finishedAt:'2026-10-12T12:00:00Z',request:{method:'POST',url:'https://api.usaspending.gov/api/v2/transactions/',body:request,bodyBase64:requestBytes.toString('base64'),bodySha256:digest(requestBytes)}};
    const coverage={complete:true,pages:1,occurrences:1,fingerprint:digest({awardKey,body}),award_key:awardKey,award_edition_id:'ED-fixture',award_row_sha256:award.row_sha256};
    const capture={schema:'usaspending-award-transactions-v1.capture',captureId:id,awardKey,awardEditionId:'ED-fixture',awardRowSha256:award.row_sha256,request,maxRows:250000,coverage,pages:[{request,receipt,responseBase64:Buffer.from(body).toString('base64')}],rows:[row]};
    const c={id,award_key:awardKey,award_edition_id:'ED-fixture',award_row:award,status:'complete',fingerprint:coverage.fingerprint,page_count:1,row_count:1,updated_at:'2026-10-12T12:00:00Z'};
    const analysis={unique_transactions:1,net_obligation_usd:obligation,known_net_obligation_usd:obligation,first_action_date:row.action_date,last_action_date:row.action_date};
    items.set(id,{capture,c,analysis,review:null});
  }
  const tx={state:()=>({captures:[...items.values()].map(x=>x.c)}),capture:id=>items.get(id).c,
    summary:id=>({capture:items.get(id).c,analysis:items.get(id).analysis,review:items.get(id).review}),
    export:(id,{includeReview=false}={})=>sealed({...items.get(id).capture,...(includeReview?{review:items.get(id).review}:{})}),
    saveReview:({captureId,expectedRevision,review})=>{const x=items.get(captureId);if(expectedRevision!==(x.review?.revision??0))throw Object.assign(new Error('Review changed; reopen before saving.'),{code:'TRANSACTION_REVIEW_REVISION_CONFLICT',status:409});const r={capture_id:captureId,revision:expectedRevision+1,operator:'Fixture operator',updated_at:new Date().toISOString(),data:{...review,captureId,sourceFingerprint:x.c.fingerprint,awardKey:x.c.award_key,awardEditionId:'ED-fixture'}};x.review=r;return r;},
    receive:(packet,{includeReview=false}={})=>{if(packet.captureId===failOn)throw Object.assign(new Error('Injected receiving interruption'),{code:'INJECTED_INTERRUPTION'});const result={captureId:'TC-received-'+packet.sha256.slice(0,16),sourceSha256:packet.sha256,complete:packet.coverage.complete,reviewReceived:includeReview};received.set(packet.captureId,result);return result;}};
  return {transactions:tx,state:()=>({id:'WR-fixture'}),close:()=>{closed=true;},items,received,setFailure:id=>{failOn=id;},get closed(){return closed;}};
}
export async function acceptance() {
 const root=await mkdtemp(join(tmpdir(),'portfolio-acceptance-')),w=fixture();let server;
 try {
  assert.equal(addMoney(['9007199254740993.01','-0.02']),'9007199254740992.99');
  assert.equal(addMoney(['0.0001','0.0099']),'0.01');assert.equal(addMoney(['1',null]),null);
  const p=buildPortfolio(w.transactions),v=viewPortfolio(p);
  assert.equal(v.totals.completeNetObligationUsd,'9007199254741093');assert.equal(v.totals.awards,3);
  assert.equal(viewPortfolio(p,{recipient:'Example prime 0'}).rows.length,2);
  const original=canonical(p.members[0].capture);
  const bad=structuredClone(p);bad.members[0].analysis.net_obligation_usd='1';delete bad.sha256;bad.sha256=digest(bad);
  assert.throws(()=>validatePortfolio(bad),{code:'PORTFOLIO_ANALYSIS_BINDING_MISMATCH'});
  w.items.set('TC-fixture-old',{...w.items.get('TC-fixture-0'),c:{...w.items.get('TC-fixture-0').c,id:'TC-fixture-old',updated_at:'2020-01-01T00:00:00Z'}});
  assert.equal(buildPortfolio(w.transactions).members.length,3);
  assert.throws(()=>buildPortfolio(w.transactions,{captureIds:['TC-fixture-0','TC-fixture-old']}),{code:'PORTFOLIO_DUPLICATE_AWARD_KEYS'});
  w.items.delete('TC-fixture-old');
  const exported=await exportPortfolioDirectory(p,join(root,'delivery'));
  assert.equal(exported.files,8);
  const disk=JSON.parse(await readFile(join(root,'delivery','portfolio.json'),'utf8'));validatePortfolio(disk);
  assert.equal(canonical(disk.members[0].capture),original);
  const manifest=JSON.parse(await readFile(join(root,'delivery','manifest.json'),'utf8'));
  for(const file of manifest.files){const bytes=await readFile(join(root,'delivery',file.path));assert.equal(bytes.length,file.bytes);assert.equal(digest(bytes),file.sha256);}
  await assert.rejects(exportPortfolioDirectory(p,join(root,'delivery')),{code:'EEXIST'});
  const journalPath=join(root,'receive.json');w.setFailure('TC-fixture-1');
  await assert.rejects(receivePortfolio(w.transactions,p,{journalPath,workspaceId:'WR-fixture'}),{code:'INJECTED_INTERRUPTION'});
  const stopped=JSON.parse(await readFile(journalPath,'utf8'));assert.equal(Object.keys(stopped.results).length,1);
  w.setFailure(null);const resumed=await receivePortfolio(w.transactions,p,{journalPath,workspaceId:'WR-fixture'});assert.equal(resumed.complete,true);assert.equal(w.received.size,3);
  await receivePortfolio(w.transactions,p,{journalPath,workspaceId:'WR-fixture'});assert.equal(w.received.size,3);
  await assert.rejects(receivePortfolio(w.transactions,p,{journalPath,workspaceId:'WR-other'}),{code:'PORTFOLIO_RECEIVING_PLAN_CHANGED'});
  const inspected=await main(['inspect','--packet',join(root,'delivery','portfolio.json')],{print:false});assert.equal(inspected.totals.awards,3);
  server=await servePortfolio(w);const token=new URL(server.url).hash.slice(1),headers={'x-portfolio-token':token};
  assert.equal((await fetch(server.origin+'/api/view')).status,401);
  assert.equal((await fetch(server.origin+'/api/view',{headers:{...headers,origin:'https://unrelated.example'}})).status,403);
  assert.equal((await(await fetch(server.origin+'/api/view',{headers})).json()).rows.length,3);
  const review={status:'scope_match',fit:'Existing integration backlog',fundingChange:'Retained funding',proposedWorkshare:'Implement ingestion and reconciliation',deliverables:'Working integration and runbook',acceptance:'Original operations reopen correctly',owner:'Relationship owner',caseUrl:'',nextAction:'Internal review',notes:'Private fixture assessment'};
  const save=body=>fetch(server.origin+'/api/review',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await save({captureId:'TC-fixture-0',expectedRevision:0,review})).status,200);
  assert.equal((await save({captureId:'TC-fixture-0',expectedRevision:0,review})).status,409);
  const publicPacket=await(await fetch(server.origin+'/api/export',{headers})).json();assert.equal(publicPacket.members[0].capture.review,undefined);
  const privatePacket=await(await fetch(server.origin+'/api/export?reviews=true',{headers})).json();assert.equal(privatePacket.members[0].capture.review.revision,1);
  const large=fixture(10000),start=performance.now(),full=buildPortfolio(large.transactions);assert.equal(viewPortfolio(full).totals.awards,10000);
  return {scenario:'portfolio component acceptance',passed:true,awards:10000,capacityMilliseconds:Math.round(performance.now()-start),sourcePacketPreserved:true,interruptionResume:true,reviewConcurrency:true,privateExportOptIn:true};
 } finally {if(server)await server.close();await rm(root,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)acceptance().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error);process.exitCode=1;});
