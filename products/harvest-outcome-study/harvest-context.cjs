'use strict';
const T=require('./study-time.cjs'),View=require('./context-source-view.cjs'),Schema=require('./base-schema.cjs');
const MAP={grower:'growers',site:'sites',crop:'crops',location:'locations',logger:'loggers',person:'people',buyer:'buyers',protocol:'protocols',invoice_line:'invoice_lines'};
function context(w,rows,selected,p){
 const cut=T.time(p.as_of),doc=(id,at)=>{const t=typeof at==='number'?at:T.time(at),xs=w.documents.filter(d=>d.id===id);return t!==null&&xs.length===1&&T.time(xs[0].available_at)<=t?xs[0]:null;};
 const records=Object.fromEntries(Schema.KINDS.map(k=>[k,rows(w,k,p.side)])),v=View.create(records,{as_of:p.as_of,population_complete:p.source_population_complete,expected_counts:p.expected_counts,extract_available_at:Object.fromEntries(Schema.KINDS.map(k=>[k,selected(w,k,p.side)?.available_at||''])),document:doc});
 if(cut===null)return {v,doc,resolve:()=>null,authorize:()=>null};
 function active(kind,id,at,seen=new Set()){
  const t=typeof at==='number'?at:T.time(at),family=MAP[kind];if(t===null||t>cut||!family||seen.has(kind+':'+id))return null;seen=new Set([...seen,kind+':'+id]);const snap=v.snapshot(t),xs=snap.current[family].filter(r=>r.values[Schema.IDS[family]]===id);if(xs.length!==1)return null;const row=xs[0],z=row.values;
  const invalidKnown=v.all[family].some(r=>(r.values.record_key===z.record_key||r.values[Schema.IDS[family]]===id)&&T.time(r.values.available_at)!==null&&T.time(r.values.available_at)<=t&&!snap.known[family].has(r.values.id));if(invalidKnown||!T.inside(z.valid_from,z.valid_to,t))return null;
  if(kind==='site'&&!active('grower',z.grower_id,t,seen)||kind==='location'&&!active('site',z.site_id,t,seen)||kind==='logger'&&!active('location',z.location_id,t,seen)||kind==='person'&&!active('grower',z.grower_id,t,seen))return null;
  if(kind==='crop'&&(!z.unit||!z.name)||kind==='protocol'&&(!z.meaning||!active('crop',z.crop_id,t,seen)||!doc(z.method_document_id,t))||kind==='invoice_line'&&(!active('buyer',z.buyer_id,t,seen)||!z.dispatch_record_id||!z.currency||!T.nonnegative(z.gross_amount)))return null;
  return {...z,record_id:z.id,record_sha256:row.hash,id};
 }
 function authorize(role,pid,scope,at){const t=typeof at==='number'?at:T.time(at);if(t===null||!active('person',pid,t))return null;const xs=v.snapshot(t).current.authorities.filter(r=>{const z=r.values,g=T.time(z.granted_at);return z.person_id===pid&&z.permission===role&&z.scope_id===scope&&['grower','buyer'].includes(z.scope_kind)&&active(z.scope_kind,scope,t)&&active('person',z.granted_by,g)&&g!==null&&g<=t&&g<=T.time(z.recorded_at)&&T.inside(z.valid_from,z.valid_to,t);});
  if(!xs.length)return null;const row=xs[0];return {authorized:true,available_at:row.values.available_at,source_document_id:row.values.source_document_id};
 }
 return {v,doc,resolve:active,authorize};
}
module.exports={context,MAP};
