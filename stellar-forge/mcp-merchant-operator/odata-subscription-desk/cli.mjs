#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startCustomerDeskServer} from './server.mjs';
import {openCustomerDesk} from './workspace.mjs';
import {inspectCustomerPacket,receiveCustomerPacket,selectedSource,writeSourceManifest} from './portable.mjs';
const HELP='Subscription customer desk\n\n'+
'  starforge odata-subscription-desk serve --directory DIR --connection FILE [--port 0] [--source-root ROOT --source-manifest FILE]\n'+
'  starforge odata-subscription-desk inspect --directory DIR --connection FILE\n'+
'  starforge odata-subscription-desk action --directory DIR --connection FILE --request FILE [--source-root ROOT --source-manifest FILE]\n'+
'  starforge odata-subscription-desk inspect-package --file FILE\n'+
'  starforge odata-subscription-desk receive-package --file FILE --sha256 SHA --directory RECEIVING_DIR --customer CUSTOMER_DIR\n'+
'  starforge odata-subscription-desk source-manifest --output FILE [--source-root ROOT]\n'+
'  starforge odata-subscription-desk verify-source --source-root ROOT --source-manifest FILE\n\n'+
'The original customer receiver, merchant transport and native subscription engine remain selected.\n'+
'Keep the same request, directories and original artifact IDs when continuing interrupted work.\n';
function argumentsFor(argv){
 const [command,...args]=argv,options={};for(let i=0;i<args.length;i+=2){
  const key=args[i];if(!/^--[a-z][a-z-]*$/.test(key)||args[i+1]===undefined||Object.hasOwn(options,key.slice(2)))throw new Error('Use each supported --option VALUE once.');
  options[key.slice(2)]=args[i+1];
 }
 const allowed={
  serve:['directory','connection','port','source-root','source-manifest','token-env'],
  inspect:['directory','connection'],
  action:['directory','connection','request','source-root','source-manifest'],
  'inspect-package':['file'],'receive-package':['file','sha256','directory','customer'],
  'verify-source':['source-root','source-manifest'],'source-manifest':['output','source-root']
 }[command];
 if(!allowed||Object.keys(options).some(k=>!allowed.includes(k)))throw new Error('Choose a command and its supported options from --help.');
 return {command,options};
}
const required=(options,key)=>{if(typeof options[key]!=='string'||!options[key])throw new Error('Select --'+key+'.');return options[key];};
export async function main(argv=process.argv.slice(2)){
 if(!argv.length||['--help','help','-h'].includes(argv[0])){process.stdout.write(HELP);return 0;}
 if(Number(process.versions.node.split('.')[0])<24)throw new Error('Use the selected Node 24 or newer runtime for native subscription receiving.');
 const {command,options:o}=argumentsFor(argv),source={sourceRoot:o['source-root'],sourceManifest:o['source-manifest']};let result;
 if(command==='source-manifest'){result=await writeSourceManifest({output:required(o,'output'),sourceRoot:o['source-root']});}
 else if(command==='verify-source'){const s=await selectedSource(source);result={sourceManifest:s.manifest,files:s.files.length,bytes:s.files.reduce((n,f)=>n+f.bytes,0)};}
 else if(command==='inspect-package'){const s=await inspectCustomerPacket(required(o,'file'));result=s;}
 else if(command==='receive-package'){result=await receiveCustomerPacket({path:required(o,'file'),expectedSha256:required(o,'sha256'),directory:required(o,'directory'),customerDirectory:required(o,'customer')});}
 else{
  const args={directory:required(o,'directory'),connection:required(o,'connection'),...source};
  if(command==='serve'){
   const port=o.port===undefined?0:Number(o.port);
   if(o['token-env']&&!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(o['token-env']))throw new Error('Select the existing local token environment variable.');
   const token=o['token-env']?process.env[o['token-env']]:undefined;
   if(o['token-env']&&!token)throw new Error('The selected local token environment variable is empty.');
   const app=await startCustomerDeskServer({...args,port,token});
   process.stdout.write(JSON.stringify({schema:'stellar-forge.odata-customer-desk-listening.v1',pid:process.pid,origin:app.origin,url:app.url})+'\n');
   let close;const done=new Promise((ok,fail)=>{close=()=>{app.close().then(ok,fail);};});
   for(const signal of ['SIGINT','SIGTERM'])process.once(signal,close);
   try{await done;}finally{for(const signal of ['SIGINT','SIGTERM'])process.removeListener(signal,close);}
   return 0;
  }
  const desk=await openCustomerDesk(args);
  try{
   if(command==='inspect')result=await desk.status();
   else result=await desk.run(JSON.parse(await readFile(resolve(required(o,'request')),'utf8')));
  }finally{await desk.close();}
 }
 process.stdout.write(JSON.stringify(result,null,2)+'\n');return 0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().then(code=>{process.exitCode=code;},error=>{process.stderr.write(JSON.stringify({error:{code:error.code??'ODATA_DESK_CLI',message:error.message,
  ...Object.fromEntries(['applied','outcomeUnknown','reopenRequired','commitUncertainty'].filter(k=>error[k]!==undefined).map(k=>[k,error[k]]))}})+'\n');process.exitCode=1;});
}
