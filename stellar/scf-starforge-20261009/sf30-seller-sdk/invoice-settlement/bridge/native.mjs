// MIT. Read-only Bridge intake using the maintained invoice/settlement transport.
import {createReadOnlyTransport, sourceHash, stableJSON} from '../../settlement-audit/native-http.mjs';
import {BridgeContractError, describeTransfer, describeVirtualAccountActivity, inspectListPage} from './bridge-provider.mjs';
import {parseProviderJSON} from './bridge-webhook.mjs';

function need(ok,code,message,details={}) {if(!ok)throw new BridgeContractError(code,message,details);}
function text(value,name,max=1024) {
  need(typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value),'INVALID_SELECTION',name+' must be nonempty text.');return value;
}
function object(value,name) {need(value&&typeof value==='object'&&!Array.isArray(value),'INVALID_SELECTION',name+' must be an object.');return value;}
function copy(value){return JSON.parse(stableJSON(value));}
function only(value,keys,name) {object(value,name);for(const key of Object.keys(value))need(keys.includes(key),'UNSUPPORTED_FILTER','An unreviewed '+name+' field was supplied.',{field:key});}
export function normalizeBridgeBinding(input) {
  object(input,'Bridge binding');
  const developerId=text(input.developerId,'Bridge developer ID');
  need(Array.isArray(input.customerIds)&&input.customerIds.length>0,'CUSTOMERS_REQUIRED','Select the original Bridge customers explicitly.');
  const customerIds=input.customerIds.map(x=>text(x,'Bridge customer ID')).sort();
  need(new Set(customerIds).size===customerIds.length,'DUPLICATE_CUSTOMER','Select each customer once.');
  const virtualAccounts=(input.virtualAccounts??[]).map(row=>{
    object(row,'Virtual account binding');
    const customerId=text(row.customerId,'Virtual account customer'),virtualAccountId=text(row.virtualAccountId,'Virtual account ID');
    need(customerIds.includes(customerId),'CUSTOMER_MISMATCH','A virtual account must belong to a selected customer.');
    return {customerId,virtualAccountId};
  }).sort((a,b)=>stableJSON(a).localeCompare(stableJSON(b)));
  need(new Set(virtualAccounts.map(stableJSON)).size===virtualAccounts.length,'DUPLICATE_VIRTUAL_ACCOUNT','Select each virtual account once.');
  return {developerId,customerIds,virtualAccounts};
}
const TRANSFER_FILTERS=['tx_hash','updated_after_ms','updated_before_ms','template_id','state'];
const TRANSFER_STATES=['awaiting_funds','funds_received','payment_submitted','payment_processed','in_review','kyc_required','kyc_in_review','developer_kyb_required','canceled','error','returned','refund_in_flight','refund_failed','refunded','undeliverable'];
export function normalizeBridgeRead(input,binding) {
  only(input,['kind','id','customerId','virtualAccountId','limit','starting_after','filters'],'read');
  const kind=text(input.kind,'Bridge read kind');
  need(['transfers','transfer','virtualAccountActivities'].includes(kind),'UNSUPPORTED_READ','Select transfers, transfer or virtualAccountActivities.');
  const filters=copy(input.filters??{});
  only(filters,kind==='transfers'?TRANSFER_FILTERS:kind==='virtualAccountActivities'?['deposit_id','deposit_ids','tx_hash','event_type']:[],'filter');
  for(const [key,value] of Object.entries(filters)) {
    if(key.endsWith('_ms'))need(Number.isSafeInteger(value)&&value>=0,'INVALID_TIMESTAMP','Keep exact nonnegative millisecond filter integers.',{field:key});
    else if(key==='deposit_ids') {
      need(Array.isArray(value)&&value.length>0&&value.length<=100,'INVALID_FILTER','deposit_ids must be a bounded nonempty array.');
      value.forEach(x=>text(x,'Deposit ID'));need(new Set(value).size===value.length,'INVALID_FILTER','Select each deposit once.');
    } else text(value,key);
  }
  if(filters.state!==undefined)need(TRANSFER_STATES.includes(filters.state),'UNSUPPORTED_STATE_FILTER','Select an exact documented transfer state.');
  if(filters.updated_after_ms!==undefined&&filters.updated_before_ms!==undefined)
    need(filters.updated_after_ms<filters.updated_before_ms,'INVALID_TIME_RANGE','The updated-after bound must precede updated-before.');
  if(filters.event_type!==undefined)need(['funds_received','payment_submitted','payment_processed','in_review','refund','refund_in_flight','refund_failed','microdeposit','account_update','deactivation','activation'].includes(filters.event_type),'UNSUPPORTED_ACTIVITY_FILTER','Select an exact documented virtual-account activity type.');
  need(!(filters.deposit_id!==undefined&&filters.deposit_ids!==undefined),'INVALID_FILTER','deposit_id and deposit_ids are mutually exclusive.');
  const result={kind,filters};
  if(kind==='transfer') {
    need(input.limit===undefined&&input.starting_after===undefined&&input.customerId===undefined&&input.virtualAccountId===undefined,
      'INVALID_SELECTION','A transfer detail read selects only its original ID.');
    result.id=text(input.id,'Transfer ID');return result;
  }
  need(input.id===undefined,'INVALID_SELECTION','List reads do not accept a detail ID.');
  result.limit=input.limit??100;
  need(Number.isSafeInteger(result.limit)&&result.limit>=1&&result.limit<=100,'INVALID_LIMIT','Bridge page limit must be 1 through 100.');
  result.starting_after=input.starting_after==null?null:text(input.starting_after,'Original older cursor');
  if(kind==='virtualAccountActivities') {
    result.customerId=text(input.customerId,'Customer ID');result.virtualAccountId=text(input.virtualAccountId,'Virtual account ID');
    need(binding.virtualAccounts.some(x=>x.customerId===result.customerId&&x.virtualAccountId===result.virtualAccountId),
      'VIRTUAL_ACCOUNT_MISMATCH','Select the exact original customer/virtual-account pair.');
  } else need(input.customerId===undefined&&input.virtualAccountId===undefined,'UNSUPPORTED_FILTER',
    'The documented global transfer list has no customer query. Full pages are retained and selected customers are projected locally.');
  return result;
}
function errorValue(error){return {code:String(error?.code??'BRIDGE_RESPONSE_ERROR'),message:String(error?.message??error),details:copy(error?.details??{})};}
export function openBridgeSource(configuration) {
  object(configuration,'Private Bridge configuration');
  const binding=normalizeBridgeBinding(configuration.binding);
  need(['sandbox','production'].includes(configuration.environment),'ENVIRONMENT_REQUIRED','Select sandbox or production explicitly.');
  need(configuration.token===undefined,'INVALID_CREDENTIAL','Bridge uses its Api-Key header, not a bearer token.');
  const headers=new Headers(configuration.headers??{}),apiKey=configuration.apiKey;
  if(apiKey!==undefined) {
    text(apiKey,'Private Bridge API key',16384);
    need(!headers.has('api-key')||headers.get('api-key')===apiKey,'INVALID_CREDENTIAL','Conflicting Bridge API-key values.');
    headers.set('Api-Key',apiKey);
  }
  need(headers.has('api-key')&&!headers.has('authorization'),'INVALID_CREDENTIAL','Supply the original private Api-Key header.');
  const transport=createReadOnlyTransport('bridge',{
    baseUrl:configuration.baseUrl,network:configuration.network,headers,
    allowHttp:configuration.allowHttp,timeoutMs:configuration.timeoutMs,
    maximumResponseBytes:configuration.maximumResponseBytes
  });
  const descriptor={...transport.descriptor,environment:configuration.environment,binding,
    transportId:transport.descriptor.id};
  descriptor.id=sourceHash(descriptor);
  const pending=new Set(),lifetime=new AbortController();
  let closing=false,closed=false,closingTask=null;
  function describe(){return copy({...descriptor,kinds:['transfers','transfer','virtualAccountActivities'],mutations:[]});}
  async function readOne(input,{signal}={}) {
    need(!closing&&!closed,'SOURCE_CLOSED','Reopen the original Bridge source before another read.');
    const read=normalizeBridgeRead(input,binding),controller=new AbortController();
    const abort=()=>controller.abort(signal?.aborted?signal.reason:lifetime.signal.reason);
    signal?.addEventListener('abort',abort,{once:true});lifetime.signal.addEventListener('abort',abort,{once:true});
    if(signal?.aborted||lifetime.signal.aborted)abort();
    let task;
    task=(async()=>{
      const query={...read.filters};
      const deposits=query.deposit_ids??null;delete query.deposit_ids;
      let path;
      if(read.kind==='transfer')path='transfers/'+encodeURIComponent(read.id);
      else {
        path=read.kind==='transfers'?'transfers':'customers/'+encodeURIComponent(read.customerId)+'/virtual_accounts/'+encodeURIComponent(read.virtualAccountId)+'/history';
        query.limit=read.limit;if(read.starting_after!==null)query.starting_after=read.starting_after;
      }
      const url=transport.urlFor(path,query);
      if(deposits)for(const id of deposits)url.searchParams.append('deposit_ids[]',id);
      const request={provider:'bridge',source:describe(),kind:read.kind,read,method:'GET',url:url.href};
      const response=await transport.get(url,request,controller.signal);
      response.value=null;response.records=[];response.excluded=[];response.findings=[];
      if(response.error)return response;
      try {
        const document=parseProviderJSON(new TextDecoder('utf-8',{fatal:true}).decode(response.response.body));
        response.value=document;
        const page=read.kind==='transfer'?null:inspectListPage(document,{limit:read.limit,previousCursor:read.starting_after});
        const rows=page?page.original.data:[document];
        for(const original of rows) {
          const observation=read.kind==='virtualAccountActivities'?describeVirtualAccountActivity(original):describeTransfer(original);
          if(read.kind==='transfer')need(observation.id===read.id,'TRANSFER_MISMATCH','Provider returned another transfer.');
          if(read.kind==='virtualAccountActivities')
            need(observation.customerId===read.customerId&&observation.virtualAccountId===read.virtualAccountId,'VIRTUAL_ACCOUNT_MISMATCH','Activity belongs to another customer or virtual account.');
          if(!binding.customerIds.includes(observation.customerId)) {
            if(read.kind!=='transfers')throw new BridgeContractError('CUSTOMER_MISMATCH','Detail belongs to an unselected original customer.');
            response.excluded.push({id:observation.id,customerId:observation.customerId,reason:'UNSELECTED_CUSTOMER'});continue;
          }
          response.records.push(observation);
        }
        response.page=page?{count:page.count,terminal:page.terminal,firstId:page.firstId,lastId:page.lastId}:null;
        response.continuation={done:page? page.terminal:true,
          next:page&&!page.terminal?{...read,starting_after:page.lastId}:null};
      } catch(error) {
        response.error=errorValue(error);response.records=[];response.continuation={done:false,next:read};
      }
      return response;
    })();
    pending.add(task);
    try{return await task;}
    finally{pending.delete(task);signal?.removeEventListener('abort',abort);lifetime.signal.removeEventListener('abort',abort);}
  }
  function close() {
    if(closed)return Promise.resolve({state:'CLOSED'});
    if(closingTask)return closingTask;
    closing=true;lifetime.abort(new BridgeContractError('SOURCE_CLOSING','The original Bridge source is closing.'));
    closingTask=(async()=>{while(pending.size)await Promise.allSettled([...pending]);closed=true;return {state:'CLOSED'};})();
    closingTask.catch(()=>{closingTask=null;});return closingTask;
  }
  return {describe,normalizeRead:input=>normalizeBridgeRead(input,binding),read:readOne,close};
}

/** Reopen complete historical observations without obtaining a credential or
 * constructing an HTTP client. Live reads require the original private binding. */
export function openRetainedBridgeSource(input) {
  object(input,'Retained public Bridge selection');
  const selection=copy(input),binding=normalizeBridgeBinding(selection.binding);
  need(selection.provider==='bridge'&&['sandbox','production'].includes(selection.environment)&&
    stableJSON(binding)===stableJSON(selection.binding)&&typeof selection.transportId==='string',
    'SELECTION_CHANGED','Keep the exact original public Bridge binding.');
  const unsigned=copy(selection);delete unsigned.kinds;delete unsigned.mutations;unsigned.id=selection.transportId;
  need(sourceHash(unsigned)===selection.id,'SELECTION_CHANGED','The retained Bridge source identity changed.');
  let closed=false;
  return {describe:()=>copy(selection),normalizeRead:input=>normalizeBridgeRead(input,binding),
    read:async()=>{throw new BridgeContractError(closed?'SOURCE_CLOSED':'PRIVATE_CONNECTION_REQUIRED',
      'Inspect retained observations locally; bind the original private Bridge configuration before a new provider read.');},
    close:async()=>{closed=true;return {state:'CLOSED'};}};
}
