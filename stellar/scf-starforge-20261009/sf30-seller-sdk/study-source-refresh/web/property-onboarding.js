'use strict';
(() => {
  const O = {value:null, version:0, navigation:0, jsonDirty:false, preview:null, saved:null,
    tableKey:null, inspection:null, documents:[], editions:[], plans:[], catalog:null, retained:null, preparing:false};
  const panel = h('section',{id:'view-property-onboarding',hidden:true});
  panel.innerHTML = [
    '<div class="heading"><div><h1>Survey spreadsheets</h1><p>Map retained CSV and XLSX exports into the same survey, change review and comparable-selection workflow.</p></div></div>',
    '<div class="onboarding-top"><label>Operator<input id="po-operator" autocomplete="name"></label><button id="po-refresh">Refresh sources and saved work</button></div>',
    '<div class="panel"><h2>1. Retain the source export</h2><form id="po-upload" class="form-grid">',
    '<label>Stable source key<input name="key" required placeholder="customer-property-export"></label><label>Title<input name="title" required></label>',
    '<label>Source kind<select name="source_kind"><option value="customer_export">Customer export</option><option value="authored_projection">Authored projection of a retained report</option><option value="published">Published original</option></select></label>',
    '<label>Publisher or exporting team<input name="publisher"></label><label class="wide">Source reference<input name="source_reference" placeholder="System, account, report and export date"></label>',
    '<label class="wide">Published URL, when available<input name="url" type="url"></label><label class="wide">Original file<input name="file" type="file" accept=".csv,.txt,.xlsx" required></label>',
    '<div class="wide"><button type="submit">Retain complete original</button></div></form><p id="po-upload-result" class="muted"></p></div>',
    '<div class="panel"><h2>2. Mapping and study basis</h2><div class="onboarding-actions">',
    '<select id="po-plans" aria-label="Saved mapping"></select><button id="po-open-plan">Open saved mapping</button>',
    '<select id="po-editions" aria-label="Existing survey edition"></select><button id="po-use-study">Use existing study</button>',
    '<button id="po-open-retained">Open retained row map</button><button id="po-continue">Continue revised source</button><button id="po-new">New mapping</button></div>',
    '<div id="po-study" class="form-grid"></div><div class="onboarding-actions"><button id="po-add-properties">Add property table</button>',
    '<button id="po-add-units">Add schedule table</button><button id="po-add-comparables">Add published-purpose table</button></div>',
    '<div id="po-tables" class="onboarding-tabs"></div><div id="po-table"></div>',
    '<details class="onboarding-json"><summary>Complete mapping JSON and retained source bindings</summary>',
    '<p>Apply JSON edits before preview or receiving. Column numbers are one-based; source headers are labels.</p>',
    '<textarea id="po-json" spellcheck="false" rows="16"></textarea><div class="onboarding-actions">',
    '<button id="po-apply-json">Apply JSON</button><button id="po-reset-json">Reset JSON edits</button><button id="po-download-json">Download mapping</button>',
    '<label>Open mapping JSON<input id="po-json-file" type="file" accept=".json"></label></div><p id="po-json-state" role="status"></p></details></div>',
    '<div class="panel"><h2>3. Review the complete projection</h2><div class="onboarding-actions"><button id="po-preview">Preview all selected source rows</button>',
    '<button id="po-save">Save immutable mapping</button></div><div id="po-preview-summary"></div><div id="po-preview-rows"></div><div id="po-preview-page" class="onboarding-actions"></div>',
    '<h3>Changes against the previous survey</h3><div id="po-changes"></div><div id="po-changes-page" class="onboarding-actions"></div></div>',
    '<div class="panel"><h2>4. Create the survey and source review</h2><label>Edition label<input id="po-label"></label>',
    '<label>Revision note<textarea id="po-note" rows="3" placeholder="Explain source replacements, exclusions and omitted records"></textarea></label>',
    '<p>Every prior edition remains retained. Omitted properties and changed published-purpose rows appear in the original change review.</p>',
    '<button id="po-prepare" disabled>Create survey + change review</button><div id="po-result"></div></div>',
    '<div class="panel"><h2>Retained source rows</h2><p>The same mapping and complete row map travel with the original Property package.</p>',
    '<div id="po-retained-summary"></div><div id="po-retained-rows"></div><div id="po-retained-page" class="onboarding-actions"></div></div>'
  ].join('');
  document.querySelector('main').append(panel);
  document.querySelector('aside nav').append(h('button',{'data-view':'property-onboarding',onclick:()=>run('Open survey spreadsheets',async()=>{view('property-onboarding');await refresh();})},'Survey spreadsheets'));
  const el = id => document.getElementById('po-'+id);
  const copy = value => JSON.parse(JSON.stringify(value));
  const display = value => value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const op = () => {const value=el('operator').value.trim();if(!value)throw Error('Enter the operator name.');return value;};
  const choice = () => O.value?.tables.find(t=>t.key===O.tableKey);
  const stamp = () => ({navigation:O.navigation,version:O.version,token:state.token});
  const current = x => x.navigation===O.navigation && x.version===O.version && x.token===state.token;
  function cleanJSON(){if(O.jsonDirty)throw Error('Apply or reset the visible JSON edits first.');}
  function invalidate(){
    O.version++;O.preview=null;O.saved=null;O.inspection=null;
    el('preview-summary').textContent='Mapping changed. Preview the current source and save its mapping before receiving.';
    el('preview-rows').replaceChildren();el('preview-page').replaceChildren();el('changes').replaceChildren();el('changes-page').replaceChildren();
    buttons();
  }
  function changed(action){cleanJSON();action();invalidate();syncJSON();renderStudy();renderTables();}
  function syncJSON(){el('json').value=JSON.stringify(O.value,null,2);O.jsonDirty=false;el('json-state').textContent='JSON matches the visible mapping.';buttons();}
  function buttons(){
    el('prepare').disabled=O.preparing||O.jsonDirty||!O.preview?.ready||!O.saved||
      O.saved.plan_sha256!==O.preview.plan_sha256;
    el('preview').disabled=!O.value||O.jsonDirty;
    el('save').disabled=!O.value||O.jsonDirty;
  }
  function selectOptions(select,values,getValue,getLabel,empty){
    const previous=select.value;select.replaceChildren(h('option',{value:''},empty),
      ...values.map(v=>h('option',{value:getValue(v)},getLabel(v))));
    if([...select.options].some(x=>x.value===previous))select.value=previous;
  }
  async function refresh(){
    const selected=stamp();
    const [data,plans,catalog]=await Promise.all([api('property.status'),api('property.onboarding.plans'),api('property.onboarding.fields')]);
    if(!current(selected))return;
    O.documents=data.documents;O.editions=data.editions;O.plans=plans.plans;O.catalog=catalog;
    selectOptions(el('plans'),O.plans,x=>x.document_id,x=>x.label+' · '+short(x.document_id),'Choose retained mapping');
    selectOptions(el('editions'),O.editions,x=>x.id,x=>x.label+' · '+short(x.id),'Choose survey edition');
    if(!O.value)newPlan();else renderTables();
  }
  function reset(value,saved=null){
    O.navigation++;O.version++;O.value=copy(value);O.saved=saved;O.preview=null;O.retained=null;O.inspection=null;
    O.tableKey=O.value.tables[0]?.key||null;O.jsonDirty=false;
    syncJSON();renderStudy();renderTables();el('preview-summary').textContent='Preview every selected source row before receiving.';
    for(const id of ['preview-rows','preview-page','changes','changes-page','result','retained-summary','retained-rows','retained-page'])el(id).replaceChildren();
  }
  function newPlan(){
    reset({schema:'stellar-forge.property-onboarding-plan.v1',name:'Survey export mapping',
      study:{key:'',name:'',effective_date:null,currency:'USD',subject:{},market_area:{name:'',boundary_description:''}},
      document_ids:{},previous_id:null,omitted_records:'review_removed',note:'',tables:[]});
  }
  function labelInput(title,value,apply,type='text'){
    const input=h('input',{type,value:value??'',onchange:()=>run('Update mapping',()=>changed(()=>apply(input.value)))});
    return h('label',{},title,input);
  }
  function renderStudy(){
    if(!O.value)return;const v=O.value;
    el('study').replaceChildren(
      labelInput('Mapping name',v.name,x=>v.name=x),
      labelInput('Study key',v.study.key,x=>v.study.key=x),
      labelInput('Study name',v.study.name,x=>v.study.name=x),
      labelInput('Effective date',v.study.effective_date,x=>v.study.effective_date=x||null,'date'),
      labelInput('Market area',v.study.market_area.name,x=>v.study.market_area.name=x),
      labelInput('Boundary description',v.study.market_area.boundary_description,x=>v.study.market_area.boundary_description=x),
      h('p',{className:'wide muted'},v.previous_id?'Previous edition: '+v.previous_id+' · omitted records enter change review.':'Initial survey edition.'),
      h('p',{className:'wide muted'},'Observation month, source publication date, study effective date and schedule rent basis remain separate fields.')
    );
  }
  function key(prefix){const used=new Set(O.value.tables.map(t=>t.key));let n=1;while(used.has(prefix+'-'+n))n++;return prefix+'-'+n;}
  function addTable(kind){
    changed(()=>{const k=key(kind);O.value.tables.push({key:k,kind,document_id:'',
      reader:{kind:'csv',encoding:'utf-8-sig',delimiter:',',quotechar:'"',escapechar:null,doublequote:true,header_row:1,start_row:2,end_row:null,first_column:1,last_column:null},
      fields:{},hidden:'exclude',selection:{mode:'all',rows:[],exclude:[]}});O.tableKey=k;});
  }
  function fieldRows(t){
    const catalog=O.catalog?.fields[t.kind]||{}, columns=O.inspection?.source?.columns||[];
    return Object.entries(t.fields).map(([field,binding])=>{
      const target=h('select',{'aria-label':'Target field'});
      const fieldNames=Object.keys(catalog);if(!fieldNames.includes(field))fieldNames.push(field);
      target.replaceChildren(...fieldNames.map(x=>h('option',{value:x},x)));target.value=field;
      target.onchange=()=>run('Change target field',()=>changed(()=>{
        if(target.value!==field&&Object.hasOwn(t.fields,target.value))throw Error('That target field already has a mapping.');
        delete t.fields[field];binding.type=catalog[target.value]||binding.type;t.fields[target.value]=binding;
      }));
      const source=h('select',{'aria-label':'Original source column'});
      source.append(h('option',{value:'constant'},'Constant'));
      const mappedColumn=binding.column;
      const choices=[...columns];
      if(mappedColumn&&!choices.some(x=>x.column===mappedColumn))choices.push({column:mappedColumn,header:'Selected column'});
      source.append(...choices.map(c=>h('option',{value:String(c.column)},c.column+' · '+display(c.header))));
      source.value=Object.hasOwn(binding,'constant')?'constant':String(binding.column||'');
      source.onchange=()=>run('Change column mapping',()=>changed(()=>{
        if(source.value==='constant'){delete binding.column;binding.constant=null;}
        else{delete binding.constant;binding.column=Number(source.value);}
      }));
      const value=Object.hasOwn(binding,'constant')?h('textarea',{rows:2,value:JSON.stringify(binding.constant),spellcheck:false}):h('span',{className:'muted'},'Original column '+binding.column);
      if(Object.hasOwn(binding,'constant'))value.onchange=()=>run('Change mapped constant',()=>changed(()=>{binding.constant=JSON.parse(value.value);}));
      const settings=h('textarea',{rows:3,spellcheck:false,value:JSON.stringify(Object.fromEntries(Object.entries(binding).filter(([k])=>!['column','constant'].includes(k))),null,2)});
      settings.onchange=()=>run('Update conversion settings',()=>changed(()=>{
        const next=JSON.parse(settings.value);if(!next||Array.isArray(next)||typeof next!=='object')throw Error('Use a conversion object.');
        t.fields[field]={...(Object.hasOwn(binding,'constant')?{constant:binding.constant}:{column:binding.column}),...next};
      }));
      return [target,source,value,settings,button('Remove',()=>changed(()=>delete t.fields[field]),true)];
    });
  }
  function renderTables(){
    if(!O.value)return;
    el('tables').replaceChildren(...O.value.tables.map(t=>h('button',{className:t.key===O.tableKey?'active':'',
      onclick:()=>{O.tableKey=t.key;O.inspection=null;renderTables();}},t.kind+' · '+t.key)));
    const t=choice();if(!t){el('table').replaceChildren(h('p',{className:'empty'},'Add property, schedule or published-purpose tables. A flat export can be mapped twice with separate property and schedule fields.'));return;}
    const sources=O.documents.filter(d=>/\.(csv|txt|xlsx)$/.test(d.files[0]?.path||''));
    const source=h('select',{'aria-label':'Retained source export'});
    source.replaceChildren(h('option',{value:''},'Choose original CSV or XLSX'),
      ...sources.map(d=>h('option',{value:d.id},d.label+' · '+d.key+' · '+short(d.id))));
    source.value=t.document_id;
    source.onchange=()=>run('Select retained export',()=>changed(()=>{
      const doc=sources.find(d=>d.id===source.value);if(!doc)return;
      const old=O.documents.find(d=>d.id===t.document_id);
      t.document_id=doc.id;
      if(old&&old.key!==doc.key&&!O.value.tables.some(x=>x!==t&&x.document_id===old.id))delete O.value.document_ids[old.key];
      O.value.document_ids[doc.key]=doc.id;
      t.reader=doc.files[0].path.endsWith('.xlsx')?{kind:'xlsx',sheet:null,header_row:1,start_row:2,end_row:null,first_column:1,last_column:null}:
        {kind:'csv',encoding:'utf-8-sig',delimiter:',',quotechar:'"',escapechar:null,doublequote:true,header_row:1,start_row:2,end_row:null,first_column:1,last_column:null};
    }));
    const reader=h('textarea',{rows:6,spellcheck:false,value:JSON.stringify(t.reader,null,2)});
    reader.onchange=()=>run('Update source range',()=>changed(()=>t.reader=JSON.parse(reader.value)));
    const selection=h('textarea',{rows:5,spellcheck:false,value:JSON.stringify({hidden:t.hidden,...t.selection},null,2)});
    selection.onchange=()=>run('Update row selection',()=>changed(()=>{const v=JSON.parse(selection.value);t.hidden=v.hidden;delete v.hidden;t.selection=v;}));
    const add=h('select',{'aria-label':'Add target field'});
    add.append(h('option',{value:''},'Choose a field'),...Object.keys(O.catalog?.fields[t.kind]||{}).filter(f=>!Object.hasOwn(t.fields,f)).map(f=>h('option',{value:f},f)));
    el('table').replaceChildren(
      h('div',{className:'onboarding-table-head'},h('h3',{},t.kind+' table: '+t.key),button('Remove table',()=>changed(()=>{O.value.tables=O.value.tables.filter(x=>x.key!==t.key);O.tableKey=O.value.tables[0]?.key||null;}),true)),
      h('label',{},'Retained original',source),
      h('div',{className:'onboarding-reader'},h('label',{},'CSV dialect or XLSX sheet and row range',reader),h('label',{},'Selection and exclusions, with reasons',selection)),
      h('div',{className:'onboarding-actions'},button('Inspect original headers and cells',()=>inspectTable()),button('Map exact matching headers',()=>suggest(),true)),
      h('div',{id:'po-source-inspection'}),
      h('h3',{},'Explicit column mappings'),
      h('p',{className:'muted'},'Use column numbers and exact types. Each conversion can declare trim, null_values, lookup, formula policy, separator and number format. JSON fields retain complete citations and original reported details.'),
      h('div',{className:'onboarding-mappings'},table(['Target field','Original column','Constant JSON','Conversion settings',''],fieldRows(t))),
      h('div',{className:'onboarding-actions'},add,button('Add field',()=>changed(()=>{
        if(!add.value)return;const type=O.catalog.fields[t.kind][add.value];t.fields[add.value]={constant:null,type,nullable:true,trim:false,null_values:['']};
      }),true))
    );
    if(O.inspection)renderInspection();
  }
  async function inspectTable(offset=0){
    cleanJSON();const t=choice();if(!t?.document_id)throw Error('Choose a retained export.');
    const selected=stamp(),tableKey=t.key,reader=copy(t.reader),document_id=t.document_id;
    const result=await api('property.onboarding.source',{document_id,reader,offset,limit:20});
    if(!current(selected)||choice()?.key!==tableKey||choice()?.document_id!==document_id)return;
    O.inspection=result;
    if(t.reader.kind==='xlsx'&&!t.reader.sheet){t.reader.sheet=result.source.reader.sheet;O.version++;O.saved=null;O.preview=null;syncJSON();}
    renderTables();
  }
  function renderInspection(){
    const x=O.inspection,target=document.getElementById('po-source-inspection');if(!x||!target)return;
    const meta=h('details',{},h('summary',{},'Source identity, worksheet and parsing metadata'),h('pre',{},JSON.stringify(x.source,null,2)));
    target.replaceChildren(h('p',{},x.total_rows+' source rows · '+x.source.original.sha256),
      table(['Row',...x.source.columns.map(c=>c.column+' · '+display(c.header))],x.rows.map(r=>[
        r.row+(r.hidden?' (hidden)':''),...r.cells.map(c=>h('details',{},h('summary',{},display(c.value)),h('pre',{},JSON.stringify(c,null,2))))
      ])),meta,
      h('div',{className:'onboarding-actions'},
        ...(x.offset>0?[button('Previous source rows',()=>inspectTable(Math.max(0,x.offset-20)),true)]:[]),
        ...(x.next_offset!==null?[button('Next source rows',()=>inspectTable(x.next_offset),true)]:[])));
  }
  function suggest(){
    if(!O.inspection)throw Error('Inspect the original source first.');
    const t=choice(),columns=copy(O.inspection.source.columns);
    changed(()=>{
      for(const c of columns){const name=String(c.header??'').trim().toLowerCase().replaceAll(' ','_');
        if(Object.hasOwn(O.catalog.fields[t.kind],name)&&!Object.hasOwn(t.fields,name))
          t.fields[name]={column:c.column,type:O.catalog.fields[t.kind][name],trim:false,nullable:!O.catalog.required[t.kind].includes(name),null_values:['']};
      }
    });
  }
  function traceRows(records,exclude=false){
    return records.map(row=>{
      const values=Object.entries(row.fields||{}).map(([field,value])=>h('details',{},
        h('summary',{},field+' = '+(value.value_json??JSON.stringify(value.value))),
        h('pre',{},JSON.stringify({original:value.source,conversion:value.mapping,steps:value.steps,converted:value.value_json??value.value},null,2))));
      const detail=h('details',{},h('summary',{},'All original cells and row selection'),h('pre',{},JSON.stringify(row.source,null,2)));
      const error=row.error?h('pre',{className:'onboarding-error'},JSON.stringify(row.error,null,2)):display(row.reason);
      const action=exclude&&row.state!=='excluded'?button('Exclude with reason',()=>{
        const reason=window.prompt('Reason for excluding this exact source row');if(!reason?.trim())return;
        changed(()=>{const t=O.value.tables.find(x=>x.key===row.table_key);t.selection.exclude=t.selection.exclude.filter(x=>x.row!==row.source.row);t.selection.exclude.push({row:row.source.row,reason});});
      },true):null;
      return [row.table_key+' · '+row.source.row,row.state,h('div',{},values,detail),h('div',{},error,action)];
    });
  }
  async function preview(offset=0,changes_offset=0){
    cleanJSON();const selected=stamp(),value=copy(O.value);
    const result=await api('property.onboarding.preview',{value,offset,limit:20,changes_offset});
    if(!current(selected))return;
    O.preview=result;renderPreview();buttons();
  }
  function renderPreview(){
    const p=O.preview;if(!p)return;
    el('preview-summary').replaceChildren(h('p',{},p.properties+' properties · '+p.unit_schedules+' schedules · '+p.source_comparables+' published-purpose rows · '+p.rows+' original source rows'),
      h('p',{},p.ready?'Projection ready for an explicit saved mapping.':'Resolve the included-row or source-join errors before receiving.'),
      h('pre',{},JSON.stringify({counts:p.counts,errors:p.errors,projection_sha256:p.projection_sha256},null,2)));
    el('preview-rows').replaceChildren(table(['Source row','State','Original → conversion → typed value','Reason / action'],traceRows(p.preview_rows,true)));
    el('preview-page').replaceChildren(
      ...(p.offset>0?[button('Previous mapped rows',()=>preview(Math.max(0,p.offset-20),p.changes.offset),true)]:[]),
      ...(p.next_offset!==null?[button('Next mapped rows',()=>preview(p.next_offset,p.changes.offset),true)]:[]));
    el('changes').replaceChildren(h('p',{},JSON.stringify(p.comparison_counts)),
      table(['Record','Change','Changed fields','Exact previous / next values'],p.changes.rows.map(r=>[
        r.name,r.kind,(r.changed_paths||[]).join(', '),h('details',{},h('summary',{},'Compare values'),
          h('div',{className:'onboarding-before-after'},h('pre',{},r.before_json??JSON.stringify(r.before,null,2)),h('pre',{},r.after_json??JSON.stringify(r.after,null,2))))
      ])));
    el('changes-page').replaceChildren(
      ...(p.changes.offset>0?[button('Previous changes',()=>preview(p.offset,Math.max(0,p.changes.offset-20)),true)]:[]),
      ...(p.changes.next_offset!==null?[button('Next changes',()=>preview(p.offset,p.changes.next_offset),true)]:[]));
  }
  async function save(){
    cleanJSON();const selected=stamp(),value=copy(O.value),operator=op();
    const result=await api('property.onboarding.plan.save',{value,operator});
    if(!current(selected))return;
    O.saved=result;buttons();el('json-state').textContent='Saved mapping '+result.document_id;
    await refresh();
  }
  async function prepare(){
    cleanJSON();if(el('prepare').disabled)throw Error('Preview and save this exact mapping first.');
    const selected=stamp(),args={plan_id:O.saved.document_id,expected_projection_sha256:O.preview.projection_sha256,
      operator:op(),label:el('label').value,note:el('note').value};
    O.preparing=true;buttons();
    try{
      const result=await api('property.onboarding.prepare',args);
      if(!current(selected))return;
      el('result').replaceChildren(h('h3',{},'Survey and source review retained'),h('p',{},result.edition.label),
        h('p',{},'Edition '+result.edition.id),h('p',{},'Review '+result.review.id),
        button('Open original change review',()=>window.propertyResearch.openReview(result)),
        button('Read retained source rows',()=>openRetained(result.edition.id),true));
      await refresh();
    }finally{O.preparing=false;buttons();}
  }
  async function openPlan(){
    cleanJSON();const id=el('plans').value;if(!id)throw Error('Choose a mapping.');
    O.navigation++;const selected=stamp();const result=await api('property.onboarding.plan.read',{plan_id:id});
    if(!current(selected))return;reset(result.value,result);
  }
  async function useStudy(){
    cleanJSON();const edition_id=el('editions').value;if(!edition_id)throw Error('Choose a survey edition.');
    O.navigation++;const selected=stamp();
    const [edition,packet]=await Promise.all([api('property.edition.read',{edition_id,limit:1}),api('property.edition.packet',{edition_id})]);
    if(!current(selected))return;
    const study=copy(packet.study);delete study.onboarding;
    reset({schema:'stellar-forge.property-onboarding-plan.v1',name:edition.label+' — export mapping',study,
      document_ids:copy(edition.document_ids),previous_id:edition_id,omitted_records:'review_removed',note:'',tables:[]});
  }
  async function continueEdition(){
    cleanJSON();const edition_id=el('editions').value;if(!edition_id)throw Error('Choose a received survey edition.');
    O.navigation++;const selected=stamp();const result=await api('property.onboarding.continuation',{edition_id});
    if(!current(selected))return;reset(result.value);
  }
  async function openRetained(edition_id=el('editions').value){
    cleanJSON();if(!edition_id)throw Error('Choose a received survey edition.');
    O.navigation++;const selected=stamp();const result=await api('property.onboarding.retained',{edition_id});
    if(!current(selected))return;
    O.retained=result;
    el('retained-summary').replaceChildren(h('p',{},'Edition '+edition_id),h('pre',{},JSON.stringify(result.binding,null,2)),
      button('Open this mapping',()=>reset(result.plan.value,result.plan),true),
      button('Download complete row map',()=>{
        const doc=O.documents.find(x=>x.id===result.binding.row_map_document_id);
        return download({kind:'property_document',id:result.binding.row_map_document_id,path:doc?.files[0].path||'original.jsonl'},'survey-source-rows.jsonl');
      },true));
    await retainedRows(0);
  }
  async function retainedRows(offset){
    const selected=stamp(),edition_id=O.retained?.edition_id;if(!edition_id)return;
    const result=await api('property.onboarding.rows',{edition_id,offset,limit:20});
    if(!current(selected)||O.retained?.edition_id!==edition_id)return;
    el('retained-rows').replaceChildren(table(['Original row','State','Retained values and cells','Reason'],traceRows(result.rows)));
    el('retained-page').replaceChildren(
      ...(offset>0?[button('Previous retained rows',()=>retainedRows(Math.max(0,offset-20)),true)]:[]),
      ...(result.next_offset!==null?[button('Next retained rows',()=>retainedRows(result.next_offset),true)]:[]));
  }
  el('upload').onsubmit=event=>{event.preventDefault();run('Retain original survey export',async()=>{
    const form=new FormData(el('upload')),file=form.get('file');
    if(!file?.size)throw Error('Choose a nonempty original export.');
    const metadata=Object.fromEntries([...form].filter(([k])=>k!=='file'));
    if(metadata.source_kind==='published'){delete metadata.source_kind;if(!metadata.url)throw Error('Enter the original publication URL.');}
    else if(!metadata.source_reference.trim())throw Error('Describe the exporting system/report or retained report projection.');
    if(!metadata.url)metadata.url=null;
    const response=await fetch('/property-source?name='+encodeURIComponent(file.name),{method:'POST',
      headers:{Authorization:'Bearer '+state.token,'Content-Type':'application/octet-stream','X-Property-Metadata':encodeURIComponent(JSON.stringify(metadata))},body:file});
    const result=await response.json();if(!response.ok||!result.ok)throw Error(readable(result.code)+' · '+JSON.stringify(result.details||{}));
    el('upload-result').textContent='Retained '+result.result.label+' · '+result.result.id;
    await refresh();
  });};
  el('json').oninput=()=>{O.jsonDirty=true;O.version++;O.preview=null;O.saved=null;buttons();el('json-state').textContent='Unapplied JSON edits. Apply or reset before using the mapping.';};
  el('apply-json').onclick=()=>run('Apply complete mapping JSON',()=>{const value=JSON.parse(el('json').value);if(value?.schema!=='stellar-forge.property-onboarding-plan.v1'||!Array.isArray(value.tables))throw Error('Use a complete survey onboarding plan.');reset(value);});
  el('reset-json').onclick=()=>syncJSON();
  el('download-json').onclick=()=>run('Download complete mapping',()=>{cleanJSON();const url=URL.createObjectURL(new Blob([JSON.stringify(O.value,null,2)],{type:'application/json'}));const a=h('a',{href:url,download:'survey-onboarding-plan.json'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  el('json-file').onchange=()=>run('Open mapping JSON',async()=>{const file=el('json-file').files[0];if(!file)return;if(file.size>3*1024*1024)throw Error('Mapping exceeds 3 MiB.');O.navigation++;const selected=stamp();const value=JSON.parse(await file.text());if(!current(selected))return;if(value?.schema!=='stellar-forge.property-onboarding-plan.v1'||!Array.isArray(value.tables))throw Error('Use a complete survey onboarding plan.');reset(value);});
  el('refresh').onclick=()=>run('Refresh original survey work',refresh);
  el('new').onclick=()=>run('New survey mapping',()=>{cleanJSON();newPlan();});
  el('add-properties').onclick=()=>run('Add property mapping',()=>addTable('properties'));
  el('add-units').onclick=()=>run('Add schedule mapping',()=>addTable('units'));
  el('add-comparables').onclick=()=>run('Add published-purpose mapping',()=>addTable('comparables'));
  el('open-plan').onclick=()=>run('Open saved mapping',openPlan);
  el('use-study').onclick=()=>run('Use original study basis',useStudy);
  el('continue').onclick=()=>run('Open following source mapping',continueEdition);
  el('open-retained').onclick=()=>run('Open retained source rows',()=>openRetained());
  el('preview').onclick=()=>run('Project every selected source row',()=>preview());
  el('save').onclick=()=>run('Save original mapping document',save);
  el('prepare').onclick=()=>run('Receive survey and change review',prepare);
  window.propertyOnboarding={refresh};
  buttons();
})();
