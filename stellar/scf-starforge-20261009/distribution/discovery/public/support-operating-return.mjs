// MIT. Source-bound Support returned work in the original Operating Plan editor.
import {inspectOperatingPlan} from '/operating-plan-core.mjs';
import {createSupportOperatingReturn, inspectSupportOperatingReturn, compareSupportOperatingReturn,
  reviseSupportOperatingReturn, decideSupportOperatingReturn, applySupportOperatingReturn,
  renderSupportOperatingReturnHTML} from '/support-operating-core/support-operating-return.mjs';

const MAX=128*1024*1024, DB='starforge-support-returned-work-v1';
const encoded=value=>JSON.stringify(value);
const same=(a,b)=>encoded(a)===encoded(b);
const need=(condition,message)=>{if(!condition)throw new TypeError(message);};
const node=(tag,value)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=value;return e;};
function download(value,name,type='application/json'){
  const raw=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';
  const url=URL.createObjectURL(new Blob([raw],{type})),a=node('a');a.href=url;a.download=name;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
async function readJSON(file){
  need(file&&file.size<=MAX,'Choose one complete returned-work JSON file up to 128 MiB.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()));
}
function openStore(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('reviews',{keyPath:'id'});request.result.createObjectStore('library',{keyPath:'id'});};
    request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
    request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Close another upgrading returned-work tab, then reopen this page.'));
  });
}
async function transaction(stores,mode,action){
  const db=await openStore();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction(stores,mode);let result,failure;
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||new Error('Returned-work storage did not commit.'));
    tx.onerror=()=>{};const done=v=>{result=v;},abort=e=>{failure=e;tx.abort();};
    try{action(tx,done,abort);}catch(e){abort(e);}
  });}finally{db.close();}
}
const readRecord=id=>transaction(['reviews'],'readonly',(tx,done)=>{tx.objectStore('reviews').get(id).onsuccess=e=>done(e.target.result??null);});
const listRecords=()=>transaction(['library'],'readonly',(tx,done)=>{tx.objectStore('library').getAll().onsuccess=e=>done(e.target.result);});
async function retain(value,previous,{phase='REVIEW',receiving=null}={}){
  const clean=await inspectSupportOperatingReturn(value),id=clean.review.id;
  need(new Blob([encoded(clean)]).size<=MAX,'The complete return exceeds 128 MiB.');
  return transaction(['reviews','library'],'readwrite',(tx,done,abort)=>{
    const table=tx.objectStore('reviews');table.get(id).onsuccess=e=>{
      try{
        const found=e.target.result??null;
        if(previous){
          need(previous.id===id&&found&&found.version===previous.version,'This returned-work review changed in another tab. Reopen its saved edition.');
          need(same(found.value,previous.value)&&found.phase===previous.phase,'The saved returned-work source changed. Reopen its exact current edition.');
        }else if(found){
          need(same(found.value,clean),'A different saved review already uses this ID. Open that original review.');
          done(found);return;
        }
        const record={id,version:(found?.version??0)+1,updatedAt:new Date().toISOString(),phase,value:clean,receiving};
        table.put(record);tx.objectStore('library').put({id,version:record.version,updatedAt:record.updatedAt,
          planId:clean.review.current.id,title:clean.review.current.revisions.at(-1).title,phase});
        done(record);
      }catch(error){abort(error);}
    };
  });
}
function input(parent,label,{textarea=false,value=''}={}){
  const box=node('div'),caption=node('label',label),control=node(textarea?'textarea':'input');
  control.id='support-return-'+crypto.randomUUID();caption.htmlFor=control.id;control.value=value;
  if(textarea){control.rows=5;control.spellcheck=false;}else control.type='text';
  box.append(caption,control);parent.append(box);return control;
}
function detail(parent,label,value){
  const raw=JSON.stringify(value,null,2),d=node('details');d.append(node('summary',label));
  d.append(node('pre',raw.length<=6000?raw:raw.slice(0,6000)+'\n… Full value is retained in the downloadable original JSON.'));
  if(raw.length>6000){const b=node('button','Download complete value');b.type='button';b.addEventListener('click',()=>download(value,'support-return-value.json'));d.append(b);}
  parent.append(d);
}
export function mountSupportOperatingReturn({host,getPlan,getSources,run,receivePlan,retainWorkingDraft}){
  for(const f of[getPlan,getSources,run,receivePlan,retainWorkingDraft])need(typeof f==='function','Original editor callbacks are required.');
  let record=null,incoming=null,comparison=null;
  const area=node('section');area.className='support-section';area.id='support-returned-work';
  area.append(node('h3','4. Receive returned customer work'),
    node('p','Bring back the complete customer plan and its source descriptors. Review changes against the saved original plan, resolve differences, and receive the accepted revision.'));
  const notice=node('p');notice.role='status';notice.className='support-notice';
  const error=node('p');error.role='alert';error.className='support-error';error.hidden=true;
  const selection=node('p');selection.className='hint';area.append(notice,error,selection);
  const actions=node('div');actions.className='actions';area.append(actions);
  const library=node('select');library.setAttribute('aria-label','Saved Support returned-work reviews');actions.append(library);
  const action=fn=>run(async()=>{error.hidden=true;error.textContent='';try{await fn();}catch(e){error.textContent=(e.code?e.code+': ':'')+e.message;error.hidden=false;throw e;}});
  const button=(parent,label,fn)=>{const b=node('button',label);b.type='button';b.addEventListener('click',()=>action(fn));parent.append(b);return b;};
  async function refreshLibrary(){
    const rows=await listRecords(),selected=record?.id;library.replaceChildren();
    const none=node('option','Choose a saved review');none.value='';library.append(none);
    for(const row of rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))){
      const option=node('option',row.title+' · '+row.phase+' · '+row.updatedAt);option.value=row.id;library.append(option);
    }library.value=selected??'';
  }
  button(actions,'Open saved review',async()=>{
    need(library.value,'Choose a saved returned-work review.');
    const found=await readRecord(library.value);need(found,'The selected saved review is unavailable.');
    await inspectSupportOperatingReturn(found.value);record=found;await show();
    notice.textContent=found.phase==='APPLY_PENDING'?'The complete accepted result was retained before plan receiving. Choose Receive accepted work to reconcile and finish that same operation.':'Opened the complete saved returned-work review.';
  });
  const incomingFile=node('input');incomingFile.type='file';incomingFile.accept='.json,application/json';incomingFile.hidden=true;
  const packageFile=node('input');packageFile.type='file';packageFile.accept='.json,application/json';packageFile.hidden=true;
  const fileActions=node('div');fileActions.className='actions';area.append(fileActions,incomingFile,packageFile);
  button(fileActions,'Choose returned complete plan',()=>{incomingFile.value='';incomingFile.click();});
  const incomingLabel=node('p','Choose the complete plan returned by the customer.');incomingLabel.className='hint';area.append(incomingLabel);
  incomingFile.addEventListener('change',()=>action(async()=>{
    const file=incomingFile.files[0];if(!file)return;
    incoming=inspectOperatingPlan(await readJSON(file));
    incomingLabel.textContent=file.name+' · '+incoming.id+' · '+incoming.revisions.length+' saved revisions';
    notice.textContent='Returned complete history loaded. Create a review against the current saved plan.';
  }));
  button(fileActions,'Open complete returned-work package',()=>{packageFile.value='';packageFile.click();});
  packageFile.addEventListener('change',()=>action(async()=>{
    const file=packageFile.files[0];if(!file)return;
    const value=await inspectSupportOperatingReturn(await readJSON(file));
    record=await retain(value,null,{phase:value.review.completion?'APPLY_PENDING':'REVIEW'});
    await refreshLibrary();await show();notice.textContent='Retained the entire imported review, source descriptors, histories and carried files.';
  }));
  const fields=node('div');fields.className='support-field-grid';area.append(fields);
  const reviewer=input(fields,'Receiving reviewer');
  const notes=input(fields,'Receiving notes',{textarea:true});
  const additional=input(fields,'Additional original source descriptors · JSON array',{textarea:true,value:'[]'});
  const sourceFile=node('input');sourceFile.type='file';sourceFile.accept='.json,application/json';sourceFile.multiple=true;sourceFile.hidden=true;fields.append(sourceFile);
  const sourceButtons=node('div');sourceButtons.className='actions';area.append(sourceButtons);
  button(sourceButtons,'Add original source descriptor files',()=>{sourceFile.value='';sourceFile.click();});
  sourceFile.addEventListener('change',()=>action(async()=>{
    const prior=JSON.parse(additional.value);need(Array.isArray(prior),'Additional sources must be a JSON array.');
    const next=[...prior];for(const file of sourceFile.files){const value=await readJSON(file);next.push(...(Array.isArray(value)?value:[value]));}
    additional.value=JSON.stringify(next,null,2);notice.textContent='Added complete descriptors. The review verifies their original case lineage and exact carried evidence.';
  }));
  const reviewActions=node('div');reviewActions.className='actions';area.append(reviewActions);
  button(reviewActions,'Create returned-work review',async()=>{
    const current=getPlan();need(current&&incoming,'Open the saved original plan and select its returned complete history.');
    const extra=JSON.parse(additional.value);need(Array.isArray(extra),'Additional sources must be a JSON array.');
    const selections=[...getSources(),...extra],byKey=new Map();
    for(const source of selections){const key=encoded([source.id,source.capturedAt,source.case?.id,source.case?.revision]);
      if(byKey.has(key))need(same(byKey.get(key),source),'Two different descriptors use the same original source identity.');
      else byKey.set(key,source);
    }
    const value=await createSupportOperatingReturn(current,incoming,{sources:[...byKey.values()],id:crypto.randomUUID(),
      reviewer:reviewer.value,notes:notes.value,createdAt:new Date().toISOString()});
    record=await retain(value,null);await refreshLibrary();await show();
    notice.textContent='Saved the complete source-bound review. Review the proposed values and every unresolved difference.';
  });
  const saveDetails=button(reviewActions,'Save reviewer and notes',async()=>{
    need(record,'Open or create a returned-work review.');
    need(!record.value.review.completion,'The completed receiving record retains its original reviewer and notes.');
    const next=await reviseSupportOperatingReturn(record.value,{reviewer:reviewer.value,notes:notes.value});
    record=await retain(next,record);await refreshLibrary();await show();notice.textContent='Saved reviewer and notes with the original complete return.';
  });
  const summary=node('p'),issues=node('ul'),rows=node('div');rows.className='support-return-rows';area.append(summary,issues,rows);
  const receiveActions=node('div');receiveActions.className='actions';area.append(receiveActions);
  const apply=button(receiveActions,'Receive accepted work',async()=>{
    need(record,'Open a saved returned-work review.');
    await retainWorkingDraft();
    const current=getPlan();need(current,'Open the receiving destination plan.');
    const selected=record;
    const result=await applySupportOperatingReturn(selected.value,{current,savedAt:selected.value.review.completion?.savedAt??new Date().toISOString()});
    record=await retain(result.value,selected,{phase:'APPLY_PENDING'});
    await refreshLibrary();await show();
    await receivePlan(result.plan);
    const saved=inspectOperatingPlan(getPlan());
    const completed=result.value.review.completion.plan;
    need(saved.id===completed.id&&saved.revisions.length>=completed.revisions.length&&
      completed.revisions.every((revision,i)=>same(revision,saved.revisions[i])),
      'The original editor has not reopened the completed revision. Reopen its saved plan and continue this retained receiving operation.');
    record=await retain(result.value,record,{phase:'COMPLETE',receiving:{planId:saved.id,revision:saved.revisions.length,receivedAt:new Date().toISOString()}});
    await refreshLibrary();await show();
    notice.textContent=result.alreadyPresent?'The saved plan already contains this accepted work; later saved revisions are preserved.':'Received accepted work into the original plan and reopened its complete saved history.';
  });
  button(receiveActions,'Download complete returned work',async()=>{need(record,'Open a saved review.');download(record.value,'support-return-'+record.id+'.json');});
  button(receiveActions,'Download readable review and files',async()=>{need(record,'Open a saved review.');download(await renderSupportOperatingReturnHTML(record.value),'support-return-'+record.id+'.html','text/html;charset=utf-8');});
  button(receiveActions,'Download current saved plan',async()=>{const plan=getPlan();need(plan,'Open a saved plan.');download(inspectOperatingPlan(plan),'operating-plan-'+plan.id+'.json');});
  const original=node('details');original.append(node('summary','Source descriptors and receiving identity'));const raw=node('pre');original.append(raw);area.append(original);host.append(area);
  async function show(){
    rows.replaceChildren();issues.replaceChildren();comparison=null;
    if(!record){summary.textContent='Create or open a review to inspect returned work.';raw.textContent='';saveDetails.disabled=true;apply.disabled=true;update();return;}
    comparison=await compareSupportOperatingReturn(record.value);
    reviewer.value=record.value.review.reviewer;notes.value=record.value.review.notes;
    saveDetails.disabled=!!record.value.review.completion;
    summary.textContent=comparison.summary.changes+' changes · '+comparison.summary.conflicts+' conflicts · '+comparison.unresolved.length+' unresolved · '+record.phase;
    for(const issue of comparison.issues)issues.append(node('li',issue.key+': '+issue.message));
    for(const row of comparison.rows){
      const card=node('article');card.className='support-evidence-row';
      card.append(node('h4',row.label),node('p',row.conflict?'Review the differing values.':row.reviewed?'Explicit decision saved.':'Automatic choice: '+row.automatic));
      if(row.reason)card.append(node('p',row.reason));
      for(const [key,label]of[['base','Shared original value'],['current','Current destination value'],['incoming','Returned customer value']])detail(card,label,row[key]);
      const chosen=input(card,'Choice note',{value:row.note??''});
      const choice=node('select');choice.setAttribute('aria-label','Returned-work choice for '+row.label);
      for(const [value,label]of[['current','Keep current'],['incoming','Use returned'],['base','Use shared original'],['custom','Enter a custom JSON value']]){
        const option=node('option',label);option.value=value;choice.append(option);
      }choice.value=row.take??row.automatic??'current';card.append(choice);
      const custom=input(card,'Custom value · exact JSON',{textarea:true,value:JSON.stringify(row.value,null,2)});
      custom.hidden=choice.value!=='custom';choice.addEventListener('change',()=>{custom.hidden=choice.value!=='custom';});
      const decisions=node('div');decisions.className='actions';card.append(decisions);
      const save=button(decisions,'Save this choice',async()=>{
        need(record&&!record.value.review.completion,'Open an unfinished returned-work review.');
        const decision={take:choice.value,note:chosen.value};if(choice.value==='custom')decision.value=JSON.parse(custom.value);
        const next=await decideSupportOperatingReturn(record.value,row.key,decision);
        record=await retain(next,record);await refreshLibrary();await show();notice.textContent='Saved the exact choice and recomputed the complete source-bound review.';
      });
      const clear=button(decisions,'Use automatic choice',async()=>{
        need(record&&!record.value.review.completion,'Open an unfinished returned-work review.');
        const next=await decideSupportOperatingReturn(record.value,row.key,null);
        record=await retain(next,record);await refreshLibrary();await show();
      });
      for(const control of[chosen,choice,custom,save,clear])control.disabled=!!record.value.review.completion;
      rows.append(card);
    }
    raw.textContent=JSON.stringify({schema:record.value.schema,sources:record.value.sources,
      review:{id:record.id,currentPlan:record.value.review.current.id,currentRevisions:record.value.review.current.revisions.length,
        incomingPlan:record.value.review.incoming.id,incomingRevisions:record.value.review.incoming.revisions.length,
        reviewer:record.value.review.reviewer,notes:record.value.review.notes,decisions:record.value.review.decisions.length,
        completion:record.value.review.completion?{savedAt:record.value.review.completion.savedAt,
          planId:record.value.review.completion.plan.id,revisions:record.value.review.completion.plan.revisions.length}:null},
      savedReviewVersion:record.version,receiving:record.receiving},null,2);update();
  }
  function update(){
    const plan=getPlan();selection.textContent=plan?'Receiving destination: '+plan.id+' · saved revision '+plan.revisions.length:'Open a saved Support plan as the receiving destination.';
    apply.disabled=!record||!plan||plan.id!==record.value.review.current.id||(!record.value.review.completion&&!comparison?.ready);
  }
  show().catch(e=>{error.hidden=false;error.textContent=e.message;});
  refreshLibrary().catch(e=>{error.hidden=false;error.textContent='Returned-work storage: '+e.message;});
  return Object.freeze({update});
}
