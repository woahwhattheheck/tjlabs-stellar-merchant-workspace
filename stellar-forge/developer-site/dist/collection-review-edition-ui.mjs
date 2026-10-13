// MIT. Source-edition decisions live in the original browser draft and pending writer.
import { collectionEditionReport,prepareCollectionEditionRequest,canonical } from './collection-review-workspace.mjs';
import { emptyEditionDecision } from './collection-review-editions.mjs';
import { renderCollectionEditionComparison } from './collection-review-edition-report.mjs';
const clone=value=>structuredClone(value),$=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const same=(a,b)=>canonical(a)===canonical(b);
export function mountCollectionEditionReview({read,changed,act,render:renderMain,saveRequest,preserveDraft,download,say}){
 let renderSequence=0;
 const action=fn=>()=>act(fn),plan=()=>read().draft?.edition||null;
 function changedPlan(){const p=plan();if(p)p.prepared=null;$('edition-preview').hidden=true;changed();}
 function usable(){
  const s=read();if(!s.workspace)throw Error('Open the original workspace.');
  if(s.pending)throw Error('Recover the original pending save before preparing another edition.');
  if(s.draft.rawText!==null)throw Error('Apply or preserve the unfinished raw JSON before comparing source editions.');
  return s;
 }
 function current(p){const s=usable();if(s.draft.baseRevision!==p.baseRevision||!same(s.draft.state,p.basisState))throw Error('The working review changed after this comparison. Refresh the comparison from the current draft; all mapping choices remain for review.');return s;}
 function sources(p){const s=read();return {from:s.workspace.sources.find(x=>x.id===p.fromSourceId),to:s.workspace.sources.find(x=>x.id===p.toSourceId)};}
 async function report(p){return collectionEditionReport(read().workspace,{baseRevision:p.baseRevision,state:p.basisState,fromSourceId:p.fromSourceId,toSourceId:p.toSourceId,decisions:p.decisions});}
 function target(p,d,id){if(id&&p.decisions.some(x=>x!==d&&x.action==='map'&&x.toId===id))throw Error('That replacement occurrence is already mapped. Resolve the other correspondence first.');d.action=id?'map':'unresolved';d.toId=id||null;if(!id)for(const key of ['carryReview','carryRights','carryStory','carryRelationships'])d[key]=false;changedPlan();}
 function sourceSelect(id,items,selected){const el=$(id);el.replaceChildren(new Option('Choose a retained source edition',''));for(const s of items)el.add(new Option(s.institution.title+' · '+s.source.observedAt+' · '+s.source.sha256.slice(0,12),s.id));el.value=selected||'';}
 async function start(){
  const s=usable(),fromSourceId=$('edition-from').value,toSourceId=$('edition-to').value;
  if(!fromSourceId||!toSourceId)throw Error('Choose the selected earlier source and a retained replacement.');
  const draft={schema:'stellar-forge.collection-edition-draft.v1',fromSourceId,toSourceId,baseRevision:s.draft.baseRevision,basisState:clone(s.draft.state),decisions:[],offset:0,query:'',prepared:null};
  const comparison=await report(draft);draft.decisions=comparison.rows.map(row=>emptyEditionDecision(row.from.id));
  if(s.draft.edition){if(!confirm('Retain this unfinished comparison in working-copy history and start the new comparison?'))return;await preserveDraft();}
  s.draft.edition=draft;changed();await render();say('Compared complete retained sources. Choose each correspondence and the work to carry.');
 }
 async function render(){
  const sequence=++renderSequence,s=read(),draft=s.draft;if(!s.workspace)return;const p=plan(),selected=new Set(s.draft.state.collectionIds);
  sourceSelect('edition-from',s.workspace.sources.filter(x=>selected.has(x.id)),p?.fromSourceId);
  sourceSelect('edition-to',s.workspace.sources.filter(x=>!selected.has(x.id)),p?.toSourceId);
  $('edition-work').hidden=!p;if(!p)return;
  const comparison=await report(p);if(sequence!==renderSequence||read().draft!==draft||plan()!==p)return;
  const pair=sources(p),byId=new Map(pair.to.entries.map(e=>[e.id,e]));
  $('edition-query').value=p.query||'';
  $('edition-summary').textContent=comparison.counts.before+' earlier / '+comparison.counts.after+' replacement occurrences · '+comparison.counts.mapped+' mapped · '+comparison.counts.omitted+' omitted · '+comparison.counts.unresolved+' unresolved · '+comparison.counts.added+' currently unmatched replacement occurrences. '+comparison.counts.ambiguous+' rows have ambiguous suggestions.'+(comparison.preparationError?' '+comparison.preparationError:'');
  const dirty=s.draft.baseRevision!==p.baseRevision||!same(s.draft.state,p.basisState);
  $('edition-basis').textContent=dirty?'The main draft changed. Refresh this comparison before saving.':'This comparison is bound to the retained draft snapshot and its saved basis.';
  $('edition-metadata').textContent=JSON.stringify(comparison.metadataChanges,null,2);
  const q=(p.query||'').toLowerCase(),rows=comparison.rows.filter(r=>!q||[r.from.ordinal,r.from.title,r.from.url,r.decision.note].join(' ').toLowerCase().includes(q));
  p.offset=Math.max(0,Math.min(p.offset||0,Math.max(0,Math.floor((rows.length-1)/20)*20)));
  const shown=rows.slice(p.offset,p.offset+20),root=$('edition-rows');root.replaceChildren();
  for(const row of shown){
   const d=p.decisions.find(x=>x.fromId===row.from.id),box=node('article');box.className='edition-row';
   box.append(node('h4',row.from.ordinal+' · '+row.from.title),node('p',row.from.url));
   const actionSelect=node('select');for(const [value,label]of [['unresolved','Choose a correspondence'],['map','Map to one replacement occurrence'],['omit','Omit from this new review']])actionSelect.add(new Option(label,value));actionSelect.value=d.action;actionSelect.setAttribute('aria-label','Decision for occurrence '+row.from.ordinal);
   actionSelect.onchange=()=>{if(read().busy)return;if(actionSelect.value==='map'){d.action='unresolved';d.toId=null;for(const k of ['carryReview','carryRights','carryStory','carryRelationships'])d[k]=false;say('Choose an exact target below.');}else{d.action=actionSelect.value;d.toId=null;for(const k of ['carryReview','carryRights','carryStory','carryRelationships'])d[k]=false;}changedPlan();render().catch(e=>say(e.message,true));};
   const targetSelect=node('select');targetSelect.add(new Option('Select a suggested target',''));
   for(const e of row.candidates)targetSelect.add(new Option(e.ordinal+' · '+e.title+' ['+e.match+']',e.id));
   if(d.toId&&!row.candidates.some(e=>e.id===d.toId)){const e=byId.get(d.toId);targetSelect.add(new Option(e.ordinal+' · '+e.title+' [explicit]',e.id));}
   targetSelect.value=d.toId||'';targetSelect.setAttribute('aria-label','Replacement for occurrence '+row.from.ordinal);
   targetSelect.onchange=()=>{if(read().busy)return;try{target(p,d,targetSelect.value);}catch(error){targetSelect.value=d.toId||'';say(error.message,true);}render().catch(e=>say(e.message,true));};
   const ordinal=node('input');ordinal.type='number';ordinal.min='1';ordinal.max=String(pair.to.entries.length);ordinal.placeholder='Exact replacement ordinal';ordinal.setAttribute('aria-label','Exact replacement ordinal for '+row.from.ordinal);
   const select=node('button','Select ordinal');select.type='button';select.onclick=action(async()=>{const n=Number(ordinal.value),e=pair.to.entries.find(x=>x.ordinal===n);if(!e)throw Error('Choose a replacement ordinal from 1 through '+pair.to.entries.length+'.');target(p,d,e.id);await render();});
   box.append(actionSelect,targetSelect,ordinal,select);
   if(row.candidateCount>50)box.append(node('p','Showing 50 of '+row.candidateCount+' suggestions. Select any other target by its original ordinal.'));
   if(row.selected)box.append(node('p','Replacement '+row.selected.ordinal+' · '+row.selected.title+'\n'+row.selected.url),node('pre',JSON.stringify(row.changes,null,2)));
   const controls=node('div');controls.className='edition-carry';
   for(const [key,label]of [['carryReview','Editorial fields'],['carryRights','Recorded rights and basis'],['carryStory','Story position'],['carryRelationships','Relationship endpoints']]){
    const l=node('label'),c=node('input');c.type='checkbox';c.checked=d[key];c.disabled=d.action!=='map'||(['carryRights','carryStory'].includes(key)&&!d.carryReview)||(key==='carryStory'&&(!p.basisState.story.order.includes(d.fromId)||row.previousReview?.status!=='include'));c.onchange=()=>{if(read().busy)return;d[key]=c.checked;if(key==='carryReview'&&!c.checked){d.carryRights=false;d.carryStory=false;}changedPlan();render().catch(e=>say(e.message,true));};l.append(c,node('span',label));controls.append(l);
   }
   const note=node('textarea');note.rows=2;note.value=d.note;note.placeholder='Basis for this correspondence or omission';note.setAttribute('aria-label','Correspondence note for '+row.from.ordinal);note.oninput=()=>{if(read().busy)return;d.note=note.value;changedPlan();};
   const prior=node('details');prior.append(node('summary','Original editorial review'),node('pre',JSON.stringify(row.previousReview,null,2)));
   box.append(controls,note,prior);root.append(box);
  }
  $('edition-page').textContent=(rows.length?p.offset+1:0)+'–'+Math.min(p.offset+20,rows.length)+' of '+rows.length;
  $('edition-previous').disabled=p.offset===0;$('edition-next').disabled=p.offset+20>=rows.length;
  const preview=$('edition-preview');preview.hidden=!p.prepared;
  if(p.prepared){$('edition-effects').textContent=JSON.stringify(p.prepared.report.effects,null,2);$('edition-request').textContent='Original request '+p.prepared.request.id+' · '+p.prepared.request.sourceEdition.planSha256;}
 }
 $('edition-start').onclick=action(start);
 $('edition-refresh').onclick=action(async()=>{const s=usable(),p=plan();if(!p)throw Error('Start a comparison.');await collectionEditionReport(s.workspace,{baseRevision:s.draft.baseRevision,state:s.draft.state,fromSourceId:p.fromSourceId,toSourceId:p.toSourceId,decisions:p.decisions});p.basisState=clone(s.draft.state);p.baseRevision=s.draft.baseRevision;changedPlan();await render();});
 $('edition-exact').onclick=action(async()=>{const p=plan();current(p);const c=await report(p),used=new Set(p.decisions.filter(d=>d.action==='map').map(d=>d.toId));let count=0;
  for(const row of c.rows){const d=p.decisions.find(x=>x.fromId===row.from.id),e=row.candidates.find(x=>x.match==='exact');if(d.action==='unresolved'&&row.exactUnique&&e&&!used.has(e.id)){Object.assign(d,{action:'map',toId:e.id,carryReview:true,carryRights:false,carryStory:p.basisState.story.order.includes(d.fromId),carryRelationships:true,note:'Explicitly selected unique literal title and URL correspondence; rights require separate review.'});used.add(e.id);count++;}}
  changedPlan();await render();say('Selected '+count+' unique literal matches. Review their carry choices; recorded rights remain unknown by default.');});
 $('edition-query').oninput=()=>{if(read().busy)return;const p=plan();if(p){p.query=$('edition-query').value;p.offset=0;changed();render().catch(e=>say(e.message,true));}};
 for(const [id,amount]of [['edition-previous',-20],['edition-next',20]])$(id).onclick=action(async()=>{plan().offset+=amount;changed();await render();});
 $('edition-download').onclick=action(async()=>{const p=plan();if(!p)throw Error('Start a comparison.');download('collection-edition-comparison.html',renderCollectionEditionComparison(p.prepared?.report||await report(p)),'text/html');});
 $('edition-prepare').onclick=action(async()=>{const p=plan(),s=current(p);
  if(p.prepared&&(p.prepared.request.actor!==s.draft.actor||p.prepared.request.note!==s.draft.note))p.prepared=null;
  if(!p.prepared)p.prepared=await prepareCollectionEditionRequest(s.workspace,{id:crypto.randomUUID(),expectedRevision:p.baseRevision,actor:s.draft.actor,note:s.draft.note,createdAt:new Date().toISOString(),state:p.basisState,fromSourceId:p.fromSourceId,toSourceId:p.toSourceId,decisions:p.decisions});
  changed();await render();say('Prepared the exact source-edition request. Review the full comparison and listed effects before saving.');});
 $('edition-save').onclick=action(async()=>{const p=plan(),s=current(p);if(!p.prepared)throw Error('Prepare and review the complete correspondence first.');if(p.prepared.request.actor!==s.draft.actor||p.prepared.request.note!==s.draft.note)throw Error('The operator or revision note changed. Prepare and review the revised request first.');if(!confirm('Save this reviewed source edition with the displayed carry and omission decisions?'))return;await saveRequest(clone(p.prepared.request));await renderMain();});
 return {render};
}
