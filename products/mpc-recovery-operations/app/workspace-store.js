/* Local branch custody for the existing MPC operating model. No network effects. */
function createBrowserWorkspaceStore({indexedDB,canonical,sha256,receiveSnapshot,exportSnapshot,uuid,now}){
 const schema='mpc-browser-branch.v1',database='mpc-recovery-browser-branches.v1';let connection;
 const copy=x=>structuredClone(x),assert=(ok,msg)=>{if(!ok)throw Error(msg);};
 const identity=snapshot=>{const model=receiveSnapshot(snapshot),normalized=exportSnapshot(model);assert(canonical(normalized)===canonical(snapshot),'The complete snapshot changed during receiving.');return{workspaceId:model.id,revision:model.revision,snapshotSha256:sha256(canonical(snapshot))};};
 function summary(r){return{id:r.id,label:r.label,workspaceId:r.workspaceId,revision:r.revision,snapshotSha256:r.snapshotSha256,createdAt:r.createdAt,updatedAt:r.updatedAt,origin:copy(r.origin)};}
 function verified(r){assert(r&&r.schema===schema,'The original browser branch is unavailable.');const actual=identity(r.snapshot);for(const key of Object.keys(actual))assert(r[key]===actual[key],'The saved browser branch identity differs.');return copy(r);}
 async function open(){if(connection)return connection;assert(indexedDB,'This browser cannot retain independent workspaces. Use a supported browser.');connection=await new Promise((resolve,reject)=>{const r=indexedDB.open(database,1);r.onupgradeneeded=()=>{const db=r.result;db.createObjectStore('branches',{keyPath:'id'});db.createObjectStore('metadata',{keyPath:'key'});};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Close an older application tab before opening the branch store.'));r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();connection=null;};resolve(r.result);};});return connection;}
 async function transaction(mode,work){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['branches','metadata'],mode);let value,error;
  const fail=e=>{error=e;try{tx.abort();}catch{};};
  tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(error||tx.error||Error('The browser did not commit this operation.'));tx.onerror=()=>{};
  const get=(store,key,fn)=>{const req=tx.objectStore(store).get(key);req.onsuccess=()=>{try{fn(req.result);}catch(e){fail(e);}};req.onerror=()=>fail(req.error);};
  try{work({tx,get,put:(store,row)=>tx.objectStore(store).put(row),finish:v=>{value=v;},fail});}catch(e){fail(e);}
 });}
 async function read(id){const r=await transaction('readonly',({get,finish})=>get('branches',id,finish));return verified(r);}
 async function list(){return transaction('readonly',({tx,finish,fail})=>{const out=[],r=tx.objectStore('branches').openCursor();r.onsuccess=()=>{try{const c=r.result;if(c){out.push(summary(c.value));c.continue();}else finish(out.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id)));}catch(e){fail(e);}};r.onerror=()=>fail(r.error);});}
 function newRecord(id,label,snapshot,origin){assert(typeof id==='string'&&id.length<180&&typeof label==='string'&&label.trim()&&label.length<=240,'Name the independent browser workspace.');const at=now();return{schema,id,label,createdAt:at,updatedAt:at,...identity(snapshot),snapshot:copy(snapshot),origin:copy(origin)};}
 async function create({id,label,snapshot,origin}){const record=newRecord(id,label,snapshot,origin),creationSha256=sha256(canonical({id,label,snapshot,origin}));record.creationSha256=creationSha256;
  return transaction('readwrite',({get,put,finish})=>get('branches',id,old=>{if(old){assert(old.creationSha256===creationSha256,'This browser branch creation ID belongs to another original input.');finish(verified(old));}else{put('branches',record);finish(record);}}));}
 async function seed(snapshot,origin,key,label){const record=newRecord('branch-'+uuid(),label,snapshot,origin);record.creationSha256=sha256(canonical({snapshot,origin}));
  return transaction('readwrite',({get,put,finish})=>get('metadata',key,prior=>{if(prior)get('branches',prior.branchId,old=>{assert(old&&old.creationSha256===record.creationSha256,'The original migration record differs.');finish(verified(old));});else{put('branches',record);put('metadata',{key,branchId:record.id,originalSha256:record.snapshotSha256});finish(record);}}));}
 async function initialize({initialSnapshot,legacyRaw,preferredId}){
  let migrated=null;
  if(legacyRaw!==null&&legacyRaw!==undefined){assert(typeof legacyRaw==='string','Legacy browser bytes are unavailable.');const snapshot=JSON.parse(legacyRaw),legacySha256=sha256(legacyRaw);identity(snapshot);migrated=await seed(snapshot,{kind:'LEGACY_BROWSER',legacySha256},'legacy:'+legacySha256,'Recovered original browser workspace');}
  if(preferredId){const existing=await transaction('readonly',({get,finish})=>get('branches',preferredId,finish));if(existing)return verified(existing);}
  if(migrated)return migrated;
  const snapshotSha256=identity(initialSnapshot).snapshotSha256;
  return seed(initialSnapshot,{kind:'ISSUED_BASELINE',snapshotSha256},'baseline:'+snapshotSha256,'Original planning workspace');
 }
 async function save({id,expected,snapshot}){const actual=identity(snapshot);assert(actual.workspaceId===expected.workspaceId&&(actual.revision>expected.revision||(actual.revision===expected.revision&&actual.snapshotSha256===expected.snapshotSha256)),'A save must continue this exact original workspace and revision, or reuse its identical snapshot.');
  return transaction('readwrite',({get,put,finish})=>get('branches',id,stored=>{const old=verified(stored);
   assert(old.workspaceId===expected.workspaceId&&old.revision===expected.revision&&old.snapshotSha256===expected.snapshotSha256,'Another tab saved this branch. Keep the current form, then reopen or receive its saved edition before another edit.');
   if(actual.revision===old.revision){finish(old);return;}const next={...old,...actual,snapshot:copy(snapshot),updatedAt:now()};put('branches',next);finish(next);
  }));
 }
 return{read,list,create,initialize,save,close:()=>{if(connection)connection.close();connection=null;}};
}
