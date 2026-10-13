// Complete same-source recovery of the already received native a8e ObjectSession.
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename,lstat,readdir,open} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.SCF_ACCEPTANCE_ROOT;
const runtime=join(root,'application/stellar/scf-starforge-20261009/sf88-operator-buyer-cli');
const {ObjectSessionRecovery,ObjectSessionRecoveryResult,ObjectSessionRecoveryError,WorkspaceRecovery}=await import(pathToFileURL(join(runtime,'node/index.mjs')));
const native=await import(pathToFileURL(join(runtime,'object-session.mjs')));
const stateRoot=process.env.SCF_RECOVERY_EXISTING_SOURCE;
if(!stateRoot||!stateRoot.startsWith('/'))throw new Error('EXISTING_CANONICAL_SOURCE_REQUIRED');
const session=join(stateRoot,'state/sessions/events'),records=join(root,'records');
const bundle=join(root,'object-session-backup'),heldOriginal=join(root,'original-quiesced-state');
const operationId='SCF-STANDALONE-OBJECT-RECOVERY-33E6-20261012';
const sourceSessionId='a8e6646c-a8ff-4545-9399-362f3e831bb4';
const hash='80bc251619f969166dd39f60290b0450663fbf54ab2dc037a2635dbfb921c19a';
const archiveHash='33aad8127ff99514ed990607fea1e0ab908da3a6788029708cccc48239f03957';
const sha=b=>createHash('sha256').update(b).digest('hex'),j=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const check=(value,code)=>{if(!value)throw Object.assign(new Error(code),{code});};
async function exists(p){try{return await lstat(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function save(p,value){const data=j(value),f=await open(p,'wx',0o600);try{await f.writeFile(data);await f.sync();}finally{await f.close();}return{path:p,bytes:data.length,sha256:sha(data)};}
async function saved(name,call){const p=join(records,name);if(await exists(p))return JSON.parse(await readFile(p,'utf8'));const value=await call();await save(p,value);return value;}
async function inventory(p){const files=[];async function walk(dir){for(const name of(await readdir(dir)).sort()){const f=join(dir,name),s=await lstat(f);check(!s.isSymbolicLink(),'SYMLINK_REFUSED');if(s.isDirectory())await walk(f);else{check(s.isFile(),'REGULAR_FILE_REQUIRED');const b=await readFile(f);files.push({path:relative(p,f),bytes:b.length,sha256:sha(b)});}}}await walk(p);return files;}
const abort=new AbortController(),stop=()=>abort.abort();process.once('SIGTERM',stop);process.once('SIGINT',stop);
let phase='EXISTING_NATIVE_SOURCE';
const progress=stage=>{phase=stage;process.stdout.write(JSON.stringify({state:'PROGRESS',stage,operationId})+'\n');};
try{
 await mkdir(records,{recursive:true,mode:0o700});
 const archive=await readFile(join(root,'input/original-object-recovery.zip'));
 check(archive.length===291120&&sha(archive)===archiveHash,'IMMUTABLE_ORIGINAL_ARCHIVE_CHANGED');
 const data=await readFile(join(root,'input/original-events.csv'));
 check(data.length===267&&sha(data)===hash,'ORIGINAL_267_BYTE_DATA_CHANGED');
 check(typeof ObjectSessionRecovery==='function'&&typeof WorkspaceRecovery==='function'&&typeof ObjectSessionRecoveryResult==='function'&&typeof ObjectSessionRecoveryError==='function','ORIGINAL_PUBLIC_SDK_EXPORTS_REQUIRED');
 const request=await saved('existing-source-acceptance-request.json',async()=>({schema:'stellar-forge.standalone-existing-object-recovery.v1',operationId,sourceCommit:'b09765c47a6e71b552bfc7b38958d7b1b9750678',stateRoot,session,bundle,sourceSessionId,originalArchive:{bytes:291120,sha256:archiveHash},sourceData:{bytes:267,sha256:hash},kind:'RECOVERY_OF_COMPLETED_NATIVE_SOURCE',createdAt:new Date().toISOString()}));
 check(request.operationId===operationId&&request.stateRoot===stateRoot&&request.session===session&&request.bundle===bundle&&request.sourceSessionId===sourceSessionId,'ORIGINAL_EXISTING_SOURCE_REQUEST_CHANGED');
 const source=await saved('existing-source-before.native.json',()=>native.inspectObjectSession(session,{signal:abort.signal}));
 check(source.sessionId===sourceSessionId&&source.status==='COMPLETE'&&source.objectSha256===hash&&source.downloadedBytes===267&&source.capAllocatedAtomic==='0','COMPLETED_ORIGINAL_NATIVE_SOURCE_REQUIRED');
 const baselineAssemblies=source.assemblies.length;
 const environment={...process.env,SF88_BACKUP_PASSPHRASE:(await readFile(join(root,'private/recovery-passphrase.txt'),'utf8')).trim()};
 const recovery=new ObjectSessionRecovery({runtimeDirectory:runtime,node:process.execPath,environment,timeoutMs:240000,cleanupGraceMs:15000});
 if(!await exists(join(records,'backup.sdk.json'))){
  progress('EXACT_EXISTING_NATIVE_REVIEW');
  const accounting=await saved('accounting-before.native.json',()=>native.accountObjectSession(session,{finalize:false,signal:abort.signal}));
  check(accounting.entries.length===1&&accounting.entries[0].outcome==='NO_PAYMENT_REQUIRED','RECORDED_FREE_ACCOUNTING_REQUIRED');
  const reviewed=await saved('review.sdk.json',()=>recovery.inspect({directory:session,stateRoot,signal:abort.signal}));
  check(reviewed.ok&&reviewed.native.absentLedger.state==='ABSENT','NATIVE_REVIEW_NOT_COMPLETE');
  progress('SF101_ENCRYPTED_SNAPSHOT');
  await saved('backup.sdk.json',()=>recovery.snapshot({directory:session,stateRoot,output:bundle,expectedReviewSha256:reviewed.native.reviewSha256,quiesced:true,signal:abort.signal}));
 }
 const backed=JSON.parse(await readFile(join(records,'backup.sdk.json'),'utf8'));
 check(backed.ok&&backed.native.status==='OBJECT_SESSION_BACKUP_CREATED','NATIVE_BACKUP_NOT_COMPLETE');
 const recordSha256=backed.native.recordSha256;
 progress('INDEPENDENT_CLI_VERIFICATION');
 const verified=await saved('verified.sdk.json',()=>recovery.verify({bundle,expectedRecordSha256:recordSha256,signal:abort.signal}));
 check(verified.ok,'AUTHENTICATED_VERIFICATION_REQUIRED');
 progress('CANONICAL_NATIVE_RESTORE');
 if(!await exists(join(records,'restored.sdk.json'))){
  const marker=join(stateRoot,'.sf88-object-restorations',recordSha256+'.json');
  if(!await exists(marker)){
   if(await exists(stateRoot)){check(!await exists(heldOriginal),'QUIESCED_ORIGINAL_ALREADY_HELD');await rename(stateRoot,heldOriginal);}
   check(await exists(heldOriginal),'ORIGINAL_QUIESCED_SOURCE_REQUIRED');
  }
  const restored=await recovery.restore({bundle,expectedRecordSha256:recordSha256,signal:abort.signal});
  check(restored.ok,'NATIVE_RESTORE_NOT_COMPLETE');await save(join(records,'restored.sdk.json'),restored);
 }
 let reopened=await native.inspectObjectSession(session,{signal:abort.signal});
 check(reopened.status==='COMPLETE'&&reopened.sessionId===sourceSessionId&&reopened.configurationSha256===source.configurationSha256&&reopened.objectSha256===hash&&reopened.capAllocatedAtomic==='0','RESTORED_ORIGINAL_IDENTITY_CHANGED');
 await saved('restored.native.json',async()=>reopened);
 const afterReview=await recovery.inspect({directory:session,stateRoot,signal:abort.signal});
 check(afterReview.ok&&afterReview.native.absentLedger.state==='ABSENT','RESTORE_CREATED_LEDGER');
 progress('LATER_NATIVE_ASSEMBLY');
 const later=join(stateRoot,'state/events-after-standalone-recovery.csv');
 await saved('later-assembly.native.json',()=>native.assembleObjectSession(session,later));
 check(sha(await readFile(later))===hash,'LATER_NATIVE_ASSEMBLY_CHANGED_DATA');
 const before=await inventory(stateRoot);await saved('before-reopen.inventory.json',async()=>before);
 progress('SAME_BACKUP_REOPEN_PRESERVES_CURRENT_STATE');
 const again=await saved('same-backup-reopen.sdk.json',()=>recovery.restore({bundle,expectedRecordSha256:recordSha256,signal:abort.signal}));
 check(again.ok&&again.native.reused===true,'SAME_BACKUP_REOPEN_REQUIRED');
 const after=await inventory(stateRoot);
 check(JSON.stringify(before)===JSON.stringify(after),'SAME_BACKUP_OVERWROTE_LATER_NATIVE_STATE');
 reopened=await native.inspectObjectSession(session,{signal:abort.signal});
 const accounting=await native.accountObjectSession(session,{finalize:false,signal:abort.signal});
 check(reopened.status==='COMPLETE'&&reopened.sessionId===sourceSessionId&&reopened.assemblies.length===baselineAssemblies+1&&accounting.entries[0]?.outcome==='NO_PAYMENT_REQUIRED','REOPENED_NATIVE_STATE_CHANGED');
 await saved('reopened.native.json',async()=>reopened);await saved('accounting-after.native.json',async()=>accounting);
 check(sha(await readFile(join(root,'input/original-object-recovery.zip')))===archiveHash,'ORIGINAL_ARCHIVE_CHANGED');
 const result={schema:'stellar-forge.standalone-object-recovery-receiving.v1',state:'COMPLETE',operationId,completedAt:new Date().toISOString(),sourceCommit:'b09765c47a6e71b552bfc7b38958d7b1b9750678',application:runtime,stateRoot,session,bundle,recordSha256,reviewSha256:backed.native.reviewSha256,nativeSessionId:sourceSessionId,sourceMode:'RECOVERY_OF_COMPLETED_NATIVE_SOURCE',sourceData:{bytes:267,sha256:hash,kind:'EXISTING_NATIVE_FREE_OBJECT',archivedSessionId:'f269be5c-ca82-4a78-b603-3f526abf90a9',sourceSessionId},immutableOriginalArchive:{bytes:291120,sha256:archiveHash},restoredOriginalSessionId:true,sameBackupReused:true,laterNativeStatePreserved:true,priorNativeAssemblies:baselineAssemblies,nativeAssemblies:reopened.assemblies.length,nativeStatus:reopened.status,paymentAccounting:accounting.entries.map(e=>({intentId:e.intentId,outcome:e.outcome})),localHttpsRequests:0,newPayments:0,ledger:'ABSENT',retainedStateFiles:after.length,retainedStateBytes:after.reduce((n,f)=>n+f.bytes,0),publicSdkExports:true,cliPath:join(runtime,'object-cli.mjs'),records};
 await save(join(records,'customer-result.json'),result);progress('COMPLETE');process.stdout.write(JSON.stringify(result)+'\n');
}catch(e){await save(join(records,'existing-source-failure-'+Date.now()+'.json'),{state:'PARTIAL',phase,code:e.code??e.message,message:e.message,stack:e.stack,result:e.result??null}).catch(()=>{});process.stderr.write(JSON.stringify({state:'PARTIAL',phase,code:e.code??e.message,message:e.message,stack:e.stack,result:e.result??null})+'\n');process.exitCode=1;}
finally{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
