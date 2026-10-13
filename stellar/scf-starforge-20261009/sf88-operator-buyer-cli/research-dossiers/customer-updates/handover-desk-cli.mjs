#!/usr/bin/env node
// MIT. Start the private original customer handover/returns operator desk.
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ResearchWorkspaceClient} from '../workspace-client.mjs';
import {startCustomerHandoverDesk} from './handover-desk.mjs';
export const CUSTOMER_HANDOVER_DESK_COMMAND='customer-handover-desk';
export const CUSTOMER_HANDOVER_DESK_USAGE='Research customer handover operator desk\n\nresearch-customer-handover-desk --connection-file FILE --run-directory DIR --selection FILE --selection-sha256 SHA [--workspace DIR --port 0 --python python3 --node node]\nresearch-client customer-handover-desk [same options]\n\nThe connection selects the existing native workspace. --workspace is an optional\nabsolute local workspace directory override, matching research-client. The desk\nvalidates its actual workspace ID against the original selection. Open the private\nloopback URL in this terminal. Keep its token private. Closing waits for the active\noriginal operation; reopening reads saved source/drafts/requests and status.\n';
function need(value,code){if(!value)throw Object.assign(new Error(code),{code});}
function path(value){need(typeof value==='string'&&value,'DESK_PATH_REQUIRED');return resolve(value);}
export async function runCustomerHandoverDeskCli(argv=process.argv.slice(2),{stdout=process.stdout,stderr=process.stderr}={}){
  if(argv[0]===CUSTOMER_HANDOVER_DESK_COMMAND)argv=argv.slice(1);
  if(argv.length===0||argv[0]==='help'||argv[0]==='--help'){stdout.write(CUSTOMER_HANDOVER_DESK_USAGE);return;}
  const options=Object.fromEntries(['connection-file','run-directory','selection','selection-sha256','workspace','port','python','node']
    .map(name=>[name,{type:'string'}]));
  const {values}=parseArgs({args:argv,options,strict:true,allowPositionals:false});
  need(/^[a-f0-9]{64}$/.test(values['selection-sha256']??''),'DESK_SELECTION_HASH_REQUIRED');
  if(values.port!==undefined)need(/^(0|[1-9][0-9]{0,4})$/.test(values.port)&&Number(values.port)<=65535,'DESK_PORT_INVALID');
  const client=ResearchWorkspaceClient.fromFile(path(values['connection-file']),
    values.workspace?{directory:path(values.workspace)}:{});
  let desk;
  try{
    desk=await startCustomerHandoverDesk({client,directory:path(values['run-directory']),
      selectionFile:path(values.selection),selectionSha256:values['selection-sha256'],
      port:Number(values.port??0),python:values.python??'python3',node:values.node??process.execPath});
    // The authentication URL is printed only to this explicit local terminal.
    stdout.write('Research customer handover desk\n'+desk.url+'\n');
    await new Promise((resolveDone,rejectDone)=>{
      let stopping=false;
      const stop=()=>{
        if(stopping)return;stopping=true;
        stderr.write('Finishing the active original operation and closing the private desk.\n');
        desk.close().then(()=>{process.off('SIGINT',stop);process.off('SIGTERM',stop);resolveDone();},error=>{
          stopping=false;
          stderr.write('The original client has not confirmed closure. The private desk keeps its operation lock; repeat the close signal to retry.\n');});
      };
      process.on('SIGINT',stop);process.on('SIGTERM',stop);
    });
  }catch(error){
    if(desk)await desk.close();else await client.close();
    throw error;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  runCustomerHandoverDeskCli().catch(error=>{
    const code=/^[A-Z][A-Z0-9_]{0,119}$/.test(error?.code??'')?error.code:'DESK_START_FAILED';
    process.stderr.write(JSON.stringify({state:'INCOMPLETE',code,message:'The private desk could not complete. Retain the original selection and request.'})+'\n');
    process.exitCode=1;
  });
