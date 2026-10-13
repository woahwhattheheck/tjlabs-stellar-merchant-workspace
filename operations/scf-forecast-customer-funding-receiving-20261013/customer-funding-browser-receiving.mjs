// MIT. Original Accounts/Forecast supplied-page course. No launcher or financial writer.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {inflateRawSync} from 'node:zlib';

export const SCHEMA='stellar-forge.forecast-customer-funding-receiving.v1';
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
function validateInput(input){
 need(input&&input.schema===SCHEMA,'Use the declared original receiving input');
 identity(input.operationId,'the original course operation ID');
 need(input.browserPlacement==='isolated-cloud','Use only the existing original isolated-cloud browser. Keep the selected isolated-cloud placement and the actual original browser owner’s current instructions.');
 need(/^operation-[a-f0-9]{32}$/.test(input.programId),'Retain the original native case ID');
 const u=new URL(input.origin);need(['http:','https:'].includes(u.protocol)&&u.origin===input.origin,'Use the exact original HTTP origin');
 need(typeof input.pageURL==='string'&&new URL(input.pageURL).origin===input.origin,'Use the original application page URL');
 need(HASH.test(input.planContentSha256),'Retain the original plan identity');
 need(input.staff&&typeof input.staff.staffId==='string'&&typeof input.staff.installationId==='string','Retain original account and installation');
 need(typeof input.actor==='string'&&input.actor.trim(),'Retain the original recording operator');
 need(Number.isSafeInteger(input.baseline?.caseVersion)&&input.baseline.caseVersion>0,'Retain the original case revision');
 need(Array.isArray(input.baseline.forecasts)&&input.baseline.forecasts.length>0,'Retain all original saved Forecast identities');
 for(const f of input.baseline.forecasts)need(/^forecast-[a-f0-9]{32}$/.test(f.id)&&HASH.test(f.sha256),'Retain each original Forecast pin');
 need(HASH.test(input.baseline.cashSha256),'Retain the exact original cash-register identity');
 need(Array.isArray(input.servedSources)&&input.servedSources.length>=4,'Pin the actual installed calculator and editor source closure');
 for(const f of input.servedSources)need(new URL(f.url,input.origin).origin===input.origin&&HASH.test(f.sha256)&&Number.isSafeInteger(f.bytes)&&f.bytes>0,'Retain complete served-source pins');
 need(Array.isArray(input.scenarios)&&input.scenarios.length>0&&input.scenarios.length<=20,'Supply the complete authored sensitivity cases');
 const ids=new Set;
 for(const s of input.scenarios){identity(s.id,'each authored scenario identity');need(s.id.length<=64,'Use a bounded scenario artifact prefix');need(!ids.has(s.id),'Scenario IDs must be unique');ids.add(s.id);need(s.inputs&&Buffer.byteLength(canonical(s.inputs))<=INPUT_LIMIT,'Supply complete authored Forecast inputs within 8 MiB');need(s.expected&&typeof s.expected==='object','Retain reviewed native expected fields for each authored case');}
 return input;
}
function absolute(origin,url){const u=new URL(url,origin);need(u.origin===origin,'Keep all reads on the supplied original origin');return u.href;}
async function api(page,origin,url){
 const r=await page.request.get(absolute(origin,url),{headers:{'Cache-Control':'no-store'}});
 need(r.ok(),'Original read failed ('+r.status()+'): '+url);return r.json();
}
async function verifyServedSources(page,input){
 for(const pin of input.servedSources){const r=await page.request.get(absolute(input.origin,pin.url),{headers:{'Cache-Control':'no-store'}});need(r.ok(),'Actual installed source unavailable');const b=await r.body();need(b.length===pin.bytes&&sha(b)===pin.sha256,'Actual served source differs: '+pin.url);}
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
async function openDesk(page,input,programId=input.programId){
 need(new URL(page.url()).origin===input.origin,'The equipped parent must already open the original isolated-cloud application');
 await staff(page,input);
 const select=page.locator('select[name="caseSelect"]');await select.waitFor({state:'visible'});
 need(await select.inputValue()===programId,'Preserve the other case and its draft; the parent must select the declared original case');
 need(await page.locator('[data-forecast-action="download-working"]').count(),'The parent must already open the original Forecast desk without replacing a retained draft');
 await page.waitForFunction(()=>{const b=document.querySelector('[data-forecast-action="download-working"]');return b&&!b.disabled;});
 const actor=page.locator('[name="recordingActor"]');if(await actor.count()){const actual=await actor.inputValue();if(actual)need(actual===input.actor,'Preserve the original recording actor');else await actor.fill(input.actor);}
 await context(page,input,programId);
}
async function openSaved(page,input,id,J,programId=input.programId,{restored=false}={}){
 await guardWorking(page,input,J,{programId,cleanOnly:restored});
 const saved=await api(page,input.origin,'/api/operations/'+programId+'/forecasts/'+id);
 const select=page.locator('[data-forecast-selection]');
 const settled=()=>page.waitForFunction(({id,sha256})=>{const s=document.querySelector('[data-forecast-selection]'),b=document.querySelector('[data-forecast-action="export-json"]'),r=document.querySelector('[data-forecast-report]');return s?.value===id&&b&&!b.disabled&&r?.textContent.includes(sha256);},{id,sha256:saved.sha256});
 if(await select.inputValue()!==id||!((await page.locator('[data-forecast-report]').textContent())||'').includes(saved.sha256)){
  const waiting=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/operations/'+programId+'/forecasts/'+id&&r.request().method()==='GET');
  await select.selectOption(id);const response=await waiting;need(response.ok(),'Original saved edition could not be opened');const actual=await response.json();
  need(actual.id===id&&actual.sha256===saved.sha256,'The original saved-selection response changed');
 }
 await settled();await rememberWorking(page,input,J,{programId,reason:'opened-'+id});
}
async function ownDirectory(directory){
 const dir=path.resolve(directory);const s=await fs.lstat(dir);need(s.isDirectory()&&!s.isSymbolicLink(),'Parent must supply its existing declared receiving directory');return dir;
}
async function journal(directory,input){
 const dir=await ownDirectory(directory),fingerprint=sha(canonical(input)),intent=path.join(dir,'CUSTOMER_FUNDING_INTENT.json'),file=path.join(dir,'CUSTOMER_FUNDING_PROGRESS.json');
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
async function currentWorking(page,input){
 return page.evaluate(async({programId,staff})=>{
  const m=await import('/forecast-workbook-host.mjs');
  const key='sf47.forecast-working.'+programId+':staff:'+staff.installationId+':'+staff.staffId;
  const store=m.createForecastDraftStore(key);try{return await store.read();}finally{await store.close();}
 },{programId:input.programId,staff:input.staff});
}
function workingIdentity(value){const copy=clone(value);delete copy.savedAt;return sha(canonical(copy));}
async function observeWorking(page,input,J,{programId=input.programId,reason='guard'}={}){
 await openDesk(page,input,programId);
 const awaited=page.waitForEvent('download');await page.locator('[data-forecast-action="download-working"]').click();
 const file=await awaited,temporary=path.join(J.dir,'.working-'+crypto.randomUUID());
 let bytes;try{await file.saveAs(temporary);const stat=await fs.stat(temporary);need(stat.size<=LIMIT,'Complete working file exceeds its receiving bound');bytes=await fs.readFile(temporary);}finally{await fs.unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 const value=JSON.parse(bytes.toString('utf8'));
 need(value.schema==='stellar-forge.forecast-working-session.v1'&&value.caseId===programId&&value.planContentSha256===input.planContentSha256,'Keep the exact original case/plan working envelope');
 const artifact=await J.artifact('custody-'+sha(bytes)+'.json',bytes),identity=workingIdentity(value);
 J.progress.workingCustody ||= [];J.progress.workingCustody.push({artifact,identity,programId,reason});await J.save();
 return {value,artifact,identity};
}
async function rememberWorking(page,input,J,options={}){
 const observed=await observeWorking(page,input,J,options);
 J.progress.allowedWorking ||= [];if(!J.progress.allowedWorking.some(x=>x.identity===observed.identity&&x.programId===observed.value.caseId))J.progress.allowedWorking.push({identity:observed.identity,programId:observed.value.caseId,artifact:observed.artifact});
 await J.save();return observed;
}
async function guardWorking(page,input,J,{programId=input.programId,cleanOnly=false,command=null,pendingWorking=null,initial=false}={}){
 const observed=await observeWorking(page,input,J,{programId,reason:'before-adoption'}),v=observed.value;
 const recovery=J.progress.pending?.beforeWorking||J.progress.phases.find(p=>p.id==='original-source')?.result.initialWorking;
 const suffix=' The complete current file is retained as '+observed.artifact.name+'.'+(recovery?' Preserve it, then reopen the exact '+recovery.name+' through the original working-file control to resume this phase.':' Preserve it and return to a clean original saved edition before continuing.');
 need(!v.pendingWorkbook,'An original workbook/source request must finish first.'+suffix);
 if(v.saveRequest){
  need(command&&same(v.saveRequest,command)&&pendingWorking,'An unrelated Forecast save must finish first.'+suffix);
  const expected=JSON.parse((await J.verify(pendingWorking)).toString('utf8'));
  need(workingIdentity(expected)===observed.identity,'The retained pending working envelope changed.'+suffix);return observed;
 }
 const known=[...input.baseline.forecasts.map(f=>f.id),...J.progress.phases.filter(p=>p.id.startsWith('scenario-')).map(p=>p.result.saved?.id).filter(Boolean)];
 if(command){const rows=await history(page,input,programId);for(const event of rows.filter(e=>e.requestId===command.requestId&&e.action==='forecast.save'))known.push(event.recordId);}
 if(v.editing){
  need(!cleanOnly&&(initial||(J.progress.allowedWorking||[]).some(x=>x.programId===programId&&x.identity===observed.identity)),'A different mutable Forecast draft is open.'+suffix);
 }else need(known.includes(v.selectedId),'Open an exact original or accepted course Forecast before this receiving step.'+suffix);
 return observed;
}
async function inspectPages(page,funding,J,prefix){
 const artifacts=[];if(!funding?.enabled)return artifacts;
 const root=page.locator('[data-funding-report]');await root.waitFor({state:'visible'});
 for(const d of await root.locator('details').all())await d.evaluate(el=>{el.open=true;});
 for(const kind of ['days','customers']){
  const total=kind==='days'?funding.days.length:funding.customerDays.length,last=Math.max(0,Math.ceil(total/60)-1);
  for(const target of [...new Set([0,Math.floor(last/2),last])]){
   while(Number(await root.getAttribute(kind==='days'?'data-day-page':'data-customer-page'))<target){const p=Number(await root.getAttribute(kind==='days'?'data-day-page':'data-customer-page'));await root.locator('[data-funding-page="'+kind+'"][data-page="'+(p+1)+'"]').click();}
   artifacts.push(await shot(page,J,prefix+'-'+kind+'-'+target+'.png',1366));
  }
 }
 const select=root.locator('[data-funding-customer]');for(const id of ['',...(funding.projects.length?[funding.projects[0].commercialId]:[])]){await select.selectOption(id);need(await page.locator('[data-funding-report]').getAttribute('data-customer-id')===id,'Original customer filter did not apply');}
 await select.selectOption('');artifacts.push(await shot(page,J,prefix+'-narrow.png',390));
 need(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Narrow Forecast page overflows; retain the image and correct original UI before readiness');
 await page.setViewportSize({width:1366,height:900});return artifacts;
}
async function previewInputs(page,input,scenario,J){
 await guardWorking(page,input,J);
 await staff(page,input);
 const editing=page.locator('[data-forecast-form]');if(!await editing.count())await page.locator('[data-forecast-action="reforecast"]').click();
 const waiting=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/operations/'+input.programId+'/forecast-preview'&&r.request().method()==='POST');
 await page.locator('[data-forecast-input-file]').setInputFiles({name:scenario.id+'.json',mimeType:'application/json',buffer:Buffer.from(canonical(scenario.inputs))});
 const r=await waiting;need(r.ok(),'Original native preview rejected the authored scenario');const value=await r.json();
 await page.locator('[data-forecast-preview-state]').waitFor({state:'visible'});
 need(value.inputs&&HASH.test(value.previewSha256),'Original complete preview identity missing');assertions(value,scenario.expected,scenario.expectedAbsent);await rememberWorking(page,input,J,{reason:'authored-preview-'+scenario.id});return value;
}
async function exerciseDraft(page,input,J,scenario,preview){
 const artifacts=[],funding=preview.inputs.customerFunding;
 if(!funding?.enabled||!funding.opening.length)return {preview,artifacts,scope:'This authored scenario has no active opening controls'};
 const first=funding.opening[0],row=()=>page.locator('[data-forecast-funding="'+first.commercialId+'"]'),amount=()=>row().locator('[name="fundingAmount"]');
 // No native save occurs here. Every temporary value stays an explicit editor exercise.
 await amount().fill('0.');await rememberWorking(page,input,J,{reason:'partial-editor-'+scenario.id});
 const partial=await working(page,J,scenario.id+'-partial-working.json');
 need(Object.values(partial.value.rawFields).some(v=>v?.value==='0.'),'The complete working download lost the partial amount text');artifacts.push(partial.descriptor);
 await guardWorking(page,input,J);
 await page.locator('[data-forecast-working-file]').setInputFiles({name:'Partial_Original_Working.json',mimeType:'application/json',buffer:partial.bytes});
 await page.waitForFunction(id=>{const r=[...document.querySelectorAll('[data-forecast-funding]')].find(x=>x.dataset.forecastFunding===id);return r?.querySelector('[name="fundingAmount"]')?.value==='0.';},first.commercialId);
 await rememberWorking(page,input,J,{reason:'partial-reopened-'+scenario.id});
 artifacts.push(await shot(page,J,scenario.id+'-partial.png',1366));
 await amount().fill('-0.01');await rememberWorking(page,input,J,{reason:'explicit-invalid-editor-'+scenario.id});
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/operations/'+input.programId+'/forecast-preview'&&r.request().method()==='POST');
 await page.locator('[data-forecast-form] button[type="submit"]').click();
 const rejected=await response;need(!rejected.ok()&&rejected.status()>=400&&rejected.status()<500,'A negative attributed opening was not rejected natively');
 await page.waitForFunction(()=>{const e=document.querySelector('[data-forecast-status]');return e&&e.textContent.trim();});
 artifacts.push(await shot(page,J,scenario.id+'-validation-error.png',1366));
 await rememberWorking(page,input,J,{reason:'definite-invalid-preview-'+scenario.id});
 preview=await previewInputs(page,input,scenario,J);
 await page.locator('[name="fundingEnabled"]').uncheck();await rememberWorking(page,input,J,{reason:'explicit-disabled-editor-'+scenario.id});
 const disabledResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/operations/'+input.programId+'/forecast-preview'&&r.request().method()==='POST');
 await page.locator('[data-forecast-form] button[type="submit"]').click();const off=await disabledResponse;need(off.ok(),'Original disabled-policy preview failed');const disabled=await off.json();
 need(disabled.inputs.customerFunding.enabled===false&&same(disabled.inputs.customerFunding.opening,funding.opening)&&same(disabled.report.customerFunding.opening,funding.opening),'Disabling did not retain the full entered attribution');
 await page.waitForFunction(()=>document.querySelector('[data-forecast-report]')?.textContent.includes('Customer funding protection is off'));
 artifacts.push(await shot(page,J,scenario.id+'-disabled-retained.png',390));
 await rememberWorking(page,input,J,{reason:'disabled-preview-'+scenario.id});
 await page.setViewportSize({width:1366,height:900});preview=await previewInputs(page,input,scenario,J);
 return {preview,artifacts,scope:'Original partial working download/reopen, native invalid-input response and disabled-with-retained-attribution controls; no observation or save'};
}
async function nativeSave(page,input,J,scenario,preview,pending){
 await guardWorking(page,input,J,{command:pending.command||null,pendingWorking:pending.working||null});
 const commandURL=absolute(input.origin,'/api/operations/'+input.programId+'/command');
 const route=async r=>{
  try{const q=r.request();need(q.method()==='POST','Only the original Forecast command is admitted');const b=q.postDataJSON();
   need(b.action==='forecast.save'&&b.actor===input.actor&&same(b.data?.inputs,preview.inputs)&&b.data.expectedPreviewSha256===preview.previewSha256,'Original browser save differs from its complete preview');
   need(typeof b.requestId==='string'&&b.requestId.length>0&&b.requestId.length<=200,'Retain the original native request ID');await staff(page,input);
   if(pending.command)need(same(pending.command,b),'Keep the exact original save request body');
   else{const local=await currentWorking(page,input);need(local?.saveRequest&&same(local.saveRequest,b),'Original UI did not durably retain its request before dispatch');pending.command=clone(b);pending.working=await J.artifact(scenario.id+'-pending-working.json',encoded(local));await J.save();}
   await r.continue();
  }catch(e){pending.dispatchError=e.message;await J.save();await r.abort('blockedbyclient');}
 };
 await page.route(commandURL,route);
 try{
  let events=await history(page,input),matches=pending.command?events.filter(e=>e.requestId===pending.command.requestId):[];
  need(matches.length<=1,'Original request has multiple native history entries');
  if(!matches.length){
   if(pending.command){
    const local=await currentWorking(page,input);
    if(local?.saveRequest)need(same(local.saveRequest,pending.command),'An unrelated original save is pending');
    else{await guardWorking(page,input,J,{command:pending.command,pendingWorking:pending.working});const raw=await J.verify(pending.working);await page.locator('[data-forecast-working-file]').setInputFiles({name:'Original_Pending_Forecast.json',mimeType:'application/json',buffer:raw});await page.waitForFunction(()=>{const b=document.querySelector('[data-forecast-action="recover-save"]');return b&&!b.disabled;});}
   }
   const waiting=page.waitForResponse(r=>r.url()===commandURL&&r.request().method()==='POST');
   await page.locator('[data-forecast-action="'+(pending.command?'recover-save':'save')+'"]').click();
   const response=await waiting;need(response.ok(),'Original Forecast save returned '+response.status()+'; retain its exact request and reconcile this same phase');
   const receipt=await response.json();pending.receipt=receipt;await J.save();events=await history(page,input);matches=events.filter(e=>e.requestId===pending.command.requestId);
  }
  need(matches.length===1,'Accepted original request is not present exactly once');
  const event=matches[0],command=pending.command;need(event.action==='forecast.save'&&event.actor===command.actor&&event.version===command.expectedVersion+1,'Original Forecast event differs');
  const saved=await api(page,input.origin,'/api/operations/'+input.programId+'/forecasts/'+event.recordId);
  need(saved.id===event.recordId&&saved.sha256===event.after.sha256&&saved.previewSha256===command.data.expectedPreviewSha256&&same(saved.inputs,command.data.inputs),'Saved original Forecast does not match its accepted request');
  assertions(saved,scenario.expected,scenario.expectedAbsent);
  // A return can be accepted before the browser settles its original pending draft.
  const local=await currentWorking(page,input);
  if(local?.saveRequest){
   need(same(local.saveRequest,command),'Preserve a different later pending request');
   const waiting=page.waitForResponse(r=>r.url()===commandURL&&r.request().method()==='POST');
   await page.locator('[data-forecast-action="recover-save"]').click();const response=await waiting;need(response.ok(),'Continue the same accepted request to settle its original browser draft');
  }
  await page.waitForFunction(()=>{const b=document.querySelector('[data-forecast-action="download-working"]');return b&&!b.disabled;});
  return {event,saved:rawSaved(saved),command:clone(command),requestSha256:sha(canonical(command)),receipt:pending.receipt||{id:input.programId,version:event.version,action:event.action,kind:event.kind,recordId:event.recordId}};
 }finally{await page.unroute(commandURL,route);}
}

export function prepareCustomerFundingInput({packet,binding}){
 need(packet?.schema&&Array.isArray(packet.files),'Supply the complete original source-owner input packet');
 const files=new Map;
 for(const f of packet.files){need(typeof f.path==='string'&&!files.has(f.path)&&typeof f.base64==='string','Keep every original input file once');const b=Buffer.from(f.base64,'base64');need(b.length===f.bytes&&sha(b)===f.sha256,'Original input file differs: '+f.path);files.set(f.path,b);}
 const read=name=>{need(files.has(name),'Original receiving input missing: '+name);return JSON.parse(files.get(name).toString('utf8'));};
 const plan=read('receiving-input.json');need(plan.schema==='stellar-forge.forecast-customer-funding-receiving-input.v1','Use the source owner original receiving schema');
 const archive=files.get(plan.original.archive.path);need(archive&&archive.length===plan.original.archive.bytes&&sha(archive)===plan.original.archive.sha256,'Complete original archive identity changed');
 const zip=nativeZIP(archive);need(same(zip.inventory.slice().sort((a,b)=>a.name.localeCompare(b.name)),plan.original.memberManifest.map(f=>({name:f.path,bytes:f.bytes,sha256:f.sha256})).sort((a,b)=>a.name.localeCompare(b.name))),'Original archive full member selection differs');
 const document=JSON.parse(zip.files.get('operations.json').toString('utf8'));
 need(document.program.id===plan.original.caseId&&document.program.version===plan.original.version,'Original case boundary differs');
 for(const f of plan.original.forecasts)need(document.forecasts.some(v=>v.id===f.id&&v.sha256===f.sha256),'Original immutable Forecast missing');
 need(binding&&binding.browserPlacement==='isolated-cloud','Original owner must supply its isolated-cloud page binding; no local in-app browser is admitted');
 const scenarios=plan.variants.map(v=>{
  const inputs=read(v.inputs),wanted=read(v.expected),expected={},expectedAbsent=[];
  if(wanted.enabled===false){expected['/report/customerFunding/enabled']=false;expected['/report/customerFunding/opening']=inputs.customerFunding.opening;expectedAbsent.push('/report/customerFunding/summary');}
  else{for(const [k,value]of Object.entries(wanted)){if(k!=='days')expected['/report/customerFunding/summary/'+k]=value;}
   need(Array.isArray(wanted.days),'Retain all original expected daily rows');expected['/report/customerFunding/days/length']=wanted.days.length;
   wanted.days.forEach((r,i)=>{for(const [k,value]of Object.entries(r))expected['/report/customerFunding/days/'+i+'/'+k]=value;});
  }
  return {id:v.key,inputs,expected,expectedAbsent};
 });
 const input={schema:SCHEMA,operationId:plan.operationId,browserPlacement:binding.browserPlacement,origin:binding.origin,pageURL:binding.pageURL,
  programId:binding.programId,originalProgramId:plan.original.caseId,planContentSha256:plan.original.forecastSource.planContentSha256,
  staff:clone(binding.staff),actor:binding.actor,sourceCommit:plan.application.commit,
  originalArchive:clone(plan.original.archive),installedSourcePins:clone(plan.application.sourcePins),
  baseline:{caseVersion:plan.original.version,forecasts:clone(plan.original.forecasts),cashSha256:sha(canonical(document.records.cash))},
  servedSources:plan.application.sourcePins.filter(p=>p.path.endsWith('.mjs')).map(p=>({url:'/'+p.path.split('/').at(-1),bytes:p.bytes,sha256:p.sha256})),scenarios};
 validateInput(input);return {input,originalArchive:{bytes:archive,sha256:sha(archive)},originalMemberInventory:zip.inventory,expectedNativeComparisonOnly:true};
}

export async function receiveCustomerFunding({page,directory,input}){
 validateInput(input);need(page&&typeof page.route==='function','Supply the original existing page; the parent owns its browser and controller');
 const J=await journal(directory,input),final=path.join(J.dir,'CUSTOMER_FUNDING_COMPLETE.json');
 if(await exists(final)){const result=await readJSON(final);need(result.inputSha256===J.fingerprint,'Complete course input changed');for(const p of result.phases)for(const a of p.result.artifacts||[])await J.verify(a);for(const item of result.workingCustody||[])await J.verify(item.artifact);return result;}
 await verifyServedSources(page,input);
 await openDesk(page,input);
 await J.phase('original-source',async pending=>{
  const initial=await guardWorking(page,input,J,{initial:!pending.initialWorking});
  if(!pending.initialWorking){pending.initialWorking=initial.artifact;J.progress.allowedWorking ||= [];J.progress.allowedWorking.push({identity:initial.identity,programId:input.programId,artifact:initial.artifact});await J.save();}
  const original=await context(page,input);need(original.program.version===input.baseline.caseVersion,'Reopen the exact original case boundary before starting');
  need(original.program.id===input.originalProgramId||original.program.origin?.programId===input.originalProgramId,'Existing local case is not derived from the complete original archive');
  need(sha(canonical(original.records.cash))===input.baseline.cashSha256,'Original observed cash register differs');
  const artifacts=[],forecasts=[];
  for(const pin of input.baseline.forecasts){const saved=await api(page,input.origin,'/api/operations/'+input.programId+'/forecasts/'+pin.id);need(saved.sha256===pin.sha256,'An original Forecast changed');forecasts.push(rawSaved(saved));await openSaved(page,input,pin.id,J);}
  const sources=[];for(const s of original.sources||[]){const r=await page.request.get(absolute(input.origin,'/api/operations/'+input.programId+'/sources/'+s.id));need(r.ok(),'Original source unavailable');const b=await r.body();need(b.length===s.bytes&&sha(b)===s.sha256,'Original attached bytes differ');sources.push({...s,artifact:await J.artifact('original-'+s.id,b)});artifacts.push(sources.at(-1).artifact);}
  artifacts.push(pending.initialWorking,await J.artifact('original-case.json',encoded(original)),await J.artifact('original-forecasts.json',encoded(forecasts)));
  return {artifacts,initialWorking:pending.initialWorking,case:original,forecasts,sources,staff:await staff(page,input)};
 });
 for(const scenario of input.scenarios){
  await J.phase('scenario-'+scenario.id,async pending=>{
   await openDesk(page,input);
   let preview=pending.preview;
   if(!pending.command){
    const before=await guardWorking(page,input,J);if(!pending.beforeWorking){pending.beforeWorking=before.artifact;await J.save();}
    if(!(pending.readyWorking&&pending.preview&&before.identity===pending.readyIdentity)){
     preview=await previewInputs(page,input,scenario,J);const exercised=await exerciseDraft(page,input,J,scenario,preview);preview=exercised.preview;pending.editorArtifacts=exercised.artifacts;pending.preview=preview;
     const ready=await rememberWorking(page,input,J,{reason:'ready-original-save-'+scenario.id});pending.readyWorking=ready.artifact;pending.readyIdentity=ready.identity;await J.save();
    }
   }
   need(preview,'Retain the original native preview for this request');
   const accepted=await nativeSave(page,input,J,scenario,preview,pending);
   return {...accepted,artifacts:[...(pending.editorArtifacts||[]),await J.artifact(scenario.id+'-accepted.json',encoded(accepted))]};
  });
  await J.phase('exports-'+scenario.id,async()=>{
   const accepted=J.progress.phases.find(p=>p.id==='scenario-'+scenario.id).result;
   await openDesk(page,input);const local=await currentWorking(page,input);need(!local?.saveRequest&&!local?.pendingWorkbook,'Receive the original pending request before export');
   await openSaved(page,input,accepted.saved.id,J);
   const artifacts=await inspectPages(page,accepted.saved.report.customerFunding,J,scenario.id);
   const json=await download(page,J,scenario.id+'-forecast.json',()=>page.locator('[data-forecast-action="export-json"]').click());need(same(JSON.parse(json.bytes.toString('utf8')),accepted.saved),'Actual full JSON download differs');artifacts.push(json.descriptor);
   const zip=await download(page,J,scenario.id+'-forecast.zip',()=>page.locator('[data-forecast-action="export-forecast"]').click());const inventory=inspectForecastZIP(zip.bytes,accepted.saved);artifacts.push(zip.descriptor);
   const work=await working(page,J,scenario.id+'-working.json');need(work.value.selectedId===accepted.saved.id&&!work.value.saveRequest,'Complete working file has a different saved selection');artifacts.push(work.descriptor);
   return {forecastId:accepted.saved.id,sha256:accepted.saved.sha256,inventory,artifacts};
  });
 }
 await J.phase('complete-case',async()=>{
  await openDesk(page,input);const original=J.progress.phases.find(p=>p.id==='original-source').result,c=await context(page,input);
  need(same(c.records.cash,original.case.records.cash),'This planning course changed actual cash');
  for(const old of original.forecasts){const actual=rawSaved(await api(page,input.origin,'/api/operations/'+input.programId+'/forecasts/'+old.id));need(same(actual,old),'An original historical Forecast changed');}
  const historyRows=await history(page,input);for(const p of J.progress.phases.filter(p=>p.id.startsWith('scenario-'))){const found=historyRows.filter(e=>e.requestId===p.result.command.requestId);need(found.length===1&&same(found[0],p.result.event),'Saved original request history changed');}
  const zip=await download(page,J,'Customer_Funding_Complete_Case.zip',()=>page.locator('[data-ops-action="export"]').click());const unpacked=nativeZIP(zip.bytes),document=JSON.parse(unpacked.files.get('operations.json').toString('utf8'));
  need(document.program.id===input.programId&&same(document.records.cash,original.case.records.cash),'Complete original case export changed original cash');
  const all=[...original.forecasts,...J.progress.phases.filter(p=>p.id.startsWith('scenario-')).map(p=>p.result.saved)];
  for(const f of all)need(same(document.forecasts.find(x=>x.id===f.id),f),'Whole case export omits an original/new immutable Forecast');
  for(const s of original.sources){const raw=unpacked.files.get('sources/'+s.id);need(raw&&raw.length===s.bytes&&sha(raw)===s.sha256,'Whole case export omits original attachment');}
  return {artifacts:[zip.descriptor,await J.artifact('complete-history.json',encoded(historyRows))],inventory:unpacked.inventory,programId:input.programId,version:document.program.version,forecastIds:all.map(f=>f.id),cashSha256:sha(canonical(document.records.cash))};
 });
 const result=J.progress.completedResult||{schema:SCHEMA,operationId:input.operationId,inputSha256:J.fingerprint,completedAt:J.progress.phases.at(-1).completedAt,phases:J.progress.phases,workingCustody:J.progress.workingCustody||[],inspectionRequired:'The producing operator must open every actual attachment and personally inspect/operate the exact delivered app and desktop/narrow images. Captures and source checks alone do not establish rendered/customer-ready acceptance.',restoredInspection:'Pending original parent independent full-case import and inspectCustomerFunding; no replacement native operation created.'};
 need(same(result.phases,J.progress.phases),'Retained accepted completion changed');J.progress.completedResult=result;await J.save();await durable(final,encoded(result));return result;
}
export async function inspectCustomerFunding({page,directory,input,priorResult,programId=input.programId}){
 validateInput(input);need(/^operation-[a-f0-9]{32}$/.test(programId),'Supply the actual original receiver case ID');
 const J=await journal(directory,input),first=await readJSON(path.join(J.dir,'CUSTOMER_FUNDING_COMPLETE.json'));
 need(same(priorResult,first)&&first.inputSha256===J.fingerprint,'Retain the exact first completed result through independent receiving');
 // Native APIs are read-only in this inspection. The supplied page may open saved editions.
 await verifyServedSources(page,input);
 await openDesk(page,input,programId);await guardWorking(page,input,J,{programId,cleanOnly:true});const c=await context(page,input,programId),original=first.phases.find(p=>p.id==='original-source').result;
 need(programId===input.programId||c.program.origin?.programId===input.programId,'Restored case is not derived from the original case');
 need(same(c.records.cash,original.case.records.cash),'Restored original actual cash changed');
 const all=[...original.forecasts,...first.phases.filter(p=>p.id.startsWith('scenario-')).map(p=>p.result.saved)],events=await history(page,input,programId),received=[];
 for(const f of all){const actual=rawSaved(await api(page,input.origin,'/api/operations/'+programId+'/forecasts/'+f.id));need(same(actual,f),'Restored immutable Forecast differs: '+f.id);await openSaved(page,input,f.id,J,programId,{restored:true});const r=await page.request.get(absolute(input.origin,'/api/operations/'+programId+'/forecasts/'+f.id+'/export.zip'));need(r.ok(),'Restored export unavailable');const inventory=inspectForecastZIP(await r.body(),f);received.push({id:f.id,sha256:f.sha256,inventory});}
 for(const p of first.phases.filter(p=>p.id.startsWith('scenario-'))){const matches=events.filter(e=>e.requestId===p.result.command.requestId);need(matches.length===1&&same(matches[0],p.result.event),'Restored original request was altered or repeated');}
 for(const s of original.sources){const r=await page.request.get(absolute(input.origin,'/api/operations/'+programId+'/sources/'+s.id));need(r.ok(),'Restored source missing');const b=await r.body();need(b.length===s.bytes&&sha(b)===s.sha256,'Restored original source bytes changed');}
 for(const p of first.phases)for(const a of p.result.artifacts||[])await J.verify(a);for(const item of first.workingCustody||[])await J.verify(item.artifact);
 const result={schema:SCHEMA+'.restored',operationId:input.operationId,inputSha256:J.fingerprint,originalResultSha256:sha(encoded(first)),programId,originalProgramId:input.programId,forecasts:received,cashSha256:sha(canonical(c.records.cash)),readOnly:true};
 await durable(path.join(J.dir,'CUSTOMER_FUNDING_RESTORED.json'),encoded(result));return result;
}
