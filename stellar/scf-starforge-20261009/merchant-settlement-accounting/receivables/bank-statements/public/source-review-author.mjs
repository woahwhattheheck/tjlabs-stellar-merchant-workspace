// SPDX-License-Identifier: MIT
// Author controls beside the original configured-source desk; never dispatches a native mutation.
import {openSourceDeskState,listSourceReviewDesks} from './source-preparation-state.mjs';
import {createSourceReview,verifySourceReview,readSourceReviewBytes,newSourceReviewDesk,verifySourceReviewDesk,previewSourceReviewReturn,decideSourceReviewReturn,verifyDecisionReceipt,reviewBytes,retainedReviewFile,readRetainedReviewFile,verifySameIssue,REVIEW_DESK_SCHEMA,REVIEW_LIMITS} from './source-review-model.mjs';
import {verifyPreparationCapsuleBytes} from './source-preparation-capsule.mjs';
const clone=v=>structuredClone(v),json=v=>JSON.stringify(v,null,2);
function element(tag,text,attributes={}){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);for(const [key,value]of Object.entries(attributes))n.setAttribute(key,String(value));return n;}
function download(name,bytes){const url=URL.createObjectURL(new Blob([bytes],{type:'application/json'})),a=element('a','',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export function mountSourceReviewAuthor({root,workspaceId,selectedCapsule,openedCapsule,receiveDraft,lookupReceipt}){
 let S=null,db=null,revision=0,busy=false,blocked=false,tail=Promise.resolve(),localError=null,source=null,caseCursor=null,caseNext=null,casePrevious=[],rowPage=0,editVersion=0,savedVersion=0,saveTimer=null,renderEpoch=0;
 const ids={};function add(tag,id,text,attrs={}){const n=element(tag,text,attrs);if(id){n.id='review-author-'+id;ids[id]=n;}return n;}
 function status(text,error=false){ids.message.textContent=text;ids.message.setAttribute('role',error?'alert':'status');}
 function action(text,fn,{safe=false,id}={}){const b=add('button',id,text,{type:'button'});b.dataset.reviewEdit=safe?'safe':'edit';b.addEventListener('click',()=>run(fn));return b;}
 function field(label,id,tag='input',attrs={}){const l=element('label',label),n=add(tag,id,undefined,attrs);n.dataset.reviewEdit='edit';l.append(n);return l;}
 function controls(){
  for(const n of root.querySelectorAll('[data-review-edit="edit"]'))n.disabled=busy||blocked;
  for(const n of root.querySelectorAll('[data-review-edit="safe"]'))n.disabled=busy;
  ids.issue.disabled=busy||blocked||!source;ids.export.disabled=busy||!S;ids.working.disabled=busy||!S;ids.compare.disabled=busy||blocked||!S?.activeReturnSha256||!S?.activeCurrentSha256;
  ids.decide.disabled=busy||blocked||!S?.comparison||!ids.confirm.checked;ids.previous.disabled=busy||rowPage===0;ids.next.disabled=busy||!S?.comparison||((rowPage+1)*25>=changedRows().length);
  ids.caseBefore.disabled=busy||!casePrevious.length;ids.caseAfter.disabled=busy||!caseNext;ids.reopen.disabled=busy||!S;ids.keepAll.disabled=busy||blocked||!S?.comparison;
  ids.editor.hidden=!S;ids.connection.textContent=blocked?'Another editor saved this review. Your full local edition is retained as a conflict. Reopen the saved case or download this edition.':S?'Saved review · '+S.package.issue.recipient:'Choose a complete preparation or reopen a saved review.';
 }
 async function run(fn){try{return await fn();}catch(e){status((e.code?e.code+': ':'')+(e.message??String(e)),true);}finally{controls();}}
 function dirty(){
  editVersion++;localError=null;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{persist().catch(e=>status(e.message,true));},350);
 }
 async function flush(){clearTimeout(saveTimer);await persist();if(blocked||localError)throw localError??new Error('Reopen the saved review case.');}
 function persist(){
  clearTimeout(saveTimer);
  const next=tail.catch(()=>{}).then(async()=>{
   if(!S||editVersion===savedVersion)return;
   if(blocked){await db.preserveConflict(clone(S));throw localError??new Error('Reopen the saved review.');}
   while(editVersion!==savedVersion){
    const version=editVersion,snapshot=clone(S);reviewBytes(snapshot,REVIEW_LIMITS.workingBytes);
    try{const saved=await db.save(snapshot,revision);revision=saved.revision;S.revision=revision;savedVersion=version;localError=null;}
    catch(e){blocked=true;localError=e;controls();if(e.code!=='DRAFT_CONFLICT'||version!==editVersion)await db.preserveConflict(clone(S)).catch(()=>{});throw e;}
   }
  });tail=next;next.catch(e=>status(e.message,true));return next;
 }
 async function operation(fn,{recover=false}={}){
  if(busy)throw new Error('Wait for the current review operation.');busy=true;controls();
  try{clearTimeout(saveTimer);if(recover){if(!blocked&&editVersion!==savedVersion)await persist().catch(()=>{});else await tail.catch(()=>{});}else await flush();return await fn();}finally{busy=false;controls();}
 }
 function workspace(){const id=workspaceId();if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw new Error('Open the configured original accounting workspace before authoring or receiving a review.');return id;}
 function checkWorkspace(){if(S&&workspace()!==S.workspaceId)throw new Error('This author review belongs to another original accounting workspace.');}
 function selectStore(issue){return openSourceDeskState({workspaceId:issue.workspaceId,namespace:'source-review:'+issue.id,schema:REVIEW_DESK_SCHEMA});}
 function rememberDraft(state){if(state.comparison||Object.keys(state.choices??{}).length)(state.authorDraftHistory??=[]).push({returnSha256:state.activeReturnSha256,currentSha256:state.activeCurrentSha256,comparison:clone(state.comparison),choices:clone(state.choices),author:state.author,reason:state.reason});}
 async function saveCandidate(candidate){reviewBytes(candidate,REVIEW_LIMITS.workingBytes);S=candidate;editVersion++;await persist();render();}
 async function useSource(value){
  if(value.bytes.length>REVIEW_LIMITS.capsuleBytes)throw new Error('Issue a complete preparation up to 32 MiB in this browser review. Larger complete preparations remain available through the existing receiving route.');
  const checked=await verifyPreparationCapsuleBytes(value.bytes),expected=workspace();if(checked.receipt.workspaceId!==expected)throw new Error('The preparation is from another original accounting workspace.');
  source={name:value.name,bytes:value.bytes,receipt:checked.receipt};ids.source.textContent=value.name+' · '+value.bytes.length.toLocaleString()+' bytes · '+checked.sha256;controls();
 }
 async function issue(){
  return operation(async()=>{
   const expected=workspace(),selected=source;if(!selected)throw new Error('Select the exact complete source preparation.');
   const value=await createSourceReview({capsuleBytes:selected.bytes,capsuleName:selected.name,collectionFile:ids.collection.value.trim(),author:ids.author.value.trim(),recipient:ids.recipient.value.trim(),purpose:ids.purpose.value});
   if(workspace()!==expected)throw new Error('The connected workspace changed while reading the complete source.');
   const store=selectStore(value.issue),original=await store.read();if(original.package)throw new Error('That original review identity already exists.');
   const candidate=newSourceReviewDesk(value);candidate.currentSources=[clone(value.source)];candidate.activeCurrentSha256=value.source.sha256;candidate.author=value.issue.author;
   reviewBytes(candidate,REVIEW_LIMITS.workingBytes);const saved=await store.save(candidate,original.revision);db=store;S=saved;revision=saved.revision;blocked=false;localError=null;editVersion=0;savedVersion=0;render();await refreshCases();
   status('Complete issued source retained. Download the package or open the recipient workspace to create its standalone review application.');
  });
 }
 async function openCase(workspaceIdValue,caseId){
  return operation(async()=>{
   if(workspace()!==workspaceIdValue)throw new Error('Select a review belonging to this original accounting workspace.');
   const store=selectStore({workspaceId:workspaceIdValue,id:caseId}),saved=await store.read();if(!saved.package)throw new Error('The selected full review case is not retained here.');
   await verifySourceReviewDesk(saved);db=store;S=saved;revision=saved.revision;blocked=false;localError=null;editVersion=0;savedVersion=0;rowPage=0;render();status('Complete saved review reopened. Nothing was submitted to the native controller.');
  },{recover:true});
 }
 async function refreshCases(){
  const page=await listSourceReviewDesks({after:caseCursor,limit:20});caseNext=page.nextCursor;ids.cases.replaceChildren();
  for(const item of page.items){const p=element('p'),b=action(item.recipient+' · '+item.createdAt,()=>openCase(item.workspaceId,item.caseId),{safe:true});p.append(b,element('span',' · '+item.editions+' editions / '+item.returns+' returned files / '+item.decisions+' decisions'));ids.cases.append(p);}
  if(!page.items.length)ids.cases.append(element('p','No retained review cases on this page.'));controls();
 }
 async function receiveReturn(file){
  return operation(async()=>{
   checkWorkspace();if(!S)throw new Error('Open the original issued review first.');if(file.size>REVIEW_LIMITS.packageBytes)throw new Error('The complete review return exceeds 64 MiB.');
   const bytes=new Uint8Array(await file.arrayBuffer()),incoming=await readSourceReviewBytes(bytes);verifySameIssue(S.package,incoming.value);
   const original=await retainedReviewFile(file.name,bytes),candidate=clone(S);rememberDraft(candidate);
   if(!candidate.returns.some(x=>x.sha256===original.sha256))candidate.returns.push(original);candidate.activeReturnSha256=original.sha256;candidate.authorSelection={editionSha256:'',collectionFile:candidate.package.issue.collection.name};candidate.comparison=null;candidate.choices={};rowPage=0;
   await saveCandidate(candidate);status('The exact returned file and all reviewer editions are retained. Select a submitted edition and the current complete collection before comparing.');
  });
 }
 async function receiveCurrent(file){
  return operation(async()=>{
   checkWorkspace();if(!S)throw new Error('Open the issued review first.');if(file.size>REVIEW_LIMITS.capsuleBytes)throw new Error('The current complete preparation exceeds the 32 MiB review limit.');
   const bytes=new Uint8Array(await file.arrayBuffer()),checked=await verifyPreparationCapsuleBytes(bytes);if(checked.receipt.workspaceId!==S.workspaceId)throw new Error('This current preparation belongs to another accounting workspace.');
   const original=await retainedReviewFile(file.name,bytes,REVIEW_LIMITS.capsuleBytes),candidate=clone(S);rememberDraft(candidate);
   if(!candidate.currentSources.some(x=>x.sha256===original.sha256))candidate.currentSources.push(original);candidate.activeCurrentSha256=original.sha256;candidate.comparison=null;candidate.choices={};rowPage=0;
   await saveCandidate(candidate);status('The exact current preparation is retained. Compare its original collection with the issued and returned choices.');
  });
 }
 async function activeInputs(){
  checkWorkspace();if(!S)throw new Error('Open the issued review.');
  const returnedFile=S.returns.find(x=>x.sha256===S.activeReturnSha256),current=S.currentSources.find(x=>x.sha256===S.activeCurrentSha256);
  if(!returnedFile||!current)throw new Error('Choose the complete return and current preparation.');
  const returned=(await readSourceReviewBytes(await readRetainedReviewFile(returnedFile))).value,currentCapsuleBytes=await readRetainedReviewFile(current,REVIEW_LIMITS.capsuleBytes);
  return {issued:S.package,returned,currentCapsuleBytes,collectionFile:S.authorSelection?.collectionFile??S.package.issue.collection.name,editionSha256:S.authorSelection?.editionSha256??''};
 }
 async function compare(){
  return operation(async()=>{const args=await activeInputs(),comparison=await previewSourceReviewReturn(args),candidate=clone(S);rememberDraft(candidate);candidate.comparison=comparison;candidate.choices={};rowPage=0;await saveCandidate(candidate);status('Complete issued/current/returned comparison saved. Every changed reviewer field needs an explicit keep or adopt choice.');});
 }
 function changedRows(){return S?.comparison?.rows.filter(x=>x.proposedChanged)??[];}
 async function decide(){
  return operation(async()=>{
   if(!ids.confirm.checked||!S?.comparison)throw new Error('Review the explicit choices first.');
   const args=await activeInputs(),decision=await decideSourceReviewReturn({...args,expectedComparisonSha256:S.comparison.sha256,choices:S.choices,actor:S.author,reason:S.reason}),candidate=clone(S);
   candidate.decisions.push({returnSha256:S.activeReturnSha256,currentSha256:S.activeCurrentSha256,decision});await saveCandidate(candidate);ids.confirm.checked=false;
   status(decision.request?'Author choices saved with a fresh unsent original collection_edit request. Open that draft in the source desk when ready.':'Author choices saved. No collection edit was needed.');
  });
 }
 async function handoff(entry){
  return operation(async()=>{
   checkWorkspace();await verifySourceReviewDesk(S);if(!entry.decision.request)throw new Error('This author decision needs no edit request.');
   await receiveDraft(clone(entry.decision.request),{caseId:S.caseId,decisionId:entry.decision.id,decisionSha256:entry.decision.sha256,returnSha256:entry.returnSha256,currentSha256:entry.currentSha256});
   const candidate=clone(S);candidate.handoffs??=[];if(!candidate.handoffs.some(x=>x.decisionId===entry.decision.id))candidate.handoffs.push({decisionId:entry.decision.id,requestId:entry.decision.request.requestId,at:new Date().toISOString()});await saveCandidate(candidate);
   status('The exact author decision is open as an unsent original source request. Use that desk’s normal review, retain and execute controls deliberately.');
  });
 }
 async function observe(entry){
  return operation(async()=>{
   checkWorkspace();if(!entry.decision.request)throw new Error('This decision created no native request.');
   const receipt=await lookupReceipt(entry.decision.request.requestId);if(receipt.state==='NOT_FOUND'){status('That exact author request has not been retained by the original native controller.');return;}
   await verifyDecisionReceipt(entry.decision,receipt);const candidate=clone(S);candidate.receiptObservations.push({decisionId:entry.decision.id,at:new Date().toISOString(),receipt});await saveCandidate(candidate);status('The complete original native receipt is retained beside its author decision.');
  });
 }
 async function selection(kind,value){
  return operation(async()=>{if(!S)return;const candidate=clone(S);rememberDraft(candidate);candidate[kind]=value||null;if(kind==='activeReturnSha256')candidate.authorSelection={editionSha256:'',collectionFile:candidate.package.issue.collection.name};candidate.comparison=null;candidate.choices={};rowPage=0;await saveCandidate(candidate);});
 }
 function renderComparison(){
  ids.rows.replaceChildren();const rows=changedRows(),comparison=S?.comparison;
  if(!comparison){ids.comparison.textContent='Compare the selected original editions before choosing changes.';return;}
  ids.comparison.textContent=rows.length+' reviewer field changes · '+rows.filter(x=>x.conflict).length+' concurrent conflicts · '+comparison.currentAddedIds.length+' current-only items preserved · collection revision '+comparison.currentSource.collection.revision;
  for(const row of rows.slice(rowPage*25,(rowPage+1)*25)){
   const article=element('article'),heading=element('h4',row.name+' · '+row.field);article.append(heading);
   if(row.comment)article.append(element('p','Reviewer: '+row.comment));if(row.reason)article.append(element('p',row.reason));
   const details=element('details'),summary=element('summary','Issued / current / proposed values');details.append(summary);
   for(const [label,value]of [['Issued',row.baseline],['Current',row.current],['Proposed',row.proposed]]){details.append(element('h5',label),element('pre',typeof value==='string'?value:json(value)));}
   article.append(details);
   const label=element('label',row.conflict?'Concurrent changes — explicit decision':'Author decision'),select=element('select');select.dataset.reviewEdit='edit';
   select.append(element('option','Choose explicitly',{value:''}),element('option','Keep current value',{value:'keep'}));const adopt=element('option','Adopt reviewer proposal',{value:'adopt'});adopt.disabled=!row.canAdopt;select.append(adopt);select.value=S.choices[row.key]??'';
   select.addEventListener('change',()=>{if(busy||blocked)return;S.choices[row.key]=select.value;if(!select.value)delete S.choices[row.key];ids.confirm.checked=false;dirty();controls();});label.append(select);article.append(label);ids.rows.append(article);
  }
  ids.position.textContent='Fields '+(rows.length?rowPage*25+1:0)+'–'+Math.min(rows.length,(rowPage+1)*25)+' of '+rows.length;
 }
 async function renderEditions(epoch){
  const capturedCase=S?.caseId,capturedCurrent=S?.activeCurrentSha256,capturedEdition=S?.authorSelection?.editionSha256;
  ids.edition.replaceChildren(element('option','Select a submitted reviewer edition',{value:''}));if(!S?.activeReturnSha256)return;
  const pin=S.returns.find(x=>x.sha256===S.activeReturnSha256),captured=pin?.sha256;if(!pin)return;
  const returned=await readSourceReviewBytes(await readRetainedReviewFile(pin));if(renderEpoch!==epoch||S?.caseId!==capturedCase||S?.activeCurrentSha256!==capturedCurrent||S?.authorSelection?.editionSha256!==capturedEdition||S?.activeReturnSha256!==captured)return;
  for(const e of returned.value.editions){const option=element('option','Edition '+e.sequence+' · '+e.status+' · '+e.createdAt,{value:e.sha256});option.disabled=e.status!=='submitted';ids.edition.append(option);}
  ids.edition.value=S.authorSelection?.editionSha256??S.comparison?.editionSha256??'';ids.returnNote.textContent=returned.value.editions.length+' complete editions retained. '+(returned.value.editions.at(-1)?.status==='draft'?'Latest edition is unfinished. Select any earlier submitted edition deliberately.':'Select the submitted edition you reviewed.');
 }
 function render(){
  const epoch=++renderEpoch;
  if(!S){controls();return;}ids.case.textContent=S.package.issue.author+' → '+S.package.issue.recipient+' · '+S.package.issue.purpose;
  ids.recipientLink.href='./source-review.html?case='+encodeURIComponent(S.caseId)+'&workspace='+encodeURIComponent(S.workspaceId);
  ids.authorDecision.value=S.author??'';ids.reason.value=S.reason??'';ids.currentCollection.value=S.authorSelection?.collectionFile??S.comparison?.currentSource.collection.name??S.package.issue.collection.name;
  ids.returnSelect.replaceChildren(element('option','Choose a retained original return',{value:''}));for(const f of S.returns)ids.returnSelect.append(element('option',f.name+' · '+f.sha256.slice(0,12),{value:f.sha256}));ids.returnSelect.value=S.activeReturnSha256??'';
  ids.currentSelect.replaceChildren(element('option','Choose the current complete preparation',{value:''}));for(const f of S.currentSources)ids.currentSelect.append(element('option',f.name+' · '+f.sha256.slice(0,12),{value:f.sha256}));ids.currentSelect.value=S.activeCurrentSha256??'';
  ids.confirm.checked=false;renderComparison();void run(()=>renderEditions(epoch));ids.history.replaceChildren();
  for(const entry of S.decisions){
   const d=entry.decision,article=element('article');article.append(element('h4',d.actor+' · '+d.createdAt),element('p',d.reason),element('p',d.state));
   const buttons=element('div',undefined,{class:'actions'});buttons.append(action('Download full author decision',()=>download('bank-source-decision-'+d.id+'.json',reviewBytes(d)),{safe:true}));
   if(d.request)buttons.append(action('Open exact unsent edit request',()=>handoff(entry)),action('Read original request result',()=>observe(entry)));article.append(buttons);
   for(const o of S.receiptObservations.filter(x=>x.decisionId===d.id)){const details=element('details');details.append(element('summary','Original result · '+o.receipt.state+' · '+o.at),element('pre',json(o.receipt)));article.append(details);}ids.history.append(article);
  }
  controls();
 }
 root.replaceChildren();root.append(add('h2',null,'Issue and receive a source review'),add('p',null,'Share a complete original preparation with a named reviewer, then compare returned proposals with the current collection before creating an edit request.'));
 root.append(add('p','message','',{role:'status'}),add('p','connection',''));
 const create=element('details');create.open=true;create.append(element('summary','Issue a complete preparation'));
 const sourceActions=element('div',undefined,{class:'actions'});sourceActions.append(action('Use selected complete native result',()=>operation(async()=>useSource(await selectedCapsule()))),action('Use opened complete preparation',()=>operation(async()=>useSource(await openedCapsule()))));create.append(sourceActions,add('p','source','No complete preparation selected.'));
 const group=element('div',undefined,{class:'grid two'});group.append(field('Collection output filename','collection','input',{value:'collection.json'}),field('Issuing author','author','input',{maxlength:256}),field('Named reviewer','recipient','input',{maxlength:256}),field('Review instructions','purpose','textarea',{rows:3,maxlength:16000}));create.append(group,action('Retain issued review',issue,{id:'issue'}));root.append(create);
 const cases=element('details');cases.append(element('summary','Saved review cases'),action('Refresh saved cases',()=>operation(refreshCases,{recover:true}),{safe:true}),add('div','cases',''));
 const pages=element('div',undefined,{class:'actions'});pages.append(action('Previous cases',()=>operation(async()=>{caseCursor=casePrevious.pop()??null;await refreshCases();},{recover:true}),{safe:true,id:'caseBefore'}),action('Next cases',()=>operation(async()=>{if(caseNext){casePrevious.push(caseCursor);caseCursor=caseNext;await refreshCases();}},{recover:true}),{safe:true,id:'caseAfter'}));cases.append(pages);root.append(cases);
 const editor=add('div','editor');editor.hidden=true;editor.append(add('h3','case',''));
 const buttons=element('div',undefined,{class:'actions'});buttons.append(action('Download complete issued/reviewer package',()=>operation(async()=>{const snapshot=clone(S);await verifySourceReview(snapshot.package);download('bank-source-review-'+snapshot.caseId+'.json',reviewBytes(snapshot.package));}),{safe:true,id:'export'}),action('Download full author working record',()=>operation(()=>download('bank-source-review-working-'+S.caseId+'.json',reviewBytes(S,REVIEW_LIMITS.workingBytes)),{recover:true}),{safe:true,id:'working'}),action('Reopen saved case',()=>openCase(S.workspaceId,S.caseId),{safe:true,id:'reopen'}));
 const link=add('a','recipientLink','Open recipient workspace and standalone download',{href:'./source-review.html'});buttons.append(link);editor.append(buttons);
 const receive=element('div',undefined,{class:'grid two'});receive.append(field('Receive complete reviewer return','returnFile','input',{type:'file',accept:'.json,application/json'}),field('Select current complete preparation','currentFile','input',{type:'file',accept:'.json,application/json'}),field('Retained returned file','returnSelect','select'),field('Retained current preparation','currentSelect','select'),field('Submitted reviewer edition','edition','select'),field('Current collection output filename','currentCollection','input'));editor.append(receive,add('p','returnNote',''),action('Compare issued / current / returned',compare,{id:'compare'}));
 editor.append(add('p','comparison',''),add('div','rows',''));
 const rowPages=element('div',undefined,{class:'actions'});rowPages.append(action('Previous fields',()=>{rowPage=Math.max(0,rowPage-1);renderComparison();},{safe:true,id:'previous'}),add('span','position',''),action('Next fields',()=>{if((rowPage+1)*25<changedRows().length)rowPage++;renderComparison();},{safe:true,id:'next'}),action('Explicitly keep all current values',()=>{if(busy||blocked||!S?.comparison)return;S.choices=Object.fromEntries(changedRows().map(x=>[x.key,'keep']));ids.confirm.checked=false;dirty();renderComparison();},{id:'keepAll'}));editor.append(rowPages);
 const review=element('div',undefined,{class:'grid two'});review.append(field('Author decision name','authorDecision','input',{maxlength:256}),field('Reason for these choices','reason','textarea',{rows:3,maxlength:16000}));editor.append(review);
 const confirm=element('label','I reviewed the issued, current and returned values and all explicit choices.'),checkbox=add('input','confirm',undefined,{type:'checkbox'});checkbox.dataset.reviewEdit='edit';confirm.prepend(checkbox);editor.append(confirm,action('Retain author decision',decide,{id:'decide'}),add('h3',null,'Original decisions and native results'),add('div','history',''));root.append(editor);
 ids.returnFile.addEventListener('change',()=>run(async()=>{const f=ids.returnFile.files?.[0];if(f)await receiveReturn(f);ids.returnFile.value='';}));
 ids.currentFile.addEventListener('change',()=>run(async()=>{const f=ids.currentFile.files?.[0];if(f)await receiveCurrent(f);ids.currentFile.value='';}));
 ids.returnSelect.addEventListener('change',()=>run(()=>selection('activeReturnSha256',ids.returnSelect.value)));ids.currentSelect.addEventListener('change',()=>run(()=>selection('activeCurrentSha256',ids.currentSelect.value)));
 for(const [id,key]of [['edition','editionSha256'],['currentCollection','collectionFile']])ids[id].addEventListener(id==='edition'?'change':'input',()=>{if(busy||blocked||!S)return;rememberDraft(S);S.authorSelection??={editionSha256:'',collectionFile:S.package.issue.collection.name};S.authorSelection[key]=ids[id].value;S.comparison=null;S.choices={};ids.confirm.checked=false;dirty();renderComparison();controls();});
 ids.confirm.addEventListener('change',controls);
 for(const [id,key]of [['authorDecision','author'],['reason','reason']])ids[id].addEventListener('input',()=>{if(busy||blocked||!S)return;S[key]=ids[id].value;ids.confirm.checked=false;dirty();controls();});
 window.addEventListener('beforeunload',e=>{if(busy||editVersion!==savedVersion){e.preventDefault();e.returnValue='';}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&S&&!blocked)persist().catch(e=>status(e.message,true));});
 controls();void run(refreshCases);
 return {refresh:refreshCases};
}
