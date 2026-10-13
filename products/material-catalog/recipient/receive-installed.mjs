// MIT. Same-case installed UI/MCP continuation; caller owns the server and fresh Page.
import assert from 'node:assert/strict';
import {readFile,open,link,unlink,mkdir,rename} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {openText,canonical} from './core.mjs';
import {openRecipientReview,openRecipientWorking,compareRecipientReview,recipientView} from './review.mjs';
import {validateAuthorDecisionMatrix} from './author-matrix.mjs';
import {openAuthorWorklist,createAuthorWorklist,retainAuthorReturn,retainAuthorDraft,retainAuthorRequest,retainAuthorOutcome,exportAuthorWorklist} from './author-worklist.mjs';
const HERE=dirname(fileURLToPath(import.meta.url)),sha=value=>createHash('sha256').update(value).digest('hex');
const pretty=value=>JSON.stringify(value,null,2)+'\n';
const sourcePaths=['receive-installed.mjs','review.mjs','core.mjs','sha256.mjs','author-worklist.mjs','author-matrix.mjs','author-matrix-native.mjs',
 '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/workspace/public/catalog-author-matrix.mjs',
 '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/workspace/public/catalog-author-matrix.css',
 '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/workspace/public/catalog-author-worklist.mjs',
 '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/workspace/server.mjs',
 '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/workspace/public/app.mjs',
 '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/workspace/public/catalog.mjs',
 '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/workspace/public/catalog-recipient.mjs',
 '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/workspace/public/style.css',
 '../../../stellar-forge/mcp-merchant-operator/opensearch-materials.mjs',
 '../../../stellar-forge/mcp-merchant-operator/catalog/opensearch-materials.mjs',
 '../../../stellar-forge/mcp-merchant-operator/opensearch-material-client.mjs',
 '../../../stellar-forge/mcp-merchant-operator/opensearch-material-cli.mjs'];
async function syncDirectory(path){const fd=await open(path,'r');try{await fd.sync();}finally{await fd.close();}}
async function retain(path,value,{replace=false}={}){
 const raw=Buffer.isBuffer(value)?value:Buffer.from(value),pending=path+'.'+randomUUID()+'.part',fd=await open(pending,'wx',0o600);
 try{
  await fd.writeFile(raw);await fd.sync();await fd.close();
  if(replace)await rename(pending,path);
  else try{await link(pending,path);}catch(error){if(error.code!=='EEXIST')throw error;assert.ok((await readFile(path)).equals(raw),'Retained intent differs: '+path);}
  await syncDirectory(dirname(path));
 }finally{await fd.close().catch(()=>{});await unlink(pending).catch(()=>{});}
 return{path,bytes:raw.length,sha256:sha(raw)};
}
async function retainedFile(identity){
 assert.ok(identity&&typeof identity.path==='string');
 const bytes=await readFile(identity.path);assert.equal(bytes.length,identity.bytes);assert.equal(sha(bytes),identity.sha256);return bytes;
}
async function courseInputs(directory,operationId){
 const original=JSON.parse(await readFile(join(directory,'RECEIVING.json'),'utf8'));
 assert.equal(original.operation,operationId,'Keep the original receiving operation.');
 assert.equal(original.reviewReturn?.status,'COMPLETE','Finish/reconcile the original offline/CLI receiving first.');
 const returned=await retainedFile(original.reviewReturn.retained.returned),requestBytes=await retainedFile(original.reviewReturn.retained.request);
 const request=JSON.parse(requestBytes),review=openRecipientReview(returned.toString('utf8'));
 assert.equal(pretty(request),requestBytes.toString('utf8'));assert.equal(request.reviewText,returned.toString('utf8'));
 assert.equal(request.requestId,original.reviewReturn.request.id);assert.equal(sha(requestBytes),original.reviewReturn.request.sha256);
 const source=await Promise.all(sourcePaths.map(async path=>{const bytes=await readFile(resolve(HERE,path));return{path,bytes:bytes.length,sha256:sha(bytes)};}));
 return{original,request,requestBytes,review,returned,source};
}
function sameBundle(first,next){
 assert.equal(canonical(first.tables),canonical(next.tables),'An original table changed while replaying the completed request.');
 assert.equal(canonical([...first.sources].map(([id,value])=>[id,sha(value.bytes),value.manifest])),
  canonical([...next.sources].map(([id,value])=>[id,sha(value.bytes),value.manifest])),'An original source changed while replaying the completed request.');
}
export async function receiveInstalledRecipientReturn({page,serverUrl,directory:inputDirectory,operationId}){
 assert.ok(page&&page.url()==='about:blank','Use one caller-owned fresh Page; keep the original browser/server.');
 const directory=resolve(inputDirectory),input=await courseInputs(directory,operationId);
 const url=new URL(serverUrl);assert.ok(['http:','https:'].includes(url.protocol));assert.equal(url.username+url.password,'');
 const guard=await open(join(directory,'.installed-return.lock'),'a',0o600);
 const held=spawnSync('flock',['--exclusive','--nonblock','--conflict-exit-code','75','3'],{stdio:['ignore','pipe','pipe',guard.fd],timeout:10000});
 if(held.status!==0){await guard.close();throw Error('ORIGINAL_INSTALLED_RETURN_GUARD_UNAVAILABLE');}
 let record,path;
 const browserErrors=[],observe=error=>browserErrors.push(String(error?.message??error));
 page.on('pageerror',observe);
 try{
  await page.goto(url.href);await page.locator('#cat-catalog').waitFor({state:'attached'});
  const session=await page.evaluate(async()=>{const response=await fetch('/api/session',{cache:'no-store'});if(!response.ok)throw Error('Original workspace session failed.');return response.json();});
  const intent={schema:'stellar-forge.material-installed-return-course.v1',operation:operationId,workspaceId:session.workspaceId,
   catalogId:input.review.base.catalog.id,requestId:input.request.requestId,requestSha256:sha(input.requestBytes),returnSha256:sha(input.returned),source:input.source};
  await retain(join(directory,'INSTALLED_RETURN_INTENT.json'),pretty(intent));
  const attempt=join(directory,'installed-return-'+randomUUID());await mkdir(attempt,{mode:0o700});await syncDirectory(directory);
  path=join(attempt,'RESULT.json');record={...intent,status:'RUNNING',serverOrigin:url.origin,startedAt:new Date().toISOString(),
   downloads:[],screenshots:[],steps:[],browserErrors,pixelReview:{status:'PENDING',instructions:'Open and inspect every actual desktop/narrow image and downloaded complete file.'}};
  const save=()=>retain(path,pretty(record),{replace:true});await save();
  const get=route=>page.evaluate(async route=>{const response=await fetch(route,{cache:'no-store'});if(!response.ok)throw Error('Original route failed: '+response.status);return response.text();},route);
  const route='/api/operations/'+encodeURIComponent(input.request.requestId),before=JSON.parse(await get(route));
  assert.equal(before.state,'COMPLETE');assert.equal(before.kind,'catalog-recipient-review');assert.equal(canonical(before.request),canonical(input.request));
  const exportRoute='/api/catalog/export?catalogId='+encodeURIComponent(intent.catalogId)+'&format=catalog-bundle.jsonl';
  const beforeText=await get(exportRoute),beforeBundle=openText(beforeText,{name:'installed-before.jsonl'});
  record.downloads.push(await retain(join(attempt,'installed-before.jsonl'),beforeText));
  const originalAuthor=await retainedFile(input.original.reviewReturn.actualAuthorSnapshot);
  sameBundle(openText(originalAuthor.toString('utf8'),{name:'original-author.jsonl'}),beforeBundle);
  await page.getByRole('button',{name:'Material catalogs',exact:true}).click();
  await page.locator('#cat-catalog').selectOption(intent.catalogId);
  await page.getByRole('tab',{name:'Returned customer reviews',exact:true}).click();
  await page.getByLabel('Complete recipient return',{exact:true}).setInputFiles(input.original.reviewReturn.retained.returned.path);
  const [preview]=await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname==='/api/catalog/recipient-preview'),page.getByRole('button',{name:'Compare with current catalogue',exact:true}).click()]);
  assert.ok(preview.ok());const comparison=await preview.json();
  await page.locator('#recipient-rows [data-recipient-context]').first().waitFor();
  assert.equal(comparison.returnSha256,input.review.sha256);
  assert.deepEqual(comparison.rows.map(row=>row.id),input.review.entries.map(row=>row.id));
  assert.equal(await page.locator('[data-recipient-context]').count(),comparison.rows.length);
  record.downloads.push(await retain(join(attempt,'current-comparison.json'),pretty(comparison)));
  for(const row of comparison.rows)await page.locator('[data-recipient-context="'+row.id+'"]').selectOption('keep');
  await page.locator('#recipient-actor').fill(input.request.actor);await page.locator('#recipient-reason').fill(input.request.reason);
  const download=async(name,button)=>{
   const [event]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:button,exact:true}).click()]);
   const output=join(attempt,name);await event.saveAs(output);const bytes=await readFile(output);
   const fd=await open(output,'r+');try{await fd.sync();}finally{await fd.close();}await syncDirectory(attempt);
   record.downloads.push({path:output,bytes:bytes.length,sha256:sha(bytes)});await save();return{path:output,bytes};
  };
  const working=await download('author-review-choices.json','Save author review choices');
  const saved=JSON.parse(working.bytes);assert.equal(saved.reviewText,input.returned.toString('utf8'));assert.equal(canonical(saved.comparison),canonical(comparison));
  assert.deepEqual(saved.choices,Object.fromEntries(comparison.rows.map(row=>[row.id,'keep'])));
  const worklistDownload=await download('complete-author-worklist.json','Download complete author worklist');
  const worklist=openAuthorWorklist(worklistDownload.bytes.toString('utf8'));
  assert.equal(worklist.workspaceId,intent.workspaceId);
  const retainedReturn=worklist.items.find(item=>item.returnText===input.returned.toString('utf8'));
  assert.ok(retainedReturn,'The complete selected return is retained.');assert.equal(canonical(retainedReturn.draft.comparison),canonical(comparison));
  assert.deepEqual(retainedReturn.draft.choices,saved.choices);
  // Recompare the exact return: retain one complete item, with no new catalogue mutation.
  const [duplicatePreview]=await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname==='/api/catalog/recipient-preview'),
   page.getByRole('button',{name:'Compare with current catalogue',exact:true}).click()]);
  assert.ok(duplicatePreview.ok());
  const sameWork=await download('complete-author-worklist-deduplicated.json','Download complete author worklist');
  const deduplicated=openAuthorWorklist(sameWork.bytes.toString('utf8'));
  assert.equal(deduplicated.items.filter(item=>item.id===retainedReturn.id).length,1);
  assert.equal(deduplicated.items.length,worklist.items.length);
  assert.deepEqual(deduplicated.items.find(item=>item.id===retainedReturn.id).draft.choices,saved.choices);
  await page.locator('#author-worklist-status').filter({hasText:/Saved .* complete returns in this browser/}).waitFor();

  const shot=async(name,width)=>{
   await page.setViewportSize({width,height:1000});const output=join(attempt,name+'.png');await page.screenshot({path:output,fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Horizontal overflow: '+name);
   const bytes=await readFile(output);const fd=await open(output,'r+');try{await fd.sync();}finally{await fd.close();}await syncDirectory(attempt);
   record.screenshots.push({path:output,width,bytes:bytes.length,sha256:sha(bytes)});await save();
  };
  await shot('comparison-desktop',1440);await shot('comparison-narrow',390);
  const matrixInput=await download('matrix-original-worklist.json','Download complete author worklist'),matrixWork=openAuthorWorklist(matrixInput.bytes.toString('utf8'));
  const [matrixResponse]=await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname==='/api/catalog/author-matrix'),
   page.getByRole('button',{name:'Refresh cross-reviewer matrix',exact:true}).click()]);
  assert.ok(matrixResponse.ok());const matrix=await matrixResponse.json();validateAuthorDecisionMatrix(matrixWork,matrix);
  assert.equal(matrix.inputSha256,sha(matrixInput.bytes));assert.equal(matrix.catalog.id,intent.catalogId);
  const selectedReturns=matrixWork.items.filter(item=>item.catalogId===intent.catalogId);
  assert.equal(matrix.summary.returns,selectedReturns.length);
  for(let i=0;i<selectedReturns.length;i++){
   assert.equal(matrix.observations[i].returnId,selectedReturns[i].id);
   const expected=compareRecipientReview(recipientView(beforeBundle),openRecipientReview(selectedReturns[i].returnText));
   assert.equal(canonical(matrix.observations[i].comparison),canonical(expected));
  }
  await page.locator('#author-matrix-status').filter({hasText:'Observed selected worklist'}).waitFor();
  const matrixDownload=await download('complete-author-decision-matrix.json','Download complete decision matrix');
  assert.equal(canonical(JSON.parse(matrixDownload.bytes)),canonical(matrix));
  await page.locator('#author-matrix-filter').selectOption('disagreement');
  assert.equal(await page.locator('[data-author-matrix-context]').count(),Math.min(matrix.summary.disagreements,20));
  await page.locator('#author-matrix-filter').selectOption('all');
  await shot('cross-reviewer-matrix-desktop',1440);await shot('cross-reviewer-matrix-narrow',390);
  const matrixAfter=await download('matrix-worklist-after-read.json','Download complete author worklist');
  assert.ok(matrixAfter.bytes.equals(matrixInput.bytes),'Read-only matrix changed the complete retained author worklist.');
  await page.locator('[data-author-matrix-open="'+retainedReturn.id+'"]').first().click();
  assert.equal(await page.locator('#recipient-request').isDisabled(),true,'Matrix drill-through bypassed original current comparison.');
  record.steps.push('complete-cross-reviewer-original-snapshot-download-filters-readonly-worklist-and-explicit-drill-through');await save();
  await page.reload();await page.locator('#cat-catalog').waitFor({state:'attached'});
  await page.getByRole('button',{name:'Material catalogs',exact:true}).click();await page.locator('#cat-catalog').selectOption(intent.catalogId);
  await page.getByRole('tab',{name:'Returned customer reviews',exact:true}).click();
  const retainedButton=page.locator('[data-author-open="'+retainedReturn.id+'"]');
  await retainedButton.waitFor();await retainedButton.click();
  await page.locator('#recipient-rows [data-recipient-context]').first().waitFor();
  assert.equal(await page.locator('#recipient-request').isDisabled(),true,'A retained comparison must be explicitly refreshed before new adoption.');
  await page.getByLabel('Merge a complete saved author worklist',{exact:true}).setInputFiles(worklistDownload.path);
  await page.locator('#author-worklist-status').filter({hasText:/Saved .* complete returns in this browser/}).waitFor();
  const coldWork=await download('complete-author-worklist-reopened.json','Download complete author worklist');
  const reopenedList=openAuthorWorklist(coldWork.bytes.toString('utf8'));
  const reopenedItem=reopenedList.items.find(item=>item.id===retainedReturn.id);
  assert.equal(reopenedItem.returnText,retainedReturn.returnText);assert.deepEqual(reopenedItem.draft.choices,saved.choices);
  await page.getByLabel('Reopen saved author review choices',{exact:true}).setInputFiles(working.path);
  await page.locator('#recipient-rows [data-recipient-context]').first().waitFor();
  const reopened=await download('author-review-cold.json','Save author review choices');assert.ok(reopened.bytes.equals(working.bytes));
  await page.getByLabel('Original request file for interrupted receiving',{exact:true}).setInputFiles(input.original.reviewReturn.retained.request.path);
  // This is the already-completed original request, never a freshly generated adoption.
  record.steps.push('original-completed-request-selected-for-replay');await save();
  const [received]=await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname==='/api/catalog-recipient-receive'),
   page.getByRole('button',{name:'Resume original saved request',exact:true}).click()]);
  assert.ok(received.ok());const result=await received.json();assert.equal(canonical(result),canonical(before));
  await page.getByText('The original reviewed return outcome is retained in this catalogue Journal.',{exact:true}).waitFor();
  record.downloads.push(await retain(join(attempt,'original-receiving-outcome.json'),pretty(result)));
  const after=JSON.parse(await get(route));assert.equal(canonical(after),canonical(before));
  const afterText=await get(exportRoute);sameBundle(beforeBundle,openText(afterText,{name:'installed-after.jsonl'}));
  record.downloads.push(await retain(join(attempt,'installed-after.jsonl'),afterText));
  await shot('replayed-outcome-desktop',1440);await shot('replayed-outcome-narrow',390);
  assert.equal(browserErrors.length,0);record.steps.push('complete-worklist-deduplication-portable-merge-browser-cold-open-stale-choice-guard','complete-comparison-choice-file-cold-open-original-ui-replay-and-fresh-full-export');
  record.status='COMPLETE';record.completedAt=new Date().toISOString();await save();return record;
 }catch(error){if(record){record.status='ERROR';record.error={code:error.code??error.name,message:error.message};await retain(path,pretty(record),{replace:true});}throw error;}
 finally{page.off('pageerror',observe);await guard.close();}
}
// Prepare an alias input from the SAME already-completed course, without another adoption.
export async function prepareInstalledAuthorWorklist({directory:inputDirectory,operationId,workspaceId}){
 const directory=resolve(inputDirectory),input=await courseInputs(directory,operationId);
 const guard=await open(join(directory,'.installed-return.lock'),'a',0o600);
 const held=spawnSync('flock',['--exclusive','--nonblock','--conflict-exit-code','75','3'],{stdio:['ignore','pipe','pipe',guard.fd],timeout:10000});
 if(held.status!==0){await guard.close();throw Error('ORIGINAL_INSTALLED_RETURN_GUARD_UNAVAILABLE');}
 try{
  const workingBytes=await retainedFile(input.original.reviewReturn.retained.authorWorking);
  const working=openRecipientWorking(workingBytes.toString('utf8'));
  const comparison=compareRecipientReview(recipientView(working.bundle),input.review);
  assert.equal(comparison.sha256,input.request.expectedComparisonSha256);
  const retained=retainAuthorReturn(createAuthorWorklist(workspaceId),input.returned.toString('utf8'));
  let worklist=retainAuthorDraft(retained.worklist,retained.id,{comparison,
   choices:Object.fromEntries(input.request.choices.map(choice=>[choice.id,choice.choice])),
   actor:input.request.actor,reason:input.request.reason});
  worklist=retainAuthorRequest(worklist,retained.id,input.request,input.requestBytes.toString('utf8'));
  const outcome=input.original.reviewReturn.received;
  assert.equal(outcome.state,'COMPLETE');assert.equal(canonical(outcome.request),canonical(input.request));
  worklist=retainAuthorOutcome(worklist,retained.id,outcome);
  const file=await retain(join(directory,'installed-author-worklist.json'),exportAuthorWorklist(worklist));
  const result={schema:'stellar-forge.material-installed-author-worklist-input.v1',operation:operationId,workspaceId,
   file,returnId:retained.id,requestId:input.request.requestId,requestSha256:sha(input.requestBytes),source:input.source};
  await retain(join(directory,'INSTALLED_AUTHOR_WORKLIST_INPUT.json'),pretty(result));
  return result;
 }finally{await guard.close();}
}

// Invoke only after the original browser/server has released its model; client stays caller-owned.
export async function receiveInstalledRecipientMcp({client,directory:inputDirectory,operationId,returnInputId,requestInputId,worklistInputId}){
 const directory=resolve(inputDirectory),input=await courseInputs(directory,operationId);
 const guard=await open(join(directory,'.installed-return.lock'),'a',0o600);
 const held=spawnSync('flock',['--exclusive','--nonblock','--conflict-exit-code','75','3'],{stdio:['ignore','pipe','pipe',guard.fd],timeout:10000});
 if(held.status!==0){await guard.close();throw Error('ORIGINAL_INSTALLED_RETURN_GUARD_UNAVAILABLE');}
 try{
  const original=await client.operation({requestId:input.request.requestId});assert.equal(original.state,'COMPLETE');assert.equal(original.kind,'catalog-recipient-review');
  const pages=[];for await(const page of client.pages('materialRecipientPreview',{inputId:returnInputId,expectedInputSha256:sha(input.returned),limit:50}))pages.push(page);
  const first=pages[0];assert.ok(first);assert.ok(pages.every(page=>page.comparisonSha256===first.comparisonSha256));
  const rows=pages.flatMap(page=>page.rows);assert.equal(rows.length,first.total);assert.equal(new Set(rows.map(row=>row.id)).size,rows.length);
  assert.deepEqual(rows.map(row=>row.id),input.review.entries.map(row=>row.id));
  const result=await client.materialRecipientReceive({requestId:input.request.requestId,inputId:requestInputId,expectedInputSha256:sha(input.requestBytes)});
  assert.equal(canonical(result),canonical(original),'Original MCP replay changed its complete bounded operation result.');
  assert.equal(canonical(await client.operation({requestId:input.request.requestId})),canonical(original));
  let worklistCourse=null;
  if(worklistInputId!==undefined){
   const retained=JSON.parse(await readFile(join(directory,'INSTALLED_AUTHOR_WORKLIST_INPUT.json'),'utf8'));
   assert.equal(retained.operation,operationId);assert.equal(canonical(retained.source),canonical(input.source));
   const raw=await retainedFile(retained.file),worklist=openAuthorWorklist(raw.toString('utf8'));
   assert.equal(worklist.workspaceId,retained.workspaceId);assert.equal(retained.requestSha256,sha(input.requestBytes));
   const selected={inputId:worklistInputId,expectedInputSha256:sha(raw)},listed=[];
   for await(const page of client.pages('materialWorklistList',{...selected,limit:50}))listed.push(page);
   const rows=listed.flatMap(page=>page.items),item=rows.find(row=>row.returnId===retained.returnId);
   assert.ok(item);assert.equal(item.requests,1);assert.equal(item.outcomes,1);
   assert.equal(listed[0].workspaceId,retained.workspaceId);
   const request=await client.readWorklistRecord({...selected,returnId:item.returnId,section:'request',index:0,limit:1024});
   assert.equal(request.text,input.requestBytes.toString('utf8'));assert.equal(request.recordSha256,sha(input.requestBytes));
   const previews=[];for await(const page of client.pages('materialWorklistPreview',{...selected,returnId:item.returnId,limit:50}))previews.push(page);
   assert.equal(canonical(previews.flatMap(page=>page.rows)),canonical(pages.flatMap(page=>page.rows)));
   const receive={...selected,returnId:item.returnId,requestId:input.request.requestId,expectedRequestSha256:sha(input.requestBytes)};
   const replay=await client.materialWorklistReceive(receive);
   assert.equal(canonical(replay),canonical(original));
   // Exact admitted request recovery does not depend on a still-declared file alias.
   const retired=await client.materialWorklistReceive({...receive,inputId:'worklist-retired-source'});
   assert.equal(canonical(retired),canonical(original));
   assert.equal(canonical(await client.operation({requestId:input.request.requestId})),canonical(original));
   worklistCourse={file:retained.file,returnId:item.returnId,listed,request:{...request,text:undefined},previews,replay,retired};
  }
  const output=join(directory,'installed-return-mcp-'+randomUUID());await mkdir(output,{mode:0o700});await syncDirectory(directory);
  const report={schema:'stellar-forge.material-installed-return-mcp-course.v1',operation:operationId,status:'COMPLETE',
   workspace:client.workspace,endpoint:client.endpoint,requestId:input.request.requestId,requestSha256:sha(input.requestBytes),returnSha256:sha(input.returned),
   source:input.source,pages,original,result,worklistCourse,completedAt:new Date().toISOString()};
  await retain(join(output,'RESULT.json'),pretty(report));return report;
 }finally{await guard.close();}
}
