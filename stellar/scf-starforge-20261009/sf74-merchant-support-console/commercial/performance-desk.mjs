// MIT. Recorded usage and customer quote revisions in the original Commercial workspace.
const SCHEMA='stellar-forge.merchant-commercial-performance-desk.v1';
const MAX_BYTES=48*1024*1024;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=value=>JSON.parse(JSON.stringify(value));
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const money=value=>value===null||value===undefined?'Incomplete inputs':'USD '+value;
const period=value=>[value?.observedFrom,value?.observedUntil].filter(Boolean).join(' through ')||'Saved observation period';
export function createCommercialPerformanceDesk({root,services,changed,refreshCase,useDraft}) {
  let view=null,scope=null,epoch=0,serial=0,busy=false,message='',error='',file=null,preview=null,pending=null,destroyed=false;
  let measuredQuoteId='',sourceId='',parentQuoteId='',targetTariffSourceId='',monthly='';
  const urls=new Set();
  const key=()=>scope&&SCHEMA+':'+scope.workspaceId+':'+scope.caseId;
  const selected=()=>view?.performanceSources?.find(row=>row.id===sourceId)||null;
  const quote=id=>view?.quotes?.find(row=>row.id===id)||null;
  const sources=()=>view?.performanceSources||[];
  const tariffs=()=>view?.tariffSources||[];
  function write(){
    if(!scope)return;
    try{sessionStorage.setItem(key(),JSON.stringify({schema:SCHEMA,scope,measuredQuoteId,sourceId,parentQuoteId,targetTariffSourceId,monthly,pending}));}catch{}
  }
  function restore(){
    try{
      const saved=JSON.parse(sessionStorage.getItem(key())||'null');
      if(saved?.schema!==SCHEMA||saved.scope?.caseId!==scope.caseId||saved.scope?.workspaceId!==scope.workspaceId)return;
      ({measuredQuoteId='',sourceId='',parentQuoteId='',targetTariffSourceId='',monthly='',pending=null}=saved);
    }catch{}
  }
  function clear({identityChanged=false}={}){
    write();epoch++;serial++;view=null;scope=null;busy=false;file=null;preview=null;pending=null;message='';error='';
    measuredQuoteId='';sourceId='';parentQuoteId='';targetTariffSourceId='';monthly='';
    for(const url of urls)URL.revokeObjectURL(url);urls.clear();
  }
  function chooseSource(){
    const source=selected();
    if(!source)return;
    if(!quote(parentQuoteId)||!descends(parentQuoteId,source.measuredQuote.id))parentQuoteId=source.measuredQuote.id;
    if(!tariffs().some(row=>row.id===targetTariffSourceId&&row.routeId===source.review.route.routeId))
      targetTariffSourceId=quote(parentQuoteId)?.sourceBindings.tariff?.id||source.tariffSourceId;
  }
  function descends(id,ancestor){
    const seen=new Set();
    while(id){if(id===ancestor)return true;if(seen.has(id))return false;seen.add(id);id=quote(id)?.parentId;}
    return false;
  }
  function connect(record){
    const next=record?.scope;
    if(!next?.caseId||!next.workspaceId){clear();return;}
    const changedIdentity=scope?.caseId!==next.caseId||scope?.workspaceId!==next.workspaceId;
    if(changedIdentity){clear();scope={caseId:next.caseId,workspaceId:next.workspaceId};restore();}
    if(view?.revision!==record.revision){serial++;preview=null;}
    view=record;
    if(pending&&view.requests?.some(row=>row.requestId===pending.requestId&&row.action==='receivePerformance'&&row.state==='COMPLETE')){
      pending=null;file=null;message='The original usage review is saved in this case.';
    }
    if(!quote(measuredQuoteId))measuredQuoteId=(view.quotes||[]).find(row=>row.sourceBindings?.tariff)?.id||'';
    if(!sources().some(row=>row.id===sourceId))sourceId=sources()[0]?.id||'';
    chooseSource();write();
  }
  function select(id,label,rows,value,placeholder){
    return '<label class="cq-field" for="'+id+'"><span>'+esc(label)+'</span><select id="'+id+'"'+(busy?' disabled':'')+'><option value="">'+esc(placeholder)+'</option>'+
      rows.map(row=>'<option value="'+esc(row.id)+'"'+(row.id===value?' selected':'')+'>'+esc(row.title||row.label||row.id)+'</option>').join('')+'</select></label>';
  }
  function button(action,label,disabled=false){
    return '<button type="button" data-performance-action="'+action+'"'+(busy||disabled?' disabled':'')+'>'+label+'</button>';
  }
  function reviewTable(source){
    const r=source.review;
    const counts=Object.entries(r.basis.counts||{}).filter(([,value])=>value!==null);
    return '<section class="cq-source"><h4>'+esc(source.label)+'</h4><p>'+esc(r.route.method+' '+r.route.path)+'</p>'+
      '<dl class="cq-performance-facts"><div><dt>Recorded period</dt><dd>'+esc(period(r.period))+'</dd></div>'+
      '<div><dt>Quantity basis</dt><dd>'+esc(r.basis.label)+'</dd></div><div><dt>Recorded quantity</dt><dd>'+esc(r.basis.quantity)+'</dd></div>'+
      '<div><dt>Earlier customer quote</dt><dd>'+esc(source.measuredQuote.title)+'</dd></div></dl>'+
      '<div class="cq-table-wrap"><table><thead><tr><th>At the recorded quantity</th><th>Amount</th></tr></thead><tbody>'+
      '<tr><td>Earlier saved uniform rate ('+money(r.quoted.savedUnitUsd)+' per request)</td><td>'+money(r.quoted.valueAtObservedQuantityUsd)+'</td></tr>'+
      '<tr><td>Original '+esc(r.tariff.mode)+' tariff schedule</td><td>'+money(r.tariff.quote.totalUsd)+'</td></tr>'+
      '<tr><td>Schedule less saved quote value</td><td>'+money(r.tariff.deltaFromSavedQuoteUsd)+'</td></tr>'+
      '<tr><td>Estimated variable cost</td><td>'+money(r.costs.estimated.valueAtBasisQuantityUsd)+'</td></tr>'+
      '<tr><td>Contribution using estimated cost</td><td>'+money(r.costs.contributionUsingEstimatedUnitCostUsd)+'</td></tr></tbody></table></div>'+
      (r.costs.recorded?'<p>Recorded cost edition: '+esc(r.costs.recorded.edition)+'. Its original period and coverage accompany the full review.</p>':'')+
      (counts.length?'<details><summary>Recorded counts</summary><dl class="cq-performance-facts">'+counts.map(([name,value])=>'<div><dt>'+esc(name)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl></details>':'')+
      (r.issues?.length?'<ul>'+r.issues.map(row=>'<li>'+esc(row.message)+'</li>').join(''):'')+'</section>';
  }
  function render(){
    if(!view)return '<p>Open a saved merchant case to review usage and revise its quotation.</p>';
    const source=selected(),eligible=(view.quotes||[]).filter(row=>row.sourceBindings?.tariff);
    const revise=source?(view.quotes||[]).filter(row=>descends(row.id,source.measuredQuote.id)):[];
    const applicable=source?tariffs().filter(row=>row.routeId===source.review.route.routeId).map(row=>({...row,title:(row.planLabel||row.tariffLabel||row.id)+' · '+row.selectedQuantity+' requests'})):[];
    return '<section class="cq-performance"><div class="cq-section-heading"><div><h3>Usage and pricing revisions</h3>'+
      '<p>Compare a saved customer quote with recorded usage, then prepare a later edition with an explicit monthly volume.</p></div></div>'+
      (message?'<p role="status">'+esc(message)+'</p>':'')+(error?'<p role="alert">'+esc(error)+'</p>':'')+
      '<section class="cq-source"><h4>Receive recorded usage</h4><p>Export the complete saved performance source from Merchant pricing. Select the earlier customer quotation whose tariff and uniform rate were measured.</p>'+
      select('cq-performance-measured','Quotation being measured',eligible,measuredQuoteId,'Choose an original quotation')+
      '<label class="cq-field" for="cq-performance-file"><span>Complete saved performance source</span><input id="cq-performance-file" type="file" accept=".json,application/json"'+(busy?' disabled':'')+'></label>'+
      (file?'<p>'+esc(file.name)+' · '+file.bytes+' bytes</p>':'')+
      (pending?'<p>A saved receiving request is awaiting its reply. Select the same complete file to resume it.</p>'+button('resume','Resume original receiving request',!file):
        '<div class="cq-actions">'+button('preview','Review original usage source',!file||!measuredQuoteId)+button('receive','Save usage review in this case',!preview)+'</div>')+
      (preview?reviewTable(preview.source):'')+'</section>'+
      '<section><h4>Saved usage reviews</h4>'+
      select('cq-performance-source','Recorded review',sources(),sourceId,'Choose a saved usage review')+
      (source?reviewTable(source)+'<div class="cq-actions">'+button('download-source','Download complete native source')+button('download-report','Download readable report')+button('download-attachment','Download case attachment')+'</div>':
        '<p>The complete recorded review, original observations, tariff and pricing files are retained with this case when received.</p>')+'</section>'+
      (source?'<section class="cq-source"><h4>Prepare a quote revision</h4><p>The observed period remains '+esc(period(source.review.period))+
        '. Enter the monthly request volume for the new commercial proposal.</p><div class="cq-grid">'+
        select('cq-performance-parent','Quote edition to revise',revise,parentQuoteId,'Choose an edition')+
        select('cq-performance-tariff','Saved tariff and pricing for the new edition',applicable,targetTariffSourceId,'Choose a saved tariff')+
        '<label class="cq-field" for="cq-performance-monthly"><span>Proposed requests per month</span><input id="cq-performance-monthly" inputmode="numeric" value="'+esc(monthly)+'"'+(busy?' disabled':'')+'></label></div>'+
        '<p>Use the existing tariff to change volume, or receive a revised native pricing selection in Tariff sources and choose it here. The quote editor retains the customer, implementation work, service terms and original edition history.</p>'+
        button('revision','Prepare revision in quote editor',!parentQuoteId||!targetTariffSourceId||!/^[1-9]\d*$/.test(monthly))+'</section>':'')+'</section>';
  }
  async function run(fn){
    if(busy)return;const token=epoch;busy=true;error='';changed();
    try{await fn(token);}catch(err){if(token===epoch)error=String(err.message||err);}
    finally{if(token===epoch){busy=false;write();changed();}}
  }
  function requireCurrent(token,stamp=serial){
    if(destroyed||token!==epoch||stamp!==serial||!view)throw new Error('The selected case or usage inputs changed. Review the current selection.');
  }
  function sourceArgs(){
    const selectedQuote=quote(measuredQuoteId);
    if(!file||!selectedQuote)throw new Error('Select the original customer quotation and complete performance source.');
    return {scope:clone(scope),expectedRevision:view.revision,sourceText:file.text,sourceSha256:file.sha256,
      quoteId:selectedQuote.id,quoteSha256:selectedQuote.sha256,tariffSourceId:selectedQuote.sourceBindings.tariff.id};
  }
  async function receive(token,resume=false){
    if(!file)throw new Error('Select the complete original performance source file.');
    if(!resume){
      if(!preview||preview.serial!==serial)throw new Error('Review this exact file and customer quotation before saving.');
      const {sourceText,...args}=preview.args;
      pending={...args,reviewSha256:preview.reviewSha256,requestId:crypto.randomUUID(),actor:'Local commercial operator'};
      write();
    }
    if(!pending||pending.sourceSha256!==file.sha256)throw new Error('Select the same complete file used by the original receiving request.');
    const result=await services.receivePerformance({...pending,sourceText:file.text});
    requireCurrent(token);
    pending=null;sourceId=result.performanceSourceId;file=null;preview=null;write();
    await refreshCase();message='The complete usage review is saved in the original case. Select its proposed monthly volume below.';
  }
  async function download(kind,token){
    const source=selected();if(!source)throw new Error('Choose a saved recorded review.');
    const reply=await services.downloadPerformance({scope:clone(scope),revision:view.revision,sourceId:source.id,kind});
    const bytes=new Uint8Array(await reply.response.arrayBuffer());requireCurrent(token);
    if(reply.descriptor.bytes!==bytes.length||await digest(bytes)!==reply.descriptor.sha256)
      throw new Error('The complete downloaded file differs from its saved descriptor.');
    const blob=new Blob([bytes],{type:reply.descriptor.mediaType||'application/octet-stream'}),url=URL.createObjectURL(blob);urls.add(url);
    const anchor=document.createElement('a');anchor.href=url;anchor.download=reply.descriptor.filename;anchor.click();
    setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},1000);
    message='Downloaded '+reply.descriptor.filename+'.';
  }
  async function action(name,token){
    if(name==='preview'){
      const stamp=serial,args=sourceArgs(),reply=await services.previewPerformance(args);requireCurrent(token,stamp);
      preview={...reply,args,serial:stamp};message='Review the recorded period, price comparison and original source notes before saving.';return;
    }
    if(name==='receive'||name==='resume')return receive(token,name==='resume');
    if(name==='revision'){
      const selectedQuote=quote(parentQuoteId),stamp=serial;
      if(!selectedQuote)throw new Error('Choose the quote edition to revise.');
      const result=await services.preparePerformanceRevision({scope:clone(scope),expectedRevision:view.revision,
        sourceId,quoteId:selectedQuote.id,quoteSha256:selectedQuote.sha256,proposedMonthlyRequests:monthly,targetTariffSourceId});
      requireCurrent(token,stamp);useDraft(result);return;
    }
    if(name.startsWith('download-'))return download(name.slice(9).toUpperCase(),token);
  }
  const click=event=>{
    const button=event.target.closest('[data-performance-action]');
    if(button&&root.contains(button))void run(token=>action(button.dataset.performanceAction,token));
  };
  const input=event=>{
    const target=event.target;
    if(target.id==='cq-performance-monthly'){monthly=target.value;serial++;preview=null;write();}
  };
  const change=event=>{
    const target=event.target;
    if(target.id==='cq-performance-file'){
      const incoming=target.files?.[0];if(!incoming)return;
      void run(async token=>{
        if(incoming.size<1||incoming.size>MAX_BYTES)throw new Error('Select a complete performance source no larger than 48 MiB.');
        const bytes=new Uint8Array(await incoming.arrayBuffer());requireCurrent(token);
        const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),sha256=await digest(bytes);requireCurrent(token);
        if(pending&&pending.sourceSha256!==sha256)throw new Error('This file differs from the pending receiving request.');
        file={name:incoming.name,bytes:bytes.length,text,sha256};serial++;preview=null;message='The complete source file is ready to review.';
      });return;
    }
    if(target.id==='cq-performance-monthly'){input(event);changed();return;}
    const field=target.id;
    if(!['cq-performance-measured','cq-performance-source','cq-performance-parent','cq-performance-tariff'].includes(field))return;
    if(field==='cq-performance-measured')measuredQuoteId=target.value;
    if(field==='cq-performance-source'){sourceId=target.value;parentQuoteId='';targetTariffSourceId='';chooseSource();}
    if(field==='cq-performance-parent'){parentQuoteId=target.value;targetTariffSourceId=quote(parentQuoteId)?.sourceBindings.tariff?.id||'';}
    if(field==='cq-performance-tariff')targetTariffSourceId=target.value;
    serial++;preview=null;error='';write();changed();
  };
  root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',change);
  return {connect,clear,render,
    snapshot:()=>({scope:scope&&clone(scope),pending:pending&&clone(pending),dirty:Boolean(file||preview||monthly),sourceId,busy}),
    destroy(){clear();destroyed=true;root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('change',change);}
  };
}
