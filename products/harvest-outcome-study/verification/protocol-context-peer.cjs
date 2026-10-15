'use strict';
const Core=require('../core.cjs'),Course=require('../examples/build-course.cjs');
function run(){const study=require('../examples/complete.study.json'),baseline=Core.analyze(study).harvest;
const changed=Course.mutate(study,'protocols',xs=>{const a=xs[0];xs.push({...a,id:'PROTOCOL-REVISED',revision:'2',supersedes_id:a.id,name:'Changed quality criterion',meaning:'Different endpoint: package appearance only instead of original whole-lot usability',valid_from:'2026-10-01T18:00:00.000Z',recorded_at:'2026-10-01T18:00:00.000Z',available_at:'2026-10-01T18:00:00.000Z'});});changed.config.harvest.expected_counts.protocols=2;
const revised=Core.analyze(changed).harvest;
if(baseline.issues.length||baseline.physical.metrics.observed_holdout_endpoints!==3||revised.physical.metrics.declared_holdout_forecasts!==4||revised.physical.metrics.valid_holdout_forecasts!==4||revised.physical.metrics.observed_holdout_endpoints!==0||revised.physical.metrics.mean_absolute_error_lower_bound_hours!==null||revised.physical.records.harvest_quality.length!==6||revised.physical.records.harvest_quality.some(x=>!x.valid)||revised.physical.forecast_evaluations.filter(x=>x.state==='protocol_version_mismatch').length!==3)throw Error('Historical protocol identity or retained observation/forecast population failed');
return {execution:'Actual complete source application in JavaScript',baseline_observed_endpoints:3,changed_protocol_observed_endpoints:0,retained_valid_forecasts:4,retained_actual_quality_observations:6,protocol_mismatch_forecasts:3};}
module.exports={run};
