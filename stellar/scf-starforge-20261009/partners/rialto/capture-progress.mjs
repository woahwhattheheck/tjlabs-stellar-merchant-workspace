// MIT — Inspect and carry the complete original acquisition, including failed reads.
import path from 'node:path';
import {SCHEMA,need,plan,pageUrl,page,catalogue,canonical} from './core.mjs';
import {sha,json,read,exists,privateDir,writeNew,lock,inventory,receive,verifyHttp} from './io.mjs';

const CAPTURE=/^captures\/([a-f0-9]{64})-([0-9]{6})\.json$/;
const LIMIT=1024*1024*1024;
const safePath=name=>typeof name==='string'&&!name.includes('\\')&&!name.includes('\0')&&!name.startsWith('/')&&name.split('/').every(p=>p&&p!=='.'&&p!=='..');
const message=error=>String(error?.message??error);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shell=value=>"'"+String(value).replace(/'/g,"'\\''")+"'";
const CLI='stellar/scf-starforge-20261009/partners/rialto/customer.mjs';

/** Pure reconstruction from complete inventory members; never makes an HTTP request. */
export function captureProgress(files,{createdAt=new Date().toISOString(),directory=null}={}){
 need(Array.isArray(files),'Complete original file inventory required');
 const originals=new Map(),errors=[],attempts=[],byUrl=new Map();let totalBytes=0;
 for(const f of files){
  need(f&&safePath(f.path)&&!originals.has(f.path),'Invalid or repeated original source path');
  need(typeof f.base64==='string'&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&/^[a-f0-9]{64}$/.test(f.sha256),'Complete original source member required: '+f.path);
  const raw=Buffer.from(f.base64,'base64');
  need(raw.toString('base64')===f.base64&&raw.length===f.bytes&&sha(raw)===f.sha256,'Original member bytes changed: '+f.path);
  totalBytes+=raw.length;need(totalBytes<=LIMIT,'Original receiving source exceeds1GiB');
  originals.set(f.path,{...f,raw});
 }
 const planFile=originals.get('plan.json');need(planFile,'Original capture plan.json is required');
 let p;try{p=plan(JSON.parse(planFile.raw.toString('utf8')));}catch(error){throw new Error('Original capture plan cannot be opened: '+message(error));}
 const parse=file=>JSON.parse(file.raw.toString('utf8'));
 for(const file of [...originals.values()].filter(f=>f.path.startsWith('captures/')).sort((a,b)=>a.path.localeCompare(b.path))){
  const match=CAPTURE.exec(file.path),row={source:file.path,sourceBytes:file.bytes,sourceSha256:file.sha256,sequence:match?Number(match[2]):null,valid:false,selected:false};
  attempts.push(row);
  try{
   need(match,'Original capture filename is not a retained GET attempt');
   const record=verifyHttp(parse(file));
   need(record.method==='GET','Original catalogue capture method must be GET');
   need(sha(Buffer.from(record.url))===match[1],'Capture filename and original request URL disagree');
   need(record.status===null||(Number.isInteger(record.status)&&record.status>=100&&record.status<=599),'Original HTTP status is invalid');
   if(record.status===null)need(typeof record.error==='string','Original failed transport must retain its error');
   Object.assign(row,{url:record.url,method:record.method,status:record.status,startedAt:record.startedAt??null,retrievedAt:record.retrievedAt??null,bodyBytes:record.bodyBytes??null,bodySha256:record.bodySha256??null,error:record.error??null,valid:true});
   const group=byUrl.get(record.url)??[];group.push({row,record});byUrl.set(record.url,group);
  }catch(error){row.problem=message(error);errors.push({source:file.path,message:row.problem});}
 }
 for(const [url,group] of byUrl){
  group.sort((a,b)=>a.row.sequence-b.row.sequence);
  for(let i=0;i<group.length;i++)if(group[i].row.sequence!==i){
   errors.push({source:group[i].row.source,message:'Retained attempt sequence has a gap; preserve and reconcile the original files before resuming'});break;
  }
 }
 const capability=(name,url)=>{
  const group=byUrl.get(url)??[],selected=group.find(x=>x.record.status===200)??group.at(-1);
  if(selected)selected.row.selected=true;
  return{name,url,attempts:group.length,state:!selected?'not-started':selected.record.status===200?'http-received':selected.record.status===null?'transport-failed':'http-failed',
   source:selected?.row.source??null,status:selected?.record.status??null,error:selected?.record.error??null,
   bodyBytes:selected?.record.bodyBytes??null,bodySha256:selected?.record.bodySha256??null};
 };
 const facilitator=capability('Facilitator capabilities',p.facilitator+'/supported');
 const peers=capability('Federation peers',p.discovery+'/federation/peers');
 let offset=0,terminal=false;const selected=[],records=[];
 // Each accepted page advances offset or is terminal. Retained files bound the loop.
 for(let count=0;count<=attempts.length;count++){
  const url=pageUrl(p,offset),group=byUrl.get(url)??[];let accepted=null;
  for(const item of group){
   if(item.record.status!==200)continue;
   try{const value=page(item.record,p,offset);item.row.page={offset,rows:value.items.length,total:value.total,terminal:value.terminal};if(!accepted)accepted={...item,value};}
   catch(error){item.row.pageProblem=message(error);}
  }
  if(!accepted)break;
  accepted.row.selected=true;selected.push(accepted.row.source);records.push(accepted.record);
  offset=accepted.value.nextOffset;terminal=accepted.value.terminal;if(terminal)break;
 }
 const c=catalogue(p,records),nextUrl=terminal?null:pageUrl(p,offset);
 let savedCatalogue={present:false,valid:false,sha256:null,problem:null};
 if(originals.has('catalogue.json')){
  const file=originals.get('catalogue.json');savedCatalogue={present:true,valid:false,sha256:file.sha256,problem:null};
  try{
   const saved=parse(file);
   need(canonical(saved.sourcePages)===canonical(selected),'Saved catalogue names another original page sequence');
   for(const key of Object.keys(c))need(canonical(saved[key])===canonical(c[key]),'Saved catalogue differs from original pages: '+key);
   need(c.enumerationComplete,'Saved catalogue is not a completed original enumeration');
   for(const [fileKey,statusKey,url] of [['supportedSource','facilitatorReadStatus',facilitator.url],['peersSource','peersReadStatus',peers.url]]){
    const source=originals.get(saved[fileKey]);need(source&&CAPTURE.test(source.path),'Saved capability source is missing');
    const record=verifyHttp(parse(source));need(record.url===url&&record.method==='GET'&&record.status===saved[statusKey],'Saved capability source changed');
   }
   savedCatalogue.valid=true;
  }catch(error){savedCatalogue.problem=message(error);errors.push({source:'catalogue.json',message:savedCatalogue.problem});}
 }
 const relevant=new Set([facilitator.url,peers.url,...records.map(r=>r.url),...(nextUrl?[nextUrl]:[])]);
 for(const row of attempts)row.role=row.url===facilitator.url?'facilitator':row.url===peers.url?'peers':relevant.has(row.url)?'catalogue':'other retained attempt';
 const nextAttempts=nextUrl?(byUrl.get(nextUrl)??[]):[];
 const nextAttempt=nextAttempts.at(-1);
 const state=errors.length?'source-needs-repair':terminal?(savedCatalogue.valid?'complete':'complete-awaiting-save'):records.length?'partial':nextAttempts.length?'first-page-failed':'not-started';
 return{schema:SCHEMA,kind:'original-capture-progress',createdAt,directory,plan:p,planSource:{path:'plan.json',bytes:planFile.bytes,sha256:planFile.sha256},
  state,readyForSelection:terminal&&savedCatalogue.valid&&errors.length===0,resumeAllowed:errors.length===0&&!savedCatalogue.present,
  coverage:{complete:terminal,verifiedPages:records.length,retainedRows:c.rows.length,genuineEmptyCatalogue:terminal&&c.rows.length===0,nextOffset:terminal?null:offset,nextUrl,reportedTotals:c.sourceTotals,findings:c.findings,firstObservedAt:c.firstObservedAt,lastObservedAt:c.lastObservedAt,description:c.coverage},
  nextAttempt:nextAttempt?{source:nextAttempt.row.source,status:nextAttempt.record.status,error:nextAttempt.row.pageProblem??nextAttempt.record.error??null}:null,
  capabilities:[facilitator,peers],savedCatalogue,sourcePages:selected,attempts,errors,originalFiles:files.map(({path,bytes,sha256})=>({path,bytes,sha256})),originalBytes:totalBytes};
}

/** One ordinary original receiving packet plus an offline human-readable view. */
export function captureProgressHtml(progress,packetBytes,{sourceName='original-catalogue'}={}){
 const b64=Buffer.from(packetBytes).toString('base64'),packetSha=sha(packetBytes);
 const c=progress.coverage,labels={'source-needs-repair':'Original source needs attention','complete':'Catalogue complete','complete-awaiting-save':'All pages retained; save catalogue','partial':'Catalogue partially received','first-page-failed':'First catalogue page failed','not-started':'Catalogue capture has not started'};
 const sourceArg=progress.directory??'/absolute/path/to/received-catalogue';
 const resume='node '+CLI+' capture --plan '+shell(sourceArg+'/plan.json')+' --directory '+shell(sourceArg);
 const reopen='node '+CLI+' capture-progress-open --file '+shell('/absolute/path/to/original-capture.json')+' --directory '+shell('/absolute/path/to/new-receiving')+' --out '+shell('/absolute/path/to/new-progress.html');
 const inspect='node '+CLI+' capture-progress --directory '+shell(sourceArg)+' --out '+shell('/absolute/path/to/new-progress.html');
 const state=labels[progress.state]??progress.state;
 const rows=progress.attempts.map(a=>'<tr><td>'+esc(a.role)+'</td><td>'+esc(a.method??'unreadable')+'</td><td>'+esc(a.status===null?'transport error':a.status??'invalid')+'</td><td>'+esc(a.bodyBytes??'—')+'</td><td>'+esc(a.retrievedAt??'—')+'</td><td>'+esc(a.selected?'used in current view':'retained')+'</td><td><details><summary>'+esc(a.source)+'</summary><p>'+esc(a.url??'Original request could not be parsed')+'</p><p>'+esc(a.problem??a.pageProblem??a.error??'Original bytes verified')+'</p><p class="mono">'+esc(a.sourceSha256)+'</p></details></td></tr>').join('');
 const caps=progress.capabilities.map(a=>'<tr><td>'+esc(a.name)+'</td><td>'+esc(a.state)+'</td><td>'+esc(a.status??'—')+'</td><td>'+a.attempts+'</td><td>'+esc(a.url)+'</td></tr>').join('');
 const files=progress.originalFiles.map(f=>'<tr><td>'+esc(f.path)+'</td><td>'+f.bytes+'</td><td class="mono">'+esc(f.sha256)+'</td></tr>').join('');
 const errors=progress.errors.length?'<section><h2>Source attention</h2><ul>'+progress.errors.map(e=>'<li><strong>'+esc(e.source)+'</strong>: '+esc(e.message)+'</li>').join('')+'</ul><p>Keep the original files and reconcile these findings before resuming the acquisition.</p></section>':'';
 const totals=c.reportedTotals.length?c.reportedTotals.join(', '):'No accepted page has reported a total';
 const meaning=c.genuineEmptyCatalogue?'The original successful terminal page explicitly reported an empty catalogue.':c.complete?'The original sequential pages reached the provider’s reported end.':c.retainedRows?'These are rows in the retained successful pages. Further pages remain to be received.':'No catalogue row count is available until an original page is successfully received.';
 const safeJson=v=>JSON.stringify(v).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rialto capture progress</title><style>'+
 ':root{font:15px/1.55 system-ui,sans-serif;color:#202020;background:#f5f5f5}body{margin:0}main{max-width:1160px;margin:auto;padding:32px 22px 64px}header,section{background:white;border:1px solid #c8c8c8;padding:22px;margin:0 0 18px}h1{font-size:28px;margin:0 0 8px}h2{font-size:19px;margin:0 0 12px}h3{font-size:16px}p{margin:9px 0}.meta{color:#555}.metrics{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:12px}.metric{border:1px solid #bbb;padding:12px}.metric strong{display:block;font-size:23px}.buttons{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}button{background:#eee;color:#111;border:1px solid #777;padding:9px 13px;font:inherit;cursor:pointer}button:hover{background:#ddd}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #ddd;text-align:left;padding:9px;vertical-align:top}th{background:#eee}td{overflow-wrap:anywhere}pre,.mono{font:12px/1.5 ui-monospace,monospace;overflow-wrap:anywhere}pre{background:#f1f1f1;white-space:pre-wrap;padding:12px;border:1px solid #ddd}input{font:inherit;padding:8px;border:1px solid #aaa;max-width:100%;width:400px}summary{cursor:pointer}details p{max-width:48em}ul{padding-left:22px}#feedback{min-height:1.6em}@media(max-width:650px){main{padding:16px 10px}.metrics{grid-template-columns:repeat(2,1fr)}header,section{padding:15px}}@media print{body{background:white}.buttons,#filter,#feedback{display:none}header,section{break-inside:avoid}main{max-width:none;padding:0}details{display:block}details>*{display:block}.scroll{overflow:visible}td{font-size:10px}}'+
 '</style></head><body><main><header><p class="meta">Rialto · Original acquisition</p><h1>'+esc(state)+'</h1><p>'+esc(meaning)+'</p><p class="meta">Snapshot '+esc(progress.createdAt)+' · '+esc(sourceName)+' · '+progress.originalFiles.length+' complete original files</p><div class="buttons"><button id="packet">Download complete original source</button><button id="summary">Download progress JSON</button><button id="print">Print report</button></div><p id="feedback" role="status"></p></header>'+
 '<section><h2>Coverage</h2><div class="metrics"><div class="metric"><strong>'+c.verifiedPages+'</strong>Accepted pages</div><div class="metric"><strong>'+(c.verifiedPages?c.retainedRows:'Unknown')+'</strong>Rows in accepted pages</div><div class="metric"><strong>'+progress.attempts.length+'</strong>Retained attempts</div><div class="metric"><strong>'+(c.complete?'Complete':'Incomplete')+'</strong>Enumeration</div></div><p>Reported totals, in page order: '+esc(totals)+'.</p><p>'+esc(c.description)+'</p><p>Selection readiness: '+(progress.readyForSelection?'the original completed catalogue is retained and verified.':'complete and retain the original catalogue before selecting a customer request.')+'</p>'+(c.nextUrl?'<p>Next original request: <span class="mono">GET '+esc(c.nextUrl)+'</span></p>':'')+(c.findings.length?'<pre>'+esc(JSON.stringify(c.findings,null,2))+'</pre>':'')+'</section>'+errors+
 '<section><h2>Capability reads</h2><p>These are the retained HTTP outcomes. A received response can be inspected in the complete source; catalogue completion alone does not establish payment or customer-request readiness.</p><div class="scroll"><table><thead><tr><th>Read</th><th>Outcome</th><th>HTTP</th><th>Attempts</th><th>Original URL</th></tr></thead><tbody>'+caps+'</tbody></table></div></section>'+
 '<section><h2>Every retained attempt</h2><label for="filter">Find a source, URL, status or outcome</label><p><input id="filter" type="search" autocomplete="off" placeholder="Filter retained attempts"></p><div class="scroll"><table id="attempts"><thead><tr><th>Source</th><th>Method</th><th>HTTP</th><th>Body bytes</th><th>Observed</th><th>Use</th><th>Original file and detail</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+(rows?'':'<p>No original capture files are present yet.</p>')+'</section>'+
 '<section><h2>Continue the original operation</h2><p>This report performs no network requests. Its download contains all original files, including failed attempts and complete response bodies. Keep the source private.</p><h3>Reopen on another machine</h3><p>Save the complete source as <code>original-capture.json</code>, then use the maintained installed Rialto application:</p><pre>'+esc(reopen)+'</pre><p>The new directory is created once. If an interruption occurs after receiving it, reopen that retained directory with capture-progress instead of receiving over it.</p><h3>Read the current working directory</h3><pre>'+esc(inspect)+'</pre><h3>Resume the original acquisition</h3><p>'+(progress.resumeAllowed?'Use the existing plan and working directory. Successful valid pages are reused; a failed or invalid response is retained and the original capture command can make a fresh attempt.':progress.readyForSelection?'This original catalogue is complete. Use inspect, report, comparison and select on this retained edition. A later catalogue belongs in a separate new edition.':progress.errors.length?'Reconcile the listed source findings first; the original source remains in the package.':'Preserve the current completed catalogue and inspect its recorded source before proceeding.')+'</p><pre>'+esc(resume)+'</pre><p>After receiving on another machine, substitute the new received directory in these commands. Payment selection, authorization and execution remain in the original customer workflow.</p></section>'+
 '<section><h2>Complete source inventory</h2><p>'+progress.originalBytes+' original bytes · receiving packet '+packetBytes.length+' bytes</p><p class="mono">Receiving packet SHA-256: '+esc(packetSha)+'</p><details><summary>Show every original file</summary><div class="scroll"><table><thead><tr><th>Path</th><th>Bytes</th><th>SHA-256</th></tr></thead><tbody>'+files+'</tbody></table></div></details></section></main>'+
 '<script id="progress-data" type="application/json">'+safeJson(progress)+'</script><script id="packet-data" type="application/json">'+safeJson({base64:b64,sha256:packetSha,bytes:packetBytes.length})+'</script>'+
 '<script>(()=>{"use strict";const p=JSON.parse(document.getElementById("progress-data").textContent),source=JSON.parse(document.getElementById("packet-data").textContent),status=document.getElementById("feedback");function save(bytes,type,name){const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);status.textContent="Download prepared: "+name;}document.getElementById("packet").onclick=()=>{const text=atob(source.base64),bytes=Uint8Array.from(text,c=>c.charCodeAt(0));save(bytes,"application/json","original-capture.json");};document.getElementById("summary").onclick=()=>save(JSON.stringify(p,null,2)+"\\n","application/json","capture-progress.json");document.getElementById("print").onclick=()=>window.print();const rows=[...document.querySelectorAll("#attempts tbody tr")];document.getElementById("filter").oninput=e=>{const q=e.target.value.toLocaleLowerCase();for(const row of rows)row.hidden=!row.textContent.toLocaleLowerCase().includes(q);};})();</script></body></html>\n';
}

function outside(root,out){
 out=path.resolve(out);need(out!==root&&!out.startsWith(root+path.sep),'Progress report must be outside the original source directory');return out;
}
export async function inspectCaptureProgress(directory,{out}={}){
 const root=await privateDir(directory),destination=out===undefined?null:outside(root,out);
 return lock(root,async()=>{
  const files=await inventory(root),createdAt=new Date().toISOString();
  const progress=captureProgress(files,{createdAt,directory:root});
  if(destination){
   need(!await exists(destination),'Progress report already exists; use a new report filename');
   const packet={schema:SCHEMA,kind:'complete-private-receiving',sourceDirectoryName:path.basename(root),createdAt,files},raw=json(packet);
   const html=Buffer.from(captureProgressHtml(progress,raw,{sourceName:path.basename(root)}));
   await writeNew(destination,html);
   return{...progress,report:{path:destination,bytes:html.length,sha256:sha(html),sourcePacketBytes:raw.length,sourcePacketSha256:sha(raw)}};
  }
  return progress;
 }
 );
}
export async function receiveCaptureProgress(file,directory,{out}={}){
 need(typeof out==='string'&&out.length,'--out is required for capture-progress-open');
 const root=path.resolve(directory),destination=outside(root,out);
 need(!await exists(destination),'Progress report already exists; use a new report filename');
 // Receiving validates every original member before materializing a new directory.
 // A later report failure preserves that received directory for capture-progress.
 const receipt=await receive(file,root);
 return{receiving:receipt,...await inspectCaptureProgress(root,{out:destination})};
}
