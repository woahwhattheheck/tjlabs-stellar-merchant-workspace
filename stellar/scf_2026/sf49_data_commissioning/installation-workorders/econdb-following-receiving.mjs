#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/** Following source edition in the SAME customer Installation and receiving operation. */
import {resolve,join,dirname,isAbsolute,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {lstat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {regular,operationLease} from '../../../scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import {reopenEcondbAnyPreparation} from './econdb-installation/following-service.mjs';
import {openEcondbTransfer} from './econdb-installation/source.mjs';
import {receiveOperator,operatorStatus} from '../econdb/operator.mjs';
import {verifyProject} from '../econdb/maritime-project-native.mjs';
import {verifyEcondbFollowingNative} from './econdb-following-native.mjs';
import {retainEcondbInstallationFile as retain,econdbReceivingNativeCommand as nativeCommand,
 ownEcondbReceivingDirectory as ownDirectory,copyEcondbReceivingOriginal as copyOriginal,
 readEcondbReceivingRetained as readRetained,econdbReceivingIdentity as identity,
 econdbReceivingSourceIdentity as sourceIdentity} from './econdb-installation-receiving.mjs';

export const ECONDB_FOLLOWING_RECEIVING='stellar-forge.econdb-installation-following.v1.receiving';
const SCHEMA=ECONDB_FOLLOWING_RECEIVING,BASE='stellar-forge.econdb-installation-complete-receiving.v1';
const ROOT=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
const CLI=join(ROOT,'stellar/scf_2026/sf47_budget_model/workspace/cli.py');
const HELPER=fileURLToPath(new URL('./econdb-installation-operations.py',import.meta.url));
const HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const encode=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const parse=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?
 Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
const need=(v,message)=>{if(!v)throw Object.assign(new Error(message),{code:'ECONDB_FOLLOWING_RECEIVING'});};
const contains=(a,b)=>{const r=relative(a,b);return !r||!isAbsolute(r)&&r!=='..'&&!r.startsWith('../');};
const ordinary=n=>typeof n==='string'&&n.length<=4096&&!/^[\/\\]|[\\:\u0000-\u001f]/.test(n)&&n.split('/').every(p=>p&&p!=='.'&&p!=='..');
async function exists(path){try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function options(input){
 const required=['schema','preparationDirectory','expectedPreparationSha256','operationsWorkspace','caseId',
  'receivingOperationsDirectory','receivingBeforeEcondbDirectory','receivingAfterEcondbDirectory','outputDirectory','actor','python'];
 need(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(k=>[...required,'save','savedRevision'].includes(k))&&
  required.every(k=>Object.hasOwn(input,k))&&input.schema===SCHEMA+'.input','Use the complete declared following receiving input.');
 const o={...input};
 const directories=['preparationDirectory','operationsWorkspace','receivingOperationsDirectory',
  'receivingBeforeEcondbDirectory','receivingAfterEcondbDirectory','outputDirectory'];
 for(const key of [...directories,'python'])
  need(typeof o[key]==='string'&&isAbsolute(o[key])&&resolve(o[key])===o[key]&&!o[key].includes('\0'),'Select canonical absolute original paths.');
 need(/^operation-[a-f0-9]{32}$/.test(o.caseId)&&HASH.test(o.expectedPreparationSha256)&&
  typeof o.actor==='string'&&o.actor.trim()&&o.actor.length<=160,'Select the actual original case, preparation and receiving operator.');
 for(let i=0;i<directories.length;i++)for(let j=i+1;j<directories.length;j++)
  need(!contains(o[directories[i]],o[directories[j]])&&!contains(o[directories[j]],o[directories[i]]),
   'Keep preparation, sender, independent destinations and retained outputs separate.');
 for(const key of directories.filter(k=>!['preparationDirectory','operationsWorkspace'].includes(k)))
  need(!contains(ROOT,o[key]),'Receive complete customer work outside the installed source.');
 if(o.save)need(o.savedRevision===undefined&&Object.keys(o.save).sort().join(',')==='note,requestId'&&
  UUID.test(o.save.requestId??'')&&typeof o.save.note==='string'&&o.save.note.trim()&&o.save.note.length<=12000,
  'Retain one explicit same-Installation save UUID and reason, or select its already saved revision.');
 else need(Number.isSafeInteger(o.savedRevision)&&o.savedRevision>=2,'Select the actual saved following Installation revision.');
 return o;
}

/** Additive continuation; no made-up source editions, customer input, or efficacy data. */
export async function runEcondbFollowingReceiving(input,{signal}={}){
 const o=options(input),out=await ownDirectory(o.outputDirectory);
 const lease=await operationLease(join(out,'econdb-following-receiving.lock'));
 const save=(name,v)=>retain(join(out,name),encode(v));
 const phase=async(name,work)=>{
  const path=join(out,name+'.json');if(await exists(path))return parse(await readRetained(path,128*1024*1024));
  signal?.throwIfAborted();const result=await work();await save(name+'.json',result);return result;
 };
 const native=(name,args,workspace=o.operationsWorkspace)=>nativeCommand({python:o.python,
  args:[CLI,'operations','--workspace',workspace,...args],outputDirectory:out,name,signal,leaseFds:[lease.fd]});
 const inspect=(name,args)=>nativeCommand({python:o.python,args:[HELPER,...args],outputDirectory:out,name,signal,leaseFds:[lease.fd]});
 let result,primary;
 try{
  await save('Following_Receiving_Arguments.json',o);
  await save('Following_Receiving_Source.json',{schema:SCHEMA+'.source',cli:await sourceIdentity(CLI),
   archiveHelper:await sourceIdentity(HELPER),receiver:await sourceIdentity(fileURLToPath(import.meta.url)),
   nativeBridge:await sourceIdentity(fileURLToPath(new URL('./econdb-following-native.mjs',import.meta.url))),
   python:await sourceIdentity(o.python)});
  const prepared=await reopenEcondbAnyPreparation({directory:o.preparationDirectory,signal,leaseFds:[lease.fd]});
  need(prepared.preparationSha256===o.expectedPreparationSha256&&prepared.following?.schema==='stellar-forge.econdb-installation-following.v1.prepared',
   'Select the exact complete following preparation.');
  const following=prepared.following,document=prepared.document,preview=prepared.preview;
  need(prepared.installationSource?.caseId===o.caseId&&same(document,following.document)&&same(preview,following.preview)&&
   preview.installationId===following.currentInstallation.id&&preview.expectedRevision===following.currentInstallation.revision&&
   preview.expectedVersion===following.currentCaseVersion,'Preserve the actual current Installation and native case binding.');
  const transferred=[],members=new Map();
  for(const row of [...prepared.inputs,...prepared.outputs,{name:'prepare-request.json'},{name:'preparation.json'}]){
   need(ordinary(row.name),'Keep ordinary complete original member paths.');
   if(members.has(row.name)){
    if(row.sha256)need(members.get(row.name).sha256===row.sha256&&members.get(row.name).bytes===row.bytes,'Repeated original member identities differ.');
    continue;
   }
   const expected=row.sha256?{bytes:row.bytes,sha256:row.sha256}:await identity(join(o.preparationDirectory,row.name));
   const received=await copyOriginal(join(o.preparationDirectory,row.name),join(out,'preparation',row.name),expected,signal);
   const saved={name:row.name,...received};members.set(row.name,saved);transferred.push(saved);
  }
  const required=['prior/source/econdb-workspace.zip','source/econdb-workspace.zip','source/native-snapshot.json',
   'ECONDB_FOLLOWING_NATIVE_INPUT.json','ECONDB_FOLLOWING.json','ECONDB_CUSTOMER_SOURCE.json',
   'installation-input.json','installation-preview-input.json','prior/prepare-request.json','prior/preparation.json',
   'commercial.json','COMMERCIAL.md','commercial.html'];
  need(required.every(n=>members.has(n)),'Retain both complete original preparations, archives and native proof.');
  const proofPath=join(out,'preparation','ECONDB_FOLLOWING_NATIVE_INPUT.json'),
   snapshotPath=join(out,'preparation','source','native-snapshot.json'),
   proof=parse(await regular(proofPath,64*1024*1024));
  need(same(proof.following,following)&&same(proof.following.document,document)&&
   proof.priorInstallation.id===preview.installationId,'The complete native proof differs.');
  const verified=await verifyEcondbFollowingNative({operationsWorkspace:o.operationsWorkspace,caseId:o.caseId,
   outputDirectory:out,python:o.python,proofPath,nativeSnapshotPath:snapshotPath,
   expectedProofSha256:members.get('ECONDB_FOLLOWING_NATIVE_INPUT.json').sha256,
   expectedSnapshotSha256:members.get('source/native-snapshot.json').sha256,signal,leaseFds:[lease.fd]});
  need(verified.followingSha256===following.sha256&&same(verified.document,document),'The actual original native proof differs.');
  // Retain stable source evidence; current preview is deliberately recomputed only before a new save.
  await save('Following_Verified_Binding.json',{schema:SCHEMA+'.native-binding',
   followingSha256:verified.followingSha256,comparisonSha256:verified.comparisonSha256,caseSource:verified.caseSource,
   priorInstallation:verified.priorInstallation,installation:verified.installation,proof:verified.proof,snapshot:verified.snapshot});
  let selectedRevision=o.savedRevision;
  if(o.save){
   const intent=await phase('Following_Save_Intent',async()=>{
    need(!verified.requiresCurrentPreview&&verified.nativePreview&&HASH.test(verified.nativePreview.previewSha256),
     'The current case changed before this following save. Retain its original review and prepare a new deliberate comparison.');
    return {requestId:o.save.requestId,actor:o.actor,note:o.save.note,installationId:preview.installationId,
     expectedVersion:preview.expectedVersion,expectedRevision:preview.expectedRevision,
     expectedPreviewSha256:verified.nativePreview.previewSha256,documentFile:'preparation/installation-input.json',
     documentSha256:members.get('installation-input.json').sha256,preview:verified.nativePreview};
   });
   need(intent.requestId===o.save.requestId&&intent.installationId===preview.installationId&&
    intent.documentSha256===members.get('installation-input.json').sha256,'Keep the exact original following save request.');
   const saved=await phase('Following_Save_Result',()=>native('following-installation-save',[
    'installation-save','--case',o.caseId,'--installation',intent.installationId,
    '--expected-version',String(intent.expectedVersion),'--expected-revision',String(intent.expectedRevision),
    '--document',join(out,intent.documentFile),'--expected-preview-sha256',intent.expectedPreviewSha256,
    '--request-id',intent.requestId,'--actor',intent.actor,'--note',intent.note]));
   need(saved.recordId===preview.installationId&&saved.revision===preview.expectedRevision+1,
    'The original writer must append exactly one edition of the same Installation.');
   selectedRevision=saved.revision;
  }
  need(selectedRevision===preview.expectedRevision+1,'Select the actual immediate successor produced by this exact preparation.');
  const installation={id:preview.installationId,revision:selectedRevision};
  const selected=await native('following-selected',['installation-show','--case',o.caseId,'--installation',installation.id,
   '--revision',String(installation.revision)]);
  need(selected.id===installation.id&&selected.revision===installation.revision&&HASH.test(selected.sha256)&&
   same(selected.preview.document,document)&&same(selected.preview.previous,verified.installation),
   'The saved following edition differs from the reviewed current Installation.');
  for(const [label,row]of [['prior',proof.priorInstallation],['current-before',proof.installation]]){
   const original=await native('following-'+label,['installation-show','--case',o.caseId,'--installation',row.id,'--revision',String(row.revision)]);
   const {current,...historical}=original;
   need(same(historical,row),'The original saved historical '+label+' Installation changed.');
  }
  const caseValue=await native('following-case',['show','--case',o.caseId]);
  need(caseValue.program?.id===o.caseId&&Array.isArray(caseValue.sources),'Open the complete original customer case.');
  const sourceIds=[...new Set([...(document.source?.sourceIds??[]),...(document.receiving?.sourceIds??[]),
   ...(document.payment?.termsSourceIds??[]),document.workshare?.sourceId,document.workshare?.packetSourceId].filter(Boolean))];
  const sources=sourceIds.map(id=>{const row=caseValue.sources.find(s=>s.id===id);need(row,'Missing original selected native source.');return{id:row.id,bytes:row.bytes,sha256:row.sha256};});
  const selection={schema:BASE+'.archive-selection',caseId:o.caseId,
   installation:{...installation,sha256:selected.sha256},document,sources};
  await save('Following_Archive_Selection.json',selection);
  const casePath=join(out,'Complete_Following_Installation.zip');
  const exported=await phase('Following_Case_Export',async()=>{
   if(!(await exists(casePath)))await native('following-export',['installation-export','--case',o.caseId,
    '--installation',installation.id,'--revision',String(installation.revision),'--output',casePath]);
   return{path:casePath,...await identity(casePath,320*1024*1024)};
  });
  need(same(await identity(casePath,320*1024*1024),{bytes:exported.bytes,sha256:exported.sha256}),'The original complete case archive changed.');
  const inspection=await inspect('following-archive-inspection',['--archive',casePath,'--selection',join(out,'Following_Archive_Selection.json')]);
  need(same(inspection.archive,{bytes:exported.bytes,sha256:exported.sha256}),'The native archive inspector selected different full bytes.');
  await save('Following_Case_Inspection.json',inspection);
  const receivedSources={};
  for(const [label,source,name,destination]of [
   ['before',proof.before,'prior/source/econdb-workspace.zip',o.receivingBeforeEcondbDirectory],
   ['after',proof.after,'source/econdb-workspace.zip',o.receivingAfterEcondbDirectory]]){
   const file=members.get(name),archivePath=join(out,'preparation',name);
   need(file.bytes===source.archive.bytes&&file.sha256===source.archive.sha256,'The full '+label+' archive differs.');
   const transfer=await openEcondbTransfer({archivePath,expectedArchiveSha256:source.archive.sha256,
    expectedArchiveBytes:source.archive.bytes,directory:join(out,'transfers',label),signal,leaseFds:[lease.fd]});
   need(transfer.manifest.workspaceId===source.workspace.id&&transfer.manifest.revision===source.workspace.revision,
    'The complete '+label+' original workspace identity differs.');
   await phase('Following_'+label+'_Import_Intent',async()=>({workspaceId:source.workspace.id,revision:source.workspace.revision,
    archive:{bytes:source.archive.bytes,sha256:source.archive.sha256},destination,project:source.project.record}));
   await receiveOperator({directory:transfer.directory,destination});
   const reopen=async()=>{
    const status=await operatorStatus(destination);
    need(status.workspace.id===source.workspace.id,'The independently received '+label+' workspace identity differs.');
    for(const original of transfer.status.records)
     need(same(status.records.find(r=>r.id===original.id),original),'The complete '+label+' source history changed.');
    const project=await verifyProject(join(destination,source.project.record.directory));
    need(project.input_sha256===source.project.inputSha256&&same(project.config,source.project.config),
     'The independently reopened '+label+' project differs.');
    return{workspaceId:status.workspace.id,revision:status.revision,project:source.project.record,
     projectInputSha256:project.input_sha256,originalRecords:transfer.status.records.length,records:status.records.length,
     originalArchive:{bytes:source.archive.bytes,sha256:source.archive.sha256},destination};
   };
   const first=await reopen(),cold=await reopen();need(same(first,cold),'The '+label+' complete project changed on cold reopen.');
   receivedSources[label]=cold;await save('Following_'+label+'_Cold_Reopen.json',cold);
  }
  const importIntent=await phase('Following_Case_Import_Intent',async()=>({
   requestId:'econdb-following-'+hash(encode({archive:exported.sha256,workspace:o.receivingOperationsDirectory,actor:o.actor})).slice(0,32),
   archiveSha256:exported.sha256,name:'Received Econdb following Installation',actor:o.actor}));
  const imported=await native('following-case-import',['import','--file',casePath,'--name',importIntent.name,
   '--actor',importIntent.actor,'--request-id',importIntent.requestId],o.receivingOperationsDirectory);
  need(typeof imported.id==='string'&&imported.id,'Retain the actual independently received original case.');
  const firstImport=await phase('Following_Case_Imported',async()=>imported);
  need(firstImport.id===imported.id,'Original case import replay returned another case.');
  const received=await native('following-recipient-selected',['installation-show','--case',imported.id,
   '--installation',installation.id,'--revision',String(installation.revision)],o.receivingOperationsDirectory);
  const cold=await native('following-recipient-cold',['installation-show','--case',imported.id,
   '--installation',installation.id,'--revision',String(installation.revision)],o.receivingOperationsDirectory);
  const stable=row=>({id:row.id,revision:row.revision,sha256:row.sha256,document:row.preview.document});
  need(same(stable(received),stable(selected))&&same(stable(cold),stable(selected)),
   'The complete following Installation changed on independent cold reopen.');
  await ownDirectory(join(out,'received'));
  const receivedArchive=join(out,'received','Complete_Received_Following_'+randomUUID()+'.zip');
  await native('following-recipient-export',['installation-export','--case',imported.id,'--installation',installation.id,
   '--revision',String(installation.revision),'--output',receivedArchive],o.receivingOperationsDirectory);
  const compared=await inspect('following-recipient-history',['--archive',casePath,
   '--selection',join(out,'Following_Archive_Selection.json'),'--received',receivedArchive,'--received-case',imported.id]);
  await save('received/History_'+hash(encode(compared))+'.json',compared);
  result={schema:SCHEMA,state:'COMPLETE',continuation:'Following edition of the original Econdb Installation',
   sourceReceivingComplete:true,original:{caseId:o.caseId,installation:{...installation,sha256:selected.sha256},
    priorInstallation:verified.priorInstallation,currentBefore:verified.installation,
    workshareCaseId:prepared.workshareCaseId,preparationSha256:prepared.preparationSha256,
    followingSha256:following.sha256,comparisonSha256:following.comparison.sha256},
   received:{caseId:imported.id,operationsDirectory:o.receivingOperationsDirectory,
    installation:{...installation,sha256:received.sha256},sources:receivedSources},
   completeCase:exported,files:transferred,requestIds:{save:o.save?.requestId??null,caseImport:importIntent.requestId},
   renderedUse:{performed:false,viewedByOperator:false,
    requirement:'Operate the actual following comparison, deliberate entry/field decisions, original Preview/Save/history and independent reopen; view exact desktop/narrow screens and every outgoing report/archive attachment. Native receiving alone is not visual acceptance.'}};
  await save('Econdb_Following_Complete_Receiving.json',result);
 }catch(error){primary=error;try{await save('following-error-'+randomUUID()+'.json',{schema:SCHEMA+'.error',
  at:new Date().toISOString(),code:error.code??error.name,message:String(error.message)});}catch{}}
 finally{try{await lease.close();}catch(error){primary=primary?new AggregateError([primary,error],'The original receiving lease did not close.'):error;}}
 if(primary)throw primary;
 return result;
}
export async function main(argv=process.argv.slice(2)){
 need(argv.length===2&&argv[0]==='--input','Use econdb-following-receive --input /absolute/private/following-receiving.json');
 const input=parse(await regular(resolve(argv[1]),8*1024*1024)),controller=new AbortController(),
  stop=()=>controller.abort(new Error('Original following receiving interrupted.'));
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{const result=await runEcondbFollowingReceiving(input,{signal:controller.signal});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');return 0;}
 finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
 main().then(code=>{process.exitCode=code;}).catch(error=>{
  process.stderr.write(JSON.stringify({state:'ERROR',code:error.code??error.name,message:error.message})+'\n');process.exitCode=1;
 });
