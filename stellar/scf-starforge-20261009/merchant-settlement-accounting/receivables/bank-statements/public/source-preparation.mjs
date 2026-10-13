// SPDX-License-Identifier: MIT
import {BankStatementsClient} from './sdk/client.mjs';
import {BankSourcePreparationsClient} from './source-preparation-client.mjs';
import {openSourceDeskState,requestSha256,retainOperation,observeOperation} from './source-preparation-state.mjs';
const $=id=>document.getElementById(id),clone=v=>structuredClone(v),json=v=>JSON.stringify(v,null,2);
const KINDS=['collection_prepare','collection_edit','collection_receive','collection_inspect','profile_save','profile_receive','profile_review','profile_apply'];
const HELP={
 collection_prepare:'Choose every complete original. Keep its source ID, interpretation, inclusion choice and exclusion note.',
 collection_edit:'Select an exact retained collection. Load its current revision and original item IDs before making deliberate changes.',
 collection_receive:'Select an incoming complete collection. Receive it as a new copy with this workspace’s actual identity.',
 collection_inspect:'Inspect all originals in the selected retained collection. Exclusions and source problems remain visible.',
 profile_save:'Save a new version of a named interpretation. Select the actual retained library and prior version when updating.',
 profile_receive:'Receive the complete incoming library, preserving its original profiles and version history.',
 profile_review:'Review one actual saved profile version against selected originals from the exact retained collection.',
 profile_apply:'Apply the complete saved review to the same library and collection bytes. Changed material requires a new review.'
};
let openedCapsule=null,capsuleGeneration=0,conflictPage=null,conflictAfter=null,conflictPrevious=[],conflictListGeneration=0;
const WORKING_RECORD_MAX_BYTES=268435456;
const COLUMNS=['postedDate','amount','debit','credit','providerId','payee','memo','reference','checkNumber','type','balance','currency','status','correctsProviderId','correctionAction','valueDate','accountId','bankId','branchId','accountType'];
let client,storage,S,status,savedRevision=0,tail=Promise.resolve(),persistError=null,conflicted=false,conflictSnapshot=null,busy=false,receipts=[],listPage=0,viewArgs=null,viewPage=null,inputReceipt=null,mappingEdit=null,mappingValue=null;
function node(tag,text,attrs={}){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);for(const [k,v]of Object.entries(attrs)){if(k==='class')n.className=v;else n.setAttribute(k,String(v));}return n;}
function button(text,work){const n=node('button',text,{type:'button'});n.addEventListener('click',()=>run(work));return n;}
function message(text,level='info'){$('message').hidden=!text;$('message').textContent=text;$('message').dataset.level=level;}
function errorText(e){return(e?.code?e.code+': ':'')+(e?.message??String(e));}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function download(name,value,type='application/json'){const data=value instanceof Uint8Array||value instanceof Blob?value:typeof value==='string'?value:json(value);const blob=data instanceof Blob?data:new Blob([data],{type});const url=URL.createObjectURL(blob),link=node('a','',{href:url,download:name});document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function request(){if(!S?.draft?.request)throw new Error('Create or open a complete source request.');return S.draft.request;}
function editable({raw=false}={}){if(!S||conflicted||busy||S.pending||S.draft?.frozen)throw new Error('Resolve the original retained request or reopen the current draft before editing.');if(S.draft?.rawDirty&&!raw)throw new Error('Apply the complete retained JSON before changing guided fields. Your raw edits remain intact.');}
function control(){
 for(const n of $('mapping-fields').querySelectorAll('input,select,textarea,button'))n.disabled=conflicted||busy||!!S?.draft?.mappingDraft?.rawDirty;
 $('mapping-json').disabled=conflicted||busy;
 $('mapping-save').disabled=conflicted||busy;
 $('mapping-use-json').disabled=conflicted||busy;
 $('mapping-cancel').disabled=conflicted||busy;
 $('draft-fields').disabled=!S?.draft||conflicted||busy||!!S?.pending||!!S?.draft?.frozen;
 for(const n of $('draft-fields').querySelectorAll('input,select,textarea,button'))if(!['request-json','apply-json','download-request'].includes(n.id))n.disabled=!!S?.draft?.rawDirty||n.readOnly;
 $('reopen').disabled=busy;$('download-desk').disabled=busy;$('download-conflict').disabled=busy;
 for(const n of document.querySelectorAll('[data-conflict-restore]'))n.disabled=!S||busy||conflicted||!!S.pending;
 $('conflicts-before').disabled=busy||!conflictPrevious.length;$('conflicts-after').disabled=busy||!conflictPage?.nextCursor;$('refresh-conflicts').disabled=busy||!storage;
 for(const id of ['new-request','import-request','import-desk','refresh','refresh-list','open-preparation'])$(id).disabled=!S||busy||conflicted||!!S.pending;
 $('defer-pending').disabled=busy||conflicted||!S?.pending;$('reconcile').disabled=busy||conflicted||!S?.pending;$('retry').disabled=busy||conflicted||!S?.pending;
 $('retain-request').disabled=busy||conflicted||!!S?.pending||!$('reviewed').checked||!S?.draft?.review||S.draft.rawDirty||!!S.draft.mappingDraft;
 $('execute').disabled=busy||conflicted||!!S?.pending||S?.selected?.state!=='PREPARED'||!$('execute-reviewed').checked;
 $('execute-reviewed').disabled=busy||conflicted||!!S?.pending;
 $('copy-request').disabled=busy||conflicted||!!S?.pending;
 $('request-from-receipt').disabled=busy||conflicted||!!S?.pending;
 $('download-all').disabled=busy||S?.selected?.state!=='COMPLETE';
 for(const n of document.querySelectorAll('[data-desk-action]'))n.disabled=busy||conflicted||!!S?.pending;
 $('draft-status').textContent=conflicted?'Draft conflict':persistError?'Save needs attention':S?.pending?'Original request retained':S?.draft?.frozen?'Retained request · read only':S?.draft?'Draft retained':'No request selected';
}
function persist(){
 const snapshot=clone(S);
 const work=tail.catch(()=>{}).then(async()=>{
  if(conflicted){conflictSnapshot=snapshot;await storage.preserveConflict(snapshot);throw persistError??new Error('Reopen the current saved desk.');}
  try{const saved=await storage.save(snapshot,savedRevision);savedRevision=saved.revision;S.revision=savedRevision;persistError=null;}
  catch(e){persistError=e;conflicted=true;conflictSnapshot=clone(S);$('conflict').hidden=false;control();if(e.code!=='DRAFT_CONFLICT')await storage.preserveConflict(conflictSnapshot).catch(()=>{});message(errorText(e),'error');throw e;}
 });
 tail=work;work.catch(()=>{});return work;
}
async function flush(){await tail;if(persistError||conflicted)throw persistError??new Error('Reopen the saved desk.');}
function changed(){S.draft.review=null;S.draft.raw=json(S.draft.request);S.draft.rawDirty=false;$('request-json').value=S.draft.raw;$('review').hidden=true;$('reviewed').checked=false;void persist();control();}
async function run(work){
 try{return await work();}catch(e){message(errorText(e),'error');return null;}finally{control();}
}
async function transaction(work,{recover=false}={}){if(busy)throw new Error('Wait for the current operation.');busy=true;control();try{if(recover)await tail.catch(()=>{});else await flush();return await work();}finally{busy=false;control();}}
function newMapping(){return {format:'OFX',columns:{}};}
function editorPin(){editable();return JSON.stringify(S.draft);}
function sameEditor(pin){editable();if(JSON.stringify(S.draft)!==pin)throw new Error('The draft changed while reading original source. Your newer edits remain intact; repeat the selection deliberately.');}
function currentInputs(draft,selected){editable();if(request()!==draft||!same(draft.inputs,selected)||S.draft.rawDirty)throw new Error('The selected original inputs changed. Reload their exact choices.');}
function newRequest(kind,actor=''){
 const p=kind==='collection_prepare'?{collectionId:crypto.randomUUID(),name:'',files:[]}:
 kind==='collection_edit'?{expectedRevision:0,items:[]}:
 kind==='collection_receive'?{collectionId:crypto.randomUUID()}:
 kind==='profile_save'?{libraryId:crypto.randomUUID(),profileId:crypto.randomUUID(),expectedRevision:0,expectedVersion:0,name:'',reason:'',mapping:newMapping()}:
 kind==='profile_receive'?{libraryId:crypto.randomUUID(),expectedRevision:0}:
 kind==='profile_review'?{profileId:'',version:1,itemIds:[]}:{};
 return {workspaceId:S.workspaceId,requestId:crypto.randomUUID(),actor,kind,inputs:[],parameters:p};
}
async function applyDraft(value,{frozen=false}={}){
 if(S.pending)throw new Error('Resolve the original pending action first.');
 if(S.draft){S.draftHistory??=[];S.draftHistory.push(clone(S.draft));}
 S.draft={request:clone(value),raw:json(value),rawDirty:false,review:null,frozen};await persist();renderDraft();control();
}
async function setDraft(value,options){return transaction(()=>applyDraft(value,options));}
function label(text,input){const l=node('label',text);l.append(input);return l;}
function inputField(text,key,value,{type='text',max,readonly=false,onChange}={}){
 const x=node('input',undefined,{type});x.value=value??'';if(max)x.maxLength=max;if(readonly)x.readOnly=true;
 x.addEventListener('input',()=>{if(readonly)return;try{editable();onChange(type==='number'?Number(x.value):x.value);changed();}catch(e){message(errorText(e),'error');}});
 return label(text,x);
}
function paramField(text,key,type='text',extra={}){
 const field=inputField(text,key,request().parameters[key],{type,...extra,onChange:v=>{if(key==='name'&&request().kind==='collection_edit'&&v==='')delete request().parameters.name;else request().parameters[key]=v;}});field.querySelector('input').dataset.parameter=key;return field;
}
function renderDraft(){
 if(!S.draft){$('parameters').replaceChildren();$('request-json').value='';control();return;}
 const r=request();$('new-kind').value=r.kind;$('actor').value=r.actor;$('request-id').value=r.requestId;$('kind-help').textContent=HELP[r.kind]??'';
 $('request-json').value=S.draft.raw;$('review').hidden=!S.draft.review;$('reviewed').checked=false;
 renderInputs();renderParameters();renderReview();control();
}
function renderInputs(){
 const body=$('input-rows');body.replaceChildren();if(!S?.draft)return;
 for(const pin of request().inputs){const tr=node('tr');tr.append(node('td',pin.key),node('td',pin.sourceAlias?'Alias: '+pin.sourceAlias+' · '+pin.name:pin.preparationId+' / '+pin.file),node('td',pin.bytes.toLocaleString()));const hash=node('td');hash.append(node('code',pin.sha256));tr.append(hash);const actions=node('td');const remove=button('Remove',()=>{editable();request().inputs=request().inputs.filter(x=>x.key!==pin.key);if(request().kind==='collection_prepare')request().parameters.files=request().parameters.files.filter(x=>x.sourceKey!==pin.key);changed();renderInputs();renderParameters();});remove.dataset.deskAction='true';actions.append(remove);tr.append(actions);body.append(tr);}
}
function mappingButton(title,get,set,target){const b=button(title,()=>{editable();if(S.draft.mappingDraft&& !same(S.draft.mappingDraft.target,target))throw new Error('Finish or discard the retained interpretation draft before opening another item.');if(!S.draft.mappingDraft){S.draft.mappingDraft={target,value:clone(get()),raw:json(get()),requestId:request().requestId};void persist();}resumeMapping();});b.dataset.deskAction='true';return b;}
function saveMappingDraft(rawDirty=false){editable();if(!S.draft.mappingDraft)return;S.draft.mappingDraft.value=clone(mappingValue);S.draft.mappingDraft.raw=$('mapping-json').value;S.draft.mappingDraft.rawDirty=rawDirty;void persist();control();}
function resumeMapping(){editable();const d=S.draft.mappingDraft;if(!d||d.requestId!==request().requestId)throw new Error('This mapping draft belongs to a different original request.');mappingValue=clone(d.value);const t=d.target;mappingEdit=v=>{if(t.field==='profile')request().parameters.mapping=v;else{const row=request().parameters[t.field].find(x=>x.id===t.id);if(!row)throw new Error('The original mapping item is no longer in this request.');row.mapping=v;}};renderMapping();$('mapping-json').value=d.raw;$('mapping-error').textContent='';$('mapping-dialog').showModal();control();}
function renderParameters(){
 const root=$('parameters');root.replaceChildren();if(!S.draft)return;
 const r=request(),p=r.parameters;root.append(node('h3','Operation choices'));
 if(r.kind==='collection_prepare'){
  root.append(paramField('Collection name','name','text',{max:160}),paramField('New collection ID','collectionId','text',{readonly:true}));
  const wrap=node('div',undefined,{class:'table-wrap'}),table=node('table'),head=node('tr');for(const t of ['Original input','Interpretation','Include','Review note'])head.append(node('th',t));table.append(head);
  for(const f of p.files){const tr=node('tr'),a=node('td',f.sourceKey),m=node('td'),inc=node('td'),note=node('td');m.append(mappingButton(f.mapping.format+' · edit mapping',()=>f.mapping,v=>{f.mapping=v;},{field:'files',id:f.id}));
   const check=node('input',undefined,{type:'checkbox','aria-label':'Include '+f.sourceKey});check.checked=f.included;check.addEventListener('change',()=>{editable();f.included=check.checked;changed();});inc.append(check);
   const n=node('textarea',undefined,{rows:2,maxlength:4000,'aria-label':'Review note for '+f.sourceKey});n.value=f.note;n.addEventListener('input',()=>{editable();f.note=n.value;changed();});note.append(n);tr.append(a,m,inc,note);table.append(tr);
  }wrap.append(table);root.append(wrap);
 }else if(r.kind==='collection_edit'){
  root.append(button('Load selected collection and original items',loadCollectionForEdit),paramField('Expected original revision','expectedRevision','number'),paramField('Collection name (leave absent to keep)','name','text',{max:160}));
  if(p.items.length)root.append(node('p','Only the changed items below are submitted. Remove an item to leave its original choices unchanged.',{class:'muted'}));
  for(const item of p.items){const box=node('section');box.append(node('code',item.id),mappingButton((item.mapping?.format??'Keep original mapping')+' · edit',()=>item.mapping??newMapping(),v=>{item.mapping=v;},{field:'items',id:item.id}));
   const inc=node('select');for(const [v,t]of [['','Keep original inclusion'],['true','Include'],['false','Exclude']])inc.append(node('option',t,{value:v}));inc.value=item.included===undefined?'':String(item.included);inc.addEventListener('change',()=>{editable();if(inc.value==='')delete item.included;else item.included=inc.value==='true';changed();});box.append(label('Inclusion',inc));
   box.append(inputField('Review note','note',item.note,{max:4000,onChange:v=>{item.note=v;}}),button('Leave this item unchanged',()=>{editable();p.items=p.items.filter(x=>x.id!==item.id);changed();renderParameters();}));root.append(box);
  }
 }else if(r.kind==='collection_receive')root.append(paramField('New recipient collection ID','collectionId','text',{readonly:true}),node('p','The complete origin is retained by the existing collection receiver.',{class:'muted'}));
 else if(r.kind==='profile_save'){
  const g=node('div',undefined,{class:'grid two'});g.append(paramField('Profile name','name','text',{max:160}),paramField('Reason for this interpretation','reason','text',{max:4000}),paramField('Library ID','libraryId'),paramField('Profile ID','profileId'),paramField('Expected library revision','expectedRevision','number'),paramField('Expected profile version (0 for new)','expectedVersion','number'));root.append(g,button('Choose an existing profile from the selected library',loadProfileChoices),mappingButton('Edit complete '+p.mapping.format+' interpretation',()=>p.mapping,v=>{p.mapping=v;},{field:'profile'}));
 }else if(r.kind==='profile_receive')root.append(paramField('Recipient library ID','libraryId'),paramField('Expected recipient library revision','expectedRevision','number'),button('Use selected recipient library identity',loadLibraryIdentity));
 else if(r.kind==='profile_review'){
  root.append(button('Load actual library profiles and original collection items',loadProfileReviewChoices),paramField('Selected profile ID','profileId'),paramField('Exact profile version','version','number'));
  const a=node('textarea',undefined,{rows:4,'aria-label':'Selected original item IDs, one per line'});a.value=p.itemIds.join('\n');a.addEventListener('input',()=>{editable();p.itemIds=a.value.split(/\s+/).filter(Boolean);changed();});root.append(label('Original item IDs (one per line)',a));
 }else if(r.kind==='profile_apply')root.append(node('p','Select the library, collection and review input roles above. The original engine checks complete byte hashes, revisions and the reviewed item population before applying.'));
 else root.append(node('p','Every included original is parsed by the installed original engine. Exclusions and source-review problems remain in the complete output.'));
 const choices=node('div',undefined,{id:'parameter-choices'});root.append(choices);if(S.draft.mappingDraft)root.append(button('Resume retained interpretation draft',resumeMapping));
}
async function viewsForPin(key,extra={}){
 const pin=request().inputs.find(x=>x.key===key);if(!pin)throw new Error('Select the exact '+key+' input first.');
 if(!pin.preparationId)throw new Error('This guided selection requires a retained preparation output. A configured incoming file can still use the complete explicit JSON choices.');
 const before=await client.lookup(pin.preparationId);if(before.state!=='COMPLETE'||!before.files.some(x=>x.name===pin.file&&x.bytes===pin.bytes&&x.sha256===pin.sha256))throw new Error('The selected complete input pin changed.');
 let offset=0,total,sha,rows=[],last;
 for(;;){last=await client.view({preparationId:pin.preparationId,offset,limit:100,...extra});const pg=last.view.page;if(total===undefined){total=pg.total;sha=last.outputSha256;}if(pg.total!==total||last.outputSha256!==sha||pg.offset!==offset||!pg.items.length&&offset<total)throw new Error('The complete output changed while reading its original population.');rows.push(...pg.items);offset+=pg.items.length;if(offset===total)break;}
 const expectedName=key==='library'?'library.json':key==='collection'?'collection.json':pin.file;
 if(pin.file!==expectedName||sha!==pin.sha256)throw new Error('The view is not the exact selected '+key+' file. Select its original named output.');
 return {...last.view,page:{offset:0,limit:rows.length,total,items:rows}};
}
async function loadCollectionForEdit(){const edit=editorPin(),draft=request(),v=await viewsForPin('collection');sameEditor(edit);draft.parameters.expectedRevision=v.revision;draft.parameters.items=v.page.items.map(x=>({id:x.id,mapping:clone(x.mapping),included:x.included,note:x.note}));changed();renderParameters();}
async function loadLibraryIdentity(){const edit=editorPin(),draft=request(),v=await viewsForPin('library');sameEditor(edit);draft.parameters.libraryId=v.libraryId;draft.parameters.expectedRevision=v.revision;changed();renderParameters();}
async function loadProfileChoices(){
 const edit=editorPin(),draft=request(),inputs=clone(draft.inputs),v=await viewsForPin('library');sameEditor(edit);
 const root=$('parameter-choices');root.replaceChildren(node('h3','Actual retained profiles'));
 root.append(button('New profile in this library',()=>{currentInputs(draft,inputs);Object.assign(draft.parameters,{libraryId:v.libraryId,expectedRevision:v.revision,profileId:crypto.randomUUID(),expectedVersion:0});changed();renderParameters();}));
 for(const p of v.page.items)root.append(button(p.head.name+' · version '+p.head.version,()=>{currentInputs(draft,inputs);Object.assign(draft.parameters,{libraryId:v.libraryId,expectedRevision:v.revision,profileId:p.id,expectedVersion:p.head.version,name:p.head.name,mapping:clone(p.head.mapping)});changed();renderParameters();}));
}
async function loadProfileReviewChoices(){
 const edit=editorPin(),draft=request(),inputs=clone(draft.inputs),lib=await viewsForPin('library'),col=await viewsForPin('collection');sameEditor(edit);
 const root=$('parameter-choices');root.replaceChildren(node('h3','Choose a retained profile version'));
 for(const p of lib.page.items)root.append(button(p.head.name+' · current version '+p.head.version,()=>{currentInputs(draft,inputs);draft.parameters.profileId=p.id;draft.parameters.version=p.head.version;changed();for(const key of ['profileId','version']){const input=$('parameters').querySelector('[data-parameter="'+key+'"]');if(input)input.value=draft.parameters[key];}}));
 root.append(node('h3','Original collection items'));
 for(const row of col.page.items){const check=node('input',undefined,{type:'checkbox'});check.checked=draft.parameters.itemIds.includes(row.id);check.addEventListener('change',()=>{currentInputs(draft,inputs);const ids=new Set(draft.parameters.itemIds);if(check.checked)ids.add(row.id);else ids.delete(row.id);draft.parameters.itemIds=[...ids];changed();});const l=label(row.file.name+' · '+row.id,check);l.className='check';root.append(l);}
}
function renderMapping(){
 const root=$('mapping-fields');root.replaceChildren();const m=mappingValue,g=node('div',undefined,{class:'grid two'});
 const selects={format:['OFX','QFX','CAMT053','CSV'],textEncoding:['','utf-8','windows-1252','iso-8859-1','utf-16le','utf-16be','us-ascii'],delimiter:[',',';','\t','|'],dateFormat:['YMD','DMY','MDY'],amountMode:['SIGNED','DEBIT_CREDIT'],decimalSeparator:['.',','],groupSeparator:['',',','.',' '],camtNamespaceMode:['DECLARED','UNQUALIFIED'],camtMessageVersion:['','camt.053.001.02','camt.053.001.08'],camtReferencePolicy:['ACCOUNT_SERVICER_REFERENCE','SOURCE_ENTRY'],camtDetailPolicy:['PRESERVE_ONLY','ENTRY_CURRENCY_TX_AMT']};
 for(const [key,choices]of Object.entries(selects)){const x=node('select');x.append(node('option','Use original/default',{value:'__absent'}));for(const v of choices)x.append(node('option',v==='\t'?'Tab':v===''?'(empty)':v,{value:v}));x.value=Object.hasOwn(m,key)?m[key]:'__absent';x.addEventListener('change',()=>{if(x.value==='__absent')delete m[key];else m[key]=x.value;$('mapping-json').value=json(m);saveMappingDraft();});g.append(label(key.replaceAll(/([A-Z])/g,' $1'),x));}
 for(const key of ['headerRow','currency','scale','accountName','bankId','branchId','accountId','accountType','accountNamespace','postedStatuses','pendingStatuses']){const x=node('input');x.value=m[key]??'';x.addEventListener('input',()=>{m[key]=x.value;$('mapping-json').value=json(m);saveMappingDraft();});g.append(label(key.replaceAll(/([A-Z])/g,' $1'),x));}root.append(g,node('h3','Exact original column headings'));
 const c=node('div',undefined,{class:'grid two'});for(const key of COLUMNS){const x=node('input');x.value=m.columns?.[key]??'';x.addEventListener('input',()=>{m.columns??={};if(x.value==='')delete m.columns[key];else m.columns[key]=x.value;$('mapping-json').value=json(m);saveMappingDraft();});c.append(label(key.replaceAll(/([A-Z])/g,' $1'),x));}root.append(c);$('mapping-json').value=json(m);
}
function verifyShape(r){
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
 if(!object(r)||!KINDS.includes(r.kind)||r.workspaceId!==S.workspaceId||!uuid(r.requestId)||typeof r.actor!=='string'||!r.actor.trim()||r.actor.length>1000||!Array.isArray(r.inputs)||!object(r.parameters))throw new Error('Use a complete request bound to this workspace, original UUID, operator and supported operation.');
 if(Object.keys(r).sort().join(',')!=='actor,inputs,kind,parameters,requestId,workspaceId')throw new Error('The request contains unsupported fields.');
 const keys=new Set();let total=0;for(const p of r.inputs){if(!object(p)||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(p.key)||keys.has(p.key)||!Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>192000000||!/^[a-f0-9]{64}$/.test(p.sha256)||typeof p.name!=='string'||!p.name||/[\\/\u0000-\u001f]/.test(p.name))throw new Error('Keep each input’s exact role, original basename, byte count and SHA.');keys.add(p.key);total+=p.bytes;if(p.sourceAlias!==undefined){if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(p.sourceAlias)||p.preparationId!==undefined||p.file!==undefined)throw new Error('Choose one actual configured source alias.');}else if(!uuid(p.preparationId)||typeof p.file!=='string'||!p.file||/[\\/]/.test(p.file))throw new Error('Choose an exact retained preparation and file.');}
 if(total>320000000||r.inputs.length>1000||new TextEncoder().encode(JSON.stringify(r)).length>8000000)throw new Error('The complete request exceeds the original input/request capacity.');
 const p=r.parameters;let required=[],optional=[];
 if(r.kind==='collection_prepare'){if(!uuid(p.collectionId)||!p.name?.trim()||!Array.isArray(p.files)||!p.files.length)throw new Error('Name the collection and select every original file.');required=p.files.map(x=>x.sourceKey);for(const f of p.files){if(!uuid(f.id)||typeof f.included!=='boolean'||typeof f.note!=='string'||!object(f.mapping)||!object(f.mapping.columns)||!['OFX','QFX','CAMT053','CSV'].includes(f.mapping.format))throw new Error('Keep each original item identity and full interpretation.');if(!f.included&&!f.note.trim())throw new Error('Explain each excluded original.');}}
 if(['collection_edit','collection_receive','collection_inspect'].includes(r.kind))required=['collection'];
 if(r.kind==='profile_save'){optional=['library'];if(!p.name?.trim()||!p.reason?.trim()||!uuid(p.libraryId)||!uuid(p.profileId)||!object(p.mapping)||!object(p.mapping.columns))throw new Error('Keep the complete profile identity, interpretation and reason.');}
 if(r.kind==='profile_receive'){required=['incoming'];optional=['library'];}
 if(r.kind==='profile_review'){required=['library','collection'];if(!uuid(p.profileId)||!Number.isInteger(p.version)||p.version<1||!Array.isArray(p.itemIds)||!p.itemIds.length||p.itemIds.some(x=>!uuid(x)))throw new Error('Select the exact saved profile version and original items.');}
 if(r.kind==='profile_apply')required=['library','collection','review'];
 if(required.some(k=>!keys.has(k))||[...keys].some(k=>!required.includes(k)&&!optional.includes(k)))throw new Error('Use the exact input roles for this operation: '+required.join(', ')+(optional.length?' (optional '+optional.join(', ')+')':'')+'.');
 return r;
}
function facts(root,value){root.replaceChildren();for(const [k,v]of Object.entries(value)){root.append(node('dt',k),node('dd',typeof v==='object'?json(v):v??'—'));}}
async function reviewRequest(){
 editable();await flush();if(S.draft.rawDirty)throw new Error('Apply the retained raw JSON before reviewing this request.');if(S.draft.mappingDraft)throw new Error('Use or discard the retained interpretation draft before reviewing the request.');
 const selected=clone(verifyShape(request())),sha=await requestSha256(selected);if(!same(selected,request()))throw new Error('The request changed during review.');
 S.draft.review={requestSha256:sha,sourceSha256:status.sourceSha256,at:new Date().toISOString()};await persist();renderReview();$('review').scrollIntoView({block:'nearest'});
}
function renderReview(){
 const rev=S.draft?.review;$('review').hidden=!rev;if(!rev)return;const r=request();$('review-summary').textContent=HELP[r.kind];facts($('review-facts'),{'Operation':r.kind,'Operator':r.actor,'Original request':r.requestId,'Complete inputs':r.inputs.length,'Total input bytes':r.inputs.reduce((n,x)=>n+x.bytes,0),'Request SHA-256':rev.requestSha256,'Installed source SHA-256':rev.sourceSha256});
 const box=$('review-inputs');box.replaceChildren();for(const p of r.inputs)box.append(node('p',p.key+' · '+p.name+' · '+p.bytes.toLocaleString()+' bytes · '+p.sha256,{class:'file-pin'}));$('reviewed').checked=false;control();
}
async function checkWorkspace(){const current=await client.status();if(current.workspaceId!==S.workspaceId)throw new Error('The installed accounting workspace changed. Reopen its own desk.');return current;}
async function retainRequest(){
 return transaction(async()=>{
  if(S.pending||!$('reviewed').checked)throw new Error('Resolve the current original action and review this exact request first.');
  const r=clone(verifyShape(request())),hash=await requestSha256(r);if(S.draft.rawDirty||S.draft.mappingDraft||S.draft.review?.requestSha256!==hash)throw new Error('The request changed after review.');
  const current=await checkWorkspace();if(current.sourceSha256!==S.draft.review.sourceSha256)throw new Error('The installed parser/source edition changed. Refresh and review this complete request again.');
  const pending={action:'prepare',request:r,requestSha256:hash,sourceSha256:current.sourceSha256,createdAt:new Date().toISOString()};S=retainOperation(S,pending);await persist();renderPending();await dispatchPending();
 });
}
async function reconcilePending(){
 const pending=clone(S.pending);if(!pending)return;const observed=await client.lookup(pending.request.requestId);S=observeOperation(S,pending,observed);await persist();renderPending();renderResult();renderLocalHistory();return observed;
}
async function dispatchPending(){
 const p=clone(S.pending);if(!p)throw new Error('No original pending action is retained.');
 const observed=await reconcilePending();if(!S.pending)return;
 if(p.action==='execute'&&observed.state==='NOT_FOUND')throw new Error('The retained execution input is missing. Preserve its original request and investigate the selected installation.');
 const current=await checkWorkspace();if(current.sourceSha256!==p.sourceSha256)throw new Error('This unfinished request needs its original installed source edition.');
 const active=clone(S.pending);let result;
 try{result=active.action==='prepare'?await client.prepare({request:active.request}):await client.execute({preparationId:active.request.requestId,expectedRequestSha256:active.requestSha256});}
 catch(e){S.pending={...S.pending,lastError:{at:new Date().toISOString(),code:e.code??'ERROR',message:String(e.message)}};await persist();renderPending();try{const recovered=await reconcilePending();if(!S.pending){message('The original saved result was recovered after the interrupted response.');return recovered;}}catch(recovery){message(errorText(e)+'; original-result check: '+errorText(recovery),'error');}throw e;}
 S=observeOperation(S,active,result);await persist();renderPending();renderResult();renderLocalHistory();await refreshList();message(result.state==='COMPLETE'?'The exact original preparation is complete.':'Complete inputs are retained. Inspect the request before explicit execution.');return result;
}
async function executeSelected(){
 if(!$('execute-reviewed').checked||S.selected?.state!=='PREPARED')throw new Error('Review the exact retained execution first.');
 await transaction(async()=>{if(S.pending||S.selected?.state!=='PREPARED'||!$('execute-reviewed').checked)throw new Error('Resolve the current original action and select its exact prepared receipt.');const receipt=clone(S.selected),file=await client.file(receipt,'request.json'),r=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(file.bytes));verifyShape(r);const hash=await requestSha256(r);if(hash!==receipt.requestSha256)throw new Error('The original retained request digest differs.');const pending={action:'execute',request:r,requestSha256:hash,sourceSha256:receipt.sourceSha256,createdAt:new Date().toISOString()};S=retainOperation(S,pending);await persist();renderPending();await dispatchPending();});
}
function renderPending(){const p=S?.pending;$('pending').hidden=!p;if(p){$('pending-description').textContent=(p.action==='prepare'?'Retain inputs':'Execute original transform')+' · '+p.request.kind+' · '+p.request.requestId;$('pending-json').textContent=json(p);}control();}
async function refreshList(){
 if(!client)return;let offset=0,total,inventory,all=[];
 for(;;){const r=await client.list({offset,limit:100}),p=r.page;if(total===undefined){total=p.total;inventory=r.inventorySha256;}if(r.workspaceId!==S.workspaceId||total!==p.total||inventory!==r.inventorySha256||p.offset!==offset||!p.items.length&&offset<total)throw new Error('The retained preparation inventory changed. Refresh it again.');all.push(...p.items);offset+=p.items.length;if(offset===total)break;}
 receipts=all;renderList();renderInputPreparations();
}
function renderList(){
 const term=$('search').value.toLowerCase(),rows=receipts.filter(x=>[x.preparationId,x.kind,x.actor,x.state,JSON.stringify(x.summary)].join(' ').toLowerCase().includes(term)).reverse();listPage=Math.min(listPage,Math.max(0,Math.ceil(rows.length/12)-1));$('preparation-list').replaceChildren();for(const r of rows.slice(listPage*12,listPage*12+12)){const a=node('article');a.append(button(r.kind.replaceAll('_',' ')+' · '+r.state,()=>openPreparation(r.preparationId)),node('p',r.actor+' · '+r.createdAt),node('p',r.preparationId));$('preparation-list').append(a);}if(!rows.length)$('preparation-list').append(node('p','No retained preparations match this view.'));$('list-position').textContent=rows.length?(listPage*12+1)+'–'+Math.min(rows.length,(listPage+1)*12)+' of '+rows.length:'0 preparations';$('list-before').disabled=!listPage;$('list-after').disabled=(listPage+1)*12>=rows.length;
}
function renderInputPreparations(){const s=$('input-preparation'),value=s.value;s.replaceChildren(node('option','Choose a completed preparation',{value:''}));for(const r of receipts.filter(x=>x.state==='COMPLETE'))s.append(node('option',r.kind+' · '+r.preparationId,{value:r.preparationId}));s.value=value;}
async function openPreparation(id){await transaction(async()=>{const r=await client.lookup(id);if(r.state==='NOT_FOUND')throw new Error('The original preparation was not found in this workspace.');S.selected=r;await persist();renderResult();$('result').scrollIntoView({block:'start'});});}
function renderResult(){
 const r=S?.selected;$('result').hidden=!r||r.state==='NOT_FOUND';if(!r||r.state==='NOT_FOUND')return;
 $('result-state').textContent=r.state;$('result-summary').textContent=r.kind.replaceAll('_',' ')+' · '+r.actor+' · '+r.createdAt;
 $('execution-review').hidden=r.state!=='PREPARED';$('execute-reviewed').checked=false;$('result-failure').hidden=!r.lastFailure;$('result-failure').textContent=r.lastFailure?'Last retained attempt: '+r.lastFailure.code+' · '+r.lastFailure.message:'';
 facts($('result-facts'),{'Original preparation':r.preparationId,'Request SHA-256':r.requestSha256,'Parser source SHA-256':r.sourceSha256,...(r.summary??{})});$('receipt-json').textContent=json(r);
 const body=$('result-files');body.replaceChildren();for(const f of r.files){const tr=node('tr'),name=node('td');name.append(node('strong',f.name),node('code',f.sha256));const acts=node('td');acts.append(button('Download',()=>downloadFile(r,f.name)));tr.append(name,node('td',f.bytes.toLocaleString()),node('td',f.role),acts);body.append(tr);}
 $('view-rows').replaceChildren();$('view-summary').textContent=r.state==='COMPLETE'?'Select the complete output section to inspect.':'Complete output views appear after execution.';$('view-position').textContent='';viewPage=null;viewArgs=null;control();
}
async function downloadFile(receipt,name){const f=await client.file(receipt,name);download(f.name,f.bytes,f.type);message('Downloaded '+f.name+' · '+f.bytes.length.toLocaleString()+' bytes · SHA-256 '+f.sha256);}
async function readView(offset=0,args){
 const receipt=S.selected;if(!receipt||receipt.state!=='COMPLETE')throw new Error('Select a complete original result.');
 const selected=args??{preparationId:receipt.preparationId,section:$('view-section').value,...($('view-item').value?{itemId:$('view-item').value.trim()}:{}),...($('view-profile').value?{profileId:$('view-profile').value.trim()}:{}),...($('view-statement').value?{statementId:$('view-statement').value.trim()}:{})};
 const r=await client.view({...selected,offset,limit:25});if(S.selected?.preparationId!==receipt.preparationId)return;
 if(r.workspaceId!==S.workspaceId||r.requestSha256!==receipt.requestSha256||r.preparationId!==receipt.preparationId)throw new Error('The selected output belongs to a different original request.');
 if(args&&viewPage&&(viewPage.outputSha256!==r.outputSha256||viewPage.view.page.total!==r.view.page.total))throw new Error('The full output changed between pages. Reopen its original result.');
 viewArgs=selected;viewPage=r;const pg=r.view.page;$('view-summary').textContent=(r.view.view??receipt.viewType)+' · complete output SHA-256 '+r.outputSha256;
 $('view-position').textContent=(pg.total?pg.offset+1:0)+'–'+(pg.offset+pg.items.length)+' of '+pg.total;$('view-before').disabled=pg.offset===0;$('view-after').disabled=pg.offset+pg.items.length>=pg.total;
 const box=$('view-rows');box.replaceChildren();if(!pg.items.length)box.append(node('p','This complete output section is empty.'));
 for(const row of pg.items){const a=node('article');a.append(node('h4',row.file?.name??row.head?.name??row.name??row.id??row.itemId??'Original row'));if(row.status)a.append(node('p',row.status));const dl=node('dl');const brief={};for(const k of ['id','itemId','included','note','kind','postedDate','amount','currency','payee','memo','rows','pendingRows','excludedRows','statementCount','version','reason','problem'])if(row[k]!==undefined)brief[k]=row[k];facts(dl,brief);a.append(dl);const detail=node('details'),sum=node('summary','Complete original row'),pre=node('pre',json(row));detail.append(sum,pre);a.append(detail);if(row.reportFile)a.append(button('Read statement sections',()=>{$('view-item').value=row.id;$('view-section').value='statements';return readView();}));if(r.view.view==='statements')a.append(button('Read original rows',()=>{$('view-statement').value=row.id;$('view-section').value='rows';return readView();}));if(row.versions&&row.id)a.append(button('Read every profile version',()=>{$('view-profile').value=row.id;$('view-section').value='items';return readView();}));box.append(a);}
}
function renderLocalHistory(){const box=$('local-history');box.replaceChildren();for(const row of [...S.operations].reverse()){const a=node('article');a.append(button(row.request.kind+' · '+row.request.requestId,()=>openPreparation(row.request.requestId)),node('p',row.observations.at(-1)?.result?.state??'Retained before dispatch'),button('Download original request',()=>download('bank-source-request-'+row.request.requestId+'.json',row.request)));if(row.deferredAction){a.append(button('Resume original saved action',()=>transaction(async()=>{if(S.pending)throw new Error('Resolve the current pending action first.');S.pending=clone(row.deferredAction);await persist();renderPending();message('Original action reopened. Check or explicitly retry it; nothing was sent.');})));}box.append(a);}}
async function loadInputReceipt(){inputReceipt=await client.lookup($('input-preparation').value);if(inputReceipt.state!=='COMPLETE')throw new Error('Select a completed preparation.');const s=$('input-file');s.replaceChildren();for(const f of inputReceipt.files)s.append(node('option',f.name+' · '+f.bytes+' bytes',{value:f.name}));}
async function addInput(){
 const edit=editorPin(),r=request(),key=$('input-key').value.trim();if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key)||r.inputs.some(x=>x.key===key))throw new Error('Choose a distinct input role/key.');
 let pin;if($('input-mode').value==='alias'){const p=await client.source({sourceAlias:$('source-alias').value,name:$('source-name').value.trim()});if(p.workspaceId!==S.workspaceId)throw new Error('The source belongs to another workspace.');pin={key,sourceAlias:p.sourceAlias,name:p.name,bytes:p.bytes,sha256:p.sha256};}
 else{if(!inputReceipt||inputReceipt.preparationId!==$('input-preparation').value)await loadInputReceipt();const f=inputReceipt.files.find(x=>x.name===$('input-file').value);if(!f)throw new Error('Choose the complete retained file.');pin={key,preparationId:inputReceipt.preparationId,file:f.name,name:f.name,bytes:f.bytes,sha256:f.sha256};}
 sameEditor(edit);r.inputs.push(pin);if(r.kind==='collection_prepare')r.parameters.files.push({id:crypto.randomUUID(),sourceKey:key,mapping:newMapping(),included:true,note:''});changed();renderInputs();renderParameters();message('Exact original input retained in this draft.');
}
function sameOriginBase(value){const u=new URL(value,location.href);if(u.origin!==location.origin||u.username||u.password||u.search||u.hash)throw new Error('Use the installed same-origin accounting API.');return u.pathname.replace(/\/$/,'');}
async function boot(){
 try{
  const response=await fetch('./config.json',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error('The installed Bank configuration could not be read.');const config=await response.json();
  if(!config.sourcePreparationsApiBase)throw new Error('Configured source preparation is not enabled for this installed Bank workspace. Select an existing configured accounting alias in its normal installation settings.');
  const bank=new BankStatementsClient({baseUrl:sameOriginBase(config.apiBase||'/api/receivables/bank-statements')}),bankState=await bank.state();
  client=new BankSourcePreparationsClient({baseUrl:sameOriginBase(config.sourcePreparationsApiBase),expectedWorkspaceId:config.sourcePreparationsWorkspaceId,expectedSourcesSha256:config.sourcePreparationsSourcesSha256});if(bankState.workspaceId!==config.sourcePreparationsWorkspaceId)throw new Error('The Bank and configured source workspace identities differ.');status=await client.status();if(status.workspaceId!==bankState.workspaceId)throw new Error('The Bank and source preparation workspace identities differ.');
  storage=openSourceDeskState({workspaceId:status.workspaceId});S=await storage.read();savedRevision=S.revision;
  $('connection').textContent='Connected · '+(config.sourcePreparationsWorkspace??status.workspace??'original accounting')+' · '+status.configuredSources.length+' configured sources';$('binding').textContent=json(status);
  const aliases=$('source-alias');aliases.replaceChildren(node('option','Choose an original configured source',{value:''}));for(const a of status.configuredSources)aliases.append(node('option',a,{value:a}));
  renderDraft();renderPending();renderResult();renderLocalHistory();await refreshList();await refreshConflicts();if(S.pending)message('An original action is retained. Check its saved result or explicitly retry the same action; reopening does not send it.');
 }catch(e){$('connection').textContent='Connection needs attention';message(errorText(e),'error');}finally{control();}
}
$('actor').addEventListener('input',()=>{try{editable();request().actor=$('actor').value;changed();}catch(e){message(errorText(e),'error');}});
$('new-request').addEventListener('click',()=>run(()=>setDraft(newRequest($('new-kind').value,S.draft?.request.actor??''))));
$('request-form').addEventListener('submit',e=>e.preventDefault());
$('request-json').addEventListener('input',()=>{try{editable({raw:true});S.draft.raw=$('request-json').value;S.draft.rawDirty=true;S.draft.review=null;$('review').hidden=true;void persist();control();}catch(e){message(errorText(e),'error');}});
$('apply-json').addEventListener('click',()=>run(async()=>{editable({raw:true});const next=JSON.parse(S.draft.raw);verifyShape(next);if(next.requestId!==request().requestId)throw new Error('Use New request or Open request JSON to select a different original request identity.');S.draft.request=next;S.draft.rawDirty=false;changed();await flush();renderDraft();}));
$('import-request').addEventListener('change',()=>run(()=>transaction(async()=>{if(S.pending)throw new Error('Resolve the current original action first.');const original=json(S),f=$('import-request').files?.[0];if(!f)return;if(f.size>8000000)throw new Error('The complete request exceeds 8 MB.');const r=JSON.parse(await f.text());verifyShape(r);const existing=await client.lookup(r.requestId);if(existing.state!=='NOT_FOUND'&&(existing.requestSha256!==await requestSha256(r)||existing.workspaceId!==S.workspaceId))throw new Error('That original request ID is already bound to different content.');if(json(S)!==original)throw new Error('The desk changed while opening the original request.');await applyDraft(r,{frozen:existing.state!=='NOT_FOUND'});$('import-request').value='';})));
$('input-mode').addEventListener('change',()=>{$('alias-input').hidden=$('input-mode').value!=='alias';$('retained-input').hidden=$('input-mode').value!=='retained';});
$('reload-input-files').addEventListener('click',()=>run(loadInputReceipt));$('input-preparation').addEventListener('change',()=>run(loadInputReceipt));$('add-input').addEventListener('click',()=>run(addInput));
$('review-request').addEventListener('click',()=>run(reviewRequest));$('reviewed').addEventListener('change',control);$('retain-request').addEventListener('click',()=>run(retainRequest));
$('reconcile').addEventListener('click',()=>run(()=>transaction(reconcilePending)));$('retry').addEventListener('click',()=>run(()=>transaction(dispatchPending)));
$('defer-pending').addEventListener('click',()=>run(()=>transaction(async()=>{const observed=await reconcilePending();if(!S.pending)return;const pending=clone(S.pending),row=S.operations.find(x=>x.request.requestId===pending.request.requestId);row.deferredAction=pending;S.pending=null;if(S.draft?.request.requestId===pending.request.requestId)S.draft.frozen=true;await persist();renderPending();renderDraft();renderLocalHistory();message('The original action remains in request history with its exact observed state. You can resume it explicitly; no remote request was deleted or replaced.');})));
$('download-pending').addEventListener('click',()=>download('bank-source-original-pending.json',S.pending));
$('execute-reviewed').addEventListener('change',control);$('execute').addEventListener('click',()=>run(executeSelected));
$('refresh-list').addEventListener('click',()=>run(refreshList));$('refresh').addEventListener('click',()=>run(async()=>{status=await checkWorkspace();$('binding').textContent=json(status);$('source-alias').replaceChildren(node('option','Choose an original configured source',{value:''}),...status.configuredSources.map(a=>node('option',a,{value:a})));await refreshList();message('Current source status and retained preparations refreshed.');}));
$('search').addEventListener('input',()=>{listPage=0;renderList();});$('list-before').addEventListener('click',()=>{listPage--;renderList();});$('list-after').addEventListener('click',()=>{listPage++;renderList();});
$('open-preparation').addEventListener('click',()=>run(()=>openPreparation($('open-id').value.trim())));
$('download-request').addEventListener('click',()=>download('bank-source-request-'+request().requestId+'.json',S.draft.rawDirty?S.draft.raw:request()));
$('download-desk').addEventListener('click',()=>run(()=>transaction(async()=>{downloadWorkingRecord('bank-source-browser-working-record.json',S);},{recover:true})));
$('download-conflict').addEventListener('click',()=>run(()=>transaction(async()=>{downloadWorkingRecord('bank-source-local-draft-conflict.json',conflictSnapshot??S);},{recover:true})));
$('reopen').addEventListener('click',()=>run(()=>transaction(async()=>{S=await storage.read();savedRevision=S.revision;conflicted=false;persistError=null;conflictSnapshot=null;tail=Promise.resolve();$('conflict').hidden=true;renderDraft();renderPending();renderResult();renderLocalHistory();await refreshConflicts();message('Opened the current saved desk. Retained conflicts below can be downloaded or explicitly restored as drafts and history.');},{recover:true})));
$('download-receipt').addEventListener('click',()=>download('bank-source-preparation-receipt.json',S.selected));
$('download-all').addEventListener('click',()=>run(()=>transaction(async()=>{const f=await client.bundle(S.selected);download(f.name,f.bytes,f.type);message('Downloaded complete preparation · '+f.bytes.length.toLocaleString()+' bytes · SHA-256 '+f.sha256);})));
$('request-from-receipt').addEventListener('click',()=>run(()=>transaction(async()=>{if(S.pending)throw new Error('Resolve the current original action first.');const r=clone(S.selected),f=await client.file(r,'request.json'),value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(f.bytes));if(await requestSha256(value)!==r.requestSha256)throw new Error('The retained request hash differs.');await applyDraft(value,{frozen:true});})));
$('copy-request').addEventListener('click',()=>run(()=>transaction(async()=>{if(S.pending)throw new Error('Resolve the current original action first.');const r=clone(S.selected),f=await client.file(r,'request.json'),value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(f.bytes));if(await requestSha256(value)!==r.requestSha256)throw new Error('The retained request hash differs.');value.requestId=crypto.randomUUID();if(value.kind==='collection_prepare'||value.kind==='collection_receive')value.parameters.collectionId=crypto.randomUUID();if(value.kind==='collection_prepare')for(const item of value.parameters.files)item.id=crypto.randomUUID();await applyDraft(value);message('Created an explicit new request from the retained choices. Review its current expected revisions before retaining.');})));
$('read-view').addEventListener('click',()=>run(()=>readView()));$('view-before').addEventListener('click',()=>run(()=>readView(Math.max(0,viewPage.view.page.offset-25),viewArgs)));$('view-after').addEventListener('click',()=>run(()=>readView(viewPage.view.page.offset+viewPage.view.page.items.length,viewArgs)));
$('mapping-use-json').addEventListener('click',()=>run(()=>{editable();const next=JSON.parse($('mapping-json').value);if(!next||typeof next!=='object'||!next.columns||!['OFX','QFX','CAMT053','CSV'].includes(next.format))throw new Error('Use the complete original format and columns mapping.');mappingValue=next;renderMapping();saveMappingDraft();}));
$('mapping-save').addEventListener('click',()=>run(()=>{editable();if(!mappingEdit)throw new Error('Reopen the original mapping selection.');const raw=JSON.parse($('mapping-json').value);if(!raw||typeof raw!=='object'||!raw.columns||!['OFX','QFX','CAMT053','CSV'].includes(raw.format)||new TextEncoder().encode(JSON.stringify(raw)).length>131072)throw new Error('Use a complete original format and columns mapping within 128 KB.');mappingEdit(raw);mappingEdit=null;delete S.draft.mappingDraft;$('mapping-dialog').close();changed();renderParameters();}));
$('mapping-cancel').addEventListener('click',()=>run(()=>{editable();mappingEdit=null;delete S.draft.mappingDraft;void persist();$('mapping-dialog').close();renderParameters();control();}));
$('mapping-json').addEventListener('input',()=>run(()=>saveMappingDraft(true)));

async function bytesSha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}
function decodeWholeBase64(text){
 if(typeof text!=='string'||text.length%4!==0)throw new Error('A complete capsule member has invalid base64.');
 const padding=text.endsWith('==')?2:text.endsWith('=')?1:0,end=text.length-padding;
 for(let offset=0;offset<end;offset+=65536)if(/[^A-Za-z0-9+/]/.test(text.slice(offset,Math.min(end,offset+65536))))throw new Error('A complete capsule member has invalid base64.');
 if(padding&&end<2)throw new Error('A complete capsule member has invalid base64.');
 const out=new Uint8Array(text.length/4*3-padding);let position=0;
 for(let offset=0;offset<text.length;offset+=65536){const binary=atob(text.slice(offset,offset+65536));for(let i=0;i<binary.length;i++)out[position++]=binary.charCodeAt(i);}
 if(position!==out.length)throw new Error('A complete capsule member has invalid base64.');return out;
}
function renderReceivedJson(root,value){
 root.replaceChildren();const title=node('h3','Complete retained JSON');root.append(title);
 const meta=node('dl'),brief={};if(value&&typeof value==='object'&&!Array.isArray(value))for(const [k,v]of Object.entries(value))if(v===null||typeof v!=='object')brief[k]=v;facts(meta,brief);root.append(meta);
 const collections=Array.isArray(value)?[['Original rows',value]]:Object.entries(value??{}).filter(([,v])=>Array.isArray(v));
 for(const [name,rows]of collections){const box=node('section');let page=0;const body=node('div'),position=node('span'),controls=node('div',undefined,{class:'actions'}),previous=button('Previous',()=>{page--;draw();}),next=button('Next',()=>{page++;draw();});controls.append(previous,position,next);box.append(node('h3',name),body,controls);
  function draw(){body.replaceChildren();for(const row of rows.slice(page*25,page*25+25)){const d=node('details'),label=typeof row==='object'&&row?(row.name??row.id??row.itemId??row.file?.name??'Original record'):String(row);d.append(node('summary',label),node('pre',json(row)));body.append(d);}position.textContent=(rows.length?page*25+1:0)+'–'+Math.min(rows.length,(page+1)*25)+' of '+rows.length;previous.disabled=page===0;next.disabled=(page+1)*25>=rows.length;}draw();root.append(box);
 }
 const full=node('details');full.append(node('summary','Complete original document'),node('pre',json(value)));root.append(full);
}
async function openCapsule(file){
 const generation=++capsuleGeneration,limit=268435456;
 if(file.size>limit)throw new Error('This complete capsule exceeds the browser receiving limit of 256 MiB. Use the installed source-preparation-capsule.py receiver to verify and extract every member without truncation.');
 $('capsule-status').textContent='Reading and verifying every complete original file…';const raw=new Uint8Array(await file.arrayBuffer()),wholeSha=await bytesSha256(raw),value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),r=value?.receipt;
 if(value?.schema!=='stellar-forge.bank-source-capsule.v1'||!r||r.state!=='COMPLETE'||r.schema!=='stellar-forge.accounting-bank-source-preparation.v1'||!/^[a-f0-9]{64}$/.test(r.workspaceId)||!Array.isArray(r.files)||r.files.length>4101||!Array.isArray(value.files)||value.files.length!==r.files.length)throw new Error('Open the complete original preparation capsule and its exact COMPLETE receipt.');
 const files=new Map(),names=new Set();
 for(let i=0;i<r.files.length;i++){
  const p=r.files[i],f=value.files[i];
  if(typeof p.name!=='string'||!p.name||p.name==='.'||p.name==='..'||/[\\/\u0000-\u001f]/.test(p.name)||names.has(p.name)||!Number.isSafeInteger(p.bytes)||p.bytes<0||p.bytes>192000000||!(/^[a-f0-9]{64}$/).test(p.sha256)||!['request','input','output','result'].includes(p.role)||f?.encoding!=='base64'||f.name!==p.name||f.bytes!==p.bytes||f.sha256!==p.sha256||f.role!==p.role)throw new Error('The capsule inventory differs from its original receipt.');
  names.add(p.name);const bytes=decodeWholeBase64(f.contentBase64);if(bytes.length!==p.bytes||await bytesSha256(bytes)!==p.sha256)throw new Error('The complete original member differs: '+p.name);files.set(p.name,{...p,bytesValue:bytes});
 }
 const read=name=>{const f=files.get(name);if(!f)throw new Error('The original capsule omits '+name);return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(f.bytesValue));};
 const request=read('request.json'),intent=read('intent.json'),result=read('result.json');
 if(request.workspaceId!==r.workspaceId||request.requestId!==r.preparationId||request.actor!==r.actor||request.kind!==r.kind||await requestSha256(request)!==r.requestSha256||intent.workspaceId!==r.workspaceId||intent.preparationId!==r.preparationId||intent.sourceSha256!==r.sourceSha256||!same(intent.request,request)||intent.requestSha256!==r.requestSha256)throw new Error('The original request, intent and receipt are not one preparation.');
 const resultPin=r.files.find(x=>x.name==='result.json'),baseReceipt={...r};delete baseReceipt.workspace;baseReceipt.files=r.files.filter(x=>x.name!=='result.json');
 if(await requestSha256(baseReceipt)!==await requestSha256(result)||!resultPin)throw new Error('The frozen result differs from the complete delivered receipt.');
 if(!Array.isArray(intent.sourceFiles)||await requestSha256(intent.sourceFiles)!==intent.sourceSha256)throw new Error('The original operating-source inventory changed.');
 if(!Array.isArray(r.inputs)||r.inputs.length!==request.inputs.length||!same(r.inputs,intent.inputs))throw new Error('The complete original input inventory differs.');
 for(let i=0;i<request.inputs.length;i++){const pin=request.inputs[i],input=r.inputs[i],member=files.get('input-'+pin.key+'.bin');if(!member||input.key!==pin.key||input.name!==pin.name||input.bytes!==pin.bytes||input.sha256!==pin.sha256||input.file!==member.name||member.bytes!==pin.bytes||member.sha256!==pin.sha256)throw new Error('The capsule is missing an exact original input.');}
 if(generation!==capsuleGeneration)return;
 openedCapsule={name:file.name,bytes:file.size,sha256:wholeSha,receipt:r,files};const box=$('capsule-content');box.replaceChildren();
 $('capsule-status').textContent='Verified '+r.files.length+' complete files · '+file.size.toLocaleString()+' bytes · SHA-256 '+wholeSha;
 const dl=node('dl');facts(dl,{'Original workspace':r.workspaceId,'Original preparation':r.preparationId,'Operator':r.actor,'Operation':r.kind,'State':r.state,'Original parser source':r.sourceSha256});box.append(dl);
 const select=node('select',undefined,{'aria-label':'Complete delivered file'});for(const pin of r.files)select.append(node('option',pin.name+' · '+pin.bytes.toLocaleString()+' bytes',{value:pin.name}));
 const details=node('div'),actions=node('div',undefined,{class:'actions'});
 actions.append(select,button('Open original file',()=>{const f=files.get(select.value);if(f.name.endsWith('.json'))renderReceivedJson(details,JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(f.bytesValue)));else{details.replaceChildren(node('h3',f.name));if(f.bytes<=2000000){try{details.append(node('pre',new TextDecoder('utf-8',{fatal:true}).decode(f.bytesValue)));}catch{details.append(node('p','This original binary file is available in full through Download selected original.'));}}else details.append(node('p','Download the full original and open it in its intended application. This view does not truncate it.'));}}),button('Download selected original',()=>{const f=files.get(select.value);download(f.name,f.bytesValue,f.name.endsWith('.json')?'application/json':'application/octet-stream');}));
 box.append(actions,details);select.value='request.json';renderReceivedJson(details,request);
}
$('open-capsule').addEventListener('change',()=>run(async()=>{const file=$('open-capsule').files?.[0];if(file)await openCapsule(file);}));
function workingRecordBytes(value){
 const bytes=new TextEncoder().encode(json(value));
 if(bytes.length>WORKING_RECORD_MAX_BYTES)throw new Error('This complete working record exceeds the shared 256 MiB export/reopen limit. All browser history remains retained; no partial export was created.');
 return bytes;
}
function downloadWorkingRecord(name,value){download(name,workingRecordBytes(value));}
async function validateWorkingRecord(value,current){
 const incoming=clone(value?.schema==='stellar-forge.bank-source-desk.v1.conflict'?value.snapshot:value);
 if(value?.schema==='stellar-forge.bank-source-desk.v1.conflict'&&(value.workspaceId!==current.workspaceId||value.origin!==location.origin))throw new Error('This retained conflict belongs to another original workspace.');
 if(incoming?.schema!=='stellar-forge.bank-source-desk.v1'||incoming.workspaceId!==current.workspaceId||incoming.origin!==location.origin||!Array.isArray(incoming.operations)||!Number.isSafeInteger(incoming.revision))throw new Error('This original browser record belongs to a different workspace/origin. Preserve it with that original installation.');
 const ids=new Set();
 for(const row of incoming.operations){verifyShape(row.request);if(ids.has(row.request.requestId)||await requestSha256(row.request)!==row.requestSha256||!Array.isArray(row.observations))throw new Error('An original retained request changed or is duplicated in the working record.');ids.add(row.request.requestId);const prior=current.operations.find(x=>x.request.requestId===row.request.requestId);if(prior&&(!same(prior.request,row.request)||prior.requestSha256!==row.requestSha256))throw new Error('The current desk retains another body for that original request ID.');if(row.deferredAction&&(!['prepare','execute'].includes(row.deferredAction.action)||!same(row.deferredAction.request,row.request)||row.deferredAction.requestSha256!==row.requestSha256))throw new Error('The deferred action no longer matches its original retained request.');}
 if(incoming.pending){verifyShape(incoming.pending.request);if(!['prepare','execute'].includes(incoming.pending.action)||await requestSha256(incoming.pending.request)!==incoming.pending.requestSha256||!incoming.operations.some(x=>same(x.request,incoming.pending.request)&&x.requestSha256===incoming.pending.requestSha256))throw new Error('Keep the complete original pending request and history.');}
 if(incoming.draft){if(!incoming.draft.request||incoming.draft.request.workspaceId!==current.workspaceId||typeof incoming.draft.raw!=='string')throw new Error('The complete working draft is missing.');incoming.draft.review=null;}
 return incoming;
}
function mergeWorkingRecord(incoming,original,source){
 return {...incoming,revision:savedRevision,operations:[...original.operations.filter(x=>!incoming.operations.some(y=>y.request.requestId===x.request.requestId)),...incoming.operations],restoredFrom:{...source,at:new Date().toISOString()},priorDesk:original};
}
function renderDesk(){renderDraft();renderPending();renderResult();renderLocalHistory();}
async function refreshConflicts(){
 if(!storage)return;const generation=++conflictListGeneration,page=await storage.listConflicts({after:conflictAfter,limit:20});if(generation!==conflictListGeneration)return;conflictPage=page;
 const box=$('retained-conflicts');box.replaceChildren();
 for(const row of page.items){const item=node('article');item.append(node('strong',row.at??'Retained draft'),node('p',(row.pendingRequestId?'Original pending '+row.pendingRequestId:row.requestId?'Draft '+row.requestId:'No selected request')+' · '+row.operations+' retained requests'));
  const actions=node('div',undefined,{class:'actions'});actions.append(button('Download exact retained record',async()=>{const value=await storage.readConflict(row.id);downloadWorkingRecord('bank-source-conflict-'+row.id+'.json',value);}));
  const restore=button('Restore as draft and history',()=>restoreConflict(row.id));restore.dataset.conflictRestore=row.id;actions.append(restore);item.append(actions);box.append(item);
 }
 if(!page.items.length)box.append(node('p','No retained conflicts on this page.'));
 $('conflicts-position').textContent='Page '+(conflictPrevious.length+1)+' · '+page.items.length+' retained snapshots';control();
}
async function restoreConflict(id){
 return transaction(async()=>{
  if(S.pending)throw new Error('Resolve or explicitly retain the current pending action in history before restoring another draft.');
  const fence=json(S),record=await storage.readConflict(id),incoming=await validateWorkingRecord(record,S);if(json(S)!==fence)throw new Error('The current desk changed while reading the retained conflict.');
  if(incoming.pending){const pending=clone(incoming.pending),row=incoming.operations.find(x=>x.request.requestId===pending.request.requestId);row.deferredAction=pending;incoming.pending=null;if(incoming.draft?.request.requestId===pending.request.requestId)incoming.draft.frozen=true;}
  const original=clone(S);S=mergeWorkingRecord(incoming,original,{conflictId:id,mode:'draft-and-history'});await persist();renderDesk();message('Restored the selected complete draft and request history. Any original unfinished action is retained in history for explicit reconciliation; nothing was sent.');
 });
}
$('refresh-conflicts').addEventListener('click',()=>run(()=>{conflictAfter=null;conflictPrevious=[];return refreshConflicts();}));
$('conflicts-before').addEventListener('click',()=>run(()=>{if(!conflictPrevious.length)return;conflictAfter=conflictPrevious.pop();return refreshConflicts();}));
$('conflicts-after').addEventListener('click',()=>run(()=>{if(!conflictPage?.nextCursor)return;conflictPrevious.push(conflictAfter);conflictAfter=conflictPage.nextCursor;return refreshConflicts();}));
$('import-desk').addEventListener('change',()=>run(()=>transaction(async()=>{
 if(!S||S.pending||conflicted)throw new Error('Resolve the current original request before explicitly receiving a working record.');
 const file=$('import-desk').files?.[0];if(!file)return;const fence=json(S);
 if(file.size>WORKING_RECORD_MAX_BYTES)throw new Error('This complete working record exceeds the shared 256 MiB export/reopen limit. Keep the original file.');
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer())),incoming=await validateWorkingRecord(value,S);
 if(json(S)!==fence||S.pending)throw new Error('The desk changed while receiving the working record. Your newer draft and original action remain intact.');
 const original=clone(S);S=mergeWorkingRecord(incoming,original,{name:file.name});await persist();renderDesk();$('import-desk').value='';message('The complete original working record is reopened. No retained action was sent.');
})));

void boot();
