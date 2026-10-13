// SPDX-License-Identifier: MIT
export function createFollowingDesk({state,$,text,canonical,bytes,sha,api,run,remember,downloadJSON,download,fileRow,mutate,upload,message}){
 const initial=()=>({before:null,after:null,comparison:null,review:null,templateId:null,afterArchiveSourceId:'',reviewSourceId:'',revision:0,amendmentDrafts:{},comparisonInspections:{},archivedReviews:[]});
 state.following??=initial();let page=0,memberPage=0;const sources=new Map();
 const current=()=>state.following??(state.following=initial());
 const active=result=>result?.type==='following-template'||result?.mode==='following'||result?.request?.mode==='following';
 const changed=()=>{current().revision=(current().revision||0)+1;void remember();};
 const safeReview=(review,comparison)=>review?.schema==='stellar-forge.dcat-installation-following.v1.review'&&review.comparisonSha256===comparison?.sha256&&canonical(review.basis)===canonical(comparison?.basis);
 function archiveDraft(){const f=current();if(!f.review)return;const row={savedAt:new Date().toISOString(),comparison:structuredClone(f.comparison),review:structuredClone(f.review),before:structuredClone(f.before),after:structuredClone(f.after),amendmentDrafts:structuredClone(f.amendmentDrafts),comparisonInspections:structuredClone(f.comparisonInspections||{}),afterArchiveSourceId:f.afterArchiveSourceId,reviewSourceId:f.reviewSourceId};if(!(f.archivedReviews||[]).some(x=>canonical({...x,savedAt:null})===canonical({...row,savedAt:null})))f.archivedReviews=[...(f.archivedReviews||[]),row];}
 async function inspected(id){if(!id)return null;if(!sources.has(id)){const result=await api('/api/requests/'+id);if(result.type!=='inspect'||result.status==='PENDING'||!result.source)throw Error('Reopen the complete retained archive inspection.');sources.set(id,result);}return sources.get(id);}
 async function pin(which){if(!state.inspectionId)throw Error('Inspect the complete intended archive first.');const row=await inspected(state.inspectionId),f=current();f[which]={inspectionId:row.requestId,archiveId:row.archiveId,sourceSha256:row.source.sourceSha256,project:structuredClone(row.source.project)};changed();render();message('Selected the complete '+(which==='before'?'earlier':'later')+' catalogue. Prepare the comparison to bind this selection.');}
 function pairMatches(){const f=current(),b=f.comparison?.basis;return !!b&&b.before.sourceSha256===f.before?.sourceSha256&&b.after.sourceSha256===f.after?.sourceSha256&&b.after.archive.sourceId===f.afterArchiveSourceId;}
 function common(){const f=current();if(!f.before||!f.after||!state.inputs['prior-preparation']||!state.inputs['saved-installation']||!state.inputs.case||!f.afterArchiveSourceId.trim())throw Error('Select both complete inspected editions, retain the original preparation, saved Installation and current case, and enter the later archive’s original case source ID.');return{beforeInspectionId:f.before.inspectionId,afterInspectionId:f.after.inspectionId,priorPreparationId:state.inputs['prior-preparation'].fileId,installationId:state.inputs['saved-installation'].fileId,caseId:state.inputs.case.fileId,afterArchiveSourceId:f.afterArchiveSourceId};}
 function comparisonInspection(which){const f=current(),expected=f.comparison?.basis?.[which]?.sourceSha256,bound=f.comparisonInspections?.[which]??f[which];return bound?.sourceSha256===expected?bound:null;}
 function rows(){const f=current(),family=$('following-family').value,status=$('following-state').value,query=$('following-query').value.trim().toLowerCase();return(f.comparison?.rows||[]).filter(row=>(!family||row.family===family)&&(!status||row.status===status)&&(!query||[row.key,row.label,row.family,row.status,JSON.stringify(row.before?.state),JSON.stringify(row.after?.state)].join(' ').toLowerCase().includes(query)));}
 const amendments={source:['reference','population','meaning','authority','changePolicy'],receiving:['application','host','operator','acceptanceRule','changeAndWithdraw','recovery','maintenance']};
 function renderAmendments(){
  const target=$('following-amendments'),f=current();target.replaceChildren();if(!f.review)return;
  for(const [section,fields]of Object.entries(amendments)){const box=text('div','','binding-group');box.append(text('h3',section==='source'?'Source description':'Receiving instructions'));
   for(const key of fields){const path=section+'.'+key,label=text('label'),enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=Object.hasOwn(f.review.amendments[section],key);label.append(enabled,document.createTextNode('Amend '+key.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase()));
    const input=document.createElement('textarea');input.rows=2;input.maxLength=4000;input.value=Object.hasOwn(f.amendmentDrafts||{},path)?f.amendmentDrafts[path]:f.review.amendments[section][key]||'';input.disabled=!enabled.checked;input.setAttribute('aria-label',section+' '+key);
    enabled.addEventListener('change',()=>{input.disabled=!enabled.checked;if(enabled.checked)f.review.amendments[section][key]=input.value;else delete f.review.amendments[section][key];changed();});
    input.addEventListener('input',()=>{f.amendmentDrafts[path]=input.value;if(enabled.checked)f.review.amendments[section][key]=input.value;changed();});box.append(label,input);
   }target.append(box);
  }
 }
 function renderRows(){
  const f=current(),matching=rows(),target=$('following-records');target.replaceChildren();page=Math.min(page,Math.max(0,Math.ceil(matching.length/40)-1));
  $('following-count').textContent=matching.length.toLocaleString()+' matching of '+(f.comparison?.rows.length||0).toLocaleString()+' complete records'+(matching.length?' · '+(page*40+1)+'–'+Math.min((page+1)*40,matching.length):'');
  $('following-previous').disabled=page===0;$('following-next').disabled=(page+1)*40>=matching.length;
  const decisions=new Map((f.review?.decisions||[]).map(r=>[r.key,r]));
  for(const row of matching.slice(page*40,(page+1)*40)){
   const box=text('article','','record');box.append(text('h3',row.label||row.key),text('p',row.family+' · '+row.status+' · '+row.key,'metadata'));
   if(row.previous)box.append(text('p','Previous scope: '+(row.previous.included?'Included':'Context')+' · '+row.previous.purpose));
   const decision=decisions.get(row.key);if(!decision){box.append(text('p','The complete review has no matching decision. Prepare the exact comparison again.'));target.append(box);continue;}
   const grid=text('div','','form-grid'),choiceLabel=text('label','Disposition'),choice=document.createElement('select');choice.append(new Option('Select a decision',''));for(const [value,label]of(row.status==='MISSING'?[['missing','Missing from later source']]:[['included','Include in commissioned work'],['context','Retain as context']]))choice.append(new Option(label,value));choice.value=decision.disposition??'';choiceLabel.append(choice);
   const reviewedLabel=text('label'),reviewed=document.createElement('input');reviewed.type='checkbox';reviewed.checked=decision.reviewed===true;reviewedLabel.append(reviewed,document.createTextNode('Reviewed these exact record editions'));grid.append(choiceLabel,reviewedLabel);box.append(grid);
   const purposeLabel=text('label','Purpose'),purpose=document.createElement('textarea');purpose.rows=2;purpose.maxLength=4000;purpose.value=decision.purpose;purposeLabel.append(purpose);
   const noteLabel=text('label','Reason for this decision'),note=document.createElement('textarea');note.rows=2;note.maxLength=4000;note.value=decision.note;noteLabel.append(note);box.append(purposeLabel,noteLabel);
   choice.addEventListener('change',()=>{decision.disposition=choice.value||null;decision.reviewed=false;reviewed.checked=false;changed();});
   purpose.addEventListener('input',()=>{decision.purpose=purpose.value;decision.reviewed=false;reviewed.checked=false;changed();});
   note.addEventListener('input',()=>{decision.note=note.value;decision.reviewed=false;reviewed.checked=false;changed();});
   reviewed.addEventListener('change',()=>{decision.reviewed=reviewed.checked;changed();});
   const details=document.createElement('details');details.append(text('summary','Complete earlier/later records and source files'));
   for(const which of ['before','after']){const source=sources.get(comparisonInspection(which)?.inspectionId)?.source,original=source?.records?.find(record=>record.key===row.key);details.append(text('h4',which==='before'?'Earlier original record':'Later original record'),text('pre',original?JSON.stringify(original,null,2):JSON.stringify(row[which],null,2)));}
   for(const file of row.files||[]){const line=text('div','','file-row');line.append(text('span',file.status+' · '+file.path));for(const which of ['before','after'])if(file[which]&&comparisonInspection(which)){const button=text('button','Download '+(which==='before'?'earlier':'later')+' file');button.addEventListener('click',()=>run(()=>download('/api/sources/'+comparisonInspection(which).inspectionId+'/file?path='+encodeURIComponent(file.path),file.path.split('/').at(-1))));line.append(button);}details.append(line);}
   box.append(details);target.append(box);
  }
  if(!matching.length)target.append(text('p',f.comparison?'No matching records. Clear the filters to inspect the whole comparison.':'Prepare a comparison of the complete selected editions.'));
 }
 function renderSourceFiles(){
  const which=$('following-file-edition').value||'after',bound=comparisonInspection(which),source=sources.get(bound?.inspectionId)?.source,term=$('following-file-query').value.trim().toLowerCase(),all=source?.manifest?.files||[],files=all.filter(file=>!term||file.path.toLowerCase().includes(term)),target=$('following-files');target.replaceChildren();memberPage=Math.min(memberPage,Math.max(0,Math.ceil(files.length/100)-1));
  $('following-file-count').textContent=files.length.toLocaleString()+' matching of '+all.length.toLocaleString()+' complete '+(which==='before'?'earlier':'later')+' files · page '+(memberPage+1)+' of '+Math.max(1,Math.ceil(files.length/100));
  for(const file of files.slice(memberPage*100,(memberPage+1)*100)){const row=text('div','','file-row'),label=text('span',file.path+' · '+file.bytes.toLocaleString()+' bytes');label.append(text('div',file.sha256,'metadata'));const button=text('button','Download original file');button.addEventListener('click',()=>run(()=>download('/api/sources/'+bound.inspectionId+'/file?path='+encodeURIComponent(file.path),file.path.split('/').at(-1))));row.append(label,button);target.append(row);}
  $('following-file-previous').disabled=memberPage===0;$('following-file-next').disabled=(memberPage+1)*100>=files.length;
 }
 async function retainedReview(){const file=state.inputs['following-review'];if(!file)return null;return canonical(await api('/api/files/'+file.fileId))===canonical(current().review)?file:null;}
 function renderArchived(){
  const target=$('following-archived'),f=current();target.replaceChildren();for(const [index,row]of(f.archivedReviews||[]).entries()){const box=text('div','','record');box.append(text('p','Retained review '+(index+1)+' · '+new Date(row.savedAt).toLocaleString('en-US')+' · '+row.review.comparisonSha256,'metadata'));const save=text('button','Download complete retained review and draft');save.addEventListener('click',()=>downloadJSON(row,'Catalogue_Following_Retained_Draft_'+(index+1)+'.json'));box.append(save);
   if(row.review.comparisonSha256===f.comparison?.sha256){const restore=text('button','Restore this review draft');restore.addEventListener('click',()=>run(async()=>{archiveDraft();f.review=structuredClone(row.review);f.amendmentDrafts=structuredClone(row.amendmentDrafts||{});f.comparisonInspections=structuredClone(row.comparisonInspections||f.comparisonInspections||{});f.reviewSourceId=row.reviewSourceId||'';changed();render();message('Restored the selected complete draft for this exact comparison.');}));box.append(restore);}target.append(box);
  }
 }
 function render(){
  const f=current();$('following-section').hidden=state.mode!=='following';
  $('mode-initial').setAttribute('aria-pressed',String(state.mode!=='following'));$('mode-following').setAttribute('aria-pressed',String(state.mode==='following'));
  $('following-pair').replaceChildren();for(const which of ['before','after']){const row=f[which],box=text('div','','record');box.append(text('h3',which==='before'?'Earlier edition':'Later edition'),text('p',row?'Inspection '+row.inspectionId:'Inspect and select the complete archive.','metadata'));if(row){box.append(text('p',JSON.stringify(row.project)),text('p',row.sourceSha256,'metadata'));const inspected=sources.get(row.inspectionId),archive=inspected?.files?.find(file=>file.fileId===row.archiveId);if(archive)box.append(fileRow(archive));if(inspected?.source){const save=text('button','Download complete source report');save.addEventListener('click',()=>downloadJSON(inspected.source,'Dcat_'+(which==='before'?'Earlier':'Later')+'_Complete_Source.json'));box.append(save);}}$('following-pair').append(box);}
  $('following-archive-source-id').value=f.afterArchiveSourceId;$('following-review-source-id').value=f.reviewSourceId;
  const family=$('following-family').value,families=[...new Set((f.comparison?.rows||[]).map(r=>r.family))].sort();$('following-family').replaceChildren(new Option('All families',''),...families.map(value=>new Option(value.replaceAll('-',' '),value)));if(families.includes(family))$('following-family').value=family;
  $('following-detail').hidden=!f.comparison;$('following-binding').textContent=f.comparison?'Comparison '+f.comparison.sha256+' · Installation '+f.comparison.basis.installation.id+' · revision '+f.comparison.basis.installation.revision:'';
  $('following-warning').textContent=f.comparison&&!pairMatches()?'Selected inputs differ from this retained comparison. Your review is preserved; prepare the intended comparison before continuing.':'Unchanged records carry their previous scope. Changed, new and missing records require an explicit decision, purpose and reason. Unrelated Installation fields remain in their original saved revision.';
  $('following-totals').textContent=f.comparison?Object.entries(f.comparison.totals).map(([key,value])=>key.toLowerCase()+': '+value.toLocaleString()).join(' · '):'';
  renderRows();renderSourceFiles();renderAmendments();renderArchived();
  for(const id of ['following-pin-before','following-pin-after','following-template','following-prepare','following-load-review'])$(id).disabled=!!state.pending;
 }
 async function restoreInputs(result){
  if(!active(result))return false;const request=result.request??{},f=current(),files=result.files||[],pick=(kind,key)=>files.find(x=>x.fileId===(request[key]??result[key]))??files.find(x=>x.kind===kind),nextInputs={...state.inputs},pins={};
  const comparison=result.comparison??result.following?.comparison,review=result.review??result.following?.review;
  if(!comparison||!review||!safeReview(review,comparison))throw Error('The retained following result is incomplete.');
  for(const [kind,key]of[['prior-preparation','priorPreparationId'],['saved-installation','installationId'],['case','caseId'],['following-review','reviewId']]){const file=pick(kind,key);if(file)nextInputs[kind]=file;}
  await Promise.all([['before','beforeInspectionId'],['after','afterInspectionId']].map(async([which,key])=>{const id=request[key]??result[key];if(!id)throw Error('The retained comparison is missing its original '+which+' inspection.');const row=await inspected(id);if(row.source.sourceSha256!==comparison.basis[which].sourceSha256)throw Error('The complete retained '+which+' source differs from the comparison.');pins[which]={inspectionId:id,archiveId:row.archiveId,sourceSha256:row.source.sourceSha256,project:structuredClone(row.source.project)};}));
  archiveDraft();state.inputs=nextInputs;f.before=pins.before;f.after=pins.after;f.comparisonInspections=structuredClone(pins);
  f.afterArchiveSourceId=request.afterArchiveSourceId??result.afterArchiveSourceId??comparison.basis.after.archive.sourceId;f.reviewSourceId=request.reviewSourceId??f.reviewSourceId;state.mode='following';return true;
 }
 async function validateDraft(value){
  const f=value.following;if(!f)return;if(f.review&&(!safeReview(f.review,f.comparison)||!Array.isArray(f.review.decisions)||!f.review.amendments?.source||!f.review.amendments?.receiving))throw Error('Select the complete following review and its exact comparison.');
  if(f.comparison){if(!f.templateId)throw Error('Retain the original comparison request with this complete editor draft.');const original=await api('/api/requests/'+f.templateId),comparison=original.comparison??original.following?.comparison;if(!comparison||canonical(comparison)!==canonical(f.comparison))throw Error('The draft comparison differs from its original retained result.');for(const which of['before','after']){const bound=f.comparisonInspections?.[which];if(bound&&bound.sourceSha256!==f.comparison.basis[which].sourceSha256)throw Error('The draft source selection differs from its original comparison.');}}
  const bindings=[f.before,f.after,...Object.values(f.comparisonInspections||{})].filter(Boolean);
  await Promise.all(bindings.map(async bound=>{const row=await inspected(bound.inspectionId);if(row.source.sourceSha256!==bound.sourceSha256)throw Error('Reopen this complete draft with its original archive inspections.');}));
 }
 async function adopt(result,{carry=true}={}){
  if(!active(result))return false;const f=current(),request=result.request??(state.pending?.requestId===result.requestId?state.pending.body:{}),comparison=result.comparison??result.following?.comparison,review=result.review??result.following?.review;
  if(!comparison||!review||!safeReview(review,comparison))throw Error('The retained following result is missing its complete comparison and review.');
  const newer=state.pending?.requestId===result.requestId&&state.pending.followingRevision!==undefined&&f.revision!==state.pending.followingRevision;const keep=f.review&&(newer||carry&&f.review.comparisonSha256===comparison.sha256);
  if(!keep){archiveDraft();await restoreInputs({...result,request});f.comparison=structuredClone(comparison);f.review=structuredClone(review);f.amendmentDrafts={};f.templateId=result.requestId;f.revision=(f.revision||0)+1;}
  else if(f.review.comparisonSha256===comparison.sha256)f.comparison=structuredClone(comparison);
  state.mode='following';render();return true;
 }
 function validateReview(){
  const f=current();if(!safeReview(f.review,f.comparison)||!pairMatches())throw Error('Prepare the exact selected catalogue comparison before continuing.');
  const rowsByKey=new Map(f.comparison.rows.map(row=>[row.key,row]));
  for(const decision of f.review.decisions){const row=rowsByKey.get(decision.key),allowed=row?.status==='MISSING'?['missing']:['included','context'];if(!row||!allowed.includes(decision.disposition)||!decision.purpose?.trim()||decision.reviewed!==true)throw Error('Complete and explicitly review every scope decision, including '+decision.key+'.');if((row.status!=='UNCHANGED'||decision.disposition!==(row.previous.included?'included':'context')||decision.purpose!==row.previous.purpose)&&!decision.note?.trim())throw Error('Record the reason for '+decision.key+'.');}
  for(const [section,fields]of Object.entries(f.review.amendments))for(const [key,value]of Object.entries(fields))if(typeof value!=='string'||!value.trim())throw Error('Complete the enabled '+section+'.'+key+' amendment or disable it.');
 }
 $('following-pin-before').addEventListener('click',()=>run(()=>pin('before')));$('following-pin-after').addEventListener('click',()=>run(()=>pin('after')));
 $('following-archive-source-id').addEventListener('input',()=>{current().afterArchiveSourceId=$('following-archive-source-id').value;changed();});
 $('following-review-source-id').addEventListener('input',()=>{current().reviewSourceId=$('following-review-source-id').value;changed();});
 $('following-template').addEventListener('click',()=>run(async()=>{await mutate('following-template',common());}));
 $('following-download-review').addEventListener('click',()=>run(async()=>{validateReview();const original=await retainedReview();if(original)await download('/api/files/'+original.fileId,original.name);else downloadJSON(current().review,'Dcat_Following_Review.json');}));
 $('following-download-comparison').addEventListener('click',()=>{if(current().comparison)downloadJSON(current().comparison,'Dcat_Following_Comparison.json');});
 $('following-download-draft').addEventListener('click',()=>downloadJSON(state,'Catalogue_Installation_Editor.json'));
 $('following-load-review').addEventListener('click',()=>run(async()=>{const file=state.inputs['following-review'];if(!file)throw Error('Retain the complete following-review JSON first.');const value=await api('/api/files/'+file.fileId),f=current();if(!safeReview(value,f.comparison))throw Error('This review belongs to another exact catalogue comparison.');archiveDraft();f.review=structuredClone(value);f.amendmentDrafts={};changed();render();message('Loaded the exact selected review; earlier edited draft is retained.');}));
 $('following-prepare').addEventListener('click',()=>run(async()=>{validateReview();const f=current();if(!f.reviewSourceId.trim())throw Error('Attach the exact downloaded review to the original case, retain its fresh case JSON here and enter the review’s original case source ID.');const raw=JSON.stringify(f.review,null,2)+'\n';if(!await retainedReview())await upload('following-review',new File([raw],'Dcat_Following_Review.json',{type:'application/json'}),{textValue:raw});await mutate('following-prepare',{...common(),reviewId:state.inputs['following-review'].fileId,reviewSourceId:f.reviewSourceId});}));
 for(const id of ['following-family','following-state'])$(id).addEventListener('change',()=>{page=0;renderRows();});$('following-query').addEventListener('input',()=>{page=0;renderRows();});
 $('following-previous').addEventListener('click',()=>{page--;renderRows();});$('following-next').addEventListener('click',()=>{page++;renderRows();});
 $('following-file-edition').addEventListener('change',()=>{memberPage=0;renderSourceFiles();});$('following-file-query').addEventListener('input',()=>{memberPage=0;renderSourceFiles();});$('following-file-previous').addEventListener('click',()=>{memberPage--;renderSourceFiles();});$('following-file-next').addEventListener('click',()=>{memberPage++;renderSourceFiles();});
 return{render,adopt,restoreInputs,active,archiveDraft,validateDraft,async refresh(){await validateDraft(state);render();}};
}
