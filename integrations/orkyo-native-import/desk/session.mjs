// MIT. Complete Orkyo editor sessions; original native events remain the domain authority.
export function createOrkyoSessionAPI(core,codec,options={}){
 const schema='stellar-forge.orkyo-editor-session.v1',carrierSchema='stellar-forge.orkyo-editor-carrier.v1',limit=128*1024*1024;
 const clone=x=>JSON.parse(JSON.stringify(x)),hash=x=>codec.sha256(codec.utf8Encode(x)),need=(v,m)=>{if(!v)throw Error(m)};
 const id=options.id||(()=>crypto.randomUUID()),now=options.now||(()=>new Date().toISOString());
 const fields=["title","kind","format","source-id","filename","tenant","type-key","site-id","custom-fields","existing","lookup","source-text","correction-reason","review-action","reviewer","review-reason","review-values","acknowledged","target-id","review-evidence","distinct-reason","batch-id","confirm-tenant","operator","route","attempt-details","outcome-row","outcome-status","outcome-target","outcome-reviewer","outcome-reason","outcome-evidence","note-title","note-text"];
 const tabs=['intake','review','batches-tab','workspace-tab'];
 function blankCopy(workspace){return {schema:'tjlabs.orkyo-desk-copy.v1',savedAt:workspace.createdAt,workspace,forms:{...Object.fromEntries(fields.map(k=>[k,''])),title:workspace.title,kind:'requests',format:'csv','custom-fields':'{}',existing:'[]','review-action':'new','review-values':'{}','outcome-status':'created'},pendingFile:null,flags:{existingComplete:false},selection:{source:'',row:'',batch:''},outcomeDraftBinding:{batchId:'',rowId:''},savedKey:'',ui:{activeTab:'intake',page:0,search:'',selected:[]}};}
 function validateCopy(input){
  const x=clone(input);need(x?.schema==='tjlabs.orkyo-desk-copy.v1','Choose a complete Orkyo desk copy');
  x.workspace=core.reopen(x.workspace).workspace;need(x.forms&&typeof x.forms==='object'&&!Array.isArray(x.forms),'Full form draft required');
  for(const k of fields)need(typeof x.forms[k]==='string','Draft field missing: '+k);
  need(['requests','resources','workbook'].includes(x.forms.kind),'Unknown draft import kind');
  need(x.flags==null||typeof x.flags.existingComplete==='boolean','Invalid complete-lookup draft flag');
  if(x.pendingFile){need(typeof x.pendingFile.filename==='string'&&typeof x.pendingFile.base64==='string','Pending original is incomplete');const b=codec.base64Decode(x.pendingFile.base64);need(b.length===x.pendingFile.bytes&&codec.sha256(b)===x.pendingFile.sha256,'Pending original bytes differ');}
  const v=core.view(x.workspace),s=x.selection||{},src=v.sources.find(z=>z.id===s.source),batch=v.batches.find(z=>z.id===s.batch);
  need(!s.source||src,'Saved selected source is missing');need(!s.row||src?.rows.some(z=>z.id===s.row),'Saved selected row is missing');need(!s.batch||batch,'Saved selected batch is missing');
  const row=x.forms['outcome-row'];need(!row||batch?.rows.some(z=>z.id===row),'Saved outcome row is not in its selected batch');
  need(!x.outcomeDraftBinding||x.outcomeDraftBinding.batchId===(s.batch||'')&&x.outcomeDraftBinding.rowId===row,'Outcome draft binding differs');
  if(x.ui){need(tabs.includes(x.ui.activeTab)&&Number.isSafeInteger(x.ui.page)&&x.ui.page>=0&&typeof x.ui.search==='string'&&Array.isArray(x.ui.selected)&&x.ui.selected.every(r=>typeof r==='string'&&src?.rows.some(z=>z.id===r))&&new Set(x.ui.selected).size===x.ui.selected.length,'Complete editor view selection differs');}
  need(x.earlierInMemoryCopies===undefined||Array.isArray(x.earlierInMemoryCopies),'Earlier copies are incomplete');
  return x;
 }
 function fromCopy(input,{actor=''}={}){
  const r=validateCopy(input),workspace=r.workspace,emergency=r.earlierInMemoryCopies||[];delete r.workspace;delete r.earlierInMemoryCopies;
  return validate({schema,workspace,draft:{actor,copy:r,emergency},backups:[],createdAt:workspace.createdAt,updatedAt:r.savedAt||workspace.createdAt});
 }
 function toCopy(s){return {...clone(s.draft.copy),workspace:clone(s.workspace)};}
 function create(label='Orkyo import readiness'){return fromCopy(blankCopy(core.create({id:id(),title:label,at:now()})));}
 function validate(s){
  need(s?.schema===schema&&typeof s.draft?.actor==='string'&&Array.isArray(s.draft.emergency)&&Array.isArray(s.backups),'Choose a complete Orkyo editor session');
  validateCopy(toCopy(s));for(const r of s.draft.emergency)validateCopy(r);
  for(const b of s.backups){need(b&&typeof b.id==='string'&&typeof b.reason==='string'&&typeof b.at==='string'&&b.snapshot&&!b.snapshot.backups&&hash(JSON.stringify(b.snapshot))===b.sha256,'Complete prior editor identity differs');validate({...clone(b.snapshot),backups:[]});}
  need(codec.utf8Encode(JSON.stringify(s)).length<=limit,'Complete editor exceeds 128 MiB; retain the handover and begin a separate workspace');return s;
 }
 function advance(current,workspace,operation){
  const next=clone(current);next.workspace=core.reopen(workspace).workspace;next.updatedAt=operation.at;
  if(operation.kind==='correct-source'&&next.draft.copy.selection?.source===operation.payload.sourceId){
   next.backups.push(backup(current,'Complete row-review draft before source correction '+operation.id));
   const r=next.draft.copy;r.selection.row='';r.ui={...(r.ui||{activeTab:'review',page:0,search:''}),selected:[]};
   for(const k of ['reviewer','review-reason','acknowledged','target-id','review-evidence','distinct-reason'])r.forms[k]='';
   r.forms['review-action']='new';r.forms['review-values']='{}';
  }
  return validate(next);
 }
 function capture(current,record,emergency,actor){const r=validateCopy(record),next=clone(current);next.workspace=r.workspace;delete r.workspace;delete r.earlierInMemoryCopies;next.draft={...next.draft,actor,copy:r,emergency:clone(emergency)};next.updatedAt=r.savedAt===current.draft.copy.savedAt?current.updatedAt:r.savedAt;return validate(next);}
 function pack(s){validate(s);const session=clone(s),raw=JSON.stringify(session);return {schema:carrierSchema,bytes:codec.utf8Encode(raw).length,sha256:hash(raw),session};}
 function receive(raw){need(typeof raw==='string'&&codec.utf8Encode(raw).length<=limit+1024*1024,'Complete received session exceeds capacity');const c=JSON.parse(raw);need(c?.schema===carrierSchema,'Choose the complete Orkyo working carrier');const text=JSON.stringify(c.session);need(c.bytes===codec.utf8Encode(text).length&&c.sha256===hash(text),'Received session identity differs');return validate(clone(c.session));}
 function backup(s,reason){validate(s);const snapshot=clone(s);delete snapshot.backups;return {id:id(),at:now(),reason,sha256:hash(JSON.stringify(snapshot)),snapshot};}
 function replace(current,incoming,reason){validate(current);validate(incoming);const next=clone(incoming),all=[...current.backups,...incoming.backups,backup(current,reason)],seen=new Map();next.backups=[];for(const b of all){const exact=JSON.stringify(b);need(!seen.has(b.id)||seen.get(b.id)===exact,'A prior copy ID names different content');if(!seen.has(b.id)){seen.set(b.id,exact);next.backups.push(clone(b));}}next.updatedAt=now();return validate(next);}
 function restoreBackup(s,key){const b=s.backups.find(x=>x.id===key);need(b,'Choose a retained complete prior editor');return replace(s,{...clone(b.snapshot),backups:[]},'Before restoring '+key);}
 return {schema,carrierSchema,limit,fields,tabs,id,now,hash,clone,copy:clone,blankCopy,validateCopy,advance,fromCopy,toCopy,create,validate,capture,pack,receive,backup,replace,restoreBackup};
}
