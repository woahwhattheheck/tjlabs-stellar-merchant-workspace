// MIT. Operates the original dossier store. Every scientific value is an explicit software training fixture.
import {parseArgs} from 'node:util';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {open,link,unlink,lstat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {privateDirectory,readBytes,parseJson,jsonBytes,digest,need,syncDirectory} from '../../node/store.mjs';
import {openDossierStore} from '../dossier.mjs';
import {openPortableFile,writePortableFile,portableEntries} from '../portable.mjs';
import {receiveComparison} from './receive.mjs';
import {hash,same} from './contracts.mjs';
import {exportAdoptionHandover} from './adoption-handover.mjs';
import {inspectAdoptionHandover} from './inspect-adoption-handover.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const SCHEMA='sf88-research-comparison-adoption-receiving/v1';
const FIXTURE='TRAINING FIXTURE — software receiving only; no actual actuarial evaluation or recommendation';
const LIMIT=256*1024*1024;
async function maybe(file,limit=LIMIT){try{return await readBytes(file,limit);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function saved(file){const bytes=await maybe(file);return bytes?parseJson(bytes):null;}
async function descriptor(file){
 const s=await lstat(file);need(s.isFile()&&!s.isSymbolicLink(),'ADOPTION_COURSE_ORDINARY_FILE_REQUIRED');
 const h=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(file)){bytes+=chunk.length;need(bytes<=LIMIT,'ADOPTION_COURSE_FILE_TOO_LARGE');h.update(chunk);}
 return{file,bytes,sha256:h.digest('hex')};
}
async function retain(file,bytes){
 const temp=join(dirname(file),'.adoption-'+randomUUID()+'.tmp');
 let handle;
 try{
  handle=await open(temp,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
  try{await link(temp,file);await syncDirectory(dirname(file));}
  catch(e){if(e.code!=='EEXIST')throw e;need((await readBytes(file,LIMIT)).equals(bytes),'ADOPTION_COURSE_FILE_CHANGED');}
 }finally{if(handle)await handle.close();await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 return{file,bytes:bytes.length,sha256:digest(bytes)};
}
async function retainJson(file,value){await retain(file,jsonBytes(value));return value;}
async function firstPortable(file,store,id,revision){
 const receiptFile=file+'.receipt.json';let receipt=await saved(receiptFile);
 if(!receipt){
  const existing=await maybe(file);
  receipt=existing?{file,bytes:existing.length,sha256:digest(existing)}:
   await writePortableFile(file,await store.exportStream(id,{compression:'gzip',revision}));
  receipt={file,bytes:receipt.bytes,sha256:receipt.sha256};
  await retainJson(receiptFile,receipt);
 }
 need(same(await descriptor(file),receipt),'ADOPTION_COURSE_PORTABLE_CHANGED');return receipt;
}
async function receivePortable(store,file,id){
 const before=await store.getMetadata(id).catch(e=>{if(e.code==='DOSSIER_NOT_FOUND')return null;throw e;});
 const stream=await openPortableFile(file);
 let result;try{result=await store.reopenStream(stream,{projection:'metadata'});}finally{stream.destroy();}
 need(result.id===id&&(!before||result.revision>=before.revision),'ADOPTION_COURSE_COLD_IDENTITY_CHANGED');return result;
}
async function paged(store,id,options){
 const rows=[];let offset=0,revision=options.revision;
 do{const p=await store.comparisonAdoptionSource(id,{...options,revision,offset,limit:2});
  revision??=p.revision;rows.push(...p.items);offset=p.nextOffset;
 }while(offset!==null);
 return rows;
}
async function lookup(store,id,request){return(await store.comparisonAdoption(id,{requestId:request.requestId})).adoption;}
async function reviewed(store,id,file,proposal){
 let input=await saved(file);
 if(!input){
  const existing=(await store.comparisonAdoption(id,{requestId:proposal.requestId})).adoption;
  if(existing)input={...existing.plan.request,previewSha256:existing.plan.previewSha256};
  else{
   const preview=await store.previewComparisonAdoption(id,proposal);
   need(preview.eligible,'ADOPTION_COURSE_PREVIEW_NOT_READY');
   await retainJson(file+'.preview.json',preview);
   input={...preview.plan.request,previewSha256:preview.previewSha256};
  }
  await retainJson(file,input);
 }
 // A request is frozen before dispatch; a cold retry can only use that full body.
 need(input.requestId===proposal.requestId&&same(input.actor,proposal.actor),'ADOPTION_COURSE_REQUEST_CHANGED');
 const result=await store.reviewComparisonAdoption(id,input);
 need(result.status==='COMPLETE','ADOPTION_COURSE_ADOPTION_NOT_COMPLETE');
 await retainJson(file+'.plan.json',result.plan);
 const generation=Math.max(result.plan.committedRevision,...result.progress.operations.map(o=>o.dossierRevision));
 const pinned=(await store.comparisonAdoption(id,{planId:result.planId,revision:generation})).adoption;
 need(pinned?.status==='COMPLETE','ADOPTION_COURSE_GENERATION_CHANGED');
 await retainJson(file+'.accepted.json',pinned);
 const before=(await store.getMetadata(id)).revision;
 const replay=await store.reviewComparisonAdoption(id,input);
 need(replay.duplicate&&replay.planId===result.planId&&
  (await store.getMetadata(id)).revision===before,'ADOPTION_COURSE_REPLAY_CHANGED');
 return{input,result:pinned,generation};
}
async function laterEdit(store,id,file,operationId){
 let intent=await saved(file);
 if(!intent){
  const current=await store.getMetadata(id);
  intent={schema:SCHEMA,dossierId:id,expectedRevision:current.revision,
   before:current.description,after:current.description+'\nIndependent author work preserved by '+operationId};
  await retainJson(file,intent);
 }
 let selected=await store.getMetadata(id,{revision:intent.expectedRevision+1}).catch(e=>{
  if(e.code==='REVISION_NOT_FOUND')return null;throw e;});
 if(!selected){
  await store.update(id,{description:intent.after,expectedRevision:intent.expectedRevision,projection:'metadata'});
  selected=await store.getMetadata(id,{revision:intent.expectedRevision+1});
 }
 need(selected.description===intent.after,'ADOPTION_COURSE_AUTHOR_EDIT_CHANGED');
 await retainJson(file+'.accepted.json',{dossierId:id,revision:selected.revision,description:selected.description});
 return selected.revision;
}

async function ownedChild(command,args){
 const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
 const stop=()=>child.kill('SIGTERM');process.once('SIGINT',stop);process.once('SIGTERM',stop);
 child.stdout.on('data',b=>{stdout+=b.toString('utf8');if(stdout.length>1048576)child.kill('SIGTERM');});
 child.stderr.on('data',b=>{stderr+=b.toString('utf8');if(stderr.length>1048576)child.kill('SIGTERM');});
 try{
  const result=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>accept({code,signal}));});
  need(result.code===0&&!result.signal&&stdout.length<=1048576&&stderr.length<=1048576,'ADOPTION_COURSE_ARCHIVE_RECEIVE_FAILED');
  return stdout;
 }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
const EXTRACT_HANDOVER=String.raw`
import hashlib,json,os,stat,sys,tempfile,zipfile,shutil
from pathlib import Path
archive,target,receipt_file=sys.argv[1:]
target=Path(target);receipt=json.loads(Path(receipt_file).read_bytes())
expected=[{"path":"manifest.json",**receipt["manifest"]},*receipt["files"]]
maximum=256*1024*1024
def need(value,message):
    if not value:raise ValueError(message)
def digest(path):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_size<=maximum,"Ordinary bounded original required")
        h=hashlib.sha256();size=0
        while True:
            b=os.read(fd,1048576)
            if not b:break
            size+=len(b);need(size<=maximum,"Original exceeds bound");h.update(b)
        after=os.fstat(fd);named=os.lstat(path)
        stamp=lambda s:(s.st_dev,s.st_ino,s.st_mode,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
        need(stamp(before)==stamp(after)==stamp(named) and size==before.st_size,"Original changed")
        return {"bytes":size,"sha256":h.hexdigest()}
    finally:os.close(fd)
need(digest(archive)=={k:receipt["archive"][k] for k in ("bytes","sha256")},"Selected archive changed")
need(len(expected)==20 and sum(r["bytes"] for r in expected)<=maximum,"Complete original inventory required")
stage=Path(tempfile.mkdtemp(prefix=".adoption-receive-",dir=target.parent))
try:
    with zipfile.ZipFile(archive) as z:
        infos=z.infolist()
        need([i.filename for i in infos]==[r["path"] for r in expected],"Complete ordered archive required")
        for info,row in zip(infos,expected):
            name=row["path"];parts=name.split("/")
            need(not name.startswith("/") and all(p not in ("",".","..") for p in parts) and "\\" not in name and ":" not in name,"Unsafe original member")
            need(not info.is_dir() and not info.flag_bits&1 and stat.S_ISREG(info.external_attr>>16) and stat.S_IMODE(info.external_attr>>16)==0o600 and info.file_size==row["bytes"],"Ordinary original member required")
            output=stage.joinpath(*parts);output.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
            h=hashlib.sha256();size=0
            fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,"wb") as outgoing,z.open(info) as incoming:
                while True:
                    b=incoming.read(1048576)
                    if not b:break
                    size+=len(b);need(size<=row["bytes"],"Member grew");h.update(b);outgoing.write(b)
                need(size==row["bytes"] and h.hexdigest()==row["sha256"],"Member changed")
                outgoing.flush();os.fsync(outgoing.fileno())
    need(digest(archive)=={k:receipt["archive"][k] for k in ("bytes","sha256")},"Archive changed during receive")
    manifest=json.loads((stage/"manifest.json").read_bytes())
    need(manifest["schema"]=="sf88-research-comparison-adoption-handover/v1" and manifest["selection"]==receipt["selection"] and manifest["files"]==receipt["files"],"Selected manifest differs")
    for directory,_,_ in os.walk(stage,topdown=False):
        fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(fd)
        finally:os.close(fd)
    if target.exists():
        need(target.is_dir() and not target.is_symlink(),"Original receiving directory changed")
        got=[]
        for directory,dirs,files in os.walk(target):
            for name in dirs:need(not Path(directory,name).is_symlink(),"Unexpected linked directory")
            for name in files:
                p=Path(directory,name);got.append(p.relative_to(target).as_posix())
        need(sorted(got)==sorted(r["path"] for r in expected),"Original received inventory changed")
        for row in expected:need(digest(target/row["path"])=={k:row[k] for k in ("bytes","sha256")},"Original received member changed")
    else:
        os.rename(stage,target)
        fd=os.open(target.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(fd)
        finally:os.close(fd)
    print(json.dumps({"members":len(expected),"archive":receipt["archive"],"selection":receipt["selection"]},sort_keys=True))
finally:
    if stage.exists():shutil.rmtree(stage)
`;
export async function receiveHandoverCourse({store,dossierId,directory,label,revision,planId,input,operationId,python,expectedCompleted,expectedStatus,originalRun}){
 const root=await privateDirectory(join(directory,'handovers',label)),exportDirectory=join(root,'original-export');
 const options={directory:exportDirectory,operationId:'adoption-handover-'+hash({operationId,label}),revision,planId,python};
 const exported=await exportAdoptionHandover(store,dossierId,options);
 const again=await exportAdoptionHandover(store,dossierId,options);
 need(same(exported,again),'ADOPTION_COURSE_HANDOVER_REPLAY_CHANGED');
 need(exported.status===expectedStatus&&exported.files.length===19,'ADOPTION_COURSE_HANDOVER_SELECTION_CHANGED');
 const receiptFile=join(exportDirectory,'handover-result.json'),membersDirectory=join(root,'received-members');
 const extraction=JSON.parse(await ownedChild(python,['-c',EXTRACT_HANDOVER,exported.archivePath,membersDirectory,receiptFile]));
 need(extraction.members===20&&same(extraction.selection,exported.selection),'ADOPTION_COURSE_HANDOVER_RECEIVE_CHANGED');
 const inspection=await inspectAdoptionHandover(membersDirectory,{manifestSha256:exported.manifest.sha256});
 const original=(await store.comparisonAdoption(dossierId,{planId,revision})).adoption;
 need(same(inspection.report,original)&&inspection.report.progress.completed===expectedCompleted,'ADOPTION_COURSE_HANDOVER_REPORT_CHANGED');
 need(inspection.returned.comparison.runs.some(r=>r.id===originalRun.runId&&same(r.raw,originalRun.raw)&&same(r.artifacts,originalRun.artifacts)),'ADOPTION_COURSE_HANDOVER_RETURNED_RUN_CHANGED');
 const inspectionFile=join(root,'complete-inspection.json');await retainJson(inspectionFile,inspection);
 const authorStoreDirectory=join(root,'received-author'),author=await openDossierStore(authorStoreDirectory);
 const returnedStoreDirectory=join(root,'received-contributor'),returned=await openDossierStore(returnedStoreDirectory);
 await receivePortable(author,join(membersDirectory,'author.research.json.gz'),dossierId);
 await receivePortable(returned,join(membersDirectory,'returned.research.json'),dossierId);
 const pinned=(await author.comparisonAdoption(dossierId,{planId,revision})).adoption;
 need(same(pinned,inspection.report),'ADOPTION_COURSE_HANDOVER_NATIVE_REPORT_CHANGED');
 const returnedHead=await returned.getMetadata(dossierId,{revision:inspection.returned.metadata.revision});
 need(returnedHead.id===inspection.returned.metadata.id,'ADOPTION_COURSE_HANDOVER_NATIVE_RETURN_CHANGED');
 const originalRaw=await returned.comparisonFile(dossierId,{revision:inspection.returned.metadata.revision,runId:originalRun.runId});
 need(originalRaw.bytes===originalRun.raw.bytes&&originalRaw.sha256===originalRun.raw.sha256,'ADOPTION_COURSE_HANDOVER_RAW_CHANGED');
 const source=await author.exportComparisonAdoption(dossierId,{planId,revision,format:'source'});
 const sourceHash=createHash('sha256');let sourceBytes=0;
 for await(const b of source.stream){sourceHash.update(b);sourceBytes+=b.length;}
 need(sourceBytes===exported.source.bytes&&sourceHash.digest('hex')===exported.source.sha256,'ADOPTION_COURSE_HANDOVER_SOURCE_CHANGED');
 // Continue a separate native receiving copy, leaving the delivered historical
 // author view intact for the actual browser inspection.
 const resumedStoreDirectory=join(root,'resumed-author'),resumed=await openDossierStore(resumedStoreDirectory);
 await receivePortable(resumed,join(membersDirectory,'author.research.json.gz'),dossierId);
 const applied=await reviewed(resumed,dossierId,join(root,'original-adoption-request.json'),input);
 need(applied.result.planId===planId&&applied.result.status==='COMPLETE','ADOPTION_COURSE_HANDOVER_RESUME_CHANGED');
 const run=applied.result.progress.mappings.find(m=>m.sourceKind==='runs');
 need(run,'ADOPTION_COURSE_HANDOVER_RUN_MAPPING_MISSING');
 const resumedRaw=await resumed.comparisonFile(dossierId,{revision:applied.generation,runId:run.targetId});
 need(resumedRaw.body.equals(originalRaw.body),'ADOPTION_COURSE_HANDOVER_RESUMED_RAW_CHANGED');
 const laterRevision=await laterEdit(resumed,dossierId,join(root,'later-recipient-edit.json'),operationId+'-'+label);
 const currentBefore=(await resumed.getMetadata(dossierId)).revision;
 await receivePortable(resumed,join(membersDirectory,'author.research.json.gz'),dossierId);
 const replay=await resumed.reviewComparisonAdoption(dossierId,input);
 need(replay.duplicate&&replay.status==='COMPLETE'&&(await resumed.getMetadata(dossierId)).revision===currentBefore&&currentBefore>=laterRevision,'ADOPTION_COURSE_HANDOVER_LATER_WORK_LOST');
 const finalArchive=await exportAdoptionHandover(store,dossierId,options);
 need(same(finalArchive,exported),'ADOPTION_COURSE_HANDOVER_FINAL_REPLAY_CHANGED');
 const files=[await descriptor(exported.archivePath),await descriptor(receiptFile),await descriptor(inspectionFile)];
 for(const row of [{path:'manifest.json',...exported.manifest},...exported.files]){
  const item=await descriptor(join(membersDirectory,row.path));
  need(item.bytes===row.bytes&&item.sha256===row.sha256,'ADOPTION_COURSE_HANDOVER_MEMBER_CHANGED');files.push(item);
 }
 const result={schema:SCHEMA+'.handover',label,operationId:options.operationId,dossierId,revision,planId,status:expectedStatus,
  directory:root,membersDirectory,authorStoreDirectory,returnedStoreDirectory,resumedStoreDirectory,
  inspectionFile,exported,files,resumedRevision:applied.generation,recipientEditRevision:laterRevision,
  checks:{completeTwentyMembers:true,exactNativeReport:true,completeLineage:true,exactReturnedSource:true,
   coldAuthorAndContributor:true,originalRequestResumeAndReplay:true,laterRecipientWorkPreserved:true,originalArchivePreserved:true}};
 await retainJson(join(root,'receiving-result.json'),result);return result;
}

export async function receiveComparisonAdoption({directory,operationId,reviewer,python=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3'}){
 directory=await privateDirectory(resolve(directory));
 need(typeof operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(operationId),'ADOPTION_COURSE_OPERATION_REQUIRED');
 need(typeof reviewer==='string'&&reviewer.trim().length>0&&reviewer.length<=150,'ADOPTION_COURSE_REVIEWER_REQUIRED');
 const outputs=await privateDirectory(join(directory,'outputs')),requests=await privateDirectory(join(directory,'requests'));
 const names=['dossier.mjs','portable.mjs','dossier-returns/source.mjs','dossier-returns/store.mjs','dossier-returns/engine.mjs',
  'comparison/contracts.mjs','comparison/model.mjs','comparison/store.mjs','comparison/render.mjs','comparison/receive.mjs',
  'comparison/adoption-contracts.mjs','comparison/adoption-model.mjs','comparison/adoption-store.mjs','comparison/adoption-receiving.mjs',
  'comparison/adoption-render.mjs','comparison/adoption-handover.mjs','comparison/inspect-adoption-handover.mjs',
  'comparison/adoption-handover-archive.py','comparison/adoption-handover-cli.mjs'];
 const source=[];
 for(const name of names){const body=await readBytes(join(ROOT,name),4*1024*1024);source.push({name,bytes:body.length,sha256:digest(body)});}
 await retainJson(join(directory,'intent.json'),{schema:SCHEMA,operationId,directory,reviewer,fixture:FIXTURE,source});
 const actor={id:'adoption-course-accepting-reviewer',name:reviewer};
 // The maintained original course supplies a complete native foreign branch,
 // including both protocol editions and all original files, without a new evaluator.
 const foreign=await receiveComparison({directory:join(directory,'foreign-course'),operationId:operationId+'-source',reviewer:reviewer+' — source author'});
 const foreignStore=await openDossierStore(foreign.storeDirectory),dossierId=foreign.dossierId;
 const baseRevision=foreign.operations[0].dossierRevision-1;
 const files=[];
 files.push(await firstPortable(join(outputs,'shared-ancestor.research.json.gz'),foreignStore,dossierId,baseRevision));
 const foreignPortable=foreign.files.find(f=>f.file.endsWith('original-dossier.research.json.gz'));
 need(foreignPortable,'ADOPTION_COURSE_ORIGINAL_RETURN_MISSING');
 need(same(await descriptor(foreignPortable.file),{file:foreignPortable.file,bytes:foreignPortable.bytes,sha256:foreignPortable.sha256}),'ADOPTION_COURSE_ORIGINAL_RETURN_CHANGED');
 const authorStoreDirectory=join(directory,'author-store'),author=await openDossierStore(authorStoreDirectory);
 await receivePortable(author,files[0].file,dossierId);
 const received=await author.receiveDossierReturnSource(dossierId,{input:createReadStream(foreignPortable.file),
  filename:'original-colleague.research.json.gz',contentType:'application/gzip',expectedSha256:foreignPortable.sha256});
 const returnedSource=received.source;await retainJson(join(directory,'returned-source.json'),returnedSource);
 const sourceId=returnedSource.id,selectedProtocol=foreign.caseVersionId;
 const cases=await paged(author,dossierId,{sourceId,section:'cases'});
 need(cases.some(r=>r.versionId===selectedProtocol)&&cases.some(r=>r.versionId===foreign.currentCaseVersionId),'ADOPTION_COURSE_PROTOCOL_INVENTORY_CHANGED');
 const incomingRuns=await paged(author,dossierId,{sourceId,caseVersionId:selectedProtocol,section:'runs'});
 const incomingRun=incomingRuns.find(r=>r.id===foreign.runId);need(incomingRun,'ADOPTION_COURSE_RUN_MISSING');
 const incomingRaw=await author.comparisonAdoptionFile(dossierId,{sourceId,runId:incomingRun.id});
 const incomingArtifact=incomingRun.artifacts[0];
 const incomingMember=await author.comparisonAdoptionFile(dossierId,{sourceId,runId:incomingRun.id,artifactId:incomingArtifact.id});
 need(incomingRaw.sha256===incomingRun.raw.sha256&&incomingMember.sha256===incomingArtifact.sha256,'ADOPTION_COURSE_ORIGINAL_FILE_CHANGED');
 files.push(await retain(join(outputs,'original-returned-run.json'),incomingRaw.body));
 files.push(await retain(join(outputs,'original-returned-member.csv'),incomingMember.body));
 const requestId='adoption-course-'+hash({operationId,phase:'original'});
 const initial={requestId,expectedRevision:baseRevision,actor,reviewedAt:'2026-10-13T00:10:00.000Z',
  reviewNote:FIXTURE+'; explicit original decision selects its full protocol/candidate/run/judgment dependency graph.',
  sourceId,caseVersionId:selectedProtocol,
  selection:{candidateVersionIds:[],runIds:[],judgmentVersionIds:[],decisionVersionIds:[foreign.decisionVersionId]},
  caseTarget:{mode:'NEW_CASE'},candidateTargets:[{sourceVersionId:foreign.candidateVersionId,mode:'NEW'}]};
 const adopted=await reviewed(author,dossierId,join(requests,'original.json'),initial);
 need(adopted.result.progress.total===5&&adopted.result.progress.completed===5,'ADOPTION_COURSE_DEPENDENCY_CLOSURE_CHANGED');
 const mappings=adopted.result.progress.mappings;
 const target=kind=>{const m=mappings.find(r=>r.sourceKind===kind);need(m,'ADOPTION_COURSE_MAPPING_MISSING');return m;};
 const mappedCase=target('cases'),mappedCandidate=target('candidates'),mappedRun=target('runs');
 const report=await author.comparisonReport(dossierId,{revision:adopted.generation,caseId:mappedCase.targetId,caseVersionId:mappedCase.targetVersionId});
 need(report.runs.length===1&&report.judgments.length===1&&report.decisions.length===1&&
  report.judgments[0].definition.reviewer===reviewer+' — source author','ADOPTION_COURSE_AUTHOR_ATTRIBUTION_CHANGED');
 const raw=await author.comparisonFile(dossierId,{revision:adopted.generation,runId:mappedRun.targetId});
 const member=await author.comparisonFile(dossierId,{revision:adopted.generation,runId:mappedRun.targetId,artifactId:incomingArtifact.id});
 need(raw.body.equals(incomingRaw.body)&&member.body.equals(incomingMember.body),'ADOPTION_COURSE_ADOPTED_BYTES_CHANGED');
 for(const format of ['html','json']){
  const rendered=await author.exportComparisonAdoption(dossierId,{planId:adopted.result.planId,revision:adopted.generation,format});
  files.push(await retain(join(outputs,'original-adoption.'+format),rendered.body));
 }
 for(const format of ['html','json','csv']){
  const rendered=await author.exportComparison(dossierId,{revision:adopted.generation,caseId:mappedCase.targetId,caseVersionId:mappedCase.targetVersionId,format});
  files.push(await retain(join(outputs,'adopted-comparison.'+format),rendered.body));
 }
 // Actual immutable native historical snapshots represent a stopped plan and an
 // accepted prefix. No fabricated event or mutation of original history is used.
 const planOnly=await firstPortable(join(outputs,'pending-plan.research.json.gz'),author,dossierId,adopted.result.plan.committedRevision);
 const prefixRevision=adopted.result.progress.operations[1].dossierRevision;
 const partial=await firstPortable(join(outputs,'accepted-prefix.research.json.gz'),author,dossierId,prefixRevision);
 files.push(planOnly,partial);
 let planHasUnacceptedRaw=false;
 const inspection=await openPortableFile(planOnly.file);
 try{for await(const entry of portableEntries(inspection))if(entry.kind==='blobs'&&entry.value.sha256===incomingRun.raw.sha256)planHasUnacceptedRaw=true;}
 finally{inspection.destroy();}
 need(!planHasUnacceptedRaw,'ADOPTION_COURSE_PENDING_RAW_NOT_ISOLATED');
 const pendingStoreDirectory=join(directory,'pending-cold-store'),pending=await openDossierStore(pendingStoreDirectory);
 await receivePortable(pending,planOnly.file,dossierId);
 const pendingCourse=await reviewed(pending,dossierId,join(requests,'pending-cold.json'),adopted.input);
 need(pendingCourse.result.planId===adopted.result.planId,'ADOPTION_COURSE_PENDING_PLAN_CHANGED');
 const pendingRaw=await pending.comparisonFile(dossierId,{revision:pendingCourse.generation,runId:mappedRun.targetId});
 need(pendingRaw.body.equals(incomingRaw.body),'ADOPTION_COURSE_COLD_RAW_FALLBACK_CHANGED');
 // A separate native receiving copy resumes an accepted prefix after unrelated
 // work. A new explicit plan is required; the original request never rebases.
 const partialStoreDirectory=join(directory,'partial-cold-store'),partialStore=await openDossierStore(partialStoreDirectory);
 await receivePortable(partialStore,partial.file,dossierId);
 const authorEditRevision=await laterEdit(partialStore,dossierId,join(requests,'independent-author-edit.json'),operationId);
 let interrupted=await saved(join(outputs,'needs-review.json'));
 if(!interrupted){
  const before=(await partialStore.getMetadata(dossierId)).revision;
  const outcome=await partialStore.reviewComparisonAdoption(dossierId,adopted.input);
  need(outcome.status==='NEEDS_REVIEW'&&outcome.progress.completed===2&&
   (await partialStore.getMetadata(dossierId)).revision===before,'ADOPTION_COURSE_STALE_PREFIX_CHANGED');
  interrupted=outcome;await retainJson(join(outputs,'needs-review.json'),interrupted);
 }
 need(interrupted.planId===adopted.result.planId&&interrupted.revision===authorEditRevision,'ADOPTION_COURSE_PREFIX_RECEIPT_CHANGED');
 const reviewFixture=await firstPortable(join(outputs,'needs-review.research.json.gz'),partialStore,dossierId,authorEditRevision);files.push(reviewFixture);
 const continuation={requestId:'adoption-course-'+hash({operationId,phase:'continuation'}),
  expectedRevision:authorEditRevision,actor,reviewedAt:'2026-10-13T00:11:00.000Z',
  reviewNote:FIXTURE+'; reviewed the complete remaining graph after preserving the separate author edit.',
  continuationOf:adopted.result.planId};
 const continued=await reviewed(partialStore,dossierId,join(requests,'continuation.json'),continuation);
 need(continued.result.progress.total===3&&continued.result.progress.completed===3,'ADOPTION_COURSE_CONTINUATION_PREFIX_CHANGED');
 need(continued.result.progress.mappings.filter(m=>m.mode==='ACCEPTED').length===2,'ADOPTION_COURSE_ACCEPTED_MAPPING_CHANGED');
 const old=(await partialStore.comparisonAdoption(dossierId,{planId:adopted.result.planId,revision:continued.generation})).adoption;
 need(old.status==='SUPERSEDED'&&old.successorPlanId===continued.result.planId,'ADOPTION_COURSE_SUPERSESSION_CHANGED');
 const continuedRun=continued.result.progress.mappings.find(m=>m.sourceKind==='runs');
 const continuedRaw=await partialStore.comparisonFile(dossierId,{revision:continued.generation,runId:continuedRun.targetId});
 need(continuedRaw.body.equals(incomingRaw.body),'ADOPTION_COURSE_CONTINUED_RAW_CHANGED');
 const preserved=await partialStore.getMetadata(dossierId,{revision:continued.generation});
 need(preserved.description===(await saved(join(requests,'independent-author-edit.json'))).after,'ADOPTION_COURSE_AUTHOR_EDIT_LOST');
 // Equivalent existing protocol/candidate reuse is an explicit second plan.
 const reuseId='adoption-course-'+hash({operationId,phase:'equivalent-reuse'});
 const existingReuse=(await author.comparisonAdoption(dossierId,{requestId:reuseId})).adoption;
 const reuse={requestId:reuseId,expectedRevision:existingReuse?.plan.request.expectedRevision??(await author.getMetadata(dossierId)).revision,
  actor,reviewedAt:'2026-10-13T00:12:00.000Z',reviewNote:FIXTURE+'; reuse the exact existing protocol and full candidate definition.',
  sourceId,caseVersionId:selectedProtocol,selection:initial.selection,
  caseTarget:{mode:'EXISTING',caseId:mappedCase.targetId,caseVersionId:mappedCase.targetVersionId},
  candidateTargets:[{sourceVersionId:foreign.candidateVersionId,mode:'EXISTING',targetVersionId:mappedCandidate.targetVersionId}]};
 const reused=await reviewed(author,dossierId,join(requests,'equivalent-reuse.json'),reuse);
 need(reused.result.progress.total===3&&reused.result.progress.mappings.filter(m=>m.mode==='EXISTING').length===2,'ADOPTION_COURSE_EQUIVALENT_REUSE_CHANGED');
 const finalPortable=await firstPortable(join(outputs,'complete-reviewed-continuation.research.json.gz'),partialStore,dossierId,continued.generation);
 files.push(finalPortable);
 const reopenedStoreDirectory=join(directory,'received-final-store'),reopened=await openDossierStore(reopenedStoreDirectory);
 await receivePortable(reopened,finalPortable.file,dossierId);await receivePortable(reopened,finalPortable.file,dossierId);
 const cold=(await reopened.comparisonAdoption(dossierId,{planId:continued.result.planId,revision:continued.generation})).adoption;
 need(same(cold,continued.result),'ADOPTION_COURSE_FULL_COLD_RECEIPT_CHANGED');
 const coldRaw=await reopened.comparisonFile(dossierId,{revision:continued.generation,runId:continuedRun.targetId});
 const coldMember=await reopened.comparisonFile(dossierId,{revision:continued.generation,runId:continuedRun.targetId,artifactId:incomingArtifact.id});
 need(coldRaw.body.equals(incomingRaw.body)&&coldMember.body.equals(incomingMember.body),'ADOPTION_COURSE_FULL_COLD_BYTES_CHANGED');
 const coldHead=(await reopened.getMetadata(dossierId)).revision;
 const coldReplay=await reopened.reviewComparisonAdoption(dossierId,continued.input);
 need(coldReplay.duplicate&&(await reopened.getMetadata(dossierId)).revision===coldHead,'ADOPTION_COURSE_FULL_COLD_REPLAY_CHANGED');
 const savedSource=await reopened.exportComparisonAdoption(dossierId,{planId:continued.result.planId,revision:continued.generation,format:'source'});
 const returnedHash=createHash('sha256');let returnedBytes=0;
 for await(const chunk of savedSource.stream){returnedBytes+=chunk.length;returnedHash.update(chunk);}
 need(returnedBytes===foreignPortable.bytes&&returnedHash.digest('hex')===foreignPortable.sha256,'ADOPTION_COURSE_FULL_ORIGINAL_RETURN_CHANGED');
 for(const format of ['html','json']){
  const result=await partialStore.exportComparisonAdoption(dossierId,{planId:continued.result.planId,revision:continued.generation,format});
  files.push(await retain(join(outputs,'continued-adoption.'+format),result.body));
 }
 // Paged full source and accepted receipts stay bound to one explicit revision.
 const sourceRows=await paged(reopened,dossierId,{sourceId,caseVersionId:selectedProtocol,section:'sources',revision:continued.generation});
 need(sourceRows.every(r=>r.status==='EXACT'),'ADOPTION_COURSE_SOURCE_BINDING_CHANGED');
 const authorFinal=await firstPortable(join(outputs,'author-with-browser-work.research.json.gz'),author,dossierId,reused.generation);
 files.push(authorFinal);
 const handovers=[];
 for(const selected of [
  {label:'pending-plan',store:author,revision:adopted.result.plan.committedRevision,planId:adopted.result.planId,input:adopted.input,expectedCompleted:0,expectedStatus:'NEEDS_REVIEW'},
  {label:'accepted-prefix',store:author,revision:prefixRevision,planId:adopted.result.planId,input:adopted.input,expectedCompleted:2,expectedStatus:'NEEDS_REVIEW'},
  {label:'completed-continuation',store:partialStore,revision:continued.generation,planId:continued.result.planId,input:continued.input,expectedCompleted:3,expectedStatus:'COMPLETE'}
 ]){
  const handover=await receiveHandoverCourse({...selected,dossierId,directory,operationId,python,
   originalRun:{runId:incomingRun.id,raw:incomingRun.raw,artifacts:incomingRun.artifacts}});
  handovers.push(handover);files.push(...handover.files,await descriptor(join(handover.directory,'receiving-result.json')));
 }
 need(handovers[2].exported.lineage.length===2&&handovers[2].exported.lineage[0].status==='SUPERSEDED'&&
  handovers[2].exported.lineage[1].planId===continued.result.planId,'ADOPTION_COURSE_HANDOVER_LINEAGE_CHANGED');
 for(const s of source){const body=await readBytes(join(ROOT,s.name),4*1024*1024);need(body.length===s.bytes&&digest(body)===s.sha256,'ADOPTION_COURSE_SOURCE_CHANGED');}
 const outcome={schema:SCHEMA,status:'ADOPTION_BACKEND_RECEIVING_COMPLETE',fixture:FIXTURE,operationId,directory,reviewer,
  authorStoreDirectory,pendingStoreDirectory,partialStoreDirectory,reopenedStoreDirectory,dossierId,sourceId,
  returnedSource,questionId:foreign.questionId,sourceEditionId:foreign.sourceEditionId,
  sourceCaseId:foreign.caseId,sourceCaseVersionId:selectedProtocol,
  browserSelection:{sourceId,caseVersionId:selectedProtocol,selection:initial.selection,caseTarget:{mode:'NEW_CASE'},candidateTargets:initial.candidateTargets},
  browserInterrupted:{portable:reviewFixture,dossierId,sourceId,planId:adopted.result.planId,requestId:adopted.input.requestId,
   originalRequest:adopted.input,revision:authorEditRevision,acceptedMappings:interrupted.progress.mappings,remainingOperations:3},
  unadoptedCaseVersionId:foreign.currentCaseVersionId,unadoptedCandidateVersionId:foreign.currentCandidateVersionId,
  authorRevision:reused.generation,originalPlanId:adopted.result.planId,originalRevision:adopted.generation,
  continuationPlanId:continued.result.planId,continuationRevision:continued.generation,
  reusePlanId:reused.result.planId,mappings:adopted.result.progress.mappings,
  continuedMappings:continued.result.progress.mappings,
  originalRun:{runId:incomingRun.id,raw:incomingRun.raw,artifacts:incomingRun.artifacts},
  source,files,handovers,checks:{completeDependencyGraph:true,originalAcceptingActorDistinct:true,originalReviewerPreserved:true,
   exactRawAndArtifacts:true,pendingSnapshotExcludesUnacceptedRaw:true,verifiedColdSourceFallback:true,
   originalRequestReplay:true,acceptedPrefixPreserved:true,unrelatedAuthorEditPreserved:true,
   explicitContinuation:true,equivalentDefinitionsReused:true,completePortableReopen:true,completeOriginalReturn:true},
  literalInspection:{status:'PENDING',instruction:'Open the actual adoption and comparison reports, original raw/member files, complete retained return and editable received dossier. Use browserSelection in the paired browser course on the author store. This backend receipt does not claim a browser or human review.'}};
 await retainJson(join(directory,'adoption-receiving-result.json'),outcome);return outcome;
}
export async function main(argv=process.argv.slice(2)){
 const {values:v}=parseArgs({args:argv,options:{directory:{type:'string'},python:{type:'string'},operation:{type:'string'},reviewer:{type:'string'},'lock-held':{type:'boolean',default:false}},strict:true});
 need(v.directory&&v.operation&&v.reviewer,'ADOPTION_COURSE_ARGUMENTS_REQUIRED');
 const directory=await privateDirectory(resolve(v.directory));
 if(!v['lock-held']){
  const args=['--no-fork','--nonblock',join(directory,'adoption-course.lock'),process.execPath,fileURLToPath(import.meta.url),...argv,'--lock-held'];
  const child=spawn('flock',args,{stdio:'inherit'}),stop=()=>child.kill('SIGTERM');process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{const result=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>accept({code,signal}));});
   need(result.code===0&&!result.signal,'ADOPTION_COURSE_CHILD_FAILED');
  }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}return;
 }
 const result=await receiveComparisonAdoption({directory,operationId:v.operation,reviewer:v.reviewer,...(v.python?{python:v.python}:{})});process.stdout.write(jsonBytes(result));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{
 process.stderr.write(JSON.stringify({error:error.code??'ADOPTION_COURSE_FAILED'})+'\n');process.exitCode=1;
});
