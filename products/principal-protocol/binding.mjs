// MIT. Bind the installed adapter to the unchanged Principal source and saved workspace.
import {lstat, realpath, readFile, open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve, join, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const PRODUCT_ROOT=fileURLToPath(new URL('./',import.meta.url));
export const OPERATOR_ROOT=join(PRODUCT_ROOT,'operator');
export const PRODUCT_SCHEMA='principal.installed-application.v1';
export const SOURCE_EDITION='principal-paired-exit-1-market-1-accounting-3';
export function requireValue(ok,code,message=code){if(!ok)throw Object.assign(new Error(message),{code});}
export const digest=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
export async function ordinary(file,{privateOnly=false,maximum=128*1024*1024}={}){
 requireValue(typeof file==='string'&&isAbsolute(file),'ABSOLUTE_SOURCE_PATH_REQUIRED');
 const absolute=resolve(file),stat=await lstat(absolute);
 requireValue(stat.isFile()&&!stat.isSymbolicLink()&&await realpath(absolute)===absolute,'ORDINARY_FILE_REQUIRED');
 if(privateOnly)requireValue((stat.mode&0o077)===0&&stat.uid===process.getuid(),'PRIVATE_TOKEN_FILE_REQUIRED','Use an owner-only private operator token file.');
 const handle=await open(absolute,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=await handle.stat({bigint:true});
  requireValue(before.isFile()&&before.dev===BigInt(stat.dev)&&before.ino===BigInt(stat.ino)&&before.size<=BigInt(maximum),'SOURCE_FILE_CHANGED');
  if(privateOnly)requireValue((before.mode&0o077n)===0n&&before.uid===BigInt(process.getuid()),'PRIVATE_TOKEN_FILE_REQUIRED');
  const data=await handle.readFile(),after=await handle.stat({bigint:true});
  if(privateOnly)requireValue((after.mode&0o077n)===0n&&after.uid===BigInt(process.getuid()),'PRIVATE_TOKEN_FILE_REQUIRED');
  requireValue(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeNs===after.mtimeNs&&before.ctimeNs===after.ctimeNs&&BigInt(data.length)===before.size,'SOURCE_FILE_CHANGED');
  return {path:absolute,bytes:data.length,sha256:digest(data),data};
 }finally{await handle.close();}
}
export async function privateToken(file,expected){
 requireValue(process.platform==='linux','LINUX_OPERATOR_REQUIRED');
 const value=await ordinary(file,{privateOnly:true,maximum:4096});
 if(expected!==undefined)requireValue(value.sha256===expected,'OPERATOR_TOKEN_CHANGED','Review the selected token file again.');
 const token=new TextDecoder('utf-8',{fatal:true}).decode(value.data).trim();
 requireValue(/^[\x21-\x7e]{24,4096}$/.test(token),'OPERATOR_TOKEN_REQUIRED','Use at least 24 visible ASCII characters in the private token file.');
 return {...value,token};
}
export async function sourceBinding(root=PRODUCT_ROOT){
 const manifestFile=await ordinary(join(root,'PRODUCT_SOURCE.json'),{maximum:1024*1024}),manifest=JSON.parse(manifestFile.data.toString('utf8'));
 requireValue(manifest.schema==='principal.installed-product-source.v1'&&manifest.edition===SOURCE_EDITION&&manifest.current.count===320&&manifest.reference.count===44&&Array.isArray(manifest.files)&&manifest.files.length===364,'PRODUCT_SOURCE_MANIFEST_CHANGED');
 const seen=new Set();
 for(const member of manifest.files){
  requireValue(typeof member.path==='string'&&/^(operator|reference)\//.test(member.path)&&!member.path.includes('\\')&&member.path.split('/').every(part=>part&&part!=='.'&&part!=='..')&&!seen.has(member.path)&&Number.isSafeInteger(member.bytes)&&member.bytes>=0&&/^[a-f0-9]{64}$/.test(member.sha256),'PRODUCT_SOURCE_MEMBER_CHANGED');
  seen.add(member.path);
  const file=await ordinary(join(root,member.path));
  requireValue(file.bytes===member.bytes&&file.sha256===member.sha256,'PRODUCT_SOURCE_MEMBER_CHANGED','Restore the complete selected Principal source: '+member.path);
 }
 const apiFile=await ordinary(join(root,'operator','CONTRACT_API.json')),api=JSON.parse(apiFile.data.toString('utf8'));
 requireValue(api.schema==='principal.contract-api.v2'&&api.edition===SOURCE_EDITION,'CONTRACT_SOURCE_EDITION_CHANGED');
 return {schema:PRODUCT_SCHEMA+'.source',edition:SOURCE_EDITION,manifestSha256:manifestFile.sha256,apiSha256:digest(canonical(api)),files:manifest.files};
}
export async function workspaceBinding(directory,source){
 requireValue(process.platform==='linux','LINUX_OPERATOR_REQUIRED');
 const [major,minor]=process.versions.node.split('.').map(Number);requireValue(major>22||(major===22&&minor>=16),'NODE_22_16_REQUIRED');
 requireValue(typeof directory==='string'&&isAbsolute(directory),'ABSOLUTE_WORKSPACE_REQUIRED');
 directory=resolve(directory);const stat=await lstat(directory);
 requireValue(stat.isDirectory()&&!stat.isSymbolicLink()&&await realpath(directory)===directory&&(stat.mode&0o077)===0&&stat.uid===process.getuid(),'PRIVATE_WORKSPACE_REQUIRED');
 const file=join(directory,'principal.sqlite'),before=await lstat(file);
 requireValue(before.isFile()&&!before.isSymbolicLink(),'EXISTING_PRINCIPAL_WORKSPACE_REQUIRED','Initialize or receive the original workspace explicitly before selecting it in Applications.');
 const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(file,{readOnly:true});
 try{
  const row=db.prepare('SELECT body FROM state WHERE id=1').get();requireValue(row&&typeof row.body==='string','PRINCIPAL_WORKSPACE_INVALID');
  const state=JSON.parse(row.body),after=await lstat(file);
  requireValue(before.dev===after.dev&&before.ino===after.ino&&!after.isSymbolicLink(),'PRINCIPAL_WORKSPACE_CHANGED');
  requireValue(typeof state.workspace?.id==='string'&&/^[a-f0-9-]{36}$/.test(state.workspace.id)&&state.apiSha256===source.apiSha256,'CONTRACT_SOURCE_EDITION_CHANGED','This workspace requires its original API edition; receive or select the matching source.');
  return {schema:PRODUCT_SCHEMA+'.workspace',directory,workspaceId:state.workspace.id,apiSha256:state.apiSha256,sourceEdition:source.edition};
 }finally{db.close();}
}
export function selectedArguments(args){
 requireValue(Array.isArray(args)&&args[0]==='launch','PRINCIPAL_APPLICATION_ARGUMENTS');
 const values={},allowed=new Set(['source-root','workspace','token-file','expected-workspace-id','expected-api-sha256','expected-source-sha256','expected-token-sha256','port']);
 for(let i=1;i<args.length;i+=2){const name=args[i];requireValue(typeof name==='string'&&name.startsWith('--')&&allowed.has(name.slice(2))&&typeof args[i+1]==='string'&&!Object.hasOwn(values,name.slice(2)),'PRINCIPAL_APPLICATION_ARGUMENTS');values[name.slice(2)]=args[i+1];}
 for(const name of ['source-root','workspace','token-file','expected-workspace-id','expected-api-sha256','expected-source-sha256','expected-token-sha256'])requireValue(values[name],'PRINCIPAL_APPLICATION_ARGUMENTS');
 for(const name of ['expected-api-sha256','expected-source-sha256','expected-token-sha256'])requireValue(/^[a-f0-9]{64}$/.test(values[name]),'PRINCIPAL_APPLICATION_ARGUMENTS');
 requireValue(/^[a-f0-9-]{36}$/.test(values['expected-workspace-id']),'PRINCIPAL_APPLICATION_ARGUMENTS');
 requireValue(isAbsolute(values['source-root']),'ABSOLUTE_SOURCE_PATH_REQUIRED');
 const port=values.port??'0';requireValue(/^(0|[1-9]\d*)$/.test(port)&&Number(port)<=65535,'PORT_REQUIRED');return {...values,port:Number(port)};
}
export async function verifySelection(args){
 const selected=selectedArguments(args),source=await sourceBinding(selected['source-root']),workspace=await workspaceBinding(selected.workspace,source),token=await privateToken(selected['token-file'],selected['expected-token-sha256']);
 requireValue(source.manifestSha256===selected['expected-source-sha256']&&workspace.apiSha256===selected['expected-api-sha256']&&workspace.workspaceId===selected['expected-workspace-id'],'PRINCIPAL_APPLICATION_BINDING_CHANGED','Review the exact current workspace and source edition before starting.');
 return {selected,source,workspace,token};
}
