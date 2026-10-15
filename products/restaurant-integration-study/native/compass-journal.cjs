'use strict';
// Linux Node 20+, local filesystem, util-linux flock. MIT.
// Immutable exact engine records; kernel lock remains on the stable file inode.
const fs=require('node:fs/promises'),F=require('node:fs').constants;
const path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const Engine=require('../compass-client.cjs'),Contract=require('../compass-contract.cjs'),Text=require('../text.cjs');
const MAX_FILE=32*1024*1024,MAX_EXPORT=256*1024*1024,ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fail(code,message){const e=new Error(message);e.code=code;return e;}
function operationId(id){if(typeof id!=='string'||!ID.test(id)||id==='.'||id==='..')throw fail('OPERATION_ID','Use a portable operation ID.');return id;}
function identity(s){return {dev:String(s.dev),ino:String(s.ino)};}
function same(a,b){return String(a.dev)===String(b.dev)&&String(a.ino)===String(b.ino);}
async function privateDirectory(name,create=false){
 if(create)await fs.mkdir(name,{recursive:true,mode:0o700});
 const st=await fs.lstat(name);if(!st.isDirectory()||st.isSymbolicLink())throw fail('JOURNAL_DIRECTORY','Use a physical private journal directory.');
 if(typeof process.getuid==='function'&&st.uid!==process.getuid())throw fail('JOURNAL_OWNER','Journal directory must belong to the current operating-system user.');
 if((st.mode&0o077)!==0)throw fail('JOURNAL_PRIVATE','Journal directory must have mode0700; choose a new private directory or set its permissions deliberately.');
 const real=await fs.realpath(name),actual=await fs.lstat(real);if(!same(st,actual))throw fail('JOURNAL_DIRECTORY_CHANGED','Journal directory changed during opening.');
 if(create){let cursor=real;for(;;){await syncDirectory(cursor);const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;} }
 return {path:real,...identity(actual)};
}
async function assertDirectory(dir){const st=await fs.lstat(dir.path);if(!st.isDirectory()||st.isSymbolicLink()||!same(st,dir))throw fail('JOURNAL_DIRECTORY_CHANGED','The opened journal directory was replaced.');}
async function syncDirectory(dir){const h=await fs.open(dir,F.O_RDONLY|F.O_DIRECTORY|F.O_NOFOLLOW);try{await h.sync();}finally{await h.close();}}
async function exactRead(filename,max=MAX_FILE){
 const h=await fs.open(filename,F.O_RDONLY|F.O_NOFOLLOW);
 try{const before=await h.stat();if(!before.isFile()||before.size>max)throw fail('JOURNAL_FILE','Use a regular complete file within the declared size limit.');
 if(typeof process.getuid==='function'&&before.uid!==process.getuid())throw fail('JOURNAL_OWNER','Retained files must belong to the current user.');
 const bytes=await h.readFile(),after=await h.stat();if(!same(before,after)||before.size!==after.size||before.mtimeMs!==after.mtimeMs||bytes.length!==after.size)throw fail('JOURNAL_FILE_CHANGED','A retained file changed during reading.');
 return {bytes,sha256:sha(bytes),...identity(after)};}finally{await h.close();}
}
async function publishExclusive(directory,filename,bytes){
 if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
 if(bytes.length>MAX_FILE)throw fail('JOURNAL_FILE_LIMIT','File exceeds the native32MiB original limit.');
 const target=path.join(directory,filename),pending=path.join(directory,'.pending-'+crypto.randomUUID()+'.bin');
 const h=await fs.open(pending,F.O_WRONLY|F.O_CREAT|F.O_EXCL|F.O_NOFOLLOW,0o600);
 let published=false;
 try{await h.writeFile(bytes);await h.sync();await h.close();await syncDirectory(directory);
 try{await fs.link(pending,target);published=true;}catch(e){if(e.code!=='EEXIST')throw e;const prior=await exactRead(target);if(prior.sha256!==sha(bytes)||!prior.bytes.equals(bytes))throw fail('JOURNAL_COLLISION','A different complete file already occupies this immutable path.');published=true;}
 await syncDirectory(directory);
 // The selected exact inode now retains the complete bytes. Unselected/partial files remain.
 if(published){await fs.unlink(pending);await syncDirectory(directory);}
 return {path:target,bytes:bytes.length,sha256:sha(bytes)};
 }catch(e){try{await h.close();}catch{}throw e;}
}
async function writeOutput(filename,bytes){
 const absolute=path.resolve(filename),parent=await fs.realpath(path.dirname(absolute));
 const data=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
 // Output is exclusive, including existing symlinks; an existing delivery is never replaced.
 const pending=path.join(parent,'.compass-output-'+crypto.randomUUID()+'.partial'),h=await fs.open(pending,F.O_WRONLY|F.O_CREAT|F.O_EXCL|F.O_NOFOLLOW,0o600);
 try{await h.writeFile(data);await h.sync();await h.close();await fs.link(pending,path.join(parent,path.basename(absolute)));await syncDirectory(parent);await fs.unlink(pending);await syncDirectory(parent);return {path:absolute,bytes:data.length,sha256:sha(data)};}catch(e){try{await h.close();}catch{}throw e;}
}
async function openJournal(directory,{create=false}={}){
 if(process.platform!=='linux')throw fail('NATIVE_RUNTIME','This native runner requires Linux, Node20+ and util-linux flock; the portable engine and offline desk remain independent.');
 const root=await privateDirectory(path.resolve(directory),create),operations=await privateDirectory(path.join(root.path,'operations'),create);
 await syncDirectory(root.path);
 const held=new Map();
 async function opDirectory(id,make=false){operationId(id);await assertDirectory(root);await assertDirectory(operations);try{return await privateDirectory(path.join(operations.path,id),make);}catch(e){if(!make&&e.code==='ENOENT')return null;throw e;}}
 async function withOperation(id,fn,{create:make=false}={}){
 operationId(id);if(held.has(id))throw fail('JOURNAL_BUSY','This process already holds the operation.');
 const dir=await opDirectory(id,make);if(!dir)throw fail('OPERATION_MISSING','The operation has no retained journal.');
 const lockPath=path.join(dir.path,'.writer.lock'),h=await fs.open(lockPath,F.O_RDWR|F.O_CREAT|F.O_NOFOLLOW,0o600);
 let locked=false;
 try{
  const st=await h.stat();if(!st.isFile()||st.nlink!==1||(st.mode&0o077)!==0||(typeof process.getuid==='function'&&st.uid!==process.getuid()))throw fail('JOURNAL_LOCK','The stable operation lock must be a private regular file.');
  // fd3 in the child duplicates this open file description. Parent retains the lock after flock exits.
  const acquired=spawnSync('flock',['--exclusive','--nonblock','--conflict-exit-code','73','3'],{stdio:['ignore','ignore','pipe',h.fd],encoding:'utf8',timeout:5000,maxBuffer:4096,env:{PATH:process.env.PATH||'/usr/bin:/bin',LANG:'C'}});
  if(acquired.error)throw fail('JOURNAL_LOCK_TOOL','Cannot execute util-linux flock. Install it in this Linux runtime and retry.');
  if(acquired.status===73)throw fail('JOURNAL_BUSY','Another process owns this operation. Inspect it after the running request completes.');
  if(acquired.status!==0)throw fail('JOURNAL_LOCK_TOOL','The kernel lock could not be acquired on this filesystem.');
  locked=true;await assertDirectory(dir);const current=await fs.lstat(lockPath);if(!same(st,current))throw fail('JOURNAL_LOCK_CHANGED','The operation lock inode was replaced.');
  await syncDirectory(dir.path);
  const token={dir,handle:h,lockIdentity:identity(st),active:true};held.set(id,token);
  try{return await fn(token);}finally{token.active=false;held.delete(id);}
 }finally{await h.close();}
 }
 async function assertHeld(id){const token=held.get(operationId(id));if(!token?.active)throw fail('JOURNAL_LOCK_REQUIRED','An exclusive operation lock is required.');await assertDirectory(root);await assertDirectory(operations);await assertDirectory(token.dir);const st=await fs.lstat(path.join(token.dir.path,'.writer.lock'));if(!same(st,token.lockIdentity))throw fail('JOURNAL_LOCK_CHANGED','The stable operation lock changed.');return token;}
 async function load(id){
  const dir=await opDirectory(id);if(!dir)return[];
  let names=(await fs.readdir(dir.path)).filter(n=>/^[0-9]{12}\.json$/.test(n)).sort(),events=[];
  for(let i=0;i<names.length;i++){if(names[i]!==String(i).padStart(12,'0')+'.json')throw fail('JOURNAL_GAP','The immutable journal has a missing sequence record.');const r=await exactRead(path.join(dir.path,names[i]));let event;try{event=JSON.parse(r.bytes.toString('utf8'));}catch{throw fail('JOURNAL_JSON','The selected journal record is not complete JSON.');}if(!r.bytes.equals(Buffer.from(JSON.stringify(event)+'\n')))throw fail('JOURNAL_ENCODING','Selected event bytes differ from their original native encoding.');events.push(event);}
  if(events.length){Engine.verify(events);if(events[0].operation.id!==id)throw fail('JOURNAL_ID','Retained request belongs to another operation.');}
  await assertDirectory(dir);return events;
 }
 async function append(id,event){
  const token=await assertHeld(id),prior=await load(id);
  if(event.sequence!==prior.length)throw fail('JOURNAL_SEQUENCE','The new record does not extend the complete current journal.');
  Engine.verify([...prior,event]);if((prior[0]||event).operation.id!==id)throw fail('JOURNAL_ID','Request belongs to another operation.');const bytes=Buffer.from(JSON.stringify(event)+'\n');
  await publishExclusive(token.dir.path,String(event.sequence).padStart(12,'0')+'.json',bytes);
 }
 async function retainInput(id,bytes,label='request'){
  const token=await assertHeld(id);if(!['request','profile','upstream'].includes(label))throw fail('INPUT_LABEL','Choose request, profile or upstream.');
  return publishExclusive(token.dir.path,'original-'+label+'-'+sha(bytes)+'.json',bytes);
 }
 async function bindOperation(id,operation){
  const token=await assertHeld(id);Contract.validateOperation(operation);if(operation.id!==id)throw fail('JOURNAL_ID','Request belongs to another operation.');return publishExclusive(token.dir.path,'prepared-operation.json',Buffer.from(Text.canonical(operation)+'\n'));
 }
 async function operationIds(){await assertDirectory(operations);const rows=await fs.readdir(operations.path,{withFileTypes:true}),ids=[];
  for(const row of rows){if(!ID.test(row.name)||row.name==='.'||row.name==='..')throw fail('JOURNAL_ENTRY','Unknown entry in the operations directory.');if(!row.isDirectory()||row.isSymbolicLink())throw fail('JOURNAL_ENTRY','Operation must be a physical directory.');ids.push(row.name);}return ids.sort();}
 async function snapshot(id){
  return withOperation(id,async token=>{
   const artifacts=[];let total=0;
   for(const name of (await fs.readdir(token.dir.path)).sort()){
    if(name==='.writer.lock')continue;
    const r=await exactRead(path.join(token.dir.path,name));total+=r.bytes.length;if(total>MAX_EXPORT)throw fail('EXPORT_LIMIT','Operation export exceeds256MiB; originals remain in the journal.');
    artifacts.push({path:name,bytes:r.bytes.length,sha256:r.sha256,base64:r.bytes.toString('base64'),selection:/^[0-9]{12}\.json$/.test(name)?'selected_event':name.startsWith('original-')?'original_input':'unselected_or_partial'});
   }
   let events=[],journal=null,diagnostic=null;try{events=await load(id);if(events.length)journal=Engine.receipt(events);}catch(e){diagnostic={code:e.code||'JOURNAL_INVALID',message:e.message};}
   return {id,captured_at:new Date().toISOString(),journal,committed_events:events,diagnostic,artifacts,artifact_bytes:total};
  });
 }
 async function exportAll(ids=null){const selected=ids?[...ids]:await operationIds(),out=[],seen=new Set();let total=0;
  for(let at=0;at<selected.length;at++){const id=operationId(selected[at]);if(seen.has(id))continue;seen.add(id);const s=await snapshot(id);out.push(s);total+=s.artifact_bytes;if(total>MAX_EXPORT)throw fail('EXPORT_LIMIT','Complete native export exceeds256MiB; choose a complete individual dependency chain.');const dependency=s.journal?.operation.identity_binding?.operation_id;if(dependency&&!seen.has(dependency))selected.push(dependency);}
  return {schema:'compass.native-export/v1',exported_at:new Date().toISOString(),runtime:'Linux Node20+; util-linux flock; private local filesystem',root_identity:{...identity(root)},operations:out,artifact_bytes:total};
 }
 return {root,operations,withOperation,load,append,retainInput,bindOperation,operationIds,snapshot,exportAll,assertHeld};
}
module.exports={MAX_FILE,MAX_EXPORT,operationId,sha,exactRead,publishExclusive,writeOutput,openJournal,privateDirectory,assertDirectory,identity,same,fail};
