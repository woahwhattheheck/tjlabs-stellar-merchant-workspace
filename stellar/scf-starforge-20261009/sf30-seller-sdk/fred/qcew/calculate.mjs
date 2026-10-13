// MIT. Source-bound county wages, regional weighting and explicit price conventions.
import { QCEW_REPORT, need, clone, canonical, periodKey, rowKey, rowState, rational, decimal, add, multiply, divide,
  quantity, restoreQuantity, compareQuantity } from './model.mjs';
import { validateQcewProfile, profilePeriods, qcewSourceComponents, definitionHash } from './profile.mjs';
import { inspectQcewCapture, qcewIndustryPeriodKey } from './source.mjs';
import { validateCapture } from '../source.mjs';
const ZERO=rational(0n), ONE=rational(1n);
const fields=['qtrly_estabs','month1_emplvl','month2_emplvl','month3_emplvl','total_qtrly_wages','avg_wkly_wage'];
function dateFor(year,month) { return year+'-'+String(month).padStart(2,'0')+'-01'; }
function failureStatus(statuses) {
  return ['missing_source','historical_unavailable','classification_unavailable','withheld','missing','missing_price','no_activity','zero_denominator']
    .find(status=>statuses.includes(status))??'missing';
}
function summarize(parts,key,coverage) {
  let total=ZERO,known=0;
  const unavailable=[];
  for(const part of parts) {
    const value=part.values[key];
    if(value===null) unavailable.push(part.status); else { total=add(total,value);known++; }
  }
  const details={coverage:{known,total:parts.length,complete:known===parts.length}};
  if(unavailable.length&&coverage==='complete') return quantity(null,failureStatus(unavailable),details);
  if(!known) return quantity(null,failureStatus(unavailable),details);
  return quantity(total,unavailable.length?'disclosed_components':'available',details);
}
function withCommonStatus(value,...inputs) {
  return quantity(value,inputs.some(item=>item.status==='disclosed_components')?'disclosed_components':'available');
}
function ratio(after,before) {
  const a=restoreQuantity(after),b=restoreQuantity(before);
  if(!a||!b) return quantity(null,failureStatus([after?.status,before?.status]));
  if(b.n===0n) return quantity(null,'zero_denominator');
  return withCommonStatus(divide(a,b),after,before);
}
function arithmeticAverage(items) {
  const values=items.map(restoreQuantity);
  if(values.some(value=>value===null)) return quantity(null,failureStatus(items.map(item=>item.status)));
  return withCommonStatus(divide(values.reduce(add,ZERO),rational(BigInt(values.length))),...items);
}
function sourceComponent(model,area,industry,component,when,trace) {
  const {ownership,aggregation,availableFromYear}=component;
  const requested={area_fips:area,own_code:ownership,industry_code:industry.code,
    agglvl_code:aggregation,size_code:'0',year:String(when.year),qtr:String(when.quarter)};
  const key=rowKey(requested), original=model.rows.get(key), sourceFile=model.coverage.get(area+'|'+periodKey(when));
  let status,values;
  if(when.year<availableFromYear) {
    status='historical_unavailable';
    values=Object.fromEntries(fields.map(field=>[field,null]));
  } else if(original) {
    status=rowState(original.row);
    values=Object.fromEntries(fields.map(field=>{
      const raw=original.row[field];
      const available=status==='available'||field==='qtrly_estabs'&&status==='withheld'&&when.year>=2004&&/^[0-9]+$/.test(raw);
      return [field,available?decimal(raw):status==='no_activity'?ZERO:null];
    }));
  } else {
    status=!sourceFile?'missing_source':when.year<=2000?'historical_unavailable':
      model.classifications.has(qcewIndustryPeriodKey(requested))?'no_activity':'classification_unavailable';
    values=Object.fromEntries(fields.map(field=>[field,status==='no_activity'?ZERO:null]));
  }
  if(!trace.has(key)) trace.set(key,{
    key,...requested,status,file:original?.file??sourceFile??null,originalRow:original?.row.originalRow??null,
    disclosureCode:original?.row.disclosure_code??null,
    originalValues:original?Object.fromEntries(fields.map(field=>[field,original.row[field]])):null
  });
  return {key,status,values};
}
function cpiModel(capture,id) {
  const model=validateCapture(capture),metadata=model.series.find(item=>item.id===id);
  need(metadata && ['Monthly','M'].includes(metadata.frequency),'The configured price index must be an original monthly FRED series.');
  const rows=new Map(model.rows.filter(row=>row.series===id).map(row=>[row.date,row]));
  need(rows.size>0,'The retained original price-index series is empty.');
  return {captureSha256:capture.captureSha256,metadata:clone(metadata),rows};
}
function priceQuarter(source,when,policy) {
  const months=policy==='quarter_end'?[when.quarter*3]:[when.quarter*3-2,when.quarter*3-1,when.quarter*3];
  const originals=months.map(month=>{
    const date=dateFor(when.year,month),row=source.rows.get(date);
    return {date,value:row?.value??null,missing:!row||row.missing===true||row.value==='.'};
  });
  if(originals.some(row=>row.missing)) return quantity(null,'missing_price',{period:periodKey(when),monthlyInputs:originals});
  const values=originals.map(row=>decimal(row.value));
  if(values.some(value=>value.n<=0n)) return quantity(null,'missing_price',{period:periodKey(when),monthlyInputs:originals});
  return quantity(divide(values.reduce(add,ZERO),rational(BigInt(values.length))),'available',{period:periodKey(when),monthlyInputs:originals});
}
function periodCell(model,region,industry,when,definition,cpi,baseCpi,trace) {
  const components=region.areas.flatMap(area=>qcewSourceComponents(area,industry).map(component=>sourceComponent(model,area,industry,component,when,trace)));
  const establishments=summarize(components,'qtrly_estabs',definition.coverage);
  const months=[1,2,3].map(month=>summarize(components,'month'+month+'_emplvl',definition.coverage));
  const quarterlyWages=summarize(components,'total_qtrly_wages',definition.coverage);
  const averageEmployment=arithmeticAverage(months), employment=definition.employment==='month3'?months[2]:averageEmployment;
  let weeklyWageNominal;
  if(definition.wageMethod==='from_totals') {
    const wages=restoreQuantity(quarterlyWages), employees=restoreQuantity(averageEmployment);
    weeklyWageNominal=!wages||!employees?quantity(null,failureStatus([quarterlyWages.status,averageEmployment.status])):
      employees.n===0n?quantity(null,'no_activity'):withCommonStatus(divide(wages,multiply(employees,rational(13n))),quarterlyWages,averageEmployment);
  } else {
    const weighted=components.map(component=>{
      const raw=component.values,available=raw.avg_wkly_wage!==null&&[raw.month1_emplvl,raw.month2_emplvl,raw.month3_emplvl].every(value=>value!==null);
      const count=available?divide(add(add(raw.month1_emplvl,raw.month2_emplvl),raw.month3_emplvl),rational(3n)):null;
      return {...component,values:{weight:count,total:count===null?null:multiply(count,raw.avg_wkly_wage)}};
    });
    const weights=summarize(weighted,'weight',definition.coverage), total=summarize(weighted,'total',definition.coverage);
    weeklyWageNominal=ratio(total,weights);
    if(restoreQuantity(weights)?.n===0n) weeklyWageNominal=quantity(null,'no_activity');
  }
  let weeklyWage=weeklyWageNominal,priceFactor=quantity(ONE);
  if(definition.price.dollars==='constant') {
    priceFactor=ratio(baseCpi,cpi);
    const amount=restoreQuantity(weeklyWageNominal),factor=restoreQuantity(priceFactor);
    weeklyWage=amount&&factor?withCommonStatus(multiply(amount,factor),weeklyWageNominal,priceFactor):
      quantity(null,failureStatus([weeklyWageNominal.status,priceFactor.status]));
  }
  return {period:periodKey(when),region:region.id,industry:industry.code,establishments,monthlyEmployment:months,
    averageEmployment,employment,quarterlyWages,weeklyWageNominal,weeklyWage,priceIndex:cpi,priceFactor,
    sourceKeys:components.map(item=>item.key),coverage:{components:components.length,
      observed:components.filter(item=>item.status==='available').length,
      structuralZero:components.filter(item=>item.status==='no_activity').length,
      unavailable:components.filter(item=>!['available','no_activity'].includes(item.status)).length}};
}
function change(before,after) {
  const value=compareQuantity(before,after,'percent');
  if(value.value!==null&&(before?.status==='disclosed_components'||after?.status==='disclosed_components')) value.status='disclosed_components';
  return value;
}
function topIndustries(definition,lookup,current) {
  if(Array.isArray(definition.history.chartIndustries)) return definition.history.chartIndustries;
  const rows=definition.industries.filter(item=>item.kind!=='total').map(item=>({code:item.code,value:restoreQuantity(lookup(current,definition.focus,item.code).weeklyWage)}));
  rows.sort((a,b)=>{
    if(a.value===null&&b.value===null) return a.code.localeCompare(b.code);
    if(a.value===null) return 1;if(b.value===null)return -1;
    const difference=a.value.n*b.value.d-b.value.n*a.value.d;
    return difference>0n?-1:difference<0n?1:a.code.localeCompare(b.code);
  });
  return rows.slice(0,5).map(item=>item.code);
}

export function qcewReportRowSelection(profile,reportPeriod) {
  profile=validateQcewProfile(profile);
  const periods=profilePeriods(profile,reportPeriod),keys=new Map();
  const areas=[...new Set(profile.definition.regions.flatMap(region=>region.areas))];
  for(const area of areas) for(const industry of profile.definition.industries)
    for(const component of qcewSourceComponents(area,industry)) {
      const item={area,industry:industry.code,ownership:component.ownership,aggregation:component.aggregation};
      keys.set([item.area,item.ownership,item.industry,item.aggregation].join('|'),item);
    }
  return {keys:[...keys.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,item])=>item),
    periods:[...new Set([...periods.history,periods.baseline,periods.current].map(periodKey))].sort(),sizeCode:'0'};
}

export function buildQcewReport({capture,cpiCapture,profile,period:reportPeriod,sourceContext=null,methodologyVersion=2}={}) {
  need([1,2].includes(methodologyVersion),'Use the retained report methodology version.');
  profile=validateQcewProfile(profile);
  const definition=profile.definition,periods=profilePeriods(profile,reportPeriod);
  const areas=new Set(definition.regions.flatMap(item=>item.areas));
  const selectedPeriods=new Map([...periods.history,periods.baseline,periods.current].map(item=>[periodKey(item),item]));
  const model=inspectQcewCapture(capture,{selection:qcewReportRowSelection(profile,reportPeriod),context:sourceContext});
  need([...areas].every(area=>model.coverage.has(area+'|'+periodKey(periods.current))),
    'Acquire the original report-period area members for every configured region before producing this edition.','QCEW_PERIOD_NOT_CAPTURED',409);
  const prices=cpiModel(cpiCapture,definition.price.seriesId), baseCpi=priceQuarter(prices,periods.priceBase,definition.price.quarterly);
  const matrix=[],byKey=new Map(),trace=new Map();
  for(const when of [...selectedPeriods.values()].sort((a,b)=>a.year*4+a.quarter-b.year*4-b.quarter)) {
    const cpi=priceQuarter(prices,when,definition.price.quarterly);
    for(const region of definition.regions) for(const industry of definition.industries) {
      const cell=periodCell(model,region,industry,when,definition,cpi,baseCpi,trace);
      matrix.push(cell);byKey.set(cell.period+'|'+region.id+'|'+industry.code,cell);
    }
  }
  const lookup=(when,region,industry)=>byKey.get(periodKey(when)+'|'+region+'|'+industry);
  const comparisons=definition.regions.filter(item=>item.id!==definition.focus);
  const overview=definition.industries.map(industry=>{
    const current=lookup(periods.current,definition.focus,industry.code),before=lookup(periods.baseline,definition.focus,industry.code);
    return {industry:industry.code,label:industry.label,employment:current.employment,weeklyWage:current.weeklyWage,
      employmentChange:change(before.employment,current.employment),wageChange:change(before.weeklyWage,current.weeklyWage),
      relativeWages:comparisons.map(region=>({region:region.id,ratio:ratio(current.weeklyWage,lookup(periods.current,region.id,industry.code).weeklyWage)}))};
  });
  const historical=comparisons.map(region=>({region:region.id,label:region.label,periods:periods.table.map(periodKey),
    rows:definition.industries.map(industry=>({industry:industry.code,label:industry.label,values:periods.table.map(when=>ratio(lookup(when,definition.focus,industry.code).weeklyWage,lookup(when,region.id,industry.code).weeklyWage))}))}));
  const total=definition.industries.find(item=>item.kind==='total').code;
  const points=(region,industry,metric)=>periods.history.map(when=>({period:periodKey(when),year:when.year,value:lookup(when,region,industry)[metric]}));
  const chartIndustries=topIndustries(definition,lookup,periods.current);
  const figures={
    overview:[
      {id:'employment',title:'Covered employment',unit:'jobs',series:[{id:definition.focus,label:definition.regions.find(item=>item.id===definition.focus).label,points:points(definition.focus,total,'employment')}]},
      {id:'weekly_wages',title:'Average weekly wages',unit:'dollars',series:definition.regions.map(region=>({id:region.id,label:region.label,points:points(region.id,total,'weeklyWage')}))}
    ],
    industries:chartIndustries.map(code=>({industry:code,label:definition.industries.find(item=>item.code===code).label,
      wages:{id:'wages-'+code,title:'Average weekly wages',unit:'dollars',series:definition.regions.map(region=>({id:region.id,label:region.label,points:points(region.id,code,'weeklyWage')}))},
      relative:{id:'relative-'+code,title:'Wages relative to comparator',unit:'ratio',series:comparisons.map(region=>({id:region.id,label:region.label,points:periods.history.map(when=>({period:periodKey(when),year:when.year,value:ratio(lookup(when,definition.focus,code).weeklyWage,lookup(when,region.id,code).weeklyWage)}))}))}
    }))
  };
  const currentCells=matrix.filter(item=>item.period===periodKey(periods.current)),statuses={};
  for(const cell of currentCells) statuses[cell.weeklyWage.status]=(statuses[cell.weeklyWage.status]??0)+1;
  const sourcesUsed=new Set([...trace.values()].map(item=>item.file).filter(Boolean));
  const result={
    schema:QCEW_REPORT,...(methodologyVersion===2?{methodologyVersion:2}:{}),profile:clone(profile),period:periods.current,periodLabel:periodKey(periods.current),
    baseline:periods.baseline,priceBase:periods.priceBase,
    source:{captureSha256:capture.captureSha256,...model.sourceSummary,files:model.sourceFiles.filter(item=>sourcesUsed.has(item.file))},
    cpi:{captureSha256:cpiCapture.captureSha256,series:prices.metadata,quarterly:definition.price.quarterly,base:baseCpi},
    tables:{overview,historical},figures,matrix,sourceRows:[...trace.values()].sort((a,b)=>a.key.localeCompare(b.key)),
    availability:{currentCells:currentCells.length,weeklyWageStatuses:statuses},
    methodology:{
      employment:definition.employment==='quarter_mean'?'Arithmetic mean of the three original monthly covered-employment counts.':'Original third-month covered-employment count.',
      wage:definition.wageMethod==='from_totals'?'Original quarterly wages divided by mean monthly employment and thirteen weeks. Regional numerators and employment denominators are summed before division.':'Original published average-weekly-wage values weighted by the mean of the three original monthly employment counts. Published rounding is retained.',
      coverage:definition.coverage==='complete'?'An aggregate is unavailable when any required component is withheld or unavailable. Original absent cells from 2001 onward are structural zeros only where the complete original area/period source exists and the same industry/aggregation/period classification is present in the retained original source catalogue.':'Only disclosed components are aggregated; every incomplete aggregate is labelled as disclosed components. It is not a full regional total.',
      history:'Each historical point uses the same quarter as this edition. The 1990–2000 NAICS archive is reconstructed from SIC; missing cells in those years cannot be treated as structural zeros. Expanded total/UI ownership groups before 1995 remain unavailable when the original international-government component cannot be recovered.',
      prices:definition.price.dollars==='nominal'?'Original nominal dollars.':'Constant dollars of '+periodKey(periods.priceBase)+', using '+definition.price.seriesId+' and '+(definition.price.quarterly==='quarter_end'?'the original quarter-end monthly observation.':'the mean of all three original monthly observations. Missing observations remain unavailable.'),
      sourceEdition:(model.intake.request?.sourceKind==='current_published_quarterly_api_slices'?'Current published original quarterly area CSV slices retained during ':'Current published original archive files retained during ')+model.sourceSummary.retrievedFrom+' through '+model.sourceSummary.retrievedThrough+'. Historical observations can reflect publisher revisions.',
      seasonality:'QCEW employment and wages are not seasonally adjusted. The selected CPI source is labelled '+prices.metadata.seasonalAdjustment+'.',
      ...(methodologyVersion===2?{comparisons:"Changes compare the retained unadjusted QCEW levels for the selected periods. They can reflect establishment reclassification, location or ownership updates and publisher revisions as well as economic changes. They are not the administratively adjusted over-the-year changes in the County Employment and Wages news release."}:{}),
      interpretation:'Average wages reflect the mix of jobs and paid compensation. Regional ratios compare the configured industries and ownerships; they do not measure a constant-worker wage or cost-of-living difference.',
      citations:[
        model.intake.request?.sourceKind==='current_published_quarterly_api_slices'
          ?{title:'QCEW original quarterly area CSV API',url:'https://www.bls.gov/cew/additional-resources/open-data/home.htm'}
          :{title:'QCEW original downloadable files',url:'https://www.bls.gov/cew/downloadable-data-files.htm'},
        {title:'QCEW original quarterly fields',url:'https://www.bls.gov/cew/about-data/downloadable-file-layouts/quarterly/naics-based-quarterly-layout.htm'},
        {title:'QCEW disclosure and historical availability',url:'https://www.bls.gov/cew/questions-and-answers.htm'},
        {title:'BLS average weekly wage calculation',url:'https://www.bls.gov/cew/publications/factsheets/fluctuations-in-average-weekly-wages.htm'},
        {title:prices.metadata.title,url:prices.metadata.sourceUrl??'https://fred.stlouisfed.org/series/'+encodeURIComponent(definition.price.seriesId)}
      ]
    }
  };
  result.id=definitionHash(result);
  return result;
}
export function validateQcewReport(report,{capture,cpiCapture,sourceContext=null}={}) {
  need(report?.schema===QCEW_REPORT&&typeof report.id==='string','Choose a complete saved county report.');
  const identity=clone(report);delete identity.id;
  need(definitionHash(identity)===report.id,'The saved county report changed.');
  validateQcewProfile(report.profile);
  const hasMethodologyVersion=Object.hasOwn(report,'methodologyVersion');
  need(!hasMethodologyVersion||report.methodologyVersion===2,'The saved report methodology version is unsupported.');
  const methodologyVersion=hasMethodologyVersion?2:1;
  if(methodologyVersion===2)need(report.methodology?.comparisons==="Changes compare the retained unadjusted QCEW levels for the selected periods. They can reflect establishment reclassification, location or ownership updates and publisher revisions as well as economic changes. They are not the administratively adjusted over-the-year changes in the County Employment and Wages news release.",'The current report must retain its complete comparison-method qualification.');
  if(capture||cpiCapture) {
    need(capture&&cpiCapture,'Validate both original QCEW and price-index sources together.');
    const rebuilt=buildQcewReport({capture,cpiCapture,profile:report.profile,period:report.period,sourceContext,methodologyVersion});
    need(canonical(rebuilt)===canonical(report),'The county report differs from its complete original sources and saved profile.');
  }
  return report;
}
export function compareQcewReports(previous,current) {
  validateQcewReport(previous);validateQcewReport(current);
  need(previous.profile.id===current.profile.id,'Use the same saved production profile for a repeat-edition comparison.');
  const before=new Map(previous.tables.overview.map(row=>[row.industry,row]));
  return {schema:'stellar-forge.qcew-report-changes.v1',previousReport:previous.id,currentReport:current.id,
    previousPeriod:previous.periodLabel,currentPeriod:current.periodLabel,
    priceBaseChanged:canonical(previous.priceBase)!==canonical(current.priceBase),
    convention:previous.period.quarter===current.period.quarter?'Same-quarter editions':'Different-quarter editions; QCEW is not seasonally adjusted.',
    rows:current.tables.overview.map(row=>({industry:row.industry,label:row.label,
      employmentBefore:before.get(row.industry)?.employment??null,employmentAfter:row.employment,
      weeklyWageBefore:before.get(row.industry)?.weeklyWage??null,weeklyWageAfter:row.weeklyWage,
      wagePriceBasisBefore:periodKey(previous.priceBase),wagePriceBasisAfter:periodKey(current.priceBase),
      relativeWagesBefore:before.get(row.industry)?.relativeWages??[],relativeWagesAfter:row.relativeWages}))};
}
