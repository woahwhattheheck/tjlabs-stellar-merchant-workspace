// SPDX-License-Identifier: MIT
// The browser operates the same saved project and original publishing/customer engines.
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty=v=>JSON.stringify(v,null,2);
const uid=()=>crypto.randomUUID();
const short=v=>String(v??'').slice(0,8);
const S={view:'overview',identity:null,status:null,collections:{captures:new Map(),studies:new Map(),reviews:new Map(),reports:new Map(),operations:new Map()},
 offsets:new Set(),capture:null,review:null,report:null,publication:null,study:null,plan:null,context:null,previewOffset:0,pubRun:'',pubReview:'',releasePreparation:'',merchantStage:'',merchant:null,deliveryId:'',busy:false,processed:new Set(),completedExample:null};
const storageKey='openaq-study:'+location.origin;
let token=new URLSearchParams(location.hash.slice(1)).get('token');
if(token){sessionStorage.setItem(storageKey+':token',token);history.replaceState(null,'',location.pathname+location.search);}
token=token??sessionStorage.getItem(storageKey+':token');
function note(message,error=false){const n=$('#notice');n.textContent=message;n.hidden=!message;n.classList.toggle('error',error);}
async function request(path,{body,method=body?'POST':'GET',raw=false}={}){
 if(!token)throw Error('Open the private application URL printed by the original project owner.');
 const response=await fetch(path,{method,headers:{Authorization:'Bearer '+token,...(body&&!raw?{'Content-Type':'application/json'}:{})},body:body?(raw?body:JSON.stringify(body)):undefined,cache:'no-store',redirect:'error'});
 const actual=response.headers.get('x-openaq-instance');
 if(S.identity&&actual!==S.identity.instanceId)throw Error('The project process changed. Reopen its current private application URL before continuing.');
 if(!response.ok){let e;try{e=await response.json();}catch{}throw Object.assign(Error(e?.message??'The request failed with HTTP '+response.status),{code:e?.error,status:response.status,retryAfter:e?.retryAfter});}
 return response;
}
const api=async(path,options)=>{const r=await request(path,options);return r.json();};
const read=(action,input={})=>api('/api/read',{body:{action,input}});
const values=name=>[...S.collections[name].values()];
const complete=()=>values('captures').filter(x=>x.state==='COMPLETE');
const eligibleReviews=id=>values('reviews').filter(x=>x.captureId===id&&x.decision!=='revise');
const deliveryReviews=id=>eligibleReviews(id).filter(x=>x.decision==='accepted'&&x.allowDerivedDelivery);
function pending(){try{return JSON.parse(sessionStorage.getItem(storageKey+':requests')??'{}');}catch{return{};}}
function keepRequest(id,value){const p=pending();p[id]=value;sessionStorage.setItem(storageKey+':requests',pretty(p));}
function resolveRequest(id){const p=pending();delete p[id];sessionStorage.setItem(storageKey+':requests',pretty(p));}
async function guarded(fn){if(S.busy)return;S.busy=true;$$('button[data-mutate]').forEach(x=>x.disabled=true);try{return await fn();}catch(e){note((e.code?e.code+': ':'')+e.message+(e.retryAfter?' Retry after '+e.retryAfter+' seconds.':''),true);}finally{S.busy=false;$$('button[data-mutate]').forEach(x=>x.disabled=false);}}
async function mutate(action,input,{requestId=uid()}={}){
 const original={action,input:{...input,workspaceId:S.identity.workspaceId,requestId}};
 keepRequest(requestId,original);
 let op;try{op=await api('/api/action',{body:original});}catch(e){note('Request '+requestId+' remains saved in this browser. Operations can inspect it and resend the same reviewed input after a lost response.',true);throw e;}
 observe(op);await refresh(false);note(action+' · '+op.state+' · '+requestId);return op;
}
function observe(op){
 S.collections.operations.set(op.id,op);
 if(op.state!=='COMPLETE')return;
 resolveRequest(op.id);
 if(S.processed.has(op.id))return;S.processed.add(op.id);
 const r=op.result;
 if(op.action==='capture'&&r){S.capture=r;S.plan=r.plan;S.context=r.context;}
 if(op.action==='review'&&r){S.review=r;S.collections.reviews.set(r.id,r);}
 if(op.action==='report'&&r){S.report=r;S.collections.reports.set(r.id,r);}
 if(op.action==='study.save'&&r){S.study=r;S.collections.studies.set(r.id,r);}
 if(op.action==='publication.prepare'){S.pubRun=r?.publication?.id??op.id;if($('#pub-run'))$('#pub-run').value=S.pubRun;if($('#customer-run'))$('#customer-run').value=S.pubRun;}
 if(op.action==='publication.review'){S.pubReview=r?.data?.review?.id??r?.review?.id??'';if($('#pub-review'))$('#pub-review').value=S.pubReview;}
 if(op.action==='release.prepare'){S.releasePreparation=op.id;if($('#release-preparation'))$('#release-preparation').value=op.id;}
 if(op.action==='release.stage'){S.merchantStage=op.id;S.merchant=null;renderMerchantPanel();}
 if(op.action==='customer.start'&&r){const native=r.operation;if(native?.state==='COMPLETE'&&native.result?.id)S.deliveryId=native.result.id;}
}
async function refresh(render=true,offset=0){
 const page=await api('/api/status?limit=30&offset='+offset);S.status=page;S.offsets.add(offset);
 for(const name of Object.keys(S.collections))for(const item of page[name].items)S.collections[name].set(item.id,item);
 $('#project-label').textContent=page.project.name+' · '+page.project.customer;
 $('#workspace-identity').textContent='Project '+page.id;
 $('#connection-state').textContent='Connected';
 paintActive();
 for(const id of Object.keys(pending())){
  try{const op=await read('operation',{id});observe(op);}catch(e){if(e.status!==404)throw e;}
 }
 if(render)renderView();
}
function paintActive(){
 const a=S.status?.active,el=$('#active-operation');el.hidden=!a;if(!a)return;
 el.innerHTML='<div class="split"><div><strong>'+esc(a.action)+' · '+esc(a.state)+'</strong><p class="overflow-id">'+esc(a.id)+'</p><p>'+esc(a.progress?JSON.stringify(a.progress):'The original saved operation is running.')+'</p></div><div class="actions small"><button data-open-operation="'+esc(a.id)+'">Inspect</button>'+(['capture','export'].includes(a.action)?'<button data-pause="'+esc(a.id)+'">Pause</button>':'')+'</div></div>';
}
function show(view){S.view=view;$$('nav button').forEach(x=>{if(x.dataset.view===view)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current');});renderView();window.scrollTo({top:0,behavior:'instant'});}
function field(name,label,value='',type='text',hint=''){return'<div class="field"><label for="'+esc(name)+'">'+esc(label)+'</label><input id="'+esc(name)+'" name="'+esc(name)+'" type="'+type+'" value="'+esc(value)+'">'+(hint?'<small>'+esc(hint)+'</small>':'')+'</div>';}
function area(name,label,value='',hint='',code=false){return'<div class="field full"><label for="'+esc(name)+'">'+esc(label)+'</label><textarea id="'+esc(name)+'" name="'+esc(name)+'"'+(code?' class="code" spellcheck="false"':'')+'>'+esc(value)+'</textarea>'+(hint?'<small>'+esc(hint)+'</small>':'')+'</div>';}
function select(name,label,options,value=''){return'<div class="field"><label for="'+esc(name)+'">'+esc(label)+'</label><select id="'+esc(name)+'" name="'+esc(name)+'">'+options.map(x=>'<option value="'+esc(x[0])+'"'+(String(x[0])===String(value)?' selected':'')+'>'+esc(x[1])+'</option>').join('')+'</select></div>';}
function check(name,label,checked=false){return'<label class="check"><input type="checkbox" id="'+esc(name)+'"'+(checked?' checked':'')+'><span>'+esc(label)+'</span></label>';}
const get=id=>$('#'+id)?.value?.trim()??'';
const json=id=>{try{return JSON.parse(get(id));}catch{throw Error('Enter valid JSON in '+($('#'+id)?.labels?.[0]?.textContent??id)+'.');}};
function objectDetails(value,label='Full retained record'){return'<details><summary>'+esc(label)+'</summary><pre>'+esc(pretty(value))+'</pre></details>';}
function table(head,rows,empty='No retained records yet.'){return rows.length?'<div class="table"><table><thead><tr>'+head.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'<div class="empty">'+esc(empty)+'</div>';}
const tag=state=>'<span class="tag'+(['COMPLETE','PUBLISHED','accepted'].includes(state)?' strong':'')+'">'+esc(state??'—')+'</span>';
const button=(label,attrs='',primary=false)=>'<button '+attrs+(primary?' class="primary"':'')+'>'+esc(label)+'</button>';
function captureList(){return table(['Capture / source','Location / rows','State','Action'],values('captures').map(c=>[
 '<strong>'+esc(c.label)+'</strong><div class="overflow-id">'+esc(c.id)+'</div><span class="muted">'+esc(c.mode)+'</span>',
 esc(c.locationId)+' / '+esc(c.rows??'pending'),tag(c.state),
 button('Inspect','data-capture="'+esc(c.id)+'"')+' '+button('Review','data-review-capture="'+esc(c.id)+'"')
 ]));}
function captureOptions(){return [['','Choose a completed capture'],...complete().map(c=>[c.id,c.label+' · '+short(c.id)])];}
function pairFields(){return'<div class="grid">'+select('pub-capture','Completed capture',captureOptions(),S.capture?.id)+select('pub-source-review','Accepted source review',[['','Choose a source review'],...deliveryReviews(S.capture?.id).map(r=>[r.id,r.reviewer+' · '+short(r.id)])],S.review?.id)+'</div><p class="hint">The source review must accept this exact capture and its derived delivery. Original publisher reviews remain a separate named decision.</p>';}
function pairsSelector(id,deliver=false){
 const captures=complete();return'<div id="'+id+'" class="selection-list">'+captures.map(c=>{
 const rs=deliver?deliveryReviews(c.id):eligibleReviews(c.id);return'<div class="selection-row"><input type="checkbox" aria-label="Include '+esc(c.label)+'" data-pair-capture="'+esc(c.id)+'"'+(!rs.length?' disabled':'')+'><div><strong>'+esc(c.label)+'</strong><div class="overflow-id">'+esc(c.id)+'</div><small>'+esc(c.locationId)+' · '+esc(c.rows)+' rows</small></div><select aria-label="Source review for '+esc(c.label)+'" data-pair-review="'+esc(c.id)+'">'+rs.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.reviewer+' · '+r.decision+' · '+short(r.id))+'</option>').join('')+'</select></div>';
 }).join('')+'</div>'+(captures.length?'':'<div class="empty">Complete and review a capture first.</div>');
}
function selectedPairs(id){const captureIds=[],reviewIds=[];for(const box of $$('input[data-pair-capture]:checked',$('#'+id))){captureIds.push(box.dataset.pairCapture);reviewIds.push($('select[data-pair-review="'+box.dataset.pairCapture+'"]',$('#'+id)).value);}if(!captureIds.length)throw Error('Choose at least one reviewed capture.');return{captureIds,reviewIds};}

const EXAMPLE_ROOT='/examples/completed-del-norte/';
async function completedExample(){
 if(S.completedExample)return S.completedExample;
 const e=await api(EXAMPLE_ROOT+'manifest.json'),hash=/^[a-f0-9]{64}$/;
 if(e.schema!=='stellar-forge.openaq-completed-example.v1'||e.id!=='del-norte-20220503'||
  e.archive?.file!=='study.tgz'||e.report?.html?.file!=='report.html'||e.report?.json?.file!=='report.json'||
  !hash.test(e.archive.sha256)||!hash.test(e.capture?.sha256)||!hash.test(e.report?.sha256)||
  !hash.test(e.report.html.sha256)||!hash.test(e.report.json.sha256)||
  ![e.archive.bytes,e.report.html.bytes,e.report.json.bytes].every(n=>Number.isSafeInteger(n)&&n>0&&n<=2*1024*1024))
  throw Error('The installed completed-study declaration is incomplete or changed.');
 S.completedExample=e;return e;
}
async function completedExampleRequestId(e){
 // UUIDv5: the original project is the namespace; the exact bundled archive is the name.
 // The same receiving intent survives browser storage loss and application restart.
 const namespace=S.identity.workspaceId.replaceAll('-',''),name=new TextEncoder().encode('openaq-completed-example:'+e.id+':'+e.archive.sha256);
 if(!/^[a-f0-9]{32}$/.test(namespace))throw Error('The current original project identity is invalid.');
 const data=new Uint8Array(16+name.length);for(let i=0;i<16;i++)data[i]=parseInt(namespace.slice(i*2,i*2+2),16);data.set(name,16);
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-1',data));hash[6]=(hash[6]&15)|80;hash[8]=(hash[8]&63)|128;
 const hex=[...hash.slice(0,16)].map(n=>n.toString(16).padStart(2,'0')).join('');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}
async function completedExampleBytes(kind){
 const e=await completedExample(),file=kind==='archive'?e.archive:kind==='html'?e.report.html:kind==='json'?e.report.json:null;
 if(!file)throw Error('Choose an existing completed-study file.');
 const response=await request(EXAMPLE_ROOT+file.file);
 if(response.headers.has('content-length')&&Number(response.headers.get('content-length'))!==file.bytes)throw Error('The installed completed-study file has changed.');
 const data=await response.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(data.byteLength!==file.bytes||hash!==file.sha256)throw Error('The installed completed-study bytes differ from their original saved edition.');
 return {file,data,sha256:hash};
}
async function downloadCompletedExample(kind){
 const {file,data}=await completedExampleBytes(kind),name=kind==='archive'?'OpenAQ_Del_Norte_20220503_Study.tgz':kind==='html'?'OpenAQ_Del_Norte_20220503_Report.html':'OpenAQ_Del_Norte_20220503_Report.json';
 const blob=new Blob([data],{type:kind==='archive'?'application/gzip':kind==='html'?'text/html; charset=utf-8':'application/json; charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 note('Downloaded the original completed '+(kind==='archive'?'customer study':'report')+' · '+file.bytes+' bytes.');
}
function completedExampleCard(){
 const e=S.completedExample;if(!e)return'';
 const received=S.collections.captures.has(e.capture.id)&&S.collections.reviews.has(e.review.id)&&S.collections.reports.has(e.report.id);
 return'<section class="panel"><h2>A complete worked study</h2><p><strong>'+esc(e.title)+'</strong> · '+esc(e.capture.rows)+' original observations across '+esc(e.capture.series.length)+' sensor series.</p>'+
 '<p>Inspect the actual source review and report, or receive the complete study into this project. Receiving uses the bundled original delivery and makes no provider request. Your existing project records remain available.</p>'+
 '<div class="actions">'+button(received?'Open the received study':'Receive the completed study','data-completed-example="receive" data-mutate',true)+button('Download report','data-completed-example="html"')+button('Download customer package','data-completed-example="archive"')+'</div>'+
 '<p class="hint">The May 3, 2022 archive is a retained historical source. Sensor units, period-ending dates and unknown flag/coverage information remain distinct. The original engineering review accompanies the data; an actual client conclusion has its own named review.</p></section>';
}
async function openCompletedExample(e){
 const [capture,review,report]=await Promise.all([read('capture',{id:e.capture.id}),read('review',{id:e.review.id}),read('report',{id:e.report.id})]);
 if(capture.id!==e.capture.id||capture.captureSha256!==e.capture.sha256||review.id!==e.review.id||
  review.captureId!==capture.id||review.captureSha256!==capture.captureSha256||
  report.id!==e.report.id||report.reportSha256!==e.report.sha256||
  !report.sources.some(s=>s.id===capture.id&&s.captureSha256===capture.captureSha256&&s.review?.id===review.id))
  throw Error('The received study does not match the original completed capture, review and report.');
 S.capture=capture;S.review=review;S.report=report;S.context=capture.context;S.plan=capture.plan;
 await refresh(false);show('review');note('Opened the same completed source, named review and report. Reports and Delivery retain the original files.');
}
async function receiveCompletedExample(){
 const e=await completedExample(),requestId=await completedExampleRequestId(e);let existing=null;
 try{existing=await read('operation',{id:requestId});}catch(error){if(error.status!==404)throw error;}
 if(existing){
  if(existing.action!=='receive')throw Error('This original request ID is already bound to another action.');
  // The original start API checks the complete retained input and returns an existing
  // operation without launching it. Bind the exact upload before observing or resuming.
  existing=await api('/api/action',{body:{action:'receive',input:{workspaceId:S.identity.workspaceId,requestId,uploadId:requestId,sha256:e.archive.sha256}}});
  observe(existing);
  if(existing.state==='COMPLETE')return openCompletedExample(e);
  if(existing.state==='RUNNING'){await refresh(false);show('history');note('The original completed-study receiving is still running: '+requestId);return;}
 }else{
  try{return await openCompletedExample(e);}catch(error){if(error.status!==404)throw error;}
 }
 const {data}=await completedExampleBytes('archive');
 await api('/api/upload?'+new URLSearchParams({id:requestId,sha256:e.archive.sha256}),{method:'POST',body:new Blob([data],{type:'application/gzip'}),raw:true});
 let op;
 if(existing){op=await api('/api/resume',{body:{workspaceId:S.identity.workspaceId,requestId}});observe(op);await refresh(false);}
 else op=await mutate('receive',{uploadId:requestId,sha256:e.archive.sha256},{requestId});
 if(op.state==='COMPLETE')return openCompletedExample(e);
 show('history');note('Receiving the original completed study. This same request is retained for continuation: '+requestId);
}

function overview(){
 return'<section class="panel"><h2>'+esc(S.status.project.name)+'</h2><p>'+esc(S.status.project.purpose)+'</p><dl><dt>Customer / team</dt><dd>'+esc(S.status.project.customer)+'</dd><dt>Configuration</dt><dd class="overflow-id">'+esc(S.status.configurationSha256)+'</dd><dt>Source access</dt><dd>'+esc(S.status.account?'Public archive and host-configured OpenAQ API account '+S.status.account.account:'Public OpenAQ AWS archive; no API account selected')+'</dd><dt>Customer workspace</dt><dd>'+esc(S.status.customer?S.status.customer.name+' · '+S.status.customer.workspaceId:'A DuckDB customer workspace is not selected in this project declaration.')+'</dd></dl>'+
 '<div class="actions">'+button('Capture a study','data-go="capture"',true)+button('Review retained sources','data-go="review"')+button('Receive a complete project','data-go="delivery"')+'</div></section>'+
 '<div class="metrics">'+[['Captures',S.status.captures.total],['Source reviews',S.status.reviews.total],['Reports',S.status.reports.total],['Saved studies',S.status.studies.total]].map(([l,v])=>'<div><div class="metric">'+esc(v)+'</div>'+esc(l)+'</div>').join('')+'</div>'+
 completedExampleCard()+
 '<section class="panel"><h2>Saved monitoring studies</h2>'+table(['Study / edition','Purpose','Action'],values('studies').map(s=>['<strong>'+esc(s.name)+'</strong><div>Edition '+esc(s.version)+' · '+esc(short(s.id))+'</div>',esc(s.purpose),button('Reopen plan','data-study="'+esc(s.id)+'"')]))+'</section>'+
 '<section class="panel"><div class="split"><h2>Retained captures</h2>'+button('Load older records','data-older')+'</div>'+captureList()+'</section>'+
 '<section class="panel"><h2>How this project keeps observations interpretable</h2><p>'+esc(S.status.semantics.numeric)+'</p><p>'+esc(S.status.semantics.archive)+'</p><p>'+esc(S.status.semantics.coverage)+'</p></section>';
}
function captureView(){
 const p=S.plan??{mode:'archive',label:'',purpose:S.status.project.purpose,locationId:'',sensorIds:[],dates:[],maxRows:250000};
 return'<section class="panel"><h2>Capture a source edition</h2><p class="hint">Choose a station and period for a named project. Completed captures reopen their retained bytes. A new capture ID deliberately records a new source edition; archive URLs may be patched upstream.</p>'+
 '<form id="capture-builder"><div class="grid">'+select('mode','Source route',[['archive','Public AWS local-day archive'],['api','Host-configured OpenAQ v3 API']],p.mode)+field('location','OpenAQ location ID',p.locationId,'number')+
 field('capture-label','Study label',p.label)+field('sensors','Sensor IDs',p.sensorIds.join(', '),'text','Comma-separated IDs. Empty selects every sensor in an archive object; the API requires explicit IDs.')+
 area('purpose','Study purpose',p.purpose)+area('dates','Archive local days',(p.dates??[]).join('\n'),'One YYYY-MM-DD local-location day per line, up to 31. Keep the file day separate from period-end dates.')+
 select('resolution','API observation series',[['measurements','Original reported measurements'],['hours','OpenAQ hourly averages'],['days','OpenAQ daily averages']],p.resolution??'measurements')+
 field('from','API period from',p.datetimeFrom??'','text','ISO datetime with Z or an explicit offset.')+field('to','API period to',p.datetimeTo??'','text','ISO datetime with Z or an explicit offset.')+
 field('max-rows','Maximum complete rows',p.maxRows??250000,'number')+field('page-size','API page size',p.pageSize??1000,'number')+field('max-pages','API maximum pages',p.maxPages??300,'number')+'</div>'+
 '<div class="actions">'+button('Update reviewed plan JSON','type="submit"')+button('Use official archive example','type="button" id="example-plan"')+'</div></form>'+
 '<div class="grid">'+area('plan-json','Reviewed capture plan',pretty(p),'The saved JSON is the exact plan used by capture and saved-study actions.',true)+
 area('context-json','Archive metadata and provenance',pretty(S.context??{}),'Required for the archive. Keep documentation examples explicitly labeled; a CSV alone does not establish licensing or averaging intervals.',true)+'</div>'+
 '<div class="actions">'+button('Capture this reviewed plan','id="capture-submit" data-mutate',true)+button('Load documentation context','id="example-context"')+'</div>'+
 '<details><summary>Save or revise a monitoring study</summary><p class="hint">A study stores a future capture plan. Revisions preserve earlier captures and require the currently reviewed study revision.</p><div class="grid">'+field('study-id','Study ID',S.study?.id??uid())+field('study-name','Study name',S.study?.name??p.label)+field('study-revision','Expected current revision',S.study?.revision??'','text','Leave empty for a new study.')+'</div><div class="actions">'+button('Save reviewed study plan','id="study-save" data-mutate')+button('Start a separate new study','id="study-new"')+'</div></details></section>'+
 '<section class="panel"><h2>Retained captures</h2>'+captureList()+'</section>';
}
function reviewView(){
 const c=S.capture,r=S.review?.captureId===c?.id?S.review:null;
 return'<section class="panel"><h2>Review source and delivery rights</h2><div class="grid">'+select('review-capture','Completed capture',captureOptions(),c?.id)+field('capture-direct','Or open an exact capture ID','','text','Exact IDs work across the full history.')+'</div><div class="actions">'+button('Open selected capture','id="review-open"')+'</div>'+
 (c?'<div class="callout"><strong>'+esc(c.plan.label)+'</strong><p>'+esc(c.projection.rows)+' rows · '+esc(c.plan.locationId)+' · '+esc(c.context.location.timezone)+' · '+esc(c.context.kind)+'</p><p>'+esc(c.context.note??'Original API metadata accompanies the measurement pages.')+'</p><span class="overflow-id">'+esc(c.captureSha256)+'</span></div>'+objectDetails(c,'Inspect complete capture, licenses, raw responses and source headers')+
 '<div class="actions">'+button('Preview observations','id="capture-preview"')+button('Download exact projected CSV','data-file-kind="capture" data-file-id="'+esc(c.id)+'" data-file-name="measurements.csv"')+button('Reopen original plan','data-capture-plan="'+esc(c.id)+'"')+'</div>'+
 '<form id="source-review"><div class="grid">'+field('reviewer','Named reviewer',r?.reviewer??'')+
 select('decision','Review decision',[['accepted','Accepted for stated project use'],['context_only','Context only'],['revise','Revision required']],r?.decision??'context_only')+
 area('review-note','Source, interval and quality review',r?.note??'')+area('attribution','OpenAQ and original-provider attribution',r?.attribution??'')+
 area('rights-basis','Applicable rights and period basis',r?.rightsBasis??'','State the original license/permission, the covered period and intended customer use.')+
 area('rights-sources','Rights source URLs',(r?.rightsSources??c.context.sources.map(x=>x.url)).join('\n'),'One verified HTTPS source per line. Retain original provider terms where applicable.')+
 '<div class="full">'+check('allow-delivery','This accepted review authorizes the described derived dataset and complete source delivery.',r?.allowDerivedDelivery??false)+'</div></div><div class="actions">'+button('Save named source review','type="submit" data-mutate',true)+'</div></form>':'<div class="empty">Open a completed capture to see its actual metadata and source bodies.</div>')+'</section>'+
 '<section class="panel"><h2>Review history</h2>'+table(['Capture / reviewer','Decision','Delivery','Action'],values('reviews').map(r=>[esc(short(r.captureId))+' / '+esc(r.reviewer),tag(r.decision),esc(r.allowDerivedDelivery?'Reviewed derived delivery':'Internal/context review'),button('Inspect','data-review="'+esc(r.id)+'"')]))+'</section>';
}
function reportsView(){
 return'<section class="panel"><h2>Compare retained station and period series</h2><p class="hint">Select exact capture/review pairs. Units, sensor identities, reported intervals and capture editions remain separate. Every source row stays in the delivery, including missing, flagged and negative observations.</p>'+
 pairsSelector('report-pairs')+'<form id="report-form"><div class="grid">'+field('report-title','Report title')+field('report-reviewer','Named report reviewer')+area('report-purpose','Customer question / purpose',S.status.project.purpose)+area('report-note','Method and interpretation','Compare each retained sensor, parameter, unit and source period separately. The archive does not supply a per-observation averaging interval or source flags. Counts describe retained rows, not a completeness certification.')+
 '<div class="full">'+check('mean','Include the exact unweighted arithmetic mean expression for each separate series.')+check('exclude-flags','Exclude explicitly source-flagged observations from numeric summaries; retain the original rows.')+'</div></div><div class="actions">'+button('Build and retain report','type="submit" data-mutate',true)+'</div></form></section>'+
 '<section class="panel"><h2>Retained reports</h2>'+table(['Report / original ID','Sources','Actions'],values('reports').map(r=>['<strong>'+esc(r.title)+'</strong><div class="overflow-id">'+esc(r.id)+'</div>',esc(Array.isArray(r.sources)?r.sources.length:r.sources),button('Review report','data-report="'+esc(r.id)+'"')+' '+button('Download report','data-file-kind="report" data-file-id="'+esc(r.id)+'" data-file-name="report.html"')]))+'</section>';
}
function publishView(){
 return'<section class="panel"><h2>Publish the reviewed original dataset</h2>'+pairFields()+
 '<div class="actions">'+button('Prepare complete candidate','id="publication-prepare" data-mutate',true)+button('Read original publisher','id="publication-status"')+'</div>'+
 '<div class="grid">'+field('pub-run','Original extraction run ID',S.pubRun)+field('pub-review','Original publisher review ID',S.pubReview)+field('pub-reviewer','Publisher reviewer')+field('pub-note','Publication decision note')+
 field('expected-snapshot','Expected current snapshot','','text','Required for an existing dataset. Use the current original publisher status.')+field('expected-revision','Expected current revision','','number')+'</div>'+
 check('initialize','Initialize a new dataset at this original publication directory.')+
 '<div class="actions">'+button('Inspect complete candidate','id="publication-inspect"')+button('Record original publisher review','id="publication-review" data-mutate')+button('Publish reviewed candidate','id="publication-publish" data-mutate',true)+button('Recover original publication','id="publication-recover" data-mutate')+'</div><div id="publication-result">'+(S.publication?objectDetails(S.publication,'Current original publisher result'):'')+'</div></section>'+
 '<section class="panel"><h2>Prepare a merchant release</h2><p class="hint">The original SF82 release package retains this published dataset, complete source capture and reviewed payment terms. The original Merchant Releases console below operates this project’s retained release store.</p>'+
 '<div class="grid">'+field('release-origin','Public merchant origin','','url')+field('release-path','Dataset route','/data')+area('payment-json','Reviewed native payment declaration','{}','Supply the real scheme, network, asset, payee and amount from the existing seller setup; these fields are never invented.',true)+'</div>'+
 '<div class="actions">'+button('Prepare original SF82 package','id="release-prepare" data-mutate')+'</div><div class="grid">'+field('release-preparation','Saved preparation operation',S.releasePreparation)+field('release-id','Release name')+field('release-label','Operator release label')+area('runtime-json','Reviewed release runtime',pretty({port:0}),'The original release store validates port/facilitator settings.',true)+'</div>'+
 '<div class="actions">'+button('Stage exact release','id="release-stage" data-mutate')+'</div><p class="hint">A prepared package stays outside the publisher source directory. Staging retains the exact dataset and payment declaration; open its original merchant console below to operate the release.</p></section>'+
 '<div id="merchant-panel">'+merchantPanel()+'</div>';
}
function merchantPanel(){
 const m=S.merchant,chosen=m?.selection,release=chosen?.release,state=m?.status?.state,runtime=m?.status?.runtime;
 const stages=values('operations').filter(x=>x.action==='release.stage'&&x.state==='COMPLETE')
  .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 const summary=m?table(['Original merchant state','Current value'],[
  ['Release store',m.available?esc(m.releaseDirectory):'Prepare and stage a reviewed dataset first.'],
  ['Selected study release',release?esc(release.label+' · '+release.id):'Choose a completed staging request.'],
  ['Selected release mode',release?tag(release.mode):'—'],
  ['Active / previous release',esc((state?.active??'none')+' / '+(state?.previous??'none'))],
  ['Store generation',esc(state?.generation??'—')],
  ['Original seller',tag(runtime?.state??'STOPPED')+(runtime?.message?'<div>'+esc(runtime.message)+'</div>':'')],
  ['Project console',tag(m.state)+(m.consoleId?'<div class="overflow-id">'+esc(m.consoleId)+'</div>':'')],
  ['Original source capture',esc(chosen?.captureId??'—')],
  ['Named source review',esc(chosen?.sourceReviewId??'—')],
  ['Published extraction',esc(chosen?.publicationRunId??'—')],
 ]):'<p class="empty">Select a completed staging request to inspect its original release and source binding.</p>';
 const live=m?.operatorUrl&&m.state==='OPEN';
 return'<section class="panel"><h2>Operate this study’s merchant</h2>'+
 '<p>Open the original Merchant Releases console for this project. Review the selected release there, activate it, run the supervised seller, receive a customer account, and create the original client or delivery handoff.</p>'+
 '<div class="grid">'+select('merchant-known-stage','Loaded completed staging requests',[['','Choose a request'],...stages.map(x=>[x.id,(x.result?.id??'Staged release')+' · '+short(x.id)])],S.merchantStage)+
 field('merchant-stage','Original staging request ID',S.merchantStage,'text','Any retained completed stage can be reopened by its full UUID, including older operations outside the current list.')+'</div>'+
 '<div class="actions">'+button('Inspect original release','id="merchant-inspect"')+button('Refresh merchant status','id="merchant-status"')+
 button(live?'Reopen merchant console':'Open merchant console','id="merchant-open" data-mutate',true)+
 (m?.consoleId?button('Close owned merchant and console','id="merchant-close" data-mutate'):'')+'</div>'+
 '<div id="merchant-state">'+summary+'</div>'+
 (live?'<div class="callout"><p>This project owns the original release console and its seller lifetime. Closing the project also closes the console and drains its owned merchant and receiving work.</p><a class="button" target="_blank" rel="noreferrer noopener" href="'+esc(m.operatorUrl)+'">Open original merchant operations</a></div>':'')+
 (release?objectDetails({release,preparationRequestId:chosen.preparationRequestId,stageRequestId:chosen.stageRequestId},'Retained release, dataset, routes and source identity'):'')+
 '<details><summary>Complete the merchant and customer handoff</summary><ol>'+
 '<li>Compare the selected release with the active release. Confirm its origin, complete scheme/network/asset/payee/amount and dataset snapshot.</li>'+
 '<li>Use the console’s reviewed activation and Run actions. The seller status identifies challenge-only or native x402 mode; a started console alone is not a running seller.</li>'+
 '<li>Use the original account receiving, client export and delivery controls. A real paid acquisition uses that original native offer and the customer’s reviewed account and spend approval.</li>'+
 '<li>Read the actual original result, payment and retained file before sharing a delivery. An OpenAQ study export retains its observations, source attribution and reviews; a merchant deployment and customer account keep their own original identities.</li>'+
 '<li>Use Stop or close the owned console when finished. Reopening this project retains the stage and release history; explicitly open a fresh console for another operating session.</li>'+
 '</ol><p>The preparation and open actions do not issue provider requests or payments. The original release engine performs activation, rollback, supervision and account operations. The private console link is a live local capability, not a public delivery link.</p></details></section>';
}
function renderMerchantPanel(){const panel=$('#merchant-panel');if(panel){panel.innerHTML=merchantPanel();bindMerchantPanel();}}
function merchantInput(required=false){
 const stageRequestId=get('merchant-stage');S.merchantStage=stageRequestId;
 if(required&&!stageRequestId)throw Error('Choose the completed original staging request.');
 return stageRequestId?{stageRequestId}:{};
}
function acceptMerchant(value){
 const previous=S.merchant;
 if(value.operatorUrl){
  const url=new URL(value.operatorUrl);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!Number(url.port)||url.username||url.password||url.search||url.pathname!=='/'||!/^#[a-f0-9]{64}$/.test(url.hash))
   throw Error('The original merchant console returned an unexpected private origin.');
 }else if(previous?.operatorUrl&&previous.consoleId===value.consoleId&&value.state==='OPEN'){
  value={...value,operatorUrl:previous.operatorUrl};
 }
 S.merchant=value;renderMerchantPanel();
}
function bindMerchantPanel(){
 const change=()=>{S.merchantStage=get('merchant-stage');S.merchant=null;renderMerchantPanel();};
 $('#merchant-stage')?.addEventListener('change',change);
 $('#merchant-known-stage')?.addEventListener('change',()=>{S.merchantStage=get('merchant-known-stage');S.merchant=null;renderMerchantPanel();});
 $('#merchant-inspect')?.addEventListener('click',()=>guarded(async()=>{
  const input=merchantInput(true);S.merchant=null;acceptMerchant(await read('merchant.release',input));
  note('The exact original release, dataset and preparation are selected.');
 }));
 $('#merchant-status')?.addEventListener('click',()=>guarded(async()=>{
  const input=merchantInput();acceptMerchant(await read('merchant.status',input));
  note('Current original merchant and release-store status loaded.');
 }));
 $('#merchant-open')?.addEventListener('click',()=>guarded(async()=>{
  const input=merchantInput(true);acceptMerchant(await read('merchant.open',input));
  note('The original merchant console is ready. Open its private link to operate the reviewed release.');
 }));
 $('#merchant-close')?.addEventListener('click',()=>guarded(async()=>{
  const consoleId=S.merchant?.consoleId;if(!consoleId)throw Error('Refresh the current owned console identity.');
  const result=await read('merchant.close',{consoleId});S.merchant=result;renderMerchantPanel();
  acceptMerchant(await read('merchant.status',merchantInput()));
  note('The original owned merchant and console are closed; retained release and study history remain available.');
 }));
}

function customerView(){
 return'<section class="panel"><h2>Receive the dataset in the original customer workspace</h2>'+pairFields()+
 '<p class="hint">This project delegates reviewed local delivery, dataset import, SQL analysis and collection/report exports to the existing DuckDB customer workspace selected by the host. Its ownership and source edition remain independent.</p>'+
 '<div class="actions">'+button('Open full original customer workflow','id="customer-browser"',true)+button('Read customer delivery status','id="customer-status"')+'</div>'+
 '<details open><summary>Prepare the exact local delivery</summary><div class="grid">'+field('customer-run','Published extraction run ID',S.pubRun)+field('customer-review','Original publisher review ID',S.pubReview)+field('candidate-digest','Candidate digest')+field('customer-reviewer','Customer delivery reviewer')+field('customer-note','Reviewed delivery purpose')+field('customer-query','Original dataset query','limit=100','text','Inspect the publisher contract. The original receiver follows all pages for the selected query.')+'</div>'+
 '<div class="actions">'+button('Prepare native customer delivery','id="customer-prepare" data-mutate')+'</div></details>'+
 '<details><summary>Continue or operate a retained delivery</summary><div class="grid">'+field('delivery-id','Original delivery ID',S.deliveryId)+select('customer-kind','Original action',[['continue','Continue all pages'],['customer','Customer operation'],['package','Complete customer package']],'continue')+
 field('customer-operation','Customer operation name','','text','Use the original customer screen for assisted analysis and report forms.')+area('customer-arguments','Original action arguments','{}','These are the existing receiver/customer arguments. The project adds only its saved request and source binding.',true)+'</div><div class="actions">'+button('Run original customer action','id="customer-action" data-mutate')+'</div></details>'+
 '<details><summary>Read or resume an original customer request</summary><div class="grid">'+field('native-request','Original customer operation ID')+'</div><div class="actions">'+button('Read original operation','id="customer-operation-read"')+button('Resume same original operation','id="customer-resume" data-mutate')+'</div></details><div id="customer-result"></div></section>';
}
function deliveryView(){
 return completedExampleCard()+'<section class="panel"><h2>Deliver a complete reviewed project</h2><p class="hint">Select accepted capture/review pairs and compatible reports. The package includes original gzip/API responses, acquisition receipts, every projected observation, rights reviews and source-bound reports, using the original Frictionless source transport.</p>'+pairsSelector('delivery-pairs',true)+
 '<h3>Reports to include</h3>'+values('reports').map(r=>'<label class="check"><input type="checkbox" data-report-select="'+esc(r.id)+'"><span>'+esc(r.title)+' · '+esc(short(r.id))+'</span></label>').join('')+
 '<div class="actions">'+button('Create complete project package','id="project-export" data-mutate',true)+'</div>'+
 '<h3>Saved exports</h3>'+table(['Export ID','State','Actions'],values('operations').filter(o=>o.action==='export').map(o=>['<span class="overflow-id">'+esc(o.id)+'</span>',tag(o.state),button('Inspect / download','data-open-operation="'+esc(o.id)+'"')]))+
 '<p class="hint">The installed CLI download command resumes large transfers in the same output directory and verifies the original manifest and archive hash. Browser download is convenient for a complete local transfer.</p></section>'+
 '<section class="panel"><h2>Receive into this project</h2><p class="hint">Initialize and open a separate project to receive a delivery. Existing capture IDs and exact source bytes are preserved. A changed file under an existing ID is refused; receiving and reopening perform no provider request or payment.</p>'+
 '<div class="grid"><div class="field"><label for="delivery-file">Complete OpenAQ project archive (.tgz)</label><input class="file-input" type="file" id="delivery-file" accept=".tgz,.tar.gz,application/gzip"></div>'+field('delivery-sha','Expected original SHA-256','','text','Obtain this exact digest from the sender’s retained export result.')+'</div>'+
 '<div class="actions">'+button('Verify upload and receive original project','id="project-receive" data-mutate',true)+'</div></section>';
}
function historyView(){
 return'<section class="panel"><div class="split"><div><h2>Original saved operations</h2><p class="hint">An operation’s request ID binds its complete reviewed input. Reopen before repeating an interrupted action. A completed wrapper result can contain an interrupted original customer operation; inspect its nested state.</p></div>'+button('Load older records','data-older')+'</div>'+
 '<div class="grid">'+field('operation-direct','Open exact operation ID')+'</div><div class="actions">'+button('Inspect original request','id="operation-direct-open"')+'</div>'+
 table(['Action / request','State','Updated','Actions'],values('operations').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(o=>['<strong>'+esc(o.action)+'</strong><div class="overflow-id">'+esc(o.id)+'</div>',tag(o.state),esc(o.updatedAt??o.createdAt),button('Inspect','data-open-operation="'+esc(o.id)+'"')+(['FAILED','INTERRUPTED','PREPARED'].includes(o.state)?' '+button('Resume','data-resume="'+esc(o.id)+'" data-mutate'):'')]))+'</section>'+
 '<section class="panel"><h2>Requests awaiting response reconciliation</h2>'+table(['Original request','Action','Actions'],Object.entries(pending()).map(([id,p])=>['<span class="overflow-id">'+esc(id)+'</span>',esc(p.action),button('Inspect or resend unchanged','data-reconcile="'+esc(id)+'" data-mutate')]))+'</section>';
}
function renderView(){
 if(!S.status)return;$('#view').innerHTML=({overview,capture:captureView,review:reviewView,reports:reportsView,publish:publishView,customer:customerView,delivery:deliveryView,history:historyView}[S.view])();bindForms();
}
function modal(title,body){$('#detail-title').textContent=title;$('#detail-body').innerHTML=body;if(!$('#detail').open)$('#detail').showModal();}
async function inspectCapture(id){S.capture=await read('capture',{id});S.context=S.capture.context;const c=S.capture;modal(c.plan.label,table(['Observation source','Value'],[['Rows',esc(c.projection.rows)],['Local timezone',esc(c.context.location.timezone)],['Metadata provenance',esc(c.context.kind)],['Original capture',esc(c.id)]])+
 '<div class="actions">'+button('Review this source','data-review-capture="'+esc(c.id)+'"')+button('Reopen plan','data-capture-plan="'+esc(c.id)+'"')+button('Download observations','data-file-kind="capture" data-file-id="'+esc(c.id)+'" data-file-name="measurements.csv"')+'</div>'+objectDetails(c,'Complete original capture')+
 '<h3>Original response files</h3>'+table(['Source / edition','Bytes','Action'],c.receipts.map(r=>[esc(r.url)+'<div class="overflow-id">'+esc(r.sha256)+'</div>',esc(r.bytes),button('Download','data-file-kind="capture" data-file-id="'+esc(c.id)+'" data-file-name="'+esc(r.file)+'"')])));
}
async function inspectOperation(id){
 const op=await read('request',{id});observe(op);const result=op.result;
 modal(op.action+' · '+op.state,'<p class="overflow-id">'+esc(op.id)+'</p>'+
 (op.error?'<div class="callout error">'+esc(op.error.code+': '+op.error.message)+'</div>':'')+
 '<div class="actions">'+(['PREPARED','FAILED','INTERRUPTED'].includes(op.state)?button('Resume this unchanged operation','data-resume="'+esc(op.id)+'" data-mutate'):'')+
 (op.action==='export'&&op.state==='COMPLETE'?button('Download complete project','data-file-kind="export" data-file-id="'+esc(op.id)+'" data-file-name="'+esc(result.file)+'"',true):'')+'</div>'+
 (result?'<h3>Actual retained result</h3><pre>'+esc(pretty(result))+'</pre>':'')+'<h3>Original reviewed input</h3><pre>'+esc(pretty(op.input))+'</pre>'+objectDetails(op,'Full operation and earlier attempts'));
}
async function download(kind,id,name){
 const r=await request('/api/file?'+new URLSearchParams({kind,id,name}));const original=r.headers.get('x-content-sha256'),blob=await r.blob();
 const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(actual!==original)throw Error('The downloaded bytes differ from the retained original file.');
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.split('/').pop();a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 note('Downloaded '+name+' · '+blob.size+' bytes · SHA-256 '+actual);
}
function pair(){const captureId=get('pub-capture'),sourceReviewId=get('pub-source-review');if(!captureId||!sourceReviewId)throw Error('Choose the exact completed capture and accepted source review.');return{captureId,sourceReviewId};}
function builderPlan(){
 const mode=get('mode'),p={mode,locationId:Number(get('location')),label:get('capture-label'),purpose:get('purpose'),sensorIds:get('sensors')?get('sensors').split(',').map(x=>Number(x.trim())):[],maxRows:Number(get('max-rows'))};
 if(mode==='archive')p.dates=get('dates').split(/[\s,]+/).filter(Boolean);else Object.assign(p,{resolution:get('resolution'),datetimeFrom:get('from'),datetimeTo:get('to'),pageSize:Number(get('page-size')),maxPages:Number(get('max-pages'))});
 return p;
}
async function loadContext(){const r=await fetch('/examples/archive-context.json',{cache:'no-store'});if(!r.ok)throw Error('The installed example metadata is unavailable.');S.context=await r.json();if($('#context-json'))$('#context-json').value=pretty(S.context);}
function bindForms(){
 bindMerchantPanel();
 $('#capture-builder')?.addEventListener('submit',e=>{e.preventDefault();S.plan=builderPlan();$('#plan-json').value=pretty(S.plan);note('Plan JSON updated. Review it and its original source context before capture.');});
 $('#example-context')?.addEventListener('click',()=>guarded(loadContext));
 $('#example-plan')?.addEventListener('click',()=>guarded(async()=>{S.plan={mode:'archive',locationId:2178,label:'Del Norte · May 3, 2022',purpose:'Review the original OpenAQ public archive edition and its station-level observations.',sensorIds:[],dates:['2022-05-03'],maxRows:250000};S.study=null;await loadContext();renderView();}));
 $('#capture-submit')?.addEventListener('click',()=>guarded(async()=>{const p=json('plan-json');S.plan=p;S.context=p.mode==='archive'?json('context-json'):null;const input={plan:p,...(p.mode==='archive'?{context:S.context}:{})};if(S.study&&pretty(S.study.plan)===pretty(p))input.study={id:S.study.id,revision:S.study.revision};await mutate('capture',input);}));
 $('#study-save')?.addEventListener('click',()=>guarded(async()=>{await mutate('study.save',{id:get('study-id'),expectedRevision:get('study-revision')||null,name:get('study-name'),purpose:json('plan-json').purpose,plan:json('plan-json')});}));
 $('#study-new')?.addEventListener('click',()=>{S.study=null;$('#study-id').value=uid();$('#study-revision').value='';note('A separate new study ID is selected. Existing saved editions remain available.');});
 $('#review-open')?.addEventListener('click',()=>guarded(async()=>{const id=get('capture-direct')||get('review-capture');S.capture=await read('capture',{id});S.review=eligibleReviews(id).at(-1)??null;renderView();}));
 $('#source-review')?.addEventListener('submit',e=>{e.preventDefault();guarded(async()=>{await mutate('review',{captureId:S.capture.id,captureSha256:S.capture.captureSha256,reviewer:get('reviewer'),decision:get('decision'),note:get('review-note'),attribution:get('attribution'),rightsBasis:get('rights-basis'),rightsSources:get('rights-sources').split('\n').map(x=>x.trim()).filter(Boolean),allowDerivedDelivery:$('#allow-delivery').checked});});});
 $('#capture-preview')?.addEventListener('click',()=>guarded(()=>previewRows(S.capture.id,0)));
 $('#report-form')?.addEventListener('submit',e=>{e.preventDefault();guarded(()=>mutate('report',{...selectedPairs('report-pairs'),title:get('report-title'),purpose:get('report-purpose'),reviewer:get('report-reviewer'),note:get('report-note'),includeMean:$('#mean').checked,excludeFlagged:$('#exclude-flags').checked}));});
 $('#pub-capture')?.addEventListener('change',async()=>{const id=get('pub-capture');if(!id)return;await guarded(async()=>{S.capture=await read('capture',{id});S.review=deliveryReviews(id).at(-1)??null;const select=$('#pub-source-review');select.innerHTML='<option value="">Choose a source review</option>'+deliveryReviews(id).map(r=>'<option value="'+esc(r.id)+'">'+esc(r.reviewer+' · '+short(r.id))+'</option>').join('');if(S.review)select.value=S.review.id;});});
 $('#publication-prepare')?.addEventListener('click',()=>guarded(()=>mutate('publication.prepare',pair())));
 $('#publication-status')?.addEventListener('click',()=>guarded(async()=>{S.publication=await read('publication',pair());$('#publication-result').innerHTML='<pre>'+esc(pretty(S.publication))+'</pre>';}));
 $('#publication-inspect')?.addEventListener('click',()=>guarded(async()=>modal('Original candidate', '<pre>'+esc(pretty(await read('publication.inspect',{...pair(),runId:get('pub-run'),query:'limit=20'})))+'</pre>')));
 $('#publication-review')?.addEventListener('click',()=>guarded(()=>mutate('publication.review',{...pair(),runId:get('pub-run'),reviewer:get('pub-reviewer'),note:get('pub-note'),initialize:$('#initialize').checked,...($('#initialize').checked?{}:{expectedSnapshot:get('expected-snapshot'),expectedRevision:Number(get('expected-revision'))})})));
 $('#publication-publish')?.addEventListener('click',()=>guarded(()=>mutate('publication.publish',{...pair(),runId:get('pub-run'),publicationReviewId:get('pub-review')})));
 $('#publication-recover')?.addEventListener('click',()=>guarded(()=>mutate('publication.recover',{...pair(),runId:get('pub-run')})));
 $('#release-prepare')?.addEventListener('click',()=>guarded(()=>mutate('release.prepare',{...pair(),runId:get('pub-run'),payment:json('payment-json'),origin:get('release-origin'),path:get('release-path')})));
 $('#release-stage')?.addEventListener('click',()=>guarded(()=>mutate('release.stage',{preparationId:get('release-preparation'),id:get('release-id'),label:get('release-label'),runtime:json('runtime-json')})));
 $('#customer-browser')?.addEventListener('click',()=>guarded(async()=>{const value=await read('customer.browser',pair());const u=new URL(value.url);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1')throw Error('The original customer application returned an unexpected origin.');const root=$('#customer-result');root.innerHTML='<div class="callout"><p>The original customer application is ready.</p><a target="_blank" rel="noreferrer noopener" href="'+esc(u.href)+'">Open original customer workflow</a></div>'; }));
 $('#customer-status')?.addEventListener('click',()=>guarded(async()=>{$('#customer-result').innerHTML='<pre>'+esc(pretty(await read('customer.status',pair())))+'</pre>';}));
 $('#customer-prepare')?.addEventListener('click',()=>guarded(()=>mutate('customer.start',{...pair(),kind:'prepare',arguments:{runId:get('customer-run'),reviewId:get('customer-review'),candidateDigest:get('candidate-digest'),query:get('customer-query'),reviewer:get('customer-reviewer'),note:get('customer-note')}})));
 $('#customer-action')?.addEventListener('click',()=>guarded(()=>{const kind=get('customer-kind'),args=json('customer-arguments');return mutate('customer.start',{...pair(),kind,arguments:{...args,deliveryId:get('delivery-id'),...(kind==='customer'?{operation:get('customer-operation')}: {})}});}));
 $('#customer-operation-read')?.addEventListener('click',()=>guarded(async()=>modal('Original customer operation','<pre>'+esc(pretty(await read('customer.operation',{...pair(),id:get('native-request')})))+'</pre>')));
 $('#customer-resume')?.addEventListener('click',()=>guarded(()=>mutate('customer.resume',{...pair(),operationId:get('native-request')})));
 $('#project-export')?.addEventListener('click',()=>guarded(()=>mutate('export',{...selectedPairs('delivery-pairs',true),reportIds:$$('[data-report-select]:checked').map(x=>x.dataset.reportSelect)})));
 $('#project-receive')?.addEventListener('click',()=>guarded(async()=>{
 const file=$('#delivery-file').files[0],sha=get('delivery-sha');if(!file||file.size>256*1024*1024||!/^[a-f0-9]{64}$/.test(sha))throw Error('Choose the complete archive (at most 256 MiB) and its sender-verified SHA-256.');
 const computed=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');if(computed!==sha)throw Error('This file differs from the reviewed original archive digest.');
 const uploadId=uid();await api('/api/upload?'+new URLSearchParams({id:uploadId,sha256:sha}),{method:'POST',body:file,raw:true});
 await mutate('receive',{uploadId,sha256:sha});
 }));
 $('#operation-direct-open')?.addEventListener('click',()=>guarded(()=>inspectOperation(get('operation-direct'))));
}
async function previewRows(id,offset){
 const p=await read('preview',{id,offset,limit:50});
 const cols=['sensor_id','parameter','unit','value_token','datetime_local','archive_local_day','period_interval','has_flags','source_row'];
 modal('Original observation preview', '<p>'+esc(p.offset+1)+'–'+esc(p.offset+p.rows.length)+' of '+esc(p.total)+' retained rows. Datetimes label exclusive period ends; the archive local day is retained separately.</p>'+table(cols,p.rows.map(r=>cols.map(c=>esc(r[c]))))+
 '<div class="actions">'+(p.offset?button('Previous rows','data-preview-id="'+esc(id)+'" data-preview-offset="'+Math.max(0,p.offset-50)+'"'):'')+(p.nextOffset!==null?button('Next rows','data-preview-id="'+esc(id)+'" data-preview-offset="'+p.nextOffset+'"'):'')+'</div>');
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.completedExample)return guarded(()=>b.dataset.completedExample==='receive'?receiveCompletedExample():downloadCompletedExample(b.dataset.completedExample));
 if(b.dataset.view)return show(b.dataset.view);if(b.dataset.go)return show(b.dataset.go);
 if(b.dataset.capture)return guarded(()=>inspectCapture(b.dataset.capture));
 if(b.dataset.reviewCapture)return guarded(async()=>{S.capture=await read('capture',{id:b.dataset.reviewCapture});S.review=eligibleReviews(S.capture.id).at(-1)??null;$('#detail').close();show('review');});
 if(b.dataset.capturePlan)return guarded(async()=>{const c=await read('capture',{id:b.dataset.capturePlan});S.plan=c.plan;S.context=c.context;S.study=null;$('#detail').close();show('capture');});
 if(b.dataset.study)return guarded(async()=>{S.study=await read('study',{id:b.dataset.study});S.plan=S.study.plan;show('capture');});
 if(b.dataset.review)return guarded(async()=>{const r=await read('review',{id:b.dataset.review});S.review=r;S.capture=await read('capture',{id:r.captureId});show('review');});
 if(b.dataset.report)return guarded(async()=>{const r=await read('report',{id:b.dataset.report});S.report=r;modal(r.title,table(['Sensor / parameter','Unit / source','Rows / numeric / missing','Minimum / maximum','Flagged / unknown'],r.series.map(x=>[esc(x.sensorId+' / '+x.parameter),esc(x.unit+' / '+x.resolution),esc(x.rows+' / '+x.numericRows+' / '+x.missingRows),esc((x.minimum??'—')+' / '+(x.maximum??'—')),esc(x.flaggedRows+' / '+x.unknownFlagRows)]))+
 '<div class="actions">'+button('Download report HTML','data-file-kind="report" data-file-id="'+esc(r.id)+'" data-file-name="report.html"')+button('Download machine report','data-file-kind="report" data-file-id="'+esc(r.id)+'" data-file-name="report.json"')+'</div>'+objectDetails(r));});
 if(b.dataset.openOperation)return guarded(()=>inspectOperation(b.dataset.openOperation));
 if(b.dataset.fileKind)return guarded(()=>download(b.dataset.fileKind,b.dataset.fileId,b.dataset.fileName));
 if(b.dataset.previewId)return guarded(()=>previewRows(b.dataset.previewId,Number(b.dataset.previewOffset)));
 if(b.hasAttribute('data-older'))return guarded(async()=>{const next=Math.max(...S.offsets)+30,maximum=Math.max(...Object.keys(S.collections).map(k=>S.status[k].total));if(next>=maximum)return note('The complete retained record list is loaded. Exact-ID reads remain available.');await refresh(true,next);});
 if(b.dataset.resume)return guarded(async()=>{const op=await api('/api/resume',{body:{workspaceId:S.identity.workspaceId,requestId:b.dataset.resume}});observe(op);$('#detail').close();await refresh();note('Resumed the same original request '+op.id+'.');});
 if(b.dataset.pause)return guarded(async()=>{await api('/api/cancel',{body:{workspaceId:S.identity.workspaceId,requestId:b.dataset.pause}});await refresh();});
 if(b.dataset.reconcile)return guarded(async()=>{const id=b.dataset.reconcile;try{return await inspectOperation(id);}catch(e){if(e.status!==404)throw e;}const original=pending()[id];if(!original||original.input.workspaceId!==S.identity.workspaceId)throw Error('This browser request belongs to another project.');const op=await api('/api/action',{body:original});observe(op);await refresh();note('Reconciled the original request '+id+'.');});
});
$('#refresh').addEventListener('click',()=>guarded(()=>refresh()));
try{S.identity=await api('/api/identity');await completedExample();await refresh();}catch(e){$('#connection-state').textContent='Connection requires attention';note(e.message,true);}
let polling=false;
setInterval(async()=>{if(polling||S.busy||!S.identity||(!S.status?.active&&!Object.keys(pending()).length)||document.hidden)return;polling=true;try{await refresh(['overview','history'].includes(S.view));}catch(e){note(e.message,true);}finally{polling=false;}},2500);
