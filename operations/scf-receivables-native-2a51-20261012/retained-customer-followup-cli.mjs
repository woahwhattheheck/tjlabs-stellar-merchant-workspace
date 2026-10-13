#!/usr/bin/env node
// MIT. TokenJunkieLabs. Resume the same original retained customer receiving operation.
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readDurableCaseInput} from './durable-customer-case.mjs';
import {finishRetainedCustomerFollowup} from './retained-customer-followup.mjs';
import {connectAccountingReceivablesClient} from '../../stellar-forge/mcp-merchant-operator/accounting-receivables-client.mjs';
const HELP=[
'Retained customer payment follow-up','',
'  inspect --directory ORIGINAL_PRIVATE_FOLLOWUP_DIRECTORY',
'  continue --directory ORIGINAL_PRIVATE_FOLLOWUP_DIRECTORY','',
'Continue requires the existing merchant listener at the saved endpoint and its',
'original token environment reference. It resumes the exact saved provider',
'requests, completes the customer account and retains customer/staff files.',
'Use the original serve-retained-customer-case.mjs to reopen that listener.',
'The original demonstration selection and all committed records remain saved.',
'No new customer, endpoint or policy inputs are accepted by this continuation.',''].join('\n');
export async function main(args=process.argv.slice(2)){
  if(!args.length||args.length===1&&['--help','help'].includes(args[0])){process.stdout.write(HELP);return;}
  if(args.length!==3||!['inspect','continue'].includes(args[0])||args[1]!=='--directory')throw new Error('Use inspect|continue --directory ORIGINAL_PRIVATE_FOLLOWUP_DIRECTORY.');
  const directory=resolve(args[2]),selected=await readDurableCaseInput(join(directory,'selection.json'),1_000_000);
  const flow=await readDurableCaseInput(join(directory,'flow.json'),8_000_000);
  if(args[0]==='inspect'){const result={directory,selection:selected,status:flow.status??'INCOMPLETE',
    steps:Object.entries(flow.steps).map(([name,row])=>({name,kind:row.kind,requestId:row.requestId,status:row.status}))};
    process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;}
  const client=await connectAccountingReceivablesClient({url:selected.url,workspace:selected.workspace,tokenEnv:selected.tokenEnv});
  let error;
  try{const {schema,...input}=selected;const result=await finishRetainedCustomerFollowup({directory,client,...input});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;
  }catch(problem){error=problem;throw problem;}
  finally{try{await client.disconnect();}catch(problem){if(error)error.releaseError={code:problem.code,message:problem.message};else throw problem;}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{
  process.stderr.write(JSON.stringify({code:error.code??'ERROR',message:error.message,details:error.details,
    operationDirectory:error.operationDirectory,requestId:error.requestId,releaseError:error.releaseError},null,2)+'\n');process.exitCode=2;
});
