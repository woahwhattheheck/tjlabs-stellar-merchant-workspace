// MIT. Complete budget worksheet preparation and return review in the original console.
import * as W from './budget-worksheet-core.mjs';
export function createBudgetWorksheet(H){
 const {node,button,field,panel,table,rawDetails,showDialog,notice,failure,api,getContext,commitDraft,render,editable}=H;
 const clone=v=>JSON.parse(JSON.stringify(v)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const U={root:null,session:null,key:null,storageError:'',failedRaw:null,generation:0,busy:false,scenarioId:'',rowOffset:0,sourceOffset:0,record:null,view:'review',references:'nodes',referenceOffset:0};
 const empty=()=>({schema:'stellar-forge.grant-budget-worksheet-desk.v1',worksheet:null,review:null,exclusionDrafts:{}});
 const size=s=>new TextEncoder().encode(s).length;
 const token=c=>JSON.stringify({workspaceId:c.workspaceId,portfolioId:c.portfolioId,revision:c.revision,snapshot:c.snapshot,draft:c.draft});
 function current(){const c=getContext();if(!c)throw Error('Open the original portfolio.');return c;}
 function live(g,t){try{return g===U.generation&&U.root?.isConnected&&document.querySelector('#detail-dialog')?.open&&token(current())===t;}catch{return false;}}
 function persist(){
  if(U.failedRaw!==null){U.storageError='The earlier retained review is preserved. Download it or explicitly replace it before retaining this review.';return;}
  try{localStorage.setItem(U.key,JSON.stringify(U.session));U.storageError='';}catch{U.storageError='This browser could not retain the complete review. Download its JSON before leaving.';}
 }
 function download(name,value,type='application/json'){
  const body=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',url=URL.createObjectURL(new Blob([body],{type:type+'; charset=utf-8'})),a=node('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 async function checkSession(v){
  if(!v||v.schema!=='stellar-forge.grant-budget-worksheet-desk.v1'||Object.keys(v).some(k=>!['schema','worksheet','review','exclusionDrafts'].includes(k)))throw Error('Select the complete worksheet desk JSON.');
  const n=clone(v);if(!Object.hasOwn(n,'exclusionDrafts'))n.exclusionDrafts={};if(!n.exclusionDrafts||Array.isArray(n.exclusionDrafts)||typeof n.exclusionDrafts!=='object')throw Error('Retain the complete unsubmitted exclusion notes.');if(n.worksheet)n.worksheet=await W.receiveWorksheet(n.worksheet);if(n.review)n.review=await W.receiveReview(n.review);
  if(n.review&&(!n.worksheet||n.worksheet.sha256!==n.review.worksheet.sha256))throw Error('The returned source belongs to another original worksheet.');
  const sourceRows=n.review?new Set(W.parseTable(n.review.source.text,{delimiter:n.review.source.delimiter}).rows.map(r=>n.review.id+':'+r.record)):new Set();
  for(const [key,note]of Object.entries(n.exclusionDrafts))if(!sourceRows.has(key)||typeof note!=='string'||note.length>1000)throw Error('Retain each unsubmitted note on its original review and source row.');
  const w=n.worksheet,c=current();if(w&&(w.basis.workspaceId!==c.workspaceId||w.basis.portfolioId!==c.portfolioId))throw Error('Open this complete review in its original workspace and portfolio.');
  return n;
 }
 async function guarded(fn){
  if(U.busy)return;U.busy=true;const root=U.root;try{await fn();}catch(e){failure(e);}finally{U.busy=false;if(root===U.root&&root?.isConnected)await paint().catch(failure);}
 }
 function text(v){return v===null?'Unknown':v===undefined?'No prior value':typeof v==='object'?JSON.stringify(v):String(v);}
 function small(v){return node('p',v,'small');}
 function actionBar(...children){const box=node('div',null,'actions');box.append(...children);return box;}
 function boundedTable(heads,rows,offset,onPage,cells,pageSize=25){
  const wrap=node('div',null,'budget-worksheet-grid'),shown=rows.slice(offset,offset+pageSize);
  wrap.append(table(heads,shown.map(cells)));const prev=button('Previous',()=>onPage(Math.max(0,offset-pageSize))),next=button('Next',()=>onPage(offset+pageSize));
  prev.disabled=U.busy||offset===0;next.disabled=U.busy||offset+shown.length>=rows.length;
  wrap.append(actionBar(prev,small(rows.length?(offset+1)+'–'+(offset+shown.length)+' of '+rows.length:'No rows'),next));return wrap;
 }
 function originalDownloads(section,w){
  section.append(actionBar(button('Download original worksheet CSV',()=>download(w.csv.filename,w.csv.text,'text/csv')),button('Download original basis JSON',()=>download('budget-worksheet-'+w.id+'.json',w))));
 }
 function reviewHtml(s,p){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const grid=(heads,rows)=>'<table><thead><tr>'+heads.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(text(v))+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  let body='<h1>Budget worksheet review</h1><p>'+esc(s.source.name)+'</p><p>Source '+esc(s.source.sha256)+'; original portfolio '+esc(p.basis.portfolioId)+' revision '+p.basis.revision+'.</p>';
  body+=grid(['Source rows','Added','Edited','Archived','Excluded','Unchanged'],[[p.summary.sourceRows,p.summary.added,p.summary.edited,p.summary.archived,p.summary.excluded,p.summary.unchanged]]);
  for(const r of p.rows){body+='<h2>Source record '+r.record+' · '+esc(r.id)+' · '+esc(r.status)+'</h2>';if(r.reason)body+='<p>'+esc(r.reason)+'</p>';body+=grid(['Field','Current value','Reviewed value'],r.changes.map(x=>[x.field,x.before,x.after]));for(const e of r.errors)body+='<p>'+esc(e)+'</p>';}
  body+='<h2>Conflict decisions</h2>'+grid(['Field','Original export','Returned value','Current value','Decision'],p.conflicts.map(x=>[x.key,x.base,x.returned,x.current,x.decision||'Unresolved']));
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Budget worksheet review</title><style>body{font:14px system-ui;margin:32px;color:#181818}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}h2{break-after:avoid}@media print{body{margin:0}tr{break-inside:avoid}}</style>'+body+'</html>';
 }
 async function prepare(){
  if(U.session.worksheet||U.failedRaw!==null){U.view='replace';await paint();return;}
  await createPrepared();
 }
 async function createPrepared(){
  const c=current(),g=++U.generation,t=token(c);
  const w=await W.prepareWorksheet(c,{scenarioId:U.scenarioId});
  if(!live(g,t))return;U.session={...empty(),worksheet:w};U.failedRaw=null;U.view='review';U.record=null;persist();notice('The complete original worksheet is prepared. Keep its basis JSON with the returned spreadsheet.');
 }
 async function readFile(file,kind){
  if(!file)return;if(file.size>16*1024*1024)throw Error('Select a complete review up to 16 MiB.');
  const g=++U.generation,c=current(),t=token(c),originalSession=JSON.stringify(U.session),buf=await file.arrayBuffer();
  if(!live(g,t)||JSON.stringify(U.session)!==originalSession)return;
  const source=W.decodeSource(new Uint8Array(buf));
  if(kind==='session'){
   const value=JSON.parse(source),incoming=value.schema===W.WORKSHEET_SCHEMA?{...empty(),worksheet:value}:value;
   const checked=await checkSession(incoming);if(!live(g,t)||JSON.stringify(U.session)!==originalSession)return;
   if(U.session.worksheet){U.pendingReceive=checked;U.view='replace-receive';return;}
   U.session=checked;U.failedRaw=null;U.record=null;U.view='review';persist();return;
  }
  if(!U.session.worksheet)throw Error('Prepare or receive the original worksheet basis before opening its returned CSV.');
  if(U.session.review){U.pendingSource={text:source,name:file.name};U.view='replace-source';return;}
  const selected=await W.startReview(U.session.worksheet,{text:source,name:file.name,delimiter:U.delimiter||','});
  if(!live(g,t)||JSON.stringify(U.session)!==originalSession)return;U.session.review=selected;U.session.exclusionDrafts={};U.rowOffset=U.sourceOffset=0;U.record=null;persist();
 }
 async function replaceSource(){
  const p=U.pendingSource;if(!p)return;const c=current(),g=++U.generation,t=token(c),w=U.session.worksheet;
  const s=await W.startReview(w,{...p,delimiter:U.delimiter||','});if(!live(g,t)||U.session.worksheet!==w)return;
  U.session.review=s;U.session.exclusionDrafts={};delete U.pendingSource;U.rowOffset=U.sourceOffset=0;U.record=null;U.view='review';persist();
 }
 async function stage(p){
  if(!editable())throw Error('Select the latest editable portfolio revision before staging.');
  const c=current(),g=++U.generation,t=token(c),expectedDraft=clone(c.draft),s=U.session.review;
  const result=await W.stageWorksheet(s,c,{actor:c.actor,expectedContextSha256:p.contextSha256});
  if(!live(g,t)||U.session.review!==s)return;
  await W.verifyWorksheetDocuments(result.draft);if(!live(g,t)||U.session.review!==s)return;
  const originalKey=U.key;await commitDraft(result.draft,{basis:result.review.basis,expectedDraft});
  if(U.key!==originalKey||U.session.review!==s)return;
  U.session.review=result.session;U.record=null;persist();
  notice('The entire reviewed worksheet and complete original source are staged together. Use Save complete draft to commit their original portfolio operation.');
  await render();await paint();
 }
 function readControls(section){
  const incoming=field('Receive original basis or complete review JSON','file');incoming.input.accept='.json,application/json';incoming.input.disabled=U.busy;
  incoming.input.addEventListener('change',()=>{const file=incoming.input.files[0];incoming.input.value='';guarded(()=>readFile(file,'session'));});
  section.append(incoming.wrapper);
  if(U.session.worksheet){
   const delimiter=field('Returned source delimiter','select',U.delimiter||',',[[',','Comma CSV'],['\t','Tab TSV'],[';','Semicolon'],['|','Pipe']]);
   delimiter.input.disabled=U.busy||!!U.session.review;delimiter.input.addEventListener('change',()=>{U.delimiter=delimiter.input.value;});
   const returned=field('Open returned UTF-8 CSV or TSV','file');returned.input.accept='.csv,.tsv,.txt,text/csv,text/tab-separated-values';returned.input.disabled=U.busy;
   returned.input.addEventListener('change',()=>{const file=returned.input.files[0];returned.input.value='';guarded(()=>readFile(file,'source'));});section.append(delimiter.wrapper,returned.wrapper);
  }
 }
 function confirmation(root){
  const p=panel('Preserve the current complete review','Download this review before explicitly replacing it. Saved portfolio records and earlier native document editions remain retained.');
  p.append(button('Download current complete review',()=>download('budget-worksheet-review.json',U.session)),button('Keep current review',()=>{U.view='review';delete U.pendingReceive;delete U.pendingSource;paint().catch(failure);}));
  if(U.view==='replace')p.append(button('Prepare selected scenario instead',()=>guarded(createPrepared)));
  if(U.view==='replace-receive')p.append(button('Receive selected complete JSON',()=>guarded(async()=>{U.session=U.pendingReceive;delete U.pendingReceive;U.failedRaw=null;U.view='review';U.record=null;persist();})));
  if(U.view==='replace-source')p.append(button('Review selected returned source',()=>guarded(replaceSource)));
  root.append(p);
 }
 function mappingView(root,s){
  const parsed=W.parseTable(s.source.text,{delimiter:s.source.delimiter}),section=panel('Column mapping','Exact header matches are selected initially. Unmapped fields of original rows remain unchanged; blank mapped amounts remain unknown. New rows need their complete required fields.');
  const fields=node('div',null,'form-grid');
  for(const k of W.HEADERS){const item=field(k,'select',s.mapping[k]==null?'':String(s.mapping[k]),[['','Not supplied'],...parsed.headings.map((h,i)=>[String(i),(i+1)+': '+h])]);
   item.input.disabled=U.busy||s.status!=='review';item.input.addEventListener('change',()=>guarded(async()=>{const mapping={...U.session.review.mapping,[k]:item.input.value===''?null:Number(item.input.value)};U.session.review=W.remapReview(U.session.review,mapping);U.record=null;persist();}));fields.append(item.wrapper);}
  section.append(fields);root.append(section);
  const source=panel('Complete retained source','Every original field remains here, including columns not mapped to a budget field. Quoted newlines, BOM and original line endings remain in the source download.');
  source.append(boundedTable(['Record','Source line',...parsed.headings],parsed.rows,U.sourceOffset,n=>{U.sourceOffset=n;paint().catch(failure);},r=>[r.record,r.line,...r.cells],15));
  source.append(button('Download exact returned source',()=>download(s.source.name,s.source.text,s.source.delimiter==='\t'?'text/tab-separated-values':'text/csv')));root.append(source);
 }
 function rowDetail(root,s,p,r){
  const section=panel('Source record '+r.record,r.id+' · source line '+r.line+' · '+r.status);
  section.append(button('Back to complete review',()=>{U.record=null;paint().catch(failure);}));
  if(r.errors.length)section.append(...r.errors.map(x=>node('p',x,'coverage')));
  const conflicts=p.conflicts.filter(x=>x.key.startsWith(r.id+'/'));
  for(const conflict of conflicts){const box=node('fieldset');box.append(node('legend',conflict.key.slice(r.id.length+1)),table(['Original exported value','Returned value','Current draft value'],[[text(conflict.base),text(conflict.returned),text(conflict.current)]]));
   const choice=field('Reviewed decision','select',conflict.decision||'',[['','Choose explicitly'],['current','Keep current draft value'],['returned','Use returned value']]);
   choice.input.disabled=U.busy||s.status!=='review';choice.input.addEventListener('change',()=>guarded(async()=>{if(choice.input.value)U.session.review=W.chooseConflict(U.session.review,conflict,choice.input.value);else{const next=clone(U.session.review);delete next.choices[conflict.key];U.session.review=next;}persist();}));box.append(choice.wrapper);section.append(box);}
  section.append(table(['Field','Current complete value','Reviewed complete value'],W.FIELDS.map(k=>[k,text(r.before?.[k]),text(r.after?.[k])])));
  const noteKey=s.id+':'+r.record,reason=field('Reason to exclude this returned source record','textarea',Object.hasOwn(U.session.exclusionDrafts,noteKey)?U.session.exclusionDrafts[noteKey]:s.excluded[r.record]||'');reason.input.disabled=s.status!=='review';reason.input.maxLength=1000;
  reason.input.addEventListener('input',()=>{U.session.exclusionDrafts[noteKey]=reason.input.value;persist();});
  section.append(reason.wrapper,button('Save exclusion or clear its reason',()=>guarded(async()=>{U.session.review=W.excludeRecord(U.session.review,r.record,reason.input.value);delete U.session.exclusionDrafts[noteKey];persist();})));
  section.append(rawDetails('Original source record and complete review',r));root.append(section);
 }
 function references(root,c){
  const section=panel('Original reference IDs','Use these existing program, grant, milestone and document IDs. The original native writer verifies their exact scope again on save.');
  const kind=field('Register','select',U.references,[['nodes','Programs and projects'],['grants','Grants'],['milestones','Milestones'],['documents','Documents']]);
  kind.input.addEventListener('change',()=>{U.references=kind.input.value;U.referenceOffset=0;paint().catch(failure);});section.append(kind.wrapper);
  const rows=c.programme[U.references]||[];section.append(boundedTable(['Name','ID','State','Scope'],rows,U.referenceOffset,n=>{U.referenceOffset=n;paint().catch(failure);},r=>[r.title||r.code||r.id,r.id,r.archived?'Archived':'Active',r.nodeId||r.projectId||r.parentId||'Portfolio']));
  root.append(section);
 }
 async function paint(){
  if(!U.root?.isConnected)return;const root=U.root,g=++U.generation,c=current(),t=token(c),s=U.session?.review,w=U.session?.worksheet;
  root.replaceChildren();root.classList.add('budget-planning');
  const intro=panel('Budget worksheet','Prepare a complete scenario, return its UTF-8 spreadsheet, review every changed field, then stage one original planning draft with its retained source.');
  intro.append(small('Current portfolio revision '+c.revision+' · planning '+c.planningRevision+' · program '+c.programmeRevision));
  if(U.busy)intro.append(node('p','Opening or preparing the complete source…','coverage'));
  if(U.failedRaw!==null)intro.append(node('p','An earlier browser review could not be opened. Its original text remains stored until you explicitly receive or prepare a replacement.','coverage'),button('Download earlier retained text',()=>download('retained-budget-worksheet.json',U.failedRaw)));
  if(U.storageError)intro.append(node('p',U.storageError,'coverage'));
  intro.append(actionBar(button('Prepare selected scenario worksheet',()=>guarded(prepare)),button('Download complete review JSON',()=>download('budget-worksheet-review.json',U.session)),button('Original reference IDs',()=>{U.view=U.view==='references'?'review':'references';paint().catch(failure);})));
  root.append(intro);
  if(U.view.startsWith('replace')){confirmation(root);return;}
  readControls(intro);
  if(w){const source=panel('Original worksheet',w.scenario.fields.code+' · '+w.scenario.fields.title+' · '+w.lines.length+' complete lines at portfolio revision '+w.basis.revision);
   source.append(small('Annual periods remain annual. An empty amount is unknown; 0 is a recorded zero. No formula evaluation, currency conversion or monthly distribution is performed.'));
   originalDownloads(source,w);root.append(source);}
  if(U.view==='references'){references(root,c);return;}
  if(!s){root.append(small('Keep the original ID and revision columns. Leave ID and revision blank for a new row. Removing a spreadsheet row never deletes a saved budget line.'));return;}
  if(s.status==='applied'){
   const applied=panel('Source staged in the original planning draft','This review has already been applied to a draft. Save or receive that original draft in Budget and forecast. Its source document and earlier portfolio history remain separate retained editions.');
   applied.append(rawDetails('Original staged application',s.applied),button('Download exact source CSV',()=>download(s.source.name,s.source.text,'text/csv')));root.append(applied);return;
  }
  const view=field('Review view','select',U.view,[['review','Changed rows and decisions'],['mapping','Columns and complete source']]);
  view.input.addEventListener('change',()=>{U.view=view.input.value;U.record=null;paint().catch(failure);});root.append(view.wrapper);
  if(U.view==='mapping'){mappingView(root,s);return;}
  let p;try{p=await W.reviewWorksheet(s,c);}catch(error){if(live(g,t)){root.append(node('p',error.message,'coverage'));mappingView(root,s);}return;}
  if(!live(g,t)||U.session.review!==s)return;
  if(U.record!==null){const r=p.rows.find(x=>x.record===U.record);if(r){rowDetail(root,s,p,r);return;}U.record=null;}
  const overview=panel('Complete returned review',p.summary.sourceRows+' source rows · '+p.summary.added+' additions · '+p.summary.edited+' edits · '+p.summary.archived+' archives · '+p.summary.excluded+' excluded · '+p.summary.unchanged+' unchanged');
  overview.append(small(p.errors.length+' source errors · '+p.unresolved+' unresolved conflicts. All rows are retained; pages only change what is displayed.'));
  if(p.staleChoices.length)overview.append(node('p',p.staleChoices.length+' earlier choices no longer match a current conflict and are not applied. Review the current decisions.','coverage'));
  const stageButton=button('Stage complete reviewed worksheet',()=>guarded(()=>stage(p)),'primary');stageButton.disabled=U.busy||!editable()||!p.canStage;
  overview.append(actionBar(stageButton,button('Download complete review result',()=>download('budget-worksheet-preview.json',p)),button('Download printable review',()=>download('budget-worksheet-review.html',reviewHtml(s,p),'text/html'))));
  root.append(overview);
  root.append(boundedTable(['Source record','Line','Action','Result','Fields','Errors / conflicts','Open'],p.rows,U.rowOffset,n=>{U.rowOffset=n;paint().catch(failure);},r=>[r.record,r.after?.code||r.before?.code||r.id,r.action,r.status,r.changes.map(x=>x.field).join(', '),r.errors.join(' ')||p.conflicts.filter(x=>x.key.startsWith(r.id+'/')&&!x.decision).length+' unresolved',button('Review row',()=>{U.record=r.record;paint().catch(failure);})]));
 }
 async function open(scenarioId){
  const c=current(),key='grant-budget-worksheet:'+c.workspaceId+':'+c.portfolioId,g=++U.generation,t=token(c);
  if(U.key!==key){
   let next=empty(),raw=null,error='';
   try{raw=localStorage.getItem(key);if(raw)next=await checkSession(JSON.parse(raw));}catch(e){error=e.message;}
   if(g!==U.generation||token(current())!==t)return;
   U.key=key;U.session=next;U.failedRaw=error?raw:null;U.storageError=error;
  }
  U.scenarioId=scenarioId;U.root=node('div');U.view='review';U.record=null;showDialog('Budget worksheet',[U.root]);await paint();
 }
 return {open};
}
