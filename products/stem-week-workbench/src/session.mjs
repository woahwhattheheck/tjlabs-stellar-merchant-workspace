// MIT. Complete original editor fields, immutable prior sessions and atomic successors.
export function createStemWeekSessionAPI(core,C,options={}){
 const schema='stellar-forge.stemweek-editor-session.v1',carrierSchema='stellar-forge.stemweek-editor-carrier.v1',limit=options.maxBytes??128*1024*1024;
 const clone=x=>JSON.parse(JSON.stringify(x)),hash=t=>C.sha256Bytes(C.utf8Encode(t)),need=(v,m)=>{if(!v)throw Error(m)};
 need(Number.isSafeInteger(limit)&&limit>=1024&&limit<=128*1024*1024,'Choose a complete-session capacity up to 128 MiB');
 const id=options.id||(()=>crypto.randomUUID()),now=options.now||(()=>new Date().toISOString());
 const tables=Object.keys(core.columns),reviewFields=["action","reviewer","reason","quantity","evidence"];
 function blankSources(){return Object.fromEntries(tables.map(k=>[k,{name:k+".csv",text:core.columns[k].join(",")+"\n"}]))}
function weeks(w,id){const e=w.editions.find(x=>x.id===id);return e?[...new Set(["supply","commitments"].flatMap(t=>core.parseCSV(e.sources[t].text,t).map(r=>r.week_start)))].sort():[]}
function wrap(workspace){const w=core.reopen(workspace),last=w.editions.at(-1);return {schema:"tjlabs.stem-week-desk.v1",workspace:w,session:{projectLabel:w.label,editionId:last?.id||"",week:last?weeks(w,last.id)[0]||"":"",basis:"projected",target:"",decisionId:"",sourceDraft:{label:"",notes:"",sources:blankSources()},decisionDrafts:{}}}}
function obj(x,l){if(!x||typeof x!=="object"||Array.isArray(x))throw Error(l+" must be an object")}
function exactStrings(x,keys,l){obj(x,l);if(Object.keys(x).length!==keys.length||keys.some(k=>typeof x[k]!=="string"))throw Error("Complete "+l+" required")}
function parseTarget(t){if(!t)return null;let x;try{x=JSON.parse(t)}catch{throw Error("Invalid target")};if(!Array.isArray(x)||x.length!==2||!["variety","commitment"].includes(x[0])||typeof x[1]!=="string"||JSON.stringify(x)!==t)throw Error("Invalid target");return {targetType:x[0],targetId:x[1]}}
function hasTarget(p,t){const x=parseTarget(t);return !x||(x.targetType==="variety"?p.rows.some(r=>r.varietyId===x.targetId):p.commitments.some(r=>r.commitment_id===x.targetId))}
function validateDesk(v){
 if(v?.schema==="stemwise.week-workspace.v1"||v?.schema==="stemwise.workspace.v1")v=wrap(v);
 if(v?.schema!=="tjlabs.stem-week-desk.v1"){
  if(v?.editions&&v?.decisions&&v?.head)v=wrap(v);else throw Error("Complete Stem Week workspace required");
 }
 const n=clone(v);n.workspace=core.reopen(n.workspace);const s=n.session;obj(s,"Session");
 for(const k of ["projectLabel","editionId","week","basis","target","decisionId"])if(typeof s[k]!=="string")throw Error("Invalid session "+k);
 if(!["projected","actual"].includes(s.basis))throw Error("Invalid supply basis");
 obj(s.sourceDraft,"Source draft");exactStrings({label:s.sourceDraft.label,notes:s.sourceDraft.notes},["label","notes"],"source label and notes");obj(s.sourceDraft.sources,"Draft sources");if(Object.keys(s.sourceDraft.sources).sort().join("|")!==tables.slice().sort().join("|"))throw Error("Four complete draft tables required");
 for(const k of tables)exactStrings(s.sourceDraft.sources[k],["name","text"],k+" draft");
 obj(s.decisionDrafts,"Decision drafts");
 if(s.editionId){const p=core.plan(n.workspace,{editionId:s.editionId,week:s.week,basis:s.basis});if(!hasTarget(p,s.target))throw Error("Selected target missing");if(s.decisionId&&!p.decisions.some(d=>d.id===s.decisionId&&JSON.stringify([d.targetType,d.targetId])===s.target))throw Error("Selected correction belongs to a different target");}else if(s.week||s.target||s.decisionId)throw Error("Source-free selection has a target");
 for(const [key,d]of Object.entries(s.decisionDrafts)){let a;try{a=JSON.parse(key)}catch{throw Error("Invalid decision draft key")};if(!Array.isArray(a)||a.length!==6||a.some(x=>typeof x!=="string")||JSON.stringify(a)!==key)throw Error("Invalid decision draft identity");const[e,w,b,tt,tid,did]=a,p=core.plan(n.workspace,{editionId:e,week:w,basis:b});if(!hasTarget(p,JSON.stringify([tt,tid])))throw Error("Draft target not in source");if(did&&!p.decisions.some(x=>x.id===did&&x.targetType===tt&&x.targetId===tid))throw Error("Draft correction ID mismatch");exactStrings(d,reviewFields,"decision draft");if(!core.actions.includes(d.action))throw Error("Unknown draft action")}
 return n;
}

 function prepareDesk(d){
  const n=validateDesk(d),s=n.session,p=s.editionId?core.plan(n.workspace,{editionId:s.editionId,week:s.week,basis:s.basis}):null;
  const targets=p?[...p.rows.map(r=>JSON.stringify(['variety',r.varietyId])),...p.commitments.map(c=>JSON.stringify(['commitment',c.commitment_id]))]:[];
  if(!targets.includes(s.target)){s.target=targets[0]||'';s.decisionId='';}
  const t=parseTarget(s.target);
  if(t){const selected=p.decisions.filter(d=>d.targetType===t.targetType&&d.targetId===t.targetId);if(!selected.some(d=>d.id===s.decisionId))s.decisionId='';
   const key=JSON.stringify([s.editionId,s.week,s.basis,t.targetType,t.targetId,s.decisionId]),d=selected.find(d=>d.id===s.decisionId);
   s.decisionDrafts[key]??={action:d?.action||'hold',reviewer:d?.reviewer||'',reason:d?.reason||'',quantity:d?.quantity===null||d?.quantity===undefined?'':String(d.quantity),evidence:d?.evidence||''};
  }return validateDesk(n);
 }
 const desk=s=>({schema:'tjlabs.stem-week-desk.v1',workspace:clone(s.workspace),session:clone(s.editor)});
 function fromDesk(value){const d=prepareDesk(value);return {schema,workspace:d.workspace,editor:d.session,draft:{actor:''},backups:[],createdAt:now(),updatedAt:now()};}
 function fromWorkspace(value){return fromDesk(wrap(value));}
 function create(label='Stem Week Workbench'){return fromWorkspace(core.create({id:id(),label}));}
 function validate(s){
  need(s?.schema===schema&&typeof s.draft?.actor==='string'&&Array.isArray(s.backups)&&typeof s.createdAt==='string'&&typeof s.updatedAt==='string','Choose a complete stemweek editor session');
  need(JSON.stringify(validateDesk(desk(s)))===JSON.stringify(desk(s)),'Saved original editor is incomplete');
  for(const b of s.backups){need(b&&typeof b.id==='string'&&typeof b.reason==='string'&&typeof b.at==='string'&&b.snapshot&&!b.snapshot.backups&&hash(JSON.stringify(b.snapshot))===b.sha256,'Complete prior editor identity differs');validate({...clone(b.snapshot),backups:[]});}
  need(C.utf8Encode(JSON.stringify(s)).length<=limit,'Complete working session exceeds capacity; save the complete handover before beginning another project');return s;
 }
 function prepare(s){const d=prepareDesk(desk(s)),n=clone(s);n.workspace=d.workspace;n.editor=d.session;return validate(n);}
 function pack(s){validate(s);const session=clone(s),raw=JSON.stringify(session);return {schema:carrierSchema,bytes:C.utf8Encode(raw).length,sha256:hash(raw),session};}
 function receive(raw){need(typeof raw==='string'&&C.utf8Encode(raw).length<=limit+1024*1024,'Complete working file exceeds capacity');const c=JSON.parse(raw);
  if(c?.schema==='stemwise.week-workspace.v1')return fromWorkspace(c);
  if(c?.schema==='tjlabs.stem-week-desk.v1')return fromDesk(c);
  need(c?.schema===carrierSchema,'Choose a complete stemweek working file');const t=JSON.stringify(c.session);need(c.bytes===C.utf8Encode(t).length&&c.sha256===hash(t),'Complete editor identity differs');return validate(clone(c.session));
 }
 function backup(s,reason){validate(s);const snapshot=clone(s);delete snapshot.backups;return {id:id(),at:now(),reason,sha256:hash(JSON.stringify(snapshot)),snapshot};}
 function retain(s,reason){const n=clone(s);n.backups.push(backup(s,reason));return validate(n);}
 function transition(current,candidate,reason,at=now()){validate(current);const next=clone(candidate);next.backups=[...clone(current.backups),backup(current,reason)];next.updatedAt=at;return prepare(next);}
 function replace(current,incoming,reason){validate(current);validate(incoming);const next=clone(incoming),all=[...current.backups,...incoming.backups,backup(current,reason)],seen=new Map();next.backups=[];
  for(const b of all){const exact=JSON.stringify(b);need(!seen.has(b.id)||seen.get(b.id)===exact,'A prior session ID names different content');if(!seen.has(b.id)){seen.set(b.id,exact);next.backups.push(clone(b));}}next.updatedAt=now();return prepare(next);
 }
 function restoreBackup(s,key){const b=s.backups.find(x=>x.id===key);need(b,'Choose a retained complete prior session');return replace(s,{...clone(b.snapshot),backups:[]},'Before restoring '+key);}
 function advance(current,workspace,operation){const next=clone(current);next.workspace=core.reopen(workspace);
  if(operation.kind==='receive'){const e=operation.payload.id;next.editor.editionId=e;next.editor.week=weeks(next.workspace,e)[0]||'';next.editor.target='';next.editor.decisionId='';}
  else{for(const k of ['editionId','week','basis'])next.editor[k]=operation.payload[k];next.editor.target=JSON.stringify([operation.payload.targetType,operation.payload.targetId]);next.editor.decisionId=operation.payload.id;}
  return transition(current,next,'Complete editor before '+operation.kind+' '+operation.id,operation.at);
 }
 return {schema,carrierSchema,limit,id,now,hash,clone,copy:clone,create,validate,pack,receive,fromWorkspace,fromDesk,desk,prepareDesk,prepare,validateDesk,weeks,backup,retain,transition,replace,restoreBackup,advance};
}
