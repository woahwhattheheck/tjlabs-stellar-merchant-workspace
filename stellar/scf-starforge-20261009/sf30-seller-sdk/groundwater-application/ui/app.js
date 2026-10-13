(() => {
"use strict";
const config=window.GROUNDWATER_APPLICATION_CONFIG||{};
const base=new URL(config.apiBase||"/api/application",location.href);
if(base.origin!==location.origin)throw new Error("Keep this application's same-origin receiving API.");
const apiBase=base.pathname.replace(/\/$/,""),prefix="groundwater.application:"+location.origin+apiBase+":"+config.storageKey+":";
const el=id=>document.getElementById(id),pretty=value=>JSON.stringify(value,null,2);
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const code=value=>"<code>"+esc(value)+"</code>";
const stored=(name,fallback)=>{const raw=localStorage.getItem(prefix+name);return raw===null?fallback:JSON.parse(raw);};
const save=(name,value)=>localStorage.setItem(prefix+name,JSON.stringify(value));
let current=null,preview=null,busy=false,pending=stored("pending",null),detail=null;
function notice(message,error=false){el("notice").hidden=!message;el("notice").className=error?"error":"";el("notice").textContent=message||"";}
function setBusy(value){busy=value;for(const node of document.querySelectorAll("button"))node.disabled=value;}
function facts(id,rows){el(id).innerHTML=rows.map(([name,value])=>"<dt>"+esc(name)+"</dt><dd>"+value+"</dd>").join("");}
function downloadJSON(value,name){const url=URL.createObjectURL(new Blob([pretty(value)+"\n"],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function api(path,{body,method="GET"}={}){
 const headers={};if(body!==undefined){method="POST";headers["Content-Type"]="application/json";headers["X-CSRFToken"]=config.csrfToken||"";}
 const response=await fetch(apiBase+path,{method,headers,credentials:"same-origin",cache:"no-store",redirect:"error",...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const value=await response.json();if(!response.ok||value.error){const error=new Error(value.error?.message||"Original request returned HTTP "+response.status);error.code=value.error?.code;error.detail=value.error?.detail;throw error;}return value;
}
function pendingView(){
 el("pending-card").hidden=!pending;
 if(!pending)return;
 el("pending-text").textContent="Receiving "+pending.request.operationId+" is retained for "+pending.request.preview.workspaceId+". Read its current original result, or continue that same request.";
 el("pending-request").textContent=pretty(pending);
}
function retirePending(value){
 if(pending&&value.result?.operationId===pending.request.operationId){
  // Do not remove browser recovery before a complete result is retained here.
  save("completed:"+pending.request.operationId,value);
  localStorage.removeItem(prefix+"pending");pending=null;pendingView();
 }
}
async function refresh(){
 current=await api("/state");
 el("original-identity").textContent=current.original.workspace.id+" · "+current.original.directory;
 el("receiving-root").textContent=current.receivingRoot.directory;
 el("source-sha").textContent=current.sourceSha256;
 el("original-link").href=current.original.url;
 el("create-backup-link").href=current.original.url+"#backup";
 el("opened").innerHTML=current.opened.map(row=>'<div class="workspace-row"><div><strong>'+esc(row.workspace.id)+
  '</strong><small>'+esc(row.directory)+'</small></div><span class="badge">'+esc(row.state)+'</span>'+
  (row.state==="open"?'<a href="'+esc(row.url)+'">Open scientific workspace ↗</a>':"")+"</div>").join("");
 el("receiving-list").innerHTML=current.receivings.length?current.receivings.map(row=>
  '<div class="receiving-row"><span class="badge '+esc(row.recordedState)+'">'+esc(row.recordedState)+
  '</span><strong>'+esc(row.workspaceId||row.operationId)+'</strong><div class="meta">'+
  esc(row.createdAt||"")+" · "+esc(row.actor||"")+'<br>'+esc(row.operationId)+
  '</div><button type="button" data-open="'+esc(row.operationId)+'">Inspect original receiving</button></div>').join(""):
  '<p class="empty">No backup has been received in this selected directory.</p>';
 pendingView();
}
function showPreview(value){
 preview=value;el("preview-panel").hidden=false;
 facts("preview-facts",[["Workspace",code(value.workspaceId)],["Backup",code(value.backupId||"Original package")],
  ["Complete ZIP",esc(value.archive.bytes.toLocaleString()+" bytes")],["Original members",esc(String(value.files))],
  ["Expanded bytes",esc(value.expandedBytes.toLocaleString())],["ZIP SHA-256",code(value.archive.sha256)],
  ["Manifest SHA-256",code(value.manifestSha256)],["Review",code(value.reviewSha256)]]);
 el("preview-json").textContent=pretty(value);
}
async function showReceiving(id){
 detail=await api("/receivings/"+encodeURIComponent(id));el("detail-panel").hidden=false;
 const request=detail.request.body,result=detail.result;
 el("detail-title").textContent=request.preview.workspaceId;
 el("detail-status").textContent=result?"The complete original package, native restore and current working copy have been verified.":"This original receiving remains pending. Continue its retained archive and destination.";
 facts("detail-facts",[["Receiving",code(id)],["Operator",esc(request.actor)],["Purpose",esc(request.reason)],
  ["Original ZIP",esc(request.preview.archive.path)],["SHA-256",code(request.preview.archive.sha256)],
  ["Destination",esc(request.destination)],...(result?[["Current version",esc(detail.current.workspace.version)],["Automatic model run","None"]]:[])]);
 const actions=el("detail-actions");actions.replaceChildren();
 const button=document.createElement("button");button.type="button";button.className="primary";
 button.textContent=result?"Open received scientific workspace":"Continue original receiving";
 button.dataset[result?"openReceived":"continue"]=id;actions.append(button);
 if(result){
  for(const [suffix,label] of [["archive","Download original complete backup"],["receipt","Download complete receiving record"]]){
   const a=document.createElement("a");a.href=apiBase+"/receivings/"+encodeURIComponent(id)+"/"+suffix;a.textContent=label;actions.append(a);
  }
 }
 el("detail-json").textContent=pretty(detail);
 retirePending(detail);return detail;
}
async function recover(){
 if(!pending)return;
 if(pending.apiBase!==apiBase||pending.origin!==location.origin||
  pending.originalWorkspaceIdentity!==current.original.sha256||pending.receivingIdentity!==current.receivingRoot.sha256||
  pending.sourceSha256!==current.sourceSha256)throw new Error("The retained browser request belongs to another original workspace, receiving directory or application source.");
 let value;
 try{value=await api("/receivings/"+encodeURIComponent(pending.request.operationId));}
 catch(error){
  if(!["GROUNDWATER_RECEIVING_REQUEST_MISSING"].includes(error.code))throw error;
  value=await api("/receive-backup",{body:pending.request});
 }
 if(!value.result)value=await api("/continue-receiving",{body:{operationId:pending.request.operationId}});
 retirePending(value);await refresh();await showReceiving(value.request.body.operationId);
}
async function run(work){
 if(busy)return;setBusy(true);notice("");
 try{await work();}catch(error){notice(error.message,true);}
 finally{setBusy(false);pendingView();}
}
el("inspect-form").addEventListener("submit",event=>{event.preventDefault();run(async()=>{
 if(pending)throw new Error("Read or continue the retained receiving before selecting another backup.");
 const value=await api("/inspect-backup",{body:{path:el("archive-path").value.trim()}});
 showPreview(value);save("draft",{archivePath:el("archive-path").value,actor:el("actor").value,reason:el("reason").value});
 notice("Every member of the complete original backup has been verified.");
});});
el("receive-form").addEventListener("submit",event=>{event.preventDefault();run(async()=>{
 if(pending)throw new Error("Continue the retained receiving request first.");
 if(!preview)throw new Error("Inspect the complete original backup first.");
 const request={operationId:crypto.randomUUID(),actor:el("actor").value.trim(),reason:el("reason").value.trim(),preview};
 const record={origin:location.origin,apiBase,originalWorkspaceIdentity:current.original.sha256,
  receivingIdentity:current.receivingRoot.sha256,sourceSha256:current.sourceSha256,request};
 save("pending",record);pending=record;pendingView();
 const value=await api("/receive-backup",{body:request});
 retirePending(value);await refresh();await showReceiving(request.operationId);
 notice("The original backup is received. Open its independent scientific working copy.");
});});
el("recover").addEventListener("click",()=>run(recover));
el("export-request").addEventListener("click",()=>{if(pending)downloadJSON(pending,"Groundwater_Receiving_Request_"+pending.request.operationId+".json");});
el("refresh").addEventListener("click",()=>run(refresh));
document.addEventListener("click",event=>{
 const open=event.target.closest("[data-open]"),continued=event.target.closest("[data-continue]"),received=event.target.closest("[data-open-received]");
 if(open)run(()=>showReceiving(open.dataset.open));
 if(continued)run(async()=>{await api("/continue-receiving",{body:{operationId:continued.dataset.continue}});await refresh();await showReceiving(continued.dataset.continue);});
 if(received)run(async()=>{const value=await api("/open-received",{body:{operationId:received.dataset.openReceived}});await refresh();location.assign(value.url);});
});
for(const id of ["archive-path","actor","reason"])el(id).addEventListener("input",()=>save("draft",{archivePath:el("archive-path").value,actor:el("actor").value,reason:el("reason").value}));
const draft=stored("draft",{});el("archive-path").value=draft.archivePath||"";
el("actor").value=draft.actor||window.GROUNDWATER_CONFIG?.actor||"";el("reason").value=draft.reason||"";
run(refresh);
})();
