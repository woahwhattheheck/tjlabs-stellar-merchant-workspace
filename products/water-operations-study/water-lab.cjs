'use strict';
const {FIELDS,KINDS,IDS}=require('./lab-schema.cjs');
const T=require('./study-time.cjs'),R=T.R,SHA=require('./sha256.cjs');
const canonical=v=>JSON.stringify(Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]===undefined?null:v[k]])));
const hashRow=row=>SHA.sha256Utf8(canonical(row.values||row)).sha256;
const unique=a=>[...new Set(a)];
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const value=r=>r?r.values:null;
function analyze(records,options={}){
 const cutoff=T.time(options.as_of),issues=[],all={},extracts={},countStatus={};
 const issue=(code,family,id,detail,at)=>{const x={code,family,id:id||'',detail,at:at||options.as_of};const key=JSON.stringify(x);if(!seenIssues.has(key)){seenIssues.add(key);issues.push(x);}};
 const seenIssues=new Set();
 if(cutoff===null)return {schema:'water.lab-analysis.v1',as_of:options.as_of||'',input_valid:false,population_complete:false,issues:[{code:'AS_OF_REQUIRED',detail:'An explicit valid ISO8601 cutoff is required'}]};
 const instant=n=>new Date(n).toISOString();
 const allowedExtract={};
 for(const f of KINDS){
  const input=Array.isArray(records?.[f])?records[f]:[];
  if(!Array.isArray(records?.[f]))issue('FAMILY_NOT_SUPPLIED',f,'','Supply the complete family, including an explicit empty array');
  const ex=options.extract_available_at?.[f];
  allowedExtract[f]=T.time(ex)!==null&&T.time(ex)<=cutoff;
  extracts[f]=ex||'';
  if(!allowedExtract[f])issue('EXTRACT_UNAVAILABLE',f,'','The selected source edition must be available at the analysis cutoff');
  const expected=options.expected_counts?.[f];
  countStatus[f]={expected:Number.isInteger(expected)&&expected>=0?expected:null,observed:input.length,matched:Number.isInteger(expected)&&expected===input.length};
  if(!countStatus[f].matched)issue('POPULATION_COUNT_UNRESOLVED',f,'','A matching declared complete source-row count is required');
  all[f]=input.map((row,index)=>{
   const v=plain(row?.values)?row.values:row;const out={values:{},source:row?.source||null,index};
   if(!plain(v)){issue('ROW_NOT_OBJECT',f,'','Rows must be objects');out.invalid=true;return out;}
   for(const k of FIELDS[f])out.values[k]=v[k]===undefined?null:v[k];
   const unavailable=FIELDS[f].filter(k=>out.values[k]===null);if(unavailable.length){issue('CANONICAL_CELL_UNAVAILABLE',f,String(v.id||''),'Canonical cells are unobserved: '+unavailable.join(', '));out.invalid=true;}
   if(Object.values(out.values).some(x=>x!==null&&typeof x!=='string')){issue('SCALAR_TEXT_REQUIRED',f,String(v.id||''),'All canonical cells must be strings or null');out.invalid=true;}
   const extra=Object.keys(v).filter(k=>!FIELDS[f].includes(k));if(extra.length){issue('UNRECOGNISED_COLUMNS',f,String(v.id||''),extra.join(', '));out.invalid=true;}
   if(row?.extract_available_at&&T.time(row.extract_available_at)!==T.time(ex)){issue('EXTRACT_TIME_CONFLICT',f,String(v.id||''),'Row wrapper and family extract availability must agree');out.invalid=true;}
   out.hash=hashRow(out.values);return out;
  });
 }
 function context(kind,id,at,system){
  if(!id||typeof options.resolve!=='function')return null;
  let c;try{c=options.resolve(kind,id,instant(at));}catch{return null;}
  if(!plain(c)||c.id!==id||T.time(c.available_at)===null||T.time(c.available_at)>at||system&&c.system_id!==system)return null;
  return c;
 }
 function document(id,at){
  if(!id||typeof options.document!=='function')return null;
  let d;try{d=options.document(id,instant(at));}catch{return null;}
  return plain(d)&&d.id===id&&T.time(d.available_at)!==null&&T.time(d.available_at)<=at?d:null;
 }
 function authority(role,person,system,at){
  if(!context('person',person,at)||typeof options.authorize!=='function')return false;
  let a;try{a=options.authorize(role,person,system,instant(at));}catch{return false;}
  return !!(a?.authorized===true&&T.time(a.available_at)!==null&&T.time(a.available_at)<=at&&document(a.source_document_id,at));
 }
 const snapCache=new Map();
 function snapshot(at){
  if(snapCache.has(at))return snapCache.get(at);
  const out={known:{},current:{},selected:new Set(),valid:new Map()};snapCache.set(at,out);
  for(const f of KINDS){
   const known=allowedExtract[f]?all[f].filter(r=>!r.invalid&&T.time(r.values.available_at)!==null&&T.time(r.values.available_at)<=at):[];
   const ids=new Map(),groups=new Map();out.known[f]=new Map();out.current[f]=[];
   for(const r of known){const v=r.values;if(!ids.has(v.id))ids.set(v.id,[]);ids.get(v.id).push(r);}
   const good=new Map(),busy=new Set();
   function valid(r){
    if(good.has(r))return good.get(r);if(busy.has(r))return false;busy.add(r);
    const v=r.values,recorded=T.time(v.recorded_at),available=T.time(v.available_at);
    let ok=!!v.id&&!!v.record_key&&/^[1-9]\d*$/.test(v.revision)&&['active','void'].includes(v.record_status)&&ids.get(v.id)?.length===1&&recorded!==null&&recorded<=available&&!!v.source_ref&&!!document(v.source_document_id,available);
    if(v.supersedes_id){const ps=ids.get(v.supersedes_id)||[],p=ps[0];ok=ok&&ps.length===1&&valid(p)&&p.values.record_key===v.record_key&&BigInt(p.values.revision)+1n===BigInt(v.revision)&&T.time(p.values.available_at)<=available&&T.time(p.values.recorded_at)<=recorded;}
    else ok=ok&&v.revision==='1';
    busy.delete(r);good.set(r,!!ok);return !!ok;
   }
   for(const r of known)if(valid(r)){if(!groups.has(r.values.record_key))groups.set(r.values.record_key,[]);groups.get(r.values.record_key).push(r);}
   for(const [key,rs]of groups){
    const superseded=new Set(rs.map(r=>r.values.supersedes_id).filter(Boolean)),leaves=rs.filter(r=>!superseded.has(r.values.id));
    if(leaves.length!==1){if(at===cutoff)issue('REVISION_CONFLICT',f,key,'Multiple unconnected current revisions are present');continue;}
    for(const r of rs){out.known[f].set(r.values.id,r);out.valid.set(f+':'+r.values.id,r);}
    if(leaves[0].values.record_status==='active'){out.current[f].push(leaves[0]);out.selected.add(f+':'+leaves[0].values.id);}
   }
   if(at===cutoff)for(const r of known)if(!valid(r))issue('SOURCE_VERSION_UNRESOLVED',f,r.values.id,'Unique identity, complete revision chain, ordered availability and original source document are required');
   if(at===cutoff)for(const r of all[f])if(!r.invalid&&(T.time(r.values.available_at)===null||T.time(r.values.recorded_at)===null))issue('SOURCE_TIME_UNRESOLVED',f,r.values.id,'Record and availability timestamps must be explicit valid instants');
  }
  for(const f of KINDS){const groups=new Map();for(const r of out.current[f]){const business=r.values[IDS[f]];if(!business)continue;if(!groups.has(business))groups.set(business,[]);groups.get(business).push(r);}for(const [business,rs]of groups)if(rs.length>1){const keys=new Set(rs.map(r=>r.values.record_key));for(const [id,r]of out.known[f])if(keys.has(r.values.record_key)){out.known[f].delete(id);out.selected.delete(f+':'+id);}out.current[f]=out.current[f].filter(r=>!keys.has(r.values.record_key));if(at===cutoff)issue('BUSINESS_ID_CONFLICT',f,business,'Multiple current business records claim the same canonical identity');}}
  return out;
 }
 function ref(f,id,at,current=false){const s=snapshot(at),r=s.known[f].get(id);return r&&r.values.record_status==='active'&&(!current||s.selected.has(f+':'+id))?r:null;}
 const root=snapshot(cutoff),evaluation=new Map(),evaluationBusy=new Set();
 const outRow=(f,r,status,extra={})=>({family:f,record_id:r.values.id,record_key:r.values.record_key,record_sha256:r.hash,source:r.source,source_document_id:r.values.source_document_id,source_ref:r.values.source_ref,valid:status,...extra});
 function fail(f,r,detail,at){issue('LAB_RELATION_UNRESOLVED',f,r.values.id,detail,instant(at));return null;}
 function event(v,key){const at=T.time(v[key]);return at!==null&&at<=T.time(v.recorded_at)?at:null;}
 function evaluate(f,id,at=cutoff){
  const key=f+':'+id+'@'+at;if(evaluation.has(key))return evaluation.get(key);if(evaluationBusy.has(key))return null;
  const r=ref(f,id,at);if(!r)return null;evaluationBusy.add(key);const v=r.values;let x=null;
  const done=y=>{evaluationBusy.delete(key);evaluation.set(key,y);return y;};
  const bad=d=>{fail(f,r,d,at);return done(null);};
  if(f==='lab_laboratories'){
   if(!v.laboratory_id||!v.name||T.time(v.valid_from)===null||v.valid_to&&T.time(v.valid_to)===null||v.valid_to&&T.time(v.valid_to)<=T.time(v.valid_from)||!document(v.scope_document_id,T.time(v.available_at)))return bad('Laboratory identity, dated scope document and valid period are required');
   x=outRow(f,r,true,{laboratory_id:v.laboratory_id,name:v.name});
  }else if(f==='lab_orders'){
   const t=event(v,'ordered_at'),system=t!==null&&context('system',v.system_id,t),loc=t!==null&&context('location',v.location_id,t,v.system_id),schedule=t!==null&&context('schedule',v.schedule_id,t,v.system_id);
   if(t===null||!v.order_id||!system||!loc||loc.purpose!==v.purpose||!schedule||T.time(schedule.approved_at)===null||T.time(schedule.approved_at)>t||!T.inside(schedule.valid_from,schedule.valid_to||'',t)||!T.inside(v.valid_from,v.valid_to,t)||!authority('report-preparer',v.ordered_by,v.system_id,t))return bad('A known approved system schedule, matching location purpose and authorised dated order are required');
   x=outRow(f,r,true,{system_id:v.system_id,location_id:v.location_id,purpose:v.purpose,ordered_at:v.ordered_at});
  }else if(f==='lab_order_lines'){
   const order=ref('lab_orders',v.order_record_id,T.time(v.available_at)),ov=order?.values;
   if(!v.order_line_id||!order||!evaluate('lab_orders',order.values.id,at)||!v.analyte||!v.unit||T.time(v.due_at)===null||T.time(v.due_at)<T.time(ov.ordered_at)||v.maximum_reporting_limit&&!T.positive(v.maximum_reporting_limit))return bad('An exact valid order, analyte, unit, due time and optional positive reporting resolution are required');
   x=outRow(f,r,true,{system_id:ov.system_id,order_record_id:v.order_record_id,analyte:v.analyte,method:v.method,unit:v.unit});
  }else if(f==='lab_samples'){
   const t=event(v,'collected_at'),order=t!==null&&ref('lab_orders',v.order_record_id,t,true),ov=order?.values;
   if(t===null||!v.sample_id||!v.container_id||!order||!evaluate('lab_orders',ov.id,t)||ov.system_id!==v.system_id||ov.location_id!==v.location_id||ov.purpose!==v.purpose||!T.inside(ov.valid_from,ov.valid_to,t)||!authority('collector',v.collector_id,v.system_id,t))return bad('Collection must bind the order known then, exact system/location/purpose, container and authorised collector');
   x=outRow(f,r,true,{sample_id:v.sample_id,system_id:v.system_id,location_id:v.location_id,purpose:v.purpose,collected_at:v.collected_at,order_record_id:v.order_record_id});
  }else if(f==='lab_custody_events'){
   const t=event(v,'event_at'),sample=ref('lab_samples',v.sample_record_id,T.time(v.available_at)),sv=sample?.values;
   if(t===null||!sample||!evaluate('lab_samples',sv.id,at)||!v.custody_event_id||!/^[1-9]\d*$/.test(v.sequence)||!['collected','transferred','received','rejected'].includes(v.event_type)||t<T.time(sv.collected_at)||!v.to_party_id||!v.receipt_ref||!v.condition||!context('person',v.actor_id,t))return bad('A valid sample, explicit custody sequence, dated handoff, recipient, condition, receipt and known actor are required');
   if(v.event_type==='collected'&&(t!==T.time(sv.collected_at)||v.from_party_id||v.actor_id!==sv.collector_id||v.to_party_id!==sv.collector_id))return bad('The collection custody event must begin with the actual collector and collection time');
   if(v.event_type!=='collected'&&!v.from_party_id)return bad('A handoff must identify the preceding custodian');
   x=outRow(f,r,true,{sample_record_id:sv.id,event_type:v.event_type,sequence:v.sequence,event_at:v.event_at,from_party_id:v.from_party_id,to_party_id:v.to_party_id});
  }else if(f==='lab_accessions'){
   const t=event(v,'received_at'),sample=ref('lab_samples',v.sample_record_id,T.time(v.available_at)),lab=t!==null&&ref('lab_laboratories',v.laboratory_record_id,t,true),sv=sample?.values,lv=lab?.values;
   if(t===null||!sample||!lab||!evaluate('lab_samples',sv.id,at)||!evaluate('lab_laboratories',lv.id,at)||!v.accession_id||!v.lab_sample_id||!T.inside(lv.valid_from,lv.valid_to,t)||!['accepted','rejected'].includes(v.disposition)||v.disposition==='rejected'&&!v.rejection_reason||!authority('lab-receiver',v.received_by,sv.system_id,t))return bad('Accession requires the actual sample, laboratory, scope period, receiver and accepted/rejected disposition');
   const peers=snapshot(at).current.lab_accessions.filter(q=>q.values.lab_sample_id===v.lab_sample_id&&ref('lab_laboratories',q.values.laboratory_record_id,at)?.values.laboratory_id===lv.laboratory_id);
   if(peers.length>1)return bad('Laboratory sample identity is duplicated across accession records');
   const chain=custody(v.sample_record_id,T.time(v.available_at)),last=chain.events.find(q=>q.record_id===v.custody_event_record_id);
   if(!chain.valid||!last||last.event_at!==v.received_at||last.to_party_id!==lv.laboratory_id||last.event_type!==(v.disposition==='accepted'?'received':'rejected')||chain.events.at(-1).record_id!==last.record_id)return bad('Accession must match the final unambiguous custody receipt and laboratory recipient');
   x=outRow(f,r,true,{sample_record_id:sv.id,system_id:sv.system_id,laboratory_id:lv.laboratory_id,lab_sample_id:v.lab_sample_id,disposition:v.disposition,received_at:v.received_at});
  }else if(f==='lab_reports'){
   const t=event(v,'issued_at'),lab=t!==null&&ref('lab_laboratories',v.laboratory_record_id,t,true);
   if(t===null||!v.report_id||!v.lab_report_ref||!lab||!evaluate('lab_laboratories',lab.values.id,at)||!T.inside(lab.values.valid_from,lab.values.valid_to,t)||!context('system',v.system_id,t)||T.time(v.coverage_start)===null||T.time(v.coverage_end)===null||T.time(v.coverage_start)>=T.time(v.coverage_end)||T.time(v.coverage_end)>t)return bad('Laboratory report requires a known laboratory/system, valid issue time and explicit completed coverage interval');
   x=outRow(f,r,true,{system_id:v.system_id,laboratory_id:lab.values.laboratory_id,issued_at:v.issued_at,coverage_start:v.coverage_start,coverage_end:v.coverage_end});
  }else if(f==='lab_results'){
   const report=ref('lab_reports',v.report_record_id,T.time(v.available_at)),rv=report?.values,acc=ref('lab_accessions',v.accession_record_id,T.time(v.analysed_at),true),av=acc?.values,line=ref('lab_order_lines',v.order_line_record_id,T.time(v.analysed_at),true),lv=line?.values;
   const sample=av&&ref('lab_samples',av.sample_record_id,T.time(v.available_at)),sv=sample?.values,t=event(v,'analysed_at');
   if(!v.result_id||!report||!acc||!line||!sample||!evaluate('lab_reports',rv.id,at)||!evaluate('lab_accessions',av.id,T.time(v.analysed_at))||av.disposition!=='accepted'||!evaluate('lab_order_lines',lv.id,at)||rv.system_id!==sv.system_id||ref('lab_laboratories',rv.laboratory_record_id,at)?.values.laboratory_id!==ref('lab_laboratories',av.laboratory_record_id,at)?.values.laboratory_id||lv.order_record_id!==sv.order_record_id||v.analyte!==lv.analyte||v.unit!==lv.unit||!v.method||lv.method&&v.method!==lv.method||t===null||t<T.time(av.received_at)||t>T.time(rv.issued_at)||T.time(rv.issued_at)>T.time(v.available_at)||T.time(sv.collected_at)<T.time(rv.coverage_start)||T.time(sv.collected_at)>=T.time(rv.coverage_end))return bad('Result must bind an accepted accession and requested analyte/method/unit known at analysis time, with exact system/report coverage');
   const measurement=interpret(v);if(!measurement)return bad('Result qualifier, original value and detection/reporting limits cannot be interpreted');
   const resolution=lv.maximum_reporting_limit?T.positive(v.reporting_limit)&&R.cmp(T.positive(v.reporting_limit),T.positive(lv.maximum_reporting_limit))<=0n:true;
   x=outRow(f,r,true,{system_id:sv.system_id,sample_record_id:sv.id,sample_id:sv.sample_id,location_id:sv.location_id,purpose:sv.purpose,collected_at:sv.collected_at,report_record_id:rv.id,accession_record_id:av.id,order_line_record_id:lv.id,analyte:v.analyte,method:v.method,unit:v.unit,measurement,resolution_satisfied:!!resolution,usable:v.qualifier!=='invalid'&&!!resolution,late_for_requested_due:T.time(rv.issued_at)>T.time(lv.due_at)});
  }else if(f==='lab_reviews'){
   const t=event(v,'reviewed_at'),result=t!==null&&ref('lab_results',v.result_record_id,t),analysis=result&&evaluate('lab_results',result.values.id,t);
   if(t===null||!v.review_id||!result||result.hash!==v.result_sha256||!analysis||!['accepted','rejected','needs_review'].includes(v.decision)||!authority('lab-reviewer',v.reviewed_by,analysis.system_id,t)||!effectiveForResult(result.values.id,t))return bad('Human review must bind the exact currently effective result and an authorised reviewer known at decision time');
   if(v.decision==='accepted'&&!analysis.usable)return bad('A result with unresolved analytical resolution or invalid qualifier cannot be accepted');
   x=outRow(f,r,true,{system_id:analysis.system_id,result_record_id:result.values.id,decision:v.decision,reviewed_at:v.reviewed_at});
  }else if(f==='lab_report_inputs'){
   const t=event(v,'selected_at'),result=t!==null&&ref('lab_results',v.result_record_id,t),analysis=result&&evaluate('lab_results',result.values.id,t),review=t!==null&&ref('lab_reviews',v.review_record_id,t,true),ra=review&&evaluate('lab_reviews',review.values.id,t),target=t!==null&&context('report',v.target_report_id,t);
   if(t===null||!v.input_id||!result||result.hash!==v.result_sha256||!analysis?.usable||!ra||ra.decision!=='accepted'||ra.result_record_id!==result.values.id||latestReview(result.values.id,t)?.record_id!==review.values.id||!target||target.system_id!==analysis.system_id||target.purpose!==analysis.purpose||T.time(target.interval_start)===null||T.time(target.interval_end)===null||T.time(analysis.collected_at)<T.time(target.interval_start)||T.time(analysis.collected_at)>=T.time(target.interval_end)||!authority('report-preparer',v.selected_by,analysis.system_id,t)||!effectiveForResult(result.values.id,t))return bad('Report input requires the exact reviewed result, authorised selection and matching target system/purpose/coverage');
   x=outRow(f,r,true,{system_id:analysis.system_id,target_report_id:v.target_report_id,result_record_id:result.values.id,review_record_id:review.values.id,selected_at:v.selected_at,historically_valid:true,current_effective:!!effectiveForResult(result.values.id,cutoff),current_review_decision:latestReview(result.values.id,cutoff)?.decision||'unresolved'});
  }else if(f==='lab_sample_links'){
   const t=event(v,'linked_at'),sample=t!==null&&ref('lab_samples',v.sample_record_id,t),prior=t!==null&&ref('lab_samples',v.prior_sample_record_id,t),sa=sample&&evaluate('lab_samples',sample.values.id,t),pa=prior&&evaluate('lab_samples',prior.values.id,t);
   if(t===null||!v.link_id||!sample||!prior||sample.values.id===prior.values.id||!sa||!pa||sa.system_id!==pa.system_id||sa.location_id!==pa.location_id||sa.purpose!==pa.purpose||T.time(sa.collected_at)<T.time(pa.collected_at)||!['repeat','resample','field_duplicate'].includes(v.relationship)||!v.reason||!authority('collector',v.linked_by,sa.system_id,t))return bad('Sample relationship requires distinct matching system/location/purpose samples and an authorised stated reason');
   x=outRow(f,r,true,{system_id:sa.system_id,sample_record_id:sample.values.id,prior_sample_record_id:prior.values.id,relationship:v.relationship});
  }
  return done(x);
 }
 function interpret(v){
  const q=v.qualifier,rl=v.reporting_limit?T.positive(v.reporting_limit):null,dl=v.detection_limit?T.nonnegative(v.detection_limit):null;
  if(v.reporting_limit&&!rl||v.detection_limit&&!dl||dl&&rl&&R.cmp(dl,rl)>0n)return null;
  const base={qualifier:q,original_value:v.value_text,reporting_limit:rl?R.value(rl):null,detection_limit:dl?R.value(dl):null,interval:null};
  if(['eq','lt','le','gt','ge'].includes(q)){const n=T.decimal(v.value_text);if(!n)return null;base.interval={lower:['eq','gt','ge'].includes(q)?R.value(n):null,upper:['eq','lt','le'].includes(q)?R.value(n):null,lower_inclusive:['eq','ge'].includes(q),upper_inclusive:['eq','le'].includes(q)};return base;}
  if(q==='nd'){if(!rl&&!dl)return null;return {...base,meaning:'Reported nondetect; retained limits do not imply a numeric zero or an inferred bound'};}
  if(['present','absent','invalid'].includes(q))return {...base,meaning:q};return null;
 }
 const custodyCache=new Map();
 function custody(sampleId,at){
  const key=sampleId+'@'+at;if(custodyCache.has(key))return custodyCache.get(key);
  const rs=snapshot(at).current.lab_custody_events.filter(r=>r.values.sample_record_id===sampleId),events=rs.map(r=>evaluate('lab_custody_events',r.values.id,at)).filter(Boolean).sort((a,b)=>Number(BigInt(a.sequence)-BigInt(b.sequence)));
  let ok=events.length>0&&events.length===rs.length,current='',previous=-Infinity;const sequences=new Set();
  for(let i=0;i<events.length;i++){const e=events[i],r=rs.find(r=>r.values.id===e.record_id);if(sequences.has(e.sequence)||BigInt(e.sequence)!==BigInt(i+1)||T.time(e.event_at)<previous)ok=false;sequences.add(e.sequence);
   if(i===0){if(e.event_type!=='collected')ok=false;}else if(e.event_type==='collected'||e.from_party_id!==current||['received','rejected'].includes(events[i-1].event_type))ok=false;
   current=e.to_party_id;previous=T.time(e.event_at);if(!r)ok=false;
  }
  const out={sample_record_id:sampleId,valid:ok,events,current_custodian:current};custodyCache.set(key,out);return out;
 }
 const reportSetCache=new Map(),reportSetBusy=new Set();
 function reportSet(reportId,at){
  const key=reportId+'@'+at;if(reportSetCache.has(key))return reportSetCache.get(key);if(reportSetBusy.has(key))return null;reportSetBusy.add(key);
  const r=ref('lab_reports',reportId,at),v=r?.values,base=r&&evaluate('lab_reports',reportId,at);
  let out=null;
  if(base){
   const reportRows=[...snapshot(at).known.lab_results.values()].filter(q=>q.values.report_record_id===reportId),latestByKey=new Map();for(const q of reportRows){const p=latestByKey.get(q.values.record_key);if(!p||BigInt(q.values.revision)>BigInt(p.values.revision))latestByKey.set(q.values.record_key,q);}const own=[...latestByKey.values()].filter(q=>q.values.record_status==='active'),analyses=own.map(q=>evaluate('lab_results',q.values.id,at)),ownValid=analyses.every(Boolean);
   const identities=own.map(q=>q.values.accession_record_id+'\u0000'+q.values.order_line_record_id),distinct=new Set(identities).size===identities.length;
   let set=analyses.filter(Boolean).map(q=>q.record_id),ok=ownValid&&distinct&&(own.length>0||!!v.supersedes_id),actions=[];
   if(v.supersedes_id){
    const prior=ref('lab_reports',v.supersedes_id,T.time(v.issued_at)),ps=prior&&reportSet(prior.values.id,at);
    const am=snapshot(at).current.lab_amendments.filter(q=>q.values.report_record_id===reportId);
    ok=ok&&!!ps?.valid&&prior.values.laboratory_record_id===v.laboratory_record_id&&prior.values.system_id===v.system_id&&T.time(prior.values.issued_at)<T.time(v.issued_at);
    const seen=new Set(),replacements=new Set();
    for(const ar of am){
     const a=ar.values,t=event(a,'authorised_at'),old=ref('lab_results',a.prior_result_record_id,T.time(v.issued_at)),replacement=a.replacement_result_record_id&&ref('lab_results',a.replacement_result_record_id,at);
     let valid=!!(a.amendment_id&&prior&&old&&a.prior_report_record_id===prior.values.id&&a.prior_report_sha256===prior.hash&&a.prior_result_sha256===old.hash&&ps?.result_record_ids.includes(old.values.id)&&!seen.has(old.values.id)&&['replace','withdraw','carry_forward'].includes(a.action)&&a.reason&&t!==null&&t<=T.time(v.issued_at)&&T.time(ar.values.available_at)<=at&&authority('lab-reviewer',a.authorised_by,v.system_id,t));
     if(a.action==='replace')valid=valid&&!!replacement&&replacement.values.report_record_id===reportId&&set.includes(replacement.values.id)&&!replacements.has(replacement.values.id)&&replacement.values.accession_record_id===old.values.accession_record_id&&replacement.values.order_line_record_id===old.values.order_line_record_id;
     else valid=valid&&!a.replacement_result_record_id;
     if(a.action==='carry_forward'&&valid)set.push(old.values.id);
     if(a.action==='replace'&&replacement)replacements.add(replacement.values.id);seen.add(old?.values.id||'');
     actions.push(outRow('lab_amendments',ar,valid,{action:a.action,prior_result_record_id:a.prior_result_record_id,replacement_result_record_id:a.replacement_result_record_id}));
     if(!valid){ok=false;issue('AMENDMENT_UNRESOLVED','lab_amendments',a.id,'Amendment requires exact prior report/result hashes, matching replacement and authority at issue time',instant(at));}
    }
    if(!ps||ps.result_record_ids.some(id=>!seen.has(id))){ok=false;issue('AMENDMENT_COVERAGE_INCOMPLETE','lab_reports',reportId,'Every prior result requires an explicit replace, withdraw or carry-forward disposition',instant(at));}
   }else if(snapshot(at).current.lab_amendments.some(q=>q.values.report_record_id===reportId)){ok=false;issue('AMENDMENT_WITHOUT_PREDECESSOR','lab_reports',reportId,'An original report cannot amend an absent predecessor',instant(at));}
   const semantic=set.map(id=>{const q=ref('lab_results',id,at);return q.values.accession_record_id+'\u0000'+q.values.order_line_record_id;});
   if(new Set(semantic).size!==semantic.length)ok=false;
   if(!ok)issue('REPORT_RESULT_SET_UNRESOLVED','lab_reports',reportId,'The report has unresolved, duplicate or unaccounted result lineage',instant(at));
   out={...base,valid:ok,result_record_ids:unique(set),amendments:actions};
  }
  reportSetBusy.delete(key);reportSetCache.set(key,out);return out;
 }
 function latestReview(id,at){const candidates=snapshot(at).current.lab_reviews.filter(r=>r.values.result_record_id===id).map(r=>evaluate('lab_reviews',r.values.id,at)).filter(Boolean).sort((a,b)=>T.time(b.reviewed_at)-T.time(a.reviewed_at));return candidates.length&&(!candidates[1]||T.time(candidates[0].reviewed_at)!==T.time(candidates[1].reviewed_at))?candidates[0]:null;}
 function effectiveForResult(id,at){for(const rr of snapshot(at).current.lab_reports){const s=reportSet(rr.values.id,at);if(s?.valid&&s.result_record_ids.includes(id))return s;}return null;}
 const results={};for(const f of KINDS)if(f!=='lab_amendments')results[f]=root.current[f].map(r=>{const a=evaluate(f,r.values.id,cutoff);return a||outRow(f,r,false);});
 const reportSets=root.current.lab_reports.map(r=>reportSet(r.values.id,cutoff)||outRow('lab_reports',r,false));
 results.lab_amendments=root.current.lab_amendments.map(r=>{const set=reportSet(r.values.report_record_id,cutoff),action=set?.amendments?.find(a=>a.record_id===r.values.id);if(action)return action;issue('ORPHAN_AMENDMENT','lab_amendments',r.values.id,'Amendment has no usable predecessor/report binding');return outRow('lab_amendments',r,false);});
 const custodyChains=root.current.lab_samples.map(r=>custody(r.values.id,cutoff));
 for(const x of custodyChains)if(!x.valid)issue('CUSTODY_CHAIN_UNRESOLVED','lab_samples',x.sample_record_id,'Custody must be consecutive, chronological and connect actual custodians to its final receipt');
 const boundInputs=results.lab_report_inputs||[],inputGroups=new Map();for(const x of boundInputs)if(x.valid){const result=ref('lab_results',x.result_record_id,cutoff).values;const k=x.target_report_id+'\u0000'+result.accession_record_id+'\u0000'+result.order_line_record_id;if(!inputGroups.has(k))inputGroups.set(k,[]);inputGroups.get(k).push(x);}for(const group of inputGroups.values())if(group.length>1)for(const x of group){x.valid=false;issue('DUPLICATE_REPORT_INPUT','lab_report_inputs',x.record_id,'Multiple current selections target the same sample analysis in one report');}
 const metadata={};for(const f of KINDS)metadata[f]={...countStatus[f],extract_available_at:extracts[f],known_versions:root.known[f].size,current_records:root.current[f].length};
 const structural=issues.some(i=>['ROW_NOT_OBJECT','SCALAR_TEXT_REQUIRED','CANONICAL_CELL_UNAVAILABLE','UNRECOGNISED_COLUMNS','EXTRACT_TIME_CONFLICT','SOURCE_VERSION_UNRESOLVED','SOURCE_TIME_UNRESOLVED','REVISION_CONFLICT','BUSINESS_ID_CONFLICT'].includes(i.code));
 const population=options.population_complete===true&&KINDS.every(f=>allowedExtract[f]&&countStatus[f].matched);
 return {schema:'water.lab-analysis.v1',as_of:options.as_of,input_valid:!structural,population_complete:population,source_metadata:metadata,records:results,custody_chains:custodyChains,report_result_sets:reportSets,summary:{samples:results.lab_samples.filter(x=>x.valid).length,accepted_accessions:results.lab_accessions.filter(x=>x.valid&&x.disposition==='accepted').length,rejected_accessions:results.lab_accessions.filter(x=>x.valid&&x.disposition==='rejected').length,effective_results:unique(reportSets.filter(x=>x.valid).flatMap(x=>x.result_record_ids)).length,usable_effective_results:unique(reportSets.filter(x=>x.valid).flatMap(x=>x.result_record_ids)).filter(id=>evaluate('lab_results',id,cutoff)?.usable).length,valid_report_inputs:boundInputs.filter(x=>x.valid).length,inputs_needing_amendment_reconciliation:boundInputs.filter(x=>x.valid&&(!x.current_effective||x.current_review_decision!=='accepted')).length},issues};
}
module.exports={FIELDS,KINDS,IDS,hashRow,analyze};
