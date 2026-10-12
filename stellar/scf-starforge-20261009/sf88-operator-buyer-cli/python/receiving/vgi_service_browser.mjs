#!/usr/bin/env node
// One real browser receiving over the original private VGI operator.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';

const configuration=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const directory=configuration.directory;
fs.mkdirSync(directory,{recursive:true,mode:0o700});
const output=path.join(directory,'result.json');
const require=(condition,message)=>{if(!condition)throw new Error(message);};
const save=(name,value)=>{
  const destination=path.join(directory,name),temporary=destination+'.pending';
  fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(temporary,destination);
};
if(fs.existsSync(output)){
  const prior=JSON.parse(fs.readFileSync(output,'utf8'));
  require(prior.operation===configuration.operation&&prior.stage===configuration.stage
    &&prior.workspace_id===configuration.workspace_id&&prior.passed===true,
    'The original browser receiving selection changed');
  process.stdout.write(JSON.stringify(prior)+'\n');
  process.exit(0);
}

const parsed=new URL(configuration.url),capability=parsed.hash.slice(1);
require(parsed.hostname==='127.0.0.1'&&parsed.protocol==='http:'&&capability,
  'Use the original private loopback launch URL');
const authHeaders={'X-DuckDB-Capability':capability,
  'X-DuckDB-Workspace-ID':configuration.workspace_id};
const requestFile=path.join(directory,'original-requests.json');
let requests=fs.existsSync(requestFile)?JSON.parse(fs.readFileSync(requestFile,'utf8')):[];
const pageErrors=[];
const playwright=await import(pathToFileURL(configuration.playwright).href);
const context=await playwright.chromium.launchPersistentContext(configuration.profile,{
  executablePath:configuration.chromium,headless:true,
  viewport:{width:1440,height:1050},acceptDownloads:true,
  args:['--no-sandbox','--disable-dev-shm-usage']
});
const page=await context.newPage();
page.on('pageerror',error=>pageErrors.push({name:error.name,message:error.message}));
await page.route('**/api/**',async route=>{
  const request=route.request();
  if(request.method()==='POST'){
    const url=new URL(request.url()),body=request.postData()||'';
    const signature=crypto.createHash('sha256').update(url.pathname+'\n'+body).digest('hex');
    let row=requests.find(x=>x.signature===signature);
    if(!row){
      row={signature,path:url.pathname,body,created_at:new Date().toISOString(),state:'PREPARED'};
      requests.push(row);save('original-requests.json',requests);
    }
    const response=await route.fetch();
    const text=await response.text();
    row.status=response.status();row.returned_at=new Date().toISOString();
    try{row.result=JSON.parse(text);}catch{row.result={complete_json:false};}
    row.state=response.ok()?'COMPLETE':'REVIEW_REQUIRED';
    save('original-requests.json',requests);
    await route.fulfill({response,body:text});
  }else await route.continue();
});
const api=async(route,body)=>{
  const result=await context.request.fetch(parsed.origin+route,{
    method:body===undefined?'GET':'POST',
    headers:{...authHeaders,...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{data:body}),timeout:180000});
  const value=await result.json();
  require(result.ok(),'Original operator returned '+result.status()+': '+(value.error||'unknown'));
  return value;
};
const current=()=>api('/api/vgi/state');
const settle=async()=>{
  await page.waitForFunction(()=>!document.body.classList.contains('busy'),null,{timeout:180000});
  const error=page.locator('#error');
  require(!(await error.isVisible()),await error.textContent()||'Original UI operation failed');
};
const click=async selector=>{
  await page.locator(selector).click();
  await settle();
};
let result;
try{
  // Complete only original payloads whose browser reply was interrupted.
  for(const request of requests.filter(x=>x.state==='PREPARED')){
    const body=JSON.parse(request.body);
    request.result=await api(request.path,body);
    request.state='COMPLETE';request.returned_at=new Date().toISOString();
    save('original-requests.json',requests);
  }
  await page.goto(configuration.url,{waitUntil:'domcontentloaded'});
  await page.locator('#main').waitFor({state:'visible',timeout:180000});
  await settle();
  let state=await current();
  require(state.workspace_id===configuration.workspace_id,'The original workspace changed');
  if(configuration.stage==='publish'){
    const target={catalog_name:'purchased_results',label:'Retained Svenska kraftnät results',
      principals:[configuration.principal],allow_local:false};
    if(state.configuration.catalog_name!==target.catalog_name
      ||state.configuration.label!==target.label
      ||state.configuration.allow_local!==false
      ||state.configuration.principals.length!==1
      ||state.configuration.principals[0]!==configuration.principal){
      await click('#vgi-access-tab');
      await page.locator('#catalog-name').fill(target.catalog_name);
      await page.locator('#catalog-label').fill(target.label);
      await page.locator('#principals').fill(configuration.principal);
      await page.locator('#allow-local').uncheck();
      await click('#save-configuration');
      state=await current();
    }
    require(state.configuration.catalog_name===target.catalog_name
      &&state.configuration.principals.length===1
      &&state.configuration.principals[0]===configuration.principal
      &&state.configuration.allow_local===false,'The original access form did not retain its selection');
    let head=state.tables.find(x=>x.name===configuration.table_name);
    if(!head){
      await click('#vgi-publish-tab');
      await page.locator('#export-select').selectOption(configuration.export_id);
      await page.locator('#batch-rows').fill('16');
      await page.locator('#publish-table').fill(configuration.table_name);
      await click('#review-export');
      await page.locator('#publish-result').waitFor({state:'visible'});
      await click('#publish-result');
      state=await current();
      head=state.tables.find(x=>x.name===configuration.table_name);
    }
    require(head?.active===true,'The original published table is not active');
    const publication=await api('/api/vgi/publications/'+head.publication_id);
    require(publication.source.export_id===configuration.export_id
      &&publication.rows===32&&publication.batches.length===2
      &&publication.batches.every(x=>x.rows===16),'The original reviewed publication changed');
    await click('#vgi-catalog-tab');
    await page.getByRole('button',{name:'Inspect',exact:true}).first().click();
    await settle();
    await page.screenshot({path:path.join(directory,'publication.png'),fullPage:true});
    await click('#vgi-runtime-tab');
    state=await current();
    if(state.runtime.observed!=='RUNNING'){
      require(state.installed_runtime.ready===true,'The selected native vendor cohort is not installed');
      await page.locator('#listen-host').fill('127.0.0.1');
      await page.locator('#listen-port').fill('0');
      await click('#start-service');
      state=await current();
    }
    require(state.runtime.observed==='RUNNING'&&state.runtime.owned===true,
      'The original listener did not retain its actual lifetime');
    await page.screenshot({path:path.join(directory,'listener.png'),fullPage:true});
    result={publication_id:publication.publication_id,table:head,
      configuration:state.configuration,
      runtime:{request_id:state.runtime.request_id,address:state.runtime.address,
        catalog:state.runtime.catalog}};
  }else if(configuration.stage==='handover'){
    await click('#vgi-recovery-tab');
    const original=requests.find(x=>x.path==='/api/handoffs'&&x.state==='COMPLETE');
    let handoff=original?.result;
    if(!handoff){
      await click('#create-handoff');
      handoff=requests.findLast(x=>x.path==='/api/handoffs'&&x.state==='COMPLETE')?.result;
    }
    require(handoff?.files?.some(x=>x.name==='warehouse.duckdb'),
      'The original full warehouse handover did not return');
    await page.getByRole('button',{name:'Read latest history',exact:true}).click();
    await settle();
    await page.screenshot({path:path.join(directory,'handover.png'),fullPage:true});
    const warehouse=handoff.files.find(x=>x.name==='warehouse.duckdb');
    const response=await context.request.get(parsed.origin+'/api/exports/'
      +encodeURIComponent(handoff.export_id)+'/file?name=warehouse.duckdb',
      {headers:authHeaders,timeout:180000});
    require(response.ok(),'The original handover download did not complete');
    const bytes=await response.body();
    require(bytes.length===warehouse.bytes
      &&crypto.createHash('sha256').update(bytes).digest('hex')===warehouse.sha256,
      'The complete downloaded native warehouse changed');
    result={handoff,download:{name:warehouse.name,bytes:bytes.length,sha256:warehouse.sha256}};
  }else if(configuration.stage==='restored'){
    const head=state.tables.find(x=>x.name===configuration.table_name);
    require(head?.publication_id===configuration.publication_id&&head.active,
      'The restored catalog head changed');
    await click('#vgi-catalog-tab');
    await page.getByRole('button',{name:'Inspect',exact:true}).first().click();
    await settle();
    const publication=await api('/api/vgi/publications/'+configuration.publication_id);
    require(publication.rows===32&&publication.batches.length===2,
      'The restored original publication changed');
    await page.screenshot({path:path.join(directory,'restored-catalog.png'),fullPage:true});
    await click('#vgi-recovery-tab');
    await page.getByRole('button',{name:'Read latest history',exact:true}).click();
    await settle();
    await page.screenshot({path:path.join(directory,'restored-history.png'),fullPage:true});
    result={publication_id:publication.publication_id,
      service_revision:state.revision,retained_publications:state.publications.length};
  }else throw new Error('Select the original supported receiving stage');
  require(pageErrors.length===0,'The actual operator page reported a JavaScript error');
  result={operation:configuration.operation,stage:configuration.stage,passed:true,
    completed_at:new Date().toISOString(),workspace_id:state.workspace_id,
    service_id:state.service_id,page_error_count:pageErrors.length,
    original_requests:requests.map(x=>({signature:x.signature,path:x.path,state:x.state,status:x.status})),
    ...result};
  save('result.json',result);
}finally{
  save('page-errors.json',pageErrors);
  await context.close();
}
process.stdout.write(JSON.stringify(result)+'\n');
