// SPDX-License-Identifier: MIT
// One browser continuation of the original merchant accounting native operation.
// The caller owns the existing server, accounting workspace and final source return.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,access,chmod} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const exact=value=>({bytes:Buffer.byteLength(value),sha256:sha(value)});
const cents=value=>{const match=String(value).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);assert(match,'Exact USD decimal amount');return (match[1]? -1n:1n)*(BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0')));};
const CLOSE_FILES=['reconciliation.html','transactions.csv','posting-parts.csv','editable-reconciliation.json','reconciliation.json','manifest.json','account.tar'];
const MAP_FIELDS=['postedDate','amount','debit','credit','providerId','payee','memo','reference','checkNumber','type','balance','currency','status','correctsProviderId','correctionAction','valueDate','accountId','bankId','branchId','accountType'];
const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const tag=(name,value)=>'<'+name+'>'+xml(value)+'</'+name+'>';
const nativeAccount='<BANKACCTFROM><BANKID>NATIVE-RECEIVING-BANK</BANKID><ACCTID>operating-001</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>';
function nativeRow(type,date,amount,id,payee,reference,correction=null){
 return '<STMTTRN>'+tag('TRNTYPE',type)+tag('DTPOSTED',date)+tag('TRNAMT',amount)+tag('FITID',id)+tag('NAME',payee)+tag('REFNUM',reference)+
  (correction?tag('CORRECTFITID',correction.id)+tag('CORRECTACTION',correction.action):'')+'</STMTTRN>';
}
function novemberSource({corrected=false}={}){
 const rows=corrected?
  [nativeRow('FEE','20261103','-3.00','BROWSER-FEE3','Corrected November bank fee','BROWSER-FEE3',{id:'BROWSER-FEE2',action:'REPLACE'})]:
  [nativeRow('CREDIT','20261102','47.00','BROWSER-NET50','November customer deposit','BROWSER-NET50'),
   nativeRow('CREDIT','20261102','10.00','BROWSER-INCOME10','November other income','BROWSER-INCOME10'),
   nativeRow('FEE','20261103','-2.00','BROWSER-FEE2','November bank fee','BROWSER-FEE2'),
   nativeRow('OTHER','20261103','0.00','BROWSER-ZERO','Zero amount source record','BROWSER-ZERO')];
 const closing=corrected?'1349.00':'1350.00',edition=corrected?'corrected':'original';
 const content='<?xml version="1.0" encoding="UTF-8"?>\n<?OFX OFXHEADER="200" VERSION="230" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>\n'+
  '<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><DTSERVER>20261201120000</DTSERVER><LANGUAGE>ENG</LANGUAGE>'+
  '<FI><ORG>Native application receiving bank</ORG><FID>120026</FID></FI></SONRS></SIGNONMSGSRSV1><BANKMSGSRSV1><STMTTRNRS>'+
  tag('TRNUID','browser-november-'+edition)+'<STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><STMTRS><CURDEF>USD</CURDEF>'+nativeAccount+
  '<BANKTRANLIST><DTSTART>20261101000000</DTSTART><DTEND>20261201000000</DTEND>'+rows.join('\n')+'</BANKTRANLIST>'+
  (corrected?'':'<BANKTRANLISTP><DTASOF>20261130235959[-5:EST]</DTASOF><STMTTRNP><TRNTYPE>CREDIT</TRNTYPE><DTTRAN>20261130170000[-5:EST]</DTTRAN><TRNAMT>25.00</TRNAMT><NAME>Pending November deposit</NAME></STMTTRNP></BANKTRANLISTP>')+
  '<LEDGERBAL>'+tag('BALAMT',closing)+'<DTASOF>20261130235959[-5:EST]</DTASOF></LEDGERBAL></STMTRS></STMTTRNRS>'+
  '<STMTENDTRNRS>'+tag('TRNUID','browser-november-closing-'+edition)+'<STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><STMTENDRS><CURDEF>USD</CURDEF>'+
  nativeAccount+'<CLOSING>'+tag('FITID','browser-november-close-'+edition)+'<DTOPEN>20261101</DTOPEN><DTCLOSE>20261130</DTCLOSE><DTNEXT>20261231</DTNEXT>'+
  '<BALOPEN>1295.00</BALOPEN>'+tag('BALCLOSE',closing)+'<DTPOSTSTART>20261101</DTPOSTSTART><DTPOSTEND>20261201</DTPOSTEND>'+
  '</CLOSING></STMTENDRS></STMTENDTRNRS></BANKMSGSRSV1></OFX>\n';
 return {name:'November '+edition+' bank statement.ofx',content};
}
function decemberSource(){
 const rows=[
  ['Date','Amount','AccountAmount','Payee','Reference','ID','Status','Balance','AccountBalance'],
  ['2026-12-01','','','Opening December bank balance','','','','1349.00','1349.00'],
  ['2026-12-02','5.00','7.00','December other income','BROWSER-CSV','BROWSER-CSV-INCOME','Booked','',''],
  ['2026-12-31','','','Closing December bank balance','','','','1354.00','1356.00']
 ];
 return {name:'December complete original bank export.csv',content:rows.map(row=>row.join(',')).join('\r\n')+'\r\n'};
}
function tarEntries(bytes){
 const files=new Map();let offset=0;
 while(offset+512<=bytes.length){
  const header=bytes.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;
  const leaf=header.subarray(0,100).toString('utf8').replace(/\0.*$/,''),prefix=header.subarray(345,500).toString('utf8').replace(/\0.*$/,'');
    const name=prefix?prefix+'/'+leaf:leaf;
  const size=parseInt(header.subarray(124,136).toString('ascii').replace(/\0.*$/,'').trim(),8);
  assert(Number.isSafeInteger(size)&&size>=0&&offset+512+size<=bytes.length,'Complete original archive member');
  assert(!files.has(name),'Unique original archive member');
  files.set(name,bytes.subarray(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512;
 }
 return files;
}
async function browserRuntime(scenario){
 const require=createRequire(import.meta.url),paths=[
  process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,
  '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules'
 ].filter(Boolean);
 let pkg,packagePath;
 for(const root of paths){try{packagePath=require.resolve('playwright',{paths:[root]});pkg=require(packagePath);break;}catch{}}
 if(!pkg){packagePath=require.resolve('playwright');pkg=require(packagePath);}
 const chromium=pkg.chromium??pkg.default?.chromium;assert(chromium,'Installed native Playwright Chromium API');
 const requested=scenario.browserExecutable??process.env.SCF_BANK_CHROMIUM;
 const candidates=requested?[requested]:[chromium.executablePath(),
  '/workspace/scratch/dba55fe4658b/kzfr-source-review/chromium/chrome-headless-shell-linux64/chrome-headless-shell',
  '/workspace/scratch/5403360e55a4/fleet-lightweight/shared/swarm/toolchains/browser/chromium-153.0.0/chromium'];
 let executable;
 for(const path of candidates){try{await access(path);executable=path;break;}catch{}}
 assert(executable,'Choose an installed Chromium executable with SCF_BANK_CHROMIUM: '+candidates.join(', '));
 return {chromium,packagePath,executable};
}

/**
 * Operate the complete browser against the caller's original running accounting server.
 * All bank mutations use visible forms. Read-only API responses bind those forms and
 * downloads to exact original records. The single injected interruption discards a
 * real, already committed receipt response and then recovers its original journal ID.
 */
export async function receiveBankBrowser({baseUrl,workspaceId,caseDirectory,sourceDirectory,reportDirectory,scenario}){
 assert(scenario?.account?.id&&scenario?.customer?.id&&scenario?.receivables,'Original account, customer and writer are required');
 const origin=new URL(baseUrl).origin,base=origin+'/api/receivables/bank-statements';
 assert(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname),'Use the caller-owned local server');
 assert(workspaceId&&caseDirectory&&sourceDirectory&&reportDirectory);
 await mkdir(reportDirectory,{recursive:true,mode:0o700});
 const inputsDir=join(reportDirectory,'original-inputs'),downloadsDir=join(reportDirectory,'downloads'),screensDir=join(reportDirectory,'screens');
 for(const dir of [inputsDir,downloadsDir,screensDir])await mkdir(dir,{recursive:true,mode:0o700});
 const phases=[],downloads=[],screenshots=[],pageErrors=[],networkErrors=[],consoleErrors=[],intentionalFailures=new Set(),mutations=[];
 const startedAt=new Date().toISOString(),accountId=scenario.account.id,actor='Original bank browser receiving';
 let browser,context,page,phaseName='browser setup',receiptPosts=0,receiptRequest=null,recoveredReceipt=null;
 const phase=(name,details={})=>{phaseName=name;phases.push({name,at:new Date().toISOString(),...details});};
 const get=async path=>{const response=await fetch(base+path);assert.equal(response.status,200,path+': '+await response.clone().text());return response.json();};
 const originalOctober=await get('/closes/'+scenario.finalClose.id);
 const initial=await get('/state');assert.equal(initial.workspaceId,workspaceId);
 const readTransactions=async()=>{const rows=[],limit=200;let offset=0,total=Infinity;
  while(offset<total){const value=await get('/transactions?accountId='+encodeURIComponent(accountId)+'&offset='+offset+'&limit='+limit);rows.push(...value.items);total=value.total;offset+=value.items.length;assert(value.items.length||offset>=total,'Complete transaction pagination');}return rows;};
 const retain=async(path,bytes)=>{await writeFile(path,bytes,{mode:0o600});await chmod(path,0o600);return {path,...exact(bytes)};};
 try{
  const runtime=await browserRuntime(scenario);
  browser=await runtime.chromium.launch({executablePath:runtime.executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,locale:'en-US',timezoneId:'UTC'});
  page=await context.newPage();page.setDefaultTimeout(25000);
  page.on('pageerror',error=>pageErrors.push({message:error.message,stack:error.stack}));
  page.on('requestfailed',request=>networkErrors.push({url:request.url(),method:request.method(),error:request.failure()?.errorText,expected:intentionalFailures.has(request.url())}));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push({text:message.text(),location:message.location()});});
  page.on('request',request=>{if(request.method()==='POST'&&request.url().startsWith(origin+'/api/receivables/')&&!/\/(?:source-preview|close-preview|inspect|preview)$/.test(request.url())){let body;try{body=request.postDataJSON();}catch{}mutations.push({url:request.url(),requestId:body?.requestId,revision:body?.revision,at:new Date().toISOString()});}});
  const closedDialogs=async()=>{for(const [id,action]of [['record-dialog','close-record'],['detail-dialog','close-dialog']])if(await page.locator('#'+id).evaluate(el=>el.open))await page.locator('#'+id+' [data-action="'+action+'"]').click();};
  const connected=async()=>{await page.waitForFunction(id=>document.querySelector('#connection')?.textContent.startsWith('Connected')&&document.querySelector('#workspace-identity')?.textContent.includes(id),workspaceId);};
  const tab=async name=>{await closedDialogs();await page.locator('nav [data-tab="'+name+'"]').click();await page.locator('#view-'+name).waitFor({state:'visible'});};
  const ready=async revision=>{await page.waitForFunction(value=>{const revisionMatch=document.querySelector('#workspace-identity')?.textContent.match(/\brevision\s+(\d+)\b/);return revisionMatch&&Number(revisionMatch[1])>=value&&document.querySelector('#pending')?.hidden&&!document.querySelector('#actor')?.disabled;},revision);};
  const responseFor=(path,method='POST')=>page.waitForResponse(r=>r.url()===base+path&&r.request().method()===method);
  const submit=async(form,path)=>{const responsePromise=responseFor(path);await page.locator(form+' button[type="submit"]').click();const response=await responsePromise;const body=await response.json();assert(response.ok(),path+': '+json(body));if(Number.isInteger(body.revision))await ready(body.revision);return body;};
  const field=async(form,name,value)=>{const locator=page.locator(form+' [name="'+name+'"]');const kind=await locator.evaluate(el=>el.tagName);if(kind==='SELECT')await locator.selectOption(String(value));else await locator.fill(String(value));};
  const screenshot=async(name,{mobile=false}={})=>{
   await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1000});
   await page.evaluate(()=>document.fonts?.ready);
   const overflow=await page.evaluate(()=>{const root=document.documentElement;return {viewport:innerWidth,documentWidth:root.scrollWidth,bodyWidth:document.body.scrollWidth,dialogs:[...document.querySelectorAll('dialog[open]')].map(el=>({id:el.id,width:el.getBoundingClientRect().width,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth})),wideElements:[...document.querySelectorAll('body *')].filter(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return r.width>0&&r.right>innerWidth+2&&s.position!=='fixed'&&!el.closest('.table-wrap,pre')&&!['hidden','clip','scroll','auto'].includes(s.overflowX);}).slice(0,12).map(el=>({tag:el.tagName,id:el.id,className:String(el.className),right:el.getBoundingClientRect().right}))};});
   assert(overflow.documentWidth<=overflow.viewport+2,'Document stays within '+overflow.viewport+'px: '+json(overflow));
   for(const dialog of overflow.dialogs)assert(dialog.width<=overflow.viewport+2,'Dialog stays within viewport');
   const path=join(screensDir,name+(mobile?'-390':'-1440')+'.png'),bytes=await page.screenshot({path,fullPage:true});
   await chmod(path,0o600);screenshots.push({name,mobile,path,...exact(bytes),overflow});
   if(mobile)await page.setViewportSize({width:1440,height:1000});
  };
  const download=async(locator,label)=>{
   const waiting=page.waitForEvent('download');await locator.click();const item=await waiting;
   const failure=await item.failure();assert.equal(failure,null,'Browser download '+label);
   const name=String(downloads.length+1).padStart(2,'0')+'-'+basename(item.suggestedFilename()).replace(/[^A-Za-z0-9._-]/g,'_');
   const path=join(downloadsDir,name);await item.saveAs(path);await chmod(path,0o600);
   const bytes=await readFile(path),record={label,suggestedFilename:item.suggestedFilename(),path,...exact(bytes)};
   downloads.push(record);Object.defineProperty(record,'data',{value:bytes});return record;
  };
  const openTransaction=async id=>{await tab('transactions');await page.locator('[data-action="open-transaction"][data-id="'+id+'"]').first().click();await page.locator('#detail-body #resolve-form').waitFor();};
  const openClose=async id=>{await tab('overview');await page.locator('[data-action="open-close"][data-id="'+id+'"]').first().click();await page.locator('#record-body [data-action="close-file"][data-id="'+id+'"]').first().waitFor();};
  const sourceDownload=async(importId,expected,label)=>{
   await tab('overview');
   const original=await download(page.locator('#view-overview [data-action="import-file"][data-id="'+importId+'"][data-file="original"]'),label+' original');
   assert.deepEqual(original.data,Buffer.from(expected),'Exact original browser source bytes');
   const parsed=await download(page.locator('#view-overview [data-action="import-file"][data-id="'+importId+'"][data-file="parsed.json"]'),label+' complete parsed source');
   const report=JSON.parse(parsed.data.toString('utf8'));assert(report.statements?.length,'Complete retained statement report');
   return {original,parsed,report};
  };
  const receiveOriginalIntakeInBrowser=async({source,deposit,receipt})=>{
   phaseName='visible original receipt-intake source adoption';
   const cashBase=origin+'/api/receivables';
   const cashGet=async path=>{const response=await fetch(cashBase+path);assert.equal(response.status,200,path+': '+await response.clone().text());return response.json();};
   const cashResponse=path=>page.waitForResponse(response=>response.url()===cashBase+path&&response.request().method()==='POST');
   const cashReady=async revision=>page.waitForFunction(value=>{
    const match=document.querySelector('#revision')?.textContent.match(/\bRevision\s+(\d+)\b/);
    return match&&Number(match[1])>=value&&!document.body.classList.contains('busy')&&!document.querySelector('#pending')?.textContent.trim();
   },revision);
   const cashSubmit=async(form,path)=>{
    const waiting=cashResponse(path);await page.locator(form+' button[type="submit"]').click();
    const response=await waiting,body=await response.json();assert(response.ok(),path+': '+json(body));
    await cashReady(body.revision);return body;
   };
   const state=await get('/state'),bound=state.accounts.find(value=>value.id===accountId)?.receiptIntakeAccountId;
   assert(bound,'Original receipt-intake account binding is retained in the source account');
   const before=await cashGet('/state?asOf=2026-12-31'),originalReceipt=before.receipts.find(value=>value.id===receipt.id);
   assert(originalReceipt,'The same original receipt is present before intake');
   const originalCoverage=[...new Set((originalReceipt.bankSources||[]).map(value=>value.coverageKey).filter(Boolean))].sort();
   await closedDialogs();await page.goto(origin+'/receivables/',{waitUntil:'networkidle'});
   await cashReady(before.revision);await page.locator('#operator').fill(actor);
   await page.locator('#as-of').fill('2026-12-31');await page.locator('#as-of').dispatchEvent('change');
   await page.waitForFunction(()=>document.querySelector('#revision')?.textContent.includes('As of 2026-12-31'));
   assert.equal(await page.locator('[data-view="cash-planning"]').count(),1,'Current cash planning remains in the composed application');
   assert.equal(await page.locator('[data-view="collections"]').count(),1,'Current collections remains in the composed application');
   assert.equal(await page.locator('a[href="/bank-statements/"]').first().textContent(),'Bank reconciliation');
   await page.locator('[data-view="bank"]').click();await page.locator('[data-action="bank-new-import"]').waitFor();
   await page.waitForLoadState('networkidle');
   await page.locator('[data-action="bank-new-import"]').click();await page.locator('#bank-source-form').waitFor();
   await field('#bank-source-form','accountId',bound);
   const originalInput=await page.locator('#bank-source-form [data-bank-source-file]').elementHandle();
   await page.locator('#bank-source-form [data-bank-source-file]').setInputFiles({name:source.name,mimeType:'application/x-ofx',buffer:Buffer.from(source.content)});
   await page.waitForFunction(element=>!element.isConnected,originalInput);
   await page.locator('#bank-source-form').waitFor();
   assert.equal(await page.locator('#bank-source-form [name="format"]').inputValue(),'OFX');
   const inspect=async()=>{
    const waiting=cashResponse('/bank-imports/inspect');await page.locator('[data-action="bank-inspect-source"]').click();
    const response=await waiting,value=await response.json();assert(response.ok(),json(value));
    await page.locator('#bank-source-form .section h3').filter({hasText:'Original statement review'}).waitFor();
    await page.waitForFunction(()=>!document.body.classList.contains('busy'));return value;
   };
   let inspection=await inspect();
   assert.equal(inspection.source.sha256,sha(source.content),'The original intake reads the same exact OFX bytes');
   const selected=inspection.sections.filter(value=>value.rowCount>0&&value.accountReference==='operating-001'&&value.currencyCode==='USD');
   assert.equal(selected.length,1,'One exact original bank statement section');
   if(await page.locator('#bank-source-form [name="sectionId"]').inputValue()!==selected[0].id){
    await field('#bank-source-form','sectionId',selected[0].id);inspection=await inspect();
   }
   const retained=await cashSubmit('#bank-source-form','/bank-imports');
   assert(retained.bankImport?.id,'Original receipt-intake import saved');
   const intakeId=retained.bankImport.id;
   const readRows=async()=>{
    const values=[];let offset=0,total=Infinity;
    while(offset<total){
     const result=await cashGet('/bank-imports/'+intakeId+'?view=rows&offset='+offset+'&limit=100');
     values.push(...result.items);total=result.total;offset+=result.items.length;
     assert(result.items.length||offset>=total,'Complete original intake pagination');
    }return values;
   };
   let intakeRows=await readRows();
   const candidate=intakeRows.find(value=>value.transactionId==='BROWSER-NET50');
   assert(candidate?.canPost,'Original gross receipt can be adopted from the retained source row');
   assert(candidate.statementReconciliation||candidate.sourceMatches.some(value=>value.statementReconciliation),'Original reconciliation is visible in intake');
   await page.locator('[data-action="bank-assign"][data-id="'+candidate.id+'"]').click();
   await page.locator('#bank-assignment-form').waitFor();
   const split=page.locator('#bank-assignment-form [data-bank-split]');
   assert.equal(await split.count(),1,'One original customer receipt split');
   assert.equal(await split.locator('[name="action"]').inputValue(),'LINK');
   assert.equal(await split.locator('[name="receiptId"]').inputValue(),receipt.id);
   assert.equal(cents(await split.locator('[name="amount"]').inputValue()),5000n,'Visible original gross source coverage');
   assert.match(await page.locator('[data-bank-statement-adjustment]').innerText(),/-3(?:\.00)?/);
   assert.match(await page.locator('[data-bank-unassigned]').innerText(),/0\.00/);
   await screenshot('original-receipt-intake-gross-fee');await screenshot('original-receipt-intake-gross-fee',{mobile:true});
   await page.locator('#bank-assignment-form button[type="submit"]').click();
   const reviewWaiting=cashResponse('/bank-imports/'+intakeId+'/preview');
   await page.locator('#dialog [data-action="bank-preview-posting"]').click();
   const reviewResponse=await reviewWaiting,review=await reviewResponse.json();assert(reviewResponse.ok(),json(review));
   await page.locator('#bank-posting-form').waitFor();
   assert.equal(cents(review.balanceEffects.totals.sourceCredits),4700n);
   assert.equal(cents(review.balanceEffects.totals.linkedReceiptAmount),5000n);
   assert.equal(cents(review.balanceEffects.totals.createdReceiptAmount),0n);
   assert.equal(cents(review.balanceEffects.totals.statementAdjustmentAmount),-300n);
   assert.equal(cents(review.balanceEffects.totals.allocatedAmount),0n,'Previously paid invoice is not allocated again');
   assert.equal(review.proposal.selections[0].splits[0].receiptId,receipt.id);
   await screenshot('original-receipt-intake-complete-review');await screenshot('original-receipt-intake-complete-review',{mobile:true});
   const posting=await cashSubmit('#bank-posting-form','/bank-imports/'+intakeId+'/post');
   assert(posting.bankPosting?.id,'Original posting journal and files are retained');
   const afterLink=await cashGet('/state?asOf=2026-12-31'),linkedReceipt=afterLink.receipts.find(value=>value.id===receipt.id);
   assert.equal(afterLink.receipts.length,before.receipts.length,'Source adoption does not create another receipt');
   assert.equal(cents(linkedReceipt.amount),5000n);
   assert.deepEqual([...new Set((linkedReceipt.bankSources||[]).map(value=>value.coverageKey).filter(Boolean))].sort(),originalCoverage,'Source alias retains the original payment coverage group');
   assert.equal((await cashGet('/invoices/'+invoice.id+'?asOf=2026-12-31')).summary.paymentStatus,'PAID');
   intakeRows=await readRows();assert.equal(intakeRows.find(value=>value.id===candidate.id).status,'LINKED');
   await page.locator('[data-action="bank-detail-view"][data-view="rows"]').click();await page.waitForLoadState('networkidle');
   const otherIncome=intakeRows.find(value=>value.transactionId==='BROWSER-INCOME10');
   assert(otherIncome,'Noncustomer credit remains in the complete original statement');
   if(['UNASSIGNED','CONFLICT','DUPLICATE'].includes(otherIncome.status)){
    await page.locator('[data-action="bank-ignore-row"][data-id="'+otherIncome.id+'"]').click();
    await field('#bank-reason-form','reason','This original credit is already classified as INCOME in Bank reconciliation; it is not a customer receipt.');
    await cashSubmit('#bank-reason-form','/bank-imports/'+intakeId+'/ignore');
   }else assert(['SOURCE_ONLY','IGNORED','POSTED','LINKED'].includes(otherIncome.status),'Original noncustomer source disposition');
   await page.locator('[data-action="bank-close-import"]').click();
   await field('#bank-reason-form','reason','Complete original statement: the gross customer receipt is linked, noncustomer income is classified in Bank reconciliation, and debit and zero rows retain their original source.');
   const closed=await cashSubmit('#bank-reason-form','/bank-imports/'+intakeId+'/close');
   assert.equal(closed.bankImport.status,'CLOSED');
   await page.locator('[data-action="bank-files"]').click();
   await page.locator('#dialog [data-action="bank-download-file"]').first().waitFor();
   const complete=await cashGet('/bank-imports/'+intakeId+'?view=summary');
   const receivedFiles=[];
   for(const name of [...new Set([...complete.files.map(value=>value.name),'status.json','reconciliation.json'])]){
    const original=complete.files.find(value=>value.name===name);
    const result=await download(page.locator('#dialog [data-action="bank-download-file"][data-name="'+name+'"]').first(),'Original receipt intake '+name);
    if(original?.sha256)assert.equal(result.sha256,original.sha256,'Retained original intake file '+name);
    if(name==='source.ofx')assert.deepEqual(result.data,Buffer.from(source.content),'Intake exports the same exact original statement');
    receivedFiles.push(result);
   }
   const after=await cashGet('/state?asOf=2026-12-31');assert.equal(after.receipts.length,before.receipts.length);
   const statementMatch=(await get('/transactions/'+deposit.id)).transaction.match;
   assert.equal(statementMatch.parts.filter(value=>value.kind==='RECEIPT')[0].targetId,receipt.id);
   assert.equal(cents(statementMatch.parts.find(value=>value.kind==='FEE').amount),-300n);
   const originalReport={accountId,receiptIntakeAccountId:bound,bankImportId:intakeId,postingId:posting.bankPosting.id,
    originalSource:inspection.source,receiptId:receipt.id,originalCoverage,proposal:review.proposal,totals:review.balanceEffects.totals,files:receivedFiles,receiptCount:after.receipts.length,closed:closed.bankImport};
   const originalReportFile=await retain(join(reportDirectory,'receipt-intake-browser-result.json'),Buffer.from(json(originalReport)));
   phase('visible original receipt-intake inspection, source alias, gross receipt and fee review, intake close and full handover',
    {receiptIntakeAccountId:bound,bankImportId:intakeId,receiptId:receipt.id,postingId:posting.bankPosting.id,grossAmount:'50.00',bankAmount:'47.00',adjustmentAmount:'-3.00',additionalReceipts:0,originalReport:originalReportFile,files:receivedFiles});
   await page.waitForLoadState('networkidle');await page.goto(origin+'/bank-statements/',{waitUntil:'networkidle'});await connected();
   if(await page.locator('#account-picker').inputValue()!==accountId)await page.locator('#account-picker').selectOption(accountId);
   await ready(after.revision);
   return originalReport;
  };

  const upload=async(source,{mapping=null,supersedes=null,capture=false}={})=>{
   await tab('import');const fileControl=await page.locator('#statement-file').elementHandle();
   await page.locator('#statement-file').setInputFiles({name:source.name,mimeType:source.name.endsWith('.csv')?'text/csv':'application/x-ofx',buffer:Buffer.from(source.content)});
   await page.waitForFunction(control=>!control.isConnected,fileControl);await fileControl.dispose();
   await page.waitForFunction(name=>document.querySelector('#source-file-summary h3')?.textContent===name,source.name);
   if(mapping){
    await field('#source-form','format','CSV');
    const values={bankId:'NATIVE-RECEIVING-BANK',branchId:'',accountId:'operating-001',accountType:'CHECKING',currency:'USD',headerRow:'1',delimiter:',',dateFormat:'YMD',decimalSeparator:'.',groupSeparator:'',amountMode:'SIGNED',postedStatuses:'Booked',pendingStatuses:'Pending',
     balanceRecords:JSON.stringify([{recordNumber:2,kind:'OPENING',amountColumn:mapping.balance,dateColumn:'Date'},{recordNumber:4,kind:'CLOSING',amountColumn:mapping.balance,dateColumn:'Date'}]),skipRecords:'[]'};
    for(const [name,value]of Object.entries(values))await field('#source-form',name,value);
    const columns={postedDate:'Date',amount:mapping.amount,providerId:'ID',payee:'Payee',reference:'Reference',status:'Status',balance:mapping.balance};
    for(const name of MAP_FIELDS)await field('#source-form','col-'+name,columns[name]||'');
   }else{await field('#source-form','format','OFX');await field('#source-form','accountNamespace','');}
   const preview=await submit('#source-form','/source-preview');
   await page.locator('#receive-source-form').waitFor();assert.equal(preview.file.sha256,sha(source.content));
   await field('#receive-source-form','accountId',accountId);
   if(supersedes){await field('#receive-source-form','supersedesImportId',supersedes);}
   if(capture){await screenshot('source-preview');await screenshot('source-preview',{mobile:true});}
   await page.locator('#receive-source-form [name="reviewed"]').check();
   const received=await submit('#receive-source-form','/imports');
   assert(received.import?.id);await page.locator('#view-transactions').waitFor({state:'visible'});
   return {import:received.import,preview};
  };
  const classify=async(id,kind,amount,note)=>{
   await openTransaction(id);
   if(amount==='0.00'){assert.equal(await page.locator('#posting-parts .posting-grid').count(),0);await page.locator('#match-form button[type="submit"]').filter({hasText:'Confirm zero amount'}).waitFor();}
   else{
    await field('#posting-parts .posting-grid','kind',kind);
    await field('#posting-parts .posting-grid','amount',amount);
    await field('#posting-parts .posting-grid','note',note);
    await field('#posting-parts .posting-grid','ledgerCode',kind==='FEE'?'BANK-FEES':'OTHER-INCOME');
   }
   await field('#match-form','reason',note);
   const result=await submit('#match-form','/transactions/'+encodeURIComponent(id)+'/match');
   assert(result.transaction?.match,'Original reviewed match retained');return result;
  };
  const closePeriod=async(imported,name,expected,{capture=false}={})=>{
   const state=await get('/state'),item=state.imports.find(x=>x.id===imported.id);
   const closing=item?.balances?.closing?.find(x=>x.eligible&&x.opening&&x.closing&&cents(x.closing.amount)===cents(expected));
   assert(closing,'Original complete period balance pair: '+expected);
   await tab('close');await field('#close-form','sourceClosing',JSON.stringify({importId:imported.id,id:closing.id}));
   await field('#close-form','name',name);await field('#close-form','note','Complete original statement, bank decisions, customer ledger and immutable source files.');
   const preview=await submit('#close-form','/close-preview');assert(preview.ready,json(preview.problems));assert.equal(preview.difference,'0.00');
   await page.locator('#retain-close-form [name="reviewed"]').check();const saved=await submit('#retain-close-form','/closes');assert.equal(saved.close.closingBalance,expected);
   await page.locator('#record-body [data-action="close-file"][data-id="'+saved.close.id+'"]').first().waitFor();
   if(capture){await screenshot('saved-reconciliation');await screenshot('saved-reconciliation',{mobile:true});}
   return saved.close;
  };
  const closeDownloads=async(close,label,{all=false}={})=>{
   await openClose(close.id);const files={};
   for(const name of all?CLOSE_FILES:['account.tar','editable-reconciliation.json'])files[name]=await download(page.locator('#record-body [data-action="close-file"][data-id="'+close.id+'"][data-file="'+name+'"]'),label+' '+name);
   const members=tarEntries(files['account.tar'].data),editable=JSON.parse(members.get('editable-reconciliation.json').toString('utf8'));
   assert.equal(editable.close.id,close.id);assert.equal(editable.close.closingBalance,close.closingBalance);
   assert(members.has('manifest.json')&&members.size>8,'Whole original account export');
   return {files,editable,members};
  };
  const reopen=async(close,reason)=>{
   await openClose(close.id);await field('#reopen-close-form','reason',reason);
   const result=await submit('#reopen-close-form','/closes/'+encodeURIComponent(close.id)+'/reopen');
   await page.locator('#record-body').getByRole('heading',{name:'Reopening',exact:true}).waitFor();
   assert(result.reopening);return result;
  };
  const applyCorrection=async(row,targetId,reason)=>{
   await openTransaction(targetId);await field('#undo-form','reason',reason);await submit('#undo-form','/transactions/'+encodeURIComponent(targetId)+'/undo');
   await openTransaction(row.id);await field('#resolve-form','action','APPLY_CORRECTION');
   await field('#resolve-form','targetManual',targetId);await field('#resolve-form','reason',reason);
   await submit('#resolve-form','/transactions/'+encodeURIComponent(row.id)+'/resolve');
   assert.equal((await get('/transactions/'+targetId)).transaction.status,'SUPERSEDED');
  };
  await page.goto(origin+'/bank-statements/',{waitUntil:'networkidle'});await connected();
  await page.locator('#account-picker').selectOption(accountId);await page.locator('#actor').fill(actor);
  await screenshot('workspace-open');await screenshot('workspace-open',{mobile:true});
  const beforeOriginal=await sourceDownload(scenario.originalImport.id,scenario.original.file.content,'Original October OFX');
  assert.equal(beforeOriginal.report.file.sha256,sha(scenario.original.file.content));
  phase('original server, same saved bank/customer workspace and complete original source download',{workspaceId,accountId,browser:browser.version(),executable:runtime.executable,packagePath:runtime.packagePath,originalImportId:scenario.originalImport.id});

  const november=novemberSource(),correction=novemberSource({corrected:true}),december=decemberSource();
  const originalInputs=[];
  for(const source of [november,correction,december])originalInputs.push(await retain(join(inputsDir,source.name.replaceAll(' ','_')),Buffer.from(source.content)));
  const firstImport=await upload(november,{capture:true});
  let rows=await readTransactions();
  const byProvider=id=>{const found=rows.filter(x=>x.providerId===id&&x.status!=='SUPERSEDED');assert.equal(found.length,1,'One current original provider transaction '+id);return found[0];};
  const deposit=byProvider('BROWSER-NET50'),income=byProvider('BROWSER-INCOME10'),fee=byProvider('BROWSER-FEE2'),zero=byProvider('BROWSER-ZERO');
  const sourceReport=await get('/imports/'+firstImport.import.id);
  const originalStatement=sourceReport.report.statements.find(x=>x.rows?.some(row=>row.providerId==='BROWSER-NET50'));
  assert.equal(originalStatement.pendingRows.length,1,'Original pending bank row retained separately');

  const requests=async values=>({revision:(await get('/state')).revision,actor,requestId:randomUUID(),...values});
  const invoice=(await scenario.receivables.saveDraft(await requests({customerId:scenario.customer.id,currency:{code:'USD',scale:2},issueDate:'2026-11-01',dueDate:'2026-11-30',
   lines:[{id:'browser-implementation',description:'Original browser receiving implementation',quantity:'1',unitAmount:'50.00',taxAmount:'0.00'}],note:'Same original merchant writer for the visible November receipt/allocation journey.'}))).invoice;
  const invoicePreview=await scenario.receivables.preview(invoice.id);
  await scenario.receivables.issue(invoice.id,await requests({expectedVersion:invoicePreview.expectedVersion,previewSha256:invoicePreview.previewSha256}));
  await tab('overview');await page.locator('[data-action="refresh"]').first().click();await ready((await get('/state')).revision);
  await openTransaction(deposit.id);
  await field('#receipt-form','customerId',scenario.customer.id);
  await field('#receipt-form','grossAmount','50.00');await field('#receipt-form','feeAmount','3.00');
  await field('#receipt-form','reference','BROWSER-NET50');await field('#receipt-form','note','Original gross customer funds and separate processor fee.');
  await field('#receipt-form','reason','The original bank credit is 50.00 customer payment less 3.00 processor fee.');
  await page.locator('#receipt-form details > summary').click();
  await field('#receipt-form','invoiceId',invoice.id);
  await page.locator('#selected-invoice a').waitFor();
  await field('#receipt-form','allocationAmount','50.00');await field('#receipt-form','allocatedDate','2026-11-02');
  await screenshot('customer-payment-allocation');await screenshot('customer-payment-allocation',{mobile:true});

  const receiptUrl=base+'/transactions/'+deposit.id+'/receipt',operationPattern=base+'/operations/*';
  const receiptPattern=receiptUrl;let resolveCommitted,rejectCommitted;
  const committed=new Promise((resolve,reject)=>{resolveCommitted=resolve;rejectCommitted=reject;});
  intentionalFailures.add(receiptUrl);
  await page.route(operationPattern,async route=>{intentionalFailures.add(route.request().url());await route.abort('failed');});
  await page.route(receiptPattern,async route=>{
   receiptPosts++;receiptRequest=route.request().postDataJSON();
   try{const response=await route.fetch();const body=await response.json();assert(response.ok(),json(body));resolveCommitted(body);await route.abort('failed');}
   catch(error){rejectCommitted(error);await route.abort('failed').catch(()=>{});}
  });
  await page.locator('#receipt-form button[type="submit"]').click();
  const committedReceipt=await committed;assert(committedReceipt.receipt?.id&&committedReceipt.allocation?.id,'Original receipt and allocation committed atomically');
  await page.waitForFunction(()=>!document.querySelector('#pending')?.hidden&&document.querySelector('#actor')?.disabled);
  await closedDialogs();
  const recoveryFile=await download(page.locator('#pending [data-action="download-operation"]'),'Original committed receipt recovery');
  const recovery=JSON.parse(recoveryFile.data.toString('utf8'));assert.equal(recovery.id,receiptRequest.requestId);assert.deepEqual(recovery.body,receiptRequest);
  await page.reload({waitUntil:'networkidle'});await connected();
  await page.waitForFunction(()=>!document.querySelector('#pending')?.hidden&&document.querySelector('#actor')?.disabled);
  assert.equal(await page.locator('[data-mutation]:not(:disabled)').count(),0,'Retained original operation locks all mutations across reload');
  await screenshot('original-request-recovery');
  await page.unroute(operationPattern);
  const recoveredResponse=page.waitForResponse(r=>r.url()===base+'/operations/'+receiptRequest.requestId&&r.request().method()==='GET');
  await page.locator('#pending [data-action="recover-operation"]').click();
  const recovered=await(await recoveredResponse).json();assert.equal(recovered.receipt.id,committedReceipt.receipt.id);
  await ready(recovered.revision);await page.unroute(receiptPattern);
  assert.equal(receiptPosts,1,'One actual receipt POST despite lost response and browser reload');
  const repeated=mutations.filter(x=>x.requestId===receiptRequest.requestId);assert.equal(repeated.length,1);
  recoveredReceipt=recovered.receipt;
  const paidResponse=await fetch(origin+'/api/receivables/invoices/'+invoice.id+'?asOf=2026-12-31');
  assert.equal(paidResponse.status,200);const paid=await paidResponse.json();assert.equal(paid.summary.paymentStatus,'PAID');assert.equal(paid.summary.amountDue,'0.00');
  assert.equal((await get('/transactions/'+deposit.id)).transaction.match.parts.length,2);
  phase('visible gross receipt, fee, full invoice allocation and durable original request recovery',{invoiceId:invoice.id,receiptId:recovered.receipt.id,allocationId:recovered.allocation.id,requestId:receiptRequest.requestId,actualReceiptPosts:receiptPosts,originalRecovery:recoveryFile,asOf:'2026-12-31',paymentStatus:paid.summary.paymentStatus});

  await classify(income.id,'INCOME','10.00','Original November other income classification');
  await classify(fee.id,'FEE','-2.00','Original November account fee');
  const zeroResult=await classify(zero.id,null,'0.00','Original bank reports zero cash; retain its source explanation');
  assert.equal(zeroResult.transaction.match.parts.length,0);
  const originalIntake=await receiveOriginalIntakeInBrowser({source:november,deposit,receipt:recovered.receipt});
  const novemberClose=await closePeriod(firstImport.import,'November original bank statement','1350.00',{capture:true});
  const novemberArchive=await closeDownloads(novemberClose,'November original complete close',{all:true});
  assert.equal(novemberArchive.editable.transactions.filter(x=>x.status==='POSTED'&&x.postedDate>='2026-11-01'&&x.postedDate<='2026-11-30').length,4);
  assert(novemberArchive.editable.receipts.some(x=>x.id===recovered.receipt.id));
  await sourceDownload(firstImport.import.id,november.content,'Original November OFX');
  phase('all original posted rows, explained zero cash and full reviewed statement close',{importId:firstImport.import.id,closeId:novemberClose.id,closingBalance:'1350.00',archive:novemberArchive.files['account.tar'],pendingRows:1});

  const correctionImport=await upload(correction);rows=await readTransactions();
  const feeCorrection=byProvider('BROWSER-FEE3');assert.equal(feeCorrection.status,'CORRECTION_REVIEW');
  const changed=await get('/closes/'+novemberClose.id);assert(changed.currentProblems.length||changed.newTransactionIds.length,'Saved close exposes later original source correction');
  await openClose(novemberClose.id);assert.match(await page.locator('#record-body').innerText(),/Current accounting review|Later source row/);
  await reopen(novemberClose,'The bank supplied an original REPLACE transaction and corrected closing balance.');
  await applyCorrection(feeCorrection,fee.id,'Original CORRECTFITID BROWSER-FEE2 and REPLACE, with complete native original amounts.');
  await classify(feeCorrection.id,'FEE','-3.00','Original corrected November account fee');
  const correctedNovember=await closePeriod(correctionImport.import,'November corrected bank statement','1349.00');
  const correctedNovemberArchive=await closeDownloads(correctedNovember,'November corrected complete close');
  const earlierAgain=await closeDownloads(novemberClose,'Original November close after correction');
  assert.equal(earlierAgain.files['account.tar'].sha256,novemberArchive.files['account.tar'].sha256,'Earlier immutable close remains byte-identical');
  phase('visible native REPLACE, original match undo, corrected close and immutable prior archive',{correctionImportId:correctionImport.import.id,transactionId:feeCorrection.id,earlierCloseId:novemberClose.id,closeId:correctedNovember.id,closingBalance:'1349.00',archive:correctedNovemberArchive.files['account.tar']});

  const csvImport=await upload(december,{mapping:{amount:'Amount',balance:'Balance'}});rows=await readTransactions();
  const csvOriginal=byProvider('BROWSER-CSV-INCOME');assert.equal(cents(csvOriginal.amount),500n);
  await classify(csvOriginal.id,'INCOME','5.00','Explicit original CSV Amount column');
  const decemberClose=await closePeriod(csvImport.import,'December first source interpretation','1354.00');
  const decemberArchive=await closeDownloads(decemberClose,'December first interpretation');
  const csvCorrection=await upload(december,{mapping:{amount:'AccountAmount',balance:'AccountBalance'},supersedes:csvImport.import.id});
  assert.equal(csvCorrection.preview.file.sha256,csvImport.preview.file.sha256,'Same exact original CSV file');
  assert.notEqual(csvCorrection.preview.reviewSha256,csvImport.preview.reviewSha256);
  assert.equal(csvCorrection.import.supersedesImportId,csvImport.import.id);
  rows=await readTransactions();const changedInterpretations=rows.filter(x=>x.interpretationReplacesId===csvOriginal.id);
  assert.equal(changedInterpretations.length,1);const csvReplacement=changedInterpretations[0];
  assert.equal(csvReplacement.status,'CORRECTION_REVIEW');assert.equal(csvReplacement.interpretationAction,'REPLACE');assert.equal(cents(csvReplacement.amount),700n);
  await openTransaction(csvReplacement.id);assert.match(await page.locator('#detail-body').innerText(),/Reviewed interpretation correction:\s*REPLACE/);
  await reopen(decemberClose,'The original file includes account-currency amounts and balances; retain its explicit corrected mapping.');
  await applyCorrection(csvReplacement,csvOriginal.id,'Same original source bytes; use AccountAmount and AccountBalance, retaining both interpretation editions.');
  await classify(csvReplacement.id,'INCOME','7.00','Reviewed original account-currency CSV amount');
  const finalDecember=await closePeriod(csvCorrection.import,'December corrected original-source close','1356.00');
  const finalDecemberArchive=await closeDownloads(finalDecember,'December final complete handover',{all:true});
  const oldDecember=await closeDownloads(decemberClose,'December earlier retained interpretation');
  assert.equal(oldDecember.files['account.tar'].sha256,decemberArchive.files['account.tar'].sha256);
  const originalCsv=await sourceDownload(csvCorrection.import.id,december.content,'Same original CSV and complete correction interpretation');
  assert.equal(originalCsv.original.sha256,sha(december.content));
  phase('full mapped CSV intake, same-byte interpretation correction and replacement original closing balance',{originalImportId:csvImport.import.id,correctedImportId:csvCorrection.import.id,sourceSha256:sha(december.content),oldTransactionId:csvOriginal.id,newTransactionId:csvReplacement.id,earlierCloseId:decemberClose.id,finalCloseId:finalDecember.id,closingBalance:'1356.00',archive:finalDecemberArchive.files['account.tar']});

  await page.reload({waitUntil:'networkidle'});await connected();
  assert.equal(await page.locator('#account-picker').inputValue(),accountId);
  await openClose(finalDecember.id);await screenshot('complete-corrected-handover');await screenshot('complete-corrected-handover',{mobile:true});
  const finalState=await get('/state'),octoberAgain=await get('/closes/'+scenario.finalClose.id);
  assert.equal(octoberAgain.currentProblems.length,0,'Original October close remains current');
  assert.equal(octoberAgain.close.id,originalOctober.close.id);
  assert.equal((await get('/closes/'+correctedNovember.id)).currentProblems.length,0);
  assert.equal((await get('/closes/'+finalDecember.id)).currentProblems.length,0);
  assert.deepEqual(pageErrors,[],'No application page errors');
  assert.deepEqual(networkErrors.filter(x=>!x.expected),[],'All application requests succeed except the retained deliberate transport interruption');
  phase('same-browser reopen, current original accounting review and complete desktop/390px handover',{revision:finalState.revision,activeNovemberCloseId:correctedNovember.id,activeDecemberCloseId:finalDecember.id,originalOctoberCloseId:scenario.finalClose.id});
  const result={schema:'stellar-forge.merchant-bank-browser-receiving.v1',status:'PASS',startedAt,completedAt:new Date().toISOString(),node:process.version,
   originalOperation:'SCF-MERCHANT-BANK-RECONCILIATION-DFF77-20261012',workspaceId,caseDirectory:resolve(caseDirectory),sourceDirectory:resolve(sourceDirectory),baseUrl:origin,
   browser:{version:browser.version(),executable:runtime.executable,packagePath:runtime.packagePath},phases,originalInputs,screenshots,downloads,mutations,
   originalIntake,originalRequest:{requestId:receiptRequest.requestId,actualReceiptPosts:receiptPosts,receiptId:recoveredReceipt.id},pageErrors,networkErrors,consoleErrors,revision:finalState.revision};
  await retain(join(reportDirectory,'browser-result.json'),Buffer.from(json(result)));return result;
 }catch(error){
  const failure={schema:'stellar-forge.merchant-bank-browser-receiving.v1',status:'FAILED',startedAt,failedAt:new Date().toISOString(),phase:phaseName,message:error.message,stack:error.stack,workspaceId,caseDirectory,sourceDirectory,phases,screenshots,downloads,mutations,pageErrors,networkErrors,consoleErrors};
  if(page){try{const path=join(screensDir,'failure.png');await page.screenshot({path,fullPage:true});await chmod(path,0o600);failure.failureScreenshot=path;failure.visibleText=(await page.locator('body').innerText()).slice(0,30000);}catch{}}
  await retain(join(reportDirectory,'browser-result.json'),Buffer.from(json(failure)));
  error.bankBrowserReport=join(reportDirectory,'browser-result.json');throw error;
 }finally{if(context)await context.close();if(browser)await browser.close();}
}
