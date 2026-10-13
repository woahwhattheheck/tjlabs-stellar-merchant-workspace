/* MIT. Complete offline colleague review. Original package and editions remain immutable. */
(function(){
"use strict";
const sha = (function(){const module={exports:{}};const exports=module.exports;
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
 * Hash a complete well-formed UTF-16 string as its exact UTF-8 content bytes.
 * No normalization, byte-order mark insertion, newline conversion or I/O.
 * @returns {{bytes: number, sha256: string}}
 */
function sha256Utf8(value) {
  if (typeof value !== 'string') throw new TypeError('sha256Utf8 requires a string');
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code >= 0xd800 && code <= 0xdfff) throw new TypeError('Unpaired UTF-16 surrogate');
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
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

module.exports = {sha256Utf8, sha256Bytes};

return module.exports;})();
const PACKAGE="stellar-forge.odk-form-colleague-package.v1",WORK="stellar-forge.odk-form-colleague-return.v1";
const $=id=>document.getElementById(id),clone=value=>structuredClone(value);
const S={work:null,db:null,dbRevision:null,version:0,savedVersion:0,saving:null,pending:null,busy:false,session:false,tab:"changes",page:0,filePage:0,search:"",severity:"all",disposition:"all",fileSearch:"",recovery:null,timer:null};
const canonical=v=>v===null||typeof v!=="object"?JSON.stringify(v):Array.isArray(v)?"["+v.map(canonical).join(",")+"]":"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";
const safeJSON=v=>JSON.stringify(v).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
const fail=s=>{throw new Error(s);},need=(v,s)=>{if(!v)fail(s);};
const text=(v,label)=>{need(typeof v==="string",label+" must be text.");return v;};
const nonempty=(v,label)=>{text(v,label);need(v.trim(),label+" is required.");return v;};
const cleanText=(v,label)=>{text(v,label);need(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),label+" contains a control character.");return v;};
const boundedText=(v,label,maximum)=>{cleanText(v,label);need(v.length<=maximum,label+" exceeds "+maximum+" characters.");return v;};
function node(tag,value,cls){const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;}
function button(label,handler,opts={}){const b=node("button",label,opts.primary?"primary":undefined);b.type="button";if(opts.mutates)b.dataset.mutates="true";b.addEventListener("click",()=>run(handler));return b;}
function announce(s){$("announcements").textContent=s;}
function unique(rows,key,label){const seen=new Set;for(const row of rows){const k=key(row);need(!seen.has(k),"Duplicate "+label+": "+k);seen.add(k);}}
function bytes64(s){need(typeof s==="string"&&s.length%4===0&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s),"An original file has invalid base64.");const raw=atob(s),b=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)b[i]=raw.charCodeAt(i);need(btoa(raw)===s,"An original file has noncanonical base64.");return b;}
const validPackages=new Set;
async function validateWork(w){
 need(w&&typeof w==="object"&&!Array.isArray(w)&&w.schema===WORK,"Choose a complete colleague working copy or return JSON.");
 const p=w.package;need(p&&p.schema===PACKAGE,"The original colleague package is missing.");
 for(const key of ["id","workspaceId","reviewId","createdAt","contentHash"])nonempty(p[key],"Package "+key);
 need(Number.isSafeInteger(p.reviewRevision)&&p.reviewRevision>=0,"The original review revision is missing.");
 const unsigned={...p};delete unsigned.contentHash;const actual=sha.sha256Utf8(canonical(unsigned)).sha256;
 need(actual===p.contentHash,"The package content hash does not match its complete original body.");
 need(p.review?.assessment&&Array.isArray(p.review.assessment.changes),"The original form assessment is missing.");
 need(p.sources?.baseline&&p.sources?.candidate,"Both original form generations are required.");
 need(Array.isArray(p.files),"The complete original files are required.");
 unique(p.review.assessment.changes,x=>nonempty(x.id,"Change identity"),"change identity");
 if(!validPackages.has(actual)){
  unique(p.files,x=>x.sha256,"original file hash");
  for(let i=0;i<p.files.length;i++){
   const f=p.files[i];need(/^[a-f0-9]{64}$/.test(f.sha256)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0,"An original file identity is invalid.");
   need(Array.isArray(f.names)&&f.names.length,"Retain every original file occurrence.");
   for(const n of f.names){need(n&&typeof n==="object","Invalid original file occurrence.");nonempty(n.name,"Original filename");}
   const bytes=bytes64(f.base64),hash=sha.sha256Bytes(bytes);
   need(hash.bytes===f.bytes&&hash.sha256===f.sha256,"Original file content differs: "+f.names[0].name);
   if(i%4===0){announce("Checking original files "+(i+1)+" / "+p.files.length+"…");await new Promise(r=>setTimeout(r,0));}
  }
  validPackages.add(actual);
 }
 const ids=new Set(p.review.assessment.changes.map(x=>x.id));
 function choices(rows,complete){need(Array.isArray(rows),"Retain the complete decision array.");unique(rows,x=>x.changeId,"change decision");for(const d of rows){need(ids.has(d.changeId),"A decision belongs to another assessment.");need(["accept","remap","revise"].includes(d.decision),"Choose accept, remap or revise.");boundedText(d.note,"Disposition note",20000);if(complete)nonempty(d.note,"Disposition note");}}
 need(w.draft&&typeof w.draft==="object","The unfinished review draft is required.");
 boundedText(w.draft.reviewer,"Reviewer",200);boundedText(w.draft.note,"Review note",30000);choices(w.draft.decisions,false);
 need(Array.isArray(w.editions),"Retain the complete saved editions.");unique(w.editions,e=>nonempty(boundedText(e.id,"Edition identity",200),"Edition identity"),"edition identity");
 for(const e of w.editions){nonempty(boundedText(e.reviewer,"Saved reviewer",200),"Saved reviewer");nonempty(boundedText(e.note,"Saved review note",30000),"Saved review note");nonempty(e.createdAt,"Saved time");need(Number.isFinite(Date.parse(e.createdAt)),"Saved edition time is invalid.");choices(e.decisions,true);}
 return w;
}
function combined(a,b,draft){
 need(a.package.contentHash===b.package.contentHash&&canonical(a.package)===canonical(b.package),"These working copies refer to different original packages.");
 const editions=a.editions.map(clone),byId=new Map(editions.map(e=>[e.id,e]));
 for(const e of b.editions){if(byId.has(e.id))need(canonical(byId.get(e.id))===canonical(e),"Saved edition "+e.id+" has conflicting bodies; keep both original files for staff review.");else{const next=clone(e);editions.push(next);byId.set(e.id,next);}}
 return{...clone(a),draft:clone(draft),editions};
}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open("odk-colleague-review",1);r.onupgradeneeded=()=>r.result.createObjectStore("reviews",{keyPath:"id"});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error("Browser storage could not open."));r.onblocked=()=>reject(Error("Close another older colleague-review tab to open browser storage."));});}
function localRecord(id){return new Promise((resolve,reject)=>{const tx=S.db.transaction("reviews","readonly"),r=tx.objectStore("reviews").get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function persist(work,expected){return new Promise((resolve,reject)=>{
 need(S.db,"Browser storage is unavailable.");const tx=S.db.transaction("reviews","readwrite"),store=tx.objectStore("reviews"),r=store.get(work.package.contentHash);let failure;
 r.onsuccess=()=>{const old=r.result;if(expected===null?!!old:!old||old.revision!==expected){failure=Error("Another tab saved a different edition. Download this complete working copy, then reopen the latest browser record and import it to retain both histories.");tx.abort();return;}store.put({id:work.package.contentHash,revision:(expected??0)+1,work});};
 tx.oncomplete=()=>resolve((expected??0)+1);tx.onerror=()=>reject(failure||tx.error||Error("Browser save failed."));tx.onabort=()=>reject(failure||tx.error||Error("Browser save was interrupted."));
});}
function setControls(){document.querySelectorAll("[data-mutates]").forEach(n=>n.disabled=!!(S.pending||S.recovery||S.busy));document.querySelectorAll("[data-draft-input]").forEach(n=>n.disabled=!!(S.pending||S.recovery||S.busy||(n.dataset.requiresDecision&&!currentDecision(n.dataset.requiresDecision))));}
function storageMessage(){
 const n=$("storage-alert");n.replaceChildren();n.hidden=!(S.pending||S.session);
 if(S.pending){n.append(node("h2","This complete edition is still in this tab"),node("p",S.pending.error),node("p","Download the working HTML or full JSON before closing. The prior browser record remains unchanged."));
 const a=node("div",undefined,"actions");a.append(button("Retry browser save",async()=>{const p=S.pending;S.pending=null;try{await saveNow();}catch(e){if(!S.pending)S.pending=p;throw e;}},{mutates:false}),button("Download working HTML",downloadHTML),button("Download full JSON",downloadJSON),button("Continue in this tab only",()=>{S.session=true;S.pending=null;storageMessage();setControls();announce("Session-only work. Download the complete working copy to retain changes before closing.");}));n.append(a);
 }else if(S.session)n.append(node("h2","Session-only work"),node("p","Browser saving is unavailable or was set aside. Download a complete working copy after editing; closing this tab loses changes made only here."));
 setControls();updateSavedStatus();
}
function updateSavedStatus(){const n=$("save-state");if(n)n.textContent=S.pending?"Browser save needs attention":S.session?"Session only · download to retain":S.saving?"Saving unfinished work…":S.version!==S.savedVersion?"Unfinished changes waiting to save":"Unfinished work saved in this browser";}
function changed(){S.version++;updateSavedStatus();clearTimeout(S.timer);if(!S.session&&!S.pending&&!S.recovery)S.timer=setTimeout(()=>saveNow().catch(e=>announce(e.message)),1000);}
async function saveNow(){
 clearTimeout(S.timer);if(S.session)return;if(S.recovery)fail("Choose which unfinished draft to continue first.");if(S.pending)fail("Resolve the pending browser save or continue in this tab only.");
 if(S.saving){await S.saving;if(S.version!==S.savedVersion)return saveNow();return;}
 if(S.version===S.savedVersion&&S.dbRevision!==null)return;
 const work=clone(S.work),version=S.version,expected=S.dbRevision;
 S.saving=persist(work,expected);updateSavedStatus();
 try{S.dbRevision=await S.saving;S.savedVersion=version;}catch(e){S.pending={error:e.message,expectedRevision:expected};storageMessage();throw e;}finally{S.saving=null;updateSavedStatus();}
 if(S.version!==S.savedVersion&&!S.pending)S.timer=setTimeout(()=>saveNow().catch(e=>announce(e.message)),500);
}
async function run(fn){if(S.busy)return;S.busy=true;setControls();try{await fn();}catch(e){announce(e.message||String(e));}finally{S.busy=false;setControls();}}
function download(content,name,type="application/octet-stream"){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement("a");a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function baseName(name){return String(name).split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g,"_")||"original-file";}
function workingName(suffix){return baseName(S.work.package.reviewId)+"-colleague-"+suffix;}
function downloadJSON(){need(S.work,"No complete working copy is open.");download(JSON.stringify(S.work,null,2)+"\n",workingName("return.json"),"application/json;charset=utf-8");announce("Downloaded the full working JSON, including original files, unfinished draft and all saved editions.");}
function downloadHTML(){
 need(S.work,"No complete working copy is open.");const root=document.documentElement.cloneNode(true);
 root.querySelector("#colleague-work-data").textContent=safeJSON(S.work);
 root.querySelector("#main").replaceChildren(document.createTextNode("Checking the complete retained review…"));
 for(const id of ["announcements","storage-alert","recovery","viewer-body"]){const e=root.querySelector("#"+id);e.replaceChildren();if(id!=="announcements")e.hidden=true;}
 root.querySelector("#viewer-body").hidden=false;root.querySelector("#viewer").removeAttribute("open");root.querySelector("#subtitle").textContent="Opening the complete retained review…";
 download("<!doctype html>\n"+root.outerHTML+"\n",workingName("working.html"),"text/html;charset=utf-8");announce("Downloaded a complete offline HTML working copy with every original file and saved edition.");
}
function decodedOriginal(f){return bytes64(f.base64);}
function downloadOriginal(f,name){download(decodedOriginal(f),baseName(name));announce("Downloaded original bytes: "+name);}
function field(label,control){const wrap=node("div",undefined,"field"),id="field-"+(++field.sequence);control.id=id;const l=node("label",label);l.htmlFor=id;wrap.append(l,control);return wrap;}field.sequence=0;
function select(options,value){const n=document.createElement("select");for(const [v,label] of options){const o=node("option",label);o.value=v;n.append(o);}n.value=value;return n;}
function valueBlock(value){return node("pre",value===undefined?"Not provided":JSON.stringify(value,null,2),"value");}
function details(label,value,open=false){const d=node("details");d.open=open;d.append(node("summary",label),valueBlock(value));return d;}
function table(headers,rows,label){const wrap=node("div",undefined,"table-wrap");wrap.tabIndex=0;wrap.setAttribute("role","region");wrap.setAttribute("aria-label",label);const t=node("table"),head=node("thead"),tr=node("tr");for(const x of headers)tr.append(node("th",x));head.append(tr);t.append(head);const body=node("tbody");for(const row of rows){const tr=node("tr");for(const value of row){const td=node("td");if(value instanceof Node)td.append(value);else td.textContent=value===null||value===undefined?"—":String(value);tr.append(td);}body.append(tr);}t.append(body);wrap.append(t);return wrap;}
function meta(values){const d=node("dl",undefined,"meta");for(const [k,v] of values){d.append(node("dt",k),node("dd",v??"—"));}return d;}
function showViewer(title,contents){$("viewer-title").textContent=title;$("viewer-body").replaceChildren(contents);$("viewer").showModal();}


function draftInput(n,change){n.dataset.draftInput="true";n.addEventListener("input",()=>{change(n.value);changed();});return n;}
function currentDecision(id){return S.work.draft.decisions.find(x=>x.changeId===id);}
function setDecision(id,decision,note){const rows=S.work.draft.decisions.filter(x=>x.changeId!==id);if(decision)rows.push({changeId:id,decision,note});S.work.draft={...S.work.draft,decisions:rows};changed();}
function draftPanel(){
 const p=node("section",undefined,"panel reviewer");p.append(node("h2","Your review"));
 const grid=node("div",undefined,"grid"),reviewer=draftInput(document.createElement("input"),v=>S.work.draft.reviewer=v),note=draftInput(document.createElement("textarea"),v=>S.work.draft.note=v);
 reviewer.value=S.work.draft.reviewer;reviewer.autocomplete="name";reviewer.maxLength=200;note.value=S.work.draft.note;note.maxLength=30000;
 grid.append(field("Reviewer name",reviewer),field("Overall review note",note));p.append(grid);
 const a=node("div",undefined,"actions");a.append(button("Save unfinished work",async()=>{await saveNow();announce(S.session?"Working draft is retained in this tab. Download it before closing.":"Saved the complete unfinished draft in this browser.");},{mutates:true}),button("Save review edition",saveEdition,{mutates:true,primary:true}));
 p.append(a,node("p","Accept records your assessment; remap describes a required reporting mapping; revise requests a change. A saved edition records your name and notes. Native release approval stays in the original workspace.","small"));return p;
}
function pager(parent,total,size,page,setPage,label){
 const pages=Math.max(1,Math.ceil(total/size)),p=node("div",undefined,"pager"),a=button("Previous",()=>{setPage(Math.max(0,page-1));render();}),b=button("Next",()=>{setPage(Math.min(pages-1,page+1));render();});a.disabled=page<=0;b.disabled=page>=pages-1;p.append(a,node("span",label+" · page "+(page+1)+" of "+pages+" · "+total+" records"),b);parent.append(p);
}
function renderChanges(root){
 const a=S.work.package.review.assessment;
 root.append(draftPanel());
 const filters=node("div",undefined,"filters"),search=document.createElement("input");search.type="search";search.value=S.search;search.placeholder="Path, change or output";search.addEventListener("change",()=>{S.search=search.value;S.page=0;render();});
 const severity=select([["all","Every severity"],["incompatible","Incompatible"],["review","Needs review"],["compatible","Compatible"],["information","Information"]],S.severity);
 severity.addEventListener("change",()=>{S.severity=severity.value;S.page=0;render();});
 const disposition=select([["all","All decisions"],["unreviewed","No disposition"],["accept","Accept"],["remap","Remap"],["revise","Revise"]],S.disposition);disposition.addEventListener("change",()=>{S.disposition=disposition.value;S.page=0;render();});
 filters.append(field("Find a change",search),field("Severity",severity),field("Disposition",disposition));root.append(filters);
 const q=S.search.toLowerCase(),changes=a.changes.filter(c=>(S.severity==="all"||c.severity===S.severity)&&(!q||JSON.stringify(c).toLowerCase().includes(q))&&(S.disposition==="all"||(S.disposition==="unreviewed"?!currentDecision(c.id):currentDecision(c.id)?.decision===S.disposition)));
 S.page=Math.min(S.page,Math.max(0,Math.ceil(changes.length/20)-1));
 if(!changes.length)root.append(node("p",a.changes.length?"No changes match these filters.":"This saved assessment contains no changes.","empty"));
 for(const c of changes.slice(S.page*20,S.page*20+20)){
  const card=node("article",undefined,"card severity-"+(c.severity||"information")),head=node("div",undefined,"card-head");head.append(node("h3",c.summary||c.kind||c.id),node("span",c.severity||"information","tag"));card.append(head);
  if(c.path)card.append(node("p",c.path,"mono"));if(c.detail)card.append(node("p",c.detail));
  const pair=node("div",undefined,"before-after"),before=node("div"),after=node("div");before.append(node("h4","Baseline"),valueBlock(c.before));after.append(node("h4","Candidate"),valueBlock(c.after));pair.append(before,after);card.append(pair);
  if(c.dependencies?.length)card.append(details("Affected reports and original selectors · "+c.dependencies.length,c.dependencies));
  const saved=currentDecision(c.id),choice=select([["","No disposition"],["accept","Accept"],["remap","Remap"],["revise","Revise"]],saved?.decision??""),note=document.createElement("textarea");note.value=saved?.note??"";note.maxLength=20000;note.placeholder="Explain this disposition and any source or report mapping.";
  choice.dataset.draftInput="true";note.dataset.draftInput="true";note.dataset.requiresDecision=c.id;
  choice.addEventListener("change",()=>{setDecision(c.id,choice.value,note.value);note.disabled=!choice.value||!!S.pending||!!S.recovery;});
  note.addEventListener("input",()=>{if(choice.value)setDecision(c.id,choice.value,note.value);});note.disabled=!choice.value;
  const form=node("div",undefined,"grid");form.append(field("Disposition",choice),field("Disposition note",note));card.append(form,node("p",c.id,"mono small"));
  if(c.severity==="incompatible")card.append(node("p","This assessment records an incompatible native change. A colleague note does not change that native constraint.","small"));
  root.append(card);
 }
 pager(root,changes.length,20,S.page,v=>S.page=v,"Changes");
}
function renderOverview(root){
 const p=S.work.package,r=p.review,a=r.assessment,changes=a.changes;
 const summary=node("section",undefined,"panel");summary.append(node("h2",r.name||"Form release review"),meta([["Package",p.id],["Original workspace",p.workspaceId],["Review",p.reviewId+" · revision "+p.reviewRevision],["Exported",p.createdAt],["Original review status",r.status],["Assessment hash",a.contentHash],["Package hash",p.contentHash]]));root.append(summary);
 const stats=node("div",undefined,"stats");for(const [label,value] of [["Changes",changes.length],["Incompatible",changes.filter(c=>c.severity==="incompatible").length],["Needs review",changes.filter(c=>c.severity==="review").length],["Your dispositions",S.work.draft.decisions.length],["Saved editions",S.work.editions.length],["Original files",p.files.length]]){const s=node("div",undefined,"stat");s.append(node("strong",value),node("span",label));stats.append(s);}root.append(stats);
 root.append(node("p","This offline package is bound to the displayed review revision and assessment. The Sources and Reporting tabs retain the complete exported evidence. Your notes and saved editions travel with that original package.","panel"));
 if(r.readiness?.dependenciesChanged)root.append(node("p","The exported review reports changed dependencies. The source workspace must refresh report mappings before release approval.","warning"));
 root.append(details("Original approval readiness at export",r.readiness??null,true),details("Assessment summary",a.summary??null),details("Original staff decisions",r.decisions??[]),details("Original review history",r.history??[]),details("Original approval record",r.approval??null));
}
function renderReporting(root){
 const r=S.work.package.review,a=r.assessment,saved=a.reporting??{};
 root.append(node("h2","Report definitions and mappings"),node("p","The saved assessment retains its original dependency definition hashes and mappings. Any current inventory captured at export is shown separately; editing a colleague note does not change a native mapping.","panel"));
 const dependencies=saved.dependencies??[];
 root.append(node("h3","Saved assessment dependencies"));
 if(!dependencies.length)root.append(node("p","No saved reporting dependencies in this assessment.","empty"));
 for(const d of dependencies){const p=node("section",undefined,"panel");p.append(node("h3",d.label||d.id),meta([["Identity",d.id],["Kind",d.kind],["Definition hash",d.definitionHash]]),details("Tables and original scope",d.tables??[]),details("Selectors and mapped native paths",d.selectors??[]),details("Original definition source",d.source??{}));root.append(p);}
 root.append(details("Saved field bindings",saved.bindings??a.bindings??[]),details("Saved table bindings",saved.tableBindings??a.tableBindings??[]),details("Unmapped fields",saved.unmapped??[]),details("Unmapped tables",saved.unmappedTables??[]),details("Complete saved reporting inventory",saved));
 if(r.reporting)root.append(details("Current reporting inventory captured at export",r.reporting,true));
}
function renderCoverage(root){
 const p=S.work.package,a=p.review.assessment;root.append(node("h2","Comparison coverage"),node("p","Coverage states describe the originals retained when this assessment was created. Use the full source files to review collection rules, historical field identities, translations and attachments.","panel"),details("Assessment coverage",a.coverage??null,true),details("Retained published generations used by assessment",a.historical??[],true));
 for(const [side,s] of Object.entries(p.sources)){const panel=node("section",undefined,"panel");panel.append(node("h3",side==="baseline"?"Baseline coverage":"Candidate coverage"),details("Source coverage",s.coverage??{}),details("Media completeness and inventory",s.media??{}),details("Retained authoring model",s.model??null));root.append(panel);}
}
function generationCards(root,source,side,depth=0){
 const p=node("section",undefined,"panel");p.append(node("h3",(depth?"Historical generation":"Original "+side)+" · "+(source.form?.version??source.id??"source")),meta([["Source identity",source.id],["Project / form",(source.form?.projectId??"")+" / "+(source.form?.formId??"")],["Version",source.form?.version],["Content hash",source.contentHash]]),details("Original form identity and metadata",source.form??{}),details("Original source and receipts",{origin:source.origin,xml:source.xml,fieldsReceipt:source.fields?Object.fromEntries(Object.entries(source.fields).filter(([k])=>k!=="values")):null,modelSource:source.modelSource}),details("Coverage",source.coverage??{}));
 const values=source.fields?.values??[];const fieldDetails=node("details");fieldDetails.append(node("summary","Complete native field inventory · "+values.length));fieldDetails.addEventListener("toggle",()=>{if(fieldDetails.open&&!fieldDetails.dataset.loaded){fieldDetails.dataset.loaded="true";fieldDetails.append(table(["Original path","Native type","Full original field"],values.map(f=>[f.path,f.type,details("Details",f)]),"Original native field inventory"));}});p.append(fieldDetails);
 p.append(button("View complete original source record",()=>showViewer("Complete original source record",valueBlock(source))));
 root.append(p);for(const h of source.history??[])if(h&&typeof h==="object")generationCards(root,h,side,depth+1);
}
function renderSources(root){
 const p=S.work.package;root.append(node("h2","Original form generations"),node("p","Every original download is verified against its retained byte length and SHA-256. Shared bytes are stored once; every original filename and source occurrence remains listed. The full working HTML and JSON contain them all.","panel"));
 const grid=node("div",undefined,"grid");for(const side of ["baseline","candidate"]){const col=node("div");generationCards(col,p.sources[side],side);grid.append(col);}root.append(grid);
 if(p.fileCoverage?.nativeOnly?.length)root.append(node("h2","Originals retained in the source workspace"),node("p","These original receipts stay in native custody. Their recorded identity and the export reason remain visible here.","panel"),details("Native-only originals and receiving coverage",p.fileCoverage.nativeOnly,true));
 root.append(node("h2","Original XML, fields, models and media"));
 const search=document.createElement("input");search.type="search";search.value=S.fileSearch;search.placeholder="Original filename or source";search.addEventListener("change",()=>{S.fileSearch=search.value;S.filePage=0;render();});root.append(field("Find an original file",search));
 const q=S.fileSearch.toLowerCase(),files=p.files.filter(f=>!q||JSON.stringify(f.names).toLowerCase().includes(q)||f.sha256.includes(q));S.filePage=Math.min(S.filePage,Math.max(0,Math.ceil(files.length/20)-1));
 for(const f of files.slice(S.filePage*20,S.filePage*20+20)){const card=node("section",undefined,"card");card.append(node("h3",f.names[0].label||f.names[0].name),node("p",f.bytes.toLocaleString()+" bytes · SHA-256 "+f.sha256,"mono small"));
 for(const n of f.names){const row=node("div",undefined,"file-row");row.append(node("p",n.name,"file-name"),node("p",[n.side,n.sourceId,n.label].filter(Boolean).join(" · "),"small"));const a=node("div",undefined,"actions");a.append(button("Download original",()=>downloadOriginal(f,n.name)),button("Inspect original",()=>inspectOriginal(f,n.name)));row.append(a);card.append(row);}root.append(card);}
 if(!files.length)root.append(node("p","No original file matches this search.","empty"));pager(root,files.length,20,S.filePage,v=>S.filePage=v,"Files");
}
function inspectOriginal(file,name){
 const bytes=decodedOriginal(file),box=node("div");box.append(meta([["Original filename",name],["Bytes",file.bytes],["SHA-256",file.sha256]]),button("Download exact original",()=>downloadOriginal(file,name)));
 if(/\.(png|jpe?g|gif|webp)$/i.test(name)){const url=URL.createObjectURL(new Blob([bytes])),img=document.createElement("img");img.alt=name;img.src=url;box.append(img);$("viewer").addEventListener("close",()=>URL.revokeObjectURL(url),{once:true});}
 else{try{const content=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);box.append(node("p","Complete original UTF-8 text. Visual wrapping does not alter the downloaded bytes.","small"),node("pre",content));}catch{box.append(node("p","This original is binary or uses a different text encoding. Download it to open with its appropriate application."));}}
 showViewer(name,box);
}


async function saveEdition(){
 nonempty(boundedText(S.work.draft.reviewer,"Reviewer",200),"Reviewer");nonempty(boundedText(S.work.draft.note,"Overall review note",30000),"Overall review note");
 for(const d of S.work.draft.decisions)nonempty(boundedText(d.note,"Disposition note",20000),"Disposition note for "+d.changeId);
 const at=new Date().toISOString(),body={createdAt:at,reviewer:S.work.draft.reviewer,note:S.work.draft.note,decisions:clone(S.work.draft.decisions)};
 const id="colleague-edition-"+sha.sha256Utf8(canonical({packageHash:S.work.package.contentHash,...body})).sha256.slice(0,40);
 need(!S.work.editions.some(e=>e.id===id),"This edition is already retained.");S.work={...S.work,editions:[...S.work.editions,{id,...body}]};changed();
 try{await saveNow();}finally{render();}announce("Saved an immutable review edition with "+body.decisions.length+" dispositions. Download the return JSON or complete working HTML to hand it over.");
}
function renderEditions(root){
 root.append(node("h2","Saved review editions"),node("p","Each saved edition keeps its original reviewer, time, overall note and disposition notes. Loading an edition as a draft preserves that saved edition. The original workspace's staff history stays inside the unchanged package.","panel"));
 if(!S.work.editions.length)root.append(node("p","No colleague edition has been saved yet. The Changes tab keeps your unfinished work.","empty"));
 for(const e of [...S.work.editions].reverse()){const card=node("section",undefined,"card");card.append(node("h3",e.reviewer+" · "+e.createdAt),node("p",e.note),node("p",e.id,"mono small"),details("Complete dispositions · "+e.decisions.length,e.decisions));card.append(button("Use as a new unfinished draft",async()=>{if(!confirm("Replace the current unfinished draft with this saved edition? All saved editions remain. Download the working copy first if you also need the current unfinished draft."))return;S.work={...S.work,draft:{reviewer:e.reviewer,note:e.note,decisions:clone(e.decisions)}};changed();S.tab="changes";render();await saveNow();},{mutates:true}));root.append(card);}
 root.append(details("Original staff decisions at package export",S.work.package.review.decisions??[]),details("Original staff history at package export",S.work.package.review.history??[]));
}
function render(){
 if(!S.work)return;const p=S.work.package;const main=$("main");main.replaceChildren();
 $("subtitle").textContent=(p.sources.candidate.form?.name||p.sources.candidate.form?.formId||p.review.name||"Form")+" · review "+p.reviewId+" · original revision "+p.reviewRevision;
 const toolbar=node("div",undefined,"toolbar"),left=node("div");left.append(node("p",S.work.draft.reviewer?"Draft reviewer: "+S.work.draft.reviewer:"Add your name in Changes","small"));const state=node("p","","small");state.id="save-state";left.append(state);const a=node("div",undefined,"actions");a.append(button("Download working HTML",downloadHTML),button("Download return JSON",downloadJSON),button("Open working copy",()=>{if(S.pending)fail("Download or resolve the pending save before opening another working copy.");$("open-work").click();},{mutates:true}));
 const upload=document.createElement("input");upload.id="open-work";upload.type="file";upload.accept=".json,.html,.htm,application/json,text/html";upload.hidden=true;upload.addEventListener("change",()=>run(async()=>{if(upload.files?.[0])await openFile(upload.files[0]);}));toolbar.append(left,a,upload);main.append(toolbar);
 const nav=node("nav",undefined,"tabs");nav.setAttribute("aria-label","Review sections");
 for(const [id,label] of [["overview","Overview"],["changes","Changes"],["coverage","Coverage"],["reporting","Reporting"],["sources","Sources"],["editions","Saved editions"]]){const b=button(label,()=>{S.tab=id;render();$("section-heading")?.focus();});b.setAttribute("aria-current",S.tab===id?"page":"false");b.setAttribute("aria-selected",String(S.tab===id));nav.append(b);}main.append(nav);
 const section=node("section");section.setAttribute("aria-label",S.tab);const heading=node("h2",({overview:"Review overview",changes:"Review changes",coverage:"Coverage",reporting:"Reporting",sources:"Sources",editions:"Saved editions"})[S.tab]);heading.id="section-heading";heading.tabIndex=-1;heading.className="sr-heading";section.append(heading);
 ({overview:renderOverview,changes:renderChanges,coverage:renderCoverage,reporting:renderReporting,sources:renderSources,editions:renderEditions})[S.tab](section);main.append(section);updateSavedStatus();setControls();
}
async function chooseRecovery(which){
 const x=S.recovery;need(x,"No saved-browser choice remains.");const draft=which==="saved"?x.saved.work.draft:x.incoming.draft;
 const merged=combined(x.saved.work,x.incoming,draft);S.work=merged;S.dbRevision=x.saved.revision;S.recovery=null;S.pending=null;S.version++;S.savedVersion=0;
 $("recovery").hidden=true;render();await saveNow();announce("Continued the selected unfinished draft and retained all original saved review editions.");
}
function showRecovery(incoming,saved){
 S.recovery={incoming,saved};const box=$("recovery");box.hidden=false;box.replaceChildren(node("h2","Choose the unfinished draft to continue"),node("p","This browser already has work for the exact same original package. Both choices retain the union of saved editions. The unfinished reviewer and notes come from the choice you select."));
 box.append(meta([["Saved browser draft",saved.work.draft.reviewer+" · "+saved.work.draft.decisions.length+" dispositions · "+saved.work.editions.length+" editions"],["Opened working copy",incoming.draft.reviewer+" · "+incoming.draft.decisions.length+" dispositions · "+incoming.editions.length+" editions"]]));
 const actions=node("div",undefined,"actions");actions.append(button("Continue saved browser draft",()=>chooseRecovery("saved"),{primary:true}),button("Continue opened file's draft",()=>chooseRecovery("incoming")),button("Download saved browser JSON",()=>download(JSON.stringify(saved.work,null,2)+"\n",workingName("browser-saved.json"),"application/json;charset=utf-8")));
 box.append(actions);setControls();
}
async function installWork(incoming){
 // Read and validate browser custody before replacing the currently visible review.
 let saved=null;
 if(S.db){
  try{saved=await localRecord(incoming.package.contentHash);}catch(e){S.db=null;S.session=true;announce("Browser reading is unavailable. The verified file will open in this tab; download it to retain edits.");}
  if(saved){need(Number.isSafeInteger(saved.revision)&&saved.revision>=1,"The browser record revision is invalid.");await validateWork(saved.work);combined(saved.work,incoming,incoming.draft);}
 }
 S.work=incoming;S.dbRevision=null;S.version=0;S.savedVersion=0;S.pending=null;S.recovery=null;S.page=0;S.filePage=0;$("recovery").hidden=true;
 if(!S.db){S.session=true;render();storageMessage();return;}
 if(saved){if(canonical(saved.work)===canonical(incoming)){S.work=saved.work;S.dbRevision=saved.revision;render();storageMessage();announce("Opened the identical saved browser working copy.");return;}
  render();showRecovery(incoming,saved);storageMessage();return;
 }
 render();storageMessage();if(!S.session)await saveNow();announce(S.session?"Originals verified. Work continues in this tab; download to retain changes.":"Originals verified. The complete working copy is saved in this browser.");
}
function parseWorkingText(t,name){
 if(/^\s*\{/.test(t))return JSON.parse(t);
 const found=[];const pattern=/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;let match;
 while((match=pattern.exec(t))){if(/\bid\s*=\s*["']colleague-work-data["']/i.test(match[1])){need(/\btype\s*=\s*["']application\/json["']/i.test(match[1]),"The working-copy payload type is invalid.");found.push(match[2]);}}
 need(found.length===1,"Choose a complete colleague JSON return or the downloaded offline working HTML.");return JSON.parse(found[0]);
}
async function openFile(file){
 if(S.pending||S.recovery)fail("Resolve the current draft/save choice before opening another file.");
 const raw=new Uint8Array(await file.arrayBuffer()),t=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(raw);need(sha.sha256Utf8(t).sha256===sha.sha256Bytes(raw).sha256,"The working file is not exact UTF-8.");
 const incoming=await validateWork(parseWorkingText(t,file.name));await saveNow();
 if(incoming.package.contentHash===S.work.package.contentHash){
  const merged=combined(S.work,incoming,incoming.draft);if(canonical(S.work.draft)!==canonical(incoming.draft)&&!confirm("Use the opened file's unfinished draft? All immutable saved editions from both copies will be retained. Download the current working copy first if you also need this unfinished draft."))return;
  S.work=merged;S.version++;S.page=0;S.filePage=0;render();await saveNow();announce("Opened the selected draft and retained every compatible saved edition.");return;
 }
 if(!confirm("Open a different original form review? Download this working copy first if its latest edits are only in this tab."))return;
 await installWork(incoming);
}
async function startup(){
 $("viewer-close").addEventListener("click",()=>$("viewer").close());
 window.addEventListener("beforeunload",e=>{if(S.pending||S.recovery||S.version!==S.savedVersion||S.session&&S.version){e.preventDefault();e.returnValue="";}});
 try{
  const embedded=JSON.parse($("colleague-work-data").textContent);await validateWork(embedded);
  try{S.db=await openDB();S.db.onversionchange=()=>{S.db.close();S.db=null;S.session=true;storageMessage();};}catch(e){S.session=true;announce(e.message);}
  await installWork(embedded);
 }catch(e){const main=$("main");main.replaceChildren(node("h2","The working copy could not be opened"),node("p",e.message,"error"),node("p","Keep the complete file and return it to the original review owner. No decision or original source has been changed."));
 if(S.work){const actions=node("div",undefined,"actions");actions.append(button("Download complete current JSON",downloadJSON),button("Continue verified package in this tab",()=>{S.db=null;S.session=true;S.recovery=null;S.pending=null;render();storageMessage();}));main.append(actions);}
 announce("Opening needs attention.");}
}
startup();
})();
