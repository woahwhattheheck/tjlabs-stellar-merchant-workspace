// MIT. Original receivables desk for scoped customer delivery and reviewed response receiving.
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toISOString().slice(0,10);
const date=value=>{if(!value)return'—';const d=new Date(String(value).slice(0,10)+'T00:00:00Z');return Number.isNaN(d.valueOf())?String(value):new Intl.DateTimeFormat('en',{dateStyle:'medium',timeZone:'UTC'}).format(d);};
const label=value=>String(value??'').replaceAll('_',' ').toLowerCase().replace(/^./,x=>x.toUpperCase());
const btn=(text,action,attrs='')=>'<button type="button" data-action="customer-account-'+action+'" '+attrs+'>'+e(text)+'</button>';
const input=(name,text,value,type='text',attrs='')=>'<label>'+e(text)+'<input name="'+name+'" type="'+type+'" value="'+e(value??'')+'" '+attrs+'></label>';
const select=(name,text,value,rows)=>'<label>'+e(text)+'<select name="'+name+'">'+rows.map(([id,name])=>'<option value="'+e(id)+'"'+(id===value?' selected':'')+'>'+e(name)+'</option>').join('')+'</select></label>';
const check=(name,text,value)=>'<label class="check"><input type="checkbox" name="'+name+'"'+(value?' checked':'')+'>'+e(text)+'</label>';
export function createCustomerAccountResponseUi({api,getState,getAsOf,getCustomer,getSearch,openDialog,closeDialog,mutate,saveBlob,
  readSession,saveSession,setMessage,showError,render,isLocked}){
  const S={list:null,detail:null,selected:'',editor:null,preview:null,load:0,detailLoad:0,editLoad:0,showDrafts:false};
  const methods=['publishCustomerAccount','receiveCustomerResponse','reviewCustomerResponse'];
  const key=()=> 'customer-account-response:'+S.list?.workspaceId+':'+(document.querySelector('#operator')?.value||'');
  const retain=()=>{if(!S.editor)return;const d=S.editor;
    saveSession(d.storageKey,d);const index=readSession(d.storageBase+':drafts',[]);
    if(!index.some(row=>row.key===d.storageKey))index.push({key:d.storageKey,label:d.kind==='decision'?'Response entry review':d.kind==='receive'?'Customer response intake':'Customer account publication',
      responseId:d.responseId??null,entryId:d.value.entryId??null,publicationId:d.value.publicationId??null});
    saveSession(d.storageBase+':drafts',index);
  };
  function useEditor(editor){if(S.editor)retain();S.editLoad++;S.preview=null;
    const base=key();S.editor={...editor,storageBase:editor.storageBase||base,storageKey:editor.storageKey||base+':'+crypto.randomUUID()};
    S.showDrafts=false;retain();}
  function removeDraft(d){if(!d?.storageKey)return;saveSession(d.storageKey,null);
    saveSession(d.storageBase+':drafts',readSession(d.storageBase+':drafts',[]).filter(row=>row.key!==d.storageKey));}
  async function loadList(){
    const generation=++S.load,customerId=getCustomer(),search=getSearch();
    const value=await api.customerAccountResponses({customerId,search});
    if(generation!==S.load||customerId!==getCustomer()||search!==getSearch())return;
    if(S.list?.workspaceId&&S.list.workspaceId!==value.workspaceId){S.detail=null;S.selected='';S.editor=null;S.preview=null;S.detailLoad++;S.editLoad++;}
    S.list=value;
  }
  const identity=()=>({workspaceId:S.list?.workspaceId});
  const customers=()=>getState()?.customers??[];
  function form(){
    const d=S.editor;if(!d)return'';
    let body='';
    if(d.kind==='publication')body=select('customerId','Customer',d.value.customerId,customers().map(row=>[row.id,row.name]))+
      input('asOf','Account date',d.value.asOf,'date','required')+
      '<p>The saved delivery contains this customer’s complete original account and issued documents, plus the offline response desk.</p>';
    else if(d.kind==='receive')body=select('publicationId','Published account',d.value.publicationId,(S.list?.publications??[]).map(row=>[row.id,row.customerName+' · '+date(row.asOf)+' · '+date(row.createdAt)]))+
      '<label>Original customer response JSON<input type="file" id="customer-account-response-file" accept=".json,application/json"></label>'+
      '<p>'+e(d.filename?d.filename+' · original bytes retained in the form':'Choose the original downloaded customer response.')+'</p>'+
      (d.value.responseText?btn('Download retained input','input-download'):'');
    else{
      const entry=d.detail?.response.response.items.find(item=>item.id===d.value.entryId);
      const original=d.detail?.account.invoices.find(row=>row.id===entry?.invoiceId);
      body=btn('Refresh original response for this form','refresh-form')+'<p><strong>'+e(original?.number)+' · '+e(label(entry?.kind))+'</strong></p><pre>'+e(entry?.note)+'</pre>'+
        (entry?.amount?'<p>'+e(original?.currency.code)+' '+e(entry.amount)+(entry.dueDate?' · promised '+e(date(entry.dueDate)):'')+'</p>':'')+
        select('disposition','Reviewed outcome',d.value.disposition,[['RECORD','Record in the original collection case'],['ACKNOWLEDGE','Acknowledge and retain with this response'],['DECLINE','Decline with reason'],['DEFER','Defer for further work']])+
        input('effectiveDate','Effective date',d.value.effectiveDate,'date','required')+
        '<label>Operator reason<textarea name="reason" rows="4" maxlength="6000" required>'+e(d.value.reason)+'</textarea></label>'+
        '<details open><summary>Case assignment and explicit case decisions</summary>'+
        input('owner','Case owner when opening a case',d.value.owner,'text','maxlength="160"')+
        select('priority','New case priority',d.value.priority,['NORMAL','HIGH','URGENT'].map(x=>[x,label(x)]))+
        input('nextActionDate','Next follow-up date',d.value.nextActionDate,'date')+
        check('acknowledgeChanges','I reviewed differences between the customer’s account and the current invoice.',d.value.acknowledgeChanges)+
        check('reopenCase','Reopen the existing closed case for this new promise or dispute.',d.value.reopenCase)+
        check('replaceOpenPromise','Withdraw the current open promise and record this replacement.',d.value.replaceOpenPromise)+
        check('resolveOpenDispute','Resolve the current open dispute and record this new dispute.',d.value.resolveOpenDispute)+'</details>';
    }
    return '<section class="panel"><div class="panel-head"><h2>'+e(d.kind==='publication'?'Publish a customer account':d.kind==='receive'?'Receive a customer response':'Review the customer entry')+'</h2></div><div class="panel-body">'+
      '<form id="customer-account-form">'+body+'<div class="actions"><button type="submit" data-write>Review complete operation</button>'+btn('Keep form for later','park')+'</div></form>'+
      (S.preview?preview(): '')+'</div></section>';
  }
  function preview(){
    const p=S.preview;if(!p)return'';const d=S.editor;
    if(d.kind==='publication')return '<section class="notice"><h3>Complete customer delivery</h3><p>'+e(p.account.customer.name)+' · '+e(date(p.asOf))+' · '+p.account.invoices.length+' invoices</p>'+
      p.account.currencies.map(row=>'<p>'+e(row.currency.code)+' '+e(row.amountDue)+' due · '+e(row.creditBalance)+' credit balance</p>').join('')+
      '<p>'+Object.keys(p.files).length+' original files will be retained in the customer-only delivery.</p>'+btn('Publish reviewed account','save','data-write')+'</section>';
    if(d.kind==='receive')return '<section class="notice"><h3>Original response intake</h3><p>'+e(p.publication.customerName)+' · account '+e(date(p.publication.asOf))+'</p>'+
      '<p>'+e(p.response.author.name)+' · customer response '+e(date(p.response.responseDate))+' · '+p.response.items.length+' entries</p>'+
      '<p>Each received entry remains available for its own current-account review.</p>'+btn(p.existingResponseId?'Retain original response reference':'Receive complete response','save','data-write')+'</section>';
    return '<section class="notice"><h3>Current account review</h3><div class="table-wrap"><table><thead><tr><th>Invoice basis</th><th>Customer account</th><th>Selected effective date</th></tr></thead><tbody>'+
      ['total','paid','credited','amountDue','creditBalance','paymentStatus'].map(field=>'<tr><td>'+e(label(field.replace(/[A-Z]/g,m=>' '+m)))+'</td><td>'+e(p.originalInvoice[field])+'</td><td>'+e(p.currentInvoice[field])+'</td></tr>').join('')+
      '</tbody></table></div><p>'+e(p.currentInvoice.currency.code)+' · '+e(date(p.choice.effectiveDate))+'</p>'+
      (p.collectionCase?'<p>Existing case: '+e(p.collectionCase.title)+' · '+e(p.collectionCase.status)+' · '+e(p.collectionCase.owner)+'</p>':'<p>No original collection case is currently assigned.</p>')+
      (p.collectionCase?.promise?'<p>Recorded promise: '+e(p.collectionCase.promise.amount)+' due '+e(date(p.collectionCase.promise.dueDate))+' · '+e(p.collectionCase.promise.status)+'</p>':'')+
      (p.collectionCase?.dispute?'<p>Recorded dispute: '+e(p.collectionCase.dispute.amount)+' · '+e(p.collectionCase.dispute.status)+'</p>':'')+
      '<p>Outcome: '+e(label(p.choice.disposition))+'</p><pre>'+e(p.choice.reason)+'</pre>'+
      '<ol>'+p.operations.map(op=>'<li>'+e(op.kind==='ACTIVITY'?label(op.value.kind):label(op.kind))+'</li>').join('')+'</ol>'+
      (p.entry.kind==='PAYMENT_NOTICE'?'<p>The customer’s payment information becomes inbound contact. Receive or match actual funds through the original receipt or bank workflow.</p>':'')+
      btn('Save reviewed outcome','save','data-write')+'</section>';
  }
  function renderDesk(){
    const list=S.list;
    if(!list)return'<section class="panel"><div class="panel-body"><h2>Customer accounts and responses</h2><p>Load the existing customer deliveries.</p>'+btn('Load accounts','refresh')+'</div></section>';
    const publications=list.publications.filter(row=>!getCustomer()||row.customerId===getCustomer());
    const responses=list.responses.filter(row=>!getCustomer()||row.customerId===getCustomer());
    return '<section class="panel"><div class="panel-head"><h2>Customer accounts and responses</h2><div>'+btn('Publish account','new','data-write')+' '+btn('Receive response','receive','data-write')+' '+btn('Resume retained form','resume')+'</div></div>'+
      '<div class="panel-body"><p>Publish the original dated customer account, receive its full response and review chosen entries against the current ledger.</p></div>'+
      '<div class="table-wrap"><table><thead><tr><th>Customer account</th><th>As of</th><th>Invoices</th><th>Saved</th><th>Delivery</th></tr></thead><tbody>'+
      publications.map(row=>'<tr><td>'+e(row.customerName)+'</td><td>'+e(date(row.asOf))+'</td><td>'+row.invoices+'</td><td>'+e(date(row.createdAt))+'</td><td>'+
        btn('Complete customer account','account-file','data-id="'+e(row.id)+'" data-name="account.tar"')+'</td></tr>').join('')+'</tbody></table></div>'+
      '<div class="panel-head"><h3>Received responses</h3></div><div class="table-wrap"><table><thead><tr><th>Customer / author</th><th>Response date</th><th>Review</th><th></th></tr></thead><tbody>'+
      responses.map(row=>'<tr><td>'+e(row.customerName)+'<br><small>'+e(row.author.name)+'</small></td><td>'+e(date(row.responseDate))+'</td><td>'+row.completed+' of '+row.items+' reviewed</td><td>'+
        btn('Open response','open','data-id="'+e(row.id)+'"')+'</td></tr>').join('')+'</tbody></table></div></section>'+(S.showDrafts?'<section class="panel"><div class="panel-body"><h3>Retained forms for this operator</h3>'+readSession(key()+':drafts',[]).map(row=>'<p>'+btn(row.label,'resume-form','data-key="'+e(row.key)+'"')+'</p>').join('')+'</div></section>':'')+detail()+form();
  }
  function detail(){
    if(!S.detail)return'';const d=S.detail,r=d.response;
    return '<section class="panel"><div class="panel-head"><h2>'+e(d.account.customer.name)+' · customer response</h2><div>'+
      btn('Complete operator archive','response-file','data-id="'+e(r.id)+'" data-name="response.tar"')+' '+
      btn('Original received JSON','response-file','data-id="'+e(r.id)+'" data-name="received-response.json"')+'</div></div>'+
      '<div class="panel-body"><p>'+e(r.response.author.name)+' · '+e(r.response.author.reference)+' · '+e(date(r.response.responseDate))+'</p></div>'+
      '<div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer entry</th><th>Saved decisions</th><th></th></tr></thead><tbody>'+
      r.response.items.map(entry=>{const invoice=d.account.invoices.find(row=>row.id===entry.invoiceId),decisions=r.decisions.filter(row=>row.entryId===entry.id),done=decisions.some(row=>row.disposition!=='DEFER');
      return'<tr><td>'+e(invoice.number)+'</td><td>'+e(label(entry.kind))+'<p>'+e(entry.note)+'</p>'+
        (entry.amount?e(invoice.currency.code+' '+entry.amount):'')+(entry.dueDate?'<p>Promised '+e(date(entry.dueDate))+'</p>':'')+
        (entry.paymentReference?'<p>Reported payment '+e(date(entry.paymentDate))+' · '+e(entry.paymentReference)+'</p>':'')+
        '</td><td>'+decisions.map(row=>'<p>'+e(label(row.disposition))+' · '+e(date(row.effectiveDate))+'</p><p>'+e(row.reason)+'</p>').join('')+'</td><td>'+
        (done?'Reviewed':btn('Review entry','entry','data-id="'+e(entry.id)+'" data-write'))+'</td></tr>';}).join('')+'</tbody></table></div></section>';
  }
  async function open(id){
    const generation=++S.detailLoad,workspaceId=S.list?.workspaceId;S.selected=id;
    const value=await api.customerResponse(id);
    if(generation!==S.detailLoad||S.selected!==id||workspaceId!==S.list?.workspaceId)return;
    S.detail=value;render();
  }
  function capture(target){
    if(target?.id==='operator'){retain();S.editor=null;S.preview=null;S.editLoad++;return;}
    const form=target?.closest?.('#customer-account-form');if(!form||!S.editor)return;
    for(const [name,value]of new FormData(form))if(name!=='responseFile')S.editor.value[name]=value;
    for(const name of ['acknowledgeChanges','reopenCase','replaceOpenPromise','resolveOpenDispute'])
      if(form.elements[name])S.editor.value[name]=form.elements[name].checked;
    S.preview=null;S.editLoad++;retain();
    const previous=form.parentElement.querySelector('.notice');if(previous)previous.remove();
  }
  async function change(target){
    if(target.id!=='customer-account-response-file'){capture(target);return;}
    const file=target.files?.[0],editor=S.editor,generation=++S.editLoad;if(!file||editor?.kind!=='receive')return;
    if(file.size>1_500_000)throw Error('Choose the complete response JSON up to1.5 MB.');
    const text=await file.text();if(editor!==S.editor||generation!==S.editLoad)return;
    const parsed=JSON.parse(text);editor.value.responseText=text;editor.filename=file.name;S.preview=null;
    if(S.list.publications.some(row=>row.id===parsed.account?.publicationId))editor.value.publicationId=parsed.account.publicationId;
    retain();render();
  }
  async function submit(formNode){
    if(formNode.id!=='customer-account-form')return false;
    if(isLocked())throw Error('Finish the retained accounting operation before reviewing another.');
    capture(formNode.elements[0]);const editor=S.editor,generation=++S.editLoad,value={...editor.value,...identity()};
    let p;
    if(editor.kind==='publication')p=await api.previewCustomerAccount(value);
    else if(editor.kind==='receive')p=await api.previewCustomerResponse(value);
    else p=await api.previewCustomerResponseReview(editor.responseId,value);
    if(editor!==S.editor||generation!==S.editLoad)return true;
    S.preview=p;render();return true;
  }
  async function click(button){
    const action=button.dataset.action;if(!action?.startsWith('customer-account-'))return false;
    const command=action.slice('customer-account-'.length);
    if(['new','receive','entry','save','resume','resume-form'].includes(command)&&isLocked())throw Error('Finish the retained accounting operation before starting another.');
    if(command==='refresh'){await loadList();render();}
    else if(command==='refresh-form'){
      const editor=S.editor,generation=++S.editLoad;if(editor?.kind!=='decision')throw Error('Open a retained response-entry form.');
      const value=await api.customerResponse(editor.responseId);if(editor!==S.editor||generation!==S.editLoad)return true;
      editor.detail=structuredClone(value);editor.value.expectedVersion=value.response.version;S.preview=null;retain();render();
      setMessage('Original response refreshed. Review the current account and retained choices again before saving.');
    }
    else if(command==='new'){
      if(S.editor)retain();
      useEditor({kind:'publication',value:{publicationId:crypto.randomUUID(),customerId:getCustomer()||customers()[0]?.id||'',asOf:getAsOf()||today()}});render();
    }else if(command==='receive'){
      if(S.editor)retain();
      useEditor({kind:'receive',value:{publicationId:S.list.publications.find(row=>!getCustomer()||row.customerId===getCustomer())?.id||'',responseText:''}});render();
    }else if(command==='resume'){
      S.showDrafts=true;render();
    }else if(command==='resume-form'){
      const index=readSession(key()+':drafts',[]);if(!index.some(row=>row.key===button.dataset.key))throw Error('Choose a retained form for the current operator and workspace.');
      const retained=readSession(button.dataset.key);if(!retained)throw Error('That retained form is unavailable.');useEditor(retained);render();
    }else if(command==='park'){retain();S.editor=null;S.preview=null;S.editLoad++;render();}
    else if(command==='open'){retain();S.editor=null;S.preview=null;S.editLoad++;await open(button.dataset.id);}
    else if(command==='entry'){
      if(!S.detail)throw Error('Open the original response first.');
      useEditor({kind:'decision',responseId:S.detail.response.id,detail:structuredClone(S.detail),value:{entryId:button.dataset.id,expectedVersion:S.detail.response.version,
        disposition:'ACKNOWLEDGE',effectiveDate:today(),reason:'',owner:document.querySelector('#operator')?.value||'',
        priority:'NORMAL',nextActionDate:today(),acknowledgeChanges:false,reopenCase:false,replaceOpenPromise:false,resolveOpenDispute:false}});render();
    }else if(command==='save'){
      const p=S.preview,d=S.editor;if(!p||!d)throw Error('Review the complete current operation before saving.');
      const value={...d.value,...identity(),reviewSha256:p.reviewSha256};
      if(d.kind==='publication')await mutate('publishCustomerAccount',[value],'Publish customer account',{revision:p.revision});
      else if(d.kind==='receive')await mutate('receiveCustomerResponse',[value],'Receive customer response',{revision:p.revision});
      else await mutate('reviewCustomerResponse',[d.responseId,value],'Save customer response review',{revision:p.revision});
    }else if(command==='account-file'||command==='response-file'){
      const response=command==='account-file'?await api.customerAccountFile(button.dataset.id,button.dataset.name):await api.customerResponseFile(button.dataset.id,button.dataset.name);
      saveBlob(await response.blob(),button.dataset.name);
    }else if(command==='input-download')saveBlob(new Blob([S.editor.value.responseText],{type:'application/json'}),S.editor.filename||'received-response.json');
    return true;
  }
  async function afterMutation(result,operation){
    if(!methods.includes(operation.method))return;
    const args=operation.args,request=args.at(-1),base=key();
    for(const draft of readSession(base+':drafts',[])){
      const saved=readSession(draft.key);if(!saved)continue;
      const matches=operation.method==='publishCustomerAccount'?saved.kind==='publication'&&saved.value.publicationId===request.publicationId:
        operation.method==='receiveCustomerResponse'?saved.kind==='receive'&&saved.value.responseText===request.responseText:
        saved.kind==='decision'&&saved.responseId===args[0]&&saved.value.entryId===request.entryId;
      if(matches)removeDraft(saved);
    }
    S.editor=null;S.preview=null;S.editLoad++;await loadList();
    if(result.customerResponse?.id)await open(result.customerResponse.id);
    render();
  }
  return{methods,loadList,render:renderDesk,click,submit,input:capture,change,afterMutation};
}
