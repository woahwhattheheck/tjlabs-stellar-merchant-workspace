'use strict';
const Schema=require('./schema.cjs');
const Source=require('./source-view.cjs');
const SHA=require('./sha256.cjs');
const FIELDS=Schema.FIELDS,KINDS=Schema.KINDS,IDS=Schema.IDS;
const phases=['source_capture','receiving_reconciliation','certificate_qa_review','allocation_planning','exception_approval','dispatch_reconciliation','outcome_follow_up','correction'];
const iso=(date,clock)=>date+'T'+clock+':00Z';
const prior=clock=>iso('2026-09-30',clock),day=clock=>iso('2026-10-01',clock);
const clone=x=>JSON.parse(JSON.stringify(x));
function build(){
 const records=Object.fromEntries(KINDS.map(k=>[k,[]])),documents=[];
 function doc(id,at,text){const body=text||'Fictional source original '+id;const d={id,available_at:at,text:body,sha256:SHA.sha256Utf8(body).sha256};documents.push(d);return id;}
 function add(kind,id,values={},available=prior('06:00')){
  const row=Object.fromEntries(FIELDS[kind].map(k=>[k,'']));
  Object.assign(row,{id,record_key:id,revision:'1',supersedes_id:'',record_status:'active',recorded_at:available,available_at:available,source_document_id:'SRC-'+id,source_ref:'Authored original '+kind+'/'+id},values);
  if(!row[IDS[kind]])row[IDS[kind]]=id;
  for(const k of Object.keys(row))if(!FIELDS[kind].includes(k))throw Error('Unknown '+kind+' column '+k);
  if(Object.values(row).some(v=>typeof v!=='string'))throw Error('Non-text canonical value in '+id);
  doc(row.source_document_id,row.available_at,JSON.stringify({data_class:'authored_course',family:kind,record:row},null,2));records[kind].push(row);return row;
 }
 const effective={valid_from:'2026-09-01T00:00:00Z',valid_to:''};
 add('operators','OP',{name:'Fictional Meridian Industrial Ingredients',...effective});
 for(const [id,name]of [['W-EAST','East distribution warehouse'],['W-WEST','West distribution warehouse']])add('warehouses',id,{operator_id:'OP',name,...effective});
 add('products','BULK',{operator_id:'OP',name:'Authored polymer granules, bulk',material_id:'MAT-G',base_unit:'kg',grade:'G1',...effective});
 add('products','PACK',{operator_id:'OP',name:'Authored polymer granules, sealed 25 kg bags',material_id:'MAT-G',base_unit:'kg',grade:'G1',...effective});
 for(const [id,name,type]of [['SUPPLIER','Fictional supplier','supplier'],['CUSTOMER-A','Fictional industrial customer A','customer'],['CUSTOMER-B','Fictional industrial customer B','customer'],['LAB','Fictional certificate issuer','supplier']])add('parties',id,{operator_id:'OP',name,party_type:type,...effective});
 for(const [id,name]of [['OWNER','Alex Owner'],['RECEIVER','Robin Receiving'],['QA','Quinn Quality'],['PLANNER','Pat Planning'],['DISPATCH','Drew Dispatch'],['FINANCE','Frankie Finance'],['BASELINE','Blair Baseline observer'],['CURRENT','Casey Current observer']])add('people',id,{operator_id:'OP',name,...effective});
 // Permissions follow the delivered engine vocabulary; edit only this explicit grant matrix when the engine contract is final.
 const grants={OWNER:['procurement','operations','warehouse','qa'],RECEIVER:['procurement','warehouse'],QA:['qa'],PLANNER:['operations'],DISPATCH:['warehouse'],FINANCE:['operations','warehouse']};
 for(const [person,permissions]of Object.entries(grants))for(const permission of permissions)for(const warehouse of ['W-EAST','W-WEST'])add('authorities','AUTH-'+person+'-'+permission+'-'+warehouse,{person_id:person,permission,operator_id:'OP',warehouse_id:warehouse,granted_by:'OWNER',granted_at:prior('05:00'),...effective});
 doc('PACK-SPEC',prior('05:00'),'Authored pack specification: one sealed bag contains exactly 25 kg net polymer grade G1.');
 add('unit_conversions','PACK-BAG',{product_id:'PACK',unit:'bag',base_unit:'kg',factor_to_base:'25',basis_document_id:'PACK-SPEC',...effective});
 doc('POLICY-METHOD',prior('05:00'),'Authored local policy. Eligible stock must have the scoped certificate review and explicit quality release. Rank eligible lots by expiry. Retain actual customer remaining-life rules and dates. This is not a statutory standard.');
 for(const w of ['W-EAST','W-WEST'])add('policies','POL-'+w,{operator_id:'OP',warehouse_id:w,material_id:'MAT-G',ranking_rule:'FEFO',certificate_kinds:'["analysis"]',alert_days:'14',method_document_id:'POLICY-METHOD',...effective});
 const rules=[
 ['RULE-PACK','CUSTOMER-A','PACK','7','POL-W-EAST'],
 ['RULE-LONG','CUSTOMER-A','BULK','30','POL-W-EAST'],
 ['RULE-SHORT','CUSTOMER-B','BULK','0','POL-W-EAST'],
 ['RULE-WEST','CUSTOMER-B','BULK','0','POL-W-WEST']];
 for(const [id,customer,product,days,policy]of rules)add('customer_rules',id,{customer_id:customer,product_id:product,minimum_remaining_days:days,date_kind:'expiry',policy_record_id:policy,approved_by:'PLANNER',approved_at:prior('06:00'),...effective});
 function lot(id,product,expiry,origin,created,avail=prior('06:00')){return add('lots',id,{operator_id:'OP',physical_key:'PHYSICAL-'+id,product_id:product,supplier_id:'SUPPLIER',supplier_lot:'SUP-'+id,created_at:created,manufacture_at:'2026-09-01T00:00:00Z',expiry_at:expiry,retest_at:'',date_kind:'expiry',origin_kind:origin},avail);}
 const A=lot('LOT-A','BULK','2026-10-12T23:59:59Z','opening',prior('05:00'));
 const B=lot('LOT-B','BULK','2026-12-01T23:59:59Z','receipt',day('07:00'),day('07:00'));
 const C=lot('LOT-C','BULK','2026-10-05T23:59:59Z','opening',prior('05:00'));
 const D=lot('LOT-D','PACK','2026-10-12T23:59:59Z','repack',day('08:00'),day('08:00'));
 const E=lot('LOT-E','BULK','2026-10-31T23:59:59Z','opening',prior('05:00'));
 for(const [l,w,q]of [[A,'W-EAST','120'],[C,'W-EAST','40'],[E,'W-WEST','60']])add('opening_balances','OPEN-'+l.id,{lot_record_id:l.id,warehouse_id:w,observed_at:day('06:00'),quantity:q,unit:'kg',counted_by:'RECEIVER'},day('06:00'));
 add('purchase_lines','PO-B',{operator_id:'OP',warehouse_id:'W-EAST',supplier_id:'SUPPLIER',external_order_ref:'PO-100',external_line_ref:'1',product_id:'BULK',ordered_at:prior('06:00'),expected_at:day('07:00'),quantity:'100',unit:'kg',approved_by:'RECEIVER'});
 add('receipts','RECEIPT-B',{purchase_line_record_id:'PO-B',lot_id:'LOT-B',warehouse_id:'W-EAST',received_at:day('07:00'),quantity:'100',unit:'kg',supplier_ref:'DELIVERY-100',received_by:'RECEIVER',disposition:'quarantined'},day('07:00'));
 add('transfers','TRANSFER-E',{lot_record_id:'LOT-E',from_warehouse_id:'W-WEST',to_warehouse_id:'W-EAST',sent_at:day('08:00'),received_at:day('09:00'),quantity:'20',unit:'kg',dispatched_by:'RECEIVER',received_by:'RECEIVER',external_ref:'TRANSFER-001'},day('09:00'));
 add('repack_jobs','REPACK-1',{operator_id:'OP',warehouse_id:'W-EAST',material_id:'MAT-G',started_at:day('07:30'),completed_at:day('08:00'),input_complete:'true',expected_inputs:'1',output_complete:'true',expected_outputs:'1',loss_quantity:'5',loss_unit:'kg',reason:'Authored measured process loss during same-material repacking',completed_by:'RECEIVER'},day('08:00'));
 add('repack_inputs','REPACK-IN-A',{job_record_id:'REPACK-1',lot_record_id:'LOT-A',quantity:'80',unit:'kg',consumed_at:day('07:30')},day('08:00'));
 add('repack_outputs','REPACK-OUT-D',{job_record_id:'REPACK-1',lot_record_id:'LOT-D',quantity:'3',unit:'bag',produced_at:day('08:00')},day('08:00'));
 const certs={};
 function cert(id,l,issued,available,extra={}){return certs[id]=add('certificates',id,{lot_record_id:l,certificate_kind:'analysis',issuer_id:'LAB',certificate_ref:'CERTIFICATE-'+l,issued_at:issued,valid_until:'2026-12-31T23:59:59Z',method_document_id:'POLICY-METHOD',...extra},available);}
 cert('CERT-A','LOT-A',prior('06:00'),prior('06:00'));
 cert('CERT-C','LOT-C',prior('06:00'),prior('06:00'));
 cert('CERT-E','LOT-E',prior('06:00'),prior('06:00'));
 cert('CERT-D','LOT-D',day('08:00'),day('08:05'));
 cert('CERT-B-1','LOT-B',day('07:00'),day('07:10'));
 cert('CERT-B-2','LOT-B',day('09:00'),day('11:00'),{record_key:'CERT-B-1',revision:'2',supersedes_id:'CERT-B-1',certificate_id:'CERT-B-1',certificate_ref:'CERTIFICATE-LOT-B-AMENDMENT'});
 function review(id,certid,policy,when,decision='accepted'){return add('certificate_reviews',id,{certificate_record_id:certid,certificate_sha256:documents.find(d=>d.id===certs[certid].source_document_id).sha256,lot_record_id:certs[certid].lot_record_id,policy_record_id:policy,reviewed_at:when,reviewed_by:'QA',decision,notes:'Fictional exact certificate edition reviewed for local lot release.'},when);}
 const reviewA=review('CR-A','CERT-A','POL-W-EAST',prior('06:00'));
 const reviewC=review('CR-C','CERT-C','POL-W-EAST',prior('06:00'));
 const reviewE=review('CR-E','CERT-E','POL-W-WEST',prior('06:00'));
 const reviewDE=review('CR-D','CERT-D','POL-W-EAST',day('08:10'));
 const reviewBEarly=review('CR-B-REVIEW','CERT-B-1','POL-W-EAST',day('07:15'),'rejected');
 const reviewB=review('CR-B-2','CERT-B-2','POL-W-EAST',day('12:00'));
 const reviewEAtEast=review('CR-E-EAST','CERT-E','POL-W-EAST',day('09:00'));
 const holdC=add('lot_holds','HOLD-C',{lot_record_id:'LOT-C',warehouse_id:'W-EAST',raised_at:prior('06:00'),raised_by:'QA',reason:'Open local quality hold. Earliest expiry must not imply eligibility.'});
 const holdB=add('lot_holds','HOLD-B',{lot_record_id:'LOT-B',warehouse_id:'W-EAST',raised_at:day('07:00'),raised_by:'QA',reason:'Await amended certificate and actual QA review.'},day('07:00'));
 const clearB=add('hold_events','CLEAR-B',{hold_record_id:'HOLD-B',event_at:day('12:00'),state:'released',reviewed_by:'QA',notes:'Actual amendment reviewed and scoped local hold cleared.'},day('12:00'));
 function state(id,lotid,w,when,status,inputs){
  const z=add('lot_state_events',id,{lot_record_id:lotid,warehouse_id:w,event_at:when,state:status,policy_record_id:'POL-'+w,inputs_complete:'true',expected_inputs:String(inputs.length),reviewed_by:'QA',reason:'Authored named lot-state decision.'},when);
  for(const [i,[family,r]]of inputs.entries())add('lot_state_inputs',id+'-INPUT-'+(i+1),{state_event_record_id:id,family,record_id:r.id,row_sha256:Source.hashRow(r)},when);return z;
 }
 state('RELEASE-A','LOT-A','W-EAST',prior('06:00'),'released',[['certificates',certs['CERT-A']],['certificate_reviews',reviewA]]);
 state('HOLD-STATE-C','LOT-C','W-EAST',prior('06:00'),'quarantined',[['lot_holds',holdC]]);
 state('RELEASE-E-WEST','LOT-E','W-WEST',prior('06:00'),'released',[['certificates',certs['CERT-E']],['certificate_reviews',reviewE]]);
 state('RELEASE-E-EAST','LOT-E','W-EAST',day('09:00'),'released',[['certificates',certs['CERT-E']],['certificate_reviews',reviewEAtEast]]);
 state('RELEASE-D','LOT-D','W-EAST',day('08:10'),'released',[['certificates',certs['CERT-D']],['certificate_reviews',reviewDE]]);
 state('HOLD-STATE-B','LOT-B','W-EAST',day('07:15'),'quarantined',[['lot_holds',holdB],['certificate_reviews',reviewBEarly]]);
 state('RELEASE-B','LOT-B','W-EAST',day('12:00'),'released',[['certificates',certs['CERT-B-2']],['certificate_reviews',reviewB],['lot_holds',holdB],['hold_events',clearB]]);
 const orders=[
 ['ORDER-1','W-EAST','CUSTOMER-A','PACK','2','bag','RULE-PACK'],
 ['ORDER-2','W-EAST','CUSTOMER-A','BULK','50','kg','RULE-LONG'],
 ['ORDER-3','W-EAST','CUSTOMER-B','BULK','30','kg','RULE-SHORT'],
 ['ORDER-4','W-WEST','CUSTOMER-B','BULK','10','kg','RULE-WEST'],
 ['ORDER-5','W-EAST','CUSTOMER-A','BULK','25','kg',''],
 ['ORDER-6','W-EAST','CUSTOMER-B','BULK','10','kg','RULE-SHORT']];
 for(const [id,w,c,p,q,u,rule]of orders)add('order_lines',id,{operator_id:'OP',warehouse_id:w,customer_id:c,external_order_ref:'CUSTOMER-'+id,external_line_ref:'1',product_id:p,ordered_at:day('06:00'),due_at:'2026-10-03T12:00:00Z',quantity:q,unit:u,rule_record_id:rule,approved_by:'PLANNER'},day('06:00'));
 add('order_events','CANCEL-ORDER-6',{order_line_record_id:'ORDER-6',event_at:day('08:30'),state:'cancelled',actor_id:'PLANNER',reason:'Actual customer cancellation; original order retained.'},day('08:30'));
 // Decision cases are frozen source populations. Bind all known eligible context rows at their actual decision time.
 const decisionDefs=[['DECISION-EARLY','W-EAST',day('10:00')],['DECISION-EAST-SAFE','W-EAST',day('10:06')],['DECISION-LATE','W-EAST',day('12:10')],['DECISION-WEST','W-WEST',day('10:00')]];
 const inputFamilies=['operators','warehouses','products','parties','people','authorities','unit_conversions','policies','customer_rules','purchase_lines','receipts','lots','opening_balances','transfers','repack_jobs','repack_inputs','repack_outputs','certificates','certificate_reviews','lot_holds','hold_events','lot_state_events','lot_state_inputs','order_lines','order_events'];
 const frozen={};
 for(const [id,w,when]of decisionDefs){
  const snap=Object.fromEntries(inputFamilies.map(k=>[k,records[k].filter(r=>Date.parse(r.available_at)<=Date.parse(when))]));
  // Exact historical current versions only; earlier originals remain in the underlying source.
  for(const k of inputFamilies){const superseded=new Set(snap[k].map(r=>r.supersedes_id).filter(Boolean));snap[k]=snap[k].filter(r=>!superseded.has(r.id));}
  const ins=Object.entries(snap).flatMap(([family,rows])=>rows.map(r=>({family,r})));
  const caseRow=add('decision_cases',id,{operator_id:'OP',warehouse_id:w,policy_record_id:'POL-'+w,decided_at:when,order_population_complete:'true',expected_order_lines:String(snap.order_lines.length),lot_population_complete:'true',expected_lots:String(snap.lots.length),input_population_complete:'true',expected_inputs:String(ins.length),generated_by:'PLANNER',purpose:'Authored supplied allocation comparison with frozen source inputs.'},when);
  for(const [i,x]of ins.entries())add('decision_inputs',id+'-INPUT-'+String(i+1).padStart(3,'0'),{decision_case_record_id:id,family:x.family,record_id:x.r.id,row_sha256:Source.hashRow(x.r)},when);frozen[id]={row:caseRow,inputs:ins};
 }
 for(const [id,dc,order,lot,q,u,when]of [
 ['PROPOSAL-EARLY-B','DECISION-EARLY','ORDER-2','LOT-B','50','kg',day('10:00')],
 ['PROPOSAL-LATE-B','DECISION-LATE','ORDER-2','LOT-B','50','kg',day('12:10')],
 ['PROPOSAL-PACK','DECISION-EAST-SAFE','ORDER-1','LOT-D','2','bag',day('10:06')],
 ['PROPOSAL-A','DECISION-EAST-SAFE','ORDER-3','LOT-A','30','kg',day('10:06')],
 ['PROPOSAL-WEST','DECISION-WEST','ORDER-4','LOT-E','10','kg',day('10:00')]])add('allocation_proposals',id,{decision_case_record_id:dc,order_line_record_id:order,lot_record_id:lot,quantity:q,unit:u,proposed_at:when,supplied_score:'',score_unit:'',reason:'Fictional supplied proposal, not an inferred system output.'},when);
 // Review digest placeholders are intentionally filled only by bindEngine() using the exact delivered helper.
 for(const [id,dc,when,decision]of [['REVIEW-EARLY','DECISION-EARLY',day('10:05'),'rejected'],['REVIEW-EAST-SAFE','DECISION-EAST-SAFE',day('10:07'),'accepted'],['REVIEW-LATE','DECISION-LATE',day('12:15'),'accepted'],['REVIEW-WEST','DECISION-WEST',day('10:05'),'accepted']])add('decision_reviews',id,{decision_case_record_id:dc,decision_basis_sha256:'',reviewed_at:when,reviewed_by:'PLANNER',decision,notes:'Exact supplied decision and frozen source context; early B proposal remains rejected.'},when);
 for(const [id,order,lot,w,q,u,when,review,proposal,reason]of [
 ['ALLOC-1','ORDER-1','LOT-D','W-EAST','2','bag',day('10:10'),'REVIEW-EAST-SAFE','PROPOSAL-PACK',''],
 ['ALLOC-2','ORDER-2','LOT-B','W-EAST','50','kg',day('12:20'),'REVIEW-LATE','PROPOSAL-LATE-B',''],
 ['ALLOC-3','ORDER-3','LOT-A','W-EAST','30','kg',day('10:10'),'REVIEW-EAST-SAFE','PROPOSAL-A',''],
 ['ALLOC-4','ORDER-4','LOT-E','W-WEST','10','kg',day('10:10'),'REVIEW-WEST','PROPOSAL-WEST','']])add('allocations',id,{order_line_record_id:order,lot_record_id:lot,warehouse_id:w,quantity:q,unit:u,allocated_at:when,decision_review_record_id:review,proposal_record_id:proposal,override_reason:reason,allocated_by:'PLANNER'},when);
 for(const [n,order,lot,w,q,u,when,c]of [
 ['1','ORDER-1','LOT-D','W-EAST','1','bag',day('10:30'),'CUSTOMER-A'],
 ['2','ORDER-2','LOT-B','W-EAST','50','kg',day('12:30'),'CUSTOMER-A'],
 ['3','ORDER-3','LOT-A','W-EAST','30','kg',day('10:30'),'CUSTOMER-B'],
 ['4','ORDER-4','LOT-E','W-WEST','10','kg',day('10:30'),'CUSTOMER-B']]){
  add('picks','PICK-'+n,{allocation_record_id:'ALLOC-'+n,lot_record_id:lot,warehouse_id:w,quantity:q,unit:u,picked_at:when,picked_by:'DISPATCH',external_ref:'PHYSICAL-PICK-'+n},when);
  const shipped=new Date(Date.parse(when)+600000).toISOString(),accepted=new Date(Date.parse(when)+900000).toISOString();
  add('dispatches','DISPATCH-'+n,{operator_id:'OP',warehouse_id:w,customer_id:c,dispatched_at:shipped,accepted_at:accepted,carrier_ref:'CARRIER-'+n,dispatched_by:'DISPATCH'},accepted);
  add('dispatch_lines','DL-'+n,{dispatch_record_id:'DISPATCH-'+n,order_line_record_id:order,allocation_record_id:'ALLOC-'+n,pick_record_id:'PICK-'+n,lot_record_id:lot,quantity:q,unit:u},accepted);
 }
 add('returns','RETURN-B',{dispatch_line_record_id:'DL-2',warehouse_id:'W-EAST',received_at:day('15:00'),quantity:'5',unit:'kg',received_by:'RECEIVER',external_ref:'ACTUAL-RETURN-001'},day('15:00'));
 add('return_events','RETURN-HOLD',{return_record_id:'RETURN-B',event_at:day('15:05'),state:'quarantined',reviewed_by:'QA',reason:'Actual returned quantity held pending inspection; not automatically released.'},day('15:05'));
 add('writeoffs','WRITE-C',{lot_record_id:'LOT-C',warehouse_id:'W-EAST',posted_at:day('16:00'),quantity:'10',unit:'kg',reason:'Actual recorded disposition of damaged held stock.',external_ref:'WRITE-OFF-001',posted_by:'FINANCE'},day('16:00'));
 for(const [id,lot,order,kind,amount,ref]of [
 ['COST-WRITE','LOT-C','','writeoff','60','POSTED-WRITEOFF-001'],
 ['COST-SALE','LOT-B','ORDER-2','sale','500','POSTED-SALE-001'],
 ['COST-CREDIT','LOT-B','ORDER-2','credit','50','POSTED-CREDIT-001']])add('cost_entries',id,{operator_id:'OP',warehouse_id:'W-EAST',lot_record_id:lot,order_line_record_id:order,posted_at:day('16:10'),kind,amount,currency:'GBP',external_ref:ref,posted_by:'FINANCE'},day('16:10'));
 const members=[];
 for(const [kind,family,ids]of [['lot','lots',['LOT-A','LOT-B','LOT-C','LOT-D','LOT-E']],['receipt','receipts',['RECEIPT-B']],['order','order_lines',orders.map(x=>x[0])]])for(const id of ids){const w=id==='LOT-E'||id==='ORDER-4'?'W-WEST':'W-EAST';members.push(add('population_members','MEM-'+id,{population_kind:kind,family,record_id:id,operator_id:'OP',warehouse_id:w,population_key:kind+':'+id,included:'true',exclusion_reason:''},day('17:00')));}
 const baselineMinutes=[3,4,5,6,2,4,2,1],currentMinutes=[2,3,7,4,3,3,2,1];
 const clocks={baseline_process:Date.parse('2026-09-30T07:00:00Z'),study_process:Date.parse(day('10:00'))};
 for(const member of members)for(const [method,minutes,person]of [['baseline_process',baselineMinutes,'BASELINE'],['study_process',currentMinutes,'CURRENT']])for(let i=0;i<phases.length;i++){
  const start=clocks[method],end=start+minutes[i]*60000;clocks[method]=end+60000;const id='EFFORT-'+member.member_id+'-'+method+'-'+phases[i];
  add('effort',id,{member_id:member.member_id,phase:phases[i],method,person_id:person,started_at:new Date(start).toISOString(),ended_at:new Date(end).toISOString(),person_minutes:String(minutes[i]),work_key:id,matched_group_id:'MATCH-'+member.member_id,population_complete:'true',phase_complete:'true'},new Date(end).toISOString());
 }
 // Finalize each frozen decision only after all actual business families have been assembled.
 // Prior allocations/picks/dispatches are real known inputs to later decisions.
 const oldInputDocs=new Set(records.decision_inputs.map(r=>r.source_document_id));
 records.decision_inputs=[];for(let i=documents.length-1;i>=0;i--)if(oldInputDocs.has(documents[i].id))documents.splice(i,1);
 const completeInputFamilies=KINDS.filter(k=>!['decision_cases','decision_inputs','allocation_proposals','decision_reviews','population_members','effort'].includes(k));
 for(const c of records.decision_cases){
  const rows=[];
  for(const family of completeInputFamilies){
   const known=records[family].filter(r=>Date.parse(r.available_at)<=Date.parse(c.decided_at));
   const superseded=new Set(known.map(r=>r.supersedes_id).filter(Boolean));
   for(const r of known)if(!superseded.has(r.id)&&r.record_status==='active')rows.push({family,r});
  }
  c.expected_inputs=String(rows.length);
  c.expected_order_lines=String(rows.filter(x=>x.family==='order_lines').length);
  c.expected_lots=String(rows.filter(x=>x.family==='lots').length);
  const d=documents.find(x=>x.id===c.source_document_id);
  d.text=JSON.stringify({data_class:'authored_course',family:'decision_cases',record:c},null,2);d.sha256=SHA.sha256Utf8(d.text).sha256;
  rows.forEach((x,i)=>add('decision_inputs',c.id+'-INPUT-'+String(i+1).padStart(3,'0'),{decision_case_record_id:c.id,family:x.family,record_id:x.r.id,row_sha256:Source.hashRow(x.r)},c.decided_at));
 }
 return {schema:'distribution.authored-course.v1',data_class:'authored_course',label:'Two warehouses: lot evidence, repacking and actual partial dispatch',records,documents,plan:{as_of:'2026-10-02T00:00:00Z',population_start:day('06:00'),population_end:day('18:00'),operator_id:'OP',warehouse_ids:['W-EAST','W-WEST'],population_complete:true,required_effort_phases:phases,baseline_method:'baseline_process',current_method:'study_process'},notes:{authored:true,not_customer_data:true,separate_from_six_order_research_example:true,expected:{opening_kg:220,receipt_kg:100,repack_input_kg:80,repack_output_kg:75,repack_loss_kg:5,transfer_kg:20,gross_dispatched_kg:115,returned_kg:5,writeoff_kg:10,physical_remaining_kg:195,population_members:12,effort_baseline:324,effort_current:300,effort_change:-24},binding_status:'Review digests require bindEngine against the actual engine. Enum matrix must match actual engine before acceptance.'}};
}
function optionsFor(fixture,at=fixture.plan.as_of){
 const docs=new Map(fixture.documents.map(d=>[d.id,d]));
 return {as_of:at,operator_id:'OP',warehouse_id:'',population_start:fixture.plan.population_start,population_end:fixture.plan.population_end,population_key:'AUTHORED-20261001',expected_members:fixture.records.population_members.length,population_complete:true,expected_counts:Object.fromEntries(KINDS.map(k=>[k,fixture.records[k].length])),extract_available_at:Object.fromEntries(KINDS.map(k=>[k,'2026-09-01T00:00:00Z'])),document:(id,time)=>{const d=docs.get(id);return d&&Date.parse(d.available_at)<=Date.parse(time)?d:null;}};
}
function bindEngine(fixture,Engine){
 for(const review of fixture.records.decision_reviews){
  const caseRow=fixture.records.decision_cases.find(r=>r.id===review.decision_case_record_id);
  const inputs=fixture.records.decision_inputs.filter(r=>r.decision_case_record_id===caseRow.id);
  const proposals=fixture.records.allocation_proposals.filter(r=>r.decision_case_record_id===caseRow.id);
  review.decision_basis_sha256=Engine.decisionBasis(caseRow,inputs,proposals);
  const d=fixture.documents.find(d=>d.id===review.source_document_id);
  d.text=JSON.stringify({data_class:'authored_course',family:'decision_reviews',record:review},null,2);d.sha256=SHA.sha256Utf8(d.text).sha256;
 }
 fixture.notes.binding_status='Exact decision basis bound through delivered engine; actual execution result is retained separately.';
 return fixture;
}

function run(Engine=require('./distribution-engine.cjs')){
 const T=require('./study-time.cjs'),Effort=require('./distribution-effort.cjs');
 const fixture=bindEngine(build(),Engine),result=Engine.analyze(fixture.records,optionsFor(fixture));
 const checks=[],assert=(name,value,actual)=>{checks.push({name,pass:!!value,actual:T.reveal(actual)});if(!value)throw Error('Course failed: '+name);};
 const ledger=result.ledger(),qty=x=>x?Number(x.n)/Number(x.d):null;
 assert('All canonical sources and declared raw-row counts remain valid',result.input_valid&&result.population_complete,{families:KINDS.length,rows:Object.values(fixture.records).reduce((n,x)=>n+x.length,0),documents:fixture.documents.length});
 const balances=ledger.balances.map(x=>({lot:x.lot_id,warehouse:x.warehouse_id,kg:qty(x.quantity)})).sort((a,b)=>(a.lot+a.warehouse).localeCompare(b.lot+b.warehouse));
 const expected=[{lot:'LOT-A',warehouse:'W-EAST',kg:10},{lot:'LOT-B',warehouse:'W-EAST',kg:55},{lot:'LOT-C',warehouse:'W-EAST',kg:30},{lot:'LOT-D',warehouse:'W-EAST',kg:50},{lot:'LOT-E',warehouse:'W-EAST',kg:20},{lot:'LOT-E',warehouse:'W-WEST',kg:30}];
 assert('Physical source transactions reconcile to all six exact balances and 195 kg',ledger.complete&&JSON.stringify(balances)===JSON.stringify(expected)&&balances.reduce((n,x)=>n+x.kg,0)===195,balances);
 const repack=ledger.repacking.find(x=>x.job_record_id==='REPACK-1');
 assert('Same material repacking converts three bags to 75 kg and retains actual 5 kg loss',repack.complete&&qty(repack.input)===80&&qty(repack.output)===75&&qty(repack.loss)===5,repack);
 const transit=result.ledger(Date.parse('2026-10-01T08:30:00Z'));
 assert('Retrospective mid-transfer view keeps 20 kg in transit outside both warehouses',transit.in_transit.length===1&&qty(transit.in_transit[0].quantity)===20&&!transit.balances.some(x=>x.lot_id==='LOT-E'&&x.warehouse_id==='W-EAST'),{in_transit:transit.in_transit,balances:transit.balances});
 const decisions=fixture.records.decision_cases.map(x=>result.decision(x.id)),early=decisions.find(x=>x.decision_case_record_id==='DECISION-EARLY'),late=decisions.find(x=>x.decision_case_record_id==='DECISION-LATE');
 assert('Late QA release supports later proposal without rewriting the rejected early proposal',decisions.every(x=>x.complete)&&!early.accepted&&!early.proposals[0].eligible&&late.accepted&&late.proposals[0].eligible,decisions.map(x=>({id:x.decision_case_record_id,complete:x.complete,accepted:x.accepted,proposals:x.proposals})));
 const safe=decisions.find(x=>x.decision_case_record_id==='DECISION-EAST-SAFE'),rank=safe.rankings.find(x=>x.order_record_id==='ORDER-3').candidates;
 assert('FEFO ranks eligible A ahead of E while the earlier-expiry held C stays ineligible',rank.filter(x=>x.eligible)[0]?.lot_record_id==='LOT-A'&&rank.find(x=>x.lot_record_id==='LOT-C').eligible===false,rank);
 const unknown=safe.rankings.find(x=>x.order_record_id==='ORDER-5').candidates;
 assert('Absent customer date rule stays unresolved rather than zero remaining days',unknown.every(x=>!x.eligible)&&unknown.some(x=>x.issues.includes('CUSTOMER_DATE_RULE_UNOBSERVED')),unknown);
 assert('Partial physical dispatch and returned quarantine remain observable',ledger.pending_returns.length===1&&qty(ledger.pending_returns[0].quantity)===5&&qty(ledger.balances.find(x=>x.lot_id==='LOT-B').pending_return)===5&&fixture.records.dispatch_lines.find(x=>x.id==='DL-1').quantity==='1',ledger.pending_returns);
 const effort=Effort.evaluate({current:result.view.root.current},fixture.records.population_members,fixture.plan,(id,at)=>result.context('person',id,at),true,result.view.cutoff);
 assert('All twelve members retain all eight phases with QA and exception review increases',effort.complete&&qty(effort.baseline)===324&&qty(effort.current)===300&&qty(effort.change)===-24,effort);
 return {checks,fixture,summary:T.reveal({ledger,decisions,effort,issues:result.issues})};
}


function utf8(text){const out=[];for(const ch of text){const cp=ch.codePointAt(0);if(cp<128)out.push(cp);else if(cp<2048)out.push(192|cp>>6,128|cp&63);else if(cp<65536)out.push(224|cp>>12,128|cp>>6&63,128|cp&63);else out.push(240|cp>>18,128|cp>>12&63,128|cp>>6&63,128|cp&63);}return new Uint8Array(out);}
function receiveFixture(Core=require('./core.cjs'),onProgress=()=>{}){
 const Engine=require('./distribution-engine.cjs'),CSV=require('./csv.cjs'),fixture=bindEngine(build(),Engine),captured='2026-10-02T00:00:00Z';
 let study=Core.empty('Complete authored two-warehouse lot and order workflow');study.id='distribution-authored-complete-20261001';
 study.config.data_class='authored_course';study.config.source_scope='Fictional unchanged source exports and original documents for two warehouses, 1 October 2026.';
 study.config.returned_scope='Fictional commissioned copies with explicit identical record crosswalks; all physical and decision records retained.';
 study.config.authority_notes='Named fictional warehouse, QA, procurement and operations authority. No regulatory release or real customer decision is inferred.';
 study.config.distribution={...study.config.distribution,...fixture.plan,warehouse_id:'',population_key:'AUTHORED-20261001',expected_members:fixture.records.population_members.length,source_population_complete:true,expected_counts:Object.fromEntries(KINDS.map(k=>[k,fixture.records[k].length])),selection_notes:'All five physical lots, one receipt and six original order lines, including actual cancellation and unknown customer requirement.',measurement_notes:'All twelve population members have eight observed recurring phases per method. Increased QA/exception review remains included.'};
 const mapping={},bytesById={};
 for(const [index,d]of fixture.documents.entries()){
  const name=d.id+'.json',bytes=utf8(d.text);
  study=Core.addDocument(study,{name,media_type:'application/json',bytes,at:captured,available_at:d.available_at,notes:'Exact authored original ID '+d.id});
  const saved=study.documents.find(x=>x.name===name&&x.sha256===d.sha256);if(!saved)throw Error('Original document was not retained exactly: '+d.id);
  mapping[d.id]=saved.id;bytesById[d.id]=d.sha256;if((index+1)%100===0)onProgress({stage:'documents',completed:index+1,total:fixture.documents.length});
 }
 const mapped=clone(fixture.records);
 for(const family of KINDS)for(const row of mapped[family])for(const key of ['source_document_id','basis_document_id','method_document_id'])if(row[key]){if(!mapping[row[key]])throw Error('Missing original document mapping '+row[key]);row[key]=mapping[row[key]];}
 for(const family of ['lot_state_inputs','decision_inputs'])for(const row of mapped[family]){
  const target=mapped[row.family].find(x=>x.id===row.record_id);if(!target)throw Error('Missing exact frozen input '+row.family+'/'+row.record_id);row.row_sha256=Engine.hashRow(target);
 }
 for(const review of mapped.decision_reviews){const c=mapped.decision_cases.find(x=>x.id===review.decision_case_record_id);review.decision_basis_sha256=Engine.decisionBasis(c,mapped.decision_inputs.filter(x=>x.decision_case_record_id===c.id),mapped.allocation_proposals.filter(x=>x.decision_case_record_id===c.id));}
 const csvFiles={};
 for(const family of KINDS){
  const content=CSV.csv([FIELDS[family],...mapped[family].map(r=>FIELDS[family].map(k=>r[k]))]),map=Object.fromEntries(FIELDS[family].map(k=>[k,k]));
  csvFiles[family]=content;
  for(const side of ['source','returned'])study=Core.importExtract(study,{kind:family,side,name:'authored-'+side+'-'+family+'.csv',content,mapping:map,label:'Complete authored '+family,at:captured,available_at:'2026-09-30T06:00:00Z'});
  study=Core.matchIds(study,family);onProgress({stage:'csv',family,completed:Object.keys(csvFiles).length,total:KINDS.length});
 }
 // Bulk fixture links are explicit supplied values and are validated as one complete successor.
 // The source documents already retain exact bytes through addDocument above.
 for(const side of ['source','returned'])for(const family of KINDS)for(const row of mapped[family])study.document_links.push({side,kind:family,record_id:row.id,document_id:row.source_document_id,notes:'Exact authored source original',available_at:row.available_at});
 Core.validate(study);
 return{study,fixture,canonical_records:mapped,document_id_mapping:mapping,document_sha256:bytesById,csvFiles};
}
function buildStudy(Core=require('./core.cjs'),onProgress=()=>{}){return receiveFixture(Core,onProgress).study;}
function runApp(input,Core=require('./core.cjs'),Session=require('./session.cjs')){
 const base=input?.study||input||buildStudy(Core),checks=[];
 const assert=(name,value,actual)=>{checks.push({name,pass:!!value,actual});if(!value)throw Error('Application course failed: '+name);};
 let study=Core.clone(base),r=Core.analyze(study);
 assert('Both sides import all 39 families and preserve all 78 original CSV files',study.originals.length===78&&study.extracts.length===78&&r.findings.length===0&&r.comparison_state==='selected_fields_match',{originals:study.originals.length,extracts:study.extracts.length,crosswalks:study.crosswalks.length,documents:study.documents.length});
 assert('Complete application retains twelve members and exact stock account',r.distribution.population.complete&&r.distribution.population.observed===12&&r.distribution.stock.complete,{population:r.distribution.population,balances:r.distribution.stock.balances});
 assert('Whole source view preserves unknown compliant fill and all recurring effort',r.distribution.fulfilment.compliant_line_fraction===null&&r.distribution.effort.complete&&r.distribution.effort.change.numerator==='-24',{fulfilment:r.distribution.fulfilment,effort:r.distribution.effort});
 for(const role of ['qa','operations'])study=Core.review(study,{study_sha256:Core.digest(study),role,reviewer:role==='qa'?'Quinn Quality':'Pat Planning',at:'2026-10-02T00:05:00Z',decision:'accepted',notes:'Authored source account reviewed; unknown customer requirement and partial outcomes remain visible.'});
 const reviewed=Core.analyze(study);assert('Named source reviews bind the complete study without inventing missing business rules',reviewed.decision==='recorded_acceptance'&&reviewed.distribution.fulfilment.compliant_line_fraction===null,{decision:reviewed.decision,roles:reviewed.role_reviews});
 let session=Session.create(study);session.id='session-distribution-authored-20261001';
 const draft={study_id:study.id,expected_extract_id:Core.selected(study,'order_lines','returned').id,pending_original:'id,comment\r\nORDER-5,"Await actual customer rule"\r\n',notes:'Unfinished original mapping and correction remain portable.'};
 session=Session.draft(session,'unfinished-order-source',draft);
 const other=Session.draft(Session.create(study),'other-browser-form',{notes:'Retained competing browser branch',text:'line one\r\nline two'});session=Session.retain(session,other,'Retain the complete other browser branch');
 const corrected=Core.clone(study);corrected.notes='Later review note; earlier source review remains attached to its own exact edition.';
 session=Session.checkpoint(session,corrected,'Preserve complete reviewed preimage before current note correction');
 const reopened=Session.normalize(JSON.parse(JSON.stringify(session))),prior=Session.historyStudy(reopened,reopened.history.at(-1)),branch=Session.branchSession(reopened,reopened.backups.at(-1));
 assert('Saved session reopens unfinished originals, complete branch and exact reviewed preimage',JSON.stringify(reopened.drafts['unfinished-order-source'])===JSON.stringify(draft)&&branch.drafts['other-browser-form'].text==='line one\r\nline two'&&Core.digest(prior)===Core.digest(study),{draft:reopened.drafts['unfinished-order-source'],branch:branch.drafts,prior_digest:Core.digest(prior),reviewed_digest:Core.digest(study)});
 const exported=Session.exports(reopened),portable=JSON.parse(exported.find(x=>x.path==='session.json').content),again=Session.normalize(portable);
 assert('Whole export carries selected tables, every original document and current editable session',exported.some(x=>x.path==='comparison.md')&&exported.some(x=>x.path==='distribution/report.md')&&exported.filter(x=>x.path.startsWith('selected/')&&x.path.endsWith('.csv')).length===78&&again.study.documents.length===study.documents.length&&Core.digest(again.study)===Core.digest(reopened.study),{members:exported.length,documents:again.study.documents.length,source_originals:again.study.originals.length});
 let refused=false;try{Core.review(reopened.study,{study_sha256:Core.digest(study),role:'qa',reviewer:'Quinn Quality',at:'2026-10-02T00:10:00Z',decision:'accepted',notes:'Stale review probe'});}catch(e){refused=/another selected edition/.test(e.message);}
 assert('Earlier review cannot silently bind a later selected study',refused,{refused});
 return{checks,study,session:reopened,analysis:reviewed,report:Core.report(study),export_index:exported.map(x=>({path:x.path,bytes:x.content!==undefined?SHA.utf8ByteLength(x.content):x.bytes.length,sha256:x.content!==undefined?SHA.sha256Utf8(x.content).sha256:SHA.sha256Bytes(new Uint8Array(x.bytes)).sha256}))};
}

module.exports={build,bindEngine,optionsFor,run,receiveFixture,buildStudy,runApp,phases};
