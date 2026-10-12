// MIT — complete collection delivery through the original SF88 archive owner.
import {digest, requireValue} from '../resource-library/files.mjs';
import {
  inspectCollectionArchive, receiveCollection, openReceivedLibrary,
  prepareCollectionDownload
} from '../resource-library/collection-package.mjs';

const PAGE_BYTES=6*1024*1024;
const selectedRevisions=new WeakMap();

function integer(value,fallback,minimum,maximum,code){
  value??=fallback;
  requireValue(Number.isSafeInteger(value)&&value>=minimum&&value<=maximum,code);
  return value;
}
function summary(manifest){
  const c=manifest.collection;
  return {schema:manifest.schema,collection:{schema:c.schema,id:c.id,revision:c.revision,
    name:c.name,note:c.note,updatedAt:c.updatedAt,scan:c.scan},
    collectionSha256:manifest.collectionSha256,memberCount:c.members.length,
    objectCount:manifest.objects.length,
    objectBytes:manifest.objects.reduce((total,item)=>total+BigInt(item.bytes),0n).toString()};
}

/** Resolve a revision once, then page its complete immutable original members. */
export function collectionMembers(library,p={}){
  let pinned=selectedRevisions.get(library);
  if(p.revision===undefined||!pinned||pinned.id!==p.id||pinned.revision!==p.revision){
    const c=library.collections.show(p.id,p.revision);
    pinned={id:c.id,revision:c.revision,collection:c,sha256:digest(JSON.stringify(c))};
    selectedRevisions.set(library,pinned);
  }
  const c=pinned.collection;
  const offset=integer(p.offset,0,0,Number.MAX_SAFE_INTEGER,'COLLECTION_OFFSET_INVALID');
  const limit=integer(p.limit,100,1,200,'COLLECTION_LIMIT_INVALID');
  const items=[];let bytes=0;
  for(let i=offset;i<Math.min(c.members.length,offset+limit);i++){
    const item=c.members[i],size=Buffer.byteLength(JSON.stringify(item))+1;
    requireValue(size<=PAGE_BYTES,'COLLECTION_MEMBER_FRAME_TOO_LARGE',413);
    if(items.length&&bytes+size>PAGE_BYTES)break;
    items.push(item);bytes+=size;
  }
  return {schema:'stellar-forge.sf88.collection-members.v1',id:c.id,revision:c.revision,
    collectionSha256:pinned.sha256,total:c.members.length,offset,limit,items,
    nextOffset:offset+items.length<c.members.length?offset+items.length:null};
}

export async function inspectOriginalCollection(p={},signal){
  const result=await inspectCollectionArchive(p.archive,{
    signal,maxBytes:p.maxBytes,expectedSha256:p.expectedSha256});
  return {...summary(result.manifest),manifestSha256:result.manifestSha256,
    bytes:result.bytes,sha256:result.sha256};
}

export function receiveOriginalCollection(p={},signal){
  return receiveCollection({archive:p.archive,destination:p.destination,
    resume:p.resume??false,signal,maxBytes:p.maxBytes,expectedSha256:p.expectedSha256});
}

/** The receiving directory, not a second snapshot, remains the library source. */
export async function openOriginalCollection(p={},signal){
  requireValue(p.kind===undefined&&p.source===undefined&&p.roots===undefined,
    'COLLECTION_SOURCE_CONFIGURATION_CONFLICT',409);
  requireValue(typeof p.receivedDirectory==='string','COLLECTION_RECEIVED_DIRECTORY_REQUIRED');
  let receipt=null;
  if(p.collectionArchive!==undefined){
    receipt=await receiveOriginalCollection({archive:p.collectionArchive,
      destination:p.receivedDirectory,resume:p.collectionResume??false,
      expectedSha256:p.collectionExpectedSha256,maxBytes:p.collectionMaxBytes},signal);
  }
  const library=await openReceivedLibrary({directory:p.receivedDirectory,state:p.state,
    signal,indexBytes:p.indexBytes,maxFileBytes:p.maxFileBytes});
  return {library,receipt};
}

export function collectionDownload(library,p={},signal){
  requireValue(Number.isSafeInteger(p.revision)&&p.revision>=1,
    'COLLECTION_EXPORT_REVISION_REQUIRED');
  requireValue(p.format===undefined||p.format==='tar','COLLECTION_EXPORT_FORMAT_INVALID');
  return prepareCollectionDownload(library,{
    id:p.id,revision:p.revision,signal,maxBytes:p.maxBytes});
}
