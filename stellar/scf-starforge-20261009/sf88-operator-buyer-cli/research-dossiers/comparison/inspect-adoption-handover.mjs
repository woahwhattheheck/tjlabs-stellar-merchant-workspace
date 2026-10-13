// MIT. Fixed installed inspection of native Research comparison adoption handovers.
import {createReadStream} from 'node:fs';
import {readFile,writeFile,lstat,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {Readable} from 'node:stream';
import {need,object,digest,jsonBytes} from '../../node/store.mjs';
import {portableEntries,PORTABLE_LIMIT,writePortableFile} from '../portable.mjs';
import {fileIdentity,JSON_LIMIT} from './inspect-handover.mjs';
import {id,same,clone} from './contracts.mjs';
import {comparisonModel,validateComparisonState,validateComparisonTransition} from './model.mjs';
import {adoptionEvents,findPlan} from './adoption-contracts.mjs';
import {adoptionResult,validateAdoptionState,validateAdoptionTransition} from './adoption-model.mjs';
import {validateReturnSourceDescriptor,returnSourceChunks} from '../dossier-returns/source.mjs';
import {exportAdoptionReport} from './adoption-render.mjs';
export const ADOPTION_HANDOVER_SCHEMA='sf88-research-comparison-adoption-handover/v1';
export const ADOPTION_INSPECTION_SCHEMA='sf88-research-comparison-adoption-handover-inspection/v1';
export const ADOPTION_ENGINE_FILES=Object.freeze([
 'node/store.mjs','research-dossiers/portable.mjs',
 'research-dossiers/comparison/contracts.mjs','research-dossiers/comparison/model.mjs',
 'research-dossiers/comparison/render.mjs','research-dossiers/comparison/inspect-handover.mjs',
 'research-dossiers/dossier-returns/contracts.mjs','research-dossiers/dossier-returns/source.mjs',
 'research-dossiers/comparison/adoption-contracts.mjs','research-dossiers/comparison/adoption-model.mjs',
 'research-dossiers/comparison/adoption-render.mjs','research-dossiers/comparison/inspect-adoption-handover.mjs']);
export const ADOPTION_DATA_FILES=Object.freeze(['selection.json','author.research.json.gz','returned.research.json',
 'adoption.json','adoption.html','lineage.json','README.md']);
export const ADOPTION_README=Buffer.from('# Complete Research comparison adoption handover\n\nOpen adoption.html for the original selected native adoption result, accepting operator, complete reviewed plan, source bindings, accepted operations and source-to-author mappings. adoption.json is the exact original result. lineage.json contains each original ancestor and successor result through the selected author revision. A superseded or partially accepted plan keeps its recorded state; it is not presented as completed.\n\nThe author.research.json.gz member is the complete original author dossier through the selected revision. returned.research.json retains the contributor’s exact original portable bytes, filename and media type in the plan.source descriptor; those bytes can be plain JSON or gzip. Use that descriptor when saving the member with its original filename. Both native dossiers retain their complete history and original source, raw-run and artifact bytes. Reference-only external editions remain references with their original access terms.\n\nThe installed LDA adoption reader provides separate attributed staff review, exact Search selections, ordered Briefs and explicit colleague-return choices. Original researcher/reviewer attribution and adopting-operator attribution remain distinct. LDA comments do not change Research measurements, judgments or decisions.\n\nengine/ carries twelve exact installed inspection modules. The fixed inspector checks complete portable byte history and retained content, comparison and adoption states, reconstructed native plans and transitions, complete continuation lineage and exact original report bytes. It executes its installed source, never code extracted from the uploaded archive. This is the complete inspection dependency set. Use the maintained Research application to reopen and edit the native dossiers and validate all other Research domains.\n\nOpen and use the complete HTML, JSON, lineage, both original portable projects, source members and final LDA review/Brief/received project before treating this handover as ready.\n','utf8');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const parse=body=>{try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}catch{need(false,'ADOPTION_HANDOVER_JSON_INVALID');}};
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const metadata=s=>({id:s.id,revision:s.revision,title:s.title,description:s.description,questions:s.questions,editions:s.editions});
async function checked(directory,row,maximum=PORTABLE_LIMIT){
 const file=join(directory,row.path);await fileIdentity(file,{maximum,expected:row});
 const body=await readFile(file);need(body.length===row.bytes&&digest(body)===row.sha256,'ADOPTION_HANDOVER_MEMBER_CHANGED');return body;
}
export function adoptionLineage(state,selected){
 const plans=adoptionEvents(state),byId=new Map(plans.map(p=>[p.id,p])),seen=new Set();
 let first=byId.get(selected);need(first,'ADOPTION_PLAN_NOT_FOUND');
 while(first.request.continuationOf){
  need(!seen.has(first.id),'ADOPTION_CONTINUATION_INVALID');seen.add(first.id);
  first=byId.get(first.request.continuationOf);need(first,'ADOPTION_CONTINUATION_INVALID');
 }
 const results=[];seen.clear();let current=first;
 while(current){
  need(!seen.has(current.id),'ADOPTION_CONTINUATION_INVALID');seen.add(current.id);
  results.push(adoptionResult(state,current));
  const next=plans.filter(p=>p.request.continuationOf===current.id);
  need(next.length<=1,'ADOPTION_CONTINUATION_INVALID');current=next[0];
 }
 need(seen.has(selected),'ADOPTION_CONTINUATION_INVALID');return results;
}
// A bounded shared staging area retains immutable original envelopes and blobs.
// Source branches are cached only after all original native validators finish.
async function inspectBranches(staging){
 const cache=new Map(),active=new Set();let retained=0;
 const retain=async(path,body)=>{
  retained+=body.length;need(retained<=4*PORTABLE_LIMIT,'ADOPTION_HANDOVER_DECODED_CLOSURE_SIZE');
  await writeFile(path,body,{flag:'wx',mode:0o600});
 };
 async function sourceBranch(source,readContent,work){
  validateReturnSourceDescriptor(source);
  const file=join(staging,'source-'+source.sha256);
  let present=false;try{const s=await lstat(file);present=s.isFile()&&!s.isSymbolicLink();need(present,'ADOPTION_HANDOVER_FILE_INVALID');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!present){
   const saved=await writePortableFile(file,{body:Readable.from(returnSourceChunks(source,readContent)),filename:source.filename,contentType:source.contentType});
   need(saved.bytes===source.bytes&&saved.sha256===source.sha256,'ADOPTION_SOURCE_CHANGED');
   retained+=saved.bytes;need(retained<=4*PORTABLE_LIMIT,'ADOPTION_HANDOVER_DECODED_CLOSURE_SIZE');
  }else{
   // Validate this descriptor's own complete chunk sequence, even when another
   // plan already caused the same immutable input to be staged.
   let total=0;
   for await(const bytes of returnSourceChunks(source,readContent))total+=bytes.length;
   need(total===source.bytes,'ADOPTION_SOURCE_CHANGED');
  }
  const branch=await readBranch(file,{bytes:source.bytes,sha256:source.sha256});
  need(branch.id===source.dossierId&&same(source.incomingHead,{revision:branch.head.state.revision,sha256:branch.head.sha256}),'ADOPTION_SOURCE_CHANGED');
  return work(branch);
 }
 async function readBranch(file,expected){
  const identity=await fileIdentity(file,{expected}),key=identity.sha256;
  if(cache.has(key))return cache.get(key);
  need(!active.has(key),'ADOPTION_HANDOVER_CYCLIC_SOURCE');active.add(key);
  const directory=await mkdtemp(join(staging,'branch-')),fields={},pins=[],history=[],blobs=new Map(),required=new Map();
  let last=null,previous=null,previousState=null,count=0,blobCount=0,blobBytes=0;
  try{
   for await(const record of portableEntries(createReadStream(file))){
    if(record.kind==='field'){fields[record.key]=record.value;continue;}
    if(record.kind==='array'){fields[record.key]=record.count;continue;}
    if(record.kind==='versions'){
     const e=record.value,s=e?.state;
     need(object(e)&&Object.keys(e).sort().join(',')==='sha256,state'&&object(s)&&
      /^d_[a-f0-9-]{36}$/.test(s.id)&&s.revision===++count&&count<=10000&&s.previous===previous&&
      digest(jsonBytes(s))===e.sha256&&jsonBytes(e).length<=8*1024*1024&&(!last||s.id===last.state.id),'ADOPTION_HANDOVER_HISTORY');
     need(Array.isArray(s.questions)&&Array.isArray(s.editions),'ADOPTION_HANDOVER_STATE');
     for(const edition of s.editions)if(edition.mode==='retained'){
      const m=edition.raw;need(object(m)&&sha(m.sha256)&&Number.isSafeInteger(m.bytes)&&m.bytes>=0&&m.bytes<=64*1024*1024,'ADOPTION_HANDOVER_SOURCE');
      const old=required.get(m.sha256);need(!old||old.bytes===m.bytes,'ADOPTION_HANDOVER_SOURCE');required.set(m.sha256,m);
     }
     validateComparisonTransition(previousState,s);
     await retain(join(directory,'revision-'+count+'.json'),jsonBytes(e));
     pins.push({revision:count,sha256:e.sha256});history.push({revision:count,sha256:e.sha256,createdAt:s.updatedAt,change:s.change});
     previous=e.sha256;previousState=s;last=e;
    }else if(record.kind==='blobs'){
     const b=record.value;need(object(b)&&sha(b.sha256)&&typeof b.bodyBase64==='string','ADOPTION_HANDOVER_BLOB');
     const body=Buffer.from(b.bodyBase64,'base64');
     need(body.toString('base64')===b.bodyBase64&&body.length===b.bytes&&body.length<=64*1024*1024&&digest(body)===b.sha256,'ADOPTION_HANDOVER_BLOB');
     blobBytes+=body.length;need(blobBytes<=PORTABLE_LIMIT,'ADOPTION_HANDOVER_SIZE');
     const old=blobs.get(b.sha256);need(!old||old.bytes===body.length,'ADOPTION_HANDOVER_BLOB');
     if(!old){await retain(join(directory,b.sha256),body);blobs.set(b.sha256,{bytes:body.length,sha256:b.sha256});}
     blobCount++;
    }
   }
   need(fields.schema==='sf88-research-dossier-portable-v1'&&fields.id===last?.state.id&&fields.versions===count&&
    fields.blobs===blobCount&&count>0,'ADOPTION_HANDOVER_PORTABLE_BINDING');
   const readContent=async m=>{
    need(blobs.get(m.sha256)?.bytes===m.bytes,'ADOPTION_HANDOVER_BLOB_MISSING');
    const body=await readFile(join(directory,m.sha256));
    need(body.length===m.bytes&&digest(body)===m.sha256,'ADOPTION_HANDOVER_BLOB');return body;
   };
   const readRevision=async revision=>{
    need(Number.isSafeInteger(revision)&&revision>0&&revision<=count,'REVISION_INVALID');
    const e=parse(await readFile(join(directory,'revision-'+revision+'.json')));
    need(e.state.revision===revision&&e.sha256===pins[revision-1].sha256&&digest(jsonBytes(e.state))===e.sha256,'ADOPTION_HANDOVER_HISTORY');return e;
   };
   for(const m of required.values())need(blobs.get(m.sha256)?.bytes===m.bytes,'ADOPTION_HANDOVER_SOURCE_MISSING');
   const validationCache=new Map();previousState=null;
   for(let revision=1;revision<=count;revision++){
    const e=await readRevision(revision),s=e.state;
    await validateComparisonState(s,readContent,validationCache);
    await validateAdoptionState(s,readContent,validationCache);
    await validateAdoptionTransition(previousState,s,{
     readSourceBranch:(source,work)=>sourceBranch(source,readContent,work),
     historyPin:r=>pins[r-1]?.sha256});
    previousState=s;
   }
   await fileIdentity(file,{expected:identity});
   const branch={id:fields.id,head:last,pins,history,blobs:[...blobs.values()],readContent,readRevision};
   cache.set(key,branch);return branch;
  }finally{active.delete(key);}
 }
 return{readBranch,sourceBranch};
}
export async function inspectAdoptionHandover(directory,{manifestSha256}={}){
 directory=resolve(directory);
 const manifestFile=join(directory,'manifest.json');await fileIdentity(manifestFile,{maximum:1048576});
 const raw=await readFile(manifestFile);need(raw.length<=1048576&&
  (manifestSha256===undefined||digest(raw)===manifestSha256),'ADOPTION_HANDOVER_MANIFEST_CHANGED');
 const manifest=parse(raw),names=[...ADOPTION_DATA_FILES,...ADOPTION_ENGINE_FILES.map(p=>'engine/'+p)];
 need(object(manifest)&&Object.keys(manifest).sort().join(',')==='files,schema,selection'&&manifest.schema===ADOPTION_HANDOVER_SCHEMA,'ADOPTION_HANDOVER_SCHEMA');
 need(Array.isArray(manifest.files)&&manifest.files.length===names.length,'ADOPTION_HANDOVER_INVENTORY');
 const files=new Map();
 for(const row of manifest.files){
  need(object(row)&&Object.keys(row).sort().join(',')==='bytes,path,sha256'&&names.includes(row.path)&&!files.has(row.path)&&
   Number.isSafeInteger(row.bytes)&&row.bytes>=0&&row.bytes<=PORTABLE_LIMIT&&sha(row.sha256),'ADOPTION_HANDOVER_MEMBER_INVALID');
  files.set(row.path,row);
 }
 need(names.every(p=>files.has(p))&&manifest.files.reduce((n,f)=>n+f.bytes,raw.length)<=PORTABLE_LIMIT,'ADOPTION_HANDOVER_SIZE');
 for(const path of ADOPTION_ENGINE_FILES){
  const installed=await readFile(join(root,path)),carried=await checked(directory,files.get('engine/'+path),1048576);
  need(installed.equals(carried),'ADOPTION_HANDOVER_INSTALLED_ENGINE_MISMATCH');
 }
 const selection=parse(await checked(directory,files.get('selection.json'),1048576));
 need(object(selection)&&Object.keys(selection).sort().join(',')==='caseId,caseVersionId,dossierId,headSha256,operationId,planId,questionId,revision,schema,sourceId'&&
  selection.schema===ADOPTION_HANDOVER_SCHEMA+'.selection'&&same(selection,manifest.selection)&&/^d_[a-f0-9-]{36}$/.test(selection.dossierId)&&
  Number.isSafeInteger(selection.revision)&&selection.revision>=1&&sha(selection.headSha256)&&/^drs_[a-f0-9]{64}$/.test(selection.sourceId),'ADOPTION_HANDOVER_SELECTION');
 for(const key of ['operationId','planId','caseId','caseVersionId','questionId'])id(selection[key]);
 const staging=await mkdtemp(join(tmpdir(),'research-adoption-inspect-'));
 try{
  const reader=await inspectBranches(staging),author=await reader.readBranch(join(directory,'author.research.json.gz'),files.get('author.research.json.gz'));
  need(author.id===selection.dossierId&&author.head.state.revision===selection.revision&&author.head.sha256===selection.headSha256,'ADOPTION_HANDOVER_GENERATION');
  const plan=findPlan(author.head.state,selection.planId);need(plan&&plan.source.id===selection.sourceId&&plan.case.id===selection.caseId&&
   plan.case.versionId===selection.caseVersionId&&plan.case.definition.questionId===selection.questionId,'ADOPTION_HANDOVER_PLAN_BINDING');
  const report=adoptionResult(author.head.state,plan),lineage=adoptionLineage(author.head.state,selection.planId);
  const incoming=files.get('returned.research.json');
  need(incoming.bytes===plan.source.bytes&&incoming.sha256===plan.source.sha256,'ADOPTION_HANDOVER_RETURN_CHANGED');
  const returned=await reader.readBranch(join(directory,incoming.path),incoming);
  need(returned.id===selection.dossierId&&same(plan.source.incomingHead,{revision:returned.head.state.revision,sha256:returned.head.sha256}),'ADOPTION_HANDOVER_RETURN_CHANGED');
  for(const format of ['json','html']){
   const expected=exportAdoptionReport(report,{format}),actual=await checked(directory,files.get('adoption.'+format),JSON_LIMIT);
   need(expected.body.equals(actual),'ADOPTION_HANDOVER_REPORT_CHANGED');
  }
  need(jsonBytes(lineage).equals(await checked(directory,files.get('lineage.json'),JSON_LIMIT)),'ADOPTION_HANDOVER_LINEAGE_CHANGED');
  need((await checked(directory,files.get('README.md'),1048576)).equals(ADOPTION_README),'ADOPTION_HANDOVER_README_CHANGED');
  const model=comparisonModel(returned.head.state);
  const result={schema:ADOPTION_INSPECTION_SCHEMA,selection,manifest,manifestSha256:digest(raw),history:author.history,
   metadata:metadata(author.head.state),report,lineage,
   returned:{history:returned.history,metadata:metadata(returned.head.state),blobs:returned.blobs,
    comparison:Object.fromEntries(['cases','candidates','runs','judgments','decisions','operations'].map(k=>[k,clone(model[k])]))},
   blobs:author.blobs,authority:'Original comparison and adoption validators, reconstructed source plans and exact portable/report bytes. Full-dossier semantic receiving remains the original Research application.'};
  need(jsonBytes(result).length<=JSON_LIMIT,'ADOPTION_HANDOVER_PROJECTION_TOO_LARGE');return result;
 }finally{await rm(staging,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),values={};
  for(let i=0;i<args.length;i+=2){
   need(['--directory','--out','--manifest-sha256'].includes(args[i])&&args[i+1]!==undefined&&!values[args[i]],'ADOPTION_HANDOVER_ARGUMENTS');values[args[i]]=args[i+1];
  }
  need(values['--directory']&&values['--out'],'ADOPTION_HANDOVER_ARGUMENTS');
  const result=await inspectAdoptionHandover(values['--directory'],{manifestSha256:values['--manifest-sha256']}),body=jsonBytes(result);
  await writeFile(resolve(values['--out']),body,{flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({schema:ADOPTION_INSPECTION_SCHEMA+'.receipt',result:{bytes:body.length,sha256:digest(body)},selection:result.selection})+'\n');
 }catch(error){process.stderr.write(JSON.stringify({error:{code:error.code??'ADOPTION_HANDOVER_INSPECTION_FAILED'}})+'\n');process.exitCode=1;}
}
