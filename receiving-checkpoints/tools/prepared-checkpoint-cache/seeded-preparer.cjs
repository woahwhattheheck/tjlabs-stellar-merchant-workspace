'use strict';
// The seed checkpoint/index must have passed full fragment and member restoration.
// Payload strings are immutable; every required object remains available on retries.
function createSeededPreparer(storage,codec,checkpoint,index){
 if(checkpoint.identity!==index.identity||checkpoint.done!==index.done||checkpoint.entries.length!==index.entries||checkpoint.groups.length!==index.completedGroups||checkpoint.archive.payloads.length!==index.payloads.length)throw Error('Verified seed index differs');
 const copy=r=>({...r,parts:r.parts.map(p=>({...p}))});let cache=new Map(),seeded=0,computed=0;const prepareNew=storage.createPreparer(codec);
 for(let i=0;i<index.payloads.length;i++){const text=checkpoint.archive.payloads[i],ref=index.payloads[i];if(typeof text!=='string'||text.length!==ref.bytes)throw Error('Verified base64 seed length differs');if(!cache.has(text)){cache.set(text,copy(ref));seeded++;}}
 function prepare(cp){
  if(cp?.schema!=='commons.complete-export-job.v1'||!Array.isArray(cp.archive?.payloads))throw Error('Choose a complete checkpoint');const missing=[...new Set(cp.archive.payloads.filter(text=>!cache.has(text)))];
  const fresh=prepareNew({...cp,archive:{...cp.archive,payloads:missing}});for(let i=0;i<missing.length;i++){cache.set(missing[i],copy(fresh.manifest.payloads[i]));computed++;}
  const active=new Map(),descriptors=new Map(),refs=cp.archive.payloads.map(text=>{const ref=cache.get(text);if(!ref)throw Error('Missing complete payload reference');active.set(text,ref);let at=0;for(const part of ref.parts){const end=at+part.bytes;if(!descriptors.has(part.path))descriptors.set(part.path,{text,at,end});at=end;}if(at!==text.length)throw Error('Verified base64 fragment coverage differs');return copy(ref);});cache=active;
  const manifest={...fresh.manifest,payloads:refs};return {manifest,async read(path){if(Object.hasOwn(fresh.objects,path))return fresh.objects[path];const d=descriptors.get(path);if(!d)throw Error('Missing prepared object '+path);return d.text.slice(d.at,d.end);}};
 }
 prepare.statistics=()=>({seededPayloads:seeded,computedPayloads:computed,livePayloads:cache.size,fresh:prepareNew.statistics()});return prepare;
}
module.exports={createSeededPreparer};
