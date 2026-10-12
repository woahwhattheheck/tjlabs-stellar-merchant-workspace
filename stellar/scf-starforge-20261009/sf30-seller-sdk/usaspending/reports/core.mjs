// MIT. Complete public funding reports from original award and transaction sources.
import {gzipSync,gunzipSync} from 'node:zlib';
import {canonical,sha,plain,string,integer,publicRow,now} from '../core.mjs';
import {inspectUSAspendingEdition} from '../dossier.mjs';
import {inspectTransactionCapture} from '../transactions/store.mjs';
import {analyzeTransactions,compareTransactions,transactionCsv,demand} from '../transactions/core.mjs';
import {MAX_ASSET_BYTES} from '../../response-asset.mjs';

export const FUNDING_REPORT_SCHEMA='stellar-forge.usaspending-funding-report.v1';
export const FUNDING_DELIVERY_SCHEMA=FUNDING_REPORT_SCHEMA+'.delivery';
export const MAX_REPORT_BYTES=128*1024*1024;
export const REPORT_FIELDS=Object.freeze({title:240,publisher:240,purpose:4000,findings:20000,implications:8000,useTerms:8000});
const HASH=/^[a-f0-9]{64}$/;
const equal=(a,b)=>canonical(a)===canonical(b);
const json=v=>JSON.stringify(v,null,2)+'\n';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cells=values=>values.map(v=>'<td>'+esc(v??'Not reported')+'</td>').join('');
const money=value=>value===null||value===undefined?'Unknown':String(value);
const table=(head,rows)=>'<div class="table"><table><thead><tr>'+head.map(x=>'<th scope="col">'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+cells(row)+'</tr>').join('')+'</tbody></table></div>';
const prose=value=>String(value).split(/\n\s*\n/).map(p=>'<p>'+esc(p).replace(/\n/g,'<br>')+'</p>').join('');

export function reportContent(value) {
  demand(plain(value)&&Object.keys(value).every(k=>Object.hasOwn(REPORT_FIELDS,k)),'FUNDING_REPORT_CONTENT_INVALID');
  return Object.fromEntries(Object.entries(REPORT_FIELDS).map(([key,max])=>[key,string(value[key]??'',key,max,key==='implications')]));
}
function sourceAnalysis(source) {
  demand(plain(source)&&Object.keys(source).every(k=>['editions','after','before'].includes(k))&&Array.isArray(source.editions)&&source.editions.length>=1&&source.editions.length<=2,'FUNDING_REPORT_SOURCES_REQUIRED');
  const editions=new Map();
  for(const edition of source.editions) {
    demand(!Object.hasOwn(edition,'reviews')&&!edition.buyerDelivery,'FUNDING_REPORT_OFFICIAL_SOURCE_REQUIRED','Select the original public award source for this report.');
    const checked=inspectUSAspendingEdition(edition);
    demand(!editions.has(checked.editionId),'FUNDING_REPORT_EDITION_DUPLICATE');
    editions.set(checked.editionId,edition);
  }
  const inspect=packet=>{
    demand(plain(packet)&&!Object.hasOwn(packet,'review'),'FUNDING_REPORT_SOURCE_CAPTURE_REQUIRED');
    const edition=editions.get(packet.awardEditionId),award=edition?.rows.find(row=>row.award_key===packet.awardKey);
    demand(award,'FUNDING_REPORT_AWARD_SOURCE_REQUIRED');
    const checked=inspectTransactionCapture(packet,{awardRow:award});
    demand(checked.checked.complete&&packet.coverage.status==='complete','FUNDING_REPORT_CAPTURE_INCOMPLETE','Finish the original transaction history before preparing the report.');
    const analysis=analyzeTransactions(packet.rows,{award,coverage:packet.coverage});
    return {packet,edition,award,analysis};
  };
  const after=inspect(source.after),before=source.before?inspect(source.before):null;
  demand(!before||before.packet.awardKey===after.packet.awardKey,'FUNDING_REPORT_AWARD_MISMATCH');
  demand(!before||before.packet.captureId!==after.packet.captureId,'FUNDING_REPORT_SAME_COMPARISON');
  const required=new Set([after.packet.awardEditionId,...(before?[before.packet.awardEditionId]:[])]);
  demand(required.size===editions.size&&[...editions.keys()].every(k=>required.has(k)),'FUNDING_REPORT_UNUSED_SOURCE_EDITION');
  const comparison=before?compareTransactions(
    {id:before.packet.captureId,award_key:before.packet.awardKey,coverage:before.packet.coverage,rows:before.packet.rows},
    {id:after.packet.captureId,award_key:after.packet.awardKey,coverage:after.packet.coverage,rows:after.packet.rows}):null;
  return {after,before,comparison};
}
function summary(analysis) {const {timeline,...value}=analysis;return value;}
export function createFundingReport({source,content,preparedAt=now(),reviewReference=null,previousReportSha256=null}) {
  const checked=sourceAnalysis(source),selected=reportContent(content);
  demand(typeof preparedAt==='string'&&Number.isFinite(Date.parse(preparedAt)),'FUNDING_REPORT_TIME_INVALID');
  demand(previousReportSha256===null||HASH.test(previousReportSha256),'FUNDING_REPORT_PARENT_INVALID');
  if(reviewReference!==null) {
    demand(plain(reviewReference)&&Object.keys(reviewReference).every(k=>['captureId','revision','sourceFingerprint'].includes(k))&&reviewReference.captureId===source.after.captureId&&reviewReference.sourceFingerprint===source.after.coverage.fingerprint,'FUNDING_REPORT_REVIEW_BINDING_INVALID');
    integer(reviewReference.revision,'Source review revision',1,1000000000);
  }
  const packet={schema:FUNDING_REPORT_SCHEMA,preparedAt,awardKey:checked.after.packet.awardKey,content:selected,source,reviewReference,previousReportSha256,
    analysis:{after:summary(checked.after.analysis),before:checked.before?summary(checked.before.analysis):null,comparison:checked.comparison}};
  return {...packet,sha256:sha(packet)};
}
export function inspectFundingReport(packet) {
  demand(plain(packet)&&packet.schema===FUNDING_REPORT_SCHEMA,'FUNDING_REPORT_SCHEMA_INVALID');
  const {sha256:expected,...value}=packet;
  demand(HASH.test(expected)&&sha(value)===expected,'FUNDING_REPORT_CHANGED');
  const rebuilt=createFundingReport(value);
  demand(equal(rebuilt,packet),'FUNDING_REPORT_SOURCE_OR_ANALYSIS_CHANGED');
  return {id:'FR-'+expected.slice(0,40),sha256:expected,title:packet.content.title,publisher:packet.content.publisher,preparedAt:packet.preparedAt,
    awardKey:packet.awardKey,sourceCaptureId:packet.source.after.captureId,sourceFingerprint:packet.source.after.coverage.fingerprint,
    comparisonCaptureId:packet.source.before?.captureId??null,sourceReviewRevision:packet.reviewReference?.revision??null,
    transactions:packet.analysis.after.unique_transactions,occurrences:packet.analysis.after.occurrences,
    netObligationUsd:packet.analysis.after.net_obligation_usd,netChangeUsd:packet.analysis.comparison?.net_obligation_delta_usd??null,
    sourcePages:packet.source.after.pages.length+(packet.source.before?.pages.length??0),previousReportSha256:packet.previousReportSha256};
}
export function fundingReportHTML(packet) {
  const {after,before,comparison}=sourceAnalysis(packet.source),c=packet.content,a=after.analysis,award=after.award;
  const metrics=table(['Measure','USD / count'],[
    ['Unique transactions',a.unique_transactions],['Source occurrences',a.occurrences],
    ['Captured net obligation',money(a.net_obligation_usd)],['Known nonconflicting obligation',money(a.known_net_obligation_usd)],
    ['Known positive obligation',money(a.positive_obligation_usd)],['Known deobligation',money(a.deobligation_usd)],
    ['Award obligation at its own observation',money(a.award_obligation_usd)],
    ['Exercised value',money(award.exercised_usd)],['All-options value',money(award.potential_usd)],['Outlays',money(award.outlays_usd)],
  ]);
  const years=table(['Federal fiscal year','Transactions','Possible transactions','Net obligation USD','Known obligation USD','Conflicted transactions'],
    a.by_fiscal_year.map(y=>[y.fiscal_year,y.transactions,y.possible_transactions,money(y.net_obligation_usd),money(y.known_obligation_usd),y.conflicted_transactions]));
  const timeline=table(['Action date','Modification','Transaction ID','Agency action','Obligation USD','Running obligation USD','Description','Source page'],
    a.timeline.map(r=>[r.action_date,r.modification_number,r.transaction_id,r.action_type_description,money(r.source_conflict?null:r.federal_action_obligation),money(r.running_obligation_usd),r.description,r.source_page]));
  const duplicates=table(['Transaction ID','First page/index','Later page/index'],
    a.duplicate_occurrences.map(r=>[r.transaction_id,r.first.page+'/'+r.first.index,r.later.page+'/'+r.later.index]));
  const conflicts=table(['Transaction ID','First page/index','Conflicting page/index'],
    a.conflicts.map(r=>[r.transaction_id,r.first.page+'/'+r.first.index,r.later.page+'/'+r.later.index]));
  let comparisonHTML='';
  if(comparison) {
    const changes=[
      ...comparison.added.map(r=>['Added',r.transaction_id,r.action_date,'',money(r.federal_action_obligation)]),
      ...comparison.changed.map(r=>['Changed',r.transaction_id,r.fields.map(f=>f.field).join(', '),r.fields.map(f=>String(f.before??'Not reported')+' → '+String(f.after??'Not reported')).join('\n'),money(r.obligation_delta_usd)]),
      ...comparison.absent_in_later_capture.map(r=>['Absent in later capture',r.transaction_id,r.action_date,'',money(r.federal_action_obligation)]),
      ...(comparison.unresolved??[]).map(r=>['Unresolved',r.transaction_id,r.reason,'','Unknown']),
    ];
    comparisonHTML='<h2>Changes between source observations</h2>'+prose('Earlier capture: '+before.packet.captureId+'\nLater capture: '+after.packet.captureId+'\nNet obligation difference in USD: '+money(comparison.net_obligation_delta_usd))+
      '<p>Changes compare complete retained observations of this award. A changed field or absence describes those observations; the original source action description is retained separately.</p>'+
      table(['Change','Transaction ID','Field / action date','Original values','Observed amount / change USD'],changes);
  }
  const sources=[['After',after],...(before?[['Before',before]]:[])].flatMap(([label,s])=>s.packet.pages.map(p=>[label,p.request.page,p.receipt.finishedAt,p.receipt.request.url,p.receipt.sha256]));
  const sourceTable=table(['Observation','Page','Observed at','Original endpoint','Response SHA256'],sources);
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>'+esc(c.title)+'</title><style>body{font:15px/1.55 system-ui,sans-serif;color:#171717;background:#fff;margin:0}main{max-width:1200px;margin:auto;padding:32px}header{border-bottom:2px solid #222;margin-bottom:28px}h1{font-size:30px;line-height:1.15}h2{margin-top:32px;font-size:21px}h3{font-size:17px}p{max-width:100ch}small,.muted{color:#555}.table{overflow:auto;margin:16px 0}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}td,th{padding:8px 10px;border:1px solid #ccc;text-align:left;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#eee}a{color:inherit}code{overflow-wrap:anywhere}footer{border-top:1px solid #aaa;margin-top:32px;padding-top:16px}@media(max-width:600px){main{padding:16px}h1{font-size:25px}}@media print{main{max-width:none;padding:0}.table{overflow:visible}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><main><header><p>Federal award funding report · '+esc(c.publisher)+'</p><h1>'+esc(c.title)+'</h1><p>'+esc(award.recipient_name)+' · '+esc(award.piid??packet.awardKey)+'</p><p class="muted">Prepared '+esc(packet.preparedAt)+'</p></header>'+
    '<h2>Purpose</h2>'+prose(c.purpose)+'<h2>Findings</h2>'+prose(c.findings)+(c.implications?'<h2>Implications and next steps</h2>'+prose(c.implications):'')+
    '<h2>Original award</h2>'+table(['Field','Value'],[
      ['Award identity',packet.awardKey],['Recipient',award.recipient_name],['Awarding agency',award.awarding_agency],['Awarding subagency',award.awarding_subagency],['Funding agency',award.funding_agency],
      ['Award source observed at',award.source_observed_at],['Performance start',award.performance_start],['Performance end',award.performance_end],['Original description',award.description],
    ])+'<p><a href="'+esc(award.source_url)+'">Open the official award</a></p>'+
    '<h2>Funding totals</h2>'+metrics+'<p>Amounts are exact original decimal strings in USD. Missing values remain unknown. Source conflicts prevent affected amounts from becoming a settled total. Agency action names retain their original wording.</p>'+
    '<h2>Federal fiscal years</h2>'+years+comparisonHTML+'<h2>Complete transaction timeline</h2>'+timeline+
    (a.duplicate_occurrences.length?'<h2>Repeated source occurrences</h2>'+duplicates:'')+
    (a.conflicts.length?'<h2>Conflicting source records</h2>'+conflicts:'')+
    '<h2>Original sources and observation times</h2>'+sourceTable+
    '<p>The complete original award edition, transaction occurrences, request bodies, responses and acquisition records are included in this delivery. The source award and transaction captures retain their own observation dates.</p>'+
    '<h2>Use and attribution</h2>'+prose(c.useTerms)+'<p>Official source: USAspending.gov. Report analysis: '+esc(c.publisher)+'.</p>'+
    '<footer><small>Report SHA256 <code>'+esc(packet.sha256)+'</code><br>Source capture '+esc(after.packet.captureId)+' · source fingerprint <code>'+esc(after.packet.coverage.fingerprint)+'</code></small></footer></main></body></html>\n';
}
export function fundingDeliveryFiles(packet) {
  const record=(name,type,content)=>{const bytes=Buffer.isBuffer(content)?content:Buffer.from(content);return{name,type,bytes:bytes.length,sha256:sha(bytes),contentBase64:bytes.toString('base64')};};
  const files=[
    record('report.html','text/html',fundingReportHTML(packet)),
    record('transactions.csv','text/csv',transactionCsv(packet.source.after.rows,{spreadsheet:true})),
    record('report.json','application/json',json(packet)),
    record('README.md','text/markdown','# '+packet.content.title+'\n\nOpen report.html for the complete report. Exact decimal amounts and null values remain in report.json and the original source files. transactions.csv is spreadsheet-safe.\n\nReceive this original .funding-report.gz delivery in Federal awards → Funding reports, or use:\n\n    starforge usaspending-research report-receive --workspace /private/research --file /private/report.funding-report.gz\n\nThe receiving workspace preserves the exact original file. Open its saved report, or prepare a revised report from that original report identity. A new report keeps its source and preceding report; reopening this file continues the original delivery.\n\nOriginal source files and complete acquisition records follow under source/. The source is public USAspending data; the selected report analysis and terms are in report.json.\n'),
  ];
  for(const [index,edition]of packet.source.editions.entries())files.push(record('source/award-edition-'+index+'.json','application/json',json(edition)));
  for(const [label,capture]of [['after',packet.source.after],...(packet.source.before?[['before',packet.source.before]]:[])]) {
    files.push(record('source/transactions-'+label+'.json','application/json',json(capture)));
    if(label==='before')files.push(record('before-transactions.csv','text/csv',transactionCsv(capture.rows,{spreadsheet:true})));
    for(const page of capture.pages) {
      files.push(record('source/'+label+'/page-'+page.request.page+'.json','application/json',Buffer.from(page.responseBase64,'base64')));
      files.push(record('source/'+label+'/page-'+page.request.page+'-receipt.json','application/json',json({request:page.request,receipt:page.receipt})));
    }
  }
  return files;
}
export function encodeFundingDelivery(packet) {
  const report=inspectFundingReport(packet);
  const value={schema:FUNDING_DELIVERY_SCHEMA,report:packet,files:fundingDeliveryFiles(packet)};
  const raw=Buffer.from(json(value));
  demand(raw.length<=MAX_REPORT_BYTES,'FUNDING_REPORT_CAPACITY','The complete source and report exceed the configured portable-report capacity.');
  const bytes=gzipSync(raw,{level:9});
  demand(bytes.length<=MAX_ASSET_BYTES,'FUNDING_REPORT_ASSET_CAPACITY','The complete report exceeds the original file-product capacity. Select a smaller source edition while retaining complete award transaction history.');
  return {bytes,sha256:sha(bytes),uncompressedBytes:raw.length,files:value.files.map(({contentBase64,...f})=>f),report};
}
export function decodeFundingDelivery(bytes,{expectedSha256}={}) {
  bytes=Buffer.from(bytes);
  demand(bytes.length>0&&bytes.length<=MAX_ASSET_BYTES,'FUNDING_REPORT_ASSET_CAPACITY');
  if(expectedSha256!==undefined)demand(HASH.test(expectedSha256)&&sha(bytes)===expectedSha256,'FUNDING_REPORT_DELIVERY_CHANGED');
  let raw,value;try{raw=gunzipSync(bytes,{maxOutputLength:MAX_REPORT_BYTES});value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
  catch(error){throw Object.assign(new Error('Open the complete original funding-report JSON gzip file.'),{code:'FUNDING_REPORT_DELIVERY_INVALID',cause:error});}
  demand(plain(value)&&value.schema===FUNDING_DELIVERY_SCHEMA&&Object.keys(value).every(k=>['schema','report','files'].includes(k)),'FUNDING_REPORT_DELIVERY_SCHEMA_INVALID');
  const report=inspectFundingReport(value.report),files=fundingDeliveryFiles(value.report);
  demand(equal(files,value.files),'FUNDING_REPORT_DELIVERY_FILES_CHANGED');
  return {packet:value.report,files,report,sha256:sha(bytes),bytes:bytes.length,uncompressedBytes:raw.length};
}
