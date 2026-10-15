'use strict';
// One full maintained source/working desk comparison, then focused failure boundaries.
const Z=require('./connected_zip.cjs'),H=require('./sha256.cjs'),P=require('./vendor/pako.cjs');
const Storage=require('./checkpoint-storage.cjs'),Stream=require('./prepared-stream.cjs');
const {readCompleteExportRanges}=require('./ordinary-zip-range.cjs');
module.exports=async function verifyPackedReadback(sourceBank,workingHTML,progress=()=>{}){
 const start=Date.now(),assert=(ok,message)=>{if(!ok)throw Error(message);};
 const codec={hashText:t=>H.sha256Utf8(t).sha256,utf8Encode:Z.utf8};
 const limits={timestamp:'2026-10-15T00:00:00Z',maxBytes:512*1024*1024,maxUncompressedBytes:1024*1024*1024,maxEntries:65535,compression:'auto',deflateRaw:b=>P.deflateRaw(b,{level:1}),inflateRaw:b=>P.inflateRaw(b)};
 function prepare(items,wrongOriginal=false){
  const builder=Z.createZipBuilder(limits),entries=[],groups=[];
  for(const item of items){builder.add(item);const raw=typeof item.data==='string'?Z.utf8(item.data):item.data;
   groups.push({key:item.name,start:entries.length,count:1});
   entries.push({name:item.name,...H.sha256Bytes(raw)});
  }
  if(wrongOriginal)entries[0].sha256='0'.repeat(64);
  const content=JSON.stringify({schema:'commons.packed-readback-course.v1',files:entries.map(x=>({path:x.name,bytes:x.bytes,sha256:x.sha256}))},null,2)+'\n';
  builder.add({name:'EXPORT_MANIFEST.json',data:content});
  entries.push({name:'EXPORT_MANIFEST.json',...H.sha256Utf8(content)});
  const checkpoint={schema:'commons.complete-export-job.v1',identity:H.sha256Utf8(JSON.stringify(entries)).sha256,done:true,groups,entries,archive:builder.snapshot()};
  return {builder,entries,...Storage.prepare(checkpoint,codec,650003)};
 }
 async function emit(durable,failAfter=0){
  const chunks=[];let calls=0;
  const receipt=await Stream.streamPreparedPayloads(durable.manifest,p=>durable.objects[p],async b=>{
   if(failAfter&&++calls===failAfter)throw Error('Injected output rejection');
   chunks.push(b.slice());
  });
  const bytes=new Uint8Array(receipt.bytes);let at=0;for(const b of chunks){bytes.set(b,at);at+=b.length;}
  return {bytes,receipt};
 }
 const items=Object.entries(sourceBank).map(([name,data])=>({name:'source/'+name,data}));
 items.push({name:'working/Distribution_Editable.html',data:workingHTML},
  {name:'original/Größe_日本語.txt',data:'Original UTF-8 😀\u0000\r\n'},
  {name:'original/binary.bin',data:Uint8Array.from({length:10007},(_,i)=>(i*73+19)&255)},
  {name:'original/empty.bin',data:new Uint8Array()});
 const original=prepare(items);progress({phase:'prepared',members:original.entries.length});
 const packed=await emit(original),expected=H.sha256Bytes(original.builder.finish());
 assert(packed.receipt.sha256===expected.sha256&&packed.receipt.bytes===expected.bytes,'Packed emission differs from ordinary original ZIP');
 assert(packed.receipt.requiresOrdinaryReadback===true&&packed.receipt.memberVerification==='prepared-payload-identities','Packed result omits its original-member verification mode');
 progress({phase:'emitted',...expected});
 const expectedMembers=new Map(original.entries.map(x=>[x.name,x]));
 const ordinary=await readCompleteExportRanges({bytes:packed.bytes.length,read:async(o,n)=>packed.bytes.slice(o,o+n)},
  {...limits,expectedSha256:packed.receipt.sha256,visitEntry:r=>{
   const expected=expectedMembers.get(r.name);assert(expected&&r.bytes===expected.bytes&&r.sha256===expected.sha256,'Reopened original differs '+r.name);expectedMembers.delete(r.name);
  }});
 assert(!expectedMembers.size&&ordinary.members.length===original.entries.length,'Complete original member omitted');
 const rejected=[];
 async function rejects(name,run){let failed=false;try{await run();}catch{failed=true;}assert(failed,'Accepted '+name);rejected.push(name);}
 await rejects('changed encoded fragment',()=>Stream.streamPreparedPayloads(original.manifest,p=>original.objects[p]+'A',async()=>{}));
 await rejects('awaited output failure',()=>emit(prepare([{name:'original.txt',data:'Retained original'}]),3));
 const falseClaim=prepare([{name:'original.txt',data:'Retained original'}],true),poisoned=await emit(falseClaim);
 await rejects('incorrect raw SHA rejected by ordinary reopening',()=>readCompleteExportRanges({bytes:poisoned.bytes.length,read:async(o,n)=>poisoned.bytes.slice(o,o+n)},{...limits,expectedSha256:poisoned.receipt.sha256}));
 await rejects('unchanged default also rejects incorrect raw SHA',()=>Stream.streamPreparedExport(falseClaim.manifest,p=>falseClaim.objects[p],async()=>{}));
 const {members,...observed}=ordinary;
 return {schema:'commons.packed-payload-ordinary-readback-course.v1',sourceFiles:Object.keys(sourceBank).length,members:members.length,
  packedReceipt:packed.receipt,ordinaryReadback:{...observed,members:members.length},
  comparison:'Every complete source and working member equals the ordinary ZIP builder and is independently reopened against its original SHA',
  unalignedFragmentCharacters:650003,rejected,elapsedMs:Date.now()-start};
};
