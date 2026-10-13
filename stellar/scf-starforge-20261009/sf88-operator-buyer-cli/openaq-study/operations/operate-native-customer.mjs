// SPDX-License-Identifier: MIT
// Complete native TESTNET customer operation over the retained OpenAQ study.
// All payment, approval, accounting and archive state belongs to the original modules.
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile,writeFile,mkdir,rename,stat,readdir,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const root=resolve(process.argv[2]),source=resolve(process.argv[3]),python=process.argv[4],chrome=process.argv[5];
const base=join(source,'stellar/scf-starforge-20261009');
const mod=p=>import(pathToFileURL(join(base,p)).href);
const require=createRequire(join(source,'package.json'));
const Stellar=require('@stellar/stellar-sdk');
const {openOpenAQWorkspace}=await mod('sf30-seller-sdk/openaq/workspace.mjs');
const {startOpenAQServer}=await mod('sf30-seller-sdk/openaq/server.mjs');
const {inspectOpenAQSource}=await mod('sf30-seller-sdk/openaq/managed.mjs');
const {createNativeFacilitator}=await mod('native-facilitator/runtime.mjs');
const {startFacilitatorServer}=await mod('native-facilitator/server.mjs');
const {initializeWorkspace}=await mod('sf88-operator-buyer-cli/workspace.mjs');
const buyer=await mod('sf88-operator-buyer-cli/openaq-study/index.mjs');
const {initializeConsole}=await mod('sf88-operator-buyer-cli/openaq-study/console/config.mjs');
const {startCustomerConsole}=await mod('sf88-operator-buyer-cli/openaq-study/console/server.mjs');
const {openOpenAQCustomer}=await mod('sf88-operator-buyer-cli/openaq-study/console/client.mjs');
const {inspectConsoleSource}=await mod('sf88-operator-buyer-cli/openaq-study/console/managed.mjs');
const F=await mod('sf88-operator-buyer-cli/openaq-study/files.mjs');
const OP='SCF-OPENAQ-NATIVE-CUSTOMER-89255-20261012';
const ids={
 release:'48be548e-827e-43d4-80f5-892552026012',stage:'811ccf15-75b9-4b77-891f-892552026012',
 prepare:'7c22476c-732d-441a-ad24-892552026012',run:'88e6b543-1a8a-473d-96b3-892552026012',
 account:'e7bb2097-015e-4a02-8266-892552026012',finalize:'2cd59c4b-d20c-436c-8d2b-892552026012',
 export:'7ca627a1-cbf7-49fa-9d0f-892552026012',receive:'bdd325ae-b82c-4489-93bf-892552026012',
 reopen:'a1d1552d-0442-4daf-894a-892552026012',
};
const original={
 workspaceId:'fc9c248b-3a8e-45b0-aacf-3a4f01620f52',captureId:'142e4ed4-b38c-4013-8718-d3050765ee66',
 sourceReviewId:'d12ca7d5-edec-4496-9b41-c3c588167ceb',publicationRunId:'ebd4a3ab-67e2-4c58-bb96-2a9f9b26f510',
 snapshot:'76f0eaa79b87d25ad2e5ac4e419392c7d7a8d442d28878fc55ddcf3e03029fc0',
 exportRequestId:'b479e18d-12c4-4790-8e30-892552026012',
 projectDirectory:'/dev/openaq-merchant-operations-89255-20261012/journey/project',
};
const payment={scheme:'exact',network:'stellar:testnet',asset:'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
 payTo:'GABLQFAV4GZ55B42NMB5BXZV7WTL7AZ2RHZ6XUX4G7WWYMG4THTJCFB4',amount:'50000',maxTimeoutSeconds:60};
const origin='https://openaq-merchant.example.com',intentId='openaq-native-customer-89255-20261012';
const selection={intentId,acceptIndex:0,query:'limit=50',maxPages:3,maxTotalAtomic:'150000',maxRows:140,maxPageBytes:1048576};
const sha=v=>createHash('sha256').update(v).digest('hex');
const normalized=v=>Array.isArray(v)?v.map(normalized):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalized(v[k])])):v;
const same=(a,b)=>JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
const exists=async p=>stat(p).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const need=(v,code,details)=>{if(!v)throw Object.assign(new Error(code),{code,details});};
const safe=e=>({code:e?.code??e?.name??'ERROR',message:String(e?.message??e).replace(/\bS[A-Z2-7]{55}\b/g,'[private-key]'),
 ...(e?.details?{details:e.details}:{}),...(e?.errors?{errors:e.errors.map(safe)}:{})});
async function json(p,v){await mkdir(join(p,'..'),{recursive:true,mode:0o700});const pending=p+'.pending';await writeFile(pending,JSON.stringify(v,null,2)+'\n',{mode:0o600});await rename(pending,p);await chmod(p,0o600);}
const output=join(root,'outputs'),privateRoot=join(root,'private'),brokerRoot='/dev/openaq-native-customer-89255-approval';
await mkdir(output,{recursive:true,mode:0o700});await mkdir(privateRoot,{recursive:true,mode:0o700});await mkdir(brokerRoot,{recursive:true,mode:0o700});await chmod(brokerRoot,0o700);
const request={schema:'stellar-forge.openaq-native-customer.v1',operationId:OP,sourceCommit:'e24bd7f19831002a3d35264af06d9515ac97e1ac',
 original,ids,payment,selection,facilitatorFeeCeilingStroops:500000,sourceAcquisition:'RETAINED_ORIGINAL_STUDY'};
await F.retainJson(join(root,'native-request.json'),request);
const prior=await exists(join(output,'result.json'))?await read(join(output,'result.json')):null;
if(prior?.state==='COMPLETE'){need(same(prior.request,request),'ORIGINAL_COMPLETION_CHANGED');console.log(JSON.stringify({phase:'REOPEN_COMPLETED_NATIVE_CUSTOMER',result:prior}));process.exit(0);}
const result={schema:request.schema,operationId:OP,request,state:'RUNNING',startedAt:new Date().toISOString(),phases:[],
 prior:prior?{state:prior.state,finishedAt:prior.finishedAt,error:prior.error??null}:null,
 providerRequests:0,paidHttpRequests:0,unsignedHttpRequests:0,approvals:[],cleanupErrors:[],payments:[]};
async function retain(){await json(join(output,'result.json'),result);}
async function phase(name,data={}){result.phases.push({name,at:new Date().toISOString(),...data});await retain();console.log(JSON.stringify({phase:name,...data}));}
let workspace,projectServer,merchantConsole,facilitator,facilitatorServer,tlsServer,proxyServer,browser,context,page,customerApp,customer,receivingApp,receiver;
const sockets=new Set(),proxySockets=new Set(),forwarding=new Set();
const abort=new AbortController();for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>abort.abort(new Error(signal)));
const timeout=ms=>AbortSignal.any([abort.signal,AbortSignal.timeout(ms)]);
async function closeServer(server,set){if(!server)return;const p=new Promise((ok,bad)=>server.close(e=>e&&e.code!=='ERR_SERVER_NOT_RUNNING'?bad(e):ok()));server.closeIdleConnections?.();for(const socket of set)socket.destroy();await p;}
async function closeOwned(){
 const failures=[];
 for(const [name,dispose]of [
  ['receiver',async()=>{if(receiver){await receiver.close();receiver=null;}}],
  ['receiving-console',async()=>{if(receivingApp){await receivingApp.close();receivingApp=null;}}],
  ['customer-client',async()=>{if(customer){await customer.close();customer=null;}}],
  ['customer-console',async()=>{if(customerApp){await customerApp.close();customerApp=null;}}],
  ['browser-context',async()=>{if(context){await context.close();context=null;page=null;}}],
  ['browser',async()=>{if(browser){await browser.close();browser=null;}}],
  ['tls-forwarder',async()=>{if(tlsServer){await closeServer(tlsServer,sockets);tlsServer=null;}await Promise.allSettled([...forwarding]);}],
  ['connect-proxy',async()=>{if(proxyServer){await closeServer(proxyServer,proxySockets);proxyServer=null;}}],
  ['project-server',async()=>{if(projectServer){await projectServer.close();projectServer=null;}}],
  ['original-project',async()=>{if(workspace){await workspace.close();workspace=null;}merchantConsole=null;}],
  ['native-facilitator-http',async()=>{if(facilitatorServer){const r=await facilitatorServer.close();need(r.drained,'ORIGINAL_FACILITATOR_DRAIN_INCOMPLETE');facilitatorServer=null;}}],
  ['native-facilitator',async()=>{if(facilitator){const r=await facilitator.drain();if(!r.drained)await facilitator.waitForIdle();facilitator=null;}}],
 ])try{await dispose();}catch(e){failures.push({owner:name,...safe(e)});}
 result.cleanupErrors=failures;result.ownedResourcesClosed=failures.length===0;
}
async function account(address){
 let last;
 for(let attempt=1;attempt<=2;attempt++){
  const observation={address,source:'https://horizon-testnet.stellar.org',attempt,startedAt:new Date().toISOString()};
  result.accountObservations??=[];result.accountObservations.push(observation);await retain();
  let response;
  try{
   response=await fetch('https://horizon-testnet.stellar.org/accounts/'+address,{redirect:'error',signal:timeout(30000)});
   observation.status=response.status;
   if(response.status===404){observation.state='ABSENT';observation.finishedAt=new Date().toISOString();await retain();return null;}
   need(response.ok,'ORIGINAL_TESTNET_ACCOUNT_READ_FAILED',{status:response.status,address});
   const value=await response.json();need(value.account_id===address,'ORIGINAL_TESTNET_ACCOUNT_CHANGED');
   const observed={address,sequence:value.sequence,lastModifiedLedger:value.last_modified_ledger,nativeBalance:value.balances.find(v=>v.asset_type==='native')?.balance??null};
   observation.state='OBSERVED';observation.account=observed;observation.finishedAt=new Date().toISOString();await retain();return observed;
  }catch(error){
   observation.state='ERROR';observation.error=safe(error);observation.finishedAt=new Date().toISOString();await retain();last=error;
   if(abort.signal.aborted||response||attempt===2)throw error;
  }finally{if(response?.body&&!response.bodyUsed)await response.body.cancel().catch(()=>{});}
 }
 throw last;
}
async function ownedAccount(role){
 const directory=join(privateRoot,role);await mkdir(directory,{recursive:true,mode:0o700});
 const file=join(directory,'wallet.json');let key;
 if(await exists(file)){const saved=await read(file);need(saved.network===payment.network&&saved.role===role&&saved.operationId===OP,'ORIGINAL_NATIVE_ACCOUNT_CUSTODY_CHANGED');
  key=Stellar.Keypair.fromSecret(saved.secret);need(key.publicKey()===saved.address,'ORIGINAL_NATIVE_ACCOUNT_CUSTODY_CHANGED');
 }else{
  key=Stellar.Keypair.random();await F.retainJson(file,{network:payment.network,role,operationId:OP,address:key.publicKey(),secret:key.secret()});
 }
 const address=key.publicKey(),setup={role,address,network:payment.network,state:'OBSERVING_ORIGINAL_ACCOUNT',startedAt:new Date().toISOString(),
  retainedFundingRequest:await exists(join(directory,'funding-request.json'))};
 result.accountSetup??={};result.accountSetup[role]=setup;await retain();
 try{
  if(setup.retainedFundingRequest){
   const retained=await read(join(directory,'funding-request.json'));
   need(same(retained,{operationId:OP,role,address,network:payment.network,provider:'https://friendbot.stellar.org'}),'ORIGINAL_FUNDING_REQUEST_CHANGED');
   if(await exists(join(directory,'funding-response.json'))){
    const response=await read(join(directory,'funding-response.json'));
    const body=await readFile(join(directory,'funding-response.bin'));
    need(body.length===response.bytes&&sha(body)===response.sha256,'ORIGINAL_FUNDING_RESPONSE_CHANGED');
    setup.retainedFundingResponse={status:response.status,bytes:response.bytes,sha256:response.sha256,observedAt:response.observedAt};
   }
   await retain();
  }
  let observed=await account(address);
  if(!observed){
   need(!setup.retainedFundingRequest,'ORIGINAL_TESTNET_FUNDING_RECONCILIATION_REQUIRED',{role,address,retainedFundingResponse:setup.retainedFundingResponse??null,reason:'An original funding request already exists; this continuation does not dispatch another funding request.'});
   setup.state='FUNDING_REQUESTED';setup.requestedAt=new Date().toISOString();await retain();
   await F.retainJson(join(directory,'funding-request.json'),{operationId:OP,role,address,network:payment.network,provider:'https://friendbot.stellar.org'});
   const response=await fetch('https://friendbot.stellar.org?'+new URLSearchParams({addr:address}),{redirect:'error',signal:timeout(45000)});
   const raw=Buffer.from(await response.arrayBuffer());
   await json(join(directory,'funding-response.json'),{status:response.status,bytes:raw.length,sha256:sha(raw),observedAt:new Date().toISOString()});
   await F.retained(join(directory,'funding-response.bin'),raw);
   setup.responseStatus=response.status;setup.state='RECONCILING_FUNDED_ACCOUNT';await retain();
   observed=await account(address);
   need(response.ok&&observed,'ORIGINAL_TESTNET_FUNDING_RECONCILIATION_REQUIRED',{role,address,status:response.status});
  }
  need(observed.nativeBalance!==null&&Number(observed.nativeBalance)>2,'ORIGINAL_TESTNET_BALANCE_INSUFFICIENT',{role,address,balance:observed.nativeBalance});
  setup.state='READY';setup.account=observed;setup.finishedAt=new Date().toISOString();await retain();
  return {key,public:{role,...observed}};
 }catch(error){
  const phase=setup.state;setup.state='ERROR';setup.failedPhase=phase;setup.error=safe(error);setup.finishedAt=new Date().toISOString();await retain();
  throw Object.assign(new Error('Original testnet account setup did not complete'),{code:'ORIGINAL_TESTNET_ACCOUNT_SETUP_FAILED',details:{role,address,phase,cause:safe(error)}});
 }
}
async function projectJSON(path,input){
 const response=await fetch(projectServer.origin+path,{method:input?'POST':'GET',headers:{authorization:'Bearer '+projectServer.connection.token,...(input?{'content-type':'application/json'}:{})},body:input?JSON.stringify(input):undefined,redirect:'error',signal:timeout(120000)});
 need(response.headers.get('x-openaq-instance')===projectServer.instanceId,'ORIGINAL_PROJECT_INSTANCE_CHANGED');
 const body=await response.json();need(response.ok,'ORIGINAL_PROJECT_ACTION_FAILED',{status:response.status,body});return body;
}
async function projectAction(action,id,input){
 await workspace.start(action,{workspaceId:workspace.id,requestId:id,...input});
 const current=await workspace.read('request',{id});
 if(['PREPARED','FAILED','INTERRUPTED'].includes(current.state))await workspace.resume({workspaceId:workspace.id,requestId:id});
 const done=await workspace.wait(id);need(done.state==='COMPLETE','ORIGINAL_PROJECT_OPERATION_'+done.state,{action,id,error:done.error});return done.result;
}
async function merchantJSON(path,input){
 const response=await fetch(merchantConsole.origin+path,{method:input?'POST':'GET',headers:{'x-release-token':merchantConsole.token,...(input?{'content-type':'application/json',origin:merchantConsole.origin}:{})},body:input?JSON.stringify(input):undefined,redirect:'error',signal:timeout(120000)});
 const body=await response.json();need(response.ok,'ORIGINAL_MERCHANT_ACTION_FAILED',{path,status:response.status,body});return body;
}
const listen=(server,port)=>new Promise((ok,bad)=>{server.once('error',bad);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',bad);ok(server.address().port);});});
async function customerJob(id,action,input){
 const accepted=await customer.submit(id,action,input);
 const done=accepted.state==='COMPLETE'||accepted.state==='ERROR'?accepted:await customer.wait(id,{signal:abort.signal,intervalMs:500});
 need(done.state==='COMPLETE','ORIGINAL_CUSTOMER_OPERATION_FAILED',{action,id,error:done.error});
 return done.result;
}
async function shot(name){await page.screenshot({path:join(output,name),fullPage:true});need(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'CUSTOMER_OUTER_LAYOUT_OVERFLOW');}
async function fetchView(){const v=await customer.view({signal:abort.signal});need(v.id===result.console?.id||!result.console,'ORIGINAL_CUSTOMER_ID_CHANGED');return v;}
try{
 need(Stellar.Asset.native().contractId(Stellar.Networks.TESTNET)===payment.asset,'ORIGINAL_NATIVE_ASSET_CHANGED');
 const payer=await ownedAccount('payer'),sponsor=await ownedAccount('facilitator'),merchant=await account(payment.payTo);
 need(merchant,'ORIGINAL_MERCHANT_TESTNET_ACCOUNT_UNAVAILABLE',{payTo:payment.payTo});
 result.accounts={payer:payer.public,facilitator:sponsor.public,merchant};
 const environment={...process.env,STELLAR_SECRET:payer.key.secret(),SF_FACILITATOR_SECRET:sponsor.key.secret()};
 await phase('01_ORIGINAL_TESTNET_ACCOUNTS',{network:payment.network,asset:payment.asset,payer:payer.public.address,facilitator:sponsor.public.address,payTo:payment.payTo});
 const priorPorts=await exists(join(root,'ports.json'))?await read(join(root,'ports.json')):null;
 const fc={schema:'stellar-forge.native-facilitator.v1',network:payment.network,rpcUrl:'https://soroban-testnet.stellar.org',
  signers:[{address:sponsor.public.address,secretEnv:'SF_FACILITATOR_SECRET'}],
  payments:{assets:[payment.asset],recipients:[payment.payTo],maxAtomic:payment.amount,paymentFlows:['authorization']},
  limits:{maxTransactionFeeStroops:request.facilitatorFeeCeilingStroops,inclusionFeeStroops:100,maxVerifyInFlight:4,maxSettleInFlight:1,drainGraceMs:60000},
  operations:{ownershipDirectory:join(privateRoot,'signer-ownership'),rpcTimeoutMs:15000,readinessMaxAgeMs:15000,maxLedgerAgeSeconds:120,requireReady:true}};
 await F.retainJson(join(root,'facilitator-profile.json'),fc);
 facilitator=await createNativeFacilitator(fc,{environment});
 facilitatorServer=await startFacilitatorServer({facilitator,port:priorPorts?.facilitatorPort??0});
 await phase('02_ORIGINAL_NATIVE_FACILITATOR',{supported:await facilitator.getSupported(),readiness:await facilitator.probeReadiness(),status:facilitator.status()});
 workspace=await openOpenAQWorkspace({directory:original.projectDirectory,fetchImpl:async()=>{result.providerRequests++;throw Error('UNEXPECTED_OPENAQ_SOURCE_REQUEST');}});
 need(workspace.id===original.workspaceId,'ORIGINAL_OPENAQ_WORKSPACE_CHANGED');
 const originalCapture=await workspace.read('capture',{id:original.captureId});need(originalCapture.projection.rows===140,'ORIGINAL_OPENAQ_ROW_COUNT_CHANGED');
 const prepared=await projectAction('release.prepare',ids.release,{captureId:original.captureId,sourceReviewId:original.sourceReviewId,runId:original.publicationRunId,payment,origin,path:'/data'});
 const staged=await projectAction('release.stage',ids.stage,{preparationId:ids.release,id:'openaq-del-norte-native-20261012',label:'Del Norte reviewed study · native testnet customer',runtime:{port:0,facilitator:facilitatorServer.url,allowLocalFacilitator:true}});
 need(staged.mode==='NATIVE_X402'&&staged.dataset.baselineSnapshot===original.snapshot&&staged.dataset.rowCount===140,'ORIGINAL_NATIVE_DATASET_RELEASE_CHANGED');
 const projectSource=await inspectOpenAQSource();
 projectServer=await startOpenAQServer({workspace,ownsWorkspace:false,sourceIdentity:projectSource,connectionFile:join(root,'project-connection.json')});
 const opened=await projectJSON('/api/read',{action:'merchant.open',input:{stageRequestId:ids.stage}});
 const privateUrl=opened.operatorUrl??opened.console?.operatorUrl??opened.url;
 need(typeof privateUrl==='string','ORIGINAL_MERCHANT_LINK_MISSING',{keys:Object.keys(opened)});
 const parsed=new URL(privateUrl),token=parsed.hash.slice(1);need(token&&parsed.hostname==='127.0.0.1','ORIGINAL_MERCHANT_LINK_CHANGED');
 merchantConsole={origin:parsed.origin,token,consoleId:opened.consoleId};result.merchantSelection={stageRequestId:ids.stage,release:staged,consoleId:opened.consoleId};
 let status=await merchantJSON('/api/status');
 if(status.state.active!==staged.id){
  const generation=status.state.generation;
  need(Number.isSafeInteger(generation),'ORIGINAL_RELEASE_GENERATION_MISSING',{keys:Object.keys(status)});
  status=await merchantJSON('/api/activate',{id:staged.id,expectedGeneration:generation,reason:'Operate the retained reviewed study through its original native testnet customer.'});
 }
 const generation=status.state.generation;
 status=await merchantJSON('/api/run',{expectedGeneration:generation});
 need(status.runtime.state==='RUNNING','ORIGINAL_NATIVE_MERCHANT_NOT_RUNNING',{status});
 const runtime=status.runtime.observed;
 const listener=runtime.listener;need(typeof listener==='string'&&listener.startsWith('http://127.0.0.1:'),'ORIGINAL_NATIVE_MERCHANT_LISTENER_MISSING',{status});
 result.merchantRuntime={listener,instanceId:runtime?.instanceId,mode:runtime?.mode??staged.mode};
 const handoff=await buyer.prepareOpenAQBuyerHandoff({projectDirectory:original.projectDirectory,stageRequestId:ids.stage,exportRequestId:original.exportRequestId,
  expectedReleaseDigest:staged.digest,directory:join(root,'native-handoff'),connectionFile:join(root,'project-connection.json'),environment,signal:abort.signal});
 need(handoff.handoff.release.mode==='NATIVE_X402'&&handoff.handoff.dataset.baselineSnapshot===original.snapshot,'ORIGINAL_NATIVE_HANDOFF_CHANGED');
 result.handoff={directory:handoff.directory,sha256:handoff.handoffSha256,bytes:handoff.handoffBytes,release:handoff.handoff.release,study:handoff.handoff.study};
 await phase('03_ORIGINAL_NATIVE_RELEASE_AND_HANDOFF',{releaseId:staged.id,releaseDigest:staged.digest,snapshot:original.snapshot,handoffSha256:handoff.handoffSha256,merchantInstanceId:runtime?.instanceId});
 const target=new URL(listener);
 tlsServer=https.createServer({key:await readFile(join(root,'tls/key.pem')),cert:await readFile(join(root,'tls/cert.pem'))},(req,res)=>{
  const work=new Promise((done)=>{
   if(req.method!=='GET'||new URL(req.url,origin).pathname!=='/data'){res.writeHead(404).end();done();return;}
   const paid=typeof req.headers['payment-signature']==='string';if(paid)result.paidHttpRequests++;else result.unsignedHttpRequests++;
   const upstream=http.request({hostname:'127.0.0.1',port:target.port,path:req.url,method:req.method,
    headers:{...req.headers,host:target.host}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);response.once('end',done);response.once('error',e=>{res.destroy(e);done();});});
   upstream.on('error',e=>{res.destroy(e);done();});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
  });forwarding.add(work);work.finally(()=>forwarding.delete(work)).catch(()=>{});
 });
 tlsServer.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 const tlsPort=await listen(tlsServer,priorPorts?.tlsPort??0);
 proxyServer=http.createServer((req,res)=>res.writeHead(405).end());
 proxyServer.on('connect',(req,client,head)=>{
  const remember=socket=>{proxySockets.add(socket);socket.on('close',()=>proxySockets.delete(socket));};
  remember(client);
  const bridge=(upstream,extra=Buffer.alloc(0))=>{
   remember(upstream);client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
   if(extra.length)client.write(extra);if(head.length)upstream.write(head);
   client.pipe(upstream);upstream.pipe(client);client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy());
   client.on('close',()=>upstream.destroy());
  };
  if(req.url===new URL(origin).hostname+':443'){
   const upstream=net.connect({host:'127.0.0.1',port:tlsPort},()=>bridge(upstream));
   remember(upstream);upstream.on('error',()=>client.destroy());return;
  }
  // SF36's original observer uses this same privileged explicit proxy for
  // its real approved RPC endpoint. Preserve remote TLS end to end.
  if(req.url!=='soroban-testnet.stellar.org:443'){client.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
  const selected=process.env.HTTPS_PROXY??process.env.https_proxy??process.env.HTTP_PROXY??process.env.http_proxy;
  if(!selected){
   const upstream=net.connect({host:'soroban-testnet.stellar.org',port:443},()=>bridge(upstream));
   remember(upstream);upstream.on('error',()=>client.destroy());return;
  }
  let proxy;try{proxy=new URL(selected);}catch{client.destroy();return;}
  if(!['http:','https:'].includes(proxy.protocol)){client.destroy();return;}
  const headers={host:req.url};
  if(proxy.username||proxy.password)headers['proxy-authorization']='Basic '+Buffer.from(decodeURIComponent(proxy.username)+':'+decodeURIComponent(proxy.password)).toString('base64');
  const connector=(proxy.protocol==='https:'?https:http).request({hostname:proxy.hostname,
   port:proxy.port||(proxy.protocol==='https:'?443:80),method:'CONNECT',path:req.url,headers,timeout:30000});
  connector.on('connect',(response,upstream,extra)=>{
   if(response.statusCode!==200){upstream.destroy();client.destroy();return;}bridge(upstream,extra);
  });
  connector.on('timeout',()=>connector.destroy());connector.on('error',()=>client.destroy());
  client.on('error',()=>connector.destroy());client.on('close',()=>connector.destroy());connector.end();
 });
 const proxyPort=await listen(proxyServer,priorPorts?.proxyPort??0);
 await F.retainJson(join(root,'ports.json'),{facilitatorPort:new URL(facilitatorServer.url).port*1,tlsPort,proxyPort,origin});
 const draft=buyer.prepareOpenAQDatasetRequest(handoff.handoff,selection);
 await F.retained(join(root,'reviewed-request.json'),draft.data);
 const operatorDirectory=join(privateRoot,'operator');
 await initializeWorkspace(['--config',join(root,'reviewed-request.json'),'--dir',operatorDirectory,'--actor','89255-openaq-native-customer',
  '--service','openaq-reviewed-study','--payer',payer.public.address,'--python',python,'--secret-env','STELLAR_SECRET',
  '--rpc','https://soroban-testnet.stellar.org','--https-proxy','http://127.0.0.1:'+proxyPort,
  '--total-atomic',selection.maxTotalAtomic,'--daily-atomic',selection.maxTotalAtomic],{environment,resume:await exists(operatorDirectory)});
 const consoleDirectory=join(root,'customer-console');
 const settings=await initializeConsole({directory:consoleDirectory,label:'Del Norte · native testnet customer',mode:'acquire',
  handoffDirectory:handoff.directory,handoffSha256:handoff.handoffSha256,operatorDirectory,python});
 const sourceIdentity=await inspectConsoleSource();
 customerApp=await startCustomerConsole({directory:consoleDirectory,expectedConfiguration:settings.configurationSha256,expectedSource:sourceIdentity.sha256,environment,brokerDirectory:brokerRoot});
 customer=await openOpenAQCustomer({connectionFile:customerApp.connectionFile,consoleId:settings.id,configurationSha256:settings.configurationSha256,sourceSha256:sourceIdentity.sha256});
 result.console={id:settings.id,configurationSha256:settings.configurationSha256,instanceId:customerApp.instanceId,sourceIdentity};
 const review=await customer.review(selection,{signal:abort.signal});await json(join(output,'selected-request-review.json'),review);
 const preparation=await customerJob(ids.prepare,'prepare',{selection:review.selection,reviewSha256:review.reviewSha256});result.customerRequestSha256=preparation.requestSha256;
 await phase('04_ORIGINAL_CUSTOMER_PREPARED',{consoleId:settings.id,configurationSha256:settings.configurationSha256,requestSha256:preparation.requestSha256,sessionDirectory:preparation.sessionDirectory});
 const playwright=await import(pathToFileURL(join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright','index.mjs')));
 browser=await playwright.chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],chromiumSandbox:false});
 context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});page=await context.newPage();
 const browserErrors=[];page.on('pageerror',e=>browserErrors.push(e.message));result.browserErrors=browserErrors;
 await page.goto(customerApp.startup.url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#release-mode')?.textContent==='NATIVE_X402',undefined,{timeout:15000});
 await shot('01-native-source-desktop.png');await page.getByRole('button',{name:'3. Acquire & recover',exact:true}).click();
 let view=await fetchView();
 if(view.inspection?.native?.status!=='COMPLETE'){
  need(view.inspection?.native?.status==='READY','ORIGINAL_CUSTOMER_RECOVERY_REQUIRED',{native:view.inspection?.native});
  const start=await customer.run(ids.run,{requestSha256:preparation.requestSha256},{signal:abort.signal});
  need(start.state==='RUNNING'||start.state==='COMPLETE','ORIGINAL_NATIVE_RUN_NOT_ACCEPTED',{start});
  const accepted=new Set(),until=Date.now()+300000;
  while(Date.now()<until){
   view=await fetchView();const job=await customer.job(ids.run,{signal:abort.signal});
   for(const entry of view.approvals??[]){
    if(entry.state!=='AWAITING_OPERATOR'||accepted.has(entry.id))continue;
    need(result.approvals.length<3,'ORIGINAL_PAGE_APPROVAL_LIMIT');
    const terms=entry.review.complete_original_accepted_terms;
    for(const key of ['scheme','network','asset','payTo','amount','maxTimeoutSeconds'])need(terms[key]===payment[key],'ORIGINAL_APPROVED_TERMS_CHANGED',{key,actual:terms[key]});
    need(entry.current_native_budget_estimate.approved===true&&entry.intentId.startsWith(intentId),'ORIGINAL_NATIVE_APPROVAL_BINDING_CHANGED');
    const approve=page.locator('.approval').filter({has:page.getByText('Intent '+entry.intentId,{exact:true})}).getByRole('button',{name:'Approve exact original page',exact:true});
    await approve.waitFor({state:'visible',timeout:15000});
    if(result.approvals.length===0)await shot('02-original-native-page-approval.png');
    result.approvals.push({id:entry.id,intentId:entry.intentId,requestSha256:entry.review.request_sha256,terms,budget:entry.current_native_budget_estimate});
    await retain();
    await approve.click();accepted.add(entry.id);
   }
   if(job.state==='ERROR')throw Object.assign(new Error('ORIGINAL_NATIVE_BUYER_RETURNED_ERROR'),{code:'ORIGINAL_NATIVE_BUYER_RETURNED_ERROR',details:{job,view}});
   if(job.state==='COMPLETE'){result.native=job.result;break;}
   await new Promise(done=>setTimeout(done,300));
  }
 }else result.native=view.inspection.native;
 need(result.native?.status==='COMPLETE'&&result.native.completedPages===3&&result.native.acquiredRows===140&&result.native.snapshot===original.snapshot,'ORIGINAL_NATIVE_DATASET_INCOMPLETE',{native:result.native});
 await phase('05_ORIGINAL_NATIVE_BUYER_COMPLETE',{pages:result.native.completedPages,rows:result.native.acquiredRows,snapshot:result.native.snapshot,unsignedHttpRequests:result.unsignedHttpRequests,paidHttpRequests:result.paidHttpRequests,approvedPages:result.approvals.length});
 const accounting=await customerJob(ids.account,'account',{requestSha256:preparation.requestSha256});
 await json(join(output,'original-accounting.json'),accounting);
 const finalized=await customerJob(ids.finalize,'finalize',{requestSha256:preparation.requestSha256});
 await json(join(output,'original-accounting-finalized.json'),finalized);
 need(finalized.entries.length===3,'ORIGINAL_ACCOUNTING_PAGE_COUNT_CHANGED',{entries:finalized.entries.length});
 need(finalized.entries.every(entry=>['FINALIZED','IDEMPOTENT_FINALIZED'].includes(entry.outcome)),'ORIGINAL_NATIVE_ACCOUNTING_RECONCILIATION_REQUIRED',{entries:finalized.entries});
 need(finalized.entries.reduce((total,entry)=>total+BigInt(entry.actualAtomicUnits??'0'),0n)===150000n,'ORIGINAL_NATIVE_ACCOUNTING_AMOUNT_CHANGED',{entries:finalized.entries});
 result.payments=finalized.entries.map(entry=>({index:entry.index,intentId:entry.intentId,outcome:entry.outcome,actualAtomicUnits:entry.actualAtomicUnits,receipt:entry.receipt,requestSha256:entry.requestSha256}));
 result.accounting=finalized;
 result.facilitatorBeforeReopen=facilitator.status();
 need(result.facilitatorBeforeReopen.counters.settleCalls===3&&result.facilitatorBeforeReopen.counters.settlementRefusals===0,'ORIGINAL_NATIVE_SETTLEMENT_COUNT_CHANGED',{status:result.facilitatorBeforeReopen});
 await page.getByRole('button',{name:'4. Accounting',exact:true}).click();await page.getByRole('button',{name:'Refresh original state',exact:true}).click();await shot('03-native-accounting-desktop.png');
 const exported=await customerJob(ids.export,'export',{requestSha256:preparation.requestSha256,exportId:'openaq-native-customer-delivery-89255-20261012'});
 const delivery=await buyer.inspectOpenAQBuyerDelivery({directory:exported.directory,manifestSha256:exported.manifestSha256});
 need(delivery.manifest.dataset.rows===140&&delivery.manifest.dataset.snapshot===original.snapshot,'ORIGINAL_COMPLETE_DELIVERY_CHANGED');
 result.delivery={directory:delivery.directory,manifestSha256:delivery.manifestSha256,manifest:delivery.manifest};
 const before={paid:result.paidHttpRequests,unsigned:result.unsignedHttpRequests,settled:facilitator.status().counters.settleCalls};
 await customerJob('abda2b64-6343-4cbf-b6a6-892552026012','run',{requestSha256:preparation.requestSha256});
 need(result.paidHttpRequests===before.paid&&result.unsignedHttpRequests===before.unsigned&&facilitator.status().counters.settleCalls===before.settled,'COMPLETED_BUYER_REOPEN_REDISPATCHED');
 const receivingDirectory=join(root,'independent-receiver');
 const receivedSettings=await initializeConsole({directory:receivingDirectory,label:'Del Norte · received native customer delivery',mode:'receive',deliveryDirectory:delivery.directory,deliverySha256:delivery.manifestSha256,python});
 receivingApp=await startCustomerConsole({directory:receivingDirectory,expectedConfiguration:receivedSettings.configurationSha256,expectedSource:sourceIdentity.sha256,environment});
 receiver=await openOpenAQCustomer({connectionFile:receivingApp.connectionFile,consoleId:receivedSettings.id,configurationSha256:receivedSettings.configurationSha256,sourceSha256:sourceIdentity.sha256});
 await receiver.receive(ids.receive,{receivingId:'openaq-native-received-89255-20261012',manifestSha256:delivery.manifestSha256});
 const received=await receiver.wait(ids.receive,{signal:abort.signal,intervalMs:500});need(received.state==='COMPLETE','ORIGINAL_DELIVERY_RECEIVING_FAILED',{received});
 await receiver.close();receiver=null;const firstReceivedInstance=receivingApp.instanceId;await receivingApp.close();receivingApp=null;
 receivingApp=await startCustomerConsole({directory:receivingDirectory,expectedConfiguration:receivedSettings.configurationSha256,expectedSource:sourceIdentity.sha256,environment});
 receiver=await openOpenAQCustomer({connectionFile:receivingApp.connectionFile,consoleId:receivedSettings.id,configurationSha256:receivedSettings.configurationSha256,sourceSha256:sourceIdentity.sha256});
 await receiver.reopen(ids.reopen);const reopened=await receiver.wait(ids.reopen,{signal:abort.signal,intervalMs:500});need(reopened.state==='COMPLETE','ORIGINAL_RECEIVED_REOPEN_FAILED',{reopened});
 const rows=await receiver.rows({limit:1000});need(rows.totalRows===140&&rows.rows.length===140&&rows.snapshot===original.snapshot,'ORIGINAL_RECEIVED_ROWS_CHANGED');
 const receivedView=await receiver.view();need(receivedView.source.capture.id===original.captureId&&receivedView.source.sourceReview.id===original.sourceReviewId,'ORIGINAL_RECEIVED_STUDY_CHANGED');
 result.receiving={consoleId:receivedSettings.id,configurationSha256:receivedSettings.configurationSha256,instances:[firstReceivedInstance,receivingApp.instanceId],received:received.result,reopened:reopened.result,rows:rows.totalRows};
 await page.goto(receivingApp.startup.url,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'5. Delivery & receiving',exact:true}).click();
 await page.getByRole('button',{name:'Preview first 100 rows',exact:true}).click();await page.locator('#dataset-preview').waitFor({state:'visible'});await shot('04-complete-received-data-desktop.png');
 await page.setViewportSize({width:390,height:844});await shot('05-received-data-mobile.png');
 need(browserErrors.length===0,'ORIGINAL_CUSTOMER_BROWSER_ERRORS',{browserErrors});
 need(result.providerRequests===0&&result.paidHttpRequests===before.paid&&facilitator.status().counters.settleCalls===before.settled,'ORIGINAL_REOPEN_DISPATCHED');
 result.accountsAfter={payer:await account(payer.public.address),facilitator:await account(sponsor.public.address),merchant:await account(payment.payTo)};
 await phase('06_COMPLETE_DELIVERY_AND_INDEPENDENT_REOPEN',{deliveryManifestSha256:delivery.manifestSha256,rows:rows.totalRows,snapshot:rows.snapshot,receiverConsoleId:receivedSettings.id,additionalProviderRequests:0,additionalPayments:0});
 result.state='COMPLETE';
}catch(error){result.state='ERROR';result.error=safe(error);}
finally{
 await closeOwned();if(result.cleanupErrors.length)result.state='ERROR';
 result.finishedAt=new Date().toISOString();await retain();
 console.log(JSON.stringify({phase:'ORIGINAL_NATIVE_CUSTOMER_TERMINAL',state:result.state,operationId:OP,providerRequests:result.providerRequests,paidHttpRequests:result.paidHttpRequests,unsignedHttpRequests:result.unsignedHttpRequests,cleanupErrors:result.cleanupErrors,error:result.error??null}));
}
if(result.state!=='COMPLETE')process.exitCode=1;
