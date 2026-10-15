'use strict';
// The unmodified core remains authoritative. Cache only successful analyses by the
// complete serialized study, and return isolated copies on both misses and hits.
require('./sha-cache.cjs');
const Core=require('../core.cjs');
const entries=new Map(),LIMIT=16*1024*1024,COUNT=8;let size=0;
function analyze(study){
 const key=JSON.stringify(study),hit=entries.get(key);
 if(hit){entries.delete(key);entries.set(key,hit);return Core.clone(hit.value);}
 const value=Core.analyze(study),copy=Core.clone(value),cost=2*(key.length+JSON.stringify(copy).length);
 if(cost<=LIMIT){while(entries.size&&(size+cost>LIMIT||entries.size>=COUNT)){const oldest=entries.keys().next().value;size-=entries.get(oldest).cost;entries.delete(oldest);}entries.set(key,{value:copy,cost});size+=cost;}
 return value;
}
module.exports=Object.freeze({...Core,analyze});
