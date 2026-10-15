#!/usr/bin/env node
// MIT. Source-owned native workspace entry and attachment to the Applications writer.
import {resolve,join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {initializeStore,openStore} from './host/store.mjs';
import {sessions,core,originalSessions,codec} from './runtime.mjs';
import {readJSON,readBytes,writeJSON,writeBytes,absolute,json,need} from './host/io.mjs';
import {ConstructionProgressStudyClient} from './host/client.mjs';
import {moduleSources,buildExport} from './host/export.mjs';
import {buildConstructionProgressStudyDesk} from './src/build-installed.mjs';
const help='Construction Progress Study Desk workspace\n init DIRECTORY LABEL\n course DIRECTORY\n receive DIRECTORY WORKING.json\n inspect DIRECTORY\n session DIRECTORY OUTPUT.json\n request DIRECTORY ORIGINAL_REQUEST.json\n request-status DIRECTORY ORIGINAL_REQUEST.json\n ingest DIRECTORY INTAKE_META.json ORIGINAL_FILE ORIGINAL_REQUEST_OUTPUT.json\n connected DIRECTORY ORIGINAL_REQUEST.json\n connected-status DIRECTORY ORIGINAL_REQUEST.json\n export DIRECTORY EXPECTED_EDITION_SHA OUTPUT.zip\n desk DIRECTORY OUTPUT.html\nClose Applications before standalone writer commands. Connected commands attach to its existing writer. All paths are absolute, physical and owner-private.\n';
export async function main(argv=process.argv.slice(2)){
 const [command,raw,...args]=argv;if(!command||command==='--help'||command==='help'){process.stdout.write(help);return;}
 const directory=absolute(raw);let store,result;
 try{
  if(command==='init'){need(args.length===1,'CONSTRUCTION_ARGS',help);result=await initializeStore(directory,sessions.pack(sessions.create(args[0])));}
  else if(command==='course'){const s=sessions.fromSession(originalSessions.create(JSON.parse(await readFile(new URL('./examples/complete.study.json',import.meta.url),'utf8'))));s.draft.actor='Authored receiving operator';result=await initializeStore(directory,sessions.pack(s));}
  else if(command==='receive'){const received=sessions.receive((await readFile(absolute(args[0]),'utf8')));result=await initializeStore(directory,sessions.pack(received));}
  else if(command==='connected'||command==='connected-status'){const c=await ConstructionProgressStudyClient.connect(directory);try{const r=(await readJSON(absolute(args[0]))).value;result=await(command==='connected'?c.apply(r):c.requestStatus(r));}finally{await c.close();}}
  else{store=await openStore(directory);
   if(command==='inspect')result=await store.summary();
   else if(command==='request')result=await store.apply((await readJSON(absolute(args[0]))).value);
   else if(command==='ingest'){
    need(args.length===3,'CONSTRUCTION_ARGS',help);const r=(await readJSON(absolute(args[0]))).value,op=r.operation;
    need(r.kind==='action'&&op&&['import','document'].includes(op.kind)&&op.payload?.originalSha256,'CONSTRUCTION_INTAKE','Choose an original action request with pinned file metadata.');
    const original=await readBytes(absolute(args[1]));need(original.sha256===op.payload.originalSha256,'CONSTRUCTION_INPUT_CHANGED','Choose the exact declared original file.');delete op.payload.originalSha256;
    if(op.kind==='document')op.payload.contentBase64=original.bytes.toString('base64');
    else{const text=codec.utf8Decode(original.bytes);need(codec.toBase64(codec.utf8Encode(text))===codec.toBase64(original.bytes),'CONSTRUCTION_UTF8','Choose exact UTF-8 source bytes');op.payload.content=text;}
    const retained=await writeJSON(absolute(args[2]),r);result={originalRequest:retained,outcome:await store.apply(r)};
   }
   else if(command==='request-status')result=await store.requestStatus((await readJSON(absolute(args[0]))).value);
   else if(command==='session')result=await writeJSON(absolute(args[0]),(await store.state()).carrier);
   else if(command==='desk'){const html=buildConstructionProgressStudyDesk(await moduleSources(),{carrier:(await store.state()).carrier});result=await writeBytes(absolute(args[0]),Buffer.from(html));}
   else if(command==='export'){const files=await moduleSources();result=await store.export(args[0],(state,records,editions)=>buildExport(files,state,records,editions));await writeBytes(absolute(args[1]),await readFile(join(directory,'exports',result.fileId+'.zip')));}
   else throw Error(help);
  }
  process.stdout.write(json(result));return result;
 }finally{await store?.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stderr.write(json({error:{code:e.code||'CONSTRUCTION_FAILED',message:e.message}}));process.exitCode=1;});
