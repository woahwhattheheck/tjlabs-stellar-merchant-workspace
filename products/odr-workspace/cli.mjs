#!/usr/bin/env node
// Apache-2.0. Original odr workbench installation operations.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {OdrInstallation,ODR_SOURCE,plain,readPrivateJSON,requestId,selectedPath,odrError} from './client.mjs';
const usage=[
 'odr-workspace prepare --directory PRIVATE --application APPLICATION_SOURCE.json --request-id UUID [--handover ORIGINAL.json]',
 'odr-workspace inspect --directory PRIVATE',
 'odr-workspace source --directory PRIVATE --application APPLICATION_SOURCE.json',
 'odr-workspace adopt-source --directory PRIVATE --application APPLICATION_SOURCE.json --request-id UUID',
 'odr-workspace snapshot --directory PRIVATE --output COMPLETE.zip --request-id UUID',
 'odr-workspace receive --directory NEW_PRIVATE --archive COMPLETE.zip --request-id UUID',
 'odr-workspace export --directory PRIVATE --kind workspace|report|application --output FILE --request-id UUID',
 'odr-workspace call --directory PRIVATE --operation OPERATION [--arguments PRIVATE.json] [--request-id UUID]',
 'odr-workspace service --directory PRIVATE --ready-file NEW_PRIVATE.json [--port PORT]',
 'Prepare and receive require --node NODE. All commands accept --python ORIGINAL_PYTHON and --native-source COMPLETE_ADAPTER.'
].join('\n');
const common=['directory','python','native-source'],keys={prepare:[...common,'application','request-id','handover','node'],inspect:common,source:[...common,'application'],'adopt-source':[...common,'application','request-id'],snapshot:[...common,'output','request-id'],receive:[...common,'archive','request-id','node'],export:[...common,'kind','output','request-id'],call:[...common,'operation','arguments','request-id'],service:[...common,'ready-file','port']};
function required(input,key){if(!input[key])throw odrError('USAGE','Select --'+key+'.\n'+usage);return input[key];}
export async function runOdrCLI(argv){
 const[command,...args]=argv;if(!Object.hasOwn(keys,command))throw odrError('USAGE',usage);const selected={};
 for(let i=0;i<args.length;i+=2){const key=args[i]?.startsWith('--')?args[i].slice(2):'';if(!keys[command].includes(key)||Object.hasOwn(selected,key)||!args[i+1])throw odrError('USAGE',usage);selected[key]=args[i+1];}
 const directory=selectedPath(required(selected,'directory')),client=new OdrInstallation({directory,sourceDirectory:selectedPath(selected['native-source']??ODR_SOURCE),python:selectedPath(selected.python??'/usr/bin/python3')});
 const source=()=>({application:selectedPath(required(selected,'application'))}),id=()=>requestId(required(selected,'request-id'));
 try{
  if(command==='prepare')return await client.prepare({...source(),node:selectedPath(required(selected,'node')),python:client.selection.python,...(selected.handover?{handover:selectedPath(selected.handover)}:{})},id());
  if(command==='inspect')return await client.inspect();
  if(command==='source')return await client.source(source());
  if(command==='adopt-source')return await client.adoptSource(source(),id());
  if(command==='snapshot')return await client.snapshot(selectedPath(required(selected,'output')),id());
  if(command==='receive')return await client.receive({archive_path:selectedPath(required(selected,'archive')),node:selectedPath(required(selected,'node')),python:client.selection.python},id());
  if(command==='export')return await client.export(required(selected,'kind'),selectedPath(required(selected,'output')),id());
  if(command==='call'){const input=selected.arguments?(await readPrivateJSON(selectedPath(selected.arguments))).value:{};if(!plain(input))throw odrError('USAGE','Use a complete JSON object.');return await client.call(required(selected,'operation'),input,selected['request-id']);}
  const port=selected.port===undefined?0:Number(selected.port);if(!Number.isInteger(port)||port<0||port>65535)throw odrError('USAGE','Select a local port.');
  const descriptor=(await client.call('commands.describe',{ready_file:selectedPath(required(selected,'ready-file')),port})).result.commands[0];
  return await new Promise((accept,reject)=>{
   const child=spawn(descriptor.executable,descriptor.argv.slice(1),{cwd:descriptor.cwd,env:process.env,shell:false,stdio:'inherit'});
   const forward=signal=>{if(!child.killed)child.kill(signal);},term=()=>forward('SIGTERM'),interrupt=()=>forward('SIGINT');
   process.on('SIGTERM',term);process.on('SIGINT',interrupt);
   const cleanup=()=>{process.off('SIGTERM',term);process.off('SIGINT',interrupt);};
   child.once('error',error=>{cleanup();reject(error);});child.once('close',(code,signal)=>{cleanup();if(code!==0||signal)reject(odrError('ODR_SERVICE_EXIT','The original service ended: '+(signal??code)));else accept({stopped:true});});
  });
 }finally{await client.close();}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===selectedPath(process.argv[1])){
 try{const result=await runOdrCLI(process.argv.slice(2));if(result)process.stdout.write(JSON.stringify(result,null,2)+'\n');}
 catch(error){process.stderr.write(error.message+'\n');process.exitCode=2;}
}
