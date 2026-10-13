// MIT. Complete customer handover, explicit native return review and editable receiving.
import {join,resolve,dirname,basename,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {lstat,readdir,chmod,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {withPrivateLock} from '../../../sf30-seller-sdk/routescan/quota.mjs';
import {jsonBytes,digest,exists} from '../../node/store.mjs';
import {readResearchHostFile} from '../workspace-files.mjs';
import {customerDirectory,readCustomerJson,retainCustomerBytes,retainCustomerJson,
  describeCustomerFile,copyCustomerFile,inspectCustomerHandover} from './files.mjs';
import {receiveCustomerHandover} from './operator.mjs';
import {readEngineSelection} from '../customer-programme/selection.mjs';
import {readCustomerReturnHead,assertCustomerReturnPrefix,readCustomerReturnComparison,
  retainCustomerReturnReview,validateCustomerReturnRequest,validateCustomerReturnReceipt,
  publishCustomerReturnReview,retainCustomerReturnDossierExport} from '../customer-programme/returns.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const PREFIX='stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/';
export const HANDOVER_RETURNS_SCHEMA='sf88.research-customer-handover-returns.v1';
export const HANDOVER_RETURNS_PACKAGE='sf88.research-customer-handover-returns-package.v1';
const MAX_WIRE=256*1024*1024, MAX_JSON=16*1024*1024;
const IMPLEMENTATION=['handover-returns.mjs','handover-returns-cli.mjs','receive-handover-returns.py',
  'OPEN-handover-returns.mjs','HANDOVER_RETURNS.md'];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const canonical=x=>Array.isArray(x)?x.map(canonical):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function need(ok,code,details){if(!ok){const error=new Error(code);error.code=code;if(details)error.details=details;throw error;}}
function fields(value,allowed,code){need(object(value)&&Object.keys(value).every(k=>allowed.includes(k)),code);}
function key(value){need(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value),'HANDOVER_RETURN_KEY_INVALID');return value;}
function sha(value){need(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'HANDOVER_RETURN_HASH_REQUIRED');return value;}
function absolute(value){need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&value!=='/','HANDOVER_RETURN_ABSOLUTE_PATH_REQUIRED');return value;}
function member(value){need(typeof value==='string'&&value.length>0&&!value.includes('\\')&&!/[\u0000-\u001f\u007f]/.test(value)&&
  !value.startsWith('/')&&value.split('/').every(x=>x&&x!=='.'&&x!=='..'),'HANDOVER_RETURN_MEMBER_INVALID');return value;}
function bound(value,max,minimum=0){need(Number.isSafeInteger(value)&&value>=minimum&&value<=max,'HANDOVER_RETURN_LIMIT_INVALID');return value;}
async function save(root,name,value){const file=join(root,...member(name).split('/'));await customerDirectory(dirname(file));return retainCustomerJson(dirname(file),basename(file),value);}
async function bytes(root,name,body){const file=join(root,...member(name).split('/'));await customerDirectory(dirname(file));return retainCustomerBytes(dirname(file),basename(file),body);}
async function data(root,name){return (await readCustomerJson(join(root,...member(name).split('/')),MAX_JSON)).value;}
async function copy(source,target,pin){await customerDirectory(dirname(target));return copyCustomerFile(source,target,{...pin,maximum:MAX_WIRE});}
async function listFiles(root,prefix=''){
  const rows=[];
  for(const name of (await readdir(root)).sort()){
    member(name);const file=join(root,name),state=await lstat(file),path=prefix?prefix+'/'+name:name;
    need(!state.isSymbolicLink(),'HANDOVER_RETURN_SYMLINK');
    if(state.isDirectory())rows.push(...await listFiles(file,path));
    else{need(state.isFile(),'HANDOVER_RETURN_ORDINARY_FILE_REQUIRED');rows.push({...await describeCustomerFile(file,{maximum:MAX_WIRE}),path,mode:(state.mode&0o111)?'100755':'100644'});}
  }
  return rows;
}
async function locked(directory,fn){
  const root=await customerDirectory(absolute(directory));
  return withPrivateLock(root,'customer-handover-returns.lock',()=>fn(root));
}
function validateSelection(input){
  fields(input,['schema','operation_id','customer_label','baseline','workspace_id','dossier_id','expected_revision',
    'expected_revision_sha256','source_actor','maximum_total_items','maximum_total_returns','rounds','engine','output'],'HANDOVER_RETURN_SELECTION_FIELDS');
  need(input.schema===HANDOVER_RETURNS_SCHEMA,'HANDOVER_RETURN_SELECTION_SCHEMA');key(input.operation_id);
  need(typeof input.customer_label==='string'&&input.customer_label.trim()&&input.customer_label.length<=240,'HANDOVER_RETURN_CUSTOMER_REQUIRED');
  need(/^research_[a-f0-9]{64}$/.test(input.workspace_id??'')&&/^d_[a-f0-9-]{36}$/.test(input.dossier_id??''),'HANDOVER_RETURN_IDENTITY_REQUIRED');
  bound(input.expected_revision,Number.MAX_SAFE_INTEGER,1);sha(input.expected_revision_sha256);
  fields(input.baseline,['directory','manifest_sha256'],'HANDOVER_RETURN_BASELINE_FIELDS');
  absolute(input.baseline.directory);sha(input.baseline.manifest_sha256);
  if(input.source_actor!==undefined)need(typeof input.source_actor==='string'&&input.source_actor.trim()&&input.source_actor.length<=512,'HANDOVER_RETURN_SOURCE_ACTOR_INVALID');
  bound(input.maximum_total_items,100000);bound(input.maximum_total_returns,100000,1);need(Array.isArray(input.rounds)&&input.rounds.length>0&&input.rounds.length<=32,'HANDOVER_RETURN_ROUNDS_REQUIRED');
  need(input.rounds.length<=input.maximum_total_returns,'HANDOVER_RETURN_CUMULATIVE_ROUND_LIMIT');
  const keys=new Set();
  for(const row of input.rounds){
    fields(row,['key','maximum_items','maximum_source_bytes'],'HANDOVER_RETURN_ROUND_FIELDS');key(row.key);
    need(!keys.has(row.key),'HANDOVER_RETURN_ROUND_REPEATED');keys.add(row.key);
    bound(row.maximum_items,100000);bound(row.maximum_source_bytes,MAX_WIRE,1);
  }
  fields(input.engine,['root','manifestFile','manifestSha256'],'HANDOVER_RETURN_ENGINE_FIELDS');
  absolute(input.engine.root);absolute(input.engine.manifestFile);sha(input.engine.manifestSha256);
  fields(input.output,['filename_stem','maximum_archive_bytes'],'HANDOVER_RETURN_OUTPUT_FIELDS');
  key(input.output.filename_stem);bound(input.output.maximum_archive_bytes,MAX_WIRE,1);
  return input;
}
async function selection(root){
  const raw=await readCustomerJson(join(root,'SELECTION.original.json'),MAX_JSON);
  return {selected:validateSelection(raw.value),sha256:raw.sha256};
}
async function clientBinding(client,selected){
  need(client&&typeof client.dossierReturns==='function','HANDOVER_RETURN_CLIENT_REQUIRED');
  need((await client.status()).workspaceId===selected.workspace_id,'HANDOVER_RETURN_WRONG_WORKSPACE');
}
async function engineSelection(selected){
  const engine=await readEngineSelection(selected.engine);
  const files=new Map([...engine.files,...engine.implementation].map(row=>[row.path,row]));
  for(const name of IMPLEMENTATION){
    const file=join(HERE,name),identity=await describeCustomerFile(file,{maximum:MAX_JSON});
    const row={path:PREFIX+'customer-updates/'+name,file,bytes:identity.bytes,sha256:identity.sha256,
      mode:name.endsWith('.py')?'100755':'100644'};
    const previous=files.get(row.path);
    need(!previous||(previous.bytes===row.bytes&&previous.sha256===row.sha256&&previous.mode===row.mode),
      'HANDOVER_RETURN_SELECTED_IMPLEMENTATION_CHANGED');
    files.set(row.path,row);
  }
  return {...engine,files:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}
async function retainBaseline(root,selected){
  const target=await customerDirectory(join(root,'public','baseline'));
  if(!await exists(join(target,'handover.json'))){
    const original=await inspectCustomerHandover(selected.baseline.directory,{manifestSha256:selected.baseline.manifest_sha256});
    need(original.selection.dossierId===selected.dossier_id,'HANDOVER_RETURN_BASELINE_DOSSIER_CHANGED');
    for(const row of original.files)await copy(row.path,join(target,row.name),row);
    const manifest=await readCustomerJson(join(original.directory,'handover.json'));
    need(manifest.sha256===selected.baseline.manifest_sha256,'HANDOVER_RETURN_BASELINE_CHANGED');
    await bytes(target,'handover.json',manifest.body);
  }
  return inspectCustomerHandover(target,{manifestSha256:selected.baseline.manifest_sha256});
}
function receiptIdentity(receipt,head){
  need(object(receipt)&&/^drr_[a-f0-9]{64}$/.test(receipt.id??'')&&
    /^drv_[a-f0-9]{64}$/.test(receipt.reviewId??'')&&/^drs_[a-f0-9]{64}$/.test(receipt.sourceId??'')&&
    typeof receipt.requestId==='string'&&receipt.requestId.length>0&&receipt.requestId.length<=200&&
    Array.isArray(receipt.decisions)&&Number.isSafeInteger(receipt.revision)&&
    head.history[receipt.revision-1]?.sha256===receipt.revisionSha256,
    'HANDOVER_RETURN_NATIVE_HISTORY_CHANGED');
}
async function nativeReceipts(client,selected,at){
  const helper=client.dossierReturns(selected.dossier_id),rows=[];
  let total=null;
  for(let offset=0;total===null||offset<total;){
    const page=await helper.list({offset,limit:100});
    need(Array.isArray(page.items)&&Number.isSafeInteger(page.total)&&page.total>=0&&page.total<=100000&&
      page.offset===offset&&(total===null||page.total===total),'HANDOVER_RETURN_HISTORY_PAGE_CHANGED');
    total=page.total;need(page.items.length>0||offset===total,'HANDOVER_RETURN_HISTORY_PAGE_EMPTY');
    rows.push(...page.items);offset=rows.length;need(offset<=total,'HANDOVER_RETURN_HISTORY_COUNT_CHANGED');
  }
  const now=await readCustomerReturnHead(client,selected.dossier_id);
  need(now.revision===at.revision&&now.sha256===at.sha256,'HANDOVER_RETURN_CURRENT_REVISION_CHANGED');
  const result=[],ids=new Set(),requests=new Set();
  for(const row of rows.filter(row=>row.revision<=at.revision).sort((a,b)=>a.revision-b.revision)){
    const reply=await helper.list({requestId:row.requestId}),receipt=reply.return;
    receiptIdentity(receipt,at);
    need(receipt.id===row.id&&receipt.reviewId===row.reviewId&&receipt.sourceId===row.sourceId&&
      receipt.comparisonSha256===row.comparisonSha256&&!ids.has(receipt.id)&&!requests.has(receipt.requestId),
      'HANDOVER_RETURN_HISTORY_SELECTION_CHANGED');
    ids.add(receipt.id);requests.add(receipt.requestId);result.push(receipt);
  }
  const after=await readCustomerReturnHead(client,selected.dossier_id);
  need(after.revision===at.revision&&after.sha256===at.sha256,'HANDOVER_RETURN_CURRENT_REVISION_CHANGED');
  return result;
}
async function verifyReceipts(client,selected,receipts,at){
  let count=0,last=0;
  for(const expected of receipts){
    receiptIdentity(expected,at);need(expected.revision>last,'HANDOVER_RETURN_RECEIPT_ORDER_CHANGED');last=expected.revision;
    const actual=(await client.dossierReturns(selected.dossier_id).list({requestId:expected.requestId})).return;
    need(same(actual,expected),'HANDOVER_RETURN_SAVED_REQUEST_CHANGED');count+=expected.decisions.length;
  }
  need(receipts.length<=selected.maximum_total_returns,'HANDOVER_RETURN_CUMULATIVE_ROUND_LIMIT');
  need(count<=selected.maximum_total_items,'HANDOVER_RETURN_CUMULATIVE_ITEM_LIMIT');
  return count;
}
async function state(root,client){
  const {selected,sha256}=await selection(root);await clientBinding(client,selected);
  const baseline=await retainBaseline(root,selected),initial=await data(root,'INITIAL.json');
  need(initial.selectionSha256===sha256&&initial.head.revision===selected.expected_revision&&
    initial.head.sha256===selected.expected_revision_sha256,'HANDOVER_RETURN_INITIAL_SELECTION_CHANGED');
  const original=await readCustomerReturnHead(client,selected.dossier_id,initial.head.revision);
  need(original.sha256===initial.head.sha256&&same(original.history,initial.head.history),'HANDOVER_RETURN_INITIAL_HISTORY_CHANGED');
  need(baseline.portable.headSha256===initial.head.history[baseline.portable.revision-1]?.sha256,'HANDOVER_RETURN_BASELINE_HISTORY_CHANGED');
  const accepted=[];let gap=false;
  for(const round of selected.rounds){
    const path=join(root,'rounds',round.key,'ACCEPTED.json');
    if(!await exists(path)){gap=true;continue;}
    need(!gap,'HANDOVER_RETURN_ROUND_ORDER_CHANGED');
    const saved=await data(root,'rounds/'+round.key+'/ACCEPTED.json');
    need(saved.key===round.key&&saved.operationId===selected.operation_id,'HANDOVER_RETURN_ROUND_IDENTITY_CHANGED');
    accepted.push(saved);
  }
  const last=accepted.at(-1)?.receipt;
  const at=await readCustomerReturnHead(client,selected.dossier_id,last?.revision??initial.head.revision);
  if(last)need(at.sha256===last.revisionSha256,'HANDOVER_RETURN_ACCEPTED_REVISION_CHANGED');
  assertCustomerReturnPrefix(at.history,initial.head.history);
  const receipts=[...initial.inherited,...accepted.map(row=>row.receipt)];
  const reviewedItemCount=await verifyReceipts(client,selected,receipts,at);
  return {root,selected,selectionSha256:sha256,baseline,initial,accepted,receipts,reviewedItemCount,at};
}
export async function prepareCustomerHandoverReturns({client,directory,selectionFile,selectionSha256}={}){
  return locked(directory,async root=>{
    absolute(selectionFile);sha(selectionSha256);
    const original=await readResearchHostFile(selectionFile,MAX_JSON,{sha256:selectionSha256});
    await bytes(root,'SELECTION.original.json',original);
    const selected=validateSelection(JSON.parse(original.toString('utf8')));
    await clientBinding(client,selected);
    const engine=await engineSelection(selected);
    const enginePins=engine.files.map(({path,mode,bytes,sha256})=>({path,mode,bytes,sha256}));
    await save(root,'ENGINE_SELECTION.json',{repository:engine.repository,ref:engine.ref,
      manifestSha256:engine.manifestSha256,files:enginePins});
    const baseline=await retainBaseline(root,selected);
    const receiving=await receiveCustomerHandover({client,directory:join(root,'baseline-receiving'),
      sourceDirectory:baseline.directory,manifestSha256:baseline.manifestSha256,sourceActor:selected.source_actor});
    need(receiving.dossierId===selected.dossier_id,'HANDOVER_RETURN_RECEIVED_DOSSIER_CHANGED');
    if(!await exists(join(root,'INITIAL.json'))){
      const at=await readCustomerReturnHead(client,selected.dossier_id);
      need(at.revision===selected.expected_revision&&at.sha256===selected.expected_revision_sha256,
        'HANDOVER_RETURN_INITIAL_REVISION_CHANGED',{actual:{revision:at.revision,sha256:at.sha256}});
      need(at.history[baseline.portable.revision-1]?.sha256===baseline.portable.headSha256,'HANDOVER_RETURN_BASELINE_HISTORY_CHANGED');
      const inherited=await nativeReceipts(client,selected,at);
      need(inherited.length+selected.rounds.length<=selected.maximum_total_returns,'HANDOVER_RETURN_CUMULATIVE_ROUND_LIMIT');
      need(inherited.reduce((n,row)=>n+row.decisions.length,0)<=selected.maximum_total_items,'HANDOVER_RETURN_CUMULATIVE_ITEM_LIMIT');
      await save(root,'INITIAL.json',{schema:HANDOVER_RETURNS_SCHEMA+'.initial',selectionSha256,head:at,inherited,receiving});
    }
    const current=await state(root,client);
    await bytes(join(root,'public'),'SELECTION.original.json',original);
    await save(join(root,'public'),'INITIAL.json',current.initial);
    return {schema:HANDOVER_RETURNS_SCHEMA+'.prepared',state:'INITIALIZED',operationId:selected.operation_id,
      dossierId:selected.dossier_id,workspaceId:selected.workspace_id,baselineRevision:baseline.portable.revision,
      initialRevision:current.initial.head.revision,inheritedReturns:current.initial.inherited.length,
      reviewedItemCount:current.initial.inherited.reduce((sum,row)=>sum+row.decisions.length,0),maximumTotalItems:selected.maximum_total_items,maximumTotalReturns:selected.maximum_total_returns,
      rounds:selected.rounds,directory:root};
  });
}
function sourceInput(input,round){
  fields(input,['file','bytes','sha256','filename','contentType'],'HANDOVER_RETURN_SOURCE_FIELDS');
  absolute(input.file);sha(input.sha256);bound(input.bytes,round.maximum_source_bytes,1);
  need(typeof input.filename==='string'&&input.filename.length>0&&input.filename.length<=512&&
    !/[\u0000-\u001f\u007f/\\]/.test(input.filename),'HANDOVER_RETURN_FILENAME_INVALID');
  need(['application/json','application/gzip','application/x-gzip','application/octet-stream'].includes(input.contentType),
    'HANDOVER_RETURN_CONTENT_TYPE_INVALID');
}
async function roundState(current,keyName){
  const index=current.selected.rounds.findIndex(row=>row.key===keyName);need(index>=0,'HANDOVER_RETURN_ROUND_UNKNOWN');
  need(index<=current.accepted.length,'HANDOVER_RETURN_PRIOR_ROUND_REQUIRED');
  need(current.initial.inherited.length+current.selected.rounds.length<=current.selected.maximum_total_returns,'HANDOVER_RETURN_CUMULATIVE_ROUND_LIMIT');
  const round=current.selected.rounds[index],stage=await customerDirectory(join(current.root,'rounds',round.key));
  return {index,round,stage,accepted:current.accepted[index]};
}
async function checkHead(client,current,expected=current.at){
  const actual=await readCustomerReturnHead(client,current.selected.dossier_id);
  need(actual.revision===expected.revision&&actual.sha256===expected.sha256,'HANDOVER_RETURN_CURRENT_REVISION_CHANGED',
    {expected:{revision:expected.revision,sha256:expected.sha256},actual:{revision:actual.revision,sha256:actual.sha256}});
}
async function preparationHead(client,current){
  const actual=await readCustomerReturnHead(client,current.selected.dossier_id);
  assertCustomerReturnPrefix(actual.history,current.at.history);
  const receipts=await nativeReceipts(client,current.selected,actual);
  need(same(receipts,current.receipts),'HANDOVER_RETURN_UNSELECTED_NATIVE_RETURN');
  return actual;
}
async function roundComparison(stage,helper,round){
  const review=await data(stage,'COMPARISON.json');
  const actual=await readCustomerReturnComparison(helper,review.reviewId,round.maximum_items);
  need(same(actual,review),'HANDOVER_RETURN_IMMUTABLE_COMPARISON_CHANGED');return review;
}
export async function prepareCustomerHandoverReturn({client,directory,key: keyName,source}={}){
  return locked(directory,async root=>{
    const current=await state(root,client),{selected}=current;
    const {round,stage,accepted}=await roundState(current,keyName);
    if(source)sourceInput(source,round);
    const selectedFile=join(stage,'SOURCE.json');
    if(await exists(selectedFile)){
      const previous=await data(stage,'SOURCE.json');
      if(source)need(same(previous,{bytes:source.bytes,sha256:source.sha256,filename:source.filename,contentType:source.contentType}),
        'HANDOVER_RETURN_SOURCE_SELECTION_CHANGED');
      source={...previous,file:join(stage,'original-return.bin')};
    }else{
      need(source,'HANDOVER_RETURN_SOURCE_REQUIRED');
      await copy(source.file,join(stage,'original-return.bin'),source);
      await save(stage,'SOURCE.json',{bytes:source.bytes,sha256:source.sha256,filename:source.filename,contentType:source.contentType});
      source={...source,file:join(stage,'original-return.bin')};
    }
    await describeCustomerFile(source.file,{...source,maximum:round.maximum_source_bytes});
    const helper=client.dossierReturns(selected.dossier_id);
    if(!await exists(join(stage,'COMPARISON.json'))){
      need(!accepted,'HANDOVER_RETURN_COMPARISON_MISSING');
      const selectedHead=await preparationHead(client,current);
      const received=await exists(join(stage,'SOURCE_RECEIVED.json'))?await data(stage,'SOURCE_RECEIVED.json'):
        await helper.receiveSource({file:source.file,filename:source.filename,contentType:source.contentType,expectedSha256:source.sha256});
      await save(stage,'SOURCE_RECEIVED.json',received);
      const preview=await helper.preview({sourceId:received.source.id,expectedRevision:selectedHead.revision});
      const review=await readCustomerReturnComparison(helper,preview.reviewId,round.maximum_items);
      need(review.current.revision===selectedHead.revision&&review.current.sha256===selectedHead.sha256&&
        review.source.id==='drs_'+source.sha256&&review.source.bytes===source.bytes,'HANDOVER_RETURN_REVIEW_SOURCE_CHANGED');
      need(current.reviewedItemCount+review.total<=selected.maximum_total_items,'HANDOVER_RETURN_CUMULATIVE_ITEM_LIMIT');
      await save(stage,'COMPARISON.json',review);
    }
    const review=await roundComparison(stage,helper,round);
    const reports=await retainCustomerReturnReview(helper,stage,review,accepted?.receipt);
    await publishCustomerReturnReview(stage,join(root,'public','returns',round.key));
    await copy(source.file,join(root,'public','returns',round.key,'original-return.bin'),source);
    await save(join(root,'public'),'returns/'+round.key+'/COMPARISON.json',review);
    const result={schema:HANDOVER_RETURNS_SCHEMA+'.review',state:accepted?'APPLIED':'REVIEW_REQUIRED',
      operationId:selected.operation_id,key:round.key,dossierId:selected.dossier_id,workspaceId:selected.workspace_id,
      reviewId:review.reviewId,comparisonSha256:review.comparisonSha256,current:review.current,base:review.base,
      returned:review.returned,source:review.source,itemCount:review.total,
      reviewedItemCount:accepted?accepted.reviewedItemCount:current.reviewedItemCount,maximumTotalItems:selected.maximum_total_items,maximumTotalReturns:selected.maximum_total_returns,reports,
      request:{requestId:'Choose and retain one stable request ID',reviewId:review.reviewId,
        expectedRevision:review.current.revision,comparisonSha256:review.comparisonSha256,
        reviewedBy:'Name the authorized reviewer',decisions:'Supply one explicit native choice for every comparison item'},
      meaning:'Use complete values and the native choiceLabels/effect. Typed RETURNED retains the returned proposal; current typed authority remains active.',
      ...(accepted?{receipt:accepted.receipt}:{})};
    await save(stage,accepted?'APPLIED_VIEW.json':'REVIEW_REQUIRED.json',result);
    return result;
  });
}
export async function applyCustomerHandoverReturn({client,directory,key:keyName,reviewFile,reviewSha256}={}){
  return locked(directory,async root=>{
    const current=await state(root,client),{selected}=current;
    const {round,stage,accepted}=await roundState(current,keyName);
    const helper=client.dossierReturns(selected.dossier_id),review=await roundComparison(stage,helper,round);
    const file=join(stage,'REQUEST.original.json');
    if(reviewFile!==undefined||reviewSha256!==undefined){
      absolute(reviewFile);sha(reviewSha256);
      const wire=await readResearchHostFile(reviewFile,MAX_JSON,{sha256:reviewSha256});
      validateCustomerReturnRequest(JSON.parse(wire.toString('utf8')),review);
      await bytes(stage,'REQUEST.original.json',wire);
    }
    need(await exists(file),'HANDOVER_RETURN_REVIEW_FILE_REQUIRED');
    const raw=await readCustomerJson(file,MAX_JSON),request=raw.value;
    validateCustomerReturnRequest(request,review);
    if(accepted){
      need(raw.sha256===accepted.requestSha256,'HANDOVER_RETURN_REVIEW_REQUEST_CHANGED');
      validateCustomerReturnReceipt(accepted.receipt,request,review);
      const reports=await finishRound(current,round,stage,review,raw,accepted,client);
      return {...accepted,reports};
    }
    need(!current.receipts.some(row=>row.requestId===request.requestId),'HANDOVER_RETURN_REQUEST_ID_ALREADY_USED');
    need(current.reviewedItemCount+review.total<=selected.maximum_total_items,'HANDOVER_RETURN_CUMULATIVE_ITEM_LIMIT');
    let receipt=(await helper.list({requestId:request.requestId})).return;
    if(!receipt){
      await checkHead(client,current,review.current);
      const choices=await helper.previewChoices({reviewId:request.reviewId,expectedRevision:request.expectedRevision,
        comparisonSha256:request.comparisonSha256,decisions:request.decisions});
      need(choices.valid===true&&choices.reviewId===review.reviewId&&choices.comparisonSha256===review.comparisonSha256,'HANDOVER_RETURN_CHOICES_INVALID');
      await save(stage,'CHOICES_PREVIEW.json',choices);
      await save(stage,'DISPATCH.json',{requestSha256:raw.sha256,request,sourceId:review.source.id});
      const reply=await helper.review(request);
      receipt=reply.return;
    }
    validateCustomerReturnReceipt(receipt,request,review);
    const at=await readCustomerReturnHead(client,selected.dossier_id,receipt.revision);
    need(at.sha256===receipt.revisionSha256,'HANDOVER_RETURN_ACCEPTED_HISTORY_CHANGED');
    assertCustomerReturnPrefix(at.history,current.at.history);
    const result={schema:HANDOVER_RETURNS_SCHEMA+'.accepted',state:'APPLIED',operationId:selected.operation_id,
      key:round.key,itemCount:review.total,requestSha256:raw.sha256,source:review.source,receipt,
      reviewedItemCount:current.reviewedItemCount+review.total,maximumTotalItems:selected.maximum_total_items};
    await save(stage,'ACCEPTED.json',result);
    const reports=await finishRound(current,round,stage,review,raw,result,client);
    return {...result,reports};
  });
}

async function finishRound(current,round,stage,review,raw,result,client){
  const {root,selected}=current,helper=client.dossierReturns(selected.dossier_id);
  const source=await data(stage,'SOURCE.json');
  need(review.source.id==='drs_'+source.sha256&&review.source.bytes===source.bytes,'HANDOVER_RETURN_RETAINED_SOURCE_CHANGED');
  validateCustomerReturnRequest(raw.value,review);validateCustomerReturnReceipt(result.receipt,raw.value,review);
  need(result.requestSha256===raw.sha256&&result.itemCount===review.total,'HANDOVER_RETURN_ACCEPTED_REQUEST_CHANGED');
  await retainCustomerReturnReview(helper,stage,review,null);
  const reports=await retainCustomerReturnReview(helper,stage,review,result.receipt);
  await publishCustomerReturnReview(stage,join(root,'public','returns',round.key));
  await copy(join(stage,'original-return.bin'),join(root,'public','returns',round.key,'original-return.bin'),source);
  await save(join(root,'public'),'returns/'+round.key+'/SOURCE.json',source);
  await save(join(root,'public'),'returns/'+round.key+'/COMPARISON.json',review);
  await bytes(join(root,'public'),'returns/'+round.key+'/REQUEST.original.json',raw.body);
  await save(join(root,'public'),'returns/'+round.key+'/ACCEPTED.json',result);
  for(const format of ['json.gz','md','html']){
    const exported=await retainCustomerReturnDossierExport(client,stage,selected.dossier_id,result.receipt.revision,format);
    await copy(exported.file??exported.path,join(root,'public','returns',round.key,'accepted-dossier.'+format),exported);
  }
  return reports;
}
function guide(current){
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const {selected,at,reviewedItemCount}=current;
  return '<!doctype html>\n<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+escape(selected.customer_label)+' · Research handover</title><style>'+
    '*{box-sizing:border-box}body{font:16px/1.6 system-ui,sans-serif;margin:0;background:#eee;color:#222}main{max-width:1000px;margin:auto;padding:40px}'+
    'h1,h2{line-height:1.2}header{border-bottom:3px solid #333;padding-bottom:24px}section{background:#fff;border:1px solid #bbb;padding:24px;margin:24px 0}'+
    'code{background:#eee;padding:3px 6px}a{color:#222}table{width:100%;border-collapse:collapse}td,th{padding:12px;text-align:left;border-bottom:1px solid #ccc}'+
    '.facts{display:flex;flex-wrap:wrap;gap:24px}.facts p{margin:0}small{color:#555}</style><main><header><p>RESEARCH / CUSTOMER HANDOVER</p>'+
    '<h1>'+escape(selected.customer_label)+'</h1><div class="facts"><p>Accepted revision <b>'+at.revision+'</b></p>'+
    '<p>Reviewed items <b>'+reviewedItemCount+' / '+selected.maximum_total_items+'</b></p><p>Return rounds <b>'+selected.rounds.length+'</b></p></div></header>'+
    '<section><h2>Open the complete editable dossier</h2><p>Run <code>node OPEN.mjs --directory /absolute/receiving</code> from this extracted package. '+
    'The original customer delivery is received first, then the accepted dossier history is reopened. The command prints your local Research address for continued editing.</p>'+
    '<p>Use <code>--verify-only</code> for the complete receiving verification and a terminal result. See <a href="HANDOVER_RETURNS.md">the operating guide</a> for archive inspection and same-request recovery.</p></section>'+
    '<section><h2>Review the accepted result</h2><p><a href="dossier/current.html">Complete dossier report</a> · <a href="dossier/current.md">Markdown report</a> · '+
    '<a href="dossier/current.metadata.json">Metadata</a> · <a href="dossier/history.json">Complete revision history</a></p>'+
    '<p>The <a href="baseline/handover.json">original customer handover</a> retains its published delivery revision and exact reports. '+
    'The accepted dossier adds the reviewed returns through revision '+at.revision+'. Typed returned items are retained proposals with the original branch source; current typed histories remain authoritative.</p></section>'+
    '<section><h2>Reviewed return rounds</h2><table><thead><tr><th>Round</th><th>Items</th><th>Accepted revision</th><th>Complete review</th></tr></thead><tbody>'+
    current.accepted.map(row=>'<tr><td>'+escape(row.key)+'</td><td>'+row.itemCount+'</td><td>'+row.receipt.revision+'</td><td><a href="returns/'+
      encodeURIComponent(row.key)+'/accepted.html">Review and source</a></td></tr>').join('')+
    '</tbody></table><p>All original returned files, full comparisons, explicit requests, native receipts and historical exports are retained alongside the selected complete engine source.</p></section>'+
    '<footer><small>Operation '+escape(selected.operation_id)+' · '+escape(selected.dossier_id)+' · '+escape(at.sha256)+'</small></footer></main></html>\n';
}
async function runPython(python,args,root,label){
  const directory=await customerDirectory(join(root,'processes',label+'-'+randomUUID()));
  const stdoutFile=join(directory,'stdout.log'),stderrFile=join(directory,'stderr.log');
  const stdout=await open(stdoutFile,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  let stderr;
  try{
    stderr=await open(stderrFile,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    let launchError;
    const result=await new Promise(resolveResult=>{
      const child=spawn(python,['-B',join(HERE,'receive-handover-returns.py'),...args],{cwd:root,stdio:['ignore',stdout.fd,stderr.fd]});
      child.on('error',error=>{launchError=error;});
      // Even a spawn error is followed by close. All actual child output remains
      // in its original exclusive files, with no early output-limit rejection.
      child.on('close',(code,signal)=>resolveResult({code,signal}));
    });
    await stdout.sync();await stderr.sync();
    await save(directory,'RESULT.json',{...result,args,...(launchError?{launchError:String(launchError)}:{})});
    need(!launchError&&result.code===0,'HANDOVER_RETURN_PACKAGING_FAILED',{directory,code:result.code});
    return JSON.parse((await readResearchHostFile(stdoutFile,8*1024*1024)).toString('utf8'));
  }finally{await stderr?.close();await stdout.close();}
}
export async function completeCustomerHandoverReturns({client,directory,python='python3',node=process.execPath}={}){
  return locked(directory,async root=>{
    const current=await state(root,client),{selected,at}=current;
    need(current.accepted.length===selected.rounds.length,'HANDOVER_RETURN_ALL_ROUNDS_REQUIRED');
    const publicRoot=await customerDirectory(join(root,'public'));
    for(let i=0;i<current.accepted.length;i++){
      const round=selected.rounds[i],stage=join(root,'rounds',round.key);
      const review=await roundComparison(stage,client.dossierReturns(selected.dossier_id),round);
      const raw=await readCustomerJson(join(stage,'REQUEST.original.json'),MAX_JSON);
      await finishRound(current,round,stage,review,raw,current.accepted[i],client);
    }
    for(const receipt of current.initial.inherited){
      const stage=await customerDirectory(join(root,'inherited',receipt.id));
      const review=await readCustomerReturnComparison(client.dossierReturns(selected.dossier_id),receipt.reviewId,selected.maximum_total_items);
      need(review.total===receipt.decisions.length&&review.source.id===receipt.sourceId&&
        review.comparisonSha256===receipt.comparisonSha256,'HANDOVER_RETURN_INHERITED_REVIEW_CHANGED');
      await retainCustomerReturnReview(client.dossierReturns(selected.dossier_id),stage,review,receipt);
      await publishCustomerReturnReview(stage,join(publicRoot,'inherited',receipt.id));
      await save(publicRoot,'inherited/'+receipt.id+'/RECEIPT.json',receipt);
    }
    await save(publicRoot,'dossier/current.metadata.json',at.metadata);
    await save(publicRoot,'dossier/history.json',at.history);
    const exportsRoot=await customerDirectory(join(root,'final-exports'));
    for(const format of ['json.gz','md','html']){
      const exported=await retainCustomerReturnDossierExport(client,exportsRoot,selected.dossier_id,at.revision,format);
      await copy(exported.file??exported.path,join(publicRoot,'dossier','current.'+format),exported);
    }
    const engine=await engineSelection(selected),frozen=await data(root,'ENGINE_SELECTION.json');
    const pins=engine.files.map(({path,mode,bytes,sha256})=>({path,mode,bytes,sha256}));
    need(same(pins,frozen.files)&&engine.manifestSha256===frozen.manifestSha256,'HANDOVER_RETURN_ENGINE_SELECTION_CHANGED');
    for(const row of engine.files){
      const target=join(publicRoot,'engine',...member(row.path).split('/'));
      await copy(row.file,target,row);await chmod(target,row.mode==='100755'?0o700:0o600);
    }
    await bytes(publicRoot,'ENGINE_ORIGINAL_MANIFEST.json',engine.manifestBytes);
    await save(publicRoot,'ENGINE_SELECTION.json',frozen);
    for(const [source,target] of [['OPEN-handover-returns.mjs','OPEN.mjs'],['HANDOVER_RETURNS.md','HANDOVER_RETURNS.md']])
      await bytes(publicRoot,target,await readResearchHostFile(join(HERE,source),MAX_JSON));
    const native={dossierId:selected.dossier_id,revision:at.revision,sha256:at.sha256,
      portable:'dossier/current.json.gz',metadata:'dossier/current.metadata.json',history:'dossier/history.json'};
    const result={schema:HANDOVER_RETURNS_SCHEMA+'.course',state:'NATIVE_RECEIVED',operationId:selected.operation_id,
      customerLabel:selected.customer_label,selectionSha256:current.selectionSha256,workspaceId:selected.workspace_id,
      baseline:{manifest:'baseline/handover.json',manifestSha256:current.baseline.manifestSha256,
        dossierId:current.baseline.selection.dossierId,revision:current.baseline.portable.revision,
        sha256:current.baseline.portable.headSha256,projectId:current.baseline.selection.projectId,
        deliveryId:current.baseline.selection.delivery.id},
      native,initialRevision:current.initial.head.revision,initialSha256:current.initial.head.sha256,
      inheritedReturns:current.initial.inherited,returns:current.accepted,
      reviewedItemCount:current.reviewedItemCount,maximumTotalItems:selected.maximum_total_items,maximumTotalReturns:selected.maximum_total_returns,
      engine:{repository:frozen.repository,ref:frozen.ref,manifestSha256:frozen.manifestSha256,files:frozen.files.length}};
    await save(publicRoot,'COURSE.json',result);
    await bytes(publicRoot,'START_HERE.html',Buffer.from(guide(current)));
    const files=(await listFiles(publicRoot)).map(({path,mode,bytes,sha256})=>({path,mode,bytes,sha256}));
    const manifest={schema:HANDOVER_RETURNS_PACKAGE,operationId:selected.operation_id,
      selectionSha256:current.selectionSha256,native,baseline:result.baseline,engine:result.engine,files};
    await save(root,'PACKAGE_SELECTION.json',{schema:HANDOVER_RETURNS_PACKAGE+'.build',directory:publicRoot,manifest,
      output:join(root,selected.output.filename_stem+'.zip'),maximumArchiveBytes:selected.output.maximum_archive_bytes});
    const request=await describeCustomerFile(join(root,'PACKAGE_SELECTION.json'),{maximum:MAX_JSON});
    const built=await runPython(python,['build','--request',request.path,'--sha256',request.sha256],root,'build');
    need(built.operationId===selected.operation_id&&built.selectionSha256===current.selectionSha256,
      'HANDOVER_RETURN_PACKAGE_SELECTION_CHANGED');
    await describeCustomerFile(built.archive.file,{...built.archive,maximum:selected.output.maximum_archive_bytes});
    await save(root,'PACKAGE_BUILT.json',built);
    const received=await runPython(python,['receive','--archive',built.archive.file,'--sha256',built.archive.sha256,
      '--directory',join(root,'cold-receiving'),'--node',node,'--python',python],root,'receive');
    need(received.archive.sha256===built.archive.sha256&&received.native.dossierId===native.dossierId&&
      received.native.selectedRevision===native.revision&&received.native.selectedSha256===native.sha256,
      'HANDOVER_RETURN_COLD_RECEIVING_CHANGED');
    await save(root,'PACKAGE_RECEIVED.json',received);
    const complete={schema:HANDOVER_RETURNS_SCHEMA+'.complete',state:'COMPLETE',operationId:selected.operation_id,
      customerLabel:selected.customer_label,selectionSha256:current.selectionSha256,native,
      reviewedItemCount:current.reviewedItemCount,maximumTotalItems:selected.maximum_total_items,maximumTotalReturns:selected.maximum_total_returns,
      archive:built.archive,manifestSha256:built.manifestSha256,receiving:received};
    await save(root,'COMPLETE.json',complete);return complete;
  });
}
export async function receiveCustomerHandoverReturns({client,directory,packageDirectory,manifestSha256,sourceActor}={}){
  return locked(directory,async root=>{
    const source=await customerDirectory(absolute(packageDirectory),{create:false});
    const raw=await readCustomerJson(join(source,'PACKAGE_MANIFEST.json'),MAX_JSON);
    if(manifestSha256!==undefined)need(raw.sha256===sha(manifestSha256),'HANDOVER_RETURN_PACKAGE_MANIFEST_CHANGED');
    const manifest=raw.value;
    need(manifest.schema===HANDOVER_RETURNS_PACKAGE&&Array.isArray(manifest.files)&&manifest.files.length>0,
      'HANDOVER_RETURN_PACKAGE_SCHEMA');
    const names=new Set();
    for(const row of manifest.files){
      member(row.path);need(!names.has(row.path),'HANDOVER_RETURN_PACKAGE_DUPLICATE');names.add(row.path);
      need(['100644','100755'].includes(row.mode),'HANDOVER_RETURN_PACKAGE_MODE');
      await describeCustomerFile(join(source,...row.path.split('/')),{...row,maximum:MAX_WIRE});
    }
    for(const row of await listFiles(source))need(row.path==='PACKAGE_MANIFEST.json'||names.has(row.path),'HANDOVER_RETURN_UNSELECTED_PACKAGE_MEMBER');
    for(const name of ['COURSE.json','SELECTION.original.json','INITIAL.json','ENGINE_SELECTION.json',
      'ENGINE_ORIGINAL_MANIFEST.json','OPEN.mjs','HANDOVER_RETURNS.md','baseline/handover.json',
      'dossier/current.json.gz','dossier/current.metadata.json','dossier/history.json'])need(names.has(name),'HANDOVER_RETURN_PACKAGE_INCOMPLETE');
    const course=await data(source,'COURSE.json'),selected=validateSelection(await data(source,'SELECTION.original.json'));
    const selectedRaw=await readCustomerJson(join(source,'SELECTION.original.json'),MAX_JSON);
    need(course.schema===HANDOVER_RETURNS_SCHEMA+'.course'&&course.state==='NATIVE_RECEIVED'&&
      course.operationId===manifest.operationId&&selected.operation_id===manifest.operationId&&
      course.selectionSha256===manifest.selectionSha256&&selectedRaw.sha256===manifest.selectionSha256&&
      same(course.native,manifest.native)&&same(course.baseline,manifest.baseline),'HANDOVER_RETURN_PACKAGE_BINDING_CHANGED');
    const original=await inspectCustomerHandover(join(source,'baseline'),{manifestSha256:course.baseline.manifestSha256});
    need(original.portable.revision===course.baseline.revision&&original.portable.headSha256===course.baseline.sha256,
      'HANDOVER_RETURN_BASELINE_CHANGED');
    const actualWorkspace=(await client.status()).workspaceId;
    await save(root,'SELECTION.json',{packageManifestSha256:raw.sha256,operationId:course.operationId,
      dossierId:course.native.dossierId,workspaceId:actualWorkspace,sourceActor:sourceActor??null});
    const baseline=await receiveCustomerHandover({client,directory:join(root,'baseline'),sourceDirectory:join(source,'baseline'),
      manifestSha256:course.baseline.manifestSha256,sourceActor:sourceActor??selected.source_actor});
    const portable=manifest.files.find(row=>row.path===course.native.portable);
    need(portable,'HANDOVER_RETURN_NATIVE_PORTABLE_MISSING');
    const reopened=await client.reopenFile(join(source,...portable.path.split('/')),{expectedSha256:portable.sha256});
    need(reopened.source?.sha256===portable.sha256&&reopened.source?.bytes===portable.bytes&&
      reopened.dossier?.id===course.native.dossierId,'HANDOVER_RETURN_NATIVE_REOPEN_CHANGED');
    const accepted=await readCustomerReturnHead(client,course.native.dossierId,course.native.revision);
    const history=await data(source,course.native.history),metadata=await data(source,course.native.metadata);
    need(accepted.sha256===course.native.sha256&&same(accepted.history,history)&&same(accepted.metadata,metadata),
      'HANDOVER_RETURN_NATIVE_RECEIVING_CHANGED');
    need(accepted.history[course.baseline.revision-1]?.sha256===course.baseline.sha256,'HANDOVER_RETURN_BASELINE_PREFIX_CHANGED');
    const receipts=[...course.inheritedReturns,...course.returns.map(row=>row.receipt)];
    const count=await verifyReceipts(client,{...selected,workspace_id:actualWorkspace},receipts,accepted);
    need(count===course.reviewedItemCount&&course.maximumTotalItems===selected.maximum_total_items&&
      course.returns.length===selected.rounds.length&&course.maximumTotalReturns===selected.maximum_total_returns&&
      receipts.length<=selected.maximum_total_returns,'HANDOVER_RETURN_RECEIVED_SCOPE_CHANGED');
    for(let index=0;index<course.returns.length;index++){
      const returned=course.returns[index],round=selected.rounds[index];
      need(returned.key===round.key&&returned.itemCount===returned.receipt.decisions.length&&returned.itemCount<=round.maximum_items,
        'HANDOVER_RETURN_RECEIVED_ROUND_CHANGED');
      const request=await readCustomerJson(join(source,'returns',round.key,'REQUEST.original.json'),MAX_JSON);
      const comparison=await data(source,'returns/'+round.key+'/COMPARISON.json');
      need(request.sha256===returned.requestSha256,'HANDOVER_RETURN_RECEIVED_REQUEST_CHANGED');
      validateCustomerReturnRequest(request.value,comparison);
      validateCustomerReturnReceipt(returned.receipt,request.value,comparison);
    }
    const result={schema:HANDOVER_RETURNS_SCHEMA+'.received',state:'RECEIVED',operationId:course.operationId,
      packageManifestSha256:raw.sha256,workspaceId:actualWorkspace,dossierId:course.native.dossierId,
      selectedRevision:course.native.revision,selectedSha256:course.native.sha256,baselineRevision:baseline.revision,
      reviewedItemCount:count,maximumTotalItems:course.maximumTotalItems,maximumTotalReturns:course.maximumTotalReturns};
    await save(root,'RECEIVED.json',result);return result;
  });
}
export async function readCustomerHandoverReturns({directory}={}){
  const root=await customerDirectory(absolute(directory),{create:false});
  if(await exists(join(root,'COMPLETE.json')))return data(root,'COMPLETE.json');
  const {selected,sha256}=await selection(root),rounds=[];
  for(const row of selected.rounds){
    const stage=join(root,'rounds',row.key);
    for(const name of ['ACCEPTED.json','DISPATCH.json','REVIEW_REQUIRED.json'])
      if(await exists(join(stage,name))){rounds.push({key:row.key,state:name==='ACCEPTED.json'?'APPLIED':
        name==='REVIEW_REQUIRED.json'?'REVIEW_REQUIRED':'OUTCOME_UNCONFIRMED',value:await data(stage,name)});break;}
  }
  return {schema:HANDOVER_RETURNS_SCHEMA+'.status',operationId:selected.operation_id,selectionSha256:sha256,rounds,directory:root};
}

// Reuse the original intake, engine and inherited-receipt authority.
export {validateSelection as validateCustomerHandoverReturnSelection,
  engineSelection as readCustomerHandoverReturnEngine,nativeReceipts as readCustomerHandoverReturnHistory};
