export function createFleetStore(indexedDB,hash){
 const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error("Storage request failed"))});
 let promise;
 function db(){return promise||(promise=new Promise((resolve,reject)=>{const r=indexedDB.open("fleet-commissioning-desk-v1",1);r.onupgradeneeded=()=>{r.result.createObjectStore("copies",{keyPath:"id"});r.result.createObjectStore("journal",{keyPath:"id"})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error("Cannot open saved copies"));r.onblocked=()=>reject(Error("Saved-copy storage is blocked by another page"))}))}
 async function list(store="copies"){const d=await db();return request(d.transaction(store,"readonly").objectStore(store).getAll())}
 async function get(id){const d=await db();return request(d.transaction("copies","readonly").objectStore("copies").get(id))}
 async function save(id,expected,payload){
  const value=JSON.parse(JSON.stringify(payload)),digest=hash(value),d=await db(),journalId=id+"::"+Date.now()+"::"+Math.random().toString(36).slice(2);
  return new Promise((resolve,reject)=>{let result;const tx=d.transaction(["copies","journal"],"readwrite"),copies=tx.objectStore("copies"),journal=tx.objectStore("journal");
   const proposed={id:journalId,copyId:id,at:new Date().toISOString(),expected,sha256:digest,payload:value};
   journal.add(proposed);const r=copies.get(id);
   r.onsuccess=()=>{const old=r.result;if((old?old.sha256:null)!==expected){result={saved:false,conflict:true,proposal:journalId,current:old||null};return}const next={id,at:proposed.at,sha256:digest,payload:value};copies.put(next);result={saved:true,record:next,proposal:journalId}};
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||Error("Saved-copy transaction did not complete"));tx.onerror=()=>{};
  });
 }
 return{list,get,save};
}
