// MIT. Private quote economics in the original Commercial case workspace.
const SCHEMA='stellar-forge.merchant-commercial-economics-desk.v1';
const INPUT='stellar-forge.merchant-commercial-economics-input.v1';
const MAX_BYTES=2*1024*1024;
const clone=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shown=value=>value===null||value===undefined?'Unknown':String(value);
const money=value=>value===null||value===undefined?'Unknown':'USD '+value;
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const section=()=>({hours:null,cashHourlyCostUsd:null,valuationHourlyRateUsd:null,costs:[],costCoverage:'INCOMPLETE',note:''});
const empty=quote=>({schema:INPUT,quoteId:quote?.id||'',quoteSha256:quote?.sha256||'',asOfDate:new Date().toISOString().slice(0,10),
  implementation:section(),care:section(),careCapacity:{availableHoursMonthly:null,committedOtherHoursMonthly:null,source:''},
  effortIncreasesPct:['0','20','25'],note:''});
export function createCommercialEconomicsDesk({root,services,changed,refreshCase,openImplementation}) {
  let view=null,scope=null,epoch=0,serial=0,destroyed=false,busy=false,input=empty(),actor='',dirty=false;
  let preview=null,pending=null,selectedAssessmentId='',message='',error='',storageError=false;
  const urls=new Set(),retained=new Map();
  const key=which=>SCHEMA+':'+which.workspaceId+':'+which.caseId;
  const assessments=()=>view?.economics?.assessments||[];
  const selected=()=>assessments().find(row=>row.id===selectedAssessmentId)||null;
  const quote=()=>view?.quotes?.find(row=>row.id===input.quoteId&&row.sha256===input.quoteSha256)||null;
  const enabled=()=>['previewEconomics','saveEconomics','downloadEconomics'].every(name=>typeof services[name]==='function');
  function state(){return {schema:SCHEMA,scope:scope&&clone(scope),input:clone(input),actor,dirty,pending:pending&&clone(pending),selectedAssessmentId};}
  function write(){
    if(!scope)return;
    const value=state();retained.set(key(scope),value);
    try{sessionStorage.setItem(key(scope),JSON.stringify(value));storageError=false;}catch{storageError=true;}
  }
  function restore(){
    let saved=retained.get(key(scope));
    if(!saved)try{saved=JSON.parse(sessionStorage.getItem(key(scope))||'null');}catch{storageError=true;}
    if(saved?.schema!==SCHEMA||!same(saved.scope,scope)||saved.input?.schema!==INPUT)return;
    try{shape(saved.input);}catch{return;}
    input=clone(saved.input);actor=typeof saved.actor==='string'?saved.actor:'';dirty=Boolean(saved.dirty);
    selectedAssessmentId=typeof saved.selectedAssessmentId==='string'?saved.selectedAssessmentId:'';
    pending=saved.pending&&same(saved.pending.scope,scope)?clone(saved.pending):null;
  }
  function clear({identityChanged=false}={}){
    const prior=scope;write();epoch++;serial++;view=null;scope=null;preview=null;pending=null;busy=false;
    input=empty();actor='';dirty=false;selectedAssessmentId='';message='';error='';
    if(identityChanged&&prior){retained.delete(key(prior));try{sessionStorage.removeItem(key(prior));}catch{}}
    for(const url of urls)URL.revokeObjectURL(url);urls.clear();
  }
  function connect(record){
    const next=record?.scope;
    if(!next?.caseId||!next.workspaceId){clear();return;}
    const changedScope=!same(scope,{caseId:next.caseId,workspaceId:next.workspaceId});
    if(changedScope){clear({identityChanged:Boolean(scope&&scope.workspaceId!==next.workspaceId)});scope={caseId:next.caseId,workspaceId:next.workspaceId};restore();}
    if(view?.revision!==record.revision){preview=null;serial++;}
    view=record;
    if(!input.quoteId&&!dirty&&!pending&&record.quotes?.length)input=empty(record.quotes[0]);
    const completed=pending&&(record.economics?.assessments||[]).find(row=>row.id===pending.requestId);
    if(pending&&completed&&completed.review?.reviewSha256===pending.reviewSha256&&same(completed.review?.input,pending.input)&&
      record.requests?.some(row=>row.requestId===pending.requestId&&row.action==='saveEconomics'&&row.state==='COMPLETE')){
      selectedAssessmentId=pending.requestId;
      if(same(input,pending.input))dirty=false;
      pending=null;message='The original private assessment is saved and reopened in this case.';
    }
    if(!selectedAssessmentId)selectedAssessmentId=view.economics?.latestByQuote?.[input.quoteId]||'';
    write();
  }
  function field(path,label,value,{type='text',numeric=false,max=16000}={}){
    return '<label class="cq-field"><span>'+esc(label)+'</span><input data-economics-field="'+path+'" type="'+type+'"'+
      (numeric?' inputmode="decimal"':'')+' maxlength="'+max+'" value="'+esc(value)+'"'+(busy||pending?' disabled':'')+'></label>';
  }
  function area(path,label,value,max=16000){return '<label class="cq-field"><span>'+esc(label)+'</span><textarea rows="3" maxlength="'+max+'" data-economics-field="'+path+'"'+(busy||pending?' disabled':'')+'>'+esc(value)+'</textarea></label>';}
  function button(action,label,disabled=false){return '<button type="button" data-economics-action="'+action+'"'+(busy||disabled?' disabled':'')+'>'+esc(label)+'</button>';}
  function select(path,label,rows,value,disabled=false){
    return '<label class="cq-field"><span>'+esc(label)+'</span><select data-economics-select="'+path+'"'+(busy||disabled?' disabled':'')+'>'+
      rows.map(([id,title])=>'<option value="'+esc(id)+'"'+(id===value?' selected':'')+'>'+esc(title)+'</option>').join('')+'</select></label>';
  }
  function costs(name,title){
    const data=input[name];
    return '<section class="cq-economics-section"><h4>'+title+'</h4><div class="cq-grid">'+
      field(name+'.hours',name==='care'?'Delivery hours per care contract / month':'Total implementation delivery hours',data.hours,{numeric:true,max:40})+
      field(name+'.cashHourlyCostUsd','Cash labor cost / hour (USD)',data.cashHourlyCostUsd,{numeric:true,max:40})+
      field(name+'.valuationHourlyRateUsd','Planning value of an hour (USD)',data.valuationHourlyRateUsd,{numeric:true,max:40})+
      select(name+'.costCoverage','Coverage of other costs',[['INCOMPLETE','Incomplete — other costs remain unknown'],['COMPLETE','Complete — all other costs in this scope listed']],data.costCoverage,Boolean(pending))+'</div>'+
      '<p>Leave an unknown amount blank. Enter zero for an explicit zero. Include the labor source and period in the basis below; planning value is assessed separately from cash cost.</p>'+
      '<div class="cq-economics-costs">'+data.costs.map((row,i)=>'<section class="cq-source"><div class="cq-section-heading"><h4>Other cost '+(i+1)+'</h4>'+button('remove:'+name+':'+row.id,'Remove cost',Boolean(pending))+'</div><div class="cq-grid">'+
        field(name+'.costs.'+i+'.label','Cost description',row.label,{max:500})+
        field(name+'.costs.'+i+'.amountUsd',name==='care'?'Monthly amount (USD)':'Amount (USD)',row.amountUsd,{numeric:true,max:40})+'</div>'+
        area(name+'.costs.'+i+'.source','Original source, coverage and date',row.source,4000)+'</section>').join('')+'</div>'+
      button('add:'+name,'Add other cost',Boolean(pending)||data.costs.length>=200)+
      '<div class="cq-grid">'+area(name+'.note','Effort, labor and cost basis',data.note)+'</div></section>';
  }
  function resultTable(label,result){
    if(!result)return '<p>'+esc(label)+': unknown inputs.</p>';
    return '<section><h5>'+esc(label)+'</h5><p>Break-even delivery hours: <strong>'+esc(shown(result.breakEvenHours))+'</strong></p>'+
      '<div class="cq-table-wrap"><table><caption>'+esc(label)+' · effort sensitivity</caption><thead><tr><th>Extra effort</th><th>Hours</th><th>Labor cost</th><th>Total cost</th><th>Contribution</th><th>Margin</th></tr></thead><tbody>'+
      (result.cases||[]).map(row=>'<tr><td>'+esc(row.effortIncreasePct)+'%</td><td>'+esc(shown(row.hours))+'</td><td>'+esc(money(row.laborCost))+'</td><td>'+esc(money(row.totalCost))+'</td><td>'+esc(money(row.contribution))+'</td><td>'+esc(row.marginPercent==null?'Unknown':row.marginPercent+'%')+'</td></tr>').join('')+
      '</tbody></table></div></section>';
  }
  function renderReview(review,label){
    if(!review)return '';
    const cap=review.capacity||{};
    return '<section class="cq-economics-review"><h4>'+esc(label)+'</h4><div class="cq-summary"><div><span>Implementation fee</span><strong>'+esc(money(review.quote?.implementationUsd))+'</strong></div><div><span>Care fee / month</span><strong>'+esc(money(review.quote?.recurringServiceUsd))+'</strong></div><div><span>Quoted route usage / month</span><strong>'+esc(money(review.quote?.routeUsageUsd))+'</strong></div></div>'+
      (review.issues?.length?'<ul class="cq-issues">'+review.issues.map(row=>'<li>'+esc(row.message||row.code||row)+'</li>').join('')+'</ul>':'')+
      ['implementation','care'].map(name=>'<section class="cq-economics-section"><h4>'+esc(name==='care'?'Monthly care economics':'Implementation economics')+'</h4><p>Known listed other costs: '+esc(money(review[name]?.knownOtherCostsUsd))+'.</p>'+
        resultTable('Cash cost',review[name]?.cash)+resultTable('Planning valuation',review[name]?.valuation)+
        (review[name]?.missingInputs?.length?'<p>Inputs still needed: '+esc(review[name].missingInputs.join(', '))+'.</p>':'')+'</section>').join('')+
      '<section class="cq-economics-section"><h4>Monthly care capacity</h4><p>'+esc(cap.scope||'')+'</p><dl><dt>Status</dt><dd>'+esc(cap.status||'INCOMPLETE')+'</dd><dt>Hours remaining after other commitments</dt><dd>'+esc(shown(cap.remainingHoursMonthly))+'</dd><dt>Whole care contracts at base effort</dt><dd>'+esc(shown(cap.maxWholeCareContracts))+'</dd></dl>'+
      (Array.isArray(cap.cases)?'<div class="cq-table-wrap"><table><caption>Capacity at each effort assumption</caption><thead><tr><th>Extra effort</th><th>Hours per contract</th><th>Whole contracts</th></tr></thead><tbody>'+cap.cases.map(row=>'<tr><td>'+esc(row.effortIncreasePct)+'%</td><td>'+esc(shown(row.hoursMonthly??row.hours))+'</td><td>'+esc(shown(row.maxWholeCareContracts))+'</td></tr>').join('')+'</tbody></table></div>':'')+'</section>'+
      '<details><summary>Original route pricing and complete assessment</summary><p>Route economics below retain the saved quote’s original pricing review and its own cost basis.</p><pre class="cq-json">'+esc(JSON.stringify(review,null,2))+'</pre></details></section>';
  }
  function render(){
    if(!view)return '<p>Open a saved merchant case to assess its internal delivery costs.</p>';
    if(!enabled())return '<p>This connection needs the complete economics services. Reopen the selected Merchant workspace version.</p>';
    const q=quote(),saved=selected();
    return '<section class="cq-economics" aria-busy="'+busy+'"><div class="cq-section-heading"><div><h3>Private quote economics</h3><p>Assess delivery, cash cost, planning value and care capacity against one exact saved customer quotation.</p></div>'+button('refresh','Refresh saved case')+'</div>'+
      '<div class="cq-economics-status" aria-live="polite">'+(message?'<p role="status">'+esc(message)+'</p>':'')+(error?'<p role="alert">'+esc(error)+'</p>':'')+
      (storageError?'<p role="alert">Browser recovery storage is unavailable. Keep this page open and download the complete working draft.</p>':'')+'</div>'+
      (pending?'<section class="cq-pending"><strong>Original assessment save awaiting its result</strong><code>'+esc(pending.requestId)+'</code><p>Refresh the case to reopen the saved result, or continue this same request.</p>'+button('resume','Continue original save')+button('draft-download','Download complete working draft')+'</section>':'')+
      '<div class="cq-grid">'+select('quote','Saved customer quotation',[['','Choose a saved quote'],...(view.quotes||[]).map(row=>[row.id,row.title||row.id])],input.quoteId,Boolean(pending))+
      field('asOfDate','Assessment date (UTC)',input.asOfDate,{type:'date',max:10})+'</div>'+
      (q?'<p><strong>'+esc(q.title)+'</strong> · Implementation '+esc(money(q.totals?.implementationUsd))+' · Care '+esc(money(q.totals?.recurringServiceUsd))+' / month</p><details><summary>Bound quotation edition</summary><dl><dt>Edition</dt><dd><code>'+esc(q.id)+'</code></dd><dt>SHA-256</dt><dd><code>'+esc(q.sha256)+'</code></dd></dl></details>':
      '<p>Save a quotation edition in the Quote editor, then choose it here. Any entered internal assumptions remain in the working draft.</p>')+
      costs('implementation','Implementation effort and costs')+costs('care','Monthly care effort and costs')+
      '<section class="cq-economics-section"><h4>Monthly care capacity and sensitivity</h4><div class="cq-grid">'+
      field('careCapacity.availableHoursMonthly','Hours available for care / month',input.careCapacity.availableHoursMonthly,{numeric:true,max:40})+
      field('careCapacity.committedOtherHoursMonthly','Hours already committed elsewhere / month',input.careCapacity.committedOtherHoursMonthly,{numeric:true,max:40})+
      field('effortIncreasesPct','Extra effort percentages, comma separated',input.effortIncreasesPct.join(', '),{max:400})+
      area('careCapacity.source','Capacity source and coverage',input.careCapacity.source,4000)+'</div>'+area('note','Overall assessment note',input.note)+'</section>'+
      '<section class="cq-economics-section"><div class="cq-grid">'+field('actor','Recorded by',actor,{max:200})+'</div><div class="cq-actions">'+
      button('preview','Review economics',Boolean(pending)||!q)+button('save','Save private assessment',Boolean(pending)||!preview||!actor.trim())+
      button('draft-download','Download complete working draft')+'</div>'+
      '<label class="cq-field cq-economics-import"><span>Reopen a working draft or saved assessment as editable assumptions</span><input data-economics-file type="file" accept=".json,application/json"'+(busy||pending?' disabled':'')+'></label>'+
      '<p>Private costs accompany complete staff case handoffs. The customer quotation export carries the quoted prices and terms.</p></section>'+
      '<div data-economics-review>'+(preview?renderReview(preview.review,'Current economics review'):'<p>Review the current inputs to calculate the contribution and capacity before saving.</p>')+'</div>'+
      '<section class="cq-economics-section"><h4>Saved private assessments</h4>'+
      select('assessment','Retained assessment',[['','Choose an assessment'],...assessments().map(row=>[row.id,(row.createdAt||row.id)+' · '+(row.review?.quote?.title||row.input?.quoteId||'Saved quotation')])],selectedAssessmentId)+
      (saved?'<div class="cq-actions">'+button('use-assessment','Use these assumptions for a new assessment',Boolean(pending))+button('download-JSON','Download complete assessment JSON')+button('download-REPORT','Download readable internal report')+'</div>'+
        '<p>Assessment <code>'+esc(saved.id)+'</code> · '+esc(saved.createdAt||'')+'</p>'+renderReview(saved.review,'Saved assessment'):'<p>Saved assessments retain their complete assumptions, exact quotation, original calculation and source references.</p>')+
      '<div class="cq-actions">'+button('implementation','Open implementation and receiving',!openImplementation)+'</div></section></section>';
  }
  function assertCurrent(token,stamp=serial){
    if(destroyed||token!==epoch||stamp!==serial||!scope||!view)throw new Error('The case or economics inputs changed. Review the current selection.');
  }
  function invalidate(){
    dirty=true;serial++;preview=null;error='';write();
    const save=root.querySelector('[data-economics-action="save"]');if(save)save.disabled=true;
    const panel=root.querySelector('[data-economics-review]');if(panel)panel.innerHTML='<p>Inputs changed. Review economics to calculate the current assumptions.</p>';
  }
  async function run(fn){
    if(busy)return;const token=epoch;busy=true;error='';changed();
    try{await fn(token);}catch(err){if(token===epoch){if(err.requestState==='REJECTED'){pending=null;preview=null;}error=String(err.message||err);}}
    finally{if(token===epoch&&!destroyed){busy=false;write();changed();}}
  }
  function shape(value){
    if(value?.schema!==INPUT||typeof value.quoteId!=='string'||typeof value.quoteSha256!=='string'||typeof value.asOfDate!=='string'||
      typeof value.note!=='string'||!Array.isArray(value.effortIncreasesPct)||value.effortIncreasesPct.length>30||value.effortIncreasesPct.some(x=>typeof x!=='string'))
      throw new Error('Choose a complete economics input or saved assessment.');
    for(const name of ['implementation','care']){
      const part=value[name];if(!part||!Array.isArray(part.costs)||part.costs.length>200||typeof part.note!=='string'||
        !['INCOMPLETE','COMPLETE'].includes(part.costCoverage)||['hours','cashHourlyCostUsd','valuationHourlyRateUsd'].some(k=>part[k]!==null&&typeof part[k]!=='string')||
        part.costs.some(row=>!row||typeof row.id!=='string'||typeof row.label!=='string'||typeof row.source!=='string'||row.amountUsd!==null&&typeof row.amountUsd!=='string'))
        throw new Error('The complete cost sections are required.');
    }
    if(!value.careCapacity||typeof value.careCapacity.source!=='string'||['availableHoursMonthly','committedOtherHoursMonthly'].some(k=>value.careCapacity[k]!==null&&typeof value.careCapacity[k]!=='string'))
      throw new Error('The complete capacity assumptions are required.');
  }
  function localDownload(value,filename,mediaType='application/json'){
    const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)+'\n'],{type:mediaType}));urls.add(url);
    const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();
    setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},1000);
  }
  async function save(token,resume){
    if(!resume){
      if(pending)throw new Error('Reopen the original pending save first.');
      if(!preview||preview.serial!==serial||preview.revision!==view.revision||!same(preview.input,input))throw new Error('Review the exact current assumptions before saving.');
      if(!actor.trim())throw new Error('Enter the operator in Recorded by.');
      pending={scope:clone(scope),expectedRevision:view.revision,input:clone(input),reviewSha256:preview.review.reviewSha256,actor:actor.trim(),requestId:crypto.randomUUID()};write();
    }
    if(!pending||!same(pending.scope,scope))throw new Error('No original save belongs to this selected case.');
    const request=clone(pending),reply=await services.saveEconomics(request);assertCurrent(token);
    if(reply.state!=='COMPLETE'||reply.requestId!==request.requestId||!same(reply.view?.scope,scope))throw new Error('Reopen the case to recover the original saved assessment result.');
    selectedAssessmentId=reply.assessmentId||request.requestId;if(same(input,request.input))dirty=false;
    pending=null;preview=null;write();connect(reply.view);
    message='Private assessment saved in the original case. Its exact quote and assumptions travel with the staff handoff.';
    await refreshCase();
  }
  async function action(name,token){
    if(name==='refresh'){await refreshCase();return;}
    if(name==='draft-download'){localDownload(state(),'merchant-economics-working-'+scope.caseId+'.json');message='Complete working draft downloaded, including any original pending save.';return;}
    if(name==='resume')return save(token,true);
    if(name==='save')return save(token,false);
    if(name==='preview'){
      if(pending)throw new Error('Recover the original assessment save first.');
      const stamp=serial,original=clone(input),revision=view.revision;
      if(!quote())throw new Error('Choose an exact saved customer quotation.');
      const reply=await services.previewEconomics({scope:clone(scope),expectedRevision:revision,input:original});assertCurrent(token,stamp);
      if(!same(reply.scope,scope)||reply.revision!==revision||!same(reply.review?.input,original)||!/^[a-f0-9]{64}$/.test(reply.review?.reviewSha256||''))
        throw new Error('The returned assessment differs from the selected case and inputs.');
      preview={review:reply.review,input:original,revision,serial:stamp};message='Review the cash and planning results, source coverage and care capacity, then save this assessment.';return;
    }
    if(name==='implementation'){if(typeof openImplementation==='function')openImplementation({scope:clone(scope)});return;}
    if(name.startsWith('download-')){
      const saved=selected();if(!saved)throw new Error('Choose a saved private assessment.');
      const reply=await services.downloadEconomics({scope:clone(scope),revision:view.revision,assessmentId:saved.id,kind:name.slice(9)});
      const bytes=new Uint8Array(await reply.response.arrayBuffer());assertCurrent(token);
      if(!same(reply.scope,scope)||reply.descriptor.bytes!==bytes.length||await digest(bytes)!==reply.descriptor.sha256)
        throw new Error('The downloaded assessment differs from its complete saved file descriptor.');
      assertCurrent(token);localDownload(new TextDecoder('utf-8',{fatal:true}).decode(bytes),reply.descriptor.filename,reply.descriptor.mediaType);
      message='Downloaded '+reply.descriptor.filename+'.';return;
    }
    if(pending)throw new Error('Recover the original pending save before changing assumptions.');
    if(name==='use-assessment'){
      const saved=selected(),value=saved?.input||saved?.review?.input;
      shape(value);
      if(!view.quotes.some(row=>row.id===value.quoteId&&row.sha256===value.quoteSha256))throw new Error('This assessment’s exact quotation is missing from the current case.');
      input=clone(value);invalidate();message='Saved assumptions copied into the working draft. Review and save a new assessment to retain changes.';return;
    }
    if(name.startsWith('add:')){
      const part=name.slice(4);if(!['implementation','care'].includes(part))return;
      if(input[part].costs.length>=200)throw new Error('Keep this assessment within 200 complete other-cost rows per section.');
      input[part].costs.push({id:crypto.randomUUID(),label:'',amountUsd:null,source:''});invalidate();return;
    }
    if(name.startsWith('remove:')){
      const [,part,id]=name.split(':');if(!['implementation','care'].includes(part))return;
      input[part].costs=input[part].costs.filter(row=>row.id!==id);invalidate();
    }
  }
  const click=event=>{const target=event.target.closest('[data-economics-action]');if(target&&root.contains(target))void run(token=>action(target.dataset.economicsAction,token));};
  const onInput=event=>{
    const target=event.target,path=target.dataset.economicsField;if(!path||busy||pending)return;
    if(path==='actor'){actor=target.value;write();const button=root.querySelector('[data-economics-action="save"]');if(button)button.disabled=!preview||!actor.trim();return;}
    if(path==='effortIncreasesPct')input.effortIncreasesPct=target.value.split(',').map(v=>v.trim());
    else{
      const bits=path.split('.');let obj=input;for(const part of bits.slice(0,-1)){obj=obj?.[part];if(!obj)return;}
      const field=bits.at(-1);obj[field]=target.inputMode==='decimal'?(target.value.trim()===''?null:target.value.trim()):target.value;
    }
    invalidate();
  };
  const change=event=>{
    const target=event.target;
    if(target.hasAttribute('data-economics-file')){
      const incoming=target.files?.[0];if(!incoming)return;
      void run(async token=>{
        if(pending)throw new Error('Recover the original pending save before importing assumptions.');
        if(incoming.size<1||incoming.size>MAX_BYTES)throw new Error('Choose a complete UTF-8 economics JSON file no larger than 2 MiB.');
        const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await incoming.arrayBuffer()));assertCurrent(token);
        const next=value.schema===INPUT?value:value.input||value.review?.input;shape(next);
        if(!view.quotes.some(row=>row.id===next.quoteId&&row.sha256===next.quoteSha256))throw new Error('The file’s exact customer quotation is missing from this case.');
        if(value.pending){
          if(value.schema!==SCHEMA||!same(value.scope,scope)||!same(value.pending.scope,scope)||!same(value.pending.input,next)||
            !/^[a-f0-9-]{36}$/.test(value.pending.requestId||'')||!/^[a-f0-9]{64}$/.test(value.pending.expectedRevision||'')||
            !/^[a-f0-9]{64}$/.test(value.pending.reviewSha256||'')||typeof value.pending.actor!=='string')
            throw new Error('This original pending save belongs to different or incomplete inputs.');
        }
        input=clone(next);if(typeof value.actor==='string')actor=value.actor;
        invalidate();pending=value.pending?clone(value.pending):null;write();
        message=pending?'Original save restored. Refresh the case to recover its result.':'Complete assumptions reopened. Review them against the selected case before saving.';
      });return;
    }
    const name=target.dataset.economicsSelect;if(!name||busy)return;
    if(name==='assessment'){selectedAssessmentId=target.value;write();changed();return;}
    if(pending)return;
    if(name==='quote'){
      const q=view.quotes.find(row=>row.id===target.value);
      input.quoteId=q?.id||'';input.quoteSha256=q?.sha256||'';
      selectedAssessmentId=view.economics?.latestByQuote?.[input.quoteId]||'';
    }else{const [part,key]=name.split('.');if(['implementation','care'].includes(part)&&key==='costCoverage')input[part][key]=target.value;else return;}
    invalidate();changed();
  };
  root.addEventListener('click',click);root.addEventListener('input',onInput);root.addEventListener('change',change);
  return {connect,clear,render,
    snapshot:()=>({scope:scope&&clone(scope),dirty,pending:pending&&clone(pending),selectedAssessmentId,busy,storageError}),
    destroy(){clear();destroyed=true;retained.clear();root.removeEventListener('click',click);root.removeEventListener('input',onInput);root.removeEventListener('change',change);}
  };
}
