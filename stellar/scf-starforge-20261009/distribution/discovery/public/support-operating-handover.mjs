// MIT. Complete Support handovers in the maintained Operating Plans workspace.
import {createSupportOperatingHandover,receiveSupportOperatingHandover,supportHandoverFileIdentity,
  supportHandoverPath,renderSupportOperatingHandoverHTML} from '/support-operating-core/support-operating-handover.mjs';
import {createSupportHandoverArchive,readSupportHandoverArchive} from '/support-operating-core/support-operating-handover-archive.mjs';
import {inspectSupportOperatingSource} from '/support-operating-core/support-operating-plan.mjs';
import {inspectSupportOperatingReturn} from '/support-operating-core/support-operating-return.mjs';
import {inspectOperatingPlan} from '/operating-plan-core.mjs';

const DB='starforge-support-handovers-v1',JSON_LIMIT=32*1024*1024,REVIEW_LIMIT=128*1024*1024,PAGE=40;
const clone=v=>JSON.parse(JSON.stringify(v));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const key=s=>JSON.stringify([s.id,s.capturedAt,s.case.id,s.case.revision]);
const need=(v,message)=>{if(!v)throw new TypeError(message);};
const node=(tag,value)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=value;return e;};
const identitySame=(a,b)=>a?.path===b?.path&&a?.bytes===b?.bytes&&a?.sha256===b?.sha256;
async function jsonFile(file,limit=JSON_LIMIT){
  need(file&&file.size>0&&file.size<=limit,'Choose a complete JSON file within '+(limit/1048576)+' MiB.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer()));
}
function download(blob,name){
  const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function openDB(){
  return new Promise((resolve,reject)=>{
    let failed=false;const r=indexedDB.open(DB,1);
    r.onupgradeneeded=()=>{r.result.createObjectStore('packages',{keyPath:'id'});r.result.createObjectStore('library',{keyPath:'id'});};
    r.onsuccess=()=>{if(failed){r.result.close();return;}r.result.onversionchange=()=>r.result.close();resolve(r.result);};
    r.onerror=()=>reject(r.error);
    r.onblocked=()=>{failed=true;reject(new Error('Close another upgrading handover tab, then reopen this page.'));};
  });
}
async function transaction(stores,mode,fn){
  const db=await openDB();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction(stores,mode);let result,failure;
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||new Error('The complete handover was not saved.'));
    tx.onerror=()=>{};const abort=e=>{failure=e;tx.abort();};
    try{fn(tx,v=>{result=v;},abort);}catch(e){abort(e);}
  });}finally{db.close();}
}
const listSaved=()=>transaction(['library'],'readonly',(tx,done)=>{
  tx.objectStore('library').getAll().onsuccess=e=>done(e.target.result);
});
function readSaved(id){
  return transaction(['packages','library'],'readonly',(tx,done)=>{
    const result={package:null,state:null};
    tx.objectStore('packages').get(id).onsuccess=e=>{result.package=e.target.result??null;done(result);};
    tx.objectStore('library').get(id).onsuccess=e=>{result.state=e.target.result??null;done(result);};
  });
}
/** The immutable complete Blob and compact state are committed together before plan receiving. */
function retainPackage(selected){
  const h=selected.handover;
  return transaction(['packages','library'],'readwrite',(tx,done,abort)=>{
    const table=tx.objectStore('library');table.get(h.id).onsuccess=e=>{
      try{
        const found=e.target.result;
        if(found){
          need(identitySame(found.archiveFile,selected.archiveFile),'A different complete handover already uses this ID. Open its saved package or create a new handover ID.');
          const r=tx.objectStore('packages').get(h.id);
          r.onsuccess=event=>{
            try{need(event.target.result&&identitySame(event.target.result.archiveFile,found.archiveFile),
              'The saved complete package is unavailable. Keep the downloaded archive and reopen storage.');done(found);}
            catch(error){abort(error);}
          };
          return;
        }
        const state={id:h.id,version:1,title:h.title,planId:h.plan.id,phase:'RETAINED',
          updatedAt:new Date().toISOString(),archiveFile:clone(selected.archiveFile),receiving:null};
        tx.objectStore('packages').add({id:h.id,archive:selected.archive,archiveFile:clone(selected.archiveFile),value:h});
        table.add(state);done(state);
      }catch(error){abort(error);}
    };
  });
}
/** Phase changes only update compact state; a multi-gigabyte archive is never rewritten. */
function retainPhase(previous,phase,receiving=null){
  return transaction(['library'],'readwrite',(tx,done,abort)=>{
    const table=tx.objectStore('library');table.get(previous.id).onsuccess=e=>{
      try{
        const found=e.target.result;
        need(found&&found.version===previous.version&&found.phase===previous.phase&&identitySame(found.archiveFile,previous.archiveFile),
          'This handover changed in another tab. Open its saved package and continue from the current state.');
        const next={...found,version:found.version+1,phase,receiving,updatedAt:new Date().toISOString()};
        table.put(next);done(next);
      }catch(error){abort(error);}
    };
  });
}
function input(parent,label,value='',max=1000){
  const box=node('div'),caption=node('label',label),control=node('input');
  control.type='text';control.id='support-handover-'+crypto.randomUUID();control.value=value;control.maxLength=max;caption.htmlFor=control.id;
  box.append(caption,control);parent.append(box);return control;
}
/** Full package storage is separate; the original editor remains the sole plan writer. */
export function mountSupportOperatingHandover({host,getPlan,getSources,getReturns,run,receivePlan,retainWorkingDraft}){
  need(host&&typeof host.append==='function','The original Support workspace is required.');
  for(const f of[getPlan,getSources,getReturns,run,receivePlan,retainWorkingDraft])need(typeof f==='function','Original editor callbacks are required.');
  let selected=null,record=null,page=0;
  const companions=new Map(),reviews=new Map();
  const area=node('section');area.className='support-section';area.id='support-complete-handover';
  area.append(node('h3','6. Complete customer handover'),
    node('p','Prepare one portable archive containing the complete saved plan, returned-work reviews and every original native companion. Reopen it here to retain its source files and receive the editable plan.'));
  const notice=node('p');notice.className='support-notice';notice.role='status';notice.setAttribute('aria-live','polite');
  const error=node('p');error.className='support-error';error.role='alert';error.hidden=true;
  const destination=node('p');destination.className='hint';area.append(notice,error,destination);
  const action=fn=>run(async()=>{
    error.hidden=true;error.textContent='';
    try{await fn();}catch(e){
      error.hidden=false;error.textContent=(e.code?e.code+': ':'')+e.message+
        (e.name==='QuotaExceededError'?' Browser storage is full. Download the complete archive, free storage, then choose Retain this complete package again.':'');
      throw e;
    }
  });
  const button=(parent,label,fn)=>{
    const b=node('button',label);b.type='button';b.addEventListener('click',()=>action(fn));parent.append(b);return b;
  };
  const fields=node('div');fields.className='support-field-grid';area.append(fields);
  const id=input(fields,'Stable handover ID',crypto.randomUUID(),128);
  const title=input(fields,'Handover title','Customer Support handover',1000);
  const owner=input(fields,'Preparing operator','',300);
  const includeLabel=node('label'),include=node('input');include.type='checkbox';include.checked=true;
  includeLabel.append(include,document.createTextNode(' Include the currently opened returned-work review'));area.append(includeLabel);
  const inputs=node('div');inputs.className='actions';area.append(inputs);
  const directory=node('input');directory.type='file';directory.multiple=true;directory.webkitdirectory=true;directory.setAttribute('webkitdirectory','');directory.hidden=true;
  const reviewInput=node('input');reviewInput.type='file';reviewInput.multiple=true;reviewInput.accept='.json,application/json';reviewInput.hidden=true;
  const archiveInput=node('input');archiveInput.type='file';archiveInput.accept='.tar,application/x-tar';archiveInput.hidden=true;
  inputs.append(directory,reviewInput,archiveInput);
  button(inputs,'Add original companion directory',()=>{directory.value='';directory.click();});
  button(inputs,'Add complete returned-work reviews',()=>{reviewInput.value='';reviewInput.click();});
  button(inputs,'Clear creation inputs',()=>{companions.clear();reviews.clear();showInputs();notice.textContent='Cleared selected creation inputs. Saved packages remain available.';});
  const inputSummary=node('p'),inputRows=node('div');area.append(inputSummary,inputRows);
  function showInputs(){
    inputSummary.textContent=companions.size+' complete companion directories · '+reviews.size+' additional returned-work reviews';
    inputRows.replaceChildren();
    for(const [k,c]of companions){
      const row=node('div');row.append(node('span',c.source.id+' · case '+c.source.case.id+' · '+c.files.size+' original files '));
      button(row,'Remove this companion',()=>{companions.delete(k);showInputs();});inputRows.append(row);
    }
    for(const [k,r]of reviews){
      const row=node('div');row.append(node('span','Returned-work review '+k+' '));
      button(row,'Remove this review',()=>{reviews.delete(k);showInputs();});inputRows.append(row);
    }
  }
  directory.addEventListener('change',()=>action(async()=>{
    const chosen=Array.from(directory.files);if(!chosen.length)return;
    need(companions.size<100,'A complete handover supports up to 100 original companions.');
    need(chosen.length<=310001,'The selected directory exceeds the original companion member limit.');
    const files=new Map(),roots=new Set();let bytes=0;
    for(const file of chosen){
      const parts=file.webkitRelativePath.split('/');need(parts.length>1,'Select the complete original companion directory.');
      roots.add(parts.shift());const path=supportHandoverPath(parts.join('/'));
      need(!files.has(path),'The selected directory repeats an original path.');
      need(file.size>0&&file.size<=512*1024*1024,'An original companion file exceeds its 512 MiB limit or is empty.');
      files.set(path,file);bytes+=file.size;
    }
    need(roots.size===1,'Choose one complete original companion directory at a time.');
    const source=inspectSupportOperatingSource(await jsonFile(files.get('SOURCE.json'))),manifest=await jsonFile(files.get('MANIFEST.json'));
    need(manifest&&Array.isArray(manifest.files)&&manifest.files.length>0,'Choose a directory with its original complete MANIFEST.json.');
    const declared=new Set(['MANIFEST.json',...manifest.files.map(f=>supportHandoverPath(f.path))]);
    need(declared.size===manifest.files.length+1&&declared.size===files.size&&[...declared].every(p=>files.has(p)),
      'The directory must contain exactly every original manifest member and MANIFEST.json.');
    need(bytes-files.get('MANIFEST.json').size<=4*1024*1024*1024,'The original companion exceeds 4 GiB.');
    const sourceFile=await supportHandoverFileIdentity('SOURCE.json',files.get('SOURCE.json'));
    const manifestFile=await supportHandoverFileIdentity('MANIFEST.json',files.get('MANIFEST.json'));
    const k=key(source),existing=companions.get(k);
    need(!existing||(same(existing.source,source)&&identitySame(existing.manifestFile,manifestFile)),
      'A different full source or manifest already uses this original companion identity.');
    companions.set(k,{source,sourceFile,manifestFile,manifest,files});showInputs();
    notice.textContent='Selected the complete original directory. Creating the package verifies every member against its manifest.';
  }));
  reviewInput.addEventListener('change',()=>action(async()=>{
    const loaded=new Map(reviews);
    for(const file of reviewInput.files){
      const value=await inspectSupportOperatingReturn(await jsonFile(file,REVIEW_LIMIT)),prior=loaded.get(value.review.id);
      need(!prior||same(prior,value),'A different returned-work review uses this same ID.');
      loaded.set(value.review.id,value);need(loaded.size<=100,'A complete handover supports up to 100 returned-work reviews.');
    }
    reviews.clear();for(const [k,v]of loaded)reviews.set(k,v);showInputs();
    notice.textContent='Added the complete selected reviews. Every referenced original source needs its companion directory.';
  }));
  button(inputs,'Create and retain complete package',async()=>{
    const plan=getPlan();need(plan,'Open the complete saved Support plan.');
    const savedPlan=inspectOperatingPlan(clone(plan)),selectedReviews=new Map(reviews),sources=new Map();
    if(include.checked)for(const value of getReturns()){
      const validated=await inspectSupportOperatingReturn(value),prior=selectedReviews.get(validated.review.id);
      need(!prior||same(prior,validated),'The opened and uploaded review editions differ. Select the intended complete edition.');
      selectedReviews.set(validated.review.id,validated);
    }
    const addSource=value=>{
      const s=inspectSupportOperatingSource(value),k=key(s),prior=sources.get(k);
      need(!prior||same(prior,s),'Different source descriptors use the same original source identity.');sources.set(k,s);
    };
    for(const s of getSources())addSource(s);
    for(const c of companions.values())addSource(c.source);
    for(const r of selectedReviews.values())for(const s of r.sources)addSource(s);
    const ordered=[...sources.values()],members=new Map();
    const selectedCompanions=ordered.map((s,sourceIndex)=>{
      const c=companions.get(key(s));need(c&&same(c.source,s),'Select the complete original companion for source '+s.id+'.');
      for(const [path,file]of c.files)members.set('companions/'+sourceIndex+'/'+path,file);
      return {sourceIndex,sourceFile:c.sourceFile,manifestFile:c.manifestFile,manifest:c.manifest};
    });
    notice.textContent='Verifying every complete original member and preparing the portable archive…';
    const h=await createSupportOperatingHandover({id:id.value,title:title.value,owner:owner.value,createdAt:new Date().toISOString(),
      plan:savedPlan,sources:ordered,returns:[...selectedReviews.values()],companions:selectedCompanions});
    const next=await createSupportHandoverArchive(h,async path=>members.get(path));
    await activate(next);await saveSelected();
    notice.textContent='Saved the complete portable archive and all original source members. Download it for the customer or another computer.';
  });
  const savedActions=node('div');savedActions.className='actions';area.append(savedActions);
  const library=node('select');library.setAttribute('aria-label','Saved complete Support handovers');savedActions.append(library);
  async function refreshLibrary(){
    const rows=await listSaved();library.replaceChildren();
    const empty=node('option','Choose a saved complete handover');empty.value='';library.append(empty);
    for(const row of rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))){
      const option=node('option',row.title+' · '+row.phase+' · '+row.updatedAt);option.value=row.id;library.append(option);
    }
    library.value=record?.id??'';
  }
  button(savedActions,'Refresh saved packages',refreshLibrary);
  button(savedActions,'Open saved complete package',async()=>{
    need(library.value,'Choose a saved complete package.');const saved=await readSaved(library.value);
    need(saved.package&&saved.state&&identitySame(saved.package.archiveFile,saved.state.archiveFile),'The saved archive or its receiving state is unavailable.');
    notice.textContent='Reopening and verifying the complete saved archive…';
    const next=await readSupportHandoverArchive(saved.package.archive,{expectedArchive:saved.state.archiveFile});
    need(same(next.handover,saved.package.value),'The saved editable document differs from the complete archive.');
    await activate(next,saved.state);
    notice.textContent=saved.state.phase==='RECEIVE_PENDING'
      ?'The complete package was retained before receiving. Choose Receive editable plan to finish the same operation.'
      :'Opened the complete saved package, editable histories and every original companion.';
  });
  button(savedActions,'Open portable handover archive',()=>{archiveInput.value='';archiveInput.click();});
  archiveInput.addEventListener('change',()=>action(async()=>{
    const file=archiveInput.files[0];if(!file)return;notice.textContent='Reading and verifying the complete portable archive…';
    await activate(await readSupportHandoverArchive(file));await saveSelected();
    notice.textContent='Retained the complete imported archive before receiving any plan. Review its selection and choose Receive editable plan.';
  }));
  button(savedActions,'Request persistent browser storage',async()=>{
    need(navigator.storage&&typeof navigator.storage.persist==='function','This browser does not expose persistent-storage requests. Keep a downloaded complete archive.');
    const retained=await navigator.storage.persist();
    notice.textContent=retained?'The browser granted persistent local storage. Keep a portable archive for another device.'
      :'The browser retained ordinary local storage. Download the complete archive to keep a separate portable copy.';
  });
  const summary=node('p'),identity=node('pre'),memberSummary=node('p'),members=node('div');
  identity.style.overflowWrap='anywhere';identity.style.whiteSpace='pre-wrap';area.append(summary,identity);
  const packageActions=node('div');packageActions.className='actions';area.append(packageActions);
  button(packageActions,'Retain this complete package',saveSelected);
  const receive=button(packageActions,'Receive editable plan',async()=>{
    need(selected&&record,'Retain the complete package before receiving its editable plan.');
    await retainWorkingDraft();
    const current=getPlan();
    await receiveSupportOperatingHandover(selected.handover,current?.id===selected.handover.plan.id?current:null);
    record=await retainPhase(record,'RECEIVE_PENDING');show();await refreshLibrary();
    await receivePlan(selected.handover.plan);
    const reopened=inspectOperatingPlan(getPlan());
    need(reopened.id===selected.handover.plan.id,'Open the original receiving plan to finish this retained operation.');
    const check=await receiveSupportOperatingHandover(selected.handover,reopened);
    need(check.addedRevisions===0&&same(check.plan,reopened),'The original editor has not reopened the complete received history. Reopen the saved package and finish receiving.');
    record=await retainPhase(record,'COMPLETE',{planId:reopened.id,revisions:reopened.revisions.length,receivedAt:new Date().toISOString()});
    show();await refreshLibrary();
    notice.textContent='Received the editable plan through the original plan store. The complete archive and native companions remain saved for download and native receiving.';
  });
  button(packageActions,'Download complete archive',()=>{
    need(selected,'Open or create a complete package.');download(selected.archive,'support-handover-'+selected.handover.id+'.tar');
  });
  button(packageActions,'Download complete editable document',async()=>{
    need(selected,'Open or create a complete package.');download(await selected.read('HANDOVER.json'),'HANDOVER.json');
  });
  button(packageActions,'Download readable handover',async()=>{
    need(selected,'Open or create a complete package.');
    const html=await renderSupportOperatingHandoverHTML(selected.handover);download(new Blob([html],{type:'text/html;charset=utf-8'}),'support-handover-'+selected.handover.id+'.html');
  });
  const paging=node('div');paging.className='actions';
  const previous=button(paging,'Previous original files',()=>{page=Math.max(0,page-1);showMembers();});
  const next=button(paging,'Next original files',()=>{page++;showMembers();});
  area.append(memberSummary,paging,members);
  async function saveSelected(){
    need(selected,'Open or create a complete package first.');
    record=await retainPackage(selected);show();await refreshLibrary();
    notice.textContent='Retained the exact complete archive and receiving state in this browser.';
  }
  async function activate(value,state=null){selected=value;record=state;page=0;show();}
  function showMembers(){
    members.replaceChildren();const list=selected?.files??[],pages=Math.max(1,Math.ceil(list.length/PAGE));
    page=Math.min(page,pages-1);previous.disabled=page===0;next.disabled=page>=pages-1;
    memberSummary.textContent=list.length?'Original files '+(page*PAGE+1)+'–'+Math.min((page+1)*PAGE,list.length)+' of '+list.length:'Open a package to inspect its original files.';
    for(const f of list.slice(page*PAGE,(page+1)*PAGE)){
      const row=node('article');row.className='support-evidence-row';
      row.append(node('strong',f.path),node('p',f.bytes+' bytes · SHA-256 '+f.sha256));
      button(row,'Download exact original file',async()=>download(await selected.read(f.path),f.path.split('/').at(-1)));members.append(row);
    }
  }
  function show(){
    if(!selected){summary.textContent='Create or open one complete portable Support handover.';identity.textContent='';}
    else{
      const h=selected.handover;
      summary.textContent=h.title+' · '+h.plan.revisions.length+' saved revisions · '+h.returns.length+' returned-work reviews · '+h.sources.length+' original companions · '+(record?.phase??'AVAILABLE — LOCAL SAVE REQUIRED');
      identity.textContent=JSON.stringify({id:h.id,plan:h.plan.id,preparedBy:h.owner,createdAt:h.createdAt,
        archive:selected.archiveFile,document:selected.documentFile,originalFiles:selected.memberCount,originalBytes:selected.bytes,
        savedVersion:record?.version??null,receiving:record?.receiving??null},null,2);
    }
    showMembers();update();
  }
  function update(){
    const p=getPlan();destination.textContent=p?'Open saved plan: '+p.id+' · revision '+p.revisions.length:'Open or receive a saved Support plan.';
    receive.disabled=!selected||!record;
  }
  host.append(area);showInputs();show();
  refreshLibrary().catch(e=>{error.hidden=false;error.textContent='Complete handover storage: '+e.message;});
  return Object.freeze({update});
}
