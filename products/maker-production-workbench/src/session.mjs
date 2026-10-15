// MIT. Complete original editor fields, immutable prior sessions and atomic successors.
export function createMakerProductionSessionAPI(core,C,options={}){
 const schema='stellar-forge.makerproduction-editor-session.v1',carrierSchema='stellar-forge.makerproduction-editor-carrier.v1',limit=options.maxBytes??128*1024*1024;
 const clone=x=>JSON.parse(JSON.stringify(x)),hash=t=>C.sha256Bytes(C.utf8Encode(t)),need=(v,m)=>{if(!v)throw Error(m)};
 need(Number.isSafeInteger(limit)&&limit>=1024&&limit<=128*1024*1024,'Choose a complete-session capacity up to 128 MiB');
 const id=options.id||(()=>crypto.randomUUID()),now=options.now||(()=>new Date().toISOString());
 const tables=Object.keys(core.columns),reviewFields=["action","reviewer","reason","evidence"],observationFields=["eventId","observedAt","localDate","status","inputQty","goodQty","rejectQty","heldQty","sourceRef"];
 function blankSources(){return Object.fromEntries(tables.map(k=>[k,{name:k+".csv",text:core.columns[k].join(",")+"\n"}]))}
function wrap(workspace){const w=core.reopen(workspace),last=w.editions.at(-1);return {schema:"tjlabs.maker-production-desk.v1",workspace:w,session:{projectLabel:w.label,editionId:last?.id||"",asOf:last?.settings.asOf||"",target:"",decisionId:"",observationBatch:"",observationStage:"",sourceDraft:{label:"",notes:"",asOf:"",shippingDays:"",shippingClosed:"",sources:blankSources()},decisionDrafts:{},observationDrafts:{}}}}
function obj(x,l){if(!x||typeof x!=="object"||Array.isArray(x))throw Error(l+" must be an object")}
function exactStrings(x,keys,l){obj(x,l);if(Object.keys(x).length!==keys.length||keys.some(k=>typeof x[k]!=="string"))throw Error("Complete "+l+" required")}
function parseTarget(t){if(!t)return null;let x;try{x=JSON.parse(t)}catch{throw Error("Invalid target")};if(!Array.isArray(x)||x.length!==2||!["order","batch","capacity"].includes(x[0])||typeof x[1]!=="string"||JSON.stringify(x)!==t)throw Error("Invalid target");return {targetType:x[0],targetId:x[1]}}
function hasTarget(p,t){const x=parseTarget(t);return !x||(x.targetType==="order"?p.orders.some(r=>r.orderId===x.targetId):x.targetType==="batch"?p.batches.some(r=>r.batchId===x.targetId):p.capacity.some(r=>r.id===x.targetId))}
function validateDesk(v){
 if(v?.schema==="maker.production-workspace.v1")v=wrap(v);
 if(v?.schema!=="tjlabs.maker-production-desk.v1"){
  if(v?.editions&&v?.decisions&&v?.head)v=wrap(v);else throw Error("Complete Maker Production workspace required");
 }
 const n=clone(v);n.workspace=core.reopen(n.workspace);const s=n.session;obj(s,"Session");
 for(const k of ["projectLabel","editionId","asOf","target","decisionId","observationBatch","observationStage"])if(typeof s[k]!=="string")throw Error("Invalid session "+k);
 
 obj(s.sourceDraft,"Source draft");for(const k of ["label","notes","asOf","shippingDays","shippingClosed"])if(typeof s.sourceDraft[k]!=="string")throw Error("Invalid source draft "+k);obj(s.sourceDraft.sources,"Draft sources");if(Object.keys(s.sourceDraft.sources).sort().join("|")!==tables.slice().sort().join("|"))throw Error("Eight complete draft tables required");
 for(const k of tables)exactStrings(s.sourceDraft.sources[k],["name","text"],k+" draft");
 obj(s.decisionDrafts,"Decision drafts");obj(s.observationDrafts,"Observation drafts");
 if(s.editionId){const p=core.plan(n.workspace,{editionId:s.editionId,asOf:s.asOf});if(!hasTarget(p,s.target))throw Error("Selected target missing");if(s.observationBatch&&!p.batches.some(b=>b.batchId===s.observationBatch))throw Error("Observation batch is absent");if(s.observationStage&&!p.stages.some(t=>t.batchId===s.observationBatch&&t.stageId===s.observationStage))throw Error("Observation stage is absent");if(s.decisionId&&!p.decisions.some(d=>d.id===s.decisionId&&JSON.stringify([d.targetType,d.targetId])===s.target))throw Error("Selected correction belongs to a different target");}else if(s.asOf||s.target||s.decisionId||s.observationBatch||s.observationStage)throw Error("Source-free selection has a target");
 for(const [key,d]of Object.entries(s.decisionDrafts)){let a;try{a=JSON.parse(key)}catch{throw Error("Invalid decision draft key")};if(!Array.isArray(a)||a.length!==5||a.some(x=>typeof x!=="string")||JSON.stringify(a)!==key)throw Error("Invalid decision draft identity");const[e,date,tt,tid,did]=a,p=core.plan(n.workspace,{editionId:e,asOf:date});if(!hasTarget(p,JSON.stringify([tt,tid])))throw Error("Draft target not in source");if(did&&!p.decisions.some(x=>x.id===did&&x.targetType===tt&&x.targetId===tid))throw Error("Draft correction ID mismatch");exactStrings(d,reviewFields,"decision draft");if(!core.actions.includes(d.action))throw Error("Unknown draft action")}
 for(const [key,d]of Object.entries(s.observationDrafts)){let a;try{a=JSON.parse(key)}catch{throw Error("Invalid observation draft key")};if(!Array.isArray(a)||a.length!==4||a.some(x=>typeof x!=="string")||JSON.stringify(a)!==key)throw Error("Invalid observation draft identity");const [editionId,asOf,batchId,stageId]=a,p=core.plan(n.workspace,{editionId,asOf});if(!p.stages.some(t=>t.batchId===batchId&&t.stageId===stageId))throw Error("Observation draft source stage absent");exactStrings(d,observationFields,"observation draft");if(!["active","complete"].includes(d.status))throw Error("Invalid draft observation status")}
 return n;
}

 function prepareDesk(d){
 const n=validateDesk(d),s=n.session,p=s.editionId?core.plan(n.workspace,{editionId:s.editionId,asOf:s.asOf}):null;
 const targets=p?[...p.orders.map(r=>JSON.stringify(['order',r.orderId])),...p.batches.map(r=>JSON.stringify(['batch',r.batchId])),...p.capacity.map(r=>JSON.stringify(['capacity',r.id]))]:[];
 if(!targets.includes(s.target)){s.target=targets[0]||'';s.decisionId='';}
 const t=parseTarget(s.target);
 if(t){const selected=p.decisions.filter(d=>d.targetType===t.targetType&&d.targetId===t.targetId);if(!selected.some(d=>d.id===s.decisionId))s.decisionId='';
 const key=JSON.stringify([s.editionId,s.asOf,t.targetType,t.targetId,s.decisionId]),d=selected.find(d=>d.id===s.decisionId);
 s.decisionDrafts[key]??={action:d?.action||'hold',reviewer:d?.reviewer||'',reason:d?.reason||'',evidence:d?.evidence||''};}
 const batches=p?.batches||[];if(!batches.some(b=>b.batchId===s.observationBatch))s.observationBatch=batches[0]?.batchId||'';
 const stages=p?.stages.filter(t=>t.batchId===s.observationBatch)||[];if(!stages.some(t=>t.stageId===s.observationStage))s.observationStage=stages[0]?.stageId||'';
 if(s.editionId&&s.observationBatch&&s.observationStage){const key=JSON.stringify([s.editionId,s.asOf,s.observationBatch,s.observationStage]);s.observationDrafts[key]??={eventId:id(),observedAt:'',localDate:'',status:'active',inputQty:'',goodQty:'',rejectQty:'',heldQty:'',sourceRef:''};}
 return validateDesk(n);
 }

 const desk=s=>({schema:'tjlabs.maker-production-desk.v1',workspace:clone(s.workspace),session:clone(s.editor)});
 function fromDesk(value){const d=prepareDesk(value);return {schema,workspace:d.workspace,editor:d.session,draft:{actor:''},backups:[],createdAt:now(),updatedAt:now()};}
 function fromWorkspace(value){return fromDesk(wrap(value));}
 function create(label='Maker Production Workbench'){return fromWorkspace(core.create({id:id(),label}));}
 function validate(s){
  need(s?.schema===schema&&typeof s.draft?.actor==='string'&&Array.isArray(s.backups)&&typeof s.createdAt==='string'&&typeof s.updatedAt==='string','Choose a complete makerproduction editor session');
  need(JSON.stringify(validateDesk(desk(s)))===JSON.stringify(desk(s)),'Saved original editor is incomplete');
  for(const b of s.backups){need(b&&typeof b.id==='string'&&typeof b.reason==='string'&&typeof b.at==='string'&&b.snapshot&&!b.snapshot.backups&&hash(JSON.stringify(b.snapshot))===b.sha256,'Complete prior editor identity differs');validate({...clone(b.snapshot),backups:[]});}
  need(C.utf8Encode(JSON.stringify(s)).length<=limit,'Complete working session exceeds capacity; save the complete handover before beginning another project');return s;
 }
 function prepare(s){const d=prepareDesk(desk(s)),n=clone(s);n.workspace=d.workspace;n.editor=d.session;return validate(n);}
 function pack(s){validate(s);const session=clone(s),raw=JSON.stringify(session);return {schema:carrierSchema,bytes:C.utf8Encode(raw).length,sha256:hash(raw),session};}
 function receive(raw){need(typeof raw==='string'&&C.utf8Encode(raw).length<=limit+1024*1024,'Complete working file exceeds capacity');const c=JSON.parse(raw);
  if(c?.schema==='maker.production-workspace.v1')return fromWorkspace(c);
  if(c?.schema==='tjlabs.maker-production-desk.v1')return fromDesk(c);
  need(c?.schema===carrierSchema,'Choose a complete makerproduction working file');const t=JSON.stringify(c.session);need(c.bytes===C.utf8Encode(t).length&&c.sha256===hash(t),'Complete editor identity differs');return validate(clone(c.session));
 }
 function backup(s,reason){validate(s);const snapshot=clone(s);delete snapshot.backups;return {id:id(),at:now(),reason,sha256:hash(JSON.stringify(snapshot)),snapshot};}
 function retain(s,reason){const n=clone(s);n.backups.push(backup(s,reason));return validate(n);}
 function transition(current,candidate,reason,at=now()){validate(current);const next=clone(candidate);next.backups=[...clone(current.backups),backup(current,reason)];next.updatedAt=at;return prepare(next);}
 function replace(current,incoming,reason){validate(current);validate(incoming);const next=clone(incoming),all=[...current.backups,...incoming.backups,backup(current,reason)],seen=new Map();next.backups=[];
  for(const b of all){const exact=JSON.stringify(b);need(!seen.has(b.id)||seen.get(b.id)===exact,'A prior session ID names different content');if(!seen.has(b.id)){seen.set(b.id,exact);next.backups.push(clone(b));}}next.updatedAt=now();return prepare(next);
 }
 function restoreBackup(s,key){const b=s.backups.find(x=>x.id===key);need(b,'Choose a retained complete prior session');return replace(s,{...clone(b.snapshot),backups:[]},'Before restoring '+key);}
 function advance(current,workspace,operation){const next=clone(current);next.workspace=core.reopen(workspace);const p=operation.payload;
 if(operation.kind==='receive'){next.editor.editionId=p.id;next.editor.asOf=next.workspace.editions.find(e=>e.id===p.id).settings.asOf;next.editor.target='';next.editor.decisionId='';next.editor.observationBatch='';next.editor.observationStage='';}
 else if(operation.kind==='observation'){next.editor.editionId=p.newEditionId;next.editor.asOf=p.event.localDate>p.asOf?p.event.localDate:p.asOf;next.editor.target=JSON.stringify(['batch',p.batchId]);next.editor.decisionId='';next.editor.observationBatch=p.batchId;next.editor.observationStage=p.stageId;}
 else{next.editor.editionId=p.editionId;next.editor.asOf=p.asOf;next.editor.target=JSON.stringify([p.targetType,p.targetId]);next.editor.decisionId=p.id;}
 return transition(current,next,'Complete editor before '+operation.kind+' '+operation.id,operation.at);
 }

 return {schema,carrierSchema,limit,id,now,hash,clone,copy:clone,create,validate,pack,receive,fromWorkspace,fromDesk,desk,prepareDesk,prepare,validateDesk,backup,retain,transition,replace,restoreBackup,advance};
}
