// MIT. Finite planning limits over complete original native Forecast comparisons.
import {signature} from './forecast-workbook.mjs';
export const FINANCING_DECISION_SCHEMA='stellar-forge.forecast-financing-decision.v1';
const clone=v=>JSON.parse(JSON.stringify(v));
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const need=(v,m)=>{if(!v)throw Error(m);};
const keys=(v,list,m)=>need(obj(v)&&Object.keys(v).every(k=>list.includes(k)),m);
const same=(a,b)=>signature(a)===signature(b);
const id=/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const hash=/^[a-f0-9]{64}$/;
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const draftFields=['name','note','cashBasis','cashMeasure','cashLimit','weeklyLimit','overloadLimit'];
export function newFinancingDecision(){return {draft:{name:'Planning limits',note:'',cashBasis:'COMMERCIAL',cashMeasure:'STARTING',cashLimit:'',weeklyLimit:'',overloadLimit:''},assessments:[],selectedId:null,draftHistory:[]};}
function checkDraft(v){
  keys(v,draftFields,'Unexpected planning-limit fields.');
  for(const k of draftFields)need(typeof v[k]==='string'&&!v[k].includes('\0')&&v[k].length<=(k==='note'?12000:k==='name'?200:100),'Retain complete planning-limit text, including unfinished values.');
  need(['GRANT','COMMERCIAL','PROTECTED'].includes(v.cashBasis)&&['STARTING','EXTRA'].includes(v.cashMeasure),'Choose the original cash scenario and measure.');
  return clone(v);
}
function units(value,places){
  if(typeof value!=='string'||value.length>100||!/^\d+(?:\.\d+)?$/.test(value))return null;
  const [a,b='']=value.split('.');if(b.length>places)return null;
  return BigInt(a)*10n**BigInt(places)+BigInt((b+'0'.repeat(places)).slice(0,places)||'0');
}
function nativeUnits(value,places){return units(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?String(value):value,places);}
function criteria(v){
  const d=checkDraft(v);need(d.name.trim(),'Name these planning limits.');
  need(d.cashLimit!==''||d.weeklyLimit!==''||d.overloadLimit!=='','Enter at least one explicit limit. Blank means not selected; zero is an explicit limit.');
  for(const [key,p,label]of [['cashLimit',2,'Cash limit'],['weeklyLimit',8,'Weekly-equivalent hours limit'],['overloadLimit',0,'Overloaded-day limit']]){
    if(d[key]!=='')need(units(d[key],p)!==null,label+' must be a nonnegative plain decimal'+(p===0?' integer':', with at most '+p+' decimal places')+'. Complete the retained partial value before assessment.');
  }return d;
}
function cashFact(r,d){
  const protectedMode=d.cashBasis==='PROTECTED',scenario=d.cashBasis==='GRANT'?r.scenarios?.conditionalGrant:r.scenarios?.commercial,f=r.customerFunding;
  if(protectedMode&&!f?.enabled)return {value:null,reason:'Customer-fund protection is not enabled in this original option.'};
  const value=protectedMode?(d.cashMeasure==='STARTING'?f.summary?.maximumRequiredStartingCashUsd:f.summary?.extraFundingAfterOpeningUsd):
    (d.cashMeasure==='STARTING'?scenario?.additionalCashNeededUsd:scenario?.gapAfterOpeningCashUsd);
  if(r.currencyValuation?.datedCashComplete===false||protectedMode&&f.summary?.reservationAndDatedCashComplete===false)return {value:null,reason:'The original result retains unknown cash valuation or customer reservations.'};
  if(d.cashMeasure==='EXTRA'&&value===null)return {value:null,reason:'Extra funding after opening cash is unresolved in the original result; required starting cash is a different measure.'};
  const undated=r.eventTiming?.undatedDeliveryCostUsd;
  if(d.cashBasis!=='GRANT'&&(undated===null||(r.eventTiming?.unvaluedDeliveryProjectIds||[]).length>0))return {value:null,reason:'Selected undated delivery obligations have no complete USD valuation. Dated cash alone cannot establish the combined funding requirement.'};
  const undatedUnits=undated===undefined||undated===null?null:units(undated,2);
  const omittedCost=Array.isArray(r.events)&&r.events.some(e=>!e.date&&typeof e.amountUsd==='string'&&/^-/.test(e.amountUsd)&&e.amountUsd!=='-0.00'&&(d.cashBasis!=='GRANT'||!e.commercialId));
  if((d.cashBasis!=='GRANT'&&undatedUnits!==null&&undatedUnits>0n)||omittedCost)return {value:null,reason:'Undated delivery obligations remain in the original result. A dated cash limit cannot establish funding for those obligations.'};
  return {value:value??null,reason:value===null||value===undefined?'The selected original cash measure is unresolved.':''};
}
function population(r,inputs){
  if(!Array.isArray(r.packages)||!Array.isArray(r.commercial)||!Array.isArray(r.invoices)||typeof r.firstForecastDate!=='string'||typeof r.lastForecastDate!=='string')return null;
  const select=(rows,fields)=>rows.map(row=>Object.fromEntries(fields.map(k=>[k,row[k]??null]))).sort((a,b)=>String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0);
  return {asOfDate:inputs.asOfDate,firstForecastDate:r.firstForecastDate,lastForecastDate:r.lastForecastDate,
    packages:select(r.packages,['id','scope','plannedHours','remainingHours']),
    customers:select(r.commercial.filter(x=>x.selected),['id','scope','remainingHours','sourceIds']),
    invoices:select(r.invoices,['id','totalUsd','openUsd','included','commercialId'])};
}
export function evaluateFinancingDecision(comparison,value){
  const d=criteria(value);need(obj(comparison)&&id.test(comparison.id||'')&&hash.test(comparison.result?.sha256||'')&&Array.isArray(comparison.result.options)&&comparison.result.options.length>=1&&comparison.result.options.length<=24,'Select one complete original native comparison.');
  const rows=comparison.result.options.map(o=>{
    const r=o.preview.report,checks=[];
    const add=(key,label,actual,limit,p,reason='')=>{const n=nativeUnits(actual,p),cap=units(limit,p);checks.push({key,label,actual:actual??null,limit,status:n===null?'UNRESOLVED':n<=cap?'MEETS':'EXCEEDS',reason:n===null?(reason||'The original native value is missing or not an exact nonnegative measure.'):''});};
    if(d.cashLimit!==''){const c=cashFact(r,d);add('cash',(d.cashBasis==='GRANT'?'Conditional grant':d.cashBasis==='PROTECTED'?'Combined with customer funds protected':'Combined pooled')+(d.cashMeasure==='STARTING'?' required starting cash (USD)':' extra funding after opening cash (USD)'),c.value,d.cashLimit,2,c.reason);}
    if(d.weeklyLimit!=='')add('weekly','Peak seven-day-equivalent work hours',r.capacity?.peakWeeklyEquivalentHours,d.weeklyLimit,8);
    if(d.overloadLimit!=='')add('overload','Days above this option’s original native capacity',r.capacity?.overloadedDays,d.overloadLimit,0,r.capacity?.weeklyHours===null?'The original native capacity is unknown.':'');
    // An overload count without its original capacity has no usable meaning.
    const overload=checks.find(x=>x.key==='overload');if(overload&&nativeUnits(r.capacity?.weeklyHours,8)===null){overload.status='UNRESOLVED';overload.reason='The original weekly capacity is unknown; a displayed count does not establish capacity.';}
    const undatedHours=r.eventTiming?.undatedHours,undatedUnits=undatedHours===undefined?0n:nativeUnits(undatedHours,8);
    if(undatedUnits===null||undatedUnits>0n)for(const check of checks.filter(x=>['weekly','overload'].includes(x.key))){
      if(check.status!=='EXCEEDS')check.status='UNRESOLVED';
      check.reason='The displayed value covers dated work only; selected undated work remains '+(undatedHours??'unresolved')+' hours. Retain and schedule that work before treating the capacity limit as met.';
    }
    const status=checks.some(x=>x.status==='EXCEEDS')?'EXCEEDS':checks.some(x=>x.status==='UNRESOLVED')?'UNRESOLVED':'MEETS';
    const scope=population(r,o.preview.inputs);
    return {optionId:o.id,name:o.name,status,checks,scope,nativeWeeklyCapacity:r.capacity?.weeklyHours??null,issues:clone(r.issues||[]),
      conditional:true,dominatedBy:[],shortlist:false,scopeGroup:null};
  });
  const groups=[];
  for(const row of rows){if(!row.scope)continue;let group=groups.find(x=>same(x.scope,row.scope)&&x.nativeWeeklyCapacity===row.nativeWeeklyCapacity);if(!group){group={id:'scope-'+(groups.length+1),scope:clone(row.scope),nativeWeeklyCapacity:row.nativeWeeklyCapacity,optionIds:[]};groups.push(group);}group.optionIds.push(row.optionId);row.scopeGroup=group.id;}
  for(const row of rows){
    if(row.status!=='MEETS'||!row.scopeGroup)continue;
    const peers=rows.filter(x=>x!==row&&x.status==='MEETS'&&x.scopeGroup===row.scopeGroup);
    for(const peer of peers){
      const values=row.checks.map((c,i)=>{const p=c.key==='cash'?2:c.key==='weekly'?8:0;return [nativeUnits(peer.checks[i].actual,p),nativeUnits(c.actual,p)];});
      if(values.every(([a,b])=>a!==null&&b!==null&&a<=b)&&values.some(([a,b])=>a<b))row.dominatedBy.push(peer.optionId);
    }
    row.shortlist=row.dominatedBy.length===0;
  }
  return {schema:FINANCING_DECISION_SCHEMA,comparisonId:comparison.id,comparisonSha256:comparison.result.sha256,source:clone(comparison.result.source),criteria:d,rows,scopeGroups:groups,
    basis:'Finite original options only. Meets refers only to entered limits under conditional native assumptions, not financing approval, actual receipts, staffing commitments or accepted delivery. The shortlist excludes unknown results and compares only identical work scope, native capacity and date horizon. Lower is preferred only on the selected measures; ties remain.'};
}
export function validateFinancingDecision(value,comparisons){
  keys(value,['draft','assessments','selectedId','draftHistory'],'Unexpected retained planning-limit state.');const v=clone(value);checkDraft(v.draft);
  need(Array.isArray(v.assessments)&&v.assessments.length<=200&&Array.isArray(v.draftHistory)&&v.draftHistory.length<=200,'Export a complete study edition before adding more planning-limit history.');
  const ids=new Set();
  for(const a of v.assessments){keys(a,['id','createdAt','comparisonId','criteria','report'],'Unexpected assessment history.');need(id.test(a.id||'')&&!ids.has(a.id)&&date(a.createdAt),'Keep unique original assessment identities and dates.');ids.add(a.id);const c=comparisons.find(x=>x.id===a.comparisonId);need(c,'The original native comparison for this assessment is absent.');const expected=evaluateFinancingDecision(c,a.criteria);need(same(expected,a.report),'The retained assessment differs from its original criteria or complete native comparison.');}
  need(v.selectedId===null||ids.has(v.selectedId),'The selected planning-limit assessment is absent.');
  for(const h of v.draftHistory){keys(h,['at','draft'],'Unexpected retained criteria draft.');need(date(h.at),'Retain the original criteria recovery date.');checkDraft(h.draft);}
  return v;
}
export function retainFinancingDecision(value,comparisons,comparisonId){
  const v=validateFinancingDecision(value,comparisons),c=comparisons.find(x=>x.id===comparisonId);need(c,'Select a complete native comparison before assessing limits.');need(v.assessments.length<200,'Download the complete edition before adding another assessment.');
  const report=evaluateFinancingDecision(c,v.draft),a={id:'decision-'+crypto.randomUUID(),createdAt:new Date().toISOString(),comparisonId,criteria:clone(v.draft),report};
  v.assessments.push(a);v.selectedId=a.id;return validateFinancingDecision(v,comparisons);
}
export function restoreFinancingCriteria(value,comparisons){
  const v=validateFinancingDecision(value,comparisons),a=v.assessments.find(x=>x.id===v.selectedId);need(a,'Select the retained assessment to reuse.');need(v.draftHistory.length<200,'Download the complete study before retaining another criteria draft.');
  v.draftHistory.push({at:new Date().toISOString(),draft:clone(v.draft)});v.draft=clone(a.criteria);return v;
}
export function financingDecisionCsv(assessment){
  need(obj(assessment?.report)&&assessment.report.schema===FINANCING_DECISION_SCHEMA,'Select an original assessment.');
  const r=assessment.report,quote=v=>{let s=v===null||v===undefined?'':String(v);if(/^[ \t\r\n]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const rows=[['assessment_id','assessment_name','created_at','comparison_id','comparison_sha256','case_id','case_version','option_id','option','result','shortlist_within_scope','scope_group','measure','actual','limit','check_result','reason','dominated_by','native_weekly_capacity','original_issue_count','conditional_model','assessment_note','cash_scenario','cash_measure','as_of_date','first_forecast_date','last_forecast_date','interpretation']];
  for(const row of r.rows)for(const c of row.checks)rows.push([assessment.id,r.criteria.name,assessment.createdAt,r.comparisonId,r.comparisonSha256,r.source.programId,r.source.version,row.optionId,row.name,row.status,row.shortlist,row.scopeGroup,c.label,c.actual,c.limit,c.status,c.reason,row.dominatedBy.join(';'),row.nativeWeeklyCapacity,row.issues.length,true,r.criteria.note,r.criteria.cashBasis,r.criteria.cashMeasure,row.scope?.asOfDate,row.scope?.firstForecastDate,row.scope?.lastForecastDate,r.basis]);
  return '\uFEFF'+rows.map(x=>x.map(quote).join(',')).join('\r\n')+'\r\n';
}
