// MIT. Complete humanitarian operator, retained requests and original history receiving.
'use strict';
const $=id=>document.getElementById(id), by=selector=>[...document.querySelectorAll(selector)];
const LIMIT=1024*1024, SOURCE_LIMIT=100*1024*1024, ARCHIVE_LIMIT=2*1024*1024*1024;
const KINDS=['reference','mapping','alias','review'];
const RESERVED=['source_row','edition_id','period','reference_id','row_status','admin_code','admin_name','admin_level','admin_parent',...Array.from({length:6},(_,i)=>['adm'+i+'_code','adm'+i+'_name']).flat()];
const state={db:null,key:null,local:null,saved:null,launch:null,review:null,report:null,rows:null,busy:false,outputPage:0,rowsOffset:0,comparisonOffset:0,outputRows:null,comparisonRows:null};
let token=location.hash.slice(1);
if(!/^[A-Za-z0-9_-]{43}$/.test(token))token=sessionStorage.getItem('humanitarian-console-token')||'';
if(/^[A-Za-z0-9_-]{43}$/.test(token)){sessionStorage.setItem('humanitarian-console-token',token);history.replaceState(null,'',location.pathname);}
function element(tag,text,attrs={}){const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,String(v));return node;}
function show(text,error=false){$('message').textContent=String(text);$('message').classList.toggle('error',error);}
function json(value){return JSON.stringify(value,null,2)+'\n';}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function same(a,b){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));}
function parse(text){if(new TextEncoder().encode(text).byteLength>LIMIT)throw Error('Complete input exceeds 1 MiB');const value=JSON.parse(text);const check=(x,depth=0)=>{if(depth>128)throw Error('Input nesting is too deep');if(typeof x==='number'&&!Number.isFinite(x))throw Error('Use finite numbers or exact decimal strings');if(x&&typeof x==='object')for(const v of Object.values(x))check(v,depth+1);};check(value);return value;}
function object(text){const value=parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Use a complete JSON input object');return value;}
function short(value,max=8000,required=false){if(typeof value!=='string'||Array.from(value).length>max||value.includes('\0')||required&&!value.trim())throw Error('Complete the bounded required text field');return value;}
function integer(value,label,minimum=0,maximum=Number.MAX_SAFE_INTEGER){if(typeof value==='string'&&!/^(0|[1-9]\d*)$/.test(value))throw Error(label+' must be a whole number');const n=Number(value);if(!Number.isSafeInteger(n)||n<minimum||n>maximum)throw Error(label+' is outside its supported range');return n;}
function nullable(value){return value===''?null:value;}
function list(text){return text.trim()?text.split(',').map(x=>x.trim()).filter(Boolean):[];}
function headers(text){return text.replace(/\r\n/g,'\n').split('\n');}
function identifier(value,label='Identifier'){if(typeof value!=='string'||!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(value))throw Error(label+' must start with a letter and contain at most 80 letters, digits, underscores, dots or hyphens');return value;}
function uuid(){return 'request-'+crypto.randomUUID();}
function rawPlan(plan){
  if(!plan||typeof plan!=='object')throw Error('Select the complete original table plan');
  if(!('selectors' in plan))return structuredClone(plan);
  if(!Array.isArray(plan.selectors)||!Array.isArray(plan.columns)||plan.columns.length!==plan.selectors.length+1)throw Error('The saved original table plan is incomplete');
  const keys=['schema','name','table','headerRow','hxlRow','expectedHeaders','filters','ranges','sorts','maxRows','maxBytes','maxCellChars','defaultLimit','maxLimit','allowEmpty'];
  const result=Object.fromEntries(keys.filter(k=>k in plan).map(k=>[k,structuredClone(plan[k])]));
  result.columns=plan.selectors.map((item,i)=>{const native=plan.columns[i+1];if(native.name!==item.name)throw Error('The saved column selector changed');return {...Object.fromEntries(['name','index','label','type','hxl','unit'].map(k=>[k,item[k]])),nullable:native.nullable,trim:native.trim};});
  return result;
}
class StreamingSha256{
  constructor(){this.h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);this.buffer=new Uint8Array(64);this.words=new Uint32Array(64);this.used=0;this.bytes=0n;this.done=false;}
  update(bytes){if(this.done)throw Error('The original digest is already complete');this.bytes+=BigInt(bytes.length);let at=0;while(at<bytes.length){const count=Math.min(64-this.used,bytes.length-at);this.buffer.set(bytes.subarray(at,at+count),this.used);this.used+=count;at+=count;if(this.used===64){this.block(this.buffer);this.used=0;}}return this;}
  block(bytes){const w=this.words,h=this.h,k=StreamingSha256.K,rotate=(x,n)=>(x>>>n)|(x<<(32-n));for(let i=0;i<16;i++)w[i]=(bytes[i*4]<<24)|(bytes[i*4+1]<<16)|(bytes[i*4+2]<<8)|bytes[i*4+3];for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2],s0=rotate(x,7)^rotate(x,18)^(x>>>3),s1=rotate(y,17)^rotate(y,19)^(y>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;}let[a,b,c,d,e,f,g,j]=h;for(let i=0;i<64;i++){const s1=rotate(e,6)^rotate(e,11)^rotate(e,25),choice=(e&f)^((~e)&g),t1=(j+s1+choice+k[i]+w[i])>>>0,s0=rotate(a,2)^rotate(a,13)^rotate(a,22),majority=(a&b)^(a&c)^(b&c),t2=(s0+majority)>>>0;j=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}const result=[a,b,c,d,e,f,g,j];for(let i=0;i<8;i++)h[i]=(h[i]+result[i])>>>0;}
  finish(){const length=this.bytes*8n,padding=new Uint8Array(this.used<56?64-this.used:128-this.used);padding[0]=128;for(let i=0;i<8;i++)padding[padding.length-1-i]=Number((length>>BigInt(i*8))&255n);this.update(padding);this.done=true;return [...this.h].map(x=>x.toString(16).padStart(8,'0')).join('');}
}
StreamingSha256.K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
async function sha(blob){const hash=new StreamingSha256();if(blob instanceof Blob){const reader=blob.stream().getReader();try{for(;;){const part=await reader.read();if(part.done)break;hash.update(part.value);}}finally{reader.releaseLock();}}else hash.update(new TextEncoder().encode(blob));return hash.finish();}
function download(blob,name){const url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function downloadJSON(value,name){download(new Blob([json(value)],{type:'application/json'}),name);}
async function api(path,options={}){const response=await fetch(path,{...options,redirect:'error',headers:{authorization:'Bearer '+token,...options.headers}});if(!response.ok){const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={error:text};}const error=Error(data.error||('HTTP '+response.status));error.status=response.status;error.body=data;throw error;}return response;}
async function get(path,params={}){const url=new URL(path,location.origin);for(const[k,v]of Object.entries(params))if(v!==undefined&&v!==null)url.searchParams.set(k,String(v));return(await api(url.pathname+url.search)).json();}
function route(kind){return '/api/humanitarian/'+kind;}
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('stellar-forge-humanitarian-review',1);req.onupgradeneeded=()=>{req.result.createObjectStore('workspaces');req.result.createObjectStore('operations');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function read(store,key){return new Promise((resolve,reject)=>{const tx=state.db.transaction(store,'readonly'),q=tx.objectStore(store).get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
function write(records){return new Promise((resolve,reject)=>{const tx=state.db.transaction([...new Set(records.map(x=>x.store))],'readwrite');for(const row of records)tx.objectStore(row.store).put(row.value,row.key);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('Complete browser state could not be retained'));tx.onerror=()=>{};});}
function draftRecord(snapshot){return new Promise((resolve,reject)=>{const tx=state.db.transaction('workspaces','readwrite'),store=tx.objectStore('workspaces'),q=store.get(state.key);let pending=null;q.onsuccess=()=>{pending=q.result?.pending||null;store.put({...snapshot,pending},state.key);};tx.oncomplete=()=>resolve(pending);tx.onabort=()=>reject(tx.error||Error('The edited draft could not be retained'));tx.onerror=()=>{};});}
function rawFields(container){return Object.fromEntries([...container.querySelectorAll('[data-field]')].filter(n=>n.closest('[data-row]')===container).map(n=>[n.dataset.field,n.type==='checkbox'?n.checked:n.value]));}
function tableRows(id){return [...$(id).children].map(rawFields);}
function outputRows(){return [...$('mapping-outputs').children].map(card=>({id:card.querySelector('[data-output=id]').value,title:card.querySelector('[data-output=title]').value,groupBy:card.querySelector('[data-output=groupBy]').value,measures:[...card.querySelector('[data-table=measures]').children].map(rawFields),columns:[...card.querySelector('[data-table=columns]').children].map(rawFields),where:[...card.querySelector('[data-table=where]').children].map(rawFields)}));}
function editionRows(){return [...$('review-editions').children].map(card=>Object.fromEntries([...card.querySelectorAll('[data-edition]')].map(n=>[n.dataset.edition,n.value])));}
function capture(){if(!state.local)return null;for(const node of by('main input[id],main select[id],main textarea[id]'))if(node.type!=='file')state.local.fields[node.id]=node.type==='checkbox'?node.checked:node.value;state.local.levels=tableRows('reference-levels');state.local.columns=tableRows('mapping-columns');state.local.outputs=outputRows();state.local.editions=editionRows();state.local.aliasIds=by('#review-aliases input:checked').map(n=>n.value);return structuredClone(state.local);}
let retaining=Promise.resolve();
function retain(){if(!state.local)return Promise.resolve();const snapshot=capture();retaining=retaining.catch(()=>{}).then(async()=>{const pending=await draftRecord(snapshot);state.local.pending=pending;});return retaining;}
function options(select,items,label,blank=null,selected=undefined){const previous=selected===undefined?select.value:selected;select.replaceChildren();if(blank!==null)select.append(element('option',blank,{value:''}));for(const item of items)select.append(element('option',label(item),{value:item.id}));if([...select.options].some(o=>o.value===previous))select.value=previous;}
function choose(id,items,label,blank=null){options($(id),items,label,blank,state.local.fields[id]??$(id).value);}
function input(value='',attrs={}){const node=element('input',undefined,attrs);if(node.type==='checkbox')node.checked=Boolean(value);else node.value=value??'';return node;}
function select(value,choices,attrs={}){const node=element('select',undefined,attrs);for(const item of choices){const [v,label]=Array.isArray(item)?item:[item,item];node.append(element('option',label,{value:v}));}node.value=value??'';return node;}
function cell(row,node){const td=element('td');td.append(node);row.append(td);return node;}
function removeButton(node){const b=element('button','Remove',{type:'button'});b.addEventListener('click',()=>{node.remove();retain().catch(e=>show(e.message,true));});return b;}
function levelRow(value={}){const row=element('tr',undefined,{'data-row':'level'});cell(row,input(value.level??$('reference-levels').children.length,{type:'number',min:0,max:5,'data-field':'level'}));for(const name of ['code','name']){const box=element('div',undefined,{class:'selector-pair'});box.append(select(value[name+'Mode']||'index',['index','constant'],{'data-field':name+'Mode'}),input(value[name+'Value']??'',{'data-field':name+'Value','aria-label':name+' column or constant'}));cell(row,box);}cell(row,input(value.aliases||'',{'data-field':'aliases','aria-label':'Alias column indices'}));cell(row,input(value.geometry??'',{type:'number',min:0,'data-field':'geometry','aria-label':'Geometry column index'}));cell(row,removeButton(row));$('reference-levels').append(row);}
function columnRow(value={}){const row=element('tr',undefined,{'data-row':'column'});for(const [name,label]of [['name','Field ID'],['index','Original column index'],['label','Label']])cell(row,input(value[name]??'',{'data-field':name,'aria-label':label,...(name==='index'?{type:'number',min:0}:{})}));cell(row,select(value.type||'string',['string','integer','number','boolean','decimal'],{'data-field':'type','aria-label':'Semantic type'}));for(const name of ['nullable','trim'])cell(row,input(value[name]??true,{type:'checkbox','data-field':name,'aria-label':name}));for(const name of ['hxl','unit'])cell(row,input(value[name]??'',{'data-field':name,'aria-label':name}));cell(row,removeButton(row));$('mapping-columns').append(row);}
function definitionTable(card,kind,headings){const wrap=element('div',undefined,{class:'table-wrap'}),table=element('table'),head=element('thead'),tr=element('tr'),body=element('tbody',undefined,{'data-table':kind});for(const heading of headings)tr.append(element('th',heading));head.append(tr);table.append(head,body);wrap.append(table);card.append(wrap);return body;}
function simpleRow(body,kind,value={}){const row=element('tr',undefined,{'data-row':kind});let fields;if(kind==='measures')fields=['name','op','field','label','hxl'];else if(kind==='columns')fields=['field','label','hxl'];else fields=['field','type','equals'];for(const name of fields){let node;if(name==='op')node=select(value.op||'count',['sum','count','count-distinct','min','max'],{'data-field':name,'aria-label':name});else if(kind==='where'&&name==='type')node=select(value.type||'string',['string','number','boolean','null'],{'data-field':name,'aria-label':'Scalar type'});else node=input(value[name]??'',{'data-field':name,'aria-label':name,...(name==='field'?{list:'available-fields'}:{})});cell(row,node);}cell(row,removeButton(row));body.append(row);}
function outputCard(value={}){const card=element('section',undefined,{class:'output-card'}),top=element('div',undefined,{class:'columns'});for(const[key,label]of [['id','Layout ID'],['title','Layout title'],['groupBy','Group fields (comma-separated; optional)']]){const box=element('label',label),n=input(value[key]??'',{'data-output':key});box.append(n);top.append(box);}card.append(top);for(const[kind,title,heads]of [['measures','Measures',['Name','Operation','Field','Label','HXL','']],['columns','Output columns',['Field or measure','Label','HXL','']],['where','Row filters',['Field','Scalar type','Equals','']]]){card.append(element('h4',title));const body=definitionTable(card,kind,heads);for(const row of value[kind]||[])simpleRow(body,kind,row);const button=element('button','Add '+(kind==='where'?'filter':kind.slice(0,-1)),{type:'button'});button.addEventListener('click',()=>{simpleRow(body,kind);retain().catch(e=>show(e.message,true));});const actions=element('div',undefined,{class:'actions'});actions.append(button);card.append(actions);}card.append(removeButton(card));$('mapping-outputs').append(card);}
function editionCard(value={}){const card=element('section',undefined,{class:'edition-card'}),grid=element('div',undefined,{class:'columns'});for(const[key,label]of [['source','Original source'],['mapping','Saved mapping'],['label','Edition label'],['period','Reporting period']]){const box=element('label',label);let node;if(key==='source'||key==='mapping'){node=element('select',undefined,{'data-edition':key});options(node,state.saved?.[key==='source'?'sources':'mappings']||[],v=>key==='source'?v.label+' · '+v.name:v.name,'Select '+key,value[key]||'');}else node=input(value[key]||'',{'data-edition':key});box.append(node);grid.append(box);}card.append(grid,removeButton(card));$('review-editions').append(card);}
function renderFields(){for(const[id,value]of Object.entries(state.local.fields)){const node=$(id);if(!node||node.type==='file')continue;if(node.type==='checkbox')node.checked=Boolean(value);else if(node.tagName!=='SELECT'||[...node.options].some(x=>x.value===String(value)))node.value=value;}}
function renderDynamic(){for(const id of ['reference-levels','mapping-columns','mapping-outputs','review-editions'])$(id).replaceChildren();for(const value of state.local.levels)levelRow(value);for(const value of state.local.columns)columnRow(value);for(const value of state.local.outputs)outputCard(value);for(const value of state.local.editions)editionCard(value);renderAliases();updateFieldChoices();}
function renderAliases(){const selected=new Set(state.local.aliasIds);$('review-aliases').replaceChildren();$('alias-list').replaceChildren();for(const item of state.saved?.aliases||[]){const label=element('label'),check=input(selected.has(item.id),{type:'checkbox',value:item.id});label.append(check,document.createTextNode(item.value+' → '+item.code+' · '+item.reviewer),element('small',item.id));$('review-aliases').append(label);const detail=element('details');detail.append(element('summary',item.value+' → '+item.code+' · level '+item.level),element('pre',json(item),{class:'details'}));$('alias-list').append(detail);}for(const missing of [...selected].filter(id=>!state.saved.aliases.some(a=>a.id===id))){const label=element('label');label.append(input(true,{type:'checkbox',value:missing}),document.createTextNode('Selected retained alias '+missing));$('review-aliases').append(label);}}
function updateFieldChoices(){const names=new Set([...tableRows('mapping-columns').map(x=>x.name).filter(Boolean),...RESERVED]);$('available-fields').replaceChildren(...[...names].map(name=>element('option',undefined,{value:name})));}
async function refresh(){state.saved=await get(route('state'));for(const[id,key,label]of [['source-selected','sources',x=>x.label+' · '+x.name],['reference-source','sources',x=>x.label+' · '+x.name],['mapping-source','sources',x=>x.label+' · '+x.name],['reference-existing','references',x=>x.name],['mapping-reference','references',x=>x.name],['alias-reference','references',x=>x.name],['mapping-existing','mappings',x=>x.name],['review-existing','reviews',x=>x.name+' · revision '+x.revision]])choose(id,state.saved[key]||[],label,id.endsWith('-existing')?'Select saved record':null);renderDynamic();renderFields();$('connection').textContent='Original workspace open';$('workspace-identity').textContent=state.launch.workspace;renderSelection();await pendingUI();}

function selector(mode,value,label){return mode==='constant'?{constant:short(value,8000,true)}:{index:integer(value,label)};}
function definition(kind){capture();const fields=state.local.fields,base={...(state.local.bases[kind]||{})};delete base.requestId;delete base.id;delete base.expectedRevision;
  if(kind==='reference'){
    return {...base,name:short(fields['reference-name'],160,true),source:fields['reference-source'],table:short(fields['reference-table'],128,true),headerRow:integer(fields['reference-header'],'Header row',1),hxlRow:fields['reference-hxl']===''?null:integer(fields['reference-hxl'],'HXL row',1),expectedHeaders:headers(fields['reference-headers']),
      levels:state.local.levels.map(row=>({level:integer(row.level,'Administrative level',0,5),code:selector(row.codeMode,row.codeValue,'Code column'),name:selector(row.nameMode,row.nameValue,'Name column'),aliases:list(row.aliases).map(value=>({index:integer(value,'Alias column')})),...(row.geometry===''?{}:{geometry:{index:integer(row.geometry,'Geometry column')}})})),
      provenance:{publisher:short(fields['reference-publisher'],1000,true),title:short(fields['reference-title'],1000,true),url:short(fields['reference-url'],4000,true),edition:short(fields['reference-edition'],1000,true),retrievedAt:short(fields['reference-retrieved'],100,true),license:nullable(fields['reference-license'])}};
  }
  if(kind==='mapping'){
    const columns=state.local.columns.map(row=>({name:short(row.name,160,true),index:integer(row.index,'Original column index'),label:short(row.label,160,true),type:row.type,nullable:Boolean(row.nullable),trim:Boolean(row.trim),hxl:row.hxl,unit:short(row.unit,100)}));
    if(columns.some(row=>!['string','integer','number','boolean','decimal'].includes(row.type)))throw Error('Select an original supported column type');
    const outputs=state.local.outputs.map(item=>({id:short(item.id,160,true),title:short(item.title,160,true),groupBy:list(item.groupBy),
      measures:item.measures.map(row=>({name:short(row.name,160,true),op:row.op,field:nullable(row.field),label:short(row.label,160,true),hxl:nullable(row.hxl)})),
      columns:item.columns.map(row=>({field:short(row.field,160,true),label:short(row.label,160,true),hxl:nullable(row.hxl)})),
      where:item.where.map(row=>{let equals;if(row.type==='null')equals=null;else if(row.type==='string')equals=row.equals;else{equals=parse(row.equals);if(typeof equals!==row.type||row.type==='number'&&!Number.isFinite(equals))throw Error('The filter must contain its selected scalar type');}return {field:short(row.field,160,true),equals};})}));
    return {...base,name:short(fields['mapping-name'],160,true),reference:fields['mapping-reference'],
      plan:{...(base.plan?rawPlan(base.plan):{}),schema:'stellar-forge.humanitarian-table-plan.v1',name:short(fields['mapping-plan-name'],160,true),table:short(fields['mapping-table'],128,true),headerRow:integer(fields['mapping-header'],'Header row',1),hxlRow:fields['mapping-hxl']===''?null:integer(fields['mapping-hxl'],'HXL row',1),expectedHeaders:headers(fields['mapping-headers']),columns},
      admin:{level:integer(fields['mapping-admin-level'],'Administrative level',0,5),codeField:nullable(fields['mapping-admin-code']),nameField:nullable(fields['mapping-admin-name']),scopeCodeField:nullable(fields['mapping-admin-scope'])},
      keyFields:list(fields['mapping-keys']),outputs};
  }
  if(kind==='alias')return {...base,reference:fields['alias-reference'],level:integer(fields['alias-level'],'Administrative level',0,5),match:fields['alias-match'],value:short(fields['alias-value'],8000,true),scopeCode:nullable(fields['alias-scope']),code:short(fields['alias-code'],1000,true),reviewer:short(fields['alias-reviewer'],160,true),reason:short(fields['alias-reason'],8000,true)};
  if(kind==='review'){
    if(state.local.editions.length<1||state.local.editions.length>2)throw Error('Choose one edition or two comparison editions');
    const value={...base,id:identifier(fields['review-id'],'Review ID'),expectedRevision:0,name:short(fields['review-name'],160,true),editions:state.local.editions.map(item=>({source:item.source,mapping:item.mapping,label:short(item.label,160,true),period:short(item.period,160)})),aliases:[...state.local.aliasIds],reviewer:short(fields['review-reviewer'],160,true),notes:short(fields['review-notes'],12000),rowPolicy:fields['review-policy']};
    if(state.local.reviewSelection){if(value.id!==state.local.reviewSelection.id)throw Error('Select New review before choosing a different review ID');value.expectedRevision=state.local.reviewSelection.revision;}
    return value;
  }
  throw Error('Select an original definition kind');
}
function newInput(kind){const value={requestId:uuid(),...definition(kind)};if(new Blob([json(value)]).size>LIMIT)throw Error('Complete request exceeds 1 MiB');return value;}
function loadDefinition(kind,raw,{selection=null}={}){
  const value=structuredClone(raw),f=state.local.fields;
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose a complete original definition');
  if(kind==='reference'){
    if(value.expectedHeaders.some(v=>typeof v!=='string'||/[\r\n]/.test(v)))throw Error('Use Save this exact input for headers containing line breaks');
    const levels=value.levels.map(item=>{for(const selected of [item.code,item.name])if(selected.index===undefined&&typeof selected.constant!=='string')throw Error('Use the complete input editor for this constant selector');if((item.aliases||[]).some(a=>a.index===undefined)||item.geometry&&item.geometry.index===undefined)throw Error('Use the complete input editor for constant alias or geometry selectors');return {level:String(item.level),codeMode:item.code.index===undefined?'constant':'index',codeValue:String(item.code.index??item.code.constant),nameMode:item.name.index===undefined?'constant':'index',nameValue:String(item.name.index??item.name.constant),aliases:(item.aliases||[]).map(a=>a.index).join(', '),geometry:item.geometry?.index===undefined?'':String(item.geometry.index)};});
    Object.assign(f,{'reference-name':value.name,'reference-source':value.source,'reference-table':value.table,'reference-header':String(value.headerRow),'reference-hxl':value.hxlRow===null?'':String(value.hxlRow),'reference-headers':value.expectedHeaders.join('\n')});
    for(const[key,id]of [['publisher','publisher'],['title','title'],['url','url'],['edition','edition'],['retrievedAt','retrieved'],['license','license']])f['reference-'+id]=value.provenance[key]??'';
    state.local.levels=levels;
  }else if(kind==='mapping'){
    const p=rawPlan(value.plan);value.plan=p;
    if(p.expectedHeaders.some(v=>typeof v!=='string'||/[\r\n]/.test(v)))throw Error('Use Save this exact input for headers containing line breaks');
    Object.assign(f,{'mapping-name':value.name,'mapping-reference':value.reference,'mapping-plan-name':p.name,'mapping-table':p.table,'mapping-header':String(p.headerRow),'mapping-hxl':p.hxlRow===null?'':String(p.hxlRow),'mapping-headers':p.expectedHeaders.join('\n'),'mapping-admin-level':String(value.admin.level),'mapping-admin-code':value.admin.codeField??'','mapping-admin-name':value.admin.nameField??'','mapping-admin-scope':value.admin.scopeCodeField??'','mapping-keys':value.keyFields.join(', ')});
    state.local.columns=p.columns.map(c=>({...c,index:String(c.index),hxl:c.hxl??'',unit:c.unit??''}));
    state.local.outputs=value.outputs.map(o=>({id:o.id,title:o.title,groupBy:(o.groupBy||[]).join(', '),measures:(o.measures||[]).map(m=>({...m,field:m.field??'',hxl:m.hxl??''})),columns:o.columns.map(c=>({...c,hxl:c.hxl??''})),where:(o.where||[]).map(w=>({field:w.field,type:w.equals===null?'null':typeof w.equals,equals:typeof w.equals==='string'?w.equals:JSON.stringify(w.equals)}))}));
  }else if(kind==='alias'){
    for(const[key,id]of [['reference','reference'],['level','level'],['match','match'],['value','value'],['scopeCode','scope'],['code','code'],['reviewer','reviewer'],['reason','reason']])f['alias-'+id]=value[key]===null?'':String(value[key]);
  }else if(kind==='review'){
    Object.assign(f,{'review-id':value.id,'review-name':value.name,'review-reviewer':value.reviewer,'review-notes':value.notes,'review-policy':value.rowPolicy});
    state.local.editions=value.editions.map(e=>({source:e.source,mapping:e.mapping,label:e.label,period:e.period}));
    state.local.aliasIds=[...value.aliases];
    state.local.reviewSelection=selection||((value.id&&value.expectedRevision)?{id:value.id,revision:value.expectedRevision}:null);
  }
  state.local.bases[kind]=value;renderDynamic();renderFields();renderSelection();
}
function renderSelection(){$('review-id').readOnly=Boolean(state.local.reviewSelection);const selected=state.local.reviewSelection,label=selected?'Selected review '+selected.id+' · revision '+selected.revision:'New review';$('review-selection').textContent=label;$('results-selection').textContent=state.review?state.review.name+' · revision '+state.review.revision+' · '+state.review.status:'Open a saved review revision to inspect its complete results.';$('transfer-selection').textContent=state.review?state.review.name+' · revision '+state.review.revision:'Open a saved review revision first.';$('open-received').hidden=!state.local.received;}
async function inspectSource(){const id=$('source-selected').value;if(!id)throw Error('Select a saved original source');const result=await get('/api/source',{id});$('source-detail').textContent=json(result);$('source-summary').textContent=json({id:result.id,label:result.label,name:result.name,bytes:result.bytes,format:result.inventory.format});$('source-summary').hidden=false;$('source-tables').replaceChildren();for(const table of result.inventory.tables){const box=element('section');box.append(element('h3',table.name+' · '+table.physicalRows+' physical rows · '+table.columns+' columns'));const wrap=element('div',undefined,{class:'table-wrap'}),grid=element('table'),body=element('tbody');for(const row of table.preview){const line=element('tr');line.append(element('th','Row '+row.row));for(const value of row.cells)line.append(element('td',value));body.append(line);}grid.append(body);wrap.append(grid);box.append(wrap);$('source-tables').append(box);}show('Original source inventory loaded. Preview bounds are shown explicitly.');}
async function loadHeader(kind){
  const source=$(kind+'-source').value,table=$(kind+'-table').value,row=integer($(kind+'-header').value,'Header row',1);
  if(!source)throw Error('Select the complete original source');
  const result=await get(route('source-table'),{source,table,offset:row-1,limit:1});
  if(result.source!==source||result.table!==table||result.rows.length!==1||result.rows[0].row!==row||!Array.isArray(result.rows[0].cells))throw Error('The selected original header row is absent');
  const cells=result.rows[0].cells;
  if(cells.some(v=>typeof v!=='string'))throw Error('The complete source header did not return original text cells');
  if(cells.some(v=>/[\r\n]/.test(v))){const current=$(kind+'-json').value.trim()?object($(kind+'-json').value):{};if(kind==='mapping'){current.plan={...(current.plan||{}),expectedHeaders:cells};}else current.expectedHeaders=cells;$(kind+'-json').value=json(current);throw Error('The complete header contains line breaks and is retained in the input editor. Complete that input and select Save this exact input.');}
  $(kind+'-headers').value=cells.join('\n');state.local.headerReceipts[kind]={source,table,row,result};await retain();show('Loaded all '+cells.length+' complete header cells from original physical row '+row+'.');
}
async function columnDefaults(){const values=headers($('mapping-headers').value),seen=new Set();if(values.length>63)throw Error('Select up to 63 original column positions using Add column or the complete input editor; all header cells stay retained');state.local.columns=values.map((label,index)=>{let name=label.trim().toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'');if(!/^[a-z]/.test(name))name='column_'+(index+1)+(name?'_'+name:'');name=name.slice(0,60);const base=name;let count=2;while(seen.has(name))name=base+'_'+count++;seen.add(name);return {name,index:String(index),label:label||'Column '+(index+1),type:'string',nullable:true,trim:false,hxl:'',unit:''};});$('mapping-columns').replaceChildren();for(const row of state.local.columns)columnRow(row);updateFieldChoices();await retain();show('Prepared '+values.length+' string columns. Review their types, nullability and labels before saving.');}
async function exclusive(callback){if(!navigator.locks)throw Error('Use a browser with Web Locks or the original CLI to preserve one request owner');return navigator.locks.request('humanitarian-operation:'+state.key,{ifAvailable:true},async lock=>{if(!lock)throw Error('Another tab is continuing this workspace operation');return callback();});}
async function startOperation(kind,path,body,{blob=null,headers:requestHeaders={},name=null}={}){
  await retain();
  return exclusive(async()=>{
    const saved=await read('workspaces',state.key);if(saved.pending)throw Error('Continue or reconcile the retained operation before starting another');
    if(body!==null&&KINDS.includes(kind))identifier(body.requestId,'Original request ID');
    const id=body?.requestId||uuid(),bytes=blob||new Blob([json(body)],{type:'application/json'});
    if(!blob&&bytes.size>LIMIT)throw Error('Complete request exceeds 1 MiB');
    const digest=await sha(bytes);
    const candidate={schema:'stellar-forge.humanitarian-browser-operation.v1',id,workspace:state.key,kind,route:path,body,headers:requestHeaders,inputSha256:digest,...(blob?{blob,name,bytes:blob.size,sha256:digest}:{}),status:'PREPARED',created:new Date().toISOString()};
    const previous=await read('operations',state.key+':'+id);
    if(previous&&(!same(previous.body,body)||previous.kind!==kind||previous.route!==path||previous.inputSha256!==digest||!same(previous.headers,requestHeaders)))throw Error('This original request identifier already belongs to different retained input');
    const operation=previous||candidate;state.local.pending=id;
    await write([{store:'operations',key:state.key+':'+id,value:operation},{store:'workspaces',key:state.key,value:capture()}]);
    return dispatch(operation);
  });
}
async function dispatch(selected){
  if(selected.workspace!==state.key||selected.schema!=='stellar-forge.humanitarian-browser-operation.v1')throw Error('The retained operation belongs to another original workspace');
  const blob=selected.blob||new Blob([json(selected.body)],{type:'application/json'});
  if(await sha(blob)!==selected.inputSha256||selected.blob&&(blob.size!==selected.bytes||selected.sha256!==selected.inputSha256))throw Error('The retained complete input bytes changed');
  if(selected.status==='CLOSED_REJECTED')throw Error('This rejected input was explicitly closed; create a new request from the edited controls');
  if(selected.status==='COMPLETE')return finishOperation(selected);
  let operation={...selected,status:'INVOKING'},result;
  await write([{store:'operations',key:state.key+':'+operation.id,value:operation}]);await pendingUI();
  try{
    if(operation.body?.requestId){
      try{const original=await get(route('request'),{id:operation.body.requestId});if(original.kind!==operation.kind||original.state!=='completed'||!same(original.input,operation.body))throw Error('The original saved request differs from the retained complete input');result=original.result;}
      catch(error){if(error.status!==404||error.body?.requestNotFound!==true)throw error;}
    }
    if(result===undefined)result=await(await api(operation.route,{method:'POST',headers:{'content-type':operation.blob?'application/octet-stream':'application/json',...operation.headers},body:blob})).json();
    if(operation.body?.requestId){const original=await get(route('request'),{id:operation.body.requestId});if(original.kind!==operation.kind||original.state!=='completed'||!same(original.input,operation.body)||!same(original.result,result))throw Error('The original saved request and complete returned result differ');}
    operation={...operation,status:'COMPLETE',result,completed:new Date().toISOString()};
    await write([{store:'operations',key:state.key+':'+operation.id,value:operation}]);
  }catch(error){operation={...operation,status:error.status===400?'REJECTED':'RETURN_UNCERTAIN',failure:{message:String(error.message),httpStatus:error.status||null,observedAt:new Date().toISOString()}};await write([{store:'operations',key:state.key+':'+operation.id,value:operation}]);await pendingUI();throw error;}
  return finishOperation(operation);
}
async function finishOperation(operation){
  const saved=await read('workspaces',state.key);if(saved.pending&&saved.pending!==operation.id)throw Error('The original pending operation changed');
  state.local.lastOperation=operation.id;
  if(KINDS.includes(operation.kind)){$(operation.kind+'-result').hidden=false;$(operation.kind+'-result').textContent=json(operation.result);}
  if(operation.kind==='review')await selectReview(operation.result);
  if(operation.kind==='receive'){const selected=operation.result.review;if(!selected?.id||!Number.isSafeInteger(selected.revision))throw Error('The original receiver returned no selected saved review');state.local.received={id:selected.id,revision:selected.revision};$('receive-result').hidden=false;$('receive-result').textContent=json(operation.result);}
  state.local.pending=null;
  await write([{store:'workspaces',key:state.key,value:capture()}]);await refresh();
  show('Original '+operation.kind+' completed. Its complete input and returned result remain retained.');return operation.result;
}
async function pendingUI(){const current=await read('workspaces',state.key);state.local.pending=current?.pending||null;$('pending').hidden=!state.local.pending;if(!state.local.pending)return;const operation=await read('operations',state.key+':'+state.local.pending);if(!operation)throw Error('The original pending input is missing from browser storage');$('pending-text').textContent=operation.kind+' · '+operation.id+' · '+operation.status+(operation.failure?' · '+operation.failure.message:'');$('close-rejected').hidden=operation.status!=='REJECTED';}
async function continueOperation(){await retain();return exclusive(async()=>{const saved=await read('workspaces',state.key);if(!saved.pending)throw Error('There is no retained operation');const operation=await read('operations',state.key+':'+saved.pending);if(!operation)throw Error('The original complete operation is missing');return dispatch(operation);});}
async function closeRejected(){return exclusive(async()=>{const saved=await read('workspaces',state.key),operation=await read('operations',state.key+':'+saved.pending);if(operation?.status!=='REJECTED')throw Error('Only an explicitly rejected original operation can be closed');let observed=null;if(operation.body?.requestId){try{observed=await get(route('request'),{id:operation.body.requestId});if(observed.kind===operation.kind&&same(observed.input,operation.body)){operation.status='COMPLETE';operation.result=observed.result;await write([{store:'operations',key:state.key+':'+operation.id,value:operation}]);return finishOperation(operation);}}catch(error){if(error.status!==404||error.body?.requestNotFound!==true)throw error;}}
    const closed={...operation,status:'CLOSED_REJECTED',closedAt:new Date().toISOString(),originalRequestRead:observed};state.local.pending=null;await write([{store:'operations',key:state.key+':'+operation.id,value:closed},{store:'workspaces',key:state.key,value:capture()}]);await pendingUI();show('The rejected input remains retained. The controls can prepare a new request.');});}

function requireSaved(){if(!state.review)throw Error('Open a saved review revision');return state.review;}
async function historyFor(id,selected){const history=await get(route('history'),{id});if(history.id!==id||!Array.isArray(history.revisions))throw Error('The original history selection changed');options($('review-revision'),history.revisions.map(r=>({id:String(r.revision),name:r.name,status:r.status})),r=>'Revision '+r.id+' · '+r.status,null,String(selected));state.local.fields['review-revision']=String(selected);return history;}
async function selectReview(view){
  if(!view?.id||!Number.isSafeInteger(view.revision))throw Error('Select a complete saved review revision');
  state.review=view;state.report=null;state.rows=null;state.outputPage=0;state.rowsOffset=0;state.comparisonOffset=0;state.outputRows=null;state.comparisonRows=null;
  const raw={id:view.id,expectedRevision:view.revision,name:view.name,editions:view.editions.map(e=>({source:e.source,mapping:e.mapping,label:e.label,period:e.period})),aliases:[...view.aliases],reviewer:view.reviewer,notes:view.notes,rowPolicy:view.rowPolicy};
  loadDefinition('review',raw,{selection:{id:view.id,revision:view.revision}});
  state.local.fields['review-existing']=view.id;$('review-existing').value=view.id;
  await historyFor(view.id,view.revision);editionChoices();renderSelection();
}
function editionChoices(){const previous=$('rows-edition').value;options($('rows-edition'),(state.review?.editions||[]).map((e,i)=>({id:String(i),label:e.label,period:e.period})),e=>e.label+' · '+e.period,null,previous);}
async function openReview(id,revision){const view=await get(route('review'),{id,revision});if(view.id!==id||revision!==undefined&&view.revision!==revision)throw Error('The original saved revision selection changed');await selectReview(view);await retain();show('Opened '+view.name+' at saved revision '+view.revision+'.');}
async function openDefinition(kind){const id=$(kind+'-existing').value;if(!id)throw Error('Select a saved '+kind);const result=await get(route(kind),{id});const definition=structuredClone(result.definition);if(kind==='mapping')definition.plan=rawPlan(definition.plan);$(kind+'-json').value=json(definition);loadDefinition(kind,definition);await retain();$(kind+'-result').hidden=false;$(kind+'-result').textContent=json(result);show('Loaded the complete saved '+kind+' definition. Saving the controls creates a new explicit request.');}
function textValue(value){if(value===null)return '—';if(value===undefined)return '';return typeof value==='object'?JSON.stringify(value):String(value);}
function renderCountCards(counts){$('results-counts').replaceChildren();for(const[key,value]of Object.entries(counts||{}))if(typeof value==='number'||typeof value==='string'){const card=element('div',undefined,{class:'stat'});card.append(element('strong',String(value)),element('span',key));$('results-counts').append(card);}}
async function loadReport(){const v=requireSaved(),report=await get(route('report'),{id:v.id,revision:v.revision});if(report.review!==v.id||report.revision!==v.revision||!Array.isArray(report.outputs))throw Error('The complete report differs from its saved revision');state.report=report;state.outputPage=0;renderCountCards(report.counts);$('results-policy').textContent='Saved status: '+report.status+' · Row policy: '+v.rowPolicy+'. Coverage and excluded rows remain explicit for every output.';options($('result-output'),report.outputs.map((o,i)=>({id:String(i),title:o.title,edition:o.edition})),o=>o.title+' · edition '+o.edition,null,'0');$('comparison-detail').textContent=json(report.comparison);$('report-detail').textContent=json({schema:report.schema,id:report.id,review:report.review,revision:report.revision,status:report.status,reference:report.reference,editions:report.editions,issues:report.issues});await loadOutput();editionChoices();renderSelection();show('Complete saved report loaded. Tables page the full selected output.');return report;}
async function loadOutput(){
  const v=requireSaved(),output=state.report?.outputs[Number($('result-output').value)];
  state.outputRows=null;
  if(!output){renderOutput();return;}
  if(!Number.isSafeInteger(output.rows)||!Array.isArray(output.columns))throw Error('The complete saved reporting layout is unavailable');
  const offset=state.outputPage*50;
  const page=await get(route('output-rows'),{id:v.id,revision:v.revision,edition:output.edition,output:output.output,offset,limit:50});
  if(page.review!==v.id||page.revision!==v.revision||page.edition!==output.edition||page.output!==output.output||page.offset!==offset||page.total!==output.rows||!same(page.columns,output.columns)||!same(page.coverage,output.coverage)||!Array.isArray(page.rows))throw Error('The original saved reporting page selection changed');
  state.outputRows=page;renderOutput();
}
function renderOutput(){
  const page=state.outputRows,output=state.report?.outputs[Number($('result-output').value)];
  $('output-table').replaceChildren();
  if(!output||!page){$('result-coverage').textContent='Choose a saved reporting layout and read its original rows.';$('output-page').textContent='';return;}
  const needle=$('result-search').value.toLowerCase(),selected=page.rows.filter(row=>!needle||JSON.stringify(row.values).toLowerCase().includes(needle));
  const table=element('table'),head=element('thead'),tr=element('tr'),body=element('tbody');
  for(const c of page.columns)tr.append(element('th',c.label||c.field));head.append(tr);
  for(const row of selected){if(!Array.isArray(row.values)||row.values.length!==page.columns.length)throw Error('The original output column order is incomplete');const line=element('tr');for(const value of row.values)line.append(element('td',textValue(value)));body.append(line);}
  table.append(head,body);$('output-table').append(table);
  const c=page.coverage;
  $('result-coverage').textContent='Coverage: '+c.includedRows+' included / '+c.totalRows+' original rows; '+c.excludedRows+' excluded. Complete: '+String(c.complete)+'. Policy: '+c.rowPolicy+'. Layout matched '+output.matchedRows+' valid rows.';
  $('output-page').textContent=page.total?(page.offset+1)+'–'+Math.min(page.offset+page.rows.length,page.total)+' of '+page.total+' complete output rows'+(needle?' · '+selected.length+' matches on this page':''):'0 output rows';
  $('output-previous').disabled=page.offset===0;$('output-next').disabled=page.offset+page.rows.length>=page.total;
}
async function loadComparison(reset=false){
  const v=requireSaved();if(reset)state.comparisonOffset=0;
  const page=await get(route('comparison-rows'),{id:v.id,revision:v.revision,offset:state.comparisonOffset,limit:50});
  if(page.review!==v.id||page.revision!==v.revision||page.offset!==state.comparisonOffset||!Array.isArray(page.rows))throw Error('The original comparison page selection changed');
  if(state.report&&!same(page.comparison,state.report.comparison))throw Error('The selected comparison summary changed');
  state.comparisonRows=page;$('comparison-detail').textContent=json(page.comparison);
  const table=element('table'),head=element('thead'),h=element('tr'),body=element('tbody');
  for(const name of ['Kind','Complete key','Earlier row','Later row','Changed fields','Original details'])h.append(element('th',name));head.append(h);
  for(const row of page.rows){const tr=element('tr');for(const value of [row.kind,textValue(row.key),row.beforeRow,row.afterRow,(row.changes||[]).map(c=>c.field+(c.beforeType!==undefined&&c.afterType!==undefined&&c.beforeType!==c.afterType?' ('+(c.beforeType??'absent')+' → '+(c.afterType??'absent')+')':'')).join(', ')])tr.append(element('td',textValue(value)));const td=element('td'),button=element('button','Open complete change',{type:'button'});button.addEventListener('click',()=>{$('change-detail').hidden=false;$('change-detail').textContent=json(row);});td.append(button);tr.append(td);body.append(tr);}
  table.append(head,body);$('comparison-table').replaceChildren(table);
  $('comparison-page').textContent=page.total?(page.offset+1)+'–'+Math.min(page.offset+page.rows.length,page.total)+' of '+page.total+' retained changed keys':'0 changed keys';
  $('comparison-previous').disabled=page.offset===0;$('comparison-next').disabled=page.offset+page.rows.length>=page.total;
}
async function loadRows(reset=false){
  const v=requireSaved();if(reset)state.rowsOffset=0;const edition=integer($('rows-edition').value,'Edition',0,Math.max(0,v.editions.length-1));
  const page=await get(route('rows'),{id:v.id,revision:v.revision,edition,offset:state.rowsOffset,limit:50,issues:$('rows-issues').checked?'1':'0'});
  if(page.review!==v.id||page.revision!==v.revision||page.edition!==edition||page.offset!==state.rowsOffset||!Array.isArray(page.rows))throw Error('The original row page selection changed');
  state.rows=page;const columns=[...new Set(page.rows.flatMap(r=>Object.keys(r.values)))];
  const table=element('table'),head=element('thead'),line=element('tr'),body=element('tbody');
  for(const name of ['Physical row',...columns,'Issues','Original details'])line.append(element('th',name));head.append(line);
  for(const row of page.rows){const tr=element('tr');tr.append(element('td',row.source_row));for(const name of columns)tr.append(element('td',textValue(row.values[name])));tr.append(element('td',row.issues.map(i=>i.code+': '+i.message).join('\n')));const td=element('td'),button=element('button','Open full row',{type:'button',class:'row-open'});button.addEventListener('click',()=>{$('row-detail').hidden=false;$('row-detail').textContent=json(row);});td.append(button);tr.append(td);body.append(tr);}
  table.append(head,body);$('rows-table').replaceChildren(table);$('rows-page').textContent=page.total?(page.offset+1)+'–'+Math.min(page.offset+page.rows.length,page.total)+' of '+page.total+' selected rows':'0 selected rows';
  $('rows-previous').disabled=page.offset===0;$('rows-next').disabled=page.offset+page.rows.length>=page.total;
}
async function reportDownload(kind){const v=requireSaved(),url=new URL(route('export'),location.origin);for(const[k,value]of Object.entries({id:v.id,revision:v.revision,kind}))url.searchParams.set(k,String(value));const response=await api(url.pathname+url.search),blob=await response.blob();const declared=response.headers.get('content-length');if(declared!==null&&Number(declared)!==blob.size)throw Error('The complete export byte count changed');download(blob,'humanitarian-'+kind+'-r'+v.revision+'.zip');show('Downloaded the complete '+kind+' for saved revision '+v.revision+'.');}
async function selectedInput(){const v=requireSaved(),original=await get(route('request'),{id:v.requestId});if(original.kind!=='review'||original.result.id!==v.id||original.result.revision!==v.revision)throw Error('The original saved review request differs');return original.input;}
async function action(fn){if(state.busy)return;state.busy=true;document.querySelector('main').inert=true;by('nav button,.header-tools button,.pending button').forEach(n=>n.disabled=true);try{await retain();return await fn();}catch(error){show(error.message||error,true);}finally{state.busy=false;document.querySelector('main').inert=false;by('nav button,.header-tools button,.pending button').forEach(n=>n.disabled=false);}}
function on(id,event,fn){$(id).addEventListener(event,e=>{e.preventDefault();action(()=>fn(e));});}
function tab(name){for(const n of by('.tab'))n.hidden=n.id!=='tab-'+name;for(const n of by('nav button'))n.classList.toggle('active',n.dataset.tab===name);state.local.fields.activeTab=name;retain().catch(e=>show(e.message,true));}
for(const button of by('nav [data-tab]'))button.addEventListener('click',()=>tab(button.dataset.tab));
on('refresh','click',async()=>{await refresh();show('Saved records refreshed. The edited draft remains retained.');});
on('source-form','submit',async()=>{const file=$('source-file').files[0];if(!file||file.size>SOURCE_LIMIT)throw Error('Choose one complete original file within 100 MiB');const label=short($('source-label').value,240,true);await startOperation('source','/api/source',null,{blob:file,name:file.name,headers:{'X-Humanitarian-Name':encodeURIComponent(file.name),'X-Humanitarian-Label':encodeURIComponent(label)}});});
on('source-inspect','click',inspectSource);
for(const kind of KINDS){
  on(kind+'-form','submit',()=>startOperation(kind,route(kind),newInput(kind)));
  for(const button of by('[data-preview="'+kind+'"]'))button.addEventListener('click',()=>action(async()=>{$(kind+'-json').value=json(newInput(kind));await retain();show('Complete '+kind+' input prepared with its request identifier. Review it before saving.');}));
  for(const button of by('[data-load="'+kind+'"]'))button.addEventListener('click',()=>action(async()=>{const value=object($(kind+'-json').value);loadDefinition(kind,value);await retain();show('Complete input loaded into controls. Save this exact input retains its existing request identifier.');}));
  for(const button of by('[data-save="'+kind+'"]'))button.addEventListener('click',()=>action(async()=>{const value=object($(kind+'-json').value);if(typeof value.requestId!=='string'||!value.requestId)throw Error('The complete original input needs its retained requestId');return startOperation(kind,route(kind),value);}));
  for(const button of by('[data-download="'+kind+'"]'))button.addEventListener('click',()=>action(async()=>{const value=object($(kind+'-json').value);if(!value.requestId)throw Error('Review the complete input first');downloadJSON(value,'humanitarian-'+kind+'-input.json');}));
}
on('reference-open','click',()=>openDefinition('reference'));on('mapping-open','click',()=>openDefinition('mapping'));
on('reference-add-level','click',async()=>{if($('reference-levels').children.length>=6)throw Error('Administrative levels range from 0 to 5');levelRow();await retain();});
on('reference-preview-header','click',()=>loadHeader('reference'));on('mapping-preview-header','click',()=>loadHeader('mapping'));
on('mapping-add-column','click',async()=>{columnRow();updateFieldChoices();await retain();});
on('mapping-columns-from-header','click',columnDefaults);
on('mapping-add-output','click',async()=>{outputCard({id:'layout_'+($('mapping-outputs').children.length+1),title:'Reporting layout',groupBy:'',measures:[],columns:[{field:'admin_code',label:'Administrative code',hxl:''},{field:'admin_name',label:'Administrative name',hxl:''}],where:[]});await retain();});
on('review-add-edition','click',async()=>{if($('review-editions').children.length>=2)throw Error('Select at most two editions for this review');editionCard();await retain();});
on('review-open','click',()=>{const id=$('review-existing').value;if(!id)throw Error('Select a saved review');return openReview(id);});
on('review-open-revision','click',()=>{const id=$('review-existing').value;if(!id)throw Error('Select a saved review');return openReview(id,integer($('review-revision').value,'Saved revision',1));});
on('review-existing','change',async()=>{if($('review-existing').value){const item=state.saved.reviews.find(r=>r.id===$('review-existing').value);await historyFor(item.id,item.revision);await retain();}});
on('review-new','click',async()=>{state.local.reviewSelection=null;state.local.fields['review-id']='review-'+crypto.randomUUID();$('review-id').value=state.local.fields['review-id'];delete state.local.bases.review?.id;delete state.local.bases.review?.expectedRevision;state.review=null;state.report=null;renderSelection();await retain();show('Prepared a new review. The selected editions and edited fields are retained.');});
on('results-load','click',loadReport);
on('result-output','change',async()=>{state.outputPage=0;await loadOutput();});
$('result-search').addEventListener('input',()=>{try{renderOutput();}catch(error){show(error.message,true);}});
on('output-previous','click',async()=>{state.outputPage=Math.max(0,state.outputPage-1);await loadOutput();});
on('output-next','click',async()=>{state.outputPage++;await loadOutput();});
on('comparison-load','click',()=>loadComparison(true));
on('comparison-previous','click',async()=>{state.comparisonOffset=Math.max(0,state.comparisonOffset-50);await loadComparison();});
on('comparison-next','click',async()=>{if(state.comparisonRows)state.comparisonOffset=state.comparisonRows.offset+state.comparisonRows.rows.length;await loadComparison();});
on('rows-load','click',()=>loadRows(true));on('rows-edition','change',()=>loadRows(true));on('rows-issues','change',()=>loadRows(true));
on('rows-previous','click',async()=>{state.rowsOffset=Math.max(0,state.rowsOffset-50);await loadRows();});
on('rows-next','click',async()=>{if(state.rows)state.rowsOffset=state.rows.offset+state.rows.rows.length;await loadRows();});
on('download-report','click',()=>reportDownload('report'));on('download-workspace','click',()=>reportDownload('workspace'));
on('download-report-json','click',async()=>{const v=requireSaved(),report=state.report&&state.report.review===v.id&&state.report.revision===v.revision?state.report:await loadReport();downloadJSON(report,'humanitarian-complete-report-r'+v.revision+'.json');});
on('download-selected-input','click',async()=>downloadJSON(await selectedInput(),'humanitarian-original-review-input.json'));
on('receive-form','submit',async()=>{const file=$('receive-file').files[0];if(!file||file.size>ARCHIVE_LIMIT)throw Error('Choose one complete original workspace package within 2 GiB');await startOperation('receive','/api/import',null,{blob:file,name:file.name,headers:{'content-type':'application/zip'}});});
on('open-received','click',async()=>{if(!state.local.received)throw Error('No completed received review is selected');await openReview(state.local.received.id,state.local.received.revision);tab('results');await loadReport();});
on('review-input-receive','click',async()=>{const file=$('review-input-file').files[0];if(!file||file.size>LIMIT)throw Error('Select a complete original review input within 1 MiB');const raw=await file.text(),value=object(raw);if(typeof value.requestId!=='string'||!value.requestId)throw Error('Retain the original request identifier');await startOperation('review',route('review'),value,{blob:file,name:file.name,headers:{'content-type':'application/json'}});});
on('continue-operation','click',continueOperation);on('close-rejected','click',closeRejected);
on('download-operation','click',async()=>{const saved=await read('workspaces',state.key),operation=await read('operations',state.key+':'+saved.pending);if(!operation)throw Error('No original complete pending input is selected');if(operation.blob)download(operation.blob,operation.name||'humanitarian-original-input');else downloadJSON(operation.body,'humanitarian-original-'+operation.kind+'-input.json');});
document.querySelector('main').addEventListener('input',event=>{if(!state.local||event.target.type==='file')return;if(event.target.closest('#mapping-columns'))updateFieldChoices();retain().catch(error=>show(error.message,true));});
document.querySelector('main').addEventListener('change',event=>{if(state.local&&event.target.type!=='file')retain().catch(error=>show(error.message,true));});
async function initialize(){
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error('Open the private console link returned by the original workspace process');
  state.launch=await get('/api/launch');
  if(state.launch.schema!=='stellar-forge.humanitarian-workspace-launch.v1'||state.launch.status!=='HUMANITARIAN_WORKSPACE_READY'||typeof state.launch.workspace!=='string')throw Error('The original humanitarian launch identity is unavailable');
  state.key=state.launch.workspace;state.db=await openDB();
  state.local=await read('workspaces',state.key)||{schema:'stellar-forge.humanitarian-browser-workspace.v1',fields:{},levels:[{level:'0',codeMode:'index',codeValue:'0',nameMode:'index',nameValue:'1',aliases:'',geometry:''}],columns:[],outputs:[],editions:[{source:'',mapping:'',label:'',period:''}],aliasIds:[],bases:{},headerReceipts:{},reviewSelection:null,pending:null};
  if(state.local.schema!=='stellar-forge.humanitarian-browser-workspace.v1')throw Error('The original saved browser draft uses another schema');
  if(!state.local.fields['review-id'])state.local.fields['review-id']='review-'+crypto.randomUUID();
  await refresh();
  if(state.local.reviewSelection){const selected=state.local.reviewSelection;state.review=await get(route('review'),{id:selected.id,revision:selected.revision});if(state.review.id!==selected.id||state.review.revision!==selected.revision)throw Error('The selected original saved revision changed');await historyFor(selected.id,selected.revision);editionChoices();renderSelection();}
  const active=state.local.fields.activeTab;if(active&&$('tab-'+active))tab(active);
  await retain();await pendingUI();show(state.local.pending?'The complete original operation is retained. Select Continue original operation to reconcile it.':'Workspace ready. Sources, mappings and reviews use the original saved history.');
}
initialize().catch(error=>{document.querySelector('main').inert=true;show(error.message||error,true);});
