// MIT. Continue native planning delivery on the existing grant receiving Page.
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ENVELOPE,validateDraft} from './dist/grant-submission-core.mjs';
import {planSummary} from './dist/grant-plan-core.mjs';

const OPERATION='SCF-PLAN-SUBMISSION-INTEGRATION-7F5A-20261012';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(value,message)=>{if(!value)throw Error(message);};
async function ordinary(path,maximum=34*1024*1024){
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const stat=await file.stat();need(stat.isFile()&&stat.size<=maximum,'Select a complete ordinary file: '+path);
    const bytes=await file.readFile();need(bytes.length===stat.size,'The selected file changed: '+path);return bytes;
  }finally{await file.close();}
}
async function retain(path,bytes){
  try{await writeFile(path,bytes,{flag:'wx',mode:0o600});}
  catch(error){if(error.code!=='EEXIST')throw error;need((await ordinary(path)).equals(bytes),'Retain the existing different delivery: '+path);}
  return {path,bytes:bytes.length,sha256:sha(bytes)};
}
function envelope(bytes){
  const value=JSON.parse(bytes.toString('utf8'));
  need(value.schema===ENVELOPE&&value.sha256===sha(JSON.stringify(value.draft)),'Keep the complete original browser export.');
  validateDraft(value.draft);return value;
}
async function download(page,path){
  const event=page.waitForEvent('download',{timeout:30000});
  await page.getByRole('button',{name:'Download full draft',exact:true}).click();
  const result=await event,stream=await result.createReadStream();
  need(stream,'The original browser export is unavailable.');
  const chunks=[];let size=0;
  for await(const chunk of stream){size+=chunk.length;need(size<=34*1024*1024,'Keep a complete export within the editor allowance.');chunks.push(chunk);}
  need(!await result.failure(),'The original browser export failed.');
  const bytes=Buffer.concat(chunks),document=envelope(bytes),file=await retain(path,bytes);
  await result.delete();return {document,file};
}

/**
 * Use the Page already held by SCF-GRANT-REVIEWER-PUBLICATION-8910-20261012.
 * The caller supplies its existing loopback origin, selected actual planning
 * file/SHA and a private output directory. The callback uses the served editor,
 * creates a separate working draft, and returns the complete useful draft files.
 */
export async function receiveGrantPlanning(page,{
  expectedOrigin,planningFile,planningSha256,outputDirectory,sourceCommit,
  operationId=OPERATION,title='SCF native plan submission',
}={}){
  need(page&&typeof page.goto==='function','Pass the existing grant receiving Playwright Page.');
  need(/^[a-f0-9]{40}$/.test(sourceCommit),'Retain the selected complete source commit.');
  need(/^[a-f0-9]{64}$/.test(planningSha256),'Retain the actual original planning file SHA-256.');
  need(typeof operationId==='string'&&operationId.trim(),'Retain the receiving operation identity.');
  const origin=new URL(expectedOrigin),initialUrl=page.url();
  need(origin.origin===expectedOrigin&&origin.protocol==='http:'&&['127.0.0.1','localhost'].includes(origin.hostname)&&origin.port,
    'Use the original installed loopback listener.');
  need(new URL(initialUrl).origin===expectedOrigin&&new URL(initialUrl).pathname==='/grant.html',
    'Continue from the original grant reader on this Page.');
  const selected=resolve(planningFile),original=await ordinary(selected);
  need(sha(original)===planningSha256,'The original planning file differs from the selected saved edition.');
  const output=resolve(outputDirectory);await mkdir(output,{recursive:true,mode:0o700});
  const routes=['grant-submission.html','grant-submission.css','grant-submission-core.mjs','grant-submission-workspace.mjs',
    'grant-plan-core.mjs','grant-plan-source.mjs','grant-plan-workspace.mjs'];
  for(const route of routes){
    const local=await ordinary(fileURLToPath(new URL('./dist/'+route,import.meta.url)));
    const response=await page.request.get(expectedOrigin+'/'+route,{timeout:30000});
    try{need(response.status()===200&&(await response.body()).equals(local),'Install the complete selected editor source at /'+route);}
    finally{await response.dispose();}
  }
  const initialScroll=await page.evaluate(()=>({x:scrollX,y:scrollY}));
  const errors=[],artifacts=[];const onError=error=>errors.push(String(error.message||error));
  const ready=async part=>page.waitForFunction(part=>{
    const error=document.getElementById('error');
    if(error&&!error.hidden)throw Error(error.textContent);
    return document.getElementById('status')?.textContent.includes(part);
  },part,{timeout:15000});
  const choose=async(button,path)=>{
    const event=page.waitForEvent('filechooser',{timeout:15000});
    await page.getByRole('button',{name:button,exact:true}).click();
    await(await event).setFiles(path);
  };
  let completed=null,failure=null,viewRestored=false;
  page.on('pageerror',onError);
  try{
    await page.goto(expectedOrigin+'/grant-submission.html',{waitUntil:'load',timeout:30000});
    await ready('Opened all nine original answers');
    await page.locator('#draft-title').fill(title);
    await page.locator('#view').selectOption('planning');
    await choose('Receive native plan or planning ZIP',selected);
    await ready('native plan revisions');
    const revisions=page.getByLabel('Native saved revision',{exact:true});
    const options=await revisions.locator('option').evaluateAll(items=>items.map(item=>item.value));
    need(options.length>0,'The original saved plan revisions did not open.');
    await revisions.selectOption(options[0]);await revisions.selectOption(options.at(-1));
    await page.getByRole('button',{name:'Prepare preview from selected native plan',exact:true}).click();
    const preview=await page.getByLabel('Exact budget and roadmap text to apply',{exact:true}).inputValue();
    need(preview.trim(),'The selected native plan produced an empty preview.');
    await page.getByRole('checkbox',{name:'I have reviewed this exact preview for the selected planning edition.',exact:true}).check();
    await page.getByRole('button',{name:'Apply reviewed plan to draft',exact:true}).click();
    await ready('Applied the reviewed native budget and roadmap');
    need(await page.getByLabel('Draft answer',{exact:true}).inputValue()===preview,'The applied Delivery differs from the selected native preview.');
    await page.getByRole('button',{name:'Save version',exact:true}).click();await ready('Saved browser revision');

    // Preserve the useful complete delivery before continuing the reopening path.
    const full=await download(page,join(output,'SCF_Native_Plan_Submission.json'));artifacts.push(full.file);
    const delivery=await retain(join(output,'SCF_Native_Plan_Delivery.md'),Buffer.from(preview+'\n'));artifacts.push(delivery);
    const draft=full.document.draft,source=draft.planSources.find(item=>item.sha256===planningSha256);
    need(source&&Buffer.from(source.base64,'base64').equals(original),'The browser export omitted the exact original plan file.');
    need(source.document.revisions.length===options.length,'The browser export omitted a native saved revision.');
    const summary=planSummary(source,draft.planningReview.revision);
    need(draft.answers.find(item=>item.id==='delivery').text===preview,'The complete draft omitted the applied Delivery answer.');

    await choose('Open draft file',full.file.path);await ready('Opened the complete draft');
    await page.locator('#view').selectOption('planning');
    need(await page.getByLabel('Exact budget and roadmap text to apply',{exact:true}).inputValue()===preview,'Reopening changed the native planning preview.');
    await page.locator('#view').selectOption('history');
    const before=page.locator('article.card').filter({has:page.getByRole('heading',{name:'Before receiving native planning edition',exact:true})}).last();
    await before.getByRole('button',{name:'Restore this version',exact:true}).click();await ready('Restored the selected version');
    const restored=await download(page,join(output,'Restored_Previous_Submission.json'));artifacts.push(restored.file);
    need(restored.document.draft.planningReview===null&&restored.document.draft.planSources.some(item=>item.sha256===planningSha256),
      'The preceding editorial version did not restore its planning selection and retain its source.');
    const baseline=draft.versions.find(item=>item.label==='Before receiving native planning edition');
    need(baseline&&restored.document.draft.answers.find(item=>item.id==='delivery').text===baseline.answers.find(item=>item.id==='delivery').text,
      'The original manuscript answer did not restore.');

    await choose('Open draft file',full.file.path);await ready('Opened the complete draft');
    await page.getByRole('button',{name:'Save as separate draft',exact:true}).click();await ready('Saved browser revision');
    await page.locator('#view').selectOption('saved');
    await page.getByRole('heading',{name:'Browser drafts',exact:true}).waitFor();
    const record=page.locator('article.card').filter({has:page.getByRole('heading',{name:'SCF submission — '+title+' copy',exact:true})}).first();
    await record.getByRole('button',{name:'Open this draft',exact:true}).click();await ready('Opened browser revision');
    const reopened=await download(page,join(output,'Reopened_Browser_Submission.json'));artifacts.push(reopened.file);
    need(reopened.document.draft.planningReview.previewText===preview&&reopened.document.draft.planSources.some(item=>item.sha256===planningSha256),
      'The original IndexedDB store changed the retained planning selection.');
    need(errors.length===0,'The editor returned a browser error: '+errors.join('; '));
    completed={operationId,sourceCommit,planningFile:selected,planningSha256,status:'COMPLETE',nativePlan:source.document.id,
      nativeRevisions:source.document.revisions.length,award:summary.award,hours:summary.hours,packages:summary.costs.length,
      tranches:summary.tranches.map(item=>({tranche:item.milestone.tranche,amount:item.amount,day:item.milestone.submit_day})),
      draftId:draft.id,deliveryCharacters:preview.length,artifacts,completeExportReopened:true,originalVersionRestored:true,indexedDBReopened:true};
  }catch(error){
    let editor=null;
    try{editor=await page.evaluate(()=>({status:document.getElementById('status')?.textContent,error:document.getElementById('error')?.textContent,view:document.getElementById('view')?.value}));}catch{}
    failure={operationId,sourceCommit,planningFile:selected,planningSha256,status:'INTERRUPTED',error:String(error.message||error),editor,artifacts,pageErrors:errors};
  }finally{
    try{await page.goto(initialUrl,{waitUntil:'load',timeout:30000});await page.evaluate(scroll=>scrollTo(scroll.x,scroll.y),initialScroll);viewRestored=page.url()===initialUrl;}
    catch(error){failure??={operationId,sourceCommit,status:'INTERRUPTED',artifacts};failure.restoreError=String(error.message||error);}
    page.off('pageerror',onError);
  }
  const result={...(failure||completed),status:failure||!viewRestored?'INTERRUPTED':'COMPLETE',originalViewRestored:viewRestored,finishedAt:new Date().toISOString()};
  await retain(join(output,'Planning_Delivery_Result.json'),Buffer.from(JSON.stringify(result,null,2)+'\n'));
  if(failure||!viewRestored){const error=Error('Native planning continuation retained its completed files: '+(failure?.error||failure?.restoreError||'reader restore failed'));error.result=result;throw error;}
  return result;
}
