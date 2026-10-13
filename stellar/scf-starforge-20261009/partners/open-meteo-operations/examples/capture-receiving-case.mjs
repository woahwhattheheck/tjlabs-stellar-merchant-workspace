#!/usr/bin/env node
// MIT. Complete real provider capture, operating decisions and frozen receiving case.
import {readFile,writeFile,mkdir,rename,chmod,stat} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {publish,readPrivate} from '../files.mjs';

const HISTORICAL_ARCHIVE={bytes:33416,sha256:'28d56f92cdf35756773a40eb5a0125d03b5b0f86d5ebf63485d2c79365643f53'};
const fail=(code,details)=>{throw Object.assign(new Error(code),{code,details});};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const ordered=value=>Array.isArray(value)?value.map(ordered):plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const equal=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
async function exists(path){try{await stat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function readJson(path){return JSON.parse(await readFile(path,'utf8'));}
async function saveJson(path,value){
 await mkdir(dirname(path),{recursive:true,mode:0o700});
 const temp=path+'.'+randomUUID()+'.pending';
 await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temp,path);
}
async function keep(path,input){
 await mkdir(dirname(path),{recursive:true,mode:0o700});
 const bytes=Buffer.isBuffer(input)?input:Buffer.from(input);
 try{return await publish(path,bytes);}
 catch(error){
  if(error.code!=='EEXIST')throw error;
  if(!(await readPrivate(path,bytes.length)).equals(bytes))fail('RETAINED_PROVIDER_FILE_CHANGED',{path});
  return {path,bytes:bytes.length,status:'RETAINED'};
 }
}
const dayAfter=value=>new Date(Date.parse(value+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const utc=seconds=>new Date(seconds*1000).toISOString();

export async function captureWeatherReceivingCase({runtime,output,forecastStart,historyStart='2024-11-02',historyEnd='2024-11-04',proxyEnv,owner='TJL weather receiving operator'}){
 runtime=resolve(runtime);output=resolve(output);
 await mkdir(output,{recursive:true,mode:0o700});await chmod(output,0o700);
 process.env.OPEN_METEO_RUNTIME_ROOT=runtime;
 const component=join(runtime,'partners','open-meteo-operations');
 const {SCHEMA,FAMILIES,MAX_RESPONSE_BYTES,ATTRIBUTION,providerProfile,providerUrl,publicQuery,normalizeRequest,date,sha,variableInterval}=await import(pathToFileURL(join(component,'contract.mjs')));
 const {WeatherStore}=await import(pathToFileURL(join(component,'store.mjs')));
 const {frozenReportBytes}=await import(pathToFileURL(join(component,'exports.mjs')));
 const {createPublicHttpsFetch}=await import(pathToFileURL(join(runtime,'sf31-buyer-client','public-transport.mjs')));
 const selectionPath=join(output,'source-selection.json');
 const previous=await exists(selectionPath)?await readJson(selectionPath):null;
 forecastStart??=previous?.forecastStart??new Date().toISOString().slice(0,10);
 date(forecastStart);date(historyStart);date(historyEnd);
 const profile=providerProfile({mode:'evaluation',...(proxyEnv?{proxyEnv}:{})});
 const site={name:'New York operating review',latitude:40.7128,longitude:-74.006,timezone:'America/New_York',cellSelection:'land',
  notes:'Real forecast, historical reanalysis and complete returned ensemble members selected for the weather receiving operation.'};
 const requests=[
  {family:'forecast',title:'New York 48-hour operational forecast',model:'best_match',startDate:forecastStart,endDate:dayAfter(forecastStart),
   variables:['temperature_2m','precipitation','wind_speed_10m'],units:{temperature:'celsius',wind:'kmh',precipitation:'mm'}},
  {family:'history',title:'New York reanalysis across the November 2024 clock change',model:'era5',startDate:historyStart,endDate:historyEnd,
   variables:['temperature_2m','precipitation','wind_speed_10m','wind_gusts_10m'],units:{temperature:'celsius',wind:'kmh',precipitation:'mm'}},
  {family:'ensemble',title:'New York 48-hour ICON member forecast',model:'icon_seamless',startDate:forecastStart,endDate:dayAfter(forecastStart),
   variables:['temperature_2m','precipitation','wind_speed_10m'],units:{temperature:'celsius',wind:'kmh',precipitation:'mm'}}
 ].map(({title,...request})=>({title,request:normalizeRequest({...request,latitude:site.latitude,longitude:site.longitude,timezone:site.timezone,cellSelection:site.cellSelection})}));
 const selection={schema:'stellar-forge.weather-provider-receiving-selection.v1',sourceSchema:SCHEMA,runtime,forecastStart,historyStart,historyEnd,owner,
  provider:profile,site,requests,historicalArchiveReference:{...HISTORICAL_ARCHIVE,relationship:'Earlier engineering run. This case retains its own actual provider capture time and archive identity.'}};
 if(previous){if(!equal(previous,selection))fail('PROVIDER_CASE_SELECTION_CHANGED');}else await saveJson(selectionPath,selection);
 const stateFile=join(output,'source-progress.json');
 const progress=await exists(stateFile)?await readJson(stateFile):{schema:'stellar-forge.weather-provider-receiving-progress.v1',startedAt:new Date().toISOString(),requests:{},decisions:{}};
 const store=await WeatherStore.open(join(output,'source-store'));
 let result;
 try{
  if(!progress.siteId){
   const existing=store.sites().find(({id,revision,createdAt,...value})=>equal(value,site));
   const saved=existing??store.saveSite({site});progress.siteId=saved.id;await saveJson(stateFile,progress);
  }
  const savedSite=store.site(progress.siteId);
  if(!equal(Object.fromEntries(Object.entries(savedSite).filter(([key])=>!['id','revision','createdAt'].includes(key))),site))fail('PROVIDER_CASE_SITE_CHANGED');
  const captures=[];
  for(const selected of requests){
   const family=selected.request.family;
   let requestId=progress.requests[family];
   if(!requestId){
    const matching=store.requests().filter(request=>request.spec.title===selected.title&&equal(request.spec.request,selected.request)&&request.spec.site.id===savedSite.id);
    if(matching.length>1)fail('PROVIDER_CASE_REQUEST_SELECTION_AMBIGUOUS',{family});
    const saved=matching[0]??store.saveRequest({siteId:savedSite.id,siteRevision:savedSite.revision,title:selected.title,request:selected.request});
    requestId=saved.id;progress.requests[family]=requestId;await saveJson(stateFile,progress);
   }
   let request=store.request(requestId);
   if(!equal(request.spec.request,selected.request)||request.spec.title!==selected.title)fail('RETAINED_PROVIDER_REQUEST_CHANGED',{family,requestId});
   let capture=request.captureId?store.capture(request.captureId):null;
   if(!capture){
    const read=store.sourceRead(requestId);
    if(read){
     if(read.specSha256!==request.specSha256)fail('RETAINED_PROVIDER_REQUEST_CHANGED',{requestId});
     if(request.state!=='ACQUIRING')request=store.beginSource(requestId,request.revision,{reprocess:true});
     capture=store.attachCapture(requestId,request.specSha256,read.raw,read.provenance);
    }else{
     request=store.beginSource(requestId,request.revision);
     const url=providerUrl(selected.request,profile);
     let response;
     try{
      const fetch=createPublicHttpsFetch({timeoutMs:100000,...(proxyEnv?{trustedProxy:{mode:'explicit-connect',origin:url.origin,proxyEnv}}:{})});
      response=await fetch(url.href,{method:'GET',headers:{accept:'application/json'},redirect:'manual'});
      const reader=response.body.getReader(),parts=[];let length=0;
      try{for(;;){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;if(length>MAX_RESPONSE_BYTES)fail('WEATHER_RESPONSE_TOO_LARGE');parts.push(Buffer.from(item.value));}}
      catch(error){await reader.cancel().catch(()=>{});throw error;}
      const bytes=Buffer.concat(parts),contentType=response.headers.get('content-type')??'';
      if(response.status!==200||!/^application\/json(?:;|$)/i.test(contentType)){
       const code=response.status!==200?'WEATHER_PROVIDER_HTTP_'+response.status:'WEATHER_PROVIDER_CONTENT_TYPE';
       const bodyPath=join(output,'provider-errors',requestId+'-'+request.sourceAttempt+'.body');
       const metadataPath=bodyPath+'.json';
       const providerResponse={schema:'stellar-forge.weather-provider-error-response.v1',requestId,sourceAttempt:request.sourceAttempt,
        specSha256:request.specSha256,family,request:selected.request,sourceUrl:url.href,query:publicQuery(selected.request).toString(),
        providerMode:profile.mode,httpStatus:response.status,contentType,retryAfter:response.headers.get('retry-after'),
        observedAt:new Date().toISOString(),httpRequests:1,complete:true,body:{path:bodyPath,bytes:bytes.length,sha256:sha(bytes)},
        metadataPath,code};
       await keep(bodyPath,bytes);await keep(metadataPath,Buffer.from(JSON.stringify(providerResponse,null,2)+'\n'));
       fail(code,{family,sourceUrl:url.href,providerResponse});
      }
      const provenance={kind:'PROVIDER_CAPTURE',sourceAttempt:request.sourceAttempt,sourceUrl:url.href,providerMode:profile.mode,
       httpStatus:response.status,retrievedAt:new Date().toISOString(),requestSha256:sha(Buffer.from(publicQuery(selected.request).toString())),httpRequests:1,
       accounting:'A provider read; local HTTP request count is not the provider billing-unit count.',attribution:ATTRIBUTION};
      store.retainSourceRead(requestId,request.specSha256,bytes,provenance);
      await keep(join(output,'original-sources',family+'.json'),bytes);
      await saveJson(join(output,'original-sources',family+'-request.json'),{requestId,specSha256:request.specSha256,request:selected.request,query:publicQuery(selected.request).toString(),provenance,bytes:bytes.length,sha256:sha(bytes)});
      capture=store.attachCapture(requestId,request.specSha256,bytes,provenance);
     }catch(error){
      await response?.body?.cancel().catch(()=>{});
      const current=store.request(requestId);
      if(current.state==='ACQUIRING')store.sourceFailed(requestId,request.specSha256,{code:error.code??error.name,sourceAttempt:request.sourceAttempt,observedAt:new Date().toISOString(),sourceUrl:url.href,...(error.details?.providerResponse?{providerResponse:error.details.providerResponse}:{})});
      throw error;
     }
    }
   }
   if(capture.provenance.kind!=='PROVIDER_CAPTURE'||capture.provenance.sourceUrl!==providerUrl(selected.request,profile).href||
    capture.provenance.requestSha256!==sha(Buffer.from(publicQuery(selected.request).toString()))||capture.sha256!==sha(capture.raw))fail('PROVIDER_CAPTURE_SELECTION_CHANGED',{family});
   await keep(join(output,'original-sources',family+'.json'),capture.raw);
   await saveJson(join(output,'original-sources',family+'-request.json'),{requestId,specSha256:capture.specSha256,request:selected.request,query:publicQuery(selected.request).toString(),provenance:capture.provenance,bytes:capture.bytes,sha256:capture.sha256});
   captures.push(capture);
   process.stdout.write(JSON.stringify({phase:'provider-source-retained',family,requestId,captureId:capture.id,bytes:capture.bytes,sha256:capture.sha256,retrievedAt:capture.provenance.retrievedAt})+'\n');
  }
  const decisions=[];
  for(const capture of captures){
   const family=capture.request.request.family;
   const selected=family==='forecast'?{variable:'temperature_2m',unit:'°F',aggregation:'max',threshold:86}:
    family==='history'?{variable:'wind_gusts_10m',unit:'km/h',aggregation:'max',threshold:40}:
    {variable:'precipitation',unit:'mm',aggregation:'sum',threshold:10};
   const backward=variableInterval(capture.request.request,selected.variable).startsWith('preceding-');
   const rule={...selected,operator:'gte',minimumCoverage:1,startUtc:utc(capture.view.times[0]-(backward?3600:0)),endUtc:utc(capture.view.times.at(-1)+(backward?0:3600))};
   const decision={title:family==='forecast'?'Retained forecast heat threshold':family==='history'?'Historical peak gust review':'Ensemble accumulated precipitation review',
    owner,disposition:'monitor',notes:'Operator-selected engineering review threshold over the complete retained hourly window. Source time, model and missing values remain visible. This selection travels with the complete original response.',rule};
   let saved;
   if(progress.decisions[family])saved=store.decision(progress.decisions[family],1);
   else{
    const candidates=store.decisions().filter(value=>value.captureId===capture.id&&value.title===decision.title);
    if(candidates.length>1)fail('PROVIDER_CASE_DECISION_SELECTION_AMBIGUOUS',{family});
    saved=candidates[0]??store.saveDecision({captureId:capture.id,decision});
    progress.decisions[family]=saved.id;await saveJson(stateFile,progress);
   }
   if(saved.revision!==1||saved.captureId!==capture.id||!equal(saved.rule,rule)||saved.owner!==owner||saved.notes!==decision.notes)fail('PROVIDER_CASE_DECISION_CHANGED',{family});
   decisions.push(saved);
  }
  const reportInput={title:'New York complete provider-source operating review',owner,
   notes:'Complete real provider capture selected for editable Weather receiving. The forecast heat rule retains 86 °F; the historical gust rule uses instantaneous ERA5 values; the ensemble rule retains every returned precipitation member. Actual requests, retrieval times and original response bytes accompany this report.',
   decisions:decisions.map(({id,revision})=>({id,revision}))};
  let report=progress.reportId?store.report(progress.reportId):null;
  if(!report){
   const candidates=store.reports().filter(item=>item.title===reportInput.title&&item.owner===owner&&equal(item.decisions.map(({id,revision})=>({id,revision})),reportInput.decisions));
   if(candidates.length>1)fail('PROVIDER_CASE_REPORT_SELECTION_AMBIGUOUS');
   report=candidates[0]??store.freezeReport(reportInput);progress.reportId=report.id;await saveJson(stateFile,progress);
  }
  if(!equal(report.decisions.map(({id,revision})=>({id,revision})),reportInput.decisions)||report.owner!==owner||report.notes!==reportInput.notes)fail('PROVIDER_CASE_REPORT_CHANGED');
  const handover=store.handover(report.id),files={};
  for(const [format,filename]of [['zip','provider-weather-report.zip'],['json','provider-weather-report.json'],['html','provider-weather-report.html'],['handover','provider-weather-editable.weather.json']]){
   const bytes=await frozenReportBytes(report,captures,{format,handover});
   const path=join(output,'delivery',filename);await keep(path,bytes);
   files[format]={path,bytes:bytes.length,sha256:sha(bytes)};
  }
  result={schema:'stellar-forge.weather-provider-receiving-result.v1',complete:false,phase:'exported',startedAt:progress.startedAt,exportedAt:new Date().toISOString(),selection,
   store:{directory:store.directory,originId:store.originId()},report,files,captures:captures.map(({raw,view,...capture})=>capture),decisions,
   selectedArchive:files.zip};
  await saveJson(join(output,'result.json'),result);
 }finally{await store.close();}
 const reopened=await WeatherStore.open(join(output,'source-store'));
 try{
  if(!equal(reopened.report(result.report.id),result.report)||reopened.captures().length!==3)fail('PROVIDER_SOURCE_STORE_REOPEN_CHANGED');
  for(const capture of result.captures)if(reopened.capture(capture.id).sha256!==capture.sha256)fail('PROVIDER_SOURCE_STORE_REOPEN_CHANGED');
 }finally{await reopened.close();}
 result.complete=true;result.phase='completed';result.finishedAt=new Date().toISOString();result.coldReopenedAt=result.finishedAt;await saveJson(join(output,'result.json'),result);
 process.stdout.write(JSON.stringify({complete:true,sourceCase:join(output,'result.json'),selectedArchive:result.selectedArchive,reportId:result.report.id})+'\n');
 return result;
}
function options(args){
 const values={},allowed=new Set(['--runtime','--output','--forecast-start','--history-start','--history-end','--proxy-env','--owner']);
 for(let i=0;i<args.length;i++){if(!allowed.has(args[i])||values[args[i]]!==undefined||!args[i+1])fail('OPTION_INVALID',args[i]);values[args[i]]=args[++i];}
 for(const key of ['--runtime','--output'])if(!values[key])fail('OPTION_REQUIRED',key);
 return {runtime:values['--runtime'],output:values['--output'],forecastStart:values['--forecast-start'],historyStart:values['--history-start'],historyEnd:values['--history-end'],proxyEnv:values['--proxy-env'],owner:values['--owner']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 captureWeatherReceivingCase(options(process.argv.slice(2))).catch(async error=>{
  const value={complete:false,error:{code:error.code??error.name,message:error.message,details:error.details??null},at:new Date().toISOString()};
  try{const opt=options(process.argv.slice(2));await saveJson(join(resolve(opt.output),'last-error.json'),value);}catch{}
  process.stderr.write(JSON.stringify(value)+'\n');process.exitCode=1;
 });
}
