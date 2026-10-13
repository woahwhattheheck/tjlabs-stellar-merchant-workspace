#!/usr/bin/env node
// MIT. Start the private original customer handover first-use intake.
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ResearchWorkspaceClient} from '../workspace-client.mjs';
import {startCustomerHandoverIntakeDesk} from './handover-intake-desk.mjs';
export const CUSTOMER_HANDOVER_INTAKE_COMMAND='customer-handover-intake';
export const CUSTOMER_HANDOVER_INTAKE_USAGE='Research customer handover first-use intake\n\nresearch-customer-handover-intake --connection-file FILE --directory DIR --engine-root DIR --engine-manifest FILE --engine-manifest-sha256 SHA [--workspace DIR --port 0 --python python3 --node node]\nresearch-client customer-handover-intake [same options]\n\nThe connection selects the existing native workspace. --workspace is an optional\nabsolute local workspace directory override, matching research-client. The intake retains the actual workspace and full original engine, lists published\ndeliveries, and prepares an explicitly reviewed baseline and return scope. Open the private\nloopback URL in this terminal. Keep its token private. Closing waits for the active\noriginal operation; reopening reads saved source/drafts/requests and status.\n';
function need(value,code){if(!value)throw Object.assign(new Error(code),{code});}
function path(value){need(typeof value==='string'&&value,'INTAKE_PATH_REQUIRED');return resolve(value);}
export async function runCustomerHandoverIntakeCli(argv=process.argv.slice(2),{stdout=process.stdout,stderr=process.stderr}={}){
  if(argv[0]===CUSTOMER_HANDOVER_INTAKE_COMMAND)argv=argv.slice(1);
  if(argv.length===0||argv[0]==='help'||argv[0]==='--help'){stdout.write(CUSTOMER_HANDOVER_INTAKE_USAGE);return;}
  const options=Object.fromEntries(['connection-file','directory','engine-root','engine-manifest','engine-manifest-sha256','workspace','port','python','node']
    .map(name=>[name,{type:'string'}]));
  const {values}=parseArgs({args:argv,options,strict:true,allowPositionals:false});
  need(/^[a-f0-9]{64}$/.test(values['engine-manifest-sha256']??''),'INTAKE_SELECTION_HASH_REQUIRED');
  if(values.port!==undefined)need(/^(0|[1-9][0-9]{0,4})$/.test(values.port)&&Number(values.port)<=65535,'INTAKE_PORT_INVALID');
  const clientFactory=()=>ResearchWorkspaceClient.fromFile(path(values['connection-file']),
    values.workspace?{directory:path(values.workspace)}:{});
  const client=clientFactory();
  let desk;
  try{
    desk=await startCustomerHandoverIntakeDesk({client,clientFactory,directory:path(values.directory),
      engineRoot:path(values['engine-root']),engineManifest:path(values['engine-manifest']),engineManifestSha256:values['engine-manifest-sha256'],
      port:Number(values.port??0),python:values.python??'python3',node:values.node??process.execPath});
    // The authentication URL is printed only to this explicit local terminal.
    stdout.write('Research customer handover intake\n'+desk.url+'\n');
    await new Promise((resolveDone,rejectDone)=>{
      let stopping=false;
      const stop=()=>{
        if(stopping)return;stopping=true;
        stderr.write('Finishing the active original operation and closing the private intake.\n');
        desk.close().then(()=>{process.off('SIGINT',stop);process.off('SIGTERM',stop);resolveDone();},error=>{
          stopping=false;
          stderr.write('The original client has not confirmed closure. The private intake keeps its operation lock; repeat the close signal to retry.\n');});
      };
      process.on('SIGINT',stop);process.on('SIGTERM',stop);
    });
  }catch(error){
    if(desk)await desk.close();else await client.close();
    throw error;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  runCustomerHandoverIntakeCli().catch(error=>{
    const code=/^[A-Z][A-Z0-9_]{0,119}$/.test(error?.code??'')?error.code:'INTAKE_START_FAILED';
    process.stderr.write(JSON.stringify({state:'INCOMPLETE',code,message:'The private intake could not complete. Retain the original baseline and reviewed scope.'})+'\n');
    process.exitCode=1;
  });
