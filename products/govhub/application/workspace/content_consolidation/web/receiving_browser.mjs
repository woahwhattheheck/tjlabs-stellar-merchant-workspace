#!/usr/bin/env node
/** Inspect the actual saved receiving case through its original operator UI. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);

export async function receiveContentBrowser(options){
 const {base_url,family_id,credentials,output_dir,chromium_executable,visual=false}=options;
 if(!base_url||!family_id||!credentials?.name||!credentials?.password||!output_dir)throw Error('Supply the existing operator URL, family ID, retained credentials and private output directory.');
 const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||path.dirname(fileURLToPath(import.meta.url)),process.cwd()]}));
 await fs.mkdir(output_dir,{recursive:true,mode:0o700});
 const browser=await chromium.launch({headless:true,...(chromium_executable?{executablePath:chromium_executable}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 const result={schema:'govhub.content-consolidation.browser-receiving.v1',family_id,started_at:new Date().toISOString(),views:[],page_errors:[],request_failures:[],http_errors:[]};
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage();
  page.on('pageerror',error=>result.page_errors.push(error.message));
  page.on('requestfailed',request=>{if(!String(request.failure()?.errorText).includes('ERR_ABORTED'))result.request_failures.push({url:new URL(request.url()).pathname,error:request.failure()?.errorText});});
  page.on('response',response=>{if(response.url().startsWith(new URL(base_url).origin)&&response.status()>=400)result.http_errors.push({path:new URL(response.url()).pathname,status:response.status()});});
  await page.goto(base_url,{waitUntil:'networkidle'});
  await page.locator('[data-form=login] [name=name]').fill(credentials.name);
  await page.locator('[data-form=login] [name=password]').fill(credentials.password);
  await page.locator('[data-form=login] button').click();
  await page.locator('#navigation a[href="#content"]').waitFor();
  const domain=async(action,payload)=>page.evaluate(async({action,payload})=>{
   const response=await fetch('/api/govhub/content/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const value=await response.json();if(!response.ok)throw Error(value.error||'The original content read failed.');return value;
  },{action,payload});
  const family=await domain('families.get',{family_id});
  result.family_revision=family.family.revision;
  result.edition_ids=family.editions.map(e=>e.id);
  result.mapping_ids=family.mappings.map(m=>m.id);
  result.operation_ids=family.operations.map(o=>o.id);
  const routes=[['Content consolidations','content',{}],['Original family','content-family',{id:family_id}]];
  for(const edition of family.editions)routes.push(['Original source '+edition.label,'content-source',{id:edition.id}]);
  for(const mapping of family.mappings)routes.push(['Mapping '+mapping.label,'content-mapping',{family_id,mapping_id:mapping.id}]);
  for(const plan of family.plans)routes.push(['Reviewed native plan','content-plan',{family_id,plan_id:plan.id}]);
  for(const operation of family.operations)routes.push(['Original native '+operation.type,'content-operation',{id:operation.id}]);
  for(const source of new Set(family.editions.map(e=>e.source_id))){const editions=family.editions.filter(e=>e.source_id===source);if(editions.length>1)routes.push(['Original source refresh '+source,'content-compare',{before_id:editions[0].id,after_id:editions.at(-1).id}]);}
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   for(const [label,view,params] of routes){
    const hash='#'+view+'?'+new URLSearchParams(params);
    await page.goto(new URL(hash,base_url).href,{waitUntil:'networkidle'});
    await page.locator('#main h1').waitFor();
    await page.waitForFunction(()=>document.querySelector('#main').getAttribute('aria-busy')!=='true');
    const observed=await page.evaluate(()=>({title:document.querySelector('#main h1')?.textContent,viewport:innerWidth,document_width:document.documentElement.scrollWidth,notice:document.querySelector('#notice')?.hidden?'':document.querySelector('#notice')?.textContent,forms:[...document.querySelectorAll('#main form')].map(f=>f.dataset.form),rows:document.querySelectorAll('#main tbody tr').length}));
    result.views.push({label,view,params,width,...observed});
    if(visual&&view==='content-family')await page.screenshot({path:path.join(output_dir,'content-family-'+width+'.png'),fullPage:true});
    if(observed.document_width>observed.viewport+1)throw Error(label+' extends to '+observed.document_width+'px at the '+width+'px viewport.');
    if(observed.notice)throw Error(label+': '+observed.notice);
   }
  }
  if(options.export_id){
   await page.goto(new URL('#export?id='+encodeURIComponent(options.export_id),base_url).href,{waitUntil:'networkidle'});
   const link=page.locator('a[href="/api/exports/'+encodeURIComponent(options.export_id)+'/handover.zip"]');
   const downloaded=page.waitForEvent('download');await link.click();const download=await downloaded;
   const destination=path.join(output_dir,'browser-received-handover.zip');await download.saveAs(destination);
   const {createHash}=await import('node:crypto');const bytes=await fs.readFile(destination);
   result.download={filename:download.suggestedFilename(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  }
  if(result.page_errors.length||result.request_failures.length||result.http_errors.length)throw Error('The original browser receiving recorded page or native HTTP failures.');
  result.status='COMPLETE';
 }catch(error){result.status='FAILED';result.error=error.message;}
 finally{result.finished_at=new Date().toISOString();await browser.close();await fs.writeFile(path.join(output_dir,'content-browser-receiving.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});}
 if(result.status!=='COMPLETE')throw Object.assign(Error(result.error),{result});
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);const options=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(options.credentials_file){options.credentials=JSON.parse(await fs.readFile(options.credentials_file,'utf8'));delete options.credentials_file;}
  const result=await receiveContentBrowser(options);
  process.stdout.write(JSON.stringify({status:result.status,family_id:result.family_id,views:result.views.length,download:result.download||null})+'\n');
 }catch(error){process.stderr.write(JSON.stringify({status:'FAILED',error:error.message})+'\n');process.exitCode=1;}
}
