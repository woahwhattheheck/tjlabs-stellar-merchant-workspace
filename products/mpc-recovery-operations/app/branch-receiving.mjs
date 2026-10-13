import {readFile,mkdir,open,rename,stat,readlink,chmod,readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import * as Model from './domain.mjs';
const operation='mpc-browser-branches-receiving-20261013';
const root=process.cwd(),out=resolve(process.env.MPC_BRANCH_DIRECTORY||resolve(root,'receiving-branches'));
const inputPath=process.env.MPC_BRANCH_ACCEPTED_WORKSPACE,guard=Number(process.env.MPC_RECEIVING_GUARD_FD);
if(!inputPath||!Number.isInteger(guard)||guard<3)throw Error('Use the original Python receiver with --browser-branches.');
await stat('/proc/self/fd/'+guard);
const sha=b=>createHash('sha256').update(b).digest('hex'),canonical=Model.canonical,require=createRequire(import.meta.url);
const acceptedArchive={bytes:654095,sha256:'c6ca635c06acb75c34792de9b62c73094f59c51140ac218b58274a03715ff8a7'};
const equal=(a,b)=>canonical(a)===canonical(b);
function requireThat(value,message){if(!value)throw Error(message);}
async function maybe(path){try{return await readFile(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function syncDir(path){const fd=await open(path,'r');try{await fd.sync();}finally{await fd.close();}}
async function atomic(path,bytes){await mkdir(dirname(path),{recursive:true});const temporary=path+'.new-'+randomUUID(),fd=await open(temporary,'wx',0o600);try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}await rename(temporary,path);await syncDir(dirname(path));}
async function fixed(path,bytes){const present=await maybe(path);if(present){requireThat(present.equals(Buffer.from(bytes)),'Retained original bytes differ: '+path);return;}await atomic(path,bytes);}
function packet(raw){const p=JSON.parse(raw);requireThat(p.format==='mpc-recovery-portable.v1'&&p.sha256===sha(canonical(p.snapshot)),'Portable input hash or format differs.');Model.receiveSnapshot(p.snapshot);return p;}
const acceptedRaw=await readFile(inputPath),accepted=packet(acceptedRaw);
const html=await readFile(resolve(root,'recovery-operations.html'),'utf8');
const encoded=JSON.parse(html.match(/const encoded=("(?:[^"\\]|\\.)*")/)[1]);
const embedded=JSON.parse(gunzipSync(Buffer.from(encoded,'base64'))),sourceFiles=[];
for(const f of embedded.files){
 requireThat(f.path&&!f.path.startsWith('/')&&!f.path.split('/').includes('..'),'Unsafe selected source path.');
 const data=await readFile(resolve(root,f.path));
 requireThat(data.equals(Buffer.from(f.content)),'Actual source differs from complete HTML: '+f.path);
 sourceFiles.push({path:f.path,bytes:data.length,sha256:sha(data)});
}
sourceFiles.push({path:'recovery-operations.html',bytes:Buffer.byteLength(html),sha256:sha(html)});
sourceFiles.sort((a,b)=>a.path.localeCompare(b.path));
requireThat(new Set(sourceFiles.map(x=>x.path)).size===sourceFiles.length,'Duplicate selected source.');
const sourceSelection={schema:'mpc.browser-branch-source.v1',files:sourceFiles};sourceSelection.sha256=sha(canonical(sourceSelection));
await mkdir(out,{recursive:true});await fixed(resolve(out,'source-selection.json'),canonical(sourceSelection)+'\n');
const initialIdentity={workspaceId:accepted.snapshot.workspace.id,revision:accepted.snapshot.workspace.revision,snapshotSha256:accepted.sha256};
const journalPath=resolve(out,'result.json'),old=await maybe(journalPath);
let report=old?JSON.parse(old):{operation,sourceSha256:sourceSelection.sha256,acceptedArchive,acceptedWorkspace:initialIdentity,startedAt:new Date().toISOString(),status:'RUNNING',steps:{},launches:[],artifacts:[]};
requireThat(report.operation===operation&&report.sourceSha256===sourceSelection.sha256&&equal(report.acceptedArchive,acceptedArchive)&&equal(report.acceptedWorkspace,initialIdentity),'Original receiving source/input differs.');
let retainTail=Promise.resolve();
const retain=()=>{const pending=retainTail.then(()=>atomic(journalPath,JSON.stringify(report,null,2)+'\n'));retainTail=pending.catch(()=>{});return pending;};
const artifact=async relative=>{requireThat(relative&&!relative.startsWith('/')&&!relative.split('/').includes('..'),'Unsafe output path.');const data=await readFile(resolve(out,relative)),d={path:relative,bytes:data.length,sha256:sha(data)},previous=report.artifacts.find(x=>x.path===relative);if(previous)requireThat(equal(previous,d),'Original artifact changed: '+relative);else report.artifacts.push(d);return d;};
if(report.status==='COMPLETE'){for(const f of report.artifacts)await artifact(f.path);requireThat(report.browserClosed&&report.serverClosed,'Completed resources are not closed.');console.log(JSON.stringify(report));process.exit(0);}
await retain();
const currentHost={bootId:(await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim(),pidNamespace:await readlink('/proc/self/ns/pid')};
// Original Invoice supervisor group census/closure, adapted to this Node owner.
// Source: Commons 28cf790fc5ee4803a51a4e8fa705c83c73c51857.
async function groupMembers(record){
 requireThat(record.bootId===currentHost.bootId&&record.pidNamespace===currentHost.pidNamespace,'Reconcile the original browser host/namespace before continuation.');
 requireThat(Number.isInteger(record.procPid)&&record.procPid>1&&record.procPgid===record.procPid&&record.procSession===record.procPid&&Number.isInteger(record.namespacePgid)&&record.namespacePgid===record.namespacePid&&record.namespacePid>1,'The original private browser group identity is incomplete.');
 const leader=await maybe('/proc/'+record.procPid+'/stat');
 if(leader){const fields=leader.toString().slice(leader.toString().lastIndexOf(')')+2).split(' ');requireThat(fields[19]===record.startTicks,'Original browser PID was reused; reconcile before signalling its retained group.');}
 const members=[];
 for(const name of await readdir('/proc')){
  if(!/^[0-9]+$/.test(name))continue;
  const path='/proc/'+name,body=await maybe(path+'/stat');if(!body)continue;
  const raw=body.toString(),fields=raw.slice(raw.lastIndexOf(')')+2).split(' ');
  if(Number(fields[2])!==record.procPgid||fields[0]==='Z')continue;
  let namespace;try{namespace=await readlink(path+'/ns/pid');}catch(e){if(e.code==='ENOENT'||e.code==='ESRCH')continue;throw e;}
  requireThat(namespace===record.pidNamespace&&Number(fields[3])===record.procSession&&BigInt(fields[19])>=BigInt(record.startTicks),'Retained browser group contains an unbound process; reconcile before signalling.');
  const again=await maybe(path+'/stat');if(!again)continue;const next=again.toString().slice(again.toString().lastIndexOf(')')+2).split(' ');
  if(next[19]!==fields[19]||Number(next[2])!==record.procPgid||next[0]==='Z')continue;
  members.push({procPid:Number(name),startTicks:fields[19]});
 }
 return members;
}
async function browserRecord(launch){const raw=await maybe(resolve(out,'control',launch.id+'.process.json'));if(!raw)return null;const record=JSON.parse(raw);requireThat(record.operation===operation&&record.launchId===launch.id&&record.sourceSha256===sourceSelection.sha256,'Original browser process binding differs.');return record;}
async function closeRecorded(launch,{allowOrphan=false}={}){
 if(launch.status==='CLOSED')return;
 const record=await browserRecord(launch);requireThat(record,'Original browser launch has no process identity; reconcile before retrying.');
 let members=await groupMembers(record);
 if(members.length){
  requireThat(allowOrphan,'The original private browser group must be closed before continuation.');
  for(const signal of ['SIGTERM','SIGKILL']){
   // Refresh the exact owned group before each signal; a leader's absence alone
   // is never evidence that its subprocesses have stopped.
   members=await groupMembers(record);if(!members.length)break;
   try{process.kill(-record.namespacePgid,signal);}catch(e){if(e.code!=='ESRCH')throw e;}
   for(let i=0;i<100;i++){members=await groupMembers(record);if(!members.length)break;await new Promise(r=>setTimeout(r,50));}
   if(!members.length)break;
  }
  requireThat(!(await groupMembers(record)).length,'Original browser process group remains active.');
 }
 launch.status='CLOSED';launch.closedAt=new Date().toISOString();launch.groupClosed=true;await retain();
}
for(const launch of report.launches)if(launch.status!=='CLOSED')await closeRecorded(launch,{allowOrphan:true});
let context=null,server=null,activeLaunch=null,launchPending=null,browserClosePromise=null,shutdownPromise=null,shutdownReason=null;const pageErrors=[];
function assertRunning(){if(shutdownReason)throw shutdownReason;}
const python=process.env.MPC_RECEIVING_PYTHON||'python3',chrome=process.env.MPC_CHROMIUM_EXECUTABLE;
requireThat(chrome,'Select an existing compatible Chromium with MPC_CHROMIUM_EXECUTABLE.');await stat(chrome);
const wrapper=resolve(out,'control','chrome-owner.py');
const wrapperSource='#!'+python+'\n'+"import json,os,pathlib\npath=pathlib.Path(os.environ[\"MPC_BRANCH_PROCESS_RECORD\"])\ntry: os.setsid()\nexcept PermissionError:\n if os.getpgrp()!=os.getpid(): raise\nproc_pid=int(os.readlink(\"/proc/self\"))\nraw=pathlib.Path(\"/proc/self/stat\").read_text()\nfields=raw[raw.rfind(\")\")+2:].split()\nif int(raw.split(\"(\",1)[0].strip())!=proc_pid or int(fields[2])!=proc_pid or int(fields[3])!=proc_pid: raise RuntimeError(\"Original browser did not enter its own private group/session\")\nrecord={\"operation\":os.environ[\"MPC_BRANCH_OPERATION\"],\"launchId\":os.environ[\"MPC_BRANCH_LAUNCH_ID\"],\"sourceSha256\":os.environ[\"MPC_BRANCH_SOURCE_SHA\"],\"procPid\":proc_pid,\"procPgid\":int(fields[2]),\"procSession\":int(fields[3]),\"namespacePid\":os.getpid(),\"namespacePgid\":os.getpgrp(),\"bootId\":pathlib.Path(\"/proc/sys/kernel/random/boot_id\").read_text().strip(),\"pidNamespace\":os.readlink(\"/proc/self/ns/pid\"),\"startTicks\":raw[raw.rfind(\")\")+2:].split()[19]}\npath.parent.mkdir(parents=True,exist_ok=True)\nwith path.open(\"x\",encoding=\"utf8\") as f:\n f.write(json.dumps(record,sort_keys=True)+\"\\n\");f.flush();os.fsync(f.fileno())\nd=os.open(str(path.parent),os.O_RDONLY)\ntry: os.fsync(d)\nfinally: os.close(d)\nos.execv(os.environ[\"MPC_BRANCH_CHROME\"],[os.environ[\"MPC_BRANCH_CHROME\"],*__import__(\"sys\").argv[1:]])\n";

await fixed(wrapper,wrapperSource);await chmod(wrapper,0o700);
let playwright;try{playwright=require('playwright');}catch{}
for(const base of [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules',resolve(root,'node_modules')].filter(Boolean)){if(playwright)break;try{playwright=require(resolve(base,'playwright'));}catch{}}
requireThat(playwright,'An existing Playwright installation is required.');
const legacyRaw=JSON.stringify(accepted.snapshot,null,2),url='http://127.0.0.1:18741/';
async function launch(profile){
 assertRunning();requireThat(!context&&!activeLaunch,'Only one browser interval may run.');
 activeLaunch={id:randomUUID(),profile,status:'PREPARING',startedAt:new Date().toISOString()};report.launches.push(activeLaunch);
 const preparing=activeLaunch;
 // Retain one pending owner before the first yield so shutdown cannot race
 // durable preparation. Only this live never-dispatched branch closes without
 // a process receipt; every dispatched launch still requires its original census.
 launchPending=(async()=>{
  await retain();
  if(!shutdownReason){preparing.status='STARTING';await retain();}
  if(shutdownReason){preparing.status='CLOSED';preparing.closedAt=new Date().toISOString();preparing.groupClosed=true;preparing.notDispatched=true;await retain();throw shutdownReason;}
  context=await playwright.chromium.launchPersistentContext(resolve(out,'profiles',profile),{
  executablePath:wrapper,headless:true,timeout:15000,viewport:{width:1440,height:1000},acceptDownloads:true,
  env:{...process.env,MPC_BRANCH_CHROME:chrome,MPC_BRANCH_OPERATION:operation,MPC_BRANCH_SOURCE_SHA:sourceSelection.sha256,MPC_BRANCH_LAUNCH_ID:activeLaunch.id,MPC_BRANCH_PROCESS_RECORD:resolve(out,'control',activeLaunch.id+'.process.json')},
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']
 });
  return context;
 })();
 try{context=await launchPending;}finally{launchPending=null;}
 assertRunning();context.setDefaultTimeout(60000);context.setDefaultNavigationTimeout(60000);
 requireThat(await browserRecord(activeLaunch),'Browser did not retain its process identity.');
 activeLaunch.status='RUNNING';await retain();
 if(profile==='main')await context.addInitScript(({expected,url})=>{if(location.origin===new URL(url).origin){const key='mpc-recovery-operations.v1',prior=localStorage.getItem(key);if(prior===null)localStorage.setItem(key,expected);else if(prior!==expected)throw Error('Original legacy bytes differ.');}},{expected:legacyRaw,url});
 context.on('page',p=>p.on('pageerror',e=>pageErrors.push(e.stack||e.message)));
 return context;
}
async function closeBrowser(){
 if(browserClosePromise)return browserClosePromise;
 const launchRecord=activeLaunch,owned=context;
 browserClosePromise=(async()=>{
  const closed=owned?owned.close().then(()=>({closed:true}),error=>({error})):Promise.resolve({closed:true});
  // Playwright's close can wait on a stuck child. Give graceful close a bounded
  // opportunity, then settle the exact retained group independently.
  await Promise.race([closed,new Promise(resolve=>setTimeout(resolve,2000))]);
  if(launchRecord)await closeRecorded(launchRecord,{allowOrphan:true});
  if(context===owned)context=null;if(activeLaunch===launchRecord)activeLaunch=null;
  const result=await Promise.race([closed,new Promise(resolve=>setTimeout(()=>resolve({error:Error('Browser group closed but its API close did not return.')}),1000))]);
  if(result.error)throw result.error;
 })();
 try{return await browserClosePromise;}finally{browserClosePromise=null;}
}
async function shutdown(reason=null){
 if(reason&&!shutdownReason)shutdownReason=reason;
 if(shutdownPromise)return shutdownPromise;
 shutdownPromise=(async()=>{
  const cleanup=[];
  // The original launch must return or time out before its retained process
  // receipt is reconciled. Never mark an in-flight launch closed by assumption.
  if(launchPending)try{await launchPending;}catch{}
  try{if(context||activeLaunch)await closeBrowser();}catch(e){cleanup.push(e.stack||String(e));}
  try{if(server){const owned=server;await new Promise((yes,no)=>owned.close(e=>e?no(e):yes()));if(server===owned)server=null;}}catch(e){cleanup.push(e.stack||String(e));}
  report.browserClosed=!context&&!activeLaunch&&report.launches.every(x=>x.status==='CLOSED'&&x.groupClosed===true);
  report.serverClosed=!server||!server.listening;
  if(cleanup.length){report.cleanupErrors=cleanup;throw Error('Original receiving cleanup remains unresolved:\n'+cleanup.join('\n'));}
  requireThat(report.browserClosed&&report.serverClosed,'Original receiving resources remain unresolved.');
 })();
 return shutdownPromise;
}
function interrupted(signal){
 const error=new Error('Original receiving interrupted by '+signal);
 process.exitCode=signal==='SIGTERM'?143:130;
 void shutdown(error).catch(e=>{report.cleanupErrors=[...(report.cleanupErrors||[]),e.stack||String(e)];}).finally(async()=>{
  report.status='INCOMPLETE';report.error=shutdownReason.stack;try{await retain();}catch(e){console.error(e.stack||String(e));}
 });
}
const terminate=()=>interrupted('SIGTERM'),interrupt=()=>interrupted('SIGINT');
process.on('SIGTERM',terminate);process.on('SIGINT',interrupt);
async function pageOpen(){
 assertRunning();const p=await context.newPage();await p.goto(url,{waitUntil:'domcontentloaded'});await p.locator('#main h2').first().waitFor();
 await p.waitForFunction(()=>typeof branchRecord!=='undefined'&&branchRecord&&typeof operating!=='undefined'&&!operating);
 requireThat(await p.locator('#actor').isEnabled()&&await p.locator('#receive').isEnabled()&&await p.locator('#export').isEnabled(),'Received application retained temporary action locks.');await p.locator('#actor').fill('TJLabs branch receiving engineer');return p;
}
async function idle(p){assertRunning();await p.waitForFunction(()=>!operating);assertRunning();}
async function observe(p){
 await idle(p);const value=await p.evaluate(async()=>({selected:selectedContext(),record:await branchStore.read(branchRecord.id),snapshot:Model.exportSnapshot(workspace)}));
 requireThat(equal(value.snapshot,value.record.snapshot),'Visible and saved branch differ.');
 packet(JSON.stringify({format:'mpc-recovery-portable.v1',sha256:value.record.snapshotSha256,snapshot:value.snapshot}));return value;
}
async function choose(p,branch){
 await idle(p);await p.locator('#browser-branch').selectOption(branch);await p.locator('#open-browser-branch').click();await idle(p);
 requireThat((await observe(p)).selected.id===branch,'Visible branch selection differs.');
}
async function screenshot(p,name){
 const relative='screenshots/'+name+'.png',path=resolve(out,relative);await mkdir(dirname(path),{recursive:true});
 if(!await maybe(path))await p.screenshot({path,fullPage:true});const png=await readFile(path);requireThat(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&png.subarray(-8,-4).toString()==='IEND','Original screenshot is incomplete: '+relative);await artifact(relative);await retain();
}
async function portableDownload(p,name,expected){
 const relative='outputs/'+name,path=resolve(out,relative);await mkdir(dirname(path),{recursive:true});let raw=await maybe(path);
 if(!raw){const [d]=await Promise.all([p.waitForEvent('download'),p.locator('#export').click()]);await idle(p);await d.saveAs(path+'.partial');raw=await readFile(path+'.partial');packet(raw);await rename(path+'.partial',path);await syncDir(dirname(path));}
 const value=packet(raw);requireThat(equal(value.snapshot,expected),'Export changed the complete reviewed branch.');await artifact(relative);await retain();return path;
}
async function receive(p,name,input){
 const raw=await readFile(input),incoming=packet(raw);let step=report.steps[name];
 if(!step){step=report.steps[name]={status:'PENDING',inputSha256:sha(raw),snapshotSha256:incoming.sha256,parent:(await observe(p)).selected,existingIds:await p.evaluate(async()=> (await branchStore.list()).map(x=>x.id))};await retain();}
 requireThat(step.inputSha256===sha(raw)&&step.snapshotSha256===incoming.sha256,'Original receiving input differs.');
 if(step.status==='COMPLETE'){await choose(p,step.branchId);requireThat(equal((await observe(p)).snapshot,step.snapshot),'Received branch changed before its next action.');return step.branchId;}
 let matches=await p.evaluate(async({ids,inputSha,parent})=>{const found=[];for(const summary of await branchStore.list()){if(ids.includes(summary.id))continue;const r=await branchStore.read(summary.id);if(r.origin.kind==='PORTABLE_RECEIVE'&&r.origin.receivedFileSha256===inputSha&&r.origin.parentBrowserBranch===parent)found.push(r);}return found;},{ids:step.existingIds,inputSha:step.inputSha256,parent:step.parent.id});
 requireThat(matches.length<=1,'More than one original receive effect needs reconciliation.');
 if(!matches.length){
  await choose(p,step.parent.id);await p.locator('#receive').setInputFiles(input);await idle(p);
  const value=await observe(p);requireThat(value.record.origin.kind==='PORTABLE_RECEIVE'&&value.record.origin.receivedFileSha256===step.inputSha256,'UI did not receive the original bytes.');matches=[value.record];
 }
 const record=matches[0];requireThat(equal(record.snapshot,incoming.snapshot),'Receiving changed original source/history.');
 step.branchId=record.id;step.snapshot=record.snapshot;step.status='COMPLETE';step.completedAt=new Date().toISOString();await retain();await choose(p,record.id);return record.id;
}
async function savePlan(p,name,title,note){
 let step=report.steps[name];const value=await observe(p);
 if(!step){step=report.steps[name]={status:'PENDING',before:value.selected,beforeSnapshot:value.snapshot,title,note};await retain();}
 requireThat(step.title===title&&step.note===note&&step.before.id===value.selected.id,'Plan receiving intent differs.');
 if(step.status==='COMPLETE'){requireThat(equal(value.snapshot,step.snapshot),'Recorded saved plan branch changed.');return value;}
 const current=Model.receiveSnapshot(value.snapshot),prior=Model.receiveSnapshot(step.beforeSnapshot);
 if(value.record.snapshotSha256!==step.before.snapshotSha256){
  const event=current.operations.at(-1),payload=event?.command?.payload;
  requireThat(current.revision===prior.revision+1&&current.operations.length===prior.operations.length+1&&equal(current.operations.slice(0,-1),prior.operations)&&event.command.type==='plan.save'&&event.command.actor==='TJLabs branch receiving engineer'&&payload?.title===title&&payload?.note===note,'Original UI save has an unresolved different result.');
 }else{
  await p.locator('[data-tab="plan"]').click();await p.locator('#plan-title').fill(title);await p.locator('#plan-note').fill(note);await p.locator('#save-plan').click();await idle(p);
 }
 const saved=await observe(p),model=Model.receiveSnapshot(saved.snapshot);
 requireThat(model.revision===prior.revision+1&&model.plans.at(-1).title===title&&model.plans.at(-1).note===note,'UI planning save did not return its exact intended edition.');
 requireThat(equal(model.sources,prior.sources),'Planning edit changed original source bytes.');
 step.snapshot=saved.snapshot;step.result=saved.selected;step.status='COMPLETE';step.completedAt=new Date().toISOString();await retain();return saved;
}

let servingHtml=html;
try{
 assertRunning();server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(servingHtml);});
 await new Promise((yes,no)=>{server.once('error',no);server.listen(18741,'127.0.0.1',yes);});
 await launch('main');let p=await pageOpen();
 if(!report.steps.migration){
  const value=await observe(p);requireThat(equal(value.snapshot,accepted.snapshot),'Legacy migration changed the accepted workspace.');
  const raw=await p.evaluate(()=>localStorage.getItem('mpc-recovery-operations.v1'));requireThat(raw===legacyRaw,'Migration replaced original localStorage bytes.');
  report.steps.migration={status:'COMPLETE',branchId:value.selected.id,snapshot:value.snapshot,legacySha256:sha(raw)};await retain();
 }
 const original=report.steps.migration.branchId;await choose(p,original);
 let copy=report.steps.copy?.branchId;if(!copy)copy=await receive(p,'copy',inputPath);else await choose(p,copy);
 requireThat(copy!==original,'Receiving replaced the original physical branch.');
 if(!report.steps.drafts){
  await p.locator('[data-tab="plan"]').click();await p.locator('#plan-title').fill('Received branch — retained unsaved planning review');
  await choose(p,original);await p.locator('[data-tab="plan"]').click();await p.locator('#plan-title').fill('Original branch — retained unsaved planning review');
  await choose(p,copy);requireThat(await p.locator('#plan-title').inputValue()==='Received branch — retained unsaved planning review','Received draft was lost or mixed.');await screenshot(p,'received-draft-desktop');
  await choose(p,original);requireThat(await p.locator('#plan-title').inputValue()==='Original branch — retained unsaved planning review','Original draft was lost or mixed.');await screenshot(p,'original-draft-desktop');
  report.steps.drafts={status:'COMPLETE',original,received:copy};await retain();
 }
 await choose(p,copy);
 await savePlan(p,'receivedEdit','Received branch planning review','Browser receiving exercise: this independent edition preserves the original proposal and inventory. No backup-service observation is asserted.');
 await screenshot(p,'received-saved-plan-desktop');await choose(p,original);
 if(!report.steps.staleConflict){
  if(report.steps.originalEdit){
   const step=report.steps.originalEdit;
   requireThat(step.status==='PENDING'&&(await observe(p)).record.snapshotSha256===step.before.snapshotSha256,'The original planning edit returned before stale-tab evidence was retained. Preserve and reconcile that exact original browser proof; do not replay the edit.');
  }
  const stale=await pageOpen();await choose(stale,original);await stale.locator('[data-tab="plan"]').click();
  await stale.locator('#plan-title').fill('Stale tab unsaved planning review');await stale.locator('#plan-note').fill('This unsaved form must not overwrite the later saved original branch.');
  const before=await observe(stale);
  await savePlan(p,'originalEdit','Original branch planning review','Browser receiving exercise: the original branch continues independently of its received copy. No backup-service observation is asserted.');
  await stale.locator('#save-plan').click();await idle(stale);const message=await stale.locator('#notice').innerText();
  requireThat(message.includes('Another tab saved this branch'),'The actual stale-tab UI did not return a revision conflict.');
  requireThat(await stale.locator('#plan-title').inputValue()==='Stale tab unsaved planning review','The rejected form was discarded.');
  const stored=await stale.evaluate(async id=>branchStore.read(id),original);requireThat(equal(stored.snapshot,report.steps.originalEdit.snapshot),'Stale UI save changed the current branch.');
  await screenshot(stale,'stale-tab-conflict-desktop');
  stale.once('dialog',d=>d.accept());await stale.locator('#reload-browser-branch').click();await idle(stale);
  requireThat(equal((await observe(stale)).snapshot,report.steps.originalEdit.snapshot),'Explicit reload did not reopen the saved edition.');
  report.steps.staleConflict={status:'COMPLETE',before:before.selected,after:report.steps.originalEdit.result,message,draftPreserved:true};await retain();await stale.close();
 }else requireThat(equal((await observe(p)).snapshot,report.steps.originalEdit.snapshot),'Original saved branch differs.');
 await closeBrowser();await launch('main');p=await pageOpen();
 for(const [name,branch,expected]of [['original',original,report.steps.originalEdit.snapshot],['received',copy,report.steps.receivedEdit.snapshot]]){
  await choose(p,branch);requireThat(equal((await observe(p)).snapshot,expected),'Physical browser reopen changed '+name+' branch.');
  await portableDownload(p,name+'-workspace.json',expected);
 }
 requireThat(await p.evaluate(()=>localStorage.getItem('mpc-recovery-operations.v1'))===legacyRaw,'Later operations replaced legacy source bytes.');
 const tabs=['overview','proposal','plan','jobs','recovery','incidents','acceptance','sources','history'];await choose(p,original);
 for(const tab of tabs){await p.locator('[data-tab="'+tab+'"]').click();await idle(p);await screenshot(p,tab+'-desktop');}
 await p.setViewportSize({width:390,height:844});
 for(const tab of tabs){await p.locator('[data-tab="'+tab+'"]').click();await idle(p);const widths=await p.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth}));requireThat(widths.content<=widths.viewport,'Mobile horizontal overflow: '+tab+' '+canonical(widths));await screenshot(p,tab+'-mobile');}
 report.steps.reopenAndViews={status:'COMPLETE',desktop:tabs.length,mobile:tabs.length,original,received:copy};await retain();
 await p.setViewportSize({width:1440,height:1000});await p.locator('[data-tab="acceptance"]').click();
 for(const [selector,name]of [['#freeze-handover','complete-branch-handover.zip'],['#download-app','complete-branch-application.zip']]){
  const relative='outputs/'+name,path=resolve(out,relative);
  if(!await maybe(path)){const [d]=await Promise.all([p.waitForEvent('download'),p.locator(selector).click()]);await idle(p);await d.saveAs(path+'.partial');await rename(path+'.partial',path);await syncDir(dirname(path));}
  const key=name==='complete-branch-handover.zip'?'workspace.json':'current-workspace.json';
  const checked=spawnSync(python,['-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; sys.stdout.buffer.write(z.read(sys.argv[2]))',path,key],{encoding:null,maxBuffer:64*1024*1024});
  requireThat(checked.status===0&&equal(packet(checked.stdout).snapshot,report.steps.originalEdit.snapshot),'Actual complete download omitted or changed the selected branch.');await artifact(relative);await retain();
 }
 const extracted=spawnSync(python,['-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; sys.stdout.buffer.write(z.read("recovery-operations.html"))',resolve(out,'outputs/complete-branch-application.zip')],{encoding:null,maxBuffer:1024*1024});
 requireThat(extracted.status===0,'Actual downloaded application did not reopen.');
 servingHtml=extracted.stdout.toString('utf8');await fixed(resolve(out,'outputs/received-application.html'),servingHtml);await artifact('outputs/received-application.html');await retain();
 await closeBrowser();await launch('independent');p=await pageOpen();
 requireThat(await p.locator('#browser-branch').count()===1,'Downloaded application duplicated generated branch controls.');
 for(const [name,file,expected]of [['independentOriginal','original-workspace.json',report.steps.originalEdit.snapshot],['independentReceived','received-workspace.json',report.steps.receivedEdit.snapshot]]){
  await receive(p,name,resolve(out,'outputs',file));requireThat(equal((await observe(p)).snapshot,expected),'Independent downloaded application changed full history.');
  await screenshot(p,name+'-desktop');await portableDownload(p,name+'-roundtrip.json',expected);
 }
 requireThat(report.steps.independentOriginal.branchId!==report.steps.independentReceived.branchId,'Independent receiving collapsed physical branches.');
 requireThat(!pageErrors.length,'Browser errors: '+pageErrors.join('\n'));
 await shutdown();assertRunning();
 report.status='COMPLETE';report.completedAt=new Date().toISOString();report.browserClosed=true;report.serverClosed=true;report.artifacts.sort((a,b)=>a.path.localeCompare(b.path));await retain();console.log(JSON.stringify(report));
}catch(error){report.status='INCOMPLETE';report.error=error.stack||String(error);await retain();console.error(report.error);process.exitCode=1;}
finally{
 try{await shutdown();}catch(e){report.status='INCOMPLETE';report.cleanupErrors=[...(report.cleanupErrors||[]),e.stack||String(e)];process.exitCode=process.exitCode||1;}
 if(shutdownReason){report.status='INCOMPLETE';report.error=shutdownReason.stack||String(shutdownReason);}
 await retain();process.removeListener('SIGTERM',terminate);process.removeListener('SIGINT',interrupt);
}
