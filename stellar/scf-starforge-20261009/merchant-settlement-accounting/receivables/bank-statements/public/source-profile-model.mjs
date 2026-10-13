// SPDX-License-Identifier: MIT
// Named source interpretations for recurring bank deliveries. Original files stay in their collections.
import {canonical,mappingSignature,sha256,sourceWorkspaceId} from './source-collection-model.mjs';
export const PROFILE_SCHEMA='stellar-forge.bank-source-profiles.v1';
export const PROFILE_LIMITS=Object.freeze({profiles:256,versions:2048,bytes:16000000,mappingBytes:131072});
const clone=value=>JSON.parse(JSON.stringify(value));
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const id=value=>{if(typeof value!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))fail('SOURCE_PROFILE_ID','Use a complete source profile UUID.');return value;};
const text=(value,label,max,required=false)=>{if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||(required&&!value.trim()))fail('SOURCE_PROFILE_FIELD','Supply '+label+'.');return value;};
const integer=(value,label,min=0)=>{if(!Number.isSafeInteger(value)||value<min)fail('SOURCE_PROFILE_VERSION','Use the current '+label+'.');return value;};
const hash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const utf8=value=>new TextEncoder().encode(value);
const timestamp=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail('SOURCE_PROFILE_DATE','Retain an exact UTC save time.');return value;};
const defaults=Object.freeze({format:'OFX',textEncoding:'',accountNamespace:'',camtMessageVersion:'',camtNamespaceMode:'DECLARED',camtReferencePolicy:'ACCOUNT_SERVICER_REFERENCE',camtDetailPolicy:'PRESERVE_ONLY',delimiter:',',headerRow:'1',dateFormat:'YMD',decimalSeparator:'.',groupSeparator:'',amountMode:'SIGNED',accountName:'',bankId:'',branchId:'',accountId:'',accountType:'CHECKING',currency:'USD',scale:'2',postedStatuses:'Booked',pendingStatuses:'Pending'});
const columnNames=new Set(['postedDate','amount','debit','credit','providerId','payee','memo','reference','checkNumber','type','balance','currency','status','correctsProviderId','correctionAction','valueDate','accountId','bankId','branchId','accountType']);
const enums={format:['OFX','QFX','CSV','CAMT053'],textEncoding:['','utf-8','windows-1252','iso-8859-1','utf-16le','utf-16be','us-ascii'],camtMessageVersion:['','camt.053.001.02','camt.053.001.08'],camtNamespaceMode:['DECLARED','UNQUALIFIED'],camtReferencePolicy:['ACCOUNT_SERVICER_REFERENCE','SOURCE_ENTRY'],camtDetailPolicy:['PRESERVE_ONLY','ENTRY_CURRENCY_TX_AMT'],delimiter:[',',';','\t','|'],dateFormat:['YMD','DMY','MDY'],decimalSeparator:['.',','],groupSeparator:['',',','.',' '],amountMode:['SIGNED','DEBIT_CREDIT']};
export function reusableMapping(value){
 if(!object(value)||!object(value.columns))fail('SOURCE_PROFILE_MAPPING','Save the complete source interpretation and column mapping.');
 const result={};for(const[key,fallback]of Object.entries(defaults)){const selected=value[key]??fallback;result[key]=text(typeof selected==='number'?String(selected):selected,key,4000);}
 for(const[key,choices]of Object.entries(enums))if(!choices.includes(result[key]))fail('SOURCE_PROFILE_MAPPING','Choose the supported '+key+' interpretation.');
 if(!/^[1-9]\d{0,5}$/.test(result.headerRow)||Number(result.headerRow)>100000||!/^[0-6]$/.test(result.scale)||!/^[A-Z]{3}$/.test(result.currency))fail('SOURCE_PROFILE_MAPPING','Use the original header row, currency and decimal scale.');
 result.columns={};for(const[key,columnValue]of Object.entries(value.columns)){if(!columnNames.has(key))fail('SOURCE_PROFILE_MAPPING','Unknown original source column: '+key);result.columns[key]=text(columnValue,'original column '+key,32000);}
 if(result.format==='CAMT053'&&result.camtNamespaceMode==='UNQUALIFIED'&&!result.camtMessageVersion)fail('SOURCE_PROFILE_MAPPING','Select the documented version for unqualified original XML.');
 if(utf8(JSON.stringify(result)).length>PROFILE_LIMITS.mappingBytes)fail('SOURCE_PROFILE_MAPPING','This source interpretation exceeds 128 KB.');
 return result;
}
const material=version=>({version:version.version,name:version.name,actor:version.actor,reason:version.reason,createdAt:version.createdAt,mapping:version.mapping,previousSha256:version.previousSha256});
async function digestVersion(version,digest){return digest(utf8(JSON.stringify(canonical(material(version)))));}
function capacity(library){
 if(library.profiles.some(p=>!object(p)||!Array.isArray(p.versions)))fail('SOURCE_PROFILE_FORMAT','Every saved profile requires its full version history.');
 if(library.profiles.length>PROFILE_LIMITS.profiles||library.profiles.reduce((n,p)=>n+p.versions.length,0)>PROFILE_LIMITS.versions||utf8(JSON.stringify(library)).length>PROFILE_LIMITS.bytes)fail('SOURCE_PROFILE_CAPACITY','Keep up to 256 profiles, 2,048 complete versions and 16 MB in one profile library.');
 return library;
}
export function createProfileLibrary({id:libraryId,workspaceId}){
 return {schema:PROFILE_SCHEMA,id:id(libraryId),workspaceId:sourceWorkspaceId(workspaceId),revision:0,profiles:[]};
}
export async function validateProfileLibrary(value,{digest=sha256}={}){
 if(!object(value)||value.schema!==PROFILE_SCHEMA||!Array.isArray(value.profiles))fail('SOURCE_PROFILE_FORMAT','Open the complete source interpretation library.');
 id(value.id);sourceWorkspaceId(value.workspaceId);integer(value.revision,'library revision');capacity(value);
 const ids=new Set();for(const profile of value.profiles){
  if(!object(profile)||!Array.isArray(profile.versions)||!profile.versions.length)fail('SOURCE_PROFILE_FORMAT','Every profile must carry its complete saved history.');
  id(profile.id);if(ids.has(profile.id))fail('SOURCE_PROFILE_ID','Profile identities must be unique.');ids.add(profile.id);
  if(profile.origin!==null&&profile.origin!==undefined){
   let origin=profile.origin,depth=0;while(origin!==null&&origin!==undefined){if(!object(origin)||++depth>64)fail('SOURCE_PROFILE_ORIGIN','Keep the complete original receiving lineage.');
    id(origin.libraryId);sourceWorkspaceId(origin.workspaceId);id(origin.profileId);if(!hash(origin.headSha256))fail('SOURCE_PROFILE_ORIGIN','Keep the original received profile version.');origin=origin.previous;}
  }
  let previous=null;for(let index=0;index<profile.versions.length;index++){
   const version=profile.versions[index];
   if(!object(version)||version.version!==index+1||version.previousSha256!==previous)fail('SOURCE_PROFILE_HISTORY','Receive every original profile version in order.');
   text(version.name,'a profile name',160,true);text(version.actor,'the saving operator',1000,true);text(version.reason,'the interpretation reason',4000,true);timestamp(version.createdAt);
   const mapped=reusableMapping(version.mapping);if(mappingSignature(mapped)!==mappingSignature(version.mapping))fail('SOURCE_PROFILE_MAPPING','The saved profile must retain only its exact reusable interpretation.');
   if(!hash(version.sha256)||await digestVersion(version,digest)!==version.sha256)fail('SOURCE_PROFILE_CHANGED','A saved source interpretation version changed.');
   previous=version.sha256;
  }
 }
 return clone(value);
}
export function selectProfileVersion(library,profileId,version){
 const profile=library.profiles.find(row=>row.id===profileId);if(!profile)fail('SOURCE_PROFILE_MISSING','Select a saved source interpretation.');
 const selected=profile.versions.find(row=>row.version===version);if(!selected)fail('SOURCE_PROFILE_VERSION','Select an existing complete interpretation version.');
 return {profile,version:selected};
}
export async function saveProfile(library,{profileId,expectedRevision,expectedVersion=0,name,actor,reason,createdAt,mapping},{digest=sha256}={}){
 const current=await validateProfileLibrary(library,{digest});
 if(current.revision!==integer(expectedRevision,'library revision'))fail('SOURCE_PROFILE_STALE','The profile library changed. Open its current edition and preserve your working interpretation.');
 id(profileId);const existing=current.profiles.find(row=>row.id===profileId),last=existing?.versions.at(-1);
 if((last?.version||0)!==integer(expectedVersion,'profile version'))fail('SOURCE_PROFILE_STALE','The selected profile has a newer saved interpretation.');
 const version={version:expectedVersion+1,name:text(name,'a profile name',160,true).trim(),actor:text(actor,'the saving operator',1000,true).trim(),reason:text(reason,'the interpretation reason',4000,true).trim(),createdAt:timestamp(createdAt),mapping:reusableMapping(mapping),previousSha256:last?.sha256||null};
 version.sha256=await digestVersion(version,digest);
 if(existing)existing.versions.push(version);else current.profiles.push({id:profileId,origin:null,versions:[version]});
 current.revision++;return validateProfileLibrary(capacity(current),{digest});
}
export async function receiveProfileLibrary(target,source,{expectedRevision,makeId},{digest=sha256}={}){
 const current=await validateProfileLibrary(target,{digest}),incoming=await validateProfileLibrary(source,{digest});
 if(current.revision!==integer(expectedRevision,'library revision'))fail('SOURCE_PROFILE_STALE','Open the current receiving profile library.');
 if(typeof makeId!=='function')fail('SOURCE_PROFILE_ID','Provide receiving profile identities.');
 let received=0;
 for(const profile of incoming.profiles){
  const origin={libraryId:incoming.id,workspaceId:incoming.workspaceId,profileId:profile.id,headSha256:profile.versions.at(-1).sha256,previous:clone(profile.origin??null)};
  const present=current.profiles.some(row=>(current.id===incoming.id&&row.id===profile.id&&row.versions.some(v=>v.sha256===origin.headSha256))||(row.origin&&mappingSignature(row.origin)===mappingSignature(origin)));
  if(present)continue;
  const newId=id(makeId());if(current.profiles.some(row=>row.id===newId))fail('SOURCE_PROFILE_ID','Receiving profile identity already exists.');
  current.profiles.push({id:newId,origin,versions:clone(profile.versions)});received++;
 }
 if(received)current.revision++;
 return {library:await validateProfileLibrary(capacity(current),{digest}),received,existing:incoming.profiles.length-received};
}
function boundFile(value){
 if(!object(value)||!hash(value.sha256)||!Number.isSafeInteger(value.bytes)||value.bytes<1)fail('SOURCE_PROFILE_FILE','Select the complete original file before applying an interpretation.');
 return {name:text(value.name,'the original filename',240,true),bytes:value.bytes,sha256:value.sha256};
}
function changes(before,after){
 const keys=[...new Set([...Object.keys(before),...Object.keys(after)])].sort();
 return keys.filter(key=>mappingSignature(before[key]??null)!==mappingSignature(after[key]??null)).map(key=>({field:key,before:clone(before[key]??null),after:clone(after[key]??null)}));
}
export async function previewProfileApplication(library,{profileId,version,file,mapping},{digest=sha256}={}){
 const current=await validateProfileLibrary(library,{digest}),selected=selectProfileVersion(current,profileId,integer(version,'profile version',1));
 if(!object(mapping))fail('SOURCE_PROFILE_MAPPING','Retain the current file interpretation.');
 const original=boundFile(file),next={...clone(mapping),...clone(selected.version.mapping),columns:clone(selected.version.mapping.columns),balanceRecords:'[]',skipRecords:'[]',
  sourceProfile:{libraryId:current.id,profileId:selected.profile.id,version:selected.version.version,sha256:selected.version.sha256,name:selected.version.name}};
 const preview={schema:'stellar-forge.bank-source-profile-review.v1',file:original,profile:next.sourceProfile,mapping:next,changes:changes(mapping,next),previousMappingSha256:await digest(utf8(mappingSignature(mapping)))};
 preview.reviewSha256=await digest(utf8(JSON.stringify(canonical(preview))));return preview;
}
export async function applyProfileApplication(library,review,{file,mapping},{digest=sha256}={}){
 if(!object(review)||review.schema!=='stellar-forge.bank-source-profile-review.v1')fail('SOURCE_PROFILE_REVIEW','Review this original file and selected interpretation first.');
 const current=await previewProfileApplication(library,{profileId:review.profile?.profileId,version:review.profile?.version,file,mapping},{digest});
 if(current.reviewSha256!==review.reviewSha256||mappingSignature(current)!==mappingSignature(review))fail('SOURCE_PROFILE_REVIEW_CHANGED','The original file, working mapping or selected profile changed. Review the current source interpretation.');
 return clone(current.mapping);
}
