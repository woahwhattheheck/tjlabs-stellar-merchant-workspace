'use strict';
// MIT. Intern complete original objects only after original validation succeeds.
const Original=require('../session.cjs');
const bank=new Map(),MAX_BYTES=16*1024*1024,MAX_ENTRIES=4096;let used=0;
const content=x=>JSON.stringify(x);
function candidate(value){const text=content(value),entry=bank.get(text);if(entry){bank.delete(text);bank.set(text,entry);return entry.value;}return value;}
function remember(value){const text=content(value);if(bank.has(text))return;const bytes=Original.byteLength(text)*2;if(bytes>MAX_BYTES)return;while(bank.size&&(used+bytes>MAX_BYTES||bank.size>=MAX_ENTRIES)){const key=bank.keys().next().value;used-=bank.get(key).bytes;bank.delete(key);}bank.set(text,{value,bytes});used+=bytes;}
function validate(value){
 if(!value||value.schema!==Original.SCHEMA)return Original.validate(value);
 const next={...value,study:candidate(value.study),archive:value.archive&&typeof value.archive==='object'&&!Array.isArray(value.archive)?Object.fromEntries(Object.entries(value.archive).map(([key,object])=>[key,candidate(object)])):value.archive};
 Original.validate(next);remember(next.study);for(const object of Object.values(next.archive))remember(object);return next;
}
const hashes=new Map();let hashBytes=0;function hash(value){const text=JSON.stringify(value),old=hashes.get(text);if(old)return old.hash;const h=Original.hash(value),bytes=text.length*2;if(bytes<=16*1024*1024){while(hashes.size&&(hashBytes+bytes>16*1024*1024||hashes.size>=128)){const key=hashes.keys().next().value;hashBytes-=hashes.get(key).bytes;hashes.delete(key);}hashes.set(text,{hash:h,bytes});hashBytes+=bytes;}return h;}
const API={...Original,hash,validate,normalize(value){return value?.schema===Original.SCHEMA?validate(value):validate(Original.normalize(value));},create(study){return validate(Original.create(study));}};
for(const name of ['draft','checkpoint','retainStudy','use','recordReview'])API[name]=(...args)=>validate(Original[name](validate(args[0]),...args.slice(1)));
for(const name of ['retain','takeSession'])API[name]=(...args)=>validate(Original[name](validate(args[0]),API.normalize(args[1]),...args.slice(2)));
for(const name of ['historyStudy','branchInfo','reviewDraft','assess','exports'])API[name]=(...args)=>Original[name](validate(args[0]),...args.slice(1));
API.branchSession=(...args)=>validate(Original.branchSession(validate(args[0]),...args.slice(1)));
module.exports=API;
