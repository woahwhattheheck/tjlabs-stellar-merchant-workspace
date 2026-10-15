'use strict';
const T=require('./study-time.cjs'),C=require('./canonical.cjs');
const {time,positive,uniq}=T,parse=s=>{try{return C.parse(s);}catch{return null;}};
function records(ctx,cut){
 const current=(kind,at=cut)=>ctx.view(at).current[kind]||[],get=(kind,key,id,at=cut)=>ctx.view(at).get(kind,key,id),ic=new Map(),wc=new Map(),cc=new Map();
 const instant=(value,recorded,at)=>time(value)!==null&&time(value)<=at&&time(value)<=time(recorded);
 function inspection(id,at=cut){const key=id+'\0'+at;if(ic.has(key))return ic.get(key);const r=get('inspections','inspection_id',id,at);if(!r)return null;const z=r.values,e=ctx.rowContext(r,at),a=time(z.started_at),b=time(z.completed_at),c=ctx.serviceCase(z.case_id,at),asset=a===null?null:ctx.asset(z.asset_id,a);
 if(!c||c.values.asset_id!==z.asset_id||!asset||asset.values.customer_id!==c.values.customer_id)e.push('INSPECTION_CASE_ASSET_UNRESOLVED');
 if(a===null||b===null||a>b||b>at||b>time(z.recorded_at)||c&&a<time(c.values.received_at))e.push('INSPECTION_TIME_UNRESOLVED');
 const procedure=asset&&a!==null?ctx.procedure(z.procedure_record_id,a,asset,c?.values.requested_action):null;
 if(!procedure||z.procedure_sha256!==C.hash(procedure.values))e.push('INSPECTION_PROCEDURE_BINDING');
 if(!asset||z.configuration_sha256!==ctx.assetConfiguration(asset))e.push('INSPECTION_CONFIGURATION_BINDING');
 if(!asset||!procedure||!ctx.authority(z.inspector_id,'inspect',a,{...asset.values,procedure_id:procedure.values.procedure_id}))e.push('INSPECTOR_AUTHORITY_UNRESOLVED');
 const eligibility=procedure&&asset?ctx.eligibility(asset,procedure.values.action,procedure.values.procedure_id,a):null;
 if(!eligibility||eligibility.values.status!=='supported')e.push('SERVICE_ELIGIBILITY_UNRESOLVED');
 const required=procedure?parse(procedure.values.required_items_json)||[]:[],items=current('inspection_items',at).filter(x=>x.values.inspection_id===id),observations=[];
 for(const r of items){const y=r.values,es=[],spec=required.find(q=>q.key===y.item_key),t=time(y.observed_at);
 if(!spec||!spec.answers.includes(y.answer))es.push('ITEM_ANSWER_UNRESOLVED');
 if(items.filter(q=>q.values.item_key===y.item_key).length!==1)es.push('ITEM_IDENTITY_DUPLICATE');
 if(t===null||a===null||b===null||t<a||t>b||t>time(y.recorded_at)||!ctx.person(y.observer_id,t))es.push('ITEM_TIME_OR_OBSERVER_UNRESOLVED');
 if(spec?.requires_evidence_on?.includes(y.answer)){const d=ctx.doc(y.evidence_document_id,at);if(!d||spec.evidence_type==='image'&&!d.media_type.startsWith('image/'))es.push('ITEM_EVIDENCE_UNAVAILABLE');}
 else if(y.evidence_document_id&&!ctx.doc(y.evidence_document_id,at))es.push('ITEM_EVIDENCE_UNAVAILABLE');
 observations.push({...y,valid:!es.length,issues:es});}
 for(const q of required)if(q.required&&!observations.some(x=>x.item_key===q.key&&x.valid))e.push('REQUIRED_ITEM_UNOBSERVED');
 if(observations.some(x=>!x.valid))e.push('INSPECTION_ITEMS_UNRESOLVED');
 if(!['pass','fail','incomplete','unknown'].includes(z.reported_result))e.push('INSPECTION_RESULT_UNMAPPED');
 if(z.reported_result==='pass'&&observations.some(x=>x.answer==='fail'))e.push('REPORTED_RESULT_CONTRADICTS_ITEM');
 if(procedure?.values.requires_signature==='true'){const t=time(z.signed_at);if(t===null||b===null||t<b||t>time(z.recorded_at)||!ctx.doc(z.signature_document_id,at))e.push('INSPECTION_SIGNATURE_UNRESOLVED');}
 const out={...z,valid:!e.length,issues:uniq(e),items:observations,procedure_id:procedure?.values.procedure_id||null,recorded_technical_result:z.reported_result};ic.set(key,out);return out;}
 function work(id,at=cut){const key=id+'\0'+at;if(wc.has(key))return wc.get(key);const r=get('work','work_id',id,at);if(!r)return null;const z=r.values,e=ctx.rowContext(r,at),a=time(z.performed_at),b=time(z.completed_at),c=ctx.serviceCase(z.case_id,at),asset=a===null?null:ctx.asset(z.asset_id,a);
 if(!c||c.values.asset_id!==z.asset_id||!asset||asset.values.customer_id!==c.values.customer_id)e.push('WORK_CASE_ASSET_UNRESOLVED');
 if(a===null||b===null||a>b||b>at||b>time(z.recorded_at)||c&&a<time(c.values.received_at)||!positive(z.quantity)||!z.unit)e.push('WORK_TIME_OR_QUANTITY_UNRESOLVED');
 const p=asset&&a!==null?ctx.procedure(z.procedure_record_id,a,asset,z.action):null;
 if(!p||z.procedure_sha256!==C.hash(p.values))e.push('WORK_PROCEDURE_BINDING');
 if(!asset||!p||!ctx.authority(z.technician_id,'perform_work',a,{...asset.values,procedure_id:p.values.procedure_id}))e.push('WORK_TECHNICIAN_AUTHORITY');
 if(!['completed','failed','unrepairable','partial','unknown'].includes(z.disposition))e.push('WORK_DISPOSITION_UNMAPPED');
 if(z.result_document_id&&!ctx.doc(z.result_document_id,at))e.push('WORK_RESULT_UNAVAILABLE');
 if(z.deficiency_id){const d=get('deficiencies','deficiency_id',z.deficiency_id,at);if(!d||d.values.case_id!==z.case_id||d.values.asset_id!==z.asset_id)e.push('WORK_DEFICIENCY_LINEAGE');}
 const out={...z,valid:!e.length,issues:uniq(e)};wc.set(key,out);return out;}
 function deficiency(r,at=cut){const z=r.values,e=ctx.rowContext(r,at),a=time(z.observed_at),state=time(z.state_at),i=inspection(z.inspection_id,at),c=ctx.serviceCase(z.case_id,at);
 if(!c||c.values.asset_id!==z.asset_id||!i||i.case_id!==z.case_id||i.asset_id!==z.asset_id)e.push('DEFICIENCY_UNIT_LINEAGE');
 if(a===null||state===null||a>state||state>at||state>time(z.recorded_at)||!i||a<time(i.started_at)||a>time(i.completed_at))e.push('DEFICIENCY_TIME_UNRESOLVED');
 if(z.inspection_item_id&&!i?.items.some(x=>x.inspection_item_id===z.inspection_item_id&&x.valid))e.push('DEFICIENCY_ITEM_UNRESOLVED');
 if(!['open','quoted','awaiting_approval','approved','declined','closed','unknown'].includes(z.state))e.push('DEFICIENCY_STATE_UNMAPPED');
 if(!['true','false'].includes(z.requires_reinspection))e.push('DEFICIENCY_REINSPECTION_RULE_UNKNOWN');
 if(z.state==='closed'){if(!['repair','replacement','no_action'].includes(z.resolution)||!ctx.person(z.decided_by,state)||!ctx.doc(z.decision_document_id,at))e.push('DEFICIENCY_CLOSURE_UNRESOLVED');
 if(z.resolution==='repair'){const x=work(z.work_id,at);if(!x?.valid||x.case_id!==z.case_id||x.asset_id!==z.asset_id||x.disposition!=='completed'||time(x.completed_at)>state)e.push('DEFICIENCY_REPAIR_UNRESOLVED');}
 if(z.requires_reinspection==='true'){const x=inspection(z.reinspection_id,at);if(!x?.valid||x.asset_id!==z.asset_id||time(x.completed_at)>state||time(x.started_at)<a)e.push('DEFICIENCY_REINSPECTION_UNRESOLVED');}}
 return{...z,valid:!e.length,issues:uniq(e),closed:z.state==='closed'&&!e.length};}
 function certificate(id,at=cut){const key=id+'\0'+at;if(cc.has(key))return cc.get(key);const r=get('certificates','certificate_id',id,at);if(!r)return null;const z=r.values,e=ctx.rowContext(r,at),issued=time(z.issued_at),signed=time(z.signed_at),c=ctx.serviceCase(z.case_id,at),a=issued===null?null:ctx.asset(z.asset_id,issued),i=inspection(z.inspection_id,at);
 if(!c||c.values.asset_id!==z.asset_id||!a||!i?.valid||i.case_id!==z.case_id||i.asset_id!==z.asset_id)e.push('CERTIFICATE_CASE_INSPECTION_LINEAGE');
 if(issued===null||signed===null||signed>issued||issued>at||issued>time(z.recorded_at)||i&&time(i.completed_at)>signed)e.push('CERTIFICATE_TIME_UNRESOLVED');
 const p=a&&i?ctx.procedure(z.procedure_record_id,time(i.started_at),a,c?.values.requested_action):null;
 if(!p||z.procedure_sha256!==C.hash(p.values)||i&&i.procedure_record_id!==z.procedure_record_id)e.push('CERTIFICATE_PROCEDURE_BINDING');
 if(!a||!p||!ctx.authority(z.signed_by,'sign_certificate',signed,{...a.values,procedure_id:p.values.procedure_id}))e.push('CERTIFICATE_SIGNATORY_AUTHORITY');
 if(!ctx.doc(z.document_id,at))e.push('CERTIFICATE_ORIGINAL_UNAVAILABLE');
 const ids=parse(z.work_ids_json);if(!Array.isArray(ids)||ids.some(x=>typeof x!=='string')||new Set(ids).size!==ids.length)e.push('CERTIFICATE_WORK_LIST_UNRESOLVED');
 const ws=Array.isArray(ids)?ids.map(x=>work(x,at)):[];
 if(ws.some(x=>!x?.valid||x.case_id!==z.case_id||x.asset_id!==z.asset_id||time(x.completed_at)>signed))e.push('CERTIFICATE_WORK_LINEAGE');
 if(p?.values.requires_completed_work==='true'&&(!ws.length||ws.some(x=>x.disposition!=='completed')))e.push('CERTIFICATE_COMPLETED_WORK_UNOBSERVED');
 const ds=current('deficiencies',at).filter(x=>x.values.case_id===z.case_id&&time(x.values.observed_at)<=issued).map(x=>deficiency(x,at));
 if(p?.values.requires_closed_deficiencies==='true'&&ds.some(x=>!x.closed||time(x.state_at)>issued))e.push('CERTIFICATE_DEFICIENCIES_UNRESOLVED');
 if(z.supersedes_certificate_id){const previous=get('certificates','certificate_id',z.supersedes_certificate_id,at);if(!previous||previous.values.asset_id!==z.asset_id||previous.values.case_id!==z.case_id||time(previous.values.issued_at)>=issued)e.push('CERTIFICATE_PREDECESSOR_UNRESOLVED');}
 const replacements=current('certificates',at).filter(x=>x.values.supersedes_certificate_id===id&&instant(x.values.issued_at,x.values.recorded_at,at));
 const events=current('certificate_events',at).filter(x=>{const q=x.values;return q.certificate_id===id&&q.case_id===z.case_id&&q.asset_id===z.asset_id&&q.document_id===z.document_id&&instant(q.effective_at,q.recorded_at,at)&&ctx.person(q.actor_id,time(q.effective_at));});
 const states=events.filter(x=>['withdrawn','republished'].includes(x.values.event)).sort((x,y)=>time(x.values.effective_at)-time(y.values.effective_at)),last=states.at(-1),tied=last&&states.filter(x=>x.values.effective_at===last.values.effective_at).length>1;
 if(tied)e.push('CERTIFICATE_STATE_AMBIGUOUS');
 const out={...z,valid:!e.length,issues:uniq(e),current_state:replacements.length?'superseded':tied?'unknown':last?.values.event==='withdrawn'?'withdrawn':'issued',work:ws,deficiencies:ds,source_document_sha256:ctx.doc(z.document_id,at)?.sha256||null};cc.set(key,out);return out;}
 const inspections=current('inspections').map(x=>inspection(x.values.inspection_id)).filter(Boolean),works=current('work').map(x=>work(x.values.work_id)).filter(Boolean),deficiencies=current('deficiencies').map(x=>deficiency(x)),certificates=current('certificates').map(x=>certificate(x.values.certificate_id)).filter(Boolean);
 const events=current('certificate_events').map(r=>{const z=r.values,e=ctx.rowContext(r,cut),a=time(z.effective_at),c=a===null?null:certificate(z.certificate_id,a);
 if(!instant(z.effective_at,z.recorded_at,cut))e.push('CERTIFICATE_EVENT_TIME_UNRESOLVED');
 if(!['issued','delivered','acknowledged','withdrawn','republished'].includes(z.event)||!ctx.person(z.actor_id,a))e.push('CERTIFICATE_EVENT_ACTOR_OR_TYPE');
 if(!c?.valid||c.case_id!==z.case_id||c.asset_id!==z.asset_id||c.document_id!==z.document_id)e.push('CERTIFICATE_EVENT_EXACT_DOCUMENT_LINEAGE');
 if(['delivered','acknowledged'].includes(z.event)&&(!z.recipient||!z.recipient_customer_id||ctx.serviceCase(z.case_id,a)?.values.customer_id!==z.recipient_customer_id))e.push('CERTIFICATE_RECIPIENT_UNRESOLVED');
 if(z.event==='delivered'&&c?.current_state!=='issued')e.push('CERTIFICATE_NOT_CURRENT_AT_DELIVERY');
 if(!z.external_ref)e.push('CERTIFICATE_EVENT_IDENTITY_UNRESOLVED');
 if(z.supersedes_event_id){const prev=get('certificate_events','certificate_event_id',z.supersedes_event_id,cut);if(!prev||prev.values.case_id!==z.case_id||prev.values.asset_id!==z.asset_id||time(prev.values.effective_at)>=a)e.push('DELIVERY_CORRECTION_PREDECESSOR');}
 return{...z,valid:!e.length,issues:uniq(e),certificate_at_event:c};});
 const custody=current('custody_events').map(r=>{const z=r.values,e=ctx.rowContext(r,cut),a=time(z.effective_at),c=ctx.serviceCase(z.case_id,a),asset=ctx.asset(z.asset_id,a);
 if(!instant(z.effective_at,z.recorded_at,cut))e.push('CUSTODY_TIME_UNRESOLVED');
 if(!c||!asset||!ctx.person(z.actor_id,a)||!z.external_ref||!z.from_party||!z.to_party)e.push('CUSTODY_CONTEXT_UNRESOLVED');
 if(c&&z.asset_id!==c.values.asset_id){const rental=get('commerce_rentals','rental_id',z.rental_id,a);if(!rental||rental.values.rental_asset_id!==z.asset_id||rental.values.customer_asset_id!==c.values.asset_id||rental.values.case_id!==z.case_id)e.push('TEMPORARY_UNIT_RENTAL_LINEAGE');}
 if(!['received','issued','shipped','returned','transferred'].includes(z.event))e.push('CUSTODY_EVENT_UNMAPPED');
 if(z.evidence_document_id&&!ctx.doc(z.evidence_document_id,cut))e.push('CUSTODY_EVIDENCE_UNAVAILABLE');
 return{...z,valid:!e.length,issues:uniq(e)};});
 for(const list of [events,custody]){const groups=new Map();for(const x of list)if(x.external_ref){if(!groups.has(x.external_ref))groups.set(x.external_ref,[]);groups.get(x.external_ref).push(x);}for(const xs of groups.values())if(xs.length>1)for(const x of xs){x.valid=false;x.issues.push('EXTERNAL_EVENT_ID_DUPLICATE');}}
 const obligations=current('obligations').map(r=>{const z=r.values,e=ctx.rowContext(r,cut),a=time(z.authorised_at),due=time(z.due_at),asset=ctx.asset(z.asset_id,a);
 if(!asset||!instant(z.authorised_at,z.recorded_at,cut)||due===null||!z.cadence_text||!z.basis||!ctx.authority(z.authorised_by,'set_obligation',a,{...asset?.values,procedure_id:z.procedure_id}))e.push('OBLIGATION_ACTUAL_BASIS_UNRESOLVED');
 return{...z,valid:!e.length,issues:uniq(e),due_state:e.length?'unknown':due<cut?'past_due_observation':due===cut?'due_now':'future_due'};});
 return{inspection,work,certificate,current,get,inspections,works,deficiencies,certificates,events,custody,obligations};
}
module.exports={records};
