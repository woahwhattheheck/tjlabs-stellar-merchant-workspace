/* MIT. Source-preserving offline operator session; domain authority stays in hardware-review/core.mjs. */
export function createSessionAPI(api, codec, options={}) {
 const schema="commons.hardware-review-operator-session.v1",limit=options.maxSessionBytes||128*1024*1024;
 const clone=x=>JSON.parse(JSON.stringify(x)),encode=codec.encode,hash=codec.sha256;
 const need=(v,m)=>{if(!v)throw Error(m);};
 const id=options.id||(()=>typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():"local-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2));
 const now=options.now||(()=>new Date().toISOString());
 const known=new WeakSet();
 function checkedWorkspace(w){if(known.has(w))return w;const valid=api.validateWorkspace(w);known.add(valid);return valid;}
 function blankDraft(input){return {name:"",parentEditionId:null,rawInput:JSON.stringify(input,null,2),actor:"",note:"",mapping:{sourceId:"",format:"csv",arrayPointer:"",target:"bom",raw:"{}",mode:"replace"},selectedEditionId:"",leftEditionId:"",rightEditionId:"",review:{discipline:"EE",decision:"needs-work",reviewer:"",note:""},view:"input",rowEdit:null,inputGroup:"points",sourcePage:0,pages:{},reportSection:"summary",selectedProposalId:"",proposal:{name:"",preparedBy:"",reason:""},comparisonSection:"changes",cohortSide:"left",cohortId:""};}
 function create({title,createdAt,input}){return {schema,workspace:api.createWorkspace({title,createdAt}),draft:blankDraft(input),backups:[],createdAt,updatedAt:createdAt};}
 function validate(s){
  need(s&&s.schema===schema&&s.workspace&&s.draft&&Array.isArray(s.backups),"This is not a complete hardware-review operator session.");
  const d=s.draft;need(typeof d.selectedProposalId==="string"&&d.proposal&&["name","preparedBy","reason"].every(k=>typeof d.proposal[k]==="string"),"Proposal draft is incomplete.");for(const k of ["name","rawInput","actor","note","selectedEditionId","leftEditionId","rightEditionId","view"])need(typeof d[k]==="string","Missing retained draft field "+k);
  need(d.mapping&&["sourceId","format","arrayPointer","target","raw","mode"].every(k=>typeof d.mapping[k]==="string"),"Mapping draft is incomplete.");
  need(d.review&&["discipline","decision","reviewer","note"].every(k=>typeof d.review[k]==="string"),"Review draft is incomplete.");
  s.workspace=checkedWorkspace(s.workspace);
  for(const b of s.backups){need(b&&typeof b.id==="string"&&typeof b.reason==="string"&&typeof b.at==="string"&&typeof b.sha256==="string"&&b.snapshot,"Retained backup is incomplete.");need(hash(JSON.stringify(b.snapshot))===b.sha256,"Retained backup identity changed.");need(!b.snapshot.backups,"Backups must contain direct complete snapshots, not recursive histories.");b.snapshot.workspace=checkedWorkspace(b.snapshot.workspace);}
  const bytes=encode(JSON.stringify(s)).length;need(bytes<=limit,"Complete operator session exceeds "+limit+" bytes. Export the current session and begin a separate workspace.");
  return s;
 }
 function payload(s){validate(s);return clone(s);}
 function pack(s){const p=payload(s),text=JSON.stringify(p);return {schema:"commons.hardware-review-operator-carrier.v1",bytes:encode(text).length,sha256:hash(text),session:p};}
 function receive(content){
  need(typeof content==="string"&&encode(content).length<=limit+1024*1024,"Complete received session exceeds the supported size.");
  const e=api.parseJSON(content);need(e&&e.schema==="commons.hardware-review-operator-carrier.v1","Open the complete operator JSON, or use domain-workspace import for a domain export.");
  const text=JSON.stringify(e.session);need(e.bytes===encode(text).length&&e.sha256===hash(text),"Received session identity does not match its original content.");return validate(clone(e.session));
 }
 function backup(s,reason){const snapshot=clone(s);delete snapshot.backups;return {id:id(),reason,at:now(),sha256:hash(JSON.stringify(snapshot)),snapshot};}
 function replace(current,incoming,reason){validate(current);validate(incoming);const n=clone(incoming),all=[...current.backups,...incoming.backups,backup(current,reason)];n.backups=[];const seen=new Map();for(const b of all){if(seen.has(b.id)){need(seen.get(b.id)===JSON.stringify(b),"Backup identifier has conflicting original content.");continue;}seen.set(b.id,JSON.stringify(b));n.backups.push(b);}n.updatedAt=now();return validate(n);}
 function restoreBackup(current,backupId){const b=current.backups.find(x=>x.id===backupId);need(b,"Selected prior session is absent.");return replace(current,{...clone(b.snapshot),backups:[]},"Before restoring "+backupId);}
 function draftFingerprint(s){return hash(JSON.stringify({workspaceRoot:s.workspace.rootSha256,rawInput:s.draft.rawInput,name:s.draft.name,parentEditionId:s.draft.parentEditionId,actor:s.draft.actor,note:s.draft.note}));}
 function preview(s){validate(s);need(s.draft.name.trim(),"Name this hardware-review edition.");const input=api.parseJSON(s.draft.rawInput);return {binding:draftFingerprint(s),input,report:api.analyse(input,s.workspace),name:s.draft.name};}
 function meta(s,operationId){return {operationId:operationId||id(),expectedRoot:s.workspace.rootSha256,at:now()};}
 function save(s,p){need(p&&p.binding===draftFingerprint(s),"The current input or workspace changed. Preview the complete edition again.");const n={...clone(s),workspace:s.workspace},r=api.saveEdition(n.workspace,{name:n.draft.name,input:api.parseJSON(n.draft.rawInput),parentEditionId:n.draft.parentEditionId,preparedBy:n.draft.actor,note:n.draft.note},meta(n));n.workspace=r.workspace;n.draft.selectedEditionId=r.editionId;n.draft.parentEditionId=r.editionId;n.updatedAt=now();return {session:validate(n),editionId:r.editionId,report:r.report};}
 return {schema,limit,create,validate,pack,receive,replace,restoreBackup,backup,blankDraft,draftFingerprint,preview,save,meta,checkedWorkspace};
}
