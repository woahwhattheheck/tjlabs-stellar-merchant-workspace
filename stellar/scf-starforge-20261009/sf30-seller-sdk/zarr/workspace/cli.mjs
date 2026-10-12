#!/usr/bin/env node
/** Local operator entry; Applications owns this exact command and native lifetime. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ZARR_ROOT,need,safeError,openZarrWorkspace,readZarrConnections,sha,encoded} from './bridge.mjs';
import {startZarrServer} from './server.mjs';
import {inspectZarrLaunchSource,inspectZarrAuthoring,prepareZarrManagedLaunch,zarrManagedStartup,zarrServeOptions} from './launch.mjs';
const text=value=>process.stdout.write(JSON.stringify(value)+'\n');
async function input(){
 let n=0;const parts=[];for await(const part of process.stdin){n+=part.length;need(n<=1024*1024,'ZARR_REQUEST_LIMIT','Use a complete JSON request of at most 1 MiB');parts.push(part);}
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
function options(argv){
 const allowed=new Set(['--directory','--connections','--python','--id','--offset','--limit','--source-directory']),v={};
 for(let i=0;i<argv.length;i++){
  const key=argv[i];need(allowed.has(key)&&!Object.hasOwn(v,key),'ZARR_OPTION','Unknown or repeated option '+key);
  const value=argv[++i];need(typeof value==='string'&&value&&!value.startsWith('--'),'ZARR_OPTION','Retain the value for '+key);v[key]=value;
 }
 return v;
}
export async function zarrWorkspaceMain(argv=process.argv.slice(2)){
 const command=argv[0];
 if(!command||command==='help'||command==='--help'){
  process.stdout.write('Zarr source workspace\n\n'+
   'zarr-workspace init --directory ABS [--python PYTHON]\n'+
   'zarr-workspace serve --directory ABS --connections ABS [--python PYTHON] [--port 8471]\n'+
   'zarr-workspace status|operation|result|frozen --directory ABS [--id ORIGINAL_ID]\n'+
   'zarr-workspace prepare|apply --directory ABS --connections ABS < exact-request.json\n'+
   'zarr-workspace resume|export --directory ABS --id UUID\n'+
   'zarr-workspace receive --directory ABS --connections ABS < receiving-request.json\n'+
   'zarr-workspace inspect-source [--source-directory ABS]\n'+
   'zarr-workspace inspect-workspace --directory ABS [--python PYTHON]\n\n'+
   'The complete WORKSPACE.md describes declared sources, typed results, exact request recovery and installed integrations.\n');
  return;
 }
 if(command==='serve'){
  const selected=zarrServeOptions(argv),launch=await prepareZarrManagedLaunch(selected);
  let service,stop=false,closing=null;
  const close=()=>closing??=(async()=>{if(service)await service.close();})();
  const interrupted=()=>{stop=true;if(service)void close().catch(error=>{process.stderr.write(JSON.stringify(safeError(error))+'\n');process.exitCode=1;});};
  process.on('SIGINT',interrupted);process.on('SIGTERM',interrupted);
  try{
   service=await startZarrServer({...selected,connections:launch.connections,sourceSha256:launch.sourceSha256});
   if(stop){await close();return;}
   const announcement=zarrManagedStartup({launch,service});text(announcement);
   await new Promise((done,fail)=>{service.server.once('close',done);service.server.once('error',fail);});
   await close();
  }finally{await close();process.off('SIGINT',interrupted);process.off('SIGTERM',interrupted);}
  return;
 }
 const v=options(argv.slice(1)),directory=v['--directory']?resolve(v['--directory']):null,
  python=v['--python']??process.env.ZARR_PYTHON??'python3',sourceDirectory=resolve(v['--source-directory']??ZARR_ROOT);
 if(command==='inspect-source'){text(await inspectZarrLaunchSource(sourceDirectory));return;}
 need(directory,'ZARR_DIRECTORY','Select the original workspace directory');
 if(command==='inspect-workspace'){text(await inspectZarrAuthoring(directory,{python,sourceDirectory}));return;}
 need(['init','status','operation','result','frozen','prepare','apply','resume','export','receive'].includes(command),'ZARR_COMMAND','Choose an original documented workspace command');
 const connections=v['--connections']?await readZarrConnections(resolve(v['--connections'])):{inputs:[],destinations:[],sha256:sha(encoded(null))};
 if(['prepare','apply','receive'].includes(command))need(v['--connections'],'ZARR_CONNECTIONS','Select the same original host connections declaration');
 const workspace=await openZarrWorkspace({directory,python,sourceDirectory,connections,create:command==='init'});
 try{
  let value;
  switch(command){
   case 'init':case 'status':value=await workspace.status();break;
   case 'operation':value=await workspace.operation(v['--id']);break;
   case 'result':value=await workspace.result(v['--id'],Number(v['--offset']??0),Number(v['--limit']??100));break;
   case 'frozen':value=await workspace.frozen(v['--id']);break;
   case 'prepare':value=await workspace.prepare(await input());break;
   case 'apply':value=await workspace.apply(await input());break;
   case 'resume':value=await workspace.resume(v['--id']);break;
   case 'export':value=await workspace.export(v['--id']);break;
   case 'receive':value=await workspace.receive(await input());break;
  }
  text(value);
 }finally{await workspace.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 zarrWorkspaceMain().catch(error=>{process.stderr.write(JSON.stringify(safeError(error))+'\n');process.exitCode=1;});
}
