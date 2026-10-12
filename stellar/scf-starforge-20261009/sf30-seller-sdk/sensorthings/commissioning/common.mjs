// MIT. Exact source values and the original workspace's immutable custody.
import {join,basename} from 'node:path';
import {readOwned,privateDirectory} from '../../stellar-expert/store.mjs';
import {identity,sha,json,plain,sourceDocument,entityId,JsonNumber,text,integer,fault,stable} from '../contract.mjs';
import {LIMITS} from './schema.mjs';
export {identity,sha,json,plain,sourceDocument,entityId,JsonNumber,text,integer,fault,stable,readOwned,privateDirectory};
export const HASH=/^[a-f0-9]{64}$/;
export const KINDS=Object.freeze(['Locations','Things','Sensors','ObservedProperties','FeaturesOfInterest','Datastreams','MultiDatastreams','HistoricalLocations','Observations']);
export const RELATIONS=Object.freeze({
 Things:{Locations:{kind:'Locations',many:true}},
 Datastreams:{Thing:{kind:'Things'},Sensor:{kind:'Sensors'},ObservedProperty:{kind:'ObservedProperties'}},
 MultiDatastreams:{Thing:{kind:'Things'},Sensor:{kind:'Sensors'},ObservedProperties:{kind:'ObservedProperties',many:true}},
 HistoricalLocations:{Thing:{kind:'Things'},Locations:{kind:'Locations',many:true}},
 Observations:{Datastream:{kind:'Datastreams'},MultiDatastream:{kind:'MultiDatastreams'},FeatureOfInterest:{kind:'FeaturesOfInterest'}}
});
export const WRITABLE=Object.freeze({
 Things:['name','description','properties'],
 Locations:['name','description','encodingType','location','properties'],
 Sensors:['name','description','encodingType','metadata','properties'],
 ObservedProperties:['name','description','definition','properties'],
 FeaturesOfInterest:['name','description','encodingType','feature','properties'],
 Datastreams:['name','description','observationType','unitOfMeasurement','observedArea','properties'],
 MultiDatastreams:['name','description','multiObservationDataTypes','unitOfMeasurements','observedArea','properties'],
 HistoricalLocations:['time'],
 Observations:['phenomenonTime','resultTime','result','resultQuality','validTime','parameters']
});
export const REQUIRED=Object.freeze({
 Things:['name','description'],Locations:['name','description','encodingType','location'],
 Sensors:['name','description','encodingType','metadata'],ObservedProperties:['name','description','definition'],
 FeaturesOfInterest:['name','description','encodingType','feature'],
 Datastreams:['name','description','observationType','unitOfMeasurement'],
 MultiDatastreams:['name','description','multiObservationDataTypes','unitOfMeasurements'],
 HistoricalLocations:['time'],Observations:['phenomenonTime','result']
});
export function fail(code,message,status=400,details={}){return fault('COMMISSIONING_'+code,message,status,details);}
export function hash(value,label='identity'){if(!HASH.test(value??''))throw fail('IDENTITY','Select the exact '+label+'.');return value;}
export function choice(value,allowed,label){if(!allowed.includes(value))throw fail('FIELD','Choose '+label+' from '+allowed.join(', ')+'.');return value;}
export function paragraph(value,label,max=12000){if(typeof value!=='string'||value.length>max||/\u0000/.test(value))throw fail('FIELD','Supply '+label+' as text of at most '+max+' characters.');return value;}
export function safeName(name){if(typeof name!=='string'||name!==basename(name)||!name||name.length>200||/[\\/\u0000-\u001f\u007f:]/.test(name)||['.','..'].includes(name))throw fail('FILE','Choose one original inbox filename.');return name;}
export function clone(value){return JSON.parse(JSON.stringify(value));}
export function exact(value){return JSON.stringify(value);}
export function exactParse(text){return sourceDocument(Buffer.from(text));}
export function typedId(textValue){if(typeof textValue!=='string'||textValue.length>16384)throw fail('TARGET_ID','Supply the target identifier as exact JSON.');const v=exactParse(textValue);entityId(v);return exact(v);}
export function issue(code,details={},blocking=false){return {code,blocking,...details};}
export function sourceKey(kind,record,ref){try{return kind+'/'+entityId(record['@iot.id']).key;}catch{return kind+'/source:'+identity(ref);}}
export function cleanBody(kind,record){
 const values={},omitted=[];
 for(const [key,value]of Object.entries(record)){
  if(WRITABLE[kind]?.includes(key))values[key]=value;
  else if(!key.startsWith('@iot.')&&!key.includes('@iot.')&&!Object.hasOwn(RELATIONS[kind]??{},key)&&!['Observations','Datastreams','MultiDatastreams','HistoricalLocations','Things'].includes(key))omitted.push(key);
 }
 return {values,omitted};
}
export function rowPage(records,{offset=0,limit=100}={}){
 integer(offset,'offset',0,Number.MAX_SAFE_INTEGER);integer(limit,'page size',1,LIMITS.page);
 const rows=records.slice(offset,offset+limit);
 return {offset,limit,total:records.length,nextOffset:offset+rows.length<records.length?offset+rows.length:null,rows};
}
export async function objectValue(store,record){
 const bytes=await store.object(hash(record.sha256));if(record.bytes!==undefined&&bytes.length!==record.bytes)throw fail('SOURCE_CHANGED','The retained object length changed.',409);
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw fail('SOURCE_FORMAT','The retained internal document is invalid.',409);}
}
export async function saveValue(store,value){return store.putObject(json(value));}
export function statePart(state){return state.commissioning??{schema:'stellar-forge.sensorthings-commissioning-state.v1',projects:[],sources:[],targets:[],mappings:[],plans:[],reviews:[],jobs:[],files:[],handoffs:[]};}
export function ensureState(state){return state.commissioning??=statePart(state);}
export function find(state,table,id,projectId=null){
 const value=statePart(state)[table]?.find(x=>x.id===id);
 if(!value||(projectId&&value.projectId!==projectId&&!(table==='projects'&&value.id===projectId)))throw fail('SELECTION','Choose an existing '+table+' record in this project.',404);
 return value;
}
export function operationId(kind,op){return identity({kind,operationId:op.operationId,requestSha256:op.requestSha256});}
export function publicTarget(target){const {authorizationEnv,...visible}=target;return {...visible,authorization:authorizationEnv?'HOST_ENVIRONMENT':'NONE',authorizationReference:authorizationEnv??null};}
export function targetProfile(input){
 const raw=text(input.serviceUrl,'target service URL',4096),url=new URL(raw);
 if(url.username||url.password||url.search||url.hash)throw fail('TARGET_URL','Use an exact service root without inline credentials, query or fragment.');
 const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&input.allowLoopback===true&&loopback))throw fail('TARGET_URL','Use HTTPS or an explicitly selected loopback HTTP reference service.');
 if(/%(?:2e|2f|5c)/i.test(url.pathname)||url.pathname.split('/').some(s=>['.','..'].includes(s)))throw fail('TARGET_URL','Use a canonical target root.');
 const authorizationEnv=input.authorizationEnv??null;
 if(authorizationEnv!==null&&!/^[A-Z_][A-Z0-9_]{0,127}$/.test(authorizationEnv))throw fail('AUTH_REFERENCE','Use the existing host environment name.');
 return {label:text(input.label,'target label'),serviceUrl:url.href.replace(/\/?$/,'/'),authorizationEnv,allowLoopback:input.allowLoopback===true,
  requestTimeoutMs:integer(input.requestTimeoutMs??30000,'request timeout milliseconds',1000,120000),
  maxResponseBytes:integer(input.maxResponseBytes??16*1024*1024,'response byte limit',1024,LIMITS.responseBytes)};
}
export async function retainedInput(store,inboxDirectory,{filename,expectedBytes,expectedSha256}){
 if(!inboxDirectory)throw fail('INBOX','Select the original private source inbox.');
 await privateDirectory(inboxDirectory);safeName(filename);hash(expectedSha256,'source SHA256');integer(expectedBytes,'source bytes',1,LIMITS.sourceBytes);
 const bytes=await readOwned(join(inboxDirectory,filename),LIMITS.sourceBytes);
 if(bytes.length!==expectedBytes||sha(bytes)!==expectedSha256)throw fail('SOURCE_CHANGED','The original uploaded file differs from its selected size or hash.',409);
 const obj=await store.putObject(bytes);return {...obj,filename};
}
export function editableSource(value){return Object.fromEntries(Object.entries(value).filter(([key])=>!['authorization','token','accessToken'].includes(key)));}
