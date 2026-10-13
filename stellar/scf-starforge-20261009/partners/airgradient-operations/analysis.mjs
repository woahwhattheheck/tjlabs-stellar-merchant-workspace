// SPDX-License-Identifier: MIT
import {MEASURES,need,now,digest,envelope,verifyEnvelope,locationKey} from './contract.mjs';
import {normalizeCapture,reportingBins} from './source.mjs';

export function reviewReport({plan,project,connection,tasks,captures,baseline=null}){
 verifyEnvelope(plan,'plan');verifyEnvelope(project,'project-revision');
 const byTask=new Map(tasks.map(x=>[x.task_key,x])),source=[],metadata={},series=[],issues=[];
 for(const task of plan.tasks){
  const state=byTask.get(task.key);if(state?.status!=='COMPLETE'||!state.capture_id){issues.push({task:task.key,status:state?.status??'PENDING',code:state?.error??null});continue;}
  const capture=captures(state.capture_id);need(capture.metadata.status===200&&capture.metadata.planId===plan.id&&capture.metadata.taskKey===task.key&&capture.metadata.requestSha256===task.requestSha256&&capture.metadata.connectionSha256===connection.sha256,'CAPTURE_PLAN_CHANGED');
  const normalized=normalizeCapture(capture.raw,task,connection,plan.period);source.push(capture.metadata);
  if(normalized.metadata)metadata[task.locationKey]=normalized.metadata;
  series.push(...normalized.series.filter(row=>project.value.measures.includes(row.measure)).map(row=>({...row,captureId:capture.metadata.id})));
 }
 const rows=[],study=project.value,expected=plan.period.expectedBuckets;
 for(const location of study.locations)for(const measure of study.measures){
  const key=locationKey(location.sourceType,location.id),selected=series.filter(x=>x.locationKey===key&&x.measure===measure),bins=reportingBins(selected,plan.period),values=bins.filter(x=>x.value!==null).map(x=>x.value),available=values.length,coverage=available/expected;
  need(bins.length<=expected,'REPORT_BINS_OUTSIDE_PERIOD');
  const threshold=study.thresholds[measure]??null,exceeded=threshold?values.filter(x=>threshold.operator==='gte'?x>=threshold.value:x<=threshold.value).length:null;
  const base=baseline?.rows.find(x=>x.locationKey===key&&x.measure===measure)??null;
  const mean=available?values.reduce((a,b)=>a+b,0)/available:null;
  rows.push({locationId:location.id,sourceType:location.sourceType,locationKey:key,label:location.label,timezone:location.timezone,measure,measurementLabel:MEASURES[measure].label,unit:MEASURES[measure].unit,
   expectedBuckets:expected,returnedBuckets:bins.length,availableBuckets:available,missingBuckets:expected-available,coverage,returnedProviderRows:selected.length,availableProviderRows:selected.filter(x=>x.value!==null).length,
   minimumCoverage:study.minimumCoverage,status:available===0?'NO_VALUES':coverage<study.minimumCoverage?'INCOMPLETE':'READY',
   mean,minimum:available?Math.min(...values):null,maximum:available?Math.max(...values):null,
   threshold,thresholdBuckets:exceeded,thresholdFraction:threshold&&available?exceeded/available:null,
   sourceMeaning:connection.kind==='map-public'&&location.sourceType==='outdoor'&&measure==='pm25'?'Provider-returned outdoor PM2.5 bucket means; the original values and provider source are retained.':connection.kind==='dashboard'?connection.binding.measures[measure].meaning:'Provider-returned bucket means.',
   comparison:base?{baselineReportId:baseline.id,baselinePeriod:baseline.period,baselineMean:base.mean,baselineCoverage:base.coverage,
    meanChange:mean!==null&&base.mean!==null?mean-base.mean:null,samePeriod:baseline.period.start===plan.period.start&&baseline.period.end===plan.period.end&&baseline.period.bucket===plan.period.bucket,
    sameThreshold:digest(base.threshold)===digest(threshold),sameConnection:baseline.connectionSha256===connection.sha256}:null});
 }
 series.sort((a,b)=>a.locationKey.localeCompare(b.locationKey)||a.measure.localeCompare(b.measure)||a.utc.localeCompare(b.utc));
 const body={schema:'stellar-forge.airgradient-report-review.v1',planId:plan.id,planSha256:plan.sha256,projectId:project.id,projectSha256:project.sha256,connectionId:connection.id,connectionSha256:connection.sha256,
  title:plan.title,organisation:study.organisation,owner:study.owner,period:plan.period,notes:plan.notes,baselineReportId:baseline?.id??null,
  rows,issues,sources:source,locationMetadata:metadata,seriesSha256:digest(series),seriesRows:series.length,
  interpretation:connection.kind==='map-public'?'Coverage counts returned non-null provider time buckets in the selected UTC period. Means are equally weighted means of returned bucket means. Operating thresholds are customer-supplied criteria.':'Coverage counts selected reporting bins containing a non-null provider value. Each bin is the equally weighted mean of returned provider aggregates whose timestamps fall in that bin; the report mean weights populated reporting bins equally. The API selects five- or sixty-minute aggregates. Original timestamps and returned datapoints are retained alongside every received value. Operating thresholds apply to these reporting-bin means.',
  provenance:{provider:connection.title,sourceUrl:connection.sourceUrl,aggregation:'Original provider-returned values retained.'},
  readiness:issues.length||rows.some(x=>x.status!=='READY')?'REVIEW_GAPS':'READY'};
 return {...body,reviewSha256:digest(body)};
}
export function freezeReport(review){
 const {reviewSha256,...body}=review;need(digest(body)===reviewSha256,'REVIEW_CHANGED');
 return envelope('report',{...body,schema:'stellar-forge.airgradient-report.v1',id:'report_'+reviewSha256,reviewSha256,createdAt:now()});
}
