function createRepairQueueCore(codec){
"use strict";
if(!codec||typeof codec.sha256!=="function"||typeof codec.utf8Encode!=="function")throw Error("UTF-8/SHA codec required");
const schema="tjlabs.repair-queue.v1",clone=x=>JSON.parse(JSON.stringify(x)),own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const fields=["reference","customerName","customerEmail","customerPhone","item","makeModel","reportedIssue","status","customerUpdate","internalNote","estimate","receivedDate","expectedCompletion","notificationPreference","smsConsent","recipientCountry"];
const required=["reference","customerName","customerEmail","item"];
const defaultMapping={reference:"Repair Reference",customerName:"Customer Name",customerEmail:"Customer Email",customerPhone:"Customer Phone",item:"Item",makeModel:"Make and Model",reportedIssue:"Reported Issue",status:"Status",customerUpdate:"Customer Update",internalNote:"Internal Note",estimate:"Estimate",receivedDate:"Received Date",expectedCompletion:"Expected Completion",notificationPreference:"Notification Preference",smsConsent:"SMS Consent",recipientCountry:""};
const defaultSettings={mode:"initial-import",authority:"sheet-managed",emailEnabled:true,smsEnabled:false,smsCreditsConfirmed:false,defaultPreference:"",recipientCountry:"",observedAt:""};
const hash=x=>codec.sha256(codec.utf8Encode(typeof x==="string"?x:JSON.stringify(x)));
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function object(x,name){if(!x||typeof x!=="object"||Array.isArray(x))throw Error(name+" must be an object");return x}
function text(x,name,empty=false){if(typeof x!=="string"||(!empty&&!x.trim()))throw Error(name+" must be text");return x}
function timestamp(s){return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s))&&date(s.slice(0,10))}
function date(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+"T00:00:00Z"))&&new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s}
function csvParse(original){
 text(original,"CSV",true);let s=original.replace(/^\uFEFF/,""),rows=[],row=[],v="",quoted=false,closed=false;
 for(let i=0;i<s.length;i++){const ch=s[i];if(quoted){if(ch==='"'){if(s[i+1]==='"'){v+='"';i++}else{quoted=false;closed=true}}else v+=ch;continue}
 if(ch==='"'){if(v||closed)throw Error("CSV quote inside an unquoted field");quoted=true}
 else if(ch===","||ch==="\n"||ch==="\r"){row.push(v);v="";closed=false;if(ch!==","){if(ch==="\r"&&s[i+1]==="\n")i++;rows.push(row);row=[]}}
 else{if(closed)throw Error("CSV characters after closing quote");v+=ch}
 }
 if(quoted)throw Error("Unclosed CSV quote");if(v||closed||row.length){row.push(v);rows.push(row)}
 if(!rows.length)throw Error("CSV header required");const headers=rows.shift();if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw Error("CSV headers must be nonempty and unique");
 const records=[];for(let i=0;i<rows.length;i++){if(rows[i].length===1&&rows[i][0]==="")continue;if(rows[i].length!==headers.length)throw Error("CSV row "+(i+2)+" has wrong field count");records.push({occurrence:i+2,cells:rows[i]})}
 return {headers,records};
}
function mapping(m,headers){object(m,"Mapping");if(Object.keys(m).some(k=>!fields.includes(k)))throw Error("Unknown mapping field");for(const k of fields){text(m[k],"Mapping "+k,true);if(m[k]&&!headers.includes(m[k]))throw Error("Mapped column missing: "+m[k]);if(required.includes(k)&&!m[k])throw Error("Required mapping "+k)}return clone(m)}
function settings(s){object(s,"Settings");if(Object.keys(s).sort().join("|")!==Object.keys(defaultSettings).sort().join("|"))throw Error("Complete settings required");if(!["initial-import","later-sync","manual-app-entry"].includes(s.mode)||!["sheet-managed","app-managed"].includes(s.authority))throw Error("Unknown mode or authority");for(const k of ["emailEnabled","smsEnabled","smsCreditsConfirmed"])if(typeof s[k]!=="boolean")throw Error(k+" must be boolean");if(!["","Email","SMS","Both","None"].includes(s.defaultPreference)||!["","CA","US","OTHER"].includes(s.recipientCountry))throw Error("Explicit notification preference/country required");if(!timestamp(s.observedAt))throw Error("Source observation timestamp with UTC offset required");return clone(s)}
function source(f,m){object(f,"Source");text(f.name,"Source filename");text(f.text,"Original CSV",true);const parsed=csvParse(f.text);const map=mapping(m,parsed.headers);return {name:f.name,text:f.text,bytes:codec.utf8Encode(f.text).length,sha256:hash(f.text),mapping:map,rows:parsed.records.map(r=>({occurrence:r.occurrence,values:Object.fromEntries(fields.map(k=>[k,map[k]?r.cells[parsed.headers.indexOf(map[k])]:""]))}))}}
function sourceCheck(s){const rebuilt=source({name:s.name,text:s.text},s.mapping);if(JSON.stringify(rebuilt)!==JSON.stringify(s))throw Error("Retained original source/mapping/rows differ");return rebuilt}
function statusMap(m){object(m,"Status mapping");if(Object.keys(m).length>1000)throw Error("Too many status mappings");for(const [k,v] of Object.entries(m)){text(k,"Original status");text(v,"Reviewed workflow label")}return clone(m)}
function group(rows){const g=new Map();for(const r of rows){const key=r.values.reference;if(!g.has(key))g.set(key,[]);g.get(key).push(r)}return g}
function issues(r,sm){const v=r.values,a=[];for(const k of required)if(!v[k].trim())a.push("missing_"+k);if(v.reference!==v.reference.trim())a.push("reference_surrounding_whitespace");if(v.customerEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.customerEmail))a.push("email_format");if(!v.status||!own(sm,v.status))a.push("status_mapping_required");if(v.expectedCompletion&&!date(v.expectedCompletion)&&!timestamp(v.expectedCompletion))a.push("completion_date_invalid");if(v.receivedDate&&!date(v.receivedDate)&&!timestamp(v.receivedDate))a.push("received_date_invalid");if(v.estimate&&!/^\d+(?:\.\d{1,2})?$/.test(v.estimate))a.push("estimate_format");return a}
function channels(v,s){
 const preference=v.notificationPreference||s.defaultPreference,notes=[],eligible=[];
 if(!["Email","SMS","Both","None"].includes(preference))notes.push("notification_preference_required");
 if(preference==="Email"||preference==="Both"){if(s.emailEnabled&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.customerEmail))eligible.push("email");else notes.push("email_not_ready")}
 if(preference==="SMS"||preference==="Both"){
 const country=v.recipientCountry||s.recipientCountry;
 if(!s.smsEnabled)notes.push("sms_disabled");
 if(country!=="CA")notes.push(country?"sms_country_not_supported":"sms_country_not_declared");
 if(!/^(yes|true)$/i.test(v.smsConsent))notes.push("sms_consent_not_recorded");
 if(!s.smsCreditsConfirmed)notes.push("sms_credits_not_confirmed");
 if(!/^\+[1-9]\d{7,14}$/.test(v.customerPhone.replace(/[\s()-]/g,"")))notes.push("sms_phone_format");
 if(!notes.some(x=>x.startsWith("sms_")))eligible.push("sms");
 }
 return {preference,eligible,notes};
}
function analyseEdition(e){
 const prior=group(e.old?e.old.rows:[]),next=group(e.next.rows),refs=[...new Set([...prior.keys(),...next.keys()])],rows=[];
 for(const reference of refs){
 const a=prior.get(reference)||[],b=next.get(reference)||[],row={reference,oldOccurrences:a.map(x=>x.occurrence),nextOccurrences:b.map(x=>x.occurrence),old:a.length===1?clone(a[0].values):null,next:b.length===1?clone(b[0].values):null,change:"",changedFields:[],attention:[],notification:{event:"none",channels:[],notes:[]},sourcePair:e.sourcePair};
 if(a.length>1||b.length>1){row.change="ambiguous_reference";row.attention.push("duplicate_reference");row.originalOccurrences={old:clone(a),next:clone(b)};rows.push(row);continue}
 if(!b.length){row.change="missing_from_next";row.attention.push("missing_row_is_not_deletion_or_completion");rows.push(row);continue}
 row.attention.push(...issues(b[0],e.statusMapping));
 if(a.length){const oldIssues=issues(a[0],e.statusMapping);row.attention.push(...oldIssues.map(x=>"prior_"+x));row.changedFields=fields.filter(k=>a[0].values[k]!==b[0].values[k]);row.change=row.changedFields.length?"changed":"unchanged";if(["customerName","customerEmail","customerPhone","item","makeModel"].some(k=>row.changedFields.includes(k)))row.attention.push("identity_or_contact_changed");
 if(own(e.statusMapping,a[0].values.status)&&own(e.statusMapping,b[0].values.status)){row.priorStage=e.statusMapping[a[0].values.status];row.nextStage=e.statusMapping[b[0].values.status]}
 }else row.change="new";
 const ch=channels(b[0].values,e.settings);row.notification.notes=ch.notes;
 if(e.settings.mode==="initial-import")row.notification.notes.push("initial_import_sends_no_customer_messages");
 else if(e.settings.mode==="later-sync"&&e.settings.authority==="app-managed")row.notification.notes.push("sheet_sync_has_no_declared_authority_for_app_managed_job");
 else if(!a.length)row.notification.event="new_job_candidate";
 else if(row.changedFields.includes("status")){
 if(row.priorStage===row.nextStage&&row.priorStage!==undefined)row.notification.notes.push("raw_status_changed_with_same_mapped_stage_requires_app_check");
 else row.notification.event="status_change_candidate";
 }else if(row.changedFields.includes("customerUpdate"))row.notification.notes.push("note_only_change_does_not_establish_status_notification");
 if(row.notification.event!=="none"&&!row.attention.length)row.notification.channels=ch.eligible;
 if(row.attention.length)row.notification.notes.push("resolve_source_attention_before_notification_test");
 row.notification.notes.push("candidate_only_confirm_actual_application_delivery");
 rows.push(row);
 }
 const summary={oldRows:e.old?.rows.length||0,nextRows:e.next.rows.length,uniqueReferences:refs.length,new:0,changed:0,unchanged:0,missing:0,ambiguous:0,attention:0,emailCandidates:0,smsCandidates:0};
 for(const r of rows){if(r.change==="new")summary.new++;if(r.change==="changed")summary.changed++;if(r.change==="unchanged")summary.unchanged++;if(r.change==="missing_from_next")summary.missing++;if(r.change==="ambiguous_reference")summary.ambiguous++;if(r.attention.length)summary.attention++;if(r.notification.channels.includes("email"))summary.emailCandidates++;if(r.notification.channels.includes("sms"))summary.smsCandidates++}
 return {editionId:e.id,label:e.label,sourcePair:e.sourcePair,settings:clone(e.settings),summary,rows};
}
function create(x){text(x.id,"Workspace ID");text(x.label,"Workspace label");return {schema,id:x.id,label:x.label,editions:[],reviews:[],observations:[]}}
function receive(w,input){
 const n=reopen(w);text(input.id,"Edition ID");if(n.editions.some(e=>e.id===input.id))throw Error("Edition ID already exists");text(input.label,"Edition label");text(input.notes,"Source notes",true);
 const s=settings(input.settings),sm=statusMap(input.statusMapping),next=source(input.next,input.mapping),old=input.old?source(input.old,input.oldMapping||input.mapping):null;
 if(s.mode==="later-sync"&&!old)throw Error("Later sync comparison requires the complete previous source");if(s.mode==="manual-app-entry"&&s.authority!=="app-managed")throw Error("Manual app entry requires app-managed authority");
 const e={id:input.id,label:input.label,settings:s,statusMapping:sm,old,next,notes:input.notes};e.sourcePair=hash(e);n.editions.push(e);return n;
}
function edition(w,id){const e=w.editions.find(x=>x.id===id);if(!e)throw Error("Unknown edition");return e}
function rowSignature(e,r){return hash({sourcePair:e.sourcePair,reference:r.reference,oldOccurrences:r.oldOccurrences,nextOccurrences:r.nextOccurrences,old:r.old,next:r.next,originalOccurrences:r.originalOccurrences||null})}
function review(w,input){
 const n=reopen(w),e=edition(n,input.editionId),r=analyseEdition(e).rows.find(x=>x.reference===input.reference);if(!r)throw Error("Unknown source reference");for(const k of ["id","reviewer","reason","evidence"])text(input[k],k);
 if(!["investigate","accepted_difference","correct_in_new_source","exclude_from_trial"].includes(input.decision))throw Error("Unknown review decision");
 const prev=n.reviews.find(x=>x.id===input.id);if(prev&&(prev.editionId!==e.id||prev.reference!==r.reference))throw Error("Review ID belongs to another source pair/reference");
 const rec={id:input.id,revision:n.reviews.filter(x=>x.id===input.id).length+1,editionId:e.id,reference:r.reference,sourcePair:e.sourcePair,rowSignature:rowSignature(e,r),decision:input.decision,reviewer:input.reviewer,reason:input.reason,evidence:input.evidence};n.reviews.push(rec);return n;
}
function observe(w,input){
 const n=reopen(w),e=edition(n,input.editionId),r=analyseEdition(e).rows.find(x=>x.reference===input.reference);if(!r)throw Error("Unknown source reference");for(const k of ["id","recorder","evidence","note"])text(input[k],k);if(!timestamp(input.occurredAt))throw Error("Actual observation timestamp required");if(!["no_message_observed","email_delivered","sms_delivered","delivery_failed","application_mapping_checked","source_corrected","other"].includes(input.outcome))throw Error("Unknown observed outcome");const prev=n.observations.find(x=>x.id===input.id);if(prev&&(prev.editionId!==e.id||prev.reference!==r.reference))throw Error("Observation ID belongs to another source pair/reference");
 n.observations.push({id:input.id,revision:n.observations.filter(x=>x.id===input.id).length+1,editionId:e.id,reference:r.reference,sourcePair:e.sourcePair,rowSignature:rowSignature(e,r),occurredAt:input.occurredAt,outcome:input.outcome,recorder:input.recorder,evidence:input.evidence,note:input.note});return n;
}
function reopen(w){
 object(w,"Workspace");if(w.schema!==schema)throw Error("Repair queue workspace required");text(w.id,"Workspace ID");text(w.label,"Workspace label");for(const k of ["editions","reviews","observations"])if(!Array.isArray(w[k]))throw Error(k+" history required");
 const ids=new Set();for(const e of w.editions){object(e,"Edition");text(e.id,"Edition ID");text(e.label,"Edition label");text(e.notes,"Notes",true);if(ids.has(e.id))throw Error("Repeated edition");ids.add(e.id);settings(e.settings);statusMap(e.statusMapping);sourceCheck(e.next);if(e.old)sourceCheck(e.old);if(e.settings.mode==="later-sync"&&!e.old)throw Error("Later sync lacks prior original");if(e.settings.mode==="manual-app-entry"&&e.settings.authority!=="app-managed")throw Error("Manual entry authority differs");const v=clone(e);delete v.sourcePair;if(hash(v)!==e.sourcePair)throw Error("Edition original identity differs")}
 for(const [key,method] of [["reviews",review],["observations",observe]]){const accepted=[];for(const r of w[key]){object(r,"History record");const base={schema,id:w.id,label:w.label,editions:clone(w.editions),reviews:key==="reviews"?accepted:[],observations:key==="observations"?accepted:[]};const e=edition(base,r.editionId),row=analyseEdition(e).rows.find(x=>x.reference===r.reference);if(!row||r.sourcePair!==e.sourcePair||r.rowSignature!==rowSignature(e,row))throw Error("History source binding differs");for(const k of key==="reviews"?["id","reviewer","reason","evidence"]:["id","recorder","evidence","note"])text(r[k],k);
 const prev=accepted.filter(x=>x.id===r.id);if(r.revision!==prev.length+1||prev.some(x=>x.editionId!==r.editionId||x.reference!==r.reference))throw Error("History correction identity differs");
 const keys=key==="reviews"?["id","revision","editionId","reference","sourcePair","rowSignature","decision","reviewer","reason","evidence"]:["id","revision","editionId","reference","sourcePair","rowSignature","occurredAt","outcome","recorder","evidence","note"];if(Object.keys(r).sort().join("|")!==keys.sort().join("|"))throw Error("Unexpected history structure");
 if(key==="reviews"&&!["investigate","accepted_difference","correct_in_new_source","exclude_from_trial"].includes(r.decision))throw Error("Unknown retained decision");
 if(key==="observations"&&(!timestamp(r.occurredAt)||!["no_message_observed","email_delivered","sms_delivered","delivery_failed","application_mapping_checked","source_corrected","other"].includes(r.outcome)))throw Error("Invalid observed outcome");accepted.push(clone(r))}}
 return clone(w);
}
function analyse(w,id){reopen(w);const e=edition(w,id),a=analyseEdition(e);for(const r of a.rows){r.reviews=w.reviews.filter(x=>x.editionId===id&&x.reference===r.reference);r.observations=w.observations.filter(x=>x.editionId===id&&x.reference===r.reference)}return a}
function csvCell(x){let s=String(x??"");if(/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
function csv(w,id){const a=analyse(w,id),h=["reference","change","old_rows","next_rows","old_status","next_status","customer_update","internal_note","attention","notification_event","candidate_channels","notification_notes","source_pair","review_history","actual_observations"];return [h,...a.rows.map(r=>[r.reference,r.change,r.oldOccurrences.join("|"),r.nextOccurrences.join("|"),r.old?.status,r.next?.status,r.next?.customerUpdate,r.next?.internalNote,r.attention.join("|"),r.notification.event,r.notification.channels.join("|"),r.notification.notes.join("|"),r.sourcePair,JSON.stringify(r.reviews),JSON.stringify(r.observations)])].map(r=>r.map(csvCell).join(",")).join("\n")+"\n"}
function report(w,id){const a=analyse(w,id),e=edition(w,id);return "<h1>Repair queue receiving · "+esc(a.label)+"</h1><p>"+esc(e.notes)+"</p><p>Mode: "+esc(e.settings.mode)+" · Authority: "+esc(e.settings.authority)+" · Observed source: "+esc(e.settings.observedAt)+"</p><p>Previous: "+esc(e.old?.name||"No previous file")+" · Current: "+esc(e.next.name)+" · Source pair "+esc(e.sourcePair)+"</p><p>"+esc(JSON.stringify(a.summary))+"</p><p>Notification candidates require actual application configuration and controlled delivery observation. Review notes preserve discrepancies. Missing rows never establish completion or deletion.</p><table><thead><tr><th>Reference / source rows</th><th>Change / status</th><th>Customer note</th><th>Internal note</th><th>Attention</th><th>Notification receiving</th><th>Retained review / observations</th></tr></thead><tbody>"+a.rows.map(r=>"<tr><td>"+esc(r.reference)+"<br>"+esc(r.oldOccurrences.join(",")+" → "+r.nextOccurrences.join(","))+"</td><td>"+esc(r.change)+"<br>"+esc((r.old?.status||"")+" → "+(r.next?.status||""))+"</td><td>"+esc(r.next?.customerUpdate)+"</td><td>"+esc(r.next?.internalNote)+"</td><td>"+esc(r.attention.join("; "))+"</td><td>"+esc(r.notification.event)+"<br>"+esc(r.notification.channels.join(", "))+"<br>"+esc(r.notification.notes.join("; "))+"</td><td><pre>"+esc(JSON.stringify({reviews:r.reviews,observations:r.observations},null,2))+"</pre></td></tr>").join("")+"</tbody></table>"}
return {schema,fields,required,defaultMapping,defaultSettings,create,receive,reopen,analyse,review,observe,csv,report,csvParse,esc};
}
export {createRepairQueueCore};
