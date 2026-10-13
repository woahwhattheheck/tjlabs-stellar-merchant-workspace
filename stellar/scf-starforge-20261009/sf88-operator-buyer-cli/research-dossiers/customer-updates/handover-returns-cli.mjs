#!/usr/bin/env node
// MIT. Complete original customer handover and reviewed return receiving commands.
import {parseArgs} from 'node:util';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ResearchWorkspaceClient} from '../workspace-client.mjs';
import {customerDirectory,retainCustomerJson} from './files.mjs';
import {prepareCustomerHandoverReturns,prepareCustomerHandoverReturn,applyCustomerHandoverReturn,
  completeCustomerHandoverReturns,receiveCustomerHandoverReturns,readCustomerHandoverReturns} from './handover-returns.mjs';

export const CUSTOMER_HANDOVER_RETURN_COMMAND='customer-handover-returns';
export const CUSTOMER_HANDOVER_RETURN_USAGE="Research customer handover and reviewed returns\n\nresearch-customer-handover-returns init --connection-file FILE --run-directory DIR --selection FILE --selection-sha256 SHA\nresearch-customer-handover-returns prepare --connection-file FILE --run-directory DIR --round KEY [--source-file FILE --source-bytes N --source-sha256 SHA --source-filename NAME --source-content-type TYPE]\nresearch-customer-handover-returns apply --connection-file FILE --run-directory DIR --round KEY [--review-file FILE --review-sha256 SHA]\nresearch-customer-handover-returns complete --connection-file FILE --run-directory DIR [--python python3 --node node]\nresearch-customer-handover-returns status --run-directory DIR\nresearch-customer-handover-returns receive --connection-file FILE --run-directory DIR --package-directory DIR --manifest-sha256 SHA [--source-actor NAME]\n\nConnection commands accept --workspace DIR. Every command accepts --out FILE.\nPrepare retains the entire native comparison and all values for explicit review.\nRepeat apply with the same exact request after response loss; omit both review\nflags to recover the already retained request. Complete exports the accepted\nhistorical dossier, original handover, full source and independently cold receives.\nSee customer-updates/HANDOVER_RETURNS.md for complete selection and commands.\n";
function need(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}
const path=value=>{need(typeof value==='string'&&value,'HANDOVER_RETURN_PATH_REQUIRED');return resolve(value);};
function number(value){
  need(typeof value==='string'&&/^(0|[1-9][0-9]{0,11})$/.test(value)&&Number.isSafeInteger(Number(value)),'HANDOVER_RETURN_NUMBER_REQUIRED');
  return Number(value);
}
const fields={
  init:['selection','selection-sha256'],
  prepare:['round','source-file','source-bytes','source-sha256','source-filename','source-content-type'],
  apply:['round','review-file','review-sha256'],
  complete:['python','node'],
  receive:['package-directory','manifest-sha256','source-actor'],
  status:[]
};
export async function runCustomerHandoverReturnsCli(argv=process.argv.slice(2),{stdout=process.stdout}={}){
  if(argv[0]===CUSTOMER_HANDOVER_RETURN_COMMAND)argv=argv.slice(1);
  const [command,...args]=argv;
  if(!command||command==='help'||command==='--help'){stdout.write(CUSTOMER_HANDOVER_RETURN_USAGE);return;}
  need(Object.hasOwn(fields,command),'HANDOVER_RETURN_COMMAND_INVALID');
  const names=['run-directory','out',...fields[command],...(command==='status'?[]:['connection-file','workspace'])];
  const {values}=parseArgs({args,strict:true,allowPositionals:false,
    options:Object.fromEntries(names.map(name=>[name,{type:'string'}]))});
  const directory=path(values['run-directory']);
  let client;
  try{
    if(command!=='status'){
      client=ResearchWorkspaceClient.fromFile(path(values['connection-file']),
        values.workspace?{directory:path(values.workspace)}:{});
    }
    let result;
    if(command==='init')result=await prepareCustomerHandoverReturns({client,directory,
      selectionFile:path(values.selection),selectionSha256:values['selection-sha256']});
    else if(command==='prepare'){
      const sourceFields=['source-file','source-bytes','source-sha256','source-filename','source-content-type'];
      need(sourceFields.every(name=>values[name]===undefined)||sourceFields.every(name=>typeof values[name]==='string'&&values[name]),
        'HANDOVER_RETURN_COMPLETE_SOURCE_SELECTION_REQUIRED');
      result=await prepareCustomerHandoverReturn({client,directory,key:values.round,
        ...(values['source-file']?{source:{file:path(values['source-file']),bytes:number(values['source-bytes']),
          sha256:values['source-sha256'],filename:values['source-filename'],contentType:values['source-content-type']}}:{})});
    }else if(command==='apply'){
      need((values['review-file']===undefined)===(values['review-sha256']===undefined),'HANDOVER_RETURN_COMPLETE_REQUEST_SELECTION_REQUIRED');
      result=await applyCustomerHandoverReturn({client,directory,key:values.round,
        ...(values['review-file']?{reviewFile:path(values['review-file']),reviewSha256:values['review-sha256']}: {})});
    }else if(command==='complete')result=await completeCustomerHandoverReturns({client,directory,
      python:values.python??'python3',node:values.node??process.execPath});
    else if(command==='receive')result=await receiveCustomerHandoverReturns({client,directory,
      packageDirectory:path(values['package-directory']),manifestSha256:values['manifest-sha256'],sourceActor:values['source-actor']});
    else result=await readCustomerHandoverReturns({directory});
    if(values.out){
      const destination=path(values.out);await customerDirectory(dirname(destination));
      await retainCustomerJson(dirname(destination),basename(destination),result);
    }
    stdout.write(JSON.stringify(result,null,2)+'\n');return result;
  }catch(error){
    if(error&&typeof error==='object')error.recoveryDirectory=directory;
    throw error;
  }finally{await client?.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  runCustomerHandoverReturnsCli().catch(error=>{
    process.stderr.write(JSON.stringify({state:'INCOMPLETE',code:error.code??'HANDOVER_RETURN_COMMAND_FAILED',
      message:error.message,recoveryDirectory:error.recoveryDirectory,
      ...(error.outcomeUnknown?{outcomeUnknown:true}:{})})+'\n');
    process.exitCode=1;
  });
