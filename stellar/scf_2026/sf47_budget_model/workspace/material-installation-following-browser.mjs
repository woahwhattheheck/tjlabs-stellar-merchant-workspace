// MIT. Following-source chapter in the original Material browser receiving lifetime.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readArchive} from './operations_material_catalogue_model.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const clone=v=>structuredClone(v),json=v=>JSON.stringify(v,null,2)+'\n';
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const same=(a,b)=>canonical(a)===canonical(b);
const need=(v,m)=>{if(!v)throw Error(m);};
export async function receiveMaterialFollowing(p){
 const {input,report,page,desk,prefix,api,idle,stage,save,keep,download,capture,click,snapshot,installationSession,root,receipt,viewedFile}=p;
 const spec=input.followingInstallation;if(!spec)return;
 const raw=await readFile(spec.sourcePath),choices=spec.review;
 need(raw.length===spec.bytes&&sha(raw)===spec.sha256&&choices?.actor&&choices.observedAt&&
  spec.previousSha256===report.preparation.source.sha256,'Retain the exact original before/following source and complete reviewed scope input.');
 report.followingInstallation??={originalInstallation:clone(report.installation),originalSourceId:report.sourceId,originalInput:clone(spec)};
 const result=report.followingInstallation;
 need(same(result.originalInput,spec),'Keep the same complete following-source receiving input.');
 const view=async name=>{await desk.locator('[data-mc-action="view"][data-view="'+name+'"]').click();await idle();};
 async function work(){const path=await download('archive','Material_Following_Working_'+Object.keys(report.phases).length+'.json');return readArchive(await readFile(path,'utf8'));}
 async function recorded(){
  const values=[];
  for(const r of Object.values(report.requests).filter(v=>v.action==='installation.save'&&v.state==='RECORDED')){
   const body=JSON.parse(await readFile(r.bodyPath,'utf8'));
   if(body.data.installationId===result.originalInstallation.id&&body.data.expectedRevision===result.originalInstallation.revision)values.push({r,body});
  }need(values.length<=1,'Retain the single original same-Installation save.');return values[0];
 }
 await stage('11-following-source-custody',async()=>{
  await page.locator('[data-installation-action="material-catalogue-open"]').click();await idle();
  const before=await api(prefix),old=before.sources.find(s=>s.id===result.originalSourceId);
  need(old?.sha256===spec.previousSha256,'The saved Installation original catalogue changed.');
  const matches=before.sources.filter(s=>s.materialCatalogue&&s.sha256===spec.sha256&&s.bytes===spec.bytes);
  need(matches.length<=1,'Choose the exact original following attachment when duplicates exist.');
  if(!matches.length){
   await desk.locator('[data-mc-upload]').setInputFiles({name:spec.filename||'following-catalog.jsonl',mimeType:'application/x-ndjson',buffer:raw});await idle({allowError:true});
   const pending=desk.locator('[data-mc-action="intake-recover"]');if(await pending.count()){need(await pending.count()===1,'Recover the single original attachment.');await pending.click();await idle();}
  }
  const after=await api(prefix),rows=after.sources.filter(s=>s.materialCatalogue&&s.sha256===spec.sha256&&s.bytes===spec.bytes);
  need(rows.length===1,'Receive one exact typed following source.');result.sourceId=rows[0].id;await save();
  const copyName=input.operationId+' following',existing=desk.locator('[data-mc-action="copy-open"]').filter({hasText:copyName});
  if(result.copyId){need(await desk.locator('[data-mc-action="copy-open"][data-id="'+result.copyId+'"]').count()===1,'Reopen the original complete following review.');}
  else if(await existing.count()){
   const ids=await existing.evaluateAll((nodes,name)=>nodes.filter(n=>n.textContent===name).map(n=>n.dataset.id),copyName);
   need(ids.length===1,'Choose the single retained original following review.');result.copyId=ids[0];await save();
  }else{
   await desk.locator('[data-mc-field="source"]').selectOption(result.sourceId);
   await desk.locator('[data-mc-field="newName"]').fill(copyName);
   await click('open-source');
   result.copyId=await desk.locator('[data-mc-action="copy-open"][aria-current="true"]').getAttribute('data-id');await save();
  }
 });
 await desk.locator('[data-mc-action="copy-open"][data-id="'+result.copyId+'"]').click();await idle();await view('installation');
 await stage('12-following-comparison-and-review',async()=>{
  await desk.locator('[data-mf-field="installation"]').selectOption(result.originalInstallation.id);
  await desk.locator('[data-mf-field="previous"]').selectOption(result.originalSourceId);
  await desk.locator('[data-mf-action="compare"]').click();await idle();await capture('25-following-original-comparison');
  const current=await work(),copy=current.copies.find(c=>c.id===result.copyId);
  const comparison=copy.following.comparison,review=JSON.parse(copy.following.reviewText);
  need(comparison.basis.previousSource.sha256===spec.previousSha256&&comparison.basis.source.sha256===spec.sha256&&comparison.basis.installation.sha256===result.originalInstallation.sha256,'The following comparison changed original target or source identity.');
  need(Array.isArray(choices.decisions)&&choices.decisions.length===comparison.rows.length,'Supply each actual original material scope decision.');
  review.actor=choices.actor;review.observedAt=choices.observedAt;review.scopeNote=choices.scopeNote;
  review.scopeFitsCurrentWorkshare=choices.scopeFitsCurrentWorkshare;review.completeSourceReview=clone(choices.completeSourceReview);
  review.decisions=clone(choices.decisions);
  need(Array.isArray(choices.fields)&&choices.fields.length===comparison.fields.length,'Select each original source/receiving field.');
  review.fields=comparison.fields.map(row=>{
   const d=choices.fields.find(f=>f.path===row.path);need(d&&['current','proposed','edited'].includes(d.choice),'Keep the explicit receiving choice.');
   return {path:row.path,choice:d.choice,value:d.choice==='edited'?d.value:row[d.choice],note:d.note,reviewed:d.reviewed};
  });
  review.bindings=comparison.bindings.map(row=>{
   const d=choices.bindings?.find(b=>b.section===row.section);
   need(d&&['retain-old-and-following','replace-old-with-following'].includes(d.choice),'Explicitly choose source retention or replacement.');
   return {section:row.section,sourceIds:[...new Set([...row.current.filter(id=>d.choice!=='replace-old-with-following'||id!==result.originalSourceId),result.sourceId])],note:d.note,reviewed:d.reviewed};
  });
  await desk.locator('[data-mf-field="review"]').fill('{');await desk.locator('[data-mc-action="prepare"]').click();await idle({allowError:true});
  need((await desk.locator('[role="alert"]').allTextContents()).some(x=>x.trim()),'The incomplete following draft needs a visible error.');
  await capture('26-following-incomplete-review');
  await desk.locator('[data-mf-field="review"]').fill(json(review));await desk.locator('[data-mf-action="refresh"]').click();await idle();
  for(const key of ['actor','observedAt','scopeNote'])await desk.locator('[data-mf-review="'+key+'"]').fill(review[key]);
  await desk.locator('[data-mf-review="scopeFitsCurrentWorkshare"]').setChecked(review.scopeFitsCurrentWorkshare);
  await desk.locator('[data-mf-review="completeSourceReview.note"]').fill(review.completeSourceReview.note);
  await desk.locator('[data-mf-review="completeSourceReview.reviewed"]').setChecked(review.completeSourceReview.reviewed);
  for(const field of review.fields){
   await desk.locator('[data-mf-path="'+field.path+'"][data-mf-kind="choice"]').selectOption(field.choice);
   if(field.choice==='edited')await desk.locator('[data-mf-path="'+field.path+'"][data-mf-kind="value"]').fill(field.value);
   await desk.locator('[data-mf-path="'+field.path+'"][data-mf-kind="note"]').fill(field.note);
   await desk.locator('[data-mf-path="'+field.path+'"][data-mf-kind="reviewed"]').setChecked(field.reviewed);
  }
  for(const binding of review.bindings){
   await desk.locator('[data-mf-binding="'+binding.section+'"][data-mf-kind="note"]').fill(binding.note);
   await desk.locator('[data-mf-binding="'+binding.section+'"][data-mf-kind="reviewed"]').setChecked(binding.reviewed);
  }
  await click('prepare');await capture('27-following-complete-native-preview');
  const path=await download('prepared-download','Material_Following_Preparation.json'),value=JSON.parse(await readFile(path,'utf8'));
  need(value.preparation.nativePreview.installationId===result.originalInstallation.id&&value.preparation.nativePreview.expectedRevision===result.originalInstallation.revision,'The preparation created another Installation target.');
  const original=report.preparation.result.prepared.document,following=value.preparation.result.prepared.document;
  for(const k of Object.keys(original).filter(k=>!['source','receiving'].includes(k)))need(same(original[k],following[k]),'The following source changed original '+k);
  result.preparation=value.preparation;result.preparedInput=value.input;await keep('Material_Following_Resolved_Review.json',json(review));await viewedFile(path,{label:'28-following-preparation'});await save();
 });
 await stage('13-following-complete-customer-package',async()=>{
  const path=join(root,'Material_Following_Complete_Handover.zip');
  if(!await p.exists(path)){const pending=page.waitForEvent('download');await click('handover');const d=await pending;need(!await d.failure(),'The complete following customer archive failed.');await d.saveAs(path);}
  const id=await receipt(path),archive=await work(),copy=archive.copies.find(c=>c.id===result.copyId);
  need(copy.packages.some(row=>row.bytes===id.bytes&&row.sha256===id.sha256&&row.preparationSha256===result.preparation.preparationSha256),'The exact following customer ZIP is not bound to its retained preparation.');
  result.customer=id;await save();
 });
 await stage('14-following-original-same-id-save',async()=>{
  let saved=await recorded();
  if(!saved){
   await click('receive');
   const session=await installationSession(),draft=session.drafts[session.draftKey];
   need(draft.installationId===result.originalInstallation.id&&draft.expectedRevision===result.originalInstallation.revision&&same(draft.document,result.preparation.result.prepared.document),'The original editor selected a different target or document.');
   await page.locator('[data-installation-note]').fill(choices.scopeNote);
   await page.locator('[data-installation-action="preview"]').click();await idle();await capture('29-following-editor-preview');
   await snapshot();await page.locator('[data-installation-action="save"]').click();await idle();await snapshot();saved=await recorded();
  }
  need(saved,'Keep the actual same-Installation original save receipt.');
  const row=await api(prefix+'/installations/'+saved.r.result.recordId+'?revision='+saved.r.result.revision);
  need(row.id===result.originalInstallation.id&&row.revision===result.originalInstallation.revision+1&&row.sha256===saved.r.result.sha256&&same(row.preview.document,result.preparation.result.prepared.document),'The exact original following Installation save differs.');
  const old=await api(prefix+'/installations/'+result.originalInstallation.id+'?revision='+result.originalInstallation.revision);
  need(old.sha256===result.originalInstallation.sha256,'The original saved Installation history changed.');
  result.installation={id:row.id,revision:row.revision,sha256:row.sha256};await keep('Material_Following_Saved_Installation.json',json(row));await capture('30-following-saved-installation');await save();
 });
 await stage('15-following-full-archive-reopen',async()=>{
  await snapshot();await page.reload({waitUntil:'domcontentloaded'});await p.navigate();
  await page.locator('[data-installation-action="material-catalogue-open"]').click();await idle();
  await desk.locator('[data-mc-action="copy-open"][data-id="'+result.copyId+'"]').click();await idle();await view('installation');
  await capture('31-following-cold-review');
  const path=await download('archive','Material_Following_Complete_Working_Review.json'),archive=readArchive(await readFile(path,'utf8')),copy=archive.copies.find(c=>c.id===result.copyId);
  need(copy.following.comparison.basis.previousSource.sha256===spec.previousSha256&&copy.following.comparison.basis.source.sha256===spec.sha256&&copy.handoffs.length&&copy.packages.length,'Cold complete archive lost original sources or following review.');
  for(const id of [result.originalSourceId,result.sourceId])need(archive.sources.some(s=>s.metadata.id===id),'The complete working archive lost original source bytes.');
  await viewedFile(path,{label:'32-following-working-archive'});result.working=await receipt(path);await save();
 });
 return result;
}
