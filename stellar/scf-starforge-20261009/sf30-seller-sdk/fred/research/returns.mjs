// MIT. Customer return, complete producer comparison and saved decisions use the original project journal.
import { resolve, join } from 'node:path';
import { privateDirectory, atomicJson, readPrivateJson } from '../../routescan/quota.mjs';
import { readBytes, writeBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { readFredProject, transactFredProject } from '../project.mjs';
import { operationId } from '../model.mjs';
import { need, clone, canonical, digest, sha, text, catalogue, validateResearchState } from './model.mjs';
import { readResearchSource } from './project.mjs';
import { receiveResearchExtension } from './bundle.mjs';
import { RESEARCH_PACKAGE } from './commerce-model.mjs';
import { decodeResearchEditionDelivery } from './delivery.mjs';
import { decodeResearchReturn, encodeResearchReturn, MAX_RESEARCH_RETURN_BYTES } from './return-codec.mjs';
import { researchHash, researchProductGraph, retainIssuedGraph, makeResearchReturn,
  researchReturnRecord, researchExchange, validateResearchExchangeState, comparisonContext,
  compareResearchReturn, composeResearchReturn, makeResearchReturnWork,
  validateResearchReturnWork, normalizeResearchReturnWork, workSubset } from './return-model.mjs';

export const RESEARCH_RETURN_ACTIONS=Object.freeze(['research-return-create','research-return-import',
  'research-return-draft-save','research-return-apply']);
export const RESEARCH_RETURN_WORK_BYTES=64*1024*1024;
const RETURN_FILE='research-return.json.gz';
const rootPath=directory=>join(resolve(directory),'research','exchange');
export const researchReturnPath=(directory,id)=>join(rootPath(directory),'returns',researchHash(id),RETURN_FILE);
export const researchReturnWorkPath=(directory,id)=>join(rootPath(directory),'works',researchHash(id)+'.json');
const json=value=>Buffer.from(JSON.stringify(value)+'\n');
const same=(a,b)=>canonical(a)===canonical(b);
async function optional(path,limit=2*1024*1024){try{return await readPrivateJson(path,limit);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function maybeBytes(path){try{return await readBytes(path,MAX_RESEARCH_RETURN_BYTES);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function keepBytes(path,bytes){
  const index=path.lastIndexOf('/');const root=await privateDirectory(path.slice(0,index)),name=path.slice(index+1);
  try{await writeBytes(join(root,name),bytes,{exclusive:true});}
  catch(e){if(e.code!=='EEXIST')throw e;need((await readBytes(path,Math.max(1,bytes.length))).equals(bytes),
    'This original operation retains different complete bytes.','RESEARCH_RETURN_CONFLICT',409);}
}
async function keepJson(path,value){
  need(json(value).length<=RESEARCH_RETURN_WORK_BYTES,'The full saved comparison exceeds64MiB.','RESEARCH_RETURN_CAPACITY',413);
  const index=path.lastIndexOf('/'),root=await privateDirectory(path.slice(0,index)),name=path.slice(index+1);
  const old=await optional(path,RESEARCH_RETURN_WORK_BYTES);
  if(old)need(same(old,value),'The original immutable comparison changed.','RESEARCH_RETURN_CONFLICT',409);
  else {try{await atomicJson(root,name,value,{exclusive:true});}catch(e){if(e.code!=='EEXIST')throw e;
    need(same(await readPrivateJson(path,RESEARCH_RETURN_WORK_BYTES),value),'The original immutable comparison changed.');}}
}
function recordFor(state,id){researchHash(id);const e=researchExchange(state);
  const row=e.received.find(r=>r.id===id)??e.sent.find(r=>r.id===id);need(row,'Choose a complete return in this original project.','RESEARCH_RETURN_NOT_FOUND',404);return row;}
export async function readRetainedResearchReturn(directory,id,state=null){
  state??=await readFredProject(directory);validateResearchExchangeState(state);const record=recordFor(state,id);
  const bytes=await readBytes(researchReturnPath(directory,id),MAX_RESEARCH_RETURN_BYTES);
  need(bytes.length===record.bytes&&sha(bytes)===record.id,'The retained original returned file changed.');
  const decoded=decodeResearchReturn(bytes);
  need(same(record,researchReturnRecord(decoded.packet,bytes,record.recordedAt,record.direction,record.filename)),
    'The returned file differs from its complete original project record.');
  return {state,record,bytes,...decoded};
}
function producer(state,checked){
  need(checked.packet.sourceProjectId===state.id,'Receive this return in the project that issued its original product.','RESEARCH_RETURN_PROJECT',409);
  retainIssuedGraph(catalogue(state),checked.delivery.research,checked.packet.productId);
}
async function prepareComparison(directory,state,checked){
  producer(state,checked);const context=comparisonContext(state,checked.packet);
  const compared=compareResearchReturn({context,...checked,returnId:checked.record.id});
  const path=join(rootPath(directory),'comparisons',compared.comparisonSha256+'.json');
  const retained=await optional(path,RESEARCH_RETURN_WORK_BYTES);
  if(retained)need(retained.projectId===context.projectId&&same(retained.research,context.research)&&
    compareResearchReturn({context:retained,...checked,returnId:checked.record.id}).comparisonSha256===compared.comparisonSha256,
    'The retained original comparison graph changed.');
  else {try{await keepJson(path,context);}catch(error){
    const existing=await optional(path,RESEARCH_RETURN_WORK_BYTES);
    if(!existing||existing.projectId!==context.projectId||!same(existing.research,context.research))throw error;
  }}
  return {context,compared};
}
async function retainedContext(directory,hash,checked,state){
  researchHash(hash);const context=await optional(join(rootPath(directory),'comparisons',hash+'.json'),RESEARCH_RETURN_WORK_BYTES);
  if(context){need(compareResearchReturn({context,...checked,returnId:checked.record.id}).comparisonSha256===hash,
    'The original comparison snapshot changed.');return context;}
  const saved=researchExchange(state).drafts.find(d=>d.id===checked.record.id)?.versions.find(v=>v.comparisonSha256===hash);
  if(saved){const work=await readPrivateJson(researchReturnWorkPath(directory,saved.id),RESEARCH_RETURN_WORK_BYTES);
    validateResearchReturnWork(work,checked.packet,checked.delivery);need(work.id===saved.id&&work.returnId===checked.record.id,'The saved comparison reference changed.');return work.context;}
  const current=comparisonContext(state,checked.packet);
  need(compareResearchReturn({context:current,...checked,returnId:checked.record.id}).comparisonSha256===hash,
    'Reopen this complete original return before saving its changed comparison.','RESEARCH_RETURN_STALE',409);
  return current;
}
export async function researchReturnWork(directory,{returnId,revision}={}){
  const checked=await readRetainedResearchReturn(directory,returnId),d=researchExchange(checked.state).drafts.find(d=>d.id===returnId);
  need(d&&Number.isSafeInteger(revision)&&revision>=1&&revision<=d.versions.length,'Choose one complete saved review edition.');
  const index=d.versions[revision-1],work=await readPrivateJson(researchReturnWorkPath(directory,index.id),RESEARCH_RETURN_WORK_BYTES);
  validateResearchReturnWork(work,checked.packet,checked.delivery);
  need(work.id===index.id&&work.returnId===returnId&&work.revision===index.revision&&work.savedAt===index.savedAt&&
    work.comparisonSha256===index.comparisonSha256&&work.label===index.label,'The saved review inventory changed.');
  return {projectId:checked.state.id,revision:checked.state.revision,returnId,work,
    comparison:validateResearchReturnWork(work,checked.packet,checked.delivery)};
}
async function currentDraft(directory,state,checked,comparisonSha256){
  const draft=researchExchange(state).drafts.find(d=>d.id===checked.record.id);
  if(!draft)return null;
  const v=draft.versions.at(-1),work=await readPrivateJson(researchReturnWorkPath(directory,v.id),RESEARCH_RETURN_WORK_BYTES);
  validateResearchReturnWork(work,checked.packet,checked.delivery);
  need(work.id===v.id&&work.revision===v.revision&&work.returnId===draft.id,'The original current review edition changed.');
  return {revision:work.revision,workId:work.id,comparisonSha256:work.comparisonSha256,
    ...workSubset(work),stale:comparisonSha256!==work.comparisonSha256,
    history:draft.versions.map(v=>({revision:v.revision,workId:v.id,label:v.label,savedAt:v.savedAt}))};
}
export async function researchReturnCompare(directory,id){
  const checked=await readRetainedResearchReturn(directory,id);need(checked.record.direction==='received','Compare an original producer return.');
  const {compared}=await prepareComparison(directory,checked.state,checked);
  return {...compared,draft:await currentDraft(directory,checked.state,checked,compared.comparisonSha256),
    adoptions:clone(researchExchange(checked.state).adoptions.filter(a=>a.returnId===id))};
}
export async function researchReturnPreview(directory,{returnId,comparisonSha256,choices,order}={}){
  const checked=await readRetainedResearchReturn(directory,returnId);need(checked.record.direction==='received','Preview a received producer return.');
  producer(checked.state,checked);
  const result=composeResearchReturn({state:checked.state,...checked,returnId,comparisonSha256,choices,order});
  return {projectId:checked.state.id,revision:checked.state.revision,returnId,comparisonSha256,
    document:result.document,coverage:result.coverage,sources:result.sources};
}
export async function researchReturnDetail(directory,id){
  const checked=await readRetainedResearchReturn(directory,id),{packet,record,delivery,packageBytes}=checked;
  const files=[{file:'packet',filename:record.filename,bytes:record.bytes,sha256:record.id,contentType:'application/gzip'},
    {file:'original-package',filename:RESEARCH_PACKAGE,bytes:packageBytes.length,sha256:sha(packageBytes),contentType:'application/gzip'},
    ...packet.sourceBundle.sources.map(s=>({file:'source',sourceId:s.id,filename:s.filename,bytes:s.bytes,sha256:s.sha256,contentType:s.contentType}))];
  const {originalPackage,sourceBundle,...body}=packet;
  return {projectId:checked.state.id,revision:checked.state.revision,returnId:id,record:clone(record),
    packet:{...body,originalPackage:{bytes:originalPackage.bytes,sha256:originalPackage.sha256},
      sourceBundle:{schema:sourceBundle.schema,sources:sourceBundle.sources.map(({bodyBase64,...s})=>s)}},
    issued:clone(delivery.research),files};
}
export async function researchReturnDownload(directory,{id,file='packet',sourceId}={}){
  const checked=await readRetainedResearchReturn(directory,id);
  if(file==='packet')return {bytes:checked.bytes,filename:checked.record.filename,contentType:'application/gzip',sha256:id};
  if(file==='original-package')return {bytes:checked.packageBytes,filename:RESEARCH_PACKAGE,contentType:'application/gzip',sha256:sha(checked.packageBytes)};
  need(file==='source','Choose a complete original return file.');
  researchHash(sourceId);const s=checked.packet.sourceBundle.sources.find(s=>s.id===sourceId);
  need(s,'Choose a source retained in this original return.','RESEARCH_RETURN_SOURCE_NOT_FOUND',404);
  return {bytes:Buffer.from(s.bodyBase64,'base64'),filename:s.filename,contentType:s.contentType,sha256:s.sha256};
}
export async function researchReturnsView(directory,{section='received',offset=0,limit=100}={}){
  const state=await readFredProject(directory);validateResearchExchangeState(state);const e=researchExchange(state);
  need(['sent','received','drafts','adoptions'].includes(section),'Choose a research return inventory.');
  need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100&&offset<=e[section].length,'Choose a complete return inventory page.');
  return {projectId:state.id,revision:state.revision,section,total:e[section].length,nextOffset:offset+limit<e[section].length?offset+limit:null,
    offset,limit,rows:clone(e[section].slice(offset,offset+limit)),
    counts:Object.fromEntries(['sent','received','drafts','adoptions'].map(k=>[k,e[k].length])),
    receivings:clone(state.researchCommerce?.receivings??[]),
    products:catalogue(state).products.map(p=>({id:p.id,currentId:p.currentId,definition:clone(p.versions.find(v=>v.id===p.currentId).definition),editions:clone(p.editions)})),
    pending:state.pending&&RESEARCH_RETURN_ACTIONS.includes(state.pending.kind)?clone(state.pending):null};
}
async function originalStage(directory,id,payload){
  const root=await privateDirectory(join(rootPath(directory),'requests',operationId(id)));
  const prior=await optional(join(root,'selection.json'));
  if(prior)need(same(prior,payload),'This original request retains a different complete selection.','RESEARCH_RETURN_CONFLICT',409);
  else {try{await atomicJson(root,'selection.json',payload,{exclusive:true});}catch(e){if(e.code!=='EEXIST')throw e;
    need(same(await readPrivateJson(join(root,'selection.json'),2*1024*1024),payload),'The saved original request changed.');}}
  return root;
}
function available(state,id,expectedRevision){
  const old=state.operations.find(o=>o.id===id);if(old)return old;
  need(state.revision===expectedRevision,'The original project changed; refresh before saving.','FRED_REVISION_CONFLICT',409);
  if(state.pending)need(state.pending.id===id,'Continue the original pending project request.','FRED_OPERATION_PENDING',409);
  return null;
}
async function preparedCreate(directory,request,state,prior=null){
  const payload={packageSha256:researchHash(request.packageSha256),author:text(request.author,200,true),note:text(request.note??'',12000),
    customerRevision:request.expectedRevision};
  if(prior){
    need(prior.kind==='research-return-create','Keep the original completed action identity.','FRED_OPERATION_CONFLICT',409);
    const kept=await readRetainedResearchReturn(directory,prior.result.returnId,state);
    need(kept.record.direction==='sent'&&kept.packet.customer.projectId===state.id&&
      kept.packet.customer.revision===payload.customerRevision&&kept.packet.originalPackage.sha256===payload.packageSha256&&
      kept.packet.author===payload.author&&kept.packet.note===payload.note,
      'This completed request retains a different original customer return.','FRED_OPERATION_CONFLICT',409);
    return {...payload,returnId:kept.record.id,bytes:kept.bytes.length,filename:kept.record.filename};
  }
  const stage=await originalStage(directory,request.id,payload);
  let bytes=await maybeBytes(join(stage,RETURN_FILE));
  if(!bytes){
    const record=state.researchCommerce?.receivings.find(r=>r.id===payload.packageSha256);
    need(record,'Choose a package actually received by this customer project.');
    const packageBytes=await readBytes(join(resolve(directory),'research','receivings',record.id,RESEARCH_PACKAGE),MAX_RESEARCH_RETURN_BYTES);
    need(sha(packageBytes)===record.id,'The original customer package changed.');
    const {delivery}=decodeResearchEditionDelivery(packageBytes);retainIssuedGraph(catalogue(state),delivery.research,delivery.productId);
    need(delivery.productId===record.productId&&delivery.editionId===record.editionId&&delivery.deliverySha256===record.deliverySha256,
      'The customer receiving record differs from its original package.');
    const graph=researchProductGraph(state,delivery.productId),sources=[];
    for(const source of graph.sources)sources.push(await readResearchSource(directory,source.id));
    const packet=makeResearchReturn({state,sourceBundle:{schema:'stellar-forge.research-source-bundle.v1',sources},
      packageBytes,delivery,author:payload.author,note:payload.note,createdAt:new Date().toISOString()});
    bytes=encodeResearchReturn(packet);await keepBytes(join(stage,RETURN_FILE),bytes);
  }
  const checked=decodeResearchReturn(bytes);
  need(checked.packet.customer.projectId===state.id&&checked.packet.customer.revision===payload.customerRevision&&
    checked.packet.originalPackage.sha256===payload.packageSha256&&checked.packet.author===payload.author&&checked.packet.note===payload.note,
    'The prepared return differs from its original customer selection.');
  return {...payload,returnId:sha(bytes),bytes:bytes.length,filename:'research-return-'+sha(bytes)+'.json.gz'};
}
async function applyRetain(directory,request){
  const bytes=await readBytes(join(rootPath(directory),'requests',request.id,RETURN_FILE),MAX_RESEARCH_RETURN_BYTES);
  need(bytes.length===request.payload.bytes&&sha(bytes)===request.payload.returnId,'The original staged return changed.');
  const checked=decodeResearchReturn(bytes),direction=request.kind==='research-return-create'?'sent':'received';
  return transactFredProject(directory,request,async(state,root)=>{
    if(direction==='received')producer(state,checked);
    else need(checked.packet.customer.projectId===state.id&&checked.packet.customer.revision===request.expectedRevision,
      'The original customer return belongs to another project edition.');
    await keepBytes(researchReturnPath(root,request.payload.returnId),bytes);
    state.researchExchange??=clone(researchExchange(state));const rows=state.researchExchange[direction];
    const record=researchReturnRecord(checked.packet,bytes,state.pending.startedAt,direction,request.payload.filename);
    const prior=rows.find(r=>r.id===record.id);
    if(prior)need(prior.bodyId===record.bodyId,'The original return identity changed.');else rows.push(record);
    validateResearchExchangeState(state);
    return {returnId:record.id,record:clone(prior??record)};
  });
}
async function applyWork(directory,request){
  return transactFredProject(directory,request,async(state,root)=>{
    const p=request.payload,checked=await readRetainedResearchReturn(root,p.returnId,state);
    need(checked.record.direction==='received','Review a received original producer file.');producer(state,checked);
    const exchange=state.researchExchange??=clone(researchExchange(state));
    let drafts=exchange.drafts.find(d=>d.id===p.returnId),revision=drafts?.versions.length??0;
    need(revision===p.expectedDraftRevision,'The saved working review changed; preserve your work and reopen it.','RESEARCH_RETURN_DRAFT_CONFLICT',409);
    const context=await retainedContext(root,p.comparisonSha256,checked,state);
    const comparison=compareResearchReturn({context,...checked,returnId:p.returnId});
    normalizeResearchReturnWork({choices:p.choices,order:p.order,note:p.note,label:p.label},comparison,
      {complete:request.kind==='research-return-apply'});
    let composed;
    if(request.kind==='research-return-apply'){
      composed=composeResearchReturn({state,...checked,returnId:p.returnId,...p});
      const supplied=new Map(composed.newCaptures.map(s=>[s.id,s])),sources=[];
      for(const s of composed.research.sources)sources.push(supplied.get(s.id)??await readResearchSource(root,s.id));
      await receiveResearchExtension(root,{schema:'stellar-forge.research-source-bundle.v1',sources},{research:composed.research});
    }
    const work=makeResearchReturnWork({state,...checked,context,returnId:p.returnId,revision:revision+1,
      choices:p.choices,order:p.order,note:p.note,label:p.label,savedAt:state.pending.startedAt});
    await keepJson(researchReturnWorkPath(root,work.id),work);
    if(!drafts){drafts={id:p.returnId,currentId:work.id,versions:[]};exchange.drafts.push(drafts);}
    drafts.versions.push({id:work.id,revision:work.revision,savedAt:work.savedAt,comparisonSha256:work.comparisonSha256,label:work.label});
    drafts.currentId=work.id;
    const result={returnId:p.returnId,draftRevision:work.revision,workId:work.id,comparisonSha256:work.comparisonSha256};
    if(composed){
      const fromDefinitionId=catalogue(state).products.find(p=>p.id===checked.packet.productId).currentId;
      state.research=composed.research;
      exchange.adoptions.push({id:request.id,returnId:p.returnId,workId:work.id,savedAt:work.savedAt,
        fromDefinitionId,definitionId:composed.definitionId,draftRevision:work.revision});
      Object.assign(result,{definitionId:composed.definitionId,coverage:composed.coverage,applied:true});
    }
    validateResearchState(state);validateResearchExchangeState(state);return result;
  });
}
export async function runResearchReturnAction({directory,request}={}){
  need(RESEARCH_RETURN_ACTIONS.includes(request?.action),'Choose an original Research return operation.');
  const id=operationId(request.id),expectedRevision=request.expectedRevision,kind=request.action,state=await readFredProject(directory);
  const prior=available(state,id,expectedRevision);let payload;
  if(prior)need(prior.kind===kind,'This request ID retains another original action.','FRED_OPERATION_CONFLICT',409);
  if(request.resume===true){
    if(prior){need(prior.kind===kind,'Select the same original research return action.');return {...clone(prior.result),replayed:true,revision:state.revision};}
    need(state.pending?.id===id&&state.pending.kind===kind&&state.pending.expectedRevision===expectedRevision,'Resume the same pending return request.');
    payload=clone(state.pending.payload);
  }else if(kind==='research-return-create')payload=await preparedCreate(directory,request,state,prior);
  else if(kind==='research-return-import'){
    text(request.filename,180,true);need(!/[\\/\r\n]/.test(request.filename),'Use one original returned filename.');
    need(typeof request.bodyBase64==='string'&&request.bodyBase64.length<=Math.ceil(MAX_RESEARCH_RETURN_BYTES/3)*4,
      'Open one complete Research return within256MiB.','RESEARCH_RETURN_CAPACITY',413);
    const bytes=Buffer.from(request.bodyBase64,'base64');
    need(bytes.length>0&&bytes.length<=MAX_RESEARCH_RETURN_BYTES&&bytes.toString('base64')===request.bodyBase64,'Keep the exact complete return encoding.');
    const checked=decodeResearchReturn(bytes);producer(state,checked);
    payload={returnId:sha(bytes),bytes:bytes.length,filename:request.filename};
    const stage=await originalStage(directory,id,payload);await keepBytes(join(stage,RETURN_FILE),bytes);
  }else {
    need(Number.isSafeInteger(request.expectedDraftRevision)&&request.expectedDraftRevision>=0,'Use the selected saved review revision or zero for the first.');
    payload={returnId:researchHash(request.returnId),expectedDraftRevision:request.expectedDraftRevision,
      comparisonSha256:researchHash(request.comparisonSha256),choices:clone(request.choices),order:clone(request.order),
      note:text(request.note??'',12000),label:text(request.label??'',200)};
    if(!prior&&!state.pending){
      const checked=await readRetainedResearchReturn(directory,payload.returnId,state);producer(state,checked);
      const context=await retainedContext(directory,payload.comparisonSha256,checked,state);
      const comparison=compareResearchReturn({context,...checked,returnId:payload.returnId});
      normalizeResearchReturnWork({choices:payload.choices,order:payload.order,note:payload.note,label:payload.label},comparison,{complete:kind==='research-return-apply'});
      const d=researchExchange(state).drafts.find(d=>d.id===payload.returnId);
      need((d?.versions.length??0)===payload.expectedDraftRevision,'The native working review changed.','RESEARCH_RETURN_DRAFT_CONFLICT',409);
      if(kind==='research-return-apply')composeResearchReturn({state,...checked,...payload});
    }
  }
  need(json(payload).length<=2*1024*1024,'The explicit research return action exceeds2MiB.','RESEARCH_RETURN_CAPACITY',413);
  const call={id,expectedRevision,kind,payload};
  if(prior)return transactFredProject(directory,call,async()=>{need(false,'The original completed request disappeared.','FRED_OPERATION_CONFLICT',409);});
  return ['research-return-create','research-return-import'].includes(kind)?applyRetain(directory,call):applyWork(directory,call);
}
