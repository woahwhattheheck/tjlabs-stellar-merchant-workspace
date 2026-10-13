// MIT. Guided mapping over the original source inspector; no provider calls.
const KEYS=['text','name','housenumber','street','postcode','city','state','country','identity','latitude','longitude'];
const LABELS={text:'Complete address',name:'Place or building name',housenumber:'House number',street:'Street',postcode:'Postcode',city:'City',state:'State or region',country:'Country',identity:'Business or record identifier',latitude:'Original latitude',longitude:'Original longitude'};
const SCHEMA='stellar-forge.geoapify-intake-setup.v1';
const node=(tag,value)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=String(value);return e;};
const copy=v=>structuredClone(v);
export function createSourceIntake({prefix,perform,handle,notice,persist,download}){
  const $=suffix=>document.getElementById(prefix+'-'+suffix),host=$('mapper'),mapping=$('mapping'),form=$('form');
  let inspection=null,lastSource=null,expectedSource=null,previewBinding=null,fieldSearch='',fieldOffset=0,rowOffset=0,busy=false;
  const selectors={},title=node('h3','Inspect and map the original file'),intro=node('p','Open the actual file, then choose its address fields. Each preview uses the original parser and keeps every source row. No provider request is made.');
  const actions=node('div');actions.className='actions';
  const makeButton=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=()=>void handle(fn);return b;};
  const openButton=makeButton('Inspect original file',()=>inspect({fresh:true}));
  const previewButton=makeButton('Preview selected mapping',()=>inspect({row:0}));
  const resetButton=makeButton('Start a new setup',async()=>{
    if((mapping.value.trim()||expectedSource)&&!confirm('Start a new mapping setup? The original source and saved workspace records remain retained.'))return;
    expectedSource=null;lastSource=null;inspection=null;previewBinding=null;fieldOffset=rowOffset=0;fieldSearch='';search.value='';mapping.value='{}';mode.value='text';rebuildSelectors();clearPanels();persist();
  });
  actions.append(openButton,previewButton,resetButton);
  const status=node('p','Choose a file or its original host path, then inspect it.');status.setAttribute('role','status');
  const modeLabel=node('label','Address layout'),mode=node('select');mode.id=prefix+'-address-mode';
  for(const[value,label]of [['text','One complete address field'],['structured','Separate address fields']]){const o=node('option',label);o.value=value;mode.append(o);}modeLabel.append(mode);
  const grid=node('div');grid.className='form-grid';
  for(const key of KEYS){
    const label=node('label',LABELS[key]),select=node('select');select.id=prefix+'-map-'+key;label.append(select);grid.append(label);selectors[key]=select;
    select.onchange=()=>{let value;try{value=readMapping();}catch{value={};}value[key]=select.value;mapping.value=JSON.stringify(value,null,2);previewBinding=null;showReadiness();persist();};
  }
  mode.onchange=()=>{
    let value;try{value=readMapping();}catch{value={};}
    if(mode.value==='text')for(const key of KEYS.slice(1,8))delete value[key];else delete value.text;
    mapping.value=JSON.stringify(value,null,2);previewBinding=null;rebuildSelectors();showReadiness();persist();
  };
  const fieldsTitle=node('h4','Fields in this source'),searchLabel=node('label','Find a source field'),search=node('input');search.type='search';search.id=prefix+'-field-search';searchLabel.append(search);
  const fieldActions=node('div');fieldActions.className='actions';
  const searchButton=makeButton('Find fields',()=>inspect({fields:0,search:search.value}));
  const fieldPrev=makeButton('Previous fields',()=>inspect({fields:Math.max(0,fieldOffset-100)}));
  const fieldNext=makeButton('Next fields',()=>inspect({fields:inspection?.fieldsPage.nextOffset??fieldOffset}));
  fieldActions.append(searchButton,fieldPrev,fieldNext);
  const fieldCaption=node('p'),fieldList=node('div');fieldList.className='intake-fields';
  const summary=node('div'),rowsTitle=node('h4','Original and mapped rows'),rowCaption=node('p'),rows=node('div');rows.className='intake-rows';
  const rowActions=node('div');rowActions.className='actions';
  const rowPrev=makeButton('Previous preview rows',()=>inspect({row:Math.max(0,rowOffset-25)}));
  const rowNext=makeButton('Next preview rows',()=>inspect({row:inspection?.rowsPage.nextOffset??rowOffset}));
  rowActions.append(rowPrev,rowNext);
  const setup=node('details');setup.append(node('summary','Save or reopen mapping setup'));
  const setupText=node('p','The setup file retains source identity, mapping choices and unfinished form text. Original CSV/JSON bytes stay in their own file; choose that same file again when reopening.');
  const setupFile=node('input');setupFile.type='file';setupFile.accept='.json';setupFile.id=prefix+'-setup-file';const setupLabel=node('label','Saved mapping setup');setupLabel.append(setupFile);
  const setupDownload=makeButton('Download complete setup',async()=>{
    const value=portable(),text=setupTextBytes(value);download(new Blob([text],{type:'application/json'}),'geoapify-'+prefix+'-mapping-setup.json');
  });
  const setupOpen=makeButton('Open selected setup',async()=>{
    const file=setupFile.files?.[0];if(!file)throw new Error('Choose a complete mapping setup.');
    if(file.size>262144)throw new Error('Mapping setup exceeds256KiB.');
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()));setupTextBytes(value);
    if(!confirm('Open this saved mapping setup and replace the current setup form?'))return;
    if($('file').files?.length)throw new Error('Explicitly clear the current source file before opening another setup.');
    restore(value);setupFile.value='';persist();notice('Mapping setup reopened. Select its original source file and inspect it to verify the saved source identity.');
  });
  setup.append(setupText,setupLabel,setupOpen,setupDownload);
  host.append(title,intro,actions,status,modeLabel,grid,fieldsTitle,searchLabel,fieldActions,fieldCaption,fieldList,summary,rowsTitle,rowCaption,rows,rowActions,setup);
  function readMapping(){
    const value=JSON.parse(mapping.value.trim()||'{}');
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Use an object for the explicit field mapping.');
    return value;
  }
  function sourceControlKey(){
    const f=$('file').files?.[0];return JSON.stringify({format:$('format').value,path:$('path').value.trim(),
      file:f?{name:f.name,bytes:f.size,lastModified:f.lastModified}:null});
  }
  function signature(){return JSON.stringify({source:sourceControlKey(),mapping:mapping.value});}
  function rebuildSelectors(){
    let value={};try{value=readMapping();}catch{}
    const fields=inspection?.fields??[];
    for(const key of KEYS){
      const select=selectors[key],chosen=typeof value[key]==='string'?value[key]:'';
      select.replaceChildren();const none=node('option','Not mapped');none.value='';select.append(none);
      const available=fields.filter(f=>f.pathSupported!==false&&(key==='identity'?f.identitySelectable:f.addressSelectable));
      const paths=[...new Set([...(chosen?[chosen]:[]),...available.map(f=>f.path)])];
      for(const path of paths){const field=fields.find(f=>f.path===path),option=node('option',path+(field?'':' (retained choice; inspect its field)'));option.value=path;select.append(option);}
      select.value=chosen;select.parentElement.hidden=key==='text'?mode.value!=='text':KEYS.slice(1,8).includes(key)&&mode.value!=='structured';
    }
  }
  function clearPanels(){fieldCaption.textContent='';fieldList.replaceChildren();summary.replaceChildren();rowCaption.textContent='';rows.replaceChildren();showReadiness();}
  function showReadiness(){
    const ready=inspection?.mapped?.valid===true&&previewBinding===signature();
    status.textContent=ready?'Mapping preview matches the selected original file and current choices. Review the counts and rows, then use the form’s import or retain button.':
      inspection?'The file is inspected. Preview the current mapping before importing or retaining it.':
      expectedSource?'Saved setup expects the original '+expectedSource.format+' file with SHA-256 '+expectedSource.sha256+'. Inspect that file to continue.':'Choose a file or its original host path, then inspect it.';
    controls(busy);
  }
  function controls(value=false){
    busy=value;for(const b of [openButton,resetButton,setupOpen,setupDownload])b.disabled=busy;
    previewButton.disabled=busy||(!inspection&&!$('file').files?.length&&!$('path').value.trim());
    for(const b of [searchButton,fieldPrev,fieldNext,rowPrev,rowNext])b.disabled=busy||!inspection;
    fieldPrev.disabled||=fieldOffset===0;fieldNext.disabled||=inspection?.fieldsPage.nextOffset==null;
    rowPrev.disabled||=rowOffset===0;rowNext.disabled||=inspection?.rowsPage.nextOffset==null;
  }
  async function original(){
    const file=$('file').files?.[0],path=$('path').value.trim();
    if(file&&path)throw new Error('Choose a source file from this computer or its original host path.');
    if(file){
      if(file.size>16*1024*1024)throw new Error('Use the original host path for files larger than16MiB.');
      const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
      for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
      return {base64:btoa(binary)};
    }
    if(!path)throw new Error('Choose the complete original source file.');return {path};
  }
  async function inspect({fresh=false,fields=fieldOffset,row=rowOffset,search:requestedSearch=fieldSearch}={}){
    if(fresh){fields=0;row=0;requestedSearch=search.value;}
    const before=signature();let requestedMapping;
    try{requestedMapping=readMapping();}catch(error){if(!fresh)throw error;}
    const input={format:$('format').value,name:$('name').value||undefined,mapping:requestedMapping,
      fieldOffset:fields,fieldLimit:100,fieldSearch:requestedSearch,rowOffset:row,rowLimit:25};
    let result;
    const full=async()=>perform('intake.preview',{...await original(),...input,...(expectedSource?{expectedSourceSha256:expectedSource.sha256}:{})});
    if(!fresh&&inspection){
      try{result=await perform('intake.preview',{...input,inspectionId:inspection.inspectionId});}
      catch(error){if(error.code!=='GEOAPIFY_INSPECTION_EXPIRED'&&error.code!=='INSPECTION_EXPIRED')throw error;result=await full();}
    }else result=await full();
    if(before!==signature())throw new Error('The setup changed during inspection. Inspect the current choices again.');
    if(expectedSource&&(result.source.sha256!==expectedSource.sha256||result.source.format!==expectedSource.format))
      throw new Error('This file differs from the original saved setup. Choose that original file or explicitly start a new setup.');
    inspection=result;lastSource=copy(result.source);expectedSource=copy(result.source);
    fieldOffset=result.fieldsPage.offset;rowOffset=result.rowsPage.offset;fieldSearch=result.fieldsPage.search;
    previewBinding=result.mapped?.valid?before:null;rebuildSelectors();render();persist();
    notice(result.mapped?.valid?'Original source and mapping inspected. Review the displayed counts and rows.':'Original source inspected. Choose or correct the mapping fields, then preview them.');
  }
  function render(){
    const r=inspection;if(!r){clearPanels();return;}
    fieldCaption.textContent=(r.fieldsPage.total?fieldOffset+1:0)+'–'+(fieldOffset+r.fields.length)+' of '+r.fieldsPage.total+' matching fields'+(fieldSearch?' for “'+fieldSearch+'”':'')+'; '+r.rowCount+' original rows.';
    fieldList.replaceChildren();
    for(const f of r.fields){const d=node('details');d.append(node('summary',f.path+' — '+f.present+' present, '+f.blank+' blank'));
      d.append(node('p','Types: '+Object.entries(f.types).map(([k,v])=>k+' '+v).join(', ')));
      for(const example of f.examples??[])d.append(node('pre',typeof example.value==='string'?example.value:JSON.stringify(example.value)));
      if(f.collisions?.length)d.append(node('p','A literal field and a nested path overlap. The original mapper uses the literal field first. Inspect the original rows below.'));
      if(f.pathSupported===false)d.append(node('p','This field path cannot be used by the original mapper.'));
      fieldList.append(d);
    }
    summary.replaceChildren(node('p',r.source.name+' · '+r.source.bytes+' bytes · '+r.source.format),node('p','Original file SHA-256: '+r.source.sha256));
    const m=r.mapped;
    if(m?.valid){
      summary.append(node('p',m.queryCount+' distinct address queries; '+m.invalidRows+' rows without a valid query; '+m.problemRows+' rows with reported problems.'),
        node('p',m.duplicateIdentities+' repeated identifier groups across '+m.duplicateIdentityRows+' rows. Repeated rows are retained; an identifier need not be unique.'),
        node('p',m.coordinateCoverage.mapped?'Original coordinates: '+m.coordinateCoverage.valid+' valid, '+m.coordinateCoverage.missing+' missing, '+m.coordinateCoverage.invalid+' invalid.':'Original latitude and longitude are not mapped.'));
      if(m.missingPaths?.length)summary.append(node('p','Mapped paths absent from this file: '+m.missingPaths.map(x=>x.key+' → '+x.path).join(', ')));
    }else if(m)for(const error of m.errors??[])summary.append(node('p','Mapping needs attention: '+(typeof error==='string'?error:error.message??JSON.stringify(error))));
    rowCaption.textContent=(r.rowsPage.total?rowOffset+1:0)+'–'+(rowOffset+r.rows.length)+' of '+r.rowsPage.total+' original rows. This display reflects the last successful preview.';
    rows.replaceChildren();
    for(const row of r.rows){
      const d=node('details');d.append(node('summary','Original row '+row.ordinal+(row.problems?.length?' · '+row.problems.join(', '):'')));
      d.append(node('pre',JSON.stringify(row,null,2)));rows.append(d);
    }
    showReadiness();
  }
  async function payload(){
    if(!inspection?.mapped?.valid||previewBinding!==signature())throw new Error('Preview the current source and mapping choices before importing or retaining them.');
    return {...await original(),format:$('format').value,name:$('name').value,sourceURL:$('url').value||null,
      provenance:$('provenance').value,mapping:copy(inspection.mapped.mapping),
      expectedSourceSha256:inspection.source.sha256,expectedMappingSha256:inspection.mapped.mappingSha256};
  }
  function portable(){
    return {schema:SCHEMA,source:copy(expectedSource??lastSource),mappingText:mapping.value,
      fields:Object.fromEntries(['format','name','url','provenance','path'].map(k=>[k,$(k).value])),
      view:{mode:mode.value,fieldSearch:search.value},savedAt:new Date().toISOString()};
  }
  function validateSetup(value){
    if(!value||value.schema!==SCHEMA||typeof value.mappingText!=='string'||value.mappingText.length>65536||
        !value.fields||typeof value.fields!=='object'||!value.view||!['text','structured'].includes(value.view.mode)||
        typeof value.view.fieldSearch!=='string'||!['csv','json'].includes(value.fields.format)||
        !['name','url','provenance','path'].every(k=>typeof value.fields[k]==='string')||
        value.source&&(!/^[a-f0-9]{64}$/.test(value.source.sha256)||!['csv','json'].includes(value.source.format)))
      throw new Error('Open the complete original Geoapify mapping setup.');
  }
  function setupTextBytes(value){
    validateSetup(value);
    const text=JSON.stringify(value,null,2)+'\n';
    if(new TextEncoder().encode(text).length>262144)throw new Error('The complete mapping setup exceeds256KiB. Shorten large notes before downloading; your current working text remains in the form.');
    return text;
  }
  function restore(value){
    if(!value)return;validateSetup(value);inspection=null;previewBinding=null;lastSource=copy(value.source);expectedSource=copy(value.source);
    mapping.value=value.mappingText;for(const[k,v]of Object.entries(value.fields))if(['format','name','url','provenance','path'].includes(k))$(k).value=v;
    mode.value=value.view.mode;search.value=value.view.fieldSearch;fieldSearch='';fieldOffset=rowOffset=0;rebuildSelectors();clearPanels();
  }
  mapping.addEventListener('input',()=>{previewBinding=null;try{const m=readMapping();mode.value=m.text?'text':KEYS.slice(1,8).some(k=>m[k])?'structured':mode.value;}catch{}rebuildSelectors();showReadiness();});
  for(const id of ['file','path','format'])for(const event of ['input','change'])$(id).addEventListener(event,()=>{inspection=null;previewBinding=null;fieldOffset=rowOffset=0;fieldSearch='';search.value='';clearPanels();});
  try{const m=readMapping();mode.value=m.text?'text':KEYS.slice(1,8).some(k=>m[k])?'structured':'text';}catch{}
  rebuildSelectors();clearPanels();
  return {capture:portable,restore,payload,controls,clear(){inspection=null;lastSource=null;expectedSource=null;previewBinding=null;fieldOffset=rowOffset=0;fieldSearch='';mode.value='text';search.value='';rebuildSelectors();clearPanels();},
    clearFile(){inspection=null;previewBinding=null;clearPanels();}};
}
