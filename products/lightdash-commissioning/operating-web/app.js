// MIT. Original plan editor; the authenticated service only exposes procedure methods.
const $=id=>document.getElementById(id),clone=x=>structuredClone(x);
let current=null,draft=null,source=null,incoming=null,review=null,dirty=false,busy=false,key=null,pending=null;
const notice=(message,error=false)=>{$('notice').textContent=message;$('notice').classList.toggle('error',error);};
const json=x=>JSON.stringify(x,null,2);
function element(tag,text){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;}
function download(name,text,type='application/json'){const a=element('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function call(method,args={}){
 const response=await fetch('/api/call',{method:'POST',headers:{'Content-Type':'application/json','X-Procedure-Token':document.querySelector('meta[name=procedure-token]').content},body:JSON.stringify({method,args})});
 const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error??'The original procedure request failed.'),{code:value.code});return value;
}
function locked(){
 document.querySelectorAll('main button,main input,main select,main textarea').forEach(el=>el.disabled=busy||Boolean(pending));
 $('retry').disabled=busy;$('pending-download').disabled=busy;$('pending-set-aside').disabled=busy;
 $('apply-return').disabled=busy||Boolean(pending)||!review?.comparison.ready;
}
function retainDraft(){if(!current||!draft)return;sessionStorage.setItem(key+':draft:'+current.procedure.id,JSON.stringify({version:current.version,draft}));}
function changed(){dirty=true;review=null;locked();try{retainDraft();notice('Unsaved editable draft retained in this browser.');}catch{notice('Browser storage is full. Keep this page open and download the complete draft before reloading.',true);}}
function field(label,value,onInput,{area=false,type='text'}={}){
 const wrapper=element('label',label),input=element(area?'textarea':'input');if(!area)input.type=type;input.value=value??'';
 input.addEventListener('input',()=>{onInput(input.value);changed();});wrapper.append(input);return wrapper;
}
function setPending(value){
 // This write must succeed before any mutation leaves the browser.
 sessionStorage.setItem(key,JSON.stringify(value));pending=value;showPending();
}
function showPending(){$('pending').hidden=!pending;$('pending-details').textContent=pending?json({method:pending.method,planId:pending.args.planId,requestId:pending.args.requestId,expectedVersion:pending.args.expectedVersion}):'';locked();}
function clearPending(){sessionStorage.removeItem(key);pending=null;showPending();}
async function mutation(method,args){
 if(pending)throw Error('Continue or retain the existing pending request first.');
 const request={method,args:{...args,requestId:crypto.randomUUID()}};
 setPending(request);return runPending();
}
async function runPending(){
 if(!pending)return;busy=true;locked();
 try{
  const result=await call(pending.method,pending.args);
  clearPending();
  if(result.procedure){accept(result);await refreshList(result.procedure.id);}
  notice((result.replayed?'Original request reconciled. ':'Saved. ')+(result.receipt?'Procedure version '+result.receipt.version+'; original plan revision '+result.receipt.planRevision+'.':''));
  return result;
 }finally{busy=false;locked();}
}
function accept(result){
 current=result;draft=clone(result.draft);dirty=false;review=null;
 sessionStorage.removeItem(key+':draft:'+current.procedure.id);render();
}
function render(){
 const plan=current.procedure.plan;
 $('editor').hidden=$('observations').hidden=$('exports').hidden=false;
 $('plan-title').textContent=draft.content.title;
 $('version').textContent='Procedure '+plan.id+' · Version '+current.version+' · '+plan.revisions.length+' saved plan revisions · Origin workspace '+current.procedure.workspaceId+
  (current.procedure.workspaceId!==current.receivingWorkspaceId?' · Received copy; native capture requires the original workspace.':'');
 $('history').replaceChildren(...plan.revisions.map(r=>{const o=element('option','Revision '+r.revision+' · '+r.savedAt);o.value=r.revision;return o;}));$('history').value=plan.revisions.length;
 $('plan-fields').replaceChildren(...['title','customer','purpose','period','owner'].map(k=>field(k[0].toUpperCase()+k.slice(1),draft.content[k],v=>draft.content[k]=v,{area:k==='purpose'})));
 $('receiving').value=draft.content.receiving;$('notes').value=draft.content.notes;
 $('steps').replaceChildren(...draft.content.steps.map((step,index)=>{
  const box=element('article');box.className='step';const head=element('header'),title=element('h3',(index+1)+'. '+step.title);head.append(title);
  for(const [label,delta]of [['Up',-1],['Down',1]]){
   const b=element('button',label);b.type='button';b.addEventListener('click',()=>{const target=index+delta;if(target<0||target>=draft.content.steps.length)return;
    [draft.content.steps[index],draft.content.steps[target]]=[draft.content.steps[target],draft.content.steps[index]];changed();render();});head.append(b);
  }
  const remove=element('button','Remove');remove.type='button';remove.addEventListener('click',()=>{if(!confirm('Remove this step from the editable revision? Saved history remains.'))return;draft.content.steps.splice(index,1);changed();render();});head.append(remove);box.append(head,element('p','Step '+step.id));
  const grid=element('div');grid.className='grid';
  for(const k of ['title','owner','due'])grid.append(field(k[0].toUpperCase()+k.slice(1),step[k],v=>step[k]=v,{type:k==='due'?'date':'text'}));
  const status=element('label','Operator progress'),select=element('select');
  for(const s of ['planned','in-progress','completed','skipped']){const o=element('option',s);o.value=s;select.append(o);}select.value=step.status;select.addEventListener('change',()=>{step.status=select.value;changed();});status.append(select);grid.append(status);box.append(grid);
  for(const k of ['instruction','inputs','expectedResult','recordedResult'])box.append(field({instruction:'Instructions',inputs:'Inputs and original identities',expectedResult:'Expected result',recordedResult:'Operator-recorded outcome / acceptance'}[k],step[k],v=>step[k]=v,{area:true}));
  const details=element('details'),summary=element('summary','Original command registration and argv');details.append(summary,element('pre',json({selection:step.selection,argv:step.argv})));box.append(details);return box;
 }));
 $('draft-json').value=json(draft);
 const all=['editions','reviews','operations','handovers'].flatMap(k=>current.procedure.bindings[k].map(b=>({...b,kind:k})));
 $('capture-steps').replaceChildren(...all.map(b=>{const l=element('label');l.className='choice';const input=element('input');input.type='checkbox';input.dataset.capture=b.stepId;l.append(input,document.createTextNode(b.kind+' · '+b.id+' → '+b.stepId));return l;}));
 $('captures').replaceChildren(...current.procedure.captures.slice().reverse().map(c=>{const d=element('details');d.append(element('summary',c.observedAt+' · '+c.rows.length+' observations · '+c.id),element('pre',json(c)));return d;}));
 locked();
}
async function refreshList(selected){
 const result=await call('list');$('procedures').replaceChildren(...result.procedures.map(p=>{const o=element('option',p.title+' · v'+p.version+' · '+p.id);o.value=p.id;return o;}));if(selected)$('procedures').value=selected;
}
async function loadSelected(){
 if(dirty&&!confirm('Keep the browser draft and open the saved procedure?'))return;
 const result=await call('read',{planId:$('procedures').value}),saved=sessionStorage.getItem(key+':draft:'+result.procedure.id);
 current=result;draft=clone(result.draft);dirty=false;review=null;
 if(saved){const retained=JSON.parse(saved);if(retained.version===result.version&&confirm('Reopen the retained unsaved draft for this exact procedure version?')){draft=retained.draft;dirty=true;}
  else if(retained.version!==result.version)notice('A draft from an earlier version is retained. Download it before deliberately replacing it.',true);}
 render();
}
function drawSource(){
 const root=$('source-options');root.replaceChildren();
 for(const kind of ['editions','reviews','operations','handovers']){
  const box=element('fieldset');box.append(element('legend',kind));
  for(const row of source.native[kind]){
   const label=element('label');label.className='choice';const input=element('input');input.type='checkbox';input.dataset.kind=kind;input.value=row.id;
   label.append(input,document.createTextNode(row.id+' · '+(row.label??row.action??row.state??row.reviewedBy??'Saved source')));box.append(label);
  }root.append(box);
 }
}
const guarded=fn=>async event=>{event?.preventDefault();if(busy)return;busy=true;locked();try{await fn(event);}catch(error){notice(error.message,true);}finally{busy=false;locked();}};
$('create').addEventListener('submit',guarded(async()=>{
 const selection=Object.fromEntries(['editions','reviews','operations','handovers'].map(k=>[k,[...document.querySelectorAll('[data-kind="'+k+'"]:checked')].map(x=>x.value)]));
 await mutation('create',{planId:$('new-id').value,title:$('new-title').value,customer:$('new-customer').value,owner:$('new-owner').value,purpose:$('new-purpose').value,selection,expectedVersion:0});
}));
$('edit').addEventListener('submit',guarded(()=>mutation('save',{planId:current.procedure.id,expectedVersion:current.version,draft})));
$('receiving').addEventListener('input',()=>{draft.content.receiving=$('receiving').value;changed();});
$('notes').addEventListener('input',()=>{draft.content.notes=$('notes').value;changed();});
$('load').addEventListener('click',guarded(loadSelected));
$('refresh').addEventListener('click',guarded(()=>refreshList(current?.procedure.id)));
$('history-open').addEventListener('click',guarded(()=>{
 if(dirty&&!confirm('Replace the editable draft with this complete historical revision?'))return;
 const r=current.procedure.plan.revisions.find(x=>x.revision===Number($('history').value));
 const {revision,savedAt,...content}=clone(r);draft={schema:'stellar-forge.operating-plan-draft.v1',planId:current.procedure.id,baseRevision:current.procedure.plan.revisions.length,content};changed();render();
}));
$('add-step').addEventListener('click',guarded(()=>{
 draft.content.steps.push({id:'step-'+crypto.randomUUID(),title:'New operating step',instruction:'',inputs:'',expectedResult:'',owner:'',due:'',status:'planned',recordedResult:'',argv:[],selection:null});changed();render();
}));
$('draft-show').addEventListener('click',()=>{$('draft-json').value=json(draft);});
$('draft-use').addEventListener('click',guarded(()=>{const value=JSON.parse($('draft-json').value);if(value.planId!==current.procedure.id||value.baseRevision!==current.procedure.plan.revisions.length||!Array.isArray(value.content?.steps))throw Error('Keep the original plan ID/base revision and complete steps.');draft=value;changed();render();}));
$('capture').addEventListener('click',guarded(async()=>{
 if(dirty)throw Error('Save or reopen the original procedure before capturing outcomes.');
 await mutation('capture',{planId:current.procedure.id,expectedVersion:current.version,captureId:'capture-'+crypto.randomUUID(),stepIds:[...document.querySelectorAll('[data-capture]:checked')].map(x=>x.dataset.capture)});
}));
$('incoming-file').addEventListener('change',guarded(async()=>{
 const file=$('incoming-file').files[0];if(!file)return;if(file.size>24*1024*1024)throw Error('Choose a complete JSON file up to 24 MiB.');
 incoming=JSON.parse(await file.text());review=null;$('incoming-info').textContent=file.name+' · '+file.size+' bytes · '+(incoming.id??'unrecognized ID');locked();
}));
const incomingPlan=()=>{if(!incoming)throw Error('Select the complete returned JSON first.');return incoming.plan??incoming;};
$('adopt').addEventListener('click',guarded(()=>{if(!incoming?.bindings)throw Error('Choose the complete procedure JSON for adoption.');return mutation('adopt',{planId:incoming.id,expectedVersion:0,procedure:incoming});}));
$('receive').addEventListener('click',guarded(()=>{if(!current)throw Error('Open the original receiving procedure first.');if(dirty)throw Error('Save or reopen the existing draft first.');return mutation('receive',{planId:current.procedure.id,expectedVersion:current.version,incoming:incoming});}));
$('preview-return').addEventListener('click',guarded(async()=>{
 if(!current||dirty)throw Error('Open a saved receiving procedure before comparison.');
 review=await call('return_preview',{planId:current.procedure.id,incoming:incomingPlan(),reviewId:$('review-id').value,reviewer:$('reviewer').value,notes:$('review-note').value,decisions:JSON.parse($('decisions').value)});
 $('return-comparison').textContent=json(review.comparison);locked();
}));
for(const id of ['review-id','reviewer','review-note','decisions'])$(id).addEventListener('input',()=>{review=null;locked();});
$('apply-return').addEventListener('click',guarded(()=>{if(!review?.comparison.ready)throw Error('Complete the original return comparison.');return mutation('return_apply',{planId:current.procedure.id,expectedVersion:review.version,review:review.review});}));
document.querySelectorAll('[data-export]').forEach(button=>button.addEventListener('click',guarded(async()=>{
 const file=await call('export',{planId:current.procedure.id,format:button.dataset.export});download(file.filename,file.content,file.contentType);
})));
$('retry').addEventListener('click',guarded(runPending));
$('pending-download').addEventListener('click',()=>download('lightdash-original-procedure-request.json',json(pending)));
$('pending-set-aside').addEventListener('click',guarded(async()=>{
 if(!confirm('Retain this unresolved request in browser history and stop automatic retry? Read the current saved procedure before preparing another edit.'))return;
 sessionStorage.setItem(key+':retained:'+pending.args.requestId,JSON.stringify(pending));clearPending();await refreshList(current?.procedure.id);notice('The original request is retained. Reopen current saved work before editing.');
}));
window.addEventListener('beforeunload',event=>{if(dirty||pending){event.preventDefault();event.returnValue='';}});
await guarded(async()=>{
 source=await call('source');key='lightdash-operating-request:'+source.editor.workspaceId;
 const old=sessionStorage.getItem(key);pending=old?JSON.parse(old):null;
 $('workspace').textContent=source.editor.title+' · '+source.editor.workspaceId;
 if(source.editor.browserUrl){$('commissioning').href=source.editor.browserUrl;$('commissioning').hidden=false;}
 $('new-id').value='commissioning-'+crypto.randomUUID();$('new-title').value=source.editor.title+' operating procedure';$('review-id').value='return-'+crypto.randomUUID();
 drawSource();await refreshList();showPending();notice(pending?'Continue the retained original request.':'Select commissioning work or open a saved procedure.');
})();
