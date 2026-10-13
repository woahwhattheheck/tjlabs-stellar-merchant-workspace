// SPDX-License-Identifier: MIT
// Borrow the original receiving parent's existing pages. No browser/native writer is created.
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initializationDirectory as directory,initializationBytes as bytes,
 optionalInitializationBytes as optionalBytes,retainInitializationFile as retain}
 from '../../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/initialization.mjs';
import {reopen,canonical,replaceColumns,selectedOrdinal,eventWorkbookReturns as reviews}
 from '../../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/event-feed/workbook-columns.mjs';

export const EVENT_COLLEAGUE_BROWSER='stellar-forge.event-workbook-colleague-browser.v1';
const LIMIT=128*1024*1024,HASH=/^[0-9a-f]{64}$/,own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const need=(ok,text)=>{if(!ok)throw Error(text);};
const encode=value=>Buffer.from(canonical(value)+'\n');
const decode=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const identity=raw=>({bytes:raw.length,sha256:sha(raw)});
const same=(a,b)=>canonical(a)===canonical(b);
const stamp=()=>new Date().toISOString();
const rawBrowsers=new WeakMap();
function active(signal){
 if(signal?.aborted)throw signal.reason instanceof Error?signal.reason:Object.assign(new Error('The original receiving parent cancelled this browser phase.'),{name:'AbortError'});
}
function guardedOptions(options){
 active(options.signal);
 const signal=options.signal,cache=new WeakMap();
 function wrap(value){
  if(value===null||typeof value!=='object'||Array.isArray(value)||ArrayBuffer.isView(value)||value instanceof ArrayBuffer||
   Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)return value;
  if(cache.has(value))return cache.get(value);
  const proxy=new Proxy(value,{get(target,key){
   const member=Reflect.get(target,key,target);if(typeof member!=='function')return member;
   return (...args)=>{
    // Removing our own temporary listener is cleanup, not a new browser operation.
    if(key!=='off'&&key!=='removeListener')active(signal);
    const result=member.apply(target,args);
    if(result&&typeof result.then==='function')return result.then(next=>{active(signal);return wrap(next);});
    if(key!=='off'&&key!=='removeListener')active(signal);
    return wrap(result);
   };
  }});
  cache.set(value,proxy);rawBrowsers.set(proxy,value);return proxy;
 }
 return {...options,page:wrap(options.page),reopenPage:wrap(options.reopenPage)};
}
async function save(path,value){return retain(path,encode(value),{resume:true});}
async function json(path){return decode(await bytes(path,LIMIT));}
function browserPage(page){need(page&&typeof page.goto==='function'&&typeof page.locator==='function'&&typeof page.waitForEvent==='function','Pass an existing caller-owned Playwright page.');}
function decodeEditor(raw){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
 const matches=[...text.matchAll(/<script\b(?=[^>]*\bid=["']editor-data["'])[^>]*>([\s\S]*?)<\/script>/gi)];
 need(matches.length===1,'The complete editor must retain one original editor-data element.');
 const data=JSON.parse(matches[0][1]);
 need(data.schema==='stellar-forge.event-workbook-editor.v1','The downloaded file is not the original editable worksheet.');
 return reopen(data.choices);
}
function validateEdits(working,edits){
 need(Array.isArray(edits),'Supply the exact reviewed whole-array edits, including an explicit empty list.');
 let result=reopen(working);const seen=new Set();
 for(const edit of edits){
  need(edit&&Number.isSafeInteger(edit.sheet)&&!seen.has(edit.sheet),'Choose each original worksheet index once.');
  seen.add(edit.sheet);
  const sheet=result.original.proposal.worksheets.find(row=>row.sheet===edit.sheet);
  need(sheet&&same(result.columns[String(edit.sheet)],edit.expected_columns),'An edit does not match the exact original worksheet array.');
  need(Array.isArray(edit.columns),'Each edit must provide the complete desired ordered column array.');
  for(const column of edit.columns)need(selectedOrdinal(sheet.new_source,column)>=0,'Choose every desired source from the original worksheet, including its report ordinal.');
  result=replaceColumns(result,{...result.columns,[String(edit.sheet)]:edit.columns});
 }
 return result;
}
async function scope(options,kind,selection){
 active(options.signal);browserPage(options.page);
 need(typeof options.directory==='string'&&resolve(options.directory)!=='/','Use the complete original receiving directory.');
 need(typeof options.browserIdentity==='string'&&options.browserIdentity.trim().length>0,'Record the existing permitted browser/source owner identity.');
 const parent=resolve(options.directory);await directory(parent);
 const original=await json(join(parent,'course.json'));active(options.signal);
 need(original.schema==='stellar-forge.event-workbook-colleague-course.v1'&&original.workspace_id===options.expectedWorkspaceId&&original.programme===options.programme&&original.proposal_action_id===options.proposalActionId,'Open the exact original workspace, programme and proposal action receiving course.');
 const root=join(parent,'browser');await directory(root,{create:true});
 const selected={schema:EVENT_COLLEAGUE_BROWSER,kind,course:original,browser_identity:options.browserIdentity,selection};
 const folder=join(root,kind+'-'+sha(encode(selected)));await directory(folder,{create:true});
 await save(join(folder,'selection.json'),selected);
 return {parent,folder,selected};
}
async function originalArtifact(folder,name,raw){
 await retain(join(folder,name),raw,{resume:true});
 await save(join(folder,name+'.file.json'),identity(raw));
 return join(folder,name);
}
async function verifyArtifact(folder,name){
 const raw=await bytes(join(folder,name),LIMIT),record=await json(join(folder,name+'.file.json'));
 need(same(identity(raw),record),'A retained complete browser file changed: '+name);
 return raw;
}
async function complete(scopeValue,result){
 await save(join(scopeValue.folder,'complete.json'),result);return {...result,directory:scopeValue.folder};
}
async function prior(scopeValue){
 const raw=await optionalBytes(join(scopeValue.folder,'complete.json'),LIMIT);if(raw===null)return null;
 const value=decode(raw);
 for(const file of value.files||[])await verifyArtifact(scopeValue.folder,file);
 for(const image of value.screenshots||[])await verifyArtifact(scopeValue.folder,image.file);
 return {...value,directory:scopeValue.folder,reopened:true};
}
async function openEditor(page,path,expected,options){
 active(options.signal);browserPage(page);
 const current=page.url();
 // The parent allocates an empty or existing course-file page; never replace another live product tab.
 if(current!=='about:blank'){
  need(current.startsWith('file:'),'Provide a separate caller-owned empty/file page for the complete worksheet.');
  const opened=resolve(fileURLToPath(current)),root=resolve(options.directory);
  need(opened===root||opened.startsWith(root+'/'),'Keep unrelated opened files in their original tab.');
 }
 const beforeUnload=dialog=>{if(dialog.type()==='beforeunload')dialog.accept();else dialog.dismiss();};
 page.on('dialog',beforeUnload);
 try{await page.goto(pathToFileURL(resolve(path)).href,{waitUntil:'domcontentloaded'});}
 finally{page.off('dialog',beforeUnload);}
 await page.locator('main[aria-busy="false"]').waitFor();
 need(await page.locator('#editor-status').getAttribute('data-error')!=='true','The complete editor reported an opening error: '+await page.locator('#editor-status').innerText());
 const actual=await page.locator('#editor-data').textContent();
 need(same(reopen(JSON.parse(actual).choices),expected),'The browser opened a different original working copy.');
 return page;
}
async function capture(page,folder,label){
 const images=[],original=page.viewportSize();
 need(original,'The supplied receiving page must have an explicit viewport.');
 try{
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});
   const raw=await page.screenshot({fullPage:true,animations:'disabled'});
   const name=label+'-'+width+'-'+sha(raw)+'.png';
   await originalArtifact(folder,name,raw);
   images.push({file:name,...identity(raw),width,height:900,full_page:true,captured_at:stamp()});
  }
 }finally{await (rawBrowsers.get(page)||page).setViewportSize(original);}
 return images;
}
async function requestDownload(page,folder,name,trigger,validate,options){
 active(options.signal);
 const existing=await optionalBytes(join(folder,name),LIMIT);active(options.signal);
 if(existing!==null){
  validate(existing);await originalArtifact(folder,name,existing);return existing;
 }
 const marker=join(folder,name+'.download-request.json'),previous=await optionalBytes(marker,65536);active(options.signal);
 let raw;
 if(previous!==null){
  const saved=await optionalBytes(join(folder,name+'.download-source.json'),65536);active(options.signal);
  const recovered=options.recoverDownloads?.[name]??(saved===null?null:decode(saved).path);
  need(typeof recovered==='string','The original '+name+' download was already requested. Supply its actual recovered download path in recoverDownloads; this phase will not generate another attributed return.');
  active(options.signal);raw=await bytes(resolve(recovered),LIMIT);active(options.signal);
 }else{
  await save(marker,{schema:EVENT_COLLEAGUE_BROWSER,name,requested_at:stamp()});
  const waiting=page.waitForEvent('download');
  try{
   await trigger();
   const download=await waiting,error=await download.failure();
   need(!error,'The original browser download failed: '+error);
   const source=await download.path();
   need(typeof source==='string','Receive this original download through the parent and supply recoverDownloads on continuation.');
   await save(join(folder,name+'.download-source.json'),{path:source,suggested_filename:download.suggestedFilename()});
   raw=await bytes(source,LIMIT);active(options.signal);
  }catch(error){waiting.catch(()=>{});throw error;}
 }
 active(options.signal);validate(raw);
 await originalArtifact(folder,name,raw);active(options.signal);return raw;
}
async function exportWorking(page,folder,name,expected,options){
 return requestDownload(page,folder,name,()=>page.locator('#save-choices').click(),raw=>{
  need(same(reopen(decode(raw)),expected),'The browser working-file download differs from the complete expected source and choices.');
 },options);
}
async function navigateColumn(page,index){
 await page.getByRole('button',{name:'Earlier columns',exact:true}).waitFor();
 while(!await page.getByRole('button',{name:'Earlier columns',exact:true}).isDisabled())
  await page.getByRole('button',{name:'Earlier columns',exact:true}).click();
 const target=Math.floor(index/20);
 for(let i=0;i<target;i++)await page.getByRole('button',{name:'Later columns',exact:true}).click();
 return page.locator('#editor-root fieldset').nth(index%20);
}
async function editArrays(page,working,edits){
 await page.getByRole('button',{name:'Edit worksheet columns',exact:true}).click();
 for(const edit of edits){
  const sheet=working.original.proposal.worksheets.find(row=>row.sheet===edit.sheet);
  await page.getByLabel('Worksheet',{exact:true}).selectOption(String(edit.sheet));
  let length=edit.expected_columns.length;
  while(length>edit.columns.length){const field=await navigateColumn(page,length-1);await field.getByRole('button',{name:'Remove this output column',exact:true}).click();length--;}
  while(length<edit.columns.length){await page.getByRole('button',{name:'Add an output column',exact:true}).click();length++;}
  for(let index=0;index<edit.columns.length;index++){
   const column=edit.columns[index];
   let field=await navigateColumn(page,index);
   await field.getByLabel('New source column',{exact:true}).selectOption(String(selectedOrdinal(sheet.new_source,column)));
   field=page.locator('#editor-root fieldset').nth(index%20);
   await field.getByLabel('Excel heading',{exact:true}).fill(column.header);
   await field.getByLabel('Conversion',{exact:true}).selectOption(column.type);
   // A blank-cell choice still retains its complete dormant null label.
   await field.getByLabel('Null values',{exact:true}).selectOption('text');
   field=page.locator('#editor-root fieldset').nth(index%20);
   await field.getByLabel('Complete null label',{exact:true}).fill(column.null_text);
   await field.getByLabel('Null values',{exact:true}).selectOption(column.null);
   field=page.locator('#editor-root fieldset').nth(index%20);
   await field.getByLabel('Precision',{exact:true}).selectOption(column.precision);
  }
 }
}
async function reopenDownloaded(page,folder,htmlName,expected,options,label){
 await openEditor(page,join(folder,htmlName),expected,options);
 await exportWorking(page,folder,label+'-reopened.json',expected,options);
 const screenshots=await capture(page,folder,label+'-reopened');
 return {screenshots,file:label+'-reopened.json'};
}
/** Operate actual UI controls with caller-selected complete arrays; save and cold-reopen every edition. */
export async function operateEventWorkbookColleagueCopy(options={}){
 options=guardedOptions(options);
 need(options.role==='producer'||options.role==='reviewer','Choose the original producer or reviewer role.');
 need(Array.isArray(options.edits),'Supply the whole explicit edits list.');
 need(options.reopenPage&&options.reopenPage!==options.page,'Supply a distinct existing empty/file page for independent reopening.');
 if(options.role==='reviewer')need(typeof options.actor==='string'&&options.actor.trim()&&typeof options.returnNote==='string'&&options.returnNote.trim(),'Record the actual reviewer and return note.');
 const selection={role:options.role,edits:options.edits,...(options.role==='reviewer'?{actor:options.actor,return_note:options.returnNote}:{})};
 const s=await scope(options,options.role,selection),old=await prior(s);active(options.signal);if(old)return old;
 const stem=options.role==='producer'?'producer-issued':'reviewer-start';
 const initial=reopen(await json(join(s.parent,stem+'.json'))),assignment=await json(join(s.parent,'assignment.json'));
 need(initial.original.workspace_id===s.selected.course.workspace_id&&initial.original.programme===s.selected.course.programme,'The complete editor belongs to another original workspace/programme.');
 need(same(reviews.assignmentEnvelope(initial,assignment.assignment.id),assignment),'The complete editor retains a different original assignment.');
 if(options.role==='reviewer')need(same(initial,reviews.openAssignment(assignment)),'The reviewer HTML must start from the exact complete assigned baseline.');
 need(same(decodeEditor(await bytes(join(s.parent,stem+'.html'),LIMIT)),initial),'The original HTML and working source differ.');
 let expected=validateEdits(initial,options.edits);
 if(options.role==='reviewer'){
  expected=reviews.setPending(expected,'actor',options.actor);
  expected=reviews.setPending(expected,'return-note',options.returnNote);
 }
 await openEditor(options.page,join(s.parent,stem+'.html'),initial,options);
 await editArrays(options.page,initial,options.edits.map(edit=>({...edit,columns:expected.columns[String(edit.sheet)]})));
 const screenshots=await capture(options.page,s.folder,'edited-columns');
 if(options.role==='reviewer'){
  await options.page.getByRole('button',{name:'Assignments and returned reviews',exact:true}).click();
  await options.page.getByLabel('Recording operator',{exact:true}).fill(options.actor);
  await options.page.getByLabel('Note accompanying the complete returned review',{exact:true}).fill(options.returnNote);
  screenshots.push(...await capture(options.page,s.folder,'reviewer-attribution'));
 }
 const workingName=options.role==='producer'?'producer-current.json':'reviewer-current.json';
 await exportWorking(options.page,s.folder,workingName,expected,options);
 await requestDownload(options.page,s.folder,'complete-editor.html',()=>options.page.locator('#save-editor').click(),raw=>{
  need(same(decodeEditor(raw),expected),'The saved HTML does not contain the complete edited working source.');
 },options);
 await requestDownload(options.page,s.folder,'original-proposal.json',()=>options.page.locator('#save-original').click(),raw=>{
  need(same(decode(raw),initial.original.proposal),'The browser proposal download differs from its original native source.');
 },options);
 const files=[workingName,'complete-editor.html','original-proposal.json'];
 let returned;
 if(options.role==='reviewer'){
  const raw=await requestDownload(options.page,s.folder,'reviewer-return.json',()=>options.page.getByRole('button',{name:'Download complete returned review',exact:true}).click(),data=>{
   const envelope=decode(data);
   need(envelope.return?.actor===options.actor&&envelope.return?.note===options.returnNote,'The original returned review attribution changed.');
   const rebuilt=reviews.prepareReturn(expected,assignment.assignment.id,{actor:options.actor,note:options.returnNote,at:envelope.return.at});
   need(same(envelope,rebuilt),'The returned review differs from the complete edited worksheet and its immutable assignment.');
  },options);
  returned=decode(raw).return;files.push('reviewer-return.json');
 }
 const reopened=await reopenDownloaded(options.reopenPage,s.folder,'complete-editor.html',expected,options,'independent');
 files.push(reopened.file);screenshots.push(...reopened.screenshots);
 return complete(s,{schema:EVENT_COLLEAGUE_BROWSER,kind:options.role,state:'BROWSER_FILES_RECEIVED',
  source:identity(encode(initial)),working:identity(await verifyArtifact(s.folder,workingName)),
  ...(returned?{return:returned}:{}),files,screenshots,
  operator_review:'Inspect the actual retained PNG pixels and all outgoing files before presenting this edition.'});
}
/** Inspect the exact frozen comparison; explicit reconciliation remains in the original source-native phase. */
export async function inspectEventWorkbookColleagueStage(options={}){
 options=guardedOptions(options);
 need(HASH.test(options.stageId??''),'Use the exact saved source-native stage digest.');
 need(options.reopenPage&&options.reopenPage!==options.page,'Supply a distinct existing empty/file reopening page.');
 const s=await scope(options,'stage',{stage_id:options.stageId}),old=await prior(s);active(options.signal);if(old)return old;
 const stage=join(s.parent,'stages',options.stageId),working=reopen(await json(join(stage,'staged-working.json'))),
 returned=await json(join(stage,'reviewer-return.json')),preview=await json(join(stage,'preview.json'));
 need(same(reviews.previewReturn(working,returned),preview),'The frozen complete comparison changed.');
 need(same(decodeEditor(await bytes(join(stage,'staged-working.html'),LIMIT)),working),'The frozen stage HTML changed.');
 await openEditor(options.page,join(stage,'staged-working.html'),working,options);
 await options.page.getByRole('button',{name:'Assignments and returned reviews',exact:true}).click();
 const screenshots=await capture(options.page,s.folder,'whole-comparison');
 await exportWorking(options.page,s.folder,'staged-working.json',working,options);
 await requestDownload(options.page,s.folder,'complete-comparison.html',()=>options.page.getByRole('button',{name:'Download full comparison report',exact:true}).click(),raw=>{
  const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
  need(text.includes('Complete returned worksheet review')&&text.includes(preview.return_id),'The complete comparison report belongs to another return.');
 },options);
 await requestDownload(options.page,s.folder,'complete-editor.html',()=>options.page.locator('#save-editor').click(),raw=>{
  need(same(decodeEditor(raw),working),'The complete stage editor changed its retained source.');
 },options);
 const reopened=await reopenDownloaded(options.reopenPage,s.folder,'complete-editor.html',working,options,'independent');
 screenshots.push(...reopened.screenshots);
 return complete(s,{schema:EVENT_COLLEAGUE_BROWSER,kind:'stage',state:'BROWSER_COMPARISON_RECEIVED',stage_id:options.stageId,
  preview,files:['staged-working.json','complete-comparison.html','complete-editor.html',reopened.file],screenshots,
  operator_review:'Read the whole comparison and inspect the actual PNG pixels; pass explicit decisions to the original prepare phase.'});
}
async function clickOverview(page,button){
 const response=page.waitForResponse(r=>{try{return r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/event-programmes';}catch{return false;}});
 try{await page.locator(button).click();const received=await response;need(received.ok(),'The original saved-action overview could not be read.');return received.json();}
 catch(error){response.catch(()=>{});throw error;}
}
async function openSavedAction(page,id,expectedWorkspace){
 browserPage(page);
 need(await page.locator('#actions').count()===1,'Use the existing original Analysis Event operator page.');
 let overview=await clickOverview(page,'#latest-actions'),seen=new Set();
 for(;;){
  need(overview.workspace_id===expectedWorkspace&&Array.isArray(overview.actions),'The original Analysis workspace changed.');
  const index=overview.actions.findIndex(row=>row.id===id);
  if(index>=0){
   const response=page.waitForResponse(r=>{try{return r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/event-programmes/actions/'+id;}catch{return false;}});
   try{
    await page.locator('#actions tr').nth(index).getByRole('button',{name:'Open',exact:true}).click();
    const received=await response;need(received.ok(),'The original saved action could not be read.');
    const action=await received.json();
    need(action.id===id&&action.workspace_id===expectedWorkspace,'The browser opened another native action.');
    await page.locator('#column-receiving-history').getByRole('button',{name:'Download complete saved worksheet review',exact:true}).waitFor();
    need((await page.locator('#action-state').innerText()).includes(id),'The original saved action is not displayed.');
    return action;
   }catch(error){response.catch(()=>{});throw error;}
  }
  need(typeof overview.next_actions==='string'&&!seen.has(overview.next_actions),'The selected native action is not in the complete paged saved-action history.');
  seen.add(overview.next_actions);overview=await clickOverview(page,'#older-actions');
 }
}
/** Read the actual saved native action through its original UI; never click native Apply or Deliver. */
export async function inspectEventWorkbookColleagueSavedAction(options={}){
 options=guardedOptions(options);
 need(typeof options.actionId==='string'&&typeof options.expectedActionPath==='string','Supply the exact completed native action and its retained complete source.');
 need(options.reopenPage&&options.reopenPage!==options.page,'Supply a distinct existing empty/file reopening page.');
 const expectedRaw=await bytes(resolve(options.expectedActionPath),LIMIT),expected=decode(expectedRaw);
 need(expected.id===options.actionId&&expected.status==='COMPLETE'&&expected.result?.state==='APPLIED','Inspect the original complete accepted native Apply.');
 const working=reopen(expected.request.column_review);
 const original=reopen(await json(join(resolve(options.directory),'producer-issued.json')));active(options.signal);
 need(same(working.original,original.original)&&expected.request.operation_id===original.original.proposal.operation_id&&expected.request.review_sha256===original.original.proposal.review_sha256,'The saved Apply must retain this exact original worksheet proposal.');
 const s=await scope(options,'saved-action',{action_id:options.actionId,action:identity(expectedRaw)}),old=await prior(s);active(options.signal);if(old)return old;
 need(expected.workspace_id===s.selected.course.workspace_id&&expected.programme===s.selected.course.programme,'The selected native action belongs to another course.');
 const actual=await openSavedAction(options.page,options.actionId,s.selected.course.workspace_id);
 need(same(actual,expected),'The browser native action differs from the retained complete action record.');
 await originalArtifact(s.folder,'complete-native-action.json',encode(actual));
 const screenshots=await capture(options.page,s.folder,'saved-native-action');
 await requestDownload(options.page,s.folder,'native-working.json',()=>options.page.locator('#column-receiving-history').getByRole('button',{name:'Download complete saved worksheet review',exact:true}).click(),raw=>{
  need(same(reopen(decode(raw)),working),'The native review download differs from the exact original saved action.');
 },options);
 await requestDownload(options.page,s.folder,'complete-editor.html',()=>options.page.locator('#column-receiving-history').getByRole('button',{name:'Download editable copy of saved review',exact:true}).click(),raw=>{
  need(same(decodeEditor(raw),working),'The native editable download differs from the exact complete saved action.');
 },options);
 const reopened=await reopenDownloaded(options.reopenPage,s.folder,'complete-editor.html',working,options,'independent');
 screenshots.push(...reopened.screenshots);
 return complete(s,{schema:EVENT_COLLEAGUE_BROWSER,kind:'saved-action',state:'SAVED_NATIVE_ACTION_RECEIVED',
  action_id:options.actionId,files:['complete-native-action.json','native-working.json','complete-editor.html',reopened.file],screenshots,
  operator_review:'Inspect the retained normal/narrow pixels and independently reopened outgoing files before presenting the complete customer edition.'});
}
