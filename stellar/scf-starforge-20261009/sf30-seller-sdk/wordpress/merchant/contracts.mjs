// MIT. WordPress merchant connection and complete retained-file identities.
import {createHash} from 'node:crypto';
export const CONNECTION_SCHEMA='stellar-forge.wordpress-merchant-connection.v1';
export const EXPORT_SCHEMA='stellar-forge.wordpress-merchant-export.v1';
export const MANIFEST_NAME='wordpress-merchant-manifest.json';
export const TOOL_PREFIX='merchant_wordpress_';
export const MAX_JSON_BYTES=64*1024*1024;
export const MAX_ARTIFACT_BYTES=4362076160;
export const MAX_REQUEST_BYTES=1048576;
export {MAX_RETAINED_CHUNK_BYTES} from '../../../../../stellar-forge/mcp-merchant-operator/retained-file-contracts.mjs';
export const UUID='^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$';
export const SHA='^[a-f0-9]{64}$';
export const ALIAS='^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$';
export const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export const canonical=value=>Array.isArray(value)?value.map(canonical):plain(value)
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const identity=value=>digest(Buffer.from(JSON.stringify(canonical(value))));
export const failure=(code,message=code,details)=>Object.assign(new Error(message),{code,...(details===undefined?{}:{details})});
export function need(value,code,message,details){if(!value)throw failure(code,message,details);}
export function decode(bytes){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw failure('WORDPRESS_MERCHANT_JSON','Use complete UTF-8 JSON.');}}
export function checked(value,pattern,label){need(typeof value==='string'&&new RegExp(pattern).test(value),
  'WORDPRESS_MERCHANT_INPUT','Use the exact '+label+'.');return value;}
export function exact(value,allowed,required=[]){need(plain(value)&&Object.keys(value).every(key=>allowed.includes(key))&&
  required.every(key=>Object.hasOwn(value,key)),'WORDPRESS_MERCHANT_INPUT','Use only the declared fields: '+allowed.join(', ')+'.');}
export function text(value,label,maximum=180){need(typeof value==='string'&&value.trim()&&value.length<=maximum&&
  !/[\x00-\x1f\x7f]/.test(value),'WORDPRESS_MERCHANT_INPUT',label+' must be nonempty text without control characters.');return value;}
export function manifestIdentity(value){const copy={...value};delete copy.exportId;return identity(copy);}
export function parseWordPressExport(bytes,expectedId){
  need(bytes.length<=65000,'WORDPRESS_MERCHANT_MANIFEST','The complete file manifest exceeds its original limit.');
  const value=decode(bytes);exact(value,['schema','exportId','workspace','workspaceId','workspaceIdentity','kind','source','files'],
    ['schema','exportId','workspace','workspaceId','workspaceIdentity','kind','source','files']);
  checked(value.exportId,SHA,'export ID');checked(value.workspace,ALIAS,'workspace alias');
  checked(value.workspaceId,UUID,'original workspace UUID');checked(value.workspaceIdentity,SHA,'workspace identity');
  need(value.schema===EXPORT_SCHEMA&&value.exportId===manifestIdentity(value)&&
    (expectedId===undefined||expectedId===value.exportId)&&plain(value.source)&&
    ['native-response','original-artifact','publisher-artifact','source-packet','source-receiving'].includes(value.kind)&&
    Array.isArray(value.files)&&value.files.length===1,'WORDPRESS_MERCHANT_MANIFEST','Select the complete original export manifest.');
  const file=value.files[0];exact(file,['name','bytes','sha256','contentType'],['name','bytes','sha256','contentType']);
  need(typeof file.name==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/.test(file.name)&&
    file.name!==MANIFEST_NAME&&Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=MAX_ARTIFACT_BYTES,
    'WORDPRESS_MERCHANT_MANIFEST','The original file name or byte count is invalid.');
  checked(file.sha256,SHA,'file SHA-256');text(file.contentType,'Content type',200);
  if(value.kind==='source-packet')need(file.name==='wordpress-source.zip'&&file.contentType==='application/zip',
    'WORDPRESS_MERCHANT_MANIFEST','A source packet retains its complete original ZIP.');
  return value;
}
export function jsonPointer(value,pointer=''){
  need(typeof pointer==='string'&&pointer.length<=4000&&(!pointer||pointer.startsWith('/')),
    'WORDPRESS_MERCHANT_POINTER','Use an original JSON pointer.');
  for(const bit of pointer?pointer.slice(1).split('/'):[]){
    need(!/~(?![01])/.test(bit),'WORDPRESS_MERCHANT_POINTER');
    const key=bit.replace(/~1/g,'/').replace(/~0/g,'~');
    need(value!==null&&typeof value==='object'&&Object.hasOwn(value,key)&&
      (!Array.isArray(value)||/^(0|[1-9][0-9]*)$/.test(key)),
      'WORDPRESS_MERCHANT_POINTER_NOT_FOUND','The selected value is absent from this retained response.');
    value=value[key];
  }return value;
}
