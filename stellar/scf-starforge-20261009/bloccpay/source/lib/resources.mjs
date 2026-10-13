import {invariant,sha256,canonicalJSON} from './source-json.mjs';
import {actionContract} from './catalogue.mjs';
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const pointerPart=value=>String(value).replaceAll('~','~0').replaceAll('/','~1');
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function tokensBelow(tokens,pointer) {
 const output={};for(const [path,value]of Object.entries(tokens??{}))
  if(path===pointer||path.startsWith(pointer+'/'))output[path.slice(pointer.length)]=value;
 return output;
}
function nativeID(kind,value,request,context) {
 if(kind==='horizon-network')return'network';
 if(kind==='horizon-transaction')return value.hash??value.id;
 if(kind==='horizon-account')return value.account_id??value.id;
 if(kind==='horizon-ledger')return String(value.sequence??value.id??'');
 if(kind==='sdp-capabilities')return value.wallet_id??request?.input?.params?.id;
 if(kind==='sdp-organization')return value.id??context.tenant;
 if(kind==='sdp-balance')return request?.input?.params?.id??context.sourceWalletId;
 if(kind.endsWith('-result'))return request?.resourceId??request?.requestSha256;
 return value.id;
}
function related(kind,value,context) {
 const reads=[],add=(action,input)=>reads.push({action,input});
 if(kind==='sdp-disbursement'&&value.id){
  add('sdp.disbursement.receivers',{params:{id:value.id}});
  // The payments route has no disbursement_id filter; match its exact retained native disbursement IDs locally.
  add('sdp.payments.list',{});
 }else if(kind==='sdp-distribution-wallet'&&value.id){
  add('sdp.distribution-wallet.capabilities',{params:{id:value.id}});
  add('sdp.distribution-wallet.balance',{params:{id:value.id}});
 }else if(kind==='bridge-customer'&&value.id){
  add('bridge.virtual-accounts.list',{params:{customerID:value.id}});
 }else if(kind==='bridge-virtual-account'&&value.id&&context.customerId){
  add('bridge.virtual-account.history',{params:{customerID:context.customerId,virtualAccountID:value.id}});
 }else if(kind==='bridge-transfer'&&value.id){
  add('bridge.transfer.get',{params:{transferID:value.id}});
 }else if(kind==='horizon-account'&&value.account_id){
  add('horizon.transactions.account',{params:{accountId:value.account_id}});
 }
 return reads;
}
export function projectResource({exchange,event,provider,environment,sourceReference={}}) {
 const request=exchange?.request;
 provider??=request?.provider;
 environment??=request?.environment;
 invariant(['sdp','horizon','bridge'].includes(provider)&&['production','sandbox'].includes(environment),'PROJECTION_SCOPE_REQUIRED');
 const context={...(request?.context??{}),provider,environment,
  sourceId:sourceReference.sourceId??null,connectionAlias:sourceReference.connectionAlias??null,
  providerScope:sourceReference.sourceScope??request?.context?.sourceScope??null,
  sourceScope:sourceReference.sourceScope??request?.context?.sourceScope??null,
  networkPassphrase:sourceReference.networkPassphrase??request?.context?.networkPassphrase??sourceReference.network??null,
  sourceReference,observedAt:sourceReference.observedAt??exchange?.finishedAt??null};
 let records=[],kind,numberTokens={},eventEnvelope=null;
 if(event){
  invariant(provider==='bridge'&&event.verified===true,'VERIFIED_BRIDGE_EVENT_REQUIRED');
  eventEnvelope=event.value??event.event??event;
  kind={'transfer':'bridge-transfer','customer':'bridge-customer','virtual_account.activity':'bridge-virtual-account-event'}[eventEnvelope.event_category];
  if(!kind)return[];
  invariant(plain(eventEnvelope.event_object),'BRIDGE_EVENT_OBJECT_REQUIRED');
  invariant(String(eventEnvelope.event_object.id)===String(eventEnvelope.event_object_id),'BRIDGE_EVENT_OBJECT_ID_MISMATCH');
  records=[{value:eventEnvelope.event_object,pointer:'/event_object'}];
  numberTokens=event.numberTokens??{};
  Object.assign(context,{developerId:eventEnvelope.event_developer_id??null,
   eventId:eventEnvelope.event_id,eventType:eventEnvelope.event_type,
   eventSequence:eventEnvelope.event_sequence===undefined?null:String(event.numberTokens?.['/event_sequence']??eventEnvelope.event_sequence),
   eventCreatedAt:eventEnvelope.event_created_at??null,deleted:eventEnvelope.event_type.endsWith('.deleted')});
 }else{
  invariant(exchange?.classification?.outcome==='accepted'&&exchange.response?.complete,'COMPLETE_ACCEPTED_SOURCE_REQUIRED');
  const contract=actionContract(request.action),value=exchange.parsed?.value;
  kind=contract.entry.resourceKind;numberTokens=exchange.parsed?.numberTokens??{};
  if(contract.entry.responseFormat!=='json'||value===undefined||value===null)return[];
  if(request.action==='bridge.transfer.create'&&request.input.body?.dry_run===true)kind='bridge-transfer-route';
  if(contract.entry.pagination==='horizon'){
   invariant(Array.isArray(value?._embedded?.records),'HORIZON_PAGE_SCHEMA');
   records=value._embedded.records.map((value,i)=>({value,pointer:'/_embedded/records/'+i}));
  }else if(contract.entry.pagination){
   invariant(Array.isArray(value?.data),'PROVIDER_PAGE_SCHEMA');
   records=value.data.map((value,i)=>({value,pointer:'/data/'+i}));
  }else if(Array.isArray(value))records=value.map((value,i)=>({value,pointer:'/'+i}));
  else records=[{value,pointer:''}];
  Object.assign(context,{customerId:request.input?.params?.customerID??context.customerId??null,
   virtualAccountId:request.input?.params?.virtualAccountID??null,
   action:request.action,readOnly:!request.mutation,requestInput:request.input});
 }
 const output=[];
 for(const record of records){
  invariant(plain(record.value),'PROVIDER_RESOURCE_OBJECT_REQUIRED');
  const value=record.value,localContext={...context};
  if(kind==='horizon-network')invariant(typeof value.network_passphrase==='string'&&
   value.network_passphrase===context.networkPassphrase,'HORIZON_NETWORK_MISMATCH');
  if(kind==='bridge-virtual-account')localContext.customerId=value.customer_id??localContext.customerId;
  if(kind==='bridge-virtual-account-event'){
   localContext.customerId=value.customer_id??value.customer?.id??localContext.customerId;
   localContext.virtualAccountId=value.virtual_account_id??value.virtual_account?.id??localContext.virtualAccountId;
  }
  if(kind==='bridge-transfer')localContext.customerId=value.on_behalf_of??localContext.customerId;
  let id=nativeID(kind,value,request,localContext);
  if(kind==='bridge-transfer-route')id=request.requestSha256;
  invariant(id!==undefined&&id!==null&&String(id).length,'PROVIDER_RESOURCE_ID_REQUIRED',{kind,pointer:record.pointer});
  const tokens=tokensBelow(numberTokens,record.pointer);
  const contentSha256=sha256(Buffer.from(canonicalJSON({value,numberTokens:tokens})));
  const updated=value.updated_at??value.modified_at??(kind==='bridge-virtual-account-event'?value.created_at:null);
  const row={id:String(id),kind,environment,value,numberTokens:tokens,pointer:record.pointer,
   context:localContext,contentSha256,versionSha256:contentSha256,
   sourceUpdatedAt:validTime(updated)?updated:null,
   observedAt:localContext.observedAt,
   eventId:eventEnvelope?.event_id??null,
   eventSequence:localContext.eventSequence??null,
   partial:kind.endsWith('-result')||kind==='bridge-transfer-route',
   relatedReads:related(kind,value,localContext)};
  output.push(row);
  // An original Horizon join contains its actual transaction; retain it as its own resource.
  if(kind==='horizon-operation'&&plain(value.transaction)&&value.transaction.hash){
   const tx=value.transaction,txTokens=tokensBelow(numberTokens,record.pointer+'/transaction');
   const hash=sha256(Buffer.from(canonicalJSON({value:tx,numberTokens:txTokens})));
   output.push({id:tx.hash,kind:'horizon-transaction',environment,value:tx,numberTokens:txTokens,
    pointer:record.pointer+'/transaction',context:localContext,contentSha256:hash,versionSha256:hash,
    sourceUpdatedAt:null,observedAt:localContext.observedAt,eventId:null,eventSequence:null,partial:false,relatedReads:[]});
  }
 }
 return output;
}
export function reconcileVersions(existing,incoming) {
 invariant(existing.kind===incoming.kind&&String(existing.id)===String(incoming.id)&&
  existing.environment===incoming.environment,'RESOURCE_IDENTITY_MISMATCH');
 const oldScope=existing.context?.providerScope??existing.sourceScope,newScope=incoming.context?.providerScope??incoming.sourceScope;
 invariant(!oldScope||!newScope||oldScope===newScope,'RESOURCE_PROVIDER_SCOPE_MISMATCH');
 if(existing.contentSha256===incoming.contentSha256)return{decision:'replace',reason:'Same original business content; retain the latest observation and source.'};
 if(existing.partial&&!incoming.partial)return{decision:'replace',reason:'Complete original resource succeeds a partial operation response.'};
 if(!existing.partial&&incoming.partial)return{decision:'keep',reason:'Partial operation response does not replace a complete resource.'};
 const a=existing.eventSequence,b=incoming.eventSequence;
 if(a!==null&&a!==undefined&&b!==null&&b!==undefined&&/^\d+$/.test(String(a))&&/^\d+$/.test(String(b))&&
  existing.context?.developerId===incoming.context?.developerId){
  if(BigInt(b)>BigInt(a))return{decision:'replace',reason:'Later original event sequence for this resource.'};
  if(BigInt(b)<BigInt(a))return{decision:'keep',reason:'Earlier original event sequence retained in history.'};
  return{decision:'conflict',reason:'Same original event sequence has different business content.'};
 }
 const oldTime=Date.parse(existing.sourceUpdatedAt),newTime=Date.parse(incoming.sourceUpdatedAt);
 if(Number.isFinite(oldTime)&&Number.isFinite(newTime)){
  if(newTime>oldTime)return{decision:'replace',reason:'Later native resource update timestamp.'};
  if(newTime<oldTime)return{decision:'keep',reason:'Earlier native resource update retained in history.'};
  return{decision:'conflict',reason:'Same native update timestamp has different original content.'};
 }
 if(['horizon-transaction','horizon-operation','horizon-ledger','bridge-virtual-account-event'].includes(incoming.kind))
  return{decision:'conflict',reason:'An immutable native record has conflicting original observations.'};
 if(incoming.context?.readOnly&&Date.parse(incoming.observedAt)>Date.parse(existing.observedAt))
  return{decision:'replace',reason:'Later complete native read of an untimed mutable resource.'};
 return{decision:'conflict',reason:'Original observations do not establish a later native version.'};
}
