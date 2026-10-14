#!/usr/bin/env node
// MIT. Applications owns the original CRM listener and its writer lifetime.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {absolute,need} from './host/io.mjs';
import {startServer,startup} from './host/server.mjs';
export function managedOptions(argv){
 const v={};for(let i=0;i<argv.length;i+=2){need(['--workspace','--workspace-id','--port'].includes(argv[i])&&!Object.hasOwn(v,argv[i])&&typeof argv[i+1]==='string','CRM_ARGS','Use each documented option once.');v[argv[i]]=argv[i+1];}
 need(/^\d+$/.test(v['--port']??'0')&&Number(v['--port']??0)<=65535,'CRM_PORT','Choose port 0–65535.');
 return {directory:absolute(v['--workspace']),workspaceId:v['--workspace-id'],port:Number(v['--port']??0)};
}
export async function main(argv=process.argv.slice(2)){
 if(!argv.length||argv.includes('--help')){process.stdout.write('CRM managed application\ncrm-managed --workspace /physical/private/crm [--port 0]\nCreate or receive the original workspace with crm-migration first.\n');return;}
 const service=await startServer(managedOptions(argv));let stop;
 try{process.stdout.write(JSON.stringify(startup(service))+'\n');
 await new Promise((resolve,reject)=>{let closing=false;stop=async()=>{if(closing)return;closing=true;try{await service.close();resolve();}catch(e){reject(e);}};process.once('SIGINT',stop);process.once('SIGTERM',stop);});
 }finally{if(stop){process.off('SIGINT',stop);process.off('SIGTERM',stop);}await service.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stderr.write(JSON.stringify({error:{code:e.code||'CRM_FAILED',message:e.message}})+'\n');process.exitCode=1;});
