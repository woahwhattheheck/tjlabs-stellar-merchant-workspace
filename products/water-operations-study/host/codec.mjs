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
 for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(c<128)size++;else if(c<2048)size+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<s.length&&s.charCodeAt(i+1)>=0xdc00&&s.charCodeAt(i+1)<=0xdfff){size+=4;i++;}else size+=3;}
 const out=new Uint8Array(size);let p=0;
 for(let i=0;i<s.length;i++){let c=s.charCodeAt(i);if(c<128)out[p++]=c;else if(c<2048){out[p++]=192|(c>>6);out[p++]=128|(c&63);}else if(c>=0xd800&&c<=0xdbff&&i+1<s.length&&s.charCodeAt(i+1)>=0xdc00&&s.charCodeAt(i+1)<=0xdfff){c=0x10000+((c-0xd800)<<10)+(s.charCodeAt(++i)-0xdc00);out[p++]=240|(c>>18);out[p++]=128|((c>>12)&63);out[p++]=128|((c>>6)&63);out[p++]=128|(c&63);}else{out[p++]=224|(c>>12);out[p++]=128|((c>>6)&63);out[p++]=128|(c&63);}}
 return out;
}

const retainedCompleteSHA256=(()=>{const module={exports:{}};(function(module,exports){
/**
 * Strict UTF-8 SHA-256 for retained complete text, with no runtime imports.
 *
 * Bundled upstream: emn178/js-sha256 1.0.0, build/sha256.cjs
 * Commit: 9a54fb31d4594762987e1b5d175265f6bac921de
 * Upstream blob: e3a08633357cb7ca248e14751f9270d95fbbbdf2
 * The upstream source between the markers is unchanged.
 *
 * Upstream license:
 * Copyright (c) 2014-2026 Chen, Yi-Cyuan
 * 
 * MIT License
 * 
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 * 
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

// BEGIN UNCHANGED UPSTREAM SOURCE
/**
 * [js-sha256]{@link https://github.com/emn178/js-sha256}
 *
 * @version 1.0.0
 * @author Chen, Yi-Cyuan [emn178@gmail.com]
 * @copyright Chen, Yi-Cyuan 2014-2026
 * @license MIT
 */
'use strict';

var INPUT_ERROR = 'input is invalid type';
var FINALIZE_ERROR = 'finalize already called';

var ARRAY_BUFFER = typeof ArrayBuffer !== 'undefined';

var formatMessage = function (message) {
  var type = typeof message;
  if (type === 'string') {
    return [message, true];
  }
  if (Array.isArray(message)) {
    return [message, false];
  }
  if (ARRAY_BUFFER && message) {
    if (message.constructor === ArrayBuffer) {
      return [new Uint8Array(message), false];
    } else if (ArrayBuffer.isView(message)) {
      return [message, false];
    }
  }
  throw new Error(INPUT_ERROR);
};

var HEX_CHARS = '0123456789abcdef'.split('');
var EXTRA = [-2147483648, 8388608, 32768, 128];
var SHIFT = [24, 16, 8, 0];
var K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];
var OUTPUT_TYPES = ['hex', 'array', 'digest', 'arrayBuffer'];

var blocks = [];

var createOutputMethod = function (outputType, is224) {
  return function (message) {
    return new Sha256(is224, true).update(message)[outputType]();
  };
};

var createMethod = function (is224) {
  var method = createOutputMethod('hex', is224);
  method.create = function () {
    return new Sha256(is224);
  };
  method.update = function (message) {
    return method.create().update(message);
  };
  for (var i = 0; i < OUTPUT_TYPES.length; ++i) {
    var type = OUTPUT_TYPES[i];
    method[type] = createOutputMethod(type, is224);
  }
  return method;
};

var createHmacOutputMethod = function (outputType, is224) {
  return function (key, message) {
    return new HmacSha256(key, is224, true).update(message)[outputType]();
  };
};

var createHmacMethod = function (is224) {
  var method = createHmacOutputMethod('hex', is224);
  method.create = function (key) {
    return new HmacSha256(key, is224);
  };
  method.update = function (key, message) {
    return method.create(key).update(message);
  };
  for (var i = 0; i < OUTPUT_TYPES.length; ++i) {
    var type = OUTPUT_TYPES[i];
    method[type] = createHmacOutputMethod(type, is224);
  }
  return method;
};

function Sha256(is224, sharedMemory) {
  if (sharedMemory) {
    blocks[0] = blocks[16] = blocks[1] = blocks[2] = blocks[3] =
      blocks[4] = blocks[5] = blocks[6] = blocks[7] =
      blocks[8] = blocks[9] = blocks[10] = blocks[11] =
      blocks[12] = blocks[13] = blocks[14] = blocks[15] = 0;
    this.blocks = blocks;
  } else {
    this.blocks = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }

  if (is224) {
    this.h0 = 0xc1059ed8;
    this.h1 = 0x367cd507;
    this.h2 = 0x3070dd17;
    this.h3 = 0xf70e5939;
    this.h4 = 0xffc00b31;
    this.h5 = 0x68581511;
    this.h6 = 0x64f98fa7;
    this.h7 = 0xbefa4fa4;
  } else { // 256
    this.h0 = 0x6a09e667;
    this.h1 = 0xbb67ae85;
    this.h2 = 0x3c6ef372;
    this.h3 = 0xa54ff53a;
    this.h4 = 0x510e527f;
    this.h5 = 0x9b05688c;
    this.h6 = 0x1f83d9ab;
    this.h7 = 0x5be0cd19;
  }

  this.block = this.start = this.bytes = this.hBytes = 0;
  this.finalized = this.hashed = false;
  this.first = true;
  this.is224 = is224;
}

Sha256.prototype.update = function (message) {
  if (this.finalized) {
    throw new Error(FINALIZE_ERROR);
  }
  var result = formatMessage(message);
  message = result[0];
  var isString = result[1];
  var code, index = 0, i, length = message.length, blocks = this.blocks;
  while (index < length) {
    if (this.hashed) {
      this.hashed = false;
      blocks[0] = this.block;
      this.block = blocks[16] = blocks[1] = blocks[2] = blocks[3] =
        blocks[4] = blocks[5] = blocks[6] = blocks[7] =
        blocks[8] = blocks[9] = blocks[10] = blocks[11] =
        blocks[12] = blocks[13] = blocks[14] = blocks[15] = 0;
    }

    if (isString) {
      for (i = this.start; index < length && i < 64; ++index) {
        code = message.charCodeAt(index);
        if (code < 0x80) {
          blocks[i >>> 2] |= code << SHIFT[i++ & 3];
        } else if (code < 0x800) {
          blocks[i >>> 2] |= (0xc0 | (code >>> 6)) << SHIFT[i++ & 3];
          blocks[i >>> 2] |= (0x80 | (code & 0x3f)) << SHIFT[i++ & 3];
        } else if (code < 0xd800 || code >= 0xe000) {
          blocks[i >>> 2] |= (0xe0 | (code >>> 12)) << SHIFT[i++ & 3];
          blocks[i >>> 2] |= (0x80 | ((code >>> 6) & 0x3f)) << SHIFT[i++ & 3];
          blocks[i >>> 2] |= (0x80 | (code & 0x3f)) << SHIFT[i++ & 3];
        } else {
          code = 0x10000 + (((code & 0x3ff) << 10) | (message.charCodeAt(++index) & 0x3ff));
          blocks[i >>> 2] |= (0xf0 | (code >>> 18)) << SHIFT[i++ & 3];
          blocks[i >>> 2] |= (0x80 | ((code >>> 12) & 0x3f)) << SHIFT[i++ & 3];
          blocks[i >>> 2] |= (0x80 | ((code >>> 6) & 0x3f)) << SHIFT[i++ & 3];
          blocks[i >>> 2] |= (0x80 | (code & 0x3f)) << SHIFT[i++ & 3];
        }
      }
    } else {
      for (i = this.start; index < length && i < 64; ++index) {
        blocks[i >>> 2] |= message[index] << SHIFT[i++ & 3];
      }
    }

    this.lastByteIndex = i;
    this.bytes += i - this.start;
    if (i >= 64) {
      this.block = blocks[16];
      this.start = i - 64;
      this.hash();
      this.hashed = true;
    } else {
      this.start = i;
    }
  }
  if (this.bytes > 4294967295) {
    this.hBytes += this.bytes / 4294967296 << 0;
    this.bytes = this.bytes % 4294967296;
  }
  return this;
};

Sha256.prototype.finalize = function () {
  if (this.finalized) {
    return;
  }
  this.finalized = true;
  var blocks = this.blocks, i = this.lastByteIndex;
  blocks[16] = this.block;
  blocks[i >>> 2] |= EXTRA[i & 3];
  this.block = blocks[16];
  if (i >= 56) {
    if (!this.hashed) {
      this.hash();
    }
    blocks[0] = this.block;
    blocks[16] = blocks[1] = blocks[2] = blocks[3] =
      blocks[4] = blocks[5] = blocks[6] = blocks[7] =
      blocks[8] = blocks[9] = blocks[10] = blocks[11] =
      blocks[12] = blocks[13] = blocks[14] = blocks[15] = 0;
  }
  blocks[14] = this.hBytes << 3 | this.bytes >>> 29;
  blocks[15] = this.bytes << 3;
  this.hash();
};

Sha256.prototype.hash = function () {
  var a = this.h0, b = this.h1, c = this.h2, d = this.h3, e = this.h4, f = this.h5, g = this.h6,
    h = this.h7, blocks = this.blocks, j, s0, s1, maj, t1, t2, ch, ab, da, cd, bc;

  for (j = 16; j < 64; ++j) {
    // rightrotate
    t1 = blocks[j - 15];
    s0 = ((t1 >>> 7) | (t1 << 25)) ^ ((t1 >>> 18) | (t1 << 14)) ^ (t1 >>> 3);
    t1 = blocks[j - 2];
    s1 = ((t1 >>> 17) | (t1 << 15)) ^ ((t1 >>> 19) | (t1 << 13)) ^ (t1 >>> 10);
    blocks[j] = blocks[j - 16] + s0 + blocks[j - 7] + s1 << 0;
  }

  bc = b & c;
  for (j = 0; j < 64; j += 4) {
    if (this.first) {
      if (this.is224) {
        ab = 300032;
        t1 = blocks[0] - 1413257819;
        h = t1 - 150054599 << 0;
        d = t1 + 24177077 << 0;
      } else {
        ab = 704751109;
        t1 = blocks[0] - 210244248;
        h = t1 - 1521486534 << 0;
        d = t1 + 143694565 << 0;
      }
      this.first = false;
    } else {
      s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      ab = a & b;
      maj = ab ^ (a & c) ^ bc;
      ch = (e & f) ^ (~e & g);
      t1 = h + s1 + ch + K[j] + blocks[j];
      t2 = s0 + maj;
      h = d + t1 << 0;
      d = t1 + t2 << 0;
    }
    s0 = ((d >>> 2) | (d << 30)) ^ ((d >>> 13) | (d << 19)) ^ ((d >>> 22) | (d << 10));
    s1 = ((h >>> 6) | (h << 26)) ^ ((h >>> 11) | (h << 21)) ^ ((h >>> 25) | (h << 7));
    da = d & a;
    maj = da ^ (d & b) ^ ab;
    ch = (h & e) ^ (~h & f);
    t1 = g + s1 + ch + K[j + 1] + blocks[j + 1];
    t2 = s0 + maj;
    g = c + t1 << 0;
    c = t1 + t2 << 0;
    s0 = ((c >>> 2) | (c << 30)) ^ ((c >>> 13) | (c << 19)) ^ ((c >>> 22) | (c << 10));
    s1 = ((g >>> 6) | (g << 26)) ^ ((g >>> 11) | (g << 21)) ^ ((g >>> 25) | (g << 7));
    cd = c & d;
    maj = cd ^ (c & a) ^ da;
    ch = (g & h) ^ (~g & e);
    t1 = f + s1 + ch + K[j + 2] + blocks[j + 2];
    t2 = s0 + maj;
    f = b + t1 << 0;
    b = t1 + t2 << 0;
    s0 = ((b >>> 2) | (b << 30)) ^ ((b >>> 13) | (b << 19)) ^ ((b >>> 22) | (b << 10));
    s1 = ((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7));
    bc = b & c;
    maj = bc ^ (b & d) ^ cd;
    ch = (f & g) ^ (~f & h);
    t1 = e + s1 + ch + K[j + 3] + blocks[j + 3];
    t2 = s0 + maj;
    e = a + t1 << 0;
    a = t1 + t2 << 0;
    this.chromeBugWorkAround = true;
  }

  this.h0 = this.h0 + a << 0;
  this.h1 = this.h1 + b << 0;
  this.h2 = this.h2 + c << 0;
  this.h3 = this.h3 + d << 0;
  this.h4 = this.h4 + e << 0;
  this.h5 = this.h5 + f << 0;
  this.h6 = this.h6 + g << 0;
  this.h7 = this.h7 + h << 0;
};

Sha256.prototype.hex = function () {
  this.finalize();

  var h0 = this.h0, h1 = this.h1, h2 = this.h2, h3 = this.h3, h4 = this.h4, h5 = this.h5,
    h6 = this.h6, h7 = this.h7;

  var hex = HEX_CHARS[(h0 >>> 28) & 0x0F] + HEX_CHARS[(h0 >>> 24) & 0x0F] +
    HEX_CHARS[(h0 >>> 20) & 0x0F] + HEX_CHARS[(h0 >>> 16) & 0x0F] +
    HEX_CHARS[(h0 >>> 12) & 0x0F] + HEX_CHARS[(h0 >>> 8) & 0x0F] +
    HEX_CHARS[(h0 >>> 4) & 0x0F] + HEX_CHARS[h0 & 0x0F] +
    HEX_CHARS[(h1 >>> 28) & 0x0F] + HEX_CHARS[(h1 >>> 24) & 0x0F] +
    HEX_CHARS[(h1 >>> 20) & 0x0F] + HEX_CHARS[(h1 >>> 16) & 0x0F] +
    HEX_CHARS[(h1 >>> 12) & 0x0F] + HEX_CHARS[(h1 >>> 8) & 0x0F] +
    HEX_CHARS[(h1 >>> 4) & 0x0F] + HEX_CHARS[h1 & 0x0F] +
    HEX_CHARS[(h2 >>> 28) & 0x0F] + HEX_CHARS[(h2 >>> 24) & 0x0F] +
    HEX_CHARS[(h2 >>> 20) & 0x0F] + HEX_CHARS[(h2 >>> 16) & 0x0F] +
    HEX_CHARS[(h2 >>> 12) & 0x0F] + HEX_CHARS[(h2 >>> 8) & 0x0F] +
    HEX_CHARS[(h2 >>> 4) & 0x0F] + HEX_CHARS[h2 & 0x0F] +
    HEX_CHARS[(h3 >>> 28) & 0x0F] + HEX_CHARS[(h3 >>> 24) & 0x0F] +
    HEX_CHARS[(h3 >>> 20) & 0x0F] + HEX_CHARS[(h3 >>> 16) & 0x0F] +
    HEX_CHARS[(h3 >>> 12) & 0x0F] + HEX_CHARS[(h3 >>> 8) & 0x0F] +
    HEX_CHARS[(h3 >>> 4) & 0x0F] + HEX_CHARS[h3 & 0x0F] +
    HEX_CHARS[(h4 >>> 28) & 0x0F] + HEX_CHARS[(h4 >>> 24) & 0x0F] +
    HEX_CHARS[(h4 >>> 20) & 0x0F] + HEX_CHARS[(h4 >>> 16) & 0x0F] +
    HEX_CHARS[(h4 >>> 12) & 0x0F] + HEX_CHARS[(h4 >>> 8) & 0x0F] +
    HEX_CHARS[(h4 >>> 4) & 0x0F] + HEX_CHARS[h4 & 0x0F] +
    HEX_CHARS[(h5 >>> 28) & 0x0F] + HEX_CHARS[(h5 >>> 24) & 0x0F] +
    HEX_CHARS[(h5 >>> 20) & 0x0F] + HEX_CHARS[(h5 >>> 16) & 0x0F] +
    HEX_CHARS[(h5 >>> 12) & 0x0F] + HEX_CHARS[(h5 >>> 8) & 0x0F] +
    HEX_CHARS[(h5 >>> 4) & 0x0F] + HEX_CHARS[h5 & 0x0F] +
    HEX_CHARS[(h6 >>> 28) & 0x0F] + HEX_CHARS[(h6 >>> 24) & 0x0F] +
    HEX_CHARS[(h6 >>> 20) & 0x0F] + HEX_CHARS[(h6 >>> 16) & 0x0F] +
    HEX_CHARS[(h6 >>> 12) & 0x0F] + HEX_CHARS[(h6 >>> 8) & 0x0F] +
    HEX_CHARS[(h6 >>> 4) & 0x0F] + HEX_CHARS[h6 & 0x0F];
  if (!this.is224) {
    hex += HEX_CHARS[(h7 >>> 28) & 0x0F] + HEX_CHARS[(h7 >>> 24) & 0x0F] +
      HEX_CHARS[(h7 >>> 20) & 0x0F] + HEX_CHARS[(h7 >>> 16) & 0x0F] +
      HEX_CHARS[(h7 >>> 12) & 0x0F] + HEX_CHARS[(h7 >>> 8) & 0x0F] +
      HEX_CHARS[(h7 >>> 4) & 0x0F] + HEX_CHARS[h7 & 0x0F];
  }
  return hex;
};

Sha256.prototype.toString = Sha256.prototype.hex;

Sha256.prototype.digest = function () {
  this.finalize();

  var h0 = this.h0, h1 = this.h1, h2 = this.h2, h3 = this.h3, h4 = this.h4, h5 = this.h5,
    h6 = this.h6, h7 = this.h7;

  var arr = [
    (h0 >>> 24) & 0xFF, (h0 >>> 16) & 0xFF, (h0 >>> 8) & 0xFF, h0 & 0xFF,
    (h1 >>> 24) & 0xFF, (h1 >>> 16) & 0xFF, (h1 >>> 8) & 0xFF, h1 & 0xFF,
    (h2 >>> 24) & 0xFF, (h2 >>> 16) & 0xFF, (h2 >>> 8) & 0xFF, h2 & 0xFF,
    (h3 >>> 24) & 0xFF, (h3 >>> 16) & 0xFF, (h3 >>> 8) & 0xFF, h3 & 0xFF,
    (h4 >>> 24) & 0xFF, (h4 >>> 16) & 0xFF, (h4 >>> 8) & 0xFF, h4 & 0xFF,
    (h5 >>> 24) & 0xFF, (h5 >>> 16) & 0xFF, (h5 >>> 8) & 0xFF, h5 & 0xFF,
    (h6 >>> 24) & 0xFF, (h6 >>> 16) & 0xFF, (h6 >>> 8) & 0xFF, h6 & 0xFF
  ];
  if (!this.is224) {
    arr.push((h7 >>> 24) & 0xFF, (h7 >>> 16) & 0xFF, (h7 >>> 8) & 0xFF, h7 & 0xFF);
  }
  return arr;
};

Sha256.prototype.array = Sha256.prototype.digest;

Sha256.prototype.arrayBuffer = function () {
  this.finalize();

  var buffer = new ArrayBuffer(this.is224 ? 28 : 32);
  var dataView = new DataView(buffer);
  dataView.setUint32(0, this.h0);
  dataView.setUint32(4, this.h1);
  dataView.setUint32(8, this.h2);
  dataView.setUint32(12, this.h3);
  dataView.setUint32(16, this.h4);
  dataView.setUint32(20, this.h5);
  dataView.setUint32(24, this.h6);
  if (!this.is224) {
    dataView.setUint32(28, this.h7);
  }
  return buffer;
};

function HmacSha256(key, is224, sharedMemory) {
  var i, result = formatMessage(key);
  key = result[0];
  if (result[1]) {
    var bytes = [], length = key.length, index = 0, code;
    for (i = 0; i < length; ++i) {
      code = key.charCodeAt(i);
      if (code < 0x80) {
        bytes[index++] = code;
      } else if (code < 0x800) {
        bytes[index++] = (0xc0 | (code >>> 6));
        bytes[index++] = (0x80 | (code & 0x3f));
      } else if (code < 0xd800 || code >= 0xe000) {
        bytes[index++] = (0xe0 | (code >>> 12));
        bytes[index++] = (0x80 | ((code >>> 6) & 0x3f));
        bytes[index++] = (0x80 | (code & 0x3f));
      } else {
        code = 0x10000 + (((code & 0x3ff) << 10) | (key.charCodeAt(++i) & 0x3ff));
        bytes[index++] = (0xf0 | (code >>> 18));
        bytes[index++] = (0x80 | ((code >>> 12) & 0x3f));
        bytes[index++] = (0x80 | ((code >>> 6) & 0x3f));
        bytes[index++] = (0x80 | (code & 0x3f));
      }
    }
    key = bytes;
  }

  if (key.length > 64) {
    key = (new Sha256(is224, true)).update(key).array();
  }

  var oKeyPad = [], iKeyPad = [];
  for (i = 0; i < 64; ++i) {
    var b = key[i] || 0;
    oKeyPad[i] = 0x5c ^ b;
    iKeyPad[i] = 0x36 ^ b;
  }

  Sha256.call(this, is224, sharedMemory);

  this.update(iKeyPad);
  this.oKeyPad = oKeyPad;
  this.inner = true;
  this.sharedMemory = sharedMemory;
}
HmacSha256.prototype = new Sha256();

HmacSha256.prototype.finalize = function () {
  Sha256.prototype.finalize.call(this);
  if (this.inner) {
    this.inner = false;
    var innerHash = this.array();
    Sha256.call(this, this.is224, this.sharedMemory);
    this.update(this.oKeyPad);
    this.update(innerHash);
    Sha256.prototype.finalize.call(this);
  }
};

var sha256 = createMethod();
var sha224 = createMethod(true);
sha256.sha256 = sha256;
sha256.sha224 = sha224;
sha256.hmac = createHmacMethod();
sha224.hmac = createHmacMethod(true);

module.exports = sha256;
// END UNCHANGED UPSTREAM SOURCE

const connectedSha256Upstream = module.exports;

/**
 * Count exact UTF-8 bytes and reject unpaired UTF-16 surrogates.
 * Use this for text validation when no digest is needed.
 */
function utf8ByteLength(value) {
  if (typeof value !== 'string') throw new TypeError('utf8ByteLength requires a string');
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code >= 0xd800 && code <= 0xdfff) throw new TypeError('Unpaired UTF-16 surrogate');
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * Hash a complete well-formed UTF-16 string as its exact UTF-8 content bytes.
 * No normalization, byte-order mark insertion, newline conversion or I/O.
 * @returns {{bytes: number, sha256: string}}
 */
function sha256Utf8(value) {
  if (typeof value !== 'string') throw new TypeError('sha256Utf8 requires a string');
  const bytes = utf8ByteLength(value);
  // A separate hasher owns its working state for each invocation.
  const sha256 = connectedSha256Upstream.create().update(value).hex();
  return {bytes, sha256};
}

/** Hash exact binary source bytes with the same maintained upstream implementation. */
function sha256Bytes(value) {
  if (!(value instanceof Uint8Array)) throw new TypeError('sha256Bytes requires a Uint8Array');
  return {bytes: value.byteLength,
    sha256: connectedSha256Upstream.create().update(value).hex()};
}

/**
 * Incremental bytes with non-destructive SHA-256 snapshots.
 * The pinned upstream instance owns only primitive state and its blocks array.
 * Copy that state into a fresh upstream instance before hex() finalizes it;
 * the live instance continues accepting bytes. Upstream code remains unchanged.
 * No hash state or mutable input bytes escape this wrapper.
 */
function createSha256ByteHasher() {
  const live = connectedSha256Upstream.create();
  let bytes = 0;
  const api = Object.freeze({
    update(value) {
      if (!(value instanceof Uint8Array)) throw new TypeError('SHA-256 update requires a Uint8Array');
      if (!Number.isSafeInteger(bytes + value.byteLength)) throw new RangeError('SHA-256 byte count exceeds a safe integer');
      live.update(value);
      bytes += value.byteLength;
      return api;
    },
    digest() {
      const snapshot = connectedSha256Upstream.create();
      for (const key of Object.keys(live)) {
        const value = live[key];
        if (Array.isArray(value)) snapshot[key] = value.slice();
        else if (value === null || ['number', 'boolean', 'string', 'undefined'].includes(typeof value)) snapshot[key] = value;
        else throw new TypeError('The pinned SHA-256 state shape changed');
      }
      return {bytes, sha256: snapshot.hex()};
    },
  });
  return api;
}

module.exports = {sha256Utf8, sha256Bytes, utf8ByteLength, createSha256ByteHasher};


})(module,module.exports);return module.exports;})();
function sha256Bytes(bytes){return retainedCompleteSHA256.sha256Bytes(bytes instanceof Uint8Array?bytes:Uint8Array.from(bytes)).sha256;}
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

export {SOURCE_LIMIT_BYTES, fromBase64, toBase64, utf8Encode, utf8Decode, sha256Bytes, inflateGzip, gzipBytes, encodeApplicationCarrier, decodeNativeSourceDocuments, encodeNativeSourceDocuments};

// Complete-text digest cache; keys retain all bytes of the original UTF-8 input.
const TEXT_HASH_CACHE=new Map();let TEXT_HASH_BYTES=0;
function hashText(text){if(typeof text!=='string')throw Error('Complete hash input must be text');const old=TEXT_HASH_CACHE.get(text);if(old){TEXT_HASH_CACHE.delete(text);TEXT_HASH_CACHE.set(text,old);return old.sha256;}const bytes=utf8Encode(text),sha256=sha256Bytes(bytes),cost=text.length*2;if(cost<=16*1024*1024){while(TEXT_HASH_CACHE.size&&(TEXT_HASH_BYTES+cost>16*1024*1024||TEXT_HASH_CACHE.size>=128)){const key=TEXT_HASH_CACHE.keys().next().value;TEXT_HASH_BYTES-=TEXT_HASH_CACHE.get(key).cost;TEXT_HASH_CACHE.delete(key);}TEXT_HASH_CACHE.set(text,{sha256,cost});TEXT_HASH_BYTES+=cost;}return sha256;}
export {hashText};
