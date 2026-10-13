// Continue the original analytical receiving with complete browser authoring state.
// The caller owns the existing browser, native client, listener and warehouse lease.
import {constants} from 'node:fs';
import {open,readFile,rename,unlink,mkdir,realpath} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const SCHEMA='stellar-forge.duckdb-analytics.v1';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const canonical=value=>JSON.stringify(value,(key,item)=>plain(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
const same=(first,second)=>canonical(first)===canonical(second);
const need=(condition,message)=>{if(!condition)throw Error(message);};
const id=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const stateMeaning=value=>{const out=structuredClone(value);delete out.updated_at;return out;};
async function syncParent(filename){
 const handle=await open(dirname(filename),constants.O_RDONLY);
 try{await handle.sync();}finally{await handle.close();}
}
async function atomic(filename,bytes){
 const temp=filename+'.pending-'+randomUUID();let handle;
 try{
  handle=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
  await rename(temp,filename);await syncParent(filename);
 }finally{
  if(handle)await handle.close();
  await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});
 }
 return {name:filename.split('/').at(-1),bytes:bytes.length,sha256:sha(bytes)};
}
async function originalFile(filename){
 const handle=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const before=await handle.stat({bigint:true});need(before.isFile(),'The original receiving artifact is not a regular file.');
  const bytes=await handle.readFile(),after=await handle.stat({bigint:true});
  need(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&
   before.mtimeNs===after.mtimeNs&&BigInt(bytes.length)===after.size,'The original receiving artifact changed while reading.');
  return bytes;
 }finally{await handle.close();}
}
async function maybeJSON(filename){
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await originalFile(filename)));}
 catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function retain(filename,bytes){
 try{
  const current=await originalFile(filename);need(current.equals(bytes),'A different complete artifact already occupies '+filename);return {name:filename.split('/').at(-1),bytes:bytes.length,sha256:sha(bytes)};
 }catch(error){if(error.code!=='ENOENT')throw error;}
 return atomic(filename,bytes);
}
function transfer(bytes,workspaceId){
 const packet=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 need(packet?.schema===SCHEMA+'.browser-transfer'&&packet.workspace_id===workspaceId&&
  packet.state?.schema===SCHEMA+'.browser-state'&&packet.state.workspace_id===workspaceId&&
  id(packet.browser?.id)&&Number.isSafeInteger(packet.browser.revision)&&packet.browser.revision>=0&&
  typeof packet.browser.title==='string','The complete original browser-workspace identity changed.');
 return packet;
}
async function idle(page){
 await page.waitForFunction(()=>!document.body.inert&&!document.body.hasAttribute('aria-busy'));
 const error=await page.locator('#notice').evaluate(element=>element.classList.contains('error')?element.textContent:null);
 need(!error,error||'The original browser action failed.');
}
async function screen(page,name){
 await idle(page);await page.locator('[data-screen="'+name+'"]').click();
 await page.locator('#screen-'+name).waitFor({state:'visible'});
}
async function download(page,button,filename,{replace=false}={}){
 const pending=page.waitForEvent('download');await button.click();const file=await pending;
 const error=await file.failure();need(!error,error||'The complete download failed.');
 const saved=await file.path();need(saved,'The original browser download did not return its local file.');
 const bytes=await readFile(saved),receipt=await (replace?atomic:retain)(filename,bytes);
 await idle(page);return {bytes,receipt};
}
async function importDraft(page,filename){
 await screen(page,'browser');await page.locator('#browser-file').setInputFiles(filename);
 await page.locator('#import-browser').click();await idle(page);
 await page.waitForFunction(()=>document.querySelector('#notice')?.textContent.includes('Reopened the complete imported browser workspace'));
}
async function browserFile(nativeCall,identity,revision,workspaceId){
 const record=await nativeCall('analytics-browser-workspace',{id:identity,revision});
 need(record.id===identity&&record.revision===revision&&record.workspace_id===workspaceId&&
  hash(record.state_sha256)&&hash(record.file?.sha256)&&Number.isSafeInteger(record.file.bytes),'The saved original browser revision changed.');
 const parts=[];let offset=0;
 for(;;){
  const item=await nativeCall('analytics-browser-workspace-file',{id:identity,revision,sha256:record.file.sha256,offset,length:65536});
  need(item.id===identity&&item.revision===revision&&item.workspace_id===workspaceId&&item.sha256===record.file.sha256&&
   item.bytes===record.file.bytes&&item.offset===offset&&item.encoding==='base64'&&typeof item.data_base64==='string','The complete original browser-file range changed.');
  const bytes=Buffer.from(item.data_base64,'base64');parts.push(bytes);offset+=bytes.length;
  if(item.complete){need(item.next_offset===null&&offset===record.file.bytes,'The original browser file stopped before its end.');break;}
  need(bytes.length>0&&item.next_offset===offset&&offset<record.file.bytes,'The original browser-file continuation changed.');
 }
 const bytes=Buffer.concat(parts);need(bytes.length===record.file.bytes&&sha(bytes)===record.file.sha256,'The complete browser-file SHA256 changed.');
 const packet=transfer(bytes,workspaceId);need(packet.browser.id===identity&&packet.browser.revision===revision&&packet.browser.title===record.title,'The original browser-file metadata changed.');
 return {record,bytes,packet};
}
async function originalRequest(page){
 await screen(page,'requests');
 for(;;){
  const rows=page.locator('#request-list .saved-item'),count=await rows.count();
  for(let index=0;index<count;index++){
   const row=rows.nth(index),label=await row.locator('strong').textContent();
   if(!/^(analyses|run|compare|workbooks|publish) · COMPLETE$/.test(label||''))continue;
   await row.getByRole('button',{name:'Read original',exact:true}).click();await idle(page);
   const record=JSON.parse(await page.locator('#request-json').textContent());
   need(id(record.request_id)&&record.state==='COMPLETE'&&record.body?.request_id===record.request_id,
    'The selected original completed request is missing its full body.');
   return record;
  }
  const next=page.locator('#request-pager').getByRole('button',{name:'Next',exact:true});
  need(await next.count()&&!await next.isDisabled(),'The original analytical operation journal has no completed source request.');
  await next.click();await idle(page);
 }
}
async function editDraft(page,input){
 const request=await originalRequest(page);
 await screen(page,'analysis');
 need(await page.locator('#analysis-select').inputValue()===input.analysis,'Open the original saved analysis before its browser-workspace continuation.');
 const firstColumn=await page.locator('#analysis-edition').inputValue();
 need(firstColumn===input.original_edition,'The original selected analysis source changed.');
 await page.locator('#analysis-title').fill('Original source · receiving engineer working draft');
 await page.locator('#analysis-description').fill('Complete retained authoring: exact original source, unfinished fields and the saved native request.\nContinue this edition after receiving.');
 await page.locator('#add-dimension').click();await idle(page);
 const dimension=page.locator('#dimensions > *').last();
 const column=await dimension.locator('.dim-column option').evaluateAll(rows=>rows.find(row=>row.value)?.value);
 need(column,'The original source has no selectable field.');
 await dimension.locator('.dim-column').selectOption(column);await dimension.locator('.dim-name').fill('ReceivingField');
 await page.locator('#add-measure').click();await idle(page);
 const measure=page.locator('#measures > *').last();
 await measure.locator('.measure-name').fill('ReceivingRows');await measure.locator('.measure-note').fill('Exact source row accounting; unfinished engineering note.');
 await page.locator('#add-filter').click();await idle(page);
 const filter=page.locator('#filters > *').last();
 await filter.locator('.filter-column').selectOption(column);await filter.locator('.filter-operator').selectOption('in');
 await filter.locator('.filter-value').fill('["unfinished source value",');await filter.locator('.filter-nulls').selectOption('include');
 await page.locator('#pivot-column').selectOption(column);await page.locator('#add-pivot').click();await idle(page);
 const pivot=page.locator('#pivot-values > *').last();
 await pivot.locator('.pivot-value').fill('"unfinished original value');await pivot.locator('.pivot-label').fill('Receiving draft');
 await page.locator('#pivot-null').setChecked(true);await page.locator('#pivot-other').setChecked(false);
 await page.locator('#pivot-null-label').fill('Original SQL NULL');await page.locator('#pivot-other-label').fill('Remaining original values');
 await page.locator('#analysis-order').fill('[{"column":"ReceivingField","direction":"desc","nulls":"first"}]');
 await page.locator('#analysis-json').fill('{\n  "original_edition": "'+input.original_edition+'",\n  "unfinished": ');
 await screen(page,'workbook');
 need(await page.locator('#workbook-select').inputValue()===input.workbook,'Open the original workbook before the receiving draft.');
 await page.locator('#workbook-title').fill('Original workbook · complete working handover');
 await page.locator('#workbook-author').fill('Receiving engineer');await page.locator('#workbook-description').fill('Original result tables, full editorial state and unfinished pages remain editable.');
 const first=page.locator('#workbook-pages > *').first();
 await first.locator('.page-title').fill('Original result · engineer interpretation');await first.locator('.page-text').fill('Unfinished interpretation retains every original table and source binding.');
 await page.locator('#add-text-page').click();await idle(page);
 const notes=page.locator('#workbook-pages > *').last();await notes.locator('.page-title').fill('Receiving notes');await notes.locator('.page-text').fill('Preserve whitespace:\n\n  original source and later decisions.\n');
 await page.locator('#add-table-page').click();await idle(page);
 const incomplete=page.locator('#workbook-pages > *').last();await incomplete.locator('.page-title').fill('Unselected result page');await incomplete.locator('.page-text').fill('This page has not selected a native result yet.');
 await page.locator('#workbook-json').fill('{\n  "title": "Original workbook",\n  "unfinished_pages": [');
 await screen(page,'browser');await page.locator('#browser-title').fill('Original analytical receiving · complete draft');
 return request;
}

/**
 * Invoke from the existing whole customer driver after its original six views,
 * source review, result/report and complete package checks, before closing its
 * one native client/browser. No new listener, source, query or result is created.
 *
 * nativeCall(operation, body) is the owner's registered native DuckDB caller and
 * returns its result object. Pass the original node-input.json object unchanged.
 */
export async function receiveBrowserWorkspace({page,input,nativeCall,operationId=input?.operation_id??'browser:'+input?.report}={}){
 need(page&&typeof nativeCall==='function'&&id(input?.workspace_id)&&hash(input?.report)&&
  hash(input?.original_edition)&&hash(input?.analysis)&&hash(input?.workbook)&&typeof operationId==='string',
  'Use the original complete analytical receiving input and existing native caller.');
 const parent=await realpath(resolve(input.directory)),directory=join(parent,'browser-workspace-receiving');
 await mkdir(directory,{recursive:true,mode:0o700});await syncParent(directory);
 need(await realpath(directory)===directory,'Use the original canonical private receiving directory.');
 const filename=join(directory,'receiving.json'),binding={operation_id:operationId,workspace_id:input.workspace_id,
  source_root:resolve(input.source_root),report_id:input.report,edition_id:input.original_edition,
  analysis_id:input.analysis,workbook_id:input.workbook,original_export_id:input.export.export_id};
 let record=await maybeJSON(filename);
 if(record)need(record.schema===SCHEMA+'.browser-receiving'&&same(record.input,binding),'The retained browser receiving input changed.');
 else record={schema:SCHEMA+'.browser-receiving',input:binding,state:'RUNNING',created_at:new Date().toISOString(),steps:{},requests:[]};
 let saves=Promise.resolve(),routeError=null;
 const save=()=>{const bytes=Buffer.from(JSON.stringify(record,null,2)+'\n');const next=saves.then(()=>atomic(filename,bytes));saves=next.catch(()=>{});return next;};
 await save();
 const checkedLocal=async file=>{
  const bytes=await originalFile(join(directory,file.name));
  need(bytes.length===file.bytes&&sha(bytes)===file.sha256,'A retained complete receiving artifact changed.');return bytes;
 };
 if(record.state==='COMPLETE'){
  for(const file of Object.values(record.files))await checkedLocal(file);
  const native=await browserFile(nativeCall,record.browser.id,record.browser.revision,input.workspace_id);
  need(native.record.file.sha256===record.browser.file.sha256,'The original completed browser revision changed.');
  return structuredClone(record);
 }
 const rawPath=join(directory,'original-browser-draft.json');
 if(!record.steps.original_draft){
  const existing=await maybeJSON(rawPath);
  let received;
  if(existing){
   const bytes=await originalFile(rawPath);received={bytes,receipt:{name:'original-browser-draft.json',bytes:bytes.length,sha256:sha(bytes)}};
  }else{
   record.original_request=await editDraft(page,input);
   received=await download(page,page.locator('#export-browser'),rawPath);
  }
  const packet=transfer(received.bytes,input.workspace_id);
  need(packet.state.context.analysis?.id===input.analysis&&packet.state.context.workbook?.id===input.workbook&&
   packet.state.context.analysis_source_edition===input.original_edition&&packet.state.selection.screen==='browser'&&
   packet.state.rows.filters.some(row=>row.raw==='["unfinished source value",')&&packet.state.pages.some(row=>row.title==='Unselected result page')&&
   Object.keys(packet.state.receipts).length>0,'The complete authored source, pages and original request were not retained.');
  record.files={...(record.files||{}),original_draft:received.receipt};record.steps.original_draft=true;await save();
 }
 const raw=await checkedLocal(record.files.original_draft),original=transfer(raw,input.workspace_id);
 await importDraft(page,rawPath);
 if(!record.steps.native_save){
  let savedRequest=record.requests.find(item=>item.phase==='native-save');
  if(!savedRequest){
   const routePattern='**/api/analytics/browser-workspaces';
   const intercept=async route=>{
    try{
     const request=route.request();
     if(request.method()!=='POST'){await route.fallback();return;}
     const body=request.postDataJSON();
     need(body.workspace_id===input.workspace_id&&body.id===original.browser.id&&body.expected_revision===original.browser.revision&&
      same(stateMeaning(body.state),stateMeaning(original.state))&&id(body.request_id),'The native save changed the complete submitted browser draft.');
     const current=record.requests.find(item=>item.phase==='native-save');
     if(current)need(same(current.body,body),'The original browser save request changed before receiving.');
     else{record.requests.push({phase:'native-save',route:'/api/analytics/browser-workspaces',body,created_at:new Date().toISOString()});await save();}
     await route.continue();
    }catch(error){routeError=error;await route.abort('failed');}
   };
   await page.route(routePattern,intercept);
   try{
    const responsePromise=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/analytics/browser-workspaces');
    await page.locator('#save-browser').click();const response=await responsePromise;
    if(routeError)throw routeError;need(response.ok(),'The original browser save returned HTTP '+response.status());
    const value=await response.json();need(value.id===original.browser.id&&value.workspace_id===input.workspace_id,'The original browser save response changed.');
    record.browser={id:value.id,revision:value.revision,title:value.title,state_sha256:value.state_sha256,file:value.file};
    await idle(page);await save();
   }finally{await page.unroute(routePattern,intercept);}
  }else{
   const {workspace_id,...body}=savedRequest.body;
   need(workspace_id===input.workspace_id,'The original saved request belongs to another warehouse.');
   const value=await nativeCall('analytics-save-browser-workspace',body);
   record.browser={id:value.id,revision:value.revision,title:value.title,state_sha256:value.state_sha256,file:value.file};await save();
  }
  const full=await browserFile(nativeCall,record.browser.id,record.browser.revision,input.workspace_id);
  need(same(stateMeaning(full.packet.state),stateMeaning(original.state)),'Native receiving changed the complete original browser state.');
  record.files.native_file=await retain(join(directory,'native-browser-workspace.json'),full.bytes);
  record.steps.native_save=true;await save();
 }
 const native=await browserFile(nativeCall,record.browser.id,record.browser.revision,input.workspace_id);
 need(native.record.file.sha256===record.browser.file.sha256,'The pinned native browser file changed.');
 const nativePath=join(directory,'native-browser-workspace.json');
 await retain(nativePath,native.bytes);await importDraft(page,nativePath);
 const exportAndCompare=async name=>{
  const result=await download(page,page.locator('#export-browser'),join(directory,name),{replace:true});
  const packet=transfer(result.bytes,input.workspace_id);
  need(same(packet.browser,native.packet.browser)&&same(stateMeaning(packet.state),stateMeaning(native.packet.state)),
   'Export/reload/import changed a complete raw field, dynamic array, selected revision or original request.');
  record.files[name.replaceAll('.','_')]=result.receipt;await save();return result;
 };
 if(!record.steps.reload_import){
  await exportAndCompare('before-reload.json');await page.reload({waitUntil:'networkidle'});await idle(page);
  await page.waitForFunction(()=>document.querySelector('#notice')?.textContent.includes('Original workspace opened.'));
  await screen(page,'browser');await exportAndCompare('after-reload.json');
  await importDraft(page,join(directory,'before-reload.json'));await screen(page,'browser');
  await exportAndCompare('after-import.json');
  record.steps.reload_import=true;await save();
 }
 if(!record.steps.portable_export){
  let request=record.requests.find(item=>item.phase==='portable-export');
  if(!request){
   request={phase:'portable-export',route:'/api/analytics/exports',body:{request_id:randomUUID().replaceAll('-',''),
    report_id:input.report,browser_workspace:{id:record.browser.id,revision:record.browser.revision,state_sha256:record.browser.state_sha256}},created_at:new Date().toISOString()};
   record.requests.push(request);await save();
  }
  const value=await nativeCall('analytics-export',request.body);
  need(value.workspace_id===input.workspace_id&&value.report_id===input.report&&value.state==='COMPLETE'&&
   same({id:value.browser_workspace?.id,revision:value.browser_workspace?.revision,state_sha256:value.browser_workspace?.state_sha256},request.body.browser_workspace)&&
   value.browser_workspace.sha256===record.browser.file.sha256,'The complete portable package lost its selected browser revision.');
  record.export=value;await save();
  await page.locator('#refresh').click();await idle(page);await screen(page,'reports');
  await page.locator('#export-select').selectOption(value.export_id);await page.locator('#open-export').click();await idle(page);
  const full=await download(page,page.getByRole('button',{name:/^Download whole customer package/}),join(directory,'complete-edited-workbook.zip'));
  need(full.receipt.bytes===value.archive.bytes&&full.receipt.sha256===value.archive.sha256,'The complete edited warehouse download changed.');
  record.files.portable_export=full.receipt;record.steps.portable_export=true;await save();
 }
 // Reopen the same full authoring state while leaving the frozen original report intact.
 await importDraft(page,nativePath);await screen(page,'browser');
 record.state='COMPLETE';record.completed_at=new Date().toISOString();await save();await saves;
 return structuredClone(record);
}
