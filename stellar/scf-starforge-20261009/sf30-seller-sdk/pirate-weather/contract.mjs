// SPDX-License-Identifier: MIT
// Forecast values retain their exact source number tokens; only safe timestamps are converted.
import {createHash} from 'node:crypto';
import {parseExactJSON} from '../stellar-expert/exact-json.mjs';
import {stable,jsonBytes} from '../stellar-expert/store.mjs';

export const PREFIX='stellar-forge.pirate-weather';
export const WORKSPACE_SCHEMA=PREFIX+'-workspace.v1';
export const CONTRACT_SCHEMA=PREFIX+'-contract.v1';
export const RESPONSE_SCHEMA=PREFIX+'-response.v1';
export const REPORT_SCHEMA=PREFIX+'-report.v1';
export const BUNDLE_SCHEMA=PREFIX+'-project.v1';
export const SOURCE_ROOT='stellar/scf-starforge-20261009/sf30-seller-sdk/pirate-weather';
export const SOURCE_AUTHORITY=Object.freeze({
  provider:'Pirate Weather',specification:'2.10.2',
  openapi:'https://api.github.com/repos/Pirate-Weather/pirateweather/git/blobs/cc35937e75cb4c135b11726800cf03b263bbfa6f',
  openapiGitBlob:'cc35937e75cb4c135b11726800cf03b263bbfa6f',
  requests:'https://docs.pirateweather.net/en/latest/API/',
  response:'https://docs.pirateweather.net/en/latest/API/data-blocks/',
  flagsAndUsage:'https://docs.pirateweather.net/en/latest/API/alerts-flags-errors/',
  terms:'https://pirate-weather.apiable.io/terms'
});
export const SHA=/^[a-f0-9]{64}$/, UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/, SLUG=/^[a-z][a-z0-9-]{0,47}$/;
export const MAX_RESPONSE=8*1024*1024;
export const MAX_INPUT=12*1024*1024;
export const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const identity=v=>hash(Buffer.from(stable(v)));
export const bytes=jsonBytes;
export function fault(code,message,status=400){return Object.assign(new Error(message??code),{code,status});}
export function need(ok,code,message,status=400){if(!ok)throw fault(code,message,status);}
export function exact(v,allowed,required=[]){
  need(object(v)&&Object.keys(v).every(k=>allowed.includes(k))&&required.every(k=>Object.hasOwn(v,k)),
    'PIRATE_INPUT_FIELDS','Supply the complete supported fields without extra fields.');
  return v;
}
export function text(v,label,max=200,empty=false){
  need(typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)&&
    (empty||Boolean(v.trim())),'PIRATE_TEXT','Use '+label+' of up to '+max+' characters.');
  return v;
}
export function uuid(v){need(UUID.test(v??''),'PIRATE_REQUEST_ID','Use the original UUID request or workspace identity.');return v;}
export function sha(v){need(SHA.test(v??''),'PIRATE_SHA_REQUIRED','Supply the exact original SHA256.');return v;}
export function whole(v,label,min=0,max=Number.MAX_SAFE_INTEGER){
  need(Number.isSafeInteger(v)&&v>=min&&v<=max,'PIRATE_INTEGER','Use '+label+' between '+min+' and '+max+'.');return v;
}
export function stamp(v){
  need(typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,19)===v.slice(0,19),
    'PIRATE_TIMESTAMP','Retain the original explicit UTC timestamp.');return v;
}
export function timezone(v){
  text(v,'an IANA time zone',100);try{new Intl.DateTimeFormat('en',{timeZone:v}).format(0);}catch{throw fault('PIRATE_TIMEZONE','Choose a valid IANA time zone.');}return v;
}
export function configuration(v){
  exact(v,['name','apiKeyEnv'],['name','apiKeyEnv']);
  text(v.name,'a private connection name',120);
  need(typeof v.apiKeyEnv==='string'&&/^[A-Z][A-Z0-9_]{0,99}$/.test(v.apiKeyEnv),'PIRATE_KEY_REFERENCE','Use a host environment variable name; keep its value outside the workspace.');
  return structuredClone(v);
}
export function contract(v){
  exact(v,['id','title','customer','destination','units','horizonHours','locations','schedule','purpose'],
    ['id','title','customer','destination','units','horizonHours','locations','schedule','purpose']);
  uuid(v.id);text(v.title,'a report contract title',160);text(v.customer,'the designated customer or recipient',200);
  text(v.destination,'the agreed delivery destination description',400);text(v.purpose,'the agreed report purpose',2000);
  need(['us','si','ca','uk'].includes(v.units),'PIRATE_UNITS','Select the explicit us, si, ca or uk provider unit system.');
  need(v.horizonHours===48,'PIRATE_HORIZON','This customer report contract covers the agreed 48-hour horizon.');
  need(Array.isArray(v.locations)&&v.locations.length>=1&&v.locations.length<=3,'PIRATE_LOCATIONS','Select one to three original customer locations.');
  const ids=new Set();
  for(const l of v.locations){
    exact(l,['id','name','latitude','longitude'],['id','name','latitude','longitude']);
    need(SLUG.test(l.id??'')&&!ids.has(l.id),'PIRATE_LOCATION_ID','Use a distinct stable location ID.');ids.add(l.id);
    text(l.name,'a customer location label',160);
    need(typeof l.latitude==='number'&&Number.isFinite(l.latitude)&&l.latitude>=-90&&l.latitude<=90&&
      typeof l.longitude==='number'&&Number.isFinite(l.longitude)&&l.longitude>=-180&&l.longitude<=180,
      'PIRATE_COORDINATES','Use explicit valid latitude and longitude numbers.');
  }
  exact(v.schedule,['timeZone','slots'],['timeZone','slots']);timezone(v.schedule.timeZone);
  need(Array.isArray(v.schedule.slots)&&v.schedule.slots.length===2&&new Set(v.schedule.slots).size===2&&
    v.schedule.slots.every(s=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)),'PIRATE_REPORT_SLOTS','Choose two distinct daily review slots in the contract time zone.');
  return structuredClone(v);
}
export function forecastRequest(c,locationId){
  contract(c);const location=c.locations.find(l=>l.id===locationId);
  need(location,'PIRATE_LOCATION_NOT_FOUND','Select a location from this exact contract edition.',404);
  return {method:'GET',origin:'https://api.pirateweather.net',route:'/forecast/{private-api-key}/'+location.latitude+','+location.longitude,
    query:{units:c.units},kind:'FORECAST',locationId,latitude:location.latitude,longitude:location.longitude,units:c.units,
    horizonHours:c.horizonHours,exclude:[],extended:false};
}
export function responseHeaders(v){
  need(Array.isArray(v)&&v.length<=150,'PIRATE_RESPONSE_HEADERS','Retain the original response headers as name/value pairs.');
  return v.map(pair=>{
    need(Array.isArray(pair)&&pair.length===2&&typeof pair[0]==='string'&&/^[!#$%&'*+.^_\x60|~0-9A-Za-z-]{1,100}$/.test(pair[0]),
      'PIRATE_RESPONSE_HEADER','Invalid original header name.');
    text(pair[1],'an original response header',8192,true);need(!/[\r\n]/.test(pair[1]),'PIRATE_RESPONSE_HEADER','A response header cannot contain a line break.');
    return [...pair];
  });
}
export function usage(headers,observedAt){
  const all=responseHeaders(headers),get=n=>all.filter(([k])=>k.toLowerCase()===n).map(([,v])=>v);
  const selected={};for(const n of ['ratelimit-limit','ratelimit-remaining','ratelimit-reset','x-forecast-api-calls','retry-after','date','cache-control','x-node-id','x-response-time'])selected[n]=get(n);
  const scalar=n=>selected[n].length===1?selected[n][0]:null;
  const seconds=scalar('ratelimit-reset'),retry=scalar('retry-after'),deadlines=[];
  if(/^\d+$/.test(seconds??'')&&Number.isSafeInteger(Number(seconds))&&Number(seconds)<=366*86400)deadlines.push(Date.parse(stamp(observedAt))+Number(seconds)*1000);
  if(/^\d+$/.test(retry??'')&&Number.isSafeInteger(Number(retry))&&Number(retry)<=366*86400)deadlines.push(Date.parse(observedAt)+Number(retry)*1000);
  else if(retry&&Number.isFinite(Date.parse(retry)))deadlines.push(Date.parse(retry));
  return {headers:selected,resetMeaning:'seconds after the retained response observation',retryAt:deadlines.length?new Date(Math.max(...deadlines)).toISOString():null,
    limit:scalar('ratelimit-limit'),remaining:scalar('ratelimit-remaining'),used:scalar('x-forecast-api-calls'),source:'ORIGINAL_RESPONSE_HEADERS'};
}
export function decodeSource(raw){
  need(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=MAX_RESPONSE,'PIRATE_RESPONSE_SIZE','Use one complete original response of up to 8 MiB.',413);
  let utf8,exactValue,native;try{utf8=new TextDecoder('utf-8',{fatal:true}).decode(raw);exactValue=parseExactJSON(utf8);native=JSON.parse(utf8);}
  catch{throw fault('PIRATE_RESPONSE_JSON','The complete retained body must be valid UTF-8 JSON with unique keys.');}
  need(object(native),'PIRATE_RESPONSE_ROOT','The forecast response must be an object.');
  return {exact:exactValue,native};
}
export function inspectForecast(raw,request){
  const decoded=decodeSource(raw),n=decoded.native,e=decoded.exact;
  need(typeof n.latitude==='number'&&Number.isFinite(n.latitude)&&typeof n.longitude==='number'&&Number.isFinite(n.longitude),
    'PIRATE_RESPONSE_COORDINATES','Retain a forecast response with its actual returned coordinates.');
  timezone(n.timezone);
  need(object(n.flags)&&typeof n.flags.units==='string','PIRATE_RESPONSE_FLAGS','The forecast must retain its original flags and unit system.');
  need(n.flags.units===request.units,'PIRATE_RESPONSE_UNITS','The returned unit system differs from the selected contract; retain it as a source exception.',409);
  need(object(n.hourly)&&Array.isArray(n.hourly.data)&&n.hourly.data.length>0&&n.hourly.data.length<=400,
    'PIRATE_HOURLY_REQUIRED','A report requires the complete original hourly data block.');
  for(const hour of n.hourly.data)need(object(hour)&&Number.isSafeInteger(hour.time)&&hour.time>=0&&hour.time<=253402300799,
    'PIRATE_HOURLY_TIME','Each original hourly row needs its safe Unix timestamp.');
  const times=n.hourly.data.map(x=>x.time),duplicates=times.filter((x,i)=>times.indexOf(x)!==i);
  return {decoded,summary:{returnedLatitude:e.latitude,returnedLongitude:e.longitude,timeZone:n.timezone,
    units:n.flags.units,offset:e.offset??null,firstUnix:String(Math.min(...times)),lastUnix:String(Math.max(...times)),
    hourlyRecords:times.length,duplicateHours:duplicates.map(String),chronological:times.every((x,i)=>!i||x>=times[i-1]),
    flags:e.flags,flagsSha256:identity(e.flags),currently:e.currently??null,alerts:e.alerts??null,
    sourceAuthority:SOURCE_AUTHORITY,sourceKind:'FORECAST',responseSha256:hash(raw),responseBytes:raw.length}};
}
export function reviewInput(v){
  exact(v,['reportId','actor','disposition','note'],['reportId','actor','disposition','note']);sha(v.reportId);
  text(v.actor,'the named reviewer',120);text(v.note,'the review decision and reason',8000);
  need(['APPROVED','CHANGES_REQUIRED'].includes(v.disposition),'PIRATE_REVIEW_DISPOSITION','Choose approved or changes required.');
  return structuredClone(v);
}
export function safeError(e){
  if(typeof e?.code==='string'&&/^(PIRATE_|STELLAR_|DATASET_|SOCRATA_|SELLER_|RELEASE_)/.test(e.code))
    return {code:e.code,message:String(e.message??e.code),status:Number.isInteger(e.status)?e.status:503};
  if(['ENOSPC','EDQUOT'].includes(e?.code))return {code:'PIRATE_STORAGE_FULL',message:'Storage is full. Preserve this original request and reopen after capacity is available.',status:507};
  return {code:'PIRATE_OPERATION_INTERRUPTED',message:'The operation did not finish. Inspect the original request and retained result before continuing.',status:503};
}
