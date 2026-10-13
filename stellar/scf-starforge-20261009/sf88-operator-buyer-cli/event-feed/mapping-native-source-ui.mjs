/* MIT. Full native mapping sources over the existing authenticated Analysis service. */
const need=(ok,text)=>{if(!ok)throw Error(text);};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const encode=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);};
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function receiveEventMappingNativeSource({api,root,workspaceId,programme,inputId,file,validate,onProgress}){
 need(file&&file.size>0&&file.size<=192*1024*1024,'Choose the whole original working JSON within192MiB.');
 const raw=new Uint8Array(await file.arrayBuffer());need(raw.length===file.size,'The complete selected file changed.');
 const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw),value=JSON.parse(text);
 const selected=await validate(value),digest=await sha(raw),descriptor={id:digest,bytes:raw.length,sha256:digest};
 const metadata={...descriptor,programme,input_id:inputId,name:'mapping-working.json'};
 const checked=v=>{
  need(v?.workspace_id===workspaceId&&Object.keys(metadata).every(k=>v[k]===metadata[k])&&v.chunk_bytes===65536&&
   Number.isSafeInteger(v.received)&&v.received>=0&&v.received<=raw.length&&v.complete===(v.received===raw.length),'The original native receiving identity changed.');
  return v;
 };
 let current=checked(await api(root+'/mapping-working',metadata));
 while(!current.complete){
  const offset=current.received,part=raw.subarray(offset,offset+65536);
  current=checked(await api(root+'/mapping-working/'+digest+'/chunks',{offset,base64:encode(part),sha256:await sha(part)}));
  need(current.received>=offset+part.length,'The original complete chunk was not acknowledged.');
  onProgress?.({received:current.received,bytes:raw.length});
 }
 return {descriptor,value,selected,status:current};
}
export async function downloadEventMappingNativeSource({api,root,workspaceId,descriptor,kind='source',expectedHTML}){
 need(['source','html'].includes(kind),'Choose complete JSON or editable HTML.');
 const status=await api(root+'/mapping-working/'+descriptor.id);
 need(status.workspace_id===workspaceId&&status.complete&&['id','bytes','sha256'].every(k=>status[k]===descriptor[k]),'The original retained working source changed.');
 const selected=kind==='source'?status:status.derived?.html;
 need(selected&&Number.isSafeInteger(selected.bytes)&&selected.bytes>0&&selected.bytes<=(kind==='source'?192:256)*1024*1024,'The complete selected file is unavailable.');
 if(kind==='html'&&expectedHTML)need(['bytes','sha256'].every(k=>selected[k]===expectedHTML[k]),'The saved action selected another editable HTML.');
 const bytes=new Uint8Array(selected.bytes);let offset=0;
 while(offset<bytes.length){
  const v=await api(root+'/mapping-working/'+descriptor.id+'/'+kind+'?offset='+offset+'&limit=65536'),part=decode(v.base64);
  need(v.source?.workspace_id===workspaceId&&['id','bytes','sha256'].every(k=>v.source[k]===descriptor[k])&&
   v.kind===kind&&v.bytes===bytes.length&&v.sha256===selected.sha256&&v.offset===offset&&
   v.length===part.length&&part.length>0&&part.length<=65536&&offset+part.length<=bytes.length&&
   v.next_offset===offset+part.length&&v.eof===(offset+part.length===bytes.length)&&await sha(part)===v.range_sha256,
   'The selected complete-file range changed.');
  bytes.set(part,offset);offset+=part.length;
 }
 need(await sha(bytes)===selected.sha256,'The whole downloaded file changed.');
 return {bytes,name:kind==='source'?'mapping-working-'+descriptor.id.slice(0,16)+'.json':'mapping-working-'+descriptor.id.slice(0,16)+'.html',type:kind==='source'?'application/json;charset=utf-8':'text/html;charset=utf-8'};
}
export function requestEventMappingSourceDownload(file){
 const url=URL.createObjectURL(new Blob([file.bytes],{type:file.type})),link=document.createElement('a');
 link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
