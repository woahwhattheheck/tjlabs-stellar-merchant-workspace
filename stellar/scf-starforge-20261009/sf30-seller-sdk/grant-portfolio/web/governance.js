/* MIT. Governance and evaluation on the original Grant Portfolio console. */
"use strict";
function GrantGovernanceConsole(H) {
 const {state,node,button,field,panel,heading,metric,table,api,action,runOriginal,render,failure,currentEdit,rawDetails,download}=H;
 const names={committees:"Steering committees",meetings:"Committee meetings",decisions:"Meeting decisions",
  evaluations:"Evaluations",findings:"Findings and recommendations",responses:"Management responses",followups:"Follow-through reviews"};
 const human=k=>String(k).replace(/([a-z])([A-Z])/g,"$1 $2").replace(/[-_]/g," ").replace(/^./,c=>c.toUpperCase());
 const U={register:"queue",nodeId:"",grantId:"",search:"",archived:false,offset:0,schema:null,dialog:null,dirty:false,busy:false,controller:null};
 const copy=v=>JSON.parse(JSON.stringify(v));
 const exchange=GrantGovernanceExchange(H);
 const p=()=>state().portfolio, model=()=>p()?.definition.governance, programme=()=>p()?.definition.programme;
 const rows=n=>model()?.records[n]||[], prows=n=>programme()?.records[n]||[];
 const selected=()=>({portfolioId:p().id,revision:p().revision,snapshot:p().snapshot});
 const editable=()=>!!p()&&currentEdit()&&!state().pending&&!localStorage.getItem(cache("pending"));
 const title=r=>r?[r.code,r.title||r.name||r.id].filter(Boolean).join(" · "):"Missing original";
 const find=(n,id)=>rows(n).find(r=>r.id===id);
 const key=()=>["grant-governance-v1",state().state?.workspaceId,p()?.id].join(":");
 const cache=(kind)=>key()+":"+kind;
 function readSaved(kind){const raw=localStorage.getItem(cache(kind));if(!raw)return null;const v=JSON.parse(raw);
  if(v.schema!=="stellar-forge.governance-browser.v1"||v.workspaceId!==state().state.workspaceId||v.portfolioId!==p().id)throw Error("The retained browser file belongs to another workspace.");
  return v;}
 function saveLocal(kind,value){localStorage.setItem(cache(kind),JSON.stringify({schema:"stellar-forge.governance-browser.v1",
  workspaceId:state().state.workspaceId,portfolioId:p().id,...value}));}
 function clearLocal(kind){localStorage.removeItem(cache(kind));}
 function check(s){if(!editable()||p().id!==s.portfolioId||p().revision!==s.revision||p().snapshot!==s.snapshot)
  throw Error("The selected portfolio changed. Keep this draft and review the current original revision before saving.");}
 function jsonDownload(name,value){const bytes=new TextEncoder().encode(JSON.stringify(value,null,2)+"\n"),blob=new Blob([bytes],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=node("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 function errorAt(box,error){box.textContent=error.message||String(error);box.hidden=false;}
 function busy(value){U.busy=value;if(U.dialog){const body=U.dialog.querySelector(".governance-dialog-body");if(body)body.disabled=value;}}
 function removeIfUnchanged(key,expected){if(localStorage.getItem(key)===expected)localStorage.removeItem(key);}
 function closeDialog(force=false){if(U.busy&&!force)return false;if(U.dirty&&!force&&!confirm("Keep the saved working draft and close these fields?"))return false;
  U.controller?.abort();U.dialog?.close();U.dialog?.remove();U.dialog=null;U.controller=null;U.dirty=false;return true;}
 function openDialog(label){if(!closeDialog())return null;const dialog=node("dialog",null,"governance-dialog"),header=node("header"),h=node("h2",label);
  header.append(h,button("Close",()=>closeDialog()));const body=node("fieldset",null,"governance-dialog-body"),status=node("p","","governance-error");
  status.setAttribute("role","alert");status.hidden=true;dialog.append(header,status,body);document.body.append(dialog);
  U.dialog=dialog;U.controller=new AbortController();dialog.addEventListener("cancel",e=>{e.preventDefault();closeDialog();});dialog.showModal();
  return {dialog,body,status,signal:U.controller.signal};}
 function target(name,k){if(k==="supersedesId")return {name,local:true};
  const local={committeeId:"committees",meetingId:"meetings",evaluationId:"evaluations",findingId:"findings",responseId:"responses",decisionId:"decisions"};
  if(local[k])return {name:local[k],local:true};
  return {name:({nodeId:"nodes",grantId:"grants",documentIds:"documents",issueIds:"issues",milestoneIds:"milestones"})[k]||"documents",local:false};}
 function reference(name,k,value,multiple,exclude){
  const t=target(name,k),pool=t.local?rows(t.name):prows(t.name),chosen=new Set(multiple?value||[]:value?[value]:[]);
  const wrap=node("div",null,"governance-reference"),list=node("div"),q=field("Find "+human(k),"search"),select=node("select"),note=node("p","","small");
  select.setAttribute("aria-label",human(k));function paint(){list.replaceChildren();for(const id of chosen){const r=pool.find(x=>x.id===id),line=node("div",null,"programme-chip");
   line.append(node("span",title(r)+(r?.archived?" · archived":"")),button("Remove",()=>{chosen.delete(id);paint();wrap.dispatchEvent(new Event("input",{bubbles:true}));}));list.append(line);}
   if(!chosen.size)list.append(node("span","No selection","small"));}
  function options(){select.replaceChildren();const first=node("option","Select original record");first.value="";select.append(first);
   const matches=pool.filter(r=>r.id!==exclude&&!r.archived&&(!q.input.value||title(r).toLowerCase().includes(q.input.value.toLowerCase())));
   for(const r of matches.slice(0,100)){const opt=node("option",title(r)+(r.status?" · "+r.status:""));opt.value=r.id;select.append(opt);}
   note.textContent=matches.length>100?matches.length+" matches; refine the search to choose any original.":matches.length+" original records";}
  q.input.addEventListener("input",options);select.addEventListener("change",()=>{if(!select.value)return;if(!multiple)chosen.clear();chosen.add(select.value);select.value="";paint();wrap.dispatchEvent(new Event("input",{bubbles:true}));});
  wrap.append(list,q.wrapper,select,note);paint();options();return {wrapper:wrap,read:()=>multiple?[...chosen]:[...chosen][0]||null};}
 function sourceReferences(values,s,signal){
  const chosen=new Map((values||[]).map(v=>[v.sourceId+":"+v.entityKey,v])),wrap=node("div"),list=node("div"),search=field("Find original source record","search"),result=node("div");let serial=0;
  function paint(){list.replaceChildren();for(const [k,v]of chosen){const chip=node("div",null,"programme-chip");chip.append(node("span",v.sourceId.slice(0,12)+" / "+v.entityKey.slice(0,12)),
   button("Remove",()=>{chosen.delete(k);paint();wrap.dispatchEvent(new Event("input",{bubbles:true}));}));list.append(chip);}}
  async function findPage(offset=0){const generation=++serial,query=new URLSearchParams({...s,table:"entities",offset,limit:50,search:search.input.value});query.delete("snapshot");
   const r=await api("/api/rows?"+query,{signal});if(generation!==serial||signal.aborted)return;if(r.snapshot!==s.snapshot)throw Error("The selected original source revision differs.");
   result.replaceChildren(table(["Original record","Select"],r.rows.map(row=>[row.title||row.originalId||row.entityKey,
    button("Use source",()=>{chosen.set(row.sourceId+":"+row.entityKey,{sourceId:row.sourceId,entityKey:row.entityKey,sha256:row.sha256});paint();wrap.dispatchEvent(new Event("input",{bubbles:true}));})])));
   const nav=node("div",null,"actions");if(offset)nav.append(button("Previous",()=>findPage(Math.max(0,offset-50))));if(r.nextOffset!==null)nav.append(button("Next",()=>findPage(r.nextOffset)));result.append(nav);}
  wrap.append(list,search.wrapper,button("Search",()=>findPage()),result);paint();return {wrapper:wrap,read:()=>[...chosen.values()]};}
 function control(name,k,spec,value,s,record,signal){
  const wrap=node("fieldset",null,"governance-field");wrap.append(node("legend",human(k)));let child;
  const bare=typeof spec==="string"?spec.replace(/\?$/,""):"";
  if(Array.isArray(spec)){const x=field(human(k),"select",value??"",[["","Choose"],...spec.map(v=>[v,human(v)])]);child={wrapper:x.wrapper,read:()=>x.input.value};}
  else if(bare==="id"||bare==="ids")child=reference(name,k,value,bare==="ids",k==="supersedesId"?record?.id:null);
  else if(bare==="sources")child=sourceReferences(value,s,signal);
  else if(bare==="members"){
   const items=node("div"),entries=[];function add(v={}){const box=node("section",null,"governance-member"),controls={};
    for(const key of ["name","role","organization","notes"]){controls[key]=field(human(key),key==="notes"?"textarea":"text",v[key]||"");box.append(controls[key].wrapper);}
    const e={box,controls};entries.push(e);box.append(button("Remove member",()=>{entries.splice(entries.indexOf(e),1);box.remove();wrap.dispatchEvent(new Event("input",{bubbles:true}));}));items.append(box);}
   for(const v of value||[])add(v);const body=node("div");body.append(items,button("Add actual member",()=>{add();wrap.dispatchEvent(new Event("input",{bubbles:true}));}));
   child={wrapper:body,read:()=>entries.map(e=>Object.fromEntries(Object.entries(e.controls).map(([key,x])=>[key,x.input.value])))};
  }else if(bare==="strings"){
   const x=field(human(k)+" — one exact entry per line","textarea",(value||[]).join("\n"));
   child={wrapper:x.wrapper,read:()=>x.input.value===""?[]:x.input.value.split(/\r?\n/).filter(x=>x!=="")};
  }else {const x=field(human(k),bare==="date"?"date":bare==="text"?"textarea":"text",value??"");
   if(bare==="text")wrap.classList.add("full");
   child={wrapper:x.wrapper,read:()=>x.input.value===""&&String(spec).endsWith("?")?null:x.input.value};}
  wrap.append(child.wrapper);return {wrapper:wrap,read:child.read};}
 function defaultFields(name,row,following){const specs=U.schema.fields[name],out={};
  for(const [k,spec]of Object.entries(specs)){
   if(row&&Object.hasOwn(row,k))out[k]=copy(row[k]);else if(["ids","strings","sources","members"].includes(spec))out[k]=[];
   else if(spec==="text")out[k]="";else if(typeof spec==="string"&&spec.endsWith("?"))out[k]=null;
  }
  if(!row){out.nodeId=U.nodeId||undefined;out.grantId=U.grantId||null;out.status="draft";}
  if(following){out.supersedesId=row.id;out.status="draft";out.recordedDate=null;}
  return out;}
 async function edit(name,row=null,following=false,retained=null){
  if(!editable())throw Error("Open the current portfolio revision before editing governance.");
  const pendingKey=cache("pending"),draftKey=cache("draft");
  const s=retained?.selection||selected(),id=retained?.id||(following||!row?crypto.randomUUID():row.id);
  const expectedRevision=retained?.expectedRevision??(following||!row?0:row.revision),values=retained?.fields||defaultFields(name,row,following);
  const D=openDialog((following?"Following edition — ":row?"Edit draft — ":"New ")+names[name]);if(!D)return;
  const actor=field("Recording actor","text",retained?.actor||p().review?.reviewer||""),form=node("form"),grid=node("div",null,"governance-grid"),controls={};
  form.id="governance-editor";form.append(node("p","Changes save through the original portfolio. Recorded editions freeze their exact evidence; this form does not grant native approval.","small"),actor.wrapper);
  for(const [k,spec]of Object.entries(U.schema.fields[name])){controls[k]=control(name,k,spec,values[k],s,row,D.signal);grid.append(controls[k].wrapper);}
  form.append(grid);const buttons=node("div",null,"actions"),save=button("Save original revision",()=>submit()),draft=button("Keep working draft",()=>retainDraft(true));save.id="governance-save";
  buttons.append(draft,save,button("Download working draft",()=>{const value=draftValue();jsonDownload("Governance_Working_Draft.json",value);}));form.append(buttons);D.body.append(form);
  function fields(){return Object.fromEntries(Object.entries(controls).map(([k,c])=>[k,c.read()]));}
  function draftValue(){return {selection:s,collection:name,id,expectedRevision,actor:actor.input.value,fields:fields()};}
  function retainDraft(tell=false){saveLocal("draft",draftValue());if(tell){D.status.hidden=false;D.status.textContent="Complete working fields retained on this browser. They are not a saved portfolio revision.";}}
  form.addEventListener("input",()=>{U.dirty=true;try{retainDraft();}catch(e){errorAt(D.status,e);}});
  form.addEventListener("submit",e=>{e.preventDefault();submit();});
  async function submit(){if(U.busy)return;try{check(s);retainDraft();const frozen=draftValue();
    if(!frozen.actor.trim())throw Error("Name the actual recording actor.");
    if(frozen.fields.status==="recorded"&&!confirm("Record this complete edition and freeze its original evidence? Later corrections will be following editions."))return;
    const governance={schema:"stellar-forge.grant-governance.v1",expectedGovernanceRevision:model()?.revision||0,actor:frozen.actor,
     changes:[{collection:name,id,expectedRevision,fields:frozen.fields}]};
    const {name:portfolioName,notes,sources,review}=p().definition;
    const request={operationId:"governance-"+crypto.randomUUID(),action:"portfolio.save",payload:{id:s.portfolioId,
     expectedPortfolioRevision:s.revision,name:portfolioName,notes,sources,review,governance}};
    saveLocal("pending",{selection:s,request});const savedPending=localStorage.getItem(pendingKey),savedDraft=localStorage.getItem(draftKey);busy(true);
    const result=await runOriginal(request);removeIfUnchanged(pendingKey,savedPending);removeIfUnchanged(draftKey,savedDraft);U.dirty=false;closeDialog(true);await render();return result;
   }catch(e){errorAt(D.status,e);}finally{busy(false);}}
  U.dirty=!!retained;
 }
 async function recover(){const pendingKey=cache("pending"),draftKey=cache("draft"),original=readSaved("pending");if(!original)return;
  const pendingText=localStorage.getItem(pendingKey),draftText=localStorage.getItem(draftKey);
  const req=original.request;if(!req||req.action!=="portfolio.save"||req.payload?.id!==p().id||!req.payload.governance||typeof req.operationId!=="string")throw Error("Keep the complete original pending governance request.");
  const D=openDialog("Original saved governance request");if(!D)return;
  D.body.append(node("p","Retry sends this exact original identity. The original writer returns its saved result before checking later revisions."),
   button("Inspect original outcome",async()=>{try{const receipt=await api("/api/request?id="+encodeURIComponent(req.operationId),{signal:D.signal});
    if(D.signal.aborted)return;D.body.append(rawDetails("Original operation receipt",receipt));
    if(receipt.id!==req.operationId)throw Error("The original request identity differs.");
    if(receipt.state==="FAILED"){D.body.append(button("Keep failed request and unlock a reviewed successor",async()=>{
      if(U.busy)return;busy(true);try{
       const current=await api("/api/request?id="+encodeURIComponent(req.operationId),{signal:D.signal});
       if(current.id!==req.operationId||current.state!=="FAILED"||current.inputSha256!==receipt.inputSha256)
        throw Error("The original request outcome changed. Keep its pending identity and inspect the current outcome.");
       if(localStorage.getItem(pendingKey)!==pendingText)
        throw Error("Another tab changed the retained pending request. Keep its complete current identity.");
       jsonDownload("Governance_Failed_Request_"+req.operationId+".json",{request:req,receipt:current});
       localStorage.setItem(pendingKey+":failed:"+req.operationId+":"+crypto.randomUUID(),JSON.stringify({request:req,receipt:current}));
       removeIfUnchanged(pendingKey,pendingText);closeDialog(true);await render();
      }catch(e){errorAt(D.status,e);}finally{busy(false);}
    }));}
   }catch(e){errorAt(D.status,e);}}),
   rawDetails("Complete original request",req),button("Continue original request",async()=>{if(U.busy)return;busy(true);try{
    await runOriginal(req);removeIfUnchanged(pendingKey,pendingText);removeIfUnchanged(draftKey,draftText);closeDialog(true);await render();
   }catch(e){errorAt(D.status,e);}finally{busy(false);}}));
 }
 async function archiveDraft(name,row){
  const original=selected(),pendingKey=cache("pending"),D=openDialog("Archive the original working draft");if(!D)return;
  const who=field("Recording actor","text",p().review?.reviewer||""),reason=field("Archive reason","textarea","");
  D.body.append(who.wrapper,reason.wrapper,button("Archive draft",async()=>{if(U.busy)return;try{check(original);
    if(!who.input.value.trim()||!reason.input.value.trim())throw Error("Retain the actual actor and archive reason.");
    const {name:portfolioName,notes,sources,review}=p().definition,request={operationId:"governance-"+crypto.randomUUID(),action:"portfolio.save",
     payload:{id:original.portfolioId,expectedPortfolioRevision:original.revision,name:portfolioName,notes,sources,review,
      governance:{schema:"stellar-forge.grant-governance.v1",expectedGovernanceRevision:model().revision,actor:who.input.value,
       archive:[{collection:name,id:row.id,expectedRevision:row.revision,reason:reason.input.value}]}}};
    saveLocal("pending",{selection:original,request});const savedPending=localStorage.getItem(pendingKey);busy(true);await runOriginal(request);
    removeIfUnchanged(pendingKey,savedPending);closeDialog(true);await render();
   }catch(e){errorAt(D.status,e);}finally{busy(false);}}));
  D.body.addEventListener("input",()=>{U.dirty=true;});
 }
 async function detail(name,row){
  const s=selected(),D=openDialog(names[name]+" — "+title(row));if(!D)return;
  D.body.append(node("p","Edition "+row.revision+" · "+row.status+" · "+row.sha256,"small"),
   rawDetails("Complete original record",row));
  const actions=node("div",null,"actions");
  if(editable()&&!row.archived)actions.append(button(row.publication?"Create following edition":"Edit draft",()=>{if(closeDialog())return edit(name,row,!!row.publication);}));
  if(editable()&&!row.archived&&!row.publication)actions.append(button("Archive draft",()=>archiveDraft(name,row)));
  actions.append(button("Download selected record",()=>jsonDownload("Governance_"+name+"_"+row.id+".json",{schema:"stellar-forge.governance-record-export.v1",selection:s,collection:name,record:row})));
  D.body.append(actions);
  try{const q=new URLSearchParams({portfolioId:s.portfolioId,revision:s.revision,collection:name,id:row.id});
   const [history,review]=await Promise.all([api("/api/governance/history?"+q,{signal:D.signal}),api("/api/governance/review?"+q,{signal:D.signal})]);
   if(D.signal.aborted)return;if(history.snapshot!==s.snapshot||review.snapshot!==s.snapshot)throw Error("The selected complete history differs.");
   D.body.append(rawDetails("Original history and request identities",history),rawDetails("Recorded basis, dependencies and following records",review));
   if(row.publication){const basis=row.publication.basis;D.body.append(node("h3","Frozen review position"),
    node("p","Portfolio revision "+basis.portfolioRevision+" · Programme revision "+basis.programmeRevision+" · "+basis.at),
    rawDetails("Complete original position",basis.position),
    table(["Evidence register","Original edition","SHA"],row.publication.programmeRecords.map(x=>[human(x.collection),title(x.record)+" · "+x.record.revision,x.record.sha256])),
    button("Download complete review/history",()=>jsonDownload("Governance_Review_"+row.id+".json",{review,history})));}
  }catch(e){if(!D.signal.aborted)errorAt(D.status,e);}
 }
 function childrenNodes(id){const set=new Set(id?[id]:prows("nodes").map(r=>r.id));let again=true;while(again){again=false;for(const r of prows("nodes"))if(set.has(r.parentId)&&!set.has(r.id)){set.add(r.id);again=true;}}return set;}
 function matching(r){const scope=childrenNodes(U.nodeId);return scope.has(r.nodeId)&&(!U.grantId||r.grantId===U.grantId)&&
  (U.archived||!r.archived)&&(!U.search||JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k])=>k!=="publication"))).toLowerCase().includes(U.search.toLowerCase()));}
 function searchControls(container){
  const bar=node("div",null,"governance-filters"),reg=field("Register","select",U.register,[["queue","Follow-through queue"],...Object.entries(names)]),
   scope=field("Programme / project","select",U.nodeId,[["","All scopes"],...prows("nodes").map(r=>[r.id,title(r)])]),
   grant=field("Grant","select",U.grantId,[["","All grants"],...prows("grants").filter(r=>!U.nodeId||childrenNodes(U.nodeId).has(r.projectId)).map(r=>[r.id,title(r)])]),
   q=field("Search complete records","search",U.search),archive=field("Include archived drafts","checkbox");archive.input.checked=U.archived;
  for(const [x,k]of [[reg,"register"],[scope,"nodeId"],[grant,"grantId"]])x.input.addEventListener("change",()=>{U[k]=x.input.value;U.offset=0;if(k==="nodeId")U.grantId="";render().catch(failure);});
  archive.input.addEventListener("change",()=>{U.archived=archive.input.checked;render().catch(failure);});
  q.input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();U.search=q.input.value;U.offset=0;render().catch(failure);}});
  bar.append(reg.wrapper,scope.wrapper,grant.wrapper,q.wrapper,button("Search",()=>{U.search=q.input.value;U.offset=0;return render();}),archive.wrapper);container.append(bar);
 }
 async function renderConsole(container,epoch){
  container.append(heading("Governance and evaluation","Steering decisions, supplied evaluator findings and accountable management responses, with the original programme evidence retained."));
  if(!p()||!programme()){container.append(panel("Select an original programme","Create or receive the original programme in Programme delivery first."));return;}
  U.schema ||= await api("/api/governance/schema");
  if(epoch!==state().epoch)return;
  const tools=node("div",null,"actions");
  const draft=readSaved("draft"),pending=readSaved("pending");
  if(draft)tools.append(button("Reopen working draft",()=>edit(draft.collection,null,false,draft)));
  if(draft&&editable()&&draft.selection.snapshot!==p().snapshot)tools.append(button("Review working draft against current revision",()=>{
   const current=find(draft.collection,draft.id),D=openDialog("Review original draft against current saved revision");if(!D)return;
   D.body.append(rawDetails("Complete retained working draft",draft),rawDetails("Actual current record",current||null),
    node("p","The following explicit replacement uses this selected portfolio's current source and record revisions. Existing recorded editions stay unchanged."),
    button(current?.publication?"Make reviewed following draft":"Use reviewed current revision",()=>{
     const next={...copy(draft),selection:selected(),expectedRevision:current?.publication?0:current?.revision||0,
      id:current?.publication?crypto.randomUUID():draft.id,
      fields:{...copy(draft.fields),...(current?.publication?{supersedesId:current.id,status:"draft",recordedDate:null}:{})}};
     saveLocal("draft",next);if(closeDialog())return edit(next.collection,null,false,next);
    }));
  }));
  if(pending)tools.append(button("Continue original saved request",recover));
  if(editable())tools.append(button("Import original CSV/JSON",()=>{if(closeDialog())return exchange.open(U.register,{nodeId:U.nodeId,grantId:U.grantId});}));
  const exchangeScope=()=>({...U.nodeId?{nodeId:U.nodeId}:{},...U.grantId?{grantId:U.grantId}:{}});
  if(U.register!=="queue")tools.append(button("Export complete register CSV",()=>exchange.export(U.register,"csv",exchangeScope())));
  tools.append(button("Export complete register JSON",()=>exchange.export(U.register,"json",exchangeScope())));
  tools.append(button("Download current governance",()=>jsonDownload("Governance_Registers.json",{schema:"stellar-forge.governance-register-export.v1",selection:selected(),governance:model()||null})),
   button("Complete portable handoff",async()=>{const s=selected(),r=await action("portfolio.export",{portfolioId:s.portfolioId,revision:s.revision});await download("/api/export?id="+r.sha256,r.filename);}));
  container.append(tools);searchControls(container);
  const total=Object.values(model()?.records||{}).flat();const metrics=node("div",null,"metrics");metrics.append(metric(total.length,"Retained editions"),
   metric(total.filter(r=>r.publication).length,"Recorded editions"),metric(total.filter(r=>r.status==="draft"&&!r.archived).length,"Working records"));container.append(metrics);
  if(!currentEdit())container.append(node("p","This is an exact historical portfolio revision. Read and download it, or select the latest revision to edit.","small"));
  if(U.register==="queue"){
   if(!model()){container.append(panel("Begin with actual committee or evaluation records","Choose a register to create its first draft. No attendees, policy, findings or authority are inferred."));return;}
   const selectedQueue=selected(),queueKey=JSON.stringify(selectedQueue);let all;
   if(U.queue?.key===queueKey)all=U.queue.rows;
   else{
    all=[];const seen=new Set();let offset=0,total=null;
    for(;;){
     const query=new URLSearchParams({portfolioId:selectedQueue.portfolioId,revision:selectedQueue.revision,table:"governance_follow_through",offset,limit:250});
     const data=await api("/api/rows?"+query);if(epoch!==state().epoch)return;
     if(data.snapshot!==selectedQueue.snapshot||data.revision!==selectedQueue.revision||data.offset!==offset||
       !Array.isArray(data.rows)||data.rows.length>250||!Number.isSafeInteger(data.total)||data.total<0||data.total>50000||
       (total!==null&&data.total!==total))throw Error("The complete follow-through selection changed.");
     total=data.total;
     for(const row of data.rows){const id=row.collection+":"+row.reference.id;if(seen.has(id))throw Error("The original follow-through page repeats a record.");seen.add(id);all.push(row);}
     if(data.nextOffset===null){if(all.length!==total)throw Error("The full follow-through register is incomplete.");break;}
     if(data.nextOffset!==offset+data.rows.length||data.nextOffset<=offset)throw Error("The original follow-through cursor did not advance.");
     offset=data.nextOffset;
    }
    if(epoch!==state().epoch)return;U.queue={key:queueKey,rows:all};
   }
   const found=all.filter(matching);U.offset=Math.min(U.offset,Math.floor(Math.max(0,found.length-1)/50)*50);
   const visible=found.slice(U.offset,U.offset+50);container.append(table(["Original item","Owner / due","Review state","Responses / reviews","Open"],visible.map(r=>[
    r.title,[r.owner,r.dueDate].filter(Boolean).join(" · "),r.state,
    r.responses.length+" responses · "+r.followups.length+" follow-through reviews",
    button("Open original",()=>detail(r.collection,find(r.collection,r.reference.id)))])));
   container.append(node("p","Recorded review outcomes do not automatically resolve programme issues or complete milestones. Open a record to compare current linked actions with the frozen reviewed editions.","small"));
   const nav=node("div",null,"actions");nav.append(node("span",found.length+" matching complete records","small"));if(U.offset)nav.append(button("Previous",()=>{U.offset=Math.max(0,U.offset-50);return render();}));
   if(U.offset+50<found.length)nav.append(button("Next",()=>{U.offset+=50;return render();}));container.append(nav);
  }else{
   const name=U.register,found=rows(name).filter(matching),part=found.slice(U.offset,U.offset+50),box=panel(names[name]);
   if(editable()){const add=button("New "+names[name].toLowerCase(),()=>edit(name));add.id="governance-new";box.append(add);}
   box.append(table(["Record","Scope","Owner","Edition","Status","Open"],part.map(r=>[title(r),title(prows("nodes").find(n=>n.id===r.nodeId)),r.owner,
    String(r.revision)+(r.supersedesId?" · following":""),r.archived?"Archived draft":r.status,button("Open",()=>detail(name,r))])));
   const nav=node("div",null,"actions");nav.append(node("span",found.length+" matching complete records","small"));if(U.offset)nav.append(button("Previous",()=>{U.offset=Math.max(0,U.offset-50);return render();}));
   if(U.offset+50<found.length)nav.append(button("Next",()=>{U.offset+=50;return render();}));box.append(nav);container.append(box);
  }
 }
 window.addEventListener("beforeunload",e=>{if(U.dirty||U.busy){e.preventDefault();e.returnValue="";}});
 return Object.freeze({render:renderConsole,close:async()=>{if(!closeDialog())throw Error("Keep the current governance draft or operation open.");await exchange.close();}});
}
