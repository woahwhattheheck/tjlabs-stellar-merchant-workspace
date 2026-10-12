// MIT. Linux host custody and process observation; native payment ownership stays in ../ownership.mjs.
import { constants as C, createReadStream } from 'node:fs';
import { open, lstat, realpath, mkdir, chown, chmod, rename, unlink, readFile, readdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';

export const SCHEMA = 'stellar-forge.native-facilitator-host.v1';
export const BASE = 'stellar/scf-starforge-20261009/native-facilitator/';
export const now = () => new Date().toISOString();
export const hash = b => createHash('sha256').update(b).digest('hex');
export const json = v => JSON.stringify(v, null, 2) + '\n';
export function need(value, code, detail) { if (!value) throw Object.assign(new Error(detail || code), { code }); }
export function absolute(value) {
  need(typeof value === 'string' && value === resolve(value) && value !== '/' && !/[\0-\x1f\x7f]/.test(value),
    'HOST_ABSOLUTE_PATH_REQUIRED'); return value;
}
export const inside = (root, path) => { const rel = relative(root,path); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'); };
export const identity = s => ({ device: String(s.dev), inode: String(s.ino), uid: s.uid, gid: s.gid, mode: s.mode & 0o777, size: s.size });
export const sameInode = (a,b) => a?.device === b?.device && a?.inode === b?.inode;
export async function regular(path, limit = 4*1024*1024) {
  absolute(path);
  const f = await open(path,C.O_RDONLY|C.O_NOFOLLOW);
  try {
    const a=await f.stat();
    need(a.isFile() && a.nlink === 1 && a.size <= limit,'HOST_REGULAR_FILE_REQUIRED');
    const bytes=await f.readFile(), b=await f.stat(), named=await lstat(path);
    need(bytes.length<=limit && a.size===b.size && a.mtimeMs===b.mtimeMs && a.ctimeMs===b.ctimeMs &&
      sameInode(identity(a),identity(named)),'HOST_FILE_CHANGED');
    return {bytes,stat:identity(b),sha256:hash(bytes)};
  } finally { await f.close(); }
}
export async function readJSON(path) {
  const r=await regular(path);
  return {value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(r.bytes)),...r};
}
export async function maybeJSON(path) { try { return await readJSON(path); } catch(e) { if(e.code==='ENOENT') return null; throw e; } }
export async function digestFile(path) {
  absolute(path); const f=await open(path,C.O_RDONLY|C.O_NOFOLLOW);
  try {
    const a=await f.stat(); need(a.isFile(),'HOST_EXECUTABLE_REQUIRED'); const h=createHash('sha256');
    for await (const part of f.createReadStream({autoClose:false})) h.update(part);
    const b=await f.stat(), n=await lstat(path);
    need(a.size===b.size && a.mtimeMs===b.mtimeMs && a.ctimeMs===b.ctimeMs && sameInode(identity(a),identity(n)),
      'HOST_EXECUTABLE_CHANGED');
    return {sha256:h.digest('hex'),...identity(b)};
  } finally { await f.close(); }
}
export async function realDirectory(path,{uid,mode,newOnly=false,gid}={}) {
  absolute(path); need(await realpath(dirname(path))===dirname(path),'HOST_REAL_PARENT_REQUIRED');
  if(newOnly) { await mkdir(path,{mode:mode??0o700}); if(uid!==undefined) await chown(path,uid,gid??uid); }
  const s=await lstat(path);
  need(s.isDirectory() && !s.isSymbolicLink() && await realpath(path)===path,'HOST_REAL_DIRECTORY_REQUIRED');
  if(uid!==undefined) need(s.uid===uid,'HOST_DIRECTORY_OWNER_CHANGED');
  if(mode!==undefined) need((s.mode&0o777)===mode,'HOST_DIRECTORY_MODE_CHANGED');
  if(gid!==undefined) need(s.gid===gid,'HOST_DIRECTORY_GROUP_CHANGED');
  return identity(s);
}
export async function ensureDirectory(path,opts) {
  try { return await realDirectory(path,opts); }
  catch(e) { if(e.code!=='ENOENT') throw e; return realDirectory(path,{...opts,newOnly:true}); }
}
export async function syncDirectory(path) { const f=await open(path,C.O_RDONLY|C.O_DIRECTORY);try{await f.sync();}finally{await f.close();} }
export async function atomicFile(path,bytes,{allowed=[null],mode=0o600,uid=0,gid=0}={}) {
  bytes=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
  need(await realpath(dirname(path))===dirname(path),'HOST_REAL_PARENT_REQUIRED');
  let previous=null; try { previous=(await regular(path)).sha256; } catch(e) { if(e.code!=='ENOENT')throw e; }
  need(allowed.includes(previous),'HOST_FILE_COMPARE_FAILED');
  const temp=join(dirname(path),'.host-'+randomUUID()), f=await open(temp,'wx',mode);
  try { await f.writeFile(bytes); await f.chown(uid,gid); await f.chmod(mode); await f.sync(); }
  catch(e) { await unlink(temp).catch(()=>{}); throw e; } finally { await f.close(); }
  // The enclosing original host lease serializes every controller-owned mutation.
  let current=null; try { current=(await regular(path)).sha256; }catch(e){if(e.code!=='ENOENT')throw e;}
  if(current!==previous) { await unlink(temp); need(false,'HOST_FILE_CHANGED_BEFORE_COMMIT'); }
  await rename(temp,path); await syncDirectory(dirname(path)); return hash(bytes);
}
export async function saveJSON(path,value,allowed=[null]) { return atomicFile(path,json(value),{allowed}); }
export async function removeOwned(path,expected) {
  try { need((await regular(path)).sha256===expected,'HOST_FILE_COMPARE_FAILED'); }
  catch(e) { if(e.code==='ENOENT')return; throw e; }
  await unlink(path); await syncDirectory(dirname(path));
}
export async function hostLease(root,flock='/usr/bin/flock') {
  const path=join(root,'controller.lock'), f=await open(path,C.O_RDWR|C.O_CREAT|C.O_NOFOLLOW,0o600);
  try {
    const a=await f.stat(), b=await lstat(path);
    need(a.isFile()&&a.nlink===1&&a.uid===0&&!(a.mode&0o077)&&sameInode(identity(a),identity(b)),'HOST_LOCK_CHANGED');
    const r=spawnSync(flock,['--exclusive','--nonblock','--conflict-exit-code','75','3'],
      {stdio:['ignore','ignore','ignore',f.fd],timeout:5000,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'}});
    need(!r.error&&r.status===0,r.status===75?'HOST_OPERATION_RUNNING':'HOST_FLOCK_FAILED');
    return f;
  } catch(e) { await f.close(); throw e; }
}
export async function command(executable,args,{timeout=30000,allowFailure=false,stdio='pipe',passFd}={}) {
  need(Array.isArray(args)&&args.every(s=>typeof s==='string'&&!s.includes('\0')),'HOST_COMMAND_ARGUMENTS_INVALID');
  return new Promise((resolvePromise,reject)=>{
    const child=spawn(executable,args,{shell:false,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},
      stdio:passFd===undefined?['ignore',stdio,stdio]:['ignore',stdio,stdio,passFd]});
    let stdout='',stderr='',overflow=false;
    const capture=(kind,chunk)=>{if(kind==='stdout')stdout+=chunk;else stderr+=chunk;
      if(stdout.length+stderr.length>2*1024*1024){overflow=true;child.kill('SIGTERM');}};
    child.stdout?.on('data',x=>capture('stdout',x));child.stderr?.on('data',x=>capture('stderr',x));
    const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);
    child.once('error',e=>{clearTimeout(timer);reject(Object.assign(new Error('HOST_COMMAND_START_FAILED'),{code:'HOST_COMMAND_START_FAILED',cause:e}));});
    child.once('exit',(code,signal)=>{clearTimeout(timer);
      if(overflow||(!allowFailure&&code!==0)){
        let originalCode=null;for(const line of stderr.trim().split('\n').reverse()){
          try{const e=JSON.parse(line);if(/^[A-Z0-9_]+$/.test(e.error??'')){originalCode=e.error;break;}}catch{}
        }
        reject(Object.assign(new Error('HOST_COMMAND_FAILED'),{code:'HOST_COMMAND_FAILED',exitCode:code,signal,originalCode}));
      }
      else resolvePromise({code,signal,stdout,stderr});
    });
  });
}
export async function resolveAccount(user,group,binaries) {
  need(/^[a-z_][a-z0-9_-]{0,31}\$?$/.test(user)&&/^[a-z_][a-z0-9_-]{0,31}\$?$/.test(group),'HOST_ACCOUNT_NAME_INVALID');
  const p=(await command(binaries.getent,['passwd',user])).stdout.trim().split(':');
  const g=(await command(binaries.getent,['group',group])).stdout.trim().split(':');
  need(p.length===7&&g.length===4&&p[0]===user&&g[0]===group,'HOST_EXISTING_ACCOUNT_REQUIRED');
  const uid=Number(p[2]),gid=Number(g[2]); need(Number.isSafeInteger(uid)&&uid>0&&Number.isSafeInteger(gid)&&gid>0,'HOST_UNPRIVILEGED_ACCOUNT_REQUIRED');
  return {user,group,uid,gid};
}
export function systemdWord(value,{argument=false}={}) {
  let s=String(value);need(!/[\0-\x1f\x7f]/.test(s),'HOST_UNIT_VALUE_INVALID');
  s=s.replaceAll('%','%%').replaceAll('\\','\\\\').replaceAll('"','\\"');
  if(argument)s=s.replaceAll('$',()=> '$$');return '"'+s+'"';
}
export function rawPath(path) { absolute(path);return (/[\\\s]$/.test(path)?path+'/.':path).replaceAll('%','%%'); }
export function pathWord(path) { absolute(path);return systemdWord(path); }
export async function processIdentity(pid) {
  if(!Number.isInteger(pid)||pid<=0)return null;
  try {
    const stat=await readFile('/proc/'+pid+'/stat','utf8'),end=stat.lastIndexOf(')'),parts=stat.slice(end+2).split(' ');
    const status=await readFile('/proc/'+pid+'/status','utf8');
    const uid=Number(/^Uid:\s+(\d+)/m.exec(status)?.[1]);
    const cmd=(await readFile('/proc/'+pid+'/cmdline')).toString('utf8').split('\0').filter(Boolean);
    return {pid,startTicks:parts[19],bootId:(await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim(),
      uid,executable:await realpath('/proc/'+pid+'/exe'),argv:cmd};
  } catch(e) { if(['ENOENT','ESRCH'].includes(e.code))return null;throw e; }
}
export async function serviceState(plan) {
  const out=await command(plan.binaries.systemctl,['show','--property=Id,LoadState,ActiveState,SubState,MainPID,ControlPID,FragmentPath,DropInPaths,User,Group,DynamicUser,Result,ExecMainCode,ExecMainStatus,ControlGroup,UnitFileState,Job,InvocationID,ExecMainStartTimestampMonotonic,ExecMainExitTimestampMonotonic,ActiveEnterTimestampMonotonic,InactiveEnterTimestampMonotonic,ExecStartPre,KillMode,KillSignal,RestartKillSignal,SendSIGKILL,SendSIGHUP,TimeoutStopUSec,Restart,RestartForceExitStatus,ExecStop,ExecStopPost','--',plan.unit],{allowFailure:true});
  const r=Object.fromEntries(out.stdout.split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));
  need(r.Id===plan.unit,'HOST_SYSTEMD_STATE_UNAVAILABLE');
  r.MainPID=Number(r.MainPID||0);r.ControlPID=Number(r.ControlPID||0);
  need(Number.isInteger(r.MainPID)&&Number.isInteger(r.ControlPID),'HOST_SYSTEMD_PID_INVALID');
  return r;
}
export async function groupProcesses(state,originalGroup=null) {
  // This host product deliberately supports the unified hierarchy. A v1 layout
  // must not be mistaken for a vanished/empty original service group.
  const base='/sys/fs/cgroup';
  const mounts=await readFile('/proc/self/mountinfo','utf8');
  need(mounts.split('\n').some(line=>line.split(' ')[4]===base&&line.includes(' - cgroup2 ')),
    'HOST_UNIFIED_CGROUP_REQUIRED');
  await readFile(join(base,'cgroup.controllers'),'utf8');
  const pids=new Set();let count=0;
  async function walk(dir) {
    if(++count>256)need(false,'HOST_CGROUP_INVENTORY_LIMIT');
    let entries;try{
      for(const p of (await readFile(join(dir,'cgroup.procs'),'utf8')).trim().split(/\s+/).filter(Boolean))pids.add(Number(p));
      entries=await readdir(dir,{withFileTypes:true});
    }catch(e){if(e.code==='ENOENT')return;throw e;}
    for(const e of entries)if(e.isDirectory())await walk(join(dir,e.name));
  }
  for(const group of [...new Set([state.ControlGroup,originalGroup].filter(Boolean))]){
    const path=resolve(base,'.'+group);
    need(group.startsWith('/')&&inside(base,path)&&path!==base,'HOST_CGROUP_PATH_INVALID');
    await walk(path);
  }
  return [...pids].filter(p=>Number.isInteger(p)&&p>0).sort((a,b)=>a-b);
}
export async function signerFiles(plan,{baseline=null,requireAll=false,owner=null}={}) {
  const dir=await realDirectory(plan.ownershipDirectory,{uid:plan.account.uid,mode:0o700});
  if(baseline)need(sameInode(dir,baseline.directory),'HOST_OWNERSHIP_DIRECTORY_REPLACED');
  const files=[];
  for(const account of plan.accounts) {
    const path=join(plan.ownershipDirectory,hash(plan.network+'\0'+account)+'.lock');
    const previous=baseline?.files.find(x=>x.account===account);
    let r;try{r=await readJSON(path);}catch(e){
      if(e.code==='ENOENT'&&!requireAll&&!previous)continue;
      if(e.code==='ENOENT'&&previous)need(false,'HOST_SIGNER_LOCK_DISAPPEARED');
      throw e;
    }
    need(r.stat.uid===plan.account.uid&&!(r.stat.mode&0o077),'HOST_SIGNER_FILE_PERMISSIONS_CHANGED');
    if(previous)need(sameInode(previous,r.stat),'HOST_SIGNER_LOCK_REPLACED');
    if(owner)need(r.value.account===account&&r.value.network===plan.network&&r.value.pid===owner.pid&&
      r.value.ownerId===owner.ownerId,'HOST_ENDPOINT_OWNER_MISMATCH');
    files.push({account,...r.stat,ownerId:r.value.ownerId??null,pid:r.value.pid??null});
  }
  return {directory:dir,files};
}
