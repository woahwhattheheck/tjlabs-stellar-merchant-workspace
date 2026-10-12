#!/usr/bin/env node
// MIT. Continue the original 25FD native performance customer case into original merchant accounting.
import assert from 'node:assert/strict';
import {mkdir, readFile, open, lstat, readdir, link, unlink} from 'node:fs/promises';
import {resolve, join, dirname, basename, isAbsolute, relative, sep} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {parseArgs} from 'node:util';

const SCF = 'stellar/scf-starforge-20261009/';
const SCHEMA = 'stellar-forge.merchant-performance-financial-operation.v1';
const RESULT = 'stellar-forge.merchant-performance-financial-result.v1';
const ACTOR = 'Repository fixture financial operator';
const MICRO = {code:'USD', scale:6};
const json = value => JSON.stringify(value,null,2)+'\n';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const utf8 = bytes => new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const absolute = value => {
  assert.ok(typeof value==='string' && isAbsolute(value) && resolve(value)===value && value!=='/' && !value.includes('\0'),
    'Use an absolute normalized private path.');
  return value;
};
async function maybeJSON(path) {
  try { return JSON.parse(await readFile(path,'utf8')); }
  catch(error) { if(error.code==='ENOENT') return null; throw error; }
}
async function directory(path) {
  await mkdir(path,{recursive:true,mode:0o700});
  const info=await lstat(path);
  assert.ok(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077),'Keep the original private directory: '+path);
}
async function retain(path,value) {
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:json(value));
  const parent=dirname(path);
  await directory(parent);
  const descriptor={name:basename(path),path,bytes:bytes.length,sha256:sha(bytes)};
  try { assert.deepEqual(await readFile(path),bytes,'Retain original bytes: '+path); return descriptor; }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  const temporary=join(parent,'.'+basename(path)+'.'+randomUUID()+'.partial');
  let handle;
  try {
    handle=await open(temporary,'wx',0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle=null;
    try { await link(temporary,path); }
    catch(error) { if(error.code!=='EEXIST') throw error; assert.deepEqual(await readFile(path),bytes,'Retain original bytes: '+path); }
    const owner=await open(parent,'r');
    try { await owner.sync(); } finally { await owner.close(); }
  } finally {
    await handle?.close();
    await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
  }
  return descriptor;
}
async function keep(path,create) {
  const prior=await maybeJSON(path);
  if(prior) return prior;
  const value=await create(); await retain(path,value); return value;
}
async function snapshot(source,target) {
  assert.ok(target!==source&&!target.startsWith(source+'/')&&!source.startsWith(target+'/'));
  await directory(target);
  for(const entry of (await readdir(source,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const from=join(source,entry.name),to=join(target,entry.name);
    assert.ok(!entry.isSymbolicLink(),'Keep an original regular source member: '+from);
    if(entry.isDirectory()) await snapshot(from,to);
    else { assert.ok(entry.isFile(),'Keep an original regular source member: '+from); await retain(to,await readFile(from)); }
  }
}
async function inventory(root) {
  const rows=[];
  async function visit(path) {
    for(const entry of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const full=join(path,entry.name);
      assert.ok(!entry.isSymbolicLink(),'The completed operation must retain original regular files.');
      if(entry.isDirectory()) await visit(full);
      else {
        assert.ok(entry.isFile());
        const bytes=await readFile(full);
        rows.push({name:relative(root,full).split(sep).join('/'),bytes:bytes.length,sha256:sha(bytes)});
      }
    }
  }
  await visit(root); return rows;
}
async function subprocess(program,args) {
  return await new Promise((resolveResult,reject)=>{
    const child=spawn(program,args,{stdio:['ignore','pipe','pipe']});
    const stdout=[],stderr=[];
    child.stdout.on('data',bytes=>stdout.push(bytes)); child.stderr.on('data',bytes=>stderr.push(bytes));
    child.once('error',reject);
    child.once('close',(code,signal)=>{
      const result={code,signal,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')};
      if(code!==0) reject(Object.assign(new Error(result.stderr||'Original archive process did not complete.'),{code:'FINANCIAL_ARCHIVE_FAILED',details:result}));
      else resolveResult(result);
    });
  });
}
async function archiveOperation(output,python) {
  const archive=output+'.tar.gz',receiptPath=output+'.archive.json';
  const prior=await maybeJSON(receiptPath);
  if(prior) {
    const bytes=await readFile(archive);
    assert.equal(bytes.length,prior.bytes); assert.equal(sha(bytes),prior.sha256);
    return prior;
  }
  const temporary=archive+'.'+randomUUID()+'.partial';
  await subprocess(python,['-c',
    'import os,sys,tarfile,uuid\nos.umask(0o077)\nsource,target,temporary=sys.argv[1:]\nwith open(temporary,"xb") as handle:\n with tarfile.open(fileobj=handle,mode="w:gz",format=tarfile.PAX_FORMAT) as archive:\n  archive.add(source,arcname=os.path.basename(source),recursive=True)\n handle.flush()\n os.fsync(handle.fileno())\nif os.path.lexists(target):\n os.rename(target,target+".previous-"+str(uuid.uuid4()))\nos.rename(temporary,target)\n',
    output,archive,temporary]);
  const bytes=await readFile(archive),receipt={schema:'stellar-forge.merchant-performance-financial-archive.v1',
    path:archive,root:basename(output),bytes:bytes.length,sha256:sha(bytes)};
  await retain(receiptPath,receipt); return receipt;
}
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderReport(value) {
  const comparison=value.pricingComparison,rows=[
    ['Recorded comparison basis',comparison.observed.basis],
    ['Recorded source quantity',comparison.observed.quantity],
    ['Recorded period',JSON.stringify(comparison.observed.period)],
    ['Explicit revised requests per month',comparison.revised.monthlyRequests],
    ['Earlier quoted uniform rate per request',comparison.earlier.unitUsd],
    ['Earlier quote: monthly route charge',comparison.earlier.invoiceAmount+' USD'],
    ['Revised native uniform rate per request',comparison.revised.unitUsd],
    ['Chosen quote: monthly route charge',comparison.revised.invoiceAmount+' USD'],
    ['Monthly route difference',comparison.routeDifferenceUsd+' USD'],
    ['Customer response',value.response.status+' / '+value.response.id],
    ['Billing period',value.calendar.period.startDate+' through '+value.calendar.period.endDate],
    ['Issued invoice',value.invoice.number],
    ['Issued invoice total',value.invoice.total+' '+value.invoice.currency.code]
  ];
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>Customer pricing and billing</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#181818;background:#fafafa;max-width:1080px;margin:36px auto;padding:0 24px}h1{font-size:27px}h2{font-size:20px}table{border-collapse:collapse;width:100%;background:white}th,td{text-align:left;vertical-align:top;border:1px solid #c8c8c8;padding:9px 12px}th{width:36%;font-weight:600;background:#efefef}a{color:#222;text-underline-offset:3px}code{overflow-wrap:anywhere}section{margin:28px 0}p{max-width:90ch}</style>'+
    '<h1>Customer pricing and billing</h1><p>'+escape(value.customer.name)+' · '+escape(value.operationId)+'</p>'+
    '<p>The saved recorded-usage review and the explicit later monthly proposal remain separate. The original Commercial response chooses the revised quotation. Its complete source is carried through the original agreement calendar and issued invoice.</p>'+
    '<table><tbody>'+rows.map(([key,data])=>'<tr><th>'+escape(key)+'</th><td>'+escape(data)+'</td></tr>').join('')+'</tbody></table>'+
    '<section><h2>Customer documents</h2><p><a href="invoice/invoice.html">Issued invoice</a> · <a href="agreement/agreement.html">Service agreement and calendar</a> · <a href="agreement/schedule.csv">Calendar CSV</a> · <a href="agreement.tar">Complete agreement packet</a> · <a href="customer-account.tar">Complete customer account</a></p>'+
    '<p><a href="commercial/old-rate-quote.json">Earlier quotation source</a> · <a href="commercial/revised-quote.json">Chosen quotation source</a> · <a href="commercial/response.json">Chosen customer response</a> · <a href="commercial/native-performance-source.json">Complete recorded-usage source</a> · <a href="commercial/usage-report.md">Recorded-usage report</a></p></section>'+
    '<section><h2>Retained original workspaces</h2><p>The original tariff operation, full performance operation and operated recipient CaseStore are retained under <code>originals/</code>. The complete accepted customer export is under <code>accepted-case-package/</code>. The closed native accounting workspace remains under <code>accounting/</code>, with its original pricing report and accounting terms under <code>pricing-source/</code>.</p>'+
    '<p><a href="flow-result.json">Complete operation result</a> · <a href="pricing-comparison.json">Full original pricing comparison</a> · <a href="files.json">Complete file inventory</a></p></section></html>';
}

/**
 * Use the original completed 25FD tariff operation and its performance/customer continuation.
 * The only new Commercial write is a source-labelled native-fixture response to the chosen
 * existing quote. Invoice/calendar writes use the original retained accounting owners.
 */
export async function runPerformanceFinancial({
  sourceRoot,nativeRun,performanceRun,customerRun,output,python='python3',
  startDate,termMonths=3,billingMonths=1,currencyScale=2,actor=ACTOR
}={}) {
  process.umask(0o077);
  for(const path of [sourceRoot,nativeRun,performanceRun,output]) absolute(path);
  if(customerRun!==undefined) absolute(customerRun);
  assert.ok(!output.startsWith(nativeRun+'/')&&!nativeRun.startsWith(output+'/')&&output!==nativeRun);
  assert.ok(!output.startsWith(performanceRun+'/')&&!performanceRun.startsWith(output+'/')&&output!==performanceRun);
  assert.ok(Number.isInteger(termMonths)&&termMonths>=1&&termMonths<=120);
  assert.ok(Number.isInteger(billingMonths)&&billingMonths>=1&&billingMonths<=12);
  assert.ok(Number.isInteger(currencyScale)&&currencyScale>=0&&currencyScale<=6);
  await directory(output);
  const attempt=randomUUID(),attemptPath=join(output,'attempts',attempt+'.json');
  let phase='source',accounting,running;
  const startedAt=new Date().toISOString();
  try {
    const load = path => import(pathToFileURL(join(sourceRoot,path)).href);
    const [
      {runPerformanceCommercial},{openCaseStore},{openCaseCommercial,commercialWorkspaceId},
      {parseWorkspace},{commercialContext},{commissioningFileBytes},{commercialCli},
      {openWorkspace},{preparePricingReportImport},{openAccountingWorkspace},
      {ReceivablesWorkspace},{compileQuoteInvoice},{minor,money,renderCustomerTar},
      {ServiceAgreementWorkspace},{monthDate,shiftDays},{createServiceAgreementsServer},
      {createServiceAgreementClient}
    ]=await Promise.all([
      load(SCF+'sf74-merchant-support-console/commercial/performance-native.mjs'),
      load(SCF+'sf74-merchant-support-console/case-store.mjs'),
      load(SCF+'sf74-merchant-support-console/case-commercial.mjs'),
      load(SCF+'sf74-merchant-support-console/workspace-file.mjs'),
      load(SCF+'sf74-merchant-support-console/commercial-quote.mjs'),
      load(SCF+'sf74-merchant-support-console/commissioning.mjs'),
      load(SCF+'sf74-merchant-support-console/commercial-cli.mjs'),
      load(SCF+'sf97-merchant-revenue-ops/workspace/model.mjs'),
      load(SCF+'merchant-settlement-accounting/pricing.mjs'),
      load(SCF+'merchant-settlement-accounting/workspace/store.mjs'),
      load(SCF+'merchant-settlement-accounting/receivables/store.mjs'),
      load(SCF+'merchant-settlement-accounting/receivables/quote-import.mjs'),
      load(SCF+'merchant-settlement-accounting/receivables/core.mjs'),
      load(SCF+'merchant-settlement-accounting/service-agreements/store.mjs'),
      load(SCF+'merchant-settlement-accounting/service-agreements/core.mjs'),
      load(SCF+'merchant-settlement-accounting/service-agreements/server.mjs'),
      load(SCF+'merchant-settlement-accounting/service-agreements/client.mjs')
    ]);
    phase='original performance operation';
    let performance=await maybeJSON(join(performanceRun,'flow-result.json'));
    if(!performance) performance=await runPerformanceCommercial({nativeRun,output:performanceRun,customerRun,python});
    assert.equal(performance.schema,'stellar-forge.merchant-performance-customer-result.v1');
    assert.equal(performance.state,'COMPLETE');
    assert.equal(performance.originalNative,nativeRun);
    assert.equal(performance.operationDirectory,performanceRun);
    const native=await maybeJSON(join(nativeRun,'flow-result.json'));
    assert.equal(native?.status,'COMPLETE');
    const performanceBytes=await readFile(join(performanceRun,'flow-result.json'));
    const nativeBytes=await readFile(join(nativeRun,'flow-result.json'));
    const casesDirectory=join(performanceRun,'recipient-cases'),caseId=performance.recipientCaseId;
    const store=await openCaseStore(casesDirectory),scope={caseId,workspaceId:commercialWorkspaceId(casesDirectory)};
    const commercial=openCaseCommercial({store,workspaceId:scope.workspaceId});
    let current=await commercial.read({id:caseId});
    const selectedIds=performance.quotes;
    function quoteOf(selection) {
      const quote=current.quotes.find(row=>row.id===selection.id);
      assert.ok(quote,'Keep the original saved quotation.');
      assert.equal(quote.sha256,selection.sha256); return quote;
    }
    const measured=quoteOf(selectedIds.measured),earlier=quoteOf(selectedIds.oldRateRevision),revised=quoteOf(selectedIds.revisedNativeRate);
    assert.equal(revised.sourceBindings.performance.measuredQuote.id,measured.id);
    assert.equal(revised.sourceBindings.performance.measuredQuote.sha256,measured.sha256);
    assert.equal(earlier.sourceBindings.performance.id,revised.sourceBindings.performance.id);
    const operationPath=join(output,'operation.json');
    const operation=await keep(operationPath,async()=>({
      schema:SCHEMA,operationId:randomUUID(),createdAt:new Date().toISOString(),actor,sourceRoot,nativeRun,performanceRun,casesDirectory,caseId,
      nativeResultSha256:sha(nativeBytes),performanceResultSha256:sha(performanceBytes),
      measuredQuote:{id:measured.id,sha256:measured.sha256},earlierQuote:{id:earlier.id,sha256:earlier.sha256},
      chosenQuote:{id:revised.id,sha256:revised.sha256},
      responseRequestId:randomUUID(),settingsRequestId:randomUUID(),agreementRequestId:randomUUID(),billRequestId:randomUUID(),issueRequestId:randomUUID(),
      startDate:startDate??monthDate(new Date().toISOString().slice(0,7)+'-01',1),termMonths,billingMonths,currencyScale
    }));
    assert.equal(operation.schema,SCHEMA);
    for(const [key,value]of Object.entries({actor,sourceRoot,nativeRun,performanceRun,casesDirectory,caseId,termMonths,billingMonths,currencyScale}))
      assert.equal(operation[key],value,'Use the original operation '+key);
    if(startDate!==undefined) assert.equal(operation.startDate,startDate);
    assert.equal(operation.nativeResultSha256,sha(nativeBytes));
    assert.equal(operation.performanceResultSha256,sha(performanceBytes));
    assert.deepEqual(operation.chosenQuote,{id:revised.id,sha256:revised.sha256});
    const priorResult=await maybeJSON(join(output,'flow-result.json'));
    if(priorResult) {
      assert.equal(priorResult.operationId,operation.operationId);
      await retain(join(output,'index.html'),renderReport(priorResult));
      if(!await maybeJSON(join(output,'files.json'))) {
        const files=await inventory(output);
        await retain(join(output,'files.json'),{schema:'stellar-forge.merchant-performance-financial-files.v1',
          operationId:operation.operationId,files});
      }
      return {...priorResult,archive:await archiveOperation(output,python),replayed:true};
    }
    await retain(attemptPath,{schema:SCHEMA,attempt,startedAt,operationId:operation.operationId,
      helperSha256:sha(await readFile(fileURLToPath(import.meta.url)))});
    const request=(name,create)=>keep(join(output,'requests',name+'.json'),create);

    phase='original selected customer response';
    const accepted=revised.receiving.find(row=>row.status==='ACCEPTED');
    let responseId=accepted?.id;
    if(!responseId) {
      const responseRequest=await request('customer-response',async()=>({
        id:caseId,scope,expectedRevision:current.revision,requestId:operation.responseRequestId,actor:operation.actor,
        quoteId:revised.id,quoteSha256:revised.sha256,status:'ACCEPTED',observedAt:operation.createdAt,
        source:'urn:stellar-forge:repository-native-performance-financial:'+operation.operationId,
        note:'Repository native operation: receive the selected original revised quotation and continue its complete invoice/calendar workflow.'
      }));
      const received=await commercial.receive(responseRequest);
      assert.equal(received.state,'COMPLETE'); responseId=received.document.id;
      assert.equal(responseId,operation.responseRequestId);
    }
    current=await commercial.read({id:caseId});
    const record=await store.read(caseId),workspace=await parseWorkspace(record.workspaceText);
    const context=await commercialContext(workspace,{caseId,workspaceId:scope.workspaceId,revision:record.revision});
    const originals={};
    for(const [name,id,kind]of [
      ['measured-quote',measured.id,'QUOTE'],['old-rate-quote',earlier.id,'QUOTE'],['revised-quote',revised.id,'QUOTE'],['response',responseId,'RESPONSE']
    ]) {
      const doc=context.documents.find(row=>row.id===id&&row.kind===kind);
      assert.ok(doc,'Keep the complete original '+kind+' material.');
      const bytes=Buffer.from(commissioningFileBytes(context.state,doc.material.sha256));
      assert.equal(bytes.length,doc.material.bytes); assert.equal(sha(bytes),doc.material.sha256);
      originals[name]={document:JSON.parse(utf8(bytes)),bytes,descriptor:await retain(join(output,'commercial',name+'.json'),bytes)};
    }
    const response=originals.response.document;
    assert.equal(response.payload.status,'ACCEPTED'); assert.equal(response.payload.quoteId,revised.id);
    assert.equal(response.payload.quoteSha256,revised.sha256);
    for(const [name,quote]of [['measured',measured],['old-rate',earlier],['revised',revised]]) {
      for(const [kind,suffix]of [['QUOTE_JSON','quote-payload.json'],['QUOTE','quote.md']]) {
        const file=await commercial.download({id:caseId,scope,revision:record.revision,quoteId:quote.id,quoteSha256:quote.sha256,kind});
        const bytes=Buffer.from(file.body);
        assert.equal(bytes.length,file.descriptor.bytes); assert.equal(sha(bytes),file.descriptor.sha256);
        await retain(join(output,'commercial',name+'-'+suffix),bytes);
      }
    }
    const performanceSourceId=revised.sourceBindings.performance.id;
    for(const [kind,name]of [['SOURCE','native-performance-source.json'],['ATTACHMENT','performance-attachment.json'],['REPORT','usage-report.md']]) {
      const file=await commercial.downloadPerformance({id:caseId,scope,revision:record.revision,sourceId:performanceSourceId,kind});
      const bytes=Buffer.from(file.body);
      assert.equal(bytes.length,file.descriptor.bytes); assert.equal(sha(bytes),file.descriptor.sha256);
      await retain(join(output,'commercial',name),bytes);
    }
    await retain(join(output,'commercial','case-record.json'),record);
    await retain(join(output,'commercial','workspace.json'),Buffer.from(record.workspaceText));
    if(record.supportText!==null) await retain(join(output,'commercial','support.json'),Buffer.from(record.supportText));
    await retain(join(output,'commercial','case-view.json'),current);
    const packageDirectory=join(output,'accepted-case-package');
    const packageArgs=['export','--cases-dir',casesDirectory,'--case',caseId,'--revision',record.revision,
      '--out',packageDirectory,'--export-id','financial-'+operation.operationId,'--generated-at',operation.createdAt,'--python',python];
    const commercialPackage=await keep(join(output,'commercial','export-result.json'),()=>commercialCli(packageArgs));

    phase='original saved pricing report to accounting terms';
    const pricingRoot=join(sourceRoot,SCF,'sf97-merchant-revenue-ops');
    const pricing=await openWorkspace({config:join(pricingRoot,'illustrative-service.json'),
      snapshot:join(pricingRoot,'illustrative-native-shape-snapshot.json'),directory:join(nativeRun,'pricing')});
    const pricingVersion=performance.nativeProposal.pricingVersion;
    const pricingReport=Buffer.from(await pricing.download(pricingVersion,'report/report.json'));
    const pricingImport=preparePricingReportImport(pricingReport,{accountingReference:'Original native performance proposal'});
    assert.equal(pricingImport.reportSha256,sha(pricingReport));
    await retain(join(output,'pricing-source','pricing-report.json'),pricingReport);
    const termsFile=join(output,'pricing-source','accounting-terms.json');
    await retain(termsFile,pricingImport.termsBytes);
    await retain(join(output,'pricing-source','source.json'),{
      schema:'stellar-forge.merchant-performance-financial-pricing.v1',pricingVersion,
      pricingRequestId:performance.nativeProposal.pricingRequestId,reportSha256:pricingImport.reportSha256,
      termsSha256:pricingImport.termsSha256,summary:pricingImport.summary
    });
    const accountingDirectory=join(output,'accounting'),outboxDir=join(output,'outbox'),proofDir=join(output,'proofs');
    await directory(outboxDir);await directory(proofDir);
    accounting=await openAccountingWorkspace({directory:accountingDirectory,outboxDir,proofDir,termsFile});
    let receivables=await new ReceivablesWorkspace(accounting).init();
    let agreements=await new ServiceAgreementWorkspace(accounting,{receivables}).init();
    const customerReference='PERFORMANCE-'+caseId;
    let customer=accounting.state.customerStatements.customers.find(row=>row.reference===customerReference);
    if(!customer) customer=(await receivables.saveCustomer({revision:accounting.state.revision,actor:operation.actor,
      reference:customerReference,name:revised.draft.customer.name,
      email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(revised.draft.customer.contact??'')?revised.draft.customer.contact:'',
      address:'',note:'Original Commercial case '+caseId+'; performance source '+performanceSourceId})).customer;
    assert.equal(customer.name,revised.draft.customer.name);
    const issuer=JSON.parse(utf8(pricingReport)).merchantName;
    const settings=await request('issuer-settings',async()=>({revision:accounting.state.revision,actor:operation.actor,
      requestId:operation.settingsRequestId,name:issuer,invoicePrefix:'PF',creditPrefix:'PC'}));
    await receivables.settings({...settings,revision:accounting.state.revision});
    const source={quoteContent:utf8(originals['revised-quote'].bytes),responseContent:utf8(originals.response.bytes)};
    const selection={customerId:customer.id,issueDate:operation.startDate,dueDate:shiftDays(operation.startDate,30),
      currencyScale:operation.currencyScale,scope:'RECURRING',periodCount:1,periodLabel:'Original one-month quotation comparison'};
    const oldReview=compileQuoteInvoice({...selection,quoteContent:utf8(originals['old-rate-quote'].bytes)});
    const chosenReview=compileQuoteInvoice({...selection,...source});
    assert.equal(chosenReview.review.accepted,true);
    assert.equal(oldReview.review.performance.binding.measuredQuote.sha256,measured.sha256);
    assert.equal(chosenReview.review.performance.binding.measuredQuote.sha256,measured.sha256);
    const oldRoute=oldReview.source.lines.find(row=>row.performanceSourceId===performanceSourceId);
    const newRoute=chosenReview.source.lines.find(row=>row.performanceSourceId===performanceSourceId);
    assert.ok(oldRoute&&newRoute);
    assert.equal(minor(oldRoute.originalAmountUsd,MICRO),minor(performance.quotes.oldRateRevision.monthlyUsd,MICRO));
    assert.equal(minor(newRoute.originalAmountUsd,MICRO),minor(performance.quotes.revisedNativeRate.monthlyUsd,MICRO));
    const comparison={
      schema:'stellar-forge.merchant-performance-financial-pricing-comparison.v1',
      observed:{sourceId:performanceSourceId,nativeSourceId:revised.sourceBindings.performance.nativeSourceId,
        measuredQuote:{id:measured.id,sha256:measured.sha256},basis:revised.sourceBindings.performance.basis.label,
        quantity:revised.sourceBindings.performance.basis.quantity,period:revised.sourceBindings.performance.period,
        costs:revised.sourceBindings.performance.costs},
      earlier:{id:earlier.id,sha256:earlier.sha256,unitUsd:oldRoute.originalUnitUsd,
        monthlyRequests:oldRoute.originalQuantity,monthlyAmountUsd:oldRoute.originalAmountUsd,invoiceAmount:oldRoute.invoiceAmount},
      revised:{id:revised.id,sha256:revised.sha256,unitUsd:newRoute.originalUnitUsd,
        monthlyRequests:newRoute.originalQuantity,monthlyAmountUsd:newRoute.originalAmountUsd,invoiceAmount:newRoute.invoiceAmount},
      routeDifferenceUsd:money(minor(oldRoute.originalAmountUsd,MICRO)-minor(newRoute.originalAmountUsd,MICRO),MICRO),
      oldQuoteReview:oldReview.review,chosenQuoteReview:chosenReview.review
    };
    await retain(join(output,'pricing-comparison.json'),comparison);
    await retain(join(output,'commercial','old-rate-invoice-preview.json'),oldReview);
    await retain(join(output,'commercial','chosen-invoice-preview.json'),chosenReview);

    phase='original agreement and issued invoice';
    const initialState=await agreements.state({asOf:operation.startDate});
    const createRequest=await request('create-agreement',async()=>({
      revision:accounting.state.revision,workspaceId:initialState.workspaceId,actor:operation.actor,requestId:operation.agreementRequestId,
      reference:'PF-'+operation.operationId,title:'Recorded usage customer service',customerId:customer.id,
      startDate:operation.startDate,termMonths:operation.termMonths,billingMonths:operation.billingMonths,
      invoiceTiming:'START',dueDays:30,currencyScale:operation.currencyScale,...source
    }));
    const created=await agreements.create({...createRequest,revision:accounting.state.revision,workspaceId:initialState.workspaceId});
    const agreementId=created.agreementId;
    let detail=await agreements.detail(agreementId,{asOf:operation.startDate});
    const period=detail.periods[0];
    let billRequest=await maybeJSON(join(output,'requests','bill-period.json'));
    if(!billRequest) {
      const preview=await agreements.preview(agreementId,{periodId:period.id,asOf:operation.startDate});
      await retain(join(output,'agreement','period-preview.json'),preview);
      billRequest=await request('bill-period',async()=>({
        revision:accounting.state.revision,workspaceId:preview.workspaceId,actor:operation.actor,requestId:operation.billRequestId,
        expectedVersion:preview.agreementVersion,periodId:period.id,previewSha256:preview.previewSha256
      }));
    }
    const billed=await agreements.bill(agreementId,{...billRequest,revision:accounting.state.revision,workspaceId:initialState.workspaceId});
    const invoiceId=billed.invoice.id;
    let issueRequest=await maybeJSON(join(output,'requests','issue-invoice.json'));
    if(!issueRequest) {
      const preview=await receivables.preview(invoiceId);
      await retain(join(output,'invoice','preview.json'),preview);
      issueRequest=await request('issue-invoice',async()=>({
        revision:accounting.state.revision,actor:operation.actor,requestId:operation.issueRequestId,
        expectedVersion:preview.expectedVersion,previewSha256:preview.previewSha256
      }));
    }
    const issued=await receivables.issue(invoiceId,{...issueRequest,revision:accounting.state.revision});
    detail=await agreements.detail(agreementId,{asOf:operation.startDate});
    const invoice=await receivables.detail(invoiceId,{asOf:operation.startDate});
    assert.equal(invoice.invoice.status,'ISSUED');
    assert.equal(invoice.sourceQuote.quoteId,revised.id);assert.equal(invoice.sourceQuote.quoteSha256,revised.sha256);
    assert.equal(invoice.draft.totals.total,period.amount);
    const billedRoute=invoice.sourceQuote.review.lines.find(row=>row.performanceSourceId===performanceSourceId);
    assert.ok(billedRoute);assert.equal(billedRoute.periodCount,period.periodCount);
    assert.equal(minor(billedRoute.selectedAmountUsd,MICRO),minor(newRoute.originalAmountUsd,MICRO)*BigInt(period.periodCount));
    assert.equal(invoice.sourceQuote.review.performance.binding.id,performanceSourceId);
    assert.deepEqual(invoice.sourceQuote.review.performance.binding.period,revised.sourceBindings.performance.period);
    for(const name of ['quote.json','response.json','source.json','review.json']) {
      const file=await receivables.quoteFile(invoiceId,name);
      await retain(join(output,'invoice','source-'+name),file.bytes);
      if(name==='quote.json')assert.deepEqual(file.bytes,originals['revised-quote'].bytes);
      if(name==='response.json')assert.deepEqual(file.bytes,originals.response.bytes);
    }
    for(const name of ['invoice.json','invoice.html','invoice.csv','manifest.json','status.json'])
      await retain(join(output,'invoice',name),(await receivables.file(invoiceId,name)).bytes);
    await retain(join(output,'invoice','detail.json'),invoice);
    const agreementExport=await agreements.exportAgreement(agreementId,{asOf:operation.startDate});
    for(const file of agreementExport.files) await retain(join(output,'agreement',file.name),file.bytes);
    await retain(join(output,'agreement.tar'),renderCustomerTar(agreementExport.files));
    const customerExport=await receivables.exportCustomer(customer.id,{asOf:operation.startDate});
    for(const file of customerExport.files) await retain(join(output,'customer-account',file.name),file.bytes);
    await retain(join(output,'customer-account.tar'),renderCustomerTar(customerExport.files));
    const finalRevision=accounting.state.revision;
    await accounting.close();accounting=null;

    phase='original HTTP reopen and complete source export';
    running=await createServiceAgreementsServer({directory:accountingDirectory,port:0});
    const client=createServiceAgreementClient({baseUrl:new URL('/api/service-agreements',running.url).href,fetch});
    const reopened=await client.detail(agreementId,{asOf:operation.startDate});
    assert.equal(reopened.revision,finalRevision);
    assert.equal(reopened.agreement.id,agreementId);
    assert.equal(reopened.periods.find(row=>row.id===period.id).invoiceId,invoiceId);
    const assets=[];
    for(const [route,path]of [
      ['/service-agreements/',SCF+'merchant-settlement-accounting/service-agreements/public/index.html'],
      ['/service-agreements/app.mjs',SCF+'merchant-settlement-accounting/service-agreements/public/app.mjs'],
      ['/service-agreements/client.mjs',SCF+'merchant-settlement-accounting/service-agreements/client.mjs'],
      ['/receivables/',SCF+'merchant-settlement-accounting/receivables/public/index.html'],
      ['/receivables/app.mjs',SCF+'merchant-settlement-accounting/receivables/public/app.mjs']
    ]) {
      const response=await fetch(new URL(route,running.url),{signal:AbortSignal.timeout(20000)});
      assert.equal(response.status,200,route);
      const bytes=Buffer.from(await response.arrayBuffer());assert.deepEqual(bytes,await readFile(join(sourceRoot,path)));
      assets.push({route,bytes:bytes.length,sha256:sha(bytes)});
    }
    const exported=await fetch(new URL('/api/service-agreements/agreements/'+agreementId+'/export?format=tar&asOf='+operation.startDate,running.url),
      {signal:AbortSignal.timeout(20000)});
    assert.equal(exported.status,200);
    const exportBytes=Buffer.from(await exported.arrayBuffer());
    assert.deepEqual(exportBytes,await readFile(join(output,'agreement.tar')));
    await retain(join(output,'agreement','http-reopen.json'),reopened);
    const http={url:running.url,revision:reopened.revision,assets,agreementTar:{bytes:exportBytes.length,sha256:sha(exportBytes)}};
    await running.close();running=null;

    phase='complete original workspace snapshots';
    await snapshot(nativeRun,join(output,'originals','tariff-operation'));
    await snapshot(performanceRun,join(output,'originals','performance-operation'));
    const value={
      schema:RESULT,state:'COMPLETE',operationId:operation.operationId,createdAt:operation.createdAt,completedAt:new Date().toISOString(),
      node:process.version,output,sourceRoot,originalNative:nativeRun,originalPerformance:performanceRun,
      originalResults:{nativeSha256:operation.nativeResultSha256,performanceSha256:operation.performanceResultSha256},
      case:{id:caseId,revision:record.revision,originalCaseId:performance.originalCaseId,
        directory:casesDirectory,workspaceSha256:sha(Buffer.from(record.workspaceText)),package:commercialPackage},
      customer:{id:customer.id,reference:customer.reference,name:customer.name},
      response:{id:responseId,status:response.payload.status,quoteId:response.payload.quoteId,
        quoteSha256:response.payload.quoteSha256,sourceCaseId:response.caseId,sha256:sha(originals.response.bytes)},
      pricingComparison:comparison,
      pricingSource:{version:pricingVersion,reportSha256:pricingImport.reportSha256,termsSha256:pricingImport.termsSha256},
      calendar:{id:agreementId,revision:finalRevision,period:detail.periods[0],periods:detail.periods,
        sources:detail.agreement.sources.map(row=>({id:row.id,quote:row.quote,response:row.response}))},
      invoice:{id:invoiceId,number:issued.invoice.number,status:invoice.invoice.status,
        total:invoice.draft.totals.total,currency:invoice.draft.currency,periodCount:period.periodCount,
        originalQuotedRouteAmountUsd:newRoute.originalAmountUsd,billedRouteAmountUsd:billedRoute.selectedAmountUsd,
        billedRouteInvoiceAmount:billedRoute.invoiceAmount},
      files:{commercial:'commercial/',agreement:'agreement/',invoice:'invoice/',customerAccount:'customer-account/',
        originalNative:'originals/tariff-operation/',originalPerformance:'originals/performance-operation/',
        operatedCases:'originals/performance-operation/recipient-cases/',closedAccounting:'accounting/'},
      http,archive:{path:output+'.tar.gz',format:'tar+gzip',root:basename(output)}
    };
    await retain(join(output,'flow-result.json'),value);
    await retain(join(output,'index.html'),renderReport(value));
    const files=await inventory(output);
    await retain(join(output,'files.json'),{schema:'stellar-forge.merchant-performance-financial-files.v1',operationId:operation.operationId,files});
    phase='complete archive';
    return {...value,archive:await archiveOperation(output,python)};
  } catch(error) {
    await accounting?.close().catch(()=>{});accounting=null;
    await running?.close().catch(()=>{});running=null;
    try { await retain(join(output,'failures',attempt+'.json'),{schema:SCHEMA,attempt,startedAt,phase,
      failedAt:new Date().toISOString(),code:error.code??'PERFORMANCE_FINANCIAL_OPERATION_FAILED',message:error.message,details:error.details??null,stack:error.stack}); }
    catch {}
    throw error;
  } finally {
    await running?.close();await accounting?.close();
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const {values}=parseArgs({allowPositionals:false,strict:true,options:{
      'source-root':{type:'string'},'native-run':{type:'string'},'performance-run':{type:'string'},'customer-run':{type:'string'},
      output:{type:'string'},python:{type:'string'},'start-date':{type:'string'},'term-months':{type:'string'},
      'billing-months':{type:'string'},'currency-scale':{type:'string'},actor:{type:'string'}
    }});
    const result=await runPerformanceFinancial({sourceRoot:values['source-root'],nativeRun:values['native-run'],
      performanceRun:values['performance-run'],customerRun:values['customer-run'],output:values.output,python:values.python??'python3',
      startDate:values['start-date'],termMonths:values['term-months']===undefined?3:Number(values['term-months']),
      billingMonths:values['billing-months']===undefined?1:Number(values['billing-months']),
      currencyScale:values['currency-scale']===undefined?2:Number(values['currency-scale']),actor:values.actor??ACTOR});
    process.stdout.write(json(result));
  } catch(error) {
    process.stderr.write(json({error:error.code??'PERFORMANCE_FINANCIAL_OPERATION_FAILED',message:error.message,details:error.details??null,stack:error.stack}));
    process.exitCode=1;
  }
}
