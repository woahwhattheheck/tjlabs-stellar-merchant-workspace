// MIT. Local collection review with complete raw draft and expected-revision browser saves.
import { createCollectionWorkspace,validateCollectionWorkspace,addCollectionSource,saveCollectionRevision,collectionDraft,
 receiveCollectionWorkspace,collectionReport,createCollectionPacket,openCollectionPacket,createCollectionArchive,
 retainCollectionWorkingCopy,emptyReview,canonical } from './collection-review-workspace.mjs';
import { renderCollectionReview } from './collection-review-report.mjs';
import { mountCollectionEditionReview } from './collection-review-edition-ui.mjs';
const $=id=>document.getElementById(id), clone=value=>structuredClone(value), json=value=>JSON.stringify(value,null,2)+'\n';
const S={workspace:null,draft:null,pending:null,slot:null,revision:0,db:null,write:Promise.resolve(),storageError:null,busy:false,selected:null,mode:'open'};
const say=(value,error=false)=>{$('notice').textContent=value;$('notice').classList.toggle('error',error);};
const node=(tag,value)=>{const el=document.createElement(tag);if(value!==undefined)el.textContent=value;return el;};
function button(text,fn){const b=node('button',text);b.type='button';b.onclick=()=>act(fn);return b;}
function download(name,value,type='application/json'){const blob=value instanceof Uint8Array?new Blob([value],{type}):new Blob([typeof value==='string'?value:json(value)],{type});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function database(){if(S.db)return S.db;S.db=new Promise((resolve,reject)=>{const r=indexedDB.open('stellar-forge-collection-review-v1',1);let failed=false;
 r.onupgradeneeded=()=>r.result.createObjectStore('workspaces',{keyPath:'id'});
 r.onblocked=()=>{failed=true;reject(Error('Close the older collection review tab before reopening browser storage.'));};
 r.onerror=()=>reject(r.error);r.onsuccess=()=>{if(failed){r.result.close();return;}r.result.onversionchange=()=>{r.result.close();S.db=null;};resolve(r.result);};}).catch(e=>{S.db=null;throw e;});return S.db;}
async function stored(id){const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction('workspaces').objectStore('workspaces').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function snapshot(){return {workspace:clone(S.workspace),draft:clone(S.draft),pending:clone(S.pending),selected:S.selected};}
function persist(){
 if(!S.workspace)return Promise.resolve();
 const value=snapshot(),slot=S.slot;
 S.write=S.write.then(async()=>{if(S.storageError)throw S.storageError;const db=await database(),expected=S.revision;
 const revision=await new Promise((resolve,reject)=>{const tx=db.transaction('workspaces','readwrite'),store=tx.objectStore('workspaces');let error,next;
 const r=store.get(slot);r.onsuccess=()=>{const actual=r.result?.revision||0;if(actual!==expected){error=Error('Another tab saved this browser copy. Download the current working copy, then reopen its newer saved state or open your download as a separate browser copy.');tx.abort();return;}
 next=actual+1;store.put({id:slot,revision:next,name:value.workspace.name,updatedAt:new Date().toISOString(),value});};
 tx.oncomplete=()=>resolve(next);tx.onerror=()=>reject(error||tx.error);tx.onabort=()=>reject(error||tx.error||Error('The browser save was interrupted.'));});
 if(S.slot===slot){S.revision=revision;$('storage-status').textContent='Browser copy saved · '+revision;}
 }).catch(error=>{S.storageError=error;$('storage-status').textContent='Browser save needs attention';say(error.message+' The current working copy remains downloadable.',true);throw error;});
 return S.write;
}
function changed(){persist().catch(()=>{});renderPending();}
async function flush(){await S.write;if(S.storageError)throw S.storageError;}
async function act(operation,{recoverStorage=false}={}){if(S.busy)return;S.busy=true;const controls=[...document.querySelectorAll('main button,main input,main textarea,main select')],old=controls.map(el=>[el,el.disabled]);for(const el of controls)el.disabled=true;
 try{if(recoverStorage)await S.write.catch(()=>{});else await flush();await operation();}catch(error){say(error.message,true);}finally{S.busy=false;for(const [el,disabled]of old)if(el.isConnected)el.disabled=disabled;renderPending();}}
function newDraft(workspace,base=workspace.headId,state=collectionDraft(workspace,base),actor=''){return {baseRevision:base,state:clone(state),rawText:null,actor,note:'',aux:{relationFrom:'',relationTo:'',relationKind:'',relationNote:'',sourceURL:'',sourceTime:new Date().toISOString(),sourceFormat:'archiveblack-html'}};}
async function openWorkspace(workspace,provided=null){
 S.workspace=await validateCollectionWorkspace(workspace);S.draft=provided?.draft||newDraft(S.workspace);S.pending=provided?.pending||null;S.selected=provided?.selected||null;
 S.slot=crypto.randomUUID();S.revision=0;S.storageError=null;S.write=Promise.resolve();location.hash=S.slot;await persist();render();await catalog();
}
async function catalog(){const db=await database(),rows=await new Promise((resolve,reject)=>{const r=db.transaction('workspaces').objectStore('workspaces').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const el=$('saved');el.replaceChildren(new Option('Choose a workspace',''));for(const row of rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)))el.add(new Option(row.name+' · '+new Date(row.updatedAt).toLocaleString()+' · '+row.id.slice(0,8),row.id));el.value=S.slot||'';}
async function openSaved(id){const row=await stored(id);if(!row)throw Error('That saved browser copy is absent.');
 const verified=await validateCollectionWorkspace(row.value.workspace);S.workspace=verified;S.slot=row.id;S.revision=row.revision;S.draft=row.value.draft||newDraft(verified);S.pending=row.value.pending||null;S.selected=row.value.selected||null;
 S.storageError=null;S.write=Promise.resolve();location.hash=id;render();say('Opened the complete saved review and unfinished draft.');}
const allEntries=()=>S.draft.state.collectionIds.flatMap(id=>{const c=S.workspace.sources.find(s=>s.id===id);return c?c.entries.map(e=>({...e,collection:c})):[];});
const reviewFor=id=>S.draft.state.reviews.find(r=>r.id===id)||{id,...emptyReview()};
function editableReview(id){let row=S.draft.state.reviews.find(r=>r.id===id);if(!row){row={id,...emptyReview()};S.draft.state.reviews.push(row);}return row;}
function renderPending(){$('recover').disabled=S.busy||!S.pending;$('save-review').disabled=S.busy||!S.workspace||Boolean(S.pending);$('pending').textContent=S.pending?'Original save '+S.pending.id+' is retained. Recovery keeps this exact input.':'';}
function render(){
 $('workspace').hidden=!S.workspace;if(!S.workspace)return;
 $('workspace-name').textContent=S.workspace.name;$('basis').textContent='Saved basis '+S.draft.baseRevision;
 $('actor').value=S.draft.actor;$('revision-note').value=S.draft.note;
 for(const [id,key]of [['story-title','title'],['story-intro','introduction'],['story-note','note']])$(id).value=S.draft.state.story[key];
 for(const [id,key]of [['relation-kind','relationKind'],['relation-note','relationNote'],['source-url','sourceURL'],['source-time','sourceTime'],['source-format','sourceFormat']])$(id).value=S.draft.aux?.[key]||'';
 $('raw-state').value=S.draft.rawText??json(S.draft.state);
 renderCollections();renderEntries();renderStory();renderRelations();renderHistory();renderEditor();renderPending();editionUI.render().catch(error=>say(error.message,true));
}
function renderCollections(){
 const root=$('collections');root.replaceChildren();
 for(const source of S.workspace.sources){const row=node('div');row.className='collection';const label=node('label'),check=node('input');check.type='checkbox';check.checked=S.draft.state.collectionIds.includes(source.id);
 check.onchange=()=>{if(check.checked)S.draft.state.collectionIds.push(source.id);else{
 S.draft.state.collectionIds=S.draft.state.collectionIds.filter(id=>id!==source.id);const ids=new Set(source.entries.map(e=>e.id));
 S.draft.state.reviews=S.draft.state.reviews.filter(r=>!ids.has(r.id));S.draft.state.story.order=S.draft.state.story.order.filter(id=>!ids.has(id));S.draft.state.relationships=S.draft.state.relationships.filter(r=>!ids.has(r.from)&&!ids.has(r.to));if(ids.has(S.selected))S.selected=null;}
 changed();render();};
 label.append(check,node('span',source.institution.title));row.append(label,node('p',source.entries.length+' ordered occurrences'),button('Download original',()=>download(source.source.filename,source.source.sourceText,source.source.format==='archiveblack-html'?'text/html':'application/json')));root.append(row);}
 if(!S.workspace.sources.length)root.append(node('p','Retain a complete original collection page or structured catalogue to begin.'));
}
function renderEntries(){
 const root=$('entries');root.replaceChildren();const q=$('query').value.toLowerCase(),filter=$('filter').value,entries=allEntries(),shown=entries.filter(e=>{const r=reviewFor(e.id);return(!filter||filter===r.status)&&(!q||[e.title,e.collection.institution.title,r.suggestedTitle,r.summary,r.note].join(' ').toLowerCase().includes(q));});
 $('count').textContent=shown.length+' of '+entries.length;
 for(const e of shown){const r=reviewFor(e.id),b=button(e.ordinal+' · '+e.title,async()=>{S.selected=e.id;await persist();renderEntries();renderEditor();});b.className='entry'+(e.id===S.selected?' active':'');b.append(node('small',e.collection.institution.title+' · '+r.status+' · rights '+r.rights.status));root.append(b);}
}
function renderEditor(){
 const e=allEntries().find(e=>e.id===S.selected);$('editor').hidden=!e;if(!e)return;
 const r=reviewFor(e.id);$('entry-title').textContent=e.title;
 const link=node('a','Original institution record');link.href=e.url;link.target='_blank';link.rel='noopener noreferrer';
 $('entry-source').replaceChildren(node('span',e.collection.institution.title+' · occurrence '+e.ordinal+' · '),link);
 $('original-entry').textContent=json({id:e.id,ordinal:e.ordinal,title:e.title,url:e.url,sourceLocator:e.sourceLocator,rawAnchor:e.rawAnchor,rawRecord:e.rawRecord,source:{url:e.collection.source.url,sha256:e.collection.source.sha256,observedAt:e.collection.source.observedAt}});
 for(const [id,key]of [['review-status','status'],['proposed-title','suggestedTitle'],['summary','summary'],['review-note','note']])$(id).value=r[key];
 for(const [id,key]of [['rights-status','status'],['rights-basis','basis'],['rights-citation','citation']])$(id).value=r.rights[key];
}
function renderStory(){
 const root=$('story'),entries=new Map(allEntries().map(e=>[e.id,e]));root.replaceChildren();
 S.draft.state.story.order.forEach((id,index)=>{const e=entries.get(id),row=node('li',e?.title||id);
 const move=direction=>{const at=index+direction;if(at<0||at>=S.draft.state.story.order.length)return;[S.draft.state.story.order[index],S.draft.state.story.order[at]]=[S.draft.state.story.order[at],S.draft.state.story.order[index]];changed();renderStory();};
 const up=button('↑',()=>move(-1)),down=button('↓',()=>move(1));up.setAttribute('aria-label','Move earlier');down.setAttribute('aria-label','Move later');up.disabled=index===0;down.disabled=index===S.draft.state.story.order.length-1;
 row.append(node('br'),up,down,button('Remove',()=>{S.draft.state.story.order.splice(index,1);changed();renderStory();}));root.append(row);});
}
function renderRelations(){
 const entries=allEntries(),map=new Map(entries.map(e=>[e.id,e])),root=$('relations');root.replaceChildren();
 for(const [id,key]of [['relation-from','relationFrom'],['relation-to','relationTo']]){const select=$(id);select.replaceChildren(new Option('Choose an original occurrence',''));for(const e of entries)select.add(new Option(e.collection.institution.title+' · '+e.ordinal+' · '+e.title,e.id));select.value=S.draft.aux?.[key]||'';}
 for(const relation of S.draft.state.relationships){const row=node('div');row.className='relation';row.append(node('strong',relation.kind),node('p',(map.get(relation.from)?.title||relation.from)+' → '+(map.get(relation.to)?.title||relation.to)),node('p',relation.note),
 button('Remove proposal',()=>{S.draft.state.relationships=S.draft.state.relationships.filter(r=>r.id!==relation.id);changed();renderRelations();}));root.append(row);}
}
function renderHistory(){
 const selected=$('history').value;$('history').replaceChildren();for(const r of [...S.workspace.revisions].reverse())$('history').add(new Option(new Date(r.createdAt).toLocaleString()+' · '+r.actor+' · '+(r.note||r.id.slice(0,18)),r.id));$('history').value=S.workspace.revisions.some(r=>r.id===selected)?selected:S.workspace.headId;
 $('working-copies').replaceChildren(new Option('Choose retained unfinished text',''));for(const d of S.workspace.workingCopies||[])$('working-copies').add(new Option(new Date(d.createdAt).toLocaleString()+' · '+d.actor+' · '+d.note,d.id));
}
async function saveReview(){
 if(S.draft.rawText!==null)throw Error('Apply the complete raw draft JSON or keep it as a downloadable unfinished working copy before saving a review.');
 if(!S.pending){S.pending={id:crypto.randomUUID(),expectedRevision:S.draft.baseRevision,createdAt:new Date().toISOString(),actor:S.draft.actor,note:S.draft.note,state:clone(S.draft.state)};await persist();}
 await recover();
}
async function recover(){
 if(!S.pending)throw Error('There is no original save to recover.');
 const pending=clone(S.pending),result=await saveCollectionRevision(S.workspace,pending);
 // The original request is retained before local processing. Only that snapshot's basis advances.
 S.workspace=result.workspace;
 if(pending.sourceEdition){
  if(S.draft.baseRevision===pending.expectedRevision&&S.draft.rawText===null&&canonical(S.draft.state)===canonical(pending.sourceEdition.basisState)){
   S.draft.state=clone(pending.state);S.draft.baseRevision=result.revision.id;S.selected=null;
   if(S.draft.edition?.prepared?.request?.id===pending.id)S.draft.edition=null;
  }
 }else if(S.draft.baseRevision===pending.expectedRevision)S.draft.baseRevision=result.revision.id;
 if(S.pending?.id===pending.id)S.pending=null;
 await persist();render();await catalog();say('Saved original review '+result.revision.id+'. Later draft text remains available.');
}
async function completeWorkingCopy(){
 const result=await retainCollectionWorkingCopy(S.workspace,{baseRevision:S.draft.baseRevision,stateText:S.draft.rawText??json(S.draft.state),
 structuredState:S.draft.state,browserDraft:S.draft,actor:S.draft.actor,note:S.draft.note,pending:S.pending});
 S.workspace=result.workspace;await persist();return result.workspace;
}
async function showReport(id){const report=await collectionReport(S.workspace,id),html=renderCollectionReview(report);download('collection-review.html',html,'text/html');}
function bind(){
 $('new').onclick=()=>act(async()=>{const name=prompt('Name this collection workspace','Collection review');if(name===null)return;const actor=prompt('Actual editorial operator','');if(!actor)return;await openWorkspace(await createCollectionWorkspace({name,actor}));S.draft.actor=actor;await persist();render();say('Created an empty review. Add complete original source pages.');});
 $('open').onclick=()=>{S.mode='open';$('packet-file').click();};$('receive').onclick=()=>{if(!S.workspace){say('Open the destination workspace first.',true);return;}S.mode='receive';$('packet-file').click();};
 $('packet-file').onchange=()=>act(async()=>{const file=$('packet-file').files[0];if(!file)return;if(file.size>64*1024*1024)throw Error('The complete packet exceeds 64 MiB.');
 const raw=JSON.parse(await file.text()),envelope=raw.schema==='stellar-forge.collection-browser-copy.v1'?raw.value:null;
 let w=envelope?await validateCollectionWorkspace(envelope.workspace):await openCollectionPacket(raw);
 if(S.mode==='receive'&&envelope?.draft){const d=envelope.draft;w=(await retainCollectionWorkingCopy(w,{baseRevision:d.baseRevision,stateText:d.rawText??json(d.state),structuredState:d.state,browserDraft:d,actor:d.actor,note:d.note,pending:envelope.pending||null})).workspace;}
 if(S.mode==='receive'){const result=await receiveCollectionWorkspace(S.workspace,w);S.workspace=result.workspace;await persist();render();say('Received complete source/history. Your local review and unfinished draft remain selected. Received head: '+result.receivedHeadId);}
 else{await openWorkspace(w,envelope);say('Opened the complete source/history as a separate browser copy.');}
 $('packet-file').value='';},{recoverStorage:true});
 $('open-saved').onclick=()=>act(async()=>{if(!$('saved').value)throw Error('Choose a saved browser copy.');await openSaved($('saved').value);},{recoverStorage:true});
 $('download').onclick=()=>act(async()=>{const w=await completeWorkingCopy();download('collection-workspace.json',await createCollectionPacket(w));});
 // This emergency path stays useful even after storage failure.
 $('download-draft').onclick=()=>{if(S.workspace)download('collection-working-copy.json',{schema:'stellar-forge.collection-browser-copy.v1',value:snapshot()});};
 $('intake').onclick=()=>act(async()=>{const file=$('source-file').files[0];if(!file)throw Error('Choose a complete original source file.');if(file.size>4*1024*1024)throw Error('A source exceeds 4 MiB.');
 const raw=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()),result=await addCollectionSource(S.workspace,{format:$('source-format').value,filename:file.name,sourceText:raw,url:$('source-url').value,observedAt:$('source-time').value});
 S.workspace=result.workspace;if($('source-select').checked&&!S.draft.state.collectionIds.includes(result.source.id))S.draft.state.collectionIds.push(result.source.id);await persist();render();say('Retained '+result.source.entries.length+' ordered original occurrences.');});
 for(const [id,key]of [['actor','actor'],['revision-note','note']])$(id).oninput=()=>{S.draft[key]=$(id).value;changed();};
 for(const [id,key]of [['story-title','title'],['story-intro','introduction'],['story-note','note']])$(id).oninput=()=>{S.draft.state.story[key]=$(id).value;changed();};
 for(const [id,key]of [['relation-from','relationFrom'],['relation-to','relationTo'],['relation-kind','relationKind'],['relation-note','relationNote'],['source-url','sourceURL'],['source-time','sourceTime'],['source-format','sourceFormat']])$(id).oninput=()=>{S.draft.aux||={};S.draft.aux[key]=$(id).value;changed();};
 for(const [id,key]of [['review-status','status'],['proposed-title','suggestedTitle'],['summary','summary'],['review-note','note']])$(id).oninput=()=>{if(!S.selected)return;editableReview(S.selected)[key]=$(id).value;if(key==='status'&&$(id).value!=='include'){S.draft.state.story.order=S.draft.state.story.order.filter(x=>x!==S.selected);renderStory();}changed();renderEntries();};
 for(const [id,key]of [['rights-status','status'],['rights-basis','basis'],['rights-citation','citation']])$(id).oninput=()=>{if(S.selected){editableReview(S.selected).rights[key]=$(id).value;changed();}};
 $('query').oninput=renderEntries;$('filter').onchange=renderEntries;
 $('story-add').onclick=()=>act(async()=>{if(!S.selected||reviewFor(S.selected).status!=='include')throw Error('Explicitly mark this original occurrence include before adding it to the proposed story.');if(!S.draft.state.story.order.includes(S.selected))S.draft.state.story.order.push(S.selected);await persist();renderStory();});
 $('relation-add').onclick=()=>act(async()=>{const a=S.draft.aux;if(!a.relationFrom||!a.relationTo||a.relationFrom===a.relationTo||!a.relationKind.trim()||!a.relationNote.trim())throw Error('Select two occurrences and describe the proposed relationship and basis.');
 S.draft.state.relationships.push({id:crypto.randomUUID(),from:a.relationFrom,to:a.relationTo,kind:a.relationKind,note:a.relationNote});await persist();renderRelations();});
 $('raw-state').oninput=()=>{S.draft.rawText=$('raw-state').value;changed();};
 $('apply-raw').onclick=()=>act(async()=>{const state=JSON.parse($('raw-state').value);
 // Original model validates the whole proposed state; no revision is committed here.
 const request={id:crypto.randomUUID(),expectedRevision:S.workspace.headId,actor:S.draft.actor||'Draft validation',note:'Draft validation only',createdAt:new Date().toISOString(),state};
 await saveCollectionRevision(S.workspace,request);S.draft.state=state;S.draft.rawText=null;S.selected=null;await persist();render();say('Applied the complete draft. Save review to retain a new revision.');});
 $('save-review').onclick=()=>act(saveReview);$('recover').onclick=()=>act(recover);
 $('review-history').onclick=()=>act(()=>showReport($('history').value));$('preview').onclick=()=>act(()=>showReport(S.workspace.headId));
 $('draft-history').onclick=()=>act(async()=>{await completeWorkingCopy();const id=$('history').value;S.draft=newDraft(S.workspace,S.workspace.headId,collectionDraft(S.workspace,id),S.draft.actor);S.selected=null;await persist();render();say('Copied the chosen saved revision into a new draft against the current local head. The replaced working text remains in history.');});
 $('restore-working').onclick=()=>act(async()=>{const selected=$('working-copies').value,draft=S.workspace.workingCopies.find(x=>x.id===selected);if(!draft)throw Error('Choose a retained working copy.');await completeWorkingCopy();
 S.draft=newDraft(S.workspace,S.workspace.headId,draft.structuredState||collectionDraft(S.workspace),draft.actor);S.draft.rawText=draft.stateText;S.draft.note=draft.note;if(draft.browserDraft?.aux)S.draft.aux=clone(draft.browserDraft.aux);if(draft.browserDraft?.edition)S.draft.edition=clone(draft.browserDraft.edition);S.selected=null;await persist();render();say('Restored original working text. Its original pending request stays in the retained copy; it is not dispatched automatically.');});
 for(const [id,native]of [['export',false],['native-export',true]])$(id).onclick=()=>act(async()=>{const w=await completeWorkingCopy(),result=await createCollectionArchive(w,w.headId,{native});download('collection-review.zip',result.bytes,'application/zip');say('Exported complete saved review, all source/history and the current unfinished working copy.');});
 window.addEventListener('beforeunload',event=>{if(S.busy||S.storageError){event.preventDefault();event.returnValue='';}});
}
const editionUI=mountCollectionEditionReview({read:()=>S,changed,act,render,download,say,preserveDraft:completeWorkingCopy,saveRequest:async request=>{
 if(S.pending)throw Error('Recover the original pending request before saving this edition.');
 S.pending=request;await persist();await recover();
}});
bind();
(async()=>{try{await catalog();const id=location.hash.slice(1);if(id)await openSaved(id);else say('Create a workspace or open a complete editable packet.');}catch(error){say(error.message,true);}})();
