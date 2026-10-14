import {createHash} from 'node:crypto';
import {createCatalogWorkflow,catalogCsv} from './catalog-workflow.mjs';
export async function runCatalogCourse({createCatalogWorkflow,catalogCsv,sha256,byteLength}){
const api=createCatalogWorkflow({sha256,byteLength}),checks=[];
const check=(value,name)=>{if(!value)throw new Error(name);checks.push(name);};
const expectError=async(fn,code)=>{try{await fn();throw new Error('Expected '+code);}catch(e){if(e.code!==code)throw e;}};
const profile={name:'Engineering response envelope',itemsPointer:'/extractor/result/items',statusPointer:'/info/statusCode',finalUrlPointer:'/info/finalUrl',billingPointer:'/info/billingPoints'};
const targets=[{id:'coffee',label:'Coffee 250g',retailer:'Engineering retailer',url:'https://example.com/coffee',expected:{sku:'C250',gtin:'12345678',variant:'250g',currency:'USD'},pack:{quantity:'250',unit:'g'}}];
let {workspace:w}=await api.create({id:'catalog-course',label:'Engineering catalog course',targets,profile});
const first={operationId:'plan-one',expectedRevision:w.revision,id:'week-one',label:'First week',start:'2026-10-01',end:'2026-10-07',previousPeriodId:null};
w=(await api.plan(w,first)).workspace;check((await api.plan(w,first)).reused,'Same complete operation recovers after reply loss');
const item=(price,changes={})=>({name:'Coffee',sku:'C250',gtin:'12345678',variant:'250g',priceBasis:'one-time',sourcePack:{quantity:'250',unit:'g'},price,currency:'USD',url:targets[0].url,offerType:'Offer',offerIndex:0,...changes});
const response=items=>JSON.stringify({info:{statusCode:200,finalUrl:targets[0].url,billingPoints:2},body:'<html>Explicit engineering course source</html>',extractor:{result:{items}}});
const capture=async(period,id,items,replace=null)=>{const args={operationId:id,expectedRevision:w.revision,periodId:period,targetId:'coffee',id,responseText:response(items),providerStatus:200,requestUrl:targets[0].url,source:{kind:'engineering-fixture',description:'Authored behavior course, not a live retailer response'},replaceCaptureId:replace};w=(await api.capture(w,args)).workspace;return args;};
await capture('week-one','source-one',[item('12.50'),item('8.00',{sku:'C100',variant:'100g',sourcePack:{quantity:'100',unit:'g'}})]);
let r=await api.report(w,'week-one');check(r.rows[0].state==='READY'&&r.rows[0].product.price==='12.50','Reused GTIN selects only the exact SKU and variant');
let p=(await api.open(w)).periods[0],c=p.captures.at(-1);
w=(await api.decide(w,{operationId:'review-one',expectedRevision:w.revision,periodId:p.id,targetId:'coffee',captureId:c.id,action:'select',identity:c.candidates[0].identity,pack:targets[0].pack,priceBasis:'one-time',reason:'Reviewed exact retailer SKU, variant and 250g net pack.'})).workspace;
await capture('week-one','source-corrected',[item('12.50',{terms:{minimumQuantity:2},extractionAttention:['Minimum order quantity changed']})],'source-one');
r=await api.report(w,'week-one');check(r.rows[0].state==='ATTENTION'&&r.rows[0].reason.includes('replacement'),'Changed source terms invalidate a same-period earlier decision');
p=(await api.open(w)).periods[0];c=p.captures.at(-1);
w=(await api.decide(w,{operationId:'review-corrected',expectedRevision:w.revision,periodId:p.id,targetId:'coffee',captureId:c.id,action:'select',identity:c.candidates[0].identity,pack:targets[0].pack,priceBasis:'one-time',reason:'Price is per 250g package; source minimum purchase is two packages and remains in retained terms.'})).workspace;
w=(await api.plan(w,{operationId:'plan-two',expectedRevision:w.revision,id:'week-two',label:'Second week',start:'2026-10-08',end:'2026-10-14',previousPeriodId:'week-one'})).workspace;
await capture('week-two','source-two',[item('13.25')]);
r=await api.report(w,'week-two');check(r.rows[0].state==='READY'&&r.rows[0].percentChange==='6.000'&&r.rows[0].unitPriceDelta==='0.003000','Exact decimal price and pack produce the correct recurring change');
const serialized=JSON.stringify(w);w=JSON.parse(serialized);check((await api.report(w,'week-two')).rows[0].percentChange==='6.000','Complete event workspace reopens with original reporting results');
await capture('week-two','source-identifier-mismatch',[item('1.00',{sku:'WRONG'})],'source-two');
r=await api.report(w,'week-two');check(r.rows[0].state==='ATTENTION','A matching GTIN does not override a different expected SKU');
await capture('week-two','source-unknown-basis',[item('11.00',{priceBasis:'unknown'})],'source-identifier-mismatch');
r=await api.report(w,'week-two');check(r.rows[0].state==='ATTENTION','Unknown price basis requires an explicit review');
const modified=JSON.parse(JSON.stringify(w));modified.events[0].payload.targets[0].label='Changed bytes';await expectError(()=>api.open(modified),'CATALOG_HISTORY');check(true,'Changed retained source history is rejected');
const publicText='{"product":"Original direct public source"}';
w=(await api.capture(w,{operationId:'public-source',expectedRevision:w.revision,periodId:'week-two',targetId:'coffee',id:'public-source',responseText:JSON.stringify({info:{statusCode:null,finalUrl:null},extractor:{result:{items:[item('13.25')]}}}),providerStatus:null,requestUrl:targets[0].url,source:{kind:'public-source',url:'https://example.com/coffee.json',originalText:publicText,originalSha256:await sha256(publicText)},replaceCaptureId:'source-unknown-basis'})).workspace;
r=await api.report(w,'week-two');check(r.rows[0].state==='READY'&&r.rows[0].providerStatus===null&&r.rows[0].targetStatus===null,'Original public source analysis retains absent transport statuses');
const csv=catalogCsv({...r,rows:[{...r.rows[0],label:'=HYPERLINK("https://example.com")',product:{...r.rows[0].product,name:'=HYPERLINK("https://example.com")'}}]});check(csv.includes("'=HYPERLINK"),'Ordinary CSV protects spreadsheet formulas');
await capture('week-two','source-recurring-chain',[item('13.25',{priceBasis:'unknown',extractionAttention:['purchase_basis_unreviewed']})],'public-source');
const current=(await api.open(w)).periods.find(p=>p.id==='week-two'),last=current.captures.at(-1);
w=(await api.decide(w,{operationId:'review-recurring-chain',expectedRevision:w.revision,periodId:'week-two',targetId:'coffee',captureId:last.id,action:'select',identity:last.candidates[0].identity,pack:targets[0].pack,priceBasis:'one-time',reason:'Retained reviewed source and exact pack for continuing periods.'})).workspace;
for(const [id,prior,start,end] of [['week-three','week-two','2026-10-15','2026-10-21'],['week-four','week-three','2026-10-22','2026-10-28']]){
w=(await api.plan(w,{operationId:'plan-'+id,expectedRevision:w.revision,id,label:id,start,end,previousPeriodId:prior})).workspace;
await capture(id,'source-'+id,[item('13.25',{priceBasis:'unknown',extractionAttention:['purchase_basis_unreviewed']})]);}
r=await api.report(w,'week-four');check(r.rows[0].state==='READY'&&r.rows[0].reason==='carried review','Reviewed product terms continue through three successive periods');

const packed=await api.pack(w),restored=await api.unpack(JSON.parse(JSON.stringify(packed)));
check(JSON.stringify(restored)===JSON.stringify(w),'Content-addressed storage restores the exact complete logical history');
const damaged=JSON.parse(JSON.stringify(packed));damaged.records[0][1]='Changed source record';await expectError(()=>api.open(damaged),'CATALOG_STORAGE');check(true,'Changed content-addressed source is rejected');
const continued=await api.plan(packed,{operationId:'plan-packed-continuation',expectedRevision:packed.revision,id:'week-five',label:'Fifth week',start:'2026-10-29',end:'2026-11-04',previousPeriodId:'week-four'});
check(continued.workspace.revision===w.revision+1&&(await api.open(await api.pack(continued.workspace))).periods.length===5,'A compact saved workspace continues through the original operation API');

return {checks,workspace:w,report:r};
}

const result=await runCatalogCourse({createCatalogWorkflow,catalogCsv,sha256:async text=>createHash('sha256').update(text).digest('hex'),byteLength:text=>Buffer.byteLength(text)});
console.log(JSON.stringify({checks:result.checks,revision:result.workspace.revision},null,2));
