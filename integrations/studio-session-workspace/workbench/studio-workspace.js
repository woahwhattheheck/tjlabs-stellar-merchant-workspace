function createStudioSessionWorkspace(api,codec){
"use strict";
const SCHEMA="tjlabs.studio-session-desk.v1",MAX=128*1024*1024,clone=x=>JSON.parse(JSON.stringify(x));
const keys=Object.keys(api.columns),plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const need=(x,m)=>{if(!x)throw Error(m)};
const hash=text=>codec.sha256(codec.utf8Encode(text));
function string(x,label){need(typeof x==="string",label+" must remain complete text");codec.utf8Encode(x);return x}
function blankSources(){return Object.fromEntries(keys.map(k=>[k,{name:k+".csv",text:api.columns[k].join(",")+"\r\n",receiptSha256:null}]))}
function draft(){return{id:"edition-"+Date.now(),label:"Source edition",receivedAt:new Date().toISOString(),notes:"",sources:blankSources()}}
function create(id,label){return{schema:SCHEMA,workspace:api.create({id,label}),session:{editionId:null,table:keys[0],sourceDraft:draft(),reviewDrafts:{},selectedAttention:null,receipts:[],notes:""}}}
function check(input){
 need(plain(input)&&input.schema===SCHEMA&&plain(input.session),"Open a complete Studio Session Workbench file");
 const value=clone(input);need(Object.keys(value).every(k=>["schema","workspace","session","nativeContinuation"].includes(k)),"Keep the declared complete workspace shape");
 value.workspace=api.reopen(value.workspace);const s=value.session;
 need(plain(s.sourceDraft)&&plain(s.sourceDraft.sources)&&keys.includes(s.table),"Retain the complete source draft and selected table");
 for(const k of ["id","label","receivedAt","notes"])string(s.sourceDraft[k],"Draft "+k);
 for(const k of keys){const f=s.sourceDraft.sources[k];need(plain(f),"Retain all eight original source drafts");string(f.name,"Source filename");string(f.text,"Source text");need(f.receiptSha256===null||/^[a-f0-9]{64}$/.test(f.receiptSha256),"Keep the original file receipt identity")}
 need(s.editionId===null||value.workspace.editions.some(e=>e.id===s.editionId),"Select an actual retained edition");need(s.selectedAttention===null||typeof s.selectedAttention==="string","Retain the selected attention");
 need(plain(s.reviewDrafts)&&Array.isArray(s.receipts),"Retain complete review drafts and original file receipts");
 for(const [key,r]of Object.entries(s.reviewDrafts)){string(key,"Review draft key");need(plain(r),"Keep complete review draft");for(const k of ["editionId","attentionId","disposition","reviewer","reason","evidence"])string(r[k],"Review "+k);need(r.previousReviewId===null||typeof r.previousReviewId==="string","Keep the original correction basis")}
 const seen=new Set();for(const r of s.receipts){need(plain(r)&&typeof r.dataBase64==="string"&&Array.isArray(r.names),"Retain the whole original file");const raw=codec.base64Decode(r.dataBase64);need(raw.length===r.bytes&&codec.sha256(raw)===r.sha256&&!seen.has(r.sha256),"Original file bytes or identity differ");seen.add(r.sha256);r.names.forEach(x=>string(x,"Original filename"));string(r.receivedAt,"File receipt time");string(r.error,"File intake error")}
 for(const k of keys){const h=s.sourceDraft.sources[k].receiptSha256;need(h===null||seen.has(h),"Keep the source draft's original file receipt")}
 string(s.notes,"Working notes");for(const k of ["labelDraft","newStudyLabel"])if(Object.hasOwn(s,k))string(s[k],"Unfinished "+k);
 if(Object.hasOwn(value,"nativeContinuation"))need(plain(value.nativeContinuation),"Keep the complete native continuation object");
 const raw=codec.utf8Encode(JSON.stringify(value));need(raw.length<=MAX,"Complete workspace exceeds128MiB; keep the existing file and split new work into a separately named study");
 return value
}
function serialize(v){return JSON.stringify(check(v),null,2)+"\n"}
function fingerprint(v){return hash(JSON.stringify(v))}
function receiveBytes(value,role,name,bytes,decoded,error=""){
 const v=check(value),s=v.session,sha256=codec.sha256(bytes);need(keys.includes(role),"Choose an original source table");
 let r=s.receipts.find(x=>x.sha256===sha256);if(!r){r={sha256,bytes:bytes.length,dataBase64:codec.base64Encode(bytes),names:[name],receivedAt:new Date().toISOString(),error};s.receipts.push(r)}else{if(!r.names.includes(name))r.names.push(name);if(error)r.error=error}
 if(decoded!==null){s.sourceDraft.sources[role]={name,text:decoded,receiptSha256:sha256}}
 return check(v)
}
function receive(value){const v=check(value),d=v.session.sourceDraft;v.workspace=api.receive(v.workspace,{id:d.id,label:d.label,receivedAt:d.receivedAt,notes:d.notes,sources:Object.fromEntries(keys.map(k=>[k,{name:d.sources[k].name,text:d.sources[k].text}]))});v.session.editionId=d.id;v.session.selectedAttention=null;return check(v)}
function reviewKey(editionId,attentionId){return JSON.stringify([editionId,attentionId])}
function reviewDraft(value,attention){
 const v=value,s=v.session,k=reviewKey(s.editionId,attention.id);return s.reviewDrafts[k]||{editionId:s.editionId,attentionId:attention.id,disposition:"investigate",reviewer:"",reason:"",evidence:"",previousReviewId:attention.review?.id||null}
}
return{SCHEMA,MAX,keys,create,check,serialize,fingerprint,receiveBytes,receive,reviewKey,reviewDraft,blankSources,clone};
}
