// MIT. Runs entirely inside the published, customer-only account document.
(() => {
'use strict';
const $=selector=>document.querySelector(selector);
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>{if(!value)return'—';const d=new Date(String(value).slice(0,10)+'T00:00:00Z');return Number.isNaN(d.valueOf())?String(value):new Intl.DateTimeFormat('en',{dateStyle:'medium',timeZone:'UTC'}).format(d);};
const today=()=>new Date().toISOString().slice(0,10);
const uuid=()=>crypto.randomUUID();
const key='merchant-customer-account:'+ACCOUNT.binding.workspaceId+':'+ACCOUNT.binding.publicationId;
const S={tab:'account',selected:'',editor:null,draft:null,exported:false,storageError:false,change:0};
const fresh=()=>({schema:'stellar-forge.merchant-customer-account-response.v1',id:uuid(),account:ACCOUNT.binding,
  responseDate:today(),author:{name:ACCOUNT.account.customer.name||'',reference:''},items:[]});
try{const old=localStorage.getItem(key);S.draft=old?JSON.parse(old):fresh();S.exported=Boolean(S.draft._exported);
  if(S.draft.account.sourceSha256!==ACCOUNT.binding.sourceSha256)throw Error('Source changed');}catch{S.draft=fresh();}
function notice(text,error=false){$('#notice').textContent=text;$('#notice').className=text?'notice'+(error?' error':''):'';}
function persist(){try{localStorage.setItem(key,JSON.stringify({...S.draft,_exported:S.exported}));}
  catch{S.storageError=true;notice('Browser storage is unavailable. Download your response draft before closing this account.',true);}}
function editing(){S.change++;if(S.exported){S.draft.previousResponseId=S.draft.id;S.draft.id=uuid();S.exported=false;}}
const invoice=id=>ACCOUNT.account.invoices.find(row=>row.id===id);
const money=(amount,currency)=>e(currency?.code||'')+' '+e(amount??'—');
const label=kind=>({NOTE:'Message',PROMISE:'Payment promise',DISPUTE:'Invoice dispute',PAYMENT_NOTICE:'Payment information'}[kind]||kind);
const button=(text,action,attrs='')=>'<button type="button" data-action="'+e(action)+'" '+attrs+'>'+e(text)+'</button>';
const download=(name,text,type='application/json')=>{const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function units(value,currency){if(!/^\d+(?:\.\d+)?$/.test(String(value)))throw Error('Enter a positive decimal amount.');
  const [whole,fraction='']=String(value).split('.');if(fraction.length>currency.scale)throw Error('Use at most '+currency.scale+' decimal places for '+currency.code+'.');
  return BigInt(whole+fraction.padEnd(currency.scale,'0'));}
function validateItem(item){
  const row=invoice(item.invoiceId);if(!row)throw Error('Choose an invoice from this account.');
  if(!['NOTE','PROMISE','DISPUTE','PAYMENT_NOTICE'].includes(item.kind))throw Error('Choose a response type.');
  if(!String(item.note||'').trim()||item.note.length>6000)throw Error('Enter a message of at most6,000 characters.');
  if(item.kind!=='NOTE'){const n=units(item.amount,row.currency);if(n<=0n)throw Error('Enter a positive amount.');
    if(item.kind!=='PAYMENT_NOTICE'&&n>units(row.amountDue,row.currency))throw Error('The proposed amount exceeds this dated account. Ask the merchant to issue a current account if needed.');}
  if(item.kind==='PROMISE'&&(!item.dueDate||item.dueDate<S.draft.responseDate))throw Error('Choose a promise date on or after the response date.');
  if(item.kind==='DISPUTE'&&!['PRICING','DELIVERY','DUPLICATE','OTHER'].includes(item.category))throw Error('Choose a dispute category.');
  if(item.kind==='PAYMENT_NOTICE'&&(!item.paymentDate||item.paymentDate>S.draft.responseDate||!String(item.paymentReference||'').trim()))throw Error('Retain the payment date and reference.');
}
function values(){const value=JSON.parse(JSON.stringify(S.draft));delete value._exported;return value;}
function validateResponse(){
  if(!S.draft.author.name.trim()||S.draft.author.name.length>300)throw Error('Enter the name of the person preparing this response.');
  if(S.draft.author.reference.length>1000)throw Error('Keep the contact/reference within1,000 characters.');
  if(!S.draft.responseDate||S.draft.responseDate<ACCOUNT.binding.asOf||S.draft.responseDate>today())throw Error('Choose a response date between this account date and today.');
  if(!S.draft.items.length||S.draft.items.length>500)throw Error('Add between one and500 invoice entries.');
  S.draft.items.forEach(validateItem);
}
function sourceLinks(row){
  return ACCOUNT.files.filter(file=>file.name.startsWith('documents/'+row.number+'-'))
    .map(file=>'<a href="'+e(file.name)+'" download>'+e(file.name.split('/').pop().replace(row.number+'-',''))+'</a>').join(' · ');
}
function account(){
 return '<h2>Account overview</h2><p>This account is dated '+e(date(ACCOUNT.binding.asOf))+'. Later payments and corrections will appear in a later account from the merchant.</p>'+
 '<div class="cards">'+ACCOUNT.account.currencies.map(row=>'<section class="card"><h3>'+e(row.currency.code)+'</h3><dl>'+
 '<dt>Amount due</dt><dd>'+e(row.amountDue)+'</dd><dt>Credit balance</dt><dd>'+e(row.creditBalance)+'</dd>'+
 '<dt>Unapplied payments</dt><dd>'+e(row.unappliedPayments)+'</dd><dt>Refunds reserved</dt><dd>'+e(row.reservedRefunds)+'</dd>'+
 '<dt>Payments refunded</dt><dd>'+e(row.refundedPayments)+'</dd></dl></section>').join('')+'</div>'+
 '<h3>Continue the account</h3><p>Open an invoice to inspect its original charges and payment instructions. Use Respond to prepare messages, promises, disputes or payment information for the merchant.</p>'+
 '<p>Your response stays on this computer until you download it and return it through your usual contact channel. The merchant reviews the current account before recording changes.</p>'+
 button('Review invoices','tab','data-tab="invoices"')+' '+button('Prepare a response','tab','data-tab="respond"');
}
function invoices(){
 const rows=ACCOUNT.account.invoices;
 return '<h2>Invoices</h2><div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Due</th><th>Total</th><th>Paid</th><th>Credit</th><th>Due now</th><th>Original documents</th><th></th></tr></thead><tbody>'+
 rows.map(row=>'<tr><td>'+e(row.number)+'<br><small>'+e(row.paymentStatus)+'</small></td><td>'+e(date(row.dueDate))+'</td>'+
 '<td>'+money(row.total,row.currency)+'</td><td>'+money(row.paid,row.currency)+'</td><td>'+money(row.credited,row.currency)+'</td>'+
 '<td>'+money(row.amountDue,row.currency)+'</td><td>'+sourceLinks(row)+'</td><td>'+button('Respond','add','data-invoice="'+e(row.id)+'"')+'</td></tr>').join('')+
 '</tbody></table></div><h3>Credit notes</h3><div class="table-wrap"><table><thead><tr><th>Credit</th><th>Date</th><th>Amount</th><th>Reason</th><th>Original documents</th></tr></thead><tbody>'+
 ACCOUNT.account.credits.map(row=>'<tr><td>'+e(row.number)+'</td><td>'+e(date(row.creditDate))+'</td><td>'+money(row.total,row.currency)+'</td><td>'+e(row.reason)+'</td><td>'+sourceLinks(row)+'</td></tr>').join('')+
 '</tbody></table></div>';
}
function payments(){
 return '<h2>Customer payments</h2><div class="table-wrap"><table><thead><tr><th>Reference</th><th>Received</th><th>Account date</th><th>Gross</th><th>Allocated</th><th>Refunded</th><th>Available</th></tr></thead><tbody>'+
 ACCOUNT.account.receipts.map(row=>'<tr><td>'+e(row.reference||'Payment')+'<br><small>'+e(row.method)+'</small></td><td>'+e(date(row.receivedDate))+'</td>'+
 '<td>'+e(date(row.accountingDate))+'</td><td>'+money(row.amount,row.currency)+'</td><td>'+money(row.allocated,row.currency)+'</td>'+
 '<td>'+money(row.refunded,row.currency)+'</td><td>'+money(row.available,row.currency)+'</td></tr>').join('')+'</tbody></table></div>'+
 '<h3>Invoice allocations</h3><div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Receipt</th><th>Amount</th><th>Allocated</th><th>Released</th></tr></thead><tbody>'+
 ACCOUNT.account.allocations.map(row=>'<tr><td>'+e(invoice(row.invoiceId)?.number||row.invoiceId)+'</td><td>'+e(ACCOUNT.account.receipts.find(x=>x.id===row.receiptId)?.reference||row.receiptId)+'</td>'+
 '<td>'+money(row.amount,row.currency)+'</td><td>'+e(date(row.allocatedDate))+'</td><td>'+e(date(row.releasedDate))+'</td></tr>').join('')+'</tbody></table></div>'+
 '<h3>Refunds</h3><div class="table-wrap"><table><thead><tr><th>Reference</th><th>Account date</th><th>Amount</th><th>Status</th></tr></thead><tbody>'+
 ACCOUNT.account.refunds.map(row=>'<tr><td>'+e(row.reference||'Refund')+'</td><td>'+e(date(row.accountingDate||row.effectiveDate))+'</td><td>'+money(row.amount,row.currency)+'</td><td>'+e(row.effectiveStatus)+'</td></tr>').join('')+
 '</tbody></table></div><p>Report a payment from its invoice using Payment information. Include the original date and reference so the merchant can locate it.</p>';
}
function field(name,text,value,type='text',extra=''){return '<label>'+e(text)+'<input name="'+name+'" type="'+type+'" value="'+e(value??'')+'" '+extra+'></label>';}
function select(name,text,value,rows){return '<label>'+e(text)+'<select name="'+name+'">'+rows.map(([id,title])=>'<option value="'+e(id)+'"'+(id===value?' selected':'')+'>'+e(title)+'</option>').join('')+'</select></label>';}
function editor(){
 const item=S.editor;if(!item)return'';const row=invoice(item.invoiceId);
 return '<section class="card"><h3>'+e(row.number)+' · '+e(label(item.kind))+'</h3><p>Account balance '+money(row.amountDue,row.currency)+' as of '+e(date(ACCOUNT.binding.asOf))+'</p>'+
 '<form id="entry-form">'+select('kind','Response type',item.kind,['NOTE','PROMISE','DISPUTE','PAYMENT_NOTICE'].map(x=>[x,label(x)]))+
 (item.kind!=='NOTE'?field('amount','Amount ('+row.currency.code+'; '+row.currency.scale+' decimal places)',item.amount,'text','inputmode="decimal" required'):'')+
 (item.kind==='PROMISE'?field('dueDate','Promised payment date',item.dueDate,'date','required'):'')+
 (item.kind==='DISPUTE'?select('category','Dispute category',item.category||'OTHER',['PRICING','DELIVERY','DUPLICATE','OTHER'].map(x=>[x,x.charAt(0)+x.slice(1).toLowerCase()])):'')+
 (item.kind==='PAYMENT_NOTICE'?field('paymentDate','Reported payment date',item.paymentDate,'date','required')+field('paymentReference','Payment reference',item.paymentReference,'text','maxlength="1000" required'):'')+
 '<label>Message<textarea name="note" rows="6" maxlength="6000" required>'+e(item.note||'')+'</textarea></label>'+
 '<div class="actions"><button type="submit">Save response entry</button>'+button('Keep editor for later','close-editor')+'</div></form></section>';
}
function respond(){
 return '<h2>Your response</h2><p>Return the downloaded JSON to the merchant using your usual contact channel. Keep the original complete account folder and your response together.</p>'+
 '<form id="response-header" class="fields">'+field('authorName','Your name',S.draft.author.name,'text','maxlength="300"')+
 field('authorReference','Contact or reference',S.draft.author.reference,'text','maxlength="1000"')+
 field('responseDate','Response date',S.draft.responseDate,'date')+'</form>'+
 '<div class="actions">'+button('Add invoice entry','new-entry')+button('Download complete response','export-response')+
 button('Download saved entries','export-draft')+'<label class="file-button">Reopen response JSON<input id="import-response" type="file" accept=".json,application/json"></label></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Type</th><th>Message and amount</th><th></th></tr></thead><tbody>'+
 S.draft.items.map(item=>'<tr><td>'+e(invoice(item.invoiceId)?.number)+'</td><td>'+e(label(item.kind))+'</td><td><p>'+e(item.note)+'</p>'+
 (item.amount?money(item.amount,invoice(item.invoiceId).currency):'')+(item.dueDate?' · '+e(date(item.dueDate)):'')+'</td><td>'+
 button('Edit','edit','data-id="'+e(item.id)+'"')+' '+button('Remove','remove','data-id="'+e(item.id)+'"')+'</td></tr>').join('')+
 '</tbody></table></div>'+editor()+'<details><summary>Response reference</summary><p>'+e(S.draft.id)+'</p>'+
 (S.draft.previousResponseId?'<p>Following response '+e(S.draft.previousResponseId)+'</p>':'')+'</details>';
}
function documents(){
 return '<h2>Complete original files</h2><p>These links open the original files in this account folder. Keep the folder structure when moving it.</p>'+
 '<div class="table-wrap"><table><thead><tr><th>File</th><th>Bytes</th><th>Source identity</th></tr></thead><tbody>'+
 ACCOUNT.files.map(file=>'<tr><td><a href="'+e(file.name)+'" download>'+e(file.name)+'</a></td><td>'+e(file.bytes)+'</td><td><details><summary>SHA-256</summary><code>'+e(file.sha256)+'</code></details></td></tr>').join('')+
 '</tbody></table></div><details><summary>Original account reference</summary><pre>'+e(JSON.stringify(ACCOUNT.binding,null,2))+'</pre></details>';
}
function render(){
 $('#account-title').textContent=ACCOUNT.account.customer.name+' · As of '+date(ACCOUNT.binding.asOf);
 $('#tabs').innerHTML=[['account','Account'],['invoices','Invoices and credits'],['payments','Payments'],['respond','Respond'],['documents','Original files']]
 .map(([tab,name])=>button(name,'tab','data-tab="'+tab+'"'+(S.tab===tab?' aria-current="page"':''))).join('');
 $('#content').innerHTML=({account,invoices,payments,respond,documents}[S.tab]||account)();
}
function captureEditor(form){if(!S.editor)return;for(const [name,value]of new FormData(form))S.editor[name]=value;}
document.addEventListener('input',event=>{
 if(event.target.closest('#response-header')){editing();const name=event.target.name,value=event.target.value;
   if(name==='authorName')S.draft.author.name=value;else if(name==='authorReference')S.draft.author.reference=value;else S.draft.responseDate=value;persist();}
 if(event.target.closest('#entry-form')){S.change++;captureEditor(event.target.form);try{localStorage.setItem(key+':editor',JSON.stringify(S.editor));}catch{}}
});
document.addEventListener('change',async event=>{
 try{
  if(event.target.name==='kind'&&event.target.closest('#entry-form')){S.change++;captureEditor(event.target.form);render();}
  if(event.target.id==='import-response'){
   const file=event.target.files?.[0];if(!file)return;if(file.size>1500000)throw Error('Choose a complete response JSON up to1.5 MB.');
   const change=S.change,loaded=JSON.parse(await file.text());
   if(change!==S.change)throw Error('The response changed while the file was opening. Choose the file again to replace the current form.');
   if(loaded.schema!=='stellar-forge.merchant-customer-account-response.v1'||!loaded.account||
     Object.entries(ACCOUNT.binding).some(([key,value])=>loaded.account[key]!==value)||!Array.isArray(loaded.items)||!loaded.author)throw Error('This response belongs to a different account.');
   const old=S.draft;S.draft=loaded;try{validateResponse();}catch(error){S.draft=old;throw error;}
   S.exported=true;S.editor=null;S.change++;try{localStorage.removeItem(key+':editor');}catch{}persist();render();notice('The complete response reopened. Editing creates a following response with its own reference.');
  }
 }catch(error){notice(error.message,true);}
});
document.addEventListener('submit',event=>{
 if(event.target.id!=='entry-form'){event.preventDefault();return;}event.preventDefault();
 try{captureEditor(event.target);validateItem(S.editor);editing();const index=S.draft.items.findIndex(item=>item.id===S.editor.id);
  const item={id:S.editor.id,invoiceId:S.editor.invoiceId,kind:S.editor.kind,note:S.editor.note};
  for(const name of ({NOTE:[],PROMISE:['amount','dueDate'],DISPUTE:['amount','category'],PAYMENT_NOTICE:['amount','paymentDate','paymentReference']}[item.kind]))item[name]=S.editor[name];
  if(index>=0)S.draft.items[index]=item;else S.draft.items.push(item);S.editor=null;persist();try{localStorage.removeItem(key+':editor');}catch{}render();notice('Response entry retained on this computer.');
 }catch(error){notice(error.message,true);}
});
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-action]');if(!target)return;
 try{
  const action=target.dataset.action;
  if(action==='tab'){S.tab=target.dataset.tab;render();}
  else if(action==='new-entry'){if(S.editor)throw Error('Save the open response entry before adding another.');S.tab='invoices';render();notice('Choose Respond beside the invoice.');}
  else if(action==='add'){if(S.editor)throw Error('Save the open response entry before choosing another invoice.');S.editor={id:uuid(),invoiceId:target.dataset.invoice,kind:'NOTE',note:'',amount:invoice(target.dataset.invoice).amountDue,dueDate:today(),paymentDate:today(),category:'OTHER'};S.tab='respond';render();}
  else if(action==='edit'){if(S.editor)throw Error('Save the open response entry before editing another.');S.editor=JSON.parse(JSON.stringify(S.draft.items.find(item=>item.id===target.dataset.id)));render();}
  else if(action==='remove'){editing();S.draft.items=S.draft.items.filter(item=>item.id!==target.dataset.id);persist();render();}
  else if(action==='close-editor'){S.tab='invoices';render();notice('Your open response entry is retained. Return to Respond to continue it.');}
  else if(action==='export-response'){
   if(S.editor)throw Error('Save the open response entry before downloading the complete response.');
   validateResponse();download('customer-response-'+S.draft.id+'.json',JSON.stringify(values(),null,2)+'\n');S.exported=true;persist();notice('Complete response downloaded. Return this JSON through your usual merchant contact channel.');}
  else if(action==='export-draft'){if(S.editor)throw Error('Save the open entry before downloading.');validateResponse();download('customer-response-'+S.draft.id+'.json',JSON.stringify(values(),null,2)+'\n');S.exported=true;persist();}
 }catch(error){notice(error.message,true);}
});
try{const parked=localStorage.getItem(key+':editor');if(parked){const entry=JSON.parse(parked);if(invoice(entry.invoiceId))S.editor=entry;}}catch{}
render();
})();