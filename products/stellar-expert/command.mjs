// MIT. Product commands use the original retained Applications operations and file clients.
import { resolve } from 'node:path';
import { readJSON, json, need } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import { prepareProductOperation,saveProductOperation,connectProductOperation,startProductOperation,
 inspectProductOperation,controlProductOperation,openProductOperation,connectProductMerchant,
 productFiles,exportProductHandover } from './installed.mjs';
const fields={
 prepare:['--operation','--request'],save:['--operation'],connect:['--operation'],
 start:['--operation','--run-id'],status:['--operation','--run-id'],open:['--operation','--run-id'],
 stop:['--operation','--run-id'],recover:['--operation','--run-id'],merchant:['--operation','--run-id'],
 files:['--operation','--action','--selection'],handover:['--operation']
};
export async function main(product,args=process.argv.slice(2)){
 if(!args.length||args.length===1&&['--help','-h'].includes(args[0])){
  process.stdout.write(product+' installed operation\n\n'+
   'prepare --operation PRIVATE_DIRECTORY --request PRIVATE_JSON\n'+
   'save|connect|status|handover --operation PRIVATE_DIRECTORY\n'+
   'start|open|stop|recover|merchant --operation PRIVATE_DIRECTORY --run-id ORIGINAL_UUID\n'+
   'files --operation PRIVATE_DIRECTORY --action inspect|receive|reopen --selection PRIVATE_JSON\n\n'+
   'Prepare returns the original review. Save retains its application and starts the original runtime attachment.\n'+
   'Start preserves the supplied run UUID; recover resumes that same run. A deliberate reopen after stop uses a new run UUID.\n'+
   'Open prints the private authenticated session URL. Merchant refreshes the original run reference after reopening.\n'+
   'Files use the original MCP client and its retained download checkpoints; reopen checks the same files offline.\n');return;
 }
 const [command,...rest]=args;need(Object.hasOwn(fields,command),'PRODUCT_COMMAND_REQUIRED');
 const options={};
 for(let i=0;i<rest.length;i+=2){
  need(fields[command].includes(rest[i])&&!Object.hasOwn(options,rest[i])&&rest[i+1]&&!rest[i+1].startsWith('--'),'PRODUCT_OPTION_INVALID');
  options[rest[i]]=rest[i+1];
 }
 need(options['--operation'],'PRODUCT_OPERATION_DIRECTORY_REQUIRED');
 const directory=resolve(options['--operation']);
 if(command!=='prepare'){
  const retained=await readJSON(directory+'/operation.json');
  need(retained.request?.product===product,'PRODUCT_COMMAND_SELECTION_CHANGED');
 }
 const runId=options['--run-id'];let result;
 if(command==='prepare'){
  need(options['--request'],'PRODUCT_REQUEST_REQUIRED');const request=await readJSON(resolve(options['--request']));
  need(request.product===product,'PRODUCT_COMMAND_SELECTION_CHANGED');result=await prepareProductOperation({directory,request});
 }else if(command==='save')result=await saveProductOperation({directory});
 else if(command==='connect')result=await connectProductOperation({directory});
 else if(command==='status')result=await inspectProductOperation({directory,runId});
 else if(command==='start')result=await startProductOperation({directory,runId});
 else if(command==='open')result=await openProductOperation({directory,runId});
 else if(command==='merchant')result=await connectProductMerchant({directory,runId});
 else if(command==='stop'||command==='recover')result=await controlProductOperation({directory,runId,action:command});
 else if(command==='handover')result=await exportProductHandover({directory});
 else{
  need(options['--selection']&&options['--action'],'PRODUCT_FILE_SELECTION_REQUIRED');
  const selection=await readJSON(resolve(options['--selection'])),controller=new AbortController();
  const stop=()=>controller.abort(Object.assign(new Error('Resume the same original file selection and directory.'),{code:'PRODUCT_FILE_INTERRUPTED'}));
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{result=await productFiles({directory,selection,action:options['--action'],signal:controller.signal,
   onProgress:value=>process.stderr.write(json({state:'RECEIVING',...value}))});}
  finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
 }
 process.stdout.write(json(result));
}
