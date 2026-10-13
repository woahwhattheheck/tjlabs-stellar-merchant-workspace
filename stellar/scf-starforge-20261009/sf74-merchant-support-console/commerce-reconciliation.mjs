// MIT. Source-bound commerce export reconciliation; no account or order writes.
export const RECONCILIATION_SCHEMA='stellar-forge.commerce-export-reconciliation.v1';
export const REVIEW_SCHEMA='stellar-forge.commerce-export-review.v1';
const MAX_BYTES=16*1024*1024,MAX_ROWS=50000;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const copy=v=>JSON.parse(JSON.stringify(v));
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const need=(v,m,c='INVALID_COMMERCE_RECONCILIATION')=>{if(!v)fail(c,m);};
const text=(v,label,max=1000)=>{need(typeof v==='string'&&v.trim()&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),'Use '+label);return v;};
const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const csvCell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
function csv(raw) {
  need(typeof raw==='string','Receive complete UTF-8 CSV text');
  const data=raw.charCodeAt(0)===0xfeff?raw.slice(1):raw;
  let rows=[],row=[],field='',quoted=false,closed=false,started=false;
  function column(){row.push(field);field='';closed=false;started=false;}
  function line(){column();if(row.length!==1||row[0]!=='')rows.push(row);row=[];need(rows.length<=MAX_ROWS+1,'Select at most '+MAX_ROWS+' records per export');}
  for(let i=0;i<data.length;i++){
    const c=data[i];
    if(quoted){if(c==='"'){if(data[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c==='"'){need(!started&&!closed,'A quote must begin a complete CSV field');quoted=true;started=true;continue;}
    if(c===','){column();continue;}
    if(c==='\r'||c==='\n'){if(c==='\r'&&data[i+1]==='\n')i++;line();continue;}
    need(!closed,'Unexpected text after a quoted CSV field');field+=c;started=true;
  }
  need(!quoted,'Complete the quoted CSV field');
  if(field!==''||row.length||started||closed)line();
  need(rows.length>0,'Receive a header row');
  const headers=rows.shift();need(headers.every(h=>h!==''&&!/[\r\n\u0000]/.test(h))&&new Set(headers).size===headers.length,'Use distinct nonempty exact CSV headers');
  return {headers,rows:rows.map((values,index)=>{need(values.length===headers.length,'CSV record '+(index+2)+' has a different field count');return {record:index+2,values:Object.fromEntries(headers.map((h,i)=>[h,values[i]]))};})};
}
function mapping(value,headers) {
  need(plain(value),'Select an explicit column mapping');
  const allowed=['key','amount','currency','customer','status'];
  need(Object.keys(value).every(k=>allowed.includes(k)),'Unknown mapping column');
  for(const k of ['key','amount','currency'])need(typeof value[k]==='string'&&headers.includes(value[k]),'Select the original '+k+' column');
  for(const k of ['customer','status'])if(value[k]!==undefined)need(typeof value[k]==='string'&&headers.includes(value[k]),'Select the original '+k+' column');
  return copy(value);
}
function decimal(raw,unit,scale) {
  if(typeof raw!=='string'||raw.length>100||!/^[-+]?\d+(?:\.\d+)?$/.test(raw))return null;
  const negative=raw.startsWith('-'),s=raw.replace(/^[-+]/,''),[whole,fraction='']=s.split('.');
  if(unit==='minor'&&fraction)return null;
  if(unit==='major'&&fraction.length>scale&&/[1-9]/.test(fraction.slice(scale)))return null;
  const digits=unit==='minor'?whole:whole+fraction.slice(0,scale).padEnd(scale,'0');
  const n=BigInt(digits)*(negative?-1n:1n);
  return n.toString();
}
function utc(v,label){text(v,label,40);need(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,19)===v.slice(0,19),'Use a UTC '+label);return v;}
export function createCommerceReconciliation({sha256Utf8}={}) {
  need(typeof sha256Utf8==='function','Use the original SHA-256 function');
  const hash=s=>{const h=sha256Utf8(s);need(h&&/^[a-f0-9]{64}$/.test(h.sha256)&&Number.isSafeInteger(h.bytes),'SHA-256 interface changed');return h;};
  function analyze(input) {
    need(plain(input)&&input.schema===RECONCILIATION_SCHEMA,'Select the complete commerce reconciliation input');
    need(Object.keys(input).every(k=>['schema','reference','scope','source','destination','currency_scales','status_pairs','comparison'].includes(k)),'Unknown input fields');
    const reference=text(input.reference,'engagement/change reference'),scope=input.scope;
    need(plain(scope),'Record the original common export scope');
    const from=utc(scope.from,'scope start'),through=utc(scope.through,'scope end');
    need(Date.parse(from)<Date.parse(through),'Scope end must follow start');
    need(scope.completeness==='selected_scope_complete'||scope.completeness==='partial','Record complete or partial scope explicitly');
    const scopeNote=text(scope.description,'selected scope description',4000);
    need(plain(input.currency_scales)&&Object.keys(input.currency_scales).length>0,'Select explicit currency scales');
    for(const [currency,scale] of Object.entries(input.currency_scales))need(/^[A-Z]{3}$/.test(currency)&&Number.isInteger(scale)&&scale>=0&&scale<=6,'Use an uppercase currency and scale from zero to six');
    const comparison=input.comparison??{customer:false,status:false};
    need(plain(comparison)&&typeof comparison.customer==='boolean'&&typeof comparison.status==='boolean'&&Object.keys(comparison).every(k=>['customer','status'].includes(k)),'Select explicit customer/status comparison');
    const pairs=input.status_pairs??[];
    need(Array.isArray(pairs)&&pairs.length<=1000,'Select the original status equivalence pairs');
    for(const p of pairs)need(plain(p)&&Object.keys(p).length===2&&typeof p.source==='string'&&typeof p.destination==='string','Use complete source/destination status pairs');
    const issues=[],allRows={},exports={};
    function issue(kind,key,sourceRows,destinationRows,details) {
      const value={kind,key,source_records:sourceRows.map(r=>r.record),destination_records:destinationRows.map(r=>r.record),details};
      const id='issue-'+hash(stable(value)).sha256.slice(0,32);issues.push({id,...value});
    }
    for(const side of ['source','destination']) {
      const original=input[side];need(plain(original),'Receive the complete '+side+' export');
      need(Object.keys(original).every(k=>['name','content','sha256','bytes','mapping','amount_unit','captured_at','system','export_reference'].includes(k)),'Unknown export fields');
      const identity=hash(original.content);need(identity.bytes<=MAX_BYTES,'Use an export of at most 16 MiB');
      need(identity.sha256===original.sha256&&identity.bytes===original.bytes,'Original '+side+' export identity changed','SOURCE_CHANGED');
      text(original.name,'original filename',255);text(original.system,'original system',255);text(original.export_reference,'original export reference',4000);
      utc(original.captured_at,'capture time');need(['major','minor'].includes(original.amount_unit),'Select major or minor amount units explicitly');
      const parsed=csv(original.content),map=mapping(original.mapping,parsed.headers);
      if(comparison.customer)need(map.customer,'Map the customer column on both sides');
      if(comparison.status)need(map.status,'Map the status column on both sides');
      const rows=parsed.rows.map(row=>{
        const rawKey=row.values[map.key],key=rawKey.trim(),currency=row.values[map.currency].trim().toUpperCase(),scale=input.currency_scales[currency];
        const rawAmount=row.values[map.amount],amount=scale===undefined?null:decimal(rawAmount,original.amount_unit,scale);
        const record={record:row.record,key,currency,amount_minor:amount,amount_original:rawAmount,
          customer:map.customer?row.values[map.customer]:null,status:map.status?row.values[map.status]:null};
        const invalid=[];
        if(!key)invalid.push('Missing original order/integration key');
        if(key!==rawKey)invalid.push('Key has leading/trailing whitespace; source must be corrected or explicitly remapped');
        if(!/^[A-Z]{3}$/.test(currency)||scale===undefined)invalid.push('Currency has no explicitly selected scale');
        if(amount===null)invalid.push('Amount is not an exact selected-unit decimal at the configured currency precision');
        if(invalid.length)issue('INVALID_ROW',key,side==='source'?[record]:[],side==='destination'?[record]:[],invalid);
        record.valid=invalid.length===0;return record;
      });
      allRows[side]=rows;exports[side]={name:original.name,system:original.system,export_reference:original.export_reference,
        captured_at:original.captured_at,sha256:identity.sha256,bytes:identity.bytes,row_count:rows.length,mapping:map,amount_unit:original.amount_unit};
    }
    const indexes={};
    for(const side of ['source','destination']){
      const index=new Map();for(const row of allRows[side]){if(!row.key)continue;const list=index.get(row.key)??[];list.push(row);index.set(row.key,list);}
      indexes[side]=index;
    }
    const matches=[],keys=[...new Set([...indexes.source.keys(),...indexes.destination.keys()])].sort();
    for(const key of keys){
      const a=indexes.source.get(key)??[],b=indexes.destination.get(key)??[];
      if(a.length>1||b.length>1){issue('DUPLICATE_KEY',key,a,b,['Exact integration key is not unique; do not choose a row automatically']);continue;}
      if(!a.length||!b.length){issue(scope.completeness==='partial'?'OUTSIDE_OBSERVED_EXPORT':!a.length?'DESTINATION_ONLY':'SOURCE_ONLY',key,a,b,
        [scope.completeness==='partial'?'Partial exports cannot establish a missing destination/source record':'No matching exact key in the complete selected counterpart export']);continue;}
      if(!a[0].valid||!b[0].valid)continue;
      const left=a[0],right=b[0],differences=[];
      if(left.currency!==right.currency)differences.push('Currency differs');
      else if(left.amount_minor!==right.amount_minor)differences.push('Exact amount differs');
      if(comparison.customer&&left.customer!==right.customer)differences.push('Explicit customer key differs');
      if(comparison.status&&!pairs.some(p=>p.source===left.status&&p.destination===right.status))differences.push('Status pair has no selected equivalence');
      if(differences.length)issue('FIELD_DIFFERENCE',key,a,b,differences);
      else matches.push({key,source_record:left.record,destination_record:right.record,currency:left.currency,amount_minor:left.amount_minor});
    }
    const totals={source:{},destination:{}};
    for(const side of ['source','destination'])for(const row of allRows[side])if(row.valid){
      totals[side][row.currency]=(BigInt(totals[side][row.currency]??'0')+BigInt(row.amount_minor)).toString();
    }
    const input_sha256=hash(stable(input)).sha256;
    return {schema:RECONCILIATION_SCHEMA,input_sha256,reference,
      scope:{from,through,completeness:scope.completeness,description:scopeNote},exports,
      currency_scales:copy(input.currency_scales),comparison:copy(comparison),status_pairs:copy(pairs),
      totals_minor:totals,matches,issues,counts:{source:allRows.source.length,destination:allRows.destination.length,
        matched:matches.length,issues:issues.length},state:issues.length?'REVIEW_REQUIRED':'MATCHED',
      interpretation:'Read-only comparison of the selected retained exports. It does not prove source capture completeness, live integration health, customer identity, payment or acceptance.'};
  }
  function review(input,returnValue){
    const report=analyze(input);need(plain(returnValue)&&returnValue.schema===REVIEW_SCHEMA,'Select the original review return');
    need(returnValue.input_sha256===report.input_sha256,'Review belongs to another complete original input','SOURCE_CHANGED');
    text(returnValue.actor,'reviewer');utc(returnValue.observed_at,'review time');
    text(returnValue.reference,'review authority/reference',4000);
    need(Array.isArray(returnValue.decisions)&&returnValue.decisions.length<=report.issues.length,'Use one decision for each selected issue');
    const seen=new Set();
    const decisions=returnValue.decisions.map(decision=>{
      need(plain(decision)&&Object.keys(decision).every(k=>['issue_id','outcome','note','reference'].includes(k)),'Unknown issue decision fields');
      need(report.issues.some(i=>i.id===decision.issue_id)&&!seen.has(decision.issue_id),'Use a retained issue once');seen.add(decision.issue_id);
      need(['accepted_difference','requires_repair','not_applicable'].includes(decision.outcome),'Choose an explicit issue outcome');
      text(decision.note,'decision reason',4000);text(decision.reference,'decision source reference',4000);return copy(decision);
    });
    return {...report,review:{actor:returnValue.actor,observed_at:returnValue.observed_at,reference:returnValue.reference,decisions,
      pending_issue_ids:report.issues.filter(i=>!seen.has(i.id)).map(i=>i.id)},state:'REVIEW_RECORDED'};
  }
  function reportHtml(report) {
    need(report.schema===RECONCILIATION_SCHEMA,'Use the analyzed original report');
    const issueRows=report.issues.map(i=>{const decision=report.review?.decisions.find(d=>d.issue_id===i.id);
      return '<tr><td>'+escape(i.key)+'</td><td>'+escape(i.kind)+'</td><td>'+escape(i.source_records.join(', '))+'</td><td>'+
        escape(i.destination_records.join(', '))+'</td><td>'+escape(i.details.join('; '))+'</td><td>'+
        escape(decision?decision.outcome+' — '+decision.note+' ('+decision.reference+')':'Awaiting original review')+'</td></tr>';}).join('');
    return '<!doctype html><html lang="en"><meta charset="utf-8"><title>Commerce integration receiving</title>'+
      '<style>body{font:15px system-ui;color:#20252a;max-width:1180px;margin:36px auto;padding:0 24px}h1{font-size:29px}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{padding:10px;border:1px solid #b9bec3;text-align:left;vertical-align:top}code{overflow-wrap:anywhere}aside{padding:16px;background:#eef1f3}small{color:#4d5760}</style>'+
      '<h1>Commerce integration receiving</h1><p>'+escape(report.reference)+'</p><aside>'+escape(report.interpretation)+'</aside>'+
      '<h2>Selected original exports</h2><p>'+escape(report.scope.description)+' · '+escape(report.scope.from)+' → '+escape(report.scope.through)+
      ' · '+escape(report.scope.completeness)+'</p><table><tr><th>Side</th><th>Original file</th><th>System / capture</th><th>Identity</th></tr>'+
      Object.entries(report.exports).map(([side,v])=>'<tr><td>'+side+'</td><td>'+escape(v.name)+'</td><td>'+escape(v.system)+'<br>'+escape(v.captured_at)+'</td><td>'+v.bytes+' bytes<br><code>'+v.sha256+'</code></td></tr>').join('')+'</table>'+
      '<p>Source rows: '+report.counts.source+' · Destination rows: '+report.counts.destination+' · Exact matched keys: '+report.counts.matched+' · Issues: '+report.counts.issues+'</p>'+
      '<h2>Exceptions and receiving decisions</h2><table><tr><th>Key</th><th>Finding</th><th>Source record</th><th>Destination record</th><th>Observed difference</th><th>Recorded disposition</th></tr>'+issueRows+'</table>'+
      '<h2>Totals by currency</h2><pre>'+escape(JSON.stringify(report.totals_minor,null,2))+'</pre><p>Amounts above are exact minor units with the retained currency scales. Duplicate or partial rows remain in the raw export totals; totals are not revenue or payment proof.</p>'+
      '<p>Input SHA-256: <code>'+report.input_sha256+'</code></p></html>\n';
  }
  function issuesCsv(report){return [['issue_id','key','kind','source_records','destination_records','details'],...report.issues.map(i=>[i.id,i.key,i.kind,i.source_records.join(';'),i.destination_records.join(';'),i.details.join('; ')])].map(r=>r.map(v=>csvCell(/^[=+\-@]/.test(String(v))?"'"+v:v)).join(',')).join('\r\n')+'\r\n';}
  return Object.freeze({analyze,review,reportHtml,issuesCsv});
}
