// MIT. Source and host identity for the original installed commissioning product.
import {constants} from 'node:fs';
import {open,lstat,realpath,readFile,mkdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inspectMerchantRuntime} from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
export {acquireWorkspace} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/files.mjs';
export {digest,objectDigest,jsonBytes,saveJson,durable,fileIdentity,verifyManifest,inventory,inside,safeRelative} from '../../business/lightdash-commissioning-workspace-20261012/native/files.mjs';
import {digest,objectDigest,verifyManifest,fileIdentity} from '../../business/lightdash-commissioning-workspace-20261012/native/files.mjs';

export const APP='business/lightdash-commissioning-workspace-20261012';
export const PRODUCT='products/lightdash-commissioning';
export const MCP='stellar-forge/mcp-merchant-operator';
export const PROJECT_SCHEMA='stellar-forge.lightdash-project.v1';
export const REQUEST_SCHEMA='stellar-forge.lightdash-project-request.v1';
export const CONNECTION_SCHEMA='stellar-forge.lightdash-workspace-connection.v1';
export const SESSION_SCHEMA='stellar-forge.lightdash-project-session.v1';
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const SHA=/^[a-f0-9]{64}$/;
export const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const ALIAS=/^[a-z][a-z0-9_-]{0,63}$/;
export {MAX_RETAINED_IMMUTABLE_FILE_BYTES as MAX_FILE_BYTES} from '../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {MAX_RETAINED_IMMUTABLE_FILE_BYTES as MAX_FILE_BYTES} from '../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
export const TOKEN_ENV='LIGHTDASH_PROJECT_MCP_TOKEN';
export const productFiles=['common.mjs','project.mjs','mcp.mjs','catalog.mjs','merchant-provider.mjs',
 'client.mjs','client.d.mts','cli.mjs','application.mjs','application-provider.mjs',
 'receive.mjs','receive.py','receive-open.mjs','installed-receiving.mjs','README.md',
 'RECEIVING.md','SOURCE_LINEAGE.json','browser-assets.json','examples/project.json',
 'operating-plan.mjs','operating-plan.d.mts','operating-store.mjs','operating-catalog.mjs','operating-server.mjs','operating-cli.mjs','operating-web/index.html','operating-web/app.js','operating-web/style.css','operating-browser-assets.json','OPERATING_PLANS.md','OPERATING_APPLICATION.md','OPERATING_SOURCE.json'];
export function fault(code,message,details={}){const e=new Error(message??code);e.code=code;e.details=details;return e;}
export function need(value,code,message){if(!value)throw fault(code,message);}
export const plain=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
export function exact(value,keys,required=[]){
 need(plain(value)&&Object.keys(value).every(k=>keys.includes(k))&&required.every(k=>Object.hasOwn(value,k)),
 'LIGHTDASH_PROJECT_FIELDS','Use the documented complete fields.');
}
export function text(value,label,max=256){
 need(typeof value==='string'&&value.length>0&&value.trim()===value&&value.length<=max&&!/[\u0000-\u001f]/.test(value),
 'LIGHTDASH_PROJECT_TEXT','Use a nonempty '+label+'.');return value;
}
export function absolute(value,label='path'){
 need(typeof value==='string'&&path.isAbsolute(value)&&path.resolve(value)===value&&!/[\0\r\n]/.test(value),
 'LIGHTDASH_PROJECT_PATH','Use a canonical absolute '+label+'.');return value;
}
export function uuid(value){need(UUID.test(value??''),'LIGHTDASH_PROJECT_UUID','Retain the original UUID.');return value;}
export function identifier(value){need(ID.test(value??''),'LIGHTDASH_PROJECT_ID','Retain the original operation identifier.');return value;}
export function alias(value){need(ALIAS.test(value??'')&&!['constructor','prototype','__proto__'].includes(value),'LIGHTDASH_PROJECT_ALIAS','Choose a declared alias.');return value;}
export function sha(value){need(SHA.test(value??''),'LIGHTDASH_PROJECT_SHA','Use the complete SHA256.');return value;}
export function revision(value){need(Number.isSafeInteger(value)&&value>=0,'LIGHTDASH_PROJECT_REVISION','Use the observed original revision.');return value;}
export async function exists(file){try{await lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export async function privateDirectory(directory,create=false){
 absolute(directory);if(create)await mkdir(directory,{recursive:true,mode:0o700});
 const s=await lstat(directory);
 need(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o077)===0&&await realpath(directory)===directory,
 'LIGHTDASH_PROJECT_PRIVATE_DIRECTORY','Use an actual private canonical directory.');return directory;
}
export function outside(a,b){
 const p=path.relative(a,b),q=path.relative(b,a);
 return p!==''&&q!==''&&(p==='..'||p.startsWith('../'))&&(q==='..'||q.startsWith('../'));
}
export async function readBytes(file,{maximum=32*1024*1024,privateFile=false}={}){
 absolute(file);let handle;
 try{
  handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);const before=await handle.stat({bigint:true});
  need(before.isFile()&&before.size<=BigInt(maximum)&&(!privateFile||(before.mode&0o077n)===0n),
   'LIGHTDASH_PROJECT_FILE','Use a regular selected file within the declared limit.');
  const b=await handle.readFile(),after=await handle.stat({bigint:true});
  need(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&BigInt(b.length)===before.size&&
   before.mtimeNs===after.mtimeNs&&before.ctimeNs===after.ctimeNs,'LIGHTDASH_PROJECT_FILE_CHANGED','The complete selected file changed.');
  return b;
 }finally{await handle?.close();}
}
export const decode=b=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
export const json=async(file,options)=>decode(await readBytes(file,options));
export async function workspaceIdentity(directory){
 await privateDirectory(directory);
 const database=path.join(directory,'commissioning.sqlite'),s=await lstat(database);
 need(s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o077)===0,'LIGHTDASH_PROJECT_DATABASE','Select the original private SQLite file.');
 let db;
 try{
  db=new DatabaseSync(database,{readOnly:true});db.exec('PRAGMA busy_timeout=5000');
  const row=db.prepare('SELECT revision,body FROM meta WHERE id=1').get(),metadata=row&&JSON.parse(row.body);
  need(metadata?.schema==='lightdash.commissioning-workspace.v1'&&UUID.test(metadata.id),
   'LIGHTDASH_PROJECT_DATABASE','Select an initialized original commissioning workspace.');
  const after=await lstat(database);
  need(s.dev===after.dev&&s.ino===after.ino,'LIGHTDASH_PROJECT_DATABASE_CHANGED','The selected database was replaced.');
  return {directory,database,workspaceId:metadata.id,device:String(s.dev),inode:String(s.ino),
   revision:Number(row.revision),configurationSha256:objectDigest({connection:metadata.connection,editionSettings:metadata.editionSettings}),
   metadata:{...metadata,revision:Number(row.revision)}};
 }finally{db?.close();}
}
export function fixedWorkspace(value){return {directory:value.directory,database:value.database,workspaceId:value.workspaceId,device:value.device,inode:value.inode};}
export async function verifyOriginalApplication(directory,expected){
 absolute(directory);const manifestFile=path.join(directory,'source-manifest.json');
 const content=await readBytes(manifestFile,{maximum:2*1024*1024}),actual=digest(content);
 if(expected)need(actual===expected,'LIGHTDASH_PROJECT_APPLICATION_CHANGED','The original complete application selection changed.');
 const verified=await verifyManifest({directory,manifestFile,manifestSha256:actual});
 need(verified.manifest.schema==='lightdash.commissioning-source.v1','LIGHTDASH_PROJECT_APPLICATION','Select the original complete commissioning application.');
 return {directory,manifestFile,manifestSha256:actual,files:verified.files};
}
export async function installedSource(runtimeDirectory){
 absolute(runtimeDirectory,'installed runtime');
 const runtime=await inspectMerchantRuntime(runtimeDirectory,{load:false});
 const manifestFile=path.join(runtimeDirectory,'package/manifest.json'),content=await readBytes(manifestFile,{maximum:32*1024*1024});
 const manifest=decode(content),files=new Map((manifest.files??[]).map(x=>[x.path,x]));
 const required=[...["discovery/catalog.mjs","discovery/operating-plan.mjs","discovery/operating-plan-return.mjs","discovery/load.mjs","specification.mjs","source-selection.mjs","product-package.mjs"].map(p=>'stellar/scf-starforge-20261009/distribution/'+p),...productFiles.map(p=>PRODUCT+'/'+p),...['config.mjs','operator.mjs','serve.mjs',
 'provider-contract.mjs','retained-file-reads.mjs','retained-file-contracts.mjs','retained-download.mjs'].map(p=>MCP+'/'+p),
 'stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs'];
 const sourceRoot=absolute(runtime.sourceRoot);
 for(const p of required){
  const item=files.get(p);need(item&&SHA.test(item.sha256),'LIGHTDASH_PROJECT_INSTALLATION','Install the complete lightdash-commissioning selection.');
  const actual=await fileIdentity(path.join(sourceRoot,p));need(actual.bytes===item.bytes&&actual.sha256===item.sha256,
   'LIGHTDASH_PROJECT_INSTALLATION_CHANGED','An installed original product dependency changed.');
 }
 const executingRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 for(const p of required){const own=await fileIdentity(path.join(executingRoot,p));
  need(own.sha256===files.get(p).sha256&&own.bytes===files.get(p).bytes,'LIGHTDASH_PROJECT_EXECUTED_SOURCE','Execute the complete selected original product source.');}
 const lineage=await json(path.join(sourceRoot,PRODUCT,'SOURCE_LINEAGE.json'));
 const application=await verifyOriginalApplication(path.join(sourceRoot,APP),lineage.application.manifestSha256);
 await verifyOriginalApplication(path.join(executingRoot,APP),lineage.application.manifestSha256);
 for(const item of lineage.application.files){
  const row=files.get(APP+'/'+item.path);
  need(row?.sha256===item.sha256&&row?.bytes===item.bytes,'LIGHTDASH_PROJECT_ORIGINAL_SOURCE','The complete original 38-file application must be installed unchanged.');
 }
 return {runtimeDirectory,sourceRoot,executingRoot,sourceCommit:runtime.sourceCommit,manifestFile,manifestSha256:digest(content),
  application,entrypoint:path.join(sourceRoot,'stellar/scf-starforge-20261009/distribution/cli.mjs')};
}
export function publicValue(value){
 if(Array.isArray(value))return value.map(publicValue);
 if(!plain(value))return value;
 const hidden=new Set(['root','directory','database','absolutePath','projectRoot','runtime','environment','tokenEnv','proxyAuthorizationEnv',
  'manifestFile','connectionFile','tokenFile','sourceRoot','releaseStore','exportsDirectory','profiles']);
 return Object.fromEntries(Object.entries(value).filter(([k,v])=>!hidden.has(k)&&
  !(typeof v==='string'&&path.isAbsolute(v)&&['path','file','source','workspaceDir','operationDir','outputDirectory','applicationDirectory','workspaceDirectory'].includes(k)))
  .map(([k,v])=>[k,k==='connection'&&plain(v)?{id:v.id??null,origin:v.origin??null,projectUuid:v.projectUuid??null,detached:Object.keys(v).length===0}:publicValue(v)]));
}

/** Transfer this exact opened original descriptor to RetainedFileReads. */
export async function immutableFile(filename,{bytes,sha256,name=path.basename(filename),type='application/octet-stream'}){
 absolute(filename);need(Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=MAX_FILE_BYTES&&SHA.test(sha256),
  'LIGHTDASH_FILE_IDENTITY','Select the complete original file identity.');
 const handle=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const info=await handle.stat();need(info.isFile()&&info.size===bytes,'LIGHTDASH_FILE_CHANGED','The selected original file changed.');
  return {readonlyFileHandle:handle,bytes,sha256,name,type};
 }catch(error){await handle.close();throw error;}
}
