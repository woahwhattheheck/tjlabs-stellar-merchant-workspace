function createProspectProgrammeCore(){
"use strict";
const stages=["Review","Ready","Contacted","Conversation","Replacement needed","Closed"];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clone=x=>JSON.parse(JSON.stringify(x));
function validate(p){
 if(!p||p.schema!=="tjlabs.prospect-programme.v3"||typeof p.operation_id!=="string"||!p.operation_id||typeof p.buyer?.company!=="string"||!Array.isArray(p.profiles)||p.profiles.length!==10)throw Error("Complete company programme with ten profiles required");
 if(typeof p.buyer.commercial?.followOn!=="string"||typeof p.buyer.commercial?.replacement!=="string")throw Error("Programme terms required");
 const ids=new Set(),names=new Set(),emails=new Set();
 for(const r of p.profiles){
  for(const k of ["id","company","website","location","cohort"]){if(typeof r[k]!=="string"||!r[k].trim())throw Error("Missing profile "+k)}
  if(ids.has(r.id)||names.has(r.company.toLowerCase()))throw Error("Duplicate business or profile");ids.add(r.id);names.add(r.company.toLowerCase());
  if(!["free-first-five","paid-follow-on"].includes(r.cohort))throw Error("Unknown delivery group");
  for(const k of ["role","route","url"]){if(typeof r.contact?.[k]!=="string"||!r.contact[k].trim())throw Error("Missing public contact "+k)}
  if(r.contact.email){const e=r.contact.email.toLowerCase();if(emails.has(e))throw Error("Duplicate contact email");emails.add(e)}
  if(!/^https:\/\//.test(r.contact.url)||!/^https:\/\//.test(r.website))throw Error("Published website and contact route must be HTTPS URLs");if(r.contact.kind!==undefined&&!["email","phone","form"].includes(r.contact.kind))throw Error("Unknown public contact route kind");if(!r.contact.email&&!r.contact.phone&&!(r.contact.kind==="form"&&/^https:\/\//.test(r.contact.url)&&r.contact.route.trim()))throw Error("Published email, phone or explicit complete official form route required");if(r.contact.kind==="email"&&!r.contact.email)throw Error("Email route needs published address");if(r.contact.kind==="phone"&&!r.contact.phone)throw Error("Phone route needs published number");
  if(r.sourceNotes!==undefined&&(!Array.isArray(r.sourceNotes)||r.sourceNotes.some(x=>typeof x!=="string")))throw Error("Source notes must be text");
  if(!Array.isArray(r.observations)||!r.observations.length||r.observations.some(x=>typeof x.text!=="string"||!x.text))throw Error("Operating observations required");
  if(!Array.isArray(r.sources)||!r.sources.length||r.sources.some(x=>typeof x.url!=="string"||!/^https:\/\//.test(x.url)))throw Error("First-party sources required");
  for(const k of ["observed","retain"]){if(typeof r.currentTools?.[k]!=="string"||!r.currentTools[k])throw Error("Current workflow required")}
  if(typeof r.fit?.reason!=="string"||!Array.isArray(r.qualification)||!r.qualification.length||typeof r.opening?.body!=="string"||!r.opening.body)throw Error("Complete fit and opening required");
  if(!r.proposedPilot||typeof r.proposedPilot.scope!=="string"||r.proposedPilot.steps?.some(x=>typeof x!=="string")||!Array.isArray(r.proposedPilot.steps)||!r.proposedPilot.steps.length||!r.proposedPilot.acceptance)throw Error("Complete operating comparison required");
 }
 if(p.profiles.filter(r=>r.cohort==="free-first-five").length!==5||p.profiles.filter(r=>r.cohort==="paid-follow-on").length!==5)throw Error("Five profiles in each group required");
 return p;
}

const pilotFields=[
  [
    "status",
    "Review state",
    [
      "Planned",
      "Ready for agreed walkthrough",
      "Running",
      "Outcome recorded",
      "Needs follow-up",
      "Declined"
    ]
  ],
  [
    "provider_agreement",
    "Contractor agreement",
    [
      "Not asked",
      "Agreed",
      "Declined"
    ]
  ],
  [
    "operator",
    "Responsible contractor reviewer"
  ],
  [
    "source_owner",
    "Original record and customer-permission owner"
  ],
  [
    "selected_account",
    "Actual invited Redform account and available functions"
  ],
  [
    "study_reference",
    "Selected completed property/job reference"
  ],
  [
    "source_set",
    "Original customer, property, job and report references"
  ],
  [
    "current_authorities",
    "Existing inspection, service, reporting and billing systems"
  ],
  [
    "comparison",
    "Administrative steps selected for comparison"
  ],
  [
    "source_check",
    "Original record receiving",
    [
      "Not observed",
      "Passed",
      "Needs correction"
    ]
  ],
  [
    "identity_check",
    "Customer/property/job linkage",
    [
      "Not observed",
      "Passed",
      "Needs correction"
    ]
  ],
  [
    "report_check",
    "Reviewed report and original-record match",
    [
      "Not observed",
      "Passed",
      "Needs correction"
    ]
  ],
  [
    "followup_check",
    "Separately reviewed follow-up work",
    [
      "Not observed",
      "Passed",
      "Needs correction"
    ]
  ],
  [
    "export_check",
    "Complete reviewed handover",
    [
      "Not observed",
      "Passed",
      "Needs correction"
    ]
  ],
  [
    "continuation",
    "Contractor continuation decision",
    [
      "Not asked",
      "Continue",
      "Adjust and retry",
      "Stop"
    ]
  ],
  [
    "evidence",
    "Actual observations and original references"
  ],
  [
    "next_step",
    "Agreed next operation"
  ]
];
function blankPilot(){return Object.fromEntries(pilotFields.map(([k,l,opts])=>[k,opts?opts[0]:""]))}
function pilotIssues(p){const issues=[];for(const [k,,opts]of pilotFields)if(!opts&&!["evidence","next_step"].includes(k)&&!p[k].trim())issues.push(k.replaceAll("_"," ")+" is not recorded");if(p.provider_agreement!=="Agreed")issues.push("contractor has not agreed to the study");if(p.status==="Outcome recorded"){for(const[k]of pilotFields.filter(([k])=>k.endsWith("_check")))if(p[k]!=="Passed")issues.push(k.replaceAll("_"," ")+" is not passed");if(!p.evidence.trim())issues.push("actual outcome needs evidence");if(p.continuation==="Not asked")issues.push("continuation is not recorded")}return issues;}
function pilotPanel(p,id,editable){
 const issues=pilotIssues(p);
 const content=editable?pilotFields.map(([k,label,opts])=>"<label>"+esc(label)+(opts?"<select data-pilot='"+esc(id)+"' data-field='"+esc(k)+"'>"+opts.map(v=>"<option"+(p[k]===v?" selected":"")+">"+esc(v)+"</option>").join("")+"</select>":"<textarea data-pilot='"+esc(id)+"' data-field='"+esc(k)+"'>"+esc(p[k])+"</textarea>")+"</label>").join(""):pilotFields.filter(([k])=>p[k]).map(([k,label])=>"<p><strong>"+esc(label)+":</strong> "+esc(p[k])+"</p>").join("");
 return (editable?"<details class='pilot'><summary>Property-workflow comparison · "+esc(p.status)+"</summary>":"<section class='pilot'><h3>Property-workflow comparison · "+esc(p.status)+"</h3>")+"<p>Use one agreed completed property job and its original records. Review identity, report handoff and separately recorded service work. The contractor supplies and reviews all technical inspection conclusions.</p><div class='pilot-fields'>"+content+"</div><div data-pilot-status='"+esc(id)+"'><p><strong>Setup review:</strong> "+(issues.length?esc(issues.join("; ")):"All configuration fields recorded; actual operator checks still determine the outcome.")+"</p></div>"+(editable?"</details>":"</section>");
}

function create(programme){validate(programme);validBrief(programme.buyer_brief,programme.operation_id);return {schema:"tjlabs.prospect-workspace.v3",programme:clone(programme),briefHistory:[clone(programme.buyer_brief)],editions:[],working:Object.fromEntries(programme.profiles.map(p=>[p.id,{stage:"Review",notes:"",next_review_date:"",contact_issue:"",pilot:blankPilot(),observationDraft:blankObservation(),observations:[]}]))}}
function validDate(s){if(!s)return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s}
function reopen(v){
 if(!v||v.schema!=="tjlabs.prospect-workspace.v3")throw Error("Complete workspace required");validate(v.programme);
 validateDeliveryHistory(v);
 if(!v.working||Object.keys(v.working).length!==10)throw Error("Ten working records required");
 for(const p of v.programme.profiles){const w=v.working[p.id];if(!Object.hasOwn(v.working,p.id)||!w||!stages.includes(w.stage)||["notes","next_review_date","contact_issue"].some(k=>typeof w[k]!=="string")||!validDate(w.next_review_date))throw Error("Invalid working record "+p.id);if(!w.pilot||typeof w.pilot!=="object"||Array.isArray(w.pilot)||Object.keys(w.pilot).length!==pilotFields.length||pilotFields.some(([k,l,opts])=>!Object.hasOwn(w.pilot,k)||typeof w.pilot[k]!=="string"||(opts&&!opts.includes(w.pilot[k]))))throw Error("Invalid complete pilot record "+p.id);validateObservations(w,p.id)}
 return clone(v);
}
function select(w,group="all"){if(!["all","free-first-five","paid-follow-on"].includes(group))throw Error("Unknown delivery group");return w.programme.profiles.filter(p=>group==="all"||p.cohort===group)}
function csv(w,group="all",working=false,deliveryContext=null){
 const head=["id","group","business","location","name","role","email","phone","public_route","website","current_tools","retain","fit","qualification","opening","pilot","acceptance","sources","property_workflow_configuration"];
 if(working)head.push("stage","next_review_date","working_notes","contact_issue",...pilotFields.map(([k])=>"pilot_"+k),"observation_draft","observation_history");
 const rows=select(w,group).map(p=>{const r=[p.id,p.cohort,p.company,p.location,p.contact.name,p.contact.role,p.contact.email||"",p.contact.phone||"",p.contact.route,p.website,p.currentTools.observed,p.currentTools.retain,p.fit.reason,p.qualification.join(" | "),p.opening.body,p.proposedPilot.steps.join(" | "),p.proposedPilot.acceptance,p.sources.map(s=>s.url).join(" | "),JSON.stringify(p.propertyWorkflowStudy||{})];if(working){const t=w.working[p.id];r.push(t.stage,t.next_review_date,t.notes,t.contact_issue,...pilotFields.map(([k])=>t.pilot[k]),JSON.stringify(t.observationDraft),JSON.stringify(t.observations))}return r});
 if(deliveryContext){const keys=["edition_id","brief_id","brief_sha256"];head.unshift(...keys);for(const row of rows)row.unshift(...keys.map(k=>deliveryContext[k]));}
 const cell=x=>{let s=String(x??"");if(/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
 return [head,...rows].map(r=>r.map(cell).join(",")).join("\n")+"\n";
}
function propertyWorkflowStudy(p){
 function content(v){if(Array.isArray(v))return "<ol>"+v.map(x=>"<li>"+content(x)+"</li>").join("")+"</ol>";if(v&&typeof v==="object")return "<dl>"+Object.entries(v).map(([k,x])=>"<dt>"+esc(k.replace(/([a-z])([A-Z])/g,"$1 $2"))+"</dt><dd>"+content(x)+"</dd>").join("")+"</dl>";return esc(v)}
 return p.propertyWorkflowStudy?"<details><summary>Complete proposed property-workflow configuration</summary><p>Researched commissioning proposal. Actual sources, outcome and continuation fields are completed only during the agreed provider operation.</p>"+content(p.propertyWorkflowStudy)+"</details>":"";
}
function card(p,w,editable=false,working=false){
 const sources=p.sources.map(s=>"<li><a href='"+esc(s.url)+"' target='_blank' rel='noopener noreferrer'>"+esc(s.url)+"</a> — "+esc(s.supports)+"</li>").join("");
 return "<article data-profile='"+esc(p.id)+"'><div class='eyebrow'>"+esc(p.id)+" · "+esc(p.cohort==="free-first-five"?"First five · free":"Additional five · $20 set")+" · "+esc(p.location)+"</div><h2>"+esc(p.company)+"</h2><p><strong>"+esc(p.contact.name||"Business team")+"</strong> · "+esc(p.contact.role)+"</p><p>"+esc(p.contact.email||"")+"<br>"+esc(p.contact.phone||"")+"<br>"+esc(p.contact.route)+"<br><a href='"+esc(p.contact.url)+"' target='_blank' rel='noopener noreferrer'>Open published business contact</a></p><h3>Operating facts</h3><ul>"+p.observations.map(o=>"<li>"+esc(o.text)+"</li>").join("")+"</ul><p><strong>Current tools:</strong> "+esc(p.currentTools.observed)+"</p><p><strong>Preserve:</strong> "+esc(p.currentTools.retain)+"</p>"+(p.delivery?"<h3>Delivery rules</h3>"+Object.entries(p.delivery).map(([k,v])=>"<p><strong>"+esc(k)+":</strong> "+esc(v)+"</p>").join(""):"")+"<h3>Why this conversation fits</h3><p>"+esc(p.fit.reason)+"</p>"+(p.fit.buyingSignal?"<p class='muted'>"+esc(p.fit.buyingSignal)+"</p>":"")+"<h3>Suggested opening</h3><p><strong>"+esc(p.opening.subject)+"</strong></p><blockquote>"+esc(p.opening.body)+"</blockquote><h3>Questions to qualify</h3><ul>"+p.qualification.map(q=>"<li>"+esc(q)+"</li>").join("")+"</ul><h3>Proposed property-workflow comparison</h3><p>"+esc(p.proposedPilot.scope)+"</p><ol>"+p.proposedPilot.steps.map(s=>"<li>"+esc(s)+"</li>").join("")+"</ol><p><strong>Acceptance:</strong> "+esc(p.proposedPilot.acceptance)+"</p>"+propertyWorkflowStudy(p)+"<h3>Sources</h3><ul>"+sources+"</ul>"+(p.sourceNotes?.length?"<h3>Source notes</h3><ul>"+p.sourceNotes.map(n=>"<li>"+esc(n)+"</li>").join("")+"</ul>":"")+"<p class='muted'>Prepared "+esc(p.sources[0].observedOn||"2026-10-15")+". Tailored opening is an editable draft for the software company's own team.</p>"+
 (editable?"<div class='working'><label>Stage<select data-stage='"+esc(p.id)+"'>"+stages.map(s=>"<option"+(w.stage===s?" selected":"")+">"+s+"</option>").join("")+"</select></label><label>Next review<input type='date' data-date='"+esc(p.id)+"' value='"+esc(w.next_review_date)+"'></label><label>Contact issue<input data-issue='"+esc(p.id)+"' value='"+esc(w.contact_issue)+"' placeholder='Record invalid or duplicate route and correction'></label><label>Working notes<textarea data-notes='"+esc(p.id)+"'>"+esc(w.notes)+"</textarea></label></div>":working?"<h3>Working record</h3><p>"+esc(w.stage)+" · "+esc(w.next_review_date)+"</p><p>"+esc(w.contact_issue)+"</p><p>"+esc(w.notes)+"</p>":"")+(editable||working?pilotPanel(w.pilot,p.id,editable)+observationPanel(w,p.id,editable):"")+"</article>";
}
function report(w,group="all",working=false){const rows=select(w,group);return "<h1>"+esc(w.programme.buyer.company)+" · "+rows.length+" fire-protection contractor profiles</h1><p>"+esc(w.programme.buyer.commercial.firstDelivery)+" "+esc(w.programme.buyer.commercial.followOn)+" "+esc(w.programme.buyer.commercial.replacement)+"</p><p>Each profile includes a published business contact, observed services, an editable opening and a proposed administrative comparison.</p>"+rows.map(p=>card(p,w.working[p.id],false,working)).join("")}
function fulfillment(w,group){if(group==="all")throw Error("Choose the first or additional five for fulfilment");const rows=select(w,group);return {schema:"tjlabs.prospect-delivery.v1",operation_id:w.programme.operation_id,buyer:w.programme.buyer.company,prepared_on:w.programme.prepared_on,group,terms:w.programme.buyer.commercial,profiles:clone(rows)}}

const observationEvents=["Provider agreed","Sources prepared","Identity reviewed","Report reviewed","Follow-up reviewed","Handover reviewed","Continued","Stopped","Issue"];
function blankObservation(){return {id:"",occurredAt:"",event:"Issue",reference:"",note:"",reviewer:""}}
function validObservation(o,complete=false){
 if(!o||typeof o!=="object"||Array.isArray(o)||Object.keys(o).length!==6||["id","occurredAt","event","reference","note","reviewer"].some(k=>!Object.hasOwn(o,k)||typeof o[k]!=="string")||!observationEvents.includes(o.event))throw Error("Invalid observation draft");
 if(complete){if(!o.id.trim()||!o.reference.trim()||!o.note.trim()||!o.reviewer.trim())throw Error("Observation needs ID, source reference, note and recorder");if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(o.occurredAt)||!Number.isFinite(Date.parse(o.occurredAt))||!validDate(o.occurredAt.slice(0,10)))throw Error("Observation needs an actual timestamp with UTC offset")}
}
function validateObservations(w,id){validObservation(w.observationDraft);if(!Array.isArray(w.observations))throw Error("Observation history required");for(let i=0;i<w.observations.length;i++){const r=w.observations[i];if(!r||r.profileId!==id||r.sequence!==i+1||Object.keys(r).length!==3)throw Error("Observation attribution differs");validObservation(r.value,true)}}
function observe(w,id){const next=reopen(w);if(!Object.hasOwn(next.working,id))throw Error("Unknown provider");const t=next.working[id];validObservation(t.observationDraft,true);t.observations.push({profileId:id,sequence:t.observations.length+1,value:clone(t.observationDraft)});t.observationDraft=blankObservation();return next}
function currentObservations(w){const latest=new Map();for(const r of w.observations)latest.set(r.value.id,r.value);return [...latest.values()]}
function summary(w){reopen(w);const map=[["Provider agreed","agreed"],["Sources prepared","sourcesPrepared"],["Identity reviewed","identitiesReviewed"],["Report reviewed","reportsReviewed"],["Follow-up reviewed","followupsReviewed"],["Handover reviewed","handoversReviewed"],["Continued","continued"],["Stopped","stopped"]];const n={providers:10,...Object.fromEntries(map.map(x=>[x[1],0]))};for(const t of Object.values(w.working)){const ev=new Set(currentObservations(t).map(x=>x.event));for(const[event,k]of map)if(ev.has(event))n[k]++}return n}
function observationPanel(w,id,editable){
 const fields=[["id","Observation ID (reuse to correct)"],["occurredAt","Occurred at, with UTC offset"],["reference","Actual source / session reference"],["reviewer","Recorded by"],["note","Observed behavior or issue"]];
 const form=editable?"<details><summary>Record an actual commissioning or continuation observation</summary><p>Use a pseudonymous trial reference. Reuse an observation ID to append a correction; the complete prior entries remain. These are manual observations, not product telemetry.</p><div class='pilot-fields'>"+fields.map(([k,l])=>"<label>"+esc(l)+"<input data-observation='"+esc(id)+"' data-field='"+k+"' value='"+esc(w.observationDraft[k])+"'></label>").join("")+"<label>Event<select data-observation='"+esc(id)+"' data-field='event'>"+observationEvents.map(v=>"<option"+(w.observationDraft.event===v?" selected":"")+">"+esc(v)+"</option>").join("")+"</select></label></div><button data-record-observation='"+esc(id)+"'>Retain observation</button></details>":"";
 const rows=w.observations.map(r=>"<tr><td>"+r.sequence+"</td><td>"+esc(r.value.id)+"</td><td>"+esc(r.value.occurredAt)+"</td><td>"+esc(r.value.event)+"</td><td>"+esc(r.value.reference)+"</td><td>"+esc(r.value.reviewer)+"</td><td>"+esc(r.value.note)+"</td></tr>").join("");
 return form+"<h3>Retained observation history</h3>"+(rows?"<div class='table-scroll'><table><thead><tr><th>Revision</th><th>ID</th><th>Occurred at</th><th>Event</th><th>Reference</th><th>Recorder</th><th>Observation</th></tr></thead><tbody>"+rows+"</tbody></table></div>":"<p>No observations recorded.</p>");
}

function stable(value){if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}"}
function digest(value){return createArchiveCodec().sha256(stable(value))}
function validBrief(b,operation){
 if(!b||b.schema!=="tjlabs.revenue-buyer-brief.v1"||b.case_id!==operation||typeof b.brief_id!=="string"||!b.brief_id.trim()||!b.buyer||!b.selection||!b.commercial||!b.request)throw Error("Complete buyer brief for this case required");
 if(b.parent_brief_id!==null&&typeof b.parent_brief_id!=="string")throw Error("Invalid parent buyer brief");
 if(!Array.isArray(b.selection.free_family_ids)||!Array.isArray(b.selection.prepared_follow_on_family_ids))throw Error("Exact selected family IDs required");
 const ids=[...b.selection.free_family_ids,...b.selection.prepared_follow_on_family_ids];if(ids.length!==10||new Set(ids).size!==10||ids.some(x=>typeof x!=="string"||!x))throw Error("Two distinct five-company selections required");if(b.selection.free_family_ids.length!==5||b.selection.prepared_follow_on_family_ids.length!==5)throw Error("Each selection must have five families");
 if(!b.customer_terms||["firstDelivery","followOn","replacement"].some(k=>typeof b.customer_terms[k]!=="string"||!b.customer_terms[k]))throw Error("Exact customer-facing terms required in buyer brief");
 return b;
}
function validateDeliveryHistory(w){
 if(!Array.isArray(w.briefHistory)||!w.briefHistory.length||!Array.isArray(w.editions))throw Error("Buyer-brief history and delivery editions required");
 const briefs=new Map();let prior=null;
 for(const b of w.briefHistory){validBrief(b,w.programme.operation_id);if(briefs.has(b.brief_id)||b.parent_brief_id!==prior)throw Error("Buyer brief lineage differs");briefs.set(b.brief_id,b);prior=b.brief_id}
 if(stable(w.programme.buyer_brief)!==stable(w.briefHistory.at(-1)))throw Error("Current buyer brief differs from retained history");
 const current=w.programme.buyer_brief;
 if(stable(w.programme.buyer.commercial)!==stable(current.customer_terms))throw Error("Current customer terms differ from buyer brief");
 for(const[group,key]of [["free-first-five","free_family_ids"],["paid-follow-on","prepared_follow_on_family_ids"]])if(stable(select(w,group).map(x=>x.id))!==stable(current.selection[key]))throw Error("Current profile selection differs from buyer brief");
 const ids=new Set();for(const e of w.editions){validateEdition(e,w.programme.operation_id);if(ids.has(e.id))throw Error("Duplicate delivery edition");ids.add(e.id);const b=briefs.get(e.payload.brief.brief_id);if(!b||stable(b)!==stable(e.payload.brief))throw Error("Edition buyer brief differs from history")}
}
function validateEdition(e,operation){
 if(!e||e.schema!=="tjlabs.customer-edition.v1"||typeof e.id!=="string"||!e.id||!e.payload||e.payload.operation_id!==operation||e.payload.edition_id!==e.id||digest(e.payload)!==e.payload_sha256)throw Error("Delivery edition content differs");
 const p=e.payload;if(!["free-first-five","paid-follow-on"].includes(p.group)||!Array.isArray(p.profiles)||p.profiles.length!==5||!Array.isArray(p.profile_ids)||stable(p.profile_ids)!==stable(p.profiles.map(x=>x.id)))throw Error("Delivery cohort differs");
 validBrief(p.brief,operation);if(stable(p.terms)!==stable(p.brief.customer_terms))throw Error("Edition terms differ from bound buyer brief");const key=p.group==="free-first-five"?"free_family_ids":"prepared_follow_on_family_ids";if(stable(p.profile_ids)!==stable(p.brief.selection[key])||p.brief_sha256!==digest(p.brief))throw Error("Delivery cohort or brief identity differs");
 if(!e.outputs||Object.keys(e.outputs).sort().join(",")!=="csv,html,json")throw Error("Three complete customer outputs required");
 const expected=editionOutputs(p);for(const k of ["json","csv","html"]){const x=e.outputs[k];if(x.content!==expected[k]||x.sha256!==createArchiveCodec().sha256(x.content))throw Error("Customer output differs: "+k)}
 return e;
}
function editionOutputs(p){
 const facade={programme:{buyer:{company:p.buyer,commercial:p.terms},profiles:p.profiles,prepared_on:p.prepared_on},working:{}};
 const banner="<h1>"+esc(p.buyer)+" · selected contractor profiles</h1><p>Delivery edition "+esc(p.edition_id)+" · brief "+esc(p.brief.brief_id)+"</p><p>"+esc(p.terms.firstDelivery)+" "+esc(p.terms.followOn)+" "+esc(p.terms.replacement)+"</p>";
 const css="body{font:16px/1.5 system-ui,sans-serif;color:#222;max-width:980px;margin:30px auto;padding:0 20px}article{border:1px solid #aaa;padding:22px;margin:20px 0;break-inside:avoid}a{color:#222;overflow-wrap:anywhere}h1{font-size:27px}h2{font-size:23px}h3{font-size:17px}blockquote{border-left:3px solid #888;padding:8px 16px;margin:12px 0}.muted,.eyebrow{color:#555;font-size:13px}@media print{body{margin:0}}";
 const {brief,...customerPayload}=p;customerPayload.brief_id=brief.brief_id;
 return {json:JSON.stringify(customerPayload,null,2)+"\n",csv:csv(facade,p.group,false,{edition_id:p.edition_id,brief_id:p.brief.brief_id,brief_sha256:p.brief_sha256}),html:'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(p.buyer)+' · '+esc(p.edition_id)+'</title><style>'+css+'</style></head><body>'+banner+p.profiles.map(x=>card(x,{},false,false)).join("")+"</body></html>"};
}
function prepareDelivery(workspace,group,metadata){
 const w=reopen(workspace);if(group==="all")throw Error("Choose one five-profile group");if(!metadata||typeof metadata.id!=="string"||!metadata.id.trim()||w.editions.some(x=>x.id===metadata.id)||typeof metadata.recordedBy!=="string"||!metadata.recordedBy.trim()||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(metadata.at)||!Number.isFinite(Date.parse(metadata.at)))throw Error("New edition ID, recorder and dated timestamp required");
 const brief=clone(w.programme.buyer_brief),profiles=clone(select(w,group));
 const payload={schema:"tjlabs.prospect-delivery.v2",operation_id:w.programme.operation_id,edition_id:metadata.id,created_at:metadata.at,recorded_by:metadata.recordedBy,buyer:w.programme.buyer.company,prepared_on:w.programme.prepared_on,group,brief,brief_sha256:digest(brief),profile_ids:profiles.map(x=>x.id),terms:clone(w.programme.buyer.commercial),profiles};
 const outputs=Object.fromEntries(Object.entries(editionOutputs(payload)).map(([k,content])=>[k,{content,sha256:createArchiveCodec().sha256(content)}]));
 const edition={schema:"tjlabs.customer-edition.v1",id:metadata.id,payload,payload_sha256:digest(payload),outputs};w.editions.push(edition);validateDeliveryHistory(w);return w;
}
function delivery(w,id){reopen(w);const e=w.editions.find(x=>x.id===id);if(!e)throw Error("Select a retained customer edition");return clone(e)}
function reviseBrief(workspace,brief){const w=reopen(workspace);validBrief(brief,w.programme.operation_id);if(brief.parent_brief_id!==w.programme.buyer_brief.brief_id||w.briefHistory.some(x=>x.brief_id===brief.brief_id))throw Error("Successor brief must name the current parent and a new ID");const priced=b=>{const c=b.commercial;return c.accepted?.amount_minor!==null&&c.accepted?.amount_minor!==undefined?c.accepted:c.proposed};const before=priced(w.programme.buyer_brief),after=priced(brief);if((before?.amount_minor!==after?.amount_minor||before?.currency!==after?.currency)&&brief.customer_terms.followOn===w.programme.buyer_brief.customer_terms.followOn)throw Error("Changed commercial amount requires matching customer-facing terms");w.briefHistory.push(clone(brief));w.programme.buyer_brief=clone(brief);w.programme.buyer.commercial=clone(brief.customer_terms);validateDeliveryHistory(w);return w}

return {prepareDelivery,delivery,reviseBrief,validateEdition,digest,observationEvents,blankObservation,observe,currentObservations,summary,validate,create,reopen,csv,card,report,select,esc,stages,pilotFields,blankPilot,pilotIssues,pilotPanel};
}