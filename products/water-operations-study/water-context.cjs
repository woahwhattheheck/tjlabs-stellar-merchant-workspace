'use strict';
const T=require('./study-time.cjs'),C=require('./canonical.cjs'),Schema=require('./schema.cjs');
const {time,inside,sourceView}=T;
const DATED=new Set(['organisations','systems','locations','assets','people','authorities','schedules']);
function context(w,rows,selected,side,assessment){
 const cache=new Map(),limit=typeof assessment==='number'?assessment:time(assessment),ms=at=>typeof at==='number'?at:time(at);
 function view(at){const cut=ms(at);if(cut===null||!Number.isFinite(cut)||cut>limit)throw Error('Use an eligible historical instant');if(cache.has(cut))return cache.get(cut);
 const sourceRows=(ww,k,s)=>rows(ww,k,s).filter(r=>!DATED.has(k)||time(r.values.valid_from)===null||time(r.values.valid_from)<=cut);
 // A faithful export available by the assessment can retain earlier documented row availability.
 const eligible=(ww,k,s)=>{const ex=selected(ww,k,s);return ex&&time(ex.available_at)!==null&&time(ex.available_at)<=limit?{...ex,available_at:new Date(Math.min(cut,time(ex.available_at))).toISOString()}:ex;};
 const v=sourceView(w,sourceRows,eligible,side,cut);cache.set(cut,v);return v;}
 function doc(id,at){const cut=ms(at),a=w.documents.filter(d=>d.id===id);return cut!==null&&cut<=limit&&a.length===1&&time(a[0].available_at)!==null&&time(a[0].available_at)<=cut?a[0]:null;}
 function rowIssues(r,at){if(!r)return['SOURCE_UNRESOLVED'];const z=r.values,cut=ms(at),es=[];if(Object.values(z).some(x=>x===null||x===undefined))es.push('CANONICAL_CELL_UNAVAILABLE');if(cut===null||time(z.recorded_at)===null||time(z.available_at)===null||time(z.recorded_at)>time(z.available_at)||time(z.available_at)>cut)es.push('SOURCE_TIME_UNRESOLVED');if(z.source_document_id&&!doc(z.source_document_id,cut))es.push('SOURCE_DOCUMENT_UNAVAILABLE');return es;}
 function exact(kind,id,at,extractId){const cut=ms(at),ex=extractId?w.extracts.find(x=>x.id===extractId&&x.kind===kind&&x.side===side):selected(w,kind,side);if(cut===null||cut>limit||!ex||time(ex.available_at)===null||time(ex.available_at)>limit)return null;let ww=w;if(extractId)ww={...w,config:{...w.config,selection:{...w.config.selection,[side]:{...w.config.selection[side],[kind]:extractId}}}};const xs=rows(ww,kind,side).filter(x=>x.values.id===id);return xs.length===1&&!rowIssues(xs[0],cut).length?xs[0]:null;}
 function active(kind,key,id,at){const cut=ms(at);if(cut===null||cut>limit)return null;const r=view(cut).get(kind,key,id);return r&&!rowIssues(r,cut).length&&(!DATED.has(kind)||inside(r.values.valid_from,r.values.valid_to,cut))?r:null;}
 const organisation=(id,at)=>active('organisations','organisation_id',id,at);
 function system(id,at){const r=active('systems','system_id',id,at);if(!r||!organisation(r.values.organisation_id,at)||!r.values.pws_id)return null;const xs=view(at).current.systems.filter(q=>q.values.pws_id===r.values.pws_id&&inside(q.values.valid_from,q.values.valid_to,ms(at)));if(xs.length!==1)return null;return r;}
 function person(id,at){const r=active('people','person_id',id,at);return r&&organisation(r.values.organisation_id,at)?r:null;}
 function location(id,at){const r=active('locations','location_id',id,at);if(!r||!system(r.values.system_id,at))return null;let p=r;const seen=new Set([id]);while(p.values.parent_location_id){if(seen.has(p.values.parent_location_id))return null;seen.add(p.values.parent_location_id);p=active('locations','location_id',p.values.parent_location_id,at);if(!p||p.values.system_id!==r.values.system_id)return null;}return r;}
 function asset(id,at){const r=active('assets','asset_id',id,at),l=r&&location(r.values.location_id,at);return r&&l&&l.values.system_id===r.values.system_id?r:null;}
 function authority(pid,permission,sid,at){const cut=ms(at);if(cut===null||!person(pid,cut)||!system(sid,cut))return null;const rs=view(cut).current.authorities.filter(r=>{const z=r.values,g=time(z.granted_at);return !rowIssues(r,cut).length&&z.person_id===pid&&z.permission===permission&&(z.system_id===''||z.system_id===sid)&&inside(z.valid_from,z.valid_to,cut)&&g!==null&&g<=cut&&g<=time(z.recorded_at)&&person(z.granted_by,g);});return rs[0]||null;}
 function schedule(id,at,exactId){const r=exactId?exact('schedules',exactId,at):active('schedules','schedule_id',id,at);if(!r)return null;const z=r.values,t=time(z.approved_at),l=location(z.location_id,at),current=active('schedules','schedule_id',z.schedule_id,at);return current&&current.values.id===z.id&&inside(z.valid_from,z.valid_to,ms(at))&&l&&l.values.system_id===z.system_id&&t!==null&&t<=ms(at)&&t<=time(z.recorded_at)&&authority(z.approved_by,'schedule-approver',z.system_id,t)?r:null;}
 function obligation(id,at){return active('obligations','obligation_id',id,at);}
 function targetReport(id,at){const r=active('reports','report_id',id,at),z=r?.values;return z&&system(z.system_id,at)&&time(z.claimed_period_start)!==null&&time(z.claimed_period_end)>time(z.claimed_period_start)?r:null;}
 function resolve(kind,id,iso){const at=ms(iso),r=({system,location,person,schedule,report:targetReport})[kind]?.(id,at);if(!r)return null;const z=r.values;return{...z,record_id:z.id,id,available_at:z.available_at,...(kind==='report'?{interval_start:z.claimed_period_start,interval_end:z.claimed_period_end}:{} )};}
 function authorize(role,pid,sid,iso){const r=authority(pid,role,sid,iso);return r?{authorized:true,available_at:r.values.available_at,source_document_id:r.values.source_document_id}:null;}
 return{view,doc,exact,active,organisation,system,person,location,asset,authority,schedule,obligation,targetReport,resolve,authorize,rowIssues,limit};
}
module.exports={context,DATED};
