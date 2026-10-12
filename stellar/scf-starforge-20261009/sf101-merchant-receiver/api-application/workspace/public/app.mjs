/**
 * Incremental SHA-256 for complete retained binary downloads, with no runtime imports.
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

const downloadSha256 = (() => {
const module = { exports: {} };
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
return module.exports;
})();

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clone = value => JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const encode = value => encodeURIComponent(String(value));
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
async function canonicalSha256(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
const terminal = new Set(["COMPLETED", "CANCELLED"]);
const state = {
  cap: "", epoch: 0, workspaceId: null, board: null, detail: null,
  route: { page: "overview", id: "", query: new URLSearchParams() },
  routeVersion: 0, fetchVersion: 0, busy: false, db: null, storageError: null,
  editor: null, actions: [], list: [], nextAfter: null, objectUrls: new Set(),
  downloaded: new Map()
};
let dbPromise, writeTail = Promise.resolve(), editorSerial = 0;
const actionLabels = {
  offer_prepare: "Prepare offer", offer_publish: "Publish offer", offer_adopt: "Adopt original offer",
  order_prepare: "Prepare customer handoff", order_adopt: "Adopt original order",
  start: "Start service", stop: "Drain service", attach_pass: "Attach original allowance",
  access: "Change access", recover_call: "Recover saved result", release_call: "Release unused reservation",
  export_usage: "Retain usage export", export_result: "Retain application result",
  backup: "Create encrypted backup", restore: "Restore offer edition", source_refresh: "Refresh original source"
};
function element(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (key in node && !key.startsWith("aria-") && key !== "form") node[key] = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
function text(value, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}
function readable(value) { return text(value).replaceAll("_", " ").toLowerCase(); }
function number(value) { return value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "—"; }
function date(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isFinite(d.valueOf()) ? d.toLocaleString() : String(value);
}
function bytes(value) {
  if (!Number.isSafeInteger(value) || value < 0) return "—";
  if (value < 1024) return value + " B";
  if (value < 1048576) return (value / 1024).toFixed(1) + " KiB";
  if (value < 1073741824) return (value / 1048576).toFixed(1) + " MiB";
  return (value / 1073741824).toFixed(2) + " GiB";
}
function errorText(error) {
  let message = error?.message || (typeof error?.code === "string" ? readable(error.code) : null) ||
    (typeof error?.error === "string" ? readable(error.error) : null) || String(error);
  if (state.cap) message = message.replaceAll(state.cap, "[capability]");
  return message;
}
function notify(message, error = false) {
  const box = $("#notice");
  box.textContent = String(message); box.classList.toggle("error", error); box.hidden = !message;
}
function problem(message, code = "workspace_changed") {
  const e = new Error(message); e.code = code; return e;
}
function badge(value) {
  return element("span", { class: "badge" + (["ATTENTION","RECOVERY_REQUIRED","REPAIR_REQUIRED","REJECTED","UNKNOWN"].includes(value) ? " attention" : "") }, readable(value));
}
function link(label, page, id = "", query = "") {
  return element("a", { href: "#/" + page + (id ? "/" + encode(id) : "") + (query ? "?" + query : "") }, label);
}
function composeLink(label, page, mode, query = "") {
  return link(label, page, "", "compose=" + encode(mode) + (query ? "&" + query : ""));
}
function composeMode(route = state.route) { return !route.id ? route.query.get("compose") : null; }
function external(label, value) {
  if (!value) return null;
  try {
    const url = new URL(value, location.origin);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return element("a", { href: url.href, target: "_blank", rel: "noopener noreferrer", referrerPolicy: "no-referrer" }, label);
  } catch { return null; }
}
function button(label, fn, options = {}) {
  const node = element("button", { type: "button", class: options.primary ? "primary" : (options.quiet ? "quiet" : ""),
    disabled: !!options.disabled, onclick: () => {
      try { (options.gesture ? Promise.resolve(fn()) : Promise.resolve().then(fn)).catch(e => notify(errorText(e), true)); }
      catch (error) { notify(errorText(error), true); }
    } }, label);
  if (options.write) {
    node.dataset.write = "1";
    node.dataset.baseDisabled = options.disabled ? "1" : "0";
    node.disabled = !!options.disabled || state.busy || !state.cap;
  }
  return node;
}
function toolbar(...nodes) { return element("div", { class: "toolbar" }, nodes); }
function panel(title, description, ...nodes) {
  return element("section", { class: "panel" }, title ? element("h3", {}, title) : null,
    description ? element("p", { class: "muted" }, description) : null, nodes);
}
function heading(title, description, ...actions) {
  return element("div", { class: "page-heading" },
    element("div", {}, element("h2", {}, title), description ? element("p", { class: "muted" }, description) : null),
    actions.length ? toolbar(actions) : null);
}
function kv(pairs) {
  return element("dl", { class: "kv" }, pairs.filter(x => x[1] !== undefined).map(([key,value]) =>
    [element("dt", {}, key), element("dd", {}, value instanceof Node ? value : text(value))]));
}
function metrics(pairs) {
  return element("dl", { class: "metrics" }, pairs.map(([label,value,small]) =>
    element("div", { class: "metric" }, element("dt", {}, label),
      element("dd", { class: small ? "small-value" : "" }, text(value)))));
}
function details(label, value) {
  return element("details", {}, element("summary", {}, label),
    element("pre", {}, typeof value === "string" ? value : JSON.stringify(value, null, 2)));
}
function empty(message) { return element("div", { class: "empty" }, message); }
function table(headers, rows) {
  if (!rows.length) return empty("No records in this view.");
  return element("div", { class: "table-wrap" }, element("table", {},
    element("thead", {}, element("tr", {}, headers.map(h => element("th", { scope: "col" }, h)))),
    element("tbody", {}, rows.map(row => element("tr", {}, row.map(cell => element("td", {}, cell)))))));
}
function identity() {
  if (!state.cap || !state.workspaceId) throw problem("Open the original merchant launch link before continuing.", "session_required");
  return { epoch: state.epoch, workspaceId: state.workspaceId };
}
function validIdentity(context) { return !!state.cap && context.epoch === state.epoch && context.workspaceId === state.workspaceId; }
function requireIdentity(context) {
  if (!validIdentity(context)) throw problem("The open workspace changed. Reopen the original workspace and resume its retained operation.");
}
function viewContext() { return { ...identity(), routeVersion: state.routeVersion }; }
function sameView(context) { return validIdentity(context) && context.routeVersion === state.routeVersion; }
function requireView(context) {
  requireIdentity(context);
  if (!sameView(context)) throw problem("The selected view changed. Return to the retained draft before continuing.", "selection_changed");
}
function editorContext(editor = state.editor) {
  return { ...viewContext(), editor, version: editor?.version, dataJson: editor ? JSON.stringify(editor.data) : null };
}
function requireEditor(context) {
  requireView(context);
  if (!context.editor || state.editor !== context.editor || context.editor.version !== context.version ||
      JSON.stringify(context.editor.data) !== context.dataJson) {
    throw problem("The draft changed during this action. Review the current draft and try again.", "draft_changed");
  }
}
function apiUrl(path) {
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/") || url.hash || url.username || url.password) {
    throw problem("Use the original workspace API destination.", "api_destination");
  }
  return url.href;
}
async function request(path, options = {}, context = identity()) {
  requireIdentity(context);
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", "Bearer " + state.cap);
  if (options.method && options.method !== "GET") headers.set("X-Workspace-Request", "1");
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(apiUrl(path), {
    ...options, headers, cache: "no-store", redirect: "error", credentials: "omit", referrerPolicy: "no-referrer"
  });
  requireIdentity(context);
  let value;
  try { value = await response.json(); }
  catch { throw problem("The workspace returned an incomplete JSON response. Reconcile the retained operation before retrying.", "response_incomplete"); }
  requireIdentity(context);
  if (!response.ok) {
    const error = problem(value?.error?.message || value?.message || (typeof value?.error === "string" ? readable(value.error) : null) || ("Workspace request returned HTTP " + response.status),
      value?.error?.code || value?.code || "http_" + response.status);
    error.status = response.status; error.returned = true;
    if (response.status === 401) {
      lock("The local capability expired. Reopen the original launch link; your retained requests remain available.");
    }
    throw error;
  }
  return value;
}
async function openDatabase() {
  if (state.db) return state.db;
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open("stellar-forge-api-merchant-v1", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ["drafts","actions"]) if (!db.objectStoreNames.contains(name)) {
        const store = db.createObjectStore(name, { keyPath: "key" });
        store.createIndex("workspace", "workspace", { unique: false });
      }
    };
    req.onerror = () => reject(req.error || new Error("Local draft storage could not open."));
    req.onblocked = () => reject(new Error("Close the older merchant tab so its retained draft storage can open."));
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); state.db = null; dbPromise = null; };
      resolve(db);
    };
  });
  try {
    state.db = await dbPromise; state.storageError = null;
    $("#local-status").textContent = "Drafts and exact requests are retained in this browser.";
    return state.db;
  } catch (error) {
    dbPromise = null; state.storageError = errorText(error);
    $("#local-status").textContent = "Draft storage unavailable: " + state.storageError;
    throw error;
  }
}
function workspaceKey(id = state.workspaceId) { return JSON.stringify([location.origin, id]); }
function recordKey(kind, id, workspaceId = state.workspaceId) {
  return JSON.stringify([location.origin, workspaceId, kind, id]);
}
async function dbRead(store, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly"); const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function dbList(store, workspaceId = state.workspaceId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).index("workspace").getAll(workspaceKey(workspaceId));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
function dbWrite(store, record) {
  const saved = clone(record);
  const job = writeTail.catch(() => {}).then(async () => {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(saved);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("The retained record could not be saved."));
      tx.onabort = () => reject(tx.error || new Error("The retained record save was interrupted."));
    });
    return saved;
  });
  writeTail = job; return job;
}
async function saveEditor(editor) {
  const record = { key: editor.key, workspace: workspaceKey(editor.workspaceId), workspaceId: editor.workspaceId,
    kind: editor.kind, selector: editor.selector, version: editor.version, data: clone(editor.data),
    baseRevision: editor.baseRevision, sourceSha256: editor.sourceSha256, preview: editor.preview ? clone(editor.preview) : null,
    updatedAt: now() };
  const saved = await dbWrite("drafts", record);
  if (state.editor === editor && editor.version === saved.version) {
    editor.persistedVersion = saved.version;
    const note = $("[data-draft-status]");
    if (note) note.textContent = "Draft saved locally · " + date(saved.updatedAt);
  }
  return saved;
}
function edit(editor, change) {
  if (state.editor !== editor || editor.workspaceId !== state.workspaceId) return;
  change(editor.data); editor.version += 1; editor.preview = null;
  const note = $("[data-draft-status]");
  if (note) note.textContent = "Saving draft…";
  $$("[data-preview]").forEach(node => node.remove());
  $$("[data-requires-preview]").forEach(node => { node.disabled = true; node.dataset.baseDisabled = "1"; });
  saveEditor(editor).catch(error => {
    if (state.editor === editor) {
      if (note?.isConnected) note.textContent = "Draft not saved: " + errorText(error);
      notify("Draft storage failed. The current fields remain on screen; save them before dispatching.", true);
    }
  });
}
async function loadEditor(kind, selector, defaults, context) {
  const key = recordKey(kind, selector, context.workspaceId);
  const cached = state.editors.get(key);
  if (cached) { requireView(context); state.editor = cached; return cached; }
  await writeTail.catch(() => {}); requireView(context);
  const saved = await dbRead("drafts", key); requireView(context);
  const editor = {
    key, kind, selector, workspaceId: context.workspaceId, serial: ++editorSerial,
    version: saved?.version || 0, persistedVersion: saved?.version ?? -1,
    data: clone(saved?.data || defaults), baseRevision: saved?.baseRevision ?? state.board.workspace.revision,
    sourceSha256: saved?.sourceSha256 || state.board.workspace.source.sha256,
    preview: saved?.preview || null
  };
  state.editors.set(key, editor);
  if (!saved) await saveEditor(editor);
  requireView(context); state.editor = editor; return editor;
}
function field(label, value, onChange, options = {}) {
  const id = "field-" + uuid();
  let input;
  if (options.choices) {
    input = element("select", { id, required: !!options.required }, options.choices.map(choice =>
      element("option", { value: choice.value, selected: String(choice.value) === String(value), disabled: !!choice.disabled }, choice.label)));
  } else if (options.multiline) {
    input = element("textarea", { id, rows: options.rows || 3, value: value ?? "", required: !!options.required,
      maxLength: options.maxLength || 6000 });
  } else {
    input = element("input", { id, type: options.type || "text", value: value ?? "", required: !!options.required,
      min: options.min, max: options.max, step: options.step, maxLength: options.maxLength || 1000,
      readOnly: !!options.readOnly, spellcheck: false, autocomplete: "off" });
  }
  input.addEventListener(options.choices ? "change" : "input", () => onChange(input.value));
  if (options.disabled) input.disabled = true;
  return element("div", { class: "field" + (options.full ? " full" : "") },
    element("label", { htmlFor: id }, label), input, options.hint ? element("p", { class: "hint" }, options.hint) : null);
}
function draftField(editor, name, label, options = {}) {
  return field(label, editor.data[name], value => edit(editor, data => { data[name] = value; }), options);
}
function draftNote(editor) {
  return element("p", { class: "draft-status", dataset: { draftStatus: "1" } },
    "Retained draft · workspace revision " + editor.baseRevision + " · " +
    (editor.persistedVersion === editor.version ? "saved locally" : "saving"));
}
function integer(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (value === "" || value === null || value === undefined) throw new Error(label + " is required.");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(label + " must be a whole number from " + min + " to " + max + ".");
  return n;
}
function nonempty(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " is required.");
  return value.trim();
}
function markBusy() {
  $("#main").setAttribute("aria-busy", String(state.busy));
  $$("[data-write]").forEach(node => { node.disabled = state.busy || !state.cap || node.dataset.baseDisabled === "1"; });
}
function gate(fn) {
  if (state.busy) { notify("An action is being retained or dispatched. Wait for its acknowledgement, then continue."); return Promise.resolve(); }
  state.busy = true; markBusy();
  return (async () => {
    try { return await fn(); }
    catch (error) { notify(errorText(error), true); }
    finally { state.busy = false; markBusy(); }
  })();
}
function sourceRevisionWarning(editor) {
  if (editor.baseRevision === state.board.workspace.revision && editor.sourceSha256 === state.board.workspace.source.sha256) return null;
  const context = editorContext(editor);
  return element("div", { class: "callout" },
    element("strong", {}, "This draft was retained against an earlier workspace revision."),
    element("p", {}, "Review the current source and selection below before creating a new operation. The existing fields remain intact."),
    button("Use reviewed current revision", () => gate(async () => {
      requireEditor(context);
      editor.baseRevision = state.board.workspace.revision;
      editor.sourceSha256 = state.board.workspace.source.sha256;
      editor.version += 1; editor.preview = null;
      const updated = editorContext(editor); await saveEditor(editor); requireEditor(updated); render();
    }), { write: true }));
}
async function loadLocalActions(context = identity()) {
  const actions = await dbList("actions", context.workspaceId); requireIdentity(context);
  state.actions = actions.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
async function retainAction(kind, fields, label, context, expectedRevision, original = null) {
  requireView(context);
  const id = uuid();
  const path = original ? "/api/operations/" + encode(original.id) + "/resume" : "/api/actions/" + kind;
  const body = original ? { requestSha256: original.requestSha256 } :
    { operationId: id, expectedRevision, ...clone(fields) };
  const action = {
    key: recordKey("action", id, context.workspaceId), workspace: workspaceKey(context.workspaceId),
    workspaceId: context.workspaceId, id, operationId: original?.id || id, kind: original ? "resume" : kind,
    expectedKind: original?.kind || kind,
    label, path, requestJson: JSON.stringify(body), status: "PREPARED", createdAt: now(), updatedAt: now(),
    acknowledgement: null, error: null
  };
  await dbWrite("actions", action); requireView(context);
  state.actions.unshift(action); return action;
}
function acknowledgement(value, expectedId) {
  const op = value?.operation;
  if (!op || op.id !== expectedId || typeof op.status !== "string" || typeof op.requestSha256 !== "string") {
    throw problem("The returned operation identity differs. Reconcile the retained original request before continuing.", "operation_response");
  }
  return { operationId: op.id, status: op.status, requestSha256: op.requestSha256,
    workspaceRevision: value.workspaceRevision ?? null };
}
async function verifyAcknowledgement(value, action, context, readback = false) {
  const ack = acknowledgement(value, action.operationId);
  const op = value.operation;
  const original = JSON.parse(action.requestJson);
  const expectedHash = action.kind === "resume" ? original.requestSha256 : await canonicalSha256(original);
  requireIdentity(context);
  if (ack.requestSha256 !== expectedHash || (action.expectedKind && op.kind !== action.expectedKind)) {
    throw problem("The returned operation differs from the retained original request and action. Keep the original request and reopen its recorded workspace.", "operation_binding");
  }
  if (readback && action.kind !== "resume" && canonical(op.request) !== canonical(original)) {
    throw problem("The saved server request differs from the original retained browser request.", "operation_request_binding");
  }
  return ack;
}
async function dispatchAction(action, context) {
  requireIdentity(context);
  if (action.workspaceId !== context.workspaceId) throw problem("This request belongs to a different original workspace.");
  const sent = { ...action, status: "DISPATCHING", updatedAt: now(), error: null };
  await dbWrite("actions", sent); requireIdentity(context); Object.assign(action, sent);
  let value;
  try { value = await request(action.path, { method: "POST", body: action.requestJson }, context); }
  catch (error) {
    const failed = { ...action, status: error.returned && error.status >= 400 && error.status < 500 &&
      ![408,429].includes(error.status) ? "REJECTED" : "UNKNOWN",
      updatedAt: now(), error: { message: errorText(error), code: error.code || null, status: error.status || null } };
    try { await dbWrite("actions", failed); Object.assign(action, failed); }
    catch (storageError) { notify("The original request remains retained. Its latest response could not be saved: " + errorText(storageError), true); }
    error.message = "Original operation " + action.operationId + ": " + errorText(error) + " Open Operations to reconcile its retained request.";
    throw error;
  }
  const ack = await verifyAcknowledgement(value, action, context);
  const complete = { ...action, status: "ACKNOWLEDGED", acknowledgement: ack, error: null, updatedAt: now() };
  try { await dbWrite("actions", complete); Object.assign(action, complete); }
  catch (error) {
    action.acknowledgement = ack;
    notify("The server retained operation " + ack.operationId + ". Its browser acknowledgement could not be saved. Reconcile this same operation after storage recovers.", true);
    return { operation: value.operation, persisted: false };
  }
  return { operation: value.operation, persisted: true };
}
function perform(kind, fields, label, options = {}) {
  const context = options.context || viewContext();
  const editor = options.editor || null;
  const editorGuard = editor ? editorContext(editor) : null;
  const revision = options.expectedRevision ?? editor?.baseRevision ?? state.board.workspace.revision;
  return gate(async () => {
    requireView(context);
    if (editorGuard) {
      requireEditor(editorGuard);
      await saveEditor(editor); requireEditor(editorGuard);
    }
    const action = await retainAction(kind, fields, label || actionLabels[kind], context, revision);
    if (editorGuard) requireEditor(editorGuard);
    const result = await dispatchAction(action, context);
    if (!validIdentity(context)) return;
    if (result.persisted) notify((actionLabels[kind] || label) + " retained as " + result.operation.id + ". Refresh its operation to read completion.");
    if (sameView(context) && result.persisted) {
      location.hash = "#/operations/" + encode(result.operation.id);
    }
  });
}
function resumeOperation(operation) {
  const context = viewContext();
  return gate(async () => {
    if (operation.status !== "ATTENTION") throw new Error("Read the current original operation before resuming.");
    const action = await retainAction("resume", {}, "Resume " + (actionLabels[operation.kind] || operation.kind),
      context, null, operation);
    const result = await dispatchAction(action, context);
    if (sameView(context) && result.persisted) {
      notify("The original operation continuation was acknowledged.");
      await refresh();
    }
  });
}
function retryAction(saved) {
  const context = viewContext();
  return gate(async () => {
    const action = await dbRead("actions", saved.key); requireView(context);
    if (!action || action.requestJson !== saved.requestJson || action.path !== saved.path) {
      throw new Error("Read the unchanged retained request before retrying.");
    }
    const result = await dispatchAction(action, context);
    await loadLocalActions(context);
    if (sameView(context) && result.persisted) location.hash = "#/operations/" + encode(result.operation.id);
  });
}
function reconcileAction(saved) {
  const context = viewContext();
  return gate(async () => {
    const action = await dbRead("actions", saved.key); requireView(context);
    if (!action || action.requestJson !== saved.requestJson) throw new Error("The retained request changed.");
    let value;
    try { value = await request("/api/operations/" + encode(action.operationId), {}, context); }
    catch (error) {
      if (error.status === 404) {
        notify("The server has no saved operation for this ID. The original exact request remains available under Retry exact request.");
        return;
      }
      throw error;
    }
    const op = value.operation || value;
    const ack = await verifyAcknowledgement({ operation: op, workspaceRevision: null }, action, context, true);
    const completed = { ...action, status: "ACKNOWLEDGED", acknowledgement: ack, error: null, updatedAt: now() };
    await dbWrite("actions", completed); requireIdentity(context); await loadLocalActions(context);
    if (sameView(context)) {
      notify("The original server operation was recovered.");
      location.hash = "#/operations/" + encode(op.id);
      if (state.route.page === "operations" && state.route.id === op.id) await refresh();
    }
  });
}
function renderLocalActions() {
  const pending = state.actions.filter(a => a.status !== "ACKNOWLEDGED");
  if (!pending.length) return null;
  return panel("Retained browser requests", "An interrupted response can be reconciled by its original operation ID.",
    table(["Action","Original operation","Local state","Continue"], pending.map(action => [
      element("div", {}, action.label, action.error ? element("p", { class: "muted" }, action.error.message) : null),
      element("code", {}, action.operationId), badge(action.status),
      toolbar(button("Reconcile", () => reconcileAction(action), { write: true }),
        ["PREPARED","DISPATCHING","UNKNOWN"].includes(action.status)
          ? button("Retry exact request", () => retryAction(action), { write: true }) : null,
        button("Read request", () => {
          const box = $("[data-local-request]"); if (box) box.replaceChildren(details(action.label, JSON.parse(action.requestJson)));
        }))
    ])), element("div", { dataset: { localRequest: "1" } }));
}


function source() { return state.board.workspace.source; }
function offers() { return state.board.workspace.offers || []; }
function orders() { return state.board.workspace.orders || []; }
function offerName(id) { return offers().find(o => o.id === id)?.title || id || "—"; }
function operationOf(value) { return value?.operation || value; }
function paymentView(payment = source().checkout?.payment || {}) {
  const entries = [
    ["Network", payment.network], ["Asset", payment.asset],
    ["Amount (atomic)", payment.amountAtomic ?? payment.amount],
    ["Recipient", payment.payTo ?? payment.recipient],
    ["Payment scheme", payment.scheme]
  ].filter(x => x[1] !== undefined).map(([k,v]) => [k, typeof v === "object" ? JSON.stringify(v) : v]);
  return element("div", {}, kv(entries), details("Original deployed payment terms", payment));
}
function sourceLinks() {
  const links = source().links || {};
  const entries = Array.isArray(links) ? links.map(x => [x.label || x.title || x.name, x.url || x.href]) : Object.entries(links);
  return toolbar(entries.map(([label,value]) => external(label, typeof value === "object" ? value.url || value.href : value)).filter(Boolean));
}
function serviceView(compact = false) {
  const service = state.board.service || { status: "STOPPED" };
  const counts = service.worker?.counts || {};
  const body = [
    kv([["Status", badge(service.status)], ["Selected offer", service.offerId ? link(offerName(service.offerId),"offers",service.offerId) : "—"],
      ["Worker origin", service.workerOrigin], ["API endpoint", service.apiUrl]]),
    Object.keys(counts).length ? metrics(Object.entries(counts).map(([label,value]) => [readable(label),number(value)])) : null,
    service.error ? element("div", { class: "callout" }, errorText(service.error)) : null,
    toolbar(external("Open original access console", service.consoleUrl),
      button("Drain service", () => perform("stop", {}, "Drain service"), {
        write: true, disabled: !["RUNNING","STARTING","ATTENTION"].includes(service.status)
      }), compact ? link("Service and backup","service") : null)
  ];
  return panel("Native service", "Draining waits for the original worker to stop before closing its allowance and result stores.", body);
}
function renderOverview() {
  const workspace = state.board.workspace;
  const attention = (workspace.operations || []).filter(x => x.status === "ATTENTION").length;
  const sourceInfo = source();
  const functions = sourceInfo.functions || [];
  return [
    heading("Merchant overview", "Prepare an offer, retain the customer handoff, and operate the original paid application."),
    metrics([["Ready offers", offers().filter(x => x.status === "READY").length],["Orders",orders().length],
      ["Operations needing attention",attention],["Saved exports",(workspace.exports || []).length]]),
    serviceView(true),
    element("div", { class: "grid" },
      panel("Original application", sourceInfo.serviceName || "Selected deployed application",
        kv([["Functions",functions.length],["Original source",element("code",{},sourceInfo.sha256)]]),
        toolbar(composeLink("Design an offer","offers","new"),composeLink("Adopt an existing offer","offers","adopt")),
        details("Selected host files",{merchantPath:sourceInfo.merchantPath,applicationPath:sourceInfo.applicationPath})),
      panel("Deployed checkout", "New offers retain these original payment terms.", paymentView(),
        kv([["Purchase origin",sourceInfo.checkout?.purchaseOrigin],["Purchase path",sourceInfo.checkout?.path],
          ["Original route",sourceInfo.checkout?.routeId]]), sourceLinks())),
    panel("Available functions", "Route paths and methods come from the original application.",
      table(["Function","Path","Description","Execution limits"],functions.map(fn=>[
        element("strong",{},fn.id),element("code",{},"POST "+fn.path),element("div",{},text(fn.description),fn.apiCompatible===false?element("p",{class:"hint"},"Uses original paid-job file intake; not selectable in the JSON API worker."):null),
        element("div",{}, "Timeout: "+number(fn.timeoutMs)+" ms",
          element("div",{class:"muted"},"Input "+bytes(fn.maxInputBytes)+" · output "+bytes(fn.maxOutputBytes)))
      ]))),
    renderLocalActions()
  ];
}
function renderOffers() {
  return [
    heading("Offers","Each prepared offer retains the original function routes, allowance and deployed payment terms.",
      composeLink("Design offer","offers","new"),composeLink("Adopt original files","offers","adopt")),
    panel("Offer inventory",null,table(["Offer","State","Allowance","Endpoints","Source"],offers().map(offer=>[
      element("div",{},link(offer.title,"offers",offer.id),element("div",{class:"muted"},date(offer.createdAt))),
      badge(offer.status),number(offer.plan?.allowanceUnits),
      element("div",{},"Worker "+number(offer.ports?.worker),element("div",{class:"muted"},"API "+number(offer.ports?.api))),
      element("code",{},offer.sourceSha256)
    ])))
  ];
}
function offerDraft(editor) {
  const d = editor.data;
  if (String(d.title).trim().length > 160) throw new Error("Offer title must be 160 characters or fewer.");
  if (d.routes.length < 1 || d.routes.length > 64) throw new Error("Select 1–64 original function routes.");
  if (new Set(d.routes.map(row => row.functionId)).size !== d.routes.length) throw new Error("Each original function can appear once in an offer.");
  if (Number(d.apiPort) !== 0 && Number(d.apiPort) === Number(d.workerPort)) throw new Error("Choose different worker and API ports.");
  return {
    title: nonempty(d.title,"Offer title"),
    allowanceUnits: integer(d.allowanceUnits,"Allowance",1),
    workerPort: integer(d.workerPort,"Worker port",1,65535),
    apiPort: integer(d.apiPort,"API port",0,65535),
    routes: d.routes.map((row,index)=>{if(!/^[A-Za-z0-9_-]{1,80}$/.test(row.id||""))throw new Error("Route "+(index+1)+" ID must use 1–80 letters, digits, underscores or hyphens.");
      const original=(source().functions||[]).find(fn=>fn.id===row.functionId);
      if(!original||original.apiCompatible===false)throw new Error("Choose an original JSON API function for route "+(index+1)+".");
      return ({
      id: nonempty(row.id,"Route "+(index+1)+" ID"),
      functionId: nonempty(row.functionId,"Route "+(index+1)+" function"),
      units: integer(row.units,"Route "+(index+1)+" units",1,integer(d.allowanceUnits,"Allowance",1)),
      timeoutSeconds: integer(row.timeoutSeconds,"Route "+(index+1)+" timeout",1,120)
    });})
  };
}
function renderRouteDesigner(editor) {
  const functions = (source().functions || []).filter(fn => fn.apiCompatible !== false);
  return element("div",{},editor.data.routes.map((route,index)=>{
    const selected = functions.find(x=>x.id===route.functionId);
    const change = (name,value) => edit(editor,data=>{data.routes[index][name]=value;});
    return element("section",{class:"route-card"},
      element("div",{class:"route-card-header"},element("h4",{},"Route "+(index+1)),
        button("Remove route",()=>{edit(editor,data=>{data.routes.splice(index,1);});render();},{write:true,disabled:editor.data.routes.length===1})),
      element("div",{class:"form-grid three"},
        field("Original function",route.functionId,value=>{
          change("functionId",value);
          const current=source().functions.find(x=>x.id===value);
          const output=$("#route-source-"+index);
          if(output)output.textContent=current?"POST "+current.path+" · "+(current.description||current.id):"Choose an original function.";
        },{required:true,choices:[{value:"",label:"Choose function"},...functions.map(fn=>({value:fn.id,label:fn.id}))]}),
        field("Route ID",route.id,value=>change("id",value),{required:true,maxLength:80,hint:"Letters, digits, underscore or hyphen."}),
        field("Allowance units per call",route.units,value=>change("units",value),{required:true,type:"number",min:1,step:1}),
        field("Timeout (seconds)",route.timeoutSeconds,value=>change("timeoutSeconds",value),{required:true,type:"number",min:1,max:120,step:1})),
      element("p",{class:"route-source",id:"route-source-"+index},selected?"POST "+selected.path+" · "+(selected.description||selected.id):"Choose an original function."),
      selected?details("Original function input and example",{inputSchema:selected.inputSchema,example:selected.example}):null);
  }));
}
function previewPanel(editor) {
  const preview = editor.preview;
  if (!preview) return null;
  let same = false;
  try { same = JSON.stringify(offerDraft(editor)) === preview.requestJson; } catch {}
  if (!same) return null;
  const p = preview.response;
  return element("section",{class:"panel",dataset:{preview:"1"}},
    element("h3",{},"Reviewed offer preview"),
    kv([["Original source",element("code",{},p.sourceSha256)],["Allowance",number(p.plan?.allowanceUnits)],
      ["Purchase origin",p.checkout?.purchaseOrigin],["Original purchase path",p.checkout?.path],
      ["Original worker port",number(p.ports?.worker)],["Selected API port",p.ports?.api===0?"Available local port":number(p.ports?.api)]]),
    table(["Route","Original function","Method and path","Units","Timeout"],(p.plan?.routes||[]).map((route,index)=>[
      text(route.id),text(editor.data.routes[index]?.functionId),element("code",{},text(route.method,"POST")+" "+text(route.path)),
      number(route.units),number(editor.data.routes[index]?.timeoutSeconds)+" seconds"
    ])),
    paymentView(p.checkout?.payment || {}),
    details("Complete normalized plan",p.plan),
    toolbar(button("Prepare this reviewed offer",()=>{
      const current = offerDraft(editor);
      if (JSON.stringify(current) !== preview.requestJson || editor.preview !== preview) throw new Error("Preview the current draft before preparation.");
      return perform("offer_prepare",{expectedSourceSha256:p.sourceSha256,...current},"Prepare reviewed offer",{editor});
    },{write:true,primary:true})));
}
function renderOfferDesigner() {
  const editor = state.editor;
  const d = editor.data;
  const form = element("form",{onsubmit:event=>event.preventDefault()},
    draftNote(editor),sourceRevisionWarning(editor),
    element("div",{class:"form-grid"},
      draftField(editor,"title","Offer title",{required:true,maxLength:160}),
      draftField(editor,"allowanceUnits","Purchased allowance units",{required:true,type:"number",min:1,step:1}),
      draftField(editor,"workerPort","Original worker port",{required:true,type:"number",min:1,max:65535,step:1}),
      draftField(editor,"apiPort","Allowance API port",{required:true,type:"number",min:0,max:65535,step:1,
        hint:"Use 0 to follow the configured customer port for a direct loopback API URL; with an external HTTPS or proxy URL, 0 selects an available local port. The preview shows the actual selection."})),
    renderRouteDesigner(editor),
    toolbar(button("Add function route",()=>{
      const first=(source().functions||[]).find(fn=>fn.apiCompatible!==false);
      edit(editor,data=>data.routes.push({id:"route-"+uuid().slice(0,8),functionId:first?.id||"",units:"1",timeoutSeconds:String(Math.min(120,Math.max(1,Math.ceil((first?.timeoutMs||30000)/1000))))}));
      render();
    },{write:true})),
    element("div",{class:"form-actions"},
      button("Preview original offer",()=>gate(async()=>{
        if(!form.reportValidity())return;
        const context=editorContext(editor),draft=offerDraft(editor);
        if(!draft.routes.length)throw new Error("Add at least one original function route.");
        if(new Set(draft.routes.map(x=>x.id)).size!==draft.routes.length)throw new Error("Route IDs must be unique.");
        await saveEditor(editor);requireEditor(context);
        const response=await request("/api/preview",{method:"POST",body:JSON.stringify(draft)},context);
        requireEditor(context);
        if(typeof response.sourceSha256!=="string"||!response.plan)throw new Error("The original preview is incomplete.");
        editor.preview={requestJson:JSON.stringify(draft),response,createdAt:now()};
        editor.version+=1;const reviewed=editorContext(editor);
        await saveEditor(editor);requireEditor(reviewed);render();
        notify("The normalized original offer is ready for review.");
      }),{write:true,primary:true}),
      button("Save draft",()=>gate(async()=>{const context=editorContext(editor);await saveEditor(editor);requireEditor(context);notify("Offer draft saved.");}),{write:true})));
  return [heading("Design an offer","Select original functions and set their allowance units. Payment terms remain the deployed checkout terms.",link("Offer inventory","offers")),
    panel("Offer and routes",null,form),previewPanel(editor),
    panel("Original checkout terms",null,paymentView())];
}
function renderAdoptOffer() {
  const editor=state.editor;
  const form=element("form",{onsubmit:event=>event.preventDefault()},draftNote(editor),sourceRevisionWarning(editor),
    element("div",{class:"form-grid"},
      draftField(editor,"label","Offer label",{required:true,maxLength:240,full:true}),
      draftField(editor,"profilePath","Original application profile path",{required:true,full:true,
        hint:"An existing absolute path on the merchant host."}),
      draftField(editor,"planFile","Original purchased plan file",{required:true,full:true})),
    element("div",{class:"form-actions"},button("Adopt original offer files",()=>{
      if(!form.reportValidity())return;
      return perform("offer_adopt",{label:nonempty(editor.data.label,"Label"),profilePath:nonempty(editor.data.profilePath,"Original profile path"),planFile:nonempty(editor.data.planFile,"Original plan file")},"Adopt original offer",{editor});
    },{write:true,primary:true})));
  return [heading("Adopt an original offer","Join existing profile and plan files to this merchant workspace.",link("Offer inventory","offers")),
    panel("Original host files",null,form)];
}
function renderOffer() {
  const detail=state.detail,offer=detail.offer;
  const routes=offer.plan?.routes||[];
  return [heading(offer.title,"Retained offer edition "+offer.id,link("Offer inventory","offers")),
    metrics([["State",readable(offer.status),true],["Allowance units",number(offer.plan?.allowanceUnits)],
      ["Worker port",number(offer.ports?.worker)],["API port",number(offer.ports?.api)]]),
    panel("Offer actions",null,toolbar(
      button("Publish retained offer",()=>perform("offer_publish",{offerId:offer.id}),{write:true,primary:true,disabled:offer.status!=="PREPARED"}),
      button("Start original service",()=>perform("start",{offerId:offer.id}),{write:true,disabled:offer.status!=="READY"||["RUNNING","STARTING","STOPPING"].includes(state.board.service?.status)}),
      composeLink("Prepare customer handoff","orders","new","offerId="+encode(offer.id)),
      link("Read original executions","executions","","offerId="+encode(offer.id))),
      kv([["Source SHA-256",element("code",{},offer.sourceSha256)],["Created",date(offer.createdAt)],
        ["Restored from",offer.restoredFrom?typeof offer.restoredFrom==="string"?offer.restoredFrom:JSON.stringify(offer.restoredFrom):undefined]]),
      details("Retained original files",{profilePath:offer.profilePath,planFile:offer.planFile,files:detail.files})),
    panel("Purchased routes",null,table(["Route","Method","Path","Units"],routes.map(route=>[
      route.id,route.method,element("code",{},route.path),number(route.units)
    ])),details("Complete original plan",offer.plan))
  ];
}
function offerOptions(ready=false) {
  return [{value:"",label:"Choose retained offer"},...offers().filter(o=>!ready||o.status==="READY").map(o=>({
    value:o.id,label:o.title+" · "+readable(o.status)
  }))];
}
function renderOrders() {
  return [heading("Orders and access","Retain original order handoffs, observe settled allowance and recover interrupted calls.",
    composeLink("Prepare order","orders","new"),composeLink("Adopt original order","orders","adopt")),
    panel("Original orders",null,table(["Order","Offer","Created","Saved handoff"],orders().map(order=>[
      element("div",{},link(order.label||order.orderReference,"orders",order.orderReference),element("div",{class:"mono muted"},order.orderReference)),
      link(offerName(order.offerId),"offers",order.offerId),date(order.createdAt),
      order.handoffExportId?link("Open complete handoff","exports",order.handoffExportId):"—"
    ])))];
}
function renderOrderDraft(adopt=false) {
  const editor=state.editor;
  const form=element("form",{onsubmit:event=>event.preventDefault()},draftNote(editor),sourceRevisionWarning(editor),
    element("div",{class:"form-grid"},
      draftField(editor,"offerId","Original offer",{choices:offerOptions(),required:true,full:true}),
      draftField(editor,"orderReference","Original order reference",{required:true,maxLength:80,hint:"Letters, digits, period, underscore, colon or hyphen."}),
      draftField(editor,"label","Customer handoff label",{required:true,maxLength:240})),
    element("div",{class:"form-actions"},button(adopt?"Adopt original order":"Prepare customer handoff",()=>{
      if(!form.reportValidity())return;
      if(!/^[A-Za-z0-9._:-]{1,80}$/.test(editor.data.orderReference||""))throw new Error("Use an original order reference of 1–80 letters, digits, periods, underscores, colons or hyphens.");
      return perform(adopt?"order_adopt":"order_prepare",{
        offerId:nonempty(editor.data.offerId,"Offer"),orderReference:nonempty(editor.data.orderReference,"Order reference"),
        label:nonempty(editor.data.label,"Label")
      },adopt?"Adopt original order":"Prepare customer handoff",{editor});
    },{write:true,primary:true})));
  return [heading(adopt?"Adopt original order":"Prepare customer handoff",
    adopt?"Attach an existing original order to its exact retained offer.":"Create the original customer handoff for the selected offer and order reference.",link("Order inventory","orders")),
    panel("Order selection",null,form),panel("Original payment terms",null,paymentView())];
}


function renderOrder() {
  const detail=state.detail,order=detail.order,pass=detail.pass,editor=state.editor;
  const access=pass?.native?.access;
  const calls=state.list;
  const accessForm=pass&&access?element("form",{onsubmit:event=>event.preventDefault()},
    draftNote(editor),sourceRevisionWarning(editor),
    kv([["Displayed access revision",number(access.revision)],["Current access",badge(access.state)],
      ["Expiry",access.expiresAt?date(access.expiresAt):"No retained expiry"]]),
    element("div",{class:"form-grid"},
      draftField(editor,"accessAction","Access action",{required:true,choices:[
        {value:"suspend",label:"Suspend access"},{value:"resume",label:"Resume access"},
        {value:"expire",label:"Set expiry"},{value:"clear-expiry",label:"Clear expiry"}
      ]}),
      draftField(editor,"expiresAt","Expiry (local time)",{type:"datetime-local",
        hint:"Required for Set expiry. The request retains the corresponding UTC timestamp."}),
      draftField(editor,"accessReason","Reason for this access change",{required:true,multiline:true,full:true})),
    element("div",{class:"form-actions"},button("Apply selected access action",()=>{
      const action=nonempty(editor.data.accessAction,"Access action");
      const fields={orderReference:order.orderReference,accessRevision:access.revision,action,
        reason:nonempty(editor.data.accessReason,"Reason")};
      if(action==="expire"){
        const expiry=new Date(nonempty(editor.data.expiresAt,"Expiry"));
        if(!Number.isFinite(expiry.valueOf()))throw new Error("Select a valid expiry time.");
        fields.expiresAt=expiry.toISOString();
      }
      return perform("access",fields,"Change original access",{editor});
    },{write:true}))) : null;
  const selected=calls.find(call=>call.requestId===editor.data.selectedRequestId);
  const recovery=selected?panel("Selected allowance call",null,
    kv([["Original request",element("code",{},selected.requestId)],["Route",selected.routeId],
      ["State",badge(selected.status)],["Displayed call revision",number(selected.revision)],
      ["Reserved units",number(selected.units)],["Original request SHA-256",element("code",{},selected.requestSha256)]]),
    selected.errorCode?element("p",{class:"callout"},selected.errorCode):null,
    selected.result?kv([["Saved result",bytes(selected.result.bytes)],["Content type",selected.result.contentType],
      ["Result SHA-256",element("code",{},selected.result.sha256)]]) : null,
    ["RECOVERY_REQUIRED","CONSUMED"].includes(selected.status)&&!selected.result?[
      draftField(editor,"callReason","Recovery or release reason",{multiline:true,required:true}),
      element("p",{class:"hint"},"Recover uses the original saved native result. Release is accepted only when the original execution is cancelled and has zero attempts."),
      toolbar(
        button("Recover saved result",()=>perform("recover_call",{
          offerId:order.offerId,orderReference:order.orderReference,requestId:selected.requestId,
          callRevision:selected.revision,reason:nonempty(editor.data.callReason,"Recovery reason")
        },"Recover original saved result",{editor}),{write:true,primary:true}),
        selected.status==="RECOVERY_REQUIRED"?button("Release unused reservation",()=>perform("release_call",{
          offerId:order.offerId,orderReference:order.orderReference,requestId:selected.requestId,
          callRevision:selected.revision,reason:nonempty(editor.data.callReason,"Release reason")
        },"Release original unused reservation",{editor}),{write:true}):null)
    ] : element("p",{class:"muted"},selected.status==="IN_FLIGHT"?
      "The original request is still in flight. Refresh to read its native outcome.":"This call is retained in its original terminal state."),
    toolbar(link("Inspect original executions","executions","","offerId="+encode(order.offerId))),
    details("Complete original call",selected)) : null;
  return [
    heading(order.label||order.orderReference,"Original order "+order.orderReference,link("Order inventory","orders")),
    panel("Customer handoff",null,
      kv([["Offer",link(offerName(order.offerId),"offers",order.offerId)],["Created",date(order.createdAt)],
        ["Native entitlement",text(pass?.native?.nativeState??detail.native?.state)]]),
      toolbar(order.handoffExportId?link("Open original customer handoff","exports",order.handoffExportId):null,
        order.credentialExportId?link("Open retained customer credential","exports",order.credentialExportId):null,
        button("Attach original allowance",()=>perform("attach_pass",{orderReference:order.orderReference}),{write:true}),
        pass?button("Retain complete usage export",()=>perform("export_usage",{orderReference:order.orderReference}),{write:true}):null),
      detail.error?element("div",{class:"callout"},errorText(detail.error)):null),
    pass?metrics([["Purchased units",number(pass.usage?.allowanceUnits)],["Consumed",number(pass.usage?.consumedUnits)],
      ["Reserved",number(pass.usage?.reservedUnits)],["Available",number(pass.usage?.availableUnits)]]):empty("Attach the original settled allowance to read access and usage."),
    pass?element("div",{class:"grid"},
      panel("Original access",null,accessForm,
        toolbar(external("Open original access console",state.board.service?.consoleUrl)),
        element("p",{class:"hint"},"Customer token rotation remains in the original access console.")),
      panel("Allowance record",null,
        kv([["Manifest",badge(pass.manifest?.status)],["Completed calls",number(pass.usage?.completedCalls)],
          ["Consumed without a result",number(pass.usage?.consumedCallsWithoutResult)],["Released calls",number(pass.usage?.releasedCalls)],
          ["Network",pass.native?.network],["Payment amount (atomic)",pass.native?.amountAtomic],
          ["Original event",pass.native?.eventId],["Plan SHA-256",element("code",{},pass.planSha256)]]),
        details("Original native entitlement",pass.native))):null,
    pass?panel("Allowance calls","Select an original call to inspect its retained revision and recovery options.",
      table(["Request","Route","Units","State","Result","Review"],calls.map(call=>[
        element("div",{},element("code",{},call.requestId),element("div",{class:"muted"},date(call.startedAt))),
        element("div",{},call.routeId,element("div",{class:"muted"},call.method+" "+call.path)),
        number(call.units),badge(call.status),
        call.result?bytes(call.result.bytes)+" · HTTP "+call.result.status:"—",
        button("Inspect call",()=>{edit(editor,data=>{data.selectedRequestId=call.requestId;});render();})
      ])),
      state.nextAfter!=null?toolbar(button("Load more calls",()=>loadMoreCalls())):null):null,
    recovery
  ];
}
async function loadMoreCalls() {
  const context=viewContext(),cursor=state.nextAfter,ref=state.route.id;
  if(cursor==null)return;
  const result=await request("/api/orders/"+encode(ref)+"?after="+encode(cursor)+"&limit=50",{},context);
  requireView(context);
  if(state.nextAfter!==cursor)return;
  const seen=new Set(state.list.map(x=>x.requestId));
  state.list.push(...(result.calls?.calls||[]).filter(x=>!seen.has(x.requestId)));
  state.nextAfter=result.calls?.nextAfter??null;render();
}
function executionOffer() { return state.route.query.get("offerId") || ""; }
function renderExecutions() {
  const offerId=executionOffer();
  return [
    heading("Original executions","Read the original application queue, attempt history and immutable results."),
    panel("Offer selection",null,field("Retained offer",offerId,value=>{
      location.hash="#/executions"+(value?"?offerId="+encode(value):"");
    },{choices:offerOptions()})),
    !offerId?empty("Select a retained offer to read its original execution store."):
      panel("Native execution records",null,
        table(["Execution","Original request","Function","State","Updated","Result"],state.list.map(execution=>[
          link(execution.id,"executions",execution.id,"offerId="+encode(offerId)),
          element("div",{},text(execution.payment?.orderRef),element("div",{class:"mono muted"},text(execution.payment?.requestId))),
          execution.functionId,badge(execution.state),date(execution.updatedAt),
          execution.result?bytes(execution.result.bytes):"—"
        ])),
        state.nextAfter!=null?toolbar(button("Load more executions",()=>loadMoreExecutions())):null)
  ];
}
async function loadMoreExecutions() {
  const context=viewContext(),cursor=state.nextAfter,offerId=executionOffer();
  if(cursor==null||!offerId)return;
  const result=await request("/api/executions?offerId="+encode(offerId)+"&after="+encode(cursor)+"&limit=50",{},context);
  requireView(context);if(state.nextAfter!==cursor)return;
  const seen=new Set(state.list.map(x=>x.id));
  state.list.push(...(result.executions||[]).filter(x=>!seen.has(x.id)));
  state.nextAfter=result.nextAfter??null;render();
}
function renderExecution() {
  const record=state.detail,execution=record.execution,offerId=executionOffer(),payment=execution.payment||{};
  return [
    heading("Original execution","Retained application job "+execution.id,link("Execution inventory","executions","","offerId="+encode(offerId))),
    metrics([["State",readable(execution.state),true],["Original attempts",(execution.attempts||[]).length],
      ["Allowance units",number(payment.units)],["Saved result",execution.result?bytes(execution.result.bytes):"—",true]]),
    panel("Execution and allowance binding",null,
      kv([["Function",execution.functionId],["Revision",number(execution.revision)],
        ["Original order",payment.orderRef?link(payment.orderRef,"orders",payment.orderRef):"—"],
        ["Original request",element("code",{},payment.requestId)],["Original route",payment.routeId],
        ["Created",date(execution.createdAt)],["Updated",date(execution.updatedAt)],
        ["Input SHA-256",element("code",{},execution.inputSha256)],["Profile SHA-256",element("code",{},record.profileSha256)]]),
      execution.error?element("p",{class:"callout"},errorText(execution.error)):null,
      details("Original source and payment binding",{source:execution.source,payment})),
    execution.result?panel("Immutable result",null,
      kv([["Bytes",bytes(execution.result.bytes)],["Content type",execution.result.contentType],
        ["Filename",execution.result.filename],["SHA-256",element("code",{},execution.result.sha256)]]),
      toolbar(button("Retain complete result file",()=>perform("export_result",{offerId,executionId:execution.id}),{write:true,primary:true}))):null,
    panel("Native attempts",null,
      table(["Attempt","State","Started","Finished","Outcome"],(execution.attempts||[]).map(attempt=>[
        text(attempt.id),badge(attempt.state||attempt.status),date(attempt.startedAt||attempt.createdAt),
        date(attempt.finishedAt),attempt.error?errorText(attempt.error):text(attempt.outcome)
      ])),details("Complete original attempt and history records",{attempts:execution.attempts,history:execution.history}))
  ];
}
function renderOperations() {
  const operations=state.board.workspace.operations||[];
  return [
    heading("Retained operations","Each admitted action keeps its original request, attempts and durable outcome."),
    renderLocalActions(),
    panel("Workspace operations",null,table(["Action","State","Created","Updated","Original operation"],operations.map(operation=>[
      link(actionLabels[operation.kind]||readable(operation.kind),"operations",operation.id),
      badge(operation.status),date(operation.createdAt),date(operation.updatedAt),element("code",{},operation.id)
    ])))
  ];
}
function resultLinks(result) {
  if(!result||typeof result!=="object")return null;
  const links=[];
  const offerId=result.offerId||result.offer?.id;
  const orderRef=result.orderReference||result.order?.orderReference;
  const exportId=result.exportId||result.export?.id||result.handoffExportId;
  if(offerId)links.push(link("Open retained offer","offers",offerId));
  if(orderRef)links.push(link("Open original order","orders",orderRef));
  if(exportId)links.push(link("Open complete saved files","exports",exportId));
  return links.length?toolbar(links):null;
}
function restoredOrderMapping(result) {
  if(!Array.isArray(result?.orderMappings))return null;
  const reasons={
    SAME_ORIGINAL_SNAPSHOT:"Captured original state is unchanged.",
    MISSING_AT_CAPTURE:"This order was created after the captured state.",
    CURRENT_STATE_CHANGED:"Original payment, access or usage advanced after capture.",
    CURRENT_STATE_UNAVAILABLE:"The original current state could not be reopened."
  };
  const rows=result.orderMappings;
  return panel("Restored order selection",
    "Selected orders use the restored offer. Preserved orders continue on their current offer; their later native state remains available.",
    metrics([["Selected restored orders",number(rows.filter(row=>row.status==="SELECTED").length)],
      ["Preserved current orders",number(rows.filter(row=>row.status!=="SELECTED").length)]]),
    table(["Original order","Selection","Reason","Current state observed"],rows.map(row=>[
      link(row.orderReference,"orders",row.orderReference),
      row.status==="SELECTED"?"Restored offer":"Current offer",
      reasons[row.reason]||readable(row.reason),
      date(row.currentObservedAt)
    ])));
}
function renderOperation() {
  const operation=operationOf(state.detail);
  const local=state.actions.find(a=>a.operationId===operation.id&&a.kind!=="resume");
  return [
    heading(actionLabels[operation.kind]||readable(operation.kind),"Retained original operation "+operation.id,link("Operation inventory","operations")),
    panel("Operation state",null,
      kv([["State",badge(operation.status)],["Created",date(operation.createdAt)],["Updated",date(operation.updatedAt)],
        ["Original request SHA-256",element("code",{},operation.requestSha256)],
        ["Reviewed workspace revision",number(operation.request?.expectedRevision)]]),
      operation.error?element("div",{class:"callout"},errorText(operation.error)):null,
      operation.status==="ATTENTION"?[
        element("p",{},"Read the retained error and original request before resuming. The service reconciles saved native outputs before it continues."),
        toolbar(button("Resume original operation",()=>resumeOperation(operation),{write:true,primary:true}))
      ]:null,
      ["QUEUED","RUNNING"].includes(operation.status)?element("p",{class:"callout"},"This operation is active. Use Refresh to read its current outcome."):null,
      resultLinks(operation.result),
      restoredOrderMapping(operation.result),
      details("Original admitted request",operation.request|| (local?JSON.parse(local.requestJson):{})),
      operation.result?details("Complete retained operation result",operation.result):null),
    panel("Retained native attempts",null,
      table(["Attempt","State","Started","Finished","Outcome"],(operation.attempts||[]).map((attempt,index)=>[
        text(attempt.id,index+1),badge(attempt.state||attempt.status),date(attempt.startedAt||attempt.createdAt),
        date(attempt.finishedAt||attempt.completedAt),attempt.error?errorText(attempt.error):text(attempt.outcome)
      ])),details("Complete attempts",operation.attempts||[])),
    renderLocalActions()
  ];
}


function exportFiles(exported) {
  return (exported.files||[]).map(file=>({
    ...file, exportId:exported.id
  }));
}
const BLOB_DOWNLOAD_LIMIT = 64 * 1024 * 1024;
function streamingSaveAvailable() {
  return window.isSecureContext && typeof window.showSaveFilePicker === "function";
}
function commandArgument(value) { return "'" + String(value).replaceAll("'", "'\\''") + "'"; }
function nativeDownloadCommand(exported,file) {
  return "starforge api-merchant-workspace download" +
    " --launch /ABSOLUTE/WORKSPACE/api-merchant-launch.json" +
    " --export " + commandArgument(exported.id) +
    " --file " + commandArgument(file.name) +
    " --out /ABSOLUTE/PRIVATE/DESTINATION" +
    " --expected-sha256 " + commandArgument(file.sha256);
}
function markDownloadControls() {
  for (const node of $$("[data-download-cancel]")) {
    node.hidden = state.activeDownload?.key !== node.dataset.downloadCancel;
  }
}
function renderFileTable(exported) {
  return table(["Retained file","Size","SHA-256","Download"],exportFiles(exported).map(file=>{
    const key=exported.id+"/"+file.name;
    const large=file.bytes>BLOB_DOWNLOAD_LIMIT;
    const streaming=streamingSaveAvailable();
    const hostCommand=element("details",{open:large&&!streaming},
      element("summary",{},"Download with the installed host command"),
      element("p",{class:"hint"},"Run on the host that owns this workspace. Replace the launch path and destination with absolute private paths. The command verifies the complete retained file before publishing it."),
      element("pre",{},nativeDownloadCommand(exported,file)));
    const cancel=button("Cancel download",()=>{
      if(state.activeDownload?.key===key)state.activeDownload.controller.abort();
    },{quiet:true});
    cancel.dataset.downloadCancel=key;
    cancel.hidden=state.activeDownload?.key!==key;
    return [
      element("div",{},file.name,element("div",{class:"muted"},file.contentType)),
      bytes(file.bytes),element("code",{},file.sha256),
      element("div",{},
        large&&!streaming
          ? element("p",{class:"hint"},"This browser uses the host command for files larger than "+bytes(BLOB_DOWNLOAD_LIMIT)+".")
          : button(streaming?"Save verified file…":"Download verified file",()=>gate(()=>downloadFile(exported.id,file)),{gesture:true}),
        cancel,
        element("p",{class:"hint progress-note",dataset:{download:key}},
          state.downloaded.has(key)?"Complete bytes verified in this session.":""),
        hostCommand)
    ];
  }));
}
async function downloadFile(exportId,selectedFile) {
  const context=identity(),file=clone(selectedFile);
  if(!Number.isSafeInteger(file.bytes)||file.bytes<0||!/^[a-f0-9]{64}$/i.test(file.sha256||"")){
    throw new Error("Read the complete retained file metadata before downloading.");
  }
  const expected="/api/exports/"+encode(exportId)+"/files/"+encode(file.name);
  const url=new URL(apiUrl(file.downloadUrl||expected));
  if(url.pathname!==expected||url.search||url.hash)throw new Error("The file URL differs from its retained export and original member.");
  const streaming=streamingSaveAvailable();
  if(!streaming&&file.bytes>BLOB_DOWNLOAD_LIMIT){
    throw new Error("Use the installed host download command for this complete file, or open this workspace in a browser with direct file saving.");
  }
  const filename=String(file.name).split(/[\\/]/).pop()||"merchant-export";
  // At most one bounded fallback Blob remains live, until the next explicit
  // download or session close. Revoking immediately after click can race the
  // browser's download task.
  for(const oldUrl of state.objectUrls)URL.revokeObjectURL(oldUrl);
  state.objectUrls.clear();
  const controller=new AbortController(),key=exportId+"/"+file.name;
  state.controllers.add(controller);
  state.activeDownload={key,controller,workspaceId:context.workspaceId};
  markDownloadControls();
  const note=$$("[data-download]").find(node=>node.dataset.download===key);
  let reader,writable,committed=false,objectUrl;
  const check=()=>{requireIdentity(context);controller.signal.throwIfAborted();};
  const abortFile=()=>{
    try{Promise.resolve(reader?.cancel()).catch(()=>{});}catch{}
    if(writable&&!committed){try{Promise.resolve(writable.abort()).catch(()=>{});}catch{}}
  };
  controller.signal.addEventListener("abort",abortFile,{once:true});
  try {
    if(streaming){
      // The picker is invoked before this function's first await and directly
      // from the initiating click, preserving the browser's user activation.
      const handle=await window.showSaveFilePicker({suggestedName:filename});
      check();
      writable=await handle.createWritable({keepExistingData:false});
      check();
    }
    if(note?.isConnected)note.textContent="Receiving complete file…";
    const response=await fetch(url.href,{
      headers:{Authorization:"Bearer "+state.cap,"If-Match":'"'+file.sha256.toLowerCase()+'"'},
      redirect:"error",cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer",
      signal:controller.signal
    });
    check();
    if(!response.ok)throw new Error("The retained download returned HTTP "+response.status+".");
    const declared=response.headers.get("Content-Length");
    if(declared!==null&&(!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)!==file.bytes)){
      throw new Error("The returned file length differs from the retained original member.");
    }
    if(!response.body&&file.bytes!==0)throw new Error("This browser did not expose the complete download stream. Use the installed host download command.");
    reader=response.body?.getReader();
    const hashState=downloadSha256.create(),chunks=streaming?null:[];
    let count=0;
    while(reader){
      const part=await reader.read();check();
      if(part.done)break;
      if(!(part.value instanceof Uint8Array))throw new Error("The download stream returned invalid binary data.");
      count+=part.value.byteLength;
      if(!Number.isSafeInteger(count)||count>file.bytes)throw new Error("The downloaded file is larger than its retained original identity.");
      hashState.update(part.value);
      if(writable){await writable.write(part.value);check();}
      else chunks.push(part.value);
      if(note?.isConnected)note.textContent=bytes(count)+" / "+bytes(file.bytes);
    }
    if(count!==file.bytes)throw new Error("The complete file length differs. Download the retained original again.");
    const hash=hashState.hex();
    if(hash!==file.sha256.toLowerCase())throw new Error("The downloaded bytes differ from the retained SHA-256.");
    check();
    if(writable){
      // File System Access commits its temporary file only on close. The full
      // source length and incremental SHA-256 have both been verified above.
      await writable.close();committed=true;
      check();
    }else{
      const blob=new Blob(chunks,{type:file.contentType||"application/octet-stream"});
      check();
      objectUrl=URL.createObjectURL(blob);state.objectUrls.add(objectUrl);
      const anchor=element("a",{href:objectUrl,download:filename,hidden:true});
      document.body.append(anchor);
      try{anchor.click();committed=true;}finally{anchor.remove();}
    }
    state.downloaded.set(key,{bytes:count,sha256:hash});
    if(note?.isConnected)note.textContent="Complete "+bytes(count)+" verified.";
    notify((streaming?"Saved verified complete file: ":"Verified complete file: ")+filename+" · "+bytes(count)+".");
  }catch(error){
    if(note?.isConnected&&validIdentity(context)){
      note.textContent=error?.name==="AbortError"?"Download cancelled. The complete original file remains available.":"Download stopped before a complete verified save.";
    }
    if(error?.name==="AbortError"){if(validIdentity(context))notify("Download cancelled.");return;}
    throw error;
  }finally{
    controller.signal.removeEventListener("abort",abortFile);
    state.controllers.delete(controller);
    try{await reader?.cancel();}catch{}
    if(writable&&!committed){try{await writable.abort();}catch{}}
    if(objectUrl&&!committed){
      URL.revokeObjectURL(objectUrl);state.objectUrls.delete(objectUrl);
    }
    if(state.activeDownload?.controller===controller)state.activeDownload=null;
    markDownloadControls();
  }
}
function renderExports() {
  const records=state.board.workspace.exports||[];
  return [
    heading("Files and exports","Download complete original handoffs, usage, results and encrypted backup files."),
    panel("Retained file groups",null,table(["Export","Kind","Files","Complete size"],records.map(record=>[
      link(record.label||record.id,"exports",record.id),readable(record.kind),(record.files||[]).length,
      bytes((record.files||[]).reduce((sum,file)=>sum+(Number.isSafeInteger(file.bytes)?file.bytes:0),0))
    ])))
  ];
}
function renderExport() {
  const exported=state.detail.export||state.detail;
  return [
    heading(exported.label||"Retained files","Original export "+exported.id,link("Export inventory","exports")),
    panel("Complete original files","Save directly to a selected file with streaming byte-count and SHA-256 verification. Browsers without direct file saving use complete verified downloads up to 64 MiB and the installed host command for larger files.",
      kv([["Kind",readable(exported.kind)],["Original export",element("code",{},exported.id)]]),
      renderFileTable(exported),
      details("Original export metadata",exported))
  ];
}
function renderService() {
  const editor=state.editor;
  const backup=source().backup||{};
  const backupExports=(state.board.workspace.exports||[]).filter(x=>/backup/i.test(x.kind||""));
  const launchForm=element("form",{onsubmit:event=>event.preventDefault()},
    draftField(editor,"startOfferId","Offer edition to run",{required:true,choices:offerOptions(true)}),
    element("div",{class:"form-actions"},button("Start selected original service",()=>{
      return perform("start",{offerId:nonempty(editor.data.startOfferId,"Offer edition")},"Start original service",{editor});
    },{write:true,primary:true,disabled:["RUNNING","STARTING","STOPPING"].includes(state.board.service?.status)})));
  const backupForm=element("form",{onsubmit:event=>event.preventDefault()},
    element("div",{class:"form-grid"},
      draftField(editor,"backupOfferId","Offer edition to capture",{required:true,choices:offerOptions(),full:true}),
      draftField(editor,"backupLabel","Backup label",{required:true,maxLength:240,full:true})),
    element("p",{class:"hint"},"The original service is quiesced for capture and resumed after its complete backup is retained."),
    element("div",{class:"form-actions"},button("Create complete encrypted backup",()=>{
      if(!backupForm.reportValidity())return;
      return perform("backup",{offerId:nonempty(editor.data.backupOfferId,"Offer edition"),
        label:nonempty(editor.data.backupLabel,"Backup label"),resumeService:true},"Create original encrypted backup",{editor});
    },{write:true,primary:true,disabled:!backup.configured})));
  const restoreChoices=[{value:"",label:"Choose complete retained backup"},...backupExports.map(item=>({
    value:item.id,label:item.label||item.id
  }))];
  if(editor.data.restoreBackupId&&!restoreChoices.some(x=>x.value===editor.data.restoreBackupId)){
    restoreChoices.push({value:editor.data.restoreBackupId,label:editor.data.restoreBackupId+" · retained selection"});
  }
  const restoreForm=element("form",{onsubmit:event=>event.preventDefault()},
    element("div",{class:"form-grid"},
      draftField(editor,"restoreBackupId","Original encrypted backup",{required:true,choices:restoreChoices,full:true}),
      draftField(editor,"restoreLabel","Restored offer edition label",{required:true,maxLength:240,full:true})),
    element("p",{class:"hint"},"Restore drains this offer’s selected managed service and creates a new retained offer edition. Only captured orders whose original state is still unchanged move to that edition; later orders or changed usage remain on their current offer. Review the saved order mapping, then select the restored edition explicitly when starting service."),
    element("div",{class:"form-actions"},button("Restore retained offer edition",()=>{
      if(!restoreForm.reportValidity())return;
      return perform("restore",{backupId:nonempty(editor.data.restoreBackupId,"Backup"),
        label:nonempty(editor.data.restoreLabel,"Restored edition label")},"Restore original offer edition",{editor});
    },{write:true,primary:true})));
  return [
    heading("Service and backup","Operate one original worker and gateway, then retain and reopen its complete application state."),
    serviceView(),
    panel("Retained operating selections",null,draftNote(editor),sourceRevisionWarning(editor)),
    element("div",{class:"grid"},
      panel("Start an offer edition",null,launchForm),
      panel("Original deployed services",null,sourceLinks(),
        kv([["Checkout state",source().checkout?.state],["Purchase origin",source().checkout?.purchaseOrigin],
          ["Purchase path",source().checkout?.path],["Original outbox",source().checkout?.outbox]]))),
    element("div",{class:"grid"},
      panel("Complete encrypted capture",backup.configured?null:"Configure the original application root, data roots and encryption environment on this host before capture.",
        backupForm,details("Original backup path bindings",{configured:backup.configured,
          applicationRoot:backup.applicationRoot,dataRoots:backup.dataRoots,passEnv:backup.passEnv})),
      panel("Receive a retained backup",null,restoreForm)),
    panel("Original source",null,kv([["Current source SHA-256",element("code",{},source().sha256)]]),
      toolbar(button("Refresh original source",()=>perform("source_refresh",{}),{write:true})),
      element("p",{class:"hint"},"This refresh reads the configured original application and checkout. Existing offer editions remain retained."))
  ];
}
function routeFromLocation() {
  let raw=location.hash.startsWith("#/")?location.hash.slice(2):"overview";
  const [path,query=""]=raw.split("?",2);
  const pieces=path.split("/");
  const page=pieces[0]||"overview";
  if(!["overview","offers","orders","executions","operations","exports","service"].includes(page)){
    throw new Error("The selected merchant view does not exist.");
  }
  return {page,id:pieces.length>1?decodeURIComponent(pieces.slice(1).join("/")):"",query:new URLSearchParams(query)};
}
function defaultsForRoute(route) {
  const first=(source().functions||[]).find(fn=>fn.apiCompatible!==false);
  if(route.page==="offers"&&composeMode(route)==="new")return ["offer","new",{
    title:"",allowanceUnits:"100",workerPort:"43111",apiPort:"0",
    routes:[{id:first?String(first.id).replace(/[^A-Za-z0-9_-]/g,"_").slice(0,80)||"route_1":"route_1",
      functionId:first?.id||"",units:"1",timeoutSeconds:String(Math.min(120,Math.max(1,Math.ceil((first?.timeoutMs||30000)/1000))))}]
  }];
  if(route.page==="offers"&&composeMode(route)==="adopt")return ["offer-adopt","original",{label:"",profilePath:"",planFile:""}];
  if(route.page==="orders"&&["new","adopt"].includes(composeMode(route)))return ["order-"+composeMode(route),route.query.get("offerId")||"default",{
    offerId:route.query.get("offerId")||"",orderReference:composeMode(route)==="new"?"order-"+uuid():"",label:""
  }];
  if(route.page==="orders"&&route.id)return ["order-access",route.id,{
    accessAction:"suspend",accessReason:"",expiresAt:"",selectedRequestId:"",callReason:""
  }];
  if(route.page==="service")return ["service","operator",{
    startOfferId:state.board.service?.offerId||"",backupOfferId:state.board.service?.offerId||"",
    backupLabel:"Application backup "+new Date().toISOString().slice(0,10),
    restoreBackupId:"",restoreLabel:"Restored application "+new Date().toISOString().slice(0,10)
  }];
  return null;
}
function validateBoard(board) {
  if(!board?.workspace||typeof board.workspace.id!=="string"||!Number.isSafeInteger(board.workspace.revision)||
     !board.workspace.source||typeof board.workspace.source.sha256!=="string"||
     !["offers","orders","operations","exports"].every(key=>Array.isArray(board.workspace[key]))||
     !Array.isArray(board.workspace.source.functions)){
    throw new Error("The original merchant workspace response is incomplete.");
  }
  return board;
}
async function readBoard(context) {
  const board=validateBoard(await request("/api/state",{},context));requireIdentity(context);
  if(board.workspace.id!==context.workspaceId)throw problem("This endpoint is serving a different workspace. Reopen the intended original launch.");
  state.board=board;
  $("#workspace-label").textContent=(board.workspace.source.serviceName||"Original merchant")+" · revision "+board.workspace.revision+" · "+board.workspace.id;
  return board;
}
async function loadView(context, fetchVersion) {
  const route=state.route;
  const current=()=>{requireView(context);if(fetchVersion!==state.fetchVersion)throw problem("A newer refresh owns this view.","refresh_changed");};
  state.detail=null;state.list=[];state.nextAfter=null;
  $("#view").replaceChildren(element("p",{class:"loading"},"Reading original workspace records…"));
  const draft=defaultsForRoute(route);
  if(draft)await loadEditor(...draft,context);else state.editor=null;
  current();
  let result=null;
  if(route.page==="offers"&&route.id){
    result=await request("/api/offers/"+encode(route.id),{},context);current();
  }else if(route.page==="orders"&&route.id){
    result=await request("/api/orders/"+encode(route.id)+"?limit=50",{},context);current();
    state.list=result.calls?.calls||[];state.nextAfter=result.calls?.nextAfter??null;
  }else if(route.page==="executions"){
    let offerId=route.query.get("offerId");
    if(!offerId&&offers().length){
      offerId=state.board.service?.offerId||offers()[0].id;route.query.set("offerId",offerId);
      history.replaceState(null,"","#/executions"+(route.id?"/"+encode(route.id):"")+"?offerId="+encode(offerId));
    }
    if(offerId){
      result=await request("/api/executions"+(route.id?"/"+encode(route.id):"")+"?offerId="+encode(offerId)+(route.id?"":"&limit=50"),{},context);current();
      if(!route.id){state.list=result.executions||[];state.nextAfter=result.nextAfter??null;}
    }else if(route.id)throw new Error("Choose the original offer for this execution.");
  }else if(route.page==="operations"&&route.id){
    result=await request("/api/operations/"+encode(route.id),{},context);current();
  }else if(route.page==="exports"&&route.id){
    result=await request("/api/exports/"+encode(route.id),{},context);current();
  }
  state.detail=result;current();render();
}
function render() {
  if(!state.cap||!state.board)return;
  const route=state.route;let content;
  if(route.page==="overview")content=renderOverview();
  else if(route.page==="offers")content=composeMode(route)==="new"?renderOfferDesigner():composeMode(route)==="adopt"?renderAdoptOffer():route.id?renderOffer():renderOffers();
  else if(route.page==="orders")content=["new","adopt"].includes(composeMode(route))?renderOrderDraft(composeMode(route)==="adopt"):route.id?renderOrder():renderOrders();
  else if(route.page==="executions")content=route.id?renderExecution():renderExecutions();
  else if(route.page==="operations")content=route.id?renderOperation():renderOperations();
  else if(route.page==="exports")content=route.id?renderExport():renderExports();
  else content=renderService();
  $("#view").replaceChildren(...content.flat(Infinity).filter(Boolean));
  $$("[data-nav]").forEach(node=>{
    if(node.dataset.nav===route.page)node.setAttribute("aria-current","page");else node.removeAttribute("aria-current");
  });
  markBusy();
}
async function refresh() {
  const context=viewContext(),version=++state.fetchVersion;
  try{
    await readBoard(context);requireView(context);
    if(version!==state.fetchVersion)return;
    await loadLocalActions(context);requireView(context);
    if(version!==state.fetchVersion)return;
    await loadView(context,version);
  }catch(error){
    if(sameView(context)&&version===state.fetchVersion){
      notify(errorText(error),true);
      $("#view").replaceChildren(panel("Original view needs attention",errorText(error),
        toolbar(button("Refresh original state",()=>refresh()),link("Overview","overview"))));
    }
  }
}
async function navigate() {
  if(!state.cap||!state.workspaceId)return;
  state.routeVersion+=1;
  try{state.route=routeFromLocation();}catch(error){notify(errorText(error),true);return;}
  await refresh();
}
function capability(value) {
  let token=String(value||"").trim();
  if(/^https?:\/\//i.test(token)){
    const url=new URL(token);
    if(url.origin!==location.origin||url.pathname!==location.pathname)throw new Error("Use the original launch link for this exact merchant endpoint.");
    token=url.hash.slice(1);
  }
  if(token.startsWith("#"))token=token.slice(1);
  try{token=decodeURIComponent(token);}catch{throw new Error("The launch capability encoding is incomplete.");}
  if(token.length<16||token.length>4096||/[\u0000-\u0020\u007f]/.test(token)||token.startsWith("/")){
    throw new Error("Paste the complete capability from the original merchant launch link.");
  }
  return token;
}
async function connect(value) {
  const token=capability(value);
  state.epoch+=1;state.cap=token;state.workspaceId=null;state.board=null;state.detail=null;state.actions=[];
  const context={epoch:state.epoch,workspaceId:null};
  $("#capability").value="";
  $("#connection-state").textContent="Connecting";
  try{
    const board=validateBoard(await request("/api/state",{},context));requireIdentity(context);
    await openDatabase();requireIdentity(context);
    state.workspaceId=board.workspace.id;state.board=board;
    $("#connection-state").textContent="Connected";
    $("#connect-panel").hidden=true;$("#workspace-shell").hidden=false;
    $("#refresh-button").disabled=false;$("#lock-button").disabled=false;
    notify("");
    if(!location.hash.startsWith("#/"))history.replaceState(null,"","#/overview");
    await navigate();
  }catch(error){
    if(state.epoch!==context.epoch)return;
    lock(errorText(error));
    throw error;
  }
}
function lock(message="The local operator session is locked.") {
  state.epoch+=1;state.cap="";state.workspaceId=null;state.board=null;state.detail=null;state.list=[];state.actions=[];
  state.routeVersion+=1;state.fetchVersion+=1;
  for(const controller of state.controllers)controller.abort();state.controllers.clear();
  for(const url of state.objectUrls)URL.revokeObjectURL(url);state.objectUrls.clear();
  state.downloaded.clear();state.activeDownload=null;
  $("#connection-state").textContent="Locked";
  $("#workspace-label").textContent="Connect to the original local workspace.";
  $("#connect-panel").hidden=false;$("#workspace-shell").hidden=true;
  $("#view").replaceChildren();$("#refresh-button").disabled=true;$("#lock-button").disabled=true;
  notify(message);markBusy();
}
state.controllers=new Set();
$(".skip-link").addEventListener("click",event=>{event.preventDefault();$("#main").focus();});
state.editors=new Map();
$("#connect-form").addEventListener("submit",event=>{
  event.preventDefault();
  connect($("#capability").value).catch(error=>notify(errorText(error),true));
});
$("#lock-button").addEventListener("click",()=>lock());
$("#refresh-button").addEventListener("click",()=>refresh().catch(error=>notify(errorText(error),true)));
window.addEventListener("hashchange",()=>navigate().catch(error=>notify(errorText(error),true)));
window.addEventListener("pagehide",()=>{
  for(const controller of state.controllers)controller.abort();
  for(const url of state.objectUrls)URL.revokeObjectURL(url);
  state.cap="";
});
const launchFragment=location.hash;
if(launchFragment&&!launchFragment.startsWith("#/")&&launchFragment!=="#main"){
  history.replaceState(null,"",location.pathname+location.search);
  connect(launchFragment).catch(error=>notify(errorText(error),true));
}else{
  openDatabase().catch(error=>notify(errorText(error),true));
}
