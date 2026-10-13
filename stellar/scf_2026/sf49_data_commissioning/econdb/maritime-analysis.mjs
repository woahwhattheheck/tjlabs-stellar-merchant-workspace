// Econdb maritime analysis over retained original JSON. No network or payment side effects.
export const VERSION='1.0.0';
export const MAX_SOURCE_CELLS=500000;
export const CONTRACT_SHA256='c271e5e1799a7a47b3f598cdf286d25c7bb68108cd9f3e466231f4f95a82c915';
function sha256(value) {
 const raw=encodeURIComponent(value).replace(/%([0-9A-F]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));
 const bytes=Array.from(raw,c=>c.charCodeAt(0)),bits=bytes.length*8;
 bytes.push(128);while(bytes.length%64!==56)bytes.push(0);
 for(let i=7;i>=0;i--)bytes.push(Math.floor(bits/2**(8*i))&255);
 const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
 const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
 for(let offset=0;offset<bytes.length;offset+=64){
 const w=new Uint32Array(64);for(let i=0;i<16;i++)w[i]=((bytes[offset+i*4]<<24)|(bytes[offset+i*4+1]<<16)|(bytes[offset+i*4+2]<<8)|bytes[offset+i*4+3])>>>0;
 for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(rotr(x,7)^rotr(x,18)^(x>>>3))+w[i-7]+(rotr(y,17)^rotr(y,19)^(y>>>10)))>>>0;}
 let [a,b,c,d,e,f,g,j]=h;
 for(let i=0;i<64;i++){const t1=(j+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+k[i]+w[i])>>>0,t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;j=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
 [a,b,c,d,e,f,g,j].forEach((x,i)=>h[i]=(h[i]+x)>>>0);
 }
 return h.map(x=>x.toString(16).padStart(8,"0")).join("");
}
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
function need(ok,message){if(!ok)throw new Error(message)}
function obj(v,label){need(v&&typeof v==='object'&&!Array.isArray(v),label+' must be an object');return v}
function str(v,label){need(typeof v==='string'&&v.trim()&&v.length<=2000,label+' must be nonempty text');return v}
function keys(v,allowed,label){for(const k of Object.keys(v))need(allowed.includes(k),label+': unsupported field '+k)}
const ptr=s=>s.replace(/~/g,'~0').replace(/\//g,'~1');
export function dateOnly(value){
 need(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value),'Use an explicit YYYY-MM-DD date');
 const d=new Date(value+'T00:00:00Z');need(Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===value,'Invalid calendar date');
 return value;
}
export function decimal(text){
 need(typeof text==='string'&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text),'Invalid source decimal');
 const m=text.match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
 const exp=Number(m[4]||0);need(Number.isSafeInteger(exp)&&Math.abs(exp)<=1000&&text.length<=2000,'Source number exceeds exact arithmetic range');
 let n=BigInt((m[1]||'')+m[2]+(m[3]||'')),s=(m[3]||'').length-exp;
 if(s<0){n*=10n**BigInt(-s);s=0}
 while(s&&n%10n===0n){n/=10n;s--}
 return {n,s};
}
function decimalText({n,s}){
 let x=(n<0n?-n:n).toString().padStart(s+1,'0');
 if(s)x=x.slice(0,-s)+'.'+x.slice(-s);
 return (n<0n?'-':'')+x;
}
function add(a,b){const x=decimal(a),y=decimal(b),s=Math.max(x.s,y.s);return decimalText({n:x.n*10n**BigInt(s-x.s)+y.n*10n**BigInt(s-y.s),s})}
function subtract(a,b){const x=decimal(b);return add(a,decimalText({n:-x.n,s:x.s}))}
function percentage(a,b){
 const x=decimal(a),y=decimal(b);if(y.n===0n)return null;
 let n=x.n*10n**BigInt(y.s)*100n,d=y.n*10n**BigInt(x.s);if(d<0n){n=-n;d=-d}
 const neg=n<0n,aN=neg?-n:n,scale=10000n,q=aN*scale/d,r=aN*scale%d;
 return {numerator:n.toString(),denominator:d.toString(),display:decimalText({n:(q+(r*2n>=d?1n:0n))*(neg?-1n:1n),s:4})};
}
// Retain every numeric lexeme so JSON binary floating-point cannot change arithmetic.
export function parseExactJSON(text){
 need(typeof text==='string','Original JSON must be UTF-8 text');
 let i=0;const numbers=new Map();const ws=()=>{while(i<text.length&&/[\t\n\r ]/.test(text[i]))i++};
 function string(){const start=i++;while(i<text.length){if(text[i]==='\\'){i+=2;continue}if(text[i++]==='"')return JSON.parse(text.slice(start,i))}throw new Error('Unterminated JSON string')}
 function read(path,depth){
  need(depth<64,'JSON nesting exceeds 63 levels');ws();const ch=text[i];
  if(ch==='"')return string();
  if(ch==='{'){
   i++;const value=Object.create(null);ws();if(text[i]==='}'){i++;return value}
   while(true){ws();need(text[i]==='"','Expected JSON object key');const key=string();need(!own(value,key),'Repeated JSON key at '+path+'/'+ptr(key));ws();need(text[i++]===':','Expected colon');value[key]=read(path+'/'+ptr(key),depth+1);ws();const end=text[i++];if(end==='}')return value;need(end===',','Expected comma')}
  }
  if(ch==='['){i++;const value=[];ws();if(text[i]===']'){i++;return value}while(true){value.push(read(path+'/'+value.length,depth+1));ws();const end=text[i++];if(end===']')return value;need(end===',','Expected array comma')}}
  for(const [literal,value] of [['true',true],['false',false],['null',null]])if(text.startsWith(literal,i)){i+=literal.length;return value}
  const m=text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);need(m,'Invalid JSON value at '+path);
  i+=m[0].length;const value=Number(m[0]);need(Number.isFinite(value),'Nonfinite JSON number at '+path);decimal(m[0]);numbers.set(path,m[0]);return value;
 }
 const value=read('',0);ws();need(i===text.length,'Trailing JSON content');return {value,numbers};
}
export function requestPlan(input){
 obj(input,'Request');keys(input,['kind','locode','flow','operator','top'],'Request');
 need(['ports','capacity-by-operator','container-traffic'].includes(input.kind),'Choose ports, capacity-by-operator or container-traffic');
 if(input.kind==='ports'){need(Object.keys(input).length===1,'Port catalogue has no declared query options');return {kind:'ports',method:'GET',url:'https://api.econdb.com/v1/ports/',query:{},locode:null,measure:null,population:'issuer_top_400_ports',frequency:null}}
 const locode=str(input.locode,'Original LOCODE');need(/^[A-Z]{2} ?[A-Z0-9]{3}$/.test(locode),'Use the exact selected issuer LOCODE');
 const query={};let measure='container_volume_teu',population='operation_types',frequency=null;
 if(input.kind==='capacity-by-operator'){
  query.flow=input.flow??'throughput';need(['throughput','import','export','transshipment','cargo'].includes(query.flow),'Unsupported flow');
  measure=query.flow==='throughput'?'calling_vessel_capacity_teu':'container_volume_teu';frequency='monthly';
  if(input.operator!==undefined&&input.operator!==null&&input.operator!==''){
   query.operator=str(input.operator,'Original operator');need(input.top===undefined,'top is ignored with operator; leave it absent');
   population='selected_operator';
  }else{
   const top=input.top??'0';need(top==='0'||top==='all'||(typeof top==='string'&&/^[1-9]\d{0,3}$/.test(top)),'top must be 0, all or positive integer text');
   query.top=top;population=top==='0'||top==='all'?'requested_all_operators':'top_operators_and_others';
  }
 }else need(input.flow===undefined&&input.operator===undefined&&input.top===undefined,'Container traffic declares no query parameters');
 const suffix=Object.entries(query).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
 return {kind:input.kind,method:'GET',url:'https://api.econdb.com/v1/ports/'+encodeURIComponent(locode)+'/'+input.kind+'/'+(suffix?'?'+suffix:''),query,locode,measure,population,frequency};
}
export function readSnapshot(text,descriptor){
 obj(descriptor,'Snapshot descriptor');keys(descriptor,['id','kind','locode','flow','operator','top','source_role','captured_at','source_sha256','original_url','basis'],'Snapshot descriptor');
 const id=str(descriptor.id,'Edition ID'),role=descriptor.source_role;
 need(['authenticated_response','operator_supplied_response','issuer_documentation_example'].includes(role),'Record the actual source role');
 need(/^[a-f0-9]{64}$/.test(descriptor.source_sha256||''),'Original source SHA-256 required');
 need(sha256(text)===descriptor.source_sha256,'Original source SHA-256 does not match its exact UTF-8 content');
 str(descriptor.captured_at,'Capture time');need(Number.isFinite(Date.parse(descriptor.captured_at))&&/Z$/.test(descriptor.captured_at),'Capture time must be UTC');
 let request;
 if(role==='issuer_documentation_example'){
  need(descriptor.locode===null,'Published port examples do not identify a port');
  need(descriptor.flow===undefined&&descriptor.top===undefined&&descriptor.operator===undefined,'Documentation example has no observed query');
  need(['capacity-by-operator','container-traffic'].includes(descriptor.kind),'Unsupported documented sample');
  request={kind:descriptor.kind,locode:null,query:null,url:null,measure:descriptor.kind==='capacity-by-operator'?'calling_vessel_capacity_teu':'container_volume_teu',population:'documented_example',frequency:descriptor.kind==='capacity-by-operator'?'monthly':null};
 }else{
  const q={};for(const key of ['kind','locode','flow','operator','top'])if(own(descriptor,key))q[key]=descriptor[key];request=requestPlan(q);
  need(descriptor.original_url===request.url,'Original response URL must match the retained exact request');
 }
 const parsed=parseExactJSON(text),source=obj(parsed.value,'Timeseries response');
 need(source.type==='timeseries'&&Array.isArray(source.series)&&Array.isArray(source.data),'Expected documented timeseries shape');
 const series=[],codes=new Set(),issues=[];
 for(const item of source.series){obj(item,'Series');const code=str(item.code,'Series code');need(code!=='Date'&&!codes.has(code),'Repeated or reserved series code');codes.add(code);series.push({code,name:typeof item.name==='string'?item.name:code,declared:true,source_metadata:item})}
 for(const row of source.data){obj(row,'Source row');for(const code of Object.keys(row))if(code!=='Date'&&!codes.has(code)){codes.add(code);series.push({code,name:code,declared:false,source_metadata:null});issues.push({kind:'undeclared_series',code})}}
 need(source.data.length*series.length<=MAX_SOURCE_CELLS,'Source exceeds the 500,000-cell in-memory analysis limit; the native receiver retains its original bytes for partitioned receiving');
 const seenDates=new Set(),rows=[];
 for(let index=0;index<source.data.length;index++){
  const sourceRow=source.data[index],date=dateOnly(sourceRow.Date);
  if(seenDates.has(date))issues.push({kind:'repeated_date',date,index});seenDates.add(date);
  if(request.frequency==='monthly'&&!date.endsWith('-01'))issues.push({kind:'monthly_label_not_first_day',date,index});
  for(const s of series){
   const path='/data/'+index+'/'+ptr(s.code),value=sourceRow[s.code];
   let status=own(sourceRow,s.code)?value===null?'null':typeof value==='number'?'known':'unsupported_value':'absent';
   const literal=status==='known'?parsed.numbers.get(path):null;
   rows.push({source_row:index,date,series:s.code,status,source_value:status==='absent'?null:value,source_lexeme:literal,exact:literal===null?null:decimalText(decimal(literal))});
  }
 }
 if(request.population==='requested_all_operators'&&series.some(s=>s.code.trim().toLowerCase()==='others'))issues.push({kind:'others_in_all_operator_response'});
 return {schema:'econdb.maritime-edition.v1',id,source:{...descriptor,original_bytes:unescape(encodeURIComponent(text)).length},request,title:typeof source.title==='string'?source.title:descriptor.kind,source_metadata:Object.fromEntries(Object.entries(source).filter(([k])=>!['data','series'].includes(k))),series,rows,source_row_count:source.data.length,issues};
}
function range(input){obj(input,'Local selection');keys(input,['from','until'],'Local selection');const from=dateOnly(input.from),until=dateOnly(input.until);need(from<until,'Local selection must have from < until');return {from,until,basis:'local_original_Date',end:'exclusive'}}
function monthLabels(r){const out=[];let [y,m]=r.from.slice(0,7).split('-').map(Number);if(r.from.slice(8)!=='01'||r.until.slice(8)!=='01')return null;while(true){const s=String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-01';if(s>=r.until)break;out.push(s);if(++m>12){m=1;y++}need(out.length<=1200,'Choose at most 100 years per local monthly selection')}return out}
export function selectPeriod(edition,selection){
 need(edition?.schema==='econdb.maritime-edition.v1','Use a received maritime edition');const r=range(selection),rows=edition.rows.filter(x=>x.date>=r.from&&x.date<r.until);
 const dates=[...new Set(rows.map(x=>x.date))].sort(),expected=edition.request.frequency==='monthly'?monthLabels(r):null;
 const missing_dates=expected?expected.filter(x=>!dates.includes(x)):null;
 return {edition_id:edition.id,selection:r,source:edition.source,request:edition.request,series:edition.series,rows,dates,expected_dates:expected,missing_dates,frequency:edition.request.frequency,issues:edition.issues.filter(x=>!x.date||(x.date>=r.from&&x.date<r.until))};
}
export function comparePeriods(edition,beforeRange,afterRange){
 const before=selectPeriod(edition,beforeRange),after=selectPeriod(edition,afterRange);
 need(edition.request.kind==='capacity-by-operator','Period totals apply only to declared monthly capacity/operator series; container traffic retains source-dated rows');
 need(before.expected_dates&&after.expected_dates,'Select whole monthly periods');
 need(before.expected_dates.length===after.expected_dates.length,'Compare periods with the same number of months');
 need(before.selection.until<=after.selection.from,'Compare nonoverlapping chronological periods');
 function total(period,code){
  const rows=period.rows.filter(x=>x.series===code),dates=rows.map(x=>x.date);
  const reasons=[];if(period.missing_dates.length)reasons.push('missing_months');
  if(new Set(dates).size!==dates.length)reasons.push('repeated_dates');
  if(rows.some(x=>x.status!=='known'))reasons.push('unknown_values');
  if(period.issues.some(x=>x.kind==='monthly_label_not_first_day'))reasons.push('ambiguous_month_labels');
  if(!rows.length)reasons.push('no_rows');
  return {value:reasons.length?null:rows.reduce((a,x)=>add(a,x.exact),'0'),reasons,observed_rows:rows.length,expected_months:period.expected_dates.length};
 }
 const comparisons=edition.series.map(s=>{
  const a=total(before,s.code),b=total(after,s.code),delta=a.value!==null&&b.value!==null?subtract(b.value,a.value):null;
  return {series:s.code,name:s.name,before:a,after:b,delta,percent_change:delta===null?null:percentage(delta,a.value),percent_basis:a.value==='0'?'zero_baseline':delta===null?'incomplete':'before_period_total'};
 });
 return {schema:'econdb.maritime-period-comparison.v1',edition_id:edition.id,source:edition.source,request:edition.request,before,after,comparisons,aggregation:'sum of the selected disjoint monthly values within each same source series',cross_measure_total:null};
}
export function compareEditions(before,after,selection){
 need(before?.schema==='econdb.maritime-edition.v1'&&after?.schema==='econdb.maritime-edition.v1','Use two received editions');
 need(before.source.source_role!=='issuer_documentation_example'&&after.source.source_role!=='issuer_documentation_example','A documentation example is not an observed edition revision');
 need(JSON.stringify(before.request)===JSON.stringify(after.request),'Edition comparison needs the same exact port, endpoint, flow, operator and population');
 need(before.source.source_role===after.source.source_role,'Keep the original source-role basis consistent');
 need(Date.parse(after.source.captured_at)>Date.parse(before.source.captured_at),'After edition must be captured later');
 const a=selectPeriod(before,selection),b=selectPeriod(after,selection);need(!a.issues.concat(b.issues).some(x=>x.kind==='repeated_date'),'Resolve repeated date keys before revision comparison');
 const map=p=>new Map(p.rows.map(r=>[JSON.stringify([r.date,r.series]),r])),am=map(a),bm=map(b);
 const all=[...new Set([...am.keys(),...bm.keys()])].sort(),changes=[];
 const canonical=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);
 const metadata_changes=[];
 for(const key of ['title','source_metadata'])if(canonical(before[key])!==canonical(after[key]))metadata_changes.push({field:key,before:before[key],after:after[key]});
 const oldSeries=new Map(before.series.map(v=>[v.code,v])),newSeries=new Map(after.series.map(v=>[v.code,v]));
 for(const code of new Set([...oldSeries.keys(),...newSeries.keys()])){const x=oldSeries.get(code),y=newSeries.get(code);if(!x||!y||canonical(x)!==canonical(y))metadata_changes.push({field:'series',code,kind:!x?'added':!y?'removed':'changed',before:x??null,after:y??null})}
 if(canonical(a.dates)!==canonical(b.dates)||canonical(a.missing_dates)!==canonical(b.missing_dates))metadata_changes.push({field:'selected_coverage',before:{dates:a.dates,missing_dates:a.missing_dates},after:{dates:b.dates,missing_dates:b.missing_dates}});
 for(const key of all){
  const x=am.get(key),y=bm.get(key),[date,series]=JSON.parse(key);
  let kind=!x?'added':!y?'removed':x.status!==y.status?'value_state_changed':x.exact!==y.exact?'revised':JSON.stringify(x.source_value)!==JSON.stringify(y.source_value)?'revised':'unchanged';
  changes.push({date,series,kind,before:x||null,after:y||null,delta:x?.status==='known'&&y?.status==='known'?subtract(y.exact,x.exact):null});
 }
 return {schema:'econdb.maritime-edition-comparison.v1',before_id:before.id,after_id:after.id,request:before.request,selection:a.selection,before_source:before.source,after_source:after.source,metadata_changes,changes,counts:Object.fromEntries(['added','removed','value_state_changed','revised','unchanged'].map(k=>[k,changes.filter(x=>x.kind===k).length]))};
}
export function exportRowsCSV(period){
 const fields=['edition_id','locode','endpoint','flow','measure','population','date','series','status','exact_value','source_lexeme','source_row','source_sha256'];
 const safe=value=>{let s=value==null?'':String(value);if(/^[\s]*[=+@]/.test(s)||/^[\t\r\n]/.test(s)||(/^[\s]*-/.test(s)&&!/^\-\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(s)))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
 const rows=period.rows.map(r=>[period.edition_id,period.request.locode,period.request.kind,period.request.query?.flow,period.request.measure,period.request.population,r.date,r.series,r.status,r.exact,r.source_lexeme,r.source_row,period.source.source_sha256]);
 return [fields,...rows].map(row=>row.map(safe).join(',')).join('\r\n')+'\r\n';
}
export function reportHTML({edition,period,comparison=null,editionComparison=null,engine_sha256=null}){
 if(engine_sha256!==null)need(/^[a-f0-9]{64}$/.test(engine_sha256),'Use the exact producing analysis source SHA-256');
 need(period.edition_id===edition.id&&period.source.source_sha256===edition.source.source_sha256&&JSON.stringify(period.request)===JSON.stringify(edition.request),'Report period belongs to a different source edition');
 if(comparison)need(comparison.edition_id===edition.id&&comparison.source.source_sha256===edition.source.source_sha256,'Report comparison belongs to a different source edition');
 if(editionComparison)need(editionComparison.after_id===edition.id&&editionComparison.after_source.source_sha256===edition.source.source_sha256,'Revision report must use the later source edition');
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const table=(headers,rows)=>'<div class="table"><table><thead><tr>'+headers.map(x=>'<th scope="col">'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const issueText=edition.issues.length?edition.issues.map(x=>JSON.stringify(x)).join('\n'):'No structural exceptions recorded.';
 const coverage='<h2>Selected coverage</h2>'+table(['Observed dates','Expected monthly dates','Missing monthly dates','Known cells','Null cells','Absent cells','Unsupported cells'],[[period.dates.length,period.expected_dates?.length??'Not inferred for this selection',period.missing_dates?.length??'Not inferred',...['known','null','absent','unsupported_value'].map(k=>period.rows.filter(x=>x.status===k).length)]])+'<p>Missing monthly labels: '+esc(period.missing_dates?.join(', ')|| (period.expected_dates?'None':'Not inferred for this selection and source frequency'))+'</p>';
 let detail=coverage;
 if(comparison)detail+='<h2>Selected period comparison</h2><p>'+esc(comparison.aggregation)+'. Before: '+esc(comparison.before.selection.from)+' ≤ Date &lt; '+esc(comparison.before.selection.until)+'. After: '+esc(comparison.after.selection.from)+' ≤ Date &lt; '+esc(comparison.after.selection.until)+'. Percent change is undefined for a zero baseline.</p>'+table(['Series','Before','After','Change','Change %','Incomplete basis'],comparison.comparisons.map(x=>[x.name,x.before.value??'Unknown',x.after.value??'Unknown',x.delta??'Unknown',x.percent_change?.display??'Undefined',x.before.reasons.concat(x.after.reasons).join(', ')]));
 if(editionComparison)detail+='<h2>Source revisions</h2><p>'+esc(editionComparison.before_id)+' → '+esc(editionComparison.after_id)+'</p>'+table(['Date','Series','Change','Before','After','Delta'],editionComparison.changes.filter(x=>x.kind!=='unchanged').map(x=>[x.date,x.series,x.kind,x.before?.exact??x.before?.status??'Absent',x.after?.exact??x.after?.status??'Absent',x.delta??'']));
 if(editionComparison)detail+='<h2>Edition metadata and coverage changes</h2>'+table(['Field','Series','Change','Before','After'],editionComparison.metadata_changes.map(x=>[x.field,x.code??'',x.kind??'changed',JSON.stringify(x.before),JSON.stringify(x.after)]));
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maritime period review</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#202020;background:#fff;max-width:1180px;margin:32px auto;padding:0 22px}h1{font-size:28px}h2{margin-top:30px;font-size:20px}.muted{color:#555}.table{overflow-x:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:9px 12px;border-bottom:1px solid #d5d5d5;text-align:left;vertical-align:top}th{background:#eeeeee}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;padding:14px}.meta{display:grid;grid-template-columns:150px 1fr;gap:6px 16px}.meta dd{margin:0;overflow-wrap:anywhere}button{font:inherit;padding:8px 14px;background:#eee;border:1px solid #777;cursor:pointer}@media(max-width:600px){body{margin:18px auto;padding:0 12px}.meta{grid-template-columns:1fr;gap:2px}.meta dd{margin-bottom:9px}th,td{padding:7px}}@media print{body{max-width:none;margin:0}.table{overflow:visible}button{display:none}thead{display:table-header-group}tr{break-inside:avoid}}</style><body><h1>Maritime period review</h1><p>'+esc(edition.title)+'</p><dl class="meta"><dt>Edition</dt><dd>'+esc(edition.id)+'</dd><dt>Source role</dt><dd>'+esc(edition.source.source_role)+'</dd><dt>Port LOCODE</dt><dd>'+esc(edition.request.locode??'Unspecified in issuer example')+'</dd><dt>Endpoint</dt><dd>'+esc(edition.request.kind)+'</dd><dt>Flow</dt><dd>'+esc(edition.request.query?.flow??'Not specified in this source')+'</dd><dt>Operator / top</dt><dd>'+esc(edition.request.query?.operator??'No individual operator')+' / '+esc(edition.request.query?.top??'No top parameter')+'</dd><dt>Original URL</dt><dd>'+esc(edition.source.original_url??'Unspecified')+'</dd><dt>Measure</dt><dd>'+esc(edition.request.measure)+'</dd><dt>Population</dt><dd>'+esc(edition.request.population)+'</dd><dt>Local selection</dt><dd>'+esc(period.selection.from)+' ≤ original Date &lt; '+esc(period.selection.until)+'</dd><dt>Capture</dt><dd>'+esc(edition.source.captured_at)+'</dd><dt>Analysis version / source</dt><dd>'+esc(VERSION)+' / '+esc(engine_sha256??'See accompanying exact source package')+'</dd><dt>Original SHA-256</dt><dd>'+esc(edition.source.source_sha256)+'</dd></dl><p class="muted">The original complete response is retained separately. Dates are selected locally; the port API does not declare date filtering. Capacity and container volume retain separate measures. Null, absent and unsupported values remain explicit.</p>'+detail+'<h2>Selected original observations</h2>'+table(['Date','Source series','Value','State','Original row'],period.rows.map(r=>[r.date,r.series,r.exact??'Unknown',r.status,r.source_row]))+'<h2>Source review</h2><pre>'+esc(issueText)+'</pre></body></html>';
}
