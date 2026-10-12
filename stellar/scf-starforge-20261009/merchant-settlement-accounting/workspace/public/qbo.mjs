// MIT. QuickBooks journal handoff in the original merchant accounting workspace.
// Calculations, journal matching and retained accountant revisions belong to the API.
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const exact=value=>value===null||value===undefined?'Not recorded':typeof value==='object'?JSON.stringify(value,null,2):String(value);
const date=value=>value?new Date(value).toLocaleString():'Not recorded';
const encode=encodeURIComponent;
const short=value=>typeof value==='string'&&value.length>30?value.slice(0,14)+'…'+value.slice(-10):exact(value);
const badge=value=>'<span class="badge">'+esc(value)+'</span>';
const metrics=items=>items.map(([label,value])=>'<div class="metric"><span>'+esc(label)+'</span><strong>'+esc(exact(value))+'</strong></div>').join('');
const definitions=value=>Object.entries(value??{}).map(([key,item])=>'<dt>'+esc(key.replace(/([a-z])([A-Z])/g,'$1 $2'))+'</dt><dd>'+esc(exact(item))+'</dd>').join('');
const PAGE=50,NATIVE_PAGE=20,MAX_ROWS=500,MAX_RESPONSE_BYTES=8*1024*1024;
const query=new URLSearchParams(location.search);
let metadata=null,revision=0,busy=false,pending=null,refreshToken=0,detailToken=0,sourceToken=0,fileToken=0,responseToken=0;
let selected=query.get('plan')||'',detail=null,source=null,sourceChoice='',currentAccountant=null;
let selectedResponse=query.get('response')||'',responseDetail=null,planLimit=24,lineOffset=0,lineIndex=-1,draftOffset=0,comparisonOffset=0,previewOffset=0;
let draftRows=new Map(),draftSelected=new Set(),sourceDrafts=new Map(),planPreview=null,responsePreview=null,loadedFile=null,fileLoading=false,previewUrl='',loadedCompany=null;
let connection=null,connectionIssue='',nativePreview=null,nativeToken=0,nativeAttemptOffset=0,loadedCompanyOrigin=null;
const identity=()=>({id:crypto.randomUUID(),createdAt:new Date().toISOString()});
let createIdentity=identity();
let buyerValuationBasis='';
const buyerReviewOffsets={preview:0,plan:0};

// Browser recovery belongs to the original workspace, source selection and entered operator.
const RECOVERY_SCHEMA='stellar-forge.qbo-browser-recovery.v1',RECOVERY_DB='stellar-forge-qbo-recovery';
const RECOVERY_REQUEST_LIMIT=32*1024*1024,RECOVERY_DRAFT_LIMIT=64*1024*1024;
const RECOVERY_SHA=/^[a-f0-9]{64}$/;
const clone=value=>structuredClone(value);
const recovery={binding:null,db:null,key:null,actor:'',cache:null,gate:null,dirty:false,conflict:false,mismatch:false,hydrating:false,storageError:'',timer:null,queue:Promise.resolve(),channel:null,editVersion:0,restoredSourcePin:null};
const defaultDraftFields=new Map();
let planDrafts=new Map();
const DRAFT_FIELDS=['qbo-name','qbo-realm','qbo-company-name','qbo-currency','qbo-environment','qbo-date','qbo-doc-number','qbo-company-realm','qbo-default-debit-id','qbo-default-debit-name','qbo-default-credit-id','qbo-default-credit-name','qbo-buyer-bulk-reason','qbo-review-note','qbo-cancel-note','qbo-response-name'];
function requireLocal(ok,message){if(!ok)throw new Error(message);}
function canonical(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){requireLocal(Number.isFinite(value),'Use finite JSON values.');return JSON.stringify(value);}
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  requireLocal(value&&typeof value==='object','Keep the complete JSON record.');
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
const same=(a,b)=>canonical(a)===canonical(b),utf8=value=>new TextEncoder().encode(value);
async function sha256(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?utf8(value):value))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function bindingValue(value){return value&&RECOVERY_SHA.test(value.workspaceId??'')&&RECOVERY_SHA.test(value.sourcesSha256??'')?{workspaceId:value.workspaceId,sourcesSha256:value.sourcesSha256}:null;}
function scopeKey(binding=recovery.binding){requireLocal(bindingValue(binding),'Read the original workspace identity first.');return canonical([binding.workspaceId,binding.sourcesSha256]);}
function contextKey(actor,binding=recovery.binding){return canonical([scopeKey(binding),actor]);}
function blankContext(actor){return {schema:RECOVERY_SCHEMA,key:contextKey(actor),binding:clone(recovery.binding),actor,version:0,draft:null,pending:null,lastOutcome:null};}
function assertScope(actual){
  const value=bindingValue(actual);
  if(!value||!recovery.binding||!same(value,recovery.binding)){
    recovery.mismatch=true;renderRecovery();controls();
    const error=new Error('The responding workspace or source configuration changed. The original browser record is frozen. Reopen the matching workspace, or download its preserved record.');error.outcomeUnknown=true;throw error;
  }
}
function contextReady(){return Boolean(recovery.cache&&!recovery.conflict&&!recovery.mismatch&&!recovery.storageError&&recovery.actor===$('qbo-operator').value.trim());}
function canEdit(){return contextReady()&&!metadata?.reopenRequired&&!busy&&!pending&&!recovery.gate?.pending;}
function assertContext(){
  requireLocal(recovery.db&&recovery.cache,'Enter the operator and open their saved drafts before continuing.');
  requireLocal(contextReady(),'Open the matching saved operator record, or resolve its browser-storage conflict before continuing.');
  requireLocal(!metadata?.reopenRequired,'Close and reopen the original accounting workspace through Recovery before continuing this request.');
  requireLocal(!recovery.gate?.pending||recovery.gate.pending.contextKey===recovery.key,'Another operator has an unresolved request in this browser workspace. Open that operator’s record to read its original outcome.');
}
function openRecoveryDB(){return new Promise((resolve,reject)=>{
  const r=indexedDB.open(RECOVERY_DB,1);
  r.onupgradeneeded=()=>{const db=r.result;db.createObjectStore('contexts',{keyPath:'key'});const commands=db.createObjectStore('commands',{keyPath:'key'});commands.createIndex('contextKey','contextKey');commands.createIndex('identity','identity');db.createObjectStore('gates',{keyPath:'key'});};
  r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();recovery.storageError='The browser store changed. Reload before continuing.';renderRecovery();controls();};resolve(db);};
  r.onerror=()=>reject(r.error||new Error('This browser could not open durable draft storage.'));
  r.onblocked=()=>reject(new Error('Close an older QuickBooks tab before opening its browser store.'));
});}
function localRead(store,key){return new Promise((resolve,reject)=>{
  const tx=recovery.db.transaction(store,'readonly'),r=tx.objectStore(store).get(key);let value;
  r.onsuccess=()=>{value=r.result??null;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error||r.error);tx.onabort=()=>reject(tx.error||new Error('The browser read was interrupted.'));
});}
function localCatalog(){return new Promise((resolve,reject)=>{
  const tx=recovery.db.transaction('contexts','readonly'),r=tx.objectStore('contexts').openCursor(),rows=[];
  r.onsuccess=()=>{const cursor=r.result;if(!cursor)return;const value=cursor.value;rows.push({key:value.key,binding:value.binding,actor:value.actor,version:value.version,updatedAt:value.updatedAt??null,pending:Boolean(value.pending),hasDraft:Boolean(value.draft)});cursor.continue();};
  tx.oncomplete=()=>resolve(rows);tx.onerror=()=>reject(tx.error||r.error);tx.onabort=()=>reject(tx.error||new Error('The browser catalog could not be read.'));
});}
function localCommands(key){return new Promise((resolve,reject)=>{
  const tx=recovery.db.transaction('commands','readonly'),r=tx.objectStore('commands').index('contextKey').getAll(key);let rows=[];
  r.onsuccess=()=>{rows=r.result??[];};tx.oncomplete=()=>resolve(rows);tx.onerror=()=>reject(tx.error||r.error);tx.onabort=()=>reject(tx.error||new Error('The original browser requests could not be read.'));
});}
/** A draft, immutable request and workspace-wide pending marker commit together. */
function writeLocal({draft,command=null,outcome=null}={}){
  const key=recovery.key,binding=clone(recovery.binding),actor=recovery.actor,expected=recovery.cache?.version;
  requireLocal(key&&recovery.cache,'Open the original operator record first.');
  if(draft!==undefined)requireLocal(utf8(JSON.stringify(draft)).length<=RECOVERY_DRAFT_LIMIT,'This complete browser draft exceeds 64 MiB. Download it and use the original CLI or operating backup.');
  return new Promise((resolve,reject)=>{
    const tx=recovery.db.transaction(['contexts','commands','gates'],'readwrite'),contexts=tx.objectStore('contexts'),commands=tx.objectStore('commands'),gates=tx.objectStore('gates');
    let next,nextGate,issue;
    const fail=error=>{issue=error;try{tx.abort();}catch{}};
    const c=contexts.get(key);c.onerror=()=>fail(c.error);c.onsuccess=()=>{try{
      const old=c.result??blankContext(actor);
      requireLocal(old.schema===RECOVERY_SCHEMA&&old.key===key&&old.actor===actor&&same(old.binding,binding),'The saved operator/workspace identity changed.');
      requireLocal(old.version===expected,'Another tab changed this saved operator record. Download your unsaved draft, then reload the saved record.');
      const g=gates.get(scopeKey(binding));g.onerror=()=>fail(g.error);g.onsuccess=()=>{try{
        next=clone(old);next.version++;next.updatedAt=new Date().toISOString();if(draft!==undefined)next.draft=clone(draft);
        nextGate=g.result??{key:scopeKey(binding),binding:clone(binding),pending:null};requireLocal(same(nextGate.binding,binding),'The browser workspace marker changed.');
        const finish=()=>{contexts.put(next);gates.put(nextGate);};
        if(command){
          requireLocal(!old.pending||old.pending===command.key,'Reconcile the original pending request before submitting another.');
          requireLocal(!nextGate.pending||nextGate.pending.contextKey===key&&nextGate.pending.commandKey===command.key,'Another operator or tab retains this workspace’s pending request.');
          const identities=commands.index('identity').getAll(command.identity);identities.onerror=()=>fail(identities.error);identities.onsuccess=()=>{try{
            if(!command.kind.endsWith('-resume'))requireLocal(identities.result.every(prior=>prior.bodyText===command.bodyText&&prior.bodySha256===command.bodySha256),'This original request ID is already retained with different bytes. Keep its original request.');
            const r=commands.get(command.key);r.onerror=()=>fail(r.error);r.onsuccess=()=>{try{
              if(r.result)requireLocal(r.result.bodyText===command.bodyText&&r.result.bodySha256===command.bodySha256&&r.result.path===command.path&&r.result.actor===actor&&same(r.result.binding,binding),'This request identity belongs to different original bytes.');
              else commands.add(clone(command));
              next.pending=command.key;nextGate.pending={contextKey:key,commandKey:command.key,actor};finish();
            }catch(error){fail(error);}};
          }catch(error){fail(error);}};
        }else if(outcome){
          requireLocal(old.pending===outcome.commandKey&&nextGate.pending?.contextKey===key&&nextGate.pending.commandKey===outcome.commandKey,'Only the original pending request may be reconciled.');
          const r=commands.get(outcome.commandKey);r.onerror=()=>fail(r.error);r.onsuccess=()=>{try{
            requireLocal(r.result&&r.result.bodySha256===outcome.bodySha256,'The original submitted request is missing or changed.');
            const saved={...r.result,outcome:clone(outcome)};commands.put(saved);next.pending=null;next.lastOutcome=clone(outcome);nextGate.pending=null;finish();
          }catch(error){fail(error);}};
        }else finish();
      }catch(error){fail(error);}};
    }catch(error){fail(error);}};
    tx.oncomplete=()=>{recovery.cache=next;recovery.gate=nextGate;recovery.storageError='';try{recovery.channel?.postMessage({key,version:next.version,scope:scopeKey(binding)});}catch{}resolve(next);};
    const failed=()=>{const error=issue||tx.error||new Error('The browser could not retain this record. No new request was dispatched.');if(/Another tab|Another operator/.test(error.message))recovery.conflict=true;else recovery.storageError=error.message;renderRecovery();controls();reject(error);};
    tx.onerror=failed;tx.onabort=failed;
  });
}
function sourceIdentity(value=source){
  if(!value?.record?.id)return null;
  const record=value.record,file=record.files?.find(item=>item.name==='handoff.json');
  requireLocal(file&&RECOVERY_SHA.test(file.sha256??'')&&Number.isSafeInteger(file.bytes),'The original handoff has no verified source-file identity. Reopen it through the accounting workspace.');
  return {handoffId:record.id,handoffFileSha256:file.sha256,handoffFileBytes:file.bytes,sourceKind:value.sourceKind??'merchant'};
}
function draftSourceKey(value=source){const binding=sourceIdentity(value);return binding?canonical(binding):'';}
function snapshotDraft(){
  saveDraft();savePlanDraft();
  return {schema:RECOVERY_SCHEMA,binding:clone(recovery.binding),actor:recovery.actor,fields:Object.fromEntries(DRAFT_FIELDS.map(id=>[id,$(id).value])),nameDirty:$('qbo-name').dataset.dirty==='true',
    sourceChoice,sourceIdentity:sourceIdentity(),planDrafts:[...planDrafts].map(([key,value])=>[key,clone(value)]),sourceDrafts:[...sourceDrafts].map(([key,value])=>[key,{...value,rows:[...value.rows].map(([id,row])=>[id,clone(row)]),selected:[...value.selected]}]),
    createIdentity:clone(createIdentity),selected,selectedResponse,loadedCompany:clone(loadedCompany),loadedCompanyOrigin:clone(loadedCompanyOrigin),loadedFile:loadedFile?{name:loadedFile.name,content:loadedFile.content}:null,
    planPreview:clone(planPreview),responsePreview:clone(responsePreview),nativePreview:clone(nativePreview),view:document.querySelector('[data-qbo-view].active')?.dataset.qboView??'journal'};
}
function markRecoveryDirty(){
  if(!recovery.cache||recovery.hydrating||pending||recovery.mismatch||recovery.conflict||recovery.actor!==$('qbo-operator').value.trim())return;
  recovery.dirty=true;recovery.editVersion++;renderRecovery();clearTimeout(recovery.timer);recovery.timer=null;
  if(!busy)recovery.timer=setTimeout(()=>{recovery.timer=null;void flushDraft().catch(error=>notify(error.message,true));},300);
}
async function flushDraft(){
  clearTimeout(recovery.timer);recovery.timer=null;
  if(!recovery.cache||recovery.hydrating||pending)return;
  requireLocal(!recovery.mismatch&&!recovery.conflict&&recovery.actor===$('qbo-operator').value.trim(),'Keep this draft under its original operator and workspace.');
  if(!recovery.dirty){await recovery.queue;return;}
  const snapshot=snapshotDraft(),generation=recovery.editVersion,key=recovery.key;
  recovery.queue=recovery.queue.catch(()=>{}).then(async()=>{
    requireLocal(recovery.key===key,'Finish the original browser save before changing operator.');
    await writeLocal({draft:snapshot});if(generation===recovery.editVersion)recovery.dirty=false;renderRecovery();
  });
  await recovery.queue;
}
function clearLiveDraft(){
  for(const [id,value] of defaultDraftFields)$(id).value=value;
  delete $('qbo-name').dataset.dirty;
  source=null;sourceChoice='';recovery.restoredSourcePin=null;draftRows=new Map();draftSelected=new Set();sourceDrafts=new Map();planDrafts=new Map();buyerValuationBasis='';
  selected='';selectedResponse='';detail=null;responseDetail=null;currentAccountant=null;loadedCompany=null;loadedCompanyOrigin=null;loadedFile=null;fileLoading=false;
  planPreview=null;responsePreview=null;nativePreview=null;createIdentity=identity();draftOffset=0;lineOffset=0;lineIndex=-1;comparisonOffset=0;previewOffset=0;
  ++fileToken;++sourceToken;++detailToken;++responseToken;++nativeToken;
  for(const id of ['qbo-response-file','qbo-company-info-file','qbo-company-preferences-file','qbo-company-accounts-file'])$(id).value='';
  $('qbo-native-confirm').checked=false;$('qbo-cancel-unused').checked=false;
  $('qbo-plan-preview-panel').hidden=true;$('qbo-preview-panel').hidden=true;$('qbo-native-preview-panel').hidden=true;
  if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}$('qbo-preview-download').hidden=true;
}
function restoreDraft(value){
  if(!value)return;
  requireLocal(value.schema===RECOVERY_SCHEMA&&same(value.binding,recovery.binding)&&value.actor===recovery.actor,'The browser draft belongs to another original workspace or operator.');
  for(const id of DRAFT_FIELDS)if(typeof value.fields?.[id]==='string')$(id).value=value.fields[id];
  if(value.nameDirty)$('qbo-name').dataset.dirty='true';
  planDrafts=new Map((value.planDrafts??[]).map(([key,row])=>[key,clone(row)]));
  sourceDrafts=new Map((value.sourceDrafts??[]).map(([key,row])=>[key,{...row,rows:new Map(row.rows),selected:new Set(row.selected)}]));
  sourceChoice=value.sourceChoice??'';recovery.restoredSourcePin=clone(value.sourceIdentity??null);createIdentity=clone(value.createIdentity??identity());selected=value.selected??'';selectedResponse=value.selectedResponse??'';
  loadedCompany=clone(value.loadedCompany??null);loadedCompanyOrigin=clone(value.loadedCompanyOrigin??null);
  loadedFile=value.loadedFile?{...clone(value.loadedFile),token:fileToken}:null;
  planPreview=clone(value.planPreview??null);responsePreview=clone(value.responsePreview??null);nativePreview=clone(value.nativePreview??null);
  if(loadedFile)$('qbo-file-status').textContent=loadedFile.name+' · complete JSON restored from this operator’s browser draft';
  showView(value.view??'journal');
}
async function openOperator({reload=false}={}){
  if(busy)return;
  const actor=$('qbo-operator').value.trim();
  busy=true;controls();
  try{
    await recovery.queue.catch(()=>{});
    requireLocal(actor&&actor.length<=1000,'Enter the original operator name before opening saved drafts.');
    requireLocal(recovery.binding&&recovery.db,'Read the original workspace and browser store first.');
    requireLocal(!recovery.mismatch,'This tab belongs to its original workspace. Download the retained record and reopen the matching workspace.');
    requireLocal(!pending||actor===recovery.actor,'Reconcile the current operator’s pending request before switching records.');
    if(recovery.dirty&&(reload||recovery.conflict)&&!window.confirm('Reload the last saved browser draft? Download any unsaved edits first.'))return;
    if(recovery.cache&&recovery.dirty&&!reload){
      $('qbo-operator').value=recovery.actor;try{await flushDraft();}finally{$('qbo-operator').value=actor;}
    }
    recovery.hydrating=true;controls();
    const key=contextKey(actor),saved=await localRead('contexts',key);
    recovery.key=key;recovery.actor=actor;recovery.cache=saved??blankContext(actor);recovery.gate=await localRead('gates',scopeKey());recovery.conflict=false;recovery.storageError='';recovery.dirty=false;
    requireLocal(recovery.cache.key===key&&recovery.cache.actor===actor&&same(recovery.cache.binding,recovery.binding),'The retained operator record changed.');
    clearLiveDraft();restoreDraft(recovery.cache.draft);
    if(!recovery.cache.draft){selected=query.get('plan')||'';selectedResponse=query.get('response')||'';}
    pending=recovery.cache.pending?await localRead('commands',recovery.cache.pending):null;
    if(recovery.cache.pending){requireLocal(pending,'The exact pending browser request is missing. Keep this record for recovery.');await validateStoredCommand(pending);}
    await refresh();renderCompany();if(planPreview)renderPlanPreview();if(responsePreview)renderResponsePreview();if(nativePreview&&nativePreviewCurrent())renderNativePreview();
    if(!saved)await writeLocal({draft:snapshotDraft()});
    else if(!pending&&!recovery.mismatch)await writeLocal({draft:snapshotDraft()});
    await refreshRecoveryCatalog();renderRecovery();notify(pending?'The original submitted request is restored. Read its saved outcome before retrying.':'Opened this operator’s saved draft. Every new request will be retained before dispatch.');
  }catch(error){recovery.storageError='The saved operator record could not reopen: '+error.message;throw error;}
  finally{recovery.hydrating=false;busy=false;renderRecovery();controls();}
}
function renderRecovery(){
  if(!$('qbo-recovery-state'))return;
  const active=recovery.cache,other=recovery.gate?.pending&&recovery.gate.pending.contextKey!==recovery.key;
  $('qbo-recovery-scope').textContent=recovery.binding?'Workspace '+recovery.binding.workspaceId+' · Sources '+recovery.binding.sourcesSha256:'Reading original workspace identity…';
  $('qbo-recovery-state').textContent=recovery.mismatch?'Workspace identity changed; original browser data frozen':recovery.conflict?'Another tab changed this record; reload saved state':recovery.storageError?'Browser save failed: '+recovery.storageError:other?'Unresolved request retained by '+recovery.gate.pending.actor:!active?'Enter an operator and open their saved drafts':recovery.dirty?'Browser edits awaiting save…':'Saved for '+recovery.actor+(active.updatedAt?' · '+date(active.updatedAt):'');
  $('qbo-recovery-state').classList.toggle('error',Boolean(recovery.mismatch||recovery.conflict||recovery.storageError||other));
  $('qbo-reopen-warning').hidden=!metadata?.reopenRequired;
  $('qbo-retry-panel').hidden=!pending;
  if(pending)$('qbo-retry-message').textContent=pending.description+' · Request '+pending.requestId+' · '+pending.bodySha256+'. The exact original values are saved in this browser. Read the original saved record; retry only this unchanged request if its outcome remains unresolved.';
  $('qbo-recovery-outcome').textContent=active?.lastOutcome?'Last recovered request '+active.lastOutcome.requestId+' · '+active.lastOutcome.status+' · '+date(active.lastOutcome.at):'';
}
async function refreshRecoveryCatalog(){
  if(!recovery.db||!recovery.binding)return;
  const rows=await localCatalog(),own=rows.filter(row=>same(row.binding,recovery.binding));
  options($('qbo-saved-operator'),[['','Choose a saved operator'],...own.map(row=>[row.actor,row.actor+(row.pending?' · request pending':'')])],$('qbo-saved-operator').value);
  options($('qbo-other-record'),[['','Choose a saved browser record'],...rows.map(row=>[row.key,row.actor+' · '+short(row.binding.workspaceId)+' · '+short(row.binding.sourcesSha256)+(row.pending?' · pending':'')])],$('qbo-other-record').value);
  recovery.gate=await localRead('gates',scopeKey());renderRecovery();controls();
}
function downloadJSON(name,value){
  const text=JSON.stringify(value,null,2)+'\n',url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function downloadRecovery(key=recovery.key){
  requireLocal(recovery.db&&key,'Choose the saved operator record to download.');
  const [context,commands]=await Promise.all([localRead('contexts',key),localCommands(key)]);
  requireLocal(context,'The saved browser record was not found.');
  downloadJSON('quickbooks-browser-recovery.json',{schema:RECOVERY_SCHEMA,exportedAt:new Date().toISOString(),context,commands,...(key===recovery.key&&recovery.dirty?{unsavedDraft:snapshotDraft()}:{}),
    instructions:'Private browser recovery record. Its original workspace/source/actor and command bytes are immutable. The original accounting workspace owns all posting outcomes; this export is not a posting receipt or an automatic import.'});
}
async function startRecovery(){
  try{
    recovery.db=await openRecoveryDB();
    if(typeof BroadcastChannel==='function'){recovery.channel=new BroadcastChannel(RECOVERY_DB);recovery.channel.onmessage=event=>{
      if(!recovery.binding||event.data?.scope!==scopeKey())return;
      if(event.data.key===recovery.key&&event.data.version!==(recovery.cache?.version??0)){recovery.conflict=true;notify('Another tab updated this operator record. Download any unsaved draft and reload the saved record before continuing.',true);}
      void refreshRecoveryCatalog().catch(error=>notify(error.message,true));controls();
    };}
    await refresh();await refreshRecoveryCatalog();
    $('qbo-recovery-open').focus();
  }catch(error){recovery.storageError=error.message;notify(error.message,true);}
  finally{renderRecovery();controls();}
}


const INTENT_KINDS=new Set(['create','review','cancel','response','response-resume','post','post-resume']);
function commandRoute(kind,planId,responseId){
  if(kind==='create')return '/api/qbo/plans';
  const root='/api/qbo/plans/'+encode(planId);
  return root+(kind==='review'?'/review':kind==='cancel'?'/cancel':kind==='response'?'/responses':kind==='response-resume'?'/responses/'+encode(responseId)+'/resume':kind==='post'?'/post':kind==='post-resume'?'/post/resume':'');
}
async function originalRequestHash(kind,body){
  let normalized;
  if(kind==='create')normalized={id:body.id,name:body.name,actor:body.actor,createdAt:body.createdAt,handoffId:body.handoffId,expectedParentId:body.expectedParentId??null,realmId:body.realmId,companyName:body.companyName,
    baseCurrency:body.baseCurrency,environment:body.environment??'sandbox',txnDate:body.txnDate,docNumber:body.docNumber??null,rows:body.rows,companySnapshot:body.companySnapshot??null,...(Object.hasOwn(body,'valuationBasis')?{valuationBasis:body.valuationBasis}:{})};
  else if(kind==='review')normalized={id:body.id,actor:body.actor,note:body.note??'',planSha256:body.planSha256};
  else if(kind==='cancel')normalized={id:body.id,actor:body.actor,note:body.note,planSha256:body.planSha256,unusedConfirmed:body.unusedConfirmed===true};
  else if(kind==='response')normalized={id:body.id,createdAt:body.createdAt,name:body.name,actor:body.actor,realmId:body.realmId,expectedParentId:body.expectedParentId??null,responseSha256:await sha256(body.responseJson),previewSha256:body.previewSha256??null};
  return normalized?sha256(canonical(normalized)):null;
}
function intentSource(kind,body,planId){
  const handoffId=kind==='create'?body.handoffId:detail?.plan?.handoffId;
  const record=metadata?.handoffs?.find(row=>row.id===handoffId);
  const sourcePin=sourceIdentity({record,sourceKind:kind==='create'?(source?.sourceKind??'merchant'):(detail?.plan?.sourceKind??'merchant')});
  requireLocal(sourcePin,'Reopen the original handoff before retaining a command.');
  return {...sourcePin,planId,planSha256:kind==='create'?body.previewSha256:detail?.plan?.integrity?.sha256,
    connection:['post','post-resume'].includes(kind)?connectionSignature():null};
}
async function makeStoredCommand(intent){
  assertContext();requireLocal(INTENT_KINDS.has(intent.kind),'Choose an original QuickBooks operation.');
  const body=clone(intent.body),bodyText=JSON.stringify(body),bodySha256=await sha256(bodyText),planId=intent.kind==='create'?body.id:selected;
  const responseId=intent.kind==='response-resume'?intent.responseId:null,requestId=body.id??responseId;
  requireLocal(typeof requestId==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(requestId),'Retain the original request or response ID.');
  requireLocal(body.actor===recovery.actor,'The command actor differs from this saved operator record.');
  requireLocal(utf8(bodyText).length<=RECOVERY_REQUEST_LIMIT,'The complete QuickBooks request exceeds 32 MiB.');
  requireLocal(intent.path===commandRoute(intent.kind,planId,responseId),'Keep the original QuickBooks request route.');
  const pin=intentSource(intent.kind,body,planId),key=canonical([recovery.key,intent.kind,intent.path,requestId,bodySha256]);
  return {schema:RECOVERY_SCHEMA,key,contextKey:recovery.key,binding:clone(recovery.binding),actor:recovery.actor,kind:intent.kind,path:intent.path,body,bodyText,bodySha256,
    identity:canonical([scopeKey(),intent.kind,intent.path,requestId]),requestId,planId,responseId,pin,requestSha256:await originalRequestHash(intent.kind,body),
    description:intent.description,createdAt:new Date().toISOString()};
}
async function validateStoredCommand(command){
  requireLocal(command?.schema===RECOVERY_SCHEMA&&INTENT_KINDS.has(command.kind),'The saved browser command is incomplete.');
  requireLocal(command.contextKey===recovery.key&&command.actor===recovery.actor&&same(command.binding,recovery.binding),'This request belongs to a different workspace or operator.');
  requireLocal(command.path===commandRoute(command.kind,command.planId,command.responseId),'The original request route changed.');
  requireLocal(command.bodyText===JSON.stringify(command.body)&&await sha256(command.bodyText)===command.bodySha256,'The exact original request bytes changed.');
  requireLocal(command.body.actor===command.actor&&(command.body.id??command.responseId)===command.requestId,'The original request identity changed.');
  requireLocal(command.requestSha256===await originalRequestHash(command.kind,command.body),'The saved request does not match the original API’s receipt hash.');
  requireLocal(command.key===canonical([command.contextKey,command.kind,command.path,command.requestId,command.bodySha256]),'The browser request key changed.');
}
async function verifyCommandResult(command,value){
  requireLocal(!metadata?.reopenRequired&&!value.reopenRequired,'Reopen the original workspace before trusting an uncertain saved edition.');
  const record=value.record,body=command.body;
  const sourceRecord=metadata?.handoffs?.find(row=>row.id===command.pin.handoffId),sourceFile=sourceRecord?.files?.find(file=>file.name==='handoff.json');
  requireLocal(sourceFile?.sha256===command.pin.handoffFileSha256&&sourceFile.bytes===command.pin.handoffFileBytes,'The retained original handoff file identity changed. Keep the pending request with its source.');
  requireLocal(record?.id===command.planId&&record.handoffId===command.pin.handoffId,'The returned plan belongs to another original source.');
  if(command.kind==='create')requireLocal(record.requestSha256===command.requestSha256&&record.integrity?.sha256===body.previewSha256,'The retained plan does not match the original request and preview.');
  else{
    requireLocal(record.integrity?.sha256===command.pin.planSha256,'The original retained plan identity changed.');
    if(command.kind==='review'||command.kind==='cancel'){
      const receipt=command.kind==='review'?record.review:record.cancellation;
      requireLocal(receipt?.id===body.id&&receipt.actor===body.actor&&receipt.requestSha256===command.requestSha256,'The original review or cancellation receipt is not yet available.');
    }else if(command.kind==='response'){
      const receipt=(record.responses??[]).find(row=>row.id===body.id);
      requireLocal(receipt&&receipt.requestSha256===command.requestSha256&&receipt.responseSha256===await sha256(body.responseJson),'The retained response does not match the complete original JSON and request.');
      value={...value,response:receipt};
    }else if(command.kind==='response-resume'){
      const receipt=(record.responses??[]).find(row=>row.id===command.responseId);
      requireLocal(receipt&&receipt.id===command.requestId,'The original saved response is not available.');
      value={...value,response:receipt};
    }else{
      const native=record.nativePost;
      requireLocal(native?.id===body.id&&native.requestId===body.id&&native.planSha256===command.pin.planSha256,'The original native posting identity is not available.');
      if(command.kind==='post')requireLocal(native.previewSha256===body.previewSha256&&native.actor===body.actor&&native.createdAt===body.createdAt,'The saved native request differs from its original posting review.');
      value={...value,nativePost:native};
    }
  }
  return value;
}
function commandStatus(command,result){
  if(['post','post-resume'].includes(command.kind))return result.nativePost?.status??result.record.nativePost?.status??'ADMITTED';
  if(['response','response-resume'].includes(command.kind))return result.response?.status??'ADMITTED';
  return command.kind==='review'?'REVIEWED':command.kind==='cancel'?'CANCELLED':result.record.status??'RETAINED';
}
function advancedDraft(command,result){
  const draft=snapshotDraft();draft.selected=command.planId;
  if(command.kind==='create'){draft.planPreview=null;draft.createIdentity=identity();draft.fields['qbo-review-note']='';draft.fields['qbo-cancel-note']='';}
  if(command.kind==='cancel'){draft.responsePreview=null;draft.nativePreview=null;}
  if(['response','response-resume','post','post-resume'].includes(command.kind)){
    draft.responsePreview=null;draft.nativePreview=null;draft.selectedResponse=result.response?.id??result.nativePost?.responseId??draft.selectedResponse;
    if(command.kind==='response'){draft.loadedFile=null;draft.fields['qbo-response-name']='';}
  }
  return draft;
}
async function finishPending(command,value){
  const result=await verifyCommandResult(command,value);
  const outcome={matched:command.kind.endsWith('-resume')?'original-operation':'original-request',commandKey:command.key,bodySha256:command.bodySha256,requestId:command.requestId,kind:command.kind,planId:command.planId,actor:command.actor,binding:clone(command.binding),
    status:commandStatus(command,result),revision:result.revision,at:new Date().toISOString(),responseId:result.response?.id??result.nativePost?.responseId??null,planSha256:result.record.integrity?.sha256};
  await writeLocal({draft:advancedDraft(command,result),outcome});pending=null;recovery.dirty=false;
  await applyCommandView(command,result);markRecoveryDirty();renderRecovery();return result;
}
async function applyCommandView(command,result){
  if(command.kind==='create'){invalidatePlan();await selectPlan(command.planId,{reset:true});$('qbo-review-note').value='';$('qbo-cancel-note').value='';$('qbo-cancel-unused').checked=false;}
  else{
    if(selected!==command.planId)await selectPlan(command.planId,{reset:true});
    if(command.kind==='cancel'){invalidateResponse();invalidateNative();$('qbo-cancel-unused').checked=false;}
    if(['post','post-resume'].includes(command.kind))await nativeSuccess(result);
    if(['response','response-resume'].includes(command.kind)){
      selectedResponse=result.response?.id??command.requestId;invalidateResponse();
      if(command.kind==='response'){loadedFile=null;++fileToken;fileLoading=false;$('qbo-response-file').value='';$('qbo-response-name').value='';$('qbo-file-status').textContent='Choose the complete received JSON file.';}
      showView(result.response?.kind==='FAULT'?'response':'return');
    }
  }
}
function commandMessage(command,result){
  const status=commandStatus(command,result);
  if(['post','post-resume'].includes(command.kind))return nativeResultMessage(result);
  if(['response','response-resume'].includes(command.kind))return status==='SAVED'?'The exact saved response is linked to its original accountant return.':status==='FAULT'?'The exact received QuickBooks fault is retained.':'The original response is retained; continue its saved accountant return.';
  if(command.kind==='review')return 'The exact review is saved with its original journal.';
  if(command.kind==='cancel')return 'The original unused-plan cancellation is saved.';
  return 'The exact journal plan is retained with its original source and mapping.';
}
async function reconcilePending(){
  if(busy||!pending)return;busy=true;controls();
  try{
    assertContext();const command=pending;await validateStoredCommand(command);
    const catalog=await api('/api/qbo');metadata=catalog;
    requireLocal(!catalog.reopenRequired,'Close and reopen the original accounting workspace before reconciling this request.');
    const value=await api('/api/qbo/plans/'+encode(command.planId));
    const result=await finishPending(command,value);await refresh();notify((command.kind.endsWith('-resume')?'Observed the original saved operation. ':'Recovered the original saved request. ')+commandMessage(command,result));
  }catch(error){notify('The original request remains retained. '+error.message,true);}
  finally{busy=false;if(!pending)markRecoveryDirty();renderRecovery();controls();}
}

const base=()=>'/api/qbo/plans/'+encode(selected);
const cancelled=()=>detail?.record?.status==='CANCELLED';
const receivable=()=>detail?.record?.status==='REVIEWED'&&!nativeOwnsReturn();
const approved=()=>!cancelled()&&(Boolean(detail?.record?.review)||['REVIEWED','BOOKED'].includes(detail?.record?.status));
const resumable=item=>responseRecord(item)?.status==='PENDING'&&!cancelled();
const cancellable=()=>Boolean(detail)&&!['BOOKED','CANCELLED'].includes(detail.record.status)&&nativeAllowsCancellation()&&!responses().some(item=>responseRecord(item).status==='PENDING');
const eligible=row=>!['BOOKED','EXCLUDED'].includes(String(row?.externalStatus??'').toUpperCase());
const buyerSource=(value=source)=>value?.sourceKind==='buyer-expense-period';
const buyerPlan=plan=>plan?.sourceKind==='buyer-expense-period';
const sourceTitle=row=>row?.eventId??row?.sourceLineId??row?.rowId??'Allocation';
function buyerIncludeBlockers(row){
  const issues=[];
  if(!eligible(row))issues.push('Its accountant status is '+String(row?.externalStatus)+'. Choose Exclude explicitly.');
  if(/^[+-]?0+$/.test(String(row?.amountAtomic??'')))issues.push('The original native amount is zero. Choose Exclude explicitly.');
  if($('qbo-environment').value==='production'){
    if(row?.network!=='stellar:pubnet')issues.push('Production requires the original Stellar public network.');
    if(row?.dataContext!=='operational')issues.push('Production requires operational source data.');
    if(row?.transfer!=='TRANSFER_MATCHED')issues.push('Production requires the original matched transfer.');
    if(!/^[0-9a-f]{64}$/.test(String(row?.observationSha256??'')))issues.push('Production requires the retained transfer observation digest.');
  }
  return issues;
}
function buyerCounts(){
  const count={total:0,include:0,exclude:0,pending:0,blocked:0};
  for(const row of source?.rows??[]){
    count.total++;const decision=draftRows.get(row.rowId)?.decision;
    if(decision==='include'){count.include++;if(buyerIncludeBlockers(row).length)count.blocked++;}
    else if(decision==='exclude')count.exclude++;else count.pending++;
  }
  return count;
}
function syncBuyerSelected(){draftSelected=new Set((source?.rows??[]).filter(row=>draftRows.get(row.rowId)?.decision==='include').map(row=>row.rowId));}
function buyerKind(row){const kind=row?.kind??row?.sourceAllocation?.kind;return kind==='BUYER_CREDIT'?'Buyer credit':kind==='BUYER_EXPENSE'?'Buyer expense':kind??'Buyer allocation';}
function buyerFact(row,key){if(row?.[key]!==undefined)return row[key];return row?.sourceAllocation?.[key];}
function buyerOriginalFacts(row){
  const keys=['sourceLineId','sourceRowSha256','economicId','network','amountAtomic','originalEconomicAmount','asset','sourceAt','recognitionDate','transfer','observationSha256','dataContext','itemId','creditId','costCenter','project','sourceAccountCode','codingId','line','externalStatus','externalBookRef'];
  const facts=Object.fromEntries(keys.map(key=>[key,buyerFact(row,key)]).filter(([,value])=>value!==undefined));
  return '<details class="qbo-allocation-facts"><summary>Original allocation and source facts</summary><dl class="record-values">'+definitions(facts)+'</dl>'+
    (row.sourceAllocation?'<h5>Source allocation</h5><pre class="qbo-json">'+esc(JSON.stringify(row.sourceAllocation,null,2))+'</pre>':'')+
    (row.original?'<h5>Issued allocation</h5><pre class="qbo-json">'+esc(JSON.stringify(row.original,null,2))+'</pre>':'')+'</details>';
}
function buyerSourceCell(row){
  const amount=buyerFact(row,'amountAtomic'),economic=buyerFact(row,'originalEconomicAmount'),recognition=buyerFact(row,'recognitionDate')??buyerFact(row,'sourceAt'),asset=buyerFact(row,'asset');
  return '<strong>'+esc(sourceTitle(row))+'</strong><span class="subtle">'+esc(buyerKind(row))+'</span><span class="subtle exact">'+esc(row.rowId)+'</span>'+
    (amount!==undefined?'<span class="subtle exact">'+esc(amount)+' original atomic units</span>':'')+
    (economic!==undefined?'<span class="subtle">Original economic amount: '+esc(exact(economic))+'</span>':'')+
    (asset!==undefined?'<span class="subtle">Asset: '+esc(exact(asset))+'</span>':'')+
    '<span class="subtle">Recognition date: '+esc(recognition??'Not recorded')+'</span>'+
    (buyerFact(row,'network')!==undefined?'<span class="subtle">'+esc(buyerFact(row,'network'))+'</span>':'')+
    buyerOriginalFacts(row);
}
function buyerText(value,label){const text=String(value??'').trim();if(!text||text.length>2000)throw new Error(label+' must contain 1–2000 characters.');return text;}
function buyerReviewRows(plan){return [...(plan?.rows??[]).map(row=>({...row,decision:'include'})),...(plan?.excluded??[]).map(row=>({...row,decision:'exclude'}))];}
function renderBuyerReview(kind,plan){
  const prefix='qbo-buyer-'+kind,section=$(prefix+'-review');section.hidden=!buyerPlan(plan);if(section.hidden)return;
  const count=(plan.rows??[]).length,excluded=(plan.excluded??[]).length;
  $(prefix+'-summary').textContent=count+' included allocations · '+excluded+' explicitly excluded. Exclusions belong to this journal plan and leave the original accountant status unchanged.';
  $(prefix+'-basis').textContent=plan.valuationBasis??'Not recorded';
  const search=$(prefix+'-search').value.trim().toLowerCase(),decision=$(prefix+'-filter').value;
  const rows=buyerReviewRows(plan).filter(row=>(decision==='all'||row.decision===decision)&&(!search||JSON.stringify(row).toLowerCase().includes(search)));
  const offset=Math.min(buyerReviewOffsets[kind],Math.max(0,Math.floor((rows.length-1)/PAGE)*PAGE));buyerReviewOffsets[kind]=offset;
  const page=rows.slice(offset,offset+PAGE);
  $(prefix+'-rows').innerHTML=page.map(row=>'<tr><td>'+badge(row.decision==='include'?'Included':'Excluded')+'</td><td>'+buyerSourceCell(row)+'</td><td>'+
    (row.decision==='include'?'<strong class="exact">'+esc(row.amount)+' '+esc(plan.baseCurrency)+'</strong><span class="subtle">Debit '+esc(row.debitAccount?.name||row.debitAccount?.value)+' · '+esc(row.debitAccount?.value)+'</span><span class="subtle">Credit '+esc(row.creditAccount?.name||row.creditAccount?.value)+' · '+esc(row.creditAccount?.value)+'</span>':'<span class="hint">No journal lines</span>')+
    '</td><td class="qbo-allocation-note">'+(row.decision==='include'?'<strong>Valuation note</strong><p>'+esc(row.valuationNote)+'</p>'+(row.description?'<strong>Journal description</strong><p>'+esc(row.description)+'</p>':''):'<strong>Exclusion reason</strong><p>'+esc(row.reason)+'</p>')+'</td></tr>').join('')||
    '<tr><td colspan="4" class="qbo-empty-row">No allocation decisions match this filter.</td></tr>';
  pageLabel(prefix,offset,page.length,rows.length);
}
const planRows=(plan=detail?.plan)=>plan?.rows??[];
const journal=(plan=detail?.plan)=>plan?.journalEntry??{};
const lines=(plan=detail?.plan)=>journal(plan).Line??[];
const responseRecord=item=>item?.record??item;
const responseResult=item=>item?.result??item;
const responses=()=>detail?.responses??[];
const resultLabel=result=>result?.status==='PENDING'?'Accountant return pending':result?.status==='SAVED'?'Accountant return saved':result?.kind==='MATCHED'?'Journal matched':result?.kind==='FAULT'?'QuickBooks fault':result?.status??'Response retained';
const summaryMetrics=plan=>[...(buyerPlan(plan)?[['Included allocations',planRows(plan).length],['Excluded allocations',plan?.excluded?.length??0]]:[['Source events',plan?.summary?.rowCount??planRows(plan).length]]),['Journal lines',plan?.summary?.lineCount??lines(plan).length],['Debits',plan?.summary?.totalDebit??'See journal'],['Credits',plan?.summary?.totalCredit??'See journal']];
class RequestError extends Error{
  constructor(response,value){super(value.message||value.error||'The workspace request could not be completed.');this.status=response.status;this.code=value.error;this.outcomeUnknown=true;this.reopenRequired=value.reopenRequired===true;}
}
function unknownResponse(message,status){const error=new Error(message);error.status=status;error.outcomeUnknown=true;return error;}
async function scopedFetch(path,{bodyText}={}){
  requireLocal(recovery.binding||(path==='/api/qbo'&&bodyText===undefined),'Read the original workspace identity before continuing.');
  const expected=recovery.binding?clone(recovery.binding):null,headers={};
  if(expected){headers['X-Accounting-Workspace-Id']=expected.workspaceId;headers['X-Accounting-Sources-Sha256']=expected.sourcesSha256;}
  if(bodyText!==undefined){headers['Content-Type']='application/json';headers['X-Workspace-Request']='1';}
  let response;
  try{response=await fetch(path,{cache:'no-store',headers,...(bodyText===undefined?{}:{method:'POST',body:bodyText})});}
  catch(error){throw unknownResponse('No readable workspace response was received. Keep the original request and read its saved outcome. '+error.message);}
  const observed=bindingValue({workspaceId:response.headers.get('X-Accounting-Workspace-Id'),sourcesSha256:response.headers.get('X-Accounting-Sources-Sha256')});
  if(!observed)throw unknownResponse('The response did not identify its accounting workspace. The original request remains unresolved.',response.status);
  if(expected)assertScope(observed);
  const reopen=response.headers.get('X-Accounting-Reopen-Required');
  if(reopen!=='0'&&reopen!=='1')throw unknownResponse('The response did not identify whether its saved workspace must reopen. Keep the original request.',response.status);
  if(reopen==='1'&&metadata)metadata={...metadata,reopenRequired:true};
  return {response,binding:observed,reopenRequired:reopen==='1'};
}
async function api(path,body,{bodyText}={}){
  const wire=body===undefined?undefined:bodyText??JSON.stringify(body),result=await scopedFetch(path,{bodyText:wire}),{response}=result;
  let value;
  try{
    if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))throw new Error('Not an application/json response.');
    value=await response.json();
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Not a workspace response object.');
  }catch{throw unknownResponse('The workspace returned an unreadable response. Read or retry the same submitted operation.',response.status);}
  if(!recovery.binding){
    requireLocal(response.ok&&path==='/api/qbo'&&same(bindingValue(value.binding),result.binding),'Open the current QBO workspace with its original identity support.');
    recovery.binding=clone(result.binding);
  }else if(value.binding)assertScope(value.binding);
  if(result.reopenRequired||value.reopenRequired===true){if(metadata)metadata={...metadata,reopenRequired:true};value={...value,reopenRequired:true};}
  if(!response.ok)throw new RequestError(response,value);
  const next=typeof value.revision==='number'?value.revision:value.state?.revision;
  if(typeof next==='number')revision=Math.max(revision,next);
  return value;
}
async function downloadBoundLink(anchor){
  const url=new URL(anchor.href,location.href);requireLocal(url.origin===location.origin,'Download from this original workspace.');
  const {response}=await scopedFetch(url.pathname+url.search);
  if(!response.ok)throw unknownResponse('The original workspace could not return this file. Its source and request stay unchanged.',response.status);
  const blob=await response.blob(),object=URL.createObjectURL(blob),link=document.createElement('a');
  const header=response.headers.get('content-disposition')??'',name=/filename="([^"\r\n]+)"/.exec(header)?.[1]||anchor.download||url.pathname.split('/').at(-1)||'accounting-handoff';
  link.href=object;link.download=name.replace(/[/\\\u0000-\u001f]/g,'_');document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(object),30000);
}
function notify(message,error=false){$('qbo-message').textContent=message;$('qbo-message').hidden=!message;$('qbo-message').classList.toggle('error',error);}
function attempt(work){return Promise.resolve().then(work).catch(error=>notify(error.message||String(error),true));}
function operator(){assertContext();const value=$('qbo-operator').value.trim();if(!value||value.length>1000){$('qbo-operator').focus();throw new Error('Enter the operator or reviewer name before saving.');}return value;}
function options(element,items,wanted=element.value){
  const html=items.map(([value,label])=>'<option value="'+esc(value)+'">'+esc(label)+'</option>').join('');
  if(element.innerHTML!==html)element.innerHTML=html;
  element.value=items.some(([value])=>value===wanted)?wanted:items[0]?.[0]??'';
}
function showView(view){
  document.querySelectorAll('[data-qbo-view]').forEach(button=>{const active=button.dataset.qboView===view;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  document.querySelectorAll('.qbo-view').forEach(section=>{section.hidden=section.id!=='qbo-view-'+view;});
}
function remember(){
  const url=new URL(location.href);if(selected)url.searchParams.set('plan',selected);else url.searchParams.delete('plan');
  if(selectedResponse)url.searchParams.set('response',selectedResponse);else url.searchParams.delete('response');
  history.replaceState(null,'',url);document.title=(detail?.plan?.name?detail.plan.name+' · ':'')+'QuickBooks journal handoff';
}
function controls(){
  const writable=Boolean(metadata)&&canEdit();
  $('qbo-refresh').disabled=busy;
  $('qbo-connection-refresh').disabled=busy||Boolean(pending);$('qbo-company-fetch').disabled=!writable||!connection?.available;
  $('qbo-native-refresh').disabled=busy;
  $('qbo-native-preview').disabled=!writable||!nativeCanStart();$('qbo-native-post').disabled=!writable||!nativePreviewCurrent()||!$('qbo-native-confirm').checked;
  $('qbo-native-confirm').disabled=!writable||!nativePreviewCurrent();$('qbo-native-clear-preview').disabled=!writable;
  $('qbo-native-resume').disabled=!writable||!nativeCanResume();
  const buyer=buyerSource(),counts=buyer?buyerCounts():null;
  $('qbo-create').disabled=!writable||!source||(buyer?(!counts.include||counts.pending>0||counts.include>MAX_ROWS):!draftSelected.size);
  $('qbo-retain-plan').disabled=!writable||!planPreview;
  $('qbo-clear-plan-preview').disabled=!writable;
  $('qbo-review').disabled=!writable||!detail||approved()||cancelled();
  $('qbo-cancel').disabled=!writable||!cancellable();
  $('qbo-company-load').disabled=!writable;$('qbo-company-manual').disabled=!writable||!loadedCompany;
  $('qbo-response-resume').disabled=!writable||!resumable(responseDetail);
  document.querySelectorAll('[data-qbo-resume]').forEach(button=>{button.disabled=!writable||cancelled();});
  $('qbo-import').disabled=!writable||!receivable()||fileLoading||!loadedFile;
  $('qbo-apply').disabled=!writable||!responsePreview||!receivable();
  $('qbo-clear-preview').disabled=!writable;
  $('qbo-retry').disabled=busy||!pending||!contextReady()||Boolean(metadata?.reopenRequired);
  $('qbo-read-pending').disabled=busy||!pending||!contextReady();
  $('qbo-download-pending').disabled=!pending;
  $('qbo-recovery-open').disabled=busy||!recovery.binding||!recovery.db||recovery.mismatch;
  $('qbo-recovery-reload').disabled=busy||!recovery.cache||recovery.mismatch;
  $('qbo-recovery-save').disabled=busy||!contextReady()||Boolean(pending);
  $('qbo-recovery-download').disabled=!recovery.cache;
  $('qbo-saved-operator').disabled=busy||Boolean(pending);
  $('qbo-other-download').disabled=!$('qbo-other-record').value||!recovery.db;
  $('qbo-fill-accounts').disabled=!writable||!draftSelected.size;
  $('qbo-draft-select-page').disabled=!writable||!source;$('qbo-draft-clear').disabled=!writable||(buyer?!(counts.include||counts.exclude):!draftSelected.size);
  $('qbo-buyer-exclude-pending').disabled=!writable||!buyer||!counts?.pending;
  const sourceById=new Map((source?.rows??[]).map(row=>[row.rowId,row]));
  for(const input of $('qbo-mappings').querySelectorAll('input,textarea,select')){
    const id=input.closest('[data-qbo-source-row]')?.dataset.qboSourceRow;
    if(buyer){
      const decision=draftRows.get(id)?.decision??'pending';
      input.disabled=!writable||(input.hasAttribute('data-qbo-decision')?false:input.dataset.qboField==='reason'?decision!=='exclude':decision!=='include');
    }else input.disabled=!writable||!eligible(sourceById.get(id))||(input.type!=='checkbox'&&!draftSelected.has(id));
  }
  for(const button of $('qbo-plan-list').querySelectorAll('button'))button.disabled=busy||Boolean(pending);
  for(const form of ['qbo-create-form','qbo-review-form','qbo-response-form','qbo-company-form','qbo-cancel-form'])for(const input of $(form).querySelectorAll('input,select,textarea'))if(!input.closest('#qbo-mappings'))input.disabled=!writable||((form==='qbo-response-form'&&!receivable())||(form==='qbo-review-form'&&cancelled()));
  $('qbo-operator').disabled=busy||Boolean(pending);
  renderRecovery();
  document.body.classList.toggle('working',busy);
}
function invalidatePlan(){planPreview=null;createIdentity=identity();$('qbo-plan-preview-panel').hidden=true;controls();}
function invalidateResponse(){
  responsePreview=null;++responseToken;previewOffset=0;$('qbo-preview-panel').hidden=true;$('qbo-return-empty').hidden=detail?.record?.status==='BOOKED';
  if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}
  $('qbo-preview-download').hidden=true;$('qbo-preview-download').removeAttribute('href');controls();
}
async function reading(work){
  if(busy||pending)return;busy=true;controls();
  try{return await work();}finally{busy=false;if(recovery.cache&&!recovery.hydrating)markRecoveryDirty();controls();}
}
async function perform(intent,retrying=false){
  if(busy)return;
  if(pending&&!retrying){notify('Read the original pending request before submitting another operation.',true);return;}
  busy=true;controls();let command=null;
  try{
    assertContext();await flushDraft();await recovery.queue;
    const catalog=await api('/api/qbo');metadata=catalog;
    requireLocal(!catalog.reopenRequired,'Close and reopen the original accounting workspace before continuing this request.');
    if(retrying){
      requireLocal(pending,'Open the saved original request first.');command=pending;await validateStoredCommand(command);
      const stored=await localRead('commands',command.key);requireLocal(stored&&stored.bodyText===command.bodyText&&stored.bodySha256===command.bodySha256,'The original submitted bytes are missing or changed.');
    }else{
      requireLocal(!recovery.gate?.pending,'Read the browser’s existing workspace request before submitting another.');
      if(intent.body.revision!==catalog.revision){
        invalidatePlan();invalidateResponse();invalidateNative();await refresh();markRecoveryDirty();
        throw new Error('Saved state changed before dispatch. Your draft is retained; review it against the current state. No new request was sent.');
      }
      command=await makeStoredCommand(intent);
      await writeLocal({draft:snapshotDraft(),command});pending=command;recovery.dirty=false;renderRecovery();controls();
    }
    const value=await api(command.path,command.body,{bodyText:command.bodyText});
    const result=await finishPending(command,value);
    await refresh();notify(commandMessage(command,result));
  }catch(error){
    if(command&&recovery.cache?.lastOutcome?.commandKey===command.key&&!pending)
      notify('The original receipt is saved. Its updated view could not be loaded: '+error.message,true);
    else if(pending)notify('The exact '+pending.description+' request remains saved for this operator. Read its original outcome or retry the unchanged request. '+error.message,true);
    else notify(error.message||String(error),true);
  }finally{busy=false;if(!pending&&contextReady())markRecoveryDirty();renderRecovery();controls();}
}
function pageLabel(prefix,offset,count,total){$(prefix+'-page').textContent=total?(offset+1)+'–'+(offset+count)+' of '+total:'No records';$(prefix+'-previous').disabled=offset===0;$(prefix+'-next').disabled=offset+count>=total;}
function renderIssues(element,issues,title='Details requiring review'){
  const list=Array.isArray(issues)?issues:issues?[issues]:[];element.hidden=!list.length;
  element.innerHTML=list.length?'<h3>'+esc(title)+'</h3><ul>'+list.map(issue=>'<li>'+esc(typeof issue==='string'?issue:issue.message??issue.detail??JSON.stringify(issue))+'</li>').join('')+'</ul>':'';
}
function renderHistory(){
  const search=$('qbo-plan-search').value.trim().toLowerCase();
  const plans=(metadata?.plans??[]).filter(row=>!search||[row.name,row.id,row.realmId,row.companyName,row.handoffId,row.actor].some(value=>String(value??'').toLowerCase().includes(search)));
  $('qbo-plan-list').innerHTML=plans.slice(0,planLimit).map(row=>'<button type="button" data-qbo-plan="'+esc(row.id)+'"'+(selected===row.id?' class="selected" aria-current="true"':'')+'><strong>'+esc(row.name)+'</strong><span>'+esc(row.companyName??row.realmId??'')+' · '+esc(row.environment??'')+'</span><span>'+esc(date(row.createdAt))+' · '+esc(row.nativePost?(nativeLabels[row.nativePost.status]??row.nativePost.status):row.status??'DRAFT')+'</span></button>').join('')||'<p class="hint">No retained plans match this search.</p>';
  $('qbo-plan-more').hidden=plans.length<=planLimit;$('qbo-state-version').textContent='Saved workspace revision '+revision+' · '+(metadata?.plans?.length??0)+' journal plans';
}
function saveDraft(){
  const key=draftSourceKey();if(key)sourceDrafts.set(key,{source:sourceIdentity(),expectedParentId:source.expectedParentId??null,rows:draftRows,selected:draftSelected,valuationBasis:buyerValuationBasis});
}
async function loadSource({force=false}={}){
  const id=$('qbo-handoff').value;
  if(!id){saveDraft();source=null;sourceChoice='';renderSource();return;}
  if(sourceChoice===id&&source&&!force)return;
  const priorPin=source?sourceIdentity():recovery.restoredSourcePin,priorParent=source?.expectedParentId??null;
  saveDraft();sourceChoice=id;
  const token=++sourceToken;$('qbo-source-description').textContent='Loading the original handoff…';controls();
  const value=await api('/api/qbo/handoffs/'+encode(id));if(token!==sourceToken||id!==sourceChoice||id!==$('qbo-handoff').value)return;
  const pin=sourceIdentity(value),key=canonical(pin),saved=sourceDrafts.get(key);
  const changed=priorPin&&!same(priorPin,pin);
  if(changed){invalidatePlan();draftOffset=0;notify('The selected handoff file changed. Its earlier mappings stay in the downloaded browser record; review this exact source separately.');}
  if(source&&source.record.id===id&&priorParent!==(value.expectedParentId??null))invalidatePlan();
  draftRows=saved?.rows??new Map();draftSelected=saved?.selected??new Set();buyerValuationBasis=saved?.valuationBasis??'';source=value;recovery.restoredSourcePin=null;
  for(const row of source.rows??[])if(!draftRows.has(row.rowId))draftRows.set(row.rowId,{amount:'',debitAccount:{value:'',name:''},creditAccount:{value:'',name:''},description:'',decision:'pending',reason:'',valuationNote:''});
  if(buyerSource()){
    syncBuyerSelected();const blocked=buyerCounts().blocked;
    if(blocked)notify(blocked+' included allocations are now blocked by the current source or company environment. Their decisions and entered values remain; review them explicitly.',true);
  }else{
    const valid=new Set((source.rows??[]).filter(eligible).map(row=>row.rowId)),prior=draftSelected.size;
    draftSelected=new Set([...draftSelected].filter(rowId=>valid.has(rowId)));
    if(draftSelected.size<prior)notify('The current bookkeeping state removed '+(prior-draftSelected.size)+' events from this draft selection. Their entered mapping values are retained.');
  }
  if(!$('qbo-name').dataset.dirty)$('qbo-name').value=((source.record?.name??'Merchant settlement')+' · QuickBooks').slice(0,160);
  renderSource();
}
function renderSource(){
  const buyer=buyerSource();
  $('qbo-accountant-revision').value=source?(source.expectedParentId?'Saved return '+source.expectedParentId:'Original handoff'):'Choose a handoff';
  if(source){const origin=source.source??source.record?.source??{};
    $('qbo-source-description').innerHTML='<p><strong>'+esc(source.record?.name??'Original accountant handoff')+'</strong> · '+esc(source.rows?.length??0)+' '+(buyer?'buyer allocations':'source events')+'</p>'+
      (buyer?'<p class="hint">Each expense or credit allocation needs an explicit journal decision. Original asset amounts and recognition dates are preserved; enter home-currency values and both account directions yourself.</p><details><summary>Buyer and handoff source</summary><dl class="record-values">'+definitions({buyer:source.buyer??origin.buyer,source:origin})+'</dl></details>':'<p class="hint">'+esc(origin.periodClose?'Retained period close '+origin.periodClose.id+' · version '+origin.periodClose.revision:'Original reconciliation '+(origin.runId??''))+'</p>');
  }else $('qbo-source-description').innerHTML='<p>Prepare an accountant handoff in the merchant workspace, then return here to choose its source.</p>';
  $('qbo-buyer-basis-field').hidden=!buyer;$('qbo-valuation-basis').required=buyer;$('qbo-valuation-basis').value=buyerValuationBasis;
  $('qbo-buyer-bulk').hidden=!buyer;
  $('qbo-mapping-title').textContent=buyer?'Decide every buyer allocation and map its journal lines':'Select source events and map their journal lines';
  $('qbo-mapping-description').textContent=buyer?'Include or exclude every allocation. Included expenses and credits need a positive home-currency amount, two distinct accounts and a valuation note. Exclusions need a reason and stay local to this journal plan.':'Enter the amount in company home currency and the debit and credit accounts for each selected original event.';
  $('qbo-draft-search-label').textContent=buyer?'Find buyer allocations':'Find source events';
  $('qbo-draft-search').placeholder=buyer?'Allocation, expense, credit, project or source reference':'Event, option, network or original reference';
  $('qbo-draft-select-page').textContent=buyer?'Include pending on this page':'Select this page';
  $('qbo-draft-clear').textContent=buyer?'Reset all decisions':'Clear selection';
  $('qbo-fill-description').textContent=buyer?'Fill blank account fields across included allocations':'Fill blank account fields across selected events';
  $('qbo-mapping-caption').textContent=buyer?'Journal decisions and mapping for every original buyer allocation':'Journal mapping for each original payment option';
  $('qbo-mapping-head').innerHTML=buyer?'<tr><th scope="col">Decision / exclusion reason</th><th scope="col">Original buyer allocation</th><th scope="col">Home-currency amount / valuation</th><th scope="col">Debit account</th><th scope="col">Credit account</th><th scope="col">Journal description</th></tr>':'<tr><th scope="col">Select</th><th scope="col">Original event</th><th scope="col">Home-currency amount</th><th scope="col">Debit account</th><th scope="col">Credit account</th><th scope="col">Journal description</th></tr>';
  $('qbo-mappings').closest('table').classList.toggle('qbo-buyer-mapping',buyer);
  renderDraftRows();controls();
}
function filteredSourceRows(){const search=$('qbo-draft-search').value.trim().toLowerCase();return (source?.rows??[]).filter(row=>!search||JSON.stringify(row).toLowerCase().includes(search));}
function draftField(id,field,label,value,{amount=false}={}){return '<input data-qbo-field="'+field+'" aria-label="'+esc(label+' for '+id)+'" value="'+esc(value)+'"'+(['debitId','creditId'].includes(field)?' list="qbo-account-options"':'')+(amount?' class="qbo-row-amount" inputmode="decimal" autocomplete="off" placeholder="0.00" maxlength="12"':' maxlength="160"')+'>';}
function renderBuyerDraftRow(row,currency){
  const d=draftRows.get(row.rowId),decision=d.decision??'pending',issues=buyerIncludeBlockers(row),title=sourceTitle(row);
  return '<tr data-qbo-source-row="'+esc(row.rowId)+'"><td><select data-qbo-decision aria-label="Journal decision for '+esc(title)+'">'+
    [['pending','Pending decision'],['include','Include'],['exclude','Exclude']].map(([value,label])=>'<option value="'+value+'"'+(decision===value?' selected':'')+(value==='include'&&issues.length?' disabled':'')+'>'+label+'</option>').join('')+
    '</select><label class="qbo-inline-input-label">Exclusion reason<textarea data-qbo-field="reason" aria-label="Exclusion reason for '+esc(title)+'" rows="3" maxlength="2000">'+esc(d.reason??'')+'</textarea></label>'+
    (issues.length?'<p class="qbo-allocation-blocker">'+esc(issues.join(' '))+'</p>':'')+'</td><td>'+buyerSourceCell(row)+'</td><td>'+
    draftField(title,'amount','Home-currency amount',d.amount,{amount:true})+'<span class="hint qbo-currency-label">'+esc(currency||'Enter currency above')+'</span>'+
    '<label class="qbo-inline-input-label">Valuation note<textarea data-qbo-field="valuationNote" aria-label="Valuation note for '+esc(title)+'" rows="3" maxlength="2000">'+esc(d.valuationNote??'')+'</textarea></label>'+
    '</td><td>'+draftField(title,'debitId','Debit account ID',d.debitAccount.value)+'<span class="qbo-inline-input-label">Account name</span>'+draftField(title,'debitName','Debit account name',d.debitAccount.name)+
    '</td><td>'+draftField(title,'creditId','Credit account ID',d.creditAccount.value)+'<span class="qbo-inline-input-label">Account name</span>'+draftField(title,'creditName','Credit account name',d.creditAccount.name)+
    '</td><td><textarea data-qbo-field="description" aria-label="Journal description for '+esc(title)+'" rows="3" maxlength="2000">'+esc(d.description)+'</textarea></td></tr>';
}
function renderDraftRows(){
  const rows=filteredSourceRows();draftOffset=Math.min(draftOffset,Math.max(0,Math.floor((rows.length-1)/PAGE)*PAGE));
  const page=rows.slice(draftOffset,draftOffset+PAGE),currency=$('qbo-currency').value.trim();
  $('qbo-mappings').innerHTML=page.map(row=>{
    if(buyerSource())return renderBuyerDraftRow(row,currency);
    const d=draftRows.get(row.rowId),chosen=draftSelected.has(row.rowId),label=row.label;
    return '<tr data-qbo-source-row="'+esc(row.rowId)+'"><td><input type="checkbox" data-qbo-selected aria-label="Include '+esc(row.eventId??row.rowId)+'"'+(chosen?' checked':'')+'></td><td><strong>'+esc(row.eventId??row.rowId)+'</strong><span class="subtle">'+esc(row.network??'')+'</span><span class="subtle">'+esc(typeof label==='object'?(label.assetLabel??label.accountName??''):label??'')+'</span><span class="subtle exact">'+esc(row.amountAtomic)+' original atomic units</span><span class="subtle">'+esc(row.externalStatus??'UNREVIEWED')+(row.externalBookRef?' · '+esc(row.externalBookRef):'')+'</span></td><td>'+draftField(row.eventId,'amount','Home-currency amount',d.amount,{amount:true})+'<span class="hint qbo-currency-label">'+esc(currency||'Enter currency above')+'</span></td><td>'+draftField(row.eventId,'debitId','Debit account ID',d.debitAccount.value)+'<span class="qbo-inline-input-label">Account name</span>'+draftField(row.eventId,'debitName','Debit account name',d.debitAccount.name)+'</td><td>'+draftField(row.eventId,'creditId','Credit account ID',d.creditAccount.value)+'<span class="qbo-inline-input-label">Account name</span>'+draftField(row.eventId,'creditName','Credit account name',d.creditAccount.name)+'</td><td><textarea data-qbo-field="description" aria-label="Journal description for '+esc(row.eventId)+'" rows="3" maxlength="2000">'+esc(d.description)+'</textarea></td></tr>';
  }).join('')||'<tr><td colspan="6" class="qbo-empty-row">'+(source?'No source events match this filter.':'Choose a handoff to load its original events.')+'</td></tr>';
  if(buyerSource()){
    const count=buyerCounts();
    $('qbo-mapping-help').textContent=count.include+' included · '+count.exclude+' excluded · '+count.pending+' pending out of '+count.total+' allocations. A journal needs 1–'+MAX_ROWS+' included allocations and an explicit decision for every source row.'+(count.blocked?' '+count.blocked+' included allocations require source review before preview.':'');
    $('qbo-buyer-bulk-count').textContent='Applies to all '+count.pending+' still-pending allocations in this handoff, including rows outside the current page or search. Existing Include and Exclude decisions stay as entered.';
    $('qbo-buyer-exclude-pending').textContent='Exclude '+count.pending+' pending allocations';
  }else $('qbo-mapping-help').textContent=draftSelected.size+' of '+MAX_ROWS+' supported events selected. Enter each amount in company home currency. Booked and excluded events keep their existing accounting status.';
  pageLabel('qbo-draft',draftOffset,page.length,rows.length);controls();
}
function mappedDraftRow(row){
  const d=draftRows.get(row.rowId),amount=d.amount.trim(),title=sourceTitle(row);
  if(!/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/.test(amount)||!/[1-9]/.test(amount))throw new Error('Enter a positive home-currency amount up to 999999999.99, with at most two decimal places, for '+title+'.');
  if(!d.debitAccount.value.trim()||!d.creditAccount.value.trim())throw new Error('Enter both QuickBooks account IDs for '+title+'.');
  return {rowId:row.rowId,amount,debitAccount:{value:d.debitAccount.value.trim(),name:d.debitAccount.name.trim()},creditAccount:{value:d.creditAccount.value.trim(),name:d.creditAccount.name.trim()},description:d.description.trim()};
}
function draftValue(){
  if(!source)throw new Error('Choose an original accountant handoff.');
  const actor=operator(),buyer=buyerSource();let rows,valuationBasis;
  if(buyer){
    const count=buyerCounts();
    if(count.pending)throw new Error('Choose Include or Exclude for all '+count.pending+' pending buyer allocations.');
    if(!count.include||count.include>MAX_ROWS)throw new Error('A QuickBooks journal requires between 1 and '+MAX_ROWS+' included buyer allocations.');
    valuationBasis=buyerText(buyerValuationBasis,'The common valuation basis');
    rows=(source.rows??[]).map(row=>{
      const d=draftRows.get(row.rowId),title=sourceTitle(row);
      if(d.decision==='exclude')return {rowId:row.rowId,decision:'exclude',reason:buyerText(d.reason,'The exclusion reason for '+title)};
      if(d.decision!=='include')throw new Error('Choose an explicit journal decision for '+title+'.');
      const issues=buyerIncludeBlockers(row);if(issues.length)throw new Error(title+': '+issues.join(' '));
      const value=mappedDraftRow(row);
      if(value.debitAccount.value===value.creditAccount.value)throw new Error('Choose distinct debit and credit account IDs for '+title+'.');
      return {...value,decision:'include',valuationNote:buyerText(d.valuationNote,'The valuation note for '+title)};
    });
  }else{
    const chosen=(source.rows??[]).filter(row=>draftSelected.has(row.rowId));
    if(!chosen.length||chosen.length>MAX_ROWS)throw new Error('Select between 1 and '+MAX_ROWS+' original events.');
    rows=chosen.map(row=>{if(!eligible(row))throw new Error('The selected event '+sourceTitle(row)+' already has a booked or excluded status.');return mappedDraftRow(row);});
  }
  return {...createIdentity,name:$('qbo-name').value.trim(),actor,handoffId:sourceChoice,expectedParentId:source.expectedParentId??null,revision,realmId:$('qbo-realm').value.trim(),companyName:$('qbo-company-name').value.trim(),baseCurrency:$('qbo-currency').value,environment:$('qbo-environment').value,txnDate:$('qbo-date').value,docNumber:$('qbo-doc-number').value.trim(),rows,...(buyer?{valuationBasis}:{}),...(loadedCompany?{companySnapshot:loadedCompany}:{})};
}
function renderPlanPreview(){
  if(!planPreview)return;const p=planPreview.value.plan;
  $('qbo-plan-preview-panel').hidden=false;$('qbo-plan-preview-description').textContent=p.companyName+' · '+p.baseCurrency+' · '+p.environment+' · '+p.txnDate;
  $('qbo-plan-preview-metrics').innerHTML=metrics(summaryMetrics(p));$('qbo-plan-preview-json').textContent=JSON.stringify(journal(p),null,2);
  renderBuyerReview('preview',p);renderIssues($('qbo-plan-preview-issues'),p.issues);$('qbo-plan-preview-panel').scrollIntoView({block:'nearest',behavior:'smooth'});controls();
}
const download=(filename,label,planId=selected)=>'<a class="button" download href="/api/qbo/plans/'+encode(planId)+'/download/'+encode(filename)+'">'+esc(label??filename)+'</a>';
function renderPlan(){
  $('qbo-selected').hidden=!detail;$('qbo-empty').hidden=Boolean(detail);if(!detail){controls();return;}
  const p=detail.plan,r=detail.record;
  $('qbo-title').textContent=p.name;$('qbo-subtitle').textContent='Prepared by '+p.actor+' · '+date(p.createdAt);
  $('qbo-plan-status').textContent=cancelled()?'Plan cancelled':r.status==='BOOKED'?'Accountant return saved':r.nativePost?(nativeLabels[r.nativePost.status]??r.nativePost.status):approved()?'Journal approved':'Awaiting journal review';
  $('qbo-metrics').innerHTML=metrics(summaryMetrics(p));
  $('qbo-company-summary').innerHTML='<p><strong>'+esc(p.companyName)+'</strong> · Company '+esc(p.realmId)+' · '+esc(p.baseCurrency)+' · '+esc(p.environment)+'</p><p class="hint">Journal date '+esc(p.txnDate)+(p.docNumber?' · Document '+esc(p.docNumber):'')+'</p>';
  $('qbo-lineage').innerHTML=definitions({handoffId:p.handoffId,handoffSha256:p.handoffSha256,accountantVersion:p.accountantRevisionId??'Original handoff',planId:p.id,planSha256:p.integrity.sha256,companyId:p.realmId,homeCurrency:p.baseCurrency,environment:p.environment});
  $('qbo-journal-description').textContent=buyerPlan(p)?planRows(p).length+' included buyer allocations, with '+(p.excluded?.length??0)+' reasoned exclusions retained in this plan.':planRows(p).length+' selected source events, with a debit and credit retained for each event.';$('qbo-balance-status').textContent=buyerPlan(p)?'Balanced per allocation':'Balanced per source event';
  renderBuyerReview('plan',p);
  renderIssues($('qbo-plan-issues'),p.issues);$('qbo-request-json').textContent=JSON.stringify(journal(p),null,2);
  $('qbo-request-downloads').innerHTML=[...(approved()?[download('journal-entry.json','QuickBooks journal request')]:[]),download('plan.json','Complete plan JSON'),download('accountant.csv','Source-linked accountant CSV'),download('review.html','Offline journal review')].join('');
  $('qbo-review-form').hidden=approved()||cancelled();
  if(r.status==='BOOKED')$('qbo-file-status').textContent='This journal is booked. Reopen its retained response and original accountant return below.';
  else if(cancelled())$('qbo-file-status').textContent='This journal is cancelled. Its saved source and history remain available.';
  else if(r.status==='DRAFT')$('qbo-file-status').textContent='Approve this retained journal in Journal review before choosing its received response.';
  else if(nativeOwnsReturn())$('qbo-file-status').textContent='Continue the retained native posting in Journal review. Its provider response and original accountant return stay with that operation.';
  else if(!loadedFile)$('qbo-file-status').textContent='Choose the complete received JSON file.';
  $('qbo-cancel-form').hidden=!cancellable();
  $('qbo-cancel-status').textContent=cancelled()?'This plan is cancelled. Create a new journal plan to use these source events.':r.status==='BOOKED'?'The journal is linked to a saved accountant return. Its retained history remains available.':responses().some(item=>responseRecord(item).status==='PENDING')?'Complete the pending accountant return before changing this plan.':!nativeAllowsCancellation()?'Continue the original native posting and reconcile its retained provider result before retiring this journal.':'Cancel this retained plan when it has no saved QuickBooks posting and will not be used. Its source events become available for a new journal plan.';
  $('qbo-review-status').textContent=cancelled()?'Cancelled plans retain their saved source and history.':r.review?'Approved by '+r.review.actor+' · '+date(r.review.createdAt):'Approve the retained source, amounts and accounts to enable its native posting review and exact request download.';
  renderLines();renderResponses();renderFiles();renderNative();controls();
}
function renderLines(){
  const search=$('qbo-line-search').value.trim().toLowerCase(),rows=lines().map((line,index)=>({line,index,source:planRows()[Math.floor(index/2)]})).filter(row=>!search||JSON.stringify(row).toLowerCase().includes(search));
  lineOffset=Math.min(lineOffset,Math.max(0,Math.floor((rows.length-1)/PAGE)*PAGE));const page=rows.slice(lineOffset,lineOffset+PAGE);
  $('qbo-lines').innerHTML=page.map(({line,index,source})=>{const d=line.JournalEntryLineDetail??{},account=d.AccountRef??{};
    return '<tr'+(lineIndex===index?' class="selected"':'')+'><td><button type="button" class="inspect" data-qbo-line="'+index+'">Line '+(index+1)+'</button><span class="subtle">'+esc(source?.eventId??source?.rowId??'')+'</span><span class="subtle">'+esc(line.Description??'')+'</span></td><td>'+esc(account.name||account.value)+'<span class="subtle exact">'+esc(account.value)+'</span></td><td class="qbo-numeric exact">'+(d.PostingType==='Debit'?esc(line.Amount):'—')+'</td><td class="qbo-numeric exact">'+(d.PostingType==='Credit'?esc(line.Amount):'—')+'</td></tr>';
  }).join('')||'<tr><td colspan="4" class="qbo-empty-row">No journal lines match this filter.</td></tr>';
  pageLabel('qbo-line',lineOffset,page.length,rows.length);
  const line=lines()[lineIndex],row=planRows()[Math.floor(lineIndex/2)];
  $('qbo-line-detail').innerHTML=line?'<h3>Journal line '+(lineIndex+1)+'</h3><dl class="record-values">'+definitions({postingType:line.JournalEntryLineDetail.PostingType,account:line.JournalEntryLineDetail.AccountRef,amount:line.Amount,currency:detail.plan.baseCurrency,description:line.Description})+'</dl><h3>Original source and mapping</h3><dl class="record-values">'+definitions(row??{})+'</dl>':'<p class="hint">Select a line to inspect its exact source, account and valuation.</p>';
}
function renderFiles(){
  const files=detail?.record?.files??[];
  $('qbo-files').innerHTML=files.length?'<dl class="record-values">'+files.map(file=>'<dt>'+esc(file.name)+'</dt><dd>'+esc(file.bytes)+' bytes<br><span class="mono">'+esc(file.sha256)+'</span></dd>').join('')+'</dl>':'<p class="hint">The complete plan and source-linked files are available in Journal review.</p>';
}
function savePlanDraft(){
  if(!detail?.plan?.id)return;
  const key=canonical([detail.plan.id,detail.plan.integrity.sha256]);
  planDrafts.set(key,{planId:detail.plan.id,planSha256:detail.plan.integrity.sha256,selectedResponse,
    responseName:$('qbo-response-name').value,reviewNote:$('qbo-review-note').value,cancelNote:$('qbo-cancel-note').value,
    loadedFile:loadedFile?{name:loadedFile.name,content:loadedFile.content}:null,responsePreview:clone(responsePreview),nativePreview:clone(nativePreview)});
}
function restorePlanDraft(){
  const saved=planDrafts.get(canonical([detail.plan.id,detail.plan.integrity.sha256]));if(!saved)return;
  selectedResponse=saved.selectedResponse??'';$('qbo-response-name').value=saved.responseName??'';
  $('qbo-review-note').value=saved.reviewNote??'';$('qbo-cancel-note').value=saved.cancelNote??'';
  loadedFile=saved.loadedFile?{...clone(saved.loadedFile),token:fileToken}:null;
  $('qbo-file-status').textContent=loadedFile?loadedFile.name+' · complete JSON restored for this original journal':'Choose the complete received JSON file.';
  if(saved.responsePreview?.planId===selected&&saved.responsePreview.request.revision===revision&&receivable())
    responsePreview=clone(saved.responsePreview);
  if(saved.nativePreview?.planId===selected){nativePreview=clone(saved.nativePreview);if(!nativePreviewCurrent())invalidateNative();}
  $('qbo-native-confirm').checked=false;$('qbo-cancel-unused').checked=false;
}
async function selectPlan(id,{reset=id!==selected}={}){
  if(reset)savePlanDraft();
  const token=++detailToken;selected=id;
  if(reset){buyerReviewOffsets.plan=0;invalidateNative();nativeAttemptOffset=0;detail=null;currentAccountant=null;selectedResponse='';responseDetail=null;loadedFile=null;fileLoading=false;++fileToken;invalidateResponse();$('qbo-response-file').value='';$('qbo-response-name').value='';$('qbo-file-status').textContent='Choose the complete received JSON file.';lineOffset=0;lineIndex=-1;comparisonOffset=0;showView('journal');}
  renderHistory();if(!id){detail=null;renderPlan();remember();return;}
  const value=await api('/api/qbo/plans/'+encode(id));if(token!==detailToken||id!==selected)return;
  detail=value;if(reset&&recovery.cache)restorePlanDraft();const accountant=await api('/api/accountant/handoffs/'+encode(value.plan.handoffId));if(token!==detailToken||id!==selected)return;
  currentAccountant=accountant;renderPlan();renderAccountant();if(responsePreview)renderResponsePreview();if(nativePreview&&nativePreviewCurrent())renderNativePreview();$('qbo-prepare-panel').open=false;remember();
}
async function refresh(){
  const token=++refreshToken,value=await api('/api/qbo');if(token!==refreshToken)return;metadata=value;await loadConnection();if(token!==refreshToken)return;
  const wanted=sourceChoice||query.get('handoff')||$('qbo-handoff').value;
  options($('qbo-handoff'),value.handoffs?.length?value.handoffs.map(h=>[h.id,h.name+' · '+h.rowCount+' events']):[['','Prepare an accountant handoff first']],wanted);
  renderHistory();if(selected&&value.plans?.some(p=>p.id===selected))await selectPlan(selected,{reset:false});else if(selected){selected='';detail=null;renderPlan();remember();}
  await loadSource({force:true});
  if(planPreview&&planPreview.request.revision!==revision){invalidatePlan();notify('Saved state changed. Your mappings are retained; preview them against the current state.');}
  if(responsePreview&&(responsePreview.request.revision!==revision||responsePreview.request.expectedParentId!==(detail?.expectedParentId??null)||!receivable())){invalidateResponse();notify('The saved accountant state changed. Review the retained response and current posting state.');}
  if(nativePreview&&!nativePreviewCurrent()){invalidateNative();notify('Saved posting state changed. Review the current company and original journal again.');}
  renderNative();await refreshRecoveryCatalog();controls();
}
function renderResponses(){
  const items=responses();
  options($('qbo-response-select'),items.length?items.map(item=>{const r=responseRecord(item);return [r.id,r.name+' · '+date(r.createdAt)];}):[['','No received responses yet']],selectedResponse);
  selectedResponse=$('qbo-response-select').value;responseDetail=items.find(item=>responseRecord(item).id===selectedResponse)??null;
  $('qbo-response-history').innerHTML=items.map(item=>{const r=responseRecord(item),result=responseResult(item);
    return '<tr><td><strong>'+esc(r.name)+'</strong><span class="subtle">'+esc(result.journalEntryId??'')+'</span></td><td>'+badge(resultLabel(result))+'</td><td>'+esc(r.actor)+'<span class="subtle">'+esc(date(r.createdAt))+'</span></td><td><div class="actions"><button type="button" data-qbo-response="'+esc(r.id)+'">Open response</button>'+(resumable(item)?'<button type="button" data-qbo-resume="'+esc(r.id)+'">Resume return</button>':'')+'</div></td></tr>';
  }).join('')||'<tr><td colspan="4" class="qbo-empty-row">No QuickBooks response has been retained for this plan.</td></tr>';
  renderResponse();controls();
}
function comparisonRows(result){
  if(Array.isArray(result?.rows))return result.rows;
  if(result?.kind!=='MATCHED')return [];
  return planRows().map(row=>({rowId:row.rowId,eventId:row.eventId,status:'MATCHED',expected:{amount:row.amount,currency:detail.plan.baseCurrency,debitAccount:row.debitAccount,creditAccount:row.creditAccount},received:{journalEntryId:result.journalEntryId,syncToken:result.syncToken}}));
}
function renderComparisonRows(result){
  const rows=comparisonRows(result);comparisonOffset=Math.min(comparisonOffset,Math.max(0,Math.floor((rows.length-1)/PAGE)*PAGE));const page=rows.slice(comparisonOffset,comparisonOffset+PAGE);
  $('qbo-comparison-rows').innerHTML=page.map(row=>'<tr><td>'+esc(row.eventId??row.rowId??'')+'</td><td>'+badge(row.status??'Received')+'</td><td class="exact">'+esc(exact(row.expected??''))+'</td><td class="exact">'+esc(exact(row.received??''))+'</td></tr>').join('')||'<tr><td colspan="4" class="qbo-empty-row">This response has no matched journal rows.</td></tr>';
  pageLabel('qbo-comparison',comparisonOffset,page.length,rows.length);
}
function renderResponse(){
  $('qbo-comparison-panel').hidden=!responseDetail;
  if(!responseDetail){$('qbo-response-description').textContent=cancelled()?'This cancelled plan retains its original source and review history.':'Import the complete received response to compare it with this plan.';$('qbo-response-recovery').hidden=true;return;}
  const r=responseRecord(responseDetail),result=responseResult(responseDetail);
  $('qbo-response-description').textContent='Saved by '+(r.actor??'recorded operator')+' · '+date(r.createdAt);
  $('qbo-comparison-description').textContent=(result.journalEntryId?'Received journal '+result.journalEntryId+' · ':'')+resultLabel(result);
  $('qbo-comparison-status').textContent=resultLabel(result);
  $('qbo-comparison-metrics').innerHTML=metrics([[buyerPlan(detail?.plan)?'Matched allocations':'Matched events',result.summary?.matchedRows??0],['QuickBooks journal',result.journalEntryId??'Not recorded'],['Sync token',result.syncToken??'Not recorded'],['Reported issues',result.errors?.length??0]]);
  renderIssues($('qbo-comparison-issues'),result.errors);renderComparisonRows(result);
  $('qbo-response-json').textContent=JSON.stringify(result,null,2);
  const allowed=new Set(['response.json','result.json','returned.csv','return-request.json']);
  const fileList=Array.isArray(r.files)?r.files:Object.entries(r.files??{}).map(([name,value])=>({name,...(typeof value==='object'?value:{sha256:value})}));
  $('qbo-response-downloads').innerHTML=fileList.filter(file=>allowed.has(typeof file==='string'?file:file.name)).map(file=>{const name=typeof file==='string'?file:file.name;return '<a class="button" download href="'+base()+'/responses/'+encode(r.id)+'/download/'+encode(name)+'">'+esc(name)+'</a>';}).join('');
  $('qbo-response-recovery').hidden=!resumable(responseDetail);
  $('qbo-response-recovery-status').textContent=r.lastError?exact(r.lastError)+' The original saved response and operation identity are retained.':'The received journal has been retained. Resume the same saved response to complete its original accountant return.';
  $('qbo-return-eligibility').textContent=r.status==='PENDING'?'The journal response is retained and its accountant return is pending. Resume this saved response to complete the original handoff.':result.kind==='FAULT'?'The original QuickBooks fault is retained for correction. Choose the next received response after resolving the reported issue.':'The saved response and matched accountant return remain attached to the original handoff. Reopen its current accountant version in the next tab.';
  remember();
}
function renderAccountant(){
  if(!currentAccountant)return;
  $('qbo-return-empty').hidden=Boolean(responsePreview)||detail?.record?.status==='BOOKED';
  const empty=$('qbo-return-empty'),nativePending=nativeOwnsReturn();
  empty.querySelector('h2').textContent=nativePending?'Continue the original native posting':'Preview a saved QuickBooks response';
  empty.querySelector('p').textContent=nativePending?nativeStatusDescription(detail.record.nativePost):'The preview compares the journal to its retained request and shows the bookkeeping changes for the current accountant handoff.';
  const next=empty.querySelector('[data-qbo-open]');next.dataset.qboOpen=nativePending?'journal':'response';next.textContent=nativePending?'Open retained posting':'Choose a QuickBooks response';
  const r=currentAccountant.record,current=currentAccountant.selectedRevision,s=current?.summary??{};
  $('qbo-accountant-current').textContent=r.name+' · '+(current?'Current return: '+current.name:'Original handoff')+' · '+r.rowCount+(buyerPlan(detail?.plan)?' original allocations':' original events');
  $('qbo-accountant-metrics').innerHTML=metrics([[buyerPlan(detail?.plan)?'Original allocations':'Original events',r.rowCount],['Reviewed',s.reviewedRows??0],['Bookkeeper posted',s.bookedRows??0],['Returned versions',r.revisions?.length??0]]);
  const original='/api/accountant/handoffs/'+encode(detail.plan.handoffId);
  $('qbo-accountant-downloads').innerHTML=[['accountant.csv','Current accountant CSV'],['review.html','Current offline review'],['accountant-handoff.tar','Complete current handoff']].map(([name,label])=>'<a class="button" download href="'+original+'/download/'+encode(name)+'">'+esc(label)+'</a>').join('');
  $('qbo-accountant-history').innerHTML=[...(r.revisions??[])].reverse().map(item=>'<tr><td>'+esc(item.name)+'</td><td>'+esc(item.actor)+'</td><td>'+esc(date(item.createdAt))+'</td><td>'+esc(item.summary?.reviewedRows??0)+' reviewed / '+esc(item.summary?.bookedRows??0)+' booked</td></tr>').join('')||'<tr><td colspan="4" class="qbo-empty-row">This original handoff has no returned versions yet.</td></tr>';
}
function renderResponsePreview(){
  if(!responsePreview)return;
  const result=responsePreview.value.result,proposed=result.accountantReturn,rows=result.kind==='MATCHED'?planRows():[],summary=proposed?.summary??{};
  $('qbo-preview-panel').hidden=false;$('qbo-return-empty').hidden=true;
  $('qbo-preview-description').textContent=responsePreview.request.name+' · '+resultLabel(result)+(proposed?' · Accountant return '+proposed.id:'');
  $('qbo-preview-metrics').innerHTML=metrics([[buyerPlan(detail?.plan)?'Matched allocations':'Matched events',result.summary?.matchedRows??0],['Return outcome',summary.outcome??'No return'],['Applied rows',summary.appliedRows??0],['Unchanged rows',summary.unchangedRows??0],['Booked rows',summary.bookedRows??0],['Conflicts',summary.conflictRows??0],['Unknown rows',summary.unknownRows??0],['Missing rows',summary.missingRows??0]]);
  renderIssues($('qbo-preview-issues'),result.errors??[]);
  previewOffset=Math.min(previewOffset,Math.max(0,Math.floor((rows.length-1)/PAGE)*PAGE));const page=rows.slice(previewOffset,previewOffset+PAGE);
  $('qbo-preview-rows').innerHTML=page.map(row=>'<tr><td>'+esc(row.eventId??row.rowId)+'</td><td class="exact">'+esc(row.amount)+' '+esc(detail.plan.baseCurrency)+'</td><td>'+esc(row.debitAccount.name||row.debitAccount.value)+'<span class="subtle exact">'+esc(row.debitAccount.value)+'</span></td><td>'+esc(row.creditAccount.name||row.creditAccount.value)+'<span class="subtle exact">'+esc(row.creditAccount.value)+'</span></td></tr>').join('')||'<tr><td colspan="4" class="qbo-empty-row">This received response contains no matched journal events.</td></tr>';
  pageLabel('qbo-preview',previewOffset,page.length,rows.length);
  $('qbo-apply').textContent=result.kind==='FAULT'?'Retain received QuickBooks fault':'Retain response and save accountant return';
  const csv=result.accountantCsv;
  if(typeof csv==='string'&&!previewUrl){previewUrl=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));$('qbo-preview-download').href=previewUrl;$('qbo-preview-download').download='quickbooks-accountant-return-preview.csv';$('qbo-preview-download').hidden=false;}
  controls();
}
async function previewResponse(){
  if(!detail||!loadedFile||!receivable())throw new Error('Choose a reviewed journal awaiting its saved QuickBooks response.');
  const id=selected,token=responseToken;
  await reading(async()=>{
    const current=await api('/api/qbo/handoffs/'+encode(detail.plan.handoffId));if(selected!==id||token!==responseToken)return;
    const request={...identity(),revision,actor:operator(),name:$('qbo-response-name').value.trim(),realmId:detail.plan.realmId,responseJson:loadedFile.content,expectedParentId:current.expectedParentId??null};
    const value=await api(base()+'/responses/preview',request);if(selected!==id||token!==responseToken)return;
    responsePreview={planId:id,value,request:{...request,revision:value.revision,previewSha256:value.previewSha256}};
    previewOffset=0;renderResponsePreview();showView('return');notify('The response and proposed accountant return are ready for review.');
  });
}

function renderCompany(){
  const company=loadedCompany,accounts=company?.accounts??[];
  $('qbo-account-options').innerHTML=accounts.filter(a=>a.selectable===true).map(a=>'<option value="'+esc(a.value)+'" label="'+esc((a.name??a.value)+' · '+a.value+' · '+(a.AccountType??''))+'"></option>').join('');
  if(!company){$('qbo-company-source-status').textContent='Company and account fields are entered manually.';return;}
  const usable=accounts.filter(a=>a.selectable===true).length,unavailable=accounts.filter(a=>a.selectable!==true),origin=loadedCompanyOrigin;
  $('qbo-company-source-status').innerHTML='<p><strong>Loaded '+esc(company.companyName)+'</strong> · Company '+esc(company.realmId)+' · Home currency '+esc(company.baseCurrency)+' · '+usable+' selectable accounts</p><p class="hint">'+(origin?.kind==='native'?'Native '+esc(origin.environment)+' capture · '+esc(date(origin.capturedAt))+' · '+esc(origin.sourceRequests.length)+' source requests.':'Loaded from saved company exports.')+' Choose an account ID from this company in each mapping field. Review the entered values with the selected company.</p><details><summary>Company source and unavailable accounts</summary><dl class="record-values">'+definitions({sourceDigests:company.sourceDigests,companySha256:company.integrity?.sha256,multiCurrencyEnabled:company.multiCurrencyEnabled})+'</dl>'+ (unavailable.length?'<p class="hint">'+unavailable.length+' unavailable accounts</p><ul>'+unavailable.map(a=>'<li>'+esc((a.name??a.value)+' · '+a.value+' · '+(Array.isArray(a.reasons)?a.reasons.join('; '):exact(a.reasons??'Unavailable')) )+'</li>').join('')+'</ul>':'<p>All supplied accounts are selectable.</p>')+'</details>';
}
function useManualCompany({message=true}={}){
  loadedCompany=null;loadedCompanyOrigin=null;renderCompany();invalidatePlan();if(message)notify('Company and account fields remain available for manual entry.');
}
function accountName(value){return loadedCompany?.accounts?.find(a=>a.value===value&&a.selectable===true)?.name??'';}
async function readJsonFile(file,label,{allowArray=false}={}){
  if(!file)throw new Error('Choose the '+label+' JSON file.');
  if(file.size===0||file.size>MAX_RESPONSE_BYTES)throw new Error(label+' must contain a JSON object and be no larger than 8 MiB.');
  const content=await file.text();let value;
  try{value=JSON.parse(content);}catch{throw new Error(label+' is not valid JSON. Choose the complete original export.');}
  if(!value||typeof value!=='object'||(!allowArray&&Array.isArray(value)))throw new Error(label+' must contain '+(allowArray?'a JSON object or native account-page array.':'a JSON object.'));
  return content;
}
async function loadCompany(){
  await reading(async()=>{
    const realmId=$('qbo-company-realm').value.trim();
    if(!realmId)throw new Error('Enter the company ID for these saved exports.');
    const files=[$('qbo-company-info-file').files[0],$('qbo-company-preferences-file').files[0],$('qbo-company-accounts-file').files[0]];
    if(files.reduce((total,file)=>total+(file?.size??0),0)>MAX_RESPONSE_BYTES)throw new Error('The complete original company sources must be no larger than 8 MiB.');
    const [companyInfo,preferences,accounts]=await Promise.all(files.map((file,index)=>readJsonFile(file,['CompanyInfo','Preferences','Account'][index],{allowArray:index===2})));
    const value=await api('/api/qbo/company/preview',{realmId,companyInfo,preferences,accounts});
    if(!value.company)throw new Error('The workspace did not return a company setup.');
    loadedCompany=value.company;loadedCompanyOrigin={kind:'files'};$('qbo-realm').value=loadedCompany.realmId;$('qbo-company-name').value=loadedCompany.companyName;$('qbo-currency').value=loadedCompany.baseCurrency;
    renderCompany();invalidatePlan();renderDraftRows();notify('Loaded the company home currency and exported account choices.');
  });
}
async function resumeResponse(id){
  const record=responses().map(responseRecord).find(item=>item.id===id);
  if(!record||!resumable(record))throw new Error('Choose a retained response with a pending accountant return.');
  return perform({kind:'response-resume',responseId:id,path:base()+'/responses/'+encode(id)+'/resume',body:{revision,actor:operator()},description:'saved accountant return',message:'The saved response has been reconciled with its original accountant return.',success:async()=>{selectedResponse=id;invalidateResponse();showView('return');}});
}


// Native requests stay in the original retained plan and accountant workspace.
function connectionSignature(value=connection){
  return JSON.stringify([value?.realmId??null,value?.environment??null,value?.minorVersion??null,Boolean(value?.available)]);
}
function connectionMatches(plan=detail?.plan){
  return Boolean(connection?.available&&plan&&connection.realmId===plan.realmId&&connection.environment===plan.environment);
}
function nativeOwnsReturn(){
  const value=detail?.record?.nativePost;
  return Boolean(value&&!['FAULT','BOOKED'].includes(value.status));
}
function nativeAllowsCancellation(){
  const value=detail?.record?.nativePost;
  return !value||(value.status!=='RUNNING'&&!value.observedJournalId&&!value.sourceAttemptId&&(!value.dispatched||(value.status==='FAULT'&&value.writeAttempts===1)));
}
function nativeCanStart(){
  return detail?.record?.status==='REVIEWED'&&!detail.record.nativePost&&connectionMatches()&&!responses().some(item=>['PENDING','SAVED'].includes(responseRecord(item).status));
}
function nativeConnectionMatches(operation=detail?.record?.nativePost){
  if(!operation||!connectionMatches())return false;
  try{
    const url=new URL(operation.requestUrl);
    return (url.searchParams.get('minorversion')??null)===(connection.minorVersion===null||connection.minorVersion===undefined?null:String(connection.minorVersion));
  }catch{return false;}
}
function nativeCanResume(){
  const value=detail?.record?.nativePost;
  if(!value||cancelled()||!['PREPARED','RETRYABLE','UNCERTAIN','RECEIVED','FAULT','CONFLICT'].includes(value.status))return false;
  if(value.retryAt&&Date.now()<Date.parse(value.retryAt))return false;
  return value.status==='RECEIVED'||nativeConnectionMatches(value);
}
function nativePreviewCurrent(){
  return Boolean(nativePreview&&nativeCanStart()&&nativePreview.planId===selected&&nativePreview.request.revision===revision&&nativePreview.request.expectedParentId===(detail?.expectedParentId??null)&&nativePreview.request.actor===$('qbo-operator').value.trim()&&nativePreview.connection===connectionSignature()&&nativePreview.value.preview.planSha256===detail?.plan?.integrity?.sha256);
}
function invalidateNative(){
  nativePreview=null;++nativeToken;$('qbo-native-preview-panel').hidden=true;$('qbo-native-confirm').checked=false;controls();
}
function setConnection(value){
  const prior=connectionSignature();connection=value;connectionIssue='';
  if(prior!==connectionSignature()&&nativePreview)invalidateNative();
  renderConnection();renderNative();
}
function renderConnection(){
  const available=Boolean(connection?.available);
  $('qbo-connection-status').textContent=connectionIssue?'Unavailable':available?'Configured':connection?'Setup required':'Loading';
  $('qbo-connection-description').textContent=connectionIssue?connectionIssue:available?'The accounting server is configured for '+connection.environment+' company '+connection.realmId+'. Load its current company setup to review the native account choices.':connection?'Configure the QuickBooks company connection in the accounting server, then refresh it here.':'Reading the accounting server connection…';
  $('qbo-connection-details').innerHTML=connection?definitions({companyId:connection.realmId??'Not configured',environment:connection.environment,minorVersion:connection.minorVersion??'Provider default',
    ...(connection.authorization?.kind==='oauth-connection'?{company:connection.authorization.companyName??'Load current company setup',connection:connection.authorization.alias,reviewedGrant:connection.authorization.grantId}: {})}):'';
  $('qbo-connection-config').textContent=connection?.authorization?.kind==='oauth-connection'?
    'Authorization uses the reviewed '+connection.authorization.alias+' connection. The connection workspace manages its grant, renewal and disconnect. Use its saved company selection when reopening this accounting workspace.'+
      (connection.authorization.lastError?' Last authorization result: '+connection.authorization.lastError+'.':''):
    'The server reads '+(connection?.tokenEnv??'STARFORGE_QBO_ACCESS_TOKEN')+' through its existing authorized account, or a configured OAuth token provider. STARFORGE_QBO_REALM_ID selects the company and STARFORGE_QBO_ENVIRONMENT selects sandbox or production. Set these in the accounting server process, then refresh this connection.';
  controls();
}
async function loadConnection(){
  try{setConnection(await api('/api/qbo/connection'));}
  catch(error){connection=null;connectionIssue=error.message||'The accounting server connection could not be read.';invalidateNative();renderConnection();renderNative();}
}
async function loadNativeCompany(){
  await reading(async()=>{
    await loadConnection();
    if(!connection?.available)throw new Error(connectionIssue||'Configure the company connection in the accounting server before loading its source.');
    const target={realmId:connection.realmId,environment:connection.environment};
    $('qbo-connection-description').textContent='Loading CompanyInfo, Preferences and every page of the native chart of accounts…';
    try{
      const value=await api('/api/qbo/company/fetch',target),company=value.company;
      if(!company||company.realmId!==target.realmId||value.connection?.realmId!==target.realmId||value.connection?.environment!==target.environment)throw new Error('The loaded company does not match the selected server connection. Refresh its configuration.');
      setConnection(value.connection);loadedCompany=company;loadedCompanyOrigin={kind:'native',capturedAt:value.capturedAt,environment:target.environment,sourceRequests:value.sourceRequests??[]};
      $('qbo-realm').value=company.realmId;$('qbo-company-realm').value=company.realmId;$('qbo-company-name').value=company.companyName;$('qbo-currency').value=company.baseCurrency;$('qbo-environment').value=target.environment;
      renderCompany();invalidatePlan();renderDraftRows();$('qbo-prepare-panel').open=true;
      $('qbo-company-source-status').scrollIntoView({block:'nearest',behavior:'smooth'});
      notify('Loaded '+company.companyName+' from '+target.environment+' company '+target.realmId+'. Review the retained mapping values and home-currency amounts with this company.');
    }finally{renderConnection();}
  });
}
const nativeLabels={PREPARED:'Prepared',RUNNING:'In progress',RETRYABLE:'Ready to resume',UNCERTAIN:'Response uncertain',RECEIVED:'Response received',BOOKED:'Accountant return saved',FAULT:'Provider fault',CONFLICT:'Journal reconciliation'};
function nativeStatusDescription(value){
  if(!value)return '';
  const descriptions={
    PREPARED:'The exact reviewed request and posting identity are retained. Continue this operation to receive the native result.',
    RUNNING:'The accounting server is finding or posting the original journal. Refresh saved state to read its result.',
    RETRYABLE:'The original operation can continue with its retained company, request ID and journal body.',
    UNCERTAIN:'A complete posting outcome is still being reconciled. Resume this operation to find the original journal and continue with the same request ID.',
    RECEIVED:'The native journal response is retained. Resume to complete its original accountant return from those saved bytes.',
    BOOKED:'The native journal is matched to the reviewed plan and linked to its saved original accountant return.',
    FAULT:'QuickBooks returned a retained fault. Read its response, resolve the reported company or journal issue, then continue the original operation or cancel a confirmed unused plan.',
    CONFLICT:'The retained native journal requires reconciliation with this reviewed source. Inspect its exact response and original accounting history, then recheck this operation.'
  };
  return descriptions[value.status]??'Read the retained operation and its provider response files.';
}
function nativeFileLinks(files,prefix,allowed){
  return (files??[]).filter(file=>allowed.includes(file.name)).map(file=>'<div><a class="button" download href="'+prefix+'/'+encode(file.name)+'">'+esc(file.name)+'</a><p class="hint">'+esc(file.bytes)+' bytes · <span class="mono">'+esc(file.sha256)+'</span></p></div>').join('');
}
function renderNativeAttempts(){
  const operation=detail?.record?.nativePost,items=[...(operation?.attempts??[])].reverse();
  $('qbo-native-attempts-panel').hidden=!operation;
  $('qbo-native-attempts-summary').textContent='Native request and response history · '+items.length+' retained attempts';
  nativeAttemptOffset=Math.min(nativeAttemptOffset,Math.max(0,Math.floor((items.length-1)/NATIVE_PAGE)*NATIVE_PAGE));
  const page=items.slice(nativeAttemptOffset,nativeAttemptOffset+NATIVE_PAGE);
  $('qbo-native-attempts').innerHTML=page.map(item=>{
    const request=item.request??{},headers=item.headers??{},prefix=base()+'/post/attempts/'+encode(item.id)+'/download';
    return '<tr><td><strong>'+esc(item.kind)+'</strong><span class="subtle">'+esc(date(item.receivedAt))+'</span><span class="subtle exact">'+esc(item.id)+'</span></td><td>'+badge('HTTP '+item.status)+'<span class="subtle">'+esc(item.responseBytes)+' response bytes</span>'+(headers.intuit_tid?'<span class="subtle">Intuit trace '+esc(headers.intuit_tid)+'</span>':'')+(headers['retry-after']?'<span class="subtle">Retry-After '+esc(headers['retry-after'])+'</span>':'')+'</td><td><strong>'+esc(request.method)+'</strong><span class="subtle">'+esc(request.environment)+' · Company '+esc(request.realmId)+'</span><span class="subtle exact">'+esc(request.requestId??'Read request')+'</span><details><summary>Exact request URL and response digest</summary><p class="exact">'+esc(request.url)+'</p><p class="mono">'+esc(item.responseSha256)+'</p></details></td><td><div class="qbo-file-list">'+nativeFileLinks(item.files,prefix,['response.json','receipt.json'])+'</div></td></tr>';
  }).join('')||'<tr><td colspan="4" class="qbo-empty-row">The operation has no complete provider response yet.</td></tr>';
  pageLabel('qbo-native-attempt',nativeAttemptOffset,page.length,items.length);
}
function renderNative(){
  if(!detail)return;
  const record=detail.record,plan=detail.plan,value=record.nativePost,target=plan.environment+' company '+plan.realmId;
  $('qbo-native-status').textContent=value?(nativeLabels[value.status]??value.status):record.status==='REVIEWED'?'Ready for review':record.status==='BOOKED'?'Accountant return saved':cancelled()?'Cancelled':'Review required';
  let message;
  if(value)message=nativeStatusDescription(value);
  else if(cancelled())message='This journal is cancelled. Its retained source and history remain available.';
  else if(record.status==='BOOKED')message='The original accountant return for this journal is already saved. Open its retained response and return.';
  else if(record.status!=='REVIEWED')message='Approve the retained journal before reviewing its posting to '+target+'.';
  else if(responses().some(item=>['PENDING','SAVED'].includes(responseRecord(item).status)))message='Continue the retained QuickBooks response and original accountant return for this journal.';
  else if(!connection?.available)message='Configure the accounting server connection for '+target+', then refresh it to review this posting.';
  else if(!connectionMatches())message='This retained journal belongs to '+target+'. The server currently selects '+connection.environment+' company '+connection.realmId+'. Select the journal’s original company in the server configuration.';
  else message='Review the exact request for '+target+'. This posting keeps the native journal and original accountant return together.';
  $('qbo-native-description').textContent=message;
  $('qbo-native-preview').hidden=Boolean(value)||['BOOKED','CANCELLED'].includes(record.status);
  $('qbo-native-operation').hidden=!value;
  if(nativePreview&&!nativePreviewCurrent())invalidateNative();
  if(value){
    $('qbo-native-operation-description').textContent=nativeStatusDescription(value);
    $('qbo-native-operation-details').innerHTML=definitions({requestId:value.requestId??value.id,companyId:value.realmId,environment:value.environment,documentNumber:value.docNumber,operator:value.actor,preparedAt:value.createdAt,updatedAt:value.updatedAt,journalEntryId:value.journalEntryId??'Awaiting matched journal',observedJournalId:value.observedJournalId??'No journal observed',writeAttempts:value.writeAttempts??0,responseId:value.responseId??'Awaiting accountant return',requestSha256:value.requestSha256,planSha256:value.planSha256});
    const error=value.lastError;$('qbo-native-error').hidden=!error;$('qbo-native-error').textContent=error?((error.code?error.code+' · ':'')+(error.message??exact(error))):'';
    const wait=value.retryAt&&Date.now()<Date.parse(value.retryAt);$('qbo-native-retry-status').hidden=!value.retryAt;
    $('qbo-native-retry-status').textContent=value.retryAt?(wait?'QuickBooks requested a pause until '+date(value.retryAt)+'. Refresh saved state at or after that time to continue the original request.':'The retained retry time has passed. The original operation can be resumed.'):'';
    $('qbo-native-resume').hidden=value.status==='BOOKED'||cancelled();
    $('qbo-native-resume').textContent=value.status==='RECEIVED'?'Complete saved accountant return':value.status==='CONFLICT'?'Recheck original journal':value.status==='FAULT'?'Recheck original posting':'Resume original posting';
    if(!['BOOKED','RUNNING','RECEIVED'].includes(value.status)&&!nativeConnectionMatches(value))$('qbo-native-operation-description').textContent+=' Restore its original company, environment and minor-version configuration to continue.';
    $('qbo-native-open-response').hidden=!value.responseId;$('qbo-native-open-return').hidden=value.status!=='BOOKED';
    $('qbo-native-downloads').innerHTML=nativeFileLinks(value.files,base()+'/post/download',['intent.json','request.json']);
  }
  renderNativeAttempts();controls();
}
async function previewNative(){
  await reading(async()=>{
    await loadConnection();
    if(!nativeCanStart())throw new Error('Choose a reviewed journal for the configured company, with no retained posting or pending response.');
    invalidateNative();invalidateResponse();
    const planId=selected,token=nativeToken,request={...identity(),actor:operator(),expectedParentId:detail.expectedParentId??null,revision},signature=connectionSignature();
    const value=await api(base()+'/post/preview',request);
    if(token!==nativeToken||planId!==selected||signature!==connectionSignature())return;
    nativePreview={planId,request:{...request,revision:value.revision,previewSha256:value.previewSha256},connection:signature,value};
    if(!nativePreviewCurrent()){invalidateNative();throw new Error('The saved journal changed during posting review. Refresh its state and review the current request.');}
    renderNativePreview();$('qbo-native-preview-panel').scrollIntoView({block:'nearest',behavior:'smooth'});notify('The exact company and native journal request are ready for posting review.');
  });
}
function renderNativePreview(){
  const p=nativePreview?.value?.preview;if(!p||!detail)return;
    $('qbo-native-preview-panel').hidden=false;$('qbo-native-preview-description').textContent=detail.plan.companyName+' · '+p.environment+' company '+p.realmId+' · '+detail.plan.baseCurrency;
    $('qbo-native-preview-metrics').innerHTML=metrics(summaryMetrics({summary:p.summary}));
    $('qbo-native-preview-details').innerHTML=definitions({companyId:p.realmId,environment:p.environment,documentNumber:p.docNumber,journalDate:detail.plan.txnDate,operator:p.actor,requestId:p.requestId,preparedAt:p.createdAt,accountantVersion:p.expectedParentId??'Original handoff',requestUrl:p.requestUrl,requestSha256:p.requestSha256,planSha256:p.planSha256});
    $('qbo-native-confirm-label').textContent='I reviewed the company, journal date, accounts and amounts for posting to '+p.environment+' company '+p.realmId+'.';
  controls();
}
function nativeResultMessage(result){
  const value=result.nativePost??result.record?.nativePost;
  if(value?.status==='BOOKED')return 'QuickBooks journal '+value.journalEntryId+' is matched and linked to the original saved accountant return.';
  return (nativeLabels[value?.status]??'Posting state saved')+'. '+nativeStatusDescription(value);
}
async function nativeSuccess(result){
  invalidateNative();invalidateResponse();
  const value=result.nativePost??result.record?.nativePost;
  if(value?.responseId)selectedResponse=value.responseId;
  showView(value?.status==='BOOKED'?'return':'journal');
}
async function postNative(){
  if(!nativePreviewCurrent()||!$('qbo-native-confirm').checked)throw new Error('Review and confirm this exact company and journal before posting.');
  const intent=nativePreview;
  return perform({kind:'post',path:'/api/qbo/plans/'+encode(intent.planId)+'/post',body:intent.request,description:'native QuickBooks posting',message:nativeResultMessage,success:nativeSuccess});
}
async function resumeNative(){
  const value=detail?.record?.nativePost;
  if(!value||!nativeCanResume())throw new Error(value?.retryAt&&Date.now()<Date.parse(value.retryAt)?'QuickBooks requested a pause until '+date(value.retryAt)+'.':'Refresh the retained operation and its original company configuration before resuming.');
  return perform({kind:'post-resume',path:base()+'/post/resume',body:{id:value.id,revision,actor:operator()},description:'original native QuickBooks posting',message:nativeResultMessage,success:nativeSuccess});
}

$('qbo-date').value=new Date().toISOString().slice(0,10);
$('qbo-company-form').addEventListener('submit',event=>{event.preventDefault();attempt(loadCompany);});
$('qbo-company-manual').addEventListener('click',()=>useManualCompany());
$('qbo-connection-refresh').addEventListener('click',()=>attempt(()=>reading(loadConnection)));
$('qbo-company-fetch').addEventListener('click',()=>attempt(loadNativeCompany));
$('qbo-native-preview').addEventListener('click',()=>attempt(previewNative));
$('qbo-native-confirm').addEventListener('change',controls);
$('qbo-native-post').addEventListener('click',()=>attempt(postNative));
$('qbo-native-resume').addEventListener('click',()=>attempt(resumeNative));
$('qbo-native-clear-preview').addEventListener('click',invalidateNative);
$('qbo-native-refresh').addEventListener('click',()=>attempt(async()=>{if(busy)return;busy=true;controls();try{await refresh();}finally{busy=false;if(!pending)markRecoveryDirty();controls();}}));
$('qbo-native-open-response').addEventListener('click',()=>{const id=detail?.record?.nativePost?.responseId;if(id)chooseResponse(id);});
$('qbo-native-attempt-previous').addEventListener('click',()=>{nativeAttemptOffset=Math.max(0,nativeAttemptOffset-NATIVE_PAGE);renderNativeAttempts();});
$('qbo-native-attempt-next').addEventListener('click',()=>{nativeAttemptOffset+=NATIVE_PAGE;renderNativeAttempts();});
$('qbo-create-form').addEventListener('submit',event=>{
  event.preventDefault();attempt(()=>reading(async()=>{
    const request=draftValue(),token=createIdentity.id;
    const value=await api('/api/qbo/preview',request);
    if(token!==createIdentity.id)return;
    buyerReviewOffsets.preview=0;planPreview={value,request:{...request,revision:value.revision,previewSha256:value.previewSha256}};
    renderPlanPreview();notify('The source, company and journal mapping are ready to retain.');
  }));
});
$('qbo-retain-plan').addEventListener('click',()=>attempt(async()=>{
  if(!planPreview)throw new Error('Preview the current source and mapping before retaining a journal plan.');
  const intent=planPreview;
  await perform({kind:'create',path:'/api/qbo/plans',body:intent.request,description:'journal plan',message:'The journal plan is retained with its original source and explicit account mapping.',success:async result=>{
    invalidatePlan();await selectPlan(result.record.id,{reset:true});$('qbo-review-note').value='';$('qbo-cancel-note').value='';$('qbo-cancel-unused').checked=false;
  }});
}));
$('qbo-clear-plan-preview').addEventListener('click',()=>{invalidatePlan();$('qbo-prepare-panel').open=true;});
$('qbo-review-form').addEventListener('submit',event=>{
  event.preventDefault();attempt(async()=>{
    if(!detail||approved()||cancelled())return;
    const body={id:crypto.randomUUID(),revision,actor:operator(),note:$('qbo-review-note').value.trim(),planSha256:detail.plan.integrity.sha256};
    if(!body.note)throw new Error('Enter a review note for the retained journal.');
    await perform({kind:'review',path:base()+'/review',body,description:'journal approval',message:'The reviewed journal is ready for native posting review and exact request download.'});
  });
});
$('qbo-cancel-form').addEventListener('submit',event=>{
  event.preventDefault();attempt(async()=>{
    if(!cancellable())throw new Error('This journal plan cannot be cancelled in its current saved state.');
    const body={id:crypto.randomUUID(),revision,actor:operator(),note:$('qbo-cancel-note').value.trim(),planSha256:detail.plan.integrity.sha256,unusedConfirmed:$('qbo-cancel-unused').checked};
    if(!body.note||!body.unusedConfirmed)throw new Error('Enter a cancellation note and confirm the journal has not been used.');
    await perform({kind:'cancel',path:base()+'/cancel',body,description:'unused journal cancellation',message:'The unused journal plan is cancelled. Its source events are available for a new plan.',success:async()=>{invalidateResponse();invalidateNative();$('qbo-cancel-unused').checked=false;}});
  });
});
$('qbo-handoff').addEventListener('change',()=>attempt(()=>reading(()=>loadSource())));
$('qbo-operator').addEventListener('input',()=>{renderRecovery();controls();});
$('qbo-create-form').addEventListener('input',event=>{
  const input=event.target;
  if(input.id==='qbo-draft-search'||input.id==='qbo-buyer-bulk-reason'||input.id.startsWith('qbo-default-')||input.matches('[data-qbo-selected],[data-qbo-decision]'))return;
  if(input.id==='qbo-valuation-basis')buyerValuationBasis=input.value;
  if(input.id==='qbo-name')input.dataset.dirty='true';
  if(['qbo-realm','qbo-company-name','qbo-currency','qbo-environment'].includes(input.id)&&loadedCompany)useManualCompany({message:false});
  const field=input.dataset.qboField;
  if(field){
    const id=input.closest('[data-qbo-source-row]')?.dataset.qboSourceRow,row=draftRows.get(id);
    if(!row)return;
    if(field==='debitId'){row.debitAccount.value=input.value;if(!row.debitAccount.name){row.debitAccount.name=accountName(input.value.trim());const name=input.closest('td').querySelector('[data-qbo-field="debitName"]');if(name)name.value=row.debitAccount.name;}}
    else if(field==='creditId'){row.creditAccount.value=input.value;if(!row.creditAccount.name){row.creditAccount.name=accountName(input.value.trim());const name=input.closest('td').querySelector('[data-qbo-field="creditName"]');if(name)name.value=row.creditAccount.name;}}
    else if(field==='debitName')row.debitAccount.name=input.value;
    else if(field==='creditName')row.creditAccount.name=input.value;
    else if(['amount','description','reason','valuationNote'].includes(field))row[field]=input.value;
  }
  invalidatePlan();
  if(input.id==='qbo-currency')document.querySelectorAll('.qbo-currency-label').forEach(label=>{label.textContent=input.value||'Enter currency above';});
  if(input.id==='qbo-environment'&&buyerSource())renderDraftRows();
});
$('qbo-mappings').addEventListener('change',event=>{
  const decision=event.target.closest('[data-qbo-decision]');
  if(decision){
    if(busy||pending||!buyerSource())return;
    const id=decision.closest('[data-qbo-source-row]').dataset.qboSourceRow,row=source.rows.find(item=>item.rowId===id),draft=draftRows.get(id);
    if(!row||!draft)return;
    const value=decision.value;
    if(!['pending','include','exclude'].includes(value))return;
    if(value==='include'){
      const issues=buyerIncludeBlockers(row);if(issues.length){decision.value=draft.decision??'pending';notify(issues.join(' '),true);return;}
      if(draft.decision!=='include'&&buyerCounts().include>=MAX_ROWS){decision.value=draft.decision??'pending';notify('A journal supports up to '+MAX_ROWS+' included allocations. Preserve the remaining allocations with explicit exclusions.',true);return;}
    }
    draft.decision=value;syncBuyerSelected();invalidatePlan();renderDraftRows();return;
  }
  const checkbox=event.target.closest('[data-qbo-selected]');if(!checkbox)return;
  const id=checkbox.closest('[data-qbo-source-row]').dataset.qboSourceRow,row=source?.rows?.find(item=>item.rowId===id);
  if(!eligible(row)){checkbox.checked=false;return;}
  if(checkbox.checked&&draftSelected.size>=MAX_ROWS&&!draftSelected.has(id)){checkbox.checked=false;notify('A journal plan supports up to '+MAX_ROWS+' original events.',true);return;}
  if(checkbox.checked)draftSelected.add(id);else draftSelected.delete(id);
  invalidatePlan();renderDraftRows();
});
$('qbo-draft-search').addEventListener('input',()=>{draftOffset=0;renderDraftRows();});
$('qbo-draft-select-page').addEventListener('click',()=>{
  if(buyerSource()){
    if(busy||pending)return;
    const page=filteredSourceRows().slice(draftOffset,draftOffset+PAGE),undecided=page.filter(row=>!['include','exclude'].includes(draftRows.get(row.rowId)?.decision)),rows=undecided.filter(row=>!buyerIncludeBlockers(row).length);
    if(buyerCounts().include+rows.length>MAX_ROWS){notify('Including the pending eligible allocations on this page would exceed '+MAX_ROWS+'. Choose individual allocations or revise an earlier decision.',true);return;}
    for(const row of rows)draftRows.get(row.rowId).decision='include';
    syncBuyerSelected();invalidatePlan();renderDraftRows();notify('Included '+rows.length+' pending allocations on this page. '+(undecided.length-rows.length)+' pending allocations have source blockers; their decisions remain Pending.');return;
  }
  const rows=filteredSourceRows().slice(draftOffset,draftOffset+PAGE).filter(eligible),next=new Set([...draftSelected,...rows.map(row=>row.rowId)]);
  if(next.size>MAX_ROWS){notify('This page would exceed '+MAX_ROWS+' events. Select individual events or clear part of the existing selection.',true);return;}
  draftSelected=next;invalidatePlan();renderDraftRows();
});
$('qbo-draft-clear').addEventListener('click',()=>{
  if(busy||pending)return;
  if(buyerSource()){
    for(const row of source.rows??[]){const draft=draftRows.get(row.rowId);if(draft)draft.decision='pending';}
    syncBuyerSelected();notify('All buyer decisions are Pending. Entered amounts, mappings, notes and reasons remain available.');
  }else draftSelected.clear();
  invalidatePlan();renderDraftRows();
});
$('qbo-buyer-exclude-pending').addEventListener('click',()=>attempt(()=>{
  if(busy||pending||!buyerSource())return;
  const reason=buyerText($('qbo-buyer-bulk-reason').value,'The reason for excluding the pending allocations');
  const rows=(source.rows??[]).filter(row=>!['include','exclude'].includes(draftRows.get(row.rowId)?.decision));
  for(const row of rows){const draft=draftRows.get(row.rowId);draft.decision='exclude';draft.reason=reason;}
  syncBuyerSelected();invalidatePlan();renderDraftRows();
  notify('Explicitly excluded '+rows.length+' pending allocations with the entered reason. Existing decisions and all original accountant statuses are unchanged.');
}));
$('qbo-draft-previous').addEventListener('click',()=>{draftOffset=Math.max(0,draftOffset-PAGE);renderDraftRows();});
$('qbo-draft-next').addEventListener('click',()=>{draftOffset+=PAGE;renderDraftRows();});
$('qbo-fill-accounts').addEventListener('click',()=>{
  const defaults={debitAccount:{value:$('qbo-default-debit-id').value.trim(),name:$('qbo-default-debit-name').value.trim()},creditAccount:{value:$('qbo-default-credit-id').value.trim(),name:$('qbo-default-credit-name').value.trim()}};
  let changed=0;
  for(const id of draftSelected){const row=draftRows.get(id);if(!row)continue;for(const side of ['debitAccount','creditAccount'])for(const field of ['value','name'])if(!row[side][field].trim()&&defaults[side][field]){row[side][field]=defaults[side][field];changed++;}}
  invalidatePlan();renderDraftRows();notify(changed?'Filled '+changed+' blank account fields across '+(buyerSource()?'the included allocations.':'the selected events.'):'Enter account defaults to fill '+(buyerSource()?'the included allocations’ blank fields.':'the selected events’ blank fields.'));
});
for(const [id,name] of [['qbo-default-debit-id','qbo-default-debit-name'],['qbo-default-credit-id','qbo-default-credit-name']])$(id).addEventListener('change',()=>{if(!$(name).value.trim())$(name).value=accountName($(id).value.trim());});
$('qbo-plan-search').addEventListener('input',()=>{planLimit=24;renderHistory();controls();});
$('qbo-plan-more').addEventListener('click',()=>{planLimit+=24;renderHistory();controls();});
$('qbo-plan-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-qbo-plan]');if(!button)return;
  attempt(()=>reading(()=>selectPlan(button.dataset.qboPlan)));
});
$('qbo-refresh').addEventListener('click',()=>attempt(async()=>{
  if(busy)return;busy=true;controls();try{await refresh();notify(pending?'Saved state refreshed. The submitted operation remains available to read or retry.':'Saved state refreshed. Mappings and complete response files stay in the operator’s browser record.');}finally{busy=false;if(!pending)markRecoveryDirty();controls();}
}));
document.querySelectorAll('[data-qbo-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.qboView)));
document.querySelectorAll('[data-qbo-open]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.qboOpen)));
$('qbo-line-filter').addEventListener('submit',event=>{event.preventDefault();lineOffset=0;renderLines();});
$('qbo-line-previous').addEventListener('click',()=>{lineOffset=Math.max(0,lineOffset-PAGE);renderLines();});
$('qbo-line-next').addEventListener('click',()=>{lineOffset+=PAGE;renderLines();});
$('qbo-lines').addEventListener('click',event=>{
  const button=event.target.closest('[data-qbo-line]');if(!button)return;lineIndex=Number(button.dataset.qboLine);renderLines();$('qbo-line-detail').focus();
});
$('qbo-response-file').addEventListener('change',()=>attempt(async()=>{
  loadedFile=null;invalidateResponse();const token=++fileToken,file=$('qbo-response-file').files[0];
  $('qbo-file-status').textContent='Choose the complete received JSON file.';
  if(!file){fileLoading=false;controls();return;}
  fileLoading=true;controls();$('qbo-file-status').textContent='Reading '+file.name+'…';
  try{
    const content=await readJsonFile(file,'QuickBooks response');if(token!==fileToken)return;
    loadedFile={name:file.name,content,token};$('qbo-file-status').textContent=file.name+' · '+file.size.toLocaleString()+' bytes ready for comparison';
    if(!$('qbo-response-name').value.trim())$('qbo-response-name').value=file.name.replace(/\.json$/i,'').slice(0,160);
  }catch(error){if(token===fileToken){$('qbo-file-status').textContent=error.message;throw error;}}
  finally{if(token===fileToken){fileLoading=false;markRecoveryDirty();controls();}}
}));
$('qbo-response-name').addEventListener('input',invalidateResponse);
$('qbo-response-form').addEventListener('submit',event=>{event.preventDefault();attempt(previewResponse);});
function chooseResponse(id){
  selectedResponse=id;responseDetail=responses().find(item=>responseRecord(item).id===id)??null;comparisonOffset=0;invalidateResponse();renderResponses();showView('response');markRecoveryDirty();
}
$('qbo-response-select').addEventListener('change',()=>chooseResponse($('qbo-response-select').value));
$('qbo-response-history').addEventListener('click',event=>{
  const open=event.target.closest('[data-qbo-response]'),resume=event.target.closest('[data-qbo-resume]');
  if(open)chooseResponse(open.dataset.qboResponse);else if(resume)attempt(()=>resumeResponse(resume.dataset.qboResume));
});
$('qbo-response-resume').addEventListener('click',()=>attempt(()=>resumeResponse(selectedResponse)));
$('qbo-comparison-previous').addEventListener('click',()=>{comparisonOffset=Math.max(0,comparisonOffset-PAGE);renderComparisonRows(responseResult(responseDetail));});
$('qbo-comparison-next').addEventListener('click',()=>{comparisonOffset+=PAGE;renderComparisonRows(responseResult(responseDetail));});
$('qbo-preview-previous').addEventListener('click',()=>{previewOffset=Math.max(0,previewOffset-PAGE);renderResponsePreview();});
$('qbo-preview-next').addEventListener('click',()=>{previewOffset+=PAGE;renderResponsePreview();});
$('qbo-clear-preview').addEventListener('click',()=>{invalidateResponse();showView('response');});
$('qbo-apply').addEventListener('click',()=>attempt(async()=>{
  if(!responsePreview||responsePreview.planId!==selected||!receivable())throw new Error('Preview the received response against this reviewed journal before saving.');
  const intent=responsePreview;
  await perform({kind:'response',path:base()+'/responses',body:intent.request,description:'QuickBooks response and accountant return',message:intent.value.result.kind==='FAULT'?'The received QuickBooks fault is retained for review.':'The saved QuickBooks journal is linked to the original accountant return.',success:async result=>{
    selectedResponse=result.response?.id??intent.request.id;invalidateResponse();loadedFile=null;++fileToken;fileLoading=false;$('qbo-response-file').value='';$('qbo-response-name').value='';$('qbo-file-status').textContent='Choose the complete received JSON file.';showView(intent.value.result.kind==='FAULT'?'response':'return');
  }});
}));
$('qbo-retry').addEventListener('click',()=>{if(pending)attempt(()=>perform(pending,true));});
for(const kind of ['preview','plan']){
  const prefix='qbo-buyer-'+kind,render=()=>renderBuyerReview(kind,kind==='preview'?planPreview?.value?.plan:detail?.plan);
  $(prefix+'-search').addEventListener('input',()=>{buyerReviewOffsets[kind]=0;render();});
  $(prefix+'-filter').addEventListener('change',()=>{buyerReviewOffsets[kind]=0;render();});
  $(prefix+'-previous').addEventListener('click',()=>{buyerReviewOffsets[kind]=Math.max(0,buyerReviewOffsets[kind]-PAGE);render();});
  $(prefix+'-next').addEventListener('click',()=>{buyerReviewOffsets[kind]+=PAGE;render();});
}
$('qbo-read-pending').addEventListener('click',()=>attempt(reconcilePending));
$('qbo-download-pending').addEventListener('click',()=>{if(pending)downloadJSON('quickbooks-original-request.json',pending);});
$('qbo-recovery-open').addEventListener('click',()=>attempt(()=>openOperator()));
$('qbo-recovery-reload').addEventListener('click',()=>attempt(()=>{if(recovery.actor)$('qbo-operator').value=recovery.actor;return openOperator({reload:true});}));
$('qbo-recovery-save').addEventListener('click',()=>attempt(async()=>{markRecoveryDirty();await flushDraft();notify('The complete browser draft is saved for '+recovery.actor+'.');}));
$('qbo-recovery-download').addEventListener('click',()=>attempt(()=>downloadRecovery()));
$('qbo-saved-operator').addEventListener('change',()=>{const actor=$('qbo-saved-operator').value;if(actor){$('qbo-operator').value=actor;renderRecovery();controls();}});
$('qbo-other-record').addEventListener('change',controls);
$('qbo-other-download').addEventListener('click',()=>attempt(()=>downloadRecovery($('qbo-other-record').value)));
for(const type of ['input','change'])document.addEventListener(type,event=>{
  const input=event.target;if(input?.matches('input,textarea,select')&&input.id!=='qbo-operator'&&!input.closest('#qbo-recovery-panel'))markRecoveryDirty();
});
document.addEventListener('click',event=>{
  const anchor=event.target.closest('a[download]');
  if(anchor){const url=new URL(anchor.href,location.href);if(url.origin===location.origin&&/^\/api\/(qbo|accountant)(?:\/|$)/.test(url.pathname)){event.preventDefault();attempt(()=>downloadBoundLink(anchor));return;}}
  const button=event.target.closest('button');
  if(button&&(button.hasAttribute('data-qbo-view')||button.hasAttribute('data-qbo-open')))markRecoveryDirty();
  if(button&&['qbo-draft-select-page','qbo-draft-clear','qbo-buyer-exclude-pending','qbo-fill-accounts','qbo-company-manual','qbo-clear-plan-preview','qbo-clear-preview','qbo-native-clear-preview','qbo-native-open-response'].includes(button.id))markRecoveryDirty();
});
window.addEventListener('beforeunload',event=>{
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  if(recovery.dirty){event.preventDefault();event.returnValue='';}
});
for(const id of DRAFT_FIELDS)defaultDraftFields.set(id,$(id).value);
renderCompany();renderConnection();controls();attempt(startRecovery);

