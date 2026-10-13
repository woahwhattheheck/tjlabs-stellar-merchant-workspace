// SPDX-License-Identifier: MIT
// One explicitly reviewed original request. This adapter never retries or probes quota.
import {configuration,need,hash,MAX_RESPONSE,responseHeaders,usage,stamp} from './contract.mjs';
export function providerAccount(config,environment=process.env){
  configuration(config);const value=environment[config.apiKeyEnv];
  return {name:config.name,apiKeyEnv:config.apiKeyEnv,configured:typeof value==='string'&&Boolean(value.trim())};
}
export function requireProviderKey(config,environment=process.env){
  configuration(config);const key=environment[config.apiKeyEnv];
  need(typeof key==='string'&&key.length>=1&&key.length<=4096&&!/[\s\u0000-\u001f]/.test(key),
    'PIRATE_KEY_REQUIRED','Configure the original host environment reference before approving a source request.',409);
  return key;
}
export async function captureForecast({config,request,environment=process.env,fetchImpl=globalThis.fetch,signal,onHeaders=async()=>{}}){
  const key=requireProviderKey(config,environment);
  need(request?.method==='GET'&&request.origin==='https://api.pirateweather.net'&&request.kind==='FORECAST',
    'PIRATE_REQUEST_CHANGED','Use the original forecast request contract.',409);
  const base='https://api.pirateweather.net/forecast/'+encodeURIComponent(key)+'/'+request.latitude+','+request.longitude;
  const url=base+'?'+new URLSearchParams({units:request.units});
  const controller=new AbortController(),abort=()=>controller.abort(signal?.reason),timeout=setTimeout(()=>controller.abort(new DOMException('The original source request timed out.','TimeoutError')),60000);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const startedAt=new Date().toISOString();let response=null,headers=[],chunks=[],size=0,observedAt=null;
  try{
    response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{accept:'application/json'},signal:controller.signal});
    observedAt=new Date().toISOString();stamp(observedAt);headers=responseHeaders([...response.headers.entries()]);
    const metadata={startedAt,observedAt,status:response.status,headers,usage:usage(headers,observedAt)};
    await onHeaders(metadata);
    if(response.body){
      const reader=response.body.getReader();
      try{
        while(true){
          const item=await reader.read();if(item.done)break;
          const chunk=Buffer.from(item.value);
          if(size+chunk.length>MAX_RESPONSE){
            const keep=Math.max(0,MAX_RESPONSE-size);if(keep){chunks.push(chunk.subarray(0,keep));size+=keep;}
            await reader.cancel().catch(()=>{});
            return {...metadata,body:Buffer.concat(chunks,size),bodyComplete:false,transportState:'RESPONSE_BODY_INCOMPLETE',
              error:{code:'PIRATE_RESPONSE_TOO_LARGE',message:'The original response exceeded 8 MiB; its retained prefix is not an accepted forecast.'}};
          }
          chunks.push(chunk);size+=chunk.length;
        }
      }finally{reader.releaseLock();}
    }
    const body=Buffer.concat(chunks,size);
    return {...metadata,body,bodyComplete:true,transportState:'RESPONSE_RECEIVED',bodySha256:hash(body)};
  }catch{
    // A durable header checkpoint can fail before getReader(). Keep ownership
    // of the response and release it even when the interruption was not a fetch error.
    const wasAborted=controller.signal.aborted,originalAbortReason=controller.signal.reason;
    if(!wasAborted)controller.abort();
    await response?.body?.cancel().catch(()=>{});
    return {startedAt,observedAt:observedAt??new Date().toISOString(),status:response?.status??null,headers,
      usage:headers.length?usage(headers,observedAt):null,body:Buffer.concat(chunks,size),bodyComplete:false,
      transportState:response?'RESPONSE_BODY_INCOMPLETE':'OUTCOME_UNKNOWN',
      error:{code:wasAborted?'PIRATE_REQUEST_INTERRUPTED':'PIRATE_RESPONSE_UNKNOWN',
        abortReason:wasAborted&&['AbortError','TimeoutError'].includes(originalAbortReason?.name)?originalAbortReason.name:null,
        message:'The original call did not yield a complete retained response. Its upstream usage may already have occurred; no automatic retry was made.'}};
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
