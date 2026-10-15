'use strict';
const Z=require('./connected_zip.cjs'),H=require('./sha256.cjs'),P=require('./vendor/pako.cjs');
const {readZipRanges}=require('./ordinary-zip-range.cjs');
const {createStreamedArchiveSource}=require('./streamed-archive-source.cjs');
const {createChunkSink}=require('./prepared-stream.cjs');
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const options={maxBytes:512*1024*1024,maxUncompressedBytes:1024*1024*1024,maxEntries:65535};
async function verifyOrdinaryZipRange(files,workingHtml){
 if(!files||typeof files!=='object'||typeof workingHtml!=='string')throw TypeError('Provide an actual complete source bank and its generated working HTML');
 const start=Date.now(),entries=Object.entries(files).map(([name,data])=>({name:'source/'+name,data}));
 entries.push({name:'working/Procurement_Editable.html',data:workingHtml},
 {name:'range-course/Unicode-😀.txt',data:'Original UTF-8: café, 😀, \u0000 and CRLF\r\n'},
 {name:'range-course/binary.bin',data:Uint8Array.from({length:1024},(_,i)=>i%256)},
 {name:'range-course/empty.bin',data:new Uint8Array()});
 const archive=Z.packZip(entries,{...options,compression:'auto',deflateRaw:bytes=>P.deflateRaw(bytes,{level:1})});
 const expected=new Map(),ordinary=Z.readZip(archive,{...options,inflateRaw:bytes=>P.inflateRaw(bytes),
 visitEntry:e=>expected.set(e.name,{name:e.name,mode:e.mode,crc32:e.crc32,bytes:e.bytes,method:e.method,compressedBytes:e.compressedBytes,sha256:H.sha256Bytes(e.data).sha256})});
 const objects={},sink=createChunkSink(async p=>{objects[p.path]=p.content;},{partBytes:487500});
 for(let at=0;at<archive.length;at+=65536)await sink.write(archive.subarray(at,Math.min(at+65536,archive.length)));
 const archiveIdentity=H.sha256Bytes(archive),manifest=await sink.finish({schema:'commons.streamed-complete-export.v1',...archiveIdentity});
 let visits=0,captured=0;
 const source=createStreamedArchiveSource(manifest,p=>Promise.resolve(objects[p.path]));
 const receipt=await readZipRanges(source,{...options,expectedSha256:manifest.sha256,
 captureEntry:r=>r.name.startsWith('range-course/'),
 visitEntry:r=>{
  const {data,...meta}=r;assert(JSON.stringify(meta)===JSON.stringify(expected.get(r.name)),'Ordinary member metadata differs: '+r.name);visits++;
  if(data){captured++;const original=entries.find(e=>e.name===r.name).data,bytes=typeof original==='string'?Z.utf8(original):original;
  assert(data.length===bytes.length&&data.every((v,i)=>v===bytes[i]),'Captured original differs');}
 }});
 assert(receipt.bytes===archive.length&&receipt.sha256===archiveIdentity.sha256&&visits===entries.length&&captured===3,'Complete ordinary range receipt differs');
 assert(receipt.transportBytes===archive.length,'Reader did not hash each original archive byte exactly once');
 assert(ordinary.length===receipt.members.length,'Ordinary/range member count differs');
 const tiny=Z.packZip([{name:'a',data:'first original first original'},{name:'b',data:'second original second original'}],
 {...options,compression:'store'}),rejected=[];
 async function rejects(name,run){let failed=false;try{await run();}catch{failed=true;}assert(failed,'Accepted invalid case: '+name);rejected.push(name);}
 async function parse(bytes,extra={}){return readZipRanges({bytes:bytes.length,read:(offset,length)=>Promise.resolve(bytes.slice(offset,offset+length))},{...options,...extra});}
 function changed(mutator){const bytes=tiny.slice();mutator(bytes,new DataView(bytes.buffer));return bytes;}
 await rejects('trailing archive byte',()=>parse(Uint8Array.from([...tiny,0])));
 await rejects('local/central name mismatch',()=>parse(changed(b=>{b[30]=99;})));
 await rejects('overlapping member offsets',()=>parse(changed((b,v)=>{const c=v.getUint32(b.length-6,true);v.setUint32(c+47+42,0,true);})));
 await rejects('UTF-8 name scalar',()=>parse(changed((b,v)=>{const c=v.getUint32(b.length-6,true);b[30]=255;b[c+46]=255;})));
 await rejects('normalized path collision',()=>parse(changed((b,v)=>{const c=v.getUint32(b.length-6,true),second=c+47,local=v.getUint32(second+42,true);b[local+30]=65;b[second+46]=65;})));
 await rejects('declared expanded capacity',()=>parse(tiny,{maxUncompressedBytes:1}));
 const deflated=Z.packZip([{name:'deflated',data:'repeat '.repeat(100)}],
 {...options,compression:'deflate',deflateRaw:bytes=>P.deflateRaw(bytes,{level:1})});
 const dv=new DataView(deflated.buffer),central=dv.getUint32(deflated.length-6,true),trailing=new Uint8Array(deflated.length+1);
 trailing.set(deflated.subarray(0,central));trailing[central]=0;trailing.set(deflated.subarray(central),central+1);
 const tv=new DataView(trailing.buffer);tv.setUint32(18,tv.getUint32(18,true)+1,true);tv.setUint32(central+1+20,tv.getUint32(central+1+20,true)+1,true);
 tv.setUint32(trailing.length-6,central+1,true);
 await rejects('trailing DEFLATE payload',()=>parse(trailing));
 await rejects('changed original chunk text',async()=>{
  const bad=createStreamedArchiveSource(manifest,p=>Promise.resolve(objects[p.path].replace(/^./,objects[p.path][0]==='A'?'B':'A')));
  await bad.read(0,1);
 });
 await rejects('changed whole archive identity',()=>parse(tiny,{expectedSha256:'0'.repeat(64)}));
 return {schema:'commons.ordinary-zip-range-course.v1',sourceFiles:Object.keys(files).length,members:visits,
 ...archiveIdentity,uncompressedBytes:receipt.uncompressedBytes,transportBytes:receipt.transportBytes,
 directoryBytes:receipt.directoryBytes,parts:manifest.parts.length,sourceStats:source.stats(),
 maxCapturedBytes:receipt.maxCapturedBytes,maxInflatedChunkBytes:receipt.maxInflatedChunkBytes,
 ordinaryComparison:'Every member name, mode, CRC, size, compression, packed size and SHA equals production readZip',
 rejected,elapsedMs:Date.now()-start};
}
module.exports={verifyOrdinaryZipRange};
