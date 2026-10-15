'use strict';
const T=require('./study-time.cjs'),C=require('./canonical.cjs'),Lab=require('./water-lab.cjs');
const {time,uniq}=T;
const ROLES={organisations:'governance',systems:'system_identity',locations:'location',assets:'registered_inventory',source_use:'period_source_use',people:'authority',authorities:'authority',schedules:'approved_schedule',obligations:'scheduled_work',field_readings:'field_observation',reading_reviews:'field_review',operational_events:'operational_record',tasks:'assigned_work',task_events:'task_history',effort:'effort',source_documents:'evidence',population_members:'eligible_population',...Object.fromEntries(Lab.KINDS.map(k=>[k,'laboratory_evidence']))};
const values=x=>x.values||x;
function basis(r,inputs){return C.hash({report:values(r),inputs:inputs.map(values).sort((a,b)=>a.id.localeCompare(b.id))});}
function handoverBasis(r,inputs){return C.hash({handover:values(r),inputs:inputs.map(values).sort((a,b)=>a.id.localeCompare(b.id))});}
function evaluator(w,rows,selected,ctx,p,evidence,populationAt){
 const caches=new Map();
 function inputsFor(kind,id,key,at){return ctx.view(at).current[kind].filter(x=>x.values[key]===id);}
 function boundInput(q,at,known,kind){const e=[],ex=w.extracts.find(x=>x.id===q.extract_id&&x.kind===q.family&&x.side===p.side);let row=null;
 if(!q.family||!q.record_id||!q.row_sha256)e.push('EXACT_INPUT_IDENTITY');
 if(time(q.recorded_at)===null||time(q.available_at)===null||time(q.recorded_at)>time(q.available_at)||time(q.available_at)>known)e.push('INPUT_AFTER_PREPARATION');
 if(!ex||time(ex.available_at)===null||time(ex.available_at)>known)e.push('INPUT_EXTRACT_UNAVAILABLE');else{row=ctx.exact(q.family,q.record_id,at,q.extract_id);if(!row||C.hash(row.values)!==q.row_sha256)e.push('INPUT_EXACT_ROW_BINDING');else if(!evidence(q.family,row,at))e.push('INPUT_CONTEXT_UNRESOLVED');}
 if(q.document_id&&!ctx.doc(q.document_id,at)||row?.values.source_document_id&&!ctx.doc(row.values.source_document_id,at))e.push('INPUT_ORIGINAL_UNAVAILABLE');
 return{...q,valid:!e.length,issues:uniq(e),row:row?.values||null};}
 function reports(at){if(caches.has(at))return caches.get(at);const v=ctx.view(at),out=[];
 for(const rr of v.current.reports){const z=rr.values,es=ctx.rowIssues(rr,at),cut=time(z.as_of),gen=time(z.generated_at),a=time(z.claimed_period_start),b=time(z.claimed_period_end),known=gen??at,inputs=inputsFor('report_inputs',z.report_id,'report_id',at),digest=basis(rr,inputs);
 const expected=/^(0|[1-9]\d*)$/.test(z.expected_members||'')?Number(z.expected_members):null;
 if(!z.report_id||v.current.reports.filter(x=>x.values.report_id===z.report_id).length!==1)es.push('REPORT_IDENTITY_AMBIGUOUS');
 if(cut===null||gen===null||cut>gen||gen>at||gen>time(z.recorded_at)||a===null||b===null||a>=b||b>cut||!ctx.authority(z.prepared_by,'report-preparer',z.system_id,gen))es.push('REPORT_TIME_OR_PREPARER');
 if(!z.document_id||gen===null||!ctx.doc(z.document_id,gen))es.push('REPORT_ORIGINAL_UNAVAILABLE');
 if(z.supersedes_report_id){const prior=v.current.reports.filter(x=>x.values.report_id===z.supersedes_report_id);if(prior.length!==1||prior[0].values.system_id!==z.system_id||time(prior[0].values.generated_at)>=gen)es.push('REPORT_PREDECESSOR_UNRESOLVED');}
 const results=inputs.map(x=>{const q=x.values,r=boundInput(q,cut,known,'report');if(q.role!==ROLES[q.family]||!ROLES[q.family])r.issues.push('REPORT_SOURCE_ROLE_UNRESOLVED');
 if(r.row){if(r.row.system_id&&r.row.system_id!==z.system_id)r.issues.push('REPORT_WRONG_SYSTEM');const observed=time(r.row.observed_at||r.row.collected_at||r.row.analysed_at||r.row.scheduled_at||r.row.interval_start||'');if(observed!==null&&(observed<a||observed>=b)&&!q.period_exception_reason)r.issues.push('REPORT_PERIOD_CONTEXT_REQUIRED');}
 r.valid=!r.issues.length;return r;});
 const pop=cut===null||a===null||b===null?{members:[],complete:false}:populationAt(cut,a,b,z.system_id,z.population_complete==='true',expected);
 const popBound=pop.complete&&pop.members.every(x=>results.some(r=>r.valid&&r.family==='population_members'&&r.record_id===x.id));
 if(!popBound)es.push('REPORT_POPULATION_UNRECONCILED');
 if(!inputs.length||results.some(x=>!x.valid)||new Set(inputs.map(x=>x.values.family+'\0'+x.values.record_id)).size!==inputs.length)es.push('REPORT_INPUT_BINDINGS_UNRESOLVED');
 const roles=z.required_roles.split(';').map(x=>x.trim()).filter(Boolean),reviews=inputsFor('report_reviews',z.report_id,'report_id',at).map(r=>{const q=r.values,e=ctx.rowIssues(r,at),t=time(q.reviewed_at);if(t===null||gen===null||t<gen||t>at||t>time(q.recorded_at)||!ctx.authority(q.reviewer_id,'report-review:'+q.role,z.system_id,t))e.push('REPORT_REVIEW_TIME_OR_AUTHORITY');if(q.report_basis_sha256!==digest||!roles.includes(q.role)||!['accepted','revise'].includes(q.decision))e.push('REPORT_REVIEW_BINDING');return{...q,valid:!e.length,issues:uniq(e)};});
 const roleReviews=roles.map(role=>{const xs=reviews.filter(x=>x.role===role).sort((a,b)=>(time(a.reviewed_at)??Infinity)-(time(b.reviewed_at)??Infinity)),last=xs.at(-1),tie=last&&xs.filter(x=>time(x.reviewed_at)===time(last.reviewed_at)).length>1;return{role,latest:last||null,complete:!!last&&last.valid&&!tie&&last.decision==='accepted'};});
 const reviewComplete=roles.length>0&&new Set(roles).size===roles.length&&roleReviews.every(x=>x.complete);if(!reviewComplete)es.push('REPORT_REVIEW_UNRESOLVED');
 out.push({...z,complete:!es.length,input_bindings_complete:results.length>0&&results.every(x=>x.valid),population_complete:popBound,observed_members:pop.members.length,review_complete:reviewComplete,report_basis_sha256:digest,inputs:results,reviews,role_reviews:roleReviews,issues:uniq(es)});}
 caches.set(at,out);return out;}
 function dispatches(at){const v=ctx.view(at),out=[];
 for(const rr of v.current.dispatch_events){const z=rr.values,e=ctx.rowIssues(rr,at),t=time(z.effective_at),r=t===null?null:reports(t).find(x=>x.report_id===z.report_id),allowed=['sent','received','rejected','withdrawn','published'];
 if(t===null||t>at||t>time(z.recorded_at)||!ctx.authority(z.actor_id,'report-dispatcher',z.system_id,t))e.push('DISPATCH_TIME_OR_AUTHORITY');
 if(!allowed.includes(z.event)||!r||r.system_id!==z.system_id||!z.recipient||!z.channel||!z.external_ref)e.push('DISPATCH_CONTEXT_UNRESOLVED');
 if(z.document_id!==r?.document_id||!ctx.doc(z.document_id,t))e.push('DISPATCH_REPORT_BYTES_UNRESOLVED');
 if(['sent','published'].includes(z.event)&&!r?.complete)e.push('DISPATCH_PACKET_UNRESOLVED_AT_SEND');
 out.push({...z,valid:!e.length,issues:uniq(e),packet_complete_at_event:!!r?.complete});}
 const duplicate=new Map();for(const x of out){const k=x.channel+'\0'+x.external_ref;if(!duplicate.has(k))duplicate.set(k,[]);duplicate.get(k).push(x);}for(const xs of duplicate.values())if(xs.length>1)for(const x of xs){x.valid=false;x.issues.push('DISPATCH_EXTERNAL_IDENTITY_DUPLICATE');}
 for(const x of out){if(['received','rejected','withdrawn'].includes(x.event)){const prior=out.filter(q=>q.dispatch_event_id===x.prior_dispatch_event_id),p0=prior[0];if(prior.length!==1||!p0.valid||!['sent','published'].includes(p0.event)||p0.report_id!==x.report_id||p0.system_id!==x.system_id||p0.recipient!==x.recipient||time(p0.effective_at)>time(x.effective_at)||time(p0.available_at)>time(x.effective_at)){x.valid=false;x.issues.push('DISPATCH_PREDECESSOR_UNRESOLVED');}}}
 return out;}
 function handovers(at){const v=ctx.view(at),out=[];
 for(const rr of v.current.handovers){const z=rr.values,e=ctx.rowIssues(rr,at),prep=time(z.prepared_at),eff=time(z.effective_at),items=inputsFor('handover_items',z.handover_id,'handover_id',at),digest=handoverBasis(rr,items),expected=/^(0|[1-9]\d*)$/.test(z.expected_items||'')?Number(z.expected_items):null;
 if(v.current.handovers.filter(x=>x.values.handover_id===z.handover_id).length!==1)e.push('HANDOVER_IDENTITY_AMBIGUOUS');
 if(prep===null||eff===null||prep>eff||eff>at||prep>time(z.recorded_at)||!ctx.authority(z.from_person_id,'handover-preparer',z.system_id,prep)||!ctx.authority(z.to_person_id,'handover-recipient',z.system_id,eff))e.push('HANDOVER_TIME_OR_AUTHORITY');
 if(!ctx.doc(z.document_id,prep))e.push('HANDOVER_ORIGINAL_UNAVAILABLE');
 const results=items.map(x=>{const q=x.values,r=boundInput(q,prep,prep,'handover');if(r.row?.system_id&&r.row.system_id!==z.system_id)r.issues.push('HANDOVER_WRONG_SYSTEM');if(!q.responsibility||q.next_due_at&&time(q.next_due_at)===null)r.issues.push('HANDOVER_RESPONSIBILITY_UNRESOLVED');r.valid=!r.issues.length;return r;});
 if(z.items_complete!=='true'||expected===null||results.length!==expected||!results.length||results.some(x=>!x.valid))e.push('HANDOVER_ITEM_POPULATION_UNRESOLVED');
 const acknowledgements=inputsFor('handover_acknowledgements',z.handover_id,'handover_id',at).map(r=>{const q=r.values,es=ctx.rowIssues(r,at),t=time(q.acknowledged_at);if(t===null||t<eff||t>at||t>time(q.recorded_at)||q.person_id!==z.to_person_id||!ctx.authority(q.person_id,'handover-recipient',z.system_id,t))es.push('HANDOVER_ACK_TIME_OR_PERSON');if(q.handover_basis_sha256!==digest||!['accepted','revise'].includes(q.decision))es.push('HANDOVER_ACK_BINDING');return{...q,valid:!es.length,issues:es};}).sort((a,b)=>(time(a.acknowledged_at)??Infinity)-(time(b.acknowledged_at)??Infinity)),last=acknowledgements.at(-1),tie=last&&acknowledgements.filter(x=>time(x.acknowledged_at)===time(last.acknowledged_at)).length>1;
 const accepted=!!last&&last.valid&&!tie&&last.decision==='accepted';if(!accepted)e.push('HANDOVER_ACK_UNRESOLVED');out.push({...z,complete:!e.length,accepted,items:results,acknowledgements,handover_basis_sha256:digest,issues:uniq(e)});}
 return out;}
 return{reports,dispatches,handovers,boundInput};
}
module.exports={ROLES,basis,handoverBasis,evaluator};
