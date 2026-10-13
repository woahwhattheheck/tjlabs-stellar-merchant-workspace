// MIT. Complete Support handover export and receiving through the original source engine.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,readdir,unlink} from 'node:fs/promises';
import {resolve,join,dirname,isAbsolute,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {atomicBytes,acceptStream,readBytes,within} from '../../sf30-seller-sdk/duckdb/cloud-delivery/files.mjs';
import {acquireStateLease} from '../../merchant-fleet-gateway/state-lease.mjs';
import {inspectOAuthOperatingSourcePackage,receiveOAuthOperatingSource} from '../../sf74-merchant-support-console/oauth-operating-source.mjs';
import {createSupportOperatingHandover,receiveSupportOperatingHandover,supportHandoverError,
  supportHandoverJSON,SUPPORT_HANDOVER_MAX_DOCUMENT_BYTES,SUPPORT_HANDOVER_MAX_ARCHIVE_BYTES} from './support-operating-handover.mjs';
import {prepareSupportHandoverArchive,readSupportHandoverArchive} from './support-operating-handover-archive.mjs';

const need=(ok,message)=>{if(!ok)throw supportHandoverError('SUPPORT_HANDOVER_NATIVE',message);};
const stop=signal=>signal?.throwIfAborted();
const json=value=>Buffer.from(supportHandoverJSON(value));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b,label)=>need(isDeepStrictEqual(a,b),label+' differs from the retained original selection.');
function absolute(value,label){
  need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&!value.includes('\0'),label+' must be an exact normalized absolute path.');return value;
}
async function directory(path,create=false){
  absolute(path,'Private directory');
  if(create){
    let ancestor=path;for(;;){try{await lstat(ancestor);break;}catch(e){if(e.code!=='ENOENT')throw e;const next=dirname(ancestor);need(next!==ancestor,'No existing directory ancestor.');ancestor=next;}}
    need(await realpath(ancestor)===ancestor,'Directory ancestors must not redirect through symlinks.');await mkdir(path,{recursive:true,mode:0o700});
  }
  const stat=await lstat(path);need(stat.isDirectory()&&!stat.isSymbolicLink()&&await realpath(path)===path&&
    (process.platform==='win32'||!(stat.mode&0o077)),'Use a real private directory.');
  return path;
}
async function owned(root,signal,work){
  await directory(root,true);const owner=join(root,'.handover-owner');await directory(owner,true);
  stop(signal);const lease=await acquireStateLease(owner);
  try{stop(signal);return await work(lease);}finally{await lease.close();}
}
async function optional(path,maximum=SUPPORT_HANDOVER_MAX_DOCUMENT_BYTES){
  try{return await readBytes(path,maximum);}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
function parse(bytes,label){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}catch{throw supportHandoverError('SUPPORT_HANDOVER_JSON',label+' is not complete UTF-8 JSON.');}}
async function put(root,name,bytes,signal){stop(signal);const path=await within(root,name,true);await atomicBytes(path,bytes);stop(signal);return {path:name,bytes:bytes.length,sha256:sha(bytes)};}
async function retainRequest(root,value,signal){
  const bytes=json(value);need(bytes.length<=SUPPORT_HANDOVER_MAX_DOCUMENT_BYTES,'The complete retained request exceeds 256 MiB.');
  const hash=sha(bytes),binding='REQUEST.'+hash+'.json',names=await readdir(root);
  const staging=new RegExp('^'+binding.replaceAll('.','\\.')+'\\.[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\.tmp$');
  const finalStaging=/^REQUEST\.json\.[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.tmp$/;
  const old=await optional(join(root,'REQUEST.json')),bound=await optional(join(root,binding));
  if(old)need(old.equals(bytes),'The retained original request bytes differ.');
  if(bound)need(bound.equals(bytes),'The retained request selection differs.');
  if(!old)need(names.every(name=>name==='.handover-owner'||name===binding||staging.test(name)||(bound&&finalStaging.test(name))),
    'Use a fresh handover directory or its exact hash-bound original operation.');
  // The selected SHA in the filename survives even a first-write interruption. Only
  // this request's UUID staging files and exact byte prefixes can be reconciled.
  for(const name of names.filter(name=>staging.test(name)||((old||bound)&&finalStaging.test(name)))){
    stop(signal);const path=join(root,name),before=await lstat(path,{bigint:true});
    need(before.isFile()&&!before.isSymbolicLink()&&(process.platform==='win32'||!(Number(before.mode)&0o077)),'Request staging must remain a private regular file.');
    const partial=await readBytes(path,bytes.length);
    need(partial.length<=bytes.length&&partial.equals(bytes.subarray(0,partial.length)),'The request staging bytes do not match the original selected request.');
    const after=await lstat(path,{bigint:true});need(statSame(before,after),'The original request staging changed.');
    await unlink(path);
  }
  if(!bound)await put(root,binding,bytes,signal);
  if(!old)await put(root,'REQUEST.json',bytes,signal);
  return {path:'REQUEST.json',bytes:bytes.length,sha256:hash};
}
function statSame(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;}
async function diskBlob(filename,signal){
  absolute(filename,'Original file');need(await realpath(filename)===filename,'Original file ancestors must not redirect.');
  const selected=await lstat(filename,{bigint:true});
  need(selected.isFile()&&!selected.isSymbolicLink()&&selected.size>0n&&selected.size<=BigInt(SUPPORT_HANDOVER_MAX_ARCHIVE_BYTES),'Choose a complete original regular file within the archive limit.');
  async function* chunks(start,length){
    stop(signal);need(await realpath(filename)===filename,'The selected file path changed.');
    const handle=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{
      const before=await handle.stat({bigint:true});need(before.isFile()&&statSame(selected,before),'The selected original file changed.');
      const buffer=Buffer.alloc(Math.min(1048576,Math.max(length,1)));let total=0;
      while(total<length){
        stop(signal);const n=await handle.read(buffer,0,Math.min(buffer.length,length-total),start+total);
        need(n.bytesRead>0,'The original file ended before its selected extent.');total+=n.bytesRead;yield Buffer.from(buffer.subarray(0,n.bytesRead));
      }
      const after=await handle.stat({bigint:true}),named=await lstat(filename,{bigint:true});
      need(statSame(before,after)&&statSame(selected,named)&&named.isFile()&&!named.isSymbolicLink()&&await realpath(filename)===filename,'The original file changed during the read.');
      stop(signal);
    }finally{await handle.close();}
  }
  function part(start,size){
    return {size,
      slice(from=0,through=size){need(Number.isSafeInteger(from)&&Number.isSafeInteger(through)&&from>=0&&through>=from&&through<=size,'Invalid original file slice.');return part(start+from,through-from);},
      async arrayBuffer(){need(size<=SUPPORT_HANDOVER_MAX_DOCUMENT_BYTES,'Use bounded streaming for original binary members.');const bytes=Buffer.alloc(size);let at=0;for await(const chunk of chunks(start,size)){bytes.set(chunk,at);at+=chunk.length;}return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length);},
      stream(){return chunks(start,size);}
    };
  }
  return part(0,Number(selected.size));
}
async function digestFile(file,signal){
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of file.stream()){stop(signal);hash.update(chunk);bytes+=chunk.length;}
  need(bytes===file.size,'The complete original stream length changed.');stop(signal);return hash.digest('hex');
}
async function* partsStream(parts,signal){
  for(const part of parts){stop(signal);if(part instanceof Uint8Array)yield part;else for await(const chunk of part.stream()){stop(signal);yield chunk;}}
}
function sourceRefs(h){return h.companions.map(c=>({sourceIndex:c.sourceIndex,sourceFile:c.sourceFile,manifestFile:c.manifestFile,case:{id:h.sources[c.sourceIndex].case.id,revision:h.sources[c.sourceIndex].case.revision}}));}
function packReceipt(selected,requestFile){
  return {schema:'stellar-forge.support-operating-handover-packed.v1',requestFile,archiveFile:selected.archiveFile,
    documentFile:selected.documentFile,plan:{id:selected.handover.plan.id,revisions:selected.handover.plan.revisions.length},
    sources:sourceRefs(selected.handover),memberCount:selected.memberCount,memberBytes:selected.bytes,
    verification:'COMPLETE_ORIGINAL_MEMBER_BYTES',sourceVerification:'ORIGINAL_SOURCE_INSPECTOR_AT_EXPORT'};
}
async function assertPackSelection(h,request){
  const normalized=await createSupportOperatingHandover({id:request.id,title:request.title,owner:request.owner,createdAt:request.createdAt,
    plan:request.plan,returns:request.returns,sources:h.sources,companions:h.companions});
  same(h,normalized,'Complete handover input');
  same(h.companions.map(c=>c.sourceFile),request.companions.map(c=>c.expectedSource),'Original source identities');
}
/** Writes one complete immutable archive. Existing original companion directories are read, never modified. */
export async function packSupportOperatingHandover({directory:root,id,title,owner,createdAt,plan,returns:reviews=[],companions,signal}={}){
  absolute(root,'Outgoing directory');need(Array.isArray(companions)&&companions.length>0&&companions.length<=100,'Select every original source companion.');
  const chosen=companions.map(c=>{
    need(c&&Object.keys(c).every(k=>['directory','expectedSource'].includes(k)),'Use exact companion directory/source selections.');
    absolute(c.directory,'Original source directory');
    const rel=relative(root,c.directory);need(rel!==''&&!(rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel)), 'Keep original companions outside the handover directory.');
    const back=relative(c.directory,root);need(back!==''&&!(back!=='..'&&!back.startsWith('..'+sep)&&!isAbsolute(back)),'Keep the handover outside its original source directories.');
    need(c.expectedSource?.path==='SOURCE.json'&&Number.isSafeInteger(c.expectedSource.bytes)&&c.expectedSource.bytes>0&&
      c.expectedSource.bytes<=32*1024*1024&&/^[a-f0-9]{64}$/.test(c.expectedSource.sha256),'Retain each exact original SOURCE.json identity.');
    return {directory:c.directory,expectedSource:c.expectedSource};
  });
  const request={schema:'stellar-forge.support-operating-handover-pack-request.v1',id,title,owner,createdAt,plan,returns:reviews,companions:chosen};
  return owned(root,signal,async lease=>{
    const requestFile=await retainRequest(root,request,signal),target=join(root,'handover.tar');
    let original=null;
    try{original=await diskBlob(target,signal);}catch(e){if(e.code!=='ENOENT')throw e;}
    let selected;
    if(original){
      selected=await readSupportHandoverArchive(original,{signal,digestFile});await assertPackSelection(selected.handover,request);
    }else{
      const sources=[],selections=[];
      for(let index=0;index<chosen.length;index++){
        stop(signal);lease.assertHeld();const input=chosen[index];await directory(input.directory);
        const result=await inspectOAuthOperatingSourcePackage({directory:input.directory,expectedSource:input.expectedSource,signal});
        const manifestBytes=await readBytes(join(input.directory,'MANIFEST.json'),32*1024*1024);
        same({path:'MANIFEST.json',bytes:manifestBytes.length,sha256:sha(manifestBytes)},result.manifestFile,'Original manifest identity');
        sources.push(result.source);selections.push({sourceIndex:index,sourceFile:result.sourceFile,manifestFile:result.manifestFile,manifest:parse(manifestBytes,'Original manifest')});
      }
      const handover=await createSupportOperatingHandover({id,title,owner,createdAt,plan,sources,returns:reviews,companions:selections});
      const read=async path=>{
        const match=/^companions\/([0-9]+)\/(.+)$/.exec(path);need(match&&Number(match[1])<chosen.length,'Unknown original companion member.');
        const base=chosen[Number(match[1])].directory;return diskBlob(await within(base,match[2]),signal);
      };
      const prepared=await prepareSupportHandoverArchive(handover,read,{signal,digestFile});
      stop(signal);lease.assertHeld();
      await acceptStream(target,partsStream(prepared.parts,signal),{bytes:String(prepared.byteCount)},{signal});
      selected=await readSupportHandoverArchive(await diskBlob(target,signal),{signal,digestFile});
      await assertPackSelection(selected.handover,request);
    }
    const receipt=packReceipt(selected,requestFile),receiptFile=await put(root,'PACKED.json',json(receipt),signal);
    return {...receipt,directory:root,receiptFile,handover:selected.handover};
  });
}
/** Full regular-member byte readback; native case verification is performed by receive below. */
export async function inspectSupportOperatingHandoverArchive({archive,expectedArchive,signal}={}){
  absolute(archive,'Original handover archive');const selected=await readSupportHandoverArchive(await diskBlob(archive,signal),{expectedArchive,signal,digestFile});
  return {schema:'stellar-forge.support-operating-handover-inspected.v1',archiveFile:selected.archiveFile,documentFile:selected.documentFile,
    handover:selected.handover,files:selected.files,memberCount:selected.memberCount,memberBytes:selected.bytes,verification:selected.verification};
}
function receivingReceipt(selected,requestFile,result,companions){
  return {schema:'stellar-forge.support-operating-handover-received.v1',requestFile,archiveFile:selected.archiveFile,documentFile:selected.documentFile,
    plan:{id:result.plan.id,revisions:result.plan.revisions.length},planFile:{path:'RECEIVED-PLAN.json',bytes:json(result.plan).length,sha256:sha(json(result.plan))},
    reusedPlan:result.reused,addedRevisions:result.addedRevisions,companions,verification:'FULL_ORIGINAL_CASE_HISTORY_AND_ARTIFACTS',
    liveCaseHeadChanged:false};
}
/** Receives each native companion through its original engine, then computes the original plan-prefix receive. */
export async function receiveSupportOperatingHandoverArchive({archive,directory:root,expectedArchive,existingPlan=null,signal}={}){
  absolute(archive,'Original archive');absolute(root,'Receiving directory');
  need(expectedArchive?.path==='handover.tar'&&Number.isSafeInteger(expectedArchive.bytes)&&expectedArchive.bytes>0&&
    expectedArchive.bytes<=SUPPORT_HANDOVER_MAX_ARCHIVE_BYTES&&/^[a-f0-9]{64}$/.test(expectedArchive.sha256),'Retain the exact original archive identity before receiving.');
  const request={schema:'stellar-forge.support-operating-handover-receive-request.v1',archive:expectedArchive,existingPlan};
  return owned(root,signal,async lease=>{
    const requestFile=await retainRequest(root,request,signal),target=join(root,'handover.tar');
    let kept;try{kept=await diskBlob(target,signal);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(!kept){
      const incoming=await diskBlob(archive,signal);need(incoming.size===expectedArchive.bytes,'The incoming archive length differs.');
      await acceptStream(target,incoming.stream(),{bytes:String(expectedArchive.bytes),sha256:expectedArchive.sha256},{signal});
      kept=await diskBlob(target,signal);
    }
    const selected=await readSupportHandoverArchive(kept,{expectedArchive,signal,digestFile});
    const packageRoot=join(root,'package');await directory(packageRoot,true);
    await acceptStream(await within(packageRoot,'HANDOVER.json',true),(await selected.read('HANDOVER.json')).stream(),
      {bytes:String(selected.documentFile.bytes),sha256:selected.documentFile.sha256},{signal});
    for(const member of selected.files){
      stop(signal);lease.assertHeld();const to=await within(packageRoot,member.path,true);
      await acceptStream(to,(await selected.read(member.path)).stream(),{bytes:String(member.bytes),sha256:member.sha256},{signal});
    }
    const completed=[];
    for(const c of selected.handover.companions){
      stop(signal);lease.assertHeld();
      const result=await receiveOAuthOperatingSource({sourceDirectory:join(packageRoot,'companions',String(c.sourceIndex)),
        destination:join(root,'received-sources',String(c.sourceIndex)),expectedSource:c.sourceFile,signal});
      completed.push({sourceIndex:c.sourceIndex,sourceFile:result.sourceFile,manifestFile:result.manifestFile,receiptFile:result.receiptFile,
        case:{id:result.source.case.id,revision:result.source.case.revision},caseRevisions:result.source.case.ancestors.length+1});
    }
    const result=await receiveSupportOperatingHandover(selected.handover,existingPlan);
    const receipt=receivingReceipt(selected,requestFile,result,completed);
    await put(root,'RECEIVED-PLAN.json',json(result.plan),signal);
    const receiptFile=await put(root,'RECEIVED.json',json(receipt),signal);
    return {...receipt,directory:root,receiptFile,plan:result.plan,handover:selected.handover};
  });
}
