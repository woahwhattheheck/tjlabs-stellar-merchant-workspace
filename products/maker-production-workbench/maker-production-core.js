// Copyright TokenJunkieLabs. Pure JavaScript archive primitives; no filesystem, network or code evaluation.
// High-level limits and portable paths are enforced by source_bank.mjs.
function createArchiveCodec() {
  "use strict";
  const fail = message => { throw new Error("archive_codec: " + message); };
  const bytes = value => value instanceof Uint8Array ? value : Uint8Array.from(value);
  function utf8Encode(text) {
    const out = [];
    for (let i = 0; i < text.length; i++) {
      let c = text.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const low = text.charCodeAt(++i);
        if (!(low >= 0xdc00 && low <= 0xdfff)) fail("unpaired UTF-16 surrogate");
        c = 0x10000 + ((c - 0xd800) << 10) + low - 0xdc00;
      } else if (c >= 0xdc00 && c <= 0xdfff) fail("unpaired UTF-16 surrogate");
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >>> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >>> 12), 0x80 | ((c >>> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >>> 18), 0x80 | ((c >>> 12) & 63), 0x80 | ((c >>> 6) & 63), 0x80 | (c & 63));
    }
    return Uint8Array.from(out);
  }
  function utf8Decode(input) {
    const a = bytes(input), chunks = [], part = [];
    for (let i = 0; i < a.length;) {
      const first = a[i++]; let c, count, minimum;
      if (first < 128) { c = first; count = 0; minimum = 0; }
      else if (first >= 0xc2 && first <= 0xdf) { c = first & 31; count = 1; minimum = 0x80; }
      else if (first >= 0xe0 && first <= 0xef) { c = first & 15; count = 2; minimum = 0x800; }
      else if (first >= 0xf0 && first <= 0xf4) { c = first & 7; count = 3; minimum = 0x10000; }
      else fail("invalid UTF-8 lead byte");
      for (let k = 0; k < count; k++) {
        if (i >= a.length || (a[i] & 0xc0) !== 0x80) fail("invalid UTF-8 continuation");
        c = (c << 6) | (a[i++] & 63);
      }
      if (c < minimum || c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff)) fail("invalid UTF-8 scalar");
      if (c <= 0xffff) part.push(c);
      else { c -= 0x10000; part.push(0xd800 | (c >>> 10), 0xdc00 | (c & 1023)); }
      if (part.length >= 8192) { chunks.push(String.fromCharCode(...part)); part.length = 0; }
    }
    if (part.length) chunks.push(String.fromCharCode(...part));
    return chunks.join("");
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function base64Decode(text) {
    const s = String(text).replace(/[ \t\r\n]/g, "");
    if (s.length % 4) fail("invalid base64 length");
    const padding = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
    const out = new Uint8Array(s.length / 4 * 3 - padding); let p = 0;
    for (let i = 0; i < s.length; i += 4) {
      const a = alphabet.indexOf(s[i]), b = alphabet.indexOf(s[i + 1]);
      const last = i + 4 === s.length;
      const c = s[i + 2] === "=" ? -2 : alphabet.indexOf(s[i + 2]);
      const d = s[i + 3] === "=" ? -2 : alphabet.indexOf(s[i + 3]);
      if (a < 0 || b < 0 || c === -1 || d === -1 ||
          (c === -2 && (!last || d !== -2)) || (d === -2 && !last))
        fail("invalid base64 alphabet or padding");
      if ((c === -2 && (b & 15)) || (d === -2 && c >= 0 && (c & 3)))
        fail("noncanonical base64 padding");
      const v = (a << 18) | (b << 12) | (Math.max(c, 0) << 6) | Math.max(d, 0);
      if (p < out.length) out[p++] = v >>> 16;
      if (p < out.length) out[p++] = (v >>> 8) & 255;
      if (p < out.length) out[p++] = v & 255;
    }
    return out;
  }
  function base64Encode(input) {
    const a = bytes(input), chunks = []; let part = "";
    for (let i = 0; i < a.length; i += 3) {
      const remain = a.length - i, v = (a[i] << 16) | ((a[i + 1] || 0) << 8) | (a[i + 2] || 0);
      part += alphabet[(v >>> 18) & 63] + alphabet[(v >>> 12) & 63] +
        (remain > 1 ? alphabet[(v >>> 6) & 63] : "=") + (remain > 2 ? alphabet[v & 63] : "=");
      if (part.length >= 8192) { chunks.push(part); part = ""; }
    }
    if (part) chunks.push(part);
    return chunks.join("");
  }
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[i] = c >>> 0;
  }
  function crc32(input) {
    let c = 0xffffffff;
    for (const v of bytes(input)) c = crcTable[(c ^ v) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const shaK = Uint32Array.from([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);
  const rotate = (x, n) => (x >>> n) | (x << (32 - n));
  function sha256(input) {
    const a = typeof input === "string" ? utf8Encode(input) : bytes(input);
    const n = a.length, padded = new Uint8Array(Math.ceil((n + 9) / 64) * 64);
    padded.set(a); padded[n] = 128;
    const high = Math.floor(n / 0x20000000), low = (n * 8) >>> 0;
    for (let i = 0; i < 4; i++) {
      padded[padded.length - 8 + i] = (high >>> (24 - i * 8)) & 255;
      padded[padded.length - 4 + i] = (low >>> (24 - i * 8)) & 255;
    }
    const h = Uint32Array.from([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    const w = new Uint32Array(64);
    for (let offset = 0; offset < padded.length; offset += 64) {
      for (let i = 0; i < 16; i++) {
        const p = offset + i * 4;
        w[i] = ((padded[p] << 24) | (padded[p + 1] << 16) | (padded[p + 2] << 8) | padded[p + 3]) >>> 0;
      }
      for (let i = 16; i < 64; i++) {
        const x = w[i - 15], y = w[i - 2];
        w[i] = ((rotate(x,7) ^ rotate(x,18) ^ (x >>> 3)) + w[i - 16] +
                (rotate(y,17) ^ rotate(y,19) ^ (y >>> 10)) + w[i - 7]) >>> 0;
      }
      let [v0,v1,v2,v3,v4,v5,v6,v7] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (v7 + (rotate(v4,6) ^ rotate(v4,11) ^ rotate(v4,25)) +
                    ((v4 & v5) ^ (~v4 & v6)) + shaK[i] + w[i]) >>> 0;
        const t2 = ((rotate(v0,2) ^ rotate(v0,13) ^ rotate(v0,22)) +
                    ((v0 & v1) ^ (v0 & v2) ^ (v1 & v2))) >>> 0;
        v7=v6;v6=v5;v5=v4;v4=(v3+t1)>>>0;v3=v2;v2=v1;v1=v0;v0=(t1+t2)>>>0;
      }
      for (const [i,v] of [v0,v1,v2,v3,v4,v5,v6,v7].entries()) h[i] = (h[i] + v) >>> 0;
    }
    return Array.from(h, v => v.toString(16).padStart(8,"0")).join("");
  }
  const lengthBase = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const lengthExtra = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const distanceBase = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const distanceExtra = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  function reverse(value, count) { let out=0; for(let i=0;i<count;i++){out=(out<<1)|(value&1);value>>>=1;} return out; }
  function huffman(lengths) {
    const count = new Uint16Array(16), next = new Uint16Array(16), maps = [], codes = [];
    let max=0, code=0, left=1;
    for (const length of lengths) { if(length<0 || length>15) fail("invalid Huffman length"); if(length){count[length]++;max=Math.max(max,length);} }
    for(let n=1;n<=15;n++){left=(left<<1)-count[n];if(left<0)fail("oversubscribed Huffman tree");code=(code+count[n-1])<<1;next[n]=code;if(count[n])maps[n]=new Map();}
    for(let symbol=0;symbol<lengths.length;symbol++){
      const n=lengths[symbol];if(n){const rev=reverse(next[n]++,n);maps[n].set(rev,symbol);codes[symbol]=[rev,n];}
    }
    return {maps,max,codes};
  }
  const fixedLengths = Array.from({length:288},(_,i)=>i<144?8:i<256?9:i<280?7:8);
  const fixedLiteral = huffman(fixedLengths), fixedDistance = huffman(Array(32).fill(5));
  function inflateRaw(input, offset=0, maxOutputBytes=134217728) {
    const a=bytes(input);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > a.length ||
        !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 0 || maxOutputBytes > 0x7fffffff)
      fail("invalid inflate offset or output limit");
    let position=offset, buffer=0, buffered=0, output=new Uint8Array(Math.min(65536,maxOutputBytes)), used=0;
    function read(n){while(buffered<n){if(position>=a.length)fail("truncated deflate stream");buffer|=a[position++]<<buffered;buffered+=8;}const v=buffer&((1<<n)-1);buffer>>>=n;buffered-=n;return v;}
    function emit(v){if(used>=maxOutputBytes)fail("decompressed size exceeds maxOutputBytes");if(used===output.length){const grown=new Uint8Array(Math.min(maxOutputBytes,Math.max(1,output.length*2)));grown.set(output);output=grown;}output[used++]=v;}
    function decode(tree){let code=0;for(let n=1;n<=tree.max;n++){code|=read(1)<<(n-1);const symbol=tree.maps[n]?.get(code);if(symbol!==undefined)return symbol;}fail("invalid Huffman code");}
    let final=0;
    do {
      final=read(1);const type=read(2);
      if(type===0){
        buffer=0;buffered=0;
        const size=read(16), complement=read(16);
        if(((size^0xffff)&0xffff)!==complement)fail("invalid stored-block length");
        for(let i=0;i<size;i++)emit(read(8));
        continue;
      }
      let literal, distance;
      if(type===1){literal=fixedLiteral;distance=fixedDistance;}
      else if(type===2){
        const literalCount=read(5)+257,distanceCount=read(5)+1,codeCount=read(4)+4;
        const order=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],codeLengths=Array(19).fill(0);
        for(let i=0;i<codeCount;i++)codeLengths[order[i]]=read(3);
        const codeTree=huffman(codeLengths),lengths=[];
        while(lengths.length<literalCount+distanceCount){
          const value=decode(codeTree);let repeat=1,length=value;
          if(value===16){if(!lengths.length)fail("repeat without previous code");length=lengths[lengths.length-1];repeat=read(2)+3;}
          else if(value===17){length=0;repeat=read(3)+3;}
          else if(value===18){length=0;repeat=read(7)+11;}
          else if(value>18)fail("invalid code-length symbol");
          if(lengths.length+repeat>literalCount+distanceCount)fail("code-length repeat overflow");
          for(let j=0;j<repeat;j++)lengths.push(length);
        }
        if(!lengths[256])fail("missing end-of-block code");
        literal=huffman(lengths.slice(0,literalCount));distance=huffman(lengths.slice(literalCount));
      } else fail("reserved deflate block type");
      while(true){
        const symbol=decode(literal);
        if(symbol<256){emit(symbol);continue;}
        if(symbol===256)break;
        if(symbol<257 || symbol>285)fail("invalid length symbol");
        const li=symbol-257,len=lengthBase[li]+read(lengthExtra[li]),ds=decode(distance);
        if(ds>29)fail("invalid distance symbol");
        const back=distanceBase[ds]+read(distanceExtra[ds]);
        if(back>used)fail("distance precedes output");
        for(let j=0;j<len;j++)emit(output[used-back]);
      }
    } while(!final);
    return {bytes:output.slice(0,used),nextOffset:position};
  }
  const read32 = (a,p) => ((a[p]|(a[p+1]<<8)|(a[p+2]<<16)|(a[p+3]<<24))>>>0);
  function gunzipDetailed(input, {maxOutputBytes=134217728,maxMembers=1024}={}) {
    const a=bytes(input), chunks=[], members=[];let p=0,total=0;
    if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 0 || maxOutputBytes > 0x7fffffff ||
        !Number.isSafeInteger(maxMembers) || maxMembers < 1) fail("invalid gzip limits");
    while(p<a.length){
      if (members.length >= maxMembers) fail("gzip member limit exceeded");
      const start=p;
      if(p+10>a.length || a[p]!==31 || a[p+1]!==139 || a[p+2]!==8)fail("invalid gzip header");
      const flags=a[p+3];if(flags&0xe0)fail("reserved gzip flags");p+=10;
      if(flags&4){if(p+2>a.length)fail("truncated gzip extra");const n=a[p]|(a[p+1]<<8);p+=2+n;if(p>a.length)fail("truncated gzip extra");}
      for(const flag of [8,16])if(flags&flag){while(p<a.length && a[p]!==0)p++;if(p>=a.length)fail("unterminated gzip header");p++;}
      if(flags&2){if(p+2>a.length || (crc32(a.subarray(start,p))&0xffff)!==(a[p]|(a[p+1]<<8)))fail("gzip header CRC mismatch");p+=2;}
      const decoded=inflateRaw(a,p,maxOutputBytes-total);p=decoded.nextOffset;
      if(p+8>a.length)fail("truncated gzip trailer");
      const expectedCrc=read32(a,p),expectedSize=read32(a,p+4),actualCrc=crc32(decoded.bytes);
      if(actualCrc!==expectedCrc)fail("gzip CRC32 mismatch");
      if((decoded.bytes.length>>>0)!==expectedSize)fail("gzip ISIZE mismatch");
      p+=8;total+=decoded.bytes.length;chunks.push(decoded.bytes);
      members.push({start,end:p,bytes:decoded.bytes.length,crc32:actualCrc.toString(16).padStart(8,"0")});
    }
    if(!members.length)fail("empty gzip input");
    const out=new Uint8Array(total);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}
    return {bytes:out,members};
  }
  function deflateRaw(input) {
    const a=bytes(input), out=[];let buffer=0,buffered=0;
    function write(v,n){buffer|=v<<buffered;buffered+=n;while(buffered>=8){out.push(buffer&255);buffer>>>=8;buffered-=8;}}
    const symbol=(tree,s)=>{const pair=tree.codes[s];write(pair[0],pair[1]);};
    write(3,3);
    const heads=new Int32Array(65536).fill(-1),previous=new Int32Array(a.length).fill(-1);
    const hash=p=>((a[p]*251+a[p+1])*251+a[p+2])&65535;
    function insert(p){if(p+2<a.length){const h=hash(p);previous[p]=heads[h];heads[h]=p;}}
    for(let p=0;p<a.length;){
      let best=2,bestDistance=0;
      if(p+2<a.length){
        let candidate=heads[hash(p)],remaining=64;const maximum=Math.min(258,a.length-p);
        while(candidate>=0 && p-candidate<=32768 && remaining--){
          if(a[candidate]===a[p] && a[candidate+1]===a[p+1] && a[candidate+best]===a[p+best]){
            let len=2;while(len<maximum && a[candidate+len]===a[p+len])len++;
            if(len>best){best=len;bestDistance=p-candidate;if(len===maximum)break;}
          }
          candidate=previous[candidate];
        }
      }
      if(bestDistance && best>=3){
        let li=0;while(li+1<lengthBase.length && lengthBase[li+1]<=best)li++;
        symbol(fixedLiteral,257+li);write(best-lengthBase[li],lengthExtra[li]);
        let di=0;while(di+1<distanceBase.length && distanceBase[di+1]<=bestDistance)di++;
        symbol(fixedDistance,di);write(bestDistance-distanceBase[di],distanceExtra[di]);
        for(let j=0;j<best;j++)insert(p+j);p+=best;
      }else{symbol(fixedLiteral,a[p]);insert(p);p++;}
    }
    symbol(fixedLiteral,256);if(buffered)out.push(buffer&255);return Uint8Array.from(out);
  }
  function gzip(input) {
    const a=typeof input==="string"?utf8Encode(input):bytes(input), compressed=deflateRaw(a);
    const out=new Uint8Array(18+compressed.length);out.set([31,139,8,0,0,0,0,0,0,255]);out.set(compressed,10);
    const crc=crc32(a),size=a.length>>>0;for(let i=0;i<4;i++){out[out.length-8+i]=(crc>>>(8*i))&255;out[out.length-4+i]=(size>>>(8*i))&255;}
    return out;
  }
  function decodeSourceBank(encoded,expectedSha256) {
    const packed=base64Decode(encoded),decoded=gunzipDetailed(packed),digest=sha256(decoded.bytes);
    if(expectedSha256 && digest!==expectedSha256.toLowerCase())fail("source-bank SHA256 mismatch: "+digest);
    const text=utf8Decode(decoded.bytes),bank=JSON.parse(text);
    return {bank,text,bytes:decoded.bytes.length,sha256:digest,gzipBase64:base64Encode(packed),gzipBytes:packed.length,gzipSha256:sha256(packed),members:decoded.members};
  }
  function encodeSourceBank(bankOrText) {
    const text=typeof bankOrText==="string"?bankOrText:JSON.stringify(bankOrText),raw=utf8Encode(text),packed=gzip(raw);
    return {text,bytes:raw.length,sha256:sha256(raw),gzipBase64:base64Encode(packed),gzipBytes:packed.length,gzipSha256:sha256(packed)};
  }
  return {utf8Encode,utf8Decode,base64Encode,base64Decode,crc32,sha256,inflateRaw,
          gunzip:(input,options)=>gunzipDetailed(input,options).bytes,gunzipDetailed,deflateRaw,gzip,
          decodeSourceBank,encodeSourceBank};
}


function createMakerProductionCore(){
"use strict";const codec=createArchiveCodec(),MAX=BigInt(Number.MAX_SAFE_INTEGER),SCHEMA="maker.production-workspace.v1";
const columns={"products":["product_id","name"],"resources":["resource_id","name","capacity_unit","daily_capacity","open_weekdays"],"calendar":["resource_id","date","capacity","source_ref"],"routes":["product_id","stage_id","sequence","duration_days","day_basis","resource_id","units_per_piece","yield_bps","compatibility"],"orders":["order_id","product_id","quantity","due_date","due_basis","transit_days","source_ref"],"stock":["stock_id","product_id","quantity","order_id","batch_id","source_ref"],"batches":["batch_id","order_id","target_good","source_ref"],"observations":["event_id","batch_id","stage_id","observed_at","local_date","status","input_qty","good_qty","reject_qty","held_qty","source_ref"]},actions=["revise-date","split-batch","reserve-capacity","recount","accept-risk","hold"];
const clone=x=>JSON.parse(JSON.stringify(x)),obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x),assert=(x,m)=>{if(!x)throw new Error(m);};
function text(x,n,blank=false){assert(typeof x==="string"&&(blank||x.trim()!==""),n+" must be text");assert(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(x),n+" has invalid Unicode");return x;}
function id(x,n){text(x,n);assert(x.length<=200&&!/[\u0000-\u001f]/.test(x),n+" is invalid");return x;}
function canonical(x){if(x===null||typeof x!=="object")return JSON.stringify(x);if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}";}
const hash=x=>codec.sha256(codec.utf8Encode(typeof x==="string"?x:canonical(x)));
function int(s,n,min=0,max=Number.MAX_SAFE_INTEGER){assert(typeof s==="string"&&/^(0|[1-9][0-9]*)$/.test(s),n+" must be a canonical integer string");const b=BigInt(s);assert(b>=BigInt(min)&&b<=BigInt(max),n+" outside allowed range");return Number(b);}
function safe(b){assert(b<=MAX&&b>=-MAX,"Quantity exceeds exact output range");return Number(b);}
const add=(a,b)=>safe(BigInt(a)+BigInt(b)),mul=(a,b)=>safe(BigInt(a)*BigInt(b)),ceilYield=(n,y)=>safe((BigInt(n)*10000n+BigInt(y)-1n)/BigInt(y)),floorYield=(n,y)=>safe(BigInt(n)*BigInt(y)/10000n);
function date(s,n="date"){text(s,n);assert(/^\d{4}-\d{2}-\d{2}$/.test(s),n+" must be ISO local date");const d=new Date(s+"T12:00:00Z");assert(Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s,n+" must be a real date");return s;}
function day(s){return Math.floor(Date.parse(date(s)+"T12:00:00Z")/86400000);}function iso(d){const s=new Date(d*86400000).toISOString().slice(0,10);return date(s);}const weekday=d=>{const x=new Date(d*86400000).getUTCDay();return x===0?7:x;};
function instant(s){text(s,"observed_at");assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(s),"observed_at needs full time and UTC offset");date(s.slice(0,10));assert(Number(s.slice(11,13))<24&&Number(s.slice(14,16))<60&&Number(s.slice(17,19))<60,"Invalid observation time");const n=Date.parse(s);assert(Number.isFinite(n),"Invalid observation instant");return n;}
function parseCSV(original,table){text(original,table+" source",true);let s=original.charCodeAt(0)===65279?original.slice(1):original,rows=[],row=[],cell="",quoted=false,after=false;for(let i=0;i<s.length;i++){const ch=s[i];if(quoted){if(ch==='"'){if(s[i+1]==='"'){cell+='"';i++;}else{quoted=false;after=true;}}else cell+=ch;continue;}if(ch==='"'){assert(cell===""&&!after,"Unexpected CSV quote");quoted=true;continue;}if(ch===","||ch==="\r"||ch==="\n"){row.push(cell);cell="";after=false;if(ch!==","){if(ch==="\r"&&s[i+1]==="\n")i++;if(row.some(v=>v!==""))rows.push(row);row=[];}continue;}assert(!after,"Characters after closing CSV quote");cell+=ch;}assert(!quoted,"Unclosed CSV quote");if(cell!==""||row.length||after){row.push(cell);if(row.some(v=>v!==""))rows.push(row);}assert(rows.length,table+" needs a header");const headers=rows.shift();assert(new Set(headers).size===headers.length&&headers.length===columns[table].length&&columns[table].every(h=>headers.includes(h)),table+" header differs from contract");return rows.map((r,i)=>{assert(r.length===headers.length,table+" row "+(i+2)+" has wrong length");return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});}
function settings(s){assert(obj(s)&&obj(s.shippingCalendar),"Explicit local asOf and shipping calendar required");date(s.asOf,"asOf");const a=s.shippingCalendar.openWeekdays,c=s.shippingCalendar.closedDates;assert(Array.isArray(a)&&a.length>0&&new Set(a).size===a.length&&a.every(n=>Number.isInteger(n)&&n>=1&&n<=7),"Shipping open weekdays must be unique ISO weekday numbers");assert(Array.isArray(c)&&new Set(c).size===c.length,"Shipping closed dates must be unique");c.forEach(x=>date(x,"Shipping closed date"));return {asOf:s.asOf,shippingCalendar:{openWeekdays:[...a].sort(),closedDates:[...c].sort()}};}
function unique(rows,key,name){const m=new Map();for(const r of rows){const k=key(r);assert(!m.has(k),"Duplicate "+name+" "+k);m.set(k,r);}return m;}
function compile(sources,set){assert(obj(sources)&&Object.keys(sources).sort().join("|")===Object.keys(columns).sort().join("|"),"Exactly eight original CSV tables required");const t={},originals={};for(const table of Object.keys(columns)){const f=sources[table];assert(obj(f),"Invalid original "+table);text(f.name,table+" filename");text(f.text,table+" text",true);const b=codec.utf8Encode(f.text);originals[table]={name:f.name,text:f.text,bytes:b.length,sha256:codec.sha256(b)};t[table]=parseCSV(f.text,table);}
const cfg=settings(set),products=unique(t.products,r=>id(r.product_id,"product_id"),"product"),resources=unique(t.resources,r=>id(r.resource_id,"resource_id"),"resource"),orders=unique(t.orders,r=>id(r.order_id,"order_id"),"order"),batches=unique(t.batches,r=>id(r.batch_id,"batch_id"),"batch");
for(const p of t.products)text(p.name,"product name");
for(const r of t.resources){text(r.name,"resource name");text(r.capacity_unit,"capacity unit");int(r.daily_capacity,"daily_capacity");assert(/^[1-7](\|[1-7])*$/.test(r.open_weekdays)&&new Set(r.open_weekdays.split("|")).size===r.open_weekdays.split("|").length,"Resource weekdays must be explicit unique ISO numbers");}
const cal=unique(t.calendar,r=>JSON.stringify([r.resource_id,date(r.date)]),"resource/day override");for(const r of t.calendar){assert(resources.has(r.resource_id),"Unknown calendar resource");int(r.capacity,"override capacity");text(r.source_ref,"calendar source_ref");}
const routeMap=new Map();unique(t.routes,r=>JSON.stringify([r.product_id,id(r.stage_id,"stage_id")]),"product/stage");for(const r of t.routes){assert(products.has(r.product_id),"Unknown route product");assert(resources.has(r.resource_id),"Unknown route resource");int(r.sequence,"route sequence",1);int(r.duration_days,"stage duration",1,3650);assert(["calendar","resource-open"].includes(r.day_basis),"Unknown stage day_basis");int(r.units_per_piece,"resource units_per_piece",1);int(r.yield_bps,"yield_bps",1,10000);text(r.compatibility,"compatibility");if(!routeMap.has(r.product_id))routeMap.set(r.product_id,[]);routeMap.get(r.product_id).push(r);}
for(const p of t.products){const a=routeMap.get(p.product_id);assert(a&&a.length,"Every product needs a declared stage route");a.sort((a,b)=>Number(a.sequence)-Number(b.sequence));assert(a.every((r,i)=>Number(r.sequence)===i+1),"Route sequences must be contiguous starting at1");}
for(const o of t.orders){assert(products.has(o.product_id),"Unknown order product");int(o.quantity,"order quantity",1);date(o.due_date);assert(["ship","delivery","ready"].includes(o.due_basis),"Unknown deadline basis");int(o.transit_days,"transit_days",0,3650);assert(o.due_basis==="delivery"||o.transit_days==="0","Ship or ready deadline must not also subtract transit");text(o.source_ref,"order source_ref");}
for(const b of t.batches){assert(orders.has(b.order_id),"Unknown batch order");int(b.target_good,"batch target_good",1);text(b.source_ref,"batch source_ref");}
unique(t.stock,r=>id(r.stock_id,"stock_id"),"stock");for(const s of t.stock){assert(products.has(s.product_id),"Unknown stock product");int(s.quantity,"stock quantity");text(s.source_ref,"stock source_ref");if(s.order_id){assert(orders.has(s.order_id)&&orders.get(s.order_id).product_id===s.product_id,"Stock order/product mismatch");}if(s.batch_id){assert(batches.has(s.batch_id),"Unknown stock batch");const b=batches.get(s.batch_id);assert(s.order_id===b.order_id&&orders.get(b.order_id).product_id===s.product_id,"Linked stock must keep exact batch order/product");}}
unique(t.observations,r=>id(r.event_id,"event_id"),"event");const observationKeys=new Set();
for(const o of t.observations){assert(batches.has(o.batch_id),"Unknown observed batch");const p=orders.get(batches.get(o.batch_id).order_id).product_id;assert(routeMap.get(p).some(r=>r.stage_id===o.stage_id),"Unknown observed batch stage");const ts=instant(o.observed_at);date(o.local_date);assert(o.local_date===o.observed_at.slice(0,10),"Observation local date must match its supplied offset timestamp date");const key=JSON.stringify([o.batch_id,o.stage_id,ts]);assert(!observationKeys.has(key),"Ambiguous same-instant stage snapshots");observationKeys.add(key);assert(["active","complete"].includes(o.status),"Unknown observation status");for(const k of ["input_qty","good_qty","reject_qty","held_qty"])int(o[k],k);assert(add(add(Number(o.good_qty),Number(o.reject_qty)),Number(o.held_qty))===Number(o.input_qty),"Observation good+reject+held must equal input");assert(o.status!=="complete"||o.held_qty==="0","Complete stage cannot retain unresolved held pieces");text(o.source_ref,"observation source_ref");}
const sorted=[...t.observations].sort((a,b)=>instant(a.observed_at)-instant(b.observed_at)||(a.event_id<b.event_id?-1:1));const latest=new Map();
for(const o of sorted){const product=orders.get(batches.get(o.batch_id).order_id).product_id,route=routeMap.get(product),idx=route.findIndex(r=>r.stage_id===o.stage_id);if(idx>0){const prior=latest.get(JSON.stringify([o.batch_id,route[idx-1].stage_id]));assert(prior&&prior.status==="complete"&&instant(prior.observed_at)<instant(o.observed_at),"A downstream observation requires a completed upstream snapshot");assert(Number(o.input_qty)<=Number(prior.good_qty),"Downstream input exceeds observed upstream good");}latest.set(JSON.stringify([o.batch_id,o.stage_id]),o);}
for(const b of t.batches){const route=routeMap.get(orders.get(b.order_id).product_id);for(let i=1;i<route.length;i++){const curr=latest.get(JSON.stringify([b.batch_id,route[i].stage_id])),prior=latest.get(JSON.stringify([b.batch_id,route[i-1].stage_id]));if(curr)assert(prior?.status==="complete"&&Number(curr.input_qty)<=Number(prior.good_qty),"Current corrected upstream snapshot conflicts with downstream input");}}
return {tables:t,originals,settings:cfg,products,resources,orders,batches,routeMap,calendar:cal,sourceHash:hash({originals,settings:cfg})};}
function bodyHash(w){const x=clone(w);delete x.head;return hash(x);}function seal(w){w.head=bodyHash(w);return w;}
function create(o){assert(obj(o),"Workspace options required");return seal({schema:SCHEMA,id:id(o.id,"workspace id"),label:text(o.label,"workspace label"),editions:[],decisions:[]});}
function editionBody(o){assert(obj(o),"Edition options required");const c=compile(o.sources,o.settings);return {id:id(o.id,"edition id"),label:text(o.label,"edition label"),notes:text(o.notes??"","notes",true),settings:c.settings,sources:c.originals,sourceHash:c.sourceHash};}
function internalPlan(w,selection){assert(obj(selection),"Plan selection required");const e=w.editions.find(x=>x.id===selection.editionId);assert(e,"Edition not found");const c=compile(e.sources,e.settings),t=c.tables,asOf=date(selection.asOf||e.settings.asOf,"asOf"),as=day(asOf),attention=[];assert(as>=day(e.settings.asOf),"Plan asOf cannot precede the edition source snapshot date");
const cap=(rid,d)=>{const r=c.resources.get(rid),o=c.calendar.get(JSON.stringify([rid,iso(d)]));return o?Number(o.capacity):r.open_weekdays.split("|").map(Number).includes(weekday(d))?Number(r.daily_capacity):0;};
function backwards(rid,end,n,basis){const days=[];let d=end,guard=0;while(days.length<n){assert(++guard<100000,"Calendar search has no usable date within supported horizon");if(basis==="calendar"||cap(rid,d)>0)days.push(d);d--;}return days.reverse();}
function productionDate(o){let d=day(o.due_date),left=Number(o.transit_days),guard=0;const sc=e.settings.shippingCalendar;while(left>0){assert(++guard<100000,"Shipping calendar exhausted");d--;if(sc.openWeekdays.includes(weekday(d))&&!sc.closedDates.includes(iso(d)))left--;}return d;}
const obs=t.observations.filter(o=>day(o.local_date)<=as).sort((a,b)=>instant(a.observed_at)-instant(b.observed_at)||(a.event_id<b.event_id?-1:1)),latest=new Map();for(const o of obs)latest.set(JSON.stringify([o.batch_id,o.stage_id]),o);
const batches=[],stages=[],capacityMap=new Map();
const issue=(code,targetType,targetId,message,details={})=>attention.push({id:code+":"+targetId,code,targetType,targetId,message,...details});
for(const b of t.batches){const o=c.orders.get(b.order_id),route=c.routeMap.get(o.product_id),needed=[],stagePlans=[];let goal=Number(b.target_good),end=productionDate(o);
for(let i=route.length-1;i>=0;i--){const r=route[i],input=ceilYield(goal,Number(r.yield_bps)),days=backwards(r.resource_id,end,Number(r.duration_days),r.day_basis);needed[i]={input,output:goal,days};goal=input;end=days[0]-1;}
let forecast=goal,completed=0,finalActual=0,currentStage=null,previousCompletion=null;
for(let i=0;i<route.length;i++){const r=route[i],n=needed[i],snapshot=latest.get(JSON.stringify([b.batch_id,r.stage_id])),complete=snapshot?.status==="complete";let reservationInput=forecast,projectedOutput;
if(snapshot){reservationInput=Number(snapshot.input_qty);projectedOutput=complete?Number(snapshot.good_qty):add(Number(snapshot.good_qty),floorYield(Number(snapshot.held_qty),Number(r.yield_bps)));}else projectedOutput=floorYield(forecast,Number(r.yield_bps));
const days=(complete||reservationInput===0)?[]:n.days,units=mul(reservationInput,Number(r.units_per_piece)),status=complete?"complete":snapshot?"active":"unstarted";
if(complete){completed++;previousCompletion=day(snapshot.local_date);if(i===route.length-1)finalActual=Number(snapshot.good_qty);}else{if(currentStage===null)currentStage=r.stage_id;if(!snapshot&&n.days[0]<as)issue("latest_start_passed","batch",b.batch_id,"Declared latest start is before asOf for "+r.stage_id,{stageId:r.stage_id,latestStart:iso(n.days[0])});if(previousCompletion!==null&&n.days[0]<=previousCompletion)issue("upstream_late","batch",b.batch_id,"Observed upstream completion leaves no sequential space for the planned next stage.",{stageId:r.stage_id,previousCompletion:iso(previousCompletion),plannedStart:iso(n.days[0])});if(snapshot){const first=obs.find(x=>x.batch_id===b.batch_id&&x.stage_id===r.stage_id);if(first&&day(first.local_date)>n.days[0])issue("observed_stage_late","batch",b.batch_id,"First retained active observation is after latest start; review actual start and remaining duration.",{stageId:r.stage_id,firstObserved:first.local_date});}}
const sp={batchId:b.batch_id,orderId:o.order_id,productId:o.product_id,stageId:r.stage_id,sequence:Number(r.sequence),resourceId:r.resource_id,capacityUnit:c.resources.get(r.resource_id).capacity_unit,unitsPerPiece:Number(r.units_per_piece),compatibility:r.compatibility,durationDays:Number(r.duration_days),dayBasis:r.day_basis,yieldBps:Number(r.yield_bps),requiredInput:n.input,requiredOutput:n.output,scheduledInput:reservationInput,projectedOutput,status,latestStart:iso(n.days[0]),latestEnd:iso(n.days[n.days.length-1]),plannedDates:n.days.map(iso),reservationDates:days.map(iso),reservationUnits:units,observation:snapshot?clone(snapshot):null};stages.push(sp);stagePlans.push(sp);
for(const d of days){const key=JSON.stringify([r.resource_id,iso(d)]);if(!capacityMap.has(key))capacityMap.set(key,{id:key,resourceId:r.resource_id,date:iso(d),capacityUnit:c.resources.get(r.resource_id).capacity_unit,capacity:cap(r.resource_id,d),reserved:0,contributors:[],compatibilities:[]});const bucket=capacityMap.get(key);bucket.reserved=add(bucket.reserved,units);bucket.contributors.push({batchId:b.batch_id,orderId:o.order_id,stageId:r.stage_id,pieces:reservationInput,units,compatibility:r.compatibility});if(!bucket.compatibilities.includes(r.compatibility))bucket.compatibilities.push(r.compatibility);}
forecast=projectedOutput;}
if(forecast<Number(b.target_good))issue("yield_shortfall","batch",b.batch_id,"Observed quantities and declared remaining yields project fewer good pieces than the batch target.",{targetGood:Number(b.target_good),projectedGood:forecast,shortage:Number(b.target_good)-forecast});
batches.push({batchId:b.batch_id,orderId:o.order_id,productId:o.product_id,targetGood:Number(b.target_good),requiredInitialInput:goal,projectedGood:forecast,finalActualGood:finalActual,completedStages:completed,totalStages:route.length,currentStage,complete:completed===route.length,latestStart:stagePlans[0].latestStart,productionDue:iso(productionDate(o)),shipBy:o.due_basis==="ready"?null:iso(productionDate(o)),sourceRef:b.source_ref,stages:stagePlans});}
const capacity=[...capacityMap.values()].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:a.resourceId<b.resourceId?-1:1);for(const x of capacity){x.overload=Math.max(0,x.reserved-x.capacity);x.conflict=x.compatibilities.length>1;if(x.overload)issue("capacity_overload","capacity",x.id,"Declared reservations exceed comparable resource/day capacity.",{reserved:x.reserved,capacity:x.capacity,capacityUnit:x.capacityUnit,overload:x.overload});if(x.conflict)issue("compatibility_conflict","capacity",x.id,"Different maker-declared compatibility groups share the same resource/day.",{groups:x.compatibilities});}
const batchMap=new Map(batches.map(x=>[x.batchId,x]));for(const b of batches){const linked=t.stock.filter(s=>s.batch_id===b.batchId).reduce((n,s)=>add(n,Number(s.quantity)),0);assert(linked<=b.finalActualGood,"Linked ready stock exceeds final actual good as of selected date for "+b.batchId);}
const orders=t.orders.map(o=>{const bs=batches.filter(b=>b.orderId===o.order_id),stocks=t.stock.filter(s=>s.order_id===o.order_id),ready=stocks.filter(s=>!s.batch_id).reduce((n,s)=>add(n,Number(s.quantity)),0),target=Number(o.quantity),planned=bs.reduce((n,b)=>add(n,b.targetGood),0),actual=bs.reduce((n,b)=>add(n,b.finalActualGood),0),projected=bs.reduce((n,b)=>add(n,b.projectedGood),0),remaining=Math.max(0,target-ready),actualReady=add(ready,actual),forecastReady=add(ready,projected),allocationDelta=add(planned,-remaining);if(ready>target)issue("ready_overallocated","order",o.order_id,"Independent ready stock exceeds order quantity.",{ready,target});if(allocationDelta!==0)issue("batch_allocation","order",o.order_id,"Explicit batch targets differ from the remaining order requirement.",{remainingRequirement:remaining,batchTargetTotal:planned,allocationDelta});if(day(o.due_date)<as&&actualReady<target)issue("deadline_passed","order",o.order_id,"Order due date has passed and observed ready quantity remains short.",{dueDate:o.due_date,actualReady,target});return {orderId:o.order_id,productId:o.product_id,productName:c.products.get(o.product_id).name,quantity:target,dueDate:o.due_date,dueBasis:o.due_basis,transitDays:Number(o.transit_days),productionDue:iso(productionDate(o)),shipBy:o.due_basis==="ready"?null:iso(productionDate(o)),independentReady:ready,linkedReady:stocks.filter(s=>s.batch_id).reduce((n,s)=>add(n,Number(s.quantity)),0),batchTargetTotal:planned,remainingRequirement:remaining,allocationDelta,actualBatchGood:actual,actualReady,actualRemaining:Math.max(0,target-actualReady),projectedReady:forecastReady,projectedShortfall:Math.max(0,target-forecastReady),batchIds:bs.map(b=>b.batchId),stockRows:clone(stocks),sourceRef:o.source_ref};});
const fingerprint=hash({editionId:e.id,sourceHash:e.sourceHash,asOf}),history=w.decisions.filter(d=>d.fingerprint===fingerprint),current=new Map();for(const d of history)current.set(d.id,d);
return {schema:"maker.production-plan.v1",workspaceId:w.id,editionId:e.id,editionLabel:e.label,sourceHash:e.sourceHash,asOf,fingerprint,orders,batches,stages,capacity,observations:clone(obs),futureObservations:clone(t.observations.filter(o=>day(o.local_date)>as)),unallocatedStock:clone(t.stock.filter(s=>!s.order_id)),attention,decisions:[...current.values()].map(clone),decisionHistory:clone(history),summary:{orders:orders.length,batches:batches.length,stages:stages.length,actualReady:orders.reduce((n,o)=>add(n,o.actualReady),0),actualRemaining:orders.reduce((n,o)=>add(n,o.actualRemaining),0),projectedShortfall:orders.reduce((n,o)=>add(n,o.projectedShortfall),0),overloadedDays:capacity.filter(x=>x.overload>0).length,compatibilityDays:capacity.filter(x=>x.conflict).length,lateStarts:attention.filter(x=>x.code==="latest_start_passed").length,attention:attention.length}};}
function decisionBody(w,o){assert(obj(o),"Decision required");const p=internalPlan(w,o);id(o.id,"decision id");assert(["order","batch","capacity"].includes(o.targetType),"Unknown decision target type");const list=o.targetType==="order"?p.orders.map(x=>x.orderId):o.targetType==="batch"?p.batches.map(x=>x.batchId):p.capacity.map(x=>x.id);assert(list.includes(o.targetId),"Decision target absent from exact plan");assert(actions.includes(o.action),"Unknown decision action");text(o.reviewer,"reviewer");text(o.reason,"reason");text(o.evidence,"evidence",true);const old=w.decisions.filter(d=>d.id===o.id);assert(old.every(d=>d.fingerprint===p.fingerprint&&d.targetType===o.targetType&&d.targetId===o.targetId),"Decision correction must retain exact source/date/target");return {id:o.id,sequence:w.decisions.length+1,revision:old.length+1,editionId:p.editionId,asOf:p.asOf,sourceHash:p.sourceHash,fingerprint:p.fingerprint,targetType:o.targetType,targetId:o.targetId,action:o.action,reviewer:o.reviewer,reason:o.reason,evidence:o.evidence};}
function reopen(input){const w=typeof input==="string"?JSON.parse(input):clone(input);assert(obj(w)&&w.schema===SCHEMA,"Invalid workspace schema");id(w.id,"workspace id");text(w.label,"workspace label");assert(Array.isArray(w.editions)&&Array.isArray(w.decisions),"Invalid workspace containers");assert(w.head===bodyHash(w),"Workspace content hash differs");const fresh=create({id:w.id,label:w.label}),seen=new Set();for(const e of w.editions){assert(obj(e)&&!seen.has(e.id),"Invalid or duplicate edition");seen.add(e.id);const b=editionBody(e);assert(canonical(b)===canonical(e),"Edition source identity differs");fresh.editions.push(b);internalPlan(fresh,{editionId:b.id});}for(const d of w.decisions){const b=decisionBody(fresh,d);assert(canonical(b)===canonical(d),"Decision identity differs");fresh.decisions.push(b);}assert(canonical(seal(fresh))===canonical(w),"Unexpected workspace structure");return w;}
function addEdition(input,o){const w=reopen(input),e=editionBody(o);assert(!w.editions.some(x=>x.id===e.id),"Edition id exists");w.editions.push(e);internalPlan(w,{editionId:e.id});return seal(w);}
function plan(w,s){return internalPlan(reopen(w),s);}function decide(input,o){const w=reopen(input);w.decisions.push(decisionBody(w,o));return seal(w);}
function csvValue(v){let s=v===null||v===undefined?"":typeof v==="object"?JSON.stringify(v):String(v);if(typeof v!=="number"&&/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function csv(w,s,kind="orders"){const p=plan(w,s),a=kind==="decisions"?p.decisionHistory:p[kind];assert(["orders","stages","capacity","observations","decisions"].includes(kind),"Unknown CSV kind");const headers=a.length?Object.keys(a[0]):{orders:["orderId"],stages:["batchId","stageId"],capacity:["resourceId","date"],observations:["event_id"],decisions:["id"]}[kind];return [headers,...a.map(x=>headers.map(h=>x[h]))].map(r=>r.map(csvValue).join(",")).join("\r\n")+"\r\n";}
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function report(input,s){const w=reopen(input),p=internalPlan(w,s);return "<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>"+esc(w.label)+"</title><style>body{font:15px system-ui;max-width:1250px;margin:24px auto;padding:0 20px;color:#181818}table{border-collapse:collapse;width:100%}th,td{padding:8px;border:1px solid #bbb;text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f2f2;padding:12px}.scroll{overflow:auto}</style></head><body><h1>"+esc(w.label)+"</h1><p>"+esc(p.editionLabel)+" · as of "+p.asOf+"</p><p>Source-declared dates, yields and comparable reservation units. Actual ready stock, observed batch output and projected remaining yield stay distinct.</p><div class=scroll><table><tr>"+["Order","Product","Quantity","Production due","Actual ready","Remaining","Projected ready"].map(x=>"<th>"+x+"</th>").join("")+"</tr>"+p.orders.map(o=>"<tr>"+[o.orderId,o.productName,o.quantity,o.productionDue,o.actualReady,o.actualRemaining,o.projectedReady].map(x=>"<td>"+esc(x)+"</td>").join("")+"</tr>").join("")+"</table></div><h2>Complete production plan and review history</h2><pre>"+esc(JSON.stringify(p,null,2))+"</pre><h2>Original sources</h2>"+Object.entries(w.editions.find(e=>e.id===p.editionId).sources).map(([k,v])=>"<details><summary>"+esc(k+" · "+v.name+" · "+v.sha256)+"</summary><pre>"+esc(v.text)+"</pre></details>").join("")+"<h2>Complete retained workspace</h2><pre>"+esc(JSON.stringify(w,null,2))+"</pre></body></html>";}
return {create,addEdition,plan,decide,reopen,csv,report,sampleSources:{"products":{"name":"products.csv","text":"product_id,name\nMUG,Authored mug\nPLATE,Authored plate\n"},"resources":{"name":"resources.csv","text":"resource_id,name,capacity_unit,daily_capacity,open_weekdays\nFORM,Forming bench,declared bench units,30,1|2|3|4|5\nDRY,Drying shelf,declared shelf units,60,1|2|3|4|5|6|7\nKILN,Shared kiln reservation,declared shelf units,30,1|3|5\nGLAZE,Glaze bench,declared bench units,30,1|2|3|4|5\n"},"calendar":{"name":"calendar.csv","text":"resource_id,date,capacity,source_ref\nKILN,2026-10-30,0,Authored maker declared closure\n"},"routes":{"name":"routes.csv","text":"product_id,stage_id,sequence,duration_days,day_basis,resource_id,units_per_piece,yield_bps,compatibility\nMUG,form,1,2,resource-open,FORM,1,10000,shared-work\nMUG,dry,2,3,calendar,DRY,1,9000,shared-dry\nMUG,bisque,3,1,resource-open,KILN,1,9000,bisque-06\nMUG,glaze,4,1,resource-open,GLAZE,1,10000,shared-work\nMUG,fire,5,1,resource-open,KILN,1,9000,glaze-6\nPLATE,form,1,2,resource-open,FORM,2,10000,shared-work\nPLATE,dry,2,3,calendar,DRY,2,9000,shared-dry\nPLATE,bisque,3,1,resource-open,KILN,2,9000,bisque-06\nPLATE,glaze,4,1,resource-open,GLAZE,2,10000,shared-work\nPLATE,fire,5,1,resource-open,KILN,2,9000,glaze-10\n"},"orders":{"name":"orders.csv","text":"order_id,product_id,quantity,due_date,due_basis,transit_days,source_ref\nO-MUG,MUG,12,2026-11-02,delivery,2,Authored accepted order not a public lead-time promise\nO-PLATE,PLATE,8,2026-10-29,ship,0,Authored accepted ship date\n"},"stock":{"name":"stock.csv","text":"stock_id,product_id,quantity,order_id,batch_id,source_ref\nREADY-MUG,MUG,2,O-MUG,,Authored independent ready-stock count\nUNALLOC,MUG,1,,,Authored unallocated spare\n"},"batches":{"name":"batches.csv","text":"batch_id,order_id,target_good,source_ref\nB-MUG,O-MUG,10,Authored remaining mug allocation\nB-PLATE,O-PLATE,8,Authored plate allocation\n"},"observations":{"name":"observations.csv","text":"event_id,batch_id,stage_id,observed_at,local_date,status,input_qty,good_qty,reject_qty,held_qty,source_ref\n"}},sampleSettings:{"asOf":"2026-10-15","shippingCalendar":{"openWeekdays":[1,2,3,4,5],"closedDates":[]}},columns:clone(columns),actions:[...actions],hash,parseCSV};
}
