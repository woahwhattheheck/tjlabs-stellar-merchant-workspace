// SPDX-License-Identifier: MIT
// Recipient proposals only. Original Bank collections/controllers retain source and financial authority.
import {receiveCollection,canonical,mappingSignature} from './source-collection-model.mjs';
import {requestSha256} from './source-preparation-state.mjs';
import {verifyPreparationCapsuleBytes,bytesSha256,decodeWholeBase64,encodeWholeBase64} from './source-preparation-capsule.mjs';
export const REVIEW_SCHEMA='stellar-forge.bank-source-review.v1';
export const REVIEW_DESK_SCHEMA=REVIEW_SCHEMA+'.desk';
export const REVIEW_LIMITS=Object.freeze({capsuleBytes:33554432,packageBytes:67108864,workingBytes:268435456,editions:100,comments:4000,items:1000,mappingBytes:131072});
const clone=v=>structuredClone(v),same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const fail=(code,message,extra={})=>{throw Object.assign(new Error(message),{code,...extra});};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
function text(value,label,max=4000,{empty=true}={}){if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))fail('REVIEW_FIELD','Use a complete '+label+' within '+max+' characters.');return value;}
function date(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail('REVIEW_TIME','Retain the original UTC time.');return value;}
function identity(value,label){if(!uuid(value))fail('REVIEW_ID','Retain the original '+label+'.');return value;}
export function reviewBytes(value,limit=REVIEW_LIMITS.packageBytes){const raw=new TextEncoder().encode(JSON.stringify(value,null,2)+'\n');if(raw.length>limit)fail('REVIEW_CAPACITY','The complete record exceeds its '+Math.round(limit/1048576)+' MiB receiving/export limit. Keep the existing full record; nothing was truncated.');return raw;}
export function reviewEqual(a,b){return same(a,b);}
export async function sealReview(value){const body=clone(value);delete body.sha256;return {...body,sha256:await requestSha256(body)};}
async function sealed(value,label){if(!object(value)||!hash(value.sha256))fail('REVIEW_BINDING','The '+label+' has no complete digest.');const body=clone(value);delete body.sha256;if(await requestSha256(body)!==value.sha256)fail('REVIEW_BINDING','The complete '+label+' changed.');return value;}
function sourceFile(value){
 if(!object(value)||typeof value.name!=='string'||!value.name||/[\\/\u0000-\u001f]/.test(value.name)||!Number.isSafeInteger(value.bytes)||value.bytes<1||!hash(value.sha256)||value.encoding!=='base64')fail('REVIEW_FILE','Retain the whole original file and its identity.');
 return value;
}
export async function retainedReviewFile(name,bytes,limit=REVIEW_LIMITS.packageBytes){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>limit)fail('REVIEW_CAPACITY','The selected complete file exceeds its receiving limit.');
 const result={name,bytes:bytes.length,sha256:await bytesSha256(bytes),encoding:'base64',contentBase64:encodeWholeBase64(bytes)};sourceFile(result);return result;
}
export async function readRetainedReviewFile(file,limit=REVIEW_LIMITS.packageBytes){
 sourceFile(file);if(file.bytes>limit)fail('REVIEW_CAPACITY','This complete source file exceeds the receiving limit.');
 const bytes=decodeWholeBase64(file.contentBase64);if(bytes.length!==file.bytes||await bytesSha256(bytes)!==file.sha256)fail('REVIEW_FILE','The complete original '+file.name+' does not match its retained hash/length.');return bytes;
}
async function collectionFromCapsule(capsule,file){
 const pin=capsule.files.get(file);
 if(!pin||pin.role!=='output'||!file.endsWith('.json'))fail('REVIEW_COLLECTION','Select a complete collection output in this original preparation.');
 let collection;try{collection=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(pin.bytesValue));}catch{fail('REVIEW_COLLECTION','The selected original is not a complete JSON collection.');}
 // Invoke the maintained validator; preserve the exact original object rather than its normalized received copy.
 try{await receiveCollection(collection,{workspaceId:collection.workspaceId,id:collection.id});}catch(error){if(collection?.items?.some(x=>x.mapping?.format==='PDF_REVIEW'))fail('PDF_SOURCE_NOT_READY','PDF page interpretations belong to the dedicated PDF desk and its complete working-copy transfer. Open that original desk; keep all PDF bytes and page mappings unchanged. This source-review workflow uses the maintained collection formats.',{cause:error});throw error;}
 if(collection.workspaceId!==capsule.receipt.workspaceId||!hash(collection.workspaceId)||!Number.isSafeInteger(collection.revision)||collection.items.length>REVIEW_LIMITS.items)fail('REVIEW_COLLECTION','The original collection and preparation belong to different workspaces.');
 return {collection,pin:{name:pin.name,bytes:pin.bytes,sha256:pin.sha256},capsule};
}
export async function inspectReviewCapsule(bytes,file='collection.json'){
 const capsule=await verifyPreparationCapsuleBytes(bytes);return collectionFromCapsule(capsule,file);
}
export async function createSourceReview({capsuleBytes,capsuleName,collectionFile='collection.json',author,recipient,purpose,id=crypto.randomUUID(),createdAt=new Date().toISOString()}){
 identity(id,'review identity');text(author,'issuing author',256,{empty:false});text(recipient,'named reviewer',256,{empty:false});text(purpose,'review instructions',16000,{empty:false});date(createdAt);
 if(capsuleBytes.length>REVIEW_LIMITS.capsuleBytes)fail('REVIEW_CAPACITY','The browser review uses complete capsules up to 32 MiB, leaving room for the original return and current collection. Use the original complete capsule receiver for larger preparations; this workflow never removes files.');
 const selected=await inspectReviewCapsule(capsuleBytes,collectionFile),r=selected.capsule.receipt,c=selected.collection;
 const source=await retainedReviewFile(capsuleName,capsuleBytes,REVIEW_LIMITS.capsuleBytes);
 const issue=await sealReview({schema:REVIEW_SCHEMA+'.issue',id,createdAt,author,recipient,purpose,workspaceId:r.workspaceId,preparationId:r.preparationId,requestSha256:r.requestSha256,sourceSha256:r.sourceSha256,source:{name:source.name,bytes:source.bytes,sha256:source.sha256},collection:{...selected.pin,id:c.id,revision:c.revision}});
 const value={schema:REVIEW_SCHEMA+'.package',issue,source,editions:[]};reviewBytes(value);return value;
}
function fields(item){return {id:item.id,mapping:clone(item.mapping),included:item.included,note:item.note,comment:''};}
export function newReviewDraft(verified){
 const head=verified.value.editions.at(-1);
 return {baseEditionSha256:head?.sha256??null,reviewer:verified.issue.recipient,summary:head?.summary??'',items:head?clone(head.items):verified.collection.items.map(fields),rawMapping:null};
}
function checkProposal(items,collection){
 if(!Array.isArray(items)||items.length!==collection.items.length)fail('REVIEW_ITEMS','Keep every original collection item, including excluded files.');
 const originals=new Map(collection.items.map(x=>[x.id,x])),seen=new Set();
 for(const row of items){
  const original=originals.get(row.id);
  if(!original||seen.has(row.id)||Object.keys(row).sort().join('|')!==['comment','id','included','mapping','note'].sort().join('|'))fail('REVIEW_ITEMS','Retain exactly one proposal for every original item identity.');
  seen.add(row.id);
  if(typeof row.included!=='boolean'||!object(row.mapping)||JSON.stringify(row.mapping).length>REVIEW_LIMITS.mappingBytes)fail('REVIEW_MAPPING','Keep the complete interpretation object and inclusion choice.');
  text(row.note,'item note');text(row.comment,'reviewer comment');
  if(original.mapping?.format==='PDF_REVIEW'&&!same(row.mapping,original.mapping))fail('PDF_REVIEW','Full PDF interpretation remains in the dedicated PDF desk. Propose inclusion/note here and record mapping feedback as a comment.');
 }
}
export async function verifySourceReview(value){
 reviewBytes(value);
 if(!object(value)||value.schema!==REVIEW_SCHEMA+'.package'||!Array.isArray(value.editions)||value.editions.length>REVIEW_LIMITS.editions)fail('REVIEW_FORMAT','Open the complete issued source-review package.');
 const issue=await sealed(value.issue,'issued review');
 if(issue.schema!==REVIEW_SCHEMA+'.issue'||!hash(issue.workspaceId)||!hash(issue.requestSha256)||!hash(issue.sourceSha256))fail('REVIEW_BINDING','Keep the complete original issuing workspace and source bindings.');
 identity(issue.id,'review identity');identity(issue.preparationId,'preparation identity');date(issue.createdAt);text(issue.author,'issuing author',256,{empty:false});text(issue.recipient,'named reviewer',256,{empty:false});text(issue.purpose,'review instructions',16000,{empty:false});
 const raw=await readRetainedReviewFile(value.source,REVIEW_LIMITS.capsuleBytes),selected=await inspectReviewCapsule(raw,issue.collection?.name),r=selected.capsule.receipt,c=selected.collection;
 if(!same(issue.source,{name:value.source.name,bytes:value.source.bytes,sha256:value.source.sha256})||!same(issue.collection,{...selected.pin,id:c.id,revision:c.revision})||issue.workspaceId!==r.workspaceId||issue.preparationId!==r.preparationId||issue.requestSha256!==r.requestSha256||issue.sourceSha256!==r.sourceSha256)fail('REVIEW_BINDING','The issue is not bound to these exact complete original files and collection.');
 let previous=null;const ids=new Set();
 for(let i=0;i<value.editions.length;i++){
  const edition=await sealed(value.editions[i],'reviewer edition');identity(edition.id,'reviewer edition');date(edition.createdAt);
  if(ids.has(edition.id)||edition.schema!==REVIEW_SCHEMA+'.edition'||edition.sequence!==i+1||edition.issueSha256!==issue.sha256||edition.previousSha256!==previous||edition.reviewer!==issue.recipient||!['draft','submitted'].includes(edition.status))fail('REVIEW_HISTORY','Retain the original named reviewer and entire ordered edition history.');
  ids.add(edition.id);text(edition.summary,'review summary',16000);checkProposal(edition.items,c);previous=edition.sha256;
 }
 return {value:clone(value),issue:clone(issue),collection:c,capsule:selected.capsule,sourceBytes:raw};
}
export async function readSourceReviewBytes(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length>REVIEW_LIMITS.packageBytes)fail('REVIEW_CAPACITY','The complete review file exceeds 64 MiB.');
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('REVIEW_FORMAT','Open a complete source-review JSON file.');}
 return verifySourceReview(value);
}
export async function saveReviewEdition(value,draft,{status='draft',id=crypto.randomUUID(),createdAt=new Date().toISOString()}={}){
 const verified=await verifySourceReview(value);identity(id,'reviewer edition');date(createdAt);
 if(!draft||draft.baseEditionSha256!==(value.editions.at(-1)?.sha256??null)||draft.reviewer!==value.issue.recipient||draft.rawMapping)fail('REVIEW_DRAFT','Apply the complete mapping text and keep this draft on its original edition before saving.');
 if(!['draft','submitted'].includes(status))fail('REVIEW_STATUS','Choose unfinished draft or submitted review explicitly.');
 checkProposal(draft.items,verified.collection);text(draft.summary,'review summary',16000);
 const edition=await sealReview({schema:REVIEW_SCHEMA+'.edition',id,sequence:value.editions.length+1,previousSha256:draft.baseEditionSha256,issueSha256:value.issue.sha256,reviewer:draft.reviewer,createdAt,status,summary:draft.summary,items:clone(draft.items)});
 const next={...clone(value),editions:[...clone(value.editions),edition]};reviewBytes(next);await verifySourceReview(next);return next;
}
export function verifySameIssue(issued,returned){
 if(!same(issued.issue,returned.issue)||!same(issued.source,returned.source))fail('RETURN_BINDING','This returned review belongs to another issued source or named reviewer.');
}
export async function previewSourceReviewReturn({issued,returned,currentCapsuleBytes,collectionFile='collection.json',editionSha256}){
 const author=await verifySourceReview(issued),incoming=await verifySourceReview(returned);verifySameIssue(author.value,incoming.value);
 const edition=incoming.value.editions.find(x=>x.sha256===editionSha256);
 if(!edition||edition.status!=='submitted')fail('RETURN_EDITION','Select an explicitly submitted reviewer edition; an unfinished draft is not an author decision.');
 const current=await inspectReviewCapsule(currentCapsuleBytes,collectionFile),c=current.collection,b=author.collection;
 if(c.workspaceId!==b.workspaceId||c.id!==b.id)fail('RETURN_COLLECTION','Select the current retained preparation for this exact original collection and workspace.');
 if(c.revision<b.revision)fail('RETURN_REVISION','This collection predates the issued review.');
 const byCurrent=new Map(c.items.map(x=>[x.id,x])),byProposed=new Map(edition.items.map(x=>[x.id,x])),rows=[];
 for(const item of b.items){
  const currentItem=byCurrent.get(item.id),proposed=byProposed.get(item.id),sourceMatches=!!currentItem&&same(currentItem.file,item.file);
  for(const field of ['mapping','included','note']){
   const baseline=clone(item[field]),next=clone(proposed[field]),now=currentItem?clone(currentItem[field]):null;
   const proposedChanged=!same(baseline,next),currentChanged=!currentItem||!same(baseline,now);
   rows.push({key:item.id+':'+field,itemId:item.id,name:item.file.name,field,baseline,current:now,proposed:next,proposedChanged,currentChanged,conflict:proposedChanged&&currentChanged&&!same(now,next),canAdopt:sourceMatches&&!(field==='mapping'&&item.mapping?.format==='PDF_REVIEW'),reason:!currentItem?'The current collection no longer contains this original item.':!sourceMatches?'The current item has different original file bytes.':field==='mapping'&&item.mapping?.format==='PDF_REVIEW'?'Full PDF interpretation stays in its dedicated desk.':null,comment:proposed.comment});
  }
 }
 const value={schema:REVIEW_SCHEMA+'.comparison',issueSha256:author.issue.sha256,editionSha256:edition.sha256,currentSource:{bytes:currentCapsuleBytes.length,sha256:current.capsule.sha256,workspaceId:current.capsule.receipt.workspaceId,preparationId:current.capsule.receipt.preparationId,requestSha256:current.capsule.receipt.requestSha256,sourceSha256:current.capsule.receipt.sourceSha256,collection:{...current.pin,id:c.id,revision:c.revision}},rows,currentAddedIds:c.items.filter(x=>!b.items.some(y=>y.id===x.id)).map(x=>x.id)};
 return sealReview(value);
}
export async function decideSourceReviewReturn({issued,returned,currentCapsuleBytes,collectionFile='collection.json',editionSha256,expectedComparisonSha256,choices,actor,reason,id=crypto.randomUUID(),requestId=crypto.randomUUID(),createdAt=new Date().toISOString()}){
 text(actor,'author review name',256,{empty:false});text(reason,'author decision reason',16000,{empty:false});identity(id,'author decision');identity(requestId,'new edit request');date(createdAt);
 const comparison=await previewSourceReviewReturn({issued,returned,currentCapsuleBytes,collectionFile,editionSha256});
 if(comparison.sha256!==expectedComparisonSha256)fail('RETURN_STALE','The current source, returned edition or comparison changed. Compare again before deciding.');
 const changed=comparison.rows.filter(x=>x.proposedChanged);
 if(!object(choices)||Object.keys(choices).length!==changed.length||changed.some(x=>!['keep','adopt'].includes(choices[x.key])))fail('RETURN_CHOICES','Explicitly keep or adopt every changed field from the returned review.');
 const patches=new Map();
 for(const row of changed){
  if(choices[row.key]==='adopt'){
   if(!row.canAdopt)fail('RETURN_DEPENDENCY',row.reason);
   if(!same(row.current,row.proposed)){const patch=patches.get(row.itemId)??{id:row.itemId};patch[row.field]=clone(row.proposed);patches.set(row.itemId,patch);}
  }
 }
 const selection=comparison.currentSource;
 const request=patches.size?{workspaceId:selection.workspaceId,requestId,actor,kind:'collection_edit',inputs:[{key:'collection',name:selection.collection.name,bytes:selection.collection.bytes,sha256:selection.collection.sha256,preparationId:selection.preparationId,file:selection.collection.name}],parameters:{expectedRevision:selection.collection.revision,items:[...patches.values()]}}:null;
 // Check proposed complete collection through its maintained receiving validator. The original controller still performs the actual edit.
 if(request){
  const current=await inspectReviewCapsule(currentCapsuleBytes,collectionFile),candidate=clone(current.collection);
  for(const patch of request.parameters.items){const item=candidate.items.find(x=>x.id===patch.id);for(const field of ['mapping','included','note'])if(Object.hasOwn(patch,field))item[field]=clone(patch[field]);}
  await receiveCollection(candidate,{workspaceId:candidate.workspaceId,id:candidate.id});
 }
 return sealReview({schema:REVIEW_SCHEMA+'.decision',id,createdAt,actor,reason,issueSha256:issued.issue.sha256,editionSha256,comparison,choices:clone(choices),state:request?'EDIT_REQUEST_DRAFT':'REVIEW_CLOSED_WITHOUT_EDIT',request,requestSha256:request?await requestSha256(request):null});
}
export async function verifyReviewDecision(decision,{issued,returned,currentCapsuleBytes}){
 await sealed(decision,'author decision');
 const original=await decideSourceReviewReturn({issued,returned,currentCapsuleBytes,collectionFile:decision.comparison?.currentSource?.collection?.name,editionSha256:decision.editionSha256,expectedComparisonSha256:decision.comparison?.sha256,choices:decision.choices,actor:decision.actor,reason:decision.reason,id:decision.id,requestId:decision.request?.requestId??decision.id,createdAt:decision.createdAt});
 if(!same(decision,original))fail('RETURN_DECISION','The author decision does not match its exact issued/current/returned inputs.');
 return decision;
}
export function newSourceReviewDesk(value,{origin=location.origin}={}){
 return {schema:REVIEW_DESK_SCHEMA,workspaceId:value.issue.workspaceId,origin,revision:0,draft:null,pending:null,operations:[],selected:null,caseId:value.issue.id,package:clone(value),returns:[],currentSources:[],decisions:[],activeReturnSha256:null,activeCurrentSha256:null,comparison:null,choices:{},author:'',reason:'',authorSelection:{editionSha256:'',collectionFile:value.issue.collection.name},authorDraftHistory:[],handoffs:[],receiptObservations:[],receivedWorkingRecords:[]};
}
export async function verifySourceReviewDesk(state){
 reviewBytes(state,REVIEW_LIMITS.workingBytes);
 if(!object(state)||state.schema!==REVIEW_DESK_SCHEMA||!hash(state.workspaceId)||typeof state.origin!=='string'||!Number.isSafeInteger(state.revision)||state.pending!==null||!Array.isArray(state.operations)||state.operations.length||!Array.isArray(state.returns)||!Array.isArray(state.currentSources)||!Array.isArray(state.decisions)||!Array.isArray(state.receiptObservations)||!Array.isArray(state.receivedWorkingRecords))fail('REVIEW_WORKING','Open the complete source-review working record.');
 const verified=await verifySourceReview(state.package);
 if(state.caseId!==verified.issue.id||state.workspaceId!==verified.issue.workspaceId)fail('REVIEW_BINDING','The saved review belongs to another case/workspace.');
 if(state.draft){checkProposal(state.draft.items,verified.collection);text(state.draft.summary,'review summary',16000);if(state.draft.reviewer!==verified.issue.recipient||state.draft.baseEditionSha256!==(state.package.editions.at(-1)?.sha256??null))fail('REVIEW_DRAFT','Keep the unfinished draft on its exact reviewer edition.');if(state.draft.rawMapping){identity(state.draft.rawMapping.itemId,'mapping item');text(state.draft.rawMapping.text,'unfinished mapping text',262144);}}
 const returns=new Map(),sources=new Map();
 for(const f of state.returns){if(returns.has(f.sha256))fail('REVIEW_HISTORY','The returned file is duplicated.');const v=await readSourceReviewBytes(await readRetainedReviewFile(f));verifySameIssue(state.package,v.value);returns.set(f.sha256,v.value);}
 for(const f of state.currentSources){if(sources.has(f.sha256))fail('REVIEW_HISTORY','The current source is duplicated.');const raw=await readRetainedReviewFile(f,REVIEW_LIMITS.capsuleBytes);await verifyPreparationCapsuleBytes(raw);sources.set(f.sha256,raw);}
 const decisionIds=new Set();
 for(const item of state.decisions){if(!object(item)||!returns.has(item.returnSha256)||!sources.has(item.currentSha256)||decisionIds.has(item.decision?.id))fail('REVIEW_HISTORY','Keep each complete author decision and its exact inputs.');decisionIds.add(item.decision.id);await verifyReviewDecision(item.decision,{issued:state.package,returned:returns.get(item.returnSha256),currentCapsuleBytes:sources.get(item.currentSha256)});}
 for(const observation of state.receiptObservations){const d=state.decisions.find(x=>x.decision.id===observation.decisionId)?.decision,r=observation.receipt;if(!d?.request||r?.workspaceId!==d.request.workspaceId||r.preparationId!==d.request.requestId||r.state==='NOT_FOUND'||r.requestSha256!==d.requestSha256||r.kind!==d.request.kind||r.actor!==d.request.actor)fail('REVIEW_RECEIPT','An original request observation differs from its author decision.');date(observation.at);}
 for(const f of state.receivedWorkingRecords)await readRetainedReviewFile(f,REVIEW_LIMITS.workingBytes);
 if(state.activeReturnSha256&&!returns.has(state.activeReturnSha256))fail('REVIEW_SELECTION','The selected original return is missing.');
 if(state.activeCurrentSha256&&!sources.has(state.activeCurrentSha256))fail('REVIEW_SELECTION','The selected current source is missing.');
 return {state:clone(state),verified,returns,sources};
}
export async function verifyDecisionReceipt(decision,receipt){
 if(!decision.request||receipt?.workspaceId!==decision.request.workspaceId||receipt.preparationId!==decision.request.requestId||receipt.requestSha256!==decision.requestSha256||receipt.actor!==decision.request.actor||receipt.kind!==decision.request.kind||!['RETAINING','PREPARED','COMPLETE'].includes(receipt.state))fail('REVIEW_RECEIPT','Observe the exact original edit request, workspace and body.');
 return clone(receipt);
}
