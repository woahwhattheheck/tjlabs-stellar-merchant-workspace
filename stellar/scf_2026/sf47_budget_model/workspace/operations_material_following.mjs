// MIT. Same-Installation Material source review inside the original Source Desk.
const clone=v=>structuredClone(v),json=v=>JSON.stringify(v,null,2);
const need=(v,m)=>{if(!v)throw Error(m);};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(name,action)=>'<button type="button" data-mf-action="'+action+'">'+esc(name)+'</button>';
export function createMaterialFollowingDesk(p){
 let chosenId='',previousId='',page=0,filter='';
 const select=(name,key,value,rows)=>'<label>'+esc(name)+'<select data-mf-field="'+key+'"><option value="">Select original</option>'+rows.map(r=>'<option value="'+esc(r[0])+'"'+(r[0]===value?' selected':'')+'>'+esc(r[1])+'</option>').join('')+'</select></label>';
 function panel(c){
  chosenId=c.followingTarget?.installationId??c.following?.request.installationId??'';previousId=c.followingTarget?.previousSourceId??c.following?.request.previousSourceId??'';
  const heads=p.host.savedInstallations(),sources=p.host.caseData().sources.filter(s=>s.materialCatalogue&&s.id!==c.sourceId);
  let html='<section><h4>Installation destination</h4><p><a href="/MATERIAL_INSTALLATION_FOLLOWING.md" target="_blank" rel="noopener">Following catalogue and saved Installation operating guide</a></p><p>Prepare a new Installation from its original Workshare draft, or review a later catalogue for one exact saved Installation. All previous drafts remain in complete checkpoints.</p>'+
   button('Use new Installation draft','new')+select('Update existing saved Installation','installation',chosenId,heads.map(r=>[r.id,r.name+' · revision '+r.revision]))+
   select('Original bound catalogue','previous',previousId,sources.map(r=>[r.id,r.filename+' · '+r.sha256.slice(0,12)]))+
   button('Compare with selected saved Installation','compare');
  if(c.followingSelectionChanged)html+='<p role="status">The target selectors changed. Compare that exact selection before preparing; the earlier complete review remains retained.</p>';
  const f=c.following;if(!f)return html+'</section>';
  const comparison=f.comparison;
  let review;try{review=JSON.parse(f.reviewText);}catch{}
  html+='<p><strong>Existing Installation '+esc(f.request.installationId)+' · revision '+f.request.expectedRevision+'</strong><br>Frozen case version '+comparison.basis.caseSource.version+' · '+esc(comparison.sha256)+'</p>'+
   '<p>'+esc(comparison.meaning)+'</p><p>'+esc(json(comparison.counts))+'</p>'+
   '<details><summary>Complete retained terms, milestones, checks and document</summary><pre>'+esc(json(comparison.currentDocument))+'</pre></details>'+
   '<details><summary>Both complete catalogue identities and retained history</summary><pre>'+esc(json({basis:comparison.basis,retained:comparison.retained,catalogue:comparison.catalogue}))+'</pre></details>'+
   '<label>Find original material<input data-mf-field="filter" value="'+esc(filter)+'"></label>'+button('Show matching materials','filter')+
   button('Mark unchanged material scope retained','unchanged');
  const rows=comparison.rows.filter(r=>!filter||(r.materialId+' '+json(r.after??r.before)).toLowerCase().includes(filter.toLowerCase())),visible=rows.slice(page*25,page*25+25);
  html+='<p>'+rows.length+' matching materials · page '+(page+1)+'</p>'+button('Previous materials','previous-page')+button('Next materials','next-page');
  for(const row of visible){
   const d=review?.decisions?.find(v=>v.key===row.key);
   html+='<details><summary>'+esc(row.materialId)+' · '+esc(row.change)+' · '+esc(d?.reviewed?d.disposition:'Unreviewed')+'</summary>'+
    '<pre>'+esc(json({before:row.before,after:row.after,fields:row.fields}))+'</pre>'+
    '<label>Scope decision<select data-mf-decision="'+esc(row.key)+'"><option value="">Not reviewed</option>'+ (row.after?['retained','out-of-scope']:['removed']).map(v=>'<option value="'+v+'"'+(v===d?.disposition?' selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
    '<label>Reason<textarea data-mf-note="'+esc(row.key)+'">'+esc(d?.note)+'</textarea></label></details>';
  }
  const field=(label,key,value,area=false)=>'<label>'+esc(label)+(area?'<textarea rows="3" data-mf-review="'+key+'">'+esc(value)+'</textarea>':'<input data-mf-review="'+key+'" value="'+esc(value)+'">')+'</label>';
  const check=(label,key,value)=>'<label><input type="checkbox" data-mf-review="'+key+'"'+(value?' checked':'')+'> '+esc(label)+'</label>';
  html+='<h4>Attribution and original Workshare scope</h4>';
  if(review){
   html+=field('Reviewing operator','actor',review.actor)+field('Observed at (ISO date/time with timezone)','observedAt',review.observedAt)+
    field('How this following source fits the original commissioned scope','scopeNote',review.scopeNote,true)+
    check('This source scope fits the unchanged original Workshare','scopeFitsCurrentWorkshare',review.scopeFitsCurrentWorkshare)+
    field('Original source and retained history review','completeSourceReview.note',review.completeSourceReview.note,true)+
    check('I reviewed the complete original sources and retained history','completeSourceReview.reviewed',review.completeSourceReview.reviewed)+
    '<h4>Source and receiving declarations</h4><p>Current values are preserved. A changed declaration requires an explicit choice and reason; completed checks and original commercial terms remain intact.</p>';
   for(const row of comparison.fields){
    const d=review.fields.find(v=>v.path===row.path);
    html+='<fieldset><legend>'+esc(row.path)+'</legend><p>Current saved value: '+esc(row.current||'Empty')+'</p><p>Proposed source value: '+esc(row.proposed||'Empty')+'</p>'+
     '<label>Selection<select data-mf-path="'+esc(row.path)+'" data-mf-kind="choice">'+['current','proposed','edited'].map(v=>'<option value="'+v+'"'+(d.choice===v?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label>'+
     '<label>Selected value<textarea rows="3" data-mf-path="'+esc(row.path)+'" data-mf-kind="value"'+(d.choice!=='edited'?' readonly':'')+'>'+esc(d.value)+'</textarea></label>'+
     '<label>Reason<textarea rows="2" data-mf-path="'+esc(row.path)+'" data-mf-kind="note">'+esc(d.note)+'</textarea></label>'+
     '<label><input type="checkbox" data-mf-path="'+esc(row.path)+'" data-mf-kind="reviewed"'+(d.reviewed?' checked':'')+'> Reviewed this exact declaration</label></fieldset>';
   }
   html+='<h4>Original source bindings</h4><p>The following catalogue must be bound to both source and receiving. Select whether to retain the prior reference; both complete files stay in the package even when an active binding is replaced.</p>';
   for(const d of review.bindings){
    html+='<fieldset><legend>'+esc(d.section)+'</legend>';
    for(const s of p.host.caseData().sources)html+='<label><input type="checkbox" data-mf-binding="'+d.section+'" data-mf-source="'+esc(s.id)+'"'+(d.sourceIds.includes(s.id)?' checked':'')+'> '+esc(s.filename)+' · '+esc(s.id)+' · '+esc(s.sha256.slice(0,12))+'</label>';
    html+='<label>Binding decision reason<textarea data-mf-binding="'+d.section+'" data-mf-kind="note">'+esc(d.note)+'</textarea></label>'+
     '<label><input type="checkbox" data-mf-binding="'+d.section+'" data-mf-kind="reviewed"'+(d.reviewed?' checked':'')+'> Reviewed these exact retained/replaced source bindings</label></fieldset>';
   }
  }
  html+='<details><summary>Advanced complete review JSON</summary><p>Unfinished JSON stays in this draft. Display edited review to return to labeled controls.</p><textarea rows="24" aria-label="Complete following review JSON" data-mf-field="review">'+esc(f.reviewText)+'</textarea>'+button('Display edited review','refresh')+'</details>'+
   button('Download following comparison and draft','download')+'</section>';
  return html;
 }
 function edit(target){
  const simple=target.dataset.mfField;
  if(simple==='installation'||simple==='previous'){
   const c=p.current();if(!c)return true;p.invalidate(c);c.followingTarget??={installationId:chosenId,previousSourceId:previousId};
   c.followingTarget[simple==='installation'?'installationId':'previousSourceId']=target.value;
   chosenId=c.followingTarget.installationId;previousId=c.followingTarget.previousSourceId;
   c.followingSelectionChanged=!!c.following&&(chosenId!==c.following.request.installationId||previousId!==c.following.request.previousSourceId);
   p.changed();return true;
  }
  if(simple==='filter'){filter=target.value;page=0;return true;}
  const isEdit=simple==='review'||target.dataset.mfReview!==undefined||target.dataset.mfPath!==undefined||
   target.dataset.mfBinding!==undefined||target.dataset.mfDecision!==undefined||target.dataset.mfNote!==undefined;
  if(!isEdit)return false;
  const c=p.current();need(c?.following,'Open the original following comparison.');
  p.invalidate(c);
  if(simple==='review'){c.following.reviewText=target.value;p.changed();return true;}
  const review=JSON.parse(c.following.reviewText);let redraw=false;
  if(target.dataset.mfReview!==undefined){
   const parts=target.dataset.mfReview.split('.'),value=target.type==='checkbox'?target.checked:target.value;
   if(parts.length===1)review[parts[0]]=value;else review[parts[0]][parts[1]]=value;
  }else if(target.dataset.mfPath!==undefined){
   const row=c.following.comparison.fields.find(r=>r.path===target.dataset.mfPath),d=review.fields.find(r=>r.path===row.path),kind=target.dataset.mfKind;
   if(kind==='choice'){d.choice=target.value;if(d.choice!=='edited')d.value=row[d.choice];d.reviewed=false;redraw=true;}
   else d[kind]=kind==='reviewed'?target.checked:target.value;
  }else if(target.dataset.mfBinding!==undefined){
   const d=review.bindings.find(r=>r.section===target.dataset.mfBinding);
   if(target.dataset.mfSource!==undefined){const id=target.dataset.mfSource;d.sourceIds=target.checked?[...new Set([...d.sourceIds,id])]:d.sourceIds.filter(x=>x!==id);d.reviewed=false;}
   else d[target.dataset.mfKind]=target.dataset.mfKind==='reviewed'?target.checked:target.value;
  }else{
   const key=target.dataset.mfDecision??target.dataset.mfNote,d=review.decisions.find(r=>r.key===key);need(d,'Keep the exact original material row.');
   if(target.dataset.mfDecision!==undefined){d.disposition=target.value||null;d.reviewed=!!target.value;}else d.note=target.value;
  }
  c.following.reviewText=json(review);p.changed();
  const box=p.root.querySelector('[data-mf-field="review"]');if(box)box.value=c.following.reviewText;
  if(redraw)p.render();return true;
 }
 async function action(name){
  const c=p.current();need(c,'Open the complete following catalogue as a named source review.');
  if(name==='download'){p.download(json(c.following)+'\n','Material_Following_Installation_Review.json');return;}
  if(name==='filter'||name==='refresh'){p.render();return;}
  if(name==='previous-page'){page=Math.max(0,page-1);return;}
  if(name==='next-page'){const total=c.following.comparison.rows.filter(r=>!filter||(r.materialId+' '+json(r.after??r.before)).toLowerCase().includes(filter.toLowerCase())).length;page=Math.min(Math.max(0,Math.ceil(total/25)-1),page+1);return;}
  if(name==='unchanged'){
   need(c.following,'Compare the exact original sources first.');
   const n=clone(c),r=JSON.parse(n.following.reviewText);
   p.invalidate(n);
   for(const row of n.following.comparison.rows.filter(x=>x.change==='unchanged')){
    const d=r.decisions.find(x=>x.key===row.key);d.disposition='retained';d.reviewed=true;d.note='Explicitly retained unchanged material scope.';
   }
   n.following.reviewText=json(r);await p.replaceCopy(n);return;
  }
  if(name==='new'){
   const n=p.checkpoint(c,'Before new-Installation selection');n.following=null;n.followingSelectionChanged=false;n.followingTarget=null;n.document=null;n.template=null;n.prepared=null;n.preparedInput=null;n.selectionText='';n.bindingsText='';await p.replaceCopy(n);return;
  }
  need(name==='compare'&&!p.reason(),'Reopen the original current case before following comparison.');
  need(chosenId&&previousId,'Select one actual saved Installation and its bound original catalogue.');
  await p.verify();const original=await p.readSource(previousId);
  const saved=await p.host.readInstallation(chosenId),head=p.host.savedInstallations().find(x=>x.id===chosenId);
  need(head&&saved.revision===head.revision&&saved.sha256===head.sha256,'The saved Installation head changed.');
  const request={installationId:saved.id,expectedRevision:saved.revision,expectedInstallationSha256:saved.sha256,
   previousSourceId:original.metadata.id,expectedPreviousSourceSha256:original.metadata.sha256};
  const response=await p.request('template',c,{...request,operationId:c.operationId});
  need(response.result.following?.comparison?.basis.installation.sha256===saved.sha256,'The native comparison selected another saved Installation.');
  const next=p.checkpoint(c,'Before following Installation comparison');
  next.followingSelectionChanged=false;next.followingTarget={installationId:saved.id,previousSourceId:original.metadata.id};
  next.following={schema:'stellar-forge.material-installation-following.v1.working',request,
   comparison:clone(response.result.following.comparison),reviewText:json(response.result.following.review)};
  next.document=clone(saved.preview.document);next.template=clone(response.result);
  next.selectionText=json(response.result.selection);next.bindingsText=json(response.result.bindings);next.prepared=null;next.preparedInput=null;
  const state=clone(p.state()),existing=state.sources.find(s=>s.metadata.id===original.metadata.id&&s.metadata.sha256===original.metadata.sha256);
  if(!existing)state.sources.push(original);
  state.copies[state.copies.findIndex(v=>v.id===next.id)]=next;await p.commit(state);page=0;
  p.notice('Complete current Installation and both exact original catalogues retained. Review the source changes and receiving choices; this remains a draft.');
 }
 return {panel,edit,action};
}
