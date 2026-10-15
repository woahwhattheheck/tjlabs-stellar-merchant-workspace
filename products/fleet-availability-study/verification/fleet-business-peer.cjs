'use strict';
const Course=require('../fleet-course.cjs'),Fleet=require('../fleet.cjs');
function evaluate(fixture){
 const p={...Fleet.empty(),...fixture.plan,operator_id:'OP',depot_id:'DEPOT',source_population_complete:true,expected_counts:Object.fromEntries(Object.entries(fixture.records).map(([k,rs])=>[k,rs.length]))};
 return Fleet.analyze({config:{fleet:p},documents:fixture.documents},(w,k)=>fixture.records[k].map(values=>({values})),()=>({available_at:'2026-09-01T00:00:00Z'}));
}
function variants(){
 const description=Course.build(),first=description.records.faults.find(x=>x.id==='FAULT-V1');
 description.records.faults.push({...first,id:'FAULT-V1-CORRECTED',revision:'2',supersedes_id:first.id,description:'Corrected descriptive wording only; same physical fault and actual service restriction.',recorded_at:'2026-10-01T14:30:00Z',available_at:'2026-10-01T14:30:00Z'});
 const cost=Course.build(),original=cost.records.cost_entries[0];
 cost.records.cost_entries.push({...original,id:'DUPLICATE-SUPPLIER-INVOICE',record_key:'DUPLICATE-SUPPLIER-INVOICE',cost_id:'DUPLICATE-SUPPLIER-INVOICE',source_ref:original.source_ref+'/second-export'});
 const timing=Course.build();for(const x of timing.records.duty_events.filter(x=>x.assignment_record_id==='ASSIGN-V3')){const t=x.state==='departed'?'17:00':x.state==='completed'?'17:10':'17:15';x.event_at=x.recorded_at=x.available_at='2026-10-01T'+t+':00Z';}
 return{description,cost,timing};
}
function run(){
 const baseline=evaluate(Course.build()),f=variants(),description=evaluate(f.description),cost=evaluate(f.cost),timing=evaluate(f.timing);
 const d=description.availability.vehicles.find(x=>x.vehicle_id==='V1'),trip=timing.duties.find(x=>x.duty_record_id==='DUTY-MORNING');
 return{
  baseline:{population:baseline.population.complete,eligible_minutes:baseline.availability.eligible_vehicle_minutes,available_minutes:baseline.availability.available_vehicle_minutes,unavailable_minutes:baseline.availability.unavailable_vehicle_minutes,unknown_minutes:baseline.availability.unknown_vehicle_minutes,availability_fraction:baseline.availability.fraction,effort_baseline:baseline.effort.baseline,effort_current:baseline.effort.current,effort_change:baseline.effort.change,issues:baseline.issues},
  checks:[
   {name:'Later descriptive revision preserves actual earlier closed fault and completed duty',pass:d.available_minutes?.numerator==='465'&&description.operating.fault_metrics.completed_episodes===1&&description.duties.find(x=>x.duty_record_id==='DUTY-AFTER-REPAIR').fulfilment_complete===true,actual:{available_minutes:d.available_minutes,fault_metrics:description.operating.fault_metrics,duty:description.duties.find(x=>x.duty_record_id==='DUTY-AFTER-REPAIR'),current_release:description.operating.releases,issues:description.issues}},
   {name:'Same external invoice observation cannot double recorded money',pass:cost.money['invoice:GBP']===null||cost.money['invoice:GBP']?.numerator==='250',actual:{money:cost.money,issues:cost.issues}},
   {name:'Actual trip wholly outside the required duty window remains observed without fulfilling that window',pass:trip.observed_departures===1&&trip.fulfilment_complete===false,actual:{duty:trip,issues:timing.issues}}
  ]};
}
module.exports={evaluate,variants,run};
