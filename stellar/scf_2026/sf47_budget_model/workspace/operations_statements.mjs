import {currentStaffContext,staffDeskStorageKey,assertStaffRequestActor} from './staff-session.mjs';
import {mountEarlierStaffDesk} from './staff-desk-recovery.mjs';
import {statementSetupPanel,statementSetupComparison,statementSetupSettings,statementSetupLink,sameSetupValue} from './operations_statement_profiles.mjs';
import {statementMatchingRows,statementSelection,statementBatchPanel,prepareStatementBatch,applyStatementBatch,undoStatementBatch} from './operations_statement_batch.mjs';
// Statement source mapping and reviewed cash receiving in the existing Operations case.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=value=>structuredClone(value);
const json=value=>JSON.stringify(value,null,2);
const categories=['OTHER','GRANT','INVOICE','CUSTOMER','CAPITAL','REFUND'];
const choice=values=>values.map(value=>[value,value]);
const label=value=>String(value??'').toLowerCase().replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const maximumSource=8*1024*1024;
const pageSize=50;
const bankFormat=input=>input?.sourceFormat==='OFX'||input?.sourceFormat==='MT940';
const scaleText=value=>Object.entries(value||{USD:2}).map(([currency,places])=>currency+': '+places).join('\n');
export function statementCurrencyScales(value){
  const rows=String(value||'').split(/[,;\n]/).map(row=>row.trim()).filter(Boolean);
  if(!rows.length||rows.length>32)throw new Error('Declare one to 32 original currency precisions, such as USD: 2.');
  const scales={};
  for(const row of rows){const match=/^([A-Z]{3})\s*[:=]\s*([0-6])$/.exec(row);
    if(!match)throw new Error('Use uppercase currency codes and 0 to 6 decimal places, such as EUR: 2.');
    if(Object.hasOwn(scales,match[1]))throw new Error('Declare each source currency precision once.');
    scales[match[1]]=Number(match[2]);
  }
  return scales;
}
const editingInput=value=>{const result=clone(value);if(result.decisions===undefined)result.decisions=[];return result;};
const nativeDefaults=()=>({profile:'TEXT_BODY',encoding:'UTF-8',debitCreditProfile:'CD_ONLY',yearWindowStart:1970,dateBasis:'VALUE_DATE',currencyScales:{USD:2}});
function usableInspection(value,inputs,caseId){
  return !!value&&bankFormat(inputs)&&value.schema==='stellar-forge.sf47-bank-statements.v1'&&value.caseId===caseId&&
    value.source?.sourceFormat===inputs.sourceFormat&&value.source?.filename===inputs.source?.filename&&
    /^[a-f0-9]{64}$/.test(value.inspectionSha256||'')&&Array.isArray(value.statements)&&value.statements.every(row=>
      !!row&&/^[a-f0-9]{64}$/.test(row.id||'')&&typeof row.currency==='string'&&typeof row.label==='string'&&
      typeof row.accountReference==='string'&&typeof row.cashEligible==='boolean'&&Number.isInteger(row.rowCount)&&row.rowCount>=0&&
      Number.isInteger(row.pendingCount)&&row.pendingCount>=0&&Array.isArray(row.findings)&&row.findings.every(item=>
        !!item&&typeof item.message==='string'&&['ERROR','REVIEW','INFO'].includes(item.severity))&&
      (row.balanceSnapshots===undefined||Array.isArray(row.balanceSnapshots)));
}
function draftInput(value,complete=false){
  if(!value||typeof value!=='object'||(value.decisions!==undefined&&!Array.isArray(value.decisions)))return false;
  if(bankFormat(value))return (value.sourceFormat!=='MT940'||!!value.statementOptions&&typeof value.statementOptions==='object')&&(!complete||typeof value.statementId==='string'&&!!value.statementId);
  return (!value.sourceFormat||value.sourceFormat==='CSV')&&!!value.format&&!!value.columns;
}
const statuses={NEW:'New cash movement',EXISTING:'Already recorded',EXCLUDED:'Excluded',CONFLICT:'Needs correction'};
const definitive=error=>[400,409,413,415,422].includes(error?.status)&&typeof error?.code==='string';

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

function draftStore(name='sf47-statement-drafts'){
  let opening;
  function database(){
    if(!opening)opening=new Promise((resolve,reject)=>{
      if(!globalThis.indexedDB){reject(new Error('Browser draft storage is unavailable.'));return;}
      const request=indexedDB.open(name,1);
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
const statementStores=new Map();
function statementStore(context){const name=staffDeskStorageKey('sf47-statement-drafts',context);if(!statementStores.has(name))statementStores.set(name,draftStore(name));return statementStores.get(name);}

export function mountStatements({container,current,saveApi,session,mutationId,recordingActor,onCase,onCash,staffContext=currentStaffContext()}){
  const pinnedContext=staffContext?{...staffContext}:null,storeDraft=statementStore(pinnedContext);
  const root=document.createElement('section');root.className='statement-desk';root.setAttribute('aria-label','Statement receiving');container.replaceChildren(root);
  if(!document.querySelector('link[data-statement-style]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/operations_statements.css';link.dataset.statementStyle='true';document.head.append(link);
  }
  if(!document.querySelector('link[data-statement-setup-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/operations_statement_profiles.css';link.dataset.statementSetupStyle='true';document.head.append(link);}
  if(!document.querySelector('link[data-statement-batch-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/operations_statement_batch.css';link.dataset.statementBatchStyle='true';document.head.append(link);}
  let active=true,busy=false,hostBusy=false,loading=true,caseValue=current,persistQueue=Promise.resolve(),persistTimer=null;
  const prefix='/api/operations/'+encodeURIComponent(current.program.id);
  const available=()=>active&&root.isConnected;
  const $=selector=>root.querySelector(selector);
  const defaults=()=>({source:null,accountId:'',accountLabel:'',currency:'USD',format:{delimiter:',',decimalMark:'.',groupMark:'',dateFormat:'YYYY-MM-DD',amountMode:'SIGNED',positiveDirection:'IN'},columns:{date:'',reference:'',description:'',amount:'',debit:'',credit:''},defaultCategory:'OTHER',decisions:[]});
  const values={inputs:defaults(),headers:[],inspection:null,nativeScalesText:'USD: 2',optionsError:'',editRevision:0,preview:null,dirty:true,confirmed:false,page:0,status:'ALL',query:'',appliedQuery:'',pending:null,accepted:null,setupPending:null,setupChoice:'',setupName:'',setupNote:'',inflight:null,error:'',notice:'',allocationRow:null,allocationDraft:[],batchSelection:[],batchChange:{mode:'CLASSIFY',category:'',tranche:'KEEP',reason:''},batchProposal:null,batchUndo:null,batchReviewPage:0};
  for(const [key,value] of Object.entries(values))if(!Object.hasOwn(session,key))session[key]=value;
  session.currentCaseVersion=current.program.version;
  const source=()=>session.inputs.source;
  const native=()=>bankFormat(session.inputs);
  const locked=()=>loading||busy||hostBusy||!!session.inflight||!!session.pending||!!session.accepted||!!session.setupPending;
  const editable=()=>!locked()&&caseValue.program.state==='OPEN';
  const rowDecision=number=>session.inputs.decisions.find(row=>row.rowNumber===number);
  function snapshot(){return {schema:'sf47.statement-draft.v1',caseId:current.program.id,inputs:clone(session.inputs),headers:clone(session.headers),inspection:clone(session.inspection),nativeScalesText:session.nativeScalesText,preview:clone(session.preview),dirty:session.dirty,pending:clone(session.pending),accepted:clone(session.accepted),setupPending:clone(session.setupPending),setupChoice:session.setupChoice,setupName:session.setupName,setupNote:session.setupNote,originalInputHandoff:clone(session.originalInputHandoff||null),batchSelection:clone(session.batchSelection),batchChange:clone(session.batchChange),batchUndo:clone(session.batchUndo)};}
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
      el.disabled=el.dataset.statementFixed==='true'||loading||busy||hostBusy||!!session.inflight||(!recovery&&!!(session.pending||session.accepted||session.setupPending))||(el.dataset.statementWrite==='true'&&caseValue.program.state!=='OPEN');
    });
    const importButton=$('[data-statement-action="import"]');
    if(importButton)importButton.disabled=!editable()||session.dirty||!session.confirmed||!session.preview?.canImport;
    const warning=$('[data-statement-stale]');if(warning)warning.hidden=!session.dirty;
  }
  function clearChangedSetup(){
    const selected=session.inputs.statementSetup;if(!selected)return;
    const row=(caseValue.statementSetups||[]).find(item=>sameSetupValue(statementSetupLink(item),selected));
    if(!row||!sameSetupValue(statementSetupSettings(session.inputs),row.settings)){delete session.inputs.statementSetup;session.notice='The account or interpretation changed. Save this mapping as a new setup edition to retain its reusable choice.';}
  }
  function clearBatch(){session.batchSelection=[];session.batchProposal=null;session.batchUndo=null;session.batchReviewPage=0;}
  function changed(keepBatch=false){if(!keepBatch)clearBatch();session.editRevision++;session.dirty=true;session.confirmed=false;session.error='';schedulePersist();controls();}
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
    if(native()){session.headers=[];return;}
    session.headers=source()?statementHeaders(sourceText(source().contentBase64),session.inputs.format.delimiter):[];
    if(!guess&&session.inputs.statementSetup)return;
    const aliases={date:['date','transactiondate','posteddate','bookingdate'],reference:['transactionid','reference','id','fitid','transactionreference'],description:['description','memo','details','narrative'],amount:['amount','transactionamount'],debit:['debit','debits','withdrawal','withdrawals'],credit:['credit','credits','deposit','deposits'],currency:['currency','ccy'],usdValue:['usdvalue','amountusd']};
    const names=session.headers.map(name=>[name,name.toLowerCase().replace(/[^a-z0-9]/g,'')]);
    for(const key of Object.keys(aliases)){
      if(guess||!session.headers.includes(session.inputs.columns[key]))session.inputs.columns[key]=names.find(([,normal])=>aliases[key].includes(normal))?.[0]||'';
    }
  }
  function resetInterpretation(){
    session.inputs.decisions=[];session.preview=null;session.inspection=null;session.page=0;
    session.allocationRow=null;session.allocationDraft=[];delete session.inputs.statementId;
    delete session.inputs.openingBalance;delete session.inputs.closingBalance;changed();
  }
  function chooseFormat(format){
    if(!['CSV','OFX','MT940'].includes(format))throw new Error('Choose CSV, OFX / QFX or MT940.');
    const input=session.inputs;delete input.statementSetup;input.sourceFormat=format;
    if(format==='CSV'){input.format=clone(defaults().format);input.columns=clone(defaults().columns);delete input.statementOptions;}
    else {delete input.format;delete input.columns;if(format==='MT940'){input.statementOptions=nativeDefaults();session.nativeScalesText=scaleText(input.statementOptions.currencyScales);}else delete input.statementOptions;}
    session.optionsError='';resetInterpretation();headersFromSource(true);
    session.notice=native()?'Inspect the original file and select its source account before previewing.':'Review the original CSV columns and number format.';
  }
  async function chooseFile(file){
    if(!file)return;
    if(file.size===0||file.size>maximumSource)throw new Error('Choose a nonempty original statement file up to 8 MiB.');
    const buffer=await file.arrayBuffer();if(!available())return;
    if(!native())new TextDecoder('utf-8',{fatal:true}).decode(buffer);
    delete session.inputs.statementSetup;
    session.inputs.source={filename:file.name,contentBase64:base64(buffer),sourceUrl:'',observedAt:new Date().toISOString()};
    resetInterpretation();headersFromSource(true);
    session.notice=native()?'Read the original bytes. Inspect the native account sections and format choices.':'Read the source file. Review its account, currency and column mapping before previewing.';
    await persist();
  }
  function captureMapping(form){
    const data=new FormData(form),input=session.inputs,oldOptions=JSON.stringify(input.statementOptions);
    for(const name of ['accountId','accountLabel','currency','defaultCategory'])if(data.has(name))input[name]=String(data.get(name)||'').trim();
    input.currency=input.currency.toUpperCase();
    for(const name of ['openingBalance','closingBalance','valuationNote','sourceReviewNote'])if(data.has(name)){const value=String(data.get(name)||'').trim();if(value)input[name]=value;else delete input[name];}
    if(!native()){
      for(const name of ['delimiter','decimalMark','groupMark','dateFormat','amountMode','positiveDirection'])input.format[name]=String(data.get('format.'+name)??input.format[name]);
      for(const key of ['date','reference','description','amount','debit','credit','currency','usdValue']){const value=data.get('columns.'+key);if(value!==null)input.columns[key]=String(value);}
    }else if(input.sourceFormat==='MT940'){
      const options=input.statementOptions||nativeDefaults();
      for(const key of ['profile','encoding','debitCreditProfile'])if(data.has('native.'+key))options[key]=String(data.get('native.'+key));
      if(data.has('native.yearWindowStart'))options.yearWindowStart=Number(data.get('native.yearWindowStart'));
      if(data.has('native.currencyScales'))session.nativeScalesText=String(data.get('native.currencyScales'));
      try{options.currencyScales=statementCurrencyScales(session.nativeScalesText);session.optionsError='';}catch(error){options.currencyScales={};session.optionsError=error.message;}
      options.dateBasis='VALUE_DATE';input.statementOptions=options;
      if(oldOptions!==JSON.stringify(options)){session.inspection=null;delete input.statementId;input.decisions=[];session.preview=null;delete input.openingBalance;delete input.closingBalance;}
    }
    if(input.source&&data.has('sourceUrl'))input.source.sourceUrl=String(data.get('sourceUrl')||'').trim();
    clearChangedSetup();changed();
    const panel=root.querySelector('[aria-label="Saved statement setups"]');if(panel){panel.outerHTML=setupPage();controls();}
  }
  function inspectionInputs(){
    if(!native()||!source())throw new Error('Select an original OFX / QFX or MT940 file.');
    if(session.optionsError)throw new Error(session.optionsError);
    const input={sourceFormat:session.inputs.sourceFormat,source:clone(source())};
    if(input.sourceFormat==='MT940'){
      const options=clone(session.inputs.statementOptions||nativeDefaults());
      options.currencyScales=statementCurrencyScales(session.nativeScalesText);
      if(!Number.isInteger(options.yearWindowStart)||options.yearWindowStart<1900||options.yearWindowStart>2000)throw new Error('Choose a century window start from 1900 through 2000.');
      input.statementOptions=options;
    }
    return input;
  }
  async function inspect(){
    const inputs=inspectionInputs(),expectedVersion=caseValue.program.version,revision=session.editRevision;
    const result=await saveApi(prefix+'/statement-inspect',{expectedVersion,inputs});
    if(!usableInspection(result,inputs,current.program.id)||result.expectedVersion!==expectedVersion)throw new Error('The original bank inspection differs from this case, source or account selection.');
    if(session.editRevision!==revision||session.currentCaseVersion!==expectedVersion)return;
    session.inspection=result;session.preview=null;session.dirty=true;session.confirmed=false;
    if(!result.statements.some(row=>row.id===session.inputs.statementId&&row.cashEligible))delete session.inputs.statementId;
    session.notice='Inspected '+result.statements.length+' original account and currency sections. Select the account to reconcile.';
    await persist();
  }
  function selectAccount(id){
    const inspection=session.inspection,row=inspection?.statements.find(value=>value.id===id);
    resetInterpretation();session.inspection=inspection;
    if(!row){session.notice='Select an inspected original account.';return;}
    // Preserve the original inspection while changing only its selected section.
    if(!row.cashEligible)throw new Error('This original credit account belongs in Supplier accounts.');
    session.inputs.statementId=row.id;session.inputs.currency=row.currency;clearChangedSetup();
    if(row.openingBalance?.amount!==undefined&&row.closingBalance?.amount!==undefined){
      session.inputs.openingBalance=row.openingBalance.amount;session.inputs.closingBalance=row.closingBalance.amount;
    }
    session.notice='Selected '+row.label+'. Review its account alias, movements and original balances.';
  }
  function reviewedInputs(){
    const input=clone(session.inputs);
    if(!input.source)throw new Error('Choose the original statement file.');
    if(!input.accountId||!input.accountLabel)throw new Error('Enter a stable account key and a readable account label.');
    if(!input.currency)throw new Error('Enter the statement’s currency or asset symbol.');
    if(bankFormat(input)){
      const inspected=session.inspection?.statements.find(row=>row.id===input.statementId&&row.cashEligible);
      if(!inspected)throw new Error('Inspect the original file and select a cash account before previewing.');
      if(inspected.currency!==input.currency)throw new Error('The selected account currency changed. Select its original source account again.');
      const original=inspectionInputs();if(original.statementOptions)input.statementOptions=original.statementOptions;else delete input.statementOptions;
      delete input.format;delete input.columns;
    }else{
      if(!input.columns.date||!input.columns.reference)throw new Error('Map the date and original transaction reference columns.');
      if(input.format.amountMode==='SIGNED'&&!input.columns.amount)throw new Error('Map the signed amount column.');
      if(input.format.amountMode==='DEBIT_CREDIT'&&(!input.columns.debit||!input.columns.credit))throw new Error('Map both debit and credit columns.');
    }
    return input;
  }
  async function preview(){
    const inputs=reviewedInputs(),expectedVersion=caseValue.program.version,revision=session.editRevision;
    const result=await saveApi(prefix+'/statement-preview',{expectedVersion,inputs});
    if(result.caseId!==current.program.id||result.expectedVersion!==expectedVersion||result.schema!=='stellar-forge.sf47-statements.v1'||!Array.isArray(result.rows))throw new Error('The preview belongs to another case or version. Refresh the case and preview again.');
    if(session.editRevision!==revision||session.currentCaseVersion!==expectedVersion)return;
    clearBatch();session.preview=result;session.dirty=false;session.confirmed=false;session.page=0;session.allocationRow=null;session.allocationDraft=[];
    session.notice='Reviewed '+result.rows.length+' source rows against the current cash records.';
    await persist();
  }
  async function refresh(){
    const next=await saveApi(prefix);
    if(next.program.id!==current.program.id)throw new Error('The refreshed case has another identity.');
    caseValue=next;session.currentCaseVersion=next.program.version;
    if(session.preview?.expectedVersion!==next.program.version){clearBatch();session.dirty=true;session.confirmed=false;}
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
    clearBatch();session.lastReceipt=clone(result);session.accepted=null;session.pending=null;session.preview=null;session.dirty=true;session.confirmed=false;
    session.notice='Imported '+(result.cashIds?.length||0)+' cash movements; '+(result.existingCashIds?.length||0)+' existing records reconciled. Case version '+result.version+'.';
    await persist();
    if(available())await onCase(next,result);
  }
  async function sendPending(){
    const pending=session.pending;if(!pending)return;
    assertStaffRequestActor(pending.payload,pinnedContext);
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
    if(caseValue.program.state!=='OPEN'||session.pending||session.accepted||session.setupPending)throw new Error('Reopen the case and finish its current import before recording another statement.');
    if(!session.preview?.canImport||session.dirty||!session.confirmed)throw new Error('Review a current preview and confirm its cash movements before importing.');
    const payload={expectedVersion:session.preview.expectedVersion,actor:recordingActor(),note:'Imported reviewed statement '+source().filename,action:'statement.receive',data:{inputs:reviewedInputs(),expectedPreviewSha256:session.preview.previewSha256}};
    payload.requestId=await mutationId('operations:'+current.program.id,payload);
    session.pending={payload,createdAt:new Date().toISOString()};await persist(true);
    await sendPending();
  }

  const setupRows=()=>caseValue.statementSetups||[];
  const setupHeaderReader=(file,delimiter)=>statementHeaders(sourceText(file.contentBase64),delimiter);
  function setupPage(){return statementSetupPanel({rows:setupRows(),input:session.inputs,choice:session.setupChoice,name:session.setupName,note:session.setupNote,pending:session.setupPending,readHeaders:setupHeaderReader,open:caseValue.program.state==='OPEN'});}
  function selectedSetup(){
    const row=setupRows().find(item=>item.sourceId===session.setupChoice);
    if(!row)throw new Error('Choose a saved statement setup.');
    return row;
  }
  async function applySetup(){
    const row=selectedSetup(),comparison=statementSetupComparison(row,session.inputs,setupHeaderReader);
    if(!comparison.canApply)throw new Error('Choose the current original file and resolve every missing mapped header before applying this setup.');
    const original=clone(source());
    session.inputs={...clone(row.settings),source:original,decisions:[]};
    resetInterpretation();
    session.inputs.statementSetup=statementSetupLink(row);
    session.headers=comparison.headers;session.nativeScalesText=scaleText(session.inputs.statementOptions?.currencyScales);
    session.optionsError='';session.setupName=row.name;
    session.notice='Applied '+row.name+' edition '+row.revision+'. '+(native()?'Inspect this original file and select its bank account.':'Review this period’s balances and row decisions.');
    await persist(true);
  }
  async function finishSetup(){
    const pending=session.setupPending,result=pending?.result;if(!result)return;
    const next=await refresh(),row=(next.statementSetups||[]).find(item=>item.sourceId===result.recordId);
    if(result.id!==next.program.id||result.action!=='statement-setup.save'||!row||!sameSetupValue(row,result.statementSetup)||next.program.version<result.version)throw new Error('The saved setup receipt has not reconciled with this case yet. Resume the original request.');
    session.setupChoice=row.sourceId;session.setupName=row.name;session.setupNote='';
    if(row.status==='ACTIVE'&&sameSetupValue(statementSetupSettings(session.inputs),row.settings))session.inputs.statementSetup=statementSetupLink(row);
    session.setupPending=null;session.preview=null;session.dirty=true;session.confirmed=false;
    session.notice=(row.status==='ARCHIVED'?'Archived ':'Saved ')+row.name+' edition '+row.revision+'. The complete setup history is retained in this case.';
    await persist(true);if(available())await onCase(next,result);
  }
  async function sendSetup(){
    const pending=session.setupPending;if(!pending)return;
    assertStaffRequestActor(pending.payload,pinnedContext);await persist(true);
    if(!pending.result){
      try{pending.result=await saveApi(prefix+'/command',pending.payload);await persist(true);}
      catch(error){if(definitive(error)){session.setupPending=null;await persist();}throw error;}
    }
    if(available())await finishSetup();
  }
  async function saveSetup(mode){
    if(session.pending||session.accepted||session.setupPending||caseValue.program.state!=='OPEN')throw new Error('Finish the retained request and reopen this case before saving a setup.');
    const mapping=$('[data-statement-mapping]');if(mapping)captureMapping(mapping);
    const prior=mode==='new'?null:selectedSetup();
    const name=String(session.setupName||prior?.name||'').trim(),note=String(session.setupNote||'').trim();
    if(!name||!note)throw new Error('Enter a setup name and a reason for this edition.');
    const data={expectedRevision:prior?.revision||0,name,status:mode==='archive'?'ARCHIVED':'ACTIVE'};
    if(prior)data.id=prior.id;
    if(mode!=='archive')data.inputs=reviewedInputs();
    const payload={expectedVersion:caseValue.program.version,actor:recordingActor(),note,action:'statement-setup.save',data};
    payload.requestId=await mutationId('operations:'+current.program.id,payload);
    session.setupPending={payload,createdAt:new Date().toISOString()};await persist(true);
    await sendSetup();
  }

  function nativeSourcePage(){
    const input=session.inputs,inspection=session.inspection,selected=inspection?.statements.find(row=>row.id===input.statementId);
    let html='';
    if(input.sourceFormat==='MT940'){
      const options=input.statementOptions||nativeDefaults();
      html+='<h4>2. Choose the original MT940 interpretation</h4><div class="statement-fields">'+
        field('Original transport','native.profile',options.profile,{options:[['TEXT_BODY','Statement text body'],['FIN_ENVELOPE','FIN envelope']]})+
        field('Original encoding','native.encoding',options.encoding,{options:choice(['ASCII','UTF-8','ISO-8859-1'])})+
        field('Debit and reversal marks','native.debitCreditProfile',options.debitCreditProfile,{options:[['CD_ONLY','C / D'],['CD_REVERSALS','C / D with RC / RD reversals']]})+
        field('Century window starts','native.yearWindowStart',options.yearWindowStart,{type:'number',attrs:'min="1900" max="2000" step="1"',help:'Resolve original two-digit years within this explicit 100-year window.'})+
        field('Currency decimal places','native.currencyScales',session.nativeScalesText,{area:true,help:'One original precision per currency, such as USD: 2 or JPY: 0. Separate entries with lines or commas.'})+
        '<p class="statement-native-note">The original full value date supplies each cash date. Entry month and day remain separate source fields.</p></div>';
    }else html+='<h4>2. Inspect the original OFX / QFX accounts</h4><p>The native reader uses the file’s original declared encoding, FITID identities and posted dates.</p>';
    html+='<div class="statement-actions">'+button('Inspect original accounts','inspect',!source())+'</div>';
    if(!inspection)return html+'<p class="statement-empty">Inspect the original file to select an account and review its source balances.</p>';
    html+=field('Original account and currency','statementId',input.statementId||'',{wide:true,options:[['','Choose an original cash account'],...inspection.statements.filter(row=>row.cashEligible).map(row=>[row.id,row.label])]});
    html+=table(['Original account','Currency / dates','Posted / pending','Original balances','Use'],inspection.statements.map(row=>[
      '<strong>'+esc(row.label)+'</strong><small>'+esc(row.accountReference)+'</small>',
      esc(row.currency)+'<small>'+esc(row.from||'—')+' → '+esc(row.until||'—')+'</small>',
      esc(row.rowCount)+' posted<small>'+esc(row.pendingCount)+' pending observations</small>',
      (row.openingBalance?'Opening '+amount(row.openingBalance.amount,row.currency)+'<small>'+esc(row.openingBalance.date)+'</small>':'Opening not supplied')+
        (row.closingBalance?'<small>Closing '+amount(row.closingBalance.amount,row.currency)+' · '+esc(row.closingBalance.date)+'</small>':''),
      row.cashEligible?'Cash observations':'Supplier accounts'
    ]));
    if(selected){
      html+='<div class="statement-native-selection"><strong>Selected original account:</strong> '+esc(selected.label)+
        '<p>Review '+esc(selected.rowCount)+' posted movements. '+esc(selected.pendingCount)+' pending observations remain in the original report.</p>'+
        (selected.findings?.length?'<ul>'+selected.findings.map(item=>'<li><strong>'+esc(label(item.severity))+':</strong> '+esc(item.message)+'</li>').join('')+'</ul>':'')+
        (selected.balanceSnapshots?.length?detail('Original dated balance snapshots',selected.balanceSnapshots):'')+'</div>';
    }
    return html;
  }
  function sourcePage(){
    const input=session.inputs,isNative=native(),format=input.format||defaults().format,columns=input.columns||{},options=[['','Select a column'],...session.headers.map(name=>[name,name])];
    const optional=[['','Not mapped'],...session.headers.map(name=>[name,name])];
    const mapping=(text,key,required=true)=>field(text,'columns.'+key,columns[key]||'',{options:required?options:optional,required});
    const accept=input.sourceFormat==='OFX'?'.ofx,.qfx,application/x-ofx':input.sourceFormat==='MT940'?'.mt940,.sta,.stm,.txt,text/plain':'.csv,.tsv,text/csv,text/tab-separated-values';
    const selected=session.inspection?.statements.find(row=>row.id===input.statementId&&row.cashEligible);
    return '<section class="statement-panel"><h4>1. Choose the statement and account</h4>'+
      '<form data-statement-mapping><div class="statement-fields">'+
      field('Original statement format','sourceFormat',input.sourceFormat||'CSV',{options:[['CSV','CSV / delimited text'],['OFX','OFX / QFX'],['MT940','MT940']]})+
      '<label class="statement-wide">Original statement file<input type="file" data-statement-file accept="'+accept+'"><small>'+esc(isNative?'The original bank bytes and complete native reader report are retained when imported.':'UTF-8, including a UTF-8 byte-order mark. The original bytes are retained when imported.')+'</small></label>'+
      (source()?'<p class="statement-file statement-wide"><strong>'+esc(source().filename)+'</strong> · '+esc(isNative?'Original bank source':session.headers.length+' columns loaded')+'.</p>':'<p class="statement-empty statement-wide">Choose the original statement file.</p>')+
      field('Account key','accountId',input.accountId,{required:true,help:'A stable, nonsecret name for this account. Reuse it for overlapping statements and use a different key for each account.'})+
      field('Account label','accountLabel',input.accountLabel,{required:true,help:'A readable label, such as Project operating account.'})+
      field('Statement currency / asset','currency',input.currency,{required:true,attrs:isNative?'readonly':'',help:isNative?'Selected from the original account section below.':'One currency per file. Quantities remain in this original currency.'})+
      field('Original source URL','sourceUrl',source()?.sourceUrl||'',{wide:true,help:'Optional public or authorized source location, without credentials in the URL.'})+
      '</div>'+
      (isNative?nativeSourcePage():'<h4>2. Map the source format</h4><div class="statement-fields">'+
      field('Column separator','format.delimiter',format.delimiter,{options:[[',','Comma'],[';','Semicolon'],['\t','Tab'],['|','Pipe']]})+
      field('Decimal mark','format.decimalMark',format.decimalMark,{options:[['.','Period (1234.56)'],[',','Comma (1234,56)']]})+
      field('Grouping mark','format.groupMark',format.groupMark,{options:[['','None'],[',','Comma'],['.','Period'],[' ','Space'],['\u00a0','Nonbreaking space'],["'","Apostrophe"]]})+
      field('Date format','format.dateFormat',format.dateFormat,{options:choice(['YYYY-MM-DD','MM/DD/YYYY','DD/MM/YYYY','YYYY/MM/DD'])})+
      field('Amount columns','format.amountMode',format.amountMode,{options:[['SIGNED','One signed amount'],['DEBIT_CREDIT','Separate debit and credit']]})+
      field('Positive signed amounts','format.positiveDirection',format.positiveDirection,{options:[['IN','Money received'],['OUT','Money paid']]})+
      mapping('Transaction date','date')+mapping('Original transaction reference','reference')+mapping('Description','description',false)+
      (format.amountMode==='SIGNED'?mapping('Signed amount','amount'):mapping('Debit amount','debit')+mapping('Credit amount','credit'))+
      mapping('Currency column','currency',false)+(input.currency!=='USD'?mapping('Recorded USD value','usdValue',false):'')+'</div>')+
      '<div class="statement-fields">'+field('Default cash category','defaultCategory',input.defaultCategory,{options:categories.map(value=>[value,label(value)])})+
      (input.currency!=='USD'?field('USD valuation basis','valuationNote',input.valuationNote||'',{wide:true,area:true,help:'Retain an explicit source valuation when one is supplied. Original bank currency amounts remain separate.'}):'')+
      (isNative?field('Source review note','sourceReviewNote',input.sourceReviewNote||'',{wide:true,area:true,attrs:'maxlength="4000"',help:'Retain the original correction or source interpretation decision. Row-specific reasons remain with each movement.'}):'')+
      '</div><h4>3. Reconcile the statement balances</h4><div class="statement-fields">'+
      field('Opening balance','openingBalance',input.openingBalance||'',{attrs:'inputmode="decimal"',help:isNative?'Original signed amount, with a period decimal mark and no grouping.':'Optional signed amount in the statement currency and selected number format.'})+
      field('Closing balance','closingBalance',input.closingBalance||'',{attrs:'inputmode="decimal"',help:'Provide both balances to compare the complete supplied movement.'})+
      '</div>'+
      (isNative?'<p class="statement-native-note">Original snapshots keep their own dates. Pending observations stay in the report. OFX totals describe the supplied posted occurrences, including replacements or repeated occurrences.</p>':'')+
      '<div class="statement-actions">'+button('Preview statement','preview',!source()||(isNative&&!selected),'class="statement-primary"')+button('Download recovery copy','draft-export',!source(),'data-statement-recovery="true"')+button('Open recovery copy','draft-import',!!(session.pending||session.accepted||session.setupPending),'data-statement-recovery="true"')+'</div></form></section>';
  }
  function batchReady(){
    if(caseValue.program.state!=='OPEN'||session.pending||session.accepted||session.setupPending||session.dirty||!session.preview)
      throw new Error('Preview the current open case and finish its retained request before editing selected rows.');
  }
  function batchPage(){
    return statementBatchPanel({preview:session.preview,selected:session.batchSelection,options:session.batchChange,
      proposal:session.batchProposal,undo:session.batchUndo,dirty:session.dirty,page:session.batchReviewPage,open:caseValue.program.state==='OPEN'});
  }
  function redrawBatch(){
    const panel=$('[aria-label="Review selected statement rows"]');if(panel){panel.outerHTML=batchPage();controls();}
  }
  function selectBatch(numbers){
    batchReady();
    session.batchSelection=statementSelection(session.preview,[...new Set([...session.batchSelection,...numbers])]).map(row=>row.rowNumber);
    session.batchProposal=null;session.batchReviewPage=0;schedulePersist();
  }
  async function batchAction(action){
    if(action==='batch-cancel'){session.batchProposal=null;return;}
    if(action==='batch-export'){download(session.batchProposal,'statement-selected-row-changes.json');return;}
    if(action==='batch-previous'){session.batchReviewPage=Math.max(0,session.batchReviewPage-1);return;}
    if(action==='batch-next'){session.batchReviewPage++;return;}
    if(action==='batch-undo'){
      if(caseValue.program.state!=='OPEN'||session.pending||session.accepted||session.setupPending)throw new Error('Finish the retained request before editing rows.');
      const restored=undoStatementBatch(session.preview,session.inputs,session.batchUndo);
      session.inputs.decisions=restored;changed();session.notice='Restored the exact row decisions from before the last group change. Preview again to review them.';await persist();return;
    }
    batchReady();
    if(action==='batch-page'||action==='batch-matching'){
      const rows=statementMatchingRows(session.preview,session.status,session.appliedQuery);
      const picked=action==='batch-page'?rows.slice(session.page*pageSize,(session.page+1)*pageSize):rows;
      selectBatch(picked.map(row=>row.rowNumber));return;
    }
    if(action==='batch-clear'){session.batchSelection=[];session.batchProposal=null;return;}
    if(action==='batch-prepare'){
      session.batchProposal=prepareStatementBatch(session.preview,session.inputs,session.batchSelection,session.batchChange);
      session.batchReviewPage=0;return;
    }
    if(action==='batch-apply'){
      const proposal=session.batchProposal,result=applyStatementBatch(session.preview,session.inputs,proposal);
      session.inputs.decisions=result.decisions;session.batchUndo=result.undo;session.batchProposal=null;session.batchSelection=[];
      changed(true);session.notice='Applied '+proposal.changes.length+' explicit row decisions to this draft. Preview updated decisions to review native classifications and balances before importing.';await persist();
    }
  }
  function rowState(row){return {rowNumber:row.rowNumber,action:row.action||'IMPORT',category:row.category,tranche:row.tranche,allocations:row.allocations||[],...rowDecision(row.rowNumber)};}
  function rowTable(){
    const preview=session.preview;if(!preview)return '';
    const filtered=statementMatchingRows(preview,session.status,session.appliedQuery);
    const pages=Math.max(1,Math.ceil(filtered.length/pageSize));session.page=Math.min(session.page,pages-1);
    const rows=filtered.slice(session.page*pageSize,(session.page+1)*pageSize);
    return '<div class="statement-review-controls">'+
      field('Review status','reviewStatus',session.status,{options:[['ALL','All rows'],...Object.entries(statuses)]})+
      field('Find reference, description or row','reviewQuery',session.query)+
      '<div class="statement-page">'+button('Apply filter','filter')+button('Previous','previous',session.page===0)+'<span>Page '+(session.page+1)+' of '+pages+' · '+filtered.length+' rows</span>'+button('Next','next',session.page+1>=pages)+'</div></div>'+
      batchPage()+
      (rows.length?table(['Select','Source row / reference','Date / description','Movement','Cash classification','Review / action'],rows.map(row=>{
        const decision=rowState(row),unchanged=row.status==='EXISTING',category=decision.category||row.category;
        return [
          '<label class="statement-batch-check"><input type="checkbox" data-statement-row-select="'+row.rowNumber+'" aria-label="Select source row '+row.rowNumber+'"'+(session.batchSelection.includes(row.rowNumber)?' checked':'')+(session.dirty||caseValue.program.state!=='OPEN'?' disabled data-statement-fixed="true"':'')+'>Select</label>',
          '<strong>Row '+esc(row.rowNumber)+'</strong><small>'+esc(row.reference||'Missing reference')+'</small>'+(row.sourceLine!==undefined?'<small>Original source line '+esc(row.sourceLine)+'</small>':'')+(row.providerReference?'<small>Provider reference '+esc(row.providerReference)+'</small>':''),
          esc(row.date||'—')+'<small>'+esc(row.description||'')+'</small>',
          esc(label(row.direction))+' '+amount(row.amount,row.currency)+(row.currency!=='USD'?'<small>Recorded value: '+amount(row.usdValue,'USD')+'</small>':''),
          '<label>Category<select data-row-category="'+row.rowNumber+'"'+(unchanged?' disabled data-statement-fixed="true"':'')+'>'+categories.map(value=>'<option value="'+value+'"'+(category===value?' selected':'')+'>'+esc(label(value))+'</option>').join('')+'</select></label>'+
          '<label>Tranche<select data-row-tranche="'+row.rowNumber+'"'+(unchanged?' disabled data-statement-fixed="true"':'')+'>'+[['','Unassigned'],['0','0'],['1','1'],['2','2'],['3','3']].map(([value,text])=>'<option value="'+value+'"'+(String(decision.tranche??'')===value?' selected':'')+'>'+text+'</option>').join('')+'</select></label>'+
          button('Invoice allocations','allocations',unchanged,'data-row="'+row.rowNumber+'"')+'<small>'+esc((decision.allocations||row.allocations||[]).length)+' linked invoice allocations</small>',
          '<span class="statement-status">'+esc(statuses[row.status]||row.status)+'</span>'+
          (row.problems||[]).map(problem=>'<small>'+esc(problem)+'</small>').join('')+
          '<label>Use row<select data-row-action="'+row.rowNumber+'"><option value="IMPORT"'+(decision.action!=='EXCLUDE'?' selected':'')+'>Include in review</option><option value="EXCLUDE"'+(decision.action==='EXCLUDE'?' selected':'')+'>Exclude</option></select></label>'+
          '<label>Reason / note<input data-row-reason="'+row.rowNumber+'" value="'+esc(decision.reason||'')+'"></label>'+
          (row.corrected?'<small>Reconciled through the original cash correction.</small>':'')+(row.recordId?detail('Existing cash record',{recordId:row.recordId,...(row.corrected?{originalRecordId:row.originalRecordId,correctionSourceIds:row.correctionSourceIds,current:row.correctedRecord}: {})}):'')+(row.nativeIdentity?detail('Original movement fields',{sourceLine:row.sourceLine,identityBasis:row.identityBasis,providerReference:row.providerReference,identity:row.nativeIdentity}):'')
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
      (preview.bank?'<div class="statement-native-selection"><strong>'+esc(preview.bank.sourceFormat)+' original account:</strong> '+esc(preview.bank.accountReference)+'<p>'+esc(preview.bank.pendingCount)+' pending observations retained in the original report.</p>'+(preview.bank.findings?.length?'<ul>'+preview.bank.findings.map(item=>'<li>'+esc(label(item.severity))+': '+esc(item.message)+'</li>').join('')+'</ul>':'')+detail('Original native account and balance interpretation',preview.bank)+'</div>':'')+
      rowTable()+allocationPage()+
      '<label class="statement-confirm"><input type="checkbox" data-statement-confirm'+(session.confirmed?' checked':'')+'>I reviewed the account, currency, source rows and cash classifications shown above.</label>'+
      '<div class="statement-actions">'+button('Preview updated decisions','preview')+button('Import reviewed cash movements','import',!preview.canImport||session.dirty||!session.confirmed,'class="statement-primary" data-statement-write="true"')+button('Download review','review-export',false,'data-statement-recovery="true"')+'</div>'+
      detail('Original source and review identity',{source:preview.source,caseId:preview.caseId,caseVersion:preview.expectedVersion,previewSha256:preview.previewSha256})+'</section>';
  }
  async function openOriginalInputs(){
    const selected=session.originalInputHandoff;if(!selected)return;
    if(session.pending||session.accepted||session.setupPending||session.inflight)throw new Error('Resume the retained original import before opening the selected source. Both complete inputs remain saved.');
    if(selected.caseId!==current.program.id||!selected.inputs?.source?.contentBase64||!draftInput(selected.inputs,true))throw new Error('The selected original statement needs its complete source bytes and interpretation in this case.');
    if(selected.inputs.source.contentBase64.length>(maximumSource+2)*4/3+16)throw new Error('The selected original statement exceeds the native 8 MiB source size.');
    const incoming=editingInput(selected.inputs),headers=bankFormat(incoming)?[]:statementHeaders(sourceText(incoming.source.contentBase64),incoming.format.delimiter);
    if(source()&&JSON.stringify(session.inputs)!==JSON.stringify(incoming))download(snapshot(),'statement-before-original-source.json');
    session.inputs=incoming;session.headers=headers;session.inspection=null;session.nativeScalesText=scaleText(incoming.statementOptions?.currencyScales);
    clearBatch();session.batchChange={mode:'CLASSIFY',category:'',tranche:'KEEP',reason:''};session.optionsError='';session.preview=null;session.dirty=true;session.confirmed=false;session.editRevision++;
    session.page=0;session.status='ALL';session.query='';session.allocationRow=null;session.allocationDraft=[];
    session.originalInputHandoff=null;
    await persist();
    if(native())await inspect();
    session.notice='Opened the exact retained statement source and original interpretation. Review corrections against the current case.';
    await persist();
  }
  function originalInputPage(){
    const selected=session.originalInputHandoff;if(!selected)return '';
    return '<section class="statement-panel"><h4>Selected original statement</h4><p>'+esc(selected.inputs?.source?.filename||selected.statementSourceId||'Original source')+' is retained with its complete original interpretation.</p>'+(selected.inputs?.statementSetup?'<p>Saved setup: <strong>'+esc(selected.inputs.statementSetup.name)+'</strong> · edition '+esc(selected.inputs.statementSetup.revision)+'.</p>':'')+'<div class="statement-actions">'+
      button('Open selected original statement','original-input',!!(session.pending||session.accepted||session.setupPending||session.inflight))+
      button('Download selected original inputs','original-input-export',false,'data-statement-recovery="true"')+'</div></section>';
  }
  function recoveryPage(){
    if(session.accepted)return '<section class="statement-panel"><h4>Import accepted</h4><p>The original import has a server receipt. Read the saved case to finish receiving its cash records and sources.</p><div class="statement-actions">'+button('Read saved case','readback',false,'data-statement-recovery="true"')+button('Download recovery copy','draft-export',false,'data-statement-recovery="true"')+'</div></section>';
    if(session.pending)return '<section class="statement-panel"><h4>Resume the original import</h4><p>The exact reviewed request is retained. Resuming sends the same request identity and payload; the case returns its prior result if already saved.</p><div class="statement-actions">'+button('Resume original import','retry',false,'data-statement-recovery="true"')+button('Download recovery copy','draft-export',false,'data-statement-recovery="true"')+'</div></section>';
    return '';
  }
  function render(){
    if(!available())return;
    root.innerHTML='<div class="statement-header"><div><h3>Statement receiving</h3><p class="statement-subtitle">Read original CSV, OFX / QFX or MT940 statements, reconcile their balances and import reviewed cash movements into this grant case.</p></div><div class="statement-actions">'+button('Refresh case','refresh',false,'data-statement-recovery="true"')+button('Open cash records','cash',false,'data-statement-recovery="true"')+'</div></div>'+
      (loading?'<p role="status">Opening the retained statement draft…</p>':'')+
      (session.error?'<p class="statement-error" role="alert">'+esc(session.error)+'</p>':'')+
      (session.notice?'<p class="statement-notice" role="status" aria-live="polite">'+esc(session.notice)+'</p>':'')+
      (session.storageWarning?'<p class="statement-notice">'+esc(session.storageWarning)+'</p>':'')+
      (caseValue.program.state==='CLOSED'?'<p class="statement-notice">This case is closed. Reopen the case to import additional cash movements.</p>':'')+
      recoveryPage()+originalInputPage()+sourcePage()+setupPage()+reviewPage()+
      (session.lastReceipt?detail('Last statement import',session.lastReceipt):'');
    controls();
  }
  function captureAllocations(form){
    const data=new FormData(form);
    session.allocationDraft=session.allocationDraft.map((row,i)=>({invoiceId:String(data.get('invoice.'+i)||''),amountUsd:String(data.get('amount.'+i)||'').trim()}));
  }
  async function importDraft(file){
    if(!file)return;
    if(session.pending||session.accepted||session.setupPending||session.inflight)throw new Error('Finish the retained request before opening another recovery copy.');
    if(file.size>64*1024*1024)throw new Error('Select a complete statement recovery copy up to 64 MiB.');
    const saved=JSON.parse(await file.text());if(!available())return;
    if(saved.schema!=='sf47.statement-draft.v1'||saved.caseId!==current.program.id||!draftInput(saved.inputs))throw new Error('Choose a statement recovery copy for this original case.');
    if(saved.inputs.source?.contentBase64?.length>(maximumSource+2)*4/3+16)throw new Error('The recovery copy contains a statement larger than 8 MiB.');
    if([saved.pending,saved.accepted,saved.setupPending].filter(Boolean).length>1)throw new Error('The recovery copy contains conflicting request states.');
    if(saved.setupPending){const request=saved.setupPending.payload;assertStaffRequestActor(request,pinnedContext);if(request?.action!=='statement-setup.save'||typeof request.requestId!=='string'||!request.data||!['ACTIVE','ARCHIVED'].includes(request.data.status)||request.data.status==='ACTIVE'&&!draftInput(request.data.inputs,true))throw new Error('The retained setup request is incomplete.');}
    session.setupPending=clone(saved.setupPending||null);session.setupChoice=saved.setupChoice||'';session.setupName=saved.setupName||'';session.setupNote=saved.setupNote||'';
    assertStaffRequestActor(saved.pending?.payload,pinnedContext);
    for(const request of [saved.pending?.payload,saved.accepted?.payload].filter(Boolean)){
      if(request.action!=='statement.receive'||typeof request.requestId!=='string'||!request.data?.inputs?.source||!draftInput(request.data.inputs,true)||typeof request.data.expectedPreviewSha256!=='string')throw new Error('The original import request in this recovery copy is invalid.');
      if(request.data.inputs.source.contentBase64?.length>(maximumSource+2)*4/3+16)throw new Error('The retained import contains a statement larger than 8 MiB.');
    }
    if(saved.originalInputHandoff&&(saved.originalInputHandoff.caseId!==current.program.id||!saved.originalInputHandoff.inputs?.source?.contentBase64||!draftInput(saved.originalInputHandoff.inputs,true)||saved.originalInputHandoff.inputs.source.contentBase64.length>(maximumSource+2)*4/3+16))throw new Error('The queued original statement needs its complete source bytes and interpretation in this case.');
    session.originalInputHandoff=clone(saved.originalInputHandoff||null);
    const original=saved.pending?.payload||saved.accepted?.payload;
    session.inputs=editingInput(original?.data.inputs||saved.inputs);session.pending=clone(saved.pending||null);session.accepted=clone(saved.accepted||null);
    session.inspection=usableInspection(saved.inspection,session.inputs,current.program.id)?clone(saved.inspection):null;
    session.nativeScalesText=original?scaleText(session.inputs.statementOptions?.currencyScales):saved.nativeScalesText??scaleText(session.inputs.statementOptions?.currencyScales);
    clearBatch();session.batchChange={mode:'CLASSIFY',category:'',tranche:'KEEP',reason:''};session.optionsError='';session.preview=null;session.dirty=true;session.confirmed=false;session.page=0;session.editRevision++;session.allocationRow=null;session.allocationDraft=[];headersFromSource();
    session.notice='Opened the original source and interpretation. Resume a retained request or inspect and preview against the current case.';
    await persist(true);
  }
  root.addEventListener('input',event=>{
    if(event.target.name==='batchReason'){session.batchChange.reason=event.target.value;session.batchProposal=null;$('[class="statement-batch-proposal"]')?.remove();schedulePersist();return;}
    if(event.target.name==='setupName'){session.setupName=event.target.value;schedulePersist();return;}
    if(event.target.name==='setupNote'){session.setupNote=event.target.value;schedulePersist();return;}
    const form=event.target.closest('[data-statement-mapping]');
    if(form&&event.target.tagName!=='SELECT')captureMapping(form);
    if(event.target.dataset.rowReason)setDecision(Number(event.target.dataset.rowReason),{reason:event.target.value});
    if(event.target.closest('[data-statement-allocations]'))captureAllocations(event.target.closest('form'));
    if(event.target.name==='reviewQuery')session.query=event.target.value;
  });
  root.addEventListener('change',event=>{
    if(event.target.dataset.statementRowSelect){
      try{batchReady();const number=Number(event.target.dataset.statementRowSelect);
        if(event.target.checked)selectBatch([number]);else{session.batchSelection=session.batchSelection.filter(value=>value!==number);session.batchProposal=null;schedulePersist();}
        redrawBatch();
      }catch(error){session.error=error.message;render();}return;
    }
    if(['batchMode','batchCategory','batchTranche'].includes(event.target.name)){
      const key={batchMode:'mode',batchCategory:'category',batchTranche:'tranche'}[event.target.name];
      session.batchChange[key]=event.target.value;session.batchProposal=null;schedulePersist();redrawBatch();return;
    }
    if(event.target.name==='setupChoice'){session.setupChoice=event.target.value;session.setupName=setupRows().find(row=>row.sourceId===session.setupChoice)?.name||'';session.setupNote='';schedulePersist();render();return;}
    if(event.target.matches('[data-statement-file]')){void run(()=>chooseFile(event.target.files?.[0]));return;}
    const mapping=event.target.closest('[data-statement-mapping]');
    if(mapping){
      const oldDelimiter=session.inputs.format?.delimiter,oldInspection=session.inspection;captureMapping(mapping);
      if(event.target.name==='sourceFormat'){
        try{chooseFormat(event.target.value);}catch(error){session.headers=[];session.error=error.message;}
        render();
      }else if(event.target.name==='statementId'){
        try{selectAccount(event.target.value);}catch(error){session.error=error.message;}
        render();
      }else if(!native()&&oldDelimiter!==session.inputs.format.delimiter){
        try{headersFromSource();session.inputs.decisions=[];session.preview=null;}catch(error){session.headers=[];session.preview=null;session.error=error.message;}
        render();
      }else if(['format.amountMode','currency'].includes(event.target.name)||oldInspection!==session.inspection)render();
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
    if(event.target.matches('[data-statement-mapping]')){event.preventDefault();captureMapping(event.target);void run(native()&&!session.inspection?inspect:preview);}
    if(event.target.matches('[data-statement-allocations]')){
      event.preventDefault();captureAllocations(event.target);setDecision(session.allocationRow,{allocations:clone(session.allocationDraft)});session.allocationRow=null;render();
    }
  });
  root.addEventListener('click',event=>{
    const target=event.target.closest('[data-statement-action]');if(!target||target.disabled)return;
    const action=target.dataset.statementAction;
    if(action==='preview'||action==='inspect'){const form=$('[data-statement-mapping]');if(form)captureMapping(form);}
    if(['add-allocation','remove-allocation'].includes(action)){const form=$('[data-statement-allocations]');if(form)captureAllocations(form);}
    void run(async()=>{
      if(action.startsWith('batch-'))await batchAction(action);
      else if(action==='setup-apply')await applySetup();
      else if(action==='setup-new')await saveSetup('new');
      else if(action==='setup-revise')await saveSetup('revise');
      else if(action==='setup-archive')await saveSetup('archive');
      else if(action==='setup-retry')await sendSetup();
      else if(action==='setup-clear'){delete session.inputs.statementSetup;changed();session.notice='Cleared the setup selection. The current file and editable mapping are retained.';}
      else if(action==='inspect')await inspect();
      else if(action==='preview')await preview();
      else if(action==='import')await importReviewed();
      else if(action==='retry')await sendPending();
      else if(action==='readback')await finishAccepted();
      else if(action==='refresh'){await refresh();session.notice='Read the current case. Preview again if its version changed.';}
      else if(action==='cash'){await persist();if(available())await onCash();}
      else if(action==='original-input')await openOriginalInputs();
      else if(action==='original-input-export')download(session.originalInputHandoff,'statement-original-inputs.json');
      else if(action==='draft-export')download(snapshot(),'statement-recovery.json');
      else if(action==='review-export')download(session.preview,'statement-review.json');
      else if(action==='draft-import'){
        const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
        input.addEventListener('change',()=>{void run(()=>importDraft(input.files?.[0]));},{once:true});input.click();
      }
      else if(action==='filter'){session.appliedQuery=session.query;session.page=0;}
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
  const earlier=mountEarlierStaffDesk({root,staffContext:pinnedContext,title:'Statement',
    readCopy:()=>statementStore(null)(current.program.id),isBusy:()=>loading||busy||hostBusy||!!session.inflight,setDeskBusy:value=>{busy=value;if(value)controls();else render();},
    describeCopy:value=>(value.inputs?.source?.filename||'Original statement')+' · '+(value.pending?'original import pending':value.accepted?'saved import response retained':'editable interpretation'),
    filename:'statement-earlier-recovery.json',
    openCopy:async value=>{assertStaffRequestActor(value.pending?.payload,pinnedContext);download(snapshot(),'statement-current-recovery.json');await importDraft(new File([JSON.stringify(value)],'statement-earlier-recovery.json',{type:'application/json'}));render();}
  });
  render();
  const ready=(async()=>{
    if(!session.loaded){
      if(!session.loadingDraft)session.loadingDraft=(async()=>{
        try{
          const saved=await storeDraft(current.program.id);
          if(saved?.schema==='sf47.statement-draft.v1'&&saved.caseId===current.program.id&&draftInput(saved.inputs)){session.inputs=editingInput(saved.inputs);session.headers=saved.headers||[];session.inspection=usableInspection(saved.inspection,saved.inputs,current.program.id)?saved.inspection:null;session.nativeScalesText=saved.nativeScalesText??scaleText(saved.inputs.statementOptions?.currencyScales);session.preview=saved.preview||null;session.dirty=saved.dirty!==false;session.pending=saved.pending||null;session.accepted=saved.accepted||null;session.setupPending=saved.setupPending||null;session.setupChoice=saved.setupChoice||'';session.setupName=saved.setupName||'';session.setupNote=saved.setupNote||'';session.originalInputHandoff=saved.originalInputHandoff||null;session.batchSelection=statementSelection(session.preview,saved.batchSelection).map(row=>row.rowNumber);if(saved.batchChange&&typeof saved.batchChange==='object')session.batchChange={...session.batchChange,...saved.batchChange};session.batchUndo=saved.batchUndo||null;}
        }catch{session.storageWarning='This browser could not open its saved draft. A downloaded recovery copy can be opened here.';}
        session.loaded=true;
      })();
      await session.loadingDraft;
    }
    if(available()&&session.incomingOriginalInputs){
      if(session.originalInputHandoff&&JSON.stringify(session.originalInputHandoff)!==JSON.stringify(session.incomingOriginalInputs))
        download(session.originalInputHandoff,'statement-previous-original-inputs.json');
      session.originalInputHandoff=clone(session.incomingOriginalInputs);delete session.incomingOriginalInputs;await persist();
      if(!session.pending&&!session.accepted&&!session.setupPending&&!session.inflight){try{await openOriginalInputs();}catch(error){session.error=error.message||String(error);}}
    }
    loading=false;
    if(session.preview?.expectedVersion!==current.program.version){clearBatch();session.dirty=true;session.confirmed=false;}
    if(available())render();
    if(session.inflight){try{await session.inflight;}catch{}if(available())render();}
    if(available()&&session.accepted)await run(finishAccepted);
  })();
  return {root,ready,dispose(){earlier.dispose();active=false;clearTimeout(persistTimer);if(session.loaded)void persist();},setHostBusy(value){hostBusy=!!value;controls();}};
}
