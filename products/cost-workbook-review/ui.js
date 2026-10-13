(() => {
"use strict";
const root = document.getElementById("app");
const delivered = Boolean(window.DELIVERED_CASE);
let current = window.DELIVERED_CASE || null;
let cases = [], page = 0, filter = "", kind = "", openOnly = false, draft = null, busy = false;
const escape = value => String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const el = id => document.getElementById(id);
const pretty = value => escape(JSON.stringify(value, null, 2));
const key = () => "workbook-review-draft:" + current.id + ":" + current.report.sha256;
const statuses = {"acknowledge":"Acknowledged","needs-correction":"Correction requested","needs-information":"Information requested"};
function summary(state) {
  const decisions = {};
  for (const event of state.reviews) for (const item of event.decisions) decisions[item.id] = {...item,reviewer:event.reviewer,at:event.at,revision:event.revision};
  const acknowledged = Object.values(decisions).filter(x => x.action === "acknowledge").length;
  return {decisions,total:state.report.changes.length,acknowledged,unresolved:state.report.changes.length-acknowledged};
}
function saveDraft() {
  if (!current || !draft) return;
  try { localStorage.setItem(key(), JSON.stringify(draft)); } catch (_) { notify("Browser draft storage is unavailable. Save the review or download its decisions before closing.", true); }
}
function restoreDraft() {
  draft = {reviewer:"",decisions:{}};
  try { const data = JSON.parse(localStorage.getItem(key()) || "null"); if (data && typeof data.reviewer === "string" && data.decisions && typeof data.decisions === "object") draft = data; } catch (_) {}
}
function notify(message, bad=false) {
  const node = el("notice");
  if (node) { node.textContent = message; node.className = bad ? "notice error" : "notice"; node.hidden = false; }
}
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {cache:"no-store"} : {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) { const error=new Error(result.error || "The operation could not be completed."); error.httpStatus=response.status; throw error; }
  return result;
}
function download(name, value, type="application/json") {
  const blob = new Blob([typeof value === "string" ? value : JSON.stringify(value,null,2)+"\n"], {type});
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
async function readFile(file, max=20*1024*1024) {
  if (!file || file.size > max || !file.size) throw new Error("Choose a nonempty file within the displayed size limit.");
  const bytes = new Uint8Array(await file.arrayBuffer()); let binary="";
  for (let i=0;i<bytes.length;i+=16384) binary += String.fromCharCode(...bytes.subarray(i,i+16384));
  return {filename:file.name,base64:btoa(binary)};
}
function cellText(cell) {
  if (cell === null || cell === undefined) return '<span class="muted">Absent</span>';
  if (typeof cell !== "object" || !Object.prototype.hasOwnProperty.call(cell,"value")) return '<pre>'+pretty(cell)+'</pre>';
  const formula = cell.formula;
  let output = '<div class="value">'+escape(cell.value === null ? "No stored value" : cell.value)+'</div>';
  if (formula) {
    output += '<div class="muted">Stored formula result</div><code>'+escape(formula.text || (formula.sharedMaster ? "Shared from "+formula.sharedMaster.cell+": "+formula.sharedMaster.text : "Formula member"))+'</code>';
    output += '<details><summary>Formula definition</summary><pre>'+pretty(formula)+'</pre></details>';
  }
  output += '<div class="muted">Original type: '+escape(cell.type)+'</div>';
  if (cell.format) output += '<details><summary>Original cell formatting</summary><pre>'+pretty(cell.format)+'</pre></details>';
  return output;
}
function buttons() {
  const pre = delivered ? "originals/" : "/api/cases/"+current.id+"/original/";
  return '<a class="button" href="'+pre+(delivered?"before.xlsx":"before")+'" download>Earlier workbook</a>'+
    '<a class="button" href="'+pre+(delivered?"after.xlsx":"after")+'" download>Later workbook</a>'+
    (delivered ? '<a class="button" href="case.json" download>Complete saved review</a>' : '<a class="button" id="export" href="/api/cases/'+current.id+'/export">Download complete handover</a>');
}
function intake() {
  return '<section class="panel"><h2>Compare original workbooks</h2><p>Select the two Excel editions exactly as received. Each original stays intact in the handover.</p>'+
    '<form id="intake"><div class="grid"><label>Review title<input name="title" required maxlength="200"></label><label>Reporting period<input name="period" maxlength="200"></label>'+
    '<label>Earlier edition (.xlsx, up to 20 MiB)<input name="before" type="file" accept=".xlsx" required></label><label>Later edition (.xlsx, up to 20 MiB)<input name="after" type="file" accept=".xlsx" required></label>'+
    '<label>Currency or reporting units<input name="currency" maxlength="40"></label><label>Selected donor method or policy<textarea name="methodology" maxlength="4000" placeholder="Record the exact grant/contract method and dated guidance used for this review."></textarea></label></div>'+
    '<details><summary>Named totals, allocation notes and review fields</summary><p>Reference actual stored cells from the selected workbooks. Use the worksheet’s exact name and a cell such as B12. A field can exist in one edition only.</p><div id="focus-fields"></div><button type="button" id="add-focus">Add review field</button></details>'+
    '<button type="submit" id="create">Create comparison</button></form></section>';
}
function render() {
  root.innerHTML = '<header><div><p class="eyebrow">Cost workbook review</p><h1>Review the original editions</h1><p>Workbook changes, named decisions and a complete handover.</p></div>'+
    (!delivered?'<button id="new-case">New comparison</button>':'<span class="badge">Saved handover</span>')+'</header><p id="notice" class="notice" role="status" aria-live="polite" hidden></p>'+
    (!delivered?'<nav><label>Saved comparison<select id="cases"><option value="">Choose a saved comparison</option>'+cases.map(x=>'<option value="'+x.id+'"'+(current&&current.id===x.id?' selected':'')+'>'+escape(x.title)+' · revision '+x.revision+'</option>').join("")+'</select></label><button id="reload">Reload saved state</button></nav>':'')+
    (!current?intake()+(!delivered?'<section class="panel"><h2>Receive a complete handover</h2><p>Use this packet’s included source, choose a separate workspace and receive its full ZIP. All original files and decisions are compared before adoption.</p><input id="receive-file" type="file" accept=".zip"><button id="receive">Receive handover</button></section>':''):reviewMarkup());
  bind();
  if (current) renderChanges();
}
function reviewMarkup() {
  const s=summary(current), r=current.report;
  return '<section class="panel"><h2>'+escape(current.title)+'</h2><div class="metrics"><span>Revision <strong>'+current.revision+'</strong></span><span>Changes <strong>'+s.total+'</strong></span><span>Unresolved <strong>'+s.unresolved+'</strong></span><span>Acknowledged <strong>'+s.acknowledged+'</strong></span></div>'+
    '<p>'+escape(r.mapping.period)+(r.mapping.currency?' · '+escape(r.mapping.currency):'')+'</p><p class="wrap">'+escape(r.mapping.methodology||"No donor method was entered for this comparison.")+'</p>'+
    '<p class="note">Values below are the values stored in the original files. Formulas, shared formula definitions and original formats are retained. Recalculate in the original spreadsheet application when a fresh computed result is needed, then receive that new edition.</p>'+
    '<div class="actions">'+buttons()+'</div><details><summary>Original file identities</summary><pre>'+pretty({before:r.before,after:r.after,comparison:r.sha256})+'</pre></details></section>'+
    (r.focus.length?'<section class="panel"><h2>Named review fields</h2><div class="table-wrap"><table><thead><tr><th>Field and category</th><th>Earlier edition</th><th>Later edition</th></tr></thead><tbody>'+r.focus.map(f=>'<tr><td><strong>'+escape(f.label)+'</strong><p>'+escape(f.category)+'</p><p>'+escape(f.rationale)+'</p></td><td><p>'+escape(f.before?f.before.sheet+"!"+f.before.cell:"Absent")+'</p>'+cellText(f.beforeValue)+'</td><td><p>'+escape(f.after?f.after.sheet+"!"+f.after.cell:"Absent")+'</p>'+cellText(f.afterValue)+'</td></tr>').join("")+'</tbody></table></div></section>':'')+
    '<section class="panel"><h2>Review changes</h2><div class="filters"><label>Find worksheet, cell or text<input id="filter" value="'+escape(filter)+'"></label><label>Change type<select id="kind"><option value="">All changes</option>'+["cell","formula","sheet","sheet-controls","workbook-controls","package-part"].map(k=>'<option'+(k===kind?' selected':'')+'>'+k+'</option>').join("")+'</select></label><label class="check"><input id="open-only" type="checkbox"'+(openOnly?' checked':'')+'>Unresolved only</label></div>'+
    '<div class="review-controls"><label>Reviewer’s name<input id="reviewer" maxlength="200" value="'+escape(draft.reviewer)+'" required></label><label>Action for selected changes<select id="bulk-action"><option value="acknowledge">Acknowledge</option><option value="needs-correction">Request correction</option><option value="needs-information">Request information</option></select></label><label>Explanation for selected changes<textarea id="bulk-note" maxlength="4000"></textarea></label><button id="apply-selected">Apply to selected rows</button></div>'+
    '<div class="actions"><button id="save">'+(delivered?"Download decisions for receiving":"Save named review")+'</button><button id="download-decisions">Download decision file</button><span id="draft-count"></span></div><div id="changes"></div></section>'+
    (!delivered?'<section class="panel"><h2>Inspect the original stored cells</h2><div class="actions"><select id="inspect-side"><option value="before">Earlier edition</option><option value="after">Later edition</option></select><select id="inspect-sheet"></select><button id="inspect">Open stored cells</button></div><div id="cells"></div></section>':'')+
    '<section class="panel"><h2>Saved decision history</h2>'+(current.reviews.length?current.reviews.slice().reverse().map(e=>'<details><summary>Revision '+e.revision+' · '+escape(e.reviewer)+' · '+escape(e.at)+' · '+e.decisions.length+' decisions</summary><ul>'+e.decisions.map(d=>'<li>'+escape(statuses[d.action])+' · '+escape((r.changes.find(c=>c.id===d.id)||{}).sheet||"Workbook")+' '+escape((r.changes.find(c=>c.id===d.id)||{}).cell||"")+'<p>'+escape(d.note)+'</p></li>').join("")+'</ul></details>').join(""):'<p>No saved review decisions yet.</p>')+'</section>';
}
function matchingChanges() {
  const s=summary(current); const search=filter.toLowerCase();
  return current.report.changes.filter(c=>(!kind||c.kind===kind)&&(!openOnly||!s.decisions[c.id]||s.decisions[c.id].action!=="acknowledge")&&(!search||JSON.stringify(c).toLowerCase().includes(search)));
}
function renderChanges() {
  const records=matchingChanges(), pages=Math.max(1,Math.ceil(records.length/50)), saved=summary(current).decisions;
  page=Math.max(0,Math.min(page,pages-1));
  el("draft-count").textContent=Object.keys(draft.decisions).length+" unsaved decisions";
  el("changes").innerHTML='<div class="actions"><button id="prev"'+(!page?' disabled':'')+'>Previous</button><span>Page '+(page+1)+' of '+pages+' · '+records.length+' matching changes</span><button id="next"'+(page+1===pages?' disabled':'')+'>Next</button></div>'+
    '<div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="select-page" aria-label="Select this page"></th><th>Original location</th><th>Earlier edition</th><th>Later edition</th><th>Decision</th></tr></thead><tbody>'+
    records.slice(page*50,page*50+50).map(c=>{
      const entry=draft.decisions[c.id]||saved[c.id]||{}, local=Boolean(draft.decisions[c.id]);
      return '<tr data-id="'+c.id+'"><td><input class="choose" type="checkbox" aria-label="Select '+escape(c.sheet+" "+c.cell)+'"></td><td><strong>'+escape(c.sheet||"Workbook package")+'</strong><p>'+escape(c.cell)+'</p><span class="badge">'+escape(c.kind)+'</span></td><td>'+cellText(c.before)+'</td><td>'+cellText(c.after)+'</td><td><label>Action<select class="decision"><option value="">'+(saved[c.id]?"Keep saved decision":"Choose action")+'</option>'+Object.entries(statuses).map(([k,v])=>'<option value="'+k+'"'+(entry.action===k?' selected':'')+'>'+v+'</option>').join("")+'</select></label><label>Cost category<input class="category" maxlength="200" value="'+escape(entry.category||"")+'"></label><label>Explanation<textarea class="note" maxlength="4000">'+escape(entry.note||"")+'</textarea></label><small>'+escape(local?"Unsaved edit":entry.reviewer?"Saved by "+entry.reviewer:"Not reviewed")+'</small></td></tr>';
    }).join("")+'</tbody></table></div>';
  el("prev").onclick=()=>{page--;renderChanges();}; el("next").onclick=()=>{page++;renderChanges();};
  el("select-page").onchange=e=>root.querySelectorAll(".choose").forEach(n=>n.checked=e.target.checked);
  root.querySelectorAll("tr[data-id]").forEach(row=>{
    const update=()=>{
      const action=row.querySelector(".decision").value;
      if(action) draft.decisions[row.dataset.id]={id:row.dataset.id,action,note:row.querySelector(".note").value,category:row.querySelector(".category").value};
      else delete draft.decisions[row.dataset.id];
      saveDraft(); el("draft-count").textContent=Object.keys(draft.decisions).length+" unsaved decisions";
    };
    row.querySelectorAll("select,input:not(.choose),textarea").forEach(n=>n.addEventListener("change",update));
  });
}
function request() {
  const decisions=Object.values(draft.decisions);
  if(!draft.reviewer.trim()) throw new Error("Enter the reviewer’s name.");
  if(!decisions.length) throw new Error("Choose at least one change and its review action.");
  if(decisions.length>5000) throw new Error("Save at most 5,000 decisions together.");
  const lookup=new Map(current.report.changes.map(c=>[c.id,c]));
  for(const d of decisions) if(!d.note.trim()&&(d.action!=="acknowledge"||!["cell","package-part"].includes(lookup.get(d.id)?.kind))) throw new Error("Explain each formula, structural or unresolved decision.");
  return {requestId:crypto.randomUUID?crypto.randomUUID():"review-"+Date.now()+"-"+Math.random().toString(16).slice(2),expectedRevision:current.revision,reportSha256:current.report.sha256,reviewer:draft.reviewer,decisions};
}
async function save() {
  try {
    const body=draft.pendingRequest || request();
    if(delivered){download("Workbook_Review_Decisions.json",body);notify("Decision file downloaded. Receive it through the included CLI to append these named decisions.");return;}
    draft.pendingRequest=body; saveDraft(); busy=true; el("save").disabled=true; const result=await api("/api/cases/"+current.id+"/review",body);
    current=result.case; for(const item of body.decisions) if(JSON.stringify(draft.decisions[item.id])===JSON.stringify(item)) delete draft.decisions[item.id]; delete draft.pendingRequest; saveDraft(); cases= (await api("/api/cases")).cases; render(); notify("Saved revision "+result.acceptedRevision+". The full handover now includes these decisions.");
  }catch(e){if(e.httpStatus===400){delete draft.pendingRequest;saveDraft();}notify(e.message,true);}finally{busy=false;if(el("save"))el("save").disabled=false;}
}
function focusRow() {
  const div=document.createElement("fieldset"); div.className="focus-row";
  div.innerHTML='<legend>Named review field</legend><div class="grid">'+
    '<label>Label<input data-field="label" required maxlength="200"></label><label>Cost category<input data-field="category" maxlength="100"></label>'+
    '<label>Earlier worksheet<input data-field="before-sheet"></label><label>Earlier cell<input data-field="before-cell" placeholder="B12"></label>'+
    '<label>Later worksheet<input data-field="after-sheet"></label><label>Later cell<input data-field="after-cell" placeholder="B12"></label>'+
    '<label>Allocation or review rationale<textarea data-field="rationale" maxlength="2000"></textarea></label></div><button type="button" class="remove-field">Remove field</button>';
  div.querySelector(".remove-field").onclick=()=>div.remove(); el("focus-fields").append(div);
}
function refreshInspectSheets() {
  const side=el("inspect-side").value;
  el("inspect-sheet").innerHTML=current.report.sheetPairs.filter(p=>p[side]).map(p=>'<option>'+escape(p[side])+'</option>').join("");
}
async function inspect(start=0) {
  try{
    const side=el("inspect-side").value,sheet=el("inspect-sheet").value;
    const r=await api("/api/cases/"+current.id+"/cells?side="+side+"&sheet="+encodeURIComponent(sheet)+"&start="+start);
    el("cells").innerHTML='<p>'+r.total+' stored cells · showing '+(r.cells.length?start+1:0)+'–'+(start+r.cells.length)+'</p><div class="table-wrap"><table><thead><tr><th>Cell</th><th>Original stored value and formula</th></tr></thead><tbody>'+r.cells.map(c=>'<tr><td>'+escape(c.cell)+'</td><td>'+cellText(c)+'</td></tr>').join("")+'</tbody></table></div><div class="actions">'+(start?'<button id="cells-prev">Previous cells</button>':'')+(r.next!==null?'<button id="cells-next">Next cells</button>':'')+'</div>';
    if(el("cells-prev"))el("cells-prev").onclick=()=>inspect(Math.max(0,start-250));
    if(el("cells-next"))el("cells-next").onclick=()=>inspect(r.next);
  }catch(e){notify(e.message,true);}
}
function bind() {
  if(!delivered){
    el("new-case").onclick=()=>{if(busy)return;current=null;render();};
    el("cases").onchange=async e=>{if(busy||!e.target.value)return;try{current=await api("/api/cases/"+e.target.value);restoreDraft();page=0;render();}catch(x){notify(x.message,true);}};
    el("reload").onclick=async()=>{if(busy)return;try{cases=(await api("/api/cases")).cases;if(current){current=await api("/api/cases/"+current.id);if(draft.pendingRequest&&current.requests[draft.pendingRequest.requestId]){for(const item of draft.pendingRequest.decisions)if(JSON.stringify(draft.decisions[item.id])===JSON.stringify(item))delete draft.decisions[item.id];delete draft.pendingRequest;saveDraft();}}render();notify("Saved state reloaded. Unsaved local decisions remain available.");}catch(e){notify(e.message,true);}};
  }
  if(!current){
    el("add-focus").onclick=focusRow;
    el("intake").onsubmit=async event=>{
      event.preventDefault();if(busy)return;
      try{
        busy=true;el("create").disabled=true;notify("Reading complete original workbooks…");
        const form=event.target, a=await readFile(form.elements.before.files[0]), b=await readFile(form.elements.after.files[0]);
        const mapping={methodology:form.elements.methodology.value,period:form.elements.period.value,currency:form.elements.currency.value,focus:[]};
        root.querySelectorAll(".focus-row").forEach((row,index)=>{
          const field=name=>row.querySelector('[data-field="'+name+'"]').value.trim();
          const before=field("before-sheet")||field("before-cell")?{sheet:field("before-sheet"),cell:field("before-cell").toUpperCase()}:null;
          const after=field("after-sheet")||field("after-cell")?{sheet:field("after-sheet"),cell:field("after-cell").toUpperCase()}:null;
          mapping.focus.push({id:"field-"+(index+1),label:field("label"),category:field("category"),rationale:field("rationale"),before,after});
        });
        current=await api("/api/cases",{title:form.elements.title.value,before:a,after:b,mapping});
        cases=(await api("/api/cases")).cases;restoreDraft();page=0;render();notify("Both originals received. Every worksheet and package part is retained.");
      }catch(e){notify(e.message,true);}finally{busy=false;if(el("create"))el("create").disabled=false;}
    };
    if(el("receive"))el("receive").onclick=async()=>{
      try{busy=true;el("receive").disabled=true;const f=await readFile(el("receive-file").files[0],45*1024*1024);const r=await api("/api/receive",{base64:f.base64});cases=(await api("/api/cases")).cases;current=await api("/api/cases/"+r.caseId);restoreDraft();render();notify("Original files, comparison and complete named history independently received.");}catch(e){notify(e.message,true);}finally{busy=false;if(el("receive"))el("receive").disabled=false;}
    };
    return;
  }
  el("filter").oninput=e=>{filter=e.target.value;page=0;renderChanges();};
  el("kind").onchange=e=>{kind=e.target.value;page=0;renderChanges();};
  el("open-only").onchange=e=>{openOnly=e.target.checked;page=0;renderChanges();};
  el("reviewer").oninput=e=>{draft.reviewer=e.target.value;saveDraft();};
  el("apply-selected").onclick=()=>{
    const action=el("bulk-action").value,note=el("bulk-note").value;let count=0;
    root.querySelectorAll("tr[data-id]").forEach(row=>{if(row.querySelector(".choose").checked){const id=row.dataset.id;draft.decisions[id]={id,action,note,category:row.querySelector(".category").value};count++;}});
    saveDraft();renderChanges();notify(count+" selected changes added to the unsaved review.");
  };
  el("save").onclick=save;
  el("download-decisions").onclick=()=>{try{download("Workbook_Review_Decisions.json",request());notify("Complete decision request downloaded.");}catch(e){notify(e.message,true);}};
  if(!delivered){refreshInspectSheets();el("inspect-side").onchange=refreshInspectSheets;el("inspect").onclick=()=>inspect();}
}
(async()=>{
  try{
    if(delivered){restoreDraft();render();}
    else{cases=(await api("/api/cases")).cases;render();}
  }catch(e){root.innerHTML='<h1>Workbook review could not open</h1><p>'+escape(e.message)+'</p><button id="initial-retry">Retry</button>'; el('initial-retry').onclick=()=>location.reload();}
})();
})();