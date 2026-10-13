// MIT. Portable prepaid authoring and complete original-result receiving.
import {utf8,sha256} from './commissioning-hash.mjs';
export const COMMISSION_SCHEMA='stellar-forge.prepaid-api-commissioning.v1';
export const MAX_COMMISSION_BYTES=32*1024*1024;
const REQUEST='stellar-forge.prepaid-api-starter.v1';
const FIELDS=['schema','title','serviceName','publicOrigin','gatewayBaseUrl','payment','checkoutPath','checkoutRouteId','functionPath','allowanceUnits','requestUnits','workerPort','apiPort','timeoutSeconds','actor','python','backupPassEnv'];
const PAY=['scheme','network','asset','payTo','amount','maxTimeoutSeconds'];
const FILES=['application/numeric-series.mjs','application/jobs.json','checkout.json','backup-selection.json','merchant-workspace.json','offer-draft.json','examples/analyze.json'];
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const need=(x,m)=>{if(!x)throw Error(m);};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
export const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':plain(x)?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const equal=(a,b)=>canonical(a)===canonical(b);
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const text=(x,n,max=4096)=>{need(typeof x==='string'&&x.length<=max&&!x.includes('\0'),n+' must be text');return x;};
const meaningful=(x,n,max=4096)=>{text(x,n,max);need(x.trim().length>0,n+' is required');return x;};
const absolute=(x,n)=>{meaningful(x,n);need(x.startsWith('/')&&!x.includes('\\')&&!x.split('/').some(p=>p==='.'||p==='..')&&x!=='/',n+' must be a canonical absolute directory');return x.replace(/\/+$/,'');};
const validJSON=x=>{need(plain(x),'JSON object required');need(utf8(JSON.stringify(x,null,2)+'\n').length<=MAX_COMMISSION_BYTES,'Complete commissioning exceeds 32 MiB');};
export function validateRequestDraft(r){
 need(plain(r)&&r.schema===REQUEST&&Object.keys(r).every(k=>FIELDS.includes(k)),'Use the original prepaid request fields');
 need(plain(r.payment)&&Object.keys(r.payment).every(k=>PAY.includes(k)),'Use original payment fields');
 for(const key of ['title','serviceName','publicOrigin','gatewayBaseUrl','checkoutPath','checkoutRouteId','functionPath','actor','python','backupPassEnv'])
  need(r[key]===undefined||r[key]===null||typeof r[key]==='string'&&r[key].length<=4096,'Invalid '+key);
 for(const key of ['allowanceUnits','requestUnits','workerPort','apiPort','timeoutSeconds'])
  need(r[key]===undefined||r[key]===null||Number.isSafeInteger(r[key]),'Invalid '+key);
 for(const key of PAY)need(r.payment[key]===undefined||r.payment[key]===null||typeof r.payment[key]==='string'||key==='maxTimeoutSeconds'&&Number.isSafeInteger(r.payment[key]),'Invalid payment '+key);
 need(utf8(JSON.stringify(r)).length<=65536,'Original request exceeds 64 KiB');
 return clone(r);
}
export function requestIssues(r){
 validateRequestDraft(r);const issues=[],check=(ok,message)=>{if(!ok)issues.push(message);};
 const origin=(s,secure)=>{if(typeof s!=='string')return false;const m=/^(https?):\/\/(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]+)(?::([0-9]{1,5}))?\/?$/.exec(s);return !!m&&(!secure||m[1]==='https')&&(!m[3]||Number(m[3])>0&&Number(m[3])<=65535);};
 check(typeof r.title==='string'&&r.title.trim()&&r.title.length<=160,'Enter an offer title of at most 160 characters.');
 check(origin(r.publicOrigin,true),'Select the actual public HTTPS checkout origin.');
 check(origin(r.gatewayBaseUrl,false),'Select the actual API origin.');
 check(r.payment.scheme==='exact','Payment scheme must be exact.');
 check(['stellar:testnet','stellar:pubnet'].includes(r.payment.network),'Select the actual Stellar network.');
 check(typeof r.payment.asset==='string'&&/^C[A-Z2-7]{55}$/.test(r.payment.asset),'Enter the original Stellar asset contract.');
 check(typeof r.payment.payTo==='string'&&/^[GC][A-Z2-7]{55}$/.test(r.payment.payTo),'Enter the original merchant recipient.');
 check(typeof r.payment.amount==='string'&&/^[1-9][0-9]*$/.test(r.payment.amount),'Enter positive atomic asset units as a decimal string.');
 for(const [key,min,max] of [['allowanceUnits',1,Number.MAX_SAFE_INTEGER],['requestUnits',1,r.allowanceUnits],['workerPort',1,65535],['apiPort',0,65535],['timeoutSeconds',1,120]])
  check(Number.isSafeInteger(r[key])&&r[key]>=min&&r[key]<=max,'Review '+key+'.');
 check(r.workerPort!==r.apiPort||r.apiPort===0,'Worker and API ports must differ.');
 for(const key of ['functionPath','checkoutPath'])check(typeof r[key]==='string'&&r[key].startsWith('/')&&!/[?#\s\\]/.test(r[key]),'Review '+key+'.');
 check(typeof r.backupPassEnv==='string'&&/^[A-Z][A-Z0-9_]{4,63}$/.test(r.backupPassEnv),'Enter the existing backup passphrase environment name.');
 return issues;
}
function selected(ed){
 need(plain(ed)&&HASH.test(ed.id)&&Array.isArray(ed.parents)&&ed.parents.length<=2&&ed.parents.every(x=>HASH.test(x)), 'Invalid edition');
 need(stamp(ed.at),'Invalid edition time');meaningful(ed.actor,'Edition operator',120);meaningful(ed.note,'Edition note',4096);
 validateRequestDraft(ed.request);need(ed.directory===absolute(ed.directory,'Setup directory'),'Setup directory is not normalized');
 need(ed.id===sha256(canonical(Object.fromEntries(Object.entries(ed).filter(([k])=>k!=='id')))),'Edition content changed');
}
function edition({request,directory,parents,actor,note,at}){
 const value={parents:[...parents],request:validateRequestDraft(request),directory:absolute(directory,'Setup directory'),actor:meaningful(actor,'Operator',120),note:meaningful(note,'Note'),at};
 need(stamp(at),'Invalid time');return {id:sha256(canonical(value)),...value};
}
export function createCommission({id,request,directory,actor,note='Initial complete setup',at}){
 need(UUID.test(id),'Commission UUID required');
 const ed=edition({request,directory,parents:[],actor,note,at});
 return validateCommission({schema:COMMISSION_SCHEMA,id,head:ed.id,editions:[ed],captures:[]});
}
export function currentEdition(s){return s.editions.find(e=>e.id===s.head);}
function lookup(s,id,kind){return s.captures.find(c=>c.id===id&&(!kind||c.kind===kind));}
function customerManifest(value){
 need(value?.schema==='stellar-forge.sf101.api-merchant-export.v1'&&UUID.test(value.id)&&value.kind==='customer-handoff'&&Array.isArray(value.files)&&value.files.length>0&&value.files.length<=64,'Receive the complete original customer export manifest');
 const names=new Set();
 for(const f of value.files){
  need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(f.name??'')&&!names.has(f.name)&&!['receiving.json','complete.json','lease.lock'].includes(f.name)&&HASH.test(f.sha256)&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&f.bytes<=32*1024*1024&&f.downloadUrl==='/api/exports/'+value.id+'/files/'+encodeURIComponent(f.name),'Original customer export member differs');
  names.add(f.name);
 }
 need(['handoff.json','api-pass.json','credentials.json'].every(name=>names.has(name)),'Receive all original customer handoff members');
}
function nativeCapture(s,c){
 need(plain(c)&&HASH.test(c.id)&&HASH.test(c.sourceSha256)&&['setup-plan','setup-result','publication','customer-handoff','customer-files','customer-setup'].includes(c.kind),'Invalid original capture');
 need(typeof c.raw==='string'&&sha256(c.raw)===c.sourceSha256&&stamp(c.at),'Original capture bytes changed');
 const payload=Object.fromEntries(Object.entries(c).filter(([k])=>k!=='id'));need(c.id===sha256(canonical(payload)),'Capture identity changed');
 const ed=s.editions.find(e=>e.id===c.editionId);need(ed,'Capture edition absent');
 const value=JSON.parse(c.raw),parent=c.parentId?lookup(s,c.parentId):null;
 need(!c.parentId||parent&&parent.editionId===ed.id,'Capture parent absent or from another edition');
 if(c.kind==='setup-plan'){
  need(!parent&&value.schema==='stellar-forge.prepaid-api-starter-plan.v1'&&UUID.test(value.id)&&value.directory===ed.directory&&equal(value.input,ed.request)&&value.inputSha256===sha256(canonical(ed.request)),'Original setup plan does not match this exact request');
  need(Array.isArray(value.files)&&value.files.length===FILES.length,'Original seven source files required');
  value.files.forEach((f,i)=>need(f.name===FILES[i]&&typeof f.content==='string'&&f.bytes===utf8(f.content).length&&f.sha256===sha256(f.content),'Original generated file changed'));
 }else if(c.kind==='setup-result'){
  need(parent?.kind==='setup-plan','Receive original setup.json first');const p=JSON.parse(parent.raw);
  need(value.schema==='stellar-forge.prepaid-api-starter-result.v1'&&value.setupId===p.id&&value.directory===ed.directory&&value.inputSha256===p.inputSha256&&value.planSha256===sha256(parent.raw)&&value.config===ed.directory+'/merchant-workspace.json','Original inspected setup differs');
  need(HASH.test(value.configSha256)&&HASH.test(value.sourceSha256)&&value.configSha256===p.files.find(f=>f.name==='merchant-workspace.json').sha256,'Original configuration differs');
  need(equal(value.files,p.files.map(({content,...f})=>f)),'Original setup member inventory differs');
 }else if(c.kind==='publication'){
  need(parent?.kind==='setup-result','Receive original setup result first');const p=JSON.parse(parent.raw);
  need(value.schema==='stellar-forge.prepaid-api-publication.v1'&&value.status==='READY'&&value.setupId===p.setupId&&UUID.test(value.workspaceId)&&UUID.test(value.offerId)&&UUID.test(value.workflowId)&&UUID.test(value.operations?.prepare)&&UUID.test(value.operations?.publish)&&value.offer?.id===value.offerId&&value.offer?.status==='READY'&&value.offer?.sourceSha256===p.sourceSha256&&Array.isArray(value.files),'Original publication differs');
 }else if(c.kind==='customer-handoff'){
  need(parent?.kind==='publication','Receive original publication first');const p=JSON.parse(parent.raw);
  need(value.schema==='stellar-forge.prepaid-api-customer-handoff.v1'&&value.status==='READY'&&value.setupId===p.setupId&&value.workspaceId===p.workspaceId&&value.offerId===p.offerId&&typeof value.orderReference==='string'&&value.orderReference.length>0&&UUID.test(value.workflowId)&&UUID.test(value.operationId),'Original customer handoff differs');
  customerManifest(value.export);
 }else if(c.kind==='customer-files'){
  need(parent?.kind==='customer-handoff','Receive original customer handoff first');const p=JSON.parse(parent.raw);
  need(value.schema==='stellar-forge.prepaid-api-customer-files.v1'&&value.status==='COMPLETE'&&value.workspaceId===p.workspaceId&&value.offerId===p.offerId&&value.orderReference===p.orderReference&&value.exportId===p.export.id&&Array.isArray(value.files),'Original complete customer result differs');
  need(value.directory===absolute(value.directory,'Original customer receiving directory'),'Original customer receiving directory differs');
  need(equal(value.files,p.export.files.map(({downloadUrl,...f})=>f)),'Original received member inventory differs');
 }else{
  need(parent?.kind==='customer-files','Receive original customer files first');const p=JSON.parse(parent.raw);
  need(value.schema==='stellar-forge.prepaid-api-customer-setup.v1'&&value.binding?.merchantWorkspaceId===p.workspaceId&&value.binding?.orderReference===p.orderReference&&value.binding?.offerId===p.offerId&&value.binding?.exportId===p.exportId&&HASH.test(value.workspaceConfigSha256),'Original customer workspace differs');
  need(equal(value.binding.files,p.files)&&value.binding.sourceDirectory===p.directory&&value.binding.completeSha256===sha256(canonical(p)+'\n'),'Original customer workspace member binding differs');
  need(UUID.test(value.id)&&UUID.test(value.bootstrapOperationId)&&HASH.test(value.sourcePlanSha256)&&HASH.test(value.binding.receivingSha256)&&value.binding.manifestSha256===p.files.find(f=>f.name==='api-pass.json').sha256&&value.binding.handoffSha256===p.files.find(f=>f.name==='handoff.json').sha256,'Original customer workspace source identity differs');
  need(value.directory===absolute(value.directory,'Original customer setup directory')&&value.configurationFile===value.directory+'/customer-config.json'&&value.workspaceConfig===value.directory+'/workspace-config.json'&&value.workspaceDirectory===value.directory+'/workspace'&&value.handoffDirectory===value.binding.directory&&['purchase','access'].includes(value.mode),'Original customer workspace paths differ');
 }
 return value;
}
export function validateCommission(value){
 validJSON(value);need(value.schema===COMMISSION_SCHEMA&&UUID.test(value.id)&&HASH.test(value.head)&&Array.isArray(value.editions)&&value.editions.length>0&&value.editions.length<=512&&Array.isArray(value.captures)&&value.captures.length<=1024,'Invalid complete commissioning');
 const seen=new Set();for(const ed of value.editions){selected(ed);need(!seen.has(ed.id)&&ed.parents.every(p=>seen.has(p)),'Edition ancestry missing or repeated');seen.add(ed.id);}
 need(seen.has(value.head),'Selected edition absent');
 const captures=new Set();for(const c of value.captures){need(!captures.has(c.id)&&(!c.parentId||captures.has(c.parentId)),'Capture order or identity changed');nativeCapture(value,c);captures.add(c.id);}
 return clone(value);
}
export function reviseCommission(state,{request,directory,actor,note,at}){
 const s=validateCommission(state),prior=currentEdition(s);
 if(equal(request,prior.request)&&directory===prior.directory)return s;
 const ed=edition({request,directory,parents:[prior.id],actor,note,at});s.editions.push(ed);s.head=ed.id;
 return validateCommission(s);
}
export function receiveOriginal(state,{kind,raw,parentId=null,editionId=state.head,at}){
 const s=validateCommission(state),value={kind,editionId,parentId,raw,sourceSha256:sha256(raw),at};
 const existing=s.captures.find(c=>c.kind===kind&&c.editionId===editionId&&c.parentId===parentId&&c.sourceSha256===value.sourceSha256);
 if(existing)return s;
 const c={id:sha256(canonical(value)),...value};s.captures.push(c);return validateCommission(s);
}
export function openCommission(raw){need(typeof raw==='string'&&utf8(raw).length<=MAX_COMMISSION_BYTES,'Complete file exceeds 32 MiB');return validateCommission(JSON.parse(raw));}
export function exportCommission(s){return JSON.stringify(validateCommission(s),null,2)+'\n';}
const fieldValues=ed=>({...Object.fromEntries(Object.entries(ed.request).filter(([k])=>k!=='payment')), ...Object.fromEntries(Object.entries(ed.request.payment).map(([k,v])=>['payment.'+k,v])), directory:ed.directory});
const ancestors=(s,id)=>{const set=new Set();const walk=id=>{if(set.has(id))return;set.add(id);s.editions.find(e=>e.id===id)?.parents.forEach(walk);};walk(id);return set;};
export function compareCommission(local,incoming){
 const a=validateCommission(local),b=validateCommission(incoming);need(a.id===b.id,'Receive another commission as a separate document');
 const union=new Map(a.editions.map(e=>[e.id,e]));for(const e of b.editions){need(!union.has(e.id)||equal(union.get(e.id),e),'Same edition differs');union.set(e.id,e);}
 const aa=ancestors(a,a.head),ba=ancestors(b,b.head),common=[...union.values()].filter(e=>aa.has(e.id)&&ba.has(e.id));
 need(common.length,'Commission histories have no shared original edition');
 const graph={editions:[...union.values()]},paths=new Map(common.map(e=>[e.id,ancestors(graph,e.id)]));
 const bases=common.filter(e=>!common.some(other=>other.id!==e.id&&paths.get(other.id).has(e.id))).map(e=>e.id).sort();
 const ambiguousBase=bases.length>1,base=ambiguousBase?{}:fieldValues(union.get(bases[0]));
 const av=fieldValues(currentEdition(a)),bv=fieldValues(currentEdition(b)),keys=[...new Set([...Object.keys(av),...Object.keys(bv),...Object.keys(base)])].sort();
 const fields=keys.map(key=>({key,base:base[key]??null,current:av[key]??null,incoming:bv[key]??null,present:{base:Object.hasOwn(base,key),current:Object.hasOwn(av,key),incoming:Object.hasOwn(bv,key)},selected:equal(av[key],bv[key])?'current':ambiguousBase?null:equal(bv[key],base[key])?'current':equal(av[key],base[key])?'incoming':null}));
 return {schema:'stellar-forge.prepaid-api-comparison.v1',commissionId:a.id,currentHead:a.head,incomingHead:b.head,base:ambiguousBase?null:bases[0],bases,ambiguousBase,fields};
}
export function mergeCommission(local,incoming,choices,{actor,note,at}){
 const a=validateCommission(local),b=validateCommission(incoming),plan=compareCommission(a,b),values={};
 for(const f of plan.fields){const pick=f.selected??choices[f.key];need(['current','incoming'].includes(pick),'Choose '+f.key);if(f.present[pick])values[f.key]=clone(f[pick]);}
 const request={payment:{}};for(const [k,v]of Object.entries(values)){if(k==='directory')continue;if(k.startsWith('payment.'))request.payment[k.slice(8)]=v;else request[k]=v;}
 const seen=new Set(a.editions.map(e=>e.id));for(const e of b.editions)if(!seen.has(e.id)){a.editions.push(e);seen.add(e.id);}
 const captured=new Set(a.captures.map(c=>c.id));for(const c of b.captures)if(!captured.has(c.id)){a.captures.push(c);captured.add(c.id);}
 if(a.head===b.head)return validateCommission(a);
 const ed=edition({request,directory:values.directory,parents:[a.head,b.head],actor,note,at});a.editions.push(ed);a.head=ed.id;return validateCommission(a);
}
export function commissioningSummary(state){
 const s=validateCommission(state),ed=currentEdition(s),captures=s.captures.filter(c=>c.editionId===ed.id);
 return {id:s.id,head:s.head,title:ed.request.title,directory:ed.directory,requestSha256:sha256(canonical(ed.request)),issues:requestIssues(ed.request),editions:s.editions.length,captures:captures.map(c=>({id:c.id,kind:c.kind,sourceSha256:c.sourceSha256,at:c.at})),historicalCaptures:s.captures.length-captures.length,maximumSuccessfulCalls:Number.isSafeInteger(ed.request.allowanceUnits)&&Number.isSafeInteger(ed.request.requestUnits)&&ed.request.requestUnits>0?Math.floor(ed.request.allowanceUnits/ed.request.requestUnits):null,remainingUnits:Number.isSafeInteger(ed.request.allowanceUnits)&&Number.isSafeInteger(ed.request.requestUnits)&&ed.request.requestUnits>0?ed.request.allowanceUnits%ed.request.requestUnits:null};
}
export function generatedSourceFiles(state,planId){
 const s=validateCommission(state),c=lookup(s,planId,'setup-plan');need(c,'Select an original setup plan');return clone(JSON.parse(c.raw).files);
}
