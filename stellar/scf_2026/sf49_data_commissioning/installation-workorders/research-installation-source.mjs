// MIT. Complete original Research inputs, inspected by the maintained native receivers.
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {privateDirectory,atomicJson,readPrivateJson} from '../../../scf-starforge-20261009/sf30-seller-sdk/routescan/quota.mjs';
import {receiveFredProject,readFredProject} from '../../../scf-starforge-20261009/sf30-seller-sdk/fred/project.mjs';
import {decodeResearchEditionDelivery,receiveResearchEditionDelivery} from '../../../scf-starforge-20261009/sf30-seller-sdk/fred/research/delivery.mjs';
import {decodeResearchReturn} from '../../../scf-starforge-20261009/sf30-seller-sdk/fred/research/return-codec.mjs';
import {validateResearchState,catalogue,sourceSummary,canonical,clone,digest,need,SCHEMA} from '../../../scf-starforge-20261009/sf30-seller-sdk/fred/research/model.mjs';
import {retainIssuedGraph} from '../../../scf-starforge-20261009/sf30-seller-sdk/fred/research/return-model.mjs';
export const RESEARCH_INSTALLATION_INSPECTION='stellar-forge.research-installation-inspection.v1';
export const RESEARCH_INSTALLATION_SELECTION='stellar-forge.research-installation-selection.v1';
export const RESEARCH_INSTALLATION_LIMITS=Object.freeze({project:480*1024*1024,'issued-package':256*1024*1024,'customer-return':256*1024*1024});
const HASH=/^[a-f0-9]{64}$/;
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const same=(a,b)=>canonical(a)===canonical(b);
const signature=s=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join('/');
function exact(v,keys,label){need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),'Retain every '+label+' field.');}
function text(v,label,max=4000){need(typeof v==='string'&&v.trim()&&v.length<=max&&!/[\0]/.test(v),'Record the explicit '+label+'.');return v;}
export async function readResearchInstallationFile(file){
  need(file&&Object.hasOwn(RESEARCH_INSTALLATION_LIMITS,file.kind)&&HASH.test(file.sha256??'')&&
    Number.isSafeInteger(file.bytes)&&file.bytes>0&&file.bytes<=RESEARCH_INSTALLATION_LIMITS[file.kind],
    'Select a complete Research input within its original per-kind capacity.','RESEARCH_INSTALLATION_CAPACITY',413);
  const path=resolve(file.path),actual=await realpath(path);
  need(path===actual,'Keep the original regular file without a symbolic-link alias.');
  const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=await h.stat();
    need(before.isFile()&&before.size===file.bytes&&!(before.mode&0o077),'Keep the complete private original file.');
    const raw=await h.readFile(),after=await h.stat(),named=await lstat(path);
    need(raw.length===file.bytes&&sha(raw)===file.sha256&&signature(before)===signature(after)&&
      named.dev===before.dev&&named.ino===before.ino,'The complete selected Research file changed.','RESEARCH_INSTALLATION_SOURCE_CHANGED',409);
    return raw;
  }finally{await h.close();}
}
function graphSummary(research){
  validateResearchState({research});const c=catalogue({research});
  return {products:clone(c.products),entries:clone(c.entries),sources:c.sources.map(sourceSummary),reviews:clone(c.reviews)};
}
function projectOrigins(state){
  return (state.researchCommerce?.receivings??[]).map(r=>({sourceProjectId:r.sourceProjectId,productId:r.productId,
    editionId:r.editionId,packageSha256:r.id,deliverySha256:r.deliverySha256}));
}
function exchangeSummary(exchange){
  const result={};
  for(const name of ['sent','received','drafts','adoptions'])result[name]=(exchange?.[name]??[]).map(row=>
    Object.fromEntries(Object.entries(row).filter(([key])=>['id','returnId','productId','editionId','sourceProjectId',
      'packageSha256','deliverySha256','manifestSha256','createdAt','receivedAt','savedAt','appliedAt',
      'revision','definitionId','workId','comparisonSha256','filename','bytes','sha256'].includes(key))));
  return result;
}
async function inspectNativeResearchInput({file,directory}={}){
  const raw=await readResearchInstallationFile(file);directory=await privateDirectory(resolve(directory));
  let graph,identity,projectId,sourceProjectId,revision,extra={};
  if(file.kind==='project'){
    const bundle=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
    need(bundle?.state?.research,'Select a complete native economic project containing Research.');
    // The original whole-project receiver validates all v1-v9 extensions and original file bodies.
    // Its original receiving identity also preserves subsequent recipient edits on replay.
    const receipt=await receiveFredProject({directory:join(directory,'project'),bundle});
    graph=bundle.state.research;projectId=bundle.state.id;sourceProjectId=bundle.state.id;revision=bundle.state.revision;
    identity={bundleSha256:bundle.bundleSha256};extra={origins:projectOrigins(bundle.state),nativeVerified:true,
      exchange:exchangeSummary(bundle.state.researchExchange)};
    // The public inspection describes the retained original, never a later mutable receiver revision.
  }else if(file.kind==='issued-package'){
    const {delivery,edition,files}=decodeResearchEditionDelivery(raw);
    graph=delivery.research;sourceProjectId=delivery.sourceProjectId;projectId=sourceProjectId;revision=null;
    identity={packageSha256:sha(raw),deliverySha256:delivery.deliverySha256,manifestSha256:delivery.manifestSha256};
    extra={edition:clone(edition),assets:files.map(({bodyBase64,...f})=>clone(f)),origins:[]};
  }else{
    const {packet,delivery}=decodeResearchReturn(raw);
    graph=packet.research;sourceProjectId=packet.sourceProjectId;projectId=packet.customer.projectId;revision=packet.customer.revision;
    identity={returnId:packet.id,packageSha256:packet.originalPackage.sha256,deliverySha256:packet.deliverySha256};
    extra={edition:{productId:packet.productId,editionId:packet.editionId,definitionId:packet.selectedDefinitionId},
      customer:clone(packet.customer),author:packet.author,note:packet.note,createdAt:packet.createdAt,origins:[],
      issuedResearch:{schema:SCHEMA,...graphSummary(delivery.research)}};
  }
  const result={schema:RESEARCH_INSTALLATION_INSPECTION,kind:file.kind,sourceProjectId,projectId,revision,
    identity,...graphSummary(graph),...extra};
  // Source bodies, API credentials, unrelated FRED data, and host paths never enter this metadata response.
  return {inspection:{...result,inspectionSha256:digest(result)},graph};
}
export async function inspectResearchInstallationInput(input){return (await inspectNativeResearchInput(input)).inspection;}
function selectedEdition(inspection,p){
  const product=inspection.products.find(x=>x.id===p.productId),edition=product?.editions.find(x=>x.id===p.editionId);
  need(product&&edition,'Select an actual retained issued Research edition.','RESEARCH_INSTALLATION_EDITION',422);
  const version=product.versions.find(x=>x.id===edition.definitionId);
  need(version,'Retain the original issued product definition.');
  return {product,edition,version};
}
export async function prepareResearchInstallationSelection({inputs,selection,directory}={}){
  exact(selection,['schema','inputs','product','sourceUses','expectedVersion','installationId',
    'expectedInstallationRevision','document'],'Research Installation selection');
  need(selection.schema===RESEARCH_INSTALLATION_SELECTION&&Array.isArray(inputs)&&inputs.length>0&&inputs.length<=3,
    'Retain the complete original Research selection.');
  exact(selection.product,['sourceProjectId','productId','editionId'],'issued product selection');
  const byKind=new Map(),inspections=[];
  need(Array.isArray(selection.inputs)&&selection.inputs.length===inputs.length,'Retain every selected whole input.');
  for(const selected of selection.inputs){
    exact(selected,['fileId','sha256','role'],'original file selection');
    const file=inputs.find(f=>f.id===selected.fileId);
    need(file&&file.sha256===selected.sha256&&file.kind===selected.role&&!byKind.has(file.kind),
      'Select each original source kind once with its exact retained SHA256.');
    const {inspection:inspected,graph}=await inspectNativeResearchInput({file,directory:join(directory,file.id)});
    byKind.set(file.kind,{file,inspection:inspected,graph});inspections.push({file:{id:file.id,name:file.name,kind:file.kind,bytes:file.bytes,sha256:file.sha256,
      sourceUrl:file.sourceUrl,observedAt:file.observedAt},inspection:inspected});
  }
  need(byKind.has('project')||byKind.has('issued-package'),'Select the whole native project or its original issued delivery.');
  const base=byKind.get('issued-package')??byKind.get('project'),primary=base.inspection,p=selection.product;
  const chosen=selectedEdition(primary,p);
  const originMatches=primary.sourceProjectId===p.sourceProjectId||
    (primary.origins??[]).some(r=>r.sourceProjectId===p.sourceProjectId&&r.productId===p.productId&&r.editionId===p.editionId);
  need(originMatches,'Retain the original issued producer project identity.');
  if(byKind.has('issued-package'))need(primary.edition.productId===p.productId&&primary.edition.editionId===p.editionId,
    'The issued package contains another selected product or edition.');
  for(const {inspection,graph} of byKind.values()){
    selectedEdition(inspection,p);
    if(inspection.kind==='customer-return')need(inspection.sourceProjectId===p.sourceProjectId&&
      inspection.edition.productId===p.productId&&inspection.edition.editionId===p.editionId&&
      (!byKind.has('issued-package')||inspection.identity.packageSha256===primary.identity.packageSha256),
      'The optional customer return belongs to another original issued delivery.');
    // Matching IDs alone are insufficient: immutable definition, review and capture histories must agree.
    const current=clone(graph),original=clone(base.graph);
    const selectedEntries=new Set(chosen.edition.sources.map(r=>r.entryId));
    const versionIds=new Set(chosen.edition.sources.map(r=>r.definitionId));
    const captureIds=new Set(chosen.edition.sources.map(r=>r.snapshotId));
    const reviewIds=new Set(chosen.edition.sources.map(r=>r.reviewId));
    original.entries=original.entries.filter(e=>selectedEntries.has(e.id)).map(e=>({...e,
      versions:e.versions.filter(v=>versionIds.has(v.id)),currentId:e.versions.filter(v=>versionIds.has(v.id)).at(-1).id}));
    original.sources=original.sources.filter(s=>captureIds.has(s.id));original.reviews=original.reviews.filter(r=>reviewIds.has(r.id));
    original.products=[{id:chosen.product.id,currentId:chosen.version.id,versions:[clone(chosen.version)],editions:[clone(chosen.edition)]}];
    retainIssuedGraph(current,original,p.productId);
  }
  const needed=new Map();
  for(const row of chosen.edition.sources){
    const k=row.entryId+'/'+row.definitionId;
    const entry=primary.entries.find(e=>e.id===row.entryId),version=entry?.versions.find(v=>v.id===row.definitionId);
    need(version,'Retain every original selected source definition.');
    needed.set(k,{entryId:row.entryId,definitionId:row.definitionId,definition:clone(version.definition),savedAt:version.savedAt});
  }
  need(Array.isArray(selection.sourceUses)&&selection.sourceUses.length===needed.size,
    'Record an explicit rights and use decision for every original source definition.');
  const seen=new Set(),sourceUses=[];
  for(const use of selection.sourceUses){
    exact(use,['entryId','definitionId','purpose','rightsStatus','authorityReference','redistribution','retention'],'source-use decision');
    const k=use.entryId+'/'+use.definitionId;
    need(needed.has(k)&&!seen.has(k),'Retain each original source-use decision exactly once.');seen.add(k);
    need(use.rightsStatus==='permitted','Resolve the selected original source authority before preparing; no default licence is granted.',
      'RESEARCH_INSTALLATION_RIGHTS_REQUIRED',422);
    for(const key of ['purpose','authorityReference','redistribution','retention'])text(use[key],key);
    sourceUses.push({...clone(use),original:needed.get(k)});
  }
  const result={schema:'stellar-forge.research-installation-preparation.v1',product:clone(p),
    title:chosen.version.definition.title,definition:clone(chosen.version),edition:clone(chosen.edition),
    inputs:inspections,sourceUses,selectionSha256:digest(selection),
    qualification:'Original sources and saved customer returns are retained. Preparation does not grant rights, adopt a return, approve payment or establish completed commissioning.'};
  return {...result,sha256:digest(result)};
}
export async function receiveResearchInstallationInput({file,directory}={}){
  const raw=await readResearchInstallationFile(file);directory=await privateDirectory(resolve(directory));
  if(file.kind==='project'){
    const projectDirectory=join(directory,'project');
    return {kind:file.kind,directory,projectDirectory,...await receiveFredProject({directory:projectDirectory,
      bundle:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))})};
  }
  if(file.kind==='issued-package')return {kind:file.kind,...await receiveResearchEditionDelivery({directory:join(directory,'issued'),bytes:raw})};
  const {packet}=decodeResearchReturn(raw);
  // A received customer response remains an explicit unadopted original; the producer uses the native return-import/apply workflow.
  return {kind:file.kind,state:'RETAINED_UNADOPTED',returnId:packet.id,sha256:sha(raw),bytes:raw.length,
    sourceProjectId:packet.sourceProjectId,productId:packet.productId,editionId:packet.editionId};
}
async function main(){
  const args=process.argv.slice(2);need(args.length===2&&args[0]==='--input','Use --input ABSOLUTE_CONFIG_JSON.');
  const p=resolve(args[1]),h=await open(p,constants.O_RDONLY|constants.O_NOFOLLOW);
  let value;try{const stat=await h.stat();need(stat.isFile()&&stat.size<=8*1024*1024&&!(stat.mode&0o077),'Keep the private compact native request.');
    value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await h.readFile()));}finally{await h.close();}
  let result;
  if(value.action==='inspect')result=await inspectResearchInstallationInput(value.input);
  else if(value.action==='prepare')result=await prepareResearchInstallationSelection(value.input);
  else if(value.action==='receive')result=await receiveResearchInstallationInput(value.input);
  else need(false,'Use the declared Research Installation native action.');
  process.stdout.write(JSON.stringify(result)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{
  process.stderr.write(JSON.stringify({code:error.code??'RESEARCH_INSTALLATION_ENGINE',message:error.message,status:error.status??422})+'\n');process.exitCode=1;});
