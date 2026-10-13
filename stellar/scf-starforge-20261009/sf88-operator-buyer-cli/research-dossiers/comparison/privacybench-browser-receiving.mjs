// SPDX-License-Identifier: MIT
// Additive typed PrivacyBench chapter in the original owned foreground course.
import {mkdir,readFile,open,link,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {exportComparison} from './render.mjs';
import {preparePrivacyBenchReceiving,retainPrivacyBenchReturn,finishPrivacyBenchHandover,
 FIXTURE,REVIEW_CRITERION,json,sha,same,need,maybe,identity,retain,save,verifyFiles} from './privacybench-receiving.mjs';
const SCHEMA='sf88-privacybench-browser-receiving/v1';
const comparison=p=>p.locator('#view-comparison'),desk=p=>comparison(p).locator('.output-desk'),pane=p=>comparison(p).locator('.comparison-adoption');
const button=(p,name)=>p.getByRole('button',{name,exact:true});
const form=p=>comparison(p).locator('form[data-comparison-form]');
async function settle(p){
 await p.waitForFunction(()=>{const r=document.querySelector('#view-comparison'),d=r?.querySelector('.output-desk');return r&&!r.hidden&&r.getAttribute('aria-busy')==='false'&&d?.getAttribute('aria-busy')==='false';});
}
async function syncDirectory(path){const h=await open(path,'r');try{await h.sync();}finally{await h.close();}}
async function expose(p){for(const d of await comparison(p).locator('details').all())if(await d.isVisible())await d.evaluate(e=>e.open=true);}
async function overflow(p){return p.evaluate(()=>[...document.querySelectorAll('#view-comparison input,#view-comparison button,#view-comparison select,#view-comparison textarea')].filter(e=>e.getClientRects().length&&!e.closest('.output-table,.adoption-table,.comparison-table')).map(e=>({label:e.getAttribute('aria-label')||e.name||e.textContent,r:e.getBoundingClientRect()})).filter(x=>x.r.left< -1||x.r.right>innerWidth+1).map(x=>({label:x.label,left:x.r.left,right:x.r.right})));}
export async function reviewPrivacyBenchBrowser({page,url,receipt,directory,reviewer,python,openReceived}){
 need(page&&python&&typeof openReceived==='function','Original page, runtime and received-store opener required');
 directory=resolve(directory);await mkdir(directory,{recursive:true,mode:0o700});
 const prepared=await preparePrivacyBenchReceiving({directory:join(directory,'native'),receipt,reviewer});
 const selection={schema:SCHEMA,operationId:receipt.operationId,dossierId:receipt.dossierId,questionId:receipt.questionId,
  reviewer,source:prepared.source,fixture:prepared.fixture.selection.results};
 const statePath=join(directory,'privacybench-browser-progress.json'),output=join(directory,'files');await mkdir(output,{recursive:true,mode:0o700});
 let state=await maybe(statePath)??{...selection,steps:{},files:[],screens:[],status:'IN_PROGRESS'};
 for(const [k,v]of Object.entries(selection))need(same(state[k],v),'Original PrivacyBench chapter selection changed: '+k);
 await retain(join(directory,'privacybench-browser-intent.json'),json(selection));await save(statePath,state);
 await verifyFiles([...state.files,...state.screens]);
 if(state.status==='COMPLETE_REQUIRES_VISUAL_INSPECTION'){need(state.native?.status==='PRIVACYBENCH_NATIVE_RECEIVING_COMPLETE','Incomplete original native return');await verifyFiles(state.native.files);await retain(join(directory,'privacybench-browser-result.json'),json(state));return state;}
 async function progress(name,value){state.steps[name]={...state.steps[name],...value};await save(statePath,state);return state.steps[name];}
 async function step(name,work){if(state.steps[name]?.complete)return state.steps[name];return progress(name,{...await work(state.steps[name]??{}),complete:true});}
 async function capture(name,p=page){const d={name,...await retain(join(output,name+'-'+randomUUID()+'.png'),await p.screenshot({fullPage:true}))};state.screens.push(d);await save(statePath,state);}
 async function keep(name,body){const d={name,...await retain(join(output,name),body)},old=state.files.find(x=>x.name===name);
  if(old)need(old.bytes===d.bytes&&old.sha256===d.sha256,'Original chapter file changed');else{state.files.push(d);await save(statePath,state);}return old??d;}
  async function download(name,action,p=page,prepare=async()=>null){
    need(/^[A-Za-z0-9_.-]+$/.test(name),'Unsafe receiving download name');
    const phase=join(output,'download-journals',name);await mkdir(phase,{recursive:true,mode:0o700});
    const binding={...selection,name},selectedPath=join(phase,'selected.json');
    await retain(join(phase,'intent.json'),Buffer.from(json(binding)));
    async function verifySelected(d){
      need(JSON.stringify(d.binding)===JSON.stringify(binding),'Original download source/phase changed');
      need(d.attemptDirectory===String(d.attempt).padStart(6,'0')+'-'+d.attemptId&&/^[0-9a-f-]{36}$/.test(d.attemptId),'Invalid retained download attempt');
      const file=join(phase,d.attemptDirectory,'complete-download');
      const actual=await identity(file);need(actual.bytes===d.bytes&&actual.sha256===d.sha256,'First completed download changed');
      return {file,...actual};
    }
    let selected=await maybe(selectedPath);
    if(!selected){
      // Recover a fully fsynced original attempt before requesting another export.
      const attempts=(await readdir(phase)).filter(x=>/^\d{6}-[0-9a-f-]{36}$/.test(x)).sort();
      for(const dir of attempts){const completed=await maybe(join(phase,dir,'completed.json'));if(completed){await verifySelected(completed);selected=completed;break;}}
      if(!selected){
        const attempt=attempts.length?Number(attempts.at(-1).slice(0,6))+1:1,attemptId=randomUUID();
        need(attempt<1000000,'Download attempt bound reached');
        const attemptDirectory=String(attempt).padStart(6,'0')+'-'+attemptId,folder=join(phase,attemptDirectory);
        await mkdir(folder,{mode:0o700});const generation=await prepare();await retain(join(folder,'intent.json'),Buffer.from(json({binding,attempt,attemptId,attemptDirectory,generation})));
        const event=p.waitForEvent('download');event.catch(()=>{});await action();const download=await event;
        need(!await download.failure(),'Actual browser download failed');
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
    try{await link(original.file,path);}catch(e){if(e.code!=='EEXIST')throw e;const got=await identity(path);need(got.bytes===selected.bytes&&got.sha256===selected.sha256,'Existing original download differs');}
    await syncDirectory(output);
    const item={name,suggestedFilename:selected.suggestedFilename,file:path,bytes:selected.bytes,sha256:selected.sha256,downloadReceipt:selectedPath,generation:selected.generation??null};
    const current=state.files.find(x=>x.name===name);
    if(current)need(current.bytes===item.bytes&&current.sha256===item.sha256&&current.file===item.file&&JSON.stringify(current.generation??null)===JSON.stringify(item.generation),'Original journaled download changed');
    else{state.files.push(item);await save(statePath,state);}
    return current??item;
  }

 const address=(base,id=receipt.dossierId)=>{const u=new URL(base),q=new URLSearchParams(u.hash.slice(1));q.set('dossier',id);q.set('view','comparison');u.hash=q.toString();return u.href;};
 async function session(p,base){
  const token=new URLSearchParams(new URL(base).hash.slice(1)).get('token');need(token,'Original authenticated URL required');
  const r=await p.request.get(new URL('/api/state',base).href,{headers:{Authorization:'Bearer '+token}});need(r.ok(),'Original workspace state unavailable');
  const s=await r.json();need(s.workspaceId,'Original workspace ID unavailable');return{base,token,workspaceId:s.workspaceId,dossierId:receipt.dossierId};
 }
 async function request(ctx,suffix,body,p=page){
  const options={headers:{Authorization:'Bearer '+ctx.token,'X-Research-Workspace-Id':ctx.workspaceId}};
  const u=new URL('/api/dossiers/'+encodeURIComponent(ctx.dossierId)+suffix,ctx.base).href;
  const response=body===undefined?await p.request.get(u,options):await p.request.post(u,{...options,data:body});
  need(response.ok(),'Original request failed '+response.status()+' '+suffix);return response.json();
 }
 async function readSaved(p,id,databaseName){
  return p.evaluate(async({id,databaseName})=>{const {openProtocolDraftStore}=await import('/study-protocol-storage.js');
   const db=await openProtocolDraftStore(databaseName?{databaseName}:undefined);try{return(await db.read(id))?.snapshot??null;}finally{db.close();}}, {id,databaseName});
 }
 async function allCopies(p,prefix,databaseName){
  return p.evaluate(async({prefix,databaseName})=>{const {openProtocolDraftStore}=await import('/study-protocol-storage.js');
   const db=await openProtocolDraftStore(databaseName?{databaseName}:undefined);try{return(await db.listPrefix(prefix)).map(x=>x.snapshot);}finally{db.close();}}, {prefix,databaseName});
 }
 async function stable(fn,predicate){for(let i=0;i<100;i++){const value=await fn();if(predicate(value))return value;await page.waitForTimeout(50);}throw Error('Original browser write did not settle');}
 async function click(root,name,p=page){await button(root,name).click();await settle(p);}
 const outputDB='sf88-original-output-drafts';
 async function outputCurrent(p=page){
  const id=await desk(p).getByLabel('Saved original-output working copies',{exact:true}).inputValue();need(id,'Original output draft required');
  const d=await stable(()=>readSaved(p,id,outputDB),x=>Boolean(x));
  need(d.dossierId===receipt.dossierId&&d.caseVersionId===state.steps.protocol.record.versionId,'Wrong original output protocol');return d;
 }
 const record=async id=>(await readSaved(page,id,outputDB))?.value;
 async function outputOpen(id){await desk(page).getByLabel('Saved original-output working copies',{exact:true}).selectOption(id);await settle(page);need((await outputCurrent()).id===id,'Original output identity changed');}
 async function selectProtocol(p=page,caseId=state.steps.protocol.record.id,version=state.steps.protocol.record.versionId){
  await comparison(p).getByLabel('Comparison case',{exact:true}).selectOption(caseId);await settle(p);
  await comparison(p).getByLabel('Protocol edition',{exact:true}).selectOption(version);await settle(p);
 }
 async function workingDownload(name){
  const d=await download(name,()=>button(desk(page),'Download complete working copy').click(),page,async()=>{const w=await outputCurrent();return{draftId:w.id,commitId:w.commitId};});
  const value=JSON.parse(await readFile(d.file,'utf8'));need(value.workingCopy.id===d.generation.draftId&&value.workingCopy.commitId===d.generation.commitId,'First downloaded working-copy generation changed');
  for(const f of value.files){const b=Buffer.from(f.bodyBase64,'base64');need(b.length===f.bytes&&sha(b)===f.sha256,'Complete working-copy file changed');}
  for(const f of value.workingCopy.files)need(value.files.some(x=>x.id===f.id&&x.sha256===f.sha256&&x.bytes===f.bytes),'Working-copy source omitted');
  return{descriptor:d,value};
 }
 async function outputPhase(phase,ctx){
  return step('output-'+phase,async saved=>{
   await selectProtocol();await outputOpen(state.steps.intake.draftId);let d=await outputCurrent();
   let attempt=d.attempts.find(a=>a.phase===phase&&!a.superseded);need(d.attempts.filter(a=>a.phase===phase&&!a.superseded).length<=1,'Ambiguous original command');
   if(!attempt){await click(desk(page),phase==='candidate'?'Freeze and prepare candidate request':'Prepare original output import');d=await outputCurrent();attempt=d.attempts.find(a=>a.phase===phase&&!a.superseded);}
   need(attempt,'Original command was not retained');const original=await record(attempt.command);
   if(saved.request)need(same(saved.request,original),'Retained request changed');
   await progress('output-'+phase,{request:original,draftId:d.id});await keep('privacybench-'+phase+'-request.json',json(original));
   await workingDownload('privacybench-frozen-'+phase+'.json');
   if(!attempt.receipt&&!state.steps['output-'+phase].dispatchIntended){
    await progress('output-'+phase,{dispatchIntended:true});
    const handler=async route=>{
     need(same(route.request().postDataJSON(),original),'Unexpected original request intercepted');
     const response=await route.fetch(),body=await response.json();
     await progress('output-'+phase,{observedReturn:{status:response.status(),body}});
     if(phase==='candidate'&&[200,201].includes(response.status())){await route.abort('failed');await progress('output-'+phase,{lostReplyObserved:true});}
     else await route.fulfill({response});
    };
    await page.route('**/comparison/reviews?**',handler,{times:1});
    try{await click(desk(page),'Apply or receive original '+phase);}finally{await page.unroute('**/comparison/reviews?**',handler);}
   }
   d=await outputCurrent();attempt=d.attempts.find(a=>a.id===original.requestId);
   if(!attempt.receipt){
    await page.reload();await settle(page);await selectProtocol();await outputOpen(d.id);
    need(same(await record(attempt.command),original),'Reload replaced original pending request');
    await click(desk(page),'Apply or receive original '+phase);d=await outputCurrent();attempt=d.attempts.find(a=>a.id===original.requestId);
   }
   need(attempt.receipt,'Original accepted receipt missing');const operation=await record(attempt.receipt);
   const before=(await request(ctx,'/comparison?section=overview')).revision;
   const replay=await request(ctx,'/comparison/reviews?projection=metadata',original);
   need(same(replay.operation,operation)&&(await request(ctx,'/comparison?section=overview')).revision===before,'Exact original replay changed current dossier head');
   const acceptedCopy=await workingDownload('privacybench-accepted-'+phase+'.json');
   return{request:original,operation,record:operation.record,workingCopy:acceptedCopy.descriptor};
  });
 }
 async function adoptionCurrent(ctx,p=page){
  const id=await pane(p).getByLabel('Saved adoption working copies',{exact:true}).inputValue();need(id,'Original adoption working copy required');
  return p.evaluate(async({ctx,id})=>{const {openAdoptionWorkingStore}=await import('/comparison-adoption-store.js'),db=await openAdoptionWorkingStore({workspaceId:ctx.workspaceId,dossierId:ctx.dossierId});
   try{const row=await db.read(id);if(!row)throw Error('Original adoption missing');return db.workingCopy(row.snapshot);}finally{db.close();}},{ctx,id});
 }
 const adoptedRecord=(w,key)=>w.records.find(r=>r.id===w.draft[key])?.value??null;
 const pages=[],listeners=[],errors=[];const onError=e=>errors.push(String(e));page.on('pageerror',onError);let primary=null;
 try{
  await page.setViewportSize({width:1440,height:1000});await page.goto(address(url));await settle(page);const ctx=await session(page,url);
  const protocol=await step('protocol',async saved=>{
   const prefix='comparison:'+ctx.workspaceId+':'+ctx.dossierId+':';
   const before=saved.beforeIds??(await allCopies(page,prefix)).map(d=>d.id);
   if(!saved.beforeIds)await progress('protocol',{beforeIds:before});
   let draft=saved.draftId?await readSaved(page,saved.draftId):null;
   if(!draft){
    let added=(await allCopies(page,prefix)).filter(d=>!before.includes(d.id)&&d.protocolPreparationSource?.profile==='native-results-5dfcaf57');
    need(added.length<=1,'Another new protocol requires explicit reconciliation');
    if(!added.length){await click(comparison(page),'Prepare PrivacyBench protocol');added=(await allCopies(page,prefix)).filter(d=>!before.includes(d.id)&&d.protocolPreparationSource?.profile==='native-results-5dfcaf57');}
    need(added.length===1,'Typed native protocol was not retained');draft=added[0];await progress('protocol',{draftId:draft.id});
   }
   await comparison(page).getByLabel('Saved comparison working copies',{exact:true}).selectOption(draft.id);await settle(page);
   if(!draft.request){
    const f=form(page),p=prepared.fixture.selection.protocol;
    await f.locator('[name=title]').fill(p.title);await f.locator('[name=questionId]').selectOption(receipt.questionId);
    await f.locator('[name=purpose]').fill(p.purpose);await f.locator('[name=scope]').fill(p.scope);
    const rows=f.locator('[data-criterion-row]');
    const existing=await rows.locator('[name=criterionId]').evaluateAll(es=>es.map(e=>e.value));
    need(existing.length===8||existing.length===9,'Original criterion inventory changed');
    if(existing.length===8)await button(f,'Add criterion').click();
    const row=f.locator('[data-criterion-row]').last();
    for(const [key,name]of Object.entries({id:'criterionId',label:'criterionLabel',kind:'criterionKind',unit:'criterionUnit',direction:'criterionDirection',description:'criterionDescription'})){
     const e=row.locator('[name='+name+']');if(['kind','direction'].includes(key))await e.selectOption(REVIEW_CRITERION[key]);else await e.fill(REVIEW_CRITERION[key]);
    }
    await f.locator('[name=actorId]').fill('privacybench-course-operator');await f.locator('[name=actorName]').fill(reviewer);
    await click(f,'Prepare complete request');draft=await readSaved(page,draft.id);
   }
   need(draft.request?.action==='case.save'&&draft.request.payload.definition.criteria.length===9,'Complete native protocol and separate judgment required');
   await keep('privacybench-protocol-request.json',json(draft.request));
   if(!draft.result){await click(form(page),'Apply or receive this original request');draft=await readSaved(page,draft.id);}
   need(draft.result?.operation,'Original case acceptance missing');
   const beforeRevision=(await request(ctx,'/comparison?section=overview')).revision;
   const replay=await request(ctx,'/comparison/reviews?projection=metadata',draft.request);
   need(same(replay.operation,draft.result.operation)&&(await request(ctx,'/comparison?section=overview')).revision===beforeRevision,'Case replay altered current head');
   return{draftId:draft.id,request:draft.request,operation:draft.result.operation,record:draft.result.operation.record};
  });
  await selectProtocol();
  const intake=await step('intake',async saved=>{
   const prefix='output:'+ctx.workspaceId+':'+ctx.dossierId+':';
   const before=saved.beforeIds??(await allCopies(page,prefix,outputDB)).map(d=>d.id);
   if(!saved.beforeIds)await progress('intake',{beforeIds:before});
   let d=saved.draftId?await readSaved(page,saved.draftId,outputDB):null;
   if(!d){
    let added=(await allCopies(page,prefix,outputDB)).filter(x=>!before.includes(x.id)&&x.providerDraft&&x.caseVersionId===protocol.record.versionId);
    need(added.length<=1,'Ambiguous new provider working copy');
    if(!added.length){await click(desk(page),'New PrivacyBench native result');added=(await allCopies(page,prefix,outputDB)).filter(x=>!before.includes(x.id)&&x.providerDraft&&x.caseVersionId===protocol.record.versionId);}
    need(added.length===1,'Original provider copy missing');d=added[0];await progress('intake',{draftId:d.id});
   }
   await outputOpen(d.id);
   if(!d.providerDraft.generated){
    if(!d.providerDraft.results){await desk(page).getByLabel('Select PrivacyBench native results.json',{exact:true}).setInputFiles(prepared.files[0].file);await settle(page);}
    const s=prepared.fixture.selection;
    const values={datasetId:s.dataset.id,datasetRevision:s.dataset.revision,cohortRef:s.cohortRef,protocolId:s.run.input.protocolId,
     candidateName:s.candidate.name,candidateVersion:s.candidate.version,candidateKind:s.candidate.kind,candidateDescription:s.candidate.description,
     externalRunId:s.run.externalRunId,runKind:s.run.kind,runStatus:s.run.status,startedAt:s.run.startedAt,finishedAt:s.run.finishedAt,elapsedMs:'0',
     engineName:s.run.engine.name,engineVersion:s.run.engine.version,engineCommand:'',limitations:s.run.limitations.join('\n'),reviewer,
     candidateConfiguration:JSON.stringify(s.candidate.configuration),runtime:JSON.stringify({actualExecution:false,fixture:true}),inputDefinition:JSON.stringify(s.run.input.definition),sourceRefs:'[]'};
    await expose(page);
    for(const [key,value]of Object.entries(values)){const e=desk(page).locator('[data-privacybench-field="'+key+'"]');
     if(await e.evaluate(e=>e.tagName)==='SELECT')await e.selectOption(value);else await e.fill(value);}
    await click(desk(page),'Reopen saved browser work');d=await outputCurrent();
    const missing=prepared.files.slice(1).filter(f=>!d.providerDraft.originals.some(x=>x.sha256===f.sha256&&x.bytes===f.bytes));
    if(missing.length){
     const inputs=[];for(const x of missing)inputs.push({name:x.name,mimeType:x.mimeType,buffer:await readFile(x.file)});
     await desk(page).getByLabel('Add original PrivacyBench summary, viewer or configuration files',{exact:true}).setInputFiles(inputs);await settle(page);
    }
    d=await outputCurrent();if(!d.providerProfile)await click(desk(page),'Read native result and complete metric groups');
    d=await outputCurrent();const profile=await record(d.providerProfile);
    need(profile.metricRows===34&&profile.rows.length===34&&profile.rows.some(x=>x.value==='0.5000')&&profile.rows.some(x=>x.denominator_value==='0'),'Original complete metric groups or numeric text changed');
    await download('privacybench-native-source-review.json',()=>button(desk(page),'Download complete native-source review').click());
    const region=desk(page).getByRole('region',{name:'Original PrivacyBench metric groups',exact:true});
    let offset=0;
    while(offset<profile.rows.length){
     const rows=region.locator('tbody tr');need(await rows.count()===Math.min(25,profile.rows.length-offset),'Native group page incomplete');
     for(let i=0;i<await rows.count();i++)need((await rows.nth(i).innerText()).includes(profile.rows[offset+i].source_pointer),'Original metric order/source changed');
     await capture('privacybench-native-groups-'+offset);
     offset+=25;if(offset<profile.rows.length)await click(desk(page),'Next metrics');
    }
    await desk(page).getByLabel('Search PrivacyBench original metric rows',{exact:true}).fill('fixture/person~1');
    need(await region.locator('tbody tr').count()===5,'Complete character subgroup search changed');
    await desk(page).getByLabel('Search PrivacyBench original metric rows',{exact:true}).fill('');
    await desk(page).getByLabel('Operator identifier',{exact:true}).fill('privacybench-course-operator');
    await desk(page).getByLabel('Operator name',{exact:true}).fill(reviewer);
    await click(desk(page),'Prepare complete native intake for this saved protocol');
    d=await outputCurrent();
   }
   const review=await record(d.preparation),provider=await record(d.providerPrepared);
   need(d.providerDraft.generated&&review?.review.status==='READY'&&review.review.coverage.sourceRows===34&&provider.review.coverage.sourceRows===34,'Complete original preparation missing');
   for(const original of prepared.files)need(d.files.some(x=>x.bytes===original.bytes&&x.sha256===original.sha256),'Generated intake lost original file');
   need(d.plan.protocol.criteria.length===9&&d.plan.originals.some(x=>x.path.endsWith('viewer.fixture.html')),'Separate review criterion or HTML original extension changed');
   await capture('privacybench-prepared-desktop');await page.setViewportSize({width:390,height:844});await capture('privacybench-prepared-phone');
   need((await overflow(page)).length===0,'Typed PrivacyBench controls overflow at 390px');await page.setViewportSize({width:1440,height:1000});
   return{draftId:d.id,preparationId:d.preparation,rawIdentity:review.rawIdentity,providerRequest:d.providerRequest,files:d.files};
  });

  await outputOpen(intake.draftId);
  await step('prepared-working-copy-reopen',async()=>{
   const first=await workingDownload('privacybench-prepared-working-copy.json');
   await page.reload();await settle(page);await selectProtocol();await outputOpen(intake.draftId);
   let d=await outputCurrent();
   need(d.providerRequest?.requestId===intake.providerRequest.requestId&&d.preparation===intake.preparationId,'Reload lost exact provider request/preparation');
   await desk(page).getByLabel('Open complete output working copy',{exact:true}).setInputFiles(first.descriptor.file);await settle(page);d=await outputCurrent();
   need(d.id===intake.draftId&&d.providerRequest.requestId===intake.providerRequest.requestId&&d.preparation===intake.preparationId,'Original full working-copy reopen changed basis');
   return{workingCopy:first.descriptor,draftId:d.id};
  });
  await outputPhase('candidate',ctx);await outputPhase('run',ctx);
  await outputOpen(intake.draftId);
  await step('accepted-working-copy-reopen',async()=>{
   const first=await workingDownload('privacybench-complete-working-copy.json');
   await page.reload();await settle(page);await selectProtocol();await outputOpen(intake.draftId);
   await desk(page).getByLabel('Open complete output working copy',{exact:true}).setInputFiles(first.descriptor.file);await settle(page);
   const d=await outputCurrent();need(d.frozen&&d.id===intake.draftId&&same(d.candidateResult.operation,state.steps['output-candidate'].operation)&&same(d.runResult.operation,state.steps['output-run'].operation),'Full accepted working copy lost original receipts');
   await capture('privacybench-accepted-desktop');await page.setViewportSize({width:390,height:844});await capture('privacybench-accepted-phone');
   need((await overflow(page)).length===0,'Accepted working-copy controls overflow');await page.setViewportSize({width:1440,height:1000});
   return{workingCopy:first.descriptor};
  });
  const run=state.steps['output-run'].record;
  await step('accepted-reports-and-originals',async()=>{
   await selectProtocol();await comparison(page).getByLabel('Comparison records',{exact:true}).selectOption('runs');await settle(page);
   const row=comparison(page).locator('tr').filter({has:page.locator('td:nth-child(2)').getByText(run.id,{exact:true})});need(await row.count()===1,'Original accepted run missing');
   const raw=await download('privacybench-accepted-run.json',()=>button(row,'Download complete original run').click());
   need(raw.bytes===intake.rawIdentity.bytes&&raw.sha256===intake.rawIdentity.sha256,'Accepted original prepared envelope changed');
   const model=JSON.parse(await readFile(raw.file,'utf8'));need(model.kind==='TRAINING_FIXTURE'&&model.metrics.length===34&&model.metrics.filter(m=>m.value==='0.5000').length===3,'Exact literal groups changed');
   const members=[];
   for(let i=0;i<model.artifacts.length;i++){
    const a=model.artifacts[i],d=await download('privacybench-original-'+String(i).padStart(3,'0')+'.bin',()=>button(row,'Download '+a.path).click());
    need(d.bytes===a.bytes&&d.sha256===a.sha256&&Buffer.from(a.bodyBase64,'base64').equals(await readFile(d.file)),'Original retained artifact changed');
    members.push({...d,path:a.path,mediaType:a.mediaType});
   }
   const reports=[];
   for(const format of ['html','json','csv']){
    const d=await download('privacybench-comparison.'+format,()=>button(comparison(page),'Download '+format.toUpperCase()).click(),page,async()=>{
     await click(comparison(page),'Read comparison report');
     const displayed=JSON.parse(await comparison(page).locator('[data-comparison-report] details').filter({has:page.locator('summary').getByText('Complete case report and source identities',{exact:true})}).locator('pre').textContent());
     need(displayed.case.versionId===protocol.record.versionId&&displayed.runs.some(x=>x.id===run.id),'Displayed source/protocol changed');
     return{format,report:displayed};
    });
    const expected=exportComparison(d.generation.report,{format});need(d.bytes===expected.bytes&&d.sha256===expected.sha256,'Report differs from its displayed generation');reports.push(d);
   }
   await click(comparison(page),'Read comparison report');await comparison(page).locator('[data-comparison-report]').waitFor();
   need((await comparison(page).locator('[data-comparison-report]').innerText()).includes('0.5000'),'Visible scientific report lost original decimal');
   await capture('privacybench-measured-report-desktop');await page.setViewportSize({width:390,height:844});await capture('privacybench-measured-report-phone');
   need((await overflow(page)).length===0,'Measured report controls overflow');await page.setViewportSize({width:1440,height:1000});
   return{raw,members,reports};
  });
  const accepted={caseId:protocol.record.id,caseVersionId:protocol.record.versionId,
   candidateVersionId:state.steps['output-candidate'].record.versionId,runId:run.id,
   revision:state.steps['output-run'].operation.dossierRevision,raw:intake.rawIdentity};
  const returned=await retainPrivacyBenchReturn({prepared,accepted});
  await step('returned-source',async()=>{
   await verifyFiles(returned.files);
   for(const d of returned.files){if(!state.files.some(x=>x.file===d.file))state.files.push({name:'returned-'+d.file.split('/').at(-1),...d});}
   await save(statePath,state);return{sourceId:returned.source.id,judgmentVersionId:returned.judgment.versionId,returned:returned.returned};
  });
  await page.goto(address(url));await settle(page);
  await page.waitForFunction(()=>document.querySelector('.comparison-adoption')?.getAttribute('aria-busy')==='false');
  await click(pane(page),'Refresh adoption inventory');
  const adopt=await step('returned-review-adoption',async saved=>{
   async function copies(){return page.evaluate(async ctx=>{const {openAdoptionWorkingStore}=await import('/comparison-adoption-store.js'),db=await openAdoptionWorkingStore({workspaceId:ctx.workspaceId,dossierId:ctx.dossierId});try{return(await db.list()).map(x=>x.snapshot);}finally{db.close();}},ctx);}
   const before=saved.beforeIds??(await copies()).map(d=>d.id);if(!saved.beforeIds)await progress('returned-review-adoption',{beforeIds:before});
   let id=saved.draftId;
   if(!id){
    let added=(await copies()).filter(d=>!before.includes(d.id)&&d.basis.sourceId===returned.source.id&&d.basis.caseVersionId===protocol.record.versionId);
    need(added.length<=1,'Ambiguous original returned-review copy');
    if(!added.length){
     await pane(page).getByLabel('Retained returned source',{exact:true}).selectOption(returned.source.id);await click(pane(page),'Inspect returned protocols');
     await pane(page).getByLabel('Exact incoming protocol',{exact:true}).selectOption(protocol.record.versionId);await click(pane(page),'Start review of this returned protocol');
     added=(await copies()).filter(d=>!before.includes(d.id)&&d.basis.sourceId===returned.source.id&&d.basis.caseVersionId===protocol.record.versionId);
    }
    need(added.length===1,'Original returned-review copy missing');id=added[0].id;await progress('returned-review-adoption',{draftId:id});
   }
   await pane(page).getByLabel('Saved adoption working copies',{exact:true}).selectOption(id);await settle(page);
   let w=await adoptionCurrent(ctx);
   if(!w.draft.proposal){
    await pane(page).getByLabel('Accepting operator identifier',{exact:true}).fill('privacybench-course-accepting-operator');
    await pane(page).getByLabel('Accepting operator name',{exact:true}).fill(reviewer);
    await pane(page).getByLabel('Adoption review note',{exact:true}).fill(FIXTURE+'. Reviewed exact contributor source and named source-custody judgment; this creates explicit author records.');
    await pane(page).getByLabel('Returned record kind',{exact:true}).selectOption('judgments');await settle(page);
    await pane(page).getByLabel('Select judgments '+returned.judgment.versionId,{exact:true}).check();
    await stable(()=>adoptionCurrent(ctx),x=>x.draft.form.selection.judgmentVersionIds.includes(returned.judgment.versionId));
    await click(pane(page),'Include recorded dependencies of my selection');
    await pane(page).getByLabel('Author protocol destination',{exact:true}).selectOption('NEW_CASE');await settle(page);
    await click(pane(page),'Prepare complete adoption review');w=await adoptionCurrent(ctx);
   }
   const preview=adoptedRecord(w,'preview');need(preview?.eligible&&preview.plan.steps.length===4&&preview.plan.selection.runIds.includes(run.id),'Full returned case/candidate/run/review graph missing');
   if(!w.draft.request){await click(pane(page),'Freeze this exact adoption request');w=await adoptionCurrent(ctx);}
   const original=adoptedRecord(w,'request');need(original?.previewSha256===preview.previewSha256,'Original adoption preview binding changed');
   if(saved.request)need(same(saved.request,original),'Original adoption UUID/body changed');
   await progress('returned-review-adoption',{request:original});await keep('privacybench-adoption-request.json',json(original));
   if(!adoptedRecord(w,'receipt')){await click(pane(page),'Apply or receive original adoption');w=await adoptionCurrent(ctx);}
   const first=adoptedRecord(w,'receipt');need(first?.status==='COMPLETE'&&first.progress.completed===4,'Original returned review not accepted completely');
   const head=(await request(ctx,'/comparison?section=overview')).revision;
   await click(pane(page),'Apply or receive original adoption');w=await adoptionCurrent(ctx);const replay=adoptedRecord(w,'result');
   need(replay.duplicate&&same(replay.progress.operations,first.progress.operations)&&(await request(ctx,'/comparison?section=overview')).revision===head,'Original adoption replay altered current history');
   await capture('privacybench-adopted-review-desktop');await page.setViewportSize({width:390,height:844});await capture('privacybench-adopted-review-phone');
   need((await overflow(page)).length===0,'Returned-review controls overflow');await page.setViewportSize({width:1440,height:1000});
   return{draftId:id,request:original,result:first};
  });
  const native=await finishPrivacyBenchHandover({prepared,returned,adoption:adopt,python});
  await verifyFiles(native.files);
  state.native=native;await save(statePath,state);
  await step('adoption-reports-and-working-copy',async()=>{
   await pane(page).getByLabel('Saved adoption working copies',{exact:true}).selectOption(adopt.draftId);await settle(page);
   const d=await download('privacybench-adoption-working-copy.json',()=>button(pane(page),'Download complete adoption working copy').click());
   const incoming=JSON.parse(await readFile(d.file,'utf8'));need(same(adoptedRecord(incoming,'request'),adopt.request),'Adoption working copy omitted original request');
   await page.reload();await settle(page);await page.waitForFunction(()=>document.querySelector('.comparison-adoption')?.getAttribute('aria-busy')==='false');
   await pane(page).getByLabel('Open complete adoption working copy',{exact:true}).setInputFiles(d.file);await settle(page);
   const current=await adoptionCurrent(ctx);need(same(adoptedRecord(current,'request'),adopt.request)&&same(adoptedRecord(current,'receipt').progress.operations,adopt.result.progress.operations),'Adoption working-copy reopen changed retained operations');
   const reports=[];
   for(const format of ['JSON','HTML','original source']){
    const file=await download('privacybench-adoption-'+format.replaceAll(' ','-').toLowerCase()+'.bin',()=>button(pane(page),'Download adoption '+format).click(),page,async()=>{
     const w=await adoptionCurrent(ctx),r=adoptedRecord(w,'result');return{planId:r.planId,revision:r.revision,source:r.plan.source};
    });
    if(format==='original source')need(file.bytes===returned.returned.bytes&&file.sha256===returned.returned.sha256,'Full returned original archive changed');
    reports.push({format,...file});
   }
   return{workingCopy:d,reports};
  });
  const handover=native.handover;
  async function viewText(name,file,payload,{html=false}={}){
   const p=await page.context().newPage();pages.push(p);
   try{
    if(html){await p.goto('data:text/html;base64,'+payload.toString('base64'));await p.locator('body').waitFor();}
    else{const text=new TextDecoder('utf-8',{fatal:true}).decode(payload);await p.setContent('<!doctype html><html lang="en"><meta charset="utf-8"><title>Complete original receiving file</title><body><h1></h1><pre style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></body></html>');
     await p.locator('h1').evaluate((e,v)=>e.textContent=v,name);await p.locator('pre').evaluate((e,v)=>e.textContent=v,text);
     need(await p.locator('pre').textContent()===text,'Complete original text did not open');}
    need((await p.locator('body').innerText()).length>0,'Actual outgoing file did not open');
    await capture('opened-'+name.replace(/[^A-Za-z0-9_-]/g,'-'),p);
    if(html){await p.setViewportSize({width:390,height:844});await capture('opened-phone-'+name.replace(/[^A-Za-z0-9_-]/g,'-'),p);}
   }finally{await p.close();pages.splice(pages.indexOf(p),1);}
  }
  await step('literal-all-files-and-handover-members',async()=>{
   const opened=[],seen=new Set();
   // Open full source/supporting files, working copies, reports and exact plans.
   const members=state.steps['accepted-reports-and-originals'].members;
   for(const d of [...prepared.files,...state.files]){
    if(seen.has(d.sha256))continue;
    if(/\.gz$/.test(d.file)||d.name?.includes('original-source'))continue;
    const bytes=await readFile(d.file);need(bytes.length===d.bytes&&sha(bytes)===d.sha256,'Selected visible output changed');
    const a=members.find(x=>x.file===d.file),html=d.mimeType==='text/html'||a?.mediaType==='text/html'||d.name?.endsWith('.html')||d.name==='privacybench-adoption-html.bin';
    await viewText(d.name??d.file.split('/').at(-1),d.file,bytes,{html});seen.add(d.sha256);opened.push({file:d.file,bytes:d.bytes,sha256:d.sha256});
   }
   const inventory=[{path:'manifest.json',...handover.exported.manifest},...handover.exported.files];need(inventory.length===20,'Fixed full handover inventory changed');
   for(const row of inventory){
    const file=join(handover.membersDirectory,row.path),got=await identity(file);need(got.bytes===row.bytes&&got.sha256===row.sha256,'Extracted original member changed');
    if(['author.research.json.gz','returned.research.json'].includes(row.path))continue;
    const bytes=await readFile(file);await viewText('handover-'+row.path,file,bytes,{html:row.path==='adoption.html'});opened.push({path:row.path,...got});
   }
   return{opened,archive:handover.exported.archive,completeTwentyMembersExtracted:true};
  });
  await step('cold-author-and-contributor-projects',async()=>{
   const observations=[];
   for(const role of ['author','contributor']){
    const member=role==='author'?'author.research.json.gz':'returned.research.json',file=join(handover.membersDirectory,member);
    const d=handover.exported.files.find(x=>x.path===member);need(d,'Complete original project missing');
    const listener=await openReceived({directory:join(directory,'received-privacybench-'+role),portableFile:file,operationId:receipt.operationId});
    need(listener?.url,'Original received-project opener required');listeners.push(listener);
    const p=await page.context().newPage();pages.push(p);p.on('pageerror',onError);
    try{
     await p.goto(listener.url);await p.locator('#portable-file').setInputFiles(file);
     await p.waitForFunction(id=>location.hash.includes(encodeURIComponent(id))&&!document.getElementById('dossier-workspace').hidden,receipt.dossierId);
     await p.locator('#comparison-tab').click();await settle(p);const cold=await session(p,listener.url);
     const map=native.report.progress.mappings.find(x=>x.sourceKind==='cases');
     const selectedCase=role==='author'?map.targetId:protocol.record.id,selectedVersion=role==='author'?map.targetVersionId:protocol.record.versionId;
     await selectProtocol(p,selectedCase,selectedVersion);
     await click(comparison(p),'Read comparison report',p);
     const reportBox=comparison(p).locator('[data-comparison-report]');await reportBox.waitFor();
     need((await reportBox.innerText()).includes('0.5000'),'Cold native project lost original numeric text');
     const full=JSON.parse(await reportBox.locator('details').filter({has:p.locator('summary').getByText('Complete case report and source identities',{exact:true})}).locator('pre').textContent());
     const mappedRun=role==='author'?native.report.progress.mappings.find(x=>x.sourceKind==='runs').targetId:run.id;
     need(full.runs.some(x=>x.id===mappedRun)&&full.judgments.some(x=>x.definition.reviewer===reviewer+' — receiving contributor'),'Cold native project lost returned attribution');
     // Complete native raw/member equality was checked by the maintained handover
     // receiver; the browser also downloads the run through its actual UI.
     await comparison(p).getByLabel('Comparison records',{exact:true}).selectOption('runs');await settle(p);
     const row=comparison(p).locator('tr').filter({has:p.locator('td:nth-child(2)').getByText(mappedRun,{exact:true})});
     const downloaded=await download('privacybench-cold-'+role+'-run.json',()=>button(row,'Download complete original run').click(),p);
     need(downloaded.bytes===intake.rawIdentity.bytes&&downloaded.sha256===intake.rawIdentity.sha256,'Cold original run differs');
     await click(comparison(p),'Read comparison report',p);await reportBox.waitFor();await capture('privacybench-cold-'+role+'-desktop',p);
     await p.setViewportSize({width:390,height:844});await capture('privacybench-cold-'+role+'-phone',p);need((await overflow(p)).length===0,'Received project controls overflow');
     if(role==='author'){
      const got=await request(cold,'/comparison/adoption?planId='+encodeURIComponent(native.report.planId)+'&revision='+native.revision,undefined,p);
      need(same(got.adoption,native.report),'Cold complete adoption plan changed');
     }
     observations.push({role,member,bytes:d.bytes,sha256:d.sha256,caseId:selectedCase,caseVersionId:selectedVersion,runId:mappedRun,raw:downloaded});
    }finally{
     p.off('pageerror',onError);await p.close();pages.splice(pages.indexOf(p),1);
     if(listener.close)await listener.close();listeners.splice(listeners.indexOf(listener),1);
    }
   }
   return{projects:observations,firstArchive:handover.exported.archive};
  });
  need(errors.length===0,'Actual application errors: '+errors.join('; '));
  state.status='COMPLETE_REQUIRES_VISUAL_INSPECTION';
  state.literalInspection={status:'AWAITING_ACTUAL_REVIEWER_VIEW',instruction:'Personally open and use every final report, native original, working copy, full archive and received project. View the actual desktop and 390px product and all contained HTML/text files. Record visible findings. Automated assertions and screenshots alone do not establish rendered readiness.',fixture:FIXTURE};
  await save(statePath,state);await retain(join(directory,'privacybench-browser-result.json'),json(state));return state;
 }catch(error){primary=error;try{await retain(join(directory,'privacybench-error-'+randomUUID()+'.json'),json({schema:SCHEMA,operationId:receipt.operationId,message:error.message,stack:error.stack,steps:state.steps}));}catch(e){throw new AggregateError([error,e],'Original receiving and error retention failed',{cause:error});}throw error;}
 finally{
  page.off('pageerror',onError);const failures=[];
  for(const p of pages)try{await p.close();}catch(e){failures.push(e);}
  for(const listener of listeners.reverse())if(listener.close)try{await listener.close();}catch(e){failures.push(e);}
  if(failures.length)throw new AggregateError(primary?[primary,...failures]:failures,'Owned receiving pages/listeners failed to close',{cause:primary??failures[0]});
 }
}

