// MIT. Industrial operator intake: original source, complete review and recovery.
export function mountMerchantIntake(host){
  const $=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  let context=null,source=null,current=null,pending=null,legacyOperation=null,page=0,selection=0;
  const fields=['key','reference','title','assetId','amount','invoiceId'];
  const labels={key:'Invoice grouping key',reference:'Reference',title:'Description',assetId:'Configured asset ID',amount:'Amount',invoiceId:'Original invoice UUID (optional)'};
  const key=()=>context?'merchant.invoice-intake.pending.v1.'+context.storeId:null;
  function reset(){context=source=current=pending=legacyOperation=null;page=0;selection++;$('intake-panel').hidden=true;$('intake-rows').replaceChildren();$('intake-list').replaceChildren();$('intake-file').value='';$('intake-review').hidden=true;$('intake-mapping').hidden=true;}
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  function pendingRecord(){
    const raw=sessionStorage.getItem(key());if(!raw)return null;
    if(UUID.test(raw))return {legacyOperation:raw};
    let record;try{record=JSON.parse(raw);}catch{throw Error('The retained pending intake record cannot be read. Preserve this browser session and its original source.');}
    const request=record?.request;
    if(record?.schema!=='stellar-forge.merchant-intake-browser-pending.v1'||!request||
      request.storeId!==context.storeId||request.tenantId!==context.tenantId||!UUID.test(request.operation)||
      typeof request.source?.text!=='string'||!request.mapping||typeof request.configurationSha256!=='string')
      throw Error('The retained pending intake belongs to a different or incomplete source selection.');
    return {request};
  }
  function retainPending(request){
    // The complete original request is durable before its first HTTP mutation.
    // If the browser cannot save it, preparation has not been dispatched.
    sessionStorage.setItem(key(),JSON.stringify({schema:'stellar-forge.merchant-intake-browser-pending.v1',request}));
    pending=request;legacyOperation=null;
  }
  function clearPending(){sessionStorage.removeItem(key());pending=null;legacyOperation=null;}
  function showMapping(columns,mapping){
    const container=$('intake-fields');container.replaceChildren();
    for(const field of fields){
      const label=el('label',labels[field]),select=el('select');select.dataset.field=field;
      select.append(new Option(field==='invoiceId'?'Generate stable invoice IDs':'Select a source column',''));
      for(const column of columns)select.append(new Option(column,column));
      if(mapping)select.value=mapping[field]??'';
      else if(columns.includes(field))select.value=field;
      else if(field==='key'&&columns.includes('reference'))select.value='reference';
      label.append(select);container.append(label);
    }
    if(mapping)$('intake-amount-mode').value=mapping.amountMode;
    $('intake-mapping').hidden=false;
  }
  function restorePending(request){
    pending=request;legacyOperation=null;source=request.source;current=null;page=0;
    const columns=[...new Set(fields.map(field=>request.mapping[field]).filter(Boolean))];
    showMapping(columns,request.mapping);
    $('intake-source-summary').textContent=source.name+' · Original preparation '+request.operation+' retained in this browser session. Retry keeps its exact source and mapping.';
    render();
  }
  function render(){
    $('intake-review').hidden=!current;
    if(!current){controls();return;}
    $('intake-identity').textContent=current.source.name+' · '+current.operation;
    $('intake-summary').textContent=current.counts.invoices+' invoices · '+current.counts.offers+' payment options · '+current.counts.retained+' retained · '+current.counts.pending+' pending · '+current.counts.conflicts+' conflicts';
    $('intake-digest').textContent='Resource version '+current.configuration.template.resourceVersion+' · Reviewed plan '+current.planSha256;
    $('intake-warning').textContent=current.counts.conflicts?
      'An original invoice UUID already has different retained terms. Review the conflicting row and preserve the original invoice.':
      !current.configurationCurrent&&current.state!=='COMPLETE'?
      'The configured resource or payment terms changed after this plan was prepared. Preserve this plan and review a new intake under the current terms.':
      current.state==='COMPLETE'?'All original invoice IDs are retained. Open them in the register to create payment requests when ready.':
      current.interruption?'Creation paused at '+current.interruption.invoiceId+' ('+current.interruption.code+'). Refresh this intake to inspect the original IDs, then resume the reviewed plan.':
      'Review each invoice and its separate payment options. Creating this intake saves invoice drafts.';
    const rows=$('intake-rows');rows.replaceChildren();
    page=Math.min(page,Math.max(0,Math.ceil(current.invoices.length/50)-1));
    for(const invoice of current.invoices.slice(page*50,page*50+50)){
      const row=el('tr'),identity=el('td',invoice.reference);identity.append(el('div',invoice.title),el('small',invoice.id));
      const amounts=el('td');
      for(const offer of invoice.offers){const n=offer.amountAtomic.padStart(offer.decimals+1,'0');
        const value=offer.decimals?n.slice(0,-offer.decimals)+'.'+n.slice(-offer.decimals):n;
        const p=el('p',value+' '+offer.label+' · '+offer.network);
        p.append(el('small',offer.amountAtomic+' atomic · '+offer.assetId),el('small','Recipient '+offer.recipient));amounts.append(p);}
      const state=el('td',invoice.state==='RETAINED'?'Retained · '+invoice.invoiceState:invoice.state);
      state.append(el('small','Source rows '+invoice.sourceRows.join(', ')));
      row.append(identity,amounts,state);rows.append(row);
    }
    $('intake-page').textContent=(page*50+1)+'–'+Math.min((page+1)*50,current.invoices.length)+' of '+current.invoices.length;
    controls();
  }
  function controls(){
    const paused=host.busy()||host.state()?.mode==='review'||host.capturing();
    $('intake-inspect').disabled=paused||!!pending;
    $('intake-format').disabled=paused||!!pending;
    $('intake-list').disabled=host.busy()||!!pending||!!legacyOperation;
    $('intake-prepare').textContent=pending?'Retry original preparation':'Retain and review plan';
    $('intake-prepare').disabled=paused||!source;
    $('intake-run').disabled=paused||!current||current.state==='COMPLETE'||current.counts.conflicts>0||!current.configurationCurrent;
    $('intake-status').disabled=host.busy()||!current;
    $('intake-export').disabled=host.busy()||!current;
    $('intake-previous').disabled=host.busy()||!current||page===0;
    $('intake-next').disabled=host.busy()||!current||(page+1)*50>=current.invoices.length;
    $('intake-mapping').querySelectorAll('select').forEach(n=>n.disabled=paused||!!pending);
    $('intake-file').disabled=paused||!!pending;
  }
  async function open(id){const turn=++selection,owner=context?.storeId,value=await host.api('/api/invoice-intake/'+id);
    if(context?.storeId!==owner||turn!==selection)return;current=value;page=0;render();}
  async function refresh(){
    const identity=host.state()?.source?.storeId;if(!identity)return;
    const result=await host.api('/api/invoice-intake');
    if(host.state()?.source?.storeId!==identity)return;
    context=result.context;
    const list=$('intake-list');list.replaceChildren(new Option('Choose retained intake',''));
    for(const item of result.intakes)list.append(new Option(item.source.name+' · '+item.counts.retained+'/'+item.counts.invoices+' · '+item.operation,item.operation));
    if(current){list.value=current.operation;await open(current.operation);}
    const retained=pendingRecord();
    if(retained){
      const id=retained.request?.operation??retained.legacyOperation;
      try{await open(id);clearPending();}
      catch(error){
        if(error.status!==404)throw error;
        if(retained.request)restorePending(retained.request);
        else{legacyOperation=id;host.notice('Original preparation '+id+' has no retained server plan yet. Select the same original source and mapping; preparation will reuse that operation.');}
      }
    }
    controls();
  }
  function changedSource(){
    if(pending)return;
    source=null;current=null;page=0;$('intake-mapping').hidden=true;render();
  }
  $('intake-file').addEventListener('change',changedSource);
  $('intake-format').addEventListener('change',changedSource);
  $('show-intake').addEventListener('click',()=>host.action(async()=>{$('intake-panel').hidden=false;await refresh();}));
  $('hide-intake').addEventListener('click',()=>{$('intake-panel').hidden=true;});
  $('intake-list').addEventListener('change',()=>host.action(async()=>{const id=$('intake-list').value;if(id){await open(id);pending=null;controls();}}));
  $('intake-inspect').addEventListener('click',()=>host.action(async()=>{
    await refresh();if(pending)throw Error('Retry the retained original preparation before selecting another source.');
    const file=$('intake-file').files[0],format=$('intake-format').value;if(!file)throw Error('Choose the original CSV or JSON source.');
    if(file.size>context.maximumSourceBytes)throw Error('Select a source no larger than 1 MiB.');
    const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());
    const selectedSource={name:file.name,format,text};
    const result=await host.api('/api/invoice-intake/inspect',{method:'POST',body:{source:selectedSource}});
    source=selectedSource;showMapping(result.columns);
    $('intake-source-summary').textContent=source.name+' · '+result.rowCount+' source rows · '+result.bytes+' bytes · SHA256 '+result.sha256;
    pending=null;current=null;page=0;$('intake-mapping').hidden=false;render();
  }));
  $('intake-prepare').addEventListener('click',()=>host.action(async()=>{
    if(!source)throw Error('Inspect an original source first.');
    if(!pending){
      const mapping={amountMode:$('intake-amount-mode').value};
      for(const field of fields){const value=$('intake-fields').querySelector('[data-field="'+field+'"]').value;
        if(field!=='invoiceId'||value)mapping[field]=value;}
      for(const field of fields.filter(field=>field!=='invoiceId'))if(!mapping[field])throw Error('Choose a source column for '+labels[field]+'.');
      retainPending({operation:legacyOperation??crypto.randomUUID(),storeId:context.storeId,tenantId:context.tenantId,
        configurationSha256:context.configurationSha256,source,mapping});
    }
    controls();
    const request=pending,owner=context.storeId;
    try{current=await host.api('/api/invoice-intake',{method:'POST',body:request});}
    catch(error){
      if(context?.storeId!==owner)throw error;
      if(error.status===400||error.status===409){
        // A received validation response can be corrected. First recover a
        // previously committed original plan, if the earlier response was lost.
        try{await open(request.operation);clearPending();render();return;}
        catch(recovery){
          if(recovery.status!==404)throw error;
          if(error.status===400||error.code==='INTAKE_CONFIGURATION_CHANGED'){
            clearPending();await refresh();controls();
          }
        }
      }
      throw error;
    }
    if(context?.storeId!==owner)return;
    clearPending();page=0;render();await refresh();
    host.notice('The complete original source and invoice plan are retained. Review the plan, then create its invoices.');
  }));
  $('intake-run').addEventListener('click',()=>host.action(async()=>{
    if(!current)throw Error('Choose a retained intake.');
    const id=current.operation,planSha256=current.planSha256;
    current=await host.api('/api/invoice-intake/'+id+'/run',{method:'POST',body:{planSha256}});
    render();await host.changed();host.notice(current.state==='COMPLETE'?'All '+current.counts.invoices+' original invoices are retained.':'The intake has '+current.counts.retained+' retained invoices. Review its remaining rows.');
  }));
  $('intake-status').addEventListener('click',()=>host.action(()=>open(current.operation)));
  $('intake-export').addEventListener('click',()=>host.action(async()=>{
    const delivery=await host.api('/api/invoice-intake/'+current.operation+'/export');
    const url=URL.createObjectURL(new Blob([JSON.stringify(delivery,null,2)+'\n'],{type:'application/json'}));
    const link=el('a');link.href=url;link.download='merchant-intake-'+current.operation+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    host.notice('The complete source, reviewed plan and current invoice outcomes are downloaded.');
  }));
  $('intake-previous').addEventListener('click',()=>{if(page>0){page--;render();}});
  $('intake-next').addEventListener('click',()=>{if(current&&(page+1)*50<current.invoices.length){page++;render();}});
  return {reset,refresh,controls};
}
