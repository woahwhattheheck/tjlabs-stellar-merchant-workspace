'use strict';
const T=require('./study-time.cjs'),{R,time,nonnegative,uniq}=T;
function evaluate(v,cases,p,person,populationComplete,cut){
 const ids=new Set(cases.map(x=>x.case_id)),items=[],duplicates=new Map(),groups=[];
 for(const r of v.current.effort){const z=r.values,a=time(z.started_at),b=time(z.ended_at),n=nonnegative(z.person_minutes),e=[];
 if(!ids.has(z.case_id))e.push('EFFORT_CASE_OUTSIDE_POPULATION');
 if(a===null||b===null||a>b||b>cut||b>time(z.recorded_at)||!n||n&&R.cmp(n,R.R(BigInt(Math.max(0,(b??0)-(a??0))),60000n))>0n||!person(z.person_id,a))e.push('EFFORT_TIME_OR_PERSON');
 if(!p.required_effort_phases.includes(z.phase)||![p.baseline_method,p.current_method].includes(z.method)||!z.work_key||!z.matched_group_id||z.population_complete!=='true'||z.phase_complete!=='true')e.push('EFFORT_SCOPE_UNRESOLVED');
 const x={...z,minutes:n,start:a,end:b,valid:!e.length,issues:e},key=z.person_id+'\0'+z.work_key;if(!duplicates.has(key))duplicates.set(key,[]);duplicates.get(key).push(x);items.push(x);}
 for(const xs of duplicates.values())if(xs.length>1)for(const x of xs){x.valid=false;x.issues.push('EFFORT_WORK_DUPLICATE');}
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j];if(a.person_id===b.person_id&&a.method===b.method&&a.minutes?.n>0n&&b.minutes?.n>0n&&a.start<b.end&&b.start<a.end){a.valid=b.valid=false;a.issues.push('EFFORT_ACTIVE_OVERLAP');b.issues.push('EFFORT_ACTIVE_OVERLAP');}}
 for(const c of cases){const xs=items.filter(x=>x.case_id===c.case_id),es=[],totals={};for(const method of [p.baseline_method,p.current_method]){const ys=xs.filter(x=>x.method===method);for(const phase of p.required_effort_phases)if(!ys.some(x=>x.phase===phase&&x.valid))es.push('EFFORT_PHASE_UNOBSERVED');totals[method]=R.sum(ys.filter(x=>x.valid).map(x=>x.minutes));}if(xs.some(x=>!x.valid))es.push('EFFORT_ROWS_UNRESOLVED');if(new Set(xs.map(x=>x.matched_group_id)).size!==1)es.push('EFFORT_MATCH_UNRESOLVED');groups.push({case_id:c.case_id,complete:!es.length,issues:uniq(es),baseline:es.length?null:totals[p.baseline_method],current:es.length?null:totals[p.current_method],change:es.length?null:R.sub(totals[p.current_method],totals[p.baseline_method])});}
 const matched=groups.filter(x=>x.complete),complete=populationComplete&&cases.length>0&&matched.length===cases.length,b=R.sum(matched.map(x=>x.baseline)),c=R.sum(matched.map(x=>x.current)),valid=items.length>0&&items.every(x=>x.valid);
 return{complete,matched_cases:matched.length,eligible_cases:cases.length,baseline:complete?b:null,current:complete?c:null,change:complete?R.sub(c,b):null,matched_subset_baseline:b,matched_subset_current:c,matched_subset_change:R.sub(c,b),all_observed_current_person_minutes:valid?R.sum(items.filter(x=>x.method===p.current_method).map(x=>x.minutes)):null,issues:items.length?[]:['EFFORT_UNOBSERVED'],groups,records:items};
}
module.exports={evaluate};
