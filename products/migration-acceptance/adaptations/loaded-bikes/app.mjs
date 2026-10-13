import {defaultReview,sourceTables,prepareCatalogue,TYPES} from "./catalogue.mjs";
import {parseExactJSON} from "../../workbench/vendor/dlt/vendor/sling/vendor/stellar-expert/exact-json.mjs";
import {sourceIssues} from "./acceptance.mjs";
import {newProject,validateProject,setCorrection,removeCorrection,setIssueDecision,mappingChange,revise,correctionIdentity,csvText,downloadBytes,zipStore} from "./review-state.mjs";
const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
const escape=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const safeURL=value=>{const url=new URL(value);if(!["https:","http:"].includes(url.protocol))throw Error("Source links must use HTTP or HTTPS");return url.href;};
const json=value=>JSON.stringify(value,null,2),clone=value=>JSON.parse(JSON.stringify(value));
const text=value=>value===null?"NULL":value===undefined?"—":typeof value==="object"?JSON.stringify(value):String(value);
const STORAGE="tjlabs.loaded-bikes.project.v1",enc=new TextEncoder();
let mutationBusy=false,exportBusy=false,installGeneration=0,openSequence=0;
const sourceFields=new Map();
let project=null,tables=[],prepared=null,issues=[],tab="overview",selectedTable="products",page=0,query="",relationQuery="",relationPage=0,editing=null;
function status(message,error=false){$("#status").textContent=message;$("#status").classList.toggle("error",error);}
function safe(action){return async event=>{try{await action(event);}catch(error){status(error.message||String(error),true);}};}
function sourceTable(){return tables.find(table=>table.name===selectedTable)||tables[0];}
function sourceKey(table,row){return Object.fromEntries(table.primaryKey.map(name=>[name,row[name]]));}
function activeCorrection(table,row,column){const identity=correctionIdentity({table:table.name,sourceKey:sourceKey(table,row),column});return project.review.corrections.find(item=>correctionIdentity(item)===identity);}
function valueAt(table,row,column){const correction=activeCorrection(table,row,column);return correction?correction.value:row[column];}
async function derive(candidate){
  const next=validateProject(candidate);
  const source=await sourceTables(next.capture);
  const output=await prepareCatalogue({capture:next.capture,review:next.review});
  const findings=await sourceIssues(next.capture,next.claims);
  if(!Array.isArray(source)||!source.length)throw Error("The catalogue adapter returned no source tables");
  return {next,source,output,findings:Array.isArray(findings)?findings:findings.issues};
}
async function install(candidate,{save=true,expected=null}={}){
  const generation=++installGeneration;const result=await derive(candidate);if(generation!==installGeneration)throw Error("A newer project selection superseded this pending revision.");if(expected&&(project?.id!==expected.id||project?.revision!==expected.revision))throw Error("The project changed while this revision was being prepared. Your current edition is preserved; reopen the review and apply the intended change.");project=result.next;tables=result.source;prepared=result.output;issues=result.findings||[];
  if(!tables.some(table=>table.name===selectedTable))selectedTable=tables[0].name;
  let saved=true;if(save){try{localStorage.setItem(STORAGE,json(project));}catch{saved=false;}}
  $("#save").disabled=false;$("#package").disabled=false;render();
  status(saved?"Project ready · Revision "+project.revision+" · "+tables.reduce((n,t)=>n+t.rows.length,0)+" source rows retained.":"Project ready. Browser storage is unavailable; use Save project to retain your changes.");
}
async function commit(candidate){
  if(mutationBusy)throw Error("A review revision is being saved. Wait for that result before applying another change.");
  mutationBusy=true;const expected={id:project.id,revision:project.revision};
  try{return await install(candidate,{expected});}finally{mutationBusy=false;}
}
function tableSelect(){return '<label>Source table<select id="table-select">'+tables.map(t=>'<option value="'+escape(t.name)+'" '+(t.name===selectedTable?"selected":"")+'>'+escape(t.name)+" ("+t.rows.length+")</option>").join("")+"</select></label>";}
function bindTableSelect(){const select=$("#table-select");if(select)select.onchange=()=>{selectedTable=select.value;page=0;query="";render();};}
function downloadJSON(name,value){downloadBytes(name,json(value)+"\n","application/json");}
function render(){
  if(!project)return;$("#project-label").textContent=project.title+" · Revision "+project.revision+" · "+project.id;
  $$("#nav button").forEach(button=>{if(button.dataset.tab===tab)button.setAttribute("aria-current","page");else button.removeAttribute("aria-current");});
  ({overview:renderOverview,catalogue:renderCatalogue,relations:renderRelations,mapping:renderMapping,issues:renderIssues,sources:renderSources,history:renderHistory}[tab])();
}

function allResponses(edition=project){return [...edition.capture.responses,...(edition.claims?.original_response_additions||[])];}
async function initialClaims(){const response=await fetch("./source-claims.json");return response.ok?await response.json():null;}
function renderRelations(){
 const claims=project.claims?.claims||[],inventory=project.claims?.inventory||[];
 const names=new Map(tables.filter(t=>["products","variants"].includes(t.name)).flatMap(t=>t.rows.map(row=>[row.product_id||row.variant_id,row.name])));
 const rows=claims.filter(claim=>!relationQuery||JSON.stringify(claim).toLowerCase().includes(relationQuery.toLowerCase())||(names.get(String(claim.subject_id))||"").toLowerCase().includes(relationQuery.toLowerCase()));
 const pages=Math.max(1,Math.ceil(rows.length/30));relationPage=Math.min(relationPage,pages-1);
 $("#main").innerHTML='<h2>Published relationships</h2><p>Inspect every published variant, compatibility and kit-content claim with its exact source reference. Conditional claims retain their condition and unresolved component references remain visible.</p><div class="toolbar"><label>Search the complete relationship inventory<input id="relation-search" type="search" value="'+escape(relationQuery)+'" placeholder="Product, SKU, relationship or source wording"></label><button id="relations-download" '+(project.claims?"":"disabled")+'>Download complete source inventory</button></div><div class="table-wrap"><table><thead><tr><th>Original product</th><th>Published relation</th><th>Target / condition</th><th>Source record</th></tr></thead><tbody>'+rows.slice(relationPage*30,(relationPage+1)*30).map(claim=>'<tr><td><strong>'+escape(claim.subject_id)+'</strong><br>'+escape(names.get(String(claim.subject_id))||"")+'</td><td>'+escape(claim.relation_kind)+'<br><span class="badge">'+escape(claim.certainty)+'</span></td><td><pre>'+escape(json(claim.target))+'</pre></td><td><details><summary>'+escape(claim.claim_id)+' · '+(claim.evidence?.length||0)+' references</summary><pre>'+escape(json(claim))+'</pre></details></td></tr>').join("")+'</tbody></table></div><div class="pager"><button id="relation-prev" '+(relationPage===0?"disabled":"")+'>Previous</button><span>'+rows.length+' matching relationships · Page '+(relationPage+1)+' of '+pages+'</span><button id="relation-next" '+(relationPage===pages-1?"disabled":"")+'>Next</button></div>'+(claims.length?"":'<div class="empty">Open the complete source-claims JSON to add the original relationship inventory to this project. The catalogue remains available.</div>');
 $("#relation-search").oninput=event=>{const caret=event.target.selectionStart;relationQuery=event.target.value;relationPage=0;renderRelations();$("#relation-search").focus();$("#relation-search").setSelectionRange(caret,caret);};
 $("#relation-prev").onclick=()=>{relationPage--;renderRelations();};$("#relation-next").onclick=()=>{relationPage++;renderRelations();};
 $("#relations-download").onclick=()=>downloadJSON("loaded-bikes-source-claims.json",project.claims);
}

function renderOverview(){
  const product=tables.find(t=>t.name==="products"),variant=tables.find(t=>t.name==="variants"),open=issues.filter(issue=>!project.issueDecisions.some(d=>d.issueId===issue.id&&d.disposition!=="open")).length;
  $("#main").innerHTML='<h2>Catalogue migration review</h2><p>Prepare the complete fork-mount, adaptor, rail and fixing family for a selected destination. Every change keeps the original source value and its review history.</p><div class="metrics">'+[
    [product?.rows.length??0,"Parent products"],[variant?.rows.length??0,"Complete variants"],[allResponses().length,"Original responses"],[open,"Open source questions"]
  ].map(([n,label])=>'<div class="metric"><strong class="number">'+n+'</strong><span>'+label+"</span></div>").join("")+'</div><div class="columns"><section class="panel"><h3>Working sequence</h3><ol class="flow"><li>Inspect the catalogue and source-linked questions.</li><li>Select destination table names, column names, types and keys.</li><li>Record reviewed corrections with the original value and a reason.</li><li>Export the complete editable project and native intake package.</li><li>Load, reconcile and accept in the original migration workbench.</li></ol><button data-go="catalogue">Open full catalogue</button></section><section class="panel"><h3>Current edition</h3><p><strong>'+escape(project.title)+'</strong></p><p>'+escape(project.capture.scope?.family||"Complete retained public catalogue")+'</p><p class="small">Source retrieval: '+escape(project.capture.scope?.retrieved_date||"Retained in source records")+'<br>Active corrections: '+project.review.corrections.length+'<br>Review decisions: '+project.issueDecisions.length+'</p><button data-go="issues">Review source questions</button></section></div><section class="panel"><h3>Destination preparation</h3><p>The initial mapping preserves the original catalogue fields and source IDs. Enter the chosen system’s table and column contract in Destination mapping. Product and variant identities remain source keys throughout.</p><p class="muted small">This public catalogue contains retail availability and published kit descriptions. Internal quantities, manufacturing bills of material, suppliers and ERP identifiers require their own source records.</p><button data-go="mapping">Edit destination mapping</button></section>';
  $$("[data-go]").forEach(button=>button.onclick=()=>{tab=button.dataset.go;render();});
}
function renderCatalogue(){
  const table=sourceTable(),columns=table.columns.map(c=>typeof c==="string"?c:c.name);
  const matches=table.rows.map((row,index)=>({row,index})).filter(({row})=>!query||columns.some(name=>text(valueAt(table,row,name)).toLowerCase().includes(query.toLowerCase())));
  const pages=Math.max(1,Math.ceil(matches.length/40));page=Math.min(page,pages-1);const current=matches.slice(page*40,(page+1)*40);
  $("#main").innerHTML='<h2>Catalogue & corrections</h2><p>Search every field. Select a cell to view its complete value and record a correction. Source keys remain unchanged.</p><div class="toolbar">'+tableSelect()+'<label>Search all fields<input id="search" type="search" value="'+escape(query)+'" placeholder="Product, option, SKU or source value"></label><button id="export-table">Download complete reviewed CSV</button></div><div class="table-wrap"><table><thead><tr>'+columns.map(name=>'<th scope="col">'+escape(name)+(table.primaryKey.includes(name)?" · key":"")+"</th>").join("")+"</tr></thead><tbody>"+current.map(({row,index})=>"<tr>"+columns.map(name=>{const value=valueAt(table,row,name),display=text(value),edited=activeCorrection(table,row,name);return '<td><button class="cell '+(edited?"edited":"")+'" data-row="'+index+'" data-column="'+escape(name)+'" title="Open complete cell">'+escape(display.length>180?display.slice(0,180)+"…":display)+"</button></td>";}).join("")+"</tr>").join("")+'</tbody></table></div><div class="pager"><button id="previous" '+(page===0?"disabled":"")+'>Previous</button><span>'+matches.length+" matching rows · Page "+(page+1)+" of "+pages+'</span><button id="next" '+(page===pages-1?"disabled":"")+'>Next</button></div>'+(matches.length?"":'<div class="empty">No matching source rows. Clear the search to restore the complete table.</div>')+'<p class="small muted">CSV imports: keep source IDs, SKUs, option labels and postal-style codes as text. JSON project and typed native expected tables retain nulls and exact types.</p>';
  bindTableSelect();$("#search").oninput=event=>{const start=event.target.selectionStart;query=event.target.value;page=0;renderCatalogue();$("#search").focus();$("#search").setSelectionRange(start,start);};
  $("#previous").onclick=()=>{page--;renderCatalogue();};$("#next").onclick=()=>{page++;renderCatalogue();};
  $$("[data-row]").forEach(button=>button.onclick=()=>openCell(table,table.rows[Number(button.dataset.row)],button.dataset.column));
  $("#export-table").onclick=safe(()=>{const mapping=project.review.tables.find(t=>t.sourceTable===table.name);const output=prepared.tables.find(t=>(t.name||t.tableName)===mapping.tableName||(t.sourceTable===table.name));if(!output)throw Error("Prepared destination table is unavailable");downloadBytes(mapping.tableName+".csv",csvText(output),"text/csv;charset=utf-8");status("Downloaded all "+output.rows.length+" reviewed rows from "+mapping.tableName+".");});
}
function reviewFields(){return '<label>Reviewer<input name="reviewer" required autocomplete="name" value="'+escape(sessionStorage.getItem("loaded-bikes-reviewer")||"")+'"></label><label class="wide">Reason<textarea name="reason" required placeholder="Explain the decision and its source"></textarea></label>';}
function openCell(table,row,column){
  editing={kind:"cell",table,row,column};const original=row[column],current=valueAt(table,row,column),locked=table.primaryKey.includes(column)||column.endsWith("_id");
  $("#editor-title").textContent=table.name+" · "+column;$("#restore").hidden=!activeCorrection(table,row,column);
  $("#editor-fields").innerHTML='<p class="row-key">Original key: '+escape(JSON.stringify(sourceKey(table,row)))+'</p><div class="detail-grid"><label>Original source value<textarea readonly>'+escape(text(original))+'</textarea></label><label>Current reviewed value<textarea readonly>'+escape(text(current))+'</textarea></label>'+(locked?'<p class="wide notice">This field identifies the original source row. Keep it unchanged and add destination identity through the selected mapping.</p>':'<label class="wide">New value (JSON literal)<textarea name="value" required>'+escape(JSON.stringify(current))+'</textarea><span class="muted small">Use quoted text, an integer, true/false, or null. Exact BIGINT and decimal values must be quoted numeric strings.</span></label>'+reviewFields())+'</div>';
  $("#editor-form button[type=submit]").hidden=locked;$("#editor").showModal();
}
function renderMapping(){
  const table=sourceTable(),mapping=project.review.tables.find(t=>t.sourceTable===table.name);
  $("#main").innerHTML='<h2>Destination mapping</h2><p>Match the chosen destination’s names and types. The complete source remains retained, including fields whose destination names change.</p><div class="toolbar">'+tableSelect()+'</div><form id="mapping-form"><section class="panel"><label>Destination table<input name="tableName" value="'+escape(mapping.tableName)+'" required pattern="[a-z][a-z0-9_]{0,62}"></label></section><div class="table-wrap"><table class="mapping-table"><thead><tr><th>Original field</th><th>Destination column</th><th>Type</th><th>Decimal precision / scale</th><th>Nullable</th><th>Key</th></tr></thead><tbody>'+mapping.columns.map((column,i)=>'<tr data-mapping-index="'+i+'"><td><code>'+escape(column.source)+'</code></td><td><input name="column-'+i+'" value="'+escape(column.name)+'" required pattern="[a-z_][a-z0-9_]*" aria-label="'+escape(column.source)+' destination name"></td><td><select name="type-'+i+'" aria-label="'+escape(column.source)+' type">'+TYPES.map(type=>'<option '+(type===column.data_type?"selected":"")+'>'+type+"</option>").join("")+'</select></td><td><input name="precision-'+i+'" type="number" min="1" max="38" value="'+(column.precision??38)+'" aria-label="'+escape(column.source)+' precision"><input name="scale-'+i+'" type="number" min="0" max="38" value="'+(column.scale??0)+'" aria-label="'+escape(column.source)+' scale"></td><td><input type="checkbox" name="nullable-'+i+'" '+(column.nullable?"checked":"")+' aria-label="'+escape(column.source)+' nullable"></td><td><input type="checkbox" name="key-'+i+'" '+(mapping.primaryKey.includes(column.name)?"checked":"")+' aria-label="'+escape(column.source)+' primary key"></td></tr>').join("")+'</tbody></table></div><section class="panel"><div class="detail-grid">'+reviewFields()+'</div><div class="actions" style="margin-top:1rem"><button type="submit">Save mapping revision</button></div></section></form><p class="small muted">The native engine validates the complete plan after intake. Invalid coercions, duplicate keys and missing relationships remain visible during preparation and reconciliation.</p>';
  bindTableSelect();$("#mapping-form").onsubmit=safe(async event=>{event.preventDefault();const form=new FormData(event.target),next=clone(mapping);next.tableName=form.get("tableName").trim();next.primaryKey=[];
    next.columns=next.columns.map((column,i)=>{const item={...column,name:form.get("column-"+i).trim(),data_type:form.get("type-"+i),nullable:form.has("nullable-"+i)};if(item.data_type==="decimal"){item.precision=Number(form.get("precision-"+i));item.scale=Number(form.get("scale-"+i));}else{delete item.precision;delete item.scale;}if(form.has("key-"+i))next.primaryKey.push(item.name);return item;});
    const reviewer=form.get("reviewer"),reason=form.get("reason");await commit(mappingChange(project,table.name,next,{reviewer,reason}));sessionStorage.setItem("loaded-bikes-reviewer",reviewer);status("Saved destination mapping for "+table.name+".");
  });
}

function openEvidence(ref){
  const path=ref.responsePath||ref.response_path,sha=ref.sha256||ref.response_sha256,pointer=ref.pointer??ref.json_pointer??"";
  const response=allResponses().find(r=>(path?r.path===path:r.id===ref.responseId)&&(!sha||r.sha256===sha));
  if(!response)throw Error("The original evidence response is not retained");
  const key=response.sha256;let body=sourceFields.get(key);
  if(!body){body=parseExactJSON(new TextDecoder("utf-8",{fatal:true}).decode(decodeBase64(response.content_base64)));sourceFields.set(key,body);}
  let value=body;
  for(const token of pointer.split("/").slice(1)){
    const part=token.replaceAll("~1","/").replaceAll("~0","~");
    if(value===null||typeof value!=="object"||!Object.hasOwn(value,part))throw Error("The original source pointer is unavailable");
    value=value[part];
  }
  editing={kind:"evidence"};$("#editor-title").textContent="Original source field";$("#restore").hidden=true;$("#editor-form button[type=submit]").hidden=true;
  $("#editor-fields").innerHTML='<p class="row-key">'+escape(response.path)+" · "+escape(pointer||"/")+'</p><pre>'+escape(typeof value==="string"?value:json(value))+'</pre><p class="small">Original response: '+response.bytes+' bytes</p><p class="row-key">'+escape(response.sha256)+'</p><a href="'+escape(safeURL(response.url))+'" target="_blank" rel="noopener noreferrer">Published endpoint</a>';
  $("#editor").showModal();
}

function renderIssues(){
  $("#main").innerHTML='<h2>Business review</h2><p>Resolve catalogue interpretation with the original evidence visible. These decisions accompany the intake; measured native parity and acceptance remain in the migration workbench.</p>'+issues.map((issue,index)=>{const decision=project.issueDecisions.find(d=>d.issueId===issue.id);return '<section class="panel issue"><div><span class="badge">'+escape(decision?.disposition||"open")+'</span><h3>'+escape(issue.title||issue.id)+'</h3><p>'+escape(issue.detail||issue.description||issue.message||"")+'</p>'+(issue.sourceRefs||[]).map((ref,ri)=>'<p class="small row-key"><button data-evidence-issue="'+index+'" data-evidence-ref="'+ri+'">Open '+escape(ref.responseId||ref.response||"")+" · "+escape(ref.pointer||"/")+"</button></p>").join("")+(decision?'<p class="small"><strong>'+escape(decision.reviewer)+'</strong>: '+escape(decision.reason)+"</p>":"")+'</div><button data-issue="'+index+'">Record decision</button></section>';}).join("")+(issues.length?"":'<div class="empty">No source questions are recorded for this catalogue.</div>');
  $("[data-evidence-issue]").forEach(button=>button.onclick=safe(()=>openEvidence(issues[Number(button.dataset.evidenceIssue)].sourceRefs[Number(button.dataset.evidenceRef)])));
  $("[data-issue]").forEach(button=>button.onclick=()=>{const issue=issues[Number(button.dataset.issue)];editing={kind:"issue",issue};$("#editor-title").textContent=issue.title||issue.id;$("#restore").hidden=true;$("#editor-form button[type=submit]").hidden=false;$("#editor-fields").innerHTML='<p>'+escape(issue.detail||issue.description||issue.message||"")+'</p><div class="detail-grid"><label class="wide">Decision<select name="disposition"><option value="open">Keep open</option><option value="keep-source">Keep the published source value</option><option value="resolved-by-correction">Resolved by recorded correction</option><option value="needs-customer-input">Requires a customer source record or target choice</option></select></label>'+reviewFields()+'</div>';$("#editor").showModal();});
}
function decodeBase64(input){return Uint8Array.from(atob(input),ch=>ch.charCodeAt(0));}
function renderSources(){
  $("#main").innerHTML='<h2>Original source records</h2><p>Every original response is retained in the project. Download the unmodified bytes or open its published endpoint.</p><section class="panel"><ul class="source-list">'+allResponses().map((response,index)=>'<li><h3>'+escape(response.path)+'</h3><p class="small">'+escape(response.bytes)+" bytes · Retrieved "+escape(response.retrieved_date??project.capture.scope?.retrieved_date??"Retained in source capture")+'</p><p class="row-key">'+escape(response.sha256)+'</p><div class="actions"><button data-source="'+index+'">Download original JSON</button><a href="'+escape(safeURL(response.url))+'" target="_blank" rel="noopener noreferrer">Published source</a></div></li>').join("")+'</ul></section>';
  $$("[data-source]").forEach(button=>button.onclick=safe(()=>{const response=allResponses()[Number(button.dataset.source)];downloadBytes(response.path.split("/").at(-1),decodeBase64(response.content_base64),"application/json");status("Downloaded the complete original "+response.path+".");}));
}
function renderHistory(){
  $("#main").innerHTML='<h2>History & handover</h2><section class="panel"><h3>Complete editable project</h3><p>Save project retains the original catalogue, destination mappings, current corrections, issue decisions and every review event. Open that JSON on a fresh browser to continue the same project.</p><div class="actions"><button id="history-save">Save project</button><button id="history-package">Export complete intake package</button></div><p class="small muted">The intake ZIP includes the editable project, original source responses, reviewed tables, typed expected tables and the native continuation instructions. Run the existing migration workbench course to produce its native results and full editable handover.</p></section><section class="panel"><h3>Review events · '+project.history.length+'</h3>'+(project.history.length?project.history.slice().reverse().map(event=>'<details><summary>Revision '+event.revision+" · "+escape(event.kind)+" · "+escape(event.reviewer)+'</summary><p class="small">'+escape(event.at)+'</p><p>'+escape(event.reason)+'</p><pre>'+escape(json(event.details))+"</pre></details>").join(""):'<p>No edits have been made to the source-preserving initial mapping.</p>')+'</section>';
  $("#history-save").onclick=saveProject;$("#history-package").onclick=safe(exportPackage);
}
function saveProject(){downloadJSON("loaded-bikes-project-r"+project.revision+".json",project);status("Saved the complete editable project at revision "+project.revision+".");}

async function exactFile(url,descriptor){
  const response=await fetch(url);if(!response.ok)throw Error("Complete application file unavailable: "+descriptor.path+" ("+response.status+")");
  const bytes=new Uint8Array(await response.arrayBuffer());
  const sha=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(b=>b.toString(16).padStart(2,"0")).join("");
  if(bytes.length!==descriptor.bytes||sha!==descriptor.sha256)throw Error("Application file differs from its complete source manifest: "+descriptor.path);
  return bytes;
}
async function applicationFiles(edition){
  const baseURL=new URL("../../workbench/",location.href),appURL=new URL("./",location.href);
  const responses=await Promise.all([fetch(new URL("SOURCE_MANIFEST.json",baseURL)),fetch(new URL("SOURCE_MANIFEST.json",appURL))]);
  if(responses.some(r=>!r.ok))throw Error("The complete application source manifest is unavailable. Save the editable project while the maintained application is restored.");
  const texts=await Promise.all(responses.map(r=>r.text())),manifests=texts.map(t=>JSON.parse(t));
  const jobs=[];
  manifests.forEach((manifest,index)=>{
    if(!Array.isArray(manifest.files))throw Error("The application source manifest is incomplete");
    const base=index===0?baseURL:appURL,prefix=index===0?"application/workbench/":"application/adaptations/loaded-bikes/";
    for(const file of manifest.files){
      if(!file.path||file.path.startsWith("/")||file.path.includes("\\")||file.path.split("/").some(p=>!p||p===".."||p==="."))throw Error("Unsafe application source path");
      jobs.push({file,base,prefix});
    }
  });
  const result=[],queue=jobs.slice();let completed=0;
  await Promise.all(Array.from({length:Math.min(6,queue.length)},async()=>{
    while(queue.length){const {file,base,prefix}=queue.shift();const content=await exactFile(new URL(file.path,base),file);result.push({path:prefix+file.path,content});completed++;status("Preparing complete editable application · "+completed+" of "+jobs.length+" files");}
  }));
  texts.forEach((content,index)=>result.push({path:(index===0?"application/workbench/":"application/adaptations/loaded-bikes/")+"SOURCE_MANIFEST.json",content}));
  result.push({path:"application/adaptations/loaded-bikes/catalogue-capture.json",content:json(edition.capture)+"\n"});
  result.push({path:"application/adaptations/loaded-bikes/project.json",content:json(edition)+"\n"});
  if(edition.claims)result.push({path:"application/adaptations/loaded-bikes/source-claims.json",content:json(edition.claims)+"\n"});
  return result;
}

async function exportPackage(){
  if(exportBusy)throw Error("The complete package is already being prepared.");
  exportBusy=true;const edition=validateProject(project);
  try{
  const output=await prepareCatalogue({capture:edition.capture,review:edition.review});
  const files=[{path:"project.json",content:json(edition)+"\n"},...await applicationFiles(edition)];
  for(const response of allResponses(edition))files.push({path:response.path,content:decodeBase64(response.content_base64)});
  if(edition.claims)files.push({path:"source/source-claims.json",content:json(edition.claims)+"\n"});
  for(const file of output.files||[])if(!files.some(item=>item.path===file.path))files.push({path:file.path,content:file.content});
  files.push({path:"README.txt",content:"Loaded Bikes complete catalogue intake\n\nThis package includes the complete source application and this exact editable review edition.\nFrom the extracted folder run: python3 -m http.server 8080 --bind 127.0.0.1\nOpen http://127.0.0.1:8080/application/adaptations/loaded-bikes/ in your browser.\nThe included project.json restores this exact edition automatically when there is no browser-saved project. Use Open project to select it explicitly if another project is already saved.\nThe originals/ directory contains every retained public response without alteration.\nReviewed staging and typed expected files are generated by the maintained customer adapter.\nUse application/adaptations/loaded-bikes/OPERATING.md for the original native Workspace intake, run, verification, business acceptance and complete handover.\nProject revision: "+edition.revision+"\nSource capture date: "+edition.capture.scope.retrieved_date+"\n\nReview decisions accompany source interpretation. Original native verification and business-acceptance results are produced by the migration workbench during its run.\n"});
  downloadBytes("loaded-bikes-intake-r"+edition.revision+".zip",zipStore(files),"application/zip");status("Exported "+files.length+" complete intake files and the editable project.");
  }finally{exportBusy=false;}
}

$("#nav").onclick=event=>{const button=event.target.closest("[data-tab]");if(button){tab=button.dataset.tab;render();}};
$("#save").onclick=saveProject;$("#package").onclick=safe(exportPackage);$("#open").onclick=()=>$("#file").click();
$("#file").onchange=safe(async event=>{const file=event.target.files[0];if(!file)return;const sequence=++openSequence;++installGeneration;const value=JSON.parse(await file.text());if(sequence!==openSequence)return;let candidate;if(value.schema==="tjlabs.loaded-bikes.source-claims.v1"){if(!project)throw Error("Open the original catalogue before its relationship inventory");candidate=revise(project,{kind:"source-inventory-import",reviewer:"Project operator",reason:"Imported complete source-linked relationship inventory",details:{file:file.name,schema:value.schema}},next=>{next.claims=value;});}else candidate=value.schema==="tjlabs.loaded-bikes.catalogue-capture.v1"?newProject(value,await defaultReview(value),{id:crypto.randomUUID()}):value;await install(candidate);event.target.value="";status("Opened "+file.name+" with its complete retained source and history.");});
$("#close-editor").onclick=()=>$("#editor").close();
$("#editor-form").onsubmit=safe(async event=>{event.preventDefault();const form=new FormData(event.target),reviewer=form.get("reviewer"),reason=form.get("reason");let next;
  if(editing.kind==="cell"){const {table,row,column}=editing;const value=JSON.parse(form.get("value"));next=setCorrection(project,{table:table.name,sourceKey:sourceKey(table,row),column,previousValue:row[column],value,reviewer,reason});}
  else next=setIssueDecision(project,{issueId:editing.issue.id,disposition:form.get("disposition"),reviewer,reason});
  await commit(next);sessionStorage.setItem("loaded-bikes-reviewer",reviewer);$("#editor").close();status("Saved review revision "+project.revision+".");
});
$("#restore").onclick=safe(async()=>{const form=new FormData($("#editor-form")),{table,row,column}=editing,correction=activeCorrection(table,row,column);if(!correction)return;await commit(removeCorrection(project,correction,{reviewer:form.get("reviewer"),reason:form.get("reason")}));$("#editor").close();status("Restored the original source value; prior review remains in history.");});
try{
  const saved=localStorage.getItem(STORAGE);if(saved&&openSequence===0)await install(JSON.parse(saved),{save:false});
  else{const savedResponse=await fetch("./project.json");if(savedResponse.ok){const initial=await savedResponse.json();if(openSequence===0)await install(initial);}else{const response=await fetch("./catalogue-capture.json");if(!response.ok)throw Error("Could not load the retained source catalogue ("+response.status+"). Open a saved project or catalogue capture.");const capture=await response.json();const initial=newProject(capture,await defaultReview(capture),{id:crypto.randomUUID(),claims:await initialClaims()});if(openSequence===0)await install(initial);}}
}catch(error){status(error.message,true);$("#main").innerHTML='<section class="panel"><h2>Open a complete project</h2><p>The retained catalogue could not be opened automatically. Use Open project to select a saved review project or the complete source capture.</p><p>Your existing saved project is preserved until another project opens successfully.</p></section>';}
