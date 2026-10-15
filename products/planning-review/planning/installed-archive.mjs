// MIT. Reuse exact full archive serialization under a bounded memory budget.
export function cachedPlanningArchiveFactory(createArchiveAPI){
 return (api,runtime)=>{
  const original=createArchiveAPI(api,runtime),entries=new Map();let bytes=0;
  return {...original,serialize(value){
   const key=JSON.stringify(value),old=entries.get(key);
   if(old){entries.delete(key);entries.set(key,old);return {...old.out,workspace:{...old.out.workspace}};}
   const out=original.serialize(value),size=2*(key.length+out.content.length);
   if(size<=64*1024*1024){entries.set(key,{out:{...out,workspace:{...out.workspace}},size});bytes+=size;while(entries.size>4||bytes>64*1024*1024){const first=entries.keys().next().value;bytes-=entries.get(first).size;entries.delete(first);}}
   return out;
  }};
 };
}
