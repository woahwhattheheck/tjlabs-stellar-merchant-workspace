// MIT. Immutable whole-package migration plans from complete original sources.
import { canonical,clone,date,need,plain,normalizeSelection } from '../model.mjs';
import { ddpDigest } from './files.mjs';
import { inspectFredDdpPackage } from './package.mjs';
import { inspectFredDdpCrosswalk,resolveFredDdpMappings,fredDdpSourceSeries,fredDdpTargetSeries } from './crosswalk.mjs';
import { FRED_DDP_PERIOD_RULES,normalizeFredDdpPeriod,inferredFredDdpPeriodRule,normalizeFredDdpScale,fredDdpFrequencyKind } from './periods.mjs';
const SCHEMA='stellar-forge.fred-ddp-migration-plan.v1';
const same=(a,b)=>canonical(a)===canonical(b),sourceKey=item=>item.release+'\u0000'+item.boardSeriesId;
function note(value,limit=8000){need(typeof value==='string'&&value.length<=limit,'Retain a supported analyst note.');return value;}
function reviewedNote(value){const result=note(value,4000);need(result.trim().length>0,'Retain the reason for a reviewed mapping or meaning.');return result;}
export function normalizeFredDdpMigrationInput(input){
  need(plain(input),'A whole-package migration selection is required.');
  const allowed=['name','asOf','window','decisions','bindings','pageSize','maxRows','bookmark','note'];
  need(Object.keys(input).every(key=>allowed.includes(key)),'Unknown whole-package migration input.');
  need(typeof input.name==='string'&&input.name.trim().length>0&&input.name.length<=500,'Name this package migration.');
  const asOf=date(input.asOf,'FRED as-of date');need(asOf>='1776-07-04','Choose a supported FRED as-of date.');
  const rawWindow=input.window??{kind:'source'};need(plain(rawWindow)&&['source','fixed','last'].includes(rawWindow.kind),'Choose source periods, fixed dates or the last observation count.');
  let window;
  if(rawWindow.kind==='fixed'){
    need(Object.keys(rawWindow).every(key=>['kind','start','end'].includes(key)),'Unknown fixed-date policy.');
    window={kind:'fixed',start:date(rawWindow.start,'Observation start'),end:date(rawWindow.end,'Observation end')};
    need(window.start>='1776-07-04'&&window.start<=window.end,'The original fixed observation window is reversed or unsupported.');
  }else if(rawWindow.kind==='last'){
    need(Object.keys(rawWindow).every(key=>['kind','count'].includes(key))&&Number.isSafeInteger(rawWindow.count)&&rawWindow.count>=1&&rawWindow.count<=1000000,'Choose a valid original observation count.');
    window={kind:'last',count:rawWindow.count};
  }else{need(Object.keys(rawWindow).every(key=>key==='kind'),'Unknown source-period policy.');window={kind:'source'};}
  need(Array.isArray(input.decisions??[])&&Array.isArray(input.bindings??[])&&(input.decisions??[]).length<=100000&&(input.bindings??[]).length<=100000,'Invalid reviewed migration decisions.');
  const decisions=(input.decisions??[]).map(value=>{
    need(plain(value)&&Object.keys(value).every(key=>['release','boardSeriesId','action','fredSeriesId','note'].includes(key)),'Unknown reviewed mapping field.');
    const base=fredDdpSourceSeries(value);need(value.action==='map'||value.action==='exclude','Choose map or exclude for an original source series.');
    const out={...base,action:value.action,note:reviewedNote(value.note)};
    if(value.action==='map')out.fredSeriesId=fredDdpTargetSeries(value.fredSeriesId);
    else need(value.fredSeriesId===undefined||value.fredSeriesId===null,'An excluded original series cannot also name a target.');return out;
  });
  const bindings=(input.bindings??[]).map(value=>{
    need(plain(value)&&Object.keys(value).every(key=>['seriesId','periodRule','sourceScale','targetScale','expectedFredUnits','expectedFredFrequency','expectedFredSeasonalAdjustment','note'].includes(key)),'Unknown reviewed source meaning.');
    need(typeof value.seriesId==='string'&&/^fred-ddp-series-[a-f0-9]{64}$/.test(value.seriesId),'Select the exact original package series to review.');
    need(value.periodRule===undefined||value.periodRule===null||FRED_DDP_PERIOD_RULES.includes(value.periodRule),'Choose the reviewed original period rule.');
    const out={seriesId:value.seriesId,periodRule:value.periodRule??null,sourceScale:normalizeFredDdpScale(value.sourceScale??'1'),
      targetScale:normalizeFredDdpScale(value.targetScale??'1'),expectedFredUnits:null,expectedFredFrequency:null,expectedFredSeasonalAdjustment:null,note:reviewedNote(value.note)};
    for(const key of ['expectedFredUnits','expectedFredFrequency','expectedFredSeasonalAdjustment']){
      const text=value[key]??null;need(text===null||typeof text==='string'&&text.length>0&&text.length<=2000,'Invalid reviewed FRED metadata.');out[key]=text;
    }return out;
  });
  need(new Set(decisions.map(sourceKey)).size===decisions.length&&new Set(bindings.map(value=>value.seriesId)).size===bindings.length,'Review each original source series once.');
  const pageSize=input.pageSize??1000,maxRows=input.maxRows??1000000;
  need(Number.isSafeInteger(pageSize)&&pageSize>=1&&pageSize<=100000&&Number.isSafeInteger(maxRows)&&maxRows>=1&&maxRows<=1000000,'Choose valid native FRED acquisition settings.');
  const bookmark=input.bookmark??null;
  if(bookmark!==null){need(typeof bookmark==='string'&&bookmark.length>0&&bookmark.length<=8192,'Retain the complete original DDP bookmark.');
    let url;try{url=new URL(bookmark);}catch{need(false,'The retained DDP bookmark must be a complete URI.');}
    need(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password,'Use the original HTTP or HTTPS DDP bookmark.');}
  return {name:input.name,asOf,window,decisions,bindings,pageSize,maxRows,bookmark,note:note(input.note??'')};
}
function normalizedBinding(series,reviewed){
  return {seriesId:series.id,periodRule:reviewed?.periodRule??inferredFredDdpPeriodRule(series.frequency),
    sourceScale:reviewed?.sourceScale??'1',targetScale:reviewed?.targetScale??'1',
    expectedFredUnits:reviewed?.expectedFredUnits??null,expectedFredFrequency:reviewed?.expectedFredFrequency??null,
    expectedFredSeasonalAdjustment:reviewed?.expectedFredSeasonalAdjustment??null,note:reviewed?.note??'',reviewed:Boolean(reviewed)};
}
function estimateRows(series,start,end){
  const days=Math.max(1,Math.floor((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1);
  const kind=fredDdpFrequencyKind(series.frequency?.label)||fredDdpFrequencyKind(series.frequency?.code);
  return kind==='M'?Math.ceil(days/28)+1:kind==='Q'?Math.ceil(days/89)+1:kind==='SA'?Math.ceil(days/181)+1:
    kind==='A'?Math.ceil(days/365)+1:kind==='BW'?Math.ceil(days/14)+1:kind==='W'?Math.ceil(days/7)+1:days;
}
export function buildFredDdpMigrationPlan({packageCapture,crosswalk,...rawInput}){
  const source=inspectFredDdpPackage(packageCapture),mappingSource=inspectFredDdpCrosswalk(crosswalk),input=normalizeFredDdpMigrationInput(rawInput);
  const uniqueSources=new Map(source.series.map(series=>[sourceKey(series),{release:series.release,boardSeriesId:series.boardSeriesId}]));
  const mappings=resolveFredDdpMappings({crosswalk,series:[...uniqueSources.values()],decisions:input.decisions}),mapped=new Map(mappings.rows.map(row=>[sourceKey(row),row]));
  const bindingMap=new Map(input.bindings.map(value=>[value.seriesId,value])),originalIds=new Set(source.series.map(series=>series.id));
  need(input.bindings.every(value=>originalIds.has(value.seriesId)),'A reviewed meaning refers to another original package.');
  const series=source.series.map(item=>{
    const binding=normalizedBinding(item,bindingMap.get(item.id)),mapping=mapped.get(sourceKey(item)),periods=[],invalid=[];
    for(const observation of item.observations){
      try{periods.push({index:observation.index,...normalizeFredDdpPeriod(observation.period,binding.periodRule)});}
      catch{invalid.push(observation.index);}
    }
    let selected=periods;
    if(input.window.kind==='fixed')selected=periods.filter(period=>period.key>=input.window.start&&period.key<=input.window.end);
    if(input.window.kind==='last')selected=periods.filter(period=>period.key<=input.asOf).sort((a,b)=>a.key.localeCompare(b.key)||a.index-b.index).slice(-input.window.count);
    const selectedIndices=new Set(selected.map(period=>period.index));
    // Keep source order even if the original file orders its periods differently.
    const sourceIndices=item.observations.filter(observation=>selectedIndices.has(observation.index)).map(observation=>observation.index);
    const rawStarts=selected.map(period=>period.originalStart).sort(),rawEnds=selected.map(period=>period.originalEnd).sort();
    const keys=selected.map(period=>period.key).sort();
    const issues=[];
    if(invalid.length)issues.push({code:'UNSUPPORTED_PERIOD',sourceIndices:invalid,message:'Choose a supported original period representation.'});
    if(mapping.status==='MAPPED'&&sourceIndices.length===0&&input.window.kind!=='fixed'&&input.window.kind!=='last')
      issues.push({code:'EMPTY_SOURCE_WINDOW',sourceIndices:[],message:'The original selected series has no observation periods.'});
    return {id:item.id,index:item.index,release:item.release,boardSeriesId:item.boardSeriesId,datasetId:item.datasetId,title:item.title,
      fredSeriesId:mapping.fredSeriesId,mappingStatus:mapping.status,binding,sourceIndices,selectedObservationCount:sourceIndices.length,
      window:{kind:input.window.kind,start:keys[0]??null,end:keys.at(-1)??null,
        originalStart:rawStarts[0]??null,originalEnd:rawEnds.at(-1)??null},issues};
  });
  const summary={ready:false,seriesCount:series.length,mappedCount:0,excludedCount:0,unmappedCount:0,ambiguousCount:0,targetSeriesCount:mappings.targets.length,
    acquisitionCount:0,selectedObservationCount:series.reduce((sum,item)=>sum+item.selectedObservationCount,0),unresolvedPeriodCount:0,emptyWindowSeriesCount:0};
  for(const item of series){
    summary[{MAPPED:'mappedCount',EXCLUDED:'excludedCount',UNMAPPED:'unmappedCount',AMBIGUOUS:'ambiguousCount'}[item.mappingStatus]]++;
    if(item.mappingStatus==='MAPPED')for(const issue of item.issues){if(issue.code==='UNSUPPORTED_PERIOD')summary.unresolvedPeriodCount+=issue.sourceIndices.length;else if(issue.code==='EMPTY_SOURCE_WINDOW')summary.emptyWindowSeriesCount++;}
  }
  let start=null,end=null;
  if(input.window.kind==='fixed'){start=input.window.start;end=input.window.end;}
  else if(input.window.kind==='last'){start='1776-07-04';end=input.asOf;}
  else{
    const chosen=series.filter(item=>item.mappingStatus==='MAPPED'&&item.window.originalStart!==null);
    const starts=chosen.map(item=>item.window.originalStart).sort(),ends=chosen.map(item=>item.window.originalEnd).sort();
    // A complete calendar-year start covers month/quarter/year start labels while the original source dates stay unchanged.
    if(starts.length){start=starts[0].slice(0,4)+'-01-01';if(start<'1776-07-04')start='1776-07-04';end=ends.at(-1);}
  }
  const acquisitions=[];
  if(start!==null&&end!==null&&start<=end){
    const originalById=new Map(source.series.map(item=>[item.id,item])),estimates=new Map();
    for(const item of series.filter(item=>item.mappingStatus==='MAPPED')){
      const estimate=estimateRows(originalById.get(item.id),start,end);
      estimates.set(item.fredSeriesId,Math.max(estimates.get(item.fredSeriesId)||0,estimate));
    }
    let batch=[],estimated=0;
    const flush=()=>{
      if(!batch.length)return;
      const selection=normalizeSelection({series:batch,asOf:input.asOf,start,end,pageSize:input.pageSize,maxRows:input.maxRows});
      const descriptor={series:clone(selection.series),selection};
      acquisitions.push({id:'fred-ddp-acquisition-'+ddpDigest({packageId:source.id,crosswalkId:mappingSource.id,...descriptor}),...descriptor});
      batch=[];estimated=0;
    };
    for(const id of mappings.targets){const count=estimates.get(id)||1;if(batch.length&&(batch.length===50||estimated+count>input.maxRows))flush();batch.push(id);estimated+=count;}
    flush();
  }
  summary.acquisitionCount=acquisitions.length;
  summary.ready=summary.unmappedCount===0&&summary.ambiguousCount===0&&summary.unresolvedPeriodCount===0&&summary.emptyWindowSeriesCount===0&&acquisitions.length>0;
  const core={schema:SCHEMA,packageId:source.id,packageSha256:source.captureSha256,crosswalkId:mappingSource.id,crosswalkSha256:mappingSource.captureSha256,
    input,mappings,series,acquisitions,summary};
  return {...core,id:'fred-ddp-migration-plan-'+ddpDigest(core)};
}
export function validateFredDdpMigrationPlan(value,{packageCapture=null,crosswalk=null}={}){
  need(plain(value)&&value.schema===SCHEMA&&Array.isArray(value.series)&&Array.isArray(value.acquisitions)&&plain(value.summary)&&plain(value.mappings),'A complete immutable DDP migration plan is required.');
  const {id,...core}=value;
  need(id==='fred-ddp-migration-plan-'+ddpDigest(core)&&same(value.input,normalizeFredDdpMigrationInput(value.input)),'The saved migration plan identity or selected inputs changed.');
  need(value.packageId==='fred-ddp-package-'+value.packageSha256&&value.crosswalkId==='fred-ddp-crosswalk-'+value.crosswalkSha256&&
    /^[a-f0-9]{64}$/.test(value.packageSha256)&&/^[a-f0-9]{64}$/.test(value.crosswalkSha256),'The migration plan lost its original source identities.');
  need(new Set(value.series.map(item=>item.id)).size===value.series.length&&new Set(value.acquisitions.map(item=>item.id)).size===value.acquisitions.length,'The immutable migration plan repeats an original series or acquisition.');
  for(const item of value.acquisitions)need(plain(item)&&same(item.selection,normalizeSelection(item.selection))&&same(item.series,item.selection.series)&&
    item.id==='fred-ddp-acquisition-'+ddpDigest({packageId:value.packageId,crosswalkId:value.crosswalkId,series:item.series,selection:item.selection}),'A saved original acquisition changed.');
  need((packageCapture===null)===(crosswalk===null),'Provide both original package and crosswalk context for complete plan validation.');
  if(packageCapture!==null)need(same(value,buildFredDdpMigrationPlan({packageCapture,crosswalk,...value.input})),'The migration plan no longer derives from its complete original sources.');
  return clone(value);
}
export function pageFredDdpMigrationPlan(value,{section='series',offset=0,limit=100}={}){
  const plan=validateFredDdpMigrationPlan(value);
  need(['series','acquisitions','mappings'].includes(section)&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=1000,'Choose a valid migration-plan page.');
  const source=section==='mappings'?plan.mappings.rows:plan[section];
  return {schema:plan.schema,id:plan.id,packageId:plan.packageId,packageSha256:plan.packageSha256,crosswalkId:plan.crosswalkId,crosswalkSha256:plan.crosswalkSha256,
    input:plan.input,summary:plan.summary,section,offset,limit,total:source.length,nextOffset:offset+limit<source.length?offset+limit:null,rows:source.slice(offset,offset+limit)};
}
