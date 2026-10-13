// SPDX-License-Identifier: MIT
import {PROFILE_LIMITS,createProfileLibrary,validateProfileLibrary,saveProfile,receiveProfileLibrary,selectProfileVersion,previewProfileApplication,applyProfileApplication} from './source-profile-model.mjs';
/** Saved interpretations live in this workspace's existing original-file storage. */
export function installSourceProfiles({workspaceId,readLibrary,saveLibrary,uuid,getWorking,getActor,applyMapping,download,notice,run}){
 const node=(tag,text,attrs={})=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
 const button=(label,work)=>{const n=node('button',label,{type:'button'});n.addEventListener('click',()=>perform(work));return n;};
 const field=(label,input)=>{const n=node('label',label);n.append(input);return n;};
 const section=node('section',undefined,{class:'panel'}),title=node('h2','Saved source interpretations');
 const explanation=node('p','Name a recurring bank format, retain each revision, and review its changes before applying it to the selected original. File-specific balance rows and excluded rows are cleared on application; choose them again from that original.',{class:'small muted'});
 const select=node('select',undefined,{'aria-label':'Saved source interpretation'}),versions=node('select',undefined,{'aria-label':'Saved interpretation version'});
 const name=node('input',undefined,{maxlength:160,placeholder:'Bank and export format','aria-label':'Interpretation name'});
 const reason=node('textarea',undefined,{maxlength:4000,placeholder:'Why this interpretation fits the bank export','aria-label':'Reason for saving this interpretation'});
 const facts=node('p',undefined,{class:'small','aria-live':'polite'}),toolbar=node('div',undefined,{class:'actions'});
 const fields=node('div',undefined,{class:'grid two'});fields.append(field('Interpretation name',name),field('Reason for this revision',reason));
 const fresh=button('Start a new interpretation',()=>{selected='';selectedVersion=0;review=null;name.value='';reason.value='';render();});
 const save=button('Save current mapping as a new profile',()=>persist(false));
 const revise=button('Save current mapping as next version',()=>persist(true));
 const reload=button('Reload saved library',async()=>{await open();notice('Opened the current saved library. Your working file and mapping remain available.');});
 const exportLibrary=button('Download complete profile library',async()=>{await validateProfileLibrary(library);download('bank-source-profiles-'+library.id+'.json',JSON.stringify(library));});
 const receive=node('input',undefined,{type:'file',accept:'.json,application/json'}),receiveLabel=field('Receive complete library as copies',receive);
 toolbar.append(select,versions,fresh,reload,exportLibrary,receiveLabel);
 const actions=node('div',undefined,{class:'actions'});actions.append(save,revise);
 const reviewButton=button('Review selected version for this original',async()=>{const working=getWorking();review=await previewProfileApplication(library,{profileId:selected,version:selectedVersion,...working});render();});
 const applyButton=button('Apply reviewed interpretation',async()=>{
  if(!review)throw new Error('Review the selected interpretation and original first.');
  const expected=getWorking(),next=await applyProfileApplication(library,review,expected);
  await applyMapping(next,expected);review=null;render();notice('Applied the reviewed source interpretation. Review the complete original source and choose any file-specific balance or excluded rows.');
 });
 const reviewActions=node('div',undefined,{class:'actions'});reviewActions.append(reviewButton,applyButton);
 const reviewPanel=node('div'),history=node('details'),summary=node('summary','Complete version history'),historyBody=node('div');
 const historyActions=node('div',undefined,{class:'actions'}),previous=button('Previous versions',()=>{historyPage=Math.max(0,historyPage-1);render();}),next=button('Next versions',()=>{historyPage++;render();}),position=node('span');
 historyActions.append(previous,position,next);history.append(summary,historyBody,historyActions);
 const guide=node('a','Source interpretation guide',{href:'./SOURCE_PROFILES.md',target:'_blank',rel:'noopener'});
 section.append(title,explanation,toolbar,fields,actions,facts,reviewActions,reviewPanel,history,guide);
 let library=createProfileLibrary({id:uuid(),workspaceId}),savedToken=null,selected='',selectedVersion=0,review=null,historyPage=0,loading=false,ready=false;
 function perform(work){return run(async()=>{if(loading)throw new Error('Wait for the current source interpretation operation.');loading=true;render();try{return await work();}finally{loading=false;render();}});}
 async function commit(nextLibrary){
  await saveLibrary(nextLibrary,savedToken);library=nextLibrary;savedToken={id:library.id,revision:library.revision};ready=true;review=null;
 }
 async function persist(revising){
  if(!ready)throw new Error('Reload the complete saved profile library before saving.');
  if(revising&&!selected)throw new Error('Choose the saved interpretation to revise.');
  const current=revising?selectProfileVersion(library,selected,selectedVersion).profile:null;
  const head=current?.versions.at(-1),profileId=current?.id||uuid(),working=getWorking({requireFile:false});
  const nextLibrary=await saveProfile(library,{profileId,expectedRevision:library.revision,expectedVersion:head?.version||0,name:name.value,reason:reason.value,actor:getActor(),createdAt:new Date().toISOString(),mapping:working.mapping});
  await commit(nextLibrary);selected=profileId;selectedVersion=(head?.version||0)+1;reason.value='';historyPage=0;
  notice('Saved '+name.value+' version '+selectedVersion+' with its complete interpretation history.');
 }
 async function open(){
  const original=await readLibrary();const candidate=original?await validateProfileLibrary(original):createProfileLibrary({id:uuid(),workspaceId});
  if(candidate.workspaceId!==workspaceId)throw new Error('This profile library belongs to another workspace. Receive its complete download as copies.');
  library=candidate;savedToken=original?{id:library.id,revision:library.revision}:null;ready=true;review=null;
  if(!library.profiles.some(p=>p.id===selected)){selected='';selectedVersion=0;}
  else if(!library.profiles.find(p=>p.id===selected).versions.some(v=>v.version===selectedVersion))selectedVersion=library.profiles.find(p=>p.id===selected).versions.at(-1).version;
  render();
 }
 function render(){
  select.replaceChildren(node('option','Choose a saved interpretation',{value:''}));
  for(const profile of library.profiles){const head=profile.versions.at(-1);select.append(node('option',head.name+' · '+head.version+' versions',{value:profile.id}));}select.value=selected;
  const profile=library.profiles.find(p=>p.id===selected);versions.replaceChildren();
  for(const version of profile?.versions||[])versions.append(node('option','Version '+version.version+' · '+version.createdAt+' · '+version.actor,{value:version.version}));versions.value=String(selectedVersion);
  facts.textContent=(ready?'Library revision '+library.revision+' · '+library.profiles.length+' saved interpretations':'Open the saved library to continue')+(profile?.origin?' · received from workspace '+profile.origin.workspaceId:'');
  reviewPanel.replaceChildren();
  if(review){
   reviewPanel.append(node('h3',review.profile.name+' · version '+review.profile.version),node('p',review.file.name+' · '+review.file.bytes+' original bytes'),node('code',review.file.sha256,{class:'small'}));
   const table=node('table'),head=node('thead'),tr=node('tr'),body=node('tbody');for(const label of ['Interpretation field','Current value','Reviewed value'])tr.append(node('th',label));head.append(tr);
   for(const change of review.changes){const row=node('tr');row.append(node('td',change.field));for(const value of [change.before,change.after]){const cell=node('td');cell.append(node('pre',typeof value==='string'?value:JSON.stringify(value,null,2)));row.append(cell);}body.append(row);}
   table.append(head,body);const wrap=node('div',undefined,{class:'table-wrap'});wrap.append(table);reviewPanel.append(wrap);
  }
  historyBody.replaceChildren();const rows=[...(profile?.versions||[])].reverse();historyPage=Math.min(historyPage,Math.max(0,Math.ceil(rows.length/20)-1));
  for(const version of rows.slice(historyPage*20,historyPage*20+20)){
   const item=node('details'),heading=node('summary','Version '+version.version+' · '+version.name+' · '+version.createdAt);
   item.append(heading,node('p',version.actor+' — '+version.reason),node('code',version.sha256,{class:'small'}),node('pre',JSON.stringify(version.mapping,null,2)));historyBody.append(item);
  }
  position.textContent=rows.length?'Versions '+(historyPage*20+1)+'–'+Math.min(rows.length,(historyPage+1)*20)+' of '+rows.length:'No saved versions';
  for(const n of section.querySelectorAll('button,input,select,textarea'))n.disabled=loading;
  save.disabled=loading||!ready;revise.disabled=loading||!ready||!profile;reviewButton.disabled=loading||!ready||!profile;applyButton.disabled=loading||!review;
  exportLibrary.disabled=loading||!ready;receive.disabled=loading||!ready;previous.disabled=loading||historyPage===0;next.disabled=loading||(historyPage+1)*20>=rows.length;
 }
 select.addEventListener('change',()=>{selected=select.value;const profile=library.profiles.find(p=>p.id===selected);selectedVersion=profile?.versions.at(-1).version||0;name.value=profile?.versions.at(-1).name||'';reason.value='';review=null;historyPage=0;render();});
 versions.addEventListener('change',()=>{selectedVersion=Number(versions.value);review=null;render();});
 receive.addEventListener('change',()=>perform(async()=>{
  const file=receive.files?.[0];if(!file)return;
  try{if(!file.size||file.size>PROFILE_LIMITS.bytes)throw new Error('Receive one complete profile library up to 16 MB.');
   const source=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()));
   const received=await receiveProfileLibrary(library,source,{expectedRevision:library.revision,makeId:uuid});
   if(received.received)await commit(received.library);notice('Received '+received.received+' complete profiles; '+received.existing+' original editions were already present.');
  }finally{receive.value='';}
 }));
 return {init:open,mount:root=>root?.replaceChildren(section)};
}
