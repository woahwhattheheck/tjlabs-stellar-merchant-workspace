#!/usr/bin/env node
// MIT. Source-owned native workspace entry and attachment to the Applications writer.
import {resolve,join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {initializeStore,openStore} from './host/store.mjs';
import {sessions,core,codec,sourceArtifact} from './runtime.mjs';
import {readJSON,readBytes,writeJSON,writeBytes,absolute,json,need} from './host/io.mjs';
import {OrkyoClient} from './host/client.mjs';
import {moduleSources,buildExport} from './host/export.mjs';
import {buildOrkyoDesk} from './desk/build.mjs';
const help='Orkyo import readiness workspace\n init DIRECTORY LABEL\n course DIRECTORY\n receive DIRECTORY WORKING.json\n inspect DIRECTORY\n session DIRECTORY OUTPUT.json\n request DIRECTORY ORIGINAL_REQUEST.json\n request-status DIRECTORY ORIGINAL_REQUEST.json\n ingest DIRECTORY INTAKE_META.json ORIGINAL_FILE ORIGINAL_REQUEST_OUTPUT.json\n connected DIRECTORY ORIGINAL_REQUEST.json\n connected-status DIRECTORY ORIGINAL_REQUEST.json\n export DIRECTORY EXPECTED_EDITION_SHA OUTPUT.zip\n desk DIRECTORY OUTPUT.html\nClose Applications before standalone writer commands. Connected commands attach to its existing writer. All paths are absolute, physical and owner-private.\n';
export async function main(argv=process.argv.slice(2)){
 const [command,raw,...args]=argv;if(!command||command==='--help'||command==='help'){process.stdout.write(help);return;}
 const directory=absolute(raw);let store,result;
 try{
  if(command==='init'){need(args.length===1,'ORKYO_ARGS',help);result=await initializeStore(directory,sessions.pack(sessions.create(args[0])));}
  else if(command==='course'){const w=core.reopen(JSON.parse(await readFile(new URL('./examples/authored-desk-workspace.json',import.meta.url),'utf8'))).workspace,s=sessions.fromCopy(sessions.blankCopy(w),{actor:'Authored receiving operator'});s.draft.copy.ui.activeTab='batches-tab';result=await initializeStore(directory,sessions.pack(s));}
  else if(command==='receive'){const input=(await readJSON(absolute(args[0]))).value;const carrier=input.schema===core.SCHEMA?sessions.pack(sessions.fromCopy(sessions.blankCopy(core.reopen(input).workspace))):input.schema==='tjlabs.orkyo-desk-copy.v1'?sessions.pack(sessions.fromCopy(input)):input;sessions.receive(JSON.stringify(carrier));result=await initializeStore(directory,carrier);}
  else if(command==='connected'||command==='connected-status'){const c=await OrkyoClient.connect(directory);try{const r=(await readJSON(absolute(args[0]))).value;result=await(command==='connected'?c.apply(r):c.requestStatus(r));}finally{await c.close();}}
  else{store=await openStore(directory);
   if(command==='inspect')result=await store.summary();
   else if(command==='request')result=await store.apply((await readJSON(absolute(args[0]))).value);
   else if(command==='ingest'){
    need(args.length===3,'ORKYO_ARGS',help);const r=(await readJSON(absolute(args[0]))).value,original=await readBytes(absolute(args[1]));
    need(r.kind==='action'&&r.operation?.kind==='intake'&&r.operation.payload&&!r.operation.payload.artifact,'ORKYO_INTAKE','Choose original request metadata with intake context and no substituted artifact');
    r.operation.payload.artifact=sourceArtifact(new Uint8Array(original.bytes),args[1].split('/').at(-1),r.operation.payload.kind);
    const retained=await writeJSON(absolute(args[2]),r);result={originalRequest:retained,outcome:await store.apply(r)};
   }
   else if(command==='request-status')result=await store.requestStatus((await readJSON(absolute(args[0]))).value);
   else if(command==='session')result=await writeJSON(absolute(args[0]),(await store.state()).carrier);
   else if(command==='desk'){const html=buildOrkyoDesk(await moduleSources(),{carrier:(await store.state()).carrier});result=await writeBytes(absolute(args[0]),Buffer.from(html));}
   else if(command==='export'){const files=await moduleSources();result=await store.export(args[0],(state,records,editions)=>buildExport(files,state,records,editions));await writeBytes(absolute(args[1]),await readFile(join(directory,'exports',result.fileId+'.zip')));}
   else throw Error(help);
  }
  process.stdout.write(json(result));return result;
 }finally{await store?.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stderr.write(json({error:{code:e.code||'ORKYO_FAILED',message:e.message}}));process.exitCode=1;});
