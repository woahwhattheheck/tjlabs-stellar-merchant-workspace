'use strict';
const Core=require('./core.cjs'),Course=require('./examples/build-course.cjs'),Session=require('./session.cjs'),Engine=require('./harvest-outcomes.cjs');
function run(study=require('./examples/complete.study.json')){
 const checks=[],check=(name,ok)=>{if(!ok)throw Error(name);checks.push({name,passed:true});},base=Core.analyze(study),h=base.harvest;
 check('Complete28-family source and returned histories match with all six physical-batch members',base.comparison_state==='selected_fields_match'&&h.population.complete&&h.population.observed===6&&h.issues.length===0);
 check('Full physical, quality and financial course preserves split lineage, missing outcomes and exact currencies',h.physical.summary.valid_plans===1&&h.physical.summary.actual_dispatches===3&&h.physical.inventory.reduce((n,x)=>n+Number(x.remaining.decimal),0)===103&&h.physical.metrics.declared_holdout_forecasts===4&&h.physical.metrics.observed_holdout_endpoints===3&&h.physical.money.observed_sold_value.USD.numerator==='320'&&h.physical.money.posted_credits.USD.numerator==='20');
 check('All six work members retain all eight phases including increased review',h.effort.complete&&h.effort.baseline.numerator==='288'&&h.effort.current.numerator==='210'&&h.effort.change.numerator==='-78');
 const malformed=Core.analyze(Course.mutate(study,'population_members',xs=>xs.push({...xs[0],id:'UNKNOWN-MEMBER',record_key:'UNKNOWN-MEMBER',member_id:'UNKNOWN-MEMBER',revision:'2',supersedes_id:'',grower_id:'',site_id:''}))).harvest;
 check('Malformed potentially in-scope member remains visible and prevents whole-work comparison',malformed.population.observed===7&&malformed.population.unresolved===1&&!malformed.population.complete&&!malformed.effort.complete);
 const scope=Core.analyze(Course.mutate(study,'authorities',xs=>{const r=xs.find(x=>x.permission==='route-planner'&&x.scope_id==='GROWER');r.scope_kind='buyer';r.scope_id='RETAIL';})).harvest;
 check('Buyer-only planning authority cannot approve a grower allocation',scope.physical.summary.valid_plans===0&&scope.physical.summary.actual_dispatches===3);
 const extra=Core.analyze(Course.mutate(study,'effort',xs=>xs.push({...xs[0],id:'UNPAIRED-WORK',record_key:'UNPAIRED-WORK',effort_id:'UNPAIRED-WORK',member_id:'OUTSIDE',work_key:'UNPAIRED-WORK'}))).harvest;
 check('Observed work outside the declared member population cannot be hidden inside a complete saving',!extra.effort.complete&&extra.effort.records.some(x=>x.member_id==='OUTSIDE'&&!x.valid));
 const changed=Core.clone(study);changed.config.harvest.expected_counts.harvest_batches++;const source=Core.analyze(changed).harvest;
 check('Exact source population mismatch prevents both whole work and complete allocation acceptance',!source.population.complete&&!source.effort.complete&&source.physical.summary.valid_plans===0);
 const wrongCrop=Core.analyze(Course.mutate(study,'protocols',xs=>xs[0].crop_id='MICROGREENS')).harvest;
 check('A supplied crop-specific protocol cannot validate another crop forecast or quality endpoint',wrongCrop.physical.summary.valid_forecasts===0&&wrongCrop.physical.records.harvest_quality.every(x=>!x.valid));
 const session=Session.create(study),opened=Session.normalize(JSON.parse(JSON.stringify(session)));
 check('Complete source originals and all selected contexts reopen without a source change',Core.digest(opened.study)===Core.digest(study)&&opened.study.documents.length===study.documents.length);
 return{execution:'Actual whole28-family JavaScript application with original retained authored source; browser and OS receiving are recorded separately',checks};
}
module.exports={run};
