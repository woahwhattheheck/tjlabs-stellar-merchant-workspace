// MIT. Complete Research return form editions and original native request custody.
export const RETURN_WORK_SCHEMA='stellar-forge.research-return-browser-work.v1';
const DRAFT='stellar-forge.research-return-browser-draft.v1',OP='stellar-forge.research-return-browser-operation.v1';
const ACTIONS=new Set(['research-return-create','research-return-import','research-return-draft-save','research-return-apply']);
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/,HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9-]{36}$/;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x),clone=x=>structuredClone(x);
const stable=x=>Array.isArray(x)?'['+x.map(stable).join(',')+']':plain(x)?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}':JSON.stringify(x);
const need=(ok,message)=>{if(!ok)throw new Error(message);},stamp=()=>new Date().toISOString(),uid=()=>crypto.randomUUID().replaceAll('-','');
export const researchReturnHash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');

// Serialized companion capacity is checked before building its full canonical/hash string.
export const MAX_RETURN_WORK_BYTES=512*1024*1024;
function utf8Size(text){let size=0;for(let i=0;i<text.length;i++){const n=text.charCodeAt(i);if(n<128)size++;else if(n<2048)size+=2;else if(n>=0xd800&&n<=0xdbff&&i+1<text.length&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){size+=4;i++;}else size+=3;}return size;}
function boundedCompanion(body){
 const head={...body,drafts:[],operations:[]};let bytes=utf8Size(JSON.stringify(head))+80;
 for(const name of ['drafts','operations'])for(const item of body[name]){bytes+=utf8Size(JSON.stringify(item))+1;need(bytes<=MAX_RETURN_WORK_BYTES,'Complete browser work exceeds 512 MiB. Export individual saved forms or original requests as reopenable companions; all stored originals remain intact.');}
 return body;
}
async function companion(body){boundedCompanion(body);return {...body,sha256:await researchReturnHash(stable(body))};}

let opening;
function database(){
 if(!opening)opening=new Promise((resolve,reject)=>{const req=indexedDB.open('fred-research-return-work',1);
 req.onupgradeneeded=()=>{for(const name of ['drafts','operations']){const s=req.result.createObjectStore(name,{keyPath:'id'});s.createIndex('projectId','projectId');}req.result.createObjectStore('heads',{keyPath:'id'});};
 req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Close the older return-work tab before opening the retained browser store.'));
 req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
 }).catch(error=>{opening=null;throw error;});return opening;
}
async function transaction(names,mode,fn){
 const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(names,mode);let result,failure;
 tx.oncomplete=()=>resolve(typeof result==='function'?result():result);tx.onerror=tx.onabort=()=>reject(failure||tx.error||new Error('Complete return work could not be retained.'));
 const fail=e=>{failure=e;tx.abort();};try{result=fn(tx,fail);}catch(e){fail(e);}
 });
}
function draft(value,projectId){need(plain(value)&&value.schema===DRAFT&&value.projectId===projectId&&ID.test(value.id)&&typeof value.at==='string'&&plain(value.value),'Open a complete return draft for this economic project.');return value;}
async function operation(value,projectId){
 need(plain(value)&&value.schema===OP&&value.projectId===projectId&&ID.test(value.id)&&ACTIONS.has(value.action)&&typeof value.bodyText==='string'&&HASH.test(value.bodySha256)&&Array.isArray(value.observations)&&typeof value.createdAt==='string','Retain the full original return request.');
 const body=JSON.parse(value.bodyText);need(plain(body)&&body.projectId===projectId&&body.id===value.id&&body.action===value.action&&Number.isSafeInteger(body.expectedRevision)&&body.expectedRevision>=1&&await researchReturnHash(value.bodyText)===value.bodySha256,'The original complete request body changed.');
 draft(value.draft,projectId);const seen=new Set();for(const o of value.observations){need(plain(o)&&ID.test(o.id)&&!seen.has(o.id)&&typeof o.at==='string'&&(Object.hasOwn(o,'result')!==Object.hasOwn(o,'error')),'Retain every original request observation.');seen.add(o.id);}return body;
}
function merge(a,b){
 if(!a)return clone(b);need(a.id===b.id&&a.projectId===b.projectId&&a.action===b.action&&a.bodyText===b.bodyText&&a.bodySha256===b.bodySha256&&stable(a.draft)===stable(b.draft),'An original request ID already has another complete body or form.');
 const seen=new Map();for(const o of [...a.observations,...b.observations]){if(seen.has(o.id))need(stable(seen.get(o.id))===stable(o),'A retained result observation changed.');else seen.set(o.id,o);}
 const observations=[...seen.values()].sort((x,y)=>x.at.localeCompare(y.at)||x.id.localeCompare(y.id));return {...a,observations};
}
export async function createResearchReturnWork({projectId,tabId}){
 need(UUID.test(projectId)&&ID.test(tabId),'Bind retained work to the original project and browser tab.');
 const headKey=projectId+':'+tabId,volatileDrafts=new Map(),volatileOps=new Map(),cachedDrafts=new Map(),cachedOps=new Map();let head=null,last=null,chain=Promise.resolve(),complete=false;
 const queue=fn=>{const result=chain.then(fn);chain=result.catch(()=>{});return result;};
 async function records(){
  try{const result=await transaction(['drafts','operations'],'readonly',tx=>{const d=tx.objectStore('drafts').index('projectId').getAll(projectId),o=tx.objectStore('operations').index('projectId').getAll(projectId);return()=>({drafts:d.result,operations:o.result});});
   for(const d of result.drafts)cachedDrafts.set(d.id,d);for(const o of result.operations)cachedOps.set(o.id,merge(cachedOps.get(o.id),o));complete=true;
  }catch(error){if(!complete)throw error;}
  const ds=new Map(cachedDrafts),os=new Map(cachedOps);for(const d of volatileDrafts.values())ds.set(d.id,d);for(const o of volatileOps.values())os.set(o.id,merge(os.get(o.id),o));
  return {drafts:clone([...ds.values()]),operations:clone([...os.values()])};
 }
 async function current(){const value=await transaction(['heads','drafts'],'readonly',tx=>{let selected;const r=tx.objectStore('heads').get(headKey);r.onsuccess=()=>{head=r.result?.draftId??null;if(head){const d=tx.objectStore('drafts').get(head);d.onsuccess=()=>{selected=d.result;};}};return()=>selected??null;});if(value){draft(value,projectId);last=value;}return clone(value);}
 async function writeDraft(value,makeCurrent){
  await transaction(['drafts','heads'],'readwrite',(tx,fail)=>{const ds=tx.objectStore('drafts'),old=ds.get(value.id);old.onsuccess=()=>{try{need(!old.result||stable(old.result)===stable(value),'An immutable form edition changed.');ds.put(value);}catch(e){fail(e);}};
   if(makeCurrent){const hs=tx.objectStore('heads'),r=hs.get(headKey);r.onsuccess=()=>{try{need((r.result?.draftId??null)===head,'Another tab moved the saved working copy. Export yours and explicitly reopen retained work.');hs.put({id:headKey,projectId,draftId:value.id});}catch(e){fail(e);}};}});
  if(makeCurrent)head=value.id;cachedDrafts.set(value.id,value);volatileDrafts.delete(value.id);
 }
 async function retain(value,reason='Working fields saved'){
  const snapshot=clone(value);need(plain(snapshot),'Retain the complete return form.');
  if(last&&stable(last.value)===stable(snapshot)){const existing=last;if(volatileDrafts.has(existing.id))await queue(()=>writeDraft(existing,true));return clone(existing);}
  const next={schema:DRAFT,id:uid(),projectId,tabId,at:stamp(),reason,value:snapshot};last=next;volatileDrafts.set(next.id,next);
  await queue(async()=>{for(const prior of [...volatileDrafts.values()])if(prior.id!==next.id)await writeDraft(prior,false);await writeDraft(next,true);});return clone(next);
 }
 async function persist(value){
  volatileOps.set(value.id,merge(volatileOps.get(value.id),value));const candidate=volatileOps.get(value.id);let retained;
  await transaction(['operations'],'readwrite',(tx,fail)=>{const s=tx.objectStore('operations'),r=s.get(value.id);r.onsuccess=()=>{try{retained=merge(r.result,candidate);s.put(retained);}catch(e){fail(e);}}});
  cachedOps.set(retained.id,retained);volatileOps.delete(retained.id);return clone(retained);
 }
 async function prepare(body,form){
  body=clone(body);const saved=await retain(form,'Before '+body.action),bodyText=JSON.stringify(body),value={schema:OP,id:body.id,projectId,action:body.action,createdAt:stamp(),bodyText,bodySha256:await researchReturnHash(bodyText),draft:saved,observations:[]};
  await operation(value,projectId);return persist(value);
 }
 async function observe(value,result,error){const o={id:uid(),at:stamp(),...(error?{error:{message:error.message,status:error.status??null,code:error.code??null}}:{result:clone(result)})};return persist({...value,observations:[...value.observations,o]});}
 async function exportWork(currentForm){if(currentForm)try{await retain(currentForm,'Complete return work exported');}catch{/* records includes complete volatile copy */}
  const all=await records(),body={schema:RETURN_WORK_SCHEMA,projectId,exportedAt:stamp(),currentDraftId:last?.id??null,...all};return companion(body);
 }
 async function exportSelection({draftId=null,operationId=null}={}){
  const all=await records(),selectedDrafts=new Map(),selectedOps=[];
  if(draftId){const d=all.drafts.find(x=>x.id===draftId);need(d,'The original complete form is absent.');selectedDrafts.set(d.id,d);}
  if(operationId){const o=all.operations.find(x=>x.id===operationId);need(o,'The original complete request is absent.');selectedOps.push(o);selectedDrafts.set(o.draft.id,o.draft);}
  need(selectedDrafts.size||selectedOps.length,'Select one complete original form or request.');
  return companion({schema:RETURN_WORK_SCHEMA,projectId,exportedAt:stamp(),currentDraftId:draftId??selectedOps[0]?.draft.id??null,drafts:[...selectedDrafts.values()],operations:selectedOps});
 }
 async function importWork(value){
  const {sha256,...body}=value;need(body.schema===RETURN_WORK_SCHEMA&&body.projectId===projectId&&Array.isArray(body.drafts)&&Array.isArray(body.operations)&&HASH.test(sha256??'')&&(boundedCompanion(body),await researchReturnHash(stable(body))===sha256),'Open the exact complete browser companion for this project.');
  const ids=new Set();for(const d of body.drafts){draft(d,projectId);need(!ids.has(d.id),'Draft identities repeat.');ids.add(d.id);}ids.clear();for(const o of body.operations){await operation(o,projectId);need(!ids.has(o.id),'Request identities repeat.');ids.add(o.id);}
  await transaction(['drafts','operations'],'readwrite',(tx,fail)=>{for(const [kind,list] of [['drafts',body.drafts],['operations',body.operations]])for(const value of list){const s=tx.objectStore(kind),r=s.get(value.id);r.onsuccess=()=>{try{const v=kind==='operations'?merge(r.result,value):(need(!r.result||stable(r.result)===stable(value),'An immutable form edition changed.'),value);s.put(v);}catch(e){fail(e);}}}});
  return records();
 }
 await current();await records();
 return {projectId,records,current,retain,prepare,observe,exportWork,exportSelection,importWork,validateOperation:value=>operation(value,projectId),
  async reopenHead(){return current();},hasVolatile:()=>volatileDrafts.size>0||volatileOps.size>0,
  async flush(){await chain;for(const d of [...volatileDrafts.values()])await writeDraft(d,false);if(last)await writeDraft(last,true);for(const o of [...volatileOps.values()])await persist(o);},
  lastDraft:()=>clone(last)};
}
