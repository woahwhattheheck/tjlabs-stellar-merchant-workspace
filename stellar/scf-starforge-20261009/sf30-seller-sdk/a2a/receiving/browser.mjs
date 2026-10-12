// SPDX-License-Identifier: MIT
// Actual application receiving for the retained original commissioning workspace.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonical, sha, atomicFile, readVerifiedFile, privateDirectory, fail } from '../foundation.mjs';

const require=createRequire(import.meta.url);
const SCHEMA='stellar-forge.a2a-browser-commission.v1';
const PANES=['agents','messages','tasks','results','delivery','history'];
const json=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
function need(value,code){if(!value)fail(code,code,409);}
function read(path){try{return json(readVerifiedFile(path));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export async function receiveA2ABrowser({directory,url,workspaceId,projectId,editionId,handoffId,handoffSha256,resultSha256,
  historicalRevision,playwright,chromium}){
  const root=privateDirectory(directory),endpoint=new URL(url);
  need(endpoint.protocol==='http:'&&endpoint.hostname==='127.0.0.1'&&endpoint.pathname==='/'&&!endpoint.search&&!endpoint.hash,'BROWSER_ORIGINAL_ORIGIN');
  const selection={url:endpoint.origin,workspaceId,projectId,editionId,handoffId,handoffSha256,resultSha256,historicalRevision,
    sourceSha256:sha(readVerifiedFile(fileURLToPath(import.meta.url))),playwright:resolve(playwright),chromium:resolve(chromium)};
  const journal=join(root,'browser.json');let data=read(journal);
  const save=()=>atomicFile(journal,Buffer.from(canonical(data)),{replace:true});
  if(data)need(data.schema===SCHEMA&&canonical(data.selection)===canonical(selection),'BROWSER_SELECTION_CHANGED');
  else{data={schema:SCHEMA,selection,createdAt:new Date().toISOString(),steps:{},files:{},complete:false};save();}
  const verify=()=>{
    need(data.finalCandidate,'BROWSER_FINAL_CANDIDATE_REQUIRED');
    atomicFile(join(root,'result.json'),Buffer.from(canonical(data.finalCandidate)));
    const result=json(readVerifiedFile(join(root,'result.json')));need(canonical(result)===canonical(data.finalCandidate),'BROWSER_RESULT_CHANGED');
    for(const f of result.files){const bytes=readVerifiedFile(join(root,f.path));need(bytes.length===f.bytes&&sha(bytes)===f.sha256,'BROWSER_ARTIFACT_CHANGED');}
    data.complete=true;save();return result;
  };
  if(data.complete||data.finalCandidate)return verify();
  const library=require(selection.playwright);
  need(library.chromium,'BROWSER_PLAYWRIGHT_PACKAGE');
  const context=await library.chromium.launchPersistentContext(join(root,'profile'),{executablePath:selection.chromium,headless:true,
    viewport:{width:1440,height:1000},acceptDownloads:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  let page=context.pages()[0]??await context.newPage(),closed=false,activeRoute=null;
  const errors=[];page.on('pageerror',error=>errors.push(String(error.message)));
  async function ready(pane,revision=null){
    await page.waitForFunction(({projectId,pane,revision})=>{
      const state=window.a2aOperator?.inspect();if(!state?.storageReady||state.projectId!==projectId||state.pane!==pane)return false;
      const label=document.querySelector('#project-subtitle')?.textContent??'';
      return revision===null?label.includes('Current view'):state.revision===revision&&label.includes('Historical view');
    },{projectId,pane,revision},{timeout:30000});
  }
  async function open(pane,revision=null){
    const hash=new URLSearchParams({id:projectId,pane,...(revision===null?{}:{revision:String(revision)})});
    await page.goto(endpoint.origin+'/#'+hash,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!window.a2aOperator);
    if(revision===null){
      const before=await page.evaluate(()=>window.a2aOperator.inspect());
      if(before.projectId===projectId&&before.pane===pane){
        const observed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/project'&&r.request().method()==='GET');
        await page.locator('#refresh').click();await observed;
      }
    }
    await ready(pane,revision);
  }
  async function snapshot(path,{fullPage=false}={}){
    if(data.files[path]){const bytes=readVerifiedFile(join(root,path));need(sha(bytes)===data.files[path].sha256,'BROWSER_SCREENSHOT_CHANGED');return;}
    const bytes=await page.screenshot({fullPage});atomicFile(join(root,path),bytes);
    data.files[path]={path,bytes:bytes.length,sha256:sha(bytes),mediaType:'image/png'};save();
  }
  async function download(name,trigger,expected){
    if(data.steps[name]?.complete){need(sha(readVerifiedFile(join(root,data.steps[name].file)))===expected,'BROWSER_DOWNLOAD_CHANGED');return;}
    const received=page.waitForEvent('download');await trigger();const file=await received,raw=await file.path();need(raw,'BROWSER_DOWNLOAD_REQUIRED');
    const bytes=readVerifiedFile(raw);need(sha(bytes)===expected,'BROWSER_DOWNLOAD_IDENTITY');
    const path='downloads/'+name+'.json.gz';atomicFile(join(root,path),bytes);
    data.files[path]={path,bytes:bytes.length,sha256:sha(bytes),mediaType:'application/gzip'};
    data.steps[name]={complete:true,file:path,sha256:expected,originalFilename:file.suggestedFilename()};save();
  }
  async function restore(wire){
    await page.evaluate(async saved=>{
      const bytes=Uint8Array.from(atob(saved.bodyBase64),c=>c.charCodeAt(0));
      await window.a2aOperator.restorePending({...saved,body:new Blob([bytes],{type:saved.contentType})});
    },wire);
  }
  async function pendingDone(id){
    await page.waitForFunction(id=>{const state=window.a2aOperator?.inspect();return state?.storageReady&&state.pending===null;},id,{timeout:30000});
  }
  async function mutateOnce(name,trigger){
    let step=data.steps[name];
    if(step?.complete)return;
    if(step?.wire){
      await restore(step.wire);await page.locator('#retry-request').click();await pendingDone(step.wire.id);
      const token=await page.locator('meta[name=operator-token]').getAttribute('content');
      const request=await page.request.get(endpoint.origin+'/api/request?id='+encodeURIComponent(step.wire.id),{headers:{Authorization:'Bearer '+token}});
      const result=await request.json();need(request.ok()&&result.requestId===step.wire.id&&result.state==='complete'&&(!step.response||step.response.revision===result.revision),'BROWSER_REPLAY_ORIGINAL_REVISION');
      step.response??={requestId:result.requestId,state:result.state,revision:result.revision,bodySha256:step.wire.bodySha256};
      step.complete=true;save();return;
    }
    step={};data.steps[name]=step;save();
    const pattern=endpoint.origin+'/api/dispatch';
    let observedResolve,observedReject;const observed=new Promise((resolve,reject)=>{observedResolve=resolve;observedReject=reject;});
    activeRoute=async route=>{
      try{
        const request=route.request(),bytes=request.postDataBuffer();need(bytes,'BROWSER_ORIGINAL_POST_BODY');
        const input=json(bytes),id=input.payload?.requestId;need(typeof id==='string','BROWSER_ORIGINAL_REQUEST_ID');
        const inspection=await page.evaluate(()=>window.a2aOperator.inspect());
        need(inspection.pending?.id===id&&inspection.pending.bodySha256===sha(bytes),'BROWSER_PENDING_WIRE_IDENTITY');
        step.wire={schema:'stellar-forge.a2a-browser-request.v1',workspaceId,id,path:'/api/dispatch',method:'POST',
          contentType:request.headers()['content-type'],bodySha256:sha(bytes),bodyBytes:bytes.length,
          bodyBase64:bytes.toString('base64'),label:'Original browser project review',projectId,createdAt:inspection.pending.createdAt};
        save();
        const response=await route.fetch(),responseBytes=await response.body(),result=json(responseBytes);
        need(result.requestId===id&&result.bodySha256===sha(bytes)&&result.state==='complete','BROWSER_ORIGINAL_COMMITTED_RESULT');
        step.response={requestId:result.requestId,state:result.state,revision:result.revision,bodySha256:result.bodySha256};save();
        // Retain the actual committed response, then exercise the original lost-ack path.
        await route.abort('connectionfailed');observedResolve();
      }catch(error){observedReject(error);await route.abort().catch(()=>{});}
    };
    await page.route(pattern,activeRoute);
    try{await trigger();await observed;}finally{await page.unroute(pattern,activeRoute);activeRoute=null;}
    await page.reload({waitUntil:'domcontentloaded'});await ready('agents');
    await restore(step.wire);await page.locator('#retry-request').click();await pendingDone(step.wire.id);
    const token=await page.locator('meta[name=operator-token]').getAttribute('content');
    const request=await page.request.get(endpoint.origin+'/api/request?id='+encodeURIComponent(step.wire.id),{headers:{Authorization:'Bearer '+token}});
    const result=await request.json();need(request.ok()&&result.requestId===step.wire.id&&result.revision===step.response.revision&&result.state==='complete','BROWSER_REPLAY_ORIGINAL_REVISION');
    step.complete=true;save();
  }
  try{
    await open('agents');
    await mutateOnce('project-review',async()=>{
      const form=page.locator('form[data-action="update"]');
      await form.locator('[name="notes"]').fill('Original Hamburg A2A task, complete exports and reviewed fixed seller editions received. Desktop/mobile operator review retained; payment remains challenge-only.');
      await form.locator('button[type="submit"]').click();
    });
    await open('messages');
    const prepared=page.locator('[data-send]');need(await prepared.count()>=2,'BROWSER_RETAINED_MESSAGES_REQUIRED');
    for(const button of await prepared.all())need(await button.isDisabled(),'BROWSER_MESSAGE_RESEND_ENABLED');
    await open('tasks');
    need(await page.locator('[data-observation]').count()>0,'BROWSER_NATIVE_TASK_REQUIRED');
    await page.locator('[data-observation]').first().click();
    await page.locator('#source-dialog').waitFor({state:'visible'});need((await page.locator('#source-body').textContent()).includes('TASK_STATE_'),'BROWSER_NATIVE_TASK_SOURCE');
    await page.locator('#close-source').click();
    await open('results');
    await download('complete-result',()=>page.locator('[data-result="'+editionId+'"]').click(),resultSha256);
    await open('delivery');
    await download('named-handoff',()=>page.locator('[data-handoff="'+handoffId+'"]').click(),handoffSha256);
    await page.locator('#inspect-merchant').click();
    await page.waitForFunction(()=>document.querySelector('#merchant-state')?.textContent.includes('"running": false'));
    await page.locator('[data-start-merchant]').first().click();
    await page.waitForFunction(()=>document.querySelector('#merchant-state')?.textContent.includes('CHALLENGE_ONLY'));
    await page.locator('#stop-merchant').click();
    await page.waitForFunction(()=>document.querySelector('#merchant-state')?.textContent.includes('"running": false'));
    data.steps['original-seller-controls']={complete:true,mode:'CHALLENGE_ONLY'};save();
    await open('history',historicalRevision);
    need(await page.locator('.history-banner').isVisible(),'BROWSER_HISTORICAL_REVISION');
    await open('delivery',historicalRevision);
    need(await page.locator('form[data-action="create_handoff"] button[type="submit"]').isDisabled(),'BROWSER_HISTORICAL_MUTATION_ENABLED');
    await download('historical-named-handoff',()=>page.locator('[data-handoff="'+handoffId+'"]').click(),handoffSha256);
    await open('agents');
    for(const [width,height]of [[1440,1000],[390,844]]){
      await page.setViewportSize({width,height});
      for(const pane of PANES){
        await open(pane);
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
        need(!overflow,'BROWSER_HORIZONTAL_OVERFLOW_'+pane.toUpperCase());
        await snapshot('screenshots/'+width+'-'+pane+'.png');
      }
    }
    need(errors.length===0,'BROWSER_PAGE_ERRORS');
    await context.close();closed=true;
    data.finalCandidate={schema:SCHEMA,complete:true,completedAt:new Date().toISOString(),selection,workspaceId,projectId,
      revision:data.steps['project-review'].response?.revision??null,originalPost:data.steps['project-review'].wire.id,
      originalRevision:data.steps['project-review'].response?.revision??null,closed:true,
      files:Object.values(data.files).sort((a,b)=>a.path.localeCompare(b.path))};
    save();return verify();
  }finally{if(!closed)await context.close();}
}
