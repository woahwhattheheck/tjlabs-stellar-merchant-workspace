// MIT. Bounded exact complete-carrier cache; validated immutable originals are reused through session copying.
export function cachePlanningReceive(S,receive,{maxBytes=64*1024*1024,maxEntries=8}={}){
 const entries=new Map();let bytes=0;
 function freeze(x){if(x&&typeof x==='object'&&!Object.isFrozen(x)){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;}
 return raw=>{
  if(typeof raw!=='string')return receive(raw);
  let entry=entries.get(raw);if(entry){entries.delete(raw);entries.set(raw,entry);return S.copy(entry.session);}
  const session=receive(raw),size=2*(raw.length+JSON.stringify(session).length);
  if(size<=maxBytes){entry={session:freeze(session),size};entries.set(raw,entry);bytes+=size;while(entries.size>maxEntries||bytes>maxBytes){const first=entries.keys().next().value;bytes-=entries.get(first).size;entries.delete(first);}}
  return S.copy(session);
 };
}
