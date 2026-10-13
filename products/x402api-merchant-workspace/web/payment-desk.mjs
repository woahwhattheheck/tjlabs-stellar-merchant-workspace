// MIT. Original invoice-bound browser payment work and explicit response recovery.
const SCHEMA='stellar-forge.merchant-payment-work.v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const encoder=new TextEncoder();
const encoded=value=>JSON.stringify(value)+'\n';
const bytes=value=>encoder.encode(value);
const copy=value=>structuredClone(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const now=()=>new Date().toISOString();
async function digest(value) {
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function owner(value) {
 need(value&&UUID.test(value.storeId??'')&&UUID.test(value.tenantId??''),'Connect to the original merchant workspace.');
 return {storeId:value.storeId,tenantId:value.tenantId};
}
function signature(value) {
 need(typeof value==='string'&&/^[\x21-\x7e]{1,65536}$/.test(value),'Use the complete original buyer authorization, without surrounding spaces.');
 need(bytes(JSON.stringify({paymentSignature:value})).length<=70000,'This complete authorization exceeds the original payment server’s encoded size limit.');
 return value;
}
function invoice(value,id) {
 need(value?.order?.id===id&&typeof value.order.state==='string'&&Array.isArray(value.history),
  'The returned invoice differs from the selected original record.');
 return value;
}
function requestResponse(value,id) {
 need(value?.order?.id===id&&typeof value.order.state==='string','The returned payment response differs from the original invoice.');
 return value;
}
function nextMessage(order) {
 if(order.state==='COMPLETE')return 'Delivered. The original result is retained and verified before download.';
 if(order.state==='PAYMENT_FAILED'||order.state==='CHARGE_REJECTED')return 'Review the original provider outcome and invoice activity.';
 if(order.signatureRetained)return order.nextActionAt?
  'The original authorization is saved. Continue after '+new Date(order.nextActionAt).toLocaleString()+'.':
  'The original authorization is saved. Refresh its payment and delivery progress.';
 if(order.chargeId)return 'Review the original wallet request, then receive the buyer’s authorization for this invoice.';
 return 'Review the invoice terms, then create its original payment request.';
}
export function mountMerchantPayment({api,action,notice,identity,state,busy,capturing,changed}) {
 const $=id=>document.getElementById(id),works=new Map(),savedWork=new Map();
 let selected=null,selectedOwner=null,observed=null,renderedWork=null,revision=0;
 const key=(o,id)=>o.storeId+'\n'+o.tenantId+'\n'+id;
 function activeOwner(){return owner(identity());}
 function workFor(o,id) {
  const k=key(o,id);if(!works.has(k))works.set(k,{schema:SCHEMA,owner:copy(o),invoiceId:id,
   draft:{paymentSignature:'',envelope:null,envelopeSha256:null},pending:null,lastRead:null});
  return works.get(k);
 }
 function active() {
  need(selected&&selectedOwner&&same(activeOwner(),selectedOwner),'Choose the original invoice in the connected workspace.');
  return workFor(selectedOwner,selected);
 }
 function fixed(w) {
  need(selected===w.invoiceId&&same(activeOwner(),w.owner)&&same(selectedOwner,w.owner),
   'Keep the same original invoice selected for this action.');
 }
 function inputChanged() {
  if(!renderedWork||renderedWork.pending&&['DISPATCHED','UNKNOWN'].includes(renderedWork.pending.state))return;
  renderedWork.draft.paymentSignature=$('signature').value;revision++;
  controls();
 }
 function select(id) {
  selected=id;selectedOwner=identity()?activeOwner():null;observed=null;renderedWork=null;revision++;
  $('signature').value='';$('payment-work').hidden=true;$('payment-envelope-review').hidden=true;
 }
 function detach() {
  selected=null;selectedOwner=null;observed=null;renderedWork=null;revision++;
  $('signature').value='';$('payment-work').hidden=true;$('payment-envelope-review').hidden=true;
 }
 function pendingText(w) {
  const p=w.pending;if(!p)return w.draft.paymentSignature?'Authorization draft retained for this invoice in this tab.':'';
  const actionName={charge:'Payment request',authorize:'Buyer authorization',reconcile:'Payment refresh'}[p.action];
  return p.state==='PREPARED'?actionName+' is prepared for this invoice. Read its status or continue the original request.':
   p.state==='UNKNOWN'?actionName+' response was interrupted. Read the saved invoice or continue this exact original request.':
   p.state==='DISPATCHED'?actionName+' is being sent for this original invoice.':
   p.state==='REJECTED'?actionName+' returned '+(p.error||'a rejected response')+'. Read the saved invoice before continuing.':
   actionName+' response received. '+(p.received?.state?'Saved state: '+p.received.state+'.':'');
 }
 function controls() {
  if(!selected||!selectedOwner)return;
  const w=workFor(selectedOwner,selected),p=w.pending,locked=!!p&&['DISPATCHED','UNKNOWN'].includes(p.state);
  const stopped=busy()||capturing(),review=state()?.mode==='review',order=observed?.order;
  $('signature').readOnly=stopped||locked;
  $('signature-submit').disabled=stopped||review||locked||!w.draft.envelope||!w.draft.paymentSignature;
  $('payment-replay').disabled=stopped||review||!p||p.state==='DISPATCHED'||p.state==='RECEIVED';
  $('payment-read').disabled=busy();
  $('payment-save').disabled=busy();$('payment-open').disabled=busy();
  $('payment-file').disabled=busy();
  $('payment-edit').disabled=stopped||review||!p||p.state!=='REJECTED'||order?.signatureRetained===true;
  $('create-charge').disabled=stopped||review||!!order?.chargeId||order?.state==='CHARGE_REJECTED'||locked;
  $('reconcile').disabled=stopped||review||locked||!!(order?.nextActionAt&&Date.parse(order.nextActionAt)>Date.now()&&order.state!=='COMPLETE');
  $('download-envelope').disabled=busy()||!order?.chargeId;
 }
 async function observe(value) {
  if(!selected||!selectedOwner)return;
  const current=invoice(value,selected),w=workFor(selectedOwner,selected),p=w.pending;
  observed=current;renderedWork=w;
  // A matching original history digest proves whose authorization was retained.
  // A boolean signatureRetained alone cannot identify a concurrent operator's save.
  if(p&&['DISPATCHED','UNKNOWN'].includes(p.state)) {
   const original=p.action==='charge'&&!!current.order.chargeId||
    p.action==='authorize'&&current.history.some(h=>h.kind==='SIGNATURE_RETAINED'&&h.details?.sha256===p.signatureSha256);
   if(original){p.state='RECEIVED';p.uncertain=false;p.received={state:current.order.state,chargeId:current.order.chargeId??null,
    paymentId:current.order.paymentId??null};p.receivedAt=now();}
  }
  $('payment-work').hidden=false;
  $('payment-work-identity').textContent=current.order.reference+' · '+current.order.id;
  $('payment-next-action').textContent=nextMessage(current.order);
  $('payment-pending').textContent=pendingText(w);$('payment-pending').hidden=!$('payment-pending').textContent;
  $('signature').value=w.draft.paymentSignature;
  $('signature-form').hidden=state()?.mode==='review'||!current.order.chargeId||
   ['COMPLETE','PAYMENT_FAILED'].includes(current.order.state)||current.order.signatureRetained;
  $('payment-replay').hidden=!w.pending||w.pending.state==='RECEIVED';
  $('payment-edit').hidden=!w.pending||w.pending.state!=='REJECTED'||current.order.signatureRetained;
  const envelope=w.draft.envelope;
  $('payment-envelope-review').hidden=!envelope;
  $('payment-envelope-content').textContent=envelope?JSON.stringify(envelope,null,2):'';
  $('payment-envelope-sha').textContent=envelope?'Reviewed original request · '+w.draft.envelopeSha256:'';
  $('payment-review-note').textContent=envelope?
   'The authorization is bound to the reviewed request above. Keep the buyer’s original bytes.':
   'Download and review this invoice’s payment request before submitting its authorization.';
  controls();
 }
 async function reread() {
  const w=active();controls();const value=invoice(await api('/api/orders/'+w.invoiceId),w.invoiceId);fixed(w);
  w.lastRead={at:now(),state:value.order.state,chargeId:value.order.chargeId??null,paymentId:value.order.paymentId??null};
  await observe(value);return value;
 }
 async function envelopeFor(w) {
  const value=await api('/api/orders/'+w.invoiceId+'/envelope');fixed(w);
  need(value&&value.version===1&&typeof value.method==='string'&&typeof value.url==='string'&&
   typeof value.bodyBase64==='string'&&typeof value.paymentRequired==='string'&&typeof value.challengeDigest==='string',
   'Receive the complete original wallet request.');
  return {value,sha256:await digest(encoded(value))};
 }
 function downloadJSON(value,name,raw=encoded(value)) {
  const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.referrerPolicy='no-referrer';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 async function downloadEnvelope() {
  const w=active(),at=revision;controls();const received=await envelopeFor(w);fixed(w);
  need(at===revision,'The invoice draft changed while its request was being received. Review it again.');
  need(!w.draft.envelopeSha256||w.draft.envelopeSha256===received.sha256,
   'The selected original wallet request changed. Keep the retained work for review.');
  w.draft.envelope=copy(received.value);w.draft.envelopeSha256=received.sha256;
  await observe(observed);downloadJSON(received.value,'payment-request-'+w.invoiceId+'.json',JSON.stringify(received.value));
  notice('Original payment request received for '+observed.order.reference+'.');
 }
 async function prepare(kind) {
  const w=active();controls();
  need(state()?.mode!=='review'&&!capturing(),'Open the original operating merchant before sending a payment action.');
  need(!w.pending||!['DISPATCHED','UNKNOWN'].includes(w.pending.state),'Receive the original pending request first.');
  const at=revision,body=kind==='authorize'?{paymentSignature:signature(w.draft.paymentSignature)}:null;
  let envelopeSha256=null,signatureSha256=null;
  if(kind==='authorize') {
   need(w.draft.envelope&&SHA.test(w.draft.envelopeSha256??''),'Download and review this invoice’s original payment request first.');
   const current=await envelopeFor(w);
   need(current.sha256===w.draft.envelopeSha256,'The reviewed wallet request differs from this invoice.');
   envelopeSha256=current.sha256;signatureSha256=await digest(body.paymentSignature);
  }
  fixed(w);need(at===revision,'The invoice draft changed. Review it before sending.');
  const request={action:kind,invoiceId:w.invoiceId,owner:copy(w.owner),body,envelopeSha256,signatureSha256};
  const sha256=await digest(encoded(request));fixed(w);need(at===revision,'The invoice draft changed. Review it before sending.');
  w.pending={...request,sha256,state:'PREPARED',createdAt:now(),attempts:0};
  return {w,pending:w.pending};
 }
 async function send(w,p) {
  fixed(w);need(w.pending===p,'Keep the original pending invoice request.');
  need(state()?.mode!=='review'&&!capturing(),'Wait for the original operating workspace to resume.');
  if(p.action==='authorize') {
   signature(p.body.paymentSignature);
   const selectedEnvelope=await envelopeFor(w);
   need(selectedEnvelope.sha256===p.envelopeSha256,'The original pending request belongs to another wallet envelope.');
  }
  fixed(w);p.state='DISPATCHED';p.attempts++;p.lastAttemptAt=now();delete p.error;
  await observe(observed);controls();
  let value;
  try {
   value=await api('/api/orders/'+w.invoiceId+'/'+({charge:'charge',authorize:'payment-authorization',reconcile:'reconcile'}[p.action]),
    {method:'POST',...(p.body?{body:copy(p.body)}:{})});
   requestResponse(value,w.invoiceId);
  } catch(error) {
   p.state=Number.isInteger(error.status)&&error.status<500&&!p.uncertain?'REJECTED':'UNKNOWN';
   if(p.state==='UNKNOWN')p.uncertain=true;
   p.error=String(error.code||error.message||'Response interrupted').slice(0,500);
   if(selected===w.invoiceId&&same(identity(),w.owner)&&observed)await observe(observed);
   throw new Error(p.state==='UNKNOWN'?'The response was interrupted. The exact original request is retained for this invoice. Read its saved status before continuing.':
    p.error+' The original invoice request is retained; read its current saved status.');
  }
  p.state='RECEIVED';p.uncertain=false;p.receivedAt=now();p.received={state:value.order.state,chargeId:value.order.chargeId??null,paymentId:value.order.paymentId??null};
  if(p.action==='authorize')w.draft.paymentSignature='';
  if(selected===w.invoiceId&&same(identity(),w.owner)) {
   await changed();notice('Original '+({charge:'payment request',authorize:'authorization',reconcile:'payment update'}[p.action])+' response received.');
  }
  return value;
 }
 async function run(kind){const prepared=await prepare(kind);return send(prepared.w,prepared.pending);}
 async function replay() {
  const w=active(),p=w.pending;need(p&&p.state!=='DISPATCHED','Select the retained original request.');
  const original={action:p.action,invoiceId:p.invoiceId,owner:p.owner,body:p.body,envelopeSha256:p.envelopeSha256,signatureSha256:p.signatureSha256};
  need(await digest(encoded(original))===p.sha256,'The retained original payment request changed.');
  return send(w,p);
 }
 async function editable() {
  const w=active(),p=w.pending;need(p?.state==='REJECTED','Read the rejected original request first.');
  const current=await reread();fixed(w);
  need(!current.order.signatureRetained,'The original authorization is already retained. Continue that payment instead.');
  // A definite HTTP rejection has returned. An uncertain dispatch keeps its
  // original request; a read made during it never permits replacement.
  need(w.pending===p&&p.state==='REJECTED','Receive the pending original response first.');
  w.pending=null;await observe(current);notice('The rejected draft is available for correction on this same invoice.');
 }
 async function validateWork(value) {
  need(value?.schema===SCHEMA&&Object.hasOwn(value,'pending')&&Object.hasOwn(value,'lastRead')&&UUID.test(value.invoiceId??'')&&
   Object.keys(value.owner??{}).length===2&&owner(value.owner),
   'Open a complete original Merchant payment work file.');
  const w={schema:SCHEMA,owner:copy(value.owner),invoiceId:value.invoiceId,draft:copy(value.draft),pending:copy(value.pending),lastRead:copy(value.lastRead)};
  need(w.draft&&typeof w.draft.paymentSignature==='string'&&w.draft.paymentSignature.length<=65536,
   'Retain the complete original authorization draft.');
  if(w.draft.envelope!==null)need(SHA.test(w.draft.envelopeSha256??'')&&
   await digest(encoded(w.draft.envelope))===w.draft.envelopeSha256,'The retained wallet request differs from its digest.');
  else need(w.draft.envelopeSha256===null,'Keep the original wallet selection together.');
  if(w.pending) {
   const p=w.pending;need(['charge','authorize','reconcile'].includes(p.action)&&p.invoiceId===w.invoiceId&&same(p.owner,w.owner)&&
    ['PREPARED','DISPATCHED','UNKNOWN','RECEIVED','REJECTED'].includes(p.state)&&SHA.test(p.sha256??'')&&
    Number.isSafeInteger(p.attempts)&&p.attempts>=0&&typeof p.createdAt==='string'&&Number.isFinite(Date.parse(p.createdAt)),
    'Retain the original complete payment request.');
   if(p.action==='authorize') {
    need(p.body&&Object.keys(p.body).length===1&&Object.hasOwn(p.body,'paymentSignature'),'Keep the original authorization body.');
    signature(p.body.paymentSignature);
    need(SHA.test(p.envelopeSha256??'')&&p.envelopeSha256===w.draft.envelopeSha256&&
     await digest(p.body.paymentSignature)===p.signatureSha256,'Retain the original authorization and reviewed envelope.');
   } else need(p.body===null&&p.envelopeSha256===null&&p.signatureSha256===null,'Keep the original charge or reconciliation request.');
   const original={action:p.action,invoiceId:p.invoiceId,owner:p.owner,body:p.body,envelopeSha256:p.envelopeSha256,signatureSha256:p.signatureSha256};
   need(await digest(encoded(original))===p.sha256,'The complete original request digest differs.');
   // Imported browser metadata is not a server receipt. Read the current
   // original invoice before receiving or explicitly continuing this request.
   p.state='UNKNOWN';p.uncertain=true;
  }
  need(bytes(encoded(w)).length<=1048576,'Use a complete payment work file within one MiB.');
  return w;
 }
 async function importWork(file) {
  need(file&&file.size<=1048576,'Choose a complete payment work JSON file within one MiB.');
  const w=await validateWork(JSON.parse(await file.text())),current=active();fixed(current);
  need(w.invoiceId===current.invoiceId&&same(w.owner,current.owner),'Choose this file’s original invoice in its original workspace.');
  if(current.pending)need(w.pending?.sha256===current.pending.sha256,'Preserve the local original request before opening another edition.');
  const changedDraft=current.draft.paymentSignature&&current.draft.paymentSignature!==w.draft.paymentSignature;
  need(!changedDraft||window.confirm('Replace this invoice’s edited draft with the selected saved payment work?'),
   'The local invoice draft was kept.');
  works.set(key(w.owner,w.invoiceId),w);revision++;await reread();
  notice('Original payment work reopened. Review the current saved invoice before continuing.');
 }
 function dirty() {
  return [...works.values()].some(w=>(w.draft.paymentSignature||w.pending&&['PREPARED','DISPATCHED','UNKNOWN','REJECTED'].includes(w.pending.state))&&
   savedWork.get(key(w.owner,w.invoiceId))!==encoded(w));
 }
 $('signature').addEventListener('input',inputChanged);
 $('create-charge').addEventListener('click',()=>action(()=>run('charge')));
 $('download-envelope').addEventListener('click',()=>action(downloadEnvelope));
 $('reconcile').addEventListener('click',()=>action(()=>run('reconcile')));
 $('signature-form').addEventListener('submit',event=>{event.preventDefault();action(()=>run('authorize'));});
 $('payment-read').addEventListener('click',()=>action(reread));
 $('payment-replay').addEventListener('click',()=>action(replay));
 $('payment-edit').addEventListener('click',()=>action(editable));
 $('payment-save').addEventListener('click',()=>action(async()=>{
  const w=active();need(bytes(encoded(w)).length<=1048576,'Keep the complete original payment work within one MiB.');
  downloadJSON(w,'merchant-payment-work-'+w.invoiceId+'.json');savedWork.set(key(w.owner,w.invoiceId),encoded(w));
  notice('Private payment work saved for this original invoice.');
 }));
 $('payment-open').addEventListener('click',()=>$('payment-file').click());
 $('payment-file').addEventListener('change',()=>{const file=$('payment-file').files?.[0];action(async()=>{
  try{await importWork(file);}finally{$('payment-file').value='';}
 });});
 window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
 return {select,detach,observe,controls,hasRetainedWork:dirty};
}
