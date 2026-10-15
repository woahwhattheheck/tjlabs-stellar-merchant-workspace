'use strict';
const Schema=require('./schema.cjs'),Engine=require('./fleet-engine.cjs');
const T=require('./study-time.cjs');
const AT='2026-10-01T',EARLY='2026-09-01T00:00:00Z',CUTOFF='2026-10-02T00:00:00Z';
const instant=(s)=>s.includes('T')?s:AT+s+':00Z';
const PHASES=['source_capture','fault_triage','workshop_handover','parts_supplier_coordination','safety_review','dispatch_reconciliation','outcome_follow_up','correction'];
function build(){
 const records=Object.fromEntries(Schema.KINDS.map(f=>[f,[]])),documents=[];
 function row(f,id,fields,at=EARLY){
  const z=Object.fromEntries(Schema.FIELDS[f].map(k=>[k,'']));
  Object.assign(z,{id,record_key:id,revision:'1',record_status:'active',recorded_at:instant(at),available_at:instant(at),source_document_id:'DOC-'+id,source_ref:'authored/'+f+'/'+id},fields);
  if(!z[Schema.IDS[f]])z[Schema.IDS[f]]=id;
  const unknown=Object.keys(z).filter(k=>!Schema.FIELDS[f].includes(k));if(unknown.length)throw Error(f+': unknown columns '+unknown.join(','));
  records[f].push(z);documents.push({id:z.source_document_id,available_at:z.available_at,text:'AUTHORED FICTIONAL SOURCE — not a real operator record.\n'+JSON.stringify(z,null,2)});return z;
 }
 row('operators','OP',{name:'Example Transit Cooperative',valid_from:EARLY});
 row('depots','DEPOT',{operator_id:'OP',name:'Example North Depot',valid_from:EARLY});
 for(let i=1;i<=4;i++)row('vehicles','V'+i,{operator_id:'OP',physical_key:'FICTIONAL-CHASSIS-'+i,registration:'COURSE-'+i,vehicle_class:'single_deck',seats:'45',valid_from:EARLY});
 for(const [id,name]of [['MANAGER','Morgan, accountable depot manager'],['OPS','Olive, operations coordinator'],['TECH','Terry, maintenance technician'],['PARTS','Pat, stores receiver'],['SUPPLIER','Sam, supplier coordinator'],['SAFETY','Sasha, safety reviewer'],['FINANCE','Fran, accounts clerk']])row('people',id,{operator_id:'OP',name,valid_from:EARLY});
 row('suppliers','OUTSIDE',{name:'Example Component Workshop',service_description:'Authored external component repair and supplied parts',valid_from:EARLY});
 for(const [person,roles]of [['OPS',['operations','safety','fault-report']],['TECH',['maintenance','fault-report']],['PARTS',['parts']],['SUPPLIER',['supplier-coordination']],['SAFETY',['safety']],['FINANCE',['finance']]])for(const permission of roles)row('authorities','AUTH-'+person+'-'+permission,{person_id:person,permission,operator_id:'OP',depot_id:'DEPOT',granted_by:'MANAGER',granted_at:'2026-09-02T08:00:00Z',valid_from:'2026-09-02T08:00:00Z'},'2026-09-02T08:00:00Z');
 for(let i=1;i<=4;i++){
  row('fleet_assignments','MEMBERSHIP-V'+i,{vehicle_id:'V'+i,depot_id:'DEPOT',entered_at:instant('05:00')},'05:00');
  row('population_members','MEMBER-V'+i,{vehicle_id:'V'+i,operator_id:'OP',depot_id:'DEPOT',population_key:'ALL-DEPOT-20261001',included:'true'},'05:05');
  row('availability_events','OPENING-V'+i,{vehicle_id:'V'+i,event_at:instant('06:00'),state:i===4?'unknown':'available',basis_kind:'opening_observation',reason:i===4?'Opening readiness was explicitly unobserved; no assumed service release.':'Named operations and safety opening observation of the identified physical unit.',observer_id:'OPS'},'06:00');
 }
 const f1=row('faults','FAULT-V1',{vehicle_id:'V1',reported_at:instant('06:30'),blocks_service:'true',description:'Authored braking-system warning requiring controlled workshop diagnosis.',reporter_id:'TECH'},'06:30');
 row('fault_events','FAULT-V1-OPEN',{fault_record_id:f1.id,event_at:instant('06:30'),state:'open',actor_id:'TECH',notes:'Reported restriction retained.'},'06:30');
 row('availability_events','DOWN-V1',{vehicle_id:'V1',event_at:instant('06:30'),state:'unavailable',basis_kind:'observation',reason:'Blocking fault and safety hold, pending workshop, parts and external service.',observer_id:'OPS'},'06:30');
 const w1=row('work_orders','WORK-V1',{vehicle_id:'V1',fault_record_id:f1.id,opened_at:instant('06:35'),required_for_release:'true',description:'Inspect and replace the supplied component using the approved local method.',owner_id:'TECH'},'06:35');
 row('work_events','WORK-V1-START',{work_order_record_id:w1.id,event_at:instant('06:40'),state:'started',actor_id:'TECH',notes:'Actual workshop start.'},'06:40');
 row('work_events','WORK-V1-WAIT',{work_order_record_id:w1.id,event_at:instant('07:00'),state:'paused',actor_id:'TECH',notes:'Waiting for part and external component result concurrently.'},'07:00');
 const p1=row('part_requests','PART-V1',{work_order_record_id:w1.id,part_number:'FICTIONAL-PC-01',quantity:'1',unit:'each',requested_at:instant('06:45'),needed_at:instant('08:00'),supplier_id:'OUTSIDE',required_for_release:'true'},'06:45');
 const receipt=row('part_receipts','RECEIPT-V1',{part_request_record_id:p1.id,quantity:'1',unit:'each',received_at:instant('08:00'),supplier_ref:'AUTHORED-DELIVERY-001',receiver_id:'PARTS'},'08:00');
 const install=row('part_installations','INSTALL-V1',{part_request_record_id:p1.id,receipt_record_id:receipt.id,work_order_record_id:w1.id,quantity:'1',unit:'each',installed_at:instant('09:00'),technician_id:'TECH'},'09:00');
 const sj=row('supplier_jobs','SUPPLY-V1',{vehicle_id:'V1',work_order_record_id:w1.id,supplier_id:'OUTSIDE',ordered_at:instant('06:50'),promised_at:instant('09:15'),required_for_release:'true',description:'Actual component bench check; promised and completed instants remain distinct.'},'06:50');
 row('supplier_events','SUPPLY-V1-ACCEPT',{supplier_job_record_id:sj.id,event_at:instant('07:10'),state:'accepted',actor_id:'SUPPLIER',supplier_ref:'AUTHORED-SUPPLIER-ACK'},'07:10');
 row('supplier_events','SUPPLY-V1-WAIT',{supplier_job_record_id:sj.id,event_at:instant('07:20'),state:'waiting',actor_id:'SUPPLIER',supplier_ref:'AUTHORED-SUPPLIER-QUEUE'},'07:20');
 const supplierDone=row('supplier_events','SUPPLY-V1-DONE',{supplier_job_record_id:sj.id,event_at:instant('09:45'),state:'completed',actor_id:'SUPPLIER',supplier_ref:'AUTHORED-SUPPLIER-COMPLETE'},'09:45');
 documents.push({id:'METHOD-SAFETY',available_at:EARLY,text:'Authored placeholder for an actual authorized local safety method. No inspection procedure or pass limit is generated.'});
 const sc=row('safety_cases','SAFETY-V1',{vehicle_id:'V1',raised_at:instant('06:35'),blocks_service:'true',method_document_id:'METHOD-SAFETY',description:'Independent safety hold remains until a named authorized review.',raised_by:'SAFETY'},'06:35');
 row('safety_events','SAFETY-V1-HOLD',{safety_case_record_id:sc.id,event_at:instant('06:35'),state:'held',reviewer_id:'SAFETY',method_document_id:'METHOD-SAFETY',notes:'Actual hold observation.'},'06:35');
 row('work_events','WORK-V1-RESUME',{work_order_record_id:w1.id,event_at:instant('09:45'),state:'started',actor_id:'TECH',notes:'Resume after supplier completion.'},'09:45');
 const workDone=row('work_events','WORK-V1-DONE',{work_order_record_id:w1.id,event_at:instant('10:00'),state:'completed',actor_id:'TECH',notes:'Actual physical work completion is not release authority.'},'10:00');
 const faultDone=row('fault_events','FAULT-V1-DONE',{fault_record_id:f1.id,event_at:instant('10:05'),state:'resolved',actor_id:'TECH',notes:'Actual fault closure retained separately from safety and operations acceptance.'},'10:05');
 const safetyDone=row('safety_events','SAFETY-V1-CLEAR',{safety_case_record_id:sc.id,event_at:instant('10:30'),state:'cleared',reviewer_id:'SAFETY',method_document_id:'METHOD-SAFETY',notes:'Clearance recorded at 10:31; the office receives this source at 10:35.',recorded_at:instant('10:31'),available_at:instant('10:35')},'10:35');
 const rc=row('release_cases','RELEASE-V1',{vehicle_id:'V1',opened_at:instant('06:40'),requirements_complete:'true',expected_requirements:'5',purpose:'Return the repaired physical unit for a later actual duty.',opened_by:'OPS'},'06:40');
 const pairs=[['faults',f1,'resolved','fault_events',faultDone],['work_orders',w1,'completed','work_events',workDone],['part_requests',p1,'installed','part_installations',install],['supplier_jobs',sj,'completed','supplier_events',supplierDone],['safety_cases',sc,'cleared','safety_events',safetyDone]],reqs=[],inputs=[];
 for(const [n,[family,parent,state,inputFamily,input]]of pairs.entries()){
  const rr=row('release_requirements','REQUIREMENT-V1-'+(n+1),{release_case_record_id:rc.id,family,record_id:parent.id,required_state:state},'10:35');reqs.push(rr);
  inputs.push(row('release_inputs','INPUT-V1-'+(n+1),{release_case_record_id:rc.id,requirement_record_id:rr.id,family:inputFamily,record_id:input.id,row_sha256:Engine.hashRow(input)},'10:35'));
 }
 const basis=Engine.releaseBasis(rc,reqs,inputs);
 row('release_reviews','REVIEW-V1-SAFETY',{release_case_record_id:rc.id,release_basis_sha256:basis,role:'safety',reviewed_by:'SAFETY',reviewed_at:instant('10:40'),decision:'accepted',notes:'Reviewed all five exact original requirement inputs.'},'10:40');
 row('release_reviews','REVIEW-V1-OPERATIONS',{release_case_record_id:rc.id,release_basis_sha256:basis,role:'operations',reviewed_by:'OPS',reviewed_at:instant('10:42'),decision:'accepted',notes:'Accepted the same complete release basis; actual duty remains separate.'},'10:42');
 row('availability_events','READY-V1',{vehicle_id:'V1',event_at:instant('10:45'),state:'available',basis_kind:'release',release_case_record_id:rc.id,reason:'Same physical vehicle released by both named roles on the exact five-input basis.',observer_id:'OPS'},'10:45');
 const f2=row('faults','FAULT-V2',{vehicle_id:'V2',reported_at:instant('07:00'),blocks_service:'true',description:'Authored cooling warning; diagnosis remains incomplete at the study cutoff.',reporter_id:'TECH'},'07:00');
 row('fault_events','FAULT-V2-OPEN',{fault_record_id:f2.id,event_at:instant('07:00'),state:'open',actor_id:'TECH',notes:'Open episode, not omitted from recovery population.'},'07:00');
 row('availability_events','DOWN-V2',{vehicle_id:'V2',event_at:instant('07:00'),state:'unavailable',basis_kind:'observation',reason:'Actual blocking fault; no later release recorded.',observer_id:'OPS'},'07:00');
 const w2=row('work_orders','WORK-V2',{vehicle_id:'V2',fault_record_id:f2.id,opened_at:instant('07:10'),required_for_release:'true',description:'Authored unresolved diagnosis with a required part still absent.',owner_id:'TECH'},'07:10');
 row('work_events','WORK-V2-START',{work_order_record_id:w2.id,event_at:instant('07:15'),state:'started',actor_id:'TECH',notes:'Actual diagnosis start.'},'07:15');
 row('work_events','WORK-V2-WAIT',{work_order_record_id:w2.id,event_at:instant('07:20'),state:'paused',actor_id:'TECH',notes:'Required part not received; actual future availability unknown.'},'07:20');
 row('part_requests','PART-V2',{work_order_record_id:w2.id,part_number:'FICTIONAL-PC-02',quantity:'1',unit:'each',requested_at:instant('07:20'),needed_at:instant('12:00'),supplier_id:'OUTSIDE',required_for_release:'true'},'07:20');
 row('safety_cases','SAFETY-V2',{vehicle_id:'V2',raised_at:instant('07:05'),blocks_service:'true',method_document_id:'METHOD-SAFETY',description:'Authored safety case still open at cutoff.',raised_by:'SAFETY'},'07:05');
 row('safety_events','SAFETY-V2-HOLD',{safety_case_record_id:'SAFETY-V2',event_at:instant('07:05'),state:'held',reviewer_id:'SAFETY',method_document_id:'METHOD-SAFETY',notes:'No clearance inferred from a planned part delivery.'},'07:05');
 row('faults','FAULT-V2-LATER',{...f2,id:'FAULT-V2-LATER',record_key:f2.record_key,revision:'2',supersedes_id:f2.id,source_document_id:'DOC-FAULT-V2-LATER',source_ref:'authored/faults/FAULT-V2-LATER',description:'Later corrected diagnosis wording, known only after the declared cutoff.',recorded_at:'2026-10-01T14:00:00Z',available_at:'2026-10-02T01:00:00Z'},'2026-10-02T01:00:00Z');
 const d1=row('duty_requirements','DUTY-MORNING',{operator_id:'OP',depot_id:'DEPOT',vehicle_class:'single_deck',minimum_seats:'40',required_vehicles:'1',starts_at:instant('08:00'),ends_at:instant('10:00'),approved_at:instant('05:30'),approved_by:'OPS'},'05:30');
 const a2=row('duty_assignments','ASSIGN-V2',{duty_record_id:d1.id,vehicle_id:'V2',assigned_at:instant('06:10'),assigned_by:'OPS'},'06:10');
 row('duty_events','CANCEL-V2',{assignment_record_id:a2.id,event_at:instant('07:10'),state:'cancelled',actor_id:'OPS',notes:'Original assignment retained after the actual fault.'},'07:10');
 const a3=row('duty_assignments','ASSIGN-V3',{duty_record_id:d1.id,vehicle_id:'V3',assigned_at:instant('07:15'),substitutes_assignment_record_id:a2.id,assigned_by:'OPS'},'07:15');
 const d2=row('duty_requirements','DUTY-AFTER-REPAIR',{operator_id:'OP',depot_id:'DEPOT',vehicle_class:'single_deck',minimum_seats:'40',required_vehicles:'1',starts_at:instant('11:00'),ends_at:instant('13:00'),approved_at:instant('05:30'),approved_by:'OPS'},'05:30');
 const a1=row('duty_assignments','ASSIGN-V1',{duty_record_id:d2.id,vehicle_id:'V1',assigned_at:instant('10:50'),assigned_by:'OPS'},'10:50');
 for(const [a,dep,complete,back]of [[a3,'08:00','10:00','10:05'],[a1,'11:00','13:00','13:10']])for(const [state,when]of [['departed',dep],['completed',complete],['returned',back]])row('duty_events',a.id+'-'+state,{assignment_record_id:a.id,event_at:instant(when),state,actor_id:'OPS',notes:'Actual '+state+' observation; no service result inferred from an earlier event.'},when);
 row('cost_entries','COST-SUPPLIER',{vehicle_id:'V1',work_order_record_id:w1.id,posted_at:instant('14:00'),kind:'invoice',amount:'250.00',currency:'GBP',external_ref:'AUTHORED-INVOICE-001',posted_by:'FINANCE'},'14:00');
 row('cost_entries','CREDIT-SUPPLIER',{vehicle_id:'V1',work_order_record_id:w1.id,posted_at:instant('14:10'),kind:'credit',amount:'25.00',currency:'GBP',external_ref:'AUTHORED-CREDIT-001',posted_by:'FINANCE'},'14:10');
 row('cost_entries','COST-PART',{vehicle_id:'V1',work_order_record_id:w1.id,posted_at:instant('14:20'),kind:'actual_cost',amount:'80.00',currency:'GBP',external_ref:'AUTHORED-STORES-ISSUE-001',posted_by:'FINANCE'},'14:20');
 let serial=0;
 for(let i=1;i<=4;i++)for(const [method,day]of [['existing_process','2026-09-30'],['study_process','2026-10-01']])for(const [p,phase]of PHASES.entries()){
  const mins=method==='existing_process'?6:[4,4,4,3,8,3,3,3][p],index=(i-1)*PHASES.length+p,start=Date.parse(day+'T12:30:00Z')+index*600000,end=start+mins*60000;
  row('effort','EFFORT-'+(++serial),{member_id:'MEMBER-V'+i,phase,method,person_id:'OPS',started_at:new Date(start).toISOString(),ended_at:new Date(end).toISOString(),person_minutes:String(mins),work_key:method+'-V'+i+'-'+phase,matched_group_id:'PAIR-V'+i,population_complete:'true',phase_complete:'true'},new Date(end).toISOString());
 }
 const plan={data_class:'authored_course',title:'Four physical buses: parts, external service, release, substitute duty and unresolved readiness',population_start:instant('06:00'),population_end:instant('18:00'),as_of:CUTOFF,population_key:'ALL-DEPOT-20261001',expected_members:4,population_complete:true,required_review_roles:['safety','operations'],required_effort_phases:PHASES.slice(),baseline_method:'existing_process',current_method:'study_process'};
 return{schema:'fleet.authored-course.v1',records,documents,plan};
}
function optionsFor(fixture,overrides={}){
 const as_of=overrides.as_of||fixture.plan.as_of;
 return{...fixture.plan,as_of,extract_available_at:Object.fromEntries(Schema.KINDS.map(f=>[f,EARLY])),expected_counts:Object.fromEntries(Schema.KINDS.map(f=>[f,fixture.records[f].length])),document:(id,at)=>{const xs=fixture.documents.filter(d=>d.id===id&&Date.parse(d.available_at)<=Date.parse(at));return xs.length===1?xs[0]:null;},...overrides};
}
module.exports={build,optionsFor,PHASES};
