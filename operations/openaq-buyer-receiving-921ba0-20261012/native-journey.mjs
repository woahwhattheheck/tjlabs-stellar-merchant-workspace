// MIT. Complete original OpenAQ -> SF88 -> SF100 customer receiving.
import {readFile,writeFile,appendFile,mkdir,stat,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]),source=resolve(process.argv[3]),python=process.argv[4];
const base=join(source,'stellar/scf-starforge-20261009');
const mod=path=>import(pathToFileURL(join(base,path)).href);
const {openOpenAQWorkspace}=await mod('sf30-seller-sdk/openaq/workspace.mjs');
const {startOpenAQServer}=await mod('sf30-seller-sdk/openaq/server.mjs');
const {inspectOpenAQSource}=await mod('sf30-seller-sdk/openaq/managed.mjs');
const {openDatasetVersions}=await mod('sf30-seller-sdk/dataset-refresh/versions.mjs');
const {initializeWorkspace}=await mod('sf88-operator-buyer-cli/workspace.mjs');
const {checkOperatorChannel}=await mod('sf81-buyer-operator-bridge/bridge.mjs');
const api=await mod('sf88-operator-buyer-cli/openaq-study/index.mjs');
const {withOwner,retainJson,retained,bytes,digest,directory}=await mod('sf88-operator-buyer-cli/openaq-study/files.mjs');
const ids={receive:'a9d0e909-b620-4d77-998d-fd9e4f1f1439',prepare:'934a5f63-745a-4311-947f-08af0dd91e9f',
 review:'0a20231b-f362-41e3-beb4-cd6f090a8491',publish:'c1bccf35-ef97-4071-95f3-2f2f6f7a7dd1',
 release:'d2e115f4-fb42-4142-8f1f-1f4a26ff712c',stage:'96b78d3b-fb5d-4e6a-bafc-ecc4d1ddf89e',export:'4ee799f6-7864-408c-b3b0-7cc512437aa3'};
const capture='142e4ed4-b38c-4013-8718-d3050765ee66',review='d12ca7d5-edec-4496-9b41-c3c588167ceb',report='b674c1dc-dacc-407f-92a3-7f4c851baebc';
const intent='openaq-native-921ba0-20261012',origin='https://openaq-native.example';
const input=join(base,'sf30-seller-sdk/openaq/examples/completed-del-norte/study.tgz');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const exists=async path=>stat(path).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
const abort=new AbortController();let requestedSignal;
for(const name of ['SIGINT','SIGTERM'])process.on(name,()=>{requestedSignal=name;abort.abort(new Error(name));});
const phases=[];
function fail(code,details){throw Object.assign(new Error(code),{code,details});}
async function phase(name,data){const row={name,completedAt:new Date().toISOString(),...data};await retainJson(join(root,'phases',name+'.json'),row).catch(async e=>{
 const prior=await read(join(root,'phases',name+'.json'));if(prior.name!==name)throw e;return prior;});phases.push(row);console.log(JSON.stringify({phase:name,...data}));}
let project,app,versions,broker,tls,proxy,tlsClosing,proxyClosing;
const sockets=new Set(),proxySockets=new Set(),active=new Set();
let requests=0,sourceCalls=0;
const stopServer=(server,connections)=>new Promise((ok,bad)=>{if(!server)return ok();server.close(e=>e?bad(e):ok());server.closeIdleConnections?.();for(const s of connections)s.destroy();});
async function closeAll(){
 const errors=[];
 for(const[name,close]of [
  ['proxy',async()=>{if(proxy)await(proxyClosing??=stopServer(proxy,proxySockets));}],
  ['tls',async()=>{if(tls)await(tlsClosing??=stopServer(tls,sockets));await Promise.allSettled([...active]);}],
  ['versions',async()=>{if(versions){const current=versions;versions=null;await current.close();}}],
  ['app',async()=>{if(app){await app.close();app=null;}}],
  ['project',async()=>{if(project){await project.close();project=null;}}],
  ['broker',async()=>{if(broker){const current=broker;broker=null;await current.close();}}],
 ])try{await close();}catch(e){errors.push(Object.assign(e,{owner:name}));}
 if(errors.length)throw new AggregateError(errors,'Original owner drain failed');
}
const listen=(server,port)=>new Promise((ok,bad)=>{server.once('error',bad);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',bad);ok(server.address().port);});});
await directory(root,{create:true});await directory(join(root,'phases'),{create:true});
await withOwner(root,async()=>{
 await retainJson(join(root,'request.json'),{schema:'stellar-forge.openaq-buyer-native-receiving.v1',operation:intent,
  sourceCommit:'c7ac4399e3bb419fafd42395841bace7d089036a',sourceDirectory:source,ids,sourceStudySha256:'9fcc10bd1c91816c51c790a45d6f6aa76053ea375092ff5a802c655a19acc0b6',
  originalCapture:capture,originalReview:review,originalReport:report,mode:'ORIGINAL_UNSIGNED_HTTP200_NO_PAYMENT_REQUIRED'});
 if(await exists(join(root,'NATIVE_RESULT.json'))){console.log(JSON.stringify({reopened:true,result:await read(join(root,'NATIVE_RESULT.json'))}));return;}
 try{
  assert.equal(digest(await readFile(input)),'9fcc10bd1c91816c51c790a45d6f6aa76053ea375092ff5a802c655a19acc0b6');
  const projectRoot=join(root,'project');
  project=await openOpenAQWorkspace({directory:projectRoot,create:!await exists(join(projectRoot,'workspace.json')),
   config:{schema:'stellar-forge.openaq-study.v1',project:{name:'Del Norte original Buyer receiving',customer:'SCF original source-native programme',
    purpose:'Receive the historical reviewed study through the unchanged Dataset Buyer and independently reopen complete original output.'}},
   fetchImpl:async()=>{sourceCalls++;fail('UNEXPECTED_OPENAQ_CAPTURE');}});
  async function action(kind,id,body){
   const accepted=await project.start(kind,{...body,workspaceId:project.id,requestId:id});
   if(['FAILED','INTERRUPTED','PREPARED'].includes(accepted.state))await project.resume({workspaceId:project.id,requestId:id});
   const result=await project.wait(id);if(result.state!=='COMPLETE')fail('ORIGINAL_OPENAQ_OPERATION_'+result.state,{kind,id,error:result.error});
   return result.result;
  }
  await action('receive',ids.receive,{archivePath:input,sha256:'9fcc10bd1c91816c51c790a45d6f6aa76053ea375092ff5a802c655a19acc0b6'});
  const original=await project.read('capture',{id:capture});assert.equal(original.projection.rows,140);
  await phase('01_ORIGINAL_REVIEWED_STUDY',{rows:original.projection.rows,captureId:capture,sourceReviewId:review,providerCalls:sourceCalls});
  const prepared=await action('publication.prepare',ids.prepare,{captureId:capture,sourceReviewId:review});
  const reviewed=await action('publication.review',ids.review,{captureId:capture,sourceReviewId:review,runId:ids.prepare,
   reviewer:'SCF original source-native receiving',note:'The retained source review and 140 historical measurement rows are preserved with their original units and provenance.',initialize:true});
  const publication=await action('publication.publish',ids.publish,{captureId:capture,sourceReviewId:review,runId:ids.prepare,publicationReviewId:reviewed.data.review.id});
  assert.equal(publication.state,'PUBLISHED');
  const payment={scheme:'exact',network:'stellar:testnet',asset:'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
   amount:'1',payTo:'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',maxTimeoutSeconds:60};
  const release=await action('release.prepare',ids.release,{captureId:capture,sourceReviewId:review,runId:ids.prepare,payment,origin,path:'/data'});
  const staged=await action('release.stage',ids.stage,{preparationId:ids.release,id:'openaq-921ba0-source-native',label:'Original historical Del Norte study',runtime:{port:0}});
  assert.equal(staged.mode,'CHALLENGE_ONLY');
  const exportedStudy=await action('export',ids.export,{captureIds:[capture],reviewIds:[review],reportIds:[report]});
  await phase('02_ORIGINAL_PUBLICATION_STAGE_EXPORT',{publicationId:ids.prepare,releaseId:staged.id,releaseDigest:staged.digest,snapshot:staged.dataset.baselineSnapshot,rows:staged.dataset.rowCount,studySha256:exportedStudy.sha256});
  const selectedSource=await inspectOpenAQSource();
  app=await startOpenAQServer({workspace:project,port:0,sourceIdentity:selectedSource,connectionFile:join(root,'project-connection.json'),ownsWorkspace:false});
  const handed=await api.prepareOpenAQBuyerHandoff({projectDirectory:projectRoot,stageRequestId:ids.stage,exportRequestId:ids.export,
   expectedReleaseDigest:staged.digest,directory:join(root,'handoff'),connectionFile:join(root,'project-connection.json'),signal:abort.signal});
  assert.equal(handed.handoff.capture.rows,140);assert.equal(handed.handoff.sourceReview.id,review);
  await phase('03_AUTHENTICATED_SOURCE_HANDOFF',{handoffSha256:handed.handoffSha256,studySha256:handed.handoff.study.sha256,files:handed.files});
  // Retire the original publisher before its one versioned Dataset reader opens.
  await app.close();app=null;await project.close();project=null;
  assert.equal(typeof release.binding.datasetDirectory,'string');
  versions=await openDatasetVersions({directory:release.binding.datasetDirectory});
  if(await exists(join(root,'http-requests.jsonl')))requests=(await readFile(join(root,'http-requests.jsonl'),'utf8')).trim().split('\n').filter(Boolean).length;
  const nativeHandler=versions.wrapRequest(async(req,res)=>{
   const pending=(async()=>{
    const url=new URL(req.url,origin),context={method:req.method,url:url.href,query:Object.fromEntries(url.searchParams),headers:req.headers};
    if(req.method!=='GET'||url.pathname!=='/data')return res.writeHead(404).end();
    requests++;await appendFile(join(root,'http-requests.jsonl'),JSON.stringify({sequence:requests,method:req.method,url:url.href,observedAt:new Date().toISOString()})+'\n',{mode:0o600});const admitted=await versions.admit(context);const result=admitted??await versions.handle(context);
    const body=Buffer.from(typeof result.body==='string'?result.body:JSON.stringify(result.body));
    res.writeHead(result.status??200,{...result.headers,'Content-Type':'application/json','Content-Length':String(body.length)});
    res.end(body);
   })();active.add(pending);try{await pending;}catch(e){res.destroy(e);}finally{active.delete(pending);}
  });
  tls=https.createServer({key:await readFile(join(root,'tls/key.pem')),cert:await readFile(join(root,'tls/cert.pem'))},nativeHandler);
  tls.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
  const oldPorts=await exists(join(root,'ports.json'))?await read(join(root,'ports.json')):null;
  const tlsPort=await listen(tls,oldPorts?.tlsPort??0);
  proxy=http.createServer((req,res)=>res.writeHead(405).end());
  proxy.on('connect',(req,client,head)=>{
   if(req.url!=='openaq-native.example:443'){client.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
   proxySockets.add(client);client.on('close',()=>proxySockets.delete(client));
   const upstream=net.connect({host:'127.0.0.1',port:tlsPort},()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);});
   proxySockets.add(upstream);upstream.on('close',()=>proxySockets.delete(upstream));
   client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy());
  });
  const proxyPort=await listen(proxy,oldPorts?.proxyPort??0);await retainJson(join(root,'ports.json'),{tlsPort,proxyPort,origin});
  const env={...process.env};
  assert.equal(env.SF81_APPROVAL_SOCKET,undefined);assert.equal(env.SF81_APPROVAL_TOKEN,undefined);
  await checkOperatorChannel(intent,{environment:env});
  const draft=api.prepareOpenAQDatasetRequest(handed.handoff,{intentId:intent,acceptIndex:0,query:'limit=50'});
  await retained(join(root,'reviewed-request.json'),draft.data);
  await retained(join(root,'unsigned-signing-custody.mjs'),Buffer.from("export async function createSigner(){throw new Error('UNEXPECTED_SIGNING_REQUEST');}\n"));
  const operatorDirectory=join(root,'operator');
  await initializeWorkspace(['--config',join(root,'reviewed-request.json'),'--dir',operatorDirectory,'--actor','921ba0-source-native',
   '--service','openaq-original-study','--payer',payment.payTo,'--python',python,'--signer-provider',join(root,'unsigned-signing-custody.mjs'),
   '--https-proxy','http://127.0.0.1:'+proxyPort,'--total-atomic','3','--daily-atomic','3'],
   {environment:env,resume:await exists(operatorDirectory)});
  const customer=join(root,'customer');
  const selection={directory:customer,handoffDirectory:handed.directory,handoffSha256:handed.handoffSha256,operatorDirectory,
   intentId:intent,acceptIndex:0,query:'limit=50',maxPages:3,maxTotalAtomic:'3',maxRows:140,maxPageBytes:1048576,resumePreparation:true};
  const ready=await api.prepareOpenAQBuyer(selection);const reopened=await api.prepareOpenAQBuyer(selection);
  assert.equal(reopened.requestSha256,ready.requestSha256);assert.equal(reopened.sessionDirectory,ready.sessionDirectory);
  await phase('04_ORIGINAL_BUYER_PREPARATION',{requestSha256:ready.requestSha256,configurationSha256:ready.configurationSha256,sessionDirectory:ready.sessionDirectory});
  const native=await api.runOpenAQBuyer({directory:customer,environment:env,signal:abort.signal});
  assert.equal(native.status,'COMPLETE');assert.equal(native.completedPages,3);assert.equal(native.acquiredRows,140);assert.equal(native.snapshot,staged.dataset.baselineSnapshot);
  const before=requests,replay=await api.runOpenAQBuyer({directory:customer,environment:env,signal:abort.signal});
  assert.equal(replay.configurationSha256,native.configurationSha256);assert.equal(requests,before);
  await phase('05_ORIGINAL_UNSIGNED_HTTP_PAGES',{status:native.status,pages:native.completedPages,rows:native.acquiredRows,httpRequests:requests,replayAdditionalRequests:requests-before,
   snapshot:native.snapshot,pageIds:native.pages.map(p=>p.intentId)});
  const accounting=await api.accountOpenAQBuyer({directory:customer,signal:abort.signal});
  await retainJson(join(root,'original-accounting.json'),accounting);
  assert.equal(accounting.entries.length,3);
  assert.equal(sourceCalls,0);
  await phase('06_ORIGINAL_ACCOUNTING',{mode:accounting.mode,entries:accounting.entries,providerCalls:sourceCalls,paymentApprovals:0});
  const delivery=await api.exportOpenAQBuyerDelivery({directory:customer,destination:join(root,'delivery'),exportId:'del-norte-original-921ba0',python,environment:env,signal:abort.signal});
  const typed=await api.openOpenAQBuyerDataset({directory:delivery.directory,manifestSha256:delivery.manifestSha256});
  const rows=await typed.readRows({maxRows:140});assert.equal(rows.length,140);assert.equal(rows.filter(r=>r.parameter==='pm25').length,22);
  await phase('07_COMPLETE_SOURCE_SESSION_OUTPUT',{manifestSha256:delivery.manifestSha256,files:delivery.manifest.files,rows:rows.length,pm25Rows:22});
  await closeAll();const closedRequests=requests;
  const received=await api.receiveOpenAQBuyerDelivery({sourceDirectory:delivery.directory,manifestSha256:delivery.manifestSha256,
   directory:join(root,'receiving'),receivingId:'del-norte-independent-921ba0',python,signal:abort.signal});
  // Original received files and native relocated session reopen with the source server closed.
  const again=await api.reopenOpenAQBuyerDelivery({directory:received.directory,python,signal:abort.signal});
  assert.equal(again.requestSha256,ready.requestSha256);assert.equal(again.session.session.acquiredRows,140);assert.equal(requests,closedRequests);
  const offline=await api.openOpenAQBuyerDataset({directory:join(received.directory,'files'),manifestSha256:delivery.manifestSha256});
  assert.equal((await offline.readRows({maxRows:140})).length,140);
  await phase('08_INDEPENDENT_RECEIVE_COLD_REOPEN',{state:again.state,requestSha256:again.requestSha256,manifestSha256:again.manifestSha256,
   originalSessionId:again.session.session.sessionId,rows:again.session.session.acquiredRows,additionalHttpRequests:requests-closedRequests});
  const result={schema:'stellar-forge.openaq-buyer-native-receiving.v1',state:'COMPLETE',operation:intent,sourceCommit:'c7ac4399e3bb419fafd42395841bace7d089036a',
   completedAt:new Date().toISOString(),node:process.version,mode:'NO_PAYMENT_REQUIRED',providerCalls:sourceCalls,httpRequests:requests,
   paymentApprovals:0,settlements:0,rows:140,pages:3,phases,allOwnersRetired:true,delivery:delivery.directory,receiving:received.directory,manifestSha256:delivery.manifestSha256};
  await retainJson(join(root,'NATIVE_RESULT.json'),result);console.log(JSON.stringify(result));
 }catch(error){
  try{await closeAll();}catch(close){error.closeError={message:close.message,errors:close.errors?.map(e=>({message:e.message,owner:e.owner}))};}
  await writeFile(join(root,'last-error.json'),JSON.stringify({code:error.code,message:error.message,details:error.details,stack:error.stack,closeError:error.closeError,requestedSignal},null,2)+'\n',{mode:0o600});
  throw error;
 }
},{create:true});
