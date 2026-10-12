#!/usr/bin/env node
// MIT. Full publisher/customer operator using the same retained native workspace.
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {openSubscriptionOperator,OPERATIONS} from './operator.mjs';
import {startSubscriptionServer} from './server.mjs';
import {need,parse,read,privateDirectory,atomic,immutable,bytes} from './files.mjs';
export const HELP='OData collection subscriptions\n\n'+
 'starforge odata-subscriptions --connection private-connection.json status\n'+
 'starforge odata-subscriptions --connection private-connection.json OPERATION --request original-request.json [--out result.json]\n'+
 'starforge odata-subscriptions --connection private-connection.json serve [--port 0]\n'+
 'starforge odata-subscriptions managed-review --request receiving-selection.json --out reviewed-input.json\n'+
 'starforge odata-subscriptions managed-receive --request reviewed-input.json [--out receiving-result.json]\n\n'+
 'Operations: '+OPERATIONS.join(', ')+'.\n\n'+
 'Managed receiving uses the original READY runtime and Applications controller through Review, Save, Start, complete native backup/download/restore, Stop and same-entry reopen. Repeat the same reviewed input to continue. See MANAGED_RECEIVING.md.\n\n'+
 'Every operation receives the same JSON object used by the local UI and MCP provider. Publisher create/append retain requestId and the complete selected body. Retry the same file to resume. Deliveries select fromRevision/toRevision; customer exports select expectedRevision and expectedEditionSha256. Inputs and output aliases are declared in the private connection. The command reports complete native receipts as JSON. See SUBSCRIPTIONS.md and connection.example.json for the complete workflow.\n';
function args(argv){
 const result={};for(let i=0;i<argv.length;i++){const item=argv[i];
  if(item==='--help'||item==='-h'){result.help=true;continue;}
  if(item.startsWith('--')){const key=item.slice(2);need(['connection','request','out','port'].includes(key)&&!Object.hasOwn(result,key)&&i+1<argv.length&&!argv[i+1].startsWith('--'),'CLI','Use a supported flag once with its value.',400);result[key]=argv[++i];}
  else{need(!result.operation,'CLI','Choose one operation.',400);result.operation=item;}
 }return result;
}
export async function main(argv=process.argv.slice(2)){
 const flags=args(argv);if(flags.help||!flags.operation){process.stdout.write(HELP);return;}
 if(['managed-review','managed-receive'].includes(flags.operation)){
  need(flags.request&&!flags.connection&&!flags.port&&(flags.operation!=='managed-review'||flags.out),
   'CLI','Use a private --request and --out for managed-review; managed-receive takes the reviewed --request.',400);
  const input=parse(await read(resolve(flags.request),1048576));
  const native=await import('./managed-receiving.mjs');
  const result=await native[flags.operation==='managed-review'?'prepareManagedSubscriptionReceiving':'runManagedSubscriptionReceiving'](input);
  if(flags.out){
   const output=resolve(flags.out),parent=dirname(output);await privateDirectory(parent);
   need(output!==resolve(flags.request)&&(!input.subscriptionConnection||output!==resolve(input.subscriptionConnection)),
    'OUTPUT','Keep the selected original input and connection separate from the result.',400);
   await immutable(parent,output.slice(parent.length+1),bytes(result));
  }
  process.stdout.write(bytes(result));return result;
 }
 need(flags.connection,'CLI','Choose the original private connection file.',400);
 if(flags.operation==='serve'){
  need(!flags.request&&!flags.out,'CLI','Serve uses only connection and optional port.',400);
  const port=flags.port===undefined?0:Number(flags.port),service=await startSubscriptionServer({connection:resolve(flags.connection),port});
  process.stdout.write(JSON.stringify({schema:'stellar-forge.odata-subscription-server.v1',status:'RUNNING',url:service.url,pid:process.pid,ppid:process.ppid})+'\n');
  let closing=false;const close=()=>{if(!closing){closing=true;void service.close().catch(error=>{process.stderr.write(JSON.stringify({error:error.code,message:error.message})+'\n');process.exitCode=1;});}};
  process.once('SIGINT',close);process.once('SIGTERM',close);return service;
 }
 need(!flags.port,'CLI','Port applies only to serve.',400);
 let input={};if(flags.request)input=parse(await read(resolve(flags.request),131072));
 const operator=await openSubscriptionOperator({connection:resolve(flags.connection)});
 try{const result=await operator.call(flags.operation,input),raw=Buffer.from(JSON.stringify(result,null,2)+'\n');
  if(flags.out){const output=resolve(flags.out);await privateDirectory(dirname(output));need(output!==resolve(flags.connection)&&(!flags.request||output!==resolve(flags.request)),'OUTPUT','Keep the original connection and request separate from command output.',400);await atomic(dirname(output),output.slice(dirname(output).length+1),result);}
  process.stdout.write(raw);return result;
 }finally{await operator.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{process.stderr.write(JSON.stringify({error:error.code??'ODATA_SUBSCRIPTION_CLI',message:error.message})+'\n');process.exitCode=1;});
