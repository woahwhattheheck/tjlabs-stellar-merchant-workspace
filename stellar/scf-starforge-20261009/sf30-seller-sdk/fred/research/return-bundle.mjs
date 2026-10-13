// MIT. Every research return and saved comparison travels with the original complete project.
import { resolve,join } from 'node:path';
import { privateDirectory, atomicJson, readPrivateJson } from '../../routescan/quota.mjs';
import { readBytes, writeBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { need,canonical,sha,catalogue } from './model.mjs';
import { decodeResearchReturn,MAX_RESEARCH_RETURN_BYTES } from './return-codec.mjs';
import { exact,researchHash,researchReturnRecord,researchExchange,validateResearchExchangeState,
  validateResearchReturnWork,retainIssuedGraph,composeResearchReturn } from './return-model.mjs';
export const RESEARCH_RETURN_EXTENSION='stellar-forge.research-returns-bundle.v1';
const WORK_MAX=64*1024*1024,FILE='research-return.json.gz';
const root=directory=>join(resolve(directory),'research','exchange');
const filePath=(directory,id)=>join(root(directory),'returns',researchHash(id),FILE);
const workPath=(directory,id)=>join(root(directory),'works',researchHash(id)+'.json');
const same=(a,b)=>canonical(a)===canonical(b);
function decoded(item){
  exact(item,['id','bodyBase64']);researchHash(item.id);
  need(typeof item.bodyBase64==='string'&&item.bodyBase64.length<=Math.ceil(MAX_RESEARCH_RETURN_BYTES/3)*4,
    'Keep the complete original return within its encoded capacity.');
  const bytes=Buffer.from(item.bodyBase64,'base64');
  need(bytes.length>0&&bytes.length<=MAX_RESEARCH_RETURN_BYTES&&bytes.toString('base64')===item.bodyBase64&&
    sha(bytes)===item.id,'The original return bytes changed.');
  return {...decodeResearchReturn(bytes),bytes};
}
export function validateResearchReturnExtension(value,state){
  validateResearchExchangeState(state);
  if(state.researchExchange===undefined){need(value===undefined||value===null,'Unexpected research-return extension.');return null;}
  exact(value,['schema','returns','works']);
  need(value.schema===RESEARCH_RETURN_EXTENSION&&Array.isArray(value.returns)&&Array.isArray(value.works),
    'Retain all complete original research returns and working editions.');
  const exchange=researchExchange(state),records=[...exchange.sent,...exchange.received],works=exchange.drafts.flatMap(d=>d.versions.map(v=>({...v,returnId:d.id})));
  need(new Set(records.map(r=>r.id)).size===records.length&&value.returns.length===records.length&&
    new Set(value.returns.map(r=>r?.id)).size===records.length,'Keep each original returned file exactly once.');
  need(value.works.length===works.length&&new Set(value.works.map(w=>w?.id)).size===works.length,
    'Keep every saved working comparison exactly once.');
  const decodedById=new Map(),workById=new Map();
  for(const item of value.returns){
    const record=records.find(r=>r.id===item.id);need(record,'Unexpected research return in the full archive.');
    const checked=decoded(item);
    need(same(record,researchReturnRecord(checked.packet,checked.bytes,record.recordedAt,record.direction,record.filename)),
      'The complete returned file differs from its original project record.');
    if(record.direction==='received')retainIssuedGraph(catalogue(state),checked.delivery.research,record.productId);
    else retainIssuedGraph(catalogue(state),checked.packet.research,record.productId);
    decodedById.set(item.id,checked);
  }
  for(const item of value.works){
    exact(item,['id','work']);const index=works.find(w=>w.id===item.id);
    need(index&&item.work.id===item.id,'The original saved review is absent from the full inventory.');
    need(Buffer.byteLength(JSON.stringify(item.work)+'\n')<=WORK_MAX,'The complete saved comparison exceeds64MiB.');
    const checked=decodedById.get(index.returnId);need(checked,'The saved comparison lost its original returned file.');
    validateResearchReturnWork(item.work,checked.packet,checked.delivery);
    need(item.work.returnId===index.returnId&&item.work.revision===index.revision&&
      item.work.savedAt===index.savedAt&&item.work.label===index.label&&item.work.comparisonSha256===index.comparisonSha256,
      'The saved working comparison differs from its native history.');
    need(item.work.context.projectId===state.id,'The saved comparison belongs to another original producer.');
    retainIssuedGraph(catalogue(state),item.work.context.research,checked.packet.productId);
    workById.set(item.id,item.work);
  }
  for(const record of exchange.adoptions){
    const work=workById.get(record.workId),checked=decodedById.get(record.returnId);
    need(work&&checked&&work.returnId===record.returnId&&work.revision===record.draftRevision&&work.savedAt===record.savedAt,
      'The saved adoption lost its complete original review.');
    const composed=composeResearchReturn({state:{id:work.context.projectId,revision:work.context.revision,
      research:work.context.research,pending:{startedAt:work.savedAt}},...checked,returnId:work.returnId,
      comparisonSha256:work.comparisonSha256,choices:work.choices,order:work.order});
    const product=catalogue(state).products.find(p=>p.id===checked.packet.productId);
    need(composed.definitionId===record.definitionId&&composed.comparison.currentDefinitionId===record.fromDefinitionId&&
      product?.versions.some(v=>v.id===record.definitionId&&same(v.definition,composed.document)),
      'The original adoption differs from its explicitly saved complete decisions.');
  }
  return value;
}
export async function exportResearchReturnExtension(directory,state){
  if(state.researchExchange===undefined)return null;
  validateResearchExchangeState(state);const e=researchExchange(state),returns=[],works=[];
  for(const record of [...e.sent,...e.received]){
    const bytes=await readBytes(filePath(directory,record.id),MAX_RESEARCH_RETURN_BYTES);
    need(bytes.length===record.bytes&&sha(bytes)===record.id,'The retained original return bytes changed.');
    returns.push({id:record.id,bodyBase64:bytes.toString('base64')});
  }
  for(const d of e.drafts)for(const v of d.versions)
    works.push({id:v.id,work:await readPrivateJson(workPath(directory,v.id),WORK_MAX)});
  const value={schema:RESEARCH_RETURN_EXTENSION,returns,works};
  validateResearchReturnExtension(value,state);return value;
}
export async function receiveResearchReturnExtension(directory,value,state){
  const checked=validateResearchReturnExtension(value,state);if(!checked)return;
  for(const item of checked.returns){
    const bytes=Buffer.from(item.bodyBase64,'base64'),path=filePath(directory,item.id),dir=await privateDirectory(join(root(directory),'returns',item.id));
    try{await writeBytes(path,bytes,{exclusive:true});}catch(e){if(e.code!=='EEXIST')throw e;
      need((await readBytes(path,Math.max(1,bytes.length))).equals(bytes),'The original received return conflicts with existing bytes.');}
  }
  const dir=await privateDirectory(join(root(directory),'works'));
  for(const item of checked.works){
    const path=workPath(directory,item.id);let old;
    try{old=await readPrivateJson(path,WORK_MAX);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(old)need(same(old,item.work),'The original received working review changed.');
    else try{await atomicJson(dir,item.id+'.json',item.work,{exclusive:true});}
      catch(e){if(e.code!=='EEXIST')throw e;need(same(await readPrivateJson(path,WORK_MAX),item.work),'The original review differs after receiving.');}
  }
}
