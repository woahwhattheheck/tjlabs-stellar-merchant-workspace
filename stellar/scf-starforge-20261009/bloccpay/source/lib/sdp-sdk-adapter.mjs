// MIT. Invoice SDP desk delegation to the original Bloccpay operation writer.
import {invariant,sha256,canonicalJSON,parseSourceJSON} from './source-json.mjs';
import {lease,parseLedgerCSV} from './files.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
const base=value=>new URL(value).href.replace(/\/+$/,'');
const identity=value=>sha256(Buffer.from(canonicalJSON(value)));
const bodyBytes=value=>{
 invariant(typeof value==='string','SDK_EXACT_BODY_REQUIRED');
 const bytes=Buffer.from(value,'base64');
 invariant(bytes.toString('base64')===value,'SDK_EXACT_BODY_REQUIRED');
 return bytes;
};
export function equivalentInstructionCSV(original,incoming){
 const expected=parseLedgerCSV(original),actual=parseLedgerCSV(incoming);
 if(expected.headers.length!==actual.headers.length||expected.headers.some(name=>!actual.headers.includes(name))||
  expected.value.length!==actual.value.length||expected.value.length<1)return false;
 const originalIDs=new Set(),byPayment=new Map();
 for(const row of actual.value){
  if(!row.paymentID||byPayment.has(row.paymentID))return false;
  byPayment.set(row.paymentID,row);
 }
 for(const row of expected.value){
  if(!row.paymentID||originalIDs.has(row.paymentID))return false;
  originalIDs.add(row.paymentID);const selected=byPayment.get(row.paymentID);
  if(!selected||expected.headers.some(name=>row[name]!==selected[name]))return false;
 }
 return true;
}
function optional(workspace,table,id){
 try{return workspace.privateItem(table,id);}
 catch(error){if(error.code==='RECORD_NOT_FOUND')return null;throw error;}
}
function route(descriptor,scope){
 invariant(descriptor&&same(descriptor.scope,scope),'SDK_SCOPE_MISMATCH');
 invariant(typeof descriptor.operationId==='string'&&descriptor.operationId.length>0&&
  descriptor.operationId.length<=255,'SDK_OPERATION_ID_REQUIRED');
 const root=new URL(scope.origin.replace(/\/+$/,'')+'/'),url=new URL(descriptor.url);
 invariant(url.origin===root.origin&&!url.username&&!url.password&&!url.search&&!url.hash&&
  url.pathname.startsWith(root.pathname),'SDK_PROVIDER_URL_MISMATCH');
 const pathname=url.pathname.slice(root.pathname.length);
 const bytes=bodyBytes(descriptor.bodyBase64);
 if(descriptor.method==='POST'&&pathname==='disbursements'){
  invariant(descriptor.contentType==='application/json','SDK_CONTENT_TYPE_MISMATCH');
  return{action:'sdp.disbursement.create',input:{body:parseSourceJSON(bytes).value}};
 }
 const matched=/^disbursements\/([^/]+)\/(instructions|status)$/.exec(pathname);
 invariant(matched,'SDK_OPERATION_UNSUPPORTED');
 const id=decodeURIComponent(matched[1]);
 invariant(id&&id!=='.'&&id!=='..'&&!/[\x00-\x20\x7f/?#\\]/.test(id)&&encodeURIComponent(id)===matched[1],
  'SDK_PROVIDER_ID_INVALID');
 if(matched[2]==='status'){
  invariant(descriptor.method==='PATCH'&&descriptor.contentType==='application/json','SDK_CONTENT_TYPE_MISMATCH');
  const body=parseSourceJSON(bytes).value;
  invariant(Object.keys(body).length===1&&['STARTED','PAUSED','CANCELED'].includes(body.status),'SDK_STATUS_INVALID');
  return{action:'sdp.disbursement.status',input:{params:{id},body}};
 }
 invariant(descriptor.method==='POST','SDK_METHOD_MISMATCH');
 // Only the SDK's exact single-file encoding is admitted; the company producer
 // freezes its own native multipart bytes in the original prepared operation.
 const match=/^multipart\/form-data; boundary=(commons-sdp-[0-9a-f]{40})$/.exec(descriptor.contentType??'');
 invariant(match,'SDK_MULTIPART_CONTRACT_MISMATCH');
 const boundary=match[1];
 const prefix=Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="instructions.csv"\r\nContent-Type: text/csv\r\n\r\n');
 const suffix=Buffer.from('\r\n--'+boundary+'--\r\n');
 invariant(bytes.length>=prefix.length+suffix.length&&bytes.subarray(0,prefix.length).equals(prefix)&&
  bytes.subarray(-suffix.length).equals(suffix),'SDK_MULTIPART_CONTRACT_MISMATCH');
 const csv=bytes.subarray(prefix.length,bytes.length-suffix.length);
 invariant(boundary==='commons-sdp-'+sha256(csv).slice(0,40),'SDK_INSTRUCTIONS_HASH_MISMATCH');
 new TextDecoder('utf-8',{fatal:true}).decode(csv);
 return{action:'sdp.disbursement.instructions.upload',input:{params:{id}},instructions:csv};
}

export function createSDPCompanyTransactions({
 workspace,connectionAlias,scope,programmeVersionId,evidence={},selectEvidence,
 subscriptionId=null,signal:ownerSignal,
}={}){
 for(const name of ['describe','command','privateItem','privateList','fileBytes','webhook'])
  invariant(typeof workspace?.[name]==='function','ORIGINAL_COMPANY_WORKSPACE_REQUIRED',{name});
 invariant(typeof workspace.directory==='string','ORIGINAL_COMPANY_DIRECTORY_REQUIRED');
 invariant(typeof connectionAlias==='string'&&connectionAlias,'ORIGINAL_COMPANY_CONNECTION_REQUIRED');
 invariant(scope&&typeof scope.tenantId==='string'&&scope.tenantId&&scope.asset,'SDK_SCOPE_REQUIRED');
 const selectedScope=copy(scope),initial=workspace.describe();
 const connection=initial.connections.find(value=>value.alias===connectionAlias);
 invariant(connection?.provider==='sdp'&&base(connection.baseUrl)===base(scope.origin)&&
  connection.tenant===scope.tenantName&&connection.sourceWalletId===scope.sourceWalletId&&
  connection.networkPassphrase===scope.networkPassphrase,'SDK_COMPANY_CONNECTION_SCOPE_MISMATCH');
 invariant(typeof programmeVersionId==='string'&&programmeVersionId,'ORIGINAL_COMPANY_PROGRAMME_REQUIRED');
 const programme=workspace.privateItem('programmes',programmeVersionId);
 invariant(programme.definition.environment===connection.environment&&
  programme.definition.connectionAliases.includes(connectionAlias)&&
  programme.definition.sourceWalletId===scope.sourceWalletId&&
  programme.definition.asset.code===scope.asset.code&&programme.definition.asset.issuer===scope.asset.issuer,
  'SDK_COMPANY_PROGRAMME_SCOPE_MISMATCH');
 const originalWorkspaceId=initial.workspace.id,connectionIdentity=identity(connection);
 const active=new Set();let closing=false,closePromise=null;
 function check(){
  invariant(!closing,'SDK_COMPANY_ADAPTER_DRAINING');
  const current=workspace.describe();
  invariant(current.workspace.id===originalWorkspaceId,'SDK_COMPANY_WORKSPACE_CHANGED');
  invariant(identity(current.connections.find(value=>value.alias===connectionAlias))===connectionIdentity,
   'SDK_COMPANY_CONNECTION_CHANGED');
 }
 async function tracked(work){
  check();const pending=Promise.resolve().then(work);active.add(pending);
  try{return await pending;}finally{active.delete(pending);}
 }
 function combined(signal){
  const signals=[ownerSignal,signal].filter(Boolean);
  return signals.length>1?AbortSignal.any(signals):signals[0];
 }
 async function command(requestId,method,args,signal){
  for(let attempt=0;;attempt++){
   try{return await workspace.command({requestId,method,args,signal,expectedRevision:workspace.describe().workspace.revision});}
   catch(error){if(error.code!=='REVISION_CONFLICT'||attempt>=2)throw error;}
  }
 }
 function scoped(row){
  return row.environment===connection.environment&&row.connectionAlias===connectionAlias&&
   (row.context?.providerScope??row.sourceScope)===connection.sourceScope;
 }
 function latest(kind,predicate=()=>true){
  return workspace.privateList('resourceVersions').filter(row=>row.kind===kind&&scoped(row)&&predicate(row))
   .sort((a,b)=>String(b.observedAt??b.createdAt??b.context?.observedAt??'').localeCompare(String(a.observedAt??a.createdAt??a.context?.observedAt??''))||String(b.id).localeCompare(String(a.id)))[0];
 }
 function required(row,key){invariant(row,'ORIGINAL_COMPANY_EVIDENCE_REQUIRED',{key});return row.id;}
 async function selection(mapped,descriptor,requestSHA256){
  const selected=copy(selectEvidence?await selectEvidence({workspace,connectionAlias,scope:copy(selectedScope),
   programmeVersionId,descriptor:copy(descriptor),requestSHA256,action:mapped.action}):evidence);
  invariant(selected&&typeof selected==='object'&&!Array.isArray(selected),'ORIGINAL_COMPANY_EVIDENCE_REQUIRED');
  selected.programmeVersionId??=programmeVersionId;
  invariant(selected.programmeVersionId===programmeVersionId,'SDK_COMPANY_PROGRAMME_CHANGED');
  selected.versionIds??={};selected.sourceIds??={};
  const choose=(name,kind,predicate)=>{
   if(!selected.versionIds[name]&&!selected.sourceIds[name])selected.versionIds[name]=required(latest(kind,predicate),name);
  };
  choose('capabilities','sdp-capabilities',row=>row.value?.wallet_id===scope.sourceWalletId&&
   row.context?.credentialBinding===connection.credentialBinding&&!row.context?.requestInput?.query?.user_id&&
   !row.context?.requestInput?.query?.role&&!row.value?.user_id&&!row.value?.role);
  if(mapped.action==='sdp.disbursement.create'){
   const direct=['EMAIL_AND_WALLET_ADDRESS','PHONE_NUMBER_AND_WALLET_ADDRESS'].includes(mapped.input.body.registration_contact_type);
   choose('wallet','sdp-wallet',row=>direct?row.value?.enabled===true&&row.value?.user_managed===true:row.value?.id===mapped.input.body.wallet_id);
   choose('assets','sdp-asset',row=>row.value?.id===mapped.input.body.asset_id);
  }else{
   choose('disbursement','sdp-disbursement',row=>row.value?.id===mapped.input.params.id);
   if(mapped.instructions){
    const disbursement=workspace.privateItem('resourceVersions',selected.versionIds.disbursement);
    invariant(disbursement,'ORIGINAL_DISBURSEMENT_VERSION_REQUIRED');
    choose('wallet','sdp-wallet',row=>row.value?.id===(disbursement.value.wallet?.id??disbursement.value.wallet_id));
    let instructions=selected.instructionId?workspace.privateItem('instructions',selected.instructionId):null;
    if(!instructions){
     const candidates=workspace.privateList('instructions').filter(row=>
      row.programmeVersionId===programmeVersionId&&row.disbursementVersionId===disbursement.id&&
      row.walletVersionId===selected.versionIds.wallet).reverse();
     for(const candidate of candidates){
      const bytes=await workspace.fileBytes(candidate.fileId,{private:true});
      if(equivalentInstructionCSV(bytes,mapped.instructions)){instructions=candidate;break;}
     }
     invariant(instructions,'ORIGINAL_COMPANY_INSTRUCTIONS_REQUIRED');
     selected.instructionId=instructions.id;
    }
    invariant(instructions.programmeVersionId===programmeVersionId&&
     instructions.disbursementVersionId===disbursement.id&&instructions.walletVersionId===selected.versionIds.wallet,
     'SDK_COMPANY_INSTRUCTIONS_MISMATCH');
    const original=await workspace.fileBytes(instructions.fileId,{private:true});
    invariant(original.length===instructions.bytes&&sha256(original)===instructions.sha256&&
     equivalentInstructionCSV(original,mapped.instructions),'SDK_COMPANY_INSTRUCTIONS_MISMATCH');
    selected.payrollId??=instructions.payrollId;
    selected.sdpSDKInstructions={
     sdkSHA256:sha256(mapped.instructions),sdkBytes:mapped.instructions.length,
     companySHA256:instructions.sha256,companyBytes:instructions.bytes,
     instructionId:instructions.id,fileId:instructions.fileId,
     sameCells:true,exactBytes:original.equals(mapped.instructions),
    };
    mapped.fileId=instructions.fileId;
   }
  }
  return selected;
 }
 function binding(operation,descriptor,requestSHA256){
  const original=operation.evidence?.sdpSDKIntent;
  invariant(original?.schema==='bloccpay.sdp-sdk-intent.v1'&&original.requestSHA256===requestSHA256&&
   same(original.descriptor,descriptor),'SDK_MUTATION_IDENTITY_CONFLICT');
  invariant(operation.connectionAlias===connectionAlias&&operation.environment===connection.environment,
   'SDK_COMPANY_OPERATION_SCOPE_MISMATCH');
 }
 async function observation(operation,descriptor,requestSHA256){
  const attempt=operation.attemptIds.length?workspace.privateItem('attempts',operation.attemptIds.at(-1)):null;
  const source=attempt?.sourceId?workspace.privateItem('sources',attempt.sourceId):null;
  let exchange=null;
  if(source?.receiptFileId){
   const receiptBytes=await workspace.fileBytes(source.receiptFileId,{private:true});
   exchange=parseSourceJSON(receiptBytes,{maxBytes:receiptBytes.length}).value;
  }
  if(exchange)invariant(same(exchange.request,operation.request),'SDK_COMPANY_EXCHANGE_REQUEST_MISMATCH');
  const response=exchange?.response,raw=response?.bodyBase64===undefined?Buffer.alloc(0):bodyBytes(response.bodyBase64);
  if(response)invariant(raw.length===response.bytes&&sha256(raw)===response.sha256,'SDK_COMPANY_RESPONSE_CHANGED');
  const result={
   schema:'commons.sdp.observation.v1',
   providerSource:'stellar/stellar-disbursement-platform-backend@4330f131e8a2638a10767ec8db50a98f22672a61',
   descriptor:copy(descriptor),requestSHA256,dispatch:'delegated',
   startedAt:exchange?.startedAt??operation.createdAt,finishedAt:exchange?.finishedAt??operation.updatedAt,
   status:response?.status??null,headers:response?.headers??{},bodyBase64:raw.toString('base64'),
   bodySHA256:sha256(raw),complete:response?.complete===true,
   companyOperation:{workspaceId:originalWorkspaceId,connectionAlias,operationId:operation.id,state:operation.state,
    requestSHA256:operation.requestSha256,nativeRequestSHA256:operation.request.requestSha256,
    sourceId:source?.id??null,attemptId:attempt?.id??null,receiptFileId:source?.receiptFileId??null},
   nativeRequest:copy(operation.request),
  };
  if(exchange?.parsed)result.data=exchange.parsed.value;
  if(exchange?.parseError)result.parseError=exchange.parseError;
  if(operation.state!=='ACCEPTED')result.error={
   code:operation.state==='UNCERTAIN'?'WRITE_OUTCOME_UNCERTAIN':'COMPANY_OPERATION_'+operation.state,
   message:exchange?.classification?.reason??'Inspect the original company operation before another action.',
  };
  return result;
 }
 async function executeMutation({descriptor,requestSHA256,signal,beforeDispatch}){
  return tracked(async()=>{
   invariant(requestSHA256===identity(descriptor),'SDK_REQUEST_HASH_MISMATCH');
   const mapped=route(descriptor,selectedScope),combinedSignal=combined(signal);
   combinedSignal?.throwIfAborted();
   const stable=identity([connectionAlias,selectedScope,descriptor.operationId]);
   const operationId='sdp-sdk:prepare:'+stable;
   const guard=await lease(workspace.directory,'sdp-sdk-'+stable);
   try{
    let operation=optional(workspace,'operations',operationId);
    if(operation)binding(operation,descriptor,requestSHA256);
    if(!operation){
     const selected=await selection(mapped,descriptor,requestSHA256);
     const args={connectionAlias,action:mapped.action,input:mapped.input,...(mapped.fileId?{fileId:mapped.fileId}:{}),
      evidence:{...selected,sdpSDKIntent:{schema:'bloccpay.sdp-sdk-intent.v1',descriptor:copy(descriptor),requestSHA256}}};
     await command(operationId,'operation.prepare',args,combinedSignal);
     operation=workspace.privateItem('operations',operationId);
     binding(operation,descriptor,requestSHA256);
    }
    // Completed or uncertain original dispatches are replayed from their existing
    // outcome. A restarted DISPATCHING owner is recovered by the same command.
    if(['ACCEPTED','REJECTED','UNCERTAIN','CANCELED'].includes(operation.state))
     return observation(operation,descriptor,requestSHA256);
    invariant(['PREPARED','DISPATCHING'].includes(operation.state),'SDK_COMPANY_OPERATION_STATE');
    if(operation.state==='PREPARED'){
     if(beforeDispatch)await beforeDispatch();
     combinedSignal?.throwIfAborted();
    }
    await command('sdp-sdk:dispatch:'+stable,'operation.dispatch',{operationId},combinedSignal);
    operation=workspace.privateItem('operations',operationId);
    return observation(operation,descriptor,requestSHA256);
   }finally{await guard.release();}
  });
 }
 async function acceptEvent(verified){
  return tracked(async()=>{
   invariant(typeof subscriptionId==='string'&&subscriptionId,'ORIGINAL_SDP_SUBSCRIPTION_REQUIRED');
   invariant(verified?.schema==='commons.sdp.verified-event.v1'&&same(verified.scope,selectedScope)&&
    verified.signatureHeaders&&verified.event,'SDK_VERIFIED_EVENT_SCOPE_MISMATCH');
   const raw=bodyBytes(verified.rawBodyBase64);
   invariant(sha256(raw)===verified.rawBodySHA256&&
    verified.eventKey===[scope.origin,scope.tenantId,scope.sourceWalletId,verified.event.event_id].join('\n'),
    'SDK_VERIFIED_EVENT_IDENTITY_MISMATCH');
   const receipt=await workspace.webhook({connectionAlias,subscriptionId,body:raw,headers:verified.signatureHeaders});
   invariant(['accepted','duplicate','conflict'].includes(receipt.status),'SDP_COMPANY_EVENT_RECEIPT_REQUIRED');
   if(receipt.status==='conflict')return receipt;
   invariant(receipt.accepted===true,'SDP_COMPANY_SIGNATURE_REJECTED');
   const readback=await command('sdp-sdk:event-read:'+sha256(Buffer.from(verified.eventKey)),
    'webhook.project',{webhookId:receipt.id},combined());
   const current=workspace.privateItem('webhooks',receipt.id);
   return{...receipt,companyWorkspaceId:originalWorkspaceId,readbackRequest:readback,readback:copy(current.readback),eventStatus:current.status};
  });
 }
 async function close(){
  if(closePromise)return closePromise;
  closing=true;
  const pending=(async()=>{while(active.size)await Promise.allSettled([...active]);})();
  closePromise=pending;return pending;
 }
 return{executeMutation,acceptEvent,close,describe:()=>({
  schema:'bloccpay.sdp-sdk-transaction-adapter.v1',workspaceId:originalWorkspaceId,
  connectionAlias,programmeVersionId,scope:copy(selectedScope),subscriptionId,
  mutationOwner:'original Bloccpay operation.prepare/operation.dispatch',
 })};
}
