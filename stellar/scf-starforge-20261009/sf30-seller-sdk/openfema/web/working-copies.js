// MIT. Private operator preparation over the original native workspace.
export const COPY_SCHEMA='stellar-forge.openfema-working-copies.v1';
export const EXPORT_SCHEMA='stellar-forge.openfema-working-copy-export.v1';
export const FILE_LIMIT=256*1024*1024;
export const EXPORT_LIMIT=1024*1024*1024;
const META_LIMIT=32*1024*1024, TOTAL_LIMIT=512*1024*1024;
const clone=value=>structuredClone(value), now=()=>new Date().toISOString();
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const fail=(code,message)=>Object.assign(new Error(message),{code});
const json=value=>JSON.stringify(value);
const utf8=value=>new TextEncoder().encode(value);
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
export async function digest(bytes){return hex(await crypto.subtle.digest('SHA-256',bytes));}
function text(value,label,max=1024){if(typeof value!=='string'||!value||value.length>max)throw fail('WORKING_COPY_FORMAT','Invalid '+label+'.');return value;}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}
function validateCopy(copy,workspaceId){
  if(!object(copy)||copy.workspaceId!==workspaceId||!object(copy.snapshot))throw fail('WORKING_COPY_WORKSPACE','Choose a complete copy from this original native workspace.');
  text(copy.id,'copy identity',160);text(copy.name,'copy name',200);
  if(!object(copy.snapshot.forms)||!object(copy.snapshot.files)||!object(copy.snapshot.ui)||!object(copy.snapshot.integration))throw fail('WORKING_COPY_FORMAT','The complete copy is missing its forms, file selections or view.');
  for(const value of Object.values(copy.snapshot.files))validateReference(value);
  return copy;
}
function validateReference(ref){
  if(!object(ref)||!/^[a-f0-9]{64}$/.test(ref.sha256)||!Number.isSafeInteger(ref.bytes)||ref.bytes<0||ref.bytes>FILE_LIMIT)throw fail('WORKING_COPY_FILE','The original file binding is incomplete.');
  text(ref.name,'original filename',1024);return ref;
}
function references(copy,requests){
  const refs=Object.values(copy.snapshot.files);
  for(const request of requests){for(const key of ['payloadFile','resultFile'])if(request[key])refs.push(request[key]);for(const ref of request.replayResults||[])refs.push(ref);for(const observation of request.importedReceipts||[])refs.push(observation.file);}
  return [...new Map(refs.map(ref=>[ref.sha256,ref])).values()];
}
function validateRoot(root){
  if(root.schema!==COPY_SCHEMA||!Array.isArray(root.copies)||!Array.isArray(root.requests)||!Number.isSafeInteger(root.revision)||root.revision<0)throw fail('WORKING_COPY_FORMAT','The original browser store is incomplete.');
  const ids=new Set();for(const copy of root.copies){validateCopy(copy,root.workspaceId);if(ids.has(copy.id))throw fail('WORKING_COPY_FORMAT','Repeated copy identity.');ids.add(copy.id);}
  if(!ids.has(root.activeId))throw fail('WORKING_COPY_FORMAT','The selected working copy is missing.');
  const operations=new Set();
  for(const request of root.requests){
    if(!object(request)||request.workspaceId!==root.workspaceId||!Array.isArray(request.copyIds)||!request.copyIds.length||request.copyIds.some(id=>!ids.has(id))||!['pending','completed'].includes(request.status))throw fail('WORKING_COPY_REQUEST','The original request binding is incomplete.');
    text(request.operationId,'native operation identity',160);text(request.action,'native action',160);
    if(operations.has(request.operationId))throw fail('WORKING_COPY_REQUEST','A native operation is repeated.');operations.add(request.operationId);
    if(request.payloadFile)validateReference(request.payloadFile);
    else if(!request.needsOriginalSource&&!request.needsOriginalCustomerFile)throw fail('WORKING_COPY_REQUEST','The complete original request payload is missing.');
    if(request.resultFile)validateReference(request.resultFile);
    for(const ref of request.replayResults||[])validateReference(ref);
    for(const observation of request.importedReceipts||[])validateReference(observation.file);
  }
  if(utf8(json(root)).length>META_LIMIT)throw fail('WORKING_COPY_CAPACITY','Export completed copies and remove them before adding more preparation. The browser metadata limit is 32 MiB.');
  return root;
}
const blank=()=>({forms:{},files:{},ui:{section:'sources'},integration:{}});
function newCopy(workspaceId,name,snapshot=blank()){
  return {id:'copy-'+crypto.randomUUID(),workspaceId,name:text(name.trim(),'copy name',200),createdAt:now(),updatedAt:now(),snapshot:clone(snapshot)};
}
function openDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('openfema-operator-working-copies',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('workspaces',{keyPath:'workspaceId'});request.result.createObjectStore('files',{keyPath:'sha256'});};
    request.onerror=()=>reject(request.error);request.onblocked=()=>reject(fail('WORKING_COPY_BUSY','Close the older OpenFEMA window before opening this store.'));
    request.onsuccess=()=>resolve(request.result);
  });
}
function read(db,store,key){
  return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),req=tx.objectStore(store).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
function commit(db,expected,root,assets=[]){
  validateRoot(root);
  return new Promise((resolve,reject)=>{
    let reason;const tx=db.transaction(['workspaces','files'],'readwrite');
    tx.oncomplete=()=>resolve(clone(root));tx.onerror=()=>reject(reason||tx.error);tx.onabort=()=>reject(reason||tx.error||fail('WORKING_COPY_STORAGE','The browser could not retain the complete copy.'));
    const ws=tx.objectStore('workspaces'),request=ws.get(root.workspaceId);
    request.onsuccess=()=>{
      const old=request.result;
      if((old?.revision??null)!==expected){reason=fail('WORKING_COPY_CONFLICT','Another window saved this workspace. Export this window’s visible copy, then reload the saved copies.');tx.abort();return;}
      for(const asset of assets)tx.objectStore('files').put(asset);
      ws.put(root);
    };
  });
}
export async function fileAsset(file,limit=FILE_LIMIT){
  if(!(file instanceof Blob)||file.size>limit||file.size>FILE_LIMIT)throw fail('WORKING_COPY_FILE','Choose the complete original file within its published size limit.');
  const bytes=await file.arrayBuffer(),sha256=await digest(bytes);
  const ref={name:file.name||'original.json',type:file.type||'application/octet-stream',bytes:file.size,sha256,lastModified:Number.isFinite(file.lastModified)?file.lastModified:null};
  return {ref,asset:{sha256,bytes:new Blob([bytes],{type:ref.type})}};
}
export async function jsonAsset(value,name){
  return fileAsset(new File([json(value)],name,{type:'application/json'}));
}
function b64(bytes){
  let value='';for(let at=0;at<bytes.length;at+=32768)value+=String.fromCharCode(...bytes.subarray(at,at+32768));return btoa(value);
}
function unb64(value){
  if(typeof value!=='string'||value.length>Math.ceil(FILE_LIMIT/3)*4||value.length%4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw fail('WORKING_COPY_FILE','The original file encoding is incomplete.');
  const raw=atob(value),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  if(b64(bytes)!==value)throw fail('WORKING_COPY_FILE','The original file encoding changed.');return bytes;
}
export class WorkingCopies{
  constructor(db,root){this.db=db;this.root=root;this.queue=Promise.resolve();this.generation=0;}
  static async open(workspaceId){
    text(workspaceId,'native workspace identity',200);
    const db=await openDB();let root=await read(db,'workspaces',workspaceId);
    if(!root){const copy=newCopy(workspaceId,'Operator working copy');root={schema:COPY_SCHEMA,workspaceId,revision:0,activeId:copy.id,copies:[copy],requests:[]};try{await commit(db,null,root);}catch(error){if(error.code!=='WORKING_COPY_CONFLICT')throw error;root=await read(db,'workspaces',workspaceId);}}
    return new WorkingCopies(db,validateRoot(root));
  }
  get current(){return this.root.copies.find(copy=>copy.id===this.root.activeId);}
  get selection(){return {copyId:this.root.activeId,generation:this.generation};}
  assertSelection(selection){if(selection.copyId!==this.root.activeId||selection.generation!==this.generation)throw fail('WORKING_COPY_SELECTION','The selected working copy changed while the file was read. Choose it again in the intended copy.');}
  mutate(edit,assets=[]){
    const run=this.queue.then(async()=>{
      const candidate=clone(this.root);edit(candidate);candidate.revision++;
      const next=await commit(this.db,this.root.revision,candidate,assets);
      this.root=next;return this.current;
    });
    this.queue=run.catch(()=>{});return run;
  }
  async flush(){await this.queue;}
  async reload(){await this.flush();const root=await read(this.db,'workspaces',this.root.workspaceId);this.root=validateRoot(root);this.generation++;return this.current;}
  async save(snapshot,selection=this.selection){
    return this.mutate(root=>{this.assertSelection(selection);const copy=root.copies.find(c=>c.id===selection.copyId);copy.snapshot=clone(snapshot);copy.updatedAt=now();});
  }
  async create(name,snapshot=blank()){
    const copy=newCopy(this.root.workspaceId,name,snapshot);
    await this.mutate(root=>{root.copies.push(copy);root.activeId=copy.id;});this.generation++;return this.current;
  }
  async choose(id){await this.mutate(root=>{if(!root.copies.some(c=>c.id===id))throw fail('WORKING_COPY_SELECTION','Choose an existing saved copy.');root.activeId=id;});this.generation++;return this.current;}
  async rename(name){await this.mutate(root=>{const c=root.copies.find(c=>c.id===root.activeId);c.name=text(name.trim(),'copy name',200);c.updatedAt=now();});}
  async remove(id){
    await this.mutate(root=>{
      if(root.copies.length===1)throw fail('WORKING_COPY_SELECTION','Keep at least one working copy.');
      if(root.requests.some(r=>r.copyIds.includes(id)&&r.copyIds.length===1&&r.status==='pending'))throw fail('WORKING_COPY_REQUEST','Continue this copy’s original pending operations before removing it.');
      root.copies=root.copies.filter(c=>c.id!==id);root.requests=root.requests.map(r=>({...r,copyIds:r.copyIds.filter(copyId=>copyId!==id)})).filter(r=>r.copyIds.length);
      if(root.activeId===id)root.activeId=root.copies[0].id;
    });this.generation++;
  }
  async receiveFile(slot,file,limit,selection=this.selection,accept=()=>true){
    const {ref,asset}=await fileAsset(file,limit);
    await this.mutate(root=>{this.assertSelection(selection);if(!accept())throw fail('WORKING_COPY_SELECTION','The selected original file changed while it was read.');const copy=root.copies.find(c=>c.id===selection.copyId);copy.snapshot.files[slot]=ref;copy.updatedAt=now();},[asset]);
    return ref;
  }
  async file(ref){
    validateReference(ref);const record=await read(this.db,'files',ref.sha256);
    if(!(record?.bytes instanceof Blob)||record.bytes.size!==ref.bytes)throw fail('WORKING_COPY_FILE','A complete retained original file is missing. Import the full working-copy export.');
    const bytes=await record.bytes.arrayBuffer();if(await digest(bytes)!==ref.sha256)throw fail('WORKING_COPY_FILE','The retained original file changed.');
    return new File([bytes],ref.name,{type:ref.type,lastModified:ref.lastModified??0});
  }
  pending(){return this.root.requests.filter(r=>r.status==='pending').map(clone).sort((a,b)=>b.savedAt.localeCompare(a.savedAt));}
  async request(id){
    const record=this.root.requests.find(r=>r.operationId===id);if(!record)return null;
    const result=clone(record);
    if(result.payloadFile){const file=await this.file(result.payloadFile);result.payload=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer()));}
    return result;
  }
  async payloadIdentity(payload){
    const bytes=utf8(json(canonical(payload)));return {sha256:await digest(bytes),bytes:bytes.length};
  }
  async retainedIdentity(record){
    if(!record?.payloadFile)return null;
    if(record.payloadIdentity)return record.payloadIdentity;
    const file=await this.file(record.payloadFile);return this.payloadIdentity(JSON.parse(await file.text()));
  }
  async retainRequest(record){
    const selection=this.selection;
    const prepared=record.payload===undefined?null:await jsonAsset(record.payload,'Original_'+record.operationId+'_payload.json');
    const identity=prepared?await this.payloadIdentity(record.payload):null;
    const previous=this.root.requests.find(r=>r.operationId===record.operationId),previousIdentity=await this.retainedIdentity(previous);
    const saved={...clone(record),copyIds:[selection.copyId],status:'pending',...(prepared?{payloadFile:prepared.ref,payloadIdentity:identity}:{})};delete saved.payload;
    await this.mutate(root=>{
      this.assertSelection(selection);const old=root.requests.find(r=>r.operationId===record.operationId);
      if(old){
        if(old.action!==saved.action)throw fail('WORKING_COPY_REQUEST','This native operation is already bound to another action.');
        if(old.payloadFile){
          if(!identity||identity.sha256!==previousIdentity?.sha256||identity.bytes!==previousIdentity?.bytes)throw fail('WORKING_COPY_REQUEST','This native operation is already bound to different original inputs.');
          old.payloadIdentity=previousIdentity;
        }else if(prepared){
          const source=old.needsOriginalSource&&old.action==='source.import'&&old.originalSource?.sha256===record.originalSource?.sha256&&old.originalSource?.bytes===record.originalSource?.bytes;
          const customer=old.needsOriginalCustomerFile&&old.action==='delivery.reconcile'&&old.originalCustomerFile?.sha256===record.originalCustomerFile?.sha256&&old.originalCustomerFile?.bytes===record.originalCustomerFile?.bytes&&old.originalCustomerFile?.deliveryId===record.originalCustomerFile?.deliveryId;
          if(!source&&!customer)throw fail('WORKING_COPY_REQUEST','The full payload does not match this retained original file request.');
          old.legacyOriginalRequest??=clone(old);old.payloadFile=prepared.ref;old.payloadIdentity=identity;old.hydratedAt=now();delete old.needsOriginalSource;delete old.needsOriginalCustomerFile;
        }
        if(!old.copyIds.includes(selection.copyId))old.copyIds.push(selection.copyId);
        return;
      }
      root.requests.push(saved);
    },prepared?[prepared.asset]:[]);
    return saved;
  }
  async completeRequest(id,result,revision){
    const original=this.root.requests.find(r=>r.operationId===id);
    if(original?.resultFile){
      const file=await this.file(original.resultFile),first=JSON.parse(await file.text());
      if(json(canonical(first.result))===json(canonical(result)))return;
    }
    const prepared=await jsonAsset({result,revision,receivedAt:now()},'Original_'+id+'_outcome.json');
    await this.mutate(root=>{const request=root.requests.find(r=>r.operationId===id);if(!request)throw fail('WORKING_COPY_REQUEST','The accepted original request is missing.');if(request.resultFile){request.replayResults=[...(request.replayResults||[]),prepared.ref];}else{request.status='completed';request.resultFile=prepared.ref;request.completedAt=now();}},[prepared.asset]);
  }
  async exportCopy(snapshot=null){
    const selection=this.selection;await this.flush();this.assertSelection(selection);const copy=clone(this.current);if(snapshot)copy.snapshot=clone(snapshot);
    validateCopy(copy,this.root.workspaceId);
    const requests=this.root.requests.filter(r=>r.copyIds.includes(copy.id)).map(clone),refs=references(copy,requests);
    const parts=[json({schema:EXPORT_SCHEMA,workspaceId:copy.workspaceId,exportedAt:now(),copy,requests}).slice(0,-1)+',"files":['];let total=0;
    for(let i=0;i<refs.length;i++){
      const file=await this.file(refs[i]);total+=file.size;if(total>TOTAL_LIMIT)throw fail('WORKING_COPY_CAPACITY','This complete export exceeds the 512 MiB original-file capacity.');
      if(i)parts.push(',');parts.push(json({reference:refs[i]}).slice(0,-1)+',"base64":"');
      const bytes=new Uint8Array(await file.arrayBuffer());for(let at=0;at<bytes.length;at+=3*16384)parts.push(b64(bytes.subarray(at,at+3*16384)));parts.push('"}');
    }
    this.assertSelection(selection);parts.push(']}');const result=new Blob(parts,{type:'application/json'});if(result.size>EXPORT_LIMIT)throw fail('WORKING_COPY_CAPACITY','The complete working-copy export exceeds 1 GiB.');return result;
  }
  async importCopy(file){
    if(!(file instanceof Blob)||file.size>EXPORT_LIMIT)throw fail('WORKING_COPY_CAPACITY','Choose a complete working-copy JSON within 1 GiB.');
    const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());
    const value=JSON.parse(raw.replace(/^\uFEFF/,''));
    if(value.schema!==EXPORT_SCHEMA||value.workspaceId!==this.root.workspaceId||!Array.isArray(value.requests)||!Array.isArray(value.files))throw fail('WORKING_COPY_WORKSPACE','Open the original native workspace before importing its complete working copy.');
    validateCopy(value.copy,this.root.workspaceId);
    validateRoot({schema:COPY_SCHEMA,workspaceId:this.root.workspaceId,revision:0,activeId:value.copy.id,copies:[value.copy],requests:value.requests.map(r=>({...r,copyIds:[value.copy.id]}))});
    const assets=[],seen=new Map();let total=0;
    for(const entry of value.files){
      const ref=validateReference(entry.reference),bytes=unb64(entry.base64);total+=bytes.length;
      if(total>TOTAL_LIMIT||seen.has(ref.sha256)||bytes.length!==ref.bytes||await digest(bytes)!==ref.sha256)throw fail('WORKING_COPY_FILE','The complete file inventory is repeated, oversized or changed.');
      seen.set(ref.sha256,ref);assets.push({sha256:ref.sha256,bytes:new Blob([bytes],{type:ref.type})});
    }
    for(const ref of references(value.copy,value.requests)){const actual=seen.get(ref.sha256);if(!actual||actual.bytes!==ref.bytes)throw fail('WORKING_COPY_FILE','The export omits a complete original selected file or request.');}
    const copy={...clone(value.copy),id:'copy-'+crypto.randomUUID(),name:(value.copy.name+' — imported').slice(0,200),importedFrom:{copyId:value.copy.id,exportedAt:value.exportedAt},updatedAt:now()};
    const prepared=value.requests.map(r=>({...clone(r),copyIds:[copy.id]}));
    const identities=new Map();
    for(const request of prepared){
      if(request.payloadFile){
        const asset=assets.find(a=>a.sha256===request.payloadFile.sha256),payload=JSON.parse(await asset.bytes.text());request.payloadIdentity=await this.payloadIdentity(payload);
        if(request.action==='source.import'){const original=await this.payloadIdentity(payload.bundle);if(request.originalSource&&(request.originalSource.sha256!==original.sha256||request.originalSource.bytes!==original.bytes))throw fail('WORKING_COPY_REQUEST','The imported source request and its original bundle identity differ.');request.originalSource=original;}
        if(request.action==='delivery.reconcile'){const original={...await this.payloadIdentity(payload.customerFile),deliveryId:payload.deliveryId};if(request.originalCustomerFile&&(request.originalCustomerFile.sha256!==original.sha256||request.originalCustomerFile.bytes!==original.bytes||request.originalCustomerFile.deliveryId!==original.deliveryId))throw fail('WORKING_COPY_REQUEST','The imported customer request and its complete file identity differ.');request.originalCustomerFile=original;}
      }
      const existing=this.root.requests.find(r=>r.operationId===request.operationId);identities.set(request.operationId,await this.retainedIdentity(existing));
    }
    await this.mutate(root=>{
      for(const request of prepared){const existing=root.requests.find(r=>r.operationId===request.operationId);if(existing&&(existing.action!==request.action||(existing.payloadFile&&request.payloadFile&&identities.get(request.operationId)?.sha256!==request.payloadIdentity?.sha256)))throw fail('WORKING_COPY_REQUEST','The imported operation differs from this workspace’s retained original inputs.');}
      root.copies.push(copy);root.activeId=copy.id;
      for(const request of prepared){const existing=root.requests.find(r=>r.operationId===request.operationId);if(existing){
        if(!existing.payloadFile&&request.payloadFile){
          const sameSource=existing.needsOriginalSource&&request.action==='source.import'&&existing.originalSource?.sha256===request.originalSource?.sha256&&existing.originalSource?.bytes===request.originalSource?.bytes;
          const sameCustomer=existing.needsOriginalCustomerFile&&request.action==='delivery.reconcile'&&existing.originalCustomerFile?.sha256===request.originalCustomerFile?.sha256&&existing.originalCustomerFile?.bytes===request.originalCustomerFile?.bytes&&existing.originalCustomerFile?.deliveryId===request.originalCustomerFile?.deliveryId;
          if(!sameSource&&!sameCustomer)throw fail('WORKING_COPY_REQUEST','The imported complete payload differs from this retained original file request.');
          existing.legacyOriginalRequest??=clone(existing);existing.payloadFile=request.payloadFile;existing.payloadIdentity=request.payloadIdentity;existing.hydratedAt=now();delete existing.needsOriginalSource;delete existing.needsOriginalCustomerFile;
        }
        if(!existing.copyIds.includes(copy.id))existing.copyIds.push(copy.id);
        const observations=[...(request.importedReceipts||[]),...[request.resultFile,...(request.replayResults||[])].filter(Boolean).map(file=>({file,observedStatus:request.status,completedAt:request.completedAt??null,sourceCopyId:value.copy.id,exportedAt:value.exportedAt}))];
        const known=new Set([existing.resultFile,...(existing.replayResults||[]),...(existing.importedReceipts||[]).map(o=>o.file)].filter(Boolean).map(f=>f.sha256));
        for(const observation of observations)if(!known.has(observation.file.sha256)){(existing.importedReceipts??=[]).push(observation);known.add(observation.file.sha256);}
      }else root.requests.push(request);}
    },assets);
    this.generation++;return this.current;
  }
}
