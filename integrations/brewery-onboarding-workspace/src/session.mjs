// MIT. Complete original editor fields, immutable prior sessions and atomic successors.
export function createBrewerySessionAPI(core,C,controller,options={}){
 const schema='stellar-forge.brewery-editor-session.v1',carrierSchema='stellar-forge.brewery-editor-carrier.v1',limit=options.maxBytes??128*1024*1024;
 const clone=x=>JSON.parse(JSON.stringify(x)),hash=t=>C.sha256Bytes(C.utf8Encode(t)),need=(v,m)=>{if(!v)throw Error(m)};
 need(Number.isSafeInteger(limit)&&limit>=1024&&limit<=128*1024*1024,'Choose a complete-session capacity up to 128 MiB');
 const id=options.id||(()=>crypto.randomUUID()),now=options.now||(()=>new Date().toISOString());
 const validateDesk=value=>controller.reopen(value),wrap=workspace=>controller.ensureSources(controller.create(workspace),core.columns);
 function prepareDesk(value){
  const d=controller.ensureSources(controller.reopen(value),core.columns),s=d.session,ed=core.editions(d.core);
  if(!ed.some(e=>e.id===s.selectedEdition))s.selectedEdition=ed.at(-1)?.id||'';
  if(s.selectedEdition){const a=core.analyse(d.core,s.selectedEdition),selected=s.selectedExceptions[s.selectedEdition]||'';
   if(!a.exceptions.some(e=>e.id===selected))s.selectedExceptions[s.selectedEdition]='';
   const id=s.selectedExceptions[s.selectedEdition];if(id)s.reviewDrafts[JSON.stringify([s.selectedEdition,id])]??={disposition:'investigate'};
  }return controller.reopen(d);
 }
 function desk(s){return {...clone(s.editor),core:clone(s.workspace)};}
 function fromDesk(value){const d=prepareDesk(value),workspace=d.core;delete d.core;return {schema,workspace,editor:d,draft:{actor:'',profileSearch:'',profileGroup:'all'},backups:[],createdAt:now(),updatedAt:now()};}
 function fromWorkspace(value){return fromDesk(wrap(value));}
 function create(label='Brewery onboarding'){return fromWorkspace(core.create({id:id(),label}));}
 function validate(s){
  need(s?.schema===schema&&typeof s.draft?.actor==='string'&&typeof s.draft.profileSearch==='string'&&typeof s.draft.profileGroup==='string'&&Array.isArray(s.backups)&&typeof s.createdAt==='string'&&typeof s.updatedAt==='string','Choose a complete brewery editor session');
  need(JSON.stringify(validateDesk(desk(s)))===JSON.stringify(desk(s)),'Saved original editor is incomplete');
  for(const b of s.backups){need(b&&typeof b.id==='string'&&typeof b.reason==='string'&&typeof b.at==='string'&&b.snapshot&&!b.snapshot.backups&&hash(JSON.stringify(b.snapshot))===b.sha256,'Complete prior editor identity differs');validate({...clone(b.snapshot),backups:[]});}
  need(C.utf8Encode(JSON.stringify(s)).length<=limit,'Complete working session exceeds capacity; save the complete handover before beginning another project');return s;
 }
 function prepare(s){const d=prepareDesk(desk(s)),n=clone(s);n.workspace=d.core;delete d.core;n.editor=d;return validate(n);}
 function pack(s){validate(s);const session=clone(s),raw=JSON.stringify(session);return {schema:carrierSchema,bytes:C.utf8Encode(raw).length,sha256:hash(raw),session};}
 function receive(raw){need(typeof raw==='string'&&C.utf8Encode(raw).length<=limit+1024*1024,'Complete working file exceeds capacity');const c=JSON.parse(raw);
  if(c?.schema==='tjlabs.brewery-reconciliation.v1')return fromWorkspace(c);
  if(c?.schema==='brewery-onboarding-desk/v1')return fromDesk(c);
  need(c?.schema===carrierSchema,'Choose a complete brewery working file');const t=JSON.stringify(c.session);need(c.bytes===C.utf8Encode(t).length&&c.sha256===hash(t),'Complete editor identity differs');return validate(clone(c.session));
 }
 function backup(s,reason){validate(s);const snapshot=clone(s);delete snapshot.backups;return {id:id(),at:now(),reason,sha256:hash(JSON.stringify(snapshot)),snapshot};}
 function retain(s,reason){const n=clone(s);n.backups.push(backup(s,reason));return validate(n);}
 function transition(current,candidate,reason,at=now()){validate(current);const next=clone(candidate);next.backups=[...clone(current.backups),backup(current,reason)];next.updatedAt=at;return prepare(next);}
 function replace(current,incoming,reason){validate(current);validate(incoming);const next=clone(incoming),all=[...current.backups,...incoming.backups,backup(current,reason)],seen=new Map();next.backups=[];
  for(const b of all){const exact=JSON.stringify(b);need(!seen.has(b.id)||seen.get(b.id)===exact,'A prior session ID names different content');if(!seen.has(b.id)){seen.set(b.id,exact);next.backups.push(clone(b));}}next.updatedAt=now();return prepare(next);
 }
 function restoreBackup(s,key){const b=s.backups.find(x=>x.id===key);need(b,'Choose a retained complete prior session');return replace(s,{...clone(b.snapshot),backups:[]},'Before restoring '+key);}
 function advance(current,workspace,operation){const next=clone(current);next.workspace=core.reopen(workspace);const s=next.editor.session;
  s.selectedEdition=operation.kind==='receive'?operation.payload.id:operation.payload.editionId;
  if(operation.kind==='review')s.selectedExceptions[s.selectedEdition]=operation.payload.exceptionId;
  return transition(current,next,'Complete editor before '+operation.kind+' '+operation.id,operation.at);
 }
 return {schema,carrierSchema,limit,id,now,hash,clone,copy:clone,create,validate,pack,receive,fromWorkspace,fromDesk,desk,prepareDesk,prepare,validateDesk,backup,retain,transition,replace,restoreBackup,advance};
}
