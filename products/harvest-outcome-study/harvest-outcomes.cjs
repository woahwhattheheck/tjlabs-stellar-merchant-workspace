'use strict';
const S=require('./source-view.cjs'),{FIELDS,KINDS,IDS}=require('./harvest-schema.cjs'),T=require('./study-time.cjs'),R=T.R;
const {time,positive,nonnegative,decimal}=T,hashRow=S.hashRow;
const zero=()=>R.R(0n),sum=xs=>xs.reduce((a,x)=>R.add(a,x),zero()),qv=x=>x?R.value(x):null;
const canonical=x=>JSON.stringify(x);
const hash=x=>require('./sha256.cjs').sha256Utf8(canonical(x)).sha256;
const manifestHash=rows=>hash(rows.map(r=>r.values||r).map(r=>({family:r.family,record_id:r.record_id,row_sha256:r.row_sha256})).sort((a,b)=>canonical(a).localeCompare(canonical(b))));
const planBasis=(row,lines)=>hash({plan:row.values||row,lines:lines.map(x=>x.values||x).sort((a,b)=>a.id.localeCompare(b.id))});
function analyze(records,options={}){
 const view=S.create(records,options);if(view.cutoff===undefined)return view;
 const {cutoff,root,ref,snapshot,context,document,authority,issue,instant}=view,cache=new Map(),busy=new Set();
 const val=r=>r?.values;
 const out=(f,r,extra={})=>({family:f,record_id:r.values.id,record_key:r.values.record_key,record_sha256:r.hash,source:r.source,source_ref:r.values.source_ref,source_document_id:r.values.source_document_id,valid:true,...extra});
 const protocolBasis=(p,at)=>{if(!p)return null;const d=p.method_document_id?document(p.method_document_id,at):null;return {protocol_id:p.id,record_id:p.record_id||p.id,record_sha256:p.record_sha256||hash(p),method_document_id:p.method_document_id||'',method_document_sha256:d?(d.sha256||hash(d)):''};};
 const sameProtocol=(a,b)=>!!a&&!!b&&hash(a)===hash(b);
 const event=(v,k)=>time(v[k])!==null&&time(v[k])<=time(v.recorded_at)?time(v[k]):null;
 const err=(f,r,msg,at)=>{issue('HARVEST_RELATION_UNRESOLVED',f,r?.values.id,msg,instant(at));return null;};
 const current=(f,at)=>snapshot(at).current[f];
 const exactQty=(x,y)=>x&&y&&R.cmp(x,y)===0n;
 const lotKey=(id,at)=>ref('harvest_batches',id,at)?.values.record_key;
 const sameLot=(a,z,at)=>!!lotKey(a,at)&&lotKey(a,at)===lotKey(z,at);
 function physicalUsedThrough(id,eventAt,knownAt){
  const a=baseBatch(id,knownAt);if(!a)return null;const values=[];
  for(const[f,key,when]of[['harvest_transfers','source_batch_record_id','transferred_at'],['harvest_dispatches','batch_record_id','dispatched_at'],['harvest_dispositions','batch_record_id','event_at']]){
   for(const r of current(f,knownAt)){const v=r.values;if(!sameLot(v[key],id,knownAt))continue;const t=event(v,when);if(t===null)return null;if(t>eventAt)continue;const n=positive(v.quantity);if(!n||v.unit!==a.v.unit)return null;values.push(n);}
  }return sum(values);
 }
 function baseBatch(id,at){
  const r=ref('harvest_batches',id,at);if(!r)return null;const v=r.values,t=event(v,'created_at'),h=time(v.harvested_at),g=t!==null&&context('grower',v.grower_id,t),site=t!==null&&context('site',v.site_id,t),crop=t!==null&&context('crop',v.crop_id,t),qty=positive(v.quantity);
  return t!==null&&h!==null&&h<=t&&v.batch_id&&g&&site?.grower_id===v.grower_id&&crop?.unit===v.unit&&qty&&['harvested','derived'].includes(v.origin)&& (v.origin!=='harvested'||h===t)?{r,v,t,h,qty}:null;
 }
 function transfer(r,at){
  const v=r.values,t=event(v,'transferred_at'),a=t!==null&&baseBatch(v.source_batch_record_id,at),z=baseBatch(v.target_batch_record_id,at),qty=positive(v.quantity);
  if(t===null||!v.transfer_id||!a||!z||a.v.record_key===z.v.record_key||a.t>=t||z.t!==t||z.v.origin!=='derived'||a.v.crop_id!==z.v.crop_id||a.v.grower_id!==z.v.grower_id||a.v.unit!==v.unit||z.v.unit!==v.unit||!qty||!authority('warehouse',v.actor_id,a.v.grower_id,t))return null;
  return out('harvest_transfers',r,{source_batch_record_id:a.v.id,target_batch_record_id:z.v.id,quantity:qv(qty),unit:v.unit,transferred_at:v.transferred_at});
 }
 const lineageCache=new Map(),lineageBusy=new Set();
 function lineage(id,at){
  const key=id+'@'+at;if(lineageCache.has(key))return lineageCache.get(key);if(lineageBusy.has(key))return null;lineageBusy.add(key);
  const a=baseBatch(id,at);let result=null;
  if(a){const inbound=current('harvest_transfers',at).filter(r=>sameLot(r.values.target_batch_record_id,id,at));
   if(a.v.origin==='harvested'&&!inbound.length)result={roots:[a.v.record_key],harvested_at:a.v.harvested_at,depth:0};
   else if(a.v.origin==='derived'&&inbound.length){const moves=inbound.map(r=>transfer(r,at)),parents=inbound.map(r=>lineage(r.values.source_batch_record_id,at)),capacity=inbound.every(r=>{const p=baseBatch(r.values.source_batch_record_id,at),used=physicalUsedThrough(r.values.source_batch_record_id,time(r.values.transferred_at),at),target=baseBatch(r.values.target_batch_record_id,at);return p&&used&&R.cmp(used,p.qty)<=0n&&target&&target.v.crop_id===a.v.crop_id&&target.v.grower_id===a.v.grower_id&&target.v.unit===a.v.unit;});if(moves.every(Boolean)&&parents.every(Boolean)&&capacity&&exactQty(sum(inbound.map(r=>positive(r.values.quantity))),a.qty)){const earliest=Math.min(...parents.map(p=>time(p.harvested_at)));if(earliest===a.h)result={roots:[...new Set(parents.flatMap(p=>p.roots))].sort(),harvested_at:instant(earliest),depth:1+Math.max(...parents.map(p=>p.depth))};}}
  }
  lineageBusy.delete(key);lineageCache.set(key,result);return result;
 }
 function physicalDispatch(r,at){
  const v=r.values,t=event(v,'dispatched_at'),batch=t!==null&&baseBatch(v.batch_record_id,t),qty=positive(v.quantity),receipt=v.received_at===''?null:event(v,'received_at');
  if(t===null||!v.dispatch_id||!batch||!qty||v.unit!==batch.v.unit||!context('buyer',v.buyer_id,t)||!v.carrier_ref||!authority('warehouse',v.operator_id,batch.v.grower_id,t)||v.received_at!==''&&(receipt===null||receipt<t))return null;
  return out('harvest_dispatches',r,{batch_record_id:v.batch_record_id,buyer_id:v.buyer_id,quantity:qv(qty),unit:v.unit,dispatched_at:v.dispatched_at,received_at:v.received_at,physically_observed:true});
 }
 function disposition(r,at){
  const v=r.values,t=event(v,'event_at'),batch=t!==null&&baseBatch(v.batch_record_id,t),qty=positive(v.quantity);
  return t!==null&&v.disposition_id&&batch&&qty&&v.unit===batch.v.unit&&['waste','donation','sample','loss'].includes(v.event_type)&&authority('warehouse',v.actor_id,batch.v.grower_id,t)?out('harvest_dispositions',r,{batch_record_id:v.batch_record_id,quantity:qv(qty),unit:v.unit,event_at:v.event_at,event_type:v.event_type}):null;
 }
 function stock(id,at){
  const batch=baseBatch(id,at),l=batch&&lineage(id,at);if(!batch||!l)return null;
  const moves=current('harvest_transfers',at).filter(r=>sameLot(r.values.source_batch_record_id,id,at)&&time(r.values.transferred_at)<=at),ships=current('harvest_dispatches',at).filter(r=>sameLot(r.values.batch_record_id,id,at)&&time(r.values.dispatched_at)<=at),loss=current('harvest_dispositions',at).filter(r=>sameLot(r.values.batch_record_id,id,at)&&time(r.values.event_at)<=at);
  const valid=moves.every(r=>transfer(r,at))&&ships.every(r=>physicalDispatch(r,at))&&loss.every(r=>disposition(r,at));
  if(!valid)return {valid:false,batch_record_id:id,remaining:null,reason:'An actual stock movement is unresolved'};
  const used=sum([...moves,...ships,...loss].map(r=>positive(r.values.quantity))),remaining=R.sub(batch.qty,used);
  return {valid:remaining.n>=0n,batch_record_id:id,initial:qv(batch.qty),transferred:qv(sum(moves.map(r=>positive(r.values.quantity)))),dispatched:qv(sum(ships.map(r=>positive(r.values.quantity)))),disposed:qv(sum(loss.map(r=>positive(r.values.quantity)))),remaining:qv(remaining),unit:batch.v.unit,root_record_keys:l.roots};
 }
 function evaluate(f,id,at=cutoff){
  const key=f+':'+id+'@'+at;if(cache.has(key))return cache.get(key);if(busy.has(key))return null;const r=ref(f,id,at);if(!r)return null;const v=r.values;busy.add(key);
  const done=x=>{busy.delete(key);cache.set(key,x);return x;},bad=msg=>done(err(f,r,msg,at));let x;
  if(f==='harvest_batches'){
   const a=baseBatch(id,at),l=a&&lineage(id,at);if(!a||!l)return bad('Batch identity, original harvest, quantity/unit and complete acyclic source-lot lineage are required');
   x=out(f,r,{batch_id:v.batch_id,grower_id:v.grower_id,site_id:v.site_id,crop_id:v.crop_id,origin:v.origin,quantity:qv(a.qty),unit:v.unit,harvested_at:v.harvested_at,created_at:v.created_at,root_record_keys:l.roots,lineage_depth:l.depth});
  }else if(f==='harvest_transfers'){
   x=transfer(r,at);if(!x||!lineage(v.source_batch_record_id,at)||!lineage(v.target_batch_record_id,at))return bad('Exact compatible parent and derived lot, positive transferred quantity and warehouse authority are required');
  }else if(f==='harvest_dispositions'){x=disposition(r,at);if(!x)return bad('Warehouse disposition requires actual batch, quantity, unit, time and authority');
  }else if(f==='harvest_storage'){
   const a=baseBatch(v.batch_record_id,at),t=event(v,'entered_at'),end=v.left_at===''?null:event(v,'left_at'),loc=t!==null&&context('location',v.location_id,t);
   if(!v.storage_id||!a||!lineage(v.batch_record_id,at)||t===null||t<a.t||v.left_at!==''&&(end===null||end<=t)||loc?.site_id!==a.v.site_id||!exactQty(positive(v.quantity),a.qty)||v.unit!==a.v.unit)return bad('Storage must bind one complete batch, compatible location, exact quantity and ordered physical interval; split portions use derived lots');
   const peers=current(f,at).filter(z=>z.values.batch_record_id===v.batch_record_id&&z.values.record_key!==v.record_key),until=end??at;
   if(peers.some(z=>time(z.values.entered_at)!==null&&T.overlap(t,until,time(z.values.entered_at),z.values.left_at===''?at:time(z.values.left_at))))return bad('Overlapping full-batch storage positions are ambiguous');
   x=out(f,r,{batch_record_id:v.batch_record_id,location_id:v.location_id,entered_at:v.entered_at,left_at:v.left_at,quantity:qv(a.qty),unit:v.unit});
  }else if(f==='harvest_temperatures'){
   const t=event(v,'interval_end'),start=time(v.interval_start),storage=ref('harvest_storage',v.storage_record_id,at),sa=storage&&evaluate('harvest_storage',storage.values.id,at),logger=t!==null&&context('logger',v.logger_id,t),lo=decimal(v.minimum_c),hi=decimal(v.maximum_c),mean=decimal(v.mean_c);
   if(!v.temperature_id||t===null||start===null||start>=t||!sa||sa.batch_record_id!==v.batch_record_id||start<time(sa.entered_at)||sa.left_at!==''&&t>time(sa.left_at)||!logger||logger.location_id!==sa.location_id||!T.inside(logger.valid_from,logger.valid_to,start)||!T.inside(logger.valid_from,logger.valid_to,t-1)||!lo||!hi||!mean||R.cmp(lo,mean)>0n||R.cmp(mean,hi)>0n)return bad('Temperature interval must match the actual full-batch storage, logger scope and ordered recorded Celsius summary');
   const overlaps=current(f,at).filter(z=>z.values.id!==id&&z.values.storage_record_id===v.storage_record_id&&T.overlap(start,t,time(z.values.interval_start),time(z.values.interval_end)));
   if(overlaps.length)return bad('Overlapping logger summaries are retained as ambiguous rather than averaged twice');
   x=out(f,r,{batch_record_id:v.batch_record_id,storage_record_id:v.storage_record_id,interval_start:v.interval_start,interval_end:v.interval_end,minimum_c:qv(lo),maximum_c:qv(hi),mean_c:qv(mean),duration_hours:qv(R.R(BigInt(t-start),3600000n))});
  }else if(f==='harvest_models'){
   const released=event(v,'released_at'),trained=time(v.trained_through),protocol=released!==null&&context('protocol',v.protocol_id,released);let roots;try{roots=JSON.parse(v.training_root_record_keys_json);}catch{}
   if(!v.model_id||!v.model_version||released===null||trained===null||trained>released||!protocol||!Array.isArray(roots)||roots.some(k=>typeof k!=='string'||!k)||new Set(roots).size!==roots.length||!document(v.artifact_document_id,released)||!document(v.training_manifest_document_id,released))return bad('Model requires exact released artifact, training cutoff/manifest, root-family declarations and quality protocol');
   for(const key of roots){const internal=view.all.harvest_batches.filter(z=>z.values.record_key===key);if(internal.length){const known=current('harvest_batches',trained).filter(z=>z.values.record_key===key);if(known.length!==1||known[0].values.origin!=='harvested'||!baseBatch(known[0].values.id,trained))return bad('An internal training-family declaration must name a genuine root harvest available by the training cutoff');}}
   x=out(f,r,{model_id:v.model_id,model_version:v.model_version,released_at:v.released_at,trained_through:v.trained_through,protocol_id:v.protocol_id,protocol_crop_id:protocol.crop_id||'',protocol_basis:protocolBasis(protocol,released),training_root_record_keys:roots});
  }else if(f==='harvest_quality'){
   const t=event(v,'assessed_at'),batch=t!==null&&baseBatch(v.batch_record_id,t),protocol=t!==null&&context('protocol',v.protocol_id,t),qty=positive(v.portion_quantity);
   if(!v.quality_id||t===null||!batch||!lineage(v.batch_record_id,t)||!protocol||protocol.crop_id&&protocol.crop_id!==batch.v.crop_id||!qty||R.cmp(qty,batch.qty)>0n||v.unit!==batch.v.unit||!['usable','unusable','unobserved'].includes(v.condition)||!['true','false'].includes(v.representative_whole_batch)||v.representative_whole_batch==='true'&&!exactQty(qty,batch.qty)||!authority('quality-assessor',v.assessor_id,batch.v.grower_id,t))return bad('Actual quality assessment requires its protocol, portion, original batch and authorised assessor; whole-batch inference requires a full representative observation');
   x=out(f,r,{batch_record_id:v.batch_record_id,protocol_id:v.protocol_id,protocol_basis:protocolBasis(protocol,t),assessed_at:v.assessed_at,condition:v.condition,portion_quantity:qv(qty),unit:v.unit,representative_whole_batch:v.representative_whole_batch==='true'});
  }else if(f==='harvest_forecasts'){
   const origin=time(v.origin_time),generated=event(v,'generated_at'),batch=origin!==null&&ref('harvest_batches',v.batch_record_id,origin,true),ba=batch&&evaluate('harvest_batches',batch.values.id,origin),model=origin!==null&&ref('harvest_models',v.model_record_id,origin,true),ma=model&&evaluate('harvest_models',model.values.id,origin),pred=nonnegative(v.predicted_hours),lower=v.lower_hours===''?null:nonnegative(v.lower_hours),upper=v.upper_hours===''?null:nonnegative(v.upper_hours);
   if(!v.forecast_id||origin===null||generated===null||generated<origin||!ba||!ma||model.hash!==v.model_sha256||ma.protocol_id!==v.protocol_id||!sameProtocol(ma.protocol_basis,protocolBasis(context('protocol',v.protocol_id,origin),origin))||ma.protocol_crop_id&&ma.protocol_crop_id!==ba.crop_id||!pred||!['training','validation','test','operational'].includes(v.cohort)||(v.lower_hours===''?v.upper_hours!=='':!lower||!upper||R.cmp(lower,pred)>0n||R.cmp(pred,upper)>0n))return bad('Forecast requires exact batch/model known at origin, original generated output, compatible protocol and ordered prediction interval');
   const leaked=ba.root_record_keys.filter(k=>ma.training_root_record_keys.includes(k));if(['validation','test'].includes(v.cohort)&&leaked.length)return bad('Holdout prediction shares an original harvest root with model training');
   const inputs=current('harvest_forecast_inputs',generated).filter(z=>z.values.forecast_record_id===id),seen=new Set(),bindings=[];
   const allowed=['harvest_batches','harvest_transfers','harvest_storage','harvest_temperatures','harvest_quality'];
   for(const ir of inputs){const q=ir.values,source=allowed.includes(q.family)&&ref(q.family,q.record_id,origin,true),a=source&&evaluate(q.family,q.record_id,origin),identity=q.family+':'+q.record_id;let valid=!!(q.input_id&&source&&source.hash===q.row_sha256&&a&&!seen.has(identity));seen.add(identity);
    const sourceBatch=q.family==='harvest_batches'?source?.values.id:source?.values.batch_record_id||(q.family==='harvest_transfers'?source?.values.target_batch_record_id:null);if(sourceBatch!==v.batch_record_id)valid=false;
    bindings.push(out('harvest_forecast_inputs',ir,{valid,family_name:q.family,source_record_id:q.record_id,forecast_record_id:id}));
   }
   if(!inputs.length||manifestHash(inputs)!==v.input_manifest_sha256||!inputs.some(z=>z.values.family==='harvest_batches'&&z.values.record_id===v.batch_record_id)||bindings.some(z=>!z.valid))return bad('Forecast input manifest must bind unique exact feature sources available at original prediction time');
   x=out(f,r,{batch_record_id:v.batch_record_id,model_record_id:v.model_record_id,model_version:ma.model_version,origin_time:v.origin_time,generated_at:v.generated_at,predicted_hours:qv(pred),lower_hours:qv(lower),upper_hours:qv(upper),protocol_id:v.protocol_id,protocol_basis:ma.protocol_basis,cohort:v.cohort,root_record_keys:ba.root_record_keys,training_overlap_roots:leaked,input_bindings:bindings});
  }else if(f==='harvest_forecast_inputs'){
   const forecast=evaluate('harvest_forecasts',v.forecast_record_id,at),bound=forecast?.input_bindings.find(z=>z.record_id===id);if(!bound)return bad('Feature binding has no exact valid forecast');x=bound;
  }else if(f==='harvest_demands'){
   const t=event(v,'approved_at'),buyer=t!==null&&context('buyer',v.buyer_id,t),crop=t!==null&&context('crop',v.crop_id,t),qty=positive(v.required_quantity),hours=nonnegative(v.required_after_arrival_hours),start=time(v.delivery_start),end=time(v.delivery_end);
   if(!v.demand_id||t===null||!buyer||crop?.unit!==v.unit||!qty||!hours||start===null||end===null||start>=end||t>start||!authority('route-planner',v.approved_by,v.buyer_id,t))return bad('Demand requires actual buyer, crop/unit, positive quantity, delivery window, required hours and named approval');
   x=out(f,r,{buyer_id:v.buyer_id,crop_id:v.crop_id,quantity:qv(qty),unit:v.unit,delivery_start:v.delivery_start,delivery_end:v.delivery_end,required_after_arrival_hours:qv(hours)});
  }else if(f==='harvest_plans'){
   const t=event(v,'planned_at'),start=time(v.population_start),end=time(v.population_end),expected=/^(0|[1-9][0-9]*)$/.test(v.expected_batches)?Number(v.expected_batches):null;
   if(!v.plan_id||t===null||start===null||end===null||start>=end||end>t||expected===null||!Number.isSafeInteger(expected)||!['true','false'].includes(v.population_complete)||!v.purpose||!context('grower',v.grower_id,t)||!authority('route-planner',v.operator_id,v.grower_id,t))return bad('Plan needs a declared complete physical-batch period, explicit purpose, grower and authorised operator');
   const batches=current('harvest_batches',t).filter(z=>(!z.values.grower_id||z.values.grower_id===v.grower_id)&&(!v.site_id||!z.values.site_id||z.values.site_id===v.site_id)&&(time(z.values.created_at)===null||time(z.values.created_at)>=start&&time(z.values.created_at)<end)),complete=view.sourceValid()&&view.populationComplete()&&v.population_complete==='true'&&batches.length===expected&&batches.every(z=>evaluate('harvest_batches',z.values.id,t)&&stock(z.values.id,t)?.valid),lines=current('harvest_plan_lines',t).filter(z=>z.values.plan_record_id===id);
   x=out(f,r,{planned_at:v.planned_at,grower_id:v.grower_id,observed_batches:batches.length,expected_batches:expected,population_complete:complete,batch_record_ids:batches.map(z=>z.values.id),basis_sha256:planBasis(r,lines)});
  }else if(f==='harvest_plan_lines'){
   const plan=ref('harvest_plans',v.plan_record_id,at),pv=plan?.values,t=pv&&time(pv.planned_at),pa=plan&&evaluate('harvest_plans',pv.id,at),batch=t!==null&&t!==undefined&&ref('harvest_batches',v.batch_record_id,t,true),ba=batch&&evaluate('harvest_batches',batch.values.id,t),forecast=t!==null&&t!==undefined&&evaluate('harvest_forecasts',v.forecast_record_id,t),demand=t!==null&&t!==undefined&&evaluate('harvest_demands',v.demand_record_id,t),qty=positive(v.quantity),departure=time(v.departure_at),arrival=time(v.arrival_at),balance=batch&&stock(batch.values.id,t);
   if(!v.line_id||!pa||time(v.available_at)>t||!ba||!pa.batch_record_ids.includes(ba.record_id)||!forecast||forecast.batch_record_id!==ba.record_id||time(forecast.generated_at)>t||!demand||demand.crop_id!==ba.crop_id||!qty||v.unit!==ba.unit||v.unit!==demand.unit||departure===null||arrival===null||departure<t||arrival<departure||arrival<time(demand.delivery_start)||arrival>=time(demand.delivery_end)||!balance?.valid)return bad('Allocation requires exact plan-time batch/forecast/demand, compatible quantity/unit and feasible declared delivery window');
   const siblings=current(f,t).filter(z=>z.values.plan_record_id===pv.id),sameBatch=siblings.filter(z=>z.values.batch_record_id===v.batch_record_id),sameDemand=siblings.filter(z=>z.values.demand_record_id===v.demand_record_id);
   if([...sameBatch,...sameDemand].some(z=>!positive(z.values.quantity))||R.cmp(sum(sameBatch.map(z=>positive(z.values.quantity))),R.R(BigInt(balance.remaining.numerator),BigInt(balance.remaining.denominator)))>0n||R.cmp(sum(sameDemand.map(z=>positive(z.values.quantity))),R.R(BigInt(demand.quantity.numerator),BigInt(demand.quantity.denominator)))>0n)return bad('The complete plan overallocates physical batch stock or buyer demand');
   const required=R.add(R.R(BigInt(arrival-time(forecast.origin_time)),3600000n),R.R(BigInt(demand.required_after_arrival_hours.numerator),BigInt(demand.required_after_arrival_hours.denominator))),pred=R.R(BigInt(forecast.predicted_hours.numerator),BigInt(forecast.predicted_hours.denominator)),lower=forecast.lower_hours&&R.R(BigInt(forecast.lower_hours.numerator),BigInt(forecast.lower_hours.denominator));
   x=out(f,r,{plan_record_id:pv.id,batch_record_id:ba.record_id,forecast_record_id:forecast.record_id,demand_record_id:v.demand_record_id,buyer_id:demand.buyer_id,quantity:qv(qty),unit:v.unit,departure_at:v.departure_at,arrival_at:v.arrival_at,required_hours_from_forecast_origin:qv(required),estimated_fit:R.cmp(pred,required)>=0n,lower_estimate_fit:lower?R.cmp(lower,required)>=0n:null});
  }else if(f==='harvest_plan_reviews'){
   const t=event(v,'reviewed_at'),plan=t!==null&&ref('harvest_plans',v.plan_record_id,t,true),pa=plan&&evaluate('harvest_plans',plan.values.id,t),lines=plan&&current('harvest_plan_lines',time(plan.values.planned_at)).filter(z=>z.values.plan_record_id===plan.values.id);
   if(!v.review_id||t===null||!pa||t<time(pa.planned_at)||v.plan_basis_sha256!==pa.basis_sha256||!['accepted','revise'].includes(v.decision)||!authority('route-planner',v.reviewed_by,pa.grower_id,t)||!lines.length||lines.some(z=>!evaluate('harvest_plan_lines',z.values.id,t)))return bad('Operator review must bind the exact plan and full known allocation set with authority at review time');
   if(v.decision==='accepted'&&!pa.population_complete)return bad('Accepted plan requires its complete declared source population');
   x=out(f,r,{plan_record_id:v.plan_record_id,reviewed_at:v.reviewed_at,decision:v.decision,plan_basis_sha256:v.plan_basis_sha256});
  }else if(f==='harvest_dispatches'){
   x=physicalDispatch(r,at);if(!x)return bad('Actual dispatch requires its physical batch, quantity, buyer, carrier reference and authorised warehouse actor');
  }else if(f==='harvest_outcomes'){
   const t=event(v,'observed_at'),dispatch=t!==null&&ref('harvest_dispatches',v.dispatch_record_id,t,true),da=dispatch&&physicalDispatch(dispatch,t),qty=positive(v.quantity),sale=v.sale_value===''?null:nonnegative(v.sale_value);
   if(!v.outcome_id||t===null||!da||!da.received_at||t<time(da.received_at)||!qty||v.unit!==da.unit||!['sold','consumed','wasted','returned','rejected','donated'].includes(v.outcome)||!v.external_ref||v.outcome==='sold'&&(!sale||!/^[A-Z]{3}$/.test(v.currency))||v.outcome!=='sold'&&(v.sale_value!==''||v.currency!==''))return bad('Terminal outcome requires actual received dispatch, non-overlapping portion, time and original commercial disposition; only observed sold portions carry sale value');
   const portions=current(f,at).filter(z=>z.values.dispatch_record_id===v.dispatch_record_id);if(portions.some(z=>!positive(z.values.quantity))||R.cmp(sum(portions.map(z=>positive(z.values.quantity))),R.R(BigInt(da.quantity.numerator),BigInt(da.quantity.denominator)))>0n)return bad('Terminal disposition portions exceed the actual dispatched quantity');
   x=out(f,r,{dispatch_record_id:v.dispatch_record_id,batch_record_id:da.batch_record_id,buyer_id:da.buyer_id,outcome:v.outcome,observed_at:v.observed_at,quantity:qv(qty),unit:v.unit,sale_value:qv(sale),currency:v.currency});
  }else if(f==='harvest_credits'){
   const t=event(v,'posted_at'),outcome=t!==null&&evaluate('harvest_outcomes',v.outcome_record_id,t),invoice=t!==null&&context('invoice_line',v.invoice_line_id,t),amount=positive(v.amount),gross=invoice&&nonnegative(invoice.gross_amount);
   if(!v.credit_id||t===null||!outcome||!invoice||!amount||!gross||invoice.buyer_id!==outcome.buyer_id||invoice.currency!==v.currency||!invoice.dispatch_record_id||!document(invoice.source_document_id,t)||!ref('harvest_dispatches',invoice.dispatch_record_id,t)||ref('harvest_dispatches',invoice.dispatch_record_id,t).values.record_key!==ref('harvest_dispatches',outcome.dispatch_record_id,t)?.values.record_key||!authority('finance',v.posted_by,outcome.buyer_id,t))return bad('Posted credit needs exact outcome, original invoice line bound to the same physical dispatch, matching buyer/currency and financial authority');
   const same=current(f,at).filter(z=>z.values.invoice_line_id===v.invoice_line_id);if(same.some(z=>!positive(z.values.amount))||R.cmp(sum(same.map(z=>positive(z.values.amount))),gross)>0n)return bad('Aggregate posted credits exceed the original invoice line');
   x=out(f,r,{outcome_record_id:v.outcome_record_id,invoice_line_id:v.invoice_line_id,posted_at:v.posted_at,amount:qv(amount),currency:v.currency,buyer_id:outcome.buyer_id});
  }
  return done(x||null);
 }

 function exposure(batchId,knownAt){
  const legs=[],seen=new Set();
  function walk(id,end){
   const key=id+'@'+end;if(seen.has(key))return;seen.add(key);const batch=baseBatch(id,knownAt);if(!batch)return;
   if(batch.v.origin==='derived')for(const tr of current('harvest_transfers',knownAt).filter(r=>r.values.target_batch_record_id===id))walk(tr.values.source_batch_record_id,batch.t);
   if(end<=batch.t)return;
   const rows=current('harvest_temperatures',knownAt).filter(r=>r.values.batch_record_id===id),valid=rows.map(r=>evaluate('harvest_temperatures',r.values.id,knownAt)).filter(Boolean),ranges=valid.map(x=>[Math.max(batch.t,time(x.interval_start)),Math.min(end,time(x.interval_end))]).filter(([a,z])=>a<z),covered=T.duration(ranges),expected=R.R(BigInt(end-batch.t),60000n);
   let weighted=zero(),duration=zero();for(const r of valid){const start=Math.max(batch.t,time(r.interval_start)),finish=Math.min(end,time(r.interval_end));if(finish<=start)continue;const ms=R.R(BigInt(finish-start)),mean=R.R(BigInt(r.mean_c.numerator),BigInt(r.mean_c.denominator));weighted=R.add(weighted,R.mul(mean,ms));duration=R.add(duration,ms);}
   legs.push({batch_record_id:id,start:instant(batch.t),end:instant(end),recorded_intervals:rows.length,valid_intervals:valid.length,covered_minutes:qv(covered),expected_minutes:qv(expected),complete:rows.length===valid.length&&R.cmp(covered,expected)===0n,observed_time_weighted_mean_c:duration.n>0n?qv(R.div(weighted,duration)):null,original_intervals:valid.map(x=>x.record_id)});
  }
  walk(batchId,knownAt);return{batch_record_id:batchId,as_of:instant(knownAt),complete:legs.length>0&&legs.every(x=>x.complete),meaning:'Known recorded temperature history across the complete lot ancestry; actual model-bound feature rows are separately listed in the forecast input bindings',legs};
 }
 function qualityEndpoint(forecast){
  const origin=time(forecast.origin_time),all=current('harvest_quality',cutoff).filter(r=>r.values.batch_record_id===forecast.batch_record_id&&r.values.protocol_id===forecast.protocol_id),observations=all.map(r=>evaluate('harvest_quality',r.values.id,cutoff)),whole=observations.filter(x=>x?.representative_whole_batch&&x.condition!=='unobserved'),qs=whole.filter(x=>sameProtocol(x.protocol_basis,forecast.protocol_basis)),incompatible=whole.filter(x=>!sameProtocol(x.protocol_basis,forecast.protocol_basis)),good=qs.filter(x=>x.condition==='usable').sort((a,z)=>time(a.assessed_at)-time(z.assessed_at)),bad=qs.filter(x=>x.condition==='unusable').sort((a,z)=>time(a.assessed_at)-time(z.assessed_at)),lastGood=good.at(-1),firstBad=bad[0],conflict=lastGood&&firstBad&&time(lastGood.assessed_at)>=time(firstBad.assessed_at);
  if(incompatible.length)issue('QUALITY_PROTOCOL_VERSION_MISMATCH','harvest_forecasts',forecast.record_id,'Observed quality assessments use a different historical protocol version from the released model and original forecast; retain the observations and compare only an exact matching protocol basis');
  const hours=t=>R.R(BigInt(Math.max(0,t-origin)),3600000n),pred=R.R(BigInt(forecast.predicted_hours.numerator),BigInt(forecast.predicted_hours.denominator));let lower=null,upper=null,state=incompatible.length?'protocol_version_mismatch':'unobserved';
  if(conflict)state='conflicting';else if(firstBad){upper=hours(time(firstBad.assessed_at));if(lastGood){lower=hours(time(lastGood.assessed_at));state='interval_censored';}else{lower=zero();state='left_censored';}}else if(lastGood&&time(lastGood.assessed_at)>=origin){lower=hours(time(lastGood.assessed_at));state='right_censored';}
  let error=null;if(lower&&R.cmp(pred,lower)<0n)error=R.sub(lower,pred);else if(upper&&R.cmp(pred,upper)>0n)error=R.sub(pred,upper);else if(lower||upper)error=zero();
  return{forecast_record_id:forecast.record_id,batch_record_id:forecast.batch_record_id,protocol_id:forecast.protocol_id,protocol_basis:forecast.protocol_basis,state,lower_hours:qv(lower),upper_hours:qv(upper),absolute_error_lower_bound_hours:qv(error),whole_observation_ids:qs.map(x=>x.record_id),incompatible_protocol_observation_ids:incompatible.map(x=>x.record_id),all_observation_count:all.length,partial_or_unobserved_count:all.length-whole.length,observations:all.map((r,i)=>({record_id:r.values.id,valid:!!observations[i],condition:r.values.condition,assessed_at:r.values.assessed_at,protocol_basis:observations[i]?.protocol_basis||null,protocol_matches:!!observations[i]&&sameProtocol(observations[i].protocol_basis,forecast.protocol_basis)}))};
 }
 function latestPlanReview(id,at){
  const xs=current('harvest_plan_reviews',at).filter(r=>r.values.plan_record_id===id).map(r=>evaluate('harvest_plan_reviews',r.values.id,at)).filter(Boolean).sort((a,z)=>time(z.reviewed_at)-time(a.reviewed_at));
  return xs.length&&(!xs[1]||time(xs[0].reviewed_at)!==time(xs[1].reviewed_at))?xs[0]:null;
 }
 const output={};for(const f of KINDS)output[f]=root.current[f].map(r=>evaluate(f,r.values.id,cutoff)||{...out(f,r),valid:false});
 const balances=root.current.harvest_batches.map(r=>stock(r.values.id,cutoff)||{batch_record_id:r.values.id,valid:false,remaining:null,reason:'Original batch or lineage unresolved'});
 for(const [family,key]of[['harvest_transfers','source_batch_record_id'],['harvest_transfers','target_batch_record_id'],['harvest_dispatches','batch_record_id'],['harvest_dispositions','batch_record_id']])for(const r of root.current[family]){const k=lotKey(r.values[key],cutoff);if(k&&!balances.some(x=>lotKey(x.batch_record_id,cutoff)===k))balances.push({batch_record_id:r.values[key],record_key:k,valid:false,remaining:null,reason:'Retained physical movement has no current active batch source'});}
 for(const q of balances)if(!q.valid)issue('PHYSICAL_STOCK_UNRESOLVED','harvest_batches',q.batch_record_id,'Actual transfers, dispatches and dispositions require one nonnegative physical stock balance');
 for(const d of output.harvest_dispatches)if(d.valid){
  const original=ref('harvest_dispatches',d.record_id,cutoff).values,t=time(d.dispatched_at),line=evaluate('harvest_plan_lines',original.line_record_id,t),review=latestPlanReview(original.plan_record_id,t),qty=R.R(BigInt(d.quantity.numerator),BigInt(d.quantity.denominator)),ships=current('harvest_dispatches',cutoff).filter(r=>r.values.line_record_id===original.line_record_id),allocated=line&&R.R(BigInt(line.quantity.numerator),BigInt(line.quantity.denominator));
  const groupsValid=ships.every(r=>positive(r.values.quantity));
  d.plan_binding_valid=!!(line&&line.plan_record_id===original.plan_record_id&&line.batch_record_id===d.batch_record_id&&line.buyer_id===d.buyer_id&&review?.decision==='accepted'&&t>=time(line.departure_at)&&groupsValid&&R.cmp(sum(ships.map(r=>positive(r.values.quantity))),allocated)<=0n&&R.cmp(qty,allocated)<=0n);
  d.plan_review_record_id=review?.record_id||'';d.estimated_plan_fit=line?.estimated_fit??null;
  if(!d.plan_binding_valid)issue('DISPATCH_PLAN_DEVIATION','harvest_dispatches',d.record_id,'The actual physical movement is retained; its exact planned allocation, quantity, destination or operator review does not match');
 }
 const plans=output.harvest_plans.map(p=>{if(!p.valid)return p;const lines=output.harvest_plan_lines.filter(l=>ref('harvest_plan_lines',l.record_id,cutoff).values.plan_record_id===p.record_id),review=latestPlanReview(p.record_id,cutoff);return{...p,lines,latest_review:review,review_complete:review?.decision==='accepted',allocation_complete:lines.length>0&&lines.every(l=>l.valid),estimated_fitting_lines:lines.filter(l=>l.valid&&l.estimated_fit).length};});
 const physicalOutcomes=output.harvest_dispatches.filter(d=>d.valid).map(d=>{const portions=output.harvest_outcomes.filter(o=>ref('harvest_outcomes',o.record_id,cutoff).values.dispatch_record_id===d.record_id),valid=portions.every(o=>o.valid),done=sum(portions.filter(o=>o.valid).map(o=>R.R(BigInt(o.quantity.numerator),BigInt(o.quantity.denominator)))),total=R.R(BigInt(d.quantity.numerator),BigInt(d.quantity.denominator)),remaining=R.sub(total,done);return{dispatch_record_id:d.record_id,batch_record_id:d.batch_record_id,unit:d.unit,quantity:d.quantity,observed_disposition_quantity:qv(done),unobserved_quantity:valid?qv(remaining):null,complete:valid&&remaining.n===0n,portions};});
 const forecasts=output.harvest_forecasts.filter(x=>x.valid),evaluations=forecasts.map(f=>({...qualityEndpoint(f),cohort:f.cohort,exposure:exposure(f.batch_record_id,time(f.origin_time)),current_batch_version_matches:snapshot(cutoff).selected.has('harvest_batches:'+f.batch_record_id)}));
 const declared=root.current.harvest_forecasts.filter(x=>['test','validation'].includes(x.values.cohort)),eligible=evaluations.filter(x=>['test','validation'].includes(x.cohort)),scorable=eligible.filter(x=>x.absolute_error_lower_bound_hours!==null),totalError=sum(scorable.map(x=>R.R(BigInt(x.absolute_error_lower_bound_hours.numerator),BigInt(x.absolute_error_lower_bound_hours.denominator))));
 const aggregate=(rows,field)=>{const result={};for(const row of rows)if(row.valid&&row[field]){const q=row[field],amount=R.R(BigInt(q.numerator),BigInt(q.denominator)),cur=row.currency;if(!result[cur])result[cur]=zero();result[cur]=R.add(result[cur],amount);}return Object.fromEntries(Object.entries(result).map(([k,v])=>[k,qv(v)]));};
 return{schema:'harvest.outcome-analysis.v1',as_of:options.as_of,input_valid:view.sourceValid(),population_complete:view.populationComplete(),source_metadata:view.metadata(),records:output,inventory:balances,plans,dispatch_outcomes:physicalOutcomes,forecast_evaluations:evaluations,metrics:{declared_holdout_forecasts:declared.length,valid_holdout_forecasts:eligible.length,unresolved_holdout_forecasts:declared.length-eligible.length,distinct_valid_holdout_root_families:new Set(forecasts.filter(f=>['test','validation'].includes(f.cohort)).flatMap(f=>f.root_record_keys)).size,observed_holdout_endpoints:scorable.length,unobserved_or_conflicting_valid_holdout_endpoints:eligible.length-scorable.length,mean_absolute_error_lower_bound_hours:scorable.length?qv(R.div(totalError,R.R(BigInt(scorable.length)))):null,meaning:'Average distance from the prediction to the observed censoring interval; a lower bound on absolute error, not a measured exact-endpoint MAE',whole_holdout_observed:view.sourceValid()&&view.populationComplete()&&declared.length>0&&scorable.length===declared.length},money:{observed_sold_value:aggregate(output.harvest_outcomes,'sale_value'),posted_credits:aggregate(output.harvest_credits,'amount')},summary:{valid_batches:output.harvest_batches.filter(x=>x.valid).length,root_harvests:output.harvest_batches.filter(x=>x.valid&&x.origin==='harvested').length,valid_forecasts:forecasts.length,valid_plans:plans.filter(x=>x.valid&&x.population_complete&&x.allocation_complete&&x.review_complete).length,actual_dispatches:output.harvest_dispatches.filter(x=>x.valid).length,dispatch_plan_deviations:output.harvest_dispatches.filter(x=>x.valid&&!x.plan_binding_valid).length,fully_dispositioned_dispatches:physicalOutcomes.filter(x=>x.complete).length,unresolved_inventory:balances.filter(x=>!x.valid).length},issues:view.issues};
}
module.exports={FIELDS,KINDS,IDS,hashRow,manifestHash,planBasis,analyze};
