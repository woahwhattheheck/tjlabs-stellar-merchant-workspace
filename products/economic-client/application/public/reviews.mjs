// SPDX-License-Identifier: MIT
export function createReviewPanel({$,action,request,task,download,getState,refresh,readDraft}){
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pretty=value=>JSON.stringify(value,null,2);
 let comparison=null,visibleOffset=0;
 const database=new Promise((resolve,reject)=>{
  const open=indexedDB.open('economic-client-review-receiving',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('originals');
  open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
 });
 async function storage(write,value){
  const db=await database;
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('originals',write?'readwrite':'readonly'),store=tx.objectStore('originals');
   const key=location.origin+':'+getState().project_id;
   const query=write?(value===null?store.delete(key):store.put(value,key)):store.get(key);
   tx.oncomplete=()=>resolve(query.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Original review storage interrupted'));
  });
 }
 async function pendingView(){
  const saved=await storage(false);
  $('review-pending').hidden=!saved;
  $('review-pending-label').textContent=saved?saved.filename+' · '+saved.operation_id+' · '+saved.bytes+' bytes':'';
 }
 async function receiveSaved(){
  const saved=await storage(false);if(!saved)throw new Error('Select the complete customer return first');
  const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await saved.body.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(actual!==saved.sha256||saved.body.size!==saved.bytes)throw new Error('Retained original customer return differs');
  const result=await request('/api/review-return?operation_id='+encodeURIComponent(saved.operation_id),{method:'POST',body:saved.body});
  await storage(true,null);await refresh({draft:false});$('review-receipt').textContent=pretty(result);await pendingView();
 }
 function freshDraft(){
  if(JSON.stringify(readDraft())!==JSON.stringify(getState().draft))throw new Error('Save the current editorial draft before resolving a customer return; its unsaved changes remain in the briefing form.');
 }
 function renderComparison(){
  if(!comparison){$('review-decisions').innerHTML='<p>Select a returned review to compare its complete saved decisions.</p>';return;}
  $('review-comparison-summary').textContent=comparison.review.reviewer+' · saved revision '+comparison.review.revision+' · '+comparison.review.notes;
  const rows=comparison.decisions.slice(visibleOffset,visibleOffset+50);
  $('review-decisions').innerHTML=rows.map(row=>'<article class="review-decision" data-target="'+escape(row.target_id)+'"><h3>'+escape(row.label)+'</h3>'+
   '<p><strong>'+escape(row.decision.status.replaceAll('_',' '))+'</strong> · '+escape(row.target_id)+'</p><p class="review-text">'+escape(row.decision.comment)+'</p>'+
   (row.proposal?'<div class="columns"><section><h4>Original '+escape(row.proposal.field)+'</h4><pre>'+escape(row.original_value)+'</pre></section>'+
   '<section><h4>Current draft'+(row.conflict?' · changed':'')+'</h4><pre>'+escape(row.current.exists?row.current.value:row.current.reason)+'</pre></section>'+
   '<section><h4>Customer proposal</h4><pre>'+escape(row.proposal.value)+'</pre></section></div>':'')+
   '<details><summary>Full original target and source binding</summary><pre>'+escape(pretty(row.original))+'</pre></details>'+
   '<label>Disposition<select data-resolution><option value="">Leave for later</option><option value="acknowledge">Acknowledge</option>'+
   (row.proposal&&row.current.exists?'<option value="take_proposal">Use this editorial proposal in the draft</option>':'')+
   '<option value="defer">Record deferred</option><option value="reject">Record rejected</option></select></label>'+
   (row.conflict&&row.proposal?'<label class="check"><input type="checkbox" data-conflict>Replace the changed current editorial value with this proposal</label>':'')+
   '<label>Disposition notes<textarea data-reason rows="2"></textarea></label></article>').join('');
  $('review-page').textContent=(comparison.decisions.length?visibleOffset+1:0)+'–'+(visibleOffset+rows.length)+' of '+comparison.decisions.length+' saved decisions';
  $('review-prev').hidden=visibleOffset===0;$('review-next').hidden=visibleOffset+rows.length>=comparison.decisions.length;
 }
 function choices(){
  return [...document.querySelectorAll('.review-decision')].filter(card=>card.querySelector('[data-resolution]').value).map(card=>{
   const row=comparison.decisions.find(x=>x.target_id===card.dataset.target);
   return {target_id:row.target_id,current_sha256:row.current_sha256,action:card.querySelector('[data-resolution]').value,
    reason:card.querySelector('[data-reason]').value,confirm_conflict:card.querySelector('[data-conflict]')?.checked===true};
  });
 }
 function unfinishedChoices(){
  return [...document.querySelectorAll('.review-decision')].some(card=>card.querySelector('[data-resolution]').value||card.querySelector('[data-reason]').value||card.querySelector('[data-conflict]')?.checked);
 }
 function requireCompleteChoices(){
  if([...document.querySelectorAll('.review-decision')].some(card=>!card.querySelector('[data-resolution]').value&&(card.querySelector('[data-reason]').value||card.querySelector('[data-conflict]')?.checked)))
   throw new Error('Choose a disposition for each typed note or conflict confirmation, or clear it before saving. Your visible input is retained.');
 }
 function move(amount){
  if(unfinishedChoices())throw new Error('Save or clear the unfinished dispositions and notes before changing pages; this page keeps your current choices.');
  visibleOffset+=amount;renderComparison();
 }
 $('review-create').onsubmit=e=>{e.preventDefault();task(async()=>{
  const result=await action('review-create',{briefing_id:$('review-briefing').value,recipient:$('review-recipient').value,label:$('review-label').value},true);
  await refresh({draft:false});$('review-receipt').textContent=pretty(result);
 });};
 $('review-receive').onclick=()=>task(async()=>{
  if(await storage(false))throw new Error('Continue the retained original return before selecting another file');
  const body=$('review-upload').files[0];if(!body)throw new Error('Select the complete customer Return JSON');
  if(body.size>512*1024*1024)throw new Error('The complete return exceeds 512 MiB');
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await body.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
  await storage(true,{body,bytes:body.size,sha256,filename:body.name,operation_id:'review-return-'+crypto.randomUUID()});
  await pendingView();await receiveSaved();
 });
 $('review-resume').onclick=()=>task(receiveSaved);
 $('review-retain-input').onclick=()=>task(async()=>{
  const saved=await storage(false);if(!saved)return;
  const db=await database;
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('originals','readwrite'),store=tx.objectStore('originals');
   const key=location.origin+':'+getState().project_id;
   store.put(saved,key+':history:'+saved.operation_id);store.delete(key);
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Retained input storage interrupted'));
  });
  await pendingView();$('review-receipt').textContent='The complete original input remains in this browser history under '+saved.operation_id+'. Select the corrected complete return for a new receiving operation.';
 });
 $('review-compare').onclick=()=>task(async()=>{
  if(unfinishedChoices())throw new Error('Save or clear the unfinished dispositions and notes before replacing this comparison.');
  freshDraft();comparison=await action('review-preview',{return_id:$('review-return').value});visibleOffset=0;renderComparison();
 });
 $('review-prev').onclick=()=>task(async()=>move(-50));
 $('review-next').onclick=()=>task(async()=>move(50));
 $('review-apply').onclick=()=>task(async()=>{
  freshDraft();if(!comparison)throw new Error('Read the current complete customer comparison');
  requireCompleteChoices();const decisions=choices();if(!decisions.length)throw new Error('Choose explicit dispositions on this page');
  const result=await action('review-resolve',{return_id:comparison.return_id,expected_revision:comparison.project_revision,
   comparison_sha256:comparison.comparison_sha256,decisions},true);
  await refresh();comparison=await action('review-preview',{return_id:comparison.return_id});renderComparison();
  $('review-receipt').textContent=pretty(result);
 });
 $('review-packages').onclick=e=>{
  const button=e.target.closest('[data-review-file]');if(!button)return;
  task(async()=>download(await request('/api/review-file?id='+encodeURIComponent(button.dataset.package)+'&name='+encodeURIComponent(button.dataset.reviewFile),{raw:true}),button.dataset.reviewFile));
 };
 $('review-return-download').onclick=()=>task(async()=>download(await request('/api/review-return?id='+encodeURIComponent($('review-return').value),{raw:true}),'customer-review-return.json'));
 return {
  async refresh(){
   const state=getState(),reviews=state.reviews||{packages:[],returns:[],resolutions:[]};
   for(const [id,rows,value,label]of [
    ['review-briefing',state.briefings,r=>r.id,r=>'Edition '+r.revision+' · '+r.title],
    ['review-return',reviews.returns,r=>r.id,r=>r.summary.reviewer+' · '+r.summary.label+' · revision '+r.summary.revision]
   ]){
    const previous=$(id).value;$(id).innerHTML=rows.map(row=>'<option value="'+escape(value(row))+'">'+escape(label(row))+'</option>').join('');
    if(rows.some(row=>value(row)===previous))$(id).value=previous;
   }
   $('review-packages').innerHTML=reviews.packages.map(row=>'<article><h3>'+escape(row.label)+'</h3><p>'+escape(row.recipient)+' · '+escape(row.created_at)+'</p><p class="muted">'+escape(row.id)+'</p>'+
    Object.keys(row.files).map(name=>'<button data-package="'+escape(row.id)+'" data-review-file="'+escape(name)+'">Download '+escape(name)+'</button>').join('')+'</article>').join('')||'<p>No customer review package has been created.</p>';
   $('review-resolution-history').innerHTML=reviews.resolutions.slice().reverse().map(row=>'<details><summary>Draft revision '+row.revision+' · '+escape(row.created_at)+'</summary><pre>'+escape(pretty(row))+'</pre></details>').join('')||'<p>No customer dispositions have been saved.</p>';
   await pendingView();
  }
 };
}
