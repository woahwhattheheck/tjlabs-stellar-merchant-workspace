// SPDX-License-Identifier: MIT
// Exact browser drafts and original requests; transaction ownership is scoped to one operator.
const DB='facilitator-commissioning-recovery-v1',STORE='records';
let connection;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function openDatabase(){if(!connection)connection=new Promise((yes,no)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onerror=()=>no(r.error);r.onsuccess=()=>yes(r.result);r.onblocked=()=>no(new Error('Close the older operator tab so its saved workspace can open.'));});return connection;}
async function transaction(mode,work){const db=await openDatabase();return new Promise((yes,no)=>{const t=db.transaction(STORE,mode),s=t.objectStore(STORE);let result,error;t.oncomplete=()=>yes(result);t.onerror=()=>no(error??t.error);t.onabort=()=>no(error??t.error??new Error('The browser recovery transaction was interrupted.'));const done=v=>{result=v;};const fail=e=>{error=e;t.abort();};try{work(s,done,fail);}catch(e){fail(e);}});}
export class BrowserRecovery{
  constructor(instanceId,tabId){this.prefix=instanceId+':';this.tabId=tabId;}
  read(key){return transaction('readonly',(s,done)=>{const r=s.get(this.prefix+key);r.onsuccess=()=>done(r.result??null);});}
  write(key,value){return transaction('readwrite',(s,done)=>{s.put(value,this.prefix+key);done(value);});}
  claim(request,draft){return transaction('readwrite',(s,done,fail)=>{const key=this.prefix+'pending',r=s.get(key);r.onsuccess=()=>{const old=r.result;if(old&&!same(old.request,request)){fail(Object.assign(new Error('Another original command is pending for this operator. Receive and complete it before preparing another.'),{code:'PENDING_ORIGINAL_COMMAND',operationId:old.request.operationId}));return;}const value=old??{request,tabId:this.tabId,draft:draft??null,savedAt:new Date().toISOString()};s.put(value,key);done(value);};});}
  releasePending(operationId){return transaction('readwrite',(s,done)=>{const key=this.prefix+'pending',r=s.get(key);r.onsuccess=()=>{const old=r.result;if(old?.request.operationId===operationId){s.put({...old,detachedAt:new Date().toISOString()},this.prefix+'retained:'+operationId);s.delete(key);done(true);}else done(false);};});}
  clearCompleted(operationId){return transaction('readwrite',(s,done)=>{const key=this.prefix+'pending',r=s.get(key);r.onsuccess=()=>{if(r.result?.request.operationId===operationId){s.delete(key);done(true);}else done(false);};});}
  draft(formKey){return this.read('draft:'+this.tabId+':'+formKey);}
  saveDraft(formKey,draft){return this.write('draft:'+this.tabId+':'+formKey,draft);}
  clearDraft(formKey,expected,tabId=this.tabId){return transaction('readwrite',(s,done)=>{const key=this.prefix+'draft:'+tabId+':'+formKey,r=s.get(key);r.onsuccess=()=>{if(same(r.result,expected)){s.delete(key);done(true);}else done(false);};});}
  pending(){return this.read('pending');}
}
