// MIT. Full local branches and immutable pending requests for dossier returns.
export const RETURN_BROWSER_DRAFT='sf88-research-dossier-return-browser-draft-v1';
export const RETURN_BROWSER_REQUEST='sf88-research-dossier-return-browser-request-v1';
const DATABASE='research-dossier-returns-v1',VERSION=1,REQUEST_BYTES=16*1024*1024;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const returnClone=value=>structuredClone(value);
export const returnCanonical=value=>{
  if(Array.isArray(value))return '['+value.map(item=>returnCanonical(item)??'null').join(',')+']';
  if(plain(value))return '{'+Object.keys(value).filter(key=>value[key]!==undefined).sort()
    .map(key=>JSON.stringify(key)+':'+returnCanonical(value[key])).join(',')+'}';
  return JSON.stringify(value);
};
const fail=(code,details)=>{throw Object.assign(new Error(code),{code,...(details?{details}:{})});};
const need=(condition,code,details)=>{if(!condition)fail(code,details);};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const nativeId=(value,prefix)=>typeof value==='string'&&new RegExp('^'+prefix+'[a-f0-9]{64}$').test(value);
const revision=value=>plain(value)&&Number.isSafeInteger(value.revision)&&value.revision>=0&&hash(value.sha256);
export async function returnSha256(bytes){
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
export function assertReturnBindings(value){
  need(plain(value)&&/^research_[a-f0-9]{64}$/.test(value.workspaceId??'')&&
    /^d_[a-f0-9-]{36}$/.test(value.dossierId??'')&&nativeId(value.reviewId,'drv_')&&
    hash(value.comparisonSha256)&&revision(value.base)&&revision(value.current)&&revision(value.returned),
    'RETURN_BROWSER_SELECTION_INVALID');
  need(plain(value.source)&&nativeId(value.source.id,'drs_')&&
    value.source.id==='drs_'+value.source.sha256&&Number.isSafeInteger(value.source.bytes)&&value.source.bytes>0,
    'RETURN_BROWSER_SOURCE_INVALID');
  return value;
}
export function assertReturnRequest(value){
  need(plain(value)&&value.schema===RETURN_BROWSER_REQUEST&&plain(value.body),'RETURN_BROWSER_REQUEST_INVALID');
  assertReturnBindings(value);
  const body=value.body;
  need(Object.keys(body).every(key=>['requestId','reviewId','expectedRevision','comparisonSha256','reviewedBy','reviewNote','decisions'].includes(key)),
    'RETURN_BROWSER_REQUEST_INVALID');
  need(typeof value.requestId==='string'&&value.requestId.length>0&&value.requestId.length<=200&&
    body.requestId===value.requestId&&body.reviewId===value.reviewId&&
    body.comparisonSha256===value.comparisonSha256&&body.expectedRevision===value.current.revision&&
    typeof body.reviewedBy==='string'&&body.reviewedBy.trim().length>0&&body.reviewedBy.length<=512&&
    (body.reviewNote===undefined||typeof body.reviewNote==='string'&&body.reviewNote.length<=16000)&&Array.isArray(body.decisions),
    'RETURN_BROWSER_REQUEST_SELECTION_CHANGED');
  const ids=new Set();
  for(const item of body.decisions){
    need(plain(item)&&Object.keys(item).every(key=>['itemId','choice','value'].includes(key))&&nativeId(item.itemId,'dri_')&&!ids.has(item.itemId)&&
      ['CURRENT','RETURNED','EDIT'].includes(item.choice)&&
      (item.choice==='EDIT'?Object.hasOwn(item,'value'):!Object.hasOwn(item,'value')),
      'RETURN_BROWSER_DECISION_INVALID');
    ids.add(item.itemId);
  }
  need(new TextEncoder().encode(JSON.stringify(body)).length<=REQUEST_BYTES,'RETURN_BROWSER_REQUEST_TOO_LARGE');
  return value;
}
export function assertReturnReceipt(result,pending){
  assertReturnRequest(pending);
  const receipt=result?.return,body=pending.body;
  need(plain(receipt)&&nativeId(receipt.id,'drr_')&&receipt.requestId===body.requestId&&
    receipt.reviewId===body.reviewId&&receipt.sourceId===pending.source.id&&
    receipt.comparisonSha256===body.comparisonSha256&&
    receipt.revision===body.expectedRevision+1&&hash(receipt.revisionSha256)&&
    typeof receipt.reviewedAt==='string'&&Number.isFinite(Date.parse(receipt.reviewedAt))&&
    receipt.reviewedBy===body.reviewedBy&&receipt.reviewNote===(body.reviewNote??'')&&
    Array.isArray(receipt.decisions)&&returnCanonical(receipt.decisions)===returnCanonical(body.decisions)&&
    returnCanonical(receipt.current)===returnCanonical(pending.current)&&
    returnCanonical(receipt.base)===returnCanonical(pending.base)&&
    returnCanonical(receipt.returned)===returnCanonical(pending.returned)&&
    receipt.source?.id===pending.source.id&&receipt.source.sha256===pending.source.sha256&&
    receipt.source.bytes===pending.source.bytes,'RETURN_BROWSER_RECEIPT_CHANGED');
  return receipt;
}
export function assertReturnDraft(value){
  need(plain(value)&&value.schema===RETURN_BROWSER_DRAFT&&typeof value.id==='string'&&
    value.id.length>0&&value.id.length<=200&&typeof value.editId==='string'&&value.editId.length>0,
    'RETURN_BROWSER_DRAFT_INVALID');
  assertReturnBindings(value);
  need(plain(value.choices)&&typeof value.reviewedBy==='string'&&typeof value.reviewNote==='string',
    'RETURN_BROWSER_DRAFT_INVALID');
  if(value.pending){
    assertReturnRequest(value.pending);
    for(const key of ['workspaceId','dossierId','reviewId','comparisonSha256','source','base','current','returned'])
      need(returnCanonical(value[key])===returnCanonical(value.pending[key]),'RETURN_BROWSER_DRAFT_REQUEST_CHANGED');
  }
  return value;
}
let opened=null;
function database(){
  if(opened)return opened;
  opened=new Promise((resolve,reject)=>{
    let abandoned=false;
    const request=indexedDB.open(DATABASE,VERSION);
    const rejectOpen=error=>{abandoned=true;reject(error);};
    request.onupgradeneeded=()=>{
      const db=request.result;
      for(const name of ['drafts','requests','sources']){
        if(!db.objectStoreNames.contains(name)){
          const table=db.createObjectStore(name,{keyPath:'key'});table.createIndex('scope','scope');
        }
      }
    };
    request.onblocked=()=>rejectOpen(Object.assign(new Error('RETURN_BROWSER_DATABASE_BLOCKED'),{code:'RETURN_BROWSER_DATABASE_BLOCKED'}));
    request.onerror=()=>rejectOpen(request.error);
    request.onsuccess=()=>{
      const db=request.result;if(abandoned){db.close();return;}
      db.onversionchange=()=>{db.close();opened=null;};resolve(db);
    };
  }).catch(error=>{opened=null;throw error;});
  return opened;
}
export function closeDossierReturnStorage(){
  const selected=opened;opened=null;if(selected)selected.then(db=>db.close()).catch(()=>{});
}
function pendingInput(value){
  const {schema,workspaceId,dossierId,reviewId,comparisonSha256,source,base,current,returned,requestId,body,draftId}=value;
  return {schema,workspaceId,dossierId,reviewId,comparisonSha256,source,base,current,returned,requestId,body,draftId};
}
export function createDossierReturnDraftStore({workspaceId,dossierId}){
  need(/^research_[a-f0-9]{64}$/.test(workspaceId??'')&&/^d_[a-f0-9-]{36}$/.test(dossierId??''),
    'RETURN_BROWSER_SCOPE_INVALID');
  const scope=JSON.stringify([workspaceId,dossierId]),key=id=>JSON.stringify([workspaceId,dossierId,id]);
  const scoped=value=>{
    need(value.workspaceId===workspaceId&&value.dossierId===dossierId,'RETURN_BROWSER_SCOPE_CHANGED');return value;
  };
  const transaction=async(names,mode,work)=>{
    const db=await database();
    return new Promise((resolve,reject)=>{
      let value,failure,done=false;
      const tx=db.transaction(names,mode),tables=Object.fromEntries(names.map(name=>[name,tx.objectStore(name)]));
      const stop=error=>{failure=error;try{tx.abort();}catch{}};
      const finish=result=>{value=result;done=true;};
      tx.oncomplete=()=>done?resolve(value):reject(new Error('RETURN_BROWSER_TRANSACTION_INCOMPLETE'));
      tx.onabort=()=>reject(failure??tx.error??new Error('RETURN_BROWSER_TRANSACTION_ABORTED'));
      tx.onerror=()=>{failure??=tx.error;};
      try{work(tables,finish,stop);}catch(error){stop(error);}
    });
  };
  const read=(name,id)=>transaction([name],'readonly',(tables,finish,stop)=>{
    const get=tables[name].get(key(id));get.onerror=()=>stop(get.error);
    get.onsuccess=()=>finish(get.result?returnClone(get.result):null);
  });
  const list=name=>transaction([name],'readonly',(tables,finish,stop)=>{
    const get=tables[name].index('scope').getAll(scope);get.onerror=()=>stop(get.error);
    get.onsuccess=()=>finish(get.result.map(row=>returnClone(row)));
  });
  return {
    readDraft:id=>read('drafts',id),
    listDrafts:()=>list('drafts'),
    async saveDraft(value,{expectedVersion=0}={}){
      scoped(assertReturnDraft(value));const snapshot=returnClone(value);
      need(Number.isSafeInteger(expectedVersion)&&expectedVersion>=0,'RETURN_BROWSER_DRAFT_VERSION_INVALID');
      return transaction(['drafts'],'readwrite',({drafts},finish,stop)=>{
        const get=drafts.get(key(value.id));get.onerror=()=>stop(get.error);
        get.onsuccess=()=>{try{
          const prior=get.result;
          if(prior&&returnCanonical(prior.value)===returnCanonical(snapshot)){finish(returnClone(prior));return;}
          if(prior?.value.pendingRequestId)fail('RETURN_BROWSER_PENDING_LOCKED',{record:returnClone(prior)});
          if(prior)for(const field of ['workspaceId','dossierId','reviewId','comparisonSha256','source','base','current','returned'])
            need(returnCanonical(prior.value[field])===returnCanonical(snapshot[field]),'RETURN_BROWSER_DRAFT_SELECTION_CHANGED');
          need((prior?.version??0)===expectedVersion,'RETURN_BROWSER_DRAFT_CONFLICT',{record:prior?returnClone(prior):null});
          const record={key:key(value.id),scope,id:value.id,version:expectedVersion+1,value:snapshot};
          drafts.put(record);finish(returnClone(record));
        }catch(error){stop(error);}};
      });
    },
    readPending:id=>read('requests',id),
    listPending:()=>list('requests'),
    async preparePending(value,draft,{expectedVersion}={}){
      scoped(assertReturnRequest(value));scoped(assertReturnDraft(draft));
      need(value.draftId===draft.id&&draft.reviewId===value.reviewId,'RETURN_BROWSER_DRAFT_REQUEST_CHANGED');
      const pending=returnClone(value),snapshot=returnClone(draft);
      return transaction(['requests','drafts'],'readwrite',({requests,drafts},finish,stop)=>{
        const req=requests.get(key(pending.requestId));req.onerror=()=>stop(req.error);
        req.onsuccess=()=>{try{
          if(req.result)need(returnCanonical(pendingInput(req.result.value))===returnCanonical(pendingInput(pending)),
            'RETURN_BROWSER_REQUEST_CONFLICT');
          const get=drafts.get(key(draft.id));get.onerror=()=>stop(get.error);
          get.onsuccess=()=>{try{
            const prior=get.result;
            if(req.result&&prior?.value.pendingRequestId===pending.requestId){
              finish({pending:returnClone(req.result),draft:returnClone(prior)});return;
            }
            need(prior&&prior.version===expectedVersion&&
              returnCanonical(prior.value)===returnCanonical(snapshot),'RETURN_BROWSER_DRAFT_CONFLICT',{record:prior?returnClone(prior):null});
            need(!prior.value.pendingRequestId,'RETURN_BROWSER_PENDING_LOCKED');
            const record={key:key(pending.requestId),scope,id:pending.requestId,value:{...pending,state:'PENDING'}};
            const saved={...prior,version:prior.version+1,value:{...snapshot,pendingRequestId:pending.requestId}};
            requests.put(record);drafts.put(saved);finish({pending:returnClone(record),draft:returnClone(saved)});
          }catch(error){stop(error);}};
        }catch(error){stop(error);}};
      });
    },
    notePending(id,{state,lastError}){
      need(['PENDING','OUTCOME_UNKNOWN','REJECTED'].includes(state),'RETURN_BROWSER_REQUEST_STATE_INVALID');
      return transaction(['requests'],'readwrite',({requests},finish,stop)=>{
        const get=requests.get(key(id));get.onerror=()=>stop(get.error);
        get.onsuccess=()=>{try{
          const prior=get.result;need(prior,'RETURN_BROWSER_REQUEST_NOT_FOUND');
          if(prior.value.state==='COMPLETE'){finish(returnClone(prior));return;}
          const record={...prior,value:{...prior.value,state,lastError:returnClone(lastError??null)}};
          requests.put(record);finish(returnClone(record));
        }catch(error){stop(error);}};
      });
    },
    async completePending(id,result){
      const selected=await read('requests',id);need(selected,'RETURN_BROWSER_REQUEST_NOT_FOUND');
      scoped(assertReturnRequest(selected.value));const receipt=returnClone(assertReturnReceipt(result,selected.value));
      return transaction(['requests'],'readwrite',({requests},finish,stop)=>{
        const get=requests.get(key(id));get.onerror=()=>stop(get.error);
        get.onsuccess=()=>{try{
          const prior=get.result;need(prior&&returnCanonical(pendingInput(prior.value))===returnCanonical(pendingInput(selected.value)),
            'RETURN_BROWSER_REQUEST_CONFLICT');
          if(prior.value.receipt)need(returnCanonical(prior.value.receipt)===returnCanonical(receipt),'RETURN_BROWSER_RECEIPT_CHANGED');
          const record={...prior,value:{...prior.value,state:'COMPLETE',receipt,
            completedAt:prior.value.completedAt??new Date().toISOString()}};
          requests.put(record);finish(returnClone(record));
        }catch(error){stop(error);}};
      });
    },
    readSource:id=>read('sources',id),
    async listSources(){return (await list('sources')).map(row=>({id:row.id,meta:row.value}));},
    async saveSource(meta,blob){
      scoped(meta);need(nativeId(meta.id,'drs_')&&meta.id==='drs_'+meta.sha256&&blob instanceof Blob&&
        blob.size===meta.bytes&&meta.bytes>0&&meta.bytes<=256*1024*1024,'RETURN_BROWSER_SOURCE_INVALID');
      return transaction(['sources'],'readwrite',({sources},finish,stop)=>{
        const get=sources.get(key(meta.id));get.onerror=()=>stop(get.error);
        get.onsuccess=()=>{try{
          const prior=get.result;
          if(prior){
            need(returnCanonical(prior.value)===returnCanonical(meta)&&prior.blob?.size===blob.size,'RETURN_BROWSER_SOURCE_CHANGED');
            finish({id:prior.id,meta:returnClone(prior.value)});return;
          }
          sources.put({key:key(meta.id),scope,id:meta.id,value:returnClone(meta),blob});
          finish({id:meta.id,meta:returnClone(meta)});
        }catch(error){stop(error);}};
      });
    },
  };
}
