"""MIT. Deterministic offline HILA analyst and approved aggregate report."""
from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile

from hila_questionnaire import canonical
from hila_workspace import InputError

HEAD = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>HILA round review</title><style>
:root{color-scheme:light;--ink:#202020;--muted:#636363;--line:#c9c9c9;--paper:#f4f4f2;--panel:#fff;--dark:#303030}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
header{background:#242424;color:#fff;padding:26px 32px}header p{color:#d5d5d5;max-width:1000px}h1{font-size:27px;font-weight:600;margin:5px 0 8px}h2{font-size:19px;margin:0 0 15px}h3{font-size:15px;margin:18px 0 8px}.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase}.layout{max-width:1650px;margin:auto;padding:24px 30px}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:20px}.card,section{background:var(--panel);border:1px solid var(--line);padding:19px;margin-bottom:18px}.card{margin:0}.card strong{display:block;font-size:25px;font-weight:600;margin:6px 0}.muted{color:var(--muted)}.mono{font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}.notice{border-left:4px solid #555;background:#e8e8e6;padding:13px 16px;margin-bottom:18px}.toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-bottom:16px}label{display:grid;gap:5px;font-size:12px;font-weight:600;min-width:135px}input,select,textarea,button{font:inherit;color:inherit;border:1px solid #a9a9a9;border-radius:2px;background:#fff;padding:9px 10px}input,select{min-height:40px}input[type=search]{min-width:280px}textarea{width:100%;min-height:95px;resize:vertical;font-family:inherit;font-weight:400}button{cursor:pointer;background:#efefed;white-space:nowrap}button.primary{background:#303030;color:#fff;border-color:#303030}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #333;outline-offset:3px}
.table-wrap{overflow:auto;max-height:70vh}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th{position:sticky;top:0;background:#ededeb;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;z-index:1}td,th{border-bottom:1px solid #ddd;padding:11px 12px;vertical-align:top}tbody tr:hover{background:#f4f4f2}td.num{text-align:right;white-space:nowrap}td.small{font-size:12px}.badge{display:inline-block;border:1px solid #aaa;padding:1px 6px;font-size:11px;text-transform:uppercase;white-space:nowrap}.badge.reviewed{border-style:double;border-width:3px}.badge.correction{border-style:dashed;background:#dedede}.pagination{display:flex;gap:12px;align-items:center;margin-top:16px}.pagination span{margin-right:auto}.split{display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:20px}.detail{white-space:pre-wrap;overflow-wrap:anywhere}.field-label{max-width:540px}.error{border:2px solid #353535;background:#ddd;padding:12px;margin:12px 0;white-space:pre-wrap}.hidden{display:none!important}details{margin:9px 0;border:1px solid #ddd;padding:11px}summary{cursor:pointer;font-weight:600}pre{max-height:480px;overflow:auto;white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;margin:12px 0 0}.actions{display:flex;gap:9px;flex-wrap:wrap;margin:12px 0}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.full{grid-column:1/-1}footer{padding:10px 0 30px;color:#666;font-size:12px}.empty{padding:28px;color:#666;text-align:center}
@media(max-width:850px){header{padding:22px 18px}.layout{padding:16px}.split,.grid2{grid-template-columns:1fr}.toolbar>*{flex:1;min-width:160px}input[type=search]{min-width:100%}.table-wrap{max-height:none}}
@media print{body{background:#fff}.toolbar,.pagination,button,#editor,.actions{display:none!important}.layout{max-width:none;padding:0}header{background:#fff;color:#222;padding:8px}header p{color:#555}.card,section{break-inside:avoid}.table-wrap{overflow:visible;max-height:none}th{position:static}.hidden{display:none!important}}
</style></head><body>
<header><div class="eyebrow">HILA • Round review</div><h1 id="name"></h1><p id="intro"></p><div id="identity" class="mono"></div></header>
<main class="layout"><div id="notice" class="notice"></div><div id="summary" class="summary"></div>
<section><h2>Five dimensions</h2><div class="table-wrap"><table><thead><tr><th>Dimension</th><th>Edition</th><th>Selected respondents</th><th>Scored respondents</th><th>Mean score</th><th>Calculation</th></tr></thead><tbody id="overview"></tbody></table></div></section>
<section><h2>Complete cell register</h2><p class="muted">Country and role memberships can overlap. Each cell counts its distinct selected respondents; cell totals are not a distinct global sample.</p>
<div class="toolbar"><label>Search<input id="search" type="search" placeholder="Country, original code, dimension…"></label>
<label>Dimension<select id="dimension"></select></label><label>Breakdown<select id="axis"></select></label><label>Decision<select id="decision"><option value="">All decisions</option><option value="unreviewed">Unreviewed</option><option value="accepted">Accepted</option><option value="needs-correction">Needs correction</option><option value="note">Note</option></select></label>
<label>Language<select id="language"></select></label></div>
<div class="table-wrap"><table><thead><tr><th>Dimension</th><th>Breakdown / context</th><th>Respondents<br>before → after</th><th>Scored<br>before → after</th><th>Mean<br>before → after</th><th>Difference</th><th>Decision</th><th>Details</th></tr></thead><tbody id="cells"></tbody></table></div>
<div class="pagination"><span id="page-status"></span><button id="previous">Previous</button><button id="next">Next</button></div></section>
<section id="details" class="hidden"><h2 id="cell-title"></h2><div id="cell-context"></div><div class="split"><div><div id="cell-denominators"></div><h3>Every original assessment item in this cell</h3><div class="table-wrap"><table><thead><tr><th>Original field</th><th>Edition</th><th>Answer-code frequencies</th><th>Eligibility and response states</th></tr></thead><tbody id="items"></tbody></table></div></div>
<div id="cell-editor"><h3>Cell review</h3><label>Decision<select id="cell-decision"><option value="note">Note</option><option value="accepted">Accepted</option><option value="needs-correction">Needs correction</option></select></label><label>Named reviewer<input id="cell-reviewer" maxlength="320"></label><label>Review note<textarea id="cell-note"></textarea></label><div class="actions"><button id="keep-cell" class="primary">Keep this decision</button><button id="clear-cell">Clear decision</button></div><p class="muted">Decisions remain in this open report until you download and save the complete review update.</p></div></div></section>
<section id="editor"><h2>Review and return</h2><p>Preserve the full saved definition, including both editions, methodology, cohort selection and respondent decisions. Download the update and save it through the HILA workspace using its original revision.</p>
<div class="grid2"><label>Review name<input id="review-name"></label><label>Status<select id="review-status"><option value="draft">Draft</option><option value="reviewed">Reviewed</option><option value="needs-correction">Needs correction</option></select></label><label>Named reviewer<input id="reviewer"></label><label>Review note<textarea id="review-note"></textarea></label><label class="full">Analyst notes<textarea id="notes"></textarea></label></div>
<div class="actions"><button id="download-update" class="primary">Download review update</button><span id="changed" class="muted"></span></div></section>
<section><h2>Complete downloads</h2><div class="actions"><button id="download-report">Download full report JSON</button><button id="download-csv">Download all cells CSV</button><button id="print">Print report</button></div><p class="muted">Downloads include all retained cells in this report. Search and page controls affect only the visible register.</p></section>
<section><h2>Source, methodology and coverage</h2><div id="source"></div><div id="coverage"></div><div id="methodology"></div><div id="suppression"></div></section>
<div id="error" class="error hidden" role="alert"></div><footer>Offline report • No external scripts or network requests • Original categorical responses and complete selected methodology retained</footer></main>
<script id="hila-data" type="application/json">
"""

SCRIPT = r"""
</script><script>
"use strict";
const payload=JSON.parse(document.getElementById("hila-data").textContent),R=payload.report,V=payload.view,F=payload.form;
const $=id=>document.getElementById(id),copy=x=>JSON.parse(JSON.stringify(x)),text=(el,value)=>{el.textContent=value===null||value===undefined?"—":String(value);return el;};
const add=(tag,value,cls)=>{const el=document.createElement(tag);if(cls)el.className=cls;return text(el,value);};
const number=v=>v===null||v===undefined?"—":String(v),dimensions=["availability","accessibility","quality","use","awareness"];
const decisions=new Map((V?.cellDecisions||[]).map(item=>[item.key,copy(item)]));let page=0,selected=null,language=F?.languages?.[0]||"Codes";
const editionNames=new Map((R.attribution||[]).map(item=>[item.edition,item.name||item.edition.slice(0,12)]));
const arrays=R.editions.map(item=>new Map(item.cells.map(cell=>[cell.key,cell]))),allKeys=new Set(arrays.flatMap(map=>Array.from(map.keys())));
const rows=Array.from(allKeys).map(key=>{const before=arrays.length>1?arrays[0].get(key)||null:null,after=arrays.at(-1).get(key)||null;const cell=after||before;const delta=Array.isArray(R.comparison)?R.comparison.find(item=>item.key===key):R.comparison?.cells?.find(item=>item.key===key);return {key,before,after,cell,delta};}).sort((a,b)=>(a.cell.dimension+"/"+a.cell.axis+"/"+(a.cell.value??"")).localeCompare(b.cell.dimension+"/"+b.cell.axis+"/"+(b.cell.value??"")));
function labelOf(value){if(!value)return "";return value.translations?.[language]?.long||value.text||"";}
function choiceName(axis,value){if(value===null)return "Missing membership";if(!F)return String(value);const paths={country:["respondent_info/country","respondent_info/countries"],sector:["respondent_info/topic"],organization:["respondent_info/org_type"],role:["respondent_info/roles"]};for(const path of paths[axis]||[]){const item=F.fields[path]?.choices.find(c=>c.value===value);if(item)return item.translations?.[language]?.long||labelOf(item.label)||String(value);}return String(value);}
function joined(before,after,field){return before?number(before[field])+" → "+number(after?.[field]):number(after?.[field]);}
function fail(error){text($("error"),error.message||error);$("error").classList.remove("hidden");$("error").scrollIntoView({block:"nearest"});}
function run(fn){return event=>{try{$("error").classList.add("hidden");fn(event);}catch(error){fail(error);}};}
function option(el,value,label){const o=add("option",label);o.value=value;el.append(o);}
function details(parent,title,value){const d=document.createElement("details");d.append(add("summary",title),add("pre",typeof value==="string"?value:JSON.stringify(value,null,2)));parent.append(d);}
function plain(value,label,limit,required=false){if(typeof value!=="string"||Array.from(value).length>limit||value.includes("\0")||(required&&!value.trim()))throw Error(label+" must be "+(required?"nonempty ":"")+"text within "+limit+" characters.");return value;}
function download(name,body,type){const blob=new Blob([body],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function uuid(){if(globalThis.crypto?.randomUUID)return crypto.randomUUID();if(!globalThis.crypto?.getRandomValues)throw Error("This browser cannot create a new request identity.");const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;return Array.from(b,(v,i)=>([4,6,8,10].includes(i)?"-":"")+v.toString(16).padStart(2,"0")).join("");}
text($("name"),R.name);text($("identity"),"Review "+R.reviewId+" • Revision "+R.revision+" • Definition "+R.definitionSha256);
text($("intro"),V?"Full private analyst report with complete original categorical distributions, saved decisions and source-bound methodology.":"Approved aggregate release with the selected whole-axis disclosure rule.");
text($("notice"),V?"Only consenting responses contribute to analytics. Refusal explanations, organisation names, free text and audio stay outside the report. Mean scores appear only when an approved calculation is selected.":"Only approved aggregate cells are included. Suppressed axes remain excluded across both editions; individual response data is not embedded.");
for(const e of R.editions){const card=add("div","", "card");card.append(add("div",editionNames.get(e.edition)||e.edition.slice(0,12),"muted"),add("strong",e.counts?e.counts.selected+" selected":"Aggregate edition"),add("div",e.counts?(e.counts.sourceRows+" original rows • "+e.counts.consenting+" consenting"):"Original edition "+e.edition.slice(0,12)),add("div",e.scoringStatus||"Approved selected methodology","muted"));$("summary").append(card);}
for(const dimension of dimensions)for(const e of R.editions){const c=e.cells.find(x=>x.dimension===dimension&&x.axis==="overall");const tr=document.createElement("tr");for(const v of [dimension,editionNames.get(e.edition)||e.edition.slice(0,12),c?.respondents,c?.scoredRespondents,c?.meanScore,c?(e.scoringStatus||"computed"):"Suppressed or no selected cell"])tr.append(add("td",v));$("overview").append(tr);}
option($("dimension"),"","All five dimensions");for(const d of dimensions)option($("dimension"),d,d);
option($("axis"),"","All breakdowns");for(const a of ["overall","country","sector","organization","role"])option($("axis"),a,a==="organization"?"Organisation type":a);
for(const lang of F?.languages||["Codes"])option($("language"),lang,lang);
function render(){const q=$("search").value.toLowerCase(),d=$("dimension").value,a=$("axis").value,status=$("decision").value;const filtered=rows.filter(r=>(!d||r.cell.dimension===d)&&(!a||r.cell.axis===a)&&(!status||(decisions.get(r.key)?.decision||"unreviewed")===status)&&(!q||[r.cell.dimension,r.cell.axis,r.cell.value,choiceName(r.cell.axis,r.cell.value)].join(" ").toLowerCase().includes(q)));const size=100;page=Math.min(page,Math.max(0,Math.ceil(filtered.length/size)-1));$("cells").replaceChildren();for(const r of filtered.slice(page*size,(page+1)*size)){const tr=document.createElement("tr");tr.append(add("td",r.cell.dimension),add("td",r.cell.axis+" / "+(r.cell.axis==="overall"?"All selected":choiceName(r.cell.axis,r.cell.value))));for(const field of ["respondents","scoredRespondents","meanScore"])tr.append(add("td",joined(r.before,r.after,field),"num"));tr.append(add("td",r.delta?.meanDifference??"—","num"));const td=document.createElement("td"),decision=decisions.get(r.key)?.decision||"unreviewed";td.append(add("span",decision,"badge "+(decision==="accepted"?"reviewed":decision==="needs-correction"?"correction":"")));tr.append(td);const action=document.createElement("td"),button=add("button","Open");button.onclick=run(()=>openCell(r));action.append(button);tr.append(action);$("cells").append(tr);}if(!filtered.length){const tr=document.createElement("tr"),td=add("td","No retained cells match these display filters.","empty");td.colSpan=8;tr.append(td);$("cells").append(tr);}text($("page-status"),filtered.length+" matching cells • "+rows.length+" retained • Page "+(page+1)+" of "+Math.max(1,Math.ceil(filtered.length/size)));$("previous").disabled=page===0;$("next").disabled=(page+1)*size>=filtered.length;text($("changed"),decisions.size+" retained cell decisions");}
function openCell(row){selected=row;$("details").classList.remove("hidden");text($("cell-title"),row.cell.dimension+" / "+row.cell.axis+" / "+choiceName(row.cell.axis,row.cell.value));text($("cell-context"),"Original cell "+row.key);$("cell-denominators").replaceChildren();$("items").replaceChildren();for(const [label,cell] of [["Before",row.before],["After",row.after]])if(cell){details($("cell-denominators"),label+" — complete cell and denominator states",cell);for(const item of cell.items||[]){const tr=document.createElement("tr"),field=add("td","","field-label");field.append(add("div",labelOf(F?.fields?.[item.field]?.label)||item.field),add("div",item.field,"mono"));tr.append(field,add("td",label),add("td",JSON.stringify(item.values),"mono"),add("td",JSON.stringify(item.states),"mono"));$("items").append(tr);}}if(V){const decision=decisions.get(row.key);$("cell-decision").value=decision?.decision||"note";$("cell-reviewer").value=decision?.reviewer||$("reviewer").value;$("cell-note").value=decision?.note||"";}$("details").scrollIntoView({block:"start",behavior:"smooth"});}
for(const id of ["search","dimension","axis","decision"]){$(id).addEventListener(id==="search"?"input":"change",()=>{page=0;render();});}
$("language").onchange=()=>{language=$("language").value;render();if(selected)openCell(selected);};
$("previous").onclick=()=>{page--;render();};$("next").onclick=()=>{page++;render();};
if(V){$("review-name").value=V.name;$("notes").value=V.notes;$("review-status").value=V.review.status;$("reviewer").value=V.review.reviewer;$("review-note").value=V.review.note;
$("keep-cell").onclick=run(()=>{if(!selected)throw Error("Open an original cell first.");decisions.set(selected.key,{key:selected.key,decision:$("cell-decision").value,reviewer:plain($("cell-reviewer").value,"Reviewer",160,true),note:plain($("cell-note").value,"Cell note",8000,true)});render();});
$("clear-cell").onclick=run(()=>{if(selected)decisions.delete(selected.key);render();});
$("download-update").onclick=run(()=>{const fields=["name","notes","editions","rules","selection","review","rowDecisions","cellDecisions"];const update=Object.fromEntries(fields.map(key=>[key,copy(V[key])]));update.id=V.id;update.expectedRevision=V.revision;update.name=plain($("review-name").value,"Review name",160,true);update.notes=plain($("notes").value,"Analyst notes",8000);update.review={status:$("review-status").value,reviewer:plain($("reviewer").value,"Reviewer",160,$("review-status").value!=="draft"),note:plain($("review-note").value,"Review note",8000)};update.cellDecisions=Array.from(decisions.values()).sort((a,b)=>a.key.localeCompare(b.key));update.requestId=uuid();const body=JSON.stringify(update,null,2)+"\n";if(new TextEncoder().encode(body).byteLength>64*1024*1024)throw Error("The complete downloaded request exceeds 64 MiB.");download("hila-review-"+V.id.slice(0,12)+"-r"+V.revision+"-update.json",body,"application/json");});}
else{$("editor").classList.add("hidden");$("cell-editor").classList.add("hidden");}
$("download-report").onclick=()=>download("hila-report-"+R.reviewId.slice(0,12)+"-r"+R.revision+".json",JSON.stringify(R,null,2)+"\n","application/json");
function csvCell(v){return '"'+String(v??"").replaceAll('"','""')+'"';}
$("download-csv").onclick=()=>{const output=[["edition","cellKey","dimension","axis","value","respondents","scoredRespondents","meanScore","denominatorStates"]];for(const edition of R.editions)for(const c of edition.cells)output.push([edition.edition,c.key,c.dimension,c.axis,c.value,c.respondents,c.scoredRespondents,c.meanScore,JSON.stringify(c.states||{})]);download("hila-all-cells.csv",output.map(row=>row.map(csvCell).join(",")).join("\n")+"\n","text/csv;charset=utf-8");};
$("print").onclick=()=>print();
for(const original of R.attribution||[])details($("source"),editionNames.get(original.edition)||original.edition,original);
if(F)details($("source"),"Original questionnaire, all languages and field provenance",F);
for(const edition of R.editions)details($("coverage"),"Coverage — "+(editionNames.get(edition.edition)||edition.edition.slice(0,12)),edition.coverage);
details($("methodology"),"Complete selected calculation and disclosure definition",R.rules||R.methodology);
if(R.suppressedAxes)details($("suppression"),"Suppressed axes",R.suppressedAxes);
render();
</script></body></html>
"""


def write_html(view, report, form, path):
    from hila_portable import open_output, checked_size
    from workspace import regular, sync_dir
    path = Path(path)
    if not path.parent.is_dir() or path.parent.is_symlink():
        raise InputError("Choose an existing real report directory")
    fd, name = tempfile.mkstemp(prefix=".hila-report-", suffix=".partial", dir=path.parent)
    os.close(fd)
    stage = Path(name)
    stage.unlink()
    encoder = json.JSONEncoder(ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    with open_output(stage) as out:
        out.write(HEAD.encode())
        for part in encoder.iterencode({"view": view, "report": report, "form": form}):
            out.write(part.replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")
                      .replace("\u2028", "\\u2028").replace("\u2029", "\\u2029").encode())
        out.write(SCRIPT.encode())
    actual = checked_size(stage)
    if path.exists() or path.is_symlink():
        regular(path, 4 * 1024 * 1024 * 1024)
        if checked_size(path) != actual:
            raise InputError("Existing complete HTML selects another retained report")
        stage.unlink()
        return path
    os.replace(stage, path)
    sync_dir(path.parent)
    return path
