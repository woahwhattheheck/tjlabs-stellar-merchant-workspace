'use strict';
const T=require('./study-time.cjs'),Schema=require('./schema.cjs'),{R,time,inside}=T;
const unr=x=>x&&typeof x.n==='bigint'?x:x&&x.numerator!==undefined?R.R(BigInt(x.numerator),BigInt(x.denominator)):null;
function attach(e,options){
 const v=e.view,cut=v.cutoff,current=(f,k)=>v.snapshot(k).current[f],valid=(f,k)=>current(f,k).map(r=>e.evaluate(f,r.values.id,k)).filter(Boolean),same=(f,a,b,k)=>e.sameEntity(f,a,b,k),q=x=>unr(x.amount.quantity),cache=new Map();
 const latest=(xs,field='start')=>{const s=xs.slice().sort((a,b)=>b[field]-a[field]);return s.length&&new Set(s.filter(x=>x[field]===s[0][field]).map(x=>x.state??x.decision)).size>1?null:s[0]||null;};
 function ledger(at=cut,knownAt=cut){
  const key=at+'@'+knownAt;if(cache.has(key))return cache.get(key);const movements=[],issues=[],repacking=[],pending=[],inTransit=[],ambiguousAliases=[];
  const addIssue=(code,family,id,detail)=>issues.push({code,family,id,detail});
  const push=(x,wh,n,t,kind)=>{if(t<=at)movements.push({family:x.family,record_id:x.id,lot_record_id:x.lot_record_id,lot_id:x.lot_id,operator_id:x.operator_id,warehouse_id:wh,product_id:x.product_id,base_unit:x.amount.base_unit,material_id:x.material_id,quantity:n,at:t,kind,source_document_id:x.source_document_id,source_ref:x.source_ref});};
  function unique(f,rows){
   const groups=new Map();for(const x of rows){const identity=f==='opening_balances'?x.lot_id+'\0'+x.warehouse_id:f==='receipts'?x.purchase_line_record_id+'\0'+x.supplier_ref:x.external_ref;if(!identity){addIssue('MOVEMENT_ORIGINAL_IDENTITY_UNRESOLVED',f,x.id,'Original physical movement identity is missing');continue;}const key=x.operator_id+'\0'+identity;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x);}
   const out=[];for(const xs of groups.values()){const sig=x=>JSON.stringify([x.lot_id,x.warehouse_id,x.from_warehouse_id||'',x.to_warehouse_id||'',x.start,x.end,x.quantity,x.unit,x.disposition||'',x.dispatch_line_record_id||'',x.reason||'']);if(new Set(xs.map(sig)).size>1){ambiguousAliases.push(xs.map(x=>x.id));for(const x of xs)addIssue('MOVEMENT_ALIAS_CONFLICT',f,x.id,'Same original movement reference has contradictory observed fields');}else{out.push(xs[0]);if(xs.length>1)ambiguousAliases.push({reconciled_ids:xs.map(x=>x.id),counted_record:xs[0].id});}}return out;
  }
  for(const f of ['opening_balances','receipts','transfers','repack_inputs','repack_outputs','dispatch_lines','returns','writeoffs']){
   const rows=current(f,knownAt);for(const r of rows){const x=e.evaluate(f,r.values.id,knownAt);if(!x)addIssue('PHYSICAL_MOVEMENT_UNRESOLVED',f,r.values.id,'Retained source movement has unresolved quantity, lineage or authority');}
   let xs=valid(f,knownAt).filter(x=>x.start<=at);if(['opening_balances','receipts','transfers','returns','writeoffs'].includes(f))xs=unique(f,xs);
   for(const x of xs){
    if(f==='transfers'){push(x,x.from_warehouse_id,R.sub(R.zero(),q(x)),x.start,'transfer_sent');if(x.received_at&&time(x.received_at)<=at)push(x,x.to_warehouse_id,q(x),time(x.received_at),'transfer_received');else inTransit.push({...x,quantity:q(x)});}
    else if(f==='returns'){push(x,x.warehouse_id,q(x),x.start,'customer_return');const events=valid('return_events',knownAt).filter(a=>same('returns',a.return_record_id,x.id,knownAt)&&a.start<=at),last=latest(events);if(current('return_events',knownAt).some(r=>same('returns',r.values.return_record_id,x.id,knownAt)&&time(r.values.event_at)<=at&&!e.evaluate('return_events',r.values.id,knownAt)))addIssue('RETURN_DISPOSITION_UNRESOLVED','returns',x.id,'Retained return disposition includes an unresolved actual event');if(last?.state==='disposed')push(x,x.warehouse_id,R.sub(R.zero(),q(x)),last.start,'return_disposed');else if(last?.state!=='restocked')pending.push({...x,quantity:q(x),disposition:last?.state||'unobserved'});}
    else push(x,x.warehouse_id,['repack_inputs','dispatch_lines','writeoffs'].includes(f)?R.sub(R.zero(),q(x)):q(x),x.start,f);
   }
  }
  for(const j of valid('repack_jobs',knownAt).filter(x=>x.end<=at)){
   const ins=valid('repack_inputs',knownAt).filter(x=>same('repack_jobs',x.job_record_id,j.id,knownAt)),outs=valid('repack_outputs',knownAt).filter(x=>same('repack_jobs',x.job_record_id,j.id,knownAt)),units=new Set([...ins,...outs].map(x=>x.amount.base_unit)),input=R.sum(ins.map(q)),output=R.sum(outs.map(q)),loss=T.nonnegative(j.loss_quantity),complete=j.input_complete==='true'&&j.output_complete==='true'&&Number(j.expected_inputs)===ins.length&&Number(j.expected_outputs)===outs.length&&units.size===1&&units.has(j.loss_unit)&&loss&&R.cmp(input,R.add(output,loss))===0n;
   repacking.push({job_record_id:j.id,warehouse_id:j.warehouse_id,material_id:j.material_id,base_unit:units.size===1?[...units][0]:null,input,output,loss,complete:!!complete});if(!complete)addIssue('REPACK_MATERIAL_BALANCE_UNRESOLVED','repack_jobs',j.id,'Full same-material inputs must equal actual outputs plus explicitly recorded process loss in the same physical unit');
  }
  const balances=new Map();movements.sort((a,b)=>a.at-b.at||(a.quantity.n>=0n?-1:1)-(b.quantity.n>=0n?-1:1)||a.record_id.localeCompare(b.record_id));
  for(const m of movements){const key=m.operator_id+'\0'+m.warehouse_id+'\0'+m.lot_id;if(!balances.has(key))balances.set(key,{operator_id:m.operator_id,warehouse_id:m.warehouse_id,lot_id:m.lot_id,lot_record_id:m.lot_record_id,product_id:m.product_id,material_id:m.material_id,base_unit:m.base_unit,quantity:R.zero(),pending_return:R.zero(),movements:[],complete:true});const x=balances.get(key);if(x.base_unit!==m.base_unit||x.product_id!==m.product_id){x.complete=false;addIssue('LOT_UNIT_IDENTITY_CONFLICT',m.family,m.record_id,'Same physical lot has inconsistent product/base unit');}x.quantity=R.add(x.quantity,m.quantity);x.movements.push(m.record_id);if(x.quantity.n<0n){x.complete=false;addIssue('PHYSICAL_STOCK_NEGATIVE',m.family,m.record_id,'Observed movements exceed then-observed physical stock');}}
  for(const r of pending){const x=[...balances.values()].find(x=>x.operator_id===r.operator_id&&x.warehouse_id===r.warehouse_id&&x.lot_id===r.lot_id);if(x)x.pending_return=R.add(x.pending_return,r.quantity);}
  for(const x of balances.values()){x.available_before_qa=R.sub(x.quantity,x.pending_return);if(x.available_before_qa.n<0n){x.complete=false;addIssue('RETURN_QUARANTINE_EXCEEDS_STOCK','returns',x.lot_id,'Unresolved returned stock exceeds observed on-hand quantity');}}
  for(const d of valid('dispatch_lines',knownAt).filter(x=>x.start<=at)){const returned=R.sum(valid('returns',knownAt).filter(x=>same('dispatch_lines',x.dispatch_line_record_id,d.id,knownAt)&&x.start<=at).map(q));if(R.cmp(returned,q(d))>0n)addIssue('RETURN_EXCEEDS_DISPATCH','dispatch_lines',d.id,'Observed returns exceed the actual original dispatched quantity');}
  for(const a of valid('allocations',knownAt).filter(x=>x.start<=at)){const picked=R.sum(valid('picks',knownAt).filter(x=>same('allocations',x.allocation_record_id,a.id,knownAt)&&x.start<=at).map(q));if(R.cmp(picked,q(a))>0n)addIssue('PICK_EXCEEDS_ALLOCATION','allocations',a.id,'Observed picked quantity exceeds the actual allocation');}
  for(const p of valid('picks',knownAt).filter(x=>x.start<=at)){const sent=R.sum(valid('dispatch_lines',knownAt).filter(x=>same('picks',x.pick_record_id,p.id,knownAt)&&x.start<=at).map(q));if(R.cmp(sent,q(p))>0n)addIssue('DISPATCH_EXCEEDS_PICK','picks',p.id,'Observed dispatched quantity exceeds the actual pick');}
  const result={as_of:v.instant(at),known_at:v.instant(knownAt),complete:!issues.length&&e.input_valid&&e.population_complete,balances:[...balances.values()],movements,in_transit:inTransit,pending_returns:pending,repacking,aliases:ambiguousAliases,issues};cache.set(key,result);return result;
 }
 function readiness(lotRecordId,warehouseId,at=cut,knownAt=cut,policyRecordId){
  const l=e.evaluate('lots',lotRecordId,knownAt),issues=[];if(!l)return{state:'unknown',eligible:false,issues:['LOT_UNRESOLVED'],certificates:[],holds:[]};
  const policies=valid('policies',knownAt).filter(x=>x.operator_id===l.operator_id&&x.warehouse_id===warehouseId&&x.material_id===l.material_id&&inside(x.valid_from,x.valid_to,at)),p=policyRecordId?policies.find(x=>same('policies',x.id,policyRecordId,knownAt)):policies.length===1?policies[0]:null;
  if(!p)issues.push('QA_POLICY_UNRESOLVED');
  const holds=[];for(const h of valid('lot_holds',knownAt).filter(x=>same('lots',x.lot_record_id,l.id,knownAt)&&x.warehouse_id===warehouseId&&x.start<=at)){const ev=valid('hold_events',knownAt).filter(x=>same('lot_holds',x.hold_record_id,h.id,knownAt)&&x.start<=at),last=latest(ev);if(last?.state!=='released')holds.push({hold_record_id:h.id,state:last?.state||'open'});}
  for(const raw of current('lot_holds',knownAt))if(raw.values.lot_record_id===lotRecordId&&raw.values.warehouse_id===warehouseId&&time(raw.values.raised_at)<=at&&!e.evaluate('lot_holds',raw.values.id,knownAt))issues.push('HOLD_SOURCE_UNRESOLVED');
  if(holds.length)issues.push('ACTUAL_QA_HOLD_OPEN');
  const states=valid('lot_state_events',knownAt).filter(x=>same('lots',x.lot_record_id,l.id,knownAt)&&x.warehouse_id===warehouseId&&x.start<=at),s=latest(states),certificates=[];
  const rawStates=current('lot_state_events',knownAt).filter(r=>same('lots',r.values.lot_record_id,l.id,knownAt)&&r.values.warehouse_id===warehouseId&&time(r.values.event_at)<=at);if(rawStates.some(r=>(!s||time(r.values.event_at)>=s.start)&&!e.evaluate('lot_state_events',r.values.id,knownAt)))issues.push('LATEST_QA_STATE_UNRESOLVED');
  if(!s)issues.push('QA_STATE_UNOBSERVED');else if(s.state!=='released')issues.push('QA_STATE_'+s.state.toUpperCase());
  if(s?.state==='released'){
   const inputs=current('lot_state_inputs',knownAt).filter(r=>r.values.state_event_record_id===s.id),parsed=inputs.map(r=>e.evaluate('lot_state_inputs',r.values.id,knownAt));
   if(s.inputs_complete!=='true'||Number(s.expected_inputs)!==inputs.length||parsed.some(x=>!x))issues.push('QA_RELEASE_INPUT_POPULATION_UNRESOLVED');
   if(!p||!same('policies',s.policy_record_id,p.id,knownAt))issues.push('QA_RELEASE_POLICY_UNRESOLVED');
   for(const kind of p?.required_certificate_kinds||[]){
    const cs=valid('certificates',knownAt).filter(c=>same('lots',c.lot_record_id,l.id,knownAt)&&c.certificate_kind===kind&&c.start<=at&&(!c.valid_until||time(c.valid_until)>at));
    const accepted=[];for(const c of cs){const rs=valid('certificate_reviews',knownAt).filter(r=>r.certificate_record_id===c.id&&r.certificate_kind===kind&&r.warehouse_id===warehouseId&&r.start<=s.start&&(!p||same('policies',r.policy_record_id,p.id,knownAt))),last=latest(rs);const unclear=current('certificate_reviews',knownAt).some(r=>r.values.certificate_record_id===c.id&&time(r.values.reviewed_at)<=s.start&&(!last||time(r.values.reviewed_at)>=last.start)&&!e.evaluate('certificate_reviews',r.values.id,knownAt));if(!unclear&&last?.decision==='accepted'&&parsed.some(i=>i?.family==='certificate_reviews'&&i.record_id===last.id))accepted.push({certificate_record_id:c.id,review_record_id:last.id,certificate_sha256:last.certificate_sha256});}
    if(accepted.length!==1)issues.push('CURRENT_CERTIFICATE_REVIEW_UNRESOLVED:'+kind);certificates.push({kind,accepted});
   }
   const thenHolds=valid('lot_holds',s.start).filter(h=>same('lots',h.lot_record_id,l.id,s.start)&&h.warehouse_id===warehouseId&&h.start<=s.start);for(const h of thenHolds){const last=latest(valid('hold_events',s.start).filter(x=>same('lot_holds',x.hold_record_id,h.id,s.start)&&x.start<=s.start));if(last?.state!=='released'||!parsed.some(i=>i?.family==='hold_events'&&i.record_id===last.id))issues.push('QA_RELEASE_HOLD_INPUT_UNRESOLVED');}
  }
  return{lot_record_id:l.id,warehouse_id:warehouseId,state:issues.length?holds.length?'held':s?.state==='quarantined'||s?.state==='rejected'?s.state:'unknown':'released',eligible:issues.length===0,policy_record_id:p?.id||null,state_record_id:s?.id||null,certificates,holds,issues};
 }
 function orderState(o,at,knownAt){const raw=current('order_events',knownAt).filter(r=>same('order_lines',r.values.order_line_record_id,o.id,knownAt)&&time(r.values.event_at)!==null&&time(r.values.event_at)<=at).sort((a,b)=>time(b.values.event_at)-time(a.values.event_at));if(!raw.length)return'open';const t=time(raw[0].values.event_at),xs=raw.filter(r=>time(r.values.event_at)===t).map(r=>e.evaluate('order_events',r.values.id,knownAt));return xs.some(x=>!x)||new Set(xs.map(x=>x.state)).size!==1?'unknown':xs[0].state;}
 function eligibility(orderRecordId,lotRecordId,at=cut,knownAt=cut,policyRecordId){
  const o=e.evaluate('order_lines',orderRecordId,knownAt),l=e.evaluate('lots',lotRecordId,knownAt),issues=[];if(!o||!l)return{eligible:false,issues:['ORDER_OR_LOT_UNRESOLVED']};
  if(o.start>at||l.created>at)issues.push('ORDER_OR_LOT_NOT_YET_OBSERVED');
  if(o.product_id!==l.product_id||o.operator_id!==l.operator_id)issues.push('PRODUCT_OR_OPERATOR_MISMATCH');
  const state=orderState(o,at,knownAt);if(state==='cancelled')issues.push('ORDER_CANCELLED');if(state==='unknown')issues.push('ORDER_STATE_UNRESOLVED');
  const ready=readiness(lotRecordId,o.warehouse_id,at,knownAt,policyRecordId);issues.push(...ready.issues);
  const stock=ledger(at,knownAt),balance=stock.balances.find(x=>x.lot_id===l.lot_id&&x.operator_id===l.operator_id&&x.warehouse_id===o.warehouse_id);
  let available=balance?.available_before_qa||R.zero();
  const outstanding=valid('allocations',knownAt).filter(a=>same('lots',a.lot_record_id,l.id,knownAt)&&a.warehouse_id===o.warehouse_id&&a.start<at).map(a=>{const sent=R.sum(valid('dispatch_lines',knownAt).filter(d=>same('allocations',d.allocation_record_id,a.id,knownAt)&&d.start<at).map(q));const r=R.sub(q(a),sent);return r.n>0n?r:R.zero();});
  available=R.sub(available,R.sum(outstanding));
  if(!balance||!balance.complete||available.n<=0n)issues.push('AVAILABLE_STOCK_UNRESOLVED_OR_EMPTY');
  const rule=o.rule_record_id&&e.evaluate('customer_rules',o.rule_record_id,knownAt);let remainingDays=null,date=null;
  if(!rule)issues.push('CUSTOMER_DATE_RULE_UNOBSERVED');else if(!inside(rule.valid_from,rule.valid_to,o.start))issues.push('CUSTOMER_DATE_RULE_OUTSIDE_ORDER');
  else if(rule.date_kind!=='none'){date=time(l[rule.date_kind+'_at']);if(l.date_kind!==rule.date_kind||date===null)issues.push('LOT_DATE_MEANING_UNRESOLVED');else{remainingDays=R.R(BigInt(date-time(o.due_at)),86400000n);if(R.cmp(remainingDays,T.nonnegative(rule.minimum_remaining_days))<0n||date<=at)issues.push('CUSTOMER_REMAINING_LIFE_UNMET');}}
  return{order_record_id:o.id,lot_record_id:l.id,warehouse_id:o.warehouse_id,eligible:issues.length===0,available_quantity:available,base_unit:l.base_unit,remaining_days:remainingDays,ranking_date:ready.policy_record_id&&e.evaluate('policies',ready.policy_record_id,knownAt)?.ranking_rule==='FIFO'?l.created:date,qa:ready,issues:[...new Set(issues)]};
 }
 function decision(caseId,knownAt=cut){
  const c=e.evaluate('decision_cases',caseId,knownAt);if(!c)return{decision_case_record_id:caseId,complete:false,proposals:[],issues:['DECISION_SOURCE_UNRESOLVED']};
  const t=c.start,raw=v.ref('decision_cases',caseId,knownAt),ins=current('decision_inputs',knownAt).filter(r=>r.values.decision_case_record_id===caseId),ps=current('allocation_proposals',knownAt).filter(r=>r.values.decision_case_record_id===caseId),inputKeys=new Set(ins.map(r=>r.values.family+':'+r.values.record_id)),issues=[];
  const orders=current('order_lines',t).filter(r=>r.values.operator_id===c.operator_id&&time(r.values.ordered_at)<=t),lots=current('lots',t).filter(r=>r.values.operator_id===c.operator_id&&time(r.values.created_at)<=t);
  if(c.order_population_complete!=='true'||Number(c.expected_order_lines)!==orders.length||orders.some(r=>!inputKeys.has('order_lines:'+r.values.id)))issues.push('COMPLETE_ORDER_POPULATION_UNRESOLVED');
  if(c.lot_population_complete!=='true'||Number(c.expected_lots)!==lots.length||lots.some(r=>!inputKeys.has('lots:'+r.values.id)))issues.push('COMPLETE_LOT_POPULATION_UNRESOLVED');
  if(c.input_population_complete!=='true'||Number(c.expected_inputs)!==ins.length||inputKeys.size!==ins.length||ins.some(r=>!e.evaluate('decision_inputs',r.values.id,knownAt)))issues.push('FROZEN_INPUT_POPULATION_UNRESOLVED');
  const inputFamilies=Schema.KINDS.filter(f=>!['decision_cases','decision_inputs','allocation_proposals','decision_reviews','population_members','effort'].includes(f));
  const missing=[];for(const f of inputFamilies)for(const r of current(f,t)){const z=r.values;if(z.operator_id&&z.operator_id!==c.operator_id)continue;if(!inputKeys.has(f+':'+z.id))missing.push({family:f,record_id:z.id});}
  if(missing.length)issues.push('KNOWN_DECISION_INPUTS_OMITTED');
  const usedLots=new Map(),usedOrders=new Map(),proposals=ps.map(r=>{const p=e.evaluate('allocation_proposals',r.values.id,knownAt),en=p?eligibility(p.order_line_record_id,p.lot_record_id,t,t,c.policy_record_id):{eligible:false,issues:['PROPOSAL_SOURCE_UNRESOLVED']};if(p){usedLots.set(p.lot_record_id,R.add(usedLots.get(p.lot_record_id)||R.zero(),q(p)));usedOrders.set(p.order_line_record_id,R.add(usedOrders.get(p.order_line_record_id)||R.zero(),q(p)));}return{proposal_record_id:r.values.id,valid:!!p,quantity:p?q(p):null,...en};});
  for(const p of proposals)if(p.valid){const o=e.evaluate('order_lines',p.order_record_id,t);if(R.cmp(usedLots.get(p.lot_record_id),p.available_quantity)>0n){p.eligible=false;p.issues.push('PROPOSED_QUANTITY_EXCEEDS_AVAILABLE_STOCK');}if(o&&R.cmp(usedOrders.get(p.order_record_id),q(o))>0n){p.eligible=false;p.issues.push('PROPOSED_QUANTITY_EXCEEDS_ORDER');}}
  const basis=e.decisionBasis(raw,ins,ps),reviews=current('decision_reviews',knownAt).filter(r=>r.values.decision_case_record_id===caseId).map(r=>e.evaluate('decision_reviews',r.values.id,knownAt)).filter(Boolean),last=latest(reviews),complete=!issues.length&&e.input_valid&&e.population_complete;
  const rankings=orders.filter(r=>r.values.warehouse_id===c.warehouse_id).map(o=>({order_record_id:o.values.id,candidates:lots.map(l=>eligibility(o.values.id,l.values.id,t,t,c.policy_record_id)).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||((a.ranking_date??Number.MAX_SAFE_INTEGER)-(b.ranking_date??Number.MAX_SAFE_INTEGER))||a.lot_record_id.localeCompare(b.lot_record_id))}));
  return{decision_case_record_id:caseId,decided_at:c.decided_at,complete,basis_sha256:basis,orders:orders.map(r=>r.values.id),lots:lots.map(r=>r.values.id),missing_inputs:missing,proposals,rankings,review:last||null,accepted:complete&&last?.decision==='accepted'&&proposals.every(p=>p.eligible),issues};
 }
 return{ledger,readiness,eligibility,decision,orderState,unr};
}
module.exports={attach,unr};
