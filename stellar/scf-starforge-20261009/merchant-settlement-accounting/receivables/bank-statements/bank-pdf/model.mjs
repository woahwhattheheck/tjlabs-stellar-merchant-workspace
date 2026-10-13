// SPDX-License-Identifier: MIT
// Complete PDF statement working copy. Original bytes and PDF.js text never mutate.
export const PDF_SCHEMA='stellar-forge.bank-pdf-working-copy.v1';
export const PDF_EXTRACTION_SCHEMA='stellar-forge.bank-pdf-extraction.v1';
export const PDF_LIMITS=Object.freeze({fileBytes:16_000_000,pages:500,items:500000,rows:50000,transferBytes:192*1024*1024});
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const clone=v=>JSON.parse(JSON.stringify(v));
const fail=(code,message,details={})=>{throw Object.assign(new Error(message),{code,details,status:400});};
const need=(ok,code,message,details)=>{if(!ok)fail(code,message,details);};
const string=(v,label,max=2000)=>{need(typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),'PDF_FIELD','Invalid '+label);return v;};
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const safeName=v=>string(v,'filename',200).replace(/[\/\\\u0000-\u001f]/g,'_')||'statement.pdf';
export const canonical=v=>JSON.stringify(sort(v));
function sort(v){if(Array.isArray(v))return v.map(sort);if(!plain(v))return v;return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));}
export async function digest(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function encodeBase64(bytes){let out='';for(let i=0;i<bytes.length;i+=32768)out+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(out);}
export function decodeBase64(value){
 need(typeof value==='string'&&value.length>0&&value.length<=Math.ceil(PDF_LIMITS.fileBytes/3)*4&&value.length%4===0,'PDF_BYTES','Provide complete original base64 PDF bytes');
 const padding=value.endsWith('==')?2:value.endsWith('=')?1:0,end=value.length-padding;
 for(let i=0;i<end;i++){const c=value.charCodeAt(i);need((c>=65&&c<=90)||(c>=97&&c<=122)||(c>=48&&c<=57)||c===43||c===47,'PDF_BYTES','Provide complete original base64 PDF bytes');}
 need((value.length/4)*3-padding<=PDF_LIMITS.fileBytes,'PDF_BYTES','Original PDF exceeds the 16,000,000-byte file limit');
 const raw=atob(value),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 need(bytes.length>0&&bytes.length<=PDF_LIMITS.fileBytes&&encodeBase64(bytes)===value,'PDF_BYTES','Original PDF exceeds the 16,000,000-byte file limit or is not canonical base64');return bytes;
}
export function dateValue(value,format='YMD',yearRule=null){
 const raw=String(value??'').trim(),m=raw.match(/^(\d{1,4})([-/.])(\d{1,2})(?:\2(\d{1,4}))?$/);
 need(m&&['YMD','MDY','DMY'].includes(format),'PDF_DATE','Choose a complete source calendar date and its explicit interpretation',{raw,format});
 let year,month,day;
 if(!m[4]){need(format!=='YMD'&&Number.isInteger(yearRule?.year),'PDF_DATE_YEAR','A printed date without its year requires an explicit statement year');year=yearRule.year;[month,day]=format==='MDY'?[+m[1],+m[3]]:[+m[3],+m[1]];}
 else if(format==='YMD'){need(m[1].length===4,'PDF_DATE_YEAR','YMD dates require a four-digit year');[year,month,day]=[+m[1],+m[3],+m[4]];}
 else {year=+m[4];[month,day]=format==='MDY'?[+m[1],+m[3]]:[+m[3],+m[1]];if(m[4].length===2){need(Number.isInteger(yearRule?.century)&&yearRule.century>=1600&&yearRule.century<=9900&&yearRule.century%100===0,'PDF_DATE_YEAR','Two-digit source years require an explicit century');year+=yearRule.century;}else need(m[4].length===4,'PDF_DATE_YEAR','Use a four-digit year or explicit two-digit century');}
 need(year>=1600&&year<=9999&&month>=1&&month<=12&&day>=1&&day<=31,'PDF_DATE','Invalid calendar date',{raw});
 const date=new Date(Date.UTC(year,month-1,day));need(date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day,'PDF_DATE','Invalid calendar date',{raw});
 return String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}
export function amountValue(value,{decimalSeparator='.',groupSeparator=',',scale=2,parenthesesNegative=true,prefix='',suffix=''}={}){
 need(['.',','].includes(decimalSeparator)&&['',',','.',' ','\u00a0',"'"].includes(groupSeparator)&&groupSeparator!==decimalSeparator&&Number.isInteger(scale)&&scale>=0&&scale<=8,'PDF_AMOUNT_FORMAT','Choose a decimal separator, distinct group separator and currency scale');
 let raw=String(value??'').trim(),negative=false,signed=false;
 need(typeof prefix==='string'&&typeof suffix==='string'&&prefix.length<=12&&suffix.length<=12&&!/[0-9\u0000-\u001f]/.test(prefix+suffix),'PDF_AMOUNT_AFFIX','Choose explicit nonnumeric currency prefix/suffix text');
 need(raw.length>0&&raw.length<=100,'PDF_AMOUNT','Provide the original amount text');
 if(/^\(.*\)$/.test(raw)){need(parenthesesNegative,'PDF_AMOUNT','Parenthesized amount needs the explicit negative interpretation');negative=true;signed=true;raw=raw.slice(1,-1).trim();}
 if(/^[+-]/.test(raw)){need(!signed,'PDF_AMOUNT','Amount has two signs');signed=true;negative=raw[0]==='-';raw=raw.slice(1);}
 if(prefix&&raw.startsWith(prefix))raw=raw.slice(prefix.length).trim();
 if(suffix&&raw.endsWith(suffix))raw=raw.slice(0,-suffix.length).trim();
 if(/^[+-]/.test(raw)){need(!signed,'PDF_AMOUNT','Amount has two signs');signed=true;negative=raw[0]==='-';raw=raw.slice(1);}
 const pieces=raw.split(decimalSeparator);need(pieces.length<=2,'PDF_AMOUNT','Amount contains repeated decimal separators');
 let whole=pieces[0],fraction=pieces[1]??'';
 if(groupSeparator&&whole.includes(groupSeparator)){const groups=whole.split(groupSeparator);need(/^\d{1,3}$/.test(groups[0])&&groups.slice(1).every(x=>/^\d{3}$/.test(x)),'PDF_AMOUNT','Amount grouping is not valid');whole=groups.join('');}
 need(/^\d+$/.test(whole)&&/^\d*$/.test(fraction)&&fraction.length<=scale,'PDF_AMOUNT','Amount must be exact decimal text within the selected scale',{value,scale});
 let minor=BigInt(whole+fraction.padEnd(scale,'0'));if(negative)minor=-minor;return fromMinor(minor,scale);
}
export function toMinor(value,scale){need(typeof value==='string'&&/^-?\d+(?:\.\d+)?$/.test(value),'PDF_AMOUNT','Expected canonical exact amount');const negative=value[0]==='-',parts=(negative?value.slice(1):value).split('.');need((parts[1]??'').length<=scale,'PDF_AMOUNT_SCALE','Amount exceeds selected currency scale');return(negative?-1n:1n)*BigInt(parts[0]+(parts[1]??'').padEnd(scale,'0'));}
export function fromMinor(value,scale){const sign=value<0n?'-':'',digits=(value<0n?-value:value).toString().padStart(scale+1,'0');return sign+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits);}
export function boxValue(value,page){
 need(Array.isArray(value)&&value.length===4&&value.every(finite),'PDF_REGION','Provide an original page rectangle [left, top, right, bottom]');
 const [x1,y1,x2,y2]=value;need(x1>=0&&y1>=0&&x2>x1&&y2>y1&&x2<=page.width+0.1&&y2<=page.height+0.1,'PDF_REGION','Region must lie within the original displayed page');return [...value];
}
export function pageByNumber(work,page){const found=work.extraction.pages.find(p=>p.number===Number(page));need(found,'PDF_PAGE','The original page does not exist');return found;}
export function sourceText(work,source){
 const page=pageByNumber(work,source.page),ids=new Set(source.itemIds??[]);
 need(ids.size===(source.itemIds??[]).length,'PDF_SOURCE','Original text item references repeat');
 const items=page.items.filter(x=>ids.has(x.id));need(items.length===ids.size,'PDF_SOURCE','A reference does not belong to this original page');
 return items.sort((a,b)=>a.index-b.index).map(x=>x.text).join(' ');
}
function sourceRef(work,value){
 need(plain(value),'PDF_SOURCE','Retain the original page location');
 const page=pageByNumber(work,value.page),box=boxValue(value.box,page),itemIds=[...(value.itemIds??[])];
 const text=sourceText(work,{page:page.number,itemIds});
 return{page:page.number,box,itemIds,text,pdfSha256:work.file.sha256,extractionSha256:work.extractionSha256};
}
export async function createWorkingCopy({name,file,extraction}){
 const bytes=decodeBase64(file.dataBase64);need(new TextDecoder('latin1').decode(bytes.subarray(0,1024)).includes('%PDF-'),'PDF_HEADER','The original file is not a PDF');
 const hash=await digest(bytes);need(!file.sha256||hash===file.sha256,'PDF_HASH','Original PDF bytes differ from their retained identity');
 validateExtraction(extraction);
 const work={schema:PDF_SCHEMA,id:crypto.randomUUID(),revision:0,name:string(name||file.name||'Statement review','name',250),createdAt:new Date().toISOString(),
  file:{name:safeName(file.name),type:'application/pdf',bytes:bytes.length,sha256:hash,dataBase64:file.dataBase64},
  extraction:clone(extraction),extractionSha256:await digest(canonical(extraction)),accounts:[],regions:[],rows:[],balances:[],pageReviews:[],history:[],bankImports:[]};
 checkTransferSize(work);return work;
}
export function validateExtraction(extraction){
 need(plain(extraction)&&extraction.schema===PDF_EXTRACTION_SCHEMA&&extraction.engine?.name==='PDF.js'&&typeof extraction.engine.version==='string','PDF_EXTRACTION','Use the full original PDF.js page extraction');
 need(Array.isArray(extraction.pages)&&extraction.pages.length>0&&extraction.pages.length<=PDF_LIMITS.pages,'PDF_PAGES','Use one to 500 complete original pages');
 let total=0;const ids=new Set();
 extraction.pages.forEach((page,index)=>{
  need(page.number===index+1&&finite(page.width)&&finite(page.height)&&page.width>0&&page.height>0&&Array.isArray(page.items),'PDF_PAGE','Original page order and geometry must be complete');
  for(const item of page.items){need(item.id==='p'+page.number+'-i'+item.index&&!ids.has(item.id)&&Number.isInteger(item.index)&&item.index>=0,'PDF_TEXT_ID','Original page text identity is invalid');ids.add(item.id);string(item.text,'original page text',200000);need(Array.isArray(item.transform)&&item.transform.length===6&&item.transform.every(finite)&&Array.isArray(item.box)&&item.box.length===4&&item.box.every(finite),'PDF_TEXT_GEOMETRY','Original text geometry is invalid');}
  total+=page.items.length;
 });need(total<=PDF_LIMITS.items,'PDF_TEXT_LIMIT','Original extraction exceeds 500,000 text items');
}
function accountValue(value){
 need(plain(value),'PDF_ACCOUNT','Provide an explicit account');
 const account={id:string(value.id||crypto.randomUUID(),'account id',100),name:string(value.name,'account name',160),bankId:string(value.bankId,'institution identifier',255),
  accountId:string(value.accountId,'printed account identifier',255),branchId:string(value.branchId||'','branch identifier',255),
  accountType:string(value.accountType||'CHECKING','account type',100),currency:string(value.currency||'','currency',3),scale:Number(value.scale??2),
  from:dateValue(value.from),until:dateValue(value.until),note:string(value.note||'','account interpretation',4000)};
 need(account.name.trim()&&account.bankId.trim()&&account.accountId.trim()&&/^[A-Z]{3}$/.test(account.currency)&&Number.isInteger(account.scale)&&account.scale>=0&&account.scale<=6&&account.from<=account.until,'PDF_ACCOUNT','Provide institution, printed account, currency, scale and ordered period');return account;
}
export function editWorkingCopy(work,action,value,{actor,reason}={}){
 need(work?.schema===PDF_SCHEMA,'PDF_WORKSPACE','Open a complete original PDF working copy');
 actor=string(actor||'','reviewer',160).trim();reason=string(reason||'','reason',4000).trim();need(actor&&reason,'PDF_REVIEW_REASON','Name the reviewer and describe the interpretation or correction');
 const next=clone(work),before={};let after;
 if(action==='ACCOUNT'){
  const row=accountValue(value),index=next.accounts.findIndex(x=>x.id===row.id);before.value=index>=0?next.accounts[index]:null;
  if(index<0)next.accounts.push(row);else next.accounts[index]=row;after=row;
 }else if(action==='REGION'){
  const account=next.accounts.find(x=>x.id===value.accountId);need(account,'PDF_ACCOUNT','Select an explicit account for the table');
  const page=pageByNumber(next,value.page),row={id:value.id||crypto.randomUUID(),accountId:account.id,page:page.number,box:boxValue(value.box,page),
   columns:clone(value.columns),dateFormat:value.dateFormat||'MDY',yearRule:clone(value.yearRule??null),
   amountMode:value.amountMode||'DEBIT_CREDIT',amountPrefix:string(value.amountPrefix||'','currency prefix',12),amountSuffix:string(value.amountSuffix||'','currency suffix',12),decimalSeparator:value.decimalSeparator??'.',groupSeparator:value.groupSeparator??',',
   lineTolerance:Number(value.lineTolerance??2),descriptionContinuation:value.descriptionContinuation===true,negativeMeans:value.negativeMeans||'DEBIT'};
  need(plain(row.columns)&&Object.keys(row.columns).every(k=>['date','debit','credit','amount','description','reference','balance'].includes(k)),'PDF_COLUMNS','Map explicit original column rectangles');
  for(const [key,range]of Object.entries(row.columns))need(Array.isArray(range)&&range.length===2&&range.every(finite)&&range[0]>=row.box[0]&&range[1]<=row.box[2]&&range[1]>range[0],'PDF_COLUMNS','Column must lie inside its table region',{key});
  need(row.columns.date&&(row.amountMode==='SIGNED'?row.columns.amount:row.columns.debit&&row.columns.credit)&&['SIGNED','DEBIT_CREDIT'].includes(row.amountMode)&&['DEBIT','CREDIT'].includes(row.negativeMeans)&&finite(row.lineTolerance)&&row.lineTolerance>=0.1&&row.lineTolerance<=20,'PDF_COLUMNS','Map a date and exact signed or debit/credit amount columns');
  const index=next.regions.findIndex(x=>x.id===row.id),oldRegion=index>=0?next.regions[index]:null,affected=next.rows.filter(item=>item.regionId===row.id);
  before.value={region:clone(oldRegion),rows:clone(affected)};
  if(index<0)next.regions.push(row);else next.regions[index]=row;
  if(oldRegion&&canonical(oldRegion)!==canonical(row))for(const item of affected){item.decision='REVIEW';item.note=(item.note?item.note+'\n':'')+'Original table interpretation changed; regenerate or explicitly review this source row.';}
  after={region:row,rows:clone(affected)};
 }else if(action==='ROWS'){
  need(Array.isArray(value),'PDF_ROWS','Provide original row edits');
  const existingIds=new Set(next.rows.map(row=>row.id));need(value.length<=PDF_LIMITS.rows&&next.rows.length+value.filter(row=>!row.id||!existingIds.has(row.id)).length<=PDF_LIMITS.rows,'PDF_ROW_LIMIT','Keep at most 50,000 reviewed rows');
  before.value=[];after=[];
  for(const input of value){
   const account=next.accounts.find(x=>x.id===input.accountId);need(account,'PDF_ACCOUNT','Each row needs an explicit account');
   const source=sourceRef(next,input.source),id=input.id||crypto.randomUUID(),index=next.rows.findIndex(x=>x.id===id),decision=input.decision||'REVIEW';
   need(['REVIEW','INCLUDE','EXCLUDE'].includes(decision),'PDF_ROW_DECISION','Review, include or exclude each row explicitly');
   const row={id,accountId:account.id,regionId:input.regionId||null,source,raw:clone(input.raw??{}),decision,
    postedDate:String(input.postedDate||''),amount:String(input.amount??''),payee:string(input.payee||'','payee',500),
    memo:string(input.memo||'','memo',4000),reference:string(input.reference||'','reference',250),
    runningBalance:String(input.runningBalance??''),note:string(input.note||'','row reason',4000)};
   if(decision==='INCLUDE'){row.postedDate=dateValue(row.postedDate);row.amount=amountValue(row.amount,{decimalSeparator:'.',groupSeparator:'',scale:account.scale});need(row.postedDate>=account.from&&row.postedDate<=account.until,'PDF_ROW_PERIOD','Included row is outside the explicitly selected account period');if(row.runningBalance)row.runningBalance=amountValue(row.runningBalance,{groupSeparator:'',scale:account.scale});}
   if(decision==='EXCLUDE')need(row.note.trim(),'PDF_EXCLUSION_REASON','An excluded original row needs a reason');
   before.value.push(index>=0?clone(next.rows[index]):null);if(index<0)next.rows.push(row);else next.rows[index]=row;after.push(row);
  }
 }else if(action==='BALANCE'){
  const account=next.accounts.find(x=>x.id===value.accountId);need(account,'PDF_ACCOUNT','Select the balance account');
  const row={id:value.id||crypto.randomUUID(),accountId:account.id,kind:value.kind,date:dateValue(value.date),amount:amountValue(value.amount,{groupSeparator:'',scale:account.scale}),
   source:sourceRef(next,value.source),raw:string(value.raw||value.amount,'printed balance',250),selected:value.selected===true,note:string(value.note||'','balance interpretation',4000)};
  need(['OPENING','CLOSING','RUNNING','OTHER'].includes(row.kind),'PDF_BALANCE','Choose the original balance meaning');const index=next.balances.findIndex(x=>x.id===row.id);before.value=index>=0?next.balances[index]:null;if(index<0)next.balances.push(row);else next.balances[index]=row;after=row;
 }else if(action==='PAGE_REVIEW'){
  const page=pageByNumber(next,value.page),row={page:page.number,disposition:value.disposition,note:string(value.note||'','page review',4000)};
  need(['CASH_MAPPED','OTHER_ACCOUNT','INFORMATION','MANUAL_REVIEW','MANUAL_MAPPED'].includes(row.disposition),'PDF_PAGE_REVIEW','Classify each original page');need(row.note.trim(),'PDF_PAGE_REVIEW','Describe the page coverage or exclusion');
  const index=next.pageReviews.findIndex(x=>x.page===row.page);before.value=index>=0?next.pageReviews[index]:null;if(index<0)next.pageReviews.push(row);else next.pageReviews[index]=row;after=row;
 }else if(action==='BANK_IMPORT'){
  need(plain(value)&&typeof value.workspaceId==='string'&&typeof value.importId==='string'&&typeof value.requestId==='string'&&/^[a-f0-9]{64}$/.test(value.csvSha256||''),'PDF_BANK_RECEIPT','Retain the actual original bank workspace, request and import');
  const row=clone(value);need(!next.bankImports.some(x=>x.workspaceId===row.workspaceId&&x.importId===row.importId),'PDF_BANK_RECEIPT_EXISTS','This exact original import is already recorded');before.value=null;next.bankImports.push(row);after=row;
 }else fail('PDF_ACTION','Unknown PDF working-copy operation');
 next.revision++;next.history.push({revision:next.revision,action,actor,reason,at:new Date().toISOString(),before:before.value,after:clone(after)});
 checkTransferSize(next);return next;
}
export function candidateRows(work,region){
 const account=work.accounts.find(x=>x.id===region.accountId);need(account,'PDF_ACCOUNT','Select an existing account');
 const page=pageByNumber(work,region.page),box=boxValue(region.box,page),items=page.items.filter(item=>{const [x1,y1,x2,y2]=item.box;return(x1+x2)/2>=box[0]&&(x1+x2)/2<=box[2]&&(y1+y2)/2>=box[1]&&(y1+y2)/2<=box[3]&&item.text.trim();});
 const lines=[];
 for(const item of items.sort((a,b)=>(a.box[1]+a.box[3]-b.box[1]-b.box[3])/2||a.box[0]-b.box[0])){
  const center=(item.box[1]+item.box[3])/2;let line=lines.at(-1);if(!line||Math.abs(center-line.center)>region.lineTolerance){line={center,items:[]};lines.push(line);}line.items.push(item);
 }
 const rows=[];
 for(const line of lines){
  const ordered=line.items.sort((a,b)=>a.box[0]-b.box[0]),raw={};
  for(const [field,range]of Object.entries(region.columns)){raw[field]=ordered.filter(item=>{const center=(item.box[0]+item.box[2])/2;return center>=range[0]&&center<range[1];}).map(item=>item.text).join(' ').trim();}
  const source={page:page.number,box:[Math.max(0,Math.min(...ordered.map(x=>x.box[0]))),Math.max(0,Math.min(...ordered.map(x=>x.box[1]))),Math.min(page.width,Math.max(...ordered.map(x=>x.box[2]))),Math.min(page.height,Math.max(...ordered.map(x=>x.box[3])))],itemIds:ordered.map(x=>x.id)};
  const errors=[];let postedDate='',amount='',balance='';
  try{postedDate=dateValue(raw.date,region.dateFormat,region.yearRule);}catch(error){errors.push(error.message);}
  const format={decimalSeparator:region.decimalSeparator,groupSeparator:region.groupSeparator,scale:account.scale,prefix:region.amountPrefix||'',suffix:region.amountSuffix||''};
  try{
   if(region.amountMode==='SIGNED'){amount=amountValue(raw.amount,format);if(region.negativeMeans==='CREDIT')amount=fromMinor(-toMinor(amount,account.scale),account.scale);}
   else {const debit=raw.debit?toMinor(amountValue(raw.debit,format),account.scale):0n,credit=raw.credit?toMinor(amountValue(raw.credit,format),account.scale):0n;need(debit>=0n&&credit>=0n&&!(raw.debit&&raw.credit),'PDF_AMOUNT_COLUMNS','Choose a single nonnegative debit or credit for this original row');need(raw.debit||raw.credit,'PDF_AMOUNT','The original line has no mapped amount');amount=fromMinor(credit-debit,account.scale);}
   if(raw.balance)balance=amountValue(raw.balance,format);
  }catch(error){errors.push(error.message);}
  if(!raw.date&&region.descriptionContinuation&&raw.description&&!raw.debit&&!raw.credit&&!raw.amount&&!raw.balance&&rows.length){
   const previous=rows.at(-1);previous.memo+=(previous.memo?' ':'')+raw.description;previous.source.itemIds.push(...source.itemIds);previous.source.box[3]=source.box[3];previous.raw.continuation??=[];previous.raw.continuation.push(raw);continue;
  }
  rows.push({id:'r-'+region.id+'-'+ordered[0].index,accountId:account.id,regionId:region.id,source,raw,postedDate,amount,runningBalance:balance,payee:'',memo:raw.description||'',reference:raw.reference||'',decision:'REVIEW',note:'',errors});
 }
 return rows;
}
export function accountReview(work,accountId){
 const account=work.accounts.find(x=>x.id===accountId);need(account,'PDF_ACCOUNT','Select an existing account');const problems=[];
 const rows=work.rows.filter(x=>x.accountId===account.id),included=rows.filter(x=>x.decision==='INCLUDE'),review=rows.filter(x=>x.decision==='REVIEW');
 if(review.length)problems.push({code:'UNREVIEWED_ROWS',message:review.length+' original rows still require review',rowIds:review.map(x=>x.id)});
 if(!included.length)problems.push({code:'NO_CASH_ROWS',message:'This account has no included cash movements'});
 const missingPages=work.extraction.pages.filter(x=>!work.pageReviews.some(y=>y.page===x.number));if(missingPages.length)problems.push({code:'UNREVIEWED_PAGES',message:'Review every original page',pages:missingPages.map(x=>x.number)});
 const pendingPages=work.pageReviews.filter(x=>x.disposition==='MANUAL_REVIEW');if(pendingPages.length)problems.push({code:'PAGES_AWAITING_MANUAL_REVIEW',message:'Complete manual review of the marked original pages',pages:pendingPages.map(x=>x.page)});
 const opening=work.balances.filter(x=>x.accountId===account.id&&x.selected&&x.kind==='OPENING'),closing=work.balances.filter(x=>x.accountId===account.id&&x.selected&&x.kind==='CLOSING');
 if(opening.length!==1||closing.length!==1)problems.push({code:'BALANCE_SELECTION',message:'Select exactly one original opening and closing balance for this account'});
 let movement=0n;const seen=new Map(),anchors=new Map();
 for(const row of included){
  const anchor=canonical({page:row.source.page,itemIds:[...row.source.itemIds].sort(),...(row.source.itemIds.length?{}:{box:row.source.box})});
  if(anchors.has(anchor))problems.push({code:'SOURCE_ROW_IDENTITY_OVERLAP',message:'The same original page location would create two cash rows',rowIds:[anchors.get(anchor),row.id]});anchors.set(anchor,row.id);
  try{dateValue(row.postedDate);movement+=toMinor(row.amount,account.scale);need(row.postedDate>=account.from&&row.postedDate<=account.until,'PDF_ROW_PERIOD','Included row is outside its account period');}catch(error){problems.push({code:error.code||'ROW_VALUE',message:error.message,rowId:row.id});}
  for(const id of row.source.itemIds){if(seen.has(id))problems.push({code:'SOURCE_OVERLAP',message:'The same original text item is included in more than one cash row',rowIds:[seen.get(id),row.id],itemId:id});seen.set(id,row.id);}
 }
 let calculated=null,difference=null;if(opening.length===1&&closing.length===1){calculated=fromMinor(toMinor(opening[0].amount,account.scale)+movement,account.scale);difference=fromMinor(toMinor(closing[0].amount,account.scale)-toMinor(calculated,account.scale),account.scale);if(toMinor(difference,account.scale)!==0n)problems.push({code:'ORIGINAL_BALANCE_DIFFERENCE',message:'The selected original balances and reviewed movements do not reconcile',difference});}
 return{account:clone(account),included:included.length,excluded:rows.filter(x=>x.decision==='EXCLUDE').length,unreviewed:review.length,movement:fromMinor(movement,account.scale),opening:opening[0]??null,closing:closing[0]??null,calculatedClosing:calculated,difference,problems,ready:!problems.length,
  receivable:!problems.some(x=>x.code!=='ORIGINAL_BALANCE_DIFFERENCE')};
}
function csvCell(v){return '"'+String(v??'').replaceAll('"','""')+'"';}
export function bankSourceDraft(work,accountId,{acknowledgeBalanceDifference=false}={}){
 const review=accountReview(work,accountId);need(review.receivable,'PDF_REVIEW_INCOMPLETE','Complete all original pages, account mapping, row review and balance selection',{problems:review.problems});
 need(!review.problems.length||acknowledgeBalanceDifference,'PDF_BALANCE_ACK','The original statement does not reconcile. Explicitly retain that difference for the Bank review.',{problems:review.problems});
 const account=review.account,rows=work.rows.filter(x=>x.accountId===accountId&&x.decision==='INCLUDE'),header=['Date','Amount','Description','Reference','Running balance','PDF source','PDF page','PDF text items','PDF row id'];
 const output=[header],rowMap=[];
 for(const row of rows){output.push([row.postedDate,row.amount,row.memo||row.payee,row.reference,row.runningBalance,work.file.sha256,row.source.page,row.source.itemIds.join(' '),row.id]);rowMap.push({recordNumber:output.length,rowId:row.id,source:clone(row.source)});}
 const balanceRecords=[];
 for(const balance of[review.opening,review.closing]){output.push([balance.date,balance.amount,balance.kind,'','',work.file.sha256,balance.source.page,balance.source.itemIds.join(' '),balance.id]);balanceRecords.push({recordNumber:output.length,kind:balance.kind,amountColumn:'Amount',dateColumn:'Date',labelColumn:'Description'});rowMap.push({recordNumber:output.length,balanceId:balance.id,source:clone(balance.source)});}
 const csv=output.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n',csvSha256=null;
 const source={format:'CSV',file:{name:'pdf-'+work.file.sha256.slice(0,12)+'-'+account.id+'.csv',content:csv,encoding:'utf8'},textEncoding:'utf-8',
  csv:{delimiter:',',headerRow:1,dateFormat:'YMD',amountMode:'SIGNED',decimalSeparator:'.',groupSeparator:'',account:{kind:'BANK',bankId:account.bankId,branchId:account.branchId,accountId:account.accountId,accountType:account.accountType,currency:account.currency,namespace:'PDF_REVIEW'},
   columns:{postedDate:'Date',amount:'Amount',memo:'Description',reference:'Reference',balance:'Running balance'},balanceRecords}};
 return{schema:'stellar-forge.bank-pdf-prepared-source.v1',workingCopyId:work.id,workingRevision:work.revision,pdf:clone({...work.file,dataBase64:undefined}),extractionSha256:work.extractionSha256,accountId,source,csvSha256,review,rowMap,
  mapping:{account:review.account,regions:work.regions.filter(x=>x.accountId===accountId),rows,balances:[review.opening,review.closing],pageReviews:work.pageReviews}};
}
export function checkTransferSize(work){const text=canonical(work);need(new TextEncoder().encode(text).length<=PDF_LIMITS.transferBytes,'PDF_TRANSFER_LIMIT','Complete working-copy transfer exceeds 192 MiB');return text;}
export async function openWorkingCopy(text){
 need(typeof text==='string'&&new TextEncoder().encode(text).length<=PDF_LIMITS.transferBytes,'PDF_TRANSFER_LIMIT','Choose a complete PDF working copy up to 192 MiB');let work;try{work=JSON.parse(text);}catch{fail('PDF_JSON','Working-copy file is not complete JSON');}
 need(work?.schema===PDF_SCHEMA&&typeof work.id==='string'&&Number.isSafeInteger(work.revision)&&work.revision>=0,'PDF_WORKSPACE','Unsupported PDF working copy');
 const bytes=decodeBase64(work.file?.dataBase64);need(bytes.length===work.file.bytes&&await digest(bytes)===work.file.sha256,'PDF_HASH','The original PDF failed its retained byte identity');
 validateExtraction(work.extraction);need(await digest(canonical(work.extraction))===work.extractionSha256,'PDF_EXTRACTION_HASH','The original page extraction changed');
 for(const field of['accounts','regions','rows','balances','pageReviews','history','bankImports'])need(Array.isArray(work[field]),'PDF_WORKSPACE','Working-copy collection is missing: '+field);
 need(work.rows.length<=PDF_LIMITS.rows&&work.history.length===work.revision&&work.history.every((x,i)=>x.revision===i+1),'PDF_HISTORY','The complete interpretation history is required');
 const accountIds=new Set();for(const account of work.accounts){accountValue(account);need(!accountIds.has(account.id),'PDF_ACCOUNT','Duplicate account identity');accountIds.add(account.id);}
 for(const row of[...work.rows,...work.balances]){need(accountIds.has(row.accountId),'PDF_ACCOUNT','A retained row has no account');sourceRef(work,row.source);}
 return work;
}

export async function prepareBankSource(work,accountId,options={}){
 const prepared=bankSourceDraft(work,accountId,options);prepared.csvSha256=await digest(prepared.source.file.content);prepared.mappingSha256=await digest(canonical(prepared.mapping));return prepared;
}
export async function pdfSourceInput(work,accountId,options={}){
 const prepared=await prepareBankSource(work,accountId,options),workingCopy=clone(work);delete workingCopy.file.dataBase64;
 return{format:'PDF_REVIEW',file:{name:work.file.name,dataBase64:work.file.dataBase64},
  pdfReview:{workingCopy,accountId,acknowledgeBalanceDifference:options.acknowledgeBalanceDifference===true,
   csvSha256:prepared.csvSha256,mappingSha256:prepared.mappingSha256}};
}
