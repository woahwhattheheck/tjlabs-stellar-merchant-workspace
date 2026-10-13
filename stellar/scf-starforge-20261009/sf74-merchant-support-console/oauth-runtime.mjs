// MIT. Original OAuth aggregate captures in the existing SF74 runtime case.
import {isDeepStrictEqual} from 'node:util';
import {oauthConditions} from '../sf93-seller-support-bundle/oauth-observation.mjs';

const STAGES=['authentication','authorization','hostAuthority','jwks'];
const COUNTERS=['started','completed','allowed','denied','unavailable','failed'];
export function oauthCaptureView(capture,currentInputs) {
  const {meta,summary}=capture.original;
  const conditions=oauthConditions(summary);
  return {kind:'OAUTH_RESOURCE',scope:capture.scope,
    caseMatches:isDeepStrictEqual(capture.scope.inputs,currentInputs),
    capturedAt:meta.generatedAt,startedAt:summary.startedAt??meta.startedAt,
    sessionId:summary.sessionId,mode:'ORIGINAL_OAUTH_RESOURCE',
    observerAttached:summary.state===null?null:true,observerErrors:summary.state?.observerErrors??null,
    route:{id:meta.registration.id,method:'GET'},
    oauth:{...structuredClone(summary),registration:structuredClone(meta.registration),
      readStartedAt:meta.startedAt,readCompletedAt:meta.generatedAt,conditions},
    alerts:Object.entries(conditions).filter(([,v])=>v.bad===true).map(([kind])=>kind),
    files:Object.entries(capture.files).map(([name,value])=>({name,bytes:value.bytes,sha256:value.sha256})),native:null};
}
export function compareOAuthCaptures(before,after) {
  const result=(state,detail,extra={})=>({state,detail,interval:null,oauth:extra});
  if(before.kind!=='OAUTH_RESOURCE'||after.kind!=='OAUTH_RESOURCE')
    return result('DIFFERENT_OBSERVATION_KINDS','OAuth aggregate observations and other runtime captures retain separate meanings and are not subtracted.');
  const a=before.oauth,b=after.oauth;
  const source={before:a,after:b,aggregation:'Each original minute window is retained independently; overlapping windows are never summed.',
    perEventJoin:false};
  if(!isDeepStrictEqual(a.selection,b.selection))
    return result('OAUTH_SELECTION_CHANGED','The registered OAuth endpoint, resource, configuration or thresholds changed. Compare each capture under its exact saved selection.',source);
  if(a.coverage!=='COMPLETE'||b.coverage!=='COMPLETE')
    return result('OAUTH_SOURCE_INCOMPLETE','An original source is unavailable, changed identity, or reports observer incompleteness. The original reasons and bytes remain attached.',source);
  if(a.sessionId!==b.sessionId||a.startedAt!==b.startedAt)
    return result('OAUTH_SEPARATE_SESSIONS','These are separate original observer sessions. Their cumulative totals and rolling windows are not subtracted.',source);
  if(b.sequence<=a.sequence||b.capturedAt<=a.capturedAt)
    return result('OAUTH_CAPTURE_ORDER','The following source must have a later original sequence and capture time within this observer session.',source);
  for(const stage of STAGES) {
    if(COUNTERS.some(key=>b.counters[stage][key]<a.counters[stage][key])||
      Object.keys(a.counters[stage].outcomes).some(key=>(b.counters[stage].outcomes[key]??-1)<a.counters[stage].outcomes[key]))
      return result('OAUTH_SOURCE_INTEGRITY','An original cumulative stage counter decreased inside the same observer session. No interval or recovery claim is derived.',source);
  }
  const cumulativeChanges=Object.fromEntries(STAGES.map(stage=>[stage,{
    ...Object.fromEntries(COUNTERS.map(key=>[key,b.counters[stage][key]-a.counters[stage][key]])),
    outcomes:Object.fromEntries(Object.keys(b.counters[stage].outcomes).map(key=>[key,
      b.counters[stage].outcomes[key]-(a.counters[stage].outcomes[key]??0)]))}]));
  const independent=a.window.through<=b.window.from;
  return result('OAUTH_SAME_OBSERVER_SEQUENCE','The original cumulative stage changes are shown separately from each rolling window. Started and completed checks need not belong to the same requests, and aggregate agreement cannot identify audit events.',
    {...source,cumulativeChanges,from:a.capturedAt,until:b.capturedAt,windowsIndependent:independent});
}
const ACTIONS={
 OAUTH_SOURCE_UNAVAILABLE:'Restore the original protected observation read and inspect its retained source error.',
 OAUTH_CONFIGURATION_CHANGED:'Review the changed resource or normalized verifier configuration before adopting a new selection.',
 OAUTH_SOURCE_INTEGRITY:'Inspect the retained source, sequence and cumulative counters; keep the original capture intact.',
 OAUTH_OBSERVER_INCOMPLETE:'Review original observer errors and clock state before claiming complete coverage.',
 OAUTH_VERIFIER_UNAVAILABLE:'Inspect the original authorization service and its unavailable outcomes.',
 OAUTH_HOST_AUTHORITY_ERROR:'Review the original host authorization callback failures; preserve its current policy.',
 OAUTH_JWKS_UNAVAILABLE:'Inspect the original selected issuer JWKS read and transport outcomes.',
 OAUTH_JWKS_RATE_LIMITED:'Review the original issuer rate limit response and supported retry behavior.'
};
export function oauthRepairQueue(capture,side) {
 return Object.entries(capture.oauth.conditions).filter(([,v])=>v.bad===true).map(([kind,value])=>({
   source:side,routeId:capture.scope.routeId,kind:'oauth',condition:kind,
   action:ACTIONS[kind]??'Review the original OAuth observation.',values:structuredClone(value.values)}));
}
