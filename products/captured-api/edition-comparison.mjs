// MIT. Compare complete original merchant editions without changing either package.
export const CAPTURED_EDITION_SNAPSHOT_SCHEMA='stellar-forge.captured-merchant-edition.v1';
export const CAPTURED_EDITION_COMPARISON_SCHEMA='stellar-forge.captured-merchant-edition-comparison.v1';
const own=(value,key)=>Object.hasOwn(value,key);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const copy=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>JSON.stringify(value,(_,item)=>plain(item)
  ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const same=(left,right)=>canonical(left)===canonical(right);
const fail=message=>{throw Object.assign(new Error(message),{code:'CAPTURED_EDITION_INPUT',status:409});};
const hash=/^[a-f0-9]{64}$/;
const order=(a,b)=>a<b?-1:a>b?1:0;
function json(value) {
  const stack=[value],seen=new Set();
  while(stack.length) {
    const item=stack.pop();
    if(item===null||typeof item==='string'||typeof item==='boolean')continue;
    if(typeof item==='number'&&Number.isFinite(item))continue;
    if(!item||typeof item!=='object'||!Array.isArray(item)&&!plain(item))fail('Use complete original JSON values.');
    if(seen.has(item))fail('Use a JSON document without shared or circular objects.');
    seen.add(item);
    if(Array.isArray(item)&&Object.keys(item).length!==item.length)fail('Use complete original JSON arrays.');
    for(const child of Object.values(item))stack.push(child);
  }
}
function snapshot(value) {
  if(!plain(value)||value.schema!==CAPTURED_EDITION_SNAPSHOT_SCHEMA||
    !plain(value.package)||!hash.test(value.package.manifestSha256??'')||
    !plain(value.plan)||value.plan.schema!=='stellar-forge.api-merchant-plan.v1'||
    !Array.isArray(value.plan.operations)||value.plan.operations.length>64||
    !plain(value.sourceDocument)||!plain(value.facade)||!plain(value.configuration)||
    !Array.isArray(value.files))fail('Read the complete original merchant edition through its native package reader.');
  json(value);
  const routes=new Set(),files=new Set();
  for(const row of value.plan.operations) {
    if(!plain(row)||typeof row.method!=='string'||typeof row.path!=='string'||
      !row.path.startsWith('/')||typeof row.amountAtomic!=='string')fail('Keep each original selected route and atomic price string.');
    const key=row.method.toUpperCase()+' '+row.path;
    if(routes.has(key))fail('Keep each selected original method and path once.');
    routes.add(key);
  }
  for(const row of value.files) {
    if(!plain(row)||typeof row.name!=='string'||!row.name||!hash.test(row.sha256??'')||
      !Number.isSafeInteger(row.bytes)||row.bytes<0||files.has(row.name))
      fail('Keep the complete original package file identities.');
    files.add(row.name);
  }
  return value;
}
const presence=(value,key)=>own(value,key)?{present:true,value:copy(value[key])}:{present:false};
const fieldCategory=field=>{
  if(field==='amountAtomic')return 'PRICE';
  if(field==='payment')return 'PAYMENT';
  if(['headerEnv','securityAlternative','oauth2','oauthConnection','oauthProfile','oauthAlias'].includes(field))return 'AUTHENTICATION';
  if(['transport','transports','serverIndex','sellerServer','allowLoopbackUpstream'].includes(field))return 'TRANSPORT';
  if(['requestExample','requestHeaders','querySerialization'].includes(field))return 'REQUEST';
  if(['responseMode','responseValidation','enforceResponseContract','stream'].includes(field))return 'RESPONSE';
  if(['timeoutMs','maxResponseBytes','maxRequestBytes','maxInFlight'].includes(field))return 'LIMIT';
  if(field==='cache')return 'CACHE';
  if(field==='availability')return 'AVAILABILITY';
  if(field==='id')return 'IDENTITY';
  return 'CONFIGURATION';
};
function changes(before,after,{skip=[],prefix='',category}={}) {
  before??={};after??={};
  return [...new Set([...Object.keys(before),...Object.keys(after)])].sort(order).filter(key=>
    !skip.includes(key)&&(!own(before,key)||!own(after,key)||!same(before[key],after[key])))
    .map(key=>({field:prefix+key,category:category??fieldCategory(key),
      current:presence(before,key),incoming:presence(after,key)}));
}
function documentChanges(before,after,category) {
  const rows=changes(before,after,{skip:['paths'],category});
  const left=plain(before?.paths)?before.paths:{},right=plain(after?.paths)?after.paths:{};
  return rows.concat(changes(left,right,{prefix:'paths.',category}));
}
function routes(value) {
  return new Map((value?.plan.operations??[]).map(row=>[row.method.toUpperCase()+' '+row.path,row]));
}
function routePrice(row) {return row?{present:true,value:row.amountAtomic}:{present:false};}
function counts(rows) {
  return {total:rows.length,added:rows.filter(row=>row.state==='ADDED').length,
    removed:rows.filter(row=>row.state==='REMOVED').length,changed:rows.filter(row=>row.state==='CHANGED').length,
    unchanged:rows.filter(row=>row.state==='UNCHANGED').length};
}
/** Values are original JSON; atomic amounts are never converted to Number.
 * Source and facade changes include all declarations and shared components.
 * This report describes exact changes, without inferring runtime compatibility. */
export function compareCapturedMerchantEditions({current=null,incoming}) {
  incoming=snapshot(incoming);if(current!==null)current=snapshot(current);
  const beforeRoutes=routes(current),afterRoutes=routes(incoming);
  const routeRows=[...new Set([...beforeRoutes.keys(),...afterRoutes.keys()])].sort(order).map(key=>{
    const before=beforeRoutes.get(key),after=afterRoutes.get(key),selected=after??before;
    const changed=changes(before,after,{skip:['method','path']});
    return {key,method:selected.method.toUpperCase(),path:selected.path,
      state:!before?'ADDED':!after?'REMOVED':changed.length?'CHANGED':'UNCHANGED',
      currentPrice:routePrice(before),incomingPrice:routePrice(after),changes:changed};
  });
  const settings=changes(current?.plan,incoming.plan,{skip:['operations']});
  const source=documentChanges(current?.sourceDocument,incoming.sourceDocument,'SOURCE');
  const contract=documentChanges(current?.facade,incoming.facade,'CONTRACT');
  const configuration=changes(current?.configuration,incoming.configuration,{category:'COMPILED_CONFIGURATION'});
  const leftFiles=new Map((current?.files??[]).map(row=>[row.name,row]));
  const rightFiles=new Map(incoming.files.map(row=>[row.name,row]));
  const files=[...new Set([...leftFiles.keys(),...rightFiles.keys()])].sort(order).map(name=>{
    const before=leftFiles.get(name),after=rightFiles.get(name);
    return {name,state:!before?'ADDED':!after?'REMOVED':
      before.bytes!==after.bytes||before.sha256!==after.sha256?'CHANGED':'UNCHANGED',
      current:before?copy(before):null,incoming:after?copy(after):null};
  });
  const summary={routes:counts(routeRows),prices:routeRows.filter(row=>
    !same(row.currentPrice,row.incomingPrice)).length,settings:settings.length,source:source.length,
    contract:contract.length,configuration:configuration.length,files:counts(files)};
  return {schema:CAPTURED_EDITION_COMPARISON_SCHEMA,current:current?copy(current.package):null,
    incoming:copy(incoming.package),summary,routes:routeRows,settings,source,contract,configuration,files};
}
