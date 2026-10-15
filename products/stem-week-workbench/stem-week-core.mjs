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


// The Weekly Reconciliation — the bloom→sales bridge.
//
// For any week, compare the stems you'll actually CUT (your bloom plan, by
// variety) against the stems you've already PROMISED (weddings + market +
// wholesale, by variety), then build CSA bouquets from whatever surplus is left.
// You get, by variety: the shortfall to BUY IN and the surplus to PUSH TO MARKET.
//
// This is the exact reconcile the Stemwise demo runs client-side at
// https://getstemwise.com/app.html — it's the Sunday-night stem math a
// farmer-florist otherwise does by hand across three spreadsheets.

const keyOf = (name, variety) => `${String(name).toLowerCase()}|${String(variety || '').toLowerCase()}`;

function rollup(items) {
  const map = {};
  for (const it of items) {
    const k = keyOf(it.name, it.variety);
    if (!map[k]) map[k] = { name: it.name, variety: it.variety || '', stems: 0 };
    map[k].stems += Number(it.stems) || 0;
  }
  return map;
}

/**
 * @param {{
 *   availability?: Array<{name:string, variety?:string, stems:number}>,  // what you'll cut
 *   demand?:       Array<{name:string, variety?:string, stems:number}>,  // what you've promised (named demand)
 *   csa?:          {shares:number, stemsPerShare:number} | null          // bouquets built from leftover surplus
 * }} input
 */
function reconcile({ availability = [], demand = [], csa = null } = {}) {
  const avail = rollup(availability);
  const dem = rollup(demand);

  const keys = new Set([...Object.keys(avail), ...Object.keys(dem)]);
  const rows = [...keys]
    .map((k) => {
      const cut = avail[k] ? avail[k].stems : 0;
      const need = dem[k] ? dem[k].stems : 0;
      const meta = avail[k] || dem[k];
      return { name: meta.name, variety: meta.variety, cut, need, net: cut - need };
    })
    .sort((a, b) => a.net - b.net); // shortfalls first

  let surplusPool = 0;
  let shortfallTotal = 0;
  const shortfalls = [];
  const surpluses = [];
  for (const r of rows) {
    if (r.net > 0) {
      surplusPool += r.net;
      surpluses.push({ ...r, surplus: r.net });
    } else if (r.net < 0) {
      shortfallTotal += -r.net;
      shortfalls.push({ ...r, buyIn: -r.net });
    }
  }

  const csaShares = csa ? Math.max(0, csa.shares || 0) : 0;
  const csaNeed = csaShares * (csa ? Math.max(0, csa.stemsPerShare || 0) : 0);
  const afterCsa = surplusPool - csaNeed;

  return {
    rows,
    surplusPool,
    shortfallTotal,
    shortfalls,                         // varieties you've overcommitted → buy these in
    surpluses,                          // varieties with extra → sell at market
    csaShares,
    csaNeed,
    csaCovered: afterCsa >= 0,
    marketLeftover: Math.max(0, afterCsa), // stems left to push to market after CSA is built
    csaShort: Math.max(0, -afterCsa),      // stems short of covering the CSA from surplus
  };
}


function createStemWeekCore(){
"use strict";
const codec=createArchiveCodec(), SCHEMA="stemwise.week-workspace.v1", MAX=BigInt(Number.MAX_SAFE_INTEGER);
const columns={varieties:["variety_id","crop","variety","role"],supply:["supply_id","variety_id","week_start","basis","stems","source_ref","origin"],recipes:["recipe_id","variety_id","stems_per_piece"],commitments:["commitment_id","week_start","channel","recipe_id","quantity","buffer_bps","status","priority","source_ref"]};
const origins=["own-grown","local-buy-in","other-buy-in","unspecified"], actions=["buy-in","reduce","substitute","accept-shortfall","hold"];
const clone=x=>JSON.parse(JSON.stringify(x)), obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const fail=m=>{throw new Error(m)}, assert=(x,m)=>{if(!x)fail(m)}, str=(x,n,blank=false)=>{assert(typeof x==="string"&&(blank||x.trim()!==""),n+" must be text");assert(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(x),n+" contains invalid Unicode");return x;};
function canonical(x){if(x===null||typeof x!=="object")return JSON.stringify(x);if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}";}
const hash=x=>codec.sha256(codec.utf8Encode(typeof x==="string"?x:canonical(x))), id=(x,n)=>{str(x,n);assert(x.length<=200&&!/[\u0000-\u001F]/.test(x),n+" is invalid");return x;};
function integer(x,n,min=0,max=Number.MAX_SAFE_INTEGER){assert(typeof x==="string"&&/^(0|[1-9][0-9]*)$/.test(x),n+" must be a canonical integer string");const b=BigInt(x);assert(b>=BigInt(min)&&b<=BigInt(max),n+" is outside its allowed range");return Number(b);}
const sum=(a,b)=>{const x=BigInt(a)+BigInt(b);assert(x<=MAX&&x>=-MAX,"Stem total exceeds exact safe integer range");return Number(x);};
const buffered=(a,b,p)=>{const x=(BigInt(a)*BigInt(b)*(10000n+BigInt(p))+9999n)/10000n;assert(x<=MAX,"Buffered demand exceeds exact safe integer range");return Number(x);};
function week(x){str(x,"week");assert(/^\d{4}-\d{2}-\d{2}$/.test(x),"Week must be an ISO local Monday date");const d=new Date(x+"T12:00:00Z");assert(Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x&&d.getUTCDay()===1,"Week must be a real Monday date");return x;}
function parseCSV(text,table){str(text,table+" source",true);let s=text.charCodeAt(0)===65279?text.slice(1):text;const rows=[];let row=[],cell="",quoted=false,after=false;
for(let i=0;i<s.length;i++){const ch=s[i];if(quoted){if(ch==='"'){if(s[i+1]==='"'){cell+='"';i++;}else{quoted=false;after=true;}}else cell+=ch;continue;}
if(ch==='"'){assert(cell===""&&!after,"Unexpected CSV quote in "+table);quoted=true;continue;}
if(ch===","||ch==="\n"||ch==="\r"){row.push(cell);cell="";after=false;if(ch!==","){if(ch==="\r"&&s[i+1]==="\n")i++;if(row.some(v=>v!==""))rows.push(row);row=[];}continue;}
assert(!after,"Characters after closing CSV quote in "+table);cell+=ch;}
assert(!quoted,"Unclosed CSV quote in "+table);if(cell!==""||row.length||after){row.push(cell);if(row.some(v=>v!==""))rows.push(row);}
assert(rows.length>0,table+" needs its header");const headers=rows.shift();assert(new Set(headers).size===headers.length,table+" has duplicate headers");
for(const h of columns[table])if(!(table==="supply"&&h==="origin"))assert(headers.includes(h),table+" missing column "+h);
assert(headers.every(h=>columns[table].includes(h)),table+" has unknown columns");
return rows.map((r,i)=>{assert(r.length===headers.length,table+" row "+(i+2)+" has wrong cell count");const o=Object.fromEntries(headers.map((h,j)=>[h,r[j]]));if(table==="supply"&&!headers.includes("origin"))o.origin="unspecified";return o;});}
function compile(sources){assert(obj(sources),"sources must contain four CSV originals");assert(Object.keys(sources).sort().join("|")===Object.keys(columns).sort().join("|"),"Exactly four source tables required");const tables={},originals={};
for(const t of Object.keys(columns)){const f=sources[t];assert(obj(f),"Source "+t+" is invalid");str(f.name,t+" filename");str(f.text,t+" original text",true);const bytes=codec.utf8Encode(f.text);originals[t]={name:f.name,text:f.text,bytes:bytes.length,sha256:codec.sha256(bytes)};tables[t]=parseCSV(f.text,t);}
const v=new Map(),r=new Map(),supIds=new Set(),cIds=new Set();
for(const row of tables.varieties){id(row.variety_id,"variety_id");assert(!v.has(row.variety_id),"Duplicate variety_id "+row.variety_id);str(row.crop,"crop");str(row.variety,"variety");str(row.role,"role",true);v.set(row.variety_id,row);}
for(const row of tables.supply){id(row.supply_id,"supply_id");assert(!supIds.has(row.supply_id),"Duplicate supply_id "+row.supply_id);supIds.add(row.supply_id);assert(v.has(row.variety_id),"Unknown supply variety "+row.variety_id);week(row.week_start);assert(["projected","actual"].includes(row.basis),"Unknown supply basis");integer(row.stems,"supply stems");str(row.source_ref,"supply source_ref");assert(origins.includes(row.origin),"Unknown supply origin");}
for(const row of tables.recipes){id(row.recipe_id,"recipe_id");assert(v.has(row.variety_id),"Unknown recipe variety "+row.variety_id);integer(row.stems_per_piece,"stems_per_piece",1);const key=JSON.stringify([row.recipe_id,row.variety_id]);assert(!r.has(key),"Duplicate recipe/variety line");r.set(key,row);}
const recipeIds=new Set(tables.recipes.map(x=>x.recipe_id));
for(const row of tables.commitments){id(row.commitment_id,"commitment_id");assert(!cIds.has(row.commitment_id),"Duplicate commitment_id "+row.commitment_id);cIds.add(row.commitment_id);week(row.week_start);assert(["wedding","csa","market","wholesale","other"].includes(row.channel),"Unknown commitment channel");assert(recipeIds.has(row.recipe_id),"Unknown commitment recipe "+row.recipe_id);integer(row.quantity,"commitment quantity",1);integer(row.buffer_bps,"buffer_bps",0,10000);integer(row.priority,"priority");assert(["confirmed","tentative","cancelled"].includes(row.status),"Unknown commitment status");str(row.source_ref,"commitment source_ref");}
return {tables,originals,sourceHash:hash(originals)};}
function bodyHash(w){const x=clone(w);delete x.head;return hash(x);}
function seal(w){w.head=bodyHash(w);return w;}
function create(o){assert(obj(o),"Workspace options required");return seal({schema:SCHEMA,id:id(o.id,"workspace id"),label:str(o.label,"workspace label"),editions:[],decisions:[]});}
function editionBody(o){assert(obj(o),"Edition options required");const c=compile(o.sources);return {id:id(o.id,"edition id"),label:str(o.label,"edition label"),notes:str(o.notes??"","edition notes",true),sources:c.originals,sourceHash:c.sourceHash};}
function internalPlan(w,sel){assert(obj(sel),"Plan selection required");const e=w.editions.find(x=>x.id===sel.editionId);assert(e,"Edition not found");const wk=week(sel.week),basis=sel.basis;assert(["projected","actual"].includes(basis),"Choose projected or actual");const {tables:t}=compile(e.sources);
const weeks=[...new Set([...t.supply,...t.commitments].map(x=>x.week_start))].sort();assert(weeks.includes(wk),"Selected week has no retained supply or commitment rows");const vars=new Map(t.varieties.map(x=>[x.variety_id,x]));const ss=t.supply.filter(x=>x.week_start===wk),cs=t.commitments.filter(x=>x.week_start===wk),used=new Set(ss.map(x=>x.variety_id));
const demand=new Map(),tentative=new Map(),commitments=cs.map(c=>{const lines=t.recipes.filter(r=>r.recipe_id===c.recipe_id).map(r=>{used.add(r.variety_id);const base=buffered(r.stems_per_piece,c.quantity,0),need=buffered(r.stems_per_piece,c.quantity,c.buffer_bps);if(c.status==="confirmed")demand.set(r.variety_id,sum(demand.get(r.variety_id)||0,need));if(c.status==="tentative")tentative.set(r.variety_id,sum(tentative.get(r.variety_id)||0,need));return {varietyId:r.variety_id,stemsPerPiece:Number(r.stems_per_piece),baseStems:base,bufferStems:need-base,demand:need};});return {...c,quantity:Number(c.quantity),bufferBps:Number(c.buffer_bps),priority:Number(c.priority),lines};}).sort((a,b)=>a.priority-b.priority||(a.commitment_id<b.commitment_id?-1:a.commitment_id>b.commitment_id?1:0));
const rows=[...used].sort().map(vid=>{const meta=vars.get(vid),sources=ss.filter(x=>x.variety_id===vid),os=[...new Set(sources.map(x=>x.origin))].sort().map(origin=>{const by=b=>{const v=sources.filter(x=>x.origin===origin&&x.basis===b);return v.length?v.reduce((n,x)=>sum(n,Number(x.stems)),0):null;};return {origin,projected:by("projected"),actual:by("actual"),sourceRefs:[...new Set(sources.filter(x=>x.origin===origin).map(x=>x.source_ref))]};});
const total=b=>{const x=os.filter(v=>v[b]!==null);return x.length?x.reduce((n,v)=>sum(n,v[b]),0):null;},missingOrigins=os.filter(x=>x[basis]===null).map(x=>x.origin),known=total(basis),complete=known!==null&&missingOrigins.length===0,firm=demand.get(vid)||0,delta=complete?sum(known,-firm):null,p=total("projected"),a=total("actual"),bothComplete=os.length>0&&os.every(x=>x.projected!==null&&x.actual!==null);
return {varietyId:vid,crop:meta.crop,variety:meta.variety,role:meta.role,projected:p,actual:a,originTotals:os,selectedSupply:known,selectedComplete:complete,missingOrigins,firmDemand:firm,tentativeDemand:tentative.get(vid)||0,delta,shortage:delta===null?null:Math.max(0,-delta),surplus:delta===null?null:Math.max(0,delta),actualMinusProjected:bothComplete?sum(a,-p):null,supplyRows:clone(sources)};});
const rowMap=new Map(rows.map(r=>[r.varietyId,r])),remaining=new Map(rows.map(r=>[r.varietyId,r.selectedComplete?r.selectedSupply:null])),pull=[];
for(const c of commitments.filter(x=>x.status==="confirmed"))for(const l of c.lines){const available=remaining.get(l.varietyId),allocated=available===null?null:Math.min(available,l.demand);if(allocated!==null)remaining.set(l.varietyId,available-allocated);pull.push({commitmentId:c.commitment_id,channel:c.channel,recipeId:c.recipe_id,quantity:c.quantity,priority:c.priority,sourceRef:c.source_ref,varietyId:l.varietyId,crop:rowMap.get(l.varietyId).crop,variety:rowMap.get(l.varietyId).variety,baseStems:l.baseStems,bufferStems:l.bufferStems,requiredStems:l.demand,allocatedStems:allocated,shortStems:allocated===null?null:l.demand-allocated,supplyBasis:basis});}
const shares=commitments.filter(x=>x.channel==="csa").map(c=>({commitmentId:c.commitment_id,week:wk,status:c.status,recipeId:c.recipe_id,shares:c.quantity,bufferBps:c.bufferBps,sourceRef:c.source_ref,lines:c.lines,allocation:pull.filter(x=>x.commitmentId===c.commitment_id)}));
const attention=[];for(const r of rows){if(!r.selectedComplete)attention.push({id:"missing:"+r.varietyId,targetType:"variety",targetId:r.varietyId,code:"selected_supply_missing",message:"Selected "+basis+" counts are missing"+(r.missingOrigins.length?" for origin "+r.missingOrigins.join(", "):"")+"; an explicit zero is different.",quantity:null});if(r.shortage>0)attention.push({id:"short:"+r.varietyId,targetType:"variety",targetId:r.varietyId,code:"shortage",message:"Firm exact-variety demand exceeds complete selected-basis supply.",quantity:r.shortage});}
for(const c of commitments.filter(x=>x.status==="tentative"))attention.push({id:"tentative:"+c.commitment_id,targetType:"commitment",targetId:c.commitment_id,code:"tentative",message:"Tentative scenario is excluded from firm demand and harvest pull.",quantity:c.quantity});
const selection={editionId:e.id,week:wk,basis,sourceHash:e.sourceHash},fingerprint=hash(selection);
const history=w.decisions.filter(d=>d.fingerprint===fingerprint),current=new Map();for(const d of history)current.set(d.id,d);
const eligible=rows.filter(r=>r.selectedComplete),key=x=>Array.from(codec.utf8Encode(x)).map(x=>x.toString(16).padStart(2,"0")).join("");
const vendorResult=reconcile({availability:eligible.map(r=>({name:key(r.varietyId),variety:"",stems:r.selectedSupply})),demand:eligible.map(r=>({name:key(r.varietyId),variety:"",stems:r.firmDemand})),csa:null});
return {schema:"stemwise.week-plan.v1",workspaceId:w.id,editionId:e.id,editionLabel:e.label,sourceHash:e.sourceHash,week:wk,basis,fingerprint,weeks,rows,commitments,pull,shares,attention,decisions:[...current.values()].map(clone),decisionHistory:clone(history),summary:{varieties:rows.length,confirmedCommitments:commitments.filter(x=>x.status==="confirmed").length,tentativeCommitments:commitments.filter(x=>x.status==="tentative").length,cancelledCommitments:commitments.filter(x=>x.status==="cancelled").length,knownSelectedSupply:rows.reduce((n,r)=>sum(n,r.selectedSupply||0),0),firmDemand:rows.reduce((n,r)=>sum(n,r.firmDemand),0),knownShortage:rows.reduce((n,r)=>sum(n,r.shortage||0),0),knownSurplus:rows.reduce((n,r)=>sum(n,r.surplus||0),0),incompleteVarieties:rows.filter(x=>!x.selectedComplete).length},vendorComparison:{scope:"Only complete selected-basis variety counts; exact IDs encoded as UTF8 hex to preserve identity under vendor lowercase keys; CSA recipes included in firm named demand.",includedVarietyIds:eligible.map(x=>x.varietyId),excludedVarietyIds:rows.filter(r=>!r.selectedComplete).map(x=>x.varietyId),result:vendorResult}};
}
function decisionBody(w,o){assert(obj(o),"Decision required");const p=internalPlan(w,o);id(o.id,"decision id");assert(["variety","commitment"].includes(o.targetType),"Decision target type is invalid");id(o.targetId,"decision target");
assert(o.targetType==="variety"?p.rows.some(r=>r.varietyId===o.targetId):p.commitments.some(c=>c.commitment_id===o.targetId),"Decision target is absent from this exact source plan");assert(actions.includes(o.action),"Unknown decision action");str(o.reviewer,"reviewer");str(o.reason,"reason");str(o.evidence,"evidence",true);const quantity=o.quantity===null||o.quantity===undefined||o.quantity===""?null:String(integer(o.quantity,"decision quantity"));
const previous=w.decisions.filter(d=>d.id===o.id);if(previous.length)assert(previous.every(d=>d.fingerprint===p.fingerprint&&d.targetType===o.targetType&&d.targetId===o.targetId),"A correction ID must keep its exact source selection and target");
return {id:o.id,sequence:w.decisions.length+1,revision:previous.length+1,editionId:p.editionId,week:p.week,basis:p.basis,sourceHash:p.sourceHash,fingerprint:p.fingerprint,targetType:o.targetType,targetId:o.targetId,action:o.action,reviewer:o.reviewer,reason:o.reason,quantity,evidence:o.evidence};}
function reopen(input){const w=typeof input==="string"?JSON.parse(input):clone(input);assert(obj(w)&&w.schema===SCHEMA,"Invalid workspace schema");id(w.id,"workspace id");str(w.label,"workspace label");assert(Array.isArray(w.editions)&&Array.isArray(w.decisions),"Workspace editions/decisions must be arrays");assert(w.head===bodyHash(w),"Workspace content hash differs");
const seen=new Set(),fresh=create({id:w.id,label:w.label});for(const e of w.editions){assert(obj(e),"Invalid edition");assert(!seen.has(e.id),"Duplicate edition id");seen.add(e.id);const b=editionBody(e);assert(canonical(b)===canonical(e),"Edition original/source identity differs");fresh.editions.push(b);}
for(const d of w.decisions){const expected=decisionBody(fresh,d);assert(canonical(expected)===canonical(d),"Decision identity or history differs");fresh.decisions.push(expected);}
assert(canonical(seal(fresh))===canonical(w),"Unexpected workspace structure");return w;}
function addEdition(input,o){const w=reopen(input),e=editionBody(o);assert(!w.editions.some(x=>x.id===e.id),"Edition id already exists");w.editions.push(e);return seal(w);}
function plan(input,selection){return internalPlan(reopen(input),selection);}
function decide(input,o){const w=reopen(input);w.decisions.push(decisionBody(w,o));return seal(w);}
function csvValue(x){let v=x===null||x===undefined?"":typeof x==="object"?JSON.stringify(x):String(x);if(typeof x!=="number"&&/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';}
function csv(input,selection,kind="reconciliation"){const p=plan(input,selection);let headers,rows;
if(kind==="reconciliation"){headers=["week","basis","variety_id","crop","variety","selected_supply","selected_complete","firm_demand","tentative_demand","delta","shortage","surplus","projected","actual","actual_minus_projected","origin_totals","source_hash"];rows=p.rows.map(r=>[p.week,p.basis,r.varietyId,r.crop,r.variety,r.selectedSupply,r.selectedComplete,r.firmDemand,r.tentativeDemand,r.delta,r.shortage,r.surplus,r.projected,r.actual,r.actualMinusProjected,r.originTotals,p.sourceHash]);}
else if(kind==="pull"){headers=["week","basis","commitment_id","channel","recipe_id","pieces","priority","variety_id","crop","variety","base_stems","buffer_stems","required_stems","allocated_stems","short_stems","source_ref"];rows=p.pull.map(r=>[p.week,p.basis,r.commitmentId,r.channel,r.recipeId,r.quantity,r.priority,r.varietyId,r.crop,r.variety,r.baseStems,r.bufferStems,r.requiredStems,r.allocatedStems,r.shortStems,r.sourceRef]);}
else if(kind==="shares"){headers=["week","commitment_id","status","recipe_id","shares","buffer_bps","recipe_lines","allocation","source_ref"];rows=p.shares.map(r=>[r.week,r.commitmentId,r.status,r.recipeId,r.shares,r.bufferBps,r.lines,r.allocation,r.sourceRef]);}
else if(kind==="decisions"){headers=["id","sequence","revision","edition_id","week","basis","target_type","target_id","action","quantity","reviewer","reason","evidence","source_hash"];rows=p.decisionHistory.map(r=>[r.id,r.sequence,r.revision,r.editionId,r.week,r.basis,r.targetType,r.targetId,r.action,r.quantity,r.reviewer,r.reason,r.evidence,r.sourceHash]);}
else fail("Unknown CSV kind");return [headers,...rows].map(r=>r.map(csvValue).join(",")).join("\r\n")+"\r\n";}
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function report(input,selection){const w=reopen(input),p=internalPlan(w,selection),cell=x=>"<td>"+esc(x===null?"Missing":x)+"</td>";return "<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>"+esc(w.label)+"</title><style>body{font:15px system-ui;max-width:1300px;margin:24px auto;padding:0 20px;color:#171717}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #bbb;padding:7px;text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f3f3;padding:12px}.scroll{overflow:auto}h1{font-size:26px}</style></head><body><h1>"+esc(w.label)+"</h1><p>"+esc(p.editionLabel)+" · "+p.week+" · "+p.basis+" stems</p><p>Confirmed demand uses explicit exact-variety recipes. Missing counts remain missing; tentative scenarios and recorded decisions are shown separately. Origin totals distinguish own-grown and bought-in stems.</p><div class=scroll><table><thead><tr>"+["Variety ID","Crop / variety","Known supply","Complete","Firm","Tentative","Delta","Short","Surplus","Projected","Actual"].map(x=>"<th>"+x+"</th>").join("")+"</tr></thead><tbody>"+p.rows.map(r=>"<tr>"+[r.varietyId,r.crop+" / "+r.variety,r.selectedSupply,r.selectedComplete,r.firmDemand,r.tentativeDemand,r.delta,r.shortage,r.surplus,r.projected,r.actual].map(cell).join("")+"</tr>").join("")+"</tbody></table></div><h2>Attention and complete plan</h2><pre>"+esc(JSON.stringify(p,null,2))+"</pre><h2>Original sources in this edition</h2>"+Object.entries(w.editions.find(x=>x.id===p.editionId).sources).map(([k,v])=>"<details><summary>"+esc(k+" · "+v.name+" · "+v.bytes+" bytes · "+v.sha256)+"</summary><pre>"+esc(v.text)+"</pre></details>").join("")+"<h2>Complete retained workspace</h2><pre>"+esc(JSON.stringify(w,null,2))+"</pre></body></html>";}
return {create,addEdition,plan,decide,reopen,csv,report,sampleSources:{"varieties":{"name":"varieties.csv","text":"variety_id,crop,variety,role\r\nROSE,rose,White O'Hara,focal\r\nZIN,zinnia,Benary White,secondary\r\nBAS,basil,Cinnamon,greenery\r\nDAH,dahlia,Cafe au Lait,premium\r\n"},"supply":{"name":"weekly-supply.csv","text":"supply_id,variety_id,week_start,basis,stems,source_ref,origin\nRP,ROSE,2026-10-19,projected,40,Authored bed forecast A,own-grown\nRA,ROSE,2026-10-19,actual,30,Authored cut sheet A,own-grown\nRBP,ROSE,2026-10-19,projected,4,Authored local grower forecast,local-buy-in\nRBA,ROSE,2026-10-19,actual,4,Authored received local bunch,local-buy-in\nZP,ZIN,2026-10-19,projected,25,Authored bed forecast B,own-grown\nZA,ZIN,2026-10-19,actual,0,Authored measured zero B,own-grown\nBP,BAS,2026-10-19,projected,12,Authored bed forecast C,own-grown\nDP,DAH,2026-10-19,projected,5,Authored bed forecast D,own-grown\nDA,DAH,2026-10-19,actual,5,Authored cut sheet D,own-grown\n"},"recipes":{"name":"chosen-recipes.csv","text":"recipe_id,variety_id,stems_per_piece\nWEDDING,ROSE,8\nWEDDING,ZIN,3\nCSA,ROSE,4\nCSA,ZIN,2\nCSA,BAS,1\nMARKET,ROSE,10\nPREMIUM,DAH,4\n"},"commitments":{"name":"weekly-commitments.csv","text":"commitment_id,week_start,channel,recipe_id,quantity,buffer_bps,status,priority,source_ref\nW01,2026-10-19,wedding,WEDDING,2,1250,confirmed,0,Authored agreed wedding recipe\nC01,2026-10-19,csa,CSA,3,0,confirmed,1,Authored scheduled three-share pickup\nM01,2026-10-19,market,MARKET,1,0,confirmed,2,Authored firm market preparation\nT01,2026-10-19,wholesale,PREMIUM,2,0,tentative,3,Authored optional quote scenario\nX01,2026-10-19,wedding,WEDDING,1,0,cancelled,4,Authored cancellation retained\n"}},columns:clone(columns),origins:[...origins],actions:[...actions],parseCSV,hash};
}

export { createStemWeekCore };
