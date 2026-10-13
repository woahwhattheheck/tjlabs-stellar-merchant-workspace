// MIT. Original recorded customer review -> existing invoice agent -> cold artifacts.
import assert from 'node:assert/strict';
import {readFile,open} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createMerchantOperatorClient,MERCHANT_OPERATOR_CONNECTION_SCHEMA} from './operator-client.mjs';
import {readMerchantInvoiceConfiguration} from '../../stellar-forge/mcp-merchant-operator/merchant-invoice-connection.mjs';
import {MerchantInvoices} from '../../stellar-forge/mcp-merchant-operator/merchant-invoices.mjs';
import {parseWorkspace} from '../../stellar/scf-starforge-20261009/sf74-merchant-support-console/workspace-file.mjs';
import {merchantInvoiceTools} from '../../stellar-forge/mcp-merchant-operator/merchant-invoice-protocol.mjs';
import {receiveMerchantArtifact,verifyMerchantArtifact,saveMerchantReceiving as save,merchantReceivingDirectory as directory} from './project-agent-receiving.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex'),SCHEMA='stellar-forge.merchant-review-agent-receiving.v1';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const optional=async p=>{try{return await read(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const makeOwner=async path=>new MerchantInvoices({merchantInvoices:await readMerchantInvoiceConfiguration(path)});
const actions=['status','issue','document','source','receive','compare','decide','resume','return','support'];
async function inputs(root,expectedInvoices) {
 const folder=join(root,'customer-review-course'),course=await read(join(folder,'complete.json'));
 assert.deepEqual(course.invoices,expectedInvoices);
 const requests={},responses={},identities=[];
 for(const [action,name] of [['issue','issue'],['receive','return'],['decide','decision']]){
  for(const [kind,into] of [['request',requests],['result',responses]]){
   const path=join(folder,name+'-'+kind+'.json'),raw=await readFile(path);into[action]=JSON.parse(raw);
   const file={path,bytes:raw.length,sha256:hash(raw)};await verifyMerchantArtifact(path,file);identities.push(file);
  }
  assert.equal(requests[action].invoiceId,course.invoiceId);assert.equal(responses[action].invoiceId,course.invoiceId);
 }
 const recipient=await read(join(folder,'recipient-complete.json'));
 await verifyMerchantArtifact(recipient.path,{bytes:Buffer.byteLength(requests.receive.text),sha256:course.returnSha256});
 assert.equal(await readFile(recipient.path,'utf8'),requests.receive.text);
 for(const file of [...course.files,...course.images])await verifyMerchantArtifact(file.path,file);
 return {course,requests,responses,returnPath:recipient.path,identities};
}
/** The caller opens/stops its existing Application. All three requests already
 * belong to the complete original case; native request replay changes no rows. */
export async function receiveMerchantReviewAgent({opening,scenario,root,expectedInvoices,tokenEnvironment='MERCHANT_LOCAL_OPERATOR'}) {
 assert.equal(expectedInvoices.length,5);assert.equal(new Set(expectedInvoices).size,5);
 const original=await inputs(root,expectedInvoices),{course,requests,responses}=original;
 const folder=join(root,'customer-review-agent');await directory(folder);
 const complete=join(folder,'complete.json'),prior=await optional(complete);
 if(prior){await verifyMerchantReviewAgent(prior,{root,expectedInvoices});return prior;}
 const client=await createMerchantOperatorClient({url:opening.url,operatorToken:scenario.operatorToken,...course.owner});
 assert.deepEqual({storeId:client.connection.storeId,tenantId:client.connection.tenantId},course.owner);
 const before=await client.customerReviews(course.invoiceId);assert.equal(before.reviewVersion,course.reviewVersion);
 const invoices=await Promise.all(expectedInvoices.map(id=>client.inspectInvoice(id)));assert(invoices.every(x=>x.order.state==='COMPLETE'));
 const connection={schema:MERCHANT_OPERATOR_CONNECTION_SCHEMA,url:client.connection.url,...course.owner};
 const connectionFile=join(folder,'connection-'+hash(JSON.stringify(connection))+'.json'),saved=await save(connectionFile,connection);
 const exportsDirectory=join(folder,'artifacts'),receivedDirectory=join(folder,'received');await directory(exportsDirectory);await directory(receivedDirectory);
 const configuration=join(folder,'agent-'+saved.sha256+'.json');await save(configuration,{
  schema:'stellar-forge.merchant-invoice-agent.v1',merchants:{original:{
   label:'Original completed customer review',connectionFile,connectionSha256:saved.sha256,
   tokenEnvironment,exportsDirectory,reviewReturns:{original:{path:original.returnPath,name:'Original_Customer_Return.json',sha256:course.returnSha256}}}}});
 const old=process.env[tokenEnvironment];process.env[tokenEnvironment]=scenario.operatorToken;let owner;
 try {
  owner=await makeOwner(configuration);const artifacts=[],calls=[],results={};
  const call=async(kind,a={})=>{const v=(await owner.call('merchant_invoice_'+kind,{merchant:'original',invoiceId:course.invoiceId,...a})).native;
   calls.push(kind);for(const key of ['artifact','requestArtifact'])if(v[key])artifacts.push(v[key]);return v;};
  const catalogue=merchantInvoiceTools((name,description,properties,required,annotations)=>({name,description,properties,required,annotations}));
  assert.equal(catalogue.length,37);
  for(const action of actions){const t=catalogue.find(t=>t.name==='merchant_invoice_review_'+action);assert(t);assert.equal(t.annotations.openWorld,false);
   assert.equal(t.annotations.readOnly,!['issue','receive','decide','resume'].includes(action));}
  const status=await call('review_status');assert.equal(status.reviewVersion,course.reviewVersion);
  const source=await call('review_source',{reviewFile:'original',expectedReturnSha256:course.returnSha256});
  assert.equal(source.returnSha256,course.returnSha256);assert.equal(source.issueId,course.issueId);assert.equal(source.unfinishedReturnedDraft,true);
  for(const action of ['issue','receive','decide']){
   const body=requests[action],args=action==='receive'?{invoiceId:body.invoiceId,requestId:body.requestId,expectedReviewVersion:body.expectedReviewVersion,
    reviewFile:'original',expectedReturnSha256:course.returnSha256}:body;
   const value=await call('review_'+action,args);results[action]=value;
   const resumed=await call('review_resume',{action,requestId:body.requestId,expectedRequestSha256:value.requestArtifact.payload.sha256});
   assert.deepEqual(resumed,value);
   const expectedRequest=Buffer.from(JSON.stringify(body)+'\n');assert.equal(value.requestArtifact.payload.sha256,hash(expectedRequest));
   assert.equal(value.artifact.payload.sha256,hash(Buffer.from(JSON.stringify(responses[action])+'\n')));
  }
  const compared=await call('review_compare',{returnSha256:course.returnSha256});
  assert.equal(compared.invoiceChanged,false);assert.equal(compared.unfinishedReturnedDraft,true);
  assert(compared.editions.some(e=>e.sha256===requests.decide.editionSha256));
  const document=await call('review_document',{issueId:course.issueId});
  const issuedFile=course.files.find(file=>file.path===join(root,'customer-review-course','Customer_Review.html'));
  assert(issuedFile);assert.equal(document.artifact.payload.sha256,issuedFile.sha256);assert.equal(document.artifact.payload.bytes,issuedFile.bytes);
  const returned=await call('review_return',{returnSha256:course.returnSha256});assert.equal(returned.artifact.payload.sha256,course.returnSha256);
  const supportDownload=await call('review_support');
  const supportFile=course.files.find(file=>file.path===join(root,'customer-review-course','Merchant_Customer_Review_Support.json'));
  assert(supportFile);assert.equal(supportDownload.artifact.payload.sha256,supportFile.sha256);assert.equal(supportDownload.artifact.payload.bytes,supportFile.bytes);
  const after=await client.customerReviews(course.invoiceId);assert.deepEqual(after,before);
  assert.deepEqual(await Promise.all(expectedInvoices.map(id=>client.inspectInvoice(id))),invoices);
  const full=[],seen=new Set();
  for(const artifact of artifacts){if(seen.has(artifact.artifactId))continue;seen.add(artifact.artifactId);
   const file=await receiveMerchantArtifact(owner,artifact,join(receivedDirectory,artifact.artifactId+'.received'),
    {restart:artifact.kind==='review_support',prefix:'merchant_invoice_',selector:'merchant'});
   full.push({artifact,file});
  }
  assert(full.find(x=>x.artifact.kind==='review_support').file.reopenedRead);
  const exact=full.find(x=>x.artifact.kind==='review_return');assert.equal(await readFile(exact.file.path,'utf8'),requests.receive.text);
  const support=await parseWorkspace(await readFile(full.find(x=>x.artifact.kind==='review_support').file.path,'utf8'));
  assert.equal(support.customerReview.returns.find(r=>r.sha256===course.returnSha256).text,requests.receive.text);
  assert(support.customerReview.decisions.some(d=>d.requestId===requests.decide.requestId));
  for(const action of ['issue','receive','decide']){
   const actual=full.find(x=>x.artifact.artifactId===results[action].artifact.artifactId);
   assert.deepEqual(await read(actual.file.path),responses[action]);
  }
  const result={schema:SCHEMA,state:'COMPLETE',owner:course.owner,invoiceId:course.invoiceId,
   invoices:expectedInvoices,issueId:course.issueId,returnSha256:course.returnSha256,
   reviewVersion:course.reviewVersion,configuration,connectionSha256:saved.sha256,originalInputs:original.identities,
   requests:Object.fromEntries(Object.entries(results).map(([k,v])=>[k,{requestId:requests[k].requestId,
    artifactId:v.requestArtifact.artifactId,sha256:v.requestArtifact.payload.sha256}])),
   tools:catalogue.map(t=>t.name),calls,artifacts:full,recordedMutation:'ORIGINAL_REQUEST_REPLAY_ONLY'};
  await owner.close();owner=null;await save(complete,result);return result;
 } finally {try{if(owner)await owner.close();}finally{if(old===undefined)delete process.env[tokenEnvironment];else process.env[tokenEnvironment]=old;}}
}
/** Call after the existing Application has stopped. No client/server or token is used. */
export async function verifyMerchantReviewAgent(result,{root,expectedInvoices}) {
 assert.equal(result.schema,SCHEMA);assert.equal(result.state,'COMPLETE');assert.deepEqual(result.invoices,expectedInvoices);
 const original=await inputs(root,expectedInvoices);assert.deepEqual(result.owner,original.course.owner);
 for(const key of ['invoiceId','issueId','returnSha256','reviewVersion'])assert.equal(result[key],original.course[key]);
 assert.equal(result.recordedMutation,'ORIGINAL_REQUEST_REPLAY_ONLY');assert.equal(result.tools.length,37);
 for(const file of result.originalInputs)await verifyMerchantArtifact(file.path,file);
 for(const action of ['issue','receive','decide']){
  assert.equal(result.requests[action].requestId,original.requests[action].requestId);
  assert.equal(result.requests[action].sha256,hash(Buffer.from(JSON.stringify(original.requests[action])+'\n')));
 }
 for(const item of result.artifacts)await verifyMerchantArtifact(item.file.path,item.artifact.payload);
 const owner=await makeOwner(result.configuration);
 try{
  let after='',listed=[];do{const page=(await owner.call('merchant_invoice_artifacts',{merchant:'original',limit:10,...(after?{after}:{})})).native;
   listed.push(...page.artifacts);after=page.nextAfter;}while(after!==null);
  for(const item of result.artifacts){
   assert(listed.some(v=>v.artifactId===item.artifact.artifactId));
   const chunk=(await owner.call('merchant_invoice_file',{merchant:'original',artifactId:item.artifact.artifactId,
    expectedSha256:item.artifact.payload.sha256,limit:31})).native;
   const handle=await open(item.file.path,'r'),bytes=Buffer.alloc(chunk.bytesRead);
   try{assert.equal((await handle.read(bytes,0,bytes.length,0)).bytesRead,bytes.length);}finally{await handle.close();}
   assert.deepEqual(Buffer.from(chunk.data,'base64'),bytes);
   if(chunk.nextOffset!==null)await owner.call('merchant_invoice_file_release',{merchant:'original',readId:chunk.readId});
  }
  return {state:'ORIGINAL_CUSTOMER_REVIEW_ARTIFACTS_REOPENED',invoiceId:result.invoiceId,artifacts:result.artifacts.length};
 }finally{await owner.close();}
}
