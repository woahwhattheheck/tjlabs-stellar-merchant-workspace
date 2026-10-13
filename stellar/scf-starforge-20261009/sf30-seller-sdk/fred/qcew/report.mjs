// MIT. A portable, grayscale county report family and complete calculated/source exports.
import { Buffer } from 'node:buffer';
import { canonical, csvCell, decimalText, restoreQuantity, periodKey, need } from './model.mjs';
import { validateQcewReport } from './calculate.mjs';
import { sha256 } from './source.mjs';
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
const labelStatus=status=>({
  available:'Available',disclosed_components:'Disclosed components only',withheld:'Withheld by the publisher',
  historical_unavailable:'Historical disclosure or availability cannot be resolved',classification_unavailable:'Original industry classification unavailable for this period',missing_source:'Original area/period source unavailable',
  missing:'Original value unavailable',missing_price:'Original price-index observation unavailable',no_activity:'No covered activity',
  zero_denominator:'Ratio denominator is zero'
}[status]??status);
function formatted(item,places=1,{money=false,ratio=false,percent=false}={}) {
  const value=restoreQuantity(item);
  if(!value) return '—';
  let number=decimalText(value,places),[whole,fraction='']=number.split('.');
  whole=whole.replace(/\B(?=(\d{3})+(?!\d))/g,',');
  number=whole+(places?'.'+fraction.padEnd(places,'0'):'');
  return (money?'$':'')+number+(ratio?'×':'')+(percent?'%':'')+(item.status==='disclosed_components'?'*':'');
}
function cell(item,places=1,options={}) {
  return '<td class="number" title="'+escape(labelStatus(item?.status))+'">'+escape(formatted(item,places,options))+'</td>';
}
function moneyLabel(report) { return report.profile.definition.price.dollars==='constant'?periodKey(report.priceBase)+' dollars':'nominal dollars'; }
function chartNumber(item) { const value=item?.value===null?null:Number(item?.value);return Number.isFinite(value)?value:null; }
const dashes=['','7 3','2 3','10 3 2 3'];
function chart(figure,{compact=false}={}) {
  const width=720,height=compact?300:360,margin={left:76,right:20,top:20,bottom:42};
  const all=figure.series.flatMap(series=>series.points),numbers=all.map(point=>chartNumber(point.value)).filter(value=>value!==null);
  const years=all.map(point=>point.year),first=Math.min(...years),last=Math.max(...years);
  const low=Math.min(0,...numbers),high=Math.max(1,...numbers),span=high-low||1,top=high+span*0.07;
  const x=year=>margin.left+(year-first)/(last-first||1)*(width-margin.left-margin.right);
  const y=value=>height-margin.bottom-(value-low)/(top-low)*(height-margin.top-margin.bottom);
  const ticks=Array.from({length:5},(_,index)=>low+(top-low)*index/4);
  const fmt=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:Math.abs(value)<10?2:0,notation:Math.abs(value)>=1000000?'compact':'standard'}).format(value);
  const grid=ticks.map(value=>'<line x1="'+margin.left+'" x2="'+(width-margin.right)+'" y1="'+y(value)+'" y2="'+y(value)+'" stroke="#dedede"/><text x="'+(margin.left-10)+'" y="'+(y(value)+4)+'" text-anchor="end">'+escape(fmt(value))+'</text>').join('');
  const yearTicks=[...new Set([first,...years.filter(year=>year%5===0),last])].sort((a,b)=>a-b);
  const labels=yearTicks.map(year=>'<text x="'+x(year)+'" y="'+(height-12)+'" text-anchor="middle">'+year+'</text>').join('');
  const lines=figure.series.map((series,index)=>{
    let segments=[],current=[];
    for(const point of series.points) {
      const value=chartNumber(point.value);
      if(value===null) {if(current.length)segments.push(current);current=[];}
      else current.push({point,value});
    }
    if(current.length)segments.push(current);
    return segments.map(segment=>{
      const path=segment.map(({point,value},i)=>(i?'L':'M')+x(point.year).toFixed(2)+','+y(value).toFixed(2)).join(' ');
      const circles=segment.map(({point,value})=>'<circle cx="'+x(point.year)+'" cy="'+y(value)+'" r="'+(index===0?2.5:1.7)+'" fill="'+(index%2?'white':'#252525')+'" stroke="#252525"><title>'+escape(series.label+' · '+point.period+' · '+formatted(point.value,figure.unit==='jobs'?0:2)+' · '+labelStatus(point.value.status))+'</title></circle>').join('');
      return '<path d="'+path+'" fill="none" stroke="#252525" stroke-width="'+(index===0?'2.6':'1.8')+'" stroke-dasharray="'+dashes[index%dashes.length]+'"/>'+circles;
    }).join('');
  }).join('');
  const legend=figure.series.map((series,index)=>'<span class="legend-item"><svg aria-hidden="true" viewBox="0 0 38 10"><line x1="1" y1="5" x2="36" y2="5" stroke="#252525" stroke-width="'+(index===0?'2.6':'1.8')+'" stroke-dasharray="'+dashes[index%dashes.length]+'"/></svg>'+escape(series.label)+'</span>').join('');
  const dataRows=(figure.series[0]?.points??[]).map((point,index)=>'<tr><th scope="row">'+escape(point.period)+'</th>'+figure.series.map(series=>cell(series.points[index]?.value,figure.unit==='jobs'?0:2)).join('')+'</tr>').join('');
  return '<figure class="'+(compact?'compact-chart':'')+'"><figcaption>'+escape(figure.title)+'</figcaption><svg class="chart" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+escape(figure.title+'; '+figure.unit+'; original missing observations form gaps')+'"><g class="axis">'+grid+labels+'</g>'+lines+'</svg><div class="legend">'+legend+'</div><details class="chart-data no-print"><summary>Read chart values</summary><div class="table-scroll" role="region" tabindex="0" aria-label="'+escape(figure.title+' values')+'"><table><thead><tr><th>Period</th>'+figure.series.map(series=>'<th>'+escape(series.label)+'</th>').join('')+'</tr></thead><tbody>'+dataRows+'</tbody></table></div></details></figure>';
}
function overview(report) {
  const definition=report.profile.definition,comparators=definition.regions.filter(region=>region.id!==definition.focus);
  return '<div class="table-scroll" role="region" tabindex="0" aria-label="Current employment, wages and comparison changes"><table class="overview-table"><caption>1.1 · '+escape(report.periodLabel)+' overview; changes from '+escape(periodKey(report.baseline))+'</caption><thead><tr><th scope="col">Industry</th><th scope="col">Employment</th><th scope="col">Weekly wage</th>'+comparators.map(region=>'<th scope="col">Relative to<br>'+escape(region.label)+'</th>').join('')+'<th scope="col">Employment change</th><th scope="col">Wage change</th></tr></thead><tbody>'+
    report.tables.overview.map(row=>'<tr class="'+(row.industry==='10'?'total':'')+'"><th scope="row">'+escape(row.label)+'</th>'+cell(row.employment,0)+cell(row.weeklyWage,1,{money:true})+row.relativeWages.map(item=>cell(item.ratio,2,{ratio:true})).join('')+cell(row.employmentChange,1,{percent:true})+cell(row.wageChange,1,{percent:true})+'</tr>').join('')+'</tbody></table></div>';
}
function historical(report) {
  return report.tables.historical.map((table,index)=>'<div class="table-scroll" role="region" tabindex="0" aria-label="'+escape('Historical wages relative to '+table.label)+'"><table class="history-table"><caption>2.'+(index+1)+' · Wages relative to '+escape(table.label)+'</caption><thead><tr><th scope="col">Industry</th>'+table.periods.map(period=>'<th scope="col">'+escape(period)+'</th>').join('')+'</tr></thead><tbody>'+table.rows.map(row=>'<tr class="'+(row.industry==='10'?'total':'')+'"><th scope="row">'+escape(row.label)+'</th>'+row.values.map(item=>cell(item,2,{ratio:true})).join('')+'</tr>').join('')+'</tbody></table></div>').join('');
}
function notes(report) {
  const p=report.profile.definition;
  return '<p class="note">Wages: '+escape(moneyLabel(report))+'. '+escape(p.employment==='quarter_mean'?'Employment is the mean of the three monthly counts.':'Employment is the original third-month count.')+' QCEW is not seasonally adjusted. — indicates unavailable values or no wage denominator; hover or read the data export for the exact source status. '+(p.coverage==='disclosed_components'?'* marks disclosed-component aggregates. ':'')+'Historical missing values form chart gaps.</p>';
}
function sourceRowsCsv(report) {
  const fields=['key','area_fips','own_code','industry_code','agglvl_code','size_code','year','qtr','status','file','originalRow','disclosureCode','qtrly_estabs','month1_emplvl','month2_emplvl','month3_emplvl','total_qtrly_wages','avg_wkly_wage'];
  return fields.map(csvCell).join(',')+'\r\n'+report.sourceRows.map(row=>fields.map(field=>csvCell(field in row?row[field]:row.originalValues?.[field]??null)).join(',')).join('\r\n')+'\r\n';
}
export function qcewDataCsv(report) {
  validateQcewReport(report);
  const fields=['period','region','industry','employment','employment_status','average_employment','month1_employment','month2_employment','month3_employment','establishments','establishments_status','quarterly_wages','quarterly_wages_status','weekly_wage_nominal','weekly_wage_nominal_status','weekly_wage','weekly_wage_status','price_index','price_index_status','price_factor','price_base','dollars','employment_convention','wage_convention','coverage_convention','source_components','source_observed','source_zero','source_unavailable'];
  const p=report.profile.definition;
  const rows=report.matrix.map(row=>[
    row.period,row.region,row.industry,row.employment.value,row.employment.status,row.averageEmployment.value,
    ...row.monthlyEmployment.map(item=>item.value),row.establishments.value,row.establishments.status,
    row.quarterlyWages.value,row.quarterlyWages.status,row.weeklyWageNominal.value,row.weeklyWageNominal.status,
    row.weeklyWage.value,row.weeklyWage.status,row.priceIndex.value,row.priceIndex.status,row.priceFactor.value,
    periodKey(report.priceBase),p.price.dollars,p.employment,p.wageMethod,p.coverage,
    row.coverage.components,row.coverage.observed,row.coverage.structuralZero,row.coverage.unavailable
  ].map(csvCell).join(','));
  return fields.map(csvCell).join(',')+'\r\n'+rows.join('\r\n')+'\r\n';
}
export function qcewMethodologyMarkdown(report) {
  validateQcewReport(report);
  const p=report.profile.definition,focus=p.regions.find(region=>region.id===p.focus);
  return '# '+focus.label+' — '+p.title+' — '+report.periodLabel+'\n\n'+
    'Profile: '+p.name+'. Comparison baseline: '+periodKey(report.baseline)+'. Price basis: '+moneyLabel(report)+'.\n\n'+
    Object.entries(report.methodology).filter(([,value])=>typeof value==='string').map(([key,value])=>'## '+key[0].toUpperCase()+key.slice(1)+'\n\n'+value+'\n').join('\n')+
    '\n## Original area and ownership mapping\n\n'+
    '| Region | Original BLS areas |\n| --- | --- |\n'+p.regions.map(region=>'| '+region.label.replaceAll('|','\\|')+' | '+region.areas.join(', ')+' |').join('\n')+
    '\n\n| Industry | Original code | Aggregation | Disjoint ownership codes |\n| --- | --- | --- | --- |\n'+p.industries.map(row=>'| '+row.label.replaceAll('|','\\|')+' | '+row.code+' | '+row.kind+' | '+row.ownerships.join(', ')+' |').join('\n')+
    '\n\nOwnership 0 is total covered; 1 federal, 2 state, 3 local, 5 private, 8 total government, and 9 total UI-covered. National aggregates exclude Puerto Rico and the U.S. Virgin Islands. The total row and sector rows are independent original BLS aggregates; their comparison is not an assumption that every underlying cell is disclosed.\n\n'+
    '## Reproduction and files\n\nreport.json contains the saved profile, exact rational numerators and denominators, all calculated regional-period cells, original source-row references and original source member hashes. data.csv contains displayed calculation values and explicit availability statuses. source-rows.csv contains the original selected classification keys, original numeric strings and source lines. Original complete CSV members and the complete price-index capture remain in the enclosing saved FRED project and portable project export. Import CSV codes as text to preserve leading zeros.\n\n'+
    'The first edition and each successor are immutable. A changed profile creates another profile identity; source updates create another capture identity. Produce the next period with the same retained profile, inspect its original availability, and retain its full change summary and exports.\n\n'+
    '## Original sources\n\n'+report.methodology.citations.map(item=>'- ['+item.title+']('+item.url+')').join('\n')+
    '\n\n## Operator notes\n\n'+(p.operatorNotes||'No additional profile notes.')+'\n\n'+
    'Publisher: '+p.publisher.name+'. Methodology owner: '+p.publisher.methodologyOwner+'.'+(p.publisher.sponsor?' Sponsor treatment: '+p.publisher.sponsor.line+' '+p.publisher.sponsor.name+'.':'')+'\n';
}
export function renderQcewReport(report) {
  validateQcewReport(report);
  const p=report.profile.definition,focus=p.regions.find(region=>region.id===p.focus);
  const title=focus.label+' — '+p.title+' — '+report.periodLabel;
  const pageCount=4+report.figures.industries.length;
  let pageNumber=0;
  const page=(heading,body,classes='')=>{
    pageNumber++;
    return '<section class="page '+classes+'" id="page-'+pageNumber+'"><header class="page-header"><span>'+escape(focus.label)+' · '+escape(report.periodLabel)+'</span><span>'+escape(p.publisher.name)+'</span></header><h1>'+escape(heading)+'</h1>'+body+'<footer class="page-footer"><span>'+escape(p.title)+' · '+escape(moneyLabel(report))+'</span><span>'+pageNumber+' / '+pageCount+'</span></footer></section>';
  };
  const cover=page(p.title,'<div class="cover"><p class="eyebrow">'+escape(report.periodLabel)+'</p><h2>'+escape(focus.label)+'</h2><p class="cover-description">Covered employment, industry wages and regional comparisons</p><dl><dt>Reporting period</dt><dd>'+escape(report.periodLabel)+'</dd><dt>Comparison baseline</dt><dd>'+escape(periodKey(report.baseline))+'</dd><dt>Dollar basis</dt><dd>'+escape(moneyLabel(report))+'</dd><dt>Comparator regions</dt><dd>'+p.regions.filter(region=>region.id!==p.focus).map(region=>escape(region.label)).join(' · ')+'</dd><dt>Original source edition</dt><dd>'+escape(report.source.retrievedThrough.slice(0,10))+'</dd></dl><p>'+escape(p.publisher.name)+(p.publisher.contact?' · '+escape(p.publisher.contact):'')+'</p>'+(p.publisher.sponsor?'<div class="sponsor"><p>'+escape(p.publisher.sponsor.line)+'</p><strong>'+escape(p.publisher.sponsor.name)+'</strong>'+(p.publisher.sponsor.url?'<p><a href="'+escape(p.publisher.sponsor.url)+'">'+escape(p.publisher.sponsor.url)+'</a></p>':'')+'</div>':'')+'<p class="note">Original sources: U.S. Bureau of Labor Statistics, Quarterly Census of Employment and Wages; '+escape(report.cpi.series.title)+', retrieved through FRED. Methods and original source mappings appear in the final section.</p></div>','cover-page');
  const first=page('Employment and wages','<div class="chart-pair">'+report.figures.overview.map(figure=>chart(figure,{compact:true})).join('')+'</div>'+overview(report)+notes(report),'overview-page');
  const second=page('Historical regional comparisons',historical(report)+notes(report),'historical-page');
  const industryPages=report.figures.industries.map(item=>page(item.label,chart(item.wages)+chart(item.relative)+notes(report),'industry-page')).join('');
  const methods=page('Sources and methods','<div class="methods">'+Object.entries(report.methodology).filter(([,value])=>typeof value==='string').map(([key,value])=>'<p><strong>'+escape(key[0].toUpperCase()+key.slice(1))+'.</strong> '+escape(value)+'</p>').join('')+
    '<h2>Configured regions</h2><p>'+p.regions.map(region=>'<strong>'+escape(region.label)+':</strong> '+escape(region.areas.join(', '))).join('<br>')+'</p>'+
    '<h2>Industry and ownership mapping</h2><p>'+p.industries.map(item=>escape(item.code)+' ('+escape(item.kind)+'): '+escape(item.ownerships.join('/'))).join('; ')+'.</p>'+
    '<p>Ownership 0: total covered; 1: federal; 2: state; 3: local; 5: private; 8: total government; 9: UI-covered. National totals exclude Puerto Rico and the U.S. Virgin Islands.</p>'+
    '<h2>Original publications</h2><ol>'+report.methodology.citations.map(item=>'<li><a href="'+escape(item.url)+'">'+escape(item.title)+'</a></li>').join('')+'</ol>'+
    (p.operatorNotes?'<p><strong>Profile notes.</strong> '+escape(p.operatorNotes)+'</p>':'')+
    '<p><strong>Methodology owner.</strong> '+escape(p.publisher.methodologyOwner)+'. Original complete source members, calculations, profiles and recurring edition history remain available in the saved project and its portable export.</p></div>','methods-page');
  const sources='<section class="operator-files no-print"><h2>Complete edition files</h2><p>The report is self-contained for reading and printing. In the complete report folder, the following files provide the full calculations, selected original rows and editable methods.</p><div class="downloads"><a download href="report.json">Report JSON</a><a download href="data.csv">Calculated data CSV</a><a download href="source-rows.csv">Original selected rows CSV</a><a download href="methodology.md">Methods Markdown</a></div><details><summary>'+escape(report.source.files.some(file=>file.sourceKind==='quarterly_api_slice')?'Retained complete original quarterly CSV files':'Retained original archive members')+' ('+report.source.files.length+')</summary><div class="table-scroll" role="region" tabindex="0" aria-label="Original source files"><table><thead><tr><th>Area</th><th>Year</th><th>Original member</th><th>Bytes</th><th>SHA-256</th></tr></thead><tbody>'+report.source.files.map(file=>'<tr><td>'+escape(file.area)+'</td><td>'+escape(file.quarter?file.year+' Q'+file.quarter:file.year)+'</td><td><a href="'+escape(file.sourceUrl)+'">'+escape(file.member??file.file.replace(/\.gz$/,''))+'</a></td><td class="number">'+file.bytes+'</td><td class="hash">'+escape(file.sha256)+'</td></tr>').join('')+'</tbody></table></div></details></section>';
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>'+escape(title)+'</title><style>'+
    '*{box-sizing:border-box}html{background:#e8e8e8;color:#202020;font-family:Arial,Helvetica,sans-serif}body{margin:0;font-size:14px;line-height:1.4}a{color:#202020;text-underline-offset:3px}button{font:inherit;color:inherit;border:1px solid #888;background:#fff;padding:7px 13px;cursor:pointer}a:focus-visible,button:focus-visible,summary:focus-visible,[tabindex]:focus-visible{outline:2px solid #111;outline-offset:3px}.toolbar{position:sticky;top:0;z-index:5;background:#f7f7f7;border-bottom:1px solid #aaa;padding:10px 18px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}.toolbar strong{margin-right:auto}.page{position:relative;max-width:1000px;min-height:1080px;background:#fff;margin:24px auto;padding:32px 40px 72px;box-shadow:0 1px 5px #bbb;break-after:page}.page-header,.page-footer{display:flex;justify-content:space-between;gap:20px;font-size:11px;color:#555}.page-header{border-bottom:1px solid #999;padding-bottom:10px;margin-bottom:28px}.page-footer{position:absolute;left:40px;right:40px;bottom:24px;border-top:1px solid #aaa;padding-top:8px}h1{font-size:25px;line-height:1.2;margin:0 0 22px;font-weight:600}h2{font-size:17px}p{margin:0 0 12px}.cover{padding-top:56px}.cover h2{font-size:48px;line-height:1.08;font-weight:600;max-width:700px;margin:12px 0 22px}.eyebrow{font-size:22px;letter-spacing:.06em}.cover-description{font-size:21px;margin-bottom:44px;max-width:540px}dl{display:grid;grid-template-columns:180px 1fr;gap:10px 20px;padding:20px 0;border-top:1px solid #aaa;border-bottom:1px solid #aaa;margin:0 0 30px}dt{font-weight:600}dd{margin:0}.sponsor{border:1px solid #aaa;padding:18px;margin:32px 0}.sponsor strong{font-size:22px}.note{font-size:11px;color:#555;margin-top:16px;line-height:1.45}.chart-pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0 0 28px;break-inside:avoid}figcaption{font-weight:600;font-size:15px;margin-bottom:6px}.chart{display:block;width:100%;height:auto;overflow:visible}.axis{font:12px Arial,Helvetica,sans-serif;fill:#555}.legend{display:flex;flex-wrap:wrap;gap:5px 14px;font-size:11px}.legend-item{display:flex;align-items:center;gap:6px}.legend-item svg{width:30px;height:10px}.table-scroll{max-width:100%;overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:11px;line-height:1.2;margin:0 0 14px}caption{text-align:left;font-weight:600;font-size:13px;margin:10px 0}th,td{padding:6px 5px;border-bottom:1px solid #d6d6d6;vertical-align:middle}th{text-align:left;font-weight:600}thead th{border-top:1px solid #555;border-bottom:1px solid #555;vertical-align:bottom}.number{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.total th,.total td{font-weight:700;border-bottom:1px solid #555}.history-table{margin-bottom:30px}.history-table th:first-child{width:32%}.methods{font-size:12px;line-height:1.5}.methods h2{font-size:14px;margin:15px 0 6px}.methods ol{padding-left:20px}.methods li{margin-bottom:4px}.operator-files{max-width:1000px;margin:24px auto;background:#fff;padding:30px 40px}.downloads{display:flex;gap:18px;flex-wrap:wrap;margin:18px 0}details{margin-top:12px}summary{cursor:pointer;font-size:12px}.chart-data table{margin-top:10px}.hash{font:10px monospace;overflow-wrap:anywhere;max-width:180px}'+
    '@media(max-width:700px){.page{margin:12px 0;padding:20px 16px 70px;min-height:0}.page-header{margin-bottom:20px}.page-footer{left:16px;right:16px}.chart-pair{grid-template-columns:1fr}.cover{padding-top:25px}.cover h2{font-size:38px}dl{grid-template-columns:1fr;gap:4px}dd{margin-bottom:12px}table{min-width:600px}.operator-files{padding:20px 16px}.methods{font-size:14px}}'+
    '@page{size:Letter;margin:.4in}@media print{html,body{background:#fff;font-size:10px}.no-print{display:none!important}.page{width:7.7in;height:10.2in;min-height:0;max-width:none;margin:0;padding:0 0 25px;box-shadow:none;break-after:page;page-break-after:always}.methods-page{break-after:auto;page-break-after:auto}.page-header{font-size:8px;padding-bottom:6px;margin-bottom:14px}.page-footer{left:0;right:0;bottom:0;font-size:8px;padding-top:5px}h1{font-size:20px;margin-bottom:15px}h2{font-size:13px}.cover{padding-top:50px}.cover h2{font-size:42px}.cover-description{font-size:18px;margin-bottom:34px}dl{grid-template-columns:145px 1fr;font-size:12px}.eyebrow{font-size:20px}.cover p{font-size:12px}.cover .note{font-size:10px}.chart-pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}figure{margin-bottom:20px}figcaption{font-size:12px}.legend{font-size:9px;gap:4px 10px}.chart{max-height:3.7in}.compact-chart .chart{max-height:1.7in}table{font-size:8.8px;min-width:0;line-height:1.15;margin-bottom:12px}th,td{padding:4px 3px}caption{font-size:11px;margin:8px 0}.history-table{margin-bottom:18px}.history-table th:first-child{width:31%}.note{font-size:8.5px;margin-top:12px}.methods{font-size:10px;line-height:1.38}.methods h2{font-size:11px;margin:9px 0 5px}.methods p{margin-bottom:9px}.methods ol{font-size:9px}.table-scroll{overflow:visible}.industry-page figure{margin-bottom:22px}.sponsor{margin:22px 0}a{text-decoration:none;color:#202020}}'+
    '</style></head><body><nav class="toolbar no-print" aria-label="Report actions"><strong>'+escape(focus.label)+' · '+escape(report.periodLabel)+'</strong><a href="#page-2">Overview</a><a href="#page-3">Comparisons</a><a href="#page-'+pageCount+'">Methods</a><button type="button" id="print-report">Print / save PDF</button></nav><main>'+cover+first+second+industryPages+methods+sources+'</main><script>document.getElementById("print-report").addEventListener("click",function(){window.print()});</script></body></html>\n';
}
export function buildQcewReportFiles(report) {
  validateQcewReport(report);
  const bodies={
    'report.html':{contentType:'text/html; charset=utf-8',body:renderQcewReport(report)},
    'report.json':{contentType:'application/json',body:JSON.stringify(report,null,2)+'\n'},
    'data.csv':{contentType:'text/csv; charset=utf-8',body:qcewDataCsv(report)},
    'source-rows.csv':{contentType:'text/csv; charset=utf-8',body:sourceRowsCsv(report)},
    'methodology.md':{contentType:'text/markdown; charset=utf-8',body:qcewMethodologyMarkdown(report)}
  };
  return Object.entries(bodies).map(([name,item])=>{
    const bytes=Buffer.from(item.body,'utf8');return {name,contentType:item.contentType,bytes:bytes.length,sha256:sha256(bytes),body:item.body};
  });
}
