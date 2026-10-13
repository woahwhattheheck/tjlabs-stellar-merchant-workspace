// MIT. Read-only cross-reviewer comparison; adoption stays in the existing return controller.
import {exportAuthorWorklist} from '/recipient/author-worklist.mjs';
import {validateAuthorDecisionMatrix} from '/recipient/author-matrix.mjs';
import {sha256Utf8} from '/recipient/sha256.mjs';
export function createAuthorMatrixPanel({container,element,getValue,getCatalog,getWorkspaceId,getActivity,capture,preview,openReturn,isHeld,download,report,onBusy}){
 const link=element('link',undefined,{rel:'stylesheet',href:'/catalog-author-matrix.css'});container.append(link);
 const section=element('section',undefined,{id:'author-matrix','aria-label':'Cross-reviewer decision matrix'});
 section.innerHTML='<h3>Compare reviewers</h3><p class="help">Compare every retained return for the selected catalogue against one read-only snapshot. A missing proposal means no review was recorded; it never means Keep current. Every return stays separately attributed.</p>'+
 '<div class="actions"><button id="author-matrix-build" type="button">Refresh cross-reviewer matrix</button><button id="author-matrix-download" type="button">Download complete decision matrix</button></div>'+
 '<p id="author-matrix-status" role="status">Refresh after opening the complete worklist and selecting its catalogue.</p>'+
 '<div class="two-column"><label>Find customer or material<input id="author-matrix-search" type="search"></label>'+
 '<label>Reviewer return<select id="author-matrix-reviewer"><option value="">All returns</option></select></label>'+
 '<label>Decision view<select id="author-matrix-filter"><option value="all">All contexts</option><option value="disagreement">Different proposals</option><option value="stale">Changed original basis</option><option value="missing">Missing reviewer proposals</option><option value="blocked">Blocked original source</option></select></label></div>'+
 '<div class="actions"><button id="author-matrix-previous" type="button">Previous contexts</button><button id="author-matrix-next" type="button">Next contexts</button></div>'+
 '<p id="author-matrix-count"></p><div id="author-matrix-results"></div>';
 container.append(section);const $=id=>section.querySelector('#'+id);
 let matrix=null,selected=null,bound=null,busy=false,epoch=0,page=0,failure=null;
 const binding=()=>JSON.stringify({workspace:getWorkspaceId(),catalog:getCatalog(),activity:getActivity()});
 const current=()=>Boolean(matrix&&selected===getValue()&&bound===binding());
 function labelIdentity(value){const span=element('span',undefined,{class:'author-matrix-identity'});span.textContent=String(value??'—');return span;}
 function details(title,value){const d=element('details');d.append(element('summary',title));d.addEventListener('toggle',()=>{if(d.open&&!d.querySelector('pre'))d.append(element('pre',JSON.stringify(value,null,2)));});return d;}
 function refreshButtons(){const held=busy||isHeld();$('author-matrix-build').disabled=held||!getValue()||!getCatalog();
  $('author-matrix-download').disabled=busy||!matrix;
  for(const id of ['author-matrix-search','author-matrix-reviewer','author-matrix-filter'])$(id).disabled=held||!matrix;
  return held;
 }
 function render(){
  const held=refreshButtons(),fresh=current(),target=$('author-matrix-results');target.replaceChildren();
  if(!matrix){$('author-matrix-count').textContent='';$('author-matrix-previous').disabled=true;$('author-matrix-next').disabled=true;return;}
  const sum=matrix.summary;
  $('author-matrix-status').textContent=(failure?'Refresh failed: '+failure+' Previous complete snapshot remains available. ':'')+
   (fresh?'Observed selected worklist':'Retained earlier snapshot — refresh before opening a return')+
   ' · catalogue revision '+matrix.catalog.revision+' · '+matrix.observedAt+' · '+sum.returns+' returns / '+sum.contexts+' contexts / '+sum.disagreements+' different proposals / '+sum.staleBases+' changed bases / '+sum.blockedReturns+' blocked returns. Decisions are rechecked when a receiving request is applied.';
  const chosen=$('author-matrix-reviewer').value,query=$('author-matrix-search').value.trim().toLowerCase(),filter=$('author-matrix-filter').value;
  const byId=new Map(matrix.returns.map(x=>[x.returnId,x]));
  const rows=matrix.rows.filter(row=>(!chosen||row.proposals.some(x=>x.returnId===chosen))&&
   (filter==='all'||filter==='disagreement'&&row.disagreement||filter==='stale'&&row.staleBasis||filter==='missing'&&row.absentReturnIds.length||filter==='blocked'&&row.blocked)&&
   (!query||JSON.stringify([row.customerId,row.description,row.proposals.map(x=>[byId.get(x.returnId).reviewer,x.proposal.material.materialId,x.proposal.material.description,x.proposal.note])]).toLowerCase().includes(query)));
  page=Math.min(page,Math.max(0,Math.ceil(rows.length/20)-1));$('author-matrix-count').textContent=rows.length+' contexts · page '+(page+1)+' of '+Math.max(1,Math.ceil(rows.length/20));
  $('author-matrix-previous').disabled=held||page===0;$('author-matrix-next').disabled=held||(page+1)*20>=rows.length;
  for(const row of rows.slice(page*20,page*20+20)){
   const article=element('article',undefined,{'data-author-matrix-context':row.id});
   article.append(element('h4',row.customerId+' · '+row.description),
    element('p',(row.disagreement?'Different reviewer proposals. ':'')+(row.staleBasis?'An original material or decision basis changed. ':'')+(row.blocked?'An original source cannot be verified. ':'')));
   const now=element('section',undefined,{class:'author-matrix-current'});
   now.append(element('h5','Author decision at this observation'),element('p',row.currentObserved?(row.current?row.current.status+' · '+row.current.materialId+' · '+row.current.note:'No author decision recorded.'):'Not observed: all original returns for this context are blocked.'),details('Complete observed author decision',row.current));article.append(now);
   const cards=element('div',undefined,{class:'author-matrix-proposals'});
   for(const cell of row.proposals){
    const returned=byId.get(cell.returnId),card=element('section',undefined,{'data-author-matrix-return':cell.returnId});
    card.append(element('h5',returned.reviewer+' · '+returned.reviewId),labelIdentity(cell.returnId),
     element('p','Proposed '+cell.proposal.status+' · '+cell.proposal.material.materialId),
     element('p',cell.proposal.note||'No proposal note.'),
     element('p','Original catalogue revision '+returned.base.catalog.revision+' / edition '+returned.base.edition.id),
     element('p',cell.reason),
     element('p','Saved author choice: '+(cell.authorChoice||'not chosen')+(cell.authorChoice?(cell.choiceMatchesObservation?' · exact observed comparison':' · earlier comparison; choose again before receiving'):'')+'. '+returned.historicalDrafts+' earlier drafts / '+returned.requests.length+' saved requests / '+returned.outcomes.length+' outcomes.'));
    card.append(details('Complete original proposal and basis',{proposal:cell.proposal,originalDecision:cell.originalDecision,currentMaterial:cell.currentMaterial,base:returned.base}),
     details('Saved request and outcome identities',{requests:returned.requests,outcomes:returned.outcomes}));
    const button=element('button','Open this return for reviewed receiving',{type:'button','data-author-matrix-open':cell.returnId});button.disabled=held||!fresh;
    button.addEventListener('click',()=>{if(!current()||busy||isHeld()){report('The selected worklist or catalogue changed. Refresh the complete matrix.',true);render();return;}
     try{openReturn(cell.returnId);render();}catch(error){report(error.message,true);}});
    card.append(button);cards.append(card);
   }
   article.append(cards);
   if(row.absentReturnIds.length){const absent=element('details');absent.append(element('summary',row.absentReturnIds.length+' returns have no proposal for this context'));
    const list=element('ul');for(const id of row.absentReturnIds){const item=byId.get(id),li=element('li');li.append(document.createTextNode(item.reviewer+' · '+item.reviewId+' · '),labelIdentity(id));list.append(li);}absent.append(element('p','No decision is inferred from absence.'),list);article.append(absent);}
   target.append(article);
  }
 }
 async function build(){
  if(busy||isHeld())return;
  try{capture({archivePrevious:true});}catch(error){report(error.message,true);return;}
  const value=getValue(),catalog=getCatalog();if(!value||!catalog)return;
  const mark=++epoch,original=binding();busy=true;failure=null;onBusy();render();$('author-matrix-status').textContent='Reading all retained returns against one original catalogue snapshot…';
  try{
   const raw=exportAuthorWorklist(value),identity=sha256Utf8(raw);
   const result=await preview(raw,catalog.id);
   if(mark!==epoch||value!==getValue()||original!==binding())throw Error('The workspace, catalogue or retained worklist changed during comparison. The previous complete matrix is preserved.');
   if(result.workspaceId!==getWorkspaceId()||result.inputSha256!==identity.sha256||result.catalog.id!==catalog.id||result.catalog.revision!==catalog.revision||result.catalog.activeEditionId!==catalog.activeEditionId)throw Error('The original catalogue changed. Reload its current selection before refreshing the matrix.');
   validateAuthorDecisionMatrix(value,result);matrix=result;selected=value;bound=original;page=0;
   const options=$('author-matrix-reviewer'),old=options.value;options.replaceChildren(element('option','All returns',{value:''}));
   for(const item of matrix.returns)options.append(element('option',item.reviewer+' · '+item.reviewId+' · '+item.returnId.slice(0,12),{value:item.returnId}));
   if(matrix.returns.some(x=>x.returnId===old))options.value=old;
  }catch(error){failure=error.message;report(error.message,true);if(!matrix)$('author-matrix-status').textContent='Matrix unavailable: '+error.message;}
  finally{busy=false;onBusy();render();}
 }
 $('author-matrix-build').addEventListener('click',()=>void build());
 $('author-matrix-download').addEventListener('click',()=>{if(matrix)download('Material_Decision_Matrix_'+matrix.catalog.id+'_'+matrix.sha256+'.json',JSON.stringify(matrix,null,2)+'\n');});
 for(const id of ['author-matrix-search','author-matrix-reviewer','author-matrix-filter'])$(id).addEventListener(id.endsWith('search')?'input':'change',()=>{page=0;render();});
 $('author-matrix-previous').addEventListener('click',()=>{page--;render();});$('author-matrix-next').addEventListener('click',()=>{page++;render();});
 return {render,busy:()=>busy};
}
