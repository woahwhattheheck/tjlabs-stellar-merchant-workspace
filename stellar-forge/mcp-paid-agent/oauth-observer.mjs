// MIT. Observe the original OAuth resource decisions; retain no bearer tokens or subjects.
import {createHash,randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
export const OAUTH_OBSERVATION_TOOL='mcp_oauth_observation_read';
import {createOAuthResourceAuthorization,validateOAuthResourceConfig,OAuthResourceError} from './oauth-resource.mjs';
import {createPublicHttpsFetch} from '../../stellar/scf-starforge-20261009/sf31-buyer-client/public-transport.mjs';

import {OAUTH_OBSERVATION_SCHEMA,OAUTH_STAGES,OAUTH_OUTCOMES,oauthOutcomeCategory} from './oauth-observation-contract.mjs';
export {OAUTH_OBSERVATION_SCHEMA,OAUTH_STAGES,OAUTH_OUTCOMES} from './oauth-observation-contract.mjs';
const iso=now=>new Date(now).toISOString();
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':
  value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const sha=value=>createHash('sha256').update(canonical(value)).digest('hex');
const freshStage=stage=>({started:0,completed:0,allowed:0,denied:0,unavailable:0,failed:0,
  outcomes:Object.fromEntries(OAUTH_OUTCOMES[stage].map(code=>[code,0]))});
const freshCounters=()=>Object.fromEntries(OAUTH_STAGES.map(stage=>[stage,freshStage(stage)]));
const category=oauthOutcomeCategory;
function originalOutcome(stage,error) {
  if(error instanceof OAuthResourceError) {
    const code=String(error.code).toUpperCase();
    if(OAUTH_OUTCOMES[stage].includes(code))return code;
  }
  return 'INTERNAL_ERROR';
}
function increment(row,key) {
  if(!Number.isSafeInteger(row[key])||row[key]>=Number.MAX_SAFE_INTEGER)throw new Error('OAUTH_OBSERVER_COUNTER_LIMIT');
  row[key]++;
}

/**
 * The returned object preserves the original authorization interface and adds
 * observation(). Issuer selection, JWT verification, JWKS validation, scope
 * checks and the original host authority callback remain in oauth-resource.mjs.
 * observationClock timestamps diagnostics only; clock still belongs exclusively
 * to the original authorization service.
 */
export function createObservedOAuthResourceAuthorization(input,{
  fetchImpl,clock=Date.now,authorize,observationClock=Date.now
}={}) {
  if(typeof observationClock!=='function')throw new TypeError('Expected an observation clock');
  if(typeof clock!=='function'||(fetchImpl!==undefined&&typeof fetchImpl!=='function')||
    (authorize!==undefined&&typeof authorize!=='function'))throw new TypeError('Invalid trusted OAuth host capability');
  const config=validateOAuthResourceConfig(input);
  const first=observationClock();
  if(!Number.isSafeInteger(first)||first<0)throw new TypeError('Invalid observation clock');
  const sessionId=randomUUID(),startedAt=iso(first),counters=freshCounters(),minutes=new Map();
  const observationRead=new AsyncLocalStorage();
  const authenticatedIssuers=new WeakMap(),last=Object.fromEntries(OAUTH_STAGES.map(stage=>[stage,null]));
  const issuerRows=new Map(config.authorizationServers.map(server=>[server.issuer,freshCounters()]));
  issuerRows.set(null,freshCounters());
  const byJwks=new Map();
  for(const server of config.authorizationServers){const uri=new URL(server.jwksUri).href;byJwks.set(uri,byJwks.has(uri)?null:server.issuer);}
  const hostAttached=typeof authorize==='function';
  const configurationSha256=sha({config,hostAuthorityCallback:hostAttached});
  let sequence=0,observerErrors=0,lastClock=first,clockError=false,resource;
  const observerFailure=()=>{if(observerErrors<Number.MAX_SAFE_INTEGER)observerErrors++;};
  const sampleTime=()=>{
    try {
      const now=observationClock();
      if(!Number.isSafeInteger(now)||now<lastClock){clockError=true;observerFailure();return null;}
      lastClock=now;return now;
    } catch {clockError=true;observerFailure();return null;}
  };
  const guarded=operation=>{try {operation();} catch {observerFailure();}};
  function minuteFor(now) {
    if(now===null)return null;
    const stamp=Math.floor(now/60000)*60000;
    let row=minutes.get(stamp);
    if(!row){row=freshCounters();minutes.set(stamp,row);}
    const cutoff=stamp-59*60000;
    for(const key of minutes.keys())if(key<cutoff)minutes.delete(key);
    return row;
  }
  function begin(stage,issuer) {
    const now=sampleTime();
    guarded(()=>{
      increment(counters[stage],'started');
    });
    // Issuer rows are stage maps, and unknown authentication failures must not
    // inherit an issuer from unverified claims.
    guarded(()=>increment((issuerRows.get(issuer)??issuerRows.get(null))[stage],'started'));
    guarded(()=>{const bucket=minuteFor(now);if(bucket)increment(bucket[stage],'started');});
    return {now,issuer};
  }
  function finish(stage,call,outcome,issuer=call.issuer,tool=null) {
    const now=sampleTime(),selected=issuerRows.has(issuer)?issuer:null;
    guarded(()=>{
      const old=(issuerRows.get(call.issuer)??issuerRows.get(null))[stage];
      const row=(issuerRows.get(selected)??issuerRows.get(null))[stage];
      // Authentication acquires an issuer only after the original verifier has
      // returned its authenticated context. Move this one started check with it.
      if(selected!==call.issuer){old.started--;increment(row,'started');}
      for(const target of [counters[stage],row]) {
        increment(target,'completed');increment(target,category(stage,outcome));increment(target.outcomes,outcome);
      }
      const bucket=minuteFor(now);
      if(bucket){increment(bucket[stage],'completed');increment(bucket[stage],category(stage,outcome));increment(bucket[stage].outcomes,outcome);}
      last[stage]={at:now===null?null:iso(now),outcome,issuer:selected,tool,
        durationMs:now!==null&&call.now!==null?Math.max(0,now-call.now):null};
    });
  }
  function invoke(stage,issuer,operation,{success=()=>({outcome:'ALLOWED',issuer}),failure=error=>originalOutcome(stage,error),tool=null}={}) {
    const call=begin(stage,issuer);
    let promise;
    try {promise=operation();}
    catch(error){finish(stage,call,failure(error),issuer,tool);throw error;}
    return Promise.resolve(promise).then(value=>{
      let result={outcome:'ALLOWED',issuer};
      guarded(()=>{result=success(value);});
      finish(stage,call,result.outcome,result.issuer,tool);return value;
    },error=>{finish(stage,call,failure(error),issuer,tool);throw error;});
  }
  // Reuse the original public HTTPS transport when the host did not inject its
  // own fetch. Return the exact response and body to the original JWKS reader.
  const originalFetch=fetchImpl??createPublicHttpsFetch({timeoutMs:config.jwksTimeoutMs});
  const observedFetch=(url,options)=>observationRead.getStore()===true?originalFetch(url,options):invoke('jwks',byJwks.get(String(url))??null,
    ()=>originalFetch(url,options),{
      success:response=>({issuer:byJwks.get(String(url))??null,outcome:response?.status===200?'HTTP_200':
        response?.status===429?'HTTP_429':response?.status>=500&&response.status<=599?'HTTP_5XX':'HTTP_OTHER'}),
      failure:()=> 'TRANSPORT_ERROR'
    });
  const observedAuthority=hostAttached?input=>observationRead.getStore()===true?authorize(input):invoke('hostAuthority',
    authenticatedIssuers.get(input.context)??null,()=>authorize(input),{
      success:value=>({issuer:authenticatedIssuers.get(input.context)??null,outcome:value===true?'ALLOWED':'ACCESS_DENIED'}),
      failure:()=> 'HOST_ERROR',tool:input.tool
    }):undefined;
  resource=createOAuthResourceAuthorization(input,{fetchImpl:observedFetch,clock,authorize:observedAuthority});
  function authenticate(req) {
    return invoke('authentication',null,()=>resource.authenticate(req),{
      success:context=>{
        authenticatedIssuers.set(context,context.issuer);
        return {outcome:'ALLOWED',issuer:context.issuer};
      }
    });
  }
  function authorizeTool(context,name=null,args={}) {
    return invoke('authorization',authenticatedIssuers.get(context)??null,
      ()=>resource.authorizeTool(context,name,args),{tool:typeof name==='string'&&/^[-A-Za-z0-9_.]{1,128}$/.test(name)?name:null});
  }
  function observation() {
    const now=sampleTime();
    if(now===null)throw new Error('OAUTH_OBSERVATION_CLOCK_INVALID');
    const status=resource.describe();
    const through=Math.floor(now/60000)*60000,from=Math.max(Math.floor(first/60000)*60000,through-59*60000);
    const rows=[];
    for(let at=from;at<=through;at+=60000)rows.push({minute:iso(at),counters:structuredClone(minutes.get(at)??freshCounters())});
    if(sequence>=Number.MAX_SAFE_INTEGER)throw new Error('OAUTH_OBSERVATION_SEQUENCE_LIMIT');
    sequence++;
    return {schema:OAUTH_OBSERVATION_SCHEMA,sessionId,startedAt,capturedAt:iso(now),sequence,
      configurationSha256,resource:status.resource,metadataUrl:status.metadataUrl,
      authority:{hostCallback:hostAttached,servers:status.authorizationServers.map(server=>({
        issuer:server.issuer,jwksUri:server.jwksUri,algorithms:[...server.algorithms],
        tokenTypes:[...server.tokenTypes],subjectAllowlistCount:server.allowedSubjects.length,
        requiredScopes:[...status.requiredScopes],keys:structuredClone(server.keys)
      })),toolScopeCount:Object.keys(status.toolScopes).length},
      state:{closed:status.closed,activeRequests:status.activeRequests,observerErrors,clockError},
      counters:structuredClone(counters),minutes:rows,
      issuers:[...issuerRows].map(([issuer,value])=>({issuer,counters:structuredClone(value)})),
      last:structuredClone(last)};
  }
  // A status poll uses the same original verifier and scope/host callback.
  // Async context keeps monitoring calls out of operational check counters,
  // including a JWKS read initiated by that poll, without a shared suppression flag.
  const readObservation=req=>observationRead.run(true,async()=>{
    const context=await resource.authenticate(req);
    await resource.authorizeTool(context,OAUTH_OBSERVATION_TOOL,{});
    return observation();
  });
  return Object.freeze({authenticate,authorizeTool,respondError:resource.respondError,
    metadataHandler:resource.metadataHandler,describe:resource.describe,close:resource.close,observation,readObservation});
}
