// SPDX-License-Identifier: MIT
// Guided proposal authoring only. The original named review applies every edit.
import {dateValue,amountValue,boxValue,pageByNumber,sourceText} from './model.mjs';

export const PDF_GUIDED_FORM_SCHEMA='stellar-forge.bank-pdf-guided-form.v1';
const ACTIONS={accounts:'ACCOUNT',regions:'REGION',rows:'ROWS',balances:'BALANCE',pageReviews:'PAGE_REVIEW'};
const LABELS={accounts:'Account',regions:'Table region',rows:'Transaction row',balances:'Balance',pageReviews:'Page review'};
const COLUMNS=['date','debit','credit','amount','description','reference','balance'];
const DISPOSITIONS=[['CASH_MAPPED','Cash movements mapped'],['OTHER_ACCOUNT','Another account'],['INFORMATION','Information only'],['MANUAL_REVIEW','Manual review still required'],['MANUAL_MAPPED','Manually mapped']];
const copy=x=>JSON.parse(JSON.stringify(x));
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const number=(v,label)=>{need((typeof v==='number'||typeof v==='string')&&String(v).trim()!==''&&Number.isFinite(Number(v)),label+' must be a finite number.');return Number(v);};
const whole=(v,label)=>{const n=number(v,label);need(Number.isInteger(n),label+' must be a whole number.');return n;};
const string=(v,label,max=4000,required=false)=>{need(typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)&&(!required||v.trim()),label+' must be '+(required?'nonblank ':'')+'text, up to '+max+' characters.');return v;};
const identity=work=>({workingCopyId:work.id,pdfSha256:work.file.sha256,extractionSha256:work.extractionSha256,baseRevision:work.revision});
const keyOf=(collection,row)=>collection==='pageReviews'?row.page:row.id;
const dataRows=(work,collection)=>Array.isArray(work?.[collection])?work[collection]:[];
const record=(work,collection,key)=>dataRows(work,collection).find(row=>String(keyOf(collection,row))===String(key));
const page=work=>work.extraction.pages[0];
function selectionValue(work,collection,selection){
 if(selection?.mode==='new')return {mode:'new',key:String(selection.key||crypto.randomUUID())};
 if(selection===null||selection===undefined)return {mode:'new',key:crypto.randomUUID()};
 const key=plain(selection)?(selection.mode==='existing'?selection.id:keyOf(collection,selection)):selection;
 const row=record(work,collection,key);
 need(row,'The selected '+LABELS[collection].toLowerCase()+' is not in the current original working copy.');
 return {mode:'existing',key:keyOf(collection,row)};
}
function blank(work,collection,id){
 const p=page(work),a=work.accounts[0],source={page:p.number,box:[0,0,p.width,p.height],itemIds:[],text:'',pdfSha256:work.file.sha256,extractionSha256:work.extractionSha256};
 if(collection==='accounts')return {id,name:'',bankId:'',branchId:'',accountId:'',accountType:'CHECKING',currency:'',scale:2,from:'',until:'',note:''};
 if(collection==='regions')return {id,accountId:a?.id||'',page:p.number,box:[0,0,p.width,p.height],columns:{},dateFormat:'MDY',yearRule:null,amountMode:'DEBIT_CREDIT',amountPrefix:'',amountSuffix:'',decimalSeparator:'.',groupSeparator:',',lineTolerance:2,descriptionContinuation:false,negativeMeans:'DEBIT'};
 if(collection==='rows')return {id,accountId:a?.id||'',regionId:null,source,raw:{},decision:'REVIEW',postedDate:'',amount:'',payee:'',memo:'',reference:'',runningBalance:'',note:''};
 if(collection==='balances')return {id,accountId:a?.id||'',kind:'OPENING',date:'',amount:'',source,raw:'',selected:false,note:''};
 return {page:work.extraction.pages.find(p=>!work.pageReviews.some(r=>r.page===p.number))?.number||p.number,disposition:'MANUAL_REVIEW',note:''};
}
function originalSelection(work,collection,selection){
 const selected=selectionValue(work,collection,selection),base=selected.mode==='existing'?copy(record(work,collection,selected.key)):null;
 return {schema:PDF_GUIDED_FORM_SCHEMA,formId:crypto.randomUUID(),...identity(work),collection,selection:selected,baseValue:base,value:base?copy(base):blank(work,collection,selected.key),dirty:false,view:{itemSearch:'',itemOffset:0}};
}
function sourceValue(work,source){
 need(plain(source),'Select a complete source reference.');
 const result=copy(source),p=pageByNumber(work,whole(source.page,'Source page'));
 result.page=p.number;result.box=boxValue(source.box.map((x,i)=>number(x,['Left','Top','Right','Bottom'][i])),p);
 need(Array.isArray(source.itemIds)&&source.itemIds.every(x=>typeof x==='string'),'Select original text item IDs.');
 result.itemIds=[...source.itemIds];result.text=sourceText(work,result);
 need(!source.pdfSha256||source.pdfSha256===work.file.sha256,'The source reference belongs to another original PDF.');
 need(!source.extractionSha256||source.extractionSha256===work.extractionSha256,'The source reference belongs to another extraction.');
 result.pdfSha256=work.file.sha256;result.extractionSha256=work.extractionSha256;return result;
}
function exactDate(v,label){string(v,label,10,true);need(/^\d{4}-\d{2}-\d{2}$/.test(v),label+' must use YYYY-MM-DD.');dateValue(v);return v;}
function money(v,account,label,optional=false){
 string(v,label,100,!optional);if(optional&&!v)return v;
 need(/^-?\d+(?:\.\d+)?$/.test(v),label+' must be exact decimal text, with a dot and no grouping or currency symbol.');
 amountValue(v,{decimalSeparator:'.',groupSeparator:'',scale:account.scale});
 return v; // Do not normalize the reviewer's exact string.
}
export function pdfGuidedProposal(work,form){
 need(form?.schema===PDF_GUIDED_FORM_SCHEMA&&ACTIONS[form.collection]&&plain(form.value),'Open a complete guided form.');
 need(same(identity(work),Object.fromEntries(Object.keys(identity(work)).map(k=>[k,form[k]]))),'The working copy changed. Preserve this form and start from the current original record.');
 const c=form.collection,v=copy(form.value);
 if(form.selection.mode==='existing'){
  const original=record(work,c,form.selection.key);
  need(original&&same(original,form.baseValue),'The selected original record changed.');
  need(String(keyOf(c,v))===String(form.selection.key),'Preserve the selected original record identity.');
 }else{
  need(form.selection.mode==='new','Select an original record or a new proposal.');
  need(!record(work,c,keyOf(c,v)),'This identity already exists. Open its original record to change it.');
  if(c!=='pageReviews')need(v.id===form.selection.key,'Preserve the stable new record identity.');
 }
 if(c!=='pageReviews')string(v.id,'Record identity',100,true);
 let a;
 if(['regions','rows','balances'].includes(c)){
  a=work.accounts.find(x=>x.id===v.accountId);need(a,'Select an account from this working copy.');
 }
 if(c==='accounts'){
  string(v.name,'Account name',160,true);string(v.bankId,'Institution identifier',255,true);string(v.accountId,'Printed account identifier',255,true);
  string(v.branchId,'Branch identifier',255);string(v.accountType,'Account type',100,true);string(v.currency,'Currency',3,true);
  need(/^[A-Z]{3}$/.test(v.currency),'Use the exact three-letter uppercase currency code.');
  v.scale=whole(v.scale,'Currency decimal places');need(v.scale>=0&&v.scale<=6,'Currency decimal places must be between 0 and 6.');
  exactDate(v.from,'Period start');exactDate(v.until,'Period end');need(v.from<=v.until,'Period end must not precede period start.');string(v.note,'Account note');
 }else if(c==='regions'){
  const p=pageByNumber(work,whole(v.page,'Page'));v.page=p.number;
  v.box=boxValue(v.box.map((x,i)=>number(x,['Left','Top','Right','Bottom'][i])),p);
  need(plain(v.columns)&&Object.keys(v.columns).every(k=>COLUMNS.includes(k)),'Use only supported original column names.');
  for(const [key,range] of Object.entries(v.columns)){
   need(Array.isArray(range)&&range.length===2,'Map both edges of '+key+'.');v.columns[key]=range.map(x=>number(x,key+' edge'));
   need(v.columns[key][0]>=v.box[0]&&v.columns[key][1]<=v.box[2]&&v.columns[key][1]>v.columns[key][0],key+' must lie within the table rectangle.');
  }
  need(['SIGNED','DEBIT_CREDIT'].includes(v.amountMode),'Select the amount interpretation.');
  need(v.columns.date&&(v.amountMode==='SIGNED'?v.columns.amount:v.columns.debit&&v.columns.credit),'Map Date and either Signed amount or both Debit and Credit.');
  need(['YMD','MDY','DMY'].includes(v.dateFormat),'Select the printed date order.');
  if(v.yearRule!==null){need(plain(v.yearRule),'Choose an explicit year rule.');if('year' in v.yearRule){v.yearRule={...v.yearRule,year:whole(v.yearRule.year,'Statement year')};need(v.yearRule.year>=1600&&v.yearRule.year<=9999,'Statement year must be between 1600 and 9999.');}else{v.yearRule={...v.yearRule,century:whole(v.yearRule.century,'Printed year century')};need(v.yearRule.century>=1600&&v.yearRule.century<=9900&&v.yearRule.century%100===0,'Century must be 1600–9900 in steps of 100.');}}
  string(v.amountPrefix,'Printed amount prefix',12);string(v.amountSuffix,'Printed amount suffix',12);
  need(!/[0-9\u0000-\u001f]/.test(v.amountPrefix+v.amountSuffix),'Printed currency prefix and suffix cannot contain numbers or control characters.');
  need(['.',','].includes(v.decimalSeparator)&&['',',','.',' ','\u00a0',"'"].includes(v.groupSeparator)&&v.decimalSeparator!==v.groupSeparator,'Select distinct supported decimal and grouping separators.');
  v.lineTolerance=number(v.lineTolerance,'Line tolerance');need(v.lineTolerance>=0.1&&v.lineTolerance<=20,'Line tolerance must be between 0.1 and 20 displayed-page units.');
  need(typeof v.descriptionContinuation==='boolean'&&['DEBIT','CREDIT'].includes(v.negativeMeans),'Select continuation and negative-amount interpretation.');
 }else if(c==='rows'){
  v.source=sourceValue(work,v.source);need(plain(v.raw),'Preserve the complete original printed fields.');
  if(v.regionId)need(work.regions.some(x=>x.id===v.regionId),'Choose an existing original table region or no region.');
  need(['REVIEW','INCLUDE','EXCLUDE'].includes(v.decision),'Select a row decision.');
  string(v.postedDate,'Posted date',100);string(v.amount,'Amount',100);string(v.runningBalance,'Running balance',100);
  string(v.payee,'Payee',500);string(v.memo,'Description',4000);string(v.reference,'Reference',250);string(v.note,'Row note');
  if(v.decision==='INCLUDE'){exactDate(v.postedDate,'Posted date');need(v.postedDate>=a.from&&v.postedDate<=a.until,'Included row must fall within the selected account period.');money(v.amount,a,'Amount');money(v.runningBalance,a,'Running balance',true);}
  if(v.decision==='EXCLUDE')string(v.note,'Exclusion reason',4000,true);
 }else if(c==='balances'){
  need(['OPENING','CLOSING','RUNNING','OTHER'].includes(v.kind),'Select the balance meaning.');
  exactDate(v.date,'Balance date');money(v.amount,a,'Balance amount');v.source=sourceValue(work,v.source);
  string(v.raw,'Printed balance text',250);string(v.note,'Balance note');need(typeof v.selected==='boolean','Choose whether to use this balance.');
 }else{
  v.page=pageByNumber(work,whole(v.page,'Page')).number;
  need(DISPOSITIONS.some(x=>x[0]===v.disposition),'Select a page disposition.');string(v.note,'Page coverage note',4000,true);
 }
 return {action:ACTIONS[c],value:c==='rows'?[v]:v};
}

export function createPdfReviewEditor({mount,onDraft,onError=()=>{},onFormDraft=()=>{}}){
 need(mount&&typeof mount.replaceChildren==='function'&&typeof onDraft==='function','Provide an editor mount and retained-draft callback.');
 let context=null,form=null,retaining=false,destroyed=false,error='',notice='',recordSearch='',recordOffset=0,rendering=false;
 const root=document.createElement('section');root.className='pdf-guided-editor';root.setAttribute('aria-label','Guided PDF interpretation');mount.replaceChildren(root);
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const report=e=>{error=e?.message||String(e);try{onError(e);}catch{}render();};
 function stale(){
  if(!form||!context?.work)return false;
  if(!same(identity(context.work),Object.fromEntries(Object.keys(identity(context.work)).map(k=>[k,form[k]]))))return true;
  if(context.collection!==form.collection)return true;
  if(form.selection.mode==='existing'&&!same(record(context.work,form.collection,form.selection.key),form.baseValue))return true;
  if(form.selection.mode==='new'&&record(context.work,form.collection,keyOf(form.collection,form.value)))return true;
  if(context.selection!==undefined){
   const s=context.selection;
   if(s===null)return false; // null means no external row choice; preserve this stable form.
   const mode=s?.mode||'existing',key=plain(s)?(mode==='new'?s.key:(s.id??s.page)):s;
   if(mode!==form.selection.mode||(key!==undefined&&String(key)!==String(form.selection.key)))return true;
  }
  return false;
 }
 const disabled=()=>!context?.work||context.rawDirty||context.busy||context.blocked||retaining||stale();
 function persist(){if(form)onFormDraft(copy(form));}
 function changed(fn,redraw=false){
  if(disabled())return;
  try{fn(form.value);form.dirty=true;error='';notice='Unretained form changes. Retain the proposed edit, then use the original Apply action.';persist();if(redraw)render();else status();}catch(e){report(e);}
 }
 function viewChanged(fn){if(!form)return;try{fn(form.view);persist();render();}catch(e){report(e);}}
 function start(selection=context?.selection){
  if(!context?.work)return;
  form=originalSelection(context.work,context.collection,selection);error='';notice='';recordOffset=0;persist();render();
 }
 function choose(selection){
  if(disabled())return;
  if(form?.dirty){report(new Error('Preserve or retain these form changes before selecting another record. Use Discard form changes explicitly.'));return;}
  context={...context,selection};start(selection);
 }
 function action(label,fn,{mutates=true,key,recovery=false}={}){
  const b=el('button',label);b.type='button';if(key)b.dataset.focus=key;b.disabled=recovery?false:mutates?disabled():!!context?.busy||!!context?.blocked||retaining;
  b.addEventListener('click',()=>{try{const result=fn();if(result?.catch)result.catch(report);}catch(e){report(e);}});return b;
 }
 function field(parent,label,value,write,{type='text',choices,help,max,focus,multiline=false,disabled:off=false,inputMode}={}){
  const wrap=el('label',undefined,'pge-field'),name=el('span',label,'pge-label');wrap.append(name);
  const input=el(choices?'select':multiline?'textarea':'input');if(!choices&&!multiline)input.type=type;
  if(choices){for(const [val,title]of choices){const o=el('option',title);o.value=String(val);input.append(o);}if(!choices.some(x=>String(x[0])===String(value??''))&&value!==undefined&&value!==null){const o=el('option','Retained value: '+String(value));o.value=String(value);input.append(o);}}
  if(type==='checkbox')input.checked=value===true;else input.value=value??'';
  if(max)input.maxLength=max;if(inputMode)input.inputMode=inputMode;if(multiline)input.rows=3;
  input.dataset.focus=focus||label;input.disabled=off||disabled();
  const event=choices||type==='checkbox'?'change':'input';
  input.addEventListener(event,()=>changed(v=>write(v,type==='checkbox'?input.checked:input.value),!!choices||type==='checkbox'));
  wrap.append(input);if(help)wrap.append(el('small',help));parent.append(wrap);return input;
 }
 function group(title,help){
  const f=el('fieldset');f.append(el('legend',title));if(help)f.append(el('p',help,'pge-help'));const grid=el('div',undefined,'pge-grid');f.append(grid);root.append(f);return grid;
 }
 const accountChoices=()=>[['','Choose an original account'],...context.work.accounts.map(a=>[a.id,a.name+' · '+a.accountId+' · '+a.currency+' · '+a.from+' to '+a.until])];
 const pageChoices=()=>context.work.extraction.pages.map(p=>[p.number,'Page '+p.number+' · '+p.width+' × '+p.height+' · '+p.items.length+' text items']);
 function rectangle(parent,value,set,workPage){
  const box=el('div',undefined,'pge-rectangle');['Left','Top','Right','Bottom'].forEach((name,i)=>field(box,name,value?.[i]??'',(v,x)=>set(v,i,x),{focus:'rectangle-'+name,inputMode:'decimal'}).addEventListener('change',render));parent.append(box);
  parent.append(el('p','Coordinates are in original displayed-page units. Page '+workPage.number+': '+workPage.width+' × '+workPage.height+'.','pge-help'));
 }
 function geometry(parent,p,box,selected=[]){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 '+p.width+' '+p.height);svg.setAttribute('role','img');svg.setAttribute('aria-label','Original page rectangle and selected text geometry');svg.classList.add('pge-geometry');
  function rect(b,cls){if(!Array.isArray(b)||b.length!==4||b.some(x=>!Number.isFinite(Number(x))))return;const n=document.createElementNS(svg.namespaceURI,'rect');n.setAttribute('x',String(Number(b[0])));n.setAttribute('y',String(Number(b[1])));n.setAttribute('width',String(Math.max(0,Number(b[2])-Number(b[0]))));n.setAttribute('height',String(Math.max(0,Number(b[3])-Number(b[1]))));n.setAttribute('class',cls);svg.append(n);}
  rect([0,0,p.width,p.height],'pge-page-box');rect(box,'pge-review-box');for(const item of selected)rect(item.box,'pge-item-box');parent.append(svg);
 }
 function sourcePanel(){
  const w=context.work,v=form.value,s=v.source,p=w.extraction.pages.find(x=>x.number===Number(s.page))||page(w);
  const g=group('Original page and text evidence','Keep the page rectangle and exact PDF.js text identities. A manual rectangle may have no text items; that absence remains visible.');
  field(g,'Original page',s.page,(v,x)=>{if(Number(x)!==Number(v.source.page)){const next=pageByNumber(w,x);v.source={...v.source,page:next.number,box:[0,0,next.width,next.height],itemIds:[],text:'',pdfSha256:w.file.sha256,extractionSha256:w.extractionSha256};form.view.itemOffset=0;notice='Page changed explicitly. Previous page text choices were cleared; select the new source evidence.';}},{choices:pageChoices(),help:'Changing page clears the previous page’s item selection and resets the rectangle.'});
  const ids=new Set(s.itemIds||[]),selected=p.items.filter(x=>ids.has(x.id));
  rectangle(g,s.box,(v,i,x)=>{v.source.box[i]=x;},p);geometry(g,p,s.box,selected);
  const bindings=el('details');bindings.append(el('summary','Original source identities'));bindings.append(el('pre','PDF SHA-256: '+w.file.sha256+'\nExtraction SHA-256: '+w.extractionSha256));g.append(bindings);
  const tools=el('div',undefined,'pge-toolbar');
  tools.append(action('Fit rectangle to selected text',()=>changed(v=>{
   need(selected.length,'Select at least one original text item.');
   const b=[Math.max(0,selected.reduce((a,x)=>Math.min(a,x.box[0]),Infinity)),Math.max(0,selected.reduce((a,x)=>Math.min(a,x.box[1]),Infinity)),Math.min(p.width,selected.reduce((a,x)=>Math.max(a,x.box[2]),-Infinity)),Math.min(p.height,selected.reduce((a,x)=>Math.max(a,x.box[3]),-Infinity))];
   boxValue(b,p);v.source.box=b;
  },true)));
  tools.append(action('Clear selected text',()=>changed(v=>{v.source.itemIds=[];v.source.text='';},true)));g.append(tools);
  const searchLabel=el('label',undefined,'pge-field');searchLabel.append(el('span','Find original text on this page','pge-label'));const search=el('input');search.type='search';search.value=form.view.itemSearch||'';search.dataset.focus='item-search';search.disabled=disabled();search.addEventListener('input',()=>viewChanged(v=>{v.itemSearch=search.value;v.itemOffset=0;}));searchLabel.append(search);g.append(searchLabel);
  const query=(form.view.itemSearch||'').toLocaleLowerCase(),matches=p.items.filter(x=>!query||x.text.toLocaleLowerCase().includes(query)||x.id.toLocaleLowerCase().includes(query));
  const offset=Math.min(Math.max(0,form.view.itemOffset||0),Math.max(0,Math.floor((matches.length-1)/40)*40)),visible=matches.slice(offset,offset+40);
  const table=el('table'),caption=el('caption',selected.length+' selected · '+matches.length+' matching original text items');table.append(caption);
  const head=el('thead'),hr=el('tr');for(const title of['Use','Text identity','Original text','Rectangle'])hr.append(el('th',title));head.append(hr);table.append(head);
  const body=el('tbody');for(const item of visible){
   const tr=el('tr'),td=el('td'),check=el('input');check.type='checkbox';check.checked=ids.has(item.id);check.disabled=disabled();check.setAttribute('aria-label','Use original '+item.id);check.dataset.focus='item-'+item.id;
   check.addEventListener('change',()=>changed(v=>{const next=new Set(v.source.itemIds);if(check.checked)next.add(item.id);else next.delete(item.id);v.source.itemIds=p.items.filter(x=>next.has(x.id)).sort((a,b)=>a.index-b.index).map(x=>x.id);v.source.text=sourceText(w,v.source);},true));td.append(check);tr.append(td,el('td',item.id),el('td',item.text),el('td',item.box.join(', ')));body.append(tr);
  }table.append(body);const scroll=el('div',undefined,'pge-table-wrap');scroll.append(table);g.append(scroll);
  if(!visible.length)g.append(el('p','No original text items match this search. A scanned page may need a manually checked rectangle.','pge-empty'));
  const pager=el('div',undefined,'pge-toolbar'),prev=action('Previous text',()=>viewChanged(v=>v.itemOffset=Math.max(0,offset-40))),next=action('Next text',()=>viewChanged(v=>v.itemOffset=offset+40));
  prev.disabled=disabled()||offset===0;next.disabled=disabled()||offset+40>=matches.length;pager.append(prev,el('span',matches.length?(offset+1)+'–'+Math.min(offset+40,matches.length)+' of '+matches.length:'0 items'),next);g.append(pager);
  g.append(el('p',selected.length?'Selected original text: '+selected.sort((a,b)=>a.index-b.index).map(x=>x.text).join(' '):'No original text items selected.','pge-source-text'));
 }
 function renderFields(){
  const c=form.collection,v=form.value,w=context.work;
  if(c==='accounts'){
   const g=group('Account and statement period','Enter identifiers as printed. Currency scale controls exact amount validation; changing it does not silently rewrite existing rows.');
   for(const [key,label,max]of[['name','Account name',160],['bankId','Institution identifier',255],['branchId','Branch identifier',255],['accountId','Printed account identifier',255],['accountType','Account type',100],['currency','Currency code',3]])field(g,label,v[key],(r,x)=>r[key]=x,{max,help:key==='currency'?'Three uppercase letters, for example USD.':key==='accountId'?'Preserve leading zeros and the original printed identifier.':undefined});
   field(g,'Currency decimal places',v.scale,(r,x)=>r.scale=x,{inputMode:'numeric',help:'0 to 6; amounts stay decimal strings.'});
   field(g,'Period start',v.from,(r,x)=>r.from=x,{type:'date'});field(g,'Period end',v.until,(r,x)=>r.until=x,{type:'date'});
   field(g,'Account interpretation note',v.note,(r,x)=>r.note=x,{multiline:true,max:4000});
  }else if(c==='regions'){
   const g=group('Table source and account','Editing an existing table interpretation makes its affected rows require review in the original engine. Retaining this proposal does not regenerate or apply rows.');
   field(g,'Account',v.accountId,(r,x)=>r.accountId=x,{choices:accountChoices()});
   field(g,'Original page',v.page,(r,x)=>r.page=Number(x),{choices:pageChoices(),help:'Page changes preserve entered geometry and columns. Review all boundaries against the new page.'});
   const p=pageByNumber(w,v.page);rectangle(g,v.box,(r,i,x)=>r.box[i]=x,p);geometry(g,p,v.box);
   const columns=group('Printed column boundaries','Enable each printed column and enter its left and right edges in the same displayed-page units as the table rectangle.');
   const table=el('table'),tr=el('tr');for(const h of['Column','Mapped','Left','Right'])tr.append(el('th',h));const head=el('thead');head.append(tr);table.append(head);const tbody=el('tbody');
   for(const key of COLUMNS){const row=el('tr');row.append(el('th',key[0].toUpperCase()+key.slice(1)));const enabled=el('td'),check=el('input');check.type='checkbox';check.checked=!!v.columns[key];check.disabled=disabled();check.setAttribute('aria-label','Map '+key);check.dataset.focus='column-'+key;check.addEventListener('change',()=>changed(r=>{if(check.checked)r.columns[key]=[r.box[0],r.box[2]];else delete r.columns[key];},true));enabled.append(check);row.append(enabled);
    for(let i=0;i<2;i++){const td=el('td'),input=el('input');input.type='text';input.inputMode='decimal';input.value=v.columns[key]?.[i]??'';input.disabled=disabled()||!v.columns[key];input.setAttribute('aria-label',key+' '+(i?'right':'left'));input.dataset.focus='column-'+key+'-'+i;input.addEventListener('input',()=>changed(r=>r.columns[key][i]=input.value));td.append(input);row.append(td);}tbody.append(row);
   }table.append(tbody);const wrap=el('div',undefined,'pge-table-wrap');wrap.append(table);columns.append(wrap);
   const f=group('Date and amount interpretation','These rules describe printed source text. No transaction amount is inferred or posted by this form.');
   field(f,'Printed date order',v.dateFormat,(r,x)=>r.dateFormat=x,{choices:[['YMD','Year / month / day'],['MDY','Month / day / year'],['DMY','Day / month / year']]});
   const rule=v.yearRule===null?'none':'year'in(v.yearRule||{})?'year':'century';
   field(f,'Missing or two-digit year rule',rule,(r,x)=>r.yearRule=x==='none'?null:x==='year'?{year:''}:{century:''},{choices:[['none','No additional year rule'],['year','Explicit year for dates with no year'],['century','Explicit century for two-digit years']]});
   if(rule!=='none')field(f,rule==='year'?'Statement year':'Printed year century',v.yearRule?.[rule],(r,x)=>r.yearRule[rule]=x,{inputMode:'numeric',help:rule==='century'?'For example 2000. Choose it from the original statement.':'Use the original statement year.'});
   field(f,'Amount columns',v.amountMode,(r,x)=>r.amountMode=x,{choices:[['DEBIT_CREDIT','Separate debit and credit'],['SIGNED','One signed amount']]});
   field(f,'Negative signed amount means',v.negativeMeans,(r,x)=>r.negativeMeans=x,{choices:[['DEBIT','Debit / outflow'],['CREDIT','Credit / inflow']]});
   field(f,'Decimal separator',v.decimalSeparator,(r,x)=>r.decimalSeparator=x,{choices:[['.','Dot (.)'],[',','Comma (,)']]});
   field(f,'Grouping separator',v.groupSeparator,(r,x)=>r.groupSeparator=x,{choices:[['','None'],[',','Comma (,)'],['.','Dot (.)'],[' ','Space'],['\u00a0','Non-breaking space'],["'","Apostrophe (')"]]});
   field(f,'Printed currency prefix',v.amountPrefix,(r,x)=>r.amountPrefix=x,{max:12});field(f,'Printed currency suffix',v.amountSuffix,(r,x)=>r.amountSuffix=x,{max:12});
   field(f,'Line grouping tolerance',v.lineTolerance,(r,x)=>r.lineTolerance=x,{inputMode:'decimal',help:'0.1 to 20 displayed-page units.'});
   field(f,'Continue description-only lines',v.descriptionContinuation,(r,x)=>r.descriptionContinuation=x,{type:'checkbox',help:'Keep a following description-only line with its preceding transaction.'});
  }else if(c==='rows'){
   const g=group('Transaction interpretation','Review keeps unfinished values. Include requires an exact date and decimal amount within the account period. Exclude requires a reason.');
   field(g,'Account',v.accountId,(r,x)=>r.accountId=x,{choices:accountChoices()});
   field(g,'Original table region',v.regionId||'',(r,x)=>r.regionId=x||null,{choices:[['','No table region / manual row'],...w.regions.map(r=>[r.id,'Page '+r.page+' · '+r.id])],help:'Changing an account does not silently change the original table or printed values.'});
   field(g,'Row decision',v.decision,(r,x)=>r.decision=x,{choices:[['REVIEW','Review required'],['INCLUDE','Include cash movement'],['EXCLUDE','Exclude with a recorded reason']]});
   field(g,'Posted date',v.postedDate,(r,x)=>r.postedDate=x,{help:'YYYY-MM-DD when including. Unfinished review text is retained exactly.'});
   field(g,'Signed amount',v.amount,(r,x)=>r.amount=x,{inputMode:'decimal',help:'Exact decimal text; negative is outflow. No grouping or currency symbol.'});
   field(g,'Running balance',v.runningBalance,(r,x)=>r.runningBalance=x,{inputMode:'decimal',help:'Optional; exact decimal text.'});
   field(g,'Payee',v.payee,(r,x)=>r.payee=x,{max:500});field(g,'Description / memo',v.memo,(r,x)=>r.memo=x,{multiline:true,max:4000});field(g,'Reference',v.reference,(r,x)=>r.reference=x,{max:250});field(g,'Review or exclusion note',v.note,(r,x)=>r.note=x,{multiline:true,max:4000});
   const raw=el('details');raw.append(el('summary','Preserved original printed fields'));raw.append(el('pre',JSON.stringify(v.raw,null,2)));g.append(raw);sourcePanel();
  }else if(c==='balances'){
   const g=group('Balance interpretation','Select the original opening and closing balances deliberately. This form never deselects another balance; conflicting selections remain visible in the original review.');
   field(g,'Account',v.accountId,(r,x)=>r.accountId=x,{choices:accountChoices()});
   field(g,'Balance meaning',v.kind,(r,x)=>r.kind=x,{choices:[['OPENING','Opening balance'],['CLOSING','Closing balance'],['RUNNING','Running balance'],['OTHER','Other balance']]});
   field(g,'Balance date',v.date,(r,x)=>r.date=x,{type:'date'});field(g,'Exact balance amount',v.amount,(r,x)=>r.amount=x,{inputMode:'decimal',help:'Signed decimal text with a dot; preserve decimal precision.'});
   field(g,'Original printed balance text',v.raw,(r,x)=>r.raw=x,{max:250});field(g,'Use this balance in reconciliation',v.selected,(r,x)=>r.selected=x,{type:'checkbox'});
   field(g,'Balance interpretation note',v.note,(r,x)=>r.note=x,{multiline:true,max:4000});sourcePanel();
  }else{
   const g=group('Original page coverage','Describe how this page was reviewed, mapped or excluded. Manual review required remains an unfinished state.');
   field(g,'Original page',v.page,(r,x)=>r.page=Number(x),{choices:pageChoices(),disabled:form.selection.mode==='existing',help:form.selection.mode==='existing'?'This review keeps its original page identity.':'A page with an existing review must be edited through that original record.'});
   field(g,'Page disposition',v.disposition,(r,x)=>r.disposition=x,{choices:DISPOSITIONS});
   field(g,'Page coverage note',v.note,(r,x)=>r.note=x,{multiline:true,max:4000});
   const p=pageByNumber(w,v.page);g.append(el('p','Original page '+p.number+' contains '+p.items.length+' extracted text items. Use the source viewer to inspect the actual page before completing its review.','pge-help'));
  }
 }
 function download(){
  if(!form)return;const raw=JSON.stringify(form,null,2)+'\n',url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=el('a');a.href=url;a.download='PDF_Guided_Form_'+form.formId+'.json';root.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function status(){
  const n=root.querySelector('[data-status]');if(!n)return;
  n.textContent=error|| (stale()?'This form belongs to an earlier working revision or selection. Download or preserve it, then explicitly use the current selection.':context?.rawDirty?'The retained advanced draft is authoritative. Apply or discard it before making another guided change.':context?.blocked?'Working-copy storage is blocked. Preserve this form and resolve the original storage conflict.':retaining?'Retaining the complete proposed edit…':context?.busy?'The original working-copy operation is in progress.':notice||'Fields propose a change. Retain the proposed edit, then use the original reviewer, reason and Apply controls.');
  n.className='pge-status'+(error||stale()||context?.blocked?' pge-warning':'');n.setAttribute('role',error?'alert':'status');
 }
 async function retain(){
  if(disabled())return;
  let value,frozen;
  try{
   value=pdfGuidedProposal(context.work,form);frozen=copy(form);retaining=true;error='';render();
   await onDraft(copy(value));
   if(destroyed)return;
   // Parent may re-render rawDirty while its retained CAS operation resolves.
   // Never erase a different form or a form authored after this exact request.
   if(form&&same(form,frozen)){onFormDraft(null);form=null;notice='Complete proposal retained. Review the named reviewer and reason, then use the original Apply action.';}
  }catch(e){report(e);}finally{retaining=false;if(!destroyed)render();}
 }
 function selectionPanel(){
  const bar=el('div',undefined,'pge-selection'),label=el('label',undefined,'pge-field');label.append(el('span','Find an existing '+LABELS[context.collection].toLowerCase(),'pge-label'));
  const search=el('input');search.type='search';search.value=recordSearch;search.dataset.focus='record-search';search.disabled=disabled();search.addEventListener('input',()=>{recordSearch=search.value;recordOffset=0;render();});label.append(search);bar.append(label);
  const q=recordSearch.toLocaleLowerCase(),all=dataRows(context.work,context.collection),matches=all.filter(x=>!q||[keyOf(context.collection,x),x.name,x.accountId,x.postedDate,x.amount,x.note,x.page,x.disposition].some(v=>String(v??'').toLocaleLowerCase().includes(q))),offset=Math.min(recordOffset,Math.max(0,Math.floor((matches.length-1)/40)*40));
  const select=el('select');select.dataset.focus='record-select';select.setAttribute('aria-label','Open an existing original record');select.disabled=disabled();
  const prompt=el('option','Choose an existing original record');prompt.value='';select.append(prompt);
  for(const row of matches.slice(offset,offset+40)){const k=keyOf(context.collection,row),o=el('option',String(k)+' · '+String(row.name||row.postedDate||row.kind||row.disposition||('Page '+row.page))+(row.amount?' · '+row.amount:''));o.value=String(k);select.append(o);}
  select.addEventListener('change',()=>{if(select.value!=='')choose({mode:'existing',id:select.value});});bar.append(select,action('New '+LABELS[context.collection].toLowerCase(),()=>choose({mode:'new',key:crypto.randomUUID()})));
  if(matches.length>40){const prev=action('Previous records',()=>{recordOffset=Math.max(0,offset-40);render();}),next=action('Next records',()=>{recordOffset=offset+40;render();});prev.disabled=disabled()||offset===0;next.disabled=disabled()||offset+40>=matches.length;bar.append(prev,el('span',(offset+1)+'–'+Math.min(offset+40,matches.length)+' of '+matches.length),next);}
  if(!all.length)bar.append(el('p','No '+context.collection+' have been retained yet. Start a new proposal.','pge-empty'));root.append(bar);
 }
 function render(){
  if(destroyed||rendering)return;rendering=true;
  const active=root.contains(document.activeElement)?document.activeElement:null,key=active?.dataset.focus,startPos=active?.selectionStart,endPos=active?.selectionEnd;
  try{
   root.replaceChildren();root.append(el('h3','Guided interpretation'));
   const state=el('p');state.dataset.status='';state.setAttribute('aria-live','polite');root.append(state);
   if(!context?.work){root.append(el('p','Open the original PDF review to author a proposal.','pge-empty'));status();return;}
   selectionPanel();
   if(form){
    root.append(el('p',LABELS[form.collection]+' · '+(form.selection.mode==='new'?'new proposal':'original record')+' · '+String(keyOf(form.collection,form.value))+' · working revision '+form.baseRevision,'pge-identity'));
    if(!stale())renderFields();else{const d=el('details');d.append(el('summary','Preserved stale form'));d.append(el('pre',JSON.stringify(form.value,null,2)));root.append(d);}
    const actions=el('div',undefined,'pge-toolbar');
    actions.append(action('Retain proposed edit',retain,{key:'retain-edit'}),action('Download complete form',download,{mutates:false,recovery:true}),action(stale()?'Use current selection':'Discard form changes',()=>{
     if(context.rawDirty)throw new Error('Apply or discard the retained advanced draft first.');
     const selected=context.selection;onFormDraft(null);form=null;start(selected);
    },{mutates:false}));
    root.append(actions);
   }else root.append(el('p','No unretained form. Choose an original record or start a new proposal.','pge-empty'));
   status();
  }catch(e){error=e?.message||String(e);root.append(el('p',error,'pge-status pge-warning'));try{onError(e);}catch{}}
  finally{
   rendering=false;
   if(key){const focus=[...root.querySelectorAll('[data-focus]')].find(x=>x.dataset.focus===key);if(focus&&!focus.disabled){focus.focus({preventScroll:true});if(typeof startPos==='number'&&typeof focus.setSelectionRange==='function')try{focus.setSelectionRange(startPos,endPos);}catch{}}}
  }
 }
 function update(next){
  need(!destroyed,'This guided editor is closed.');
  need(plain(next)&&(!next.work||ACTIONS[next.collection]),'Choose one of the five original interpretation collections.');
  const previous=context;context={...next};
  if(next.work){
   need(next.work.file?.sha256&&next.work.extractionSha256&&Array.isArray(next.work.extraction?.pages)&&next.work.extraction.pages.length,'Open the complete original working copy.');
   if(!form&&!retaining&&!next.rawDirty)form=originalSelection(next.work,next.collection,next.selection);
   else if(form&&!form.dirty&&!retaining&&!next.rawDirty&&stale())form=originalSelection(next.work,next.collection,next.selection);
  }
  // Preserve current in-progress values across the parent's CAS/busy render.
  if(previous===next)return;render();
 }
 function restoreDraft(snapshot){
  need(!destroyed,'This guided editor is closed.');
  if(snapshot===null||snapshot===undefined)return false;
  need(plain(snapshot)&&snapshot.schema===PDF_GUIDED_FORM_SCHEMA&&typeof snapshot.formId==='string'&&typeof snapshot.workingCopyId==='string'&&/^[a-f0-9]{64}$/.test(snapshot.pdfSha256||'')&&/^[a-f0-9]{64}$/.test(snapshot.extractionSha256||'')&&Number.isInteger(snapshot.baseRevision)&&snapshot.baseRevision>=0&&ACTIONS[snapshot.collection]&&plain(snapshot.value)&&plain(snapshot.selection)&&['new','existing'].includes(snapshot.selection.mode)&&['string','number'].includes(typeof snapshot.selection.key)&&typeof snapshot.dirty==='boolean'&&(snapshot.baseValue===null||plain(snapshot.baseValue)),'Open a complete retained guided form with its original bindings.');
  if(form?.dirty&&!same(form,snapshot))throw new Error('Preserve the current unretained form before restoring another.');
  form=copy(snapshot);form.view={itemSearch:'',itemOffset:0,...(plain(snapshot.view)?snapshot.view:{})};form.view.itemSearch=String(form.view.itemSearch||'');form.view.itemOffset=Number.isSafeInteger(form.view.itemOffset)&&form.view.itemOffset>=0?form.view.itemOffset:0;
  error='';notice='Retained guided form reopened. Its original revision and source bindings remain enforced.';render();return true;
 }
 return {update,restoreDraft,discardDraft(){need(!retaining&&!context?.busy,'Finish the original retaining operation before discarding a form.');onFormDraft(null);form=null;error='';notice='Previous form discarded explicitly. Choose the intended original record or a new proposal.';render();},exportDraft:()=>form?copy(form):null,hasUnretainedChanges:()=>!!form?.dirty,destroy(){destroyed=true;root.remove();context=null;form=null;}};
}
