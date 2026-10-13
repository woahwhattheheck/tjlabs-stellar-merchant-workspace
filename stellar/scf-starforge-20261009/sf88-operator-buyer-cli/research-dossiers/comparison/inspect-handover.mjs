// MIT. Inspect complete comparison handovers using fixed installed Research source.
// This reader validates the original comparison domain and portable byte history.
// Full-dossier semantic receiving remains the original openDossierStore.reopenStream.
import {createReadStream,constants} from 'node:fs';
import {open,lstat,readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {need,object,digest,jsonBytes} from '../../node/store.mjs';
import {portableEntries,PORTABLE_LIMIT} from '../portable.mjs';
import {validateComparisonState,validateComparisonTransition,comparisonReport} from './model.mjs';
import {exportComparison} from './render.mjs';
import {same,id} from './contracts.mjs';
export const HANDOVER_SCHEMA='sf88-research-comparison-handover/v1';
export const INSPECTION_SCHEMA='sf88-research-comparison-handover-inspection/v1';
export const JSON_LIMIT=32*1024*1024;
export const ENGINE_FILES=['node/store.mjs','research-dossiers/portable.mjs',
 'research-dossiers/comparison/contracts.mjs','research-dossiers/comparison/model.mjs',
 'research-dossiers/comparison/render.mjs','research-dossiers/comparison/inspect-handover.mjs'];
export const DATA_FILES=['selection.json','dossier.research.json.gz','comparison.json','comparison.html','comparison.csv','README.md'];
export const README=Buffer.from('# Complete Research comparison handover\n\nOpen comparison.html for the frozen case, protocol, candidate versions, retained measurements, separate judgments and explicit decisions. comparison.csv is a convenience view; comparison.json retains the complete report model. The original dossier.research.json.gz contains every dossier revision and every retained source, raw run and artifact byte through the selected revision. Reference-only remote sources remain references with their original terms; they have not been downloaded.\n\nReceive this ZIP in the installed LDA Research handovers workspace for separate attributed staff review, exact Search selections, ordered Briefs and explicit colleague-return decisions. LDA does not change the original measurements or Research decisions. The fixed installed inspector validates comparison events, exact portable history/blob bytes and report equality without executing uploaded source. For complete native dossier semantic receiving, use the maintained Research workspace Open/portable receiving command with the original dossier member. Earlier protocols and candidate/judgment/decision editions remain retained.\n\nengine/ carries the exact fixed inspection source for independent inspection. It is not an installed runtime or the complete Research application. Use the original maintained Research application/distribution for native editing and the installed LDA host for colleague reviews. Inspect the actual full HTML, CSV, JSON, original portable and all carried source members before treating the handover as ready.\n','utf8');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const stamp=s=>[s.dev,s.ino,s.mode,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
export async function fileIdentity(file,{maximum=PORTABLE_LIMIT,expected}={}){
 const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const first=await handle.stat({bigint:true});need(first.isFile()&&first.size<=BigInt(maximum),'COMPARISON_HANDOVER_FILE_INVALID');
  const hash=createHash('sha256');let bytes=0;
  for await(const part of handle.createReadStream({autoClose:false})){bytes+=part.length;need(bytes<=maximum,'COMPARISON_HANDOVER_SIZE');hash.update(part);}
  need(stamp(first)===stamp(await handle.stat({bigint:true}))&&BigInt(bytes)===first.size,'COMPARISON_HANDOVER_FILE_CHANGED');
  const value={bytes,sha256:hash.digest('hex')};
  need(!expected||value.bytes===expected.bytes&&value.sha256===expected.sha256,'COMPARISON_HANDOVER_FILE_CHANGED');
  return value;
 }finally{await handle.close();}
}
async function ordinary(file,maximum){const info=await lstat(file);need(info.isFile()&&!info.isSymbolicLink()&&info.size<=maximum,'COMPARISON_HANDOVER_FILE_INVALID');return info;}
async function checkedBytes(directory,row,maximum=PORTABLE_LIMIT){
 const file=join(directory,row.path);await ordinary(file,maximum);await fileIdentity(file,{maximum,expected:row});
 const body=await readFile(file);need(body.length===row.bytes&&digest(body)===row.sha256,'COMPARISON_HANDOVER_FILE_CHANGED');return body;
}
const parse=body=>{try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}catch{need(false,'COMPARISON_HANDOVER_JSON_INVALID');}};
export async function inspectComparisonHandover(directory,{manifestSha256}={}){
 directory=resolve(directory);
 await ordinary(join(directory,'manifest.json'),1048576);
 const manifestRaw=await readFile(join(directory,'manifest.json'));
 need(manifestSha256===undefined||digest(manifestRaw)===manifestSha256,'COMPARISON_HANDOVER_MANIFEST_CHANGED');
 const manifest=parse(manifestRaw);
 need(object(manifest)&&Object.keys(manifest).sort().join(',')==='files,schema,selection'&&manifest.schema===HANDOVER_SCHEMA,'COMPARISON_HANDOVER_SCHEMA');
 const expectedNames=[...DATA_FILES,...ENGINE_FILES.map(p=>'engine/'+p)];
 need(Array.isArray(manifest.files)&&manifest.files.length===expectedNames.length,'COMPARISON_HANDOVER_INVENTORY');
 const files=new Map();
 for(const row of manifest.files){
  need(object(row)&&Object.keys(row).sort().join(',')==='bytes,path,sha256'&&expectedNames.includes(row.path)&&!files.has(row.path)&&
   Number.isSafeInteger(row.bytes)&&row.bytes>=0&&row.bytes<=PORTABLE_LIMIT&&/^[a-f0-9]{64}$/.test(row.sha256),'COMPARISON_HANDOVER_MEMBER_INVALID');
  files.set(row.path,row);
 }
 need(expectedNames.every(name=>files.has(name))&&manifest.files.reduce((n,f)=>n+f.bytes,0)<=PORTABLE_LIMIT,'COMPARISON_HANDOVER_SIZE');
 for(const file of ENGINE_FILES){
  const installed=await readFile(join(root,file)),carried=await checkedBytes(directory,files.get('engine/'+file),1048576);
  need(installed.equals(carried),'COMPARISON_HANDOVER_INSTALLED_ENGINE_MISMATCH');
 }
 const selection=parse(await checkedBytes(directory,files.get('selection.json'),1048576));
 need(object(selection)&&Object.keys(selection).sort().join(',')==='caseId,caseVersionId,dossierId,headSha256,operationId,questionId,revision,schema'&&
  selection.schema===HANDOVER_SCHEMA+'.selection'&&same(selection,manifest.selection)&&/^d_[a-f0-9-]{36}$/.test(selection.dossierId)&&
  Number.isSafeInteger(selection.revision)&&selection.revision>=1&&/^[a-f0-9]{64}$/.test(selection.headSha256),'COMPARISON_HANDOVER_SELECTION');
 for(const name of ['caseId','caseVersionId','operationId','questionId'])id(selection[name]);
 const staging=await mkdtemp(join(tmpdir(),'research-comparison-inspect-'));
 try{
  const meta=files.get('dossier.research.json.gz'),portable=join(directory,meta.path);
  await ordinary(portable,PORTABLE_LIMIT);await fileIdentity(portable,{expected:meta});
  const fields={},blobs=new Map(),requiredSources=new Map(),history=[];let last=null,previous=null,previousState=null,count=0,blobCount=0,total=0;
  for await(const record of portableEntries(createReadStream(portable))){
   if(record.kind==='field'){fields[record.key]=record.value;continue;}
   if(record.kind==='array'){fields[record.key]=record.count;continue;}
   if(record.kind==='versions'){
    const e=record.value,s=e?.state;
    need(object(e)&&Object.keys(e).sort().join(',')==='sha256,state'&&object(s)&&s.id===selection.dossierId&&
     s.revision===++count&&s.previous===previous&&digest(jsonBytes(s))===e.sha256&&jsonBytes(e).length<=8*1024*1024,'COMPARISON_HANDOVER_HISTORY');
    need(Array.isArray(s.questions)&&Array.isArray(s.editions),'COMPARISON_HANDOVER_STATE');
    for(const edition of s.editions)if(edition.mode==='retained'){const m=edition.raw;need(object(m)&&/^[a-f0-9]{64}$/.test(m.sha256)&&Number.isSafeInteger(m.bytes)&&m.bytes>=0&&m.bytes<=64*1024*1024,'COMPARISON_HANDOVER_SOURCE');const old=requiredSources.get(m.sha256);need(!old||old.bytes===m.bytes,'COMPARISON_HANDOVER_SOURCE');requiredSources.set(m.sha256,m);}
    validateComparisonTransition(previousState,s);
    previous=e.sha256;previousState=s;last=e;
    history.push({revision:s.revision,sha256:e.sha256,createdAt:s.updatedAt,change:s.change});
   }else if(record.kind==='blobs'){
    const b=record.value;need(object(b)&&/^[a-f0-9]{64}$/.test(b.sha256)&&typeof b.bodyBase64==='string','COMPARISON_HANDOVER_BLOB');
    const body=Buffer.from(b.bodyBase64,'base64');
    need(body.toString('base64')===b.bodyBase64&&body.length===b.bytes&&body.length<=64*1024*1024&&digest(body)===b.sha256,'COMPARISON_HANDOVER_BLOB');
    total+=body.length;need(total<=PORTABLE_LIMIT,'COMPARISON_HANDOVER_SIZE');
    const old=blobs.get(b.sha256);need(old===undefined||old.bytes===body.length,'COMPARISON_HANDOVER_BLOB');
    if(!old){await writeFile(join(staging,b.sha256),body,{flag:'wx',mode:0o600});blobs.set(b.sha256,{bytes:body.length,sha256:b.sha256});}
    blobCount++;
   }
  }
  need(fields.schema==='sf88-research-dossier-portable-v1'&&fields.id===selection.dossierId&&fields.versions===count&&fields.blobs===blobCount&&
   count===selection.revision&&last?.sha256===selection.headSha256,'COMPARISON_HANDOVER_PORTABLE_BINDING');
  const readContent=async m=>{need(blobs.get(m.sha256)?.bytes===m.bytes,'COMPARISON_HANDOVER_BLOB_MISSING');const body=await readFile(join(staging,m.sha256));need(body.length===m.bytes&&digest(body)===m.sha256,'COMPARISON_HANDOVER_BLOB');return body;};
  for(const m of requiredSources.values())need(blobs.get(m.sha256)?.bytes===m.bytes,'COMPARISON_HANDOVER_SOURCE_MISSING');
  await validateComparisonState(last.state,readContent);
  const report=comparisonReport(last.state,{caseId:selection.caseId,caseVersionId:selection.caseVersionId});
  need(report.case.definition.questionId===selection.questionId,'COMPARISON_HANDOVER_QUESTION');
  for(const format of ['json','html','csv']){
   const original=exportComparison(report,{format}),body=await checkedBytes(directory,files.get('comparison.'+format),JSON_LIMIT);
   need(Buffer.from(original.body).equals(body),'COMPARISON_HANDOVER_REPORT_CHANGED');
  }
  need((await checkedBytes(directory,files.get('README.md'),1048576)).equals(README),'COMPARISON_HANDOVER_README_CHANGED');
  await fileIdentity(portable,{expected:meta});
  return{schema:INSPECTION_SCHEMA,selection,manifest,manifestSha256:digest(manifestRaw),history,
   metadata:{id:last.state.id,revision:last.state.revision,title:last.state.title,description:last.state.description,
    questions:last.state.questions,editions:last.state.editions},
   report,blobs:[...blobs.values()],authority:'Original comparison validators and exact portable bytes. Full-dossier semantic receiving remains the original Research application.'};
 }finally{await rm(staging,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),values={};
  for(let i=0;i<args.length;i+=2){need(['--directory','--out','--manifest-sha256'].includes(args[i])&&args[i+1]!==undefined&&!values[args[i]],'COMPARISON_HANDOVER_ARGUMENTS');values[args[i]]=args[i+1];}
  need(values['--directory']&&values['--out'],'COMPARISON_HANDOVER_ARGUMENTS');
  const result=await inspectComparisonHandover(values['--directory'],{manifestSha256:values['--manifest-sha256']});
  const body=jsonBytes(result);need(body.length<=JSON_LIMIT,'COMPARISON_HANDOVER_PROJECTION_TOO_LARGE');
  await writeFile(resolve(values['--out']),body,{flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({schema:INSPECTION_SCHEMA+'.receipt',result:{bytes:body.length,sha256:digest(body)},selection:result.selection})+'\n');
 }catch(error){process.stderr.write(JSON.stringify({error:{code:error.code??'COMPARISON_HANDOVER_INSPECTION_FAILED'}})+'\n');process.exitCode=1;}
}
