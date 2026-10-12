#!/usr/bin/env node
// MIT. One complete original-source funding-report receiving operation.
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {AwardWorkspace} from '../workspace.mjs';
import {serveWorkspace} from '../server.mjs';
import {detailReceipt} from '../source-import.mjs';
import {main as cli} from '../cli.mjs';
import {sha,canonical,requireThat} from '../core.mjs';
import {prepareFundingMerchant,fundingMerchantCatalog,serveFundingMerchant} from './merchant.mjs';
import {extractFundingReport,adoptFundingBuyer} from './receiving.mjs';
import {decodeFundingDelivery} from './core.mjs';
import {prepareReview} from '../../../sf88-operator-buyer-cli/prepare.mjs';
import {MerchantUSASpendingWorkspaces,readUSASpendingWorkspaceConfiguration} from '../../../../../stellar-forge/mcp-merchant-operator/usaspending-workspace.mjs';
const OPERATION='SCF-FEDERAL-FUNDING-REPORT-DELIVERY-64B7-20261012';
const HELP='node reports/run-native.mjs --source ORIGINAL_SOURCE_PACKET.json --out PRIVATE_DIRECTORY [--merchant ORIGINAL_PUBLIC_SELECTION.json] [--buyer-inbox ORIGINAL_INBOX --buyer-intent ORIGINAL_INTENT --buyer-receiving-root DIRECTORY]';
async function exists(path){try{return await readFile(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function options(args){
  const o={};for(let i=0;i<args.length;i+=2){requireThat(['--source','--out','--merchant','--buyer-inbox','--buyer-intent','--buyer-receiving-root'].includes(args[i])&&args[i+1]&&!o[args[i]],'ARGUMENT_INVALID',HELP);o[args[i]]=args[i+1];}
  requireThat(o['--source']&&o['--out'],'ARGUMENT_REQUIRED',HELP);
  const buyer=['--buyer-inbox','--buyer-intent','--buyer-receiving-root'].filter(k=>o[k]);requireThat(buyer.length===0||buyer.length===3,'ORIGINAL_BUYER_SELECTION_REQUIRED');
  return {source:resolve(o['--source']),out:resolve(o['--out']),merchant:o['--merchant']?resolve(o['--merchant']):null,
    buyer:buyer.length?{inbox:resolve(o['--buyer-inbox']),intentId:o['--buyer-intent'],receivingRoot:resolve(o['--buyer-receiving-root'])}:null};
}
export async function run({source,out,merchant=null,buyer=null}) {
  out=resolve(out);const sourceBytes=await readFile(source),input=JSON.parse(sourceBytes),merchantBytes=merchant?await readFile(merchant):null,terms=merchantBytes?JSON.parse(merchantBytes):null;
  requireThat(input.schema==='usaspending.native-transaction-source.v1'&&Array.isArray(input.files),'ORIGINAL_SOURCE_PACKET_REQUIRED');
  const sources=new Map(input.files.map(f=>{const bytes=Buffer.from(f.content,'base64');requireThat(f.encoding==='base64'&&bytes.length===f.bytes&&sha(bytes)===f.sha256,'ORIGINAL_SOURCE_CHANGED');return [f.path,bytes];}));
  const need=name=>{const b=sources.get(name);requireThat(b,'ORIGINAL_SOURCE_MISSING',name);return b;};
  await mkdir(out,{recursive:true,mode:0o700});
  const sourceBinding={sourceSha256:sha(sourceBytes),merchantSha256:merchantBytes?sha(merchantBytes):null,buyer},journalPath=join(out,'operation.json'),old=await exists(journalPath);
  const journal=old?JSON.parse(old):{schema:'stellar-forge.funding-report-native.v1',operation:OPERATION,source:sourceBinding,startedAt:new Date().toISOString(),steps:{}};
  requireThat(journal.operation===OPERATION&&canonical(journal.source)===canonical(sourceBinding),'NATIVE_OPERATION_SELECTION_CHANGED');
  const save=async()=>{const temp=journalPath+'.'+randomUUID()+'.next';await writeFile(temp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(temp,journalPath);};
  async function retain(name,value){const path=join(out,name),bytes=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n'),saved=await exists(path);if(saved)requireThat(sha(saved)===sha(bytes),'NATIVE_OUTPUT_CHANGED',name);else await writeFile(path,bytes,{flag:'wx',mode:0o600});return {path,bytes:bytes.length,sha256:sha(bytes)};}
  async function step(name,fn){if(journal.steps[name])return journal.steps[name];journal.currentStep=name;await save();const result=await fn();journal.steps[name]=result;await save();process.stdout.write(JSON.stringify({operation:OPERATION,step:name,state:'complete'})+'\n');return result;}
  await retain('original-source.json',sourceBytes);if(merchantBytes)await retain('original-public-merchant.json',merchantBytes);
  const workspaceDir=join(out,'producer'),workspace=new AwardWorkspace(workspaceDir,{operator:'Federal funding report publisher'});
  const lease='funding-report-native-operation',leaseOwner={pid:process.pid,processIdentity:workspace.identity,instance:workspace.instance};
  workspace.tx(()=>{const prior=workspace.db.prepare('SELECT value FROM workspace_meta WHERE key=?').get(lease);workspace.transactions.idle({id:lease,owner:prior?JSON.parse(prior.value):null});workspace.db.prepare('INSERT INTO workspace_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(lease,canonical(leaseOwner));});
  let service,seller,owner,opened;
  const releaseLease=()=>{workspace.tx(()=>{const current=workspace.db.prepare('SELECT value FROM workspace_meta WHERE key=?').get(lease);if(current&&canonical(JSON.parse(current.value))===canonical(leaseOwner))workspace.db.prepare('DELETE FROM workspace_meta WHERE key=?').run(lease);});};
  const closeResearch=async()=>{try{releaseLease();}catch{}if(service){const original=service;service=null;await original.close();}else{try{workspace.close();}catch{}}};
  try {
    const rawRequest=need('transactions-page-0001.request.json'),request=JSON.parse(rawRequest),response=need('transactions-page-0001.response.json'),observed=input.transaction_receipt;
    requireThat(observed.method==='POST'&&request.award_id===input.award_id&&observed.request_body_sha256===sha(rawRequest)&&observed.response_sha256===sha(response),'ORIGINAL_TRANSACTION_RECEIPT_CHANGED');
    const receipt={request:{method:observed.method,url:observed.url,body:request,bodyBase64:rawRequest.toString('base64'),bodySha256:sha(rawRequest)},startedAt:observed.observed_at,finishedAt:observed.completed_at,url:observed.url,status:observed.http_status,headers:Object.fromEntries(observed.response_headers??[]),bytes:response.length,sha256:sha(response),originalReceipt:observed};
    const captured=await step('original_source',async()=>{
      const awardBytes=need('award.json'),original=workspace.importDetail({bytes:awardBytes,receipt:detailReceipt(JSON.parse(need('award.source.json')),awardBytes),name:'Original funding report source'});
      const capture=workspace.transactions.import({editionId:original.editionId,awardKey:input.award_id,pages:[{request,receipt,responseBase64:response.toString('base64')}]});
      const summary=workspace.transactions.summary(capture.captureId);
      requireThat(summary.capture.status==='complete'&&summary.analysis.net_obligation_usd===input.completion.exact_obligation_total&&summary.analysis.unique_transactions===input.completion.rows,'ORIGINAL_ANALYSIS_CHANGED');
      return {editionId:original.editionId,captureId:capture.captureId,awardKey:input.award_id,sourceSha256:sha(response),netObligationUsd:summary.analysis.net_obligation_usd,transactions:summary.analysis.unique_transactions};
    });
    const assessment=await step('source_assessment',async()=>{
      const prior=workspace.transactions.summary(captured.captureId).review;
      if(prior)return {revision:prior.revision};
      const result=workspace.transactions.saveReview({captureId:captured.captureId,expectedRevision:0,review:{status:'researching',fit:'Original award funding history for a complete customer report.',fundingChange:'The retained original source totals USD '+captured.netObligationUsd+'.',proposedWorkshare:'Prepare the complete source-backed funding report and customer receiving.',deliverables:'Readable report, exact transaction values, original sources and editable report receiving.',acceptance:'The receiver retains every selected source byte and public report field.',owner:'Original relationship owner',caseUrl:'',nextAction:'Review the public report and its complete source.',notes:'Private receiving note: keep this assessment in the original workspace.'}});
      return {revision:result.revision};
    });
    service=await serveWorkspace(workspace,{port:0});const token=new URL(service.url).hash.slice(1);
    const http=async(path,body)=>{const r=await fetch(service.origin+path,{method:body===undefined?'GET':'POST',headers:{'x-research-token':token,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});requireThat(r.ok,'NATIVE_REPORT_HTTP_FAILED',path+' '+r.status+' '+(!r.ok?await r.text():''));return r;};
    const draftInput={operationId:'REPORT-NATIVE-ORIGINAL-64B7',captureId:captured.captureId,expectedReviewRevision:assessment.revision,content:{
      title:'Original award funding history: '+input.award_id,publisher:'Token Junkie Labs',
      purpose:'Review the retained federal award transaction history and receive a complete source-backed report.',
      findings:'The original captured history contains '+captured.transactions+' transactions and records a combined obligation of USD '+captured.netObligationUsd+'. Each original action, modification and funding amount remains available in the complete timeline.',
      implications:'Review the award scope and the source action descriptions when preparing an implementation workshare.',
      useTerms:'Original public federal award data: USAspending.gov. This report includes the retained source and original observation dates. Retain source attribution with redistributed analysis.'
    }};
    const published=await step('reviewed_report',async()=>{
      const draft=await (await http('/api/funding-reports/prepare',draftInput)).json(),replay=await (await http('/api/funding-reports/prepare',draftInput)).json();
      requireThat(replay.id===draft.id&&replay.replayed===true,'REPORT_PREPARATION_RECOVERY_CHANGED');
      const html=Buffer.from(await (await http('/api/funding-reports/export?kind=html&report='+draft.id)).arrayBuffer());requireThat(html.includes(Buffer.from(captured.netObligationUsd)),'REPORT_AMOUNT_MISSING');await retain('report.html',html);
      const accepted=await (await http('/api/funding-reports/publish',{reportId:draft.id,expectedSha256:draft.sha256})).json();requireThat(accepted.status==='published','REPORT_PUBLICATION_FAILED');
      for(const asset of ['/funding-reports.html','/funding-reports.js','/funding-reports.css']){const r=await fetch(service.origin+asset);requireThat(r.ok&&(await r.arrayBuffer()).byteLength>0,'REPORT_BROWSER_ASSET_MISSING',asset);}
      return {id:accepted.id,sha256:accepted.sha256,assetSha256:accepted.assetSha256,bytes:accepted.bytes};
    });
    const delivery=await step('complete_delivery',async()=>{
      const bytes=Buffer.from(await (await http('/api/funding-reports/export?kind=delivery&report='+published.id)).arrayBuffer()),checked=decodeFundingDelivery(bytes,{expectedSha256:published.assetSha256});
      requireThat(checked.report.id===published.id&&checked.packet.analysis.after.net_obligation_usd===captured.netObligationUsd,'COMPLETE_REPORT_CHANGED');
      requireThat(!canonical(checked.packet).includes('Private receiving note'),'PRIVATE_ASSESSMENT_IN_PUBLIC_REPORT');
      requireThat(sha(Buffer.from(checked.packet.source.after.pages[0].responseBase64,'base64'))===captured.sourceSha256,'ORIGINAL_REPORT_SOURCE_CHANGED');
      const result=await retain('report.funding-report.gz',bytes);await retain('report.json',checked.packet);await retain('transactions.csv',workspace.fundingReports.export(published.id,{kind:'csv'}));
      return {...result,reportId:published.id,files:checked.files.length};
    });
    if(terms)await step('original_merchant_and_buyer_preparation',async()=>{
      const configured=await prepareFundingMerchant(workspace,{reportId:published.id,origin:terms.origin,path:terms.path??'/funding-reports/'+published.id.toLowerCase(),payment:terms.payment});
      const repeat=await prepareFundingMerchant(workspace,{reportId:published.id,origin:terms.origin,path:terms.path??'/funding-reports/'+published.id.toLowerCase(),payment:terms.payment});
      requireThat(repeat.id===configured.id&&repeat.replayed===true,'ORIGINAL_MERCHANT_RECOVERY_CHANGED');
      const catalog=await fundingMerchantCatalog(workspace,configured.id);await retain('report-catalog.json',catalog.catalog);
      seller=await serveFundingMerchant(workspace,configured.id,{port:0});
      const challenge=await fetch(seller.url+new URL(configured.url).pathname),body=Buffer.from(await challenge.arrayBuffer());
      requireThat(challenge.status===402,'ORIGINAL_SELLER_CHALLENGE_EXPECTED');
      await retain('original-seller-challenge.json',{status:challenge.status,headers:Object.fromEntries(challenge.headers),bodyBase64:body.toString('base64'),mode:seller.mode});
      await seller.close();seller=null;
      const catalogBytes=await readFile(join(out,'report-catalog.json')),prepared=prepareReview(catalogBytes,{rowIndex:0,acceptIndex:0,intentId:'funding-report-64b7-'+published.sha256.slice(0,24),url:configured.url,method:'GET',responseOut:join(out,'buyer-report.funding-report.gz')});
      requireThat(prepared.draft.responseFile.expectedSha256===delivery.sha256&&prepared.draft.responseFile.expectedBytes===delivery.bytes,'ORIGINAL_BUYER_FILE_BINDING_CHANGED');
      const config=await retain('original-buyer-review.json',prepared.data);
      return {merchantId:configured.id,reportId:published.id,catalogSha256:catalog.sha256,assetSha256:delivery.sha256,challengeStatus:challenge.status,buyerConfig:config,originalIntentId:prepared.draft.operation.intentId};
    });
    await step('producer_backup',async()=>{
      workspace.tx(()=>workspace.db.prepare('DELETE FROM workspace_meta WHERE key=?').run(lease));
      const prior=await exists(join(out,'producer-workspace.json')),packet=prior?JSON.parse(prior):workspace.exportPacket();return retain('producer-workspace.json',packet);
    });
    await closeResearch();
    if(terms)await step('merchant_backup_and_restore',async()=>{
      const restored=new AwardWorkspace(join(out,'restored-producer'),{operator:'Restored report publisher'});
      let restoredSeller;
      try{
        if(restored.fundingReports.state().reports.length===0)restored.restorePacket(JSON.parse(await readFile(join(out,'producer-workspace.json'))));
        const original=journal.steps.original_merchant_and_buyer_preparation,catalog=await fundingMerchantCatalog(restored,original.merchantId),merchantState=restored.fundingReports.state().merchants.find(m=>m.id===original.merchantId);
        requireThat(merchantState.bundle.startsWith(join(restored.directory,'funding-merchants')+'/')&&merchantState.owner===null&&catalog.sha256===original.catalogSha256,'RESTORED_MERCHANT_BINDING_CHANGED');
        const replay=await prepareFundingMerchant(restored,{reportId:published.id,origin:terms.origin,path:terms.path??'/funding-reports/'+published.id.toLowerCase(),payment:terms.payment});
        requireThat(replay.replayed&&replay.bundle===merchantState.bundle,'RESTORED_MERCHANT_REPLAY_CHANGED');
        restoredSeller=await serveFundingMerchant(restored,original.merchantId,{port:0});
        const response=await fetch(restoredSeller.url+new URL(replay.url).pathname);requireThat(response.status===402,'RESTORED_MERCHANT_CHALLENGE_CHANGED');await response.arrayBuffer();
        return {merchantId:original.merchantId,catalogSha256:catalog.sha256,bundle:replay.bundle,attempts:replay.attempts,challengeStatus:response.status};
      }finally{if(restoredSeller)await restoredSeller.close();restored.close();}
    });
    await step('original_cli',async()=>{const current=await cli(['report-draft','--workspace',workspaceDir,'--report',published.id],{print:false});requireThat(current.sha256===published.sha256,'ORIGINAL_CLI_REPORT_CHANGED');return {reportId:current.id,sha256:current.sha256};});
    for(const name of ['customer','customer-exports'])await mkdir(join(out,name),{recursive:true,mode:0o700});
    const connectionPath=join(out,'customer-connection.json');
    await retain('customer-connection.json',{schema:'stellar-forge.usaspending-workspace-connection.v1',workspaces:{customer:{directory:join(out,'customer'),operator:'Funding report receiver',
      sources:{report:{kind:'funding-report',file:delivery.path,sha256:delivery.sha256}},...(buyer?{fundingReports:{inboxes:{original:{directory:buyer.inbox,receivingRoot:buyer.receivingRoot}}}}:{})}}});
    const start=async()=>{owner=new MerchantUSASpendingWorkspaces({usaSpendingWorkspaces:await readUSASpendingWorkspaceConfiguration(connectionPath),exportsDirectory:join(out,'customer-exports')});opened=await owner.call('merchant_usaspending_open',{workspace:'customer'});};
    const call=async(name,args={})=>{const result=await owner.call('merchant_usaspending_'+name,{workspace:'customer',...args});return Object.hasOwn(result,'native')?result.native:result;};
    const closeOwner=async()=>{if(owner){await call('close',{instanceId:opened.instanceId});await owner.close();owner=null;}};
    await start();
    const received=await step('native_customer_receiving',async()=>{const result=await call('source_import',{source:'report'}),draft=await call('report_draft',{reportId:result.id});requireThat(draft.sha256===published.sha256,'NATIVE_RECEIVED_REPORT_CHANGED');const repeat=await call('source_import',{source:'report'});requireThat(repeat.replayed===true,'ORIGINAL_REPORT_RECEIVING_REPLAY_CHANGED');return {reportId:result.id,deliveryId:result.deliveryId,sha256:draft.sha256};});
    const exported=await step('native_export',async()=>call('export',{kind:'funding-report-delivery',reportId:received.reportId,deliveryId:received.deliveryId}));
    await step('native_transfer_and_reopen',async()=>{
      const chunks=[];let offset=0,readId,reopened=false;
      do{
        const result=await call('file_read',{kind:exported.kind,exportId:exported.exportId,offset,limit:1024,...(readId?{readId}:{})}),bytes=Buffer.from(result.data,'base64');
        requireThat(result.offset===offset&&result.file.sha256===delivery.sha256&&result.bytesRead===bytes.length,'ORIGINAL_NATIVE_FILE_CHUNK_CHANGED');
        chunks.push(bytes);offset+=bytes.length;readId=result.readId;
        requireThat(result.nextOffset===(offset<delivery.bytes?offset:null),'ORIGINAL_NATIVE_FILE_SEQUENCE_CHANGED');
        if(!reopened&&offset<delivery.bytes){const previous=opened;await closeOwner();await start();requireThat(opened.workspaceId===previous.workspaceId&&opened.instanceId!==previous.instanceId,'ORIGINAL_CUSTOMER_REOPEN_CHANGED');readId=undefined;reopened=true;}
      }while(offset<delivery.bytes);
      const bytes=Buffer.concat(chunks);requireThat(bytes.length===delivery.bytes&&sha(bytes)===delivery.sha256,'COMPLETE_NATIVE_DELIVERY_CHANGED');
      if(readId)await call('file_release',{readId});return retain('native-received.funding-report.gz',bytes);
    });
    await step('customer_revision',async()=>{
      const original=await call('report_draft',{reportId:received.reportId});
      const revised=await call('report_prepare',{operationId:'REPORT-NATIVE-CUSTOMER-REVISION-64B7',sourceReportId:received.reportId,content:{...original.content,title:original.content.title+' — customer edition',implications:'Use the complete original source while preparing the receiving team’s implementation workshare.'}});
      const result=await call('report_publish',{reportId:revised.id,expectedSha256:revised.sha256});
      requireThat(result.previousReportSha256===published.sha256,'CUSTOMER_REVISION_SOURCE_CHANGED');return {reportId:result.id,sha256:result.sha256,previousReportSha256:result.previousReportSha256};
    });
    await step('native_full_file_receiving',async()=>call('report_extract',{reportId:received.reportId,name:'complete-original-report',deliveryId:received.deliveryId}));
    if(buyer)await step('original_buyer_response',async()=>call('report_buyer_adopt',{inbox:'original',intentId:buyer.intentId}));
    await closeOwner();
    await step('customer_backup_and_restore',async()=>{
      const customer=new AwardWorkspace(join(out,'customer'),{operator:'Funding report receiver'});
      let packet;
      try{const prior=await exists(join(out,'customer-workspace.json'));packet=prior?JSON.parse(prior):customer.exportPacket();await retain('customer-workspace.json',packet);}finally{customer.close();}
      const restored=new AwardWorkspace(join(out,'restored-customer'),{operator:'Restored funding report receiver'});
      try {
        if(restored.fundingReports.state().reports.length===0)restored.restorePacket(packet);
        const report=restored.fundingReports.get(received.reportId);requireThat(report.sha256===published.sha256&&sha(restored.fundingReports.export(received.reportId,{kind:'delivery',deliveryId:received.deliveryId}))===delivery.sha256,'RESTORED_REPORT_CHANGED');
        const extracted=await extractFundingReport(restored,{reportId:received.reportId,directory:join(out,'restored-report'),deliveryId:received.deliveryId});
        return {reportId:report.id,reports:restored.fundingReports.state().reports.length,receiptCount:report.receipts.length,extracted};
      }finally{restored.close();}
    });
    journal.completedAt??=new Date().toISOString();journal.currentStep=null;await save();
    const result={schema:'stellar-forge.funding-report-native-result.v1',operation:OPERATION,completedAt:journal.completedAt,source:sourceBinding,award:captured,report:published,delivery,steps:journal.steps};
    await retain('receiving-result.json',result);process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;
  } finally {
    if(seller)await seller.close();if(owner)await owner.close();
    try{workspace.tx(()=>{const current=workspace.db.prepare('SELECT value FROM workspace_meta WHERE key=?').get(lease);if(current&&canonical(JSON.parse(current.value))===canonical(leaseOwner))workspace.db.prepare('DELETE FROM workspace_meta WHERE key=?').run(lease);});}catch{}
    await closeResearch();
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)run(options(process.argv.slice(2))).catch(error=>{process.stderr.write(JSON.stringify({error:error.code??'FUNDING_REPORT_NATIVE_FAILED',message:error.message,stack:error.stack})+'\n');process.exitCode=1;});
