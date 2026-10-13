// SPDX-License-Identifier: MIT
// A continuation of the selected merchant/runtime owner; no second native job controller.
import {randomBytes} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {open,link,unlink,lstat} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {startCustomerDeskServer} from '../server.mjs';
import {readDeskConnection} from '../workspace.mjs';
import {selectedSource,inspectCustomerPacket,receiveCustomerPacket} from '../portable.mjs';
import {need,plain,HASH,bytes,parse,read,readJSON,maybeJSON,identity,same,privateDirectory,pathAt,atomic,immutable,measure,leased,syncDir}
 from '../../../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/files.mjs';

const SCHEMA='stellar-forge.odata-customer-desk-receiving.v1';
const SOURCE_ROOT=fileURLToPath(new URL('../../../../',import.meta.url));
const stamp=s=>['dev','ino','size','mtimeNs','ctimeNs'].map(k=>String(s[k])).join(':');
const relativeName=name=>{need(typeof name==='string'&&/^[A-Za-z0-9_./-]+$/.test(name)&&!name.startsWith('/')&&!name.split('/').some(x=>!x||x==='.'||x==='..'),'DESK_PROGRAMME_PATH','Keep an operation-relative artifact path.');return name;};
async function exists(path){try{return await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function checked(path,expected){const actual=await measure(path,2*1024*1024*1024);need(same(actual,{bytes:expected.bytes,sha256:expected.sha256}),'DESK_PROGRAMME_FILE','A retained programme artifact changed.');return actual;}
async function closeOwned(owner,name,progress){
 // Do not release the original programme lease after an unconfirmed close.
 while(owner){try{await owner.close();return;}catch(error){try{await progress({stage:'closing-original-owner',owner:name,error:String(error.message??error)});}catch{}await delay(1000);}}
}
export async function receiveCustomerDesk({
 directory,connection,sourceRoot=SOURCE_ROOT,sourceManifest,profile,editions,
 playwright,chromium,onProgress=async()=>{}
}={}){
 sourceRoot=resolve(sourceRoot);directory=resolve(directory);
 need(sourceRoot===resolve(SOURCE_ROOT)&&directory!==sourceRoot&&!directory.startsWith(sourceRoot+'/'),'DESK_PROGRAMME_SOURCE','Execute this receiver from the selected complete source tree.');
 need(Array.isArray(editions)&&editions.length===2&&editions.every(e=>Number.isSafeInteger(e.revision)&&e.revision>0&&HASH.test(e.manifestSha256)&&Number.isSafeInteger(e.rows)&&e.rows>=0)&&editions[1].revision>editions[0].revision,
  'DESK_PROGRAMME_EDITIONS','Supply two actual reviewed original editions and their full observed row counts.');
 need(typeof chromium==='string'&&chromium.length>0,'DESK_PROGRAMME_BROWSER','Select the existing original Chromium executable.');
 const source=await selectedSource({sourceRoot,sourceManifest});
 const config=await readDeskConnection(connection),selectedProfile=config.profiles.find(p=>p.id===profile);
 need(selectedProfile,'DESK_PROGRAMME_PROFILE','Select one original configured publisher profile.');
 const browserAPI=typeof playwright==='string'?await import(pathToFileURL(resolve(playwright)).href):playwright;
 need(typeof browserAPI?.chromium?.launch==='function','DESK_PROGRAMME_BROWSER','Supply the original installed Playwright module.');
 const selection={schema:SCHEMA,sourceManifest:source.manifest,connection:config.source,profile,editions,
  node:{executable:process.execPath,version:process.version},chromium:resolve(chromium)};
 return leased(directory,async root=>{
  let state=await maybeJSON(root,'operation.json');
  if(state)need(same(state.selection,selection),'DESK_PROGRAMME_CHANGED','Continue the same selected original programme.');
  else{state={schema:SCHEMA,selection,createdAt:new Date().toISOString(),requests:{},steps:{},candidates:{},files:[],origin:null};await atomic(root,'operation.json',state);}
  const save=()=>atomic(root,'operation.json',state);
  const recordFile=async(path,expected,metadata={})=>{
   relativeName(path);await checked(await pathAt(root,path),expected);
   const row={path,bytes:expected.bytes,sha256:expected.sha256,...metadata},prior=state.files.find(f=>f.path===path);
   need(!prior||same(prior,row),'DESK_PROGRAMME_FILE','An original artifact descriptor changed.');
   if(!prior){state.files.push(row);await save();}return row;
  };
  const jsonFile=async(path,value)=>{const raw=bytes(value);await immutable(root,path,raw);return recordFile(path,identity(raw));};
  const reopen=async result=>{
   for(const file of result.files)await checked(await pathAt(root,file.path),file);
   const a=await inspectCustomerPacket(join(root,result.packet.path));
   need(a.sha256===result.packet.sha256&&a.header.customerRevision===editions[1].revision,'DESK_PROGRAMME_PACKET','The complete original received packet changed.');
   return {...result,replayed:true};
  };
  const finished=await maybeJSON(root,'result.json');if(finished)return reopen(finished);
  const candidate=await maybeJSON(root,'result-candidate.json');
  if(candidate){await reopen(candidate);await immutable(root,'result.json',bytes(candidate));return {...candidate,replayed:true};}
  let auth=await maybeJSON(root,'private-auth.json');
  if(!auth){auth={token:randomBytes(32).toString('hex')};await atomic(root,'private-auth.json',auth);}
  let app=null,browser=null,context=null,page=null;const errors=[];
  const api=async(path,body)=>{
   const response=await fetch(app.origin+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+auth.token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const value=await response.json();need(response.ok,'DESK_PROGRAMME_HTTP',(value.error?.message??'The original desk request failed.')+' ['+(value.error?.code??response.status)+']');return value;
  };
  const start=async()=>{
   const port=state.origin?Number(new URL(state.origin).port):0;
   app=await startCustomerDeskServer({directory:join(root,'customer-desk'),connection,sourceRoot,sourceManifest,port,token:auth.token});
   need(!state.origin||state.origin===app.origin,'DESK_PROGRAMME_ORIGIN','Preserve the original browser storage origin.');
   if(!state.origin){state.origin=app.origin;await save();}
  };
  const ready=async()=>{
   await page.waitForFunction(()=>window.odataCustomerDesk?.inspect().storageReady&&!window.odataCustomerDesk.inspect().busy,{},{timeout:120000});
  };
  const login=async()=>{
   await page.goto(app.url,{waitUntil:'domcontentloaded'});await ready();
   if(await page.locator('#profile').inputValue()!==profile){
    const response=page.waitForResponse(r=>r.url().includes('/api/customer?profile='+encodeURIComponent(profile)));
    await page.locator('#profile').selectOption(profile);need((await response).ok(),'DESK_PROGRAMME_PROFILE','The selected customer profile failed to render.');
   }
   await page.waitForFunction(profile=>window.odataCustomerDesk?.inspect().profile===profile&&!document.querySelector('#content').textContent.startsWith('Reading the original'),profile);await ready();
   if(await page.locator('#detail').isVisible())await page.locator('#close-detail').click();
  };
  const pane=async name=>{
   if(await page.locator('#detail').isVisible())await page.locator('#close-detail').click();
   const route=name==='editions'?'/api/editions':name==='rows'?'/api/rows':['history','outputs'].includes(name)?'/api/history':null;
   if(route){const response=page.waitForResponse(r=>r.url().includes(route)&&r.request().method()==='GET');await page.locator('[data-pane="'+name+'"]').click();need((await response).ok(),'DESK_PROGRAMME_UI','The original pane request failed.');}
   else await page.locator('[data-pane="'+name+'"]').click();
   await page.waitForFunction(name=>window.odataCustomerDesk?.inspect().pane===name&&!document.querySelector('#content').textContent.startsWith('Reading the original'),name);
   await ready();
  };
  const panel=id=>page.locator('#content section.panel').filter({has:page.locator('h3',{hasText:id})});
  const action=async(key,kind,payload,openForm)=>{
   if(state.steps[key]){await jsonFile('observations/'+key+'.json',state.steps[key]);return state.steps[key];}
   await onProgress({stage:key,action:kind});
   let request=state.requests[key],result;
   if(request){
    result=await api('/api/actions',request);
    need(result.state==='COMPLETE'&&same(result.request,request),'DESK_PROGRAMME_REQUEST','The replay response differs from its original request.');
    await login();
   }else{
    await openForm();
    for(const [name,value]of Object.entries(payload)){
     const field=page.locator('#fields [name="'+name+'"]');if(await field.count()){
      if(await field.evaluate(e=>e.tagName==='SELECT'))await field.selectOption(String(value));else await field.fill(String(value));
     }
    }
    let routeError=null;
    const handler=async route=>{
     try{
      const incoming=route.request().postDataJSON();
      need(incoming.action===kind&&incoming.profile===profile&&same(incoming.payload,payload),'DESK_PROGRAMME_REQUEST','The UI selected another original operation.');
      need(!state.requests[key]||same(state.requests[key],incoming),'DESK_PROGRAMME_REQUEST','The UI tried to replace a saved request.');
      state.requests[key]=incoming;await save();await route.continue();
     }catch(error){routeError=error;await route.abort('failed');}
    };
    await page.route('**/api/actions',handler);
    try{
     const response=page.waitForResponse(r=>r.url()===app.origin+'/api/actions'&&r.request().method()==='POST',{timeout:180000});
     await page.locator('#submit-action').click();
     const received=await response;result=await received.json();
     if(routeError)throw routeError;
     need(received.ok()&&result.state==='COMPLETE'&&same(result.request,state.requests[key]),'DESK_PROGRAMME_REQUEST','The exact original browser operation did not complete.');
     await ready();
    }finally{await page.unroute('**/api/actions',handler);}
   }
   state.steps[key]=result;await save();await jsonFile('observations/'+key+'.json',result);
   if(await page.locator('#detail').isVisible())await page.locator('#close-detail').click();
   return result;
  };
  const review=async(key,edition,mode)=>{
   await pane('editions');
   const list=await api('/api/editions?profile='+encodeURIComponent(profile)+'&offset=0&limit=100');
   const index=list.items.findIndex(e=>e.revision===edition.revision&&e.manifestSha256===edition.manifestSha256);
   need(index>=0&&index<50,'DESK_PROGRAMME_EDITIONS','Select the actual first-page reference editions; the original API keeps the full catalogue available.');
   return action(key,'review',{toRevision:edition.revision,expectedEditionSha256:edition.manifestSha256,mode,note:'Review original source, query scope and edition '+edition.revision+' for '+mode+' receiving.'},
    ()=>page.locator('[data-review-edition="'+index+'"]').click());
  };
  const receive=async(key,review)=>{
   await pane('history');return action(key,'receive',{reviewRequestId:review.request.requestId,note:'Receive the complete reviewed original edition and preserve its native chain.'},
    ()=>panel(review.request.requestId).locator('[data-receive]').click());
  };
  const output=async(key,kind,edition)=>{
   await pane('outputs');return action(key,kind,{expectedRevision:edition.revision,expectedEditionSha256:edition.manifestSha256,title:'Complete customer edition '+edition.revision},
    ()=>page.locator('#'+kind).click());
  };
  const restore=async(key,record)=>{
   await pane('outputs');return action(key,'restore',{exportRequestId:record.request.requestId,note:'Independently restore every original native member.'},
    ()=>panel(record.request.requestId).locator('[data-restore]').click());
  };
  const capture=async(name,width)=>{
   const path='browser/'+name+'-'+width+'.png',key='png:'+path;
   let selected=state.candidates[key];
   if(!selected){
    await page.setViewportSize({width,height:1000});await ready();
    const dimensions=await page.evaluate(()=>({width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight}));
    need(dimensions.documentWidth<=width+1,'DESK_PROGRAMME_LAYOUT','The customer desk overflows the selected viewport.');
    const raw=await page.screenshot({fullPage:true});selected={path,...identity(raw),dimensions,base64:raw.toString('base64')};state.candidates[key]=selected;await save();
   }
   const raw=Buffer.from(selected.base64,'base64');need(same(identity(raw),{bytes:selected.bytes,sha256:selected.sha256}),'DESK_PROGRAMME_PNG','The retained original screenshot candidate changed.');
   await immutable(root,path,raw);await recordFile(path,selected,{kind:'screenshot',dimensions:selected.dimensions});
  };
  const download=async(name,record,member)=>{
   const path='downloads/'+name,target=await pathAt(root,path,{create:true}),expected={bytes:member.bytes,sha256:member.sha256};
   const intentKey='download:'+path;const intent={requestId:record.request.requestId,member:member.path??member.filename,...expected};
   if(state.candidates[intentKey])need(same(state.candidates[intentKey],intent),'DESK_PROGRAMME_DOWNLOAD','Preserve the exact selected original download.');
   else{state.candidates[intentKey]=intent;await save();}
   if(await exists(target)){await checked(target,expected);return recordFile(path,expected,{kind:'download'});}
   await pane('outputs');
   const container=panel(record.request.requestId),anchor=container.locator('a').filter({hasText:member.path??'Download complete customer/source package'}).first();
   const event=page.waitForEvent('download',{timeout:180000});await anchor.click();const selected=await event;
   const temporary=target+'.download-'+randomBytes(8).toString('hex');await selected.saveAs(temporary);
   const handle=await open(temporary,'r');try{await handle.sync();}finally{await handle.close();}
   await checked(temporary,expected);
   try{await link(temporary,target);}catch(error){if(error.code!=='EEXIST')throw error;await checked(target,expected);}
   await unlink(temporary);await syncDir(dirname(target));return recordFile(path,expected,{kind:'download'});
  };
  let final;
  try{
   await start();
   // Reopen original publisher identities before any receiving selection.
   for(const e of editions){
    const listing=await app.desk.editions({profile,offset:e.revision-1,limit:1});
    need(listing.items[0]?.manifestSha256===e.manifestSha256,'DESK_PROGRAMME_EDITION','The selected original publisher edition changed.');
   }
   browser=await browserAPI.chromium.launch({executablePath:resolve(chromium),headless:true});
   context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});page=await context.newPage();
   page.on('pageerror',e=>errors.push(String(e.message??e)));await login();
   const baseline=editions[0],latest=editions[1];
   const r0=await review('baseline-review',baseline,'baseline'),c0=await receive('baseline-receive',r0);
   need(c0.result.customer.revision===baseline.revision&&c0.result.customer.rows===baseline.rows,'DESK_PROGRAMME_CUSTOMER','The full baseline differs from its actual source selection.');
   const b0=await output('baseline-backup','backup',baseline),b1=await restore('baseline-independent-restore',b0);
   need(b1.result.customer.editionSha256===baseline.manifestSha256,'DESK_PROGRAMME_RESTORE','The original baseline restore differs.');
   const r1=await review('recurring-review',latest,'continue'),c1=await receive('recurring-receive',r1);
   need(c1.result.customer.revision===latest.revision&&c1.result.customer.rows===latest.rows,'DESK_PROGRAMME_CUSTOMER','The full recurring customer differs from its source selection.');
   await pane('history');
   await action('customer-acceptance','accept',{receivingRequestId:c1.request.requestId,decision:'accepted',note:'Complete native edition and original row count received; retain source/query context and all output formats.'},
    ()=>panel(c1.request.requestId).locator('[data-accept]').click());
   const a0=await output('recurring-analysis','analysis',latest),a1=await restore('analysis-independent-restore',a0);
   need(a1.result.customer.editionSha256===latest.manifestSha256&&a1.result.customer.rows===latest.rows,'DESK_PROGRAMME_RESTORE','The complete Analysis proof did not reproduce the current customer.');
   const h0=await review('historical-review',baseline,'historical'),h1=await receive('historical-receive',h0);
   need(h1.result.customer.editionSha256===baseline.manifestSha256,'DESK_PROGRAMME_HISTORY','The independent historical receiving changed its edition.');
   const changes=await api('/api/published-rows?profile='+encodeURIComponent(profile)+'&revision='+latest.revision+'&sha256='+latest.manifestSha256+'&kind=changes&offset=0&limit=100');
   if(latest.changes!==undefined)need(changes.total===latest.changes,'DESK_PROGRAMME_CHANGES','The original keyed change count differs from the reviewed programme.');
   if(!state.steps['change-observation']){await jsonFile('observations/change-observation.json',changes);state.steps['change-observation']={total:changes.total};await save();}
   let offset=0,total=null;const pages=[];
   do{const rows=await api('/api/rows?profile='+encodeURIComponent(profile)+'&offset='+offset+'&limit=100');
    need(rows.revision===latest.revision&&rows.editionSha256===latest.manifestSha256&&(total===null||rows.total===total),'DESK_PROGRAMME_ROWS','The saved customer changed during full reading.');
    total=rows.total;pages.push(rows);offset=rows.nextOffset;
   }while(offset!==null);
   need(total===latest.rows&&pages.reduce((n,p)=>n+p.items.length,0)===total,'DESK_PROGRAMME_ROWS','The original row read is incomplete.');
   if(!state.steps['all-current-rows']){await jsonFile('observations/all-current-rows.json',pages);state.steps['all-current-rows']={rows:total,editionSha256:latest.manifestSha256};await save();}
   await pane('outputs');
   const packet=await action('complete-output-package','package',{exportRequestId:a0.request.requestId,expectedSourceSha256:source.manifest.sha256},
    ()=>panel(a0.request.requestId).locator('[data-package]').click());
   const csv=a0.result.files.find(f=>f.path==='dataset.csv');need(csv,'DESK_PROGRAMME_OUTPUT','The original complete Analysis CSV is absent.');
   await download('complete-customer.csv',a0,csv);
   const packetFile=await download('complete-customer-source.ndjson',packet,packet.result.packet);
   const portable=await receiveCustomerPacket({path:join(root,packetFile.path),expectedSha256:packetFile.sha256,directory:join(root,'independent-package'),customerDirectory:join(root,'independent-native-customer')});
   const portableReplay=await receiveCustomerPacket({path:join(root,packetFile.path),expectedSha256:packetFile.sha256,directory:join(root,'independent-package'),customerDirectory:join(root,'independent-native-customer')});
   need(portableReplay.replayed&&portable.customer.rows===latest.rows&&portable.customer.editionSha256===latest.manifestSha256,'DESK_PROGRAMME_PACKET','The complete source/customer packet did not restore and reopen.');
   if(!state.steps['portable-receiving']){await jsonFile('observations/portable-receiving.json',{schema:portable.schema,state:portable.state,sha256:portable.sha256,headerSha256:portable.headerSha256,customer:portable.customer,files:portable.files});state.steps['portable-receiving']={sha256:portable.sha256};await save();}
   for(const width of [1440,390])for(const name of ['overview','editions','rows','history','outputs']){await pane(name);await capture(name,width);}
   need(errors.length===0,'DESK_PROGRAMME_BROWSER','The original browser reported errors: '+errors.join('; '));
   await closeOwned(context,'browser context',onProgress);context=null;page=null;
   await closeOwned(browser,'Chromium',onProgress);browser=null;
   await closeOwned(app,'customer desk',onProgress);app=null;
   await start();
   const current=await app.desk.customer(profile),replay=await app.desk.run(c0.request);
   need(current.revision===latest.revision&&current.editionSha256===latest.manifestSha256&&replay.replayed&&same(replay.result,c0.result)&&replay.committedRevision===c0.committedRevision,
    'DESK_PROGRAMME_REOPEN','Reopening or replay replaced the original completed customer history.');
   await jsonFile('observations/reopen.json',{current,originalCommittedRevision:replay.committedRevision,currentRevision:replay.currentRevision,replayed:replay.replayed});
   await closeOwned(app,'reopened customer desk',onProgress);app=null;
   final={schema:SCHEMA,complete:true,createdAt:state.createdAt,completedAt:new Date().toISOString(),sourceManifest:source.manifest,
    profile,editions,current:{revision:current.revision,editionSha256:current.editionSha256,rows:current.rows},
    requests:Object.fromEntries(Object.entries(state.requests).map(([k,r])=>[k,r.requestId])),packet:packetFile,files:state.files,
    ownersClosedAt:new Date().toISOString(),pageErrors:[]};
  }finally{
   if(context){await closeOwned(context,'browser context',onProgress);context=null;page=null;}
   if(browser){await closeOwned(browser,'Chromium',onProgress);browser=null;}
   if(app){await closeOwned(app,'customer desk',onProgress);app=null;}
  }
  await atomic(root,'result-candidate.json',final);await reopen(final);await immutable(root,'result.json',bytes(final));
  await onProgress({stage:'complete',files:final.files.length,edition:final.current.revision,rows:final.current.rows});return {...final,replayed:false};
 });
}
