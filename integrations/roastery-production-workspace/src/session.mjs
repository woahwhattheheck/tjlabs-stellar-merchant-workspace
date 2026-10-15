// MIT. Complete original roastery workspaces, unfinished writing and independent prior sessions.
export function createRoasterySessionAPI(core,C,options={}){
 const schema='stellar-forge.roastery-editor-session.v1',carrierSchema='stellar-forge.roastery-editor-carrier.v1',limit=options.maxBytes??128*1024*1024;
 const clone=x=>JSON.parse(JSON.stringify(x)),hash=t=>C.sha256Bytes(C.utf8Encode(t)),need=(v,m)=>{if(!v)throw Error(m)};
 need(Number.isSafeInteger(limit)&&limit>=1024&&limit<=128*1024*1024,'Choose a complete-session capacity up to 128 MiB');
 const id=options.id||(()=>crypto.randomUUID()),now=options.now||(()=>new Date().toISOString());
 function fromWorkspace(workspace){workspace=core.reopen(workspace);return {schema,workspace,draft:{actor:workspace.session.reviewer||'',profileSearch:'',profileGroup:'all'},backups:[],createdAt:now(),updatedAt:now()};}
 function create(label='Roastery production'){const w=core.empty();w.caseName=label;return fromWorkspace(w);}
 function validate(s){
  need(s?.schema===schema&&typeof s.draft?.actor==='string'&&typeof s.draft.profileSearch==='string'&&typeof s.draft.profileGroup==='string'&&Array.isArray(s.backups)&&typeof s.createdAt==='string'&&typeof s.updatedAt==='string','Choose a complete roastery editor session');
  need(JSON.stringify(core.reopen(s.workspace))===JSON.stringify(s.workspace),'Saved workspace is incomplete; receive the original workspace through its supported import');
  for(const b of s.backups){need(b&&typeof b.id==='string'&&typeof b.reason==='string'&&typeof b.at==='string'&&b.snapshot&&!b.snapshot.backups&&hash(JSON.stringify(b.snapshot))===b.sha256,'Complete prior session identity differs');validate({...clone(b.snapshot),backups:[]});}
  need(C.utf8Encode(JSON.stringify(s)).length<=limit,'Complete working session exceeds 128 MiB; save the handover before beginning another period');return s;
 }
 function pack(s){validate(s);const session=clone(s),raw=JSON.stringify(session);return {schema:carrierSchema,bytes:C.utf8Encode(raw).length,sha256:hash(raw),session};}
 function receive(raw){need(typeof raw==='string'&&C.utf8Encode(raw).length<=limit+1024*1024,'Complete working file exceeds capacity');const c=JSON.parse(raw);
  if(c?.schema==='tjlabs.roastery-workspace.v1')return fromWorkspace(c);
  need(c?.schema===carrierSchema,'Choose a complete roastery working file');const text=JSON.stringify(c.session);need(c.bytes===C.utf8Encode(text).length&&c.sha256===hash(text),'Complete session identity differs');return validate(clone(c.session));
 }
 function backup(s,reason){validate(s);const snapshot=clone(s);delete snapshot.backups;return {id:id(),at:now(),reason,sha256:hash(JSON.stringify(snapshot)),snapshot};}
 function retain(s,reason){const n=clone(s);n.backups.push(backup(s,reason));return validate(n);}
 function transition(current,workspace,reason,at=now()){validate(current);const next=clone(current);next.backups.push(backup(current,reason));next.workspace=core.reopen(workspace);next.updatedAt=at;return validate(next);}
 function replace(current,incoming,reason){validate(current);validate(incoming);const next=clone(incoming),all=[...current.backups,...incoming.backups,backup(current,reason)],seen=new Map();next.backups=[];
  for(const b of all){const exact=JSON.stringify(b);need(!seen.has(b.id)||seen.get(b.id)===exact,'A prior session ID names different content');if(!seen.has(b.id)){seen.set(b.id,exact);next.backups.push(clone(b));}}next.updatedAt=now();return validate(next);
 }
 function restoreBackup(s,key){const b=s.backups.find(x=>x.id===key);need(b,'Choose a retained complete prior session');return replace(s,{...clone(b.snapshot),backups:[]},'Before restoring '+key);}
 function advance(current,workspace,operation){
  const next=core.reopen(workspace);
  if(operation.kind==='receive')delete next.session.tableDrafts[operation.payload.table];
  if(operation.kind==='outcome')delete next.session.outcomeDrafts[JSON.stringify([operation.payload.planId,operation.payload.batchId])];
  return transition(current,next,'Complete editor before '+operation.kind+' '+operation.id,operation.at);
 }

 return {schema,carrierSchema,limit,id,now,hash,clone,copy:clone,create,validate,pack,receive,fromWorkspace,backup,retain,transition,replace,restoreBackup,advance};
}
