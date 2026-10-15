#!/usr/bin/env node
// MIT. Source-owned native workspace entry and attachment to the Applications writer.
import {resolve,join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {initializeStore,openStore} from './host/store.mjs';
import {sessions,core,codec} from './runtime.mjs';
import {readJSON,writeJSON,writeBytes,absolute,json,need} from './host/io.mjs';
import {ImportHostClient} from './host/client.mjs';
import {moduleSources,buildExport} from './host/export.mjs';
import builder from './operator/build.js';
const help='Import-to-host workspace\n init DIRECTORY LABEL\n course DIRECTORY\n receive DIRECTORY WORKING.json\n inspect DIRECTORY\n session DIRECTORY OUTPUT.json\n request DIRECTORY ORIGINAL_REQUEST.json\n request-status DIRECTORY ORIGINAL_REQUEST.json\n connected DIRECTORY ORIGINAL_REQUEST.json\n connected-status DIRECTORY ORIGINAL_REQUEST.json\n export DIRECTORY EXPECTED_EDITION_SHA OUTPUT.zip\n desk DIRECTORY OUTPUT.html\nClose Applications before standalone writer commands. Connected commands attach to its existing writer. All paths are absolute, physical and owner-private.\n';
export async function main(argv=process.argv.slice(2)){
 const [command,raw,...args]=argv;if(!command||command==='--help'||command==='help'){process.stdout.write(help);return;}
 const directory=absolute(raw);let store,result;
 try{
  if(command==='init'){need(args.length===1,'IMPORT_HOST_ARGS',help);result=await initializeStore(directory,sessions.pack(sessions.create(args[0])));}
  else if(command==='course'){const s=sessions.create('Authored import-to-host receiving course');s.workspace=core.importWorkspace(await readFile(new URL('./examples/complete-authored-workspace.json',import.meta.url),'utf8'));s.drafts.report={kind:'comparison',id:s.workspace.comparisons.at(-1)?.id||'',page:0};s.drafts.view='review';s.actor='Authored receiving operator';result=await initializeStore(directory,sessions.pack(s));}
  else if(command==='receive'){const carrier=(await readJSON(absolute(args[0]))).value;sessions.receive(JSON.stringify(carrier));result=await initializeStore(directory,carrier);}
  else if(command==='connected'||command==='connected-status'){const c=await ImportHostClient.connect(directory);try{const r=(await readJSON(absolute(args[0]))).value;result=await(command==='connected'?c.apply(r):c.requestStatus(r));}finally{await c.close();}}
  else{store=await openStore(directory);
   if(command==='inspect')result=await store.summary();
   else if(command==='request')result=await store.apply((await readJSON(absolute(args[0]))).value);
   else if(command==='request-status')result=await store.requestStatus((await readJSON(absolute(args[0]))).value);
   else if(command==='session')result=await writeJSON(absolute(args[0]),(await store.state()).carrier);
   else if(command==='desk'){const html=builder.buildImportHostDesk(await moduleSources(),codec,(await store.state()).carrier).html;result=await writeBytes(absolute(args[0]),Buffer.from(html));}
   else if(command==='export'){const files=await moduleSources();result=await store.export(args[0],(state,records,editions)=>buildExport(files,state,records,editions));await writeBytes(absolute(args[1]),await readFile(join(directory,'exports',result.fileId+'.zip')));}
   else throw Error(help);
  }
  process.stdout.write(json(result));return result;
 }finally{await store?.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stderr.write(json({error:{code:e.code||'IMPORT_HOST_FAILED',message:e.message}}));process.exitCode=1;});
