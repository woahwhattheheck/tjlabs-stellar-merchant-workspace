// MIT. Bounded exact-input read memoization around the unchanged original engine.
export function cacheTurnoverReads(original,{maxBytes=32*1024*1024,maxEntries=24}={}){
 const cache=new Map();let bytes=0;
 function cached(name){return (...args)=>{
  const key=JSON.stringify([name,args.map(v=>({type:typeof v,value:v}))]);let entry=cache.get(key);
  if(entry){cache.delete(key);cache.set(key,entry);return JSON.parse(entry.body);}
  const result=original[name](...args),body=JSON.stringify(result),size=2*(key.length+body.length);
  if(size<=maxBytes){entry={body,size};cache.set(key,entry);bytes+=size;while(cache.size>maxEntries||bytes>maxBytes){const first=cache.keys().next().value;bytes-=cache.get(first).size;cache.delete(first);}}
  return JSON.parse(body);
 };}
 return {...original,...Object.fromEntries(['reopen','editions','compare','csv','report'].map(k=>[k,cached(k)]))};
}
