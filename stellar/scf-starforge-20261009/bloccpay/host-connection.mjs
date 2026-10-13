// MIT. Bind the original Bloccpay source, retained runtime and private live host.
import { constants } from 'node:fs';
import { open, realpath, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { need, canonical, verifyFile, fileDescriptor, processAlive } from './source/lib/files.mjs';
import { verifyBloccpayRuntime } from './source/lib/runtime.mjs';

export const CONNECTION_SCHEMA='stellar-forge.bloccpay-host-connection.v1';
export const STARTUP_SCHEMA='stellar-forge.bloccpay-application-startup.v1';
export const OWN_SOURCE=fileURLToPath(new URL('./source/',import.meta.url)).replace(/\/$/,'');
export const HASH=/^[a-f0-9]{64}$/;
export const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const equal=(left,right)=>canonical(left)===canonical(right);
export function exact(value,allowed,required=[]){
 need(plain(value)&&Object.keys(value).every(key=>allowed.includes(key))&&required.every(key=>Object.hasOwn(value,key)),'BLOCCPAY_INPUT_INVALID');
}
export async function canonicalPath(value,kind,privateOnly=false){
 need(typeof value==='string'&&value===resolve(value),'BLOCCPAY_ABSOLUTE_PATH_REQUIRED');
 need(await realpath(value)===value,'BLOCCPAY_CANONICAL_PATH_REQUIRED');
 const info=await lstat(value);
 need(!info.isSymbolicLink()&&(kind==='file'?info.isFile():info.isDirectory()),'BLOCCPAY_PATH_KIND_CHANGED');
 if(privateOnly)need((info.mode&0o077)===0,'BLOCCPAY_PRIVATE_PATH_REQUIRED');
 return value;
}
export async function closeRetainedFile(handle,first=null){
 for(;;){
  try{await handle.close();return first;}
  catch(error){first??=error;await pause(200);}
 }
}
export async function readJSONBound(filename,{privateOnly=false,maximum=4*1024*1024}={}){
 await canonicalPath(filename,'file',privateOnly);
 const handle=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
 let first=null,value;
 try{
  const before=await handle.stat({bigint:true});
  need(before.isFile()&&before.size<=BigInt(maximum),'BLOCCPAY_JSON_SIZE');
  if(privateOnly)need((Number(before.mode)&0o077)===0,'BLOCCPAY_PRIVATE_FILE_REQUIRED');
  const bytes=await handle.readFile(),after=await handle.stat({bigint:true});
  need(BigInt(bytes.length)===before.size&&before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeNs===after.mtimeNs&&before.ctimeNs===after.ctimeNs,'BLOCCPAY_FILE_CHANGED');
  value={value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),file:{path:filename,bytes:bytes.length,sha256:digest(bytes),mode:Number(before.mode&0o777n)}};
 }catch(error){first=error;}
 first=await closeRetainedFile(handle,first);
 if(first)throw first;return value;
}
export async function inspectSource(sourceDirectory=OWN_SOURCE,expected){
 const root=await canonicalPath(sourceDirectory,'directory');
 const {value:manifest,file}=await readJSONBound(join(root,'source-files.json'));
 need(manifest.schema==='bloccpay.application-source.v1'&&Array.isArray(manifest.files)&&manifest.files.length>0&&manifest.files.length<=10000,'BLOCCPAY_SOURCE_MANIFEST_REQUIRED');
 if(expected)need(HASH.test(expected)&&file.sha256===expected,'BLOCCPAY_SOURCE_MANIFEST_CHANGED');
 const names=new Set();
 for(const row of manifest.files){
  need(plain(row)&&typeof row.path==='string'&&!names.has(row.path)&&row.path!=='source-files.json'&&Number.isInteger(row.mode)&&row.mode>=0&&row.mode<=0o777,'BLOCCPAY_SOURCE_COHORT_INVALID');
  names.add(row.path);await verifyFile(root,row,{mode:true});
 }
 need(['cli.mjs','server.mjs','lib/workspace.mjs','lib/runtime.mjs','worker.mjs'].every(name=>names.has(name)),'BLOCCPAY_SOURCE_INCOMPLETE');
 return {directory:root,manifest,file,sha256:file.sha256,files:[...manifest.files,{path:'source-files.json',bytes:file.bytes,sha256:file.sha256,mode:file.mode}]};
}
export const MANAGED_SOURCE_EDITIONS=Object.freeze({
 '071f3aba8eb96517a033c42e3f656dd7157bebdb57b9026794654b4b4442c63b':Object.freeze({
  id:'bloccpay-complete61-20261013',webhookProjectionSelection:true,retryableNativeClose:true,failedStartOwner:true,
 }),
});
export async function inspectManagedSource(sourceDirectory=OWN_SOURCE,expectedHash){
 const source=await inspectSource(sourceDirectory,expectedHash);
 const compatibility=MANAGED_SOURCE_EDITIONS[source.sha256];
 need(compatibility,'BLOCCPAY_SOURCE_INCOMPATIBLE',{sourceManifestSha256:source.sha256,
  supportedManifestSha256:Object.keys(MANAGED_SOURCE_EDITIONS)});
 return {...source,compatibility};
}
export async function inspectLaunch({workspaceDirectory,configurationFile,runtimeDirectory,runtimeSha256,sourceDirectory=OWN_SOURCE,sourceManifestSha256,expectedWorkspaceId}){
 await canonicalPath(workspaceDirectory,'directory',true);
 const configuration=await readJSONBound(configurationFile,{privateOnly:true});
 need(plain(configuration.value),'BLOCCPAY_CONFIGURATION_REQUIRED');
 const source=await inspectManagedSource(sourceDirectory,sourceManifestSha256);
 await canonicalPath(runtimeDirectory,'directory',true);
 const runtime=await verifyBloccpayRuntime({directory:runtimeDirectory,expectedManifestSha256:runtimeSha256});
 need(/^v?24\./.test(runtime.version),'NODE_24_REQUIRED');
 if(expectedWorkspaceId!==undefined)need(UUID.test(expectedWorkspaceId),'BLOCCPAY_WORKSPACE_ID_INVALID');
 return {workspaceDirectory,configurationFile,configuration:configuration.file,source,runtime,expectedWorkspaceId};
}
export function localOrigin(value){
 let url;try{url=new URL(value);}catch{}
 need(url&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.origin===value&&!url.username&&!url.password,'BLOCCPAY_LOCAL_ORIGIN_REQUIRED');
 return value;
}
export async function readHostConnection(filename){
 const selected=await readJSONBound(filename,{privateOnly:true});
 const value=selected.value;
 exact(value,['schema','origin','workspaceId','directory','sourceDirectory','sourceManifestSha256','runtimeDirectory','runtimeSha256','instanceId','tokenFile','process'],['schema','origin','workspaceId','directory','sourceDirectory','sourceManifestSha256','runtimeDirectory','runtimeSha256','instanceId','tokenFile','process']);
 need(value.schema===CONNECTION_SCHEMA&&UUID.test(value.workspaceId)&&UUID.test(value.instanceId)&&HASH.test(value.sourceManifestSha256)&&HASH.test(value.runtimeSha256),'BLOCCPAY_CONNECTION_INVALID');
 localOrigin(value.origin);
 for(const name of ['directory','sourceDirectory','runtimeDirectory'])await canonicalPath(value[name],'directory',name!=='sourceDirectory');
 await canonicalPath(value.tokenFile,'file',true);
 return {...selected,value};
}
export async function hostToken(connection){
 const {value}=await readJSONBound(connection.tokenFile,{privateOnly:true,maximum:65536});
 need(plain(value)&&typeof value.token==='string'&&value.token.length>=24&&value.token.length<=8192&&!/[\r\n]/.test(value.token),'BLOCCPAY_HOST_TOKEN_INVALID');
 return value.token;
}
export async function responseBytes(response,maximum=16*1024*1024){
 const declared=response.headers.get('content-length');
 need(declared===null||/^\d+$/.test(declared)&&Number(declared)<=maximum,'BLOCCPAY_RESPONSE_TOO_LARGE');
 const reader=response.body?.getReader();need(reader,'BLOCCPAY_RESPONSE_BODY_REQUIRED');
 let first=null,result;const chunks=[];let bytes=0;
 try{
  while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;need(bytes<=maximum,'BLOCCPAY_RESPONSE_TOO_LARGE');chunks.push(Buffer.from(next.value));}
  result=Buffer.concat(chunks,bytes);
 }catch(error){first=error;}
 if(first)try{await reader.cancel(first);}catch(error){first.cleanupError={code:error.code??error.name,message:error.message};}
 try{reader.releaseLock();}catch(error){first??=error;}
 if(first)throw first;return result;
}
export async function hostJSON(connection,route,{method='GET',body,signal,fetchImpl=fetch}={}){
 const token=await hostToken(connection);
 const response=await fetchImpl(new URL(route,connection.origin),{method,redirect:'error',signal,
  headers:{Authorization:'Bearer '+token,'X-Bloccpay-Workspace-Id':connection.workspaceId,...(body!==undefined?{'Content-Type':'application/json'}:{})},
  ...(body!==undefined?{body:JSON.stringify(body)}:{})});
 let bytes;try{bytes=await responseBytes(response);}catch(error){if(response.body&&!response.body.locked)await response.body.cancel().catch(()=>{});throw error;}
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{need(false,'BLOCCPAY_RESPONSE_JSON_INVALID');}
 if(!response.ok){const supplied=value.error??value;throw Object.assign(new Error(supplied.message??'Original Bloccpay request failed.'),{code:supplied.code??'BLOCCPAY_HTTP_ERROR',status:response.status,details:supplied.details??{},native:value});}
 return value;
}
export async function verifyHost(connection,{signal,fetchImpl}={}){
 need(await processAlive(connection.process),'BLOCCPAY_HOST_CLOSED');
 const value=await hostJSON(connection,'/api/bootstrap',{signal,fetchImpl});
 need(value.workspace?.id===connection.workspaceId&&value.operator?.origin===connection.origin&&value.operator?.directory===connection.directory&&value.operator?.sourceDirectory===connection.sourceDirectory,'BLOCCPAY_HOST_SELECTION_CHANGED');
 return value;
}
export function launchOptions(args){
 need(Array.isArray(args)&&args[0]==='serve'&&(args.length-1)%2===0,'BLOCCPAY_APPLICATION_ARGUMENTS_INVALID');
 const names={'--directory':'workspaceDirectory','--configuration':'configurationFile','--runtime':'runtimeDirectory','--runtime-sha256':'runtimeSha256','--source-directory':'sourceDirectory','--source-manifest-sha256':'sourceManifestSha256','--expected-workspace-id':'expectedWorkspaceId','--port':'port','--application-run-id':'runId'};
 const result={};for(let i=1;i<args.length;i+=2){const name=names[args[i]];need(name&&!Object.hasOwn(result,name)&&typeof args[i+1]==='string','BLOCCPAY_APPLICATION_ARGUMENTS_INVALID');result[name]=args[i+1];}
 for(const key of ['workspaceDirectory','configurationFile','runtimeDirectory','runtimeSha256','sourceDirectory','sourceManifestSha256'])need(typeof result[key]==='string','BLOCCPAY_APPLICATION_ARGUMENTS_INVALID');
 need(HASH.test(result.runtimeSha256)&&HASH.test(result.sourceManifestSha256),'BLOCCPAY_APPLICATION_ARGUMENTS_INVALID');
 result.port=Number(result.port??0);need(Number.isInteger(result.port)&&result.port>=0&&result.port<=65535,'BLOCCPAY_PORT_INVALID');
 if(result.runId)need(UUID.test(result.runId),'BLOCCPAY_RUN_ID_INVALID');
 return result;
}
