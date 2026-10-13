// MIT. Complete source-linked receiving after every planned original FRED batch.
import { canonical,clone,need,plain,exactDifference } from '../model.mjs';
import { validateCapture } from '../source.mjs';
import { ddpDigest } from './files.mjs';
import { inspectFredDdpPackage } from './package.mjs';
import { inspectFredDdpCrosswalk } from './crosswalk.mjs';
import { validateFredDdpMigrationPlan } from './migration.mjs';
import { normalizeFredDdpPeriod,inferredFredDdpPeriodRule,fredDdpFrequencyKind,exactFredDdpScaledValue,fredDdpObservationMissing } from './periods.mjs';
const SCHEMA='stellar-forge.fred-ddp-receiving.v1';
const same=(a,b)=>canonical(a)===canonical(b);
export const FRED_DDP_RECEIVING_STATUSES=Object.freeze(['EQUAL','DIFFERENT','BOTH_MISSING','MISSING_CHANGED','SOURCE_ONLY','TARGET_ONLY','MEANING_REVIEW','EXCLUDED','UNMAPPED','AMBIGUOUS']);
const normalized=value=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
const sourceText=value=>value?.label||value?.code||null;
function describeMeaning(series,target,binding){
  const source={title:series.title,datasetId:series.datasetId,frequency:clone(series.frequency),unit:clone(series.unit),multiplier:clone(series.multiplier),
    currency:clone(series.currency),seasonalAdjustment:clone(series.seasonalAdjustment),annotations:clone(series.annotations),original:clone(series.original)};
  const issues=[],add=(field,before,after,message)=>issues.push({field,source:before??null,target:after??null,message});
  if(target){
    const sourceUnit=sourceText(series.unit),sourceMultiplier=series.multiplier?.code??null;
    if(binding.expectedFredUnits!==null){
      if(target.units!==binding.expectedFredUnits)add('units',binding.expectedFredUnits,target.units,'Returned FRED units differ from the reviewed expected units.');
    }else{
      if(!sourceUnit||normalized(sourceUnit)!==normalized(target.units))add('units',sourceUnit,target.units,'Review the original source units against the returned FRED units.');
      if(sourceMultiplier===null||exactFredDdpScaledValue(sourceMultiplier,'1')!=='1')
        add('unitMultiplier',sourceMultiplier,target.units,'Retain the original source scale and choose an explicit reviewed conversion if required.');
      const currency=sourceText(series.currency);
      if(currency&&!['na','n/a','not applicable','none'].includes(normalized(currency))&&
        !normalized(target.units).includes(normalized(currency)))add('currency',currency,target.units,'Review currency meaning as part of the selected common unit.');
    }
    const sourceFrequency=sourceText(series.frequency),sourceKind=fredDdpFrequencyKind(series.frequency?.label)||fredDdpFrequencyKind(series.frequency?.code);
    const targetKind=fredDdpFrequencyKind(target.frequency);
    if(binding.expectedFredFrequency!==null&&target.frequency!==binding.expectedFredFrequency)
      add('frequency',binding.expectedFredFrequency,target.frequency,'Returned FRED frequency differs from the reviewed expected frequency.');
    if(sourceKind&&targetKind&&sourceKind!==targetKind)add('frequency',sourceFrequency,target.frequency,'Original and target frequencies differ; this workflow does not resample observations.');
    else if(binding.expectedFredFrequency===null){
      if(!sourceKind||!targetKind)add('frequency',sourceFrequency,target.frequency,'Review the original frequency against the returned FRED frequency.');
      else if(['W','BW'].includes(sourceKind)&&normalized(sourceFrequency)!==normalized(target.frequency))
        add('frequencyConvention',sourceFrequency,target.frequency,'Review the original weekly ending convention.');
    }
    const expectedRule={M:'month',Q:'quarter',SA:'semiannual',A:'year'}[targetKind]||'exact';
    if(binding.periodRule!=='exact'&&binding.periodRule!==expectedRule)
      add('periodRule',binding.periodRule,target.frequency,'The reviewed calendar rule differs from the target observation frequency.');
    const seasonal=sourceText(series.seasonalAdjustment);
    const season=value=>{
      const s=normalized(value);
      return ['nsa','not seasonally adjusted','not seasonally-adjusted'].includes(s)?'nsa':
        ['sa','seasonally adjusted','seasonally-adjusted'].includes(s)?'sa':s;
    };
    if(binding.expectedFredSeasonalAdjustment!==null){
      if(target.seasonalAdjustment!==binding.expectedFredSeasonalAdjustment)
        add('seasonalAdjustment',binding.expectedFredSeasonalAdjustment,target.seasonalAdjustment,'Returned FRED seasonal adjustment differs from the reviewed expectation.');
    }else if(!seasonal||season(seasonal)!==season(target.seasonalAdjustment))
      add('seasonalAdjustment',seasonal,target.seasonalAdjustment,'Review the original and returned seasonal-adjustment meanings.');
  }
  return {seriesId:series.id,source,target:target?clone(target):null,binding:clone(binding),compatible:target!==null&&issues.length===0,issues};
}
function counts(){
  return Object.fromEntries(FRED_DDP_RECEIVING_STATUSES.map(status=>[status,0]));
}
export function buildFredDdpReceiving({packageCapture,crosswalk,plan,captures}){
  const source=inspectFredDdpPackage(packageCapture),mapping=inspectFredDdpCrosswalk(crosswalk);
  validateFredDdpMigrationPlan(plan,{packageCapture,crosswalk});need(plan.summary.ready,'Resolve the complete original package mapping and period selections before acquiring its target batches.');
  need(Array.isArray(captures)&&captures.length===plan.acquisitions.length,'Receive every planned original FRED batch.');
  const bySelection=new Map();
  for(const capture of captures){
    const model=validateCapture(capture);need(model.sourceMode==='API_VINTAGE','Receive the planned original FRED API as-of capture.');
    const key=canonical(model.selection);need(!bySelection.has(key),'A planned FRED selection was supplied more than once.');
    bySelection.set(key,{capture,model});
  }
  const identities=[],targets=new Map();
  for(const acquisition of plan.acquisitions){
    const entry=bySelection.get(canonical(acquisition.selection));need(entry,'A complete original FRED batch does not match the reviewed selection.');
    bySelection.delete(canonical(acquisition.selection));
    const {capture,model}=entry;
    identities.push({id:capture.captureSha256,captureSha256:capture.captureSha256,selection:clone(model.selection)});
    for(const series of model.series){
      need(!targets.has(series.id),'The whole package supplied the same FRED target twice.');
      targets.set(series.id,{metadata:series,rows:[],captureId:capture.captureSha256});
    }
    for(const row of model.rows)targets.get(row.series).rows.push({...clone(row),captureId:capture.captureSha256});
  }
  need(bySelection.size===0,'The receiving includes an unplanned FRED source selection.');
  const original=new Map(source.series.map(series=>[series.id,series])),meanings=[],rows=[],statusCounts=counts();
  const append=row=>{const value={index:rows.length,...row};rows.push(value);statusCounts[value.status]++;};
  for(const selected of plan.series){
    const series=original.get(selected.id),target=selected.fredSeriesId?targets.get(selected.fredSeriesId):null;
    need(series,'The plan refers to a missing original package series.');
    const meaning=describeMeaning(series,target?.metadata??null,selected.binding),sourceRows=selected.sourceIndices.map(index=>series.observations[index]);
    meanings.push(meaning);
    const identity={seriesId:series.id,release:series.release,boardSeriesId:series.boardSeriesId,fredSeriesId:selected.fredSeriesId};
    if(selected.mappingStatus!=='MAPPED'){
      for(const observation of sourceRows)append({...identity,period:observation.period,periodKey:normalizeFredDdpPeriod(observation.period,selected.binding.periodRule).key,
        status:selected.mappingStatus,source:clone(observation),target:null,rawDifference:null,difference:null});
      continue;
    }
    need(target,'A mapped target is missing from the complete original FRED batches.');
    const targetRule=inferredFredDdpPeriodRule({label:target.metadata.frequency});
    let targetRows=target.rows.map(row=>({...row,periodKey:normalizeFredDdpPeriod(row.date,targetRule).key}));
    if(plan.input.window.kind==='last')targetRows=targetRows.filter(row=>row.periodKey<=plan.input.asOf).slice(-plan.input.window.count);
    else{
      const start=plan.input.window.kind==='fixed'?plan.input.window.start:selected.window.start;
      const end=plan.input.window.kind==='fixed'?plan.input.window.end:selected.window.end;
      targetRows=targetRows.filter(row=>start!==null&&end!==null&&row.periodKey>=start&&row.periodKey<=end);
    }
    const sourceKeys=new Map(),targetKeys=new Map(),matched=new Set();
    for(const observation of sourceRows){
      const key=normalizeFredDdpPeriod(observation.period,selected.binding.periodRule).key;
      sourceKeys.set(key,(sourceKeys.get(key)||0)+1);
    }
    for(const row of targetRows){if(!targetKeys.has(row.periodKey))targetKeys.set(row.periodKey,[]);targetKeys.get(row.periodKey).push(row);}
    const duplicateSources=[...sourceKeys].filter(([,count])=>count>1),duplicateTargets=[...targetKeys].filter(([,values])=>values.length>1);
    if(duplicateSources.length||duplicateTargets.length){
      meaning.issues.push({field:'periodUniqueness',source:duplicateSources.length,target:duplicateTargets.length,
        message:'The selected calendar rule combines original observations; choose a rule that preserves each original period.'});
      meaning.compatible=false;
    }
    for(const observation of sourceRows){
      const periodKey=normalizeFredDdpPeriod(observation.period,selected.binding.periodRule).key,candidates=targetKeys.get(periodKey)||[];
      const ambiguous=(sourceKeys.get(periodKey)||0)>1||candidates.length>1;
      const after=!ambiguous&&candidates.length===1?candidates[0]:null;
      const beforeMissing=fredDdpObservationMissing(observation.value,observation.status);
      let status,rawDifference=null,difference=null;
      if(ambiguous)status='MEANING_REVIEW';
      else if(!after)status='SOURCE_ONLY';
      else{
        matched.add(after);
        const sourceValue=exactFredDdpScaledValue(observation.value,'1'),targetValue=exactFredDdpScaledValue(after.value,'1');
        if(!beforeMissing&&!after.missing&&sourceValue!==null&&targetValue!==null)rawDifference=exactDifference(sourceValue,targetValue);
        if(!meaning.compatible)status='MEANING_REVIEW';
        else if(beforeMissing&&after.missing)status='BOTH_MISSING';
        else if(beforeMissing!==after.missing)status='MISSING_CHANGED';
        else{
          const before=exactFredDdpScaledValue(observation.value,selected.binding.sourceScale),following=exactFredDdpScaledValue(after.value,selected.binding.targetScale);
          if(before===null||following===null)status='MISSING_CHANGED';
          else{difference=exactDifference(before,following);status=difference==='0'?'EQUAL':'DIFFERENT';}
        }
      }
      const retainedSource={...clone(observation),missing:beforeMissing};
      append({...identity,period:observation.period,periodKey,status,source:retainedSource,target:after?clone(after):null,rawDifference,difference});
    }
    for(const row of targetRows)if(!matched.has(row))append({...identity,period:row.date,periodKey:row.periodKey,status:'TARGET_ONLY',
      source:null,target:clone(row),rawDifference:null,difference:null});
  }
  const summary={rowCount:rows.length,seriesCount:plan.series.length,counts:statusCounts,
    meaningReviewSeriesCount:meanings.filter(item=>item.target&&!item.compatible).length,
    comparedCount:statusCounts.EQUAL+statusCounts.DIFFERENT+statusCounts.BOTH_MISSING+statusCounts.MISSING_CHANGED,
    differentCount:statusCounts.DIFFERENT,missingChangedCount:statusCounts.MISSING_CHANGED,sourceOnlyCount:statusCounts.SOURCE_ONLY,targetOnlyCount:statusCounts.TARGET_ONLY};
  const core={schema:SCHEMA,planId:plan.id,packageId:source.id,packageSha256:source.captureSha256,crosswalkId:mapping.id,crosswalkSha256:mapping.captureSha256,
    source:{sourceMode:'DDP_CURRENT_PUBLISHED',package:source.source,crosswalk:mapping.source,fredAsOf:plan.input.asOf,
      bookmark:plan.input.bookmark,note:plan.input.note},captures:identities,meanings,rows,summary};
  return {...core,id:'fred-ddp-receiving-'+ddpDigest(core)};
}
export function validateFredDdpReceiving(value,{packageCapture=null,crosswalk=null,plan=null,captures=null}={}){
  need(plain(value)&&value.schema===SCHEMA&&Array.isArray(value.rows)&&Array.isArray(value.meanings)&&Array.isArray(value.captures)&&plain(value.summary),'A complete immutable DDP receiving report is required.');
  const {id,...core}=value;need(id==='fred-ddp-receiving-'+ddpDigest(core),'The complete receiving report identity changed.');
  need(/^fred-ddp-migration-plan-[a-f0-9]{64}$/.test(value.planId)&&value.packageId==='fred-ddp-package-'+value.packageSha256&&value.crosswalkId==='fred-ddp-crosswalk-'+value.crosswalkSha256,
    'The receiving report lost its original plan or source identity.');
  const observed=counts(),meanings=new Set(value.meanings.map(item=>item.seriesId));
  need(meanings.size===value.meanings.length,'The original receiving meaning inventory repeats a source series.');
  for(const [index,row] of value.rows.entries()){
    need(plain(row)&&row.index===index&&meanings.has(row.seriesId)&&FRED_DDP_RECEIVING_STATUSES.includes(row.status),'Invalid complete original receiving row.');
    observed[row.status]++;
  }
  need(value.summary.rowCount===value.rows.length&&value.summary.seriesCount===value.meanings.length&&same(observed,value.summary.counts),'The complete receiving row counts changed.');
  need(new Set(value.captures.map(item=>item.id)).size===value.captures.length&&value.captures.every(item=>item.id===item.captureSha256&&/^[a-f0-9]{64}$/.test(item.id)),'The report repeats or changes an original FRED capture identity.');
  const complete=[packageCapture,crosswalk,plan,captures].filter(item=>item!==null).length;
  need(complete===0||complete===4,'Provide the complete original source, plan and FRED batches together.');
  if(complete===4)need(same(value,buildFredDdpReceiving({packageCapture,crosswalk,plan,captures})),'The receiving report does not derive from its complete original sources.');
  return clone(value);
}
export function pageFredDdpReceiving(value,{offset=0,limit=100,changesOnly=true,seriesId=null}={}){
  const receiving=validateFredDdpReceiving(value);
  need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=1000&&typeof changesOnly==='boolean'&&
    (seriesId===null||typeof seriesId==='string'),'Choose a valid complete receiving page.');
  if(seriesId!==null)need(receiving.meanings.some(item=>item.seriesId===seriesId),'The selected original receiving series does not exist.');
  const selected=receiving.rows.filter(row=>(seriesId===null||row.seriesId===seriesId)&&(!changesOnly||!['EQUAL','BOTH_MISSING'].includes(row.status)));
  const {rows,...metadata}=receiving;
  return {...metadata,filter:{changesOnly,seriesId},offset,limit,total:selected.length,nextOffset:offset+limit<selected.length?offset+limit:null,rows:selected.slice(offset,offset+limit)};
}
