// MIT. Complete local Grant intake working files; no native actions.
import {sha256Bytes,sha256Text} from "./awards-import-hash.mjs";
export const WORKING_SCHEMA="stellar-forge.awards-intake-working-file.v1";
const RECORD_SCHEMA="stellar-forge.awards-intake-working-record.v1",MAX_FILE=512*1024*1024,MAX_SOURCE=64*1024*1024;
const need=(v,m)=>{if(!v)throw new Error(m);},plain=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const clone=v=>JSON.parse(JSON.stringify(v));
const sorted=v=>Array.isArray(v)?v.map(sorted):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const text=v=>JSON.stringify(sorted(v));
const hex=v=>typeof v==="string"&&/^[0-9a-f]{64}$/.test(v);
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const identity=p=>plain(p)&&typeof p.id==="string"&&p.id&&Number.isSafeInteger(p.revision)&&p.revision>0&&hex(p.snapshot);
const date=s=>typeof s==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
function json(value){
  const seen=new Set();
  const walk=(v,depth)=>{
    need(depth<100,"The complete working state is nested too deeply.");
    if(v===null||typeof v==="string"||typeof v==="boolean")return;
    if(typeof v==="number"){need(Number.isFinite(v),"Working numbers must be finite.");return;}
    need(typeof v==="object"&&!seen.has(v),"Keep complete JSON values without cycles.");
    need(Array.isArray(v)||Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null,"Keep plain working objects.");
    seen.add(v);for(const x of Object.values(v))walk(x,depth+1);seen.delete(v);
  };walk(value,0);return clone(value);
}
export function validateIntakeWork(value){
  const w=json(value);
  need(plain(w)&&["file","mapping","rows","identities","session","review"].includes(w.stage),"Keep the original intake stage.");
  for(const key of ["filename","roundId","actor","status","operationId","documentId","sessionId","reviewId","reviewDocumentId","rowFilter","rowSearch"])
    need(typeof w[key]==="string","Keep the literal intake field: "+key+".");
  need(plain(w.mapping)&&plain(w.identities),"Keep complete mappings and programme identities.");
  need(Array.isArray(w.batchDocumentIds)&&w.batchDocumentIds.length>0&&w.batchDocumentIds.length<=25000&&w.batchDocumentIds.every(uuid)&&new Set(w.batchDocumentIds).size===w.batchDocumentIds.length,"Keep the original allocated batch identities.");
  need([w.documentId,w.sessionId,w.reviewId,w.reviewDocumentId].every(uuid)&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,149}$/.test(w.operationId),"Keep original review and request identities.");
  need(Number.isSafeInteger(w.rowOffset)&&w.rowOffset>=0,"Keep the original row position.");
  need(w.rowDecisions===null||Array.isArray(w.rowDecisions)&&w.rowDecisions.length<=25000&&w.rowDecisions.every((r,i)=>
    plain(r)&&r.rowIndex===i&&["pending","accepted","exception","non_application"].includes(r.disposition)&&typeof r.reason==="string"&&
    uuid(r.applicationId)&&plain(r.corrections)&&plain(r.correctionDrafts??{})&&
    Object.values(r.corrections).every(x=>typeof x==="string")&&Object.values(r.correctionDrafts??{}).every(x=>typeof x==="string")),
    "Keep every original row decision and inactive correction.");
  for(const key of ["plan","session","batch","rowReview"])need(w[key]===null||plain(w[key]),"Keep the complete original "+key+".");
  if(w.continuation!==undefined&&w.continuation!==null){
    need(plain(w.continuation)&&w.continuation.schema==="stellar-forge.awards-csv-completed-continuation.v1"&&hex(w.continuation.sha256)&&uuid(w.continuationDocumentId),
      "Keep the complete prior session, original outcomes and allocated evidence document.");
    need(w.continuationWorking===undefined||w.continuationWorking===null||plain(w.continuationWorking),
      "Retain the preceding complete unfinished working state.");
  }
  // Unfinished literal fields can be temporarily invalid. Original preparation
  // validators run again before review or any native submission.
  return w;
}
function descriptor(source){
  need(plain(source)&&hex(source.sha256)&&Number.isSafeInteger(source.bytes)&&source.bytes>0&&source.bytes<=MAX_SOURCE&&typeof source.filename==="string","Keep the complete original CSV identity.");
  return {sha256:source.sha256,bytes:source.bytes,filename:source.filename};
}
export function verifyIntakeSource(source,bytes){
  descriptor(source);need(bytes instanceof Uint8Array&&bytes.length===source.bytes&&sha256Bytes(bytes)===source.sha256,"The original CSV bytes differ from this working copy.");
  return bytes;
}
export function createIntakeRecord({id,label,workspaceId,portfolio,source,work,now=new Date().toISOString()}){
  need(uuid(id)&&typeof label==="string"&&label.length<=4000&&typeof workspaceId==="string"&&workspaceId&&identity(portfolio)&&date(now),"Keep complete workspace, portfolio and working-copy identities.");
  return {schema:RECORD_SCHEMA,id,label,workspaceId,portfolio:clone(portfolio),source:descriptor(source),
    createdAt:now,updatedAt:now,revision:1,work:validateIntakeWork(work),checkpoints:[]};
}
export function validateIntakeRecord(value){
  const r=json(value);
  need(r.schema===RECORD_SCHEMA&&uuid(r.id)&&typeof r.label==="string"&&r.label.length<=4000&&typeof r.workspaceId==="string"&&r.workspaceId&&identity(r.portfolio)&&
    date(r.createdAt)&&date(r.updatedAt)&&Number.isSafeInteger(r.revision)&&r.revision>0,"Keep the complete local working record.");
  descriptor(r.source);r.work=validateIntakeWork(r.work);
  need(Array.isArray(r.checkpoints),"Keep every retained checkpoint.");
  const ids=new Set();for(const c of r.checkpoints){
    need(plain(c)&&uuid(c.id)&&!ids.has(c.id)&&typeof c.label==="string"&&c.label.length<=4000&&date(c.createdAt),"Keep distinct original checkpoint identities.");
    ids.add(c.id);c.work=validateIntakeWork(c.work);
  }
  return r;
}
export function updateIntakeRecord(value,work,{label,checkpointId,checkpointLabel="Retained working copy",now=new Date().toISOString()}={}){
  const r=validateIntakeRecord(value);need(date(now),"Use an exact UTC save time.");
  if(checkpointId){
    need(uuid(checkpointId)&&!r.checkpoints.some(c=>c.id===checkpointId)&&typeof checkpointLabel==="string"&&checkpointLabel.length<=4000,"Keep a unique checkpoint.");
    r.checkpoints.push({id:checkpointId,label:checkpointLabel,createdAt:now,work:clone(r.work)});
  }
  if(label!==undefined){need(typeof label==="string"&&label.length<=4000,"Use a working label up to 4,000 characters.");r.label=label;}
  r.work=validateIntakeWork(work);r.revision++;r.updatedAt=now;return r;
}
const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64(bytes){
  const chunks=[];let out="";
  for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=bytes[i+1],c=bytes[i+2],n=(a<<16)|((b??0)<<8)|(c??0);
    out+=alphabet[n>>>18]+alphabet[(n>>>12)&63]+(b===undefined?"=":alphabet[(n>>>6)&63])+(c===undefined?"=":alphabet[n&63]);
    if(out.length>=65536){chunks.push(out);out="";}}
  chunks.push(out);return chunks.join("");
}
function unbase64(s){
  need(typeof s==="string"&&s.length%4===0&&s.length<=Math.ceil(MAX_SOURCE/3)*4,"Keep a complete canonical original CSV encoding.");
  const pad=s.endsWith("==")?2:s.endsWith("=")?1:0,n=s.length/4*3-pad,b=new Uint8Array(n);let at=0;
  for(let i=0;i<s.length;i+=4){
    const a=alphabet.indexOf(s[i]),c=alphabet.indexOf(s[i+1]),d=s[i+2]==="="?0:alphabet.indexOf(s[i+2]),e=s[i+3]==="="?0:alphabet.indexOf(s[i+3]);
    need(a>=0&&c>=0&&d>=0&&e>=0&&(!s.slice(i,i+4).includes("=")||i===s.length-4),"The original CSV encoding is malformed.");
    const v=(a<<18)|(c<<12)|(d<<6)|e;b[at++]=v>>>16;if(at<n)b[at++]=(v>>>8)&255;if(at<n)b[at++]=v&255;
  }
  need(base64(b)===s,"Keep the canonical complete CSV encoding.");return b;
}
export function encodeIntakeWorkingFile(record,csv){
  const r=validateIntakeRecord(record);verifyIntakeSource(r.source,csv);
  const file={schema:WORKING_SCHEMA,record:r,csvBase64:base64(csv)},sha256=sha256Text(text(file));
  const bytes=new TextEncoder().encode(JSON.stringify({...file,sha256})+"\n");
  need(bytes.length<=MAX_FILE,"The complete working file exceeds 512 MiB. Keep the local record and its original CSV.");
  return bytes;
}
export function parseIntakeWorkingFile(bytes){
  need(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=MAX_FILE,"Choose a complete working file up to 512 MiB.");
  const file=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)),{sha256,...value}=file;
  need(value.schema===WORKING_SCHEMA&&hex(sha256)&&sha256Text(text(value))===sha256,"The complete working-file content has changed.");
  const record=validateIntakeRecord(value.record),csv=unbase64(value.csvBase64);verifyIntakeSource(record.source,csv);
  return {record,csv,sha256};
}
export function compareIntakeContext(record,{workspaceId,portfolio}){
  const r=validateIntakeRecord(record),sameWorkspace=r.workspaceId===workspaceId,samePortfolio=r.portfolio.id===portfolio?.id,
    sameBasis=samePortfolio&&r.portfolio.revision===portfolio.revision&&r.portfolio.snapshot===portfolio.snapshot;
  return {sameWorkspace,samePortfolio,sameBasis,canRestore:sameWorkspace&&samePortfolio&&(sameBasis||Boolean(r.work.session)),
    message:!sameWorkspace?"This copy belongs to a different native workspace.":!samePortfolio?"Select its original portfolio.":
      !sameBasis&&!r.work.session?"Select its exact original portfolio revision before restoring unfinished review.":"Original data can be inspected; saved sessions are reconciled before continuation."};
}
export function createIntakeLibrary({indexedDB:provider=globalThis.indexedDB,name="stellar-grant-intake-working-v1"}={}){
  let opening;
  function database(){
    need(provider&&typeof provider.open==="function","Local working storage is unavailable. Download the complete current working file.");
    return opening??=(new Promise((resolve,reject)=>{
      const request=provider.open(name,1);
      request.onupgradeneeded=()=>{const db=request.result;for(const store of ["records","sources","index"])if(!db.objectStoreNames.contains(store))db.createObjectStore(store,{keyPath:"id"});};
      request.onerror=()=>reject(request.error||new Error("Local working storage did not open."));
      request.onblocked=()=>reject(new Error("Another tab is holding the working library open. Keep this work and close the older tab."));
      request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();opening=null;};resolve(request.result);};
    })).catch(error=>{opening=null;throw error;});
  }
  async function transaction(stores,mode,fn){
    const db=await database();return new Promise((resolve,reject)=>{
      const tx=db.transaction(stores,mode);let value,error;
      tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(error||tx.error||new Error("Local working save was not committed."));tx.onerror=()=>{};
      try{fn(tx,x=>{value=x;},e=>{error=e;tx.abort();});}catch(e){error=e;tx.abort();}
    });
  }
  const summary=r=>({id:r.id,label:r.label,workspaceId:r.workspaceId,portfolio:r.portfolio,source:r.source,updatedAt:r.updatedAt,revision:r.revision,stage:r.work.stage,checkpoints:r.checkpoints.length});
  return {
    async list(workspaceId,portfolioId){
      return transaction(["index"],"readonly",(tx,done)=>{const q=tx.objectStore("index").getAll();q.onsuccess=()=>done(q.result.filter(r=>r.workspaceId===workspaceId&&r.portfolio.id===portfolioId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id)));});
    },
    async get(id){
      const r=await transaction(["records"],"readonly",(tx,done)=>{const q=tx.objectStore("records").get(id);q.onsuccess=()=>done(q.result??null);});
      return r===null?null:validateIntakeRecord(r);
    },
    async source(sha256){
      const found=await transaction(["sources"],"readonly",(tx,done)=>{const q=tx.objectStore("sources").get(sha256);q.onsuccess=()=>done(q.result??null);});
      need(found,"The complete original source is missing from local storage.");const bytes=new Uint8Array(found.bytes);
      need(sha256Bytes(bytes)===sha256,"The locally retained original source changed.");return bytes;
    },
    async put(value,{expectedRevision=null,csv}={}){
      const r=validateIntakeRecord(value);if(csv)verifyIntakeSource(r.source,csv);
      return transaction(["records","sources","index"],"readwrite",(tx,done,fail)=>{
        const records=tx.objectStore("records"),sources=tx.objectStore("sources"),q=records.get(r.id);
        q.onsuccess=()=>{
          const old=q.result;
          if(expectedRevision===null?Boolean(old):!old||old.revision!==expectedRevision){fail(new Error("This working copy changed in another tab. Keep the current work as a separate copy."));return;}
          if(old&&r.revision!==old.revision+1){fail(new Error("Keep the next local working revision."));return;}
          if(old&&(r.checkpoints.length<old.checkpoints.length||old.checkpoints.some((c,i)=>text(c)!==text(r.checkpoints[i])))){fail(new Error("Retained checkpoints cannot be removed or changed."));return;}
          if(old&&(old.workspaceId!==r.workspaceId||text(old.portfolio)!==text(r.portfolio)||text(old.source)!==text(r.source))){fail(new Error("The original working-copy context cannot be replaced."));return;}
          const src=sources.get(r.source.sha256);src.onsuccess=()=>{
            if(!src.result&&!csv){fail(new Error("Save the complete original CSV before its working state."));return;}
            if(src.result&&src.result.bytes.byteLength!==r.source.bytes){fail(new Error("The saved original source has a conflicting size."));return;}
            if(!src.result)sources.add({id:r.source.sha256,bytes:csv.slice().buffer});
            records.put(r);tx.objectStore("index").put(summary(r));done(clone(r));
          };
        };
      });
    }
  };
}
