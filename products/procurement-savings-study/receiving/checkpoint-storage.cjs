'use strict';
// Cache only immutable payload text in this one active export job.
// The caller still acknowledges durable objects after its provider commit succeeds.
function createPreparer(codec,partCharacters=650000) {
  if(!Number.isSafeInteger(partCharacters)||partCharacters<4096)throw Error('Choose a positive fragment size');
  let payloadCache=new Map(),computedPayloads=0,payloadHits=0,hashedCharacters=0;
  const copyRef=ref=>({...ref,parts:ref.parts.map(p=>({...p}))});
  function chunk(text){const objects={},parts=[];for(let at=0;at<text.length;){let end=Math.min(text.length,at+partCharacters);if(end<text.length&&text.charCodeAt(end-1)>=0xd800&&text.charCodeAt(end-1)<=0xdbff)end--;const content=text.slice(at,end);at=end,sha256=codec.hashText(content),path='objects/'+sha256+'.part';objects[path]=content;parts.push({path,bytes:codec.utf8Encode(content).length,sha256});hashedCharacters+=content.length;}hashedCharacters+=text.length;return {ref:{bytes:codec.utf8Encode(text).length,sha256:codec.hashText(text),parts},objects};}
  function prepare(checkpoint) {
    if(checkpoint?.schema!=='commons.complete-export-job.v1'||!Array.isArray(checkpoint.archive?.payloads))throw Error('Select a complete export checkpoint');
    const {payloads,...archive}=checkpoint.archive,metadata=chunk(JSON.stringify({...checkpoint,archive})),objects={...metadata.objects},nextCache=new Map();
    const references=payloads.map(text=>{if(typeof text!=='string')throw Error('Checkpoint payload must be immutable base64 text');let saved=payloadCache.get(text)||nextCache.get(text);if(saved)payloadHits++;else{saved=chunk(text);computedPayloads++;}nextCache.set(text,saved);Object.assign(objects,saved.objects);return copyRef(saved.ref);});
    payloadCache=nextCache;
    const manifest={schema:'commons.complete-export-checkpoint-storage.v1',identity:checkpoint.identity,done:checkpoint.done,completedGroups:checkpoint.groups.length,entries:checkpoint.entries.length,metadata:copyRef(metadata.ref),payloads:references};
    return {manifest,objects};
  }
  prepare.statistics=()=>({livePayloads:payloadCache.size,computedPayloads,payloadHits,hashedCharacters});
  return prepare;
}
function prepare(checkpoint,codec,partCharacters=650000){return createPreparer(codec,partCharacters)(checkpoint);}
async function restore(manifest, read, codec) {
  if(manifest?.schema!=='commons.complete-export-checkpoint-storage.v1'||!Array.isArray(manifest.payloads))throw Error('Choose a complete durable export manifest');
  async function join(ref){if(!Array.isArray(ref.parts))throw Error('Missing checkpoint fragments');let text='';for(const p of ref.parts){if(p.path!=='objects/'+p.sha256+'.part'||!(/^[a-f0-9]{64}$/).test(p.sha256))throw Error('Unsafe checkpoint fragment');const value=await read(p.path);if(typeof value!=='string'||codec.utf8Encode(value).length!==p.bytes||codec.hashText(value)!==p.sha256)throw Error('Checkpoint fragment changed '+p.path);text+=value;}if(codec.utf8Encode(text).length!==ref.bytes||codec.hashText(text)!==ref.sha256)throw Error('Checkpoint member changed');return text;}
  const checkpoint=JSON.parse(await join(manifest.metadata));checkpoint.archive.payloads=[];for(const p of manifest.payloads)checkpoint.archive.payloads.push(await join(p));
  if(checkpoint.schema!=='commons.complete-export-job.v1'||checkpoint.identity!==manifest.identity||checkpoint.done!==manifest.done||checkpoint.groups.length!==manifest.completedGroups||checkpoint.entries.length!==manifest.entries)throw Error('Checkpoint index differs');
  return checkpoint;
}

module.exports={prepare,createPreparer,restore};
