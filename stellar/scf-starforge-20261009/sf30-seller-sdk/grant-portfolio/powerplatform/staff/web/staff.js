/* SPDX-License-Identifier: MIT */
(function (root) {
  "use strict";
  const J = root.TJLabsStaffJson;
  const app = document.getElementById("app"), dialog = document.getElementById("action-dialog");
  const model = {binding:null, context:null, tab:"overview", busy:false, error:null, notice:null, pending:null, history:[], more:false, after:0};
  const phaseNames = {IDEA:"Idea & alignment", FORMULATION:"Design in progress", QA_SUBMITTED:"In quality assurance", APPRAISED:"Endorsed", CLOSED_PIPELINE:"Closed pipeline"};
  const actionNames = {
    initialize:"Start staff review", "evidence.record":"Record evidence", "data-management.review":"Review data-plan requirement",
    "validation.record":"Record validation", "gate0.decide":"Record Gate 0 decision", "design.submit":"Submit design for QA",
    "qa.clearance":"Record clearance", "qa.decide":"Record chair decision", "qa.withdraw":"Withdraw this QA round",
    "condition.resolve":"Resolve condition", "correction.open":"Open correction", "correction.resolve":"Resolve correction",
    "design.reopen":"Reopen design", "financial.review":"Review received financial edition", "corporate.reference":"Record corporate reference"
  };
  function el(tag, attrs, ...children) {
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (k === "text") n.textContent = v;
      else if (v === true) n.setAttribute(k, "");
      else if (v !== false && v !== undefined && v !== null) n.setAttribute(k, String(v));
    }
    for (const child of children.flat(Infinity)) {
      if (child !== null && child !== undefined && child !== false) n.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return n;
  }
  const txt = v => J.display(v);
  const num = v => J.integer(v);
  const btn = (label, run, options={}) => el("button", {type:"button", onclick:run, ...options}, label);
  const pill = (label, kind="") => el("span",{class:"pill "+kind},label);
  const details = (title, content) => el("details",{},el("summary",{},title),content);
  const json = value => el("pre",{},J.stringify(value,true));
  const countOpen = list => (list || []).filter(x => x.status === "open").length;
  function announce(message) { document.getElementById("announcements").textContent = message; }
  function guid() { if (!root.crypto || !root.crypto.getRandomValues) throw Error("Secure action identifiers are unavailable in this browser."); const b=new Uint8Array(16);root.crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const x=Array.from(b,v=>v.toString(16).padStart(2,"0")).join("");return x.slice(0,8)+"-"+x.slice(8,12)+"-"+x.slice(12,16)+"-"+x.slice(16,20)+"-"+x.slice(20); }
  function cleanId(value) { const v=String(value||"").replace(/[{}]/g,"").toLowerCase(); if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v))throw Error("Select a saved original project record.");return v; }
  function storageKey() { const b=model.binding;return "tjlabs.pmrs.staff.pending/v1:"+b.origin+":"+b.entity+":"+b.id; }
  function storePending(pending) { root.localStorage.setItem(storageKey(), JSON.stringify(pending));model.pending=pending; }
  function loadPending() {
    const raw=root.localStorage.getItem(storageKey()); if(!raw){model.pending=null;return;}
    const p=JSON.parse(raw),b=model.binding;
    if(p.schema!=="tjlabs.pmrs.staff-browser-request/v1"||p.origin!==b.origin||p.request?.entity!==b.entity||p.request?.record_id!==b.id)throw Error("The saved action belongs to a different project.");
    model.pending=p;
  }
  function archivePending(outcome) {
    if(!model.pending)return;
    const p={...model.pending,closed_at:new Date().toISOString(),outcome};
    root.localStorage.setItem(storageKey()+":history:"+p.request.operation_id,JSON.stringify(p));
    root.localStorage.removeItem(storageKey());model.pending=null;
  }
  function download(name, text, type="application/json") {
    const url=URL.createObjectURL(new Blob([text],{type:type+";charset=utf-8"}));
    const a=el("a",{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
  }
  async function api(name, payload) {
    const request={Request:J.stringify(payload),getMetadata:function(){return {boundParameter:null,operationType:0,operationName:name,parameterTypes:{Request:{typeName:"Edm.String",structuralProperty:1}}};}};
    let response;
    try { response=await model.binding.Xrm.WebApi.online.execute(request); }
    catch(error){const e=Error(error?.message||"The request has no returned response.");e.returned=false;throw e;}
    const body=await response.text();
    let outer;try{outer=body?JSON.parse(body):{};}catch(_){outer=null;}
    if(!response.ok){const e=Error(outer?.error?.message||"The project service returned HTTP "+response.status+".");e.returned=true;e.status=response.status;e.body=body;throw e;}
    if(!outer||typeof outer.Response!=="string")throw Error("The project service did not return its complete action response.");
    return {value:J.parse(outer.Response),text:outer.Response,status:response.status};
  }
  const read = payload => api("tjl_PMRSStaffRead",{schema:"tjlabs.pmrs.staff-read/v1",entity:model.binding.entity,record_id:model.binding.id,...payload});
  async function refresh() {
    if(model.busy)return;model.busy=true;model.error=null;render();
    try {
      const {value}=await read({view:"context"});
      if(value.schema!=="tjlabs.pmrs.staff-context/v1"||value.entity!==model.binding.entity||value.record_id!==model.binding.id)throw Error("The service returned another project context.");
      num(value.state_version);model.context=value;loadPending();announce("Project review refreshed.");
    }catch(error){model.error=error.message;}finally{model.busy=false;render();}
  }
  function has(action) {
    const c=model.context,s=c?.state;if(!c||!(c.available_actions||[]).includes(action))return false;
    if(action==="initialize")return !s;
    if(!s)return false;
    const p=s.phase;
    if(["evidence.record","data-management.review"].includes(action))return ["IDEA","FORMULATION"].includes(p);
    if(["validation.record","gate0.decide"].includes(action))return p==="IDEA";
    if(action==="design.submit")return p==="FORMULATION";
    if(action.startsWith("qa."))return p==="QA_SUBMITTED"&&(action==="qa.withdraw"||c.qa_source_current);
    if(action==="design.reopen")return ["APPRAISED","CLOSED_PIPELINE"].includes(p);
    if(action==="corporate.reference")return p==="APPRAISED";
    if(action==="financial.review")return c.source_context.financial!==null;
    return true;
  }
  function actionButton(action, options={}, label=null) {
    return has(action)?btn(label||actionNames[action],()=>openAction(action,options),{disabled:model.busy||!!model.pending,class:options.primary?"primary":""}):null;
  }
  function sources(refs) {
    if(!refs?.length)return el("p",{class:"muted small"},"No source reference supplied.");
    return el("ul",{class:"source-list"},refs.map(r=>el("li",{},
      el("strong",{},r.label),el("div",{class:"small muted"},r.kind+" · "+r.verification),
      r.uri?el("div",{},/^https:\/\//i.test(r.uri)?el("a",{href:r.uri,target:"_blank",rel:"noopener noreferrer"},r.uri):el("span",{class:"hash"},r.uri)):null,
      r.note?el("p",{class:"small"},r.note):null,
      r.sha256?el("div",{class:"hash"},"SHA-256 "+r.sha256):null,
      r.sourceId||r.entityKey?el("div",{class:"small muted"},"Source "+(r.sourceId||"not supplied")+" · record "+(r.entityKey||"not supplied")):null
    )));
  }
  function audit(record) { return record?el("div",{class:"meta"},el("span",{},record.at||"Date not supplied"),el("span",{},record.actor_id||"Actor not supplied"),record.operation_id?el("span",{class:"inline-key"},record.operation_id):null):null; }
  function facts(rows) { return el("dl",{class:"facts"},rows.map(([a,b])=>[el("dt",{},a),el("dd",{},b)])); }
  function empty(title, text) { return el("section",{class:"panel"},el("h2",{},title),el("p",{class:"muted"},text)); }
  function render() {
    const c=model.context,s=c?.state;app.replaceChildren();app.setAttribute("aria-busy",String(model.busy));
    if(!model.binding)return;
    app.append(el("header",{class:"page-head"},
      el("div",{},el("p",{class:"eyebrow"},"Project review"),el("h1",{},c?.name||"Selected project"),
        el("div",{class:"subline"},s?pill(phaseNames[s.phase]||s.phase):pill("Not started"),
          el("span",{},c?"Review revision "+txt(c.state_version):"Loading original record"),
          el("span",{},(c?.roles||[]).join(" · ")||"No mapped review role"))),
      el("div",{class:"toolbar"},btn(model.busy?"Working…":"Refresh",refresh,{disabled:model.busy}),
        c?btn("Open source record",()=>model.binding.Xrm.Navigation.openForm({entityName:model.binding.entity,entityId:model.binding.id,openInNewWindow:true}),{class:"quiet"}):null)));
    if(model.error)app.append(el("section",{class:"notice error",role:"alert"},el("strong",{},"The action needs attention"),el("p",{},model.error)));
    if(model.notice)app.append(el("section",{class:"notice"},el("p",{},model.notice)));
    if(model.pending)app.append(pendingPanel());
    if(!c){app.append(empty("Project context",model.busy?"Reading the original project and your current access…":"Refresh to read the original project."));return;}
    app.append(el("nav",{class:"tabs",role:"tablist","aria-label":"Project review sections"},[
      ["overview","Overview"],["evidence","Design evidence"],["qa","Clearances & decisions"],["finance","Financial edition"],["history","Action history"]
    ].map(([id,label])=>btn(label,()=>{model.tab=id;render();if(id==="history"&&!model.history.length)loadHistory(true);},{role:"tab","aria-selected":model.tab===id}))));
    const body=el("section",{class:"body",role:"tabpanel"});
    const content={overview:overview,evidence:evidence,qa:qa,finance:finance,history:history}[model.tab]();
    body.append(content);app.append(body);
  }
  function pendingPanel() {
    const p=model.pending;
    return el("section",{class:"notice"},el("strong",{},"An original action is awaiting reconciliation"),
      el("p",{},actionNames[p.request.action]||p.request.action," was prepared for this project. Check its original result before making another change."),
      el("p",{class:"hash"},p.request.operation_id),
      p.last_error?el("p",{class:"small"},p.last_error.message):null,
      el("div",{class:"toolbar"},btn("Check original result",reconcilePending,{disabled:model.busy}),
        btn("Retry this same action",()=>sendPending(true),{disabled:model.busy}),
        btn("Retain obsolete request and refresh",releaseStalePending,{disabled:model.busy,class:"quiet"}),
        btn("Save request record",()=>download("Project_action_"+p.request.operation_id+".json",JSON.stringify(p,null,2)),{class:"quiet"})),
      el("p",{class:"footer-note"},"A retry keeps the same request and action identity. The service still checks the original project version; a returned “not found” is not proof that an earlier request never ran."));
  }
  function overview() {
    const c=model.context,s=c.state;
    if(!s)return el("div",{class:"grid"},el("section",{class:"panel"},el("h2",{},"Start from the existing project"),
      el("p",{},"The source record, owner and received portfolio stay linked. Starting review records the idea and keeps this project in the soft pipeline."),
      actionButton("initialize",{primary:true}),sources(c.policy.source_refs)),
      el("section",{class:"panel"},el("h2",{},"Selected rule set"),facts([["Version",c.policy.version],["Reviewed by",c.policy.review.actor],["Review date",c.policy.review.at]]),
      el("p",{},c.policy.review.reason)));
    const gaps=c.completeness_gaps||[];
    return el("div",{},
      el("div",{class:"cards"},
        el("section",{class:"card"},el("h3",{},"Design requirements"),el("p",{class:"big"},gaps.length?"Needs "+gaps.length+" item"+(gaps.length===1?"":"s"):"Ready for review")),
        el("section",{class:"card"},el("h3",{},"Open corrections"),el("p",{class:"big"},countOpen(s.corrections))),
        el("section",{class:"card"},el("h3",{},"Open conditions"),el("p",{class:"big"},countOpen(s.conditions))),
        el("section",{class:"card"},el("h3",{},"Pipeline"),el("p",{class:"big"},s.pipeline_category==="soft"?"Soft pipeline":"Corporate reference"))),
      el("div",{class:"grid"},
        el("div",{},
          el("section",{class:"panel"},el("h2",{},"Next decision"),
            gaps.length?el("ul",{class:"gap-list"},gaps.map(g=>el("li",{},g.label))):el("p",{},"All selected completeness requirements have evidence. The required reviewers and chair still make their own decisions."),
            el("div",{class:"toolbar"},actionButton("validation.record"),actionButton("gate0.decide"),actionButton("design.submit",{primary:true}),actionButton("design.reopen"),actionButton("corporate.reference"))),
          el("section",{class:"panel"},el("div",{class:"split"},el("h2",{},"Corrections"),actionButton("correction.open")),
            !(s.corrections||[]).length?el("p",{class:"muted"},"No correction has been recorded."):el("div",{class:"steps"},s.corrections.map(r=>recordCard(r,"correction")))),
          el("section",{class:"panel"},el("h2",{},"Endorsement conditions"),
            !(s.conditions||[]).length?el("p",{class:"muted"},"No endorsement condition has been recorded."):el("div",{class:"steps"},s.conditions.map(r=>recordCard(r,"condition"))))),
        el("div",{},
          el("section",{class:"panel"},el("h2",{},"Original record"),
            facts([["Project ID",el("span",{class:"hash"},c.record_id)],["Started",s.created_at],["Original owner",el("span",{class:"hash"},s.original_owner_id||"Not supplied")],["Policy",c.policy.version]]),
            details("Source and rule identities",facts([["Current source context",el("span",{class:"hash"},c.source_sha256)],["Rule identity",el("span",{class:"hash"},c.policy_sha256)]])),
            el("p",{class:"footer-note"},"The source context is the exact canonical received JSON selected for this review. Raw provider custody remains with its original received source.")),
          el("section",{class:"panel"},el("h2",{},"Validation & Gate 0"),s.validation?el("div",{},pill(s.validation.outcome),el("p",{},s.validation.reason),audit(s.validation)):el("p",{class:"muted"},"Validation has not been recorded."),
            s.gate0?el("div",{},el("hr",{class:"separator"}),pill(s.gate0.decision),el("p",{},s.gate0.reason),audit(s.gate0)):null),
          el("section",{class:"panel"},el("h2",{},"Corporate reference"),s.corporate_reference?el("div",{},facts([["Mode",s.corporate_reference.mode],["Company",s.corporate_reference.company_id],["Project card",s.corporate_reference.project_card_id],["Observed status",s.corporate_reference.status]]),sources(s.corporate_reference.source_refs)):el("p",{class:"muted"},"No corporate reference or manual update has been recorded."),
            el("p",{class:"footer-note"},"Review decisions do not create a Business Central project, post finance entries or perform an HR transaction.")))));
  }
  function recordCard(r,kind) {
    return el("article",{class:"step"},el("div",{class:"step-head"},el("h3",{},r.title),pill(r.status,r.status==="open"?"open":"")),
      r.reason?el("p",{class:"note"},r.reason):null,audit(r),details("Original evidence",sources(r.source_refs)),
      r.resolution?el("div",{},el("hr",{class:"separator"}),el("strong",{},r.resolution.outcome||"Resolved"),
        el("p",{class:"note"},r.resolution.reason),audit(r.resolution),details("Resolution evidence",sources(r.resolution.source_refs)),
        kind==="correction"?btn("Read resolution history",()=>showHistoryMember(r.resolution.operation_id,"after"),{class:"quiet"}):null):
        actionButton(kind+".resolve",{id:r.id}));
  }
  function evidence() {
    const c=model.context,s=c.state;if(!s)return empty("Design evidence","Start staff review on this original project before recording evidence.");
    const steps=c.policy.steps,required=steps.filter(x=>x.requirement==="required").length;
    return el("div",{},
      el("div",{class:"split"},el("div",{},el("h2",{},"Design evidence"),el("p",{class:"muted"},required+" standing requirements in the selected reviewed rule set. Optional steps and conditional data-management evidence retain their own meaning.")),actionButton("data-management.review")),
      el("section",{class:"panel"},el("h3",{},"Data management plan"),
        s.data_management?el("div",{},pill(s.data_management.required?"Required for this donor or policy":"Not required by the reviewed source"),el("p",{},s.data_management.reason),audit(s.data_management),sources(s.data_management.source_refs)):
          el("p",{class:"muted"},"The donor/policy requirement has not been reviewed. This is not a universal data-plan requirement.")),
      el("div",{class:"steps"},steps.map(step=>{
        const row=s.evidence[step.id],roleMatch=(step.actors||[]).some(x=>c.roles.includes(x));
        return el("article",{class:"step"},el("div",{class:"step-head"},
          el("div",{},el("p",{class:"eyebrow"},step.id),el("h3",{},step.label)),
          el("div",{},pill(step.requirement),row?pill("Recorded"):pill("No record","warn"))),
          step.notes?el("p",{class:"small muted"},step.notes):null,
          row?el("div",{},el("p",{class:"note"},row.note),audit(row),details("Recorded evidence",sources(row.source_refs))):null,
          details("Source requirement",sources(step.source_refs)),
          roleMatch?actionButton("evidence.record",{step_id:step.id},row?"Update evidence":"Record evidence"):el("p",{class:"small muted"},"Review roles: "+step.actors.join(", ")));
      })));
  }
  function qa() {
    const c=model.context,s=c.state;if(!s)return empty("Quality assurance","Start staff review before preparing a QA pack.");
    const q=s.qa;
    if(!q)return el("section",{class:"panel"},el("h2",{},"A complete design becomes a frozen review pack"),
      el("p",{},"Submission fixes the selected evidence, source context, rule set and required clearances. Each reviewer clears that same pack. The chair records endorse, revise or drop."),
      actionButton("design.submit",{primary:true}),s.previous_qa.length?details("Earlier QA decisions",json(s.previous_qa)):null);
    return el("div",{},
      el("section",{class:"panel"},el("div",{class:"split"},el("h2",{},"QA round "+txt(q.round)),pill(q.decision?q.decision.decision:"Review in progress")),
        el("p",{class:"hash"},"Pack "+q.pack_sha256),
        !c.qa_source_current?el("p",{class:"form-error"},"The source context or rule set changed after submission. Withdraw this round and submit the corrected design before another clearance or chair decision."):null,
        el("div",{class:"toolbar"},actionButton("qa.withdraw"),actionButton("qa.decide",{primary:true})),
        details("Frozen QA pack",json(q.pack)),details("Submission evidence",sources(q.submission.source_refs))),
      el("div",{class:"steps"},c.policy.clearances.map(def=>{
        const r=q.clearances[def.id],allowed=(def.roles||[]).some(x=>c.roles.includes(x));
        return el("article",{class:"step"},el("div",{class:"step-head"},el("div",{},el("h3",{},def.label),el("p",{class:"small muted"},def.roles.join(" · "))),pill(r?r.decision:"Awaiting review",r?.decision==="revise"?"warn":"")),
          r?el("div",{},el("p",{class:"note"},r.comment),audit(r),details("Clearance evidence",sources(r.source_refs))):null,
          allowed?actionButton("qa.clearance",{clearance_id:def.id}):null,details("Original requirement",sources(def.source_refs)));
      })),
      q.decision?el("section",{class:"panel"},el("h2",{},"Chair decision"),pill(q.decision.decision),el("p",{class:"note"},q.decision.minutes),el("p",{},q.decision.reason),audit(q.decision),sources(q.decision.source_refs)):null,
      s.previous_qa.length?details("Earlier QA decision history",json(s.previous_qa)):null);
  }
  function financialTree(value, label="Edition",depth=0) {
    if(value===null||typeof value!=="object"||value instanceof J.NumberToken)return el("div",{class:"financial-node"},el("strong",{},label+": "),txt(value));
    if(depth>8)return details(label,json(value));
    const entries=Array.isArray(value)?value.map((x,i)=>[String(i+1),x]):Object.entries(value);
    const content=el("div",{}),more=btn("Show next 100 original entries",append,{class:"quiet"});
    const box=el("details",{open:depth<2},el("summary",{},label+" · "+entries.length+" entries"),content);
    let shown=0;
    function append(){more.remove();const stop=Math.min(shown+100,entries.length);
      for(;shown<stop;++shown){const [k,v]=entries[shown];content.append(financialTree(v,k,depth+1));}
      if(shown<entries.length)content.append(more);
    }
    if(entries.length){if(depth<2)append();else box.addEventListener("toggle",()=>{if(box.open&&!shown)append();});}
    else content.append(el("p",{class:"muted"},"Empty original collection"));
    return box;
  }
  function finance() {
    const c=model.context,f=c.source_context.financial,r=c.state?.financial_review;
    return el("div",{},
      el("section",{class:"panel"},el("div",{class:"split"},el("h2",{},"Received financial edition"),actionButton("financial.review")),
        el("p",{},"Amounts, currencies, bases, periods and row occurrences below remain as supplied by the original financial integration. Review does not post or reallocate entries."),
        f===null?el("p",{class:"notice"},"No financial edition is bound to this project. It is unavailable, not a zero balance."):el("div",{},
          el("p",{class:"hash"},"Selected edition "+c.source_context.financial_sha256),
          btn("Download selected financial JSON",()=>download("Project_financial_"+c.record_id+".json",J.stringify(f,true)),{class:"quiet"}),
          financialTree(f))),
      r?el("section",{class:"panel"},el("h2",{},"Latest financial review"),pill(r.outcome,r.outcome==="needs-correction"?"warn":""),
        r.financial_sha256!==c.source_context.financial_sha256?el("p",{class:"form-error"},"This review belongs to an earlier financial edition. Review the current edition separately."):null,
        el("p",{},r.reason),audit(r),sources(r.source_refs)):null,
      el("section",{class:"panel"},el("h2",{},"Original project source"),details("Read received project context",json(c.source_context.source)),
        el("p",{class:"footer-note"},"The visible JSON preserves exact original numeric tokens. It does not calculate a combined balance across currencies, replace missing fields or infer a snapshot from complete pagination.")));
  }
  async function loadHistory(reset=false) {
    if(model.busy)return;model.busy=true;model.error=null;render();
    try {
      const after=reset?0:model.after,{value}=await read({view:"history",after_version:after,limit:20});
      if(value.schema!=="tjlabs.pmrs.staff-history-page/v1"||value.entity!==model.binding.entity||value.record_id!==model.binding.id||num(value.after_version)!==after||!Array.isArray(value.rows))throw Error("The returned action history differs from this project/page.");
      let last=after;for(const row of value.rows){const v=num(row.after_state_version);if(v<=last)throw Error("The native history is not ordered after the original cursor.");last=v;}
      if(value.more&&(!value.rows.length||num(value.next_after_version)!==last))throw Error("The complete history continuation is missing.");
      model.history=reset?value.rows:model.history.concat(value.rows);model.after=value.more?num(value.next_after_version):last;model.more=value.more===true;
    }catch(error){model.error=error.message;}finally{model.busy=false;render();}
  }
  function history() {
    return el("section",{class:"panel"},el("div",{class:"split"},el("h2",{},"Original action history"),btn("Refresh history",()=>loadHistory(true),{disabled:model.busy})),
      el("p",{class:"muted"},"Every action keeps its own request, before/after state, source context, rules and receipt. The list is read in revision order."),
      model.history.length?el("div",{},model.history.map(r=>el("article",{class:"timeline-row"},
        el("h3",{},"Revision "+txt(r.after_state_version),pill(actionNames[r.action]||r.action)),
        el("p",{class:"small muted"},r.at+" · "+r.actor_id),el("p",{class:"hash"},r.operation_id),
        el("div",{class:"toolbar"},["before","after","sources","policy","receipt"].map(member=>btn(member[0].toUpperCase()+member.slice(1),()=>showHistoryMember(r.operation_id,member),{class:"quiet",disabled:model.busy})))))):
        el("p",{class:"muted"},model.busy?"Reading action history…":"No staff action has been returned for this project."),
      model.more?btn("Load next actions",()=>loadHistory(false),{disabled:model.busy}):null);
  }
  async function showHistoryMember(operationId,member) {
    if(model.busy)return;model.busy=true;render();
    try {
      const {value}=await read({view:"history-member",operation_id:operationId,member});
      if(value.schema!=="tjlabs.pmrs.staff-history-member/v1"||value.operation_id!==operationId||value.member!==member||typeof value.text!=="string")throw Error("The returned history member differs.");
      const bytes=new TextEncoder().encode(value.text);
      if(bytes.length!==num(value.bytes))throw Error("The complete history byte count differs.");
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),v=>v.toString(16).padStart(2,"0")).join("");
      if(hash!==value.sha256)throw Error("The original history bytes do not match their SHA-256.");
      const body=J.parse(value.text);
      dialog.replaceChildren(el("header",{class:"dialog-head"},el("h2",{id:"action-title"},"Original "+member+" history"),el("p",{class:"small muted"},operationId)),
        el("div",{class:"dialog-body"},el("p",{class:"hash"},"SHA-256 "+hash),json(body)),
        el("footer",{class:"dialog-actions"},btn("Download original JSON",()=>download("Project_"+operationId+"_"+member+".json",value.text)),
          btn("Close",()=>dialog.close(),{class:"primary"})));
      dialog.showModal();
    }catch(error){model.error=error.message;}finally{model.busy=false;render();}
  }
  function field(label,{type="text",value="",choices=null,required=true,hint="",rows=4,maxLength=null}={}) {
    let input;
    if(choices){input=el("select",{});for(const [v,l]of choices)input.append(el("option",{value:v},l));input.value=value||choices[0]?.[0]||"";}
    else if(type==="textarea"){input=el("textarea",{rows});input.value=value;}
    else{input=el("input",{type,value});if(type==="checkbox")input.checked=!!value;}
    input.required=required;if(maxLength)input.maxLength=maxLength;
    const node=el("label",{class:"field"},el("span",{},label),input,hint?el("span",{class:"hint"},hint):null);
    return {node,input,get:()=>type==="checkbox"?input.checked:input.value.trim()};
  }
  function sourceEditor(initial=null) {
    const items=[],host=el("div",{class:"references"});
    const list=el("div",{});
    function add(original={}) {
      const kind=field("Evidence type",{choices:[["manual-attestation","Your review attestation"],["received-source","Received source record"],["native-record","Native record reference"],["document","Document"]],value:original.kind});
      const verification=field("Basis of verification",{choices:[["reviewer-attestation","I reviewed and attest to this evidence"],["received","Received original source"],["native-reference","Read from the native record"],["unverified-link","Unverified link only"]],value:original.verification});
      const label=field("Evidence label",{value:original.label||"",maxLength:300}),note=field("Evidence note",{type:"textarea",value:original.note||"",required:false,maxLength:4000});
      const uri=field("Stable document or record link",{value:original.uri||"",required:false,hint:"Use a stable HTTPS link or URN. Do not paste a temporary signed download link."});
      const sha=field("Original SHA-256",{value:original.sha256||"",required:false}),sourceId=field("Original source ID",{value:original.sourceId||"",required:false}),entityKey=field("Original record key",{value:original.entityKey||"",required:false});
      const editionId=field("Edition ID",{value:original.editionId||"",required:false}),row=field("Original row reference",{value:original.row||"",required:false});
      const box=el("section",{class:"reference-row"},el("div",{class:"field-grid"},kind.node,verification.node),label.node,note.node,uri.node,
        details("Received source identity",el("div",{},sha.node,el("div",{class:"field-grid"},sourceId.node,entityKey.node,editionId.node,row.node))));
      const item={box,get:()=>{
        const result={kind:kind.get(),label:label.get(),verification:verification.get()};
        if(!result.label)throw Error("Give each evidence reference a label.");
        for(const [key,f]of Object.entries({note,uri,sha256:sha,sourceId,entityKey,editionId,row})){if(f.get())result[key]=f.get();}
        if(result.sha256&&!/^[a-f0-9]{64}$/.test(result.sha256))throw Error("Use the complete lowercase original SHA-256.");
        if(result.uri){const u=new URL(result.uri);if(!["https:","urn:"].includes(u.protocol)||u.username||u.password)throw Error("Use a stable HTTPS source or URN without credentials.");
          if(Array.from(u.searchParams.keys()).some(k=>/^(?:sig|signature|token|access_token|authorization|x-amz-|x-goog-)/i.test(k)))throw Error("A temporary signed or credential-bearing URL is not a durable evidence reference.");}
        if(result.kind==="received-source"&&(!result.sha256||!result.sourceId||!result.entityKey))throw Error("Received source evidence needs its original source ID, record key and SHA-256.");
        return result;
      }};
      box.append(btn("Remove evidence",()=>{items.splice(items.indexOf(item),1);box.remove();},{class:"quiet danger"}));items.push(item);list.append(box);
    }
    host.append(el("h3",{},"Decision evidence"),el("p",{class:"small muted"},"Links and supplied hashes remain evidence references. This action does not fetch a document or independently verify an external source."),list,btn("Add evidence reference",()=>add()));
    for(const row of initial?.length?initial:[{}])add(row);
    return {node:host,get:()=>{if(!items.length)throw Error("Retain at least one complete evidence reference.");return items.map(x=>x.get());}};
  }
  function openAction(action,options={}) {
    if(!has(action)||model.busy||model.pending)return;
    const c=model.context,s=c.state,inputs={},container=el("div",{class:"dialog-body"}),form=el("form",{}),error=el("p",{class:"form-error",role:"alert"});
    function add(key,label,settings={}){const f=field(label,settings);inputs[key]=f;container.append(f.node);return f;}
    const source=sourceEditor();
    let conditionHost=null,conditionItems=[];
    if(action==="initialize")add("idea_note","Project idea",{type:"textarea",maxLength:24000});
    if(action==="evidence.record"){
      const step=c.policy.steps.find(x=>x.id===options.step_id);if(!step)throw Error("Select the original requirement.");
      container.append(el("p",{},step.id+" · "+step.label));
      add("note","Evidence and work completed",{type:"textarea",value:s.evidence[step.id]?.note||"",maxLength:24000});
    }
    if(action==="data-management.review")add("required","Does the reviewed donor or policy require a data management plan?",{choices:[["true","Required by the selected source"],["false","Not required by the selected source"]]});
    if(action==="validation.record")add("outcome","Validation outcome",{choices:[["ready-for-gate0","Ready for Gate 0"],["needs-work","Needs more work"]]});
    if(action==="gate0.decide")add("decision","Director / deputy decision",{choices:[["pursue","Pursue formulation"],["park","Park in the soft pipeline"],["drop","Drop / close pipeline"]]});
    if(action==="qa.clearance"){
      const def=c.policy.clearances.find(x=>x.id===options.clearance_id);container.append(el("p",{},def?.label||options.clearance_id));
      add("decision","Your clearance",{choices:[["clear","Clear this exact pack"],["revise","Revision required"]]});
      add("comment","Review comments",{type:"textarea",maxLength:12000});
    }
    if(action==="qa.decide"){
      add("decision","Chair decision",{choices:[["endorse","Endorse after all required clearances"],["revise","Return for revision"],["drop","Drop / close pipeline"]]});
      add("minutes","Decision minutes",{type:"textarea",maxLength:24000});
      conditionHost=el("section",{class:"references"},el("h3",{},"Conditions"));
      const list=el("div",{});
      conditionHost.append(list,btn("Add condition",()=>{
        const id=guid(),title=field("Condition",{type:"textarea",maxLength:6000}),refs=sourceEditor();
        const box=el("section",{class:"reference-row"},title.node,refs.node);const item={id,title,refs,box};
        box.append(btn("Remove condition",()=>{conditionItems=conditionItems.filter(x=>x!==item);box.remove();},{class:"quiet danger"}));
        conditionItems.push(item);list.append(box);
      }));
    }
    if(action==="correction.open"){
      add("title","Correction needed",{type:"textarea",maxLength:6000});
      add("affected_operation","Affected original action ID",{required:false,hint:"Optional. Keep the original action reference if this corrects a previous decision."});
    }
    if(action==="correction.resolve")add("outcome","Resolution outcome",{choices:[["corrected","Corrected with evidence"],["reviewed-no-change","Reviewed; no change required"]]});
    if(action==="design.reopen")add("restart_gate0","Return to idea validation and Gate 0",{type:"checkbox",value:s.phase==="CLOSED_PIPELINE",required:false,hint:"Choose this when the original idea/alignment or pursue decision must be reconsidered."});
    if(action==="financial.review"){
      container.append(el("p",{class:"hash"},"Selected financial edition "+c.source_context.financial_sha256));
      add("outcome","Review outcome",{choices:[["reviewed","Reviewed"],["needs-correction","Correction needed"]]});
    }
    if(action==="corporate.reference"){
      add("mode","Evidence route",{choices:[["interface-reference","Observed interface reference"],["manual-attestation","Reviewed manual update"]]});
      add("company_id","Actual company ID",{maxLength:500});add("project_card_id","Actual project-card ID",{maxLength:500});add("status","Observed corporate status",{maxLength:300});
      container.append(el("p",{class:"footer-note"},"This records the observed reference; it does not register a project or post an entry in Business Central."));
    }
    add("reason","Reason for this action",{type:"textarea",maxLength:12000});
    container.append(source.node);if(conditionHost)container.append(conditionHost);container.append(error);
    const submit=el("button",{type:"submit",class:"primary"},actionNames[action]);
    form.append(el("header",{class:"dialog-head"},el("h2",{id:"action-title"},actionNames[action]),el("p",{class:"small muted"},"For "+(c.name||c.record_id)+" · review revision "+txt(c.state_version))),
      container,el("footer",{class:"dialog-actions"},btn("Cancel",()=>dialog.close()),submit));
    form.addEventListener("submit",async event=>{
      event.preventDefault();error.textContent="";
      try{
        const payload={reason:inputs.reason.get(),source_refs:source.get()};
        for(const [key,f]of Object.entries(inputs))if(key!=="reason")payload[key]=f.get();
        if(action==="evidence.record")payload.step_id=options.step_id;
        if(action==="data-management.review")payload.required=payload.required==="true";
        if(action==="qa.clearance"){payload.clearance_id=options.clearance_id;payload.pack_sha256=s.qa.pack_sha256;}
        if(["qa.decide","qa.withdraw"].includes(action))payload.pack_sha256=s.qa.pack_sha256;
        if(action==="qa.decide")payload.conditions=conditionItems.map(x=>({id:x.id,title:x.title.get(),source_refs:x.refs.get()}));
        if(action==="correction.open"){payload.id=guid();payload.affected_operation=payload.affected_operation?cleanId(payload.affected_operation):null;}
        if(["condition.resolve","correction.resolve"].includes(action))payload.id=options.id;
        if(action==="financial.review")payload.financial_sha256=c.source_context.financial_sha256;
        const request={schema:"tjlabs.pmrs.staff-command/v1",operation_id:guid(),entity:c.entity,record_id:c.record_id,action,
          expected_row_version:c.row_version,expected_state_version:num(c.state_version),expected_source_sha256:c.source_sha256,
          policy_sha256:c.policy_sha256,payload};
        storePending({schema:"tjlabs.pmrs.staff-browser-request/v1",origin:model.binding.origin,prepared_at:new Date().toISOString(),request,state:"PREPARED"});
        dialog.close();await sendPending(false);
      }catch(e){error.textContent=e.message;}
    });
    dialog.replaceChildren(form);dialog.showModal();
  }
  async function sendPending(resume) {
    if(model.busy||!model.pending)return;
    const p=model.pending;
    if(p.state!=="PREPARED"&&!resume)return;
    model.busy=true;model.error=null;
    try{
      storePending({...p,state:"DISPATCHED",last_dispatch_at:new Date().toISOString(),dispatch_count:(p.dispatch_count||0)+1});
      render();
      const returned=await api("tjl_PMRSStaffCommand",p.request),v=returned.value,r=v?.result;
      if(v.schema!=="tjlabs.pmrs.staff-command-result/v1"||!r||r.operation_id!==p.request.operation_id||r.entity!==p.request.entity||r.record_id!==p.request.record_id||r.action!==p.request.action||num(r.after_state_version)!==p.request.expected_state_version+1)throw Error("The returned action receipt differs from the original request.");
      archivePending({state:"COMPLETE",response_text:returned.text});
      model.notice=actionNames[p.request.action]+" completed at review revision "+txt(r.after_state_version)+".";
      model.history=[];model.after=0;model.more=false;announce(model.notice);
    }catch(e){
      const current=model.pending||p;
      storePending({...current,state:"AWAITING_RECONCILIATION",last_error:{message:e.message,http_status:e.status||null,complete_http_return:e.returned===true,response_text:e.body||null,at:new Date().toISOString()}});
      model.error=e.message;
    }finally{model.busy=false;render();}
    if(!model.pending)await refresh();
  }
  async function reconcilePending() {
    if(model.busy||!model.pending)return;model.busy=true;model.error=null;render();const p=model.pending;
    try{
      const {value,text}=await read({view:"operation",operation_id:p.request.operation_id});
      if(value.schema!=="tjlabs.pmrs.staff-operation-read/v1"||value.operation_id!==p.request.operation_id)throw Error("The original action lookup returned another identity.");
      if(value.found){
        if(J.stringify(value.request)!==J.stringify(p.request))throw Error("The original action ID is bound to a different complete request.");
        const r=value.result;if(r?.operation_id!==p.request.operation_id||r.record_id!==p.request.record_id)throw Error("The original completed receipt differs.");
        archivePending({state:"COMPLETE",reconciled:true,response_text:text});
        model.notice="The original completed action is recovered. No second action was created.";
        model.history=[];
      }else{
        storePending({...p,last_lookup:{at:new Date().toISOString(),found:false,response_text:text}});
        model.notice="No completed original action was visible in this lookup. The saved request remains available for the same-action retry.";
      }
    }catch(e){model.error=e.message;}finally{model.busy=false;render();}
    if(!model.pending)await refresh();
  }
  async function releaseStalePending() {
    if(model.busy||!model.pending)return;const p=model.pending;
    model.busy=true;model.error=null;render();
    try{
      const current=await read({view:"context"}),c=current.value;
      if(c.schema!=="tjlabs.pmrs.staff-context/v1"||c.entity!==p.request.entity||c.record_id!==p.request.record_id)throw Error("The refreshed context belongs to another project.");
      const original=await read({view:"operation",operation_id:p.request.operation_id}),v=original.value;
      if(v.schema!=="tjlabs.pmrs.staff-operation-read/v1"||v.operation_id!==p.request.operation_id)throw Error("The original action lookup returned another identity.");
      if(v.found){
        if(J.stringify(v.request)!==J.stringify(p.request))throw Error("The original action identity is bound to a different complete request.");
        archivePending({state:"COMPLETE",reconciled:true,response_text:original.text});
        model.notice="The original completed action was recovered.";
      }else{
        if(v.found!==false||c.row_version===p.request.expected_row_version||num(c.state_version)<p.request.expected_state_version)
          throw Error("The original expected revision has not been superseded. Keep checking or retry this same request.");
        archivePending({state:"OBSOLETE_EXPECTED_REVISION",original_lookup_text:original.text,current_context_text:current.text,
          meaning:"The current native row version differs from this request's expected version. The old request is retained, not canceled or declared never executed. A later change must use the refreshed record and its normal native version guard."});
        model.notice="The obsolete request and both returned reads are retained. Review the refreshed record before preparing any later action.";
      }
      model.history=[];model.context=c;
    }catch(e){model.error=e.message;}finally{model.busy=false;render();}
    if(!model.pending)await refresh();
  }
  async function initialize({formContext,Xrm}) {
    if(!formContext?.data?.entity||!Xrm?.WebApi?.online?.execute)throw Error("Use the original model-driven project form.");
    const id=cleanId(formContext.data.entity.getId()),entity=formContext.data.entity.getEntityName();
    if(!/^[a-z][a-z0-9_]{0,127}$/.test(entity))throw Error("The original project table is invalid.");
    const origin=new URL(Xrm.Utility.getGlobalContext().getClientUrl()).origin;
    if(model.binding&&(model.binding.id!==id||model.binding.entity!==entity||model.binding.origin!==origin)){
      model.context=null;model.history=[];model.after=0;model.more=false;model.pending=null;model.tab="overview";
    }
    model.binding={formContext,Xrm,id,entity,origin};
    loadPending();await refresh();
  }
  root.TJLabsStaff=Object.freeze({initialize});
})(window);
