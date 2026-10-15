'use strict';
/*
 * Stream a completed durable prepared export to an awaited byte sink.
 * Retain metadata and one input fragment, never the complete ZIP/base64 payload.
 * A sink must publish/rename its final artifact only after this function returns.
 */
const Z=require('../src/connected_zip.cjs'),H=require('../sha256.cjs'),T=require('../text.cjs'),P=require('../vendor/pako.cjs');
const HEX=/^[a-f0-9]{64}$/;
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=s=>{throw Error(s);};
const integer=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const table=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
function reference(ref,max){if(!ref||!integer(ref.bytes,max)||!HEX.test(ref.sha256)||!Array.isArray(ref.parts))fail('Invalid durable reference');let sum=0;for(const p of ref.parts){if(!p||!HEX.test(p.sha256)||p.path!=='objects/'+p.sha256+'.part'||!integer(p.bytes,max)||!p.bytes)fail('Invalid durable fragment');sum+=p.bytes;}if(sum!==ref.bytes)fail('Durable fragment lengths differ');}
function settings(options){return{maxPartBytes:options.maxPartBytes??4*1024*1024,maxMetadataBytes:options.maxMetadataBytes??16*1024*1024,maxManifestBytes:options.maxManifestBytes??16*1024*1024};}
async function fragments(ref,read,consume,limits,stats){
 reference(ref,0xffffffff);const hash=H.createSha256ByteHasher();
 for(const p of ref.parts){if(p.bytes>limits.maxPartBytes)fail('Fragment exceeds selected streaming limit');const text=await read(p.path);
 if(typeof text!=='string')fail('Missing durable fragment '+p.path);const bytes=T.encode(text);
 if(bytes.length!==p.bytes||H.sha256Bytes(bytes).sha256!==p.sha256)fail('Changed durable fragment '+p.path);
 hash.update(bytes);stats.maxInputFragmentBytes=Math.max(stats.maxInputFragmentBytes,bytes.length);await consume(text);}
 const got=hash.digest();if(got.bytes!==ref.bytes||got.sha256!==ref.sha256)fail('Complete durable reference differs');
}
async function readText(ref,read,limits,stats,max){if(ref?.bytes>max)fail('Metadata exceeds selected streaming limit');let value='';await fragments(ref,read,t=>{value+=t;},limits,stats);return value;}
function pathBytes(name){if(typeof name!=='string'||!name||/[\x00-\x1f\x7f\\]/.test(name)||name.startsWith('/')||/^[A-Za-z]:/.test(name)||name.split('/').some(p=>!p||p==='.'||p==='..'))fail('Unsafe archive path');const bytes=T.encode(name);if(bytes.length>65535)fail('Archive path exceeds ZIP limit');return bytes;}
function layout(checkpoint,index){
 if(checkpoint?.schema!=='commons.complete-export-job.v1'||checkpoint.done!==true||index.done!==true||checkpoint.identity!==index.identity||!Array.isArray(checkpoint.groups)||!Array.isArray(checkpoint.entries)||checkpoint.groups.length!==index.completedGroups||checkpoint.entries.length!==index.entries)fail('Completed export index differs');
 const a=checkpoint.archive,o=a?.options;
 if(a?.schema!=='commons.prepared-zip.v1'||!o||!Array.isArray(a.entries)||a.entries.length!==checkpoint.entries.length||!Array.isArray(index.payloads)||a.payloads!==undefined)fail('Prepared archive metadata differs');
 if(!integer(o.maxBytes,0xffffffff)||o.maxBytes<22||!integer(o.maxEntries,65535)||!integer(o.maxUncompressedBytes,0x7fffffff)||a.entries.length>o.maxEntries||!['store','deflate','auto'].includes(o.compression)||!o.deflate||typeof o.deflate!=='object'||Array.isArray(o.deflate))fail('Prepared archive options differ');
 const d=new Date(o.timestamp);if(!Number.isFinite(d.getTime())||d.getUTCFullYear()<1980||d.getUTCFullYear()>2107)fail('Invalid ZIP timestamp');
 const stamp={time:(d.getUTCHours()<<11)|(d.getUTCMinutes()<<5)|(d.getUTCSeconds()>>>1),date:((d.getUTCFullYear()-1980)<<9)|((d.getUTCMonth()+1)<<5)|d.getUTCDate()};
 let covered=0;const keys=new Set();for(const g of checkpoint.groups){if(!g||typeof g.key!=='string'||!g.key||keys.has(g.key)||g.start!==covered||!integer(g.count,65535))fail('Export group coverage differs');keys.add(g.key);covered+=g.count;}
 if(covered+1!==a.entries.length||checkpoint.entries.at(-1)?.name!=='EXPORT_MANIFEST.json')fail('Incomplete completed export groups');
 const names=new Set(),used=new Set();let raw=0;const records=a.entries.map((e,i)=>{
  const declared=checkpoint.entries[i],nb=pathBytes(e?.name),key=e.name.normalize('NFC').toLowerCase();
  if(names.has(key))fail('Archive paths collide');names.add(key);
  if(!declared||declared.name!==e.name||declared.bytes!==e.bytes||!HEX.test(declared.sha256)||!integer(e.mode,0o777)||!integer(e.bytes,0xffffffff)||!integer(e.compressedBytes,o.maxBytes)||!integer(e.crc32,0xffffffff)||![0,8].includes(e.method)||!integer(e.payload_index,index.payloads.length-1))fail('Archive member metadata differs');
  if(e.method===0&&e.bytes!==e.compressedBytes)fail('STORE member lengths differ');
  reference(index.payloads[e.payload_index],0xffffffff);if(index.payloads[e.payload_index].bytes!==Math.ceil(e.compressedBytes/3)*4)fail('Base64 payload length differs');used.add(e.payload_index);raw+=e.bytes;
  return {...e,sha256:declared.sha256,nameBytes:nb};
 }).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
 for(const name of names){const bits=name.split('/');for(let n=1;n<bits.length;n++)if(names.has(bits.slice(0,n).join('/')))fail('Archive file is also a parent directory');}
 if(used.size!==index.payloads.length||raw>o.maxUncompressedBytes)fail('Unused payload or excessive original bytes');
 let local=0,central=0;for(const r of records){r.offset=local;local+=30+r.nameBytes.length+r.compressedBytes;central+=46+r.nameBytes.length;}
 const total=local+central+22;if(total>o.maxBytes)fail('Archive exceeds ZIP limit');
 return{records,stamp,local,central,total,raw};
}
async function open(index,read,options={}){
 if(index?.schema!=='commons.complete-export-checkpoint-storage.v1'||typeof read!=='function')fail('Choose a durable completed export');
 const limits=settings(options),stats={maxInputFragmentBytes:0,maxOutputChunkBytes:0};
 for(const [k,v]of Object.entries(limits))if(!integer(v,0x7fffffff)||!v)fail('Invalid streaming limit '+k);
 const metadata=await readText(index.metadata,read,limits,stats,limits.maxMetadataBytes),checkpoint=T.parse(metadata);
 return{index,read,limits,stats,checkpoint,layout:layout(checkpoint,index)};
}
function checkManifest(manifest,checkpoint){
 if(!manifest||!Array.isArray(manifest.files)||manifest.files.length!==checkpoint.entries.length-1)fail('Export manifest membership differs');
 const byName=new Map(checkpoint.entries.slice(0,-1).map(e=>[e.name,e]));for(const e of manifest.files){const original=byName.get(e?.path);if(!original||original.bytes!==e.bytes||original.sha256!==e.sha256)fail('Export manifest member differs');byName.delete(e.path);}
 if(byName.size)fail('Export manifest omits members');
}
async function member(context,r,packedSink,collect=false){
 const {index,read,limits,stats}=context,hash=H.createSha256ByteHasher(),chunks=[];let count=0,crc=0xffffffff,packedCount=0,carry='';
 if(collect&&r.bytes>limits.maxManifestBytes)fail('Export manifest exceeds selected limit');
 function original(bytes){count+=bytes.length;if(count>r.bytes)fail('Inflated member exceeds declared bytes');hash.update(bytes);for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);if(collect)chunks.push(new Uint8Array(bytes));}
 const inflater=r.method===8?new P.Inflate({raw:true,chunkSize:65536}):null;if(inflater)inflater.onData=original;
 async function consume(encoded,last){
  if(!last&&encoded.includes('='))fail('Premature base64 padding');const bytes=Z.fromBase64(encoded);packedCount+=bytes.length;if(packedCount>r.compressedBytes)fail('Compressed member exceeds declared bytes');
  if(inflater){if(inflater.ended&&bytes.length)fail('Trailing compressed bytes');if(!inflater.ended){const ok=inflater.push(bytes,last);if(!ok||inflater.err||inflater.strm?.avail_in)fail('Invalid or trailing DEFLATE data');}}
  else original(bytes);
  if(bytes.length)await packedSink(bytes);
 }
 await fragments(index.payloads[r.payload_index],read,async text=>{
  if(/[^A-Za-z0-9+/=]/.test(text))fail('Non-base64 durable payload');
  const joined=carry+text,n=Math.max(0,Math.floor(joined.length/4)*4-4);carry=joined.slice(n);if(n)await consume(joined.slice(0,n),false);
 },limits,stats);
 await consume(carry,true);
 if(inflater&&!inflater.ended)fail('Incomplete DEFLATE stream');
 const got=hash.digest();if(packedCount!==r.compressedBytes||count!==r.bytes||((crc^0xffffffff)>>>0)!==r.crc32||got.sha256!==r.sha256)fail('Original member differs '+r.name);
 if(collect){const bytes=new Uint8Array(count);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return T.parse(T.decode(bytes));}
 return got;
}
function header(r,stamp,central){
 const out=new Uint8Array(central?46:30),v=new DataView(out.buffer),u16=(at,n)=>v.setUint16(at,n,true),u32=(at,n)=>v.setUint32(at,n,true);
 if(central){u32(0,0x02014b50);u16(4,788);u16(6,20);u16(8,0x800);u16(10,r.method);u16(12,stamp.time);u16(14,stamp.date);u32(16,r.crc32);u32(20,r.compressedBytes);u32(24,r.bytes);u16(28,r.nameBytes.length);u32(38,((0o100000|r.mode)<<16)>>>0);u32(42,r.offset);}
 else{u32(0,0x04034b50);u16(4,20);u16(6,0x800);u16(8,r.method);u16(10,stamp.time);u16(12,stamp.date);u32(14,r.crc32);u32(18,r.compressedBytes);u32(22,r.bytes);u16(26,r.nameBytes.length);}
 return out;
}
async function streamPreparedExport(index,read,sink,options={}){
 if(typeof sink!=='function')fail('Provide an awaited provisional byte sink');
 const c=await open(index,read,options),hash=H.createSha256ByteHasher(),l=c.layout;let manifest;
 async function emit(bytes){if(!bytes.length)return;hash.update(bytes);c.stats.maxOutputChunkBytes=Math.max(c.stats.maxOutputChunkBytes,bytes.length);await sink(bytes);}
 for(const r of l.records){await emit(header(r,l.stamp,false));await emit(r.nameBytes);const result=await member(c,r,emit,r.name==='EXPORT_MANIFEST.json');if(r.name==='EXPORT_MANIFEST.json'){manifest=result;checkManifest(manifest,c.checkpoint);}if(options.observeMember)await options.observeMember({name:r.name,bytes:r.bytes,sha256:r.sha256});}
 if(!manifest)fail('Missing export manifest');
 for(const r of l.records){await emit(header(r,l.stamp,true));await emit(r.nameBytes);}
 const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,l.records.length,true);v.setUint16(10,l.records.length,true);v.setUint32(12,l.central,true);v.setUint32(16,l.local,true);await emit(end);
 const result=hash.digest();if(result.bytes!==l.total)fail('Final archive byte count differs');
 return{schema:'commons.streamed-complete-export.v1',identity:index.identity,...result,members:l.records.length,uncompressedBytes:l.raw,metadataBytes:index.metadata.bytes,...c.stats,receivingSource:clone(index.receivingSource??null),derivation:clone(index.derivation??null)};
}
function createChunkSink(writePart,options={}){
 const partBytes=options.partBytes??487500;if(typeof writePart!=='function'||!integer(partBytes,16*1024*1024)||!partBytes)fail('Invalid durable output sink');
 let buffer=new Uint8Array(partBytes),used=0,failed=false,closed=false;const refs=[],hash=H.createSha256ByteHasher();
 async function flush(){if(!used)return;const bytes=buffer.slice(0,used),content=Z.base64(bytes),digest=H.sha256Bytes(bytes),textHash=H.sha256Utf8(content),path='objects/'+textHash.sha256+'.part';await writePart({path,content,bytes:textHash.bytes,sha256:textHash.sha256,decodedBytes:digest.bytes,decodedSha256:digest.sha256});refs.push({path,bytes:textHash.bytes,sha256:textHash.sha256,decodedBytes:digest.bytes,decodedSha256:digest.sha256});used=0;}
 async function write(bytes){if(failed||closed||!(bytes instanceof Uint8Array))fail('Output sink is closed or invalid');try{hash.update(bytes);let at=0;while(at<bytes.length){const n=Math.min(partBytes-used,bytes.length-at);buffer.set(bytes.subarray(at,at+n),used);at+=n;used+=n;if(used===partBytes)await flush();}}catch(e){failed=true;throw e;}}
 async function finish(receipt){if(failed||closed)fail('Output sink cannot be finalized');try{const got=hash.digest();if(receipt?.schema!=='commons.streamed-complete-export.v1'||got.bytes!==receipt.bytes||got.sha256!==receipt.sha256)fail('Finish requires the completed matching archive receipt');await flush();closed=true;buffer=null;return{schema:'commons.streamed-archive-storage.v1',encoding:'base64-independent-parts',...got,parts:refs.map(x=>({...x})),receipt};}catch(e){failed=true;throw e;}}
 return Object.freeze({write,finish});
}
function chunkText(text,objects,partCharacters=650000){const parts=[];for(let at=0;at<text.length;){let end=Math.min(at+partCharacters,text.length);if(end<text.length&&text.charCodeAt(end-1)>=0xd800&&text.charCodeAt(end-1)<=0xdbff)end--;const content=text.slice(at,end);at=end;const d=H.sha256Utf8(content),path='objects/'+d.sha256+'.part';objects[path]=content;parts.push({path,...d});}return{...H.sha256Utf8(text),parts};}
async function deriveSourceSuccessor(index,read,changes,options={}){
 if(!Array.isArray(changes)||!changes.length||typeof options.sourceVersion!=='string'||!options.sourceVersion)fail('Provide exact source successor and existing-member changes');
 const c=await open(index,read,options),job=c.checkpoint,records=new Map(c.layout.records.map(r=>[r.name,r])),seen=new Set(),replacements=[];
 for(const change of changes){const old=records.get(change?.name);if(!old||seen.has(change.name)||!HEX.test(change.expectedSha256)||change.expectedSha256!==old.sha256||!(change.name.startsWith('source/')||/^working\/[^/]+_Editable\.html$/.test(change.name))||typeof change.content!=='string')fail('Source successor preimage or path differs');seen.add(change.name);replacements.push({name:change.name,before:{bytes:old.bytes,sha256:old.sha256},after:H.sha256Utf8(change.content),content:change.content,mode:old.mode});}
 const manifestRecord=records.get('EXPORT_MANIFEST.json'),manifest=await member(c,manifestRecord,async()=>{},true);checkManifest(manifest,job);
 const changed=new Map(replacements.map(x=>[x.name,x]));manifest.files=manifest.files.map(x=>changed.has(x.path)?{...x,...changed.get(x.path).after}:x);
 const manifestText=JSON.stringify(manifest,null,2)+'\n';
 replacements.push({name:'EXPORT_MANIFEST.json',before:{bytes:manifestRecord.bytes,sha256:manifestRecord.sha256},after:H.sha256Utf8(manifestText),content:manifestText,mode:manifestRecord.mode});
 const derivation={schema:'commons.source-successor-derivation.v1',parentIdentity:index.identity,parentIndexSha256:H.sha256Utf8(JSON.stringify(index)).sha256,sourceVersion:options.sourceVersion,compression:{engine:'pako',level:options.deflateLevel??1},changes:replacements.map(({content,mode,...x})=>x)};
 const builder=Z.createZipBuilder({...job.archive.options,deflateRaw:bytes=>P.deflateRaw(bytes,{level:options.deflateLevel??1}),inflateRaw:bytes=>P.inflateRaw(bytes)});
 for(const r of replacements)builder.add({name:r.name,data:r.content,mode:r.mode});
 const prepared=builder.snapshot(),byName=new Map(prepared.entries.map(e=>[e.name,e])),objects={},oldToNew=new Map(),newToNew=new Map(),payloads=[];
 const newPayloads=prepared.payloads.map(t=>chunkText(t,objects));
 job.archive.entries=job.archive.entries.map(old=>{const replacement=byName.get(old.name),e=replacement||old,map=replacement?newToNew:oldToNew,refs=replacement?newPayloads:index.payloads;let target=map.get(e.payload_index);if(target===undefined){target=payloads.length;payloads.push(clone(refs[e.payload_index]));map.set(e.payload_index,target);}return{...e,payload_index:target};});
 const replacementMap=new Map(replacements.map(x=>[x.name,x]));
 job.entries=job.entries.map(e=>replacementMap.has(e.name)?{...e,...replacementMap.get(e.name).after}:e);
 job.identity=H.sha256Utf8(JSON.stringify(derivation)).sha256;
 const successor={...clone(index),identity:job.identity,metadata:chunkText(JSON.stringify(job),objects),payloads,derivation};
 layout(job,successor);
 return{manifest:successor,objects,derivation};
}
module.exports={streamPreparedExport,createChunkSink,deriveSourceSuccessor};
