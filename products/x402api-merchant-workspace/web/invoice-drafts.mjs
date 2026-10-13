// MIT. Complete private working copies for the original merchant invoice writer.
export const FORMAT='stellar-forge.merchant-invoice-working-copy.v1';
export const MAX_FILE_BYTES=262144, MAX_DRAFTS=128;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clone=value=>JSON.parse(JSON.stringify(value));
export function need(ok,message){if(!ok)throw new Error(message);}
export function canonical(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
export function same(a,b){return canonical(a)===canonical(b);}
export function identity(value){need(value&&UUID.test(value.storeId)&&UUID.test(value.tenantId),'Select the original merchant store and tenant.');return {storeId:value.storeId,tenantId:value.tenantId};}
function text(value,max,label){need(typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value),'Keep a complete '+label+' of at most '+max+' characters.');return value;}
export function terms(config){need(config&&typeof config.publicOrigin==='string'&&config.template&&Array.isArray(config.template.rails),'Read the configured invoice terms.');return clone({publicOrigin:config.publicOrigin,template:config.template});}
export function fields(value){
 need(value&&Array.isArray(value.prices)&&value.prices.length<=16,'Keep all selected payment options.');
 const seen=new Set();return {reference:text(value.reference,120,'invoice reference'),title:text(value.title,180,'description'),
 prices:value.prices.map(price=>{need(price&&typeof price.assetId==='string'&&price.assetId.length<=512&&!seen.has(price.assetId),'Keep one entry for each configured asset.');seen.add(price.assetId);
 need(typeof price.selected==='boolean','Keep the payment option selection.');
 return {assetId:price.assetId,selected:price.selected,amount:text(price.amount,120,'decimal amount')};})};
}
export function atomic(value,decimals){
 need(Number.isInteger(decimals)&&decimals>=0&&decimals<=30,'Keep the original asset precision.');
 need(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value),'Enter a decimal amount such as 12.75.');
 const [whole,fraction='']=value.split('.');need(fraction.length<=decimals,'The entered price exceeds this asset’s decimal precision.');
 const result=(whole+fraction.padEnd(decimals,'0')).replace(/^0+(?=[0-9])/,'');
 need(/^[1-9][0-9]{0,77}$/.test(result),'Enter a positive price.');return result;
}
export function decimal(value,places){const p=value.padStart(places+1,'0');return places?p.slice(0,-places)+'.'+p.slice(-places):value;}
export function requestFor(record){
 const f=fields(record.fields);need(f.reference.length&&f.title.length,'Enter the invoice reference and description.');
 const prices=f.prices.filter(p=>p.selected).map(price=>{
  const rail=record.terms.template.rails.find(r=>r.assetId===price.assetId);need(rail,'This selected payment option is missing from the retained terms.');
  return {assetId:price.assetId,amountAtomic:atomic(price.amount,rail.decimals)};
 });
 need(prices.length,'Select at least one payment option.');
 return {id:record.id,reference:f.reference,title:f.title,prices,expectedTerms:clone(record.terms)};
}
export function create(identityValue,config,{id=crypto.randomUUID(),time=new Date().toISOString()}={}){
 const selected=identity(identityValue),original=terms(config);need(UUID.test(id),'Keep the original draft identity.');
 return {format:FORMAT,id,owner:selected,revision:0,label:'Untitled invoice',createdAt:time,updatedAt:time,terms:original,
 fields:{reference:'',title:'',prices:original.template.rails.map(r=>({assetId:r.assetId,selected:original.template.rails.length===1,amount:''}))},
 request:null,receipt:null,lastError:null};
}
export function validate(input,owner){
 need(input&&input.format===FORMAT&&UUID.test(input.id),'Open a complete merchant invoice working copy.');
 identity(input.owner);if(owner)need(same(identity(owner),identity(input.owner)),'This working copy belongs to a different merchant store or tenant.');
 need(Number.isSafeInteger(input.revision)&&input.revision>=0,'Keep the saved working-copy revision.');
 text(input.label,180,'working-copy name');need(input.label.length,'Name this working copy.');
 for(const key of ['createdAt','updatedAt'])need(typeof input[key]==='string'&&Number.isFinite(Date.parse(input[key])),'Keep the original working-copy dates.');
 const out=clone(input);out.fields=fields(input.fields);out.terms=terms(input.terms);
 need(Array.isArray(out.terms.template.rails)&&out.terms.template.rails.length>=1&&out.terms.template.rails.length<=16,'Keep the complete configured payment options.');
 const rails=new Set();for(const rail of out.terms.template.rails){need(rail&&typeof rail.assetId==='string'&&!rails.has(rail.assetId)&&Number.isInteger(rail.decimals)&&rail.decimals>=0&&rail.decimals<=30,'Keep the original unique asset definitions.');rails.add(rail.assetId);}
 need(out.fields.prices.length===rails.size&&out.fields.prices.every(p=>rails.has(p.assetId)),'Keep each original asset field, including unselected options.');
 if(out.request!==null)need(same(out.request,requestFor(out)),'The retained invoice request differs from its exact reviewed terms.');
 if(out.receipt!==null){need(out.request&&out.receipt.id===out.request.id&&typeof out.receipt.receivedAt==='string','Keep the original saved-invoice receipt.');}
 need(out.lastError===null||typeof out.lastError==='string'&&out.lastError.length<=2000,'Keep the complete original request status.');
 need(new TextEncoder().encode(JSON.stringify(out)+'\n').length<=MAX_FILE_BYTES,'This complete working copy exceeds 256 KiB.');
 return out;
}
export function encode(record){return JSON.stringify(validate(record))+'\n';}
export function decode(raw,owner){need(typeof raw==='string'&&new TextEncoder().encode(raw).length<=MAX_FILE_BYTES,'Open a complete working-copy JSON file up to 256 KiB.');return validate(JSON.parse(raw),owner);}
export function edit(record,input){need(!record.request,'Continue the original retained invoice request before changing its terms.');return validate({...clone(record),...input,request:null,receipt:null});}
export function prepare(record,config){
 need(same(record.terms,terms(config)),'The configured terms changed. Review and adopt the current terms before saving the invoice.');
 const next=clone(record);next.request=next.request||requestFor(next);next.lastError=null;return validate(next);
}
export function adopt(record,config){
 need(!record.request,'Keep the original submitted invoice and its reviewed terms.');
 const current=terms(config),old=new Map(record.fields.prices.map(p=>[p.assetId,p]));
 const prices=current.template.rails.map(r=>old.has(r.assetId)?clone(old.get(r.assetId)):{assetId:r.assetId,selected:false,amount:''});
 return validate({...clone(record),terms:current,fields:{...record.fields,prices}});
}
export function observe(record,order,time=new Date().toISOString()){
 need(record.request&&order&&order.id===record.id&&order.frozen?.tenantId===record.owner.tenantId,'Read the exact original saved invoice.');
 const expected=record.request,prices=order.frozen.rails.map(r=>({assetId:r.assetId,amountAtomic:r.amountAtomic}));
 need(order.reference===expected.reference&&order.title===expected.title&&same(prices,expected.prices)&&
 same(order.frozen.template,expected.expectedTerms.template)&&
 order.frozen.request.url===expected.expectedTerms.publicOrigin+'/orders/'+record.id+'/pay',
 'The saved invoice differs from the retained original request. Keep this working copy for recovery.');
 return validate({...clone(record),receipt:{id:record.id,receivedAt:record.receipt?.receivedAt||time},lastError:null});
}
