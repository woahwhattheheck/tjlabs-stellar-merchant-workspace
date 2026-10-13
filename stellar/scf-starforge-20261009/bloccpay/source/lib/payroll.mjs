import {invariant,sha256,canonicalJSON} from './source-json.mjs';
import {decimal,decimalParts,addDecimals,subtractDecimals,compareDecimals,exactField,csv as reportCSV} from './decimal.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
const text = (value,code,maximum=4096) => {
  invariant(typeof value === 'string' && value.length > 0 && value.length <= maximum && !value.includes('\0'),code);
  return value;
};
const pointerPart = value => String(value).replaceAll('~','~0').replaceAll('/','~1');
const present = value => value !== undefined && value !== null && value !== '';
const optional = value => present(value) ? String(value) : null;
const LINK_KEYS = ['sdpDisbursementId','sdpPaymentId','sdpReceiverId','bridgeTransferId',
  'bridgeVirtualAccountId','bridgeDepositId','stellarTransactionHash'];
const MAPPING_KEYS = ['id','externalId','externalPaymentId','amount','currency','phoneNumber','email',
  'verificationValue','memo','walletAddress','walletAddressMemo',...LINK_KEYS.map(key=>'links.'+key)];
const same = (a,b) => a != null && b != null && String(a) === String(b);
const versionValue = row => row?.value ?? row?.projection ?? row;
const nativeId = row => String(row.resourceId ?? row.value?.id ?? row.id);
const assetUnit = asset => asset?.code ? asset.code + (asset.issuer ? ':' + asset.issuer : '') : null;

function readField(row,selector) {
  if(Object.hasOwn(row,selector)) return {value:row[selector],pointer:'/'+pointerPart(selector)};
  if(selector.startsWith('/')) {
    const parts=selector.slice(1).split('/').map(x=>x.replaceAll('~1','/').replaceAll('~0','~'));
    return {value:parts.reduce((value,key)=>value?.[key],row),pointer:selector};
  }
  if(selector.startsWith('links.')) return {value:row.links?.[selector.slice(6)],pointer:'/links/'+pointerPart(selector.slice(6))};
  if(['phoneNumber','email','walletAddress','walletAddressMemo','externalId'].includes(selector) &&
      Object.hasOwn(row.recipient??{},selector))
    return {value:row.recipient[selector],pointer:'/recipient/'+pointerPart(selector)};
  return {value:undefined,pointer:'/'+pointerPart(selector)};
}
function calendarPeriod(period) {
  invariant(period && typeof period === 'object','PROGRAMME_PERIOD_REQUIRED');
  const start=Date.parse(period.start),end=Date.parse(period.end);
  invariant(Number.isFinite(start)&&Number.isFinite(end)&&start<end,'PROGRAMME_PERIOD_INVALID');
  return {start:new Date(start).toISOString(),end:new Date(end).toISOString()};
}
export function normalizeProgramme(input) {
  invariant(input&&typeof input==='object'&&!Array.isArray(input),'PROGRAMME_OBJECT_REQUIRED');
  const mapping=copy(input.mapping??{});
  invariant(Object.entries(mapping).every(([key,value])=>MAPPING_KEYS.includes(key)&&
    typeof value==='string'&&value.length>0),'PROGRAMME_MAPPING_INVALID');
  invariant(['production','sandbox'].includes(input.environment),'PROGRAMME_ENVIRONMENT_REQUIRED');
  const aliases=Array.isArray(input.connectionAliases)?input.connectionAliases:Object.values(input.connectionAliases??{});
  invariant(aliases.length>0&&aliases.every(x=>typeof x==='string'&&x.length>0),'PROGRAMME_CONNECTIONS_REQUIRED');
  const asset=input.asset;
  invariant(asset&&typeof asset==='object','PROGRAMME_ASSET_REQUIRED');
  const code=text(asset.code,'PROGRAMME_ASSET_CODE_REQUIRED',64);
  const issuer=present(asset.issuer)?text(asset.issuer,'PROGRAMME_ASSET_ISSUER_INVALID',128):null;
  if(asset.scale!==undefined) invariant(Number.isSafeInteger(asset.scale)&&asset.scale>=0&&asset.scale<=18,
    'PROGRAMME_ASSET_SCALE_INVALID');
  return {id:text(input.id,'PROGRAMME_ID_REQUIRED',128),name:text(input.name,'PROGRAMME_NAME_REQUIRED',256),
    environment:input.environment,connectionAliases:[...new Set(aliases)],
    sourceWalletId:text(input.sourceWalletId,'PROGRAMME_SOURCE_WALLET_REQUIRED',255),
    asset:{code,issuer,...(asset.scale===undefined?{}:{scale:asset.scale})},
    period:calendarPeriod(input.period),mapping,original:copy(input)};
}
export function normalizePayroll(input,{programme}) {
  invariant(input&&typeof input==='object'&&Array.isArray(input.rows)&&input.rows.length>0,'PAYROLL_ROWS_REQUIRED');
  const importId=text(input.id,'PAYROLL_ID_REQUIRED',128),mapping=programme.mapping??{},seen=new Set(),paymentIds=new Set();
  const original=copy(input.original??{}),tokens=original.numberTokens??{},root=original.recordsPath??'';
  invariant(root===''||root.startsWith('/'),'PAYROLL_RECORDS_POINTER_INVALID');
  const rows=input.rows.map((row,index)=>{
    invariant(row&&typeof row==='object'&&!Array.isArray(row),'PAYROLL_ROW_OBJECT_REQUIRED',{index});
    const field=key=>{
      const found=readField(row,mapping[key]??key);
      if(typeof found.value==='number') {
        const spelling=tokens[root+'/'+index+found.pointer];
        invariant(typeof spelling==='string','PAYROLL_ORIGINAL_NUMERIC_FIELD_REQUIRED',{index,field:found.pointer});
        return {...found,value:spelling};
      }
      return found;
    };
    const id=present(field('id').value)?text(String(field('id').value),'PAYROLL_ROW_ID_INVALID',128):
      'row-'+sha256(Buffer.from(canonicalJSON([importId,index]))).slice(0,32);
    invariant(!seen.has(id),'PAYROLL_ROW_ID_DUPLICATE',{id});seen.add(id);
    const monetary=field('amount'),rawAmount=typeof monetary.value==='string'?monetary.value:
      typeof monetary.value==='number'?tokens[root+'/'+index+monetary.pointer]:null;
    invariant(typeof rawAmount==='string','PAYROLL_ORIGINAL_AMOUNT_REQUIRED',{index,field:monetary.pointer});
    const amount=decimal(rawAmount);
    invariant(compareDecimals(amount,'0')>0,'PAYROLL_AMOUNT_MUST_BE_POSITIVE',{id});
    const currency=present(field('currency').value)?text(String(field('currency').value),'PAYROLL_CURRENCY_INVALID',128):programme.asset.code;
    if(currency===programme.asset.code&&programme.asset.scale!==undefined)
      invariant(decimalParts(amount).scale<=programme.asset.scale,'PAYROLL_AMOUNT_SCALE_EXCEEDED',{id});
    const externalPaymentId=optional(field('externalPaymentId').value)??id;
    invariant(externalPaymentId.length<=64,'PAYROLL_EXTERNAL_PAYMENT_ID_TOO_LONG',{id});
    invariant(!paymentIds.has(externalPaymentId),'PAYROLL_EXTERNAL_PAYMENT_ID_DUPLICATE',{externalPaymentId});
    paymentIds.add(externalPaymentId);
    const externalId=optional(field('externalId').value);
    const recipient={externalId,...Object.fromEntries(['phoneNumber','email','walletAddress','walletAddressMemo']
      .map(key=>[key,optional(field(key).value)]))};
    return {id,externalId,externalPaymentId,amount,currency,recipient,
      verificationValue:optional(field('verificationValue').value),memo:optional(field('memo').value),
      links:Object.fromEntries(LINK_KEYS.filter(key=>present(field('links.'+key).value))
        .map(key=>[key,String(field('links.'+key).value)])),
      original:copy(row),originalAmount:rawAmount,originalOrdinal:index};
  });
  return {schema:'bloccpay.payroll.v1',id:importId,programmeId:programme.id,
    period:copy(programme.period),rows,original};
}

// Provider instructions preserve literal source cells, including +phone numbers.
// Formula protection is exclusively applied to human-opened reconciliation exports.
function nativeCSV(rows,columns) {
  const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  return [columns.map(cell).join(','),...rows.map(row=>columns.map(key=>cell(row[key])).join(','))].join('\r\n')+'\r\n';
}
export function buildPayrollInstructions(payroll,{programme,wallet,disbursement}) {
  invariant(payroll.programmeId===programme.id,'PAYROLL_PROGRAMME_MISMATCH');
  invariant(payroll.rows.length>0&&payroll.rows.length<=10000,'SDP_INSTRUCTION_LIMIT',{maximum:10000});
  const batch=versionValue(disbursement),selectedWallet=versionValue(wallet);
  invariant(batch&&typeof batch.id==='string'&&['DRAFT','READY'].includes(batch.status),
    'SDP_DRAFT_OR_READY_DISBURSEMENT_REQUIRED');
  invariant(batch.source_wallet_id===programme.sourceWalletId,'SDP_SOURCE_WALLET_MISMATCH');
  invariant(assetUnit(batch.asset)===assetUnit(programme.asset),'SDP_DISBURSEMENT_ASSET_MISMATCH');
  const contact=batch.registration_contact_type,phone=['PHONE_NUMBER','PHONE_NUMBER_AND_WALLET_ADDRESS'].includes(contact),
    email=['EMAIL','EMAIL_AND_WALLET_ADDRESS'].includes(contact),
    suppliedAddress=['PHONE_NUMBER_AND_WALLET_ADDRESS','EMAIL_AND_WALLET_ADDRESS'].includes(contact);
  invariant(phone||email,'SDP_REGISTRATION_CONTACT_TYPE_UNSUPPORTED');
  invariant(selectedWallet?.id===String(batch.wallet?.id??batch.wallet_id),'SDP_RECEIVER_WALLET_MISMATCH');
  const receiverWallet={...batch.wallet,...selectedWallet};
  const skipVerification=receiverWallet?.embedded===true&&!batch.verification_field;
  const verification=!suppliedAddress&&!skipVerification;
  const columns=[phone?'phone':'email','id','amount','paymentID',
    ...(suppliedAddress?['walletAddress','walletAddressMemo']:verification?['verification']:[])];
  const contacts=new Set();
  const rows=payroll.rows.map(row=>{
    invariant(row.currency===programme.asset.code,'PAYROLL_INSTRUCTION_CURRENCY_MISMATCH',{id:row.id});
    invariant(typeof row.externalId==='string'&&row.externalId.trim().length>0&&row.externalId.length<=64,
      'SDP_RECEIVER_EXTERNAL_ID_REQUIRED',{id:row.id});
    const contactValue=phone?row.recipient.phoneNumber:row.recipient.email;
    invariant(typeof contactValue==='string'&&contactValue.trim().length>0,'SDP_CONTACT_REQUIRED',{id:row.id});
    const normalized=contactValue.trim().toLowerCase();
    invariant(!contacts.has(normalized),'SDP_DUPLICATE_CONTACT',{id:row.id});contacts.add(normalized);
    if(phone) invariant(/^\+[1-9]\d{6,14}$/.test(normalized),'SDP_PHONE_FORMAT',{id:row.id});
    if(email) invariant(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized),'SDP_EMAIL_FORMAT',{id:row.id});
    if(verification) invariant(present(row.verificationValue),'SDP_VERIFICATION_VALUE_REQUIRED',{id:row.id});
    if(suppliedAddress) {
      invariant(typeof row.recipient.walletAddress==='string'&&/^[GC][A-Z2-7]{55}$/.test(row.recipient.walletAddress),
        'SDP_ORIGINAL_WALLET_ADDRESS_REQUIRED',{id:row.id});
      invariant(!row.recipient.walletAddress.startsWith('C')||!row.recipient.walletAddressMemo,
        'SDP_CONTRACT_MEMO_UNSUPPORTED',{id:row.id});
    }
    return {[phone?'phone':'email']:contactValue,id:row.externalId,amount:row.amount,paymentID:row.externalPaymentId,
      ...(suppliedAddress?{walletAddress:row.recipient.walletAddress,walletAddressMemo:row.recipient.walletAddressMemo??''}:
        verification?{verification:row.verificationValue}:{})};
  });
  const body=Buffer.from(nativeCSV(rows,columns));
  invariant(body.length<=5000000,'SDP_ORIGINAL_CSV_LIMIT',{bytes:body.length,maximum:5000000});
  return {schema:'bloccpay.sdp-instructions.v1',filename:'payroll-'+sha256(Buffer.from(payroll.id)).slice(0,16)+'.csv',
    contentType:'text/csv',bodyBase64:body.toString('base64'),bytes:body.length,sha256:sha256(body),
    rowIds:payroll.rows.map(row=>row.id),paymentLinks:payroll.rows.map(row=>({rowId:row.id,externalPaymentId:row.externalPaymentId})),
    disbursementId:batch.id,sourceWalletId:batch.source_wallet_id,columns,
    providerContract:{uploadAction:'sdp.disbursement.instructions.upload',uploadInput:{params:{id:batch.id}},
      startAction:'sdp.disbursement.status',startInput:{params:{id:batch.id},body:{status:'STARTED'}},repository:'stellar/stellar-disbursement-platform-backend',
      commit:'4330f131e8a2638a10767ec8db50a98f22672a61',handler:'7b8c0678',instructions:'d1d3668f2b36ad06f2182f29b1412ba1654751c2',
      validator:'3958f42fbffceea3af426c3fd09cb570d990cd23',
      semantics:'Upload replaces existing draft instructions for the same DRAFT or READY disbursement; the provider validates all contacts, verification values, amounts, addresses and memos.'}};
}
function activeCorrections(corrections) {
  const byId=new Map(corrections.map(row=>[row.id,row]));
  invariant(byId.size===corrections.length,'CORRECTION_ID_DUPLICATE');
  const superseded=new Set();
  for(const row of corrections) {
    invariant(['note','include','exclude','link'].includes(row.action),'CORRECTION_ACTION_INVALID');
    if(row.supersedes) {invariant(byId.has(row.supersedes),'CORRECTION_PARENT_MISSING');superseded.add(row.supersedes);}
    let current=row,seen=new Set();
    while(current?.supersedes) {invariant(!seen.has(current.id),'CORRECTION_CYCLE');seen.add(current.id);current=byId.get(current.supersedes);}
  }
  return corrections.filter(row=>!superseded.has(row.id));
}
function sourceIdentity(version) {
  return JSON.stringify([version.context?.providerScope??version.sourceScope??version.connectionAlias,
    version.environment,version.kind,nativeId(version)]);
}
function rowUnit(row,programme) {
  return row.currency===programme.asset.code?assetUnit(programme.asset):row.currency;
}
function originalAmount(version,field,pointer='') {
  return exactField(version.value,field,version.numberTokens??{},pointer);
}
function receiptComponents(version,receipt,pointer='/receipt') {
 if(!receipt||typeof receipt!=='object')return[];
 const fields=['initial_amount','developer_fee','exchange_fee','pre_conversion_subtotal_amount',
   'converted_amount','subtotal_amount','gas_fee','final_amount','remaining_prefunded_balance'];
 const rows=[];
 for(const field of fields){
  const amount=exactField(receipt,field,version.numberTokens??{},pointer);
  if(amount!==null)rows.push({field,amount,currency:receipt[field+'_currency']??null,
    unitSource:receipt[field+'_currency']?'original receipt companion field':null});
 }
 const extra=receipt.developer_exchange_fee;
 if(extra&&typeof extra==='object'){
  const amount=exactField(extra,'amount',version.numberTokens??{},pointer+'/developer_exchange_fee');
  if(amount!==null)rows.push({field:'developer_exchange_fee',amount,currency:extra.currency??null,
    unitSource:extra.currency?'original receipt component currency':null});
 }
 return rows;
}
export function reconcilePayroll({programme,payroll,versions=[],history=[],sources=[],corrections=[],coverage={}}) {
 invariant(payroll.programmeId===programme.id,'PAYROLL_PROGRAMME_MISMATCH');
 const active=activeCorrections(corrections),exceptions=[],selected=new Map(),totals=new Map(),blocked=new Set();
 const addException=(code,details={})=>exceptions.push({id:sha256(Buffer.from(canonicalJSON([code,details]))),code,...details});
 const changeFor=(target,field)=>present(target)?active.filter(row=>row[field]===target):[];
 const excluded=(target,field)=>{
  const choices=changeFor(target,field).filter(row=>['include','exclude'].includes(row.action));
  if(new Set(choices.map(row=>row.action)).size>1){addException('CORRECTION_SELECTION_CONFLICT',{field,target,correctionIds:choices.map(x=>x.id)});return true;}
  return choices.some(row=>row.action==='exclude');
 };
 const accumulate=(bucket,unit,amount,environment=programme.environment)=>{
  if(amount===null||amount===undefined)return;
  if(!unit){addException('ORIGINAL_AMOUNT_UNIT_MISSING',{bucket});return;}
  const key=JSON.stringify([environment,bucket,unit]);totals.set(key,addDecimals(totals.get(key)??'0',amount));
 };
 const coverageConflicts=[...(coverage.selectionConflicts??[]),...(coverage.conflicts??[])];
 const conflictedVersionIds=new Set(coverageConflicts.flatMap(row=>row.versionIds??[]));
 const conflictedResources=new Set(coverageConflicts.map(row=>row.resourceId).filter(Boolean));
 for(const conflict of coverageConflicts)addException('UNRESOLVED_ORIGINAL_RESOURCE_CONFLICT',{conflict});
 for(const version of versions){
  if(version.environment!==programme.environment||!programme.connectionAliases.includes(version.connectionAlias))continue;
  if(excluded(version.id,'versionId')||excluded(version.localResourceId??version.resourceId,'resourceId')||excluded(version.sourceId,'sourceId'))continue;
  const key=sourceIdentity(version);
  if(conflictedVersionIds.has(version.id)||conflictedResources.has(version.localResourceId??version.resourceId)){
   blocked.add(key);selected.delete(key);continue;
  }
  if(blocked.has(key))continue;
  const previous=selected.get(key);
  if(previous&&previous.contentSha256!==version.contentSha256){
   addException('MULTIPLE_SELECTED_RESOURCE_VERSIONS',{resourceKey:key,versionIds:[previous.id,version.id]});
   blocked.add(key);selected.delete(key);continue;
  }
  if(!previous)selected.set(key,version);
 }
 const cohort=[...selected.values()],payments=cohort.filter(row=>row.kind==='sdp-payment'),
  transfers=cohort.filter(row=>row.kind==='bridge-transfer'),events=cohort.filter(row=>row.kind==='bridge-virtual-account-event'),
  transactions=cohort.filter(row=>row.kind==='horizon-transaction'),networks=cohort.filter(row=>row.kind==='horizon-network');
 const plans=payroll.rows.map(original=>{
  const links={...original.links},assigned=new Map(),edits=changeFor(original.id,'payrollRowId').filter(row=>row.action==='link');
  let linkConflict=false;
  for(const edit of edits)for(const [key,value]of Object.entries(edit.links??{})){
   invariant(LINK_KEYS.includes(key)&&typeof value==='string','CORRECTION_LINK_INVALID');
   if(assigned.has(key)&&assigned.get(key)!==value){
    linkConflict=true;addException('CORRECTION_LINK_CONFLICT',{rowId:original.id,key,correctionIds:edits.map(x=>x.id)});
   }
   assigned.set(key,value);links[key]=value;
  }
  const isExcluded=excluded(original.id,'payrollRowId');
  const matching=isExcluded||linkConflict?[]:payments.filter(version=>{
   const value=version.value;
   if(value.source_wallet_id!==programme.sourceWalletId)return false;
   if(links.sdpDisbursementId&&!same(value.disbursement?.id,links.sdpDisbursementId))return false;
   if(links.sdpPaymentId)return same(nativeId(version),links.sdpPaymentId);
   return same(value.external_payment_id,original.externalPaymentId);
  });
  return{original,links,isExcluded,linkConflict,matching};
 });
 const assignments=new Map();
 for(const plan of plans)if(!plan.isExcluded&&!plan.linkConflict&&plan.matching.length===1){
  const key=sourceIdentity(plan.matching[0]);assignments.set(key,[...(assignments.get(key)??[]),plan.original.id]);
 }
 const rows=plans.map(({original,links,isExcluded,linkConflict,matching})=>{
  const unit=rowUnit(original,programme),result={rowId:original.id,externalId:original.externalId,externalPaymentId:original.externalPaymentId,
   amount:original.amount,currency:original.currency,unit,links,excluded:isExcluded,linkConflict,
   status:isExcluded?'EXCLUDED':linkConflict?'LINK_CONFLICT':matching.length===0?'UNMATCHED':matching.length>1?'AMBIGUOUS':matching[0].value.status,
   providerStatus:matching.length===1?matching[0].value.status:null,paymentIds:matching.map(nativeId),versionIds:matching.map(x=>x.id),
   observedAmount:null,successfulAmount:'0',difference:null,chain:{state:'UNOBSERVED'},
   correctionIds:changeFor(original.id,'payrollRowId').map(x=>x.id)};
  if(isExcluded)return result;
  accumulate('expected_payroll',unit,original.amount);
  if(linkConflict)return result;
  if(matching.length!==1){
   addException(matching.length?'MULTIPLE_SDP_PAYMENTS':'SDP_PAYMENT_UNMATCHED',{rowId:original.id,paymentIds:result.paymentIds});return result;
  }
  const version=matching[0],payment=version.value,owners=assignments.get(sourceIdentity(version));
  if(owners.length>1){addException('SDP_PAYMENT_LINKED_TO_MULTIPLE_ROWS',{rowId:original.id,paymentId:nativeId(version),payrollRowIds:owners});result.status='AMBIGUOUS';return result;}
  const observedUnit=assetUnit(payment.asset),amount=originalAmount(version,'amount');
  result.observedAmount=amount;result.observedUnit=observedUnit;
  let matched=observedUnit===unit&&amount!==null;
  if(observedUnit!==unit)addException('SDP_ASSET_MISMATCH',{rowId:original.id,expected:unit,observed:observedUnit});
  else if(amount!==null){result.difference=subtractDecimals(amount,original.amount);if(compareDecimals(result.difference,'0')!==0){matched=false;addException('SDP_AMOUNT_MISMATCH',{rowId:original.id,difference:result.difference});}}
  else addException('SDP_PAYMENT_AMOUNT_MISSING',{rowId:original.id});
  accumulate('sdp_observed_'+String(payment.status??'unknown').toLowerCase(),observedUnit,amount);
  if(payment.status==='SUCCESS'&&matched){result.successfulAmount=amount;accumulate('sdp_reconciled_success',unit,amount);}
  else if(payment.status==='SUCCESS')result.status='MISMATCH';
  if(['FAILED','CANCELED'].includes(payment.status))addException('SDP_'+payment.status,{rowId:original.id,paymentId:nativeId(version)});
  const hash=payment.stellar_transaction_id??links.stellarTransactionHash;
  if(hash){
   result.chain.transactionHash=hash;
   const matchingChain=transactions.filter(row=>same(nativeId(row),hash));
   const chain=matchingChain.filter(row=>version.context?.networkPassphrase&&row.context?.networkPassphrase===version.context.networkPassphrase&&
    networks.some(network=>network.context?.providerScope===row.context?.providerScope&&network.value.network_passphrase===row.context.networkPassphrase));
   if(matchingChain.length&&!chain.length)addException('HORIZON_NETWORK_BINDING_UNCONFIRMED',{rowId:original.id,transactionHash:hash});
   if(chain.length===1){
    result.chain={transactionHash:hash,state:chain[0].value.successful===true?'SUCCESS':'FAILED',versionId:chain[0].id,
     ledger:chain[0].value.ledger??null,networkPassphrase:chain[0].context?.networkPassphrase??null};
    if(chain[0].value.successful!==true)addException('STELLAR_TRANSACTION_FAILED',{rowId:original.id,transactionHash:hash});
   }else if(chain.length>1)addException('MULTIPLE_STELLAR_NETWORK_OBSERVATIONS',{rowId:original.id,transactionHash:hash});
  }
  return result;
 });
 const eligible=rows.filter(row=>!row.excluded&&!row.linkConflict);
 const linkedTransfers=new Set(eligible.flatMap(row=>row.links.bridgeTransferId?[row.links.bridgeTransferId]:[]));
 const depositReferences=eligible.filter(row=>row.links.bridgeDepositId).map(row=>({depositId:row.links.bridgeDepositId,virtualAccountId:row.links.bridgeVirtualAccountId??null}));
 const linkedDeposits=new Set(depositReferences.map(row=>row.depositId)),fundingTransfers=[];
 for(const id of linkedTransfers){
  const matches=transfers.filter(version=>nativeId(version)===id);
  if(matches.length!==1){addException(matches.length?'BRIDGE_TRANSFER_ID_AMBIGUOUS':'BRIDGE_TRANSFER_UNMATCHED',{transferId:id,versionIds:matches.map(x=>x.id)});continue;}
  const version=matches[0],value=version.value,amount=originalAmount(version,'amount'),fee=originalAmount(version,'developer_fee'),
   receiptAmounts=receiptComponents(version,value.receipt),finalAmount=value.receipt?exactField(value.receipt,'final_amount',version.numberTokens??{},'/receipt'):null,
   destinationUnit=value.receipt?.final_amount_currency??value.destination?.currency??null;
  const item={id,versionId:version.id,state:value.state,sourceAmount:amount,sourceCurrency:value.currency??null,
   configuredDeveloperFee:fee,configuredDeveloperFeeCurrency:value.currency??null,destinationAmount:finalAmount,destinationCurrency:destinationUnit,
   destinationUnitSource:value.receipt?.final_amount_currency?'original receipt companion field':'documented destination currency',
   source:value.source??null,destination:value.destination??null,receipt:value.receipt??null,receiptAmounts,
   finalTransactionHash:value.state==='payment_processed'?value.receipt?.destination_tx_hash??value.destination_tx_hash??null:null};
  fundingTransfers.push(item);
  accumulate('bridge_transfer_source_'+value.state,value.currency,amount);
  if(value.state==='payment_processed')accumulate('bridge_transfer_destination_processed',destinationUnit,finalAmount);
  if(fee!==null)accumulate('bridge_transfer_configured_developer_fee_'+value.state,value.currency,fee);
  for(const component of receiptAmounts)accumulate('bridge_receipt_'+value.state+'_'+component.field,component.currency,component.amount);
  if(['undeliverable','returned','refunded','refund_in_flight','refund_failed','error'].includes(value.state))
   addException('BRIDGE_TRANSFER_'+value.state.toUpperCase(),{transferId:id});
 }
 const deposits=new Map();
 for(const version of events){
  const value=version.value;
  if(!value.deposit_id||!depositReferences.some(ref=>ref.depositId===value.deposit_id&&(!ref.virtualAccountId||ref.virtualAccountId===value.virtual_account_id)))continue;
  const key=JSON.stringify([version.context?.providerScope??version.sourceScope,version.environment,value.customer_id,value.virtual_account_id,value.deposit_id]);
  if(!deposits.has(key))deposits.set(key,{depositId:value.deposit_id,customerId:value.customer_id??null,virtualAccountId:value.virtual_account_id??null,
   providerScope:version.context?.providerScope??version.sourceScope??null,events:[],sourceAmount:null,sourceCurrency:null,
   destinationAmount:null,destinationCurrency:null,finalTransactionHash:null,microdeposit:false,sourceConflict:false,destinationConflict:false});
  const deposit=deposits.get(key),amount=originalAmount(version,'amount'),receiptAmounts=receiptComponents(version,value.receipt);
  deposit.events.push({id:nativeId(version),versionId:version.id,type:value.type,amount,currency:value.currency??null,receipt:value.receipt??null,receiptAmounts});
  if(value.type==='microdeposit')deposit.microdeposit=true;
  if(value.type==='funds_received'){
   if(deposit.sourceAmount!==null&&(amount===null||compareDecimals(deposit.sourceAmount,amount)!==0||deposit.sourceCurrency!==value.currency)){
    deposit.sourceConflict=true;addException('BRIDGE_DEPOSIT_SOURCE_CONFLICT',{depositId:value.deposit_id});
   }else{deposit.sourceAmount=amount;deposit.sourceCurrency=value.currency??null;}
  }
  if(value.type==='payment_processed'){
   if(deposit.destinationAmount!==null&&(amount===null||compareDecimals(deposit.destinationAmount,amount)!==0||deposit.destinationCurrency!==value.currency)){
    deposit.destinationConflict=true;addException('BRIDGE_DEPOSIT_DESTINATION_CONFLICT',{depositId:value.deposit_id});
   }else{deposit.destinationAmount=amount;deposit.destinationCurrency=value.currency??null;deposit.finalTransactionHash=value.destination_tx_hash??value.receipt?.destination_tx_hash??null;}
  }
  if(['refund','refund_in_flight','refund_failed','in_review'].includes(value.type))addException('BRIDGE_DEPOSIT_'+value.type.toUpperCase(),{depositId:value.deposit_id,eventId:nativeId(version)});
 }
 for(const id of linkedDeposits){
  const groups=[...deposits.values()].filter(row=>row.depositId===id);
  if(!groups.length)addException('BRIDGE_DEPOSIT_UNMATCHED',{depositId:id});
  if(groups.length>1&&depositReferences.some(ref=>ref.depositId===id&&!ref.virtualAccountId)){
   addException('BRIDGE_DEPOSIT_ID_AMBIGUOUS',{depositId:id,groups:groups.map(row=>({customerId:row.customerId,virtualAccountId:row.virtualAccountId,providerScope:row.providerScope}))});
   for(const group of groups)group.sourceConflict=group.destinationConflict=true;
  }
 }
 for(const deposit of deposits.values()){
  if(deposit.microdeposit){addException('BRIDGE_MICRODEPOSIT_NOT_PAYROLL_FUNDING',{depositId:deposit.depositId});continue;}
  if(!deposit.sourceConflict)accumulate('bridge_deposit_received',deposit.sourceCurrency,deposit.sourceAmount);
  if(!deposit.destinationConflict)accumulate('bridge_deposit_processed',deposit.destinationCurrency,deposit.destinationAmount);
 }
 return{schema:'bloccpay.payroll-reconciliation.v1',programmeId:programme.id,payrollId:payroll.id,
  period:copy(payroll.period),environment:programme.environment,rows,exceptions,
  totals:[...totals].map(([key,amount])=>{const[environment,bucket,unit]=JSON.parse(key);return{environment,bucket,unit,amount};}),
  funding:{transfers:fundingTransfers,deposits:[...deposits.values()]},coverage:copy(coverage),
  selectedVersionIds:cohort.map(x=>x.id),withheldResourceKeys:[...blocked],sourceIds:[...new Set(cohort.map(x=>x.sourceId).filter(Boolean))],
  historyVersionIds:[...new Set([...history,...versions].map(x=>x.id))],correctionIds:active.map(x=>x.id),
  originalSourceIds:sources.map(x=>x.id).filter(Boolean),
  semantics:{payroll:'Expected payroll, provider-observed outcomes and exactly reconciled success are separate; ambiguous assignments and conflicting sources contribute no payment success.',
   funding:'Source deposits, configured fees, each receipt component and delivered destination amounts have distinct unit-labelled buckets. Lifecycle stages are never summed into one receipt.',
   chain:'Bridge sandbox identifiers remain provider observations; network settlement requires an original correctly bound Horizon transaction.'}};
}
export const csv=reportCSV;
export function payrollReport(edition) {
  invariant(edition.schema==='bloccpay.payroll-reconciliation.v1','PAYROLL_EDITION_REQUIRED');
  const columns=['rowId','externalId','externalPaymentId','amount','unit','status','providerStatus','observedAmount','observedUnit','successfulAmount','difference','paymentIds','links','chain','excluded'];
  const json=JSON.stringify(edition,null,2)+'\n',tableCSV=reportCSV(edition.rows,columns);
  const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const table=(rows,fields)=>'<table><thead><tr>'+fields.map(key=>'<th>'+escape(key)+'</th>').join('')+
    '</tr></thead><tbody>'+rows.map(row=>'<tr>'+fields.map(key=>'<td>'+escape(typeof row[key]==='object'?JSON.stringify(row[key]):row[key])+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payroll reconciliation</title><style>'+
    'body{font:14px system-ui,sans-serif;color:#181818;background:white;margin:32px;line-height:1.45}h1{font-size:24px}h2{font-size:18px;margin-top:28px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eee}pre{white-space:pre-wrap;overflow-wrap:anywhere}p{max-width:1000px}@media print{body{margin:10mm}thead{display:table-header-group}tr{break-inside:avoid}}</style>'+
    '<h1>Payroll reconciliation</h1><p>Programme '+escape(edition.programmeId)+' · Payroll '+escape(edition.payrollId)+' · '+escape(edition.environment)+'</p><p>'+
    escape(edition.period.start)+' to '+escape(edition.period.end)+'</p><h2>Amounts by original unit and outcome</h2>'+
    table(edition.totals,['environment','bucket','unit','amount'])+'<h2>Payroll rows</h2>'+table(edition.rows,columns)+
    '<h2>Exceptions</h2>'+table(edition.exceptions,['code','rowId','paymentId','transferId','depositId','difference'])+
    '<h2>Source selection and coverage</h2><pre>'+escape(JSON.stringify({coverage:edition.coverage,selectedVersionIds:edition.selectedVersionIds,
      sourceIds:edition.sourceIds,correctionIds:edition.correctionIds,semantics:edition.semantics},null,2))+'</pre></html>\n';
  return {json,csv:tableCSV,html};
}
