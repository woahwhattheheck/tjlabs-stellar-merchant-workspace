'use strict';
// Durable, content-addressed fragments for a complete prepared export checkpoint.
function prepare(checkpoint, codec, partCharacters=650000) {
  if(checkpoint?.schema!=='commons.complete-export-job.v1'||!Array.isArray(checkpoint.archive?.payloads))throw Error('Select a complete export checkpoint');
  if(!Number.isSafeInteger(partCharacters)||partCharacters<4096)throw Error('Choose a positive fragment size');
  const objects={},chunk=text=>{const refs=[];for(let at=0;at<text.length;at+=partCharacters){const content=text.slice(at,at+partCharacters),sha256=codec.hashText(content),path='objects/'+sha256+'.part';objects[path]=content;refs.push({path,bytes:codec.utf8Encode(content).length,sha256});}return {bytes:codec.utf8Encode(text).length,sha256:codec.hashText(text),parts:refs};};
  const {payloads,...archive}=checkpoint.archive,metadata=JSON.stringify({...checkpoint,archive});
  const manifest={schema:'commons.complete-export-checkpoint-storage.v1',identity:checkpoint.identity,done:checkpoint.done,completedGroups:checkpoint.groups.length,entries:checkpoint.entries.length,metadata:chunk(metadata),payloads:payloads.map(chunk)};
  return {manifest,objects};
}
async function restore(manifest, read, codec) {
  if(manifest?.schema!=='commons.complete-export-checkpoint-storage.v1'||!Array.isArray(manifest.payloads))throw Error('Choose a complete durable export manifest');
  async function join(ref){if(!Array.isArray(ref.parts))throw Error('Missing checkpoint fragments');let text='';for(const p of ref.parts){if(p.path!=='objects/'+p.sha256+'.part'||!(/^[a-f0-9]{64}$/).test(p.sha256))throw Error('Unsafe checkpoint fragment');const value=await read(p.path);if(typeof value!=='string'||codec.utf8Encode(value).length!==p.bytes||codec.hashText(value)!==p.sha256)throw Error('Checkpoint fragment changed '+p.path);text+=value;}if(codec.utf8Encode(text).length!==ref.bytes||codec.hashText(text)!==ref.sha256)throw Error('Checkpoint member changed');return text;}
  const checkpoint=JSON.parse(await join(manifest.metadata));checkpoint.archive.payloads=[];for(const p of manifest.payloads)checkpoint.archive.payloads.push(await join(p));
  if(checkpoint.schema!=='commons.complete-export-job.v1'||checkpoint.identity!==manifest.identity||checkpoint.done!==manifest.done||checkpoint.groups.length!==manifest.completedGroups||checkpoint.entries.length!==manifest.entries)throw Error('Checkpoint index differs');
  return checkpoint;
}
module.exports={prepare,restore};
