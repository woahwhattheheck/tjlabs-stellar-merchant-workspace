function createOrkyoCopyStore(storage,codec,prefix="tjlabs.orkyo.desk.v1."){
const session=globalThis.crypto?.randomUUID?.()||Date.now()+"-"+Math.random().toString(36).slice(2);let version=0;
function save(record){const body=JSON.stringify(record);const key=prefix+session+"."+String(++version).padStart(8,"0");storage.setItem(key,body);if(storage.getItem(key)!==body)throw Error("Saved copy readback differs");return {key,bytes:codec.utf8Encode(body).length,sha256:codec.sha256(codec.utf8Encode(body))}}
function list(){const out=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(prefix))continue;const raw=storage.getItem(key);try{const body=JSON.parse(raw);out.push({key,at:body.savedAt,title:body.workspace?.title,revision:body.workspace?.revision,body,raw})}catch(e){out.push({key,error:e.message,raw})}}return out.sort((a,b)=>String(b.at||b.key).localeCompare(String(a.at||a.key)))}
return {save,list};
}