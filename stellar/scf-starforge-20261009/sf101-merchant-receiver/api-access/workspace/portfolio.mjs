// MIT. Customer portfolio over original per-order allowance and request journals.
export const PORTFOLIO_SCHEMA='stellar-forge.sf101.api-pass-portfolio.v1';
const ACTIVE=new Set(['QUEUED','RUNNING','CANCELLING']);
const ATTENTION=new Set(['ATTENTION','RECOVERY_READY']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const integer=value=>Number.isSafeInteger(value)&&value>=0;
export function portfolioSettings(state){
 return state.portfolio??{selectedProfileId:null,lowUnitsThreshold:5};
}
export function validatePortfolio(state,check){
 const settings=portfolioSettings(state);
 check(settings&&typeof settings==='object'&&!Array.isArray(settings)&&
  integer(settings.lowUnitsThreshold)&&settings.lowUnitsThreshold<=1000000000,
  'INVALID_PORTFOLIO_SETTINGS',409);
 check(settings.selectedProfileId===null||uuid.test(settings.selectedProfileId??'')&&
  state.profiles.some(row=>row.id===settings.selectedProfileId&&!row.archived),
  'PORTFOLIO_SELECTED_PASS_CHANGED',409);
 const successors=new Set();
 for(const row of state.profiles){
  if(row.replacesProfileId===undefined)continue;
  check(uuid.test(row.replacesProfileId)&&row.replacesProfileId!==row.id&&row.mode==='purchase'&&
   !successors.has(row.replacesProfileId),'INVALID_PASS_REPLENISHMENT',409);
  successors.add(row.replacesProfileId);
  const parent=state.profiles.find(item=>item.id===row.replacesProfileId);
  check(parent&&parent.binding.gatewayBaseUrl===row.binding.gatewayBaseUrl&&
   parent.binding.orderReference!==row.binding.orderReference,'REPLENISHMENT_ORDER_BINDING_CHANGED',409);
  const seen=new Set([row.id]);let current=parent;
  while(current){check(!seen.has(current.id),'REPLENISHMENT_CYCLE',409);seen.add(current.id);
   current=current.replacesProfileId?state.profiles.find(item=>item.id===current.replacesProfileId):null;}
 }
 return settings;
}
function allowance(detail){
 const usage=detail?.usage;
 if(!usage||!['allowanceUnits','consumedUnits','reservedUnits','availableUnits'].every(key=>integer(usage[key])))return null;
 if(usage.consumedUnits+usage.reservedUnits+usage.availableUnits!==usage.allowanceUnits)return null;
 return Object.fromEntries(['allowanceUnits','consumedUnits','reservedUnits','availableUnits','completedCalls',
  'consumedCallsWithoutResult','reservedCalls','releasedCalls'].filter(key=>usage[key]!==undefined).map(key=>[key,usage[key]]));
}
export function portfolioRequest(row,profiles){
 const pass=profiles.find(item=>item.id===row.profileId);
 return {id:row.id,profileId:row.profileId,passLabel:pass?.label??row.profileId,
  orderReference:pass?.orderReference??null,requestId:row.requestId,label:row.label,routeId:row.routeId,
  method:row.method,path:row.path,units:row.units,status:row.status,updatedAt:row.updatedAt,
  recoveryOnly:row.recoveryOnly===true,error:row.error?{...row.error}:null,
  result:row.result?{status:row.result.status,bytes:row.result.bytes,sha256:row.result.sha256}:null};
}
export function portfolioAttention(calls,profiles,{offset=0,limit=100}={}){
 const selected=calls.filter(row=>ATTENTION.has(row.status)).slice().reverse();
 return {items:selected.slice(offset,offset+limit).map(row=>portfolioRequest(row,profiles)),
  pagination:{offset,limit,total:selected.length,nextOffset:offset+limit<selected.length?offset+limit:null}};
}
export function portfolioView(state,profiles){
 const settings=portfolioSettings(state),byId=new Map(profiles.map(row=>[row.id,row]));
 const replacements=new Map(profiles.filter(row=>row.replacesProfileId).map(row=>[row.replacesProfileId,row]));
 const callsByPass=new Map(),tasksByPass=new Map();
 for(const row of state.calls){const list=callsByPass.get(row.profileId)??[];list.push(row);callsByPass.set(row.profileId,list);}
 for(const row of state.tasks)if(ACTIVE.has(row.status)){const list=tasksByPass.get(row.profileId)??[];list.push(row);tasksByPass.set(row.profileId,list);}
 const rows=profiles.map(profile=>{
  const usage=allowance(profile.detail),calls=callsByPass.get(profile.id)??[],tasks=tasksByPass.get(profile.id)??[];
  const routes=(profile.detail?.plan?.routes??[]).filter(route=>Number.isSafeInteger(route.units)&&route.units>0)
   .map(route=>({id:route.id,method:route.method,path:route.path,units:route.units,
    remainingCalls:usage?Math.floor(usage.availableUnits/route.units):null}));
  const affordable=usage&&routes.some(route=>route.units<=usage.availableUnits);
  let status=profile.archived?'ARCHIVED':!profile.claimAvailable?'CLAIM_UNAVAILABLE':!usage?'REFRESH_REQUIRED':
   !affordable?'EXHAUSTED':usage.availableUnits<=settings.lowUnitsThreshold?'LOW':'AVAILABLE';
  const requests={total:calls.length,prepared:calls.filter(row=>row.status==='PREPARED').length,
   active:calls.filter(row=>['RUNNING','RECOVERING'].includes(row.status)).length,
   attention:calls.filter(row=>ATTENTION.has(row.status)).length,
   completed:calls.filter(row=>row.status==='COMPLETED').length};
  const parent=byId.get(profile.replacesProfileId),replacement=replacements.get(profile.id);
  return {id:profile.id,label:profile.label,orderReference:profile.orderReference,gatewayBaseUrl:profile.gatewayBaseUrl,
   manifestSha256:profile.manifestSha256,mode:profile.mode,archived:profile.archived,status,usage,routes,requests,
   activeTasks:tasks.length,checkedAt:profile.checkedAt,selected:settings.selectedProfileId===profile.id,
   nativeState:profile.detail?.native?.state??profile.native?.state??null,
   error:profile.error?{...profile.error}:null,
   replaces:parent?{profileId:parent.id,label:parent.label,orderReference:parent.orderReference}:null,
   replacement:replacement?{profileId:replacement.id,label:replacement.label,orderReference:replacement.orderReference}:null};
 });
 return {schema:PORTFOLIO_SCHEMA,settings:{...settings},passes:rows,
  summary:{passes:rows.length,activePasses:rows.filter(row=>!row.archived).length,
   availablePasses:rows.filter(row=>row.status==='AVAILABLE'||row.status==='LOW').length,
   lowPasses:rows.filter(row=>row.status==='LOW').length,exhaustedPasses:rows.filter(row=>row.status==='EXHAUSTED').length,
   requests:state.calls.length,attentionRequests:rows.reduce((total,row)=>total+row.requests.attention,0),
   activeOperations:state.tasks.filter(row=>ACTIVE.has(row.status)).length},
  attention:portfolioAttention(state.calls,profiles,{offset:0,limit:20})};
}
