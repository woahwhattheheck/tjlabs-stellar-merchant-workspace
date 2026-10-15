'use strict';

/** Deterministic ordinary-file ZIP archives in connected V8 and native Node.
 * No filesystem, process, network, Buffer or TextEncoder.
 * Original STORE output remains byte-identical. Optional ordinary DEFLATE
 * uses explicit raw-DEFLATE codec hooks when supplied, otherwise the maintained
 * connected_gzip encoder/decoder. Repeated identical byte objects reuse compressed
 * data and CRC values within one synchronous pack without trusting declared hashes.
 */

function utf8(value) {
  if (typeof value !== 'string') throw TypeError('UTF-8 input must be a string');
  let size=0;
  for (const char of value) {
    const cp=char.codePointAt(0);
    if (cp>=0xd800 && cp<=0xdfff) throw TypeError('Unpaired UTF-16 surrogate');
    size+=cp<0x80?1:cp<0x800?2:cp<0x10000?3:4;
  }
  const out=new Uint8Array(size); let at=0;
  for (const char of value) {
    const cp=char.codePointAt(0);
    if(cp<0x80) out[at++]=cp;
    else if(cp<0x800) {out[at++]=0xc0|(cp>>>6);out[at++]=0x80|(cp&63);}
    else if(cp<0x10000) {out[at++]=0xe0|(cp>>>12);out[at++]=0x80|((cp>>>6)&63);out[at++]=0x80|(cp&63);}
    else {out[at++]=0xf0|(cp>>>18);out[at++]=0x80|((cp>>>12)&63);out[at++]=0x80|((cp>>>6)&63);out[at++]=0x80|(cp&63);}
  }
  return out;
}
function utf8Text(bytes) {
  if(!(bytes instanceof Uint8Array)) throw TypeError('UTF-8 bytes are required');
  return decodeURIComponent(Array.from(bytes,b=>'%'+b.toString(16).padStart(2,'0')).join(''));
}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(bytes) {
  if(!(bytes instanceof Uint8Array)) throw TypeError('Binary bytes are required');
  const parts=[];
  for(let offset=0;offset<bytes.length;offset+=12288) {
    let part='';const end=Math.min(offset+12288,bytes.length);
    for(let i=offset;i<end;i+=3) {
      const a=bytes[i],b=i+1<end?bytes[i+1]:0,c=i+2<end?bytes[i+2]:0;
      part+=alphabet[a>>>2]+alphabet[((a&3)<<4)|(b>>>4)]+
        (i+1<end?alphabet[((b&15)<<2)|(c>>>6)]:'=')+(i+2<end?alphabet[c&63]:'=');
    }
    parts.push(part);
  }
  return parts.join('');
}
function fromBase64(value) {
  if(typeof value!=='string'||value.length%4||/[^A-Za-z0-9+/=]/.test(value)||
     (value.includes('=') && (value.indexOf('=')<value.length-2 || !/^[=]{1,2}$/.test(value.slice(value.indexOf('='))))))
    throw TypeError('Canonical base64 is required');
  const size=value.length/4*3-(value.endsWith('==')?2:value.endsWith('=')?1:0);
  const out=new Uint8Array(size);let at=0;
  for(let i=0;i<value.length;i+=4) {
    const a=alphabet.indexOf(value[i]),b=alphabet.indexOf(value[i+1]);
    const c=value[i+2]==='='?0:alphabet.indexOf(value[i+2]),d=value[i+3]==='='?0:alphabet.indexOf(value[i+3]);
    out[at++]=(a<<2)|(b>>>4);
    if(at<size)out[at++]=((b&15)<<4)|(c>>>2);
    if(at<size)out[at++]=((c&3)<<6)|d;
  }
  if(base64(out)!==value) throw TypeError('Noncanonical base64 padding');
  return out;
}
const crcTable=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}
function crc32(bytes) {
  if(!(bytes instanceof Uint8Array)) throw TypeError('Binary bytes are required');
  let c=0xffffffff;
  for(const value of bytes)c=crcTable[(c^value)&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function pathName(value) {
  if(typeof value!=='string'||!value||/[\x00-\x1f\x7f\\]/.test(value)||value.startsWith('/')||
     /^[A-Za-z]:/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'))
    throw TypeError('ZIP file names must be ordinary relative POSIX paths');
  const bytes=utf8(value);
  if(bytes.length>65535) throw RangeError('ZIP file name exceeds 65535 bytes');
  return bytes;
}
function limits(options) {
  const maxBytes=options.maxBytes??128*1024*1024,maxEntries=options.maxEntries??2000;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<22||maxBytes>0xffffffff||
     !Number.isInteger(maxEntries)||maxEntries<0||maxEntries>65535)
    throw RangeError('Use classic ZIP byte and entry limits');
  return {maxBytes,maxEntries};
}
function timeFields(timestamp) {
  const d=new Date(timestamp);
  if(!Number.isFinite(d.getTime())||d.getUTCFullYear()<1980||d.getUTCFullYear()>2107)
    throw RangeError('ZIP timestamps must be between 1980 and 2107');
  return {time:(d.getUTCHours()<<11)|(d.getUTCMinutes()<<5)|(d.getUTCSeconds()>>>1),
    date:((d.getUTCFullYear()-1980)<<9)|((d.getUTCMonth()+1)<<5)|d.getUTCDate()};
}
function checkPaths(records) {
  const names=records.map(r=>r.name.normalize('NFC').toLowerCase()),all=new Set(names);
  if(all.size!==names.length)throw TypeError('ZIP paths collide');
  for(const name of names){const parts=name.split('/');for(let i=1;i<parts.length;i++)
    if(all.has(parts.slice(0,i).join('/')))throw TypeError('A ZIP file is also a parent directory');}
}
function archiveOptions(options) {
  const selected=options.compression??'auto';
  if(!['store','deflate','auto'].includes(selected))throw TypeError('ZIP compression must be store, deflate or auto');
  const maxUncompressedBytes=options.maxUncompressedBytes??128*1024*1024;
  if(!Number.isSafeInteger(maxUncompressedBytes)||maxUncompressedBytes<0||maxUncompressedBytes>0x7fffffff)
    throw RangeError('Use a complete uncompressed ZIP byte limit up to 2 GiB minus one');
  const deflate=options.deflate??{};
  if(!deflate||typeof deflate!=='object'||Array.isArray(deflate))throw TypeError('ZIP DEFLATE options must be an object');
  return {selected,maxUncompressedBytes,deflate};
}
function packStoredZip(entries,options={}) { return packZipRecords(entries,options,false); }
function packZip(entries,options={}) { return packZipRecords(entries,options,true); }
function packZipRecords(entries,options,allowCompression) {
  const {maxBytes,maxEntries}=limits(options);
  if(!Array.isArray(entries)||entries.length>maxEntries) throw RangeError('ZIP entry collection exceeds its limit');
  const stamp=timeFields(options.timestamp??'1980-01-01T00:00:00Z');
  const compression=allowCompression?archiveOptions(options):null;
  const deflateRaw=options.deflateRaw;if(deflateRaw!==undefined&&typeof deflateRaw!=='function')throw TypeError('ZIP deflateRaw must be a function');
  const packedCache=new WeakMap(),crcCache=new WeakMap();
  let total=22,localBytes=0,centralBytes=0,uncompressedBytes=0;
  const records=entries.map(entry=>{
    const name=entry?.name,names=pathName(name),mode=entry.mode??0o644;
    if(!Number.isInteger(mode)||mode<0||mode>0o777) throw TypeError('ZIP member mode must be an ordinary file permission');
    const data=typeof entry.data==='string'?utf8(entry.data):entry.data;
    if(!(data instanceof Uint8Array)) throw TypeError('ZIP member data must be a UTF-8 string or Uint8Array');
    let packed=data,method=0;
    if(compression) {
      uncompressedBytes+=data.length;
      if(!Number.isSafeInteger(uncompressedBytes)||uncompressedBytes>compression.maxUncompressedBytes)
        throw RangeError('Complete uncompressed ZIP members exceed the selected limit');
      const selected=entry.compression??compression.selected;
      if(!['store','deflate','auto'].includes(selected))throw TypeError('ZIP member compression must be store, deflate or auto');
      if(selected!=='store') {
        let candidate=packedCache.get(data);
        if(!candidate) {
          const config={...compression.deflate,huffman:compression.deflate.huffman??'auto',
            max_input_bytes:Math.max(1,compression.maxUncompressedBytes)};
          candidate=deflateRaw?deflateRaw(data,config):require('./connected_gzip.cjs').deflateRawBytes(data,config).data;
          if(!(candidate instanceof Uint8Array))throw TypeError('ZIP compressor must return raw DEFLATE bytes');
          packedCache.set(data,candidate);
        }
        if(selected==='deflate'||candidate.length<data.length){packed=candidate;method=8;}
      }
    }
    const added=76+names.length*2+packed.length;
    if(!Number.isSafeInteger(total+added)||(total+=added)>maxBytes) throw RangeError('ZIP bytes exceed the selected limit');
    let crc=crcCache.get(data);if(crc===undefined){crc=crc32(data);crcCache.set(data,crc);}
    return {name,names,data,packed,method,mode,crc,bytes:data.length};
  }).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  return writePreparedRecords(records,options);
}
function writePreparedRecords(records,options){
  const {maxBytes,maxEntries}=limits(options);if(records.length>maxEntries)throw RangeError('ZIP entry collection exceeds its limit');
  const stamp=timeFields(options.timestamp??'1980-01-01T00:00:00Z');let total=22,localBytes=0,centralBytes=0;
  records=records.slice().sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  for(const r of records){const added=76+r.names.length*2+r.packed.length;if(!Number.isSafeInteger(total+added)||(total+=added)>maxBytes)throw RangeError('ZIP bytes exceed the selected limit');}
  checkPaths(records);
  for(const r of records){r.offset=localBytes;localBytes+=30+r.names.length+r.packed.length;centralBytes+=46+r.names.length;}
  const out=new Uint8Array(total),view=new DataView(out.buffer);let at=0;
  const u16=(o,v)=>view.setUint16(o,v,true),u32=(o,v)=>view.setUint32(o,v,true);
  for(const r of records) {
    u32(at,0x04034b50);u16(at+4,20);u16(at+6,0x800);u16(at+8,r.method);
    u16(at+10,stamp.time);u16(at+12,stamp.date);u32(at+14,r.crc);
    u32(at+18,r.packed.length);u32(at+22,r.bytes);u16(at+26,r.names.length);
    out.set(r.names,at+30);out.set(r.packed,at+30+r.names.length);at+=30+r.names.length+r.packed.length;
  }
  for(const r of records) {
    u32(at,0x02014b50);u16(at+4,(3<<8)|20);u16(at+6,20);u16(at+8,0x800);
    u16(at+10,r.method);u16(at+12,stamp.time);u16(at+14,stamp.date);u32(at+16,r.crc);
    u32(at+20,r.packed.length);u32(at+24,r.bytes);u16(at+28,r.names.length);
    u32(at+38,((0o100000|r.mode)<<16)>>>0);u32(at+42,r.offset);
    out.set(r.names,at+46);at+=46+r.names.length;
  }
  u32(at,0x06054b50);u16(at+8,records.length);u16(at+10,records.length);
  u32(at+12,centralBytes);u32(at+16,localBytes);
  return out;
}
/**
 * Prepare each member immediately and retain only its compressed bytes.
 * A checkpoint contains ordinary base64 member payloads and their CRC/lengths.
 * Resume inflates/checks one member at a time before admitting its prepared bytes.
 */
function createZipBuilder(options={},checkpoint=null){
  if(!options||typeof options!=='object'||Array.isArray(options))throw TypeError('ZIP builder options must be an object');
  if(checkpoint){
    if(checkpoint.schema!=='commons.prepared-zip.v1'||!checkpoint.options||!Array.isArray(checkpoint.entries)||!Array.isArray(checkpoint.payloads))throw TypeError('Unsupported prepared ZIP checkpoint');
    for(const key of ['timestamp','compression','deflate'])if(options[key]!==undefined&&JSON.stringify(options[key])!==JSON.stringify(checkpoint.options[key]))throw TypeError('Prepared ZIP output option changed: '+key);
    options={...checkpoint.options,...options};
  }
  const selectedLimits=limits(options),compression=archiveOptions(options),timestamp=options.timestamp??'1980-01-01T00:00:00Z';
  timeFields(timestamp);
  if(options.deflateRaw!==undefined&&typeof options.deflateRaw!=='function')throw TypeError('ZIP deflateRaw must be a function');
  if(options.inflateRaw!==undefined&&typeof options.inflateRaw!=='function')throw TypeError('ZIP inflateRaw must be a function');
  const stableOptions={timestamp,maxBytes:selectedLimits.maxBytes,maxEntries:selectedLimits.maxEntries,maxUncompressedBytes:compression.maxUncompressedBytes,compression:compression.selected,deflate:JSON.parse(JSON.stringify(compression.deflate))};
  const records=[],names=new Set(),byName=new Map(),restoredPayloads=new Map(),usedPayloads=new Set(),retainedPayloads=new WeakSet();let uncompressedBytes=0,packedBytes=22,retainedPackedBytes=0;
  const metadata=r=>({name:r.name,mode:r.mode,bytes:r.bytes,compressedBytes:r.packed.length,method:r.method,crc32:r.crc});
  function admit(r){
    if(records.length>=selectedLimits.maxEntries)throw RangeError('ZIP entry collection exceeds its limit');
    if(names.has(r.name))throw TypeError('Duplicate ZIP member '+r.name);
    if(!Number.isSafeInteger(uncompressedBytes+r.bytes)||uncompressedBytes+r.bytes>compression.maxUncompressedBytes)throw RangeError('Complete uncompressed ZIP members exceed the selected limit');
    const added=76+r.names.length*2+r.packed.length;
    if(!Number.isSafeInteger(packedBytes+added)||packedBytes+added>selectedLimits.maxBytes)throw RangeError('ZIP bytes exceed the selected limit');
    names.add(r.name);records.push(r);byName.set(r.name,r);if(!retainedPayloads.has(r.packed)){retainedPayloads.add(r.packed);retainedPackedBytes+=r.packed.length;}uncompressedBytes+=r.bytes;packedBytes+=added;return metadata(r);
  }
  function add(entry){
    const name=entry?.name,nameBytes=pathName(name),mode=entry.mode??0o644;
    if(!Number.isInteger(mode)||mode<0||mode>0o777)throw TypeError('ZIP member mode must be an ordinary file permission');
    const data=typeof entry.data==='string'?utf8(entry.data):entry.data;
    if(!(data instanceof Uint8Array))throw TypeError('ZIP member data must be a UTF-8 string or Uint8Array');
    if(!Number.isSafeInteger(uncompressedBytes+data.length)||uncompressedBytes+data.length>compression.maxUncompressedBytes)throw RangeError('Complete uncompressed ZIP members exceed the selected limit');
    const selected=entry.compression??compression.selected;
    if(!['store','deflate','auto'].includes(selected))throw TypeError('ZIP member compression must be store, deflate or auto');
    const prepared={};
    let packed,method=0;
    if(selected!=='store'){
      if(!prepared.deflated){
        const config={...compression.deflate,huffman:compression.deflate.huffman??'auto',max_input_bytes:Math.max(1,compression.maxUncompressedBytes)};
        const candidate=options.deflateRaw?options.deflateRaw(data,config):require('./connected_gzip.cjs').deflateRawBytes(data,config).data;
        if(!(candidate instanceof Uint8Array))throw TypeError('ZIP compressor must return raw DEFLATE bytes');
        prepared.deflated=new Uint8Array(candidate);
      }
      if(selected==='deflate'||prepared.deflated.length<data.length){packed=prepared.deflated;method=8;}
    }
    if(!packed){if(!prepared.stored)prepared.stored=new Uint8Array(data);packed=prepared.stored;}
    const crc=crc32(data);
    return admit({name,names:nameBytes,mode,packed,method,crc,bytes:data.length});
  }
  function copy(name,sourceName,mode){const prior=byName.get(sourceName);if(!prior)throw TypeError('Prepared ZIP source member missing');const actualMode=mode??prior.mode;if(!Number.isInteger(actualMode)||actualMode<0||actualMode>0o777)throw TypeError('ZIP member mode must be an ordinary file permission');return admit({...prior,name,names:pathName(name),mode:actualMode});}
  function restore(entry){
    const name=entry?.name,nameBytes=pathName(name),mode=entry.mode,bytes=entry.bytes,crc=entry.crc32,method=entry.method;
    if(!Number.isInteger(mode)||mode<0||mode>0o777||!Number.isSafeInteger(bytes)||bytes<0||bytes>0xffffffff||!Number.isInteger(crc)||crc<0||crc>0xffffffff||![0,8].includes(method)||!Number.isSafeInteger(entry.compressedBytes)||entry.compressedBytes<0||entry.compressedBytes>selectedLimits.maxBytes)throw TypeError('Prepared ZIP member metadata changed');
    if(!Number.isSafeInteger(uncompressedBytes+bytes)||uncompressedBytes+bytes>compression.maxUncompressedBytes)throw RangeError('Complete uncompressed ZIP members exceed the selected limit');
    if(!Number.isSafeInteger(entry.payload_index)||entry.payload_index<0||entry.payload_index>=checkpoint.payloads.length)throw TypeError('Prepared ZIP payload reference changed');
    const encodedPayload=checkpoint.payloads[entry.payload_index];if(typeof encodedPayload!=='string'||encodedPayload.length%4!==0||encodedPayload.length/4*3-(encodedPayload.endsWith('==')?2:encodedPayload.endsWith('=')?1:0)!==entry.compressedBytes||packedBytes+76+nameBytes.length*2+entry.compressedBytes>selectedLimits.maxBytes)throw TypeError('Prepared ZIP payload size changed or exceeds the selected limit');
    usedPayloads.add(entry.payload_index);const restoreKey=[entry.payload_index,bytes,crc,method,entry.compressedBytes].join(':');const previous=restoredPayloads.get(restoreKey);
    if(previous)return admit({name,names:nameBytes,mode,bytes,crc,method,packed:previous});
    const packed=fromBase64(encodedPayload);
    if(packed.length!==entry.compressedBytes)throw TypeError('Prepared ZIP compressed member length changed');
    const config={expected_bytes:bytes,expected_crc32:crc,max_output_bytes:Math.max(1,bytes),max_input_bytes:Math.max(1,Math.min(selectedLimits.maxBytes,0x7fffffff))};
    const data=method===0?packed:options.inflateRaw?options.inflateRaw(packed,config):require('./connected_gzip.cjs').inflateRawBytes(packed,config).data;
    if(!(data instanceof Uint8Array)||data.length!==bytes||crc32(data)!==crc)throw TypeError('Prepared ZIP original bytes changed: '+name);
    restoredPayloads.set(restoreKey,packed);return admit({name,names:nameBytes,mode,bytes,crc,method,packed});
  }
  if(checkpoint){if(checkpoint.entries.length>selectedLimits.maxEntries)throw RangeError('ZIP entry collection exceeds its limit');for(const entry of checkpoint.entries)restore(entry);if(usedPayloads.size!==checkpoint.payloads.length)throw TypeError('Prepared ZIP checkpoint contains unreferenced payloads');checkPaths(records);restoredPayloads.clear();}
  function snapshot(){
    const indices=new WeakMap(),payloads=[];const entries=records.map(r=>{let index=indices.get(r.packed);if(index===undefined){index=payloads.length;payloads.push(base64(r.packed));indices.set(r.packed,index);}return {...metadata(r),payload_index:index};});
    return {schema:'commons.prepared-zip.v1',options:{...stableOptions,deflate:JSON.parse(JSON.stringify(stableOptions.deflate))},entries,payloads};
  }
  function statistics(){return{entries:records.length,uncompressedBytes,archiveBytes:packedBytes,retainedPackedBytes};}
  return Object.freeze({add,copy,finish:()=>writePreparedRecords(records,stableOptions),snapshot,statistics,entries:()=>records.map(metadata)});
}

function readStoredZip(bytes,options={}) { return readZipRecords(bytes,options,false); }
function readZip(bytes,options={}) { return readZipRecords(bytes,options,true); }
function readZipRecords(bytes,options,allowCompression) {
  const visit=options.visitEntry;if(visit!==undefined&&typeof visit!=='function')throw TypeError('ZIP visitEntry must be a function');
  const {maxBytes,maxEntries}=limits(options);
  if(!(bytes instanceof Uint8Array)||bytes.length<22||bytes.length>maxBytes) throw TypeError('Complete ZIP bytes are required');
  const maxUncompressedBytes=allowCompression?archiveOptions(options).maxUncompressedBytes:maxBytes;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),end=bytes.length-22;
  const u16=o=>view.getUint16(o,true),u32=o=>view.getUint32(o,true);
  if(u32(end)!==0x06054b50||u16(end+4)||u16(end+6)||u16(end+20)||u16(end+8)!==u16(end+10))
    throw TypeError('Select the complete single-disk ZIP produced by this writer');
  const count=u16(end+10),central=u32(end+16),length=u32(end+12);
  if(count>maxEntries||central+length!==end) throw TypeError('ZIP directory is incomplete');
  const records=[];let at=central,localAt=0,uncompressedBytes=0;
  for(let i=0;i<count;i++) {
    if(at+46>end||u32(at)!==0x02014b50||u16(at+4)!==788||u16(at+6)!==20||u16(at+8)!==0x800||
       (!allowCompression&&u16(at+10)!==0)||(allowCompression&&![0,8].includes(u16(at+10)))||u16(at+30)||u16(at+32)||u16(at+34)||u16(at+36))
      throw TypeError('Unexpected ZIP member directory');
    const names=u16(at+28),size=u32(at+24),packedSize=u32(at+20),method=u16(at+10),
      offset=u32(at+42),crc=u32(at+16),mode=u32(at+38)>>>16;
    uncompressedBytes+=size;
    if(!Number.isSafeInteger(uncompressedBytes)||uncompressedBytes>maxUncompressedBytes)
      throw RangeError('Complete uncompressed ZIP members exceed the selected limit');
    if(at+46+names>end||(method===0&&size!==packedSize)||offset!==localAt||(mode&0o170000)!==0o100000||(mode&~0o100777))
      throw TypeError('ZIP member layout or file mode changed');
    if(offset+30>central||u32(offset)!==0x04034b50||u16(offset+4)!==20||u16(offset+6)!==0x800||
       u16(offset+8)!==method||u16(offset+10)!==u16(at+12)||u16(offset+12)!==u16(at+14)||
       u32(offset+14)!==crc||u32(offset+18)!==packedSize||u32(offset+22)!==size||u16(offset+26)!==names||u16(offset+28))
      throw TypeError('ZIP local member differs from its directory');
    const nameBytes=bytes.subarray(at+46,at+46+names),start=offset+30+names,finish=start+packedSize;
    if(finish>central) throw TypeError('ZIP member exceeds its original boundary');
    for(let j=0;j<names;j++)if(nameBytes[j]!==bytes[offset+30+j])throw TypeError('ZIP member names differ');
    const name=utf8Text(nameBytes);pathName(name);
    const packed=bytes.subarray(start,finish);
    const config={expected_bytes:size,expected_crc32:crc,max_output_bytes:Math.max(1,maxUncompressedBytes),
      max_input_bytes:Math.max(1,Math.min(maxBytes,0x7fffffff))};
    if(options.inflateRaw!==undefined&&typeof options.inflateRaw!=='function')throw TypeError('ZIP inflateRaw must be a function');
    const data=method===0?packed:options.inflateRaw?options.inflateRaw(packed,config):require('./connected_gzip.cjs').inflateRawBytes(packed,config).data;
    if(!(data instanceof Uint8Array)||data.length!==size)throw TypeError('ZIP inflated member length differs: '+name);
    if(crc32(data)!==crc)throw TypeError('ZIP member checksum changed: '+name);
    const record={name,mode:mode&0o777,data,crc32:crc,bytes:size,
      ...(allowCompression?{method,compressedBytes:packedSize}:{})};
    if(visit){visit(record);const {data:discard,...metadata}=record;records.push(metadata);}else records.push(record);
    localAt=finish;at+=46+names;
  }
  if(at!==end||localAt!==central)throw TypeError('ZIP contains extra member or directory bytes');
  checkPaths(records);
  return records;
}
module.exports={utf8,utf8Text,base64,fromBase64,crc32,packStoredZip,readStoredZip,packZip,readZip,createZipBuilder};
