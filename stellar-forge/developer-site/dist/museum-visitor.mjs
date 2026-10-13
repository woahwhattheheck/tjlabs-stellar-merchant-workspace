// MIT. Complete offline visitor presentation and public-control receiving.
// Public control helpers are copied from the maintained museum-delivery.mjs, without staff evidence.
function visitorControlModel(){
const clone=v=>JSON.parse(JSON.stringify(v)),plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function museumCanonical(v){
 if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
 if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(museumCanonical).join(',')+']';
 if(plain(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+museumCanonical(v[k])).join(',')+'}';
 fail('Use complete finite JSON values.');
}
const same=(a,b)=>museumCanonical(a)===museumCanonical(b);
function fail(message){throw Object.assign(Error(message),{code:'MUSEUM_DELIVERY'});}
function text(v,label,max=20000,required=false){if(typeof v!=='string'||v.length>max||/[\u0000]/.test(v)||required&&!v.trim())fail(label+' needs complete ordinary text.');return v;}
function time(v,label='Recorded time'){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))fail(label+' needs an explicit ISO timestamp.');return v;}
function rows(v,label,max=20000){if(!Array.isArray(v)||v.length>max)fail(label+' exceeds the retained record limit.');return v;}
function unique(v,label,max=20000){rows(v,label,max);if(new Set(v).size!==v.length)fail(label+' repeats an identity.');return v;}
function standard(r){if(!plain(r)||!uuid(r.id))fail('Keep the original record UUID.');text(r.actor,'Actual operator',200,true);time(r.createdAt);}
function ref(map,id,label){if(!map.has(id))fail(label+' is absent from the complete original record.');return map.get(id);}
function url(v,label){text(v,label,12000,true);let u;try{u=new URL(v);}catch{fail(label+' needs an absolute HTTP(S) URL.');}if(!['https:','http:'].includes(u.protocol)||u.username||u.password)fail(label+' needs an HTTP(S) URL without credentials.');}
function unionRows(target,source){
 const by=new Map(target.map(r=>[r.id,r]));
 for(const r of source){if(by.has(r.id)){if(!same(by.get(r.id),r))fail('An immutable museum record changed across received histories.');}else{const c=clone(r);target.push(c);by.set(c.id,c);}}
}
function validateMuseumControl(control,workspaceId=null){
 if(!plain(control)||Object.keys(control).some(k=>!['schema','workspaceId','withdrawals'].includes(k))||control.schema!=='stellar-forge.museum-control.v1'||!uuid(control.workspaceId)||workspaceId!==null&&control.workspaceId!==workspaceId)fail('Use a complete control for this original workspace.');
 const ids=new Set();for(const w of rows(control.withdrawals,'Current withdrawals',20000)){
  if(!plain(w)||!uuid(w.id)||Object.keys(w).some(k=>!['id','keys','assetIds','createdAt'].includes(k)))fail('A visitor control contains an invalid identity or private fields.');time(w.createdAt);if(ids.has(w.id))fail('A withdrawal identity repeats.');ids.add(w.id);
  unique(w.keys,'Withdrawn content keys');unique(w.assetIds,'Withdrawn media');if(!w.keys.length&&!w.assetIds.length)fail('A withdrawal needs its original targets.');
  for(const k of w.keys)text(k,'Content key',12000,true);for(const id of w.assetIds)if(!/^media-[a-f0-9]{64}$/.test(id))fail('Keep the original withdrawn media identity.');
 }
 museumCanonical(control);return control;
}
function mergeMuseumControls(existing,incoming){
 validateMuseumControl(existing);validateMuseumControl(incoming,existing.workspaceId);
 const result=clone(existing);unionRows(result.withdrawals,incoming.withdrawals);result.withdrawals.sort((a,b)=>a.id.localeCompare(b.id));return result;
}

async function museumDigest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(museumCanonical(value)))),b=>b.toString(16).padStart(2,'0')).join('');}
return {validateMuseumControl,mergeMuseumControls,museumCanonical,museumDigest};
}
function visitorByteHasher(){const module={exports:{}};
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
return module.exports.create();
}
function museumVisitorRuntime(config,C,createHasher){
'use strict';
const {manifest,control,manifestSha256}=config,$=id=>document.getElementById(id),node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
let current=null,db=null,ready=false,index=0,query='',page=0,verified=null,serial=Promise.resolve(),urls=[],generation=0,channel=null,verifiedCaptions=new Map(),controlEpoch=0,pendingControls=[];
const fail=m=>{throw Error(m);},equal=(a,b)=>C.museumCanonical(a)===C.museumCanonical(b);
const pathFor=a=>{if(!a||a.id!=='media-'+a.sha256||!new RegExp('^media/'+a.sha256+'\\.[a-z0-9]{1,12}$').test(a.path))fail('An original media path is invalid.');return a.path;};
const assets=new Map();
const notice=(text,error=false)=>{$('operator-notice').textContent=text;$('operator-notice').className=error?'notice error':'notice';};
const download=(name,value)=>{const bytes=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',url=URL.createObjectURL(new Blob([bytes],{type:'application/json'})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
async function digestFile(file,epoch){const h=createHasher();let bytes=0;for(let offset=0;offset<file.size;offset+=1024*1024){if(epoch!==controlEpoch)fail('Media verification stopped so the supplied endpoint controls can be reconciled.');const chunk=new Uint8Array(await file.slice(offset,offset+1024*1024).arrayBuffer());if(epoch!==controlEpoch)fail('Media verification stopped so the supplied endpoint controls can be reconciled.');h.update(chunk);bytes+=chunk.length;}if(bytes!==file.size)fail('The selected file changed during verification.');if(epoch!==controlEpoch)fail('The endpoint controls changed during media verification.');return h.hex();}
function updateStatus(){refreshStatus().catch(e=>{ready=false;notice('Endpoint status could not be verified: '+e.message,true);$('ack-applied').disabled=true;});}
function enqueue(fn){serial=serial.then(async()=>{const controls=[...document.querySelectorAll('#operator-panel button,#operator-panel input')].filter(e=>!['control-file','import-control','download-control','download-pending-control','retry-control'].includes(e.id));for(const e of controls)e.disabled=true;try{await fn();}catch(e){notice(e.message,true);}finally{for(const e of controls)e.disabled=false;try{await refreshStatus();}catch(e){ready=false;notice(e.message,true);$('ack-applied').disabled=true;}}});return serial;}
function openControls(){
 return new Promise((resolve,reject)=>{const request=indexedDB.open('stellar-forge-museum-endpoint-v1',1);let failed=false;request.onupgradeneeded=()=>request.result.createObjectStore('controls',{keyPath:'workspaceId'});request.onblocked=()=>{failed=true;reject(Error('Close the older endpoint tab before opening its retained controls.'));};request.onerror=()=>reject(request.error);request.onsuccess=()=>{const result=request.result;if(failed){result.close();return;}result.onversionchange=()=>{result.close();ready=false;render();notice('Endpoint storage changed. Reopen this display before use.',true);};resolve(result);};});
}
function retain(incoming){
 C.validateMuseumControl(incoming,manifest.workspaceId);
 return new Promise((resolve,reject)=>{const tx=db.transaction('controls','readwrite'),store=tx.objectStore('controls');let result,error,changed=false;const request=store.get(manifest.workspaceId);
 request.onsuccess=()=>{try{const previous=request.result||control;result=C.mergeMuseumControls(previous,incoming);if(current)result=C.mergeMuseumControls(result,current);changed=!request.result||!equal(result,request.result);store.put(result);}catch(e){error=e;tx.abort();}};
 tx.oncomplete=()=>{if(changed)channel?.postMessage({workspaceId:manifest.workspaceId});resolve(result);};tx.onerror=()=>reject(error||tx.error);tx.onabort=()=>reject(error||tx.error||Error('The original endpoint control was not retained.'));});
}
// A known control change closes the display before any queued file work.
// Exact supplied candidates remain available until all have been committed.
function suspendControls(message,incoming=null){
 if(incoming){C.validateMuseumControl(incoming,manifest.workspaceId);const exact=C.museumCanonical(incoming);if(!pendingControls.some(row=>C.museumCanonical(row)===exact))pendingControls.push(incoming);}
 controlEpoch++;ready=false;verified=null;verifiedCaptions.clear();render();notice(message,true);
}
async function reconcileControls(message){
 if(!db)fail('Endpoint storage is not open. Keep the supplied control file and reopen the display.');
 const epoch=controlEpoch,batch=pendingControls.slice();let merged=await retain(control);
 for(const incoming of batch)merged=await retain(incoming);
 current=merged;
 if(epoch!==controlEpoch){render();return false;}
 pendingControls=pendingControls.filter(row=>!batch.includes(row));ready=pendingControls.length===0;render();notice(message);return ready;
}
async function importSuppliedControl(){
 const f=$('control-file').files[0];if(!f)fail('Choose the complete supplied control file.');
 if(f.size>64*1024*1024)fail('The supplied control exceeds the complete workspace allowance.');
 const value=JSON.parse(await f.text()),incoming=value?.schema==='stellar-forge.museum-control-recovery.v1'?value.controls:[value];
 if(value?.schema==='stellar-forge.museum-control-recovery.v1'&&(value.workspaceId!==manifest.workspaceId||!Array.isArray(incoming)||!incoming.length||incoming.length>1000))fail('Choose a complete pending-control recovery for this original workspace.');
 for(const candidate of incoming)C.validateMuseumControl(candidate,manifest.workspaceId);
 for(const candidate of incoming)suspendControls('Display paused while the supplied controls are retained. If storage fails, retry or download the complete pending controls.',candidate);
 await enqueue(()=>reconcileControls('Retained and applied the supplied restrictions. Its delivery does not establish knowledge of any later disconnected changes.'));
}
function expired(){return Date.now()>=Date.parse(manifest.expiresAt);}
function visible(){const keys=new Set(),ids=new Set();for(const w of current?.withdrawals||[]) {for(const k of w.keys)keys.add(k);for(const a of w.assetIds)ids.add(a);}return manifest.release.items.filter(i=>!keys.has(i.key)&&!i.mediaIds.some(id=>ids.has(id))&&(!i.captionsMediaId||!ids.has(i.captionsMediaId)));}
function clearMedia(){for(const media of document.querySelectorAll('#visitor-content audio,#visitor-content video')){media.pause();media.removeAttribute('src');media.load();}for(const u of urls)URL.revokeObjectURL(u);urls=[];}
function noteText(text){const p=node('p',text);p.className='media-notice';return p;}
function media(item){
 const wrap=node('div');wrap.className='media-list';
 for(const id of item.mediaIds){const a=assets.get(id);if(!a){wrap.append(noteText('A required media record is missing. Ask an operator.'));continue;}const box=node('figure'),path=pathFor(a);let e;
 if(a.mime.startsWith('image/')){e=node('img');e.src=path;e.alt=item.alt;e.loading='lazy';e.onerror=()=>{e.hidden=true;box.append(noteText('This image is unavailable. '+item.alt));};}
 else if(/^(audio|video)\//.test(a.mime)){const video=a.mime.startsWith('video/');e=node(video?'video':'audio');e.controls=true;e.preload='metadata';e.autoplay=false;e.setAttribute('aria-label',item.title);e.src=path;e.onerror=()=>box.append(noteText('This recording is unavailable. Its full transcript is below.'));
 if(video&&item.captionsMediaId){const caption=assets.get(item.captionsMediaId),track=node('track');track.kind='captions';track.label='Supplied captions';track.default=true;track.src=pathFor(caption);if(verifiedCaptions.has(caption.id)){const url=URL.createObjectURL(verifiedCaptions.get(caption.id));urls.push(url);track.src=url;}track.onerror=()=>{e.pause();e.hidden=true;box.append(noteText('The caption file could not be opened in this browser. The full transcript remains below; ask staff to use the approved local display host or verify the extracted media folder.'));};e.append(track);}
 }else{e=node('a','Open supplied '+a.mime+' file');e.href=path;e.download=path.split('/').pop();e.rel='noopener';}
 box.append(e);if(item.credit)box.append(node('figcaption',item.credit));wrap.append(box);
 }
 if(item.transcript){const d=node('details'),s=node('summary','Read the complete transcript'),p=node('p',item.transcript);p.className='transcript';d.append(s,p);wrap.append(d);}
 return wrap;
}
function detail(item){
 const article=node('article');article.className='visitor-item';article.append(node('h2',item.title));if(item.summary){const p=node('p',item.summary);p.className='summary';article.append(p);}article.append(media(item));return article;
}
function render(){
 generation++;clearMedia();const root=$('visitor-content');root.replaceChildren();$('visitor-title').textContent=manifest.release.title;$('visitor-introduction').textContent=manifest.release.introduction||'';
 $('browse-controls').hidden=manifest.endpoint.family!=='browse';$('story-controls').hidden=manifest.endpoint.family!=='story';$('browse-controls-pages').hidden=manifest.endpoint.family!=='browse';
 if(!ready){root.append(node('h2','Display unavailable'),node('p','The retained package and endpoint controls must be verified before this exhibition can open. Ask an operator to review the message below.'));updateStatus();return;}
 if(expired()){root.append(node('h2','This display needs an update'),node('p','The agreed offline display period has ended. Ask an operator to install a currently approved package.'));$('visitor-introduction').textContent='';$('visitor-title').textContent='Museum display';updateStatus();return;}
 const all=visible();if(!all.length){root.append(node('h2','No items available'),node('p','No visitor items are available under the controls currently held on this endpoint.'));updateStatus();return;}
 if(manifest.endpoint.family==='story'){index=Math.min(Math.max(0,index),all.length-1);root.append(detail(all[index]));$('story-position').textContent=(index+1)+' of '+all.length;$('story-previous').disabled=index===0;$('story-next').disabled=index===all.length-1;}
 else{const rows=all.filter(i=>!query||[i.title,i.summary].join(' ').toLocaleLowerCase().includes(query)),maximum=Math.max(0,Math.ceil(rows.length/12)-1);page=Math.min(page,maximum);
 $('browse-count').textContent=rows.length+' item'+(rows.length===1?'':'s');const list=node('div');list.className='browse-grid';
 for(const item of rows.slice(page*12,page*12+12)){const box=node('article'),h=node('h2',item.title),b=node('button','View item');b.type='button';b.onclick=()=>{clearMedia();root.replaceChildren(detail(item));const back=node('button','Back to collection');back.type='button';back.onclick=()=>{render();$('search').focus();};root.prepend(back);root.querySelector('h2')?.scrollIntoView({block:'start'});};box.append(h,node('p',item.summary),b);list.append(box);}
 if(!rows.length)root.append(node('h2','No matching items'),node('p','Try another title or clear the search.'));else root.append(list);
 $('browse-page').textContent=(rows.length?page*12+1:0)+'–'+Math.min(rows.length,(page+1)*12)+' of '+rows.length;$('browse-previous').disabled=page===0;$('browse-next').disabled=page>=maximum;
 }
 updateStatus();
}
async function refreshStatus(){
 const g=generation;$('endpoint-label').textContent=manifest.endpoint.label;$('expiry').textContent='Display expiry: '+new Date(manifest.expiresAt).toLocaleString();
 $('offline-status').textContent='Offline copy: newly issued changes are unknown until supplied controls are applied.';
 $('package-summary').textContent='Deployment '+manifest.deploymentId+'\nManifest '+manifestSha256+'\nOriginal control '+manifest.controlSha256;
 $('media-status').textContent=verified?'Verified '+verified.count+' of '+manifest.assets.length+' complete media files from '+verified.folder+'.':'Media have not been verified in this open display. Select the actual extracted package directory.';
 $('control-count').textContent=(current?.withdrawals.length||0)+' retained withdrawal records. Earlier controls cannot remove them.'+(pendingControls.length?' '+pendingControls.length+' complete supplied control file(s) remain pending in this tab; keep their originals or download the pending recovery file before closing.':'');
 let matches=false;if(ready&&current){matches=await C.museumDigest(current)===manifest.controlSha256;if(g!==generation)return;}
 $('ack-applied').disabled=!ready||expired()||!verified||!matches;
 $('control-state').textContent=!ready?'Control verification is incomplete.':matches?'This endpoint holds the package’s exact control. External freshness remains unknown.':'This endpoint holds additional restrictions. Prepare a new deployment with this current control before recording an applied acknowledgment.';
 $('ack-removed').disabled=!ready;$('ack-failed').disabled=!ready;
}
async function verifyFolder(){
 if(!ready)fail('Open and verify the original control first.');verified=null;verifiedCaptions.clear();await refreshStatus();const files=[...$('media-folder').files],expected=manifest.assets,epoch=controlEpoch,byPath=new Map();
 for(const file of files){const parts=(file.webkitRelativePath||'').split('/');if(parts.length<3)continue;const tail=parts.slice(-2).join('/');if(!byPath.has(tail))byPath.set(tail,[]);byPath.get(tail).push(file);}
 if(!files.length&&expected.length)fail('Select the actual extracted package folder.');let folder='';
 for(const a of expected){pathFor(a);const matches=byPath.get(a.path)||[];if(matches.length!==1)fail('Select one complete extracted folder containing '+a.path);
 const f=matches[0];folder=f.webkitRelativePath.split('/')[0];if(f.size!==a.bytes)fail('Media byte count changed: '+a.path);
 $('media-status').textContent='Verifying '+a.path;if(await digestFile(f,epoch)!==a.sha256)fail('Media SHA-256 changed: '+a.path);if(a.role==='captions'&&a.mime==='text/vtt')verifiedCaptions.set(a.id,f);
 }
 if(!expected.length){folder=files[0]?.webkitRelativePath?.split('/')[0]||'the media-free package';}
 if(epoch!==controlEpoch)fail('The endpoint controls changed during media verification.');verified={count:expected.length,folder};render();notice('Every required media file was checked against the exact manifest. Operate the visible presentation and inspect the actual installed output before recording application.');await refreshStatus();
}
async function acknowledgment(kind){
 if(!ready)fail('The original package is not verified.');
 const currentDigest=await C.museumDigest(current),operator=$('operator-name').value.trim(),note=$('operator-note').value.trim();
 if(!operator||!note)fail('Record the actual endpoint operator and complete observation.');
 if(kind==='applied'&&(!verified||expired()||currentDigest!==manifest.controlSha256))fail('Applied needs every original media file verified, an unexpired display and the original exact control. A newer control needs a new prepared deployment.');
 if(!confirm(kind==='applied'?'Have you opened and operated this actual installed display, viewed its important screens/media and verified that these selected files are from its package directory?':kind==='removed'?'Have you actually removed this exact deployment from visitor use?':'Record the observed failure of this exact deployment?'))return;
 const record={id:crypto.randomUUID(),deploymentId:manifest.deploymentId,kind,observedAt:new Date().toISOString(),operator,controlSha256:manifest.controlSha256,manifestSha256,note};
 download('museum-endpoint-'+kind+'-'+manifest.deploymentId+'.json',{schema:'stellar-forge.museum-endpoint-ack.v1',workspaceId:manifest.workspaceId,acknowledgment:record});
 notice('Downloaded the original '+kind+' observation. Bring this file back to the collection operator. Downloading it does not transmit it or establish commissioning/contractual acceptance.');
}
$('story-previous').onclick=()=>{index--;render();};$('story-next').onclick=()=>{index++;render();};
$('search').oninput=()=>{query=$('search').value.toLocaleLowerCase();page=0;render();};
$('browse-previous').onclick=()=>{page--;render();};$('browse-next').onclick=()=>{page++;render();};
$('verify-media').onclick=()=>enqueue(verifyFolder);$('media-folder').onchange=()=>{verified=null;verifiedCaptions.clear();updateStatus();};
$('ack-applied').onclick=()=>enqueue(()=>acknowledgment('applied'));$('ack-removed').onclick=()=>enqueue(()=>acknowledgment('removed'));$('ack-failed').onclick=()=>enqueue(()=>acknowledgment('failed'));
$('import-control').onclick=()=>{importSuppliedControl().catch(e=>notice(e.message,true));};
$('retry-control').onclick=()=>{suspendControls('Display paused while the original held and pending controls are reconciled.');enqueue(()=>reconcileControls('The complete original held and pending controls are retained. Inspect the actual display before acknowledgment.'));};
$('download-pending-control').onclick=()=>{if(!pendingControls.length){notice('No uncommitted supplied control remains in this open display.');return;}download('museum-pending-controls.json',{schema:'stellar-forge.museum-control-recovery.v1',workspaceId:manifest.workspaceId,controls:pendingControls,note:'Complete original supplied controls; this recovery file is not a retained/applied control receipt. Reopen this recovery file through the same supplied-control input, or retain each original file separately. No application or persistence is implied.'});};
$('download-control').onclick=()=>{if(current)download('museum-current-control.json',current);};
$('download-observation').onclick=()=>enqueue(async()=>{if(!current)fail('No original control is available.');download('museum-current-control-observation.json',{schema:'stellar-forge.museum-control-observation.v1',workspaceId:manifest.workspaceId,deploymentId:manifest.deploymentId,manifestSha256,currentControlSha256:await C.museumDigest(current),observedAt:new Date().toISOString(),operator:$('operator-name').value,note:$('operator-note').value,status:'current-control-held; deployment-acknowledgment-not-inferred'});});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&db){suspendControls('Display paused while the endpoint’s retained controls are reread.');enqueue(()=>reconcileControls('The endpoint’s retained controls are reconciled. External freshness remains unknown.'));}});
const timer=setInterval(()=>{if(ready&&expired()){verified=null;render();clearInterval(timer);}},1000);
(async()=>{try{
 if(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(document.getElementById('museum-runtime').textContent)).then(b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join(''))!==manifest.runtimeSha256)fail('The retained visitor runtime changed.');
 if(manifest.schema!=='stellar-forge.museum-endpoint.v1'||!['story','browse'].includes(manifest.endpoint?.family))fail('Unsupported complete endpoint package.');
 if(!/^[a-f0-9]{64}$/.test(manifestSha256)||await C.museumDigest(manifest)!==manifestSha256)fail('The complete endpoint manifest changed.');
 C.validateMuseumControl(control,manifest.workspaceId);if(await C.museumDigest(control)!==manifest.controlSha256)fail('The embedded original control changed.');
 if(!Array.isArray(manifest.assets)||!Array.isArray(manifest.release?.items))fail('The complete visitor inventory is absent.');
 for(const a of manifest.assets){if(assets.has(a.id))fail('A media identity repeats.');assets.set(a.id,a);pathFor(a);if(!Number.isSafeInteger(a.bytes)||a.bytes<0)fail('A media byte count is invalid.');}
 if(!Number.isFinite(Date.parse(manifest.expiresAt)))fail('The display expiry is absent.');
 db=await openControls();if(typeof BroadcastChannel==='function'){channel=new BroadcastChannel('stellar-forge-museum-control');channel.onmessage=e=>{if(e.data?.workspaceId===manifest.workspaceId){suspendControls('Display paused because another tab reported changed endpoint controls.');enqueue(()=>reconcileControls('Applied the endpoint’s retained control from another open tab.'));}};}await reconcileControls('Original package verified. This offline endpoint cannot discover later withdrawals by itself. Apply supplied current controls and inspect the actual display before acknowledgment.');
 }catch(error){ready=false;render();notice(error.message,true);}
})();
}
const VISITOR_CSS="\n:root{color-scheme:light;font-family:system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;color:#182b31;background:#f5f7f6;line-height:1.55}\n*{box-sizing:border-box}body{margin:0}a{color:#125b63}button,input,textarea{font:inherit}button{cursor:pointer;min-height:44px;border:1px solid #839a9d;border-radius:5px;padding:.55rem .9rem;background:white;color:#17383e}button:disabled{cursor:default;opacity:.55}button:hover:enabled{background:#edf5f3}button:focus-visible,input:focus-visible,textarea:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #027c88;outline-offset:3px}input,textarea{width:100%;min-height:44px;border:1px solid #899d9e;border-radius:4px;padding:.55rem;background:white;color:#182b31}input[type=file]{padding:.5rem}label{display:grid;gap:.3rem;margin:.8rem 0;font-weight:600}p,li,h1,h2,h3,figcaption,summary,a,pre{overflow-wrap:anywhere}h1{font-size:clamp(2rem,5vw,3.3rem);line-height:1.12;margin:.35rem 0 1rem}h2{font-size:1.6rem;line-height:1.25}h3{font-size:1.2rem}.skip{position:absolute;left:1rem;top:-5rem;background:white;padding:1rem;z-index:2}.skip:focus{top:1rem}\nheader,main,footer{max-width:1180px;margin:auto;padding:1.25rem 2rem}header{border-bottom:1px solid #c7d3d0}.eyebrow{font-size:.85rem;text-transform:uppercase;letter-spacing:.08em;color:#526b6b}.intro{max-width:70ch;font-size:1.1rem;white-space:pre-wrap}.visitor-item{max-width:880px;margin:1.5rem auto 2.5rem}.summary,.transcript{white-space:pre-wrap}.media-list{display:grid;gap:1.2rem}figure{margin:1rem 0}img,video{display:block;width:auto;max-width:100%;max-height:70vh;margin:auto;background:#eef1ef}audio{width:100%;max-width:100%}video{width:100%}figcaption{font-size:.9rem;margin-top:.6rem;color:#425b5d}.media-notice,.notice{padding:.9rem 1rem;border-left:4px solid #498078;background:#e7f1ed}.notice.error{border-color:#9b452d;background:#fff0e8}\n.toolbar{display:flex;gap:.65rem;align-items:center;flex-wrap:wrap;margin:.9rem 0}.toolbar span{padding:.35rem 0}.browse-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin:1rem 0}.browse-grid article{background:white;border:1px solid #ccd8d4;border-radius:6px;padding:1.25rem;display:flex;flex-direction:column;align-items:flex-start}.browse-grid article h2{font-size:1.25rem;margin-top:0}.browse-grid article p{flex:1;white-space:pre-wrap}.browse-grid button{margin-top:.5rem}.controls{max-width:780px}details{border:1px solid #bacbc7;border-radius:5px;padding:1rem;background:#fff}summary{cursor:pointer;font-weight:650}details[open]>summary{margin-bottom:1rem}#operator-panel{margin-top:3rem;background:#edf3f0}#operator-panel section{border-top:1px solid #c4d2cd;padding:1rem 0}#operator-panel p{max-width:85ch}.field-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}pre{white-space:pre-wrap;font-size:.8rem}footer{font-size:.9rem;color:#466063;border-top:1px solid #c7d3d0;margin-top:1.5rem}[hidden]{display:none!important}\n@media(max-width:760px){header,main,footer{padding:1rem}.browse-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.field-pair{grid-template-columns:1fr}.visitor-item{margin-top:1rem}}\n@media(max-width:480px){.browse-grid{grid-template-columns:1fr}.toolbar button{flex:1}#operator-panel{padding:.8rem}h1{font-size:2rem}}\n@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}\n";
const VISITOR_BODY="\n<a class=\"skip\" href=\"#visitor-content\">Skip to exhibition</a>\n<header><p class=\"eyebrow\" id=\"endpoint-label\">Museum display</p><h1 id=\"visitor-title\">Opening the exhibition</h1><p id=\"visitor-introduction\" class=\"intro\"></p></header>\n<main><section id=\"browse-controls\" class=\"controls\" hidden aria-label=\"Find collection items\"><label for=\"search\">Find an item<input id=\"search\" type=\"search\" autocomplete=\"off\"></label><p id=\"browse-count\" role=\"status\"></p></section>\n<div id=\"visitor-content\" aria-live=\"polite\"><h2>Opening retained content</h2><p>The original package and locally held withdrawal controls are being checked.</p></div>\n<nav id=\"story-controls\" class=\"toolbar\" aria-label=\"Story pages\" hidden><button id=\"story-previous\">Previous item</button><span id=\"story-position\" role=\"status\"></span><button id=\"story-next\">Next item</button></nav>\n<nav id=\"browse-controls-pages\" aria-label=\"Collection pages\"><div id=\"browse-pagination\" class=\"toolbar\"><button id=\"browse-previous\">Previous page</button><span id=\"browse-page\" role=\"status\"></span><button id=\"browse-next\">Next page</button></div></nav>\n<details id=\"operator-panel\"><summary>Endpoint operator · controls and receiving</summary>\n<p id=\"offline-status\"></p><p id=\"expiry\"></p><pre id=\"package-summary\"></pre><div id=\"operator-notice\" role=\"status\" aria-live=\"polite\"></div>\n<section><h2>Apply supplied withdrawal controls</h2><p>This endpoint cannot discover changes while disconnected. Bring the current control from the collection operator. Previously held restrictions remain in this browser and cannot be removed by opening an older package.</p><p id=\"control-count\"></p><p id=\"control-state\"></p><label for=\"control-file\">Complete supplied control JSON<input id=\"control-file\" type=\"file\" accept=\".json,application/json\"></label><div class=\"toolbar\"><button id=\"import-control\">Apply and retain controls</button><button id=\"download-control\">Download current control</button><button id=\"retry-control\">Retry retained controls</button><button id=\"download-pending-control\">Download pending controls</button><button id=\"download-observation\">Download control observation</button></div></section>\n<section><h2>Verify the actual installed media</h2><p>Select the complete extracted package directory. Every required media file is checked by original relative path, byte count and SHA-256. Keep this browser tab open, operate the display above and inspect the actual media. A new tab requires verification again.</p><label for=\"media-folder\">Actual extracted package directory<input id=\"media-folder\" type=\"file\" webkitdirectory directory multiple></label><p id=\"media-status\"></p><button id=\"verify-media\">Verify complete media</button></section>\n<section><h2>Return an actual endpoint observation</h2><div class=\"field-pair\"><label for=\"operator-name\">Actual endpoint operator<input id=\"operator-name\" autocomplete=\"name\"></label><label for=\"operator-note\">What you observed<textarea id=\"operator-note\" rows=\"3\"></textarea></label></div><p>An applied acknowledgment needs the exact original control, complete verified media and an unexpired package. A newer control requires a newly prepared deployment before an applied acknowledgment. Commissioning and contractual acceptance are separate records.</p><div class=\"toolbar\"><button id=\"ack-applied\" disabled>Record actual application</button><button id=\"ack-removed\" disabled>Record actual removal</button><button id=\"ack-failed\" disabled>Record observed failure</button></div></section>\n</details></main><footer>Retained museum display · Visitor content and public withdrawal controls only. Keep original source, staff evidence and editable work in the separate controlled handover.</footer>";

/** Every executable helper and static presentation byte in the endpoint package. */
export function museumVisitorRuntimeSource(){
 return visitorControlModel.toString()+'\n'+visitorByteHasher.toString()+'\n'+museumVisitorRuntime.toString()+'\n'+
  'const VISITOR_CSS='+JSON.stringify(VISITOR_CSS)+';\nconst VISITOR_BODY='+JSON.stringify(VISITOR_BODY)+';\n'+
  "document.getElementById('museum-style').textContent=VISITOR_CSS;\n"+
  "const staticPage=new DOMParser().parseFromString(VISITOR_BODY,'text/html');document.getElementById('museum-shell').append(...staticPage.body.childNodes);\n"+
  "museumVisitorRuntime(JSON.parse(document.getElementById('museum-data').textContent),visitorControlModel(),visitorByteHasher);\n";
}
export function renderMuseumVisitor({manifest,control,manifestSha256}){
 const model=visitorControlModel();model.validateMuseumControl(control,manifest.workspaceId);
 if(!manifest||manifest.schema!=='stellar-forge.museum-endpoint.v1'||!Array.isArray(manifest.assets)||!Array.isArray(manifest.release?.items)||!['story','browse'].includes(manifest.endpoint?.family)||!/^[a-f0-9]{64}$/.test(manifestSha256)||!/^[a-f0-9]{64}$/.test(manifest.runtimeSha256))throw Error('Use the complete prepared visitor manifest and runtime identity.');
 const config=JSON.stringify({manifest,control,manifestSha256}).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 const script=museumVisitorRuntimeSource();if(/<\/script/i.test(script))throw Error('The static visitor source contains an unsafe script boundary.');
 return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Museum display</title><style id="museum-style"></style></head><body><div id="museum-shell"></div><noscript>This retained display needs its supplied JavaScript runtime. Ask an operator to use the approved endpoint browser.</noscript><script type="application/json" id="museum-data">'+config+'</script><script id="museum-runtime">'+script+'</script></body></html>\n';
}
