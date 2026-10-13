#!/usr/bin/env node
// MIT. One complete customer receiving journey over an already completed Laboratory result.
import { spawn } from 'node:child_process';
import { realpath, mkdtemp, rename, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalJson, sha256, safeSourceName } from './model.mjs';
import { receiveLabResult, openReceivedLabResult } from './received-result.mjs';
import { normalizeLabCustomerReview } from './customer-review.mjs';
import { customerReviewHtml } from './customer-review-page.mjs';
import { absolute, privateDirectory, exists, writeBytes } from '../../sf88-operator-buyer-cli/node/store.mjs';
import { readSnapshot } from '../../sf88-operator-buyer-cli/resource-library/files.mjs';

const HERE=dirname(fileURLToPath(import.meta.url)),MAX_RESULT_BYTES=67108864;
const JSON_BYTES=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
const fail=(message,code='LAB_RESULT_RECEIVING')=>{throw Object.assign(new Error(message),{code});};
const need=(condition,message)=>{if(!condition)fail(message);};
const SOURCE_FILES=[
  "../../sf88-operator-buyer-cli/node/store.mjs",
  "../../sf88-operator-buyer-cli/resource-library/files.mjs",
  "../wqx-water-quality/jobs/archive.mjs",
  "application.mjs",
  "cli.mjs",
  "customer-review.mjs",
  "customer-review-receiving.mjs",
  "customer-review-page.mjs",
  "decisions.mjs",
  "local.mjs",
  "model.mjs",
  "profiles.mjs",
  "profiles/dts8.mjs",
  "profiles/equis.mjs",
  "received-result-page.mjs",
  "received-result-receiving.mjs",
  "received-result.mjs",
  "reconciliation-application.mjs",
  "reconciliation-editor.mjs",
  "reconciliation-profile.mjs",
  "reconciliation-report.mjs",
  "reconciliation-table.mjs",
  "reconciliation.mjs",
  "report-client.mjs",
  "report.mjs",
  "result.mjs",
  "table.mjs",
  "workbook.mjs",
  "zip.mjs"
];
async function directory(path,{create=true}={}){
  path=await privateDirectory(absolute(path),{create});
  need(await realpath(path)===path,'Use a private owned directory without symbolic-link ancestors.');
  return path;
}
async function immutable(path,bytes,{signal}={}){
  signal?.throwIfAborted();
  await directory(dirname(path));
  if(!await exists(path)){
    try{await writeBytes(path,bytes,{exclusive:true,signal});}
    catch(error){if(error.code!=='EEXIST')throw error;}
  }
  const actual=await readSnapshot(path,bytes.length);
  need(actual.length===bytes.length&&sha256(actual)===sha256(bytes),'An existing receiving file differs: '+path);
  return {bytes:actual.length,sha256:sha256(actual)};
}
async function parse(path){return JSON.parse((await readSnapshot(path,4194304)).toString('utf8'));}
async function sourceIdentity(){
  const result=[];
  for(const path of SOURCE_FILES){
    const bytes=await readSnapshot(resolve(HERE,path),2097152);
    result.push({path,bytes:bytes.length,sha256:sha256(bytes)});
  }
  return result;
}
async function runCli({node,root,name,argv,signal}){
  const output=join(root,'commands',name+'.json'),receipt=join(root,'commands',name+'.command.json');
  const command=[node,'--max-old-space-size=192',join(HERE,'cli.mjs'),...argv,'--out',output];
  await directory(dirname(output));
  if(await exists(output)){
    const value=await parse(output);
    need(value.status==='COMPLETE','A retained CLI output is incomplete: '+name);
    if(await exists(receipt)){
      const prior=await parse(receipt);
      need(same(prior.command,command)&&prior.output.sha256===sha256(await readSnapshot(output,4194304)),
        'A retained CLI command differs: '+name);
      return {value,receipt:prior};
    }
    // The original CLI publishes this file only after receiving has completed.
    const recovered={name,command,exitCode:null,retainedCompletedOutput:true,
      output:{path:'commands/'+name+'.json',bytes:(await readSnapshot(output,4194304)).length,
        sha256:sha256(await readSnapshot(output,4194304))}};
    await immutable(receipt,JSON_BYTES(recovered),{signal});
    return {value,receipt:recovered};
  }
  signal?.throwIfAborted();
  const child=spawn(node,command.slice(1),{cwd:root,stdio:['ignore','pipe','pipe'],env:process.env});
  let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),failure=null,killTimer;
  const stop=()=>{
    if(child.exitCode===null&&child.signalCode===null){
      child.kill('SIGTERM');
      killTimer??=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');},5000);
    }
  };
  const collect=which=>chunk=>{
    const previous=which==='stdout'?stdout:stderr;
    if(previous.length+chunk.length>1048576){failure??=new Error('The original CLI diagnostic exceeds its retained bound.');stop();return;}
    if(which==='stdout')stdout=Buffer.concat([stdout,chunk]);else stderr=Buffer.concat([stderr,chunk]);
  };
  const done=new Promise(resolve=>{
    child.once('error',error=>{failure??=error;});
    child.once('close',(code,terminationSignal)=>resolve({code,terminationSignal}));
  });
  child.stdout.on('data',collect('stdout'));child.stderr.on('data',collect('stderr'));
  signal?.addEventListener('abort',stop,{once:true});
  if(signal?.aborted)stop();
  let completed;
  try{completed=await done;}
  finally{
    signal?.removeEventListener('abort',stop);if(killTimer)clearTimeout(killTimer);
  }
  signal?.throwIfAborted();
  if(failure)throw failure;
  if(completed.code!==0)fail('The original CLI '+name+' ended '+completed.code+': '+stderr.toString('utf8'));
  const value=await parse(output);
  need(value.status==='COMPLETE','The original CLI did not produce a complete result: '+name);
  const outputBytes=await readSnapshot(output,4194304);
  const recorded={name,command,exitCode:completed.code,signal:completed.terminationSignal,pid:child.pid,
    stdout:stdout.toString('utf8'),stderr:stderr.toString('utf8'),
    output:{path:'commands/'+name+'.json',bytes:outputBytes.length,sha256:sha256(outputBytes)}};
  await immutable(receipt,JSON_BYTES(recorded),{signal});
  return {value,receipt:recorded};
}
async function transferredFiles(root,received,signal){
  const rows=[...received.receipt.files,{path:'receipt.json',
    bytes:(await readSnapshot(received.receiptPath,4194304)).length,
    sha256:sha256(await readSnapshot(received.receiptPath,4194304))}];
  await directory(root);
  for(const row of rows){
    signal?.throwIfAborted();safeSourceName(row.path);
    const bytes=await readSnapshot(join(received.directory,row.path),row.bytes);
    need(bytes.length===row.bytes&&sha256(bytes)===row.sha256,'An original received file changed before transfer: '+row.path);
    const parentParts=row.path.split('/').slice(0,-1);let parent=root;
    for(const part of parentParts){parent=join(parent,part);await directory(parent);}
    await immutable(join(root,row.path),bytes,{signal});
  }
  return rows;
}
async function inventory(root,paths,signal){
  const output=[];
  for(const path of [...new Set(paths)].sort()){
    signal?.throwIfAborted();safeSourceName(path);
    const bytes=await readSnapshot(join(root,path),536870912);
    output.push({path,bytes:bytes.length,sha256:sha256(bytes)});
  }
  return output;
}

async function browserReceiving({root,customer,bindingSha256,inspection,sourceKind,playwright,chromium,signal}){
  const destination=join(root,'browser');
  async function reopen(path){
    const receipt=await parse(join(path,'browser-complete.json'));
    need(receipt.status==='COMPLETE'&&receipt.bindingSha256===bindingSha256,'The browser handover belongs to another complete source.');
    need(same(await inventory(path,receipt.files.map(f=>f.path),signal),receipt.files),'A retained browser handover artifact changed.');
    const document=JSON.parse((await readSnapshot(join(path,'Laboratory_Customer_Findings.json'),67108864)).toString('utf8'));
    need(same(document,normalizeLabCustomerReview(inspection,document)),'The retained complete findings no longer bind to the original result.');
    return receipt;
  }
  if(await exists(destination))return reopen(destination);
  // Recover an already completed, atomically staged browser handover after interruption.
  // Incomplete attempt directories remain explicit partial evidence, never accepted output.
  for(const name of (await readdir(root)).filter(n=>n.startsWith('.browser-pending-')).sort()){
    const stage=join(root,name);
    if(!await exists(join(stage,'browser-complete.json')))continue;
    await directory(stage,{create:false});
    const receipt=await reopen(stage);
    try{await rename(stage,destination);}catch(error){
      if(!await exists(destination))throw error;
      const other=await reopen(destination);need(same(receipt,other),'Concurrent complete browser outputs differ.');
    }
    return reopen(destination);
  }
  const stage=await mkdtemp(join(root,'.browser-pending-'));
  await directory(stage,{create:false});
  await immutable(join(stage,'operation-binding.json'),JSON_BYTES({bindingSha256}),{signal});
  const browserModule=await import(pathToFileURL(playwright).href),engine=browserModule.chromium??browserModule.default?.chromium;
  need(engine&&typeof engine.launch==='function','Select the original installed Playwright Chromium engine.');
  let browser=null,context=null,closing=null;
  const stop=()=>{if(browser&&!closing)closing=browser.close().catch(()=>{});};
  signal?.addEventListener('abort',stop,{once:true});
  const errors=[],requests=[];let observedRows=0,observedFields=0,selectedTarget=null;
  try{
    signal?.throwIfAborted();
    browser=await engine.launch({executablePath:chromium,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    signal?.throwIfAborted();
    context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    signal?.throwIfAborted();
    const page=await context.newPage();page.setDefaultTimeout(30000);
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('request',request=>{if(/^https?:/i.test(request.url()))requests.push(request.url());});
    await page.goto(pathToFileURL(join(customer,'inspect.html')).href);
    await page.locator('#status').filter({hasText:'Complete result loaded:'}).waitFor();
    for(const family of inspection.families)for(const table of family.tables){
      await page.locator('#table').selectOption(table.tableId);
      for(let index=0;index<table.rows.length;index++){
        signal?.throwIfAborted();
        if(index&&index%50===0)await page.locator('#next').click();
        await page.locator('#rows button').nth(index%50).click();
        const actual=await page.locator('#detail table tbody').evaluate(body=>Array.from(body.rows,row=>({
          key:row.cells[0].querySelector('strong').textContent,
          original:row.cells[1].querySelector('pre').textContent,
          reviewed:row.cells[2].querySelector('pre').textContent
        })));
        const row=table.rows[index],expected=table.keys.map((key,i)=>({key,
          original:row.original.fields[i]===''?'(empty string)':row.original.fields[i],
          reviewed:row.reviewed.fields[i]===''?'(empty string)':row.reviewed.fields[i]}));
        need(same(actual,expected),'The browser does not expose every exact original and reviewed field at '+family.edition+'/'+table.id+'/'+row.original.recordId);
        observedRows++;observedFields+=actual.length;
        if(!selectedTarget&&table.keys.length){
          let fieldIndex=row.original.fields.findIndex((value,i)=>value!==row.reviewed.fields[i]);
          if(fieldIndex<0)fieldIndex=0;
          selectedTarget={family,table,row,index,field:table.keys[fieldIndex]};
        }
      }
    }
    need(selectedTarget,'The retained result has no selectable physical field for customer receiving.');
    const t=selectedTarget;
    await page.locator('#table').selectOption(t.table.tableId);
    for(let i=0;i<Math.floor(t.index/50);i++)await page.locator('#next').click();
    await page.locator('#rows button').nth(t.index%50).click();
    await page.locator('#finding-field').selectOption(t.field);
    const note='Receiving exercise: retain this exact original and reviewed field while recording a separate customer finding.';
    await page.locator('#finding-note').fill(note);
    // Editing a different target must not discard the pending note.
    await page.locator('#finding-field').selectOption('');
    await page.locator('#finding-field').selectOption(t.field);
    need(await page.locator('#finding-note').inputValue()===note,'A pending customer note was lost during target navigation.');
    await page.locator('#finding-form button[type=submit]').click();
    await page.locator('#reviewer').fill('Laboratory customer receiving operator');
    await page.locator('#summary').fill('Complete offline receiving of the declared input: '+sourceKind+'. This exercise verifies customer findings transfer; it does not assert a supplier acceptance or start a Laboratory job.');
    await page.locator('#disposition').selectOption('correction_requested');
    async function download(selector,name){
      const [item]=await Promise.all([page.waitForEvent('download'),page.locator(selector).click()]);
      const path=await item.path();need(path,'The browser did not retain the complete download.');
      const raw=await readSnapshot(path,536870912);await immutable(join(stage,name),raw,{signal});return raw;
    }
    const json=await download('#download-json','Laboratory_Customer_Findings.json');
    const findings=normalizeLabCustomerReview(inspection,JSON.parse(json.toString('utf8')));
    need(findings.findings.length===1&&findings.findings[0].target.field===t.field&&findings.findings[0].note===note,'The complete customer download lost its exact target or note.');
    const html=await download('#download-html','Laboratory_Customer_Findings.html');
    need(html.equals(Buffer.from(customerReviewHtml(findings))),'The browser readable handover differs from its complete findings document.');
    await page.locator('#import').setInputFiles(join(stage,'Laboratory_Customer_Findings.json'));
    await page.locator('#status').filter({hasText:'Reopened all 1 findings'}).waitFor();
    need(await page.locator('#reviewer').inputValue()===findings.reviewer&&await page.locator('#summary').inputValue()===findings.summary,'The editable customer handover did not reopen completely.');
    await page.locator('#row-filter').selectOption('findings');
    need(await page.locator('#rows button').count()===1,'The customer findings row filter changed its physical selection.');
    await page.locator('#rows button').first().click();
    await page.locator('#finding-field').selectOption(t.field);
    need(await page.locator('#finding-note').inputValue()===note,'The reopened finding note differs.');
    await page.evaluate(()=>window.scrollTo(0,0));
    await immutable(join(stage,'desktop.png'),await page.screenshot({fullPage:false}),{signal});
    await page.setViewportSize({width:390,height:844});
    await immutable(join(stage,'mobile.png'),await page.screenshot({fullPage:false}),{signal});
    await page.goto(pathToFileURL(join(customer,'index.html')).href);
    const complete=await download('a[href="original-result.zip"]','downloaded-original-result.zip');
    need(sha256(complete)===inspection.identity.archiveSha256,'The customer entry did not download the complete unchanged original result.');
    need(errors.length===0,'The actual offline operator emitted a browser error: '+errors.join('; '));
    need(requests.length===0,'The offline operator attempted an external network request.');
  }finally{
    try{if(context)await context.close();}
    finally{
      try{if(browser){if(closing)await closing;else await browser.close();}}
      finally{signal?.removeEventListener('abort',stop);}
    }
  }
  signal?.throwIfAborted();
  const paths=['operation-binding.json','Laboratory_Customer_Findings.json','Laboratory_Customer_Findings.html','desktop.png','mobile.png','downloaded-original-result.zip'];
  const receipt={schema:'starforge.lab-edd-offline-browser-receiving.v1',status:'COMPLETE',bindingSha256,
    observedRows,observedFields,allPhysicalRowsOperated:true,pendingNoteRetained:true,completeFindingsDownload:true,
    findingsReopened:true,completeOriginalDownloaded:true,externalRequests:requests,pageErrors:errors,
    files:await inventory(stage,paths,signal)};
  await immutable(join(stage,'browser-complete.json'),JSON_BYTES(receipt),{signal});
  try{await rename(stage,destination);}catch(error){
    if(!await exists(destination))throw error;
    const other=await reopen(destination);need(same(receipt,other),'Concurrent complete browser outputs differ.');
  }
  return reopen(destination);
}

/** One complete UI -> editable findings -> original CLI -> independent cold handover. */
export async function receiveLabOfflineCustomer({
  file,directory:target,expectedResultSha256,sourceKind,playwright,chromium,node=process.execPath,
  operationId='LAB-RESULT-CUSTOMER-RECEIVING-9F77-20261012',signal,
}={}){
  need(typeof expectedResultSha256==='string'&&/^[a-f0-9]{64}$/.test(expectedResultSha256),'Select the complete retained result SHA256.');
  need(typeof sourceKind==='string'&&sourceKind.trim()===sourceKind&&sourceKind.length>0&&sourceKind.length<=200,'Describe the actual retained input source.');
  need(typeof operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(operationId),'Keep the original stable customer operation.');
  const root=await directory(absolute(target)),input=absolute(file),executable=await realpath(absolute(node));
  const browserPath=await realpath(absolute(chromium)),playwrightPath=await realpath(absolute(playwright));
  signal?.throwIfAborted();
  const raw=await readSnapshot(input,MAX_RESULT_BYTES);need(sha256(raw)===expectedResultSha256,'The complete selected input changed.');
  const browserBytes=await readSnapshot(browserPath,536870912),playwrightBytes=await readSnapshot(playwrightPath,2097152);
  const binding={schema:'starforge.lab-edd-offline-customer-receiving-binding.v1',operationId,sourceKind,
    input:{bytes:raw.length,sha256:expectedResultSha256},sources:await sourceIdentity(),node:executable,
    browser:{path:browserPath,bytes:browserBytes.length,sha256:sha256(browserBytes)},
    playwright:{path:playwrightPath,bytes:playwrightBytes.length,sha256:sha256(playwrightBytes)}};
  const bindingBytes=JSON_BYTES(binding),bindingSha256=sha256(bindingBytes),expected={archiveSha256:expectedResultSha256};
  await immutable(join(root,'operation-binding.json'),bindingBytes,{signal});
  const inputFile=join(root,'input','complete-result.zip');await immutable(inputFile,raw,{signal});
  const customer=join(root,'original-customer'),reviewed=join(root,'findings-customer'),cold=join(root,'independent-findings-customer');
  if(await exists(join(root,'native-receiving.json'))){
    const completed=await parse(join(root,'native-receiving.json'));need(completed.status==='COMPLETE'&&completed.bindingSha256===bindingSha256,'The completed course belongs to another input/source selection.');
    const original=await openReceivedLabResult({directory:customer,expected,signal});
    const final=await openReceivedLabResult({directory:reviewed,expected,signal}),independent=await openReceivedLabResult({directory:cold,expected,signal});
    need(same(original.receipt.identity,final.receipt.identity)&&same(final.receipt,independent.receipt),'The complete retained receiving folders disagree.');
    need(same(await inventory(root,completed.files.map(f=>f.path),signal),completed.files),'A completed receiving output changed.');
    return {...completed,reused:true,directory:root};
  }
  const original=await receiveLabResult({file:inputFile,directory:customer,expected,signal});
  const inspection=JSON.parse((await readSnapshot(join(customer,'inspection.json'),536870912)).toString('utf8'));
  const browser=await browserReceiving({root,customer,bindingSha256,inspection,sourceKind,playwright:playwrightPath,chromium:browserPath,signal});
  const findingsFile=join(root,'browser','Laboratory_Customer_Findings.json');
  const first=await runCli({node:executable,root,name:'01-receive-findings',signal,
    argv:['receive-findings','--directory',customer,'--file',findingsFile,'--output-directory',reviewed,'--expected-result-sha256',expectedResultSha256]});
  const received=await openReceivedLabResult({directory:reviewed,expected,signal});
  need(same(first.value.identity,original.receipt.identity)&&same(received.receipt.identity,original.receipt.identity),'The customer handover changed the scientific result identity.');
  const copied=await transferredFiles(cold,received,signal);
  const coldCommand=await runCli({node:executable,root,name:'02-cold-reopen-findings',signal,
    argv:['reopen-result','--directory',cold,'--expected-result-sha256',expectedResultSha256]});
  const independent=await openReceivedLabResult({directory:cold,expected,signal});
  need(coldCommand.value.readOnly===true&&same(received.receipt,independent.receipt),'Independent full receiving did not reopen the same complete customer handover.');
  const repeated=await runCli({node:executable,root,name:'03-receive-findings-replay',signal,
    argv:['receive-findings','--directory',customer,'--file',findingsFile,'--output-directory',reviewed,'--expected-result-sha256',expectedResultSha256]});
  need(repeated.value.reused===true&&repeated.value.writtenFiles===0,'The same customer handover did not reuse its complete immutable output.');
  const commands=[first.receipt,coldCommand.receipt,repeated.receipt];
  const paths=['operation-binding.json','input/complete-result.zip',
    ...original.receipt.files.map(f=>'original-customer/'+f.path),'original-customer/receipt.json',
    ...copied.flatMap(f=>['findings-customer/'+f.path,'independent-findings-customer/'+f.path]),
    ...browser.files.map(f=>'browser/'+f.path),'browser/browser-complete.json',
    ...commands.flatMap(c=>['commands/'+c.name+'.json','commands/'+c.name+'.command.json'])];
  const files=await inventory(root,paths,signal);
  const result={schema:'starforge.lab-edd-offline-customer-receiving.v1',status:'COMPLETE',operationId,sourceKind,bindingSha256,
    identity:received.receipt.identity,customerReview:received.receipt.customerReview,allScientificBytesUnchanged:true,
    providerCalls:0,laboratoryWorkerStarted:false,customerAcceptanceClaimed:false,browser,commands,
    completeCustomerCopy:true,readOnlyColdReopen:true,sameFindingsReplay:true,files,
    retainedFileBytes:files.reduce((sum,f)=>sum+f.bytes,0)};
  await immutable(join(root,'native-receiving.json'),JSON_BYTES(result),{signal});
  return {...result,directory:root};
}
function args(argv){
  if(argv.includes('--help'))return {help:true};
  const value={},allowed=new Set(['file','directory','expected-result-sha256','source-kind','playwright','chromium','node','operation-id']);
  for(let i=0;i<argv.length;i+=2){
    const key=argv[i]?.replace(/^--/,'');
    need(argv[i]?.startsWith('--')&&allowed.has(key)&&value[key]===undefined&&argv[i+1]!==undefined&&!argv[i+1].startsWith('--'),'Use each named option once with an explicit value.');
    value[key]=argv[i+1];
  }
  return value;
}
export async function main(argv=process.argv.slice(2)){
  const a=args(argv);
  if(a.help){process.stdout.write('node customer-review-receiving.mjs --file COMPLETE_RESULT --directory PRIVATE_RECEIVING --expected-result-sha256 SHA --source-kind DESCRIPTION --playwright INSTALLED_MODULE --chromium ORIGINAL_EXECUTABLE [--node NODE] [--operation-id ID]\n');return;}
  const controller=new AbortController(),stop=()=>controller.abort(new Error('Offline customer receiving cancelled.'));
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{
    const result=await receiveLabOfflineCustomer({file:a.file,directory:a.directory,expectedResultSha256:a['expected-result-sha256'],
      sourceKind:a['source-kind'],playwright:a.playwright,chromium:a.chromium,...(a.node?{node:a.node}:{}),
      ...(a['operation-id']?{operationId:a['operation-id']}:{}),signal:controller.signal});
    process.stdout.write(JSON.stringify({status:result.status,directory:result.directory,receipt:join(result.directory,'native-receiving.json'),
      identity:result.identity,files:result.files.length,retainedFileBytes:result.retainedFileBytes,reused:result.reused??false},null,2)+'\n');
    return result;
  }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
  process.stderr.write(JSON.stringify({error:error.code??'LAB_OFFLINE_CUSTOMER_RECEIVING',message:error.message})+'\n');process.exitCode=1;
});
