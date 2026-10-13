#!/usr/bin/env node
// MIT. Configured Bank source preparations with retained requests and complete immutable artifacts.
import {constants} from 'node:fs';
import {open, mkdir, realpath, lstat, rename, unlink, link} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {resolve, join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {writePrivate, privateSupportDirectory} from './host-files.mjs';
import {connectAccountingBankSourcesClient} from './accounting-bank-sources-client.mjs';
import {BANK_SOURCE_REQUEST_BYTES,BANK_SOURCE_MAX_BYTES,validateBankSourceRequest,canonicalHash,hashBytes}
 from './accounting-bank-sources-contract.mjs';

const REQUEST = 'stellar-forge.accounting-bank-sources-client-request.v1';
const STATE = 'stellar-forge.accounting-bank-sources-client-state.v1';
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now = () => new Date().toISOString();
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code, message) => Object.assign(new Error(message), {code: 'ACCOUNTING_BANK_SOURCES_CLIENT_' + code});
function need(ok, message, code = 'ARGUMENTS') { if (!ok) throw fail(code, message); }
/** Preserve the original public recovery decision with its request identity. */
function problem(error) {
  const result = {code: error?.code ?? 'ERROR', message: String(error?.message ?? error).slice(0, 2000)};
  if (error?.applied === false) result.applied = false;
  if (error?.outcomeUnknown === true) result.outcomeUnknown = true;
  if (error?.reopenRequired === true) result.reopenRequired = true;
  if (Number.isInteger(error?.status)) result.status = error.status;
  if (error?.details !== undefined) result.details = error.details;
  if (plain(error?.commitUncertainty)) result.commitUncertainty = Object.fromEntries(
    ['at', 'action', 'revision', 'causeCode'].filter(key => error.commitUncertainty[key] !== undefined)
      .map(key => [key, error.commitUncertainty[key]]));
  for (const key of ['operationDirectory', 'requestId', 'lookupError', 'releaseError', 'checkpointError'])
    if (error?.[key] !== undefined) result[key] = error[key];
  return result;
}
function exact(value, fields) {
  need(plain(value) && Object.keys(value).every(key => fields.includes(key)),
    'The saved operation contains undeclared fields.', 'REQUEST');
}
function endpoint(url) {
  let value; try { value = new URL(url); }
  catch { throw fail('CONFIGURATION', 'Supply the existing HTTPS or loopback HTTP merchant endpoint.'); }
  need(!value.username && !value.password && !value.search && !value.hash &&
    (value.protocol === 'https:' || value.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(value.hostname)),
    'Use the original HTTPS or loopback HTTP endpoint without credentials, query or fragment.', 'CONFIGURATION');
  return value.href;
}
async function privateDirectory(path) {
  path = resolve(path); await privateSupportDirectory(path);
  const info = await lstat(path);
  need(await realpath(path) === path && (!process.getuid || info.uid === process.getuid()),
    'Use an owner-controlled private directory without symlink ancestors.', 'PRIVATE_DIRECTORY');
  return path;
}
async function readJson(path, maximum = 32 * 1024 * 1024) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const info = await file.stat();
    need(info.isFile() && info.nlink === 1 && info.size <= maximum && !(info.mode & 0o077) &&
      (!process.getuid || info.uid === process.getuid()), 'Use the original private regular JSON file.', 'PRIVATE_FILE');
    const bytes = await file.readFile();
    need(bytes.length <= maximum, 'The original operation file grew beyond its size limit.', 'PRIVATE_FILE');
    return JSON.parse(new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes));
  } finally { await file.close(); }
}
async function syncDirectory(directory) {
  const file = await open(directory, constants.O_RDONLY);
  try { await file.sync(); } finally { await file.close(); }
}

function validateRequest(request){
 exact(request,['schema','preparedAt','url','workspace','tokenEnv','request','requestSha256','sha256']);
 const {sha256,...content}=request;
 need(request.schema===REQUEST&&Number.isFinite(Date.parse(request.preparedAt))&&sha(content)===sha256&&
  endpoint(request.url)===request.url&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(request.workspace??'')&&
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(request.tokenEnv??''),'The retained operation identity changed.','REQUEST');
 const value=validateBankSourceRequest(request.request);
 need(canonicalHash(value)===request.requestSha256&&JSON.stringify(value)===JSON.stringify(request.request),
  'The reviewed complete source request changed.','REQUEST');
 return request;
}
function initialState(request){return {schema:STATE,requestSha256:request.sha256,sourceRequestSha256:request.requestSha256,
 phase:'LOCAL_PREPARED',preparedAt:request.preparedAt,updatedAt:now(),prepareAttempted:false,executeAttempted:false,observation:null};}
/** Local retention only: no server call and no source alias resolution. */
export async function prepareAccountingBankSourcesOperation({directory,url,workspace,tokenEnv='MCP_ACCESS_TOKEN',request:value}={}){
 const selected=validateBankSourceRequest(value),content={schema:REQUEST,preparedAt:now(),url:endpoint(url),workspace,tokenEnv,
  request:selected,requestSha256:canonicalHash(selected)};
 const request=validateRequest({...content,sha256:sha(content)});
 directory=resolve(directory);await privateDirectory(dirname(directory));await mkdir(directory,{mode:0o700});await privateDirectory(directory);
 await writePrivate(join(directory,'request.json'),request);
 await writePrivate(join(directory,'state.json'),initialState(request));
 await syncDirectory(directory);await syncDirectory(dirname(directory));
 return {directory,preparationId:selected.requestId,workspaceId:selected.workspaceId,requestSha256:request.requestSha256,phase:'LOCAL_PREPARED'};
}
async function operation(directory,work){
 directory=await privateDirectory(directory);const lease=await acquireStateLease(directory);let failure;
 try{
  const request=validateRequest(await readJson(join(directory,'request.json'),BANK_SOURCE_REQUEST_BYTES+65536));
  let state;try{state=await readJson(join(directory,'state.json'),32*1024*1024);}catch(error){
   if(error.code!=='ENOENT')throw error;
   // An interrupted local prepare has an exclusive complete request but no state.
   // Reconciliation always reads the remote original before either mutation.
   state=initialState(request);lease.assertHeld();await writePrivate(join(directory,'state.json'),state);await syncDirectory(directory);
  }
  need(state.schema===STATE&&state.requestSha256===request.sha256&&state.sourceRequestSha256===request.requestSha256&&
   typeof state.prepareAttempted==='boolean'&&typeof state.executeAttempted==='boolean','The saved state belongs to another request.','STATE');
  async function checkpoint(changes){
   lease.assertHeld();const next={...state,...changes,updatedAt:now()},temporary=join(directory,'state-'+randomUUID()+'.next');
   try{await writePrivate(temporary,next);lease.assertHeld();await rename(temporary,join(directory,'state.json'));await syncDirectory(directory);Object.assign(state,next);}
   finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  }
  return await work({directory,request,state,checkpoint});
 }catch(error){failure=error;throw error;}
 finally{try{await lease.close();}catch(error){if(failure)failure.releaseError=problem(error);else throw error;}}
}
async function connected(context,{client:provided,environment=process.env,signal}={},work){
 const {request}=context;let client,failure;
 try{
  client=provided??await connectAccountingBankSourcesClient({url:request.url,workspace:request.workspace,tokenEnv:request.tokenEnv,environment,signal});
  need(client.workspace===request.workspace&&(!client.endpoint||client.endpoint===request.url),'Use the saved endpoint and workspace.','CONNECTION_BINDING');
  await client.open({requestSignal:signal});return await work(client);
 }catch(error){failure=error;error.operationDirectory=context.directory;error.requestId=request.request.requestId;throw error;}
 finally{if(client&&!provided)try{await client.disconnect();}catch(error){if(failure)failure.releaseError=problem(error);else throw error;}}
}
/** Observe first. retain resumes custody only; execute additionally runs the original pure source transform. */
export async function runAccountingBankSourcesOperation({directory,mode='reconcile',client,environment=process.env,signal}={}){
 need(['reconcile','retain','execute'].includes(mode),'Choose reconcile, retain or execute.');signal?.throwIfAborted();
 return operation(directory,context=>connected(context,{client,environment,signal},async client=>{
  const {request,state,checkpoint}=context,source=request.request;
  let observed=await client.reconcileRequest(source,{requestSignal:signal});
  if(state.observation?.sourceSha256)need(observed.state!=='NOT_FOUND'&&observed.sourceSha256===state.observation.sourceSha256,
   'The retained preparation source identity changed or disappeared.','SOURCE_CHANGED');
  await checkpoint({phase:observed.state,observation:observed,lookupError:null});
  const attempted=[];
  async function submit(stage,call){
   await checkpoint({phase:stage==='prepare'?'PREPARING':'EXECUTING',
    [stage==='prepare'?'prepareAttempted':'executeAttempted']:true,attemptedAt:now(),lastFailure:null});
   attempted.push(stage);
   try{return await call();}
   catch(error){
    try{await checkpoint({phase:'UNOBSERVED_REPLY',lastFailure:problem(error)});}catch(e){error.checkpointError=problem(e);throw error;}
    let found;
    try{found=await client.reconcileRequest(source,{timeoutMs:10000});await checkpoint({phase:found.state,observation:found});}
    catch(e){error.lookupError=problem(e);try{await checkpoint({lookupError:problem(e)});}catch(c){error.checkpointError=problem(c);}throw error;}
    // Lost prepare replies may have completed custody. Lost execute replies need COMPLETE.
    if(found.state==='COMPLETE'||stage==='prepare'&&found.state==='PREPARED')return found;
    throw error;
   }
  }
  if(mode!=='reconcile'&&['NOT_FOUND','RETAINING'].includes(observed.state)){
   observed=await submit('prepare',()=>client.prepare({request:source},{requestSignal:signal}));
   await checkpoint({phase:observed.state,observation:observed});
  }
  if(mode==='execute'&&observed.state==='PREPARED'){
   observed=await submit('execute',()=>client.execute({preparationId:source.requestId,expectedRequestSha256:request.requestSha256},{requestSignal:signal}));
   await checkpoint({phase:observed.state,observation:observed});
  }
  return {directory:context.directory,mode,preparationId:source.requestId,requestSha256:request.requestSha256,
   state:observed.state,attempted,receipt:observed,previouslyAttempted:{prepare:state.prepareAttempted,execute:state.executeAttempted}};
 }));
}
async function existingFile(output,pin){
 let handle;try{handle=await open(output,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));}
 catch(error){if(error.code==='ENOENT')return false;throw error;}
 try{
  const st=await handle.stat();need(st.isFile()&&st.nlink===1&&!(st.mode&0o077)&&(!process.getuid||st.uid===process.getuid())&&st.size===pin.bytes,
   'Preserve the existing different output; select a new private destination.','OUTPUT_EXISTS');
  const digest=createHash('sha256');let bytes=0;for await(const block of handle.createReadStream({autoClose:false})){digest.update(block);bytes+=block.length;}
  need(bytes===pin.bytes&&digest.digest('hex')===pin.sha256,'The existing output differs from the retained complete file.','OUTPUT_EXISTS');return true;
 }finally{await handle.close();}
}
/** Reopen exact completed bytes or publish a new complete file once. */
export async function downloadAccountingBankSourceFile({client,receipt,file,output,chunkBytes=65536,maximumBytes=BANK_SOURCE_MAX_BYTES,signal}={}){
 need(client&&typeof client.fileChunks==='function','Use the original source file reader.');
 const pin=receipt?.files?.find(x=>x.name===file);need(pin&&Number.isSafeInteger(maximumBytes)&&maximumBytes>0&&maximumBytes<=BANK_SOURCE_MAX_BYTES&&
  pin.bytes<=maximumBytes,'Select a retained complete file within the byte limit.','FILE_SIZE');
 output=resolve(output);const directory=await privateDirectory(dirname(output));
 if(await existingFile(output,pin))return {output,file:pin,complete:true,existing:true};
 const temporary=join(directory,'bank-source-'+randomUUID()+'.partial'),handle=await open(temporary,'wx',0o600);
 let size=0,failure;
 try{
  const digest=createHash('sha256');
  for await(const chunk of client.fileChunks(receipt,file,{chunkBytes,signal})){
   need(size+chunk.bytes.length<=pin.bytes,'The original file exceeds its retained size.','FILE');
   await handle.writeFile(chunk.bytes);digest.update(chunk.bytes);size+=chunk.bytes.length;
  }
  need(size===pin.bytes&&digest.digest('hex')===pin.sha256,'The downloaded original file differs.','FILE');
  await handle.sync();await handle.close();
  try{await link(temporary,output);}catch(error){if(error.code!=='EEXIST')throw error;await existingFile(output,pin);}
  await unlink(temporary);await syncDirectory(directory);return {output,file:pin,complete:true,existing:false};
 }catch(error){failure=error;throw error;}
 finally{await handle.close().catch(()=>{});try{await unlink(temporary);}catch(error){if(error.code!=='ENOENT'){if(failure)failure.releaseError=problem(error);else throw error;}}}
}
async function publishJson(output,value){
 const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n'),pin={bytes:bytes.length,sha256:hashBytes(bytes)};
 output=resolve(output);const directory=await privateDirectory(dirname(output));
 if(await existingFile(output,pin))return output;
 const temporary=join(directory,'bank-source-json-'+randomUUID()+'.partial');
 try{await writePrivate(temporary,bytes);try{await link(temporary,output);}catch(error){if(error.code!=='EEXIST')throw error;await existingFile(output,pin);}
  await syncDirectory(directory);return output;
 }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
/** Download the original receipt inventory; no source or financial action is performed. */
export async function downloadAccountingBankSourcesOperation({directory,file,output,all=false,client,environment=process.env,signal}={}){
 need(typeof all==='boolean'&&(all?file===undefined:typeof file==='string'),'Select one exact file or the whole retained preparation.');
 return operation(directory,context=>connected(context,{client,environment,signal},async client=>{
  const receipt=await client.reconcileRequest(context.request.request,{requestSignal:signal});
  if(context.state.observation?.sourceSha256)need(receipt.sourceSha256===context.state.observation.sourceSha256,
   'The retained preparation source identity changed.','SOURCE_CHANGED');
  need(receipt.state!=='NOT_FOUND','The original preparation is not retained.');
  if(!all)return downloadAccountingBankSourceFile({client,receipt,file,output,signal});
  need(receipt.state==='COMPLETE','Download-all selects the complete immutable preparation.');
  output=resolve(output);await privateDirectory(dirname(output));
  try{await mkdir(output,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  await privateDirectory(output);
  // Own the export directory before writing any artifact.
  const marker={schema:'stellar-forge.accounting-bank-sources-export.v1',workspace:context.request.workspace,
   workspaceId:receipt.workspaceId,preparationId:receipt.preparationId,requestSha256:receipt.requestSha256,files:receipt.files};
  await publishJson(join(output,'bank-source-export.json'),marker);
  const files=[];for(const pin of receipt.files)files.push(await downloadAccountingBankSourceFile({client,receipt,file:pin.name,output:join(output,pin.name),signal}));
  const after=await client.reconcileRequest(context.request.request,{requestSignal:signal});
  need(canonicalHash(after)===canonicalHash(receipt),'The completed artifact changed during export.','OBSERVATION_CHANGED');
  await publishJson(join(output,'preparation-receipt.json'),receipt);
  return {directory:context.directory,output,preparationId:receipt.preparationId,complete:true,files};
 }));
}
function options(args,allowed){const values=new Map();for(let i=0;i<args.length;i+=2){
 need(allowed.includes(args[i])&&!values.has(args[i])&&args[i+1]!==undefined,'Use documented option/value pairs without duplicates.');
 values.set(args[i],args[i+1]);}return values;}
function required(values,name){need(values.has(name)&&values.get(name),'Supply '+name+'.');return values.get(name);}
const HELP=`Configured Bank sources through the original Merchant accounting owner

node accounting-bank-sources-cli.mjs status|source|list|request|view --url URL --workspace ALIAS [--request PRIVATE_JSON] [--all true] [--out NEW_PRIVATE_JSON]
node accounting-bank-sources-cli.mjs prepare --dir NEW_PRIVATE_OPERATION --url URL --workspace ALIAS --request COMPLETE_SOURCE_REQUEST [--token-env NAME]
node accounting-bank-sources-cli.mjs retain|execute|reconcile --dir ORIGINAL_OPERATION
node accounting-bank-sources-cli.mjs download --dir ORIGINAL_OPERATION --file EXACT_RECEIPT_NAME --out PRIVATE_FILE
node accounting-bank-sources-cli.mjs download-all --dir ORIGINAL_OPERATION --out PRIVATE_DIRECTORY
node accounting-bank-sources-cli.mjs open|workspace-close --url URL --workspace ALIAS [--token-env NAME]

prepare is local only; retain receives original pinned inputs; execute retains then transforms; reconcile reads the original preparation.
All operations keep requestId, workspaceId, source pins and original createdAt. An unfinished RETAINING receipt resumes through exact prepare.
No account, statement import, match, receipt, balance or close is changed. The financial Bank workflow remains separate.
source --request uses {sourceAlias,name}; request uses {preparationId}; view supports section/itemId/statementId/profileId.
list --all true keeps the original inventory SHA; view --all true keeps the immutable COMPLETE receipt and consumes every whole row.
A VIEW_SIZE error requires downloading the named complete report. Nothing is shortened.
Tokens stay in the selected environment variable. Disconnect drains owned reads without closing the shared workspace.
Exit 0 COMPLETE/read/local prepare; 3 retained operation not COMPLETE; 2 error. No automatic retry loop.
`;
export async function main(args=process.argv.slice(2)){
 if(!args.length||args.length===1&&['help','--help'].includes(args[0])){process.stdout.write(HELP);return;}
 const [command,...rest]=args;let result;
 if(command==='prepare'){
  const v=options(rest,['--dir','--url','--workspace','--request','--token-env']);
  result=await prepareAccountingBankSourcesOperation({directory:required(v,'--dir'),url:required(v,'--url'),workspace:required(v,'--workspace'),
   tokenEnv:v.get('--token-env')??'MCP_ACCESS_TOKEN',request:await readJson(resolve(required(v,'--request')),BANK_SOURCE_REQUEST_BYTES)});
 }else if(['retain','execute','reconcile'].includes(command)){
  const v=options(rest,['--dir']);result=await runAccountingBankSourcesOperation({directory:required(v,'--dir'),mode:command});
 }else if(['download','download-all'].includes(command)){
  const v=options(rest,['--dir','--out',...(command==='download'?['--file']:[])]);
  result=await downloadAccountingBankSourcesOperation({directory:required(v,'--dir'),output:required(v,'--out'),all:command==='download-all',
   ...(command==='download'?{file:required(v,'--file')}:{})});
 }else{
  need(['open','workspace-close','status','source','list','request','view'].includes(command),'Choose a documented source command.');
  const v=options(rest,['--url','--workspace','--token-env','--out',...(!['open','workspace-close','status'].includes(command)?['--request']:[]),
   ...(['list','view'].includes(command)?['--all']:[])]);
  if(v.has('--all'))need(v.get('--all')==='true','Use --all true for complete paging.');
  const client=await connectAccountingBankSourcesClient({url:required(v,'--url'),workspace:required(v,'--workspace'),tokenEnv:v.get('--token-env')??'MCP_ACCESS_TOKEN'});let failure;
  try{
   if(command==='workspace-close')result=await client.closeWorkspace();
   else{result=await client.open();
    if(command!=='open'){
     const input=v.has('--request')?await readJson(resolve(v.get('--request')),BANK_SOURCE_REQUEST_BYTES):{};
     if(['source','request','view'].includes(command))required(v,'--request');
     if(v.has('--all')&&command==='list'){need(Object.keys(input).length===0,'Complete inventory paging supplies its own offsets.');result=await client.listAll();}
     else if(v.has('--all')&&command==='view')result=await client.viewAll(input);
     else result=await client[command](input);
    }
   }
   if(v.has('--out'))result={output:await publishJson(v.get('--out'),result),complete:true};
  }catch(error){failure=error;throw error;}
  finally{if(command!=='workspace-close'||failure)try{await client.disconnect();}catch(error){if(failure)failure.releaseError=problem(error);else throw error;}}
 }
 process.stdout.write(JSON.stringify(result)+'\n');
 if(['retain','execute','reconcile'].includes(command)&&result.state!=='COMPLETE')process.exitCode=3;
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(error=>{process.stderr.write(JSON.stringify({error:problem(error)})+'\n');process.exitCode=2;});
