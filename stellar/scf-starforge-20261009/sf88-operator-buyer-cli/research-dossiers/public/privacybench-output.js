// SPDX-License-Identifier: MIT
// Typed native-result intake inside the maintained original-output desk.
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const choice=(value,label)=>{const n=node('option',label);n.value=value;return n;};
export function privacyBenchDraft(plan){
 return {schema:'sf88-privacybench-browser-selection/v1',datasetId:'',datasetRevision:'',cohortRef:'',protocolId:'',
  candidateName:'',candidateVersion:'',candidateKind:'PLATFORM',candidateDescription:'',
  externalRunId:'',runKind:'IMPORTED_MEASUREMENT',runStatus:'SUCCEEDED',startedAt:'',finishedAt:'',elapsedMs:'',
  engineName:'Tonic PrivacyBench native evaluator',engineVersion:'',engineCommand:'',limitations:'',
  reviewer:'',advanced:{candidateConfiguration:'{}',runtime:'{}',inputDefinition:'{}',sourceRefs:'[]'},
  results:null,originals:[],generated:false};
}
export function renderPrivacyBenchPanel({draft,profile,caseDefinition,locked,edit,action,uploadResults,uploadOriginals,removeOriginal,
 preview,proposeProtocol,useSelectedProtocol,prepare,successor,downloadProfile,downloadOriginal}){
 const box=node('section',undefined,'output-card privacybench-panel');box.dataset.privacybenchPanel='';
 box.append(node('h3','PrivacyBench native results'),node('p','Select the original native results.json, identify its dataset edition and cohort, then review the producer’s complete metric groups before importing them into this comparison.'));
 const field=(label,key,{type='text',options=null,advanced=false}={})=>{
  const l=node('label',undefined,'output-field'),input=node(options?'select':type==='area'?'textarea':'input');
  l.append(node('span',label));input.dataset.privacybenchField=key;
  if(options)input.append(...options.map(x=>choice(...x)));else if(type==='area')input.rows=3;else input.type=type;
  input.value=(advanced?draft.advanced?.[key]:draft[key])??'';input.disabled=locked||draft.generated;
  input.addEventListener(options?'change':'input',()=>edit(key,input.value,{advanced}));l.append(input);return l;
 };
 const grid=(...children)=>{const d=node('div',undefined,'output-grid');d.append(...children);return d;};
 const button=(label,fn,{write=false,disabled=false}={})=>{const b=node('button',label);b.type='button';b.disabled=disabled||write&&(locked||draft.generated);if(write)b.dataset.outputEdit='1';b.addEventListener('click',()=>action(fn));return b;};
 const input=node('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','Select PrivacyBench native results.json');input.disabled=locked||draft.generated;input.dataset.outputEdit='1';
 input.addEventListener('change',()=>action(()=>uploadResults(input.files[0])));
 box.append(input,grid(field('Dataset identifier','datasetId'),field('Exact dataset revision','datasetRevision'),field('Cohort identifier','cohortRef')));
 if(draft.results)box.append(node('p',draft.results.name+' · '+draft.results.bytes.toLocaleString()+' bytes'),button('Download selected native result',()=>downloadOriginal(draft.results)));
 box.append(button('Read native result and complete metric groups',preview,{write:true,disabled:!draft.results}));
 if(profile){
  const p=profile.providerReview;box.append(node('p',profile.metricRows+' source metrics · run '+p.sourceRunName+' · '+(p.judgeSkipped?'judge skipped; synthesis rates remain unavailable':'original judge state retained')));
  box.append(node('p','Original overlap threshold: '+String(p.config.overlap_threshold)+'. Each group keeps its own original denominator. Character groups and document/message rollups overlap and cannot be summed.'));
  const viewport=node('div'),search=node('input');search.type='search';search.placeholder='Find a group, label, measure or original JSON pointer';search.setAttribute('aria-label','Search PrivacyBench original metric rows');search.dataset.outputRead='1';
  let offset=0,query='';const draw=()=>{
   const rows=profile.rows.filter(r=>!query||JSON.stringify(r).toLowerCase().includes(query));
   offset=Math.min(offset,Math.max(0,Math.floor((rows.length-1)/25)*25));
   const wrap=node('div',undefined,'output-table');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Original PrivacyBench metric groups');
   const table=node('table'),head=node('thead'),tr=node('tr');
   for(const label of ['Group / label','Measure','Original value','Denominator','Source'])tr.append(node('th',label));head.append(tr);table.append(head);const body=node('tbody');
   for(const r of rows.slice(offset,offset+25)){const row=node('tr');for(const value of [r.dimension+' / '+r.group+' / '+r.label,r.measure,r.value===''?'Unavailable — '+r.undefined_reason:r.value+' '+r.unit,r.denominator_name+' = '+r.denominator_value,r.source_pointer])row.append(node('td',value));body.append(row);}table.append(body);wrap.append(table);
   const nav=node('div',undefined,'output-actions');nav.append(button('Previous metrics',async()=>{offset=Math.max(0,offset-25);draw();},{disabled:offset===0}),node('span',(rows.length?offset+1:0)+'–'+Math.min(offset+25,rows.length)+' of '+rows.length),button('Next metrics',async()=>{offset+=25;draw();},{disabled:offset+25>=rows.length}));
   viewport.replaceChildren(wrap,nav);
  };search.addEventListener('input',()=>{query=search.value.toLowerCase();offset=0;draw();});box.append(search,viewport);draw();
  const details=node('details');details.append(node('summary','Complete original producer configuration'),node('pre',JSON.stringify(p.config,null,2)));box.append(details);
  box.append(button('Download complete native-source review',downloadProfile),button('Prepare protocol with these native criteria',proposeProtocol,{write:true}));
  const criteria=profile.criteria??[];const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const available=criteria.every(c=>caseDefinition?.criteria?.some(x=>x.id===c.id&&Object.keys(c).every(k=>same(x[k],c[k]))));
  box.append(node('p',available?'The selected saved protocol contains every source-defined native criterion.':'Prepare and save the native criteria in the original comparison case editor, select that saved protocol, then continue this retained source as an editable successor.'));
  box.append(button('Use selected saved protocol in a successor copy',useSelectedProtocol,{write:true,disabled:!available}));
 }
 const metadata=node('details');metadata.open=true;metadata.append(node('summary','Candidate and original execution'));
 metadata.append(grid(field('Candidate name','candidateName'),field('Candidate release or edition','candidateVersion'),field('Candidate type','candidateKind',{options:[['PLATFORM','Platform'],['MODEL','Model'],['ARCHITECTURE','Architecture']]})),field('Candidate context','candidateDescription',{type:'area'}));
 metadata.append(grid(field('Original run identifier','externalRunId'),field('Original evaluation protocol identifier','protocolId'),field('Recorded run kind','runKind',{options:[['IMPORTED_MEASUREMENT','Imported producer measurement'],['TRAINING_FIXTURE','Explicit software fixture']]}),field('Original run status','runStatus',{options:[['SUCCEEDED','Succeeded'],['FAILED','Failed'],['CANCELLED','Cancelled']]})));
 metadata.append(grid(field('Original start — UTC ISO timestamp','startedAt'),field('Original finish — UTC ISO timestamp','finishedAt'),field('Original elapsed milliseconds, when available','elapsedMs',{type:'number'})));
 metadata.append(grid(field('Original evaluator name','engineName'),field('Actual evaluator version or commit','engineVersion')),field('Original command arguments, one per line','engineCommand',{type:'area'}),field('Original limitations, one per line','limitations',{type:'area'}),field('Person reviewing this source and selection','reviewer'));
 const advanced=node('details');advanced.append(node('summary','Additional original configuration and source references'));
 advanced.append(field('Complete original candidate configuration — JSON','candidateConfiguration',{type:'area',advanced:true}),field('Actual producer runtime — JSON','runtime',{type:'area',advanced:true}),field('Additional population and method definition — JSON','inputDefinition',{type:'area',advanced:true}),field('Retained input source references — JSON array','sourceRefs',{type:'area',advanced:true}));
 metadata.append(advanced);box.append(metadata);
 const attachments=node('input');attachments.type='file';attachments.multiple=true;attachments.setAttribute('aria-label','Add original PrivacyBench summary, viewer or configuration files');attachments.disabled=locked||draft.generated;attachments.dataset.outputEdit='1';
 attachments.addEventListener('change',()=>action(()=>uploadOriginals([...attachments.files])));box.append(node('h4','Original supporting files'),node('p','Add the original summary.md, viewer.html, configuration, logs or other source files. They travel intact with the results.'),attachments);
 for(const f of draft.originals){const row=node('div',undefined,'output-actions');row.append(node('span',f.name+' · '+f.bytes.toLocaleString()+' bytes'),button('Download '+f.name,()=>downloadOriginal(f)),button('Remove '+f.name,()=>removeOriginal(f),{write:true}));box.append(row);}
 const controls=node('div',undefined,'output-actions');if(draft.generated)controls.append(node('p','This generated plan and all original files are retained below. Continue with the existing complete row review and candidate/import controls.'),button('Create editable PrivacyBench successor',successor));
 else controls.append(button('Prepare complete native intake for this saved protocol',prepare,{write:true,disabled:!profile||!draft.results}));
 box.append(controls,node('p','Original JSON is limited to 32 MiB; all selected and generated files together must fit 63 MiB, and the complete encoded Research run must fit 64 MiB. The preparation checks these before a candidate or run request is frozen.'));
 return box;
}
