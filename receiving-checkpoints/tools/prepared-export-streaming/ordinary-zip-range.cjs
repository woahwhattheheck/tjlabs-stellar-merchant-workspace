'use strict';

/** Strict asynchronous reader for the ordinary classic ZIP emitted by connected_zip.
 * Transport is {bytes, read(offset,length)}. Reads exact local bytes in order after
 * bounded directory lookahead; hashes the whole ZIP during the same member pass.
 * Keeps metadata and inflater output chunks, never the complete archive.
 */
const H=require('./sha256.cjs'),T=require('./text.cjs'),P=require('./vendor/pako.cjs');
const HEX=/^[a-f0-9]{64}$/;
const fail=message=>{throw new TypeError(message);};
const integer=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const crcTable=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}
function settings(options){
 const out={maxBytes:options.maxBytes??128*1024*1024,maxEntries:options.maxEntries??2000,
 maxUncompressedBytes:options.maxUncompressedBytes??128*1024*1024,
 maxDirectoryBytes:options.maxDirectoryBytes??32*1024*1024,
 maxCapturedEntryBytes:options.maxCapturedEntryBytes??16*1024*1024,
 chunkBytes:options.chunkBytes??65536};
 if(!integer(out.maxBytes,0xffffffff)||out.maxBytes<22||!integer(out.maxEntries,65535)||
 !integer(out.maxUncompressedBytes,0x7fffffff)||!integer(out.maxDirectoryBytes,0x7fffffff)||
 !integer(out.maxCapturedEntryBytes,0x7fffffff)||!integer(out.chunkBytes,1024*1024)||!out.chunkBytes)
 fail('Invalid ordinary ZIP range limits');
 for(const key of ['captureEntry','visitEntry'])if(options[key]!==undefined&&typeof options[key]!=='function')fail(key+' must be a function');
 if(options.expectedSha256!==undefined&&!HEX.test(options.expectedSha256))fail('Invalid expected ZIP SHA-256');
 return out;
}
function checkName(bytes){
 const name=T.decode(bytes);
 if(typeof name!=='string'||!name||/[\x00-\x1f\x7f\\]/.test(name)||name.startsWith('/')||
 /^[A-Za-z]:/.test(name)||name.split('/').some(p=>!p||p==='.'||p==='..'))fail('ZIP file names must be ordinary relative POSIX paths');
 return name;
}
function checkPaths(records){
 const names=records.map(r=>r.name.normalize('NFC').toLowerCase()),all=new Set(names);
 if(all.size!==names.length)fail('ZIP paths collide');
 for(const name of names){const parts=name.split('/');for(let i=1;i<parts.length;i++)
 if(all.has(parts.slice(0,i).join('/')))fail('A ZIP file is also a parent directory');}
}
function view(bytes){return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);}
async function readZipRanges(source,options={}){
 const limits=settings(options);
 if(!source||!integer(source.bytes,limits.maxBytes)||source.bytes<22||typeof source.read!=='function')
 fail('Provide the complete ZIP length and an asynchronous exact range reader');
 let requests=0,transportBytes=0;
 async function read(offset,length){
  if(!integer(offset,source.bytes)||!integer(length,source.bytes-offset))fail('ZIP range exceeds the original boundary');
  const bytes=await source.read(offset,length);requests++;transportBytes+=length;
  if(!(bytes instanceof Uint8Array)||bytes.length!==length)fail('ZIP range returned a different length');
  return bytes;
 }
 const endOffset=source.bytes-22,end=await read(endOffset,22),ev=view(end);
 if(ev.getUint32(0,true)!==0x06054b50||ev.getUint16(4,true)||ev.getUint16(6,true)||
 ev.getUint16(20,true)||ev.getUint16(8,true)!==ev.getUint16(10,true))
 fail('Select the complete single-disk ZIP produced by this writer');
 const count=ev.getUint16(10,true),centralOffset=ev.getUint32(16,true),centralLength=ev.getUint32(12,true);
 if(count>limits.maxEntries||centralLength>limits.maxDirectoryBytes||centralOffset+centralLength!==endOffset)
 fail('ZIP directory is incomplete or exceeds the selected limit');
 const central=await read(centralOffset,centralLength),cv=view(central),records=[];
 let at=0,localAt=0,uncompressedBytes=0;
 for(let i=0;i<count;i++){
  if(at+46>central.length||cv.getUint32(at,true)!==0x02014b50||cv.getUint16(at+4,true)!==788||
  cv.getUint16(at+6,true)!==20||cv.getUint16(at+8,true)!==0x800||![0,8].includes(cv.getUint16(at+10,true))||
  cv.getUint16(at+30,true)||cv.getUint16(at+32,true)||cv.getUint16(at+34,true)||cv.getUint16(at+36,true))
  fail('Unexpected ZIP member directory');
  const names=cv.getUint16(at+28,true),size=cv.getUint32(at+24,true),packed=cv.getUint32(at+20,true),
  method=cv.getUint16(at+10,true),offset=cv.getUint32(at+42,true),crc=cv.getUint32(at+16,true),
  mode=cv.getUint32(at+38,true)>>>16;
  uncompressedBytes+=size;
  if(!Number.isSafeInteger(uncompressedBytes)||uncompressedBytes>limits.maxUncompressedBytes)
  fail('Complete uncompressed ZIP members exceed the selected limit');
  if(at+46+names>central.length||(method===0&&size!==packed)||offset!==localAt||
  (mode&0o170000)!==0o100000||(mode&~0o100777))fail('ZIP member layout or file mode changed');
  const nameBytes=central.subarray(at+46,at+46+names),name=checkName(nameBytes),start=offset+30+names,finish=start+packed;
  if(start>centralOffset||finish>centralOffset)fail('ZIP member exceeds its original boundary');
  records.push({name,mode:mode&0o777,crc32:crc,bytes:size,method,compressedBytes:packed,
    offset,start,finish,nameBytes,time:cv.getUint16(at+12,true),date:cv.getUint16(at+14,true)});
  localAt=finish;at+=46+names;
 }
 if(at!==central.length||localAt!==centralOffset)fail('ZIP contains extra member or directory bytes');
 checkPaths(records);
 const archiveHash=H.createSha256ByteHasher(),members=[];
 let maxCapturedBytes=0,maxInflatedChunkBytes=0;
 for(const r of records){
  const header=await read(r.offset,30+r.nameBytes.length),lv=view(header);
  if(lv.getUint32(0,true)!==0x04034b50||lv.getUint16(4,true)!==20||lv.getUint16(6,true)!==0x800||
  lv.getUint16(8,true)!==r.method||lv.getUint16(10,true)!==r.time||lv.getUint16(12,true)!==r.date||
  lv.getUint32(14,true)!==r.crc32||lv.getUint32(18,true)!==r.compressedBytes||lv.getUint32(22,true)!==r.bytes||
  lv.getUint16(26,true)!==r.nameBytes.length||lv.getUint16(28,true))fail('ZIP local member differs from its directory');
  for(let j=0;j<r.nameBytes.length;j++)if(header[30+j]!==r.nameBytes[j])fail('ZIP member names differ');
  archiveHash.update(header);
  const metadata={name:r.name,mode:r.mode,crc32:r.crc32,bytes:r.bytes,method:r.method,compressedBytes:r.compressedBytes};
  const capture=options.captureEntry?options.captureEntry(Object.freeze({...metadata})):false;
  if(typeof capture!=='boolean')fail('captureEntry must return a boolean');
  if(capture&&r.bytes>limits.maxCapturedEntryBytes)fail('Captured ZIP member exceeds the selected limit');
  const memberHash=H.createSha256ByteHasher(),captured=capture?new Uint8Array(r.bytes):null;
  let seen=0,crc=0xffffffff;
  function original(bytes){
   if(!(bytes instanceof Uint8Array)||seen+bytes.length>r.bytes)fail('Inflated ZIP member exceeds its declared size');
   memberHash.update(bytes);for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);
   if(captured)captured.set(bytes,seen);seen+=bytes.length;
   maxInflatedChunkBytes=Math.max(maxInflatedChunkBytes,bytes.length);
  }
  const inflater=r.method===8?new P.Inflate({raw:true,chunkSize:limits.chunkBytes}):null;
  if(inflater)inflater.onData=original;
  for(let offset=r.start;offset<r.finish;){
   const packed=await read(offset,Math.min(limits.chunkBytes,r.finish-offset));offset+=packed.length;
   archiveHash.update(packed);
   if(inflater){
    if(inflater.ended)fail('Trailing compressed ZIP member bytes');
    if(!inflater.push(packed,offset===r.finish)||inflater.err||inflater.strm?.avail_in)fail('Invalid or trailing ZIP DEFLATE data');
   }else original(packed);
  }
  if(inflater&&!inflater.ended)fail('Incomplete ZIP DEFLATE stream');
  if(seen!==r.bytes||((crc^0xffffffff)>>>0)!==r.crc32)fail('ZIP member size or checksum changed: '+r.name);
  metadata.sha256=memberHash.digest().sha256;
  members.push(metadata);
  if(captured)maxCapturedBytes=Math.max(maxCapturedBytes,captured.length);
  if(options.visitEntry)await options.visitEntry(captured?{...metadata,data:captured}:{...metadata});
 }
 archiveHash.update(central);archiveHash.update(end);
 const archive=archiveHash.digest();
 if(archive.bytes!==source.bytes||(options.expectedSha256!==undefined&&archive.sha256!==options.expectedSha256))
 fail('Complete ZIP bytes or SHA-256 differ');
 return {schema:'commons.ordinary-zip-range-receipt.v1',...archive,members,
   uncompressedBytes,directoryBytes:centralLength,transportBytes,rangeRequests:requests,maxCapturedBytes,maxInflatedChunkBytes};
}
async function readCompleteExportRanges(source,options={}){
 let manifest,manifestIdentity;
 const capture=options.captureEntry,visit=options.visitEntry;
 if(capture!==undefined&&typeof capture!=='function'||visit!==undefined&&typeof visit!=='function')
 fail('Export capture and visitor must be functions');
 const receipt=await readZipRanges(source,{...options,
 captureEntry:entry=>entry.name==='EXPORT_MANIFEST.json'?true:capture?capture(entry):false,
 visitEntry:async entry=>{
  if(entry.name==='EXPORT_MANIFEST.json'){
   manifest=T.parse(T.decode(entry.data));
   manifestIdentity={bytes:entry.bytes,sha256:entry.sha256};
  }
  if(visit)await visit(entry);
 }});
 if(!manifest||!Array.isArray(manifest.files)||manifest.files.length!==receipt.members.length-1)
 fail('Complete export manifest membership differs');
 const originals=new Map(receipt.members.filter(e=>e.name!=='EXPORT_MANIFEST.json').map(e=>[e.name,e]));
 for(const item of manifest.files){
  const original=originals.get(item?.path);
  if(!original||item.bytes!==original.bytes||item.sha256!==original.sha256)
  fail('Complete export manifest member differs: '+item?.path);
  originals.delete(item.path);
 }
 if(originals.size)fail('Complete export manifest omits members');
 return {...receipt,exportManifest:{...manifestIdentity,members:manifest.files.length}};
}
module.exports={readZipRanges,readCompleteExportRanges};
