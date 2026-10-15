#!/usr/bin/env node
// MIT. Applications owns the original Recurring Route Study Desk listener and its writer lifetime.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {absolute,need} from './host/io.mjs';
import {startServer,startup} from './host/server.mjs';
import {join} from 'node:path';
import {readJSON} from './host/io.mjs';
import {initializeStore} from './host/store.mjs';
import {sessions} from './runtime.mjs';
export function managedOptions(argv){
 const v={};for(let i=0;i<argv.length;i+=2){need(['--workspace','--installation-id','--port','--new-label'].includes(argv[i])&&!Object.hasOwn(v,argv[i])&&typeof argv[i+1]==='string','RECURRINGROUTE_ARGS','Use each documented option once.');v[argv[i]]=argv[i+1];}
 need(/^\d+$/.test(v['--port']??'0')&&Number(v['--port']??0)<=65535,'RECURRINGROUTE_PORT','Choose port 0–65535.');
 need(v['--new-label']===undefined||v['--new-label'].trim()===v['--new-label']&&v['--new-label'].length>0&&v['--new-label'].length<=240,'RECURRINGROUTE_LABEL','Choose a readable new-workspace label.');
 return {newLabel:v['--new-label'],directory:absolute(v['--workspace']),installationId:v['--installation-id'],port:Number(v['--port']??0)};
}
export async function main(argv=process.argv.slice(2)){
 if(!argv.length||argv.includes('--help')){process.stdout.write('Recurring Route Study Desk managed application\nrecurringroute-managed --workspace /physical/private/recurringroute [--new-label "Project label"] [--port 0]\nUse --new-label to create an unused workspace; existing saved sessions resume. Receive a portable working file with recurringroute-workspace receive.\n');return;}
 const options=managedOptions(argv);
 if(options.newLabel){let existing;try{existing=(await readJSON(join(options.directory,'state.json'))).value;}catch(e){if(e.code!=='ENOENT')throw e;}if(!existing)await initializeStore(options.directory,sessions.pack(sessions.create(options.newLabel)),options.installationId);}
 const service=await startServer(options);let stop;
 try{process.stdout.write(JSON.stringify(startup(service))+'\n');
 await new Promise((resolve,reject)=>{let closing=false;stop=async()=>{if(closing)return;closing=true;try{await service.close();resolve();}catch(e){reject(e);}};process.once('SIGINT',stop);process.once('SIGTERM',stop);});
 }finally{if(stop){process.off('SIGINT',stop);process.off('SIGTERM',stop);}await service.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stderr.write(JSON.stringify({error:{code:e.code||'RECURRINGROUTE_FAILED',message:e.message}})+'\n');process.exitCode=1;});
