// Complete selected-invoice customer delivery through the original merchant.
export function mountMerchantDelivery(B){
 const $=id=>document.getElementById(id),node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 let selected=null,review=null;
 const owner=()=>B.identity(),same=v=>v?.storeId===owner()?.storeId&&v?.tenantId===owner()?.tenantId;
 const need=(v,message)=>{if(!v)throw Error(message);};
 function controls(){
  const ready=!!selected&&!!owner();
  $('customer-delivery-review').disabled=B.busy()||!ready;
  $('customer-delivery-download').disabled=B.busy()||!ready||!review;
  $('customer-delivery-download').hidden=!review;
 }
 function reset(){selected=null;review=null;$('customer-delivery-summary').replaceChildren();controls();}
 function select(id){if(selected!==id){selected=id;review=null;$('customer-delivery-summary').replaceChildren();}controls();}
 function paint(){
  const area=$('customer-delivery-summary');area.replaceChildren();if(!review)return;
  area.append(node('p',review.reference+' · '+review.title),node('p','Recorded state: '+review.state+'. Includes '+review.historyRecords+' original activity records.'));
  const prices=node('ul');for(const p of review.offers)prices.append(node('li',p.amount+' '+p.label+' · '+p.network));area.append(prices);
  area.append(node('p','Each payment option is an alternative quoted price.'));
  const files=node('ul');for(const name of review.members)files.append(node('li',name));area.append(node('h5','Complete customer files'),files);
  if(review.result)area.append(node('p','Delivered file: '+review.result.fileName+' · '+review.result.bytes.toLocaleString()+' bytes.'));
  else area.append(node('p','This edition contains the saved invoice and its available wallet request. Prepare another edition when the result has arrived.'));
  const detail=node('details');detail.append(node('summary','Selected original record'),node('p',review.invoiceId),node('p',review.revision));area.append(detail);
 }
 $('customer-delivery-review').addEventListener('click',()=>B.action(async()=>{
  const id=selected,identity=owner();need(id&&identity,'Select an original invoice.');
  const value=await B.api('/api/orders/'+id+'/delivery');
  need(selected===id&&same(identity)&&same(value.owner)&&value.invoiceId===id&&
   value.schema==='stellar-forge.merchant-invoice-delivery.v1'&&/^[a-f0-9]{64}$/.test(value.revision)&&
   Array.isArray(value.members)&&Array.isArray(value.offers),'The customer delivery differs from the original selected invoice.');
  review=value;paint();controls();B.notice('Review the original invoice, payment options and complete customer files, then download this edition.');
 }));
 $('customer-delivery-download').addEventListener('click',()=>B.action(async()=>{
  const chosen=review,id=selected,identity=owner();need(chosen&&chosen.invoiceId===id&&same(chosen.owner),'Review the selected invoice first.');
  let ticket;
  try{ticket=await B.api('/api/orders/'+id+'/delivery/export?revision='+encodeURIComponent(chosen.revision));}
  catch(error){if(error.code==='INVOICE_DELIVERY_CHANGED'){review=null;paint();controls();throw Error('This invoice changed after review. Prepare its current customer delivery and review the updated files.');}throw error;}
  need(selected===id&&review===chosen&&same(identity)&&same(ticket.source)&&
   ticket.source.revision===chosen.revision&&ticket.selection?.invoiceId===id&&ticket.selection?.revision===chosen.revision&&
   /^\/downloads\/invoices\/[0-9a-f-]{36}$/.test(ticket.url??'')&&/^[a-f0-9]{64}$/.test(ticket.sha256??'')&&
   Number.isSafeInteger(ticket.bytes)&&ticket.bytes>0,'The returned customer package differs from this reviewed invoice.');
  const a=node('a');a.href=ticket.url;a.download=ticket.fileName;a.referrerPolicy='no-referrer';document.body.append(a);a.click();a.remove();
  B.notice('The complete customer ZIP is downloading. Extract it and open index.html; review the actual invoice and delivered file before sending.');
 }));
 return {select,reset,controls};
}
