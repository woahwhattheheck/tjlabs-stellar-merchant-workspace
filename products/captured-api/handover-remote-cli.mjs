#!/usr/bin/env node
// MIT. The same retained captured handover operations from an ordinary terminal.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readHarWorkspaceConfiguration } from '../../stellar-forge/mcp-merchant-operator/har-workspace.mjs';
import { readSf61HostFile, sf61Hash } from '../../stellar-forge/mcp-merchant-operator/sf61-connection.mjs';
import { MerchantCapturedHandovers } from './handover-agent.mjs';
import { openCapturedHandoverClient } from './handover-client.mjs';
import { openCapturedHandoverArchive } from './handover-archive.mjs';
import { capturedHandoverTools, HANDOVER_SHA, HANDOVER_UUID } from './handover-catalog.mjs';
import { canonical, decode, exact, operation, requireEmptyOperation, publishJSON, readJSON } from './handover-files.mjs';

const REQUEST='stellar-forge.captured-handover-command.v1';
const OPERATION='stellar-forge.captured-handover-terminal-operation.v1';
const RESULT='stellar-forge.captured-handover-terminal-result.v1';
const HELP=String.raw`Captured handover agent and terminal

  starforge captured-api handover remote catalog
  starforge captured-api handover remote call
      --connection ORIGINAL_HAR_CONNECTION.json --request ORIGINAL_COMMAND.json
      [--result PRIVATE_RESULT_DIRECTORY]
  starforge captured-api handover remote transfer
      --connection ORIGINAL_HAR_CONNECTION.json
      --workspace RECEIVER_ALIAS --product RECEIVER_PRODUCT_SHA
      --from-workspace SOURCE_ALIAS --from-product SOURCE_PRODUCT_SHA
      --job ORIGINAL_PUBLISH_UUID --file-sha256 ORIGINAL_ARCHIVE_SHA
      --file-bytes ORIGINAL_BYTES --upload-id RETAINED_UPLOAD_UUID
      [--result PRIVATE_RESULT_DIRECTORY]
  starforge captured-api handover remote upload
      --connection ORIGINAL_HAR_CONNECTION.json
      --workspace RECEIVER_ALIAS --product RECEIVER_PRODUCT_SHA
      --file ORIGINAL.sfhandover --file-sha256 ORIGINAL_SHA --file-bytes ORIGINAL_BYTES
      --upload-id RETAINED_UPLOAD_UUID [--result PRIVATE_RESULT_DIRECTORY]
  starforge captured-api handover remote download
      --connection ORIGINAL_HAR_CONNECTION.json
      --workspace SOURCE_ALIAS --product SOURCE_PRODUCT_SHA
      --job ORIGINAL_PUBLISH_UUID --file-sha256 ORIGINAL_SHA --file-bytes ORIGINAL_BYTES
      --directory PRIVATE_FILE_DIRECTORY [--download-id RETAINED_DOWNLOAD_UUID]
      [--result PRIVATE_RESULT_DIRECTORY]
  starforge captured-api handover remote wait
      --connection ORIGINAL_HAR_CONNECTION.json
      --workspace ORIGINAL_ALIAS --product ORIGINAL_PRODUCT_SHA
      --job ORIGINAL_JOB_UUID --request-sha256 ORIGINAL_REQUEST_SHA
      [--wait-ms 900000] [--interval-ms 1000]

Every call uses the original private console URL reference already declared in the
HAR connection. Product IDs come from merchant_handover_info. The terminal never
prints a browser token or creates another console.

COMMAND.json is one complete private JSON file:
  {"schema":"stellar-forge.captured-handover-command.v1",
   "tool":"merchant_handover_info","arguments":{"workspace":"merchant"}}

Use catalog for all complete argument schemas. Keep the same original command,
request/upload/job IDs, file hash and byte count when a reply is interrupted.
A result directory retains its exact command and first completed reply; another
invocation reopens that reply. Use a separate job read or wait to observe progress.
For a new command or fresh read, choose a new result directory.

Transfer and upload finish the original whole archive before IMPORT. Download
uses the same native resumable upload writer in the selected local directory.
wait reads the same native job until COMPLETE, INTERRUPTED or its time limit;
it never changes or restarts that job.

See products/captured-api/AGENT.md for the whole reviewed collection, transfer,
receiving and reopen workflow, including typed client examples.
`;

const failure=(code,message)=>Object.assign(new Error(message),{code});
function options(args,allowed,required) {
  const values=new Map();
  for(let index=0;index<args.length;index++) {
    const key=args[index],value=args[++index];
    if(!allowed.includes(key)||values.has(key)||typeof value!=='string'||!value||value.startsWith('--'))
      throw failure('CAPTURED_HANDOVER_ARGUMENTS','Supply each original named option and its value once: '+key);
    values.set(key,value);
  }
  for(const key of required)if(!values.has(key))
    throw failure('CAPTURED_HANDOVER_ARGUMENTS','Supply '+key+'.');
  return values;
}
function checked(value,pattern,label) {
  if(typeof value!=='string'||!pattern.test(value))
    throw failure('CAPTURED_HANDOVER_ARGUMENTS','Use the original '+label+'.');
  return value;
}
function number(value,minimum,maximum,label) {
  if(typeof value!=='string'||!/^(0|[1-9][0-9]*)$/.test(value))
    throw failure('CAPTURED_HANDOVER_ARGUMENTS','Use an exact '+label+'.');
  const result=Number(value);
  if(!Number.isSafeInteger(result)||result<minimum||result>maximum)
    throw failure('CAPTURED_HANDOVER_ARGUMENTS','Use an exact '+label+'.');
  return result;
}
async function configuration(path) {
  return {harWorkspaces:await readHarWorkspaceConfiguration(resolve(path))};
}
function definition(config,workspace) {
  if(!Object.hasOwn(config.harWorkspaces.workspaces,workspace))
    throw failure('CAPTURED_HANDOVER_ARGUMENTS','Choose an original alias in the selected HAR connection.');
  return config.harWorkspaces.workspaces[workspace];
}
async function withClient(config,workspace,expectedProductId,work) {
  const client=await openCapturedHandoverClient(definition(config,workspace),{expectedProductId});
  let issue;
  try{return await work(client);}
  catch(error){issue=error;throw error;}
  finally {
    try{await client.close();}
    catch(error){if(issue)issue.closeError=error;else throw error;}
  }
}
async function retained(directory,request,work,{reopen}={}) {
  if(!directory)return work();
  const record={schema:OPERATION,requestSha256:sf61Hash(Buffer.from(canonical(request))),request};
  return operation(resolve(directory),async root=>{
    await requireEmptyOperation(root,'operation.json');
    await publishJSON(root,'operation.json',record);
    const saved=await readJSON(root,'received.json',true);
    if(saved) {
      if(saved.schema!==RESULT||saved.requestSha256!==record.requestSha256)
        throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','Reopen the original command result directory.');
      if(reopen)await reopen(saved.result);
      return saved.result;
    }
    const result=await work();
    await publishJSON(root,'received.json',{schema:RESULT,requestSha256:record.requestSha256,result});
    return result;
  },{create:true});
}
async function runCall(values) {
  const path=resolve(values.get('--request'));
  const original=await readSf61HostFile(path,1024*1024,{privateFile:true}),request=decode(original);
  exact(request,['schema','tool','arguments'],['schema','tool','arguments']);
  if(request.schema!==REQUEST||typeof request.tool!=='string'||!request.tool.startsWith('merchant_handover_'))
    throw failure('CAPTURED_HANDOVER_ARGUMENTS','Use an original captured handover command document.');
  const input={command:'call',connection:resolve(values.get('--connection')),request,
    requestFileSha256:sf61Hash(original)};
  return retained(values.get('--result'),input,async()=>{
    const agent=new MerchantCapturedHandovers(await configuration(input.connection));
    let issue;
    try{return await agent.call(request.tool,request.arguments);}
    catch(error){issue=error;throw error;}
    finally {
      try{await agent.close();}
      catch(error){if(issue)issue.closeError=error;else throw error;}
    }
  });
}
async function runFile(command,values) {
  const workspace=values.get('--workspace');
  const productId=checked(values.get('--product'),HANDOVER_SHA,'product identity');
  const expectedSha256=checked(values.get('--file-sha256'),HANDOVER_SHA,'whole archive SHA-256');
  const expectedBytes=number(values.get('--file-bytes'),1,Number.MAX_SAFE_INTEGER,'whole archive byte count');
  const connection=resolve(values.get('--connection'));
  const input={command,connection,workspace,productId,expectedSha256,expectedBytes};
  if(command==='upload')Object.assign(input,{path:resolve(values.get('--file')),
    uploadId:checked(values.get('--upload-id'),HANDOVER_UUID,'upload UUID')});
  else {
    input.id=checked(values.get('--job'),HANDOVER_UUID,'published job UUID');
    if(command==='download') {
      input.directory=resolve(values.get('--directory'));
      if(values.has('--download-id'))input.downloadId=checked(values.get('--download-id'),HANDOVER_UUID,'download UUID');
      if(values.has('--result')&&resolve(values.get('--result'))===input.directory)
        throw failure('CAPTURED_HANDOVER_ARGUMENTS','Choose separate complete-file and command-result directories.');
    } else Object.assign(input,{
      fromWorkspace:values.get('--from-workspace'),
      fromProductId:checked(values.get('--from-product'),HANDOVER_SHA,'source product identity'),
      uploadId:checked(values.get('--upload-id'),HANDOVER_UUID,'upload UUID'),
    });
  }
  return retained(values.get('--result'),input,async()=>{
    const config=await configuration(connection);
    return withClient(config,workspace,productId,async client=>{
      if(command==='upload')return client.uploadFile({
        path:input.path,expectedSha256,expectedBytes,uploadId:input.uploadId,
      });
      if(command==='download')return client.downloadFile({
        id:input.id,expectedSha256,expectedBytes,directory:input.directory,
        ...(input.downloadId?{downloadId:input.downloadId}:{}),
      });
      return withClient(config,input.fromWorkspace,input.fromProductId,source=>source.transferTo(client,{
        id:input.id,expectedSha256,expectedBytes,uploadId:input.uploadId,
      }));
    });
  },{reopen:command==='download'?async saved=>{
    const file=saved.download,archive=saved.source?.archive;
    if(file?.state!=='COMPLETE'||file.sha256!==expectedSha256||file.totalBytes!==expectedBytes||
      archive?.id!==input.id||archive.sha256!==expectedSha256||archive.bytes!==expectedBytes||
      saved.source.productId!==productId||typeof file.path!=='string')
      throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','Reopen the original complete downloaded archive.');
    // The retained reply points to a real original file. Reopen it through the
    // same held-file verifier even when its source console is now stopped.
    const original=await openCapturedHandoverArchive({
      path:file.path,expectedSha256,expectedBytes,
    });
    try{await original.assertHeld();}finally{await original.close();}
  }:undefined});
}
async function waitJob(values) {
  const id=checked(values.get('--job'),HANDOVER_UUID,'job UUID');
  const requestSha256=checked(values.get('--request-sha256'),HANDOVER_SHA,'job request SHA-256');
  const productId=checked(values.get('--product'),HANDOVER_SHA,'product identity');
  const waitMs=number(values.get('--wait-ms')??'900000',0,86400000,'wait duration of 0–86400000 milliseconds');
  const intervalMs=number(values.get('--interval-ms')??'1000',250,60000,'poll interval of 250–60000 milliseconds');
  const config=await configuration(values.get('--connection')),workspace=values.get('--workspace');
  return withClient(config,workspace,productId,async client=>{
    const deadline=Date.now()+waitMs;
    for(;;) {
      const job=await client.json('/job-page?'+new URLSearchParams({id}));
      if(job.requestSha256!==requestSha256)
        throw failure('CAPTURED_HANDOVER_REQUEST_CHANGED','Continue the original job and its saved request SHA.');
      if(['COMPLETE','INTERRUPTED'].includes(job.state)||Date.now()>=deadline)
        return {workspace,productId,native:job,waitExpired:!['COMPLETE','INTERRUPTED'].includes(job.state)};
      await new Promise(resolve=>setTimeout(resolve,Math.min(intervalMs,Math.max(0,deadline-Date.now()))));
    }
  });
}
export async function runCapturedHandoverRemoteCLI(args=process.argv.slice(2)) {
  if(!args.length||args.length===1&&['help','--help'].includes(args[0])||args.slice(1).includes('--help')) {
    process.stdout.write(HELP);return;
  }
  const [command,...rest]=args;
  let result;
  if(command==='catalog') {
    if(rest.length)throw failure('CAPTURED_HANDOVER_ARGUMENTS','Catalog takes no options.');
    result={schema:'stellar-forge.captured-handover-tool-catalog.v1',requestSchema:REQUEST,
      tools:capturedHandoverTools((name,description,properties,required,annotations)=>({
        name,description,annotations,inputSchema:{type:'object',properties,required,additionalProperties:false},
      }))};
  } else if(command==='call') {
    result=await runCall(options(rest,['--connection','--request','--result'],['--connection','--request']));
  } else if(['transfer','upload','download'].includes(command)) {
    const common=['--connection','--workspace','--product','--file-sha256','--file-bytes'];
    const extra=command==='transfer'?['--from-workspace','--from-product','--job','--upload-id']
      :command==='upload'?['--file','--upload-id']:['--job','--directory'];
    result=await runFile(command,options(rest,[...common,...extra,'--result',
      ...(command==='download'?['--download-id']:[])],[...common,...extra]));
  } else if(command==='wait') {
    const required=['--connection','--workspace','--product','--job','--request-sha256'];
    result=await waitJob(options(rest,[...required,'--wait-ms','--interval-ms'],required));
  } else throw failure('CAPTURED_HANDOVER_ARGUMENTS','Choose a captured handover remote command from --help.');
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  return result;
}
function report(error) {
  process.stderr.write((error.code?error.code+': ':'')+error.message+'\n');
  if(error.outcomeUnknown)process.stderr.write('Repeat the same original command and retained result directory to recover its native reply.\n');
  process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  runCapturedHandoverRemoteCLI().catch(report);
