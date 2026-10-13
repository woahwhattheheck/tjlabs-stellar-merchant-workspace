// MIT. Optional suffix of the original complete-bundle browser receiving course.
import assert from 'node:assert/strict';
import {readFile,open,link,unlink,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Writable} from 'node:stream';
import {openText,canonical} from './core.mjs';
import {openRecipientReview,openRecipientWorking,compareRecipientReview,recipientView} from './review.mjs';
import {main as catalogCli} from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/cli.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
async function original(path,body){
 const expected=Buffer.from(body);
 try{assert.ok((await readFile(path)).equals(expected),'Retained course file differs: '+path);return path;}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const pending=path+'.'+randomUUID()+'.part',handle=await open(pending,'wx',0o600);
 try{
  await handle.writeFile(expected);await handle.sync();await handle.close();
  try{await link(pending,path);}catch(error){if(error.code!=='EEXIST')throw error;assert.ok((await readFile(path)).equals(expected));}
  const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}
 }finally{await handle.close().catch(()=>{});await unlink(pending).catch(()=>{});}
 return path;
}
export async function receiveReviewReturn({page,context,directory,input,bundle,record,save,openDocument}){
 const state=record.reviewReturn??{schema:'stellar-forge.material-recipient-review-course.v1',status:'RUNNING',
  scope:'Authored offline customer-match exercise on declared receiving copies of the selected actual bundle.',
  input:{name:bundle.name,...bundle.identity},steps:[]};
 assert.equal(state.input.sha256,bundle.identity.sha256);assert.equal(state.input.bytes,bundle.identity.bytes);
 const attemptDirectory=join(directory,'review-attempt-'+randomUUID());await mkdir(attemptDirectory,{mode:0o700});
 const parent=await open(directory,'r');try{await parent.sync();}finally{await parent.close();}
 state.attempts??=[];state.attempts.push({directory:attemptDirectory,at:new Date().toISOString(),previousStatus:state.status,...(state.error?{previousError:state.error}:{})});delete state.error;state.status='RUNNING';
 record.reviewReturn=state;await save();
 const step=async name=>{state.steps.push({name,at:new Date().toISOString()});await save();};
 const download=async(p,label,name)=>{
  const [event]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:label,exact:true}).click()]);
  const path=join(attemptDirectory,name);await event.saveAs(path);
  const file=await open(path,'r+');try{await file.sync();}finally{await file.close();}
  const parent=await open(attemptDirectory,'r');try{await parent.sync();}finally{await parent.close();}
  const bytes=await readFile(path);
  record.downloads.push({name,path,bytes:bytes.length,sha256:sha(bytes)});await save();return{path,bytes,sha256:sha(bytes)};
 };
 const screenshot=async(p,name,width)=>{
  await p.setViewportSize({width,height:1000});const path=join(attemptDirectory,name+'.png');
  await p.screenshot({path,fullPage:true});record.screenshots.push({name,width,path});await save();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Horizontal overflow: '+name);
 };
 const material=[...(bundle.materials.get(bundle.catalog.activeEditionId)??new Map()).values()][0];
 assert.ok(material,'The actual original bundle must have a selected material edition.');
 const customerId='RECIPIENT-RECEIVING-'+sha(bundle.identity.sha256).slice(0,16);
 assert.ok(![...bundle.decisions.values()].some(d=>d.customerId===customerId),'This original bundle already contains the declared receiving context; recover its existing course instead.');
 const description='Authored recipient receiving exercise for '+material.materialId;
 let cold,onward,returned,review,comparison,requestFile,request;
 const retained=async value=>{assert.ok(value&&typeof value.path==='string');const bytes=await readFile(value.path);assert.equal(bytes.length,value.bytes);assert.equal(sha(bytes),value.sha256);return{path:value.path,bytes,sha256:value.sha256};};
 const identity=value=>({path:value.path,bytes:value.bytes.length,sha256:value.sha256});
 try{
  if(state.request){
   returned=await retained(state.retained.returned);requestFile=await retained(state.retained.request);
   await retained(state.retained.authorWorking);await retained(state.retained.workingHtml);
   review=openRecipientReview(returned.bytes.toString('utf8'));request=JSON.parse(requestFile.bytes);
   comparison=compareRecipientReview(recipientView(bundle),review);
   assert.equal(request.requestId,state.request.id);assert.equal(request.reviewText,returned.bytes.toString('utf8'));assert.equal(request.expectedComparisonSha256,comparison.sha256);
   await step('recovered-original-durable-request-before-journal-replay');
  }else{
  await page.getByRole('button',{name:'Review and return',exact:true}).click();
  await page.getByLabel('Named reviewer',{exact:true}).fill('Original material recipient receiving operator');
  await page.getByRole('button',{name:'Start named review',exact:true}).click();
  await page.getByLabel('Customer identifier',{exact:true}).fill(customerId);
  await page.getByLabel('Original customer description',{exact:true}).fill(description);
  await page.getByLabel('Material ID or text',{exact:true}).fill(material.materialId);
  await page.getByRole('button',{name:'Find materials',exact:true}).click();
  await page.getByLabel('Proposed material',{exact:true}).selectOption(material.key);
  await page.getByLabel('Proposed decision',{exact:true}).selectOption('APPROVED');
  await page.getByLabel('Review reason',{exact:true}).fill('Authored receiving exercise: inspected the complete original material, identity and units.');
  await page.getByRole('button',{name:'Save proposed decision',exact:true}).click();
  await page.getByLabel('Review reason',{exact:true}).fill('Authored receiving exercise: second complete review revision retains the first rationale and confirms the original material.');
  await page.getByRole('button',{name:'Save proposed decision',exact:true}).click();
  returned=await download(page,'Download complete review return','review-return-original.json');
  review=openRecipientReview(returned.bytes.toString('utf8'));
  assert.equal(review.entries.length,1);assert.equal(review.history.length,2);assert.equal(review.entries[0].revision,2);
  assert.equal(review.entries[0].material.sha256,material.sha256);state.review={id:review.id,sha256:review.sha256};
  await page.getByLabel('Review reason',{exact:true}).fill('Unsubmitted next note — keep this complete draft on cold reopen.');
  const working=await download(page,'Save complete working review','review-working-original.json');
  const reopened=openRecipientWorking(working.bytes.toString('utf8'));
  assert.equal(reopened.bundle.text,bundle.text);assert.equal(reopened.review.sha256,review.sha256);
  assert.equal(reopened.draft.note,'Unsubmitted next note — keep this complete draft on cold reopen.');
  const html=await download(page,'Save complete working HTML','review-working-original.html');
  await screenshot(page,'review-01-proposals-desktop',1440);await screenshot(page,'review-02-proposals-narrow',390);
  await step('named-review-two-revisions-complete-working-json-and-html');
  cold=await context.newPage();cold.on('pageerror',error=>record.browserErrors.push(error.message));
  await openDocument(cold,{path:html.path,text:html.bytes.toString('utf8'),bytes:html.bytes.length,sha256:sha(html.bytes)},'review-working-cold-reader');
  await cold.getByRole('heading',{name:'Complete recipient workspace',exact:true}).waitFor();
  await cold.getByRole('button',{name:'Review and return',exact:true}).click();
  assert.equal(await cold.getByLabel('Review reason',{exact:true}).inputValue(),reopened.draft.note);
  const coldWorking=await download(cold,'Save complete working review','review-working-cold.json');
  assert.equal(coldWorking.bytes.toString('utf8'),working.bytes.toString('utf8'));
  await cold.getByLabel('Open named recipient return',{exact:true}).setInputFiles(returned.path);
  await cold.locator('[data-recipient-context]').waitFor();
  comparison=compareRecipientReview(recipientView(bundle),review);
  assert.equal(comparison.rows.length,1);assert.equal(comparison.rows[0].eligible,true);
  await cold.getByLabel('Choice for '+customerId+' / '+description,{exact:true}).selectOption('adopt');
  await cold.getByLabel('Receiving operator',{exact:true}).fill('Original material receiving course');
  await cold.getByLabel('Reason for these receiving choices',{exact:true}).fill('Adopt the explicitly reviewed sample customer match in this declared receiving copy; keep every original source and history.');
  requestFile=await download(cold,'Download reviewed receiving request','review-receiving-request.json');
  request=JSON.parse(requestFile.bytes);assert.equal(request.expectedComparisonSha256,comparison.sha256);
  assert.equal(request.reviewText,returned.bytes.toString('utf8'));assert.deepEqual(request.choices,[{id:comparison.rows[0].id,choice:'adopt'}]);
  const repeated=await download(cold,'Download reviewed receiving request','review-receiving-request-repeat.json');
  assert.ok(repeated.bytes.equals(requestFile.bytes),'Unchanged selections must reuse the exact original request.');
  const authorWorking=await download(cold,'Save complete working review','review-author-working.json');
  const authorState=openRecipientWorking(authorWorking.bytes.toString('utf8'));
  assert.equal(authorState.author.receiving.requestId,request.requestId);assert.deepEqual(authorState.author.choices,{[comparison.rows[0].id]:'adopt'});
  await screenshot(cold,'review-03-author-comparison-desktop',1440);await screenshot(cold,'review-04-author-comparison-narrow',390);
  state.retained={returned:identity(returned),request:identity(requestFile),authorWorking:identity(authorWorking),workingHtml:identity(html)};
  state.request={id:request.requestId,bytes:requestFile.bytes.length,sha256:sha(requestFile.bytes)};
  await step('cold-working-reopen-explicit-current-return-comparison-and-original-request');
  }
  const sourceFile=join(directory,'review-source.json');
  await original(sourceFile,JSON.stringify({schema:'stellar-forge.opensearch-source.v1',endpointEnv:'RECIPIENT_COURSE_ENDPOINT',
   auth:{type:'none'},allowLocal:true,maxInFlight:1,queries:{catalog_bootstrap:{indices:['recipient_catalog'],query:{match_all:{}},
    parameters:{},fields:['material_id'],sort:[],pageSize:100,maxHits:1000,maxBytes:917504,timeoutMs:15000,probe:{}}}},null,2)+'\n');
  const cli=async(workspace,args)=>{
   const stdout=[],stderr=[],stream=chunks=>new Writable({write(chunk,encoding,next){chunks.push(Buffer.from(chunk));next();}});
   const result=await catalogCli([...args,'--source',sourceFile,'--workspace',join(directory,workspace)],
    {env:{...process.env,RECIPIENT_COURSE_ENDPOINT:'http://127.0.0.1:9200'},stdout:stream(stdout),stderr:stream(stderr)});
   return{result,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')};
  };
  const importRequest=await original(join(directory,'review-author-import.json'),JSON.stringify({requestId:'recipient-author-'+sha(bundle.identity.sha256).slice(0,32)})+'\n');
  const imported=await cli('review-author',['catalog-import','--file',input,'--request',importRequest]);
  assert.equal(imported.result.state,'COMPLETE');
  let prior;
  try{prior=(await cli('review-author',['catalog-operation','--request-id',request.requestId])).result;}
  catch(error){if(error.code!=='WORKSPACE_OPERATION_NOT_FOUND')throw error;}
  if(!prior){const preview=await cli('review-author',['catalog-review-return','--return',returned.path]);
   assert.equal(canonical(preview.result),canonical(comparison),'Native preview must match the full browser comparison.');}
  else assert.equal(prior.state,'COMPLETE','Reconcile the retained original operation before continuing.');
  // The downloaded request is already durable before the original transaction.
  const applied=await cli('review-author',['catalog-receive-review','--request',requestFile.path]);
  assert.equal(applied.result.state,'COMPLETE');
  const replay=await cli('review-author',['catalog-receive-review','--request',requestFile.path]);
  assert.equal(canonical(replay.result),canonical(applied.result),'Original Journal replay differs.');
  await original(join(directory,'review-receiving-native.json'),JSON.stringify(applied,null,2)+'\n');
  state.received=applied.result;await step('original-cli-import-preview-atomic-adoption-and-exact-journal-replay');
  const output=join(directory,'review-adopted-complete.jsonl');
  const freshOutput=join(attemptDirectory,'author-current-complete.jsonl');
  await cli('review-author',['catalog-export','--catalog',bundle.catalog.id,'--format','catalog-bundle.jsonl','--output',freshOutput]);
  const freshBytes=await readFile(freshOutput),freshAuthor=openText(freshBytes.toString('utf8'),{name:'author-current-complete.jsonl'});
  let outgoingBytes;try{outgoingBytes=await readFile(output);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!outgoingBytes){await original(output,freshBytes);outgoingBytes=freshBytes;}
  const outgoing=openText(outgoingBytes.toString('utf8'),{name:'review-adopted-complete.jsonl'});
  assert.equal(canonical(freshAuthor.tables),canonical(outgoing.tables),'Actual current author rows differ from the retained intended outcome.');
  assert.equal(canonical([...freshAuthor.sources].map(([id,s])=>[id,sha(s.bytes),s.manifest])),canonical([...outgoing.sources].map(([id,s])=>[id,sha(s.bytes),s.manifest])),'Actual current author sources differ.');
  state.actualAuthorSnapshot={path:freshOutput,bytes:freshBytes.length,sha256:sha(freshBytes)};
  const decision=[...outgoing.decisions.values()].find(d=>d.customerId===customerId);
  assert.ok(decision);assert.equal(decision.status,'APPROVED');assert.equal(decision.revision,1);
  assert.equal(decision.recipientReview.reviewText,returned.bytes.toString('utf8'));
  assert.equal(decision.recipientReview.comparison.sha256,comparison.sha256);
  assert.equal(decision.recipientReview.requestId,request.requestId);
  for(const [id,source] of bundle.sources){
   const after=outgoing.sources.get(id);assert.ok(after);assert.equal(sha(after.bytes),sha(source.bytes));assert.equal(canonical(after.manifest),canonical(source.manifest));
  }
  for(const [table,rows] of Object.entries(bundle.tables)){
   const next=outgoing.tables[table].map(row=>canonical(row));
   for(const row of rows)assert.ok(next.includes(canonical(row)),'Missing original complete row: '+table);
  }
  const onwardRequest=await original(join(directory,'review-onward-import.json'),JSON.stringify({requestId:'recipient-onward-'+request.requestId})+'\n');
  const received=await cli('review-onward',['catalog-import','--file',output,'--request',onwardRequest]);
  assert.equal(received.result.state,'COMPLETE');
  const coldExport=join(directory,'review-onward-cold.jsonl');
  const freshColdPath=join(attemptDirectory,'onward-current-complete.jsonl');
  await cli('review-onward',['catalog-export','--catalog',bundle.catalog.id,'--format','catalog-bundle.jsonl','--output',freshColdPath]);
  const coldText=await readFile(freshColdPath,'utf8'),coldBundle=openText(coldText,{name:'onward-current-complete.jsonl'});
  assert.equal(canonical(coldBundle.tables),canonical(outgoing.tables),'Actual current independent recipient rows differ.');
  assert.equal(canonical([...coldBundle.sources].map(([id,s])=>[id,sha(s.bytes),s.manifest])),canonical([...outgoing.sources].map(([id,s])=>[id,sha(s.bytes),s.manifest])),'Actual current independent recipient sources differ.');
  let retainedCold;try{retainedCold=openText(await readFile(coldExport,'utf8'),{name:'review-onward-cold.jsonl'});}catch(error){if(error.code!=='ENOENT')throw error;}
  if(retainedCold)assert.equal(canonical(retainedCold.tables),canonical(coldBundle.tables),'Prior recipient result changed.');else await original(coldExport,coldText);
  state.actualRecipientSnapshot={path:freshColdPath,bytes:Buffer.byteLength(coldText),sha256:sha(coldText)};
  state.onward={path:output,bytes:outgoingBytes.length,sha256:sha(outgoingBytes)};
  await step('complete-onward-bundle-source-history-retention-and-independent-native-cold-reopen');
  onward=await context.newPage();onward.on('pageerror',error=>record.browserErrors.push(error.message));
  const blank=record.reviewBlank,blankBytes=await readFile(blank.path);assert.equal(sha(blankBytes),blank.sha256);assert.equal(blankBytes.length,blank.bytes);
  await openDocument(onward,{path:blank.path,text:blankBytes.toString('utf8'),bytes:blank.bytes,sha256:blank.sha256},'review-onward-reader');
  await onward.getByLabel('Open original catalogue bundle',{exact:true}).setInputFiles(output);
  await onward.getByRole('heading',{name:'Complete recipient workspace',exact:true}).waitFor();
  await onward.getByRole('button',{name:'Customer decisions',exact:true}).click();
  await onward.getByRole('button',{name:customerId,exact:true}).click();
  await screenshot(onward,'review-05-onward-full-decision-desktop',1440);await screenshot(onward,'review-06-onward-full-decision-narrow',390);
  await onward.getByRole('button',{name:'Close detail',exact:true}).click();
  await onward.getByRole('button',{name:'Overview',exact:true}).click();
  const whole=await download(onward,'Download unchanged original bundle','review-onward-browser.jsonl');
  assert.ok(whole.bytes.equals(outgoingBytes));
  state.status='COMPLETE';state.completedAt=new Date().toISOString();
  await step('onward-reader-actual-decision-and-complete-original-download');
  return state;
 }catch(error){state.status='ERROR';state.error={code:error.code??error.name,message:error.message};await save();throw error;}
 finally{if(onward)await onward.close().catch(()=>{});if(cold)await cold.close().catch(()=>{});}
}
