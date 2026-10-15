'use strict';
const R=require('./rational.cjs'),M=require('./construction-math.cjs');
const pct=x=>{const v=M.nonnegative(x);return v&&R.cmp(v,R.R(100n))<=0n?R.div(v,R.R(100n)):null;};
function discount(base,kind,value){if(base===null)return null;if(kind==='none')return value===''||M.decimal(value)?.n===0n?R.zero():null;const v=kind==='percent'?pct(value):M.nonnegative(value);if(v===null)return null;const d=kind==='percent'?R.mul(base,v):kind==='fixed'?v:null;return d&&R.cmp(d,base)<=0n?d:null;}
function line(v,project,{price_basis='exclusive',discount_kind=v.discount_kind??'none',discount_value=v.discount_value??''}={}){
 const issues=[],q=M.decimal(v.quantity),unit=M.decimal(v.unit_price),tax=pct(v.tax_rate),precision=Number(project.currency_decimals),rounding=project.rounding_mode;
 let raw=q&&unit?R.mul(q,unit):null;if(raw===null)issues.push('PRICE_OR_QUANTITY_UNOBSERVED');
 if(!['exclusive','inclusive'].includes(price_basis)||tax===null){issues.push('PRICE_OR_TAX_BASIS_UNRESOLVED');raw=null;}
 let base=raw===null?null:price_basis==='inclusive'?R.div(raw,R.add(R.R(1n),tax)):raw;
 const sign=base&&base.n<0n?-1n:1n,absolute=base&&R.R(base.n*sign,base.d),deduction=discount(absolute,discount_kind,discount_value);
 if(deduction===null)issues.push('DISCOUNT_UNRESOLVED');const net=base&&deduction?M.round(R.mul(R.sub(absolute,deduction),R.R(sign)),precision,rounding):null,taxAmount=net&&tax?M.round(R.mul(net,tax),precision,rounding):null;
 if(net===null)issues.push('MONEY_ROUNDING_UNRESOLVED');
 return{issues:[...new Set(issues)],net,tax:taxAmount,gross:M.add(net,taxAmount),rate:tax,base,discount:deduction};
}
function allocateFixed(lines,total,precision){
 if(total===null||lines.some(x=>x.net===null||x.net.n<0n)||!M.exactAtPrecision(total,precision))return null;
 const sum=R.sum(lines.map(x=>x.net));if(total.n<0n||R.cmp(total,sum)>0n)return null;if(!sum.n)return total.n===0n?Object.fromEntries(lines.map(x=>[x.id,R.zero()])):null;
 const scale=10n**BigInt(precision),units=R.mul(total,R.R(scale)).n,parts=lines.map(x=>{const share=R.div(R.mul(total,x.net),sum),u=R.mul(share,R.R(scale));return{id:x.id,units:u.n/u.d,remainder:R.R(u.n%u.d,u.d)};});
 let left=units-parts.reduce((a,x)=>a+x.units,0n);parts.sort((a,b)=>{const n=R.cmp(b.remainder,a.remainder);return n<0n?-1:n>0n?1:a.id<b.id?-1:a.id>b.id?1:0;});for(let i=0;left>0n;i++,left--)parts[i%parts.length].units++;
 return Object.fromEntries(parts.map(x=>[x.id,R.R(x.units,scale)]));
}
function table(records,project,{price_basis='exclusive',discount_kind='none',discount_value=''}={}){
 const lines=records.map(v=>({id:v.id??v.contract_line_id??v.variation_line_id??v.invoice_line_id??v.cost_invoice_line_id,...line(v,project,{price_basis}),tax_code:v.tax_code,tax_rate:v.tax_rate})),issues=lines.flatMap(x=>x.issues),precision=Number(project.currency_decimals),rounding=project.rounding_mode;
 let allocations=Object.fromEntries(lines.map(x=>[x.id,R.zero()]));
 if(discount_kind!=='none'){const base=M.sum(lines.map(x=>x.net)),d=discount(base,discount_kind,discount_value);allocations=d===null?null:allocateFixed(lines,M.round(d,precision,rounding),precision);if(!allocations)issues.push('CONTRACT_DISCOUNT_UNRESOLVED');}
 else if(discount_value!==''&&M.decimal(discount_value)?.n!==0n)issues.push('CONTRACT_DISCOUNT_UNRESOLVED');
 const groups=new Map();for(const x of lines){x.contract_discount=allocations?.[x.id]??null;x.net=M.subtract(x.net,x.contract_discount);x.tax=x.net&&x.rate?M.round(R.mul(x.net,x.rate),precision,rounding):null;x.gross=M.add(x.net,x.tax);if(x.net&&x.rate){const key=x.tax_code+'\0'+x.rate.n+'/'+x.rate.d;if(!groups.has(key))groups.set(key,{key,net:R.zero(),rate:x.rate,tax_code:x.tax_code});groups.get(key).net=R.add(groups.get(key).net,x.net);}}
 let tax=project.tax_rounding==='line'?M.sum(lines.map(x=>x.tax)):project.tax_rounding==='total_by_rate'?M.sum([...groups.values()].map(x=>M.round(R.mul(x.net,x.rate),precision,rounding))):null;if(tax===null)issues.push('TAX_TOTAL_UNRESOLVED');
 const net=M.sum(lines.map(x=>x.net));return{issues:[...new Set(issues)],lines,net,tax,gross:M.add(net,tax),groups:[...groups.values()],basis:{currency:project.currency,precision,rounding,tax_rounding:project.tax_rounding,price_basis,discount_kind,discount_value}};
}
module.exports={pct,discount,line,allocateFixed,table};