import {invariant,sha256,canonicalJSON} from './source-json.mjs';
import {compareDecimals} from './decimal.mjs';
const valueOf=selected=>selected?.value??selected?.exchange?.parsed?.value??selected?.source?.exchange?.parsed?.value;
const requestOf=selected=>selected?.exchange?.request??selected?.source?.exchange?.request;
const nativeID=selected=>String(selected?.resourceId??selected?.value?.id??selected?.id??'');
const scopeOf=selected=>selected?.context?.providerScope??selected?.sourceScope??requestOf(selected)?.context?.sourceScope;
const assetUnit=value=>value?.code?value.code+':'+(value.issuer??''):null;
function selectedEvidence(evidence,key,{kind,request,id,optional=false}={}) {
 const selected=evidence[key]??evidence.versions?.[key]??evidence.sources?.[key];
 if(!selected&&optional)return null;
 invariant(selected&&typeof selected==='object','ORIGINAL_EVIDENCE_REQUIRED',{key});
 if(kind)invariant(selected.kind===kind,'EVIDENCE_RESOURCE_KIND_MISMATCH',{key,expected:kind,actual:selected.kind});
 invariant(selected.environment===undefined||selected.environment===request.environment,'EVIDENCE_ENVIRONMENT_MISMATCH',{key});
 const scope=scopeOf(selected);
 invariant(scope&&scope===request.context.sourceScope,'EVIDENCE_PROVIDER_SCOPE_MISMATCH',{key});
 if(id!==undefined&&id!==null)invariant(nativeID(selected)===String(id),'EVIDENCE_NATIVE_ID_MISMATCH',{key,id});
 return selected;
}
function positive(value,name,allowZero=false) {
 invariant(typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value),'DECIMAL_STRING_REQUIRED',{field:name});
 invariant(allowZero?compareDecimals(value,'0')>=0:compareDecimals(value,'0')>0,'POSITIVE_AMOUNT_REQUIRED',{field:name});
}
function capabilities(evidence,request,capability) {
 const selected=selectedEvidence(evidence,'capabilities',{request});
 const value=valueOf(selected),original=requestOf(selected);
 invariant(value?.wallet_id===request.context.sourceWalletId,'SDP_CAPABILITY_WALLET_MISMATCH');
 const input=original?.input??selected.context?.requestInput;
 invariant(!input?.query?.user_id&&!input?.query?.role&&!value.user_id&&!value.role,'SDP_HYPOTHETICAL_CAPABILITY_NOT_AUTHORITY');
 invariant((original?.context?.credentialBinding??selected.context?.credentialBinding)===request.context.credentialBinding,
   'SDP_CAPABILITY_AUTHENTICATED_CONNECTION_MISMATCH');
 invariant(value.capabilities?.[capability]===true,'SDP_NATIVE_CAPABILITY_REQUIRED',{capability});
 return value;
}
export function validateOperation({request,evidence={},now}) {
 invariant(request&&typeof request==='object','PREPARED_REQUEST_REQUIRED');
 const {requestSha256,...identity}=request;
 invariant(sha256(Buffer.from(canonicalJSON(identity)))===requestSha256,'PREPARED_REQUEST_CHANGED');
 if(!request.mutation)return{valid:true};
 const input=request.input,action=request.action,body=input.body??{};
 if(evidence.programme){
  invariant(evidence.programme.environment===request.environment,'PROGRAMME_ENVIRONMENT_MISMATCH');
  if(request.provider==='sdp')invariant(evidence.programme.sourceWalletId===request.context.sourceWalletId,'PROGRAMME_SOURCE_WALLET_MISMATCH');
 }
 if(request.provider==='sdp'){
  const id=input.params.id;
  if(action==='sdp.disbursement.create'){
   capabilities(evidence,request,'can_create_disbursement');
   invariant(typeof body.name==='string'&&body.name.trim(),'SDP_DISBURSEMENT_NAME_REQUIRED');
   const direct=['EMAIL_AND_WALLET_ADDRESS','PHONE_NUMBER_AND_WALLET_ADDRESS'].includes(body.registration_contact_type);
   const wallet=selectedEvidence(evidence,'wallet',{kind:'sdp-wallet',request,...(direct?{}:{id:body.wallet_id})});
   invariant(valueOf(wallet)?.enabled!==false,'SDP_WALLET_DISABLED');
   if(direct){
    invariant(!body.wallet_id&&!body.verification_field,'SDP_DIRECT_ADDRESS_OMITS_WALLET_AND_VERIFICATION');
    invariant(valueOf(wallet)?.enabled===true&&valueOf(wallet)?.user_managed===true,'SDP_ENABLED_USER_MANAGED_WALLET_REQUIRED');
   }
   const assets=selectedEvidence(evidence,'assets',{request}),items=valueOf(assets);
   const asset=(Array.isArray(items)?items:[items]).find(row=>row?.id===body.asset_id);
   invariant(asset,'SDP_SELECTED_ASSET_NOT_OBSERVED');
   if(evidence.programme)invariant(assetUnit(asset)===assetUnit(evidence.programme.asset),'PROGRAMME_ASSET_MISMATCH');
   invariant(typeof body.registration_contact_type==='string','SDP_CONTACT_TYPE_REQUIRED');
  }else if(action.startsWith('sdp.disbursement.')){
   const observed=selectedEvidence(evidence,'disbursement',{kind:'sdp-disbursement',request,id}),batch=valueOf(observed);
   invariant(batch.source_wallet_id===request.context.sourceWalletId,'SDP_DISBURSEMENT_SOURCE_WALLET_MISMATCH');
   if(evidence.programme)invariant(assetUnit(batch.asset)===assetUnit(evidence.programme.asset),'PROGRAMME_ASSET_MISMATCH');
   if(action==='sdp.disbursement.instructions.upload'){
    capabilities(evidence,request,'can_create_disbursement');
    invariant(['DRAFT','READY'].includes(batch.status),'SDP_DRAFT_OR_READY_DISBURSEMENT_REQUIRED');
    const instructions=evidence.instructions;
    invariant(instructions&&instructions.sha256===input.file.sha256&&instructions.bytes===input.file.bytes,'SDP_ORIGINAL_INSTRUCTIONS_REQUIRED');
    invariant(instructions.disbursementVersionId===observed.id,'SDP_INSTRUCTION_DISBURSEMENT_VERSION_MISMATCH');
    const wallet=selectedEvidence(evidence,'wallet',{kind:'sdp-wallet',request});
    invariant(instructions.walletVersionId===wallet.id,'SDP_INSTRUCTION_WALLET_VERSION_MISMATCH');
    invariant(nativeID(wallet)===String(batch.wallet?.id??batch.wallet_id),'SDP_RECEIVER_WALLET_MISMATCH');
   }else if(action==='sdp.disbursement.status'){
    const capability={STARTED:'can_start_disbursement',PAUSED:'can_pause_disbursement',CANCELED:'can_cancel_disbursement'}[body.status];
    invariant(capability,'SDP_DISBURSEMENT_STATUS_INVALID');capabilities(evidence,request,capability);
    if(body.status==='STARTED')invariant(['READY','PAUSED'].includes(batch.status),'SDP_STARTABLE_DISBURSEMENT_REQUIRED');
   }else if(action==='sdp.disbursement.delete')invariant(['DRAFT','READY'].includes(batch.status),'SDP_DELETABLE_DISBURSEMENT_REQUIRED');
  }else if(action==='sdp.payment.status'){
   capabilities(evidence,request,'can_cancel_payment');
   const payment=selectedEvidence(evidence,'payment',{kind:'sdp-payment',request,id});
   invariant(valueOf(payment).source_wallet_id===request.context.sourceWalletId,'SDP_PAYMENT_SOURCE_WALLET_MISMATCH');
   invariant(!['SUCCESS','CANCELED'].includes(valueOf(payment).status),'SDP_TERMINAL_PAYMENT');
  }else if(action==='sdp.payments.retry'){
   capabilities(evidence,request,'can_retry_payment');
   invariant(Array.isArray(body.payment_ids)&&body.payment_ids.length>0&&new Set(body.payment_ids).size===body.payment_ids.length,'SDP_PAYMENT_IDS_REQUIRED');
   const versions=Object.values(evidence.versions??{}).filter(row=>row.kind==='sdp-payment');
   for(const id of body.payment_ids){
    const row=versions.find(row=>nativeID(row)===id);
    invariant(row&&scopeOf(row)===request.context.sourceScope&&valueOf(row).source_wallet_id===request.context.sourceWalletId&&valueOf(row).status==='FAILED','SDP_FAILED_PAYMENT_EVIDENCE_REQUIRED',{id});
   }
  }
 }else if(request.provider==='bridge'){
  if(action==='bridge.transfer.create'){
   const customer=selectedEvidence(evidence,'customer',{kind:'bridge-customer',request,id:body.on_behalf_of});
   invariant(valueOf(customer)?.id===body.on_behalf_of,'BRIDGE_CUSTOMER_MISMATCH');
   if(body.features?.flexible_amount)invariant(body.amount===undefined,'BRIDGE_FLEXIBLE_AMOUNT_OMITS_AMOUNT');
   else if(body.amount!==undefined)positive(body.amount,'amount');
   else invariant(body.destination?.amount!==undefined,'BRIDGE_TRANSFER_AMOUNT_REQUIRED');
   if(body.destination?.amount!==undefined)positive(body.destination.amount,'destination.amount');
   if(body.source?.payment_rail==='swift')invariant(body.features?.flexible_amount===true,'BRIDGE_SWIFT_FLEXIBLE_AMOUNT_REQUIRED');
   if(body.developer_fee!==undefined)positive(body.developer_fee,'developer_fee',true);
   if(body.developer_fee_percent!==undefined){
    positive(body.developer_fee_percent,'developer_fee_percent',true);
    invariant(compareDecimals(body.developer_fee_percent,'100')<=0,'BRIDGE_FEE_PERCENT_RANGE');
   }
   invariant(!(body.developer_fee!==undefined&&body.developer_fee_percent!==undefined),'BRIDGE_FEE_MODE_EXCLUSIVE');
   if(body.features?.flexible_amount)invariant(body.developer_fee===undefined,'BRIDGE_FLEXIBLE_FEE_PERCENT_REQUIRED');
   if(body.source?.payment_rail==='stellar')invariant(typeof body.return_instructions?.memo==='string'&&body.return_instructions.memo.length,'BRIDGE_STELLAR_RETURN_MEMO_REQUIRED');
  }else if(action==='bridge.virtual-account.create'){
   selectedEvidence(evidence,'customer',{kind:'bridge-customer',request,id:input.params.customerID});
   invariant(!(body.fee_config&&body.developer_fee_percent!==undefined),'BRIDGE_VIRTUAL_ACCOUNT_FEE_MODE_EXCLUSIVE');
  }else if(action==='bridge.virtual-account.simulate-deposit'){
   invariant(request.environment==='sandbox','SANDBOX_ONLY_ACTION');
   const account=selectedEvidence(evidence,'virtualAccount',{kind:'bridge-virtual-account',request,id:input.params.virtualAccountID});
   invariant((valueOf(account).customer_id??account.context?.customerId)===input.params.customerID,'BRIDGE_VIRTUAL_ACCOUNT_CUSTOMER_MISMATCH');
   invariant(valueOf(account).source_deposit_instructions?.currency===body.currency,'BRIDGE_DEPOSIT_CURRENCY_MISMATCH');
   positive(body.amount,'amount');
  }
 }else invariant(false,'READ_ONLY_PROVIDER');
 return{valid:true,observedAt:now??null};
}
