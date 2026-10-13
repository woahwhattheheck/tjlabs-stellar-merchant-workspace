// MIT. Research receiving chapter on the original authenticated Source Desk/browser.
import {constants} from 'node:fs';
import {open,lstat,realpath,mkdir,link,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,dirname,basename,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {BrowserReceiving,sourceDeskReceivingFiles as F} from './installation-source-desk-receiving.mjs';
import {startFredWorkspace} from '../../../scf-starforge-20261009/sf30-seller-sdk/fred/workspace.mjs';
const {need,sha,same,stable,pretty,exists,regular,receipt,retain,replaceJSON,object,privateDirectory}=F;
const SCHEMA='stellar-forge.research-installation-browser.v1',MAX=2*1024*1024*1024;
const fileShape=f=>({name:f.name??f.filename,kind:f.kind,bytes:f.bytes,sha256:f.sha256,sourceUrl:f.sourceUrl,observedAt:f.observedAt});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s).replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,100);
const hasOwn=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
async function matchingFile(f,max=MAX){const r=await receipt(f.path,max);need(r.bytes===f.bytes&&r.sha256===f.sha256,'The complete retained browser artifact changed.');return r;}
async function boundedWait(page,fn,arg,timeout=120000){await page.waitForFunction(fn,arg,{timeout});}
export class ResearchInstallationBrowser extends BrowserReceiving{
 constructor({page,manifestPath,phase,openResearchProject}){
  need(page&&!page.isClosed()&&['operate','receive'].includes(phase),'Borrow the actual authenticated Operations page and choose one original course phase.');
  const directory=dirname(resolve(manifestPath));
  super({directory,output:resolve(directory,phase==='operate'?'research-installation-browser.json':'research-installation-browser-received.json')},'',{});
  this.page=page;this.manifestPath=resolve(manifestPath);this.phase=phase;this.openResearchProject=openResearchProject;
  this.borrowedViewport=page.viewportSize();this.routeHandler=null;this.expected=null;this.temporaryPages=new Set();
 }
 async initialize(){
  this.manifest=await object(this.manifestPath,32*1024*1024);
  const m=this.manifest;
  need(m.schema==='stellar-forge.research-installation-course.v1'&&
   (this.phase==='operate'?['PREPARED','RECEIVED','COMPLETE']:['RECEIVED','COMPLETE']).includes(m.phase),
   'Use the same native prepared or independently received course manifest.');
  this.input={...this.input,operationId:m.operation,actor:m.actor,caseId:this.phase==='operate'?m.caseId:m.receivedCaseId,
   planId:this.phase==='operate'?m.planId:m.receivedPlanId};
  need(this.input.caseId&&this.input.planId&&typeof m.actor==='string','Retain the actual native case, plan and operator.');
  this.prefix='/api/operations/'+this.input.caseId;this.deskPrefix=this.prefix+'/installation-sources';
  this.url=new URL(this.page.url());need(['http:','https:'].includes(this.url.protocol),'Use the actual authenticated HTTP workspace.');
  this.root=await privateDirectory(this.root);
  this.networkRoot=await privateDirectory(resolve(this.root,'browser-'+this.phase,'requests'));
  this.downloadRoot=await privateDirectory(resolve(this.root,'browser-'+this.phase,'downloads'));
  this.attempt=await privateDirectory(resolve(this.root,'browser-'+this.phase,'attempt-'+randomUUID()));
  const identity={operation:m.operation,selection:m.selection,caseId:this.input.caseId,planId:this.input.planId,
   actor:m.actor,workspaceDirectory:this.phase==='operate'?m.workspaceDirectory:m.receivedWorkspaceDirectory,phase:this.phase};
  const identityPath=resolve(this.root,'browser-'+this.phase,'selection.json');await retain(identityPath,pretty(identity));
  this.report=await exists(this.path)?await object(this.path,512*1024*1024):{
   schema:SCHEMA,operation:m.operation,phase:'RUNNING',identity,caseId:this.input.caseId,
   state:'RUNNING',phases:{},artifacts:{},requests:{},captures:{},intents:{},rawUploads:{},
   browserDraftId:null,workingSnapshots:{},sourceEditions:[]};
  need(this.report.schema===SCHEMA&&same(this.report.identity,identity),'Continue the same original browser business selection.');
  for(const f of Object.values(this.report.artifacts))await matchingFile(f);
  for(const f of m.files)await matchingFile(f);
  if(this.report.state==='COMPLETE')return;
  const source=await regular(fileURLToPath(import.meta.url),2*1024*1024),sourcePath=resolve(this.root,'browser-'+this.phase,'source-'+sha(source)+'.mjs');
  await retain(sourcePath,source);if(!this.report.sourceEditions.some(f=>f.sha256===sha(source)))this.report.sourceEditions.push(await this.remember(sourcePath));
  this.report.origins??=[];if(!this.report.origins.includes(this.url.origin))this.report.origins.push(this.url.origin);
  await this.remember(identityPath);await this.save();
  if(this.report.installationSession){
   const saved=await object(this.report.installationSession.path,64*1024*1024);
   need(saved.caseId===this.input.caseId&&saved.key==='sf47.installations.'+this.input.caseId,'Restore only this original case editor.');
   const restored=await this.page.evaluate(saved=>{const old=sessionStorage.getItem(saved.key);
    if(old!==null){const actual=JSON.parse(old);return actual.schema==='sf47.installation-editor.v1'&&actual.caseId===saved.caseId;}sessionStorage.setItem(saved.key,saved.text);return true;},saved);
   need(restored,'Preserve the later original Installation editor in this browser. Continue from its current owner or exact saved copy.');
  }
  this.pageErrorHandler=error=>{this.report.pageErrors??=[];this.report.pageErrors.push({attempt:basename(this.attempt),message:error.message});};
  this.page.on('pageerror',this.pageErrorHandler);
  this.routeHandler=route=>this.own(this.network(route).catch(async error=>{this.networkFailure??=error;try{await route.abort('failed');}catch{}throw error;}));
  await this.page.route('**/api/operations/**',this.routeHandler);
 }
 async remember(path){path=resolve(path);const key=relative(this.root,path);need(key&&!key.startsWith('..')&&!isAbsolute(key),'Keep outputs under the original operation.');
  const value=await receipt(path,MAX),prior=this.report.artifacts[key];need(!prior||same(prior,value),'A complete original artifact changed.');
  this.report.artifacts[key]=value;return value;}
 async rememberSession(){
  if(!this.page||this.page.isClosed())return;
  const key='sf47.installations.'+this.input.caseId;
  const text=await this.page.evaluate(key=>sessionStorage.getItem(key),key);if(text===null)return;
  const value=JSON.parse(text);need(value.schema==='sf47.installation-editor.v1'&&value.caseId===this.input.caseId,'Retain only the original complete Installation editor session.');
  const raw=pretty({caseId:this.input.caseId,key,text});need(raw.length<=64*1024*1024,'Retain the whole bounded original Installation session.');
  const path=resolve(this.networkRoot,'installation-session-'+sha(raw)+'.json');await retain(path,raw);
  this.report.installationSession=await this.remember(path);
 }
 async api(path){
  need(path.startsWith(this.prefix)||path==='/api/operations/installation-source-profiles','Read only the selected actual case.');
  return this.page.evaluate(async path=>{const {staffRequest}=await import('/staff-session.mjs');return staffRequest(path);},path);
 }
 async network(route){
  const r=route.request(),u=new URL(r.url());
  if(u.origin!==this.url.origin||!u.pathname.startsWith(this.prefix)){await route.fallback();return;}
  if(r.method()!=='POST'){await route.fallback();return;}
  const isRaw=u.pathname.endsWith('/research/import');
  if(isRaw){
   const query=Object.fromEntries(u.searchParams);const selected=this.manifest.files.find(f=>f.sha256===query.sha256&&
    f.kind===query.kind&&f.name===query.name&&String(f.bytes)===query.bytes&&f.sourceUrl===query.sourceUrl&&f.observedAt===query.observedAt);
   need(this.phase==='operate'&&selected&&query.actor===this.input.actor&&
    u.pathname===this.deskPrefix+'/'+this.report.browserDraftId+'/research/import','Keep the original exact whole Research upload on this case.');
   const prior=this.report.rawUploads[query.requestId];need(!prior||same(prior.query,query),'The raw upload retry changed its original descriptor.');
   this.report.rawUploads[query.requestId]={path:u.pathname,query,state:prior?.state??'DISPATCHED'};
   await this.save();await route.fallback();return;
  }
  let body;try{body=r.postDataJSON();}catch{await route.fallback();return;}
  if(!body?.requestId){await route.fallback();return;}
  const prior=this.report.requests[body.requestId],intent=this.expected;
  if(!prior){
   need(intent&&body.action===intent.action&&body.actor===this.input.actor&&
    (intent.expectedRevision===undefined||body.expectedRevision===intent.expectedRevision)&&
    (intent.expectedVersion===undefined||body.expectedVersion===intent.expectedVersion)&&
    (!intent.data||same(body.data,intent.data))&&
    (!intent.document||same(body.data?.document,intent.document)),
    'An outgoing native action differs from this retained course stage. Keep the other original request with its owner.');
   intent.requestId=body.requestId;intent.path=u.pathname;intent.body=structuredClone(body);await this.save();
  }
  return super.network(route);
 }
 async recoverWorkingCopy(){
  const marker=this.page.locator('[data-source-copy-id][data-source-scope]');
  if(!await marker.count())return;
  const active=await marker.evaluate(el=>({draftId:el.dataset.sourceDraftId,pendingId:el.dataset.sourcePendingId,scope:JSON.parse(el.dataset.sourceScope)}));
  need(active.scope.caseId===this.input.caseId&&active.scope.planId===this.input.planId,'Keep the original Source Desk scope.');
  if(active.pendingId)need(this.report.requests[active.pendingId],'Preserve another original pending source request.');
  if(active.draftId===this.report.browserDraftId)return;
  if(this.report.currentWorking){
   await matchingFile(this.report.currentWorking);
   await this.downloads(()=>this.page.locator('[data-source-working-file]').setInputFiles(this.report.currentWorking.path),[null],'prior-before-reopen-'+randomUUID());
   await this.idle();
  }
 }
 async snapshot(label){
  const [file]=await this.downloads(()=>this.click('working-download'),[null],clean(label)+'-'+randomUUID());
  const value=await object(file.path,512*1024*1024);
  need(value.scope.caseId===this.input.caseId&&value.sourceDraftId===this.report.browserDraftId,'The exported complete working copy changed source identity.');
  this.report.currentWorking=file;this.report.workingSnapshots[label]=file;await this.save();return value;
 }
 async working(label){const value=await this.snapshot(label);return value;}
 async capture(label){
  if(this.report.captures[label])return this.report.captures[label];
  const output=[];
  for(const [name,width]of [['desktop',1440],['narrow',390]]){
   await this.page.setViewportSize({width,height:1000});const path=resolve(this.attempt,clean(label)+'-'+name+'.png');
   await this.page.screenshot({path,fullPage:false});output.push(await this.remember(path));
  }await this.page.setViewportSize({width:1440,height:1000});
  this.report.captures[label]=output;await this.save();return output;
 }
 async researchField(key,value){const loc=this.page.locator('[data-research-field="'+key+'"]');await loc.scrollIntoViewIfNeeded();
  if(await loc.evaluate(el=>el.tagName)==='SELECT')await loc.selectOption(String(value??''));else await loc.fill(String(value??''));await this.idle();}
 async researchWork(label){const value=await this.snapshot(label);need(value.state.researchWork,'Open the original Research tab.');return value.state.researchWork;}
 async acceptedStage(name,{action,data,document,expectedRevision,expectedVersion},trigger){
  let intent=this.report.intents[name];
  const wanted={action,...(data?{data}:{}),...(document?{document}:{}),...(expectedRevision!==undefined?{expectedRevision}:{}),...(expectedVersion!==undefined?{expectedVersion}:{})};
  if(!intent){intent={...structuredClone(wanted),state:'PREPARED'};this.report.intents[name]=intent;await this.save();}
  // On resume the original already-dispatched payload/revision is authoritative.
  if(intent.requestId){
   const retained=this.report.requests[intent.requestId];need(retained,'Retain the captured original request beside its intent.');
   if(retained.state!=='RECORDED'){
    if(action==='installation.save'){const recover=this.page.locator('[data-installation-action="recover"]');need(await recover.count(),'Recover the original Installation save before proceeding.');await recover.click();await this.nativeIdle();}
    else await this.recoverPending();
   }
  }else{
   need(same(Object.fromEntries(Object.keys(wanted).map(k=>[k,intent[k]])),wanted),'The selected undispatched action changed. Keep its prior work.');
   this.expected=intent;
   try{await trigger();await this.idle();}finally{this.expected=null;}
   need(intent.requestId,'The actual original UI did not dispatch its retained request.');
   if(this.report.requests[intent.requestId]?.state!=='RECORDED')await this.recoverPending();
  }
  const result=this.report.requests[intent.requestId];need(result?.state==='RECORDED','The original request has no completed native receipt.');
  intent.state='COMPLETE';await this.save();return result.result;
 }
 async originalCreate(){
  if(!this.report.browserDraftId){
   const title='Research customer Installation · '+this.manifest.operation;
   await this.page.locator('[data-source-new-title]').fill(title);
   await this.acceptedStage('create',{action:'create',data:{title}},()=>this.click('new'));
  }
  const draft=await this.draft();need(draft.caseId===this.input.caseId,'Select the actual original source draft.');
  await this.tab('research');await this.snapshot('initial-source');await this.capture('original-source-desk');
  return {draftId:draft.id};
 }
 async uploadOriginals(){
  await this.tab('research');
  for(const selected of this.manifest.files){
   let work=await this.researchWork('before-source-'+selected.kind);
   const exact=f=>same(fileShape(f),fileShape(selected));
   if(work.pending&&!work.files.some(exact)){
    need(work.pending.query.kind===selected.kind&&work.pending.query.sha256===selected.sha256,'Recover the earlier selected original source first.');
    await this.page.locator('[data-research-upload]').first().setInputFiles(selected.path);
    await this.click('research-retry');work=await this.researchWork('recovered-source-'+selected.kind);
   }
   if(!work.files.some(exact)){
    await this.researchField('kind',selected.kind);await this.researchField('sourceUrl',selected.sourceUrl);
    await this.researchField('observedAt',selected.observedAt);
    await this.page.locator('[data-research-upload]').first().setInputFiles(selected.path);await this.idle();
    work=await this.researchWork('uploaded-source-'+selected.kind);
    if(work.pending){await this.click('research-retry');work=await this.researchWork('continued-source-'+selected.kind);}
   }
   const actual=work.files.find(exact);need(actual&&!work.pending,'The complete original source or native inspection is unresolved.');
   this.report.originalFiles??={};this.report.originalFiles[selected.kind]=actual;
   for(const row of Object.values(this.report.rawUploads))if(row.query.sha256===selected.sha256&&row.query.kind===selected.kind)row.state='COMPLETE';
   await this.researchField('fileId',actual.id);await this.click('research-inspect');
   const [download]=await this.downloads(()=>this.click('research-file-download','[data-id="'+actual.id+'"]'),[{...actual,filename:actual.name}],'original-'+actual.kind);
   await this.viewFile(download,'original-'+actual.kind);await this.save();
  }
  await this.capture('complete-native-source-inspections');return {files:this.report.originalFiles};
 }

 async explicitSelection(){
  await this.tab('research');await this.recoverPending();const scenario=this.manifest.selection.selection;
  need(scenario&&scenario.product&&Array.isArray(scenario.sourceUses)&&scenario.document&&scenario.workshareSelection,
   'Retain the actual product, every source-use decision, whole document and original Workshare source selection.');
  for(const [kind,file]of Object.entries(this.report.originalFiles)){
   await this.page.locator('[data-research-input="'+kind+'"]').selectOption(file.id);await this.idle();
  }
  await this.researchField('productId',scenario.product.productId);await this.researchField('editionId',scenario.product.editionId);
  for(const use of scenario.sourceUses){
   const key=sha(Buffer.from(stable({entryId:use.entryId,definitionId:use.definitionId})));
   for(const name of ['purpose','rightsStatus','authorityReference','redistribution','retention']){
    const el=this.page.locator('[data-research-use="'+name+'"][data-source-key="'+key+'"]');
    need(await el.count()===1,'Keep the selected original source definition visible for each explicit rights decision.');
    if(name==='rightsStatus')await el.selectOption(use[name]);else await el.fill(use[name]);await this.idle();
   }
  }
  await this.researchField('workshareSelectionText',JSON.stringify(scenario.workshareSelection,null,2)+'\n');
  await this.click('research-workshares');
  await this.researchField('workshareCaseId',scenario.workshareCaseId??scenario.document.workshare?.caseId);
  await this.click('research-template');
  const seeded=await this.researchWork('actual-workshare-template');
  need(seeded.seed&&same(seeded.seed.document.workshare,scenario.document.workshare),
   'The actual selected native Workshare differs from the complete declared commercial scenario.');
  await this.researchField('documentText',JSON.stringify(scenario.document,null,2)+'\n');
  await this.click('research-compose');
  const complete=await this.researchWork('complete-explicit-selection'),selected=JSON.parse(complete.selectionText);
  need(same(selected.product,scenario.product)&&same([...selected.sourceUses].sort((a,b)=>(a.entryId+'/'+a.definitionId).localeCompare(b.entryId+'/'+b.definitionId)),[...scenario.sourceUses].sort((a,b)=>(a.entryId+'/'+a.definitionId).localeCompare(b.entryId+'/'+b.definitionId)))&&same(selected.document,scenario.document),
   'The actual guided source, rights or complete Installation differs from the selected original scenario.');
  this.report.selected=selected;this.report.selectionText=complete.selectionText;await this.save();
  await this.capture('explicit-rights-and-complete-workshare');
  const current=await this.draft();
  this.report.fault??={state:'ARMED',kind:'one-selection-save-response'};await this.save();
  const result=await this.acceptedStage('selection-save',{action:'selection.save',data:{selectionJSON:complete.selectionText},expectedRevision:current.revision},
   ()=>this.click('research-save'));
  if(this.report.fault.state==='RESPONSE_WITHHELD'){
   await this.snapshot('exact-pending-after-lost-reply');await this.page.reload({waitUntil:'domcontentloaded'});await this.navigate();
   await this.recoverPending();await this.tab('research');
   need(this.report.fault.requestId===this.report.intents['selection-save'].requestId,'Recovery must retain the original save UUID.');
   this.report.fault.state='RECOVERED';await this.save();
  }
  const saved=await this.draft();need(same(saved.selection,selected),'The saved original selection differs from its actual user controls.');
  await this.snapshot('saved-selection-after-reload');return {draftId:saved.id,revision:saved.revision,requestId:result.requestId};
 }
 async prepareAndAttach(){
  await this.tab('research');const current=await this.draft();
  const catalogue=await this.api('/api/operations/installation-source-profiles');
  const engine=catalogue.sourceFormats?.find(x=>x.schema===current.selection.schema)?.engine??(catalogue.research?.schema===current.selection.schema?catalogue.research.engine:null);
  const head=(await this.api(this.deskPrefix)).drafts.find(x=>x.id===current.id);
  need(engine?.sha256&&head?.selectionSha256,'Use the actual installed reader and original selected source hash.');
  const accepted=await this.acceptedStage('prepare',{action:'prepare',expectedRevision:current.revision,
   data:{expectedEngineSha256:engine.sha256,expectedSelectionSha256:head.selectionSha256,expectedProfiles:{}}},()=>this.click('research-prepare'));
  const prepared=accepted.result;need(prepared.kind==='economic-research'&&prepared.state==='PREPARED_SOURCE','Retain the actual complete Research preparation.');
  this.report.preparationId=prepared.id;await this.save();
  await this.click('research-preparation-open','[data-id="'+prepared.id+'"]');
  for(const file of prepared.files){
   const [download]=await this.downloads(()=>this.click('research-output-download','[data-filename="'+file.filename+'"]'),[file],'prepared-'+clean(file.filename));
   await this.viewFile(download,'prepared-'+clean(file.filename));
  }
  await this.capture('prepared-whole-source-and-installation');
  const state=await this.api(this.prefix),draft=await this.draft();
  const attached=await this.acceptedStage('attach',{action:'research.attach',expectedRevision:draft.revision,
   data:{preparationId:prepared.id,expectedVersion:state.program.version}},()=>this.click('research-attach'));
  need(attached.result?.state==='ATTACHED_RESEARCH_INSTALLATION','The original case attachment did not complete.');
  this.report.attached=attached.result;await this.snapshot('complete-attached-installation');return {preparationId:prepared.id,source:attached.result.source};
 }
 async saveInstallation(){
  const attached=this.report.attached;need(attached?.installation,'Retain the exact original source attachment.');
  const previous=this.report.intents['installation-save'];
  if(!previous?.requestId){
   await this.tab('research');await this.click('research-preview');await this.capture('actual-native-preview');
   await this.click('research-receive');await this.page.locator('[data-installation-editor]').waitFor({state:'visible'});
   await this.page.locator('[data-installation-note]').fill('Original Research customer Installation · '+this.manifest.operation);
   await this.page.locator('[data-installation-action="preview"]').click();await this.nativeIdle();
  }
  const accepted=await this.acceptedStage('installation-save',{action:'installation.save',
   document:attached.installation.document,expectedVersion:attached.installation.source.version},
   async()=>{await this.page.locator('[data-installation-action="save"]').click();await this.nativeIdle();});
  need(accepted.recordId&&Number.isSafeInteger(accepted.revision),'Retain the actual native Installation save receipt.');
  const row=await this.api(this.prefix+'/installations/'+accepted.recordId+'?revision='+accepted.revision);
  need(row.sha256===accepted.sha256&&same(row.preview.document,attached.installation.document),'The saved whole Installation differs from the reviewed source document.');
  this.report.installationId=row.id;this.report.revision=row.revision;this.report.installationSha256=row.sha256;
  await this.remember((await retain(resolve(this.networkRoot,'saved-installation.json'),pretty(row))).path);
  await this.capture('original-installation-saved');await this.save();return {installationId:row.id,revision:row.revision,sha256:row.sha256};
 }
 async reopenDesk(){
  if(!await this.page.locator('[data-source-new-title]').isVisible()){
   await this.page.locator('[data-installation-action="source-open"]').click();await this.idle();
  }
  const chosen=this.page.locator('[data-source-action="draft-open"][data-id="'+this.report.browserDraftId+'"]');
  if(await chosen.count()&&await chosen.getAttribute('aria-current')!=='page'){await chosen.click();await this.idle();}
  await this.tab('research');
 }
 async exportWhole(){
  await this.reopenDesk();await this.click('research-preparation-open','[data-id="'+this.report.preparationId+'"]');
  await this.researchField('exportInstallationId',this.report.installationId);await this.researchField('exportRevision',this.report.revision);
  const path=this.deskPrefix+'/'+this.report.browserDraftId+'/research/preparations/'+this.report.preparationId+
   '/archive?installationId='+encodeURIComponent(this.report.installationId)+'&revision='+this.report.revision;
  const described=await this.api(path+'&describe=1');need(described.kind==='installation-archive'&&described.bytes<=MAX,'Retain the complete native archive descriptor.');
  const [archive]=await this.downloads(()=>this.click('research-archive-download'),[{...described,filename:described.name}],'complete-native-archive');
  this.report.archive=archive;await this.snapshot('complete-final-source-desk');
  // Cold reopen uses the same real application journal, then its complete exported working file.
  await this.page.reload({waitUntil:'domcontentloaded'});await this.navigate();await this.tab('research');
  await this.click('research-preparation-open','[data-id="'+this.report.preparationId+'"]');
  const current=await this.researchWork('cold-reopened-final-source-desk');
  need(current.prepared?.id===this.report.preparationId&&current.attached?.preparationId===this.report.preparationId&&
   current.files.length===this.manifest.files.length,'The reopened Source Desk lost complete original receiving history.');
  await this.capture('cold-reopened-original-preparation');return {archive};
 }
 async verifyNativeRequests(){
  for(const [id,row]of Object.entries(this.report.requests)){
   need(row.state==='RECORDED','An original browser request remains unresolved.');
   const entry=await object(row.requestPath);need(entry.body.requestId===id&&sha(pretty(entry))===row.requestSha256,'Keep each exact original browser request.');
   if(entry.path.startsWith(this.deskPrefix+'/')){
    const result=await this.api(entry.path+'/requests/'+encodeURIComponent(id));
    need(result.state==='RECORDED'&&same(result.result,row.result),'The original native request outcome changed.');
   }else{
    const actual=await this.api(this.prefix+'/installations/'+row.result.recordId+'?revision='+row.result.revision);
    need(actual.sha256===row.result.sha256,'The original native saved edition changed.');
   }
  }
 }
 async receiveCase(){
  const operated=await object(resolve(this.root,'research-installation-browser.json'),512*1024*1024),m=this.manifest;
  this.report.browserDraftId=operated.draftId;this.report.preparationId=operated.preparationId;
  this.report.installationId=m.installation.installationId;this.report.revision=m.installation.revision;
  await this.save();await this.navigate();await this.tab('research');
  const current=await this.draft();need(current.receivedFrom&&current.requiresCurrentTemplate===true,'Retain original received custody and require a current template for future saves.');
  await this.click('research-preparation-open','[data-id="'+this.report.preparationId+'"]');
  const work=await this.researchWork('independently-received-complete-source');
  need(work.attached&&work.prepared?.id===this.report.preparationId,'The received original attachment or complete preparation is missing.');
  for(const selected of m.files){
   const f=work.files.find(f=>same(fileShape(f),fileShape(selected)));need(f,'A complete original source was omitted from receiving.');
   await this.researchField('fileId',f.id);await this.click('research-inspect');
   const [download]=await this.downloads(()=>this.click('research-file-download','[data-id="'+f.id+'"]'),[{...f,filename:f.name}],'received-'+f.kind);
   await this.viewFile(download,'received-'+f.kind);
  }
  for(const f of work.prepared.files){
   const [download]=await this.downloads(()=>this.click('research-output-download','[data-filename="'+f.filename+'"]'),[f],'received-output-'+clean(f.filename));
   await this.viewFile(download,'received-output-'+clean(f.filename));
  }
  await this.tab('history');await this.capture('received-complete-native-source-history');await this.tab('research');
  const row=await this.api(this.prefix+'/installations/'+this.report.installationId+'?revision='+this.report.revision);
  need(row.sha256===m.installation.sha256&&same(row.preview.document,m.installation.document),'The independently received native Installation changed.');
  await this.snapshot('received-current-complete-working');
  await this.page.reload({waitUntil:'domcontentloaded'});await this.navigate();await this.tab('research');
  await this.click('research-preparation-open','[data-id="'+this.report.preparationId+'"]');
  const reopened=await this.researchWork('received-cold-reopened-working');
  need(reopened.prepared.id===this.report.preparationId&&same(reopened.prepared.selection,work.prepared.selection),'Cold reopening changed original selected source/use decisions.');
  await this.capture('received-cold-reopened-source-desk');
  return {draftId:current.id,installationId:row.id,revision:row.revision,sha256:row.sha256};
 }

 async downloads(trigger,expected,label){return super.downloads(trigger,expected,label,{timeout:1800000});}
 async readDownload(download,expected,label){return super.readDownload(download,expected,label,MAX);}
 async idle(){
  await boundedWait(this.page,()=>{const root=document.querySelector('[data-source-status]')?.parentElement;return root&&root.getAttribute('aria-busy')!=='true';},null,1800000);
  if(this.networkFailure)throw this.networkFailure;
 }
 async viewFile(file,label){
  await matchingFile(file);const page=await this.page.context().newPage();this.temporaryPages.add(page);
  const routePath='/__research_installation_view/'+sha(Buffer.from(file.path))+'/';
  const url=this.url.origin+routePath;
  const isHTML=/\.html?$/i.test(file.filename),isText=file.bytes<=16*1024*1024&&/\.(?:json|csv|txt|md|xml|ttl|nq|log)$/i.test(file.filename);
  let html,raw;if(isHTML||isText)raw=await regular(file.path,64*1024*1024);
  if(isHTML)html=raw;
  else if(isText){const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);
   html=Buffer.from('<!doctype html><meta charset="utf-8"><title>Original complete source</title><style>body{font:16px system-ui;margin:24px;color:#202020;background:#fff}pre{height:72vh;overflow:auto;white-space:pre-wrap;border:1px solid #666;padding:16px}code{overflow-wrap:anywhere}</style><h1>'+esc(file.filename)+'</h1><p>'+file.bytes+' bytes · <code>'+file.sha256+'</code></p><pre id="source"><span>'+esc(text).replace(/\r/g,'&#13;')+'</span></pre>');
  }else html=Buffer.from('<!doctype html><meta charset="utf-8"><title>Complete original byte viewer</title><style>body{font:16px system-ui;margin:24px;color:#222}button,input{min-height:44px;margin:4px}pre{height:64vh;overflow:auto;white-space:pre-wrap;border:1px solid #777;padding:12px}code{overflow-wrap:anywhere}</style><h1>'+esc(file.filename)+'</h1><p>'+file.bytes+' complete bytes · <code>'+file.sha256+'</code></p><label>Select the actual retained original<input id="file" type="file"></label><label>Byte offset<input id="offset" value="0" type="number" min="0"></label><button id="read" disabled>Read exact byte window</button><button id="next" disabled>Next</button><button id="last" disabled>Last</button><p id="status"></p><pre id="bytes"></pre><script src="viewer.js"></script>');
  const viewer="let file;const $=id=>document.getElementById(id);async function read(){const offset=Number($('offset').value);if(!file||!Number.isSafeInteger(offset)||offset<0||offset>=file.size)throw Error('Choose an original byte offset.');const raw=new Uint8Array(await file.slice(offset,Math.min(offset+65536,file.size)).arrayBuffer());$('bytes').textContent=Array.from(raw,x=>x.toString(16).padStart(2,'0')).join(' ');$('bytes').dataset.offset=String(offset);$('bytes').dataset.count=String(raw.length);$('status').textContent=offset+' through '+(offset+raw.length)+' of '+file.size+' complete bytes';} $('file').onchange=async()=>{file=$('file').files[0];for(const id of ['read','next','last'])$(id).disabled=!file;$('offset').value='0';await read();};$('read').onclick=read;$('next').onclick=async()=>{$('offset').value=String(Math.min(file.size-1,Number($('offset').value)+65536));await read();};$('last').onclick=async()=>{$('offset').value=String(Math.max(0,file.size-65536));await read();};";
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==this.url.origin||!u.pathname.startsWith(routePath)){await route.abort('blockedbyclient');return;}
   if(u.pathname===routePath){await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html,headers:{'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'",'X-Content-Type-Options':'nosniff'}});return;}
   if(u.pathname===routePath+'viewer.js'){await route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:viewer});return;}
   await route.abort('blockedbyclient');
  });
  try{
   await page.goto(url,{waitUntil:'domcontentloaded'});
   if(!isHTML&&!isText)await page.locator('#file').setInputFiles(file.path);
   const views=[];
   for(const [width,device]of [[1440,'desktop'],[390,'narrow']]){
    await page.setViewportSize({width,height:1000});
    for(const edge of ['first','last']){
     if(isText){
      const actual=await page.locator('#source').textContent();need(Buffer.from(actual).equals(raw),'The actual source text view changed its original UTF-8/line endings.');
      await page.locator('#source').evaluate((el,edge)=>{el.scrollTop=edge==='first'?0:el.scrollHeight;},edge);
     }else if(!isHTML){
      const offset=edge==='first'?0:Math.max(0,file.bytes-65536);await page.locator('#offset').fill(String(offset));await page.locator('#read').click();
      await boundedWait(page,offset=>document.getElementById('bytes').dataset.offset===String(offset),offset);
      const handle=await open(file.path,constants.O_RDONLY|constants.O_NOFOLLOW),chunk=Buffer.alloc(Math.min(65536,file.bytes-offset));
      try{const {bytesRead}=await handle.read(chunk,0,chunk.length,offset);need(bytesRead===chunk.length,'The original file window was interrupted.');}finally{await handle.close();}
      need(await page.locator('#bytes').textContent()===Array.from(chunk,x=>x.toString(16).padStart(2,'0')).join(' '),'The visible byte window differs from the complete retained original.');
     }else await page.evaluate(edge=>window.scrollTo(0,edge==='first'?0:document.documentElement.scrollHeight),edge);
     const target=resolve(this.attempt,clean(label)+'-'+device+'-'+edge+'.png');await page.screenshot({path:target,fullPage:false});views.push(await this.remember(target));
    }
   }
   this.report.fileViews??=[];this.report.fileViews.push({file,kind:isHTML?'rendered-original-html':isText?'complete-text':'whole-original-byte-windows',views});await this.save();
  }finally{await page.close();this.temporaryPages.delete(page);}
 }

 async receivedResearch(){
  const rows=this.manifest.receivedProjects??[],out=[];
  for(const [index,row]of rows.entries()){
   if(row.kind==='customer-return'){need(row.state==='RETAINED_UNADOPTED','Keep the original customer return unadopted.');out.push({kind:row.kind,returnId:row.returnId,state:row.state});continue;}
   const directory=row.projectDirectory;
   need(typeof directory==='string'&&isAbsolute(directory),'The original native receiver must identify its complete Research project directory.');
   let selected,server=null,page=null;
   try{
    if(this.openResearchProject){selected=await this.openResearchProject({directory,kind:row.kind,receipt:row,manifest:this.manifest});page=selected.page;}
    else{server=await startFredWorkspace({directory,port:0});page=await this.page.context().newPage();this.temporaryPages.add(page);await page.goto(server.url,{waitUntil:'domcontentloaded'});}
    need(page&&!page.isClosed(),'Open the actual independently received Research application.');
    await page.locator('[data-tab="research"]').click();
    await boundedWait(page,()=>{const el=document.getElementById('research-reload');return el&&!el.disabled;},null);
    await page.locator('#research-product-select').selectOption(this.manifest.selection.selection.product.productId);
    need(await page.locator('#research-product-id').inputValue()===this.manifest.selection.selection.product.productId,'The native received project opened another product.');
    const originalPage=this.page;this.page=page;
    try{
     await this.capture('received-research-'+index);
     const [catalogue]=await this.downloads(()=>page.locator('#research-export-csv').click(),[null],'received-research-'+index+'-catalogue');
     const [project]=await this.downloads(()=>page.locator('#research-export-project').click(),[null],'received-research-'+index+'-whole-project');
     const exported=await object(project.path,480*1024*1024);
     need(exported.state?.research?.products.some(p=>p.id===this.manifest.selection.selection.product.productId&&
      p.editions.some(e=>e.id===this.manifest.selection.selection.product.editionId)),'The independently received complete project lost its issued product.');
     await this.viewFile(catalogue,'received-research-'+index+'-catalogue');
     out.push({kind:row.kind,directory,projectId:exported.state.id,catalogue,project});
    }finally{this.page=originalPage;}
   }finally{
    if(selected?.release)await selected.release();
    else if(page){await page.close();this.temporaryPages.delete(page);}
    if(server)await server.close();
   }
  }
  this.report.researchProjects=out;await this.save();return out;
 }
 async close(){
  this.stopping=true;
  if(this.pageErrorHandler)this.page.off('pageerror',this.pageErrorHandler);
  if(this.routeHandler&&!this.page.isClosed())await this.page.unroute('**/api/operations/**',this.routeHandler);
  while(this.owned.size)await Promise.allSettled([...this.owned]);
  for(const page of this.temporaryPages)if(!page.isClosed())await page.close();this.temporaryPages.clear();
  if(this.borrowedViewport&&!this.page.isClosed())await this.page.setViewportSize(this.borrowedViewport);
  await this.tail;
 }
 async run(){
  let failure=null;
  try{
   await this.initialize();
   if(this.report.state==='COMPLETE')return {resultPath:this.path,...this.report};
   this.report.state='RUNNING';await this.save();
   if(this.phase==='operate'){
    await this.navigate();
    await this.stage('01-original-source-draft',()=>this.originalCreate());
    await this.stage('02-complete-original-research-files',()=>this.uploadOriginals());
    await this.stage('03-explicit-workshare-rights-lost-reply',()=>this.explicitSelection());
    await this.stage('04-native-prepare-and-attach',()=>this.prepareAndAttach());
    await this.stage('05-original-installation-preview-save',()=>this.saveInstallation());
    await this.stage('06-complete-export-and-cold-reopen',()=>this.exportWhole());
    await this.verifyNativeRequests();
   }else{
    await this.stage('01-independent-source-desk-receiving',()=>this.receiveCase());
    await this.stage('02-complete-research-project-receiving',()=>this.receivedResearch());
   }
   need(!this.report.pageErrors?.some(row=>row.attempt===basename(this.attempt)),'Inspect the retained actual application script errors before completing this course.');
   this.report.draftId=this.report.browserDraftId;this.report.phase=this.phase==='operate'?'OPERATED':'RECEIVED';
   this.report.state='COMPLETE';this.report.completed=true;this.report.completedAt??=new Date().toISOString();
   await this.save();return {resultPath:this.path,...this.report};
  }catch(error){failure=error;if(this.report){this.report.state='INTERRUPTED';this.report.completed=false;this.report.error={name:error.name,message:error.message};await this.save();}throw error;}
  finally{try{await this.close();}catch(error){if(this.report){this.report.state='INTERRUPTED';this.report.completed=false;this.report.closeError={name:error.name,message:error.message};await this.save();}if(!failure)throw error;}}
 }
}
export async function runResearchInstallationBrowser(config){return new ResearchInstallationBrowser(config).run();}
async function main(){
 const [path,...extra]=process.argv.slice(2);need(path&&!extra.length,'Pass one complete private original browser configuration JSON.');
 const config=await object(resolve(path),32*1024*1024),root=dirname(resolve(config.manifestPath));
 need(resolve(config.directory)===root&&['operate','receive'].includes(config.phase),'Keep this browser phase under the original native operation.');
 const runtime=config.browserConfig;need(runtime&&isAbsolute(runtime.chromiumExecutable)&&isAbsolute(runtime.playwrightModule),'Select the installed original browser executable and Playwright module.');
 const access=await object(config.accessFile,4096),url=new URL(config.workspaceUrl);
 need(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&!url.username&&!url.password&&
  /^[A-Za-z0-9_-]{32,128}$/.test(access.token),'Use the owned original Operations listener and private access file.');
 const selected=await import(pathToFileURL(await realpath(runtime.playwrightModule)).href),chromium=selected.chromium??selected.default?.chromium;
 need(chromium,'Use the actual installed Playwright Chromium provider.');
 const profile=await privateDirectory(resolve(root,'browser-'+config.phase,'profile'));
 const context=await chromium.launchPersistentContext(profile,{executablePath:await realpath(runtime.chromiumExecutable),
  headless:true,acceptDownloads:true,viewport:{width:1440,height:1000},serviceWorkers:'block',
  args:['--disable-features=FileSystemAccessLocal'],env:{...process.env,TMPDIR:await privateDirectory(resolve(root,'browser-'+config.phase,'tmp'))}});
 try{
  const page=context.pages()[0]??await context.newPage();page.setDefaultTimeout(120000);
  await page.goto(url.origin+'/#access='+access.token,{waitUntil:'domcontentloaded'});
  const value=await runResearchInstallationBrowser({page,manifestPath:config.manifestPath,phase:config.phase});
  process.stdout.write(JSON.stringify({schema:SCHEMA,operation:value.operation,phase:value.phase,resultPath:value.resultPath})+'\n');
 }finally{await context.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
 process.stderr.write(JSON.stringify({schema:SCHEMA,state:'INTERRUPTED',message:error.message})+'\n');process.exitCode=1;
});
