function mountFleetDesk(engine,store,embedded,example,buildPortable){
"use strict";
const $=id=>document.getElementById(id), clone=x=>JSON.parse(JSON.stringify(x)),uid=()=>globalThis.crypto?.randomUUID?.()||("copy-"+Date.now()+"-"+Math.random().toString(36).slice(2));
const formIds=["name","as-of","family","source-name","source-id","raw","mapping","review-finding","review-basis","review-status","reviewer","review-note","review-time"];
const literal=new Map();let reviewDrafts={};let queue=Promise.resolve();let workspace,copyId=uid(),expected=null,changed=true,busy=0,generation=0,timer=null,storageError="",selectedSnapshot;
function notice(s){$("notice").textContent=s}
function write(id,value){$(id).value=value;literal.set(id,value)}
function read(id){return literal.has(id)?literal.get(id):$(id).value}
function forms(){return Object.fromEntries(formIds.map(id=>[id,read(id)]))}
function normalize(payload){
 if(!payload||payload.schema!=="tjlabs.fleet-desk.v1")throw Error("Open a complete fleet desk working file.");
 const w=engine.validate(payload.workspace),f=payload.forms;
 if(!f||typeof f!=="object"||Array.isArray(f)||formIds.some(k=>typeof f[k]!=="string"))throw Error("Working file has incomplete literal forms.");
 if(!Object.hasOwn(engine.fields,f.family))throw Error("Unknown intake family in working file.");
 const drafts=payload.reviewDrafts||{};if(!drafts||typeof drafts!=="object"||Array.isArray(drafts))throw Error("Review drafts must be a complete object.");
 for(const [key,d]of Object.entries(drafts))if(!d||typeof d!=="object"||["review-finding","review-basis","review-status","reviewer","review-note","review-time"].some(k=>typeof d[k]!=="string")||key!==engine.hash([d["review-finding"],d["review-basis"]]))throw Error("Review draft identity differs.");
 return{schema:payload.schema,workspace:w,forms:clone(f),reviewDrafts:clone(drafts)};
}
function capture(){return normalize({schema:"tjlabs.fleet-desk.v1",workspace,forms:forms(),reviewDrafts})}
function restore(payload){const p=normalize(payload);workspace=p.workspace;reviewDrafts=clone(p.reviewDrafts);for(const id of formIds)write(id,p.forms[id]);render()}
function defaults(w){return {schema:"tjlabs.fleet-desk.v1",workspace:w,forms:{name:w.name,"as-of":w.asOf,family:"organizations","source-name":"","source-id":"","raw":"","mapping":"{}","review-finding":"","review-basis":"","review-status":"investigate",reviewer:"","review-note":"","review-time":new Date().toISOString()}}}
function dirty(){changed=true;generation++;clearTimeout(timer);timer=setTimeout(()=>{timer=null;save().catch(error)},700)}
function lock(){busy++;document.querySelectorAll("[data-change]").forEach(x=>x.disabled=true)}
function unlock(){busy--;if(!busy)document.querySelectorAll("[data-change]").forEach(x=>x.disabled=false)}
function error(e){storageError=String(e.message||e);notice(storageError+" Your current work remains here; Download working file and Portable desk do not require a successful save.");renderStatus()}
async function work(fn){lock();try{await fn()}catch(e){error(e)}finally{unlock();renderStatus()}}
function renderStatus(){$("save-state").textContent=(changed?"Unsaved local work":"Saved local copy")+(storageError?" · "+storageError:"")+" · No Atlas/device connection";}
function save(){
 const p=capture(),g=generation,id=copyId;busy++;renderStatus();
 const execute=async()=>{const basis=expected;
 try{const result=await store.save(id,basis,p);if(copyId!==id)return result;if(result.saved){expected=result.record.sha256;if(g===generation){changed=false;storageError=""}notice("Complete working copy and literal forms saved.")}else{storageError="Another page changed this copy. Your full proposal is retained in Recovery; save an independent copy to continue.";changed=true;notice(storageError)}await lists();return result}finally{busy--;renderStatus()}};
 const result=queue.then(execute,execute);queue=result.catch(()=>{});return result;
}
async function preserve(){clearTimeout(timer);timer=null;const r=await save();if(!r.saved)throw Error("Resolve the saved-copy conflict with Save independent copy before switching. Your proposal remains recoverable.")}
async function adopt(payload,label){
 const p=normalize(payload);await preserve();
 const id=uid(),r=await store.save(id,null,p);if(!r.saved)throw Error("New copy was not created.");
 copyId=id;expected=r.record.sha256;restore(p);changed=false;storageError="";generation++;await lists();notice(label+" opened as an independent local copy.");
}
async function fork(){const p=capture(),id=uid(),r=await store.save(id,null,p);if(!r.saved)throw Error("Independent copy was not created.");copyId=id;expected=r.record.sha256;changed=false;storageError="";generation++;await lists();notice("Complete current work saved as an independent copy.");renderStatus()}
function download(name,body,type="application/json"){const blob=body instanceof Blob?body:new Blob([body],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function options(select,items,selected){select.replaceChildren();for(const x of items){const o=document.createElement("option");o.value=x.value;o.textContent=x.label;select.append(o)}if(items.some(x=>x.value===selected))select.value=selected}
async function lists(){
 try{const copies=await store.list(),journals=await store.list("journal");options($("copies"),copies.sort((a,b)=>b.at.localeCompare(a.at)).map(r=>({value:r.id,label:r.payload.workspace.name+" · "+r.at+(r.id===copyId?" · current":"")})),copyId);options($("recoveries"),journals.sort((a,b)=>b.at.localeCompare(a.at)).map(r=>({value:r.id,label:r.payload.workspace.name+" · "+r.at+" · "+r.id.slice(-8)})),$("recoveries").value)}catch(e){storageError=String(e.message||e)}
}
function render(){
 selectedSnapshot=engine.snapshot(workspace);
 $("title").textContent=workspace.name;
 $("summary").textContent=selectedSnapshot.devices.length+" unique device rows · "+selectedSnapshot.findings.filter(x=>x.severity!=="information").length+" attention findings · "+workspace.sources.length+" retained source editions · "+workspace.decisions.length+" retained review decisions.";
 $("devices").innerHTML="<table><thead><tr><th>Organization</th><th>Device</th><th>State</th><th>Last observation</th><th>Telemetry</th></tr></thead><tbody>"+selectedSnapshot.devices.map(d=>"<tr>"+[d.organization_id,d.device_id,d.state,d.last_observed_at,d.telemetry_assessment].map(v=>"<td>"+esc(v)+"</td>").join("")+"</tr>").join("")+"</tbody></table>";
 $("findings").innerHTML=selectedSnapshot.findings.map(f=>'<article><h3>'+esc(f.code)+'</h3><p>'+esc(f.message)+'</p><p>'+esc(f.identity)+'</p><p>Source rows: '+esc(f.evidence.map(r=>r.sourceId+" line "+r.line+" / record "+r.record).join("; "))+'</p><p>'+esc(f.review?"Reviewed "+f.review.status+" by "+f.review.reviewer+": "+f.review.note:"No review on this exact basis")+'</p><p>'+f.previousReviewCount+' earlier-basis reviews retained.</p><button type="button" data-change data-pick="'+f.id+'">Review this finding</button></article>').join("")||"<p>No findings for the selected source set.</p>";
 $("findings").querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>selectFinding(b.dataset.pick));
 $("sources").innerHTML=workspace.sources.map(s=>'<article><h3>'+esc(s.family)+" · "+esc(s.filename)+'</h3><p>'+esc(s.id)+(workspace.selected[s.family]===s.id?" · selected":" · retained previous edition")+'</p><code>'+s.sha256+'</code><p><button type="button" data-original="'+esc(s.id)+'">Download unchanged original</button> <button type="button" data-select="'+esc(s.id)+'" data-change>Select this edition</button></p></article>').join("")||"<p>No source editions admitted yet. Your incomplete intake stays in the form.</p>";
 $("sources").querySelectorAll("[data-original]").forEach(b=>b.onclick=()=>{const s=workspace.sources.find(x=>x.id===b.dataset.original);download(s.filename,s.raw,"text/csv;charset=utf-8")});
 $("sources").querySelectorAll("[data-select]").forEach(b=>b.onclick=()=>work(async()=>{const s=workspace.sources.find(x=>x.id===b.dataset.select);workspace=engine.selectSource(workspace,s.family,s.id);dirty();render();await save()}));
 $("history").textContent=JSON.stringify({history:workspace.history,decisions:workspace.decisions},null,2);
 if(busy)document.querySelectorAll("[data-change]").forEach(x=>x.disabled=true);renderStatus();
}
function selectFinding(id){
 if(busy){notice("Wait for the current save or action before changing the reviewed finding.");return}
 const f=selectedSnapshot.findings.find(x=>x.id===id);if(!f)throw Error("Select a current finding.");
 const keys=["review-finding","review-basis","review-status","reviewer","review-note","review-time"],old=Object.fromEntries(keys.map(k=>[k,read(k)]));
 if(old["review-finding"])reviewDrafts[engine.hash([old["review-finding"],old["review-basis"]])]=old;
 const draft=reviewDrafts[engine.hash([f.id,f.basis])]||{"review-finding":f.id,"review-basis":f.basis,"review-status":"investigate",reviewer:"","review-note":"","review-time":new Date().toISOString()};
 for(const k of keys)write(k,draft[k]);dirty();$("review-note").focus();
}
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
for(const f of Object.keys(engine.fields)){const o=document.createElement("option");o.value=f;o.textContent=f;$("family").append(o)}
for(const id of formIds)$(id).addEventListener("input",()=>{literal.delete(id);dirty()});
$("source-file").onchange=()=>work(async()=>{
 const file=$("source-file").files[0];if(!file)return;
 await preserve();
 const bytes=await file.arrayBuffer(),raw=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);
 write("source-name",file.name);write("source-id",read("family")+"-"+uid());write("raw",raw);write("mapping","{}");dirty();$("source-file").value="";
 notice("Original UTF-8 bytes retained in intake. Select mappings, then admit a new source edition.");await save();
});
$("map").onclick=()=>work(async()=>{const p=engine.parseCSV(read("raw")),f=read("family");write("mapping",JSON.stringify(Object.fromEntries(engine.fields[f].map(k=>[k,p.headers.includes(k)?k:""])),null,2));dirty();notice("Matching column names mapped. Edit the mapping for your original headers; blank optional fields remain absent.");});
$("admit").onclick=()=>work(async()=>{
 const source={id:read("source-id"),family:read("family"),filename:read("source-name"),raw:read("raw"),mapping:JSON.parse(read("mapping"))};
 const next=engine.addSource(workspace,source);workspace=next;dirty();render();await save();
});
$("time").onclick=()=>work(async()=>{workspace=engine.setAsOf(workspace,read("as-of"));dirty();render();await save()});
$("rename").onclick=()=>work(async()=>{const name=read("name");if(!name.trim())throw Error("Supply a copy name.");workspace=engine.rename(workspace,name);dirty();render();await save()});
$("review").onclick=()=>work(async()=>{const f=engine.snapshot(workspace).findings.find(x=>x.id===read("review-finding"));if(!f)throw Error("Select a current finding.");workspace=engine.review(workspace,{findingId:f.id,basis:read("review-basis"),status:read("review-status"),reviewer:read("reviewer"),note:read("review-note"),at:read("review-time")});dirty();render();await save()});
$("save").onclick=()=>work(save);$("fork").onclick=()=>work(fork);
$("refresh").onclick=()=>work(lists);
$("open-copy").onclick=()=>work(async()=>{const r=await store.get($("copies").value);if(!r)throw Error("Saved copy not found.");await adopt(r.payload,"Selected saved work")});
$("open-recovery").onclick=()=>work(async()=>{const rows=await store.list("journal"),r=rows.find(x=>x.id===$("recoveries").value);if(!r)throw Error("Recovery record not found.");await adopt(r.payload,"Selected full recovery")});
$("download-recovery").onclick=()=>work(async()=>{const rows=await store.list("journal"),r=rows.find(x=>x.id===$("recoveries").value);if(!r)throw Error("Recovery record not found.");download("fleet-recovery.json",JSON.stringify(r.payload,null,2))});
$("new").onclick=()=>work(()=>adopt(defaults(engine.create(uid(),"Untitled fleet comparison",new Date().toISOString())),"Empty comparison"));
$("example").onclick=()=>work(()=>adopt(defaults(example.initial),"Authored original example"));
$("corrected").onclick=()=>work(()=>adopt(defaults(example.final),"Authored corrected example"));
$("open-file").onchange=()=>work(async()=>{const f=$("open-file").files[0];if(!f)return;if(f.size>128000000)throw Error("Working file exceeds 128 MB.");const raw=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(await f.arrayBuffer()),p=normalize(JSON.parse(raw.charCodeAt(0)===0xfeff?raw.slice(1):raw));await adopt(p,"Imported working file");$("open-file").value=""});
$("download").onclick=()=>{try{download("fleet-working.json",JSON.stringify(capture(),null,2))}catch(e){error(e)}};
$("portable").onclick=()=>{try{download("fleet-portable.html",buildPortable(capture()),"text/html;charset=utf-8")}catch(e){error(e)}};
$("report").onclick=()=>{try{download("fleet-report.html",engine.report(workspace),"text/html;charset=utf-8")}catch(e){error(e)}};
$("csv").onclick=()=>{try{const s=engine.snapshot(workspace);download("fleet-findings.csv",engine.csv(["code","severity","identity","message","source_rows","review_status","reviewer","note"],s.findings.map(f=>({...f,source_rows:f.evidence.map(x=>x.sourceId+":"+x.line).join(" | "),review_status:f.review?.status||"",reviewer:f.review?.reviewer||"",note:f.review?.note||""}))),"text/csv;charset=utf-8")}catch(e){error(e)}};
$("device-csv").onclick=()=>{try{const s=engine.snapshot(workspace);download("fleet-devices.csv",engine.csv(["organization_id","device_id","serial","model","state","state_at","last_observed_at","silence_seconds","supplied_limit_seconds","telemetry_assessment"],s.devices),"text/csv;charset=utf-8")}catch(e){error(e)}};
window.addEventListener("beforeunload",e=>{if(changed||busy||timer||storageError){e.preventDefault();e.returnValue=""}});
(async()=>{const p=embedded?normalize(embedded):defaults(example.initial);restore(p);changed=true;try{const r=await store.save(copyId,null,p);if(r.saved){expected=r.record.sha256;changed=false;await lists();notice("This file's embedded state is open in its own independent copy. Older saved copies are available below.")}}catch(e){error(e)}renderStatus()})();
return {capture,normalize,save,fork,adopt,restore,selectFinding,getState:()=>({copyId,expected,changed,busy,generation,storageError})};
}
