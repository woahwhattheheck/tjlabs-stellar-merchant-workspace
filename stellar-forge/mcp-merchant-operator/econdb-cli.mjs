#!/usr/bin/env node
// MIT. Same Merchant tool calls and maintained complete Econdb receiving.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openMerchantFileClient} from './retained-download.mjs';
import {downloadEcondbHandover,inspectEcondbHandover,receiveEcondbHandover} from './econdb-download.mjs';
import {initializeEcondbWorkspaceMerchant} from './econdb-workspace.mjs';
export async function main(argv=process.argv.slice(2)){
 const[command,...rest]=argv,flags={};
 for(let i=0;i<rest.length;i++){const k=rest[i];if(!/^--[a-z-]+$/.test(k)||Object.hasOwn(flags,k)||i+1===rest.length||rest[i+1].startsWith('--'))throw Error('Use each documented option once with its value.');flags[k]=rest[++i];}
 const allowed={init:['directory','connection','name'],call:['url','token-env','tool','arguments'],inspect:['url','token-env','workspace','workspace-id','export-id'],download:['url','token-env','workspace','workspace-id','export-id','directory','manifest-sha256'],receive:['directory','destination']};
 if(!allowed[command]||Object.keys(flags).some(k=>!allowed[command].includes(k.slice(2))))throw Error('Use init, call, inspect, download or receive; see ECONDB_WORKSPACE.md.');
 const require=(...names)=>{for(const n of names)if(!flags['--'+n])throw Error('Supply --'+n);};
 let result;
 if(command==='init'){require('directory','connection');result=await initializeEcondbWorkspaceMerchant({directory:resolve(flags['--directory']),connection:resolve(flags['--connection']),name:flags['--name']});}
 else if(command==='receive'){require('directory','destination');result=await receiveEcondbHandover({directory:resolve(flags['--directory']),destination:resolve(flags['--destination'])});}
 else{
  require('url');const common={url:flags['--url'],tokenEnv:flags['--token-env']??'MCP_ACCESS_TOKEN'};
  if(command==='call'){require('tool','arguments');if(!flags['--tool'].startsWith('merchant_econdb_'))throw Error('Select an Econdb tool from the actual Merchant catalogue.');
   const args=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readFile(resolve(flags['--arguments']))));result=await(await openMerchantFileClient(common)).call(flags['--tool'],args);
  }else{
   require('workspace','workspace-id','export-id');const options={...common,workspace:flags['--workspace'],workspaceId:flags['--workspace-id'],exportId:flags['--export-id']};
   if(command==='download'){require('directory','manifest-sha256');result=await downloadEcondbHandover({...options,directory:resolve(flags['--directory']),expectedManifestSha256:flags['--manifest-sha256']});}
   else result=await inspectEcondbHandover(options);
  }
 }
 process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{process.stderr.write(JSON.stringify({error:e.message,code:e.code??'ECONDB_MCP'})+'\n');process.exitCode=1;});
