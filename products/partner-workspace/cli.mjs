#!/usr/bin/env node
// Apache-2.0. Original partner workbench installation operations.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PartnerInstallation,PARTNER_SOURCE,plain,readPrivateJSON,requestId,selectedPath,partnerError} from './client.mjs';
const usage=[
 'partner-workspace prepare --directory PRIVATE --source-root ORIGINAL --source-manifest SOURCE.json --request-id UUID [--workspace-archive ORIGINAL.zip]',
 'partner-workspace inspect --directory PRIVATE',
 'partner-workspace source --directory PRIVATE --source-root ORIGINAL --source-manifest SOURCE.json',
 'partner-workspace adopt-source --directory PRIVATE --source-root ORIGINAL --source-manifest SOURCE.json --request-id UUID',
 'partner-workspace snapshot --directory PRIVATE --output COMPLETE.zip --request-id UUID',
 'partner-workspace receive --directory NEW_PRIVATE --archive COMPLETE.zip --request-id UUID',
 'partner-workspace export --directory PRIVATE --kind workspace|report|csv --output FILE --request-id UUID',
 'partner-workspace call --directory PRIVATE --operation OPERATION [--arguments PRIVATE.json] [--request-id UUID]',
 'partner-workspace service --directory PRIVATE --ready-file NEW_PRIVATE.json [--port PORT]',
 'All commands accept --python ORIGINAL_PYTHON and --native-source COMPLETE_ADAPTER.'
].join('\n');
const common=['directory','python','native-source'],keys={prepare:[...common,'source-root','source-manifest','request-id','workspace-archive'],inspect:common,source:[...common,'source-root','source-manifest'],'adopt-source':[...common,'source-root','source-manifest','request-id'],snapshot:[...common,'output','request-id'],receive:[...common,'archive','request-id'],export:[...common,'kind','output','request-id'],call:[...common,'operation','arguments','request-id'],service:[...common,'ready-file','port']};
function required(input,key){if(!input[key])throw partnerError('USAGE','Select --'+key+'.\n'+usage);return input[key];}
export async function runPartnerCLI(argv){
 const[command,...args]=argv;if(!Object.hasOwn(keys,command))throw partnerError('USAGE',usage);const selected={};
 for(let i=0;i<args.length;i+=2){const key=args[i]?.startsWith('--')?args[i].slice(2):'';if(!keys[command].includes(key)||Object.hasOwn(selected,key)||!args[i+1])throw partnerError('USAGE',usage);selected[key]=args[i+1];}
 const directory=selectedPath(required(selected,'directory')),client=new PartnerInstallation({directory,sourceDirectory:selectedPath(selected['native-source']??PARTNER_SOURCE),python:selectedPath(selected.python??'/usr/bin/python3')});
 const source=()=>({source_root:selectedPath(required(selected,'source-root')),source_manifest:selectedPath(required(selected,'source-manifest'))}),id=()=>requestId(required(selected,'request-id'));
 try{
  if(command==='prepare')return await client.prepare({...source(),...(selected['workspace-archive']?{workspace_archive:selectedPath(selected['workspace-archive'])}:{})},id());
  if(command==='inspect')return await client.inspect();
  if(command==='source')return await client.source(source());
  if(command==='adopt-source')return await client.adoptSource(source(),id());
  if(command==='snapshot')return await client.snapshot(selectedPath(required(selected,'output')),id());
  if(command==='receive')return await client.receive({archive_path:selectedPath(required(selected,'archive'))},id());
  if(command==='export')return await client.export(required(selected,'kind'),selectedPath(required(selected,'output')),id());
  if(command==='call'){const input=selected.arguments?(await readPrivateJSON(selectedPath(selected.arguments))).value:{};if(!plain(input))throw partnerError('USAGE','Use a complete JSON object.');return await client.call(required(selected,'operation'),input,selected['request-id']);}
  const port=selected.port===undefined?0:Number(selected.port);if(!Number.isInteger(port)||port<0||port>65535)throw partnerError('USAGE','Select a local port.');
  const descriptor=(await client.call('commands.describe',{ready_file:selectedPath(required(selected,'ready-file')),port})).result.commands[0];
  return await new Promise((accept,reject)=>{
   const child=spawn(descriptor.executable,descriptor.argv.slice(1),{cwd:descriptor.cwd,env:process.env,shell:false,stdio:'inherit'});
   const forward=signal=>{if(!child.killed)child.kill(signal);},term=()=>forward('SIGTERM'),interrupt=()=>forward('SIGINT');
   process.on('SIGTERM',term);process.on('SIGINT',interrupt);
   const cleanup=()=>{process.off('SIGTERM',term);process.off('SIGINT',interrupt);};
   child.once('error',error=>{cleanup();reject(error);});child.once('close',(code,signal)=>{cleanup();if(code!==0||signal)reject(partnerError('PARTNER_SERVICE_EXIT','The original service ended: '+(signal??code)));else accept({stopped:true});});
  });
 }finally{await client.close();}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===selectedPath(process.argv[1])){
 try{const result=await runPartnerCLI(process.argv.slice(2));if(result)process.stdout.write(JSON.stringify(result,null,2)+'\n');}
 catch(error){process.stderr.write(error.message+'\n');process.exitCode=2;}
}
