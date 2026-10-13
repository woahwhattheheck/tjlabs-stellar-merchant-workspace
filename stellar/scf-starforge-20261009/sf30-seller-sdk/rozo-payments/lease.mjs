import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { assert, RozoError } from './model.mjs';

function processIdentity(pid=process.pid) {
  let start=null,boot=null;
  try{const stat=readFileSync('/proc/'+pid+'/stat','utf8');start=stat.slice(stat.lastIndexOf(')')+2).split(' ')[19];}catch{}
  try{boot=readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();}catch{}
  return {host:hostname(),pid,start,boot};
}
function definitelyStopped(owner,current) {
  if(owner.host!==current.host || !owner.boot_id || !owner.process_start || !current.boot)return false;
  if(owner.boot_id!==current.boot)return true;
  try{process.kill(owner.pid,0);}catch(error){return error.code==='ESRCH';}
  const observed=processIdentity(owner.pid);
  return Boolean(observed.start && observed.start!==owner.process_start);
}
export function acquireLease(workspace,name) {
  const current=processIdentity(),token=randomUUID();
  assert(current.start&&current.boot,'PROCESS_IDENTITY','This native owner requires a verifiable Linux process identity.',409);
  workspace.tx(()=>{
    const old=workspace.db.prepare('SELECT * FROM leases WHERE name=?').get(name);
    if(old){
      assert(definitelyStopped(old,current),'OWNER_BUSY','The original operation is still owned. Preserve its current process or host.',409,{lease:name,owner:{host:old.host,pid:old.pid,at:old.at}});
      workspace.db.prepare('DELETE FROM leases WHERE name=? AND owner=?').run(name,old.owner);
    }
    workspace.db.prepare('INSERT INTO leases VALUES(?,?,?,?,?,?,?)').run(name,token,current.host,current.pid,current.start,current.boot,new Date().toISOString());
  });
  let released=false;
  return {name,token,release(){if(released)return;workspace.tx(()=>workspace.db.prepare('DELETE FROM leases WHERE name=? AND owner=?').run(name,token));released=true;}};
}
export async function withLease(workspace,name,fn) {
  const lease=acquireLease(workspace,name);try{return await fn(lease);}finally{lease.release();}
}
