// MIT — Complete original-byte custody for a reviewed Research dossier return.
import {createReadStream} from 'node:fs';
import {mkdtemp,open,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {privateDirectory,writeJson,readJson,writeBytes,readBytes,digest,jsonBytes,need,object} from '../../node/store.mjs';
import {portableEntries} from '../portable.mjs';
import {RETURN_LIMITS,RETURN_SCHEMAS,ReturnError,validateReturnId} from './contracts.mjs';

const portableSchema='sf88-research-dossier-portable-v1';
const validDossierId=value=>typeof value==='string'&&/^d_[a-f0-9-]{36}$/.test(value);
const revisionName=value=>String(value).padStart(8,'0')+'.json';
const copy=value=>structuredClone(value);
const requireReturn=(condition,code,details={})=>{if(!condition)throw new ReturnError(code,details);};

export function validateReturnSourceDescriptor(source){
  requireReturn(object(source)&&source.schema===RETURN_SCHEMAS.source,'RETURN_SOURCE_INVALID');
  validateReturnId(source.id,'source');
  requireReturn(/^[a-f0-9]{64}$/.test(source.sha256)&&source.id==='drs_'+source.sha256&&
    Number.isSafeInteger(source.bytes)&&source.bytes>0&&source.bytes<=RETURN_LIMITS.sourceBytes&&
    validDossierId(source.dossierId)&&typeof source.filename==='string'&&source.filename.length>0&&
    source.filename.length<=512&&!/[\0\r\n/\\]/.test(source.filename)&&
    typeof source.contentType==='string'&&source.contentType.length>0&&source.contentType.length<=200&&
    !/[\0\r\n]/.test(source.contentType)&&typeof source.receivedAt==='string'&&Number.isFinite(Date.parse(source.receivedAt))&&
    object(source.incomingHead)&&Number.isSafeInteger(source.incomingHead.revision)&&source.incomingHead.revision>0&&
    /^[a-f0-9]{64}$/.test(source.incomingHead.sha256)&&Array.isArray(source.chunks)&&source.chunks.length>0,
  'RETURN_SOURCE_INVALID');
  let total=0;
  for(const [index,row] of source.chunks.entries()){
    requireReturn(object(row)&&/^[a-f0-9]{64}$/.test(row.sha256)&&Number.isSafeInteger(row.bytes)&&
      row.bytes>0&&row.bytes<=RETURN_LIMITS.chunkBytes&&
      (index===source.chunks.length-1||row.bytes===RETURN_LIMITS.chunkBytes),'RETURN_SOURCE_INVALID');
    total+=row.bytes;
  }
  requireReturn(total===source.bytes,'RETURN_SOURCE_INVALID');
  return source;
}

export async function* returnSourceChunks(source,readContent){
  validateReturnSourceDescriptor(source);
  const hash=createHash('sha256');let bytes=0;
  for(const metadata of source.chunks){
    const chunk=await readContent(metadata);
    requireReturn(Buffer.isBuffer(chunk)&&chunk.length===metadata.bytes&&digest(chunk)===metadata.sha256,
      'RETURN_SOURCE_INVALID',{reason:'Retained source chunk changed',sourceId:source.id});
    hash.update(chunk);bytes+=chunk.length;yield chunk;
  }
  requireReturn(bytes===source.bytes&&hash.digest('hex')===source.sha256,'RETURN_SOURCE_INVALID',
    {reason:'Complete original source identity changed',sourceId:source.id});
}

/** Validate every incoming envelope, source blob and native transition before work().
 * The callback's readers live only inside this scope. No target revision is written. */
export async function withValidatedReturnBranch(input,{directory,validateEnvelope,validateState,validateTransitions},work){
  const staging=await mkdtemp(join(directory,'.return-branch-'));
  const fields={},content=new Map();let revisionCount=0,blobCount=0,total=0;
  try{
    for await(const record of portableEntries(input)){
      if(record.kind==='field'){
        if(['schema','id','exportedAt'].includes(record.key))fields[record.key]=record.value;
      }else if(record.kind==='array')fields[record.key]=record.count;
      else if(record.kind==='versions'){
        const envelope=record.value;
        need(object(envelope)&&validDossierId(envelope.state?.id),'PORTABLE_INVALID');
        validateEnvelope(envelope,envelope.state.id,record.index+1);
        need(jsonBytes(envelope).length<=RETURN_LIMITS.stateBytes,'DOSSIER_STATE_TOO_LARGE');
        await writeJson(join(staging,revisionName(record.index+1)),envelope,{exclusive:true});revisionCount++;
      }else if(record.kind==='blobs'){
        const row=record.value;
        need(object(row)&&typeof row.bodyBase64==='string'&&/^[a-f0-9]{64}$/.test(row.sha256),'PORTABLE_BLOB_INVALID');
        const bytes=Buffer.from(row.bodyBase64,'base64');
        need(bytes.toString('base64')===row.bodyBase64&&bytes.length===row.bytes&&
          bytes.length<=RETURN_LIMITS.chunkBytes&&digest(bytes)===row.sha256,'PORTABLE_BLOB_CHANGED');
        total+=bytes.length;need(total<=RETURN_LIMITS.decodedBytes,'PORTABLE_SIZE_LIMIT');
        const prior=content.get(row.sha256);
        need(!prior||prior.bytes===bytes.length,'PORTABLE_BLOB_CONFLICT');
        if(!prior){
          await writeBytes(join(staging,row.sha256),bytes,{exclusive:true});
          content.set(row.sha256,{sha256:row.sha256,bytes:bytes.length});
        }
        blobCount++;
      }
    }
    need(fields.schema===portableSchema&&validDossierId(fields.id)&&fields.versions===revisionCount&&
      revisionCount>0&&fields.blobs===blobCount,'PORTABLE_INVALID');
    const readContent=async metadata=>{
      const row=content.get(metadata.sha256);
      need(row,'PORTABLE_BLOB_MISSING');need(row.bytes===metadata.bytes,'PORTABLE_BLOB_CHANGED');
      const bytes=await readBytes(join(staging,row.sha256),RETURN_LIMITS.chunkBytes);
      need(bytes.length===row.bytes&&digest(bytes)===row.sha256,'PORTABLE_BLOB_CHANGED');return bytes;
    };
    const readRevision=async revision=>{
      need(Number.isSafeInteger(revision)&&revision>0&&revision<=revisionCount,'REVISION_INVALID');
      return validateEnvelope(await readJson(join(staging,revisionName(revision)),RETURN_LIMITS.stateBytes),fields.id,revision);
    };
    const pins=[],cache=new Map();let previous=null,previousState=null,terminal=null;
    for(let revision=1;revision<=revisionCount;revision++){
      const envelope=await readRevision(revision);
      need(envelope.state.previous===previous,'PORTABLE_HISTORY_CHANGED');
      await validateState(envelope.state,readContent,cache);
      await validateTransitions(previousState,envelope.state,readContent,cache);
      previous=envelope.sha256;previousState=envelope.state;terminal=envelope;
      pins.push({revision,sha256:envelope.sha256});
    }
    return await work({id:fields.id,head:terminal,pins,readRevision,readContent,contents:[...content.values()]});
  }finally{await rm(staging,{recursive:true,force:true});}
}

export function createDossierReturnSourceAdapter({directory,dossierDirectory,head,history,blob,putBlob,
  validateEnvelope,validateState,validateTransitions}){
  const withPortableBranch=(input,work)=>withValidatedReturnBranch(input,
    {directory,validateEnvelope,validateState,validateTransitions},work);
  const sourceDirectory=async id=>privateDirectory(join(await privateDirectory(dossierDirectory(id)),'returns','sources'));
  async function sourceFromState(id,sourceId){
    validateReturnId(sourceId,'source');
    const state=(await head(id)).state;
    const matches=(state.dossierReturnEvents??[]).filter(row=>row.sourceId===sourceId);
    return matches.length?copy(matches.at(-1).source):null;
  }
  async function readSource(id,sourceId){
    validateReturnId(sourceId,'source');await head(id);
    let source;
    try{source=await readJson(join(await sourceDirectory(id),sourceId+'.json'),1048576);}
    catch(error){if(error.code!=='ENOENT')throw error;source=await sourceFromState(id,sourceId);}
    requireReturn(source,'RETURN_SOURCE_NOT_FOUND',{sourceId});validateReturnSourceDescriptor(source);
    requireReturn(source.dossierId===id,'RETURN_SOURCE_INVALID');return source;
  }
  async function capture(input,path){
    requireReturn(input&&typeof input[Symbol.asyncIterator]==='function','RETURN_SOURCE_INVALID',
      {reason:'Use the complete original byte stream'});
    const handle=await open(path,'wx',0o600),hash=createHash('sha256');let bytes=0;
    try{
      for await(const value of input){
        requireReturn(value instanceof Uint8Array,'RETURN_SOURCE_INVALID',{reason:'Byte stream required'});
        bytes+=value.byteLength;
        requireReturn(bytes<=RETURN_LIMITS.sourceBytes,'RETURN_SOURCE_TOO_LARGE',{maxBytes:RETURN_LIMITS.sourceBytes});
        const chunk=Buffer.from(value);hash.update(chunk);await handle.writeFile(chunk);
      }
      await handle.sync();return{bytes,sha256:hash.digest('hex')};
    }finally{await handle.close();}
  }
  async function receiveDossierReturnSource(id,{input,filename='returned.research.json',contentType='application/json',expectedSha256}={}){
    await head(id);
    requireReturn(typeof filename==='string'&&filename.length>0&&filename.length<=512&&!/[\0\r\n/\\]/.test(filename)&&
      typeof contentType==='string'&&contentType.length>0&&contentType.length<=200&&!/[\0\r\n]/.test(contentType),
    'RETURN_SOURCE_INVALID',{reason:'Original filename and media type are required'});
    requireReturn(expectedSha256===undefined||/^[a-f0-9]{64}$/.test(expectedSha256),'RETURN_SOURCE_INVALID');
    const temporary=await mkdtemp(join(directory,'.return-input-')),file=join(temporary,'original');
    try{
      const identity=await capture(input instanceof Uint8Array?Readable.from([input]):input,file);
      requireReturn(expectedSha256===undefined||identity.sha256===expectedSha256,'RETURN_SOURCE_INVALID',
        {reason:'Original source SHA256 differs',expectedSha256:expectedSha256??null,sha256:identity.sha256});
      return await withPortableBranch(createReadStream(file),async branch=>{
        requireReturn(branch.id===id,'RETURN_SOURCE_INVALID',{reason:'Return belongs to another dossier',dossierId:branch.id});
        // Validation has finished. Native content hashes retain every branch source
        // used by an accepted authored addition as well as the exact input chunks.
        for(const metadata of branch.contents)await putBlob(await branch.readContent(metadata));
        const chunks=[],handle=await open(file,'r');
        try{
          let offset=0;
          while(offset<identity.bytes){
            const size=Math.min(RETURN_LIMITS.chunkBytes,identity.bytes-offset),buffer=Buffer.allocUnsafe(size);
            let used=0;
            while(used<size){
              const result=await handle.read(buffer,used,size-used,offset+used);
              need(result.bytesRead>0,'PORTABLE_TRUNCATED');used+=result.bytesRead;
            }
            chunks.push(await putBlob(buffer));offset+=size;
          }
        }finally{await handle.close();}
        const source={schema:RETURN_SCHEMAS.source,id:'drs_'+identity.sha256,...identity,filename,contentType,
          dossierId:id,receivedAt:new Date().toISOString(),
          incomingHead:{revision:branch.head.state.revision,sha256:branch.head.sha256},chunks};
        validateReturnSourceDescriptor(source);
        const path=join(await sourceDirectory(id),source.id+'.json');
        try{await writeJson(path,source,{exclusive:true});}
        catch(error){
          if(error.code!=='EEXIST')throw error;
          const existing=await readSource(id,source.id);
          requireReturn(existing.bytes===source.bytes&&existing.sha256===source.sha256&&
            existing.incomingHead.sha256===source.incomingHead.sha256&&
            digest(jsonBytes(existing.chunks))===digest(jsonBytes(source.chunks)),'RETURN_SOURCE_INVALID');
          return{source:existing};
        }
        return{source};
      });
    }finally{await rm(temporary,{recursive:true,force:true});}
  }
  async function inspectSource(id,source,work,readContent=blob){
    validateReturnSourceDescriptor(source);
    requireReturn(source.dossierId===id,'RETURN_SOURCE_INVALID');
    return withPortableBranch(Readable.from(returnSourceChunks(source,readContent)),async branch=>{
      requireReturn(branch.id===id&&branch.head.state.revision===source.incomingHead.revision&&
        branch.head.sha256===source.incomingHead.sha256,'RETURN_SOURCE_INVALID',
      {reason:'Validated incoming terminal revision differs'});
      return work(branch);
    });
  }
  async function comparisonBranches(id,source,current){
    const local=await history(id);
    requireReturn(local.some(row=>row.state.revision===current.state.revision&&row.sha256===current.sha256),
      'REVISION_CONFLICT');
    return inspectSource(id,source,async branch=>{
      const matches=branch.pins.filter(row=>row.revision<=current.state.revision&&local[row.revision-1]?.sha256===row.sha256);
      requireReturn(matches.length>0,'RETURN_NO_COMMON_ANCESTOR',{dossierId:id,sourceId:source.id});
      const shared=matches.at(-1);
      return{source:copy(source),current:copy(current),returned:copy(branch.head),base:await branch.readRevision(shared.revision)};
    });
  }
  return Object.freeze({receiveDossierReturnSource,readSource,inspectSource,comparisonBranches,withPortableBranch});
}
