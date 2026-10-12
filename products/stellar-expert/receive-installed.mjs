#!/usr/bin/env node
// MIT. Complete installed receiving, using original saved data and Applications lifetimes.
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {privateDirectory,makePrivate,readJSON,saveJSON,operationLease,canonical,json,need,now,regular} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import {prepareProductOperation,saveProductOperation,connectProductOperation,startProductOperation,
 inspectProductOperation,controlProductOperation,openProductOperation,connectProductMerchant,productClient,
 productFiles,exportProductHandover,productDefinition} from './installed.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const original=result=>{need(result?.ok===true,'INSTALLED_ORIGINAL_TOOL_REJECTED');return result.native;};
const errorView=error=>({code:error.code??'INSTALLED_RECEIVING_FAILED',message:String(error.message??error).slice(0,2000)});
async function folder(path){try{await makePrivate(path);}catch(error){if(error.code!=='EEXIST')throw error;await privateDirectory(path);}}
async function waitFor(read,predicate,label,seconds=180){
 const deadline=Date.now()+seconds*1000;let current;
 do{current=await read();if(predicate(current))return current;await delay(1500);}while(Date.now()<deadline);
 throw Object.assign(new Error('Continue the retained original operation after '+label+'.'),{code:'INSTALLED_OPERATION_CONTINUATION_REQUIRED',current});
}
export async function receiveInstalledProducts(input){
 need(input?.schema==='stellar-forge.two-product-installed-receiving.v1'&&
  typeof input.operationId==='string'&&/^[a-z0-9][a-z0-9-]{7,100}$/.test(input.operationId)&&
  Array.isArray(input.products)&&input.products.length>0&&input.products.length<=2,'INSTALLED_RECEIVING_INPUT_REQUIRED');
 const kinds=new Set();
 for(const item of input.products){
  need(!kinds.has(item.request?.product),'INSTALLED_PRODUCT_REPEATED');kinds.add(item.request.product);
  productDefinition(item.request.product);
  need(item.request.workspaceId&&typeof item.editionId==='string'&&typeof item.receiptId==='string'&&
   Array.isArray(item.intentIds)&&item.intentIds.length>0&&Array.isArray(item.runIds)&&item.runIds.length===2&&item.runIds[0]!==item.runIds[1]&&
   Array.isArray(item.exportIds)&&item.exportIds.length>0,'INSTALLED_ORIGINAL_SELECTION_REQUIRED');
 }
 const root=resolve(input.directory);await folder(root);const lease=await operationLease(join(root,'receiving.lock'));
 const inputSha256=hash(json(canonical(input))),journalFile=join(root,'journal.json'),resultFile=join(root,'result.json');
 let journal,browser,context,merchant,client,currentOwnedRun,failure,result;const cleanupErrors=[];
 const save=async()=>{journal.updatedAt=now();await saveJSON(journalFile,journal,true);};
 const close=async(name,fn)=>{try{await fn();}catch(error){cleanupErrors.push({resource:name,...errorView(error)});}};
 try{
  journal=await readJSON(journalFile,true)??{schema:'stellar-forge.two-product-installed-receiving-journal.v1',
   operationId:input.operationId,inputSha256,createdAt:now(),products:{}};
  need(journal.inputSha256===inputSha256,'INSTALLED_RECEIVING_SELECTION_CHANGED');
  const previous=await readJSON(resultFile,true);
  if(previous?.state==='COMPLETE'){need(previous.inputSha256===inputSha256,'INSTALLED_COMPLETED_SELECTION_CHANGED');result={...previous,reused:true};}
  else{
  await save();
  for(const item of input.products){
   const product=productDefinition(item.request.product),directory=resolve(item.operationDirectory),artifacts=join(root,product.folder);
   await folder(artifacts);
   let record=journal.products[item.request.product];
   if(!record){record={product:item.request.product,workspaceId:item.request.workspaceId,editionId:item.editionId,
    receiptId:item.receiptId,intentIds:item.intentIds,runs:{},downloads:{}};journal.products[item.request.product]=record;await save();}
   if(record.state==='COMPLETE')continue;
   await prepareProductOperation({directory,request:item.request});await saveProductOperation({directory});
   await connectProductOperation({directory});
   const bound=await waitFor(()=>inspectProductOperation({directory}),v=>!!v.application?.release,'original managed runtime attachment');
   record.runtime=bound.runtime;record.applicationId=bound.applicationId;await save();
   const sourceRoot=join(item.request.runtimeDirectory,'package','source');
   const {startMerchantMcp}=await import(pathToFileURL(join(sourceRoot,'stellar-forge/mcp-merchant-operator/serve.mjs')));
   for(let pass=0;pass<2;pass++){
    record.passRunIds??={};
    let runId=record.passRunIds[pass]??item.runIds[pass];
    record.passRunIds[pass]=runId;record.runs[runId]??={id:runId,pass,steps:[]};let run=record.runs[runId];
    if(run.closedAt&&run.operatingWorkComplete)continue;
    let selected=await inspectProductOperation({directory,runId});
    if(run.stopRequestedAt&&selected.selectedRun){
     await controlProductOperation({directory,runId,action:'stop'});
     selected=await waitFor(()=>inspectProductOperation({directory,runId}),v=>!v.selectedRun?.active,'original application stop');
     run.closedAt??=now();await save();
     if(run.operatingWorkComplete)continue;
    }
    if(selected.selectedRun&&!selected.selectedRun.active&&(selected.selectedRun.stop||run.closedAt)){
     // A stopped, incomplete browser pass needs a linked reopen, never replay of a cancelled start.
     const previousRunId=runId;runId=randomUUID();record.passRunIds[pass]=runId;
     run={id:runId,pass,previousRunId,reason:'Continue the same saved workspace after the original closed run.',steps:[]};
     record.runs[runId]=run;await save();selected=await inspectProductOperation({directory,runId});
    }
    if(!selected.selectedRun)await startProductOperation({directory,runId});
    else if(!selected.selectedRun.active&&!selected.selectedRun.stop){
     await controlProductOperation({directory,runId,action:'recover'});
    }
    currentOwnedRun={directory,runId,record:run};
    selected=await waitFor(()=>inspectProductOperation({directory,runId}),v=>v.selectedRun?.active,'original product launch');
    const opened=await waitFor(async()=>{try{return await openProductOperation({directory,runId});}
     catch(error){if(['PRODUCT_APPLICATION_NOT_OPEN','PRODUCT_WORKSPACE_UNREACHABLE'].includes(error.code))return null;throw error;}},
     value=>!!value,'original authenticated startup');
    need(opened.workspaceId===item.request.workspaceId,'INSTALLED_WORKSPACE_CHANGED');
    run.openedAt??=now();run.origin=new URL(opened.url).origin;await save();
    const connection=await connectProductMerchant({directory,runId});
    merchant=await startMerchantMcp({configPath:connection.configuration,port:0,environment:process.env});
    client=await productClient({directory,url:merchant.url,environment:process.env,expectedWorkspaceId:item.request.workspaceId});
    const prefix=item.request.product==='nws'?'merchant_nws_':'merchant_stellar_expert_';
    const tools=merchant.operator.tools.filter(tool=>tool.name.startsWith(prefix));
    need(tools.length===product.tools&&new Set(tools.map(tool=>tool.name)).size===product.tools,'INSTALLED_TOOL_FAMILY_CHANGED');
    const aliases=await client.call('workspaces');need(aliases.configured&&aliases.workspaces.some(w=>w.workspaceId===item.request.workspaceId),'INSTALLED_MCP_ALIAS_CHANGED');
    const schema=original(await client.call('schema')),view=original(await client.call('view'));
    need(schema.schema===product.workspaceSchema&&view.workspaceId===item.request.workspaceId,'INSTALLED_MCP_WORKSPACE_CHANGED');
    const edition=original(await client.call('edition',{editionId:item.editionId}));
    need(edition.id===item.editionId&&Array.isArray(edition.pages)&&edition.pages.length>0,'INSTALLED_SOURCE_EDITION_REQUIRED');
    const receipt=view.receipts.find(row=>row.id===item.receiptId);
    need(receipt&&JSON.stringify(receipt.intentIds)===JSON.stringify(item.intentIds)&&receipt.downloads.length===5,'INSTALLED_CUSTOMER_RECEIPT_CHANGED');
    if(item.expectedRows!==undefined)need(receipt.dataset.rows===item.expectedRows,'INSTALLED_CUSTOMER_ROWS_CHANGED');
    record.original={tools:tools.map(tool=>tool.name),sourcePages:edition.pages.length,sourceId:edition.id,
     receiptId:receipt.id,intentIds:receipt.intentIds,dataset:receipt.dataset,files:receipt.downloads.map(f=>({name:f.name,bytes:f.bytes,sha256:f.sha256}))};
    await save();
    if(!browser){
     const require=createRequire(import.meta.url),{chromium}=require(input.playwrightModule??'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
     browser=await chromium.launch({executablePath:input.chromiumExecutable,headless:true,
      args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--renderer-process-limit=1']});
    }
    context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
    const page=await context.newPage(),pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
    await page.goto(opened.url);
    await page.waitForFunction(kind=>kind==='nws'?typeof S!=='undefined'&&S.schema&&S.view&&!S.refreshing:
     typeof ui!=='undefined'&&ui.schema&&ui.view&&!ui.busy,item.request.product,{timeout:60000});
    for(const width of [1280,390]){
     await page.setViewportSize({width,height:width===390?844:900});
     for(const section of product.sections){
      await page.locator('nav [data-view="'+section+'"]').click();
      const shape=await page.evaluate(()=>({width:innerWidth,actual:document.documentElement.scrollWidth}));
      need(shape.actual<=shape.width+1,'INSTALLED_OPERATOR_LAYOUT_OVERFLOW');
      const file=join(artifacts,'run-'+pass+'-'+width+'-'+section+'.png');await page.screenshot({path:file,fullPage:true});
      run.steps.push({kind:'operator-view',section,width,path:file});
     }
    }
    need(pageErrors.length===0,'INSTALLED_OPERATOR_PAGE_ERRORS');
    await context.close();context=null;
    const downloads=[...edition.pages.flatMap((page,index)=>[{key:'source-'+index,kind:'source',id:item.editionId,page:index},
     ...(item.request.product==='nws'&&page.responseSha256&&page.responseSha256!==page.sha256?
      [{key:'wire-'+index,kind:'source',id:item.editionId,page:index,wire:true}]:[])]),
     {key:'customer',kind:'receipt',id:item.receiptId},...item.exportIds.map((id,index)=>({key:'export-'+index,kind:'export',id}))];
    for(const selectedFile of downloads){
     const {key,...selection}=selectedFile,out=join(artifacts,key);
     const options={...selection,url:merchant.url,directory:out};
     const inspected=await productFiles({directory,action:'inspect',selection:options});
     const prior=record.downloads[key];
     if(prior)need(prior.manifestSha256===inspected.manifestSha256,'INSTALLED_SELECTED_FILES_CHANGED');
     if(selection.kind==='receipt')need(inspected.manifest.files.length===5,'INSTALLED_CUSTOMER_FILE_COUNT_CHANGED');
     await productFiles({directory,action:'receive',selection:{...options,expectedManifestSha256:inspected.manifestSha256}});
     const reopened=await productFiles({directory,action:'reopen',selection:{directory:out,expectedManifestSha256:inspected.manifestSha256}});
     need(reopened.state==='COMPLETE'&&reopened.workspaceId===item.request.workspaceId,'INSTALLED_OFFLINE_RECEIVING_REQUIRED');
     record.downloads[key]={directory:out,manifestSha256:inspected.manifestSha256,files:inspected.manifest.files,
      source:selection,verifiedAt:now()};await save();
    }
    run.steps.push({kind:'original-tools-source-and-customer-files',tools:tools.length,files:Object.keys(record.downloads).length});
    run.operatingWorkComplete=true;await save();
    await client.close();client=null;await merchant.close();merchant=null;
    run.stopRequestedAt=now();await save();
    await controlProductOperation({directory,runId,action:'stop'});
    await waitFor(()=>inspectProductOperation({directory,runId}),v=>!v.selectedRun?.active,'original application stop');
    run.closedAt=now();currentOwnedRun=null;await save();
   }
   need([0,1].every(pass=>record.runs[record.passRunIds[pass]]?.closedAt&&record.runs[record.passRunIds[pass]].operatingWorkComplete),'INSTALLED_ORIGINAL_RUNS_NOT_CLOSED');
   record.handover=await exportProductHandover({directory});record.state='COMPLETE';await save();
  }
  result={schema:'stellar-forge.two-product-installed-receiving.v1',state:'COMPLETE',operationId:input.operationId,inputSha256,
   products:journal.products,completedAt:now()};
  }
 }catch(error){failure=error;}
 finally{
  await close('MCP client',()=>client?.close());await close('MCP merchant',()=>merchant?.close());
  await close('browser context',()=>context?.close());await close('browser',()=>browser?.close());
  if(currentOwnedRun)await close('original Applications run',async()=>{
   currentOwnedRun.record.stopRequestedAt??=now();await save();
   await controlProductOperation({...currentOwnedRun,action:'stop'});
   await waitFor(()=>inspectProductOperation(currentOwnedRun),v=>!v.selectedRun?.active,'original application cleanup',60);
  });
  if(failure||cleanupErrors.length){
   journal??={schema:'stellar-forge.two-product-installed-receiving-journal.v1',operationId:input.operationId,inputSha256};
   journal.state='CONTINUATION_REQUIRED';journal.error={...(failure?errorView(failure):{code:'INSTALLED_CLEANUP_FAILED'}),cleanupErrors};
   try{await save();}catch(error){(failure??=error).journalError=errorView(error);}
  }
  try{await lease.close();}catch(error){cleanupErrors.push({resource:'receiving lease',...errorView(error)});}
 }
 if(failure||cleanupErrors.length){
  journal.state='CONTINUATION_REQUIRED';journal.error={...(failure?errorView(failure):{code:'INSTALLED_CLEANUP_FAILED'}),cleanupErrors};
  try{await save();}catch(error){failure??=error;}
  throw Object.assign(failure??new Error('Original receiving cleanup remains incomplete.'),{cleanupErrors});
 }
 if(result.reused)return result;
 // A COMPLETE record follows actual closure of every owned process and its original run.
 journal.state='COMPLETE';journal.completedAt=now();await save();await saveJSON(resultFile,result,true);
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const path=process.argv[2];
 if(!path||process.argv.length!==3)throw new Error('Use node receive-installed.mjs PRIVATE_INPUTS_JSON');
 receiveInstalledProducts(await readJSON(resolve(path))).then(result=>process.stdout.write(json(result))).catch(error=>{
  process.stderr.write(json({state:'CONTINUATION_REQUIRED',...errorView(error),cleanupErrors:error.cleanupErrors}));process.exitCode=1;
 });
}
