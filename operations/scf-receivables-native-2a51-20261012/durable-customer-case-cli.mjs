#!/usr/bin/env node
// MIT. TokenJunkieLabs. Local continuation of the existing merchant customer case.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createDurableCustomerCase,captureDurableCustomerCase,inspectDurableCustomerCase,
  prepareDurableCustomerAction,runDurableCustomerAction,checkpointDurableCustomerCase,
  readDurableCaseInput} from './durable-customer-case.mjs';
const HELP=[
'Retained merchant customer case','',
'  create --case NEW_PRIVATE_DIRECTORY --selection PRIVATE_SELECTION_JSON',
'  inspect --case PRIVATE_DIRECTORY',
'  capture --case PRIVATE_DIRECTORY --edition-id UUID',
'  prepare --case PRIVATE_DIRECTORY --operation-id UUID --action KIND',
'      --preview PRIVATE_PREVIEW_JSON --actor NAME [--request-id ORIGINAL_ID]',
'  execute|reconcile --case PRIVATE_DIRECTORY --operation-id UUID',
'  checkpoint|checkpoint-reconcile --case PRIVATE_DIRECTORY --edition-id UUID',
'      --checkpoint-id UUID --actor NAME --external-writers-stopped true','',
'The selection binds an existing customer, original workspace ID, account date,',
'configured alias and endpoint. It retains environment variable names only.',
'Capture downloads complete original customer documents and staff records.',
'Prepared customer actions use customer_account_publish, customer_response_receive',
'or customer_response_review and the complete preview from the existing client.',
'Checkpoint uses original pause/review/encrypted-backup/verify/resume requests.',
'Stop original source writers before explicitly confirming that choice.',
'A pending job remains attached to its original checkpoint UUID.',''].join('\n');
function options(args,allowed){const values={};for(let i=0;i<args.length;i+=2){
  if(!allowed.includes(args[i])||Object.hasOwn(values,args[i])||args[i+1]===undefined)throw new Error('Use documented option/value pairs.');
  values[args[i]]=args[i+1];}return values;}
function required(values,key){if(!values[key])throw new Error('Supply '+key+'.');return values[key];}
export async function main(args=process.argv.slice(2)){
  if(!args.length||args.length===1&&['--help','help'].includes(args[0])){process.stdout.write(HELP);return;}
  const [command,...rest]=args,common=['--case'],extra={
    create:['--selection'],inspect:[],capture:['--edition-id'],
    prepare:['--operation-id','--action','--preview','--actor','--request-id'],
    execute:['--operation-id'],reconcile:['--operation-id'],
    checkpoint:['--edition-id','--checkpoint-id','--actor','--external-writers-stopped'],
    'checkpoint-reconcile':['--edition-id','--checkpoint-id','--actor','--external-writers-stopped']
  };
  if(!Object.hasOwn(extra,command))throw new Error('Choose a documented customer case command.');
  const o=options(rest,[...common,...extra[command]]),directory=required(o,'--case');let result;
  if(command==='create')result=await createDurableCustomerCase({directory,selection:await readDurableCaseInput(resolve(required(o,'--selection')),1_000_000)});
  else if(command==='inspect')result=await inspectDurableCustomerCase({directory});
  else if(command==='capture')result=await captureDurableCustomerCase({directory,editionId:required(o,'--edition-id')});
  else if(command==='prepare')result=await prepareDurableCustomerAction({directory,operationId:required(o,'--operation-id'),
    kind:required(o,'--action').replaceAll('-','_'),preview:await readDurableCaseInput(resolve(required(o,'--preview')),128_000_000),
    actor:required(o,'--actor'),requestId:o['--request-id']});
  else if(command==='execute'||command==='reconcile')result=await runDurableCustomerAction({directory,operationId:required(o,'--operation-id'),execute:command==='execute'});
  else{
    if(o['--external-writers-stopped']!=='true')throw new Error('Confirm stopped external writers with --external-writers-stopped true.');
    result=await checkpointDurableCustomerCase({directory,editionId:required(o,'--edition-id'),checkpointId:required(o,'--checkpoint-id'),
      actor:required(o,'--actor'),externalWritersStopped:true,execute:command==='checkpoint'});
  }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');if(result?.pending||result?.found===false)process.exitCode=3;return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{
  process.stderr.write(JSON.stringify({code:error.code??'ERROR',message:error.message,details:error.details,
    operationDirectory:error.operationDirectory,requestId:error.requestId,releaseError:error.releaseError},null,2)+'\n');process.exitCode=2;
});
