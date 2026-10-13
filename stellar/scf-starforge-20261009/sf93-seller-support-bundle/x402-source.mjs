// MIT. One bounded authenticated GET of the existing merchant owner.
import {request} from 'node:http';
import {createHash} from 'node:crypto';
import {normalizeX402Source,x402Endpoint,createX402Observation,validateX402Source,x402ObservationSignals,X402_FILE_LIMIT} from './x402-observation.mjs';
import {validateX402Summary} from './x402-summary.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const codeOf=e=>/^[A-Za-z0-9_.:-]{1,120}$/.test(e?.code??'')?e.code:'X402_SOURCE_READ_FAILED';
const cooldowns=new Map();
export async function readX402Source(selection,{signal,environment=process.env,summary=false,historySequence=null,immutablePrefixes=null}={}) {
  const endpoint=x402Endpoint(selection.endpoint)+(summary?'/summary':''),token=environment[selection.tokenEnv],timeoutMs=selection.timeoutMs??5000;
  if(typeof selection.tokenEnv!=='string'||!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(selection.tokenEnv)||
    typeof token!=='string'||token.length<32||token.length>65536||/[\x00-\x20\x7f]/.test(token))fail('X402_OPERATOR_CREDENTIAL_REQUIRED');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)fail('X402_TIMEOUT_INVALID');
  if(signal!==undefined&&!(signal instanceof AbortSignal))fail('X402_SIGNAL_INVALID');
  if(signal?.aborted)fail('STOPPING');
  if(historySequence!==null&&(!Number.isSafeInteger(historySequence)||historySequence<1))fail('X402_HISTORY_SEQUENCE_INVALID');
  if(immutablePrefixes!==null&&(!immutablePrefixes||['history','exchanges'].some(group=>!Number.isSafeInteger(immutablePrefixes[group]?.rows)||immutablePrefixes[group].rows<0)))fail('X402_HISTORY_PREFIX_INVALID');
  const key=endpoint+'\n'+selection.tokenEnv;
  for(const [k,until] of cooldowns)if(until<=Date.now())cooldowns.delete(k);
  if((cooldowns.get(key)??0)>Date.now())fail('X402_RETRY_AFTER');
  if(!cooldowns.has(key)&&cooldowns.size>=128)fail('X402_COOLDOWN_CAPACITY');
  return new Promise((resolve,reject)=>{
    let req,res,timer,done=false;
    const stop=()=>finish(Object.assign(new Error('STOPPING'),{code:'STOPPING'}));
    const finish=(error,value)=>{
      if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',stop);
      if(error){res?.destroy();req?.destroy();reject(error);}else resolve(value);
    };
    try{
      req=request(new URL(endpoint),{method:'GET',agent:false,headers:{authorization:'Bearer '+token,accept:'application/json','cache-control':'no-cache',...(summary&&historySequence!==null?{'X-Merchant-History-Sequence':String(historySequence)}:{}),
        ...(summary&&immutablePrefixes?{'X-Merchant-History-Prefix-Rows':String(immutablePrefixes.history.rows),
          'X-Merchant-Exchanges-Prefix-Rows':String(immutablePrefixes.exchanges.rows)}:{})}},response=>{
        res=response;const status=res.statusCode??0,limit=status===200?(summary?2*1024*1024:X402_FILE_LIMIT):4096;
        if(status>=300&&status<400){finish(Object.assign(new Error('X402_REDIRECT_REJECTED'),{code:'X402_REDIRECT_REJECTED'}));return;}
        if(status===429||status===503){
          const raw=res.headers['retry-after'],seconds=typeof raw==='string'&&/^[0-9]+$/.test(raw)?Number(raw):null;
          const delay=seconds===null?Date.parse(raw)-Date.now():seconds*1000;
          const deadline=Date.now()+Math.max(1000,Number.isNaN(delay)?1000:delay);
          cooldowns.set(key,Number.isFinite(deadline)?deadline:Infinity);
        }
        const length=res.headers['content-length'];
        if(length!==undefined&&(!/^[0-9]+$/.test(String(length))||Number(length)>limit)){
          finish(Object.assign(new Error('X402_SOURCE_SIZE_LIMIT'),{code:'X402_SOURCE_SIZE_LIMIT'}));return;
        }
        const chunks=[];let size=0;
        res.on('data',chunk=>{if(done)return;size+=chunk.length;if(size>limit){finish(Object.assign(new Error('X402_SOURCE_SIZE_LIMIT'),{code:'X402_SOURCE_SIZE_LIMIT'}));return;}chunks.push(chunk);});
        res.on('end',()=>{
          if(done)return;
          try{
            if(!res.complete||!size)fail('X402_SOURCE_INCOMPLETE');
            const bytes=Buffer.concat(chunks,size);let value;
            try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('X402_SOURCE_JSON_INVALID');}
            if(status!==200){
              if(['MERCHANT_OBSERVATION_WORKLOAD_LIMIT','MERCHANT_OBSERVATION_OWNER_CHANGED','MERCHANT_OBSERVATION_BUSY'].includes(value?.error))fail(value.error);
              fail(status===401||status===403?'X402_ACCESS_DENIED':status===429?'X402_RATE_LIMITED':'X402_HTTP_UNAVAILABLE');
            }
            if(!/^application\/json(?:\s*;|$)/i.test(String(res.headers['content-type']??'')))fail('X402_CONTENT_TYPE_INVALID');
            (summary?validateX402Summary:validateX402Source)(value);finish(null,{bytes,observation:value});
          }catch(error){finish(error);}
        });
        res.on('aborted',()=>finish(Object.assign(new Error('X402_SOURCE_INCOMPLETE'),{code:'X402_SOURCE_INCOMPLETE'})));
        res.on('error',()=>finish(Object.assign(new Error('X402_SOURCE_READ_FAILED'),{code:'X402_SOURCE_READ_FAILED'})));
      });
      req.on('error',()=>finish(Object.assign(new Error('X402_SOURCE_READ_FAILED'),{code:signal?.aborted?'STOPPING':'X402_SOURCE_READ_FAILED'})));
      timer=setTimeout(()=>finish(Object.assign(new Error('X402_SOURCE_TIMEOUT'),{code:'X402_SOURCE_TIMEOUT'})),timeoutMs);
      signal?.addEventListener('abort',stop,{once:true});
      if(signal?.aborted)stop();else req.end();
    }catch(error){finish(error);}
  });
}
function needsFullCapture(result,row,config,now) {
  if(!row)return true;
  const prior=row.x402Observation,current=result.packet?.x402?.summary;
  if(prior&&current&&(prior.runtimeId!==current.runtimeId||
    JSON.stringify(prior.binding??prior.polling?.binding??null)!==JSON.stringify(current.binding??null)))return true;
  const interval=config?.captureEveryMs??60000;
  if(!row.lastFullCaptureAttemptAt||now-Date.parse(row.lastFullCaptureAttemptAt)>=interval)return true;
  for(const [kind,signal] of Object.entries(result.signals)) {
    const current=row.conditions?.[kind];
    if(signal.bad===true&&!current?.incidentId&&
      (current?.badStreak??0)+1>=(signal.openAfter??config?.failurePolls??2))return true;
    if(signal.bad===false&&current?.incidentId&&
      (current?.goodStreak??0)+1>=(config?.recoveryPolls??2))return true;
  }
  return false;
}
export async function collectX402Observation(merchant,signal,environment=process.env,{row=null,config=null}={}) {
  const selection=normalizeX402Source(merchant.x402),startedAt=new Date().toISOString();
  let sourceBytes=null,errorCode=null;
  const summarized=selection.polling==='summary';
  try{sourceBytes=(await readX402Source(selection,{signal,environment,summary:summarized,
    historySequence:summarized?row?.previous?.historyBoundary?.sequence??null:null,
    immutablePrefixes:summarized?row?.previous?.immutablePrefixes??null:null})).bytes;}
  catch(error){if(signal?.aborted||error.code==='STOPPING')return {error:'STOPPING'};errorCode=codeOf(error);}
  let packet=createX402Observation({registration:{id:merchant.id,label:merchant.label},selection,
    startedAt,generatedAt:new Date().toISOString(),sourceBytes,errorCode});
  if(!summarized||!sourceBytes)return {packet};
  const result=x402ObservationSignals(merchant,{packet},Date.now(),row?.previous??null);
  if(!result.successful||!needsFullCapture(result,row,config,Date.now()))return {packet};
  const fullCaptureAttemptAt=new Date().toISOString(),fullStartedAt=fullCaptureAttemptAt;
  try {
    const full=await readX402Source(selection,{signal,environment});
    const candidate=createX402Observation({registration:{id:merchant.id,label:merchant.label},selection,
      startedAt:fullStartedAt,generatedAt:new Date().toISOString(),sourceBytes:full.bytes,pollSourceBytes:sourceBytes});
    // Later contradictory identity, history or clock evidence stays the selected
    // full packet. The original model decides unavailable/identity and retains it.
    return {packet:candidate,fullCaptureAttemptAt,fullCaptureFetched:true};
  }catch(error){
    if(signal?.aborted||error.code==='STOPPING')return {error:'STOPPING'};
    // The usable summary has its own time and source hash. A failed optional
    // full capture does not replace it with unavailable or reset its age.
    const reason=codeOf(error),availableFailure=new Set(['X402_SOURCE_READ_FAILED','X402_SOURCE_TIMEOUT','X402_SOURCE_SIZE_LIMIT',
      'X402_HTTP_UNAVAILABLE','X402_RATE_LIMITED','X402_RETRY_AFTER','X402_SOURCE_INCOMPLETE',
      'MERCHANT_OBSERVATION_WORKLOAD_LIMIT','MERCHANT_OBSERVATION_BUSY']);
    packet=createX402Observation({registration:{id:merchant.id,label:merchant.label},selection,
      startedAt,generatedAt:packet.x402.generatedAt,sourceBytes,
      errorCode:availableFailure.has(reason)?null:reason,fullCaptureError:reason});
  }
  return {packet,fullCaptureAttemptAt};
}
export async function reviewX402Source(input,{signal,environment=process.env}={}) {
  const keys=['endpoint','tokenEnv','timeoutMs','paymentAfterSeconds','outputAfterSeconds','polling','inputsSha256'];
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))fail('X402_SOURCE_REVIEW_INVALID');
  if(input.polling!==undefined&&input.polling!=='summary'||input.inputsSha256!==undefined&&input.polling!=='summary')fail('X402_SOURCE_REVIEW_INVALID');
  const {bytes,observation}=await readX402Source(input,{signal,environment,summary:input.polling==='summary'});
  if(input.inputsSha256!==undefined&&input.inputsSha256!==observation.binding?.inputsSha256)fail('X402_REVIEW_INPUTS_CHANGED');
  const x402=normalizeX402Source({...input,...Object.fromEntries(['storeId','tenantId','resourceVersionId','configurationSha256'].map(k=>[k,observation[k]]))});
  return {schema:'stellar-forge.sf93.x402-source-review.v1',x402,observedAt:observation.capturedAt,
    source:{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),snapshotSha256:observation.snapshotSha256,runtimeId:observation.runtimeId,counts:observation.counts},
    authority:'ORIGINAL_MERCHANT_OWNER_READ_ONLY; NO_PAYMENT_OR_FULFILLMENT'};
}
