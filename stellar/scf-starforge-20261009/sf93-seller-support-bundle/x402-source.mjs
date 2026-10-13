// MIT. One bounded authenticated GET of the existing merchant owner.
import {request} from 'node:http';
import {createHash} from 'node:crypto';
import {normalizeX402Source,x402Endpoint,createX402Observation,validateX402Source,X402_FILE_LIMIT} from './x402-observation.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const codeOf=e=>/^[A-Za-z0-9_.:-]{1,120}$/.test(e?.code??'')?e.code:'X402_SOURCE_READ_FAILED';
const cooldowns=new Map();
export async function readX402Source(selection,{signal,environment=process.env}={}) {
  const endpoint=x402Endpoint(selection.endpoint),token=environment[selection.tokenEnv],timeoutMs=selection.timeoutMs??5000;
  if(typeof selection.tokenEnv!=='string'||!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(selection.tokenEnv)||
    typeof token!=='string'||token.length<32||token.length>65536||/[\x00-\x20\x7f]/.test(token))fail('X402_OPERATOR_CREDENTIAL_REQUIRED');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)fail('X402_TIMEOUT_INVALID');
  if(signal!==undefined&&!(signal instanceof AbortSignal))fail('X402_SIGNAL_INVALID');
  if(signal?.aborted)fail('STOPPING');
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
      req=request(new URL(endpoint),{method:'GET',agent:false,headers:{authorization:'Bearer '+token,accept:'application/json','cache-control':'no-cache'}},response=>{
        res=response;const status=res.statusCode??0,limit=status===200?X402_FILE_LIMIT:4096;
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
            validateX402Source(value);finish(null,{bytes,observation:value});
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
export async function collectX402Observation(merchant,signal,environment=process.env) {
  const selection=normalizeX402Source(merchant.x402),startedAt=new Date().toISOString();
  let sourceBytes=null,errorCode=null;
  try{sourceBytes=(await readX402Source(selection,{signal,environment})).bytes;}
  catch(error){if(signal?.aborted||error.code==='STOPPING')return {error:'STOPPING'};errorCode=codeOf(error);}
  return {packet:createX402Observation({registration:{id:merchant.id,label:merchant.label},selection,
    startedAt,generatedAt:new Date().toISOString(),sourceBytes,errorCode})};
}
export async function reviewX402Source(input,{signal,environment=process.env}={}) {
  const keys=['endpoint','tokenEnv','timeoutMs','paymentAfterSeconds','outputAfterSeconds'];
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))fail('X402_SOURCE_REVIEW_INVALID');
  const {bytes,observation}=await readX402Source(input,{signal,environment});
  const x402=normalizeX402Source({...input,...Object.fromEntries(['storeId','tenantId','resourceVersionId','configurationSha256'].map(k=>[k,observation[k]]))});
  return {schema:'stellar-forge.sf93.x402-source-review.v1',x402,observedAt:observation.capturedAt,
    source:{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),snapshotSha256:observation.snapshotSha256,runtimeId:observation.runtimeId,counts:observation.counts},
    authority:'ORIGINAL_MERCHANT_OWNER_READ_ONLY; NO_PAYMENT_OR_FULFILLMENT'};
}
