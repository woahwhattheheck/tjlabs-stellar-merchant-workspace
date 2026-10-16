'use strict';
// MIT. Intern exact original objects only after original validation freezes them.
// Keep complete immutable text keys; mutable callers always serialize anew.
const Original=require('../session.cjs'),Core=require('./core-cache.cjs');
const bank=new Map(),MAX_BYTES=64*1024*1024,MAX_ENTRIES=4096;let used=0,hits=0,misses=0,evictions=0,oversized=0;
const content=x=>JSON.stringify(x);
function candidate(value){const text=content(value),entry=bank.get(text);if(entry){hits++;bank.delete(text);bank.set(text,entry);return entry.value;}misses++;return value;}
function remember(value){const text=content(value);if(bank.has(text))return;const bytes=text.length*4+256;if(bytes>MAX_BYTES){oversized++;return;}while(bank.size&&(used+bytes>MAX_BYTES||bank.size>=MAX_ENTRIES)){const key=bank.keys().next().value;used-=bank.get(key).bytes;bank.delete(key);evictions++;}bank.set(text,{value,bytes});used+=bytes;}
function validate(value){
 if(!value||value.schema!==Original.SCHEMA)return Original.validate(value);
 const next={...value,study:candidate(value.study),archive:value.archive&&typeof value.archive==='object'&&!Array.isArray(value.archive)?Object.fromEntries(Object.entries(value.archive).map(([key,object])=>[key,candidate(object)])):value.archive};
 Original.validate(next);remember(next.study);for(const object of Object.values(next.archive))remember(object);return next;
}
validate.cacheStats=()=>Object.freeze({entries:bank.size,retainedBytes:used,maxBytes:MAX_BYTES,maxEntries:MAX_ENTRIES,hits,misses,evictions,oversized,identity:'complete-text-and-validated-frozen-value',accounting:'four bytes per serialized UTF-16 code unit plus256 per entry'});
const hashes=new Map(),HASH_LIMIT=64*1024*1024,HASH_COUNT=128;let hashBytes=0,hashHits=0,hashMisses=0,hashEvictions=0,hashOversized=0;
function hash(value){
 const text=JSON.stringify(value),old=hashes.get(text);if(old){hashHits++;hashes.delete(text);hashes.set(text,old);return old.hash;}
 hashMisses++;const h=Original.hash(value),bytes=text.length*2+128;
 if(bytes<=HASH_LIMIT){while(hashes.size&&(hashBytes+bytes>HASH_LIMIT||hashes.size>=HASH_COUNT)){const key=hashes.keys().next().value;hashBytes-=hashes.get(key).bytes;hashes.delete(key);hashEvictions++;}hashes.set(text,{hash:h,bytes});hashBytes+=bytes;}else hashOversized++;
 return h;
}
hash.cacheStats=()=>Object.freeze({entries:hashes.size,retainedBytes:hashBytes,maxBytes:HASH_LIMIT,maxEntries:HASH_COUNT,hits:hashHits,misses:hashMisses,evictions:hashEvictions,oversized:hashOversized,identity:'complete-serialized-content'});
const API={...Original,hash,validate,normalize(value){return value?.schema===Original.SCHEMA?validate(value):validate(Original.normalize(value));},create(study){return validate(Original.create(study));}};
for(const name of ['draft','checkpoint','retainStudy','use','recordReview'])API[name]=(...args)=>validate(Original[name](validate(args[0]),...args.slice(1)));
for(const name of ['retain','takeSession'])API[name]=(...args)=>validate(Original[name](validate(args[0]),API.normalize(args[1]),...args.slice(2)));
for(const name of ['historyStudy','branchInfo','reviewDraft','exports'])API[name]=(...args)=>Original[name](validate(args[0]),...args.slice(1));
API.branchSession=(...args)=>validate(Original.branchSession(validate(args[0]),...args.slice(1)));
API.assess=value=>{const s=validate(value);try{return{ok:true,result:Core.analyze(s.study)}}catch(e){return{ok:false,error:e.message};}};
module.exports=API;
