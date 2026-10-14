"use strict";
const codecModule=(()=>{

// Portable source carrier encoding and decoding.
// Pure JavaScript source transport for runtimes without Node, filesystem or browser APIs.
// encodeApplicationCarrier returns the complete numbered carrier accepted by the existing Python receiver.

const SOURCE_LIMIT_BYTES = 512 * 1024 * 1024;

function fromBase64(s) {
  s=s.replace(/\s+/g,""); if(!/^[A-Za-z0-9+/]*={0,2}$/.test(s)||s.length%4)throw Error("bad base64");
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const padding=s.endsWith("==")?2:s.endsWith("=")?1:0;
  const out=new Uint8Array(s.length/4*3-padding);
  let val=0,bits=0,position=0;
  for (let ch of s) { if(ch==="=")break; val=(val<<6)|alphabet.indexOf(ch);bits+=6;if(bits>=8){bits-=8;out[position++]=(val>>>bits)&255;} }
  return out;
}
const CRC32_TABLE=new Uint32Array(256);
for(let i=0;i<256;i++){let value=i;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);CRC32_TABLE[i]=value;}
function crc32Bytes(bytes) {
  let crc=~0;
  for(const value of bytes)crc=(crc>>>8)^CRC32_TABLE[(crc^value)&255];
  return (~crc)>>>0;
}
function inflateGzip(data) {
 if(data.length<18||data[0]!==31||data[1]!==139||data[2]!==8)throw Error("not gzip");let p=10,f=data[3];
 if(f&4){let n=data[p]|data[p+1]<<8;p+=2+n;}if(f&8){while(data[p++]){}}if(f&16){while(data[p++]){}}if(f&2)p+=2;
 let bi=p*8;function bits(n){let x=0;for(let j=0;j<n;j++){if((bi>>3)>=data.length-8)throw Error("truncated deflate");x|=((data[bi>>3]>>(bi&7))&1)<<j;bi++;}return x;}
 function tree(lengths){let count=new Array(16).fill(0),next=new Array(16).fill(0),maps=Array.from({length:16},()=>new Map()),max=0,c=0;lengths.forEach(n=>{if(n){count[n]++;max=Math.max(max,n);}});for(let n=1;n<=15;n++){c=(c+count[n-1])<<1;next[n]=c;}lengths.forEach((n,s)=>{if(!n)return;let x=next[n]++,r=0;for(let i=0;i<n;i++){r=(r<<1)|(x&1);x>>>=1;}maps[n].set(r,s);});return{maps,max};}
 function sym(t){let c=0;for(let n=1;n<=t.max;n++){c|=bits(1)<<(n-1);if(t.maps[n].has(c))return t.maps[n].get(c);}throw Error("invalid huffman");}
 const lb=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258],le=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],db=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577],de=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
 // Bound the output allocation to the complete Python receiver's capacity.
 const size=(data[data.length-4]|data[data.length-3]<<8|data[data.length-2]<<16|data[data.length-1]<<24)>>>0;
 if(size>SOURCE_LIMIT_BYTES)throw Error("inflation limit");
 const out=new Uint8Array(size);let written=0,last=0;
 while(!last){last=bits(1);let type=bits(2);if(type===0){bi=(bi+7)&~7;let n=bits(16),nn=bits(16);if((n^nn)!==65535)throw Error("bad stored length");if(written+n>size)throw Error("size mismatch");for(let i=0;i<n;i++)out[written++]=bits(8);continue;}if(type===3)throw Error("reserved deflate");
 let lit,dist;
 if(type===1){let lens=Array.from({length:288},(_,s)=>s<144?8:s<256?9:s<280?7:8);lit=tree(lens);dist=tree(new Array(32).fill(5));}
 else {let nl=bits(5)+257,nd=bits(5)+1,nc=bits(4)+4,order=[16,17,18,0,8,7,9,6,10,5,11,4,10,5],cl=new Array(19).fill(0);order=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];for(let i=0;i<nc;i++)cl[order[i]]=bits(3);let ct=tree(cl),lens=[];while(lens.length<nl+nd){let s=sym(ct);if(s<=15)lens.push(s);else{let count=s===16?bits(2)+3:s===17?bits(3)+3:bits(7)+11;let v=s===16?lens[lens.length-1]:0;if(v===undefined)throw Error("invalid repeat");for(let i=0;i<count;i++)lens.push(v);}}if(lens.length!==nl+nd)throw Error("excess lengths");lit=tree(lens.slice(0,nl));dist=tree(lens.slice(nl));}
 for(;;){let s=sym(lit);if(s<256){if(written>=size)throw Error("size mismatch");out[written++]=s;continue;}if(s===256)break;s-=257;if(s<0||s>=lb.length)throw Error("bad length");let len=lb[s]+bits(le[s]),d=sym(dist);if(d>=30)throw Error("bad distance");d=db[d]+bits(de[d]);if(d>written)throw Error("past start");if(written+len>size)throw Error("size mismatch");for(let i=0;i<len;i++){out[written]=out[written-d];written++;}}}
 if(written!==size)throw Error("size mismatch");
 const crc=crc32Bytes(out),expected=(data[data.length-8]|data[data.length-7]<<8|data[data.length-6]<<16|data[data.length-5]<<24)>>>0;if(crc!==expected)throw Error("crc mismatch");return out;
}
function utf8Decode(bytes) {
 const chunks=[];let codes=[];
 function flush(){if(codes.length){chunks.push(String.fromCharCode(...codes));codes=[];}}
 for(let i=0;i<bytes.length;){
  let c=bytes[i++],v=c;
  if(c>=128){let n=c<224?1:c<240?2:3;v=c&((1<<(6-n))-1);while(n--){let b=bytes[i++];if((b&192)!==128)throw Error("bad utf8");v=(v<<6)|(b&63);}}
  if(v<=65535)codes.push(v);else{if(v>0x10ffff)throw new RangeError("Invalid code point");v-=0x10000;codes.push(0xd800+(v>>10),0xdc00+(v&1023));}
  if(codes.length>=8192)flush();
 }
 flush();return chunks.join("");
}
function utf8Encode(s) {
  let size=0;
  for(const ch of s){const c=ch.codePointAt(0);size+=c<128?1:c<2048?2:c<65536?3:4;}
  const out=new Uint8Array(size);let position=0;
  for(const ch of s){
    const c=ch.codePointAt(0);
    if(c<128)out[position++]=c;
    else if(c<2048){out[position++]=192|(c>>6);out[position++]=128|(c&63);}
    else if(c<65536){out[position++]=224|(c>>12);out[position++]=128|((c>>6)&63);out[position++]=128|(c&63);}
    else{out[position++]=240|(c>>18);out[position++]=128|((c>>12)&63);out[position++]=128|((c>>6)&63);out[position++]=128|(c&63);}
  }
  return out;
}

function sha256Bytes(bytes) {
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  // Hash complete blocks in place; only the final one or two blocks need padding.
  const complete=bytes.length-bytes.length%64;
  const tail=new Uint8Array(bytes.length%64<56?64:128);
  tail.set(typeof bytes.subarray==="function"?bytes.subarray(complete):bytes.slice(complete));tail[bytes.length-complete]=128;
  let bitLength=bytes.length*8;
  for(let i=0;i<8;i++){tail[tail.length-1-i]=bitLength%256;bitLength=Math.floor(bitLength/256);}
  const words=new Uint32Array(64),rotate=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let offset=0;offset<complete+tail.length;offset+=64){
    const input=offset<complete?bytes:tail,at=offset<complete?offset:offset-complete;
    for(let i=0;i<16;i++){const j=at+i*4;words[i]=(input[j]<<24)|(input[j+1]<<16)|(input[j+2]<<8)|input[j+3];}
    for(let i=16;i<64;i++){const a=words[i-15],b=words[i-2];words[i]=(words[i-16]+(rotate(a,7)^rotate(a,18)^(a>>>3))+words[i-7]+(rotate(b,17)^rotate(b,19)^(b>>>10)))>>>0;}
    let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for(let i=0;i<64;i++){
      const first=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+K[i]+words[i])>>>0;
      const second=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
      h=g;g=f;f=e;e=(d+first)>>>0;d=c;c=b;b=a;a=(first+second)>>>0;
    }
    H[0]+=a;H[1]+=b;H[2]+=c;H[3]+=d;H[4]+=e;H[5]+=f;H[6]+=g;H[7]+=h;
  }
  return Array.from(H,x=>x.toString(16).padStart(8,"0")).join("");
}
function toBase64(bytes){const a="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";let s="";for(let i=0;i<bytes.length;i+=3){const n=(bytes[i]<<16)|((bytes[i+1]||0)<<8)|(bytes[i+2]||0);s+=a[(n>>>18)&63]+a[(n>>>12)&63]+(i+1<bytes.length?a[(n>>>6)&63]:"=")+(i+2<bytes.length?a[n&63]:"=");}return s;}

function gzipBytes(bytes) {
  const lengthBase=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const lengthExtra=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const distanceBase=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const distanceExtra=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  const reverse=(value,n)=>{let result=0;while(n--){result=(result<<1)|(value&1);value>>>=1;}return result;};
  const codes=new Uint16Array(288),lengths=new Uint8Array(288);
  for(let symbol=0;symbol<288;symbol++){
    let value,n;if(symbol<144){value=symbol+48;n=8;}else if(symbol<256){value=symbol-144+400;n=9;}else if(symbol<280){value=symbol-256;n=7;}else{value=symbol-280+192;n=8;}
    codes[symbol]=reverse(value,n);lengths[symbol]=n;
  }
  const output=[31,139,8,0,0,0,0,0,0,255];let accumulator=0,bits=0;
  const put=(value,n)=>{accumulator|=value<<bits;bits+=n;while(bits>=8){output.push(accumulator&255);accumulator>>>=8;bits-=8;}};
  const symbol=value=>put(codes[value],lengths[value]);
  put(1,1);put(1,2);
  // DEFLATE references only its preceding 32 KiB. Reusing these slots retains
  // the same candidate order and compressed bytes for any input length.
  const heads=new Int32Array(65536).fill(-1),previous=new Int32Array(32768).fill(-1);
  const hash=position=>(((bytes[position]*251+bytes[position+1])*251+bytes[position+2])&65535);
  const insert=position=>{if(position+2>=bytes.length)return;let h=hash(position);previous[position&32767]=heads[h];heads[h]=position;};
  let position=0;
  while(position<bytes.length){
    let bestLength=0,bestDistance=0;
    const maximum=Math.min(258,bytes.length-position);
    if(maximum>=3){
      let candidate=heads[hash(position)],searched=0,minimum=Math.max(0,position-32768);
      while(candidate>=minimum&&candidate>=0&&searched++<64){
        if(bytes[candidate]===bytes[position]&&bytes[candidate+1]===bytes[position+1]&&bytes[candidate+2]===bytes[position+2]){
          let length=3;while(length<maximum&&bytes[candidate+length]===bytes[position+length])length++;
          if(length>bestLength){bestLength=length;bestDistance=position-candidate;if(length===maximum)break;}
        }
        candidate=previous[candidate&32767];
      }
    }
    if(bestLength>=3){
      let code=0;while(code<28&&bestLength>=lengthBase[code+1])code++;
      symbol(257+code);put(bestLength-lengthBase[code],lengthExtra[code]);
      code=0;while(code<29&&bestDistance>=distanceBase[code+1])code++;
      put(reverse(code,5),5);put(bestDistance-distanceBase[code],distanceExtra[code]);
      const end=position+bestLength;while(position<end)insert(position++);
    }else{symbol(bytes[position]);insert(position);position++;}
  }
  symbol(256);if(bits)output.push(accumulator&255);
  const crc=crc32Bytes(bytes);
  for(let i=0;i<4;i++)output.push((crc>>>(8*i))&255);
  const size=bytes.length>>>0;for(let i=0;i<4;i++)output.push((size>>>(8*i))&255);
  return new Uint8Array(output);
}

function encodeApplicationCarrier(document, {title="Upper Savannah complete application source", chunkChars=28000}={}) {
  if(!document || document.schema!=="commons.source-map/1" || document.kind!=="upstate.complete-application-source/v1")throw Error("Choose the complete application source map");
  if(!Number.isInteger(chunkChars)||chunkChars<1024||chunkChars>100000||chunkChars%4)throw Error("Choose a base64 part length divisible by four");
  const names=Object.keys(document.files||{}).sort(),metadata=document.file_metadata||{};
  if(!names.length||names.length!==Object.keys(metadata).length)throw Error("Source inventory differs");
  let sourceBytes=0;
  for(const name of names){
    if(typeof document.files[name]!=="string"||!name||name.startsWith("/")||name.includes("\\")||name.split("/").some(p=>!p||p==="."||p===".."||p.includes(":")))throw Error("Invalid source member");
    const entry=metadata[name],encoding=entry?.encoding||"utf-8";
    if(!["utf-8","utf8","base64"].includes(encoding))throw Error("Unsupported member encoding: "+name);
    const body=encoding==="base64"?fromBase64(document.files[name]):utf8Encode(document.files[name]);
    if(!entry||entry.bytes!==body.length||entry.sha256!==sha256Bytes(body)||!["100644","100755"].includes(entry.mode))throw Error("Source identity differs: "+name);
    sourceBytes+=body.length;
  }
  const bytes=utf8Encode(JSON.stringify(document,null,2)+"\n"),compressed=gzipBytes(bytes),encoded=toBase64(compressed),count=Math.ceil(encoded.length/chunkChars);
  const common={schema:"upstate.application-source-part/v1",edition:document.edition,encoding:"gzip+base64",parts:count,payload_bytes:bytes.length,payload_sha256:sha256Bytes(bytes),compressed_bytes:compressed.length,compressed_sha256:sha256Bytes(compressed),files:names.length,source_bytes:sourceBytes};
  const parts=Array.from({length:count},(_,i)=>({...common,part:i+1,data:encoded.slice(i*chunkChars,(i+1)*chunkChars)}));
  const fence=String.fromCharCode(96).repeat(3);
  const markdown="# "+title+"\n\nEdition: "+document.edition+"\nSource: "+document.source_ref+"\n\n"+names.length+" complete files; "+sourceBytes+" source bytes. Decoded JSON SHA256 "+common.payload_sha256+". Gzip SHA256 "+common.compressed_sha256+". The numbered parts are accepted by source_tools/application_assembly.py. All-text maps also work with receive_application_source.py.\n\n"+parts.map(part=>fence+"json\n"+JSON.stringify(part)+"\n"+fence).join("\n\n")+"\n";
  return {metadata:common,parts,markdown};
}


// Complete native source documents share the existing Python receiver's format.
const NATIVE_SOURCE_SCHEMA = "upstate.complete-application-transport/v1";
const NATIVE_SOURCE_BEGIN = "BEGIN_UPSTATE_SOURCE_GZIP_BASE64";
const NATIVE_SOURCE_END = "END_UPSTATE_SOURCE_GZIP_BASE64";
function nativeCanonical(value) {
  if (Array.isArray(value)) return "[" + value.map(nativeCanonical).join(",") + "]";
  if (value && typeof value === "object")
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + nativeCanonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
function nativeSourceMembers(bank) {
  if (!bank || bank.schema !== NATIVE_SOURCE_SCHEMA || !bank.files ||
      typeof bank.files !== "object" || Array.isArray(bank.files) ||
      !bank.file_metadata || typeof bank.file_metadata !== "object" ||
      Array.isArray(bank.file_metadata))
    throw Error("A complete native application source bank is required");
  if (typeof bank.operation_id !== "string" || !bank.operation_id.trim() ||
      typeof bank.edition !== "string" || !bank.edition.trim())
    throw Error("The native source bank requires its operation and edition identities");
  const names = Object.keys(bank.files).sort();
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(bank.file_metadata).sort()))
    throw Error("Every native source member needs its original metadata");
  const seen = new Set();
  let sourceBytes = 0;
  function member(path, bytes, metadata) {
    if (typeof path !== "string" || !path || path.includes("\\") || path.includes("\0") ||
        path.startsWith("/") || path.split("/").some(part => !part || part === "." || part === ".."))
      throw Error("Native source paths must be relative to the application");
    if (seen.has(path)) throw Error("Duplicate native source member: " + path);
    if (!metadata || metadata.bytes !== bytes.length || metadata.sha256 !== sha256Bytes(bytes))
      throw Error("Original native source bytes differ: " + path);
    seen.add(path);
    sourceBytes += bytes.length;
  }
  for (const path of names) {
    const content = bank.files[path], metadata = bank.file_metadata[path];
    if (typeof content !== "string" || !metadata ||
        (metadata.encoding !== undefined && metadata.encoding !== "utf-8"))
      throw Error("A complete UTF-8 source body is required: " + path);
    member(path, utf8Encode(content), metadata);
  }
  const binary = bank.binary_files === undefined ? [] : bank.binary_files;
  if (!Array.isArray(binary)) throw Error("Original binary members must be an array");
  for (const row of binary) {
    if (!row || typeof row.content_base64 !== "string")
      throw Error("An original binary source body is required");
    member(row.path, fromBase64(row.content_base64), row);
  }
  return {sourceFileCount: seen.size, sourceBytes};
}
function nativeTransportPayload(metadata, base64) {
  if (!metadata || metadata.schema !== NATIVE_SOURCE_SCHEMA)
    throw Error("Unsupported native source transport");
  const compressedBytes = fromBase64(base64);
  if (compressedBytes.length !== metadata.gzip_bytes ||
      sha256Bytes(compressedBytes) !== metadata.gzip_sha256)
    throw Error("The complete compressed source differs from its original transport");
  const bytes = inflateGzip(compressedBytes);
  if (bytes.length !== metadata.json_bytes || sha256Bytes(bytes) !== metadata.json_sha256)
    throw Error("The decoded complete source differs from its original transport");
  const jsonText = utf8Decode(bytes), bank = JSON.parse(jsonText);
  const inventory = nativeSourceMembers(bank);
  if (metadata.operation_id !== bank.operation_id || metadata.edition !== bank.edition)
    throw Error("The native transport and complete bank have different source identities");
  if (metadata.source_file_count !== undefined &&
      metadata.source_file_count !== inventory.sourceFileCount)
    throw Error("The native source file count differs from its complete inventory");
  return {metadata, bank, jsonText, base64, compressedBytes, ...inventory};
}
function decodeNativeSourceDocuments(documents) {
  if (typeof documents === "string") documents = [documents];
  if (!Array.isArray(documents) || !documents.length ||
      documents.some(text => typeof text !== "string"))
    throw Error("Provide the complete source document or all of its exported text parts");
  const received = documents.map(document => {
    const text = document.replace(/^\uFEFF/, ""), lines = text.split(/\r?\n/);
    const starts = [], ends = [];
    lines.forEach((line, index) => {
      if (line.trim() === NATIVE_SOURCE_BEGIN) starts.push(index);
      if (line.trim() === NATIVE_SOURCE_END) ends.push(index);
    });
    if (starts.length !== 1 || ends.length !== 1 || ends[0] <= starts[0])
      throw Error("Each source document must contain one complete source part");
    const headers = lines.slice(0, starts[0]);
    const metadataRows = headers.filter(line => line.startsWith("SOURCE_TRANSPORT_METADATA="));
    const partRows = headers.filter(line => line.startsWith("SOURCE_TRANSPORT_PART="));
    if (metadataRows.length !== 1 || partRows.length > 1)
      throw Error("Missing or duplicate native source transport metadata");
    const metadata = JSON.parse(metadataRows[0].slice("SOURCE_TRANSPORT_METADATA=".length));
    const part = partRows.length ? JSON.parse(partRows[0].slice("SOURCE_TRANSPORT_PART=".length)) : null;
    const base64 = lines.slice(starts[0] + 1, ends[0]).join("").replace(/\s+/g, "");
    if (part !== null) {
      if (!part || !Number.isSafeInteger(part.part) || !Number.isSafeInteger(part.parts) ||
          part.parts < 1 || part.part < 1 || part.part > part.parts)
        throw Error("Invalid original source part identity");
      if (base64.length !== part.base64_chars ||
          sha256Bytes(utf8Encode(base64)) !== part.base64_sha256)
        throw Error("An exported source part differs from its original content");
    }
    return {metadata, part, base64};
  });
  const metadata = received[0].metadata, identity = nativeCanonical(metadata);
  if (received.some(row => nativeCanonical(row.metadata) !== identity))
    throw Error("The exported source parts belong to different application editions");
  let ordered;
  if (received.every(row => row.part === null)) {
    if (received.length !== 1)
      throw Error("Multiple source documents require original numbered part metadata");
    ordered = received;
  } else {
    if (received.some(row => row.part === null))
      throw Error("A numbered application source part is missing its metadata");
    const total = received[0].part.parts;
    ordered = received.slice().sort((a, b) => a.part.part - b.part.part);
    if (ordered.length !== total ||
        ordered.some((row, index) => row.part.parts !== total || row.part.part !== index + 1))
      throw Error("Receive every original application source part exactly once");
  }
  return nativeTransportPayload(metadata, ordered.map(row => row.base64).join(""));
}

function nativeSourceBank(source, operationId) {
  if (source && source.schema === NATIVE_SOURCE_SCHEMA) return source;
  if (!source || source.schema !== "commons.source-map/1" ||
      source.kind !== "upstate.complete-application-source/v1" ||
      !source.files || !source.file_metadata ||
      Array.isArray(source.files) || Array.isArray(source.file_metadata))
    throw Error("Provide a complete native bank or complete application source map");
  if (JSON.stringify(Object.keys(source.files).sort()) !==
      JSON.stringify(Object.keys(source.file_metadata).sort()))
    throw Error("Every application source-map member needs its original metadata");
  if (source.binary_files !== undefined && !Array.isArray(source.binary_files))
    throw Error("Original binary members must be an array");
  const operation = operationId ?? source.operation_id ?? source.source_ref;
  if (typeof operation !== "string" || !operation.trim())
    throw Error("A complete source map needs its source_ref or an explicit operationId");
  const bank = {...source, schema: NATIVE_SOURCE_SCHEMA, operation_id: operation,
    source_schema: source.schema, files: Object.create(null), file_metadata: Object.create(null),
    binary_files: [...(source.binary_files || [])]};
  for (const [path, content] of Object.entries(source.files)) {
    const metadata = source.file_metadata[path];
    if (!metadata || typeof content !== "string")
      throw Error("A complete source-map member is required: " + path);
    if (metadata.encoding === "base64") {
      bank.binary_files.push({...metadata, path, content_base64: content});
    } else {
      if (metadata.encoding !== undefined && metadata.encoding !== "utf-8")
        throw Error("Unsupported source-map member encoding: " + path);
      bank.files[path] = content;
      bank.file_metadata[path] = {...metadata};
    }
  }
  return bank;
}

function encodeNativeSourceDocuments(source, options = {}) {
  const {maxDocumentChars = 900000, maxBase64Chars = 880000, lineWidth = 120,
         title = "Upper Savannah — complete native application source",
         sourceReference = "", includeBootstrap, operationId} = options;
  if (!Number.isSafeInteger(maxDocumentChars) || maxDocumentChars < 4096 ||
      !Number.isSafeInteger(maxBase64Chars) || maxBase64Chars < 4 ||
      !Number.isSafeInteger(lineWidth) || lineWidth < 16 || lineWidth > 1024)
    throw Error("Choose valid native document, base64-part and line-width limits");
  if (typeof title !== "string" || !title || /[\r\n\0]/.test(title) ||
      typeof sourceReference !== "string" || /[\r\n\0]/.test(sourceReference))
    throw Error("Use single-line native source title and reference values");
  let retained;
  if (typeof source === "string" || Array.isArray(source)) {
    retained = decodeNativeSourceDocuments(source);
  } else {
    const bank = nativeSourceBank(source, operationId), inventory = nativeSourceMembers(bank);
    const jsonText = JSON.stringify(bank, null, 2) + "\n", bytes = utf8Encode(jsonText);
    const compressedBytes = gzipBytes(bytes);
    retained = {bank, jsonText, compressedBytes, base64: toBase64(compressedBytes),
      ...inventory, metadata: {
        schema: NATIVE_SOURCE_SCHEMA, operation_id: bank.operation_id,
        edition: bank.edition, source_file_count: inventory.sourceFileCount,
        json_bytes: bytes.length, json_sha256: sha256Bytes(bytes),
        gzip_bytes: compressedBytes.length, gzip_sha256: sha256Bytes(compressedBytes)
      }};
  }
  if (includeBootstrap !== undefined && typeof includeBootstrap !== "boolean")
    throw Error("Choose a boolean includeBootstrap option");
  let bootstrap = "";
  const receiverPath = "source_tools/receive_drive_source.py";
  const addBootstrap = includeBootstrap ?? typeof retained.bank.files[receiverPath] === "string";
  if (addBootstrap) {
    const path = receiverPath, body = retained.bank.files[path];
    if (typeof body !== "string")
      throw Error("The complete bank must retain its native receiver to include the bootstrap");
    const row = {path, ...retained.bank.file_metadata[path],
      encoding: "utf-8", content_base64: toBase64(utf8Encode(body))};
    const bank = {schema: "commons.source-bank/v1",
      operation_id: retained.bank.operation_id, edition: retained.bank.edition, files: [row]};
    const fence = String.fromCharCode(96).repeat(3);
    bootstrap = "\nComplete native bootstrap receiver (same source body contained in the application):\n\n" +
      fence + "json\n" + JSON.stringify(bank) + "\n" + fence + "\n";
  }
  function render(fragment, part, parts) {
    const metadata = {...retained.metadata, parts};
    const partMetadata = {part, parts, base64_chars: fragment.length,
      base64_sha256: sha256Bytes(utf8Encode(fragment))};
    const wrapped = [];
    for (let i = 0; i < fragment.length; i += lineWidth) wrapped.push(fragment.slice(i, i + lineWidth));
    const text = title + " — part " + part + " of " + parts + "\n\n" +
      (sourceReference ? "Retained original source: " + sourceReference + ".\n" : "") +
      "Export every part as a complete text/plain file. Pass every original file to the native receiver with repeated --document arguments.\n\n" +
      "SOURCE_TRANSPORT_METADATA=" + JSON.stringify(metadata) + "\n" +
      "SOURCE_TRANSPORT_PART=" + JSON.stringify(partMetadata) + "\n" +
      NATIVE_SOURCE_BEGIN + "\n" + wrapped.join("\n") + "\n" + NATIVE_SOURCE_END + "\n" + bootstrap;
    const bytes = utf8Encode(text);
    return {...partMetadata, file_name: "upper-savannah-native-source.part-" + part + ".txt",
      text, chars: text.length, bytes: bytes.length, sha256: sha256Bytes(bytes)};
  }
  const overhead = render("", 1, 1).chars;
  let capacity = Math.min(maxBase64Chars,
    Math.floor((maxDocumentChars - overhead - 128) / (1 + 1 / lineWidth)));
  capacity -= capacity % 4;
  if (capacity < 4) throw Error("The document limit cannot fit its metadata and complete bootstrap");
  let documents;
  while (true) {
    const parts = Math.ceil(retained.base64.length / capacity);
    documents = Array.from({length: parts}, (_, index) =>
      render(retained.base64.slice(index * capacity, (index + 1) * capacity), index + 1, parts));
    const overrun = Math.max(...documents.map(document => document.chars - maxDocumentChars));
    if (overrun <= 0) break;
    capacity -= Math.ceil(overrun / 4) * 4;
    if (capacity < 4) throw Error("The document limit cannot fit complete source parts");
  }
  return {metadata: {...retained.metadata, parts: documents.length},
    sourceFileCount: retained.sourceFileCount, sourceBytes: retained.sourceBytes, documents};
}


return {utf8Encode,utf8Decode,sha256Bytes,toBase64,fromBase64,inflateGzip,gzipBytes};
})();
/* MIT. Explicit browser bytes adapter around complete maintained Research contracts and preparation functions. */
function createNativeResearch(options) {
 "use strict";
 const {codec}=options,structuredClone=v=>JSON.parse(JSON.stringify(v));
 function encode(value){return codec.utf8Encode(String(value).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,"\uFFFD"));}
 function decode(bytes){for(let i=0;i<bytes.length;){const b=bytes[i++];if(b<128)continue;let n;if(b>=194&&b<=223)n=1;else if(b>=224&&b<=239)n=2;else if(b>=240&&b<=244)n=3;else throw Error("OUTPUT_UTF8_INVALID");if(i+n>bytes.length)throw Error("OUTPUT_UTF8_INVALID");const second=bytes[i];if(b===224&&second<160||b===237&&second>=160||b===240&&second<144||b===244&&second>=144)throw Error("OUTPUT_UTF8_INVALID");for(let j=0;j<n;j++)if((bytes[i++]&192)!==128)throw Error("OUTPUT_UTF8_INVALID");}return codec.utf8Decode(bytes);}
 class Bytes extends Uint8Array {toString(encoding="utf8"){if(encoding==="base64")return codec.toBase64(this);if(encoding==="utf8"||encoding==="utf-8")return decode(this);throw Error("RESEARCH_BYTE_ENCODING");}equals(other){return this.length===other.length&&this.every((v,i)=>v===other[i]);}}
 const Buffer={from(value,encoding="utf8"){let b;if(typeof value==="string"){if(encoding==="base64")b=codec.fromBase64(value);else if(encoding==="utf8"||encoding==="utf-8")b=encode(value);else throw Error("RESEARCH_BYTE_ENCODING");}else if(value instanceof Uint8Array||Array.isArray(value))b=value;else throw Error("RESEARCH_BYTES_REQUIRED");return Bytes.from(b);},isBuffer(value){return value instanceof Bytes;},byteLength(value){return encode(value).length;}};
 const TextDecoder=class {constructor(encoding="utf-8",options={}){if(!["utf-8","utf8"].includes(encoding))throw Error("RESEARCH_BYTE_ENCODING");this.keepBom=Boolean(options.ignoreBOM);}decode(b){const s=decode(b);return this.keepBom?s:s.replace(/^\uFEFF/,"");}};
 function createHash(algorithm){if(algorithm!=="sha256")throw Error("RESEARCH_HASH_ALGORITHM");const chunks=[];return {update(b){chunks.push(Buffer.from(b));return this;},digest(encoding){if(encoding!=="hex")throw Error("RESEARCH_HASH_ENCODING");const bytes=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let at=0;for(const b of chunks){bytes.set(b,at);at+=b.length;}return codec.sha256Bytes(bytes);}};}
 const digest=b=>codec.sha256Bytes(b),need=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});},object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
 function jsonBytes(value){const t=JSON.stringify(value,(_key,item)=>{need(item!==undefined&&typeof item!=="function"&&typeof item!=="symbol"&&typeof item!=="bigint","JSON_VALUES_REQUIRED");need(typeof item!=="number"||Number.isFinite(item),"JSON_VALUES_REQUIRED");return item;},2);return Buffer.from(t+"\n");}
 const resolve=(base,path)=>{const raw=path===undefined?base:(String(base).replace(/\/$/,"")+"/"+path);const names=[];for(const part of raw.split("/")){if(!part||part===".")continue;if(part==="..")throw Error("RESEARCH_PATH_ESCAPE");names.push(part);}return "/"+names.join("/");};
 const original=async()=>{throw Error("RESEARCH_ORIGINAL_READER_REQUIRED");};
 const contract=(()=>{
// MIT. Versioned comparison contracts over the original Research dossier.
const COMPARISON_SCHEMA='sf88-research-comparison/v1';
const RUN_SCHEMA='sf88-research-comparison-run/v1';
const MAX_RUN=64*1024*1024;
const ACTIONS=Object.freeze(['case.save','candidate.save','run.import','judgment.save','decision.save']);
const SECTIONS=Object.freeze(['overview','cases','case-editions','candidates','candidate-editions','runs','judgments','decisions','operations']);
const clone=value=>structuredClone(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const hash=value=>digest(jsonBytes(canonical(value)));
const same=(a,b)=>hash(a)===hash(b);
function fields(value,allowed,code='COMPARISON_FIELDS_INVALID'){
 need(object(value)&&Object.keys(value).every(k=>allowed.includes(k)),code);return value;
}
function text(value,name,max=20000,empty=false){
 need(typeof value==='string'&&value.length<=max&&(empty||value.trim().length>0),name);return value;
}
function id(value,name='COMPARISON_ID_INVALID'){
 need(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value),name);return value;
}
function ids(value=[]){
 need(Array.isArray(value)&&value.length<=1000&&new Set(value).size===value.length,'COMPARISON_IDS_INVALID');
 return value.map(v=>id(v));
}
function time(value){
 need(typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value,'COMPARISON_TIME_INVALID');return value;
}
function actor(value){
 fields(value,['id','name'],'COMPARISON_ACTOR_INVALID');
 return{id:id(value.id),name:text(value.name,'COMPARISON_ACTOR_NAME_REQUIRED',200)};
}
function sourceRefs(value=[]){
 need(Array.isArray(value)&&value.length<=500,'COMPARISON_SOURCES_INVALID');
 const result=value.map(v=>{fields(v,['editionId','locator','note']);
 return{editionId:id(v.editionId),locator:text(v.locator,'COMPARISON_SOURCE_LOCATOR_REQUIRED',4000),note:text(v.note??'','COMPARISON_SOURCE_NOTE_INVALID',12000,true)};});
 need(new Set(result.map(v=>v.editionId+'\n'+v.locator)).size===result.length,'COMPARISON_SOURCE_DUPLICATE');return result;
}
function json(value,max=1024*1024){
 need(object(value)&&jsonBytes(value).length<=max,'COMPARISON_JSON_INVALID');return clone(value);
}
function caseDefinition(value){
 fields(value,['questionId','title','purpose','scope','criteria','sourceRefs']);
 need(Array.isArray(value.criteria)&&value.criteria.length<=100,'COMPARISON_CRITERIA_INVALID');
 const criteria=value.criteria.map(v=>{fields(v,['id','label','kind','unit','direction','description']);
 need(['MEASURED','JUDGMENT'].includes(v.kind)&&['HIGHER','LOWER','DESCRIPTIVE'].includes(v.direction),'COMPARISON_CRITERION_INVALID');
 return{id:id(v.id),label:text(v.label,'COMPARISON_CRITERION_LABEL_REQUIRED',240),kind:v.kind,
 unit:text(v.unit??'','COMPARISON_UNIT_INVALID',160,true),direction:v.direction,description:text(v.description??'','COMPARISON_CRITERION_DESCRIPTION_INVALID',12000,true)};});
 need(new Set(criteria.map(v=>v.id)).size===criteria.length,'COMPARISON_CRITERION_DUPLICATE');
 return{questionId:id(value.questionId),title:text(value.title,'COMPARISON_TITLE_REQUIRED',240),
 purpose:text(value.purpose,'COMPARISON_PURPOSE_REQUIRED'),scope:text(value.scope??'','COMPARISON_SCOPE_INVALID',40000,true),
 criteria,sourceRefs:sourceRefs(value.sourceRefs)};
}
function candidateDefinition(value){
 fields(value,['name','kind','version','description','configuration','sourceRefs']);
 need(['MODEL','PLATFORM','ARCHITECTURE'].includes(value.kind),'COMPARISON_CANDIDATE_KIND_INVALID');
 return{name:text(value.name,'COMPARISON_CANDIDATE_NAME_REQUIRED',240),kind:value.kind,
 version:text(value.version,'COMPARISON_CANDIDATE_VERSION_REQUIRED',500),description:text(value.description??'','COMPARISON_DESCRIPTION_INVALID',40000,true),
 configuration:json(value.configuration??{}),sourceRefs:sourceRefs(value.sourceRefs)};
}
function judgmentDefinition(value){
 fields(value,['candidateVersionId','criterionId','value','reviewer','reviewedAt','rationale','sourceRefs','runIds']);
 return{candidateVersionId:id(value.candidateVersionId),criterionId:id(value.criterionId),
 value:text(value.value,'COMPARISON_JUDGMENT_REQUIRED',20000),reviewer:text(value.reviewer,'COMPARISON_REVIEWER_REQUIRED',240),
 reviewedAt:time(value.reviewedAt),rationale:text(value.rationale,'COMPARISON_RATIONALE_REQUIRED',40000),
 sourceRefs:sourceRefs(value.sourceRefs),runIds:ids(value.runIds)};
}
function decisionDefinition(value){
 fields(value,['title','candidateVersionIds','runIds','judgmentVersionIds','reviewer','reviewedAt','recommendation','rationale','limitations','sourceRefs']);
 return{title:text(value.title,'COMPARISON_DECISION_TITLE_REQUIRED',240),candidateVersionIds:ids(value.candidateVersionIds),
 runIds:ids(value.runIds),judgmentVersionIds:ids(value.judgmentVersionIds),reviewer:text(value.reviewer,'COMPARISON_REVIEWER_REQUIRED',240),
 reviewedAt:time(value.reviewedAt),recommendation:text(value.recommendation,'COMPARISON_RECOMMENDATION_REQUIRED',20000),
 rationale:text(value.rationale,'COMPARISON_RATIONALE_REQUIRED',40000),limitations:text(value.limitations??'','COMPARISON_LIMITATIONS_INVALID',40000,true),
 sourceRefs:sourceRefs(value.sourceRefs)};
}
function comparisonInput(value){
 fields(value,['requestId','expectedRevision','actor','action','payload']);
 need(ACTIONS.includes(value.action),'COMPARISON_ACTION_INVALID');
 need(Number.isSafeInteger(value.expectedRevision)&&value.expectedRevision>=1,'REVISION_INVALID');
 const p=value.payload;let payload;
 if(value.action==='case.save'){
 fields(p,['caseId','previousVersionId','definition']);
 payload={caseId:p.caseId==null?null:id(p.caseId),previousVersionId:p.previousVersionId==null?null:id(p.previousVersionId),definition:caseDefinition(p.definition)};
 need(Boolean(payload.caseId)===Boolean(payload.previousVersionId),'COMPARISON_PREVIOUS_REQUIRED');
 }else if(value.action==='run.import'){
 fields(p,['caseId','caseVersionId','candidateVersionId','rawText']);
 payload={caseId:id(p.caseId),caseVersionId:id(p.caseVersionId),candidateVersionId:id(p.candidateVersionId),
 rawText:text(p.rawText,'COMPARISON_RUN_JSON_REQUIRED',MAX_RUN)};
 need(Buffer.byteLength(payload.rawText)<=MAX_RUN,'COMPARISON_RUN_TOO_LARGE');
 need(Buffer.from(payload.rawText,'utf8').toString('utf8')===payload.rawText,'COMPARISON_RUN_UTF8_INVALID');
 }else{
 const kind=value.action.split('.')[0],key=kind+'Id';
 fields(p,['caseId','caseVersionId',key,'previousVersionId','definition']);
 const definition=kind==='candidate'?candidateDefinition(p.definition):kind==='judgment'?judgmentDefinition(p.definition):decisionDefinition(p.definition);
 payload={caseId:id(p.caseId),caseVersionId:id(p.caseVersionId),[key]:p[key]==null?null:id(p[key]),previousVersionId:p.previousVersionId==null?null:id(p.previousVersionId),definition};
 need(Boolean(payload[key])===Boolean(payload.previousVersionId),'COMPARISON_PREVIOUS_REQUIRED');
 }
 return{requestId:id(value.requestId),expectedRevision:value.expectedRevision,actor:actor(value.actor),action:value.action,payload};
}
function retainedRequest(request,raw){
 if(request.action!=='run.import')return clone(request);
 const {rawText,...payload}=request.payload;return{...clone(request),payload:{...clone(payload),raw}};
}
function safePath(value){
 text(value,'COMPARISON_ARTIFACT_PATH_INVALID',1024);
 need(!value.startsWith('/')&&!value.includes('\\')&&!/[\u0000-\u001f\u007f]/.test(value)&&value.split('/').every(v=>v&&!['.','..'].includes(v)),
 'COMPARISON_ARTIFACT_PATH_INVALID');return value;
}
function parseRun(rawText){
 let v;try{v=JSON.parse(rawText);}catch{need(false,'COMPARISON_RUN_JSON_INVALID');}
 fields(v,['schema','externalRunId','kind','status','startedAt','finishedAt','elapsedMs','engine','input','metrics','artifacts','result','limitations']);
 need(v.schema===RUN_SCHEMA,'COMPARISON_RUN_SCHEMA_INVALID');
 id(v.externalRunId);need(['SOURCE_NATIVE','IMPORTED_MEASUREMENT','TRAINING_FIXTURE'].includes(v.kind),'COMPARISON_RUN_KIND_INVALID');
 need(['SUCCEEDED','FAILED','CANCELLED'].includes(v.status),'COMPARISON_RUN_STATUS_INVALID');
 time(v.startedAt);time(v.finishedAt);need(Date.parse(v.finishedAt)>=Date.parse(v.startedAt),'COMPARISON_RUN_TIME_ORDER');
 need(v.elapsedMs===null||Number.isFinite(v.elapsedMs)&&v.elapsedMs>=0,'COMPARISON_RUN_DURATION_INVALID');
 fields(v.engine,['name','version','command','runtime','configuration']);
 text(v.engine.name,'COMPARISON_ENGINE_REQUIRED',500);text(v.engine.version,'COMPARISON_ENGINE_VERSION_REQUIRED',500);
 need(Array.isArray(v.engine.command)&&v.engine.command.length<=1000&&v.engine.command.every(x=>typeof x==='string'&&x.length<=20000),'COMPARISON_COMMAND_INVALID');
 json(v.engine.runtime);json(v.engine.configuration);
 fields(v.input,['cohortId','protocolId','definition','sourceRefs','artifactIds']);
 id(v.input.cohortId);id(v.input.protocolId);json(v.input.definition);need(Array.isArray(v.input.sourceRefs)&&Array.isArray(v.input.artifactIds),'COMPARISON_INPUT_REFERENCES_REQUIRED');sourceRefs(v.input.sourceRefs);ids(v.input.artifactIds);
 need(Array.isArray(v.metrics)&&v.metrics.length<=10000,'COMPARISON_METRICS_INVALID');
 for(const m of v.metrics){
 fields(m,['id','criterionId','label','value','unit','undefinedReason','definition','denominator','cohortRef','artifactIds']);
 id(m.id);id(m.criterionId);text(m.label,'COMPARISON_METRIC_LABEL_REQUIRED',500);
 need(m.value===null||typeof m.value==='number'&&Number.isFinite(m.value)||typeof m.value==='string'&&/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(m.value),'COMPARISON_METRIC_VALUE_INVALID');
 text(m.unit,'COMPARISON_METRIC_UNIT_REQUIRED',160);text(m.definition,'COMPARISON_METRIC_DEFINITION_REQUIRED',12000);
 text(m.undefinedReason??'','COMPARISON_UNDEFINED_REASON_REQUIRED',12000,m.value!==null);
 json(m.denominator);text(m.cohortRef,'COMPARISON_METRIC_COHORT_REQUIRED',1000);need(Array.isArray(m.artifactIds),'COMPARISON_METRIC_ARTIFACTS_REQUIRED');ids(m.artifactIds);
 }
 need(new Set(v.metrics.map(m=>m.id)).size===v.metrics.length,'COMPARISON_METRIC_DUPLICATE');
 need(Array.isArray(v.artifacts)&&v.artifacts.length<=2000,'COMPARISON_ARTIFACTS_INVALID');
 const artifacts=[],names=new Set(),identifiers=new Set();let total=0;
 for(const f of v.artifacts){
 fields(f,['id','path','role','mediaType','bytes','sha256','bodyBase64']);
 id(f.id);safePath(f.path);text(f.role,'COMPARISON_ARTIFACT_ROLE_REQUIRED',160);text(f.mediaType,'COMPARISON_ARTIFACT_TYPE_REQUIRED',240);
 need(!names.has(f.path)&&!identifiers.has(f.id),'COMPARISON_ARTIFACT_DUPLICATE');names.add(f.path);identifiers.add(f.id);
 need(Number.isSafeInteger(f.bytes)&&f.bytes>=0&&f.bytes<=MAX_RUN&&typeof f.bodyBase64==='string'&&/^[a-f0-9]{64}$/.test(f.sha256),'COMPARISON_ARTIFACT_INVALID');
 const body=Buffer.from(f.bodyBase64,'base64');need(body.toString('base64')===f.bodyBase64&&body.length===f.bytes&&digest(body)===f.sha256,'COMPARISON_ARTIFACT_CHANGED');
 total+=body.length;need(total<=MAX_RUN,'COMPARISON_ARTIFACTS_TOO_LARGE');
 const {bodyBase64,...metadata}=f;artifacts.push({metadata,body});
 }
 need([...v.input.artifactIds,...v.metrics.flatMap(m=>m.artifactIds)].every(x=>identifiers.has(x)),'COMPARISON_ARTIFACT_REFERENCE_INVALID');
 json(v.result,MAX_RUN);
 need(Array.isArray(v.limitations)&&v.limitations.length<=1000&&v.limitations.every(x=>typeof x==='string'&&x.length<=12000),'COMPARISON_LIMITATIONS_INVALID');
 return{value:v,artifacts};
}

return {parseRun,caseDefinition,candidateDefinition,sourceRefs,id,safePath};
 })();
 const preparing=(()=>{const {parseRun,caseDefinition,candidateDefinition,sourceRefs,id,safePath}=contract;
const LIMIT=64*1024*1024;
const need=(ok,code,details={})=>{if(!ok)throw Object.assign(new Error(code),{code,details});};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const digest=b=>createHash('sha256').update(b).digest('hex');
const bytes=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const text=(x,key,max=40000)=>{need(typeof x==='string'&&x.length>0&&x.length<=max,key);return x;};
const canonical=x=>Array.isArray(x)?x.map(canonical):plain(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const descriptor=b=>({bytes:b.length,sha256:digest(b)});
function exact(obj,allowed,code){need(plain(obj)&&Object.keys(obj).every(k=>allowed.includes(k)),code);return obj;}

function utf8(body){let result;try{result=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(body);}catch{need(false,'OUTPUT_UTF8_INVALID');}need(Buffer.from(result).equals(body),'OUTPUT_UTF8_INVALID');return result;}
function csvRecords(input,{delimiter=',',maximumRows=10000}={}){
 need([',','\t',';'].includes(delimiter),'OUTPUT_DELIMITER_INVALID');
 let at=0,line=1,start=1,cell='',row=[],quoted=false,closed=false,started=false;const rows=[];
 if(input.charCodeAt(0)===0xfeff)at=1;
 const endCell=()=>{row.push(cell);cell='';closed=false;started=false;};
 const endRow=()=>{endCell();rows.push({line:start,values:row});need(rows.length<=maximumRows+1,'OUTPUT_ROW_LIMIT');row=[];};
 while(at<input.length){
  const c=input[at++];
  if(quoted){if(c==='"'){if(input[at]==='"'){cell+='"';at++;}else{quoted=false;closed=true;}}else{cell+=c;if(c==='\n'||c==='\r'&&input[at]!=='\n')line++;}continue;}
  if(c==='"'){need(!started&&!closed&&cell==='','OUTPUT_CSV_QUOTE',{line});quoted=true;started=true;continue;}
  if(c===delimiter){endCell();continue;}
  if(c==='\n'||c==='\r'){if(c==='\r'&&input[at]==='\n')at++;endRow();line++;start=line;continue;}
  need(!closed,'OUTPUT_CSV_TRAILING_TEXT',{line});cell+=c;started=true;
 }
 need(!quoted,'OUTPUT_CSV_UNCLOSED_QUOTE',{line});
 if(started||closed||cell.length||row.length)endRow();
 need(rows.length>0,'OUTPUT_CSV_EMPTY');const headers=rows.shift().values;
 need(headers.length>0&&headers.length<=1000&&headers.every(x=>x.length>0)&&new Set(headers).size===headers.length,'OUTPUT_HEADERS_INVALID');
 for(const r of rows)need(r.values.length===headers.length,'OUTPUT_ROW_WIDTH',{line:r.line,expected:headers.length,actual:r.values.length});
 return{headers,rows:rows.map((r,index)=>({ordinal:index+1,line:r.line,values:r.values,record:Object.fromEntries(headers.map((h,i)=>[h,r.values[i]]))}))};
}
function binding(value,headers,{allowLiteral=true}={}){
 exact(value,['column','literal'],'OUTPUT_BINDING_INVALID');
 need((Object.hasOwn(value,'column')?1:0)+(Object.hasOwn(value,'literal')?1:0)===1,'OUTPUT_BINDING_INVALID');
 if(Object.hasOwn(value,'column'))need(typeof value.column==='string'&&headers.includes(value.column),'OUTPUT_COLUMN_MISSING',{column:value.column});
 else need(allowLiteral&&(typeof value.literal==='string'||value.literal===null||typeof value.literal==='number'||typeof value.literal==='boolean'),'OUTPUT_LITERAL_INVALID');
 return value;
}
const bound=(spec,row)=>Object.hasOwn(spec,'column')?row[spec.column]:spec.literal;
function mapTable(table,plan){
 exact(plan,['schema','source','originals','run','candidate','protocol','mapping'],'OUTPUT_PLAN_FIELDS');
 need(plan.schema==='sf88-original-output-plan/v1','OUTPUT_PLAN_SCHEMA');
 const protocol=caseDefinition(plan.protocol),candidate=candidateDefinition(plan.candidate);
 const m=exact(plan.mapping,['delimiter','rowKeyColumns','selection','exclude','fields','denominator','missingTokens','missingReason'],'OUTPUT_MAPPING_FIELDS');
 need(Array.isArray(m.rowKeyColumns)&&m.rowKeyColumns.length>0&&new Set(m.rowKeyColumns).size===m.rowKeyColumns.length&&m.rowKeyColumns.every(x=>table.headers.includes(x)),'OUTPUT_ROW_KEY_REQUIRED');
 const fields=exact(m.fields,['criterionId','label','value','unit','definition','cohortRef'],'OUTPUT_METRIC_FIELDS');
 for(const key of ['criterionId','label','value','unit','definition','cohortRef'])binding(fields[key],table.headers,{allowLiteral:key!=='value'});
 need(plain(m.denominator)&&Object.keys(m.denominator).length>0,'OUTPUT_DENOMINATOR_REQUIRED');
 for(const v of Object.values(m.denominator))binding(v,table.headers);
 binding(m.missingReason,table.headers);need(Array.isArray(m.missingTokens)&&m.missingTokens.every(x=>typeof x==='string'),'OUTPUT_MISSING_TOKENS');
 const filters=m.selection??[];need(Array.isArray(filters)&&filters.every(f=>plain(f)&&Object.keys(f).every(k=>['column','values'].includes(k))&&table.headers.includes(f.column)&&Array.isArray(f.values)&&f.values.length>0&&f.values.every(v=>typeof v==='string')),'OUTPUT_SELECTION_INVALID');
 const exclusions=m.exclude??[];need(Array.isArray(exclusions),'OUTPUT_EXCLUSIONS_INVALID');
 const exclusionMap=new Map();for(const e of exclusions){exact(e,['key','reason','reviewer','reviewedAt'],'OUTPUT_EXCLUSION_FIELDS');need(Array.isArray(e.key)&&e.key.length===m.rowKeyColumns.length&&e.key.every(x=>typeof x==='string'),'OUTPUT_EXCLUSION_KEY');text(e.reason,'OUTPUT_EXCLUSION_REASON');text(e.reviewer,'OUTPUT_EXCLUSION_REVIEWER');need(new Date(e.reviewedAt).toISOString()===e.reviewedAt,'OUTPUT_EXCLUSION_TIME');const k=JSON.stringify(e.key);need(!exclusionMap.has(k),'OUTPUT_EXCLUSION_DUPLICATE');exclusionMap.set(k,e);}
 const criteria=new Map(protocol.criteria.map(c=>[c.id,c])),seen=new Set(),usedExclusions=new Set(),metrics=[],rows=[],issues=[];
 for(const entry of table.rows){
  const row=entry.record,key=m.rowKeyColumns.map(k=>row[k]),encoded=JSON.stringify(key),local=[];
  if(key.some(x=>x===''))local.push('ROW_KEY_EMPTY');
  if(seen.has(encoded))local.push('ROW_KEY_DUPLICATE');seen.add(encoded);
  const receipt={ordinal:entry.ordinal,line:entry.line,key,values:entry.values,disposition:'SELECTED',issues:local};
  const exclusion=exclusionMap.get(encoded);
  if(exclusion){receipt.disposition='EXCLUDED_BY_REVIEW';receipt.review=exclusion;usedExclusions.add(encoded);}
  else if(filters.some(f=>!f.values.includes(row[f.column]))){receipt.disposition='OUTSIDE_SELECTION';receipt.selection=filters;}
  if(receipt.disposition==='SELECTED'){
   const value=bound(fields.value,row),nullValue=m.missingTokens.includes(value),criterionId=bound(fields.criterionId,row),criterion=criteria.get(criterionId),unit=bound(fields.unit,row);
   if(!criterion||criterion.kind!=='MEASURED')local.push('MEASURED_CRITERION_UNMAPPED');
   if(criterion?.unit&&unit!==criterion.unit)local.push('METRIC_UNIT_MISMATCH');
   if(typeof value!=='string'||!nullValue&&!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(value))local.push('EXACT_DECIMAL_REQUIRED');
   const definition=bound(fields.definition,row),label=bound(fields.label,row),cohortRef=bound(fields.cohortRef,row),reason=nullValue?bound(m.missingReason,row):'';
   for(const [field,v] of Object.entries({criterionId,unit,definition,label,cohortRef}))if(typeof v!=='string'||!v.trim())local.push('EMPTY_'+field.toUpperCase());
   if(nullValue&&(typeof reason!=='string'||!reason.trim()))local.push('UNDEFINED_REASON_REQUIRED');
   const denominator=Object.fromEntries(Object.entries(m.denominator).map(([name,b])=>[name,bound(b,row)]));
   if(Object.values(denominator).some(v=>v===null||v===''))local.push('DENOMINATOR_UNDEFINED');
   if(!local.length){const metric={id:'metric_'+digest(Buffer.from(encoded)),criterionId,label,value:nullValue?null:value,unit,undefinedReason:reason,definition,denominator,cohortRef,artifactIds:['original-table']};metrics.push(metric);receipt.metricId=metric.id;receipt.disposition=nullValue?'SELECTED_UNDEFINED':'SELECTED_VALUE';}
   else receipt.disposition='REVIEW_REQUIRED';
  }
  if(local.length)issues.push({ordinal:entry.ordinal,line:entry.line,key,issues:local});
  rows.push(receipt);
 }
 for(const [key,review]of exclusionMap)need(usedExclusions.has(key),'OUTPUT_EXCLUSION_NOT_FOUND',{key:review.key});
 need(table.rows.length>0,'OUTPUT_NO_SOURCE_ROWS');
 const coverage={sourceRows:rows.length,selectedValues:rows.filter(r=>r.disposition==='SELECTED_VALUE').length,selectedUndefined:rows.filter(r=>r.disposition==='SELECTED_UNDEFINED').length,excludedByReview:rows.filter(r=>r.disposition==='EXCLUDED_BY_REVIEW').length,outsideSelection:rows.filter(r=>r.disposition==='OUTSIDE_SELECTION').length,reviewRequired:issues.length};
 return{schema:'sf88-original-output-review/v1',status:issues.length?'REVIEW_REQUIRED':'READY',protocol,candidate,headers:table.headers,coverage,rows,issues,metrics};
}
async function prepareOutput(plan,{baseDirectory='.',readOriginal=original}={}){
 need(typeof readOriginal==='function','OUTPUT_ORIGINAL_READER_REQUIRED');
 const selectedRead=async(file,expected)=>{const body=await readOriginal(file,expected);need(Buffer.isBuffer(body)&&body.length===expected.bytes&&digest(body)===expected.sha256,'OUTPUT_ORIGINAL_FILE_CHANGED');return body;};
 need(plain(plan.source)&&typeof plan.source.file==='string','OUTPUT_SOURCE_REQUIRED');
 const source=await selectedRead(resolve(baseDirectory,plan.source.file),plan.source),table=csvRecords(utf8(source),{delimiter:plan.mapping?.delimiter??','});
 const mapped=mapTable(table,plan),artifacts=[{id:'original-table',path:'original/table.csv',role:'original measured output table',mediaType:plan.mapping.delimiter==='\t'?'text/tab-separated-values':'text/csv',...descriptor(source),bodyBase64:source.toString('base64')}];
 need(Array.isArray(plan.originals)&&plan.originals.length<=200,'OUTPUT_ORIGINALS_REQUIRED');let total=source.length;
 for(const spec of plan.originals){
  exact(spec,['id','file','path','role','mediaType','bytes','sha256'],'OUTPUT_ORIGINAL_FIELDS');id(spec.id);safePath(spec.path);
  need(!artifacts.some(a=>a.id===spec.id||a.path===spec.path),'OUTPUT_ORIGINAL_DUPLICATE');
  const body=await selectedRead(resolve(baseDirectory,spec.file),spec);total+=body.length;need(total<=LIMIT-1024*1024,'OUTPUT_ATTACHMENTS_TOO_LARGE');
  artifacts.push({id:spec.id,path:spec.path,role:text(spec.role,'OUTPUT_ROLE_REQUIRED'),mediaType:text(spec.mediaType,'OUTPUT_MEDIA_TYPE_REQUIRED'),...descriptor(body),bodyBase64:body.toString('base64')});
 }
 const planBody=bytes(plan);need(!artifacts.some(a=>a.id==='preparation-plan'||a.path==='preparation/plan.json'),'OUTPUT_RESERVED_PLAN_MEMBER');
 total+=planBody.length;need(total<=LIMIT-1024*1024,'OUTPUT_ATTACHMENTS_TOO_LARGE');
 artifacts.push({id:'preparation-plan',path:'preparation/plan.json',role:'complete selected preparation plan',mediaType:'application/json',...descriptor(planBody),bodyBase64:planBody.toString('base64')});
 const p=exact(plan.run,['externalRunId','kind','status','startedAt','finishedAt','elapsedMs','engine','input','limitations'],'OUTPUT_RUN_FIELDS');
 need(p.kind==='IMPORTED_MEASUREMENT'||p.kind==='SOURCE_NATIVE'||p.kind==='TRAINING_FIXTURE','OUTPUT_RUN_KIND');
 const review={...mapped,planSha256:digest(bytes(plan)),source:descriptor(source),originals:artifacts.map(({bodyBase64,...f})=>f)};
 let envelope=null;
 if(mapped.status==='READY'){
  need(mapped.metrics.length>0,'OUTPUT_NO_SELECTED_METRICS');
  const result={schema:'sf88-original-output-result/v1',source:review.source,originals:review.originals,headers:mapped.headers,coverage:mapped.coverage,rows:mapped.rows,mapping:plan.mapping,planSha256:review.planSha256,interpretation:'Values are preserved from the selected original producer output; no model, aggregate, currency or metric is calculated here.'};
  envelope={schema:'sf88-research-comparison-run/v1',...p,input:{...p.input,sourceRefs:sourceRefs(p.input.sourceRefs),artifactIds:artifacts.map(x=>x.id)},metrics:mapped.metrics,artifacts,result,limitations:[...p.limitations,'Original table values are not recalculated. Review source cohort, period, denominator, units and mapping before judging comparability.']};
  const raw=bytes(envelope);need(raw.length<=LIMIT,'OUTPUT_ENVELOPE_TOO_LARGE',{bytes:raw.length});parseRun(raw.toString('utf8'));
 }
 return{review,envelope};
}

// MIT. Readable complete original-output mapping review; retained values remain unchanged.
function reviewHtml(review){
 const data=Buffer.from(JSON.stringify(review)).toString('base64');
 return Buffer.from(String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; base-uri 'none'; form-action 'none'">
<title>Original output mapping review</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f5f5;color:#171717;font:15px/1.5 system-ui,sans-serif}main{max-width:1400px;margin:auto;padding:24px}h1{font-size:26px;margin:0 0 10px}h2{font-size:19px}.panel{background:white;border:1px solid #bbb;padding:18px;margin:16px 0}button,input,select{font:inherit;border:1px solid #777;padding:8px 11px;background:white;color:#111;min-height:40px}button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #666;outline-offset:2px}button:disabled{opacity:.5;cursor:default}.controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.scroll{overflow:auto;border:1px solid #bbb;margin:12px 0}table{width:100%;min-width:760px;border-collapse:collapse}th,td{padding:10px 12px;text-align:left;vertical-align:top;border-bottom:1px solid #ddd}th{background:#eee;white-space:nowrap}td{max-width:400px;overflow-wrap:break-word}.muted{color:#555}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;border:1px solid #ccc;padding:14px;max-height:70vh;overflow:auto}dialog{width:min(1000px,95vw);border:1px solid #777;padding:20px}dialog::backdrop{background:#0007}.count{font-variant-numeric:tabular-nums}.identity{font:12px/1.6 ui-monospace,monospace;overflow-wrap:anywhere}@media(max-width:600px){main{padding:14px}h1{font-size:22px}.panel{padding:12px}.controls input{width:100%}}@media print{.controls,button,dialog{display:none}.scroll{overflow:visible}main{max-width:none;padding:0}body{background:white}}
</style></head><body><main><h1>Original output mapping review</h1><p id="title"></p><p id="status"></p>
<section class="panel"><h2>Complete source coverage</h2><div id="counts"></div><p class="muted">Every original row remains in this review. A selected value is copied exactly from the producer output; missing values retain their explanation. No model, aggregate or currency calculation occurs here.</p><button id="protocol">Open protocol and candidate</button></section>
<section class="panel"><h2>Original rows</h2><div class="controls"><label for="search">Find in complete records</label><input id="search" type="search"><label for="state">Disposition</label><select id="state"><option value="">All rows</option><option>SELECTED_VALUE</option><option>SELECTED_UNDEFINED</option><option>EXCLUDED_BY_REVIEW</option><option>OUTSIDE_SELECTION</option><option>REVIEW_REQUIRED</option></select><button id="download">Download complete review JSON</button></div><div class="scroll" tabindex="0" role="region" aria-label="Original rows"><table><thead><tr><th>Source row</th><th>Original key</th><th>Disposition</th><th>Issues / reason</th><th>Complete record</th></tr></thead><tbody id="rows"></tbody></table></div><div class="controls"><button id="previous">Previous</button><span id="page" role="status"></span><button id="next">Next</button></div><p class="muted">The screen displays 50 rows per page. Search examines complete retained records. Downloads include all rows and all source values.</p></section>
<details class="panel"><summary>Original file inventory and plan identity</summary><pre id="source"></pre></details>
<p class="muted">Resolve mapping findings in an explicit new preparation plan. Receive the reviewed original output package through the existing Research comparison application, then record named judgments and decisions there.</p>
</main><dialog id="detail"><div class="controls"><h2 id="detail-title"></h2><button id="close">Close</button></div><pre id="detail-body"></pre></dialog><script type="application/octet-stream" id="data">__DATA__</script><script>
(()=>{'use strict';const raw=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(document.getElementById('data').textContent),c=>c.charCodeAt(0))),r=JSON.parse(raw),$=id=>document.getElementById(id);let offset=0;
$('title').textContent=r.protocol.title+' / '+r.candidate.name+' / '+r.candidate.version;$('status').textContent=r.status==='READY'?'Ready for original-dossier receiving. Inspect selected definitions and every source disposition before importing.':'Mapping review required. The original source is retained; this edition has no importable measured-run envelope.';
$('counts').textContent=Object.entries(r.coverage).map(([k,v])=>k.replace(/[A-Z]/g,c=>' '+c.toLowerCase())+': '+v).join(' · ');$('source').textContent=JSON.stringify({planSha256:r.planSha256,source:r.source,originals:r.originals},null,2);
function show(title,value){$('detail-title').textContent=title;$('detail-body').textContent=JSON.stringify(value,null,2);$('detail').showModal();}$('close').onclick=()=>$('detail').close();$('protocol').onclick=()=>show('Protocol and candidate',{protocol:r.protocol,candidate:r.candidate});
function render(){const query=$('search').value.toLowerCase(),state=$('state').value,all=r.rows.filter(x=>(!state||x.disposition===state)&&(!query||JSON.stringify(x).toLowerCase().includes(query)));offset=Math.max(0,Math.min(offset,Math.max(0,Math.ceil(all.length/50)-1)*50));$('rows').replaceChildren();for(const x of all.slice(offset,offset+50)){const tr=document.createElement('tr');for(const value of [x.ordinal+' / line '+x.line,JSON.stringify(x.key),x.disposition,x.issues.join(', ')||x.review?.reason||'']){const td=document.createElement('td');td.textContent=value;tr.append(td);}const td=document.createElement('td'),button=document.createElement('button');button.textContent='Open row';button.onclick=()=>show('Original row '+x.ordinal,{...x,source:Object.fromEntries(r.headers.map((h,i)=>[h,x.values[i]])),metric:r.metrics.find(m=>m.id===x.metricId)||null});td.append(button);tr.append(td);$('rows').append(tr);}if(!all.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='No rows match this view.';tr.append(td);$('rows').append(tr);}$('page').textContent=(all.length?offset+1:0)+'–'+Math.min(offset+50,all.length)+' of '+all.length+' matching rows; '+r.rows.length+' total.';$('previous').disabled=offset===0;$('next').disabled=offset+50>=all.length;}
$('search').oninput=()=>{offset=0;render();};$('state').onchange=()=>{offset=0;render();};$('previous').onclick=()=>{offset-=50;render();};$('next').onclick=()=>{offset+=50;render();};$('download').onclick=()=>{const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='complete-original-output-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};render();})();
</script></body></html>
`.replace('__DATA__',data));
}

return {csvRecords,mapTable,prepareOutput,reviewHtml};
 })();
 return {...contract,...preparing,Buffer,resolve};
}

/* MIT. Exact maintained PrivacyBench projection in an explicit portable bytes boundary. */
function createNativePrivacyBench(options) {
"use strict";
const {codec,nativeResearch}=options;
const structuredClone=v=>JSON.parse(JSON.stringify(v));
const {Buffer,resolve,prepareOutput}=nativeResearch;
const TextDecoder=class {decode(b){return Buffer.from(b).toString('utf8');}};
function createHash(a){if(a!=='sha256')throw Error('HASH_ALGORITHM');const chunks=[];return {update(b){chunks.push(Buffer.from(b));return this;},digest(e){if(e!=='hex')throw Error('HASH_ENCODING');const b=new Uint8Array(chunks.reduce((n,x)=>n+x.length,0));let p=0;for(const x of chunks){b.set(x,p);p+=x.length;}return codec.sha256Bytes(b);}};}
const PRIVACYBENCH_LIMITS=Object.freeze({resultBytes:33554432,totalFileBytes:66060288,encodedRunBytes:67108864,metricRows:10000,additionalOriginalFiles:190});
const PRIVACYBENCH_PRODUCER=Object.freeze({repository:'TonicAI/privacy_bench_metrics',commit:'5dfcaf57f0dae69b77d819ef04558944d31015de',format:'native'});
const PRIVACYBENCH_PROFILE='native-results-5dfcaf57';
const LIMIT=PRIVACYBENCH_LIMITS.resultBytes;
const COUNTS=['gold','detected','coherent','incoherent','skipped'];
const RATES=['ner_recall','synthesis_accuracy','combined_accuracy'];
const GROUPS=['overall','by_label','by_kind','per_character','per_org_group'];
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const need=(x,code,details={})=>{if(!x)throw Object.assign(new Error(code),{code,details});};
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const descriptor=b=>({bytes:b.length,sha256:sha(b)});
const escape=x=>String(x).replace(/~/g,'~0').replace(/\//g,'~1');
const cell=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
const text=(x,code,max=20000)=>{need(typeof x==='string'&&x.trim()&&x.length<=max,code);return x;};
const exact=(x,keys,code)=>{need(plain(x)&&Object.keys(x).every(k=>keys.includes(k)),code);return x;};
const canonical=x=>Array.isArray(x)?x.map(canonical):plain(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

/** Strict JSON parser retaining exact number lexemes by RFC6901 pointer.
 * Duplicate keys are rejected, including escaped-equivalent names.
 * The complete original UTF-8 remains an artifact; no provider number is rounded.
 */
function parseNativeJson(rawText){
 need(typeof rawText==='string'&&Buffer.byteLength(rawText)<=LIMIT,'PRIVACYBENCH_INPUT_LIMIT');
 need(Buffer.from(rawText,'utf8').toString('utf8')===rawText,'PRIVACYBENCH_UTF8');
 let at=0,nodes=0;const lexemes=new Map();
 const ws=()=>{while(/[\t\n\r ]/.test(rawText[at]??'')&&at<rawText.length)at++;};
 const string=()=>{const start=at++;let escaped=false;while(at<rawText.length){const c=rawText[at++];if(!escaped&&c==='"'){try{return JSON.parse(rawText.slice(start,at));}catch{need(false,'PRIVACYBENCH_JSON_STRING');}}if(!escaped&&c==='\\')escaped=true;else escaped=false;}need(false,'PRIVACYBENCH_JSON_STRING');};
 const value=(pointer,depth=0)=>{
  ws();need(depth<=100&&++nodes<=1000000,'PRIVACYBENCH_JSON_LIMIT');
  const c=rawText[at];
  if(c==='"')return string();
  if(c==='{'){
   at++;ws();const result=Object.create(null),seen=new Set();if(rawText[at]==='}'){at++;return result;}
   for(;;){ws();need(rawText[at]==='"','PRIVACYBENCH_JSON_KEY');const key=string();need(!seen.has(key),'PRIVACYBENCH_JSON_DUPLICATE',{pointer,key});seen.add(key);ws();need(rawText[at++]===':','PRIVACYBENCH_JSON_COLON');result[key]=value(pointer+'/'+escape(key),depth+1);ws();const sep=rawText[at++];if(sep==='}')return result;need(sep===',','PRIVACYBENCH_JSON_SEPARATOR');}
  }
  if(c==='['){at++;ws();const result=[];if(rawText[at]===']'){at++;return result;}for(;;){result.push(value(pointer+'/'+result.length,depth+1));ws();const sep=rawText[at++];if(sep===']')return result;need(sep===',','PRIVACYBENCH_JSON_SEPARATOR');}}
  for(const [token,result] of [['true',true],['false',false],['null',null]])if(rawText.startsWith(token,at)){at+=token.length;if(token==='null')lexemes.set(pointer,null);return result;}
  const m=rawText.slice(at).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
  need(m,'PRIVACYBENCH_JSON_VALUE',{pointer});at+=m[0].length;lexemes.set(pointer,m[0]);return Number(m[0]);
 };
 const result=value('');ws();need(at===rawText.length&&plain(result),'PRIVACYBENCH_JSON_TRAILING');
 return {value:result,lexemes};
}

const definitions={
 gold:'Original count of in-scope gold spans in this group.',
 detected:'Original count of gold spans detected with the matching entity label and native-coordinate overlap.',
 coherent:'Original count of detected gold spans with a changed replacement judged coherent.',
 incoherent:'Original count of detected gold spans left identical or judged incoherent.',
 skipped:'Original count of detected changed spans lacking a usable judge verdict; these remain in the detected denominator.',
 ner_recall:'Original detected/gold rate. Detection requires the producer label and native-coordinate overlap contract.',
 synthesis_accuracy:'Original coherent/detected rate. Identity mappings and unjudged detected spans do not become successful synthesis.',
 combined_accuracy:'Original coherent/gold rate. This includes detection misses in its original gold-span denominator.'
};
function privacyBenchCriteria(){
 return [...COUNTS,...RATES].map(k=>({id:'privacybench.'+k,label:k.replace(/_/g,' '),kind:'MEASURED',
  unit:COUNTS.includes(k)?'span_count':'fraction',direction:RATES.includes(k)?'HIGHER':'DESCRIPTIVE',description:definitions[k]}));
}

/** All declared native groups become rows. Nothing is pooled, averaged or recomputed. */
function privacyBenchTable(rawText,{datasetId,datasetRevision,cohortRef}){
 text(datasetId,'PRIVACYBENCH_DATASET_REQUIRED',500);text(datasetRevision,'PRIVACYBENCH_DATASET_REVISION_REQUIRED',1000);text(cohortRef,'PRIVACYBENCH_COHORT_REQUIRED',1000);
 const {value:root,lexemes}=parseNativeJson(rawText),m=root.metrics;
 need(plain(root.config)&&root.config.format==='native'&&plain(m),'PRIVACYBENCH_NATIVE_FORMAT_REQUIRED');
 text(root.config.run_name,'PRIVACYBENCH_RUN_NAME_REQUIRED',1000);
 need(typeof m.judge_skipped==='boolean','PRIVACYBENCH_JUDGE_STATE_REQUIRED');
 need(typeof root.config.overlap_threshold==='number'&&Number.isFinite(root.config.overlap_threshold)
  &&root.config.overlap_threshold>=0&&root.config.overlap_threshold<=1,'PRIVACYBENCH_OVERLAP_THRESHOLD');
 need(plain(root.native_join)&&plain(root.detail),'PRIVACYBENCH_COMPLETE_RESULT_REQUIRED');
 const rows=[],blockInventory=[];
 const scalar=(block,key,pointer,isCount)=>{
  need(Object.hasOwn(block,key)&&lexemes.has(pointer),'PRIVACYBENCH_METRIC_MISSING',{pointer});
  const token=lexemes.get(pointer),v=block[key];
  need(isCount?typeof token==='string'&&/^(?:0|[1-9][0-9]*)$/.test(token):token===null||typeof token==='string'&&Number.isFinite(v)&&v>=0&&v<=1,
       'PRIVACYBENCH_METRIC_TYPE',{pointer});
  return token;
 };
 const add=(block,path,dimension,group,label,rates)=>{
  need(plain(block),'PRIVACYBENCH_METRIC_BLOCK',{path});
  const countTokens=Object.fromEntries(COUNTS.map(k=>[k,scalar(block,k,path+'/'+k,true)]));
  const allowed=[...COUNTS,...(rates?RATES:[])];
  need(Object.keys(block).every(k=>allowed.includes(k)),'PRIVACYBENCH_UNRECOGNIZED_BLOCK_FIELD',{path,keys:Object.keys(block)});
  blockInventory.push({pointer:path,dimension,group,label,measures:allowed});
  for(const measure of allowed){
   const pointer=path+'/'+measure,value=COUNTS.includes(measure)?countTokens[measure]:scalar(block,measure,pointer,false);
   const denominatorName=measure==='synthesis_accuracy'?'detected':'gold',denominator=countTokens[denominatorName];
   let reason='';
   if(value===null){
    if(m.judge_skipped&&measure!=='ner_recall')reason='Producer reports that the LLM judge was skipped; original rate is unavailable.';
    else if(denominator==='0')reason='The original '+denominatorName+' denominator is zero.';
    else reason='Producer supplied a null rate. Retain the full original result and review its detail; no replacement value is inferred.';
   }
   rows.push({dataset_id:datasetId,dataset_revision:datasetRevision,dimension,group,label,measure,
    criterion_id:'privacybench.'+measure,value:value===null?'':value,unit:COUNTS.includes(measure)?'span_count':'fraction',
    definition:definitions[measure],denominator_name:denominatorName,denominator_value:denominator,
    original_gold:countTokens.gold,original_detected:countTokens.detected,
    judge_skipped:String(m.judge_skipped),overlap_threshold:lexemes.get('/config/overlap_threshold'),
    cohort_ref:cohortRef,source_pointer:pointer,source_run_name:root.config.run_name,undefined_reason:reason});
   need(rows.length<=10000,'PRIVACYBENCH_RESEARCH_ROW_LIMIT');
  }
 };
 add(m.overall,'/metrics/overall','overall','all','all',true);
 for(const family of ['by_label','by_kind']){
  need(plain(m[family]),'PRIVACYBENCH_GROUP_REQUIRED',{family});
  for(const [key,block] of Object.entries(m[family]))add(block,'/metrics/'+family+'/'+escape(key),family,key,family==='by_label'?key:'all',true);
 }
 for(const family of ['per_character','per_org_group']){
  need(plain(m[family]),'PRIVACYBENCH_GROUP_REQUIRED',{family});
  for(const [key,group] of Object.entries(m[family])){
   need(plain(group)&&plain(group.by_label)&&Object.keys(group).every(k=>k==='by_label'),'PRIVACYBENCH_OWNER_BLOCK',{family,key});
   for(const [label,block]of Object.entries(group.by_label))add(block,'/metrics/'+family+'/'+escape(key)+'/by_label/'+escape(label),family,key,label,false);
  }
 }
 need(rows.length>0,'PRIVACYBENCH_EMPTY_RESULT');
 const headers=Object.keys(rows[0]),csv=headers.map(cell).join(',')+'\n'+rows.map(r=>headers.map(k=>cell(r[k])).join(',')).join('\n')+'\n';
 return {csv,rows,review:{schema:'sf88-privacybench-native-intake/v1',profile:'native-results-5dfcaf57',
  source:descriptor(Buffer.from(rawText)),sourceRunName:root.config.run_name,config:root.config,
  dataset:{id:datasetId,revision:datasetRevision},cohortRef,blocks:blockInventory,
  metricRows:rows.length,judgeSkipped:m.judge_skipped,
  originalSections:Object.keys(m),projectedSections:GROUPS,
  limitations:[
   'Every numeric value is the exact original JSON number lexeme; no metric or aggregate is calculated.',
   'Per-character groups can overlap. File-kind message/document rollups overlap their component groups. Do not sum these rows.',
   'Generated-gold native recall is distinct from precision/F1 on exhaustive human annotations. This profile does not import run_ner_eval output.',
   'Protocol v1 and v2 datasets are not interchangeable. Dataset revision, native matcher threshold, labels and judge configuration travel with each candidate.',
   'Benchmark data is synthetic; the original vendor results do not prove production privacy, regulatory compliance or customer acceptance.'
  ]}};
}

function buildPrivacyBenchPlan(rawText,selection,{sourceImplementation}={}){
 exact(selection,['schema','dataset','cohortRef','results','originals','protocol','candidate','run','reviewer','reviewedAt'],'PRIVACYBENCH_SELECTION_FIELDS');
 need(selection.schema==='sf88-privacybench-preparation/v1','PRIVACYBENCH_SELECTION_SCHEMA');
 exact(selection.dataset,['id','revision'],'PRIVACYBENCH_DATASET');
 text(selection.reviewer,'PRIVACYBENCH_REVIEWER_REQUIRED',240);
 need(typeof selection.reviewedAt==='string'&&Number.isFinite(Date.parse(selection.reviewedAt))&&new Date(selection.reviewedAt).toISOString()===selection.reviewedAt,'PRIVACYBENCH_REVIEW_TIME');
 exact(selection.results,['file','bytes','sha256'],'PRIVACYBENCH_RESULTS_DESCRIPTOR');
 text(selection.results.file,'PRIVACYBENCH_RESULTS_FILE_REQUIRED',4096);
 const originalBytes=Buffer.from(rawText);need(same(descriptor(originalBytes),{bytes:selection.results.bytes,sha256:selection.results.sha256}),'PRIVACYBENCH_RESULTS_CHANGED');
 const table=privacyBenchTable(rawText,{datasetId:selection.dataset.id,datasetRevision:selection.dataset.revision,cohortRef:selection.cohortRef});
 const criteria=privacyBenchCriteria();
 if(sourceImplementation)table.review.sourceImplementation=structuredClone(sourceImplementation);
 need(plain(selection.protocol)&&Array.isArray(selection.protocol.criteria),'PRIVACYBENCH_PROTOCOL_REQUIRED');
 for(const expected of criteria){const actual=selection.protocol.criteria.find(x=>x.id===expected.id);need(actual&&same(actual,expected),'PRIVACYBENCH_EXPLICIT_CRITERION_REQUIRED',{criterion:expected.id});}
 need(plain(selection.run)&&selection.run.kind==='IMPORTED_MEASUREMENT'||plain(selection.run)&&selection.run.kind==='TRAINING_FIXTURE','PRIVACYBENCH_IMPORT_KIND');
 need(plain(selection.run.input)&&plain(selection.run.input.definition),'PRIVACYBENCH_RUN_CONTEXT');
 need(plain(selection.candidate)&&plain(selection.candidate.configuration),'PRIVACYBENCH_CANDIDATE_REQUIRED');
 const providerBinding={profile:table.review.profile,dataset:selection.dataset,cohortRef:selection.cohortRef,
  originalResult:table.review.source,producerConfig:table.review.config,reviewer:selection.reviewer,reviewedAt:selection.reviewedAt,...(sourceImplementation?{sourceImplementation:structuredClone(sourceImplementation)}:{})};
 for(const owner of [selection.candidate.configuration,selection.run.input.definition])
  need(!Object.hasOwn(owner,'privacybench')||same(owner.privacybench,providerBinding),'PRIVACYBENCH_EXISTING_BINDING_CHANGED');
 const csvBytes=Buffer.from(table.csv),plan={
  schema:'sf88-original-output-plan/v1',source:{file:'metrics.csv',...descriptor(csvBytes)},
  originals:[{id:'privacybench-results',file:'results.json',path:'provider/results.json',role:'complete original provider native evaluation result',mediaType:'application/json',...descriptor(originalBytes)},
    {id:'privacybench-intake',file:'provider-review.json',path:'provider/intake-review.json',role:'complete original-field projection and source review',mediaType:'application/json',...descriptor(bytes(table.review))}],
  protocol:structuredClone(selection.protocol),
  candidate:{...structuredClone(selection.candidate),configuration:{...structuredClone(selection.candidate.configuration),privacybench:providerBinding}},
  run:{...structuredClone(selection.run),input:{...structuredClone(selection.run.input),definition:{...structuredClone(selection.run.input.definition),privacybench:providerBinding}},
    limitations:[...(selection.run.limitations??[]),...table.review.limitations]},
  mapping:{delimiter:',',rowKeyColumns:['dataset_id','dataset_revision','dimension','group','label','measure'],
   selection:[],exclude:[],fields:Object.fromEntries(Object.entries({criterionId:'criterion_id',label:'measure',value:'value',unit:'unit',definition:'definition',cohortRef:'cohort_ref'}).map(([k,v])=>[k,{column:v}])),
   denominator:Object.fromEntries(['denominator_name','denominator_value','original_gold','original_detected','dataset_id','dataset_revision','dimension','group','label','judge_skipped','overlap_threshold','source_pointer'].map(k=>[k,{column:k}])),
   missingTokens:[''],missingReason:{column:'undefined_reason'}}};
 need(Array.isArray(selection.originals)&&selection.originals.length<=190,'PRIVACYBENCH_ORIGINALS_REQUIRED');
 for(let i=0;i<selection.originals.length;i++){
  const f=selection.originals[i];exact(f,['id','file','path','role','mediaType','bytes','sha256'],'PRIVACYBENCH_ORIGINAL_DESCRIPTOR');
  need(!['privacybench-results','privacybench-intake','original-table','preparation-plan'].includes(f.id),'PRIVACYBENCH_RESERVED_MEMBER');
  plan.originals.push({...structuredClone(f),file:'originals/'+i});
 }
 return {table,plan};
}


function isPrivacyBenchPlan(plan){
 return plan?.candidate?.configuration?.privacybench?.profile===PRIVACYBENCH_PROFILE
  ||plan?.run?.input?.definition?.privacybench?.profile===PRIVACYBENCH_PROFILE;
}
function privacyBenchCatalog(sourceImplementation){
 return {schema:'sf88-privacybench-output-catalog/v1',profile:PRIVACYBENCH_PROFILE,
  producer:{...PRIVACYBENCH_PRODUCER},criteria:privacyBenchCriteria(),limits:{...PRIVACYBENCH_LIMITS},sourceImplementation};
}
function privacyBenchUtf8(body){
 let value;try{value=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(body);}catch{need(false,'PRIVACYBENCH_UTF8');}
 need(Buffer.from(value).equals(body),'PRIVACYBENCH_UTF8');return value;
}

/** Complete validated preparation in memory. Every selected original is read once before any publication. */
async function materializePrivacyBench(selection,{readOriginal,sourceImplementation}={}){
 need(typeof readOriginal==='function','PRIVACYBENCH_ORIGINAL_READER_REQUIRED');
 need(plain(selection)&&plain(selection.results)&&Array.isArray(selection.originals)&&selection.originals.length<=190,'PRIVACYBENCH_SELECTION_FIELDS');
 const specifications=[selection.results,...selection.originals];let declared=0;
 for(const f of specifications){
  need(plain(f)&&typeof f.file==='string'&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&/^[a-f0-9]{64}$/.test(f.sha256),'PRIVACYBENCH_ORIGINAL_DESCRIPTOR');
  declared+=f.bytes;need(Number.isSafeInteger(declared)&&declared<=PRIVACYBENCH_LIMITS.totalFileBytes,'PRIVACYBENCH_TOTAL_FILE_LIMIT');
 }
 need(selection.results.bytes<=LIMIT,'PRIVACYBENCH_INPUT_LIMIT');
 const selected=[];
 for(let i=0;i<specifications.length;i++){
  const spec=specifications[i],body=await readOriginal(spec.file,spec,i===0?LIMIT:PRIVACYBENCH_LIMITS.totalFileBytes);
  need(Buffer.isBuffer(body)&&same(descriptor(body),{bytes:spec.bytes,sha256:spec.sha256}),'PRIVACYBENCH_ORIGINAL_CHANGED',{file:spec.file});
  selected.push(body);
 }
 const {table,plan}=buildPrivacyBenchPlan(privacyBenchUtf8(selected[0]),selection,{sourceImplementation});
 const files=[
  {path:'metrics.csv',name:'metrics.csv',body:Buffer.from(table.csv)},
  {path:'results.json',name:'results.json',body:selected[0]},
  {path:'provider-review.json',name:'provider-review.json',body:bytes(table.review)},
  ...selection.originals.map((f,i)=>({path:'originals/'+i,name:f.path.split(/[\\/]/).at(-1)||f.id,body:selected[i+1]}))
 ].map(f=>({...f,...descriptor(f.body)}));
 const total=files.reduce((n,f)=>n+f.bytes,0)+bytes(plan).length;
 need(total<=PRIVACYBENCH_LIMITS.totalFileBytes,'PRIVACYBENCH_TOTAL_FILE_LIMIT',{bytes:total});
 const base=resolve('/privacybench-selected-inputs'),byPath=new Map(files.map(f=>[resolve(base,f.path),f]));
 const prepared=await prepareOutput(plan,{baseDirectory:base,readOriginal:async(path,expected)=>{
  const f=byPath.get(path);need(f&&f.bytes===expected.bytes&&f.sha256===expected.sha256,'PRIVACYBENCH_GENERATED_FILE_CHANGED');return f.body;
 }});
 const rawText=prepared.envelope?JSON.stringify(prepared.envelope,null,2)+'\n':null;
 need(!rawText||Buffer.byteLength(rawText)<=PRIVACYBENCH_LIMITS.encodedRunBytes,'PRIVACYBENCH_ENCODED_RUN_LIMIT');
 return {plan,files,providerReview:table.review,review:prepared.review,rawIdentity:rawText?descriptor(Buffer.from(rawText)):null};
}

return {PRIVACYBENCH_LIMITS,PRIVACYBENCH_PRODUCER,PRIVACYBENCH_PROFILE,parseNativeJson,privacyBenchCriteria,privacyBenchTable,buildPrivacyBenchPlan,isPrivacyBenchPlan,privacyBenchCatalog,privacyBenchUtf8,materializePrivacyBench};
}

/* MIT. Immutable PrivacyBench source, edition, comparison and named-return lifecycle.
 * All provider metric projection and Research preparation uses the maintained factories.
 */
function createPrivacyBenchWorkspace(options) {
"use strict";
const {codec,nativePrivacyBench:pb,nativeResearch:nr}=options;
const SELECTION_TEMPLATE={"schema":"sf88-privacybench-preparation/v1","dataset":{"id":"TJLABS-SOFTWARE-FIXTURE-NOT-TONIC-DATA","revision":"fixture-v1"},"cohortRef":"software-fixture-001","results":{"file":"native-results.fixture.json","bytes":1932,"sha256":"c79c69b2d277f6af2e75c63a7845dcdf0de4feee117eab75491be97993eb9ec6"},"originals":[],"protocol":{"questionId":"training-question-privacybench-intake","title":"Software receiving fixture — original native result intake","purpose":"Exercise exact original result preservation. No benchmark or customer model was run.","scope":"One authored native-shaped JSON input for software receiving.","criteria":[{"id":"privacybench.gold","label":"gold","kind":"MEASURED","unit":"span_count","direction":"DESCRIPTIVE","description":"Original count of in-scope gold spans in this group."},{"id":"privacybench.detected","label":"detected","kind":"MEASURED","unit":"span_count","direction":"DESCRIPTIVE","description":"Original count of gold spans detected with the matching entity label and native-coordinate overlap."},{"id":"privacybench.coherent","label":"coherent","kind":"MEASURED","unit":"span_count","direction":"DESCRIPTIVE","description":"Original count of detected gold spans with a changed replacement judged coherent."},{"id":"privacybench.incoherent","label":"incoherent","kind":"MEASURED","unit":"span_count","direction":"DESCRIPTIVE","description":"Original count of detected gold spans left identical or judged incoherent."},{"id":"privacybench.skipped","label":"skipped","kind":"MEASURED","unit":"span_count","direction":"DESCRIPTIVE","description":"Original count of detected changed spans lacking a usable judge verdict; these remain in the detected denominator."},{"id":"privacybench.ner_recall","label":"ner recall","kind":"MEASURED","unit":"fraction","direction":"HIGHER","description":"Original detected/gold rate. Detection requires the producer label and native-coordinate overlap contract."},{"id":"privacybench.synthesis_accuracy","label":"synthesis accuracy","kind":"MEASURED","unit":"fraction","direction":"HIGHER","description":"Original coherent/detected rate. Identity mappings and unjudged detected spans do not become successful synthesis."},{"id":"privacybench.combined_accuracy","label":"combined accuracy","kind":"MEASURED","unit":"fraction","direction":"HIGHER","description":"Original coherent/gold rate. This includes detection misses in its original gold-span denominator."}],"sourceRefs":[]},"candidate":{"name":"Authored intake fixture","kind":"PLATFORM","version":"fixture-v1","description":"No provider model was executed.","configuration":{"fixture":true},"sourceRefs":[]},"run":{"externalRunId":"training-privacybench-original-001","kind":"TRAINING_FIXTURE","status":"SUCCEEDED","startedAt":"2026-10-13T18:30:00.000Z","finishedAt":"2026-10-13T18:30:00.000Z","elapsedMs":0,"engine":{"name":"TJLabs authored software fixture","version":"1","command":[],"runtime":{},"configuration":{"fixture":true}},"input":{"cohortId":"software-fixture-001","protocolId":"fixture-v1","definition":{"fixture":true},"sourceRefs":[]},"limitations":["Authored software receiving input; timestamps are fixture metadata, not an observed evaluation."]},"reviewer":"TJLabs software receiving fixture","reviewedAt":"2026-10-13T18:30:00.000Z"};
const SCHEMA="tjlabs.privacybench-workspace.v1",ENVELOPE="tjlabs.privacybench-working.v1";
const MAX=64*1024*1024,MAX_SOURCE=32*1024*1024,collections=["sources","selections","editions","comparisons","reviews","adoptions"];
const clone=x=>JSON.parse(JSON.stringify(x));
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const need=(ok,code,details={})=>{if(!ok)throw Object.assign(new Error(code),{code,details});};
const canonical=x=>Array.isArray(x)?x.map(canonical):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const json=x=>JSON.stringify(x,(_k,v)=>{need(v!==undefined&&typeof v!=="bigint"&&typeof v!=="function"&&typeof v!=="symbol"&&(typeof v!=="number"||Number.isFinite(v)),"JSON_VALUE");return v;});
const hash=x=>codec.sha256Bytes(codec.utf8Encode(json(canonical(x))));
const same=(a,b)=>hash(a)===hash(b);
const text=(v,name,max=20000,empty=false)=>{need(typeof v==="string"&&v.length<=max&&(empty||v.trim().length>0),name);return v;};
const id=v=>{need(typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(v),"ID_INVALID");return v;};
const time=v=>{need(typeof v==="string"&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v,"TIME_INVALID");return v;};
const fields=(v,names,code="FIELDS_INVALID")=>{need(object(v)&&Object.keys(v).every(k=>names.includes(k)),code);return v;};
const record=(w,k,key)=>{const r=w[k].find(r=>r.id===key);need(r,"RECORD_MISSING",{collection:k,id:key});return r;};
const bytesText=b=>{const t=nr.Buffer.from(b).toString("utf8");need(sameBytes(codec.utf8Encode(t),b),"SOURCE_UTF8");return t;};
const sameBytes=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const sourceBytes=r=>codec.fromBase64(r.body.contentBase64);
const sourceText=r=>bytesText(sourceBytes(r));
const size=w=>{const n=codec.utf8Encode(json(w)).length;need(n<=MAX,"WORKSPACE_LIMIT",{bytes:n,limit:MAX});return n;};
const parent=(w,k,p)=>{need(p===null||typeof p==="string","PARENT_REQUIRED");if(p!==null)record(w,k,p);};
const safeSource=b=>{
 fields(b,["name","role","mediaType","contentBase64","text"]);
 text(b.name,"SOURCE_NAME",4096);text(b.mediaType,"SOURCE_MEDIA",200);
 need(["results","summary","viewer","configuration","notes","support","prior_review"].includes(b.role),"SOURCE_ROLE");
 need((typeof b.contentBase64==="string")!==(typeof b.text==="string"),"SOURCE_CONTENT_EXCLUSIVE");
 let bytes;
 if(typeof b.text==="string"){bytes=codec.utf8Encode(b.text);need(bytesText(bytes)===b.text,"SOURCE_UTF8");}
 else {
  const s=b.contentBase64,pad=s.endsWith("==")?2:s.endsWith("=")?1:0;
  need(s.length<=Math.ceil(MAX_SOURCE/3)*4&&s.length%4===0&&!/[^A-Za-z0-9+/]/.test(s.slice(0,s.length-pad)),"SOURCE_BASE64");
  bytes=codec.fromBase64(s);need(codec.toBase64(bytes)===s,"SOURCE_BASE64_CANONICAL");
 }
 need(bytes.length<=MAX_SOURCE,"SOURCE_LIMIT");
 if(b.role==="results")pb.parseNativeJson(bytesText(bytes));
 return {name:b.name,role:b.role,mediaType:b.mediaType,contentBase64:codec.toBase64(bytes),bytes:bytes.length,sha256:codec.sha256Bytes(bytes)};
};
function create(v){
 fields(v,["id","label","createdAt"]);return {schema:SCHEMA,id:id(v.id),label:text(v.label,"WORKSPACE_LABEL",1000),createdAt:time(v.createdAt),revision:0,sources:[],selections:[],editions:[],comparisons:[],reviews:[],adoptions:[],operations:[]};
}
function selectionTemplate(){return clone(SELECTION_TEMPLATE);}
function selectionInput(w,v){
 fields(v,["label","resultId","originalBindings","dataset","cohortRef","protocol","candidate","run","reviewer","reviewedAt","parentId","previewSha256"]);
 const b=clone(v);delete b.previewSha256;text(b.label,"SELECTION_LABEL",1000);parent(w,"selections",b.parentId);
 const result=record(w,"sources",id(b.resultId));need(result.body.role==="results","RESULT_SOURCE_ROLE");
 need(Array.isArray(b.originalBindings)&&b.originalBindings.length<=190,"ORIGINAL_BINDINGS");
 const sourceIds=new Set(),names=new Set(),paths=new Set();
 const originals=b.originalBindings.map((x,i)=>{
  fields(x,["sourceId","id","path","role","mediaType"]);const s=record(w,"sources",id(x.sourceId));
  id(x.id);text(x.path,"ORIGINAL_PATH",4096);text(x.role,"ORIGINAL_ROLE",2000);text(x.mediaType,"ORIGINAL_MEDIA",200);
  need(!sourceIds.has(x.sourceId)&&!names.has(x.id)&&!paths.has(x.path),"ORIGINAL_DUPLICATE");
  sourceIds.add(x.sourceId);names.add(x.id);paths.add(x.path);
  return {id:x.id,file:"support/"+i,path:x.path,role:x.role,mediaType:x.mediaType,bytes:s.body.bytes,sha256:s.body.sha256};
 });
 const selection={schema:"sf88-privacybench-preparation/v1",dataset:b.dataset,cohortRef:b.cohortRef,
 results:{file:"results.json",bytes:result.body.bytes,sha256:result.body.sha256},originals,
 protocol:b.protocol,candidate:b.candidate,run:b.run,reviewer:b.reviewer,reviewedAt:b.reviewedAt};
 return {body:b,result,selection,originals};
}
const preparationCache=new Map();let preparationCacheBytes=0;
function cachedPreparation(key){const v=preparationCache.get(key);if(!v)return null;preparationCache.delete(key);preparationCache.set(key,v);return clone(v.value);}
function retainPreparation(key,value){const bytes=codec.utf8Encode(json(value)).length;if(bytes>8*1024*1024)return;while(preparationCache.size>=32||preparationCacheBytes+bytes>64*1024*1024){const first=preparationCache.keys().next().value;if(first===undefined)break;preparationCacheBytes-=preparationCache.get(first).bytes;preparationCache.delete(first);}preparationCache.set(key,{bytes,value:clone(value)});preparationCacheBytes+=bytes;}
async function prepareSelection(w,v){
 const {body,result,selection}=selectionInput(w,v);
 const cacheKey=hash({workspaceId:w.id,body,result:result.body,originals:body.originalBindings.map(x=>record(w,"sources",x.sourceId).body)}),cached=cachedPreparation(cacheKey);
 if(cached)return cached;
 const by=new Map([["results.json",nr.Buffer.from(sourceBytes(result))],
 ...body.originalBindings.map((x,i)=>["support/"+i,nr.Buffer.from(sourceBytes(record(w,"sources",x.sourceId)))])]);
 const out=await pb.materializePrivacyBench(selection,{readOriginal:async path=>{need(by.has(path),"ORIGINAL_FILE_MISSING");return by.get(path);}});
 const nativeFiles=new Map(out.files.map(f=>[nr.resolve("/privacybench-selected-inputs",f.path),f.body]));
 const p=await nr.prepareOutput(out.plan,{baseDirectory:"/privacybench-selected-inputs",readOriginal:async path=>{need(nativeFiles.has(path),"PREPARED_FILE_MISSING");return nativeFiles.get(path);}});
 const table=pb.privacyBenchTable(sourceText(result),{datasetId:body.dataset.id,datasetRevision:body.dataset.revision,cohortRef:body.cohortRef});
 const binding={workspaceId:w.id,body,source:{id:result.id,bytes:result.body.bytes,sha256:result.body.sha256},
 originals:body.originalBindings.map(x=>({sourceId:x.sourceId,sha256:record(w,"sources",x.sourceId).body.sha256})),tableSha256:codec.sha256Bytes(codec.utf8Encode(table.csv)),runSha256:hash(p.envelope)};
 const prepared={sha256:hash(binding),body,table,review:p.review,run:p.envelope,plan:out.plan,nativeSelection:selection,
 files:out.files.map(f=>({path:f.path,name:f.name,bytes:f.bytes,sha256:f.sha256,contentBase64:codec.toBase64(f.body)}))};
 retainPreparation(cacheKey,prepared);return prepared;
}
async function previewSelection(w,v){return prepareSelection(w,v);}
async function previewEdition(w,v){
 fields(v,["label","selectionId","parentId","previewSha256"]);const body={label:text(v.label,"EDITION_LABEL",1000),selectionId:id(v.selectionId),parentId:v.parentId};
 parent(w,"editions",body.parentId);const selection=record(w,"selections",body.selectionId);
 const out=await prepareSelection(w,selection.body.input);need(out.sha256===selection.body.previewSha256,"SELECTION_DERIVATION_CHANGED");
 return {...out,body,selection,sha256:hash({workspaceId:w.id,body,selectionSha256:out.sha256})};
}
async function inspectEdition(w,key){
 const edition=record(w,"editions",key),out=await previewEdition(w,edition.body.input);
 need(out.sha256===edition.body.previewSha256,"EDITION_DERIVATION_CHANGED");
 return {...out,edition};
}
function metricKey(r){return json([r.dimension,r.group,r.label,r.measure]);}
function decimal(v){
 const m=String(v).match(/^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/);need(m,"DECIMAL_TOKEN");
 let digits=(m[2]+(m[3]||"")).replace(/^0+/,"");if(!digits)return {sign:0,digits:"0",exponent:0n};
 let exponent=BigInt(m[4]||"0")-BigInt((m[3]||"").length);
 while(digits.endsWith("0")){digits=digits.slice(0,-1);exponent++;}
 return {sign:m[1]?-1:1,digits,exponent};
}
function decimalChange(a,b){
 const x=decimal(a),y=decimal(b);let cmp;
 if(x.sign!==y.sign)cmp=y.sign>x.sign?1:-1;
 else if(x.sign===0)cmp=0;
 else {const xx=BigInt(x.digits.length)+x.exponent,yy=BigInt(y.digits.length)+y.exponent;
  if(xx!==yy)cmp=yy>xx?1:-1;
  else {const len=Math.max(x.digits.length,y.digits.length),xd=x.digits.padEnd(len,"0"),yd=y.digits.padEnd(len,"0");cmp=yd===xd?0:yd>xd?1:-1;}
  cmp*=x.sign;
 }
 const change=cmp>0?"increased":cmp<0?"decreased":"equal";
 const base=x.exponent<y.exponent?x.exponent:y.exponent,xe=x.exponent-base,ye=y.exponent-base;
 if(xe>4096n||ye>4096n||base>4096n||base< -4096n||x.digits.length>4096||y.digits.length>4096)
  return {change,delta:null,deltaReason:"Exact original tokens retained; expanded decimal difference exceeds the display limit."};
 const n=BigInt(y.digits)*BigInt(y.sign)*10n**ye-BigInt(x.digits)*BigInt(x.sign)*10n**xe;
 let d=(n<0n?-n:n).toString(),out;if(base>=0n)out=d+"0".repeat(Number(base));else {const places=Number(-base);d=d.padStart(places+1,"0");out=d.slice(0,-places)+"."+d.slice(-places);out=out.replace(/0+$/,"").replace(/\.$/,"");}
 return {change,delta:(n<0n?"-":"")+out,deltaReason:"Exact subtraction of the two original metric tokens; no rate is recomputed."};
}
function nativeContext(w,selection){
 const src=record(w,"sources",selection.body.input.resultId),p=pb.parseNativeJson(sourceText(src));
 function typed(v,path){if(p.lexemes.has(path))return {number:p.lexemes.get(path)};if(Array.isArray(v))return v.map((x,i)=>typed(x,path+"/"+i));if(object(v))return Object.fromEntries(Object.keys(v).sort().filter(k=>!(path==="/config"&&["run_name","predictions","ground_truth","characters"].includes(k))).map(k=>[k,typed(v[k],path+"/"+k.replace(/~/g,"~0").replace(/\//g,"~1"))]));return v;}
 return {config:typed(p.value.config,"/config"),judgeSkipped:p.value.metrics.judge_skipped};
}
async function previewComparison(w,v){
 fields(v,["label","leftId","rightId","basis","reviewer","note","previewSha256"]);
 const body=clone(v);delete body.previewSha256;text(body.label,"COMPARISON_LABEL",1000);text(body.reviewer,"REVIEWER",240);text(body.note,"COMPARISON_NOTE",20000);
 fields(body.basis,["dataset","cohort","protocol","judge","rationale"]);
 for(const k of ["dataset","cohort","protocol","judge"])need(["same","changed","unknown"].includes(body.basis[k]),"COMPARISON_BASIS",{key:k});
 text(body.basis.rationale,"COMPARISON_RATIONALE",20000);need(body.leftId!==body.rightId,"COMPARISON_DISTINCT_EDITIONS");
 const left=await inspectEdition(w,body.leftId),right=await inspectEdition(w,body.rightId),l=left.selection.body.input,r=right.selection.body.input;
 const observed={dataset:same(l.dataset,r.dataset),cohort:l.cohortRef===r.cohortRef,protocol:same(l.protocol,r.protocol),judge:same(nativeContext(w,left.selection),nativeContext(w,right.selection))};
 const caveats=[];
 for(const k of ["dataset","cohort","protocol","judge"]){if(body.basis[k]!=="same")caveats.push(k+" comparability is declared "+body.basis[k]+".");else if(!observed[k])caveats.push(k+" was declared same, but the retained metadata differs.");}
 const comparable=caveats.length===0;
 caveats.push("Values are original provider metrics. Observed differences do not prove improved privacy, production safety or customer acceptance.");
 caveats.push("Overlapping character, organisation and file-kind groups are never summed.");
 const rm=new Map(right.table.rows.map(x=>[metricKey(x),x])),rows=[],unmatchedLeft=[];
 for(const a of left.table.rows){const key=metricKey(a),b=rm.get(key);if(!b){unmatchedLeft.push(a);continue;}rm.delete(key);
 const delta=a.value===""||b.value===""?{change:"unavailable",delta:null,deltaReason:"At least one original metric is unavailable; original null reasons are retained."}:decimalChange(a.value,b.value);
 const sameGold=a.original_gold===b.original_gold,rowComparable=comparable&&sameGold;
 rows.push({id:"pair-"+hash(key),key,dimension:a.dimension,group:a.group,label:a.label,measure:a.measure,left:a,right:b,...delta,comparable:rowComparable,reason:!sameGold?"The original gold population differs for this group. Preserve both original denominators; review dataset/cohort correspondence.":rowComparable?"Explicit declarations and retained contexts agree.":"Review the comparability caveats; this is an observed change only."});
 }
 const goldDifferences=rows.filter(r=>r.left.original_gold!==r.right.original_gold).length;if(goldDifferences)caveats.push(goldDifferences+" paired metric rows have different original gold populations. Their observed changes are retained without comparability.");
 const result={body,rows,unmatchedLeft,unmatchedRight:[...rm.values()],caveats,observed,left:{id:left.edition.id,label:left.body.label,sha256:left.sha256},right:{id:right.edition.id,label:right.body.label,sha256:right.sha256}};
 return {...result,sha256:hash({workspaceId:w.id,...result})};
}
function latestReview(w,{subject,subjectId,target}){
 const all=w.reviews.filter(x=>x.body.subject===subject&&x.body.subjectId===subjectId&&x.body.target===target);
 return all.length?clone(all[all.length-1]):null;
}
async function subjectInfo(w,subject,key){
 need(subject==="edition"||subject==="comparison","REVIEW_SUBJECT");const r=record(w,subject==="edition"?"editions":"comparisons",key);
 const data=subject==="edition"?await inspectEdition(w,key):await previewComparison(w,r.body.input);
 if(subject==="comparison")need(data.sha256===r.body.previewSha256,"COMPARISON_DERIVATION_CHANGED");
 return {record:r,data,sha256:hash({record:r,derivedSha256:data.sha256})};
}
async function checkReview(w,b,{parentCheck=true}={}){
 fields(b,["subject","subjectId","target","status","owner","note","reviewer","parentId"]);
 const out=await subjectInfo(w,b.subject,b.subjectId);text(b.target,"REVIEW_TARGET",4096);
 const targets=b.subject==="edition"?out.data.table.rows.map(r=>r.source_pointer):out.data.rows.map(r=>r.id);
 need(b.target==="all"||targets.includes(b.target),"REVIEW_TARGET_UNKNOWN");
 need(["open","accept","investigate","defer"].includes(b.status),"REVIEW_STATUS");
 text(b.owner,"REVIEW_OWNER",240);text(b.note,"REVIEW_NOTE",20000);text(b.reviewer,"REVIEWER",240);
 need(b.parentId===null||typeof b.parentId==="string","PARENT_REQUIRED");
 if(parentCheck){const current=latestReview(w,b);need((current?.id??null)===b.parentId,"REVIEW_PARENT_CHANGED");}
 return out;
}
async function exportReviewReturn(w,{subject,subjectId}){
 await validateWorkspace(w);const s=await subjectInfo(w,subject,subjectId);
 const b={schema:"tjlabs.privacybench-review-return.v1",workspaceId:w.id,subject,subjectId,subjectSha256:s.sha256,
 reviews:clone(w.reviews.filter(r=>r.body.subject===subject&&r.body.subjectId===subjectId))};
 return {...b,sha256:hash(b)};
}
async function previewAdoption(w,v){
 fields(v,["returnSourceId","reviewer","note","previewSha256"]);const body={returnSourceId:id(v.returnSourceId),reviewer:text(v.reviewer,"REVIEWER",240),note:text(v.note,"ADOPTION_NOTE",20000)};
 const src=record(w,"sources",body.returnSourceId);need(src.body.role==="prior_review","RETURN_SOURCE_ROLE");
 const packet=JSON.parse(sourceText(src));fields(packet,["schema","workspaceId","subject","subjectId","subjectSha256","reviews","sha256"]);
 const unhashed=clone(packet);delete unhashed.sha256;
 need(packet.schema==="tjlabs.privacybench-review-return.v1"&&packet.workspaceId===w.id&&packet.sha256===hash(unhashed),"RETURN_BINDING");
 const info=await subjectInfo(w,packet.subject,packet.subjectId);need(info.sha256===packet.subjectSha256,"RETURN_SUBJECT_CHANGED");
 need(Array.isArray(packet.reviews)&&packet.reviews.length<=10000,"RETURN_REVIEWS");const copy=clone(w),additions=[],alreadyPresent=[],seen=new Set();
 for(const r of packet.reviews){fields(r,["id","body"]);id(r.id);need(!seen.has(r.id),"RETURN_DUPLICATE_ID");seen.add(r.id);
  need(r.body.subject===packet.subject&&r.body.subjectId===packet.subjectId,"RETURN_REVIEW_SCOPE");
  const prior=copy.reviews.find(x=>x.id===r.id);
  if(prior){need(same(prior,r),"RETURN_ID_CONFLICT");alreadyPresent.push(r.id);continue;}
  await checkReview(copy,r.body);copy.reviews.push(clone(r));additions.push(clone(r));
 }
 return {sha256:hash({workspaceId:w.id,body,sourceSha256:src.body.sha256,subjectSha256:info.sha256,currentReviews:w.reviews,additions,alreadyPresent}),body,additions,alreadyPresent,subject:packet.subject,subjectId:packet.subjectId};
}
async function perform(w,q){
 fields(q,["id","type","actor","at","input"]);id(q.id);time(q.at);
 if(typeof q.actor==="string")text(q.actor,"ACTOR",240);else {fields(q.actor,["id","name"]);id(q.actor.id);text(q.actor.name,"ACTOR",240);}
 need(object(q.input),"OPERATION_INPUT");json(q);
 const prior=w.operations.find(x=>x.request.id===q.id);if(prior){need(same(prior.request,q),"OPERATION_ID_CONFLICT");return {workspace:clone(w),result:clone(prior.result),replayed:true};}
 need(w.operations.length<10000,"OPERATION_LIMIT");
 let collection,body;const v=q.input;
 if(q.type==="source.add"){collection="sources";body=safeSource(v);}
 else if(q.type==="selection.save"){const p=await previewSelection(w,v);need(v.previewSha256===p.sha256,"SELECTION_PREVIEW_CHANGED");collection="selections";body={input:p.body,previewSha256:p.sha256};}
 else if(q.type==="edition.save"){const p=await previewEdition(w,v);need(v.previewSha256===p.sha256,"EDITION_PREVIEW_CHANGED");collection="editions";body={input:p.body,previewSha256:p.sha256};}
 else if(q.type==="comparison.save"){const p=await previewComparison(w,v);need(v.previewSha256===p.sha256,"COMPARISON_PREVIEW_CHANGED");collection="comparisons";body={input:p.body,previewSha256:p.sha256};}
 else if(q.type==="review.save"){await checkReview(w,v);collection="reviews";body=clone(v);}
 else if(q.type==="review.adopt"){const p=await previewAdoption(w,v);need(v.previewSha256===p.sha256,"RETURN_PREVIEW_CHANGED");collection="adoptions";body={input:p.body,previewSha256:p.sha256,subject:p.subject,subjectId:p.subjectId,addedReviewIds:p.additions.map(x=>x.id),alreadyPresent:p.alreadyPresent};}
 else need(false,"OPERATION_TYPE",{type:q.type});
 const next=clone(w),rid=collection.slice(0,-1)+"-"+hash({workspaceId:w.id,id:q.id,type:q.type}),result={collection,id:rid};
 if(q.type==="review.adopt"){const p=await previewAdoption(w,v);for(const r of p.additions)next.reviews.push(clone(r));}
 need(!next[collection].some(r=>r.id===rid),"RECORD_ID_CONFLICT");next[collection].push({id:rid,body});
 next.revision++;next.operations.push({request:clone(q),result,revision:next.revision});size(next);
 return {workspace:next,result,replayed:false};
}
const validated=new WeakMap();
async function validateWorkspace(w){
 need(object(w)&&w.schema===SCHEMA&&Array.isArray(w.operations)&&collections.every(k=>Array.isArray(w[k])),"WORKSPACE_SCHEMA");size(w);
 const fingerprint=hash(w);if(validated.get(w)===fingerprint)return w;
 let fresh=create({id:w.id,label:w.label,createdAt:w.createdAt});
 for(const op of w.operations){need(object(op)&&object(op.request),"OPERATION_HISTORY");const x=await perform(fresh,op.request);need(!x.replayed&&same(x.workspace.operations.at(-1),op),"OPERATION_HISTORY_CHANGED");fresh=x.workspace;}
 need(same(fresh,w),"WORKSPACE_REPLAY_CHANGED");validated.set(w,fingerprint);return w;
}
async function apply(w,q){await validateWorkspace(w);const x=await perform(w,q);validated.set(x.workspace,hash(x.workspace));return x;}
async function exportWorkspace(w){await validateWorkspace(w);return {schema:ENVELOPE,sha256:hash(w),workspace:clone(w)};}
async function importWorkspace(input){
 const x=typeof input==="string"?JSON.parse(input):clone(input);fields(x,["schema","sha256","workspace"]);
 need(x.schema===ENVELOPE&&x.sha256===hash(x.workspace),"WORKING_CHECKSUM");await validateWorkspace(x.workspace);return x.workspace;
}
async function report(w,{subject,id:key}){
 const s=await subjectInfo(w,subject,key);const history=clone(w.reviews.filter(r=>r.body.subject===subject&&r.body.subjectId===key));
 const latest=new Map();for(const r of history)latest.set(r.body.target,r);
 return {schema:"tjlabs.privacybench-report.v1",workspaceId:w.id,workspaceSha256:hash(w),subject,record:clone(s.record),data:s.data,reviews:[...latest.values()],history};
}
function csv(r){
 const cell=x=>'"'+String(x??"").replace(/"/g,'""')+'"';let headers,rows;
 if(r.subject==="edition"){headers=[...Object.keys(r.data.table.rows[0]||{}),"review_status","review_owner","review_note"];rows=r.data.table.rows.map(x=>{const rev=r.reviews.find(a=>a.body.target===x.source_pointer)||r.reviews.find(a=>a.body.target==="all");return {...x,review_status:rev?.body.status??"",review_owner:rev?.body.owner??"",review_note:rev?.body.note??""};});}
 else {headers=["row_kind","dimension","group","label","measure","left_value","right_value","left_denominator","right_denominator","left_null_reason","right_null_reason","change","delta","comparable","review_status","review_owner","review_note"];
 const row=(a,b,p,kind)=>{const rev=p?r.reviews.find(a=>a.body.target===p.id)||r.reviews.find(a=>a.body.target==="all"):null,x=a||b;return {row_kind:kind,dimension:x.dimension,group:x.group,label:x.label,measure:x.measure,left_value:a?.value??"",right_value:b?.value??"",left_denominator:a?.denominator_value??"",right_denominator:b?.denominator_value??"",left_null_reason:a?.undefined_reason??"",right_null_reason:b?.undefined_reason??"",change:p?.change??"",delta:p?.delta??"",comparable:p?String(p.comparable):"false",review_status:rev?.body.status??"",review_owner:rev?.body.owner??"",review_note:rev?.body.note??""};};
 rows=[...r.data.rows.map(p=>row(p.left,p.right,p,"paired")),...r.data.unmatchedLeft.map(x=>row(x,null,null,"unmatched_left")),...r.data.unmatchedRight.map(x=>row(null,x,null,"unmatched_right"))];}
 return headers.map(cell).join(",")+"\n"+rows.map(r=>headers.map(k=>cell(r[k])).join(",")).join("\n")+"\n";
}
async function prepareResearch(w,{editionId}){
 await validateWorkspace(w);const p=await inspectEdition(w,editionId),named=await report(w,{subject:"edition",id:editionId});
 const files=[];const add=(path,content)=>{const b=codec.utf8Encode(content);files.push({path,content,bytes:b.length,sha256:codec.sha256Bytes(b)});};
 add("selection.json",JSON.stringify(p.nativeSelection,null,2)+"\n");add("plan.json",JSON.stringify(p.plan,null,2)+"\n");
 add("research/run.json",JSON.stringify(p.run,null,2)+"\n");add("research/review.json",JSON.stringify(p.review,null,2)+"\n");add("research/review.html",nr.reviewHtml(p.review).toString("utf8"));
 add("workspace/complete-working-history.json",JSON.stringify(await exportWorkspace(w),null,2)+"\n");add("workspace/named-review.json",JSON.stringify(named,null,2)+"\n");
 const originals=p.files.map(f=>({path:"original/"+f.path,name:f.name,bytes:f.bytes,sha256:f.sha256,contentBase64:f.contentBase64}));
 // Text manifest carries binary originals losslessly without guessing an encoding.
 add("original/complete-original-files.json",JSON.stringify({schema:"tjlabs.exact-original-files.v1",files:originals},null,2)+"\n");
 add("README.md","# PrivacyBench Research handover\n\nThe Research run and review were produced by the maintained original preparation implementation. All selected original bytes are retained in original/complete-original-files.json, including binary supporting files. Named workspace reviews are retained separately and do not silently become Research judgments or acceptance. Import the exact research/run.json through the existing Research original-output workflow. Synthetic benchmark outputs do not establish production privacy or regulatory compliance.\n");
 add("manifest.json",JSON.stringify({schema:"tjlabs.privacybench-research-handover.v1",workspaceSha256:hash(w),editionId,files:files.map(({path,bytes,sha256})=>({path,bytes,sha256}))},null,2)+"\n");
 need(files.reduce((n,f)=>n+f.bytes,0)<=128*1024*1024,"RESEARCH_HANDOVER_LIMIT");
 return {workspaceSha256:hash(w),editionId,files,run:p.run,review:p.review,plan:p.plan};
}
async function handover(w){
 await validateWorkspace(w);return {workspace:await exportWorkspace(w),originals:w.sources.map(r=>({id:r.id,...clone(r.body)})),
 editions:await Promise.all(w.editions.map(r=>report(w,{subject:"edition",id:r.id}))),comparisons:await Promise.all(w.comparisons.map(r=>report(w,{subject:"comparison",id:r.id}))),reviews:clone(w.reviews),adoptions:clone(w.adoptions)};
}
return {create,apply,validateWorkspace,exportWorkspace,importWorkspace,selectionTemplate,previewSelection,previewEdition,inspectEdition,previewComparison,latestReview,exportReviewReturn,previewAdoption,report,csv,prepareResearch,handover,limits:{workspaceBytes:MAX,originalBytes:MAX_SOURCE},digest:hash};
}

const ioModule=(()=>{

// PrivacyBench original-file intake. ZIP writer retained from the complete maintained operator IO.
// Full original source and adaptation metadata accompany this module.
function createPrivacyBenchIO({codec}){
const LIMITS=Object.freeze({archiveBytes:128*1024*1024,memberBytes:32*1024*1024,expandedBytes:128*1024*1024,members:4096,nodes:350000,depth:96});
const fail=(message,code="PRIVACYBENCH_IO_INVALID")=>{throw Object.assign(new Error(message),{code});};
const bytes=x=>{if(!(x instanceof Uint8Array))fail("Supply original bytes as Uint8Array.");return x;};
const utf8=codec.utf8Encode,decode=codec.utf8Decode,hash=codec.sha256Bytes,toBase64=codec.toBase64;
const text=(v,label,max=1000)=>{if(typeof v!=="string"||!v||v.length>max)fail(label+" is missing or too long.");return v;};
const CRC_TABLE=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function fromBase64(s){if(typeof s!=="string"||s.length>Math.ceil(LIMITS.expandedBytes/3)*4)fail("Encoded original exceeds capacity.");const pad=s.endsWith("==")?2:s.endsWith("=")?1:0;if(s.length%4||/[^A-Za-z0-9+/]/.test(s.slice(0,s.length-pad)))fail("Original is not canonical Base64.");const b=codec.fromBase64(s);if(toBase64(b)!==s)fail("Original Base64 padding differs.");return b;}
function crc32(b){let c=0xffffffff;for(const x of b)c=CRC_TABLE[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function path(value){text(value,"Archive path",512);if(!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)||value.includes("//")||value.split("/").some(p=>!p||p==="."||p==="..")||value.endsWith("/"))fail("Use a safe relative ASCII archive file path.");return value;}
function admitArchivePath(seen,name){const key=name.toLowerCase();for(const previous of seen)if(previous===key||previous.startsWith(key+"/")||key.startsWith(previous+"/"))fail("Archive paths collide as files/directories or differ only by case; retain distinct portable paths.");seen.add(key);}
function concat(arrays){let size=arrays.reduce((n,b)=>n+b.length,0);if(size>LIMITS.archiveBytes)fail("Complete archive exceeds its declared capacity.","PRIVACYBENCH_IO_LIMIT");const out=new Uint8Array(size);let p=0;for(const a of arrays){out.set(a,p);p+=a.length;}return out;}
function writeZIP(entries){if(!Array.isArray(entries)||!entries.length||entries.length>LIMITS.members)fail("Archive member count is outside supported bounds.");const seen=new Set(),local=[],central=[];let offset=0,centralSize=0;for(const entry of entries){const name=path(entry.path);admitArchivePath(seen,name);const nameBytes=utf8(name),b=bytes(entry.bytes),crc=crc32(b);const h=new Uint8Array(30+nameBytes.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(8,0,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,b.length,true);v.setUint32(22,b.length,true);v.setUint16(26,nameBytes.length,true);h.set(nameBytes,30);local.push(h,b);const c=new Uint8Array(46+nameBytes.length),d=new DataView(c.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,0x0314,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,b.length,true);d.setUint32(24,b.length,true);d.setUint16(28,nameBytes.length,true);d.setUint32(38,0x81a40000,true);d.setUint32(42,offset,true);c.set(nameBytes,46);central.push(c);centralSize+=c.length;offset+=h.length+b.length;if(offset+centralSize+22>LIMITS.archiveBytes)fail("Complete archive exceeds 128 MiB.");}const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);return concat([...local,...central,end]);}

function measureZIP(entries){if(!Array.isArray(entries)||!entries.length||entries.length>LIMITS.members)fail("Archive member count is outside supported bounds.");const seen=new Set();let size=22;for(const entry of entries){const name=path(entry.path);admitArchivePath(seen,name);size+=76+2*utf8(name).length+bytes(entry.bytes).length;if(size>LIMITS.archiveBytes)fail("Complete archive exceeds 128 MiB.","PRIVACYBENCH_IO_LIMIT");}return size;}

function canonical(v){if(v===null||typeof v!=="object")return JSON.stringify(v);if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";}
function safeOriginalPath(id,name){const suffix=String(name||"").match(/\.([A-Za-z0-9]{1,12})$/)?.[1]||"bin";return "originals/"+hash(utf8(String(id))).slice(0,24)+"."+suffix.toLowerCase();}
return Object.freeze({LIMITS,utf8,decode,hash,toBase64,fromBase64,crc32,writeZIP,measureZIP,canonical,safeOriginalPath});
}

return {createPrivacyBenchIO};
})();
const reportModule=(()=>{

function createPrivacyBenchReports({api,codec,io}){
const e=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),json=x=>JSON.stringify(x,null,2)+"\n";
const table=(head,rows)=>'<div class="scroll"><table><thead><tr>'+head.map(x=>"<th>"+e(x)+"</th>").join("")+"</tr></thead><tbody>"+rows.map(r=>"<tr>"+r.map(x=>"<td>"+e(x)+"</td>").join("")+"</tr>").join("")+"</tbody></table></div>";
const metricColumns=["dimension","group","label","measure","value","unit","denominator_name","denominator_value","original_gold","original_detected","judge_skipped","source_pointer","undefined_reason"];
function metricTable(rows){return table(metricColumns,rows.map(r=>metricColumns.map(k=>r[k])));}
function side(r){return r?[r.value===""?"Unavailable":r.value,r.unit,r.denominator_name+": "+r.denominator_value,"Gold: "+r.original_gold+"; detected: "+r.original_detected,"Judge skipped: "+r.judge_skipped,r.undefined_reason].filter(x=>x!==undefined&&x!=="").join("\n"):"Absent";}
function caveats(p){return (p.caveats||[]).map(x=>"<p>"+e(typeof x==="string"?x:JSON.stringify(x))+"</p>").join("");}
function compareTable(rows){return table(["Dimension","Group","Label","Measure","Earlier exact value / denominator","Later exact value / denominator","Exact delta","Change","Comparable","Reason"],rows.map(r=>[r.dimension,r.group,r.label,r.measure,side(r.left),side(r.right),r.delta??"",r.change,r.comparable?"Yes":"No",r.reason]));}
async function data(w){const editions=[],comparisons=[];for(const x of w.editions)editions.push(await api.report(w,{subject:"edition",id:x.id}));for(const x of w.comparisons)comparisons.push(await api.report(w,{subject:"comparison",id:x.id}));return{schema:"tjlabs.privacybench-full-report.v1",workspace:{id:w.id,label:w.label,revision:w.revision},sources:w.sources.map(({id,body})=>({id,...Object.fromEntries(Object.entries(body).filter(([k])=>k!=="contentBase64"))})),editions,comparisons,reviews:w.reviews,operations:w.operations};}
async function html(w){const d=await data(w),ed=[];for(const r of w.editions){const p=await api.inspectEdition(w,r.id);ed.push('<section><h2>'+e(r.body.input?.label||r.id)+'</h2><p>Edition '+e(r.id)+'</p>'+metricTable(p.table.rows)+'<details><summary>Original protocol, candidate and run context</summary><pre>'+e(json(p.selection?.body?.input??p.selection))+'</pre></details><details><summary>Original intake review</summary><pre>'+e(json(p.table.review))+'</pre></details></section>');}
const comps=[];for(const r of w.comparisons){const p=await api.report(w,{subject:"comparison",id:r.id});comps.push('<section><h2>'+e(r.body.input?.label||r.id)+'</h2><pre>'+e(json(r.body))+'</pre>'+caveats(p.data||{})+compareTable(p.data?.rows||[])+'<details><summary>Complete comparison, unmatched rows and named review</summary><pre>'+e(json(p))+'</pre></details></section>');}
return'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\';style-src \'unsafe-inline\';base-uri \'none\'"><title>'+e(w.label)+' — PrivacyBench review</title><style>body{font:15px/1.5 system-ui;max-width:1500px;margin:24px auto;padding:0 16px;color:#171717}h1,h2{line-height:1.2}table{border-collapse:collapse;width:100%}th,td{padding:8px;border:1px solid #bbb;vertical-align:top;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere}.scroll{overflow:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}section{border-top:1px solid #aaa;padding:20px 0}</style><h1>'+e(w.label)+'</h1><p>Workspace '+e(w.id)+' · revision '+w.revision+'</p><p>All values and denominators below retain the exact original producer values. Detection is detected/gold; synthesis is coherent/detected; combined is coherent/gold. An unavailable judge result remains unavailable. Overlapping owner and file-kind groups are not added together.</p>'+table(["Original","Role","Bytes","SHA-256"],w.sources.map(x=>[x.body.name,x.body.role,x.body.bytes,x.body.sha256]))+ed.join("")+comps.join("")+'<section><h2>Named reviews and retained history</h2><pre>'+e(json({reviews:w.reviews,operations:w.operations}))+'</pre></section></html>\n';}
async function csv(w){const parts=[];for(const r of w.editions){const report=await api.report(w,{subject:"edition",id:r.id});parts.push({subject:"edition",id:r.id,csv:api.csv(report)});}for(const r of w.comparisons){const report=await api.report(w,{subject:"comparison",id:r.id});parts.push({subject:"comparison",id:r.id,csv:api.csv(report)});}return parts;}
async function files(w){const out=[{path:"reports/PrivacyBench_Review.json",content:json(await data(w))},{path:"reports/PrivacyBench_Review.html",content:await html(w)}];for(const x of await csv(w))out.push({path:"reports/"+x.subject+"-"+codec.sha256Bytes(codec.utf8Encode(x.id)).slice(0,24)+".csv",content:x.csv});return out.map(x=>({...x,bytes:codec.utf8Encode(x.content)}));}
return{data,html,csv,files,metricTable,compareTable,caveats};
}

return {createPrivacyBenchReports};
})();
const deliveryModule=(()=>{

function renderStandalone(delivery,working){
const get=path=>{const f=delivery.files.find(x=>x.path===path);if(!f)throw Error("Complete source is missing "+path);return f.content;},safe=x=>JSON.stringify(x).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
return get("web/index.html").replace("<!--STYLE-->",()=>"<style>"+get("web/app.css")+"</style>").replace("<!--DELIVERY_DATA-->",()=>'<script id="delivery-data" type="application/json">'+safe(delivery)+'</script><script id="working-data" type="application/json">'+safe(working)+"</script>").replace("<!--SCRIPTS-->",()=>"<script>"+get("web/standalone-bootstrap.js").replace(/<\/script/gi,"<\\/script")+"</script>");
}
function createInitialWorking(delivery){const f=delivery.files.find(x=>x.path==="examples/authored-working.json");if(!f)throw Error("Complete authored reference is missing.");return{schema:"tjlabs.privacybench-editable.v1",working:JSON.parse(f.content),draft:null,page:"Overview"};}

return {renderStandalone,createInitialWorking};
})();
const controllerModule=(()=>{

async function createPrivacyBenchController({api,codec,io,delivery,initialWorking,renderHTML,reports,deliveryLimits={}}){
const pages=["Overview","Originals","Selection","Editions","Comparisons","Reviews","Research","History","Handover"],copy=x=>JSON.parse(JSON.stringify(x)),now=()=>new Date().toISOString(),uid=p=>p+"-"+crypto.randomUUID(),hash=x=>codec.sha256Bytes(codec.utf8Encode(io.canonical(x))),limit=deliveryLimits.archiveBytes??io.LIMITS.archiveBytes;
if(!Number.isSafeInteger(limit)||limit<1||limit>io.LIMITS.archiveBytes)throw Error("Invalid complete handover capacity.");
let workspace,draft,page="Overview",previews={};
function freshDraft(){return{actor:"",newLabel:"",sourceRole:"results",selectedSourceId:"",selectedEditionId:"",selectedComparisonId:"",comparisonView:"paired",query:"",dimension:"",offset:0,pendingImport:null,selection:{label:"",resultId:"",dataset:{id:"",revision:""},cohortRef:"",originalBindings:[],protocolText:"",candidateText:"",runText:"",parentId:""},edition:{label:"",selectionId:"",parentId:""},comparison:{label:"",leftId:"",rightId:"",basis:{dataset:"unknown",cohort:"unknown",protocol:"unknown",judge:"unknown",rationale:""},note:""},review:{subject:"edition",subjectId:"",target:"all",status:"open",owner:"",note:""},adoption:{returnSourceId:"",note:""},retainedDrafts:[]};}
const str=(x,label,max=1000000)=>{if(typeof x!=="string"||x.length>max)throw Error("Invalid unfinished "+label);};
function validateDraft(raw){if(raw==null)return freshDraft();if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Incomplete unfinished form.");const d=copy(raw),base=freshDraft();for(const k of Object.keys(base))if(!Object.hasOwn(d,k))d[k]=base[k];for(const k of["actor","newLabel","sourceRole","selectedSourceId","selectedEditionId","selectedComparisonId","comparisonView","query","dimension"])str(d[k],k);if(!["results","summary","viewer","configuration","notes","support","prior_review"].includes(d.sourceRole))throw Error("Unknown original role.");if(!["paired","left_only","right_only"].includes(d.comparisonView))throw Error("Invalid comparison view.");if(!Number.isSafeInteger(d.offset)||d.offset<0)throw Error("Invalid unfinished row position.");
for(const [kind,keys]of Object.entries({selection:["label","resultId","cohortRef","protocolText","candidateText","runText","parentId"],edition:["label","selectionId","parentId"],comparison:["label","leftId","rightId","note"],review:["subject","subjectId","target","status","owner","note"],adoption:["returnSourceId","note"]})){if(!d[kind]||typeof d[kind]!=="object"||Array.isArray(d[kind]))throw Error("Missing "+kind+" form.");for(const k of keys)str(d[kind][k],kind+"."+k);}
if(!d.selection.dataset||typeof d.selection.dataset!=="object")throw Error("Missing dataset selection.");str(d.selection.dataset.id,"dataset id");str(d.selection.dataset.revision,"dataset revision");if(!Array.isArray(d.selection.originalBindings))throw Error("Missing complete original bindings.");for(const x of d.selection.originalBindings)for(const k of["sourceId","id","path","role","mediaType"])str(x[k],"original binding "+k);
if(!d.comparison.basis||typeof d.comparison.basis!=="object")throw Error("Missing comparison basis.");for(const k of["dataset","cohort","protocol","judge"])if(!["same","changed","unknown"].includes(d.comparison.basis[k]))throw Error("Invalid comparison basis.");str(d.comparison.basis.rationale,"basis rationale");
if(!["edition","comparison"].includes(d.review.subject)||!["open","accept","investigate","defer"].includes(d.review.status))throw Error("Invalid review selection.");
if(d.pendingImport!==null){for(const k of["name","role","mediaType","contentBase64"])str(d.pendingImport[k],"pending original "+k,200000000);io.fromBase64(d.pendingImport.contentBase64);}
if(!Array.isArray(d.retainedDrafts))throw Error("Incomplete draft history.");for(const x of d.retainedDrafts)if(!x||typeof x.kind!=="string"||!["selection","edition","comparison","review","adoption"].includes(x.kind)||typeof x.id!=="string"||!x.value||typeof x.value!=="object")throw Error("Invalid retained unfinished form.");return d;}
async function envelope(w=workspace,d=draft,p=page){return{schema:"tjlabs.privacybench-editable.v1",working:await api.exportWorkspace(w),draft:copy(d),page:p};}
async function read(value){if(value?.schema==="tjlabs.privacybench-working.v1")value={schema:"tjlabs.privacybench-editable.v1",working:value,draft:null,page:"Overview"};if(value?.schema!=="tjlabs.privacybench-editable.v1")throw Error("Choose a complete PrivacyBench working JSON.");const w=await api.importWorkspace(value.working),d=validateDraft(value.draft),ref=(kind,id)=>{if(id&&!w[kind].some(x=>x.id===id))throw Error("Unfinished selection references an absent "+kind+" record.");};ref("sources",d.selectedSourceId);ref("sources",d.selection.resultId);ref("sources",d.adoption.returnSourceId);for(const x of d.selection.originalBindings)ref("sources",x.sourceId);ref("selections",d.selection.parentId);ref("selections",d.edition.selectionId);for(const id of[d.selectedEditionId,d.edition.parentId,d.comparison.leftId,d.comparison.rightId])ref("editions",id);ref("comparisons",d.selectedComparisonId);ref(d.review.subject==="edition"?"editions":"comparisons",d.review.subjectId);return{workspace:w,draft:d,page:pages.includes(value.page)?value.page:"Overview"};}
const applicationEntries=delivery.files.map(f=>{const b=codec.utf8Encode(f.content);if(b.length!==f.bytes||codec.sha256Bytes(b)!==f.sha256)throw Error("Complete application source changed: "+f.path);return{path:"application/"+f.path,bytes:b,sha256:f.sha256};});
let preparedCache=null;
async function preparedEntries(w){const fingerprint=api.digest(w);if(preparedCache?.fingerprint===fingerprint)return preparedCache.entries;await api.validateWorkspace(w);const entries=(await reports.files(w)).map(x=>({path:x.path,bytes:x.bytes}));for(const s of w.sources){const b=io.fromBase64(s.body.contentBase64);if(b.length!==s.body.bytes||codec.sha256Bytes(b)!==s.body.sha256)throw Error("Original file changed.");entries.push({path:io.safeOriginalPath(s.id,s.body.name),bytes:b,sha256:s.body.sha256});}
for(const ed of w.editions){const r=await api.prepareResearch(w,{editionId:ed.id}),prefix="research/"+codec.sha256Bytes(codec.utf8Encode(ed.id)).slice(0,24)+"/";for(const file of r.files){const b=codec.utf8Encode(file.content);if(b.length!==file.bytes||codec.sha256Bytes(b)!==file.sha256)throw Error("Prepared Research original changed.");entries.push({path:prefix+file.path,bytes:b,sha256:file.sha256});}}
preparedCache={fingerprint,entries};return entries;}
async function handoverEntries(w=workspace,d=draft,p=page,identities=true){const value=await envelope(w,d,p),entries=[...await preparedEntries(w),{path:"working/PrivacyBench_Working_Copy.json",bytes:codec.utf8Encode(JSON.stringify(value,null,2)+"\n")},{path:"working/Open_PrivacyBench_Review.html",bytes:codec.utf8Encode(renderHTML(delivery,value))},...applicationEntries];
const manifest={schema:"tjlabs.privacybench-handover-manifest.v1",workspaceId:w.id,revision:w.revision,files:entries.map(x=>({path:x.path,bytes:x.bytes.length,sha256:x.sha256||(identities?codec.sha256Bytes(x.bytes):"0".repeat(64))}))};entries.push({path:"HANDOVER-MANIFEST.json",bytes:codec.utf8Encode(JSON.stringify(manifest,null,2)+"\n")});return entries;}
async function requireCapacity(w=workspace,d=draft,p=page){const entries=await handoverEntries(w,d,p,false);let size;try{size=io.measureZIP(entries);}catch(error){throw Object.assign(Error("The complete handover exceeds its portable file/path or 128 MiB capacity. "+error.message+" The previous workspace and unfinished forms remain retained."),{code:"DELIVERY_CAPACITY"});}if(size>limit)throw Object.assign(Error("The complete handover needs "+size+" bytes. Capacity is "+limit+" bytes. The previous workspace and unfinished forms remain retained. Export this workspace before starting another cohort."),{code:"DELIVERY_CAPACITY"});return{entries,bytes:size};}
function named(){if(!draft.actor.trim())throw Error("Enter a named operator in Overview.");return{actor:draft.actor,at:now()};}
async function activate(value){const next=await read(value);await requireCapacity(next.workspace,next.draft,next.page);workspace=next.workspace;draft=next.draft;page=next.page;previews={};return snapshot();}
function snapshot(){return{workspace,draft:copy(draft),page};}
function edit(mutator){const next=copy(draft);mutator(next);draft=validateDraft(next);previews={};return snapshot();}
function retain(kind){draft.retainedDrafts.push({id:uid("draft"),at:now(),kind,value:copy(draft[kind])});}
function restore(id){const r=draft.retainedDrafts.find(x=>x.id===id);if(!r)throw Error("Unfinished form is absent.");const old=copy(draft[r.kind]);draft[r.kind]=copy(r.value);draft.retainedDrafts.push({id:uid("draft"),at:now(),kind:r.kind,value:old});draft=validateDraft(draft);previews={};page={selection:"Selection",edition:"Editions",comparison:"Comparisons",review:"Reviews",adoption:"Reviews"}[r.kind];}
function jsonField(text,label){if(!text.trim())throw Error("Enter the complete "+label+" definition.");let v;try{v=JSON.parse(text);}catch(e){throw Error("The "+label+" definition is not valid JSON: "+e.message);}if(!v||typeof v!=="object"||Array.isArray(v))throw Error("The "+label+" definition must be an object.");return v;}
function selectionInput(){const d=draft.selection;return{label:d.label,resultId:d.resultId,originalBindings:copy(d.originalBindings),dataset:copy(d.dataset),cohortRef:d.cohortRef,protocol:jsonField(d.protocolText,"protocol"),candidate:jsonField(d.candidateText,"candidate"),run:jsonField(d.runText,"run"),reviewer:named().actor,reviewedAt:now(),parentId:d.parentId||null};}
function input(kind){if(kind==="selection")return selectionInput();if(kind==="edition")return{...copy(draft.edition),parentId:draft.edition.parentId||null};if(kind==="comparison")return{...copy(draft.comparison),reviewer:named().actor};if(kind==="adoption")return{...copy(draft.adoption),reviewer:named().actor};throw Error("Unknown preview.");}
const fingerprint=kind=>hash({workspace,actor:draft.actor,input:draft[kind]});
async function preview(kind){const fn={selection:"previewSelection",edition:"previewEdition",comparison:"previewComparison",adoption:"previewAdoption"}[kind];if(!fn)throw Error("Unknown preview.");const selected=input(kind),result=await api[fn](workspace,selected);previews[kind]={fingerprint:fingerprint(kind),input:selected,result};return result;}
async function commit(type,selected,update){const op={id:uid("op"),type,...named(),input:selected},result=await api.apply(workspace,op),nextDraft=copy(draft);if(update)update(nextDraft,result.result);await requireCapacity(result.workspace,nextDraft,page);workspace=result.workspace;draft=nextDraft;previews={};return result;}
async function acceptPreview(kind){const p=previews[kind];if(!p||p.fingerprint!==fingerprint(kind))throw Error("Preview these exact choices and named operator again.");return commit({selection:"selection.save",edition:"edition.save",comparison:"comparison.save",adoption:"review.adopt"}[kind],{...p.input,previewSha256:p.result.sha256},(d,r)=>{if(kind==="selection")d.edition.selectionId=r.id;if(kind==="edition"){d.selectedEditionId=r.id;d.review={...d.review,subject:"edition",subjectId:r.id,target:"all"};}if(kind==="comparison"){d.selectedComparisonId=r.id;d.review={...d.review,subject:"comparison",subjectId:r.id,target:"all"};}});}
async function stageSource(value){const next=copy(draft);if(next.pendingImport)throw Error("Finish or remove the prior retained intake.");next.pendingImport=copy(value);validateDraft(next);await requireCapacity(workspace,next,page);draft=next;return snapshot();}
async function admitPending(){const p=draft.pendingImport;if(!p)throw Error("No original file is staged.");return commit("source.add",p,(d,r)=>{d.selectedSourceId=r.id;if(p.role==="results"&&!d.selection.resultId)d.selection.resultId=r.id;if(p.role==="prior_review")d.adoption.returnSourceId=r.id;d.pendingImport=null;});}
async function saveReview(){const d=draft.review;if(!d.subjectId)throw Error("Select an exact edition or comparison.");const latest=api.latestReview(workspace,{subject:d.subject,subjectId:d.subjectId,target:d.target});return commit("review.save",{...copy(d),reviewer:named().actor,parentId:latest?.id||null});}
function copySelection(id){const r=workspace.selections.find(x=>x.id===id);if(!r)throw Error("Selection is absent.");retain("selection");const b=r.body.input;draft.selection={label:b.label+" — successor",resultId:b.resultId,originalBindings:copy(b.originalBindings),dataset:copy(b.dataset),cohortRef:b.cohortRef,protocolText:JSON.stringify(b.protocol,null,2),candidateText:JSON.stringify(b.candidate,null,2),runText:JSON.stringify(b.run,null,2),parentId:r.id};previews={};page="Selection";}
function adoptTemplate(){retain("selection");const s=api.selectionTemplate();draft.selection.protocolText=JSON.stringify(s.protocol,null,2);draft.selection.candidateText=JSON.stringify(s.candidate,null,2);draft.selection.runText=JSON.stringify(s.run,null,2);previews={};return s;}
async function newWorkspace(label){if(!label.trim())throw Error("Enter the new workspace title.");const w=api.create({id:uid("workspace"),label,createdAt:now()}),d=freshDraft();d.actor=draft?.actor||"";return activate(await envelope(w,d,"Originals"));}
async function exported(kind,id){if(kind==="working")return{name:"PrivacyBench_Working_Copy.json",mime:"application/json",content:JSON.stringify(await envelope(),null,2)+"\n"};if(kind==="html")return{name:"Open_PrivacyBench_Review.html",mime:"text/html",content:renderHTML(delivery,await envelope())};if(kind==="source")return{name:"PrivacyBench_Complete_Application_Source.json",mime:"application/json",content:JSON.stringify(delivery)};
if(kind==="report")return{name:"PrivacyBench_Review.html",mime:"text/html",content:await reports.html(workspace)};if(kind==="report-json")return{name:"PrivacyBench_Review.json",mime:"application/json",content:JSON.stringify(await reports.data(workspace),null,2)+"\n"};if(kind==="zip"){await requireCapacity();return{name:"PrivacyBench_Complete_Handover.zip",mime:"application/zip",bytes:io.writeZIP(await handoverEntries())};}
if(kind==="original"){const x=workspace.sources.find(x=>x.id===id);if(!x)throw Error("Original is absent.");return{name:x.body.name,mime:x.body.mediaType,bytes:io.fromBase64(x.body.contentBase64)};}
if(kind==="guide"){const f=delivery.files.find(x=>x.path==="WORKBENCH_GUIDE.md");if(!f)throw Error("Guide is absent.");return{name:"WORKBENCH_GUIDE.md",mime:"text/markdown",content:f.content};}
if(kind==="edition-csv"){const report=await api.report(workspace,{subject:"edition",id});return{name:"PrivacyBench_Metrics_"+codec.sha256Bytes(codec.utf8Encode(id)).slice(0,12)+".csv",mime:"text/csv",content:api.csv(report)};}
if(kind==="comparison-csv"){const report=await api.report(workspace,{subject:"comparison",id});return{name:"PrivacyBench_Comparison_"+codec.sha256Bytes(codec.utf8Encode(id)).slice(0,12)+".csv",mime:"text/csv",content:api.csv(report)};}
if(kind==="review-return"){const d=draft.review,p=await api.exportReviewReturn(workspace,{subject:d.subject,subjectId:d.subjectId});return{name:"PrivacyBench_Reviewer_Return.json",mime:"application/json",content:JSON.stringify(p,null,2)+"\n"};}
if(kind==="research"){const p=await api.prepareResearch(workspace,{editionId:id}),entries=p.files.map(f=>({path:f.path,bytes:codec.utf8Encode(f.content)}));return{name:"PrivacyBench_Research_"+codec.sha256Bytes(codec.utf8Encode(id)).slice(0,12)+".zip",mime:"application/zip",bytes:io.writeZIP(entries)};}
throw Error("Unknown export.");}
await activate(initialWorking);
return{pages,snapshot,envelope,read,activate,edit,retain,restore,preview,acceptPreview,stageSource,admitPending,saveReview,copySelection,adoptTemplate,newWorkspace,exported,requireCapacity,handoverEntries,getPreview:k=>previews[k]?.result,setPage:p=>{if(!pages.includes(p))throw Error("Unknown page.");page=p;},inspectEdition:id=>api.inspectEdition(workspace,id),report:(subject,id)=>api.report(workspace,{subject,id}),prepareResearch:id=>api.prepareResearch(workspace,{editionId:id}),latestReview:x=>api.latestReview(workspace,x)};
}

return {createPrivacyBenchController};
})();
const appModule=(()=>{
const {createPrivacyBenchController}=controllerModule;
async function startPrivacyBenchApp({api,codec,io,delivery,initialWorking,reports,renderHTML,deliveryLimits={}}){
const root=document.getElementById("app"),copy=x=>JSON.parse(JSON.stringify(x)),now=()=>new Date().toISOString(),uid=p=>p+"-"+crypto.randomUUID(),hash=x=>codec.sha256Bytes(codec.utf8Encode(io.canonical(x))),e=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let model,branchId=uid("branch"),expectedFingerprint=null,records=[],volatile=new Map(),dirty=false,pendingSaves=0,timer=null,queue=Promise.resolve(),busy=false,notice="",storageError="",view={},generation=0;
const state=()=>model.snapshot(),button=(action,label,attrs="")=>'<button type="button" data-action="'+action+'" '+attrs+'>'+e(label)+"</button>",input=(label,attrs,value,type="text")=>'<label>'+e(label)+'<input type="'+type+'" '+attrs+' value="'+e(value)+'"></label>',textarea=(label,attrs,value,rows=4)=>'<label>'+e(label)+'<textarea '+attrs+' rows="'+rows+'">'+e(value)+"</textarea></label>",details=(label,value)=>'<details><summary>'+e(label)+'</summary><pre>'+e(typeof value==="string"?value:JSON.stringify(value,null,2))+"</pre></details>";
const table=(heads,rows)=>'<div class="scroll"><table><thead><tr>'+heads.map(x=>"<th>"+e(x)+"</th>").join("")+"</tr></thead><tbody>"+rows.map(r=>"<tr>"+r.map(x=>"<td>"+e(x)+"</td>").join("")+"</tr>").join("")+"</tbody></table></div>";
function select(label,attrs,values,value,empty="Choose…"){return'<label>'+e(label)+'<select '+attrs+'>'+(empty===null?"":'<option value="">'+e(empty)+"</option>")+values.map(x=>{const[id,name]=Array.isArray(x)?x:[x,x];return'<option value="'+e(id)+'"'+(id===value?" selected":"")+">"+e(name)+"</option>";}).join("")+"</select></label>";}
const options=kind=>state().workspace[kind].map(x=>[x.id,(x.body.input?.label||x.body.label||x.body.name||x.id)+" · "+x.id]),sourceOptions=roles=>state().workspace.sources.filter(x=>!roles||roles.includes(x.body.role)).map(x=>[x.id,x.body.name+" · "+x.body.role+" · "+x.id]),field=(group,key)=>'data-field="'+group+"."+key+'"';
function updateNotice(){const el=document.getElementById("notice");if(el)el.innerHTML=(storageError?'<strong>Browser copy is not saved.</strong> '+e(storageError)+' Save working JSON before closing. ':"")+e(notice)+(pendingSaves?" Saving working draft…":dirty?" Unsaved changes remain in this window.":"");}
function mark(){dirty=true;clearTimeout(timer);timer=setTimeout(()=>{timer=null;save().catch(()=>{});},350);updateNotice();}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open("tjlabs-privacybench-workspace-v1",1);r.onupgradeneeded=()=>r.result.createObjectStore("branches",{keyPath:"branchId"});r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result);});}
async function dbPut(record,expected){const db=await openDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction("branches","readwrite"),s=tx.objectStore("branches"),r=s.get(record.branchId);let conflict=false;r.onsuccess=()=>{if(r.result&&r.result.fingerprint!==expected){conflict=true;tx.abort();return;}s.put(record);};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(Object.assign(tx.error||Error("Another window advanced this branch."),{branchConflict:conflict}));});}finally{db.close();}}
async function refreshBranches(){try{const db=await openDB();try{records=await new Promise((resolve,reject)=>{const r=db.transaction("branches","readonly").objectStore("branches").getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}}catch{}}
function save(){if(!model)return Promise.resolve();const capture={branch:branchId,...state(),expected:expectedFingerprint};pendingSaves++;updateNotice();const task=queue.catch(()=>{}).then(async()=>{const value=await model.envelope(capture.workspace,capture.draft,capture.page),fingerprint=hash(value);volatile.set(capture.branch,value);let target=capture.branch,expected=target===branchId?expectedFingerprint:capture.expected,record={branchId:target,workspaceId:capture.workspace.id,label:capture.workspace.label,revision:capture.workspace.revision,savedAt:now(),fingerprint,working:value};try{await dbPut(record,expected);}catch(error){if(!error.branchConflict)throw error;target=uid("branch");record={...record,branchId:target};await dbPut(record,null);volatile.set(target,value);if(capture.branch===branchId){branchId=target;notice="Another copy advanced; both copies remain in separate branches.";}}if(capture.branch===branchId||target===branchId){expectedFingerprint=fingerprint;const s=state();if(s.workspace===capture.workspace&&hash(s.draft)===hash(capture.draft)&&s.page===capture.page){dirty=false;storageError="";}}await refreshBranches();return value;}).catch(error=>{storageError=error.message||"Local browser storage is unavailable.";dirty=true;throw error;}).finally(()=>{pendingSaves--;updateNotice();});queue=task;return task;}
async function flush(){clearTimeout(timer);timer=null;await queue.catch(()=>{});if(dirty)await save().catch(()=>{});return !storageError;}
async function activate(value,label){await flush();if(model)volatile.set(branchId,await model.envelope());await model.activate(value);branchId=uid("branch");expectedFingerprint=null;view={};generation++;dirty=true;notice=label;await save().catch(()=>{});}
function download(name,value,mime){const bytes=typeof value==="string"?codec.utf8Encode(value):value,url=URL.createObjectURL(new Blob([bytes],{type:mime||"application/octet-stream"})),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function downloadExport(kind,id){await flush();const r=await model.exported(kind,id);download(r.name,r.bytes||r.content,r.mime);}
function filteredRows(rows){const d=state().draft,q=d.query.toLocaleLowerCase();return rows.filter(r=>(!d.dimension||r.dimension===d.dimension)&&(!q||JSON.stringify(r).toLocaleLowerCase().includes(q)));}
function pageRows(rows){const d=state().draft,start=Math.min(d.offset,Math.max(0,Math.floor((rows.length-1)/50)*50));return{start,rows:rows.slice(start,start+50),total:rows.length};}
function paging(total,start){return'<div class="pagination">'+button("previous","Previous",' '+(start===0?"disabled":""))+'<span>'+e(total?start+1:0)+"–"+Math.min(start+50,total)+" of "+total+'</span>'+button("next","Next",start+50>=total?"disabled":"")+"</div>";}
function metricRows(rows,editionId){const p=pageRows(filteredRows(rows));return'<div class="grid">'+input("Find original metric / label / source pointer",'data-draft="query"',state().draft.query)+select("Metric group",'data-draft="dimension"',["overall","by_label","by_kind","per_character","per_org_group"],state().draft.dimension,"All groups")+'</div>'+paging(p.total,p.start)+'<div class="scroll"><table><thead><tr>'+["Group / owner","Label / measure","Exact value","Denominator","Judge / availability","Original pointer","Review"].map(x=>"<th>"+e(x)+"</th>").join("")+"</tr></thead><tbody>"+p.rows.map(r=>'<tr><td>'+e(r.dimension+"\n"+r.group)+'</td><td>'+e(r.label+"\n"+r.measure)+'</td><td>'+e(r.value===""?"Unavailable":r.value)+'<br>'+e(r.unit)+'</td><td>'+e(r.denominator_name+": "+r.denominator_value+"\ngold "+r.original_gold+" / detected "+r.original_detected)+'</td><td>'+e(r.judge_skipped==="true"?"Skipped":r.undefined_reason||"Producer result")+'</td><td>'+e(r.source_pointer)+'</td><td>'+button("review-metric","Review",'data-id="'+e(r.source_pointer)+'" data-edition="'+e(editionId)+'"')+"</td></tr>").join("")+"</tbody></table></div>"+paging(p.total,p.start);}
function comparisonRows(rows,id){const p=pageRows(filteredRows(rows));return'<div class="grid">'+input("Find comparison row",'data-draft="query"',state().draft.query)+select("Metric group",'data-draft="dimension"',["overall","by_label","by_kind","per_character","per_org_group"],state().draft.dimension,"All groups")+'</div>'+paging(p.total,p.start)+'<div class="scroll"><table><thead><tr>'+["Group / label / measure","Earlier exact value","Later exact value","Change","Comparable","Review"].map(x=>"<th>"+e(x)+"</th>").join("")+"</tr></thead><tbody>"+p.rows.map(r=>'<tr><td>'+e([r.dimension,r.group,r.label,r.measure].join("\n"))+'</td><td>'+e(r.left?.value===""?"Unavailable":r.left?.value)+'<br>'+e((r.left?.denominator_name||"")+": "+(r.left?.denominator_value||"")+"\n"+(r.left?.undefined_reason||"")+"\nJudge skipped: "+(r.left?.judge_skipped??""))+'</td><td>'+e(r.right?.value===""?"Unavailable":r.right?.value)+'<br>'+e((r.right?.denominator_name||"")+": "+(r.right?.denominator_value||"")+"\n"+(r.right?.undefined_reason||"")+"\nJudge skipped: "+(r.right?.judge_skipped??""))+'</td><td>'+e(r.change+"\n"+(r.delta??""))+'</td><td>'+e((r.comparable?"Yes":"No")+"\n"+r.reason)+'</td><td>'+button("review-comparison-row","Review",'data-id="'+e(r.id)+'" data-comparison="'+e(id)+'"')+"</td></tr>").join("")+"</tbody></table></div>"+paging(p.total,p.start);}
function shell(content){const s=state();return'<header><div><h1>PrivacyBench Review Workspace</h1><p>'+e(s.workspace.label)+' · revision '+s.workspace.revision+' · '+s.workspace.editions.length+' immutable editions</p></div><div class="actions">'+button("download-working","Save working JSON")+button("download-html","Save editable HTML")+'</div></header><div id="notice" role="status" aria-live="polite"></div><div class="layout"><nav aria-label="Workflow">'+model.pages.map(p=>'<button type="button" data-page="'+p+'" aria-current="'+(s.page===p?"page":"false")+'">'+e(p)+"</button>").join("")+'</nav><main><h2>'+e(s.page)+'</h2>'+content+'</main></div><footer>Complete original files, exact producer metrics, explicit selection and named review travel together.</footer>';}
function overview(){const s=state(),d=s.draft,w=s.workspace;return'<section><p>Receive an original PrivacyBench native result and supporting files, select its exact protocol and candidate, compare immutable editions, and return reviewed work with a complete editable Research handover.</p><div class="grid">'+input("Named operator",'data-draft="actor"',d.actor)+input("New workspace title",'data-draft="newLabel"',d.newLabel)+'</div><div class="actions">'+button("new","New workspace")+button("example","Open authored example")+'<label class="file-button">Open working JSON<input id="open-working" type="file" accept=".json,application/json"></label></div><p>The authored example exercises the software. Choose New workspace for your own evaluation and enter its actual dataset, protocol, candidate and run definitions.</p></section><section>'+table(["Original files","Selections","Editions","Comparisons","Named reviews","Adopted returns"],[[w.sources.length,w.selections.length,w.editions.length,w.comparisons.length,w.reviews.length,w.adoptions?.length||0]])+'</section><section><h3>Saved browser copies</h3>'+records.map(r=>'<div class="item">'+e(r.label+" · revision "+r.revision+" · "+r.savedAt)+button("open-branch","Open separate copy",'data-id="'+e(r.branchId)+'"')+'</div>').join("")+[...volatile].filter(([id,v])=>!records.some(r=>r.branchId===id&&r.fingerprint===hash(v))).map(([id,v])=>'<div class="item">Retained in this window '+button("open-volatile","Open retained copy",'data-id="'+e(id)+'"')+'</div>').join("")+'<p>Opening a saved or imported copy creates a separate branch. Working JSON and editable HTML retain unfinished forms, every original, all editions and named review history.</p></section>';}
function originals(){const s=state(),d=s.draft,current=s.workspace.sources.find(x=>x.id===d.selectedSourceId),p=d.pendingImport;let preview="";if(current){const b=io.fromBase64(current.body.contentBase64);let value;try{const t=codec.utf8Decode(b);value=codec.toBase64(codec.utf8Encode(t))===current.body.contentBase64?t.slice(0,50000):null;}catch{}preview='<section><h3>'+e(current.body.name)+'</h3>'+details("Original identity",Object.fromEntries(Object.entries(current.body).filter(([k])=>k!=="contentBase64")))+(value===null?"<p>Binary original retained byte for byte.</p>":details("Original text — first 50,000 characters",value))+'<div class="actions">'+button("download-original","Download complete original",'data-id="'+e(current.id)+'"')+'</div><p>Uploaded viewer HTML is retained as source text; the workspace never executes it.</p></section>';}return'<section><div class="grid">'+select("Original file role",'data-draft="sourceRole"',["results","summary","viewer","configuration","notes","support","prior_review"],d.sourceRole,null)+'<label class="file-button">Choose the complete original<input id="source-file" type="file"></label></div><p>Results accept the documented native results.json format. Supporting files retain their exact bytes. Use prior_review for a reviewer-return JSON.</p>'+(p?'<div class="item"><strong>Retained unfinished intake: '+e(p.name)+'</strong><div class="actions">'+button("retry-intake","Admit this original")+button("download-pending","Download staged original")+button("discard-pending","Remove unfinished intake")+"</div></div>":"")+'</section><section>'+select("Inspect an original",'data-draft="selectedSourceId"',sourceOptions(),d.selectedSourceId)+table(["Name","Role","Bytes","SHA-256"],s.workspace.sources.map(x=>[x.body.name,x.body.role,x.body.bytes,x.body.sha256]))+'</section>'+preview;}
const definitionFields={
protocolText:[["questionId","Protocol question ID"],["title","Protocol title"],["purpose","Evaluation purpose"],["scope","Protocol scope"]],
candidateText:[["name","Candidate name"],["kind","Candidate kind",["MODEL","PLATFORM","ARCHITECTURE"]],["version","Candidate version"],["description","Candidate description"]],
runText:[["externalRunId","External run ID"],["kind","Run kind",["IMPORTED_MEASUREMENT","TRAINING_FIXTURE"]],["status","Original run status",["SUCCEEDED","FAILED","CANCELLED"]],["startedAt","Original startedAt — exact ISO UTC"],["finishedAt","Original finishedAt — exact ISO UTC"],["elapsedMs","Original elapsed milliseconds (blank when unavailable)","number"],["engine.name","Engine name"],["engine.version","Engine version"],["input.cohortId","Run cohort ID"],["input.protocolId","Run protocol ID"]]
};
function getPath(v,path){for(const k of path.split(".")){if(!v||typeof v!=="object")return undefined;v=v[k];}return v;}
function typedDefinition(group,title){const raw=state().draft.selection[group];let value;try{value=JSON.parse(raw);}catch{}if(!value||typeof value!=="object"||Array.isArray(value))return'<h4>'+e(title)+'</h4><p class="muted">Start blank own-result definitions, copy an earlier saved selection, or enter valid complete '+e(title)+' JSON below. Existing unfinished JSON is retained exactly.</p>';return'<h4>'+e(title)+'</h4><div class="grid">'+definitionFields[group].map(([path,label,choices])=>{const attrs='data-json="'+group+'" data-json-path="'+path+'"',v=getPath(value,path);return Array.isArray(choices)?select(label,attrs,choices,v??""):input(label,attrs,v??"",choices==="number"?"number":"text");}).join("")+'</div>';}
function definitions(){const d=state().draft.selection;return'<section><h3>Protocol, candidate and run</h3><p>Enter the original evaluation identities and timestamps. These controls edit the complete definitions below while retaining additional configuration and source references.</p><div class="actions">'+button("blank-definitions","Start blank own-result definitions")+button("template","Copy authored example structure")+'</div>'+typedDefinition("protocolText","Protocol")+typedDefinition("candidateText","Candidate")+typedDefinition("runText","Run")+'<details><summary>Advanced complete JSON definitions and configuration</summary><p>All original fields remain editable. Invalid unfinished JSON is retained; typed controls for that definition pause until it is valid again.</p>'+textarea("Complete protocol JSON",field("selection","protocolText")+' class="definition"',d.protocolText,12)+textarea("Complete candidate JSON",field("selection","candidateText")+' class="definition"',d.candidateText,10)+textarea("Complete run JSON",field("selection","runText")+' class="definition"',d.runText,12)+'</details><p>The eight exact PrivacyBench criteria are retained in protocol.criteria. Candidate configuration, engine command/runtime/configuration, run input definition and source references remain in the complete JSON. The authored example remains TRAINING_FIXTURE until the operator deliberately enters actual imported-result metadata.</p></section>';}
function syncDefinitions(){for(const group of Object.keys(definitionFields)){let parsed;try{parsed=JSON.parse(state().draft.selection[group]);}catch{}for(const el of root.querySelectorAll('[data-json="'+group+'"]')){el.disabled=!parsed||typeof parsed!=="object"||Array.isArray(parsed);if(!el.disabled&&el!==document.activeElement)el.value=getPath(parsed,el.dataset.jsonPath)??"";}const raw=root.querySelector('[data-field="selection.'+group+'"]');if(raw&&raw!==document.activeElement)raw.value=state().draft.selection[group];}}

function selection(){const s=state(),d=s.draft.selection,p=model.getPreview("selection");return'<section><h3>Explicit original and dataset selection</h3><div class="grid">'+input("Selection label",field("selection","label"),d.label)+select("Native results.json",field("selection","resultId"),sourceOptions(["results"]),d.resultId)+input("Dataset identifier",'data-dataset="id"',d.dataset.id)+input("Exact dataset revision",'data-dataset="revision"',d.dataset.revision)+input("Cohort reference",field("selection","cohortRef"),d.cohortRef)+select("Earlier selection, if this is its successor",field("selection","parentId"),options("selections"),d.parentId,"No earlier selection")+'</div></section><section><h3>Supporting originals included with this edition</h3>'+d.originalBindings.map((x,i)=>'<div class="item"><div class="grid">'+select("Original file",'data-binding="'+i+'" data-key="sourceId"',sourceOptions(),x.sourceId)+input("Stable original ID",'data-binding="'+i+'" data-key="id"',x.id)+input("Portable handover path",'data-binding="'+i+'" data-key="path"',x.path)+input("Role / purpose",'data-binding="'+i+'" data-key="role"',x.role)+input("Media type",'data-binding="'+i+'" data-key="mediaType"',x.mediaType)+'</div>'+button("remove-binding","Remove this binding",'data-id="'+i+'"')+'</div>').join("")+'<div class="actions">'+button("add-binding","Add original binding")+'</div><p>Each binding retains the exact file already admitted in Originals. The native results file is included automatically.</p></section>'+definitions()+'<section><div class="actions">'+button("preview-selection","Preview complete selection")+button("save-selection","Save immutable selection",p?"":"disabled")+'</div><div id="selection-preview">'+(p?'<p>'+p.table.rows.length+' original metric rows. Exact preview '+e(p.sha256)+'</p>'+details("Original producer and denominator review",p.table.review)+details("Exact selected protocol, candidate and run",p.body)+details("Complete native Research preparation review",p.review):'<p>Preview validates the complete original result, exact metadata and all selected supporting bytes before saving.</p>')+'</div></section><section><h3>Retained selections</h3>'+s.workspace.selections.map(x=>'<div class="item">'+e(x.body.input?.label||x.id)+button("copy-selection","Edit a successor",'data-id="'+e(x.id)+'"')+details("Full original selection",x)+'</div>').join("")+'</section>';}
function editions(){const s=state(),d=s.draft.edition,p=model.getPreview("edition"),selected=view.edition;return'<section><div class="grid">'+input("Edition label",field("edition","label"),d.label)+select("Original saved selection",field("edition","selectionId"),options("selections"),d.selectionId)+select("Earlier edition, if this is a successor",field("edition","parentId"),options("editions"),d.parentId,"No earlier edition")+'</div><div class="actions">'+button("preview-edition","Preview edition")+button("save-edition","Save immutable edition",p?"":"disabled")+'</div>'+'<div id="edition-preview">'+(p?details("Prepared immutable edition",p.body)+"<p>"+p.table.rows.length+" exact metric rows are retained.</p>":"")+'</div></section><section>'+select("Inspect an immutable edition",'data-draft="selectedEditionId"',options("editions"),s.draft.selectedEditionId)+(selected?'<div class="actions">'+button("download-edition-csv","Download all metric rows",'data-id="'+e(s.draft.selectedEditionId)+'"')+button("review-edition","Review this edition",'data-id="'+e(s.draft.selectedEditionId)+'"')+'</div>'+metricRows(selected.table.rows,s.draft.selectedEditionId)+details("Full original intake",selected.table.review)+details("Exact edition",selected.edition)+details("Exact saved selection",selected.selection):'<p>Select an edition to inspect every metric row and denominator.</p>')+'</section>';}
function inspectComparison(p,id){const d=state().draft,x=p.data||{},which=d.comparisonView;return reports.caveats(x)+'<p>'+(x.rows||[]).length+' paired rows · '+(x.unmatchedLeft||[]).length+' earlier-only rows · '+(x.unmatchedRight||[]).length+' later-only rows.</p><div class="grid">'+select("Comparison row set",'data-draft="comparisonView"',[["paired","Paired original metrics"],["left_only","Earlier-only original metrics"],["right_only","Later-only original metrics"]],which,null)+'</div><div class="actions">'+button("download-comparison-csv","Download every comparison row",'data-id="'+e(id)+'"')+'</div>'+(which==="paired"?comparisonRows(x.rows||[],id):metricRows(which==="left_only"?x.unmatchedLeft||[]:x.unmatchedRight||[],which==="left_only"?x.left?.id:x.right?.id))+details("Complete comparison and named review",p);}

function comparisons(){const s=state(),d=s.draft.comparison,p=model.getPreview("comparison"),selected=view.comparison;return'<section><div class="grid">'+input("Comparison label",field("comparison","label"),d.label)+select("Earlier edition",field("comparison","leftId"),options("editions"),d.leftId)+select("Later edition",field("comparison","rightId"),options("editions"),d.rightId)+'</div><h3>Explicit comparison basis</h3><div class="grid">'+["dataset","cohort","protocol","judge"].map(k=>select(k[0].toUpperCase()+k.slice(1)+" basis",'data-basis="'+k+'"',["same","changed","unknown"],d.basis[k],null)).join("")+'</div>'+textarea("Why these bases are the same, changed or unknown",'data-basis="rationale"',d.basis.rationale)+textarea("Named comparison note",field("comparison","note"),d.note)+'<div class="actions">'+button("preview-comparison","Preview exact comparison")+button("save-comparison","Save immutable comparison",p?"":"disabled")+'</div>'+'<div id="comparison-preview">'+(p?'<p>'+p.rows.length+' paired rows · '+p.unmatchedLeft.length+' earlier-only · '+p.unmatchedRight.length+' later-only.</p>'+details("Comparison basis and caveats",{body:p.body,caveats:p.caveats})+reports.caveats(p)+reports.compareTable(p.rows.slice(0,50))+details("Complete unmatched earlier rows",p.unmatchedLeft)+details("Complete unmatched later rows",p.unmatchedRight):'<p>Changed or unknown bases remain explicit. A numerical increase alone does not decide whether privacy improved.</p>')+'</div></section><section>'+select("Inspect a saved comparison",'data-draft="selectedComparisonId"',options("comparisons"),s.draft.selectedComparisonId)+(selected?inspectComparison(selected,s.draft.selectedComparisonId):'<p>Select a saved comparison to inspect every paired row and review.</p>')+'</section>';}
function reviews(){const s=state(),d=s.draft.review,p=model.getPreview("adoption"),record=d.subjectId?model.latestReview({subject:d.subject,subjectId:d.subjectId,target:d.target}):null;return'<section><h3>Named review</h3><div class="grid">'+select("Subject type",field("review","subject"),["edition","comparison"],d.subject,null)+select("Exact subject",field("review","subjectId"),options(d.subject==="edition"?"editions":"comparisons"),d.subjectId)+input("Target: all, exact metric pointer or comparison row ID",field("review","target"),d.target)+select("Review status",field("review","status"),["open","accept","investigate","defer"],d.status,null)+input("Owner responsible for this review",field("review","owner"),d.owner)+'</div>'+textarea("Named review note",field("review","note"),d.note)+'<div class="actions">'+button("save-review","Save named review")+button("download-review-return","Export reviewer return",d.subjectId?"":"disabled")+'</div><p>Choose Review beside an edition metric or comparison row to bind the exact target. A successor review retains the previous review in the chain.</p>'+(record?details("Latest retained review for this exact target",record):"")+'</section><section><h3>Adopt a returned review</h3><p>Receive the exact reviewer-return JSON in Originals with role prior_review. Preview binds its source bytes, original workspace, immutable subject and complete review chain.</p><div class="grid">'+select("Returned original",field("adoption","returnSourceId"),sourceOptions(["prior_review"]),s.draft.adoption.returnSourceId)+'</div>'+textarea("Adopting operator note",field("adoption","note"),s.draft.adoption.note)+'<div class="actions">'+button("preview-adoption","Preview returned review")+button("save-adoption","Adopt exact returned review",p?"":"disabled")+'</div>'+'<div id="adoption-preview">'+(p?details("Complete returned review adoption",{identity:p.sha256,body:p.body,additions:p.additions,alreadyPresent:p.alreadyPresent}):"")+'</div></section><section><h3>Complete review history</h3>'+s.workspace.reviews.map(x=>details(x.body.subject+" · "+x.body.status+" · "+x.id,x)).join("")+(s.workspace.adoptions||[]).map(x=>details("Returned review adoption "+x.id,x)).join("")+'</section>';}
function research(){const s=state(),p=view.research;return'<section>'+select("Edition to hand over",'data-draft="selectedEditionId"',options("editions"),s.draft.selectedEditionId)+'<div class="actions">'+button("prepare-research","Prepare complete Research handover",s.draft.selectedEditionId?"":"disabled")+button("download-research","Download Research handover ZIP",'data-id="'+e(s.draft.selectedEditionId)+'" '+(s.draft.selectedEditionId?"":"disabled"))+'</div><p>Uses the maintained original Research preparation and validation engine. The complete original result, supporting bytes, exact metric projection, plan, run, readable review and current workspace history accompany the edition.</p>'+(p?table(["Original path","Bytes","SHA-256"],p.files.map(f=>[f.path,f.bytes,f.sha256]))+details("Complete Research preparation review",p.review)+details("Exact original plan",p.plan):"")+'</section>';}
function history(){const s=state();return'<section><h3>Retained unfinished forms</h3>'+s.draft.retainedDrafts.map(x=>'<div class="item">'+e(x.kind+" · "+x.at)+button("restore-draft","Restore as editable form",'data-id="'+e(x.id)+'"')+details("Complete retained draft",x.value)+'</div>').join("")+'</section><section><h3>Complete operation history</h3>'+s.workspace.operations.map(x=>details((x.type||x.body?.type||"Operation")+" · "+x.id,x)).join("")+'</section>';}
function handover(){return'<section><p>Each working copy retains originals, saved selections, immutable editions, comparison bases, named reviews and unfinished forms. The complete ZIP also contains every application source file, reports, original files and a native Research handover for every edition.</p><div class="actions">'+button("download-working","Working JSON")+button("download-html","Editable HTML")+button("download-source","Complete application source")+button("download-report","Readable report")+button("download-report-json","Complete report JSON")+button("download-guide","Operating guide")+button("measure","Measure complete handover")+button("download-zip","Complete handover ZIP")+'</div><p>Complete ZIP capacity: 128 MiB, measured before accepting a source, selection, edition, comparison or review. Per-file limits are additional constraints; six result imports of the maximum file size do not imply that the whole archive can hold them together.</p>'+(view.capacity?"<p>Current complete handover: <strong>"+view.capacity.bytes+" bytes</strong> / "+view.capacity.members+" members.</p>":"")+'</section><section><h3>Portable source</h3><p>Run the included materialize_source.py with the complete application source, then run node build.mjs --out /absolute/new-delivery. Source paths and hashes are checked. Reviewed source edits can be rebuilt with --accept-edits into a fresh output directory. Opening a new HTML copy never overwrites another browser branch.</p><p>For commissioning, complete the original receiving course in WORKBENCH_GUIDE.md: desktop and narrow-width operation, cold reopen, real own-input intake, successor comparison, a separate reviewer-return adoption and all full exports.</p></section>';}
async function refresh(){const s=state(),g=generation,next={};if(s.draft.selectedEditionId)next.edition=await model.inspectEdition(s.draft.selectedEditionId);if(s.draft.selectedComparisonId)next.comparison=await model.report("comparison",s.draft.selectedComparisonId);if(g===generation&&state().workspace===s.workspace)view={...view,...next};}
function render(){if(!model)return;const fn={Overview:overview,Originals:originals,Selection:selection,Editions:editions,Comparisons:comparisons,Reviews:reviews,Research:research,History:history,Handover:handover};root.innerHTML=shell(fn[state().page]());if(busy)for(const el of root.querySelectorAll("button,input,select,textarea"))el.disabled=true;updateNotice();}
async function run(fn){if(busy)return;busy=true;render();try{await fn();await refresh();}catch(error){notice=(error.code?error.code+": ":"")+error.message;}finally{busy=false;render();}}
async function changed(label){generation++;view={};dirty=true;notice=label;await save().catch(()=>{});}
async function action(name,id,ds={}){const s=state();
if(name==="new"){await flush();volatile.set(branchId,await model.envelope());await model.newWorkspace(s.draft.newLabel);branchId=uid("branch");expectedFingerprint=null;return changed("Opened a new editable workspace.");}
if(name==="example"){const f=delivery.files.find(x=>x.path==="examples/authored-working.json");if(!f)throw Error("The complete authored reference is absent.");return activate(JSON.parse(f.content),"Opened authored software example in a separate branch.");}
if(name==="open-branch"){const r=records.find(x=>x.branchId===id);if(!r)throw Error("Saved branch is absent.");return activate(r.working,"Opened the saved copy as a separate branch.");}
if(name==="open-volatile"){const r=volatile.get(id);if(!r)throw Error("Retained copy is absent.");return activate(r,"Opened the complete retained copy.");}
if(name==="retry-intake"){await model.admitPending();return changed("Retained the complete original file.");}
if(name==="discard-pending"){model.edit(d=>{d.pendingImport=null;});mark();return;}
if(name==="download-pending"){const p=s.draft.pendingImport;if(!p)throw Error("No staged original.");return download(p.name,io.fromBase64(p.contentBase64),p.mediaType);}
if(name==="add-binding"){model.edit(d=>{const n=d.selection.originalBindings.length+1;d.selection.originalBindings.push({sourceId:"",id:"support-"+n,path:"support/file-"+n,role:"supporting original",mediaType:"application/octet-stream"});});mark();return;}
if(name==="remove-binding"){const i=Number(id);model.edit(d=>{if(!Number.isSafeInteger(i)||i<0||i>=d.selection.originalBindings.length)throw Error("Binding is absent.");d.selection.originalBindings.splice(i,1);});mark();return;}
if(name==="blank-definitions"){model.retain("selection");const criteria=api.selectionTemplate().protocol.criteria;model.edit(d=>{d.selection.protocolText=JSON.stringify({questionId:"",title:"",purpose:"",scope:"",criteria,sourceRefs:[]},null,2);d.selection.candidateText=JSON.stringify({name:"",kind:"",version:"",description:"",configuration:{},sourceRefs:[]},null,2);d.selection.runText=JSON.stringify({externalRunId:"",kind:"IMPORTED_MEASUREMENT",status:"",startedAt:"",finishedAt:"",elapsedMs:null,engine:{name:"",version:"",command:[],runtime:{},configuration:{}},input:{cohortId:"",protocolId:"",definition:{},sourceRefs:[]},limitations:[]},null,2);});notice="Started blank own-result definitions with exact native criteria. Enter the original run identities, status and timestamps.";mark();return;}

if(name==="template"){model.adoptTemplate();notice="Copied the authored TRAINING_FIXTURE structure. Replace its context with the real dataset, protocol, candidate and run before own-result intake.";mark();return;}
if(name==="copy-selection"){model.copySelection(id);mark();return;}
if(name==="restore-draft"){model.restore(id);mark();return;}
for(const kind of["selection","edition","comparison","adoption"]){if(name==="preview-"+kind){await model.preview(kind);notice="Prepared the complete exact "+kind+" preview.";return;}if(name==="save-"+kind){await model.acceptPreview(kind);if(kind==="edition")model.setPage("Editions");if(kind==="comparison")model.setPage("Comparisons");return changed("Saved the original-backed "+kind+" and complete history.");}}
if(name==="save-review"){await model.saveReview();return changed("Saved the named review and retained its earlier chain.");}
if(name==="review-metric"||name==="review-comparison-row"||name==="review-edition"){model.retain("review");model.edit(d=>{d.review={...d.review,subject:name==="review-comparison-row"?"comparison":"edition",subjectId:name==="review-comparison-row"?ds.comparison:name==="review-metric"?ds.edition:id,target:name==="review-edition"?"all":id};});model.setPage("Reviews");mark();return;}
if(name==="previous"||name==="next"){model.edit(d=>{d.offset=Math.max(0,d.offset+(name==="next"?50:-50));});mark();return;}
if(name==="prepare-research"){view.research=await model.prepareResearch(s.draft.selectedEditionId);notice="Prepared complete native Research files for this edition.";return;}
if(name==="measure"){const p=await model.requireCapacity();view.capacity={bytes:p.bytes,members:p.entries.length};return;}
if(name.startsWith("download-"))return downloadExport(name.slice(9),id);
throw Error("Unknown action.");}
root.addEventListener("click",event=>{const el=event.target.closest("button");if(!el||busy)return;if(el.dataset.page)return run(async()=>{model.setPage(el.dataset.page);mark();});if(el.dataset.action)run(()=>action(el.dataset.action,el.dataset.id,el.dataset));});
function edit(el){if(busy)return;const ds=el.dataset,value=el.type==="checkbox"?el.checked:el.value;let redraw=false;model.edit(d=>{
if(ds.draft){if(!Object.hasOwn(d,ds.draft)||typeof d[ds.draft]!=="string")throw Error("Unknown unfinished field.");d[ds.draft]=value;if(["selectedSourceId","selectedEditionId","selectedComparisonId","comparisonView","dimension"].includes(ds.draft)){redraw=true;d.offset=0;}if(ds.draft==="query")d.offset=0;}
if(ds.field){const[group,key]=ds.field.split(".");if(!["selection","edition","comparison","review","adoption"].includes(group)||!Object.hasOwn(d[group],key)||typeof d[group][key]!=="string")throw Error("Unknown form field.");d[group][key]=value;if(group==="review"&&key==="subject"){d.review.subjectId="";d.review.target="all";redraw=true;}if(group==="review"&&key==="subjectId")redraw=true;}
if(ds.json){const known=definitionFields[ds.json]?.find(x=>x[0]===ds.jsonPath);if(!known)throw Error("Unknown typed definition field.");let definition;try{definition=JSON.parse(d.selection[ds.json]);}catch{throw Error("Complete the unfinished JSON before editing its typed fields.");}let target=definition;const parts=ds.jsonPath.split(".");for(const key of parts.slice(0,-1)){if(!target[key]||typeof target[key]!=="object"||Array.isArray(target[key]))throw Error("Complete the "+key+" object in the retained JSON.");target=target[key];}target[parts.at(-1)]=known[2]==="number"?(value===""?null:Number(value)):value;if(known[2]==="number"&&target[parts.at(-1)]!==null&&(!Number.isFinite(target[parts.at(-1)])||target[parts.at(-1)]<0))throw Error("Elapsed milliseconds must be nonnegative or blank.");d.selection[ds.json]=JSON.stringify(definition,null,2);}

if(ds.dataset){if(!["id","revision"].includes(ds.dataset))throw Error("Unknown dataset field.");d.selection.dataset[ds.dataset]=value;}
if(ds.basis){if(!["dataset","cohort","protocol","judge","rationale"].includes(ds.basis))throw Error("Unknown basis field.");d.comparison.basis[ds.basis]=value;}
if(ds.binding!==undefined){const row=d.selection.originalBindings[Number(ds.binding)];if(!row||!["sourceId","id","path","role","mediaType"].includes(ds.key))throw Error("Unknown original binding.");row[ds.key]=value;if(ds.key==="sourceId"){const source=state().workspace.sources.find(x=>x.id===value);if(source){row.mediaType=source.body.mediaType;row.path=io.safeOriginalPath(source.id,source.body.name);row.id="support-"+codec.sha256Bytes(codec.utf8Encode(source.id)).slice(0,16);row.role=source.body.role;}redraw=true;}}
});mark();syncDefinitions();for(const kind of["selection","edition","comparison","adoption"]){const b=root.querySelector('[data-action="save-'+kind+'"]');if(b)b.disabled=true;const p=root.querySelector("#"+kind+"-preview");if(p)p.innerHTML="<p>Choices changed. Preview the current complete selection again.</p>";}if(redraw){generation++;view={};run(async()=>{});}else if(ds.draft==="query"){const active=document.activeElement,start=active?.selectionStart,end=active?.selectionEnd;render();const q=root.querySelector('[data-draft="query"]');q?.focus();if(start!==null&&start!==undefined)q?.setSelectionRange(start,end);}}
root.addEventListener("input",event=>{if(event.target.matches("input:not([type=file]):not([type=checkbox]),textarea"))try{edit(event.target);}catch(error){notice=error.message;updateNotice();}});
root.addEventListener("change",event=>{const el=event.target;if(el.matches("select,input[type=checkbox]"))try{edit(el);}catch(error){notice=error.message;updateNotice();}if(["source-file","open-working"].includes(el.id)&&el.files?.[0]){const file=el.files[0],original=state().workspace,role=state().draft.sourceRole,mode=el.id;run(async()=>{const maximum=mode==="open-working"?256*1024*1024:32*1024*1024;if(file.size>maximum)throw Error("Selected file exceeds "+maximum+" bytes.");const b=new Uint8Array(await file.arrayBuffer());if(state().workspace!==original)throw Error("Workspace changed; select the original again.");if(mode==="open-working"){const t=codec.utf8Decode(b);if(codec.toBase64(codec.utf8Encode(t))!==codec.toBase64(b))throw Error("Working JSON is not exact UTF-8.");return activate(JSON.parse(t.replace(/^\uFEFF/,"")),"Opened the complete working copy as a separate branch.");}await model.stageSource({name:file.name,role,mediaType:file.type||"application/octet-stream",contentBase64:codec.toBase64(b)});mark();await save().catch(()=>{});await model.admitPending();await changed("Retained the complete original file.");});}});
window.addEventListener("beforeunload",event=>{if(dirty||pendingSaves||timer){event.preventDefault();event.returnValue="";}});
try{model=await createPrivacyBenchController({api,codec,io,delivery,initialWorking,reports,renderHTML,deliveryLimits});dirty=true;await refreshBranches();await refresh();render();await save().catch(()=>{});}catch(error){root.innerHTML="<main><h1>Cannot open the complete working copy</h1><p>"+e(error.message)+"</p></main>";}
return{snapshot:async()=>({working:model?await model.envelope():null,...(model?state():{}),branchId,dirty,pendingSaves}),flush,controller:model};
}

return {startPrivacyBenchApp};
})();
const delivery=JSON.parse(document.getElementById("delivery-data").textContent),initialWorking=JSON.parse(document.getElementById("working-data").textContent),codec=codecModule,nativeResearch=createNativeResearch({codec}),nativePrivacyBench=createNativePrivacyBench({codec,nativeResearch}),api=createPrivacyBenchWorkspace({codec,nativePrivacyBench,nativeResearch}),io=ioModule.createPrivacyBenchIO({codec}),reports=reportModule.createPrivacyBenchReports({api,codec,io});
appModule.startPrivacyBenchApp({api,io,codec,delivery,initialWorking,reports,renderHTML:deliveryModule.renderStandalone});
