// MIT. Original Economic Research sources in the existing Installation Source Desk.
import {Sha256,sha256File} from './operations_installation_source_hash.mjs';
import {staffRequest,assertStaffRequestActor} from './staff-session.mjs';
import {nativeJSONCanonical,parseExactMappingJSON} from './operations_installation_mapping_reconciliation.mjs';

export const RESEARCH_SOURCE_WORKING='stellar-forge.research-installation-source-working.v1';
const LIMITS={project:480*1024*1024,'issued-package':256*1024*1024,'customer-return':256*1024*1024};
const HEX=/^[a-f0-9]{64}$/,RID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x),clone=x=>structuredClone(x);
const pretty=x=>JSON.stringify(x,null,2)+'\n',same=(a,b)=>nativeJSONCanonical(a)===nativeJSONCanonical(b);
const hash=x=>new Sha256().update(typeof x==='string'?new TextEncoder().encode(x):x).hex();
function fileOK(x){return record(x)&&/^research-[a-f0-9]{64}$/.test(x.id??'')&&HEX.test(x.sha256??'')&&
 Object.hasOwn(LIMITS,x.kind)&&Number.isSafeInteger(x.bytes)&&x.bytes>0&&x.bytes<=LIMITS[x.kind]&&
 ['name','sourceUrl','observedAt'].every(k=>typeof x[k]==='string');}
const fileIdentity=f=>Object.fromEntries(['id','name','kind','bytes','sha256','sourceUrl','observedAt'].map(k=>[k,f[k]]));
const sameFile=(a,b)=>fileOK(a)&&fileOK(b)&&same(fileIdentity(a),fileIdentity(b));
function requestOK(r,{caseId,draftId}={}){
 if(!record(r)||!record(r.query)||!RID.test(r.query.requestId??'')||r.query.requestId!==r.requestId||
  !Object.hasOwn(LIMITS,r.query.kind)||!Number.isSafeInteger(r.query.bytes)||r.query.bytes<1||r.query.bytes>LIMITS[r.query.kind]||
  !HEX.test(r.query.sha256??'')||!['actor','name','sourceUrl','observedAt'].every(k=>typeof r.query[k]==='string')||
  !r.query.actor.trim()||r.sha256!==hash(nativeJSONCanonical({caseId:r.caseId,draftId:r.draftId,query:r.query}))||
  caseId!==undefined&&r.caseId!==caseId||draftId!==undefined&&r.draftId!==draftId)
  throw new Error('Keep the complete original Research upload, actor, draft and exact body identity.');
 return r;
}
function blank(caseId,draftId){return {schema:RESEARCH_SOURCE_WORKING,caseId,draftId,
 kind:'project',sourceUrl:'',observedAt:'',fileId:'',files:[],inspections:{},requests:[],pending:null,
 productId:'',editionId:'',selectionText:'',documentText:'',workshareSelectionText:'',inputIds:{project:'','issued-package':'','customer-return':''},sourceUseDrafts:{},exportInstallationId:'',exportRevision:'',attached:null,bindingRaw:{},nativeWorkshares:null,nativeSelection:null,
 workshareCaseId:'',seed:null,template:null,preview:null,prepared:null,previewBasis:null,
 dirty:false,history:[],notice:''};}
export function validateResearchSourceWork(value,context={}){
 if(value===null||value===undefined)return null;
 if(!record(value)||value.schema!==RESEARCH_SOURCE_WORKING||value.caseId!==context.caseId||
  value.draftId!==context.draftId||!Object.hasOwn(LIMITS,value.kind)||
  !['sourceUrl','observedAt','fileId','productId','editionId','selectionText','documentText','workshareSelectionText','workshareCaseId','exportInstallationId','exportRevision'].every(k=>typeof value[k]==='string')||
  !Array.isArray(value.files)||!Array.isArray(value.requests)||!Array.isArray(value.history)||!record(value.inspections)||
  !record(value.inputIds)||!Object.keys(LIMITS).every(k=>typeof value.inputIds[k]==='string')||!record(value.sourceUseDrafts)||!record(value.bindingRaw)||Object.values(value.bindingRaw).some(x=>typeof x!=='string'))
  throw new Error('Open the complete Research working copy in its original source draft.');
 for(const [key,use]of Object.entries(value.sourceUseDrafts)){if(!HEX.test(key)||!record(use)||!['purpose','rightsStatus','authorityReference','redistribution','retention'].every(k=>typeof use[k]==='string'))throw new Error('Keep every complete unfinished source-use decision.');}
 for(const f of value.files)if(!fileOK(f))throw new Error('Keep every complete Research sidecar identity.');
 const ids=new Set();for(const r of value.requests){requestOK(r,context);if(ids.has(r.requestId))throw new Error('Duplicate original Research request.');ids.add(r.requestId);}
 if(value.pending){requestOK(value.pending,context);const retained=value.requests.find(x=>x.requestId===value.pending.requestId);
  if(!retained||!same(retained.query,value.pending.query)||retained.sha256!==value.pending.sha256)throw new Error('Keep the full original pending upload in the same request history.');}
 for(const [id,row]of Object.entries(value.inspections))if(!value.files.some(f=>f.id===id)||!record(row))
  throw new Error('Keep inspected metadata beside its exact original sidecar.');
 for(const key of ['nativeWorkshares','nativeSelection','seed','template','preview','prepared','attached'])
  if(value[key]!==null&&!record(value[key]))throw new Error('Keep complete original Research '+key+' fields.');
 return value;
}
export function createResearchSourceDesk(ctx){
 if(!document.querySelector('link[data-research-source-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/operations_installation_research.css';link.dataset.researchSourceStyle='true';document.head.append(link);}
 const {esc,header,table,hint,empty,download}=ctx,controllers=new Set(),selectedFiles=new Map();
 let disposed=false,progress='';
 const w=()=>ctx.state().researchWork??(ctx.state().researchWork=blank(ctx.caseId,ctx.draft()?.id??null));
 const prefix=owner=>'/api/operations/'+encodeURIComponent(ctx.caseId)+'/installation-sources/'+encodeURIComponent(owner.draftId)+'/research';
 function live(owner){ctx.checkContext();if(disposed||ctx.state().researchWork!==owner||ctx.draft()?.id!==owner.draftId)
  throw new Error('The original Research working selection changed. Reopen its complete saved copy; no other draft was changed.');}
 function editAllowed(){ctx.requireEdit();if(w().pending)throw new Error('Recover the original complete Research upload before editing its selection.');}
 function touch(){w().dirty=true;ctx.changed();}
 function invalidate(){const state=w();if(state.attached){state.history.push({kind:'prior-attachment',value:clone(state.attached)});}state.attached=null;state.preview=null;state.previewBasis=null;state.prepared=null;touch();}
 const detail=(label,value)=>'<details><summary>'+esc(label)+'</summary><pre>'+esc(pretty(value))+'</pre></details>';
 const button=(label,action,attrs='',disabled=false)=>'<button type="button" data-source-action="research-'+action+'" '+attrs+(disabled?' disabled data-source-fixed="true"':'')+'>'+esc(label)+'</button>';
 const field=(label,key,value='',options={})=>{
  const attr=' data-research-field="'+esc(key)+'" data-source-edit';let input;
  if(options.choices){const choices=[...options.choices];if(value&&!choices.some(x=>String(x[0])===String(value)))choices.push([value,'Retained selection · '+value]);
   input='<select'+attr+'>'+choices.map(([id,text])=>'<option value="'+esc(id)+'"'+(String(value)===String(id)?' selected':'')+'>'+esc(text)+'</option>').join('')+'</select>';}
  else if(options.area)input='<textarea'+attr+' rows="'+(options.rows||5)+'" spellcheck="false">'+esc(value)+'</textarea>';
  else input='<input'+attr+' value="'+esc(value)+'">';
  return '<label class="'+(options.wide?'source-desk-wide':'')+'"><span>'+esc(label)+'</span>'+input+(options.help?'<small>'+esc(options.help)+'</small>':'')+'</label>';
 };
 function currentRequest(original,owner){live(owner);const retained=owner.requests.find(x=>x.requestId===original.requestId);
  if(!retained||retained.sha256!==original.sha256||!same(retained.query,original.query))throw new Error('The complete original upload request changed.');
  assertStaffRequestActor(retained.query,ctx.staffContext);return retained;}
 async function retainError(original,owner,error){
  if(disposed||ctx.state().researchWork!==owner)throw error;
  const retained=currentRequest(original,owner);retained.error={message:String(error.message),status:error.status??null,code:error.code??null};
  retained.status='UNRESOLVED';owner.pending=retained;ctx.changed();await ctx.persistNow();throw error;
 }
 async function adoptUpload(original,value,owner){
  const retained=currentRequest(original,owner);
  if(!record(value)||(value.caseId!==undefined&&value.caseId!==ctx.caseId)||(value.draftId!==undefined&&value.draftId!==owner.draftId)||value.requestId!==original.requestId||
   (value.actor!==undefined&&value.actor!==original.query.actor))throw new Error('The upload receipt differs from its original case, draft, request or actor.');
  if(!['NOT_RECORDED','INPUT_RETAINED','COMPLETE'].includes(value.status))throw new Error('Keep the actual native upload status.');
  retained.status=value.status;retained.result=clone(value);retained.error=null;
  if(value.status==='COMPLETE'){
   if(value.caseId!==ctx.caseId||value.draftId!==owner.draftId||value.actor!==original.query.actor)throw new Error('The complete receipt must retain its actual case, draft and actor.');
   const f=value.file;if(!fileOK(f)||f.sha256!==original.query.sha256||f.bytes!==original.query.bytes||
    f.kind!==original.query.kind||f.name!==original.query.name||f.sourceUrl!==original.query.sourceUrl||
    f.observedAt!==original.query.observedAt||!record(value.inspection))
    throw new Error('The native inspection differs from the complete original selected file.');
   const previous=owner.files.find(x=>x.id===f.id);if(previous&&!sameFile(previous,f))
    throw new Error('An original sidecar ID cannot replace different retained provenance.');
   if(!previous)owner.files.push(clone(f));
   owner.inspections[f.id]=clone(value.inspection);owner.fileId=f.id;owner.inputIds[f.kind]=f.id;owner.productId='';owner.editionId='';
   owner.pending=null;owner.template=null;owner.preview=null;owner.previewBasis=null;owner.prepared=null;owner.dirty=true;
  }else owner.pending=retained;
  ctx.changed();
  try{await ctx.persistNow();}catch(error){owner.pending=retained;throw error;}
  ctx.notice(value.status==='COMPLETE'?'Complete original Research bytes and native inspection retained. Review the exact product and source use.':
   value.status==='INPUT_RETAINED'?'The full original body is retained. Continue the same upload inspection.':'The original upload has no native receipt. Select the same complete file to retry its unchanged request.');
  return value;
 }
 async function status(original=w().pending,owner=w()){
  if(!original)throw new Error('Select the original retained upload request.');
  currentRequest(original,owner);
  try{return await adoptUpload(original,await ctx.api(prefix(owner)+'/requests/'+encodeURIComponent(original.requestId)+'?actor='+encodeURIComponent(original.query.actor)),owner);}
  catch(error){return retainError(original,owner,error);}
 }
 async function sendUpload(original,file,owner=w()){
  currentRequest(original,owner);
  if(original.result?.status==='COMPLETE')return adoptUpload(original,original.result,owner);
  if(!file||file.name!==original.query.name||file.size!==original.query.bytes||await sha256File(file)!==original.query.sha256)
   throw new Error('Reselect the same complete original file. Its filename, bytes and whole SHA-256 must match before the saved upload can continue.');
  live(owner);await ctx.verifyStaff();live(owner);assertStaffRequestActor(original.query,ctx.staffContext);
  const retained=currentRequest(original,owner);retained.status='REQUESTING';owner.pending=retained;ctx.changed();await ctx.persistNow();
  const controller=new AbortController();controllers.add(controller);
  try{
   const query=new URLSearchParams(Object.entries(original.query).map(([key,value])=>[key,String(value)]));
   const result=await staffRequest(prefix(owner)+'/import?'+query,file,{raw:true,headers:{'Content-Type':'application/octet-stream'},staffContext:ctx.staffContext,signal:controller.signal});
   live(owner);return await adoptUpload(original,result,owner);
  }catch(error){return retainError(original,owner,error);}finally{controllers.delete(controller);}
 }
 async function chooseFile(target){
  const file=target.files?.[0];if(!file)return true;const owner=w();live(owner);
  if(owner.pending){selectedFiles.set(owner.pending.requestId,file);ctx.notice('Selected a file for the original pending upload. Retry verifies its whole identity before any dispatch.');return true;}
  editAllowed();const kind=owner.kind,sourceUrl=owner.sourceUrl,observedAt=owner.observedAt,actor=ctx.actor();
  if(!actor?.trim())throw new Error('Use the original recording operator.');
  if(!file.name||file.name.length>200||/[\/\\\x00-\x1f\x7f]/.test(file.name)||file.name==='.'||file.name==='..')throw new Error('Use the plain original filename, up to 200 characters.');
  if(sourceUrl!==sourceUrl.trim()||!/^https?:\/\//i.test(sourceUrl)||/[\x00-\x20]/.test(sourceUrl))throw new Error('Record the actual HTTP or HTTPS source URL without surrounding whitespace.');
  if(file.size<1||file.size>LIMITS[kind])throw new Error('Select the complete '+kind+' within '+LIMITS[kind]+' bytes.');
  if(!observedAt.trim()||!Number.isFinite(Date.parse(observedAt))||!/(?:Z|[+-]\d\d:\d\d)$/.test(observedAt))throw new Error('Record the actual source observation time with a timezone.');
  await ctx.parkWorking('Before selecting complete original Research bytes');live(owner);
  progress='Hashing '+file.name;ctx.render();
  try{
   const sha256=await sha256File(file,{onProgress:({bytes,total})=>{progress='Hashing '+file.name+': '+bytes+' / '+total+' bytes';ctx.progress(progress);}});
   live(owner);const query={requestId:crypto.randomUUID(),actor,kind,name:file.name,bytes:file.size,sha256,sourceUrl,observedAt};
   assertStaffRequestActor(query,ctx.staffContext);
   const original={caseId:ctx.caseId,draftId:owner.draftId,requestId:query.requestId,query,
    sha256:hash(nativeJSONCanonical({caseId:ctx.caseId,draftId:owner.draftId,query})),status:'PREPARED',createdAt:new Date().toISOString(),result:null,error:null};
   owner.requests.push(original);owner.pending=original;selectedFiles.set(original.requestId,file);ctx.changed();await ctx.persistNow();
   return await sendUpload(original,file,owner);
  }finally{progress='';}
 }
 async function downloadFile(file){
  const owner=w();live(owner);if(!fileOK(file))throw new Error('Select the complete original Research sidecar.');
  const controller=new AbortController();controllers.add(controller);
  try{
   const response=await ctx.api(prefix(owner)+'/files/'+encodeURIComponent(file.id)+'?expectedSha256='+file.sha256,undefined,{download:true,signal:controller.signal});
   const length=response.headers.get('content-length');if(length!==null&&Number(length)!==file.bytes)throw new Error('The original download length changed.');
   const blob=await response.blob();if(blob.size!==file.bytes||await sha256File(blob)!==file.sha256)throw new Error('The downloaded Research source differs from its complete original bytes.');
   live(owner);download(blob,file.name,blob.type||'application/octet-stream');
  }finally{controllers.delete(controller);}
 }
 async function inspect(){
  editAllowed();const owner=w(),file=owner.files.find(x=>x.id===owner.fileId);if(!file)throw new Error('Select an original retained Research source.');
  const value=await ctx.api(prefix(owner)+'/inspect',{fileId:file.id,expectedSha256:file.sha256});live(owner);
  if(!sameFile(value.file,file)||!record(value.inspection))throw new Error('The original native inspection changed its selected file identity.');
  owner.inspections[file.id]=clone(value.inspection);ctx.changed();await ctx.persistNow();return value;
 }

 function object(text,label){let value;try{value=parseExactMappingJSON(text).value;}catch(error){throw new Error(label+': '+error.message);}if(!record(value))throw new Error(label+' must contain the complete JSON object.');return value;}
 function activeFile(){const state=w();return state.files.find(f=>f.id===(state.inputIds['issued-package']||state.inputIds.project));}
 function inspection(){return w().inspections[activeFile()?.id]??null;}
 function sourceProjectId(){
  const state=w(),source=inspection();if(!source)return '';
  const returned=state.inspections[state.inputIds['customer-return']];
  const origins=(source.origins??[]).filter(r=>r.productId===state.productId&&r.editionId===state.editionId);
  const selected=returned&&origins.find(r=>r.sourceProjectId===returned.sourceProjectId);
  return selected?.sourceProjectId??(new Set(origins.map(r=>r.sourceProjectId)).size===1?origins[0].sourceProjectId:sourceProjectId());
 }
 function selectedProduct(){return inspection()?.products?.find(x=>x.id===w().productId)??null;}
 function selectedEdition(){return selectedProduct()?.editions?.find(x=>x.id===w().editionId)??null;}
 function sourceRows(){
  const source=inspection(),edition=selectedEdition();if(!source||!edition)return [];
  const unique=new Map();
  for(const row of edition.sources??[]){
   const key=hash(nativeJSONCanonical({entryId:row.entryId,definitionId:row.definitionId}));
   if(unique.has(key)){unique.get(key).selections.push(clone(row));continue;}
   const entry=source.entries.find(e=>e.id===row.entryId),version=entry?.versions.find(v=>v.id===row.definitionId);
   if(!entry||!version)throw new Error('The selected issued edition omits an original source definition.');
   unique.set(key,{key,entryId:row.entryId,definitionId:row.definitionId,definition:clone(version.definition),selections:[clone(row)],
    reviews:(source.reviews??[]).filter(r=>r.id===row.reviewId),use:clone(w().sourceUseDrafts[key]??{purpose:'',rightsStatus:'',authorityReference:'',redistribution:'',retention:''})});
  }for(const row of unique.values())row.reviews=(source.reviews??[]).filter(review=>row.selections.some(selected=>selected.reviewId===review.id));return [...unique.values()];
 }
 function prepareSelection(){
  editAllowed();const state=w(),source=inspection(),product=selectedProduct(),edition=selectedEdition();
  if(!source||!product||!edition||!state.seed)throw new Error('Select the original issued product and a fresh native Workshare template.');
  const document=object(state.documentText,'Complete Workshare-seeded Installation');
  const inputs=Object.keys(LIMITS).filter(kind=>state.inputIds[kind]).map(role=>{
   const f=state.files.find(x=>x.id===state.inputIds[role]&&x.kind===role);if(!f)throw new Error('An original selected sidecar is missing.');
   return {fileId:f.id,sha256:f.sha256,role};
  });
  if(!inputs.some(x=>['project','issued-package'].includes(x.role)))throw new Error('Select the original project or issued package.');
  const selection={schema:'stellar-forge.research-installation-selection.v1',inputs,
   product:{sourceProjectId:sourceProjectId(),productId:product.id,editionId:edition.id},
   sourceUses:sourceRows().map(r=>({entryId:r.entryId,definitionId:r.definitionId,...r.use})),
   expectedVersion:state.seed.source.version,installationId:state.seed.installationId,
   expectedInstallationRevision:state.seed.expectedRevision,document};
  state.selectionText=pretty(selection);invalidate();ctx.changed();return selection;
 }
 function basis(){const state=w();return hash(nativeJSONCanonical({draftId:state.draftId,selectionText:state.selectionText,documentText:state.documentText,
  inputs:state.inputIds,productId:state.productId,editionId:state.editionId,sourceUseDrafts:state.sourceUseDrafts,preparationId:state.prepared?.id??null}));}
 function documentEdit(path,value){
  const state=w();state.bindingRaw[path]=value;touch();const document=object(state.documentText,'Complete original Installation');
  const keys=path.split('.');if(keys.some(x=>['__proto__','prototype','constructor'].includes(x)))throw new Error('Select a named original Installation field.');
  let target=document;for(const key of keys.slice(0,-1)){if(!record(target[key]))throw new Error('The original Installation has no '+path+' field.');target=target[key];}
  if(!Object.hasOwn(target,keys.at(-1)))throw new Error('The original Installation has no '+path+' field.');
  if(path==='payment.taskUnits'){if(value!==''&&!/^(0|[1-9][0-9]*)$/.test(value))throw new Error('Keep the whole task count as exact decimal text.');value=value===''?null:Number(value);if(value!==null&&!Number.isSafeInteger(value))throw new Error('The task count exceeds its native integer capacity.');}
  else if(['payment.priceAtomic','payment.taskBudgetAtomic'].includes(path))value=value===''?null:value;
  target[keys.at(-1)]=value;state.documentText=pretty(document);delete state.bindingRaw[path];invalidate();
 }
 function edit(target){
  const key=target.dataset.researchField,input=target.dataset.researchInput,use=target.dataset.researchUse,binding=target.dataset.researchBinding;
  if(!key&&!input&&!use&&!binding)return false;editAllowed();const state=w();
  if(input){if(!Object.hasOwn(LIMITS,input))throw new Error('Select an original Research input kind.');state.inputIds[input]=target.value;
   state.productId='';state.editionId='';state.selectionText='';state.seed=null;state.template=null;invalidate();return true;}
  if(use){const row=sourceRows().find(x=>x.key===target.dataset.sourceKey);if(!row)throw new Error('Choose an original selected source definition.');
   if(!['purpose','rightsStatus','authorityReference','redistribution','retention'].includes(use))throw new Error('Choose a source-use field.');
   state.sourceUseDrafts[row.key]={...row.use,[use]:target.value};invalidate();return true;}
  if(binding){documentEdit(binding,target.value);return true;}
  if(!['kind','sourceUrl','observedAt','fileId','productId','editionId','selectionText','documentText','workshareSelectionText','workshareCaseId','exportInstallationId','exportRevision'].includes(key))throw new Error('Select a retained Research editor field.');
  state[key]=target.value;
  if(key==='productId')state.editionId='';
  if(['productId','editionId'].includes(key)){state.selectionText='';invalidate();}
  else if(['documentText','selectionText'].includes(key)){if(key==='documentText')state.bindingRaw={};invalidate();}
  else touch();return true;
 }
 function adoptReceipt(value,original){
  const state=ctx.state().researchWork;if(!state||state.draftId!==value.draft?.id)return;
  if(original.body.action==='selection.save'&&value.draft.selection?.schema==='stellar-forge.research-installation-selection.v1'){
   state.selectionText=original.body.data.selectionJSON??pretty(value.draft.selection);state.dirty=false;
  }
  if(value.result?.kind==='economic-research'&&value.result.state==='PREPARED_SOURCE'){
   state.prepared=clone(value.result);state.preview=null;state.previewBasis=null;state.dirty=false;
  }
  // Native attachment outcome is adopted only after its exact complete receipt.
  if(original.body.action==='research.attach'){
   if(value.result?.state!=='ATTACHED_RESEARCH_INSTALLATION'||!value.result?.installation?.document)throw new Error('The original attachment receipt omits the complete recomputed Installation.');
   state.attached=clone(value.result);state.preview=null;state.previewBasis=null;
  }
 }
 async function nativePreview(){
  editAllowed();const state=w(),installation=state.attached?.installation;if(ctx.draft()?.requiresCurrentTemplate)throw new Error('This independently received preparation is historical. Read a fresh current Workshare template and save a new explicit selection before another Installation.');
  if(!installation?.document||!installation.preview)throw new Error('Attach the complete prepared Research source through its original request before preview.');
  await ctx.refreshCase();live(state);if(installation.source?.caseId!==ctx.caseId||installation.source.version!==ctx.context().version)
   throw new Error('The original case advanced. Keep this complete edition and prepare from a fresh Workshare selection.');
  const identity=basis(),result=await ctx.api('/api/operations/'+ctx.caseId+'/installation-preview',{expectedVersion:installation.source.version,installationId:state.prepared.selection.installationId,expectedRevision:state.prepared.selection.expectedInstallationRevision,document:clone(installation.document)});live(state);
  if(identity!==basis()||!same(result.document,installation.document)||!same(result.source,installation.source))throw new Error('The current native preview differs from the complete attached Research Installation.');
  state.preview=clone(result);state.previewBasis=identity;ctx.changed();await ctx.persistNow();
  ctx.notice('Reviewed the attached complete Installation. Open its original editor to use the separate explicit Save.');
 }
 async function receiveDraft(){
  editAllowed();const state=w();if(!state.preview||state.previewBasis!==basis())throw new Error('Review the current attached complete Installation first.');
  await ctx.refreshCase();live(state);if(state.preview.source?.version!==ctx.context().version)throw new Error('The case advanced after preview; preserve this result and obtain a current preparation.');
  const result=await ctx.receiveDraft({scope:{caseId:ctx.caseId,version:ctx.context().version},document:clone(state.preview.document),
   preview:clone(state.preview),prepared:clone(state.attached.installation),sourcePreparationId:state.prepared.id,
   sourceDeskDraftId:state.draftId,workshareCaseId:state.workshareCaseId});live(state);
  if(!result?.applied)throw new Error(result?.message||'The original Installation editor did not retain the complete draft.');
  state.receivedDraftKey=result.draftKey;state.dirty=false;ctx.changed();await ctx.persistNow();await ctx.closeToInstallation();
 }
 async function resumeUpload(){
  const state=w(),original=state.pending;if(!original)throw new Error('Select an original pending upload.');
  const observed=await status(original,state);live(state);if(observed.status==='COMPLETE')return observed;
  if(observed.status==='INPUT_RETAINED'){
   try{const result=await ctx.api(prefix(state)+'/requests/'+encodeURIComponent(original.requestId)+'/resume',{actor:original.query.actor});return await adoptUpload(original,result,state);}
   catch(error){return retainError(original,state,error);}
  }
  return sendUpload(original,selectedFiles.get(original.requestId),state);
 }
 async function action(action,target){
  const key=action.slice('research-'.length),state=w();live(state);
  if(key==='working-download'){download(pretty(state),'RESEARCH_SOURCE_WORKING.json');return;}
  if(key==='requests-download'){download(pretty(state.requests),'RESEARCH_SOURCE_REQUESTS.json');return;}
  if(key==='status')return status();
  if(key==='retry')return resumeUpload();
  if(key==='retain-rejected'){
   const original=state.pending;if(!original)throw new Error('Select the original unsuccessful upload.');
   const failure=clone(original.error),observed=await status(original,state);live(state);
   if(!((observed.status==='NOT_RECORDED'&&!observed.inputIntentRetained)||
        (observed.status==='INPUT_RETAINED'&&failure&&[400,422].includes(failure.status))))
    throw new Error('Retain and recover this original unresolved request. Only a confirmed absent upload or completed input-validation failure can leave the active editor.');
   const retained=currentRequest(original,state);retained.priorError=failure;retained.status='RETAINED_UNSUCCESSFUL';retained.retainedAt=new Date().toISOString();
   state.history.push({kind:'unsuccessful-upload',request:clone(retained)});state.pending=null;ctx.changed();await ctx.persistNow();
   ctx.notice('The complete original request and its outcome remain in history. Select corrected original input explicitly.');return;
  }
  if(key==='file-download')return downloadFile(state.files.find(f=>f.id===target.dataset.id));
  if(key==='inspect')return inspect();
  if(key==='open-upload'){
   if(state.pending&&state.pending.requestId!==target.dataset.id)throw new Error('Recover the current original upload before reopening another result.');
   const original=state.requests.find(x=>x.requestId===target.dataset.id);if(!original)throw new Error('Select an original upload.');
   return status(original,state);
  }
  editAllowed();
  if(key==='workshares'){
   const value=await ctx.nativeWorkshares(state.workshareSelectionText.trim()?object(state.workshareSelectionText,'Original Workshare source selection'):null);live(state);state.nativeWorkshares=clone(value.inventory);state.nativeSelection=clone(value.selection);
   state.workshareSelectionText=pretty(value.selection);state.seed=null;state.template=null;invalidate();await ctx.persistNow();return;
  }
  if(key==='template'){
   if(!state.workshareCaseId)throw new Error('Choose the original attached Workshare.');
   const selected=object(state.workshareSelectionText,'Exact original Workshare source selection');await ctx.refreshCase();live(state);
   await ctx.parkWorking('Before replacing the Research Workshare template');live(state);
   const result=await ctx.api(prefix(state)+'/template',{...selected,expectedVersion:ctx.context().version,workshareCaseId:state.workshareCaseId,
    installationId:null,expectedRevision:0});live(state);
   if(result.source?.caseId!==ctx.caseId||result.source.version!==ctx.context().version||result.workshare?.caseId!==state.workshareCaseId||
    !record(result.document)||result.installationId!==null||result.expectedRevision!==0)
    throw new Error('The original Research template changed case, Workshare or Installation identity.');
   state.seed=clone(result);state.template=clone(result.profile??{});state.documentText=pretty(result.document);state.bindingRaw={};invalidate();await ctx.persistNow();return;
  }
  if(key==='compose'){prepareSelection();await ctx.persistNow();return;}
  if(key==='save'){
   if(Object.keys(state.bindingRaw).length)throw new Error('Correct retained unfinished guided fields before recording the selection.');
   const value=object(state.selectionText,'Complete original Research selection');if(value.schema!=='stellar-forge.research-installation-selection.v1')throw new Error('Keep the complete Research selection format.');
   ctx.keepSelection(value);await ctx.persistNow();return ctx.issue('selection.save',{selectionJSON:state.selectionText});
  }
  if(key==='prepare'){
   const selected=ctx.draft()?.selection;if(selected?.schema!=='stellar-forge.research-installation-selection.v1'||state.dirty||!same(selected,object(state.selectionText,'Saved selection')))
    throw new Error('Save the complete current Research selection before native preparation.');
   return ctx.prepare();
  }
  if(key==='preparation-open'){
   await ctx.parkWorking('Before reopening a complete Research preparation');live(state);
   const result=await ctx.readPreparation(target.dataset.id);live(state);if(result.kind!=='economic-research')throw new Error('Select an original Research preparation.');
   if(!Array.isArray(result.originals)||!record(result.selection))throw new Error('The complete preparation omits its original sidecar inventory or selected document.');
   const received=[];
   for(const file of result.originals){
    if(!fileOK(file))throw new Error('A retained Research preparation lost its original full file identity.');
    const value=await ctx.api(prefix(state)+'/inspect',{fileId:file.id,expectedSha256:file.sha256});live(state);
    if(!sameFile(value.file,file)||!record(value.inspection))throw new Error('A reopened original source differs from its frozen preparation.');
    received.push({file:value.file,inspection:value.inspection});
   }
   for(const row of received){const old=state.files.find(f=>f.id===row.file.id);if(old&&!sameFile(old,row.file))throw new Error('Keep the original sidecar provenance unchanged.');if(!old)state.files.push(clone(row.file));state.inspections[row.file.id]=clone(row.inspection);}
   state.prepared=clone(result);state.selectionText=pretty(result.selection);state.documentText=pretty(result.selection.document);
   state.productId=result.selection.product.productId;state.editionId=result.selection.product.editionId;
   state.sourceUseDrafts=Object.fromEntries(result.selection.sourceUses.map(row=>[hash(nativeJSONCanonical({entryId:row.entryId,definitionId:row.definitionId})),Object.fromEntries(['purpose','rightsStatus','authorityReference','redistribution','retention'].map(k=>[k,row[k]]))]));
   state.workshareCaseId=result.selection.document.workshare?.caseId??state.workshareCaseId;
   state.inputIds=Object.fromEntries(Object.keys(LIMITS).map(kind=>[kind,result.selection.inputs.find(x=>x.role===kind)?.fileId??'']));
   state.attached=clone((ctx.draft()?.researchAttachments??[]).filter(x=>x.preparationId===result.id).at(-1)??null);
   state.preview=null;state.previewBasis=null;state.dirty=false;ctx.changed();await ctx.persistNow();return;
  }
  if(key==='attach'){
   if(!state.prepared||state.dirty)throw new Error('Prepare the complete saved Research selection first.');
   await ctx.refreshCase();live(state);
   return ctx.issue('research.attach',{preparationId:state.prepared.id,expectedVersion:ctx.context().version});
  }
  if(key==='preview')return nativePreview();
  if(key==='receive')return receiveDraft();
  if(key==='output-download')return ctx.downloadPrepared(state.prepared,target.dataset.filename);
  if(key==='archive-download'){
   if(!state.prepared||!state.exportInstallationId.trim()||!/^\d+$/.test(state.exportRevision)||Number(state.exportRevision)<1||!Number.isSafeInteger(Number(state.exportRevision)))throw new Error('Enter the actual saved Installation ID and positive revision.');
   const path=prefix(state)+'/preparations/'+encodeURIComponent(state.prepared.id)+'/archive?installationId='+encodeURIComponent(state.exportInstallationId.trim())+'&revision='+state.exportRevision;
   await ctx.verifyStaff();live(state);const receipt=await ctx.api(path+'&describe=1');live(state);
   if(receipt.kind!=='installation-archive'||!Number.isSafeInteger(receipt.bytes)||receipt.bytes<1||receipt.bytes>2*1024*1024*1024||!HEX.test(receipt.sha256??''))throw new Error('Keep the native complete archive identity within2GiB.');
   state.archiveDownload={...clone(receipt),preparationId:state.prepared.id,installationId:state.exportInstallationId.trim(),revision:Number(state.exportRevision)};ctx.changed();await ctx.persistNow();
   return ctx.downloadLarge(path+'&expectedSha256='+receipt.sha256,{...receipt,filename:receipt.name});
  }
  throw new Error('Unknown Research Source Desk action.');
 }

 function fileTable(files){return files.length?table(['Original complete file','Identity and provenance','Download'],files.map(f=>[
  esc(f.name)+'<br>'+esc(f.kind),f.bytes+' bytes<br><code>'+esc(f.sha256)+'</code><br>'+esc(f.sourceUrl)+'<br>'+esc(f.observedAt),
  button('Download original file','file-download','data-id="'+esc(f.id)+'"')])):empty('No complete Research sidecars are retained in this working copy.');}
 function documentFields(){
  const state=w();let document;try{document=object(state.documentText,'Complete Workshare-seeded document');}catch(error){return hint(error.message);}
  const controls=[];
  for(const [path,label,area]of [
   ['source.reference','Original source reference',true],['source.authority','Source authority',true],['source.changePolicy','Source change and withdrawal policy',true],
   ['receiving.application','Receiving application'],['receiving.host','Actual receiving host'],['receiving.operator','Actual receiving operator'],
   ['receiving.acceptanceRule','Acceptance rule',true],['receiving.changeAndWithdraw','Change and withdrawal instructions',true],
   ['receiving.recovery','Recovery instructions',true],['receiving.maintenance','Maintenance instructions',true],
   ['payment.network','Payment network'],['payment.asset','Payment asset'],['payment.recipient','Actual approved recipient'],
   ['payment.priceAtomic','Price, exact atomic units'],['payment.taskBudgetAtomic','Task budget, exact atomic units'],['payment.taskUnits','Whole task count'],
   ['payment.authority','Payment authority',true]
  ]){const [section,key]=path.split('.');if(record(document[section])&&Object.hasOwn(document[section],key)){
   controls.push(field(label,path,state.bindingRaw[path]??document[section][key]??'',{area,wide:area}).replace('data-research-field=','data-research-binding='));}}
  return '<div class="source-desk-fields">'+controls.join('')+'</div>'+
   hint('All original Workshare hours, commercial terms, deployment identities, acceptance checks and additional fields remain in the complete document below. Source use and payment authority are explicit operator decisions.');
 }
 function useFields(){
  return sourceRows().map(row=>'<fieldset><legend>'+esc(row.definition.title||row.entryId)+'</legend>'+
   '<p><code>'+esc(row.entryId)+'</code> · definition <code>'+esc(row.definitionId)+'</code><br>'+esc(row.definition.publisher)+'<br>'+esc(row.definition.url)+'</p>'+
   detail('Original rights, licence and complete definition',row.definition)+detail('Original issued selections and review decisions',{selections:row.selections,reviews:row.reviews})+
   '<div class="source-desk-fields">'+[
    ['purpose','Customer purpose',true],['rightsStatus','Source-use decision',false],['authorityReference','Actual permission or rights reference',true],
    ['redistribution','Redistribution scope and restrictions',true],['retention','Retention and withdrawal requirements',true]
   ].map(([key,label,area])=>field(label,key,row.use[key]??'',key==='rightsStatus'?{choices:[['','Choose explicitly'],['permitted','Permitted for the stated use'],['review-required','Further rights review required'],['not-permitted','Not permitted']]}:{area,wide:area})
    .replace('data-research-field="'+key+'"','data-research-use="'+key+'" data-source-key="'+row.key+'"')).join('')+'</div></fieldset>').join('');
 }
 function render(){
  const state=w(),source=inspection(),product=selectedProduct(),edition=selectedEdition(),pending=state.pending;
  const upload=()=>'<label>Complete original file<input type="file" data-research-upload data-source-edit></label>';
  const selectedInputs=Object.keys(LIMITS).map(kind=>field(kind==='project'?'Full economic project':kind==='issued-package'?'Original issued package':'Related customer return',kind,state.inputIds[kind],{
   choices:[['','Not selected'],...state.files.filter(f=>f.kind===kind).map(f=>[f.id,f.name+' · '+f.sha256.slice(0,12)])],wide:true
  }).replace('data-research-field=','data-research-input=')).join('');
  const prepared=state.prepared,attachments=ctx.draft()?.history??[];
  return '<section class="research-source-desk">'+header('Research customer Installation',
   'Select original issued research, preserve all source files and decisions, and commission it against the actual customer Workshare.',
   button('Download complete Research working fields','working-download')+button('Download original upload requests','requests-download'))+
   (pending?'<section class="source-desk-recovery">'+header('Continue the original file receiving request',pending.query.kind+' · '+pending.requestId)+
    hint(pending.error?.message||pending.status)+detail('Complete retained request and original result',pending)+
    '<div class="source-desk-actions">'+button('Read original status','status')+button('Continue exact original request','retry')+button('Retain unsuccessful input in history','retain-rejected')+'</div>'+
    hint('A retained body resumes inspection without uploading again. If the original request is absent, reselect its exact original file below.')+upload()+'</section>':'')+
   '<h4>1 · Complete original Research files</h4>'+
   '<div class="source-desk-fields">'+field('Original source kind','kind',state.kind,{choices:[['project','Complete economic project · up to 480 MiB'],['issued-package','Issued Research package · up to 256 MiB'],['customer-return','Customer return · up to 256 MiB']]})+
   field('Actual source reference / URL','sourceUrl',state.sourceUrl,{wide:true})+field('Observed at, ISO 8601 with timezone','observedAt',state.observedAt,{help:'Record the actual retrieval or receiving time.'})+
   (!pending?upload():'')+'</div>'+(progress?hint(progress):'')+fileTable(state.files)+
   hint('Original bytes are retained by the native Research reader. Receiving a customer return here does not apply it to any research product.')+
   '<h4>2 · Exact issued product and original sources</h4><div class="source-desk-fields">'+selectedInputs+
   field('Retained file to inspect','fileId',state.fileId,{choices:[['','Choose an original file'],...state.files.map(f=>[f.id,f.name])],wide:true})+'</div>'+
   '<div class="source-desk-actions">'+button('Read original native inspection','inspect','',!state.fileId||!!pending)+'</div>'+
   (state.fileId&&state.inspections[state.fileId]?detail('Complete native inspection without embedded file bodies',state.inspections[state.fileId]):'')+
   '<div class="source-desk-fields">'+field('Original product','productId',state.productId,{choices:[['','Choose a retained product'],...(source?.products??[]).map(p=>[p.id,p.versions.find(v=>v.id===p.currentId)?.definition.title||p.id])],wide:true})+
   field('Immutable issued edition','editionId',state.editionId,{choices:[['','Choose a saved issued edition'],...(product?.editions??[]).map(e=>[e.id,(product.versions.find(v=>v.id===e.definitionId)?.definition.title||product.id)+' · '+e.issuedAt+' · '+e.id])],wide:true})+'</div>'+
   (edition?detail('Exact issued product, requirement order and source selection',{sourceProjectId:sourceProjectId(),productId:product.id,edition,definition:product.versions.find(v=>v.id===edition.definitionId)}):empty('Select a complete project or issued package and its exact product edition.'))+
   '<h4>3 · Explicit source use and rights</h4>'+
   hint('Every original selected source definition needs an explicit purpose, authority reference, redistribution and retention decision. Further review or a refusal remains editable work; it cannot become a prepared Installation.')+
   (edition?useFields():empty('Original source definitions appear after selecting the issued edition.'))+
   '<h4>4 · Original customer Workshare and receiving document</h4>'+
   '<div class="source-desk-actions">'+button('Read attached original Workshares','workshares','',!!pending)+'</div>'+
   '<div class="source-desk-fields">'+field('Actual attached Workshare','workshareCaseId',state.workshareCaseId,{choices:[['','Choose the original Workshare'],...(state.nativeWorkshares?.cases??[]).map(row=>[row.caseId,row.title||row.customer||row.caseId])],wide:true})+
   field('Complete original Workshare source selection','workshareSelectionText',state.workshareSelectionText,{area:true,wide:true,rows:6})+'</div>'+
   '<div class="source-desk-actions">'+button('Read fresh Workshare Installation template','template','',!state.workshareCaseId||!state.workshareSelectionText||!!pending)+'</div>'+
   (state.seed?detail('Original Workshare seed and descriptive Research profile',state.seed)+documentFields():empty('Read the native template to preserve actual Workshare hours, commercial terms and original acceptance checks.'))+
   field('Complete original Installation document','documentText',state.documentText,{area:true,rows:14,wide:true})+
   '<h4>5 · Save selection and prepare</h4>'+
   '<div class="source-desk-actions">'+button('Compose complete selected source document','compose','',!edition||!state.seed||!!pending)+'</div>'+
   field('Complete Research selection, including unfinished work','selectionText',state.selectionText,{area:true,rows:12,wide:true})+
   '<div class="source-desk-actions">'+button('Save exact Research selection','save','',!state.selectionText||!!pending)+button('Prepare saved complete Installation','prepare','',!state.selectionText||state.dirty||!!pending)+'</div>'+
   (prepared?'<p>Original preparation <code>'+esc(prepared.id)+'</code></p>'+detail('Complete native preparation and source-use decisions',prepared)+
    table(['Prepared output','Whole identity','Download'],prepared.files.map(f=>[esc(f.filename),f.bytes+' bytes<br><code>'+esc(f.sha256)+'</code>',button('Download complete output','output-download','data-filename="'+esc(f.filename)+'"')]))+
    '<div class="source-desk-actions">'+button('Attach complete Research source to original case','attach','',state.dirty||!!pending)+button('Preview attached Installation','preview','',!state.attached||!!pending)+
    button('Open original Installation draft','receive','',!state.preview||state.previewBasis!==basis()||!!pending)+'</div>'+
    (ctx.draft()?.requiresCurrentTemplate?hint('This is an independently received original edition. Its saved attachment is historical; another Save requires a fresh current Workshare template and explicit selection.'):'')+(state.attached?detail('Actual original attachment receipt',state.attached):'')+(state.preview?detail('Actual complete native preview',state.preview):'')+
    hint('Use the original Installation editor to save the reviewed edition. Attachment and draft opening do not assert acceptance or payment.'):'')+
   '<h4>6 · Complete receiving package and reopening</h4>'+
   field('Saved original Installation ID','exportInstallationId',state.exportInstallationId??'')+
   field('Saved original Installation revision','exportRevision',state.exportRevision??'')+
   '<div class="source-desk-actions">'+button('Download whole case and Research archive','archive-download','',!prepared)+'</div>'+
   hint('After original Save, select its actual ID and revision. The complete archive includes the whole Operations case, exact large input files, source-use decisions, preparation and manifest. Receive it with the maintained native Research Installation receiver and reopen the same saved edition.')+
   ((ctx.draft()?.preparations??[]).length?table(['Original preparation','Open'],ctx.draft().preparations.map(p=>[esc(p.id),button('Open retained preparation','preparation-open','data-id="'+esc(p.id)+'"')])):'')+
   (state.requests.length?table(['Original upload','State','Read original result'],state.requests.map(r=>[esc(r.query.name)+'<br><code>'+esc(r.requestId)+'</code>',esc(r.status),button('Read retained original receipt','open-upload','data-id="'+esc(r.requestId)+'"')])):'')+
   detail('Original source draft and all native history',{draftId:state.draftId,history:attachments})+'</section>';
 }
 return {render,edit,chooseFile,action,adoptReceipt,validate:validateResearchSourceWork,
  pending:()=>!!ctx.state().researchWork?.pending,dirty:()=>!!ctx.state().researchWork?.dirty,
  dispose(){disposed=true;for(const controller of controllers)controller.abort();selectedFiles.clear();}};
}
