#!/usr/bin/env node
// MIT. One complete retained customer operation through the original accounting,
// MCP, closing-cycle and browser implementations. All inputs are repository examples.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,open,rename,realpath,lstat,readdir} from 'node:fs/promises';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {MerchantAccounting,normalizeAccountingConfig} from '../accounting.mjs';
import {accountingTools} from '../catalog/accounting.mjs';
import {openMerchantFileClient} from '../retained-download.mjs';
import {createAccountingStatementClient,accountingStatementPreview,accountingStatementSelection} from '../accounting-statement-client.mjs';
import {inspectAccountingStatementCycle,runAccountingStatementCycle} from '../accounting-statement-cycle.mjs';
import {startAccountingStatementCycleWorkbench} from '../accounting-statement-cycle-server.mjs';
import {readAccountingStatementCustomerDossier} from '../accounting-statement-customer-dossier.mjs';
import {validateAccountingStatementServicePlan} from '../accounting-statement-service-planner.mjs';
import {createAccountingStatementServiceSchedules,serviceScheduleBoundary} from '../accounting-statement-service-schedules.mjs';
import {createMcpToolHandler} from '../../mcp-paid-agent/http-tools.mjs';
import {acquireStateLease} from '../../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {openOutbox} from '../../../stellar/scf-starforge-20261009/sf98-merchant-delivery/outbox.mjs';
import {buildServicePeriodExample} from '../../../stellar/scf-starforge-20261009/merchant-settlement-accounting/customer-statements/examples/service-period.mjs';

const SCHEMA='stellar-forge.customer-closing-workbench-receiving.v1';
const SOURCE_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const ALIAS='period-example',ACTOR='Repository customer closing receiving';
const TOKEN_ENV='SCF_CUSTOMER_CLOSING_EXAMPLE_TOKEN';
const json=value=>JSON.stringify(value,null,2)+'\n';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const ordinal=index=>String(index+1).padStart(6,'0');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const active=record=>['RUNNING','QUEUED'].includes(record?.job?.phase);
const inputLabel='Unchanged repository service-period example';
function problem(error){return {code:error.code??'CUSTOMER_RECEIVING_FAILED',message:error.message,stack:error.stack};}
async function privateDirectory(path){
  assert.ok(isAbsolute(path)&&resolve(path)===path&&path!=='/','Choose a private absolute operation directory.');
  await mkdir(path,{recursive:true,mode:0o700});
  const info=await lstat(path);
  assert.ok(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&
    (!process.getuid||info.uid===process.getuid())&&await realpath(path)===path,'Use an owner-private real directory.');
  return path;
}
async function readOptional(path){
  try{return JSON.parse(await readFile(path,'utf8'));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function synced(path,body,{replace=false}={}){
  await privateDirectory(dirname(path));
  const bytes=Buffer.isBuffer(body)?body:Buffer.from(body),temporary=replace?path+'.'+randomUUID()+'.next':path;
  const handle=await open(temporary,'wx',0o600);
  try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  if(replace)await rename(temporary,path);
  const parent=await open(dirname(path),'r');try{await parent.sync();}finally{await parent.close();}
  return {name:resolve(path),bytes:bytes.length,sha256:sha(bytes)};
}
async function retainBytes(path,bytes){
  const body=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
  try{assert.deepEqual(await readFile(path),body,'Retain the complete original source at '+path);}
  catch(error){if(error.code!=='ENOENT')throw error;await synced(path,body);}
  return {name:resolve(path),bytes:body.length,sha256:sha(body)};
}
async function retained(path,create){
  const existing=await readOptional(path);if(existing)return existing;
  const value=await create();await synced(path,json(value));return value;
}
async function waitUntil(read,predicate,label,timeout=120000){
  const deadline=Date.now()+timeout;let value;
  while(Date.now()<deadline){value=await read();if(predicate(value))return value;await sleep(150);}
  throw Object.assign(new Error(label+' did not finish. The original operation is retained.'),{code:'CUSTOMER_RECEIVING_TIMEOUT',last:value});
}
function exampleStrKey(version,fill){
  const bytes=Buffer.alloc(35,fill);bytes[0]=version;let crc=0;
  for(const byte of bytes.subarray(0,33)){crc^=byte<<8;for(let i=0;i<8;i++)crc=((crc<<1)^(crc&0x8000?0x1021:0))&65535;}
  bytes[33]=crc&255;bytes[34]=crc>>8;
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let result='',bits=0,acc=0;
  for(const byte of bytes){acc=(acc<<8)|byte;bits+=8;while(bits>=5){bits-=5;result+=alphabet[(acc>>>bits)&31];}acc&=(1<<bits)-1;}
  return result;
}
async function fileIdentity(path){
  const bytes=await readFile(path);return {path,bytes:bytes.length,sha256:sha(bytes),gitBlob:git(bytes)};
}
async function directoryFiles(root){
  const result=[];
  async function walk(directory){
    for(const entry of await readdir(directory,{withFileTypes:true})){
      const path=join(directory,entry.name),info=await lstat(path);
      assert.ok(!info.isSymbolicLink()&&!(info.mode&0o077),'Keep the reopened native packet private.');
      if(entry.isDirectory())await walk(path);
      else if(entry.isFile()){const file=await fileIdentity(path);result.push({...file,path:path.slice(root.length+1)});}
      else throw new Error('Unexpected packet entry: '+path);
    }
  }
  await walk(root);return result.sort((a,b)=>a.path.localeCompare(b.path));
}
async function extract(archive,directory){
  await privateDirectory(directory);
  const result=spawnSync('tar',['-xzf',archive,'-C',directory],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.error?.message||'Open the original downloaded tar.gz.');
  return directoryFiles(directory);
}
async function verifyCustomer(directory,row){
  const expected=[...row.delivery.files,row.delivery.statusFile,row.delivery.indexFile];
  for(const file of expected){
    const actual=await fileIdentity(join(directory,file.name));
    assert.equal(actual.bytes,file.bytes,file.name);assert.equal(actual.sha256,file.sha256,file.name);
  }
  const statement=JSON.parse(await readFile(join(directory,'statement.json'),'utf8'));
  const status=JSON.parse(await readFile(join(directory,'status.json'),'utf8'));
  assert.equal(statement.customer.id,row.customer.id);
  assert.equal(status.statement.id,row.statement.id);
  assert.equal(status.statement.requestId,row.requestId);
  assert.equal(status.statement.status,row.statement.status);
  return {statementId:row.statement.id,number:row.statement.number,status:status.statement.status,
    files:expected.map(({name,bytes,sha256})=>({name,bytes,sha256}))};
}

/**
 * Supply an existing Playwright Browser, or choose an installed browser module in
 * the CLI. The operation directory is retained on completion and failure.
 */
export async function receiveCustomerClosingWorkbench({directory,browser,closeBrowser=false}={}){
  assert.ok(browser&&typeof browser.newContext==='function','Supply the existing Playwright browser.');
  assert.equal(typeof closeBrowser,'boolean','Keep explicit ownership of the supplied browser.');
  process.umask(0o077);directory=await privateDirectory(resolve(directory));
  const lease=await acquireStateLease(directory),calls=new Map(),contexts=[];
  let host,mcpServer,workbench,statementClient,rawConnection,baseUrl,csrfToken;
  const emit=(phase,details={})=>process.stdout.write(json({operationDirectory:directory,phase,...details}));
  let downloadRoot,screenshots,cyclesRoot,finalResult,primaryError,reopenedComplete=false,ownedBrowserClosed=false,leaseClosed=false;
  const output=async(name,value)=>synced(join(directory,name),json(value),{replace:true});
  async function closeOwnedResources(){
    const failures=[];
    async function close(label,action){try{await action();}catch(error){failures.push({resource:label,error});}}
    for(const context of [...contexts].reverse())await close('browser context',async()=>{
      await context.close();contexts.splice(contexts.indexOf(context),1);
    });
    if(workbench)await close('customer workbench',async()=>{await workbench.close();workbench=null;});
    if(statementClient)await close('statement client',async()=>{await statementClient.disconnect();statementClient=null;});
    if(mcpServer)await close('original MCP listener',async()=>{
      mcpServer.closeAllConnections?.();
      await new Promise((done,reject)=>mcpServer.close(error=>error?reject(error):done()));mcpServer=null;
    });
    if(host)await close('original accounting owner',async()=>{await host.close();host=null;});
    if(closeBrowser&&!ownedBrowserClosed)await close('owned browser',async()=>{await browser.close();ownedBrowserClosed=true;});
    if(failures.length){
      const error=new AggregateError(failures.map(row=>row.error),'The original customer operation has unconfirmed resource closure.');
      error.code='CUSTOMER_RECEIVING_CLOSE_FAILED';error.cleanup=failures.map(row=>({resource:row.resource,...problem(row.error)}));
      error.close=closeOwnedResources;throw error;
    }
  }
  async function closeOriginalOwnership(){
    await closeOwnedResources();
    if(!leaseClosed){await lease.close();leaseClosed=true;}
  }
  try{
    finalResult=await (async()=>{
    downloadRoot=await privateDirectory(join(directory,'downloads'));
    screenshots=await privateDirectory(join(directory,'screenshots'));
    cyclesRoot=await privateDirectory(join(directory,'cycles'));
    const complete=await readOptional(join(directory,'flow-result.json'));
    if(complete?.state==='COMPLETE'&&complete.customerDossier?.complete&&complete.customerDossier.reopenedAfterWorkbenchRestart&&complete.servicePlanner?.complete&&complete.serviceCalendars?.complete){
      reopenedComplete=true;return complete;
    }
    const operation=await retained(join(directory,'operation.json'),async()=>({
      schema:SCHEMA,operationId:randomUUID(),createdAt:new Date().toISOString(),input:inputLabel,
      customerReference:'SCF-PERIOD-EXAMPLE',workspace:ALIAS,actor:ACTOR
    }));
    assert.equal(operation.schema,SCHEMA);assert.equal(operation.workspace,ALIAS);
    const example=buildServicePeriodExample(),native=example.openingRaw.pass.native;
    const inputs=await privateDirectory(join(directory,'inputs'));
    const openingInput=await retainBytes(join(inputs,'opening.json'),json(example.openingRaw));
    const closingInput=await retainBytes(join(inputs,'closing.json'),json(example.closingRaw));
    const originalExample=await privateDirectory(join(directory,'original-example'));
    for(const [name,body]of Object.entries(example.files))await retainBytes(join(originalExample,name),body);
    // The repository sample's observed opaque payment identity is kept unchanged.
    // Valid configured example terms are distinct, so the original reconciliation
    // retains its actual option mismatch and unmatched transfer classification.
    const terms={schema:'stellar-forge.merchant-accounting-terms.v1',routes:[{
      routeId:native.routeId,method:native.method,network:native.network,amountAtomic:native.amountAtomic,
      asset:exampleStrKey(16,1),payTo:exampleStrKey(48,2),unitPriceUsd:null,unitCostUsd:null,
      priceBasis:'Repository service period example'
    }]};
    const termsFile=join(inputs,'terms.json');await retainBytes(termsFile,json(terms));
    const outboxDir=await privateDirectory(join(directory,'outbox'));
    const proofDir=await privateDirectory(join(directory,'proofs'));
    const outbox=await openOutbox(outboxDir);
    const event={schema:'stellar-forge.sf98.delivery-event.v1',id:native.eventId,at:native.entitledAt,
      routeId:native.routeId,method:native.method,network:native.network,amountAtomic:native.amountAtomic,
      assetDigest:native.assetDigest,recipientDigest:native.recipientDigest,receiptFingerprint:sha('example receipt'),
      transactionFingerprint:null,orderReference:native.orderRef,authority:'ORIGINAL_NATIVE_PROCESS_SETTLEMENT_SUCCESS'};
    await outbox.record(event);
    const tokenPath=join(directory,'local-access.json');
    const access=await retained(tokenPath,async()=>({token:randomUUID()+randomUUID()}));
    const environment={[TOKEN_ENV]:access.token};
    host=new MerchantAccounting({accounting:normalizeAccountingConfig({workspaces:{[ALIAS]:{
      label:'Repository service-period customer',directory:join(directory,'accounting'),outboxDir,proofDir,termsFile,
      statementUsageInputs:{opening:join(inputs,'opening.json'),closing:join(inputs,'closing.json')}
    }}},directory)});
    const tools=accountingTools((name,description,properties,required,annotations)=>
      ({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations}));
    let pause=await readOptional(join(directory,'delivery-interruption.json'));
    let pauseArmed=false;
    const handler=createMcpToolHandler({tools,call:async(name,args)=>{
      calls.set(name,(calls.get(name)??0)+1);
      if(pauseArmed&&!pause&&name==='merchant_accounting_file'&&
        args.kind==='customer-statement'&&args.file==='usage-opening.json'){
        pause={at:new Date().toISOString(),boundary:'Original MCP retained-file request',
          statementId:args.statementId,file:args.file,code:'RECEIVING_DELIVERY_PAUSED'};
        await synced(join(directory,'delivery-interruption.json'),json(pause));
        throw Object.assign(new Error('The receiving operator paused this one original file download.'),{code:pause.code});
      }
      return host.call(name,args);
    }},{bearerToken:access.token,serverName:'customer-closing-receiving',
      instructions:'Original repository example customer closing operation.',
      maxRequestBytes:4_000_000});
    const endpoint=await readOptional(join(directory,'mcp-endpoint.json'));
    mcpServer=createServer(handler);
    await new Promise((done,reject)=>{
      mcpServer.once('error',reject);mcpServer.listen(endpoint?.port??0,'127.0.0.1',()=>{mcpServer.off('error',reject);done();});
    });
    const mcpPort=mcpServer.address().port,url='http://127.0.0.1:'+mcpPort+'/mcp';
    if(endpoint)assert.equal(endpoint.port,mcpPort);else await synced(join(directory,'mcp-endpoint.json'),json({port:mcpPort}));
    const connect=async()=>{
      rawConnection=await openMerchantFileClient({url,tokenEnv:TOKEN_ENV,environment,
        errorPrefix:'CUSTOMER_CLOSING_RECEIVING',clientName:'customer-closing-receiving'});
      statementClient=createAccountingStatementClient({workspace:ALIAS,call:rawConnection.call});
      await statementClient.open();return statementClient;
    };
    await connect();
    const revision=async()=>(await statementClient.status()).revision;
    const captureName='Repository service close '+operation.operationId.slice(0,8);
    const runPage=await statementClient.status({view:'runs',offset:0,limit:200});
    let run=runPage.page.items.find(row=>row.name===captureName);
    if(!run)run=(await rawConnection.call('merchant_accounting_capture',{
      workspace:ALIAS,revision:await revision(),actor:ACTOR,name:captureName})).run;
    run=(await waitUntil(()=>rawConnection.call('merchant_accounting_run',{workspace:ALIAS,runId:run.id}),
      value=>['complete','failed'].includes(value.run.status),'Original accounting reconciliation')).run;
    assert.equal(run.status,'complete',run.error??'Complete the original accounting run.');
    const sourcePaths=[
      'stellar-forge/mcp-merchant-operator/examples/customer-closing-workbench.mjs',
      'stellar-forge/mcp-merchant-operator/accounting.mjs',
      'stellar-forge/mcp-merchant-operator/accounting-statements.mjs',
      'stellar-forge/mcp-merchant-operator/accounting-statement-client.mjs',
      'stellar-forge/mcp-merchant-operator/accounting-statement-cli.mjs',
      'stellar-forge/mcp-merchant-operator/accounting-statement-cycle.mjs',
      'stellar-forge/mcp-merchant-operator/accounting-statement-cycle-server.mjs',
      'stellar-forge/mcp-merchant-operator/accounting-statement-customer-dossier.mjs',
      'stellar-forge/mcp-merchant-operator/accounting-statement-service-planner.mjs',
      'stellar-forge/mcp-merchant-operator/accounting-statement-service-schedules.mjs',
      'stellar-forge/mcp-merchant-operator/cycle-public/service-schedules.mjs',
      'stellar-forge/mcp-merchant-operator/catalog/accounting-statements.mjs',
      'stellar-forge/mcp-merchant-operator/cycle-public/service-planner.mjs',
      'stellar-forge/mcp-merchant-operator/accounting-statement-cycle-browser-assets.json',
      'stellar-forge/mcp-merchant-operator/cycle-public/customer-dossiers.mjs',
      'stellar-forge/mcp-merchant-operator/accounting-statement-setup.mjs',
      'stellar-forge/mcp-merchant-operator/cycle-public/setup.mjs',
      'stellar-forge/mcp-merchant-operator/cycle-public/index.html',
      'stellar-forge/mcp-merchant-operator/cycle-public/app.mjs',
      'stellar-forge/mcp-merchant-operator/cycle-public/style.css',
      'stellar/scf-starforge-20261009/merchant-settlement-accounting/customer-statements/core.mjs',
      'stellar/scf-starforge-20261009/merchant-settlement-accounting/customer-statements/store.mjs',
      'stellar/scf-starforge-20261009/merchant-settlement-accounting/customer-statements/period-usage.mjs',
      'stellar/scf-starforge-20261009/merchant-settlement-accounting/customer-statements/examples/service-period.mjs'
    ];
    const source=[];
    for(const path of sourcePaths){const identity=await fileIdentity(join(SOURCE_ROOT,path));source.push({...identity,path});}
    await output('executed-source.json',{schema:SCHEMA,recordedAt:new Date().toISOString(),runtime:process.version,files:source});
    const startWorkbench=async()=>{
      workbench=await startAccountingStatementCycleWorkbench({directory:cyclesRoot,url,workspace:ALIAS,
        actor:ACTOR,tokenEnv:TOKEN_ENV,environment,port:0});
      baseUrl=workbench.url;
      const context=await fetch(new URL('/api/context',baseUrl)).then(r=>r.json());csrfToken=context.csrfToken;
    };
    await startWorkbench();
    async function api(path,body){
      const response=await fetch(new URL(path,baseUrl),{method:body===undefined?'GET':'POST',redirect:'error',
        headers:{origin:baseUrl,...(body===undefined?{}:{'content-type':'application/json','x-workbench-token':csrfToken})},
        ...(body===undefined?{}:{body:json(body)}),signal:AbortSignal.timeout(120000)});
      const value=await response.json();assert.ok(response.ok,json(value));return value;
    }
    const cyclePath=key=>'/api/cycles/'+encodeURIComponent(key);
    const readCycle=key=>api(cyclePath(key));
    async function waitCycle(key){
      const report=await waitUntil(()=>readCycle(key),value=>value.job?.phase==='ERROR'||!active(value)&&value.phase!=='UNPREPARED','Saved customer cycle');
      assert.notEqual(report.job?.phase,'ERROR',json(report.job?.error));return report;
    }
    const desktopContext=await browser.newContext({viewport:{width:1365,height:900},acceptDownloads:true});
    contexts.push(desktopContext);
    const page=await desktopContext.newPage(),pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
    await page.goto(baseUrl,{waitUntil:'networkidle'});
    await page.locator('#default-run option[value="'+run.id+'"]').waitFor({state:'attached'});
    async function screenshot(name,selected=page){
      const path=join(screenshots,name);await selected.screenshot({path,fullPage:true});
      return fileIdentity(path);
    }
    const setupActions=await readOptional(join(directory,'customer-setup-actions.json'))??{};
    async function setupTab(name){
      await page.locator('[data-view="setup"]').click();
      await page.locator('[data-setup-tab="'+name+'"]').click();
    }
    async function refreshDesktop(){
      const response=page.waitForResponse(value=>new URL(value.url()).pathname==='/api/inventory');
      await page.locator('#refresh').click();assert.ok((await response).ok());
    }
    async function savedSetup(label,kind,match,submit){
      let saved;
      if(setupActions[label])saved=await api('/api/setup/operations/'+setupActions[label].id);
      else saved=(await api('/api/setup/operations')).items.find(row=>row.kind===kind&&match(row.arguments??{}));
      if(!saved){
        const response=page.waitForResponse(value=>new URL(value.url()).pathname==='/api/setup/operations'&&value.request().method()==='POST');
        await submit();const received=await response;assert.ok(received.ok(),await received.text());saved=await received.json();
      }
      assert.equal(saved.kind,kind);assert.ok(match(saved.arguments),'Reopen the original reviewed customer choices.');
      setupActions[label]={id:saved.id,kind,requestSha256:saved.requestSha256,arguments:saved.arguments};
      await output('customer-setup-actions.json',setupActions);
      if(await page.locator('#setup-operation-dialog[open]').count())await page.locator('#setup-close-operation').click();
      await setupTab('operations');await page.locator('#setup-refresh-operations').click();
      await page.locator('[data-setup-open-operation="'+saved.id+'"]').click();
      await page.locator('#setup-operation-dialog[open]').waitFor();
      await screenshot('desktop-setup-'+label+'.png');
      let current=await api('/api/setup/operations/'+saved.id);
      if(!active(current)&&current.phase!=='OBSERVED'){
        const response=page.waitForResponse(value=>new URL(value.url()).pathname==='/api/setup/operations/'+saved.id+'/execute');
        await page.locator('#setup-apply-operation').click();assert.ok((await response).ok());
      }
      current=await waitUntil(()=>api('/api/setup/operations/'+saved.id),row=>!active(row),'Saved customer '+label);
      assert.equal(current.phase,'OBSERVED',json(current));
      setupActions[label]={...setupActions[label],phase:current.phase,result:current.state?.observation};
      await output('customer-setup-actions.json',setupActions);
      await page.locator('#setup-close-operation').click();await refreshDesktop();
      return current;
    }
    let customer=(await statementClient.allCustomers()).items.find(row=>row.reference===operation.customerReference);
    if(!customer){
      await savedSetup('create-customer','save',args=>args.reference===operation.customerReference&&!args.id,async()=>{
        await setupTab('customers');await page.locator('#setup-new-customer').click();
        await page.locator('#setup-profile-reference').fill(operation.customerReference);
        await page.locator('#setup-profile-name').fill('Repository service-period customer');
        await page.locator('#setup-profile-note-input').fill(inputLabel);
        await page.locator('#setup-profile-form button[type="submit"]').click();
      });
      customer=(await statementClient.allCustomers()).items.find(row=>row.reference===operation.customerReference);
    }
    assert.ok(customer,'The original customer was created through the workbench.');
    const customerNote='Original October repository service allowance, prepared through the customer workbench.';
    if(customer.note!==customerNote||setupActions['edit-customer']){
      await savedSetup('edit-customer','save',args=>args.id===customer.id&&args.note===customerNote,async()=>{
        await setupTab('customers');await page.locator('[data-setup-edit-customer="'+customer.id+'"]').click();
        await page.locator('#setup-profile-note-input').fill(customerNote);
        await page.locator('#setup-profile-form button[type="submit"]').click();
      });
      customer=(await statementClient.allCustomers()).items.find(row=>row.id===customer.id);
    }
    assert.equal(customer.note,customerNote);
    await savedSetup('assign-original-order','assign',args=>args.customerId===customer.id&&args.orders?.length===1&&args.orders[0].orderRef===native.orderRef,async()=>{
      await setupTab('customers');await page.locator('#setup-assign-customer').selectOption(customer.id);
      await page.locator('#setup-assign-run').selectOption(run.id);
      await page.locator('#setup-assign-orders').fill(native.orderRef+'\tRepository purchased API allowance');
      await page.locator('#setup-assign-form button[type="submit"]').click();
    });
    const assigned=await statementClient.allBindings({customerId:customer.id});
    assert.equal(assigned.items.find(row=>row.orderRef===native.orderRef)?.customerId,customer.id);
    async function importCapture(source,identity,name){
      await savedSetup('import-'+source,'usage_import',args=>args.source===source&&args.expectedSha256===identity.sha256,async()=>{
        await setupTab('usage');await page.locator('#setup-refresh-sources').click();
        await page.locator('#setup-usage-source option[value="'+source+'"]').waitFor({state:'attached'});
        await page.locator('#setup-usage-source').selectOption(source);
        const preview=page.waitForResponse(value=>new URL(value.url()).pathname==='/api/setup/usage-preview');
        await page.locator('#setup-preview-source').click();const response=await preview,body=await response.json();
        assert.ok(response.ok(),json(body));assert.equal(body.source.sha256,identity.sha256);
        await page.locator('#setup-import-name').fill(name);
        await page.locator('#setup-import-form button[type="submit"]').click();
      });
      const result=(await statementClient.allUsage()).items.find(row=>row.sha256===identity.sha256);
      assert.ok(result,'The original inspected capture was imported.');return result;
    }
    const opening=await importCapture('opening',openingInput,'Opening service capture — 1 October 16:00 UTC');
    const closing=await importCapture('closing',closingInput,'Closing service capture — 1 October 17:00 UTC');
    emit('CUSTOMER_SETUP_COMPLETE',{customerId:customer.id,runId:run.id,operations:Object.keys(setupActions).length});
    const period=await statementClient.usagePeriod({usageOpeningId:opening.id,usageId:closing.id});
    assert.equal(period.period.totals.newCalls,3);assert.equal(period.period.totals.consumedUnits,'15');
    assert.equal(period.period.totals.releasedUnits,'15');assert.equal(period.period.totals.admittedUnits,'20');
    assert.equal(period.period.totals.resultRecoveries,1);assert.equal(period.period.closing.unitsRemaining,'60');
    await output('original-period.json',period);
    const binding={schema:SCHEMA,operationId:operation.operationId,customerId:customer.id,runId:run.id,
      usageOpeningId:opening.id,usageId:closing.id,opening:openingInput,closing:closingInput};
    const priorBinding=await retained(join(directory,'native-selection.json'),async()=>binding);
    assert.deepEqual(priorBinding,binding);
    async function showCycle(key){
      await page.locator('[data-view="cycles"]').click();
      await page.locator('#reload-cycles').click();
      await page.locator('[data-cycle="'+key+'"]').click();
      await page.locator('#cycle-detail h2').waitFor();
    }
    async function prepare(label,selections,{sourceStatement}={}){
      const existing=(await api('/api/cycles')).items.find(row=>row.label===label);
      if(existing){
        if(existing.phase==='UNPREPARED'&&!active(existing))await api(cyclePath(existing.key)+'/prepare',{});
        const saved=await waitCycle(existing.key);
        assert.deepEqual(saved.rows.map(row=>row.intent),selections.map(accountingStatementSelection));
        await showCycle(existing.key);return existing.key;
      }
      await page.locator('[data-view="compose"]').click();
      await refreshDesktop();
      await page.locator('#default-run option[value="'+run.id+'"]').waitFor({state:'attached'});
      while(await page.locator('[data-remove]').count())await page.locator('[data-remove]').first().click();
      await page.locator('#cycle-label').fill(label);
      if(sourceStatement){
        await setupTab('statements');
        await page.locator('#setup-statement-customer').selectOption(customer.id);
        await page.locator('[data-setup-open-statement="'+sourceStatement+'"]').click();
        await page.locator('#setup-statement-dialog[open]').waitFor();
        assert.equal(await page.locator('#setup-statement-content .file-list a').count(),9);
        await screenshot('desktop-issued-period.png');
        await page.locator('[data-setup-correct-statement="'+sourceStatement+'"]').click();
        await page.locator('[data-index="0"][data-field="replacesId"]').waitFor({state:'attached'});
        assert.equal(await page.locator('[data-index="0"][data-field="replacesId"]').inputValue(),sourceStatement);
        assert.equal(await page.locator('[data-index="0"][data-field="usageOpeningId"]').inputValue(),opening.id);
        await page.locator('#cycle-label').fill(label);
      }else{
        for(const [index,selection]of selections.entries()){
          await page.locator('#default-run').selectOption(selection.runId);
          await page.locator('#default-closing').selectOption(selection.usageId??'');
          await page.locator('#default-opening').selectOption(selection.usageOpeningId??'');
          await page.locator('[data-customer="'+selection.customerId+'"]').check();
          await page.locator('#add-customers').click();
          if(selection.replacesId){
            await page.locator('.selection').nth(index).locator('summary').click();
            await page.locator('[data-index="'+index+'"][data-field="replacesId"]').selectOption(selection.replacesId);
          }
        }
      }
      await page.locator('[data-preview="0"]').click();
      await page.locator('#review-dialog[open]').waitFor();
      await screenshot('desktop-source-review.png');
      await page.locator('#close-review').click();
      const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/cycles'&&response.request().method()==='POST');
      await page.locator('#prepare').click();
      const response=await responsePromise,value=await response.json();assert.ok(response.ok(),json(value));
      const key=value.key;await waitCycle(key);await showCycle(key);return key;
    }
    async function runFromBrowser(key){
      await showCycle(key);
      const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname===cyclePath(key)+'/run'&&response.request().method()==='POST');
      await page.locator('[data-run]').click();
      const response=await responsePromise;assert.ok(response.ok(),await response.text());
      const report=await waitCycle(key);await showCycle(key);return report;
    }
    async function customerHandover(key,report,label){
      const retainedHandover=await readOptional(join(directory,'customer-handover-'+label+'.json'));
      if(retainedHandover){
        assert.equal(retainedHandover.cycleKey,key);assert.equal(retainedHandover.cycleId,report.cycleId);
        assert.equal(retainedHandover.customerId,customer.id);assert.match(retainedHandover.snapshotSha256,/^[a-f0-9]{64}$/);
        const archive=join(downloadRoot,'customer-handover-'+label+'.tar.gz');
        const receivedRoot=join(directory,'customer-handovers',label+'-'+retainedHandover.snapshotSha256,'renamed-customer-folder');
        assert.equal(retainedHandover.archive.path,archive);assert.equal(retainedHandover.directory,receivedRoot);
        const archiveIdentity=await fileIdentity(archive);
        assert.equal(archiveIdentity.bytes,retainedHandover.archive.bytes);assert.equal(archiveIdentity.sha256,retainedHandover.archive.sha256);
        await privateDirectory(receivedRoot);
        const original=await readAccountingStatementCustomerDossier({directory:receivedRoot,verifyFiles:true});
        assert.equal(original.snapshotSha256,retainedHandover.snapshotSha256);
        assert.equal(original.customer.customerId,customer.id);assert.equal(original.cycle.cycleId,report.cycleId);
        assert.deepEqual(original.files,retainedHandover.files);
        // A later native correction cannot relabel or overwrite the original issued snapshot.
        return retainedHandover;
      }
      const customerRows=report.rows.filter(row=>row.customer.id===customer.id);
      assert.ok(customerRows.length>=2,'Receive the same customer across its original statement rows.');
      await showCycle(key);
      const groups=await api(cyclePath(key)+'/customers'),group=groups.customers.find(item=>item.customerId===customer.id);
      assert.equal(groups.cycle.cycleId,report.cycleId);assert.ok(group);
      assert.deepEqual(group.rowIndexes,customerRows.map(row=>row.index));
      assert.deepEqual(group.rows.map(row=>row.statement?.id??null),customerRows.map(row=>row.statement?.id??null));
      assert.equal(group.counts.total,customerRows.length);
      assert.equal(group.counts.delivered,customerRows.filter(row=>row.phase==='DELIVERED'&&row.delivery?.complete).length);
      assert.ok(group.rows.every(row=>row.passes.some(pass=>pass.orderRef===native.orderRef)));
      const section=page.locator('#customer-dossiers');
      const customerCard=section.locator('.customer-dossier').filter({has:page.locator('details[data-dossier-customer="'+customer.id+'"]')});
      await customerCard.waitFor();
      const details=customerCard.locator('details[data-dossier-customer="'+customer.id+'"]');
      if(await details.getAttribute('open')===null)await details.locator('summary').first().click();
      assert.equal(await details.locator('.dossier-rows tbody tr').count(),customerRows.length);
      await screenshot('desktop-customer-handover-'+label+'.png');
      const browserDownload=page.waitForEvent('download',{timeout:120000});
      await customerCard.locator('[data-dossier-focus="download-'+customer.id+'"]').click();
      const receivedDownload=await browserDownload,archive=join(downloadRoot,'customer-handover-'+label+'.tar.gz');
      await receivedDownload.saveAs(archive);assert.equal(await receivedDownload.failure(),null);
      const snapshot=await api(cyclePath(key)+'/customers/'+customer.id+'/export',{});
      assert.equal(snapshot.reused,true,'The browser download already saved this exact immutable customer snapshot.');
      const repeated=await api(cyclePath(key)+'/customers/'+customer.id+'/export',{});
      assert.equal(repeated.reused,true);assert.equal(repeated.snapshotSha256,snapshot.snapshotSha256);
      assert.deepEqual(repeated.files,snapshot.files);
      assert.equal(snapshot.counts.total,customerRows.length);assert.equal(snapshot.counts.delivered,group.counts.delivered);
      assert.equal(snapshot.complete,group.complete);
      const reopenedRoot=await privateDirectory(join(directory,'customer-handovers',label+'-'+snapshot.snapshotSha256,'renamed-customer-folder'));
      const extracted=await extract(archive,reopenedRoot);
      const reopened=await readAccountingStatementCustomerDossier({directory:reopenedRoot,verifyFiles:true});
      assert.equal(reopened.snapshotSha256,snapshot.snapshotSha256);
      assert.equal(reopened.customer.customerId,customer.id);assert.equal(reopened.cycle.cycleId,report.cycleId);
      assert.deepEqual(reopened.statements.map(row=>row.index),group.rowIndexes);
      assert.deepEqual(reopened.statements.map(row=>row.statement?.status??null),customerRows.map(row=>row.statement?.status??null));
      const sorted=files=>files.map(({path,sha256,bytes})=>({path,sha256,bytes})).sort((a,b)=>a.path.localeCompare(b.path));
      assert.deepEqual(sorted(extracted),sorted(reopened.files));
      const originals=[];
      for(const row of customerRows.filter(row=>row.phase==='DELIVERED'&&row.delivery?.complete)){
        const saved=await verifyCustomer(join(reopenedRoot,'statements',row.statement.id),row);
        const statement=JSON.parse(await readFile(join(reopenedRoot,'statements',row.statement.id,'statement.json'),'utf8'));
        const recorded=reopened.statements.find(item=>item.index===row.index);
        assert.deepEqual(recorded.passes,statement.items.map(item=>({orderRef:item.orderRef,label:item.label,
          plan:item.service?{id:item.service.planId,revision:item.service.planRevision,label:item.service.planLabel}:null})));
        originals.push(saved);
      }
      const packet=await desktopContext.newPage();packet.on('pageerror',error=>pageErrors.push(error.message));
      await packet.goto(pathToFileURL(join(reopenedRoot,'index.html')).href);
      assert.ok((await packet.locator('main').innerText()).includes(customer.name));
      const first=reopened.statements.find(row=>row.included);
      await packet.locator('a[href="'+first.path+'/index.html"]').first().click();
      await packet.locator('a[href="statement.html"]').first().click();
      assert.equal(packet.url(),pathToFileURL(join(reopenedRoot,first.path,'statement.html')).href);
      await screenshot('reopened-customer-handover-'+label+'.png',packet);await packet.close();
      const result={cycleKey:key,cycleId:report.cycleId,customerId:customer.id,snapshotSha256:snapshot.snapshotSha256,
        complete:snapshot.complete,counts:snapshot.counts,reused:repeated.reused,files:reopened.files,
        indexHref:snapshot.indexHref,downloadHref:snapshot.downloadHref,
        manifestHref:snapshot.files.find(file=>file.path==='dossier.json').href,
        originalStatements:originals,archive:await fileIdentity(archive),directory:reopenedRoot};
      await output('customer-handover-'+label+'.json',result);return result;
    }
    // Consume the planner through the same original customer and complete source captures.
    const plannerRead=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/service-planner');
    await page.locator('[data-view="service-planner"]').click();
    const plannerResponse=await plannerRead,plannerInventory=await plannerResponse.json();
    assert.ok(plannerResponse.ok(),json(plannerInventory));
    const plannerRow=plannerInventory.rows.find(row=>row.customer.id===customer.id&&row.pass.orderRef===native.orderRef);
    assert.ok(plannerRow,'The original assigned purchased pass appears in the native capture catalogue.');
    assert.deepEqual(new Set(plannerRow.captures.map(row=>row.id)),new Set([opening.id,closing.id]));
    assert.equal(plannerRow.captures.find(row=>row.id===opening.id).sha256,openingInput.sha256);
    assert.equal(plannerRow.captures.find(row=>row.id===closing.id).sha256,closingInput.sha256);
    if(!plannerRow.history.some(row=>row.status==='RETAINED')){
      assert.equal(plannerRow.suggestion.state,'FIRST_PERIOD');
      assert.equal(plannerRow.suggestion.openingId,opening.id);assert.equal(plannerRow.suggestion.closingId,closing.id);
    }
    if(await page.locator('#service-choices .service-choice').count())await page.locator('#service-clear').click();
    await page.locator('#service-default-run').selectOption(run.id);
    const plannerLabel=captureName+' — planned service close';
    await page.locator('#service-label').fill(plannerLabel);
    await page.locator('[data-service-add="'+plannerRow.id+'"]').click();
    await page.locator('#service-choices [data-field="usageOpeningId"]').selectOption(opening.id);
    await page.locator('#service-choices [data-field="usageId"]').selectOption(closing.id);
    await page.locator('#service-choices [data-service-preview]').click();
    await page.locator('#review-dialog[open]').waitFor();
    await screenshot('desktop-planner-native-review.png');await page.locator('#close-review').click();
    const compiledRead=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/service-planner/plan');
    await page.locator('#service-compile').click();const compiledResponse=await compiledRead,compiledPlan=await compiledResponse.json();
    assert.ok(compiledResponse.ok(),json(compiledPlan));validateAccountingStatementServicePlan(compiledPlan);
    assert.deepEqual(compiledPlan.selections,[accountingStatementSelection({customerId:customer.id,runId:run.id,usageOpeningId:opening.id,usageId:closing.id})]);
    await screenshot('desktop-service-close-plan.png');
    const plannerFiles=[];
    for(const format of ['json','csv','html']){
      const downloadPromise=page.waitForEvent('download');
      await page.locator('[data-service-export="'+format+'"]').click();const downloaded=await downloadPromise;
      const path=join(downloadRoot,'service-close-plan.'+format);await downloaded.saveAs(path);
      assert.equal(await downloaded.failure(),null);plannerFiles.push(await fileIdentity(path));
    }
    const portablePlan=validateAccountingStatementServicePlan(JSON.parse(await readFile(join(downloadRoot,'service-close-plan.json'),'utf8')));
    assert.equal(portablePlan.planSha256,compiledPlan.planSha256);
    const csv=await readFile(join(downloadRoot,'service-close-plan.csv'),'utf8');
    assert.ok(csv.includes(opening.id)&&csv.includes(closing.id)&&csv.includes(run.id));
    const readablePlan=await desktopContext.newPage();readablePlan.on('pageerror',error=>pageErrors.push(error.message));
    await readablePlan.goto(pathToFileURL(join(downloadRoot,'service-close-plan.html')).href);
    assert.ok((await readablePlan.locator('tbody').innerText()).includes(customer.name));
    await screenshot('reopened-service-close-plan.png',readablePlan);await readablePlan.close();
    const importedRead=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/service-planner/validate');
    await page.locator('#service-plan-file').setInputFiles(join(downloadRoot,'service-close-plan.json'));
    const importedResponse=await importedRead;assert.ok(importedResponse.ok(),await importedResponse.text());
    await page.locator('#service-prepare').waitFor({state:'visible'});
    let plannedCycle=(await api('/api/cycles')).items.find(row=>row.label===plannerLabel);
    if(!plannedCycle){
      const preparedRead=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/service-planner/cycles');
      await page.locator('#service-prepare').click();const preparedResponse=await preparedRead;
      plannedCycle=await preparedResponse.json();assert.ok(preparedResponse.ok(),json(plannedCycle));
    }else if(plannedCycle.phase==='UNPREPARED'&&!active(plannedCycle))await api(cyclePath(plannedCycle.key)+'/prepare',{});
    plannedCycle=await waitCycle(plannedCycle.key);
    assert.deepEqual(plannedCycle.rows.map(row=>row.intent),compiledPlan.selections);
    const plannedNativeReview=await api(cyclePath(plannedCycle.key)+'/items/1/review');
    assert.equal(plannedNativeReview.draft.servicePeriod.openingSource.sha256,openingInput.sha256);
    assert.equal(plannedNativeReview.draft.servicePeriod.closingSource.sha256,closingInput.sha256);
    assert.equal(plannedNativeReview.draft.servicePeriod.totals.consumedUnits,'15');
    await showCycle(plannedCycle.key);await screenshot('desktop-planner-prepared-cycle.png');
    const plannerPrepared={cycleKey:plannedCycle.key,cycleId:plannedCycle.cycleId,planSha256:compiledPlan.planSha256,
      inventorySha256:plannerInventory.inventorySha256,passIdentitySha256:plannerRow.periodIdentitySha256,
      nativePreviewSha256:plannedNativeReview.previewSha256,selections:compiledPlan.selections,files:plannerFiles};
    await output('service-planner-prepared.json',plannerPrepared);

    // Adopt the existing period-only planner cycle into its saved service calendar.
    // The separate main cycle below still owns the original period+cumulative issue.
    const calendarFiles=[],calendarRequestId=plannedCycle.key.slice('cycle-'.length);
    assert.match(plannedCycle.key,/^cycle-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
    const calendarName=captureName+' — monthly service calendar';
    const calendarAnchor=plannerRow.captures.find(row=>row.id===opening.id).sourceCreatedAt.slice(0,10);
    const calendarUntil=serviceScheduleBoundary({anchor:calendarAnchor,cadence:'monthly',interval:1},3);
    const calendarWindow={from:calendarAnchor,until:calendarUntil,includePaused:false,offset:0,limit:100};
    async function showCalendars(selectedPage=page){
      const observed=selectedPage.waitForResponse(response=>new URL(response.url()).pathname==='/api/service-schedules/calendar');
      await selectedPage.locator('[data-view="service-schedules"]').click();
      assert.ok((await observed).ok());
      await selectedPage.waitForFunction(()=>!document.getElementById('service-schedules-view').inert);
      await selectedPage.locator('#schedule-from').fill(calendarWindow.from);
      await selectedPage.locator('#schedule-until').fill(calendarWindow.until);
      const windowRead=selectedPage.waitForResponse(response=>new URL(response.url()).pathname==='/api/service-schedules/calendar');
      await selectedPage.locator('#schedule-window button[type="submit"]').click();
      const response=await windowRead,value=await response.json();assert.ok(response.ok(),json(value));
      await selectedPage.waitForFunction(()=>!document.getElementById('service-schedules-view').inert);
      return value;
    }
    let calendarCatalogue=await api('/api/service-schedules/catalogue');
    let savedCalendar=calendarCatalogue.current.find(row=>row.name===calendarName);
    if(!savedCalendar){
      await showCalendars();
      await page.locator('#schedule-new').click();
      await page.locator('#schedule-name').fill(calendarName);
      await page.locator('#schedule-pass').selectOption(plannerRow.id);
      await page.locator('#schedule-anchor').fill(calendarAnchor);
      await page.locator('#schedule-cadence').selectOption('monthly');
      await page.locator('#schedule-interval').fill('1');
      await page.locator('#schedule-due').fill('0');
      await page.locator('#schedule-notes').fill('Original repository customer period; actual retained captures define the statement source interval.');
      const savedRead=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/service-schedules/save');
      await page.locator('#schedule-save').click();
      const response=await savedRead,value=await response.json();assert.ok(response.ok(),json(value));
      savedCalendar=value.definition;
      await page.waitForFunction(()=>!document.getElementById('service-schedules-view').inert);
    }
    assert.equal(savedCalendar.customerId,customer.id);assert.equal(savedCalendar.bindingId,plannerRow.binding.id);
    assert.equal(savedCalendar.periodIdentitySha256,plannerRow.periodIdentitySha256);
    assert.equal(savedCalendar.anchor,calendarAnchor);assert.equal(savedCalendar.cadence,'monthly');
    let calendarPage=await showCalendars();
    const firstCalendarPeriod=()=>calendarPage.items.find(row=>row.scheduleId===savedCalendar.id&&row.index===0);
    assert.ok(firstCalendarPeriod());assert.equal(calendarPage.items.filter(row=>row.scheduleId===savedCalendar.id).length,3);
    const calendarCheckpointPath=join(directory,'service-calendar-request.json');
    const calendarCheckpoint=await readOptional(calendarCheckpointPath);
    const originalCalendarRequest=await api('/api/service-schedules/request',{requestId:calendarRequestId});
    let calendarRequest=originalCalendarRequest.found?{
      requestId:originalCalendarRequest.preparation.requestId,label:originalCalendarRequest.preparation.label,
      scheduledPlan:originalCalendarRequest.preparation.scheduledPlan
    }:calendarCheckpoint?.request;
    if(!calendarRequest){
      const selectedPeriod=firstCalendarPeriod();
      await page.locator('[data-schedule-add="'+selectedPeriod.id+'"]').click();
      await page.locator('[data-schedule-choice="0"][data-field="runId"]').selectOption(run.id);
      await page.locator('[data-schedule-choice="0"][data-field="usageOpeningId"]').selectOption(opening.id);
      await page.locator('[data-schedule-choice="0"][data-field="usageId"]').selectOption(closing.id);
      await page.locator('[data-schedule-choice="0"][data-field="acceptDifferentBoundaries"]').check();
      await page.locator('#schedule-cycle-label').fill(plannerLabel);
      const reviewedRead=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/service-schedules/compile');
      await page.locator('#schedule-compile').click();
      const response=await reviewedRead,scheduledPlan=await response.json();assert.ok(response.ok(),json(scheduledPlan));
      await page.waitForFunction(()=>!document.getElementById('service-schedules-view').inert);
      assert.deepEqual(scheduledPlan.plan.selections,compiledPlan.selections);
      assert.equal(scheduledPlan.targets[0].boundaryDifference,true);
      await page.locator('[data-schedule-preview="0"]').click();
      await page.locator('#review-dialog[open]').waitFor();
      await screenshot('desktop-calendar-native-review.png');await page.locator('#close-review').click();
      calendarRequest={requestId:calendarRequestId,label:plannerLabel,scheduledPlan};
    }
    assert.equal(calendarRequest.requestId,calendarRequestId);assert.equal(calendarRequest.label,plannerLabel);
    assert.deepEqual(calendarRequest.scheduledPlan.plan.selections,compiledPlan.selections);
    assert.equal(calendarRequest.scheduledPlan.targets[0].scheduleId,savedCalendar.id);
    if(calendarCheckpoint)assert.deepEqual(calendarCheckpoint.request,calendarRequest);
    else await synced(calendarCheckpointPath,json({schema:SCHEMA,request:calendarRequest,calendarId:savedCalendar.id,
      originalPlannedCycleKey:plannedCycle.key,originalPlannedCycleId:plannedCycle.cycleId}));
    let calendarRecovery=await readOptional(join(directory,'service-calendar-recovery.json'));
    if(!calendarRecovery){
      const draftContext=await api('/api/context'),target=calendarRequest.scheduledPlan.targets[0];
      const selected=[{period:{...firstCalendarPeriod(),version:target.version,index:target.index},
        runId:run.id,usageOpeningId:opening.id,usageId:closing.id,acceptDifferentBoundaries:true}];
      // Restore the exact pre-send browser draft from the course's saved request.
      await page.evaluate(({scope,request,selected,window})=>{
        const key='customer-service-calendars:'+scope,previous=JSON.parse(localStorage.getItem(key)??'{}');
        localStorage.setItem(key,JSON.stringify({...previous,selected,label:request.label,requestId:request.requestId,
          pending:request,pendingDraft:JSON.stringify({selected,label:request.label}),from:window.from,until:window.until}));
      },{scope:draftContext.draftScope,request:calendarRequest,selected,window:calendarWindow});
      await page.reload({waitUntil:'networkidle'});await showCalendars();
      let lostResponse=null;
      const interruptResponse=async route=>{
        const path=new URL(route.request().url()).pathname;
        if(lostResponse||!['/api/service-schedules/resume','/api/service-schedules/prepare'].includes(path)){
          await route.continue();return;
        }
        const response=await route.fetch();
        if(response.ok()){lostResponse={path,status:response.status(),requestId:calendarRequestId};await route.abort('failed');}
        else await route.fulfill({response});
      };
      await page.route('**/api/service-schedules/**',interruptResponse);
      try{
        await page.locator('#schedule-recover').click();
        await waitUntil(async()=>lostResponse,Boolean,'Saved calendar preparation response');
        await page.waitForFunction(()=>!document.getElementById('service-schedules-view').inert&&
          !document.getElementById('schedule-pending').hidden);
      }finally{await page.unroute('**/api/service-schedules/**',interruptResponse);}
      const saved=await api('/api/service-schedules/request',{requestId:calendarRequestId});
      assert.equal(saved.found,true);assert.equal(saved.preparation.cycleKey,plannedCycle.key);
      assert.deepEqual(saved.preparation.scheduledPlan,calendarRequest.scheduledPlan);
      const newerLabel=plannerLabel+' — next draft';
      await page.locator('#schedule-cycle-label').fill(newerLabel);
      const newerRead=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/service-schedules/compile');
      await page.locator('#schedule-compile').click();
      const newerResponse=await newerRead,newerPlan=await newerResponse.json();assert.ok(newerResponse.ok(),json(newerPlan));
      await page.waitForFunction(()=>!document.getElementById('service-schedules-view').inert);
      const recoveredRead=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/service-schedules/resume');
      await page.locator('#schedule-recover').click();
      const recoveredResponse=await recoveredRead,recovered=await recoveredResponse.json();assert.ok(recoveredResponse.ok(),json(recovered));
      assert.equal(recovered.cycle.key,plannedCycle.key);assert.equal(recovered.cycle.cycleId,plannedCycle.cycleId);
      await page.waitForFunction(()=>!document.getElementById('service-schedules-view').inert&&
        document.getElementById('schedule-pending').hidden);
      await showCalendars();
      const preserved=await page.evaluate(scope=>JSON.parse(localStorage.getItem('customer-service-calendars:'+scope)),draftContext.draftScope);
      assert.equal(preserved.pending,null);assert.equal(preserved.pendingDraft,null);
      assert.equal(preserved.label,newerLabel);assert.equal(preserved.selected.length,1);
      assert.equal(preserved.selected[0].usageOpeningId,opening.id);assert.equal(preserved.selected[0].usageId,closing.id);
      assert.notEqual(preserved.requestId,calendarRequestId);
      assert.equal(await page.locator('#schedule-plan-panel').evaluate(element=>element.hidden),false);
      await screenshot('desktop-calendar-recovered-newer-draft.png');
      calendarRecovery={requestId:calendarRequestId,cycleKey:recovered.cycle.key,cycleId:recovered.cycle.cycleId,
        lostResponse,preservedDraft:{label:preserved.label,requestId:preserved.requestId,selections:preserved.selected,
          reviewedPlanSha256:newerPlan.sha256},originalScheduledPlanSha256:calendarRequest.scheduledPlan.sha256};
      await output('service-calendar-recovery.json',calendarRecovery);
    }else{
      const recovered=await api('/api/service-schedules/resume',{requestId:calendarRequestId});
      assert.equal(recovered.cycle.key,plannedCycle.key);assert.equal(recovered.cycle.cycleId,plannedCycle.cycleId);
    }
    emit('SERVICE_CALENDAR_PREPARED',{calendarId:savedCalendar.id,originalCycleKey:plannedCycle.key,
      requestId:calendarRequestId,newerDraftPreserved:true});

    const periodSelection={customerId:customer.id,runId:run.id,usageOpeningId:opening.id,usageId:closing.id};
    const cumulativeSelection={customerId:customer.id,runId:run.id,usageId:closing.id};
    const cycleKey=await prepare(captureName,[periodSelection,cumulativeSelection]);
    const reviewed=await api(cyclePath(cycleKey)+'/items/1/review');accountingStatementPreview(reviewed);
    assert.equal(reviewed.intent.usageOpeningId,opening.id);assert.equal(reviewed.draft.servicePeriod.totals.consumedUnits,'15');
    await output('saved-original-review.json',reviewed);
    await page.locator('[data-review-saved="1"]').click();await page.locator('#review-dialog[open]').waitFor();
    await screenshot('desktop-frozen-review.png');await page.locator('#close-review').click();
    let cycle=await readCycle(cycleKey);
    if(!cycle.complete){
      if(!pause||!cycle.rows.some(row=>row.phase==='EXPORT_PENDING')){
        pauseArmed=!pause;cycle=await runFromBrowser(cycleKey);pauseArmed=false;
      }
      if(pause&&cycle.rows.some(row=>row.phase==='EXPORT_PENDING')){
        assert.equal(cycle.counts.retained,2);assert.equal(cycle.counts.delivered,1);
        await output('partial-cycle.json',cycle);await screenshot('desktop-partial-close.png');
        const partialHandover=await customerHandover(cycleKey,cycle,'partial');
        assert.equal(partialHandover.complete,false);assert.equal(partialHandover.counts.delivered,1);assert.equal(partialHandover.counts.pending,1);
        const archive=join(downloadRoot,'partial-cycle.tar.gz');
        let originalPartial;
        try{originalPartial=await fileIdentity(archive);}
        catch(error){if(error.code!=='ENOENT')throw error;}
        if(!originalPartial){
          const response=await fetch(new URL(cyclePath(cycleKey)+'/download',baseUrl));
          assert.ok(response.ok,await response.clone().text());
          await retainBytes(archive,Buffer.from(await response.arrayBuffer()));
        }
        const reopenedRoot=join(directory,'reopened-partial-cycle');
        await extract(archive,reopenedRoot);
        const partial=await inspectAccountingStatementCycle({directory:reopenedRoot});
        assert.equal(partial.cycleId,cycle.cycleId);
        const recovered=await runAccountingStatementCycle({directory:reopenedRoot,execute:false,client:statementClient});
        assert.equal(recovered.complete,true);
        assert.deepEqual(recovered.rows.map(row=>row.statement.id),cycle.rows.map(row=>row.statement.id));
        await output('reopened-partial-result.json',recovered);
        cycle=await runFromBrowser(cycleKey);
      }
    }
    assert.equal(cycle.complete,true,json(cycle.rows.map(row=>({phase:row.phase,error:row.error}))));assert.equal(cycle.rows.length,2);
    assert.equal(cycle.rows[0].delivery.files.length,9);assert.equal(cycle.rows[1].delivery.files.length,5);
    const originalIds=cycle.rows.map(row=>row.statement.id);
    emit('CUSTOMER_CLOSE_COMPLETE',{cycleKey,statementIds:originalIds,delivered:cycle.counts.delivered});
    const issuedHandover=await customerHandover(cycleKey,cycle,'issued');assert.equal(issuedHandover.complete,true);
    const correctionKey=await prepare(captureName+' — correction',[{...periodSelection,replacesId:originalIds[0]}],{sourceStatement:originalIds[0]});
    let correction=await readCycle(correctionKey);
    if(!correction.complete)correction=await runFromBrowser(correctionKey);
    assert.equal(correction.complete,true);
    const correctionId=correction.rows[0].statement.id;
    assert.equal((await statementClient.detail({statementId:originalIds[0]})).statement.status,'SUPERSEDED');
    const withdrawalReason='Repository cumulative view replaced by the reviewed service-period close.';
    await savedSetup('withdraw-cumulative','withdraw',args=>args.statementId===originalIds[1]&&args.reason===withdrawalReason,async()=>{
      await setupTab('statements');await page.locator('#setup-statement-customer').selectOption(customer.id);
      await page.locator('[data-setup-open-statement="'+originalIds[1]+'"]').click();
      await page.locator('#setup-statement-dialog[open]').waitFor();
      await page.locator('.setup-withdraw summary').click();
      await page.locator('#setup-withdraw-reason').fill(withdrawalReason);
      await page.locator('#setup-withdraw-form button[type="submit"]').click();
    });
    assert.equal((await statementClient.detail({statementId:originalIds[1]})).statement.status,'WITHDRAWN');
    // Refresh current original lifecycle snapshots without issuing another statement.
    await api(cyclePath(cycleKey)+'/run',{execute:true});cycle=await waitCycle(cycleKey);
    assert.deepEqual(cycle.rows.map(row=>row.statement.id),originalIds);
    assert.equal(cycle.rows[0].statement.status,'SUPERSEDED');
    assert.equal(cycle.rows[1].statement.status,'WITHDRAWN');
    await showCycle(cycleKey);await screenshot('desktop-complete-close.png');
    const finalHandover=await customerHandover(cycleKey,cycle,'lifecycle');
    assert.equal(finalHandover.counts.superseded,1);assert.equal(finalHandover.counts.withdrawn,1);
    const earlierHandover=await api(issuedHandover.manifestHref);
    assert.equal(earlierHandover.snapshotSha256,issuedHandover.snapshotSha256);
    assert.deepEqual(earlierHandover.statements.map(row=>row.statement.status),issuedHandover.originalStatements.map(row=>row.status));
    const lifecycleRead=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/service-planner');
    await page.locator('[data-view="service-planner"]').click();await page.locator('#service-refresh').click();
    const lifecycleResponse=await lifecycleRead,plannerLifecycle=await lifecycleResponse.json();
    assert.ok(lifecycleResponse.ok(),json(plannerLifecycle));
    const plannerCurrent=plannerLifecycle.rows.find(row=>row.id===plannerRow.id);
    assert.ok(plannerCurrent);assert.equal(plannerCurrent.suggestion.state,'NO_LATER_CAPTURE');
    assert.equal(plannerCurrent.suggestion.openingId,closing.id);assert.equal(plannerCurrent.suggestion.closingId,null);
    assert.equal(plannerCurrent.history.find(row=>row.id===correctionId).status,'RETAINED');
    assert.equal(plannerCurrent.history.find(row=>row.id===originalIds[0]).status,'SUPERSEDED');
    assert.equal(plannerCurrent.cumulativeStatements.find(row=>row.id===originalIds[1]).status,'WITHDRAWN');
    await page.locator('[data-service-history="'+plannerRow.id+'"]').first().click();
    await page.locator('#service-history-dialog[open]').waitFor();
    assert.ok((await page.locator('#service-history-rows').innerText()).includes('Superseded'));
    await screenshot('desktop-planner-correction-history.png');await page.locator('#service-history-close').click();
    await output('service-planner-lifecycle.json',{inventorySha256:plannerLifecycle.inventorySha256,revision:plannerLifecycle.revision,row:plannerCurrent});

    calendarPage=await showCalendars();
    const currentCalendarPeriod=firstCalendarPeriod();
    assert.ok(currentCalendarPeriod.preparations.some(row=>row.requestId===calendarRequestId&&row.cycleKey===plannedCycle.key));
    assert.ok(currentCalendarPeriod.currentStatements.some(row=>row.id===correctionId&&row.status==='RETAINED'));
    assert.ok(!currentCalendarPeriod.currentStatements.some(row=>originalIds.includes(row.id)));
    await screenshot('desktop-calendar-current-native-statement.png');
    for(const format of ['html','csv']){
      const downloadedRead=page.waitForEvent('download');
      await page.locator('#schedule-window-'+format).click();
      const downloaded=await downloadedRead,path=join(downloadRoot,'customer-service-calendar.'+format);
      await downloaded.saveAs(path);assert.equal(await downloaded.failure(),null);calendarFiles.push(await fileIdentity(path));
      const content=await readFile(path,'utf8');
      assert.ok(content.includes(calendarName)&&content.includes(plannedCycle.key));
      assert.ok(content.includes(currentCalendarPeriod.currentStatements.find(row=>row.id===correctionId).number));
      await page.waitForFunction(()=>!document.getElementById('service-schedules-view').inert);
    }
    const calendarDownload=page.waitForEvent('download');
    await page.locator('#schedule-export').click();const calendarExport=await calendarDownload;
    const calendarBundlePath=join(downloadRoot,'customer-service-calendars.json');
    await calendarExport.saveAs(calendarBundlePath);assert.equal(await calendarExport.failure(),null);
    calendarFiles.push(await fileIdentity(calendarBundlePath));
    const calendarBundle=JSON.parse(await readFile(calendarBundlePath,'utf8'));
    assert.equal(calendarBundle.preparations.find(row=>row.requestId===calendarRequestId).cycleKey,plannedCycle.key);
    const plannedArchive=join(downloadRoot,'calendar-original-planned-cycle.tar.gz');
    const plannedDownload=await fetch(new URL(cyclePath(plannedCycle.key)+'/download',baseUrl),{redirect:'error'});
    assert.ok(plannedDownload.ok,'Read the original planned cycle archive: '+plannedDownload.status);
    await synced(plannedArchive,Buffer.from(await plannedDownload.arrayBuffer()),{replace:true});
    calendarFiles.push(await fileIdentity(plannedArchive));
    const receivedCalendarRoot=await privateDirectory(join(directory,'received-service-calendars'));
    await extract(plannedArchive,join(receivedCalendarRoot,plannedCycle.key));
    const receivedCalendars=await createAccountingStatementServiceSchedules({directory:receivedCalendarRoot,url,workspace:ALIAS,
      readInventory:()=>api('/api/service-planner'),
      async prepareCycle(){throw new Error('The imported calendar must reopen its received original cycle.');},
      async readCycle(key){return {...await inspectAccountingStatementCycle({directory:join(receivedCalendarRoot,key)}),key};}});
    const receivedCatalogue=await receivedCalendars.catalogue();
    await receivedCalendars.importBundle({bundle:calendarBundle,expectedRevision:receivedCatalogue.revision});
    const receivedCalendarPreparation=await receivedCalendars.resume({requestId:calendarRequestId});
    assert.equal(receivedCalendarPreparation.preparation.imported,true);
    assert.equal(receivedCalendarPreparation.cycle.key,plannedCycle.key);
    assert.equal(receivedCalendarPreparation.cycle.cycleId,plannedCycle.cycleId);
    assert.deepEqual(receivedCalendarPreparation.cycle.rows.map(row=>row.intent),compiledPlan.selections);
    const receivedCalendarPage=await receivedCalendars.calendar(calendarWindow);
    const receivedCurrentPeriod=receivedCalendarPage.items.find(row=>row.id===currentCalendarPeriod.id);
    assert.ok(receivedCurrentPeriod.currentStatements.some(row=>row.id===correctionId));
    const calendarReceiving={directory:receivedCalendarRoot,calendarId:savedCalendar.id,preparedCycleKey:plannedCycle.key,
      preparedCycleId:plannedCycle.cycleId,requestId:calendarRequestId,imported:true,
      sourceBundle:await fileIdentity(calendarBundlePath),originalCycleArchive:await fileIdentity(plannedArchive),
      nativeIssuedCycleKey:cycleKey,nativeIssuedCycleId:cycle.cycleId,currentStatementId:correctionId,
      currentPeriod:receivedCurrentPeriod};
    await output('service-calendar-received.json',calendarReceiving);

    const phoneContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
    contexts.push(phoneContext);
    const phone=await phoneContext.newPage();phone.on('pageerror',error=>pageErrors.push(error.message));
    await phone.goto(baseUrl,{waitUntil:'networkidle'});
    await phone.locator('[data-view="setup"]').click();await phone.locator('[data-setup-tab="statements"]').click();
    await phone.locator('[data-setup-open-statement="'+originalIds[1]+'"]').click();
    await phone.locator('#setup-statement-dialog[open]').waitFor();
    await screenshot('phone-withdrawn-statement.png',phone);await phone.locator('#setup-close-statement').click();
    await phone.locator('[data-view="cycles"]').click();
    await phone.locator('[data-cycle="'+cycleKey+'"]').click();
    await phone.locator('[data-review-saved="1"]').waitFor();await screenshot('phone-complete-close.png',phone);
    const phoneHandover=phone.locator('#customer-dossiers details[data-dossier-customer="'+customer.id+'"]');
    await phoneHandover.waitFor();await phoneHandover.locator('summary').first().click();
    assert.equal(await phoneHandover.locator('.dossier-rows tbody tr').count(),2);
    await screenshot('phone-customer-handover.png',phone);
    await phone.locator('[data-review-saved="1"]').click();await phone.locator('#review-dialog[open]').waitFor();
    await screenshot('phone-source-review.png',phone);await phone.locator('#close-review').click();
    const phonePlannerRead=phone.waitForResponse(response=>new URL(response.url()).pathname==='/api/service-planner');
    await phone.locator('[data-view="service-planner"]').click();assert.ok((await phonePlannerRead).ok());
    await phone.locator('[data-service-history="'+plannerRow.id+'"]').first().waitFor();
    await screenshot('phone-service-close-planner.png',phone);
    await phone.locator('[data-service-history="'+plannerRow.id+'"]').first().click();
    await phone.locator('#service-history-dialog[open]').waitFor();
    await screenshot('phone-planner-correction-history.png',phone);await phone.locator('#service-history-close').click();

    const phoneCalendar=await showCalendars(phone);
    assert.ok(phoneCalendar.items.some(row=>row.id===currentCalendarPeriod.id&&row.currentStatements.some(statement=>statement.id===correctionId)));
    await screenshot('phone-customer-service-calendar.png',phone);

    const partialHandover=await readOptional(join(directory,'customer-handover-partial.json'));
    const downloads=[...plannerFiles,...calendarFiles,issuedHandover.archive,finalHandover.archive,...(partialHandover?[partialHandover.archive]:[])];
    const setupArchive=join(downloadRoot,'customer-setup.tar.gz');
    const setupTar=spawnSync('tar',['-czf',setupArchive,'-C',cyclesRoot,'customer-operations'],{encoding:'utf8'});
    assert.equal(setupTar.status,0,setupTar.stderr||setupTar.error?.message||'Save the complete original customer operations.');
    downloads.push(await fileIdentity(setupArchive));
    async function download(route,name){
      const response=await fetch(new URL(route,baseUrl),{redirect:'error',signal:AbortSignal.timeout(120000)});
      assert.ok(response.ok,'Original workbench file: '+response.status+' '+route);
      const body=Buffer.from(await response.arrayBuffer()),file=join(downloadRoot,name);
      await synced(file,body,{replace:true});const identity=await fileIdentity(file);downloads.push(identity);return file;
    }
    const cycleArchive=await download(cyclePath(cycleKey)+'/download','complete-cycle.tar.gz');
    const reopenRoot=await privateDirectory(join(directory,'reopened-complete-cycle'));
    await extract(cycleArchive,reopenRoot);
    const customerPackets=[];
    for(let i=0;i<cycle.rows.length;i++){
      const archive=await download(cyclePath(cycleKey)+'/items/'+(i+1)+'/download','customer-'+(i+1)+'.tar.gz');
      const root=await privateDirectory(join(directory,'customer-'+(i+1)));
      await extract(archive,root);customerPackets.push(await verifyCustomer(root,cycle.rows[i]));
    }
    const customerIndex=cyclePath(cycleKey)+'/file/items/000001/delivery/index.html';
    const packet=await desktopContext.newPage();
    const indexResponse=await packet.goto(new URL(customerIndex,baseUrl).href);
    assert.equal(indexResponse.status(),200);
    assert.match(indexResponse.headers()['content-disposition'],/^inline/);
    await packet.locator('a[href="statement.html"]').first().click();
    assert.ok(packet.url().endsWith('/statement.html'),'The original packet opens its relative statement link.');
    await screenshot('customer-period-statement.png',packet);
    await packet.goto(new URL(customerIndex,baseUrl).href);
    const packageDownload=packet.waitForEvent('download');
    await packet.locator('a[href="statement.json"]').click();
    const browserFile=await packageDownload;assert.equal(browserFile.suggestedFilename(),'statement.json');
    await browserFile.saveAs(join(downloadRoot,'browser-statement.json'));
    assert.equal(sha(await readFile(join(downloadRoot,'browser-statement.json'))),
      cycle.rows[0].delivery.files.find(row=>row.name==='statement.json').sha256);
    const originalReviewFiles=cycle.rows.map(row=>row.reviewFile.sha256);
    await workbench.close();workbench=null;
    await statementClient.closeWorkspace();statementClient=null;
    await connect();
    const reopened=await runAccountingStatementCycle({directory:reopenRoot,execute:false,client:statementClient});
    assert.equal(reopened.complete,true);assert.deepEqual(reopened.rows.map(row=>row.statement.id),originalIds);
    assert.deepEqual(reopened.rows.map(row=>row.reviewFile.sha256),originalReviewFiles);
    assert.equal(reopened.rows[0].statement.status,'SUPERSEDED');
    assert.equal(reopened.rows[1].statement.status,'WITHDRAWN');
    for(const row of reopened.rows)await verifyCustomer(join(reopenRoot,'items',ordinal(row.index),'delivery'),row);
    const nativeStatements=await statementClient.allStatements({customerId:customer.id});
    assert.equal(nativeStatements.items.length,3);
    assert.deepEqual(new Set(nativeStatements.items.map(row=>row.id)),new Set([...originalIds,correctionId]));
    await output('reopened-complete-result.json',reopened);
    await startWorkbench();
    const savedHandoverAfterRestart=await api(finalHandover.manifestHref);
    assert.equal(savedHandoverAfterRestart.snapshotSha256,finalHandover.snapshotSha256);
    assert.deepEqual(savedHandoverAfterRestart.statements.map(row=>row.statement.status),['SUPERSEDED','WITHDRAWN']);
    const savedEarlierAfterRestart=await api(issuedHandover.manifestHref);
    assert.equal(savedEarlierAfterRestart.snapshotSha256,issuedHandover.snapshotSha256);

    const calendarAfterRestart=await api('/api/service-schedules/calendar',calendarWindow);
    const restartedCalendarPeriod=calendarAfterRestart.items.find(row=>row.id===currentCalendarPeriod.id);
    assert.ok(restartedCalendarPeriod.currentStatements.some(row=>row.id===correctionId));
    const recoveredCalendarAfterRestart=await api('/api/service-schedules/resume',{requestId:calendarRequestId});
    assert.equal(recoveredCalendarAfterRestart.cycle.key,plannedCycle.key);
    assert.equal(recoveredCalendarAfterRestart.cycle.cycleId,plannedCycle.cycleId);
    assert.deepEqual(recoveredCalendarAfterRestart.preparation.scheduledPlan,calendarRequest.scheduledPlan);

    await workbench.close();workbench=null;
    assert.deepEqual(pageErrors,[],'The actual desktop and phone application raised a browser error.');
    const images=[];
    for(const name of (await readdir(screenshots)).sort())images.push(await fileIdentity(join(screenshots,name)));
    const result={schema:SCHEMA,state:'COMPLETE',completedAt:new Date().toISOString(),
      operationId:operation.operationId,operationDirectory:directory,runtime:process.version,input:inputLabel,
      source,selection:binding,period:period.period,customerSetup:setupActions,
      originalAccounting:{runId:run.id,reportSha256:run.reportSha256,inputManifestSha256:run.inputManifestSha256},
      cycle:{key:cycleKey,id:cycle.cycleId,manifestSha256:cycle.manifestSha256,statementIds:originalIds,
        originalReviewSha256:originalReviewFiles,retained:cycle.counts.retained,delivered:cycle.counts.delivered},
      correction:{key:correctionKey,statementId:correctionId,originalStatus:reopened.rows[0].statement.status},
      withdrawal:{statementId:originalIds[1],status:reopened.rows[1].statement.status,reason:withdrawalReason},
      deliveryInterruption:pause,reopened:{partial:!!(await readOptional(join(directory,'reopened-partial-result.json'))),
        complete:true,directory:reopenRoot,statementIds:reopened.rows.map(row=>row.statement.id)},
      customerPackets,customerDossier:{complete:finalHandover.complete,partial:partialHandover,issued:issuedHandover,lifecycle:finalHandover,reopenedAfterWorkbenchRestart:true},
      servicePlanner:{complete:true,prepared:plannerPrepared,currentHistory:{inventorySha256:plannerLifecycle.inventorySha256,
        revision:plannerLifecycle.revision,passIdentitySha256:plannerCurrent.periodIdentitySha256,suggestion:plannerCurrent.suggestion,
        periodStatuses:plannerCurrent.history.map(row=>({id:row.id,status:row.status})),cumulativeStatuses:plannerCurrent.cumulativeStatements.map(row=>({id:row.id,status:row.status}))}},
      serviceCalendars:{complete:true,calendarId:savedCalendar.id,definitionSha256:savedCalendar.sha256,
        scheduledPlanSha256:calendarRequest.scheduledPlan.sha256,window:calendarWindow,
        originalPreparedCycle:{key:plannedCycle.key,id:plannedCycle.cycleId,requestId:calendarRequestId},
        nativeIssuedCycle:{key:cycleKey,id:cycle.cycleId,currentStatementId:correctionId},
        recovery:calendarRecovery,receiving:calendarReceiving,phone:true,reopenedAfterWorkbenchRestart:true,files:calendarFiles},
      downloads,screenshots:images,browserErrors:pageErrors,
      nativeRetainedStatements:nativeStatements.items.length,toolCalls:Object.fromEntries(calls)};
    return result;
    })();
  }catch(error){primaryError=error;}
  const closureFailures=[];
  try{await closeOwnedResources();}catch(error){closureFailures.push(error);}
  if(closureFailures.length){
    if(!primaryError)primaryError=closureFailures[0];
    else primaryError.cleanup=(primaryError.cleanup??[]).concat(closureFailures.flatMap(error=>error.cleanup??[problem(error)]));
  }
  if(!primaryError&&!reopenedComplete){
    try{
      lease.assertHeld();
      await synced(join(directory,'flow-result.json'),json(finalResult),{replace:Boolean(await readOptional(join(directory,'flow-result.json')))});
    }catch(error){primaryError=error;}
  }
  // An unclosed resource retains its original writer lease. The same owner can
  // retry only its retained handles through closeOriginalOwnership().
  if(!closureFailures.length)try{await closeOriginalOwnership();}catch(error){
    if(primaryError)primaryError.cleanup=(primaryError.cleanup??[]).concat({resource:'original operation lease',...problem(error)});
    else primaryError=error;
  }
  if(primaryError){
    primaryError.close=closeOriginalOwnership;
    await synced(join(directory,'receiving-error-'+randomUUID()+'.json'),json({schema:SCHEMA,at:new Date().toISOString(),error:problem(primaryError),
      cleanup:primaryError.cleanup??[]})).catch(recordError=>{primaryError.recordError=problem(recordError);});
    emit('SOURCE_OR_RUNTIME_ERROR',{error:problem(primaryError),cleanup:primaryError.cleanup??[]});throw primaryError;
  }
  if(reopenedComplete)emit('REOPENED_COMPLETE_RESULT',{cycleId:finalResult.cycle.id});
  else emit('COMPLETE',{result:join(directory,'flow-result.json'),customerPackets:finalResult.customerPackets.length,screenshots:finalResult.screenshots.length});
  return finalResult;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let browser;
  try{
    const {values}=parseArgs({strict:true,options:{directory:{type:'string'},
      'browser-module':{type:'string'},'browser-executable':{type:'string'}}});
    assert.ok(values.directory,'Use --directory /absolute/private/customer-closing-operation.');
    const selected=values['browser-module']??process.env.SCF_BROWSER_MODULE??'playwright';
    const imported=await import(isAbsolute(selected)?pathToFileURL(selected).href:selected);
    const chromium=imported.chromium??imported.default?.chromium;
    assert.ok(chromium,'Choose the existing Playwright module with its Chromium browser.');
    const executablePath=values['browser-executable']??process.env.SCF_BROWSER_EXECUTABLE;
    browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(executablePath?{executablePath}:{})});
    await receiveCustomerClosingWorkbench({directory:values.directory,browser,closeBrowser:true});
  }catch(error){process.stderr.write(json(problem(error)));process.exitCode=1;}
  finally{
    if(browser?.isConnected())try{await browser.close();}catch(error){process.stderr.write(json({code:'CUSTOMER_BROWSER_CLOSE_FAILED',error:problem(error)}));process.exitCode=1;}
  }
}
