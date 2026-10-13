const $=id=>document.getElementById(id), copy=x=>structuredClone(x);
let core=null,book=null,books=[],history=[],token=null,pending=null,busy=false,db=null;
const id=prefix=>prefix+"-"+crypto.randomUUID(),time=()=>new Date().toISOString();
function status(message){$("status").textContent=message}
function options(select,rows,{empty=true}={}){const chosen=select.value;select.replaceChildren();if(empty){const o=new Option("Choose…","");select.add(o)}for(const [value,label]of rows)select.add(new Option(label,value));if([...select.options].some(o=>o.value===chosen))select.value=chosen}
function table(target,columns,rows){const t=document.createElement("table"),thead=t.createTHead(),tr=thead.insertRow();for(const [,label]of columns){const th=document.createElement("th");th.textContent=label;tr.append(th)}const body=t.createTBody();for(const row of rows){const line=body.insertRow();for(const [key]of columns){const cell=line.insertCell();const value=typeof key==="function"?key(row):row[key];cell.textContent=value==null?"—":String(value)}}if(!rows.length){const p=document.createElement("p");p.textContent="No records saved.";target.replaceChildren(p)}else target.replaceChildren(t)}
async function api(path,body,{raw=false}={}){const headers=body===undefined?{}:{"X-Intake-Token":token,...(raw?{}:{"Content-Type":"application/json"})};const r=await fetch(path,{method:body===undefined?"GET":"POST",headers,body:body===undefined?undefined:raw?body:JSON.stringify(body),cache:"no-store"});const value=await r.json();if(!r.ok)throw Object.assign(new Error(value.error??"Request failed"),{status:r.status,body:value});return value}
async function database(){if(db)return db;db=await new Promise((resolve,reject)=>{const r=indexedDB.open("class-attendance-operations",1);r.onupgradeneeded=()=>r.result.createObjectStore("pending");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return db}
async function saved(value){const d=await database();return new Promise((resolve,reject)=>{const tx=d.transaction("pending",value===undefined?"readonly":"readwrite"),s=tx.objectStore("pending"),key=core.workspaceId+":attendance";let r;if(value===undefined)r=s.get(key);else if(value===null)r=s.delete(key);else r=s.put(value,key);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
function locked(){const latest=books.find(x=>x.id===book?.id);return busy||!!pending||!!(book&&latest&&book.revision!==latest.revision)}
function lock(){for(const form of document.querySelectorAll("#book form"))for(const node of form.elements)node.disabled=locked();for(const node of $("new-review").elements)node.disabled=busy||!!pending;$("adopt-source").disabled=locked();$("export").disabled=!book||busy||!!pending;$("packet").disabled=busy||!!pending}
async function pendingState(){pending=await saved();$("pending").hidden=!pending;if(pending){$("pending-label").textContent=pending.kind==="save"?"Attendance save "+pending.body.requestId:"Complete handover "+pending.filename;$("discard").hidden=!pending.rejected}$("resume").disabled=busy;lock()}
function money(value,currency){if(value==null)return "—";const digits=source()?.definition.currencyDigits[currency]??2;const n=BigInt(value),sign=n<0n?"-":"",a=n<0n?-n:n,factor=10n**BigInt(digits);return sign+(a/factor).toString()+(digits?"."+(a%factor).toString().padStart(digits,""):"")+" "+currency}
function source(){if(!book)return null;return core.reviews.find(x=>x.id===book.definition.intake.id&&x.revision===book.definition.intake.revision)??book.intakeView}
function render(){
 $("book").hidden=!book;if(!book){$("anchor").textContent="Choose an existing intake and name the original visit-grant basis.";lock();return}
 const d=book.definition,v=book.derived,base=source(),classes=base?.derived.datasets.catalogue??[],regs=base?.derived.datasets.registrations??[];
 $("anchor").textContent="Selected intake "+d.intake.id+" / edition "+d.intake.revision+" / "+d.intake.derivedSha256;
 $("revision").textContent="Attendance "+book.id+" / edition "+book.revision+" · "+book.actor+" · "+book.at+" · "+d.note;
 const latest=core.reviews.find(x=>x.id===d.intake.id);$("source-update").hidden=!latest||latest.revision===d.intake.revision;
 $("totals").textContent=v.totals.sessions+" sessions · "+v.totals.enrollments+" enrollments · "+v.totals.used+" used visits · "+v.totals.reserved+" reserved · "+v.totals.remaining+" remaining";
 table($("balances"),[["registrationId","Registration"],["studentKey","Student"],["classId","Class"],["granted","Granted"],["adjusted","Adjustment"],["used","Used"],["reserved","Booked"],["remaining","Remaining"],["available","Available"],[r=>money(r.balanceMinor,r.currency),"Payment balance"]],v.balances);
 table($("sessions"),[["id","Session"],["title","Class"],["start","Start"],["end","End"],["instructor","Instructor"],["state","State"],["occupied","Occupied"],["capacity","Places"],["waitlisted","Waiting"]],v.sessions);
 table($("visits"),[["id","Visit"],["registrationId","Registration"],["sessionId","Session"],["state","State"],["units","Visits used"],[r=>r.confirmation?.instructor,"Confirmation"],["reason","Reason"]],d.visits);
 const ul=document.createElement("ul");for(const item of v.issues){const li=document.createElement("li");li.textContent=[item.sessionId??item.visitId??"",item.detail].join(" — ");ul.append(li)}$("issues").replaceChildren(ul);if(!v.issues.length)$("issues").textContent="No additional session review notes.";
 const sf=$("session-form"),ef=$("enrollment-form"),af=$("adjustment-form"),vf=$("visit-form"),rf=$("reschedule-form");
 options(sf.elements.existing,d.sessions.map(s=>[s.id,s.id+" · "+s.start]));
 options(sf.elements.classId,classes.map(c=>[c.id,c.title+" · "+c.id]));
 options(ef.elements.registrationId,regs.filter(r=>!d.enrollments.some(e=>e.registrationId===r.id)).map(r=>[r.id,r.id+" · "+r.student_key+" · "+r.class_id]));
 const enrolled=d.enrollments.map(e=>{const r=regs.find(x=>x.id===e.registrationId);return[e.registrationId,e.registrationId+" · "+(r?.student_key??"")]});
 options(af.elements.registrationId,enrolled);options(vf.elements.registrationId,enrolled);
 options(vf.elements.existing,d.visits.filter(v=>v.state!=="rescheduled").map(v=>[v.id,v.id+" · "+v.state]));
 options(rf.elements.visitId,d.visits.filter(v=>["proposed","waitlist","booked"].includes(v.state)).map(v=>[v.id,v.id+" · "+v.registrationId]));
 options(rf.elements.sessionId,d.sessions.filter(s=>s.state!=="cancelled").map(s=>[s.id,s.id+" · "+s.start]));
 visitSessions();lock();
}
function visitSessions(){if(!book)return;const f=$("visit-form"),reg=(source()?.derived.datasets.registrations??[]).find(r=>r.id===f.elements.registrationId.value);options(f.elements.sessionId,book.definition.sessions.filter(s=>!reg||s.classId===reg.class_id).map(s=>[s.id,s.id+" · "+s.start+" · "+s.state]))}
async function openBook(id,revision){book=await api("/api/attendance/view?id="+encodeURIComponent(id)+(revision?"&revision="+revision:""));book.intakeView=await api("/api/view?id="+encodeURIComponent(book.definition.intake.id)+"&revision="+book.definition.intake.revision);history=await api("/api/attendance/history?id="+encodeURIComponent(id));options($("history"),history.map(x=>[String(x.revision),"Edition "+x.revision+" · "+x.actor]),{empty:false});$("history").value=String(book.revision);$("reviews").value=book.id;render()}
async function refresh(){core=await api("/api/state");token=core.token;const state=await api("/api/attendance/state");books=state.reviews;options($("reviews"),books.map(x=>[x.id,x.definition.name+" · "+x.id]));options($("intakes"),core.reviews.map(x=>[x.id,x.definition.name+" · edition "+x.revision]));await pendingState();if(book)await openBook(book.id,book.revision);else render();status("Local workspace ready. "+books.length+" attendance book(s).")}
async function resume(){
 if(!pending||busy)return;busy=true;lock();$("resume").disabled=true;status("Continuing the retained operation…");
 try{
  let result;if(pending.kind==="save"){
   const lookup=await api("/api/attendance/request?id="+encodeURIComponent(pending.body.requestId));
   if(lookup.state==="RECORDED"){if(JSON.stringify(lookup.request)!==JSON.stringify(pending.body)){
    // Server canonical key order differs; compare recursively without discarding nested values.
    const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==="object"?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
    if(JSON.stringify(canonical(lookup.request))!==JSON.stringify(canonical(pending.body)))throw Object.assign(new Error("Saved request identity has different content"),{status:409});
   }result=await api("/api/attendance/view?id="+encodeURIComponent(lookup.result.id)+"&revision="+lookup.result.revision)}
   else result=await api("/api/attendance/save",pending.body);
  }else{const received=await api("/api/attendance/receive",pending.file,{raw:true});result=received.current}
  await saved(null);pending=null;book=result;await refresh();await openBook(result.id,result.revision);status("Saved attendance edition "+result.revision+".");
 }catch(error){if([400,409].includes(error.status)&&(pending.kind==="save"||error.body?.adoptionState==="NOT_ADOPTED")){pending.rejected={status:error.status,message:error.message};await saved(pending)}status(error.message+(pending?.rejected?" The returned rejection is retained.":" The same complete operation is retained for retry."))}
 finally{busy=false;await pendingState()}
}
async function commit(definition,reason,{create=false}={}){
 if(busy||pending)throw new Error("Continue the saved operation first");const actor=$("actor").value.trim();if(!actor)throw new Error("Name the operator");if(!reason?.trim())throw new Error("Give the reason for this edition");
 definition.note=reason;const body={requestId:id("attendance-request"),actor,at:time(),definition};
 if(!create){if(locked())throw new Error("Select the latest attendance edition");body.id=book.id;body.expectedRevision=book.revision}
 pending={kind:"save",body};await saved(pending);await pendingState();await resume();
}
function bind(formId,handler){$(formId).addEventListener("submit",async event=>{event.preventDefault();try{await handler(new FormData(event.currentTarget),event.currentTarget)}catch(error){status(error.message)}})}
function update(list,key,row){const index=list.findIndex(x=>x[key]===row[key]);if(index<0)list.push(row);else list[index]=row}
bind("new-review",async data=>{const chosen=core.reviews.find(x=>x.id===$("intakes").value);if(!chosen)throw new Error("Select a saved intake");await commit({name:data.get("name"),intake:{id:chosen.id,revision:chosen.revision,derivedSha256:chosen.derivedSha256},note:data.get("reason"),sessions:[],enrollments:[],visits:[],adjustments:[]},data.get("reason"),{create:true})});
bind("session-form",async data=>{const d=copy(book.definition),sid=data.get("existing")||id("session");const row={id:sid,classId:data.get("classId"),start:data.get("start"),end:data.get("end"),timezone:data.get("timezone"),capacity:Number(data.get("capacity")),instructor:data.get("instructor"),state:data.get("state"),reason:data.get("reason")};update(d.sessions,"id",row);await commit(d,row.reason)});
bind("enrollment-form",async data=>{const d=copy(book.definition);d.enrollments.push({registrationId:data.get("registrationId"),granted:Number(data.get("granted")),reason:data.get("reason")});await commit(d,data.get("reason"))});
bind("adjustment-form",async data=>{const d=copy(book.definition);d.adjustments.push({id:id("adjustment"),registrationId:data.get("registrationId"),units:Number(data.get("units")),actor:$("actor").value.trim(),at:time(),reason:data.get("reason")});await commit(d,data.get("reason"))});
bind("visit-form",async data=>{const d=copy(book.definition),vid=data.get("existing")||id("visit"),state=data.get("state"),confirmed=String(data.get("reference")).trim();const row={id:vid,registrationId:data.get("registrationId"),sessionId:data.get("sessionId"),state,units:state==="attended"?1:["proposed","waitlist","booked"].includes(state)?0:Number(data.get("units")),reason:data.get("reason"),confirmation:confirmed?{instructor:data.get("instructor"),at:data.get("confirmedAt"),method:data.get("method"),reference:data.get("reference")}:null};update(d.visits,"id",row);await commit(d,row.reason)});
bind("reschedule-form",async data=>{const d=copy(book.definition),old=d.visits.find(x=>x.id===data.get("visitId"));if(!old)throw new Error("Select the original visit");if(old.sessionId===data.get("sessionId"))throw new Error("Select a different session");const target={id:id("visit"),registrationId:old.registrationId,sessionId:data.get("sessionId"),state:"proposed",confirmation:null,units:0,reason:data.get("reason")};old.state="rescheduled";old.units=0;old.reason=data.get("reason");old.replacementId=target.id;d.visits.push(target);await commit(d,data.get("reason"))});
$("session-form").elements.existing.addEventListener("change",event=>{const row=book?.definition.sessions.find(x=>x.id===event.target.value);if(row)for(const key of ["classId","start","end","timezone","capacity","instructor","state","reason"])$("session-form").elements[key].value=row[key]});
$("session-form").elements.classId.addEventListener("change",event=>{const c=source()?.derived.datasets.catalogue.find(c=>c.id===event.target.value);if(c){$("session-form").elements.instructor.value=c.instructor??"";if(/^\d+$/.test(c.capacity??""))$("session-form").elements.capacity.value=c.capacity}});
$("visit-form").elements.registrationId.addEventListener("change",visitSessions);
$("visit-form").elements.sessionId.addEventListener("change",event=>{const s=book?.definition.sessions.find(x=>x.id===event.target.value);if(s)$("visit-form").elements.instructor.value=s.instructor});
$("visit-form").elements.state.addEventListener("change",event=>{$("visit-form").elements.units.value=event.target.value==="attended"?"1":"0"});
$("visit-form").elements.existing.addEventListener("change",event=>{const row=book?.definition.visits.find(x=>x.id===event.target.value);if(row){const f=$("visit-form");f.elements.registrationId.value=row.registrationId;visitSessions();for(const key of ["sessionId","state","units","reason"])f.elements[key].value=row[key];for(const [field,key]of [["instructor","instructor"],["confirmedAt","at"],["method","method"],["reference","reference"]])f.elements[field].value=row.confirmation?.[key]??(field==="method"?"email":"")}});
$("reviews").addEventListener("change",async()=>{try{if($("reviews").value)await openBook($("reviews").value)}catch(e){status(e.message)}});
$("history").addEventListener("change",async()=>{try{await openBook(book.id,Number($("history").value))}catch(e){status(e.message)}});
$("refresh").addEventListener("click",()=>refresh().catch(e=>status(e.message)));
$("resume").addEventListener("click",()=>resume().catch(e=>status(e.message)));
$("discard").addEventListener("click",async()=>{if(!pending?.rejected)return;await saved(null);pending=null;await pendingState();status("Rejected operation discarded; saved history remains available.")});
$("adopt-source").addEventListener("click",async()=>{try{const newer=core.reviews.find(x=>x.id===book.definition.intake.id);const d=copy(book.definition);d.intake={id:newer.id,revision:newer.revision,derivedSha256:newer.derivedSha256};await commit(d,$("source-reason").value)}catch(e){status(e.message)}});
$("packet").addEventListener("change",async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>128*1024*1024)throw new Error("Handover exceeds 128 MiB");pending={kind:"receive",filename:file.name,file};await saved(pending);await pendingState();await resume()}catch(e){status(e.message)}});
$("export").addEventListener("click",async()=>{try{const file=await api("/api/attendance/export",{id:book.id,revision:book.revision});const response=await fetch(file.url);if(!response.ok)throw new Error("Complete handover download failed");const body=await response.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",body))].map(x=>x.toString(16).padStart(2,"0")).join("");if(body.byteLength!==file.bytes||hash!==file.sha256)throw new Error("Complete downloaded handover differs");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([body],{type:"application/zip"}));a.download=file.filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000);status("Complete handover downloaded: "+file.bytes+" bytes.")}catch(e){status(e.message)}});
refresh().catch(error=>status(error.message));
