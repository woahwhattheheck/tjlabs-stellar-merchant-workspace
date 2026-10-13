#!/usr/bin/env node
// MIT. Read-only navigation of an actual retained API customer through its original server.
import {readFile,writeFile,mkdir,link,unlink,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {serveConfiguredWorkspace} from './cli.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const need=(ok,message)=>{if(!ok)throw new Error(message);};
async function publish(path,value){
 const raw=Buffer.from(JSON.stringify(value,null,2)+'\n'),tmp=path+'.'+randomUUID()+'.partial';
 try{const old=await readFile(path);need(old.equals(raw),'Existing programme publication differs: '+path);return;}
 catch(e){if(e.code!=='ENOENT')throw e;}
 await writeFile(tmp,raw,{flag:'wx',mode:0o600});await link(tmp,path);await unlink(tmp);
}
export async function runCustomerNavigationProgramme(input){
 need(input?.schema==='stellar-forge.sf101.customer-navigation-programme.v1','Select the complete navigation programme input.');
 const {directory,configFile,expectedWorkspaceId,expectedRevision,playwright,chromium}=input;
 for(const path of [directory,configFile,playwright,chromium])need(typeof path==='string'&&resolve(path)===path,'Use actual absolute paths.');
 need(typeof expectedWorkspaceId==='string'&&Number.isSafeInteger(expectedRevision),'Select the original workspace identity and revision.');
 await mkdir(directory,{recursive:true,mode:0o700});
 const canonical=JSON.stringify(input),inputSha256=hash(canonical),resultPath=join(directory,'result.json');
 try{const result=JSON.parse(await readFile(resultPath,'utf8'));need(result.inputSha256===inputSha256&&result.complete,'Another original programme owns this completion.');return result;}
 catch(error){if(error.code!=='ENOENT')throw error;}
 await publish(join(directory,'input.json'),input);
 const config=JSON.parse(await readFile(configFile,'utf8')),statePath=join(config.directory,'workspace.json');
 const original=await readFile(statePath),state=JSON.parse(original);
 need(state.id===expectedWorkspaceId&&state.revision===expectedRevision,'The retained customer changed before this read-only programme.');
 need(!state.tasks.some(x=>['QUEUED','RUNNING','CANCELLING'].includes(x.status)),'Continue the original active work before navigation.');
 let app,browser;const artifacts=[],visits=[],failures=[],blocked=[],downloads=[],portfolioPages=[];
 const retain=async(name,bytes)=>{const path=join(directory,name);await writeFile(path,bytes,{mode:0o600});const row={name,bytes:bytes.length,sha256:hash(bytes)};artifacts.push(row);return row;};
 try{
  app=await serveConfiguredWorkspace({configFile,approvalMode:'terminal',expectedWorkspaceSha256:hash(original)});
  const driver=await import(pathToFileURL(playwright).href);
  browser=await driver.chromium.launch({executablePath:chromium,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==app.origin||!['GET','HEAD'].includes(request.method())){
    blocked.push({method:request.method(),path:url.pathname,external:url.origin!==app.origin});await route.abort();return;
   }await route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>failures.push(e.message));
  const ready=async()=>{await page.locator('#workspace').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#view h1'));};
  const checkLayout=async(label)=>{
   const measured=await page.evaluate(()=>{
    const width=document.documentElement.clientWidth;
    const elements=[...document.querySelectorAll('#view a,#view button,#view input,#view select,#view textarea')].filter(e=>e.getClientRects().length);
    return {width,scrollWidth:document.documentElement.scrollWidth,clipped:elements.filter(e=>{const r=e.getBoundingClientRect();return r.left< -1||r.right>width+1;}).map(e=>({text:(e.textContent||e.getAttribute('aria-label')||e.name).slice(0,120),left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}))};
   });
   visits.push({label,...measured});need(measured.scrollWidth<=measured.width+1&&measured.clipped.length===0,'Customer controls extend outside the viewport: '+label);
  };
  const go=async route=>{await page.goto(app.origin+'/#'+route);await ready();await page.waitForTimeout(80);};
  const inspectPortfolio=async(status,expectedIds)=>{
   await page.getByLabel('Find a pass',{exact:true}).fill('');
   await page.getByLabel('Availability',{exact:true}).selectOption(status);
   const wanted=new Set(expectedIds),seen=new Set();need(wanted.size===expectedIds.length,'Retained pass identities are repeated.');
   const counts=expectedIds.length?Math.ceil(expectedIds.length/25):1;
   let previous=[];
   for(let index=0;index<counts;index++){
    const count=Math.min(25,Math.max(0,expectedIds.length-index*25));
    await page.waitForFunction(({count,total,all,previous})=>{
     const ids=[...document.querySelectorAll('.portfolio-pass')].map(e=>e.dataset.profileId);
     const label=document.querySelector('#portfolio-result-count')?.textContent??'';
     return ids.length===count&&label.startsWith(total+' of '+all+' passes')&&
      (!previous.length||ids.some(id=>!previous.includes(id)));
    },{count,total:expectedIds.length,all:state.profiles.length,previous});
    const ids=await page.locator('.portfolio-pass').evaluateAll(rows=>rows.map(row=>row.dataset.profileId));
    for(const id of ids){need(wanted.has(id)&&!seen.has(id),'The portfolio page repeats or substitutes an original pass.');seen.add(id);}
    portfolioPages.push({status,page:index+1,profileIds:ids});
    await checkLayout('portfolio-'+status.toLowerCase()+'-page-'+(index+1));
    const next=page.getByRole('button',{name:'Next page',exact:true});
    if(index+1<counts){need(await next.count()===1,'The original portfolio has no next page.');previous=ids;await next.click();}
    else need(await next.count()===0,'The portfolio contains an unexplained further page.');
   }
   need(seen.size===wanted.size,'The complete original pass selection was not received.');
  };
  await page.goto(app.url);await ready();
  const active=state.profiles.filter(p=>!p.archived);
  await inspectPortfolio('ACTIVE',active.map(p=>p.id));
  await retain('portfolio-desktop.png',await page.screenshot({fullPage:true}));
  if(active.length){
   // Page order comes from the actual portfolio projection, not the source
   // array's position. Select an original active pass visible on this page.
   const card=page.locator('.portfolio-pass').first(),selectedId=await card.getAttribute('data-profile-id');
   const selected=active.find(p=>p.id===selectedId);need(selected,'The active portfolio selects an unknown pass.');
   await page.getByRole('button',{name:'Clear selection',exact:true}).click();
   await card.locator('input[type=checkbox]').check();
   await page.waitForFunction(()=>document.querySelector('#portfolio-refresh-selected').textContent.includes('(1)'));
   const visible=await page.locator('.portfolio-pass').evaluateAll(rows=>rows.map(row=>row.dataset.profileId));
   await page.reload();await ready();
   await page.waitForFunction(ids=>JSON.stringify([...document.querySelectorAll('.portfolio-pass')].map(e=>e.dataset.profileId))===JSON.stringify(ids),visible);
   const retained=page.locator('.portfolio-pass').filter({has:page.locator('input[type=checkbox]:checked')});
   need(await retained.count()===1&&await retained.getAttribute('data-profile-id')===selectedId,'Selection or the original page did not survive reload.');
   await page.getByLabel('Find a pass',{exact:true}).fill(selected.label);
   await page.reload();await ready();
   need(await page.getByLabel('Find a pass',{exact:true}).inputValue()===selected.label,'Portfolio search did not survive reload.');
  }
  await inspectPortfolio('ALL',state.profiles.map(p=>p.id));
  for(const size of [{width:1280,height:900},{width:768,height:900},{width:390,height:844}]){
   await page.setViewportSize(size);await checkLayout('portfolio-'+size.width);
   await retain('portfolio-'+size.width+'.png',await page.screenshot({fullPage:true}));
  }
  const auth=app.url.split('#')[1];
  const get=async path=>{
   const response=await fetch(app.origin+path,{headers:{Authorization:'Bearer '+auth}});
   need(response.ok,'Original read failed: '+path);return response.json();
  };
  const before=await get('/api/state');need(before.id===expectedWorkspaceId&&before.revision===expectedRevision,'Authenticated customer identity differs.');
  for(const profile of state.profiles){
   await go('pass/'+profile.id);await checkLayout('pass-'+profile.id);
   await go('pass/'+profile.id+'/history');await checkLayout('history-'+profile.id);
   const detail=await get('/api/profiles/'+profile.id);
   for(const call of detail.calls){
    await go('call/'+call.id);await checkLayout('request-'+call.id);
    const originalCall=await get('/api/calls/'+call.id);
    if(originalCall.call.result){
     const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download exact response',exact:true}).click();
     const download=await event,bytes=await readFile(await download.path());
     need(hash(bytes)===originalCall.call.result.sha256&&bytes.length===originalCall.call.result.bytes,'Original response bytes changed.');
     const filename='response-'+call.id+'.bin';await retain(filename,bytes);downloads.push({callId:call.id,...artifacts.at(-1)});
    }
   }
  }
  const compose=state.profiles.find(p=>!p.archived&&(p.detail?.plan?.routes?.length??0)>0);
  if(compose){
   await go('pass/'+compose.id+'/compose');
   const id=await page.getByLabel('Stable request ID',{exact:true}).inputValue();
   const label='Navigation review draft — no request dispatched';
   await page.getByLabel('Request label',{exact:true}).fill(label);
   await page.getByLabel('Text / JSON body',{exact:true}).fill('{"review":"local draft only"}');
   await page.reload();await ready();
   need(await page.getByLabel('Stable request ID',{exact:true}).inputValue()===id,'A reload changed the original draft request identity.');
   need(await page.getByLabel('Request label',{exact:true}).inputValue()===label,'The retained request draft changed.');
   await checkLayout('request-draft-phone');
  }
  for(const route of ['recovery/0','actions','connect','attach','purchase']){
   await go(route);await checkLayout(route);
   if(route==='recovery/0')await retain('recovery-phone.png',await page.screenshot({fullPage:true}));
  }
  await go('home');await page.setViewportSize({width:1280,height:900});
  await retain('customer-final.png',await page.screenshot({fullPage:true}));
  const after=await get('/api/state');need(JSON.stringify(before)===JSON.stringify(after),'Read-only navigation changed the returned original customer.');
  need(blocked.length===0,'The navigation attempted a mutation or external request.');need(failures.length===0,'The customer browser raised an exception.');
  await context.close();await browser.close();browser=null;await app.close();app=null;
  const reopened=await readFile(statePath);need(reopened.equals(original),'The original workspace bytes changed during navigation.');
  const result={schema:input.schema,inputSha256,complete:true,workspaceId:state.id,revision:state.revision,
   stateSha256:hash(original),profiles:state.profiles.length,portfolioPages,visits,downloads,artifacts,browserErrors:failures,
   blockedRequests:blocked,apiCalls:0,purchases:0,refreshes:0,customerStateUnchanged:true,completedAt:new Date().toISOString()};
  await publish(resultPath,result);return result;
 }catch(error){
  await writeFile(join(directory,'failure-'+Date.now()+'.json'),JSON.stringify({inputSha256,error:error.message,visits,failures,blocked,artifacts},null,2)+'\n',{mode:0o600});throw error;
 }finally{await browser?.close();await app?.close();}
}
export async function main(argv=process.argv.slice(2)){
 need(argv.length===1,'Pass one complete navigation programme input file.');
 const result=await runCustomerNavigationProgramme(JSON.parse(await readFile(argv[0],'utf8')));
 process.stdout.write(JSON.stringify(result)+'\n');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{process.stderr.write(JSON.stringify({error:e.message})+'\n');process.exitCode=1;});

