'use strict';
const Text=require('./text.cjs'),SHA=require('./sha256.cjs');
module.exports={hash:x=>SHA.sha256Utf8(Text.canonical(x)).sha256,parse:Text.parse,canonical:Text.canonical};
