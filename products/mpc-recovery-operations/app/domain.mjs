// MIT. Standalone browser/Node module; no imports, I/O, clock reads or generated customer data.
const __hash=(()=>{const module={exports:{}};
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
// MPC recovery operations: deterministic domain state, immutable evidence and full receiving.
export const SCHEMA = 'mpc.recovery-workspace.v1';
export class DomainError extends Error { constructor(code,message){super(message);this.name='DomainError';this.code=code;} }
const fail=(message,code='INVALID')=>{throw new DomainError(code,message);};
const need=(value,message,code)=>{if(!value)fail(message,code);};
const clone=v=>JSON.parse(canonical(v));
const MAX_SOURCE=8*1024*1024,MAX_SOURCES=32*1024*1024,MAX_STATE=96*1024*1024;
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const validatedWorkspaces=new WeakSet();
function admitted(w){function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const child of Object.values(v))freeze(child);Object.freeze(v);}}freeze(w);validatedWorkspaces.add(w);return w;}
export function canonical(value){
 const seen=new Set();
 function visit(v){
  if(v===null||typeof v==='boolean'||typeof v==='string')return JSON.stringify(v);
  if(typeof v==='number'){need(Number.isFinite(v),'Finite JSON numbers are required.');return JSON.stringify(v);}
  need(v&&typeof v==='object'&&!seen.has(v),'Use acyclic plain JSON values.');
  need(Array.isArray(v)||Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null,'Use plain JSON objects.');
  seen.add(v); let s;
  if(Array.isArray(v)){for(let i=0;i<v.length;i++)need(own(v,i),'Sparse arrays are not supported.');s='['+v.map(visit).join(',')+']';}
  else s='{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+visit(v[k])).join(',')+'}';
  seen.delete(v);return s;
 } return visit(value);
}
export function sha256(value){return __hash.sha256Utf8(typeof value==='string'?value:canonical(value)).sha256;}
const utf8Length=value=>__hash.sha256Utf8(value).bytes;
const exact=(v,keys)=>{need(v&&typeof v==='object'&&!Array.isArray(v),'An object is required.');need(Object.keys(v).sort().join('\0')===keys.slice().sort().join('\0'),'Object fields differ: expected '+keys.join(', '));};
const text=(v,label,max=4000,empty=false)=>{need(typeof v==='string'&&v.length<=max&&(empty||v.trim().length>0)&&!/\u0000/.test(v),label+' must be bounded text.');__hash.sha256Utf8(v);return v;};
const id=v=>text(v,'ID',160);
const hash=v=>need(typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),'Expected a lower-case SHA-256.');
const list=(v,max=5000)=>{need(Array.isArray(v)&&v.length<=max,'List capacity exceeded.');return v;};
const num=(v,label,{nullable=false,min=0,max=Number.MAX_SAFE_INTEGER,integer=true}={})=>{if(v===null&&nullable)return;need(typeof v==='number'&&Number.isFinite(v)&&(!integer||Number.isSafeInteger(v))&&v>=min&&v<=max,label+' is out of range.');};
const bool=v=>need(typeof v==='boolean','Expected a boolean.');
const one=(v,choices)=>need(choices.includes(v),'Expected one of '+choices.join(', '));
const unique=v=>need(new Set(v).size===v.length,'Duplicate IDs are not allowed.');
function time(v,nullable=false){if(v===null&&nullable)return null;need(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v),'Use an ISO timestamp with seconds and explicit timezone.');const n=Date.parse(v);need(Number.isFinite(n),'Invalid timestamp.'); const y=+v.slice(0,4),m=+v.slice(5,7),d=+v.slice(8,10),hh=+v.slice(11,13),mm=+v.slice(14,16),ss=+v.slice(17,19);need(y>=1900&&m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(y,m,0)).getUTCDate()&&hh<24&&mm<60&&ss<60,'Invalid calendar timestamp.');return n;}
const iso=n=>new Date(n).toISOString();
const byId=(rows,key,label='Record')=>{const v=rows.find(x=>x.id===key);need(v,label+' is absent: '+key,'MISSING');return v;};
export const recordVersion=record=>record.versions[record.versions.length-1];
export const currentRecord=record=>recordVersion(record).data;
const versionAsOf=(record,asOf)=>record.versions.filter(v=>time(v.at)<=asOf).at(-1);
const versionsAsOf=(rows,asOf)=>rows.map(r=>versionAsOf(r,asOf)).filter(Boolean);
function versionAt(rows,key,digest){const r=byId(rows,key);const v=r.versions.find(x=>x.sha256===digest);need(v,'Referenced immutable record version is absent.','MISSING');return v;}
function base64Bytes(value){
 text(value,'Base64 content',Math.ceil(MAX_SOURCE/3)*4,true);
 need(value.length%4===0&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),'Use canonical padded base64.');
 const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', out=[];
 for(let i=0;i<value.length;i+=4){const a=chars.indexOf(value[i]),b=chars.indexOf(value[i+1]),c=value[i+2]==='='?0:chars.indexOf(value[i+2]),d=value[i+3]==='='?0:chars.indexOf(value[i+3]);out.push((a<<2)|(b>>4));if(value[i+2]!=='=')out.push(((b&15)<<4)|(c>>2));if(value[i+3]!=='=')out.push(((c&3)<<6)|d);if(value[i+2]==='=')need((b&15)===0,'Noncanonical base64 tail.');else if(value[i+3]==='=')need((c&3)===0,'Noncanonical base64 tail.');}
 return new Uint8Array(out);
}
function sourceCheck(s){
 exact(s,['id','name','mediaType','encoding','content','bytes','sha256','origin','observedAt']);
 id(s.id);text(s.name,'File name',300);text(s.mediaType,'Media type',200);text(s.origin,'Original source location',2000);time(s.observedAt);one(s.encoding,['utf8','base64']);hash(s.sha256);num(s.bytes,'Source bytes',{max:MAX_SOURCE});
 if(s.encoding==='utf8')need(typeof s.content==='string'&&s.content.length<=MAX_SOURCE,'UTF-8 source exceeds capacity.');
 const actual=s.encoding==='utf8'?__hash.sha256Utf8(s.content):__hash.sha256Bytes(base64Bytes(s.content));
 need(actual.bytes===s.bytes&&actual.sha256===s.sha256,'Original source bytes/hash differ.','HASH');
}
function sourceLocation(w,sourceId,locator){
 const s=byId(w.sources,sourceId,'Source');text(locator,'Source locator',1000,true);
 if(locator==='whole-file')return;
 need(s.encoding==='utf8','Line and JSON locators require a UTF-8 source.');
 const lines=/^line:([1-9]\d*)(?:-([1-9]\d*))?$/.exec(locator);
 if(lines){const start=+lines[1],end=+(lines[2]||lines[1]);need(end>=start&&end<=s.content.split(/\r\n|\r|\n/).length,'Source line range is absent.');return;}
 need(locator===''||locator.startsWith('/'),'Use whole-file, line:N[-M], or a JSON pointer.');
 let value;try{value=JSON.parse(s.content);}catch{fail('JSON pointer source is not valid JSON.');}
 if(locator==='')return;
 for(const token of locator.slice(1).split('/')){need(!/~(?:[^01]|$)/.test(token),'Invalid JSON pointer escape.');const key=token.replace(/~1/g,'/').replace(/~0/g,'~');need(value!==null&&typeof value==='object','JSON pointer does not resolve.');if(Array.isArray(value))need(/^(0|[1-9]\d*)$/.test(key)&&+key<value.length,'JSON array pointer is absent.');else need(own(value,key),'JSON object pointer is absent.');value=value[key];}
}
function refs(w,rows){list(rows,128);unique(rows.map(canonical));for(const r of rows){exact(r,['sourceId','locator']);sourceLocation(w,r.sourceId,r.locator);}}
function planAt(w,asOf){return w.plans.filter(p=>time(p.createdAt)<=asOf).at(-1)??null;}
function planOf(w,planId=w.activePlanId){if(planId===null)return null;return byId(w.plans,planId,'Plan');}
function approvalOf(w,planId,at=null){const a=w.approvals.filter(x=>x.planId===planId&&(at===null||time(x.at)<=at));return a.length?a[a.length-1]:null;}
function targetOf(w,planId,workloadId,at=null){const p=planOf(w,planId),load=byId(p.workloads,workloadId,'Workload'),approval=approvalOf(w,planId,at);return {plan:p,workload:load,approval,approved:approval?.decision==='approved'};}
function validatePlan(w,p){
 exact(p,['id','title','previousPlanId','note','sourceRefs','repositories','workloads']);id(p.id);text(p.title,'Plan title',200);text(p.note,'Plan note',8000,true);refs(w,p.sourceRefs);
 need(p.previousPlanId===w.activePlanId,'New plan must continue the current immutable plan edition.','CONFLICT');if(p.previousPlanId!==null)planOf(w,p.previousPlanId);
 list(p.repositories,1000);list(p.workloads,1000);unique(p.repositories.map(x=>x.id));unique(p.workloads.map(x=>x.id));
 for(const r of p.repositories){exact(r,['id','name','location','kind','sourceRefs']);id(r.id);text(r.name,'Repository name',200);one(r.location,['local','offsite']);text(r.kind,'Repository type',200);refs(w,r.sourceRefs);}
 for(const r of p.workloads){exact(r,['id','name','kind','description','dependencies','repositoryIds','rpoMinutes','rtoMinutes','restoreIntervalDays','sourceRefs']);id(r.id);text(r.name,'Workload name',200);text(r.kind,'Workload type',200);text(r.description,'Workload description',8000,true);list(r.dependencies,1000);list(r.repositoryIds,1000);unique(r.dependencies);unique(r.repositoryIds);for(const d of r.dependencies){id(d);need(d!==r.id,'A workload cannot depend on itself.');byId(p.workloads,d,'Dependency');}for(const d of r.repositoryIds)byId(p.repositories,d,'Repository');num(r.rpoMinutes,'RPO minutes',{nullable:true,max:52560000});num(r.rtoMinutes,'RTO minutes',{nullable:true,max:52560000});num(r.restoreIntervalDays,'Restore interval days',{nullable:true,min:1,max:36500});refs(w,r.sourceRefs);}
 order(p);
}
function order(p){const done=new Set(),active=new Set(),out=[];function visit(r){need(!active.has(r.id),'Workload dependencies contain a cycle.','CYCLE');if(done.has(r.id))return;active.add(r.id);for(const key of r.dependencies)visit(byId(p.workloads,key));active.delete(r.id);done.add(r.id);out.push(r.id);}for(const r of p.workloads)visit(r);return out;}
export function recoveryOrder(w,{planId=w.activePlanId}={}){const p=planOf(w,planId);if(!p)return {planId:null,approved:false,items:[],stages:[]};const levels=new Map(),items=order(p).map((key,index)=>{const r=byId(p.workloads,key);const stage=r.dependencies.length?1+Math.max(...r.dependencies.map(k=>levels.get(k))):0;levels.set(key,stage);return {id:key,name:r.name,order:index+1,stage:stage+1,dependencies:clone(r.dependencies),rpoMinutes:r.rpoMinutes,rtoMinutes:r.rtoMinutes};});return {planId:p.id,approved:approvalOf(w,p.id)?.decision==='approved',items,stages:[...new Set(items.map(x=>x.stage))].map(stage=>({stage,workloadIds:items.filter(x=>x.stage===stage).map(x=>x.id)}))};}
const BACKUP_KEYS=['id','externalId','sourceId','rawLocator','planId','workloadId','repositoryId','startedAt','completedAt','status','recoveryPoint','complete','verifiedAt','bytes','note'];
function backupCheck(w,r){
 exact(r,BACKUP_KEYS);id(r.id);id(r.externalId);sourceLocation(w,r.sourceId,r.rawLocator);const {plan,workload}=targetOf(w,r.planId,r.workloadId);byId(plan.repositories,r.repositoryId,'Repository');need(workload.repositoryIds.includes(r.repositoryId),'Backup repository is not in the selected workload plan.');
 const start=time(r.startedAt),end=time(r.completedAt,true),point=time(r.recoveryPoint,true),verified=time(r.verifiedAt,true);
 one(r.status,['running','succeeded','partial','failed']);bool(r.complete);text(r.note,'Backup note',8000,true);num(r.bytes,'Backed-up bytes',{nullable:true});
 if(end!==null)need(end>=start,'Backup completion precedes start.');
 if(point!==null)need(point<=(end??start),'Recovery point is later than observed backup time.');
 if(r.status==='running')need(end===null&&verified===null,'Running backup cannot have completion or verification.');
 else need(end!==null,'A finished backup requires completion time.');
 if(r.status==='succeeded')need(point!==null,'Successful backup needs its actual recovery point.');
 if(verified!==null)need(r.status==='succeeded'&&point!==null&&verified>=end,'Verification requires a successful completed backup.');
}
const RECOVERY_KEYS=['id','planId','workloadId','repositoryId','backupId','backupSha256','method','recoveryPoint','incidentAt','startedAt','serviceReadyAt','status','verified','note','sourceRefs'];
function recoveryCheck(w,r){
 exact(r,RECOVERY_KEYS);id(r.id);const {plan,workload}=targetOf(w,r.planId,r.workloadId);byId(plan.repositories,r.repositoryId);need(workload.repositoryIds.includes(r.repositoryId),'Recovery repository is not in the workload plan.');
 one(r.method,['bare-metal','vm','file','application','m365','entra']);one(r.status,['running','succeeded','failed']);bool(r.verified);text(r.note,'Recovery note',8000,true);refs(w,r.sourceRefs);
 const point=time(r.recoveryPoint),incident=time(r.incidentAt),start=time(r.startedAt),ready=time(r.serviceReadyAt,true);need(point<=incident&&incident<=start,'Recovery point, incident and start must be chronological.');if(ready!==null)need(ready>=start,'Service readiness precedes recovery start.');
 if(r.status==='succeeded')need(ready!==null,'Successful recovery requires service readiness.');if(r.status==='running')need(ready===null&&!r.verified,'Running recovery cannot already be ready or verified.');if(r.verified)need(r.status==='succeeded','Only successful recovery can be verified.');
 need((r.backupId===null)===(r.backupSha256===null),'Select both backup ID and immutable version, or neither.');
 if(r.backupId!==null){hash(r.backupSha256);const b=versionAt(w.backups,r.backupId,r.backupSha256).data;need(b.planId===r.planId&&b.workloadId===r.workloadId&&b.repositoryId===r.repositoryId&&b.recoveryPoint===r.recoveryPoint&&b.status==='succeeded'&&time(b.completedAt)<=start,'Recovery does not match its selected original backup.');}
}
const HURRICANE_KEYS=['id','name','planId','expectedImpactAt','mpcTriggeredAt','noticeReceivedAt','note','sourceRefs'];
function hurricaneCheck(w,r){exact(r,HURRICANE_KEYS);id(r.id);text(r.name,'Event name',200);planOf(w,r.planId);const impact=time(r.expectedImpactAt),trigger=time(r.mpcTriggeredAt),notice=time(r.noticeReceivedAt);need(trigger<=notice&&notice<=impact,'MPC IT trigger, receipt and expected impact must be chronological.');text(r.note,'Event note',8000,true);refs(w,r.sourceRefs);}
const INCIDENT_KEYS=['id','planId','title','occurredAt','detectedAt','remoteServiceLoss','significant','expectedOver24Hours','status','restoredAt','note','sourceRefs'];
function normalizeIncident(r){return {significant:false,expectedOver24Hours:false,...r};}
function incidentCheck(w,r){exact(r,INCIDENT_KEYS);id(r.id);planOf(w,r.planId);text(r.title,'Incident title',200);const start=time(r.occurredAt),detected=time(r.detectedAt),end=time(r.restoredAt,true);need(start<=detected,'Discovery precedes incident.');one(r.status,['open','restored']);bool(r.remoteServiceLoss);bool(r.significant);bool(r.expectedOver24Hours);text(r.note,'Incident detail',12000,true);refs(w,r.sourceRefs);if(r.status==='restored')need(end!==null&&end>=detected,'Restored incident needs chronological restoration time.');else need(end===null,'Open incident cannot have a restoration time.');}
function addVersion(w,collection,data,c,reason=null,previousSha256=null){
 const digest=sha256(data),existing=w[collection].find(x=>x.id===data.id);
 if(existing&&previousSha256===null){need(canonical(currentRecord(existing))===canonical(data),'Record ID already exists with different data; use an explicit correction.','RECORD_CONFLICT');return {id:data.id,sha256:digest,reused:true};}
 if(previousSha256!==null){need(existing,'Record to correct is absent.','MISSING');need(recordVersion(existing).sha256===previousSha256,'Record changed before correction.','CONFLICT');}
 const v={data:clone(data),sha256:digest,at:c.at,actor:c.actor,requestId:c.id,reason,previousSha256};
 if(existing)existing.versions.push(v);else w[collection].push({id:data.id,versions:[v]});
 return {id:data.id,sha256:digest,reused:false};
}
function appendUnique(w,collection,row){need(!w[collection].some(x=>x.id===row.id),'ID already exists.','RECORD_CONFLICT');w[collection].push(clone(row));}
function metadata(c){return {at:c.at,actor:c.actor,requestId:c.id};}
function reduce(w,c){
 const p=c.payload;
 switch(c.type){
 case 'source.import':sourceCheck(p);need(time(p.observedAt)<=time(c.at),'Source observation is in the future.');{const old=w.sources.find(x=>x.id===p.id);if(old){need(canonical(old)===canonical(p),'Immutable source ID has other bytes or metadata.','RECORD_CONFLICT');return {id:p.id,sha256:p.sha256,reused:true};}need(w.sources.reduce((n,s)=>n+s.bytes,0)+p.bytes<=MAX_SOURCES,'Original source capacity is 32 MiB.','CAPACITY');w.sources.push(clone(p));return {id:p.id,sha256:p.sha256,reused:false};}
 case 'plan.save':validatePlan(w,p);need(!w.plans.some(x=>x.id===p.id),'Plan edition ID already exists.','RECORD_CONFLICT');w.plans.push({...clone(p),createdAt:c.at,actor:c.actor,requestId:c.id,sha256:sha256(p)});w.activePlanId=p.id;return {id:p.id,sha256:sha256(p),approved:false};
 case 'plan.approve':exact(p,['planId','decision','note','sourceRefs']);{const plan=planOf(w,p.planId);one(p.decision,['approved','withdrawn']);text(p.note,'Approval rationale',8000);refs(w,p.sourceRefs);if(p.decision==='approved')need(plan.workloads.length>0,'An empty inventory cannot be approved.');w.approvals.push({...clone(p),...metadata(c)});return {planId:p.planId,decision:p.decision};}
 case 'backup.import':exact(p,['sourceId','rows']);byId(w.sources,p.sourceId,'Source');list(p.rows,5000);need(p.rows.length>0,'Select at least one actual backup row.');unique(p.rows.map(x=>x.id));{const rows=[];for(const row of p.rows){exact(row,BACKUP_KEYS.filter(k=>k!=='sourceId'));const data={...row,sourceId:p.sourceId};backupCheck(w,data);for(const key of ['startedAt','completedAt','recoveryPoint','verifiedAt'])if(data[key]!==null)need(time(data[key])<=time(c.at),'Backup observation is in the future.');const duplicate=w.backups.find(x=>x.id!==data.id&&currentRecord(x).externalId===data.externalId&&currentRecord(x).workloadId===data.workloadId&&currentRecord(x).repositoryId===data.repositoryId);need(!duplicate,'Vendor job identity already exists under another record ID.','RECORD_CONFLICT');rows.push(addVersion(w,'backups',data,c));}return {rows};}
 case 'recovery.record':recoveryCheck(w,p);for(const key of ['recoveryPoint','incidentAt','startedAt','serviceReadyAt'])if(p[key]!==null)need(time(p[key])<=time(c.at),'Recovery observation is in the future.');return addVersion(w,'recoveries',p,c);
 case 'hurricane.record':hurricaneCheck(w,p);need(time(p.noticeReceivedAt)<=time(c.at),'Receipt of the MPC IT trigger is in the future.');return addVersion(w,'hurricanes',p,c);
 case 'incident.record':{const data=normalizeIncident(p);incidentCheck(w,data);need(time(data.detectedAt)<=time(c.at)&&(data.restoredAt===null||time(data.restoredAt)<=time(c.at)),'Incident observation is in the future.');return addVersion(w,'incidents',data,c);}
 case 'backup.correct':case 'recovery.correct':case 'hurricane.correct':case 'incident.correct':{
  exact(p,['id','previousSha256','replacement','reason']);id(p.id);hash(p.previousSha256);text(p.reason,'Correction reason',8000);need(p.id===p.replacement.id,'Correction cannot change record identity.');
  const kind=c.type.split('.')[0],collection={backup:'backups',recovery:'recoveries',hurricane:'hurricanes',incident:'incidents'}[kind];
  const replacement=kind==='incident'?normalizeIncident(p.replacement):p.replacement;
  const old=currentRecord(byId(w[collection],p.id));({backup:backupCheck,recovery:recoveryCheck,hurricane:hurricaneCheck,incident:incidentCheck}[kind])(w,replacement);
  const observedFields={backup:['startedAt','completedAt','recoveryPoint','verifiedAt'],recovery:['recoveryPoint','incidentAt','startedAt','serviceReadyAt'],hurricane:['mpcTriggeredAt','noticeReceivedAt'],incident:['occurredAt','detectedAt','restoredAt']}[kind];for(const key of observedFields)if(replacement[key]!==null)need(time(replacement[key])<=time(c.at),'Corrected observation is in the future.');
  if(kind==='backup')need(old.externalId===p.replacement.externalId&&old.workloadId===p.replacement.workloadId&&old.repositoryId===p.replacement.repositoryId,'Correction cannot switch the original vendor job identity.');
  return addVersion(w,collection,replacement,c,p.reason,p.previousSha256);}
 case 'acceptance.record':exact(p,['id','runId','runSha256','decision','note','sourceRefs']);id(p.id);hash(p.runSha256);{const r=versionAt(w.recoveries,p.runId,p.runSha256).data;one(p.decision,['accepted','rejected']);text(p.note,'Acceptance rationale',8000);refs(w,p.sourceRefs);if(p.decision==='accepted')need(r.status==='succeeded'&&r.verified,'Acceptance requires an actual verified successful recovery.');appendUnique(w,'acceptanceRecords',{...p,...metadata(c)});return {id:p.id,runId:p.runId,decision:p.decision};}
 case 'acceptance.check':exact(p,['id','planId','criterion','decision','note','sourceRefs']);id(p.id);planOf(w,p.planId);one(p.criterion,['monitoring','reporting','administrative-access','training','deficiency-closeout']);one(p.decision,['accepted','rejected']);text(p.note,'Acceptance evidence',8000);refs(w,p.sourceRefs);need(p.sourceRefs.length>0,'Acceptance check requires retained evidence.');appendUnique(w,'acceptanceChecks',{...p,...metadata(c)});return {id:p.id,criterion:p.criterion,decision:p.decision};
 case 'restoreSchedule.save':exact(p,['id','planId','workloadId','intervalDays','firstDueAt','note','sourceRefs']);id(p.id);targetOf(w,p.planId,p.workloadId);num(p.intervalDays,'Restore interval days',{min:1,max:36500});time(p.firstDueAt);text(p.note,'Schedule note',8000,true);refs(w,p.sourceRefs);appendUnique(w,'restoreSchedules',{...p,...metadata(c)});return {id:p.id,workloadId:p.workloadId};
 case 'incidentReport.record':exact(p,['id','incidentId','cause','impact','correctiveActions','recurrenceMeasures','sourceRefs']);id(p.id);{const incidentVersion=recordVersion(byId(w.incidents,p.incidentId)),incident=incidentVersion.data;need(incident.status==='restored','Record final incident report after restoration.');for(const key of ['cause','impact','correctiveActions','recurrenceMeasures'])text(p[key],key,12000);refs(w,p.sourceRefs);need(p.sourceRefs.length>0,'Final incident report needs retained source evidence.');appendUnique(w,'incidentReports',{...p,incidentSha256:incidentVersion.sha256,...metadata(c)});return {id:p.id,incidentId:p.incidentId};}
 case 'communication.record':exact(p,['id','incidentId','channel','at','recipient','summary','sourceRefs']);id(p.id);{const incident=currentRecord(byId(w.incidents,p.incidentId));need(time(p.at)>=time(incident.detectedAt)&&time(p.at)<=time(c.at),'Communication must be observed after awareness and by this record time.');one(p.channel,['email','telephone','status-update']);text(p.recipient,'Recipient',500);text(p.summary,'Communication summary',12000);refs(w,p.sourceRefs);appendUnique(w,'communications',{...p,actor:c.actor,requestId:c.id});return {id:p.id,incidentId:p.incidentId};}
 default:fail('Unsupported command: '+c.type,'COMMAND');
 }
}
const COLLECTIONS=['sources','plans','approvals','backups','recoveries','acceptanceRecords','acceptanceChecks','restoreSchedules','hurricanes','incidents','communications','incidentReports'];
export function createWorkspace(seed){
 need(seed&&typeof seed==='object','Workspace seed is required.');const s={...seed};if(!own(s,'assumptions'))s.assumptions=[];exact(s,['id','title','createdAt','assumptions']);id(s.id);text(s.title,'Workspace title',200);time(s.createdAt);list(s.assumptions,100);for(const a of s.assumptions){exact(a,['label','value','source','status']);text(a.label,'Assumption label',200);text(a.value,'Assumption value',2000);text(a.source,'Issued reference',2000);need(a.status==='planning-assumption','Seed quantities are planning assumptions only.');}
 const w={schema:SCHEMA,id:s.id,title:s.title,createdAt:s.createdAt,updatedAt:s.createdAt,revision:0,activePlanId:null,assumptions:clone(s.assumptions),seed:clone(s),operations:[]};
 for(const key of COLLECTIONS)w[key]=[];return admitted(w);
}
function quick(w){need(w&&w.schema===SCHEMA,'Unsupported workspace.');num(w.revision,'Revision',{max:5000});need(w.operations.length===w.revision,'Workspace operation count differs.','HISTORY');for(const key of COLLECTIONS)list(w[key],20000);}
function applyOriginal(workspace,command){
 quick(workspace);exact(command,['id','actor','at','expectedRevision','type','payload']);id(command.id);text(command.actor,'Operating engineer',300);time(command.at);num(command.expectedRevision,'Expected revision',{max:5000});text(command.type,'Command type',100);
 const request=clone(command),requestSha256=sha256(request),old=workspace.operations.find(x=>x.command.id===command.id);
 if(old){need(old.requestSha256===requestSha256&&canonical(old.command)===canonical(request),'Request ID is already bound to different arguments.','REQUEST_REUSED');return {workspace:clone(workspace),result:clone(old.result),replayed:true};}
 need(command.expectedRevision===workspace.revision,'Workspace changed; keep the draft and review the latest revision.','CONFLICT');need(workspace.revision<5000,'Workspace history capacity reached.','CAPACITY');need(time(command.at)>=time(workspace.updatedAt),'Command time precedes the current recorded operation.');
 const w=clone(workspace),detail=reduce(w,request);w.revision++;w.updatedAt=command.at;const result={requestId:command.id,workspaceId:w.id,revision:w.revision,type:command.type,...detail};
 const previousSha256=w.operations.length?w.operations[w.operations.length-1].sha256:'0'.repeat(64);
 const entry={command:request,requestSha256,result,previousSha256};entry.sha256=sha256(entry);w.operations.push(entry);quick(w);need(utf8Length(canonical(w))<=MAX_STATE,'Complete workspace exceeds 96 MiB.','CAPACITY');return {workspace:w,result:clone(result),replayed:false};
}
export function applyCommand(workspace,command){if(!validatedWorkspaces.has(workspace))inspectWorkspace(workspace);const result=applyOriginal(workspace,command);result.workspace=admitted(result.workspace);return result;}
export function exportSnapshot(w){inspectWorkspace(w);const snapshot={schema:'mpc.recovery-snapshot.v1',workspace:clone(w)};return {...snapshot,sha256:sha256(snapshot)};}
export function receiveSnapshot(snapshot){
 exact(snapshot,['schema','workspace','sha256']);need(snapshot.schema==='mpc.recovery-snapshot.v1','Unsupported snapshot schema.');hash(snapshot.sha256);need(sha256({schema:snapshot.schema,workspace:snapshot.workspace})===snapshot.sha256,'Complete snapshot hash differs.','HASH');inspectWorkspace(snapshot.workspace);return admitted(clone(snapshot.workspace));
}
export function inspectWorkspace(w){
 quick(w);need(utf8Length(canonical(w))<=MAX_STATE,'Complete workspace exceeds receiving capacity.','CAPACITY');if(!validatedWorkspaces.has(w)){let restored=createWorkspace(w.seed);
 for(const op of w.operations){exact(op,['command','requestSha256','result','previousSha256','sha256']);const next=applyOriginal(restored,op.command);need(!next.replayed&&canonical(next.workspace.operations[next.workspace.operations.length-1])===canonical(op),'Retained operation or result differs from its original deterministic command.','HISTORY');restored=next.workspace;}
 need(canonical(restored)===canonical(w),'Workspace differs from its complete retained operation history.','HISTORY');}
 return {id:w.id,revision:w.revision,sha256:sha256(w),sources:w.sources.length,plans:w.plans.length,operations:w.operations.length,sourceBytes:w.sources.reduce((n,s)=>n+s.bytes,0)};
}
function recoveryMetrics(w,v,asOf=w.updatedAt){
 const r=v.data,clock=time(asOf),{workload,approved:targetsApprovedAtRun}=targetOf(w,r.planId,r.workloadId,Math.min(time(v.at),time(r.startedAt))),currentPlanApproved=approvalOf(w,r.planId,clock)?.decision==='approved',rpoMinutes=(time(r.incidentAt)-time(r.recoveryPoint))/60000,rtoMinutes=r.serviceReadyAt===null?null:(time(r.serviceReadyAt)-time(r.incidentAt))/60000,executionMinutes=r.serviceReadyAt===null?null:(time(r.serviceReadyAt)-time(r.startedAt))/60000;
 return {id:r.id,sha256:v.sha256,planId:r.planId,workloadId:r.workloadId,method:r.method,status:r.status,verified:r.verified,rpoMinutes,rtoMinutes,executionMinutes,targetRpoMinutes:workload.rpoMinutes,targetRtoMinutes:workload.rtoMinutes,targetsApproved:currentPlanApproved,targetsApprovedAtRun,currentPlanApproved,rpoMet:workload.rpoMinutes===null?null:rpoMinutes<=workload.rpoMinutes,rtoMet:workload.rtoMinutes===null||rtoMinutes===null?null:rtoMinutes<=workload.rtoMinutes};
}
function acceptedRuns(w,planId,asOf){
 return versionsAsOf(w.recoveries,asOf).filter(v=>v.data.planId===planId).filter(v=>{const decisions=w.acceptanceRecords.filter(a=>a.runId===v.data.id&&a.runSha256===v.sha256&&time(a.at)<=asOf);return decisions.length&&decisions[decisions.length-1].decision==='accepted';});
}
export function acceptance(w,{asOf=w.updatedAt,planId=w.activePlanId}={}){
 const clock=time(asOf),p=planOf(w,planId);if(!p||time(p.createdAt)>clock)return {planId:null,status:'NOT_READY',approved:false,workloads:[],checks:[],missing:['Customer inventory and plan are not recorded.']};
 const runs=acceptedRuns(w,p.id,clock),rows=p.workloads.map(l=>{const selected=runs.filter(v=>v.data.workloadId===l.id),metrics=selected.map(v=>recoveryMetrics(w,v,asOf));const eligible=selected.filter((v,i)=>metrics[i].targetsApproved&&metrics[i].rpoMet===true&&metrics[i].rtoMet===true);const locations=[...new Set(eligible.map(v=>byId(p.repositories,v.data.repositoryId).location))];return {id:l.id,name:l.name,acceptedRunIds:eligible.map(v=>v.data.id),locations,local:locations.includes('local'),offsite:locations.includes('offsite'),targetsDefined:l.rpoMinutes!==null&&l.rtoMinutes!==null,complete:locations.includes('local')&&locations.includes('offsite')};});
 const checks=['monitoring','reporting','administrative-access','training','deficiency-closeout'].map(criterion=>{const a=w.acceptanceChecks.filter(x=>x.planId===p.id&&x.criterion===criterion&&time(x.at)<=clock);const latest=a.length?a[a.length-1]:null;return {criterion,decision:latest?.decision??'unrecorded',recordId:latest?.id??null};});
 const bareMetal=runs.some(v=>v.data.method==='bare-metal'&&recoveryMetrics(w,v,asOf).targetsApproved&&recoveryMetrics(w,v,asOf).rpoMet===true&&recoveryMetrics(w,v,asOf).rtoMet===true);
 const qualified=runs.filter(v=>{const m=recoveryMetrics(w,v,asOf);return m.targetsApproved&&m.rpoMet===true&&m.rtoMet===true;});const m365=qualified.some(v=>v.data.method==='m365'),entra=qualified.some(v=>v.data.method==='entra');
 const missing=[];if(!p.workloads.length)missing.push('Customer inventory is empty.');if(approvalOf(w,p.id,clock)?.decision!=='approved')missing.push('Current plan is not approved.');for(const r of rows)if(!r.complete)missing.push(r.name+': approved-target local and offsite recovery evidence is incomplete.');if(!bareMetal)missing.push('A demonstrated bare-metal recovery is missing.');if(!m365)missing.push('Microsoft 365 recovery evidence is missing.');if(!entra)missing.push('Entra ID configuration recovery evidence is missing.');for(const c of checks)if(c.decision!=='accepted')missing.push(c.criterion+': acceptance evidence is '+c.decision+'.');
 return {planId:p.id,status:missing.length?'NOT_READY':'READY_FOR_FINAL_REVIEW',approved:approvalOf(w,p.id,clock)?.decision==='approved',workloads:rows,checks,bareMetal,m365,entra,missing};
}
export function restoreDue(w,asOf=w.updatedAt,{planId=w.activePlanId}={}){
 const clock=time(asOf),p=planOf(w,planId);if(!p||time(p.createdAt)>clock)return [];const runs=acceptedRuns(w,p.id,clock).filter(v=>{const m=recoveryMetrics(w,v,asOf);return m.targetsApproved&&m.rpoMet===true&&m.rtoMet===true;});
 return p.workloads.map(l=>{const schedules=w.restoreSchedules.filter(s=>s.planId===p.id&&s.workloadId===l.id&&time(s.at)<=clock);const s=schedules.length?schedules[schedules.length-1]:null;const completed=runs.filter(v=>v.data.workloadId===l.id&&v.data.serviceReadyAt!==null&&time(v.data.serviceReadyAt)<=clock).sort((a,b)=>time(b.data.serviceReadyAt)-time(a.data.serviceReadyAt));const last=completed[0];const intervalDays=s?.intervalDays??l.restoreIntervalDays;
 const due=intervalDays===null?null:last?iso(time(last.data.serviceReadyAt)+intervalDays*86400000):s?.firstDueAt??null;
 return {workloadId:l.id,name:l.name,scheduleId:s?.id??null,intervalDays,lastAcceptedRunId:last?.data.id??null,lastRestoredAt:last?.data.serviceReadyAt??null,dueAt:due,status:due===null?'UNSCHEDULED':time(due)<=clock?'DUE':'UPCOMING',daysUntilDue:due===null?null:(time(due)-clock)/86400000};});
}
export function hurricaneStatus(w,eventId,{asOf=w.updatedAt}={}){
 const clock=time(asOf),version=versionAsOf(byId(w.hurricanes,eventId),clock);if(!version)return {eventId,status:'NOT_YET_RECORDED',coverage:[]};const e=version.data,p=planOf(w,e.planId),cutoff=time(e.expectedImpactAt)-86400000,trigger=time(e.mpcTriggeredAt),received=time(e.noticeReceivedAt),sufficientNotice=received<=cutoff;
 const coverage=p.workloads.map(l=>{const repositories=l.repositoryIds.map(repoId=>{const repository=byId(p.repositories,repoId);const candidates=versionsAsOf(w.backups,clock).filter(v=>{const b=v.data;return b.planId===p.id&&b.workloadId===l.id&&b.repositoryId===repoId&&b.status==='succeeded'&&b.complete&&b.verifiedAt!==null&&time(b.startedAt)>=received;});const qualifying=candidates.filter(v=>time(v.data.completedAt)<=cutoff&&time(v.data.verifiedAt)<=cutoff).sort((a,b)=>time(b.data.recoveryPoint)-time(a.data.recoveryPoint));return {repositoryId:repoId,name:repository.name,location:repository.location,covered:qualifying.length>0,backupId:qualifying[0]?.data.id??null,backupSha256:qualifying[0]?.sha256??null,recoveryPoint:qualifying[0]?.data.recoveryPoint??null,evidenceAcquiredAt:qualifying[0]?.at??null,completedAt:qualifying[0]?.data.completedAt??null,verifiedAt:qualifying[0]?.data.verifiedAt??null,observedCandidateIds:candidates.map(v=>v.data.id)};});const local=repositories.some(r=>r.location==='local'&&r.covered),offsite=repositories.some(r=>r.location==='offsite'&&r.covered);return {workloadId:l.id,name:l.name,local,offsite,covered:local&&offsite,repositories};});
 return {eventId:e.id,name:e.name,planId:p.id,expectedImpactAt:e.expectedImpactAt,mpcTriggeredAt:e.mpcTriggeredAt,noticeReceivedAt:e.noticeReceivedAt,cutoffAt:iso(cutoff),sufficientNotice,notice:'Receipt of the MPC IT trigger determines available notice. Coverage uses actual completion and verification times; evidence acquisition time is retained separately. Short notice requires a documented response.',status:!sufficientNotice?'SHORT_NOTICE':coverage.length&&coverage.every(r=>r.covered)?'COVERED':'INCOMPLETE',coverage,uncoveredWorkloadIds:coverage.filter(r=>!r.covered).map(r=>r.workloadId)};
}
export function incidentStatus(w,incidentId,asOf=w.updatedAt){
 const clock=time(asOf),version=versionAsOf(byId(w.incidents,incidentId),clock);if(!version)return {incidentId,status:'NOT_YET_RECORDED'};
 const e=version.data,detected=time(e.detectedAt),occurred=time(e.occurredAt),communications=w.communications.filter(c=>c.incidentId===e.id&&time(c.at)<=clock).sort((a,b)=>time(a.at)-time(b.at));
 const limits=[];if(e.remoteServiceLoss)limits.push(detected);if(e.significant)limits.push(detected+86400000);if(e.expectedOver24Hours)limits.push(occurred+86400000);const deadline=limits.length?Math.min(...limits):null;
 const channels=['email','telephone'].map(channel=>{const first=communications.find(c=>c.channel===channel&&time(c.at)>=detected);return {channel,recordId:first?.id??null,firstAt:first?.at??null,elapsedMinutes:first?(time(first.at)-detected)/60000:null,deadlineAt:deadline===null?null:iso(deadline),status:deadline===null?(first?'RECORDED':'NO_REQUIRED_DEADLINE_RECORDED'):!first?(clock>=deadline?'OVERDUE':'DUE'):time(first.at)<=deadline?'RECORDED_BY_DEADLINE':'RECORDED_AFTER_DEADLINE'};});
 const continuing=e.remoteServiceLoss||e.significant||e.expectedOver24Hours,last=communications.at(-1),nextUpdateAt=continuing?iso((last?time(last.at):detected)+86400000):null;
 const updateGaps=[],endsAt=e.restoredAt===null?clock:Math.min(clock,time(e.restoredAt));let previous=detected;
 if(continuing){for(const c of communications){const at=time(c.at);if(at>endsAt)break;if(at<detected)continue;if(at-previous>86400000)updateGaps.push({from:iso(previous),to:c.at,minutes:(at-previous)/60000});previous=at;}if(endsAt-previous>86400000)updateGaps.push({from:iso(previous),to:iso(endsAt),minutes:(endsAt-previous)/60000});}
 const report=w.incidentReports.filter(r=>r.incidentId===e.id&&r.incidentSha256===version.sha256&&time(r.at)<=clock).at(-1);
 return {incidentId:e.id,title:e.title,status:e.status,remoteServiceLoss:e.remoteServiceLoss,significant:e.significant,expectedOver24Hours:e.expectedOver24Hours,notificationRule:e.remoteServiceLoss?'IMMEDIATE_ON_DISCOVERY':limits.length?'SHORTEST_APPLICABLE_24_HOUR_LIMIT':'NO_REQUIRED_DEADLINE_RECORDED',notificationDueAt:deadline===null?null:iso(deadline),awarenessNotificationRequired:e.expectedOver24Hours,channels,nextUpdateAt:e.status==='restored'?null:nextUpdateAt,updateDue:e.status==='open'&&nextUpdateAt!==null&&clock>=time(nextUpdateAt),updateGaps,materialChangeRequiresUpdate:true,restoredAt:e.restoredAt,postIncidentReportRequired:e.status==='restored'&&!report,reportId:report?.id??null,communications:clone(communications),note:'Record both required channels. Remote loss is immediate on discovery. Expected material outage is notified on awareness, subject to the 24-hour outer limit. Material status changes require an update even before the next 24-hour deadline.'};
}
export function overview(w,asOf=w.updatedAt){
 quick(w);const clock=time(asOf),plan=planAt(w,clock),backups=versionsAsOf(w.backups,clock),recoveries=versionsAsOf(w.recoveries,clock);
 return {id:w.id,title:w.title,revision:w.revision,asOf,activePlan:plan?{id:plan.id,title:plan.title,sha256:plan.sha256,approved:approvalOf(w,plan.id,clock)?.decision==='approved',workloads:plan.workloads.length,repositories:plan.repositories.length}:null,assumptions:clone(w.assumptions),sources:w.sources.length,backupCounts:Object.fromEntries(['running','succeeded','partial','failed'].map(s=>[s,backups.filter(v=>v.data.status===s&&time(v.at)<=clock).length])),recoveryMetrics:recoveries.filter(v=>time(v.at)<=clock).map(v=>recoveryMetrics(w,v,asOf)),restoreDue:restoreDue(w,asOf,{planId:plan?.id??null}),acceptance:acceptance(w,{asOf,planId:plan?.id??null}),incidents:w.incidents.filter(x=>versionAsOf(x,clock)).map(x=>incidentStatus(w,x.id,asOf)),hurricanes:w.hurricanes.filter(x=>versionAsOf(x,clock)).map(x=>hurricaneStatus(w,x.id,{asOf}))};
}
export function serviceReview(w,{from,to,asOf=to}){
 const begin=time(from),end=time(to);need(begin<=end,'Service-review dates are reversed.');const clock=time(asOf),plan=planAt(w,clock);const within=n=>n>=begin&&n<=end;
 const backups=versionsAsOf(w.backups,time(asOf)).filter(v=>within(time(v.data.completedAt??v.data.startedAt))&&time(v.at)<=time(asOf));
 const recoveries=versionsAsOf(w.recoveries,time(asOf)).filter(v=>within(time(v.data.serviceReadyAt??v.data.startedAt))&&time(v.at)<=time(asOf));
 const failed=backups.filter(v=>['partial','failed'].includes(v.data.status));const results=recoveries.map(v=>recoveryMetrics(w,v,asOf)),due=restoreDue(w,asOf,{planId:plan?.id??null});
 return {workspaceId:w.id,title:w.title,from,to,asOf,planId:plan?.id??null,summary:backups.length+' actual backup jobs and '+recoveries.length+' recovery runs fall within this review period.',backupCounts:Object.fromEntries(['running','succeeded','partial','failed'].map(status=>[status,backups.filter(v=>v.data.status===status).length])),backupExceptions:failed.map(v=>({id:v.data.id,status:v.data.status,workloadId:v.data.workloadId,repositoryId:v.data.repositoryId,note:v.data.note,sourceId:v.data.sourceId,rawLocator:v.data.rawLocator,sha256:v.sha256})),recoveries:results,restoreDue:due,acceptance:acceptance(w,{asOf,planId:plan?.id??null}),incidents:w.incidents.filter(x=>{const v=versionAsOf(x,clock);return v&&time(v.data.occurredAt)<=end&&(v.data.restoredAt===null||time(v.data.restoredAt)>=begin);}).map(x=>incidentStatus(w,x.id,asOf)),actions:[...failed.map(v=>'Review '+v.data.status+' backup '+v.data.id+' and retain its correction or retry as actual evidence.'),...due.filter(x=>x.status==='DUE'||x.status==='UNSCHEDULED').map(x=>x.name+': '+(x.status==='DUE'?'complete the due restore exercise.':'agree and record the recurring restore schedule.'))],sourceIds:[...new Set(backups.map(v=>v.data.sourceId))],automatedNotificationsSent:0};
}
