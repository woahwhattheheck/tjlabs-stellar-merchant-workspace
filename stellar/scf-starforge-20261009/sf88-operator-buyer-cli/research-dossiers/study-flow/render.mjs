// MIT. Independent grayscale rendering of source-bound PRISMA 2020 reporting counts.
import {need,jsonBytes,digest} from '../../node/store.mjs';
import {FLOW_SCHEMA,FLOW_METRICS,flowDigest} from './contracts.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=value=>value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);
const csvCell=value=>'"'+plain(value).replaceAll('"','""')+'"';
const csv=(headers,rows)=>headers.map(csvCell).join(',')+'\r\n'+rows.map(row=>headers.map(key=>csvCell(row[key])).join(',')).join('\r\n')+'\r\n';
const known=value=>value===null?'Not established':new Intl.NumberFormat('en',{maximumFractionDigits:0}).format(value);
const safeUrl=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};
const link=(url,label)=>safeUrl(url)?'<a href="'+esc(safeUrl(url))+'" rel="noreferrer">'+esc(label??url)+'</a>':esc(label??url);
const counts=report=>new Map(report.counts.map(row=>[row.id,row]));
function requireReport(report){
 need(report?.schema===FLOW_SCHEMA&&Array.isArray(report.counts)&&Array.isArray(report.records)&&Array.isArray(report.reports)&&
 Array.isArray(report.studies)&&typeof report.reportSha256==='string','FLOW_REPORT_REQUIRED');
 const {reportSha256,...body}=report;need(flowDigest(body)===reportSha256,'FLOW_REPORT_CHANGED');return report;
}
function wrapped(value,width){
 const out=[];for(const paragraph of String(value).split(/\r?\n/)){
 let line='';for(const word of paragraph.split(/\s+/)){
 if(!word)continue;
 if(word.length>width){
 if(line){out.push(line);line='';}
 for(let i=0;i<word.length;i+=width)out.push(word.slice(i,i+width));
 }else if(!line)line=word;
 else if(line.length+word.length+1<=width)line+=' '+word;
 else{out.push(line);line=word;}
 }
 if(line)out.push(line);if(!paragraph.trim())out.push('');
 }return out.length?out:[''];
}
export function studyFlowSvg(input){
 const report=requireReport(input),metrics=counts(report),other=report.definition.template.endsWith('all-sources');
 const update=report.definition.template.startsWith('update-'),width=other?1420:780;
 const sourceId='flow-'+(report.edition?.id??report.source.id),parts=[];
 const n=id=>known(metrics.get(id)?.value??null),row=id=>metrics.get(id);
 const valueLine=(label,id)=>label+' (n = '+n(id)+')';
 const bodyWidth=width-100,mainW=350,sideW=230,x=50,sx=445,ox=745,osx=1135;

 const box=(id,bx,by,bw,title,lines,{shade=false}={})=>{
 const all=[...wrapped(title,Math.floor((bw-28)/8.1)).map(value=>({value,bold:true})),
 ...lines.flatMap(value=>wrapped(value,Math.floor((bw-28)/7.6)).map(value=>({value,bold:false})))];
 const height=Math.max(72,all.length*20+30);
 parts.push('<g id="'+esc(id)+'"><rect x="'+bx+'" y="'+by+'" width="'+bw+'" height="'+height+
 '" rx="3" fill="'+(shade?'#f1f1f1':'white')+'" stroke="#333" stroke-width="1.4"/>'+
 all.map((v,i)=>'<text x="'+(bx+14)+'" y="'+(by+25+i*20)+'" font-size="'+(v.bold?'16':'14')+
 '"'+(v.bold?' font-weight="600"':'')+'>'+esc(v.value)+'</text>').join('')+'</g>');
 return{left:bx,right:bx+bw,top:by,bottom:by+height,middle:by+height/2,center:bx+bw/2,height};
 };
 const arrow=(points,{dashed=false}={})=>parts.push('<path d="'+points.map((p,i)=>(i?'L':'M')+p[0]+' '+p[1]).join(' ')+
 '" fill="none" stroke="#333" stroke-width="1.4"'+(dashed?' stroke-dasharray="5 4"':'')+' marker-end="url(#'+sourceId+'-arrow)"/>');
 const connector=(from,to)=>arrow([[from.center,from.bottom],[from.center,to.top-16],[to.center,to.top-16],[to.center,to.top]]);
 const branch=(from,next,side)=>{const by=Math.min(next.top-24,Math.max(from.bottom+20,side.middle));
 arrow([[from.center,from.bottom],[from.center,by],[side.left-14,by],[side.left-14,side.middle],[side.left,side.middle]]);};
 const titleLines=wrapped(report.definition.name,Math.floor((width-52)/14));
 titleLines.forEach((line,i)=>parts.push('<text x="26" y="'+(36+i*30)+'" font-size="25" font-weight="600">'+esc(line)+'</text>'));
 const headerShift=(titleLines.length-1)*30;
 const subtitle=(update?'Updated review':'New review')+' · '+(other?'Databases, registers and other methods':'Databases and registers')+
 ' · '+(report.status==='reviewed'?'Reviewed edition':'Working/reporting edition');
 parts.push('<text x="26" y="'+(62+headerShift)+'" font-size="14">'+esc(subtitle)+'</text>');
 parts.push('<text x="26" y="'+(85+headerShift)+'" font-size="13">'+esc('Saved source revision '+report.source.sourceRevision+
 (report.edition?' · Diagram edition '+report.edition.number:' · Unsaved preview')+' · '+
 (report.summary.reportingComplete?'Reporting counts complete':'Source or reporting counts remain partial'))+'</text>');
 let prior;
 if(update)prior=box(sourceId+'-previous',x,109+headerShift,bodyWidth,'Previous review',[
 valueLine('Previously included studies','previous_studies')+'; '+valueLine('reports','previous_reports'),
 valueLine('Omitted from this update: studies','previous_studies_removed')+'; '+valueLine('reports','previous_reports_removed'),
 valueLine('Previous reports found and included again in the current search','previous_reports_found')],{shade:true});
 const base=prior?prior.bottom+35:132+headerShift;
 const y={identified:base,screened:base+205,sought:base+370,assessed:base+555};
 const identified=box(sourceId+'-identified',x,y.identified,mainW,'Records identified',[
 valueLine('Databases','database_results'),valueLine('Registers','register_results')],{shade:true});
 const removed=box(sourceId+'-removed',sx,y.identified,sideW,'Removed before screening',[
 valueLine('Duplicates','duplicates'),valueLine('Automation','excluded_automatic'),valueLine('Other reasons','excluded_other')]);
 const screened=box(sourceId+'-screened',x,y.screened,mainW,'Records screened',[valueLine('Records','records_screened')]);
 connector(identified,screened);branch(identified,screened,removed);
 const excluded=box(sourceId+'-screen-excluded',sx,y.screened,sideW,'Records excluded',[
 valueLine('Records','records_excluded'),...(report.definition.coverage.screeningBy==='mixed'?[
 'Human decisions: '+known(report.definition.coverage.screeningByHuman),
 'Automation decisions: '+known(report.definition.coverage.screeningByAutomation)]:[])]);
 const sought=box(sourceId+'-sought',x,y.sought,mainW,'Reports sought for retrieval',[valueLine('Reports','dbr_sought_reports')]);
 connector(screened,sought);branch(screened,sought,excluded);
 const missed=box(sourceId+'-not-retrieved',sx,y.sought,sideW,'Reports not retrieved',[valueLine('Reports','dbr_notretrieved_reports')]);
 const assessed=box(sourceId+'-assessed',x,y.assessed,mainW,'Reports assessed for eligibility',[valueLine('Reports','dbr_assessed')]);
 connector(sought,assessed);branch(sought,assessed,missed);
 const reasonLines=lane=>report.exclusionReasons.filter(v=>v.lane===lane).map(v=>v.label+' (n = '+known(v.value)+')');
 const exclusion=box(sourceId+'-fulltext-excluded',sx,y.assessed,sideW,'Reports excluded',[
 valueLine('All excluded reports','dbr_excluded'),...reasonLines('databases')]);
 let otherAssessed,otherExclusion;
 if(other){
 const identifyOther=box(sourceId+'-other-identified',ox,y.identified,mainW,'Records identified by other methods',[
 valueLine('Websites','website_results'),valueLine('Organisations','organisation_results'),
 valueLine('Citation searching','citations_results'),valueLine('Other methods','other_results')],{shade:true});
 const otherSought=box(sourceId+'-other-sought',ox,y.sought,mainW,'Reports sought for retrieval',[valueLine('Reports','other_sought_reports')]);
 connector(identifyOther,otherSought);
 const otherMissed=box(sourceId+'-other-not-retrieved',osx,y.sought,sideW,'Reports not retrieved',[valueLine('Reports','other_notretrieved_reports')]);
 otherAssessed=box(sourceId+'-other-assessed',ox,y.assessed,mainW,'Reports assessed for eligibility',[valueLine('Reports','other_assessed')]);
 connector(otherSought,otherAssessed);branch(otherSought,otherAssessed,otherMissed);
 otherExclusion=box(sourceId+'-other-excluded',osx,y.assessed,sideW,'Reports excluded',[
 valueLine('All excluded reports','other_excluded'),...reasonLines('other')]);
 }
 const finalY=Math.max(assessed.bottom,exclusion.bottom,otherAssessed?.bottom??0,otherExclusion?.bottom??0)+96;
 const final=box(sourceId+'-included',x,finalY,other?1045:mainW,update?'Studies and reports in the updated review':'Studies and reports included',[
 ...(update?[valueLine('Newly included studies','new_studies')+'; '+valueLine('new reports','new_reports')]:[]),
 valueLine('Total studies','total_studies')+'; '+valueLine('total reports','total_reports'),
 report.included.identityCoverage.studies&&report.included.identityCoverage.reports?
 'Counts retain explicit original study and report identities.':'Some reported counts are supported by attributed counts rather than a complete native identity list.'
 ],{shade:true});
 connector(assessed,final);branch(assessed,final,exclusion);
 if(otherAssessed){arrow([[otherAssessed.center,otherAssessed.bottom],[otherAssessed.center,final.top-22],[final.center,final.top-22],[final.center,final.top]]);
 branch(otherAssessed,final,otherExclusion);}
 if(update)arrow([[prior.right,prior.middle],[width-20,prior.middle],[width-20,final.middle],[final.right,final.middle]],{dashed:true});
 const caption=[
 'Derived values use the retained source and current original eligibility resolutions at the selected source revision.',
 'Records, reports and studies are distinct units. Unknown counts are shown as “Not established”.',
 'Reported overrides, retrieval outcomes, exclusion reasons and identity decisions are retained in the accompanying report.',
 'Reporting concepts: PRISMA 2020. Diagram and templates reference CC BY 4.0; this is an independently implemented renderer.'
 ];
 let cy=final.bottom+35;
 for(const line of caption.flatMap(value=>wrapped(value,Math.floor((width-60)/7.1)))){
 parts.push('<text x="26" y="'+cy+'" font-size="12">'+esc(line)+'</text>');cy+=18;
 }
 parts.push('<text x="26" y="'+(cy+3)+'" font-size="11">'+esc('Report SHA-256 '+report.reportSha256)+'</text>');
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+(cy+30)+'" viewBox="0 0 '+width+' '+(cy+30)+
 '" role="img" aria-labelledby="'+sourceId+'-title '+sourceId+'-desc"><title id="'+sourceId+'-title">'+esc(report.definition.name)+
 '</title><desc id="'+sourceId+'-desc">'+esc(subtitle+'. '+report.summary.unknownCounts+' unknown active counts. '+report.summary.errorCount+
 ' accounting errors. See the complete accompanying report for source identities and counting decisions.')+'</desc>'+
 '<defs><marker id="'+sourceId+'-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'+
 '<path d="M0 0 L10 5 L0 10z" fill="#333"/></marker></defs><rect width="100%" height="100%" fill="white"/>'+
 '<g font-family="Arial, Helvetica, sans-serif" fill="#171717">'+parts.join('')+'</g></svg>\n';
}
function table(headers,rows,{className=''}={}){
 return '<div class="scroll"><table class="'+className+'"><thead><tr>'+headers.map(v=>'<th>'+esc(v.label??v.key)+'</th>').join('')+
 '</tr></thead><tbody>'+rows.map(row=>'<tr>'+headers.map(v=>'<td>'+esc(plain(row[v.key]))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
export function studyFlowHtml(input){
 const r=requireReport(input),section=(id,title,body)=>'<section id="'+id+'"><h2>'+esc(title)+'</h2>'+body+'</section>';
 const countRows=r.counts.filter(v=>r.activeMetricIds.includes(v.id)).map(v=>({...v,value:known(v.value),
 derivedValue:known(v.derivedValue),basis:plain(v.basis)}));
 const sourceTable=table([{key:'id',label:'Edition'},{key:'provider',label:'Provider'},{key:'label',label:'Label'},
 {key:'sha256',label:'Original SHA-256'},{key:'bytes',label:'Bytes'},{key:'sourceReference',label:'Reference'}],
 r.source.editions.map(v=>({...v,sha256:v.raw.sha256,bytes:v.raw.bytes})));
 const recordTable=table([{key:'occurrenceId',label:'Occurrence'},{key:'title',label:'Title'},{key:'route',label:'Identification route'},
 {key:'disposition',label:'Record disposition'},{key:'reportKey',label:'Report identity'},{key:'workSetId',label:'Original work set'},
 {key:'screening',label:'Screening'},{key:'assessment',label:'Full text'},{key:'studyIds',label:'Original studies'},{key:'sourceSha256',label:'Original response SHA-256'}],
 r.records.map(v=>({...v,route:v.route?.kind??'unassigned',screening:plain(v.screening),assessment:plain(v.assessment)})));
 const reportTable=table([{key:'reportKey',label:'Report'},{key:'title',label:'Title'},{key:'lane',label:'Route'},
 {key:'occurrenceIds',label:'Original records'},{key:'retrieval',label:'Retrieval'},{key:'assessment',label:'Assessment'},
 {key:'included',label:'Included'},{key:'excludedReason',label:'Exclusion reason'},{key:'studyIds',label:'Linked studies'},{key:'retrievalBasis',label:'Retrieval basis'}],r.reports);
 const studyTable=table([{key:'id',label:'Study'},{key:'name',label:'Name'},{key:'included',label:'Included'},
 {key:'reportKeys',label:'Reports'},{key:'occurrenceIds',label:'Original records'},{key:'evidence',label:'Identity evidence'}],r.studies);
 const css='html{font:15px/1.55 Arial,Helvetica,sans-serif;color:#181818;background:#fff}body{max-width:1300px;margin:0 auto;padding:32px}h1{font-size:30px}h2{font-size:22px;margin-top:36px}h3{font-size:18px}.meta{border:1px solid #aaa;background:#f5f5f5;padding:16px}.diagram{overflow:auto;margin:20px 0}.diagram svg{width:100%;height:auto;min-width:680px}a{color:#222;text-decoration:underline}table{border-collapse:collapse;min-width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;border:1px solid #bbb;padding:8px;white-space:pre-wrap;overflow-wrap:anywhere;max-width:620px}th{background:#ededed}.scroll{overflow:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;padding:16px;border:1px solid #bbb}nav{display:flex;flex-wrap:wrap;gap:16px}.error{border-left:4px solid #222;padding-left:12px}.muted{color:#555}section{break-inside:auto}@media print{body{padding:0;max-width:none}.scroll{overflow:visible}.diagram svg{min-width:0}nav{display:none}a{color:inherit}}';
 const overview='<p><strong>'+esc(r.status.toUpperCase())+'</strong> · '+esc(r.summary.reportingComplete?'Reporting counts complete':'Partial reporting/source coverage')+
 ' · '+r.summary.errorCount+' accounting errors · '+r.summary.unknownCounts+' unknown active counts.</p><p>'+
 esc(r.definition.coverage.statement||'No complete-search statement has been supplied.')+'</p><p>'+
 esc(r.definition.description)+'</p><dl><dt>Original dossier</dt><dd>'+esc(r.dossier.id)+'</dd><dt>Saved source</dt><dd>Revision '+
 r.source.sourceRevision+' · '+esc(r.source.sourceRevisionSha256)+'</dd><dt>Diagram</dt><dd>'+esc(r.edition?.id??'unsaved preview')+
 (r.edition?' · edition '+r.edition.number+' · '+esc(r.edition.actor.name)+' · '+esc(r.edition.createdAt):'')+
 '</dd><dt>Complete report SHA-256</dt><dd>'+esc(r.reportSha256)+'</dd></dl>';
 const issueList=r.issues.length?'<ol>'+r.issues.map(v=>'<li class="'+(v.level==='error'?'error':'')+'"><strong>'+esc(v.code)+'</strong> — '+esc(v.message)+
 '<pre>'+esc(JSON.stringify(Object.fromEntries(Object.entries(v).filter(([k])=>!['code','message','level'].includes(k))),null,2))+'</pre></li>').join('')+'</ol>':'<p>No unresolved accounting or reporting issues.</p>';
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+
 esc(r.definition.name)+'</title><style>'+css+'</style></head><body><header><h1>'+esc(r.definition.name)+'</h1><nav>'+
 ['overview','diagram','counts','issues','source','records','reports','studies','decisions','references'].map(v=>'<a href="#'+v+'">'+esc(v)+'</a>').join('')+'</nav></header>'+
 section('overview','Reporting selection','<div class="meta">'+overview+'</div>')+
 section('diagram','Study flow','<div class="diagram">'+studyFlowSvg(r)+'</div>')+
 section('counts','Complete counts',table([{key:'label',label:'Count'},{key:'value',label:'Reported value'},{key:'unit',label:'Unit'},
 {key:'mode',label:'Derivation'},{key:'derivedValue',label:'Native derived value'},{key:'knownCount',label:'Known native members'},
 {key:'reason',label:'Reason'},{key:'basis',label:'Attributed source'}],countRows))+
 section('issues','Accounting and source coverage',issueList)+section('source','Original retained source',sourceTable)+
 section('records','Every selected original record',recordTable)+section('reports','Distinct reports',reportTable)+
 section('studies','Explicit original study groups',studyTable)+section('decisions','Complete saved reporting definition',
 '<pre>'+esc(JSON.stringify(r.definition,null,2))+'</pre><h3>Edition review</h3><pre>'+esc(JSON.stringify(r.review,null,2))+'</pre>')+
 section('references','Reporting references','<ul>'+r.references.map(v=>'<li>'+link(v.url,v.title)+' — '+esc(v.role)+
 (v.license?' · '+esc(v.license):'')+'</li>').join('')+'</ul><p class="muted">'+esc(r.method.scope)+'</p>')+'</body></html>\n';
}
export function studyFlowCsv(input,{section='counts'}={}){
 const r=requireReport(input);
 if(section==='counts')return csv(['data','n','unit','label','mode','derived','known_members','reason','basis','member_ids'],
 r.counts.filter(v=>r.activeMetricIds.includes(v.id)).map(v=>({data:v.id,n:v.value,unit:v.unit,label:v.label,mode:v.mode,
 derived:v.derivedValue,known_members:v.knownCount,reason:v.reason,basis:v.basis,member_ids:v.memberIds})));
 if(section==='records')return csv(['occurrenceId','editionId','key','title','url','doi','provider','sourceSha256','sourceBytes',
 'contentDigest','route','lane','disposition','rule','workSetId','reportKey','screening','assessment','retrieval','stageRows','studyIds'],r.records);
 if(section==='reports')return csv(['reportKey','title','lane','occurrenceIds','anchor','outcomeOccurrenceId','screening','assessment',
 'retrieval','retrievalBasis','excludedReasonId','excludedReason','resolutionIds','included','studyIds','sourceRows'],r.reports);
 if(section==='studies')return csv(['id','name','reason','evidence','occurrenceIds','reportKeys','includedReportKeys','included'],r.studies);
 if(section==='reasons')return csv(['lane','label','value','mode','reportKeys','basis','reason'],r.exclusionReasons);
 if(section==='issues')return csv(['id','code','level','message','metricIds','occurrenceId','reportKey','editionId','workSetId','left','right','difference'],r.issues);
 need(false,'FLOW_CSV_SECTION_INVALID');
}
export function exportStudyFlowReport(input,{format='json',section='counts',revision}={}){
 const report=requireReport(input);need(['json','svg','html','csv'].includes(format),'FLOW_EXPORT_FORMAT_INVALID');
 const body=format==='json'?jsonBytes(report):Buffer.from(format==='svg'?studyFlowSvg(report):format==='html'?studyFlowHtml(report):
 studyFlowCsv(report,{section}),'utf8');
 return{filename:'study-flow-'+(report.edition?.id??report.source.id)+(format==='csv'?'-'+section:'')+'.'+format,
 contentType:format==='json'?'application/json; charset=utf-8':format==='svg'?'image/svg+xml; charset=utf-8':
 format==='html'?'text/html; charset=utf-8':'text/csv; charset=utf-8',body,
 revision:revision??report.dossier.revision,flowId:report.flowId,editionId:report.edition?.id??null,
 sha256:digest(body),reportSha256:report.reportSha256};
}
