// MIT. Complete financing options over the original native Forecast calculator.
import {signature} from './forecast-workbook.mjs';
import {validateForecastDraftInputs} from './forecast-workbook-host.mjs';
import {encodeWorkbookBytes,decodeWorkbookBytes} from './source-workbooks.mjs';

export const FINANCING_SCHEMA='stellar-forge.forecast-financing.v1';
export const FINANCING_FILE_SCHEMA=FINANCING_SCHEMA+'.file';
export const FINANCING_PREVIEW_SCHEMA='stellar-forge.forecast-financing-preview.v1';
export const MAX_FINANCING_OPTIONS=24;
const clone=v=>JSON.parse(JSON.stringify(v));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const hash=/^[a-f0-9]{64}$/;
const ident=/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>signature(a)===signature(b);
const text=(v,n,max=12000,required=false)=>{need(typeof v==='string'&&v.length<=max&&!v.includes('\0')&&(!required||v.trim()),n+' must be complete ordinary text.');return v;};
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const now=()=>new Date().toISOString();
const caseIds=s=>new Set([s.caseId,...(s.origins||[]).map(x=>x.caseId)]);
const uuid=p=>p+'-'+crypto.randomUUID();
const keys=(v,allowed,label)=>need(object(v)&&Object.keys(v).every(k=>allowed.includes(k)),'Unexpected '+label+' fields; preserve the original complete file.');
export async function financingSha(value){
  const raw=value instanceof Uint8Array?value:new TextEncoder().encode(typeof value==='string'?value:signature(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function binding(current){return {caseId:current.program.id,originCaseId:current.program.origin?.programId||null,planContentSha256:current.plan.contentSha256};}
function checkBinding(v,current){const b=binding(current);need(v.caseId===b.caseId&&v.originCaseId===b.originCaseId&&v.planContentSha256===b.planContentSha256,'Open this complete financing study in its original case and pinned plan.');}
function safeRaw(v){
  need(object(v)&&Object.keys(v).length<=20000,'Retain complete original Forecast control values.');
  for(const [k,r]of Object.entries(v)){let p;try{p=JSON.parse(k);}catch{throw Error('An original field identity is invalid.');}
    need(Array.isArray(p)&&p.length<=20&&p.every(x=>typeof x==='string'||Number.isSafeInteger(x))&&object(r)&&typeof r.value==='string'&&r.value.length<=100000&&typeof r.checked==='boolean'&&
      (r.values===undefined||Array.isArray(r.values)&&r.values.length<=1000&&r.values.every(x=>typeof x==='string')),'Retain every unfinished original field value.');}
}
function capture(v){keys(v,['inputs','rawFields','capturedAt','caseVersion'],'option capture');validateForecastDraftInputs(v.inputs);safeRaw(v.rawFields);need(date(v.capturedAt)&&Number.isSafeInteger(v.caseVersion)&&v.caseVersion>0,'Retain the exact capture date and case version.');}
function sourceMeta(s){need(object(s)&&/^source-[a-f0-9]{32}$/.test(s.id||'')&&hash.test(s.sha256||'')&&Number.isSafeInteger(s.bytes)&&s.bytes>0&&typeof s.filename==='string'&&typeof s.mediaType==='string','Retain complete original source identities.');}
function context(v,state){
  need(object(v)&&caseIds(state).has(v.program?.id)&&Number.isSafeInteger(v.program.version)&&v.program.version>0&&v.plan?.contentSha256===state.planContentSha256&&Array.isArray(v.sources)&&object(v.records),'Retain the original complete case context for this comparison.');
  const ids=new Set();for(const s of v.sources){sourceMeta(s);need(!ids.has(s.id),'Repeated original source identity.');ids.add(s.id);}
}
function request(v){keys(v,['expectedVersion','options'],'batch request');need(Number.isSafeInteger(v.expectedVersion)&&v.expectedVersion>0&&Array.isArray(v.options)&&v.options.length>=1&&v.options.length<=MAX_FINANCING_OPTIONS,'Compare one to 24 complete options.');const ids=new Set();
  for(const r of v.options){keys(r,['id','name','inputs'],'batch option');need(ident.test(r.id||'')&&!ids.has(r.id),'Keep unique option identities.');ids.add(r.id);text(r.name,'Option name',200,true);validateForecastDraftInputs(r.inputs);}
}
function previewShape(v,req,state){
  need(object(v)&&v.schema===FINANCING_PREVIEW_SCHEMA&&hash.test(v.sha256||'')&&hash.test(v.requestSha256||'')&&caseIds(state).has(v.source?.programId)&&v.source?.planContentSha256===state.planContentSha256&&v.source.version===req.expectedVersion&&Array.isArray(v.options)&&v.options.length===req.options.length,'Retain the complete original native batch result.');
  for(let i=0;i<v.options.length;i++){const r=v.options[i],q=req.options[i],p=r.preview;
    need(r.id===q.id&&r.name===q.name&&hash.test(r.inputSha256||'')&&object(p)&&same(p.source,v.source)&&hash.test(p.previewSha256||'')&&object(p.report)&&Array.isArray(p.report.days)&&Array.isArray(p.report.issues),'An option differs from its original complete native result.');
    validateForecastDraftInputs(p.inputs);
  }
}
export function newFinancingState(current){
  return {schema:FINANCING_SCHEMA,...binding(current),id:uuid('financing'),title:'Financing options',note:'',revision:1,selectedId:null,baselineId:null,options:[],comparisons:[],selectedComparisonId:null,adoptions:[],sourceReceipts:[],pendingSource:null,nameDraft:'',noteDraft:'',message:''};
}
export function validateFinancingState(value,current){
  const s=clone(value);keys(s,['schema','caseId','originCaseId','planContentSha256','id','title','note','revision','selectedId','baselineId','options','comparisons','selectedComparisonId','adoptions','sourceReceipts','pendingSource','nameDraft','noteDraft','message','origins'],'financing state');
  need(s.schema===FINANCING_SCHEMA&&ident.test(s.id||'')&&Number.isSafeInteger(s.revision)&&s.revision>0,'Retain the complete original financing study.');checkBinding(s,current);
  if(s.origins!==undefined){need(Array.isArray(s.origins)&&s.origins.length<=100,'Retain the original case receiving lineage.');for(const o of s.origins){keys(o,['caseId','originCaseId','planContentSha256','receivedAt','studySha256'],'received study lineage');need(/^operation-[a-f0-9]{32}$/.test(o.caseId||'')&&(o.originCaseId===null||/^operation-[a-f0-9]{32}$/.test(o.originCaseId||''))&&o.planContentSha256===s.planContentSha256&&date(o.receivedAt)&&hash.test(o.studySha256||''),'Retain exact original study receiving lineage.');}}
  for(const n of ['title','note','nameDraft','noteDraft','message'])text(s[n],n,n==='title'||n==='nameDraft'?200:12000,false);
  need(Array.isArray(s.options)&&s.options.length<=200&&Array.isArray(s.comparisons)&&s.comparisons.length<=100&&Array.isArray(s.adoptions)&&s.adoptions.length<=1000&&Array.isArray(s.sourceReceipts)&&s.sourceReceipts.length<=200,'Retain the complete bounded study history; export an edition before starting another study.');
  const ids=new Set();for(const o of s.options){keys(o,['id','name','note','archived','capture','previous'],'option');need(ident.test(o.id||'')&&!ids.has(o.id)&&typeof o.archived==='boolean'&&Array.isArray(o.previous)&&o.previous.length<=100,'Retain unique complete option histories.');ids.add(o.id);text(o.name,'Option name',200,true);text(o.note,'Option note');capture(o.capture);for(const old of o.previous){keys(old,['name','note','capture'],'prior option edition');text(old.name,'Prior option name',200,true);text(old.note,'Prior option note');capture(old.capture);}}
  need(s.options.filter(x=>!x.archived).length<=MAX_FINANCING_OPTIONS,'Keep at most 24 active options; earlier archived options remain in the study.');
  for(const k of ['selectedId','baselineId'])need(s[k]===null||ids.has(s[k]),'The selected option is absent.');
  const comparisons=new Set();for(const c of s.comparisons){keys(c,['id','createdAt','request','result','context','attachments'],'comparison');need(ident.test(c.id||'')&&!comparisons.has(c.id)&&date(c.createdAt),'Retain unique complete comparison editions.');comparisons.add(c.id);request(c.request);context(c.context,s);need(c.context.program.version===c.request.expectedVersion&&c.context.program.id===c.result.source.programId,'The comparison case identity or version differs.');previewShape(c.result,c.request,s);need(Array.isArray(c.attachments),'Retain the original source attachments.');
    const seen=new Set();for(const a of c.attachments){keys(a,['id','sha256','bytes','dataBase64'],'source attachment');sourceMeta({...a,filename:'',mediaType:''});need(!seen.has(a.id)&&typeof a.dataBase64==='string','Repeated or missing source bytes.');seen.add(a.id);const m=c.context.sources.find(x=>x.id===a.id);need(m&&m.sha256===a.sha256&&m.bytes===a.bytes,'The source attachment is outside its original comparison.');}}
  need(s.selectedComparisonId===null||comparisons.has(s.selectedComparisonId),'The selected comparison is absent.');
  for(const a of s.adoptions){keys(a,['at','optionId','comparisonId','before','after'],'adoption');need(date(a.at)&&ids.has(a.optionId)&&(a.comparisonId===null||comparisons.has(a.comparisonId)),'Retain the original adopted option.');capture(a.before);capture(a.after);}
  for(const r of s.sourceReceipts){need(object(r)&&typeof r.filename==='string'&&hash.test(r.sha256||'')&&date(r.at),'Retain the source receipt.');if(r.status==='SAVED')need(/^source-[a-f0-9]{32}$/.test(r.id||'')&&Number.isSafeInteger(r.version),'The original saved study identity is absent.');else need(r.status==='REJECTED'&&object(r.request)&&object(r.error),'Retain the rejected original source request.');}
  if(s.pendingSource)validateFinancingJournal(s.pendingSource,s,current);
  need(new TextEncoder().encode(JSON.stringify(s)).length<=256*1024*1024,'The complete study exceeds the original working-file allowance. Download its current edition before continuing.');
  return s;
}
export async function verifyFinancingState(value,current,{complete=false}={}){
  const s=validateFinancingState(value,current);
  for(const c of s.comparisons){
    const body=clone(c.result);delete body.sha256;
    need(await financingSha(body)===c.result.sha256&&await financingSha(c.request)===c.result.requestSha256,'The retained native comparison digest differs.');
    for(let i=0;i<c.result.options.length;i++){
      const row=c.result.options[i],p=clone(row.preview);delete p.previewSha256;
      need(await financingSha(c.request.options[i].inputs)===row.inputSha256&&await financingSha(p)===row.preview.previewSha256,'The original option inputs or native preview changed.');
    }
    for(const a of c.attachments){const bytes=decodeWorkbookBytes(a.dataBase64);need(bytes.length===a.bytes&&await financingSha(bytes)===a.sha256,'An original source attachment changed.');}
    if(complete)need(c.attachments.length===c.context.sources.length,'Download the complete original source bytes before exporting this study.');
  }
  if(s.pendingSource){const j=s.pendingSource,b=decodeWorkbookBytes(j.source.dataBase64);need(b.length===j.source.bytes&&await financingSha(b)===j.source.sha256,'The pending study source differs.');const file=JSON.parse(new TextDecoder().decode(b));need(file.schema===FINANCING_FILE_SCHEMA&&file.sourceMode==='CASE_RETAINED'&&file.study.caseId===s.caseId,'Retain the original study source payload.');await verifyFinancingState(file.study,current);}
  return s;
}
export function captureFinancingOption(state,current,editor,{replaceId=null,name,note=''}={}){
  const s=validateFinancingState(state,current);text(name,'Option name',200,true);name=name.trim();text(note,'Option note');capture(editor);
  if(replaceId){const o=s.options.find(x=>x.id===replaceId);need(o&&!o.archived,'Select the active original option to replace.');o.previous.push({name:o.name,note:o.note,capture:clone(o.capture)});o.capture=clone(editor);o.name=name;o.note=note;}
  else {need(s.options.filter(x=>!x.archived).length<MAX_FINANCING_OPTIONS,'Archive an earlier option before adding a 25th active option.');const id=uuid('option');s.options.push({id,name,note,archived:false,capture:clone(editor),previous:[]});s.selectedId=id;if(!s.baselineId)s.baselineId=id;}
  s.revision++;return validateFinancingState(s,current);
}
export function financingRequest(state,current){
  const s=validateFinancingState(state,current);const options=s.options.filter(x=>!x.archived).map(x=>({id:x.id,name:x.name.trim(),inputs:clone(x.capture.inputs)}));
  const r={expectedVersion:current.program.version,options};request(r);return r;
}
export async function retainFinancingComparison(state,current,requestBody,result){
  const s=validateFinancingState(state,current);request(requestBody);previewShape(result,requestBody,s);
  const c={id:uuid('comparison'),createdAt:now(),request:clone(requestBody),result:clone(result),
    context:clone({program:current.program,plan:current.plan,records:current.records,sources:current.sources}),attachments:[]};
  s.comparisons.push(c);s.selectedComparisonId=c.id;s.revision++;return verifyFinancingState(s,current);
}
export function financingComparisonCurrent(state,current){
  const c=state.comparisons.find(x=>x.id===state.selectedComparisonId);if(!c||!state.options.some(x=>!x.archived))return false;
  return c.result.source.programId===current.program.id&&c.result.source.version===current.program.version&&same(c.request,financingRequest(state,current));
}
export function financingChanges(before,after){
  const rows=[];function walk(a,b,path){if(same(a,b))return;
    if(object(a)&&object(b)){for(const k of [...new Set([...Object.keys(a),...Object.keys(b)])].sort())walk(a[k]===undefined?null:a[k],b[k]===undefined?null:b[k],path+'/'+k.replaceAll('~','~0').replaceAll('/','~1'));return;}
    rows.push({path:path||'/',before:a===undefined?null:clone(a),after:b===undefined?null:clone(b)});
  }walk(before,after,'');return rows;
}
export function financingMetrics(preview){
  const r=preview.report,s=r.scenarios,c=r.capacity,f=r.customerFunding;
  return {spendingNeed:s.spendingOnly.additionalCashNeededUsd,grantNeed:s.conditionalGrant.additionalCashNeededUsd,combinedNeed:s.commercial.additionalCashNeededUsd,
    combinedGap:s.commercial.gapAfterOpeningCashUsd,combinedPeak:s.commercial.peakNeedDate,endBalance:s.commercial.endBalanceUsd,
    protectedNeed:f?.enabled?f.summary.maximumRequiredStartingCashUsd:null,protectedGap:f?.enabled?f.summary.extraFundingAfterOpeningUsd:null,
    protectedEnabled:!!f?.enabled,weeklyHours:c.weeklyHours,peakWeekly:c.peakWeeklyEquivalentHours,overloadedDays:c.overloadedDays,
    issueCount:r.issues.length,undatedCost:r.eventTiming?.undatedDeliveryCostUsd??null,currencyComplete:r.currencyValuation?.datedCashComplete??true};
}
function cents(v){return typeof v==='string'&&/^-?\d+\.\d{2}$/.test(v)?BigInt(v.replace('.','')):null;}
export function financingMoneyDelta(before,after){const a=cents(before),b=cents(after);if(a===null||b===null)return null;const n=b-a,abs=n<0n?-n:n;return (n<0n?'-':'')+(abs/100n)+'.'+String(abs%100n).padStart(2,'0');}
export function financingCsv(state){
  const c=state.comparisons.find(x=>x.id===state.selectedComparisonId);need(c,'Calculate and select a complete comparison first.');
  const header=['option_id','option','case_version','as_of_date','grant_required_starting_usd','combined_required_starting_usd','combined_extra_after_opening_usd','combined_peak_date','end_cash_usd','protected_required_starting_usd','protected_extra_after_opening_usd','protection_enabled','peak_weekly_equivalent_hours','available_weekly_hours','overloaded_days','open_issues'];
  const quote=v=>{let t=v===null||v===undefined?'':String(v);if(/^[ \t\r\n]*[=+\-@]/.test(t))t="'"+t;return '"'+t.replaceAll('"','""')+'"';};
  const rows=c.result.options.map(o=>{const m=financingMetrics(o.preview);return[o.id,o.name,c.result.source.version,o.preview.inputs.asOfDate,m.grantNeed,m.combinedNeed,m.combinedGap,m.combinedPeak,m.endBalance,m.protectedNeed,m.protectedGap,m.protectedEnabled,m.peakWeekly,m.weeklyHours,m.overloadedDays,m.issueCount];});
  return '\uFEFF'+[header,...rows].map(r=>r.map(quote).join(',')).join('\r\n')+'\r\n';
}
export async function completeFinancingSources(state,current,fetchBytes){
  const s=await verifyFinancingState(state,current),cache=new Map();
  for(const c of s.comparisons)for(const a of c.attachments)cache.set(a.id+':'+a.sha256,a);
  for(const c of s.comparisons)for(const meta of c.context.sources){const key=meta.id+':'+meta.sha256;
    if(!cache.has(key)){const raw=await fetchBytes(meta);need(raw instanceof Uint8Array&&raw.length===meta.bytes&&await financingSha(raw)===meta.sha256,'The selected original source bytes are unavailable or changed: '+meta.filename);cache.set(key,{id:meta.id,bytes:meta.bytes,sha256:meta.sha256,dataBase64:encodeWorkbookBytes(raw)});}
    if(!c.attachments.some(a=>a.id===meta.id))c.attachments.push(clone(cache.get(key)));
  }
  return verifyFinancingState(s,current,{complete:true});
}
export async function financingFile(state,current,{forCase=false}={}){
  const s=await verifyFinancingState(state,current,{complete:!forCase});need(!s.pendingSource,'Recover the exact pending study source request before creating another saved study.');
  // Sources are retained separately in the same native case. Portable downloads include each byte.
  if(forCase)for(const c of s.comparisons)c.attachments=[];
  return {schema:FINANCING_FILE_SCHEMA,sourceMode:forCase?'CASE_RETAINED':'COMPLETE',exportedAt:now(),study:s};
}
export async function receiveFinancingFile(value,current){
  need(object(value)&&value.schema===FINANCING_FILE_SCHEMA&&['COMPLETE','CASE_RETAINED'].includes(value.sourceMode)&&date(value.exportedAt),'Choose the complete financing study file.');
  if(value.study?.caseId!==current.program.id){
    const original=value.study;
    need(current.program.origin?.programId===original?.caseId&&current.plan.contentSha256===original.planContentSha256,
      'Receive this study through its actual original native case ancestry; do not rebind it to another case.');
    need(!original.pendingSource,'Recover the original pending study request in its original case before receiving into a new case.');
    const sourceCurrent={program:{id:original.caseId,origin:original.originCaseId?{programId:original.originCaseId}:null},plan:{contentSha256:original.planContentSha256}};
    const checked=await verifyFinancingState(original,sourceCurrent,{complete:value.sourceMode==='COMPLETE'});
    const received={...checked,...binding(current),origins:[...(checked.origins||[]),{...binding(sourceCurrent),receivedAt:now(),studySha256:await financingSha(checked)}]};
    return verifyFinancingState(received,current,{complete:value.sourceMode==='COMPLETE'});
  }
  return verifyFinancingState(value.study,current,{complete:value.sourceMode==='COMPLETE'});
}
export async function financingSource(state,current){
  const file=await financingFile(state,current,{forCase:true}),bytes=new TextEncoder().encode(JSON.stringify(file,null,2)+'\n');
  need(bytes.length<=8*1024*1024,'The complete study is larger than the original 8 MiB source allowance. Download it intact; retain a smaller separately named study to attach to the case.');
  return {filename:state.id+'-r'+state.revision+'.json',mediaType:'application/json',bytes:bytes.length,sha256:await financingSha(bytes),dataBase64:encodeWorkbookBytes(bytes)};
}
export function validateFinancingJournal(j,state,current){
  keys(j,['stage','source','request','receipt','startedAt'],'study source continuation');need(['PENDING','SAVED'].includes(j.stage)&&date(j.startedAt),'Retain the original source request stage.');
  const r=j.request,s=j.source;need(object(s)&&typeof s.filename==='string'&&s.mediaType==='application/json'&&hash.test(s.sha256||'')&&Number.isSafeInteger(s.bytes)&&s.bytes>0&&s.bytes<=8*1024*1024&&typeof s.dataBase64==='string','Retain the complete study source.');
  need(object(r)&&r.action==='source.add'&&Number.isSafeInteger(r.expectedVersion)&&r.expectedVersion>0&&typeof r.requestId==='string'&&r.requestId&&typeof r.actor==='string'&&r.actor.trim()&&typeof r.note==='string'&&r.note.trim()&&same(r.data,{filename:s.filename,contentBase64:s.dataBase64,kind:'other',mediaType:s.mediaType,sourceUrl:'',observedAt:j.startedAt}),'Retain the exact original study source command.');
  if(j.stage==='SAVED')need(/^source-[a-f0-9]{32}$/.test(j.receipt?.id||'')&&Number.isSafeInteger(j.receipt?.version)&&j.receipt.sha256===s.sha256,'Retain the saved study receipt.');
  return clone(j);
}
