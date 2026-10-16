'use strict';
const Stream = require('./prepared-stream.cjs'), H = require('./sha256.cjs');
const {createStreamedArchiveSource}=require('./streamed-archive-source.cjs');
const {readCompleteExportRanges}=require('./ordinary-zip-range.cjs');
const HEX = /^[a-f0-9]{64}$/, GIT = /^[a-f0-9]{40}$/;
const fields = ['path','bytes','sha256','decodedBytes','decodedSha256'];
const copyPart = p => Object.fromEntries([...fields,'gitBlob'].map(k => [k,p[k]]));
const samePart = (a,b) => fields.every(k => a[k] === b[k]);
function validPart(p,partBytes) {
  if (!p || !HEX.test(p.sha256) || p.path !== 'objects/'+p.sha256+'.part' ||
      !HEX.test(p.decodedSha256) || !GIT.test(p.gitBlob) ||
      !Number.isSafeInteger(p.decodedBytes) || p.decodedBytes < 1 || p.decodedBytes > partBytes ||
      p.bytes !== Math.ceil(p.decodedBytes/3)*4) throw Error('Invalid retained archive part');
}
function gitSha(value,operation) {
  if (!GIT.test(value)) throw Error(operation+' did not return a Git object SHA');
  return value;
}
/**
 * api: getHead(branch), treeOf(commit), createBlob(text), createTree(tree,entries),
 * createCommit(parent,tree,message), updateRef(branch,expectedHead,nextHead).
 * Optional verification:'ordinary' also requires readBlob(gitBlob), returning the
 * exact acknowledged blob's UTF-8 base64 text. It reopens those provider bytes
 * before publishing the complete manifest. The default verification:'full'
 * preserves original-member verification during prepared emission.
 * All writes are awaited; updateRef returns true only after provider acceptance.
 * readObject supplies the exact prepared-index objects. An interrupted caller may
 * retain error.publicationState and pass it as options.resumeState on replay.
 */
async function publishPreparedToGit(index,readObject,api,options={}) {
  for (const key of ['getHead','treeOf','createBlob','createTree','createCommit','updateRef'])
    if (typeof api?.[key] !== 'function') throw TypeError('Missing Git publication operation '+key);
  const verification=options.verification??'full';
  if(verification!=='full'&&verification!=='ordinary')throw Error('Choose full or ordinary archive verification');
  if(verification==='ordinary'&&typeof api.readBlob!=='function')throw TypeError('Ordinary verification requires immutable Git blob reads');
  const {branch,directory,sourceIndex,sourceIndexHead}=options;
  if (typeof branch!=='string'||!branch || typeof directory!=='string'||
      !directory.endsWith('/')||directory.startsWith('/')||directory.includes('\\')||
      directory.split('/').slice(0,-1).some(x=>!x||x==='.'||x==='..') ||
      typeof sourceIndex!=='string'||!sourceIndex||!GIT.test(sourceIndexHead))
    throw Error('Choose exact archive branch, directory and source-index commit');
  const partBytes=options.partBytes??487500,commitParts=options.commitParts??16;
  if(!Number.isSafeInteger(partBytes)||partBytes<1||partBytes>16*1024*1024||
     !Number.isSafeInteger(commitParts)||commitParts<1||commitParts>1000)
    throw Error('Choose bounded archive parts and publication batches');
  let head=gitSha(options.head,'Initial publication head'),committedParts=0,verifiedMembers=0,emittedMembers=0,pendingPublication=null,alreadyComplete=false;
  const prior=options.resumeState??null,retained=[],parts=[],metadataBlobs=new Map(),trustedMetadata=new Set();
  if(prior){
    if((prior.verification??'full')!==verification)throw Error('Publication verification mode changed from the retained publication');
    if(prior.schema!=='commons.git-archive-publisher-state.v1'||prior.head!==head||
       prior.branch!==branch||prior.directory!==directory||prior.sourceIndex!==sourceIndex||
       prior.sourceIndexHead!==sourceIndexHead||prior.identity!==index.identity||prior.partBytes!==partBytes||
       !Array.isArray(prior.parts)||!Number.isSafeInteger(prior.committedParts)||
       prior.committedParts<0||prior.committedParts>prior.parts.length)
      throw Error('Publication replay belongs to a different exact source or branch');
    for(const p of prior.parts){validPart(p,partBytes);retained.push(copyPart(p));}
    committedParts=prior.committedParts;
    alreadyComplete=prior.complete===true;
    if(alreadyComplete&&committedParts!==retained.length)throw Error('Complete publication has uncommitted parts');
    if(prior.pendingPublication){
      const p=prior.pendingPublication;
      if(p.parentHead!==head||!GIT.test(p.nextHead)||!Number.isSafeInteger(p.partCount)||p.partCount<committedParts||p.partCount>retained.length||typeof p.complete!=='boolean')throw Error('Invalid pending publication commit');
      pendingPublication={parentHead:p.parentHead,nextHead:p.nextHead,partCount:p.partCount,complete:p.complete};
    }
  }
  const extra={...(options.extraFiles??{})};
  for(const [path,content]of Object.entries(extra))
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(path)||
       ['manifest.json','receipt.json','progress.json'].includes(path)||typeof content!=='string')
      throw Error('Invalid final archive companion file');
  const extraFilesSha256=H.sha256Utf8(JSON.stringify(Object.entries(extra).sort(([a],[b])=>a<b?-1:a>b?1:0))).sha256;
  if(prior){
    if(prior.extraFilesSha256!==undefined&&prior.extraFilesSha256!==extraFilesSha256)
      throw Error('Final archive companions changed from the retained publication');
    if(prior.extraFilesSha256===undefined&&(prior.complete===true||prior.pendingPublication?.complete===true))
      throw Error('Complete publication replay requires its original companion identity');
  }
  const allowedMetadata=new Set(['progress.json','manifest.json','receipt.json',...Object.keys(extra)]);
  if(prior?.metadataBlobs!==undefined){
    if(!Array.isArray(prior.metadataBlobs))throw Error('Invalid retained metadata blobs');
    for(const p of prior.metadataBlobs){
      if(!p||!allowedMetadata.has(p.path)||metadataBlobs.has(p.path)||!HEX.test(p.sha256)||!GIT.test(p.gitBlob)||!Number.isSafeInteger(p.bytes)||p.bytes<0)throw Error('Invalid retained metadata blob');
      metadataBlobs.set(p.path,{path:p.path,bytes:p.bytes,sha256:p.sha256,gitBlob:p.gitBlob});
    }
  }
  async function metadataBlob(path,content){
    const identity=H.sha256Utf8(content),old=metadataBlobs.get(path),same=old&&old.bytes===identity.bytes&&old.sha256===identity.sha256;
    if(same){
      if(trustedMetadata.has(path))return old.gitBlob;
      if(typeof api.readBlob==='function'){
        const actual=await api.readBlob(old.gitBlob);
        if(typeof actual!=='string'||actual!==content)throw Error('Retained metadata blob differs from exact publication body');
        trustedMetadata.add(path);return old.gitBlob;
      }
    }
    const gitBlob=gitSha(await api.createBlob(content),'Publication metadata blob');
    metadataBlobs.set(path,{path,...identity,gitBlob});trustedMetadata.add(path);return gitBlob;
  }
  const snapshot=()=>({schema:'commons.git-archive-publisher-state.v1',branch,directory,head,
    sourceIndex,sourceIndexHead,identity:index.identity,extraFilesSha256,verification,partBytes,committedParts,emittedMembers,verifiedMembers,complete:alreadyComplete,pendingPublication:pendingPublication?{...pendingPublication}:null,
    parts:[...parts,...retained.slice(parts.length)].map(copyPart),metadataBlobs:[...metadataBlobs.values()].sort((a,b)=>a.path.localeCompare(b.path)).map(p=>({...p}))});
  let writing=false;
  async function settlePending(){
    if(!pendingPublication)return;
    const pending=pendingPublication;
    let actual=await api.getHead(branch);
    if(actual===pending.parentHead){
      try{
        if(await api.updateRef(branch,pending.parentHead,pending.nextHead)!==true)
          throw Error('Publication ref was not acknowledged');
      }catch(error){
        // Keep the known commit even when this reconciliation read also fails.
        actual=await api.getHead(branch);
        if(actual!==pending.nextHead)throw error;
      }
      actual=await api.getHead(branch);
    }
    if(actual!==pending.nextHead)throw Error('Publication branch changed outside the retained commit');
    head=pending.nextHead;committedParts=pending.partCount;
    alreadyComplete=pending.complete;pendingPublication=null;
  }
  async function publish(files,complete){
    const entries=parts.slice(committedParts).map(p=>({path:directory+p.path,mode:'100644',type:'blob',sha:p.gitBlob}));
    const progress={schema:'commons.streaming-archive-publication.v1',sourceIndex,sourceIndexHead,
      identity:index.identity,extraFilesSha256,verification,partBytes,parts:parts.map(copyPart),complete};
    entries.push({path:directory+'progress.json',mode:'100644',type:'blob',sha:await metadataBlob('progress.json',JSON.stringify(progress,null,2)+'\n')});
    for(const [path,content]of Object.entries(files))
      entries.push({path:directory+path,mode:'100644',type:'blob',sha:await metadataBlob(path,content)});
    const baseTree=gitSha(await api.treeOf(head),'Parent tree');
    const tree=gitSha(await api.createTree(baseTree,entries),'Publication tree');
    const next=gitSha(await api.createCommit(head,tree,'Retain '+parts.length+' complete archive parts'+(complete?' and final ZIP receipt':'')),'Publication commit');
    pendingPublication={parentHead:head,nextHead:next,partCount:parts.length,complete};
    await settlePending();
    if(options.onProgress)await options.onProgress({...snapshot(),complete});
  }
  try {
    if(pendingPublication)await settlePending();
    else if(await api.getHead(branch)!==head)throw Error('Publication branch changed before replay');
    const sink=Stream.createChunkSink(async part=>{
      if(writing)throw Error('Archive part publication must remain sequential');
      writing=true;
      try {
        const priorPart=retained[parts.length];
        if(priorPart){
          if(!samePart(part,priorPart))throw Error('Archive replay differs from acknowledged part '+parts.length);
          parts.push(copyPart(priorPart));
        } else {
          const gitBlob=gitSha(await api.createBlob(part.content),'Archive part blob');
          parts.push({...Object.fromEntries(fields.map(k=>[k,part[k]])),gitBlob});
        }
        if(parts.length-committedParts>=commitParts)await publish({},false);
      } finally {writing=false;}
    },{partBytes});
    const emit=verification==='ordinary'?Stream.streamPreparedPayloads:Stream.streamPreparedExport;
    let receipt=await emit(index,readObject,sink.write,{
      ...(options.streamOptions??{}),
      observeMember:async member=>{
        emittedMembers++;
        if(verification==='full'){
          verifiedMembers++;
          if(options.observeMember)await options.observeMember(member,{verifiedMembers,emittedMembers,parts:parts.length});
        }
      }
    });
    const stored=await sink.finish(receipt);
    if(parts.length<retained.length||stored.parts.length!==parts.length||
       stored.parts.some((p,i)=>!samePart(p,parts[i])))
      throw Error('Complete output differs from retained part sequence');
    let ordinaryReadback;
    if(verification==='ordinary'){
      const source=createStreamedArchiveSource({...stored,parts:parts.map(copyPart)},
        part=>api.readBlob(part.gitBlob),
        {maxBytes:receipt.bytes,maxPartBytes:Math.ceil(partBytes/3)*4,cacheParts:2});
      ordinaryReadback=await readCompleteExportRanges(source,{
        expectedSha256:receipt.sha256,maxBytes:receipt.bytes,
        maxUncompressedBytes:receipt.uncompressedBytes,maxEntries:receipt.members,
        maxCapturedEntryBytes:32*1024*1024,
        visitEntry:async member=>{
          verifiedMembers++;
          if(options.observeMember)await options.observeMember(
            {name:member.name,bytes:member.bytes,sha256:member.sha256},
            {verifiedMembers,emittedMembers,parts:parts.length});
        }
      });
      if(ordinaryReadback.members.length!==receipt.members||
         ordinaryReadback.uncompressedBytes!==receipt.uncompressedBytes)
        throw Error('Reopened Git archive differs from its prepared member totals');
      const {members,...observed}=ordinaryReadback;
      receipt={...receipt,emissionMemberVerification:receipt.memberVerification,
        memberVerification:'ordinary-zip-crc32-sha256-and-export-manifest',
        requiresOrdinaryReadback:false,
        ordinaryReadback:{...observed,members:members.length,sourceStats:source.stats()}};
    }
    const manifest={...stored,receipt,parts:parts.map(copyPart),sourceIndex,sourceIndexHead,extraFilesSha256,verification};
    if(alreadyComplete){
      if(committedParts!==parts.length)throw Error('Recovered complete commit has a different part count');
      if(options.onProgress)await options.onProgress({...snapshot(),complete:true});
    } else await publish({...extra,'manifest.json':JSON.stringify(manifest,null,2)+'\n',
      'receipt.json':JSON.stringify(receipt,null,2)+'\n'},true);
    return {head,manifest,receipt,state:snapshot(),...(ordinaryReadback?{ordinaryReadback}: {})};
  } catch(error) {
    error.publicationState=snapshot();
    if(options.onInterrupted){
      try{await options.onInterrupted(error.publicationState,error);}catch{}
    }
    throw error;
  }
}
/**
 * Recover only provider-acknowledged parts from progress.json fetched at one
 * immutable commit. The caller pins that exact read in head; no mutable branch
 * lookup or inference happens here. publishPreparedToGit checks the actual ref,
 * source identity, companions and verification mode again before replay.
 */
function stateFromProgress(progress,{head,branch,directory}={}){
  gitSha(head,'Pinned progress commit');
  if(!progress||progress.schema!=='commons.streaming-archive-publication.v1'||
     typeof branch!=='string'||!branch||typeof directory!=='string'||!directory.endsWith('/')||
     directory.startsWith('/')||directory.includes('\\')||directory.split('/').slice(0,-1).some(x=>!x||x==='.'||x==='..')||
     typeof progress.sourceIndex!=='string'||!progress.sourceIndex||!GIT.test(progress.sourceIndexHead)||
     !HEX.test(progress.identity)||typeof progress.complete!=='boolean'||
     !Number.isSafeInteger(progress.partBytes)||progress.partBytes<1||progress.partBytes>16*1024*1024||
     !Array.isArray(progress.parts))throw Error('Invalid acknowledged publication progress');
  const verification=progress.verification??'full';
  if(!['full','ordinary'].includes(verification))throw Error('Invalid acknowledged verification mode');
  if(progress.extraFilesSha256!==undefined&&!HEX.test(progress.extraFilesSha256)||
     progress.complete&&progress.extraFilesSha256===undefined)throw Error('Acknowledged final publication requires original companion identity');
  for(const p of progress.parts)validPart(p,progress.partBytes);
  return{schema:'commons.git-archive-publisher-state.v1',branch,directory,head,
    sourceIndex:progress.sourceIndex,sourceIndexHead:progress.sourceIndexHead,
    identity:progress.identity,extraFilesSha256:progress.extraFilesSha256,verification,
    partBytes:progress.partBytes,committedParts:progress.parts.length,
    emittedMembers:0,verifiedMembers:0,complete:progress.complete,pendingPublication:null,
    parts:progress.parts.map(copyPart),metadataBlobs:[]};
}
module.exports={publishPreparedToGit,stateFromProgress};
