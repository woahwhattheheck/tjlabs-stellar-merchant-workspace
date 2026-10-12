// MIT. Original subscription operator; requests are captured before controls become busy.
const $=id=>document.getElementById(id),content=$('content');let status,tab='publishers',busy=false;
const selected={publisher:null,customer:null};let retryKey;
function el(tag,text,attrs={}){const node=document.createElement(tag);if(text!==undefined&&text!==null)node.textContent=String(text);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);return node;}
function append(parent,...children){parent.append(...children.filter(Boolean));return parent;}
function panel(title,...children){return append(el('section',null,{class:'panel'}),el('h2',title),...children);}
function note(text){return el('p',text,{class:'muted'});}
function button(text,fn,primary=false){const b=el('button',text,{type:'button',...(primary?{class:'primary'}:{})});b.onclick=fn;return b;}
function json(value){return JSON.stringify(value,null,2);}
function setBusy(value){busy=value;document.querySelectorAll('button,input,select,textarea').forEach(n=>n.disabled=value);}
function message(value,error=false){$('message').textContent=value;$('message').className=error?'error':'';}
async function api(operation,args={}){
 const response=await fetch('./api/operate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,args})});
 const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.message||'The original operation did not complete.'),{code:value.error});return value;
}
function showResult(value){$('result').textContent=json(value);$('receipt').open=true;}
function retryView(){
 $('retry').replaceChildren();if(!retryKey)return;
 let value;try{value=JSON.parse(localStorage.getItem(retryKey)||'null');}catch{}
 if(value)append($('retry'),el('strong','Selected request: '+value.operation+' '),note('Continue this exact request after an interruption. Its original IDs and edition selection remain unchanged.'),button('Retry selected request',()=>perform(value.operation,value.args)));
}
async function perform(operation,args){
 if(busy)return;const request={operation,args:JSON.parse(JSON.stringify(args))};
 localStorage.setItem(retryKey,json(request));retryView();setBusy(true);message('Running '+operation+'…');
 try{const result=await api(operation,request.args);showResult(result);localStorage.removeItem(retryKey);message('Completed '+operation+'.');retryView();await render();return result;}
 catch(error){message((error.code?error.code+': ':'')+error.message,true);}
 finally{setBusy(false);}
}
function field(form,name,label,{value='',type='text',options,required=true,description}={}){
 const labelNode=el('label',label);let input;
 if(options){input=el('select',null,{name});for(const [v,t]of options)input.append(el('option',t,{value:v}));input.value=String(value);}
 else if(type==='textarea'){input=el('textarea',value,{name});}
 else{input=el('input',null,{name,type});if(type==='checkbox')input.checked=value===true;else input.value=value;}
 if(required&&type!=='checkbox')input.required=true;
 append(form,labelNode,input,description?note(description):null);return input;
}
function form(title,operation,build,read){
 const f=el('form');build(f);f.append(el('button',title,{type:'submit',class:'primary'}));
 f.onsubmit=event=>{event.preventDefault();try{const data=new FormData(f),args=read(data);void perform(operation,args);}catch(error){message(error.message,true);}};
 return f;
}
const options=group=>Object.entries(status[group]).map(([id,row])=>[id,row.label+' ('+id+')']);
function aliasPicker(group,key,renderView){
 const choices=options(group);if(!choices.length)return note('No '+group+' are configured in this connection.');
 if(!choices.some(([id])=>id===selected[key]))selected[key]=choices[0][0];
 const row=el('div',null,{class:'actions'}),select=el('select');
 for(const [value,label]of choices)select.append(el('option',label,{value}));select.value=selected[key];
 select.onchange=()=>{selected[key]=select.value;void renderView();};return append(row,select,button('Reload',renderView));
}
function table(headers,rows){
 const t=el('table'),head=el('thead'),body=el('tbody');append(head,append(el('tr'),...headers.map(h=>el('th',h))));
 for(const row of rows)body.append(append(el('tr'),...row.map(cell=>{const td=el('td');td.append(cell instanceof Node?cell:el('span',cell));return td;})));
 append(t,head,body);return append(el('div',null,{class:'scroll'}),t);
}
function cell(value){return value===null?'null':typeof value==='object'?JSON.stringify(value):String(value);}
async function rowPanel(operation,args,{changes=false}={}){
 const box=panel(changes?'Selected edition changes':'Selected rows'),area=el('div');box.append(area);let offset=0;
 async function page(){area.replaceChildren(note('Reading retained rows…'));try{const result=await api(operation,{...args,offset,limit:50});
  const items=result.items||[],cols=changes?['key','operation','before','after','values']:['key','values'];
  area.replaceChildren(note('Rows '+offset+'–'+(offset+items.length)+' of '+result.total+'. Edition '+(result.revision??args.revision??'')),table(cols,items.map(r=>cols.map(n=>cell(r[n])))));
  const actions=el('div',null,{class:'actions'});if(offset>0)actions.append(button('Previous',()=>{offset=Math.max(0,offset-50);void page();}));if(result.nextOffset!==null)actions.append(button('Next',()=>{offset=result.nextOffset;void page();}));area.append(actions);
 }catch(error){area.replaceChildren(note(error.message));}}
 await page();return box;
}
async function inputChoices(kinds){
 const native=Object.entries(status.inputs).filter(([,v])=>kinds.includes(v.kind)).map(([k,v])=>['input:'+k,v.label+' — '+v.kind]);
 let offset=0;do{const page=await api('artifacts',{offset,limit:100});for(const record of page.items)if(record.state==='COMPLETE'&&kinds.includes(record.kind))native.push(['artifact:'+record.artifact,record.artifact+' — '+record.kind]);offset=page.nextOffset;}while(offset!==null);
 return native;
}
const inputArgs=value=>{const index=value.indexOf(':');return {[value.slice(0,index)]:value.slice(index+1)};};
function receiveForm(title,operation,key,id,choices){
 if(!choices.length)return note('Declare a matching complete input, or create a retained delivery first.');
 return form(title,operation,f=>field(f,'input','Original input',{options:choices,value:choices[0][0]}),data=>({[key]:id,...inputArgs(data.get('input'))}));
}
async function publishers(){
 content.replaceChildren(el('h1','Publisher editions'),note('Append complete retained collections with the same selected entity keys and fields. A removal records membership in the selected query.'),aliasPicker('publishers','publisher',publishers));const id=selected.publisher;if(!id)return;
 let current;try{current=await api('publisher-inspect',{publisher:id});}catch(error){content.append(note(error.message));}
 if(!current?.head){
  const choices=options('collections');
  if(choices.length)content.append(panel('Create the selected subscription',form('Create subscription','publisher-create',f=>{
   field(f,'collection','Complete original collection',{options:choices,value:choices[0][0]});field(f,'title','Subscription title',{value:status.publishers[id].label});
   field(f,'fields','Selected field paths',{required:false,description:'Comma separated. Leave empty to retain every field in the original collection, including all entity keys.'});
   field(f,'requestId','Original request ID',{value:crypto.randomUUID()});
  },data=>({publisher:id,collection:data.get('collection'),title:data.get('title'),requestId:data.get('requestId'),...(String(data.get('fields')).trim()?{fields:String(data.get('fields')).split(',').map(x=>x.trim())}:{})}))));
 }else{
  const e=current.current;
  content.append(panel(current.definition.title,el('p','Edition '+current.head+' · '+e.rows+' rows · '+e.counts.events+' changes',{class:'stat'}),
   note('Entity set: '+current.definition.entitySet+' · Keys: '+current.definition.keys.join(', ')),el('pre',json({editionSha256:e.manifestSha256,query:e.source.query,counts:e.counts}))));
  if(current.pending)content.append(panel('Selected unfinished request',el('p',current.pending),button('Cancel selected request',()=>perform('publisher-cancel',{publisher:id,requestId:current.pending}))));
  const choices=options('collections');if(choices.length)content.append(panel('Append a complete collection',form('Append selected edition','publisher-append',f=>{
   field(f,'collection','Original collection',{options:choices,value:choices[0][0]});field(f,'requestId','Original request ID',{value:crypto.randomUUID()});
   field(f,'note','Edition note',{type:'textarea'});field(f,'scope','Allow this reviewed query scope change',{type:'checkbox',value:false,required:false,description:'Use only when the original query filter, ordering or other membership scope changes. The edition and delivery retain that change.'});
  },data=>({publisher:id,collection:data.get('collection'),requestId:data.get('requestId'),expectedRevision:current.head,note:data.get('note'),allowScopeChange:data.get('scope')==='on'}))));
  const grid=el('div',null,{class:'grid'});
  grid.append(panel('Prepare customer delivery',form('Retain complete delivery','publisher-delivery',f=>{
   field(f,'artifact','Delivery ID',{value:'delivery-'+crypto.randomUUID()});field(f,'from','Customer current revision',{value:'0',type:'number',description:'0 creates a complete baseline. A positive revision creates the ordered changes from that exact saved edition.'});
  },data=>({publisher:id,artifact:data.get('artifact'),fromRevision:Number(data.get('from')),toRevision:current.head}))));
  grid.append(panel('Backup and original source',button('Retain complete publisher backup',()=>perform('publisher-backup',{publisher:id,artifact:'publisher-backup-'+crypto.randomUUID(),expectedRevision:current.head})),
   note('Includes every completed edition, original collection and terminal request identity.'),
   button('Retain selected supplier source',()=>perform('publisher-source',{publisher:id,artifact:'original-'+crypto.randomUUID(),revision:current.head}))));
  content.append(grid);
  const history=await api('publisher-editions',{publisher:id,limit:100});content.append(panel('Edition history',table(['Edition','Rows','Changes','Scope','Note'],history.items.map(x=>[x.revision,x.rows,x.counts.events,x.scopeChanged?'Changed':'Same',x.note]))));
  content.append(await rowPanel('publisher-rows',{publisher:id,revision:current.head,kind:'changes'},{changes:true}));
 }
 content.append(panel('Restore a complete publisher',receiveForm('Restore selected backup','publisher-restore','publisher',id,await inputChoices(['publisher-backup']))));
}
async function customers(){
 content.replaceChildren(el('h1','Customer receiving'),note('Apply a complete baseline followed by ordered deliveries. Each apply verifies the prior row hashes and the full resulting edition.'),aliasPicker('customers','customer',customers));const id=selected.customer;if(!id)return;
 let current;try{current=await api('customer-inspect',{customer:id});}catch(error){content.append(note(error.message));}
 content.append(panel(current?'Apply the next delivery':'Receive a complete baseline',receiveForm('Receive selected delivery','customer-receive','customer',id,await inputChoices(['transfer']))));
 if(current){
  content.append(panel(current.definition.title,el('p','Edition '+current.revision+' · '+current.rows+' rows',{class:'stat'}),el('pre',json({editionSha256:current.editionSha256,pending:current.pending,transfers:current.transfers.map(t=>({sha256:t.sha256,from:t.result.fromRevision,to:t.result.toRevision}))}))));
  const selection={customer:id,expectedRevision:current.revision,expectedEditionSha256:current.editionSha256};
  content.append(panel('Deliver this customer edition',button('Retain complete Analysis source',()=>perform('customer-export',{...selection,artifact:'analysis-'+crypto.randomUUID()}),true),
   note('CSV with explicit value/null state columns, original source document and replayable receiving proof.'),
   button('Retain full customer backup',()=>perform('customer-backup',{...selection,artifact:'customer-backup-'+crypto.randomUUID()}))));
  content.append(panel('Map the registered Analysis source',form('Show original mapping','analysis-mapping',f=>{field(f,'source','Registered source alias');field(f,'revision','Registered source revision',{type:'number',value:'1'});},data=>({customer:id,source:data.get('source'),sourceRevision:Number(data.get('revision'))}))));
  content.append(await rowPanel('customer-rows',{customer:id}));
 }
 content.append(panel('Restore a complete customer edition',receiveForm('Restore selected customer','customer-restore','customer',id,await inputChoices(['customer-backup','analysis']))));
}
async function artifactDetail(id){
 const value=await api('artifact',{artifact:id});showResult(value);
 const block=panel(id,note(value.kind+' · '+value.files.length+' files · '+value.bytesTotal+' bytes'));
 block.append(table(['File','Bytes','SHA256','Download'],value.files.map(file=>{
  const url=new URL('./api/file',location.href);url.search=new URLSearchParams({artifact:id,path:file.path,sha256:file.sha256});const link=el('a','Download',{href:url.href,download:''});
  return [file.path,file.bytes,file.sha256,link];
 })));content.append(block);block.scrollIntoView({block:'start'});
}
async function artifacts(){
 content.replaceChildren(el('h1','Retained deliveries'),note('Each output contains its full declared file inventory and original manifest. Download every declared member to receive it on another machine.'));
 let offset=0;do{const page=await api('artifacts',{offset,limit:100});content.append(table(['ID','Kind','State','Selected edition','Open'],page.items.map(row=>[row.artifact,row.kind,row.state,row.selection.toRevision??row.selection.revision??row.selection.expectedRevision??'',button('Open files',()=>artifactDetail(row.artifact).catch(e=>message(e.message,true)))])));offset=page.nextOffset;}while(offset!==null);
}
function operation(){
 content.replaceChildren(el('h1','Original operation'),note('Run any native operator command with a retained JSON request. Request IDs, source aliases and edition selections use the same contracts as the command line and MCP provider.'));
 const f=el('form');field(f,'operation','Command',{options:status.operations.map(x=>[x,x]),value:'status'});field(f,'args','Request JSON',{type:'textarea',value:'{}'});f.append(el('button','Run selected request',{type:'submit',class:'primary'}));f.onsubmit=e=>{e.preventDefault();try{const data=new FormData(f),args=JSON.parse(data.get('args'));void perform(data.get('operation'),args);}catch(error){message(error.message,true);}};content.append(panel('Configured request',f));
}
async function render(){if(tab==='publishers')await publishers();else if(tab==='customers')await customers();else if(tab==='artifacts')await artifacts();else operation();}
async function refresh(){if(busy)return;setBusy(true);try{const response=await fetch('./api/status');status=await response.json();if(!response.ok)throw Error(status.message);$('connection').textContent=status.label;retryKey='odata-subscription-request:'+status.connectionSha256;retryView();await render();}catch(error){message(error.message,true);}finally{setBusy(false);}}
document.querySelectorAll('[data-tab]').forEach(node=>node.onclick=()=>{tab=node.dataset.tab;void render().catch(error=>message(error.message,true));});
$('refresh').onclick=refresh;void refresh();
