// SPDX-License-Identifier: MIT
// One retained backup and destination. Scientific restoration stays in the original Python core.
import {constants} from 'node:fs';
import {open,lstat,link,unlink,readdir,mkdir} from 'node:fs/promises';
import {join,basename,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {acquireStateLease} from '../../merchant-fleet-gateway/state-lease.mjs';
import {put,exists,recoverPendingJSON,syncDir} from '../groundwater-report/common.mjs';
import {SCHEMA,HASH,UUID,SCIENCE,EXECUTED_ROOT,need,absolute,directory,readJSON,read,sha,hash,same,fields,text,
  inspectSelection,inspectScientificWorkspace,coreFor,fileIdentity,disjoint} from './source.mjs';

export const RECEIVING=SCHEMA+'.backup-receiving';
const controlRoot=selected=>join(selected.receivingDirectory,'groundwater-receivings');
const operationRoot=(selected,id)=>{
  need(UUID.test(id??''),'GROUNDWATER_RECEIVING_OPERATION','Use the same original receiving UUID.',422);
  return join(controlRoot(selected),id);
};
async function value(path,missing=false){
  if(missing&&!await exists(path))return null;
  return (await readJSON(path)).value;
}
const binding=selected=>({sourceSha256:selected.expectedSource,pythonIdentity:selected.expectedPython,
  originalWorkspaceIdentity:selected.expectedWorkspace,receivingRootIdentity:selected.expectedReceiving});
const scientificBinding=(selected,scientific)=>({...binding(selected),scientific});
function previewValue(packageValue,path){
  need(packageValue.manifest?.kind==='workspace_backup'&&typeof packageValue.manifest.workspace_id==='string',
    'GROUNDWATER_BACKUP_REQUIRED','Select a complete original workspace backup, not a report export.',422);
  return {schema:RECEIVING+'.preview',archive:{path,bytes:packageValue.archive.bytes,sha256:packageValue.archive.sha256},
    manifestSha256:packageValue.manifest_sha256,manifest:packageValue.manifest,files:packageValue.files,
    expandedBytes:packageValue.expanded_bytes,workspaceId:packageValue.manifest.workspace_id,
    backupId:packageValue.manifest.backup_id??null};
}
export async function inspectBackup(selected,path){
  await inspectSelection(selected);absolute(path,'complete original backup');
  const packageValue=await coreFor(selected).inspectPackage(path);
  const preview=previewValue(packageValue,path);
  await fileIdentity(path,{expected:preview.archive});
  return {...preview,reviewSha256:hash(preview)};
}
function validateInput(input){
  fields(input,['operationId','actor','reason','preview'],'backup receiving request');
  need(UUID.test(input.operationId??''),'GROUNDWATER_RECEIVING_OPERATION','Retain the original receiving UUID.',422);
  text(input.actor,'receiving operator',200);text(input.reason,'receiving purpose',4000);
  fields(input.preview,['schema','archive','manifestSha256','manifest','files','expandedBytes','workspaceId','backupId','reviewSha256'],'complete backup preview');
  const {reviewSha256,...preview}=input.preview;
  need(preview.schema===RECEIVING+'.preview'&&HASH.test(reviewSha256??'')&&hash(preview)===reviewSha256,
    'GROUNDWATER_BACKUP_REVIEW_CHANGED','Review the exact complete backup before receiving it.',422);
  fields(preview.archive,['path','bytes','sha256'],'original archive identity');
  absolute(preview.archive.path);need(Number.isSafeInteger(preview.archive.bytes)&&preview.archive.bytes>0&&
    preview.archive.bytes<=2*1024**3&&HASH.test(preview.archive.sha256??''),
    'GROUNDWATER_BACKUP_REVIEW_CHANGED','Keep the original backup byte count and digest.',422);
  return input;
}
async function requestFor(selected,input){
  validateInput(input);const currentSelection=await inspectSelection(selected);
  const root=operationRoot(selected,input.operationId),destination=join(root,'restored');
  need(disjoint(destination,input.preview.archive.path),'GROUNDWATER_RECEIVING_ARCHIVE_PATH','Keep the incoming original outside its new destination.');
  await directory(controlRoot(selected),{create:true});await directory(root,{create:true});
  const file=join(root,'request.json'),body={operationId:input.operationId,actor:input.actor,reason:input.reason,
    preview:input.preview,destination,binding:scientificBinding(selected,currentSelection.source.scientific)},requestSha256=hash(body);
  let saved=await value(file,true);
  if(!saved){
    saved=await recoverPendingJSON(file,item=>item.schema===RECEIVING+'.request'&&item.requestSha256===requestSha256&&same(item.body,body));
    if(!saved){
      need((await readdir(root)).length===0,'GROUNDWATER_RECEIVING_INTENT_UNAVAILABLE',
        'This original receiving directory has lost its request. Preserve its files before continuing.');
      const actual=await inspectBackup(selected,input.preview.archive.path);
      need(same(actual,input.preview),'GROUNDWATER_BACKUP_REVIEW_CHANGED','The original backup changed after review.');
      saved={schema:RECEIVING+'.request',requestSha256,createdAt:new Date().toISOString(),body};
      await put(file,saved);
    }
  }
  need(saved.schema===RECEIVING+'.request'&&saved.requestSha256===requestSha256&&hash(saved.body)===requestSha256&&same(saved.body,body),
    'GROUNDWATER_RECEIVING_REQUEST_CHANGED','Continue the same receiving ID with its exact original backup, operator and destination.');
  return {root,request:saved};
}
async function readRequest(selected,id,{allowCompleted=false,observed}={}){
  const root=operationRoot(selected,id),requestPath=join(root,'request.json');
  need(await exists(requestPath),'GROUNDWATER_RECEIVING_REQUEST_MISSING','The original receiving request has not yet been published in this directory.',404);
  const request=await value(requestPath);
  need(request.schema===RECEIVING+'.request'&&request.body.operationId===id&&hash(request.body)===request.requestSha256&&
    request.body.destination===join(root,'restored'),
    'GROUNDWATER_RECEIVING_REQUEST_CHANGED','Use the original receiving source, workspace and request.');
  const current=observed??await inspectSelection(selected),selectedBinding=scientificBinding(selected,current.source.scientific);
  const previous=request.body.binding,completed=allowCompleted&&await exists(join(root,'result.json'));
  const compatible=previous&&same(previous.scientific,selectedBinding.scientific)&&
    previous.originalWorkspaceIdentity===selectedBinding.originalWorkspaceIdentity&&previous.receivingRootIdentity===selectedBinding.receivingRootIdentity;
  need(completed?compatible:same(previous,selectedBinding),'GROUNDWATER_RECEIVING_REQUEST_CHANGED',
    completed?'The original scientific contract, study or receiving directory differs.':'Continue the unfinished original receiving with its exact source and Python binding.');
  validateInput({operationId:id,actor:request.body.actor,reason:request.body.reason,preview:request.body.preview});
  return {root,request};
}
/** Resume only a prefix proven byte-identical to the original. Publish after full verification. */
async function retainArchive(source,target,expected){
  if(await exists(target))return fileIdentity(target,{expected});
  const temporary=join(dirname(target),'.original-archive.partial');
  if(await exists(temporary)){
    const saved=await lstat(temporary,{bigint:true});
    need(saved.isFile()&&!saved.isSymbolicLink()&&!(saved.mode&0o077n)&&saved.uid===BigInt(process.getuid()),
      'GROUNDWATER_RECEIVING_PARTIAL_CHANGED','The original archive staging file is not owned by this receiver.');
    if(saved.size===BigInt(expected.bytes)){
      await fileIdentity(temporary,{expected});
      try{await link(temporary,target);}catch(error){if(error.code!=='EEXIST')throw error;await fileIdentity(target,{expected});}
      await syncDir(dirname(target));
      const current=await lstat(temporary,{bigint:true});
      need(current.dev===saved.dev&&current.ino===saved.ino,'GROUNDWATER_RECEIVING_PARTIAL_CHANGED','The original staging path was replaced.');
      await unlink(temporary);await syncDir(dirname(target));
      return fileIdentity(target,{expected});
    }
  }
  await fileIdentity(source,{expected});
  const sourceHandle=await open(source,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let destination;
  try{
    try{destination=await open(temporary,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);}
    catch(error){if(error.code!=='EEXIST')throw error;destination=await open(temporary,constants.O_RDWR|(constants.O_NOFOLLOW??0));}
    const first=await destination.stat({bigint:true});
    need(first.isFile()&&first.size<=BigInt(expected.bytes)&&!(first.mode&0o077n)&&first.uid===BigInt(process.getuid()),
      'GROUNDWATER_RECEIVING_PARTIAL_CHANGED','The original partial archive is not an owned regular prefix.');
    const sourceBefore=await sourceHandle.stat({bigint:true});
    const sourceBuffer=Buffer.alloc(256*1024),heldBuffer=Buffer.alloc(256*1024),digest=createHash('sha256');
    let position=0;
    while(position<expected.bytes){
      const wanted=Math.min(sourceBuffer.length,expected.bytes-position);
      const {bytesRead}=await sourceHandle.read(sourceBuffer,0,wanted,position);
      need(bytesRead===wanted,'GROUNDWATER_BACKUP_CHANGED','The original backup ended during retention.');
      digest.update(sourceBuffer.subarray(0,bytesRead));
      const overlap=Math.max(0,Math.min(bytesRead,Number(first.size)-position));
      if(overlap){
        const observed=await destination.read(heldBuffer,0,overlap,position);
        need(observed.bytesRead===overlap&&heldBuffer.subarray(0,overlap).equals(sourceBuffer.subarray(0,overlap)),
          'GROUNDWATER_RECEIVING_PARTIAL_CHANGED','The retained archive prefix differs from the original backup.');
      }
      let written=overlap;
      while(written<bytesRead){
        const part=await destination.write(sourceBuffer,written,bytesRead-written,position+written);
        need(part.bytesWritten>0,'GROUNDWATER_RECEIVING_WRITE','The original archive could not be retained.');
        written+=part.bytesWritten;
      }
      position+=bytesRead;
    }
    const sourceAfter=await sourceHandle.stat({bigint:true}),named=await lstat(source,{bigint:true});
    need(['dev','ino','size','mtimeNs','ctimeNs'].every(key=>sourceBefore[key]===sourceAfter[key]&&sourceAfter[key]===named[key])&&
      !named.isSymbolicLink()&&digest.digest('hex')===expected.sha256,
      'GROUNDWATER_BACKUP_CHANGED','The incoming original changed during retention.');
    await destination.sync();
    const held=await destination.stat({bigint:true}),namedTemporary=await lstat(temporary,{bigint:true});
    need(held.dev===first.dev&&held.ino===first.ino&&held.size===BigInt(expected.bytes)&&
      namedTemporary.dev===held.dev&&namedTemporary.ino===held.ino&&!namedTemporary.isSymbolicLink(),
      'GROUNDWATER_RECEIVING_PARTIAL_CHANGED','The owned archive staging file changed.');
    try{await link(temporary,target);}catch(error){if(error.code!=='EEXIST')throw error;await fileIdentity(target,{expected});}
    await syncDir(dirname(target));
    const current=await lstat(temporary,{bigint:true});
    need(current.dev===held.dev&&current.ino===held.ino,'GROUNDWATER_RECEIVING_PARTIAL_CHANGED','The archive staging path was replaced.');
    await unlink(temporary);await syncDir(dirname(target));
  }finally{await sourceHandle.close();if(destination)await destination.close();}
  return fileIdentity(target,{expected});
}
async function verifyReceivedFiles(root,preview){
  const directoryName=join(root,'restored','received');
  for(const row of preview.manifest.files){
    need(typeof row.path==='string'&&!row.path.startsWith('/')&&!row.path.includes('\\')&&
      row.path.split('/').every(part=>part&&part!=='.'&&part!=='..'),'GROUNDWATER_RECEIVING_MANIFEST','Keep original contained members.');
    await fileIdentity(join(directoryName,row.path),{expected:row});
  }
  const manifest=await fileIdentity(join(directoryName,'manifest.json'));
  need(manifest.sha256===preview.manifestSha256,'GROUNDWATER_RECEIVING_MANIFEST','The original received manifest is unavailable or changed.');
}
async function verifyComplete(selected,op,result){
  need(result.schema===RECEIVING+'.result'&&result.operationId===op.request.body.operationId&&
    result.requestSha256===op.request.requestSha256&&result.state==='complete'&&
    result.source?.sha256===op.request.body.binding.sourceSha256&&same(result.source?.scientific,op.request.body.binding.scientific),
    'GROUNDWATER_RECEIVING_RESULT_CHANGED','The original receiving result belongs to another request.');
  const preview=op.request.body.preview,archive=join(op.root,'archive.zip');
  await fileIdentity(archive,{expected:preview.archive});
  const original=previewValue(await coreFor(selected).inspectPackage(archive),preview.archive.path);
  need(hash(original)===preview.reviewSha256,'GROUNDWATER_RECEIVING_MANIFEST','The retained full backup changed.');
  await verifyReceivedFiles(op.root,preview);
  const nativeNames=['restored.json','restore-request.json','working-copy.json',
    'received/receiving-request.json','received/receiving.json','received/manifest.json'];
  need(Array.isArray(result.nativeFiles)&&result.nativeFiles.length===nativeNames.length&&
    nativeNames.every((name,index)=>result.nativeFiles[index]?.path===join(op.root,'restored',name)),
    'GROUNDWATER_RECEIVING_RESULT_CHANGED','The original native receipt set changed.');
  for(const item of result.nativeFiles)await fileIdentity(item.path,{expected:item});
  const native=await value(join(op.root,'restored','restored.json'));
  need(same(native,result.native)&&native.workspace_id===preview.workspaceId&&
    native.archive_sha256===preview.archive.sha256&&native.workspace===join(op.root,'restored','workspace'),
    'GROUNDWATER_RECEIVING_RESULT_CHANGED','The original native restore receipt changed.');
  const current=await inspectScientificWorkspace(native.workspace,{expectedIdentity:result.workspace.sha256});
  const state=await coreFor(selected,native.workspace).state();
  need(state.workspace.id===preview.workspaceId&&state.workspace.created===current.workspace.created,
    'GROUNDWATER_RECEIVING_WORKSPACE_CHANGED','The received working database has another original identity.');
  return {request:op.request,result,current:{workspace:state.workspace,identity:current,
    projects:state.projects.map(item=>({id:item.id,name:item.name,version:item.version})),
    compatibility:{scientific:op.request.body.binding.scientific,historicalSourceSha256:op.request.body.binding.sourceSha256,
      currentSourceSha256:selected.expectedSource,historicalPythonIdentity:op.request.body.binding.pythonIdentity,
      currentPythonIdentity:selected.expectedPython,completedOriginalPreserved:true}}};
}
export async function receiveBackup(selected,input){
  const op=await requestFor(selected,input),lease=await acquireStateLease(op.root);
  try{
    lease.assertHeld();
    const resultPath=join(op.root,'result.json');
    const old=await value(resultPath,true)||await recoverPendingJSON(resultPath,
      item=>item.schema===RECEIVING+'.result'&&item.operationId===input.operationId&&item.requestSha256===op.request.requestSha256);
    if(old)return verifyComplete(selected,op,old);
    const preview=op.request.body.preview,archive=join(op.root,'archive.zip');
    await retainArchive(preview.archive.path,archive,preview.archive);
    lease.assertHeld();
    const selectedPackage=previewValue(await coreFor(selected).inspectPackage(archive),preview.archive.path);
    need(hash(selectedPackage)===preview.reviewSha256,'GROUNDWATER_BACKUP_REVIEW_CHANGED','The retained original package differs from its reviewed source.');
    // The original create-only helper retains its own archive/destination/receipt.
    // An interrupted call reopens that exact destination; it never allocates another.
    const native=await coreFor(selected).restore(archive,op.request.body.destination);
    need(native.workspace_id===preview.workspaceId&&native.archive_sha256===preview.archive.sha256&&
      native.workspace===join(op.root,'restored','workspace')&&native.automatic_run===false,
      'GROUNDWATER_RECEIVING_NATIVE_RESULT','The original restore returned a different workspace or archive.');
    const workspace=await inspectScientificWorkspace(native.workspace);
    const nativeFiles=[];
    for(const relative of ['restored.json','restore-request.json','working-copy.json',
      'received/receiving-request.json','received/receiving.json','received/manifest.json'])
      nativeFiles.push(await fileIdentity(join(op.root,'restored',relative)));
    const result={schema:RECEIVING+'.result',state:'complete',operationId:input.operationId,
      requestSha256:op.request.requestSha256,completedAt:new Date().toISOString(),archive:await fileIdentity(archive,{expected:preview.archive}),
      native,workspace,nativeFiles,source:{sha256:selected.expectedSource,scientific:op.request.body.binding.scientific,scientificApplication:join(EXECUTED_ROOT,SCIENCE)},
      automaticRun:false};
    lease.assertHeld();await put(join(op.root,'result.json'),result);
    return verifyComplete(selected,op,result);
  }catch(error){
    await put(join(op.root,'observations',Date.now()+'-'+randomUUID()+'.json'),
      {observedAt:new Date().toISOString(),operationId:input.operationId,
        error:{code:error.code??'GROUNDWATER_RECEIVING_INTERRUPTED',message:String(error.message)}});
    throw error;
  }finally{await lease.close();}
}
export async function continueReceiving(selected,id){
  const op=await readRequest(selected,id,{allowCompleted:true}),result=await value(join(op.root,'result.json'),true);
  if(result)return verifyComplete(selected,op,result);
  return receiveBackup(selected,{operationId:id,actor:op.request.body.actor,reason:op.request.body.reason,preview:op.request.body.preview});
}
export async function inspectReceiving(selected,id){
  const observed=await inspectSelection(selected);const op=await readRequest(selected,id,{allowCompleted:true,observed}),result=await value(join(op.root,'result.json'),true);
  if(result)return verifyComplete(selected,op,result);
  return {request:op.request,result:null,current:null,recordedState:await exists(join(op.root,'archive.zip'))?'archive_retained':'pending_original_archive'};
}
export async function listReceiving(selected){
  const root=controlRoot(selected);if(!await exists(root))return [];
  await directory(root);const rows=[],observed=await inspectSelection(selected);
  for(const id of (await readdir(root)).filter(name=>UUID.test(name)).sort()){
    try{
      const op=await readRequest(selected,id,{allowCompleted:true,observed}),result=await value(join(op.root,'result.json'),true);
      rows.push({operationId:id,actor:op.request.body.actor,reason:op.request.body.reason,createdAt:op.request.createdAt,
        workspaceId:op.request.body.preview.workspaceId,archive:op.request.body.preview.archive,
        destination:op.request.body.destination,recordedState:result?'complete':'pending',verified:false});
    }catch(error){rows.push({operationId:id,recordedState:'unavailable',verified:false,error:{code:error.code,message:error.message}});}
  }
  return rows;
}
export async function originalArchive(selected,id){
  const row=await inspectReceiving(selected,id);
  need(row.result,'GROUNDWATER_RECEIVING_INCOMPLETE','Continue the original receiving before downloading its retained complete backup.');
  return {...row.result.archive,filename:basename(row.request.body.preview.archive.path)};
}
