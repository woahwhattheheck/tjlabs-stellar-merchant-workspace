// Complete raw browser workspaces and original requests for the native warehouse.
export const STATE_SCHEMA='stellar-forge.duckdb-analytics.v1.browser-state';
export const MAX_STATE_BYTES=8*1024*1024;
const copy=value=>JSON.parse(JSON.stringify(value));
const textBytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const allowedRoutes=new Set(['analyses','run','compare','workbooks','publish','exports'].map(name=>'/api/analytics/'+name));
const id32=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function validateSnapshot(value,workspaceId){
 if(!object(value)||value.schema!==STATE_SCHEMA||value.workspace_id!==workspaceId||!id32(workspaceId))throw Error('This browser workspace belongs to another original warehouse.');
 const names=['schema','workspace_id','form','rows','pages','context','selection','pending','receipts','updated_at'];
 if(Object.keys(value).some(key=>!names.includes(key))||names.some(key=>!(key in value)))throw Error('The complete browser workspace format changed.');
 for(const key of ['form','rows','context','selection','pending','receipts'])if(!object(value[key]))throw Error('The browser workspace has an invalid '+key+' record.');
 if(!Array.isArray(value.pages)||['dimensions','measures','filters','pivots'].some(key=>!Array.isArray(value.rows[key])))throw Error('The complete browser field or page arrays are missing.');
 for(const [key,entry]of Object.entries(value.form))if(typeof key!=='string'||!['string','boolean'].includes(typeof entry))throw Error('The browser workspace contains an invalid original control.');
 for(const [id,entry]of Object.entries(value.pending)){
  if(!id32(id)||!object(entry)||entry.request_id!==id||!allowedRoutes.has(entry.route)||!object(entry.original))throw Error('The saved original request has an invalid identity or route.');
  if(!entry.exported&&entry.original.workspace_id!==workspaceId)throw Error('The saved original request belongs to another warehouse.');
 }
 if(typeof value.updated_at!=='string'||textBytes(value)>MAX_STATE_BYTES)throw Error('The complete browser workspace exceeds the eight MiB native limit.');
 return copy(value);
}
function requestValue(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error('Browser storage read failed.'));});}
function transactionDone(transaction){return new Promise((resolve,reject)=>{transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error||Error('Browser storage write failed.'));transaction.onabort=()=>reject(transaction.error||Error('Browser storage write interrupted.'));});}
function stable(value){return JSON.stringify(value,(key,item)=>object(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);}
export class BrowserWorkspaces{
 constructor(workspaceId){
  if(!id32(workspaceId))throw Error('An original warehouse identity is required.');
  this.workspaceId=workspaceId;this.sequence=0;this.queue=Promise.resolve();
  const key='stellar_duckdb_analytics_tab';
  try{this.tab=sessionStorage.getItem(key)||crypto.randomUUID();sessionStorage.setItem(key,this.tab);}catch{this.tab=crypto.randomUUID();}
  this.slot=workspaceId+':'+this.tab;
  this.ready=new Promise((resolve,reject)=>{
   const request=indexedDB.open('stellar_duckdb_analytics_workspaces',1);
   request.onupgradeneeded=()=>{const db=request.result;for(const name of ['current','editions','requests'])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});};
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error('Browser workspace storage is unavailable.'));
   request.onblocked=()=>reject(Error('Close the older browser-workspace connection to finish opening saved work.'));
  });
 }
 async records(name){
  const db=await this.ready,tx=db.transaction(name,'readonly'),done=transactionDone(tx);
  const rows=await requestValue(tx.objectStore(name).getAll());await done;
  return rows.filter(row=>row.workspace_id===this.workspaceId);
 }
 async current(){
  const db=await this.ready,tx=db.transaction('current','readonly'),done=transactionDone(tx),record=await requestValue(tx.objectStore('current').get(this.slot));await done;
  if(record){validateSnapshot(record.snapshot,this.workspaceId);this.sequence=Math.max(this.sequence,record.sequence||0);}
  return record;
 }
 saveCurrent(snapshot,metadata={}){
  const retained=validateSnapshot(snapshot,this.workspaceId),sequence=++this.sequence;
  const work=async()=>{
   const db=await this.ready,tx=db.transaction('current','readwrite'),done=transactionDone(tx);
   tx.objectStore('current').put({id:this.slot,workspace_id:this.workspaceId,sequence,updated_at:new Date().toISOString(),snapshot:retained,metadata:copy(metadata)});
   await done;return {sequence,snapshot:retained};
  };
  const operation=this.queue.then(work,work);this.queue=operation.catch(()=>{});return operation;
 }
 async checkpoint(snapshot,title,metadata={}){
  const retained=validateSnapshot(snapshot,this.workspaceId);
  await this.queue;
  const db=await this.ready,tx=db.transaction('editions','readwrite'),done=transactionDone(tx);
  const record={id:this.workspaceId+':'+crypto.randomUUID(),workspace_id:this.workspaceId,title:String(title),created_at:new Date().toISOString(),snapshot:retained,metadata:copy(metadata)};
  tx.objectStore('editions').add(record);await done;return record;
 }
 async editions(){
  const [editions,current]=await Promise.all([this.records('editions'),this.records('current')]);
  return [...editions,...current.filter(row=>row.id!==this.slot).map(row=>({...row,title:'Another browser draft',created_at:row.updated_at}))]
   .sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
 }
 async originalRequests(){
  const rows=await this.records('requests');
  return rows.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
 }
 async rememberRequest(request){
  const retained=copy(request);
  if(!id32(retained.request_id)||!object(retained.original))throw Error('The original request is incomplete.');
  const db=await this.ready,tx=db.transaction('requests','readwrite'),done=transactionDone(tx),store=tx.objectStore('requests'),key=this.workspaceId+':'+retained.request_id;
  const old=await requestValue(store.get(key));
  if(old&&(old.request.route!==retained.route||stable(old.request.original)!==stable(retained.original))){tx.abort();try{await done;}catch{}throw Error('The original request identifier is already retained with different input.');}
  if(!old)store.add({id:key,workspace_id:this.workspaceId,created_at:retained.created_at||new Date().toISOString(),state:'PENDING',request:retained});
  await done;return old||{state:'PENDING',request:retained};
 }
 async completeRequest(request,result){
  await this.rememberRequest(request);
  const db=await this.ready,tx=db.transaction('requests','readwrite'),done=transactionDone(tx),store=tx.objectStore('requests'),key=this.workspaceId+':'+request.request_id;
  const old=await requestValue(store.get(key));
  if(old.state==='COMPLETE'&&stable(old.result)!==stable(result)){tx.abort();try{await done;}catch{}throw Error('The accepted original result changed. The earlier completed receipt is retained.');}
  if(old.state!=='COMPLETE')store.put({...old,state:'COMPLETE',completed_at:new Date().toISOString(),result:copy(result)});
  await done;return result;
 }
 async failedRequest(request,error){
  await this.rememberRequest(request);
  const db=await this.ready,tx=db.transaction('requests','readwrite'),done=transactionDone(tx),store=tx.objectStore('requests'),key=this.workspaceId+':'+request.request_id;
  const old=await requestValue(store.get(key));
  if(old.state!=='COMPLETE')store.put({...old,state:'UNCERTAIN',last_error:String(error?.message||error),updated_at:new Date().toISOString()});
  await done;
 }
}
