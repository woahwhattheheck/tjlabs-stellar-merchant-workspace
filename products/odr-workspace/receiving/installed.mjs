// Complete original application -> managed saved workspace -> independent receiving.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [repo,root,python,inputFile]=process.argv.slice(2);
assert(repo&&root&&python&&inputFile,'Supply retained repository, original receiving root, Python and exact input.');
const load=p=>import(pathToFileURL(join(repo,p)).href),sha=b=>createHash('sha256').update(b).digest('hex');
const {OdrInstallation}=await load('products/odr-workspace/client.mjs');
const {prepareOdrApplication}=await load('products/odr-workspace/application.mjs');
const {readOdrWorkspaceConfiguration,MerchantOdrWorkspaces}=await load('products/odr-workspace/workspace.mjs');
const {default:provider}=await load('products/odr-workspace/application-provider.mjs');
const {applicationField,applicationCommonFields}=await load('stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs');
const {atomic}=await load('products/odr-workspace/native/engine.mjs');
const input=JSON.parse(await fs.readFile(inputFile,'utf8')),inputSha=sha(await fs.readFile(inputFile)),adapter=join(repo,'products/odr-workspace');
assert.equal(input.schema,'stellar-forge.odr-installed-receiving-input.v1');
assert(typeof process.env.ODR_RECEIVING_ATTEMPT==='string','Use the original held-lease Python receiving driver.');
await fs.mkdir(root,{recursive:true,mode:0o700});
const once=async(p,v)=>{try{assert.deepEqual(JSON.parse(await fs.readFile(p,'utf8')),v)}catch(e){if(e.code!=='ENOENT')throw e;await atomic(p,v)}};
await once(join(root,'INPUT.json'),input);
let report;try{report=JSON.parse(await fs.readFile(join(root,'PROGRESS.json'),'utf8'));assert.equal(report.input_sha256,inputSha)}catch(e){if(e.code!=='ENOENT')throw e;report={schema:'stellar-forge.odr-installed-receiving-result.v1',operation_id:input.operation_id,input_sha256:inputSha,started_at:new Date().toISOString(),stages:[]}}
report.attempt_id=process.env.ODR_RECEIVING_ATTEMPT;report.complete=false;if(report.error){report.prior_errors=[...(report.prior_errors||[]),report.error];delete report.error;}
const progress=()=>atomic(join(root,'PROGRESS.json'),report),clients=new Set(),services=new Set(),owners=new Set();
const client=d=>{const c=new OdrInstallation({directory:d,sourceDirectory:adapter,python});clients.add(c);return c;};
const stage=async(name,fn)=>{const old=report.stages.find(s=>s.name===name),value=await fn(old?.result),record={name,result:value,completed_at:old?.completed_at||new Date().toISOString()};if(old)report.stages[report.stages.indexOf(old)]=record;else report.stages.push(record);await progress();process.stdout.write(JSON.stringify({stage:name,complete:true})+'\n');return value};
const mutation=async(label,body,fn)=>{const p=join(root,'requests',label+'.json');await fs.mkdir(dirname(p),{recursive:true,mode:0o700});let r;try{r=JSON.parse(await fs.readFile(p,'utf8'));assert.deepEqual(r.body,body)}catch(e){if(e.code!=='ENOENT')throw e;r={id:randomUUID(),body};await atomic(p,r)}return fn(r.id)};
const identity=async p=>{const b=await fs.readFile(p);return{path:p,bytes:b.length,sha256:sha(b)}};
const verifyIdentity=async v=>{assert.deepEqual(await identity(v.path),v);return v;};
const inputPath=async(p,kind='directory')=>{const st=await fs.lstat(p);assert(!st.isSymbolicLink());assert.equal(await fs.realpath(p),p);assert(kind==='file'?st.isFile():st.isDirectory());return{path:p,kind,exists:true,dev:st.dev,ino:st.ino,...(kind==='file'?{bytes:st.size,sha256:sha(await fs.readFile(p))}:{})}};
const selectedExecutable=async p=>{const executable=await fs.realpath(p);return{executable,inputs:[await inputPath(executable,'file')]}};
async function until(fn,label){let error;const end=Date.now()+30000;while(Date.now()<end){try{const r=await fn();if(r)return r}catch(e){error=e}await new Promise(r=>setTimeout(r,50))}throw Error(label+': '+(error?.message||'not received'))}
async function launch(directory,label){
 const type=provider.catalog({field:applicationField,common:applicationCommonFields}).find(t=>t.id==='odr-review');
 const prepared=await prepareOdrApplication(type,{directory,python,port:0},{sourceDirectory:adapter,inputPath,selectedExecutable});
 const id=randomUUID(),out=join(root,'services',label,id);await fs.mkdir(out,{recursive:true,mode:0o700});
 const request={command:'odr-workspace',args:provider.runArguments({args:prepared.args,requestId:id}),applicationId:sha(id).slice(0,24)};
 await provider.verifyLaunch(request,out);const command=await provider.prepareChild(request,out,[],process.env);
 const child=spawn(command.executable,command.args,command.options),observer=provider.createObserver(request,out,{pid:child.pid}),service={child,observer,request,out,stderr:''};services.add(service);
 child.stdout.on('data',b=>observer.write(b));child.stderr.on('data',b=>{service.stderr+=b.toString()});
 await new Promise((yes,no)=>{child.once('spawn',yes);child.once('error',no)});
 service.ready=await until(async()=>{if(child.exitCode!==null||child.signalCode!==null)throw Error(service.stderr);try{return JSON.parse(await fs.readFile(join(out,'application-url.json'),'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}},'Original managed ready file');
 await atomic(join(out,'PROCESS_RECEIVED.json'),{pid:child.pid,ready:service.ready,command});return service;
}
async function stop(s){
 if(s.child.exitCode===null&&s.child.signalCode===null){const ended=new Promise(r=>s.child.once('close',r));s.child.kill('SIGTERM');let forced=false;const timer=setTimeout(()=>{forced=true;s.child.kill('SIGKILL')},30000);try{await ended}finally{clearTimeout(timer)}assert(!forced,'Original save-draining service must stop normally.')}
 await s.observer.close();services.delete(s);
}
let browser;
async function ensureBrowser(){
 if(browser)return browser;
 assert(input.browser&&input.playwright,'Select the actual existing permitted browser and Playwright.');
 await verifyIdentity(input.browser);
 const pw=await import(pathToFileURL(input.playwright).href);
 browser=await pw.chromium.launch({executablePath:input.browser.path,headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],timeout:30000});return browser;
}
async function browserOperate(service,installed,label){
 const complete=join(root,label+'-COMPLETE.json');
 try{const saved=JSON.parse(await fs.readFile(complete,'utf8'));for(const a of saved.artifacts)await verifyIdentity(a);const actual=(await client(installed.paths.directory).state()).result;assert.equal(actual.id,saved.workspace_id);assert(actual.revision>=saved.revision);return saved}catch(e){if(e.code!=='ENOENT')throw e}
 const b=await ensureBrowser(),ctx=await b.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(service.ready.url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#save-installed')&&!document.querySelector('#save-installed').disabled);
  const current=await page.evaluate(async()=>{const r=await fetch('/api/current');if(!r.ok)throw Error('Original current handover unavailable');return r.json()});
  assert.equal(current.workspace.id,installed.workspace_id);
  const choice=join(root,label+'-EDIT.json');let edit;
  try{edit=JSON.parse(await fs.readFile(choice,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;
   const rows=Object.values(current.workspace.records.notifications);assert(rows.length,'Receive the actual original notification/review case.');
   const row=rows[0];edit={id:row.id,revision:row.revision,before:row.value,notes:(row.value.notes||'')+'\nInstalled receiving '+input.operation_id+' / '+label+'; authored internal operating note.'};await atomic(choice,edit);
  }
  const actual=current.workspace.records.notifications[edit.id];assert(actual,'Original selected record remains present.');
  if(actual.revision===edit.revision){
   assert.deepEqual(actual.value,edit.before);
   await page.locator('#actor').fill('Original installed receiving operator');
   await page.locator('nav [data-tab="notifications"]').click();
   await page.locator('[data-record="'+edit.id+'"]').click();
   await page.locator('#discard-draft').click();
   await page.locator('#editor [data-field="notes"]').fill(edit.notes);
   await page.locator('#editor button[type="submit"]').click();
   await page.waitForFunction(({rid,rev})=>document.querySelector('[data-record="'+rid+'"]')?.textContent.includes('revision '+rev),{rid:edit.id,rev:edit.revision+1});
   // Receive a real committed save whose HTTP response is intentionally lost.
   let first=true;
   await page.route('**/api/save',async route=>{
    if(!first)return route.continue();first=false;
    const body=JSON.parse(route.request().postData());await atomic(join(root,label+'-PENDING_SAVE.json'),body);
    const response=await route.fetch();assert.equal(response.status(),200);await atomic(join(root,label+'-COMMITTED_RECEIPT.json'),await response.json());await route.abort('failed');
   });
   await page.locator('#save-installed').click();
   await page.waitForFunction(()=>document.querySelector('#save-installed').textContent.includes('pending'));
   await page.locator('#save-installed').click();
   await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Received installed workspace revision'));
   await page.unroute('**/api/save');
  }else{
   assert(actual.revision>=edit.revision+1);const retained=current.workspace.history.find(x=>x.kind==='notifications'&&x.id===edit.id&&x.revision===edit.revision+1);assert(retained&&retained.value.notes===edit.notes,'Receive the exact earlier original edit before continuing.');
   const pendingPath=join(root,label+'-PENDING_SAVE.json');
   try{const pending=JSON.parse(await fs.readFile(pendingPath,'utf8'));const receipt=await page.evaluate(p=>window.ODR_INSTALLED.save(p.handover,p.expectedDigest),pending);assert.equal(receipt.payloadDigest,pending.handover.payload_sha256)}catch(e){if(e.code!=='ENOENT')throw e}
  }
  const after=await page.evaluate(async()=>{const r=await fetch('/api/current');if(!r.ok)throw Error('Saved original handover missing');return r.json()});
  assert(after.workspace.history.some(x=>x.kind==='notifications'&&x.id===edit.id&&x.revision===edit.revision+1&&x.value.notes===edit.notes));
  assert.equal(after.workspace.id,installed.workspace_id);assert.deepEqual(after.workspace.events.slice(0,current.workspace.events.length),current.workspace.events);
  const output=join(root,label+'-HANDOVER.json');await atomic(output,after);
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('#installed-status').textContent.includes('Installation'));
  const reopened=await page.evaluate(async()=>{const r=await fetch('/api/current');return r.json()});assert.deepEqual(reopened,after);
  const png=join(root,label+'.png');await page.screenshot({path:png,fullPage:true});assert.deepEqual(errors,[]);
  const result={workspace_id:after.workspace.id,revision:after.workspace.revision,payload_sha256:after.payload_sha256,record_id:edit.id,record_revision:edit.revision+1,artifacts:[await identity(output),await identity(png)],page_errors:errors};await atomic(complete,result);return result;
 }finally{await ctx.close()}
}
try{
 await verifyIdentity(input.application);await verifyIdentity(input.handover);
 const first=client(join(root,'installation'));
 const prepared=await stage('prepare',()=>mutation('prepare',{application:input.application.path,handover:input.handover.path,node:input.node},id=>first.prepare({application:input.application.path,handover:input.handover.path,node:input.node,python},id)));
 const installed=prepared.installation;
 const original=JSON.parse(await fs.readFile(input.handover.path,'utf8'));assert.equal(installed.workspace_id,original.workspace.id);
 await stage('original-state',async()=>{const s=(await first.state()).result;assert.equal(s.id,original.workspace.id);assert.deepEqual(s.history.slice(0,original.workspace.history.length),original.workspace.history);return{workspace_id:s.id,revision:s.revision,history:s.history.length}});
 const transfers=join(root,'transfers');await fs.mkdir(transfers,{recursive:true,mode:0o700});
 const configPath=join(root,'connection.json');await once(configPath,{schema:'stellar-forge.odr-workspace-connection.v1',workspaces:{original:{directory:installed.paths.directory,sourceDirectory:adapter,python,node:input.node,application:input.application.path,transferDirectory:transfers}}});
 const owner=new MerchantOdrWorkspaces({odrWorkspaces:await readOdrWorkspaceConfiguration(configPath)});owners.add(owner);
 assert.deepEqual((await owner.call('merchant_odr_state',{workspace:'original'})).result,(await first.state()).result);
 const service=await launch(installed.paths.directory,'original');
 await stage('original-managed-browser',()=>browserOperate(service,installed,'original'));await stop(service);
 // Same exact source adoption is an original named operation and replay; a real
 // complete successor can be selected explicitly without manufacturing an edit.
 const selectedApp=input.successor?.path||input.application.path;if(input.successor)await verifyIdentity(input.successor);
 await stage('source-adoption',()=>mutation('adopt',{application:selectedApp},id=>first.adoptSource({application:selectedApp},id)));
 const current=(await first.inspect()).installation;
 const reopened=await launch(current.paths.directory,'reopened');await stage('managed-reopen',async()=>({identity:reopened.ready.original}));await stop(reopened);
 for(const kind of ['workspace','report','application'])await stage('export-'+kind,()=>mutation('export-'+kind,{kind},id=>owner.call('merchant_odr_export',{workspace:'original',kind,requestId:id})));
 const snapshot=await stage('snapshot',()=>mutation('snapshot',{output:join(transfers,'Original_Installation.zip')},id=>first.snapshot(join(transfers,'Original_Installation.zip'),id)));await verifyIdentity(snapshot.result.archive);
 const second=client(join(root,'received'));
 const received=await stage('receive',()=>mutation('receive',{archive:snapshot.result.archive.path},id=>second.receive({archive_path:snapshot.result.archive.path,node:input.node,python},id)));
 assert.notEqual(received.installation.installation_id,current.installation_id);assert.equal(received.installation.workspace_id,current.workspace_id);
 const sender=(await first.state()).result,receiver=(await second.state()).result;assert.equal(sender.id,receiver.id);assert.deepEqual(receiver.history.slice(0,sender.history.length),sender.history);
 const receivedService=await launch(received.installation.paths.directory,'received');
 await stage('received-managed-browser',()=>browserOperate(receivedService,received.installation,'received'));await stop(receivedService);
 const onward=await stage('onward-snapshot',()=>mutation('onward',{output:join(transfers,'Received_Onward_Installation.zip')},id=>second.snapshot(join(transfers,'Received_Onward_Installation.zip'),id)));await verifyIdentity(onward.result.archive);
 const third=client(join(root,'onward'));
 const onwardReceived=await stage('onward-receive',()=>mutation('onward-receive',{archive:onward.result.archive.path},id=>third.receive({archive_path:onward.result.archive.path,node:input.node,python},id)));
 assert.equal(onwardReceived.installation.workspace_id,current.workspace_id);assert.notEqual(onwardReceived.installation.installation_id,received.installation.installation_id);
 assert.deepEqual((await third.state()).result,(await second.state()).result);
 report.complete=true;report.finished_at=new Date().toISOString();report.installations={original:current,received:received.installation,onward:onwardReceived.installation};report.outputs={original:snapshot.result.archive,onward:onward.result.archive};await progress();
}catch(error){report.error={message:error.message,stack:error.stack};await progress();process.stderr.write(JSON.stringify(report.error)+'\n');process.exitCode=1}
finally{
 for(const s of [...services])try{await stop(s)}catch(e){report.cleanup_error=e.message;report.complete=false;process.exitCode=1}
 if(browser)await browser.close();await Promise.allSettled([...owners].map(x=>x.close()));await Promise.allSettled([...clients].map(x=>x.close()));
 await atomic(join(root,'RESULT.json'),report);process.stdout.write(JSON.stringify({complete:report.complete,result:join(root,'RESULT.json'),error:report.error?.message})+'\n');
}
