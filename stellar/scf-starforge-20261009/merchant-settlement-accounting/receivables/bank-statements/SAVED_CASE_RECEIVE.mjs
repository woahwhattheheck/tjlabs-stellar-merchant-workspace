// SPDX-License-Identifier: MIT
// Continue the already saved original bank case through its remaining browser and receiving work.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,rename,stat,open,link,unlink,lstat,readdir,realpath} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fstatSync,lstatSync} from 'node:fs';
import {openAccountingWorkspace} from '../../workspace/store.mjs';
import {ReceivablesWorkspace} from '../store.mjs';
import {createReceivablesServer} from '../server.mjs';
import {BankStatementsWorkspace} from './store.mjs';
import {BankStatementsClient} from './client.mjs';
import {receiveBankBrowser} from './BROWSER_RECEIVE.mjs';
import {json,sha} from '../core.mjs';

const OPERATION='SCF-MERCHANT-BANK-RECONCILIATION-DFF77-20261012';
const ORIGINAL={
 directory:'/dev/dff77-bank-native-_c0twq6j/cases/merchant-bank-gxw5Sv/accounting',
 createdAt:'2026-10-12T23:15:12.559Z',revision:66,
 caseSha256:'6bbfbba8cb195aa1d89def502a285addf5e6e152eba3d89c27960cb1966139ed',
 accountId:'e52710f6-b132-484e-8a77-fee8e7b04c3c',
 customerId:'e778f0e5-d8fa-49e4-93c0-f2d52bf0b33b',
 importId:'a216f98c-0fda-4308-8eb2-8dee1e7bf465',
 originalCloseId:'005c43f3-4c2f-48d9-881a-11e54ae11aea',
 finalCloseId:'c837efc5-675d-458f-ba68-8a2985553433',
 receiptId:'28d3c5eb-2bcd-4e9b-9d49-544518f66eaa',
 requestId:'6a1eeea8-9e8f-43e5-b42d-c7e5c8b78ddf',
 partialOriginalCloseId:'f36b4e4c-bcc2-4ffd-ac85-b8ab28b14202',
 partialFinalCloseId:'873191be-cb3b-4a1a-b9cc-6239587bca69'
};
function retainReceivingGuard(){
 const configured=process.env.SCF_BANK_RECEIVING_FD;if(configured===undefined)return null;
 assert(/^\d+$/.test(configured),'Original receiving descriptor');const fd=Number(configured);
 assert(Number.isSafeInteger(fd)&&fd>=3,'Retain the original receiving descriptor');
 const path=process.env.SCF_BANK_RECEIVING_LOCK;assert(path&&resolve(path)===path,'Original receiving lock path');
 const descriptor=fstatSync(fd),named=lstatSync(path);
 assert(descriptor.isFile()&&named.isFile()&&!named.isSymbolicLink()&&!(named.mode&0o077),'Private original receiving lock');
 assert.equal(descriptor.dev,named.dev);assert.equal(descriptor.ino,named.ino);
 if(process.getuid)assert.equal(descriptor.uid,process.getuid());
 return {fd,path};
}
async function saved(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function atomic(path,value){const temp=path+'.tmp-'+randomUUID(),handle=await open(temp,'wx',0o600);try{await handle.writeFile(json(value));await handle.sync();}finally{await handle.close();}await rename(temp,path);const parent=await open(dirname(path),'r');try{await parent.sync();}finally{await parent.close();}}
function tarEntries(bytes){
 const result=new Map();let offset=0;
 while(offset+512<=bytes.length){
  const header=bytes.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;
  const leaf=header.subarray(0,100).toString('utf8').replace(/\0.*$/,''),prefix=header.subarray(345,500).toString('utf8').replace(/\0.*$/,'');
  const name=prefix?prefix+'/'+leaf:leaf;
  const size=parseInt(header.subarray(124,136).toString('ascii').replace(/\0.*$/,'').trim(),8);
  assert(Number.isSafeInteger(size)&&size>=0&&offset+512+size<=bytes.length,'Complete retained archive member');
  assert(!result.has(name),'Unique retained archive filename');
  result.set(name,bytes.subarray(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512;
 }
 return result;
}
function verifyArchive(bytes){
 const entries=tarEntries(bytes),manifest=JSON.parse(entries.get('manifest.json'));
 for(const [name,value] of Object.entries(manifest.files)){
  assert(entries.has(name),'Complete retained file '+name);
  assert.equal(entries.get(name).length,value.bytes,name);
  assert.equal(sha(entries.get(name)),value.sha256,name);
 }
 assert(entries.has('editable-reconciliation.json'),'Editable original reconciliation');
 return {bytes:bytes.length,sha256:sha(bytes),files:entries.size};
}
async function preserveExact(path,bytes){
 let predecessor=null;
 try{
  const metadata=await lstat(path);assert(metadata.isFile()&&!metadata.isSymbolicLink(),'Regular original output: '+path);
  const observed=await readFile(path);
  if(observed.equals(bytes))return {path,bytes:bytes.length,sha256:sha(bytes)};
  assert(observed.length<bytes.length&&observed.equals(bytes.subarray(0,observed.length)),
   'Retained complete output differs from its original source: '+path);
  predecessor={path:path+'.interrupted-'+randomUUID(),bytes:observed.length,sha256:sha(observed)};
  await rename(path,predecessor.path);
 }catch(error){if(error.code!=='ENOENT')throw error;}
 const temp=path+'.receiving-'+randomUUID(),handle=await open(temp,'wx',0o600);
 try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
 assert.deepEqual(await readFile(temp),bytes,'Complete original output before publication');
 try{await link(temp,path);}catch(error){
  if(error.code!=='EEXIST')throw error;
  assert.deepEqual(await readFile(path),bytes,'Concurrent retained output remains the same');
 }
 await unlink(temp);
 const parent=await open(dirname(path),'r');try{await parent.sync();}finally{await parent.close();}
 return {path,bytes:bytes.length,sha256:sha(bytes),...(predecessor?{recoveredPredecessor:predecessor}:{})};
}

/** Keep the original complete case durable before a provider can retire its native namespace. */
async function retainNativeCaseCheckpoint(root,directory,progress){
 const configured=process.env.SCF_BANK_CHECKPOINT_ROOT;if(!configured)return null;
 const target=resolve(configured);assert.equal(target,configured,'Absolute original checkpoint directory');
 assert(target!==root&&!target.startsWith(root+'/')&&!root.startsWith(target+'/'),'Keep checkpoint storage separate from the native case');
 await mkdir(target,{recursive:true,mode:0o700});
 const info=await lstat(target);
 assert(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077),'Private real checkpoint directory');
 assert.equal(await realpath(target),target,'Real checkpoint ancestors');
 const objects=join(target,'objects'),manifests=join(target,'manifests');
 for(const path of [objects,manifests])await mkdir(path,{recursive:true,mode:0o700});
 const before=await readFile(join(directory,'workspace.json')),state=JSON.parse(before.toString('utf8'));
 assert.equal(state.createdAt,ORIGINAL.createdAt);assert.equal(state.revision,progress.revision);
 const ordered=[],directories=[];
 const visit=async(folder,relative='')=>{
  const entries=(await readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
  for(const entry of entries){
   const path=join(folder,entry.name),name=relative?relative+'/'+entry.name:entry.name,metadata=await lstat(path);
   assert(!metadata.isSymbolicLink(),'Retain real original case entries: '+name);
   if(metadata.isDirectory()){directories.push(name);await visit(path,name);continue;}
   assert(metadata.isFile(),'Regular original case file: '+name);ordered.push({path,name,metadata});
  }
 };
 await visit(root);
 const priority=name=>name==='accounting/workspace.json'?0:name==='complete-handover/saved-case-continuation.json'?1:name==='complete-handover/browser/browser-result.json'?2:name.startsWith('accounting/bank-statements/imports/')?3:name.startsWith('accounting/')?4:5;
 ordered.sort((a,b)=>priority(a.name)-priority(b.name)||a.name.localeCompare(b.name));
 const files=[];
 for(const {path,name,metadata}of ordered){
  const bytes=await readFile(path);
  assert.equal(bytes.length,metadata.size,'Complete original file before checkpoint: '+name);
  files.push({path:name,bytes:bytes.length,sha256:sha(bytes)});
 }
 assert.deepEqual(await readFile(join(directory,'workspace.json')),before,'One original workspace revision per checkpoint inventory');
 const workspace=files.find(file=>file.path==='accounting/workspace.json');assert.equal(workspace?.sha256,sha(before));
 const manifest={schema:'stellar-forge.merchant-bank-native-case-checkpoint.v1',operation:OPERATION,
  originalCaseSha256:ORIGINAL.caseSha256,originalRoot:root,accountingDirectory:directory,
  workspaceId:progress.workspaceId,createdAt:state.createdAt,revision:state.revision,sourceConfiguration:state.sources,
  retainedAt:new Date().toISOString(),browserStatus:progress.status,directories,files};
 const bytes=Buffer.from(json(manifest)),hash=sha(bytes),name=String(state.revision)+'-'+hash+'.json';
 await preserveExact(join(manifests,name),bytes);
 const pointer={schema:manifest.schema,operation:OPERATION,manifest:'manifests/'+name,
  bytes:bytes.length,sha256:hash,revision:state.revision,workspaceSha256:workspace.sha256};
 await atomic(join(target,'CANDIDATE.json'),{...pointer,complete:false});
 for(const file of files){
  const body=await readFile(join(root,file.path));
  assert.equal(body.length,file.bytes);assert.equal(sha(body),file.sha256,'Original source stayed unchanged while receiving: '+file.path);
  await preserveExact(join(objects,file.sha256),body);
 }
 assert.deepEqual(await readFile(join(directory,'workspace.json')),before,'One complete original workspace revision per checkpoint');
 await atomic(join(target,'CURRENT.json'),{...pointer,complete:true});
 return {revision:state.revision,files:files.length,bytes:files.reduce((n,file)=>n+file.bytes,0),manifest:name,sha256:hash};
}

function browserHasMutations(data){
 return data.bankStatements.transactions.some(row=>String(row.providerId??'').startsWith('BROWSER-'))||
  data.invoices.some(row=>JSON.stringify(row).includes('Original browser receiving implementation'));
}

/**
 * This is the continuation of the named retained operating case. It reconstructs
 * the scenario from its durable original records and enters the existing browser
 * receiver once. The financial intake, receipt, correction and partial-payment
 * initialization already present in revision 66 are kept as the original history.
 */
export async function receiveSavedBankCase({directory=process.env.SCF_BANK_EXISTING,
 browserExecutable=process.env.SCF_BANK_CHROMIUM}={}){
 const receivingGuard=retainReceivingGuard();
 directory=resolve(directory??'');assert.equal(directory,ORIGINAL.directory,'Receive the original accounting path to preserve its workspace binding');
 const root=dirname(directory),outputDir=join(root,'complete-handover'),browserDir=join(outputDir,'browser');
 await mkdir(outputDir,{recursive:true,mode:0o700});
 const journalPath=join(outputDir,'saved-case-continuation.json');
 const previous=await saved(journalPath);
 if(previous){assert.equal(previous.operation,OPERATION);assert.equal(previous.original.caseSha256,ORIGINAL.caseSha256);assert.equal(previous.original.directory,directory);}
 const journal=previous??{schema:'stellar-forge.merchant-bank-saved-case-continuation.v1',operation:OPERATION,original:ORIGINAL,
  startedAt:new Date().toISOString(),phases:[],browserState:'PENDING',immutableCloses:[],status:'RUNNING'};
 const phase=async(name,details={})=>{journal.phases.push({name,at:new Date().toISOString(),...details});await atomic(journalPath,journal);
  console.log(json({operation:OPERATION,phase:name,...details}));};
 let workspace,running;
 try{
  const stored=await saved(join(directory,'workspace.json'));assert(stored,'Original saved accounting state is present');
  assert.equal(stored.createdAt,ORIGINAL.createdAt,'Original workspace creation identity');
  assert(stored.revision>=ORIGINAL.revision,'Saved original case revision');
  for(const [key,path]of Object.entries({outboxDir:join(root,'outbox'),proofDir:join(root,'proofs'),termsFile:join(root,'terms.json')})){
   assert.equal(stored.sources[key],path,'Original source configuration '+key);await stat(path);
  }
  workspace=await openAccountingWorkspace({directory});
  const r=await new ReceivablesWorkspace(workspace).init(),bank=await new BankStatementsWorkspace(r).init();
  const initial=await bank.state(),data=bank.data();
  if(journal.workspaceId)assert.equal(initial.workspaceId,journal.workspaceId);else journal.workspaceId=initial.workspaceId;
  if(journal.sourcesSha256)assert.equal(initial.sourcesSha256,journal.sourcesSha256);else journal.sourcesSha256=initial.sourcesSha256;
  const account=data.accounts.find(row=>row.id===ORIGINAL.accountId);assert.equal(account?.name,'Operating bank');
  const customer=workspace.state.customerStatements.customers.find(row=>row.id===ORIGINAL.customerId);assert.equal(customer?.reference,'NATIVE-BANK-CUSTOMER');
  const imported=data.imports.find(row=>row.id===ORIGINAL.importId);assert.equal(imported?.format,'OFX');
  const originalClose=data.closes.find(row=>row.id===ORIGINAL.originalCloseId),finalClose=data.closes.find(row=>row.id===ORIGINAL.finalCloseId);
  assert.equal(originalClose?.closingBalance,'1272.00');assert.equal(finalClose?.closingBalance,'1295.00');
  assert.equal(data.closes.find(row=>row.id===ORIGINAL.partialOriginalCloseId)?.closingBalance,'150.00');
  assert.equal(data.closes.find(row=>row.id===ORIGINAL.partialFinalCloseId)?.closingBalance,'155.00');
  const originalOperation=await bank.getOperation(ORIGINAL.requestId);assert.equal(originalOperation.receipt.id,ORIGINAL.receiptId);
  assert.equal(originalOperation.receipt.amount,'100.00');
  const originalSource=await bank.importFile(imported.id,'original');
  assert.equal(sha(originalSource.bytes),imported.file.sha256);assert.equal(originalSource.bytes.length,imported.file.bytes);
  const original={format:'OFX',file:{name:imported.file.name,content:originalSource.bytes.toString('utf8'),encoding:'utf8'}};
  for(const close of data.closes.filter(row=>!row.from||row.from<'2026-11-01')){
   const bytes=(await bank.closeFile(close.id,'account.tar')).bytes,record={id:close.id,name:close.name,...verifyArchive(bytes)};
   const retained=journal.immutableCloses.find(row=>row.id===close.id);
   if(retained)assert.deepEqual(record,retained,'Earlier retained financial handover');else journal.immutableCloses.push(record);
  }
  await preserveExact(join(outputDir,'account.tar'),(await bank.closeFile(finalClose.id,'account.tar')).bytes);
  await preserveExact(join(outputDir,'original-close.tar'),(await bank.closeFile(originalClose.id,'account.tar')).bytes);
  assert.equal(sha(await readFile(join(outputDir,'partial-receipts-original-close.tar'))),
   journal.immutableCloses.find(row=>row.id===ORIGINAL.partialOriginalCloseId).sha256);
  assert.equal(sha(await readFile(join(outputDir,'partial-receipts-corrected-close.tar'))),
   journal.immutableCloses.find(row=>row.id===ORIGINAL.partialFinalCloseId).sha256);
  await phase('original account, request, invoices and five retained reconciliations received',{
   revision:workspace.state.revision,workspaceId:initial.workspaceId,customerId:customer.id,accountId:account.id,
   retainedReceiptId:originalOperation.receipt.id,retainedRequestId:ORIGINAL.requestId,retainedCloses:journal.immutableCloses.length});
  running=await createReceivablesServer({workspace,port:0});
  const origin=new URL(running.url).origin,client=new BankStatementsClient({baseUrl:origin+'/api/receivables/bank-statements'});
  assert.equal((await client.state()).workspaceId,initial.workspaceId);
  const assets=[];
  for(const path of ['/bank-statements/','/bank-statements/index.html','/bank-statements/app.mjs','/bank-statements/styles.css',
   '/bank-statements/config.json','/bank-statements/sdk/client.mjs','/bank-statements/client.mjs','/bank-statements/receivables-client.mjs',
   '/bank-statements/SOURCE_FORMATS.md','/receivables/','/api/receivables/state']){
   const response=await fetch(origin+path);assert.equal(response.status,200,path);const bytes=Buffer.from(await response.arrayBuffer());
   assert(bytes.length>0);assets.push({path,bytes:bytes.length,sha256:sha(bytes)});
  }
  let browserResult=await saved(join(browserDir,'browser-result.json'));
  if(browserResult?.status==='PASS'){
   assert.equal(browserResult.workspaceId,initial.workspaceId);assert.equal(browserResult.originalOperation,OPERATION);assert.equal(resolve(browserResult.caseDirectory),directory);
   journal.browserState='PASS';await phase('completed original browser result received',{revision:workspace.state.revision});
  }else{
   const hasBrowserMutations=browserHasMutations(r.data());
   const browserResume=hasBrowserMutations?{result:browserResult,revision:workspace.state.revision}:null;
   if(hasBrowserMutations)assert(browserResult&&['FAILED','RUNNING','INTERRUPTED'].includes(browserResult.status)&&Number.isSafeInteger(workspace.state.revision),'Retain the actual complete browser interruption and current original revision');
   journal.browserState='RUNNING';journal.browserStartedAt??=new Date().toISOString();await atomic(journalPath,journal);
   await retainNativeCaseCheckpoint(root,directory,{workspaceId:initial.workspaceId,revision:workspace.state.revision,status:browserResult?.status??'PENDING'});
   browserResult=await receiveBankBrowser({baseUrl:origin,workspaceId:initial.workspaceId,caseDirectory:directory,
    sourceDirectory:fileURLToPath(new URL('.',import.meta.url)),reportDirectory:browserDir,resume:browserResume,
    onCheckpoint:async progress=>{journal.retainedRevision=progress.revision;journal.browserState=progress.status==='PASS'?'PASS':'RUNNING';await atomic(journalPath,journal);await retainNativeCaseCheckpoint(root,directory,progress);},
    scenario:{account,customer,receivables:r,original,originalImport:imported,originalClose,finalClose,browserExecutable}});
   assert.equal(browserResult.status,'PASS');journal.browserState='PASS';
   await phase('original complete Bank statements and Bank receipts browser journey',{
    revision:workspace.state.revision,phases:browserResult.phases?.length,screens:browserResult.screenshots?.length,
    downloads:browserResult.downloads?.length});
  }
  const finalRevision=workspace.state.revision;
  await running.close();running=null;await workspace.close();workspace=null;
  workspace=await openAccountingWorkspace({directory});
  const cold=await new BankStatementsWorkspace(new ReceivablesWorkspace(workspace)).init();
  assert.equal(workspace.state.revision,finalRevision,'Cold receiving retains the completed workspace revision');
  const coldState=await cold.state();assert.equal(coldState.workspaceId,initial.workspaceId);assert.equal(coldState.sourcesSha256,initial.sourcesSha256);
  assert.equal((await cold.getOperation(ORIGINAL.requestId)).receipt.id,ORIGINAL.receiptId);
  for(const record of journal.immutableCloses)assert.equal(sha((await cold.closeFile(record.id,'account.tar')).bytes),record.sha256);
  assert.equal((await cold.closeDetail(finalClose.id)).currentProblems.length,0);
  assert.equal((await cold.closeDetail(ORIGINAL.partialFinalCloseId)).currentProblems.length,0);
  const latest=cold.data().closes.filter(row=>row.accountId===account.id&&row.from==='2026-12-01'&&row.closingBalance==='1356.00');
  assert.equal(latest.length,1,'One complete corrected December receiving');
  assert.equal((await cold.closeDetail(latest[0].id)).currentProblems.length,0);
  const fullDecember=(await cold.closeFile(latest[0].id,'account.tar')).bytes;
  const latestArchive=await preserveExact(join(outputDir,'complete-december-account.tar'),fullDecember);
  verifyArchive(fullDecember);
  const allCloses=[];
  for(const close of cold.data().closes){
   const bytes=(await cold.closeFile(close.id,'account.tar')).bytes;
   allCloses.push({id:close.id,accountId:close.accountId,name:close.name,from:close.from,until:close.until,closingBalance:close.closingBalance,...verifyArchive(bytes)});
  }
  const counts={customers:workspace.state.customerStatements.customers.length,invoices:cold.receivables.data().invoices.length,
   receipts:cold.receivables.data().receipts.length,allocations:cold.receivables.data().allocations.length,
   bankImports:cold.data().imports.length,bankTransactions:cold.data().transactions.length,retainedCloses:allCloses.length};
  const cli=fileURLToPath(new URL('./cli.mjs',import.meta.url)),cliOutput=join(root,'cli-handover');
  const cliArchive=join(cliOutput,'account.tar'),cliInputs=[];
  for(const name of [...Object.keys(finalClose.files),'account.tar']){
   const file=await cold.closeFile(finalClose.id,name);
   cliInputs.push({name,type:file.type,bytes:file.bytes,sha256:sha(file.bytes)});
  }
  const cliIntent={directory:cliOutput,closeId:finalClose.id,
   files:cliInputs.map(file=>({name:file.name,type:file.type,bytes:file.bytes.length,sha256:file.sha256}))};
  let existingOutput=false;
  try{const info=await lstat(cliOutput);assert(info.isDirectory()&&!info.isSymbolicLink(),'Original CLI output directory');existingOutput=true;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(journal.cliExport)assert.deepEqual(journal.cliExport,cliIntent,'Continue the same complete CLI export');
  else{
   assert(!existingOutput,'An existing handover needs its original retained export intent');
   journal.cliExport=cliIntent;await atomic(journalPath,journal);
  }
  await workspace.close();workspace=null;
  let cliReport=await saved(join(outputDir,'cli-result.json'));
  if(!cliReport&&!existingOutput){
   const run=spawnSync(process.execPath,[cli,'export','--directory',directory,'--id',finalClose.id,'--out',cliOutput],{encoding:'utf8',maxBuffer:4000000,...(receivingGuard?{stdio:['ignore','pipe','pipe',receivingGuard.fd],env:{...process.env,SCF_BANK_RECEIVING_FD:'3'}}:{})});
   journal.cliInvocation={at:new Date().toISOString(),exitCode:run.status,signal:run.signal,stderr:run.stderr};
   await atomic(journalPath,journal);
   if(run.status===0){cliReport=JSON.parse(run.stdout);assert(cliReport.files.length>8);}
   else{
    const info=await lstat(cliOutput).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    assert(info?.isDirectory()&&!info.isSymbolicLink(),run.stderr||'Original CLI output was not created');
   }
  }
  const expectedNames=new Set(cliInputs.map(file=>file.name));
  for(const name of await readdir(cliOutput)){
   assert(expectedNames.has(name)||cliInputs.some(file=>name.startsWith(file.name+'.interrupted-')||name.startsWith(file.name+'.receiving-')),
    'The retained CLI directory contains an unrelated file: '+name);
  }
  const completed=[];
  for(const file of cliInputs){
   const kept=await preserveExact(join(cliOutput,file.name),file.bytes);
   completed.push({name:file.name,type:file.type,path:kept.path,bytes:kept.bytes,sha256:kept.sha256,
    ...(kept.recoveredPredecessor?{recoveredPredecessor:kept.recoveredPredecessor}:{})});
  }
  if(cliReport){
   assert.equal(cliReport.directory,cliOutput);assert.equal(cliReport.closeId,finalClose.id);
   for(const file of cliReport.files){const expected=cliIntent.files.find(row=>row.name===file.name);assert(expected);assert.equal(file.bytes,expected.bytes);assert.equal(file.sha256,expected.sha256);}
   assert.equal(cliReport.files.length,cliIntent.files.length);
  }else cliReport={directory:cliOutput,closeId:finalClose.id,files:completed,recoveredOriginalExport:true};
  assert.equal(sha(await readFile(cliArchive)),journal.immutableCloses.find(row=>row.id===finalClose.id).sha256);
  await atomic(join(outputDir,'cli-result.json'),cliReport);
  await phase('cold original writer reopen, request recovery and complete accountant/customer export',{
   revision:finalRevision,retainedCloses:allCloses.length,cliExportFiles:cliReport.files.length,closingBalance:'1356.00',...counts});
  const result={schema:'stellar-forge.merchant-bank-native-receiving.v1',operation:OPERATION,status:'PASS',completedAt:new Date().toISOString(),
   node:process.version,continuation:{originalCaseSha256:ORIGINAL.caseSha256,originalRevision:ORIGINAL.revision,
    originalRequestId:ORIGINAL.requestId,originalReceiptId:ORIGINAL.receiptId,financialInitialization:'RETAINED_FROM_ORIGINAL_CASE'},
   originalWorkspace:{directory,workspaceId:initial.workspaceId,sourcesSha256:initial.sourcesSha256,revision:finalRevision},
   phases:journal.phases,browser:browserResult,assets,counts,retainedCloses:allCloses,
   deliverable:{directory:outputDir,accountTar:journal.immutableCloses.find(row=>row.id===finalClose.id),
    originalCloseTar:journal.immutableCloses.find(row=>row.id===originalClose.id),completeDecemberAccount:latestArchive,cliDirectory:cliOutput}};
  await atomic(join(outputDir,'native-result.json'),result);
  journal.status='PASS';journal.completedAt=result.completedAt;journal.finalRevision=finalRevision;
  await atomic(journalPath,journal);await retainNativeCaseCheckpoint(root,directory,{...browserResult,revision:finalRevision});return result;
 }catch(error){
  journal.status='FAILED';journal.error={name:error.name,code:error.code??null,message:error.message,stack:error.stack};
  if(journal.browserState==='RUNNING')journal.browserState='INTERRUPTED';
  journal.interruptedAt=new Date().toISOString();if(workspace)journal.retainedRevision=workspace.state.revision;
  await atomic(journalPath,journal);throw error;
 }finally{if(running)await running.close();if(workspace)await workspace.close();}
}
