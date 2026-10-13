"use strict";
window.propertyReviewHost=function(C){
 const {n,main,panel,grid,field,button,actions,show,task,api,refresh,render,actor,uid,copy,canonical,branch,branchKey,branchUrl,originalBranch,dbp,get,put,list,digestBytes,send,records,caption,fileLink}=C;
 const owner=()=>({workspaceId:C.current().state.id,workspaceDirectory:C.current().directory});
 const prefix=()=> "review-draft:"+branch()+":";
 const current=C.current;
 function details(label,value){
  const box=n("details"),summary=n("summary",label);box.append(summary);let loaded=false;
  box.addEventListener("toggle",()=>{if(box.open&&!loaded){box.append(n("pre",typeof value==="string"?value:JSON.stringify(value,null,2)));loaded=true;}});
  return box;
 }
 const format=x=>x===null?"No recorded decision":JSON.stringify(x,null,2);
 function download(name,value){const raw=new Blob([JSON.stringify(value,null,2)],{type:"application/json"}),url=URL.createObjectURL(raw),a=n("a","",{href:url,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function roleLink(id,file){return n("a",file.role==="issued_html"?"Download independent reviewer HTML":file.role==="issued_json"?"Download exact issued JSON":"Download exact returned file",{href:branchUrl("/api/review-file?id="+encodeURIComponent(id)+"&role="+encodeURIComponent(file.role))});}
 function fileRows(id,files){return grid(["Original file","Bytes","Open"],(files||[]).map(d=>[d.name,d.bytes.toLocaleString(),roleLink(id,d)]));}
 function draftState(values,revision){return {revision,values:copy(values),pendingRequestId:null};}
 function sameDraft(a,b){return a&&b&&a.revision===b.revision&&canonical(a.values)===canonical(b.values);}
 async function mutateDraft(key,base,values,operation){
  const db=await dbp;
  return new Promise((resolve,reject)=>{
   const t=db.transaction("records","readwrite"),s=t.objectStore("records"),q=s.get(key);let result,conflict;
   q.onsuccess=()=>{
    const saved=q.result?.value||base;
    if(!sameDraft(saved,base)){
     conflict={schema:"bluewave.review-draft-conflict.v1",id:uid(),key,at:new Date().toISOString(),current:copy(saved),candidate:{...copy(base),values:copy(values)}};
     s.put({key:"review-recovery:"+branchKey(base.workspaceId,base.workspaceDirectory)+":"+conflict.id,value:conflict});
     return;
    }
    result={...copy(saved),values:copy(values)};
    if(operation){
     if(saved.pendingRequestId){conflict={pending:true};return;}
     result.pendingRequestId=operation.command.requestId;
     s.put({key:"request:"+branchKey(operation.workspaceId,operation.workspaceDirectory)+":"+operation.command.requestId,value:operation});
    }
    s.put({key,value:result});
   };
   t.oncomplete=()=>conflict?reject(Error(conflict.pending?"Recover this draft's original pending request in Saved requests first.":"Another tab saved different values. Both complete drafts are retained in Assigned reviews → Draft recovery.")):resolve(result);
   t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error("Draft write interrupted; preserve the visible values."));
  });
 }
 async function form(title,key,initial,builder,kind,toBody,revision=current().revision){
  const selected=owner();let d=await get(key)||{...draftState(initial,revision),...selected};
  // Existing drafts predate no change of branch; every effect still checks this captured owner.
  d={...d,...selected};main.replaceChildren();const p=panel(title),f=n("form"),status=n("p","Draft based on revision "+d.revision,{class:"muted"});f.onsubmit=e=>e.preventDefault();
  const controls=await builder(copy(d.values),f),queue={tail:Promise.resolve()},memory={value:null,error:null};
  async function save(){
   let values;try{values=controls.get();}catch(e){memory.error=e;throw e;}memory.value=copy(values);
   const run=queue.tail.catch(()=>{}).then(async()=>{
    originalBranch(selected);
    if(Object.hasOwn(values,"id"))values.id=d.values.id;
    try{d=await mutateDraft(key,d,values);memory.error=null;status.textContent="Draft saved on this device · revision "+d.revision;return copy(d);}
    catch(e){memory.error=e;status.textContent=e.message+" Download the visible draft before closing.";throw e;}
   });queue.tail=run;return run;
  }
  f.oninput=()=>save().catch(e=>show(e.message,true));f.onchange=()=>save().catch(e=>show(e.message,true));
  const commit=button(kind==="review.issue"?"Issue complete reviewer copy":"Save explicit review adoption",async()=>{
   originalBranch(selected);const submitted=await save();
   if(submitted.pendingRequestId)throw Error("Recover the original pending request in Saved requests first.");
   if(submitted.revision!==current().revision)throw Error("The workspace changed. Review the current source/comparison before saving.");
   const r={...selected,revision:submitted.revision,command:{requestId:uid(),kind,actor:actor(),at:new Date().toISOString(),body:toBody(copy(submitted.values))},draftKey:key,submitted:copy(submitted.values)};
   if(kind==="review.issue")r.preparation=copy(r.command);
   d=await mutateDraft(key,d,d.values,r);
   try{await send(r);await screen();}
   finally{d=await get(key)||{...draftState({...copy(submitted.values),id:uid()},r.result?.revision??submitted.revision),...selected};}
  });
  p.append(f,status,actions(commit,button("Download visible draft",async()=>download("Property_Review_Draft.json",{schema:"bluewave.review-draft-recovery.v1",...selected,revision:d.revision,values:controls.get(),saved:d,error:memory.error?.message||null})),button("Keep draft and return",async()=>{await save();await screen();})));
  if(kind==="review.issue")p.append(button("Review latest workspace revision",async()=>{
   await queue.tail.catch(()=>{});originalBranch(selected);await refresh();originalBranch(selected);
   const latest=await get(key)||d;if(latest.pendingRequestId)throw Error("Recover or release the original request first.");
   const changed={...latest,revision:current().revision};const saved=await mutateDraft(key,d,latest.values);d=saved;
   // Revision update is itself guarded in one transaction.
   const db=await dbp;await new Promise((resolve,reject)=>{const t=db.transaction("records","readwrite"),s=t.objectStore("records"),r=s.get(key);r.onsuccess=()=>{const v=r.result?.value;if(!sameDraft(v,d)||v.pendingRequestId){t.abort();return;}s.put({key,value:{...v,revision:changed.revision}});};t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(Error("The draft changed; reopen its complete saved values."));});
   d={...d,revision:changed.revision};status.textContent="Current revision "+d.revision+" selected. Review all assigned findings and reviewer before issuing.";
  }));
  main.append(p);return {save};
 }
 async function issue(reconciliationId,selectedIds=[]){
  const key=prefix()+"issue:"+reconciliationId;
  await form("Assign discrepancy review",key,{id:uid(),reconciliationId,findingIds:selectedIds,reviewer:{id:"",name:""},note:""},async(v,f)=>{
   const name=field("Assigned reviewer name",v.reviewer.name),reference=field("Assigned reviewer reference",v.reviewer.id),note=field("Assignment notes",v.note,"textarea");
   f.append(name.wrapper,reference.wrapper,note.wrapper);
   const picked=new Set(v.findingIds),area=n("section"),count=n("p");let offset=0;
   async function page(at){
    const r=await api("/api/findings/"+reconciliationId+"?offset="+at+"&limit=100");offset=at;area.replaceChildren();count.textContent=picked.size+" selected findings";
    const rows=r.findings.map(x=>{const choice=field("Assign this finding",picked.has(x.id),"checkbox");choice.el.onchange=()=>{choice.get()?picked.add(x.id):picked.delete(x.id);count.textContent=picked.size+" selected findings";};return[choice.wrapper,x.code,x.severity,x.message,details("Full original finding",x)];});
    const prev=button("Previous findings",()=>page(Math.max(0,offset-100))),next=button("Next findings",()=>page(r.nextOffset??offset));prev.disabled=offset===0;next.disabled=r.nextOffset===null;
    area.append(n("p",r.total+" original findings · showing "+(offset+1)+"–"+(offset+r.findings.length)),grid(["Assign","Finding","Severity","Description","Original details"],rows),actions(prev,next));
   }
   f.append(count,area);await page(0);
   return{get:()=>({...v,findingIds:[...picked],reviewer:{id:reference.get(),name:name.get()},note:note.get()})};
  },"review.issue",v=>v);
 }
 async function retainPrepared(key,candidate){
  const db=await dbp;return new Promise((resolve,reject)=>{const t=db.transaction("records","readwrite"),store=t.objectStore("records"),q=store.get(key);let value,error;
   q.onsuccess=()=>{value=q.result?.value||candidate;if(canonical(value.prepared.file)!==canonical(candidate.prepared.file)){error=Error("The original prepared file metadata differs. Open its saved plan.");return;}if(!q.result)store.put({key,value});};
   t.oncomplete=()=>error?reject(error):resolve(value);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);
  });
 }
 async function renewPrepared(entry){
  originalBranch(entry);const requestKey="request:"+branchKey(entry.workspaceId,entry.workspaceDirectory)+":"+entry.requestId,prior=await get(requestKey);
  if(!prior?.error?.notCommitted||prior.result)throw Error("Only a definitely rejected original receiving request can be replaced after review.");
  if(await api("/api/request/"+entry.requestId)!==null)throw Error("The original request has a saved result; recover it first.");
  const revision=current().revision,prepared=await api("/api/review-prepare-return",{...owner(),file:entry.prepared.file,expectedRevision:revision});
  const next={...owner(),revision,prepared,requestId:uid(),id:uid(),at:new Date().toISOString(),actor:actor(),previousPlans:[...(entry.previousPlans||[]),{requestId:entry.requestId,id:entry.id,revision:entry.revision,at:entry.at}]};
  const key="review-prepared-return:"+branch()+":"+entry.prepared.file.sha256,db=await dbp;
  await new Promise((resolve,reject)=>{const t=db.transaction("records","readwrite"),store=t.objectStore("records"),q=store.get(key);q.onsuccess=()=>{if(q.result?.value.requestId!==entry.requestId){t.abort();return;}store.put({key,value:next});};t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(Error("Another tab changed the prepared return. Reopen its saved plan."));});
  await screen();show("A new explicit receiving attempt is prepared against revision "+revision+". The original rejection remains in Saved requests.");
 }
 async function receiveScreen(){
  main.replaceChildren();const p=panel("Receive reviewer work","Retain the complete original JSON or HTML, including all named editions, unfinished controls and attached evidence. No finding decision changes during receiving.");
  const selected=owner(),file=field("Complete returned reviewer JSON or HTML","","file");file.el.accept=".json,.html,.htm";const resultArea=n("div");p.append(file.wrapper,button("Inspect and retain complete return",async()=>{
   originalBranch(selected);const chosen=file.el.files[0];if(!chosen)throw Error("Select a complete returned file.");if(chosen.size>64*1024*1024)throw Error("Complete returned file exceeds 64 MiB.");
   const bytes=await chosen.arrayBuffer(),sha=await digestBytes(bytes),revision=current().revision;
   originalBranch(selected);const query=new URLSearchParams({name:chosen.name,mediaType:chosen.type||(/\.html?$/i.test(chosen.name)?"text/html":"application/json"),expectedRevision:String(revision)});
   const response=await fetch("/api/review-return/"+sha+"?"+query,{method:"PUT",headers:{"X-Workspace-Token":sessionStorage.getItem("bw-token")||"","X-Workspace-Id":selected.workspaceId,"X-Workspace-Directory":selected.workspaceDirectory},body:bytes});
   const prepared=await response.json();if(!response.ok)throw Error(prepared.error?.message||"Return preparation failed.");if(prepared.file.sha256!==sha||prepared.file.bytes!==bytes.byteLength)throw Error("Returned file identity changed.");
   const k="review-prepared-return:"+branchKey(selected.workspaceId,selected.workspaceDirectory)+":"+sha,entry=await retainPrepared(k,{...selected,revision,prepared,requestId:uid(),id:uid(),at:new Date().toISOString(),actor:actor()});
   resultArea.replaceChildren(details("Complete return preview",prepared),button("Record this complete return",()=>receivePrepared(entry)));
  }),resultArea);main.append(p);
 }
 async function receivePrepared(entry){
  originalBranch(entry);const k="request:"+branchKey(entry.workspaceId,entry.workspaceDirectory)+":"+entry.requestId;
  let r=await get(k);
  if(!r){r={workspaceId:entry.workspaceId,workspaceDirectory:entry.workspaceDirectory,revision:entry.revision,command:{requestId:entry.requestId,kind:"review.receive",actor:entry.actor,at:entry.at,body:{id:entry.id,file:entry.prepared.file}}};await put(k,r);}
  await send(r);await screen();
 }
 async function open(id){
  const result=await api("/api/review-exchanges?id="+encodeURIComponent(id)),v=result.view,r=v.record;main.replaceChildren();
  const p=panel(r.kind==="review.issue"?"Assigned reviewer copy":r.kind==="review.receive"?"Returned reviewer work":"Recorded adoption",r.actor.name+" · "+r.createdAt);
  p.append(fileRows(id,v.files),details("Original command and result",r));
  if(v.issue){
   p.append(n("h3","Assignment"),details("Reviewer and original selection",v.issue.request),details("Complete original reconciliation",v.issue.reconciliation),details("Source and mapping editions",{sources:v.issue.sources,mappings:v.issue.mappings,approvals:v.issue.approvals}),grid(["Finding","Severity","Original decision","Source comparison"],v.issue.items.map(x=>[x.finding.code,x.finding.severity,details("Issued decision",x.baselineDecision),details("Complete finding and rows",x)])),n("h3","Complete original files"),grid(["File","Bytes","Download"],v.issue.files.map(d=>[d.name,d.bytes,fileLink(d)])));
  }
  if(v.return){
   p.append(details("Retained unfinished draft",v.return.draft),grid(["Named edition","Reviewer","Saved","Actions"],v.return.editions.map(e=>[e.name,e.actor.name,e.at,actions(button("Compare with current decisions",()=>compare(id,e.id)),details("Complete named decisions",e))])));
   if(!v.return.editions.length)p.append(n("p","This return contains unfinished work only. Preserve it and return it to the reviewer; no draft is available for adoption."));
   p.append(grid(["New evidence","Bytes","Download"],v.return.files.map(d=>[d.name,d.bytes,fileLink(d)])));
  }
  if(v.historical)p.append(details("Exact historical adoption comparison",v.historical),button("Open readable historical comparison",()=>compare(r.body.returnId,r.body.editionId,r.id)));
  p.append(button("Back to assigned reviews",screen));main.append(p);
 }
 async function compare(returnId,editionId,adoptionId){
  if(!adoptionId){
   const pending=(await list("request:"+branch()+":")).map(x=>x.value).find(r=>r.command.kind==="review.adopt"&&r.command.body.returnId===returnId&&!r.result&&!r.error?.notCommitted);
   if(pending)throw Error("Recover the original adoption request "+pending.command.requestId+" in Saved requests before another decision on this return.");
  }
  const q=new URLSearchParams({returnId,editionId,...(adoptionId?{adoptionId}:{})}),r=await api("/api/review-compare?"+q),v=r.comparison;
  const rows=n("section");
  if(r.readOnly){
   main.replaceChildren();const p=panel("Historical adopted review","This is the complete comparison and supervisor decision used at that recorded adoption.");
   p.append(grid(["Finding","Issued","Then-current","Reviewer","Recorded choice"],v.rows.map(x=>[x.finding.code,details("Issued",x.baselineDecision),details("Current at adoption",x.currentDecision),details("Returned",x.returnedDecision),details("Choice",r.adoption.body.choices.find(c=>c.findingId===x.findingId))])),details("Original adoption",r.adoption),details("Current workspace decisions (separate)",r.current),button("Back",screen));main.append(p);return;
  }
  const key=prefix()+"adopt:"+returnId+":"+editionId+":"+v.reviewSha256;
  await form("Review returned decisions",key,{id:uid(),returnId,editionId,reviewSha256:v.reviewSha256,choices:v.rows.map(x=>({findingId:x.findingId,action:"",resolution:""}))},async(values,f)=>{
   f.append(n("p","Compare every original, current and returned decision. Keeping leaves the current decision unchanged. Applying creates an attributed decision through the original finding workflow."),n("p","Current workspace revision "+r.workspaceRevision),details("Complete frozen comparison",v));
   const controls=v.rows.map(x=>{
    const old=values.choices.find(c=>c.findingId===x.findingId),choice=field("Supervisor choice",old?.action||"","select",[{value:"",label:"Choose explicitly…"},{value:"KEEP",label:"Keep current decision"},...(x.canApply?[{value:"APPLY",label:"Apply reviewer proposal"}]:[])]);
    return {x,choice};
   });
   f.append(grid(["Finding / status","Issued decision","Current decision","Reviewer proposal","Supervisor choice"],controls.map(({x,choice})=>[actions(n("span",x.finding.code+" · "+x.finding.severity+" · "+x.status),details("Full finding",x.finding)),details("Issued",x.baselineDecision),details("Current",x.currentDecision),details("Returned",x.returnedDecision),choice.wrapper])),button("Refresh comparison",async()=>{await compare(returnId,editionId);}));
   return {get:()=>({...values,choices:controls.map(({x,choice})=>({findingId:x.findingId,action:choice.get(),resolution:choice.get()==="APPLY"?"RETURNED":choice.get()==="KEEP"?"CURRENT":""}))})};
  },"review.adopt",v=>{if(v.choices.some(x=>!x.action))throw Error("Choose keep or apply explicitly for every assigned finding.");return v;},r.workspaceRevision);
 }
 async function recovery(){
  main.replaceChildren();const p=panel("Draft recovery","Both complete versions remain available after a competing tab edit. Pending original requests must be settled in Saved requests.");
  const rows=await list("review-recovery:"+branch()+":");
  for(const {value:r}of rows)p.append(details("Saved workspace draft",r.current),details("Competing complete candidate",r.candidate),actions(button("Download both complete versions",async()=>download("Property_Review_Draft_Conflict.json",r)),button("Use candidate after review",async()=>{
   const latest=await get(r.key);if(latest?.pendingRequestId)throw Error("Settle the original pending request first.");
   originalBranch(r.candidate);const adopted={...r.candidate,...owner(),revision:current().revision,pendingRequestId:null};
   if(Object.hasOwn(adopted.values,"id"))adopted.values.id=latest?.values?.id||uid();
   await mutateDraft(r.key,latest||adopted,adopted.values);show("Candidate values retained. Reopen the assignment or exact comparison and review its selected revision before saving.");
  })));
  p.append(button("Back",screen));main.append(p);
 }
 async function screen(){
  const result=await api("/api/review-exchanges"),items=result.view.records||[];main.replaceChildren();
  const p=panel("Assigned discrepancy reviews","Issue complete source-bound work to a named reviewer, retain every return, then explicitly reconcile it with current decisions.");
  const reconciliation=field("Original reconciliation","","select",[{value:"",label:"Select a reconciliation…"},...records("reconciliations").map(r=>({value:r.id,label:caption(r)}))]);
  p.append(actions(reconciliation.wrapper,button("Assign selected findings",()=>{if(!reconciliation.get())throw Error("Select an original reconciliation.");return issue(reconciliation.get());}),button("Receive reviewer work",receiveScreen),button("Draft recovery",recovery)));
  p.append(grid(["Recorded work","Operator","Time","Details"],items.slice().reverse().map(r=>[r.kind,r.actor.name,r.createdAt,button("Open complete record",()=>open(r.id))])));
  const drafts=await list(prefix());
  if(drafts.length)p.append(n("h3","Unfinished supervisor drafts"),grid(["Draft","Original revision","State","Actions"],drafts.map(({value:d})=>[d.values.returnId?"Returned review adoption":"Reviewer assignment",d.revision,d.pendingRequestId?"Original request pending":"Saved on this device",actions(button("Open saved draft",()=>d.values.returnId?compare(d.values.returnId,d.values.editionId):issue(d.values.reconciliationId)),button("Download full draft",async()=>download("Property_Review_Draft.json",d)))])));
  const prepared=await list("review-prepared-return:"+branch()+":");
  if(prepared.length)p.append(n("h3","Prepared original returns"),grid(["File","Revision","Action"],prepared.map(({value:r})=>[r.prepared.file.name,r.revision,actions(button("Continue original receiving",()=>receivePrepared(r)),button("Review a definitely rejected attempt",()=>renewPrepared(r)),details("Original receiving plan",r))])));
  main.append(p);
 }
 return {screen,issue,open,compare};
};
