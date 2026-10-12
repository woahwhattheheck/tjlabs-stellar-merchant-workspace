// MIT. Product-owned adapter; the maintained Applications runtime owns launch/stop.
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {get} from 'node:http';
import {APPLICATION_PROVIDER_SCHEMA,observeApplicationStartup} from '../../distribution/runtime-workspace/application-provider.mjs';
import {BlendClient,ensure} from './client.mjs';
const ROOT='stellar/scf-starforge-20261009/sf30-seller-sdk/data-blends/';
const PREFIX='Private data-blending workspace: ';
const STARTUP='stellar-forge.data-blends-startup.v1';
const files=['cli.mjs','cli.py','engine.py','server.py','client.mjs','ui/index.html','ui/app.js','ui/style.css'];
export function blendApplication(common,field){return {id:'data-blends',command:'data-blend',title:'Saved data blending',terminal:false,
 requiredSource:ROOT+'cli.mjs',description:'Retain CSV inputs, author explicit multi-source joins, review result editions, deliver selected datasets and reopen private workspaces.',
 fields:[field('workspaceDirectory','Saved data-blending workspace','path',true,'Select an initialized or independently received private workspace.'),
 field('sourcePython','Python executable','path',false,'Python 3.10+ with SQLite 3.39+; defaults to /usr/bin/python3.'),
 field('receiveRoot','Receiving parent directory','path',false,'Existing private parent for new editable workspaces.'),...common]};}
export async function prepareBlendApplication(settings,{inputPath}){
 const project=await inputPath(settings.workspaceDirectory,'directory',false,true);
 const python=await inputPath(settings.sourcePython??'/usr/bin/python3','file');
 const inputs=[project,python];for(const file of files)inputs.push(await inputPath(fileURLToPath(new URL(file,import.meta.url)),'file'));
 const client=new BlendClient({directory:project.path,python:python.path});let binding;
 try{binding=await client.invoke('binding');}finally{await client.close();}
 ensure(binding.directory===project.path&&/^[a-f0-9]{64}$/.test(binding.sha256),'The selected workspace binding changed.');
 const args=['serve','--directory',project.path,'--python',python.path,'--expected-binding-sha256',binding.sha256];
 if(settings.receiveRoot){const receiving=await inputPath(settings.receiveRoot,'directory',false,true);inputs.push(receiving);args.push('--receive-root',receiving.path);}
 return {args,inputs,createDirectories:[]};
}
function argument(request,key){const indices=request.args.flatMap((v,i)=>v===key?[i]:[]);ensure(indices.length===1&&typeof request.args[indices[0]+1]==='string','Application argument changed.');return request.args[indices[0]+1];}
function read(url,token){return new Promise((done,reject)=>{const request=get(url,{headers:token?{Authorization:'Bearer '+token}:{},timeout:5000},response=>{const parts=[];let size=0;if(response.statusCode!==200){response.resume();reject(Error('Original application listener is not ready.'));return;}response.on('data',part=>{size+=part.length;if(size>16*1024*1024)response.destroy(Error('Application response exceeds its complete control ceiling.'));else parts.push(part);});response.on('error',reject);response.on('end',()=>{try{done(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch(error){reject(error);}});});request.on('error',reject);request.on('timeout',()=>request.destroy(Error('Application listener did not respond.')));});}
export async function blendStartup(request,ready,text){
 if(!text.startsWith(PREFIX))return null;
 ensure(request.command==='data-blend'&&request.args?.[0]==='serve'&&ready?.schema===STARTUP&&ready.state==='LISTENING','Unexpected data-blending startup.');
 const url=new URL(text.slice(PREFIX.length)),expected=argument(request,'--expected-binding-sha256'),directory=resolve(argument(request,'--directory'));
 ensure(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&!url.username&&!url.password&&!url.search&&url.pathname==='/'&&/^#[a-f0-9]{64}$/.test(url.hash),'Invalid private application address.');
 ensure(ready.url===url.origin&&ready.binding?.directory===directory&&ready.binding.sha256===expected,'Workspace startup identity changed.');
 const [live,state]=await Promise.all([read(new URL('/api/launch',url)),read(new URL('/api/state?limit=1',url),url.hash.slice(1))]);
 ensure(live.instanceId===ready.instanceId&&live.binding?.sha256===expected&&live.binding?.workspaceId===state.workspace?.id&&live.url===url.origin,'Original application listener changed.');
 return {url:url.href,original:{schema:STARTUP,directory,workspaceId:state.workspace.id,bindingSha256:expected,instanceId:live.instanceId}};
}
export default {schema:APPLICATION_PROVIDER_SCHEMA,id:'data-blends',order:438,
 catalog({common,field}){return [blendApplication(common,field)];},prepare(type,settings,context){return prepareBlendApplication(settings,context);},
 matchRequest(request){return !request.pythonCommand&&request.command==='data-blend'&&request.args?.[0]==='serve';},
 createObserver(request,directory){let ready;return observeApplicationStartup(request,directory,text=>{if(text.startsWith('{')){try{const value=JSON.parse(text);if(value.schema===STARTUP)ready=value;}catch{}}return text.startsWith(PREFIX)?()=>blendStartup(request,ready,text):null;});}
};
