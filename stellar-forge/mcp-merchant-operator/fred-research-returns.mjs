// MIT. Customer returns use the original economic project and retained native transaction.
import { createHash } from 'node:crypto';
import { canonical, key, text, need } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/research/model.mjs';
export const RESEARCH_RETURN_MAX_BYTES = 256 * 1024 * 1024;
export const RESEARCH_RETURN_REQUEST_BYTES = Math.ceil(RESEARCH_RETURN_MAX_BYTES / 3) * 4 + 1024 * 1024;
export const RESEARCH_RETURN_KINDS = Object.freeze({
 createResearchReturn:'research-return-create', importResearchReturn:'research-return-import',
 saveResearchReturnDraft:'research-return-draft-save', applyResearchReturn:'research-return-apply'
});
const HASH=/^[a-f0-9]{64}$/, OP=/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const researchReturnInput=v=>{need(plain(v),'Use a complete Research return selection.');return JSON.parse(JSON.stringify(v));};
const hash=(v,label)=>{need(HASH.test(v??''),'Keep the complete original '+label+'.');return v;};
const revision=(v,zero=false)=>{need(Number.isSafeInteger(v)&&v>=(zero?0:1),'Keep the original '+(zero?'draft':'project')+' revision.');return v;};
export function researchReturnSelection(v) {const input=researchReturnInput(v);hash(input.returnId,'customer return identity');return input;}
export function researchReturnChoices(v) {
 const input=researchReturnSelection(v);hash(input.comparisonSha256,'comparison identity');
 need(plain(input.choices),'Choose each compared field explicitly.');
 for(const [field,value] of Object.entries(input.choices)){
  need(field.length<=400&&/^(product|requirement|source)\/.+/.test(field)&&['issued','current','returned'].includes(value),
   'Use a compared field and one of its original issued, current or returned values.');
 }
 need(Array.isArray(input.order)&&input.order.length<=100&&new Set(input.order).size===input.order.length,
  'Keep the explicit ordered requirement identities.');
 input.order.forEach(key);return input;
}
export function researchReturnAction(action,value) {
 const input=researchReturnInput(value);
 need(OP.test(input.id??''),'Keep the original operation ID.');revision(input.expectedRevision);
 need(Object.values(RESEARCH_RETURN_KINDS).includes(action),'Choose an original Research return action.');
 if(input.resume===true)return {id:input.id,expectedRevision:input.expectedRevision,resume:true};
 if(action==='research-return-create')return {id:input.id,expectedRevision:input.expectedRevision,
  packageSha256:hash(input.packageSha256,'received Research package'),author:text(input.author,200,true),note:text(input.note??'',12000)};
 if(action==='research-return-import'){
  need(typeof input.bodyBase64==='string'&&input.bodyBase64.length<=Math.ceil(RESEARCH_RETURN_MAX_BYTES/3)*4,
   'Receive one complete original Research return within 256 MiB.');
  const bytes=Buffer.from(input.bodyBase64,'base64');
  need(bytes.length>0&&bytes.length<=RESEARCH_RETURN_MAX_BYTES&&bytes.toString('base64')===input.bodyBase64,
   'The original Research return encoding changed.');
  return {id:input.id,expectedRevision:input.expectedRevision,filename:text(input.filename,180,true),bodyBase64:input.bodyBase64};
 }
 const selected=researchReturnChoices(input);revision(input.expectedDraftRevision,true);
 return {id:input.id,expectedRevision:input.expectedRevision,returnId:selected.returnId,
  expectedDraftRevision:input.expectedDraftRevision,comparisonSha256:selected.comparisonSha256,
  choices:selected.choices,order:selected.order,note:text(input.note??'',12000),label:text(input.label??'',200)};
}
export function researchReturnEnvelope(value,projectId,{returnId,expectedRevision}={}) {
 need(plain(value)&&value.projectId===projectId&&Number.isSafeInteger(value.revision)&&value.revision>=1,
  'The Research return response belongs to another original project.');
 if(returnId!==undefined)need(value.returnId===returnId,'The selected original Research return changed.');
 if(expectedRevision!==undefined)need(value.revision===expectedRevision,
  'The original project changed; reopen this Research return view.');
 return value;
}
export function researchReturnsQuery(value={}) {
 const input=researchReturnInput(value),section=input.section??'received',offset=input.offset??0,limit=input.limit??20;
 need(['received','sent','drafts','adoptions'].includes(section)&&Number.isSafeInteger(offset)&&offset>=0&&
  Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'Choose a supported Research return page.');
 if(offset>0)revision(input.expectedRevision);
 return new URLSearchParams({section,offset:String(offset),limit:String(limit)});
}
export function researchReturnsPage(value,input,projectId) {
 const q=researchReturnsQuery(input);researchReturnEnvelope(value,projectId,input);
 need(value.section===q.get('section')&&value.offset===Number(q.get('offset'))&&value.limit===Number(q.get('limit'))&&
  Array.isArray(value.rows)&&Number.isSafeInteger(value.total)&&value.total>=value.offset&&
  value.rows.length===Math.min(value.limit,value.total-value.offset)&&
  value.nextOffset===(value.offset+value.rows.length<value.total?value.offset+value.rows.length:null),
  'The complete Research return inventory page changed.');
 return value;
}
export function researchReturnMember(view,input) {
 input=researchReturnSelection(input);
 need(['packet','original-package','source'].includes(input.file??'packet'),'Choose an original return member.');
 const file=input.file??'packet';
 if(file==='source')hash(input.sourceId,'returned source identity');
 const member=view.files?.find(x=>x.file===file&&(file!=='source'||x.sourceId===input.sourceId));
 need(member&&HASH.test(member.sha256??'')&&Number.isSafeInteger(member.bytes)&&member.bytes>0&&typeof member.filename==='string',
  'Choose a complete member listed by this original customer return.');
 return member;
}
export function researchReturnJSON(value,selection) {
 const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n'),sha256=createHash('sha256').update(bytes).digest('hex');
 return {projectId:value.projectId,name:'research-return-'+selection.returnId+'-'+selection.view+'.json',
  type:'application/json; charset=utf-8',status:200,bytes,sha256};
}
export function researchReturnAgentPage(value,input,kind) {
 const offset=input.offset??0,limit=input.limit??20;
 need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,
  'Choose a complete Research return page.');
 const viewSha256=createHash('sha256').update(canonical(value)).digest('hex');
 need((offset===0||input.expectedViewSha256)&&
  (input.expectedViewSha256===undefined||input.expectedViewSha256===viewSha256),
  'Continue this original return view with its returned expectedViewSha256.');
 const section=input.section??(kind==='compare'?'items':kind==='work'?'fields':'files');
 let rows;
 if(kind==='compare'&&section==='items')rows=value.items;
 else if(kind==='detail'&&section==='files')rows=value.files;
 else {
  need(section==='fields','Choose a complete original return collection.');
  const selected=kind==='work'?value.work:value;
  rows=Object.entries(selected).filter(([key])=>!['projectId','revision','returnId','files','items'].includes(key))
   .map(([field,value])=>({field,value}));
 }
 need(Array.isArray(rows)&&offset<=rows.length,'Choose a retained original return collection.');
 const items=[];let bytes=0;
 for(const item of rows.slice(offset,offset+limit)){
  const size=Buffer.byteLength(JSON.stringify(item));
  need(size<=700000||items.length>0,'This complete record needs a research-return-view download through retained file reads.');
  if(bytes+size>700000)break;items.push(item);bytes+=size;
 }
 return {projectId:value.projectId,revision:value.revision,returnId:value.returnId,
  ...(value.comparisonSha256?{comparisonSha256:value.comparisonSha256}:{}),
  ...(kind==='compare'?{currentDefinitionId:value.currentDefinitionId,orders:value.orders,
    draft:value.draft?{revision:value.draft.revision,workId:value.draft.workId,comparisonSha256:value.draft.comparisonSha256,stale:value.draft.stale}:null}:{}),
  ...(kind==='work'?{draftRevision:value.work.revision,workId:value.work.id}:{}),
  section,viewSha256,total:rows.length,offset,limit,returned:items.length,
  nextOffset:offset+items.length<rows.length?offset+items.length:null,items,
  completeFile:{kind:'research-return-view',returnId:value.returnId,view:kind,...(kind==='work'?{revision:value.work.revision}:{})}};
}
