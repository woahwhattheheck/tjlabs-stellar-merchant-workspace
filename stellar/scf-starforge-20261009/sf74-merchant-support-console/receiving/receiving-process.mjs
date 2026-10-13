// MIT. Private receiving-process ownership adapted from Commons PR37706.
// Original complete source: cacdef674efb264ed20b93d911facc03eaa5d5c3.
import {readFile,writeFile,mkdir,open,rename,readlink,readdir,chmod} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
const requireThat=(ok,message)=>{if(!ok)throw Error(message);};
async function maybe(path){try{return await readFile(path);}catch(e){if(['ENOENT','ESRCH'].includes(e.code))return null;throw e;}}
const delay=ms=>new Promise(done=>setTimeout(done,ms));
async function atomic(path,body){const temp=path+'.'+randomUUID()+'.tmp',file=await open(temp,'wx',0o600);
 try{await file.writeFile(body);await file.sync();}finally{await file.close();}await rename(temp,path);}
export async function createReceivingProcessOwner({directory,operation,sourceSha256,executable,python=process.env.SF74_RECEIVING_PYTHON||'/usr/bin/python3'}){
 requireThat(typeof operation==='string'&&operation&&/^[0-9a-f]{64}$/.test(sourceSha256),'Retain the original receiving operation and exact source identity.');
 requireThat(typeof executable==='string'&&executable.startsWith('/')&&typeof python==='string'&&python.startsWith('/'),'Use the existing absolute executable and Python paths.');
 const out=resolve(directory);await mkdir(out,{recursive:true,mode:0o700});
 const path=join(out,'processes.json'),previous=await maybe(path);
 const report=previous?JSON.parse(previous):{schema:'stellar-forge.receiving-processes.v1',operation,sourceSha256,launches:[]};
 requireThat(report.operation===operation&&report.sourceSha256===sourceSha256&&Array.isArray(report.launches),'Retain the original process receiving identity.');
 const retain=()=>atomic(path,JSON.stringify(report,null,2)+'\n');
 const currentHost={bootId:(await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim(),pidNamespace:await readlink('/proc/self/ns/pid')};
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

 async function processRecord(launch){
  const body=await maybe(join(out,launch.id+'.process.json'));if(!body)return null;const value=JSON.parse(body);
  requireThat(value.operation===operation&&value.launchId===launch.id&&value.sourceSha256===sourceSha256,'Retained private process binding differs.');return value;
 }
 async function closeRecorded(launch){
  if(launch.status==='CLOSED')return;
  const record=await processRecord(launch);requireThat(record,'Private launch has no process receipt; retain it for reconciliation.');
  for(const signal of ['SIGTERM','SIGKILL']){
   let members=await groupMembers(record);if(!members.length)break;
   try{process.kill(-record.namespacePgid,signal);}catch(e){if(e.code!=='ESRCH')throw e;}
   for(let i=0;i<100;i++){members=await groupMembers(record);if(!members.length)break;await delay(50);}
  }
  requireThat(!(await groupMembers(record)).length,'The original private process group remains active.');
  launch.status='CLOSED';launch.closedAt=new Date().toISOString();launch.groupClosed=true;await retain();
 }
 const wrapper=join(out,'process-owner.py');
 const wrapperSource='#!'+python+'\n'+"import json,os,pathlib\npath=pathlib.Path(os.environ[\"SF74_RECEIVING_PROCESS_RECORD\"])\ntry: os.setsid()\nexcept PermissionError:\n if os.getpgrp()!=os.getpid(): raise\nproc_pid=int(os.readlink(\"/proc/self\"))\nraw=pathlib.Path(\"/proc/self/stat\").read_text()\nfields=raw[raw.rfind(\")\")+2:].split()\nif int(raw.split(\"(\",1)[0].strip())!=proc_pid or int(fields[2])!=proc_pid or int(fields[3])!=proc_pid: raise RuntimeError(\"Original browser did not enter its own private group/session\")\nrecord={\"operation\":os.environ[\"SF74_RECEIVING_OPERATION\"],\"launchId\":os.environ[\"SF74_RECEIVING_LAUNCH_ID\"],\"sourceSha256\":os.environ[\"SF74_RECEIVING_SOURCE_SHA\"],\"procPid\":proc_pid,\"procPgid\":int(fields[2]),\"procSession\":int(fields[3]),\"namespacePid\":os.getpid(),\"namespacePgid\":os.getpgrp(),\"bootId\":pathlib.Path(\"/proc/sys/kernel/random/boot_id\").read_text().strip(),\"pidNamespace\":os.readlink(\"/proc/self/ns/pid\"),\"startTicks\":raw[raw.rfind(\")\")+2:].split()[19]}\npath.parent.mkdir(parents=True,exist_ok=True)\nwith path.open(\"x\",encoding=\"utf8\") as f:\n f.write(json.dumps(record,sort_keys=True)+\"\\n\");f.flush();os.fsync(f.fileno())\nd=os.open(str(path.parent),os.O_RDONLY)\ntry: os.fsync(d)\nfinally: os.close(d)\nos.execv(os.environ[\"SF74_RECEIVING_CHROME\"],[os.environ[\"SF74_RECEIVING_CHROME\"],*__import__(\"sys\").argv[1:]])\n";
 const old=await maybe(wrapper);if(old)requireThat(old.equals(Buffer.from(wrapperSource)),'Original process wrapper changed.');
 else await writeFile(wrapper,wrapperSource,{flag:'wx',mode:0o700});await chmod(wrapper,0o700);
 let active=null,pending=null,closing=null,stopped=false,owned=null;
 async function reconcile(){for(const launch of report.launches)await closeRecorded(launch);}
 await reconcile();
 return {
  path,report,
  assertRunning(){requireThat(!stopped,'The original receiving process is closing.');},
  async launch(run){
   requireThat(!stopped&&!active,'Only one private launch may use this owner.');
   active={id:randomUUID(),status:'PREPARING',startedAt:new Date().toISOString()};report.launches.push(active);
   const env={...process.env,SF74_RECEIVING_CHROME:executable,SF74_RECEIVING_OPERATION:operation,SF74_RECEIVING_SOURCE_SHA:sourceSha256,SF74_RECEIVING_LAUNCH_ID:active.id,SF74_RECEIVING_PROCESS_RECORD:join(out,active.id+'.process.json')};
   // The promise exists before the first yield. A stop may close a preparation
   // only while this live owner knows the executable has never been dispatched.
   pending=(async()=>{
    await retain();
    if(!stopped){active.status='STARTING';await retain();}
    if(stopped){active.status='CLOSED';active.closedAt=new Date().toISOString();active.groupClosed=true;active.notDispatched=true;await retain();throw Error('Receiving stopped before executable dispatch.');}
    owned=await run({executablePath:wrapper,env});
    for(let i=0;i<200&&!await processRecord(active);i++)await delay(10);
    requireThat(await processRecord(active),'The private executable did not retain its process identity.');
    active.status='RUNNING';await retain();return owned;})();
   try{return await pending;}finally{pending=null;}
  },
  async close(closeApi=null,{graceMs=2000}={}){
   stopped=true;if(closing)return closing;
   closing=(async()=>{
    if(pending)try{await pending;}catch{}
    let api=null;if(owned&&closeApi)api=Promise.resolve().then(()=>closeApi(owned)).then(()=>null,e=>e);
    if(api)await Promise.race([api,delay(graceMs)]);
    for(const launch of report.launches)await closeRecorded(launch);
    if(api){const result=await Promise.race([api,delay(1000).then(()=>Error('Private group closed but its API close did not return.'))]);if(result)throw result;}
    owned=null;active=null;
   })();return closing;
  },
  reconcile
 };
}
