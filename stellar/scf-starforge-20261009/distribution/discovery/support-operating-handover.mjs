// MIT. Complete customer Support handovers over the maintained plan and return engines.
import {supportHandoverDigestFile} from './support-operating-handover-hash.mjs';
import {inspectOperatingPlan,receiveOperatingPlan} from './operating-plan.mjs';
import {inspectSupportOperatingSource} from './support-operating-plan.mjs';
import {createSupportOperatingReturn,inspectSupportOperatingReturn} from './support-operating-return.mjs';

export const SUPPORT_HANDOVER_SCHEMA='stellar-forge.support-operating-handover.v1';
export const SUPPORT_HANDOVER_DOCUMENT='HANDOVER.json';
export const SUPPORT_HANDOVER_MAX_DOCUMENT_BYTES=256*1024*1024;
export const SUPPORT_HANDOVER_MAX_ARCHIVE_BYTES=16*1024*1024*1024;
const HASH=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UTF8=new TextEncoder(), DECODE=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const clone=v=>JSON.parse(JSON.stringify(v));
const canonical=v=>Array.isArray(v)?v.map(canonical):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function supportHandoverError(code,message){return Object.assign(new TypeError(message),{code});}
const need=(v,message,code='SUPPORT_HANDOVER_INVALID')=>{if(!v)throw supportHandoverError(code,message);};
function exact(v,keys,label){need(plain(v)&&Object.keys(v).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(v,k)),label+' must retain exactly its declared fields.');}
function text(v,max,label,empty=false){need(typeof v==='string'&&v.length<=max&&(empty||v.trim())&&!v.includes('\0'),label+' is invalid.');return v;}
function time(v){text(v,100,'Creation time');need(Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v,'Use the frozen exact UTC ISO creation time.');return v;}
export function supportHandoverPath(value){
  need(typeof value==='string'&&UTF8.encode(value).length<=3000&&!/[\u0000-\u001f\u007f\\]/.test(value)&&!value.startsWith('/')&&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)&&value.split('/').every(p=>p&&p!=='.'&&p!=='..'),
    'Use an original relative regular-member path.','SUPPORT_HANDOVER_PATH');return value;
}
function ref(v,label='Artifact'){
  exact(v,['path','bytes','sha256'],label);supportHandoverPath(v.path);
  need(Number.isSafeInteger(v.bytes)&&v.bytes>0&&v.bytes<=4*1024*1024*1024&&HASH.test(v.sha256),label+' has an invalid complete byte identity.');
  return clone(v);
}
export const supportHandoverJSON=value=>JSON.stringify(value,null,2)+'\n';
const sourceKey=s=>JSON.stringify([s.id,s.capturedAt,s.case.id,s.case.revision]);
function selection(s){return {id:s.case.id,revision:s.case.revision,ancestors:s.case.ancestors};}
function prefix(a,b){
  return a.id===b.id&&a.createdAt===b.createdAt&&same(a.origin,b.origin)&&a.revisions.length<=b.revisions.length&&
    a.revisions.every((r,i)=>same(r,b.revisions[i]));
}
function companion(c,source,index){
  exact(c,['sourceIndex','sourceFile','manifestFile','manifest'],'Companion');
  need(c.sourceIndex===index,'Companions follow the exact source descriptor order.');
  const sf=ref(c.sourceFile),mf=ref(c.manifestFile),m=c.manifest;
  need(sf.path==='SOURCE.json'&&mf.path==='MANIFEST.json','Keep the original source and manifest filenames.');
  need(plain(m)&&m.schema==='stellar-forge.oauth-support-operating-package.v1'&&same(m.source,sf)&&same(m.case,selection(source))&&Array.isArray(m.files),'Retain the complete original companion manifest and case selection.');
  need(m.files.length>0&&m.files.length<=310000,'Companion manifest member count exceeds the original source limit.');
  const names=new Set();let bytes=0;
  for(const original of m.files){const r=ref(original);need(!names.has(r.path)&&r.path!=='MANIFEST.json','Companion manifest repeats or replaces a member.');names.add(r.path);bytes+=r.bytes;}
  need(bytes===m.bytes&&bytes<=4*1024*1024*1024&&m.files.some(r=>same(r,sf)),'The complete original companion inventory differs from its total/source.');
  return clone(c);
}
/** Validates full editable histories and exact inventory; native CaseStore provenance is verified by its original receiver. */
export async function inspectSupportOperatingHandover(input){
  exact(input,['schema','id','title','owner','createdAt','plan','sources','returns','companions'],'Support handover');
  need(input.schema===SUPPORT_HANDOVER_SCHEMA&&ID.test(input.id),'Use a stable Support handover ID.');
  text(input.title,1000,'Handover title');text(input.owner,300,'Preparing operator');time(input.createdAt);
  need(UTF8.encode(JSON.stringify(input)).length<=SUPPORT_HANDOVER_MAX_DOCUMENT_BYTES,'The complete editable handover document exceeds 256 MiB.');
  const plan=inspectOperatingPlan(input.plan);
  need(Array.isArray(input.sources)&&input.sources.length>0&&input.sources.length<=100,'Retain all selected original source descriptors.');
  const sources=input.sources.map(inspectSupportOperatingSource);
  need(new Set(sources.map(sourceKey)).size===sources.length,'A source descriptor selection is repeated.');
  // The unchanged Support adapter verifies every result and carried file in every saved revision.
  await createSupportOperatingReturn(plan,plan,{sources,id:'handover-validation',reviewer:input.owner,notes:'',createdAt:input.createdAt});
  need(Array.isArray(input.returns)&&input.returns.length<=100,'Retain complete selected returned-work reviews.');
  const reviews=[],ids=new Set();
  for(const item of input.returns){
    const value=await inspectSupportOperatingReturn(item),r=value.review;
    need(!ids.has(r.id),'Each original return review appears once.');ids.add(r.id);
    need([r.current,r.incoming].every(p=>p.id===plan.id&&p.createdAt===plan.createdAt&&same(p.origin,plan.origin)&&same(p.revisions[0],plan.revisions[0])),
      'A return review belongs to another original plan.');
    need(value.sources.every(s=>sources.some(t=>same(s,t))),'Retain every exact descriptor used by each review.');
    if(r.completion)need(prefix(r.completion.plan,plan),'The exported plan must retain the completed review result and any later compatible work.');
    reviews.push(value);
  }
  need(Array.isArray(input.companions)&&input.companions.length===sources.length,'Every referenced source needs its complete original native companion.');
  const companions=input.companions.map((c,i)=>companion(c,sources[i],i));
  const value={schema:SUPPORT_HANDOVER_SCHEMA,id:input.id,title:input.title,owner:input.owner,createdAt:input.createdAt,plan,sources,returns:reviews,companions};
  const files=supportHandoverMembers(value);
  need(files.length<=620000&&files.reduce((n,f)=>n+f.bytes,0)<=SUPPORT_HANDOVER_MAX_ARCHIVE_BYTES-SUPPORT_HANDOVER_MAX_DOCUMENT_BYTES,
    'The complete selected handover exceeds its explicit member or total byte limit.');
  return value;
}
export async function createSupportOperatingHandover({id,title,owner,createdAt,plan,sources,returns:reviews=[],companions}){
  return inspectSupportOperatingHandover({schema:SUPPORT_HANDOVER_SCHEMA,id,title,owner,createdAt,plan,sources,returns:reviews,companions});
}
/** Every companion includes its original SOURCE and MANIFEST, all revisions, native delivery and unselected original members. */
export function supportHandoverMembers(value){
  const files=[];
  for(const c of value.companions){
    const prefix='companions/'+c.sourceIndex+'/';
    for(const r of [...c.manifest.files,c.manifestFile])files.push({path:prefix+r.path,bytes:r.bytes,sha256:r.sha256});
  }
  files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  for(let i=1;i<files.length;i++)need(files[i-1].path!==files[i].path,'The portable inventory repeats a member.');
  return files;
}
export async function receiveSupportOperatingHandover(value,existing=null){
  const handover=await inspectSupportOperatingHandover(value);
  return {...receiveOperatingPlan(handover.plan,existing),handover};
}
const digest=supportHandoverDigestFile;
export async function supportHandoverFileIdentity(path,blob,{digestFile=digest,signal}={}){
  signal?.throwIfAborted();supportHandoverPath(path);
  need(blob&&Number.isSafeInteger(blob.size)&&blob.size>0&&typeof blob.slice==='function','Choose a complete file or Blob.');
  const sha256=await digestFile(blob,signal);signal?.throwIfAborted();need(HASH.test(sha256),'The complete member digest is invalid.');
  return {path,bytes:blob.size,sha256};
}
/** read(path) returns the actual File/Blob. Exact bytes are checked before a consumer adopts the ordinary plan. */
export async function verifySupportOperatingHandover(value,read,{digestFile=digest,signal}={}){
  const handover=await inspectSupportOperatingHandover(value),files=supportHandoverMembers(handover);
  for(const item of files){
    signal?.throwIfAborted();const file=await read(item.path);
    need(file&&file.size===item.bytes,'Missing or changed complete member: '+item.path,'SUPPORT_HANDOVER_MEMBER');
    need(same(await supportHandoverFileIdentity(item.path,file,{digestFile,signal}),item),'Changed member bytes: '+item.path,'SUPPORT_HANDOVER_DIGEST');
  }
  for(const c of handover.companions){
    const root='companions/'+c.sourceIndex+'/';
    for(const [name,expected]of [['SOURCE.json',handover.sources[c.sourceIndex]],['MANIFEST.json',c.manifest]]){
      signal?.throwIfAborted();const file=await read(root+name);
      need(file.size<=32*1024*1024,'Original companion JSON exceeds its own input limit.');
      let parsed;try{parsed=JSON.parse(DECODE.decode(await file.arrayBuffer()));}catch{throw supportHandoverError('SUPPORT_HANDOVER_JSON','Original '+name+' is not complete UTF-8 JSON.');}
      need(same(parsed,expected),'The original '+name+' differs from the reviewed handover selection.');
    }
  }
  return {handover,files,memberCount:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),verification:'COMPLETE_ORIGINAL_MEMBER_BYTES'};
}
function html(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export async function renderSupportOperatingHandoverHTML(value){
  const h=await inspectSupportOperatingHandover(value),files=supportHandoverMembers(h);
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+html(h.title)+'</title><style>body{font:16px system-ui;max-width:1000px;margin:2rem auto;padding:1rem;color:#222}table{border-collapse:collapse;width:100%}td,th{padding:.5rem;border:1px solid #aaa;text-align:left;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1,h2{line-height:1.2}</style><h1>'+html(h.title)+'</h1><p>'+html(h.owner)+' · '+html(h.createdAt)+'</p><p>Original plan '+html(h.plan.id)+' · '+h.plan.revisions.length+' saved revisions · '+h.returns.length+' returned-work reviews · '+h.sources.length+' complete source companions.</p><p>The archive retains the complete editable plan and review histories, all carried files, and every listed original source member. The native receiver additionally checks each complete case history through its original source engine.</p><table><thead><tr><th>Original member</th><th>Bytes</th><th>SHA-256</th></tr></thead><tbody>'+files.map(f=>'<tr><td>'+html(f.path)+'</td><td>'+f.bytes+'</td><td>'+f.sha256+'</td></tr>').join('')+'</tbody></table><details><summary>Complete editable handover document</summary><pre>'+html(supportHandoverJSON(h))+'</pre></details></html>\n';
}
