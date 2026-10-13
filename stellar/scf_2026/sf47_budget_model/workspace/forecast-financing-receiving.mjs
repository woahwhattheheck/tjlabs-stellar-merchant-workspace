// MIT. Original Accounts/Forecast supplied-page course. No launcher or financial writer.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {inflateRawSync} from 'node:zlib';

export const SCHEMA='stellar-forge.forecast-financing-receiving.v1';
const LIMIT=320*1024*1024, INPUT_LIMIT=8*1024*1024;
const need=(v,m)=>{if(!v)throw Error(m);};
const clone=v=>JSON.parse(JSON.stringify(v));
function canonical(v){
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 if(v!==null&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
 need(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v),'Retain complete ordinary JSON values');
 return JSON.stringify(v);
}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const same=(a,b)=>canonical(a)===canonical(b);
const encoded=v=>Buffer.from(JSON.stringify(v,null,2)+'\n','utf8');
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/, HASH=/^[a-f0-9]{64}$/;
function identity(s,label){need(typeof s==='string'&&ID.test(s),'Retain '+label);}
function rawSaved(v){const r=clone(v);delete r.current;return r;}
async function exists(file){try{const s=await fs.lstat(file);need(s.isFile()&&!s.isSymbolicLink(),'Use the exact ordinary receiving file');return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function syncDir(dir){const f=await fs.open(dir,'r');try{await f.sync();}finally{await f.close();}}
async function durable(file,bytes,{replace=false}={}){
 need(Buffer.byteLength(bytes)<=LIMIT,'Complete receiving artifact exceeds the explicit bound');
 const temporary=file+'.writing-'+crypto.randomUUID(),fd=await fs.open(temporary,'wx',0o600);
 try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}
 try{
  if(replace)await fs.rename(temporary,file);
  else try{await fs.link(temporary,file);}catch(e){if(e.code!=='EEXIST')throw e;need(sha(await fs.readFile(file))===sha(bytes),'The existing complete artifact differs: '+path.basename(file));}
  await syncDir(path.dirname(file));
 }finally{await fs.unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function readJSON(file){return JSON.parse(await fs.readFile(file,'utf8'));}
function pointer(value,key){
 need(key.startsWith('/'),'Expected values use explicit JSON pointers');
 return key.slice(1).split('/').reduce((v,k)=>{k=k.replace(/~1/g,'/').replace(/~0/g,'~');need(v!==null&&typeof v==='object'&&Object.hasOwn(v,k),'Expected native field is absent: '+key);return v[k];},value);
}
function assertions(value,expected={},absent=[]){
 for(const [p,wanted]of Object.entries(expected))need(same(pointer(value,p),wanted),'Native saved value differs at '+p);
 for(const p of absent){let found=true;try{pointer(value,p);}catch{found=false;}need(!found,'Native disabled/legacy report unexpectedly calculates '+p);}
}
function absolute(origin,url){const u=new URL(url,origin);need(u.origin===origin,'Keep all reads on the supplied original origin');return u.href;}
async function api(page,origin,url){
 const r=await page.request.get(absolute(origin,url),{headers:{'Cache-Control':'no-store'}});
 need(r.ok(),'Original read failed ('+r.status()+'): '+url);return r.json();
}
async function staff(page,input){
 need(new URL(page.url()).origin===input.origin,'The supplied page left its original origin');
 const s=await api(page,input.origin,'/api/staff/session');
 need(s.authenticated&&s.installationId===input.staff.installationId&&s.principal?.id===input.staff.staffId,'Restore the same original authenticated operator and installation');
 if(s.principal.id!=='owner')need(s.principal.actor===input.actor,'Keep the exact original recording actor');
 return {installationId:s.installationId,staffId:s.principal.id,actor:s.principal.actor,role:s.principal.role};
}
async function history(page,input,programId=input.programId){
 const rows=[],seen=new Set;let after=0;
 while(true){const p=await api(page,input.origin,'/api/operations/'+programId+'/history?after='+after+'&limit=200');need(Array.isArray(p.events),'Original history page missing');
  for(const e of p.events){need(Number.isSafeInteger(e.version)&&e.version>after&&!seen.has(e.version),'Original history did not advance');seen.add(e.version);rows.push(e);}
  if(p.nextAfter===null)return rows;
  need(Number.isSafeInteger(p.nextAfter)&&p.nextAfter>after,'Original history cursor did not advance');after=p.nextAfter;
 }
}
// This bounded reader verifies the original native ZIP and its own complete manifest.
// It does not extract paths or alter archive bytes.
function nativeZIP(raw){
 need(Buffer.isBuffer(raw)&&raw.length<=LIMIT,'Use the complete bounded native ZIP');
 let end=-1;for(let i=raw.length-22;i>=Math.max(0,raw.length-65557);i--)if(raw.readUInt32LE(i)===0x06054b50&&i+22+raw.readUInt16LE(i+20)===raw.length){end=i;break;}
 need(end>=0,'Native ZIP central directory is missing');
 const count=raw.readUInt16LE(end+10),offset=raw.readUInt32LE(end+16),size=raw.readUInt32LE(end+12);
 need(raw.readUInt16LE(end+4)===0&&raw.readUInt16LE(end+6)===0&&raw.readUInt16LE(end+8)===count&&count>0&&count<20000&&offset+size===end,'Unsupported complete ZIP directory');
 let at=offset,total=0;const files=new Map;
 for(let n=0;n<count;n++){
  need(at+46<=end&&raw.readUInt32LE(at)===0x02014b50,'Native ZIP directory entry missing');
  const flags=raw.readUInt16LE(at+8),method=raw.readUInt16LE(at+10),compressed=raw.readUInt32LE(at+20),expanded=raw.readUInt32LE(at+24),nameLen=raw.readUInt16LE(at+28),extra=raw.readUInt16LE(at+30),comment=raw.readUInt16LE(at+32),local=raw.readUInt32LE(at+42);
  need(!(flags&1)&&[0,8].includes(method)&&at+46+nameLen+extra+comment<=end,'Unsupported native ZIP entry');
  const name=raw.subarray(at+46,at+46+nameLen).toString('utf8');need(name&&!name.startsWith('/')&&!name.includes('\\')&&!name.split('/').some(p=>!p||p==='.'||p==='..')&&!files.has(name),'Native ZIP has ambiguous paths');
  total+=expanded;need(total<=LIMIT&&local+30<=offset&&raw.readUInt32LE(local)===0x04034b50,'Native ZIP expansion or local header invalid');
  const ln=raw.readUInt16LE(local+26),le=raw.readUInt16LE(local+28),start=local+30+ln+le;
  need(raw.subarray(local+30,local+30+ln).toString('utf8')===name&&raw.readUInt16LE(local+8)===method&&start+compressed<=offset,'Native ZIP member identity differs');
  const packed=raw.subarray(start,start+compressed),body=method===0?Buffer.from(packed):inflateRawSync(packed,{maxOutputLength:expanded+1});
  need(body.length===expanded,'Native ZIP member size differs');files.set(name,body);at+=46+nameLen+extra+comment;
 }
 need(at===end&&files.has('MANIFEST.json'),'Native ZIP complete manifest missing');
 const manifest=JSON.parse(files.get('MANIFEST.json').toString('utf8'));need(Array.isArray(manifest.files)&&manifest.files.length===files.size-1,'Native ZIP manifest does not cover its full payload');
 const named=new Set;for(const d of manifest.files){const b=files.get(d.path);need(d.path!=='MANIFEST.json'&&!named.has(d.path)&&b&&b.length===d.bytes&&sha(b)===d.sha256,'Native ZIP payload differs from its exact manifest: '+d.path);named.add(d.path);}
 return {files,manifest,inventory:[...files].map(([name,b])=>({name,bytes:b.length,sha256:sha(b)}))};
}
function csvRows(bytes){
 const text=bytes.toString('utf8'),rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=c;}
  else if(c==='"'&&cell==='')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'){row.push(cell.endsWith('\r')?cell.slice(0,-1):cell);rows.push(row);row=[];cell='';}else cell+=c;}
 need(!quoted,'Complete native CSV is unfinished');if(cell||row.length){row.push(cell);rows.push(row);}const headers=rows.shift()||[];need(new Set(headers).size===headers.length,'Native CSV repeats columns');
 return rows.map(r=>{need(r.length===headers.length,'Native CSV row shape changed');return Object.fromEntries(headers.map((h,i)=>[h,r[i]]));});
}
function inspectForecastZIP(raw,saved){
 const z=nativeZIP(raw),forecast=JSON.parse(z.files.get('forecast.json')?.toString('utf8')||'null');
 need(same(forecast,rawSaved(saved)),'Complete native Forecast export differs from saved source');
 const funding=saved.report.customerFunding;
 if(funding){need(same(JSON.parse(z.files.get('customer-funding.json')?.toString('utf8')||'null'),funding),'Full protection JSON differs');
  if(funding.enabled){
   const days=csvRows(z.files.get('customer-funding-daily.csv')),customers=csvRows(z.files.get('customer-funding-obligations.csv'));
   need(days.length===funding.days.length&&customers.length===funding.customerDays.length,'Complete protection CSV omits rows');
   for(let i=0;i<days.length;i++)need(days[i].date===funding.days[i].date&&days[i].reservedCustomerFundsUsd===String(funding.days[i].reservedCustomerFundsUsd??''),'Native daily export changed');
   for(let i=0;i<customers.length;i++)need(customers[i].commercialId===funding.customerDays[i].commercialId&&customers[i].date===funding.customerDays[i].date&&same(JSON.parse(customers[i].eventIds),funding.customerDays[i].eventIds),'Native customer movement export changed');
  }
 }else need(!z.files.has('customer-funding.json'),'Legacy Forecast acquired an unrequested policy');
 return z.inventory;
}
async function context(page,input,programId=input.programId){
 const c=await api(page,input.origin,'/api/operations/'+programId);
 need(c.program.id===programId&&c.plan.contentSha256===input.planContentSha256,'Keep the exact original case and plan');
 return c;
}
async function ownDirectory(directory){
 const dir=path.resolve(directory);const s=await fs.lstat(dir);need(s.isDirectory()&&!s.isSymbolicLink(),'Parent must supply its existing declared receiving directory');return dir;
}
async function journal(directory,input){
 const dir=await ownDirectory(directory),fingerprint=sha(canonical(input)),intent=path.join(dir,'FINANCING_INTENT.json'),file=path.join(dir,'FINANCING_PROGRESS.json');
 await durable(intent,encoded({schema:SCHEMA,inputSha256:fingerprint,input}));
 const progress=await exists(file)?await readJSON(file):{schema:SCHEMA,operationId:input.operationId,inputSha256:fingerprint,phases:[],pending:null,completedResult:null};
 need(progress.schema===SCHEMA&&progress.operationId===input.operationId&&progress.inputSha256===fingerprint,'Keep this complete original receiving operation');
 async function save(){await durable(file,encoded(progress),{replace:true});}
 async function artifact(name,bytes){
  identity(name,'a relative receiving artifact name');const target=path.join(dir,name);await durable(target,bytes);
  return {name,bytes:bytes.length,sha256:sha(bytes)};
 }
 async function verify(a){identity(a.name,'the original artifact name');const b=await fs.readFile(path.join(dir,a.name));need(b.length===a.bytes&&sha(b)===a.sha256,'Retained receiving bytes changed: '+a.name);return b;}
 async function phase(id,fn){
  const prior=progress.phases.find(p=>p.id===id);if(prior){for(const a of prior.result.artifacts||[])await verify(a);return prior.result;}
  need(!progress.pending||progress.pending.id===id,'Receive the preceding original phase first');
  progress.pending ||= {id,startedAt:new Date().toISOString()};await save();
  const result=await fn(progress.pending);progress.phases.push({id,completedAt:new Date().toISOString(),result});progress.pending=null;await save();return result;
 }
 return {dir,fingerprint,progress,save,artifact,verify,phase};
}
async function download(page,J,name,action){
 const target=path.join(J.dir,name);if(await exists(target)){const b=await fs.readFile(target);return {descriptor:{name,bytes:b.length,sha256:sha(b)},bytes:b};}
 const awaiting=page.waitForEvent('download');await action();const d=await awaiting,temporary=path.join(J.dir,'.download-'+crypto.randomUUID());
 try{await d.saveAs(temporary);const s=await fs.stat(temporary);need(s.size<=LIMIT,'Full native download exceeds the receiving bound');const b=await fs.readFile(temporary);return {descriptor:await J.artifact(name,b),bytes:b};}
 finally{await fs.unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function shot(page,J,name,width){
 if(width)await page.setViewportSize({width,height:900});const target=path.join(J.dir,name);
 if(await exists(target)){const b=await fs.readFile(target);return {name,bytes:b.length,sha256:sha(b)};}
 return J.artifact(name,await page.screenshot({fullPage:true}));
}
async function working(page,J,name){
 const d=await download(page,J,name,()=>page.locator('[data-forecast-action="download-working"]').click());
 const value=JSON.parse(d.bytes.toString('utf8'));need(value.schema==='stellar-forge.forecast-working-session.v1','Keep the original complete working file');return {...d,value};
}

function validateInput(input){
 need(input?.schema===SCHEMA,'Use the complete original financing receiving input');
 identity(input.operationId,'the original receiving operation');
 need(input.browserPlacement==='isolated-cloud','Continue the selected original isolated-cloud browser');
 const u=new URL(input.origin);need(u.origin===input.origin&&['http:','https:'].includes(u.protocol),'Retain the original origin');
 need(/^operation-[a-f0-9]{32}$/.test(input.programId)&&/^operation-[a-f0-9]{32}$/.test(input.originalProgramId),'Retain original and received case identities');
 need(HASH.test(input.planContentSha256)&&HASH.test(input.baseline?.cashSha256),'Retain the original plan and cash identities');
 need(input.staff?.staffId&&input.staff?.installationId&&input.actor?.trim(),'Bind the actual original staff and installation');
 need(Array.isArray(input.baseline.forecasts)&&input.baseline.forecasts.length,'Retain all original immutable Forecasts');
 need(Array.isArray(input.servedSources)&&input.servedSources.length>=5,'Pin the complete actual served financing source');
 const required=['/forecast.mjs','/forecast-financing.mjs','/forecast-financing-desk.mjs','/forecast-financing-decision.mjs','/forecast-financing.css'];
 need(required.every(url=>input.servedSources.filter(p=>new URL(p.url,input.origin).pathname===url).length===1),'Bind each actual served financing source exactly once');
 for(const p of input.servedSources)need(HASH.test(p.sha256)&&Number.isSafeInteger(p.bytes)&&p.bytes>0&&new URL(p.url,input.origin).origin===input.origin,'Retain every served source identity');
 need(Array.isArray(input.options)&&input.options.length>=2&&input.options.length<=12,'Supply complete explicitly authored alternatives');
 const ids=new Set;for(const o of input.options){identity(o.key,'each authored option key');need(!ids.has(o.key)&&o.name?.trim()&&o.name.length<=160&&typeof o.note==='string'&&o.inputs&&Buffer.byteLength(canonical(o.inputs))<=INPUT_LIMIT,'Retain distinct complete option inputs and notes');ids.add(o.key);}
 need(ids.has(input.adoptOptionKey),'Explicitly select the authored option to review and save');
 need(input.initialWorkingSha256===null||HASH.test(input.initialWorkingSha256),'Bind the actual initial working file or require a clean saved original');
 return input;
}
export function prepareFinancingReceivingInput({fundingInput,sourcePins,initialWorkingSha256=null,adoptOptionKey}){
 need(fundingInput?.schema==='stellar-forge.forecast-customer-funding-receiving.v1'&&fundingInput.scenarios?.length>=2,'Use the unchanged original funding preparer output');
 need(Array.isArray(sourcePins)&&sourcePins.length,'Supply actual selected full installed source pins');
 const input={schema:SCHEMA,operationId:fundingInput.operationId+'-financing',browserPlacement:fundingInput.browserPlacement,
  origin:fundingInput.origin,pageURL:fundingInput.pageURL,programId:fundingInput.programId,originalProgramId:fundingInput.originalProgramId,
  planContentSha256:fundingInput.planContentSha256,staff:clone(fundingInput.staff),actor:fundingInput.actor,
  originalArchive:clone(fundingInput.originalArchive),baseline:clone(fundingInput.baseline),installedSourcePins:clone(sourcePins),
  servedSources:sourcePins.filter(p=>['forecast.mjs','forecast-financing.mjs','forecast-financing-desk.mjs','forecast-financing-decision.mjs','forecast-financing.css'].includes(p.path.split('/').at(-1))).map(p=>({url:'/'+p.path.split('/').at(-1),bytes:p.bytes,sha256:p.sha256})),
  initialWorkingSha256,options:fundingInput.scenarios.map(s=>({key:s.id,name:s.id,note:'Authored original-v32 planning sensitivity; no observed cash or accepted customer term is created.',inputs:clone(s.inputs)})),
  adoptOptionKey:adoptOptionKey||fundingInput.scenarios[0].id};
 return validateInput(input);
}
export function financingWorkingSha256(value){const v=clone(value);delete v.savedAt;return sha(canonical(v));}
async function verifySources(page,input){
 for(const pin of input.servedSources){const r=await page.request.get(absolute(input.origin,pin.url),{headers:{'Cache-Control':'no-store'}});need(r.ok(),'Served source unavailable: '+pin.url);const b=await r.body();need(b.length===pin.bytes&&sha(b)===pin.sha256,'Served source changed: '+pin.url);}
}
async function ready(page,input,programId=input.programId){
 await staff(page,input);
 const selected=page.locator('select[name=caseSelect]');need(await selected.count()&&await selected.inputValue()===programId,'The original owner must leave the declared case selected; preserve another case and its draft');
 await page.locator('[data-forecast-action=download-working]').waitFor({state:'visible'});
 await page.waitForFunction(()=>{const b=document.querySelector('[data-forecast-action=download-working]'),r=document.querySelector('.operating-forecast');return b&&!b.disabled&&r?.getAttribute('aria-busy')!=='true';});
 need(await page.locator('[data-forecast-financing] [data-financing-action=download-local]').count(),'Open the current complete Financing options desk');
 const actor=page.locator('[name=recordingActor]');if(await actor.count())need(await actor.inputValue()===input.actor,'Keep the actual declared recording actor');
 await context(page,input,programId);
}
async function observe(page,input,J,{programId=input.programId,label='custody'}={}){
 await ready(page,input,programId);
 const awaiting=page.waitForEvent('download');await page.locator('[data-forecast-action=download-working]').click();
 const d=await awaiting,tmp=path.join(J.dir,'.working-'+crypto.randomUUID());let b;
 try{await d.saveAs(tmp);need((await fs.stat(tmp)).size<=LIMIT,'Retain a complete bounded working file');b=await fs.readFile(tmp);}finally{await fs.unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 const value=JSON.parse(b.toString('utf8'));
 need(value.schema==='stellar-forge.forecast-working-session.v1'&&value.caseId===programId&&value.planContentSha256===input.planContentSha256,'The full original working identity changed');
 const artifact=await J.artifact('working-'+sha(b)+'.json',b),identity=financingWorkingSha256(value);
 J.progress.custody ||= [];if(!J.progress.custody.some(x=>x.artifact.name===artifact.name))J.progress.custody.push({artifact,identity,label,programId});
 await J.save();return {value,artifact,identity};
}
function withoutPrior(value){const v=clone(value);delete v.savedAt;delete v.previousWorking;return v;}
async function explicitRestoration(J,value,expected){
 if(financingWorkingSha256(value)===financingWorkingSha256(expected))return true;
 const copy=clone(value);copy.previousWorking=clone(expected.previousWorking??null);
 if(financingWorkingSha256(copy)!==financingWorkingSha256(expected)||!value.previousWorking)return false;
 for(const item of J.progress.custody||[]){const old=JSON.parse((await J.verify(item.artifact)).toString('utf8'));
  if(same(withoutPrior(old),withoutPrior(value.previousWorking)))return true;}
 return false;
}
async function remember(page,input,J,label){const o=await observe(page,input,J,{label});J.progress.allowed ||= [];if(!J.progress.allowed.includes(o.identity))J.progress.allowed.push(o.identity);await J.save();return o;}
async function guard(page,input,J,{initial=false,command=null,programId=input.programId,restored=false}={}){
 const o=await observe(page,input,J,{programId,label:'before-step'}),v=o.value,p=v.financing?.pendingSource;
 const before=J.progress.pending?.beforeWorking||J.progress.initialWorking;
 const help=' The complete current editor is retained as '+o.artifact.name+'.'+(before?' Preserve that file, then explicitly reopen '+before.name+' to resume the original phase.':' Return to a clean selected original Forecast or supply its exact initial working digest.');
 need(!v.pendingWorkbook,'Finish the original workbook request first.'+help);
 if(v.saveRequest||p){
  const request=v.saveRequest||p.request;need(command&&same(command,request),'An unrelated native request is pending.'+help);
  if(J.progress.pending?.pendingWorking){const retained=JSON.parse((await J.verify(J.progress.pending.pendingWorking)).toString('utf8'));
   if(p?.stage==='SAVED'&&!same(p,retained.financing?.pendingSource)){const q=clone(v),old=clone(retained);q.financing.pendingSource=old.financing.pendingSource;need(financingWorkingSha256(q)===financingWorkingSha256(old),'Preserve the changed pending editor.'+help);}
   else need(await explicitRestoration(J,v,retained),'Preserve the changed pending editor.'+help);
  }return o;
 }
 if(restored){need(!v.editing&&v.selectedId&&!v.financing?.options?.length,'Restored inspection requires a clean already selected saved Forecast and an empty financing desk.'+help);return o;}
 if(command){
  const events=(await history(page,input,programId)).filter(e=>e.requestId===command.requestId);
  if(events.length===1&&J.progress.pending?.pendingWorking){
   const event=events[0],expected=JSON.parse((await J.verify(J.progress.pending.pendingWorking)).toString('utf8')),actual=clone(v);
   need(event.action===command.action&&event.actor===command.actor&&event.version===command.expectedVersion+1,'Original accepted request identity changed');
   if(command.action==='forecast.save'){
    need(actual.selectedId===event.recordId&&!actual.editing&&!actual.saveRequest,'Reopen the exact accepted Forecast before continuing.'+help);
    expected.selectedId=event.recordId;expected.editing=false;expected.saveRequest=null;
   }else{
    const j=expected.financing.pendingSource,rs=actual.financing?.sourceReceipts||[],last=rs.at(-1);
    need(!actual.financing?.pendingSource&&last?.status==='SAVED'&&last.id===event.recordId&&last.version===event.version&&last.sha256===j.source.sha256&&last.filename===j.source.filename&&last.requestId===command.requestId,'Reopen the exact accepted study-source result before continuing.'+help);
    expected.financing.pendingSource=null;expected.financing.sourceReceipts.push(clone(last));expected.financing.revision=actual.financing.revision;
   }
   let matches=await explicitRestoration(J,actual,expected);
   if(!matches&&command.action==='forecast.save'&&actual.previousWorking&&same(withoutPrior(actual.previousWorking),withoutPrior(expected))&&!actual.editing&&!(actual.financing?.options?.length||actual.financing?.comparisons?.length))matches=true;
   need(matches,'The accepted result has later unrelated editor changes.'+help);
   J.progress.allowed ||= [];J.progress.allowed.push(o.identity);await J.save();return o;
  }
 }
 const pending=J.progress.pending,previous=J.progress.phases.at(-1)?.result;
 const targets=[pending?.localResult?.working,pending?.beforeWorking,...(pending?.intermediateWorking||[]),previous?.working,previous?.initialWorking,J.progress.phases.length?null:J.progress.initialWorking].filter(Boolean);
 let known=false;
 for(const artifact of targets){const expected=JSON.parse((await J.verify(artifact)).toString('utf8'));if(await explicitRestoration(J,v,expected)){known=true;break;}}
 if(initial){if(input.initialWorkingSha256)need(o.identity===input.initialWorkingSha256,'The declared initial editor differs.'+help);
  else need(!v.editing&&input.baseline.forecasts.some(x=>x.id===v.selectedId)&&!(v.financing?.options?.length||v.financing?.comparisons?.length),'Begin at a clean original saved Forecast or declare its full initial working digest.'+help);
 }else need(known,'An unrelated or unrecorded intermediate editor is open.'+help);
 return o;
}
async function step(page,input,J,id,work){
 return J.phase(id,async pending=>{
  const before=await guard(page,input,J,{command:pending.command});
  if(!pending.beforeWorking){pending.beforeWorking=before.artifact;await J.save();}
  if(pending.localResult){
   for(const a of pending.localResult.artifacts||[])await J.verify(a);
   const accepted=JSON.parse((await J.verify(pending.localResult.working)).toString('utf8'));
   need(await explicitRestoration(J,before.value,accepted),'The phase already completed. Preserve '+before.artifact.name+' and reopen the exact accepted '+pending.localResult.working.name+' before continuing; no phase is replayed.');
   return pending.localResult;
  }
  const result=await work(pending,before.value),after=await observe(page,input,J,{label:'completed-'+id});
  const complete={...result,working:after.artifact,workingSha256:after.identity,artifacts:[...(result.artifacts||[]),before.artifact,after.artifact]};
  J.progress.allowed ||= [];if(!J.progress.allowed.includes(after.identity))J.progress.allowed.push(after.identity);
  pending.localResult=complete;await J.save();return complete;
 });
}
async function click(page,input,selector){await page.locator(selector).click();await ready(page,input);}
const action=name=>'[data-financing-action="'+name+'"]';
async function fill(page,selector,value){await page.locator(selector).fill(String(value));await page.locator(selector).dispatchEvent('change');}
async function importInputs(page,input,J,option){
 if(!await page.locator('[data-forecast-form]').count())await click(page,input,'[data-forecast-action=reforecast]');
 const wait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/operations/'+input.programId+'/forecast-preview'&&r.request().method()==='POST');
 await page.locator('[data-forecast-input-file]').setInputFiles({name:option.key+'.json',mimeType:'application/json',buffer:Buffer.from(canonical(option.inputs))});
 const r=await wait;need(r.ok(),'Original native preview rejected the complete authored option');const preview=await r.json();await ready(page,input);
 need(HASH.test(preview.previewSha256),'Retain the original native preview');
 return preview;
}
async function retainedWorking(page,input){
 return page.evaluate(async({programId,staff})=>{const {createForecastDraftStore}=await import('/forecast-workbook-host.mjs');const store=createForecastDraftStore('sf47.forecast-working.'+programId+':staff:'+staff.installationId+':'+staff.staffId);try{return await store.read();}finally{await store.close();}},{programId:input.programId,staff:input.staff});
}
async function sourceBytes(page,input,meta,programId=input.programId){
 const r=await page.request.get(absolute(input.origin,'/api/operations/'+programId+'/sources/'+meta.id),{headers:{'Cache-Control':'no-store'}});need(r.ok(),'Original source is unavailable');
 const b=await r.body();need(b.length===meta.bytes&&sha(b)===meta.sha256,'Original source bytes changed: '+meta.filename);return b;
}
async function nativeCommand(page,input,J,pending,{actionName,button,recoveryButton,validate}){
 const url=absolute(input.origin,'/api/operations/'+input.programId+'/command');
 const route=async r=>{try{
  const b=r.request().postDataJSON();need(r.request().method()==='POST'&&b.action===actionName&&b.actor===input.actor,'Keep the exact original command');await validate(b);
  await staff(page,input);
  if(pending.command)need(same(pending.command,b),'The original native request changed');
  else {const local=await retainedWorking(page,input),request=actionName==='source.add'?local?.financing?.pendingSource?.request:local?.saveRequest;
   need(same(request,b),'The original editor did not retain this complete request before dispatch');
   pending.command=clone(b);pending.pendingWorking=await J.artifact('pending-'+sha(canonical(b))+'.json',encoded(local));await J.save();}
  await r.continue();
 }catch(e){pending.dispatchError=e.message;await J.save();await r.abort('blockedbyclient');}};
 await page.route(url,route);
 try{
  let rows=await history(page,input),found=pending.command?rows.filter(e=>e.requestId===pending.command.requestId):[];
  need(found.length<=1,'Original request has more than one event');
  if(!found.length){
   if(pending.command){const local=await retainedWorking(page,input),q=actionName==='source.add'?local?.financing?.pendingSource?.request:local?.saveRequest;
    if(!q){await guard(page,input,J,{command:pending.command});await page.locator('[data-forecast-working-file]').setInputFiles({name:'Original_Pending.json',mimeType:'application/json',buffer:await J.verify(pending.pendingWorking)});await ready(page,input);}
    else need(same(q,pending.command),'An unrelated request is pending');
   }
   const waiting=page.waitForResponse(r=>r.url()===url&&r.request().method()==='POST');
   await page.locator(pending.command?recoveryButton:button).click();const reply=await waiting;need(reply.ok(),'Original command returned '+reply.status()+'; preserve and reconcile its exact request');
   pending.receipt=await reply.json();await J.save();await ready(page,input);rows=await history(page,input);found=rows.filter(e=>e.requestId===pending.command.requestId);
  }
  need(found.length===1,'Accepted original request is not yet in its native history');const event=found[0],command=pending.command;
  need(event.action===actionName&&event.actor===command.actor&&event.version===command.expectedVersion+1,'Accepted event does not match its retained original command');
  const local=await retainedWorking(page,input),q=actionName==='source.add'?local?.financing?.pendingSource?.request:local?.saveRequest;
  if(q){need(same(q,command),'Preserve a later unrelated native request');await click(page,input,recoveryButton);}
  await ready(page,input);
  // A saved-selection remount may retain the complete accepted editor in Previous working.
  // Restore only that actual retained edition after verifying every original field.
  if(actionName==='forecast.save'){
   const seen=await observe(page,input,J,{label:'native-forecast-accepted'}),prior=seen.value.previousWorking;
   const expected=JSON.parse((await J.verify(pending.pendingWorking)).toString('utf8'));
   expected.saveRequest=null;expected.editing=false;expected.selectedId=event.recordId;
   if(prior&&same(withoutPrior(prior),withoutPrior(expected))&&seen.value.selectedId===event.recordId&&!seen.value.editing&&!seen.value.saveRequest&&!seen.value.pendingWorkbook&&!seen.value.financing?.pendingSource&&!(seen.value.financing?.options?.length||seen.value.financing?.comparisons?.length)){
    const bytes=encoded(prior);pending.acceptedPrevious=await J.artifact('accepted-previous-'+sha(bytes)+'.json',bytes);await J.save();
    await page.locator('[data-forecast-working-file]').setInputFiles({name:'Accepted_Original_Working.json',mimeType:'application/json',buffer:bytes});await ready(page,input);
    const restored=await observe(page,input,J,{label:'accepted-study-restored'});need(await explicitRestoration(J,restored.value,prior),'The accepted original working edition did not reopen');
    J.progress.allowed ||= [];J.progress.allowed.push(restored.identity);pending.intermediateWorking ||= [];pending.intermediateWorking.push(restored.artifact);await J.save();
   }
  }
  return {event,command:clone(command),receipt:pending.receipt||null};
 }finally{await page.unroute(url,route);}
}

function phaseResult(J,id){const r=J.progress.phases.find(x=>x.id===id)?.result;need(r,'Complete the original phase '+id);return r;}
async function studyWorking(page,input,J){const w=await observe(page,input,J,{label:'study-result'});need(w.value.financing,'The original working file omitted its financing study');return w.value.financing;}
function cents(value){need(typeof value==='string'&&/^\d+(?:\.\d{1,2})?$/.test(value),'Use an actual known nonnegative native cash result');const [a,b='']=value.split('.');return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));}
function decimal(c){need(c>=0n,'A one-cent lower boundary is unavailable at zero');return (c/100n).toString()+'.'+(c%100n).toString().padStart(2,'0');}
async function openFinancingTab(page,input,tab){await click(page,input,action('tab-'+tab));}
async function showOption(page,input,id){
 await openFinancingTab(page,input,'options');
 const search=page.locator('[data-financing-search]');await search.fill('');await search.dispatchEvent('change');
 while(await page.locator(action('previous')).isEnabled())await click(page,input,action('previous'));
 for(let n=0;n<26;n++){if(await page.locator(action('archive')+'[data-option="'+id+'"]').count())return;
  need(await page.locator(action('next')).isEnabled(),'The original option is absent from the complete study');await click(page,input,action('next'));}
 throw Error('The original bounded option list did not terminate');
}
async function verifyStudy(page,input,file,{programId=input.programId,complete=false}={}){
 const c=await context(page,input,programId);
 return page.evaluate(async({file,current,complete})=>{
  const m=await import('/forecast-financing.mjs');const s=await m.receiveFinancingFile(file,current);
  await m.verifyFinancingState(s,current,{complete});return s;
 },{file,current:c,complete});
}
async function downloadStudy(page,input,J,name){
 const d=await download(page,J,name,()=>page.locator(action('download')).click());const file=JSON.parse(d.bytes.toString('utf8'));
 const s=await verifyStudy(page,input,file,{complete:true});
 need(file.sourceMode==='COMPLETE','The full study must retain complete source bytes');const sources=[];
 for(const comparison of s.comparisons)for(const a of comparison.attachments){
  const meta=comparison.context.sources.find(x=>x.id===a.id),raw=Buffer.from(a.dataBase64,'base64');
  need(raw.length===meta.bytes&&sha(raw)===meta.sha256,'Complete study source changed');
  if(!sources.some(x=>x.id===meta.id&&x.sha256===meta.sha256)){const artifact=await J.artifact('study-source-'+meta.id+'-'+meta.sha256,raw);sources.push({...meta,artifact});}
 }
 return {file,study:s,descriptor:d.descriptor,sources,artifacts:[d.descriptor,...sources.map(s=>s.artifact)]};
}
export async function receiveFinancingOptions({page,directory,input}){
 validateInput(input);need(page&&typeof page.route==='function','Use the original supplied page');
 const J=await journal(directory,input),final=path.join(J.dir,'FINANCING_COMPLETE.json');
 if(await exists(final)){const r=await readJSON(final);need(r.inputSha256===J.fingerprint,'Completed input changed');await verifyArtifacts(J,r);return r;}
 if(J.progress.completedResult){await verifyArtifacts(J,J.progress.completedResult);await durable(final,encoded(J.progress.completedResult));return J.progress.completedResult;}
 await verifySources(page,input);await ready(page,input);
 await J.phase('original-financing-source',async p=>{
  const original=await guard(page,input,J,{initial:!p.beforeWorking});
  if(!p.beforeWorking){p.beforeWorking=original.artifact;J.progress.initialWorking=original.artifact;J.progress.allowed=[original.identity];await J.save();}
  const c=await context(page,input);
  need(c.program.id===input.originalProgramId||c.program.origin?.programId===input.originalProgramId,'Use the original v32 case or its actual direct receiver');
  need(c.program.version>=input.baseline.caseVersion&&sha(canonical(c.records.cash))===input.baseline.cashSha256,'The original observed cash or case lineage differs');
  const saved=[],sources=[],artifacts=[original.artifact];
  for(const pin of input.baseline.forecasts){const f=rawSaved(await api(page,input.origin,'/api/operations/'+input.programId+'/forecasts/'+pin.id));need(f.sha256===pin.sha256,'Original immutable Forecast changed');saved.push(f);}
  for(const meta of c.sources){const b=await sourceBytes(page,input,meta);const artifact=await J.artifact('original-'+meta.id,b);sources.push({...meta,artifact});artifacts.push(artifact);}
  artifacts.push(await J.artifact('original-financing-case.json',encoded(c)),await J.artifact('original-financing-forecasts.json',encoded(saved)));
  return {case:c,forecasts:saved,sources,initialWorking:original.artifact,initialStudy:clone(original.value.financing),staff:await staff(page,input),artifacts};
 });
 for(const option of input.options){
  await step(page,input,J,'import-'+option.key,async()=>{
   const preview=await importInputs(page,input,J,option);
   return {preview,artifacts:[await J.artifact(option.key+'-original-preview.json',encoded(preview))]};
  });
  await step(page,input,J,'capture-'+option.key,async()=>{
   await fill(page,'[data-financing-field=nameDraft]',option.name);await fill(page,'[data-financing-field=noteDraft]',option.note);
   await click(page,input,action('capture'));const s=await studyWorking(page,input,J),o=s.options.find(x=>x.id===s.selectedId);
   need(o&&o.name===option.name&&same(o.capture.inputs,phaseResult(J,'import-'+option.key).preview.inputs),'Captured option lost its original full inputs');
   return {studyId:s.id,optionId:o.id,capture:clone(o),artifacts:[await J.artifact(option.key+'-captured.json',encoded(o))]};
  });
 }
 await step(page,input,J,'replace-original-option-with-retained-history',async()=>{
  const first=input.options[0],captured=phaseResult(J,'capture-'+first.key);await importInputs(page,input,J,first);
  await page.locator('[data-financing-select=option]').selectOption(captured.optionId);
  await fill(page,'[data-financing-field=nameDraft]',first.name);await fill(page,'[data-financing-field=noteDraft]',first.note+' Complete same-input replacement; original capture retained.');
  await showOption(page,input,captured.optionId);await click(page,input,action('replace')+'[data-option="'+captured.optionId+'"]');
  const s=await studyWorking(page,input,J),o=s.options.find(x=>x.id===captured.optionId);
  need(o&&o.previous.some(x=>same(x.capture,captured.capture.capture)&&x.name===captured.capture.name)&&same(o.capture.inputs,captured.capture.capture.inputs),'Replacement lost the full preceding capture or authored inputs');
  return {option:o,artifacts:[await J.artifact('option-complete-replacement-history.json',encoded(o))]};
 });
 await step(page,input,J,'complete-options-comparison',async()=>{
  const waiting=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/operations/'+input.programId+'/forecast-options-preview'&&r.request().method()==='POST');
  await page.locator(action('compare')).click();const reply=await waiting;need(reply.ok(),'Original complete batch comparison failed');const native=await reply.json();await ready(page,input);
  const s=await studyWorking(page,input,J),c=s.comparisons.find(x=>x.id===s.selectedComparisonId);
  need(c&&same(c.result,native),'The desk did not retain the complete original native batch');
  for(const option of input.options)need(c.request.options.some(x=>x.id===phaseResult(J,'capture-'+option.key).optionId),'An authored option is absent from the full comparison');
  const csv=await download(page,J,'Financing_Comparison.csv',()=>page.locator(action('download-csv')).click());
  const json=await download(page,J,'Financing_Comparison.json',()=>page.locator(action('comparison-json')).click());need(same(JSON.parse(json.bytes),c),'The full comparison download changed');
  const artifacts=[csv.descriptor,json.descriptor,await J.artifact('native-financing-comparison.json',encoded(c)),await shot(page,J,'options-comparison-desktop.png',1440),await shot(page,J,'options-comparison-narrow.png',390)];
  await page.setViewportSize({width:1440,height:1000});return {comparison:c,artifacts};
 });
 await step(page,input,J,'partial-planning-limits',async()=>{
  await openFinancingTab(page,input,'decision');await fill(page,'[data-financing-decision=cashLimit]','0.');
  await fill(page,'[data-financing-decision=name]','Retained unfinished planning limit');
  const partial=await observe(page,input,J,{label:'partial-limits'});
  need(partial.value.financing?.decision?.draft.cashLimit==='0.','The original raw partial limit was lost');
  // Record this exact recovery selection before the ordinary page reload.
  J.progress.allowed.push(partial.identity);J.progress.pending.intermediateWorking ||= [];J.progress.pending.intermediateWorking.push(partial.artifact);await J.save();await page.reload({waitUntil:'domcontentloaded'});await ready(page,input);await guard(page,input,J);
  await openFinancingTab(page,input,'decision');need(await page.locator('[data-financing-decision=cashLimit]').inputValue()==='0.','Reload did not preserve the complete unfinished criterion');
  return {artifacts:[partial.artifact,await shot(page,J,'planning-partial-narrow.png',390)]};
 });
 const comparison=phaseResult(J,'complete-options-comparison').comparison;
 const chosenId=phaseResult(J,'capture-'+input.adoptOptionKey).optionId,chosen=comparison.result.options.find(x=>x.id===chosenId);
 const actualNeed=chosen.preview.report.scenarios.commercial.additionalCashNeededUsd;
 const limits=[
  {key:'known-boundary',name:'Actual native starting-cash boundary',cashBasis:'COMMERCIAL',cashMeasure:'STARTING',cashLimit:actualNeed===null?'':actualNeed,weeklyLimit:'',overloadLimit:'',note:'Explicit receiving criterion read from this original native report; no cash or commercial term changed.'},
  ...(actualNeed!==null&&cents(actualNeed)>0n?[{key:'one-cent-below',name:'One cent below the native starting need',cashBasis:'COMMERCIAL',cashMeasure:'STARTING',cashLimit:decimal(cents(actualNeed)-1n),weeklyLimit:'',overloadLimit:'',note:'Deliberate boundary assessment of the same complete native comparison.'}]:[]),
  {key:'extra-after-opening',name:'Extra funding with original opening assumptions',cashBasis:'COMMERCIAL',cashMeasure:'EXTRA',cashLimit:actualNeed===null?'0.00':actualNeed,weeklyLimit:'',overloadLimit:'',note:'Original unknown opening amounts remain unresolved; zero tolerance here is an explicitly authored planning criterion.'},
  {key:'protected-customer-money',name:'Protected customer money under original attribution',cashBasis:'PROTECTED',cashMeasure:'STARTING',cashLimit:actualNeed===null?'0.00':actualNeed,weeklyLimit:'',overloadLimit:'',note:'Original enabled, disabled and unknown attribution results remain distinct.'}
 ];
 if(actualNeed===null){const k=limits.findIndex(x=>x.key==='known-boundary');limits.splice(k,1);}
 for(const criteria of limits){
  await step(page,input,J,'assess-'+criteria.key,async()=>{
   await openFinancingTab(page,input,'decision');
   for(const [key,v]of Object.entries(criteria))if(key!=='key'){const selector='[data-financing-decision="'+key+'"]';if(key==='cashBasis'||key==='cashMeasure')await page.locator(selector).selectOption(v);else await fill(page,selector,v);}
   await click(page,input,action('decision-evaluate'));const s=await studyWorking(page,input,J),a=s.decision?.assessments.find(x=>x.id===s.decision.selectedId);
   const wanted={...criteria};delete wanted.key;need(a&&same(a.criteria,wanted)&&a.comparisonId===comparison.id&&a.report.rows.length===comparison.result.options.length,'Assessment did not retain every actual native option and its exact criteria');
   const csv=await download(page,J,criteria.key+'-assessment.csv',()=>page.locator(action('decision-csv')).click());
   const json=await download(page,J,criteria.key+'-assessment.json',()=>page.locator(action('decision-json')).click());need(same(JSON.parse(json.bytes),a),'The complete assessment export differs');
   return {assessment:a,artifacts:[csv.descriptor,json.descriptor,await shot(page,J,criteria.key+'-desktop.png',1440),await shot(page,J,criteria.key+'-narrow.png',390)]};
  });
 }
 await step(page,input,J,'criteria-reuse-and-full-study-reopen',async()=>{
  await openFinancingTab(page,input,'decision');await fill(page,'[data-financing-decision=cashLimit]','12.');
  await fill(page,'[data-financing-decision=note]','Unfinished alternative retained before explicit reuse.');
  const before=await studyWorking(page,input,J);await click(page,input,action('decision-reuse'));
  const after=await studyWorking(page,input,J);need(after.decision.draftHistory.length===before.decision.draftHistory.length+1,'Displaced unfinished criteria were not retained');
  const complete=await downloadStudy(page,input,J,'Financing_Complete_Study_Before_Adoption.json');
  // Reopening validates the same complete file through the original UI; its displaced study download is preserved too.
  const previous=page.waitForEvent('download');await page.locator('[data-financing-file]').setInputFiles({name:'Complete_Financing_Study.json',mimeType:'application/json',buffer:encoded(complete.file)});
  const d=await previous,tmp=path.join(J.dir,'.displaced-'+crypto.randomUUID());let b;try{await d.saveAs(tmp);b=await fs.readFile(tmp);}finally{await fs.unlink(tmp).catch(()=>{});}
  await ready(page,input);const reopened=await studyWorking(page,input,J);
  need(same(reopened,complete.study),'Complete study reopen changed its retained source, options or assessments');
  return {studySha256:sha(canonical(reopened)),artifacts:[...complete.artifacts,await J.artifact('displaced-financing-study.json',b)]};
 });
 await step(page,input,J,'archive-and-restore-course-options',async()=>{
  await openFinancingTab(page,input,'options');const ids=input.options.map(o=>phaseResult(J,'capture-'+o.key).optionId);
  for(const id of ids){await showOption(page,input,id);await click(page,input,action('archive')+'[data-option="'+id+'"]');}
  const archived=await studyWorking(page,input,J);need(ids.every(id=>archived.options.find(o=>o.id===id)?.archived)&&archived.comparisons.some(c=>c.id===comparison.id),'Archive did not preserve original comparison');
  const artifacts=[await shot(page,J,'archived-options.png',1440)];
  for(const id of ids){await showOption(page,input,id);await click(page,input,action('archive')+'[data-option="'+id+'"]');}
  return {artifacts};
 });
 await step(page,input,J,'review-and-adopt-original-option',async()=>{
  await openFinancingTab(page,input,'decision');
  const a=phaseResult(J,'assess-'+limits[0].key).assessment;await page.locator('[data-financing-select=decision]').selectOption(a.id);
  await click(page,input,action('decision-adopt')+'[data-option="'+chosenId+'"]');
  const before=await observe(page,input,J,{label:'before-explicit-adoption'});
  const artifacts=[before.artifact,await shot(page,J,'review-option-before-after.png',1440)];
  // Exercise the actual stale-review guard without writing a financial record.
  const name=page.locator('[data-forecast-form] [name=name]');await name.fill('Receiving: changed editor after review');await name.dispatchEvent('input');
  await click(page,input,action('apply'));
  const rejected=await observe(page,input,J,{label:'explicit-stale-review'});
  need(rejected.value.financing.adoptions.length===before.value.financing.adoptions.length&&await name.inputValue()==='Receiving: changed editor after review','A stale review adopted or replaced the changed original editor');
  need((await page.locator('[data-financing-status]').textContent()).includes('changed'),'The original stale-review explanation is absent');
  artifacts.push(rejected.artifact,await shot(page,J,'stale-option-review-error.png',390));
  await importInputs(page,input,J,input.options.find(o=>o.key===input.adoptOptionKey));
  await openFinancingTab(page,input,'decision');await page.locator('[data-financing-select=decision]').selectOption(a.id);
  await click(page,input,action('decision-adopt')+'[data-option="'+chosenId+'"]');
  await click(page,input,action('apply'));const after=await studyWorking(page,input,J),last=after.adoptions.at(-1);
  need(last?.optionId===chosenId&&last.decisionId===a.id&&same(last.after.inputs,chosen.preview.inputs),'Explicit adoption lost its original assessed option or normalized input');
  return {adoption:last,artifacts};
 });
 await step(page,input,J,'save-original-adopted-forecast',async p=>{
  if(!p.command){
   const wait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/operations/'+input.programId+'/forecast-preview'&&r.request().method()==='POST');
   await page.locator('[data-forecast-form] button[type=submit]').click();const reply=await wait;need(reply.ok(),'Original adopted preview failed');p.preview=await reply.json();await J.save();await ready(page,input);
  }
  const accepted=await nativeCommand(page,input,J,p,{actionName:'forecast.save',button:'[data-forecast-action=save]',recoveryButton:'[data-forecast-action=recover-save]',validate:b=>need(same(b.data?.inputs,p.preview.inputs)&&b.data.expectedPreviewSha256===p.preview.previewSha256,'Save differs from the retained complete original preview')});
  const saved=rawSaved(await api(page,input.origin,'/api/operations/'+input.programId+'/forecasts/'+accepted.event.recordId));
  need(saved.sha256===accepted.event.after.sha256&&saved.previewSha256===accepted.command.data.expectedPreviewSha256&&same(saved.inputs,accepted.command.data.inputs),'Accepted Forecast differs from original request');
  return {...accepted,saved,artifacts:[await J.artifact('financing-adopted-forecast.json',encoded(saved))]};
 });
 await step(page,input,J,'save-complete-study-with-original-case',async p=>{
  if(!p.command){await fill(page,'[data-financing-field=note]','Original financing receiving: retained complete planning alternatives, native comparisons and explicit assessments. No financial observation or agreement created.');p.studyBeforeSave=await studyWorking(page,input,J);await J.save();}
  const accepted=await nativeCommand(page,input,J,p,{actionName:'source.add',button:action('save-source'),recoveryButton:action('resume-source'),validate:b=>{
   need(b.data?.kind==='other'&&typeof b.data.contentBase64==='string','Retain the complete original study source');
   const bytes=Buffer.from(b.data.contentBase64,'base64'),f=JSON.parse(bytes.toString('utf8')),expected=clone(p.studyBeforeSave);
   for(const c of expected.comparisons)c.attachments=[];
   need(bytes.length<=8*1024*1024&&f.schema==='stellar-forge.forecast-financing.v1.file'&&f.sourceMode==='CASE_RETAINED'&&same(f.study,expected)&&b.data.filename===expected.id+'-r'+expected.revision+'.json'&&b.data.mediaType==='application/json','The complete saved-study command differs from its retained original study');
  }});
  const c=await context(page,input),meta=c.sources.find(s=>s.id===accepted.event.recordId);need(meta,'The accepted study source is absent');
  const b=await sourceBytes(page,input,meta),file=JSON.parse(b);need(file.study?.schema==='stellar-forge.forecast-financing.v1','Retain the full original saved study');
  return {...accepted,source:meta,study:file.study,artifacts:[await J.artifact('Saved_Financing_Study.json',b)]};
 });
 await step(page,input,J,'full-financing-delivery',async()=>{
  const complete=await downloadStudy(page,input,J,'Financing_Complete_Study.json'),c=await context(page,input),original=phaseResult(J,'original-financing-source');
  need(same(c.records.cash,original.case.records.cash),'The planning course changed actual observed cash');
  const forecast=phaseResult(J,'save-original-adopted-forecast').saved;
  await page.waitForFunction(({id,sha})=>document.querySelector('[data-forecast-selection]')?.value===id&&document.querySelector('[data-forecast-report]')?.textContent.includes(sha),{id:forecast.id,sha:forecast.sha256});
  const json=await download(page,J,'Adopted_Forecast.json',()=>page.locator('[data-forecast-action=export-json]').click());need(same(JSON.parse(json.bytes),forecast),'Original Forecast download differs');
  const zip=await download(page,J,'Adopted_Forecast.zip',()=>page.locator('[data-forecast-action=export-forecast]').click());const forecastInventory=inspectForecastZIP(zip.bytes,forecast);
  const caseZip=await download(page,J,'Financing_Complete_Case.zip',()=>page.locator('[data-ops-action=export]').click()),unpacked=nativeZIP(caseZip.bytes),doc=JSON.parse(unpacked.files.get('operations.json'));
  need(doc.program.id===input.programId&&same(doc.records.cash,original.case.records.cash),'Original full case differs');
  for(const old of [...original.forecasts,forecast])need(same(doc.forecasts.find(f=>f.id===old.id),old),'Full case lost an immutable Forecast');
  for(const s of [...original.sources,phaseResult(J,'save-complete-study-with-original-case').source]){const b=unpacked.files.get('sources/'+s.id);need(b&&b.length===s.bytes&&sha(b)===s.sha256,'Full case lost original source bytes');}
  const events=await history(page,input);for(const id of ['save-original-adopted-forecast','save-complete-study-with-original-case']){const r=phaseResult(J,id),matching=events.filter(e=>e.requestId===r.command.requestId);need(matching.length===1&&same(matching[0],r.event),'Original request was repeated or altered');}
  await openFinancingTab(page,input,'decision');const artifacts=[...complete.artifacts,json.descriptor,zip.descriptor,caseZip.descriptor,await J.artifact('Financing_Complete_History.json',encoded(events)),await shot(page,J,'final-planning-desktop.png',1440),await shot(page,J,'final-planning-narrow.png',390)];
  await page.setViewportSize({width:1440,height:1000});
  return {study:complete.study,source:phaseResult(J,'save-complete-study-with-original-case').source,caseVersion:doc.program.version,forecastInventory,caseInventory:unpacked.inventory,artifacts};
 });
 const result={schema:SCHEMA,operationId:input.operationId,inputSha256:J.fingerprint,completedAt:J.progress.phases.at(-1).completedAt,
  phases:J.progress.phases,custody:J.progress.custody||[],renderedInspection:'Captured for producing-peer OPEN/LOOK/USE of exact desktop/narrow app and every complete attachment; capture and source checks alone are not rendered acceptance.',
  independentReceive:'The same original native parent receives Financing_Complete_Case.zip and invokes inspectFinancingOptions on that actual received case; no new case is created by this callback.'};
 J.progress.completedResult=result;await J.save();await durable(final,encoded(result));return result;
}
async function verifyArtifacts(J,result){for(const p of result.phases)for(const a of p.result.artifacts||[])await J.verify(a);for(const a of result.custody||[])await J.verify(a.artifact);}
function receivedStudyMatches(actual,verified,file,programId){
 const expected=clone(verified);
 if(programId!==file.study.caseId){
  const a=actual?.origins?.at(-1),e=expected.origins?.at(-1);
  if(!a||!e||!Number.isFinite(Date.parse(a.receivedAt)))return false;
  e.receivedAt=a.receivedAt;
 }
 return same(actual,expected);
}
export async function inspectFinancingOptions({page,directory,input,priorResult,programId=input.programId}){
 validateInput(input);const J=await journal(directory,input),first=await readJSON(path.join(J.dir,'FINANCING_COMPLETE.json'));
 need(same(priorResult,first)&&first.inputSha256===J.fingerprint,'Use the exact first completed financing result');await verifyArtifacts(J,first);
 const final=path.join(J.dir,'FINANCING_RESTORED.json'),statePath=path.join(J.dir,'FINANCING_RESTORED_PROGRESS.json'),firstSha=sha(encoded(first));
 const checkResult=async r=>{need(r.programId===programId&&r.originalResultSha256===firstSha&&r.inputSha256===J.fingerprint,'Keep the original restored result');for(const a of r.artifacts)await J.verify(a);return r;};
 if(await exists(final))return checkResult(await readJSON(final));
 let R=await exists(statePath)?await readJSON(statePath):null;
 if(R){need(R.programId===programId&&R.originalResultSha256===firstSha&&R.inputSha256===J.fingerprint,'Keep the original independent receiving identity');if(R.completedResult){await checkResult(R.completedResult);await durable(final,encoded(R.completedResult));return R.completedResult;}}
 await verifySources(page,input);await ready(page,input,programId);
 const before=await observe(page,input,J,{programId,label:'restored-before'}),v=before.value;
 need(!v.editing&&!v.saveRequest&&!v.pendingWorkbook&&!v.financing?.pendingSource&&v.selectedId,'Restored inspection requires an already selected clean saved Forecast; the complete current file is '+before.artifact.name);
 const c=await context(page,input,programId),original=phaseResult(J,'original-financing-source');
 need(programId===input.programId||c.program.origin?.programId===input.programId,'Keep the actual original case receiver ancestry');
 need(same(c.records.cash,original.case.records.cash),'Original cash observations changed on receive');
 const forecast=phaseResult(J,'save-original-adopted-forecast').saved;
 need([...original.forecasts,forecast].some(f=>f.id===v.selectedId),'Select an original or exact accepted Forecast for independent inspection');
 for(const f of [...original.forecasts,forecast])need(same(rawSaved(await api(page,input.origin,'/api/operations/'+programId+'/forecasts/'+f.id)),f),'An immutable Forecast changed in the received case');
 const saved=phaseResult(J,'save-complete-study-with-original-case'),sources=[];
 for(const meta of [...original.sources,saved.source]){const b=await sourceBytes(page,input,meta,programId);sources.push({id:meta.id,bytes:b.length,sha256:sha(b)});}
 const file=JSON.parse((await J.verify(saved.artifacts.find(x=>x.name==='Saved_Financing_Study.json'))).toString('utf8'));
 const verified=await verifyStudy(page,input,file,{programId});
 if(!R){
  need(!(v.financing?.options?.length||v.financing?.comparisons?.length),'The current restored financing study is unrelated; preserve '+before.artifact.name+' and explicitly select a clean saved view');
  R={schema:SCHEMA+'.restore-progress',programId,originalResultSha256:firstSha,inputSha256:J.fingerprint,beforeWorking:before.artifact,completedResult:null};
  await durable(statePath,encoded(R),{replace:true});
 }else{
  const originalBefore=JSON.parse((await J.verify(R.beforeWorking)).toString('utf8')),copy=clone(v);copy.financing=clone(originalBefore.financing);
  need(financingWorkingSha256(copy)===financingWorkingSha256(originalBefore),'The restored Forecast has unrelated editing; preserve '+before.artifact.name);
 }
 let work=before;
 if(!receivedStudyMatches(v.financing,verified,file,programId)){
  const originalBefore=JSON.parse((await J.verify(R.beforeWorking)).toString('utf8'));
  need(financingWorkingSha256(v)===financingWorkingSha256(originalBefore),'The restored study changed after its original intake; preserve '+before.artifact.name);
  // Local source reception only. Re-entry recognizes its exact accepted postimage before another import.
  await page.locator('[data-financing-select=source]').selectOption(saved.source.id);
  await page.locator(action('receive-source')).click();await ready(page,input,programId);
  work=await observe(page,input,J,{programId,label:'restored-study-readonly'});
 }
 const received=work.value.financing;
 need(receivedStudyMatches(received,verified,file,programId),'Restored study differs from its complete original source and actual native case lineage');
 const originalBefore=JSON.parse((await J.verify(R.beforeWorking)).toString('utf8')),envelope=clone(work.value);envelope.financing=clone(originalBefore.financing);
 need(financingWorkingSha256(envelope)===financingWorkingSha256(originalBefore),'Independent study reception changed unrelated working state');
 R.acceptedWorking=work.artifact;R.studySha256=sha(canonical(received));await durable(statePath,encoded(R),{replace:true});
 await page.locator(action('tab-decision')).click();await ready(page,input,programId);
 const result={schema:SCHEMA+'.restored',operationId:input.operationId,inputSha256:J.fingerprint,originalResultSha256:firstSha,programId,originalProgramId:input.programId,
  source:saved.source,studySha256:R.studySha256,sources,working:work.artifact,readOnlyNative:true,
  artifacts:[R.beforeWorking,work.artifact,await shot(page,J,'restored-financing-desktop.png',1440),await shot(page,J,'restored-financing-narrow.png',390)]};
 R.completedResult=result;await durable(statePath,encoded(R),{replace:true});await durable(final,encoded(result));return result;
}


// Following artifact-only receiving. The complete original prefix and journals remain unchanged.
import {pathToFileURL as handoverFileURL} from 'node:url';
export const HANDOVER_RECEIVING_SCHEMA='stellar-forge.forecast-financing-handover-receiving.v1';
const HANDOVER_LIMIT=512*1024*1024;
const HANDOVER_SOURCES=['/forecast.mjs','/forecast-financing.mjs','/forecast-financing-desk.mjs','/forecast-financing-decision.mjs','/forecast-financing.css','/forecast-financing-handover.mjs'];
function handoverPhase(first,id){const p=first.phases?.find(x=>x.id===id);need(p?.result,'Retain completed original phase '+id);return p.result;}
function handoverSelections(study){const rows=[{key:'comparison',comparisonId:study.selectedComparisonId,assessmentId:null}],a=study.decision?.assessments?.find(x=>x.id===study.decision.selectedId);if(a)rows.push({key:'assessment',comparisonId:a.comparisonId,assessmentId:a.id});return rows;}
export function prepareFinancingHandoverInput({input,priorResult,sourcePins}){
 validateInput(input);need(priorResult?.schema===SCHEMA&&priorResult.inputSha256===sha(canonical(input)),'Select the exact completed financing course');
 const study=handoverPhase(priorResult,'full-financing-delivery').study;
 const value={schema:HANDOVER_RECEIVING_SCHEMA,operationId:input.operationId+'-handover',originalInputSha256:priorResult.inputSha256,
  originalResultSha256:sha(encoded(priorResult)),studySha256:sha(canonical(study)),selections:handoverSelections(study),
  servedSources:sourcePins.map(p=>({url:p.url||'/'+p.path.split('/').at(-1),bytes:p.bytes,sha256:p.sha256})).filter(p=>HANDOVER_SOURCES.includes(p.url))};
 return validateHandoverInput(value,input,priorResult);
}
function validateHandoverInput(v,input,first){
 const study=handoverPhase(first,'full-financing-delivery').study;
 need(v?.schema===HANDOVER_RECEIVING_SCHEMA&&v.operationId===input.operationId+'-handover','Keep the original artifact continuation');
 need(v.originalInputSha256===sha(canonical(input))&&v.originalResultSha256===sha(encoded(first))&&v.studySha256===sha(canonical(study)),'Keep original input/result/study bytes');
 need(study.selectedComparisonId&&same(v.selections,handoverSelections(study)),'Use the actual retained comparison and assessment');
 need(Array.isArray(v.servedSources)&&v.servedSources.length===6,'Pin all six current served sources');
 for(const url of HANDOVER_SOURCES)need(v.servedSources.filter(p=>p.url===url&&HASH.test(p.sha256)&&Number.isSafeInteger(p.bytes)&&p.bytes>0).length===1,'Retain exact current source '+url);
 return v;
}
async function handoverWrite(file,bytes,{replace=false}={}){
 need(Buffer.byteLength(bytes)<=HANDOVER_LIMIT,'Complete handover exceeds 512 MiB');
 const tmp=file+'.writing-'+crypto.randomUUID(),fd=await fs.open(tmp,'wx',0o600);
 try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}
 try{if(replace)await fs.rename(tmp,file);else try{await fs.link(tmp,file);}catch(e){if(e.code!=='EEXIST')throw e;need((await fs.readFile(file)).equals(bytes),'Existing handover differs: '+path.basename(file));}await syncDir(path.dirname(file));}
 finally{await fs.unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function handoverJournal(directory,binding){
 const dir=await ownDirectory(directory),fingerprint=sha(canonical(binding)),file=path.join(dir,'HANDOVER_PROGRESS.json');
 await handoverWrite(path.join(dir,'HANDOVER_INTENT.json'),encoded({schema:HANDOVER_RECEIVING_SCHEMA,bindingSha256:fingerprint,binding}));
 const progress=await exists(file)?await readJSON(file):{schema:HANDOVER_RECEIVING_SCHEMA,bindingSha256:fingerprint,phases:[],pending:null,custody:[],completedResult:null};
 need(progress.schema===HANDOVER_RECEIVING_SCHEMA&&progress.bindingSha256===fingerprint,'Keep the original full handover selection');
 async function save(){await handoverWrite(file,encoded(progress),{replace:true});}
 async function artifact(name,bytes){identity(name,'the complete artifact filename');await handoverWrite(path.join(dir,name),bytes);return{name,bytes:bytes.length,sha256:sha(bytes)};}
 async function verify(a){identity(a.name,'the original artifact filename');const s=await fs.lstat(path.join(dir,a.name));need(s.isFile()&&!s.isSymbolicLink()&&s.size<=HANDOVER_LIMIT,'Keep a complete ordinary artifact');const b=await fs.readFile(path.join(dir,a.name));need(b.length===a.bytes&&sha(b)===a.sha256,'Retained handover changed: '+a.name);return b;}
 return{dir,fingerprint,progress,save,artifact,verify};
}
async function handoverDownload(page,H,name,trigger){
 const target=path.join(H.dir,name);if(await exists(target)){const b=await fs.readFile(target);need(b.length<=HANDOVER_LIMIT,'Keep complete bounded download');return{bytes:b,descriptor:{name,bytes:b.length,sha256:sha(b)}};}
 const waiting=page.waitForEvent('download',{timeout:120000});await trigger();const d=await waiting;need(!(await d.failure()),'Original download failed');
 const tmp=path.join(H.dir,'.download-'+crypto.randomUUID());
 try{await d.saveAs(tmp);need((await fs.stat(tmp)).size<=HANDOVER_LIMIT,'Complete download exceeds 512 MiB');const b=await fs.readFile(tmp);return{bytes:b,descriptor:await H.artifact(name,b)};}
 finally{await fs.unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
function handoverJSON(bytes){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
function handoverEmbedded(bytes){
 const html=new TextDecoder('utf-8',{fatal:true}).decode(bytes),m=[...html.matchAll(/<script id="financing-handover-data" type="application\/json">([\s\S]*?)<\/script>/g)];
 need(m.length===1,'Keep the exact offline data block');const embedded=JSON.parse(m[0][1]);need(typeof embedded.study==='string','Keep complete embedded study text');return{html,embedded,file:JSON.parse(embedded.study)};
}
function handoverCSV(bytes){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,''),rows=[];let row=[],cell='',quoted=false,ended=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;ended=true;}}else cell+=c;}
  else if(c==='"'&&!cell&&!ended)quoted=true;
  else if(c===','){row.push(cell);cell='';ended=false;}
  else if(c==='\r'&&text[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';ended=false;i++;}
  else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell='';ended=false;}
  else{need(!ended,'Unexpected data after CSV cell');cell+=c;}}
 need(!quoted,'Complete CSV is unfinished');if(cell||row.length||ended){row.push(cell);rows.push(row);}
 const headers=rows.shift()||[];need(new Set(headers).size===headers.length,'CSV repeats columns');for(const r of rows)need(r.length===headers.length,'CSV omits a cell');return{headers,rows:rows.length};
}
async function verifyHandoverSelection(page,input,file,selection,selected,expectedStudy,current){
 need(file.schema==='stellar-forge.forecast-financing.v1.file'&&file.sourceMode==='COMPLETE'&&same(file.study,expectedStudy),'Retain the exact complete original study');
 need(selection.schema==='stellar-forge.forecast-financing-handover.v1'&&selection.studyId===expectedStudy.id&&selection.studyRevision===expectedStudy.revision&&selection.comparisonId===selected.comparisonId&&selection.assessmentId===selected.assessmentId,'Original handover selection changed');
 const c=expectedStudy.comparisons.find(x=>x.id===selected.comparisonId);need(c&&same(c.result.source,selection.source)&&c.result.sha256===selection.comparisonSha256,'Native comparison identity changed');
 need(selection.baselineId===(c.result.options.find(x=>x.id===expectedStudy.baselineId)||c.result.options[0]).id,'Retained reference option changed');
 need(file.exportedAt===selection.exportedAt&&Number.isFinite(Date.parse(selection.exportedAt)),'Keep the actual export instant');
 const expected=await page.evaluate(async({file,selection,current})=>{
  const F=await import('/forecast-financing.mjs'),M=await import('/forecast-financing-handover.mjs'),s=await F.receiveFinancingFile(file,current);
  await F.verifyFinancingState(s,current,{complete:true});
  const h=await M.buildFinancingHandover(s,current,{comparisonId:selection.comparisonId,assessmentId:selection.assessmentId,baselineId:selection.baselineId,exportedAt:selection.exportedAt});
  return{selection:h.selection,manifest:h.manifest,htmlSha256:await F.financingSha(h.html),zipBytes:h.bytes.length,zipSha256:await F.financingSha(h.bytes)};
 },{file,selection,current});
 need(same(expected.selection,selection),'Exported selection/current-context hash differs');return expected;
}
async function verifyHandoverArchive(page,input,H,raw,selected,expectedStudy,current){
 const z=handoverZIP(raw),selection=handoverJSON(z.files.get('selection.json')),file=handoverJSON(z.files.get('study.json'));
 need(same(z.manifest.selection,selection),'Archive selects another study');
 const expected=await verifyHandoverSelection(page,input,file,selection,selected,expectedStudy,current);
 need(raw.length===expected.zipBytes&&sha(raw)===expected.zipSha256,'Complete ZIP bytes differ from the original deterministic native export');
 need(same(expected.manifest,z.manifest),'Every complete native CSV/JSON/source member must match the selected original study');
 const c=expectedStudy.comparisons.find(x=>x.id===selected.comparisonId);
 need(same(handoverJSON(z.files.get('comparison.json')),c),'Original comparison changed');
 need(same(handoverJSON(z.files.get('assessments.json')),(expectedStudy.decision?.assessments||[]).filter(a=>a.comparisonId===c.id)),'Original assessments changed');
 const csv=[],artifacts=[];
 for(const [name,bytes]of z.files){
  if(name.endsWith('.json'))handoverJSON(bytes);if(name.endsWith('.csv'))csv.push({path:name,...handoverCSV(bytes)});
  const a=await H.artifact(selected.key+'-member-'+sha(name).slice(0,16)+'-'+path.basename(name),bytes);artifacts.push({...a,memberPath:name});
 }
 const index=handoverJSON(z.files.get('source-index.json'));let count=0;
 for(const comparison of expectedStudy.comparisons)for(const a of comparison.attachments){
  count++;const meta=comparison.context.sources.find(x=>x.id===a.id),entry=index.find(x=>x.comparisonId===comparison.id&&x.id===a.id),b=z.files.get('sources/'+a.sha256+'.bin');
  need(entry&&entry.path==='sources/'+a.sha256+'.bin'&&entry.bytes===meta.bytes&&entry.sha256===meta.sha256&&b&&b.equals(Buffer.from(a.dataBase64,'base64')),'Source bytes or original comparison relationship changed');
 }
 need(index.length===count,'Source index omitted or repeated an original edition');
 const embedded=handoverEmbedded(z.files.get('report.html'));
 need(same(embedded.file,file)&&same(embedded.embedded.selection,selection),'Archive HTML and complete study differ');
 need(same(embedded.embedded.manifest,{...z.manifest,files:z.manifest.files.filter(x=>x.path!=='report.html')}),'HTML source inventory differs');
 return{selection,file,manifest:z.manifest,inventory:z.inventory,csv,artifacts};
}
async function handoverOriginal(directory,input,priorResult){
 validateInput(input);const dir=await ownDirectory(directory),first=await readJSON(path.join(dir,'FINANCING_COMPLETE.json')),intent=await readJSON(path.join(dir,'FINANCING_INTENT.json'));
 need(same(first,priorResult)&&first.inputSha256===sha(canonical(input))&&same(intent.input,input)&&intent.inputSha256===first.inputSha256,'Keep original financing intent/result bytes');
 const J={verify:async a=>{identity(a.name,'the original artifact');const b=await fs.readFile(path.join(dir,a.name));need(b.length===a.bytes&&sha(b)===a.sha256,'Original course artifact changed: '+a.name);return b;}};
 await verifyArtifacts(J,first);return{dir,first,J,delivery:handoverPhase(first,'full-financing-delivery')};
}
function handoverReceiveMatches(actual,expected,file,programId){
 const e=clone(actual);e.financing=clone(expected.financing);
 return financingWorkingSha256(e)===financingWorkingSha256(expected)&&receivedStudyMatches(actual.financing,expected.financing,file,programId);
}
async function handoverCustody(page,input,H,programId,allowed){
 const seen=await observe(page,input,H,{programId,label:'handover-before'});
 need(!seen.value.saveRequest&&!seen.value.pendingWorkbook&&!seen.value.financing?.pendingSource,'Retain '+seen.artifact.name+' and complete the original pending request first');
 let okay=false;for(const a of allowed.filter(Boolean))if(await explicitRestoration(H,seen.value,handoverJSON(await H.verify(a)))){okay=true;break;}
 const e=H.progress.pending?.receiveExpectation;
 if(!okay&&e)okay=handoverReceiveMatches(seen.value,handoverJSON(await H.verify(e.expectedWorking)),handoverJSON(await H.verify(e.file)),programId);
 need(okay,'Preserve current editor '+seen.artifact.name+'. Explicitly reopen the exact pending-before or most recent accepted working file; no unrelated editor is replaced.');
 return seen;
}
async function handoverStep(page,input,H,programId,id,work){
 const prior=H.progress.phases.find(x=>x.id===id);if(prior){for(const a of prior.result.artifacts||[])await H.verify(a);return prior.result;}
 need(!H.progress.pending||H.progress.pending.id===id,'Complete the same original handover phase first');
 const p0=H.progress.pending,seen=await handoverCustody(page,input,H,programId,p0?[p0.beforeWorking,p0.expectedWorking,p0.localResult?.working]:[H.progress.phases.at(-1)?.result.working||H.progress.initialWorking]);
 H.progress.pending ||= {id,startedAt:new Date().toISOString(),beforeWorking:seen.artifact};await H.save();const p=H.progress.pending;
 if(p.localResult){for(const a of p.localResult.artifacts||[])await H.verify(a);need(await explicitRestoration(H,seen.value,handoverJSON(await H.verify(p.localResult.working))),'Reopen the exact already accepted local result');}
 else{
  const result=await work(p,seen),after=await observe(page,input,H,{programId,label:'handover-complete-'+id});
  if(p.receiveExpectation){const e=p.receiveExpectation;need(handoverReceiveMatches(after.value,handoverJSON(await H.verify(e.expectedWorking)),handoverJSON(await H.verify(e.file)),programId),'Preserve changed writing after study reopening');}
  else need(await explicitRestoration(H,after.value,seen.value),'Read-only artifact work encountered unrelated editing. Its complete current file is retained; reopen exact phase-before to continue.');
  p.localResult={...result,working:after.artifact,artifacts:[...(result.artifacts||[]),seen.artifact,after.artifact]};await H.save();
 }
 H.progress.phases.push({id,completedAt:new Date().toISOString(),result:p.localResult});H.progress.pending=null;await H.save();return H.progress.phases.at(-1).result;
}
async function handoverCompleted(H,file){
 const check=async r=>{need(r.bindingSha256===H.fingerprint,'Keep original accepted handover');for(const p of r.phases)for(const a of p.result.artifacts||[])await H.verify(a);for(const c of r.custody||[])await H.verify(c.artifact);return r;};
 if(await exists(file))return check(await readJSON(file));
 if(H.progress.completedResult){await check(H.progress.completedResult);await handoverWrite(file,encoded(H.progress.completedResult));return H.progress.completedResult;}
 return null;
}

async function handoverView(artifactPage,H,name,descriptor,file,selection){
 need(artifactPage&&typeof artifactPage.goto==='function','Original parent must supply a separate artifact page');
 const target=handoverFileURL(path.join(H.dir,descriptor.name)).href;
 need(artifactPage.url()==='about:blank'||artifactPage.url().startsWith(handoverFileURL(H.dir+path.sep).href),'Preserve an unrelated occupied artifact page');
 await artifactPage.goto(target,{waitUntil:'load'});
 const data=JSON.parse(await artifactPage.locator('#financing-handover-data').textContent());
 need(data.study===JSON.stringify(file)+'\n'&&same(data.selection,selection),'Opened HTML changed complete study or selection');
 const viewport=artifactPage.viewportSize(),artifacts=[];
 const capture=async(filename)=>{const b=await exists(path.join(H.dir,filename))?await fs.readFile(path.join(H.dir,filename)):await artifactPage.screenshot({fullPage:true});artifacts.push(await H.artifact(filename,b));};
 try{
  for(const width of [1440,390]){
   await artifactPage.setViewportSize({width,height:900});
   const first=file.study.comparisons.find(c=>c.id===selection.comparisonId).result.options[0];
   await artifactPage.locator('#option-filter').selectOption(first.id);
   need(await artifactPage.locator('.option:visible').count()===1,'Option filter did not select the retained option');
   await artifactPage.locator('#row-filter').fill('absent-original-row-'+selection.sha256);
   need(await artifactPage.locator('tbody tr:visible').count()===0,'Search did not produce an empty view');await capture(name+'-empty-'+width+'.png');
   await artifactPage.locator('#clear-filters').click();
   need(await artifactPage.locator('#option-filter').inputValue()===''&&await artifactPage.locator('#row-filter').inputValue()==='','Show all did not clear both filters');
   await artifactPage.locator('#expand-all').click();
   need(await artifactPage.locator('details:not([open]),tbody tr[hidden],.option[hidden]').count()===0,'Expand/show all omitted retained rows');
   await capture(name+'-'+width+'.png');
  }
  await artifactPage.locator('#print-report').click();
  const namePDF=name+'-complete-print.pdf',pdf=await exists(path.join(H.dir,namePDF))?await fs.readFile(path.join(H.dir,namePDF)):await artifactPage.pdf({printBackground:true,preferCSSPageSize:true});
  artifacts.push(await H.artifact(namePDF,pdf));
  const outgoing=await handoverDownload(artifactPage,H,name+'-embedded-study.json',()=>artifactPage.locator('#download-study').click());
  need(outgoing.bytes.equals(Buffer.from(data.study,'utf8')),'Embedded study download differs');
  return{artifacts:[...artifacts,outgoing.descriptor],studyArtifact:outgoing.descriptor};
 }finally{if(viewport)await artifactPage.setViewportSize(viewport);}
}
async function handoverReopen(page,input,H,programId,studyArtifact){
 const file=handoverJSON(await H.verify(studyArtifact)),p=H.progress.pending,original=handoverJSON(await H.verify(p.beforeWorking));
 if(!p.receiveExpectation){
  const candidate=await verifyStudy(page,input,file,{programId,complete:true}),expected=clone(original);expected.financing=candidate;
  p.expectedWorking=await H.artifact('expected-reopened-'+sha(canonical(expected))+'.json',encoded(expected));
  p.receiveExpectation={file:studyArtifact,expectedWorking:p.expectedWorking};await H.save();
 }
 need(same(p.receiveExpectation.file,studyArtifact),'Keep the same complete study reopening');
 const expected=handoverJSON(await H.verify(p.receiveExpectation.expectedWorking)),before=await observe(page,input,H,{programId,label:'before-complete-study-reopen'});
 if(!handoverReceiveMatches(before.value,expected,file,programId)){
  need(await explicitRestoration(H,before.value,original),'Preserve the unrelated editor before reopening the study');
  const waiting=page.waitForEvent('download',{timeout:120000});
  await page.locator('[data-financing-file]').setInputFiles(path.join(H.dir,studyArtifact.name));
  const d=await waiting,tmp=path.join(H.dir,'.before-study-'+crypto.randomUUID());
  try{await d.saveAs(tmp);const b=await fs.readFile(tmp);need(b.length<=LIMIT,'Keep complete bounded predecessor study');const v=handoverJSON(b);
   need(v.sourceMode==='CASE_RETAINED'&&same(v.study,original.financing),'The app did not retain the actual complete preceding study');
   p.predecessorStudy=await H.artifact('before-reopen-study-'+sha(b)+'.json',b);await H.save();
  }finally{await fs.unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  await ready(page,input,programId);
 }
 const received=await observe(page,input,H,{programId,label:'accepted-complete-study-reopen'});
 need(handoverReceiveMatches(received.value,expected,file,programId),'Reopened study changed source, criteria, unknown/zero fields or unrelated Forecast writing');
 return{studySha256:sha(canonical(received.value.financing)),reopened:received.artifact,artifacts:[studyArtifact,p.expectedWorking,...(p.predecessorStudy?[p.predecessorStudy]:[]),received.artifact]};
}
/** Append artifact receiving to the exact completed original financing course. */
export async function receiveFinancingHandover({page,artifactPage,directory,input,priorResult,handoverInput}){
 need(artifactPage!==page,'Preserve the original application page');
 const original=await handoverOriginal(directory,input,priorResult);validateHandoverInput(handoverInput,input,original.first);
 const sub=path.join(original.dir,'financing-handover');await fs.mkdir(sub,{recursive:true,mode:0o700});
 const H=await handoverJournal(sub,{input:handoverInput,programId:input.programId}),final=path.join(sub,'HANDOVER_COMPLETE.json'),done=await handoverCompleted(H,final);if(done)return done;
 await verifySources(page,{...input,servedSources:handoverInput.servedSources});await ready(page,input);
 if(!H.progress.initialWorking){
  const seen=await observe(page,input,H,{label:'handover-initial'}),expected=handoverJSON(await original.J.verify(original.delivery.working));
  need(financingWorkingSha256(seen.value)===financingWorkingSha256(expected),'Preserve '+seen.artifact.name+'; reopen the exact last completed original financing working file');
  need(!seen.value.saveRequest&&!seen.value.pendingWorkbook&&!seen.value.financing?.pendingSource,'Finish the original pending request first');
  H.progress.initialWorking=seen.artifact;H.progress.current=await context(page,input);H.progress.history=await history(page,input);await H.save();
 }
 const expectedStudy=original.delivery.study,current=H.progress.current;
 need(same(await context(page,input),current)&&same(await history(page,input),H.progress.history),'Original native case/history changed during artifact continuation');
 for(const selected of handoverInput.selections){
  await handoverStep(page,input,H,input.programId,'download-'+selected.key,async()=>{
   const before=handoverJSON(await H.verify(H.progress.pending.beforeWorking)),s=before.financing;
   need(s.selectedComparisonId===expectedStudy.selectedComparisonId&&s.decision?.selectedId===expectedStudy.decision?.selectedId,'Keep the actual original comparison/assessment selection');
   await openFinancingTab(page,input,selected.key==='assessment'?'decision':'comparison');const prefix=selected.key==='assessment'?'decision-':'';
   const zip=await handoverDownload(page,H,selected.key+'-handover.zip',()=>page.locator(action(prefix+'handover-zip')).click());await ready(page,input);
   const parsed=await verifyHandoverArchive(page,input,H,zip.bytes,selected,expectedStudy,current);
   const html=await handoverDownload(page,H,selected.key+'-handover.html',()=>page.locator(action(prefix+'handover-html')).click());await ready(page,input);
   const embedded=handoverEmbedded(html.bytes),expected=await verifyHandoverSelection(page,input,embedded.file,embedded.embedded.selection,selected,expectedStudy,current);
   need(sha(html.bytes)===expected.htmlSha256,'Actual outgoing HTML differs from the complete selected report');
   return{selection:parsed.selection,htmlSelection:embedded.embedded.selection,manifest:parsed.manifest,csv:parsed.csv,zip:zip.descriptor,html:html.descriptor,artifacts:[zip.descriptor,html.descriptor,...parsed.artifacts]};
  });
  await handoverStep(page,input,H,input.programId,'view-'+selected.key,async()=>{
   const previous=H.progress.phases.find(p=>p.id==='download-'+selected.key).result,embedded=handoverEmbedded(await H.verify(previous.html));
   return handoverView(artifactPage,H,selected.key+'-report',previous.html,embedded.file,previous.htmlSelection);
  });
 }
 await handoverStep(page,input,H,input.programId,'reopen-complete-report-study',async()=>{
  const last=handoverInput.selections.at(-1),view=H.progress.phases.find(p=>p.id==='view-'+last.key).result;
  return handoverReopen(page,input,H,input.programId,view.studyArtifact);
 });
 need(same(await context(page,input),current)&&same(await history(page,input),H.progress.history),'Artifact receiving changed original native data or history');
 const result={schema:HANDOVER_RECEIVING_SCHEMA,bindingSha256:H.fingerprint,operationId:handoverInput.operationId,originalResultSha256:handoverInput.originalResultSha256,
  programId:input.programId,completedAt:H.progress.phases.at(-1).completedAt,phases:H.progress.phases,custody:H.progress.custody,nativeMutationCount:0,
  visualInspection:'Exact outgoing report controls, populated/empty desktop+narrow captures and complete print retained. Producing owner must VIEW and inspect all actual files in normal viewers before ready.'};
 H.progress.completedResult=result;await H.save();await handoverWrite(final,encoded(result));return result;
}
/** Reopen the same outgoing files on the actual independently received original case. */
export async function inspectFinancingHandover({page,artifactPage,directory,input,priorResult,handoverInput,priorHandoverResult,programId}){
 need(artifactPage!==page,'Preserve the received application page');
 const original=await handoverOriginal(directory,input,priorResult);validateHandoverInput(handoverInput,input,original.first);
 const firstDir=path.join(original.dir,'financing-handover'),first=await readJSON(path.join(firstDir,'HANDOVER_COMPLETE.json'));
 need(same(first,priorHandoverResult)&&first.originalResultSha256===handoverInput.originalResultSha256,'Keep exact completed handover result');
 const restored=await readJSON(path.join(original.dir,'FINANCING_RESTORED.json'));
 need(restored.programId===programId&&restored.originalResultSha256===sha(encoded(original.first)),'Complete original native-case receiving first');
 const sub=path.join(firstDir,'received-'+programId);await fs.mkdir(sub,{recursive:true,mode:0o700});
 const H=await handoverJournal(sub,{input:handoverInput,programId,firstHandoverSha256:sha(encoded(first)),originalRestoredSha256:sha(encoded(restored))}),final=path.join(sub,'HANDOVER_RECEIVED.json'),done=await handoverCompleted(H,final);if(done)return done;
 await verifySources(page,{...input,servedSources:handoverInput.servedSources});await ready(page,input,programId);
 const current=await context(page,input,programId);need(programId===input.programId||current.program.origin?.programId===input.programId,'Use the actual received original case lineage');
 if(!H.progress.initialWorking){
  const seen=await observe(page,input,H,{programId,label:'handover-restored-initial'}),expected=handoverJSON(await original.J.verify(restored.working));
  need(financingWorkingSha256(seen.value)===financingWorkingSha256(expected),'Preserve '+seen.artifact.name+'; reopen the exact accepted restored working study');
  H.progress.initialWorking=seen.artifact;H.progress.current=current;H.progress.history=await history(page,input,programId);await H.save();
 }
 need(same(current,H.progress.current)&&same(await history(page,input,programId),H.progress.history),'Received case changed before artifact inspection');
 for(const phase of first.phases)for(const a of phase.result.artifacts||[]){const b=await fs.readFile(path.join(firstDir,a.name));need(b.length===a.bytes&&sha(b)===a.sha256,'Original handover artifact changed');await H.artifact(a.name,b);}
 const last=handoverInput.selections.at(-1),downloaded=first.phases.find(p=>p.id==='download-'+last.key).result;
 await handoverStep(page,input,H,programId,'received-offline-report',async()=>{const embedded=handoverEmbedded(await H.verify(downloaded.html));return handoverView(artifactPage,H,'received-report',downloaded.html,embedded.file,downloaded.htmlSelection);});
 await handoverStep(page,input,H,programId,'received-complete-study',async()=>{const view=H.progress.phases.find(p=>p.id==='received-offline-report').result;return handoverReopen(page,input,H,programId,view.studyArtifact);});
 need(same(await context(page,input,programId),H.progress.current)&&same(await history(page,input,programId),H.progress.history),'Received artifact course changed native data/history');
 const result={schema:HANDOVER_RECEIVING_SCHEMA+'.received',bindingSha256:H.fingerprint,operationId:handoverInput.operationId,programId,originalHandoverSha256:sha(encoded(first)),
  completedAt:H.progress.phases.at(-1).completedAt,phases:H.progress.phases,custody:H.progress.custody,nativeMutationCount:0,
  visualInspection:'Actual original report/control/capture and editable source reopening; producing-owner visual review remains required.'};
 H.progress.completedResult=result;await H.save();await handoverWrite(final,encoded(result));return result;
}

function handoverZIP(raw){
 need(Buffer.isBuffer(raw)&&raw.length<=HANDOVER_LIMIT,'Use the complete bounded native ZIP');
 let end=-1;for(let i=raw.length-22;i>=Math.max(0,raw.length-65557);i--)if(raw.readUInt32LE(i)===0x06054b50&&i+22+raw.readUInt16LE(i+20)===raw.length){end=i;break;}
 need(end>=0,'Native ZIP central directory is missing');
 const count=raw.readUInt16LE(end+10),offset=raw.readUInt32LE(end+16),size=raw.readUInt32LE(end+12);
 need(raw.readUInt16LE(end+4)===0&&raw.readUInt16LE(end+6)===0&&raw.readUInt16LE(end+8)===count&&count>0&&count<20000&&offset+size===end,'Unsupported complete ZIP directory');
 let at=offset,total=0;const files=new Map;
 for(let n=0;n<count;n++){
  need(at+46<=end&&raw.readUInt32LE(at)===0x02014b50,'Native ZIP directory entry missing');
  const flags=raw.readUInt16LE(at+8),method=raw.readUInt16LE(at+10),compressed=raw.readUInt32LE(at+20),expanded=raw.readUInt32LE(at+24),nameLen=raw.readUInt16LE(at+28),extra=raw.readUInt16LE(at+30),comment=raw.readUInt16LE(at+32),local=raw.readUInt32LE(at+42);
  need(!(flags&1)&&[0,8].includes(method)&&at+46+nameLen+extra+comment<=end,'Unsupported native ZIP entry');
  const name=raw.subarray(at+46,at+46+nameLen).toString('utf8');need(name&&!name.startsWith('/')&&!name.includes('\\')&&!name.split('/').some(p=>!p||p==='.'||p==='..')&&!files.has(name),'Native ZIP has ambiguous paths');
  total+=expanded;need(total<=HANDOVER_LIMIT&&local+30<=offset&&raw.readUInt32LE(local)===0x04034b50,'Native ZIP expansion or local header invalid');
  const ln=raw.readUInt16LE(local+26),le=raw.readUInt16LE(local+28),start=local+30+ln+le;
  need(raw.subarray(local+30,local+30+ln).toString('utf8')===name&&raw.readUInt16LE(local+8)===method&&start+compressed<=offset,'Native ZIP member identity differs');
  const packed=raw.subarray(start,start+compressed),body=method===0?Buffer.from(packed):inflateRawSync(packed,{maxOutputLength:expanded+1});
  need(body.length===expanded,'Native ZIP member size differs');files.set(name,body);at+=46+nameLen+extra+comment;
 }
 need(at===end&&files.has('manifest.json'),'Native ZIP complete manifest missing');
 const manifest=JSON.parse(files.get('manifest.json').toString('utf8'));need(Array.isArray(manifest.files)&&manifest.files.length===files.size-1,'Native ZIP manifest does not cover its full payload');
 const named=new Set;for(const d of manifest.files){const b=files.get(d.path);need(d.path!=='manifest.json'&&!named.has(d.path)&&b&&b.length===d.bytes&&sha(b)===d.sha256,'Native ZIP payload differs from its exact manifest: '+d.path);named.add(d.path);}
 return {files,manifest,inventory:[...files].map(([name,b])=>({name,bytes:b.length,sha256:sha(b)}))};
}
