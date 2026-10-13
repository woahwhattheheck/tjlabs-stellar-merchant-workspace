// SPDX-License-Identifier: MIT
/** Explicit following-edition review in the original Source Desk working copy. */
export function createEcondbFollowingDesk(p){
 const {ctx,w,needEdit,assertLive,command,importText,retainedText,esc,header,table,hint,empty,button,detail,download,touch}=p;
 let epoch=0;
 const pretty=v=>JSON.stringify(v,null,2)+'\n',clone=v=>structuredClone(v);
 const blank=()=>({priorPreparationId:'',installationId:'',priorRevision:'',reviewText:'',review:null,comparison:null,
  nativeHead:null,history:[],nextBefore:null,inventory:[],prepared:null});
 const state=()=>w().following??(w().following=blank());
 const live=(owner,selected)=>{assertLive(owner);if(selected!==epoch)throw new Error('A later following source selection is active. The earlier read was not applied.');};
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const parsed=()=>{
  let v;try{v=JSON.parse(state().reviewText);}catch{throw new Error('Retain complete valid following review JSON.');}
  const rows=(list,keys)=>Array.isArray(list)&&list.every(r=>object(r)&&keys.every(k=>typeof r[k]==='string')&&typeof r.reviewed==='boolean');
  if(!object(v)||typeof v.schema!=='string'||typeof v.comparisonSha256!=='string'||!object(v.basis)||
   typeof v.actor!=='string'||typeof v.observedAt!=='string'||
   !rows(v.decisions,['key','purpose','note'])||v.decisions.some(r=>r.disposition!==null&&typeof r.disposition!=='string')||
   !rows(v.fields,['path','choice','value','note'])||!object(v.fileReview)||typeof v.fileReview.reviewed!=='boolean'||typeof v.fileReview.note!=='string'||
   !object(v.commercialReview)||typeof v.commercialReview.reviewed!=='boolean'||
   typeof v.commercialReview.scopeFitsCurrentWorkshare!=='boolean'||typeof v.commercialReview.note!=='string')
   throw new Error('The full review needs its original entry and field arrays, operator/time fields and file/commercial review objects. Your exact unfinished JSON remains below.');
  return v;
 };
 const text=(label,key,value='',area=false)=>'<label'+(area?' class="source-desk-wide"':'')+'><span>'+esc(label)+'</span>'+
  (area?'<textarea data-econdb-following-field="'+esc(key)+'" data-source-edit rows="7" spellcheck="false">'+esc(value)+'</textarea>':
  '<input data-econdb-following-field="'+esc(key)+'" data-source-edit value="'+esc(value)+'">')+'</label>';
 const check=(label,group,key,checked,index)=>'<label class="source-desk-check"><input type="checkbox" data-econdb-following-review="'+group+
  '" data-review-key="'+key+'"'+(index!==undefined?' data-review-index="'+index+'"':'')+' data-source-edit'+(checked?' checked':'')+'> <span>'+esc(label)+'</span></label>';
 const input=(label,group,key,value,index,area=false)=>text(label,'',value,area)
  .replace('data-econdb-following-field=""','data-econdb-following-review="'+group+'" data-review-key="'+key+'"'+(index!==undefined?' data-review-index="'+index+'"':''));
 const select=(label,group,key,value,options,index)=>'<label><span>'+esc(label)+'</span><select data-econdb-following-review="'+group+
  '" data-review-key="'+key+'" data-review-index="'+index+'" data-source-edit>'+options.map(([v,t])=>'<option value="'+esc(v)+'"'+(value===v?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>';
 function invalidate(){state().prepared=null;w().prepared=null;w().preview=null;w().previewBasis=null;w().receivedDraftKey=null;touch();}
 function sourceChanged(){epoch++;state().comparison=null;state().review=null;state().reviewText='';invalidate();}
 async function adopt(original,result,owner){
  assertLive(owner);const f=state();
  if(original.method==='following-compare'){
   f.priorPreparationId=result.priorPreparationId;f.installationId=result.comparison.basis.installation.id;
   f.priorRevision=String(result.comparison.basis.priorInstallation.revision);f.comparison=clone(result);
   f.reviewText=pretty(result.review);f.review=null;f.prepared=null;w().prepared=null;w().preview=null;w().previewBasis=null;
  }else if(original.method==='following-prepare'){
   f.prepared=clone(result);w().prepared=clone(result);w().preview=null;w().previewBasis=null;
   const review=result.files.find(x=>x.name==='ECONDB_FOLLOWING_REVIEW.json');
   if(review)f.reviewText=await retainedText(review,owner);
   assertLive(owner);f.priorPreparationId=result.priorPreparationId;
   w().inspection={requestId:result.inspectionId,source:clone(result.source),files:[]};
   w().projectChoice=result.source.project.record.id+'@'+result.source.project.record.revision;
   w().archive=clone(result.files.find(x=>x.name==='source/econdb-workspace.zip'&&x.kind==='archive'));
   f.comparison={requestId:result.comparisonId,comparison:clone(result.following.comparison),
    priorPreparationId:result.priorPreparationId,inspectionId:result.inspectionId};
   f.installationId=result.following.currentInstallation.id;f.priorRevision=String(result.following.previousInstallation.revision);
  }
 }
 async function action(key){
  const f=state(),owner=w();
  if(key==='following-review-download'){download(f.reviewText,'ECONDB_FOLLOWING_REVIEW.json');return true;}
  if(key==='following-comparison-download'){if(!f.comparison)throw new Error('Compare the actual following source first.');download(pretty(f.comparison.comparison),'ECONDB_FOLLOWING_COMPARISON.json');return true;}
  if(!key.startsWith('following-'))return false;
  needEdit();
  if(key==='following-inventory'){
   const selected=++epoch,value=await ctx.api('/api/operations/'+ctx.caseId+'/installations');live(owner,selected);
   if(!Array.isArray(value.installations))throw new Error('The original saved Installation list is incomplete.');
   f.inventory=clone(value.installations);touch();await ctx.persistNow();return true;
  }
  if(key==='following-history'||key==='following-history-more'){
   if(!/^installation-[a-f0-9]{32}$/.test(f.installationId))throw new Error('Select the actual saved Installation identity.');
   const selected=++epoch,id=f.installationId,base='/api/operations/'+ctx.caseId+'/installations/'+id;
   const [head,page]=await Promise.all([ctx.api(base),ctx.api(base+'/history?limit=100'+
    (key.endsWith('-more')&&f.nextBefore!==null?'&before='+f.nextBefore:''))]);live(owner,selected);
   if(head.id!==id||!Array.isArray(page.editions))throw new Error('The original Installation history differs.');
   f.nativeHead=clone(head);f.history=key.endsWith('-more')?[...f.history,...clone(page.editions)]:clone(page.editions);
   f.nextBefore=page.nextBefore??null;touch();await ctx.persistNow();return true;
  }
  if(key==='following-observed'){const r=parsed();r.observedAt=new Date().toISOString();f.reviewText=pretty(r);f.review=null;invalidate();return true;}
  if(key==='following-compare'){
   if(!w().inspection?.requestId||!f.nativeHead||!f.priorPreparationId||!/^[1-9][0-9]*$/.test(f.priorRevision))
    throw new Error('Inspect the later complete workspace, read the actual saved Installation and choose its prepared historical revision.');
   const historical=f.history.find(x=>x.revision===Number(f.priorRevision));
   if(!historical||historical.id!==f.installationId)throw new Error('Read the selected complete Installation history page.');
   await ctx.refreshCase();assertLive(owner);
   await command('following-compare',{priorPreparationId:f.priorPreparationId,inspectionId:w().inspection.requestId,
    nativeCaseId:ctx.caseId,expectedVersion:ctx.context().version,installationId:f.installationId,
    expectedRevision:f.nativeHead.revision,expectedInstallationSha256:f.nativeHead.sha256,
    priorInstallationRevision:historical.revision,priorInstallationSha256:historical.sha256});return true;
  }
  if(key==='following-prepare'){
   const comparison=f.comparison;if(!comparison)throw new Error('Read the original complete following comparison first.');
   parsed();await importText('review',f.reviewText);assertLive(owner);
   await ctx.refreshCase();assertLive(owner);
   const b=comparison.comparison.basis;
   await command('following-prepare',{comparisonId:comparison.requestId,reviewId:f.review.fileId,nativeCaseId:ctx.caseId,
    expectedVersion:b.caseSource.version,installationId:b.installation.id,expectedRevision:b.installation.revision,
    expectedInstallationSha256:b.installation.sha256,priorPreparationId:comparison.priorPreparationId,
    inspectionId:comparison.inspectionId,priorInstallationRevision:b.priorInstallation.revision,
    priorInstallationSha256:b.priorInstallation.sha256});return true;
  }
  throw new Error('Unknown original following-edition control.');
 }
 function edit(target){
  const key=target.dataset.econdbFollowingField,group=target.dataset.econdbFollowingReview;
  if(key===undefined&&group===undefined)return false;needEdit();const f=state();
  if(key!==undefined){
   if(!['priorPreparationId','installationId','priorRevision','reviewText'].includes(key))throw new Error('Keep the original following field.');
   f[key]=target.value;if(key==='reviewText'){f.review=null;invalidate();}
   else{if(key==='installationId'){f.nativeHead=null;f.history=[];f.nextBefore=null;}sourceChanged();}
   touch();return true;
  }
  const review=parsed(),index=Number(target.dataset.reviewIndex),field=target.dataset.reviewKey;
  let row;if(['decisions','fields'].includes(group)){row=review[group]?.[index];if(!row)throw new Error('Select the original review row.');}
  else if(group==='root')row=review;
  else if(['fileReview','commercialReview'].includes(group))row=review[group];
  else throw new Error('Keep the original following review group.');
  if(!Object.hasOwn(row,field))throw new Error('Keep the complete declared review field.');
  row[field]=target.type==='checkbox'?target.checked:target.value;
  if(group==='fields'&&field==='choice'&&row.choice!=='edited'){
   const original=f.comparison?.comparison.fields.find(x=>x.path===row.path);if(!original)throw new Error('Keep the original field comparison.');
   row.value=original[row.choice];row.reviewed=false;
  }
  f.reviewText=pretty(review);f.review=null;invalidate();return true;
 }
 async function chooseFile(target){
  if(!target.hasAttribute('data-econdb-following-review-file'))return false;
  needEdit();const file=target.files?.[0];if(!file)return true;
  if(file.size>8*1024*1024)throw new Error('Keep the complete attributed review within eight MiB.');
  const owner=w(),selected=++epoch,raw=await file.arrayBuffer();live(owner,selected);
  state().reviewText=new TextDecoder('utf-8',{fatal:true}).decode(raw);state().review=null;invalidate();await ctx.persistNow();return true;
 }
 function render(){
  const f=state(),c=f.comparison?.comparison,pending=!!w().pending;let review=null,error='';
  if(f.reviewText)try{review=parsed();}catch(e){error=e.message;}
  return '<section class="econdb-following">'+header('Following customer edition','Compare the full later project against the prior preparation and actual saved Installation.')+
   hint('Both complete workspace archives and every original project member remain retained. Scope choices describe the continuing work; the original source results stay unchanged.')+
   '<div class="source-desk-actions">'+button('Read saved Installations','following-inventory','',pending)+'</div>'+
   (f.inventory.length?table(['Saved Installation','Current revision','Identity'],f.inventory.map(x=>[esc(x.name||x.id),esc(x.revision),'<code>'+esc(x.id)+'</code>'])):'')+
   '<div class="source-desk-fields">'+text('Prior complete preparation request UUID','priorPreparationId',f.priorPreparationId)+
   text('Actual saved Installation ID','installationId',f.installationId)+text('Prepared historical saved revision','priorRevision',f.priorRevision)+'</div>'+
   '<div class="source-desk-actions">'+button('Read current Installation and history','following-history','',pending)+
   (f.nextBefore!==null?button('Read earlier saved revisions','following-history-more','',pending):'')+'</div>'+
   (f.nativeHead?detail('Actual current saved Installation',f.nativeHead):'')+
   (f.history.length?table(['Historical revision','Original case version','Saved SHA-256'],f.history.map(x=>[esc(x.revision),esc(x.version),'<code>'+esc(x.sha256)+'</code>'])):'')+
   '<div class="source-desk-actions">'+button('Compare following edition','following-compare','',pending||!w().inspection||!f.nativeHead)+'</div>'+
   (c?detail('Complete original case and source basis',c.basis)+detail('Complete project inputs and original result summaries',c.project)+
    table(['Entry / source change','Exact before and following source','Scope decision'],c.rows.map((row,index)=>{
     const r=review?.decisions?.find(x=>x.key===row.key),i=review?.decisions?.findIndex(x=>x.key===row.key);
     return[esc(row.title)+'<br>'+esc(row.key)+' · '+esc(row.status),detail('Before',row.before)+detail('Following',row.after),
      r?select('Disposition','decisions','disposition',r.disposition??'',row.after?[['','Choose explicitly'],['included','Included in commissioned task'],['context','Retained context']]:[['missing','Missing in following source']],i)+
       input('Purpose','decisions','purpose',r.purpose,i)+input('Decision reason','decisions','note',r.note,i,true)+
       check('Reviewed complete entry','decisions','reviewed',r.reviewed,i):hint('Retain the full review template.')];
    }))+
    '<h5>Every original project file</h5>'+table(['Path','Change','Before','Following'],c.files.map(x=>[esc(x.name),esc(x.status),
     x.before?esc(x.before.bytes)+' bytes<br><code>'+esc(x.before.sha256)+'</code>':'Absent',x.after?esc(x.after.bytes)+' bytes<br><code>'+esc(x.after.sha256)+'</code>':'Absent']))+
    '<h5>Source and receiving text</h5>'+c.fields.map(row=>{
     const r=review?.fields?.find(x=>x.path===row.path),i=review?.fields?.findIndex(x=>x.path===row.path);
     return '<fieldset><legend>'+esc(row.path)+' · '+esc(row.status)+'</legend>'+detail('Prepared baseline, saved current and proposed following values',row)+
      (r?select('Use value','fields','choice',r.choice,[['current','Current saved'],['proposed','Proposed following'],['edited','Explicit edited text']],i)+
       input('Complete selected value','fields','value',r.value,i,true)+input('Reason','fields','note',r.note,i,true)+check('Reviewed field','fields','reviewed',r.reviewed,i):'')+'</fieldset>';
    }).join('')+detail('Complete original commercial fees, phases and payment schedule',c.commercial)+detail('Protected commercial, payment, assignment and operated fields',c.protectedFields):empty('Select a genuine prior preparation and saved edition, then compare the inspected following project.'))+
   (review?'<div class="source-desk-fields">'+input('Reviewing operator','root','actor',review.actor)+
    input('Actual observation timestamp','root','observedAt',review.observedAt)+
    input('Complete file population review','fileReview','note',review.fileReview?.note??'',undefined,true)+
    check('Reviewed every original file and change','fileReview','reviewed',review.fileReview?.reviewed)+
    input('Original Workshare scope and protected-field review','commercialReview','note',review.commercialReview?.note??'',undefined,true)+
    check('Reviewed current commercial scope','commercialReview','reviewed',review.commercialReview?.reviewed)+
    check('Scope fits the current original Workshare','commercialReview','scopeFitsCurrentWorkshare',review.commercialReview?.scopeFitsCurrentWorkshare)+'</div>'+
    '<div class="source-desk-actions">'+button('Use current observation time','following-observed','',pending)+'</div>':'')+
   (error?hint(error):'')+
   '<label>Open complete following review JSON<input type="file" accept=".json,application/json" data-econdb-following-review-file data-source-edit></label>'+
   text('Full attributed following review JSON','reviewText',f.reviewText,true)+
   '<div class="source-desk-actions">'+button('Download complete comparison','following-comparison-download','',!c)+
    button('Download current review','following-review-download','',!f.reviewText)+
    button('Prepare reviewed following Installation','following-prepare','',pending||!c||!review)+'</div>'+
   hint('Preparation rechecks the actual case and current saved Installation. Then use the original case Preview, Open reviewed Installation draft, and the existing Save for this same Installation ID.')+'</section>';
 }
 return{render,action,edit,chooseFile,adopt,state,sourceChanged,dispose(){epoch++;}};
}
export function validateEcondbFollowingWork(value){
 if(value===undefined||value===null)return;
 if(typeof value!=='object'||Array.isArray(value))throw new Error('Keep the complete following working copy.');
 for(const k of ['priorPreparationId','installationId','priorRevision','reviewText'])if(typeof value[k]!=='string')throw new Error('Retain unfinished following inputs.');
 for(const k of ['inventory','history'])if(!Array.isArray(value[k]))throw new Error('Retain all observed native Installation rows.');
 for(const k of ['comparison','review','nativeHead','prepared'])if(value[k]!==null&&(typeof value[k]!=='object'||Array.isArray(value[k])))throw new Error('Keep complete following source views.');
}
