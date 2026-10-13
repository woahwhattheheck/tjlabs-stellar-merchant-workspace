// SPDX-License-Identifier: MIT
// Operate the original issued-source account through the maintained authenticated Merchant host.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {inspectAccountingWorkspaceBinding} from '../../workspace/binding.mjs';
import {initializeAccountingMerchant} from '../../../../../stellar-forge/mcp-merchant-operator/config.mjs';
import {startMerchantMcp} from '../../../../../stellar-forge/mcp-merchant-operator/serve.mjs';
import {connectAccountingBankStatementsClient,accountingBankStatementsCloseArguments}
 from '../../../../../stellar-forge/mcp-merchant-operator/accounting-bank-statements-client.mjs';
import {downloadAccountingBankStatementsFile}
 from '../../../../../stellar-forge/mcp-merchant-operator/accounting-bank-statements-cli.mjs';
import {prepareBankSourceInputs,receiveBankSourceAgent,receiveBankSourceCold} from './BANK_SOURCES_RECEIVE.mjs';
const execute=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const serial=value=>JSON.parse(JSON.stringify(value));
const json=value=>JSON.stringify(value,null,2)+'\n';
const cli=fileURLToPath(new URL('../../../../../stellar-forge/mcp-merchant-operator/accounting-bank-statements-cli.mjs',import.meta.url));
export async function receiveBankMcp({directory,inputRoot,out,received,retainedCloses,workspaceId,profileOutput}){
 await mkdir(out,{mode:0o700});
 const result={schema:'stellar-forge.camt053.account-mcp-receiving.v1',completed:false,startedAt:new Date().toISOString(),workspaceId,
  inventories:{},imports:[],closes:[],originalRequestReplays:[],commands:[],cold:{},files:[]};
 const save=async(name,value)=>{const path=join(out,name);await mkdir(resolve(path,'..'),{recursive:true,mode:0o700});const bytes=Buffer.isBuffer(value)?value:Buffer.from(json(value));await writeFile(path,bytes,{flag:'wx',mode:0o600});return {path,bytes:bytes.length,sha256:sha(bytes)};};
 const binding=await inspectAccountingWorkspaceBinding(directory);assert.equal(binding.workspaceId,workspaceId);
 const inputs=JSON.parse(await readFile(join(inputRoot,'inputs.json'),'utf8'));
 const selected=inputs.find(row=>row.sourceKind==='BUNDESBANK_BANK_ISSUED_EXAMPLE'&&!row.expectedRejection);assert(selected);
 const aliasPath=join(inputRoot,selected.local),s=binding.sources,alias='original';
 const sourceInputs=await prepareBankSourceInputs({profileOutput,out:join(out,'source-agent-inputs'),workspaceId});
 const accountingFile=join(out,'accounting-workspaces.json');
 await writeFile(accountingFile,json({workspaces:{[alias]:{directory,outboxDir:s.outboxDir,proofDir:s.proofDir,termsFile:s.termsFile,
  receivablesInputs:{issuer:aliasPath,...sourceInputs.aliases},...(s.recoveredDir?{recoveredSources:{retained:s.recoveredDir}}:{})}}}),{flag:'wx',mode:0o600});
 const configured=await initializeAccountingMerchant({directory:join(out,'merchant-host'),accounting:accountingFile,name:'Original issued bank account receiving'});
 const environment={...process.env,MCP_ACCESS_TOKEN:randomBytes(32).toString('base64url'),MCP_CLIENT_ORIGINS:''};
 delete environment.MCP_OAUTH_CONFIG;
 let host,client,failure;
 async function command(label,args,{expectedExit=0}={}){
  let execution;
  try{const value=await execute(process.execPath,[cli,...args],{env:environment,encoding:'utf8',maxBuffer:32*1024*1024,timeout:120000});execution={exitCode:0,stdout:value.stdout,stderr:value.stderr};}
  catch(error){execution={exitCode:error.code,stdout:error.stdout??'',stderr:error.stderr??'',signal:error.signal??null};}
  const file=await save('commands/'+label+'.json',{args, ...execution});result.commands.push({label,...file,exitCode:execution.exitCode});
  assert.equal(execution.exitCode,expectedExit,execution.stderr||label);return JSON.parse(execution.stdout);
 }
 async function operate(label,kind,args){
  const request=await save('requests/'+label+'.json',args),operationDirectory=join(out,'operations',label);
  await mkdir(join(out,'operations'),{recursive:true,mode:0o700});
  const prepared=await command(label+'-prepare',['prepare','--dir',operationDirectory,'--url',host.url,'--workspace',alias,'--action',kind,'--request',request.path]);
  assert.equal(prepared.phase,'PREPARED');assert.deepEqual(prepared.arguments,args);
  const pending=await command(label+'-before',['reconcile','--dir',operationDirectory],{expectedExit:3});assert.equal(pending.found,false);
  const before=await readFile(join(operationDirectory,'request.json'));
  const applied=await command(label+'-execute',['execute','--dir',operationDirectory]);
  assert.equal(applied.found,true);assert.equal(applied.submitted,true);assert.equal(applied.acknowledged,true);
  const observed=await command(label+'-reconcile',['reconcile','--dir',operationDirectory]);assert.equal(observed.found,true);assert.equal(observed.submitted,false);
  const repeated=await command(label+'-repeat',['execute','--dir',operationDirectory]);assert.equal(repeated.found,true);assert.equal(repeated.submitted,false);
  assert.deepEqual(await readFile(join(operationDirectory,'request.json')),before);
  const state=JSON.parse(await readFile(join(operationDirectory,'state.json'),'utf8'));assert.equal(state.phase,'OBSERVED');
  return {applied,observed,repeated,operationDirectory,requestSha256:sha(before)};
 }
 try{
  host=await startMerchantMcp({configPath:configured.configuration,port:0,tokenEnv:'MCP_ACCESS_TOKEN',environment});
  const denied=await fetch(host.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'unauthenticated-source-review',method:'tools/list',params:{}})});
  assert.equal(denied.status,401,'The maintained listener requires its actual bearer authentication');await denied.arrayBuffer();
  client=await connectAccountingBankStatementsClient({url:host.url,workspace:alias,environment});await client.open();
  const initial=await client.status();assert.equal(initial.workspaceId,workspaceId);result.initial=initial;
  result.configuration=await save('configured-sources.json',await client.configuredSources());
  for(const view of ['accounts','imports','closes','reopenings','customers','periodCloses','history']){
   const value=await client.listAll('status',{view});assert.equal(value.workspaceId,workspaceId);
   result.inventories[view]=await save('inventories/'+view+'.json',value);
  }
  const allTransactions=await client.listAll('transactions',{});result.inventories.transactions=await save('inventories/transactions.json',allTransactions);
  for(const item of received){
   const detail=await client.import({bankStatementImportId:item.importId});assert.equal(detail.import.id,item.importId);
   assert.deepEqual(detail.report,item.report);assert.deepEqual(detail.import.camt,item.metadata);assert.deepEqual(detail.import.balances,item.balances);
   assert.deepEqual(detail.import.rowIds,item.rowIds);
   for(const id of item.rowIds){const row=await client.transaction({bankTransactionId:id});assert.equal(row.transaction.id,id);assert(allTransactions.items.some(x=>x.id===id));}
   const original=await client.fileBytes({kind:'bank-statements-import',bankStatementImportId:item.importId,file:'original'});
   assert.equal(original.bytes.length,item.originalBytes);assert.equal(sha(original.bytes),item.originalSha256);
   const downloaded=[];
   for(const file of detail.files){
    const name=file.selection.file;assert(/^[A-Za-z0-9._-]+$/.test(name),'Original advertised file name');
    const output=join(out,'imports',item.importId,name);await mkdir(resolve(output,'..'),{recursive:true,mode:0o700});
    const saved=await downloadAccountingBankStatementsFile({client,selection:file.selection,expectedSha256:file.sha256,output,chunkBytes:65536});
    const bytes=await readFile(output);assert.equal(bytes.length,saved.file.bytes);assert.equal(sha(bytes),saved.file.sha256);downloaded.push({name,bytes:bytes.length,sha256:sha(bytes)});
   }
   const replay=await client.receiveSource(item.request);assert.equal(replay.operation.replayed,true);assert.equal(replay.import.id,item.importId);
   const reconciled=await client.reconcileOperation('source_import',item.request);assert.equal(reconciled.found,true);assert.equal(reconciled.import.id,item.importId);
   result.originalRequestReplays.push({requestId:item.request.requestId,importId:item.importId,replayed:true});
   result.imports.push({importId:item.importId,rows:item.rowIds.length,files:downloaded,originalSha256:item.originalSha256});
   await save('imports/'+item.importId+'/mcp-detail.json',detail);
  }
  const aliasBytes=await readFile(aliasPath),originalSource=received.find(item=>item.originalSha256===sha(aliasBytes));
  assert(originalSource,'Selected original source is retained in the same account');
  const source={...serial(originalSource.request.source),file:{name:selected.name}};
  const preview=await client.previewSource({sourceAlias:'issuer',source});
  assert.equal(preview.file.sha256,sha(await readFile(aliasPath)));assert.deepEqual(Buffer.from(preview.sourceInput.file.dataBase64,'base64'),await readFile(aliasPath));
  const inline=await client.previewSource({source:preview.sourceInput});assert.equal(inline.reviewSha256,preview.reviewSha256);
  result.sourceAlias=await save('resolved-original-source-preview.json',preview);
  for(const item of retainedCloses){
   const detail=await client.closeDetail({bankStatementCloseId:item.id});assert.equal(detail.close.id,item.id);
   assert.equal(Boolean(detail.reopening),item.reopened);assert.equal(detail.report.transactions.length,item.transactionCount);
   const files=[];
   for(const file of detail.files){
    const name=file.selection.file;assert(/^[A-Za-z0-9._-]+$/.test(name));
    const output=join(out,'closes',item.id,name);await mkdir(resolve(output,'..'),{recursive:true,mode:0o700});
    const downloaded=await downloadAccountingBankStatementsFile({client,selection:file.selection,expectedSha256:file.sha256,output});
    const bytes=await readFile(output);assert.equal(sha(bytes),downloaded.file.sha256);files.push({name,bytes:bytes.length,sha256:sha(bytes)});
    if(name==='account.tar'){assert.equal(bytes.length,item.archiveBytes);assert.equal(sha(bytes),item.archiveSha256);}
   }
   const replay=await client.retainClose(item.request);assert.equal(replay.operation.replayed,true);assert.equal(replay.close.id,item.id);
   result.closes.push({closeId:item.id,files,replayed:true});
  }
  assert.equal((await client.status()).revision,initial.revision,'Read, full-file and replay operations preserve the existing original revision');
  result.sourcePreparation=await receiveBankSourceAgent({url:host.url,workspace:alias,environment,
   out:join(out,'source-agent'),workspaceId,input:sourceInputs});
  assert.equal(result.sourcePreparation.completed,true);
  assert.equal((await client.status()).revision,initial.revision,'Source preparation preserves the original financial revision');
  const originalZero=retainedCloses.find(item=>item.transactionCount===0&&!item.reopened&&item.previousCloseId);assert(originalZero);
  const actor='Original issued account MCP receiving',reopenRequest={workspaceId,revision:initial.revision,actor,requestId:randomUUID(),
   bankStatementCloseId:originalZero.id,reason:'Continue the same original zero-entry issuer statement through its authenticated accounting owner.'};
  result.reopening=await operate('original-zero-entry-reopen','reopen',reopenRequest);
  assert(originalZero.request.sourceClosing,'Keep the original issuer balance-pair binding for this zero-entry close');
  const closeInput=Object.fromEntries(['accountId','from','until','openingBalance','closingBalance','sourceClosing'].map(key=>[key,serial(originalZero.request[key])]));
  const closePreview=await client.previewClose(closeInput);assert.equal(closePreview.ready,true);assert.equal(closePreview.difference,'0.00');assert.equal(closePreview.transactions.length,0);
  await save('zero-entry-current-close-preview.json',closePreview);
  const closeRequest=accountingBankStatementsCloseArguments(closePreview,{actor,requestId:randomUUID(),name:'Original zero-entry statement received through Merchant MCP',note:'Retains the prior native and authenticated close history and original issuer source.'});
  result.successor=await operate('original-zero-entry-close','close',closeRequest);
  const successor=result.successor.applied.close;assert.equal(successor.previousCloseId,originalZero.id);
  const detail=await client.closeDetail({bankStatementCloseId:successor.id});
  const selection=await save('successor-archive-selection.json',detail.archive),archivePath=join(out,'successor-account.tar');
  const expectedArchive=detail.files.find(file=>file.selection.file==='account.tar');assert(expectedArchive);
  const download=await command('successor-whole-account-download',['download','--url',host.url,'--workspace',alias,'--selection',selection.path,'--out',archivePath,'--sha256',expectedArchive.sha256]);
  assert.equal(download.complete,true);const archive=await readFile(archivePath);assert.equal(sha(archive),expectedArchive.sha256);
  result.successorArchive={path:archivePath,bytes:archive.length,sha256:sha(archive),closeId:successor.id};
  const final=await client.status();assert.equal(final.revision,initial.revision+2);
  const beforeCold={imports:await client.listAll('status',{view:'imports'}),closes:await client.listAll('status',{view:'closes'}),reopenings:await client.listAll('status',{view:'reopenings'}),transactions:await client.listAll('transactions',{})};
  await save('before-cold-original-account.json',beforeCold);
  await client.closeWorkspace();client=null;
  client=await connectAccountingBankStatementsClient({url:host.url,workspace:alias,environment});await client.open();
  const cold=await client.status();assert.equal(cold.revision,final.revision);assert.equal(cold.workspaceId,workspaceId);
  for(const view of ['imports','closes','reopenings']){const current=await client.listAll('status',{view});assert.deepEqual(current.items,beforeCold[view].items);result.cold[view]=await save('cold/'+view+'.json',current);}
  const transactions=await client.listAll('transactions',{});assert.deepEqual(transactions.items,beforeCold.transactions.items);assert.deepEqual(transactions.items,allTransactions.items);
  for(const item of retainedCloses){const file=await client.fileBytes({kind:'bank-statements-close',bankStatementCloseId:item.id,file:'account.tar'});assert.equal(sha(file.bytes),item.archiveSha256);}
  const coldArchive=await client.fileBytes(detail.archive);assert.equal(sha(coldArchive.bytes),result.successorArchive.sha256);
  const currentClose=await client.closeDetail({bankStatementCloseId:successor.id});assert.equal(currentClose.close.previousCloseId,originalZero.id);
  assert.equal((await client.reconcileOperation('reopen',reopenRequest)).found,true);assert.equal((await client.reconcileOperation('close',closeRequest)).found,true);
  result.cold.sourcePreparation=await receiveBankSourceCold({url:host.url,workspace:alias,environment,
   out:join(out,'cold/source-agent'),workspaceId,expected:result.sourcePreparation});
  assert.equal(result.cold.sourcePreparation.completed,true);
  assert.equal((await client.status()).revision,final.revision,'Cold source receiving preserves the same financial account');
  result.final=cold;result.cold.transactions=await save('cold/transactions.json',transactions);
 }catch(error){failure=error;}
 finally{
  result.release={accountingOwnerClosed:false,merchantHostClosed:false};
  let closingError;
  try{if(client)await client.closeWorkspace();result.release.accountingOwnerClosed=true;}catch(error){closingError=error;}
  try{if(host)await host.close();result.release.merchantHostClosed=true;}catch(error){closingError??=error;}
  if(closingError){result.release.error={code:closingError.code,message:closingError.message};if(failure)failure.releaseError=result.release.error;else failure=closingError;}
 }
 if(failure){result.error={code:failure.code,message:failure.message,stack:failure.stack,releaseError:failure.releaseError};await save('MCP_RECEIVING_ERROR.json',result);throw failure;}
 result.completed=true;result.completedAt=new Date().toISOString();
 result.resultFile=await save('MCP_RECEIVING_RESULT.json',result);return result;
}
