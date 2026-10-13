// Operate the installed edition of the two existing source workspaces.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,lstat,realpath,open,access} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [repo,root,python,inputFile]=process.argv.slice(2);
if(!repo||!root||!python||!inputFile)throw Error('Supply source root, original case, Python and retained inputs.');
const load=p=>import(pathToFileURL(join(repo,p)).href),digest=b=>createHash('sha256').update(b).digest('hex');
const {PartnerInstallation}=await load('products/partner-workspace/client.mjs');
const {readPartnerWorkspaceConfiguration,MerchantPartnerWorkspaces}=await load('products/partner-workspace/workspace.mjs');
const {preparePartnerApplication}=await load('products/partner-workspace/application.mjs');
const {default:provider}=await load('products/partner-workspace/application-provider.mjs');
const {applicationField,applicationCommonFields}=await load('stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs');
const adapter=join(repo,'products/partner-workspace'),input=JSON.parse(await readFile(inputFile,'utf8'));
assert.equal(input.schema,'stellar-forge.partner-installed-receiving-input.v1');
assert.deepEqual(Object.keys(input.products).sort(),['education','mobility']);
const report={schema:'stellar-forge.partner-installed-receiving-result.v1',operation_id:input.operation_id,input_sha256:digest(await readFile(inputFile)),started_at:new Date().toISOString(),complete:false,products:{},stages:[]};
const children=new Set(),clients=new Set(),owners=new Set();
await mkdir(root,{recursive:true,mode:0o700});
const atomic=async(path,value)=>{const tmp=path+'.'+randomUUID()+'.tmp',f=await open(tmp,'wx',0o600);try{await f.writeFile(JSON.stringify(value,null,2)+'\n');await f.sync();}finally{await f.close();}await rename(tmp,path);const d=await open(dirname(path),'r');try{await d.sync()}finally{await d.close()}};
const once=async(path,value)=>{const raw=JSON.stringify(value,null,2)+'\n';try{await writeFile(path,raw,{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(path,'utf8'),raw,'Retain the exact named input.')}};
await once(join(root,'INPUT.json'),input);
let state;try{state=JSON.parse(await readFile(join(root,'PROGRESS.json'),'utf8'));assert.equal(state.input_sha256,report.input_sha256);Object.assign(report,state)}catch(e){if(e.code!=='ENOENT')throw e}
report.attempt_id=process.env.PARTNER_RECEIVING_ATTEMPT;assert(report.attempt_id,'Use the retained original receiving driver.');
if(report.error){report.prior_errors=[...(report.prior_errors||[]),report.error];delete report.error;}delete report.cleanup_error;report.complete=false;delete report.finished_at;
const progress=()=>atomic(join(root,'PROGRESS.json'),report);
const stage=async(name,fn)=>{
 const saved=report.stages.find(x=>x.name===name);
 const result=await fn(saved?.result); // Reconcile each exact saved operation; reads use the live original state.
 const value={name,result,completed_at:saved?.completed_at||new Date().toISOString()};
 if(saved)report.stages[report.stages.indexOf(saved)]=value;else report.stages.push(value);
 await progress();process.stdout.write(JSON.stringify({stage:name,result})+'\n');return result;
};
const mutation=async(label,body,fn)=>{
 const path=join(root,'requests',label+'.json');await mkdir(dirname(path),{recursive:true,mode:0o700});
 let request;try{request=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(request.body,body)}catch(e){if(e.code!=='ENOENT')throw e;request={request_id:randomUUID(),body};await once(path,request)}
 return fn(request.request_id);
};
const clientFor=directory=>{const c=new PartnerInstallation({directory,sourceDirectory:adapter,python});clients.add(c);return c};
const until=async(fn,label,maximum=30000)=>{const end=Date.now()+maximum;let error;while(Date.now()<end){try{const r=await fn();if(r)return r}catch(e){error=e}await new Promise(r=>setTimeout(r,50))}throw Error(label+': '+(error?.message||'did not become ready'))};
const stop=async service=>{
 const child=service.child;if(child.exitCode===null&&child.signalCode===null){const end=new Promise(r=>child.once('close',r));child.kill('SIGTERM');let forced=false;const timer=setTimeout(()=>{forced=true;child.kill('SIGKILL')},30000);try{await end}finally{clearTimeout(timer)}assert.equal(forced,false,'Original service shutdown must release its operator lease.')}
 await service.observer.close();children.delete(service);
};
const inputPath=async(path,kind='directory')=>{const s=await lstat(path);assert(!s.isSymbolicLink());assert.equal(await realpath(path),path);assert(kind==='file'?s.isFile():s.isDirectory());return{path,kind,exists:true,dev:s.dev,ino:s.ino,...(kind==='file'?{bytes:s.size,sha256:digest(await readFile(path))}:{})}};
const selectedExecutable=async path=>{const executable=await realpath(path);return{executable,inputs:[await inputPath(executable,'file')]}};
const types=provider.catalog({field:applicationField,common:applicationCommonFields});
const http=async(url,path)=>{const r=await fetch(new URL(path,url),{signal:AbortSignal.timeout(30000)}),body=await r.text();assert.equal(r.status,200,path+': '+body.slice(0,1000));return JSON.parse(body)};
async function launch(product,directory,label){
 const type=types.find(x=>x.id==='partner-'+product);assert(type);
 const prepared=await preparePartnerApplication(type,{directory,python,port:0},{sourceDirectory:adapter,inputPath,selectedExecutable});
 const id=randomUUID(),out=join(root,'services',label,id);await mkdir(out,{recursive:true,mode:0o700});
 const request={command:'partner-workspace',args:provider.runArguments({args:prepared.args,requestId:id}),applicationId:digest(id).slice(0,24)};
 await provider.verifyLaunch(request,out);
 const command=await provider.prepareChild(request,out,[],process.env);
 const child=spawn(command.executable,command.args,command.options),observer=provider.createObserver(request,out,{pid:child.pid});
 const service={child,observer,out,command,request,stderr:'',stdout:''};children.add(service);
 child.stdout.on('data',b=>{service.stdout+=b.toString();observer.write(b)});
 child.stderr.on('data',b=>service.stderr+=b.toString());
 await new Promise((ok,no)=>{child.once('spawn',ok);child.once('error',no)});
 const ready=await until(async()=>{
  if(child.exitCode!==null||child.signalCode!==null)throw Error('Original staff process ended: '+service.stderr);
  try{return JSON.parse(await readFile(join(out,'application-url.json'),'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}
 },'Original managed readiness');
 assert.equal(ready.original.product,product);
 service.ready=ready;service.state=await http(ready.url,'/api/state');assert.equal(service.state.workspace.id,ready.original.workspace_id);
 await atomic(join(out,'PROCESS_RECEIVED.json'),{pid:child.pid,ready,command,workspace:service.state.workspace});
 return service;
}
async function browserReceive(service,product,expected,label){
 const modules=[process.env.PARTNER_PLAYWRIGHT_MODULE,process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES&&join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright/index.mjs'),'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'].filter(Boolean);
 let pw;for(const m of modules){try{pw=await import(pathToFileURL(m).href);break}catch{}}
 assert(pw,'Select the actual installed Playwright module.');
 const executablePath=process.env.PARTNER_BROWSER_EXECUTABLE;assert(executablePath,'Select the existing permitted Chromium executable.');
 await access(executablePath);
 const browser=await pw.chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],timeout:30000});
 try{
  const ctx=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(service.ready.url,{waitUntil:'networkidle'});
  await page.locator('#refresh').click();
  await until(async()=>{const text=await page.locator('#identity').innerText();return text.includes(expected.workspace.id)},'Original browser workspace identity');
  const current=await page.evaluate(async()=>{const r=await fetch('/api/state');if(!r.ok)throw Error('Original state did not load');return r.json()});
  assert.deepEqual(current,expected);
  const view=await page.locator('#view').innerText();assert(view.trim().length>50,'The original staff application must render its complete overview.');
  const shot=join(root,label+'.png');await page.screenshot({path:shot,fullPage:true});
  const raw=await page.evaluate(async()=>{const r=await fetch('/api/export/report');if(!r.ok)throw Error('Original report failed');return r.text()});
  assert(raw.trim().length>0);await writeFile(join(root,label+'.md'),raw,{mode:0o600});
  assert.deepEqual(errors,[]);
  return{workspace:current.workspace,rendered_characters:view.length,screenshot:shot,report:join(root,label+'.md'),page_errors:errors};
 }finally{await browser.close()}
}
const fullRecords=async installed=>{
 const c=clientFor(installed.paths.directory),state=(await c.state()).result,records=[];
 const fields=installed.product==='education'?{course:'courses',framework:'frameworks',review:'reviews',action:'actions',deliverable:'deliverables',note:'notes'}:{note:'notes'};
 for(const[kind,field]of Object.entries(fields))for(const item of state[field]||[]){
  const record=(await c.record(kind,item.id)).result,history=(await c.history(kind,item.id)).result;
  records.push({kind,id:item.id,record,history});
 }
 const sources=[];for(const item of state.sources){const value=(await c.call('workspace.source',{id:item.id})).result;const{original_file,...metadata}=value;sources.push({metadata,bytes:original_file.bytes,sha256:original_file.sha256})}
 return{state,records,sources};
};
async function originalOwner(name,selection){
 const path=join(root,name+'-connection.json');await once(path,{schema:'stellar-forge.partner-workspace-connection.v1',workspaces:{selected:selection}});
 const config=await readPartnerWorkspaceConfiguration(path),owner=new MerchantPartnerWorkspaces({partnerWorkspaces:config});owners.add(owner);return owner;
}
try{
 for(const product of ['mobility','education']){
  const p=input.products[product],prefix=product+'-',base=join(root,product);await mkdir(base,{recursive:true,mode:0o700});
  assert.equal(p.product,product);assert.equal(p.original_archive.workspace_id.length,32);
  const client=clientFor(join(base,'installation'));
  const prepared=await stage(prefix+'prepare',()=>mutation(prefix+'prepare',{source_root:p.source_root,source_manifest:p.source_manifest,workspace_archive:p.original_archive.path},id=>client.prepare({source_root:p.source_root,source_manifest:p.source_manifest,workspace_archive:p.original_archive.path},id)));
  const installed=prepared.installation;
  assert.equal(installed.product,product);assert.equal(installed.workspace_id,p.original_archive.workspace_id);
  const before=await stage(prefix+'original-state',async saved=>{const current=await fullRecords(installed);if(saved)assert.deepEqual(current,saved,'Retain the original complete business state across continuation.');return current;});
  assert(before.state.sources.length>0,'Receive the actual original source-workspace case.');
  if(product==='mobility')assert(before.state.imports.length>=2,'Retain the original two-city source intake.');
  else assert(before.state.reviews.length>0&&before.state.actions.length>0,'Retain the original education review/action case.');
  const transfers=join(base,'transfers');await mkdir(transfers,{mode:0o700,recursive:true});
  const owner=await originalOwner(product,{directory:installed.paths.directory,sourceDirectory:adapter,python,sourceRoot:p.source_root,sourceManifest:p.source_manifest,workspaceArchive:p.original_archive.path,transferDirectory:transfers});
  assert.deepEqual((await owner.call('merchant_partner_state',{workspace:'selected'})).result,before.state);
  if(product==='mobility'){
   const imported=before.state.imports.map(x=>x.id);assert(imported.every(Boolean));
   await stage(prefix+'comparison',()=>owner.call('merchant_partner_compare',{workspace:'selected',importIds:imported.slice(0,12)}));
   for(const importId of imported)await stage(prefix+'stations-'+importId,()=>owner.call('merchant_partner_stations',{workspace:'selected',importId}));
  }
  const service=await launch(product,installed.paths.directory,prefix+'operator');
  assert.deepEqual(service.state,before.state);
  await stage(prefix+'managed-browser',()=>browserReceive(service,product,before.state,prefix+'installed-browser'));
  await stop(service);
  const reopened=await launch(product,installed.paths.directory,prefix+'reopened');
  assert.deepEqual(reopened.state,before.state);await stop(reopened);
  await stage(prefix+'managed-reopen',async()=>({workspace:reopened.state.workspace,original_process:reopened.ready.original}));
  const exports={};for(const kind of ['report','csv','workspace']){
   exports[kind]=await stage(prefix+'export-'+kind,()=>mutation(prefix+'export-'+kind,{kind},id=>owner.call('merchant_partner_export',{workspace:'selected',kind,requestId:id})));
  }
  const adopted=await stage(prefix+'selected-source-adoption',()=>mutation(prefix+'adopt',{source_root:p.source_root,source_manifest:p.source_manifest},id=>client.adoptSource({source_root:p.source_root,source_manifest:p.source_manifest},id)));
  assert.equal(adopted.installation.workspace_id,installed.workspace_id);
  assert.deepEqual(await fullRecords(adopted.installation),before);
  const snapshot=await stage(prefix+'snapshot',()=>mutation(prefix+'snapshot',{},id=>owner.call('merchant_partner_snapshot',{workspace:'selected',requestId:id})));
  const archive=snapshot.result.archive,receiving=clientFor(join(base,'received'));
  const received=await stage(prefix+'receive',()=>mutation(prefix+'receive',{archive_path:archive.path},id=>receiving.receive({archive_path:archive.path},id)));
  assert.notEqual(received.installation.installation_id,installed.installation_id);
  assert.equal(received.installation.workspace_id,installed.workspace_id);
  assert.deepEqual(await fullRecords(received.installation),before);
  const receiveTransfers=join(base,'received-transfers');await mkdir(receiveTransfers,{mode:0o700,recursive:true});
  const cold=await originalOwner(product+'-received',{directory:received.installation.paths.directory,sourceDirectory:adapter,python,receiveArchive:archive.path,transferDirectory:receiveTransfers});
  assert.deepEqual((await cold.call('merchant_partner_state',{workspace:'selected'})).result,before.state);
  const child=await launch(product,received.installation.paths.directory,prefix+'received');
  await stage(prefix+'received-browser',()=>browserReceive(child,product,before.state,prefix+'received-browser'));
  await stop(child);
  const onward=await stage(prefix+'onward-snapshot',()=>mutation(prefix+'onward-snapshot',{},id=>cold.call('merchant_partner_snapshot',{workspace:'selected',requestId:id})));
  const onwardClient=clientFor(join(base,'onward'));
  const onwardReceived=await stage(prefix+'onward-receive',()=>mutation(prefix+'onward-receive',{archive_path:onward.result.archive.path},id=>onwardClient.receive({archive_path:onward.result.archive.path},id)));
  assert.notEqual(onwardReceived.installation.installation_id,received.installation.installation_id);
  assert.equal(onwardReceived.installation.workspace_id,installed.workspace_id);
  assert.deepEqual(await fullRecords(onwardReceived.installation),before);
  const originalPrepare=JSON.parse(await readFile(join(root,'requests',prefix+'prepare.json'),'utf8'));
  const inherited=await onwardClient.request(originalPrepare.request_id,installed.installation_id);
  assert.equal(inherited.result.request.operation_id,originalPrepare.request_id);
  report.products[product]={original_operation:p.original_operation,original_archive:p.original_archive,installation:installed,received:received.installation,onward:onwardReceived.installation,exports,snapshot:archive,onward_snapshot:onward.result.archive,original_workspace:before.state.workspace};
  await progress();
 }
 report.complete=true;
}catch(error){report.error={name:error.name,code:error.code,message:error.message,stack:error.stack};process.exitCode=1}
finally{
 for(const service of [...children]){try{await stop(service)}catch(e){report.cleanup_error=e.message;report.complete=false;process.exitCode=1}}
 await Promise.allSettled([...owners].map(x=>x.close()));await Promise.allSettled([...clients].map(x=>x.close()));
 report.finished_at=new Date().toISOString();await atomic(join(root,'RESULT.json'),report);
 process.stdout.write(JSON.stringify({complete:report.complete,result:join(root,'RESULT.json'),stages:report.stages.length,error:report.error})+'\n');
}
