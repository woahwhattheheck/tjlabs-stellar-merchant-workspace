// MIT. Original project lifecycle registered with the maintained Applications owner.
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {get} from 'node:http';
import {inspectMerchantRuntime} from '../../sf46-release/runtime-package.mjs';
import {APPLICATION_PROVIDER_SCHEMA,applicationField as field,observeApplicationStartup} from '../../distribution/runtime-workspace/application-provider.mjs';
import {ensure} from './client.mjs';
const ROOT='stellar/scf-starforge-20261009/sf30-seller-sdk/dbt-artifacts/';
const STARTUP='stellar-forge.dbt-workspace-startup.v1';
const files=['cli.mjs','cli.py','client.mjs','dbt_core.py','dbt_store.py','dbt_portable.py','dbt_http.py','operations.py','ui/index.html','ui/app.js','ui/sha256.js','ui/style.css'];
export function dbtApplication(common=[]){return {id:'dbt-projects',command:'dbt-project',title:'dbt project operations',terminal:false,
 requiredSource:ROOT+'cli.mjs',description:'Inspect original manifests, lineage, run and freshness outcomes; compare editions, retain review decisions and reopen complete editable project transfers.',
 fields:[field('workspaceDirectory','Original dbt project','path',true,'Select an initialized private project, including an independently received project.'),
 field('sourcePython','Python executable','path',false,'Python 3.10+; defaults to /usr/bin/python3. No dbt installation is needed for artifact review.'),
 field('tokenFile','Private browser key file','path',false,'Existing private 32-character-or-longer key; otherwise created inside the original project.'),
 field('receiveRoot','Receiving parent directory','path',false,'Existing private parent for create-only editable receiving.'),...common]};}
export async function prepareDbtApplication(settings,{inputPath,runtimeDirectory}){
 const runtime=await inspectMerchantRuntime(resolve(runtimeDirectory),{load:false,source:false});
 const project=await inputPath(settings.workspaceDirectory,'directory',false,true);
 const python=await inputPath(settings.sourcePython??'/usr/bin/python3','file');
 const inputs=[project,python];for(const file of files)inputs.push(await inputPath(join(runtime.sourceRoot,ROOT+file),'file'));
 const native=await import(pathToFileURL(join(runtime.sourceRoot,ROOT+'client.mjs')).href);
 const client=new native.DbtProjectClient({directory:project.path,python:python.path});let binding;
 try{binding=await client.invoke('binding');}finally{await client.close();}
 ensure(binding?.schema==='stellar-forge.dbt-project-binding.v1'&&binding.directory===project.path&&/^[a-f0-9]{64}$/.test(binding.sha256),'DBT_APPLICATION_BINDING_CHANGED');
 const args=['serve','--project',project.path,'--python',python.path,'--expected-binding-sha256',binding.sha256];
 for(const [key,flag,kind]of [['tokenFile','--token-file','file'],['receiveRoot','--receive-root','directory']])if(settings[key]){const input=await inputPath(settings[key],kind,false,true);inputs.push(input);args.push(flag,input.path);}
 return {args,inputs,createDirectories:[]};
}
function argument(request,name,required=true){const positions=request.args.flatMap((v,i)=>v===name?[i]:[]);if(!positions.length&&!required)return undefined;ensure(positions.length===1&&typeof request.args[positions[0]+1]==='string','DBT_APPLICATION_ARGUMENT_CHANGED');return request.args[positions[0]+1];}
function loopback(value){const url=new URL(value);ensure(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&Number(url.port)<=65535&&!url.username&&!url.password&&!url.search&&!url.hash,'DBT_APPLICATION_URL_INVALID');return url;}
function liveReady(url){return new Promise((resolveResult,reject)=>{const request=get(new URL('/api/launch',url),{timeout:5000},response=>{const parts=[];let bytes=0;if(response.statusCode!==200){response.resume();reject(Error('DBT_APPLICATION_NOT_READY'));return;}response.on('data',chunk=>{bytes+=chunk.length;if(bytes>16384)response.destroy(Error('DBT_APPLICATION_STARTUP_TOO_LARGE'));else parts.push(chunk);});response.on('error',reject);response.on('end',()=>{try{resolveResult(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch(error){reject(error);}});});request.on('error',reject);request.on('timeout',()=>request.destroy(Error('DBT_APPLICATION_TIMEOUT')));});}
export async function dbtStartup(request,text){
 if(request.command!=='dbt-project'||!Array.isArray(request.args)||request.args[0]!=='serve'||typeof text!=='string'||text.length>16384||!text.startsWith('{'))return null;
 let ready;try{ready=JSON.parse(text);}catch{return null;}if(ready?.schema!==STARTUP||ready.state!=='LISTENING')return null;
 const directory=resolve(argument(request,'--project')),expected=argument(request,'--expected-binding-sha256'),port=argument(request,'--port',false)??'0';
 ensure(/^[a-f0-9]{64}$/.test(expected)&&/^(0|[1-9]\d*)$/.test(port)&&Number(port)<=65535&&ready.binding?.directory===directory&&ready.binding?.sha256===expected&&/^[a-f0-9-]{36}$/.test(ready.binding?.projectId??'')&&/^[a-f0-9-]{36}$/.test(ready.instanceId??''),'DBT_APPLICATION_STARTUP_CHANGED');
 const url=loopback(ready.url);ensure(port==='0'||Number(port)===Number(url.port),'DBT_APPLICATION_PORT_CHANGED');
 const live=await liveReady(url);ensure(live?.schema===STARTUP&&live.state==='LISTENING'&&live.instanceId===ready.instanceId&&live.binding?.sha256===expected&&live.binding?.directory===directory&&live.binding?.projectId===ready.binding.projectId&&live.url===ready.url,'DBT_APPLICATION_OWNER_CHANGED');
 return {url:url.href,original:{schema:STARTUP,directory,projectId:live.binding.projectId,bindingSha256:expected,instanceId:live.instanceId,startedAt:live.startedAt}};
}
export default {schema:APPLICATION_PROVIDER_SCHEMA,id:'dbt-projects',order:412,
 catalog({common}){return [dbtApplication(common)];},prepare(type,settings,context){return prepareDbtApplication(settings,context);},
 matchRequest(request){return !request.pythonCommand&&request.command==='dbt-project';},
 createObserver(request,directory){return observeApplicationStartup(request,directory,text=>text.startsWith('{')&&text.includes('"schema":"'+STARTUP+'"')?()=>dbtStartup(request,text):null);}};
