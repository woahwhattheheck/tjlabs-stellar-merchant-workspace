// SPDX-License-Identifier: MIT
// Complete original files and working interpretations. Financial writes stay in the bank workspace.
export const COLLECTION_SCHEMA='stellar-forge.bank-source-collection.v1';
export const COLLECTION_LIMITS=Object.freeze({files:1000,fileBytes:16000000,totalBytes:128000000,mappingBytes:131072,transferBytes:192000000});
const formats=new Set(['OFX','QFX','CAMT053','CSV']);
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const string=(value,label,limit=4000)=>{if(typeof value!=='string'||value.length>limit||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))fail('COLLECTION_FIELD','Use a complete '+label+'.');return value;};
const uuid=value=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))fail('COLLECTION_ID','Use the original collection identity.');return value;};
export const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const mappingSignature=value=>JSON.stringify(canonical(value));
export async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function encodeBytes(bytes){let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value);}
export function decodeBytes(value){
 if(typeof value!=='string'||value.length>Math.ceil(COLLECTION_LIMITS.fileBytes/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))fail('COLLECTION_FILE','Receive complete standard base64 original bytes.');
 const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 if(!bytes.length||bytes.length>COLLECTION_LIMITS.fileBytes||encodeBytes(bytes)!==value)fail('COLLECTION_FILE','The original file is empty, too large or has incomplete encoding.');
 return bytes;
}
function mapping(value){
 if(!object(value)||!formats.has(value.format)||!object(value.columns))fail('COLLECTION_MAPPING','Retain the complete original file interpretation.');
 const encoded=JSON.stringify(value);if(encoded.length>COLLECTION_LIMITS.mappingBytes)fail('COLLECTION_MAPPING','The working interpretation exceeds the supported size.');
 return clone(value);
}
function textBytes(value){let count=0;for(const char of value){const point=char.codePointAt(0);count+=point<128?1:point<2048?2:point<65536?3:4;}return count;}
export function transferBytes(collection){
 const {items,...metadata}=collection;
 let total=textBytes(JSON.stringify({...metadata,items:[]}))+Math.max(0,items.length-1);
 for(const item of items){total+=textBytes(JSON.stringify({...item,file:{...item.file,dataBase64:''}}))+item.file.dataBase64.length;if(total>COLLECTION_LIMITS.transferBytes)return total;}
 return total;
}
function transferable(collection){if(transferBytes(collection)>COLLECTION_LIMITS.transferBytes)fail('COLLECTION_TRANSFER_LIMIT','This complete collection exceeds the 192 MB transferable JSON limit. Retain additional original files in a separate collection.');return collection;}
function changed(collection,items,extra={}){return transferable({...collection,...extra,revision:collection.revision+1,items});}
export function createCollection({id,workspaceId,name='Original bank statements'}){
 return {schema:COLLECTION_SCHEMA,id:uuid(id),workspaceId:uuid(workspaceId),name:string(name,'collection name',160),revision:0,items:[]};
}
export function selectItem(collection,id){const item=collection.items.find(row=>row.id===id);if(!item)fail('COLLECTION_ITEM','Select an original file in this collection.');return item;}
export function updateItem(collection,id,patch){
 const item=selectItem(collection,id),allowed=new Set(['mapping','included','note']);
 if(!object(patch)||Object.keys(patch).some(key=>!allowed.has(key)))fail('COLLECTION_EDIT','Choose an interpretation, inclusion decision or note.');
 const next={...item};
 if(Object.hasOwn(patch,'mapping')){next.mapping=mapping(patch.mapping);if(mappingSignature(next.mapping)!==mappingSignature(item.mapping))next.preview=null;}
 if(Object.hasOwn(patch,'included')){if(typeof patch.included!=='boolean')fail('COLLECTION_EDIT','Choose whether this original belongs in the intake.');next.included=patch.included;}
 if(Object.hasOwn(patch,'note'))next.note=string(patch.note,'file note');
 // An unfinished exclusion note remains editable; progress identifies it as a decision to complete.
 return changed(collection,collection.items.map(row=>row.id===id?next:row));
}
export function renameCollection(collection,name){return changed(collection,collection.items,{name:string(name,'collection name',160)});}
export async function appendFiles(collection,files,{digest=sha256}={}){
 if(!Array.isArray(files)||!files.length||collection.items.length+files.length>COLLECTION_LIMITS.files)fail('COLLECTION_LIMIT','Receive one to 1,000 complete original files.');
 let total=collection.items.reduce((n,row)=>n+row.file.bytes,0);
 for(const entry of files){if(!object(entry)||!object(entry.file))fail('COLLECTION_FILE','Receive an original file and its explicit interpretation.');
  if(typeof entry.file.dataBase64!=='string')fail('COLLECTION_FILE','Receive the complete original file bytes.');
  total+=Math.floor(entry.file.dataBase64.length/4)*3-(entry.file.dataBase64.endsWith('==')?2:entry.file.dataBase64.endsWith('=')?1:0);
  if(total>COLLECTION_LIMITS.totalBytes)fail('COLLECTION_LIMIT','The complete collection exceeds 128 MB of original files.');}
 const items=[...collection.items],ids=new Set(items.map(row=>row.id));
 for(const entry of files){
  const id=uuid(entry.id);if(ids.has(id))fail('COLLECTION_DUPLICATE_ID','Each original file must retain its own collection identity.');ids.add(id);
  const name=string(entry.file.name,'original basename',240);if(!name||name==='.'||name==='..'||/[/\\]/.test(name))fail('COLLECTION_FILE_NAME','Keep the original file basename.');
  const bytes=decodeBytes(entry.file.dataBase64),hash=await digest(bytes);
  if(entry.file.sha256!==undefined&&entry.file.sha256!==hash)fail('COLLECTION_FILE_CHANGED','The original file does not match its recorded SHA-256.');
  if(entry.file.bytes!==undefined&&entry.file.bytes!==bytes.length)fail('COLLECTION_FILE_CHANGED','The original file does not match its recorded byte length.');
  items.push({id,file:{name,bytes:bytes.length,sha256:hash,dataBase64:entry.file.dataBase64},mapping:mapping(entry.mapping),included:true,note:'',preview:null});
 }
 return changed(collection,items);
}
export function retainPreview(collection,id,preview,selectedMapping){
 const item=selectItem(collection,id);
 if(mappingSignature(item.mapping)!==mappingSignature(selectedMapping))fail('COLLECTION_PREVIEW_CHANGED','The file interpretation changed while its source was being reviewed.');
 if(preview?.file?.sha256!==item.file.sha256||preview.file.bytes!==item.file.bytes||!/^[a-f0-9]{64}$/.test(preview.reviewSha256)||!Array.isArray(preview.statements))fail('COLLECTION_PREVIEW','The source review must refer to this complete original file.');
 const summary={mappingSignature:mappingSignature(item.mapping),reviewSha256:preview.reviewSha256,statements:preview.statements.map(row=>({
  id:row.id,accountId:row.account.accountId,currency:row.account.currency,sourceIdentitySha256:row.account.identitySha256,
  from:row.period?.from??null,until:row.period?.until??null,postedCount:row.summary?.postedCount??0,pendingCount:row.pendingCount??row.pendingRows?.length??0,
  issueCount:(row.issues||[]).length,kind:row.kind})),issueCount:(preview.issues||[]).length};
 return changed(collection,collection.items.map(row=>row.id===id?{...row,preview:summary}:row));
}
export function collectionProgress(collection,imports=[]){
 const superseded=new Set(imports.map(row=>row.supersedesImportId).filter(Boolean));
 const index=new Map();for(const row of imports){const hash=row.file?.sha256;if(!index.has(hash))index.set(hash,[]);index.get(hash).push(row);}
 return collection.items.map(item=>{
  const known=index.get(item.file.sha256)||[];
  const valid=item.preview?.mappingSignature===mappingSignature(item.mapping);
  const sections=valid?item.preview.statements.map(section=>{const matches=known.filter(row=>row.statementId===section.id&&row.reviewSha256===item.preview.reviewSha256);return {...section,imports:matches,activeImports:matches.filter(row=>!superseded.has(row.id))};}):[];
  const completed=sections.filter(section=>section.activeImports.length>0).length,historical=sections.filter(section=>section.imports.length>0).length;
  const status=!item.included?(item.note.trim()?'EXCLUDED':'EXCLUSION_NOTE_REQUIRED'):!valid?'NEEDS_REVIEW':sections.length===0?'NO_STATEMENTS':completed===sections.length?'RETAINED':completed?'PARTLY_RETAINED':historical?'PRIOR_INTERPRETATION':'READY_TO_RETAIN';
  return {id:item.id,status,sections,completed,historical,total:sections.length,existingImports:known.length};
 });
}
export async function receiveCollection(value,{workspaceId,id,digest=sha256}={}){
 if(!object(value)||value.schema!==COLLECTION_SCHEMA||!Array.isArray(value.items)||!Number.isSafeInteger(value.revision)||value.revision<0)fail('COLLECTION_FORMAT','Open a complete original statement collection.');
 uuid(value.id);uuid(value.workspaceId);
 let result=createCollection({id:id||value.id,workspaceId:workspaceId||value.workspaceId,name:value.name});
 // Verify every original before selecting the received edition. Earlier previews are context only;
 // the current server will compose them afresh before any financial import.
 if(value.items.length)result=await appendFiles(result,value.items,{digest});
 result.items=result.items.map((item,index)=>{
  const original=value.items[index];if(typeof original.included!=='boolean')fail('COLLECTION_EDIT','Each original needs an inclusion decision.');
  return {...item,included:original.included,note:string(original.note,'file note'),preview:null};
 });
 result.revision=value.revision;
 result.origin={collectionId:value.id,workspaceId:value.workspaceId,revision:value.revision};
 return transferable(result);
}

/** Build the same original-source interpretation for browser and native collection receiving. */
export function sourceInputForItem(item){
 const d=item.mapping,source={format:d.format,file:{name:item.file.name,dataBase64:item.file.dataBase64}};
 if(d.textEncoding)source.textEncoding=d.textEncoding;
 if(d.accountNamespace)source.accountNamespace=d.accountNamespace.trim();
 if(d.format==='CAMT053'){source.camt={detailPolicy:d.camtDetailPolicy||'PRESERVE_ONLY'};if(d.camtMessageVersion)source.camt.messageVersion=d.camtMessageVersion;}
 if(d.format==='CSV'){
  const allowed=new Set(['postedDate','amount','debit','credit','providerId','payee','memo','reference','checkNumber','type','balance','currency','status','correctsProviderId','correctionAction','valueDate','accountId','bankId','branchId','accountType']);
  const columns=Object.fromEntries(Object.entries(d.columns).filter(([key,value])=>allowed.has(key)&&String(value??'').trim()).map(([key,value])=>{const raw=String(value).trim();return [key,/^#\d+$/.test(raw)?Number(raw.slice(1)):raw];}));
  source.csv={delimiter:d.delimiter??',',headerRow:Number(d.headerRow??1),dateFormat:d.dateFormat??'YMD',decimalSeparator:d.decimalSeparator??'.',groupSeparator:d.groupSeparator??'',amountMode:d.amountMode??'SIGNED',
   account:{bankId:d.bankId??'',branchId:d.branchId??'',accountId:d.accountId??'',accountType:d.accountType??'CHECKING',currency:String(d.currency??'USD').toUpperCase()},columns,
   balanceRecords:JSON.parse(d.balanceRecords||'[]'),skipRecords:JSON.parse(d.skipRecords||'[]')};
  if(columns.status!==undefined)source.csv.statusValues={posted:String(d.postedStatuses??'Booked').split(',').map(x=>x.trim()).filter(Boolean),pending:String(d.pendingStatuses??'Pending').split(',').map(x=>x.trim()).filter(Boolean)};
 }
 return source;
}
