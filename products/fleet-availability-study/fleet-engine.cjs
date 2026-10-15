'use strict';
const View=require('./source-view.cjs'),Schema=require('./schema.cjs'),T=require('./study-time.cjs'),SHA=require('./sha256.cjs');
const {time,positive,nonnegative,inside,overlap,union,duration,R}=T,hash=x=>SHA.sha256Utf8(JSON.stringify(x)).sha256,sum=xs=>R.sum(xs),q=x=>x?R.value(x):null;
const releaseBasis=(r,requirements,inputs)=>hash({release:r.values||r,requirements:requirements.map(x=>x.values||x).sort((a,b)=>a.id.localeCompare(b.id)),inputs:inputs.map(x=>x.values||x).sort((a,b)=>a.id.localeCompare(b.id))});
function analyze(records,options={}){
 const v=View.create(records,options);if(v.cutoff===undefined)return v;
 const cut=v.cutoff,cache=new Map(),busy=new Set(),current=(f,at=cut)=>v.snapshot(at).current[f],event=(z,k)=>time(z[k])!==null&&time(z[k])<=time(z.recorded_at)?time(z[k]):null;
 const out=(f,r,x={})=>({family:f,record_id:r.values.id,record_key:r.values.record_key,record_sha256:r.hash,source:r.source,source_document_id:r.values.source_document_id,source_ref:r.values.source_ref,valid:true,...x});
 const issue=(f,r,msg,at=cut)=>{v.issue('FLEET_RELATION_UNRESOLVED',f,r?.values.id,msg,v.instant(at));return null;};
 const ctxKinds={operator:'operators',depot:'depots',vehicle:'vehicles',person:'people',supplier:'suppliers'};
 function context(kind,id,at){const f=ctxKinds[kind];if(!f||!Number.isFinite(at))return null;const xs=current(f,at).filter(r=>r.values[Schema.IDS[f]]===id);if(xs.length!==1)return null;const r=xs[0],z=r.values,known=v.snapshot(at).known[f];if(!inside(z.valid_from,z.valid_to,at))return null;if(v.all[f].some(x=>(x.values.record_key===z.record_key||x.values[Schema.IDS[f]]===id)&&time(x.values.available_at)!==null&&time(x.values.available_at)<=at&&!known.has(x.values.id)))return null;return evaluate(f,z.id,at);}
 function authority(role,person,operator,depot,at){const p=context('person',person,at);if(!p||p.operator_id!==operator)return false;return current('authorities',at).some(r=>{const z=r.values,g=event(z,'granted_at');return z.permission===role&&z.person_id===person&&z.operator_id===operator&&(!z.depot_id||z.depot_id===depot)&&g!==null&&g<=at&&inside(z.valid_from,z.valid_to,at)&&context('person',z.granted_by,g)?.operator_id===operator&&(!z.depot_id||context('depot',z.depot_id,at)?.operator_id===operator);});}
 function vehicle(id,at){return context('vehicle',id,at);}
 function depotAt(vehicleId,at){const xs=current('fleet_assignments',at).filter(r=>r.values.vehicle_id===vehicleId&&event(r.values,'entered_at')!==null&&time(r.values.entered_at)<=at&&(r.values.left_at===''||time(r.values.left_at)>at));return xs.length===1?xs[0].values.depot_id:'';}
 function actor(role,id,vehicleId,at){const a=vehicle(vehicleId,at);return a&&authority(role,id,a.operator_id,depotAt(vehicleId,at),at);}
 const parent=(f,id,at)=>{const r=v.ref(f,id,at);return r&&evaluate(f,id,at);};
 const states={fault_events:['open','resolved','reopened'],work_events:['queued','started','paused','completed','cancelled'],supplier_events:['requested','accepted','started','waiting','completed','cancelled'],safety_events:['held','cleared','reopened'],duty_events:['departed','completed','returned','cancelled']};
 function evaluate(f,id,at=cut){const key=f+':'+id+'@'+at;if(cache.has(key))return cache.get(key);if(busy.has(key))return null;const r=v.ref(f,id,at);if(!r)return null;const z=r.values;busy.add(key);const done=x=>{busy.delete(key);cache.set(key,x);return x;},bad=m=>done(issue(f,r,m,at));let x;
 if(['operators','depots','vehicles','people','suppliers'].includes(f)){
  if(!z[Schema.IDS[f]]||time(z.valid_from)===null||z.valid_to!==''&&(time(z.valid_to)===null||time(z.valid_to)<=time(z.valid_from)))return bad('Exact dated source identity is required');
  if(f!=='vehicles'&&!z.name)return bad('Retain the actual source name');
  if(['depots','vehicles','people'].includes(f)&&!context('operator',z.operator_id,time(z.valid_from)))return bad('Historical operator context is unresolved');
  if(f==='vehicles'&&(!z.physical_key||!z.vehicle_class||!positive(z.seats)||current(f,at).filter(a=>a.values.physical_key===z.physical_key&&a.values.operator_id===z.operator_id).length!==1))return bad('One physical vehicle identity, actual class and positive seat count are required');
  x=out(f,r,{...z,record_id:id,record_sha256:r.hash});
 }else if(f==='authorities'){
  const g=event(z,'granted_at');if(g===null||!z.permission||!inside(z.valid_from,z.valid_to,at)||context('person',z.person_id,at)?.operator_id!==z.operator_id||context('person',z.granted_by,g)?.operator_id!==z.operator_id||z.depot_id&&context('depot',z.depot_id,at)?.operator_id!==z.operator_id)return bad('Named role authority must retain actual grant, operator and optional depot scope');x=out(f,r,{...z});
 }else if(f==='fleet_assignments'){
  const start=event(z,'entered_at'),end=z.left_at===''?null:event(z,'left_at'),a=start!==null&&vehicle(z.vehicle_id,start),d=start!==null&&context('depot',z.depot_id,start);
  if(start===null||z.left_at!==''&&(end===null||end<=start)||!a||d?.operator_id!==a.operator_id)return bad('Fleet membership requires actual vehicle/depot and an ordered entry/exit interval');
  if(current(f,at).some(a=>a.values.record_key!==z.record_key&&a.values.vehicle_id===z.vehicle_id&&overlap(start,end??at,time(a.values.entered_at),a.values.left_at===''?at:time(a.values.left_at))))return bad('Overlapping physical fleet assignments remain unresolved');
  x=out(f,r,{...z,operator_id:a.operator_id,physical_key:a.physical_key,start,end});
 }else if(f==='faults'){
  const t=event(z,'reported_at'),a=t!==null&&vehicle(z.vehicle_id,t);if(t===null||!a||!['true','false'].includes(z.blocks_service)||!z.description||!actor('fault-report',z.reporter_id,z.vehicle_id,t))return bad('Fault requires actual vehicle, observed report, explicit service restriction and scoped reporter');
  x=out(f,r,{...z,operator_id:a.operator_id,physical_key:a.physical_key,start:t,blocks_service:z.blocks_service==='true'});
 }else if(f==='work_orders'){
  const t=event(z,'opened_at'),a=t!==null&&vehicle(z.vehicle_id,t),fault=z.fault_record_id&&parent('faults',z.fault_record_id,t);
  if(t===null||!a||z.fault_record_id&&(!fault||fault.vehicle_id!==z.vehicle_id)||!['true','false'].includes(z.required_for_release)||!z.description||!actor('maintenance',z.owner_id,z.vehicle_id,t))return bad('Work order requires exact vehicle/fault, actual opening and scoped maintenance owner');
  x=out(f,r,{...z,operator_id:a.operator_id,start:t,required_for_release:z.required_for_release==='true'});
 }else if(f==='part_requests'){
  const t=event(z,'requested_at'),w=t!==null&&parent('work_orders',z.work_order_record_id,t),amount=positive(z.quantity);
  if(t===null||!w||!amount||!z.unit||!z.part_number||time(z.needed_at)===null||!context('supplier',z.supplier_id,t)||!['true','false'].includes(z.required_for_release))return bad('Part request requires actual work order, supplier, item, quantity/unit and recorded need date');
  x=out(f,r,{...z,vehicle_id:w.vehicle_id,start:t,quantity:q(amount),required_for_release:z.required_for_release==='true'});
 }else if(f==='part_receipts'){
  const t=event(z,'received_at'),p=t!==null&&parent('part_requests',z.part_request_record_id,t),amount=positive(z.quantity);
  if(t===null||!p||!amount||z.unit!==p.unit||!z.supplier_ref||!actor('parts',z.receiver_id,p.vehicle_id,t))return bad('Actual parts receipt requires exact original request, quantity/unit, supplier reference and receiver');
  x=out(f,r,{...z,vehicle_id:p.vehicle_id,event:t,quantity:q(amount)});
 }else if(f==='part_installations'){
  const t=event(z,'installed_at'),p=t!==null&&parent('part_requests',z.part_request_record_id,t),received=t!==null&&parent('part_receipts',z.receipt_record_id,t),w=t!==null&&parent('work_orders',z.work_order_record_id,t),amount=positive(z.quantity),used=current(f,at).filter(a=>a.values.receipt_record_id===z.receipt_record_id).map(a=>positive(a.values.quantity));
  if(t===null||!p||!received||!w||received.part_request_record_id!==z.part_request_record_id||p.work_order_record_id!==z.work_order_record_id||!amount||z.unit!==p.unit||used.some(x=>!x)||R.cmp(sum(used),R.R(BigInt(received.quantity.numerator),BigInt(received.quantity.denominator)))>0n||!actor('maintenance',z.technician_id,p.vehicle_id,t))return bad('Installed parts require an earlier actual receipt, exact work order and nonduplicated physical quantity');
  x=out(f,r,{...z,vehicle_id:p.vehicle_id,event:t,quantity:q(amount)});
 }else if(f==='supplier_jobs'){
  const t=event(z,'ordered_at'),a=t!==null&&vehicle(z.vehicle_id,t),w=z.work_order_record_id&&parent('work_orders',z.work_order_record_id,t);
  if(t===null||!a||z.work_order_record_id&&(!w||w.vehicle_id!==z.vehicle_id)||!context('supplier',z.supplier_id,t)||time(z.promised_at)===null||!['true','false'].includes(z.required_for_release)||!z.description)return bad('Supplier job requires exact vehicle/work order, actual supplier and separate promised time');
  x=out(f,r,{...z,start:t,required_for_release:z.required_for_release==='true'});
 }else if(f==='safety_cases'){
  const t=event(z,'raised_at'),a=t!==null&&vehicle(z.vehicle_id,t);
  if(t===null||!a||!['true','false'].includes(z.blocks_service)||!z.description||!v.document(z.method_document_id,t)||!actor('safety',z.raised_by,z.vehicle_id,t))return bad('Safety case requires actual dated method original, scoped reviewer and explicit service restriction');
  x=out(f,r,{...z,start:t,blocks_service:z.blocks_service==='true'});
 }
else if(Object.hasOwn(states,f)){
  const map={fault_events:['faults','fault_record_id','maintenance','actor_id'],work_events:['work_orders','work_order_record_id','maintenance','actor_id'],supplier_events:['supplier_jobs','supplier_job_record_id','supplier-coordination','actor_id'],safety_events:['safety_cases','safety_case_record_id','safety','reviewer_id'],duty_events:['duty_assignments','assignment_record_id','operations','actor_id']},[pf,pid,role,aid]=map[f],t=event(z,'event_at'),p=t!==null&&parent(pf,z[pid],t);
  if(t===null||!p||!states[f].includes(z.state)||!actor(role,z[aid],p.vehicle_id,t)||f==='supplier_events'&&!z.supplier_ref||f==='safety_events'&&(z.method_document_id!==p.method_document_id||!v.document(z.method_document_id,t)))return bad('Actual state event requires exact parent, ordered source, declared state and scoped responsible person');
  if(current(f,at).filter(a=>a.values[pid]===z[pid]&&a.values.event_at===z.event_at).length!==1)return bad('Same-instant state changes remain ambiguous');
  x=out(f,r,{...z,vehicle_id:p.vehicle_id,event:t,parent_family:pf,parent_record_id:z[pid]});
 }else if(f==='release_cases'){
  const t=event(z,'opened_at'),a=t!==null&&vehicle(z.vehicle_id,t);
  if(t===null||!a||z.requirements_complete!=='true'||!/^\d+$/.test(z.expected_requirements)||!z.purpose||!actor('operations',z.opened_by,z.vehicle_id,t))return bad('Release case requires exact vehicle, complete declared requirement count and named operations owner');
  x=out(f,r,{...z,start:t});
 }else if(f==='release_requirements'){
  const c=parent('release_cases',z.release_case_record_id,at),allowed={faults:'resolved',work_orders:'completed',part_requests:'installed',supplier_jobs:'completed',safety_cases:'cleared'},p=Object.hasOwn(allowed,z.family)&&parent(z.family,z.record_id,at);
  if(!c||!p||p.vehicle_id!==c.vehicle_id||z.required_state!==allowed[z.family])return bad('Release requirement must identify an exact same-vehicle case and observed completion state');
  x=out(f,r,{...z,vehicle_id:c.vehicle_id});
 }else if(f==='release_inputs'){
  const req=parent('release_requirements',z.requirement_record_id,at),c=parent('release_cases',z.release_case_record_id,at),pairs={faults:'fault_events',work_orders:'work_events',part_requests:'part_installations',supplier_jobs:'supplier_events',safety_cases:'safety_events'},r0=Schema.KINDS.includes(z.family)&&v.ref(z.family,z.record_id,at,true),a=r0&&evaluate(z.family,z.record_id,at);
  if(!req||!c||req.release_case_record_id!==z.release_case_record_id||pairs[req.family]!==z.family||!a||a.vehicle_id!==c.vehicle_id||r0.hash!==z.row_sha256||(z.family==='part_installations'?a.part_request_record_id!==req.record_id:a.parent_record_id!==req.record_id)||z.family!=='part_installations'&&a.state!==req.required_state)return bad('Release input requires exact current completion row/hash for its same-vehicle requirement');
  x=out(f,r,{...z,vehicle_id:c.vehicle_id});
 }else if(f==='release_reviews'){
  const t=event(z,'reviewed_at'),c=t!==null&&parent('release_cases',z.release_case_record_id,t),reqs=current('release_requirements',t).filter(a=>a.values.release_case_record_id===z.release_case_record_id),inputs=current('release_inputs',t).filter(a=>a.values.release_case_record_id===z.release_case_record_id),roles=options.required_review_roles||['safety','operations'];
  if(t===null||!c||!roles.includes(z.role)||!['accepted','revise'].includes(z.decision)||!actor(z.role,z.reviewed_by,c.vehicle_id,t)||releaseBasis(v.ref('release_cases',z.release_case_record_id,t),reqs,inputs)!==z.release_basis_sha256)return bad('Review binds exact release population/input hashes, named role authority and actual decision time');
  const complete=Number(c.expected_requirements)===reqs.length&&reqs.every(a=>evaluate('release_requirements',a.values.id,t))&&inputs.every(a=>evaluate('release_inputs',a.values.id,t))&&reqs.every(a=>inputs.some(x=>x.values.requirement_record_id===a.values.id));
  if(z.decision==='accepted'&&!complete)return bad('Accepted release cannot omit an unresolved or unobserved requirement');
  x=out(f,r,{...z,vehicle_id:c.vehicle_id,event:t,requirements_complete:complete});
 }else if(f==='availability_events'){
  const t=event(z,'event_at'),a=t!==null&&vehicle(z.vehicle_id,t);
  if(t===null||!a||!['available','unavailable','unknown'].includes(z.state)||!z.reason||!actor('operations',z.observer_id,z.vehicle_id,t))return bad('Availability requires actual vehicle observation, recorded reason and scoped operations observer');
  let basis=true;if(z.state==='available'){const rel=z.basis_kind==='release'&&release(z.release_case_record_id,t);basis=rel?.vehicle_id===z.vehicle_id||z.basis_kind==='opening_observation'&&t<=time(options.population_start)&&!z.release_case_record_id&&actor('safety',z.observer_id,z.vehicle_id,t);}
  if(!basis||current(f,at).filter(a=>a.values.vehicle_id===z.vehicle_id&&a.values.event_at===z.event_at).length!==1)return bad('Available state requires actual named release or jointly authorised opening observation; same-time observations must be unique');
  x=out(f,r,{...z,event:t,physical_key:a.physical_key});
 }else if(f==='duty_requirements'){
  const a=event(z,'approved_at'),start=time(z.starts_at),end=time(z.ends_at),d=a!==null&&context('depot',z.depot_id,a);
  if(a===null||start===null||end===null||start>=end||a>start||d?.operator_id!==z.operator_id||!z.vehicle_class||!positive(z.minimum_seats)||!/^[1-9]\d*$/.test(z.required_vehicles)||!authority('operations',z.approved_by,z.operator_id,z.depot_id,a))return bad('Duty requires actual operator/depot, class/capacity, positive vehicle count, service window and approval');
  x=out(f,r,{...z,start,end});
 }else if(f==='duty_assignments'){
  const t=event(z,'assigned_at'),d=t!==null&&parent('duty_requirements',z.duty_record_id,t),a=t!==null&&vehicle(z.vehicle_id,t),previous=z.substitutes_assignment_record_id&&parent(f,z.substitutes_assignment_record_id,t);
  if(t===null||!d||!a||a.operator_id!==d.operator_id||a.vehicle_class!==d.vehicle_class||R.cmp(positive(a.seats),positive(d.minimum_seats))<0n||!authority('operations',z.assigned_by,a.operator_id,d.depot_id,t)||z.substitutes_assignment_record_id&&(!previous||previous.duty_record_id!==z.duty_record_id))return bad('Duty assignment requires exact compatible physical vehicle, capacity, duty, assigner and explicit replaced assignment');
  x=out(f,r,{...z,event:t,physical_key:a.physical_key});
 }else if(f==='cost_entries'){
  const t=event(z,'posted_at'),a=t!==null&&vehicle(z.vehicle_id,t),amount=nonnegative(z.amount),w=z.work_order_record_id&&parent('work_orders',z.work_order_record_id,t);
  if(t===null||!a||!amount||!['invoice','credit','actual_cost'].includes(z.kind)||!z.currency||!z.external_ref||z.work_order_record_id&&(!w||w.vehicle_id!==z.vehicle_id)||!actor('finance',z.posted_by,z.vehicle_id,t))return bad('Commercial amount requires actual posting/source, currency, exact vehicle/work and scoped finance actor');
  x=out(f,r,{...z,event:t,amount:q(amount)});
 }else{x=out(f,r,{...z});}
 return done(x);
 }

 function sameEntity(f,a,b,at=cut){if(a===b)return true;const x=v.ref(f,a,at),y=v.ref(f,b,at);return !!x&&!!y&&x.values.record_key===y.values.record_key&&x.values[Schema.IDS[f]]===y.values[Schema.IDS[f]];}
 const parentFamilies={fault_record_id:'faults',work_order_record_id:'work_orders',supplier_job_record_id:'supplier_jobs',safety_case_record_id:'safety_cases',part_request_record_id:'part_requests',assignment_record_id:'duty_assignments',duty_record_id:'duty_requirements'};
 function linked(f,key,id,at=cut){return current(f,at).filter(r=>parentFamilies[key]?sameEntity(parentFamilies[key],r.values[key],id,at):r.values[key]===id);}
 function latest(f,parentField,id,at){const xs=linked(f,parentField,id,at).map(r=>evaluate(f,r.values.id,at));if(xs.some(x=>!x))return null;xs.sort((a,b)=>b.event-a.event);return xs[0]||null;}
 function partStatus(id,at){const p=parent('part_requests',id,at);if(!p)return null;const receipts=linked('part_receipts','part_request_record_id',id,at).map(r=>evaluate('part_receipts',r.values.id,at)),installs=linked('part_installations','part_request_record_id',id,at).map(r=>evaluate('part_installations',r.values.id,at)),amount=x=>R.R(BigInt(x.quantity.numerator),BigInt(x.quantity.denominator)),received=sum(receipts.filter(Boolean).map(amount)),installed=sum(installs.filter(Boolean).map(amount)),requested=amount(p),valid=receipts.every(Boolean)&&installs.every(Boolean);
  return{part_request_record_id:id,vehicle_id:p.vehicle_id,requested:q(requested),received:q(received),installed:q(installed),unit:p.unit,valid,complete:valid&&R.cmp(installed,requested)>=0n,over_received:R.cmp(received,requested)>0n,receipt_ids:receipts.filter(Boolean).map(x=>x.record_id),installation_ids:installs.filter(Boolean).map(x=>x.record_id)};
 }
 function release(id,at){const c=parent('release_cases',id,at);if(!c)return null;const roles=options.required_review_roles||['safety','operations'],reviews=current('release_reviews',at).filter(r=>r.values.release_case_record_id===id).map(r=>evaluate('release_reviews',r.values.id,at)),selected=[];
  for(const role of roles){const xs=reviews.filter(r=>r?.role===role).sort((a,b)=>b.event-a.event);if(!xs.length||xs[0].decision!=='accepted'||xs[1]?.event===xs[0].event)return null;selected.push(xs[0]);}
  const rows=current('release_requirements',at).filter(r=>r.values.release_case_record_id===id),inputs=current('release_inputs',at).filter(r=>r.values.release_case_record_id===id),basis=releaseBasis(v.ref('release_cases',id,at),rows,inputs);
  if(Number(c.expected_requirements)!==rows.length||selected.some(r=>r.release_basis_sha256!==basis))return null;
  const requirements=rows.map(r=>evaluate('release_requirements',r.values.id,at));if(requirements.some(x=>!x)||inputs.some(r=>!evaluate('release_inputs',r.values.id,at)))return null;
  for(const req of requirements){if(req.family==='part_requests'){if(!partStatus(req.record_id,at)?.complete)return null;}else{const map={faults:['fault_events','fault_record_id'],work_orders:['work_events','work_order_record_id'],supplier_jobs:['supplier_events','supplier_job_record_id'],safety_cases:['safety_events','safety_case_record_id']},[f,k]=map[req.family],s=latest(f,k,req.record_id,at);if(s?.state!==req.required_state)return null;}}
  for(const [f,flag,events,key,closed]of [['faults','blocks_service','fault_events','fault_record_id','resolved'],['safety_cases','blocks_service','safety_events','safety_case_record_id','cleared'],['work_orders','required_for_release','work_events','work_order_record_id','completed'],['supplier_jobs','required_for_release','supplier_events','supplier_job_record_id','completed']]){
   for(const raw of current(f,at)){if(raw.values.vehicle_id!==c.vehicle_id||raw.values[flag]!=='true')continue;const p=evaluate(f,raw.values.id,at),state=latest(events,key,raw.values.id,at);if(!p)return null;
    const relevant=p.start>=c.start||!state||state.event>=c.start||state.state!==closed;
    if(relevant&&(state?.state!==closed||!requirements.some(r=>r.family===f&&sameEntity(f,r.record_id,raw.values.id,at))))return null;
   }
  }
  for(const raw of current('part_requests',at)){const p=evaluate('part_requests',raw.values.id,at);if(p?.vehicle_id===c.vehicle_id&&p.required_for_release){const status=partStatus(raw.values.id,at),recent=linked('part_installations','part_request_record_id',raw.values.id,at).some(r=>time(r.values.installed_at)>=c.start);if((p.start>=c.start||!status?.complete||recent)&&(!status?.complete||!requirements.some(r=>r.family==='part_requests'&&sameEntity('part_requests',r.record_id,raw.values.id,at))))return null;}}
  return{valid:true,release_case_record_id:id,vehicle_id:c.vehicle_id,released_at:v.instant(Math.max(...selected.map(r=>r.event))),basis_sha256:basis,review_record_ids:selected.map(r=>r.record_id),requirement_record_ids:requirements.map(r=>r.record_id)};
 }
 function faultEpisodes(id){const f=parent('faults',id,cut);if(!f)return[];const events=linked('fault_events','fault_record_id',id,cut).map(r=>evaluate('fault_events',r.values.id,cut));if(events.some(x=>!x))return[{fault_record_id:id,vehicle_id:f.vehicle_id,valid:false}];events.sort((a,b)=>a.event-b.event);let opened=f.start,out=[];for(const e of events){if(e.state==='resolved'){if(opened===null){out.push({fault_record_id:id,vehicle_id:f.vehicle_id,valid:false,reason:'Repeated resolution without reopened episode'});continue;}out.push({fault_record_id:id,vehicle_id:f.vehicle_id,valid:true,start:opened,end:e.event,completed:true,elapsed_minutes:q(R.R(BigInt(e.event-opened),60000n))});opened=null;}else if(e.state==='reopened'){if(opened!==null){out.push({fault_record_id:id,vehicle_id:f.vehicle_id,valid:false,reason:'Reopened event has no preceding actual closure'});continue;}opened=e.event;}}
  if(opened!==null)out.push({fault_record_id:id,vehicle_id:f.vehicle_id,valid:true,start:opened,end:null,completed:false,observed_open_minutes:q(R.R(BigInt(cut-opened),60000n))});return out;
 }
 const output=Object.fromEntries(Schema.KINDS.map(f=>[f,current(f).map(r=>evaluate(f,r.values.id,cut)||{...out(f,r),valid:false,values:r.values})]));
 const parts=current('part_requests').map(r=>partStatus(r.values.id,cut)||{part_request_record_id:r.values.id,valid:false,complete:false}),releases=current('release_cases').map(r=>release(r.values.id,cut)||{release_case_record_id:r.values.id,vehicle_id:r.values.vehicle_id,valid:false,released_at:null});
 const episodes=current('faults').flatMap(r=>faultEpisodes(r.values.id)),completed=episodes.filter(x=>x.valid&&x.completed);
 return{schema:'fleet.operating-analysis.v1',as_of:options.as_of,input_valid:v.sourceValid(),population_complete:v.populationComplete(),source_metadata:v.metadata(),records:output,parts,releases,fault_episodes:episodes,fault_metrics:{completed_episodes:completed.length,open_episodes:episodes.filter(x=>x.valid&&!x.completed).length,unresolved_episodes:episodes.filter(x=>!x.valid).length,mean_completed_recovery_minutes:completed.length?q(R.div(sum(completed.map(x=>R.R(BigInt(x.end-x.start),60000n))),R.R(BigInt(completed.length)))):null},issues:v.issues,view:v,evaluate,context,authority,release,latest,sameEntity,linked};

}
module.exports={analyze,releaseBasis,hashRow:View.hashRow};
