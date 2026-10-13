// MIT. Reviewed Horizon deposit attribution through the original invoice workspace.
import {normalizeSettlementMemo,normalizeSettlementAccount} from '../settlement-audit/reconciliation.mjs';
import {normalizeInvoiceProgramme} from './reconciliation.mjs';
import {need,object,text,list,canonical,sha256,decimalUnits,formatUnits} from './lossless-json.mjs';
const REGISTER='stellar-forge.horizon-invoice-register.v1';
export const HORIZON_INVOICE_REVIEW='stellar-forge.horizon-invoice-review.v1';
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const memoKey=value=>value===null?null:canonical(value.type==='text'?{type:'text',bytesBase64:value.bytesBase64}:value.type==='none'?{type:'none'}:{type:value.type,value:value.value});
function assetKey(value){return canonical({network:value.network,type:value.type,code:value.code,issuer:value.issuer??null});}
function unique(rows,key,label){need(new Set(rows.map(key)).size===rows.length,'INVALID_REGISTER','Duplicate '+label+'.');}
export function normalizeHorizonInvoiceRegister(input,programme){
  object(input,'Horizon invoice register');
  need(input.schema===REGISTER,'INVALID_REGISTER','Select the original Horizon invoice register schema.');
  need(input.programmeId===programme.id&&input.programmeVersion===programme.version&&input.programmeSha256===programme.sha256,
    'PROGRAMME_MISMATCH','The deposit register belongs to another original invoice programme version.');
  const definition=normalizeInvoiceProgramme(programme.definition),assets=new Map(definition.assets.map(row=>[row.id,row])),invoices=new Map(definition.invoices.map(row=>[row.id,row]));
  const entries=list(input.entries,'entries');need(entries.length>0&&entries.length<=10000,'INVALID_REGISTER','Select between one and 10,000 original invoice mappings.');
  const normalized=entries.map(row=>{
    object(row,'register entry');const id=text(row.id,'mapping ID',255),invoiceId=text(row.invoiceId,'invoice ID',255),invoice=invoices.get(invoiceId);
    need(invoice,'UNKNOWN_INVOICE','The original programme has no selected invoice.',{invoiceId});
    need(['collection','settlement'].includes(row.role),'INVALID_REGISTER','Select collection or settlement explicitly.');
    const assetId=row.role==='collection'?invoice.assetId:invoice.settlementAssetId,asset=assets.get(assetId);
    need(!definition.networks.length||definition.networks.includes(asset?.network),'INVALID_REGISTER','The target Stellar network is excluded by the original programme.');
    need(asset?.type==='stellar','INVALID_REGISTER','The selected invoice amount must use an exact Stellar asset.',{invoiceId,role:row.role});
    const expectedAmount=row.role==='collection'?invoice.amount:invoice.settlementAmount;
    need(Object.hasOwn(row,'memo')&&row.memo!==null,'INVALID_REGISTER','Supply the exact memo, including an explicit none memo where intended.');
    const memo=normalizeSettlementMemo(row.memo),account=normalizeSettlementAccount(row.account,'deposit account');
    const fromAccount=row.fromAccount===undefined||row.fromAccount===null?null:normalizeSettlementAccount(row.fromAccount,'deposit sender');
    const note=row.note===undefined||row.note===''?'':text(row.note,'mapping note',4000);
    return {id,invoiceId,role:row.role,account,fromAccount,memo,asset,expectedAmount,expectedUnits:decimalUnits(expectedAmount,7).toString(),note};
  });
  unique(normalized,row=>row.id,'mapping IDs');
  return {schema:REGISTER,programmeId:programme.id,programmeVersion:programme.version,programmeSha256:programme.sha256,entries:normalized};
}
function movementProjection(p){return {network:p.network,from:p.from,to:p.to,memo:p.memo,amounts:p.amounts,successful:p.successful,ledger:p.ledger,operationId:p.operationId,transaction:p.transactionHashes?.transaction,issues:p.issues};}
export function buildHorizonInvoiceReview({workspaceId,programme,register,records,sourceBindings,decisionBindings=[],captureBindings=[]}){
  const definition=normalizeHorizonInvoiceRegister(register,programme),groups=new Map(),ignored=[];
  const roots=new Set(records.filter(row=>row.provider==='horizon'&&row.kind==='root'&&row.projection?.native?.network===row.network&&!(row.projection?.issues??[]).length).map(row=>row.network));
  const sourceIssues=sourceBindings.filter(row=>row.error).map(row=>({code:'SOURCE_ERROR',sourceId:row.id,error:row.error}));
  const captureIssues=captureBindings.filter(row=>row.status!=='COMPLETE'||row.missingSourceIds.length).map(row=>({code:'CAPTURE_INCOMPLETE',captureId:row.id,status:row.status,missingSourceIds:row.missingSourceIds}));
  for(const row of records){
    const p=row.projection;
    if(row.provider!=='horizon'||p?.entityType!=='payment'||!['payment','path_payment_strict_send','path_payment_strict_receive'].includes(p.native?.nativeType)){
      ignored.push({recordId:row.id,sourceId:row.sourceId,reason:'NOT_A_HORIZON_DEPOSIT_PAYMENT'});continue;
    }
    const tx=p.transactionHashes?.transaction,op=p.operationId;
    const key=typeof tx==='string'&&typeof op==='string'?canonical([row.network,tx,op]):'incomplete:'+row.id;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
  }
  const accountMappings=new Map(),exactMappings=new Map();
  for(const entry of definition.entries){
    const accountKey=canonical([entry.asset.network,entry.account]),exactKey=canonical([entry.asset.network,entry.account,memoKey(entry.memo)]);
    accountMappings.set(accountKey,(accountMappings.get(accountKey)??0)+1);
    if(!exactMappings.has(exactKey))exactMappings.set(exactKey,[]);exactMappings.get(exactKey).push(entry);
  }
  const rows=[];
  for(const [key,history] of groups){
    history.sort((a,b)=>cmp(a.observedAt,b.observedAt)||cmp(a.id,b.id));
    const current=history.at(-1),p=current.projection,recordIds=history.map(row=>row.id),issues=[];
    const previous=decisionBindings.filter(item=>{
      const original=item.record,p=original.projection;
      return recordIds.includes(original.id)||(p.transactionHashes?.transaction&&p.operationId&&canonical([original.network,p.transactionHashes.transaction,p.operationId])===key);
    });
    if(new Set(history.map(row=>canonical(movementProjection(row.projection)))).size>1)issues.push({code:'CONFLICTING_NATIVE_OBSERVATIONS'});
    if(!p.transactionHashes?.transaction||!p.operationId)issues.push({code:'MISSING_NATIVE_MOVEMENT_ID'});
    if(p.successful!==true)issues.push({code:p.successful===false?'FAILED_TRANSACTION':'SUCCESS_NOT_ESTABLISHED'});
    if(!roots.has(current.network))issues.push({code:'NETWORK_ROOT_NOT_SELECTED'});
    if(p.memo===null||p.memo===undefined)issues.push({code:'TRANSACTION_MEMO_NOT_JOINED'});
    if((p.issues??[]).length)issues.push({code:'INVALID_NATIVE_PROJECTION',details:p.issues});
    if(previous.length)issues.push({code:'EXISTING_REVIEW_DECISIONS',decisionIds:previous.map(row=>row.decision.id)});
    const amount=p.amounts?.find(row=>row.role==='payment');
    if(!amount)issues.push({code:'PAYMENT_AMOUNT_ABSENT'});
    const candidates=[],near={},accountMappingCount=accountMappings.get(canonical([current.network,p.to]))??0;
    const relevant=exactMappings.get(canonical([current.network,p.to,memoKey(p.memo)]))??[];
    if(accountMappingCount>relevant.length)near.MEMO_MISMATCH=accountMappingCount-relevant.length;
    for(const entry of relevant){
      const senderMatches=entry.fromAccount===null||entry.fromAccount===p.from;
      const assetMatches=amount&&assetKey(amount)===assetKey(entry.asset);
      const reasons=[...(!senderMatches?['SENDER_MISMATCH']:[]),...(!assetMatches?['ASSET_MISMATCH']:[])];
      const item={mappingId:entry.id,invoiceId:entry.invoiceId,role:entry.role,assetId:entry.asset.id,expectedAmount:entry.expectedAmount,expectedUnits:entry.expectedUnits};
      if(reasons.length){for(const reason of reasons)near[reason]=(near[reason]??0)+1;continue;}
      let units;try{units=decimalUnits(amount.amount,7);need(units>=0n,'INVALID_AMOUNT','Payment amount must be nonnegative.');}
      catch(error){issues.push({code:'INVALID_AMOUNT',message:error.message});continue;}
      candidates.push({...item,observedAmount:formatUnits(units,7),observedUnits:units.toString(),
        differenceUnits:(units-BigInt(entry.expectedUnits)).toString(),amountRelation:units===BigInt(entry.expectedUnits)?'EXACT':units<BigInt(entry.expectedUnits)?'LESS_THAN_INVOICE':'GREATER_THAN_INVOICE'});
    }
    const blocked=issues.length>0||sourceIssues.length>0||captureIssues.length>0;
    rows.push({movementId:sha256(key),recordId:current.id,recordIds,sourceId:current.sourceId,
      transactionHash:p.transactionHashes?.transaction??null,operationId:p.operationId??null,network:current.network,
      from:p.from,to:p.to,memo:p.memo,amount:amount??null,ledger:p.ledger,
      status:blocked?'BLOCKED':candidates.length===0?'UNMATCHED':candidates.length>1?'AMBIGUOUS':'CANDIDATE',
      candidates,near,accountMappingCount,issues,existingDecisions:previous});
  }
  rows.sort((a,b)=>cmp(a.network,b.network)||cmp(a.operationId??'',b.operationId??'')||cmp(a.movementId,b.movementId));
  const result={schema:HORIZON_INVOICE_REVIEW,workspaceId,programme:{id:programme.id,version:programme.version,sha256:programme.sha256},
    register:definition,sourceBindings,captureBindings,sourceIssues,captureIssues,rows,ignored,
    summary:{movements:rows.length,candidates:rows.filter(row=>row.status==='CANDIDATE').length,ambiguous:rows.filter(row=>row.status==='AMBIGUOUS').length,
      unmatched:rows.filter(row=>row.status==='UNMATCHED').length,blocked:rows.filter(row=>row.status==='BLOCKED').length,ignored:ignored.length}};
  return {...result,reviewSha256:sha256(result)};
}
export function validateHorizonReviewChoices(review,choices){
  list(choices,'choices');need(choices.length>0&&choices.length<=10000,'INVALID_REVIEW','Select explicit original deposit decisions.');
  unique(choices,row=>row.movementId,'movement decisions');
  const selected=choices.map(choice=>{
    object(choice,'deposit choice');const row=review.rows.find(item=>item.movementId===choice.movementId);
    need(row&&['CANDIDATE','AMBIGUOUS'].includes(row.status),'DEPOSIT_NOT_REVIEWABLE','The selected movement has unresolved native source or prior-decision issues.');
    const candidate=row.candidates.find(item=>item.mappingId===choice.mappingId);
    need(candidate,'MAPPING_MISMATCH','Select an exact account, sender, memo, network and asset match from this reviewed original deposit.');
    const reason=text(choice.reason,'individual review reason',4000);
    return {movementId:row.movementId,mappingId:candidate.mappingId,recordId:row.recordId,invoiceId:candidate.invoiceId,role:candidate.role,reason};
  });
  return selected;
}
