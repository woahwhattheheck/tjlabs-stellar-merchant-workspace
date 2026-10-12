// Statement source mapping and reviewed cash receiving in the existing Operations case.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=value=>structuredClone(value);
const json=value=>JSON.stringify(value,null,2);
const categories=['OTHER','GRANT','INVOICE','CUSTOMER','CAPITAL','REFUND'];
const choice=values=>values.map(value=>[value,value]);
const label=value=>String(value??'').toLowerCase().replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const maximumSource=8*1024*1024;
const pageSize=50;
const statuses={NEW:'New cash movement',EXISTING:'Already recorded',EXCLUDED:'Excluded',CONFLICT:'Needs correction'};
const definitive=error=>[400,401,403,404,409,413,415,422].includes(error?.status)&&typeof error?.code==='string';

export function statementHeaders(raw,delimiter=','){
  const text=String(raw).replace(/^\uFEFF/,'');
  const fields=[];let value='',quoted=false,closed=false,started=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){
      if(char==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}
      else value+=char;
      continue;
    }
    if(char===delimiter){fields.push(value);value='';closed=false;started=false;continue;}
    if(char==='\r'||char==='\n'){fields.push(value);return checkedHeaders(fields);}
    if(char==='"'&&!started){quoted=true;started=true;continue;}
    if(closed)throw new Error('The header has characters after a closing quote. Check the selected separator or original CSV.');
    value+=char;started=true;
  }
  if(quoted)throw new Error('The CSV header has an unfinished quoted field.');
  fields.push(value);return checkedHeaders(fields);
}
function checkedHeaders(fields){
  if(!fields.length||fields.some(value=>!value.trim()))throw new Error('The statement needs a header with a name for every column.');
  if(new Set(fields).size!==fields.length)throw new Error('The statement header contains duplicate column names.');
  if(fields.length>200)throw new Error('Choose a statement with at most 200 columns.');
  return fields;
}
function base64(buffer){let raw='';const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw);}
function sourceText(value){const raw=atob(value),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
function download(value,filename,type='application/json'){
  const raw=typeof value==='string'?value:json(value)+'\n';
  const url=URL.createObjectURL(new Blob([raw],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function field(title,name,value='',config={}){
  const attrs=' name="'+esc(name)+'"'+(config.required?' required':'')+(config.attrs?' '+config.attrs:'');
  let input;
  if(config.options)input='<select'+attrs+'>'+config.options.map(([id,text])=>'<option value="'+esc(id)+'"'+(String(value??'')===String(id)?' selected':'')+'>'+esc(text)+'</option>').join('')+'</select>';
  else if(config.area)input='<textarea'+attrs+' rows="3">'+esc(value)+'</textarea>';
  else input='<input'+attrs+' value="'+esc(value)+'" type="'+(config.type||'text')+'">';
  return '<label class="'+(config.wide?'statement-wide':'')+'">'+esc(title)+input+(config.help?'<small>'+esc(config.help)+'</small>':'')+'</label>';
}
function button(text,action,disabled=false,attrs=''){
  return '<button type="button" data-statement-action="'+action+'" '+attrs+(disabled?' disabled data-statement-fixed="true"':'')+'>'+esc(text)+'</button>';
}
const table=(headers,rows)=>'<div class="statement-table"><table><thead><tr>'+headers.map(value=>'<th scope="col">'+esc(value)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const detail=(title,value)=>'<details><summary>'+esc(title)+'</summary><pre>'+esc(json(value))+'</pre></details>';
const amount=(value,currency)=>esc(value??'—')+(value===null||value===undefined?'':' '+esc(currency));

function draftStore(){
  let opening;
  function database(){
    if(!opening)opening=new Promise((resolve,reject)=>{
      if(!globalThis.indexedDB){reject(new Error('Browser draft storage is unavailable.'));return;}
      const request=indexedDB.open('sf47-statement-drafts',1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('drafts'))request.result.createObjectStore('drafts');};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Could not open browser draft storage.'));
    });
    return opening;
  }
  return async(key,value)=>{
    const db=await database();
    return new Promise((resolve,reject)=>{
      const writing=value!==undefined,tx=db.transaction('drafts',writing?'readwrite':'readonly'),store=tx.objectStore('drafts');
      const request=writing?store.put(value,key):store.get(key);
      let result;
      request.onsuccess=()=>{result=request.result;};
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(tx.error||request.error||new Error('Could not retain the statement draft.'));
      tx.onabort=()=>reject(tx.error||new Error('The statement draft was not retained.'));
    });
  };
}
const storeDraft=draftStore();

export function mountStatements({container,current,saveApi,session,mutationId,recordingActor,onCase,onCash}){
  const root=document.createElement('section');root.className='statement-desk';root.setAttribute('aria-label','Statement receiving');container.replaceChildren(root);
  if(!document.querySelector('link[data-statement-style]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/operations_statements.css';link.dataset.statementStyle='true';document.head.append(link);
  }
  let active=true,busy=false,hostBusy=false,loading=true,caseValue=current,persistQueue=Promise.resolve(),persistTimer=null;
  const prefix='/api/operations/'+encodeURIComponent(current.program.id);
  const available=()=>active&&root.isConnected;
  const $=selector=>root.querySelector(selector);
  const defaults=()=>({source:null,accountId:'',accountLabel:'',currency:'USD',format:{delimiter:',',decimalMark:'.',groupMark:'',dateFormat:'YYYY-MM-DD',amountMode:'SIGNED',positiveDirection:'IN'},columns:{date:'',reference:'',description:'',amount:'',debit:'',credit:''},defaultCategory:'OTHER',decisions:[]});
  const values={inputs:defaults(),headers:[],preview:null,dirty:true,confirmed:false,page:0,status:'ALL',query:'',pending:null,accepted:null,inflight:null,error:'',notice:'',allocationRow:null,allocationDraft:[]};
  for(const [key,value] of Object.entries(values))if(!Object.hasOwn(session,key))session[key]=value;
  const source=()=>session.inputs.source;
  const locked=()=>loading||busy||hostBusy||!!session.inflight||!!session.pending||!!session.accepted;
  const editable=()=>!locked()&&caseValue.program.state==='OPEN';
  const rowDecision=number=>session.inputs.decisions.find(row=>row.rowNumber===number);
  function snapshot(){return {schema:'sf47.statement-draft.v1',caseId:current.program.id,inputs:clone(session.inputs),headers:clone(session.headers),preview:clone(session.preview),dirty:session.dirty,pending:clone(session.pending),accepted:clone(session.accepted)};}
  async function persist(critical=false){
    const value=snapshot();
    persistQueue=persistQueue.catch(()=>{}).then(()=>storeDraft(current.program.id,value));
    try{await persistQueue;session.storageWarning='';}
    catch(error){
      session.storageWarning='This browser could not save the draft. Download a recovery copy before closing this page.';
      if(critical)throw new Error('The original import request could not be retained. Download a recovery copy, enable this site’s storage, and resume the same request. '+error.message);
    }
  }
  function schedulePersist(){clearTimeout(persistTimer);persistTimer=setTimeout(()=>{persistTimer=null;void persist();},350);}
  function controls(){
    if(!available())return;
    root.setAttribute('aria-busy',String(loading||busy||hostBusy||!!session.inflight));
    root.querySelectorAll('button,input,select,textarea').forEach(el=>{
      const recovery=el.dataset.statementRecovery==='true';
      el.disabled=el.dataset.statementFixed==='true'||loading||busy||hostBusy||!!session.inflight||(!recovery&&!!(session.pending||session.accepted))||(el.dataset.statementWrite==='true'&&caseValue.program.state!=='OPEN');
    });
    const importButton=$('[data-statement-action="import"]');
    if(importButton)importButton.disabled=!editable()||session.dirty||!session.confirmed||!session.preview?.canImport;
    const warning=$('[data-statement-stale]');if(warning)warning.hidden=!session.dirty;
  }
  function changed(){session.dirty=true;session.confirmed=false;session.error='';schedulePersist();controls();}
  function setDecision(number,patch){
    let decision=rowDecision(number);
    if(!decision){decision={rowNumber:number,action:'IMPORT'};session.inputs.decisions.push(decision);}
    Object.assign(decision,patch);changed();
  }
  async function run(action){
    if(!available()||loading||busy||hostBusy||session.inflight)return;
    busy=true;session.error='';controls();
    try{await action();}catch(error){session.error=error.message||String(error);}
    finally{busy=false;void persist();if(available())render();}
  }
  function headersFromSource(guess=false){
    session.headers=source()?statementHeaders(sourceText(source().contentBase64),session.inputs.format.delimiter):[];
    const aliases={date:['date','transactiondate','posteddate','bookingdate'],reference:['transactionid','reference','id','fitid','transactionreference'],description:['description','memo','details','narrative'],amount:['amount','transactionamount'],debit:['debit','debits','withdrawal','withdrawals'],credit:['credit','credits','deposit','deposits'],currency:['currency','ccy'],usdValue:['usdvalue','amountusd']};
    const names=session.headers.map(name=>[name,name.toLowerCase().replace(/[^a-z0-9]/g,'')]);
    for(const key of Object.keys(aliases)){
      if(guess||!session.headers.includes(session.inputs.columns[key]))session.inputs.columns[key]=names.find(([,normal])=>aliases[key].includes(normal))?.[0]||'';
    }
  }
  async function chooseFile(file){
    if(!file)return;
    if(file.size===0||file.size>maximumSource)throw new Error('Choose a nonempty UTF-8 CSV statement up to 8 MiB.');
    const buffer=await file.arrayBuffer();if(!available())return;
    new TextDecoder('utf-8',{fatal:true}).decode(buffer);
    session.inputs.source={filename:file.name,contentBase64:base64(buffer),sourceUrl:'',observedAt:new Date().toISOString()};
    session.inputs.decisions=[];session.preview=null;session.page=0;session.dirty=true;session.confirmed=false;headersFromSource(true);
    session.notice='Read the source file. Review its account, currency and column mapping before previewing.';
    await persist();
  }
  function captureMapping(form){
    const data=new FormData(form),input=session.inputs;
    for(const name of ['accountId','accountLabel','currency','defaultCategory'])input[name]=String(data.get(name)||'').trim();
    input.currency=input.currency.toUpperCase();
    for(const name of ['openingBalance','closingBalance','valuationNote']){const value=String(data.get(name)||'').trim();if(value)input[name]=value;else delete input[name];}
    for(const name of ['delimiter','decimalMark','groupMark','dateFormat','amountMode','positiveDirection'])input.format[name]=String(data.get('format.'+name)??input.format[name]);
    for(const key of ['date','reference','description','amount','debit','credit','currency','usdValue']){const value=data.get('columns.'+key);if(value!==null)input.columns[key]=String(value);}
    if(input.source)input.source.sourceUrl=String(data.get('sourceUrl')||'').trim();
    changed();
  }
  function reviewedInputs(){
    const input=clone(session.inputs);
    if(!input.source)throw new Error('Choose the original statement CSV.');
    if(!input.accountId||!input.accountLabel)throw new Error('Enter a stable account key and a readable account label.');
    if(!input.currency)throw new Error('Enter the statement’s currency or asset symbol.');
    if(!input.columns.date||!input.columns.reference)throw new Error('Map the date and original transaction reference columns.');
    if(input.format.amountMode==='SIGNED'&&!input.columns.amount)throw new Error('Map the signed amount column.');
    if(input.format.amountMode==='DEBIT_CREDIT'&&(!input.columns.debit||!input.columns.credit))throw new Error('Map both debit and credit columns.');
    return input;
  }
  async function preview(){
    const inputs=reviewedInputs(),expectedVersion=caseValue.program.version;
    const result=await saveApi(prefix+'/statement-preview',{expectedVersion,inputs});
    if(result.caseId!==current.program.id||result.expectedVersion!==expectedVersion||result.schema!=='stellar-forge.sf47-statements.v1'||!Array.isArray(result.rows))throw new Error('The preview belongs to another case or version. Refresh the case and preview again.');
    session.preview=result;session.dirty=false;session.confirmed=false;session.page=0;session.allocationRow=null;session.allocationDraft=[];
    session.notice='Reviewed '+result.rows.length+' source rows against the current cash records.';
    await persist();
  }
  async function refresh(){
    const next=await saveApi(prefix);
    if(next.program.id!==current.program.id)throw new Error('The refreshed case has another identity.');
    caseValue=next;
    if(session.preview?.expectedVersion!==next.program.version){session.dirty=true;session.confirmed=false;}
    return next;
  }
  async function finishAccepted(){
    const accepted=session.accepted;if(!accepted)return;
    const result=accepted.result,next=await refresh();
    if(result.id!==next.program.id||next.program.version<result.version||result.action!=='statement.receive'||result.previewSha256!==accepted.payload.data.expectedPreviewSha256)throw new Error('The original import receipt has not reconciled with this case yet.');
    const ids=new Set((next.records.cash||[]).map(row=>row.id));
    if([...(result.cashIds||[]),...(result.existingCashIds||[])].some(id=>!ids.has(id)))throw new Error('A saved statement cash record is missing from the case readback.');
    const sourceIds=new Set(next.sources.map(row=>row.id));
    if((result.sourceIds||[]).some(id=>!sourceIds.has(id)))throw new Error('A retained statement source is missing from the case readback.');
    const original=next.sources.find(row=>row.id===result.recordId);
    if(!original||original.sha256!==result.statementSha256)throw new Error('The saved statement source differs from the import receipt.');
    session.lastReceipt=clone(result);session.accepted=null;session.pending=null;session.preview=null;session.dirty=true;session.confirmed=false;
    session.notice='Imported '+(result.cashIds?.length||0)+' cash movements; '+(result.existingCashIds?.length||0)+' existing records reconciled. Case version '+result.version+'.';
    await persist();
    if(available())await onCase(next,result);
  }
  async function sendPending(){
    const pending=session.pending;if(!pending)return;
    await persist(true);
    if(!available())return;
    const work=(async()=>{
      try{
        const result=await saveApi(prefix+'/command',pending.payload);
        session.accepted={payload:pending.payload,result};session.pending=null;await persist();return result;
      }catch(error){
        if(definitive(error)){session.pending=null;session.dirty=true;session.confirmed=false;session.notice='The case rejected this request. Your source and mapping are retained for correction.';await persist();}
        throw error;
      }
    })();
    session.inflight=work;controls();
    try{await work;}finally{if(session.inflight===work)session.inflight=null;}
    if(available())await finishAccepted();
  }
  async function importReviewed(){
    if(caseValue.program.state!=='OPEN'||session.pending||session.accepted)throw new Error('Reopen the case and finish its current import before recording another statement.');
    if(!session.preview?.canImport||session.dirty||!session.confirmed)throw new Error('Review a current preview and confirm its cash movements before importing.');
    const payload={expectedVersion:session.preview.expectedVersion,actor:recordingActor(),note:'Imported reviewed statement '+source().filename,action:'statement.receive',data:{inputs:reviewedInputs(),expectedPreviewSha256:session.preview.previewSha256}};
    payload.requestId=await mutationId('operations:'+current.program.id,payload);
    session.pending={payload,createdAt:new Date().toISOString()};await persist(true);
    await sendPending();
  }

  function sourcePage(){
    const input=session.inputs,format=input.format,columns=input.columns,options=[['','Select a column'],...session.headers.map(name=>[name,name])];
    const optional=[['','Not mapped'],...session.headers.map(name=>[name,name])];
    const mapping=(text,key,required=true)=>field(text,'columns.'+key,columns[key]||'',{options:required?options:optional,required});
    return '<section class="statement-panel"><h4>1. Choose the statement and account</h4>'+
      '<label>Original statement CSV<input type="file" data-statement-file accept=".csv,.tsv,text/csv,text/tab-separated-values"><small>UTF-8, including a UTF-8 byte-order mark. The original bytes are retained when imported.</small></label>'+
      (source()?'<p class="statement-file"><strong>'+esc(source().filename)+'</strong> · '+esc(session.headers.length)+' columns loaded.</p>':'<p class="statement-empty">Choose a statement to map its columns.</p>')+
      '<form data-statement-mapping><div class="statement-fields">'+
      field('Account key','accountId',input.accountId,{required:true,help:'A stable, nonsecret name for this account. Reuse it for overlapping statements; use a different key for each account.'})+
      field('Account label','accountLabel',input.accountLabel,{required:true,help:'A readable label, such as Project operating account.'})+
      field('Statement currency / asset','currency',input.currency,{required:true,help:'One currency per file. Quantities remain in this original currency.'})+
      field('Original source URL','sourceUrl',source()?.sourceUrl||'',{wide:true,help:'Optional public or authorized source location, without credentials in the URL.'})+
      '</div><h4>2. Map the source format</h4><div class="statement-fields">'+
      field('Column separator','format.delimiter',format.delimiter,{options:[[',','Comma'],[';','Semicolon'],['\t','Tab'],['|','Pipe']]})+
      field('Decimal mark','format.decimalMark',format.decimalMark,{options:[['.','Period (1234.56)'],[',','Comma (1234,56)']]})+
      field('Grouping mark','format.groupMark',format.groupMark,{options:[['','None'],[',','Comma'],['.','Period'],[' ','Space'],["'","Apostrophe"]]})+
      field('Date format','format.dateFormat',format.dateFormat,{options:choice(['YYYY-MM-DD','MM/DD/YYYY','DD/MM/YYYY','YYYY/MM/DD'])})+
      field('Amount columns','format.amountMode',format.amountMode,{options:[['SIGNED','One signed amount'],['DEBIT_CREDIT','Separate debit and credit']]})+
      field('Positive signed amounts','format.positiveDirection',format.positiveDirection,{options:[['IN','Money received'],['OUT','Money paid']]})+
      mapping('Transaction date','date')+mapping('Original transaction reference','reference')+
      mapping('Description','description',false)+
      (format.amountMode==='SIGNED'?mapping('Signed amount','amount'):mapping('Debit amount','debit')+mapping('Credit amount','credit'))+
      mapping('Currency column','currency',false)+
      field('Default cash category','defaultCategory',input.defaultCategory,{options:categories.map(value=>[value,label(value)])})+
      (input.currency!=='USD'?mapping('Recorded USD value','usdValue',false)+field('USD valuation basis','valuationNote',input.valuationNote||'',{wide:true,area:true,help:'Optional explicit valuation from the source. The importer does not calculate an exchange rate.'}):'')+
      '</div><h4>3. Reconcile the statement balances</h4><div class="statement-fields">'+
      field('Opening balance','openingBalance',input.openingBalance||'',{attrs:'inputmode="decimal"',help:'Optional signed amount in the statement currency and selected number format.'})+
      field('Closing balance','closingBalance',input.closingBalance||'',{attrs:'inputmode="decimal"',help:'Provide both balances to compare the complete statement movement.'})+
      '</div><div class="statement-actions">'+button('Preview statement','preview',!source(),'class="statement-primary"')+button('Download recovery copy','draft-export',!source(),'data-statement-recovery="true"')+button('Open recovery copy','draft-import',!!(session.pending||session.accepted),'data-statement-recovery="true"')+'</div></form></section>';
  }
  function rowState(row){return {rowNumber:row.rowNumber,action:row.action||'IMPORT',category:row.category,tranche:row.tranche,allocations:row.allocations||[],...rowDecision(row.rowNumber)};}
  function rowTable(){
    const preview=session.preview;if(!preview)return '';
    const needle=session.query.trim().toLowerCase();
    const filtered=preview.rows.filter(row=>(session.status==='ALL'||row.status===session.status)&&(!needle||[row.reference,row.description,row.date,String(row.rowNumber)].join(' ').toLowerCase().includes(needle)));
    const pages=Math.max(1,Math.ceil(filtered.length/pageSize));session.page=Math.min(session.page,pages-1);
    const rows=filtered.slice(session.page*pageSize,(session.page+1)*pageSize);
    return '<div class="statement-review-controls">'+
      field('Review status','reviewStatus',session.status,{options:[['ALL','All rows'],...Object.entries(statuses)]})+
      field('Find reference, description or row','reviewQuery',session.query)+
      '<div class="statement-page">'+button('Apply filter','filter')+button('Previous','previous',session.page===0)+'<span>Page '+(session.page+1)+' of '+pages+' · '+filtered.length+' rows</span>'+button('Next','next',session.page+1>=pages)+'</div></div>'+
      (rows.length?table(['Source row / reference','Date / description','Movement','Cash classification','Review / action'],rows.map(row=>{
        const decision=rowState(row),unchanged=row.status==='EXISTING',category=decision.category||row.category;
        return [
          '<strong>Row '+esc(row.rowNumber)+'</strong><small>'+esc(row.reference||'Missing reference')+'</small>',
          esc(row.date||'—')+'<small>'+esc(row.description||'')+'</small>',
          esc(label(row.direction))+' '+amount(row.amount,row.currency)+(row.currency!=='USD'?'<small>Recorded value: '+amount(row.usdValue,'USD')+'</small>':''),
          '<label>Category<select data-row-category="'+row.rowNumber+'"'+(unchanged?' disabled data-statement-fixed="true"':'')+'>'+categories.map(value=>'<option value="'+value+'"'+(category===value?' selected':'')+'>'+esc(label(value))+'</option>').join('')+'</select></label>'+
          '<label>Tranche<select data-row-tranche="'+row.rowNumber+'"'+(unchanged?' disabled data-statement-fixed="true"':'')+'>'+[['','Unassigned'],['0','0'],['1','1'],['2','2'],['3','3']].map(([value,text])=>'<option value="'+value+'"'+(String(decision.tranche??'')===value?' selected':'')+'>'+text+'</option>').join('')+'</select></label>'+
          button('Invoice allocations','allocations',unchanged,'data-row="'+row.rowNumber+'"')+'<small>'+esc((decision.allocations||row.allocations||[]).length)+' linked invoice allocations</small>',
          '<span class="statement-status">'+esc(statuses[row.status]||row.status)+'</span>'+
          (row.problems||[]).map(problem=>'<small>'+esc(problem)+'</small>').join('')+
          '<label>Use row<select data-row-action="'+row.rowNumber+'"><option value="IMPORT"'+(decision.action!=='EXCLUDE'?' selected':'')+'>Include in review</option><option value="EXCLUDE"'+(decision.action==='EXCLUDE'?' selected':'')+'>Exclude</option></select></label>'+
          '<label>Reason / note<input data-row-reason="'+row.rowNumber+'" value="'+esc(decision.reason||'')+'"></label>'+
          (row.recordId?detail('Existing cash record',{recordId:row.recordId}):'')
        ];
      })):'<p class="statement-empty">No statement rows match this filter.</p>');
  }
  function allocationPage(){
    if(session.allocationRow===null)return '';
    const row=session.preview?.rows.find(row=>row.rowNumber===session.allocationRow);if(!row)return '';
    const invoices=(caseValue.records.invoices||[]).filter(invoice=>invoice.state!=='VOID').map(invoice=>{
      const supplier=(caseValue.records.contributors||[]).find(person=>person.id===invoice.contributorId);
      return [invoice.id,(supplier?.name||'Supplier')+' · '+invoice.number+' · '+invoice.totalUsd+' USD'];
    });
    return '<section class="statement-panel" aria-label="Invoice allocations"><h4>Invoice allocations — source row '+esc(row.rowNumber)+'</h4><p>'+esc(row.reference)+' · '+amount(row.usdValue,'USD')+'</p>'+
      '<form data-statement-allocations>'+session.allocationDraft.map((allocation,i)=>'<div class="statement-fields">'+
        field('Retained supplier invoice','invoice.'+i,allocation.invoiceId||'',{options:[['','Choose an invoice'],...invoices],required:true})+
        field('Allocated USD amount','amount.'+i,allocation.amountUsd||'',{required:true,attrs:'inputmode="decimal"'})+
        '<div class="statement-actions">'+button('Remove allocation','remove-allocation',false,'data-index="'+i+'"')+'</div></div>').join('')+
      '<div class="statement-actions">'+button('Add allocation','add-allocation',session.allocationDraft.length>=200)+'<button type="submit">Apply allocations to review</button>'+button('Cancel','close-allocations')+'</div></form></section>';
  }
  function reviewPage(){
    const preview=session.preview;if(!preview)return '';
    const summary=preview.summary,balance=preview.balance,currency=preview.source.currency;
    const totalCards=[['New records',summary.newCount,'From this reviewed selection'],['Already recorded',summary.existingCount,'Original identities retained'],['Excluded',summary.excludedCount,'Rows left out of import'],['Needs correction',summary.conflictCount,'Resolve or explicitly exclude']];
    const balances={MATCH:'Balances match',MISMATCH:'Balance difference to resolve',NOT_PROVIDED:'Opening and closing balances not supplied',UNAVAILABLE:'Balance comparison unavailable'};
    return '<section class="statement-panel"><h4>4. Review the cash movements</h4>'+
      '<p data-statement-stale class="statement-notice"'+(session.dirty?'':' hidden')+'>The mapping, row decisions or case version changed. Preview again to update this review before importing.</p>'+
      '<div class="statement-summary">'+totalCards.map(([name,value,help])=>'<div><span>'+name+'</span><strong>'+esc(value)+'</strong><small>'+help+'</small></div>').join('')+'</div>'+
      '<p><strong>Statement inflow:</strong> '+amount(summary.inflow,currency)+' · <strong>Outflow:</strong> '+amount(summary.outflow,currency)+' · <strong>Net movement:</strong> '+amount(summary.net,currency)+'</p>'+
      '<p><strong>New cash to import:</strong> '+amount(summary.importInflow,currency)+' in · '+amount(summary.importOutflow,currency)+' out.</p>'+
      '<div class="statement-notice"><strong>'+esc(balances[balance.status]||balance.status)+'</strong>'+
      (balance.status==='NOT_PROVIDED'?'':'<p>Opening '+amount(balance.openingBalance,currency)+' · Calculated closing '+amount(balance.calculatedBalance,currency)+' · Source closing '+amount(balance.closingBalance,currency)+' · Difference '+amount(balance.difference,currency)+'</p>')+'</div>'+
      (preview.findings?.length?'<ul>'+preview.findings.map(finding=>'<li>'+esc(finding.rowNumber?'Row '+finding.rowNumber+': ':'')+esc(finding.message)+'</li>').join('')+'</ul>':'')+
      rowTable()+allocationPage()+
      '<label class="statement-confirm"><input type="checkbox" data-statement-confirm'+(session.confirmed?' checked':'')+'>I reviewed the account, currency, source rows and cash classifications shown above.</label>'+
      '<div class="statement-actions">'+button('Preview updated decisions','preview')+button('Import reviewed cash movements','import',!preview.canImport||session.dirty||!session.confirmed,'class="statement-primary" data-statement-write="true"')+button('Download review','review-export',false,'data-statement-recovery="true"')+'</div>'+
      detail('Original source and review identity',{source:preview.source,caseId:preview.caseId,caseVersion:preview.expectedVersion,previewSha256:preview.previewSha256})+'</section>';
  }
  function recoveryPage(){
    if(session.accepted)return '<section class="statement-panel"><h4>Import accepted</h4><p>The original import has a server receipt. Read the saved case to finish receiving its cash records and sources.</p><div class="statement-actions">'+button('Read saved case','readback',false,'data-statement-recovery="true"')+button('Download recovery copy','draft-export',false,'data-statement-recovery="true"')+'</div></section>';
    if(session.pending)return '<section class="statement-panel"><h4>Resume the original import</h4><p>The exact reviewed request is retained. Resuming sends the same request identity and payload; the case returns its prior result if already saved.</p><div class="statement-actions">'+button('Resume original import','retry',false,'data-statement-recovery="true"')+button('Download recovery copy','draft-export',false,'data-statement-recovery="true"')+'</div></section>';
    return '';
  }
  function render(){
    if(!available())return;
    root.innerHTML='<div class="statement-header"><div><h3>Statement receiving</h3><p class="statement-subtitle">Map an original statement, reconcile its balances and import reviewed cash movements into this grant case.</p></div><div class="statement-actions">'+button('Refresh case','refresh',false,'data-statement-recovery="true"')+button('Open cash records','cash',false,'data-statement-recovery="true"')+'</div></div>'+
      (loading?'<p role="status">Opening the retained statement draft…</p>':'')+
      (session.error?'<p class="statement-error" role="alert">'+esc(session.error)+'</p>':'')+
      (session.notice?'<p class="statement-notice" role="status" aria-live="polite">'+esc(session.notice)+'</p>':'')+
      (session.storageWarning?'<p class="statement-notice">'+esc(session.storageWarning)+'</p>':'')+
      (caseValue.program.state==='CLOSED'?'<p class="statement-notice">This case is closed. Reopen the case to import additional cash movements.</p>':'')+
      recoveryPage()+sourcePage()+reviewPage()+
      (session.lastReceipt?detail('Last statement import',session.lastReceipt):'');
    controls();
  }
  function captureAllocations(form){
    const data=new FormData(form);
    session.allocationDraft=session.allocationDraft.map((row,i)=>({invoiceId:String(data.get('invoice.'+i)||''),amountUsd:String(data.get('amount.'+i)||'').trim()}));
  }
  async function importDraft(file){
    if(!file)return;
    if(session.pending||session.accepted||session.inflight)throw new Error('Finish the retained import before opening another recovery copy.');
    if(file.size>32*1024*1024)throw new Error('Select a recovery copy up to 32 MiB.');
    const saved=JSON.parse(await file.text());
    if(saved.schema!=='sf47.statement-draft.v1'||saved.caseId!==current.program.id||!saved.inputs?.format||!saved.inputs?.columns||!Array.isArray(saved.inputs.decisions))throw new Error('Choose a statement recovery copy for this original case.');
    if(saved.inputs.source?.contentBase64?.length>(maximumSource+2)*4/3+16)throw new Error('The recovery copy contains a statement larger than 8 MiB.');
    if(saved.pending&&saved.accepted)throw new Error('The recovery copy contains conflicting import states.');
    for(const request of [saved.pending?.payload,saved.accepted?.payload].filter(Boolean)){
      if(request.action!=='statement.receive'||typeof request.requestId!=='string'||!request.data?.inputs?.source||!request.data.inputs.format||!request.data.inputs.columns||!Array.isArray(request.data.inputs.decisions)||typeof request.data.expectedPreviewSha256!=='string')throw new Error('The original import request in this recovery copy is invalid.');
      if(request.data.inputs.source.contentBase64?.length>(maximumSource+2)*4/3+16)throw new Error('The retained import contains a statement larger than 8 MiB.');
    }
    const original=saved.pending?.payload||saved.accepted?.payload;
    session.inputs=clone(original?.data.inputs||saved.inputs);session.pending=clone(saved.pending||null);session.accepted=clone(saved.accepted||null);
    session.preview=null;session.dirty=true;session.confirmed=false;session.page=0;headersFromSource();
    session.notice='Opened the source and mapping. Resume a retained request or preview a new review against the current case.';
    await persist(true);
  }
  root.addEventListener('input',event=>{
    const form=event.target.closest('[data-statement-mapping]');
    if(form&&event.target.tagName!=='SELECT')captureMapping(form);
    if(event.target.dataset.rowReason)setDecision(Number(event.target.dataset.rowReason),{reason:event.target.value});
    if(event.target.closest('[data-statement-allocations]'))captureAllocations(event.target.closest('form'));
    if(event.target.name==='reviewQuery')session.query=event.target.value;
  });
  root.addEventListener('change',event=>{
    if(event.target.matches('[data-statement-file]')){void run(()=>chooseFile(event.target.files?.[0]));return;}
    const mapping=event.target.closest('[data-statement-mapping]');
    if(mapping){
      const oldDelimiter=session.inputs.format.delimiter;captureMapping(mapping);
      if(oldDelimiter!==session.inputs.format.delimiter){
        try{headersFromSource();session.inputs.decisions=[];session.preview=null;}catch(error){session.headers=[];session.preview=null;session.error=error.message;}
        render();
      }else if(['format.amountMode','currency'].includes(event.target.name))render();
      return;
    }
    if(event.target.matches('[data-statement-confirm]')){session.confirmed=event.target.checked;controls();return;}
    if(event.target.name==='reviewStatus'){session.status=event.target.value;session.page=0;render();return;}
    if(event.target.dataset.rowAction){setDecision(Number(event.target.dataset.rowAction),{action:event.target.value});return;}
    if(event.target.dataset.rowCategory){setDecision(Number(event.target.dataset.rowCategory),{category:event.target.value});return;}
    if(event.target.dataset.rowTranche){setDecision(Number(event.target.dataset.rowTranche),{tranche:event.target.value===''?null:Number(event.target.value)});return;}
    if(event.target.closest('[data-statement-allocations]'))captureAllocations(event.target.closest('form'));
  });
  root.addEventListener('submit',event=>{
    if(event.target.matches('[data-statement-mapping]')){event.preventDefault();captureMapping(event.target);void run(preview);}
    if(event.target.matches('[data-statement-allocations]')){
      event.preventDefault();captureAllocations(event.target);setDecision(session.allocationRow,{allocations:clone(session.allocationDraft)});session.allocationRow=null;render();
    }
  });
  root.addEventListener('click',event=>{
    const target=event.target.closest('[data-statement-action]');if(!target||target.disabled)return;
    const action=target.dataset.statementAction;
    if(action==='preview'){const form=$('[data-statement-mapping]');if(form)captureMapping(form);}
    if(['add-allocation','remove-allocation'].includes(action)){const form=$('[data-statement-allocations]');if(form)captureAllocations(form);}
    void run(async()=>{
      if(action==='preview')await preview();
      else if(action==='import')await importReviewed();
      else if(action==='retry')await sendPending();
      else if(action==='readback')await finishAccepted();
      else if(action==='refresh'){await refresh();session.notice='Read the current case. Preview again if its version changed.';}
      else if(action==='cash'){await persist();if(available())await onCash();}
      else if(action==='draft-export')download(snapshot(),'statement-recovery.json');
      else if(action==='review-export')download(session.preview,'statement-review.json');
      else if(action==='draft-import'){
        const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
        input.addEventListener('change',()=>{void run(()=>importDraft(input.files?.[0]));},{once:true});input.click();
      }
      else if(action==='filter')session.page=0;
      else if(action==='previous')session.page=Math.max(0,session.page-1);
      else if(action==='next')session.page++;
      else if(action==='allocations'){
        const row=session.preview.rows.find(row=>row.rowNumber===Number(target.dataset.row));
        if(!row)throw new Error('The source row is unavailable. Preview the statement again.');
        session.allocationRow=row.rowNumber;session.allocationDraft=clone(rowDecision(row.rowNumber)?.allocations||row.allocations||[]);
      }
      else if(action==='close-allocations')session.allocationRow=null;
      else if(action==='add-allocation')session.allocationDraft.push({invoiceId:'',amountUsd:''});
      else if(action==='remove-allocation')session.allocationDraft.splice(Number(target.dataset.index),1);
    });
  });
  render();
  const ready=(async()=>{
    if(!session.loaded){
      if(!session.loadingDraft)session.loadingDraft=(async()=>{
        try{
          const saved=await storeDraft(current.program.id);
          if(saved?.schema==='sf47.statement-draft.v1'&&saved.caseId===current.program.id){session.inputs=saved.inputs;session.headers=saved.headers||[];session.preview=saved.preview||null;session.dirty=saved.dirty!==false;session.pending=saved.pending||null;session.accepted=saved.accepted||null;}
        }catch{session.storageWarning='This browser could not open its saved draft. A downloaded recovery copy can be opened here.';}
        session.loaded=true;
      })();
      await session.loadingDraft;
    }
    loading=false;
    if(session.preview?.expectedVersion!==current.program.version){session.dirty=true;session.confirmed=false;}
    if(available())render();
    if(session.inflight){try{await session.inflight;}catch{}if(available())render();}
    if(available()&&session.accepted)await run(finishAccepted);
  })();
  return {root,ready,dispose(){active=false;clearTimeout(persistTimer);if(session.loaded)void persist();},setHostBusy(value){hostBusy=!!value;controls();}};
}
