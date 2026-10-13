// MIT. Original five-invoice live import -> shared browser export -> Applications handover.
import assert from 'node:assert/strict';
import {readFile,open} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inspectMerchantOperator,createMerchantOperatorClient,MERCHANT_OPERATOR_CONNECTION_SCHEMA} from './operator-client.mjs';
import {readMerchantInvoiceConfiguration} from '../../stellar-forge/mcp-merchant-operator/merchant-invoice-connection.mjs';
import {MerchantInvoices} from '../../stellar-forge/mcp-merchant-operator/merchant-invoices.mjs';
import {merchantInvoiceTools} from '../../stellar-forge/mcp-merchant-operator/merchant-invoice-protocol.mjs';
import {receiveMerchantArtifact,verifyMerchantArtifact,saveMerchantReceiving as save,merchantReceivingDirectory as directory} from './project-agent-receiving.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const optional=async path=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}};
async function ownerAt(path) {
 return new MerchantInvoices({merchantInvoices:await readMerchantInvoiceConfiguration(path)});
}
async function completeArtifacts(owner,root,artifacts) {
 await directory(root);const out=[],seen=new Set();
 for(const artifact of artifacts) {
  if(seen.has(artifact.artifactId))continue;seen.add(artifact.artifactId);
  const received=await receiveMerchantArtifact(owner,artifact,join(root,artifact.artifactId+'.received'),
   {restart:artifact.kind==='intake-plan',prefix:'merchant_invoice_',selector:'merchant'});
  out.push({artifact,file:received});
 }
 return out;
}
/** Caller retains Applications/browser ownership. The original browser and agent
 * select the SAME complete project operation and its whole source snapshot. */
export async function receiveMerchantInvoiceAgent({url,operatorToken,tokenEnvironment,directory:root,
 expectedInvoices,originalAuthorizations,operation,projectOperation,exportProject}) {
 assert.equal(new Set(expectedInvoices).size,5);assert.equal(expectedInvoices.length,5);
 assert(originalAuthorizations&&typeof originalAuthorizations==='object');
 assert.deepEqual(Object.keys(originalAuthorizations).sort(),[...expectedInvoices].sort());
 for(const invoiceId of expectedInvoices) {
  const original=originalAuthorizations[invoiceId];
  assert.equal(typeof original.paymentSignature,'string');
  assert(/^[\x21-\x7e]{1,65536}$/.test(original.paymentSignature));
  assert.equal(hash(Buffer.from(original.paymentSignature)),original.sha256);
 }
 assert(/^[A-Z][A-Z0-9_]{0,127}$/.test(tokenEnvironment));assert.equal(typeof exportProject,'function');
 await directory(root);await directory(join(root,'artifacts'));await directory(join(root,'received'));
 const inspected=await inspectMerchantOperator({url,operatorToken});
 assert.equal(inspected.mode,'live');
 const client=await createMerchantOperatorClient({...inspected,operatorToken});
 const connection={schema:MERCHANT_OPERATOR_CONNECTION_SCHEMA,url:client.connection.url,
  storeId:client.connection.storeId,tenantId:client.connection.tenantId};
 const connectionPath=join(root,'connection-'+hash(JSON.stringify(connection))+'.json');
 const savedConnection=await save(connectionPath,connection);
 const configuration=join(root,'agent-'+savedConnection.sha256+'.json');
 await save(configuration,{schema:'stellar-forge.merchant-invoice-agent.v1',merchants:{original:{
  label:'Original five-invoice live owner',connectionFile:connectionPath,connectionSha256:savedConnection.sha256,
  tokenEnvironment,exportsDirectory:join(root,'artifacts')}}});
 const previous=process.env[tokenEnvironment];process.env[tokenEnvironment]=operatorToken;
 let owner;
 try {
  owner=await ownerAt(configuration);const artifacts=[],calls=[];
  async function call(kind,args={}) {
   const v=await owner.call('merchant_invoice_'+kind,{merchant:'original',...args});calls.push(kind);
   if(v.native.artifact)artifacts.push(v.native.artifact);
   if(v.native.requestArtifact)artifacts.push(v.native.requestArtifact);
   if(v.native.envelopeArtifact)artifacts.push(v.native.envelopeArtifact);
   return v.native;
  }
  const catalogue=merchantInvoiceTools((name,description,properties,required,annotations)=>({name,description,properties,required,annotations}));
  assert.equal(catalogue.length,27);
  for(const action of ['charge','authorize','reconcile','resume_payment']) {
   const tool=catalogue.find(v=>v.name==='merchant_invoice_'+action);
   assert.equal(tool.annotations.readOnly,false);assert.equal(tool.annotations.openWorld,true);
  }
  const merchants=await owner.call('merchant_invoice_merchants',{});assert.equal(merchants.merchants.length,1);
  const context=await call('context'),register=await call('register',{limit:200});
  assert.equal(register.orders.length,5);
  assert.deepEqual(register.orders.map(v=>v.id).sort(),[...expectedInvoices].sort());
  assert(register.orders.every(v=>v.state==='COMPLETE'));
  const originalIntent=join(root,'original-intake.json');
  let intent=await optional(originalIntent);
  if(!intent) {
   const rows=register.orders.flatMap(invoice=>invoice.offers.map(offer=>({
    key:invoice.id,invoiceId:invoice.id,reference:invoice.reference,title:invoice.title,
    assetId:offer.assetId,amountAtomic:offer.amountAtomic})));
   intent={operation,projectOperation,storeId:connection.storeId,tenantId:connection.tenantId,
    configurationSha256:context.configurationSha256,source:{name:'Original_Completed_Invoices.json',format:'json',text:JSON.stringify(rows)+'\n'},
    mapping:{key:'key',invoiceId:'invoiceId',reference:'reference',title:'title',assetId:'assetId',amount:'amountAtomic',amountMode:'atomic'}};
   await save(originalIntent,intent);
  }
  assert.equal(intent.operation,operation);assert.equal(intent.projectOperation,projectOperation);
  assert.equal(intent.storeId,connection.storeId);assert.equal(intent.tenantId,connection.tenantId);
  const source=await call('source',{source:intent.source});
  assert.equal(source.source.sha256,hash(Buffer.from(intent.source.text)));
  const prepared=await call('prepare',{operation,configurationSha256:intent.configurationSha256,
   sourceSha256:source.source.sha256,source:intent.source,mapping:intent.mapping});
  const observed=await call('status',{operation});assert.equal(observed.planSha256,prepared.planSha256);
  // Explicit native replay of the saved original request exercises response
  // recovery without pretending a transport failure actually occurred.
  const resumed=await call('resume_prepare',{operation,expectedRequestSha256:prepared.requestArtifact.payload.sha256});
  assert.equal(resumed.planSha256,prepared.planSha256);
  const plan=await call('plan',{operation});
  const originalPlan=await client.exportIntake(operation);
  assert.equal(originalPlan.plan.source.text,intent.source.text);
  assert.deepEqual(originalPlan.plan.mapping,intent.mapping);
  assert.deepEqual(originalPlan.plan.invoices.map(v=>v.id).sort(),[...expectedInvoices].sort());
  assert.equal(plan.planSha256,originalPlan.plan.planSha256);
  const run=await call('run',{operation,expectedPlanSha256:plan.planSha256});
  assert.equal(run.state,'COMPLETE');assert.equal(run.counts.retained,5);
  assert.equal(run.counts.pending,0);assert.equal(run.counts.conflicts,0);
  assert.equal((await call('run',{operation,expectedPlanSha256:plan.planSha256})).planSha256,plan.planSha256);
  const list=await call('intakes',{limit:50});assert(list.intakes.some(v=>v.operation===operation));
  const payments=[];
  for(const invoiceId of expectedInvoices) {
   assert.equal((await call('invoice',{invoiceId})).invoice.state,'COMPLETE');
   const before=await call('payment',{invoiceId});
   assert.equal(before.state,'COMPLETE');assert(before.chargeId);
   assert.equal(before.envelopeSha256,before.envelopeArtifact.payload.sha256);
   const actions=[];
   for(const action of ['charge','authorize','reconcile']) {
    const result=await call(action,{invoiceId,...(action==='authorize'?{
     expectedEnvelopeSha256:before.envelopeSha256,
     paymentSignature:originalAuthorizations[invoiceId].paymentSignature}:{})});
    assert.equal(result.state,'COMPLETE');assert.equal(result.chargeId,before.chargeId);
    assert.equal(result.paymentId,before.paymentId);assert.deepEqual(result.result,before.result);
    const replay=await call('resume_payment',{invoiceId,action,
     expectedRequestSha256:result.requestArtifact.payload.sha256});
    assert.equal(replay.requestArtifact.artifactId,result.requestArtifact.artifactId);
    assert.equal(replay.state,'COMPLETE');assert.equal(replay.chargeId,before.chargeId);
    assert.equal(replay.paymentId,before.paymentId);assert.deepEqual(replay.result,before.result);
    actions.push({action,requestArtifact:result.requestArtifact.artifactId,
     requestSha256:result.requestArtifact.payload.sha256,outcomeArtifact:result.artifact.artifactId});
   }
   const after=await call('payment',{invoiceId});
   assert.equal(after.envelopeSha256,before.envelopeSha256);
   assert.equal(after.chargeId,before.chargeId);assert.deepEqual(after.result,before.result);
   payments.push({invoiceId,state:after.state,chargeId:after.chargeId,paymentId:after.paymentId,
    originalAuthorizationSha256:originalAuthorizations[invoiceId].sha256,
    envelopeSha256:after.envelopeSha256,actions});
   await call('envelope',{invoiceId});await call('result',{invoiceId});
  }
  const reviewed=await call('register',{limit:200});
  for(const format of ['json','csv'])
   await call('register_export',{selection:reviewed.selection,revision:reviewed.source.revision,format});
  await call('project');
  // This original browser performs the actual export and returns its identity.
  const browser=await exportProject();
  assert.equal(browser.project.operation,projectOperation);
  const project=await call('project_begin',{operation:projectOperation});
  assert.equal(project.state,'COMPLETE');
  assert.equal((await call('project_status',{operation:projectOperation})).state,'COMPLETE');
  await call('project_manifest',{operation:projectOperation});
  const archive=await call('project_download',{operation:projectOperation});
  assert.equal(archive.artifact.payload.sha256,browser.project.archive.sha256);
  assert.equal(archive.artifact.payload.bytes,browser.project.archive.bytes);
  const full=await completeArtifacts(owner,join(root,'received'),artifacts);
  assert(full.some(v=>v.artifact.kind==='intake-plan'&&v.file.reopenedRead));
  let after='',listed=[];
  do{const page=await call('artifacts',{limit:10,...(after?{after}:{})});listed.push(...page.artifacts);
   after=page.nextAfter;}while(after!==null);
  for(const original of full)assert(listed.some(v=>v.artifactId===original.artifact.artifactId));
  const result={schema:'stellar-forge.merchant-invoice-agent-receiving.v1',state:'COMPLETE',
   operation,projectOperation,storeId:connection.storeId,tenantId:connection.tenantId,
   originalInvoices:[...expectedInvoices].sort(),planSha256:plan.planSha256,
   sourceSha256:source.source.sha256,configuration,connectionSha256:savedConnection.sha256,
   artifacts:full,payments,tools:catalogue.map(v=>v.name),calls};
  await save(join(root,'complete-'+savedConnection.sha256+'.json'),result);
  return {browser,receiving:result};
 } finally {try{if(owner)await owner.close();}finally{
  if(previous===undefined)delete process.env[tokenEnvironment];else process.env[tokenEnvironment]=previous;}}
}
/** Called after actual Applications stop. It loads original private artifacts
 * without needing the live server or an operator credential. */
export async function verifyMerchantInvoiceAgent(result,{expectedInvoices,operation,projectOperation}={}) {
 assert.equal(result.schema,'stellar-forge.merchant-invoice-agent-receiving.v1');assert.equal(result.state,'COMPLETE');
 assert.equal(result.operation,operation);assert.equal(result.projectOperation,projectOperation);
 assert.deepEqual(result.originalInvoices,[...expectedInvoices].sort());
 // Older completed source courses retain their exact result. New payment
 // courses must carry every original invoice and three retained action pairs.
 if(result.payments) {
  assert.deepEqual(result.payments.map(v=>v.invoiceId).sort(),[...expectedInvoices].sort());
  assert.equal(result.tools.length,27);
  for(const invoice of result.payments) {
   assert.equal(invoice.state,'COMPLETE');
   assert.deepEqual(invoice.actions.map(v=>v.action),['charge','authorize','reconcile']);
   assert(/^[a-f0-9]{64}$/.test(invoice.originalAuthorizationSha256));
   for(const action of invoice.actions)assert(result.artifacts.some(v=>
    v.artifact.artifactId===action.requestArtifact&&v.artifact.payload.sha256===action.requestSha256));
  }
 }
 for(const item of result.artifacts)await verifyMerchantArtifact(item.file.path,item.artifact.payload);
 const owner=await ownerAt(result.configuration);
 try {
  let after='',listed=[];
  do{const page=(await owner.call('merchant_invoice_artifacts',{merchant:'original',limit:10,...(after?{after}:{})})).native;
   listed.push(...page.artifacts);after=page.nextAfter;}while(after!==null);
  for(const item of result.artifacts) {
   assert(listed.some(v=>v.artifactId===item.artifact.artifactId));
   const chunk=(await owner.call('merchant_invoice_file',{merchant:'original',artifactId:item.artifact.artifactId,
    expectedSha256:item.artifact.payload.sha256,limit:31})).native;
   assert.equal(chunk.file.sha256,item.artifact.payload.sha256);
   const handle=await open(item.file.path,'r'),expected=Buffer.alloc(chunk.bytesRead);
   try{const read=await handle.read(expected,0,expected.length,0);assert.equal(read.bytesRead,expected.length);}
   finally{await handle.close();}
   assert.deepEqual(Buffer.from(chunk.data,'base64'),expected);
   if(chunk.nextOffset!==null)await owner.call('merchant_invoice_file_release',{merchant:'original',readId:chunk.readId});
  }
  return {state:'ORIGINAL_ARTIFACTS_REOPENED',operation,projectOperation,artifacts:result.artifacts.length};
 } finally {await owner.close();}
}
