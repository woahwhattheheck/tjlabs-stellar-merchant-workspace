#!/usr/bin/env node
// Separate process: verify original exports, restore the encrypted native Accounting backup,
// and invoke the original Buyer receiver without recreating either financial source.
import { mkdirSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RozoWorkspace } from './store.mjs';
import { receiveDelivery, hashOriginalFile } from './delivery.mjs';
import { nativeInventory, compareNativeInventory } from './native-inventory.mjs';
import { assert, canonical, digest } from './model.mjs';
import { verifyAccountingBackup, restoreAccountingWorkspace } from '../../merchant-settlement-accounting/workspace/recovery.mjs';
import { inspectRozoFinanceSource } from './finance-source.mjs';
import { inspectRozoAccountantSource } from '../../merchant-settlement-accounting/accountant/rozo-source.mjs';
import { PRODUCT, originalJSON, retainFinance, financeChild, financeFiles, recordFinanceProcess, originalFinanceHostSources } from './finance-native-support.mjs';

export async function receiveRozoFinance({directory,receiver,python='python3',merchantConfig,accountingAlias}){
  directory=realpathSync(directory);receiver=resolve(receiver);mkdirSync(receiver,{recursive:true,mode:0o700});
  const descriptor=originalJSON(join(directory,'FINANCE_RECEIVING.json')),plan=originalJSON(join(directory,'FINANCE_PLAN.json'));
  const {jsonDigest}=await import('./model.mjs');
  assert(descriptor.schema==='stellar-forge.rozo-finance-receiving.v1'&&descriptor.operationId===plan.operationId&&
    descriptor.planSha256===digest(readFileSync(join(directory,'FINANCE_PLAN.json'))),'FINANCE_RECEIVE_PLAN','The original full plan bytes differ.');
  const resultPath=join(receiver,'FINANCE_RECEIVED.json');
  if(existsSync(resultPath)){
    const old=originalJSON(resultPath);
    assert(old.operationId===descriptor.operationId&&old.descriptorSha256===digest(readFileSync(join(directory,'FINANCE_RECEIVING.json'))),
      'FINANCE_RECEIVE_REPLAY','The receiving destination names another original operation.');
    // Still verify retained originals rather than accepting a summary without its files.
    for(const file of old.receivedOriginals){const got=hashOriginalFile(join(directory,file.path));assert(got.sha256===file.sha256&&got.bytes===file.bytes,'FINANCE_RECEIVE_FILE','A retained original receiving file changed.');}
    const actual=financeFiles(receiver).filter(row=>row.path!=='FINANCE_RECEIVED.json');
    assert(canonical(actual)===canonical(old.receivedWorkspaceFiles),'FINANCE_RECEIVE_REPLAY','The complete previously received native workspace changed.');
    return {...old,reused:true};
  }
  const original=inspectRozoFinanceSource(readFileSync(join(directory,'files','original-rozo-finance-source.json')));
  assert(original.reportId===plan.report.reportId&&original.reportSha256===plan.report.expectedReportSha256,
    'FINANCE_RECEIVE_REPORT','The receiving source names another saved report.');
  const rozoFile=join(directory,descriptor.rozo.archive),rozoHash=hashOriginalFile(rozoFile);
  assert(rozoHash.sha256===descriptor.rozo.sha256&&rozoHash.bytes===descriptor.rozo.bytes,'FINANCE_RECEIVE_ARCHIVE','The complete ROZO archive changed.');
  const rozo=await receiveDelivery(rozoFile,join(receiver,'rozo'),{sha256:rozoHash.sha256,python});
  const w=new RozoWorkspace(rozo.workspaceDirectory,{readOnly:true});let inventory,outcomes,requests;
  try{
    inventory=nativeInventory(w);compareNativeInventory(originalJSON(join(directory,descriptor.rozo.inventory)),inventory);
    outcomes=w.list('finance-outcome',{all:true}).items.map(x=>x.value);
    requests=outcomes.map(row=>{
      const request=w.request(row.id);assert(request?.state==='accepted'&&request.result.result.originalResult.sha256===row.originalResult.sha256,
        'FINANCE_RECEIVE_REQUEST','An accepted original financial operation is missing.');
      const raw=w.wholeObject(row.originalResult.sha256);assert(raw.length===row.originalResult.bytes&&digest(raw)===row.originalResult.sha256,
        'FINANCE_RECEIVE_RESPONSE','A complete original native response changed.');
      if(row.source){const source=w.wholeObject(row.source.sha256);assert(source.length===row.source.bytes&&digest(source)===row.source.sha256,
        'FINANCE_RECEIVE_SOURCE','An original report, issued source or return is missing.');}
      for(const file of row.summary?.files??[]){const bytes=w.wholeObject(file.sha256);assert(bytes.length===file.bytes&&digest(bytes)===file.sha256,'FINANCE_RECEIVE_FILE','An original accountant or Buyer delivery changed.');}
      return {requestId:row.id,nativeRequestId:row.nativeRequestId,nativeFingerprint:row.nativeFingerprint,originalResult:row.originalResult};
    });
  }finally{w.close();}
  const final=originalJSON(join(directory,descriptor.finalState)),backup=join(directory,descriptor.accounting.backup);
  const verified=await verifyAccountingBackup({bundle:backup,expectedSha256:descriptor.accounting.manifestSha256,passEnv:descriptor.accounting.passEnv});
  const host=descriptor.accounting.hostConfiguration;
  if(host&&accountingAlias)assert(accountingAlias===host.alias,'FINANCE_HOST_CONFIGURATION','Select the captured original configured Accounting alias.');
  const {hostSources}=await originalFinanceHostSources({merchantConfig:host?merchantConfig:undefined,
    accountingAlias:host?.alias,expectedSha256:host?.configSha256,retainedDefinition:host});
  const stateRoot=join(receiver,'accounting-state'),accountingDirectory=join(stateRoot,'workspace');mkdirSync(stateRoot,{recursive:true,mode:0o700});
  const restored=await restoreAccountingWorkspace({bundle:backup,expectedSha256:descriptor.accounting.manifestSha256,directory:accountingDirectory,
    stateRoot,quiesced:true,relocate:true,expectedWorkspaceId:descriptor.accounting.binding.workspaceId,
    expectedSourcesSha256:descriptor.accounting.binding.sourcesSha256,passEnv:descriptor.accounting.passEnv,hostSources});
  const accounting=originalJSON(join(accountingDirectory,'workspace.json'));
  assert(accounting.revision===descriptor.accounting.revision,'FINANCE_RECEIVE_REVISION','The original Accounting revision differs.');
  for(const key of ['sources','captures','closes','reviews'])assert(canonical(accounting.rozoFinance[key])===canonical(final.accounting.finance[key]),
    'FINANCE_RECEIVE_ACCOUNTING','The original complete Accounting '+key+' history differs.');
  assert(canonical(accounting.accountantHandoffs)===canonical(final.accounting.accountant.handoffs),'FINANCE_RECEIVE_ACCOUNTANT','Every original handoff and return must remain retained.');
  for(const close of accounting.rozoFinance.closes){
    const path=join(accountingDirectory,'rozo-finance','closes',jsonDigest({key:close.id})+'.json'),raw=readFileSync(path);
    assert(raw.length===close.bytes&&digest(raw)===close.sha256,'FINANCE_RECEIVE_CLOSE','The original immutable closed-period source differs.');
    inspectRozoAccountantSource(raw);
  }
  // The original relocation restores every journal, source, issued file and credential path through its authenticated manifest.
  let buyer=null;
  if(descriptor.buyer){
    const row=descriptor.buyer.delivery.files.find(f=>f.name==='buyer-complete-project.zip');
    assert(row,'FINANCE_RECEIVE_BUYER','Retain the whole original Buyer project archive.');
    const originalFiles=financeFiles(join(directory,'files')),found=originalFiles.find(f=>f.sha256===row.sha256&&f.bytes===row.bytes);
    assert(found,'FINANCE_RECEIVE_BUYER','The saved Buyer archive is absent.');
    const entry=join(rozo.sourceRoot,'stellar/scf-starforge-20261009/sf36-spend-governor/expense-workspace/receive.py');
    const received=await financeChild(python,['-B',entry,'--archive',join(directory,'files',found.path),'--directory',join(receiver,'buyer'),
      '--expected-sha256',row.sha256,'--node',process.execPath],{environment:process.env});
    recordFinanceProcess(receiver,'BUYER_RECEIVING_PROCESS',received);
    assert(received.code===0,'FINANCE_RECEIVE_BUYER','The original full Buyer receiver did not complete.',500,{stderr:received.stderr});
    buyer=originalJSON(join(receiver,'buyer','RECEIVED.json'));
    assert(buyer.archive_sha256===row.sha256,'FINANCE_RECEIVE_BUYER','The native Buyer receiver selected another archive.');
    // Reopen the received native database through its copied original Store using the installed trusted reader.
    const storeModule=join(receiver,'buyer','app','sf36-spend-governor','expense-workspace');
    const script="import json,sys\nsys.path.insert(0,sys.argv[1])\nfrom store import Store\ns=Store(sys.argv[2],node_executable=sys.argv[3])\ntry: print(json.dumps(s.state(),sort_keys=True))\nfinally: s.close()\n";
    const opened=await financeChild(python,['-B','-c',script,storeModule,join(receiver,'buyer','project'),process.execPath]);
    recordFinanceProcess(receiver,'BUYER_REOPEN_PROCESS',opened);
    assert(opened.code===0,'FINANCE_RECEIVE_BUYER_REOPEN','The received original Buyer Store did not reopen.',500,{stderr:opened.stderr});
    const state=JSON.parse(opened.stdout);
    assert(state.id===final.buyer.state.id&&state.id===descriptor.buyer.binding.workspaceId&&state.revision===descriptor.buyer.revision,
      'FINANCE_RECEIVE_BUYER_IDENTITY','The original Buyer identity or revision differs.');
    for(const key of ['sources','periods','centers','labels'])assert(canonical(state[key])===canonical(final.buyer.state[key]),'FINANCE_RECEIVE_BUYER_STATE','The original Buyer '+key+' changed.');
  }
  const receivedOriginals=financeFiles(join(directory,'files')).map(f=>({...f,path:'files/'+f.path}));
  for(const row of financeFiles(backup))receivedOriginals.push({...row,path:descriptor.accounting.backup+'/'+row.path});
  const result={schema:'stellar-forge.rozo-finance-received.v1',operationId:descriptor.operationId,
    descriptorSha256:digest(readFileSync(join(directory,'FINANCE_RECEIVING.json'))),planSha256:descriptor.planSha256,
    workspaceId:inventory.workspace.workspaceId,originId:inventory.workspace.originId,revision:inventory.workspace.revision,
    accounting:{verified,restored,revision:accounting.revision,handoffs:accounting.accountantHandoffs.length,closes:accounting.rozoFinance.closes.length},
    buyer,requests,receivedOriginals,receivedWorkspaceFiles:financeFiles(receiver),sourceRoot:rozo.sourceRoot,applicationModule:fileURLToPath(import.meta.url),
    providerCalls:0,sourceCapturesReplayed:0,completedAt:new Date().toISOString()};
  retainFinance(resultPath,result);return result;
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(Array.from({length:Math.floor((process.argv.length-2)/2)},(_,i)=>[process.argv[2+i*2],process.argv[3+i*2]]));
  receiveRozoFinance({directory:args['--directory'],receiver:args['--receiver'],python:args['--python']??'python3',merchantConfig:args['--merchant-config'],accountingAlias:args['--accounting']})
    .then(v=>process.stdout.write(JSON.stringify(v)+'\n')).catch(e=>{process.stderr.write(JSON.stringify({error:{code:e.code,message:e.message,details:e.details??{}}})+'\n');process.exitCode=1;});
}
