/* MIT. Offline view of the existing complete merchant handover. */
'use strict';
const handover = globalThis.MerchantHandover;
const byId = id => document.getElementById(id);
const element = (tag,text,className) => {
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(className)node.className=className;
  return node;
};
const href = path => path.split('/').map(encodeURIComponent).join('/');
const link = (path,label,name) => {
  const node=element('a',label);node.href=href(path);
  if(name)node.download=name;
  return node;
};
const bytes = value => new Intl.NumberFormat('en-US').format(value)+' bytes';
byId('edition').textContent='Saved '+new Date(handover.createdAt).toLocaleString()+' · Complete private workspace';
byId('invoice-count').textContent=String(handover.orders.length);
byId('completed-count').textContent=String(handover.orders.filter(order=>order.state==='COMPLETE').length);
byId('result-count').textContent=String(handover.orders.filter(order=>order.result).length);
byId('store-id').textContent='Store '+handover.storeId+' · Created '+handover.storeCreatedAt;
const detail=byId('detail'),detailContent=byId('detail-content');
function showOrder(order) {
  byId('detail-heading').textContent=order.reference+' · '+order.title;
  detailContent.replaceChildren();
  const metadata=element('dl',undefined,'metadata');
  for(const [label,value]of[['Invoice',order.id],['Status',order.state],['Payment',order.paymentId??'Awaiting payment'],['Updated',order.updatedAt]]){
    metadata.append(element('dt',label),element('dd',value));
  }
  detailContent.append(metadata,link(order.recordPath,'Download complete invoice record',order.id+'.json'));
  if(order.result){
    const result=element('section',undefined,'result');
    result.append(element('h3','Retained delivery'),link(order.result.relativePath,'Download '+order.result.fileName,order.result.fileName),
      element('p',bytes(order.result.bytes)),element('p','SHA256 '+order.result.sha256,'digest'));
    detailContent.append(result);
  }
  detailContent.append(element('h3','Original history'));
  const history=element('ol',undefined,'history');
  for(const event of order.history){
    const item=element('li'),details=element('details');
    const summary=element('summary',event.sequence+' · '+event.kind);
    details.append(summary,element('p',event.at,'muted'),element('pre',JSON.stringify(event.details,null,2)));
    item.append(details);history.append(item);
  }
  detailContent.append(history,element('h3','Retained provider responses'));
  const exchanges=element('div',undefined,'exchange-list');
  for(const exchange of order.exchanges){
    const row=element('div',undefined,'exchange');
    row.append(element('strong',exchange.kind),element('span','HTTP '+(exchange.status??'unavailable')+' · '+exchange.at));
    if(exchange.raw)row.append(link(exchange.raw.path,'Open original response · '+bytes(exchange.raw.bytes),'exchange-'+exchange.sequence+'.bin'));
    exchanges.append(row);
  }
  detailContent.append(exchanges);detail.hidden=false;
  detail.scrollIntoView({behavior:'auto',block:'start'});
  byId('detail-heading').setAttribute('tabindex','-1');byId('detail-heading').focus({preventScroll:true});
}
function render() {
  const query=byId('search').value.trim().toLocaleLowerCase();
  const list=byId('invoices');list.replaceChildren();
  const selected=handover.orders.filter(order=>[order.reference,order.title,order.id,order.paymentId??''].some(value=>value.toLocaleLowerCase().includes(query)));
  if(!selected.length){list.append(element('p','No matching invoice.','empty'));return;}
  for(const order of selected){
    const article=element('article',undefined,'invoice');article.dataset.orderId=order.id;
    const description=element('div',undefined,'invoice-description');
    description.append(element('h3',order.reference),element('p',order.title),element('p',order.paymentId??order.id,'identifier'));
    const actions=element('div',undefined,'invoice-actions'),button=element('button','View details');
    button.type='button';button.addEventListener('click',()=>showOrder(order));actions.append(button);
    if(order.result)actions.append(link(order.result.relativePath,'Download delivery',order.result.fileName));
    article.append(description,element('span',order.state,'status'),actions);list.append(article);
  }
}
byId('search').addEventListener('input',render);
byId('close-detail').addEventListener('click',()=>{detail.hidden=true;byId('search').focus();});
render();
