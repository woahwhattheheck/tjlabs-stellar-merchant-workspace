// MIT. Original Applications review binds one saved project and its actual listener.
import {readFile,realpath,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {APPLICATION_PROVIDER_SCHEMA,applicationPreparation,observeApplicationStartup} from '../../distribution/runtime-workspace/application-provider.mjs';
import {need} from './client.mjs';
export const NETCDF_APPLICATION_ID='netcdf-workspace';
export const NETCDF_STARTUP_SCHEMA='stellar-forge.netcdf-startup.v1';
export async function readWorkspaceBinding(directory){
  directory=await realpath(directory);
  const state=JSON.parse(await readFile(join(directory,'workspace.json'),'utf8'));
  need(state.schema==='stellar-forge.netcdf-workspace.v1'&&typeof state.project?.id==='string','NETCDF_WORKSPACE_CHANGED');
  const value={directory,project_id:state.project.id,schema:'stellar-forge.netcdf-binding.v1'};
  return {...value,sha256:createHash('sha256').update(JSON.stringify(value)).digest('hex')};
}
function argument(args,name){const index=args.indexOf(name);return index<0?undefined:args[index+1];}
export async function netCDFApplicationStartup(request,text){
  if(request.command!=='netcdf')return null;
  let announced;try{announced=JSON.parse(text);}catch{return null;}
  if(announced.schema!==NETCDF_STARTUP_SCHEMA||announced.state!=='LISTENING')return null;
  const directory=resolve(argument(request.args,'--workspace')??''),expected=argument(request.args,'--expected-binding-sha256');
  const binding=await readWorkspaceBinding(directory),url=new URL(announced.url);
  need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash&&
    binding.sha256===expected&&announced.binding?.sha256===binding.sha256&&announced.binding.project_id===binding.project_id&&announced.binding.directory===binding.directory&&typeof announced.instanceId==='string',
    'NETCDF_APPLICATION_CHANGED','The original project or listener differs from the reviewed application.');
  const input=request.inputs?.find(value=>value.path===directory&&value.kind==='directory');
  if(input?.exists){const actual=await stat(directory);need(String(actual.dev)===String(input.dev)&&String(actual.ino)===String(input.ino),'NETCDF_APPLICATION_CHANGED');}
  const response=await fetch(new URL('/api/launch',url),{signal:AbortSignal.timeout(10000)});
  need(response.ok,'NETCDF_APPLICATION_STARTUP_FAILED');const live=await response.json();
  need(live.schema===NETCDF_STARTUP_SCHEMA&&live.instanceId===announced.instanceId&&live.binding?.sha256===binding.sha256&&live.url===announced.url,
    'NETCDF_APPLICATION_CHANGED','The actual listener does not match its original startup.');
  return {url:url.href,workspaceId:binding.project_id,original:{schema:NETCDF_STARTUP_SCHEMA,project_id:binding.project_id,sha256:binding.sha256,instanceId:announced.instanceId}};
}
export default {
  schema:APPLICATION_PROVIDER_SCHEMA,id:'netcdf',order:1250,
  catalog({common,field}){return [{id:NETCDF_APPLICATION_ID,command:'netcdf',title:'NetCDF scientific data',terminal:false,
    requiredSource:'stellar/scf-starforge-20261009/sf30-seller-sdk/netcdf/cli.mjs',
    description:'Inspect original scientific arrays, save explicit selections, review complete native results and receive editable projects.',
    fields:[field('workspaceDirectory','Saved scientific workspace','path',true,'Original directory initialized with netcdf create or independently received from a complete project.'),
      field('receiveRoot','Project receiving directory','path',false,'Private parent for independently editable received projects.'),
      field('pythonCommand','NetCDF Python runtime','path',false,'Existing Python with the delivered pinned netCDF4, numpy and cftime requirements.'),...common],
  }];},
  async prepare(_type,settings,{inputPath,selectedExecutable}){
    const original=applicationPreparation(settings,inputPath),workspace=await original.path('workspaceDirectory','directory',false,true);
    need(workspace,'NETCDF_DIRECTORY_REQUIRED');const binding=await readWorkspaceBinding(workspace.path);
    if(settings.pythonCommand){
      const python=await selectedExecutable(settings.pythonCommand);
      original.inputs.push(...python.inputs);original.option('--python',python.executable);
    }
    original.option('--workspace',binding.directory);original.args.push('serve');original.option('--expected-binding-sha256',binding.sha256);
    const receive=await original.path('receiveRoot','directory',true,true);
    if(receive){original.option('--receive-root',receive.path);if(!receive.exists)original.createDirectories.push(receive.path);}
    return {args:original.args,inputs:original.inputs,createDirectories:original.createDirectories};
  },
  matchRequest(request){return !request.pythonCommand&&request.command==='netcdf';},
  createObserver(request,directory){return observeApplicationStartup(request,directory,text=>{
    if(!text.startsWith('{')||!text.includes(NETCDF_STARTUP_SCHEMA))return null;
    return ()=>netCDFApplicationStartup(request,text);
  });},
};
