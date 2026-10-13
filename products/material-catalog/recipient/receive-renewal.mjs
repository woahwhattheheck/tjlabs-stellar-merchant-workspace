// MIT. Optional following-edition suffix inside the original recipient browser course.
import assert from 'node:assert/strict';
import {readFile,open,mkdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {openText,canonical} from './core.mjs';
import {openRecipientWorking,openRecipientReview,compareRecipientReview,recipientView} from './review.mjs';
import {openRecipientRenewal,exportRecipientRenewal,recipientRenewalWorking} from './renewal.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const decode=bytes=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
async function durable(path,bytes){
 const h=await open(path,'r+');try{await h.sync();}finally{await h.close();}
 const p=await open(dirname(path),'r');try{await p.sync();}finally{await p.close();}
 return{path,bytes:bytes.length,sha256:sha(bytes)};
}
async function retained(selection){
 assert.ok(selection&&typeof selection.path==='string');const bytes=await readFile(selection.path);
 assert.equal(bytes.length,selection.bytes);assert.equal(sha(bytes),selection.sha256);return bytes;
}
export async function receiveRecipientRenewal({context,directory,record,save,openDocument,following}){
 assert.equal(record.reviewReturn?.status,'COMPLETE','Continue only the complete original recipient return.');
 const beforeSelection=record.reviewReturn.retained.authorWorking;
 const beforeBytes=await retained(beforeSelection),previous=openRecipientWorking(decode(beforeBytes));
 assert.ok(previous.review?.entries.length,'Keep the original authored receiving review.');
 assert.ok(following&&typeof following.path==='string'&&/^[a-f0-9]{64}$/.test(following.sha256));
 const followingPath=resolve(following.path),afterBytes=await readFile(followingPath);
 assert.equal(sha(afterBytes),following.sha256);const after=openText(decode(afterBytes),{name:followingPath.split(/[\\/]/).at(-1)});
 const input={previous:beforeSelection,following:{path:followingPath,bytes:afterBytes.length,sha256:sha(afterBytes)}};
 const state=record.reviewRenewal??{schema:'stellar-forge.material-recipient-renewal-course.v1',input,status:'RUNNING',attempts:[],
  scope:'Explicit local re-review of the original course-authored sample proposal; original supplier/customer records are never changed.'};
 assert.equal(canonical(state.input),canonical(input),'Keep the original exact before/following selection.');
 const attemptDirectory=join(directory,'renewal-attempt-'+randomUUID());await mkdir(attemptDirectory,{mode:0o700});
 const parent=await open(directory,'r');try{await parent.sync();}finally{await parent.close();}
 state.attempts.push({directory:attemptDirectory,at:new Date().toISOString(),previousStatus:state.status,...(state.error?{previousError:state.error}:{})});
 state.status='RUNNING';delete state.error;record.reviewRenewal=state;await save();
 const blank=record.reviewBlank,blankBytes=await retained(blank);
 let page,reopened;
 const download=async(p,label,name)=>{
  const [event]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:label,exact:true}).click()]);
  const path=join(attemptDirectory,name);await event.saveAs(path);const bytes=await readFile(path),identity=await durable(path,bytes);
  record.downloads.push({...identity,name});await save();return{...identity,body:bytes};
 };
 const shot=async(p,name,width)=>{
  await p.setViewportSize({width,height:1000});const path=join(attemptDirectory,name+'.png');await p.screenshot({path,fullPage:true});
  const bytes=await readFile(path);record.screenshots.push({name,width,...await durable(path,bytes)});await save();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Re-review horizontal overflow.');
 };
 try{
  page=await context.newPage();page.on('pageerror',e=>record.browserErrors.push(e.message));
  await openDocument(page,{path:blank.path,text:decode(blankBytes),bytes:blank.bytes,sha256:blank.sha256},'following-edition-reader');
  await page.getByLabel('Open original catalogue bundle',{exact:true}).setInputFiles(record.inputBinding.path);
  await page.getByRole('heading',{name:'Complete recipient workspace',exact:true}).waitFor();
  await page.getByRole('button',{name:'Review and return',exact:true}).click();
  const checkpoint=state.checkpoint?{...state.checkpoint,body:await retained(state.checkpoint)}:null;
  await page.getByLabel('Restore complete working review',{exact:true}).setInputFiles(checkpoint?.path??beforeSelection.path);
  await page.getByRole('button',{name:'Review and return',exact:true}).click();
  if(!checkpoint){
   await page.getByLabel('Open following catalogue for re-review',{exact:true}).setInputFiles(followingPath);
   await page.getByRole('heading',{name:'Following-edition re-review',exact:true}).waitFor();
   const first=await download(page,'Save complete working review','renewal-opened.json');
   const opened=openRecipientRenewal(decode(first.body));assert.equal(opened.value.previous.text,decode(beforeBytes));assert.equal(opened.value.following.text,decode(afterBytes));
   state.checkpoint={path:first.path,bytes:first.bytes,sha256:first.sha256};await save();
  }
  let model=openRecipientRenewal(decode(await retained(state.checkpoint)));
  if(!model.value.completions.length){
   for(const row of model.comparison.rows){
    // Existing receiving review is explicitly course-authored. These are local proposals, never native adoption.
    const id=row.proposal.customerId,expected=row.eligible?'carry':row.currentMaterial?'revise':'omit';
    if(model.value.choices[row.id])continue;
    // Search provides one exact context even when the full original return has multiple pages.
    await page.getByLabel('Search re-review contexts',{exact:true}).fill(row.proposal.description);
    await page.getByRole('button',{name:'Search re-review',exact:true}).click();
    const card=page.locator('[data-renewal-context="'+row.id+'"]');
    await card.getByLabel('Re-review choice for '+id,{exact:true}).selectOption(expected);
    if(expected==='revise'){
     await card.getByLabel('Find current material for '+id,{exact:true}).fill(row.currentMaterial.materialId);
     await card.getByRole('button',{name:'Find current materials for '+id,exact:true}).click();
     await card.getByLabel('Current material for '+id,{exact:true}).selectOption(row.currentMaterial.key);
     await card.getByLabel('New proposed decision for '+id,{exact:true}).selectOption('REJECTED');
     await card.getByLabel('New proposal reason for '+id,{exact:true}).fill('Authored receiving exercise: changed current material requires explicit customer review.');
    }
    await card.getByLabel('Reason for re-review choice for '+id,{exact:true}).fill('Authored original receiving exercise: '+expected+' after viewing the retained full before/current records.');
    await card.getByRole('button',{name:'Save re-review choice for '+id,exact:true}).click();
   }
   const choices=await download(page,'Save complete working review','renewal-reviewed-choices.json');
   model=openRecipientRenewal(decode(choices.body));state.checkpoint={path:choices.path,bytes:choices.bytes,sha256:choices.sha256};await save();
   await page.getByRole('button',{name:'Complete new review return',exact:true}).click();
   const completed=await download(page,'Save complete working review','renewal-completed.json');
   model=openRecipientRenewal(decode(completed.body));state.checkpoint={path:completed.path,bytes:completed.bytes,sha256:completed.sha256};await save();
  }
  const result=model.value.completions.at(-1);assert.ok(result);
  const returned=await download(page,'Download new return '+result.id,'renewal-return.json');
  assert.equal(openRecipientReview(decode(returned.body)).sha256,result.review.sha256);
  const working=await download(page,'Download new working review '+result.id,'renewal-new-working.json');
  assert.equal(decode(working.body),recipientRenewalWorking(model));const newWorking=openRecipientWorking(decode(working.body));
  assert.equal(newWorking.bundle.text,decode(afterBytes));
  const observed=compareRecipientReview(recipientView(after),newWorking.review);assert.ok(observed.rows.every(row=>row.eligible));
  const report=await download(page,'Download complete re-review report','renewal-report.json');
  assert.equal(JSON.parse(decode(report.body)).originalReview.sha256,previous.review.sha256);
  const whole=await download(page,'Save complete working HTML','renewal-complete.html');
  await shot(page,'renewal-desktop',1440);await shot(page,'renewal-narrow',390);
  reopened=await context.newPage();reopened.on('pageerror',e=>record.browserErrors.push(e.message));
  await openDocument(reopened,{path:whole.path,text:decode(whole.body),bytes:whole.bytes,sha256:whole.sha256},'following-edition-cold-reader');
  await reopened.getByRole('heading',{name:'Complete recipient workspace',exact:true}).waitFor();
  await reopened.getByRole('button',{name:'Review and return',exact:true}).click();
  const cold=await download(reopened,'Save complete working review','renewal-cold-working.json');
  assert.equal(decode(cold.body),exportRecipientRenewal(model),'Cold HTML must preserve every original source, choice and completion.');
  await shot(reopened,'renewal-cold-narrow',390);
  assert.ok((await readFile(followingPath)).equals(afterBytes));assert.ok((await readFile(beforeSelection.path)).equals(beforeBytes));
  state.result={reviewId:result.id,reviewSha256:result.review.sha256,working:{path:working.path,bytes:working.bytes,sha256:working.sha256},report:{path:report.path,bytes:report.bytes,sha256:report.sha256},comparison:observed};
  state.status='COMPLETE';state.completedAt=new Date().toISOString();await save();return state;
 }catch(error){
  // Preserve the actual current local result before closing this owned Page.
  // A completed download is authoritative; never invent the identity of an output lost with its process.
  if(page&&!page.isClosed()){
   try{
    const interrupted=await download(page,'Save complete working review','renewal-interrupted-working.json');
    const retainedModel=openRecipientRenewal(decode(interrupted.body));
    assert.equal(retainedModel.value.previous.text,decode(beforeBytes));assert.equal(retainedModel.value.following.text,decode(afterBytes));
    state.checkpoint={path:interrupted.path,bytes:interrupted.bytes,sha256:interrupted.sha256};
    state.attempts.at(-1).interruptedOutput={...state.checkpoint,completeReturns:retainedModel.value.completions.length};
   }catch(captureError){state.attempts.at(-1).captureError={code:captureError.code??captureError.name,message:captureError.message};}
  }
  state.status='ERROR';state.error={code:error.code??error.name,message:error.message};await save();throw error;
 }
 finally{if(reopened)await reopened.close().catch(()=>{});if(page)await page.close().catch(()=>{});}
}
