#!/usr/bin/env node
// MIT. The same retained captured handover operations from an ordinary terminal.
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readHarWorkspaceConfiguration } from '../../stellar-forge/mcp-merchant-operator/har-workspace.mjs';
import { readSf61HostFile, sf61Hash } from '../../stellar-forge/mcp-merchant-operator/sf61-connection.mjs';
import { MerchantCapturedHandovers } from './handover-agent.mjs';
import { openCapturedHandoverClient } from './handover-client.mjs';
import { openCapturedHandoverArchive } from './handover-archive.mjs';
import { readCapturedWorkingEdit } from './draft-reconciliation.mjs';
import { capturedHandoverTools, HANDOVER_SHA, HANDOVER_UUID } from './handover-catalog.mjs';
import { canonical, decode, exact, operation, requireEmptyOperation, publishJSON, publishBytes, readJSON, bytes, present, METADATA_LIMIT } from './handover-files.mjs';

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
  starforge captured-api handover remote working-export
      --connection ORIGINAL_HAR_CONNECTION.json
      --workspace ORIGINAL_ALIAS --product ORIGINAL_PRODUCT_SHA
      --draft ORIGINAL_DRAFT_UUID --base ORIGINAL_BASE_SHA
      --form COMPLETE_WORKING_FORM.json --directory PRIVATE_EXPORT_DIRECTORY
  starforge captured-api handover remote working-import
      --connection ORIGINAL_HAR_CONNECTION.json
      --workspace ORIGINAL_ALIAS --product ORIGINAL_PRODUCT_SHA
      --file ORIGINAL_WORKING_EDIT.json --directory PRIVATE_IMPORT_DIRECTORY
  starforge captured-api handover remote edition-export
      --connection ORIGINAL_HAR_CONNECTION.json
      --workspace ORIGINAL_ALIAS --product ORIGINAL_PRODUCT_SHA
      --job ORIGINAL_COMPARE_UUID --comparison-sha256 ORIGINAL_COMPARISON_SHA
      --directory PRIVATE_COMPLETE_EXPORT_DIRECTORY
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

working-export publishes the exact full working-edit file and its native export.
working-import retains that original file, native base verification, complete working
form and a ready merge-review command. Both reuse their original private directory
and completed native reply when reopened. Continue merge_review and merge_save
through call with the same complete reviewed fields and original request UUID.

edition-export retains the original comparison index and ALL complete installed,
incoming and comparison JSON files. Interrupted output publication resumes from
the same immutable index/file hashes. A completed export reopens with its host
stopped; each original native read uses a retained snapshot and bounded chunks.

See products/captured-api/EDITIONS.md and AGENT.md for the whole reviewed collection, transfer,
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
async function retained(directory,request,work,{reopen,prepare}={}) {
  if(!directory)return work();
  return operation(resolve(directory),async root=>{
    await requireEmptyOperation(root,'operation.json');
    if(prepare) {
      const original=await readJSON(root,'operation.json',true);
      if(original&&(original.schema!==OPERATION||
        original.requestSha256!==sf61Hash(Buffer.from(canonical(original.request)))))
        throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','Reopen the original complete terminal operation.');
      request=await prepare(root,original?.request);
    }
    const record={schema:OPERATION,requestSha256:sf61Hash(Buffer.from(canonical(request))),request};
    await publishJSON(root,'operation.json',record);
    const saved=await readJSON(root,'received.json',true);
    if(saved) {
      if(saved.schema!==RESULT||saved.requestSha256!==record.requestSha256)
        throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','Reopen the original command result directory.');
      if(reopen)await reopen(saved.result,root);
      return saved.result;
    }
    const result=await work(root);
    await publishJSON(root,'received.json',{schema:RESULT,requestSha256:record.requestSha256,result});
    return result;
  },{create:true});
}
async function runCall(values) {
  const path=resolve(values.get('--request'));
  const original=await readSf61HostFile(path,8*1024*1024,{privateFile:true}),request=decode(original);
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
async function runWorking(command,values) {
  const connection=resolve(values.get('--connection')),workspace=values.get('--workspace');
  const productId=checked(values.get('--product'),HANDOVER_SHA,'product identity');
  const directory=resolve(values.get('--directory')),sourcePath=resolve(values.get(command==='working-export'?'--form':'--file'));
  const selection={command,connection,workspace,productId,sourcePath,...(command==='working-export'?{
    id:checked(values.get('--draft'),HANDOVER_UUID,'draft UUID'),
    baseRevision:checked(values.get('--base'),HANDOVER_SHA,'original draft base SHA-256'),
  }:{})};
  let source,input;
  async function prepare(root,original) {
    if(original) {
      const selected=Object.fromEntries(Object.keys(selection).map(key=>[key,original[key]]));
      if(canonical(selected)!==canonical(selection)||typeof original.sourceContent!=='string')
        throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','Use this directory’s original working-edit command and selected file.');
    }
    try {source=await readSf61HostFile(sourcePath,4*1024*1024,{privateFile:command==='working-export'});}
    catch(error) {
      if(error.code!=='ENOENT'||!original)throw error;
      source=Buffer.from(original.sourceContent,'utf8');
    }
    const sourceContent=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(source);
    input={...selection,sourceSha256:sf61Hash(source),sourceBytes:source.length,sourceContent};
    if(command==='working-export')input.working=decode(source);
    else {
      const packet=readCapturedWorkingEdit(decode(source));
      if(packet.productId!==productId)
        throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','Read the working edit in its original captured product.');
    }
    if(original&&canonical(input)!==canonical(original))
      throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','The selected file changed. Use the original file or a new working-edit directory.');
    return input;
  }
  function validate(native) {
    if(native.productId!==productId)
      throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','Reopen the original captured product working-edit operation.');
    if(command==='working-export') {
      const encoded=Buffer.from(native.content??'','utf8');
      if(native.schema!=='stellar-forge.captured-working-export.v1'||native.id!==input.id||
        native.baseRevision!==input.baseRevision||native.bytes!==encoded.length||native.sha256!==sf61Hash(encoded))
        throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','Reopen the complete original working-edit export.');
      return encoded;
    }
    if(native.schema!=='stellar-forge.captured-working-import.v1'||native.sha256!==input.sourceSha256||
      native.bytes!==input.sourceBytes||!native.working||!HANDOVER_UUID.test(native.id??'')||
      !HANDOVER_SHA.test(native.baseRevision??''))
      throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','Reopen the complete original working-edit import.');
    return source;
  }
  async function publish(root,native) {
    await publishBytes(root,'working-edit.json',validate(native));
    if(command==='working-import') {
      await publishJSON(root,'working-form.json',native.working);
      await publishJSON(root,'merge-review-command.json',{schema:REQUEST,tool:'merchant_handover_merge_review',
        arguments:{workspace,expectedProductId:productId,id:native.id,baseRevision:native.baseRevision,
          working:native.working,view:'conflicts',offset:0,limit:100}});
    }
  }
  return retained(directory,selection,async root=>{
    let native=await readJSON(root,'native-working.json',true);
    if(!native) {
      native=await withClient(await configuration(connection),workspace,productId,client=>command==='working-export'
        ?client.exportWorkingEdit({id:input.id,baseRevision:input.baseRevision,working:input.working})
        :client.importWorkingEdit({content:source.toString('utf8'),expectedSha256:input.sourceSha256}));
      validate(native);await publishJSON(root,'native-working.json',native);
    }
    await publish(root,native);
    return {workspace,productId,command,directory,id:native.id,baseRevision:native.baseRevision,
      bytes:native.bytes,sha256:native.sha256,workingFile:join(root,'working-edit.json'),
      nativeFile:join(root,'native-working.json'),
      ...(command==='working-import'?{formFile:join(root,'working-form.json'),
        reviewCommandFile:join(root,'merge-review-command.json')}:{})};
  },{prepare,reopen:async(saved,root)=>{
    const native=await readJSON(root,'native-working.json');
    validate(native);
    if(saved.command!==command||saved.productId!==productId||saved.workingFile!==join(root,'working-edit.json')||
      saved.id!==native.id||saved.baseRevision!==native.baseRevision||saved.sha256!==native.sha256||saved.bytes!==native.bytes)
      throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','Reopen this original complete working-edit directory.');
    // The first verified native reply retains complete file bytes. Publication
    // recovery finishes only those same files, even after the original host stops.
    await publish(root,native);
    const complete=await bytes(root,'working-edit.json',4*1024*1024);
    if(complete.length!==native.bytes||sf61Hash(complete)!==native.sha256)
      throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','The retained original working-edit file changed.');
  }});
}
async function runEditionExport(values) {
  const selection={command:'edition-export',connection:resolve(values.get('--connection')),
    workspace:values.get('--workspace'),productId:checked(values.get('--product'),HANDOVER_SHA,'product identity'),
    id:checked(values.get('--job'),HANDOVER_UUID,'original COMPARE UUID'),
    comparisonSha256:checked(values.get('--comparison-sha256'),HANDOVER_SHA,'original comparison SHA-256')};
  const output=resolve(values.get('--directory'));
  const indexName='native-inputs/edition-index.json';
  function validate(index) {
    const native=index.result;
    if(index.schema!=='stellar-forge.captured-edition-export.v1'||index.productId!==selection.productId||
      native?.schema!=='stellar-forge.captured-incoming-editions.v1'||native.id!==selection.id||
      native.comparisonSha256!==selection.comparisonSha256||!Array.isArray(native.packages)||
      native.packages.length>1000||sf61Hash(Buffer.from(canonical(native.binding.product)))!==selection.productId)
      throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','Reopen the original complete comparison export and product identity.');
    const {comparisonSha256,...core}=native;
    if(sf61Hash(Buffer.from(canonical(core)))!==comparisonSha256)
      throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','The retained original comparison index changed.');
    return native;
  }
  async function complete(root) {
    let client,issue;
    const connected=async()=>{
      if(!client)client=await openCapturedHandoverClient(
        definition(await configuration(selection.connection),selection.workspace),{expectedProductId:selection.productId});
      return client;
    };
    try {
      let index=await readJSON(root,indexName,true);
      if(!index) {
        const original=await (await connected()).json('/job?'+new URLSearchParams({id:selection.id}));
        if(original.command!=='COMPARE'||original.state!=='COMPLETE'||original.id!==selection.id)
          throw failure('CAPTURED_HANDOVER_COMPARISON_PENDING','Finish the original COMPARE job before exporting all its complete files.');
        index={schema:'stellar-forge.captured-edition-export.v1',productId:selection.productId,result:original.result};
        validate(index);await publishJSON(root,indexName,index);
      }
      const native=validate(index),files=[];
      for(const row of native.packages) {
        if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(row.name??''))
          throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','The original comparison package name changed.');
        for(const side of ['current','incoming','comparison']) {
          const file=row.files[side],name='native-inputs/'+row.name+'-'+side+'.json';
          if(!HANDOVER_SHA.test(file?.sha256??'')||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>METADATA_LIMIT)
            throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','The original comparison file metadata changed.');
          if(!await present(join(root,name))) {
            const downloaded=await (await connected()).downloadEditionFile({
              id:selection.id,name:row.name,side,expectedComparisonSha256:selection.comparisonSha256,
              expectedSha256:file.sha256,
            });
            if(downloaded.file.bytes!==file.bytes)
              throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','The original complete comparison file length changed.');
            await publishBytes(root,name,downloaded.content);
          }
          const original=await bytes(root,name,METADATA_LIMIT);
          if(original.length!==file.bytes||sf61Hash(original)!==file.sha256)
            throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','The retained comparison export file changed: '+name);
          files.push({name,path:join(root,name),bytes:file.bytes,sha256:file.sha256});
        }
      }
      return {command:selection.command,workspace:selection.workspace,productId:selection.productId,
        id:selection.id,comparisonSha256:selection.comparisonSha256,directory:root,
        index:join(root,indexName),packages:native.packages.length,files};
    } catch(error){issue=error;throw error;}
    finally {
      if(client)try{await client.close();}
      catch(error){if(issue)issue.closeError=error;else throw error;}
    }
  }
  return retained(output,selection,complete,{reopen:async(saved,root)=>{
    // Existing complete files are verified before opening any connection.
    // Recovery publishes only missing original files from their exact source.
    const original=await complete(root);
    if(canonical(saved)!==canonical(original))
      throw failure('CAPTURED_HANDOVER_RESULT_CHANGED','Reopen the exact original complete comparison export directory.');
  }});
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
  } else if(['working-export','working-import'].includes(command)) {
    const common=['--connection','--workspace','--product','--directory'];
    const extra=command==='working-export'?['--draft','--base','--form']:['--file'];
    result=await runWorking(command,options(rest,[...common,...extra],[...common,...extra]));
  } else if(command==='edition-export') {
    const required=['--connection','--workspace','--product','--job','--comparison-sha256','--directory'];
    result=await runEditionExport(options(rest,required,required));
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
