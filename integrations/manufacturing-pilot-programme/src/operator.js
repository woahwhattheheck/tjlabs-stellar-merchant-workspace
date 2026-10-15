(function(){
"use strict";
const core=createProspectProgrammeCore();
const initial=core.unpack(JSON.parse(document.getElementById("programme-data").textContent));
let workspace=initial.schema==="tjlabs.prospect-workspace.v3"?core.reopen(initial):core.create(initial);
const key="tjlabs.manufacturing.programme.v3."+encodeURIComponent(workspace.programme.operation_id);let dirty=false;let savedBase=null;let busy=false;let lastExported=null;const expectedOperation=workspace.programme.operation_id;const sessionId=(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+"-"+Math.random().toString(36).slice(2));let saveSeq=0;
const q=id=>document.getElementById(id);
function say(s){q("notice").textContent=s}
function render(){
 q("programme-title").textContent=workspace.programme.buyer.company+" · manufacturing pilot programme";
 q("commercial-terms").textContent=Object.values(workspace.programme.buyer.commercial).join(" ");
 const openDetails=new Set();q("cards").querySelectorAll("article[data-profile]").forEach(a=>a.querySelectorAll("details").forEach((d,i)=>{if(d.open)openDetails.add(a.dataset.profile+":"+i)}));const scrollY=window.scrollY;
 const s=core.summary(workspace);q("summary").textContent="Observed records · "+s.agreed+" manufacturer agreements · "+s.sourcesPrepared+" source sets · "+s.identitiesReviewed+" station/revision reviews · "+s.timebasesReviewed+" timebase reviews · "+s.comparisonsReviewed+" paired comparisons · "+s.qualityReviewed+" quality reviews · "+s.handoversReviewed+" handovers · "+s.continued+" continued · "+s.stopped+" stopped. Counts use the latest revision of each observation ID.";
 renderEditions();
 const term=q("search").value.trim().toLowerCase(),group=q("group").value;
 const rows=workspace.programme.profiles.filter(p=>(group==="all"||p.cohort===group)&&(!term||[p.company,p.contact.name,p.contact.role,p.contact.email,p.contact.phone,p.location,p.currentTools.observed,p.qualification.join(' '),workspace.working[p.id].notes].join(" ").toLowerCase().includes(term)));
 q("count").textContent=rows.length+" of 10 profiles";
 q("cards").innerHTML=rows.map(p=>core.card(p,workspace.working[p.id],true)).join("");
 q("cards").querySelectorAll("article[data-profile]").forEach(a=>a.querySelectorAll("details").forEach((d,i)=>{d.open=openDetails.has(a.dataset.profile+":"+i)}));window.scrollTo(0,scrollY);
}
function download(name,type,text){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
const deskControls={"search":"search","group":"group","delivery-group":"delivery_group","edition-id":"edition_id","edition-recorder":"edition_recorder","edition-choice":"edition_choice"};
function restoreDeskDraft(){for(const[id,k]of Object.entries(deskControls))q(id).value=workspace.deskDraft[k]}
for(const[id,k]of Object.entries(deskControls)){q(id).addEventListener(id==="search"||id==="edition-id"||id==="edition-recorder"?"input":"change",()=>{workspace.deskDraft[k]=q(id).value;dirty=true;if(id==="search"||id==="group")render();});}
q("programme-title").textContent=workspace.programme.buyer.company+" · manufacturing pilot programme";
q("commercial-terms").textContent=Object.values(workspace.programme.buyer.commercial).join(" ");

q("cards").addEventListener("input",e=>{
 const el=e.target;if(el.dataset.observation){const id=el.dataset.observation,k=el.dataset.field;if(!Object.hasOwn(workspace.working,id)||!Object.hasOwn(workspace.working[id].observationDraft,k))return;workspace.working[id].observationDraft[k]=el.value;dirty=true;say("Observation draft retained in this working copy. Record it when complete, or export the full workspace.");return;}if(el.dataset.pilot){const id=el.dataset.pilot,k=el.dataset.field;if(!Object.hasOwn(workspace.working,id)||!core.pilotFields.some(([key])=>key===k))return;workspace.working[id].pilot[k]=el.value;dirty=true;const panel=el.closest(".pilot");panel.querySelector("[data-pilot-status]").textContent="Setup review: "+(core.pilotIssues(workspace.working[id].pilot).join("; ")||"Configuration recorded. Keep actual outcome checks current.");say("Pilot record changed. Save or export the complete workspace.");return;}const id=el.dataset.stage||el.dataset.date||el.dataset.issue||el.dataset.notes;if(!id)return;
 const field=el.dataset.stage?"stage":el.dataset.date?"next_review_date":el.dataset.issue?"contact_issue":"notes";
 workspace.working[id][field]=el.value;dirty=true;say("Working changes are in memory. Save in this browser or export the full workspace.");
});
q("cards").addEventListener("click",e=>{const id=e.target.dataset.recordObservation;if(!id||busy)return;try{workspace=core.observe(workspace,id);dirty=true;render();say("Observation appended. All previous revisions remain in the complete workspace.");}catch(err){say("Observation not recorded: "+err.message+". The full draft remains editable.");}});
function retainBeforeAdoption(){if(!dirty)return true;const body=JSON.stringify(core.reopen(workspace));if(body===lastExported)return true;localStorage.setItem(recoveryKey("before-open"),body);refreshRecovery();return true}
function lock(on){busy=on;document.querySelectorAll("input,select,textarea,button").forEach(el=>el.disabled=on)}
function recoveryKey(label){return key+".recovery."+Date.now()+"."+sessionId+"."+(++saveSeq)+"."+label}
function refreshRecovery(){
 const choices=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(key+".recovery.")||k===key+".previous")choices.push(k)}
 choices.sort().reverse();q("recovery-choice").innerHTML=choices.map(k=>"<option value='"+core.esc(k)+"'>"+core.esc(k.slice(key.length+1))+"</option>").join("");return choices;
}
q("save").onclick=()=>{try{
 const valid=core.reopen(workspace),next=JSON.stringify(valid),proposal=recoveryKey("proposed");
 localStorage.setItem(proposal,next);refreshRecovery();
 const current=localStorage.getItem(key);
 if(current!==savedBase)throw Error("The saved copy differs from the copy opened here. Your complete proposed copy is retained in Recovery copies; export it or Restore saved before replacing the head");
 if(current!==null){localStorage.setItem(recoveryKey("prior"),current);refreshRecovery()}
 if(localStorage.getItem(key)!==current)throw Error("Saved head changed during save; your proposed copy is preserved in Recovery copies");
 localStorage.setItem(key,next);savedBase=next;dirty=false;say("Workspace saved. This proposed body and the previous saved body have separate recovery entries. Export JSON for portable handover.");
}catch(e){say("Browser save failed: "+e.message+". Current work remains available through workspace export.")}};
q("restore").onclick=()=>{try{const raw=localStorage.getItem(key);if(!raw)throw Error("No saved workspace in this browser");const candidate=core.reopen(JSON.parse(raw));if(candidate.programme.operation_id!==expectedOperation)throw Error("Saved copy belongs to another company programme");if(dirty&&!confirm("Replace unsaved working changes with the saved workspace?"))return;retainBeforeAdoption();workspace=candidate;savedBase=raw;dirty=false;restoreDeskDraft();render();say("Saved complete workspace restored.")}catch(e){say("Restore failed: "+e.message)}};
q("json").onclick=()=>{try{const valid=core.reopen(workspace);download("Manufacturing_Complete_Workspace.json","application/json",JSON.stringify(valid,null,2)+"\n");lastExported=confirm("Has the complete workspace download been saved successfully? Confirm only after the download is available.")?JSON.stringify(valid):null;say(lastExported?"Complete workspace download confirmed. This exact body permits later adoption when browser storage is unavailable.":"Download requested. Current work remains active; confirm a successful export before relying on it for replacement.")}catch(e){say("Export failed: "+e.message)}};
q("csv").onclick=()=>{download("Manufacturing_Ten_Profiles.csv","text/csv;charset=utf-8",core.csv(core.reopen(workspace),"all",true));say("All ten profiles and current working fields exported as CSV.")};
q("report").onclick=()=>{const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manufacturing · Working report</title><style>'+document.querySelector("style").textContent+'</style></head><body><main>'+core.report(core.reopen(workspace),"all",true)+'</main></body></html>';download("Manufacturing_Working_Report.html","text/html",html);say("Complete readable report exported with current working notes.")};
q("import").onchange=async e=>{const f=e.target.files[0];if(!f||busy)return;const input=e.target;lock(true);try{const raw=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(await f.arrayBuffer()).replace(/^\uFEFF/,"");const candidate=core.reopen(JSON.parse(raw));if(candidate.programme.operation_id!==expectedOperation)throw Error("File belongs to another company programme");if(dirty&&!confirm("Open this workspace after retaining your current working copy?"))return;retainBeforeAdoption();workspace=candidate;dirty=true;restoreDeskDraft();render();q("commercial-terms").textContent=Object.values(workspace.programme.buyer.commercial).join(" ");say("Complete ten-profile workspace opened. Save in this browser or export this version.")}catch(err){say("Import rejected: "+err.message+". Current work remains available; export it before replacing if browser storage is full.")}finally{input.value="";lock(false)}};

function page(content){return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manufacturing · Profile delivery</title><style>'+document.querySelector("style").textContent+'</style></head><body><main>'+content+'</main></body></html>'}

function renderEditions(){const selected=workspace.deskDraft.edition_choice;q("edition-choice").innerHTML=workspace.editions.map(e=>"<option value='"+core.esc(e.id)+"'>"+core.esc(e.id+" · "+e.payload.brief.brief_id+" · "+e.payload.group)+"</option>").join("");if(workspace.editions.some(e=>e.id===selected))q("edition-choice").value=selected;else if(workspace.editions.length)q("edition-choice").value=workspace.editions.at(-1).id;workspace.deskDraft.edition_choice=q("edition-choice").value;q("brief-current").textContent="Current brief: "+workspace.programme.buyer_brief.brief_id+" · "+workspace.briefHistory.length+" retained brief versions · "+workspace.editions.length+" customer editions";}
q("prepare-edition").onclick=()=>{try{workspace=core.prepareDelivery(workspace,q("delivery-group").value,{id:q("edition-id").value,recordedBy:q("edition-recorder").value,at:new Date().toISOString()});dirty=true;workspace.deskDraft.edition_choice=workspace.editions.at(-1).id;renderEditions();say("Complete customer edition retained with the exact five profiles, brief and three output bodies. Later working changes do not alter it. Save or export the complete workspace.");}catch(e){say("Edition preparation failed: "+e.message)}};
for(const type of ["json","csv","html"]){q(type==="html"?"deliver-report":"deliver-"+type).onclick=()=>{try{const e=core.delivery(workspace,q("edition-choice").value);download("Manufacturing_"+e.id+"."+type,type==="json"?"application/json":type==="csv"?"text/csv;charset=utf-8":"text/html;charset=utf-8",e.outputs[type].content);say("Exact retained "+type.toUpperCase()+" body exported for "+e.id+". Its selected profiles and buyer brief remain unchanged.");}catch(e){say("Customer export failed: "+e.message)}}}
q("brief-export").onclick=()=>{download("Manufacturing_Internal_Buyer_Brief.json","application/json",JSON.stringify(workspace.programme.buyer_brief,null,2)+"\n");say("Current internal buyer brief exported. A successor must carry a new brief_id and name this brief as parent_brief_id.");};
q("brief-import").onchange=async e=>{const f=e.target.files[0];if(!f||busy)return;const input=e.target;lock(true);try{const raw=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(await f.arrayBuffer()).replace(/^\uFEFF/,"");const brief=JSON.parse(raw);const candidate=core.reviseBrief(workspace,brief);workspace=candidate;dirty=true;render();say("Successor buyer brief retained. Earlier brief versions and customer editions remain available.");}catch(err){say("Brief import rejected: "+err.message+". Current work remains intact.");}finally{input.value="";lock(false)}};
q("refresh-recovery").onclick=()=>{try{const count=refreshRecovery().length;say(count+" recovery copies available. Choose one and export it for inspection.")}catch(e){say("Recovery listing failed: "+e.message)}};
q("recover").onclick=()=>{try{
 const selected=q("recovery-choice").value;if(!selected)throw Error("Choose a recovery copy");
 if(!selected.startsWith(key+".recovery.")&&selected!==key+".previous")throw Error("Unknown recovery key");
 const raw=localStorage.getItem(selected);if(!raw)throw Error("This recovery copy is unavailable");
 const candidate=core.reopen(JSON.parse(raw));if(candidate.programme.operation_id!==expectedOperation)throw Error("Recovery copy belongs to another programme");
 download("Manufacturing_Recovery_Workspace.json","application/json",JSON.stringify(candidate,null,2)+"\n");say("Selected complete recovery body exported. Open workspace to inspect it while preserving the saved head.");
}catch(e){say("Recovery export failed: "+e.message)}};
window.addEventListener("beforeunload",e=>{if(dirty||busy){e.preventDefault();e.returnValue=""}});
restoreDeskDraft();render();say("Ten complete profiles loaded. Review a profile, complete a manufacturer-specific station study and export the whole workspace.");try{refreshRecovery();if(localStorage.getItem(key)!==null)say("A saved workspace already exists. Restore saved to continue it, or export this independent copy. Save protects the existing body until you restore it.")}catch(e){say("Browser storage is unavailable. Use workspace export to preserve your work.")}
})();