// MIT. Museum delivery extends the original Collection Review revision and receiving model.
import { sha256 } from './source-table-workspace.mjs';
import { emptyCommissioningState, validateCommissioningState, applyCommissioningAction } from './museum-commissioning.mjs';
export const MUSEUM_SCHEMA='stellar-forge.museum-delivery.v1';
export const MUSEUM_ROWS=Object.freeze(['assets','endpoints','releases','approvals','withdrawals','deployments','acknowledgments']);
export const MEDIA_ROLES=Object.freeze(['original','working','uncompressed','encoded','transcript','captions','source']);
const clone=v=>JSON.parse(JSON.stringify(v)),plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function museumCanonical(v){
 if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
 if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(museumCanonical).join(',')+']';
 if(plain(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+museumCanonical(v[k])).join(',')+'}';
 fail('Use complete finite JSON values.');
}
const same=(a,b)=>museumCanonical(a)===museumCanonical(b);
function fail(message){throw Object.assign(Error(message),{code:'MUSEUM_DELIVERY'});}
function text(v,label,max=20000,required=false){if(typeof v!=='string'||v.length>max||/[\u0000]/.test(v)||required&&!v.trim())fail(label+' needs complete ordinary text.');return v;}
function time(v,label='Recorded time'){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))fail(label+' needs an explicit ISO timestamp.');return v;}
function rows(v,label,max=20000){if(!Array.isArray(v)||v.length>max)fail(label+' exceeds the retained record limit.');return v;}
function unique(v,label,max=20000){rows(v,label,max);if(new Set(v).size!==v.length)fail(label+' repeats an identity.');return v;}
function standard(r){if(!plain(r)||!uuid(r.id))fail('Keep the original record UUID.');text(r.actor,'Actual operator',200,true);time(r.createdAt);}
function ref(map,id,label){if(!map.has(id))fail(label+' is absent from the complete original record.');return map.get(id);}
function url(v,label){text(v,label,12000,true);let u;try{u=new URL(v);}catch{fail(label+' needs an absolute HTTP(S) URL.');}if(!['https:','http:'].includes(u.protocol)||u.username||u.password)fail(label+' needs an HTTP(S) URL without credentials.');}
export const emptyMuseumState=()=>({schema:MUSEUM_SCHEMA,...Object.fromEntries(MUSEUM_ROWS.map(k=>[k,[]])),commissioning:emptyCommissioningState()});
export function museumReleaseBody(release){const {id,...body}=release;return body;}
function maps(m){return Object.fromEntries(MUSEUM_ROWS.map(k=>[k,new Map(m[k].map(r=>[r.id,r]))]));}
export function validateMuseumState(m){
 if(m===undefined)return;
 if(!plain(m)||m.schema!==MUSEUM_SCHEMA)fail('Use the complete museum delivery state.');
 museumCanonical(m);
 for(const k of MUSEUM_ROWS){rows(m[k],k,k==='releases'?2000:20000);const seen=new Set();for(const r of m[k]){if(!plain(r)||typeof r.id!=='string'||seen.has(r.id))fail(k+' has a missing or repeated identity.');seen.add(r.id);}}
 const M=maps(m);
 for(const a of m.assets){
  if(!hash(a.sha256)||a.id!=='media-'+a.sha256||!Number.isSafeInteger(a.bytes)||a.bytes<0)fail('A media asset needs its full original byte count and SHA-256.');
  text(a.filename,'Original media filename',240,true);text(a.label,'Media label',1000);text(a.mime,'Media MIME type',120,true);
  if(!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(a.mime)||!MEDIA_ROLES.includes(a.role))fail('Choose a declared media type and handover role.');
  if(typeof a.path!=='string'||!new RegExp('^media/'+a.sha256+'\\.[a-z0-9]{1,12}$').test(a.path))fail('Keep the content-addressed relative media path.');
 }
 for(const e of m.endpoints){standard(e);text(e.key,'Physical endpoint key',240,true);text(e.label,'Endpoint label',500,true);text(e.profile,'Actual equipment profile',12000,true);if(!['story','browse'].includes(e.family))fail('Choose the story or browse visitor interface.');}
 for(const r of m.releases){
  if(!/^release-[a-f0-9]{64}$/.test(r.id))fail('Keep the complete content-derived release identity.');
  text(r.actor,'Release editor',200,true);time(r.createdAt);time(r.expiresAt,'Offline display expiry');if(Date.parse(r.expiresAt)<=Date.parse(r.createdAt))fail('The release needs a future explicit offline display expiry.');
  if(!/^revision-[a-f0-9]{64}$/.test(r.sourceRevision))fail('Keep the exact selected saved editorial revision.');
  text(r.title,'Visitor title',4000,true);text(r.introduction,'Visitor introduction');
  unique(r.endpointIds,'Selected endpoints',1000);if(!r.endpointIds.length)fail('Select at least one exact endpoint profile.');for(const id of r.endpointIds)ref(M.endpoints,id,'Endpoint');
  rows(r.items,'Visitor items',20000);if(!r.items.length)fail('A release needs at least one selected reviewed item.');
  const keys=new Set(),occurrences=new Set();
  for(const i of r.items){
   if(!plain(i))fail('Keep each complete visitor item.');text(i.key,'Stable content key',12000,true);text(i.occurrenceId,'Original occurrence',500,true);
   if(keys.has(i.key)||occurrences.has(i.occurrenceId))fail('Each release needs unique content keys and original occurrences.');keys.add(i.key);occurrences.add(i.occurrenceId);
   for(const k of ['title','summary','alt','credit','transcript','rightsBasis'])text(i[k],k,k==='transcript'?200000:20000,k==='title'||k==='rightsBasis');
   url(i.rightsCitation,'Recorded rights source');unique(i.mediaIds,'Item media',1000);for(const id of i.mediaIds)ref(M.assets,id,'Media');
   if(i.captionsMediaId!==null){const a=ref(M.assets,i.captionsMediaId,'Captions');if(a.role!=='captions'||a.mime!=='text/vtt')fail('Visitor captions need a retained WebVTT captions asset.');}
   for(const id of i.mediaIds){const a=M.assets.get(id);if(a.mime.startsWith('image/')&&!i.alt.trim())fail('Images need alternative text.');
    if(/^(audio|video)\//.test(a.mime)&&!i.transcript.trim())fail('Audio/video need a complete transcript.');
    if(a.mime.startsWith('video/')&&!i.captionsMediaId)fail('Video needs a retained WebVTT captions file.');}
  }
 }
 for(const a of m.approvals){standard(a);ref(M.releases,a.releaseId,'Reviewed release');if(!['concept','detail','alpha','beta','final'].includes(a.stage)||!['approved','revise','rejected'].includes(a.outcome))fail('Record the actual submission stage and decision.');text(a.authority,'Decision authority',500,true);text(a.evidence,'Original decision reference',12000,true);}
 for(const w of m.withdrawals){standard(w);unique(w.keys,'Withdrawn content keys');unique(w.assetIds,'Withdrawn assets');if(!w.keys.length&&!w.assetIds.length)fail('Choose content keys or complete media identities to withdraw.');for(const k of w.keys)text(k,'Content key',12000,true);for(const id of w.assetIds)ref(M.assets,id,'Withdrawn asset');text(w.reason,'Withdrawal reason',12000,true);text(w.evidence,'Withdrawal instruction',12000,true);}
 for(const d of m.deployments){standard(d);const e=ref(M.endpoints,d.endpointId,'Deployment endpoint'),r=ref(M.releases,d.releaseId,'Deployment release');if(!r.endpointIds.includes(e.id)||!hash(d.controlSha256)||!hash(d.manifestSha256))fail('Keep the exact approved endpoint, control and manifest identities.');time(d.expiresAt);if(Date.parse(d.expiresAt)>Date.parse(r.expiresAt))fail('Deployment cannot extend its original release expiry.');}
 for(const a of m.acknowledgments){
  if(!plain(a)||!uuid(a.id))fail('Keep the original endpoint acknowledgment UUID.');
  const d=ref(M.deployments,a.deploymentId,'Acknowledged deployment');
  if(!['applied','removed','failed'].includes(a.kind))fail('Record applied, removed or failed from the endpoint.');
  time(a.observedAt);text(a.operator,'Actual endpoint operator',200,true);text(a.note,'Endpoint observation',20000,true);
  if(a.controlSha256!==d.controlSha256||a.manifestSha256!==d.manifestSha256)fail('An acknowledgment must identify the original prepared deployment exactly.');
 }
 validateCommissioningState(m.commissioning,m);
 return m;
}
function unionRows(target,source){
 const by=new Map(target.map(r=>[r.id,r]));
 for(const r of source){if(by.has(r.id)){if(!same(by.get(r.id),r))fail('An immutable museum record changed across received histories.');}else{const c=clone(r);target.push(c);by.set(c.id,c);}}
}
export function collectMuseumState(workspace,state=null){
 const result=emptyMuseumState();
 for(const stateRow of [...(workspace.revisions||[]).map(r=>r.state),...(state?[state]:[])]){
  const m=stateRow?.museum;if(!m)continue;validateMuseumState(m);
  for(const key of MUSEUM_ROWS)unionRows(result[key],m[key]);
  for(const key of Object.keys(result.commissioning)){if(Array.isArray(result.commissioning[key]))unionRows(result.commissioning[key],m.commissioning[key]||[]);else if(result.commissioning[key]!==m.commissioning[key])fail('Commissioning schema changed across histories.');}
 }
 validateMuseumState(result);return result;
}
export function assertMuseumContinuity(before,after){
 if(!before)return;if(!after)fail('Keep the original museum delivery and withdrawal history.');
 validateMuseumState(after);
 for(const key of MUSEUM_ROWS){const by=new Map(after[key].map(r=>[r.id,r]));for(const r of before[key])if(!by.has(r.id)||!same(by.get(r.id),r))fail('Keep the complete immutable '+key+' history.');}
 for(const key of Object.keys(before.commissioning)){if(!Array.isArray(before.commissioning[key]))continue;const by=new Map((after.commissioning[key]||[]).map(r=>[r.id,r]));for(const r of before.commissioning[key])if(!by.has(r.id)||!same(by.get(r.id),r))fail('Keep complete original commissioning records.');}
}

export function museumContentKeys(workspace,state=null){
 // Only the original explicit source-edition correspondence links occurrences.
 // Equal URLs, filenames or titles never create an identity link.
 const parent=new Map(),find=id=>{if(!parent.has(id))parent.set(id,id);let root=id;while(parent.get(root)!==root)root=parent.get(root);let at=id;while(parent.get(at)!==at){const next=parent.get(at);parent.set(at,root);at=next;}return root;};
 const join=(a,b)=>{const x=find(a),y=find(b);if(x!==y)parent.set(y,x);};
 for(const revision of workspace.revisions||[])for(const d of revision.request?.sourceEdition?.decisions||[])if(d.action==='map')join(d.fromId,d.toId);
 const bindings=new Map(),items=[...(workspace.revisions||[]).flatMap(r=>r.state.museum?.releases||[]),...(state?.museum?.releases||[])].flatMap(r=>r.items);
 for(const item of items){const root=find(item.occurrenceId),old=bindings.get(root);if(old&&old!==item.key)fail('An already released occurrence or explicit source-edition correspondence must retain its original content key.');bindings.set(root,item.key);}
 const result=new Map();for(const id of parent.keys()){const key=bindings.get(find(id));if(key)result.set(id,key);}return result;
}
export async function validateMuseumWorkspace(workspace){
 const revs=new Map(workspace.revisions.map(r=>[r.id,r])),verified=new Map(),entries=new Map(workspace.sources.flatMap(s=>s.entries.map(e=>[e.id,e])));
 for(const rev of workspace.revisions){
  const m=rev.state.museum;if(!m){if(revs.get(rev.parentId)?.state.museum)fail('An editorial revision dropped its original museum records.');continue;}
  validateMuseumState(m);assertMuseumContinuity(revs.get(rev.parentId)?.state.museum,m);
  for(const release of m.releases){
   if(verified.has(release.id)){if(!same(verified.get(release.id),release))fail('A retained release changed across revisions.');continue;}verified.set(release.id,release);
   if(release.id!=='release-'+await sha256(museumCanonical(museumReleaseBody(release))))fail('The complete approved release bytes changed.');
   const source=ref(revs,release.sourceRevision,'Original editorial revision'),reviews=new Map(source.state.reviews.map(r=>[r.id,r]));
   for(const item of release.items){const e=ref(entries,item.occurrenceId,'Original source occurrence'),review=ref(reviews,item.occurrenceId,'Saved editorial review');
    if(review.status!=='include'||review.rights.status!=='permission-recorded'||!source.state.story.order.includes(item.occurrenceId))fail('Only the saved explicitly included, ordered and permission-recorded source can enter a release.');
    if(item.title!==(review.suggestedTitle||e.title)||item.summary!==review.summary||item.rightsBasis!==review.rights.basis||item.rightsCitation!==review.rights.citation)fail('Visitor release text and rights basis must match its exact saved editorial revision.');
   }
  }
 }
 collectMuseumState(workspace);museumContentKeys(workspace);return workspace;
}
export function museumControl(workspace,state=null){
 const m=collectMuseumState(workspace,state);
 return {schema:'stellar-forge.museum-control.v1',workspaceId:workspace.id,withdrawals:m.withdrawals.map(w=>({id:w.id,keys:clone(w.keys),assetIds:clone(w.assetIds),createdAt:w.createdAt})).sort((a,b)=>a.id.localeCompare(b.id))};
}
export function museumRestrictions(control){
 const keys=new Set(),assets=new Set();for(const w of control.withdrawals){for(const k of w.keys)keys.add(k);for(const id of w.assetIds)assets.add(id);}return {keys,assets};
}
export function museumVisibleItems(release,control){
 const r=museumRestrictions(control);return release.items.filter(i=>!r.keys.has(i.key)&&!i.mediaIds.some(id=>r.assets.has(id))&&(!i.captionsMediaId||!r.assets.has(i.captionsMediaId)));
}
export function museumReleaseStatus(museum,releaseId){
 const decisions=museum.approvals.filter(a=>a.releaseId===releaseId&&a.stage==='final');
 // Contradictory received decisions need an explicit new release; timestamps cannot silently overrule a refusal.
 return !decisions.length?'awaiting-final-decision':decisions.some(a=>a.outcome!=='approved')?'revision-required':'approved';
}
export async function applyMuseumAction(workspace,state,action){
 if(!plain(action)||typeof action.type!=='string')fail('Choose a museum action.');
 const result=clone(state),m=collectMuseumState(workspace,state);result.museum=m;
 if(action.type==='commissioning'){result.museum=applyCommissioningAction(m,action.record);validateMuseumState(result.museum);return result;}
 const names={asset:'assets',endpoint:'endpoints',approval:'approvals',withdrawal:'withdrawals',acknowledgment:'acknowledgments',deployment:'deployments'};
 let row;
 if(action.type==='release'){
  const input=clone(action.record),revision=workspace.revisions.find(r=>r.id===input.sourceRevision);
  if(!revision)fail('Save the editorial review before preparing a visitor release.');
  const entries=new Map(workspace.sources.flatMap(s=>s.entries.map(e=>[e.id,e]))),reviews=new Map(revision.state.reviews.map(r=>[r.id,r]));
  const knownKeys=museumContentKeys(workspace,result);
  const items=input.items.map(i=>{const e=ref(entries,i.occurrenceId,'Selected occurrence'),r=ref(reviews,i.occurrenceId,'Saved review');
   const knownKey=knownKeys.get(e.id);if(knownKey&&i.key&&i.key!==knownKey)fail('Keep the original content key across edits and explicit source-edition correspondence.');
   if(r.status!=='include'||r.rights.status!=='permission-recorded'||!revision.state.story.order.includes(e.id))fail('Save explicit inclusion, story order and recorded permission first.');
   return {key:knownKey||i.key||e.id,occurrenceId:e.id,title:r.suggestedTitle||e.title,summary:r.summary,alt:i.alt||'',credit:i.credit||'',mediaIds:clone(i.mediaIds||[]),transcript:i.transcript||'',captionsMediaId:i.captionsMediaId||null,rightsBasis:r.rights.basis,rightsCitation:r.rights.citation};});
  const body={sourceRevision:revision.id,createdAt:input.createdAt,actor:input.actor,title:input.title||revision.state.story.title,introduction:input.introduction??revision.state.story.introduction,items,endpointIds:clone(input.endpointIds),expiresAt:input.expiresAt};
  row={id:'release-'+await sha256(museumCanonical(body)),...body};unionRows(m.releases,[row]);
 }else{
  const key=names[action.type];if(!key)fail('Unsupported museum action.');row=clone(action.record);unionRows(m[key],[row]);
 }
 validateMuseumState(m);return result;
}
export function museumEndpointStatus(workspace,state=null){
 const m=collectMuseumState(workspace,state),control=museumControl(workspace,state),ids=new Set(control.withdrawals.map(w=>w.id));
 return m.endpoints.map(e=>({endpoint:clone(e),deployments:m.deployments.filter(d=>d.endpointId===e.id).map(d=>({...clone(d),acknowledgments:clone(m.acknowledgments.filter(a=>a.deploymentId===d.id))})),currentWithdrawalCount:ids.size,
  note:'Prepared packages do not establish endpoint application. Compare its actual acknowledgment with the current control digest.'}));
}

export const museumDigest=value=>sha256(museumCanonical(value));
export function validateMuseumControl(control,workspaceId=null){
 if(!plain(control)||Object.keys(control).some(k=>!['schema','workspaceId','withdrawals'].includes(k))||control.schema!=='stellar-forge.museum-control.v1'||!uuid(control.workspaceId)||workspaceId!==null&&control.workspaceId!==workspaceId)fail('Use a complete control for this original workspace.');
 const ids=new Set();for(const w of rows(control.withdrawals,'Current withdrawals',20000)){
  if(!plain(w)||!uuid(w.id)||Object.keys(w).some(k=>!['id','keys','assetIds','createdAt'].includes(k)))fail('A visitor control contains an invalid identity or private fields.');time(w.createdAt);if(ids.has(w.id))fail('A withdrawal identity repeats.');ids.add(w.id);
  unique(w.keys,'Withdrawn content keys');unique(w.assetIds,'Withdrawn media');if(!w.keys.length&&!w.assetIds.length)fail('A withdrawal needs its original targets.');
  for(const k of w.keys)text(k,'Content key',12000,true);for(const id of w.assetIds)if(!/^media-[a-f0-9]{64}$/.test(id))fail('Keep the original withdrawn media identity.');
 }
 museumCanonical(control);return control;
}
export function mergeMuseumControls(existing,incoming){
 validateMuseumControl(existing);validateMuseumControl(incoming,existing.workspaceId);
 const result=clone(existing);unionRows(result.withdrawals,incoming.withdrawals);result.withdrawals.sort((a,b)=>a.id.localeCompare(b.id));return result;
}
