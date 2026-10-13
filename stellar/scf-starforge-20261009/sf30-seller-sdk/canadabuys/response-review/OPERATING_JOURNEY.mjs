/**
 * Continue the existing CanadaBuys customer through hosted preparation, complete
 * standalone supplier review, attributed return and native receiving.
 * The caller owns the original server/browser/customer and supplies real source.
 */
import { readFile, writeFile, rename, mkdir, open, link, unlink } from 'node:fs/promises';
import { resolve, join, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const need=(condition,message)=>{if(!condition)throw new Error(message);};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function atomic(path,value) {
  const temporary=path+'.'+randomUUID()+'.tmp',handle=await open(temporary,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}
  await rename(temporary,path);
  const parent=await open(dirname(path),'r');try{await parent.sync();}finally{await parent.close();}
}
async function retainDownload(download,path) {
  await download.saveAs(path);const bytes=await readFile(path);
  return {path,bytes:bytes.length,sha256:digest(bytes)};
}
async function retainNativeRequest(directory, body) {
  const bytes=Buffer.from(JSON.stringify(body,null,2)+'\n'),sha256=digest(bytes);
  const path=join(directory,'native-request-'+sha256+'.json'),temporary=path+'.'+randomUUID()+'.pending';
  let file;
  try{
    file=await open(temporary,'wx',0o600);await file.writeFile(bytes);await file.sync();
    await file.close();file=null;
    try{await link(temporary,path);}catch(error){
      if(error.code!=='EEXIST')throw error;
      need((await readFile(path)).equals(bytes),'The retained original native request changed.');
    }
    const parent=await open(directory,'r');try{await parent.sync();}finally{await parent.close();}
    need((await readFile(path)).equals(bytes),'The complete original native request was not retained.');
  }finally{
    if(file)await file.close();
    await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
  }
  return {path,bytes:bytes.length,sha256};
}
async function readRetained(selection){
  need(selection&&typeof selection.path==='string'&&Number.isSafeInteger(selection.bytes)&&typeof selection.sha256==='string','The saved outgoing file selection is incomplete.');
  const bytes=await readFile(selection.path);need(bytes.length===selection.bytes&&digest(bytes)===selection.sha256,'The complete saved outgoing file changed: '+selection.path);return bytes;
}
async function layout(page,name,directory,result) {
  await page.screenshot({path:join(directory,name+'.png'),fullPage:true});
  const dimensions=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));
  need(dimensions.document<=dimensions.width+2,name+' overflows the visible viewport.');
  result.views.push({name,path:join(directory,name+'.png'),...dimensions});
}
async function waitNative(page,method,path,action) {
  const waiting=page.waitForResponse(response=>new URL(response.url()).pathname===path&&response.request().method()===method);
  await action();const response=await waiting;
  let result;try{result=await response.json();}finally{if(typeof response.dispose==='function')await response.dispose();}
  need(response.ok(),'Native '+path+' failed: '+JSON.stringify(result));return result;
}

/**
 * Required input:
 * { page, baseURL, outputDirectory, workspaceId, workshareId, masterPath,
 *   title, reviewer:{name,organization,role}, review:{answerId,text,comment},
 *   attachmentPaths:[absolute original document paths] }
 * Reuse outputDirectory across continuation. No workspace, server or fixture is
 * created here. Actual external supplier claims must be supplied by their author;
 * an internal operating case must name its internal reviewer.
 */
export async function runResponseReviewJourney(input) {
  const {page,baseURL,workspaceId,workshareId,masterPath,title,reviewer,review,attachmentPaths=[]}=input;
  need(page&&typeof baseURL==='string'&&workspaceId&&workshareId&&masterPath&&title,'Supply the original live page, workspace, saved workshare and complete original master.');
  need(reviewer?.name&&review?.answerId&&typeof review.text==='string'&&typeof review.comment==='string','Supply the actual attributed reviewer and complete selected answer edit.');
  const directory=resolve(input.outputDirectory);await mkdir(directory,{recursive:true,mode:0o700});
  const resultPath=join(directory,'response-review-result.json');
  let result;
  try{result=JSON.parse(await readFile(resultPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const masterBytes=await readFile(masterPath),master=JSON.parse(masterBytes),masterSha256=digest(masterBytes);
  const attachmentSelection=[];for(const path of attachmentPaths){const bytes=await readFile(resolve(path));attachmentSelection.push({name:basename(path),bytes:bytes.length,sha256:digest(bytes)});}
  const courseInput={reviewer,review,attachmentSelection,sourceAcknowledgement:input.sourceAcknowledgement??null,workshareAcknowledgement:input.workshareAcknowledgement??null};
  const inputSha256=digest(Buffer.from(JSON.stringify(courseInput)));
  if(result){need(result.inputSha256===inputSha256&&JSON.stringify(result.courseInput)===JSON.stringify(courseInput),'The continuation review, attribution, attachment selection or acknowledgement differs from this original course.');need(result.workspaceId===workspaceId&&result.workshareId===workshareId&&result.masterSha256===masterSha256&&result.title===title,'The existing course belongs to another original source/customer.');}
  else result={schema:'starforge.canadabuys.response-review-course.v1',courseInput,inputSha256,workspaceId,workshareId,masterSha256,title,startedAt:new Date().toISOString(),phase:'opening',views:[],downloads:{},errors:[],pending:null};
  result.requests ||= [];
  const save=()=>atomic(resultPath,result);
  const confirmNative = (endpoint, value) => {
    const commandId=result.pending?.body?.commandId;
    const selected=result.requests.find(item=>item.endpoint===endpoint&&item.commandId===commandId);
    need(selected&&value.record,'The accepted response must retain its original submitted request.');
    selected.confirmed={record:value.record,workspace:value.workspace,
      ...(value.returnedRecord?{returnedRecord:value.returnedRecord}:{})};
  };

  if(result.phase==='COMPLETE')return result;
  const routePattern='**/api/response-review/**';
  const routeHandler=async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(request.method()==='POST'&&['/api/response-review/prepare','/api/response-review/apply'].includes(path)){
      const body=request.postDataJSON();
      need(body.workspaceId===workspaceId,'The native mutation targets another workspace.');
      need(typeof body.commandId==='string'&&body.commandId,'Retain the original native command ID.');
      const endpoint=path.replace('/api/response-review','');
      const savedRequest=await retainNativeRequest(directory,body);
      const prior=result.requests.find(value=>value.endpoint===endpoint&&value.commandId===body.commandId);
      need(!prior||(prior.sha256===savedRequest.sha256&&prior.bytes===savedRequest.bytes),
        'This original native command already has another retained input.');
      if(!prior)result.requests.push({endpoint,commandId:body.commandId,...savedRequest});
      result.pending={schema:'starforge.canadabuys.response-review-request.v1',kind:path.endsWith('/prepare')?'Prepare response':'Apply supplier return',path:path.replace('/api/response-review',''),body,createdAt:new Date().toISOString()};
      await save();
    }
    await route.continue();
  };
  let recipient=null,originalFailure=null;const browserErrors=[];const onError=error=>browserErrors.push(error.message);page.on('pageerror',onError);
  await page.route(routePattern,routeHandler);
  try {
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(new URL('/response-review/',baseURL).href,{waitUntil:'domcontentloaded'});
    await page.locator('#workspace-identity').filter({hasText:workspaceId}).waitFor();
    if(result.pending){
      await page.evaluate(value=>localStorage.setItem('canadabuys.response-review.pending.v1',JSON.stringify(value)),result.pending);
      await page.reload({waitUntil:'domcontentloaded'});await page.locator('#workspace-identity').filter({hasText:workspaceId}).waitFor();
      const pending=result.pending;
      const received=await waitNative(page,'POST','/api/response-review'+pending.path,()=>page.locator('#retry-request').click());
      await page.locator('#notice').filter({hasText:'The complete native response is saved.'}).waitFor();
      confirmNative(pending.path,received);
      result.record=received.record;result.receipt=received;result.pending=null;result.phase=pending.kind==='Apply supplier return'?'received':'prepared';await save();
    }
    if(!result.record){
      await page.locator('#master-file').setInputFiles(resolve(masterPath));
      await page.locator('#master-summary').filter({hasText:'Complete source loaded'}).waitFor();
      await page.locator('#workshare-select').selectOption(workshareId);
      await page.locator('#prepare-title').fill(title);
      const prepared=await waitNative(page,'POST','/api/response-review/prepare',()=>page.locator('#prepare-response').click());
      await page.locator('#notice').filter({hasText:'The complete native response is saved.'}).waitFor();
      confirmNative('/prepare',prepared);
      result.record=prepared.record;result.pending=null;result.phase='prepared';await save();
    }
    await page.locator('#record-select').selectOption(result.record.id);
    await page.locator('#record-revision').fill(String(result.record.revision));
    const selectedRead=page.waitForResponse(response=>{const url=new URL(response.url());return response.request().method()==='GET'&&url.pathname==='/api/response-review/records/'+result.record.id&&url.searchParams.get('revision')===String(result.record.revision);});
    await page.locator('#open-record').click();const selectedResponse=await selectedRead;const selected=await selectedResponse.json();need(selectedResponse.ok()&&selected.record.id===result.record.id&&selected.record.revision===result.record.revision&&selected.record.editionSha256===result.record.editionSha256&&selected.record.sha256===result.record.sha256,'The selected saved response edition changed.');
    await page.locator('#response-identity').filter({hasText:'baseline revision '+result.record.revision}).waitFor();
    await layout(page,'host-original-response-desktop',directory,result);await save();
    if(!result.downloads.editor){
      const waiting=page.waitForEvent('download');await page.locator('#download-editor').click();
      result.downloads.editor=await retainDownload(await waiting,join(directory,'complete-standalone-editor.html'));await save();
    }
    await readRetained(result.downloads.editor);
    if(!result.downloads.returned){
      recipient=await page.context().browser().newPage({viewport:{width:1440,height:1000}});
      recipient.on('pageerror',onError);
      const network=[];
      await recipient.route(/^https?:\/\//,async route=>{network.push(route.request().url());await route.abort();});
      await recipient.goto(pathToFileURL(result.downloads.editor.path).href,{waitUntil:'domcontentloaded'});
      await recipient.locator('#response-identity').filter({hasText:result.record.id}).waitFor();
      await recipient.locator('#dismiss-local').click({timeout:1000}).catch(()=>{});
      await recipient.locator('#author-name').fill(reviewer.name);
      await recipient.locator('#author-organization').fill(reviewer.organization||'');
      await recipient.locator('#author-role').fill(reviewer.role||'');
      await recipient.locator('[data-tab="answers"]').click();
      const answer=recipient.locator('[data-kind="answers"]').filter({has:recipient.locator('.item-id',{hasText:review.answerId})});
      need(await answer.count()===1,'The original answer selection is not unique.');
      await answer.locator('[data-field="text"]').fill(review.text);
      await answer.locator('[data-field="comment"]').fill(review.comment);
      await answer.locator('[data-field="status"]').selectOption('PROPOSED');
      if(attachmentPaths.length){
        await recipient.locator('[data-tab="attachments"]').click();
        await recipient.locator('#attachment-files').setInputFiles(attachmentPaths.map(path=>resolve(path)));
        await recipient.locator('#attachment-description').fill('Complete original source selected for this attributed response review.');
        await recipient.locator('#add-attachments').click();
        await recipient.locator('#notice').filter({hasText:'Complete original files are retained'}).waitFor();
        await recipient.locator('[data-tab="answers"]').click();
        const updated=recipient.locator('[data-kind="answers"]').filter({has:recipient.locator('.item-id',{hasText:review.answerId})});
        await updated.locator('details').last().locator('summary').click();
        for(const checkbox of await updated.locator('.attachment-evidence input[type="checkbox"]').all())await checkbox.check();
        await updated.locator('[data-field="status"]').selectOption('PROPOSED');
      }
      await recipient.locator('#edition-note').fill('Complete source-backed response review for the selected original customer.');
      const draft=recipient.waitForEvent('download');await recipient.locator('#save-draft').click();
      result.downloads.unfinished=await retainDownload(await draft,join(directory,'complete-unfinished-draft.json'));await save();
      const unfinished=JSON.parse((await readRetained(result.downloads.unfinished)).toString('utf8'));
      need(unfinished.base.workspaceId===workspaceId&&unfinished.base.record.id===result.record.id,'The unfinished draft lost its original identity.');
      await recipient.locator('#working-file').setInputFiles(result.downloads.unfinished.path);
      await recipient.locator('#notice').filter({hasText:'Opened the complete working file.'}).waitFor();
      await recipient.locator('[data-tab="answers"]').click();
      need(await recipient.locator('[data-kind="answers"]').filter({has:recipient.locator('.item-id',{hasText:review.answerId})}).locator('[data-field="text"]').inputValue()===review.text,'The complete draft did not reopen the original edit.');
      await layout(recipient,'supplier-reviewed-answer-desktop',directory,result);
      await recipient.setViewportSize({width:390,height:844});await layout(recipient,'supplier-reviewed-answer-narrow',directory,result);
      const returned=recipient.waitForEvent('download');await recipient.locator('#checkpoint').click();
      result.downloads.returned=await retainDownload(await returned,join(directory,'complete-supplier-return.json'));
      const full=JSON.parse((await readRetained(result.downloads.returned)).toString('utf8'));need(full.editions.length>0&&full.editions.at(-1).author.name===reviewer.name,'The returned edition lost its named author.');
      await recipient.locator('[data-tab="attachments"]').click();
      for(const attachment of full.attachments){
        const awaiting=recipient.waitForEvent('download');await recipient.locator('[data-download-attachment="'+attachment.id+'"]').click();
        const destination=join(directory,'attachment-'+attachment.sha256);
        const saved=await retainDownload(await awaiting,destination);need(saved.bytes===attachment.bytes&&saved.sha256===attachment.sha256,'An outgoing original attachment differs.');
        result.downloads['attachment_'+attachment.id]={...saved,name:attachment.name,mime:attachment.mime};
      }
      await layout(recipient,'supplier-complete-attachments-narrow',directory,result);
      need(network.length===0,'The complete standalone editor attempted a network request.');
      result.phase='returned';await save();await recipient.close();recipient=null;
    }
    const returned=JSON.parse((await readRetained(result.downloads.returned)).toString('utf8'));
    if(result.phase!=='received'){
      await page.locator('#return-file').setInputFiles(result.downloads.returned.path);
      await page.locator('#comparison').waitFor({state:'visible'});
      await page.locator('#choose-returned').click();
      await page.locator('#host-reviewer').fill(reviewer.name);
      await page.locator('#receiving-note').fill('Reviewed explicit supplier-return choices for the original response; qualification and bid decisions remain separately selected.');
      if(await page.locator('#source-ack-field').isVisible()){need(input.sourceAcknowledgement,'The actual source changed; supply a reviewed source acknowledgement.');await page.locator('#source-ack').fill(input.sourceAcknowledgement);}
      if(await page.locator('#workshare-ack-field').isVisible()){need(input.workshareAcknowledgement,'The actual workshare changed; supply its reviewed acknowledgement.');await page.locator('#workshare-ack').fill(input.workshareAcknowledgement);}
      await layout(page,'native-complete-three-way-review',directory,result);await save();
      const applied=await waitNative(page,'POST','/api/response-review/apply',()=>page.locator('#apply-return').click());
      await page.locator('#notice').filter({hasText:'The complete native response is saved.'}).waitFor();
      confirmNative('/apply',applied);
      result.receipt=applied;result.record=applied.record;result.pending=null;result.phase='received';await save();
    }
    await page.locator('#record-select').selectOption(result.record.id);await page.locator('#record-revision').fill(String(result.record.revision));await page.locator('#open-record').click();
    await page.locator('#response-identity').filter({hasText:'baseline revision '+result.record.revision}).waitFor();
    await page.locator('[data-tab="answers"]').click();
    const receivedAnswer=page.locator('[data-kind="answers"]').filter({has:page.locator('.item-id',{hasText:review.answerId})});
    need(await receivedAnswer.locator('[data-field="text"]').inputValue()===review.text,'The selected returned answer did not reopen in the native response.');
    await layout(page,'native-received-response-desktop',directory,result);
    await page.setViewportSize({width:390,height:844});await layout(page,'native-received-response-narrow',directory,result);
    need(!browserErrors.length,'The original response course reported browser errors: '+browserErrors.join('; '));
    result.phase='COMPLETE';result.completedAt=new Date().toISOString();result.errors=browserErrors;await save();return result;
  } catch(error) {
    originalFailure=error;
    result.failure={message:error.message,at:new Date().toISOString()};result.errors=browserErrors;
    await save().catch(saveError=>{error.saveError={message:saveError.message};});throw error;
  } finally {
    const closing=[];
    if(recipient)try{await recipient.close();}catch(error){closing.push({owner:'recipient',message:error.message});}
    try{await page.unroute(routePattern,routeHandler);}catch(error){closing.push({owner:'course-route',message:error.message});}
    page.off('pageerror',onError);
    if(closing.length){
      result.closeFailures=[...(result.closeFailures||[]),{at:new Date().toISOString(),closing}];
      try{await save();}catch(error){if(originalFailure)originalFailure.closeSaveError={message:error.message};else originalFailure=error;}
      if(originalFailure){originalFailure.closing=closing;throw originalFailure;}
      else throw Object.assign(new Error('The original recipient or course route did not finish closing.'),{closing});
    }
  }
}
