// MIT. Actual registered Grant Operations browser receiving; no substitute API.
import {readFile,mkdir,rename,open,stat,link,unlink} from 'node:fs/promises';
import {resolve,join,basename,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {readArchive} from './operations_material_catalogue_model.mjs';
const [inputPath,accessPath]=process.argv.slice(2);
const input=JSON.parse(await readFile(inputPath,'utf8')),access=JSON.parse(await readFile(accessPath,'utf8'));
const root=resolve(input.directory),out=join(root,'artifacts'),reportPath=join(root,'Material_Catalogue_Source_Desk_Browser.json');
await mkdir(out,{recursive:true,mode:0o700});
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const same=(a,b)=>canonical(a)===canonical(b);
const need=(v,m)=>{if(!v)throw Error(m);};
const pretty=v=>JSON.stringify(v,null,2)+'\n';
const exists=async p=>{try{return (await stat(p)).isFile();}catch(e){if(e.code==='ENOENT')return false;throw e;}};
async function syncDirectory(path){const h=await open(path,'r');try{await h.sync();}finally{await h.close();}}
async function publish(path,body,immutable){
 await mkdir(dirname(path),{recursive:true,mode:0o700});
 if(immutable&&await exists(path)){need((await readFile(path)).equals(Buffer.from(body)),'Preserve the exact original '+basename(path));return;}
 const temp=path+'.pending-'+randomUUID(),h=await open(temp,'wx',0o600);
 try{try{await h.writeFile(body);await h.sync();}finally{await h.close();}
  if(immutable){try{await link(temp,path);}catch(error){if(error.code!=='EEXIST')throw error;need((await readFile(path)).equals(Buffer.from(body)),'The original retained file changed.');}}
  else await rename(temp,path);
  await syncDirectory(dirname(path));
 }finally{await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
const replace=(path,body)=>publish(path,body,false),exact=(path,body)=>publish(path,body,true);
async function receipt(path){const b=await readFile(path);return {path,bytes:b.length,sha256:sha(b)};}
const report=await exists(reportPath)?JSON.parse(await readFile(reportPath,'utf8')):{schema:'stellar-forge.material-catalogue-source-desk-browser.v1',inputSha256:input.inputSha256,state:'PREPARED',originalInput:JSON.parse(JSON.stringify(input)),origin:access.origin,phases:{},artifacts:{},requests:{},session:null};
need(report.inputSha256===input.inputSha256&&same(report.originalInput,input)&&report.origin===access.origin,'Resume the same complete original source input, paths and receiving origin.');
need(same(JSON.parse(await readFile(input.documentPath,'utf8')),input.document),'The original Workshare document file differs from its complete input.');
if(input.supplierIntake){
 const spec=input.supplierIntake;need(['full','delta'].includes(spec.update?.mode)&&spec.connectionId&&spec.workspaceId&&/^[a-f0-9]{64}$/.test(spec.connectionSha256||''),'Retain the original explicit supplier connection and update semantics.');
 for(const role of ['full','update']){const f=spec[role],bytes=await readFile(f.path);need(bytes.length>0&&bytes.length<=16*1024*1024&&bytes.length===f.bytes&&sha(bytes)===f.sha256&&f.name&&f.format,'The complete original '+role+' supplier file changed.');}
 need(spec.mapping&&spec.updateMapping&&spec.title&&spec.tenantId&&spec.review?.actor&&spec.review?.note,'Retain both complete original mappings and the named source review.');
 report.supplierIntake??={steps:{},nativeRequests:[],sourceReview:cloneForReport(spec.review)};
}else need(sha(await readFile(input.handoverPath))===input.sourceSha256,'The original complete catalogue file differs from its selected hash.');
let saveTail=Promise.resolve(),context,page,failure,closed=false;
need(input.schema==='stellar-forge.material-catalogue-source-desk-input.v1','Use the complete original Material source desk input.');
function save(){const body=pretty(report);saveTail=saveTail.then(()=>replace(reportPath,body));return saveTail;}
async function remember(path){report.artifacts[relative(out,path)]=await receipt(path);await save();return path;}
async function keep(name,body){const path=join(out,name);await exact(path,body);return remember(path);}
const sessionKey='sf47.installations.'+input.caseId,prefix='/api/operations/'+input.caseId;
async function snapshot(){if(page&&!page.isClosed()){report.session=await page.evaluate(key=>sessionStorage.getItem(key),sessionKey);await save();}}
async function api(path,body){const response=await context.request.fetch(access.origin+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+access.token,'Content-Type':'application/json'},data:body===undefined?undefined:JSON.stringify(body)});const value=await response.json();need(response.ok(),value.message||value.error?.message||'Original native request failed.');return value;}
async function idle({allowError=false}={}){
 await page.waitForFunction(()=>document.querySelector('.material-catalogue-desk')?.getAttribute('aria-busy')!=='true'&&document.querySelector('.installation-desk')?.getAttribute('aria-busy')!=='true',null,{timeout:60000});
 const errors=await page.locator('.material-catalogue-desk [role="alert"],.installation-message[role="alert"]').allTextContents();
 if(!allowError)need(!errors.some(x=>x.trim()),errors.filter(Boolean).join('\n'));
}
async function click(action){await page.locator('[data-mc-action="'+action+'"]').click();await idle();await snapshot();}
async function stage(name,fn){if(report.phases[name])return;await fn();await snapshot();report.phases[name]={completedAt:new Date().toISOString()};await save();}
async function image(name){
 const path=join(out,name+'.png');if(!await exists(path))await page.screenshot({path,fullPage:true});await remember(path);
}
async function capture(name){
 await page.setViewportSize({width:1440,height:1000});await image(name+'-desktop');
 await page.setViewportSize({width:390,height:844});await image(name+'-narrow');
 need(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'The actual narrow page overflows horizontally.');
 await page.setViewportSize({width:1440,height:1000});
}
async function download(action,name,{target=page}={}){
 const path=join(out,name);
 if(await exists(path)){await remember(path);return path;}
 const pending=page.waitForEvent('download');await target.locator('[data-mc-action="'+action+'"]').click();await idle();await snapshot();const d=await pending;
 need(!await d.failure(),'The original full download failed.');await d.saveAs(path);return remember(path);
}
async function navigate(){
 await page.goto(access.origin+'/#access='+access.token,{waitUntil:'domcontentloaded'});
 await page.locator('#workbench').waitFor({state:'visible'});
 const plans=page.locator('#plan-select');if(await plans.inputValue()!==input.planId)await plans.selectOption(input.planId);
 await page.locator('[data-tab="operations"]').click();
 const cases=page.locator('select[name="caseSelect"]');await cases.waitFor({state:'visible'});
 if(await cases.inputValue()!==input.caseId)await cases.selectOption(input.caseId);
 need(await cases.inputValue()===input.caseId,'The browser selected another original case.');
 await page.locator('input[name="recordingActor"]').fill(input.actor);
 const nav=page.locator('[data-ops-navigation]'),toggle=nav.locator('[data-nav-toggle]');
 if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
 const group=nav.locator('details[data-nav-group]:has([data-nav-section="installations"])');
 if(await group.getAttribute('open')===null)await group.locator(':scope > summary').click();
 await group.locator('[data-nav-section="installations"]').click();await idle();
}
async function installationSession(){return page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)||'null'),sessionKey);}

async function gallery(){
 const images=Object.entries(report.artifacts).filter(([name])=>name.endsWith('.png'));
 const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 await replace(join(out,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Material source desk — actual receiving images</title><style>body{max-width:1440px;margin:24px auto;padding:0 16px;font:16px system-ui;color:#20272b}img{max-width:100%;border:1px solid #aeb6bc}figure{margin:32px 0}code{overflow-wrap:anywhere}</style><h1>Material source desk: actual receiving images</h1><p>Producer must open and LOOK at these exact images, operate the selected final product and repair concrete defects. Browser completion is separate from producer visual acceptance.</p>'+images.map(([name,v])=>'<figure><figcaption>'+esc(name)+' · <code>'+esc(v.sha256)+'</code></figcaption><img alt="'+esc(name)+'" src="'+esc(name)+'"></figure>').join(''));
}
async function viewedFile(path,{html=false,label}={}){
 const text=await readFile(path,'utf8'),viewer=await context.newPage();
 try{
  if(html)await viewer.goto(pathToFileURL(path).href,{waitUntil:'load'});
  else await viewer.setContent('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font:14px/1.5 system-ui;color:#20272b;margin:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:75vh;overflow:auto;border:1px solid #aeb6bc;padding:12px}</style><h1>'+basename(path).replace(/[<&]/g,'_')+'</h1><pre></pre>');
  if(!html)await viewer.locator('pre').evaluate((el,value)=>{el.textContent=value;},text);
  for(const [width,height,suffix]of [[1440,1000,'desktop'],[390,844,'narrow']]){
   await viewer.setViewportSize({width,height});const path=join(out,label+'-'+suffix+'.png');await viewer.screenshot({path,fullPage:true});await remember(path);
  }
  report.openedAttachments??=[];const item=await receipt(path);if(!report.openedAttachments.some(x=>same(x,item)))report.openedAttachments.push(item);await save();
 }finally{await viewer.close();}
}

async function receiveRawProxy(route){
 const request=route.request(),action=new URL(request.url()).pathname.split('/').at(-1);
 if(!['upload','save','preview','select'].includes(action)){await route.continue();return;}
 const body=JSON.parse(request.postData()||'null'),id=body?.nativeRequest?.requestId,raw=report.supplierIntake;
 need(raw&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(id||'')&&raw.activeStep,'Bind the exact original supplier request to its retained receiving step.');
 assertRawStepRequest(raw.activeStep,action,body);
 let item=raw.nativeRequests.find(x=>x.body.nativeRequest.requestId===id);
 if(item)need(item.action===action&&same(item.body,body),'Preserve the same complete original supplier request.');
 else{item={action,body:cloneForReport(body),exchanges:[],state:'PENDING'};raw.nativeRequests.push(item);}
 const step=raw.steps[raw.activeStep]??={};need(!step.requestId||step.requestId===id,'Do not replace a receiving step with another native request.');step.requestId=id;step.action=action;step.bodySha256=sha(Buffer.from(canonical(body)));await save();
 try{
  const response=await route.fetch();
  try{const bytes=await response.body();let result;try{result=JSON.parse(bytes);}catch{}
   item.exchanges.push({at:new Date().toISOString(),status:response.status(),response:result});
   item.state=result?.result?.state??'PENDING';await save();await route.fulfill({response,body:bytes});
  }finally{await response.dispose();}
 }catch(error){item.transportError=String(error.message||error);await save();await route.abort('failed').catch(()=>{});}
}
async function rawArchive(label){
 const pending=page.waitForEvent('download');await page.locator('[data-mc-action="archive"]').click();const d=await pending;
 need(!await d.failure(),'The complete supplier working archive failed.');
 const temp=join(out,'.raw-download-'+randomUUID());await d.saveAs(temp);
 try{
  const bytes=await readFile(temp),archive=readArchive(bytes.toString('utf8')),name=label+'-'+sha(bytes).slice(0,16)+'.json';
  await keep(name,bytes);return {archive,path:join(out,name),intake:archive.supplierIntakes?.find(x=>x.id===archive.selectedSupplierIntake)||null};
 }finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function ms(action,attrs='',{allowError=false}={}){
 const locator=page.locator('[data-ms-action="'+action+'"]'+attrs);need(await locator.count()>=1,'Select an exact supplier control: '+action);
 await locator.first().click();await idle({allowError});await snapshot();
}
async function msView(name){await ms('view','[data-view="'+name+'"]');}
async function msFill(key,value){await page.locator('[data-ms-field="'+key+'"]').fill(value);await page.locator('[data-ms-field="'+key+'"]').blur();}

function assertRawStepRequest(step,action,body){
 const spec=input.supplierIntake,raw=report.supplierIntake,q=cloneForReport(body.nativeRequest);delete q.requestId;
 need(body.connectionId===spec.connectionId&&body.expectedWorkspaceId===spec.workspaceId&&body.expectedConnectionSha256===spec.connectionSha256,'The retained step changed configured workspace.');
 let expected;
 if(action==='upload'){
  const f=step==='full-upload'?spec.full:step==='update-upload'?spec.update:null;need(f,'Unknown original upload step.');
  expected={name:f.name,format:f.format,bytes:f.bytes,sha256:f.sha256,provenance:f.provenance??{}};
 }else if(action==='save'){
  need(['full-mapping','update-mapping'].includes(step),'Unknown original mapping step.');
  expected={title:spec.title,tenantId:spec.tenantId,mapping:step==='full-mapping'?spec.mapping:spec.updateMapping};
  if(step==='update-mapping'){need(Number.isSafeInteger(q.expectedRevision)&&q.expectedRevision>0,'Retain the original mapping revision.');expected.catalogId=raw.catalogId;expected.expectedRevision=q.expectedRevision;}
 }else if(action==='preview'){
  need(Number.isSafeInteger(q.expectedRevision)&&q.expectedRevision>0,'Retain the exact original preview revision.');
  expected={catalogId:raw.catalogId,expectedRevision:q.expectedRevision,sourceId:step==='full-preview'?raw.fullSourceId:raw.updateSourceId,mode:step==='full-preview'?'full':spec.update.mode,baseEditionId:step==='full-preview'?null:raw.fullEditionId};
 }else if(action==='select'){
  const preview=raw.steps[step==='full-select'?'full-preview':'update-preview']?.result?.edition;need(preview,'Retain the exact original native preview before selection.');
  need(Number.isSafeInteger(q.expectedRevision)&&q.expectedRevision>0,'Retain the exact selection revision.');
  expected={catalogId:raw.catalogId,expectedRevision:q.expectedRevision,editionId:preview.id,reviewSha256:preview.reviewSha256};
 }else throw Error('Unknown original supplier mutation.');
 need(same(q,expected),'The retained supplier request differs from this exact original source/mapping/base selection. Preserve it and review the conflict.');
}

async function rawOperation(step,action){
 const raw=report.supplierIntake,previousActive=raw.activeStep;need(!previousActive||previousActive===step,'Reconcile the original active supplier receiving step before advancing.');raw.activeStep=step;await save();
 let snapshot=await rawArchive('Supplier_'+step+'_Before'),w=snapshot.intake;
 need(w?.id===raw.intakeId,'Reopen the exact original supplier working copy.');
 let linked=raw.steps[step],request=linked?.requestId?w.requests.find(x=>x.id===linked.requestId):null;
 if(linked?.requestId)need(request&&request.action===linked.action&&linked.bodySha256===sha(Buffer.from(canonical(request.body))),'The original linked supplier request is missing or changed in this complete working copy. Reopen its retained complete archive; never replace its ID.');
 if(!request){
  const pending=w.requests.filter(x=>['PREPARED','RUNNING'].includes(x.state));
  if(pending.length){need(previousActive===step&&pending.length===1&&pending[0].action===action,'Preserve the other unresolved original supplier operation.');request=pending[0];raw.steps[step]={requestId:request.id,action,bodySha256:sha(Buffer.from(canonical(request.body)))};await save();}
 }
 if(request){
  assertRawStepRequest(step,action,request.body);
  need(request.action===action,'The original receiving step changed native action.');
  if(['PREPARED','RUNNING'].includes(request.state)){
   await ms('reconcile','[data-id="'+request.id+'"]',{allowError:true});
   snapshot=await rawArchive('Supplier_'+step+'_Reconciled');request=snapshot.intake.requests.find(x=>x.id===request.id);
   if(['PREPARED','RUNNING'].includes(request.state)){await ms('replay','[data-id="'+request.id+'"]',{allowError:true});snapshot=await rawArchive('Supplier_'+step+'_Replayed');request=snapshot.intake.requests.find(x=>x.id===request.id);}
  }
 }else{
  await ms(action,'',{allowError:true});snapshot=await rawArchive('Supplier_'+step+'_After');
  linked=raw.steps[step];need(linked?.requestId,'The original native request was not dispatched. Inspect the retained source/error before another operation.');
  request=snapshot.intake.requests.find(x=>x.id===linked.requestId);
 }
 if(request)assertRawStepRequest(step,action,request.body);
 need(request?.state==='COMPLETE','Original supplier '+step+' is '+(request?.state??'unresolved')+'; retain its exact input and inspect the native outcome before any new request.');
 const item=raw.nativeRequests.find(x=>x.body.nativeRequest.requestId===request.id);
 if(item){need(same(item.body,request.body),'The received native request differs from the full retained UI input.');item.exchanges=cloneForReport(request.exchanges);item.state=request.state;item.response=cloneForReport(request.response);}
 else raw.nativeRequests.push({action,body:cloneForReport(request.body),exchanges:cloneForReport(request.exchanges),state:request.state,response:cloneForReport(request.response)});
 raw.steps[step]={...raw.steps[step],requestId:request.id,action,state:request.state,result:cloneForReport(request.response.result.result)};delete raw.activeStep;await save();
 return request.response.result.result;
}
async function retainRawFile(descriptor){
 const raw=report.supplierIntake;await msView('files');
 let snapshot=await rawArchive('Supplier_File_Selection'),f=snapshot.intake.files.find(x=>x.sha256===descriptor.sha256&&x.bytes===descriptor.bytes&&x.name===descriptor.name);
 if(!f){await page.locator('[data-ms-file]').setInputFiles({name:descriptor.name,mimeType:'application/octet-stream',buffer:await readFile(descriptor.path)});await idle();snapshot=await rawArchive('Supplier_File_Retained');f=snapshot.intake.files.find(x=>x.sha256===descriptor.sha256&&x.bytes===descriptor.bytes&&x.name===descriptor.name);}
 need(f,'Retain the exact complete original supplier file before upload.');
 await page.locator('[data-ms-field="sourceFileId"]').selectOption(f.id);await idle();
 await msFill('formatText',pretty(descriptor.format));await msFill('provenanceText',pretty(descriptor.provenance??{}));
 const path=join(out,'Supplier_Original_'+descriptor.sha256.slice(0,16)+'_'+basename(descriptor.name));
 if(!await exists(path)){const pending=page.waitForEvent('download');await ms('file-download');const d=await pending;need(!await d.failure(),'The original retained supplier-file download failed.');await d.saveAs(path);}
 need(same(await receipt(path),{path,bytes:descriptor.bytes,sha256:descriptor.sha256}),'The actual original supplier-file download changed.');await remember(path);await viewedFile(path,{label:'supplier-original-'+descriptor.sha256.slice(0,12)});
 return f;
}
async function runSupplierCourse(){
 const spec=input.supplierIntake,raw=report.supplierIntake;
 await click('supplier-mode');await ms('connections');
 await capture('00-supplier-workspace-choice');
 let snapshot=await rawArchive('Supplier_Original_Archive'),w=raw.intakeId?snapshot.archive.supplierIntakes?.find(x=>x.id===raw.intakeId):snapshot.archive.supplierIntakes?.find(x=>x.name===input.operationId+' supplier intake');
 if(w){need(w.connection.id===spec.connectionId&&w.connection.workspaceId===spec.workspaceId&&w.connection.configurationSha256===spec.connectionSha256,'Preserve the original configured catalogue workspace.');await ms('open','[data-id="'+w.id+'"]');}
 else{
  await page.locator('[data-ms-field="connection"]').selectOption(spec.connectionId);await msFill('newName',input.operationId+' supplier intake');await ms('new');
  snapshot=await rawArchive('Supplier_Opened_Original');w=snapshot.intake;
 }
 need(w?.connection.id===spec.connectionId&&w.connection.workspaceId===spec.workspaceId&&w.connection.configurationSha256===spec.connectionSha256,'The actual configured supplier workspace differs.');
 raw.intakeId=w.id;await save();
 if(raw.activeStep){const pending=w.requests.filter(x=>['PREPARED','RUNNING'].includes(x.state));if(pending.length){need(pending.length===1,'Preserve all original unresolved supplier operations.');await rawOperation(raw.activeStep,pending[0].action);}}
 await stage('01a-original-full-supplier-upload',async()=>{
  await retainRawFile(spec.full);await capture('00a-original-full-file');
  const result=await rawOperation('full-upload','upload');need(result.source.bytes===spec.full.bytes&&result.source.sha256===spec.full.sha256,'The actual uploaded full source differs.');raw.fullSourceId=result.source.id;await save();
  await msView('mapping');await msFill('title',spec.title);await msFill('tenantId',spec.tenantId);
  if(!raw.steps['full-mapping']){await msFill('mappingText','{');await ms('save','',{allowError:true});need((await page.locator('.material-catalogue-desk [role="alert"]').textContent()).trim(),'The incomplete original mapping was not explained.');await capture('00b-incomplete-mapping-retained');}
  await msFill('mappingText',pretty(spec.mapping));
  await capture('00b-original-full-mapping');const saved=await rawOperation('full-mapping','save');await msFill('mappingText',pretty(saved.catalog.mapping));raw.catalogId=saved.catalog.id;await save();
 });
 await stage('01b-original-full-edition-selection',async()=>{
  await msView('files');await page.locator('[data-ms-field="sourceId"]').selectOption(raw.fullSourceId);await idle();
  await msView('review');await page.locator('[data-ms-field="mode"]').selectOption('full');await idle();await page.locator('[data-ms-field="baseEditionId"]').selectOption('');await idle();
  const preview=await rawOperation('full-preview','preview');raw.fullEditionId=preview.edition.id;await save();
  await ms('materials');await capture('00c-full-preview-materials');while(await page.locator('[data-ms-action="next"]').count())await ms('next');
  await ms('changes');while(await page.locator('[data-ms-action="next"]').count())await ms('next');
  const selected=await rawOperation('full-select','select');need(selected.catalog.activeEditionId===raw.fullEditionId,'The native full edition was not explicitly selected.');await capture('00d-full-edition-selected');
 });
 await stage('01c-original-update-source-and-mapping',async()=>{
  await retainRawFile(spec.update);await capture('00e-original-update-file');
  const result=await rawOperation('update-upload','upload');need(result.source.bytes===spec.update.bytes&&result.source.sha256===spec.update.sha256,'The actual retained update source differs.');raw.updateSourceId=result.source.id;await save();
  await msView('mapping');await msFill('mappingText',pretty(spec.updateMapping));await capture('00f-explicit-update-mapping');
  const saved=await rawOperation('update-mapping','save');await msFill('mappingText',pretty(saved.catalog.mapping));need(saved.catalog.id===raw.catalogId,'The update mapping changed original catalogue.');await save();
 });
 await stage('01d-original-explicit-base-update-selection',async()=>{
  await msView('files');await page.locator('[data-ms-field="sourceId"]').selectOption(raw.updateSourceId);await idle();
  await msView('review');await page.locator('[data-ms-field="mode"]').selectOption(spec.update.mode);await idle();await page.locator('[data-ms-field="baseEditionId"]').selectOption(raw.fullEditionId);await idle();
  await capture('00g-explicit-original-base');
  const preview=await rawOperation('update-preview','preview');raw.updateEditionId=preview.edition.id;need(preview.edition.baseEditionId===raw.fullEditionId&&preview.edition.mode===spec.update.mode,'The native update lost its exact chosen base or meaning.');await save();
  await ms('changes');await capture('00h-original-update-changes');while(await page.locator('[data-ms-action="next"]').count())await ms('next');
  await ms('materials');while(await page.locator('[data-ms-action="next"]').count())await ms('next');
  const selected=await rawOperation('update-select','select');need(selected.catalog.activeEditionId===raw.updateEditionId,'The native update edition was not explicitly selected.');raw.catalogRevision=selected.catalog.revision;await save();await capture('00i-update-edition-selected');
 });
 await stage('01e-freeze-whole-original-catalogue',async()=>{
  await msView('review');snapshot=await rawArchive('Supplier_Before_Capture');w=snapshot.intake;
  let bundle=w.bundles.find(b=>b.identity.catalogId===raw.catalogId&&b.identity.revision===raw.catalogRevision&&b.identity.activeEditionId===raw.updateEditionId);
  if(!bundle){await ms('bundle');snapshot=await rawArchive('Supplier_After_Capture');bundle=snapshot.intake.bundles.find(b=>b.identity.catalogId===raw.catalogId&&b.identity.revision===raw.catalogRevision&&b.identity.activeEditionId===raw.updateEditionId);}
  need(bundle,'The exact complete selected capture was not retained.');
  const pending=page.waitForEvent('download');await ms('bundle-download','[data-id="'+bundle.id+'"]');const d=await pending;need(!await d.failure(),'The retained complete bundle download failed.');
  const temp=join(out,'.raw-capture-'+randomUUID());await d.saveAs(temp);
  try{const bytes=await readFile(temp);need(bytes.length===bundle.file.bytes&&sha(bytes)===bundle.sha256,'The actual downloaded capture differs from its frozen complete archive.');await exact(input.handoverPath,bytes);}finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  raw.capture={...await receipt(input.handoverPath),identity:cloneForReport(bundle.identity)};raw.bundleId=bundle.id;raw.frozenCapture=cloneForReport({selection:bundle.selection,request:bundle.request,identity:bundle.identity,sha256:bundle.sha256});await save();
  await capture('00j-frozen-complete-capture');await viewedFile(input.handoverPath,{label:'00k-captured-native-catalogue'});
 });
 // Attach only the exact first complete capture. An unknown original case command is reconciled unchanged.
 const actualBefore=await api(prefix),matching=actualBefore.sources.filter(x=>x.materialCatalogue&&x.sha256===raw.capture.sha256);
 if(!matching.length){
  await msView('review');await ms('bundle-attach','[data-id="'+raw.bundleId+'"]',{allowError:true});
 }
 await click('catalogue-mode');
 const pendingIntake=page.locator('[data-mc-action="intake-recover"]');
 if(await pendingIntake.count()){need(await pendingIntake.count()===1,'Preserve the sole original typed bundle attachment.');await pendingIntake.click();await idle();}
 const actual=await api(prefix),matches=actual.sources.filter(x=>x.materialCatalogue&&x.sha256===raw.capture.sha256);
 need(matches.length===1,'Receive one exact selected complete raw-supplier catalogue attachment.');
 const source=matches[0];
 if(raw.effectiveSourceSelection){need(raw.effectiveSourceSelection.sourceId===source.id&&raw.effectiveSourceSelection.sourceSha256===raw.capture.sha256&&same(await receipt(raw.capture.path),{path:raw.capture.path,bytes:raw.capture.bytes,sha256:raw.capture.sha256}),'The retained effective complete source changed.');return;}
 const template=await api(prefix+'/material-catalog/template',{expectedVersion:actual.program.version,sourceId:source.id,expectedSourceSha256:source.sha256,document:input.document,operationId:input.operationId});
 need(template.source.id===source.id&&template.source.sha256===raw.capture.sha256,'The dynamic template differs from the actual saved complete source.');
 const effective={sourceId:source.id,sourceSha256:source.sha256,handoverPath:input.handoverPath,selection:cloneForReport(template.result.selection),bindings:cloneForReport(template.result.bindings),beforeEditionId:raw.fullEditionId,afterEditionId:raw.updateEditionId};
 if(raw.effectiveSourceSelection)need(same(raw.effectiveSourceSelection,effective),'The frozen effective source or original native preparation selection changed.');
 else raw.effectiveSourceSelection=effective;
 await keep('Supplier_Effective_Source_Selection.json',pretty(effective));await keep('Supplier_Original_Native_Template.json',pretty(template));await save();
}

try{
 const imported=await import(pathToFileURL(input.playwright).href),chromium=imported.chromium??imported.default?.chromium;
 context=await chromium.launchPersistentContext(join(root,'browser-profile'),{executablePath:input.chromium,headless:true,acceptDownloads:true,viewport:{width:1440,height:1000},args:['--no-sandbox','--disable-dev-shm-usage'],timeout:60000});
 context.setDefaultTimeout(45000);
 if(report.session)await context.addInitScript(({key,value,origin})=>{if(location.origin===origin&&!sessionStorage.getItem(key))sessionStorage.setItem(key,value);},{key:sessionKey,value:report.session,origin:access.origin});
 page=context.pages()[0]??await context.newPage();
 async function receiveCommand(route){
  const request=route.request(),body=JSON.parse(request.postData()||'null'),path=new URL(request.url()).pathname;
  need(body&&['material-catalog-source.add','installation.save'].includes(body.action),'Use only the original selected source and Installation commands.');
  need(path===prefix+'/material-catalog-source'?body.action==='material-catalog-source.add':body.action==='installation.save','Keep each original command on its selected route.');
  const id=body.requestId;need(/^[a-f0-9-]{36}$/.test(id),'Retain the original native request identity.');
  const bodyPath=join(out,'requests',id+'.json'),bytes=pretty(body),prior=report.requests[id];
  await exact(bodyPath,bytes);await remember(bodyPath);
  if(prior)need(prior.sha256===sha(Buffer.from(bytes))&&prior.path===path,'Keep the exact original command and route.');
  else{report.requests[id]={bodyPath,path,sha256:sha(Buffer.from(bytes)),action:body.action,state:'PENDING'};await snapshot();await save();}
  const response=await route.fetch();
  try{const raw=await response.body();let result;try{result=JSON.parse(raw);}catch{}
   report.requests[id]={...report.requests[id],state:response.ok()?'RECORDED':'REJECTED',status:response.status(),result};await save();
   await route.fulfill({response,body:raw});
  }finally{await response.dispose();}
 }
 if(input.supplierIntake)await context.route(access.origin+prefix+'/material-catalog-intake/**',receiveRawProxy);
 await context.route(access.origin+prefix+'/command',receiveCommand);
 await context.route(access.origin+prefix+'/material-catalog-source',receiveCommand);
 page.on('pageerror',e=>{report.pageErrors??=[];report.pageErrors.push(e.message);});
 report.state='RUNNING';await save();
 for(const artifact of Object.values(report.artifacts))need(same(await receipt(artifact.path),artifact),'A retained complete browser artifact changed.');
 await navigate();
 for(const item of Object.values(report.requests).filter(x=>x.state==='PENDING')){
  const body=JSON.parse(await readFile(item.bodyPath,'utf8'));need(sha(Buffer.from(pretty(body)))===item.sha256,'The original pending command changed.');
  const result=await api(item.path,body);item.result=result;item.state='RECORDED';await save();
 }
 const nativeRecovery=page.locator('[data-installation-action="recover"]');
 if(await nativeRecovery.count()){await nativeRecovery.click();await idle();await snapshot();}
 await stage('01-original-commercial-draft',async()=>{
  const actual=await api(prefix);need(actual.program.id===input.caseId&&actual.program.planId===input.planId&&actual.program.version===input.expectedVersion,'Receive this source course from its exact selected original case/version.');
  let s=await installationSession(),d=s?.drafts?.[s.draftKey];
  if(!d||d.installationId!==null||!same(d.document,input.document)){
   await page.locator('[data-installation-action="new"]').click();await idle();
   await page.locator('[data-installation-file]').setInputFiles(input.documentPath);await idle();
  }
  s=await installationSession();d=s.drafts[s.draftKey];
  need(!d.installationId&&same(d.document,input.document),'The complete original commercial document was not received.');
  report.originalDraft={key:d.key,token:d.token,document:cloneForReport(d.document)};await save();await capture('01-original-commercial-draft');
 });
 await page.locator('[data-installation-action="material-catalogue-open"]').click();await idle();
 const desk=page.locator('.material-catalogue-desk');await desk.waitFor({state:'visible'});
 if(input.supplierIntake)await runSupplierCourse();
 const selectedSource=input.supplierIntake?report.supplierIntake.effectiveSourceSelection:input;
 need(selectedSource&&sha(await readFile(selectedSource.handoverPath))===selectedSource.sourceSha256,'Keep the exact retained complete catalogue for the original receiving continuation.');
 const copyName=input.operationId+' original';
 await stage('02-complete-source-custody',async()=>{
  await capture('02-empty-material-desk');
  if(selectedSource.sourceId){
   const actual=await api(prefix),row=actual.sources.find(x=>x.id===selectedSource.sourceId);
   need(row?.materialCatalogue&&row.sha256===selectedSource.sourceSha256,'The original attached material source changed.');report.sourceId=row.id;
  }else{
   const actual=await api(prefix),existing=actual.sources.find(x=>x.sha256===selectedSource.sourceSha256&&x.materialCatalogue);
   if(existing)report.sourceId=existing.id;
   else{
    const file=await readFile(selectedSource.handoverPath);need(sha(file)===selectedSource.sourceSha256,'The retained complete material file changed.');
    await desk.locator('[data-mc-upload]').setInputFiles({name:basename(selectedSource.handoverPath),mimeType:'application/x-ndjson',buffer:file});await idle({allowError:true});
   }
   const recovery=desk.locator('[data-mc-action="intake-recover"]');
   if(await recovery.count()){need(await recovery.count()===1,'Preserve the sole original material intake.');await recovery.click();await idle();}
   const after=await api(prefix),matches=after.sources.filter(x=>x.materialCatalogue&&x.sha256===selectedSource.sourceSha256);
   need(matches.length===1,'Receive one exact original complete typed Material attachment.');report.sourceId=matches[0].id;
  }
  const original=await context.request.get(access.origin+prefix+'/sources/'+report.sourceId,{headers:{Authorization:'Bearer '+access.token}});
  need(original.ok()&&sha(await original.body())===selectedSource.sourceSha256,'The exact attached catalogue download differs.');
  const actual=await api(prefix);
  const inspection=await api(prefix+'/material-catalog/inspect',{expectedVersion:actual.program.version,sourceId:report.sourceId,expectedSourceSha256:selectedSource.sourceSha256});
  await keep('Original_Native_Inspection.json',pretty(inspection));report.sourceScope=inspection.scope;await save();
 });
 await stage('03-retained-full-source',async()=>{
  const existing=desk.locator('[data-mc-action="copy-open"]').filter({hasText:copyName});
  if(await existing.count()){await existing.first().click();await idle();}
  else{
   await desk.locator('[data-mc-field="source"]').selectOption(report.sourceId);await desk.locator('[data-mc-field="newName"]').fill(copyName);
   const pending=page.waitForResponse(r=>r.url().endsWith('/material-catalog/inspect')&&r.request().method()==='POST');
   await desk.locator('[data-mc-action="open-source"]').click();
   await capture('03-loading-original-source');await pending;await idle();
  }
  const selected=desk.locator('[data-mc-action="copy-open"][aria-current="true"]');
  need(await selected.count()===1,'Retain the exact complete material working copy.');
  report.originalCopyId=await selected.getAttribute('data-id');await save();await capture('04-complete-source-inventory');
 });
 need(report.originalCopyId,'Keep the original source review identity.');
 await desk.locator('[data-mc-action="copy-open"][data-id="'+report.originalCopyId+'"]').click();await idle();
 const view=async name=>{await desk.locator('[data-mc-action="view"][data-view="'+name+'"]').click();await idle();};
 await stage('04-original-records-and-source',async()=>{
  const inspection=JSON.parse(await readFile(join(out,'Original_Native_Inspection.json'),'utf8')).result;
  await view('records');
  for(const [table,count]of Object.entries(inspection.tables)){
   await desk.locator('[data-mc-field="table"]').selectOption(table);await click('rows');
   while(await desk.locator('[data-mc-action="rows-next"]').count())await click('rows-next');
   need((await desk.locator('main').textContent()).includes('of '+count),'The original table reader lost its total.');
  }
  await capture('05-original-records');await view('sources');
  const source=inspection.sources[0];need(source,'The selected complete catalogue has no original source to receive.');
  await desk.locator('[data-mc-action="member"][data-id="'+source.manifest.id+'"]').click();await idle();await capture('06-original-source-bytes');
  const pending=page.waitForEvent('download');await desk.locator('[data-mc-action="member-download"][data-id="'+source.manifest.id+'"]').click();await idle();
  const d=await pending;need(!await d.failure(),'The exact original feed download failed.');const memberPath=join(out,'Original_Source_'+source.manifest.id+'.bin');await d.saveAs(memberPath);await remember(memberPath);
  const actual=await receipt(memberPath);need(actual.bytes===source.file.bytes&&actual.sha256===source.file.sha256,'The actual complete source download differs.');
  const originalPath=await download('source-download','Original_Material_Catalogue_Download.jsonl');
  need(sha(await readFile(originalPath))===selectedSource.sourceSha256,'The actual full catalogue download differs.');
  report.originalMember=actual;await save();
 });
 await stage('05-retained-edition-comparison',async()=>{
  const inspection=JSON.parse(await readFile(join(out,'Original_Native_Inspection.json'),'utf8')).result;
  const before=selectedSource.beforeEditionId??inspection.editions[0]?.id,after=selectedSource.afterEditionId??inspection.catalogue.activeEditionId;
  need(inspection.editions.some(e=>e.id===before)&&inspection.editions.some(e=>e.id===after),'Select retained actual editions for comparison.');
  await view('editions');await desk.locator('[data-mc-field="before"]').selectOption(before);await desk.locator('[data-mc-field="after"]').selectOption(after);await click('compare');
  while(await desk.locator('[data-mc-action="compare-next"]').count())await click('compare-next');
  await capture('07-retained-edition-comparison');
 });
 await stage('06-complete-native-preparation',async()=>{
  await view('installation');
  // Restore the original new Workshare after an interrupted editor navigation.
  const s=await installationSession(),d=s?.drafts?.[s.draftKey];
  if(!d||d.installationId!==null||!same(d.document,input.document)){
   await click('close');await page.locator('[data-installation-action="new"]').click();await idle();
   await page.locator('[data-installation-file]').setInputFiles(input.documentPath);await idle();
   await page.locator('[data-installation-action="material-catalogue-open"]').click();await idle();await view('installation');
  }
  await click('template');
  const selection=cloneForReport(selectedSource.selection);need(selection.operationId===input.operationId,'Keep the original selected preparation operation ID.');
  await desk.locator('[data-mc-field="operation"]').fill(input.operationId);
  await desk.locator('[data-mc-field="selectionText"]').fill('{');
  await desk.locator('[data-mc-action="prepare"]').click();await idle({allowError:true});
  need((await desk.locator('[role="alert"]').textContent()).trim(),'The incomplete selection was not explained.');
  await capture('08-incomplete-selection-retained');
  await desk.locator('[data-mc-field="selectionText"]').fill(pretty(selection));
  await desk.locator('[data-mc-field="bindingsText"]').fill(pretty(selectedSource.bindings));
  await capture('09-complete-profile-bindings');
  await click('prepare');await capture('10-native-preparation');
  const file=await download('prepared-download','Complete_Material_Preparation.json'),prepared=JSON.parse(await readFile(file,'utf8'));
  need(prepared.preparation.source.sha256===selectedSource.sourceSha256&&same(prepared.preparation.result.prepared.document.workshare,input.document.workshare),'Preparation changed the original commercial source.');
  need(same(prepared.input.selection,selection)&&same(prepared.input.bindings,selectedSource.bindings),'Preparation changed the explicit selected source or bindings.');
  report.preparationSha256=prepared.preparation.preparationSha256;report.preparation=prepared.preparation;
  await download('selection-download','Material_Selection.json');
  const commercialHtml=await download('commercial-html','Material_Commercial_Workshare.html');await viewedFile(commercialHtml,{html:true,label:'11-commercial-workshare'});
  const commercialMd=await download('commercial-md','Material_Commercial_Workshare.md');await viewedFile(commercialMd,{label:'12-commercial-markdown'});
  const workorder=await download('workorder-md','Material_Workorder.md');await viewedFile(workorder,{label:'13-workorder'});
  await viewedFile(file,{label:'14-complete-preparation'});
  const work=await download('archive','Material_Working_Review_Before_Save.json'),archive=readArchive(await readFile(work,'utf8')),copy=archive.copies.find(c=>c.id===report.originalCopyId);
  need(copy?.prepared.preparationSha256===report.preparationSha256&&archive.sources.some(s=>s.metadata.sha256===selectedSource.sourceSha256),'The full working archive lost its source/preparation.');
  report.workingBefore=await receipt(work);await save();
 });
 await stage('07-whole-customer-package',async()=>{
  await view('installation');const path=join(root,'Material_Catalog_Complete_Handover.zip');
  if(!await exists(path)){
   const pending=page.waitForEvent('download');await click('handover');const d=await pending;need(!await d.failure(),'The complete customer package failed.');await d.saveAs(path);
  }
  const result=await receipt(path),archivePath=await download('archive','Material_Working_Review_With_Package.json'),archive=readArchive(await readFile(archivePath,'utf8')),copy=archive.copies.find(c=>c.id===report.originalCopyId);
  need(copy?.packages.some(p=>p.bytes===result.bytes&&p.sha256===result.sha256&&p.preparationSha256===report.preparationSha256),'The actual downloaded package differs from the retained exact native preparation receipt.');
  report.materialHandover=result;await save();await capture('15-complete-package-receipt');
 });
 await stage('08-complete-working-import',async()=>{
  const path=join(out,'Material_Working_Review_Before_Save.json');
  await desk.locator('[data-mc-field="notes"]').fill('Retain the later local review alongside the earlier complete downloaded source edition.');
  await click('verify');await desk.locator('[data-mc-action="import-fork"]').click();await desk.locator('[data-mc-import]').setInputFiles(path);await idle();
  const alternatives=desk.locator('[data-mc-action="copy-open"]');need(await alternatives.count()>=2,'The differing complete older review was not retained as an alternative.');
  await desk.locator('[data-mc-action="copy-open"][data-id="'+report.originalCopyId+'"]').click();await idle();await view('history');
  need(await desk.locator('[data-mc-action="history-open"]').count(),'Full preparation history was not preserved.');await capture('16-received-complete-working-history');
 });
 await stage('09-original-native-installation-save',async()=>{
  const prior=Object.values(report.requests).filter(x=>x.action==='installation.save'&&x.state==='RECORDED');
  need(prior.length<=1,'Preserve the one original receiving Installation save.');
  if(!prior.length){
   await view('installation');await click('receive');
   const session=await installationSession(),draft=session.drafts[session.draftKey];
   need(draft.key!==report.originalDraft.key&&same(draft.document,report.preparation.result.prepared.document),'The source desk did not create the exact distinct original Installation draft.');
   need(session.drafts[report.originalDraft.key]&&same(session.drafts[report.originalDraft.key].document,report.originalDraft.document),'The original Workshare draft was overwritten.');
   await page.locator('[data-installation-note]').fill('Receive complete original Material Catalog source and original commercial Workshare.');
   await page.locator('[data-installation-action="preview"]').click();await idle();await capture('17-original-editor-complete-preview');
   await snapshot();await page.locator('[data-installation-action="save"]').click();await idle();await snapshot();
  }
  const saved=Object.values(report.requests).filter(x=>x.action==='installation.save'&&x.state==='RECORDED');need(saved.length===1,'Receive one actual original Installation result.');
  const result=saved[0].result,row=await api(prefix+'/installations/'+result.recordId+'?revision='+result.revision),command=JSON.parse(await readFile(saved[0].bodyPath,'utf8'));
  need(row.sha256===result.sha256&&same(row.preview.document,command.data.document)&&same(row.preview.document,report.preparation.result.prepared.document),'The native save differs from the exact complete prepared document.');
  report.installation={id:row.id,revision:row.revision,sha256:row.sha256};
  const actual=await api(prefix);report.finalScope={caseId:actual.program.id,planId:actual.program.planId,version:actual.program.version};report.program=actual.program;
  await keep('Actual_Saved_Installation.json',pretty(row));await capture('18-original-saved-installation');await save();
 });
 await stage('10-cold-browser-history-and-download-reopen',async()=>{
  await snapshot();await page.reload({waitUntil:'domcontentloaded'});await navigate();
  await page.locator('[data-installation-action="material-catalogue-open"]').click();await idle();
  await desk.locator('[data-mc-action="copy-open"][data-id="'+report.originalCopyId+'"]').click();await idle();await click('verify');
  await view('installation');need((await desk.locator('main').textContent()).includes('STALE'),'The older frozen preparation did not show its changed-case warning.');
  const final=await download('archive','Material_Working_Review_Final.json'),archive=readArchive(await readFile(final,'utf8')),copy=archive.copies.find(c=>c.id===report.originalCopyId);
  need(copy?.prepared.preparationSha256===report.preparationSha256&&copy.handoffs.length&&copy.packages.length,'Cold browser reopening lost complete preparation, handoff or package history.');
  await capture('19-cold-source-and-frozen-preparation');
  // Open the real retained textual attachments. Whole ZIP/project reopen is performed
  // by the same parent native receiver with original material-cli and case importer.
  await viewedFile(join(out,'Original_Material_Catalogue_Download.jsonl'),{label:'20-original-catalogue'});
  await viewedFile(report.originalMember.path,{label:'21-original-feed'});
  await viewedFile(join(out,'Material_Selection.json'),{label:'22-selected-source'});
  await viewedFile(join(out,'Actual_Saved_Installation.json'),{label:'23-saved-installation'});
  await viewedFile(final,{label:'24-complete-working-archive'});
  report.workingFinal=await receipt(final);await save();
 });
 need(!report.pageErrors?.length,'The original browser reported a JavaScript error.');
 report.state='COMPLETE';report.visualReview='PENDING_PRODUCING_SEAT_OPEN_AND_LOOK';delete report.error;
}catch(e){failure=e;report.state='INTERRUPTED';report.error={name:e.name,message:e.message};}
finally{
 try{await snapshot();await gallery();if(context)await context.close();closed=true;}catch(e){failure??=e;report.state='INTERRUPTED';report.closeError=e.message;}
 report.lifetimes=closed?'CLOSED':'UNCONFIRMED';await save();
 process.stdout.write(JSON.stringify({state:report.state,phases:Object.keys(report.phases),artifacts:Object.keys(report.artifacts).length,report:await receipt(reportPath)})+'\n');
}
if(failure)throw failure;
function cloneForReport(value){return JSON.parse(JSON.stringify(value));}
