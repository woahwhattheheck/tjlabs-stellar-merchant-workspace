'use strict';
// Exact immutable-text digest cache for the installed runtime. The original
// maintained source implementation computes every miss and rejects malformed text.
const SHA=require('../sha256.cjs'),original=SHA.sha256Utf8;
const entries=new Map(),MAX_BYTES=16*1024*1024,MAX_ENTRIES=4096;let used=0;
function cached(value){
 if(typeof value!=='string')return original(value);
 const hit=entries.get(value);if(hit){entries.delete(value);entries.set(value,hit);return{bytes:hit.value.bytes,sha256:hit.value.sha256};}
 const result=original(value),cost=value.length*2+128;
 if(cost<=MAX_BYTES){while(entries.size&&(used+cost>MAX_BYTES||entries.size>=MAX_ENTRIES)){const key=entries.keys().next().value;used-=entries.get(key).cost;entries.delete(key);}entries.set(value,{value:{...result},cost});used+=cost;}
 return result;
}
// All maintained consumers retain this same SHA API object. Only the installed
// adapter loads this module; the source file and offline ordinary build stay exact.
SHA.sha256Utf8=cached;
module.exports=SHA;
