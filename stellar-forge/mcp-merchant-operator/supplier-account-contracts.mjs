// MIT. Exact argument and retained-file identities for the supplier-account operator.
import { supplierAccountTools } from './catalog/supplier-accounts.mjs';

export const SUPPLIER_ACCOUNT_EXPORT_SCHEMA='stellar-forge.supplier-account-export.v1';
export const SUPPLIER_ACCOUNT_EXPORT_MANIFEST='supplier-account-manifest.json';
export const SUPPLIER_ACCOUNT_DOWNLOAD_STATE_SCHEMA='stellar-forge.supplier-account-download-state.v1';
export const SUPPLIER_ACCOUNT_DOWNLOAD_RESULT_SCHEMA='stellar-forge.supplier-account-download.v1';
export const MAX_SUPPLIER_ACCOUNT_FILE_BYTES=72*1024*1024;
export const MAX_SUPPLIER_ACCOUNT_MANIFEST_BYTES=65536;
export const SUPPLIER_ACCOUNT_REPLY_BYTES=1024*1024;
export const SUPPLIER_ACCOUNT_REQUEST_BYTES=2*1024*1024;
export const SUPPLIER_ACCOUNT_CLIENT_METHODS=Object.freeze({
  status:'status',open:'open',close:'close',inputs:'inputs',state:'state',history:'history',
  change:'change',proposal:'proposal',prepare:'prepare',prepareRestore:'prepare_restore',
  prepareRebase:'prepare_rebase',apply:'apply',recover:'recover',cancel:'cancel',quota:'quota',
  exportReport:'export_report',exportBackup:'export_backup',exportManifest:'export_manifest',
  exportFile:'export_file',exportFileRelease:'export_file_release',receiveWorkspace:'receive_workspace'
});
export const SUPPLIER_ACCOUNT_PAGED_METHODS=Object.freeze(['history']);
export const supplierAccountSpecifications=new Map(supplierAccountTools(
  (name,description,properties,required,annotations)=>({name,description,properties,required,annotations})
).map(value=>[value.name,value]));
export const supplierAccountPlain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const record=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const flat=value=>typeof value==='string'&&value.length>0&&value.length<=240&&
  !/[\\/\x00-\x1f\x7f]/.test(value)&&value!=='.'&&value!=='..';

/** Copy the complete original JSON request; no decimal strings or optional fields are coerced. */
function jsonValue(value,path,ancestors,depth=0){
  if(depth>512)fail('SUPPLIER_ACCOUNT_ARGUMENTS',path+' exceeds512 JSON levels.');
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'){if(!Number.isFinite(value))fail('SUPPLIER_ACCOUNT_ARGUMENTS',path+' must be a finite JSON number.');return;}
  if(!Array.isArray(value)&&!supplierAccountPlain(value))fail('SUPPLIER_ACCOUNT_ARGUMENTS',path+' must contain original JSON values.');
  if(ancestors.has(value))fail('SUPPLIER_ACCOUNT_ARGUMENTS',path+' contains a cycle.');
  ancestors.add(value);
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
  if(!array&&prototype!==Object.prototype&&prototype!==null)fail('SUPPLIER_ACCOUNT_ARGUMENTS',path+' must be a plain JSON object.');
  if(Object.getOwnPropertySymbols(value).length)fail('SUPPLIER_ACCOUNT_ARGUMENTS',path+' contains non-JSON symbol fields.');
  const descriptors=Object.getOwnPropertyDescriptors(value),keys=Object.keys(descriptors);
  if(array&&keys.length!==value.length+1)fail('SUPPLIER_ACCOUNT_ARGUMENTS',path+' must retain every original array item.');
  for(const key of keys){
    if(array&&key==='length')continue;
    const descriptor=descriptors[key];
    if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value')||array&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=value.length))
      fail('SUPPLIER_ACCOUNT_ARGUMENTS',path+' must contain only original enumerable JSON data fields.');
    jsonValue(descriptor.value,path+'.'+key,ancestors,depth+1);
  }
  ancestors.delete(value);
}
function check(value,schema,path){
  const types=Array.isArray(schema.type)?schema.type:schema.type?[schema.type]:[];
  const actual=value===null?'null':Array.isArray(value)?'array':typeof value;
  if(types.length&&!types.some(type=>type==='integer'?Number.isSafeInteger(value):type===actual))
    fail('SUPPLIER_ACCOUNT_ARGUMENTS',path+' has an unsupported type.');
  if(schema.enum&&!schema.enum.includes(value))fail('SUPPLIER_ACCOUNT_ARGUMENTS',path+' must use a declared value.');
  if(typeof value==='string'){
    if(schema.minLength!==undefined&&value.length<schema.minLength||
       schema.maxLength!==undefined&&value.length>schema.maxLength||schema.pattern&&!new RegExp(schema.pattern).test(value))
      fail('SUPPLIER_ACCOUNT_ARGUMENTS',path+' differs from its original text or identifier contract.');
  }else if(typeof value==='number'){
    if(schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum)
      fail('SUPPLIER_ACCOUNT_ARGUMENTS',path+' is outside its supported range.');
  }else if(Array.isArray(value)){
    if(schema.minItems!==undefined&&value.length<schema.minItems||schema.maxItems!==undefined&&value.length>schema.maxItems||
       schema.uniqueItems&&new Set(value.map(item=>JSON.stringify(item))).size!==value.length)
      fail('SUPPLIER_ACCOUNT_ARGUMENTS',path+' has an invalid size or repeats a unique value.');
    if(schema.items)for(let i=0;i<value.length;i++)check(value[i],schema.items,path+'['+i+']');
  }else if(supplierAccountPlain(value)){
    for(const key of schema.required??[])if(!Object.hasOwn(value,key))fail('SUPPLIER_ACCOUNT_ARGUMENTS',path+'.'+key+' is required.');
    for(const [key,item]of Object.entries(value)){
      if(Object.hasOwn(schema.properties??{},key))check(item,schema.properties[key],path+'.'+key);
      else if(schema.additionalProperties===false)fail('SUPPLIER_ACCOUNT_ARGUMENTS',path+'.'+key+' is not a declared field.');
      else if(supplierAccountPlain(schema.additionalProperties))check(item,schema.additionalProperties,path+'.'+key);
    }
  }
}
export function validateSupplierAccountArguments(name,args,{maximumBytes=SUPPLIER_ACCOUNT_REQUEST_BYTES}={}){
  const spec=supplierAccountSpecifications.get(name);
  if(!spec)fail('METHOD_NOT_FOUND','Choose an original supplier-account tool.');
  if(!supplierAccountPlain(args))fail('SUPPLIER_ACCOUNT_ARGUMENTS','Tool arguments must be a plain JSON object.');
  if(!Number.isSafeInteger(maximumBytes)||maximumBytes<1||maximumBytes>64*1024*1024)
    fail('SUPPLIER_ACCOUNT_ARGUMENTS','Select a supported complete request limit.');
  jsonValue(args,'arguments',new Set());
  check(args,{type:'object',properties:spec.properties,required:spec.required,additionalProperties:false},'arguments');
  const encoded=JSON.stringify(args);
  if(Buffer.byteLength(encoded)>maximumBytes)fail('SUPPLIER_ACCOUNT_REQUEST_TOO_LARGE',
    'The complete supplier-account request exceeds the selected limit.');
  return JSON.parse(encoded);
}
export function validateSupplierAccountExportId(value){
  if(!record(value))fail('SUPPLIER_ACCOUNT_DOWNLOAD_EXPORT_ID','Use the original retained file ID.');
  return value;
}
/** Parse a complete original account report/backup manifest before receiving bytes. */
export function parseSupplierAccountExportManifest(bytes,expectedExportId){
  const invalid=message=>fail('SUPPLIER_ACCOUNT_DOWNLOAD_MANIFEST_INVALID',message);
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>MAX_SUPPLIER_ACCOUNT_MANIFEST_BYTES)
    invalid('Use the complete supplier-account manifest within its declared limit.');
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{invalid('The complete manifest must contain UTF-8 JSON.');}
  if(!supplierAccountPlain(value)||value.schema!==SUPPLIER_ACCOUNT_EXPORT_SCHEMA||
      !record(value.exportId)||value.exportId!==expectedExportId||
      typeof value.workspaceId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.workspaceId)||
      !['report','backup'].includes(value.kind)||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt))||
      !Array.isArray(value.files)||value.files.length!==1)
    invalid('Keep the original export ID, workspace identity, kind, time and one complete native file.');
  const file=value.files[0],name=value.kind==='backup'?'workspace-backup.json':'operator-report.json';
  if(!supplierAccountPlain(file)||file.name!==name||file.type!=='application/json'||
      !Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>MAX_SUPPLIER_ACCOUNT_FILE_BYTES||!hash(file.sha256))
    invalid('The complete native payload needs its fixed filename, exact byte length and SHA-256.');
  return value;
}
