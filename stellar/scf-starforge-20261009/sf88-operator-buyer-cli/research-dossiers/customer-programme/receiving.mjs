// MIT. Customer receiving through the original browser, Merchant and portable dossier.
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {withPrivateLock} from '../../../sf30-seller-sdk/routescan/quota.mjs';
import {openDossierStore} from '../dossier.mjs';
import {openPortableFile} from '../portable.mjs';
import {startDossierWorkspace} from '../server.mjs';
import {runCitationReviewMerchant} from '../citation-review-merchant.mjs';
import {need,object,absolute,key,member,directory,exists,value,retain,retainBytes,read,
  checked,descriptor,verifyFiles,requireRevision,same,digest,publicFiles} from './retention.mjs';

export async function runCustomerMerchantReceiving({url,workspaceDirectory,dossierId,currentRevision,reviews,directory:root}){
  await directory(root);const resultFile=join(root,'merchant-receiving.json');
  const selection={dossierId,currentRevision,origin:new URL(url).origin,workspaceDirectory,
    reviews:reviews.map(row=>({key:row.key,request:row.request,review:row.review}))};
  await retain(join(root,'selection.json'),selection);
  if(await exists(resultFile)){
    const result=await value(resultFile);need(same(result.selection,selection),'CUSTOMER_MERCHANT_SELECTION_CHANGED');
    await verifyFiles(result.files);return result;
  }
  const received=[],files=[];
  for(const selected of reviews){
    const review=selected.review,runDirectory=await directory(join(root,key(selected.key)));
    const original=await runCitationReviewMerchant({url,workspaceDirectory,runDirectory,dossierId,
      noticeId:review.noticeId,selection:{reviewId:review.id,originalRevision:review.originalRevision,
        reviewedRevision:review.revision,currentRevision},reviewRequest:selected.request});
    need(original.reviewId===review.id&&original.workspaceId&&Array.isArray(original.nativeOutputs),
      'CUSTOMER_ORIGINAL_MERCHANT_RECEIVING_CHANGED');
    for(const item of original.nativeOutputs){
      const file={file:item.path,bytes:item.bytes,sha256:item.sha256};
      await checked(file);files.push({...file,name:key(selected.key)+'/'+member(item.filename),kind:'merchant'});
    }
    received.push({key:selected.key,original});
  }
  const result={schema:'sf88.research-customer-merchant-receiving.v1',selection,received,files};
  await retain(resultFile,result);return result;
}

export async function runCustomerBrowserReceiving({client,url,dossierId,currentRevision,reviews,
  directory:root,playwrightModule,chromiumExecutable}){
  await directory(root);absolute(playwrightModule);absolute(chromiumExecutable);
  const connection=new URL(url),origin=connection.origin,token=new URLSearchParams(connection.hash.slice(1)).get('token');
  need(connection.protocol==='http:'&&connection.hostname==='127.0.0.1'&&/^[a-f0-9]{64}$/.test(token??''),
    'CUSTOMER_ORIGINAL_BROWSER_LISTENER_REQUIRED');
  const input={dossierId,currentRevision,origin,playwrightModule,chromiumExecutable,
    reviews:reviews.map(row=>({key:row.key,requestId:row.request.requestId,reviewId:row.review.id,
      noticeId:row.review.noticeId,originalRevision:row.review.originalRevision,reviewedRevision:row.review.revision}))};
  await retain(join(root,'selection.json'),input);
  const resultFile=join(root,'browser-receiving.json'),outputs=await directory(join(root,'files')),
    candidates=await directory(join(root,'retained-downloads'));
  if(await exists(resultFile)){
    const result=await value(resultFile);need(same(result.selection,input),'CUSTOMER_BROWSER_SELECTION_CHANGED');
    await verifyFiles(result.files);return result;
  }
  await requireRevision(client,dossierId,currentRevision);
  const loaded=await import(pathToFileURL(playwrightModule).href),chromium=loaded.chromium??loaded.default?.chromium;
  need(chromium?.launchPersistentContext,'CUSTOMER_ORIGINAL_PLAYWRIGHT_REQUIRED');
  let context;const denied=[],pageErrors=[],observations=[];
  // Complete response bytes are retained before publication. An interrupted
  // download never silently becomes a newly timed export on a later run.
  async function artifact(name,make){
    member(name);const target=join(outputs,...name.split('/')),
      pending=join(candidates,...name.split('/'))+'.json';
    let candidate;
    if(await exists(pending))candidate=await value(pending);
    else{
      const body=Buffer.from(await make());
      need(!body.includes(Buffer.from(token)),'CUSTOMER_BROWSER_SESSION_IN_OUTPUT');
      candidate={name,bytes:body.length,sha256:digest(body),bodyBase64:body.toString('base64')};
      await retain(pending,candidate);
    }
    const body=Buffer.from(candidate.bodyBase64??'','base64');
    need(candidate.name===name&&body.toString('base64')===candidate.bodyBase64&&
      body.length===candidate.bytes&&digest(body)===candidate.sha256,'CUSTOMER_BROWSER_RETAINED_DOWNLOAD_CHANGED');
    await retainBytes(target,body);return {name,file:target,bytes:body.length,sha256:candidate.sha256};
  }
  try{
    context=await chromium.launchPersistentContext(await directory(join(root,'browser-profile')),{
      executablePath:chromiumExecutable,headless:true,acceptDownloads:true,serviceWorkers:'block',
      viewport:{width:1440,height:1000},
      args:['--no-sandbox','--disable-dev-shm-usage','--disk-cache-size=1048576','--media-cache-size=1048576']
    });
    context.setDefaultTimeout(30000);
    await context.route('**/*',async route=>{
      const request=route.request(),target=new URL(request.url());
      if(target.origin!==origin||!['GET','HEAD'].includes(request.method())){
        denied.push({method:request.method(),origin:target.origin,path:target.pathname});
        await route.abort('blockedbyclient');return;
      }
      await route.continue();
    });
    const page=context.pages()[0]??await context.newPage();
    page.on('pageerror',error=>pageErrors.push(String(error.message).split(token).join('[session]')));
    page.on('dialog',dialog=>{void(dialog.type()==='beforeunload'?dialog.accept():dialog.dismiss()).catch(()=>{});});
    const target=new URL('/',origin);
    target.hash=new URLSearchParams({token,dossier:dossierId,view:'citation-review'}).toString();
    await page.goto(target.href,{waitUntil:'domcontentloaded'});
    await page.locator('#citation-review-tab').waitFor({state:'visible'});
    await page.locator('#workspace[aria-busy="false"]').waitFor();
    if(!await page.locator('#view-citation-review').isVisible())await page.locator('#citation-review-tab').click();
    async function chooseNotice(noticeId){
      // The original UI owns its full pagination and sorting.
      const visited=new Set();
      await page.locator('#citation-notice-list [data-notice-id]').first().waitFor({state:'visible'});
      while(!await page.locator('[data-notice-id="'+noticeId+'"]').count()){
        const list=await page.locator('#citation-notice-list [data-notice-id]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-notice-id')));
        const fingerprint=JSON.stringify(list);need(!visited.has(fingerprint),'CUSTOMER_BROWSER_NOTICE_PAGE_REPEATED');visited.add(fingerprint);
        const next=page.locator('#view-citation-review .cr-pagination').getByRole('button',{name:'Next',exact:true});
        need(await next.count()===1&&await next.isEnabled(),'CUSTOMER_BROWSER_SELECTED_NOTICE_NOT_FOUND');
        await next.click();
        await page.waitForFunction(previous=>{const ids=Array.from(document.querySelectorAll('#citation-notice-list [data-notice-id]'),
          node=>node.getAttribute('data-notice-id'));return ids.length>0&&JSON.stringify(ids)!==previous;},fingerprint);
        await page.locator('#workspace[aria-busy="false"]').waitFor();
      }
      await page.locator('[data-notice-id="'+noticeId+'"]').click();
      await page.locator('#citation-review-form').waitFor({state:'visible'});
    }
    const files=[];
    for(let index=0;index<reviews.length;index++){
      const selected=reviews[index],review=selected.review;
      // A new navigation returns to page one for a different notice, preserving
      // the actual native UI navigation instead of guessing a row or page.
      if(index){
        await page.goto(target.href,{waitUntil:'domcontentloaded'});
        await page.locator('#workspace[aria-busy="false"]').waitFor();
        if(!await page.locator('#view-citation-review').isVisible())await page.locator('#citation-review-tab').click();
      }
      const actual=await client.citationUpdates(dossierId,{noticeId:review.noticeId,revision:currentRevision});
      need(actual.detail.reviews.some(row=>same(row,review)),'CUSTOMER_BROWSER_SAVED_REVIEW_CHANGED');
      await chooseNotice(review.noticeId);
      const history=page.locator('#citation-notice-detail .cr-history-row').filter({hasText:review.id});
      await history.waitFor({state:'visible'});
      const exports=[
        {label:'previous',revision:review.originalRevision,button:'HTML',extension:'html'},
        {label:'reviewed',revision:review.revision,button:'Markdown',extension:'md'},
        {label:'reviewed',revision:review.revision,button:'Portable dossier',extension:'json.gz'}
      ];
      for(const item of exports){
        const row=history.locator('.cr-report-row').filter({hasText:
          (item.label==='previous'?'Previous':'Reviewed')+' report · revision '+item.revision});
        const filename=key(selected.key)+'/'+item.label+'.'+item.extension;
        const file=await artifact(filename,async()=>{
          const [download]=await Promise.all([page.waitForEvent('download'),row.getByRole('button',{name:item.button,exact:true}).click()]);
          need(!await download.failure(),'CUSTOMER_BROWSER_DOWNLOAD_FAILED');
          const path=await download.path();need(path,'CUSTOMER_BROWSER_DOWNLOAD_MISSING');
          return read(absolute(path));
        });
        files.push({...file,kind:'browser',reviewId:review.id,revision:item.revision});
      }
      if(index===0)for(const width of [1440,390]){
        await page.setViewportSize({width,height:width===1440?1000:900});
        await history.scrollIntoViewIfNeeded();
        const layout=await page.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth}));
        need(layout.documentWidth<=layout.viewport+1,'CUSTOMER_BROWSER_HORIZONTAL_OVERFLOW');
        const screenshot=await artifact('review-'+width+'.png',()=>page.screenshot({fullPage:false,animations:'disabled'}));
        files.push({...screenshot,kind:'browser-image'});
        observations.push({width,...layout,reviewId:review.id});
      }
    }
    need(!denied.length,'CUSTOMER_BROWSER_UNEXPECTED_REQUEST');
    need(!pageErrors.length,'CUSTOMER_BROWSER_PAGE_ERROR');
    await requireRevision(client,dossierId,currentRevision);
    const result={schema:'sf88.research-customer-browser-receiving.v1',selection:input,
      workspaceId:client.workspaceId,readOnlyRequests:true,observations,files};
    await retain(resultFile,result);return result;
  }finally{if(context)await context.close();}
}

export async function openCustomerDelivery({packageDirectory,workspaceDirectory,manifestSha256,receiptFile,serve=false,port=0,python='python3'}){
  absolute(packageDirectory);await directory(workspaceDirectory);
  const manifestFile=join(packageDirectory,'PACKAGE_MANIFEST.json'),raw=await read(manifestFile,16*1024*1024,manifestSha256);
  const manifest=JSON.parse(raw.toString('utf8'));
  need(manifest.schema==='sf88.research-customer-package.v1'&&Array.isArray(manifest.files)&&
    object(manifest.native),'CUSTOMER_PACKAGE_MANIFEST_REQUIRED');
  const names=new Set();
  for(const item of manifest.files){
    member(item.path);need(!names.has(item.path),'CUSTOMER_PACKAGE_MEMBER_REPEATED');names.add(item.path);
    await checked({file:join(packageDirectory,...item.path.split('/')),bytes:item.bytes,sha256:item.sha256});
  }
  need(names.has(manifest.native.portable)&&names.has(manifest.native.metadata)&&names.has(manifest.native.history),
    'CUSTOMER_PACKAGE_NATIVE_FILES_MISSING');
  const metadata=await value(join(packageDirectory,...manifest.native.metadata.split('/'))),
    history=await value(join(packageDirectory,...manifest.native.history.split('/')));
  need(metadata.id===manifest.native.dossierId&&metadata.revision===manifest.native.revision&&
    Array.isArray(history)&&history.length===metadata.revision,'CUSTOMER_PACKAGE_NATIVE_SELECTION_CHANGED');
  const received=await withPrivateLock(workspaceDirectory,'customer-package-open.lock',async()=>{
    const store=await openDossierStore(workspaceDirectory,{extractionOptions:{python}});
    await store.reopenStream(await openPortableFile(join(packageDirectory,...manifest.native.portable.split('/'))),{projection:'metadata'});
    const original=await store.getMetadata(metadata.id,{revision:metadata.revision});
    const revisions=await store.listRevisions(metadata.id,{revision:metadata.revision});
    need(same(original,metadata)&&same(revisions,history),'CUSTOMER_COLD_RECEIVED_DOSSIER_CHANGED');
    const head=await store.getMetadata(metadata.id);
    return {schema:'sf88.research-customer-cold-receiving.v1',manifestSha256:digest(raw),
      operationId:manifest.operationId,dossierId:metadata.id,selectedRevision:metadata.revision,
      currentRevision:head.revision,historyRevisions:revisions.length,sourceFiles:manifest.files.filter(row=>row.kind==='engine'||row.kind==='implementation').length,
      receivedFileCount:manifest.files.length,editableWorkspaceDirectory:workspaceDirectory};
  });
  if(receiptFile)await retain(absolute(receiptFile),received);
  if(!serve)return received;
  const app=await startDossierWorkspace({directory:workspaceDirectory,port,clinicalTrialsPython:python,extractionPython:python});
  return {...received,app};
}

async function main(args){
  const selected={};
  for(let i=0;i<args.length;i++){
    const name=args[i];need(['--open','--serve','--package-directory','--workspace-directory','--manifest-sha256','--receipt-file','--port','--python'].includes(name)&&!Object.hasOwn(selected,name),
      'CUSTOMER_RECEIVER_ARGUMENT_INVALID');
    if(name==='--open'||name==='--serve')selected[name]=true;
    else{need(typeof args[i+1]==='string'&&args[i+1]&&!args[i+1].startsWith('--'),'CUSTOMER_RECEIVER_ARGUMENT_REQUIRED');selected[name]=args[++i];}
  }
  need(selected['--open'],'CUSTOMER_RECEIVER_OPEN_REQUIRED');
  const result=await openCustomerDelivery({packageDirectory:resolve(selected['--package-directory']??'.'),
    workspaceDirectory:resolve(selected['--workspace-directory']??'./editable-research'),
    manifestSha256:selected['--manifest-sha256'],receiptFile:selected['--receipt-file']?resolve(selected['--receipt-file']):undefined,
    serve:!!selected['--serve'],port:Number(selected['--port']??0),python:selected['--python']??'python3'});
  if(!result.app){process.stdout.write(JSON.stringify(result,null,2)+'\n');return;}
  const {app,...received}=result;
  // The local interactive owner needs the authenticated URL. It is printed only
  // to this terminal; no public package or receipt includes the session.
  process.stdout.write(JSON.stringify({...received,url:app.url},null,2)+'\n');
  let closing;
  const close=()=>{closing??=app.close().catch(error=>{process.exitCode=1;process.stderr.write(String(error.code??'CUSTOMER_RECEIVER_CLOSE_FAILED')+'\n');});return closing;};
  process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch(error=>{process.stderr.write(JSON.stringify({state:'INCOMPLETE',code:error.code??'CUSTOMER_RECEIVING_FAILED'})+'\n');process.exitCode=1;});
