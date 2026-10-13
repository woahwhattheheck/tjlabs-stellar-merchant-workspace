// MIT. Shared exact configured Bank source-preparation request contract.
import {createHash} from 'node:crypto';
const canonical=v=>Array.isArray(v)?v.map(canonical):v!==null&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const BANK_SOURCE_KINDS=Object.freeze(['collection_prepare','collection_edit','collection_receive','collection_inspect','profile_save','profile_receive','profile_review','profile_apply']);
export const BANK_SOURCE_MAX_BYTES=192000000;
export const BANK_SOURCE_INPUT_TOTAL=320000000;
export const BANK_SOURCE_REQUEST_BYTES=8000000;
export const BANK_SOURCE_SCHEMA='stellar-forge.accounting-bank-source-preparation.v1';
export const hashBytes=b=>createHash('sha256').update(b).digest('hex');
export const jsonBytes=v=>Buffer.from(JSON.stringify(v),'utf8');
export const canonicalHash=v=>hashBytes(jsonBytes(canonical(v)));
export const clone=v=>structuredClone(v);
export const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function need(ok,message,code='INPUT'){if(!ok)throw Object.assign(new Error(message),{code:'ACCOUNTING_BANK_SOURCES_'+code});}
export function exact(v,keys,required=[]){need(isObject(v)&&Object.keys(v).every(k=>keys.includes(k))&&required.every(k=>Object.hasOwn(v,k)),'Use the complete declared source-preparation fields.');}
export function uuid(v){need(typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v),'Use an exact retained UUID.');return v;}
export function sha(v){need(typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),'Use the complete SHA-256.');return v;}
export function integer(v,min=0,max=Number.MAX_SAFE_INTEGER){need(Number.isSafeInteger(v)&&v>=min&&v<=max,'Use an integer within the selected source limits.');return v;}
export function text(v,max,empty=false){need(typeof v==='string'&&v.length<=max&&(empty||v.trim())&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),'Use complete source text within its field limit.');return v;}
export function basename(v){text(v,240);need(v!=='.'&&v!=='..'&&!/[\/\\\u007f]/.test(v),'Use an original basename without directory components.');return v;}
export function key(v){need(typeof v==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(v),'Choose a declared source key.');return v;}
export function inputReference(v){
 exact(v,['key','sourceAlias','preparationId','file','bytes','sha256','name'],['key','bytes','sha256','name']);
 key(v.key);integer(v.bytes,1,BANK_SOURCE_MAX_BYTES);sha(v.sha256);basename(v.name);
 if(Object.hasOwn(v,'sourceAlias')){key(v.sourceAlias);need(v.preparationId===undefined&&v.file===undefined,'Choose one configured alias or one retained preparation file.');}
 else{uuid(v.preparationId);basename(v.file);}
 return clone(v);
}
function mapping(v){need(isObject(v)&&isObject(v.columns)&&['OFX','QFX','CAMT053','CSV'].includes(v.format),'Keep the original full format and column interpretation.');need(jsonBytes(v).length<=131072,'The complete mapping exceeds the native limit.');return clone(v);}
function identities(values){need(Array.isArray(values)&&values.length>=1&&values.length<=1000,'Select one to 1,000 original item IDs.');const s=new Set();for(const v of values){uuid(v);need(!s.has(v),'Select each original once.');s.add(v);}return values;}
export function validateBankSourceRequest(value){
 exact(value,['workspaceId','requestId','actor','kind','inputs','parameters'],['workspaceId','requestId','actor','kind','inputs','parameters']);
 sha(value.workspaceId);uuid(value.requestId);text(value.actor,1000);need(BANK_SOURCE_KINDS.includes(value.kind),'Choose a supported original source operation.');
 need(Array.isArray(value.inputs)&&value.inputs.length<=1000,'Retain all selected input references.');
 const inputs=value.inputs.map(inputReference),keys=new Set();let total=0;for(const row of inputs){need(!keys.has(row.key),'Each input key is unique.');keys.add(row.key);total+=row.bytes;}
 need(total<=BANK_SOURCE_INPUT_TOTAL,'This preparation exceeds the complete input byte budget.');
 const p=value.parameters,requiredInput=[],optionalInput=[];
 switch(value.kind){
 case 'collection_prepare':
  exact(p,['collectionId','name','files'],['collectionId','name','files']);uuid(p.collectionId);text(p.name,160);
  need(Array.isArray(p.files)&&p.files.length>0&&p.files.length<=1000,'Select one to 1,000 complete originals.');
  {const ids=new Set();for(const f of p.files){exact(f,['id','sourceKey','mapping','included','note'],['id','sourceKey','mapping','included','note']);uuid(f.id);need(!ids.has(f.id),'Original item IDs must be distinct.');ids.add(f.id);key(f.sourceKey);requiredInput.push(f.sourceKey);mapping(f.mapping);need(typeof f.included==='boolean','Retain the original inclusion choice.');text(f.note,4000,true);}}
  break;
 case 'collection_edit':
  exact(p,['expectedRevision','name','items'],['expectedRevision','items']);integer(p.expectedRevision);if(p.name!==undefined)text(p.name,160);
  need(Array.isArray(p.items)&&p.items.length<=1000&&(p.items.length||p.name!==undefined),'Select an actual working collection edit.');
  {const ids=new Set();for(const f of p.items){exact(f,['id','mapping','included','note'],['id']);uuid(f.id);need(!ids.has(f.id)&&Object.keys(f).length>1,'Edit each selected original once.');ids.add(f.id);if(f.mapping!==undefined)mapping(f.mapping);if(f.included!==undefined)need(typeof f.included==='boolean','Retain the inclusion choice.');if(f.note!==undefined)text(f.note,4000,true);}}
  requiredInput.push('collection');break;
 case 'collection_receive':exact(p,['collectionId'],['collectionId']);uuid(p.collectionId);requiredInput.push('collection');break;
 case 'collection_inspect':exact(p,[]);requiredInput.push('collection');break;
 case 'profile_save':
  exact(p,['libraryId','profileId','expectedRevision','expectedVersion','name','reason','mapping'],['libraryId','profileId','expectedRevision','expectedVersion','name','reason','mapping']);
  uuid(p.libraryId);uuid(p.profileId);integer(p.expectedRevision);integer(p.expectedVersion);text(p.name,160);text(p.reason,4000);mapping(p.mapping);optionalInput.push('library');break;
 case 'profile_receive':
  exact(p,['libraryId','expectedRevision'],['libraryId','expectedRevision']);uuid(p.libraryId);integer(p.expectedRevision);requiredInput.push('incoming');optionalInput.push('library');break;
 case 'profile_review':
  exact(p,['profileId','version','itemIds'],['profileId','version','itemIds']);uuid(p.profileId);integer(p.version,1);identities(p.itemIds);requiredInput.push('library','collection');break;
 case 'profile_apply':exact(p,[]);requiredInput.push('library','collection','review');break;
 }
 need(requiredInput.every(k=>keys.has(k))&&[...keys].every(k=>requiredInput.includes(k)||optionalInput.includes(k)),'Use exactly the inputs required by this selected operation.');
 if(value.kind==='collection_prepare')need(new Set(requiredInput).size===keys.size,'Every original file must bind an actual input.');
 const result={workspaceId:value.workspaceId,requestId:value.requestId,actor:value.actor,kind:value.kind,inputs,parameters:clone(p)};
 need(jsonBytes(result).length<=BANK_SOURCE_REQUEST_BYTES,'The complete reviewed source request exceeds 8 MB.');return result;
}
