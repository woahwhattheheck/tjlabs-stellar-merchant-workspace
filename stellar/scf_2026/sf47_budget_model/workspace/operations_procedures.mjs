// MIT. Operating procedures in the original Grant Operations case and source history.
import {
  createOperatingPlan,createOperatingStep,operatingPlanDraft,operatingPlanRevision,
  saveOperatingPlanRevision,inspectOperatingPlan,receiveOperatingPlan,
  STEP_STATES,renderOperatingPlanHTML,
} from '../../../scf-starforge-20261009/distribution/discovery/operating-plan.mjs';
import {
  GRANT_PROCEDURE_SCHEMA,GRANT_PROCEDURE_MAX_BYTES,procedureJSON,procedureSha256,packProcedureText,
  inspectGrantProcedure,prepareGrantProcedure,makeProcedureTable,makeProcedureEdition,
  verifyGrantProcedure,procedureCandidates,grantProcedureFiles,
  procedureEditionRoute,procedureEditionSummary,procedureEditionSources,
} from './grant_procedures.mjs';

import {createEngagementWorkingStore} from './engagement-working-store.mjs';

const SESSION='stellar-forge.sf47-grant-procedures.browser.v1',BROWSER_CHECKPOINT_MAX_BYTES=256*1024*1024,sessions=new Map(),stores=new Map();
if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{
  if([...stores.values()].some(store=>{const s=store.inspect();return s.pending||s.transactions||s.failure;})){event.preventDefault();event.returnValue='';}
});
const copy=x=>JSON.parse(JSON.stringify(x)),now=()=>new Date().toISOString(),uid=()=>crypto.randomUUID().replaceAll('-','');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const to64=raw=>{const b=new TextEncoder().encode(raw);let out='';for(let i=0;i<b.length;i+=16384)out+=String.fromCharCode(...b.subarray(i,i+16384));return btoa(out);};
const download=(name,raw,mime='application/json')=>{const url=URL.createObjectURL(raw instanceof Blob?raw:new Blob([raw],{type:mime}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
const button=(label,action,extra='')=>'<button type="button" data-gp-action="'+action+'" '+extra+'>'+esc(label)+'</button>';
const selected=(a,b)=>a===b?' selected':'',checked=x=>x?' checked':'';
const field=(label,key,value,{area=false,rows=3,type='text'}={})=>'<label><span>'+esc(label)+'</span>'+(area?
 '<textarea data-gp-field="'+key+'" rows="'+rows+'">'+esc(value)+'</textarea>':
 '<input data-gp-field="'+key+'" type="'+type+'" value="'+esc(value)+'">')+'</label>';
const details=(label,value)=>'<details><summary>'+esc(label)+'</summary><pre>'+esc(typeof value==='string'?value:procedureJSON(value))+'</pre></details>';
const notice=value=>'<p class="gp-note">'+esc(value)+'</p>';
function definitive(error){return error?.definite===true&&error?.uncertain!==true||Number.isInteger(error?.status)&&
 [400,401,403,404,409,413,422].includes(error.status)&&error.uncertain!==true;}

export function mountGrantProcedures({container,current,api,saveApi=api,mutationId,recordingActor,inform=()=>{},onCase=()=>{},onSources=()=>{}}){
 const root=document.createElement('section');root.className='grant-procedures';root.setAttribute('aria-label','Customer operating procedures');container.replaceChildren(root);
 if(!document.querySelector('link[data-grant-procedures]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/operations_procedures.css';link.dataset.grantProcedures='true';document.head.append(link);}
 const caseId=current.program.id,prefix='/api/operations/'+caseId,key='sf47.grant-procedures.'+caseId;
 let active=true,busy=false,hostBusy=false,loading=true,storageReady=false,caseValue=current,taskComparisons=[];
 let nativeCatalog={forecasts:[],portfolios:[],funding:[],awards:[],errors:[]};
 let storage=stores.get(key);if(!storage){storage=createEngagementWorkingStore({key:'grant-procedures:'+caseId});stores.set(key,storage);}
 const hadMemory=sessions.has(key);
 let legacyRaw=null,legacyProblem='',failedStored=null;
 let state=sessions.get(key);
 if(!state){try{legacyRaw=sessionStorage.getItem(key);const loaded=JSON.parse(legacyRaw||'null');if(loaded?.schema===SESSION&&loaded.caseId===caseId)state=loaded;else if(loaded)legacyProblem='The old browser checkpoint has a different case or schema; download it before selecting a recovery file.';}catch(error){legacyProblem='The old browser checkpoint could not be read: '+error.message;}}
 if(!state)state={schema:SESSION,caseId,drafts:{},selected:null,tab:'procedure',pending:null,accepted:null,notice:'',error:'',savedRefresh:false};
 state.inflight??=null;state.finishing??=null;sessions.set(key,state);
 const available=()=>active&&root.isConnected,$=selector=>root.querySelector(selector),draft=()=>state.drafts[state.selected]||null;
 const pending=()=>Boolean(state.pending||state.accepted||state.inflight),editable=()=>available()&&!loading&&!busy&&!hostBusy&&!pending()&&!state.storageWarning;
 function durableState(){
   const saved={...state,drafts:Object.fromEntries(Object.entries(state.drafts).map(([id,value])=>{
     const entry={...value};if(entry.prepared){entry.prepared={...entry.prepared};delete entry.prepared.document;}return[id,entry];
   }))};
   delete saved.inflight;delete saved.finishing;delete saved.storageWarning;delete saved.originalView;
   return saved;
 }
 function browserCheckpointText(){
   const raw=JSON.stringify(durableState())+'\n';
   if(new TextEncoder().encode(raw).length>BROWSER_CHECKPOINT_MAX_BYTES)
     throw new Error('This complete checkpoint exceeds the256 MiB browser-file receiving bound. Keep the original durable store and export individual working procedures before reducing its inventory.');
   return raw;
 }
 function storageError(error){
   const message=(error.message||String(error)).replaceAll('Contributor','Procedure');
   state.storageWarning='The complete procedure checkpoint was not durably saved. Keep this desk open and download its current checkpoint. '+message;
   if(available()){inform(state.storageWarning,true);controls();const el=$('[data-gp-storage-warning]');if(el)el.textContent=state.storageWarning;}
   return error;
 }
 function persist(critical=false){
   if(!storageReady){
     if(critical)return Promise.reject(storageError(new Error('Open or explicitly reload the original durable procedure checkpoint before native dispatch.')));
     return Promise.resolve(false);
   }
   let attempt;try{attempt=critical?storage.write({copies:[],state:durableState()}):storage.schedule({copies:[],state:durableState()});}
   catch(error){attempt=Promise.reject(error);}
   return attempt.then(()=>{state.storageWarning='';if(available()){const el=$('[data-gp-storage-warning]');if(el)el.textContent='';controls();}return true;},
     error=>{storageError(error);if(critical)throw error;return false;});
 }
 async function validateBrowserState(value){
   if(value?.schema!==SESSION||value.caseId!==caseId||!value.drafts||typeof value.drafts!=='object'||Array.isArray(value.drafts))
     throw new Error('This complete procedure checkpoint belongs to another case or has no original drafts.');
   if(!['procedure','sources','history','saved','receiving'].includes(value.tab)||
      value.selected!==null&&!Object.prototype.hasOwnProperty.call(value.drafts,value.selected)||
      value.pending&&value.accepted)throw new Error('Retain one selected working procedure and one unambiguous original request.');
   for(const [id,entry] of Object.entries(value.drafts)){
     if(!/^(?:local-[a-f0-9]{32}|plan-[a-f0-9]{64}|source-source-[a-f0-9]{32})(?:-received-[a-f0-9]{32})*$/.test(id))
       throw new Error('Retain the original working procedure identity.');
     inspectOperatingPlan(entry.plan);
     const authored=entry.draft,shape=operatingPlanDraft(entry.plan),body=authored?.content;
     if(!authored||authored.schema!==shape.schema||authored.planId!==entry.plan.id||authored.baseRevision!==entry.plan.revisions.length||
       !body||typeof body!=='object'||Array.isArray(body)||Object.keys(authored).some(k=>!['schema','planId','baseRevision','content'].includes(k))||
       Object.keys(body).some(k=>!['title','customer','purpose','period','owner','receiving','notes','steps'].includes(k))||
       !['title','customer','purpose','period','owner','receiving','notes'].every(k=>typeof body[k]==='string')||
       !Array.isArray(body.steps)||body.steps.length>1000)
       throw new Error('Retain the original editable plan identity and complete text fields.');
     const stepIds=new Set();
     for(const step of body.steps){
       if(!step||typeof step!=='object'||Object.keys(step).some(k=>!['id','title','instruction','inputs','expectedResult','owner','due','status','recordedResult','argv','selection','files'].includes(k))||
          !['title','instruction','inputs','expectedResult','owner','due','recordedResult'].every(k=>typeof step[k]==='string')||
          !STEP_STATES.includes(step.status)||stepIds.has(step.id))
         throw new Error('Retain each unfinished step and its original source selection once.');
       // The original validator checks identity/source/files, while editable text may remain incomplete.
       createOperatingStep({id:step.id,title:'Unfinished step validation',selection:step.selection,argv:step.argv,...(step.files===undefined?{}:{files:step.files})});
       stepIds.add(step.id);
     }
     if(entry.invalidArgv!==undefined&&(!entry.invalidArgv||typeof entry.invalidArgv!=='object'||Array.isArray(entry.invalidArgv)||
       Object.entries(entry.invalidArgv).some(([id,text])=>!stepIds.has(id)||typeof text!=='string')))
       throw new Error('Retain unfinished argument text with its original step.');
     if(!Array.isArray(entry.sourceIds)||!entry.sourceIds.every(x=>typeof x==='string')||
       !Array.isArray(entry.tables)||!entry.tables.every(x=>x&&typeof x.key==='string')||
       !Array.isArray(entry.stepLinks)||!entry.stepLinks.every(x=>x&&typeof x.stepId==='string'&&
         ['sourceIds','tableKeys','editionKeys'].every(k=>Array.isArray(x[k])&&x[k].every(v=>typeof v==='string'))))
       throw new Error('Retain the complete original source, table and step-link selections.');
     if(!Array.isArray(entry.editions))throw new Error('Retain the full native edition selections in this browser checkpoint.');
     for(const item of entry.editions)if(item.originalText!==undefined)await retainedEdition(item,entry);
   }
   const waiting=value.pending||value.accepted;
   if(waiting){
     const original=await inspectGrantProcedure(waiting.raw),p=waiting.payload;
     if(original.document.case.id!==caseId||p?.action!=='source.add'||p.expectedVersion!==original.document.case.version||
       p.actor!==original.document.actor||p.data?.contentBase64!==to64(waiting.raw)||
       p.data.filename!=='grant-procedure-'+original.document.editionId+'.json'||!value.drafts[waiting.draftKey]||
       !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(p.requestId||''))
       throw new Error('The complete pending source and original request do not match.');
   }
   return value;
 }

 function controls(){
   root.setAttribute('aria-busy',String(loading||busy||hostBusy||!!state.inflight));
   for(const el of root.querySelectorAll('button,input,textarea,select')){
     el.disabled=el.dataset.gpFixed==='true'||loading||busy||hostBusy||!!state.inflight||((pending()||state.storageWarning)&&el.dataset.gpRecovery!=='true'&&el.dataset.gpView!=='true');
     if(el.dataset.gpSave==='true'&&(!draft()?.prepared||caseValue.program.state!=='OPEN'))el.disabled=true;
   }
 }
 async function run(fn){
   if(!available()||loading||busy||hostBusy||state.inflight)return;
   busy=true;state.error='';controls();
   try{return await fn();}
   catch(error){state.error=error.message||String(error);if(available())inform(state.error,true);}
   finally{busy=false;persist();if(available())render();}
 }
 const stopIfPending=()=>{if(pending())throw new Error('Reconcile the retained original save before editing or selecting another procedure.');};
 function invalidate(){const d=draft();if(d)d.prepared=null;state.error='';persist();const el=$('[data-gp-prepared]');if(el)el.textContent='Draft changed. Review its complete sources before saving.';controls();}
 async function readBytes(meta){
   const response=await saveApi(prefix+'/sources/'+encodeURIComponent(meta.id),undefined,{download:true});
   const raw=new Uint8Array(await response.arrayBuffer());
   if(raw.length!==meta.bytes||raw.length>GRANT_PROCEDURE_MAX_BYTES||await procedureSha256(raw)!==meta.sha256)throw new Error('The complete original source differs: '+meta.id);
   return raw;
 }
 const readText=async meta=>new TextDecoder('utf-8',{fatal:true}).decode(await readBytes(meta));
 const readers=value=>({current:value,readSource:async id=>{const m=value.sources.find(x=>x.id===id);if(!m)throw new Error('The original source is absent: '+id);return readBytes(m);},
  readEdition:async(kind,ref)=>saveApi(prefix+procedureEditionRoute(kind,ref))});
 // Source catalogs describe choices only. The selected full native view supplies the immutable identity.
 async function readNativeCatalog(value){
   const definitions=[['tasks','/task-outcomes','comparisons'],['forecasts','/forecasts','forecasts'],
     ['portfolios','/portfolios','portfolios'],['funding','/cost-funding','history'],['awards','/award-terms','terms']];
   const result={forecasts:[],portfolios:[],funding:[],awards:[],tasks:[],errors:[]};
   await Promise.all(definitions.map(async([name,path,property])=>{
     try{
       const response=await saveApi(prefix+path);
       if(!Array.isArray(response?.[property]))throw new Error('The original '+name+' listing is incomplete.');
       result[name]=response[property];
     }catch(error){result.errors.push({kind:name,message:error.message||String(error)});}
   }));
   const after=await saveApi(prefix);
   if(after?.program?.id!==caseId||after.program.version!==value.program.version)
     throw new Error('The case changed while reading saved edition choices. Refresh the case; existing selected originals remain retained.');
   return result;
 }
 const editionKey=x=>x.kind+':'+x.id+':'+x.revision;
 function editionLabel(x){
   if(typeof x.originalText==='string'){
     try{const summary=procedureEditionSummary(x.kind,JSON.parse(x.originalText));return summary.label+' · '+summary.revisionLabel;}
     catch{return x.kind+' · '+x.id+' · original needs review';}
   }
   return x.kind+' · '+x.id+' · '+(['forecast','portfolio'].includes(x.kind)?'Saved case v':'r')+x.revision;
 }
 async function retainedEdition(item,d,{captureLegacy=false}={}){
   let raw=item.originalText;
   // An older browser draft may already carry the exact selected bytes in its prepared source.
   if(raw===undefined&&d?.prepared?.raw){
     const prepared=await inspectGrantProcedure(d.prepared.raw);
     raw=prepared.document.editions.find(x=>x.kind===item.kind&&x.ref.id===item.id&&x.ref.revision===item.revision)?.original.text;
   }
   if(raw===undefined){
     if(!captureLegacy)throw new Error('Read the complete original for '+editionLabel(item)+' before reviewing this older working draft.');
     raw=JSON.stringify(await saveApi(prefix+procedureEditionRoute(item.kind,item)))+'\n';
   }
   if(typeof raw!=='string')throw new Error('Keep the complete selected native edition text.');
   const captured=await makeProcedureEdition(item.kind,raw);
   if(captured.ref.id!==item.id||captured.ref.revision!==item.revision||
      (item.sha256!==undefined&&item.sha256!==captured.ref.sha256))
     throw new Error('The retained original does not match its selected native record and edition.');
   return captured;
 }
 function checkEditionSourceMembership(kind,view,value=caseValue){
   for(const required of procedureEditionSources(kind,view)){
     const actual=value.sources.find(x=>x.id===required.id);
     if(!actual||actual.sha256!==required.sha256||actual.bytes!==required.bytes)
       throw new Error('Refresh and review this original case before selecting its complete source '+required.id+'.');
   }
 }
 function selectedEditionMaterials(d){
   const results=[];
   for(let i=0;i<d.editions.length;i++){
     const item=d.editions[i];
     try{
       const view=typeof item.originalText==='string'?JSON.parse(item.originalText):null;
       results.push({item,index:i,summary:view?procedureEditionSummary(item.kind,view):null,
         sources:view?procedureEditionSources(item.kind,view):[]});
     }catch(error){results.push({item,index:i,summary:null,sources:[],error:error.message});}
   }
   return results;
 }
 function nativeChoices(){
   return [
     ...(caseValue.installations||[]).map(x=>({kind:'installation',id:x.id,revision:x.revision,label:(x.name||x.id)+' · Installation r'+x.revision})),
     ...taskComparisons.map(x=>({kind:'task-outcome',id:x.id,revision:x.revision,label:(x.title||x.id)+' · Task comparison r'+x.revision})),
     ...nativeCatalog.forecasts.map(x=>({kind:'forecast',id:x.id,revision:0,label:(x.name||x.title||x.id)+' · Forecast · exact saved version read on selection'})),
     ...nativeCatalog.portfolios.map(x=>({kind:'portfolio',id:x.id,revision:0,label:(x.name||x.title||x.id)+' · Portfolio · exact saved version read on selection'})),
     ...nativeCatalog.funding.map(x=>({kind:'cost-funding',id:'cost-funding',revision:x.revision,label:(x.title||'Cost funding')+' · r'+x.revision+' · saved case v'+x.caseVersion})),
     ...nativeCatalog.awards.map(x=>({kind:'award-terms',id:x.id,revision:x.revision,label:(x.title||x.id)+' · Award terms r'+x.revision+' · '+(x.stage||'')})),
   ];
 }
 function nativeSelectionControl({changed=false}={}){
   const control=$('[data-gp-native-revision]'),choice=$('[data-gp-native-choice]');
   if(!control||!choice)return;
   const d=draft(),[kind,,revision]=choice.value.split('|'),fixed=['forecast','portfolio'].includes(kind);
   if(changed&&d){d.nativeSelection={choice:choice.value,revision:fixed?'':revision||'1'};persist();}
   control.value=fixed?'':d?.nativeSelection?.choice===choice.value?d.nativeSelection.revision:revision||'1';control.dataset.gpFixed=String(fixed||!kind);
   control.placeholder=fixed?'From the complete saved record':'';
   const hint=$('[data-gp-revision-hint]');if(hint)hint.textContent=fixed?'This ID selects one immutable save. Its original case version is read from the full record.':'Select the exact saved revision; changing this choice does not change a previously retained edition.';
   controls();
 }
 async function retainLegacyOriginal(item,d){
   const captured=await retainedEdition(item,d,{captureLegacy:true});
   if(!available()||draft()!==d)throw new Error('The original procedure desk changed during source receiving.');
   if(item.originalText===undefined){item.originalText=captured.original.text;item.sha256=captured.ref.sha256;persist();}
   return captured;
 }
 async function inspectSelectedEdition(item,d,{comparison=false}={}){
   const captured=await retainLegacyOriginal(item,d),view=JSON.parse(captured.original.text);
   if(!available()||draft()!==d)throw new Error('The original procedure desk changed during source receiving.');
   const displayed={kind:item.kind,ref:captured.ref,summary:procedureEditionSummary(item.kind,view),original:view};
   if(comparison){
     const fresh=await saveApi(prefix),currentView=await saveApi(prefix+procedureEditionRoute(item.kind,item));
     const currentEdition=await makeProcedureEdition(item.kind,procedureJSON(currentView));
     const after=await saveApi(prefix);
     if(fresh?.program?.id!==caseId||after?.program?.id!==caseId||fresh.program.version!==after.program.version)
       throw new Error('The case changed during current-source comparison. The captured original remains unchanged.');
     if(currentEdition.ref.id!==captured.ref.id||currentEdition.ref.revision!==captured.ref.revision||
        currentEdition.ref.sha256!==captured.ref.sha256)
       throw new Error('The current native record does not match the selected immutable edition.');
     if(!available()||draft()!==d)throw new Error('The original procedure desk changed during source comparison.');
     displayed.comparison={checkedAt:now(),caseVersion:after.program.version,
       selectedIdentityMatches:true,summary:procedureEditionSummary(item.kind,currentView),view:currentView,
       interpretation:'Current source context is shown beside the captured original. Full procedure review verifies all retained bytes and preceding history; this read does not rebase any selection.'};
   }
   state.originalView=displayed;
   state.notice=comparison?'Read current context beside the exact retained original. No selection or prior source bytes changed.':'Read the complete captured original and its source identities.';
   return {captured,view};
 }
 function nativeEditionCards(d){
   return selectedEditionMaterials(d).map(({item,index,summary,sources,error})=>{
     const changes=summary?.sourceChanged?notice('Source changes were present in the captured view. Read current source comparison to inspect today’s context.'):
       summary?.laterEditionAvailable?notice('A later native edition was already available when this original was captured. The selected edition stays pinned.'):'';
     return '<article class="gp-material"><div><strong>'+esc(editionLabel(item))+'</strong><small>'+esc(item.id)+
       (item.sha256?' · '+esc(item.sha256):' · complete original not yet retained in this older browser draft')+'</small>'+
       (summary?'<small>Saved case v'+esc(summary.caseVersion)+' · '+esc(item.kind)+'</small>':'')+changes+
       (error?'<p class="gp-error">'+esc(error)+'</p>':'')+
       '<div class="gp-actions">'+button('Read captured original','edition-read','data-index="'+index+'" data-gp-view="true"')+
       button('Compare current source','edition-compare','data-index="'+index+'" data-gp-view="true"')+
       button('Download captured JSON','edition-json','data-index="'+index+'" data-gp-view="true"')+
       button('Download native delivery ZIP','edition-zip','data-index="'+index+'" data-gp-view="true"')+
       button('Remove selection','edition-remove','data-index="'+index+'"')+'</div>'+
       (sources.length?'<details><summary>'+sources.length+' complete native source file(s)</summary>'+
         sources.map((meta,j)=>'<div class="gp-material"><div><strong>'+esc(meta.filename)+'</strong><small>'+esc(meta.id)+' · '+meta.bytes+' bytes · '+esc(meta.sha256)+'</small></div>'+
           button('Read source','edition-source-read','data-index="'+index+'" data-source-index="'+j+'" data-gp-view="true"')+
           button('Download source','edition-source-download','data-index="'+index+'" data-source-index="'+j+'" data-gp-view="true"')+'</div>').join('')+'</details>':
         notice('This complete native edition carries its original content in the captured JSON.'))+'</div></article>';
   }).join('');
 }

 function editableDocument(plan,{operatingPlanText=procedureJSON(plan),sourceId=null,procedure=null}={}){
   return {plan,operatingPlanText,draft:operatingPlanDraft(plan,procedure?.selectedRevision),selectedRevision:procedure?.selectedRevision??plan.revisions.length,
     reviewedVersion:caseValue.program.version,parentSourceId:sourceId,sourceIds:procedure?.sources.map(x=>x.id)||[],
     tables:procedure?.sourceTables.map(x=>({key:x.key,origin:'preceding-procedure',table:copy(x)}))||[],
     editions:procedure?.editions.map(x=>({kind:x.kind,id:x.ref.id,revision:x.ref.revision,sha256:x.ref.sha256,originalText:x.original.text}))||[],
     stepLinks:copy(procedure?.stepLinks||[]),note:'',prepared:null,verification:null};
 }
 async function addOperatingPlan(raw){
   const incoming=inspectOperatingPlan(JSON.parse(raw.replace(/^\uFEFF/,''))),id='plan-'+await procedureSha256(raw);
   const samePlan=Object.values(state.drafts).filter(x=>x.plan?.id===incoming.id);
   for(const existing of samePlan)receiveOperatingPlan(incoming,existing.plan);
   if(!state.drafts[id])state.drafts[id]=editableDocument(incoming,{operatingPlanText:raw});
   state.selected=id;state.tab='procedure';state.originalView=null;state.notice='Opened the complete Operating Plan history. Recorded step states remain authored statements.';persist();
 }
 async function openSource(sourceId){
   stopIfPending();
   const meta=caseValue.sources.find(x=>x.id===sourceId);if(!meta)throw new Error('Refresh the original case before opening this source.');
   const raw=await readText(meta),inspected=await inspectGrantProcedure(raw);
   const verified=await verifyGrantProcedure(raw,{...readers(caseValue),sourceId});
   const key='source-'+sourceId;
   if(!state.drafts[key])state.drafts[key]=editableDocument(inspected.plan,{operatingPlanText:inspected.document.operatingPlan.text,sourceId,procedure:inspected.document});
   state.drafts[key].verification=verified;state.selected=key;state.tab='procedure';state.originalView=null;state.notice='Reopened the original procedure, selected source editions and full history from this case.';persist();
 }
 async function refreshCase({review=false}={}){
   const next=await saveApi(prefix);if(next?.program?.id!==caseId)throw new Error('The returned case differs from this original workspace selection.');
   const catalog=await readNativeCatalog(next);
   if(!available())throw new Error('The original procedure desk closed during case refresh.');
   caseValue=next;taskComparisons=catalog.tasks;nativeCatalog=catalog;
   if(review&&draft()){draft().reviewedVersion=next.program.version;draft().prepared=null;
     state.notice='The draft now explicitly selects case version '+next.program.version+'. Existing table and edition choices remain visible for review.';}
   persist();return next;
 }
 async function chooseFile(accept){
   return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=accept;
     input.addEventListener('change',()=>resolve(input.files?.[0]||null),{once:true});input.addEventListener('cancel',()=>resolve(null),{once:true});input.click();});
 }
 async function fileText(file,{checkpoint=false}={}){
   const limit=checkpoint?BROWSER_CHECKPOINT_MAX_BYTES:GRANT_PROCEDURE_MAX_BYTES;
   if(file.size>limit)throw new Error(checkpoint?'Keep a complete browser checkpoint within256 MiB. The original file remains untouched.':'Keep the complete original within the native8 MiB source limit.');
   return new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
 }
 async function prepare(){
   stopIfPending();const d=draft();if(!d)throw new Error('Create or open an Operating Plan first.');
   const fresh=await saveApi(prefix);
   if(fresh?.program?.id!==caseId||fresh.program.version!==d.reviewedVersion)throw new Error('The case changed. Keep this draft and use Review current case before preparing its sources.');
   caseValue=fresh;
   const authored=saveOperatingPlanRevision(d.plan,d.draft,{savedAt:now()});
   // Preserve the exact received text when no content change made a revision.
   const planRaw=authored.revisions.length===d.plan.revisions.length?d.operatingPlanText:procedureJSON(authored);
   const sourceTables=[];
   for(const item of d.tables){
     if(item.origin==='preceding-procedure'){
       if(!d.parentSourceId)throw new Error('The original preceding procedure must remain selected for its retained table.');
       sourceTables.push(copy(item.table));
     }else if(item.origin==='case-plan'){
       if(!caseValue.plan.planning?.sourceTables)throw new Error('This pinned native plan has no retained Source Tables project.');
       sourceTables.push(await makeProcedureTable({key:item.key,origin:item.origin,
         originalText:procedureJSON(caseValue.plan.planning.sourceTables),nativePlanText:procedureJSON(caseValue.plan)}));
     }else if(item.origin==='case-source'){
       const metadata=caseValue.sources.find(x=>x.id===item.sourceId);if(!metadata)throw new Error('The selected table source is absent.');
       sourceTables.push(await makeProcedureTable({key:item.key,origin:item.origin,metadata,originalText:await readText(metadata)}));
     }else sourceTables.push(await makeProcedureTable({key:item.key,origin:'local-original',originalText:item.originalText}));
   }
   const editions=[];
   for(const item of d.editions){
     editions.push(await retainedEdition(item,d));
   }
   let parent=null;
   if(d.parentSourceId){
     const metadata=caseValue.sources.find(x=>x.id===d.parentSourceId);if(!metadata)throw new Error('The preceding native procedure is absent.');
     parent={metadata,original:await packProcedureText(await readText(metadata))};
   }
   const prepared=await prepareGrantProcedure({current:caseValue,operatingPlanText:planRaw,selectedRevision:authored.revisions.length,
     actor:recordingActor(),note:d.note,sourceTables,editions,sourceIds:d.sourceIds,stepLinks:d.stepLinks,parent});
   prepared.verification=await verifyGrantProcedure(prepared.document,readers(caseValue));
   const after=await saveApi(prefix);
   if(after.program.id!==caseId||after.program.version!==caseValue.program.version)throw new Error('The case advanced during source verification. Keep the draft and explicitly review the new version.');
   d.prepared={raw:prepared.raw,filename:prepared.filename,bytes:prepared.bytes,sha256:prepared.sha256,
     summary:prepared.summary,verification:prepared.verification,document:prepared.document};
   state.notice='Reviewed the complete procedure and its originals against case version '+caseValue.program.version+'. Saving will use this exact prepared text.';
   persist();
 }
 async function finishAccepted(){
   if(state.finishing)return state.finishing;
   const task=finishAcceptedBody();state.finishing=task;
   try{return await task;}finally{if(state.finishing===task)state.finishing=null;}
 }
 async function finishAcceptedBody(){
   const accepted=state.accepted;if(!accepted)return;
   const result=accepted.result,original=accepted.payload,document=JSON.parse(accepted.raw);
   if(result?.id!==caseId||result.action!=='source.add'||result.kind!=='source'||result.version!==original.expectedVersion+1||
      !/^source-[a-f0-9]{32}$/.test(result.recordId||''))throw new Error('The actual native source response differs from this prepared save.');
   const next=await saveApi(prefix);
   if(next?.program?.id!==caseId||next.program.version<result.version)throw new Error('The original native case has not returned the saved version.');
   const meta=next.sources.find(x=>x.id===result.recordId);if(!meta||meta.filename!==original.data.filename)throw new Error('The original procedure source has not appeared in its case.');
   if(await readText(meta)!==accepted.raw)throw new Error('The reopened source differs from the exact saved procedure bytes.');
   const inspected=await inspectGrantProcedure(accepted.raw),verified=await verifyGrantProcedure(accepted.raw,{...readers(next),sourceId:meta.id});
   const d=state.drafts[accepted.draftKey];if(!d)throw new Error('Keep the original pending draft until its source return is reconciled.');
   const retained=editableDocument(inspected.plan,{operatingPlanText:document.operatingPlan.text,sourceId:meta.id,procedure:document});
   retained.reviewedVersion=next.program.version;retained.verification=verified;
   state.drafts['source-'+meta.id]=retained;state.selected='source-'+meta.id;
   d.savedSourceId=meta.id;d.prepared=null;state.accepted=null;state.savedRefresh=true;caseValue=next;
   state.notice='Saved and independently reopened '+meta.filename+' at native case version '+result.version+'.';await persist(true);
   if(available()){state.savedRefresh=false;persist();await onCase(next,result);}
 }
 async function sendPending(){
   if(state.inflight){await state.inflight;if(state.accepted)await finishAccepted();return;}
   if(state.accepted){await finishAccepted();return;}
   if(!state.pending)return;
   const original=state.pending;
   const task=(async()=>{
     await persist(true);
     let result;
     try{result=await saveApi(prefix+'/command',original.payload);}
     catch(error){
       if(definitive(error)){
         state.rejected={...original,error:{code:error.code??null,status:error.status??null,message:error.message},at:now()};
         state.pending=null;const d=state.drafts[original.draftKey];if(d)d.prepared=null;
       }
       persist();throw error;
     }
     state.accepted={...original,result};state.pending=null;await persist(true);
   })();
   state.inflight=task;
   try{await task;}finally{state.inflight=null;}
   await finishAccepted();
 }
 async function save(){
   if(state.pending||state.accepted){await sendPending();return;}
   const d=draft();if(!d?.prepared)throw new Error('Review the complete draft and original sources before saving.');
   const p=d.prepared,doc=JSON.parse(p.raw),actor=recordingActor();
   if(actor!==doc.actor)throw new Error('The recording operator changed. Review the procedure again with that operator.');
   const payload={expectedVersion:doc.case.version,actor,action:'source.add',
     data:{kind:'other',filename:p.filename,contentBase64:to64(p.raw),mediaType:'application/json',sourceUrl:'',observedAt:doc.createdAt},note:doc.note};
   payload.requestId=await mutationId('operations:'+caseId,payload);
   state.pending={draftKey:state.selected,payload,raw:p.raw};await persist(true);await sendPending();
 }
 function stepLinks(id){
   const d=draft();let row=d.stepLinks.find(x=>x.stepId===id);
   if(!row){row={stepId:id,sourceIds:[],tableKeys:[],editionKeys:[],note:''};d.stepLinks.push(row);}return row;
 }
 function sourceOptions(){
   const d=draft();return [
     ...d.sourceIds.map(id=>['sourceIds',id,caseValue.sources.find(x=>x.id===id)?.filename||id]),
     ...d.tables.map(x=>['tableKeys',x.key,'Table · '+x.key]),
     ...d.editions.map(x=>['editionKeys',editionKey(x),editionLabel(x)]),
   ];
 }
 function planPane(d){
   const body=d.draft.content;
   return '<div class="gp-grid">'+field('Procedure title','title',body.title)+field('Customer / team','customer',body.customer)+
     field('Operating owner','owner',body.owner)+field('Period or repeat trigger','period',body.period)+
     field('Useful result','purpose',body.purpose,{area:true})+field('Receiving and continuation','receiving',body.receiving,{area:true})+
     field('Procedure notes','notes',body.notes,{area:true})+field('Case source note','note',d.note,{area:true})+'</div>'+
     notice('The complete plan has '+d.plan.revisions.length+' saved revision(s). Draft edits become a new original Operating Plan revision when the procedure is saved into this case.')+
     '<div class="gp-actions">'+button('Add operating step','add-step')+button('Open selected revision preview','preview','data-gp-view="true"')+'</div>'+
     d.draft.content.steps.map((step,i)=>{
       const links=d.stepLinks.find(x=>x.stepId===step.id)||{sourceIds:[],tableKeys:[],editionKeys:[],note:''};
       return '<details class="gp-step" data-gp-step="'+esc(step.id)+'"'+(i===0?' open':'')+'><summary>'+(i+1)+'. '+esc(step.title)+' · '+esc(step.status)+'</summary>'+
         '<div class="gp-actions">'+button('Move up','step-up','data-id="'+esc(step.id)+'"'+(i===0?' data-gp-fixed="true"':''))+
         button('Move down','step-down','data-id="'+esc(step.id)+'"'+(i===d.draft.content.steps.length-1?' data-gp-fixed="true"':''))+
         button('Remove from draft','step-remove','data-id="'+esc(step.id)+'"')+'</div>'+
         '<div class="gp-grid">'+field('Step title','title',step.title)+field('Step owner','owner',step.owner)+field('Due date','due',step.due,{type:'date'})+
         '<label><span>Recorded status</span><select data-gp-field="status">'+STEP_STATES.map(x=>'<option value="'+x+'"'+selected(x,step.status)+'>'+esc(x)+'</option>').join('')+'</select></label>'+
         field('Work instructions','instruction',step.instruction,{area:true})+field('Inputs','inputs',step.inputs,{area:true})+
         field('Expected complete result','expectedResult',step.expectedResult,{area:true})+field('Recorded result and observation limits','recordedResult',step.recordedResult,{area:true})+
         field('Command arguments · JSON string array','argv',d.invalidArgv?.[step.id]??JSON.stringify(step.argv),{area:true})+
         '<label><span>Selected original sources for this step</span><select multiple size="4" data-gp-links>'+sourceOptions().map(([kind,id,label])=>
           '<option value="'+esc(kind+'|'+id)+'"'+(links[kind].includes(id)?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>'+
         field('Source / result interpretation','link-note',links.note,{area:true})+'</div>'+
         (step.selection?details('Original registration, source and runtime',step.selection):notice('Manual operating step. You can import a complete Operating Plan from Command finder to retain selected installed registrations.'))+'</details>';
     }).join('')+(body.steps.length?'':notice('Add the complete work steps, inputs, expected result and receiving instructions.'));
 }
 function sourcesPane(d){
   const currentSources=caseValue.sources;
   return notice('Choose complete original inputs. A source table retains its source rows, mapping, selected editions and reviews. The native case ZIP retains every case source.')+
     '<h4>Source-table projects</h4><div class="gp-actions">'+button('Select pinned plan tables','table-plan')+
     button('Open original table JSON','table-file')+'</div>'+
     '<div class="gp-inline"><label>Existing case JSON <select data-gp-table-source><option value="">Select original source</option>'+
       currentSources.filter(x=>x.mediaType==='application/json').map(x=>'<option value="'+x.id+'">'+esc(x.filename)+'</option>').join('')+'</select></label>'+
       button('Use selected source table','table-source')+'</div>'+
     d.tables.map((x,i)=>'<article class="gp-material"><div><strong>'+esc(x.key)+'</strong> · '+esc(x.origin)+
       (x.sourceId?' · '+esc(x.sourceId):'')+'</div>'+button('Remove selection','table-remove','data-index="'+i+'"')+
       (x.table?details('Retained original table binding',x.table.selection):'')+'</article>').join('')+
     '<h4>Original case source links</h4><div class="gp-sources">'+currentSources.map(m=>'<label><input type="checkbox" data-gp-source="'+m.id+'"'+checked(d.sourceIds.includes(m.id))+
       '> <span>'+esc(m.filename)+'<small>'+esc(m.kind)+' · '+m.bytes+' bytes · '+esc(m.sha256.slice(0,16))+'</small></span></label>').join('')+'</div>'+
     '<h4>Saved native editions</h4>'+notice('Select an exact Installation, task comparison, Forecast, Portfolio, Cost funding or Award terms edition. Forecasts and Portfolios use their immutable saved case version. Source changes remain separate from authored step status; selecting an edition does not record a payment, award or completed work.')+
     (nativeCatalog.errors.length?details('Saved edition lists requiring attention',nativeCatalog.errors):'')+
     '<div class="gp-inline"><label>Saved record <select data-gp-native-choice><option value="">Select a saved edition</option>'+
       nativeChoices().map(x=>{const value=x.kind+'|'+x.id+'|'+x.revision;return '<option value="'+esc(value)+'"'+selected(value,d.nativeSelection?.choice)+'>'+esc(x.label)+'</option>';}).join('')+
       '</select></label><label>Selected revision <input data-gp-native-revision type="number" min="1" value="1"><small data-gp-revision-hint>Select an exact saved revision.</small></label>'+
       button('Retain selected native edition','edition-add')+'</div>'+
       nativeEditionCards(d)+(state.originalView?details('Selected original and source review',state.originalView):'');
 }
 function historyPane(d){
   return notice('Every prior revision remains in the original plan. Restoring older content creates a draft against the current complete history.')+
     '<table><thead><tr><th>Revision</th><th>Saved at</th><th>Title / steps</th><th>Actions</th></tr></thead><tbody>'+
     d.plan.revisions.map(r=>'<tr><td>'+r.revision+'</td><td>'+esc(r.savedAt)+'</td><td>'+esc(r.title)+' · '+r.steps.length+'</td><td>'+
       button('Preview','revision-preview','data-revision="'+r.revision+'" data-gp-view="true"')+
       button('Restore content to draft','revision-restore','data-revision="'+r.revision+'"')+'</td></tr>').join('')+'</tbody></table>'+
     details('Complete original Operating Plan JSON',d.operatingPlanText);
 }
 function savedPane(){
   return '<div class="gp-actions">'+button('Refresh case sources','refresh')+button('Open original Sources section','sources-section')+'</div>'+
     procedureCandidates(caseValue).map(m=>'<article class="gp-material"><div><strong>'+esc(m.filename)+'</strong><small>'+esc(m.id)+' · '+m.bytes+' bytes · '+esc(m.sha256)+'</small></div>'+
       button('Reopen complete procedure','open-source','data-id="'+m.id+'"')+'</article>').join('')+
     notice('Every save adds an immutable original source to the existing case. No earlier source or Operating Plan revision is replaced.');
 }
 function receivingPane(d){
   const hasSource=!!d.parentSourceId;
   return '<h4>Hand over the complete editable case</h4>'+
     notice('Download the original case ZIP and the selected procedure JSON together. Import the ZIP through Open case / Import in the receiving Grant Operations application, then open Operating procedures and its retained source. The native importer gives the received case its own ID and keeps all original sources and history.')+
     '<div class="gp-actions">'+button('Download original case ZIP','case-zip','data-gp-view="true"')+
       button('Download complete Operating Plan','download-plan','data-gp-view="true"')+
       button('Download saved procedure JSON','download-source','data-gp-view="true"'+(!hasSource?' data-gp-fixed="true"':''))+
       button('Download readable HTML','download-html','data-gp-view="true"')+'</div>'+
     notice('The installed grant-procedures export / inspect / receive commands publish and verify one complete delivery directory, including every readable member and the original case ZIP. Use the same retained request ID to resume a native save or import.')+
     details('Native CLI handover selection',{caseId,caseVersion:caseValue.program.version,sourceId:d.parentSourceId})+
     (d.verification?details('Actual original-source receiving check',d.verification):notice('Reopen a saved procedure to check its full native source and preceding history.'))+
     (d.prepared?details('Prepared source verification',d.prepared.verification):'');
 }
 function render(){
   if(!available())return;
   const d=draft(),count=Object.keys(state.drafts).length;
   root.innerHTML='<div class="gp-heading"><div><h3>Operating procedures</h3><p>Complete customer work, original inputs and receiving instructions in this case.</p></div>'+
     '<div class="gp-actions">'+button('New procedure','new')+button('Open Operating Plan JSON','import-plan')+
     button('Download browser checkpoint','checkpoint','data-gp-view="true"')+button('Restore browser checkpoint','restore-checkpoint')+
     button('Save durable checkpoint','storage-retry','data-gp-recovery="true"')+button('Reload stored checkpoint','storage-reload','data-gp-recovery="true"')+'</div></div>'+
     '<p class="gp-status" role="status">'+esc(state.notice)+'</p><p class="gp-error" role="alert">'+esc(state.error)+'</p>'+
     '<p class="gp-error" data-gp-storage-warning>'+esc(state.storageWarning||'')+'</p>'+
     (legacyProblem?notice(legacyProblem)+button('Download original old checkpoint','legacy-download','data-gp-view="true"'):'')+
     (failedStored?button('Download original stored record','stored-download','data-gp-view="true"'):'')+
     (state.rejected?details('Definitive original save rejection',state.rejected):'')+
     (pending()?'<section class="gp-recovery"><h4>Original save awaiting reconciliation</h4>'+notice('The exact prepared source and request ID remain retained. Resume that original request; do not prepare a replacement.')+
       button('Reconcile original save','resume','data-gp-recovery="true"')+details('Original request identity',{
         caseId,requestId:state.pending?.payload.requestId||state.accepted?.payload.requestId,returned:!!state.accepted})+'</section>':'')+
     '<div class="gp-inline"><label>Local working procedure <select data-gp-draft><option value="">Select a draft</option>'+
       Object.entries(state.drafts).map(([id,x])=>'<option value="'+esc(id)+'"'+selected(id,state.selected)+'>'+esc(x.draft?.content.title||x.plan.id)+
         (x.parentSourceId?' · saved source':' · local draft')+'</option>').join('')+'</select></label>'+
       '<span>'+count+' retained draft'+(count===1?'':'s')+' · Native case version '+caseValue.program.version+'</span></div>'+
     '<nav class="gp-tabs" aria-label="Operating procedure sections">'+[['procedure','Procedure and steps'],['sources','Selected originals'],['history','Revision history'],['saved','Saved case sources'],['receiving','Receiving']].map(([id,label])=>
       '<button type="button" data-gp-tab="'+id+'"'+(id===state.tab?' aria-current="page"':'')+((!d&&id!=='saved')?' data-gp-fixed="true"':'')+'>'+label+'</button>').join('')+'</nav>'+
     (d?'<div class="gp-selection">'+notice('Draft reviewed case version '+d.reviewedVersion+(d.reviewedVersion===caseValue.program.version?'':' · the native case has advanced'))+
       button('Review current case','review-case')+'</div>':'')+
     '<div class="gp-pane">'+(state.tab==='saved'?savedPane():!d?notice('Create a procedure, open a complete Operating Plan, or reopen a saved case source.'):
       ({procedure:()=>planPane(d),sources:()=>sourcesPane(d),history:()=>historyPane(d),receiving:()=>receivingPane(d)})[state.tab]())+'</div>'+
     (d?'<footer class="gp-footer"><p data-gp-prepared>'+esc(d.prepared?'Prepared '+d.prepared.bytes+' bytes · '+d.prepared.sha256:'Review this draft and its complete sources before saving.')+'</p>'+
       '<div class="gp-actions">'+button('Review procedure and sources','prepare')+button('Save reviewed procedure to case','save','data-gp-save="true"')+
       button('Download working draft','download-draft','data-gp-view="true"')+'</div></footer>':'');
   controls();if(state.tab==='sources')nativeSelectionControl();
 }
 root.addEventListener('input',event=>{
   if(!editable())return;
   const el=event.target,d=draft();if(!d)return;
   if(el.matches('[data-gp-native-revision]')){d.nativeSelection={choice:$('[data-gp-native-choice]').value,revision:el.value};persist();return;}
   if(el.matches('[data-gp-field]')){
     const k=el.dataset.gpField,stepId=el.closest('[data-gp-step]')?.dataset.gpStep;
     if(stepId){
       const step=d.draft.content.steps.find(x=>x.id===stepId);if(!step)return;
       if(k==='argv'){try{const value=JSON.parse(el.value);if(!Array.isArray(value)||!value.every(x=>typeof x==='string'))throw new Error();
         step.argv=value;el.setCustomValidity('');delete step._invalidArgv;}catch{el.setCustomValidity('Use a JSON array of command argument strings.');d.invalidArgv??={};d.invalidArgv[stepId]=el.value;invalidate();return;}
         if(d.invalidArgv)delete d.invalidArgv[stepId];
       }else if(k==='link-note')stepLinks(stepId).note=el.value;else step[k]=el.value;
     }else if(k==='note')d.note=el.value;else d.draft.content[k]=el.value;
     invalidate();
   }
 });
 root.addEventListener('change',event=>{
   const el=event.target;if(!editable())return;const d=draft();
   if(el.matches('[data-gp-draft]')){state.selected=el.value||null;state.tab='procedure';state.originalView=null;persist();render();return;}
   if(!d)return;
   if(el.matches('[data-gp-source]')){const id=el.dataset.gpSource;d.sourceIds=el.checked?[...new Set([...d.sourceIds,id])]:d.sourceIds.filter(x=>x!==id);if(!el.checked)for(const row of d.stepLinks)row.sourceIds=row.sourceIds.filter(x=>x!==id);invalidate();}
   if(el.matches('[data-gp-links]')){const row=stepLinks(el.closest('[data-gp-step]').dataset.gpStep);row.sourceIds=[];row.tableKeys=[];row.editionKeys=[];
     for(const option of el.selectedOptions){const [kind,...parts]=option.value.split('|');row[kind].push(parts.join('|'));}invalidate();}
   if(el.matches('[data-gp-native-choice]'))nativeSelectionControl({changed:true});
 });
 root.addEventListener('click',event=>{
   const tab=event.target.closest('[data-gp-tab]');if(tab&&!loading&&!busy&&!hostBusy&&!pending()){state.tab=tab.dataset.gpTab;persist();render();return;}
   const target=event.target.closest('[data-gp-action]');if(!target||target.disabled)return;
   void run(async()=>{
     const action=target.dataset.gpAction,d=draft();
     if(action==='checkpoint'){download('grant-procedures-'+caseId+'.browser.json',browserCheckpointText());return;}
     if(action==='stored-download'){if(failedStored)download('grant-procedures-'+caseId+'-original-stored-record.json',procedureJSON(failedStored));return;}
     if(action==='legacy-download'){if(legacyRaw!==null)download('grant-procedures-'+caseId+'-legacy-original.json',legacyRaw);return;}
     if(action==='storage-retry'){await persist(true);await storage.flush();state.notice='The complete original checkpoint is durably saved in this browser.';return;}
     if(action==='storage-reload'){
       if(!window.confirm('Download this window’s current checkpoint, then explicitly open the currently stored edition? Keep the download to preserve any different pending original request.'))return;
       download('grant-procedures-'+caseId+'-before-reload.browser.json',browserCheckpointText());
       storageReady=false;const record=await storage.read();failedStored=record;if(record===null){await validateBrowserState(state);storageReady=true;await persist(true);state.notice='Saved this complete checkpoint into the empty original browser store.';return;}
       const received=await validateBrowserState(record.state);
       if(!available())throw new Error('The original desk closed during durable recovery.');
       state=received;state.inflight=null;state.finishing=null;state.storageWarning='';state.originalView=null;sessions.set(key,state);storageReady=true;failedStored=null;
       state.notice='Explicitly reopened the stored original checkpoint. The previous window preparation was downloaded before adoption; reconcile any retained original request before editing.';return;
     }
     if(action==='resume'){await sendPending();return;}
     if(action==='sources-section'){onSources();return;}
     if(action==='restore-checkpoint'){
       stopIfPending();const file=await chooseFile('.json,application/json');if(!file)return;
       const value=await validateBrowserState(JSON.parse(await fileText(file,{checkpoint:true})));
       const waiting=value.pending||value.accepted;
       const keys={};
       for(const [id,entry] of Object.entries(value.drafts)){
         const selected=state.drafts[id]&&JSON.stringify(state.drafts[id])!==JSON.stringify(entry)?id+'-received-'+uid():id;
         keys[id]=selected;state.drafts[selected]=entry;
       }
       if(waiting){
         state.selected=keys[waiting.draftKey];state.pending=value.pending?{...value.pending,draftKey:keys[value.pending.draftKey]}:null;
         state.accepted=value.accepted?{...value.accepted,draftKey:keys[value.accepted.draftKey]}:null;await persist(true);
         state.notice='Restored the exact original pending request. Use Reconcile original save; no native write was made by this checkpoint import.';
       }else {if(!state.selected)state.selected=keys[value.selected]||null;state.notice='Received the complete saved working drafts; conflicting local drafts are retained as separate entries.';}
       return;
     }
     if(action==='new'){stopIfPending();const plan=createOperatingPlan({id:'operating-'+uid(),title:caseValue.program.name+' operating procedure',
       owner:recordingActor(),purpose:'',receiving:''});const id='local-'+uid();state.drafts[id]=editableDocument(plan);state.selected=id;state.tab='procedure';state.originalView=null;return;}
     if(action==='import-plan'){stopIfPending();const file=await chooseFile('.json,application/json');if(file)await addOperatingPlan(await fileText(file));return;}
     if(action==='open-source'){await openSource(target.dataset.id);return;}
     if(action==='refresh'){await refreshCase();state.notice='Read the current original case and source list.';return;}
     if(!d)throw new Error('Open a working procedure first.');
     if(action==='review-case'){await refreshCase({review:true});return;}
     if(action==='prepare'){if(d.invalidArgv&&Object.keys(d.invalidArgv).length)throw new Error('Correct the retained invalid command argument text before reviewing.');await prepare();return;}
     if(action==='save'){await save();return;}
     if(action==='download-plan'){download('operating-plan.json',d.operatingPlanText);return;}
     if(action==='download-draft'){download('operating-plan-draft.json',procedureJSON(d.draft));return;}
     if(action==='download-html'||action==='preview'||action==='revision-preview'){
       const revision=action==='revision-preview'?Number(target.dataset.revision):d.selectedRevision;
       const html=renderOperatingPlanHTML(d.plan,{revision});
       if(action==='download-html')download('operating-procedure.html',html,'text/html');
       else{const blob=URL.createObjectURL(new Blob([html],{type:'text/html'}));window.open(blob,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(blob),60000);}return;
     }
     if(action==='download-source'){const meta=caseValue.sources.find(x=>x.id===d.parentSourceId);if(!meta)throw new Error('Save and reopen the native procedure first.');download(meta.filename,await readBytes(meta));return;}
     if(action==='case-zip'){
       const before=await saveApi(prefix),response=await saveApi(prefix+'/export.zip',undefined,{download:true}),blob=await response.blob(),after=await saveApi(prefix);
       if(before.program.id!==caseId||after.program.id!==caseId||before.program.version!==after.program.version)throw new Error('The case changed during export. Use the native grant-procedures export command for a version-bound delivery.');
       download(caseId+'-v'+before.program.version+'.zip',blob,'application/zip');state.notice='Downloaded the original full case ZIP for native receiving.';return;
     }
     if(!['edition-read','edition-compare','edition-json','edition-source-read','edition-source-download','edition-zip'].includes(action))stopIfPending();
     if(action==='add-step'){d.draft.content.steps.push(createOperatingStep({id:'step-'+uid(),title:'New operating step',owner:d.draft.content.owner}));invalidate();return;}
     if(action.startsWith('step-')){
       const i=d.draft.content.steps.findIndex(x=>x.id===target.dataset.id);if(i<0)return;
       if(action==='step-remove'){
         const removed=d.draft.content.steps.splice(i,1)[0];if(d.invalidArgv)delete d.invalidArgv[removed.id];
         if(!d.plan.revisions.some(r=>r.steps.some(x=>x.id===removed.id)))d.stepLinks=d.stepLinks.filter(x=>x.stepId!==removed.id);
       }
       else{const next=i+(action==='step-up'?-1:1);if(next>=0&&next<d.draft.content.steps.length){const [row]=d.draft.content.steps.splice(i,1);d.draft.content.steps.splice(next,0,row);}}
       invalidate();return;
     }
     if(action==='revision-restore'){d.draft=operatingPlanDraft(d.plan,Number(target.dataset.revision));d.selectedRevision=Number(target.dataset.revision);d.invalidArgv={};
       d.prepared=null;state.tab='procedure';state.notice='Restored revision '+target.dataset.revision+' into a draft against the full current history. Earlier saved revisions remain unchanged.';return;}
     if(action==='table-plan'){
       if(d.tables.some(x=>x.origin==='case-plan'))throw new Error('The current pinned plan table is already selected.');
       if(!caseValue.plan.planning?.sourceTables)throw new Error('The pinned native plan has no retained Source Tables project.');
       d.tables.push({key:'pinned-plan-'+caseValue.program.planRevision,origin:'case-plan'});invalidate();return;
     }
     if(action==='table-file'){
       const file=await chooseFile('.json,application/json');if(!file)return;const raw=await fileText(file),key='table-'+uid();
       await makeProcedureTable({key,origin:'local-original',originalText:raw});
       d.tables.push({key,origin:'local-original',originalText:raw,filename:file.name});invalidate();return;
     }
     if(action==='table-source'){
       const id=$('[data-gp-table-source]').value,meta=caseValue.sources.find(x=>x.id===id);if(!meta)throw new Error('Select the original case JSON source.');
       const key='table-'+id;await makeProcedureTable({key,origin:'case-source',metadata:meta,originalText:await readText(meta)});
       if(d.tables.some(x=>x.key===key))throw new Error('This source table is already selected.');
       d.tables.push({key,origin:'case-source',sourceId:id});invalidate();return;
     }
     if(action==='table-remove'){const [removed]=d.tables.splice(Number(target.dataset.index),1);for(const row of d.stepLinks)row.tableKeys=row.tableKeys.filter(x=>x!==removed.key);invalidate();return;}
     if(action==='edition-add'){
       const selectedValue=$('[data-gp-native-choice]').value,[kind,id]=selectedValue.split('|'),choice=nativeChoices().find(x=>x.kind===kind&&x.id===id&&selectedValue===x.kind+'|'+x.id+'|'+x.revision);
       if(!choice)throw new Error('Choose an actual saved native record from this case.');
       const fixed=['forecast','portfolio'].includes(kind),revision=fixed?1:Number($('[data-gp-native-revision]').value);
       if(!Number.isSafeInteger(revision)||revision<1)throw new Error('Select a positive saved native revision.');
       const before=await saveApi(prefix),original=await saveApi(prefix+procedureEditionRoute(kind,{id,revision})),
         raw=JSON.stringify(original)+'\n',captured=await makeProcedureEdition(kind,raw),after=await saveApi(prefix);
       if(before?.program?.id!==caseId||after?.program?.id!==caseId||before.program.version!==caseValue.program.version||after.program.version!==before.program.version)
         throw new Error('The case changed while selecting this edition. Review the current case; existing captured originals remain unchanged.');
       if(captured.ref.id!==id||(!fixed&&captured.ref.revision!==revision))throw new Error('The native reader returned a different selected edition.');
       checkEditionSourceMembership(kind,original);
       if(!available()||draft()!==d)throw new Error('The original procedure desk changed during edition selection.');
       if(d.editions.some(x=>x.kind===kind&&x.id===id&&x.revision===captured.ref.revision))throw new Error('This exact saved edition is already retained.');
       if(d.editions.length>=32)throw new Error('Keep at most32 complete native editions in one procedure.');
       d.editions.push({kind,id,revision:captured.ref.revision,sha256:captured.ref.sha256,originalText:captured.original.text});
       state.originalView={kind,ref:captured.ref,summary:procedureEditionSummary(kind,original),original};
       state.notice='Retained the complete original '+editionLabel(d.editions.at(-1))+'. Link it to the relevant procedure steps.';
       invalidate();return;
     }
     if(action.startsWith('edition-')){
       const index=Number(target.dataset.index),item=d.editions[index];if(!item)throw new Error('Select the retained original edition.');
       if(action==='edition-read'||action==='edition-compare'){await inspectSelectedEdition(item,d,{comparison:action==='edition-compare'});return;}
       if(action==='edition-json'){
         const captured=await retainLegacyOriginal(item,d);
         if(!available()||draft()!==d)throw new Error('The original procedure desk changed during source reading.');
         download(item.kind+'-'+item.id+'-'+item.revision+'.json',captured.original.text);return;
       }
       if(action==='edition-source-read'||action==='edition-source-download'){
         const captured=await retainLegacyOriginal(item,d),view=JSON.parse(captured.original.text),
           meta=procedureEditionSources(item.kind,view)[Number(target.dataset.sourceIndex)];
         if(!meta)throw new Error('Choose one complete linked native source.');
         const bytes=await readBytes(meta);
         if(!available()||draft()!==d)throw new Error('The original procedure desk changed during source reading.');
         if(action==='edition-source-download')download(meta.filename,bytes,meta.mediaType);
         else{
           let content;try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
           catch{content='This original file contains non-UTF-8 bytes. Download the exact source to open it in its native application.';}
           state.originalView={kind:item.kind,ref:captured.ref,source:meta,content};
         }return;
       }
       if(action==='edition-zip'){
         const captured=await retainLegacyOriginal(item,d),before=await saveApi(prefix),
           view=await saveApi(prefix+procedureEditionRoute(item.kind,item)),received=await makeProcedureEdition(item.kind,procedureJSON(view));
         if(received.ref.id!==captured.ref.id||received.ref.revision!==captured.ref.revision||received.ref.sha256!==captured.ref.sha256)
           throw new Error('The native delivery no longer matches the selected immutable edition.');
         const response=await saveApi(prefix+procedureEditionRoute(item.kind,item,{download:true,expectedVersion:before.program.version,reportSha256:view.edition?.reportSha256}),undefined,{download:true}),
           blob=await response.blob(),after=await saveApi(prefix);
         if(before?.program?.id!==caseId||after?.program?.id!==caseId||before.program.version!==after.program.version)
           throw new Error('The case changed during native delivery export. Keep the original selection and retry its export against a stable case.');
         if(!available()||draft()!==d)throw new Error('The original procedure desk changed during native export.');
         download(item.kind+'-'+item.id+'-'+item.revision+'-native.zip',blob,'application/zip');
         state.notice='Downloaded the selected native edition through its original exporter. Its ZIP may include the complete current receiving case; the captured JSON stays unchanged.';return;
       }
       if(action==='edition-remove'){
         const [removed]=d.editions.splice(index,1),key=editionKey(removed);
         for(const row of d.stepLinks)row.editionKeys=row.editionKeys.filter(x=>x!==key);
         state.originalView=null;invalidate();return;
       }
     }
   });
 });
 render();
 async function openSavedWorkflow(selection){
   await ready;
   if(!available())throw new Error('Open this original procedure desk before selecting its source.');
   if(loading||busy||pending()||state.storageWarning)throw new Error('Finish the retained procedure request and durable checkpoint before opening another source.');
   if(selection?.kind!=='grant-procedure'||typeof selection.sourceId!=='string')
     throw new Error('Select a complete original procedure source.');
   if(selection.caseId!==undefined&&selection.caseId!==caseId||selection.expectedVersion!==undefined&&selection.expectedVersion!==caseValue.program.version)
     throw new Error('Refresh this original case before opening its saved procedure.');
   const meta=procedureCandidates(caseValue).find(row=>row.id===selection.sourceId);
   if(!meta)throw new Error('The selected procedure source is absent from this original case.');
   busy=true;state.error='';controls();
   try{
     await openSource(meta.id);
     if(!available())throw new Error('The original procedure desk changed while its source was opening.');
     persist();render();
     return {outcome:'opened',caseId,kind:'grant-procedure',sourceId:meta.id};
   }catch(problem){state.error=problem.message||String(problem);throw problem;}
   finally{busy=false;if(available())controls();}
 }
 const ready=(async()=>{
   if(hadMemory&&storage.inspect().initialized){
     await storage.flush();storageReady=true;
   }else{
     const record=await storage.read();failedStored=record;
     if(record!==null){
       const recovered=await validateBrowserState(record.state);
       if(!available())return;
       state=recovered;state.inflight=null;state.finishing=null;state.originalView=null;state.storageWarning='';sessions.set(key,state);failedStored=null;
     }else if(!legacyProblem){await validateBrowserState(state);}
     storageReady=true;
     if(record===null)await persist(true);
   }
   const catalog=await readNativeCatalog(caseValue);
   if(!available())return;
   taskComparisons=catalog.tasks;nativeCatalog=catalog;
   if(state.inflight)await state.inflight;
   if(state.accepted||state.finishing)await finishAccepted();
   if(state.savedRefresh){const next=await refreshCase();state.savedRefresh=false;persist();if(available())await onCase(next,{id:caseId,action:'source.readback',version:next.program.version});}
   if(available())render();
 })().catch(error=>{state.error=error.message;if(!storageReady)storageError(error);if(available())render();throw error;}).finally(()=>{loading=false;if(available())render();});
 return {ready,openSavedWorkflow,dispose(){active=false;void persist();},setHostBusy(value){hostBusy=Boolean(value);if(available())controls();}};
}
