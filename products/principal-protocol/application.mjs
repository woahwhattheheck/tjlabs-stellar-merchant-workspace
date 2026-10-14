// MIT. Source-owned Applications adapter for the original Principal operator.
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {get} from 'node:http';
import {inspectMerchantRuntime} from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import {PRODUCT_SCHEMA,requireValue,privateToken,selectedArguments} from './binding.mjs';
const ROOT='products/principal-protocol/';
export function principalApplication(common=[]){
 return {id:'principal-protocol',command:'principal-protocol',title:'Principal operations',terminal:false,requiredSource:ROOT+'cli.mjs',
 description:'Open the saved Principal workspace for exact contract observations, reviewed operations, market positions and complete editable receiving.',
 fields:[{name:'workspaceDirectory',label:'Saved Principal workspace',type:'path',required:true,description:'An existing private workspace initialized or received with this exact source edition.'},
 {name:'tokenFile',label:'Private operator token file',type:'path',required:true,description:'An owner-only file containing the original operator access token. The token is not a signing key.'},...common]};
}
export async function preparePrincipalApplication(settings,{inputPath,runtimeDirectory}){
 const runtime=await inspectMerchantRuntime(resolve(runtimeDirectory),{load:false,source:false}),root=join(runtime.sourceRoot,ROOT);
 const original=await import(pathToFileURL(join(root,'binding.mjs')).href);
 const source=await original.sourceBinding(root),directory=await inputPath(settings.workspaceDirectory,'directory',false,true),tokenInput=await inputPath(settings.tokenFile,'file');
 const workspace=await original.workspaceBinding(directory.path,source),token=await original.privateToken(tokenInput.path);
 const inputs=[directory,tokenInput];
 for(const relative of ['PRODUCT_SOURCE.json','binding.mjs','application.mjs','application-provider.mjs','cli.mjs',...source.files.map(row=>row.path)])inputs.push(await inputPath(join(root,relative),'file'));
 return {args:['launch','--workspace',workspace.directory,'--token-file',token.path,'--expected-workspace-id',workspace.workspaceId,'--expected-api-sha256',workspace.apiSha256,'--expected-source-sha256',source.manifestSha256,'--expected-token-sha256',token.sha256],inputs,createDirectories:[]};
}
function bootstrap(url,token){return new Promise((resolveResult,reject)=>{
 const request=get(new URL('/api/bootstrap',url),{headers:{Authorization:'Bearer '+token},timeout:5000},response=>{
  if(response.statusCode!==200){response.resume();reject(Object.assign(new Error('The original authenticated operator is not ready.'),{code:'PRINCIPAL_APPLICATION_NOT_READY'}));return;}
  let size=0;const chunks=[];response.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024)response.destroy(Error('Principal startup response is too large.'));else chunks.push(chunk);});
  response.on('error',reject);response.on('end',()=>{try{resolveResult(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(error){reject(error);}});
 });request.on('error',reject);request.on('timeout',()=>request.destroy(Error('Principal startup check timed out.')));
});}
export async function principalStartup(request,text){
 if(request.command!=='principal-protocol'||request.args?.[0]!=='launch'||typeof text!=='string'||text.length>16384)return null;
 let ready;try{ready=JSON.parse(text);}catch{return null;}
 if(ready?.schema!==PRODUCT_SCHEMA+'.startup')return null;
 const selected=selectedArguments(request.args),url=new URL(ready.url);
 requireValue(ready.state==='LISTENING'&&ready.directory===resolve(selected.workspace)&&ready.workspaceId===selected['expected-workspace-id']&&ready.apiSha256===selected['expected-api-sha256']&&ready.sourceManifestSha256===selected['expected-source-sha256'],'PRINCIPAL_APPLICATION_BINDING_CHANGED');
 requireValue(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash&&/^[1-9]\d*$/.test(url.port)&&Number(url.port)<=65535&&(!selected.port||Number(url.port)===selected.port),'PRINCIPAL_APPLICATION_URL_CHANGED');
 const token=await privateToken(selected['token-file'],selected['expected-token-sha256']),live=await bootstrap(url,token.token);
 requireValue(live.workspace?.id===ready.workspaceId&&live.capabilities?.apiSha256===ready.apiSha256&&live.capabilities?.sourceEdition===ready.sourceEdition,'PRINCIPAL_APPLICATION_OWNER_CHANGED');
 url.hash=new URLSearchParams({token:token.token}).toString();
 return {url:url.href,workspaceId:ready.workspaceId,original:{schema:ready.schema,directory:ready.directory,workspaceId:ready.workspaceId,apiSha256:ready.apiSha256,sourceEdition:ready.sourceEdition,sourceManifestSha256:ready.sourceManifestSha256}};
}
