'use strict';
const Z=require('./connected_zip.cjs'),H=require('./sha256.cjs'),P=require('./vendor/pako.cjs'),S=require('./checkpoint-storage.cjs'),Stream=require('./prepared-stream.cjs');
module.exports=async function verify(sourceBank,workingHTML){
 const start=Date.now(),assert=(x,m)=>{if(!x)throw Error(m);},clone=x=>JSON.parse(JSON.stringify(x)),codec={hashText:s=>H.sha256Utf8(s).sha256,utf8Encode:Z.utf8};
 const options={timestamp:'2026-10-15T00:00:00Z',maxBytes:256*1024*1024,maxUncompressedBytes:512*1024*1024,maxEntries:60000,compression:'auto',deflateRaw:b=>P.deflateRaw(b,{level:1}),inflateRaw:b=>P.inflateRaw(b)};
 const original=Object.entries(sourceBank).map(([path,data])=>({name:'source/'+path,data}));
 original.push({name:'working/Procurement_Editable.html',data:workingHTML},{name:'current/original-binary.bin',data:Uint8Array.from({length:10007},(_,i)=>(i*73+19)&255)},{name:'current/Größe_日本語.txt',data:'Original \u0000 bytes\r\nwith UTF-8 — untouched\n'},{name:'current/empty.bin',data:new Uint8Array()});
 function build(items){const zip=Z.createZipBuilder(options),entries=[],groups=[];for(const e of items){const b=typeof e.data==='string'?Z.utf8(e.data):e.data;zip.add(e);groups.push({key:e.name,start:entries.length,count:1});entries.push({name:e.name,...H.sha256Bytes(b)});}const manifest={schema:'commons.verification-export.v1',files:entries.map(e=>({path:e.name,bytes:e.bytes,sha256:e.sha256}))},text=JSON.stringify(manifest,null,2)+'\n';zip.add({name:'EXPORT_MANIFEST.json',data:text});entries.push({name:'EXPORT_MANIFEST.json',...H.sha256Utf8(text)});return {zip,checkpoint:{schema:'commons.complete-export-job.v1',identity:H.sha256Utf8(JSON.stringify(entries)).sha256,done:true,groups,entries,archive:zip.snapshot()}};}
 const first=build(original),durable=S.prepare(first.checkpoint,codec),chunks=[],emitted=[];
 const receipt=await Stream.streamPreparedExport(durable.manifest,p=>durable.objects[p],async b=>{chunks.push(new Uint8Array(b));}, {observeMember:x=>emitted.push(x)});
 const expected=first.zip.finish(),out=new Uint8Array(receipt.bytes);let at=0;for(const b of chunks){out.set(b,at);at+=b.length;}
 assert(receipt.sha256===H.sha256Bytes(expected).sha256&&H.sha256Bytes(out).sha256===receipt.sha256,'Full source streamed ZIP differs');
 const reread=Z.readZip(out,{...options,visitEntry:r=>{const e=first.checkpoint.entries.find(e=>e.name===r.name);assert(e&&H.sha256Bytes(r.data).sha256===e.sha256,'Reopened member differs '+r.name);}});
 assert(reread.length===first.checkpoint.entries.length&&emitted.length===reread.length,'Missing source members');
 const written={},sink=Stream.createChunkSink(async part=>{written[part.path]=part.content;},{partBytes:7919});
 const second=await Stream.streamPreparedExport(durable.manifest,p=>durable.objects[p],sink.write),published=await sink.finish(second),rehash=H.createSha256ByteHasher();
 for(const part of published.parts){const b=Z.fromBase64(written[part.path]);assert(H.sha256Bytes(b).sha256===part.decodedSha256,'Published part differs');rehash.update(b);}
 assert(rehash.digest().sha256===receipt.sha256,'Published archive differs');
 const selected=original.filter(e=>e.name.startsWith('source/')).slice(0,2).map(e=>({name:e.name,expectedSha256:H.sha256Utf8(e.data).sha256,content:e.data+'\n// Source successor verification.\n'}));
 selected.push({name:'working/Procurement_Editable.html',expectedSha256:H.sha256Utf8(workingHTML).sha256,content:workingHTML+'\n<!-- Source successor verification. -->\n'});
 const successor=await Stream.deriveSourceSuccessor(durable.manifest,p=>durable.objects[p],selected,{sourceVersion:'verification-source-successor'}),joined={...durable.objects,...successor.objects};
 const changed=new Map(selected.map(x=>[x.name,x.content])),fresh=build(original.map(e=>({...e,data:changed.get(e.name)??e.data})));
 const successorReceipt=await Stream.streamPreparedExport(successor.manifest,p=>joined[p],async()=>{});
 assert(successorReceipt.sha256===H.sha256Bytes(fresh.zip.finish()).sha256,'Source-only successor differs from fresh ordinary archive');
 const unaligned=S.prepare(first.checkpoint,codec,4099),unalignedReceipt=await Stream.streamPreparedExport(unaligned.manifest,p=>unaligned.objects[p],async()=>{});
 assert(unalignedReceipt.sha256===receipt.sha256,'Unaligned durable fragments change archive');
 const rejected=[];async function rejects(name,fn){try{await fn();}catch{rejected.push(name);return;}throw Error('Expected rejection: '+name);}
 await rejects('missing durable object',()=>Stream.streamPreparedExport(durable.manifest,()=>undefined,async()=>{}));
 await rejects('changed durable fragment',()=>Stream.streamPreparedExport(durable.manifest,p=>durable.objects[p]+'x',async()=>{}));
 const incomplete=clone(durable.manifest);incomplete.done=false;await rejects('incomplete job',()=>Stream.streamPreparedExport(incomplete,p=>durable.objects[p],async()=>{}));
 await rejects('protected historical output',()=>Stream.deriveSourceSuccessor(durable.manifest,p=>durable.objects[p],[{name:'current/empty.bin',expectedSha256:H.sha256Bytes(new Uint8Array()).sha256,content:'changed'}],{sourceVersion:'bad'}));
 await rejects('changed source preimage',()=>Stream.deriveSourceSuccessor(durable.manifest,p=>durable.objects[p],[{...selected[0],expectedSha256:'0'.repeat(64)}],{sourceVersion:'bad'}));
 let sinkCalls=0;await rejects('output failure stops finalization',()=>Stream.streamPreparedExport(durable.manifest,p=>durable.objects[p],async()=>{if(++sinkCalls===3)throw Error('write rejected');}));assert(sinkCalls===3,'Sink continued after failure');
 const failed=Stream.createChunkSink(async()=>{throw Error('provider rejected');},{partBytes:1});await rejects('unacknowledged publication',()=>failed.write(Uint8Array.of(1)));await rejects('failed publication finalization',()=>failed.finish(receipt));
 return {schema:'commons.prepared-stream-full-source-result.v1',sourceFiles:Object.keys(sourceBank).length,receipt,sourceSuccessor:successorReceipt,publishedParts:published.parts.length,unalignedPartCharacters:4099,rejected,elapsedMs:Date.now()-start};
};
