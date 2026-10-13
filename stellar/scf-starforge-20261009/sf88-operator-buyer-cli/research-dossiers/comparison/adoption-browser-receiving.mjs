// SPDX-License-Identifier: MIT
// Paired adoption browser receiving; caller owns original listener/browser lifetime.
import {mkdir,readFile,rename,open,link,unlink,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const SCHEMA='sf88-research-comparison-adoption-browser-receiving/v1';
const fail=(ok,message)=>{if(!ok)throw new Error(message);};
const json=v=>JSON.stringify(v,null,2)+'\n';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function maybe(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function syncDirectory(path){const h=await open(path,'r');try{await h.sync();}finally{await h.close();}}
async function save(path,value){const tmp=path+'.'+randomUUID()+'.tmp',h=await open(tmp,'wx',0o600);try{await h.writeFile(json(value));await h.sync();}finally{await h.close();}await rename(tmp,path);await syncDirectory(dirname(path));}
async function identity(path){const h=createHash('sha256');let bytes=0;for await(const b of createReadStream(path)){bytes+=b.length;h.update(b);}return {file:path,bytes,sha256:h.digest('hex')};}
async function retain(path,bytes){
  // A partial staging file is never the retained original name.
  const temporary=path+'.'+randomUUID()+'.tmp',h=await open(temporary,'wx',0o600);
  try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}
  try{await link(temporary,path);}catch(e){if(e.code!=='EEXIST')throw e;fail((await readFile(path)).equals(Buffer.from(bytes)),'Original browser file changed: '+path);}
  await syncDirectory(dirname(path));await unlink(temporary);return identity(path);
}

const pane=p=>p.locator('#view-comparison .comparison-adoption');
const button=(p,name)=>p.getByRole('button',{name,exact:true});
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
async function settle(p){
  await p.waitForFunction(()=>{const c=document.querySelector('#view-comparison'),a=c?.querySelector('.comparison-adoption');return c&&!c.hidden&&c.getAttribute('aria-busy')==='false'&&a?.getAttribute('aria-busy')==='false'&&a.querySelector('select');});
}
async function click(p,name){await button(pane(p),name).click();await settle(p);}
async function details(p,label){
  const d=pane(p).locator('details').filter({has:p.locator('summary').getByText(label,{exact:true})});
  fail(await d.count()===1,'Complete detail must be unique: '+label);await d.evaluate(e=>e.open=true);
  await d.locator('pre').waitFor();return JSON.parse(await d.locator('pre').textContent());
}
async function expose(p){
  const nodes=pane(p).locator('details');
  for(let i=0;i<await nodes.count();i++)if(await nodes.nth(i).isVisible())await nodes.nth(i).evaluate(e=>e.open=true);
}
async function overflow(p){
  return p.evaluate(()=>[...document.querySelectorAll('.comparison-adoption button,.comparison-adoption input,.comparison-adoption select,.comparison-adoption textarea')]
    .filter(e=>e.getClientRects().length&&!e.closest('.adoption-table')).map(e=>({label:e.getAttribute('aria-label')||e.textContent,rect:e.getBoundingClientRect()}))
    .filter(x=>x.rect.left < -1||x.rect.right > innerWidth+1).map(x=>({label:x.label,left:x.rect.left,right:x.rect.right})));
}
export async function reviewComparisonAdoptionBrowser({page,url,receipt,directory,reviewer,openReceived}){
  fail(page&&typeof openReceived==='function'&&receipt?.operationId&&receipt.dossierId&&receipt.browserSelection&&receipt.originalRun&&receipt.browserInterrupted,'Complete paired native adoption course required');
  fail(typeof reviewer==='string'&&reviewer.trim(),'Named actual reviewer required');
  directory=resolve(directory);await mkdir(directory,{recursive:true,mode:0o700});const output=join(directory,'files');await mkdir(output,{recursive:true,mode:0o700});
  const selection={schema:SCHEMA,operationId:receipt.operationId,dossierId:receipt.dossierId,source:receipt.browserSelection,originalRun:receipt.originalRun,
    interrupted:receipt.browserInterrupted,reviewer,fixture:'TRAINING FIXTURE: original software receiving source; no scientific evaluation'};
  const statePath=join(directory,'adoption-browser-progress.json'),original=await maybe(statePath);
  let state=original??{...selection,steps:{},files:[],screens:[],status:'IN_PROGRESS'};
  for(const [key,value]of Object.entries(selection))fail(same(state[key],value),'Original paired adoption selection changed: '+key);
  await retain(join(directory,'adoption-browser-intent.json'),Buffer.from(json(selection)));await save(statePath,state);
  for(const d of [...state.files,...state.screens]){const got=await identity(d.file);fail(got.bytes===d.bytes&&got.sha256===d.sha256,'Retained original browser output changed');}
  if(state.status==='COMPLETE_REQUIRES_VISUAL_INSPECTION'){await retain(join(directory,'adoption-browser-result.json'),Buffer.from(json(state)));return state;}
  const address=(base,id=receipt.dossierId)=>{const u=new URL(base),h=new URLSearchParams(u.hash.slice(1));h.set('dossier',id);h.set('view','comparison');u.hash=h.toString();return u.href;};
  async function capture(name,p=page){const file=join(output,name+'-attempt-'+randomUUID()+'.png'),d={name,...await retain(file,await p.screenshot({fullPage:true}))};state.screens.push(d);await save(statePath,state);}
  async function progress(name,value){state.steps[name]={...state.steps[name],...value};await save(statePath,state);return state.steps[name];}
  async function step(name,work){if(state.steps[name]?.complete)return state.steps[name];const value=await work(state.steps[name]??{});return progress(name,{...value,complete:true});}
  async function download(name,action,p=page,prepare=async()=>null){
    fail(/^[A-Za-z0-9_.-]+$/.test(name),'Unsafe receiving download name');
    const phase=join(output,'download-journals',name);await mkdir(phase,{recursive:true,mode:0o700});
    const binding={...selection,name},selectedPath=join(phase,'selected.json');
    await retain(join(phase,'intent.json'),Buffer.from(json(binding)));
    async function verifySelected(d){
      fail(JSON.stringify(d.binding)===JSON.stringify(binding),'Original download source/phase changed');
      fail(d.attemptDirectory===String(d.attempt).padStart(6,'0')+'-'+d.attemptId&&/^[0-9a-f-]{36}$/.test(d.attemptId),'Invalid retained download attempt');
      const file=join(phase,d.attemptDirectory,'complete-download');
      const actual=await identity(file);fail(actual.bytes===d.bytes&&actual.sha256===d.sha256,'First completed download changed');
      return {file,...actual};
    }
    let selected=await maybe(selectedPath);
    if(!selected){
      // Recover a fully fsynced original attempt before requesting another export.
      const attempts=(await readdir(phase)).filter(x=>/^\d{6}-[0-9a-f-]{36}$/.test(x)).sort();
      for(const dir of attempts){const completed=await maybe(join(phase,dir,'completed.json'));if(completed){await verifySelected(completed);selected=completed;break;}}
      if(!selected){
        const attempt=attempts.length?Number(attempts.at(-1).slice(0,6))+1:1,attemptId=randomUUID();
        fail(attempt<1000000,'Download attempt bound reached');
        const attemptDirectory=String(attempt).padStart(6,'0')+'-'+attemptId,folder=join(phase,attemptDirectory);
        await mkdir(folder,{mode:0o700});const generation=await prepare();await retain(join(folder,'intent.json'),Buffer.from(json({binding,attempt,attemptId,attemptDirectory,generation})));
        const event=p.waitForEvent('download');event.catch(()=>{});await action();const download=await event;
        fail(!await download.failure(),'Actual browser download failed');
        const file=join(folder,'complete-download');await download.saveAs(file);
        const handle=await open(file,'r');try{await handle.sync();}finally{await handle.close();}
        await syncDirectory(folder);
        const d=await identity(file);
        selected={binding,attempt,attemptId,attemptDirectory,generation,suggestedFilename:download.suggestedFilename(),bytes:d.bytes,sha256:d.sha256};
        await retain(join(folder,'completed.json'),Buffer.from(json(selected)));
      }
      await retain(selectedPath,Buffer.from(json(selected)));
    }
    const original=await verifySelected(selected),path=join(output,name);
    try{await link(original.file,path);}catch(e){if(e.code!=='EEXIST')throw e;const got=await identity(path);fail(got.bytes===selected.bytes&&got.sha256===selected.sha256,'Existing original download differs');}
    await syncDirectory(output);
    const item={name,suggestedFilename:selected.suggestedFilename,file:path,bytes:selected.bytes,sha256:selected.sha256,downloadReceipt:selectedPath,generation:selected.generation??null};
    const current=state.files.find(x=>x.name===name);
    if(current)fail(current.bytes===item.bytes&&current.sha256===item.sha256&&current.file===item.file&&JSON.stringify(current.generation??null)===JSON.stringify(item.generation),'Original journaled download changed');
    else{state.files.push(item);await save(statePath,state);}
    return current??item;
  }

  async function session(p,base,id=receipt.dossierId){
    const token=new URLSearchParams(new URL(base).hash.slice(1)).get('token');fail(token,'Original authenticated listener URL required');
    const response=await p.request.get(new URL('/api/state',base).href,{headers:{Authorization:'Bearer '+token}});
    fail(response.ok(),'Original authenticated workspace state unavailable');const s=await response.json();fail(s.workspaceId,'Original workspace ID missing');
    return{token,workspaceId:s.workspaceId,dossierId:id,base};
  }
  async function read(p,ctx,suffix){
    const response=await p.request.get(new URL('/api/dossiers/'+encodeURIComponent(ctx.dossierId)+suffix,ctx.base).href,
      {headers:{Authorization:'Bearer '+ctx.token,'X-Research-Workspace-Id':ctx.workspaceId}});
    fail(response.ok(),'Original adoption read failed '+response.status());return response.json();
  }
  async function copies(p,ctx){
    return p.evaluate(async context=>{
      const {openAdoptionWorkingStore}=await import('/comparison-adoption-store.js'),db=await openAdoptionWorkingStore(context);
      try{return(await db.list()).map(x=>x.snapshot);}finally{db.close();}
    },{workspaceId:ctx.workspaceId,dossierId:ctx.dossierId});
  }
  async function working(p,ctx){
    const id=await pane(p).getByLabel('Saved adoption working copies',{exact:true}).inputValue();fail(id,'No adoption working copy selected');
    return p.evaluate(async({context,id})=>{
      const {openAdoptionWorkingStore}=await import('/comparison-adoption-store.js'),db=await openAdoptionWorkingStore(context);
      try{const row=await db.read(id);if(!row)throw Error('Original adoption draft missing');return db.workingCopy(row.snapshot);}finally{db.close();}
    },{context:{workspaceId:ctx.workspaceId,dossierId:ctx.dossierId},id});
  }
  const record=(w,key)=>w.records.find(x=>x.id===w.draft[key])?.value??null;
  async function choose(p,id){await pane(p).getByLabel('Saved adoption working copies',{exact:true}).selectOption(id);await settle(p);fail(await pane(p).getByLabel('Saved adoption working copies',{exact:true}).inputValue()===id,'Original adoption draft not selected');}
  async function stableWorking(p,ctx,predicate){
    let selected;await p.waitForFunction(()=>document.querySelector('.comparison-adoption')?.getAttribute('aria-busy')==='false');
    for(let attempt=0;attempt<100;attempt++){
      selected=await working(p,ctx);if(predicate(selected))return selected;
      await p.waitForTimeout(50);
    }throw Error('Complete browser working copy did not retain the expected original generation');
  }
  async function fixturePage(base,portable,name){
    const got=await identity(portable.file);fail(got.bytes===portable.bytes&&got.sha256===portable.sha256,'Original portable fixture changed: '+name);
    const listener=await openReceived({directory:join(directory,name),portableFile:portable.file,operationId:receipt.operationId});
    fail(listener?.url,'Original received listener missing');listeners.push(listener);
    const p=await page.context().newPage();pages.push(p);p.on('pageerror',onError);await p.goto(listener.url);await p.locator('#portable-file').setInputFiles(portable.file);
    await p.waitForFunction(id=>!document.getElementById('dossier-workspace').hidden&&location.hash.includes(encodeURIComponent(id)),receipt.dossierId);
    await p.locator('#comparison-tab').click();await settle(p);return{p,ctx:await session(p,listener.url),listener};
  }
  async function workingDownload(p,ctx,name){
    const d=await download(name,()=>button(pane(p),'Download complete adoption working copy').click(),p,async()=>{
      const w=await working(p,ctx);return{workspaceId:ctx.workspaceId,dossierId:ctx.dossierId,draftId:w.draft.id,commitId:w.draft.commitId};
    });
    const w=JSON.parse(await readFile(d.file,'utf8'));fail(w.draft.id===d.generation.draftId&&w.draft.commitId===d.generation.commitId,'Original working-copy download generation changed');
    for(const r of w.records){const bytes=Buffer.from(JSON.stringify(canonical(r.value))+'\n');fail(bytes.length===r.bytes&&sha(bytes)===r.sha256,'Complete browser record changed');}
    return{descriptor:d,working:w};
  }
  async function receiveOriginal(p,ctx,prefix){
    let w=await working(p,ctx);fail(record(w,'request'),'Freeze original request before native receiving');const request=record(w,'request');
    await progress(prefix,{draftId:w.draft.id,request});
    const lookup=await read(p,ctx,'/comparison/adoption?requestId='+encodeURIComponent(request.requestId));
    if(!lookup.adoption&&!state.steps[prefix]?.interruptionObserved){
      let observing=null;const matcher='**/api/dossiers/'+encodeURIComponent(ctx.dossierId)+'/comparison/adoption/reviews*';
      const handler=async route=>{
        const posted=route.request().postDataJSON();if(!same(posted,request)){await route.continue();return;}
        const response=await route.fetch();fail(response.status()===200,'Original adoption first-response status changed');
        const result=await response.json();fail(result.requestId===request.requestId,'Intercepted another original adoption');
        observing=result;await progress(prefix,{interruptionObserved:true,observedResponse:result,httpStatus:response.status()});await route.abort('failed');
      };
      await p.route(matcher,handler);
      try{await button(pane(p),'Apply or receive original adoption').click();await settle(p);}
      finally{await p.unroute(matcher,handler);}
      if(observing)fail((await working(p,ctx)).draft.request===w.draft.request,'Lost response replaced the frozen request');
    }
    await click(p,'Apply or receive original adoption');w=await working(p,ctx);const received=record(w,'result');
    fail(received?.status==='COMPLETE'&&received.requestId===request.requestId&&same(received.plan.request,Object.fromEntries(Object.entries(request).filter(([key])=>key!=='previewSha256'))),'Original adoption did not complete under the frozen request');
    await click(p,'Apply or receive original adoption');w=await working(p,ctx);const replay=record(w,'result');
    fail(replay?.duplicate===true&&replay.status==='COMPLETE'&&same(replay.progress.operations,received.progress.operations),'Same original adoption did not replay its exact native prefix');
    const first=record(w,'receipt');fail(first?.status==='COMPLETE'&&first.requestId===request.requestId,'First original completed receipt missing');
    return{draftId:w.draft.id,request,result:received,replay,firstReceipt:first};
  }
  const pages=[],listeners=[],errors=[];const onError=e=>errors.push(String(e));page.on('pageerror',onError);let primary=null;
  try{
    await page.setViewportSize({width:1440,height:1000});await page.goto(address(url));await settle(page);const ctx=await session(page,url);
    const incoming=receipt.browserSelection;
    await step('original-browser-draft',async saved=>{
      const previous=saved.beforeDraftIds??(await copies(page,ctx)).map(d=>d.id);if(!saved.beforeDraftIds)await progress('original-browser-draft',{beforeDraftIds:previous});
      let drafts=(await copies(page,ctx)).filter(d=>!previous.includes(d.id)&&d.basis.sourceId===incoming.sourceId&&d.basis.caseVersionId===incoming.caseVersionId);
      fail(drafts.length<=1,'Multiple newly created drafts require explicit original-course reconciliation');
      if(!drafts.length){
        await pane(page).getByLabel('Retained returned source',{exact:true}).selectOption(incoming.sourceId);await click(page,'Inspect returned protocols');
        await pane(page).getByLabel('Exact incoming protocol',{exact:true}).selectOption(incoming.caseVersionId);await click(page,'Start review of this returned protocol');
        drafts=(await copies(page,ctx)).filter(d=>!previous.includes(d.id)&&d.basis.sourceId===incoming.sourceId&&d.basis.caseVersionId===incoming.caseVersionId);
      }
      fail(drafts.length===1,'Original browser draft was not retained');return{draftId:drafts[0].id,beforeDraftIds:previous};
    });
    await choose(page,state.steps['original-browser-draft'].draftId);
    await step('incomplete-and-ineligible-preview',async()=>{
      let w=await working(page,ctx);
      if(!w.draft.proposal){
        await pane(page).getByLabel('Accepting operator identifier',{exact:true}).fill('adoption-browser-reviewer');
        await pane(page).getByLabel('Accepting operator name',{exact:true}).fill(reviewer);
        await pane(page).getByLabel('Adoption review note',{exact:true}).fill('TRAINING FIXTURE — paired browser adoption '+receipt.operationId+'. Original source bytes and named reviews remain unchanged.');
        await pane(page).getByLabel('Returned record kind',{exact:true}).selectOption('decisions');
        for(const id of incoming.selection.decisionVersionIds)await pane(page).getByLabel('Select decisions '+id,{exact:true}).check();
        await stableWorking(page,ctx,x=>x.draft.form.actor.name===reviewer&&same(x.draft.form.selection.decisionVersionIds,[...incoming.selection.decisionVersionIds]));
      }
      w=await working(page,ctx);if(!w.draft.preview)await click(page,'Prepare complete adoption review');
      w=await working(page,ctx);const preview=record(w,'preview');
      fail(preview?.eligible===false&&preview.previewSha256===null&&preview.issues.some(x=>x.code==='ADOPTION_CANDIDATE_TARGET_REQUIRED'),'Missing explicit candidate destination was not rendered as an ineligible preview');
      fail(await button(pane(page),'Freeze this exact adoption request').isDisabled(),'Ineligible adoption could be frozen');
      await expose(page);await capture('desktop-ineligible-adoption');const saved=await workingDownload(page,ctx,'ineligible-working-copy.json');
      return{draftId:w.draft.id,preview,workingCopy:saved.descriptor};
    });
    await step('complete-reviewed-selection',async()=>{
      let w=await working(page,ctx);
      if(!record(w,'preview')?.eligible){
        await button(pane(page),'Include recorded dependencies of my selection').click();await settle(page);
        await pane(page).getByLabel('Author protocol destination',{exact:true}).selectOption('NEW_CASE');await settle(page);
        await click(page,'Prepare complete adoption review');w=await working(page,ctx);
      }
      const preview=record(w,'preview');fail(preview?.eligible&&preview.plan.steps.length===5,'Complete original five-record closure was not planned');
      fail(preview.plan.selection.runIds.includes(receipt.originalRun.runId),'Original run omitted from the reviewed closure');
      fail(preview.plan.source.id===incoming.sourceId&&preview.plan.case.versionId===incoming.caseVersionId,'Original returned protocol changed');
      await expose(page);await capture('desktop-complete-adoption-preview');const copy=await workingDownload(page,ctx,'reviewed-working-copy.json');
      return{draftId:w.draft.id,preview,workingCopy:copy.descriptor};
    });
    await step('frozen-request',async()=>{
      let w=await working(page,ctx);if(!w.draft.request)await click(page,'Freeze this exact adoption request');
      w=await working(page,ctx);const request=record(w,'request');fail(request?.previewSha256===state.steps['complete-reviewed-selection'].preview.previewSha256,'Original preview digest changed at freeze');
      const copy=await workingDownload(page,ctx,'frozen-working-copy.json');return{draftId:w.draft.id,request,workingCopy:copy.descriptor};
    });
    await step('original-adoption-and-replay',()=>receiveOriginal(page,ctx,'original-adoption-and-replay'));
    const accepted=state.steps['original-adoption-and-replay'].result;
    await choose(page,state.steps['original-adoption-and-replay'].draftId);
    await step('original-files-and-reports',async()=>{
      await pane(page).getByLabel('Returned record kind',{exact:true}).selectOption('runs');await settle(page);
      const raw=await download('returned-original-run.json',()=>button(pane(page),'Download original run '+receipt.originalRun.runId).click());
      fail(raw.bytes===receipt.originalRun.raw.bytes&&raw.sha256===receipt.originalRun.raw.sha256,'Original raw run changed');
      const rawValue=JSON.parse(await readFile(raw.file,'utf8'));fail(rawValue.kind==='TRAINING_FIXTURE','Browser input ceased to be the explicit software fixture');
      const members=[];for(let i=0;i<receipt.originalRun.artifacts.length;i++){
        const a=receipt.originalRun.artifacts[i],d=await download('returned-original-member-'+i+'.bin',()=>button(pane(page),'Download '+a.path).click());
        fail(d.bytes===a.bytes&&d.sha256===a.sha256,'Original returned artifact changed');members.push({...d,path:a.path});
      }
      const exports=[];
      for(const format of ['JSON','HTML','original source']){
        const d=await download('accepted-adoption-'+format.replaceAll(' ','-').toLowerCase()+'.bin',()=>button(pane(page),'Download adoption '+format).click(),page,
          async()=>{const w=await working(page,ctx),r=record(w,'result');return{planId:r.planId,revision:r.revision,source:r.plan.source};});
        if(format==='original source')fail(d.bytes===d.generation.source.bytes&&d.sha256===d.generation.source.sha256,'Whole original returned source changed');
        if(format==='JSON'){const value=JSON.parse(await readFile(d.file,'utf8'));fail(value.planId===accepted.planId&&same(value.progress.operations,accepted.progress.operations),'Adoption report omitted native receipts');}
        exports.push({format,...d});
      }
      return{raw,members,exports};
    });
    await step('accepted-working-copy-reopen',async()=>{
      const original=await workingDownload(page,ctx,'accepted-working-copy.json');
      await page.reload();await settle(page);await pane(page).getByLabel('Open complete adoption working copy',{exact:true}).setInputFiles(original.descriptor.file);await settle(page);
      const reopened=await working(page,ctx);fail(same(record(reopened,'request'),state.steps['frozen-request'].request)&&same(record(reopened,'receipt').progress.operations,accepted.progress.operations),'Complete working copy lost its original request or accepted receipts');
      await capture('desktop-reopened-adoption');
      await page.setViewportSize({width:390,height:844});await expose(page);await capture('phone-reopened-adoption');
      fail((await overflow(page)).length===0,'Adoption controls overflow 390px viewport');
      const tables=pane(page).locator('.adoption-table');for(let i=0;i<await tables.count();i++){await tables.nth(i).focus();await page.keyboard.press('ArrowRight');}
      await page.setViewportSize({width:1440,height:1000});return{workingCopy:original.descriptor,originalRequestId:record(reopened,'request').requestId,phoneWidth:390};
    });
    await step('accepted-author-portable',async()=>{
      await page.locator('#export-open').click();await page.locator('#export-format').selectOption('json');
      const d=await download('adoption-complete-author-dossier.json',()=>page.locator('#export-form button[type=submit]').click(),page,
        async()=>({planId:accepted.planId,requestId:accepted.requestId,acceptedOperations:accepted.progress.operations.map(x=>x.requestId)}));
      return{descriptor:d};
    });
    const cold=await fixturePage(url,state.steps['accepted-author-portable'].descriptor,'received-adoption-author');
    await step('cold-accepted-source-history',async()=>{
      const result=(await read(cold.p,cold.ctx,'/comparison/adoption?planId='+encodeURIComponent(accepted.planId))).adoption;
      fail(result?.status==='COMPLETE'&&same(result.plan,accepted.plan)&&same(result.progress.operations,accepted.progress.operations),'Cold dossier changed original plan or native receipts');
      await click(cold.p,'Refresh adoption inventory');await click(cold.p,'Inspect adoption '+accepted.planId);
      const exported=await download('cold-original-returned-source.bin',()=>button(pane(cold.p),'Download adoption original source').click(),cold.p);
      fail(exported.bytes===accepted.plan.source.bytes&&exported.sha256===accepted.plan.source.sha256,'Cold complete original source changed');
      const mapping=result.progress.mappings.find(x=>x.sourceKind==='cases');fail(mapping,'Cold accepted author case mapping missing');
      const selector=cold.p.locator('#view-comparison').getByLabel('Comparison case',{exact:true});await selector.selectOption(mapping.targetId);await settle(cold.p);
      await button(cold.p.locator('#view-comparison'),'Read comparison report').click();await settle(cold.p);
      const reportBox=cold.p.locator('[data-comparison-report]');await reportBox.waitFor();
      fail((await reportBox.innerText()).includes('1.2500')&&(await reportBox.innerText()).includes('Undefined:'),'Cold adopted report lost exact measured/undefined values');
      await capture('desktop-cold-adopted-report',cold.p);await cold.p.setViewportSize({width:390,height:844});await capture('phone-cold-adopted-report',cold.p);
      fail((await overflow(cold.p)).length===0,'Cold adoption controls overflow');return{planId:result.planId,originalSource:exported,authorCaseId:mapping.targetId};
    });
    await cold.p.close();pages.splice(pages.indexOf(cold.p),1);if(cold.listener.close)await cold.listener.close();listeners.splice(listeners.indexOf(cold.listener),1);
    const interrupted=await fixturePage(url,receipt.browserInterrupted.portable,'received-interrupted-adoption');
    await step('explicit-browser-continuation',async saved=>{
      const {p,ctx:c}=interrupted,prior=receipt.browserInterrupted;
      await click(p,'Refresh adoption inventory');
      let id=saved.draftId;
      if(!id){
        const before=saved.beforeDraftIds??(await copies(p,c)).map(d=>d.id);if(!saved.beforeDraftIds)await progress('explicit-browser-continuation',{beforeDraftIds:before});
        const candidates=(await copies(p,c)).filter(d=>!before.includes(d.id)&&d.form.continuationOf===prior.planId);
        fail(candidates.length<=1,'Multiple original continuation drafts require review');
        if(candidates.length)id=candidates[0].id;
        else{
          await click(p,'Inspect adoption '+prior.planId);const original=(await read(p,c,'/comparison/adoption?planId='+encodeURIComponent(prior.planId))).adoption;
          fail(original?.status==='NEEDS_REVIEW'&&same(original.progress.mappings,prior.acceptedMappings),'Original interrupted prefix changed');
          await click(p,'Review continuation of inspected adoption');id=(await working(p,c)).draft.id;
        }
        await progress('explicit-browser-continuation',{draftId:id});
      }
      await choose(p,id);let w=await working(p,c);
      if(!w.draft.proposal){
        await pane(p).getByLabel('Accepting operator identifier',{exact:true}).fill('adoption-continuation-reviewer');
        await pane(p).getByLabel('Accepting operator name',{exact:true}).fill(reviewer);
        await pane(p).getByLabel('Adoption review note',{exact:true}).fill('TRAINING FIXTURE — explicitly continue the retained accepted prefix after inspecting the unrelated author revision.');
        await click(p,'Prepare complete adoption review');w=await working(p,c);
      }
      const preview=record(w,'preview');fail(preview?.eligible&&preview.plan.steps.length===prior.remainingOperations&&preview.plan.request.continuationOf===prior.planId,'Continuation did not retain the original accepted prefix');
      for(const m of prior.acceptedMappings)fail(preview.plan.mappings.some(x=>x.sourceVersionId===m.sourceVersionId&&x.targetVersionId===m.targetVersionId&&x.mode==='ACCEPTED'),'Continuation replaced accepted mapping');
      if(!w.draft.request)await click(p,'Freeze this exact adoption request');
      const completed=await receiveOriginal(p,c,'browser-continuation-apply');
      await expose(p);await capture('desktop-reviewed-continuation',p);await p.setViewportSize({width:390,height:844});await capture('phone-reviewed-continuation',p);
      fail((await overflow(p)).length===0,'Continuation controls overflow');await p.setViewportSize({width:1440,height:1000});
      const original=(await read(p,c,'/comparison/adoption?planId='+encodeURIComponent(prior.planId))).adoption;
      fail(original.status==='SUPERSEDED'&&original.successorPlanId===completed.result.planId,'Original interrupted plan did not retain explicit successor lineage');
      return{...completed,originalPlanId:prior.planId,acceptedPrefix:prior.acceptedMappings,originalStatus:original.status};
    });
    await step('literal-generated-file-review',async()=>{
      const opened=[];
      for(const d of state.files.filter(x=>!x.name.includes('source.bin')&&!x.name.includes('original-source.bin'))){
        const p=await page.context().newPage();pages.push(p);
        try{
          if(d.name.includes('-html.'))await p.goto(pathToFileURL(d.file).href);
          else{
            const body=await readFile(d.file);let text;
            try{text=new TextDecoder('utf-8',{fatal:true}).decode(body);}catch{continue;}
            await p.setContent('<!doctype html><html lang="en"><meta charset="utf-8"><title>Complete original adoption output</title><body><h1></h1><pre style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></body></html>');
            await p.locator('h1').evaluate((e,s)=>e.textContent=s,d.name);await p.locator('pre').evaluate((e,s)=>e.textContent=s,text);
          }
          fail((await p.locator('body').innerText()).length>0,'Actual output did not open');await capture('opened-'+d.name.replace(/[^A-Za-z0-9_-]/g,'-'),p);opened.push({name:d.name,bytes:d.bytes,sha256:d.sha256});
        }finally{await p.close();pages.splice(pages.indexOf(p),1);}
      }
      return{opened,completePortableOpened:true,originalReturnedArchiveVerifiedAndInspectedByNativeSource:true};
    });
    fail(errors.length===0,'Original application errors: '+errors.join('; '));
    state.status='COMPLETE_REQUIRES_VISUAL_INSPECTION';state.literalInspection={status:'AWAITING_ACTUAL_REVIEWER_VIEW',
      instruction:'Personally open and use every complete final HTML/report, original file/archive, working copy, exported dossier and received project. View all desktop and 390px captures and record concrete findings. Screenshots and automated assertions alone are not rendered readiness.'};
    await save(statePath,state);await retain(join(directory,'adoption-browser-result.json'),Buffer.from(json(state)));return state;
  }catch(error){primary=error;try{await retain(join(directory,'adoption-browser-error-'+randomUUID()+'.json'),Buffer.from(json({schema:SCHEMA,operationId:receipt.operationId,message:error.message,stack:error.stack,steps:state.steps})));}catch(extra){throw new AggregateError([error,extra],'Original adoption failure and error retention failed',{cause:error});}throw error;}
  finally{
    page.off('pageerror',onError);const failures=[];
    for(const p of pages)try{await p.close();}catch(e){failures.push(e);}
    for(const listener of listeners.reverse())if(listener.close)try{await listener.close();}catch(e){failures.push(e);}
    if(failures.length)throw new AggregateError(primary?[primary,...failures]:failures,'Owned adoption receiving pages/listeners failed to close',{cause:primary??failures[0]});
  }
}
