// MIT. Local, read-only recipient UI for complete original catalogue handovers.
import {openText,compareEditions,tableJsonl,materialCsv,TABLES,decodeBase64} from './core.mjs';
export function mount(document){
 const root=document.getElementById('app'),template='<!doctype html>\n'+document.documentElement.outerHTML;
 const state={bundle:null,tab:'overview',edition:null,before:null,after:null,query:'',page:0,table:'catalog_decisions',review:null,selected:null,error:null,busy:false};
 const tabs=[['overview','Overview'],['materials','Materials'],['compare','Compare editions'],['decisions','Customer decisions'],['supplier','Supplier records'],['sources','Original sources'],['records','All retained records']];
 const text=(tag,value,attrs={})=>{const el=document.createElement(tag);el.textContent=String(value??'');for(const [key,v] of Object.entries(attrs))el.setAttribute(key,String(v));return el;};
 const el=(tag,attrs={},...children)=>{const n=document.createElement(tag);for(const [key,value] of Object.entries(attrs)){if(key.startsWith('on'))n.addEventListener(key.slice(2),value);else n.setAttribute(key,String(value));}for(const c of children.flat())if(c!==null&&c!==undefined)n.append(typeof c==='string'?document.createTextNode(c):c);return n;};
 const button=(label,action,attrs={})=>el('button',{type:'button',onclick:action,...attrs},label);
 const moneyless=v=>v===null||v===undefined?'—':typeof v==='object'?JSON.stringify(v):String(v);
 const pretty=v=>JSON.stringify(v,null,2);
 const filename=v=>String(v??'source').replace(/[^A-Za-z0-9._-]/g,'_').slice(0,180)||'source';
 const section=(title,...content)=>el('section',{},text('h2',title),...content);
 const hint=s=>text('p',s,{class:'hint'});
 const selected=(title,value)=>{state.selected={title,value};render();};
 function download(name,body,type='application/octet-stream'){
  const url=URL.createObjectURL(new Blob([body],{type})),a=el('a',{href:url,download:filename(name)});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 function downloadJson(name,value){download(name,pretty(value)+'\n','application/json;charset=utf-8');}
 function choices(label,value,options,change){
  const s=el('select',{'aria-label':label,onchange:e=>change(e.target.value)});
  for(const [key,title] of options){const o=text('option',title,{value:key});if(key===value)o.selected=true;s.append(o);}
  return el('label',{},text('span',label),s);
 }
 const editionOptions=()=>[...state.bundle.editions.values()].map(e=>[e.id,(e.id===state.bundle.catalog.activeEditionId?'Current · ':'')+e.mode+' · '+e.createdAt+' · '+e.id.slice(0,12)]);
 function detailTable(headers,rows){
  return el('div',{class:'table-wrap',tabindex:'0','aria-label':'Scrollable records'},el('table',{},el('thead',{},el('tr',{},headers.map(h=>text('th',h,{scope:'col'})))),el('tbody',{},rows)));
 }
 const row=(cells,action)=>el('tr',{},cells.map((v,i)=>el('td',{},i===0&&action?button(String(v),action,{class:'link'}):typeof v==='object'&&v?.nodeType?v:String(v??'—'))));
 function pager(total){
  const pages=Math.max(1,Math.ceil(total/50));state.page=Math.min(state.page,pages-1);
  return el('div',{class:'toolbar'},text('span',total+' records · page '+(state.page+1)+' of '+pages),
   button('Previous',()=>{state.page--;render();},state.page===0?{disabled:''}:{}),
   button('Next',()=>{state.page++;render();},state.page+1>=pages?{disabled:''}:{}));
 }
 function search(label='Search retained records'){
  return el('form',{class:'toolbar',onsubmit:e=>{e.preventDefault();state.query=e.target.elements.query.value;state.page=0;render();}},
   el('label',{},text('span',label),el('input',{name:'query',type:'search',value:state.query,maxlength:'400'})),el('button',{type:'submit'},'Search'),
   button('Clear',()=>{state.query='';state.page=0;render();}));
 }
 const matches=v=>!state.query||JSON.stringify(v).toLocaleLowerCase('en-US').includes(state.query.toLocaleLowerCase('en-US'));
 function start(bundle){
  const editions=[...bundle.editions.keys()];
  Object.assign(state,{bundle,tab:'overview',edition:bundle.catalog.activeEditionId??editions.at(-1),before:editions[0],after:bundle.catalog.activeEditionId??editions.at(-1),query:'',page:0,selected:null,error:null,busy:false});
  render();
 }
 async function openFile(file){
  if(!file)return;
  state.busy=true;state.error=null;render();
  try{
   if(file.size>256*1024*1024)throw new Error('Choose a complete bundle of at most 256 MiB.');
   const bytes=new Uint8Array(await file.arrayBuffer()),source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
   // Give the progress status a paint before synchronous verification.
   await new Promise(resolve=>setTimeout(resolve,20));
   start(openText(source,{name:file.name}));
  }catch(error){state.busy=false;state.error=(error.code?error.code+': ':'')+error.message;render();}
 }
 function readerDownload(){
  const b=state.bundle,bytes=new TextEncoder().encode(b.text);let binary='';
  for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  const payload=JSON.stringify({name:b.name,base64:btoa(binary),sha256:b.identity.sha256}).replaceAll('<','\\u003c');
  const output=template.replace(/(<script id="catalog-payload" type="application\/json">)[\s\S]*?(<\/script>)/,(_all,start,end)=>start+payload+end);
  if(output===template&&!template.includes(payload))throw new Error('The complete reader template is unavailable.');
  download('Material_Catalog_'+filename(b.catalog.id)+'.html',output,'text/html;charset=utf-8');
 }
 function overview(){
  const b=state.bundle,s=b.summary;
  const items=[['Catalogue',s.title],['Tenant',s.tenantId],['Catalogue revision',s.revision],['Bundle exported',s.exportedAt],['Contained editions',b.editions.size],['Contained customer decisions',b.decisions.size],['Retained source bytes',s.sourceBytes.toLocaleString()],['Whole bundle bytes',s.bundleBytes.toLocaleString()],['Original bundle SHA-256',s.bundleSha256]];
  const dl=el('dl',{class:'facts'},items.flatMap(([k,v])=>[text('dt',k),text('dd',v)]));
  const controls=el('div',{class:'toolbar'},button('Download unchanged original bundle',()=>download(b.name,b.text,'application/x-ndjson;charset=utf-8')),
   button('Download inspection manifest',()=>downloadJson('catalog-inspection.json',s)),
   button('Download complete offline reader',readerDownload,document.documentElement.dataset.standalone==='true'?{}:{disabled:'',title:'Build the standalone reader first'}));
  return section('Complete recipient workspace',hint('This file opens the catalogue as it was exported. Customer decisions and supplier reviews are the retained original records; their recorded dates and revisions remain visible. Use the original operator to make changes.'),dl,controls,
   text('h3','Bundle inspection'),text('p',s.inspection),text('p',s.supplierInspection),
   text('h3','All retained tables'),detailTable(['Table','Records'],Object.entries(s.records).map(([key,count])=>row([key,count],()=>{state.table=key;state.tab='records';state.query='';state.page=0;render();}))));
 }
 function materials(){
  const b=state.bundle,list=[...(b.materials.get(state.edition)??new Map()).values()].filter(matches);
  const controls=el('div',{class:'toolbar'},choices('Retained edition',state.edition,editionOptions(),v=>{state.edition=v;state.page=0;render();}),
   button('Download complete edition CSV',()=>download('materials-'+state.edition+'.csv',materialCsv(b,state.edition),'text/csv;charset=utf-8')),
   button('Download complete edition records',()=>download('materials-'+state.edition+'.jsonl',b.tables.catalog_materials.filter(x=>x.edition_id===state.edition).map(x=>x.record_json+'\n').join(''),'application/x-ndjson;charset=utf-8')));
  const page=pager(list.length);
  return section('Materials',hint('Quantities, units and conversion fractions retain their original strings and numerator/denominator values. The CSV is a spreadsheet-safe projection; the original record download retains every field.'),controls,search('Search IDs, descriptions, attributes and units'),page,
   detailTable(['Material ID','Title','Unit','Original unit','Sales/base conversion','Record SHA-256'],list.slice(state.page*50,(state.page+1)*50).map(m=>row([m.materialId,m.title,m.unit,m.originalUnit,moneyless(m.salesToBase),m.sha256.slice(0,16)+'…'],()=>selected('Material '+m.materialId,m)))));
 }
 function comparison(){
  const b=state.bundle,comparison=compareEditions(b,state.before,state.after),list=comparison.rows.filter(matches);
  const page=pager(list.length);
  return section('Complete edition comparison',el('div',{class:'toolbar'},choices('Before',state.before,editionOptions(),v=>{state.before=v;state.page=0;render();}),choices('After',state.after,editionOptions(),v=>{state.after=v;state.page=0;render();}),button('Download full comparison',()=>downloadJson('catalog-edition-comparison.json',comparison))),
   text('p',Object.entries(comparison.counts).map(([k,v])=>v+' '+k).join(' · ')),search('Search comparison, changed fields and source values'),page,
   detailTable(['Material ID','Change','Changed fields','Before title','After title'],list.slice(state.page*50,(state.page+1)*50).map(c=>row([c.materialId,c.change,c.fields.join(', '),c.before?.title,c.after?.title],()=>selected('Comparison '+c.materialId,c)))));
 }
 function decisions(){
  const b=state.bundle,list=b.tables.catalog_decision_history.filter(x=>matches(x.record)).sort((a,b)=>a.record.id.localeCompare(b.record.id)||a.revision-b.revision),page=pager(list.length);
  return section('Customer decision history',hint('All revisions contained in this bundle are shown. A later operator revision belongs to a later export and is never inferred here.'),search('Search customer, description, status and note'),
   el('div',{class:'toolbar'},button('Download every original decision revision',()=>download('customer-decision-history.jsonl',tableJsonl(b,'catalog_decision_history'),'application/x-ndjson;charset=utf-8'))),page,
   detailTable(['Customer','Revision','Status','Material','Description','Updated'],list.slice(state.page*50,(state.page+1)*50).map(x=>{const d=x.record;return row([d.customerId,d.revision,d.status,d.materialId,d.description,d.updatedAt],()=>selected('Decision '+d.id+' · revision '+d.revision,d));})));
 }
 function supplierSummary(){
  const reviews=state.bundle.tables.catalog_supplier_reviews.map(x=>x.record).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  if(!reviews.length)return hint('This bundle has no saved supplier reviews.');
  if(!reviews.some(x=>x.id===state.review))state.review=reviews.at(-1).id;
  const review=reviews.find(x=>x.id===state.review),profile=review.plan?.profile??{};
  return el('article',{class:'source'},
   choices('Saved supplier review',state.review,reviews.map(x=>[x.id,x.createdAt+' · '+x.id]),value=>{state.review=value;render();}),
   text('p','Target '+moneyless(profile.target)+' · '+review.counts.total+' products · '+review.counts.readyProducts+' individually ready · '+review.counts.errors+' overall errors · '+review.counts.warnings+' warnings'),
   hint('Overall errors include saved global delivery findings. Individual product readiness does not establish that the complete supplier submission is ready to send.'),
   el('div',{class:'toolbar'},button('View complete supplier review',()=>selected('Supplier review '+review.id,review)),button('Download complete saved review',()=>downloadJson('supplier-review-'+review.id+'.json',review))),
   text('h3','Saved global findings'),
   ...(review.globalFindings?.length?[el('ul',{},review.globalFindings.map(f=>text('li',f.severity+' · '+f.code+' · '+f.path+' · '+f.message)))]:[hint('No global findings in this retained review.')]),
   review.recipient?text('p','Recipient '+review.recipient.target+' · previous review '+moneyless(review.recipient.previousReviewId)+' · saved effects '+JSON.stringify(review.recipient.counts)):null);
 }
 function records(supplierOnly=false){
  const b=state.bundle,options=Object.keys(TABLES).filter(k=>!supplierOnly||k.startsWith('catalog_supplier_'));
  if(!options.includes(state.table))state.table=options[0];
  const list=b.tables[state.table].filter(x=>matches(x.record)),page=pager(list.length),columns=TABLES[state.table].filter(k=>k!=='record_json');
  return section(supplierOnly?'Supplier plans, reviews and recipient records':'All retained original records',supplierOnly?hint('These are the complete retained supplier tables, including plan and correction histories and recipient before/after records. Profile evaluation continues in the original operator.'):hint('The original JSON record text is retained unchanged and can be downloaded for any table.'),
   supplierOnly?supplierSummary():null,
   choices('Original table',state.table,options.map(k=>[k,k+' · '+b.tables[k].length]),v=>{state.table=v;state.page=0;state.query='';render();}),
   search(),el('div',{class:'toolbar'},button('Download complete original table',()=>download(state.table+'.jsonl',tableJsonl(b,state.table),'application/x-ndjson;charset=utf-8'))),page,
   detailTable(columns,list.slice(state.page*50,(state.page+1)*50).map(x=>row(columns.map(k=>x[k]),()=>selected(state.table,x.record)))));
 }
 function sources(){
  const b=state.bundle,cards=[];
  for(const [sourceId,s] of b.sources){
   const m=s.manifest,controls=el('div',{class:'toolbar'},button('Download original bytes',()=>download(m.name||sourceId+'.bin',s.bytes)),button('View original manifest',()=>selected('Source manifest '+sourceId,m)));
   cards.push(el('article',{class:'source'},text('h3',m.name||sourceId),text('p',s.bytes.length.toLocaleString()+' bytes · '+m.sha256,{class:'mono'}),controls));
  }
  return section('Original source files',hint('These downloads are the exact original bytes in the complete bundle. They are verified against their source manifests before this workspace opens.'),...cards);
 }
 function render(){
  root.replaceChildren();
  const picker=el('input',{type:'file',accept:'.jsonl,.ndjson,application/x-ndjson','aria-label':'Open original catalogue bundle',onchange:e=>openFile(e.target.files[0])});
  if(state.busy)picker.disabled=true;
  root.append(el('header',{class:'mast'},el('div',{},text('p','STELLAR FORGE',{class:'eyebrow'}),text('h1','Material catalogue recipient')),el('label',{class:'picker'},text('span','Open a complete bundle'),picker)));
  if(state.error)root.append(text('p',state.error,{role:'alert',class:'error'}));
  if(state.busy)root.append(text('p','Reading and checking the complete original bundle…',{role:'status'}));
  if(!state.bundle){root.append(section('Open a catalogue handover',text('p','Choose the original material-catalog JSONL export. The complete catalogue, source files, customer history and supplier records remain on this device.'),hint('No account, connection or server is required for this standalone file. Keep the original bundle with the handover.')));return;}
  const b=state.bundle;
  root.append(el('div',{class:'summary'},text('strong',b.catalog.title),text('span','Revision '+b.catalog.revision+' · '+b.header.exportedAt),button('Close bundle',()=>{Object.assign(state,{bundle:null,selected:null,error:null});render();})));
  root.append(el('nav',{'aria-label':'Catalogue sections'},tabs.map(([key,label])=>button(label,()=>{state.tab=key;state.query='';state.page=0;state.selected=null;render();},{'aria-current':state.tab===key?'page':'false'}))));
  let content;
  try{content=state.tab==='overview'?overview():state.tab==='materials'?materials():state.tab==='compare'?comparison():state.tab==='decisions'?decisions():state.tab==='sources'?sources():records(state.tab==='supplier');}
  catch(error){content=section('Unable to display selection',text('p',error.message,{role:'alert'}));}
  root.append(el('main',{id:'content'},content));
  if(state.selected){
   const d=state.selected,panel=el('section',{class:'detail',tabindex:'-1','aria-label':'Selected record'},el('div',{class:'toolbar'},text('h2',d.title),button('Close detail',()=>{state.selected=null;render();}),button('Download record',()=>downloadJson(filename(d.title)+'.json',d.value))),text('pre',pretty(d.value)));
   root.append(panel);panel.focus({preventScroll:true});
  }
  root.append(text('footer','Original catalogue handover · Read-only recipient · All source and record downloads preserve their declared scope.'));
 }
 render();
 const payload=document.getElementById('catalog-payload');
 if(payload?.textContent.trim()){
  try{
   const p=JSON.parse(payload.textContent),bytes=decodeBase64(p.base64);
   const bundle=openText(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),{name:p.name});
   if(p.sha256&&bundle.identity.sha256!==p.sha256)throw new Error('The embedded original bundle differs from the reader manifest.');
   start(bundle);
  }catch(error){state.error=error.message;render();}
 }
 return {openFile,getSummary:()=>state.bundle?.summary??null};
}
