// Native free ObjectSession -> original SF88/SF101 complete recovery receiving.
// Uses retained original CSV, actual local HTTPS, original buyer inbox and original SDK/CLI.
import {createHash,randomBytes} from 'node:crypto';
import {createServer as httpsServer} from 'node:https';
import {createServer as httpServer} from 'node:http';
import {connect} from 'node:net';
import {readFile,writeFile,mkdir,rename,lstat,readdir,open} from 'node:fs/promises';
import {join,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.SCF_ACCEPTANCE_ROOT;
const sf=join(root,'application/stellar/scf-starforge-20261009');
const runtime=join(sf,'sf88-operator-buyer-cli');
const {ObjectSessionRecovery,ObjectSessionRecoveryResult,ObjectSessionRecoveryError,WorkspaceRecovery}=await import(pathToFileURL(join(runtime,'node/index.mjs')));
const native=await import(pathToFileURL(join(runtime,'object-session.mjs')));
const {createBrowserApprovalBroker}=await import(pathToFileURL(join(sf,'sf81-buyer-operator-bridge/browser-approval.mjs')));
const stateRoot=join(root,'reference-state'),session=join(stateRoot,'state/sessions/events');
const records=join(root,'records'),bundle=join(root,'object-session-backup'),heldOriginal=join(root,'original-quiesced-state');
const dataPath=join(root,'input/original-events.csv'),hash='80bc251619f969166dd39f60290b0450663fbf54ab2dc037a2635dbfb921c19a';
const operationId='SCF-STANDALONE-OBJECT-RECOVERY-33E6-20261012';
const abort=new AbortController();const stop=()=>abort.abort();process.once('SIGTERM',stop);process.once('SIGINT',stop);
const sha=b=>createHash('sha256').update(b).digest('hex'),j=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const check=(condition,code)=>{if(!condition)throw Object.assign(new Error(code),{code});};
async function exists(p){try{return await lstat(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function save(p,value){const data=j(value),f=await open(p,'wx',0o600);try{await f.writeFile(data);await f.sync();}finally{await f.close();}return{path:p,bytes:data.length,sha256:sha(data)};}
async function saved(name,call){const p=join(records,name);if(await exists(p))return JSON.parse(await readFile(p,'utf8'));const value=await call();await save(p,value);return value;}
async function priv(p){await mkdir(p,{recursive:true,mode:0o700});}
async function inventory(p){const files=[];async function walk(dir){for(const name of(await readdir(dir)).sort()){const f=join(dir,name),s=await lstat(f);check(!s.isSymbolicLink(),'SYMLINK_REFUSED');if(s.isDirectory())await walk(f);else{check(s.isFile(),'REGULAR_FILE_REQUIRED');const b=await readFile(f);files.push({path:relative(p,f),bytes:b.length,sha256:sha(b)});}}}await walk(p);return files;}
let tls,proxy,broker;const sockets=new Set();let phase='STARTING';let error;
const progress=(stage)=>{phase=stage;process.stdout.write(JSON.stringify({state:'PROGRESS',stage,operationId})+'\n');};
async function closeServers(){for(const s of sockets)s.destroy();for(const server of [proxy,tls])if(server){server.closeAllConnections?.();await new Promise(resolve=>server.close(()=>resolve()));}proxy=tls=null;if(broker){await broker.close();broker=null;}}
try{
 const data=await readFile(dataPath);check(data.length===267&&sha(data)===hash,'ORIGINAL_267_BYTE_SOURCE_REQUIRED');
 check(typeof ObjectSessionRecovery==='function'&&typeof WorkspaceRecovery==='function'&&typeof ObjectSessionRecoveryResult==='function'&&typeof ObjectSessionRecoveryError==='function','ORIGINAL_PUBLIC_SDK_EXPORTS_REQUIRED');
 await priv(records);
 const request=await saved('acceptance-request.json',async()=>({schema:'stellar-forge.standalone-object-recovery-receiving.v1',operationId,
 sourceCommit:'b09765c47a6e71b552bfc7b38958d7b1b9750678',stateRoot,session,bundle,
 originalData:{bytes:267,sha256:hash,archivedSessionId:'f269be5c-ca82-4a78-b603-3f526abf90a9',
 receivedSourceSessionId:'a8e6646c-a8ff-4545-9399-362f3e831bb4'},kind:'LOCAL_FREE_REFERENCE_RECEIVING',
 createdAt:new Date().toISOString()}));
 check(request.operationId===operationId&&request.stateRoot===stateRoot&&request.session===session,'ORIGINAL_ACCEPTANCE_REQUEST_CHANGED');
 const environment={...process.env};
 const pass=(await readFile(join(root,'private/recovery-passphrase.txt'),'utf8')).trim();
 environment.SF88_BACKUP_PASSPHRASE=pass;
 const recovery=new ObjectSessionRecovery({runtimeDirectory:runtime,node:process.execPath,environment,
 timeoutMs:240000,cleanupGraceMs:15000});
 if(!await exists(join(records,'backup.sdk.json'))){
  progress('ORIGINAL_FREE_RECEIVING');
  for(const p of [stateRoot,join(stateRoot,'state/sessions'),join(stateRoot,'operator/evidence')])await priv(p);
  for(const name of ['policy.json','signer.mjs']){
   const p=join(stateRoot,'operator',name),raw=await readFile(join(root,'input',name));
   if(await exists(p))check((await readFile(p)).equals(raw),'ORIGINAL_OPERATOR_DEPENDENCY_CHANGED');else await writeFile(p,raw,{flag:'wx',mode:0o600});
  }
  const cfgPath=join(stateRoot,'source-config.json'),configuration={
   operation:{intentId:'reference:object-recovery-33e6-20261012',url:'https://received-export.example/events',method:'GET',
    expect:{scheme:'exact',network:'stellar:testnet',asset:'LOCAL_SAVED_EXPORT_NO_PAYMENT',payTo:'NO_PAYMENT_RECIPIENT',maxAtomic:'0'}},
   operator:{python:process.env.SCF_RECOVERY_PYTHON??'/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3',
    actor:'33e6-original-data-receiver',service:'saved-object-export',
    policy:join(stateRoot,'operator/policy.json'),ledger:join(stateRoot,'operator/reservations.sqlite')},
   signerModule:join(stateRoot,'operator/signer.mjs'),evidenceDir:join(stateRoot,'operator/evidence'),captureBody:false,
   buyerTransport:{mode:'explicit-connect',origin:'https://received-export.example',proxyEnv:'SCF_RECOVERY_REFERENCE_PROXY'}};
  if(await exists(cfgPath))check((await readFile(cfgPath)).equals(j(configuration)),'ORIGINAL_NATIVE_CONFIGURATION_CHANGED');else await save(cfgPath,configuration);
  const sourceReceipt=join(records,'source-complete.native.json');
  if(!await exists(sourceReceipt)){
   tls=httpsServer({key:await readFile(join(root,'private/server-key.pem')),cert:await readFile(join(root,'private/server-cert.pem'))},async(req,res)=>{
    try{
     check(req.method==='GET'&&req.url==='/events'&&req.headers.host==='received-export.example','REFERENCE_HTTP_REQUEST_CHANGED');
     const call={method:req.method,url:req.url,host:req.headers.host,receivedAt:new Date().toISOString()};
     const p=join(records,'local-http-exchanges.jsonl'),f=await open(p,'a',0o600);try{await f.writeFile(JSON.stringify(call)+'\n');await f.sync();}finally{await f.close();}
     res.writeHead(200,{'content-type':'text/csv','content-length':String(data.length),
      'x-content-sha256':hash,'x-sf30-object-snapshot':hash,'x-sf30-object-bytes':String(data.length)});res.end(data);
    }catch(e){res.writeHead(409,{'content-type':'text/plain'});res.end(e.code??'REFERENCE_REQUEST_REJECTED');}
   });
   tls.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});
   await new Promise((resolve,reject)=>{tls.once('error',reject);tls.listen(0,'127.0.0.1',resolve);});
   proxy=httpServer((_req,res)=>{res.writeHead(405);res.end();});
   proxy.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});
   proxy.on('connect',(req,socket,head)=>{
    if(req.url!=='received-export.example:443'){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
    const upstream=connect({host:'127.0.0.1',port:tls.address().port});sockets.add(upstream);
    upstream.once('close',()=>sockets.delete(upstream));upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());
    upstream.once('connect',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});
   });
   await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
   broker=await createBrowserApprovalBroker({directory:process.env.SCF_RECOVERY_SOCKET_DIRECTORY??'/tmp'});
   const sourceEnvironment={...environment,...broker.environment,SCF_RECOVERY_REFERENCE_PROXY:'http://127.0.0.1:'+proxy.address().port};
   for(const key of ['SF36_CONSENT_KEY_B64','SF36_AUDIT_KEY_B64','SF36_OPERATOR_KEY_B64'])sourceEnvironment[key]=randomBytes(32).toString('base64');
   let report=await exists(join(session,'session.json'))?await native.inspectObjectSession(session,{signal:abort.signal}):
    await native.createObjectSession({directory:session,configPath:cfgPath,bytes:267,expectedSnapshot:hash,expectedSha256:hash,
     expectedContentType:'text/csv',workspace:null,maxTotalAtomic:'0',deliveryMode:'whole'});
   await saved('prepared.native.json',async()=>report);
   if(report.status==='READY')report=await native.runObjectSession(session,{signal:abort.signal,environment:sourceEnvironment});
   check(report.status==='COMPLETE'&&report.objectSha256===hash&&report.downloadedBytes===267&&
    report.completeChunks===1&&report.attemptedChunks===1&&report.capAllocatedAtomic==='0'&&
    report.chunks.every(c=>c.nativeBuyerStatus==='NO_PAYMENT_REQUIRED'&&c.operatorReservation===null),
    'ORIGINAL_FREE_RECEIVING_INCOMPLETE');
   check(broker.pending().length===0,'UNEXPECTED_APPROVAL_REQUEST');
   await save(sourceReceipt,report);
   await closeServers();
  }
  const assembly=join(stateRoot,'state/events.csv');
  await saved('assembled.native.json',async()=>await native.assembleObjectSession(session,assembly));
  check(sha(await readFile(assembly))===hash,'ORIGINAL_ASSEMBLY_CHANGED');
  for(const p of [configuration.operator.ledger,configuration.operator.ledger+'-wal',configuration.operator.ledger+'-shm'])check(!await exists(p),'UNEXPECTED_LEDGER_CREATED');
  const observed=await native.accountObjectSession(session,{finalize:false,signal:abort.signal});
  check(observed.entries.length===1&&observed.entries[0].outcome==='NO_PAYMENT_REQUIRED','NATIVE_FREE_ACCOUNTING_REQUIRED');
  await saved('accounting-before.native.json',async()=>observed);
  progress('EXACT_NATIVE_REVIEW');
  const reviewed=await saved('review.sdk.json',async()=>await recovery.inspect({directory:session,stateRoot,include:[join(stateRoot,'source-config.json')],signal:abort.signal}));
  check(reviewed.ok&&reviewed.native.absentLedger.state==='ABSENT','NATIVE_REVIEW_NOT_COMPLETE');
  progress('SF101_ENCRYPTED_SNAPSHOT');
  await saved('backup.sdk.json',async()=>await recovery.snapshot({directory:session,stateRoot,include:[join(stateRoot,'source-config.json')],output:bundle,
   expectedReviewSha256:reviewed.native.reviewSha256,quiesced:true,signal:abort.signal}));
 }
 const backed=JSON.parse(await readFile(join(records,'backup.sdk.json'),'utf8'));
 check(backed.ok&&backed.native.status==='OBJECT_SESSION_BACKUP_CREATED','NATIVE_BACKUP_NOT_COMPLETE');
 const recordSha256=backed.native.recordSha256;
 progress('INDEPENDENT_CLI_VERIFICATION');
 await saved('verified.sdk.json',async()=>await recovery.verify({bundle,expectedRecordSha256:recordSha256,signal:abort.signal}));
 progress('CANONICAL_NATIVE_RESTORE');
 const restoreResult=join(records,'restored.sdk.json');
 if(!await exists(restoreResult)){
  const marker=join(stateRoot,'.sf88-object-restorations',recordSha256+'.json');
  if(!await exists(marker)){
   if(await exists(stateRoot)){check(!await exists(heldOriginal),'QUIESCED_ORIGINAL_ALREADY_HELD');await rename(stateRoot,heldOriginal);}
   check(await exists(heldOriginal),'ORIGINAL_QUIESCED_SOURCE_REQUIRED');
  }
  await save(restoreResult,await recovery.restore({bundle,expectedRecordSha256:recordSha256,signal:abort.signal}));
 }
 let reopened=await native.inspectObjectSession(session,{signal:abort.signal});
 const source=JSON.parse(await readFile(join(records,'source-complete.native.json'),'utf8'));
 check(reopened.status==='COMPLETE'&&reopened.sessionId===source.sessionId&&reopened.configurationSha256===source.configurationSha256&&
  reopened.objectSha256===hash&&reopened.capAllocatedAtomic==='0','RESTORED_ORIGINAL_IDENTITY_CHANGED');
 const review=JSON.parse(await readFile(join(records,'review.sdk.json'),'utf8')).native;
 await saved('restored.native.json',async()=>reopened);
 const ledger=join(stateRoot,'operator/reservations.sqlite');
 for(const p of [ledger,ledger+'-wal',ledger+'-shm'])check(!await exists(p),'RESTORE_CREATED_LEDGER');
 progress('LATER_NATIVE_ASSEMBLY');
 const later=join(stateRoot,'state/events-after-restore.csv');
 await saved('later-assembly.native.json',async()=>await native.assembleObjectSession(session,later));
 const before=await inventory(stateRoot);await saved('before-reopen.inventory.json',async()=>before);
 progress('SAME_BACKUP_REOPEN_PRESERVES_CURRENT_STATE');
 const again=await saved('same-backup-reopen.sdk.json',async()=>await recovery.restore({bundle,expectedRecordSha256:recordSha256,signal:abort.signal}));
 check(again.ok&&again.native.reused===true,'SAME_BACKUP_REOPEN_REQUIRED');
 const after=await inventory(stateRoot);
 check(JSON.stringify(before)===JSON.stringify(after),'SAME_BACKUP_OVERWROTE_LATER_NATIVE_STATE');
 reopened=await native.inspectObjectSession(session,{signal:abort.signal});
 const accounting=await native.accountObjectSession(session,{finalize:false,signal:abort.signal});
 check(reopened.status==='COMPLETE'&&reopened.sessionId===source.sessionId&&reopened.assemblies.length===2&&
  accounting.entries[0]?.outcome==='NO_PAYMENT_REQUIRED','REOPENED_NATIVE_STATE_CHANGED');
 await saved('reopened.native.json',async()=>reopened);await saved('accounting-after.native.json',async()=>accounting);
 const exchanges=(await readFile(join(records,'local-http-exchanges.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 check(exchanges.length===1,'ORIGINAL_LOCAL_GET_REPLAYED');
 check(sha(await readFile(dataPath))===hash,'ORIGINAL_CSV_CHANGED');
 const result={schema:'stellar-forge.standalone-object-recovery-receiving.v1',state:'COMPLETE',operationId,
  completedAt:new Date().toISOString(),sourceCommit:'b09765c47a6e71b552bfc7b38958d7b1b9750678',
  application:runtime,stateRoot,session,bundle,recordSha256,reviewSha256:backed.native.reviewSha256,
  nativeSessionId:source.sessionId,sourceData:{bytes:267,sha256:hash,kind:'RECEIVED_ORIGINAL_LOCAL_CSV',
   archivedSessionId:'f269be5c-ca82-4a78-b603-3f526abf90a9',sourceSessionId:'a8e6646c-a8ff-4545-9399-362f3e831bb4'},
  restoredOriginalSessionId:true,sameBackupReused:true,laterNativeStatePreserved:true,
  nativeAssemblies:reopened.assemblies.length,nativeStatus:reopened.status,
  paymentAccounting:accounting.entries.map(e=>({intentId:e.intentId,outcome:e.outcome})),
  localHttpsRequests:exchanges.length,newPayments:0,ledger:'ABSENT',
  retainedStateFiles:after.length,retainedStateBytes:after.reduce((n,f)=>n+f.bytes,0),
  publicSdkExports:true,cliPath:join(runtime,'object-cli.mjs'),records:records};
 await save(join(records,'customer-result.json'),result);
 progress('COMPLETE');process.stdout.write(JSON.stringify(result)+'\n');
}catch(e){error=e;await save(join(records,'customer-failure-'+Date.now()+'.json'),{state:'PARTIAL',phase,
 code:e.code??e.message,message:e.message,stack:e.stack,result:e.result??null}).catch(()=>{});
 process.stderr.write(JSON.stringify({state:'PARTIAL',phase,code:e.code??e.message,message:e.message,stack:e.stack,result:e.result??null})+'\n');
 process.exitCode=1;
}finally{await closeServers();process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
