// SPDX-License-Identifier: MIT
// Complete original bank-issued and issuer-published CAMT sources through the existing application.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {openAccountingWorkspace} from '../../workspace/store.mjs';
import {ReceivablesWorkspace} from '../store.mjs';
import {createReceivablesServer} from '../server.mjs';
import {BankStatementsWorkspace} from './store.mjs';
import {BankStatementsClient} from './client.mjs';
import {readBankStatementSource} from './source.mjs';
import {json,sha} from '../core.mjs';
function sourceStrKey(version,fill) {
  const bytes=Buffer.alloc(35,fill);bytes[0]=version;let crc=0;
  for(const byte of bytes.subarray(0,33)){crc^=byte<<8;for(let i=0;i<8;i++)crc=((crc<<1)^(crc&0x8000?0x1021:0))&65535;}
  bytes[33]=crc&255;bytes[34]=crc>>8;
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let result='',bits=0,acc=0;
  for(const byte of bytes){acc=(acc<<8)|byte;bits+=8;while(bits>=5){bits-=5;result+=alphabet[(acc>>>bits)&31];}acc&=(1<<bits)-1;}
  return result;
}

function tarEntries(bytes) {
  const result=new Map();let offset=0;
  while(offset+512<=bytes.length) {
    const header=bytes.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;
    const leaf=header.subarray(0,100).toString('utf8').replace(/\0.*$/,''),prefix=header.subarray(345,500).toString('utf8').replace(/\0.*$/,'');
    const name=prefix?prefix+'/'+leaf:leaf;
    const size=parseInt(header.subarray(124,136).toString('ascii').replace(/\0.*$/,'').trim(),8);
    assert(Number.isSafeInteger(size)&&size>=0);assert(!result.has(name),'Unique original archive filename');
    result.set(name,bytes.subarray(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512;
  }
  return result;
}

const inputRoot=resolve(process.argv[2]),out=resolve(process.argv[3]);
await mkdir(out,{recursive:true,mode:0o700});
const inputs=JSON.parse(await readFile(join(inputRoot,'inputs.json'),'utf8')).filter(row=>row.sourceKind.endsWith('BANK_ISSUED_EXAMPLE')||row.sourceKind==='GS_ISSUER_PUBLISHED_EXAMPLE');
const result={schema:'stellar-forge.camt053.application-receiving.v1',operation:'SCF-BANK-CAMT053-SOURCE-DFF77-20261013',
 sourceCommit:'933219ca2f66ebbaf28d5a7ef69cefe278de2a98',startedAt:new Date().toISOString(),completed:false,node:process.version,files:[],assets:[],coldReopen:[]};
const save=async(name,value)=>{const target=join(out,name);await mkdir(resolve(target,'..'),{recursive:true,mode:0o700});await writeFile(target,Buffer.isBuffer(value)?value:typeof value==='string'?value:json(value),{mode:0o600});};
const actor='Original issued CAMT application receiving';
const serial=value=>JSON.parse(JSON.stringify(value));
const directory=join(out,'accounting'),outboxDir=join(out,'outbox'),proofDir=join(out,'proofs'),termsFile=join(out,'terms.json');
await mkdir(outboxDir,{mode:0o700});await mkdir(proofDir,{mode:0o700});
await writeFile(termsFile,json({schema:'stellar-forge.merchant-accounting-terms.v1',routes:[{
 routeId:'native-bank-receiving',method:'GET',network:'stellar:testnet',asset:sourceStrKey(16,1),payTo:sourceStrKey(48,2),
 amountAtomic:'1000000',unitPriceUsd:'1',unitCostUsd:null,priceBasis:'Original issued CAMT application receiving'
}]}),{mode:0o600});
let workspace,running,client;
const received=[],closePlans=[],retainedCloses=[];
const operatorReview=JSON.parse(await readFile(join(inputRoot,'SAMPLE_OPERATOR_REVIEW.json'),'utf8'));
result.edition='NORDEA_AND_GS08_20261013';result.closes=[];result.coldCloses=[];
try{
 workspace=await openAccountingWorkspace({directory,outboxDir,proofDir,termsFile});
 const r=await new ReceivablesWorkspace(workspace).init();
 running=await createReceivablesServer({workspace,port:0});
 const origin=new URL(running.url).origin;
 client=new BankStatementsClient({baseUrl:origin+'/api/receivables/bank-statements'});
 const initial=await client.state();
 const bound=values=>({revision:workspace.state.revision,actor,requestId:randomUUID(),workspaceId:initial.workspaceId,...values});
 result.workspace={directory,workspaceId:initial.workspaceId,sourcesSha256:initial.sourcesSha256};
 for(const path of ['/bank-statements/','/bank-statements/camt.mjs','/bank-statements/CAMT053.md','/bank-statements/sdk/client.mjs']){
  const response=await fetch(origin+path);assert.equal(response.status,200,path);
  const bytes=Buffer.from(await response.arrayBuffer());assert(bytes.length>0);result.assets.push({path,bytes:bytes.length,sha256:sha(bytes)});
 }
 const cli=fileURLToPath(new URL('./cli.mjs',import.meta.url));
 for(const input of inputs){
  const bytes=await readFile(join(inputRoot,input.local)),prefix='files/'+input.label;
  const source={format:'CAMT053',file:{name:input.name,dataBase64:bytes.toString('base64')},
   accountNamespace:input.accountNamespace||'NORDEA-ISSUED-EXAMPLES',camt:{detailPolicy:'ENTRY_CURRENCY_TX_AMT'}};
  const item={name:input.name,label:input.label,bytes:bytes.length,sha256:sha(bytes),sourceKind:input.sourceKind,provenance:input.provenance??null,imports:[]};
  result.files.push(item);
  if(input.expectedRejection){
   let actual;try{await client.previewSource({source});}catch(error){actual={code:error.code,message:error.message,details:error.details,status:error.status};}
   assert(actual,'Original invalid XML must retain its reported source issue');assert.equal(actual.code,input.expectedRejection.code);
   item.status='SOURCE_REQUIRES_REVIEW';item.error=actual;
   await save(prefix+'/original.xml',bytes);await save(prefix+'/original-source-error.json',actual);continue;
  }
  const preparedPath=join(out,input.label+'-prepared-source.json');
  const cliRun=spawnSync(process.execPath,[cli,'prepare-source','--file',join(inputRoot,input.local),'--format','CAMT053','--out',preparedPath,
   '--account-namespace',source.accountNamespace,'--message-version',input.expected.messageVersion,'--detail-policy','ENTRY_CURRENCY_TX_AMT'],
   {encoding:'utf8',maxBuffer:8_000_000,timeout:30000});
  await save(prefix+'/cli-prepare.json',{status:cliRun.status,stdout:cliRun.stdout,stderr:cliRun.stderr});
  assert.equal(cliRun.status,0,cliRun.stderr);
  const prepared=JSON.parse(await readFile(preparedPath,'utf8'));assert.deepEqual(Buffer.from(prepared.source.file.dataBase64,'base64'),bytes);
  assert.equal(prepared.source.format,'CAMT053');assert.equal(prepared.source.camt.messageVersion,input.expected.messageVersion);
  const native=readBankStatementSource(source),preview=await client.previewSource({source});
  assert.equal(preview.file.sha256,sha(bytes));assert.equal(preview.camt.namespace,native.camt.namespace);
  assert.equal(preview.statements.length,native.statements.length);
  await save(prefix+'/preview.json',preview);
  for(let si=0;si<preview.statements.length;si++){
   const selected=preview.statements[si],expected=native.statements[si];
   assert.deepEqual(selected.camt,serial(expected.camt));assert.deepEqual(selected.balances,serial(expected.balances));
   let account=(await client.state()).accounts.find(row=>row.sourceIdentitySha256===selected.account.identitySha256);
   if(!account)account=(await client.saveAccount(bound({account:{name:(input.sourceKind==='GS_ISSUER_PUBLISHED_EXAMPLE'?'GS published ':'Nordea issued ')+input.label,currency:{code:selected.account.currency,scale:2},
     sourceIdentitySha256:selected.account.identitySha256,note:'Original issued source '+input.name}}))).account;
   const request=bound({accountId:account.id,statementId:selected.id,source,reviewSha256:preview.reviewSha256});
   const saved=await client.receiveSource(request),importId=saved.import.id,revision=workspace.state.revision;
   const replay=await client.receiveSource(request);assert.equal(replay.operation.replayed,true);assert.equal(replay.import.id,importId);
   assert.equal(workspace.state.revision,revision);
   const operation=await client.getOperation(request.requestId);assert.equal(operation.import.id,importId);
   const detail=await client.importDetail(importId),original=Buffer.from(await (await client.importFile(importId,'original')).arrayBuffer());
   assert.deepEqual(original,bytes);assert.equal(detail.import.format,'CAMT053');
   assert.deepEqual(detail.import.camt,serial(expected.camt));assert.deepEqual(detail.import.balances,serial(expected.balances));
   assert.equal(detail.report.camt.namespace,native.camt.namespace);
   const expectedFull={...native};delete expectedFull.bytes;assert.deepEqual(detail.report,serial(expectedFull));
   assert.equal(detail.import.rowIds.length,expected.rows.length);
   assert.equal(detail.import.pendingRows.length,expected.pendingRows.length);
   assert.equal(detail.import.excludedRows.length,expected.excludedRows.length);
   const rows=[];
   for(const id of detail.import.rowIds){
    const full=await client.detail(id),row=full.transaction,expectedRow=expected.rows.find(x=>x.id===row.sourceRowId);
    assert(expectedRow,'Original Ntry identity retained');
    assert.equal(row.sourceStatus,expectedRow.status);assert.equal(row.sourceAmount,expectedRow.amount);assert.equal(row.providerId,expectedRow.providerId);
    assert.deepEqual(row.camt,serial(expectedRow.camt));assert.deepEqual(row.issues,serial(expectedRow.issues));
    assert.equal(row.source.byteStart,expectedRow.source.byteStart);assert.equal(row.source.byteEnd,expectedRow.source.byteEnd);
    rows.push(row);
   }
   const closing=detail.import.balances.closing;
   if(!input.expected.statements[si].hasPeriod)assert(closing.every(row=>row.eligible===false),'Missing original period remains visible');
   for(const c of closing.filter(row=>!row.eligible)){
    let actual;try{await client.previewClose({accountId:account.id,from:expected.rows.map(x=>x.postedDate).filter(Boolean).sort()[0]||'2000-01-01',
     until:expected.rows.map(x=>x.postedDate).filter(Boolean).sort().at(-1)||'2000-01-01',
     openingBalance:c.opening?.amount||'0',closingBalance:c.closing?.amount||'0',sourceClosing:{importId,id:c.id}});}
    catch(error){actual={code:error.code,message:error.message,status:error.status};}
    assert.equal(actual?.code,'BANK_CLOSE_SOURCE_REQUIRED');await save(prefix+'/close-source-'+si+'.json',actual);
   }
   await save(prefix+'/statement-'+si+'-import.json',detail);await save(prefix+'/statement-'+si+'-transactions.json',rows);await save(prefix+'/original.xml',original);
   const retained={importId,accountId:account.id,request,originalSha256:sha(bytes),originalBytes:bytes.length,report:detail.report,
     metadata:detail.import.camt,balances:detail.import.balances,rowIds:detail.import.rowIds};
   if(input.sha256===operatorReview.sourceSha256){
    const review=operatorReview.statements.find(s=>s.statementId===selected.id);
    assert(review,'Every reviewed original itemized statement retained');assert.equal(review.accountIdentitySha256,selected.account.identitySha256);
    closePlans.push({importId,accountId:account.id,review,rows,bytes,originalSha256:sha(bytes),label:input.label,statementIndex:si,closing});
   }
   received.push(retained);item.imports.push({id:importId,accountId:account.id,rows:rows.length,pending:expected.pendingRows.length,
    excluded:expected.excludedRows.length,statuses:Object.fromEntries([...new Set(rows.map(x=>x.status))].map(status=>[status,rows.filter(x=>x.status===status).length])),
    originalSha256:sha(original),replayed:true,closing:closing.map(x=>({eligible:x.eligible,issues:x.issues}))});
  }
  item.status='RECEIVED';await save('APPLICATION_RESULT.json',result);
 }
 const state=await client.state();await save('SAVED_STATE.json',state);
 assert.equal(r.data().receipts.length,0);assert.equal(r.data().bankStatements.matches.length,0);
 result.sourceOnlyCashIntake={originalCustomerReceipts:r.data().receipts.length,originalMatches:r.data().bankStatements.matches.length,
   importedEntries:state.imports.reduce((sum,row)=>sum+row.rowCount,0)};
 assert.equal(closePlans.length,3,'Three original complete GS itemized statements, including zero entries');
 for(const plan of closePlans){
  const {importId,accountId,review,rows,bytes,closing}=plan,prefix='closes/'+review.accountId;
  assert.equal(rows.length,review.postings.length);
  const postingReceipts=[];
  for(const original of review.postings){
   const row=rows.find(item=>item.sourceRowId===original.sourceRowId);assert(row,'Reviewed posting remains tied to original Ntry');
   assert.equal(row.status,'POSTED');assert.equal(row.sourceAmount,original.amount);assert.equal(row.providerId,original.reference);
   assert.equal(row.camt.creditDebit,original.creditDebit);assert.equal(row.camt.reversal,original.reversal);
   const request=bound({parts:[{kind:original.kind,amount:original.amount,reference:original.reference,
    ledgerCode:original.ledgerCode,note:original.note}],reason:operatorReview.purpose+' Source: '+original.sourcePointer});
   const matched=await client.match(row.id,request),revision=workspace.state.revision;
   assert.equal((await client.match(row.id,request)).operation.replayed,true);assert.equal(workspace.state.revision,revision);
   const detail=await client.detail(row.id);assert.equal(detail.transaction.match.parts.length,1);
   postingReceipts.push({request,sourceRowId:original.sourceRowId,transaction:detail.transaction,operation:matched.operation});
  }
  await save(prefix+'/explicit-sample-postings.json',{review,postings:postingReceipts});
  assert.equal(closing.filter(row=>row.eligible).length,1);
  const candidate=closing.find(row=>row.eligible),sourcePair=review.closing.find(row=>row.id===candidate.id);
  assert(sourcePair);assert.equal(candidate.from,sourcePair.from);assert.equal(candidate.until,sourcePair.until);
  assert.equal(candidate.opening.amount,sourcePair.openingBalance);assert.equal(candidate.closing.amount,sourcePair.closingBalance);
  const closeInput={accountId,from:candidate.from,until:candidate.until,openingBalance:candidate.opening.amount,
   closingBalance:candidate.closing.amount,sourceClosing:{importId,id:candidate.id}};
  const reviewed=await client.previewClose(closeInput);
  assert.equal(reviewed.ready,true,json(reviewed.problems));assert.equal(reviewed.difference,'0.00');
  assert.equal(reviewed.transactions.length,rows.length);assert.equal(reviewed.balanceBasis,'ORIGINAL_SOURCE_CLOSING');
  assert.equal(reviewed.sourceClosing.fileSha256,plan.originalSha256);
  const request=bound({...closeInput,reviewSha256:reviewed.reviewSha256,
   name:'Original GS published statement '+review.accountId,note:operatorReview.purpose});
  const close=(await client.retainClose(request)).close,revision=workspace.state.revision;
  assert.equal((await client.retainClose(request)).operation.replayed,true);assert.equal(workspace.state.revision,revision);
  assert.equal((await client.getOperation(request.requestId)).close.id,close.id);
  const archive=Buffer.from(await(await client.closeFile(close.id,'account.tar')).arrayBuffer()),members=tarEntries(archive);
  assert.deepEqual(members.get('source-'+importId+'.xml'),bytes);
  const manifest=JSON.parse(members.get('manifest.json'));
  for(const [name,identity]of Object.entries(manifest.files)){const file=members.get(name);assert(file,name);assert.equal(file.length,identity.bytes);assert.equal(sha(file),identity.sha256);}
  const editable=JSON.parse(members.get('editable-reconciliation.json'));
  assert(editable.imports.some(item=>item.id===importId),'Source import accompanies zero-entry close as well');
  assert.equal(editable.transactions.length,rows.length);
  await save(prefix+'/account.tar',archive);await save(prefix+'/close-review.json',reviewed);await save(prefix+'/close-detail.json',await client.closeDetail(close.id));
  retainedCloses.push({id:close.id,request,archiveSha256:sha(archive),archiveBytes:archive.length,originalSha256:plan.originalSha256,importId,
   transactionCount:rows.length,reopened:false});
  const item={id:close.id,accountId,originalAccountId:review.accountId,importId,transactionCount:rows.length,
   from:candidate.from,until:candidate.until,openingBalance:reviewed.openingBalance,closingBalance:reviewed.closingBalance,
   difference:reviewed.difference,archiveSha256:sha(archive),archiveBytes:archive.length,replayed:true};
  result.closes.push(item);
  if(rows.length===0){
   const reopenRequest=bound({reason:'Reopen the original zero-entry published statement, preserving its original close and source.'});
   await client.reopenClose(close.id,reopenRequest);assert.equal((await client.reopenClose(close.id,reopenRequest)).operation.replayed,true);
   const reopened=await client.closeDetail(close.id);assert(reopened.reopening);retainedCloses.at(-1).reopened=true;
   const secondReview=await client.previewClose(closeInput);assert(secondReview.ready,json(secondReview.problems));
   const secondRequest=bound({...closeInput,reviewSha256:secondReview.reviewSha256,name:'Retained zero-entry statement after reopening',note:operatorReview.purpose});
   const successor=(await client.retainClose(secondRequest)).close;assert.equal(successor.previousCloseId,close.id);
   const successorArchive=Buffer.from(await(await client.closeFile(successor.id,'account.tar')).arrayBuffer());
   assert.deepEqual(tarEntries(successorArchive).get('source-'+importId+'.xml'),bytes);
   assert.equal((await client.retainClose(secondRequest)).operation.replayed,true);
   await save(prefix+'/original-reopened-close.json',reopened);await save(prefix+'/replacement-account.tar',successorArchive);
   retainedCloses.push({id:successor.id,request:secondRequest,archiveSha256:sha(successorArchive),archiveBytes:successorArchive.length,
    originalSha256:plan.originalSha256,importId,transactionCount:0,reopened:false,previousCloseId:close.id});
   item.reopening={requestId:reopenRequest.requestId,successorCloseId:successor.id,successorArchiveSha256:sha(successorArchive)};
  }
  await save('APPLICATION_RESULT.json',result);
 }
 assert.equal(r.data().receipts.length,0);assert.equal(r.data().bankStatements.matches.length,13);
 assert.equal(result.closes.reduce((sum,row)=>sum+row.transactionCount,0),13);
 await save('POST_CLOSE_STATE.json',await client.state());
 const finalRevision=workspace.state.revision;
 await running.close();running=null;await workspace.close();workspace=null;
 workspace=await openAccountingWorkspace({directory});
 const cold=await new BankStatementsWorkspace(new ReceivablesWorkspace(workspace)).init();
 assert.equal(workspace.state.revision,finalRevision);
 for(const item of received){
  const detail=await cold.importDetail(item.importId),original=await cold.importFile(item.importId,'original');
  assert.equal(sha(original.bytes),item.originalSha256);assert.equal(original.bytes.length,item.originalBytes);
  assert.deepEqual(detail.report,item.report);assert.deepEqual(detail.import.camt,item.metadata);assert.deepEqual(detail.import.balances,item.balances);
  assert.deepEqual(detail.import.rowIds,item.rowIds);assert.equal((await cold.getOperation(item.request.requestId)).import.id,item.importId);
  result.coldReopen.push({importId:item.importId,originalSha256:sha(original.bytes),rowIds:item.rowIds,operationId:item.request.requestId});
 }
 for(const original of retainedCloses){
  const detail=await cold.closeDetail(original.id),archive=await cold.closeFile(original.id,'account.tar');
  assert.equal(sha(archive.bytes),original.archiveSha256);assert.equal(archive.bytes.length,original.archiveBytes);
  assert.equal(detail.report.transactions.length,original.transactionCount);assert.equal(Boolean(detail.reopening),original.reopened);
  assert.equal(detail.report.sourceClosing.fileSha256,original.originalSha256);
  assert.equal((await cold.getOperation(original.request.requestId)).close.id,original.id);
  if(original.previousCloseId)assert.equal(detail.close.previousCloseId,original.previousCloseId);
  result.coldCloses.push({closeId:original.id,archiveSha256:sha(archive.bytes),transactionCount:original.transactionCount,
    reopened:original.reopened,requestId:original.request.requestId});
 }
 await save('COLD_STATE.json',await cold.state());result.workspace.revision=finalRevision;
 result.completed=true;result.completedAt=new Date().toISOString();await save('APPLICATION_RESULT.json',result);console.log(json(result));
}catch(error){result.error={code:error.code,message:error.message,stack:error.stack};await save('APPLICATION_RESULT.json',result);console.error(JSON.stringify(result.error));process.exitCode=1;}
finally{if(running)await running.close();if(workspace)await workspace.close();}
