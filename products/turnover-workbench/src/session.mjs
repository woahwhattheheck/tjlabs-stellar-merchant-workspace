// MIT. Complete original editor fields, immutable prior sessions and atomic successors.
export function createTurnoverSessionAPI(core,C,options={}){
 const schema='stellar-forge.turnover-editor-session.v1',carrierSchema='stellar-forge.turnover-editor-carrier.v1',limit=options.maxBytes??128*1024*1024;
 const clone=x=>JSON.parse(JSON.stringify(x)),hash=t=>C.sha256Bytes(C.utf8Encode(t)),need=(v,m)=>{if(!v)throw Error(m)};
 need(Number.isSafeInteger(limit)&&limit>=1024&&limit<=128*1024*1024,'Choose a complete-session capacity up to 128 MiB');
 const id=options.id||(()=>crypto.randomUUID()),now=options.now||(()=>new Date().toISOString());
 const sourceKeys=["edition-label","rate-num","rate-den","old-name","old-text","next-name","next-text","cues-name","cues-text","source-notes"];
const reviewKeys=["review-decision","review-mapping","reviewer","review-reason","review-evidence-name","review-evidence-text"];
const receiveKeys=["receiver","receiving-status","receiving-reference","receiving-notes","receiving-evidence-name","receiving-evidence-text"];
const choices=["accept-proposal","choose-mapping","keep-original","exclude","needs-work"];
const statuses=["received","accepted","needs-rework"];

 function blankSource(){return Object.fromEntries(sourceKeys.map(k=>[k,k==="rate-num"?"25":k==="rate-den"?"1":""]))}
function wrap(workspace){const w=core.reopen(workspace),ed=core.editions(w);return {schema:"tjlabs.turnover-desk.v1",workspace:w,session:{projectLabel:w.label,selectedEdition:ed.at(-1)?.id||"",selectedCue:"",sourceDraft:blankSource(),reviewDrafts:{},receivingDrafts:{}}}}
function object(v,label){if(!v||typeof v!=="object"||Array.isArray(v))throw Error(label+" must be an object")}
function strings(v,keys,label){object(v,label);if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)||typeof v[k]!=="string"))throw Error("Complete "+label+" required")}
function validateDesk(v){
 if(v?.schema==="tjlabs.turnover-workspace.v1")v=wrap(v);
 if(v?.schema!=="tjlabs.turnover-desk.v1")throw Error("Complete Turnover Workbench workspace required");
 const n=clone(v);n.workspace=core.reopen(n.workspace);const s=n.session;object(s,"Session");strings(s.sourceDraft,sourceKeys,"source draft");
 for(const k of ["projectLabel","selectedEdition","selectedCue"])if(typeof s[k]!=="string")throw Error("Session "+k+" is invalid");
 object(s.reviewDrafts,"Review drafts");object(s.receivingDrafts,"Receiving drafts");
 const editions=core.editions(n.workspace),byId=new Map(editions.map(e=>[e.id,e])),comparisons=new Map();
 function comp(id){if(!byId.has(id))throw Error("Draft refers to a missing source edition");if(!comparisons.has(id))comparisons.set(id,core.compare(n.workspace,id));return comparisons.get(id)}
 function keyParts(key,length){let p;try{p=JSON.parse(key)}catch{throw Error("Invalid draft identity")};if(!Array.isArray(p)||p.length!==length||p.some(x=>typeof x!=="string")||JSON.stringify(p)!==key)throw Error("Invalid draft identity");return p}
 if(s.selectedEdition&&!byId.has(s.selectedEdition))throw Error("Selected source edition is unavailable");
 if(s.selectedCue&&(!s.selectedEdition||!comp(s.selectedEdition).cues.some(c=>c.cueId===s.selectedCue)))throw Error("Selected cue is unavailable");
 for(const [key,d]of Object.entries(s.reviewDrafts)){const [e,c]=keyParts(key,2),cue=comp(e).cues.find(r=>r.cueId===c);if(!cue)throw Error("Review draft cue is unavailable");strings(d,reviewKeys,"review draft");if(!choices.includes(d["review-decision"]))throw Error("Unknown draft decision");if(d["review-mapping"]&&!cue.mappings.some(m=>m.id===d["review-mapping"]))throw Error("Draft mapping belongs to another cue or source")}
 for(const [key,d]of Object.entries(s.receivingDrafts)){const[e,c,r]=keyParts(key,3),cue=comp(e).cues.find(x=>x.cueId===c);if(!cue||!cue.reviewHistory.some(x=>x.id===r))throw Error("Receiving draft review is unavailable");strings(d,receiveKeys,"receiving draft");if(!statuses.includes(d["receiving-status"]))throw Error("Unknown receiving status")}
 return n;
}

 function prepareDesk(d){
  const n=validateDesk(d),s=n.session,c=s.selectedEdition?core.compare(n.workspace,s.selectedEdition):null;
  if(!c?.cues.some(x=>x.cueId===s.selectedCue))s.selectedCue=c?.cues[0]?.cueId||'';
  const cue=c?.cues.find(x=>x.cueId===s.selectedCue);
  if(cue){const key=JSON.stringify([s.selectedEdition,cue.cueId]),r=cue.review;
   s.reviewDrafts[key]??={'review-decision':r?.decision||'needs-work','review-mapping':r?.selectedMapping||'',reviewer:r?.reviewer||'','review-reason':r?.reason||'','review-evidence-name':r?.receivingEvidence?.name||'','review-evidence-text':r?.receivingEvidence?.text||''};
   if(r)s.receivingDrafts[JSON.stringify([s.selectedEdition,cue.cueId,r.id])]??=Object.fromEntries(receiveKeys.map(k=>[k,k==='receiving-status'?'received':'']));
  }return validateDesk(n);
 }
 const desk=s=>({schema:'tjlabs.turnover-desk.v1',workspace:clone(s.workspace),session:clone(s.editor)});
 function fromDesk(value){const d=prepareDesk(value);return {schema,workspace:d.workspace,editor:d.session,draft:{actor:''},backups:[],createdAt:now(),updatedAt:now()};}
 function fromWorkspace(value){return fromDesk(wrap(value));}
 function create(label='Turnover Workbench'){return fromWorkspace(core.create({id:id(),label}));}
 function validate(s){
  need(s?.schema===schema&&typeof s.draft?.actor==='string'&&Array.isArray(s.backups)&&typeof s.createdAt==='string'&&typeof s.updatedAt==='string','Choose a complete turnover editor session');
  need(JSON.stringify(validateDesk(desk(s)))===JSON.stringify(desk(s)),'Saved original editor is incomplete');
  for(const b of s.backups){need(b&&typeof b.id==='string'&&typeof b.reason==='string'&&typeof b.at==='string'&&b.snapshot&&!b.snapshot.backups&&hash(JSON.stringify(b.snapshot))===b.sha256,'Complete prior editor identity differs');validate({...clone(b.snapshot),backups:[]});}
  need(C.utf8Encode(JSON.stringify(s)).length<=limit,'Complete working session exceeds capacity; save the complete handover before beginning another project');return s;
 }
 function prepare(s){const d=prepareDesk(desk(s)),n=clone(s);n.workspace=d.workspace;n.editor=d.session;return validate(n);}
 function pack(s){validate(s);const session=clone(s),raw=JSON.stringify(session);return {schema:carrierSchema,bytes:C.utf8Encode(raw).length,sha256:hash(raw),session};}
 function receive(raw){need(typeof raw==='string'&&C.utf8Encode(raw).length<=limit+1024*1024,'Complete working file exceeds capacity');const c=JSON.parse(raw);
  if(c?.schema==='tjlabs.turnover-workspace.v1')return fromWorkspace(c);
  if(c?.schema==='tjlabs.turnover-desk.v1')return fromDesk(c);
  need(c?.schema===carrierSchema,'Choose a complete turnover working file');const t=JSON.stringify(c.session);need(c.bytes===C.utf8Encode(t).length&&c.sha256===hash(t),'Complete editor identity differs');return validate(clone(c.session));
 }
 function backup(s,reason){validate(s);const snapshot=clone(s);delete snapshot.backups;return {id:id(),at:now(),reason,sha256:hash(JSON.stringify(snapshot)),snapshot};}
 function retain(s,reason){const n=clone(s);n.backups.push(backup(s,reason));return validate(n);}
 function transition(current,candidate,reason,at=now()){validate(current);const next=clone(candidate);next.backups=[...clone(current.backups),backup(current,reason)];next.updatedAt=at;return prepare(next);}
 function replace(current,incoming,reason){validate(current);validate(incoming);const next=clone(incoming),all=[...current.backups,...incoming.backups,backup(current,reason)],seen=new Map();next.backups=[];
  for(const b of all){const exact=JSON.stringify(b);need(!seen.has(b.id)||seen.get(b.id)===exact,'A prior session ID names different content');if(!seen.has(b.id)){seen.set(b.id,exact);next.backups.push(clone(b));}}next.updatedAt=now();return prepare(next);
 }
 function restoreBackup(s,key){const b=s.backups.find(x=>x.id===key);need(b,'Choose a retained complete prior session');return replace(s,{...clone(b.snapshot),backups:[]},'Before restoring '+key);}
 function advance(current,workspace,operation){const next=clone(current);next.workspace=core.reopen(workspace);
  next.editor.selectedEdition=operation.kind==='receive'?operation.payload.id:operation.payload.editionId;
  next.editor.selectedCue=operation.kind==='receive'?'':operation.payload.cueId;
  return transition(current,next,'Complete editor before '+operation.kind+' '+operation.id,operation.at);
 }
 return {schema,carrierSchema,limit,id,now,hash,clone,copy:clone,create,validate,pack,receive,fromWorkspace,fromDesk,desk,prepareDesk,prepare,validateDesk,backup,retain,transition,replace,restoreBackup,advance};
}
