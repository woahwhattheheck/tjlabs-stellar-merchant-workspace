// MIT. Grant source review uses the original OperatingPlan history and browser stores.
import * as tracker from '/grant-tracker-core/grant-tracker.mjs';
import { createOperatingFile, operatingFileBytes } from '/operating-plan-core.mjs';

const FIELDS = [['funder','Funder'],['program','Program or fund'],['requested','Amount requested'],
  ['stage','Stage'],['loiDue','LOI due'],['proposalDue','Proposal due'],['decisionExpected','Decision expected'],
  ['awardStart','Award start'],['reportDue','Report due'],['owner','Owner'],['contact','Contact'],
  ['notes','Notes'],['awarded','Amount awarded'],['currency','Currency']];
const DISPOSITIONS = ['unresolved','candidate','active-award','historical-award','excluded'];
const KINDS = ['loi','proposal','decision','report','renewal','other'];
const STATES = ['unconfirmed','confirmed','completed','waived'];
const copy = value => JSON.parse(JSON.stringify(value));
const MAX = 32 * 1024 * 1024, WORKING_MAX = 64 * 1024 * 1024;
const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
const el = (tag,text,cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
function button(label,fn) {
  const node=el('button',label); node.type='button';
  node.addEventListener('click',fn); return node;
}
function input(label,value,oninput,{type='text',area=false}={}) {
  const box=el('label',undefined,'gt-field'), title=el('span',label);
  const control=el(area?'textarea':'input');
  if (!area) control.type=type;
  control.value=value??''; if(area) control.rows=3;
  control.addEventListener('input',()=>oninput(control.value));
  box.append(title,control); return box;
}
function select(label,value,options,onchange) {
  const box=el('label',undefined,'gt-field'), control=el('select');
  for (const item of options) {
    const [key,title]=Array.isArray(item)?item:[item,item];
    control.append(new Option(title,key));
  }
  control.value=value??'';
  control.addEventListener('change',()=>onchange(control.value));
  box.append(el('span',label),control); return box;
}
function detail(label,value) {
  const box=el('details'), pre=el('pre');
  box.addEventListener('toggle',()=>{if(box.open&&!pre.dataset.ready){pre.textContent=typeof value==='string'?value:JSON.stringify(value,null,2);pre.dataset.ready='true';}});
  box.append(el('summary',label),pre); return box;
}
function download(name,content,type='application/json') {
  const body=typeof content==='string'||content instanceof Uint8Array ? content:JSON.stringify(content,null,2)+'\n';
  const url=URL.createObjectURL(new Blob([body],{type}));
  const anchor=el('a'); anchor.href=url; anchor.download=name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function freshSource() {
  return {id:'source-'+crypto.randomUUID().slice(0,12),kind:'tracker',url:'',note:'',
    format:'csv',encoding:'utf-8',headerRow:1,mapping:Object.fromEntries(FIELDS.map(([key])=>[key,null])),file:null};
}
const identity = ctx => ctx.plan ? ctx.plan.id+':'+(ctx.revision??ctx.plan.revisions.length) : '';
function fail(message){throw new Error(message);}

/**
 * The host supplies its existing plans/drafts transactions. UI drafts live in the
 * existing drafts store under a separate planId namespace; saved domain state is
 * exclusively the complete original OperatingPlan.
 */
export function mountGrantTracker({host,getContext,commit,create,drafts}) {
  const session=crypto.randomUUID();
  let view=null, contextKey='', epoch=0, busy=false, expanded=false, state=null, selectedRow='', page=1, query='';
  let saves=Promise.resolve(), pending=0, saveFailed=false, remembered=new Map(), preview=null;
  let loadedKey='', sourceRestoreKeys=[], pendingUpdate=false, statePlan=null, embeddedPlan=null;
  host.classList.add('grant-tracker');
  const title=el('div',undefined,'gt-heading'), status=el('p','Import a complete tracker, review source evidence and retain editable obligations.','gt-status');
  status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  const error=el('p',undefined,'gt-error'); error.setAttribute('role','alert'); error.hidden=true;
  const tools=el('div',undefined,'gt-actions'), contents=el('div'); contents.hidden=true;
  const toggle=button('Open grant tracker',()=>{expanded=!expanded;contents.hidden=!expanded;if(expanded)update();});
  title.append(el('h2','Grant tracker'),toggle);
  const createBox=el('form',undefined,'gt-create');
  const createTitle=el('input'); createTitle.required=true;createTitle.maxLength=300;createTitle.placeholder='Grant tracker title';
  createTitle.setAttribute('aria-label','New grant tracker title');
  const createButton=el('button','Create grant tracker');createButton.type='submit';
  createBox.append(createTitle,createButton);
  createBox.addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    const plan=await tracker.createGrantTracker({id:'grant-'+crypto.randomUUID(),title:createTitle.value});
    await create(plan); createTitle.value=''; expanded=true;contents.hidden=false;
  });});
  const workingDownload=button('Download working review',()=>{
    if(!state)return;
    const document={schema:'stellar-forge.grant-tracker-working.v1',plan:statePlan??view?.plan??getContext().plan,state};
    if(new Blob([JSON.stringify(document,null,2)+'\n']).size>WORKING_MAX){showError(new Error('The complete working review exceeds 64 MiB. Download its saved plan and preserve the working inputs before continuing.'));return;}
    download('grant-working-review.json',document);
  });
  const recover=el('select');recover.setAttribute('aria-label','Retained grant working reviews');
  const recoverButton=button('Open retained working review',()=>run(async()=>{
    const chosen=sourceRestoreKeys.find(row=>row.key===recover.value);
    if(!chosen)fail('Select a retained working review.');
    const candidate=copy(validateState(chosen.state));
    if(candidate.planId!==getContext().plan?.id)fail('The retained working review belongs to another plan.');
    state=candidate;statePlan=getContext().plan; loadedKey=chosen.key;preview=null;selectedRow=state.selectedRow; render();
    status.textContent='Retained working review opened. Its original revision remains bound; stale row edits must be reviewed against the current saved row.';
  }));
  const workingFile=el('input');workingFile.type='file';workingFile.accept='.json,application/json';
  workingFile.setAttribute('aria-label','Open working review JSON');
  workingFile.addEventListener('change',event=>{
    const file=event.target.files[0];event.target.value='';
    if(file)run(async()=>{
      if(file.size>WORKING_MAX)fail('The complete working review exceeds 64 MiB.');
      const doc=JSON.parse(await file.text());
      if(doc.schema!=='stellar-forge.grant-tracker-working.v1'||!doc.plan||!doc.state)fail('Choose a complete grant working review.');
      await tracker.inspectGrantTracker(doc.plan);
      const ctx=getContext();
      if(!ctx.plan||ctx.plan.id!==doc.plan.id||ctx.plan.createdAt!==doc.plan.createdAt)fail('Open this working review’s original saved plan first.');
      if(doc.state.planId!==ctx.plan.id)fail('The working review identity differs from its original plan.');
      // Same identity and revision number are insufficient when two editors branched.
      // Use the original complete-history receiver without mutating the saved plan.
      const compatible=await tracker.receiveGrantTracker(doc.plan,ctx.plan);
      if(compatible.addedRevisions>0){
        embeddedPlan=doc.plan;embeddedDownload.hidden=false;
        fail('This working review uses saved revisions not yet in this browser. Download its complete original plan using the new button, receive that plan through Import complete plan, then reopen this working review. Your current working inputs remain unchanged.');
      }
      const candidate=copy(validateState(doc.state));
      if(Object.values(candidate.rows).some(row=>row.baseRevision>doc.plan.revisions.length))
        fail('A working row refers to a revision missing from its complete original plan.');
      state=candidate;statePlan=doc.plan;preview=null;selectedRow=state.selectedRow;
      remember();render();status.textContent='Complete working review imported. Save individual rows only against their original revision.';
    });
  });
  const embeddedDownload=button('Download the working review’s complete original plan',()=>{
    if(embeddedPlan)download('grant-working-original-plan.json',embeddedPlan);
  });
  embeddedDownload.hidden=true;
  tools.append(workingDownload,recover,recoverButton,workingFile,embeddedDownload);
  const panel=el('div'); contents.append(tools,panel);
  host.append(title,status,error,createBox,contents);
  function showError(value){error.hidden=!value;error.textContent=value?((value.code?value.code+': ':'')+value.message):'';}
  function validateState(value){
    const plain=item=>item!==null&&typeof item==='object'&&!Array.isArray(item)&&
      (Object.getPrototypeOf(item)===Object.prototype||Object.getPrototypeOf(item)===null);
    const object=(item,keys,label)=>{
      if(!plain(item)||Object.keys(item).some(key=>!keys.includes(key))||keys.some(key=>!own(item,key)))
        fail(label+' has an invalid or incomplete structure.');
    };
    const text=(item,label,max=32000)=>{
      if(typeof item!=='string'||item.length>max||item.includes('\0'))fail(label+' must be complete text.');
    };
    const choose=(item,options,label)=>{if(!options.includes(item))fail(label+' has an unsupported choice.');};
    object(value,['planId','rows','source','selectedRow'],'Working review');
    text(value.planId,'Working plan identity',128);
    if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value.planId))fail('The working plan identity is invalid.');
    text(value.selectedRow,'Selected physical row',128);
    if(!plain(value.rows)||Object.keys(value.rows).length>1000)fail('Retain at most 1,000 physical-row working edits.');
    for(const [rowId,row] of Object.entries(value.rows)){
      if(!/^grant-row\.[a-zA-Z0-9][a-zA-Z0-9._-]*\.[1-9][0-9]*$/.test(rowId)||rowId.length>128)
        fail('A working edit must retain its complete physical grant-row identity.');
      object(row,['baseRevision','record'],'Working row');
      if(!Number.isSafeInteger(row.baseRevision)||row.baseRevision<1)fail('A working row needs its original positive revision.');
      const record=row.record;
      object(record,['disposition','reason','edits','relationship','obligations'],'Working row review');
      choose(record.disposition,DISPOSITIONS,'Row disposition');text(record.reason,'Disposition reason');
      if(!plain(record.edits)||Object.keys(record.edits).some(key=>!FIELDS.some(([field])=>field===key)))
        fail('Working field edits must refer to retained grant fields.');
      for(const [field,edit] of Object.entries(record.edits)){
        object(edit,['value','reason'],'Working field '+field);text(edit.value,'Working value');text(edit.reason,'Working value reason');
      }
      const relation=record.relationship;
      object(relation,['kind','target','reason'],'Working relationship');
      choose(relation.kind,['unresolved','distinct','related','duplicate'],'Relationship');
      if(relation.target!==null)text(relation.target,'Related physical row',128);
      text(relation.reason,'Relationship reason');
      if(!Array.isArray(record.obligations)||record.obligations.length>100)fail('Retain at most 100 complete working obligation objects per row.');
      for(const obligation of record.obligations){
        object(obligation,['id','kind','due','owner','status','evidenceSourceId','locator','reason','recordedResult'],'Working obligation');
        text(obligation.id,'Working obligation ID',48);
        choose(obligation.kind,KINDS,'Obligation kind');choose(obligation.status,STATES,'Obligation state');
        text(obligation.due,'Working obligation date',32);text(obligation.owner,'Working obligation owner',1000);
        if(obligation.evidenceSourceId!==null)text(obligation.evidenceSourceId,'Working evidence source',48);
        for(const key of ['locator','reason','recordedResult'])text(obligation[key],'Working obligation '+key);
      }
    }
    const source=value.source;
    object(source,['id','kind','url','note','format','encoding','headerRow','mapping','file'],'Working source');
    text(source.id,'Working source ID',48);text(source.url,'Working source URL',8000);text(source.note,'Working source note');
    choose(source.kind,['tracker','award-terms','award-history','supporting'],'Source kind');
    choose(source.format,['csv','tsv','binary'],'Source format');choose(source.encoding,['utf-8','windows-1252'],'Source encoding');
    if(typeof source.headerRow==='string')text(source.headerRow,'Working header record',32);
    else if(!Number.isSafeInteger(source.headerRow))fail('The working header record must be text or an exact integer.');
    object(source.mapping,FIELDS.map(([key])=>key),'Working positional mapping');
    for(const column of Object.values(source.mapping))
      if(column!==null&&(!Number.isSafeInteger(column)||column<0||column>=512))fail('A working column must be its exact physical position or null.');
    if(source.file!==null)operatingFileBytes(source.file);
    if(new Blob([JSON.stringify(value)]).size>MAX)fail('The complete working review exceeds 32 MiB.');
    return value;
  }
  function remember(){
    if(!state)return;
    const captured=copy(state);
    try{validateState(captured);}catch(value){saveFailed=true;showError(value);return;}
    const key='grant-tracker:'+captured.planId+':'+session;
    remembered.set(captured.planId,captured);
    const record={key,planId:'grant-tracker:'+captured.planId,sessionId:session,
      updatedAt:new Date().toISOString(),kind:'grant-tracker-working',state:captured};
    pending++;
    saves=saves.catch(()=>{}).then(()=>drafts.put(record)).then(()=>{
      saveFailed=false;
    },value=>{saveFailed=true;showError(value);status.textContent='The latest inputs remain open. Download Working review JSON to preserve them.';})
      .finally(()=>{pending--;});
  }
  async function run(action){
    if(busy)return;
    busy=true;showError(null);panel.inert=true;createBox.inert=true;tools.inert=true;
    try{await action();}
    catch(value){showError(value);}
    finally{
      busy=false;panel.inert=false;createBox.inert=false;tools.inert=false;
      if(pendingUpdate){pendingUpdate=false;await update();}
    }
  }
  function currentBinding(){
    const ctx=getContext();
    if(!view||identity(ctx)!==contextKey||ctx.plan!==view.plan&&JSON.stringify(ctx.plan)!==JSON.stringify(view.plan))fail('The selected saved plan changed. Reopen it before recording this work.');
    if(ctx.revision!==null&&ctx.revision!==undefined)fail('This saved historical revision is read only. Open the current revision first.');
    if(ctx.dirty)fail('Save or reopen the generic operating-plan draft before recording grant work.');
    return ctx.plan;
  }
  async function saveCandidate(candidate,base){
    const current=getContext();
    if(!current.plan||current.plan.id!==base.id||JSON.stringify(current.plan)!==JSON.stringify(base))fail('The selected plan advanced while this work was being prepared. Your inputs remain retained.');
    await tracker.inspectGrantTracker(candidate);
    await commit(candidate,base);
    pendingUpdate=true;
  }
  async function update(){
    if(busy){pendingUpdate=true;return;}
    const ctx=getContext(),key=identity(ctx),generation=++epoch;
    if(!ctx.plan||!tracker.isGrantTracker(ctx.plan)){
      view=null;contextKey=key;panel.replaceChildren(el('p','Create or open a source-backed grant tracker. Other operating plans remain available in the same workspace.'));
      return;
    }
    if(key===contextKey&&view){
      status.textContent=ctx.dirty?'The generic operating-plan draft has unsaved changes. Save or reopen it before recording grant edits.':'Grant tracker revision '+view.revision+' · '+view.rows.length+' complete physical rows.';
      return;
    }
    try{
      const next=await tracker.inspectGrantTracker(ctx.plan,{revision:ctx.revision??undefined});
      if(generation!==epoch||identity(getContext())!==key)return;
      const existing=await drafts.list('grant-tracker:'+ctx.plan.id);
      if(generation!==epoch||identity(getContext())!==key)return;
      view=next;contextKey=key;loadedKey='';
      sourceRestoreKeys=existing.filter(x=>x.kind==='grant-tracker-working'&&x.state).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
      const retained=remembered.get(ctx.plan.id)??sourceRestoreKeys[0]?.state??{planId:ctx.plan.id,rows:{},source:freshSource(),selectedRow:''};
      const candidate=copy(validateState(retained));
      if(candidate.planId!==ctx.plan.id)fail('The retained working review belongs to another plan.');
      state=candidate;statePlan=view.plan;selectedRow=state.selectedRow||view.rows[0]?.id||'';preview=null;
      recover.replaceChildren(new Option('Retained working reviews',''));
      for(const record of sourceRestoreKeys)recover.append(new Option(record.updatedAt+' · '+record.sessionId,record.key));
      status.textContent='Grant tracker revision '+view.revision+' · '+view.rows.length+' complete physical rows.';
      render();showError(null);
    }catch(value){if(generation===epoch){view=null;panel.replaceChildren();showError(value);}}
  }
  function changeSource(key,value){state.source[key]=value;preview=null;remember();}
  async function makePreview(){
    const source=state.source;
    if(!source.file)fail('Select the complete original file.');
    const pendingSource={...source,name:source.file.name,mediaType:source.file.mediaType,bytes:operatingFileBytes(source.file)};
    delete pendingSource.file;
    preview=await tracker.previewGrantSource(pendingSource);
    // Suggestions are applied only by the explicit operator button.
    renderSource();
  }
  const sourceSection=el('details'),rowSection=el('section'),exportSection=el('section');
  function render(){
    if(!view||!state)return;
    panel.replaceChildren();
    const counts=el('div',undefined,'gt-counts');
    counts.append(el('p',view.rows.length+' physical rows · '+view.sources.length+' retained sources'),
      detail('Full validation and coverage', {ready:view.ready,counts:view.counts}));
    if(getContext().revision!==null&&getContext().revision!==undefined)counts.append(el('p','Historical revision · all source downloads remain available; new edits require the current saved revision.'));
    panel.append(counts,sourceSection,rowSection,exportSection);
    renderSource();renderRows();renderExports();
  }
  function renderSource(){
    const wasOpen=sourceSection.open;sourceSection.replaceChildren(el('summary','Original sources and positional column mapping'));sourceSection.open=wasOpen;
    const inventory=el('div',undefined,'gt-source-list');
    for(const source of view.sources){
      const {original,descriptorFile,records,rows,...metadata}=source;
      const item=detail(source.id+' · '+source.name,metadata);
      item.append(button('Download original '+source.name,()=>download(source.name,operatingFileBytes(original),source.mediaType)),
        detail('Every parsed physical record',records));
      inventory.append(item);
    }
    sourceSection.append(inventory);
    const source=state.source,fields=el('div',undefined,'gt-grid'),fileInput=el('input');
    fileInput.type='file';fileInput.setAttribute('aria-label','Complete original grant source');
    fileInput.addEventListener('change',event=>{
      const file=event.target.files[0];event.target.value='';
      if(file)run(async()=>{
        if(file.size>24*1024*1024)fail('Keep the entire original file within 24 MiB.');
        const data=new Uint8Array(await file.arrayBuffer());
        state.source.file=createOperatingFile({id:'source-upload',name:file.name,mediaType:file.type||'application/octet-stream',bytes:data});
        preview=null;remember();renderSource();
      });
    });
    fields.append(input('Stable source ID',source.id,v=>changeSource('id',v)),
      select('Source kind',source.kind,['tracker','award-terms','award-history','supporting'],v=>changeSource('kind',v)),
      select('Format',source.format,['csv','tsv','binary'],v=>{changeSource('format',v);renderSource();}),
      input('Original source URL',source.url,v=>changeSource('url',v)),
      input('Source note',source.note,v=>changeSource('note',v),{area:true}));
    sourceSection.append(fields,fileInput,el('p',source.file?source.file.name+' · '+source.file.bytes+' complete bytes retained in working review':'No pending source selected.'));
    if(source.format!=='binary'){
      fields.append(select('Text encoding',source.encoding,['utf-8','windows-1252'],v=>changeSource('encoding',v)),
        input('Header record (1-based)',source.headerRow,v=>changeSource('headerRow',v),{type:'number'}));
      sourceSection.append(button('Read all physical records and map columns',()=>run(async()=>{
        source.headerRow=Number(source.headerRow);await makePreview();remember();
      })));
      if(preview){
        sourceSection.append(el('p',preview.records.length+' complete physical records; duplicate headings are separate positions.'),
          detail('All original parsed physical records',preview.records),
          button('Use unique exact published heading matches',()=>{
            const proposal=tracker.suggestGrantMapping(preview.headers);
            source.mapping=copy(proposal.mapping);remember();renderSource();
          }));
        const mapping=el('div',undefined,'gt-grid');
        for(const [key,label] of FIELDS){
          mapping.append(select(label,source.mapping[key]===null?'':String(source.mapping[key]),
            [['','Not mapped'],...preview.headers.map((header,index)=>[String(index),(index+1)+': '+JSON.stringify(header)])],
            value=>{source.mapping[key]=value===''?null:Number(value);remember();}));
        }
        sourceSection.append(mapping);
      }
    }
    sourceSection.append(button('Import complete source as saved revision',()=>run(async()=>{
      const base=currentBinding(),s=copy(state.source);
      if(!s.file)fail('Select the complete original file.');
      if(s.format!=='binary'&&!preview)fail('Review the positional mapping before importing.');
      const candidate=await tracker.importGrantSource(base,{id:s.id,kind:s.kind,name:s.file.name,
        mediaType:s.file.mediaType,bytes:operatingFileBytes(s.file),url:s.url,note:s.note,format:s.format,
        ...(s.format==='binary'?{}:{encoding:s.encoding,headerRow:Number(s.headerRow),mapping:s.mapping})},
        {expectedRevision:base.revisions.length});
      await saveCandidate(candidate,base);
      state.source=freshSource();preview=null;remember();
    })));
  }
  function rowDraft(row){
    if(!state.rows[row.id])state.rows[row.id]={baseRevision:view.revision,record:copy(row.record)};
    return state.rows[row.id];
  }
  function renderRows(){
    rowSection.replaceChildren(el('h3','Review every physical row'));
    const search=el('input');search.type='search';search.placeholder='Find source, row, funder or programme';search.value=query;
    search.setAttribute('aria-label','Search grant rows');
    search.addEventListener('input',()=>{query=search.value;page=1;renderList();});
    const list=el('div'),editor=el('div',undefined,'gt-row-editor');
    rowSection.append(search,list,editor);
    function renderList(){
      const matching=view.rows.filter(row=>!query||[row.id,row.sourceId,row.rowNumber,JSON.stringify(row.values)].join(' ').toLowerCase().includes(query.toLowerCase()));
      const pages=Math.max(1,Math.ceil(matching.length/20));page=Math.min(Math.max(page,1),pages);
      const table=el('table'),head=el('tr');
      for(const title of ['Physical row','Funder / programme','Disposition','Issues'])head.append(el('th',title));
      const thead=el('thead');thead.append(head);table.append(thead);
      const tbody=el('tbody');
      for(const row of matching.slice((page-1)*20,page*20)){
        const tr=el('tr'),id=el('td'),open=button(row.sourceId+' / '+row.rowNumber,()=>{
          selectedRow=row.id;state.selectedRow=row.id;remember();renderRow();
        });open.setAttribute('aria-current',String(selectedRow===row.id));id.append(open);
        tr.append(id,el('td',(row.values.funder??'')+' · '+(row.values.program??'')),
          el('td',row.record.disposition),el('td',String(row.issues?.length??0)));
        tbody.append(tr);
      }
      table.append(tbody);
      const previous=button('Previous',()=>{page--;renderList();}),next=button('Next',()=>{page++;renderList();});
      previous.disabled=page<=1;next.disabled=page>=pages;
      const pager=el('div',undefined,'gt-actions');pager.append(previous,el('span','Page '+page+' of '+pages+' · '+matching.length+' rows'),next);
      const wrap=el('div',undefined,'gt-table-wrap');wrap.append(table);list.replaceChildren(wrap,pager);
    }
    function renderRow(){
      editor.replaceChildren();const row=view.rows.find(item=>item.id===selectedRow);
      if(!row){editor.append(el('p','Select a physical source row.'));return;}
      const pendingRow=rowDraft(row),record=pendingRow.record;
      const changed=()=>remember();
      editor.append(el('h4',row.sourceId+' · physical row '+row.rowNumber+' · '+row.id),
        detail('Complete original, mapped values and validation',{rowNumber:row.rowNumber,line:row.line,headers:row.headers,
          rawFields:row.rawFields,mapped:row.mapped,values:row.values,issues:row.issues,candidates:row.candidates}));
      if(pendingRow.baseRevision!==view.revision)editor.append(el('p','This working row was prepared against revision '+pendingRow.baseRevision+'. It will not be silently applied to revision '+view.revision+'.'),
        button('Start a separate working edit from the current row',()=>{
          download(row.id+'-previous-working-review.json',{planId:state.planId,rowId:row.id,...pendingRow});
          state.rows[row.id]={baseRevision:view.revision,record:copy(row.record)};remember();renderRow();
        }));
      const disposition=el('div',undefined,'gt-grid');
      disposition.append(select('Disposition',record.disposition,DISPOSITIONS,v=>{record.disposition=v;changed();}),
        input('Disposition reason',record.reason,v=>{record.reason=v;changed();},{area:true}));
      editor.append(disposition,el('p','Requested amounts remain separate from awarded amounts. A source report-date cell alone does not confirm an obligation.'));
      const values=el('div',undefined,'gt-grid');
      for(const [key,label] of FIELDS){
        const box=el('div',undefined,'gt-value'),check=el('input');check.type='checkbox';check.checked=own(record.edits,key);
        const checkLabel=el('label');checkLabel.append(check,document.createTextNode('Record reviewed '+label.toLowerCase()));
        check.addEventListener('change',()=>{
          if(check.checked)record.edits[key]={value:typeof row.values[key]==='string'?row.values[key]:'',reason:''};
          else delete record.edits[key];changed();renderRow();
        });
        box.append(el('p',label+' · mapped '+(own(row.mapped,key)?JSON.stringify(row.mapped[key]):'(absent)')),checkLabel);
        if(own(record.edits,key))box.append(input('Reviewed '+label,record.edits[key].value,v=>{record.edits[key].value=v;changed();},{area:key==='notes'}),
          input('Reason / source for '+label,record.edits[key].reason,v=>{record.edits[key].reason=v;changed();}));
        values.append(box);
      }
      editor.append(values,el('h4','Relationship to another physical row'));
      const relationship=el('div',undefined,'gt-grid');
      relationship.append(select('Relationship',record.relationship.kind,['unresolved','distinct','related','duplicate'],
        v=>{record.relationship.kind=v;if(v==='unresolved'||v==='distinct')record.relationship.target=null;changed();renderRow();}),
        select('Exact other row',record.relationship.target??'',[['','No target'],...view.rows.filter(x=>x.id!==row.id).map(x=>[x.id,x.sourceId+' / '+x.rowNumber+' · '+(x.values.funder??'')])],
          v=>{record.relationship.target=v||null;changed();}),
        input('Relationship reason',record.relationship.reason,v=>{record.relationship.reason=v;changed();},{area:true}));
      editor.append(relationship,el('h4','Obligations with retained evidence'));
      for(const [index,obligation] of record.obligations.entries()){
        const box=el('fieldset',undefined,'gt-obligation');box.append(el('legend',obligation.id));
        const grid=el('div',undefined,'gt-grid');
        grid.append(select('Kind',obligation.kind,KINDS,v=>{obligation.kind=v;changed();}),
          input('Due date',obligation.due,v=>{obligation.due=v;changed();},{type:'date'}),
          input('Owner',obligation.owner,v=>{obligation.owner=v;changed();}),
          select('State',obligation.status,STATES,v=>{obligation.status=v;changed();}),
          select('Evidence source',obligation.evidenceSourceId??'',[['','No source selected'],...view.sources.map(s=>[s.id,s.id+' · '+(s.name??s.kind)])],
            v=>{obligation.evidenceSourceId=v||null;changed();}),
          input('Exact source page / section / row',obligation.locator,v=>{obligation.locator=v;changed();}),
          input('Source and date decision',obligation.reason,v=>{obligation.reason=v;changed();},{area:true}),
          input('Recorded result',obligation.recordedResult,v=>{obligation.recordedResult=v;changed();},{area:true}));
        box.append(grid,button('Remove this obligation from working edit',()=>{record.obligations.splice(index,1);changed();renderRow();}));
        editor.append(box);
      }
      editor.append(button('Add obligation',()=>{
        record.obligations.push({id:'obligation-'+crypto.randomUUID().slice(0,12),kind:'report',due:'',owner:'',status:'unconfirmed',
          evidenceSourceId:null,locator:'',reason:'',recordedResult:''});changed();renderRow();
      }),button('Save reviewed row as revision',()=>run(async()=>{
        const base=currentBinding();
        if(pendingRow.baseRevision!==base.revisions.length)fail('This working row belongs to an earlier revision. Preserve it and review the current saved row first.');
        const candidate=await tracker.saveGrantRow(base,row.id,copy(record),{expectedRevision:pendingRow.baseRevision});
        await saveCandidate(candidate,base);delete state.rows[row.id];remember();
      })));
    }
    renderList();renderRow();
  }
  function renderExports(){
    exportSection.replaceChildren(el('h3','Complete customer handover'),
      el('p','Downloads use the selected saved revision. Working edits remain separate until saved. Complete plan JSON retains every original file and revision.'));
    const downloads=el('div',undefined,'gt-actions');
    downloads.append(button('Prepare all complete downloads',()=>run(async()=>{
      const captured=view;const result=await tracker.exportGrantTracker(captured.plan,{revision:captured.revision});
      if(view!==captured)fail('The selected plan changed while preparing exports.');
      const list=el('div',undefined,'gt-actions');
      for(const file of result.files)list.append(button(file.name,()=>download(file.name,file.content,file.mediaType)));
      downloads.replaceChildren(list);
    })));
    const returnLink=el('a','Review a returned complete plan');returnLink.className='button';
    returnLink.href='/operating-plan-return.html?plan='+encodeURIComponent(view.plan.id);
    exportSection.append(downloads,returnLink);
  }
  window.addEventListener('beforeunload',event=>{
    if(pending||saveFailed){event.preventDefault();event.returnValue='';}
  });
  return {update,open(){expanded=true;contents.hidden=false;return update();}};
}
