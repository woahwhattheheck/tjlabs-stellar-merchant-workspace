// Original supplier-account operator receiving on the retained merchant source.
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { pathToFileURL } from 'node:url';
import { SourceTextModule } from 'node:vm';
const ROOT=process.argv[2], SOURCE=join(ROOT,'source'), SCF=join(SOURCE,'stellar/scf-starforge-20261009');
const originalFile='/workspace/scratch/84ebf86ab95a/native-merchant-application-84eb/upstreams.json';
const P=join(SCF,'sf30-seller-sdk/supplier-quota/workspace'), OP='SCF-SUPPLIER-ACCOUNT-WORKSPACE-84EB-20261012';
const hash=b=>createHash('sha256').update(b).digest('hex'), json=x=>JSON.stringify(x,null,2)+'\n';
const require=(condition,message)=>{if(!condition)throw Object.assign(new Error(message),{code:message});};
const file=join(ROOT,'operation.json');
async function exists(path){try{await stat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
await mkdir(ROOT,{recursive:true,mode:0o700});
let journal;
if(await exists(file))journal=JSON.parse(await readFile(file,'utf8'));
else {
  const original=await readFile(originalFile,'utf8');
  journal={schema:'stellar-forge.supplier-account-native-receiving.v1',operation:OP,
    startedAt:new Date().toISOString(),originalFile,originalText:original,originalSha256:hash(original),
    steps:{},complete:false};
}
require(journal.operation===OP&&hash(journal.originalText)===journal.originalSha256,'ORIGINAL_RECEIVING_IDENTITY_CHANGED');
async function save(){const next=file+'.next';await writeFile(next,json(journal),{mode:0o600});await rename(next,file);}
await save();
const snapshot=()=>({schema:journal.schema,operation:OP,complete:journal.complete,originalSha256:journal.originalSha256,
  completedSteps:Object.keys(journal.steps),closedAt:journal.closedAt,report:join(ROOT,'operator-report.json')});
if(journal.complete){process.stdout.write(json(snapshot()));process.exit(0);}
const {startSupplierAccountWorkspace}=await import(pathToFileURL(join(P,'server.mjs')));
const {main:cli}=await import(pathToFileURL(join(P,'cli.mjs')));
const {default:provider,supplierAccountStartup}=await import(pathToFileURL(join(P,'application-provider.mjs')));
const {applicationField,applicationCommonFields}=await import(pathToFileURL(join(SCF,'distribution/runtime-workspace/application-provider.mjs')));
const {composeDistribution,contributedCommandHelp}=await import(pathToFileURL(join(SCF,'distribution/specification.mjs')));
const privateState=join(ROOT,'workspace'), receivedState=join(ROOT,'received-workspace');
let host=null,receivedHost=null;
async function capture(work){
  const write=process.stdout.write, chunks=[];
  process.stdout.write=function(chunk,encoding,callback){chunks.push(Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk));
    if(typeof encoding==='function')encoding();if(typeof callback==='function')callback();return true;};
  try{return {value:await work(),stdout:chunks.join('')};}finally{process.stdout.write=write;}
}
function response(selected,path,{body,authority=true,origin=true}={}){
  return new Promise((done,reject)=>{
    const u=new URL(selected.url), bytes=body===undefined?null:Buffer.from(JSON.stringify(body));
    const headers={...(authority?{'x-workspace-token':u.hash.slice(1)}:{}),
      ...(origin?{origin:u.origin}:{}),...(bytes?{'content-type':'application/json','content-length':String(bytes.length)}:{})};
    const r=httpRequest({host:'127.0.0.1',port:Number(u.port),path,method:bytes?'POST':'GET',headers,agent:false},res=>{
      const chunks=[];res.on('data',b=>chunks.push(b));res.on('error',reject);res.on('end',()=>{
        const text=Buffer.concat(chunks).toString('utf8');let value;try{value=JSON.parse(text);}catch{value=text;}
        done({status:res.statusCode,headers:res.headers,value});
      });
    });r.setTimeout(15000,()=>r.destroy(new Error('ORIGINAL_OPERATOR_HTTP_TIMEOUT')));r.on('error',reject);r.end(bytes);
  });
}
async function api(selected,path,body){const r=await response(selected,path,{body});
  if(r.status!==200)throw Object.assign(new Error(r.value?.error??'ORIGINAL_OPERATOR_HTTP_FAILURE'),{code:r.value?.error,status:r.status,changeId:r.value?.changeId});
  return r.value;
}
const view=selected=>api(selected,'/api/workspace');
const byId=(selected,id)=>api(selected,'/api/change?id='+encodeURIComponent(id));
const args=row=>({id:row.id,revision:row.revision,reviewSha256:row.reviewSha256});
async function once(label,work){
  if(Object.hasOwn(journal.steps,label))return journal.steps[label];
  const result=await work();journal.steps[label]=result;await save();return result;
}
async function prepared(selected,label,work){
  if(Object.hasOwn(journal.steps,label))return byId(selected,journal.steps[label].id);
  const report=await api(selected,'/api/report'), note=OP+'/'+label;
  const found=report.changes.find(row=>row.review.note===note);
  const result=found??await work(note);journal.steps[label]={id:result.id};await save();return result;
}
async function applied(selected,label,row){return once(label,async()=>{
  const current=await byId(selected,row.id);
  return current.status==='APPLIED'?current:api(selected,current.status==='APPLYING'?'/api/recover':'/api/apply',args(current));
});}
function draft(source){return {sourceSha256:source.source.sha256,
  accounts:source.configuration.accounts.map(({bindings,...account})=>({...account})),
  assignments:source.configuration.bindings.map(b=>({binding:b.name,account:b.supplierAccount}))};}
try {
  const registration=composeDistribution({
    base:JSON.parse(await readFile(join(SCF,'distribution/distribution.json'),'utf8')),
    contributions:[{path:'stellar/scf-starforge-20261009/distribution/contributions/supplier-accounts.json',
      data:JSON.parse(await readFile(join(SCF,'distribution/contributions/supplier-accounts.json'),'utf8'))}]
  });
  require(registration.spec.commands['supplier-accounts'].endsWith('/workspace/cli.mjs'),'ORIGINAL_COMMAND_REGISTRATION_REQUIRED');
  require(contributedCommandHelp(registration).includes('supplier-accounts'),'ORIGINAL_INSTALLED_HELP_REQUIRED');
  const catalog=provider.catalog({common:applicationCommonFields,field:applicationField});
  require(catalog.length===1&&catalog[0].id==='supplier-accounts'&&catalog[0].terminal===false,'ORIGINAL_APPLICATION_CATALOG_REQUIRED');
  await once('distribution-and-application-registration',async()=>({command:'supplier-accounts',exports:3,assets:3,application:catalog[0].id}));
  host=await startSupplierAccountWorkspace({directory:privateState,upstreamsFile:originalFile});
  const initial=await once('original-source',()=>view(host));
  require(initial.source.sha256===journal.originalSha256&&initial.configuration.accounts.length>0,'ORIGINAL_MERCHANT_ACCOUNT_REQUIRED');
  await once('served-operator',async()=>{
    const page=await response(host,'/'),browser=await response(host,'/browser.mjs'),css=await response(host,'/style.css');
    require([page,browser,css].every(x=>x.status===200),'ORIGINAL_BROWSER_ASSET_REQUIRED');
    require(page.value.includes('Supplier accounts'),'ORIGINAL_OPERATOR_SCREEN_REQUIRED');
    new SourceTextModule(browser.value,{identifier:'original-supplier-accounts-browser'});
    const privateRead=await response(host,'/api/workspace',{authority:false});
    const foreignWrite=await response(host,'/api/prepare',{body:{},origin:false});
    require(privateRead.status===401&&foreignWrite.status===403,'ORIGINAL_OPERATOR_AUTHORITY_REQUIRED');
    return {http:200,browserBytes:Buffer.byteLength(browser.value),cssBytes:Buffer.byteLength(css.value),privateRead:privateRead.status,foreignWrite:foreignWrite.status};
  });
  await once('original-quota-before',()=>api(host,'/api/inspect-quota',{}));
  const originalDraft=draft(initial), alias=originalDraft.accounts[0].alias;
  const originalRps=originalDraft.accounts[0].requestsPerSecond,originalDay=originalDraft.accounts[0].callsPerDay;
  const desiredRps=originalRps===1?2:originalRps-1,desiredDay=originalDay===1?2:originalDay-1;
  const rate=await prepared(host,'rate-review',note=>{
    const proposal=structuredClone(originalDraft);proposal.accounts[0].requestsPerSecond=desiredRps;
    return api(host,'/api/prepare',{...proposal,note});
  });
  const daily=await prepared(host,'daily-review',note=>{
    const proposal=structuredClone(originalDraft);proposal.accounts[0].callsPerDay=desiredDay;
    return api(host,'/api/prepare',{...proposal,note});
  });
  await applied(host,'rate-saved',rate);
  await once('stale-review-retained',async()=>{
    const row=await byId(host,daily.id);
    if(row.status==='CONFLICT')return {id:row.id,status:row.status};
    const result=await response(host,'/api/apply',{body:args(row)});
    require(result.status===409&&result.value.error==='SUPPLIER_SOURCE_CHANGED','ORIGINAL_STALE_REVIEW_CONFLICT_REQUIRED');
    return {id:row.id,http:result.status,code:result.value.error};
  });
  const continued=await prepared(host,'daily-review-rebased',async note=>{
    const current=await view(host);return api(host,'/api/rebase',{id:daily.id,sourceSha256:current.source.sha256,note});
  });
  await applied(host,'daily-saved',continued);
  await once('independent-policy-edits-preserved',async()=>{
    const current=await view(host), account=current.configuration.accounts.find(x=>x.alias===alias);
    require(account.requestsPerSecond===desiredRps&&account.callsPerDay===desiredDay,'ORIGINAL_INDEPENDENT_LIMITS_REQUIRED');
    const row=await byId(host,continued.id),repeat=await api(host,'/api/recover',args(row));
    require(repeat.id===row.id&&repeat.revision===row.revision,'ORIGINAL_SAVE_OUTCOME_REQUIRED');
    return {id:repeat.id,revision:repeat.revision};
  });
  const rateRestore=await prepared(host,'rate-restore-review',async note=>{
    const current=await view(host);return api(host,'/api/restore-change',{id:rate.id,sourceSha256:current.source.sha256,note});
  });
  await applied(host,'rate-restored',rateRestore);
  await once('later-daily-edit-preserved',async()=>{
    const current=await view(host),account=current.configuration.accounts.find(x=>x.alias===alias);
    require(account.requestsPerSecond===originalRps&&account.callsPerDay===desiredDay,'ORIGINAL_SELECTIVE_RESTORE_REQUIRED');
    return {preserved:true};
  });
  const dayRestore=await prepared(host,'daily-restore-review',async note=>{
    const current=await view(host);return api(host,'/api/restore-change',{id:continued.id,sourceSha256:current.source.sha256,note});
  });
  await applied(host,'daily-restored',dayRestore);
  await once('original-source-restored',async()=>{
    const bytes=await readFile(originalFile);require(hash(bytes)===journal.originalSha256,'ORIGINAL_MERCHANT_BYTES_REQUIRED');
    return {sha256:hash(bytes),bytes:bytes.length};
  });
  await once('original-quota-after',()=>api(host,'/api/inspect-quota',{}));
  const pending=await prepared(host,'receiving-review',async note=>{
    const current=await view(host),proposal=draft(current);
    proposal.accounts.find(x=>x.alias===alias).requestsPerSecond=desiredRps;
    return api(host,'/api/prepare',{...proposal,note});
  });
  await host.close();host=null;
  const backupFile=join(ROOT,'private-workspace-backup.json');
  await once('private-backup',async()=>{
    if(await exists(backupFile)){const bytes=await readFile(backupFile);return {path:backupFile,bytes:bytes.length,sha256:hash(bytes)};}
    return (await capture(()=>cli(['backup','--state',privateState,'--out',backupFile]))).value;
  });
  const receivingDir=join(ROOT,'receiving-source'),receivingFile=join(receivingDir,'upstreams.json');
  await mkdir(receivingDir,{recursive:true,mode:0o700});
  await once('original-source-received',async()=>{
    if(!await exists(receivingFile))await writeFile(receivingFile,journal.originalText,{mode:0o600,flag:'wx'});
    require(hash(await readFile(receivingFile))===journal.originalSha256,'ORIGINAL_RECEIVING_BYTES_REQUIRED');
    return {path:receivingFile,sha256:journal.originalSha256};
  });
  await once('workspace-received',async()=> (await capture(()=>cli(['receive','--state',receivedState,'--upstreams',receivingFile,'--backup',backupFile]))).value);
  const startArgs=['serve','--state',receivedState,'--upstreams',receivingFile,'--port','0','--managed-source-sha256',hash(await readFile(receivingFile))];
  const started=await capture(()=>cli(startArgs));receivedHost=started.value;
  require(receivedHost,'ORIGINAL_CLI_HOST_REQUIRED');
  const request={applicationId:initial.id,command:'supplier-accounts',args:startArgs};
  const startup=started.stdout.trim().split('\n').find(x=>x.startsWith('{"schema":"stellar-forge.supplier-account-workspace-startup.v1"'));
  require(provider.matchRequest(request)&&supplierAccountStartup(request,startup),'ORIGINAL_APPLICATION_STARTUP_REQUIRED');
  await once('actual-application-startup-retained',async()=>{
    const directory=join(ROOT,'application-operations',randomUUID());await mkdir(directory,{recursive:true,mode:0o700});
    const observer=provider.createObserver(request,directory);observer.write(Buffer.from(started.stdout));await observer.close();
    const saved=JSON.parse(await readFile(join(directory,'application-url.json'),'utf8'));
    require(saved.url===receivedHost.url&&saved.workspaceId===initial.id,'ORIGINAL_STARTUP_URL_REQUIRED');
    return {path:join(directory,'application-url.json'),workspaceId:saved.workspaceId,source:saved.source};
  });
  const receivedReview=await prepared(receivedHost,'received-file-review-rebased',async note=>{
    const current=await view(receivedHost);require(current.id===initial.id,'ORIGINAL_WORKSPACE_ID_REQUIRED');
    return api(receivedHost,'/api/rebase',{id:pending.id,sourceSha256:current.source.sha256,note});
  });
  await applied(receivedHost,'received-source-saved',receivedReview);
  const restoreReceived=await prepared(receivedHost,'received-source-restore-review',async note=>{
    const current=await view(receivedHost);return api(receivedHost,'/api/restore-change',{id:receivedReview.id,sourceSha256:current.source.sha256,note});
  });
  await applied(receivedHost,'received-source-restored',restoreReceived);
  await once('received-original-bytes',async()=>{
    require(hash(await readFile(receivingFile))===journal.originalSha256,'RECEIVED_ORIGINAL_BYTES_REQUIRED');
    require(hash(await readFile(originalFile))===journal.originalSha256,'ORIGINAL_MERCHANT_BYTES_REQUIRED');
    const report=await api(receivedHost,'/api/report');
    require(report.workspaceId===initial.id&&report.changes.some(x=>x.id===pending.id&&x.status==='CANCELLED'),'ORIGINAL_REVIEW_HISTORY_REQUIRED');
    await writeFile(join(ROOT,'operator-report.json'),json(report),{mode:0o600});
    return {workspaceId:report.workspaceId,changes:report.changes.length,events:report.events.length,sha256:journal.originalSha256};
  });
  await receivedHost.close();receivedHost=null;
  await once('original-cli-reopen',async()=>{
    const reopened=(await capture(()=>cli(['show','--state',receivedState]))).value;
    require(reopened.id===initial.id&&reopened.source.sha256===journal.originalSha256,'ORIGINAL_REOPEN_REQUIRED');
    return {workspaceId:reopened.id,changes:reopened.history.total,sha256:reopened.source.sha256};
  });
  journal.complete=true;journal.closedAt=new Date().toISOString();delete journal.error;await save();
  process.stdout.write(json(snapshot()));
} catch(error) {
  journal.error={code:error.code??'ORIGINAL_RECEIVING_FAILED',message:error.message,at:new Date().toISOString()};
  await save().catch(()=>{});process.stderr.write(json({operation:OP,...journal.error,completedSteps:Object.keys(journal.steps)}));process.exitCode=1;
} finally {
  await receivedHost?.close().catch(error=>{process.stderr.write('Received host close: '+error.message+'\n');process.exitCode=1;});
  await host?.close().catch(error=>{process.stderr.write('Original host close: '+error.message+'\n');process.exitCode=1;});
}
