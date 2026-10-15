'use strict';
const R=require('./rational.cjs');
function stamp(x){if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(x))return null;const n=Date.parse(x);return Number.isFinite(n)&&(new Date(n).toISOString()===x||new Date(n).toISOString().replace('.000Z','Z')===x)?n:null;}
function day(x){if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return null;const n=Date.parse(x+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===x?n:null;}
function decimal(x){try{return R.dec(x);}catch{return null;}}
function nonnegative(x){const v=decimal(x);return v&&R.cmp(v,R.zero())>=0n?v:null;}
function fraction(x){const v=nonnegative(x);return v&&R.cmp(v,R.R(1n))<=0n?v:null;}
function round(v,places,mode){if(v===null||!Number.isInteger(places)||places<0||places>6||!['half_up','half_even','toward_zero'].includes(mode))return null;const scale=10n**BigInt(places),negative=v.n<0n,n=(negative?-v.n:v.n)*scale,q=n/v.d,rem=n%v.d;let units=q;if(mode==='half_up'&&rem*2n>=v.d||mode==='half_even'&&(rem*2n>v.d||rem*2n===v.d&&q%2n===1n))units++;return R.R(negative?-units:units,scale);}
function exactAtPrecision(v,places){return!!v&&Number.isInteger(places)&&places>=0&&places<=6&&R.mul(v,R.R(10n**BigInt(places))).d===1n;}
function sum(values){return values.some(x=>x===null)?null:R.sum(values);}
function min(a,b){return a===null||b===null?null:R.cmp(a,b)<0n?a:b;}
function max(a,b){return a===null||b===null?null:R.cmp(a,b)>0n?a:b;}
function multiply(a,b){return a===null||b===null?null:R.mul(a,b);}
function subtract(a,b){return a===null||b===null?null:R.sub(a,b);}
function add(a,b){return a===null||b===null?null:R.add(a,b);}
function money(value,currency,contractCurrency,precision){const amount=decimal(value);return amount!==null&&currency===contractCurrency&&/^[A-Z]{3}$/.test(currency)&&exactAtPrecision(amount,precision)?amount:null;}
function known(effective,recorded,at,knownBy=at,{observed=true}={}){const e=stamp(effective),r=stamp(recorded);return e!==null&&r!==null&&at!==null&&knownBy!==null&&e<=at&&r<=knownBy&&(!observed||r>=e);}
function interval(from,until,at){const a=stamp(from),b=until===''?Infinity:stamp(until);return a!==null&&b!==null&&at!==null&&a<b&&a<=at&&at<b;}
function overlap(a,b,c,d){return a!==null&&b!==null&&c!==null&&d!==null&&a<b&&c<d&&a<d&&c<b;}
function amounts(lines,{precision,rounding,tax_rounding}){const issues=[],detail=[];if(!['line','total_by_rate'].includes(tax_rounding))issues.push('TAX_ROUNDING_UNDECLARED');if(!Number.isInteger(precision)||precision<0||precision>6||!['half_up','half_even','toward_zero'].includes(rounding))issues.push('MONEY_ROUNDING_UNDECLARED');const groups=new Map();
 for(const line of lines){const quantity=decimal(line.quantity),price=decimal(line.unit_price),rate=fraction(line.tax_rate),base=quantity&&price?R.mul(quantity,price):null,net=round(base,precision,rounding),tax=net&&rate?round(R.mul(net,rate),precision,rounding):null;if(net===null||tax===null)issues.push('LINE_AMOUNT_OR_TAX_UNRESOLVED');detail.push({id:line.id,unit:line.unit,quantity:line.quantity,unit_price:line.unit_price,tax_rate:line.tax_rate,net,tax});if(rate&&net){const key=rate.n+'/'+rate.d;if(!groups.has(key))groups.set(key,{rate,net:R.zero()});groups.get(key).net=R.add(groups.get(key).net,net);}}
 const net=sum(detail.map(x=>x.net)),tax=issues.length?null:tax_rounding==='line'?sum(detail.map(x=>x.tax)):sum([...groups.values()].map(g=>round(R.mul(g.net,g.rate),precision,rounding)));
 return{issues:[...new Set(issues)],lines:detail.map(x=>({...x,net:R.value(x.net),tax:R.value(x.tax)})),net:R.value(net),tax:R.value(tax),gross:R.value(add(net,tax)),basis:{precision,rounding,tax_rounding},exact:{net,tax,gross:add(net,tax)}};
}
// All inputs are supplied monetary facts on one declared currency/tax basis.
// Retention totals here are cumulative withheld BEFORE any release, so releases
// are counted exactly once as separate period movements.
function claimMovement({current_certified_gross,prior_certified_gross,current_retention_cumulative,prior_retention_cumulative,period_retention_release,period_advance_recovery}){
 const values=[current_certified_gross,prior_certified_gross,current_retention_cumulative,prior_retention_cumulative,period_retention_release,period_advance_recovery].map(decimal),issues=[];if(values.some(v=>v===null))issues.push('CLAIM_MOVEMENT_INPUT_UNOBSERVED');
 const [gross,prior,retention,priorRetention,release,advance]=values;
 const gross_movement=subtract(gross,prior),retention_movement=subtract(retention,priorRetention),payable=subtract(add(subtract(gross_movement,retention_movement),release),advance);
 return{issues,gross_movement:R.value(gross_movement),retention_movement:R.value(retention_movement),release_movement:R.value(release),advance_recovery:R.value(advance),payable_movement:R.value(payable),meaning:'Cumulative certified gross movement less newly withheld retention, plus separately observed release, less separately observed advance recovery. Negative movements remain signed.'};
}
// An actual invoice replaces the part of an order it fulfils; it is not added
// to the same committed amount a second time. Paid cash is another measure.
function costPosition({current_commitment,actual_recognised_cost,recognised_against_commitment,actual_paid_cash,uncommitted_forecast}){
 const commitment=nonnegative(current_commitment),actual=decimal(actual_recognised_cost),allocated=decimal(recognised_against_commitment),paid=decimal(actual_paid_cash),forecast=nonnegative(uncommitted_forecast),issues=[];
 if([commitment,actual,allocated,paid,forecast].some(x=>x===null))issues.push('COST_POSITION_INPUT_UNOBSERVED');
 if(allocated&&actual&&R.cmp(allocated,actual)>0n)issues.push('COMMITMENT_ALLOCATION_EXCEEDS_ACTUAL');
 const outstanding=commitment&&allocated?max(subtract(commitment,allocated),R.zero()):null,overrun=commitment&&allocated?max(subtract(allocated,commitment),R.zero()):null,total=issues.length?null:add(add(actual,outstanding),forecast);
 return{issues,actual_recognised_cost:R.value(actual),actual_paid_cash:R.value(paid),outstanding_commitment:R.value(outstanding),committed_cost_overrun:R.value(overrun),uncommitted_forecast:R.value(forecast),forecast_cost:R.value(total),meaning:'Actual recognised cost plus only the unconsumed current commitment plus separately declared uncommitted work. Actual paid cash is shown separately and never added again.'};
}
module.exports={claimMovement,costPosition,stamp,day,decimal,nonnegative,fraction,round,exactAtPrecision,sum,min,max,multiply,subtract,add,money,known,interval,overlap,amounts};
