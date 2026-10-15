'use strict';
const Stream = require('./prepared-stream.cjs');
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
 * All writes are awaited; updateRef returns true only after provider acceptance.
 * readObject supplies the exact prepared-index objects. An interrupted caller may
 * retain error.publicationState and pass it as options.resumeState on replay.
 */
async function publishPreparedToGit(index,readObject,api,options={}) {
  for (const key of ['getHead','treeOf','createBlob','createTree','createCommit','updateRef'])
    if (typeof api?.[key] !== 'function') throw TypeError('Missing Git publication operation '+key);
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
  let head=gitSha(options.head,'Initial publication head'),committedParts=0,verifiedMembers=0;
  const prior=options.resumeState??null,retained=[],parts=[];
  if(prior){
    if(prior.schema!=='commons.git-archive-publisher-state.v1'||prior.head!==head||
       prior.branch!==branch||prior.directory!==directory||prior.sourceIndex!==sourceIndex||
       prior.sourceIndexHead!==sourceIndexHead||prior.identity!==index.identity||prior.partBytes!==partBytes||
       !Array.isArray(prior.parts)||!Number.isSafeInteger(prior.committedParts)||
       prior.committedParts<0||prior.committedParts>prior.parts.length)
      throw Error('Publication replay belongs to a different exact source or branch');
    for(const p of prior.parts){validPart(p,partBytes);retained.push(copyPart(p));}
    committedParts=prior.committedParts;
  }
  const extra=options.extraFiles??{};
  for(const [path,content]of Object.entries(extra))
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(path)||
       ['manifest.json','receipt.json','progress.json'].includes(path)||typeof content!=='string')
      throw Error('Invalid final archive companion file');
  const snapshot=()=>({schema:'commons.git-archive-publisher-state.v1',branch,directory,head,
    sourceIndex,sourceIndexHead,identity:index.identity,partBytes,committedParts,verifiedMembers,
    parts:[...parts,...retained.slice(parts.length)].map(copyPart)});
  let writing=false;
  async function publish(files,complete){
    const entries=parts.slice(committedParts).map(p=>({path:directory+p.path,mode:'100644',type:'blob',sha:p.gitBlob}));
    const progress={schema:'commons.streaming-archive-publication.v1',sourceIndex,sourceIndexHead,
      identity:index.identity,partBytes,parts:parts.map(copyPart),complete};
    entries.push({path:directory+'progress.json',mode:'100644',type:'blob',content:JSON.stringify(progress,null,2)+'\n'});
    for(const [path,content]of Object.entries(files))
      entries.push({path:directory+path,mode:'100644',type:'blob',content});
    const baseTree=gitSha(await api.treeOf(head),'Parent tree');
    const tree=gitSha(await api.createTree(baseTree,entries),'Publication tree');
    const next=gitSha(await api.createCommit(head,tree,'Retain '+parts.length+' complete archive parts'+(complete?' and final ZIP receipt':'')),'Publication commit');
    try {
      if(await api.updateRef(branch,head,next)!==true)throw Error('Publication ref was not acknowledged');
    } catch(error) {
      // A lost response after acceptance is reconciled against the actual ref.
      if(await api.getHead(branch)!==next)throw error;
    }
    head=next;committedParts=parts.length;
    if(options.onProgress)await options.onProgress({...snapshot(),complete});
  }
  try {
    if(await api.getHead(branch)!==head)throw Error('Publication branch changed before replay');
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
    const receipt=await Stream.streamPreparedExport(index,readObject,sink.write,{
      ...(options.streamOptions??{}),
      observeMember:async member=>{
        verifiedMembers++;
        if(options.observeMember)await options.observeMember(member,{verifiedMembers,parts:parts.length});
      }
    });
    const stored=await sink.finish(receipt);
    if(parts.length<retained.length||stored.parts.length!==parts.length||
       stored.parts.some((p,i)=>!samePart(p,parts[i])))
      throw Error('Complete output differs from retained part sequence');
    const manifest={...stored,parts:parts.map(copyPart),sourceIndex,sourceIndexHead};
    await publish({...extra,'manifest.json':JSON.stringify(manifest,null,2)+'\n',
      'receipt.json':JSON.stringify(receipt,null,2)+'\n'},true);
    return {head,manifest,receipt,state:snapshot()};
  } catch(error) {
    error.publicationState=snapshot();
    if(options.onInterrupted){
      try{await options.onInterrupted(error.publicationState,error);}catch{}
    }
    throw error;
  }
}
module.exports={publishPreparedToGit};
