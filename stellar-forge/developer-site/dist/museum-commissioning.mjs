// MIT. Pure commissioning evidence in the original Collection Review revision store.
// No network, filesystem, timer, permission inference or contractual signature.
export const COMMISSIONING_SCHEMA = 'stellar-forge.museum-commissioning.v1';
export const COMMISSIONING_ACTIONS = Object.freeze([
  'protocol.add','gate.record','observation.record','incident.record',
  'incident.resolve','handover.record','copy.record','restore.record','acceptance.record'
]);
const GROUPS = Object.freeze(['protocols','gates','observations','incidents','incidentResolutions','handovers','copyReceipts','restoreReceipts','acceptances']);
const TYPES = Object.freeze({'protocol.add':'protocols','gate.record':'gates','observation.record':'observations','incident.record':'incidents','incident.resolve':'incidentResolutions','handover.record':'handovers','copy.record':'copyReceipts','restore.record':'restoreReceipts','acceptance.record':'acceptances'});
const STAGES = Object.freeze(['concept','detail','alpha','beta','final']);
const ROLES = Object.freeze(['source-code','cms-access-instructions','encoded-media','uncompressed-media','working-originals','transcripts-captions','operation-manual','rights-register']);
const MAX_ROWS = 10000;
const own = (v,k) => Object.prototype.hasOwnProperty.call(v,k);
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
function fail(message) { throw Object.assign(new Error(message), {code:'MUSEUM_COMMISSIONING'}); }
function text(v,label,max=20000,blank=false) { if(typeof v!=='string'||v.length>max||/\u0000/.test(v)||(!blank&&!v.trim()))fail(label+' must be retained nonempty ordinary text.'); return v; }
function fields(v,required,optional=[]) { if(!plain(v))fail('Keep a complete commissioning record.'); for(const k of required)if(!own(v,k))fail('Missing commissioning field: '+k); for(const k of Object.keys(v))if(!required.includes(k)&&!optional.includes(k))fail('Unexpected commissioning field: '+k); }
function list(v,label,max=MAX_ROWS) { if(!Array.isArray(v)||v.length>max)fail(label+' must be a complete bounded array.'); return v; }
function choose(v,options,label) { if(!options.includes(v))fail('Choose an explicit '+label+'.');return v; }
function integer(v,label,min=0,max=Number.MAX_SAFE_INTEGER) { if(!Number.isSafeInteger(v)||v<min||v>max)fail(label+' must be a bounded exact integer.');return v; }
function uuid(v,label='Record ID') { if(typeof v!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v))fail(label+' must be its original lowercase UUID.');return v; }
function digest(v,label='SHA-256') { if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))fail(label+' must be the complete lowercase SHA-256.');return v; }
function time(v,label='Recorded time') { if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))fail(label+' needs an explicit timestamp and time zone.');return Date.parse(v); }
function revision(v,label='Source revision') { if(typeof v!=='string'||!/^revision-[a-f0-9]{64}$/.test(v))fail(label+' must identify the retained original revision.');return v; }
function finiteJSON(v,seen=new Set()) { if(v===null||typeof v==='string'||typeof v==='boolean')return;if(typeof v==='number'&&Number.isFinite(v))return;if(!Array.isArray(v)&&!plain(v))fail('Keep ordinary finite JSON values.');if(seen.has(v))fail('Commissioning JSON cannot be cyclic.');seen.add(v);if(Array.isArray(v)){for(let i=0;i<v.length;i++){if(!own(v,i))fail('Commissioning arrays cannot have holes.');finiteJSON(v[i],seen);}}else for(const k of Object.keys(v))finiteJSON(v[k],seen);seen.delete(v); }
const clone = v => { finiteJSON(v); return JSON.parse(JSON.stringify(v)); };
function canonical(v) { if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'; }
const same = (a,b) => canonical(a)===canonical(b);
function distinct(values,label) { if(new Set(values).size!==values.length)fail(label+' contains duplicate identities.'); }
function exists(rows,id,label) { const row=rows.find(x=>x.id===id);if(!row)fail(label+' is not present in this retained museum state.');return row; }
function atLeast(v,earlier,label) { if(time(v)<time(earlier))fail(label+' precedes its retained source.'); }
function evidence(v) {
  fields(v,['note','references']);text(v.note,'Evidence note');
  for(const r of list(v.references,'Evidence references',100)) {
    fields(r,['label'],['url','sha256','bytes']);text(r.label,'Evidence label',500);
    if(!own(r,'url')&&!own(r,'sha256'))fail('An evidence reference needs its original URL or content hash.');
    if(own(r,'url')){text(r.url,'Evidence URL',12000);let u;try{u=new URL(r.url);}catch{fail('Evidence URL is invalid.');}if(!['https:','http:'].includes(u.protocol)||u.username||u.password)fail('Use a credential-free HTTP(S) evidence URL.');}
    if(own(r,'sha256'))digest(r.sha256);
    if(own(r,'bytes')){if(!own(r,'sha256'))fail('A byte count needs the matching content hash.');integer(r.bytes,'Evidence bytes');}
  }
}
function authority(v) { fields(v,['name','role','basis']);for(const k of ['name','role','basis'])text(v[k],'Recorded authority '+k,k==='basis'?20000:500); }
function base(row) { uuid(row.id);text(row.actor,'Recorded operator',200);time(row.createdAt); }
function inventory(v,label='Handover inventory') {
  const keys=[];for(const x of list(v,label)){fields(x,['key','role','sha256','bytes']);text(x.key,'Inventory key',1000);choose(x.role,ROLES,'handover role');digest(x.sha256);integer(x.bytes,'Inventory bytes');keys.push(x.key);}
  distinct(keys,label);if(!v.length)fail('Retain the complete nonempty handover inventory.');
}
function checkedInventory(v,handover,complete) {
  const expected=new Map(handover.inventory.map(x=>[x.key,x])),seen=[];
  for(const x of list(v,'Observed inventory')){fields(x,['key','sha256','bytes']);text(x.key,'Observed inventory key',1000);digest(x.sha256);integer(x.bytes,'Observed inventory bytes');const original=expected.get(x.key);if(!original||original.sha256!==x.sha256||original.bytes!==x.bytes)fail('Observed inventory differs from the frozen handover.');seen.push(x.key);}
  distinct(seen,'Observed inventory');if(complete&&seen.length!==expected.size)fail('A verified receipt must check every original handover member.');
}
function getProtocol(c,id) { return exists(c.protocols,id,'Commissioning protocol'); }
function releaseFor(m,p) { const r=exists(m.releases,p.releaseId,'Visitor release');time(r.createdAt,'Release time');return r; }
function context(row,c,m) { const p=getProtocol(c,row.protocolId);atLeast(row.createdAt,p.createdAt,'Commissioning record');releaseFor(m,p);return p; }
function endpoint(m,p,id) { if(!p.endpointIds.includes(id))fail('Endpoint is outside the reviewed commissioning protocol.');return exists(m.endpoints,id,'Endpoint'); }
function deployment(m,p,row) {
  const e=endpoint(m,p,row.endpointId),d=exists(m.deployments,row.deploymentId,'Deployment');
  if(d.endpointId!==e.id||d.releaseId!==p.releaseId)fail('Observation must name this exact endpoint and release deployment.');
  return d;
}
function validateRow(group,row,c,m) {
  base(row);
  if(group==='protocols'){
    fields(row,['id','actor','createdAt','releaseId','mode','title','endpointIds','windowStart','targetHours','runPolicy','requiredGates','handoverRoles','requiredCopies','restoreRequired','authority','evidence']);
    const r=releaseFor(m,row);atLeast(row.createdAt,r.createdAt,'Protocol');choose(row.mode,['actual','authored-reference'],'evidence mode');text(row.title,'Protocol title',500);time(row.windowStart,'Observation window start');atLeast(row.windowStart,r.createdAt,'Observation window');
    choose(row.runPolicy,['continuous-since-last-blocking-fault'],'reviewed run policy');integer(row.targetHours,'Reviewed continuous-run target hours',1,87600);integer(row.requiredCopies,'Required independent handover copies',1,20);
    if(typeof row.restoreRequired!=='boolean')fail('State whether an independent restore is required.');
    if(!list(row.endpointIds,'Protocol endpoints',1000).length)fail('Select at least one actual endpoint profile.');distinct(row.endpointIds,'Protocol endpoints');
    for(const id of row.endpointIds){exists(m.endpoints,id,'Endpoint');if(!list(r.endpointIds,'Release endpoints',1000).includes(id))fail('Protocol endpoints must belong to this exact release.');}
    distinct(list(row.requiredGates,'Required review gates',STAGES.length),'Review gates');for(const g of row.requiredGates)choose(g,STAGES,'review stage');
    distinct(list(row.handoverRoles,'Required handover roles',ROLES.length),'Handover roles');for(const role of row.handoverRoles)choose(role,ROLES,'handover role');
    authority(row.authority);evidence(row.evidence);
    return;
  }
  if(group==='gates'){
    fields(row,['id','actor','createdAt','protocolId','stage','decision','authority','evidence']);const p=context(row,c,m);choose(row.stage,STAGES,'review stage');if(!p.requiredGates.includes(row.stage))fail('Gate is not in the reviewed protocol.');choose(row.decision,['approved','changes-required','rejected'],'review decision');authority(row.authority);evidence(row.evidence);return;
  }
  if(group==='observations'){
    fields(row,['id','actor','createdAt','protocolId','endpointId','deploymentId','acknowledgmentId','start','end','observedAt','result','evidence']);
    const p=context(row,c,m),d=deployment(m,p,row),a=exists(m.acknowledgments,row.acknowledgmentId,'Applied deployment acknowledgment');
    if(a.deploymentId!==d.id||a.kind!=='applied'||a.controlSha256!==d.controlSha256||a.manifestSha256!==d.manifestSha256)fail('Observation needs the matching actual applied-deployment acknowledgment.');
    const start=time(row.start),end=time(row.end);if(end<=start)fail('An observation interval must have positive duration.');
    if(start<time(p.windowStart)||start<time(d.createdAt)||start<time(a.observedAt))fail('Observation begins before the reviewed window or retained deployment application.');
    if(end>time(d.expiresAt))fail('An observation interval extends past its exact deployment expiry.');
    if(end>time(row.observedAt)||time(row.observedAt)>time(row.createdAt))fail('Observation must finish before it is observed and recorded.');
    choose(row.result,['pass','fail','unknown'],'observation result');evidence(row.evidence);return;
  }
  if(group==='incidents'){
    fields(row,['id','actor','createdAt','protocolId','endpointId','openedAt','severity','summary','evidence']);const p=context(row,c,m);endpoint(m,p,row.endpointId);if(time(row.openedAt)>time(row.createdAt)||time(row.openedAt)<time(p.windowStart))fail('Incident time must be within the retained protocol history.');choose(row.severity,['blocking','nonblocking'],'incident severity');text(row.summary,'Incident summary');evidence(row.evidence);return;
  }
  if(group==='incidentResolutions'){
    fields(row,['id','actor','createdAt','protocolId','incidentId','resolvedAt','outcome','evidence']);const p=context(row,c,m),i=exists(c.incidents,row.incidentId,'Incident');
    if(i.protocolId!==p.id||time(row.resolvedAt)<time(i.openedAt)||time(row.resolvedAt)>time(row.createdAt))fail('Resolution must follow this original incident.');
    atLeast(row.createdAt,i.createdAt,'Incident resolution');choose(row.outcome,['corrected','withdrawn-as-not-a-fault'],'incident resolution');evidence(row.evidence);
    return;
  }
  if(group==='handovers'){
    fields(row,['id','actor','createdAt','protocolId','sourceRevision','archiveSha256','archiveBytes','inventory','exclusions','evidence'],['artifactKind']);choose(row.artifactKind??'archive',['archive','directory-manifest'],'handover artifact kind');const p=context(row,c,m),r=releaseFor(m,p);revision(row.sourceRevision);if(row.sourceRevision!==r.sourceRevision)fail('Handover must bind the exact release source revision.');digest(row.archiveSha256);integer(row.archiveBytes,'Handover archive bytes',1);inventory(row.inventory);
    const excluded=[];for(const x of list(row.exclusions,'Reviewed exclusions',ROLES.length)){fields(x,['role','reason']);choose(x.role,ROLES,'excluded role');text(x.reason,'Exclusion reason');if(!p.handoverRoles.includes(x.role))fail('Only a required handover role can have an exclusion.');if(row.inventory.some(y=>y.role===x.role))fail('A handover role cannot be present and excluded.');excluded.push(x.role);}distinct(excluded,'Reviewed exclusions');
    for(const role of p.handoverRoles)if(!excluded.includes(role)&&!row.inventory.some(x=>x.role===role))fail('Required handover role is missing without a reviewed exclusion: '+role);evidence(row.evidence);return;
  }
  if(group==='copyReceipts'){
    fields(row,['id','actor','createdAt','protocolId','handoverId','custodyId','location','observedAt','status','archiveSha256','archiveBytes','verifiedItems','evidence']);const p=context(row,c,m),h=exists(c.handovers,row.handoverId,'Handover');
    if(h.protocolId!==p.id)fail('Copy receipt names another protocol.');atLeast(row.createdAt,h.createdAt,'Copy receipt');text(row.custodyId,'Independent copy custody identity',500);text(row.location,'Private copy location',2000);atLeast(row.observedAt,h.createdAt,'Copy observation');if(time(row.observedAt)>time(row.createdAt))fail('Copy observation cannot be recorded before it happens.');choose(row.status,['delivered','verified','failed'],'copy state');digest(row.archiveSha256);integer(row.archiveBytes,'Observed archive bytes',1);if(row.archiveSha256!==h.archiveSha256||row.archiveBytes!==h.archiveBytes)fail('A copy receipt must bind this exact original archive.');checkedInventory(row.verifiedItems,h,row.status==='verified');evidence(row.evidence);return;
  }
  if(group==='restoreReceipts'){
    fields(row,['id','actor','createdAt','protocolId','copyReceiptId','targetLabel','observedAt','result','workspaceId','reopenedSourceRevision','verifiedItems','evidence']);const p=context(row,c,m),copy=exists(c.copyReceipts,row.copyReceiptId,'Copy receipt'),h=exists(c.handovers,copy.handoverId,'Handover');
    if(copy.protocolId!==p.id||copy.status!=='verified')fail('Independent restore must select a fully verified original copy.');atLeast(row.createdAt,copy.createdAt,'Restore receipt');text(row.targetLabel,'Independent receiving destination',2000);atLeast(row.observedAt,copy.observedAt,'Restore observation');if(time(row.observedAt)>time(row.createdAt))fail('Restore observation cannot be recorded before it happens.');choose(row.result,['verified','failed'],'restore result');uuid(row.workspaceId,'Reopened workspace');revision(row.reopenedSourceRevision);if(row.reopenedSourceRevision!==h.sourceRevision)fail('Restore must retain the exact original source revision.');checkedInventory(row.verifiedItems,h,row.result==='verified');evidence(row.evidence);return;
  }
  if(group==='acceptances'){
    fields(row,['id','actor','createdAt','protocolId','handoverId','decision','authority','evidence']);const p=context(row,c,m),h=exists(c.handovers,row.handoverId,'Handover');if(h.protocolId!==p.id)fail('Acceptance names another protocol handover.');atLeast(row.createdAt,h.createdAt,'Acceptance record');choose(row.decision,['accepted','accepted-with-conditions','not-accepted'],'reported acceptance');authority(row.authority);evidence(row.evidence);return;
  }
  fail('Unknown commissioning record type.');
}
export function emptyCommissioningState() { return {schema:COMMISSIONING_SCHEMA,...Object.fromEntries(GROUPS.map(k=>[k,[]]))}; }
export function validateCommissioningState(value,museum) {
  finiteJSON(value);fields(value,['schema',...GROUPS]);if(value.schema!==COMMISSIONING_SCHEMA)fail('Choose the complete original commissioning state.');
  if(!plain(museum))fail('Keep the containing museum state.');
  for(const k of ['releases','endpoints','deployments','acknowledgments'])list(museum[k],'Museum '+k);
  const ids=new Set();
  for(const group of GROUPS){list(value[group],group);for(const row of value[group]){base(row);if(ids.has(row.id))fail('A commissioning record UUID is repeated.');ids.add(row.id);}}
  for(const group of GROUPS)for(const row of value[group])validateRow(group,row,value,museum);
  return value;
}
export function applyCommissioningAction(museum,action) {
  fields(action,['type','record']);choose(action.type,COMMISSIONING_ACTIONS,'commissioning action');
  finiteJSON(museum);finiteJSON(action);const current=museum.commissioning===undefined?emptyCommissioningState():museum.commissioning;
  validateCommissioningState(current,museum);const group=TYPES[action.type];base(action.record);
  for(const name of GROUPS){const old=current[name].find(x=>x.id===action.record.id);if(old){if(name!==group||!same(old,action.record))fail('This original record UUID already owns another immutable input.');return clone(museum);}}
  const next=clone(museum);next.commissioning=clone(current);next.commissioning[group].push(clone(action.record));validateCommissioningState(next.commissioning,next);return next;
}
export function assertCommissioningExtension(previous,next) {
  if(previous===undefined)return true;
  finiteJSON(previous);if(next!==undefined)finiteJSON(next);
  if(next===undefined)fail('A later revision cannot discard retained commissioning records.');
  for(const group of GROUPS){list(previous[group],group);list(next[group],group);const map=new Map(next[group].map(x=>[x.id,x]));for(const row of previous[group])if(!map.has(row.id)||!same(row,map.get(row.id)))fail('A later revision cannot remove or rewrite commissioning evidence.');}
  return true;
}
const latest = rows => rows.reduce((a,b)=>!a||time(b.createdAt)>time(a.createdAt)||(time(b.createdAt)===time(a.createdAt)&&b.id>a.id)?b:a,null);
function mergeIntervals(intervals) {
  const out=[];for(const pair of intervals.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1])){const last=out[out.length-1];if(last&&pair[0]<=last[1])last[1]=Math.max(last[1],pair[1]);else out.push(pair.slice());}return out;
}
function subtractIntervals(good,bad) {
  let result=mergeIntervals(good);for(const [start,end] of mergeIntervals(bad)){const next=[];for(const [a,b] of result){if(end<=a||start>=b)next.push([a,b]);else{if(a<start)next.push([a,start]);if(end<b)next.push([end,b]);}}result=next;}return result;
}
const iso = n => new Date(n).toISOString();
function protocolReport(m,p,asOf) {
  const c=m.commissioning,cut=time(asOf),visible=rows=>rows.filter(x=>x.protocolId===p.id&&time(x.createdAt)<=cut);
  const observations=visible(c.observations).filter(x=>time(x.observedAt)<=cut),incidents=visible(c.incidents),resolutions=visible(c.incidentResolutions),gates=visible(c.gates),handovers=visible(c.handovers),copies=visible(c.copyReceipts).filter(x=>time(x.observedAt)<=cut),restores=visible(c.restoreReceipts).filter(x=>time(x.observedAt)<=cut);
  const resolved=new Map(),resolutionConflicts=[];for(const i of incidents){const rr=resolutions.filter(x=>x.incidentId===i.id);if(rr.length===1)resolved.set(i.id,rr[0]);else if(rr.length>1)resolutionConflicts.push({incidentId:i.id,recordIds:rr.map(x=>x.id)});}const endpointReports=[];
  for(const endpointId of p.endpointIds){
    const rows=observations.filter(x=>x.endpointId===endpointId),faults=incidents.filter(x=>x.endpointId===endpointId&&x.severity==='blocking');
    // Fail/unknown coverage never becomes passing through overlap. A corrected fault starts a new run.
    const bad=rows.filter(x=>x.result!=='pass').map(x=>[time(x.start),time(x.end)]);
    for(const i of faults){const r=resolved.get(i.id);if(!r||r.outcome==='corrected')bad.push([time(i.openedAt),r?time(r.resolvedAt):cut]);}
    const terminalAcknowledgments=m.acknowledgments.filter(a=>a.kind!=='applied'&&time(a.observedAt)<=cut);
    const passIntervals=rows.filter(x=>x.result==='pass').map(x=>{const stops=terminalAcknowledgments.filter(a=>a.deploymentId===x.deploymentId).map(a=>time(a.observedAt));return [time(x.start),Math.min(time(x.end),...stops)];}).filter(([a,b])=>b>a);
    const segments=subtractIntervals(passIntervals,bad);
    // Split touching passing coverage at a fault time, including a zero-duration corrected fault.
    const breaks=faults.filter(i=>resolved.get(i.id)?.outcome!=='withdrawn-as-not-a-fault').map(i=>time(i.openedAt));
    let split=segments;for(const point of breaks){const n=[];for(const [a,b] of split){if(a<point&&point<b)n.push([a,point],[point,b]);else n.push([a,b]);}split=n;}
    const resetAt=Math.max(time(p.windowStart),...rows.filter(x=>x.result!=='pass').map(x=>time(x.end)),...terminalAcknowledgments.filter(a=>m.deployments.some(d=>d.id===a.deploymentId&&d.endpointId===endpointId&&d.releaseId===p.releaseId)).map(a=>time(a.observedAt)),...faults.filter(i=>resolved.get(i.id)?.outcome!=='withdrawn-as-not-a-fault').map(i=>resolved.has(i.id)?time(resolved.get(i.id).resolvedAt):cut));
    const currentSegments=split.map(([a,b])=>[Math.max(a,resetAt),b]).filter(([a,b])=>b>a);
    const longest=currentSegments.reduce((best,x)=>x[1]-x[0]>(best?best[1]-best[0]:-1)?x:best,null);
    const open=faults.filter(i=>!resolved.has(i.id));
    endpointReports.push({endpointId,observationCount:rows.length,runResetAt:iso(resetAt),passingIntervals:currentSegments.map(([start,end])=>({start:iso(start),end:iso(end),hours:(end-start)/3600000})),longestHours:longest?(longest[1]-longest[0])/3600000:0,longestInterval:longest?{start:iso(longest[0]),end:iso(longest[1])}:null,openBlockingIncidentIds:open.map(x=>x.id),targetDemonstrated:Boolean(longest&&longest[1]-longest[0]>=p.targetHours*3600000&&!open.length)});
  }
  const gateRows=p.requiredGates.map(stage=>{const gg=gates.filter(x=>x.stage===stage),g=latest(gg);return {stage,recordId:g?.id||null,recordIds:gg.map(x=>x.id),decision:gg.some(x=>x.decision!=='approved')?'revision-required':g?'approved':'unrecorded'};});
  const h=latest(handovers),selectedCopies=h?copies.filter(x=>x.handoverId===h.id):[];
  // Latest recorded state for each physical custody identity controls whether that copy remains verified.
  const custody=new Map();for(const row of selectedCopies){const old=custody.get(row.custodyId);if(!old||time(row.createdAt)>time(old.createdAt)||(time(row.createdAt)===time(old.createdAt)&&(row.status!=='verified'&&old.status==='verified'||row.status===old.status&&row.id>old.id)))custody.set(row.custodyId,row);}
  const verified=[...custody.values()].filter(x=>x.status==='verified'),verifiedIds=new Set(verified.map(x=>x.id));
  const restored=restores.filter(x=>verifiedIds.has(x.copyReceiptId)),restoreLatest=new Map();for(const r of restored){const old=restoreLatest.get(r.targetLabel);if(!old||time(r.createdAt)>time(old.createdAt)||(time(r.createdAt)===time(old.createdAt)&&(r.result==='failed'&&old.result!=='failed'||r.result===old.result&&r.id>old.id)))restoreLatest.set(r.targetLabel,r);}
  const restoreOK=[...restoreLatest.values()].some(x=>x.result==='verified');
  const technicalFindings=[];if(resolutionConflicts.length)technicalFindings.push('Conflicting incident resolution records require explicit review in a successor protocol/release; no timestamp wins silently.');
  if(gateRows.some(x=>x.decision!=='approved'))technicalFindings.push('Required review gates are not all recorded approved.');
  if(endpointReports.some(x=>!x.targetDemonstrated))technicalFindings.push('The complete endpoint population lacks the reviewed continuous passing observation coverage or has an open blocking incident.');
  if(!h)technicalFindings.push('No complete handover is recorded.');
  if(verified.length<p.requiredCopies)technicalFindings.push('The required number of distinct verified handover copy custodians is not recorded.');
  if(p.restoreRequired&&!restoreOK)technicalFindings.push('No successful independent restore of a currently verified selected copy is recorded.');
  const a=latest(visible(c.acceptances).filter(x=>!h||x.handoverId===h.id));
  return {protocolId:p.id,releaseId:p.releaseId,mode:p.mode,title:p.title,asOf,targetHours:p.targetHours,runPolicy:p.runPolicy,requiredCopies:p.requiredCopies,endpoints:endpointReports,gates:gateRows,resolutionConflicts,handoverId:h?.id||null,handoverArtifactKind:h?(h.artifactKind??'archive'):null,verifiedCopyIds:verified.map(x=>x.id),successfulRestoreIds:[...restoreLatest.values()].filter(x=>x.result==='verified').map(x=>x.id),technicalFindings,technicalEvidenceComplete:technicalFindings.length===0,acceptance:a?{recordId:a.id,decision:a.decision,authority:clone(a.authority),evidence:clone(a.evidence)}:null,contractualAcceptanceInferred:false,limitations:['Observation intervals are retained operator evidence; software does not independently witness hardware operation.','Elapsed calendar age, an export and a deployment acknowledgment do not establish continuous fault-free operation.','A recorded contractual decision is retained separately and is not generated by technical readiness.',...(p.mode==='authored-reference'?['This entire protocol is an authored reference course, not evidence of an institutional deployment or contractual run.']:[])]};
}
export function commissioningReport(museum,{releaseId,asOf}={}) {
  time(asOf,'Report cutoff');const c=museum.commissioning===undefined?emptyCommissioningState():museum.commissioning;validateCommissioningState(c,museum);
  if(releaseId!==undefined)exists(museum.releases,releaseId,'Selected release');
  const m={...museum,commissioning:c};
  return {schema:'stellar-forge.museum-commissioning-report.v1',asOf,protocols:c.protocols.filter(p=>(releaseId===undefined||p.releaseId===releaseId)&&time(p.createdAt)<=time(asOf)).map(p=>protocolReport(m,p,asOf))};
}
