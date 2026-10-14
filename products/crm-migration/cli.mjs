#!/usr/bin/env node
// MIT. Native actions and Applications use one shared original CRM operation writer.
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import runtime from './runtime/crm-runtime.cjs';
import {readFile} from 'node:fs/promises';
import {initializeStore,openStore} from './host/store.mjs';
import {readJSON,writeJSON,writeBytes,absolute,json,need} from './host/io.mjs';
import {CrmClient} from './host/client.mjs';
import {moduleSources} from './host/server.mjs';
import renderer from './browser/render-desk.cjs';
const help='CRM migration\n  init DIRECTORY ID TITLE\n  course DIRECTORY\n  receive DIRECTORY WORKSPACE.json\n  inspect DIRECTORY\n  apply DIRECTORY OPERATION.json\n  export DIRECTORY EXPECTED_SHA OUTPUT.zip\n  workspace DIRECTORY OUTPUT.json\n  desk DIRECTORY OUTPUT.html\n  connected DIRECTORY OPERATION.json\nAll supplied paths are absolute physical host paths. Close Applications before standalone writes; connected uses its existing listener.\n';
export async function main(argv=process.argv.slice(2)){
 const [command,raw,...args]=argv;if(!command||['help','--help'].includes(command)){process.stdout.write(help);return;}
 const directory=absolute(raw);let result,store;
 try{
 if(command==='init'){need(args.length===2,'CRM_ARGS',help);result=await initializeStore(directory,runtime.workspace.archive(runtime.workspace.create(args[0],args[1])));}
 else if(command==='course'){const archive=JSON.parse(await readFile(new URL('./examples/receiving-course.workspace.json',import.meta.url),'utf8'));result=await initializeStore(directory,archive);}
 else if(command==='receive'){result=await initializeStore(directory,(await readJSON(absolute(args[0]))).value);}
 else if(command==='connected'){const client=await CrmClient.connect(directory);try{result=await client.apply((await readJSON(absolute(args[0]))).value);}finally{await client.close();}}
 else{store=await openStore(directory);
 if(command==='inspect')result=await store.summary();
 else if(command==='apply')result=await store.action((await readJSON(absolute(args[0]))).value);
 else if(command==='export'){result=await store.export(args[0]);const source=join(directory,'exports',result.fileId+'.zip');const bytes=await readFile(source);await writeBytes(absolute(args[1]),bytes);}
 else if(command==='workspace'){const archive=await store.state();result=await writeJSON(absolute(args[0]),archive);}
 else if(command==='desk'){const archive=await store.state(),html=renderer.renderDesk(await moduleSources(),archive);result=await writeBytes(absolute(args[0]),Buffer.from(html));}
 else throw Error(help);}
 process.stdout.write(json(result));return result;
 }finally{await store?.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stderr.write(json({error:{code:e.code||'CRM_FAILED',message:e.message}}));process.exitCode=1;});
