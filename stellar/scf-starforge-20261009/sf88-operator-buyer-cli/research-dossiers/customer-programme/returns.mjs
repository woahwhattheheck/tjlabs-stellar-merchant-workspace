// MIT. Reviewed collaborator returns inside the original customer Research programme.
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {withPrivateLock} from '../../../sf30-seller-sdk/routescan/quota.mjs';
import {startDossierWorkspace} from '../server.mjs';
import {ResearchWorkspaceClient} from '../workspace-client.mjs';
import {readEngineSelection} from './selection.mjs';
import {need,object,absolute,key,member,directory,exists,value,read,retain,retainBytes,checked,
  descriptor,step,same,digest,section,runProcess,verifyFiles,publicFiles} from './retention.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const PREFIX='stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/';
const SCHEMA='sf88.research-customer-returns.v1';
const MAXIMUM=256*1024*1024;
const hash=value=>need(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'CUSTOMER_RETURN_HASH_REQUIRED');
const positive=value=>need(Number.isSafeInteger(value)&&value>=1,'CUSTOMER_RETURN_REVISION_REQUIRED');
const pin=value=>({file:value.file??value.path,bytes:value.bytes,sha256:value.sha256});
const html=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fields(input,allowed,code){
  need(object(input)&&Object.keys(input).every(name=>allowed.includes(name)),code);
}
function fileSelection(input){
  fields(input,['file','bytes','sha256','filename','contentType'],'CUSTOMER_RETURN_FILE_SELECTION_INVALID');
  need(typeof input.file==='string'&&input.file&&Number.isSafeInteger(input.bytes)&&input.bytes>0&&
    input.bytes<=MAXIMUM,'CUSTOMER_RETURN_SOURCE_BOUND');
  hash(input.sha256);
}
async function selectedInput(selected,selectionFile,target){
  fileSelection(selected);
  const original=selected.file.startsWith('/')?absolute(selected.file):resolve(dirname(selectionFile),member(selected.file));
  if(await exists(target)){
    await checked({...selected,file:target});return descriptor(target);
  }
  const body=await checked({...selected,file:original});
  return retainBytes(target,body);
}
async function readSelection(options,root){
  const selectedFile=absolute(options.selectionFile),expected=options.selectionSha256;hash(expected);
  const retained=join(root,'delivery','inputs','return-selection.original.json');
  const bytes=await read(await exists(retained)?retained:selectedFile,16*1024*1024,expected);
  const selected=JSON.parse(bytes.toString('utf8'));
  fields(selected,['schema','operation_id','customer_label','baseline','workspace_id','dossier_id',
    'expected_revision','expected_revision_sha256','maximum_total_items','returns','output'],'CUSTOMER_RETURN_SELECTION_FIELDS');
  need(selected.schema===SCHEMA,'CUSTOMER_RETURN_SELECTION_SCHEMA');
  key(selected.operation_id);
  need(typeof selected.customer_label==='string'&&selected.customer_label.trim()&&selected.customer_label.length<=240,
    'CUSTOMER_RETURN_CUSTOMER_LABEL_REQUIRED');
  need(/^research_[a-f0-9]{64}$/.test(selected.workspace_id??'')&&
    /^d_[a-f0-9-]{36}$/.test(selected.dossier_id??''),'CUSTOMER_RETURN_WORKSPACE_REQUIRED');
  positive(selected.expected_revision);hash(selected.expected_revision_sha256);
  need(Number.isSafeInteger(selected.maximum_total_items)&&selected.maximum_total_items>=0&&selected.maximum_total_items<=100000,
    'CUSTOMER_RETURN_TOTAL_ITEM_BOUND_REQUIRED');
  fileSelection(selected.baseline);
  need(Array.isArray(selected.returns)&&selected.returns.length>0&&selected.returns.length<=32,
    'CUSTOMER_RETURN_STAGES_REQUIRED');
  const keys=new Set();
  for(const row of selected.returns){
    fields(row,['key','source','maximum_items'],'CUSTOMER_RETURN_STAGE_FIELDS');
    key(row.key);need(!keys.has(row.key),'CUSTOMER_RETURN_STAGE_REPEATED');keys.add(row.key);
    fileSelection(row.source);
    need(typeof row.source.filename==='string'&&row.source.filename.length>0&&row.source.filename.length<=512&&
      !/[\u0000-\u001f\u007f/\\]/.test(row.source.filename),'CUSTOMER_RETURN_FILENAME_INVALID');
    need(['application/json','application/gzip','application/x-gzip','application/octet-stream'].includes(row.source.contentType),
      'CUSTOMER_RETURN_CONTENT_TYPE_INVALID');
    need(Number.isSafeInteger(row.maximum_items)&&row.maximum_items>=0&&row.maximum_items<=100000,
      'CUSTOMER_RETURN_ITEM_BOUND_REQUIRED');
  }
  fields(selected.output,['filename_stem','maximum_archive_bytes'],'CUSTOMER_RETURN_OUTPUT_FIELDS');
  key(selected.output.filename_stem);
  need(Number.isSafeInteger(selected.output.maximum_archive_bytes)&&selected.output.maximum_archive_bytes>0&&
    selected.output.maximum_archive_bytes<=MAXIMUM,'CUSTOMER_RETURN_ARCHIVE_BOUND_REQUIRED');
  const supplied=[options.reviewKey,options.reviewFile,options.reviewSha256];
  need(supplied.every(x=>x===undefined)||supplied.every(x=>typeof x==='string'&&x),
    'CUSTOMER_RETURN_REVIEW_FILE_SELECTION_REQUIRED');
  if(options.reviewKey){need(keys.has(options.reviewKey),'CUSTOMER_RETURN_REVIEW_STAGE_UNKNOWN');absolute(options.reviewFile);hash(options.reviewSha256);}
  await retainBytes(retained,bytes);
  const baseline=await selectedInput(selected.baseline,selectedFile,join(root,'delivery','baseline','original-customer-programme.zip'));
  const sources=new Map();
  for(const row of selected.returns)
    sources.set(row.key,await selectedInput(row.source,selectedFile,
      join(root,'delivery','returns',row.key,'original-return.bin')));
  return {selection:selected,selectionSha256:digest(bytes),baseline,sources};
}
async function head(client,dossierId,revision){
  const metadata=await client.metadata(dossierId,revision===undefined?{}:{revision});
  const history=await section(client,dossierId,'revisions',metadata.revision);
  need(history.length===metadata.revision&&history.every((row,index)=>row.revision===index+1&&
    /^[a-f0-9]{64}$/.test(row.sha256??'')),'CUSTOMER_RETURN_HISTORY_INCOMPLETE');
  return {metadata,history,revision:metadata.revision,sha256:history.at(-1).sha256};
}
function prefix(history,earlier){
  need(history.length>=earlier.length&&earlier.every((row,index)=>
    row.revision===history[index].revision&&row.sha256===history[index].sha256),
    'CUSTOMER_RETURN_HISTORY_CONFLICT');
}
function compareIdentity(value){
  return {reviewId:value.reviewId,comparisonSha256:value.comparisonSha256,
    source:value.source,current:value.current,base:value.base,returned:value.returned,total:value.total};
}
async function comparison(helper,reviewId,maximum){
  const first=await helper.list({reviewId,offset:0,limit:100});
  need(first.reviewId===reviewId&&first.offset===0&&Number.isSafeInteger(first.total)&&
    first.total>=0&&first.total<=maximum&&Array.isArray(first.items),'CUSTOMER_RETURN_COMPARISON_BOUND');
  const identity=compareIdentity(first),items=[...first.items];
  while(items.length<first.total){
    const page=await helper.list({reviewId,offset:items.length,limit:100});
    need(same(compareIdentity(page),identity)&&page.offset===items.length&&Array.isArray(page.items)&&
      page.items.length>0,'CUSTOMER_RETURN_COMPARISON_PAGE_CHANGED');
    items.push(...page.items);
  }
  need(items.length===first.total&&new Set(items.map(row=>row.id)).size===items.length,
    'CUSTOMER_RETURN_COMPARISON_INCOMPLETE');
  for(const row of items)need(/^dri_[a-f0-9]{64}$/.test(row.id??'')&&Array.isArray(row.allowedChoices)&&
    row.allowedChoices.length>0&&['base','current','returned'].every(side=>object(row[side])&&
    typeof row[side].present==='boolean'),'CUSTOMER_RETURN_ITEM_INVALID');
  return {...identity,items};
}
function nativeSelection(review,accepted,itemId,side){
  const selected={reviewId:review.reviewId,returnId:accepted?.id??null,sourceId:review.source.id,
    comparisonSha256:review.comparisonSha256,revisionSha256:accepted?.revisionSha256??null};
  return itemId?{...selected,itemId,side}:selected;
}
// Original downloads publish exclusively. A descriptor is retained before the
// public copy; an interrupted unrecorded attempt is preserved and a fresh exact
// native export supplies the authority for any candidate already present.
async function download(root,name,expected,make){
  member(name);
  const receiptFile=join(root,'downloads',digest(Buffer.from(name))+'.json');
  const destination=join(root,'public',...name.split('/'));
  const check=row=>{
    need(object(row)&&same(row.selection,expected)&&Number.isSafeInteger(row.bytes)&&row.bytes>=0&&
      /^[a-f0-9]{64}$/.test(row.sha256??'')&&typeof row.filename==='string'&&typeof row.contentType==='string',
      'CUSTOMER_RETURN_EXPORT_IDENTITY_CHANGED');
    absolute(row.file);
    need(row.file.startsWith(join(root,'native-downloads')+'/'),'CUSTOMER_RETURN_EXPORT_PATH_CHANGED');
    return row;
  };
  const fresh=async()=>{
    const attempt=await directory(join(root,'native-downloads',randomUUID()));
    const row=check(await make(join(attempt,'original')));
    await checked(row);await retain(join(attempt,'receipt.json'),row);return row;
  };
  let original;
  if(await exists(receiptFile))original=check(await value(receiptFile));
  else{original=await fresh();await retain(receiptFile,original);}
  if(await exists(destination)){await checked({...original,file:destination});}
  else{
    let selected=original;
    if(!await exists(selected.file)){
      selected=await fresh();
      for(const field of ['bytes','sha256','filename','contentType','selection'])
        need(same(selected[field],original[field]),'CUSTOMER_RETURN_RECOVERED_EXPORT_CHANGED');
    }
    await retainBytes(destination,await checked(selected));
  }
  return {name,...await descriptor(destination),filename:original.filename,contentType:original.contentType,selection:original.selection};
}
async function reviewExports(helper,root,review,accepted){
  const rows=[];
  for(const format of ['json','md','html','source']){
    const name=(accepted?'accepted':'comparison')+'.'+(format==='source'?'source.bin':format);
    const exported=await download(root,name,nativeSelection(review,accepted),file=>
      helper.export({reviewId:review.reviewId,...(accepted?{returnId:accepted.id}:{}),format,file}));
    if(format==='source')need(exported.bytes===review.source.bytes&&exported.sha256===review.source.sha256,
      'CUSTOMER_RETURN_EXPORTED_SOURCE_CHANGED');
    rows.push(exported);
  }
  if(!accepted)for(const item of review.items)for(const side of ['base','current','returned']){
    if(!item[side].present)continue;
    const file=await download(root,'values/'+item.id+'-'+side+'.json',nativeSelection(review,null,item.id,side),destination=>
      helper.downloadValue({reviewId:review.reviewId,itemId:item.id,side,file:destination}));
    const body=JSON.parse((await checked(file)).toString('utf8'));
    need(body.reviewId===review.reviewId&&body.itemId===item.id&&body.side===side&&body.present===true&&
      body.sha256===item[side].sha256&&Object.hasOwn(body,'value')&&
      (!Object.hasOwn(item[side],'value')||same(body.value,item[side].value)),
      'CUSTOMER_RETURN_COMPLETE_VALUE_CHANGED');
    rows.push(file);
  }
  return rows;
}
function validateRequest(request,review){
  fields(request,['requestId','reviewId','expectedRevision','comparisonSha256','reviewedBy','reviewNote','decisions'],
    'CUSTOMER_RETURN_REQUEST_FIELDS');
  need(typeof request.requestId==='string'&&request.requestId.length>0&&request.requestId.length<=200&&
    request.reviewId===review.reviewId&&request.expectedRevision===review.current.revision&&
    request.comparisonSha256===review.comparisonSha256&&typeof request.reviewedBy==='string'&&
    request.reviewedBy.trim()&&request.reviewedBy.length<=512&&
    (request.reviewNote===undefined||typeof request.reviewNote==='string'&&request.reviewNote.length<=16000),
    'CUSTOMER_RETURN_REQUEST_CHANGED');
  need(Array.isArray(request.decisions)&&request.decisions.length===review.total&&
    new Set(request.decisions.map(row=>row.itemId)).size===review.total,'CUSTOMER_RETURN_ALL_DECISIONS_REQUIRED');
  const items=new Map(review.items.map(row=>[row.id,row]));
  for(const decision of request.decisions){
    fields(decision,['itemId','choice','value'],'CUSTOMER_RETURN_DECISION_FIELDS');
    need(items.has(decision.itemId)&&items.get(decision.itemId).allowedChoices.includes(decision.choice),
      'CUSTOMER_RETURN_DECISION_INVALID');
  }
}
function acceptedReceipt(receipt,request,review){
  need(receipt&&receipt.requestId===request.requestId&&receipt.reviewId===request.reviewId&&
    receipt.sourceId===review.source.id&&receipt.comparisonSha256===review.comparisonSha256&&
    receipt.reviewedBy===request.reviewedBy&&receipt.reviewNote===(request.reviewNote??'')&&
    same(receipt.decisions,request.decisions)&&same(receipt.current,review.current)&&
    same(receipt.base,review.base)&&same(receipt.returned,review.returned)&&
    receipt.revision===request.expectedRevision+1&&/^drr_[a-f0-9]{64}$/.test(receipt.id??'')&&
    /^[a-f0-9]{64}$/.test(receipt.revisionSha256??''),'CUSTOMER_RETURN_NATIVE_RECEIPT_CHANGED');
  return receipt;
}
async function copyStage(stage,destination){
  const files=await publicFiles(join(stage,'public')),copied=[];
  for(const row of files){
    await retainBytes(join(destination,...row.name.split('/')),await checked(row));
    copied.push({path:row.name,...await descriptor(join(destination,...row.name.split('/')))});
  }
  return copied;
}
function instructions(review,selection,keyName){
  return {schema:'sf88.research-customer-return-review-required.v1',state:'REVIEW_REQUIRED',
    operationId:selection.operation_id,key:keyName,workspaceId:selection.workspace_id,dossierId:selection.dossier_id,
    reviewId:review.reviewId,comparisonSha256:review.comparisonSha256,current:review.current,
    base:review.base,returned:review.returned,total:review.total,
    requestFields:{requestId:'Choose one stable unique request ID and retain it.',reviewId:review.reviewId,
      expectedRevision:review.current.revision,comparisonSha256:review.comparisonSha256,
      reviewedBy:'Name the authorized reviewer.',reviewNote:'Optional explanation; omission stays omitted.',
      decisions:'One explicit {itemId, choice, value?} for every item. Preserve complete native objects for EDIT.'},
    meaning:'Review the complete comparison, supplied choice labels/effects and full values. An authorized person or agent may author the exact request. Typed RETURNED retains a proposal while current typed authority remains unchanged. No choice is inferred.',
    command:'Repeat the original --returns command with --review-key '+keyName+
      ' --review-file /absolute/review.json --review-sha256 SHA256'};
}
async function baselineReceive(root,selected,python,node){
  const receipt=join(root,'BASELINE_RECEIVED.json');
  if(!await exists(receipt))await runProcess(python,[join(HERE,'receive-customer.py'),'receive',
    '--archive',selected.baseline.file,'--sha256',selected.baseline.sha256,
    '--directory',join(root,'baseline-received'),'--node',node,'--python',python,'--result',receipt],
    {cwd:root,logFile:join(root,'baseline-process-'+randomUUID()+'.json')});
  const received=await value(receipt);
  need(received.archive.sha256===selected.baseline.sha256&&received.archive.bytes===selected.baseline.bytes,
    'CUSTOMER_RETURN_BASELINE_ARCHIVE_CHANGED');
  const packageDirectory=absolute(received.packageDirectory);
  need(packageDirectory===join(root,'baseline-received','package'),'CUSTOMER_RETURN_BASELINE_PATH_CHANGED');
  const manifestFile=join(packageDirectory,'PACKAGE_MANIFEST.json');
  const manifest=JSON.parse((await read(manifestFile,16*1024*1024,received.manifestSha256)).toString('utf8'));
  need(manifest.schema==='sf88.research-customer-package.v1'&&manifest.native?.dossierId===selected.selection.dossier_id&&
    Array.isArray(manifest.files),'CUSTOMER_RETURN_BASELINE_DOSSIER_CHANGED');
  const names=new Set();
  for(const row of manifest.files){
    member(row.path);need(!names.has(row.path),'CUSTOMER_RETURN_BASELINE_MEMBER_REPEATED');names.add(row.path);
    await checked({...row,file:join(packageDirectory,...row.path.split('/'))});
  }
  for(const name of ['portable','metadata','history'])need(names.has(manifest.native[name]),'CUSTOMER_RETURN_BASELINE_NATIVE_MISSING');
  need(names.has('PROGRAMME.json')&&names.has('ENGINE_SOURCE.json'),'CUSTOMER_RETURN_BASELINE_PROGRAMME_MISSING');
  const programme=await value(join(packageDirectory,'PROGRAMME.json'));
  need(['sf88.research-customer-programme-native.v1','sf88.research-customer-return-programme-native.v1'].includes(programme.schema)&&
    programme.state==='NATIVE_RECEIVED'&&programme.operationId===manifest.operationId&&same(programme.native,manifest.native)&&
    programme.selectionSha256===manifest.selectionSha256&&programme.engine?.manifestSha256===digest(await read(join(packageDirectory,'ENGINE_SOURCE.json'))),
    'CUSTOMER_RETURN_BASELINE_PROGRAMME_CHANGED');
  const metadata=await value(join(packageDirectory,...manifest.native.metadata.split('/')));
  const history=await value(join(packageDirectory,...manifest.native.history.split('/')));
  need(metadata.id===selected.selection.dossier_id&&metadata.revision===manifest.native.revision&&
    history.length===metadata.revision&&received.native?.selectedRevision===metadata.revision,
    'CUSTOMER_RETURN_BASELINE_HISTORY_CHANGED');
  return {received,manifest,metadata,history,programme,manifestSha256:received.manifestSha256};
}
function historyEntry(stage,operationId){
  return {operationId,key:stage.key,itemCount:stage.itemCount,reviewId:stage.reviewId,
    comparisonSha256:stage.comparisonSha256,requestSha256:stage.requestSha256,
    source:{id:stage.receipt.sourceId,bytes:stage.source.bytes,sha256:stage.source.sha256},
    receipt:stage.receipt};
}
function inheritedHistory(baseline){
  if(baseline.programme.schema==='sf88.research-customer-programme-native.v1')return [];
  const programme=baseline.programme,rows=programme.returnHistory;
  need(Array.isArray(rows)&&rows.length>0&&rows.length<=100000&&
    Array.isArray(programme.returns)&&programme.returns.length>0&&programme.returns.length<=rows.length,
    'CUSTOMER_RETURN_INHERITED_HISTORY_REQUIRED');
  const requests=new Set(),ids=new Set();let previousRevision=0,total=0;
  for(const row of rows){
    need(object(row)&&object(row.receipt)&&object(row.source),'CUSTOMER_RETURN_INHERITED_RECEIPT_INVALID');
    key(row.operationId);key(row.key);
    const receipt=row.receipt;
    need(typeof receipt.requestId==='string'&&receipt.requestId.length>0&&receipt.requestId.length<=200&&
      !requests.has(receipt.requestId)&&/^drr_[a-f0-9]{64}$/.test(receipt.id??'')&&!ids.has(receipt.id),
      'CUSTOMER_RETURN_INHERITED_RECEIPT_REPEATED');
    requests.add(receipt.requestId);ids.add(receipt.id);
    need(Array.isArray(receipt.decisions)&&Number.isSafeInteger(row.itemCount)&&
      row.itemCount===receipt.decisions.length&&row.reviewId===receipt.reviewId&&
      row.comparisonSha256===receipt.comparisonSha256&&/^[a-f0-9]{64}$/.test(row.requestSha256??'')&&
      Number.isSafeInteger(receipt.revision)&&receipt.revision>previousRevision&&
      baseline.history[receipt.revision-1]?.sha256===receipt.revisionSha256,
      'CUSTOMER_RETURN_INHERITED_HISTORY_CHANGED');
    need(Number.isSafeInteger(row.source.bytes)&&row.source.bytes>0&&row.source.bytes<=MAXIMUM&&
      /^[a-f0-9]{64}$/.test(row.source.sha256??'')&&row.source.id==='drs_'+row.source.sha256&&
      receipt.sourceId===row.source.id,'CUSTOMER_RETURN_INHERITED_SOURCE_CHANGED');
    previousRevision=receipt.revision;total+=row.itemCount;
  }
  need(previousRevision===baseline.metadata.revision&&programme.reviewedItemCount===total&&
    Number.isSafeInteger(programme.maximumTotalItems)&&total<=programme.maximumTotalItems&&
    same(rows.slice(-programme.returns.length),programme.returns.map(row=>historyEntry(row,programme.operationId))),
    'CUSTOMER_RETURN_INHERITED_SCOPE_CHANGED');
  return rows;
}
async function startClient(root,workspaceDirectory,workspaceId,python){
  const listenerFile=join(root,'listener.private.json');
  const previous=await exists(listenerFile)?await value(listenerFile):null;
  if(previous)need(previous.workspaceDirectory===workspaceDirectory&&previous.workspaceId===workspaceId,
    'CUSTOMER_RETURN_LISTENER_CHANGED');
  const app=await startDossierWorkspace({directory:workspaceDirectory,port:previous?.port??0,
    clinicalTrialsPython:python,extractionPython:python});
  let client;
  try{
    need(app.workspaceId===workspaceId,'CUSTOMER_RETURN_WRONG_WORKSPACE');
    await retain(listenerFile,{workspaceDirectory,workspaceId,port:Number(new URL(app.origin).port)});
    client=new ResearchWorkspaceClient({url:app.url,directory:workspaceDirectory,expectedWorkspaceId:workspaceId});
    need((await client.status()).workspaceId===workspaceId,'CUSTOMER_RETURN_WRONG_WORKSPACE');
    return {app,client};
  }catch(error){if(client)await client.close();await app.close();throw error;}
}
async function originalFinalExport(client,root,id,revision,format){
  const selected={dossierId:id,revision,format};
  const result=await download(root,'current.'+format,selected,async file=>{
    const original=await client.exportDossier(id,{revision,format,file});
    // This selection records the exact authenticated original export request.
    // Unlike return reports it is not advertised as a native identity header.
    return {...original,selection:selected};
  });
  if(format==='json.gz'){
    const body=await checked(result);need(body[0]===31&&body[1]===139,'CUSTOMER_RETURN_FINAL_PORTABLE_REQUIRED');
  }
  return result;
}
function handoverGuide(selection,returns,native){
  return '<!doctype html>\n<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+html(selection.customer_label)+' · Reviewed returns</title><style>'+
    '*{box-sizing:border-box}body{margin:0;background:#eee;color:#222;font:16px/1.6 system-ui,sans-serif}'+
    'main{max-width:1040px;margin:auto;padding:32px;background:#fff;min-height:100vh}h1{border-top:5px solid #333;padding-top:20px}'+
    'a{color:inherit}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}'+
    'pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eee;padding:16px}.scroll{overflow:auto}@media(max-width:600px){main{padding:20px}table{min-width:650px}}</style>'+
    '<main><h1>'+html(selection.customer_label)+'</h1><p>The original customer programme and every complete collaborator return are retained. This successor carries the explicitly accepted dossier at revision '+native.revision+'.</p>'+
    '<p><a href="dossier/current.html">Current report</a> · <a href="dossier/current.json.gz">Editable dossier</a> · '+
    '<a href="baseline/original-customer-programme.zip">Complete original programme</a></p>'+
    '<h2>Reviewed returns</h2><div class="scroll"><table><thead><tr><th>Return</th><th>Reviewer</th><th>Items</th><th>Accepted revision</th><th>Complete evidence</th></tr></thead><tbody>'+
    returns.map(row=>'<tr><td>'+html(row.key)+'</td><td>'+html(row.receipt.reviewedBy)+'</td><td>'+row.itemCount+'</td><td>'+row.receipt.revision+
      '</td><td><a href="returns/'+row.key+'/accepted.html">Accepted report</a> · <a href="returns/'+row.key+'/comparison.html">Original comparison</a> · '+
      '<a href="returns/'+row.key+'/original-return.bin">Original return bytes</a> · <a href="returns/'+row.key+'/REQUEST.json">Exact request</a></td></tr>').join('')+
    '</tbody></table></div><p>Typed histories and unknown extensions selected from a returned branch remain reviewed source-bound proposals. They do not replace active current native histories. Each original branch remains independently exportable and editable.</p>'+
    '<h2>Continue in the original Research workspace</h2><pre>node engine/'+PREFIX+
    'customer-programme/receiving.mjs --open --serve --package-directory /absolute/extracted/package --workspace-directory /absolute/private/research</pre>'+
    '<p><a href="ENGINE_AND_OPERATION_GUIDE.md">Complete operating and receiving guide</a> · <a href="PROGRAMME.json">Original native identities</a> · '+
    '<a href="PACKAGE_MANIFEST.json">Complete source and output inventory</a></p></main></html>\n';
}
export async function runCustomerReturnProgramme(options){
  const root=await directory(absolute(options.directory));
  return withPrivateLock(root,'customer-programme-returns.lock',async()=>{
    const selected=await readSelection(options,root),s=selected.selection;
    const workspaceDirectory=absolute(options.workspaceDirectory);
    const engine=await readEngineSelection({root:absolute(options.engineRoot),manifestFile:absolute(options.engineManifestFile),
      manifestSha256:options.engineManifestSha256});
    for(const name of ['engine.mjs','store.mjs','source.mjs','contracts.mjs','client.mjs','routes.mjs'])
      need(engine.files.some(row=>row.path===PREFIX+'dossier-returns/'+name),'CUSTOMER_RETURN_ORIGINAL_ENGINE_INCOMPLETE');
    const python=options.python??'python3',node=options.node??process.execPath;
    const binding={schema:'sf88.research-customer-return-operation.v1',operationId:s.operation_id,
      selectionSha256:selected.selectionSha256,baseline:selected.baseline,workspaceDirectory,workspaceId:s.workspace_id,
      dossierId:s.dossier_id,engineRoot:engine.root,engineManifestSha256:engine.manifestSha256,
      implementation:engine.implementation.map(({file,...row})=>row),python,node};
    await retain(join(root,'operation.json'),binding);
    const finalFile=join(root,'COMPLETE.json');
    if(await exists(finalFile)){
      const result=await value(finalFile);need(same(result.binding,binding),'CUSTOMER_RETURN_COMPLETED_SELECTION_CHANGED');
      if(options.reviewKey){
        const original=join(root,'operations','returns',options.reviewKey,'REQUEST.original.json');
        const supplied=await read(options.reviewFile,16*1024*1024,options.reviewSha256);
        need((await read(original,16*1024*1024)).equals(supplied),'CUSTOMER_RETURN_COMPLETED_REQUEST_CHANGED');
      }
      await verifyFiles(result.files);return result;
    }
    const baseline=await baselineReceive(root,selected,python,node);
    need(s.expected_revision>=baseline.metadata.revision,'CUSTOMER_RETURN_BASELINE_NEWER_THAN_SELECTION');
    const owner=await startClient(root,workspaceDirectory,s.workspace_id,python);
    let primary,closed=false;
    async function closeOwned(){
      if(closed)return;
      const failures=[];
      try{await owner.client.close();}catch(error){failures.push(error);}
      try{await owner.app.close();}catch(error){failures.push(error);}
      need(!failures.length,'CUSTOMER_RETURN_LISTENER_CLOSE_FAILED');closed=true;
    }
    try{
      const client=owner.client,helper=client.dossierReturns(s.dossier_id),results=[],inherited=inheritedHistory(baseline);
      const priorItems=inherited.reduce((total,row)=>total+row.itemCount,0);
      need(priorItems<=s.maximum_total_items,'CUSTOMER_RETURN_INHERITED_ITEM_BOUND');
      const baselineHead=await head(client,s.dossier_id,baseline.metadata.revision);
      need(baselineHead.sha256===baseline.history.at(-1)?.sha256&&same(baselineHead.history,baseline.history),
        'CUSTOMER_RETURN_BASELINE_WORKSPACE_CHANGED');
      for(const row of inherited){
        const actual=(await helper.list({requestId:row.receipt.requestId})).return;
        need(actual&&same(actual,row.receipt),'CUSTOMER_RETURN_INHERITED_NATIVE_RECEIPT_CHANGED');
        const original=await helper.list({reviewId:row.reviewId,offset:0,limit:1});
        need(original.reviewId===row.reviewId&&original.comparisonSha256===row.comparisonSha256&&
          original.total===row.itemCount&&original.source.id===row.source.id&&
          original.source.bytes===row.source.bytes&&original.source.sha256===row.source.sha256&&
          same(original.current,actual.current)&&same(original.base,actual.base)&&same(original.returned,actual.returned),
          'CUSTOMER_RETURN_INHERITED_NATIVE_SOURCE_CHANGED');
      }
      await retain(join(root,'INHERITED_RETURNS.json'),{baselineArchive:selected.baseline,
        baselineManifestSha256:baseline.manifestSha256,reviewedItemCount:priorItems,returnHistory:inherited});
      for(const row of s.returns){
        const slot=await directory(join(root,'operations','returns',row.key)),publicStage=await directory(join(slot,'public'));
        const source=selected.sources.get(row.key),preparedFile=join(slot,'PREPARED.json');
        let prepared;
        if(await exists(preparedFile))prepared=await value(preparedFile);
        else{
          const sourceReceipt=await step(slot,'receive-source',async()=>({source,filename:row.source.filename,contentType:row.source.contentType}),
            async request=>helper.receiveSource({file:request.source.file,filename:request.filename,
              contentType:request.contentType,expectedSha256:request.source.sha256}));
          need(sourceReceipt.source.id==='drs_'+source.sha256&&sourceReceipt.source.bytes===source.bytes,
            'CUSTOMER_RETURN_ORIGINAL_SOURCE_CHANGED');
          const preview=await step(slot,'preview',async()=>{
            const current=await head(client,s.dossier_id);prefix(current.history,baseline.history);
            if(!results.length)need(current.revision===s.expected_revision&&current.sha256===s.expected_revision_sha256,
              'CUSTOMER_RETURN_INITIAL_HEAD_CHANGED');
            else{
              const previous=results.at(-1).receipt;
              need(current.history[previous.revision-1]?.sha256===previous.revisionSha256,
                'CUSTOMER_RETURN_PREVIOUS_ACCEPTANCE_CHANGED');
            }
            return {sourceId:sourceReceipt.source.id,expectedRevision:current.revision,
              expectedSha256:current.sha256,previousReturn:results.at(-1)?.receipt??inherited.at(-1)?.receipt??null};
          },async request=>{
            const result=await helper.preview({sourceId:request.sourceId,expectedRevision:request.expectedRevision});
            need(result.current.revision===request.expectedRevision&&result.current.sha256===request.expectedSha256&&
              result.source.id===request.sourceId,'CUSTOMER_RETURN_PREVIEW_HEAD_CHANGED');return result;
          });
          const review=await comparison(helper,preview.reviewId,row.maximum_items);
          need(review.source.id===sourceReceipt.source.id&&review.source.sha256===source.sha256&&
            review.source.bytes===source.bytes&&review.comparisonSha256===preview.comparisonSha256,
            'CUSTOMER_RETURN_PREVIEW_SOURCE_CHANGED');
          prepared={schema:'sf88.research-customer-return-prepared.v1',operationId:s.operation_id,key:row.key,
            workspaceId:s.workspace_id,dossierId:s.dossier_id,source,sourceReceipt,review,
            previousReturn:results.at(-1)?.receipt??inherited.at(-1)?.receipt??null};
          await retain(preparedFile,prepared);
        }
        need(prepared.operationId===s.operation_id&&prepared.key===row.key&&prepared.workspaceId===s.workspace_id&&
          prepared.dossierId===s.dossier_id&&same(prepared.source,source)&&
          same(prepared.previousReturn,results.at(-1)?.receipt??inherited.at(-1)?.receipt??null),'CUSTOMER_RETURN_PREPARATION_CHANGED');
        const review=prepared.review;
        need(review.total<=row.maximum_items&&review.source.id==='drs_'+source.sha256&&
          review.source.sha256===source.sha256&&review.source.bytes===source.bytes,'CUSTOMER_RETURN_RETAINED_SOURCE_CHANGED');
        need(priorItems+results.reduce((total,row)=>total+row.itemCount,0)+review.total<=s.maximum_total_items,
          'CUSTOMER_RETURN_TOTAL_ITEM_BOUND');
        await retain(join(publicStage,'COMPARISON.json'),review);
        await retain(join(publicStage,'SOURCE_RECEIPT.json'),prepared.sourceReceipt);
        await reviewExports(helper,slot,review,null);
        const requestFile=join(slot,'REQUEST.original.json');
        if(options.reviewKey===row.key){
          const raw=await read(options.reviewFile,16*1024*1024,options.reviewSha256);
          const request=JSON.parse(raw.toString('utf8'));validateRequest(request,review);
          await retainBytes(requestFile,raw);
        }
        const reviewInstructions=instructions(review,s,row.key);
        await retain(join(publicStage,'REVIEW_INSTRUCTIONS.json'),{...reviewInstructions,state:'PREPARED_FOR_REVIEW'});
        if(!await exists(requestFile)){
          const waiting=reviewInstructions;
          const files=await copyStage(slot,join(root,'delivery','returns',row.key));
          return {...waiting,directory:root,comparisonFile:join(root,'delivery','returns',row.key,'COMPARISON.json'),
            files,reviewedItemCount:priorItems+results.reduce((total,row)=>total+row.itemCount,0),
            acceptedReturns:[...inherited,...results.map(row=>historyEntry(row,s.operation_id))]
              .map(value=>({operationId:value.operationId,key:value.key,return:value.receipt}))};
        }
        const rawRequest=await read(requestFile,16*1024*1024),request=JSON.parse(rawRequest.toString('utf8'));
        validateRequest(request,review);
        await retainBytes(join(publicStage,'REQUEST.json'),rawRequest);
        let receipt=(await helper.list({requestId:request.requestId})).return;
        if(!receipt){
          const choice=await helper.previewChoices({reviewId:request.reviewId,expectedRevision:request.expectedRevision,
            comparisonSha256:request.comparisonSha256,decisions:request.decisions});
          need(choice.valid===true&&choice.reviewId===review.reviewId&&choice.comparisonSha256===review.comparisonSha256,
            'CUSTOMER_RETURN_CHOICES_CHANGED');
          await retain(join(publicStage,'CHOICE_PREVIEW.json'),choice);
          await retain(join(slot,'DISPATCH.json'),{workspaceId:s.workspace_id,dossierId:s.dossier_id,
            requestSha256:digest(rawRequest),request,outcome:'UNCONFIRMED until the original request receipt is recovered'});
          receipt=(await helper.review(request)).return;
        }
        receipt=acceptedReceipt(receipt,request,review);
        const historical=await head(client,s.dossier_id,receipt.revision);
        need(historical.sha256===receipt.revisionSha256,'CUSTOMER_RETURN_ACCEPTED_HISTORY_CHANGED');
        prefix(historical.history,baseline.history);
        await retain(join(publicStage,'ACCEPTED_RETURN.json'),receipt);
        await reviewExports(helper,slot,review,receipt);
        await copyStage(slot,join(root,'delivery','returns',row.key));
        results.push({key:row.key,itemCount:review.total,source,reviewId:review.reviewId,
          comparisonSha256:review.comparisonSha256,requestSha256:digest(rawRequest),receipt});
      }
      const final=results.at(-1).receipt,accepted=await head(client,s.dossier_id,final.revision);
      const returnHistory=[...inherited,...results.map(row=>historyEntry(row,s.operation_id))];
      const reviewedItemCount=returnHistory.reduce((total,row)=>total+row.itemCount,0);
      need(new Set(returnHistory.map(row=>row.receipt.requestId)).size===returnHistory.length&&
        new Set(returnHistory.map(row=>row.receipt.id)).size===returnHistory.length,
        'CUSTOMER_RETURN_ACCEPTED_HISTORY_REPEATED');
      need(accepted.sha256===final.revisionSha256,'CUSTOMER_RETURN_FINAL_REVISION_CHANGED');
      const publicRoot=await directory(join(root,'delivery'));
      await retain(join(publicRoot,'dossier','current.metadata.json'),accepted.metadata);
      await retain(join(publicRoot,'dossier','history.json'),accepted.history);
      const exportRoot=await directory(join(root,'operations','final-exports'));
      for(const format of ['json.gz','html','md']){
        const file=await originalFinalExport(client,exportRoot,s.dossier_id,final.revision,format);
        await retainBytes(join(publicRoot,'dossier','current.'+format),await checked(file));
      }
      const engineModes=new Map();
      for(const row of engine.files){
        await retainBytes(join(publicRoot,'engine',...row.path.split('/')),await checked(row));
        engineModes.set('engine/'+row.path,row.mode);
      }
      const selectedPaths=new Set(engine.files.map(row=>row.path));
      for(const row of engine.implementation)if(!selectedPaths.has(row.path)){
        await retainBytes(join(publicRoot,'engine',...row.path.split('/')),await checked(row));
        engineModes.set('engine/'+row.path,row.mode);
      }
      await retainBytes(join(publicRoot,'ENGINE_SOURCE.json'),engine.manifestBytes);
      await retainBytes(join(publicRoot,'ENGINE_AND_OPERATION_GUIDE.md'),await read(join(HERE,'RETURNING.md')));
      const native={dossierId:s.dossier_id,revision:final.revision,portable:'dossier/current.json.gz',
        metadata:'dossier/current.metadata.json',history:'dossier/history.json'};
      const programme={schema:'sf88.research-customer-return-programme-native.v1',state:'NATIVE_RECEIVED',
        operationId:s.operation_id,customerLabel:s.customer_label,selectionSha256:selected.selectionSha256,
        workspaceId:s.workspace_id,native,returnHistory,reviewedItemCount,maximumTotalItems:s.maximum_total_items,baseline:{archive:{path:'baseline/original-customer-programme.zip',
          bytes:selected.baseline.bytes,sha256:selected.baseline.sha256},manifestSha256:baseline.manifestSha256,
          operationId:baseline.manifest.operationId,native:baseline.manifest.native},
        returns:results.map(({source,...row})=>({...row,source:{path:'returns/'+row.key+'/original-return.bin',
          bytes:source.bytes,sha256:source.sha256}})),
        engine:{repository:engine.repository,ref:engine.ref,manifestSha256:engine.manifestSha256,
          originalFiles:engine.files.length,implementationFiles:engine.implementation.length}};
      await retain(join(publicRoot,'PROGRAMME.json'),programme);
      await retainBytes(join(publicRoot,'START_HERE.html'),Buffer.from(handoverGuide(s,results,native)));
      const files=[];
      for(const row of await publicFiles(publicRoot)){
        const body=await checked(row);need(!body.includes(Buffer.from(owner.app.token)),'CUSTOMER_RETURN_SESSION_IN_PACKAGE');
        files.push({path:row.name,...pin(row),mode:engineModes.get(row.name)??'100644',
          kind:row.name.startsWith('engine/')?'engine':row.name.startsWith('returns/')?'dossier-return':
            row.name.startsWith('baseline/')?'baseline':row.name.startsWith('dossier/')?'native':'programme'});
      }
      const packageRequest={schema:'sf88.research-customer-package-build.v1',operationId:s.operation_id,
        customerLabel:s.customer_label,selectionSha256:selected.selectionSha256,native,engine:programme.engine,files,
        output:join(root,s.output.filename_stem+'.zip'),maximumArchiveBytes:s.output.maximum_archive_bytes,
        resultFile:join(root,'PACKAGE_BUILT.json')};
      const build=await retain(join(root,'package-request.private.json'),packageRequest);
      if(!await exists(packageRequest.resultFile))await runProcess(python,[join(HERE,'receive-customer.py'),
        'build','--request',build.file,'--sha256',build.sha256],
        {cwd:root,logFile:join(root,'build-process-'+randomUUID()+'.json')});
      const built=await value(packageRequest.resultFile);await checked(built.archive);
      need(built.selectionSha256===selected.selectionSha256,'CUSTOMER_RETURN_BUILT_SELECTION_CHANGED');
      const receiveFile=join(root,'PACKAGE_RECEIVED.json');
      if(!await exists(receiveFile))await runProcess(python,[join(HERE,'receive-customer.py'),'receive',
        '--archive',built.archive.file,'--sha256',built.archive.sha256,'--directory',join(root,'cold-receiving'),
        '--node',node,'--python',python,'--result',receiveFile],
        {cwd:root,logFile:join(root,'receive-process-'+randomUUID()+'.json')});
      const received=await value(receiveFile);
      need(received.archive.sha256===built.archive.sha256&&received.native.dossierId===s.dossier_id&&
        received.native.selectedRevision===final.revision,'CUSTOMER_RETURN_COLD_RECEIVING_CHANGED');
      const result={schema:'sf88.research-customer-return-programme-complete.v1',state:'COMPLETE',binding,
        operationId:s.operation_id,customerLabel:s.customer_label,native,returns:programme.returns,
        returnHistory,reviewedItemCount,archive:built.archive,
        packageManifestSha256:built.manifestSha256,receiving:received,
        files:[built.archive,await descriptor(packageRequest.resultFile),await descriptor(receiveFile),
          await descriptor(join(publicRoot,'PROGRAMME.json')),await descriptor(join(publicRoot,'START_HERE.html'))]};
      await closeOwned();
      await retain(finalFile,result);return result;
    }catch(error){primary=error;throw error;}
    finally{
      try{await closeOwned();}catch(error){
        if(primary)primary.listenerCloseCode='CUSTOMER_RETURN_LISTENER_CLOSE_FAILED';
        else throw error;
      }
    }
  });
}
export async function runCustomerReturnsCli(args){
  if(args.length===0||args.includes('--help')){
    process.stdout.write('Usage: node programme.mjs --returns --selection FILE --selection-sha256 SHA256 --directory PRIVATE_RUN --workspace ORIGINAL_WORKSPACE --engine-root CHECKOUT --engine-manifest FILE --engine-manifest-sha256 SHA256 [--review-key KEY --review-file FILE --review-sha256 SHA256] [--python python3] [--node node]\n');return;
  }
  const allowed=['--selection','--selection-sha256','--directory','--workspace','--engine-root','--engine-manifest',
    '--engine-manifest-sha256','--review-key','--review-file','--review-sha256','--python','--node'],selected={};
  need(args.length%2===0,'CUSTOMER_RETURN_ARGUMENT_VALUE_REQUIRED');
  for(let i=0;i<args.length;i+=2){
    need(allowed.includes(args[i])&&!Object.hasOwn(selected,args[i])&&typeof args[i+1]==='string'&&args[i+1],
      'CUSTOMER_RETURN_ARGUMENT_INVALID');selected[args[i]]=args[i+1];
  }
  for(const name of allowed.slice(0,7))need(selected[name],'CUSTOMER_RETURN_ARGUMENT_REQUIRED');
  const result=await runCustomerReturnProgramme({selectionFile:resolve(selected['--selection']),
    selectionSha256:selected['--selection-sha256'],directory:resolve(selected['--directory']),
    workspaceDirectory:resolve(selected['--workspace']),engineRoot:resolve(selected['--engine-root']),
    engineManifestFile:resolve(selected['--engine-manifest']),engineManifestSha256:selected['--engine-manifest-sha256'],
    ...(selected['--review-key']?{reviewKey:selected['--review-key']}:{}),
    ...(selected['--review-file']?{reviewFile:resolve(selected['--review-file'])}:{}),
    ...(selected['--review-sha256']?{reviewSha256:selected['--review-sha256']}:{}),
    python:selected['--python']??'python3',node:selected['--node']??process.execPath});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}


export {
  head as readCustomerReturnHead,
  prefix as assertCustomerReturnPrefix,
  comparison as readCustomerReturnComparison,
  reviewExports as retainCustomerReturnReview,
  validateRequest as validateCustomerReturnRequest,
  acceptedReceipt as validateCustomerReturnReceipt,
  copyStage as publishCustomerReturnReview,
  originalFinalExport as retainCustomerReturnDossierExport
};

