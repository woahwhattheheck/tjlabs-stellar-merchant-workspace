// MIT. Retain bounded exact full-workspace validation results from the unchanged original engine.
export function cachePlanningValidation(original,{maxBytes=32*1024*1024,maxEntries=24}={}){
 const known=new WeakSet(),cache=new Map();let bytes=0;
 function remember(w,key=JSON.stringify(w)){
  known.add(w);if(!Object.isFrozen(w))throw Error('Original planning workspace must remain immutable');
  const size=2*(key.length+JSON.stringify(w).length);if(size<=maxBytes){
   const prior=cache.get(key);if(prior){bytes-=prior.size;cache.delete(key);}cache.set(key,{workspace:w,size});bytes+=size;
   while(cache.size>maxEntries||bytes>maxBytes){const first=cache.keys().next().value;bytes-=cache.get(first).size;cache.delete(first);}
  }return w;
 }
 function checked(w){
  if(known.has(w))return w;
  const key=JSON.stringify(w),entry=cache.get(key);if(entry){cache.delete(key);cache.set(key,entry);return entry.workspace;}
  return remember(original.validateWorkspace(w),key);
 }
 const api={...original,createWorkspace:(...a)=>remember(original.createWorkspace(...a)),validateWorkspace:checked,importWorkspace:raw=>{if(typeof raw==='string'){const key=raw.endsWith('\n')?raw.slice(0,-1):raw,entry=cache.get(key);if(entry){cache.delete(key);cache.set(key,entry);return entry.workspace;}}return remember(original.importWorkspace(raw));}};
 for(const name of ['addSource','saveEdition','propose'])api[name]=(w,...a)=>{const out=original[name](checked(w),...a);remember(out.workspace);return out;};
 api.review=(w,...a)=>remember(original.review(checked(w),...a));
 for(const name of ['readSource','inspectSource','mapRows','compare','proposalStatus','handoff','exportWorkspace'])api[name]=(w,...a)=>original[name](checked(w),...a);
 api.analyse=(input,w)=>original.analyse(input,checked(w));
 return api;
}
