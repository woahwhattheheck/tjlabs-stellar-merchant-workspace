// MIT. Original Bloccpay payroll/Horizon evidence review; no provider or ledger dispatch.
import {invariant,sha256,canonicalJSON,parseSourceJSON} from './source-json.mjs';
import {decimalParts,exactField} from './decimal.mjs';
import {reconcilePayroll} from './payroll.mjs';
import {projectResource} from './resources.mjs';

export const REVIEW_SCHEMA='bloccpay.horizon-payroll-review.v1';
export const CHOICE_SCHEMA='bloccpay.horizon-payroll-choice.v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const digest=value=>sha256(Buffer.from(canonicalJSON(value)));
const equal=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
const bounded=(value,label,max=255)=>{
 invariant(typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value),'HORIZON_REVIEW_TEXT_REQUIRED',{label});return value;
};
const unique=(value,label,max=10000)=>{
 invariant(Array.isArray(value)&&value.length>0&&value.length<=max&&value.every(x=>typeof x==='string'&&x.length>0)&&new Set(value).size===value.length,'HORIZON_REVIEW_DISTINCT_SELECTION_REQUIRED',{label});return [...value].sort();
};
function account(value){
 invariant(typeof value==='string'&&/^(?:G[A-Z2-7]{55}|M[A-Z2-7]{68})$/.test(value),'HORIZON_REVIEW_ACCOUNT_REQUIRED');
 return value;
}
function units(value){
 const parsed=decimalParts(value);invariant(parsed.scale<=7&&parsed.coefficient>=0n,'HORIZON_REVIEW_STELLAR_AMOUNT_REQUIRED');
 return parsed.coefficient*10n**BigInt(7-parsed.scale);
}
function memo(value,type){
 if(type==='none'){invariant(value===null||value===undefined||value==='','HORIZON_REVIEW_NONE_MEMO_CONFLICT');return{type:'none'};}
 invariant(typeof value==='string','HORIZON_REVIEW_MEMO_SOURCE_REQUIRED');
 if(type==='text'){const body=Buffer.from(value,'utf8');invariant(value.isWellFormed()&&body.length<=28,'HORIZON_REVIEW_TEXT_MEMO_LIMIT');return{type,bytesBase64:body.toString('base64')};}
 if(type==='id'){invariant(/^(?:0|[1-9][0-9]*)$/.test(value)&&BigInt(value)<=18446744073709551615n,'HORIZON_REVIEW_ID_MEMO_INVALID');return{type,value};}
 invariant(['hash','return'].includes(type),'HORIZON_REVIEW_MEMO_TYPE_REQUIRED');
 const body=Buffer.from(value,'base64');invariant(body.length===32&&body.toString('base64')===value,'HORIZON_REVIEW_HASH_MEMO_INVALID');return{type,value};
}
function selectedMemo(row,selection){
 return memo(selection.memo.field==='walletAddressMemo'?row.recipient?.walletAddressMemo:row.memo,selection.memo.type);
}
function observedMemo(transaction){return memo(transaction.memo,transaction.memo_type);}
function asset(value){
 if(value.asset_type==='native')return{code:'XLM',issuer:null};
 invariant(['credit_alphanum4','credit_alphanum12'].includes(value.asset_type),'HORIZON_REVIEW_ASSET_TYPE_UNSUPPORTED');
 invariant(typeof value.asset_code==='string'&&/^[a-zA-Z0-9]{1,12}$/.test(value.asset_code)&&typeof value.asset_issuer==='string'&&/^G[A-Z2-7]{55}$/.test(value.asset_issuer),'HORIZON_REVIEW_ASSET_IDENTITY_INVALID');
 return{code:value.asset_code,issuer:value.asset_issuer};
}
function sourceAmount(version){
 return exactField(version.value,version.value.type==='create_account'?'starting_balance':'amount',version.numberTokens??{});
}
function scope(row){return row.context?.providerScope??row.sourceScope??null;}
function connectionVersion(row,selection,connection){
 return row.environment===connection.environment&&row.connectionAlias===selection.connectionAlias&&scope(row)===connection.sourceScope&&row.context?.networkPassphrase===connection.networkPassphrase;
}
export function normalizeHorizonPayrollSelection(value){
 invariant(value&&typeof value==='object'&&!Array.isArray(value),'HORIZON_REVIEW_SELECTION_REQUIRED');
 invariant(Object.keys(value).every(key=>['programmeVersionId','payrollId','connectionAlias','sourceIds','captureIds','sourceAccounts','memo'].includes(key)),'HORIZON_REVIEW_UNKNOWN_SELECTION');
 const memoSelection=value.memo;
 invariant(memoSelection&&Object.keys(memoSelection).sort().join(',')==='field,type'&&['walletAddressMemo','memo'].includes(memoSelection.field)&&['none','text','id','hash','return'].includes(memoSelection.type),'HORIZON_REVIEW_EXPLICIT_MEMO_MAPPING_REQUIRED');
 return{programmeVersionId:bounded(value.programmeVersionId,'programmeVersionId'),payrollId:bounded(value.payrollId,'payrollId'),
  connectionAlias:bounded(value.connectionAlias,'connectionAlias'),sourceIds:unique(value.sourceIds,'sourceIds'),
  captureIds:value.captureIds?.length?unique(value.captureIds,'captureIds'):[],
  sourceAccounts:unique(value.sourceAccounts,'sourceAccounts',1000).map(account),memo:clone(memoSelection)};
}
function currentRows(snapshot){
 const byId=new Map(snapshot.versions.map(row=>[row.id,row]));
 return snapshot.resources.map(row=>{const value=byId.get(row.currentVersionId);invariant(value,'HORIZON_REVIEW_CURRENT_VERSION_MISSING',{id:row.currentVersionId});return value;});
}
function activeCorrections(rows){
 const superseded=new Set(rows.map(row=>row.supersedes).filter(Boolean));
 return rows.filter(row=>!superseded.has(row.id));
}
function pureReview(snapshot){
 const {selection,connection,programme,payroll}=snapshot;
 const definition=programme.definition,selectedSources=new Set(selection.sourceIds);
 invariant(payroll.programmeVersionId===programme.id&&payroll.data.programmeId===definition.id,'HORIZON_REVIEW_PROGRAMME_MISMATCH');
 invariant(definition.connectionAliases.includes(selection.connectionAlias)&&connection.provider==='horizon'&&connection.environment===definition.environment&&typeof connection.networkPassphrase==='string'&&connection.networkPassphrase,'HORIZON_REVIEW_CONNECTION_SCOPE_MISMATCH');
 const current=currentRows(snapshot);
 const coverage={selectionConflicts:snapshot.resources.filter(row=>row.conflict).map(row=>({resourceId:row.id,
  versionIds:snapshot.versions.filter(version=>version.localResourceId===row.id).map(version=>version.id)}))};
 const reconciliation=reconcilePayroll({programme:definition,payroll:payroll.data,versions:current,history:snapshot.versions,sources:snapshot.sources,corrections:snapshot.corrections,coverage});
 const nativeRows=new Map(reconciliation.rows.map(row=>[row.rowId,row]));
 const globalIssues=[],selectedVersions=snapshot.versions.filter(row=>selectedSources.has(row.sourceId)&&connectionVersion(row,selection,connection));
 for(const source of snapshot.sources.filter(row=>selectedSources.has(row.id))){
  if(source.bodyComplete!==true||source.classification?.outcome!=='accepted'||source.error||source.projectionError)globalIssues.push({code:'INCOMPLETE_OR_INVALID_ORIGINAL_SOURCE',sourceId:source.id});
  if(source.environment!==connection.environment||source.connectionAlias!==connection.alias||source.sourceScope!==connection.sourceScope)
   globalIssues.push({code:'SOURCE_CONNECTION_SCOPE_MISMATCH',sourceId:source.id});
 }
 const roots=selectedVersions.filter(row=>row.kind==='horizon-network'&&row.value.network_passphrase===connection.networkPassphrase);
 if(!roots.length)globalIssues.push({code:'SELECT_ORIGINAL_NETWORK_ROOT'});
 const rootConflicts=roots.filter(row=>snapshot.resources.some(resource=>resource.id===row.localResourceId&&resource.conflict));
 if(rootConflicts.length)globalIssues.push({code:'NETWORK_ROOT_CONFLICT',versionIds:rootConflicts.map(row=>row.id)});
 for(const capture of snapshot.captures){
  if(capture.connectionAlias!==selection.connectionAlias||capture.status!=='COMPLETE'||capture.next||(capture.rejectedSourceIds??[]).length||
    !capture.pages.every(page=>selectedSources.has(page.sourceId)))
   globalIssues.push({code:'CAPTURE_NOT_FULLY_SELECTED',captureId:capture.id,status:capture.status});
 }
 const mappings=payroll.data.rows.map(row=>{
  const issues=[],native=nativeRows.get(row.id);let destination=null,selected=null,expectedUnits=null;
  try{destination=account(row.recipient?.walletAddress);}catch{issues.push('ORIGINAL_STELLAR_RECIPIENT_REQUIRED');}
  try{selected=selectedMemo(row,selection);}catch(error){issues.push(error.code);}
  try{expectedUnits=units(row.amount).toString();}catch(error){issues.push(error.code);}
  if(row.currency!==definition.asset.code)issues.push('ORIGINAL_PAYROLL_CURRENCY_MISMATCH');
  if(native?.excluded)issues.push('ORIGINAL_ROW_EXCLUDED');
  if(native?.linkConflict)issues.push('ORIGINAL_LINK_CONFLICT');
  const knownHash=native?.chain?.transactionHash??native?.links?.stellarTransactionHash??null;
  return{rowId:row.id,externalPaymentId:row.externalPaymentId,destination,memo:selected,
   expectedAmount:row.amount,expectedUnits,asset:{code:definition.asset.code,issuer:definition.asset.issuer??null},
   knownTransactionHash:knownHash,nativeStatus:native?.status??null,issues};
 });
 const groups=new Map(),ignored=[];
 for(const row of selectedVersions){
  if(row.kind!=='horizon-operation')continue;
  const op=row.value;
  if(!['payment','path_payment_strict_send','path_payment_strict_receive','create_account'].includes(op.type)){
   ignored.push({versionId:row.id,operationId:row.resourceId,reason:'NOT_SUPPORTED_STELLAR_PAYMENT'});continue;
  }
  const key=canonicalJSON([connection.networkPassphrase,String(op.id??row.resourceId)]);
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
 }
 const rows=[],active=activeCorrections(snapshot.corrections);
 const unselected=version=>active.some(row=>['sourceId','versionId','resourceId'].some(field=>row[field]&&row[field]==={sourceId:version.sourceId,versionId:version.id,resourceId:version.localResourceId}[field])&&row.action==='exclude');
 for(const [key,observed]of groups){
  const first=observed[0],operationId=String(first.value.id??first.resourceId);
  const history=snapshot.versions.filter(row=>row.kind==='horizon-operation'&&String(row.resourceId)===operationId&&connectionVersion(row,selection,connection));
  const issues=[];
  const projected=value=>Object.fromEntries(['id','type','from','from_muxed','to','to_muxed','funder','account','amount','starting_balance','asset_type','asset_code','asset_issuer','transaction_hash','transaction_successful','created_at'].map(k=>[k,value[k]??null]));
  if(new Set(history.map(row=>digest({value:projected(row.value),tokens:row.numberTokens??{}}))).size>1)issues.push({code:'CONFLICTING_OPERATION_HISTORY'});
  if(snapshot.resources.some(resource=>resource.id===first.localResourceId&&resource.conflict))issues.push({code:'ORIGINAL_RESOURCE_CONFLICT'});
  if(observed.some(unselected))issues.push({code:'ORIGINAL_OPERATION_EXCLUDED'});
  const op=first.value,txHash=op.transaction_hash??op.transaction?.hash;
  if(!/^[0-9a-f]{64}$/.test(txHash??''))issues.push({code:'ORIGINAL_TRANSACTION_HASH_REQUIRED'});
  const transactionHistory=snapshot.versions.filter(row=>row.kind==='horizon-transaction'&&row.resourceId===txHash&&connectionVersion(row,selection,connection));
  const inlineTransactionHistory=snapshot.versions.filter(row=>row.kind==='horizon-operation'&&connectionVersion(row,selection,connection)&&row.value.transaction&&
   (row.value.transaction_hash===txHash||row.value.transaction.hash===txHash));
  const transactions=transactionHistory.filter(row=>selectedSources.has(row.sourceId));
  if(transactions.some(unselected))issues.push({code:'ORIGINAL_TRANSACTION_EXCLUDED'});
  const joined=[...transactions.map(row=>row.value),...observed.map(row=>row.value.transaction).filter(Boolean)];
  const txProjection=value=>({hash:value.hash??null,successful:value.successful??null,memo_type:value.memo_type??null,memo:value.memo??null,ledger:value.ledger??null,created_at:value.created_at??null});
  if(!joined.length)issues.push({code:'ORIGINAL_TRANSACTION_JOIN_REQUIRED'});
  if(new Set(joined.map(row=>digest(txProjection(row)))).size>1)issues.push({code:'CONFLICTING_TRANSACTION_JOIN'});
  const historicalJoined=[...transactionHistory.map(row=>row.value),...inlineTransactionHistory.map(row=>row.value.transaction)];
  if(new Set(historicalJoined.map(row=>digest(txProjection(row)))).size>1)issues.push({code:'CONFLICTING_TRANSACTION_HISTORY',
   transactionVersionIds:transactionHistory.map(row=>row.id).sort(),inlineVersionIds:inlineTransactionHistory.map(row=>row.id).sort()});
  const transaction=joined[0];let from=null,to=null,amount=null,observedUnits=null,observedAsset=null,observedMemoValue=null;
  if(transaction?.hash!==txHash||transaction?.successful!==true||op.transaction_successful!==true)issues.push({code:'SUCCESSFUL_ORIGINAL_TRANSACTION_REQUIRED'});
  if(transactions.some(row=>snapshot.resources.some(resource=>resource.id===row.localResourceId&&resource.conflict)))issues.push({code:'ORIGINAL_TRANSACTION_CONFLICT'});
  try{from=account(op.from_muxed??op.from??op.funder);to=account(op.to_muxed??op.to??op.account);}catch(error){issues.push({code:error.code});}
  try{amount=sourceAmount(first);observedUnits=units(amount).toString();}catch(error){issues.push({code:error.code??'HORIZON_REVIEW_AMOUNT_MISSING'});}
  try{observedAsset=op.type==='create_account'?{code:'XLM',issuer:null}:asset(op);}catch(error){issues.push({code:error.code});}
  try{observedMemoValue=observedMemo(transaction??{});}catch(error){issues.push({code:error.code??'HORIZON_REVIEW_MEMO_MISSING'});}
  if(!selection.sourceAccounts.includes(from))issues.push({code:'SENDER_OUTSIDE_EXPLICIT_SELECTION'});
  const observedAt=Date.parse(op.created_at??transaction?.created_at);
  if(!Number.isFinite(observedAt)||observedAt<Date.parse(definition.period.start)||observedAt>=Date.parse(definition.period.end))issues.push({code:'OUTSIDE_ORIGINAL_PAYROLL_PERIOD'});
  const candidates=[],near=[];
  for(const mapping of mappings){
   if(mapping.destination!==to)continue;
   const why=[];
   if(!equal(mapping.asset,observedAsset))why.push('ASSET_MISMATCH');
   if(!equal(mapping.memo,observedMemoValue))why.push('MEMO_MISMATCH');
   if(mapping.issues.length)why.push(...mapping.issues);
   if(mapping.knownTransactionHash&&mapping.knownTransactionHash!==txHash)why.push('CONFLICTS_WITH_ORIGINAL_TRANSACTION_LINK');
   if(why.length){near.push({rowId:mapping.rowId,reasons:why});continue;}
   if(observedUnits===null||mapping.expectedUnits===null)continue;
   const difference=BigInt(observedUnits)-BigInt(mapping.expectedUnits);
   candidates.push({rowId:mapping.rowId,externalPaymentId:mapping.externalPaymentId,
    expectedAmount:mapping.expectedAmount,expectedUnits:mapping.expectedUnits,differenceUnits:difference.toString(),
    amountRelation:difference===0n?'EXACT':difference<0n?'LESS_THAN_PAYROLL':'GREATER_THAN_PAYROLL',
    alreadyLinked:mapping.knownTransactionHash===txHash});
  }
  const exact=candidates.filter(row=>row.amountRelation==='EXACT');
  rows.push({movementId:digest(key),operationId,transactionHash:txHash??null,networkPassphrase:connection.networkPassphrase,
   versionIds:observed.map(row=>row.id).sort(),historyVersionIds:history.map(row=>row.id).sort(),transactionVersionIds:transactions.map(row=>row.id).sort(),
   transactionHistoryVersionIds:transactionHistory.map(row=>row.id).sort(),inlineTransactionHistoryVersionIds:inlineTransactionHistory.map(row=>row.id).sort(),
   from,to,amount,units:observedUnits,asset:observedAsset,memo:observedMemoValue,createdAt:op.created_at??transaction?.created_at??null,
   ledger:transaction?.ledger??null,candidates,near,issues,
   status:globalIssues.length||issues.length?'BLOCKED':exact.length>1?'AMBIGUOUS':exact.length===1?(exact[0].alreadyLinked?'LINKED':'CANDIDATE'):candidates.length?'AMOUNT_DIFFERENCE':'UNMATCHED'});
 }
 rows.sort((a,b)=>a.operationId<b.operationId?-1:a.operationId>b.operationId?1:0);
 const ownership=new Map();
 for(const correction of activeCorrections(snapshot.corrections)){
  const movementId=correction.horizonReview?.movementId;
  if(movementId)ownership.set(movementId,[...(ownership.get(movementId)??[]),correction.id]);
 }
 for(const row of rows)if(ownership.has(row.movementId)){row.issues.push({code:'EXISTING_HORIZON_REVIEW_CHOICE',correctionIds:ownership.get(row.movementId)});row.status='BLOCKED';}
 return{mappings,globalIssues,rows,ignored,nativeReconciliation:reconciliation,
  summary:{movements:rows.length,...Object.fromEntries(['BLOCKED','AMBIGUOUS','LINKED','CANDIDATE','AMOUNT_DIFFERENCE','UNMATCHED'].map(status=>[status,rows.filter(row=>row.status===status).length]))}};
}
export async function reviewHorizonPayroll(workspace,requested){
 const selection=normalizeHorizonPayrollSelection(requested);
 const before=workspace.describe(),connection=before.connections.find(row=>row.alias===selection.connectionAlias);
 invariant(connection,'HORIZON_REVIEW_ORIGINAL_CONNECTION_REQUIRED');
 const programme=workspace.privateItem('programmes',selection.programmeVersionId),payroll=workspace.privateItem('payrolls',selection.payrollId);
 const aliases=new Set(programme.definition.connectionAliases);
 const scoped=row=>row.environment===programme.definition.environment&&aliases.has(row.connectionAlias);
 const versions=workspace.privateList('resourceVersions').filter(scoped);
 const resources=workspace.privateList('resources').filter(scoped);
 const sourceIds=new Set([payroll.sourceId,...programme.sourceIds,...selection.sourceIds,...versions.map(row=>row.sourceId)]);
 const sources=[...sourceIds].sort().map(id=>workspace.privateItem('sources',id));
 const captures=selection.captureIds.map(id=>workspace.privateItem('captures',id));
 const corrections=workspace.privateList('corrections').filter(row=>row.programmeVersionId===programme.id&&row.payrollId===payroll.id);
 const originalFiles=[];
 for(const source of sources){
  for(const fileId of [...new Set([source.requestFileId,source.responseFileId,source.receiptFileId,source.originalFileId].filter(Boolean))]){
   const file=workspace.file(fileId,{private:true}),body=await workspace.fileBytes(fileId,{private:true});
   invariant(body.length===file.bytes&&sha256(body)===file.sha256,'HORIZON_REVIEW_ORIGINAL_SOURCE_CHANGED');
   if(fileId===source.responseFileId)invariant(file.sha256===source.bodySha256&&file.bytes===source.bytes,'HORIZON_REVIEW_SOURCE_BODY_BINDING_CHANGED');
   if(fileId===source.receiptFileId&&source.provider==='horizon'){
    const exchange=parseSourceJSON(body,{maxBytes:body.length}).value;
    if(exchange.classification?.outcome==='accepted'&&exchange.response?.complete){
     const raw=Buffer.from(exchange.response.bodyBase64,'base64');
     invariant(raw.toString('base64')===exchange.response.bodyBase64&&raw.length===source.bytes&&sha256(raw)===source.bodySha256,'HORIZON_REVIEW_EXCHANGE_BODY_CHANGED');
     const parsed=parseSourceJSON(raw,{maxBytes:raw.length});
     invariant(equal(parsed,exchange.parsed),'HORIZON_REVIEW_ORIGINAL_PARSED_BODY_CHANGED');
     const projected=projectResource({exchange,environment:source.environment,sourceReference:{sourceId:source.id,connectionAlias:source.connectionAlias,sourceScope:source.sourceScope,provider:'horizon',network:source.network,networkPassphrase:source.networkPassphrase,observedAt:source.createdAt}});
     for(const version of versions.filter(row=>row.sourceId===source.id))invariant(projected.some(row=>row.kind===version.kind&&row.id===String(version.resourceId)&&row.pointer===version.pointer&&row.contentSha256===version.contentSha256&&equal(row.value,version.value)&&equal(row.numberTokens,version.numberTokens)),'HORIZON_REVIEW_ORIGINAL_PROJECTION_CHANGED',{versionId:version.id});
    }
   }
   originalFiles.push({sourceId:source.id,fileId,bytes:file.bytes,sha256:file.sha256});
  }
 }
 const after=workspace.describe();
 invariant(before.workspace.id===after.workspace.id&&before.workspace.revision===after.workspace.revision&&before.workspace.head===after.workspace.head,'HORIZON_REVIEW_WORKSPACE_CHANGED');
 const snapshot={workspaceId:before.workspace.id,workspaceRevision:before.workspace.revision,workspaceHead:before.workspace.head,
  selection,connection,programme:clone(programme),payroll:clone(payroll),versions:clone(versions),resources:clone(resources),
  sources:clone(sources),captures:clone(captures),corrections:clone(corrections),originalFiles};
 const result={schema:REVIEW_SCHEMA,...snapshot,...pureReview(snapshot)};
 return{...result,reviewSha256:digest(result)};
}
export function inspectHorizonPayrollReview(value){
 invariant(value&&value.schema===REVIEW_SCHEMA&&typeof value.reviewSha256==='string','HORIZON_REVIEW_REQUIRED');
 const {reviewSha256,...body}=value;invariant(digest(body)===reviewSha256,'HORIZON_REVIEW_CHANGED');
 invariant(equal(value.selection,normalizeHorizonPayrollSelection(value.selection)),'HORIZON_REVIEW_SELECTION_CHANGED');
 invariant(equal(pureReview(body),Object.fromEntries(['mappings','globalIssues','rows','ignored','nativeReconciliation','summary'].map(key=>[key,body[key]]))),'HORIZON_REVIEW_RESULT_CHANGED');
 return value;
}
export function prepareHorizonPayrollChoice(review,{requestId,movementId,rowId,actor,reason}){
 inspectHorizonPayrollReview(review);bounded(requestId,'requestId',199);bounded(actor,'actor',4000);bounded(reason,'reason',4000);
 const movement=review.rows.find(row=>row.movementId===movementId);
 invariant(movement&&['CANDIDATE','AMBIGUOUS'].includes(movement.status),'HORIZON_REVIEW_MOVEMENT_NOT_SELECTABLE');
 const candidate=movement.candidates.find(row=>row.rowId===rowId&&row.amountRelation==='EXACT'&&!row.alreadyLinked);
 invariant(candidate,'HORIZON_REVIEW_EXACT_UNLINKED_ROW_REQUIRED');
 const body=Buffer.from(canonicalJSON(review)+'\n'),fileId='private-'+sha256(body);
 const request={requestId,expectedRevision:review.workspaceRevision,method:'correction.save',args:{
  programmeVersionId:review.programme.id,payrollId:review.payroll.id,payrollRowId:rowId,action:'link',actor,reason,
  links:{stellarTransactionHash:movement.transactionHash},
  horizonReview:{schema:REVIEW_SCHEMA,reviewSha256:review.reviewSha256,reviewFileId:fileId,movementId,
   operationId:movement.operationId,versionIds:movement.versionIds,transactionVersionIds:movement.transactionVersionIds,
   networkPassphrase:movement.networkPassphrase,from:movement.from,to:movement.to,asset:movement.asset,memo:movement.memo,
   observedAmount:movement.amount,expectedAmount:candidate.expectedAmount}
 }};
 return{schema:CHOICE_SCHEMA,workspaceId:review.workspaceId,review,request};
}
export async function applyHorizonPayrollChoice(workspace,choice){
 invariant(choice?.schema===CHOICE_SCHEMA&&choice.workspaceId===workspace.describe().workspace.id,'HORIZON_REVIEW_CHOICE_WORKSPACE_MISMATCH');
 const args=choice.request?.args;
 const expected=prepareHorizonPayrollChoice(choice.review,{requestId:choice.request?.requestId,movementId:args?.horizonReview?.movementId,rowId:args?.payrollRowId,actor:args?.actor,reason:args?.reason});
 invariant(equal(choice,expected),'HORIZON_REVIEW_CHOICE_CHANGED');
 let retained=null;
 try{retained=workspace.item('requests',choice.request.requestId);}catch(error){if(error.code!=='RECORD_NOT_FOUND')throw error;}
 if(retained){
  invariant(retained.method===choice.request.method&&equal(retained.args,choice.request.args)&&retained.expectedRevision===choice.request.expectedRevision,'HORIZON_REVIEW_ORIGINAL_REQUEST_CHANGED');
 }else{
  const current=await reviewHorizonPayroll(workspace,choice.review.selection);
  invariant(current.reviewSha256===choice.review.reviewSha256,'HORIZON_REVIEW_STALE_SELECTION');
 }
 const body=Buffer.from(canonicalJSON(choice.review)+'\n');
 const file=await workspace.retainFile(body,{filename:'horizon-payroll-review-'+choice.review.reviewSha256+'.json',contentType:'application/json',private:true});
 invariant(file.id===args.horizonReview.reviewFileId&&file.sha256===sha256(body)&&file.bytes===body.length,'HORIZON_REVIEW_RETAINED_FILE_CHANGED');
 return workspace.command(choice.request);
}
