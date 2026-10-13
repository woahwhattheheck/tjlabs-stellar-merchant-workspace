// MIT. Read the original host's protected local observation endpoint.
import {request} from 'node:http';
import {normalizeOAuthSource,oauthEndpoint,createOAuthObservation,OAUTH_FILE_LIMIT} from './oauth-observation.mjs';
import {validateOAuthObservation} from '../../../stellar-forge/mcp-paid-agent/oauth-observation-contract.mjs';

const iso=()=>new Date().toISOString();
const cooloffs=new Map();
const fail=(code,extra={})=>{throw Object.assign(new Error(code),{code,...extra});};
const codeOf=error=>/^[A-Z0-9_]{1,120}$/.test(error?.code??'')?error.code:'OAUTH_SOURCE_READ_FAILED';
function tokenFor(name,environment){
  const value=environment[name];
  if(typeof value!=='string'||!value||value.length>65536||/[\x00-\x20\x7f]/.test(value))
    fail('OAUTH_OPERATOR_CREDENTIAL_REQUIRED');
  return value;
}
function retryAfter(value,now){
  if(typeof value!=='string')return 1000;
  const seconds=/^[0-9]+$/.test(value)?Number(value):null;
  const ms=seconds===null?Date.parse(value)-now:seconds*1000;
  return Number.isFinite(ms)&&ms>=0?Math.min(86_400_000,Math.max(1000,ms)):1000;
}
/** GET the selected original operator endpoint with its existing OAuth token.
 * The host performs its original authentication, scope and authority checks,
 * including its normal configured-key cache behavior. */
export async function readOAuthSource(selection,{signal,environment=process.env}={}){
  const endpoint=oauthEndpoint(selection.endpoint);
  if(signal!==undefined&&!(signal instanceof AbortSignal))fail('OAUTH_SOURCE_SIGNAL_INVALID');
  if(signal?.aborted)fail('STOPPING');
  const key=endpoint+'\n'+selection.tokenEnv;
  const now=Date.now(),until=cooloffs.get(key)??0;
  if(until>now)fail('OAUTH_SOURCE_RETRY_AFTER',{retryAfterMs:until-now});
  cooloffs.delete(key);
  const authorization='Bearer '+tokenFor(selection.tokenEnv,environment);
  const timeoutMs=selection.timeoutMs??5000;
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)fail('OAUTH_SOURCE_TIMEOUT_INVALID');
  return await new Promise((resolve,reject)=>{
    let done=false,req,timer;
    const stop=()=>finish(Object.assign(new Error('STOPPING'),{code:'STOPPING'}));
    const finish=(error,value)=>{
      if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',stop);
      if(error){req?.destroy();reject(error);}else resolve(value);
    };
    try {
      req=request(new URL(endpoint),{method:'GET',agent:false,headers:{
        authorization,accept:'application/json','cache-control':'no-cache'
      }},res=>{
        const status=res.statusCode??0;
        if(status!==200){
          if(status===429||status===503){
            const duration=retryAfter(res.headers['retry-after'],Date.now());
            cooloffs.set(key,Date.now()+duration);
            if(cooloffs.size>32)for(const [saved,at]of cooloffs)if(at<=Date.now())cooloffs.delete(saved);
          }
          res.resume();
          finish(Object.assign(new Error('OAuth observation endpoint failed'),{code:
            status===401||status===403?'OAUTH_OBSERVATION_ACCESS_DENIED':status===429?'OAUTH_SOURCE_RATE_LIMITED':
            status>=500?'OAUTH_SOURCE_UNAVAILABLE':status>=300&&status<=399?'OAUTH_SOURCE_REDIRECT_REJECTED':'OAUTH_SOURCE_HTTP_REJECTED'}));
          return;
        }
        if(!/^application\/json(?:\s*;|$)/i.test(String(res.headers['content-type']??''))){
          res.resume();finish(Object.assign(new Error('OAuth observation format failed'),{code:'OAUTH_OBSERVATION_INVALID'}));return;
        }
        const declared=res.headers['content-length'];
        if(declared!==undefined&&(!/^[0-9]+$/.test(String(declared))||Number(declared)>OAUTH_FILE_LIMIT)){
          res.resume();finish(Object.assign(new Error('OAuth observation size failed'),{code:'OAUTH_CAPTURE_SIZE_LIMIT'}));return;
        }
        let size=0;const chunks=[];
        res.on('data',bytes=>{
          if(done)return;size+=bytes.length;
          if(size>OAUTH_FILE_LIMIT){finish(Object.assign(new Error('OAuth observation size failed'),{code:'OAUTH_CAPTURE_SIZE_LIMIT'}));return;}
          chunks.push(bytes);
        });
        res.on('end',()=>{
          if(done)return;
          try {
            if(size===0)fail('OAUTH_OBSERVATION_INVALID');
            const bytes=Buffer.concat(chunks,size);
            let value;try {value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
            catch{fail('OAUTH_OBSERVATION_INVALID');}
            validateOAuthObservation(value);finish(null,{bytes,observation:value});
          }catch(error){finish(error);}
        });
        res.on('aborted',()=>finish(Object.assign(new Error('OAuth observation read interrupted'),{code:'OAUTH_SOURCE_READ_FAILED'})));
        res.on('error',()=>finish(Object.assign(new Error('OAuth observation transport failed'),{code:'OAUTH_SOURCE_READ_FAILED'})));
      });
      req.on('error',()=>finish(Object.assign(new Error('OAuth observation transport failed'),{code:signal?.aborted?'STOPPING':'OAUTH_SOURCE_READ_FAILED'})));
      timer=setTimeout(()=>finish(Object.assign(new Error('OAuth observation timeout'),{code:'OAUTH_SOURCE_TIMEOUT'})),timeoutMs);
      signal?.addEventListener('abort',stop,{once:true});
      if(signal?.aborted)stop();else req.end();
    }catch(error){finish(error);}
  });
}
export async function collectOAuthObservation(merchant,signal,environment=process.env){
  const selection=normalizeOAuthSource(merchant.oauth),startedAt=iso();
  let sourceBytes=null,errorCode=null;
  try {sourceBytes=(await readOAuthSource(selection,{signal,environment})).bytes;}
  catch(error){if(signal?.aborted||error.code==='STOPPING')return {error:'STOPPING'};errorCode=codeOf(error);}
  return {packet:createOAuthObservation({registration:{id:merchant.id,label:merchant.label},selection,
    startedAt,generatedAt:iso(),sourceBytes,errorCode})};
}
export async function reviewOAuthSource(input,{signal,environment=process.env}={}){
  const allowed=['endpoint','tokenEnv','timeoutMs','windowMinutes','unavailableMinimum','unavailablePercent','hostErrorMinimum','hostErrorPercent'];
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key)))
    fail('OAUTH_SOURCE_REVIEW_INVALID');
  oauthEndpoint(input.endpoint);
  if(typeof input.tokenEnv!=='string'||!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(input.tokenEnv))fail('OAUTH_SOURCE_TOKEN_ENV_INVALID');
  const {bytes,observation}=await readOAuthSource(input,{signal,environment});
  const oauth=normalizeOAuthSource({...input,resource:observation.resource,configurationSha256:observation.configurationSha256});
  return {schema:'stellar-forge.sf93.oauth-source-review.v1',oauth,observedAt:observation.capturedAt,
    source:{bytes:bytes.length,sessionId:observation.sessionId,configurationSha256:observation.configurationSha256},
    authority:structuredClone(observation.authority),state:structuredClone(observation.state),
    interpretation:'ORIGINAL_RESOURCE_DECISION_CHECKS'};
}
