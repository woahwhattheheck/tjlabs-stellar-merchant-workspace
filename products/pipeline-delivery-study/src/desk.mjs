export function mountDeliveryDesk(core,codec,store,initial,portable) {
  "use strict";
  const $=id=>document.getElementById(id),clone=core.clone,now=()=>new Date().toISOString(),id=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
  let w,session,record=null,dirty=true,generation=0,busy=1,pending=0,lastError="",serial=Promise.resolve(),timer=null,page=0;
  const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
  const defaults=()=>({collection_id:"",compare_id:"",target:"",reviewDrafts:{},fields:{reviewer:"",note:"",status:"noted",request:""},imports:[]});
  function normalize(value) {
    if(!plain(value)||value.schema!=="tjlabs.pipeline-desk.v1")throw Error("Expected a complete pipeline working file");
    core.validate(value.workspace);const s={...defaults(),...clone(value.session||{})};
    if(!plain(s.fields)||!plain(s.reviewDrafts)||!Array.isArray(s.imports))throw Error("Invalid working drafts");
    for(const k of ["collection_id","compare_id","target"])if(typeof s[k]!=="string")throw Error("Invalid selection");
    for(const k of ["reviewer","note","status","request"])if(typeof s.fields[k]!=="string")throw Error("Missing literal field "+k);
    for(const [k,v] of Object.entries(s.reviewDrafts)){if(!plain(v)||!["collection_id","target","basis","reviewer","note","status"].every(x=>typeof v[x]==="string")||k!==draftKey(v.collection_id,v.target,v.basis))throw Error("Review draft attribution mismatch");}
    for(const x of s.imports)core.verifyOriginal(x);
    return{...clone(value),workspace:clone(value.workspace),session:s};
  }
  function draftKey(collection,target,basis){return core.hash([collection,target,basis])}
  function assessment(){const c=w.collections.find(c=>c.id===session.collection_id);return c?core.inspect(c):null}
  function selected(){return assessment()?.targets.find(t=>t.id===session.target)||null}
  function stash(){const t=selected();if(t)session.reviewDrafts[draftKey(session.collection_id,t.id,t.basis)]={collection_id:session.collection_id,target:t.id,basis:t.basis,reviewer:session.fields.reviewer,note:session.fields.note,status:session.fields.status}}
  function snapshot(){stash();return{schema:"tjlabs.pipeline-desk.v1",workspace:clone(w),session:clone(session)}}
  function changed(){dirty=true;generation++;clearTimeout(timer);timer=setTimeout(()=>{timer=null;save().catch(showError)},650)}
  function controls(){document.querySelectorAll("[data-mutate]").forEach(n=>n.disabled=!!busy);$("save-state").textContent=(record?"Browser copy "+record.id:"Temporary copy")+" · "+(dirty?"unsaved":"saved")+(pending?" · saving":"")+(lastError?" · "+lastError:"")}
  function showError(e){lastError=e.message;dirty=true;$("notice").textContent=e.message+" Your full current working download remains available.";controls()}
  function queue(fn){pending++;controls();const next=serial.then(fn,fn);serial=next.catch(()=>{});return next.finally(()=>{pending--;controls()})}
  async function save() {const value=snapshot(),g=generation;return queue(async()=>{if(!record){const created=await store.create(value,w.title);record=created;if(g===generation)dirty=false;lastError="";await refreshCopies();controls();return}
    const result=await store.save(record.id,record.sha256,value);
    if(!result.saved){lastError="Another saved head changed; this complete proposal is retained in recovery. Save an independent copy to continue.";dirty=true;await refreshRecoveries();throw Error(lastError)}
    record=result.record;if(g===generation)dirty=false;lastError="";controls()})}
  async function action(fn){if(busy)return;busy++;clearTimeout(timer);timer=null;controls();try{await fn();lastError=""}catch(e){showError(e)}finally{busy--;controls()}}
  async function preserve(){await save();if(dirty)throw Error("Current work changed during preservation; save again before switching")}
  function restoreFields() {for(const k of ["reviewer","note","status","request"])$(k).value=session.fields[k];}
  function loadDraft(){const t=selected(),d=t&&session.reviewDrafts[draftKey(session.collection_id,t.id,t.basis)];session.fields.reviewer=d?.reviewer||"";session.fields.note=d?.note||"";session.fields.status=d?.status||"noted";restoreFields()}
  function chooseTarget(target){if(busy)return;stash();session.target=target;loadDraft();changed();render()}
  const option=(v,label,selected)=>'<option value="'+core.esc(v)+'"'+(selected?" selected":"")+'>'+core.esc(label)+'</option>';
  function render() {
    $("title").textContent=w.title;$("identity").textContent=w.mode+" · "+w.id+" · "+w.collections.length+" retained collection editions";
    $("collection").innerHTML=option("","Choose collection",!session.collection_id)+w.collections.map(c=>option(c.id,c.id+" · "+c.evidence,session.collection_id===c.id)).join("");
    $("compare").innerHTML=option("","No comparison",!session.compare_id)+w.collections.map(c=>option(c.id,c.id,session.compare_id===c.id)).join("");
    $("requests").textContent=JSON.stringify(w.commands,null,2);
    const a=assessment();$("summary").textContent=a?JSON.stringify({job:a.job_id,evidence:a.evidence,mode:a.mode,coverage:a.coverage,all_declared_files_verified:a.delivery_verified,attention:a.findings.length},null,2):"Import a captured collection or open the authored example. No service call is made here.";
    if(a){
      const entries=a.targets;const maxPage=Math.max(0,Math.ceil(entries.length/100)-1);page=Math.min(page,maxPage);$("page-status").textContent="Page "+(page+1)+" of "+(maxPage+1)+" · "+entries.length+" review targets";
      $("targets").innerHTML=entries.slice(page*100,page*100+100).map(t=>'<button type="button" data-mutate data-target="'+core.esc(t.id)+'"'+(session.target===t.id?' aria-pressed="true"':"")+'>'+core.esc(t.kind+" · "+t.label)+'</button>').join("");
      $("targets").querySelectorAll("[data-target]").forEach(b=>b.onclick=()=>chooseTarget(b.dataset.target));
      const t=selected();$("target-detail").textContent=t?JSON.stringify(t.data,null,2):"Select an episode, file or finding to inspect its complete evidence.";
      $("review-target").textContent=t?t.id+" · basis "+t.basis:"No target selected";
      $("reviews").textContent=JSON.stringify(w.reviews.filter(r=>r.collection_id===session.collection_id),null,2);
      const c=w.collections.find(c=>c.id===session.collection_id),originals=[...c.responses.map(r=>({label:r.kind+" · HTTP"+r.status,body:r.body})),...c.artifacts.map(x=>({label:x.path+(x.storage==="external"?" · external native original":""),body:x.body,external:x.storage==="external",capture_id:x.capture_id})),{label:"Pinned API specification",body:w.spec}];
      $("originals").innerHTML=originals.map((x,i)=>'<button type="button" data-original="'+i+'">'+core.esc(x.label+" · "+x.body.bytes+" bytes")+'</button>').join("");
      $("originals").querySelectorAll("[data-original]").forEach(b=>b.onclick=()=>{const entry=originals[Number(b.dataset.original)],o=entry.body;if(entry.external)download("external-original.json",JSON.stringify({capture_id:entry.capture_id,...o},null,2));else download(o.name.split("/").pop(),core.verifyOriginal(o),"application/octet-stream")});
      const before=w.collections.find(c=>c.id===session.compare_id);$("comparison").textContent=before?JSON.stringify(core.compare(before,c),null,2):"Choose an earlier collection to compare original episode evidence and file identities.";
    } else {for(const k of ["targets","originals"])$(k).innerHTML="";for(const k of ["target-detail","reviews","comparison","review-target","page-status"])$(k).textContent="";}
    controls();
  }
  function download(name,data,type="application/json"){const a=document.createElement("a"),url=URL.createObjectURL(new Blob([data],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}
  async function refreshCopies(){const rows=await store.list();$("copies").innerHTML=option("","Choose saved copy",true)+rows.map(r=>option(r.id,r.label+" · "+r.at,false)).join("")}
  async function refreshRecoveries(){const rows=await store.recoveries();$("recoveries").innerHTML=option("","Choose retained version",true)+rows.sort((a,b)=>b.at.localeCompare(a.at)).map(r=>option(r.id,r.kind+" · "+r.label+" · "+r.at,false)).join("");return rows}
  async function adopt(value,{preserveCurrent=true,label}={}) {
    const candidate=normalize(value);if(preserveCurrent)await preserve();
    const created=await store.create(candidate,label||candidate.workspace.title);
    w=candidate.workspace;session=candidate.session;record=created;dirty=false;generation++;page=0;restoreFields();render();await refreshCopies();await refreshRecoveries();
  }
  for(const k of ["reviewer","note","status","request"])$(k).addEventListener("input",()=>{session.fields[k]=$(k).value;changed()});
  $("collection").onchange=()=>{if(busy)return;stash();session.collection_id=$("collection").value;session.target="";page=0;loadDraft();changed();render()};
  $("compare").onchange=()=>{if(busy)return;session.compare_id=$("compare").value;changed();render()};
  $("previous").onclick=()=>{if(page>0){page--;render()}};
  $("next").onclick=()=>{page++;render()};
  $("save").onclick=()=>action(async()=>{await save();$("notice").textContent="Complete working copy saved."});
  $("fork").onclick=()=>action(async()=>{await serial;const value=normalize(snapshot()),created=await store.create(value,w.title+" — independent");record=created;dirty=false;generation++;lastError="";await refreshCopies();$("notice").textContent="Independent complete copy saved.";controls()});
  $("open-copy").onclick=()=>action(async()=>{const selectedID=$("copies").value;if(!selectedID)throw Error("Choose a saved copy");await preserve();const candidate=await store.get(selectedID);if(!candidate)throw Error("Saved copy no longer exists");const checked=normalize(candidate.value);w=checked.workspace;session=checked.session;record=candidate;dirty=false;generation++;page=0;restoreFields();render();$("notice").textContent="Selected complete saved copy opened."});
  $("refresh").onclick=()=>action(async()=>{await refreshCopies();await refreshRecoveries();$("notice").textContent="Saved copies and retained proposals refreshed."});
  $("recover").onclick=()=>action(async()=>{const rid=$("recoveries").value,rows=await store.recoveries(),r=rows.find(x=>x.id===rid);if(!r)throw Error("Choose a retained version");await adopt(r.value,{label:r.label+" — recovered"});$("notice").textContent="Retained version opened as an independent copy."});
  $("download-recovery").onclick=()=>action(async()=>{const rows=await store.recoveries(),r=rows.find(x=>x.id===$("recoveries").value);if(!r)throw Error("Choose a retained version");download("retained-working.json",JSON.stringify(r.value,null,2))});
  $("download-working").onclick=()=>{try{download("pipeline-working.json",JSON.stringify(snapshot(),null,2))}catch(e){showError(e)}};
  $("download-portable").onclick=()=>{try{download("pipeline-desk.html",portable(snapshot()),"text/html")}catch(e){showError(e)}};
  $("download-report").onclick=()=>{try{download("pipeline-report.html",core.report(w,session.collection_id),"text/html")}catch(e){showError(e)}};
  $("download-csv").onclick=()=>{try{download("episodes-safe.csv",core.episodeCSV(w,session.collection_id),"text/csv")}catch(e){showError(e)}};
  $("download-collection").onclick=()=>{const c=w.collections.find(c=>c.id===session.collection_id);if(c)download("collection.json",JSON.stringify(c,null,2))};
  $("retain-review").onclick=()=>action(async()=>{const t=selected();if(!t)throw Error("Select a review target");const f=clone(session.fields),next=core.review(w,{id:"review-"+id(),collection_id:session.collection_id,target:t.id,basis:t.basis,status:f.status,reviewer:f.reviewer,note:f.note,at:now()});w=next;changed();await save();render();$("notice").textContent="Local review retained with exact evidence basis; supplier decision unchanged."});
  $("prepare-request").onclick=()=>action(async()=>{const raw=session.fields.request,request=JSON.parse(raw.replace(/^\uFEFF/,""));const next=core.prepare(w,{id:"command-"+id(),request,at:now()});w=next;session.imports.push(core.original("prepared-request.json",raw));changed();await save();render();$("notice").textContent="Request retained locally. Native explicit create is the only dispatch path."});
  async function importFile(input,kind) {const file=input.files[0];if(!file)return;await action(async()=>{const bytes=new Uint8Array(await file.arrayBuffer()),o=core.original(file.name,bytes);session.imports.push(o);changed();let candidate;try{candidate=JSON.parse(codec.utf8Decode(bytes).replace(/^\uFEFF/,""))}catch(e){throw Error("Exact selected file retained but cannot parse: "+e.message)}
      if(kind==="working"){candidate=normalize(candidate);candidate.session.imports.push(o);await adopt(candidate)}
      else {const collection=candidate;core.validateCollection(collection,w.mode);const next=core.addCollection(w,collection,now());await preserve();const value=snapshot();value.workspace=next;value.session.collection_id=collection.id;value.session.target="";value.session.fields.reviewer="";value.session.fields.note="";value.session.fields.status="noted";await adopt(value,{preserveCurrent:false})}
      input.value="";$("notice").textContent="Complete imported data opened as an independent copy."})}
  $("working-file").onchange=()=>importFile($("working-file"),"working");
  $("collection-file").onchange=()=>importFile($("collection-file"),"collection");
  window.addEventListener("beforeunload",event=>{if(dirty||pending||busy||timer||lastError){event.preventDefault();event.returnValue=""}});
  const ready=(async()=>{const value=normalize(initial);w=value.workspace;session=value.session;restoreFields();render();try{record=await store.create(snapshot(),w.title);dirty=false;await refreshCopies();await refreshRecoveries();$("notice").textContent="Embedded complete handover opened as its own browser copy."}catch(e){showError(e)}busy=0;controls()})();
  return{ready,snapshot,normalize,save,chooseTarget,adopt,state:()=>({record,dirty,pending,busy,lastError}),render};
}
