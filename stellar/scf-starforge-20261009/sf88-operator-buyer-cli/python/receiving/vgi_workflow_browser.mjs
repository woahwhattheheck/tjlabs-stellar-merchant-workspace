// Complete acquired-result receiving inside the original operator browser.
// Source-planned course: execution and screenshots come from the accepting host.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const API='/api/vgi/workflow';
const EDITION='df8d93a749f46f5a5509eb1deee58b2271c354fff436b912ccf38f2ac06d3760';
const NAME='receiving_workflow_capacity';
const SQL='SELECT * FROM svk_capacity ORDER BY sf_row';
const TABLE='workflow_capacity';
const COPY='Receiving acquired capacity workflow';
const canonical=value=>JSON.stringify(value&&typeof value==='object'
  ?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v)))
    :Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))]))
  :value);
const same=(a,b)=>canonical(a)===canonical(b);
const need=(condition,message)=>{if(!condition)throw new Error('Acquired workflow: '+message);};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const safeName=value=>String(value).replace(/[^A-Za-z0-9._-]+/g,'_').slice(0,150);

/**
 * Uses the supplied ORIGINAL browser/context, operator api and durable request log.
 * No browser/server/listener is started or stopped here.
 *
 * interruptResponse is shared with the caller's existing POST route. When armed,
 * the caller matches path/action/name AFTER route.fetch, only for an actual
 * result.state === 'COMPLETE'; it persists row.response_interrupted =
 * {course:'acquired-workflow',request_id,at}, assigns .performed, clears .armed,
 * saves original-requests.json, then aborts that one browser response.
 * Every other response follows the original route unchanged.
 *
 * configuration.workspace_id is required. configuration.workflow_edition_id,
 * when supplied, must equal the original retained edition below.
 */
export async function receiveAcquiredWorkflow({
  page,context,configuration,api,requests,save,directory,capability,parsed,
  interruptResponse
}){
  need(interruptResponse&&Array.isArray(requests),'original response hook/log required');
  const editionId=configuration.workflow_edition_id||EDITION;
  need(editionId===EDITION,'the original 32-row edition selection changed');
  const workspaceId=configuration.workspace_id;
  const returnUrl=page.url(),initialViewport=page.viewportSize();
  const root=path.join(directory,'acquired-workflow');
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  const journalPath=path.join(directory,'acquired-workflow-progress.json');
  let journal=fs.existsSync(journalPath)?JSON.parse(fs.readFileSync(journalPath,'utf8')):{
    schema:'stellar-forge.acquired-workflow-receiving.v1',
    workspace_id:workspaceId,edition_id:editionId,query_name:NAME,table_name:TABLE,
    downloads:[],started_at:new Date().toISOString()
  };
  need(journal.workspace_id===workspaceId&&journal.edition_id===editionId
    &&journal.query_name===NAME&&journal.table_name===TABLE,'saved receiving selection changed');
  const checkpoint=()=>save('acquired-workflow-progress.json',journal);
  const current=()=>api(API+'/state?limit=100');
  const getLineage=selection=>api(API+'/lineage?'+new URLSearchParams(selection));
  const workflowUrl=parsed.origin+'/vgi/workflow/#'+capability;
  const pageErrors=[];
  const onError=e=>pageErrors.push({name:e.name,message:e.message});
  page.on('pageerror',onError);
  let cold=null;
  async function ready(p=page,{allowError=false}={}){
    await p.locator('#working select').first().waitFor({state:'visible',timeout:180000});
    await p.waitForFunction(()=>document.querySelector('#refresh')?.disabled===false
      &&document.querySelector('#notice')?.dataset.state!=='busy',null,{timeout:180000});
    if(!allowError)need(await p.locator('#notice').getAttribute('data-state')!=='error',
      await p.locator('#notice').textContent()||'original workflow error');
  }
  async function click(locator,p=page,options={}){
    await locator.click();await ready(p,options);
  }
  const button=(p,name)=>p.getByRole('button',{name,exact:true});
  const panel=(p,title)=>p.locator('section.panel').filter({
    has:p.getByRole('heading',{name:title,exact:true})});
  async function nav(view,p=page){
    await click(p.locator('nav [data-view="'+view+'"]'),p);
  }
  async function stored(p=page){
    return p.evaluate(workspace=>new Promise((resolve,reject)=>{
      const open=indexedDB.open('starforge-vgi-result-workflow',1);
      open.onerror=()=>reject(open.error);
      open.onsuccess=()=>{
        const db=open.result,tx=db.transaction('working','readonly');
        const read=tx.objectStore('working').get(workspace);
        read.onsuccess=()=>resolve(read.result);
        read.onerror=()=>reject(read.error);
        tx.oncomplete=()=>db.close();tx.onabort=()=>db.close();
      };
    }),workspaceId);
  }
  async function selected(p=page){
    const id=await p.locator('#working select').first().inputValue();
    return (await stored(p)).copies.find(copy=>copy.id===id);
  }
  async function selectCopy(id,p=page){
    await p.locator('#working select').first().selectOption(id);
    await ready(p);
    need((await selected(p))?.id===id,'working-copy selection changed');
  }
  async function ensureCopy(){
    const saved=await stored();
    if(journal.copy_id){
      need(saved.copies.some(c=>c.id===journal.copy_id),'original receiving copy is missing');
      await selectCopy(journal.copy_id);return;
    }
    const old=saved.copies.filter(c=>c.name===COPY);
    need(old.length<=1,'receiving copy name is ambiguous');
    if(old.length)await selectCopy(old[0].id);
    else{
      await click(button(page,'New copy'));
      await page.locator('#working').getByLabel('Copy name',{exact:true}).fill(COPY);
      await click(page.locator('#refresh'));
    }
    journal.copy_id=(await selected()).id;checkpoint();
  }
  async function screenshot(label,p=page){
    const files=[];
    for(const [suffix,size] of [['desktop',{width:1440,height:1050}],
      ['narrow',{width:390,height:844}]]){
      await p.setViewportSize(size);
      const destination=path.join(root,safeName(label)+'-'+suffix+'.png');
      await p.screenshot({path:destination,fullPage:true});
      files.push(destination);
    }
    await p.setViewportSize({width:1440,height:1050});
    return files;
  }
  async function download(locator,label,descriptor=null,p=page){
    const [event]=await Promise.all([p.waitForEvent('download',{timeout:180000}),
      click(locator,p)]);
    const destination=path.join(root,safeName(label)+'--'+safeName(event.suggestedFilename()));
    await event.saveAs(destination);
    const bytes=fs.readFileSync(destination);
    if(descriptor)need(bytes.length===descriptor.bytes&&sha(bytes)===descriptor.sha256,
      'complete downloaded member changed: '+descriptor.name);
    const item={label,name:descriptor?.name||event.suggestedFilename(),path:destination,
      bytes:bytes.length,sha256:sha(bytes)};
    const index=journal.downloads.findIndex(row=>row.label===label);
    if(index<0)journal.downloads.push(item);else journal.downloads[index]=item;
    checkpoint();
    return {item,bytes};
  }
  async function archiveDownload(label,p=page){
    // Refresh flushes all actual edit writes before the storage-free download.
    await click(p.locator('#refresh'),p);
    const out=await download(p.locator('#download-working'),label,null,p);
    const value=JSON.parse(out.bytes.toString('utf8'));
    need(value.workspace_id===workspaceId&&value.schema==='stellar-forge.vgi-result-workflow-working.v1',
      'working archive identity changed');
    const db=await stored(p);
    need(same(value.copies,db.copies),'download omitted or changed a durable working copy');
    return {value,...out};
  }
  const workflowRows=()=>requests.filter(row=>row.path===API+'/command');
  function commandOf(row){try{return JSON.parse(row.body);}catch{return null;}}
  function findInterrupted(){
    return workflowRows().find(row=>row.response_interrupted?.course==='acquired-workflow'
      &&commandOf(row)?.action==='save-query'
      &&commandOf(row)?.args?.name===NAME);
  }
  async function findEditionRow(p=page){
    await nav('warehouse',p);
    let previous=-1;
    for(;;){
      const container=panel(p,'Original source editions');
      const row=container.locator('tbody tr').filter({has:p.getByText(editionId,{exact:true})});
      if(await row.count())return row;
      const more=button(p,'Load older source editions');
      need(await more.count(),'retained original edition is absent');
      const count=await container.locator('tbody tr').count();
      need(count>previous,'source edition pagination did not advance');
      previous=count;await click(more,p);
    }
  }
  async function sourceReceiving(p=page,label='source'){
    const lineage=await getLineage({edition_id:editionId});
    need(lineage.workspace_id===workspaceId
      &&lineage.edition?.edition?.edition_id===editionId
      &&lineage.edition.edition.row_count===32,'original acquired edition changed');
    const row=await findEditionRow(p);
    await click(row.getByRole('button',{name:'Source',exact:true}),p);
    const sourceArticle=p.locator('article.inset').filter({
      has:p.getByRole('heading',{name:'Source edition '+editionId.slice(0,14),exact:true})});
    for(let index=0;index<lineage.edition.members.length;index++){
      const member=lineage.edition.members[index];
      const memberRow=sourceArticle.locator('tbody tr').filter({
        has:p.getByText(member.name,{exact:true})});
      need(await memberRow.count()===1,'original member row missing/ambiguous');
      await click(memberRow.getByRole('button',{name:'Read',exact:true}),p);
      need((await p.locator('#source-reader').textContent()).includes(member.sha256),
        'source reader did not retain the selected full member identity');
      await download(memberRow.getByRole('button',{name:'Download',exact:true}),
        label+'-'+index,member,p);
    }
    const full=await download(button(p,'Download complete lineage'),label+'-lineage',null,p);
    need(same(JSON.parse(full.bytes.toString('utf8')),lineage),'downloaded whole lineage changed');
    return {lineage,screenshots:await screenshot(label,p)};
  }
  async function openRecipe(p=page){
    await nav('query',p);
    const row=panel(p,'Saved query recipes').locator('tbody tr')
      .filter({has:p.getByText(NAME,{exact:true})});
    need(await row.count()===1,'the original receiving recipe is missing/ambiguous');
    await click(row.getByRole('button',{name:'Open recipe',exact:true}),p);
    need(await p.locator('#query-name').inputValue()===NAME,'wrong saved recipe opened');
  }
  async function assertPreserved(state){
    need(state.workspace_id===workspaceId,'workspace identity changed');
    for(const original of journal.original.queries)
      need(same(state.queries.find(q=>q.query_id===original.query_id),original),
        'an existing query outside this receiving recipe changed');
    need(same(state.views,journal.original.views),'existing source view selection changed');
    for(const original of journal.original.tables)
      need(same(state.service.tables.find(t=>t.name===original.name),original),
        'an existing published table outside this receiving result changed');
    for(const original of journal.original.exports)
      need(same(state.exports.find(e=>e.export_id===original.export_id),original),
        'an original retained export changed');
  }
  try{
    await page.goto(workflowUrl,{waitUntil:'domcontentloaded'});await ready();
    let state=await current();
    need(state.workspace_id===workspaceId,'wrong original workspace');
    if(!journal.original){
      need(state.views.find(v=>v.name==='svk_capacity')?.edition_id===editionId,
        'original svk_capacity view no longer selects the retained edition');
      journal.original={views:clone(state.views),
        queries:state.queries.filter(q=>q.name!==NAME),
        tables:state.service.tables.filter(t=>t.name!==TABLE),
        exports:state.exports.filter(e=>e.query?.name!==NAME)};
      checkpoint();
    }
    await assertPreserved(state);
    if(journal.completed){
      const saved=await getLineage({publication_id:journal.publication_id});
      need(saved.publication.table_name===TABLE&&saved.export.export_id===journal.export_id
        &&saved.query.name===NAME,'completed receiving identity changed');
      for(const item of journal.downloads){
        need(fs.existsSync(item.path),'completed download file is missing');
        const bytes=fs.readFileSync(item.path);
        need(bytes.length===item.bytes&&sha(bytes)===item.sha256,'completed download bytes changed');
      }
      return journal;
    }
    await ensureCopy();
    // A prior admitted mutation may have completed before the browser process
    // stopped. Receive its original request before operating controls. Preserve
    // the deliberately interrupted save until its alternative/recovery phase.
    let entryCopy=await selected();
    if(entryCopy.pending
      &&entryCopy.pending.request_id!==(journal.interrupted_request?.request_id
        ||findInterrupted()?.response_interrupted?.request_id))
      await click(button(page,'Recover same request'),page,{allowError:true});
    if(!journal.source){
      journal.source=await sourceReceiving();checkpoint();
    }
    if(!journal.selected_view){
      const row=await findEditionRow();
      await click(row.getByRole('button',{name:'Select for view',exact:true}));
      await page.locator('#view-name').fill('svk_capacity');
      await click(button(page,'Read current view revision'));
      const before=(await current()).views;
      const copy=await selected();
      if(!copy.completed.some(r=>r.action==='activate'&&r.state==='COMPLETE'
        &&r.request?.args?.name==='svk_capacity'&&r.request.args.edition_id===editionId))
        await click(page.locator('#activate-edition'));
      need(same((await current()).views,before),'selecting same original edition changed its view');
      journal.selected_view=true;checkpoint();
    }
    await nav('query');
    let copy=await selected();
    let interrupted=findInterrupted();
    if(!interrupted&&!journal.interrupted_request){
      if(copy.pending){
        const pendingBody=JSON.parse(copy.pending.body);
        need(pendingBody.action==='save-query'&&pendingBody.args.name===NAME,
          'an unrelated pending request needs its original receiving phase');
        await click(button(page,'Recover same request'));
        copy=await selected();
      }
      const existing=(await current()).queries.find(q=>q.name===NAME);
      if(existing){
        need(copy.completed.some(r=>r.action==='save-query'&&r.state==='COMPLETE'
          &&r.result.query_id===existing.query_id&&r.request.args.name===NAME),
          'named receiving recipe exists without this course’s original completion');
        await openRecipe();
      }else{
        await click(button(page,'New query recipe'));
        await page.locator('#query-name').fill(NAME);
      }
      await page.locator('#query-sql').fill(SQL);
      await page.locator('#query-parameters').fill('[]');
      await click(page.locator('#select-current-views'));
      await click(page.locator('#preview-query'));
      const preview=(await selected()).preview;
      need(preview?.rows?.length===32&&preview.truncated===false,'native original query preview is incomplete');
      journal.initial_preview=preview;checkpoint();
      interruptResponse.armed={course:'acquired-workflow',path:API+'/command',
        action:'save-query',name:NAME};
      try{await click(page.locator('#save-query'),page,{allowError:true});}
      finally{interruptResponse.armed=null;}
      interrupted=findInterrupted();
      need(interrupted,'the actual completed save response was not deliberately interrupted');
    }
    if(!journal.interrupted_request){
      const body=commandOf(interrupted);
      need(interrupted.state==='COMPLETE'&&interrupted.result?.state==='COMPLETE',
        'the interrupted save did not actually commit natively');
      copy=await selected();
      need(copy.pending?.request_id===body.request_id
        &&same(JSON.parse(copy.pending.body),body),'lost reply did not preserve its exact pending command');
      journal.interrupted_request={request_id:body.request_id,body:interrupted.body,
        result:interrupted.result};
      checkpoint();
    }
    const originalRequest=journal.interrupted_request;
    if(!journal.alternative_id){
      await selectCopy(journal.copy_id);
      copy=await selected();
      need(copy.pending?.request_id===originalRequest.request_id,
        'the original interrupted working copy no longer retains its request');
      await screenshot('interrupted-original');
      const archive=await archiveDownload('interrupted-working-archive');
      journal.interrupted_archive=archive.item;checkpoint();
      await click(page.locator('#revise-alternative'));
      journal.alternative_id=(await selected()).id;checkpoint();
    }
    await selectCopy(journal.alternative_id);
    // If the preceding process ended after a native rejection/corrected save,
    // receive that same retained request before editing the alternative again.
    if((await selected()).pending)
      await click(button(page,'Recover same request'),page,{allowError:true});
    await nav('query');
    copy=await selected();
    need(copy.prior_requests?.some(r=>r.original_copy_id===journal.copy_id
      &&r.pending.request_id===originalRequest.request_id),'revised alternative lost original pending source');
    if(!journal.same_input_refused){
      const count=workflowRows().length;
      await click(page.locator('#save-query'),page,{allowError:true});
      need((await page.locator('#notice').textContent()).includes('match retained request')
        &&workflowRows().length===count,'alternative resubmitted the same uncertain input under a new ID');
      journal.same_input_refused=true;checkpoint();
    }
    if(!journal.rejected_request){
      await page.locator('#query-sql').fill(SQL+'\n-- revised alternative after original interrupted reply');
      await click(page.locator('#preview-query'));
      const before=clone((await current()).queries.find(q=>q.name===NAME));
      copy=await selected();
      let rejected=copy.completed.find(r=>r.action==='save-query'&&r.state==='REJECTED'
        &&r.request?.args?.name===NAME);
      if(!rejected){
        await click(page.locator('#save-query'),page,{allowError:true});
        rejected=(await selected()).completed.findLast(r=>r.action==='save-query'&&r.state==='REJECTED');
      }
      need(rejected?.result?.no_effect===true&&rejected.request.args.expected_revision===JSON.parse(originalRequest.body).args.expected_revision
        &&rejected.request_id!==originalRequest.request_id,'stale revision did not return its original no-effect receipt');
      need(!(await selected()).pending,'known no-effect rejection left an orphaned pending command');
      need(same((await current()).queries.find(q=>q.name===NAME),before),
        'rejected stale recipe changed native saved data');
      journal.rejected_request=rejected;checkpoint();
      await screenshot('known-rejection');
    }
    if(!journal.corrected_request){
      copy=await selected();
      let corrected=copy.completed.find(r=>r.action==='save-query'&&r.state==='COMPLETE'
        &&r.request?.args?.name===NAME&&r.request.args.expected_revision>JSON.parse(originalRequest.body).args.expected_revision);
      if(!corrected){
        await openRecipe();
        need(await page.locator('#query-sql').inputValue()===SQL,'opening actual recipe changed its SQL');
        await click(page.locator('#save-query'));
        corrected=(await selected()).completed.findLast(r=>r.action==='save-query'&&r.state==='COMPLETE');
      }
      need(corrected?.request.args.sql===SQL&&corrected.request_id!==journal.rejected_request.request_id,
        'corrected current-revision save did not receive its separate exact request');
      journal.corrected_request=corrected;checkpoint();
    }
    await selectCopy(journal.copy_id);
    if(!journal.recovered_request){
      copy=await selected();
      if(copy.pending){
        need(copy.pending.request_id===originalRequest.request_id,'original pending request changed');
        await page.reload({waitUntil:'domcontentloaded'});await ready();
        const count=workflowRows().length;
        await click(button(page,'Recover same request'));
        need(workflowRows().length===count,'recovery submitted another mutation instead of reading original completion');
      }
      const received=(await selected()).completed.find(r=>r.request_id===originalRequest.request_id);
      need(received?.state==='COMPLETE'&&same(received,originalRequest.result),
        'recovered original save receipt changed');
      journal.recovered_request=received;checkpoint();
    }
    await openRecipe();
    await click(page.locator('#select-current-views'));
    await click(page.locator('#preview-query'));
    copy=await selected();
    need(copy.query.sql===SQL&&copy.preview.rows.length===32&&!copy.preview.truncated,
      'reopened current native preview changed original rows');
    if(!journal.export_id){
      let exported=copy.completed.findLast(r=>r.action==='export'&&r.state==='COMPLETE'
        &&r.request?.args?.query_id===copy.query.query_id
        &&r.request.args.expected_revision===copy.query.revision);
      if(!exported){
        await click(page.locator('#export-query'));
        exported=(await selected()).completed.findLast(r=>r.action==='export'&&r.state==='COMPLETE');
      }
      journal.export_id=exported.result.export_id;checkpoint();
    }
    let lineage=await getLineage({export_id:journal.export_id});
    need(lineage.export.rows===32&&lineage.query.name===NAME&&lineage.query.sql===SQL
      &&lineage.snapshot_editions.some(e=>e.edition.edition_id===editionId),
      'complete native export lost its query or acquired source');
    if(!journal.export_downloads){
      for(let index=0;index<lineage.export.files.length;index++){
        const f=lineage.export.files[index];
        const row=page.locator('.file-row').filter({has:page.getByText(f.name,{exact:true})});
        need(await row.count()===1,'selected native export file missing/ambiguous');
        await download(row.getByRole('button',{name:'Download',exact:true}),'export-'+index,f);
      }
      journal.export_downloads=true;journal.query_screenshots=await screenshot('query-export');checkpoint();
    }
    await nav('publish');
    if(!journal.publication_id){
      state=await current();
      const existing=state.service.tables.find(t=>t.name===TABLE);
      if(existing){
        const actual=await getLineage({publication_id:existing.publication_id});
        need(actual.export.export_id===journal.export_id,'receiving publication name already binds a different result');
        journal.publication_id=existing.publication_id;checkpoint();
      }else{
        await page.locator('#publication-export').selectOption(journal.export_id);
        await click(page.locator('#review-publication'));
        await page.locator('#publication-table').fill(TABLE);
        await click(button(page,'Read current table head'));
        await click(page.locator('#publish-result'));
        state=await current();
        journal.publication_id=state.service.tables.find(t=>t.name===TABLE)?.publication_id;
        need(journal.publication_id,'new original workflow result was not published');checkpoint();
      }
    }
    lineage=await getLineage({publication_id:journal.publication_id});
    need(lineage.publication.table_name===TABLE&&lineage.publication.rows===32
      &&lineage.export.export_id===journal.export_id&&lineage.query.sql===SQL,
      'published result lineage changed');
    const publicationCard=page.locator('article.inset').filter({
      has:page.getByRole('heading',{name:TABLE+' · '+journal.publication_id.slice(0,14),exact:true})});
    need(await publicationCard.count()===1,'selected complete-publication card missing/ambiguous');
    const publicationDownload=await download(
      publicationCard.getByRole('button',{name:'Download complete publication',exact:true}),
      'complete-publication');
    need(same(JSON.parse(publicationDownload.bytes.toString('utf8')),lineage.publication),
      'publication download lost the complete native schema, encodings or batch descriptors');
    journal.complete_publication=publicationDownload.item;
    journal.publication_screenshots=await screenshot('workflow-publication');checkpoint();
    const exactLink=page.locator('a[href*="publication_id='+journal.publication_id+'"]');
    need(await exactLink.count()===1,'same-publication SQL client link missing/ambiguous');
    const href=await exactLink.getAttribute('href');
    const target=new URL(href,parsed.origin);
    need(target.origin===parsed.origin&&target.pathname==='/vgi/'
      &&target.searchParams.get('view')==='client'
      &&target.searchParams.get('publication_id')===journal.publication_id
      &&target.hash.slice(1)===capability,'client deep link changed its private original identity');
    await exactLink.click();
    await page.locator('#main').waitFor({state:'visible',timeout:180000});
    await page.locator('#client-publication').waitFor({state:'visible'});
    need(await page.locator('#client-publication').inputValue()===journal.publication_id,
      'client deep link did not select the exact retained workflow result');
    await page.locator('#client-inspect').click();
    await page.waitForFunction(()=>!document.body.classList.contains('busy'),null,{timeout:180000});
    need(!(await page.locator('#error').isVisible()),'client source inspection failed');
    journal.client_link_screenshots=await screenshot('workflow-client-selection');checkpoint();
    await page.goto(workflowUrl,{waitUntil:'domcontentloaded'});await ready();
    await selectCopy(journal.copy_id);
    const complete=await archiveDownload('complete-working-archive');
    journal.complete_archive=complete.item;checkpoint();
    const browser=context.browser();
    need(browser,'original browser cannot create an independent receiving context');
    cold=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
    const rejectedMutations=[];
    await cold.route('**/api/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.method()==='POST'&&url.pathname!==API+'/preview'){
        rejectedMutations.push({path:url.pathname,body:request.postData()});
        await route.abort('blockedbyclient');return;
      }
      await route.continue();
    });
    const coldPage=await cold.newPage();
    coldPage.on('pageerror',onError);
    await coldPage.goto(workflowUrl,{waitUntil:'domcontentloaded'});await ready(coldPage);
    const empty=await stored(coldPage);
    need(empty.copies.length===1&&empty.copies[0].completed.length===0
      &&empty.copies[0].pending===null,'independent browser is not empty');
    const beforeCold=await current();
    await coldPage.locator('#working input[type=file]').setInputFiles({
      name:'acquired-data-working-archive.json',mimeType:'application/json',buffer:complete.bytes});
    await ready(coldPage);
    const received=await stored(coldPage);
    need(received.copies.length===complete.value.copies.length+1,'cold import lost a complete original copy');
    // Copy names are editable and may repeat. Match the complete original
    // records as a multiset, consuming each imported alternative once, rather
    // than treating a display name as an identity.
    const available=received.copies.filter(c=>c.id!==empty.copies[0].id);
    const importedIds=new Map();
    need(new Set(received.copies.map(c=>c.id)).size===received.copies.length,
      'cold imported IDs are not unique');
    for(const original of complete.value.copies){
      const match=available.findIndex(candidate=>{
        if(candidate.name!==original.name+' · imported')return false;
        const restored=clone(candidate);restored.id=original.id;restored.name=original.name;
        return same(restored,original);
      });
      need(match>=0,'cold alternative changed or omitted original history, inputs or request');
      const [candidate]=available.splice(match,1);
      need(!complete.value.copies.some(c=>c.id===candidate.id),
        'cold import reused an original working-copy ID');
      importedIds.set(original.id,candidate.id);
    }
    need(available.length===0,'cold import added an unexplained alternative');
    need(importedIds.has(journal.copy_id),'cold archive omitted the selected original copy');
    await selectCopy(importedIds.get(journal.copy_id),coldPage);
    await openRecipe(coldPage);
    await click(coldPage.locator('#preview-query'),coldPage);
    const coldPreview=(await selected(coldPage)).preview;
    need(coldPreview.rows.length===32&&!coldPreview.truncated,'cold original native read-preview failed');
    await screenshot('independent-cold-query',coldPage);
    const coldArchive=await archiveDownload('independent-cold-working-archive',coldPage);
    need(coldArchive.value.copies.some(c=>c.completed.some(r=>r.request_id===originalRequest.request_id))
      &&coldArchive.value.copies.some(c=>c.completed.some(r=>r.request_id===journal.rejected_request.request_id)),
      'cold archive lost original complete/rejected command history');
    need(rejectedMutations.length===0,'independent browser attempted a native mutation');
    const withoutObservationTime=value=>{
      const complete=clone(value);
      // HTTPRuntime.state adds this read-time timestamp; every other native
      // source, request, process, catalog and selected listener field is kept.
      if(complete.runtime)delete complete.runtime.observed_at;
      return complete;
    };
    need(same(withoutObservationTime(await current()),withoutObservationTime(beforeCold)),
      'independent archive receiving changed original native state');
    journal.independent_archive=coldArchive.item;
    await cold.close();cold=null;
    state=await current();await assertPreserved(state);
    need(pageErrors.length===0,'actual browser reported JavaScript errors');
    journal.completed=true;journal.completed_at=new Date().toISOString();
    journal.page_error_count=0;journal.protected_originals_preserved=true;
    checkpoint();
    return journal;
  }finally{
    interruptResponse.armed=null;
    if(cold)await cold.close();
    page.off('pageerror',onError);
    save('acquired-workflow-page-errors.json',pageErrors);
    if(!page.isClosed()){
      if(initialViewport)await page.setViewportSize(initialViewport);
      if(returnUrl&&returnUrl!=='about:blank')await page.goto(returnUrl,{waitUntil:'domcontentloaded'});
    }
  }
}
