// MIT. Receive the original completed five-invoice merchant through a whole handover.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { exportMerchant, inspectMerchantArchive, restoreMerchant, startMerchantArchiveServer, databaseIdentity } from './portable.mjs';
import { operationLease } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';

async function checkArchiveAuthority(archive) {
  const { request } = await import('node:http');
  const address = new URL(archive.url);
  async function read(method, path, authority) {
    return new Promise((accept, reject) => {
      const outgoing = request(new URL(path, address), { method, headers: { Host: authority } }, response => {
        const parts = [];
        response.on('data', bytes => parts.push(bytes));
        response.once('error', reject);
        response.once('end', () => accept({ status: response.statusCode, headers: response.headers, body: Buffer.concat(parts) }));
      });
      outgoing.once('error', reject);
      outgoing.setTimeout(5000, () => outgoing.destroy(new Error('ARCHIVE_AUTHORITY_CHECK_TIMEOUT')));
      outgoing.end();
    });
  }
  const valid = await read('HEAD', '/MANIFEST.json', address.host);
  if (valid.status !== 200 || valid.body.length !== 0 || !valid.headers['x-content-sha256'] ||
    valid.headers['cross-origin-resource-policy'] !== 'same-origin')
    throw new Error('ARCHIVE_LOCAL_AUTHORITY_CHECK_FAILED');
  const foreign = await read('GET', '/workspace/merchant.sqlite3', 'merchant-review.invalid:' + address.port);
  let error = null;
  try { error = JSON.parse(foreign.body.toString('utf8')).error; } catch {}
  if (foreign.status !== 421 || error !== 'MERCHANT_ARCHIVE_AUTHORITY_NOT_ALLOWED' ||
    foreign.headers['x-content-sha256'] !== undefined ||
    foreign.headers['cross-origin-resource-policy'] !== 'same-origin')
    throw new Error('ARCHIVE_FOREIGN_AUTHORITY_WAS_ACCEPTED');
  return { validHost: address.host, validStatus: valid.status, foreignStatus: foreign.status,
    refusedPath: 'workspace/merchant.sqlite3', foreignResponseBytes: foreign.body.length,
    crossOriginResourcePolicy: valid.headers['cross-origin-resource-policy'] };
}

const execute=promisify(execFile),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const {values}=parseArgs({options:{case:{type:'string'},directory:{type:'string'},'original-root':{type:'string',default:'/dev/x402api-merchant-7de2-20261012'},
  chromium:{type:'string'},'playwright-module':{type:'string'}}});
for(const name of ['case','directory','chromium','playwright-module'])assert.ok(values[name],name+' is required');
const original=resolve(values.case),root=resolve(values.directory),workspace=join(original,'receiving/workspace');
const originalConfig=join(original,'receiving/customer/merchant.configuration.json');
await mkdir(root,{recursive:true,mode:0o700});await mkdir(join(root,'qa'),{recursive:true,mode:0o700});await mkdir(join(root,'downloads'),{recursive:true,mode:0o700});
const events=[];
async function record(phase,details={}){const event={phase,at:new Date().toISOString(),...details};events.push(event);await writeFile(join(root,'progress.json'),JSON.stringify(events,null,2)+'\n',{mode:0o600});process.stdout.write(JSON.stringify(event)+'\n');}
function directRows(path,relocations=[]) {
  const database=new DatabaseSync(path,{readOnly:true});
  try {
    const tables=database.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all();
    const output={};
    for(const {name}of tables){
      const rows=database.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'" ORDER BY rowid').all();
      output[name]=rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,raw])=>{
        let value=raw;
        if((name==='merchant_orders'&&key==='data_json')||(name==='merchant_fulfillments'&&key==='result_file_json')){
          if(value!==null){
            const parsed=JSON.parse(value),selected=name==='merchant_orders'?parsed.result:parsed;
            if(selected?.path){const relocation=relocations.find(item=>item.to===selected.path);if(relocation)selected.path=relocation.from;}
            value=JSON.stringify(parsed);
          }
        }
        if(value instanceof Uint8Array)value={base64:Buffer.from(value).toString('base64')};
        return[key,value];
      })));
    }
    return output;
  } finally{database.close();}
}
const originalRows=directRows(join(workspace,'merchant.sqlite3'));
assert.equal(originalRows.merchant_orders.length,5);assert.ok(originalRows.merchant_orders.every(row=>row.state==='COMPLETE'));
assert.equal(originalRows.merchant_fulfillments.length,5);assert.ok(originalRows.merchant_fulfillments.every(row=>row.state==='COMPLETE'));
const originalDatabaseBytes=await readFile(join(workspace,'merchant.sqlite3'));
const originalIdentityDatabase=new DatabaseSync(join(workspace,'merchant.sqlite3'),{readOnly:true});
const identity=databaseIdentity(originalIdentityDatabase);originalIdentityDatabase.close();
await record('original_case_received',{storeId:identity.storeId,counts:identity.counts,originalDatabaseSha256:hash(originalDatabaseBytes)});
const selection={directory:workspace,configPath:originalConfig,output:join(root,'handover'),
  originalRoot:resolve(values['original-root']),retainedRoot:original};
const lease=await operationLease(join(workspace,'merchant-owner.lock'));
try{await assert.rejects(exportMerchant(selection),error=>error.code==='RUNTIME_WORKSPACE_OPERATION_RUNNING');}
finally{await lease.close();}
const exported=await exportMerchant(selection);
assert.equal(exported.invoices,5);assert.equal(exported.results,5);
const replay=await exportMerchant(selection);assert.equal(replay.alreadyExported,true);assert.equal(replay.manifestSha256,exported.manifestSha256);
assert.deepEqual(directRows(join(workspace,'merchant.sqlite3')),originalRows);
assert.equal(hash(await readFile(join(workspace,'merchant.sqlite3'))),hash(originalDatabaseBytes));
const inspected=await inspectMerchantArchive({bundle:selection.output,expectedSha256:exported.manifestSha256});
assert.equal(inspected.summary.logicalSha256,identity.logicalSha256);
const cli=await execute(process.execPath,[join(fileURLToPath(new URL('.',import.meta.url)),'server.mjs'),'inspect',
  '--bundle',selection.output,'--expected-sha256',exported.manifestSha256],{maxBuffer:1024*1024});
assert.equal(JSON.parse(cli.stdout.trim()).manifestSha256,exported.manifestSha256);
await record('whole_export_received',{...exported,activeOwnerRejected:true,originalRowsAndDatabaseUnchanged:true,repeatIdentical:true,cliInspect:true});
const {chromium}=await import(pathToFileURL(resolve(values['playwright-module'])).href);
const browser=await chromium.launch({executablePath:resolve(values.chromium),headless:true});
const errors=[],external=[];
let archiveHost,merchantHost,archiveAuthority;
try {
  archiveHost=await startMerchantArchiveServer({bundle:selection.output,port:0,expectedSha256:exported.manifestSha256});
  archiveAuthority=await checkArchiveAuthority(archiveHost);
  const browserResults=[];
  for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['phone',{width:390,height:844}]]){
    const context=await browser.newContext({viewport,acceptDownloads:true});
    const page=await context.newPage();page.on('pageerror',error=>errors.push({name,error:error.message}));
    await context.route('**/*',async route=>{
      const url=route.request().url();if(url.startsWith('http:')||url.startsWith('https:')){
        if(!url.startsWith(archiveHost.url+'/')){external.push(url);await route.abort();return;}
      }
      await route.continue();
    });
    await page.goto(archiveHost.url,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.querySelectorAll('.invoice').length===5);
    assert.equal(await page.locator('#completed-count').textContent(),'5');
    const downloads=[];
    for(const mapping of inspected.manifest.resultMappings){
      const article=page.locator('.invoice[data-order-id="'+mapping.orderId+'"]');
      const [download]=await Promise.all([page.waitForEvent('download'),article.getByRole('link',{name:'Download delivery'}).click()]);
      const destination=join(root,'downloads',name+'-'+mapping.orderId+'-'+download.suggestedFilename());
      await download.saveAs(destination);const raw=await readFile(destination);
      assert.equal(raw.length,mapping.bytes);assert.equal(hash(raw),mapping.sha256);
      downloads.push({orderId:mapping.orderId,bytes:raw.length,sha256:hash(raw)});
    }
    await page.locator('.invoice').first().getByRole('button',{name:'View details'}).click();
    assert.equal(await page.locator('#detail').isVisible(),true);
    assert.ok(await page.locator('.history li').count()>0);assert.ok(await page.locator('.exchange').count()>0);
    await page.locator('.history details summary').first().click();
    assert.equal(await page.locator('.history details[open] pre').first().isVisible(),true);
    const responseLink=page.locator('.exchange a').first(),responseHref=await responseLink.getAttribute('href');
    const responsePath=responseHref.split('/').map(decodeURIComponent).join('/');
    const responseIdentity=inspected.manifest.files.find(file=>file.path===responsePath);
    assert.ok(responseIdentity,'The original provider response is inventoried');
    const [originalResponse]=await Promise.all([page.waitForEvent('download'),responseLink.click()]);
    const originalResponsePath=join(root,'downloads',name+'-original-provider-response.bin');
    await originalResponse.saveAs(originalResponsePath);const responseBytes=await readFile(originalResponsePath);
    assert.equal(responseBytes.length,responseIdentity.bytes);assert.equal(hash(responseBytes),responseIdentity.sha256);
    await page.screenshot({path:join(root,'qa',name+'-offline-detail.png'),fullPage:true});
    const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
    assert.ok(width.scroll<=width.client,name+' overflows');
    await page.getByRole('button',{name:'Close details'}).click();
    await page.locator('#search').fill(originalRows.merchant_orders[0].reference);
    assert.ok(await page.locator('.invoice').count()>=1);
    browserResults.push({name,viewport,downloads,layout:width,historyOpened:true,
      originalResponseDownloaded:{path:responsePath,bytes:responseBytes.length,sha256:hash(responseBytes)},filterWorked:true});
    await context.close();
  }
  await archiveHost.close();archiveHost=null;
  const fileContext=await browser.newContext({viewport:{width:390,height:844}});
  const filePage=await fileContext.newPage();filePage.on('pageerror',error=>errors.push({name:'local-file',error:error.message}));
  await fileContext.route('**/*',async route=>{
    const url=route.request().url();if(/^https?:/.test(url)){external.push(url);await route.abort();return;}await route.continue();
  });
  await filePage.goto(pathToFileURL(join(selection.output,'index.html')).href,{waitUntil:'load'});
  await filePage.waitForFunction(()=>document.querySelectorAll('.invoice').length===5);
  await fileContext.close();
  await record('offline_operator_received',{browserResults,localFileOpened:true,errors,externalRequests:external});
  const restored=await restoreMerchant({bundle:selection.output,directory:join(root,'restored'),expectedSha256:exported.manifestSha256});
  assert.equal(restored.relocations.length,5);
  assert.deepEqual(directRows(join(restored.workspace,'merchant.sqlite3'),restored.relocations),originalRows);
  const repeated=await restoreMerchant({bundle:selection.output,directory:restored.directory,expectedSha256:exported.manifestSha256});
  assert.equal(repeated.alreadyRestored,true);
  const {loadMerchantConfiguration,startMerchantServer}=await import(pathToFileURL(restored.server).href);
  const {openMerchantWorkspace}=await import(pathToFileURL(join(restored.directory,'source/products/x402api-merchant-workspace/workspace.mjs')).href);
  const config=JSON.parse(await readFile(restored.configPath,'utf8')),env={...process.env};
  env[config.tenantCredentialEnv]='retained-case-receiving-credential';
  env[config.operatorTokenEnv]=randomBytes(32).toString('hex');
  for(const name of Object.values(config.webhook.secretEnvironmentByVersion))env[name]=randomBytes(32).toString('hex');
  const selected=await loadMerchantConfiguration(restored.configPath,{env});
  await selected.fulfillment.doctor({binding:selected.config.fulfillmentBinding});
  const providerInvocations=[];
  const provider=new Proxy({}, {get:(_,name)=>async(...args)=>{providerInvocations.push({method:String(name),argumentCount:args.length});throw new Error('Unexpected provider invocation while reopening original completed invoices');}});
  const reopened=await openMerchantWorkspace({...selected,directory:restored.workspace,provider});
  merchantHost=await startMerchantServer({workspace:reopened,operatorToken:selected.operatorToken,port:0,intervalMs:10000});
  const authorization={authorization:'Bearer '+selected.operatorToken};
  const stateResponse=await fetch(merchantHost.url+'/api/state',{headers:authorization});
  assert.equal(stateResponse.status,200);const state=await stateResponse.json();
  assert.equal(state.orders.length,5);assert.ok(state.orders.every(order=>order.state==='COMPLETE'));
  const receivedDownloads=[];
  for(const mapping of inspected.manifest.resultMappings){
    const response=await fetch(merchantHost.url+'/api/orders/'+mapping.orderId+'/result',{headers:authorization});
    assert.equal(response.status,200);const raw=Buffer.from(await response.arrayBuffer());
    assert.equal(raw.length,mapping.bytes);assert.equal(hash(raw),mapping.sha256);
    receivedDownloads.push({orderId:mapping.orderId,paymentId:mapping.paymentId,bytes:raw.length,sha256:hash(raw)});
  }
  const liveContext=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
  const live=await liveContext.newPage();live.on('pageerror',error=>errors.push({name:'restored-workspace',error:error.message}));
  await liveContext.route('**/*',async route=>{
    const url=route.request().url();if(/^https?:/.test(url)&&!url.startsWith(merchantHost.url+'/')){
      external.push(url);await route.abort();return;}await route.continue();
  });
  await live.goto(merchantHost.url,{waitUntil:'networkidle'});
  await live.locator('#operator-token').fill(selected.operatorToken);
  await live.locator('#connect-form').getByRole('button',{name:'Connect'}).click();
  await live.waitForFunction(()=>document.querySelector('#count-complete')?.textContent==='5');
  assert.equal(await live.locator('#order-rows tr').count(),5);
  await live.screenshot({path:join(root,'qa/restored-phone-workspace.png'),fullPage:true});
  const receivedWidth=await live.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  assert.ok(receivedWidth.scroll<=receivedWidth.client,'Restored workspace overflows');
  await liveContext.close();await merchantHost.runTick();await merchantHost.close();merchantHost=null;
  assert.equal(providerInvocations.length,0);assert.equal(errors.length,0);assert.equal(external.length,0);
  const continuedRows=directRows(join(restored.workspace,'merchant.sqlite3'),restored.relocations);
  for(const table of Object.keys(originalRows)){
    if(table==='merchant_runtimes'){assert.equal(continuedRows[table].length,originalRows[table].length+1);for(const originalRuntime of originalRows[table])assert.ok(continuedRows[table].some(row=>JSON.stringify(row)===JSON.stringify(originalRuntime)));}
    else assert.deepEqual(continuedRows[table],originalRows[table]);
  }
  assert.equal((await inspectMerchantArchive({bundle:selection.output,expectedSha256:exported.manifestSha256})).summary.logicalSha256,identity.logicalSha256);
  await record('restored_original_merchant_received',{storeId:identity.storeId,restoration:restored,receivedDownloads,
    receivedPhone:receivedWidth,providerInvocations,completeOriginalBusinessRowsPreserved:true,
    originalRuntimeRowsPreserved:true,oneReceivingRuntimeClosed:true,sourceArchiveUnchanged:true});
  const complete={schema:'stellar-forge.x402api-merchant-portable-receiving.v1',operation:'X402API-PORTABLE-MERCHANT-48DB-20261012',
    completedAt:new Date().toISOString(),runtime:{node:process.version,platform:process.platform},originalCase:{directory:original,...identity},
    export:exported,restoration:restored,archiveAuthority,events,providerInvocations,errors,externalRequests:external,nativeResult:join(root,'portable-native-result.json')};
  await writeFile(complete.nativeResult,JSON.stringify(complete,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify({phase:'portable_receiving_complete',path:complete.nativeResult,bytes:Buffer.byteLength(JSON.stringify(complete,null,2)+'\n')})+'\n');
} finally {
  if(archiveHost)await archiveHost.close();
  if(merchantHost)await merchantHost.close();
  await browser.close();
}
