// Staff finance forms over the existing ROZO session and original request journal.
export function createFinanceDesk(h){
  const {el,field,check,input,button,card,table,json,notify,api,command,download}=h;
  let generation=0,view='intake',model=null;
  const enc=encodeURIComponent,post=(path,value)=>api('/api/finance/'+path,{method:'POST',value});
  const read=value=>post('read',value);
  const actor=()=>h.actor();
  const amount=m=>m?.amount?String(m.amount.units??'Unmeasured')+' native units · '+(m.amount.asset?.tokenSymbol??m.amount.asset?.tokenAddress??'asset'):'Unmeasured';
  const reveal=(label,value)=>el('details',{},[el('summary',{text:label}),json(value)]);
  const title=(value,note)=>el('div',{},[el('strong',{text:value}),note?el('small',{class:'mono',text:note}):null]);
  const no=(message)=>el('p',{class:'muted',text:message});
  const select=(label,name,choices,value='')=>field(label,name,value,{choices:[['','Choose…'],...choices],required:true});
  const submitButton=label=>el('button',{type:'submit',text:label});
  function dialog(name,body){const token=h.showDialog(name,body);return ()=>h.dialogCurrent(token);}
  function form(name,body,save,label='Save reviewed operation'){
    const f=el('form',{},[body,el('div',{class:'form-actions'},submitButton(label))]),valid=dialog(name,f);
    f.onsubmit=async e=>{e.preventDefault();if(!valid())return;const b=e.submitter;b.disabled=true;
      try{const result=await save(f);if(result?.state!=='pending'&&valid())h.closeDialog();}
      catch(error){notify(error.message,true);}finally{if(valid())b.disabled=false;}};
    return f;
  }
  const revision=()=>h.context().state.workspace.revision;
  const nativeA=()=>model.accounting.finance.revision,nativeB=()=>model.buyer.state.revision;
  const bindingA=()=>model.accounting.binding,bindingB=()=>model.buyer.binding;
  function merchant(commandName,payload,rev=nativeA(),rozo=revision()){return command('finance.accounting.mutate',{binding:bindingA(),nativeRevision:rev,command:commandName,payload},rozo);}
  function buyer(path,payload,rev=nativeB(),rozo=revision()){return command('finance.buyer.mutate',{binding:bindingB(),nativeRevision:rev,path,payload},rozo);}
  async function file(value){const result=await post('file',value);await download(result.path,result);return result;}
  async function outcome(result){
    if(result.state==='pending')return;
    const row=result.result;
    if(row?.originalResult){const value=await api('/api/objects/'+row.originalResult.sha256);return value;}
    return row;
  }
  function render(){
    const root=el('div',{'data-finance-desk':'true'},no('Reading configured Accounting and Buyer workspaces…'));
    const current=++generation,context=h.context();
    api('/api/finance/state').then(value=>{
      if(current!==generation||!root.isConnected||h.context().state.workspace.workspaceId!==context.state.workspace.workspaceId)return;
      model=value;paint(root);
    }).catch(error=>{if(current===generation&&root.isConnected)root.replaceChildren(card('Finance workspace',no(error.message)));});
    return root;
  }
  function paint(root){
    const pages={intake:intakePage,merchant:merchantPage,buyer:buyerPage,accountant:accountantPage,deliveries:deliveryPage};
    const nav=el('div',{class:'toolbar','aria-label':'Finance views'},[['intake','Report intake'],['merchant','Merchant accounting'],['buyer','Buyer expenses'],['accountant','Accountant'],['deliveries','Financial handover']].map(([key,label])=>button(label,()=>{view=key;generation++;h.closeDialog();paint(root);},view===key?'':'secondary',{'data-finance-view':key})));
    root.replaceChildren(el('p',{class:'title-note',text:'Use the original saved report, review its native financial movements, and issue complete accounting records. Provider evidence, merchant receipts, fees, settlement transfers and explicitly selected purchases keep their original identities.'}),nav,pages[view]());
  }
  function intakePage(){
    const reports=h.context().state.reports??[],controls=el('div',{class:'actions'});
    if(model.accounting?.finance)controls.append(button('Preview merchant report',()=>intake('accounting'),''));
    if(model.buyer)controls.append(button('Select buyer purchases',()=>intake('buyer'),'secondary'));
    return el('div',{},[card('Saved report intake',[no(reports.length?'Choose a frozen report from the selected ROZO profile.':'Select a merchant profile and save a report in Reports first.'),controls,
      table(['Report','Period','Original source'],reports.map(r=>[r.title,r.period.from+' → '+r.period.to,title(r.id,r.sha256)]))]),
      card('Configured original owners',table(['Capability','Alias','Original workspace'],[
        ['Merchant accounting',model.accounting?.finance?model.accounting.binding.alias:'Not selected for merchant accounting',model.accounting?.finance?model.accounting.binding.workspaceId:'—'],
        ['Buyer expenses',model.buyer?.binding.alias??'Not configured',model.buyer?.binding.workspaceId??'—'],
        ['Accountant',model.accounting?.binding.alias??'Not configured',model.accounting?.binding.workspaceId??'—']
      ])),...pendingSources()]);
  }
  function pendingSources(){
    const rows=[];
    for(const c of model.accounting?.finance?.captures??[])if(c.status==='PENDING')rows.push(['Merchant',c.name,c.reportId,button('Review source',()=>reviewMerchant(c))]);
    for(const source of model.buyer?.state.sources??[])for(const id of source.pending??[])rows.push(['Buyer',source.name,id,button('Review source',()=>reviewBuyer(id))]);
    return rows.length?[card('Source editions awaiting review',table(['Owner','Source','Edition',''],rows))]:[];
  }
  async function intake(kind){
    const reports=h.context().state.reports,rozo=revision(),owner=kind==='buyer'?bindingB():bindingA(),ownerActor=actor();
    const f=el('form'),area=el('div'),reportSelect=select('Saved report','report',reports.map(r=>[r.id,r.title]));
    f.append(el('div',{class:'form-grid'},[reportSelect,field('Source name','name','ROZO saved report',{required:true}),
      field('Source provenance','provenance','Original saved ROZO merchant report',{required:true,wide:true}),
      field('Data context','dataContext','development',{choices:['development','operational']})]),area);
    const current=dialog(kind==='buyer'?'Choose original buyer purchases':'Review original merchant report',f);
    let source=null,load=0,preview=null,purchases=[];
    const invalidate=()=>{preview=null;load++;area.querySelector('[data-preview-result]')?.remove();};
    f.addEventListener('input',invalidate);
    reportSelect.querySelector('select').onchange=async()=>{
      const serial=++load;source=null;purchases=[];preview=null;area.replaceChildren(no('Reading the original report…'));
      try{
        const r=reports.find(v=>v.id===input(f,'report'));if(!r){area.replaceChildren();return;}
        const selected={reportId:r.id,reportVersion:r.version,expectedReportSha256:r.sha256};
        const value=await post('report',selected);if(!current()||serial!==load)return;source={selected,value};
        const movements=value.movements.filter(m=>kind!=='buyer'||m.kind==='source_payment');
        const rows=movements.map(m=>{
          const checkbox=check('Include purchase','purchase-'+m.id);
          const owner=field('Purchase owner','owner-'+m.id,'',{required:false}),reference=field('Purchase reference','reference-'+m.id,'');
          const reason=field('Selection reason','reason-'+m.id,'');
          if(kind==='buyer')purchases.push({movement:m,checkbox,owner,reference,reason});
          return [title(m.paymentId,m.kind),amount(m),title(m.providerStatus,m.sourceDay??'No original provider date'),
            kind==='buyer'?el('div',{},[checkbox,owner,reference,reason]):title(m.evidenceClass,m.basisSha256)];
        });
        area.replaceChildren(no(kind==='buyer'?'Select only purchases owned by this buyer. An empty selection retains reference evidence without creating expenses.':'The original source payment, fee and destination payout remain separate.'),
          table(['Payment / movement','Exact amount','Provider / date',kind==='buyer'?'Explicit ownership':'Evidence'],rows),
          button('Preview original intake',async()=>{
            if(!source||!current())return;
            const inputValue={name:input(f,'name'),provenance:input(f,'provenance'),dataContext:input(f,'dataContext')};
            if(kind==='buyer')inputValue.selection={schema:'stellar-forge.rozo-buyer-selection.v1',sourceId:value.sourceId,
              purchases:purchases.filter(p=>p.checkbox.querySelector('input').checked).map(p=>({
                movementId:p.movement.id,basisSha256:p.movement.basisSha256,
                purchaseOwner:p.owner.querySelector('input').value,purchaseReference:p.reference.querySelector('input').value,reason:p.reason.querySelector('input').value}))};
            const captured=JSON.stringify({report:source.selected,input:inputValue}),serial=++load;
            const result=await post('preview',{kind,binding:owner,report:source.selected,input:inputValue,actor:ownerActor});
            if(!current()||serial!==load)return;
            preview={result,input:inputValue,report:source.selected,captured};
            area.querySelector('[data-preview-result]')?.remove();
            const panel=el('div',{'data-preview-result':'true'},[reveal('Original intake preview',result),button('Retain reviewed source',async()=>{
              if(!preview||!current())throw Error('Preview the current source selection first.');
              if(actor()!==ownerActor)throw Error('The operator changed. Reopen and preview this source with the intended operator.');
              const v=preview;const hash=kind==='buyer'?v.result.preview.preview_sha256:v.result.preview.previewSha256;
              await command(kind==='buyer'?'finance.buyer.capture':'finance.accounting.capture',{
                binding:owner,report:v.report,input:{...v.input,previewSha256:hash},
                nativeRevision:kind==='buyer'?v.result.revision:v.result.preview.revision},rozo);
              if(current())h.closeDialog();
            },'')]);area.append(panel);
          },''));
      }catch(error){if(current()&&serial===load)area.replaceChildren(no(error.message));}
    };
    f.onsubmit=e=>e.preventDefault();
  }
  function reviewMerchant(c){
    const rev=nativeA(),r=revision();
    form('Review merchant source edition',[title(c.name,c.reportId),field('Decision','decision','accept',{choices:[['accept','Accept source'],['reject','Reject source']]}),
      field('Review reason','reason','',{required:true,wide:true,type:'textarea'})],
      f=>merchant('source.review',{captureId:c.id,decision:input(f,'decision'),reason:input(f,'reason')},rev,r),'Save source review');
  }
  async function reviewBuyer(id){
    const rev=nativeB(),r=revision(),binding=bindingB(),body=el('div',{},no('Reading original capture…')),current=dialog('Review buyer source',body);
    const c=await read({target:'buyer',binding,path:'/api/captures/'+enc(id)});if(!current())return;
    form('Review buyer source edition',[reveal('Original source changes',c),field('Decision','decision','ACCEPT',{choices:[['ACCEPT','Accept source'],['REJECT','Reject source']]}),
      field('Review reason','reason','',{required:true,type:'textarea'})],f=>buyer('/api/captures/'+enc(id)+'/decision',{decision:input(f,'decision'),reason:input(f,'reason'),operator:actor()},rev,r),'Save source review');
  }
  function merchantPage(){
    const a=model.accounting?.finance;if(!a)return card('Merchant accounting',no('Select an original merchant-mode Accounting owner to recognize merchant payments, fees and settlement transfers.'));
    const rows=a.rows;
    return el('div',{},[...pendingSources(),card('Native financial movements',[
      table(['Movement','Exact native amount','Provider evidence','Coding / issued period',''],rows.map(row=>[
        title(row.movement.paymentId,row.movement.kind),amount(row.movement),title(row.movement.evidenceClass,row.movement.sourceDay??'Date missing'),
        title(row.missing?'Absent from current report':row.codingCurrent?'Current coding':row.coding?'Coding needs review':'Uncoded',
          row.closedPeriods.map(c=>typeof c==='string'?c:c.id).join(', ')),
        el('div',{class:'actions'},[button('Inspect history',()=>dialog('Original movement and coding history',json(row)),'ghost'),
          button('Code',()=>codeMerchant(row),'secondary',{'data-finance-code':row.movement.id,disabled:row.missing||!row.movement.providerConfirmed||!row.movement.amountObserved||row.closedPeriods.length>0}),
          button('Period disposition',()=>merchantDisposition(row),'ghost',{disabled:row.closedPeriods.length>0})])])),
      no('Amounts use exact native units. Merchant receipts, provider fees and destination settlement transfers are not combined into a net purchase.')
    ]),card('Recorded accounting periods',[
      table(['Period','Edition / date bounds',''],a.periods.definitions.map(period=>{
        const version=period.versions.at(-1);return [version.name,title('Version '+version.version,version.from+' → '+version.until),
          el('div',{class:'actions'},[button('Review / close',()=>reviewPeriod(period,version)),button('Edit following definition',()=>editMerchantPeriod(period),'ghost')])];})),
      button('Create period definition',()=>editMerchantPeriod(),'secondary')]),
      card('Retained merchant reviews',table(['Review','State','Context',''],a.reviews.map(review=>[review.id,review.state,review.contextSha256,
        review.state==='READY'?button('Issue reviewed period',()=>closeMerchant(review),'secondary'):button('Inspect findings',()=>dialog('Original period review',json(review)),'ghost')]))),
      card('Issued merchant periods',table(['Period','Edition / state','Original source',''],a.closes.map(c=>[
        c.period.name,title('Edition '+c.sequence,c.status),title(c.sha256,String(c.bytes)+' bytes'),
        el('div',{class:'actions'},[button('Download original close',()=>file({target:'accounting-close',binding:bindingA(),id:c.id}),'ghost'),
          button('Create accountant handoff',()=>createAccountant('accounting',c),'secondary',{disabled:c.status!=='CLOSED'}),
          button('Reopen for correction',()=>reopenMerchant(c),'ghost',{disabled:c.status!=='CLOSED'})])])))]);
  }
  function allocationsEditor(values,{buyerMode=false,centers=[]}={}){
    const box=el('div'),rows=[];
    function add(value={}){
      const row=el('div',{class:'form-grid finance-allocation'});
      row.append(field('Exact native units','amount',value.amount??'',{required:true,inputMode:'numeric',pattern:'(?:0|[1-9][0-9]*)'}),
        buyerMode?select('Cost center','center_id',centers.filter(c=>c.active).map(c=>[c.id,c.code+' · '+c.name]),value.center_id):
          field('Account code','accountCode',value.accountCode??'',{required:true}),
        buyerMode?field('Account code','account_code',value.account_code??''):field('Cost center','costCenter',value.costCenter??''),
        field('Project','project',value.project??''),field('Memo','memo',value.memo??''),
        button('Remove allocation',()=>{row.remove();rows.splice(rows.indexOf(row),1);},'ghost'));
      rows.push(row);box.append(row);
    }
    for(const value of values)add(value);
    return {node:el('div',{},[box,button('Add allocation line',()=>add(),'secondary')]),value:()=>{
      if(!rows.length)throw Error('Retain at least one allocation.');
      return rows.map(row=>{const q=name=>row.querySelector('[name="'+name+'"]').value;
        const amount=q('amount');if(!/^(?:0|[1-9][0-9]*)$/.test(amount))throw Error('Use exact whole native units.');
        return buyerMode?{amount,center_id:q('center_id'),account_code:q('account_code'),project:q('project'),memo:q('memo')}:
          {amount,accountCode:q('accountCode'),costCenter:q('costCenter'),project:q('project'),memo:q('memo')};});
    }};
  }
  function codeMerchant(row){
    const m=row.movement,rev=nativeA(),r=revision(),editor=allocationsEditor(row.coding?.allocations??[{amount:m.amount.units}]);
    form('Code '+m.kind,[title(m.paymentId,amount(m)),field('Recognition date','recognitionDate',row.coding?.recognitionDate??m.sourceDay??'',{type:'date',required:true}),
      editor.node,field('Coding reason','reason',row.coding?.reason??'',{required:true,type:'textarea'}),
      check('I reviewed this original provider evidence and its separately retained contract evidence.','evidence')],
      f=>{if(!f.elements.evidence.checked)throw Error('Acknowledge the original evidence before saving.');
        return merchant('coding.save',{movementId:m.id,basisSha256:m.basisSha256,expectedVersion:row.coding?.version??0,
          recognitionDate:input(f,'recognitionDate'),reason:input(f,'reason'),providerEvidenceAcknowledged:true,allocations:editor.value()},rev,r);});
  }
  function merchantPeriods(){return model.accounting.finance.periods.definitions.map(p=>{const v=p.versions.at(-1);return [p.id+':'+v.version,v.name+' · version '+v.version];});}
  function merchantDisposition(row){
    const rev=nativeA(),r=revision();
    form('Record period exception decision',[select('Original period','period',merchantPeriods()),
      field('Decision','kind','carry_forward',{choices:[['carry_forward','Carry forward'],['exclude_from_period','Exclude from this period']]}),
      field('Reason','reason','',{required:true,type:'textarea'}),reveal('Original movement',row)],f=>{
        const [id,version]=input(f,'period').split(':');return merchant('disposition.save',{period:{id,version:Number(version)},
          movementId:row.movement.id,basisSha256:row.movement.basisSha256,missing:row.missing,kind:input(f,'kind'),reason:input(f,'reason')},rev,r);
      });
  }
  function editMerchantPeriod(period){
    const old=period?.versions.at(-1),rev=nativeA(),r=revision();
    form('Native recorded period definition',[field('Name','name',old?.name??'',{required:true}),
      field('UTC start (inclusive)','from',old?.from??'',{required:true,hint:'Full ISO timestamp, for example 2026-10-01T00:00:00.000Z'}),
      field('UTC end (exclusive)','until',old?.until??'',{required:true}),
      field('Definition note','note',old?.note??'',{type:'textarea'})],f=>command('finance.accounting.period',{
        binding:bindingA(),nativeRevision:rev,period:{...(period?{id:period.id,expectedVersion:old.version}:{}),
          name:input(f,'name'),from:input(f,'from'),until:input(f,'until'),note:input(f,'note'),select:true}},r));
  }
  function reviewPeriod(period,version){
    const a=model.accounting.finance,rozo=revision(),native=a.revision,f=el('form'),selection=el('div'),panel=el('div');
    for(const source of a.sources)selection.append(check(source.name??source.id,'source-'+source.id,false));
    f.append(no('Select every original source included in this period.'),selection,
      field('Data context','dataContext','development',{choices:['development','operational']}),field('Review note','note','',{required:true,type:'textarea'}),panel);
    const current=dialog('Review '+version.name,f);let preview=null,serial=0;
    f.addEventListener('input',()=>{preview=null;serial++;panel.replaceChildren();});
    f.append(button('Preview native period',async()=>{
      const sources=a.sources.filter(s=>f.elements['source-'+s.id].checked).map(s=>s.id);
      const selected={period:{id:period.id,version:version.version},sourceIds:sources,dataContext:input(f,'dataContext')},at=++serial;
      const result=await post('period-preview',{binding:bindingA(),...selected});if(!current()||at!==serial)return;
      preview={result,selected};panel.replaceChildren(table(['Ready','Unresolved movements'],[[String(result.ready),String(result.unresolved)]]),
        reveal('Original selected totals and findings',result),button('Retain this review',async()=>{
          if(!preview)throw Error('Preview the current period first.');
          if(!input(f,'note').trim())throw Error('Add the review note.');
          const saved=await merchant('period.review',{...preview.selected,contextSha256:preview.result.contextSha256,note:input(f,'note')},native,rozo);
          if(current())h.closeDialog();const full=await outcome(saved);
          if(full?.review?.state==='READY'){model=await api('/api/finance/state');closeMerchant(full.review);}
        },''));
    },''));f.onsubmit=e=>e.preventDefault();
  }
  function closeMerchant(review){
    const rev=nativeA(),r=revision();
    form('Issue reviewed merchant period',[title(review.state,review.contextSha256),field('Close note','note','',{required:true,type:'textarea'})],
      f=>merchant('period.close',{reviewId:review.id,contextSha256:review.contextSha256,note:input(f,'note')},rev,r),'Issue original period');
  }
  function reopenMerchant(c){const rev=nativeA(),r=revision();form('Reopen merchant period',[field('Reopening reason','reason','',{required:true,type:'textarea'})],
    f=>merchant('period.reopen',{closeId:c.id,reason:input(f,'reason')},rev,r),'Retain reopening');}
  function buyerPage(){
    if(!model.buyer)return card('Buyer expenses',no('Select the existing configured Buyer workspace to recognize explicitly owned purchases.'));
    const b=model.buyer,s=b.state;
    return el('div',{},[...pendingSources(),card('Original buyer purchases',[expenseTable(b.expenses.items),
      b.expenses.next!==null&&b.expenses.next!==undefined?button('Read next expense page',()=>buyerExpensePage(b.expenses.next)):null]),
      card('Native cost centers',[table(['Code','Name','State',''],s.centers.map(c=>[c.code,c.name,c.active?'Active':'Inactive',button('Edit',()=>editCenter(c),'ghost')])),
        button('Create cost center',()=>editCenter(),'secondary')]),
      card('Original asset labels',[no('Display labels preserve the original network, asset address and precision.'),button('Review asset labels',()=>editLabels(),'secondary')]),
      card('Native buyer periods',[table(['Period','Recognition dates','State',''],s.periods.map(p=>[
        p.name,p.from_day+' → '+p.through_day,p.state,el('div',{class:'actions'},[button('Review / close',()=>buyerPeriod(p),'secondary'),
          button('History',()=>buyerHistory(p),'ghost'),button(p.state==='CLOSED'?'Reopen':'Edit',()=>p.state==='CLOSED'?reopenBuyer(p):editBuyerPeriod(p),'ghost'),
          p.latest_close?button('Accountant handoff',()=>createBuyerAccountant(p.latest_close),'ghost'):null])])),
        button('Create expense period',()=>editBuyerPeriod(),'secondary')])]);
  }
  function expenseTable(items){return table(['Purchase','Native units / state','Coding',''],items.map(item=>[
    title(item.row.request_id,item.source_name),title(String(item.row.settled_base_units??'Unresolved'),item.row.state),
    item.status,el('div',{class:'actions'},[button('Inspect original',()=>inspectBuyerItem(item.id),'ghost'),
      button('Code purchase',()=>codeBuyer(item),'secondary',{disabled:item.missing||item.row.state!=='settled'})])]));}
  async function buyerExpensePage(offset){
    const body=el('div',{},no('Reading original expenses…')),current=dialog('Buyer expenses',body);
    const result=await read({target:'buyer',binding:bindingB(),path:'/api/expenses?offset='+offset+'&limit=100'});if(!current())return;
    body.replaceChildren(expenseTable(result.items),result.next!==null?button('Next page',()=>buyerExpensePage(result.next)):null);
  }
  async function inspectBuyerItem(id){const body=el('div',{},no('Reading immutable coding editions…')),current=dialog('Original buyer purchase',body);
    const item=await read({target:'buyer',binding:bindingB(),path:'/api/items/'+enc(id)});if(current())body.replaceChildren(json(item));}
  function codeBuyer(item){
    const rev=nativeB(),r=revision(),c=item.coding,editor=allocationsEditor(c?.allocations??[{amount:String(item.row.settled_base_units)}],{buyerMode:true,centers:model.buyer.state.centers});
    form('Code original buyer purchase',[title(item.row.request_id,item.source_name),
      field('Recognition date','recognition_date',c?.recognition_date??item.row.finalized_at?.slice(0,10)??'',{type:'date',required:true}),editor.node,
      field('Memo','memo',c?.memo??'',{type:'textarea'})],f=>buyer('/api/items/'+enc(item.id)+'/coding',{basis:item.basis,
        recognition_date:input(f,'recognition_date'),memo:input(f,'memo'),operator:actor(),allocations:editor.value()},rev,r));
  }
  function editCenter(c){const rev=nativeB(),r=revision();form('Native cost center',[
    field('Code','code',c?.code??'',{required:true}),field('Name','name',c?.name??'',{required:true}),check('Active','active',c?.active??true)],
    f=>buyer('/api/centers',{...(c?{id:c.id}:{}),code:input(f,'code'),name:input(f,'name'),active:f.elements.active.checked},rev,r));}
  function editLabels(){
    const rev=nativeB(),r=revision(),rows=[],seen=new Set(),all=[...(model.buyer.state.labels??[])];
    for(const item of model.buyer.expenses.items){const asset=item.row.native_detail?.rozo_asset;if(asset&&!all.some(x=>x.network===item.row.network&&x.asset===item.row.asset))
      all.push({network:item.row.network,asset:item.row.asset,symbol:asset.tokenSymbol,decimals:asset.decimals});}
    const fields=all.filter(a=>{const key=a.network+'\n'+a.asset;if(seen.has(key))return false;seen.add(key);return true;}).map(a=>{
      const f=field('Display symbol','symbol',a.symbol,{required:true}),precision=field('Native precision','decimals',String(a.decimals),{required:true,readOnly:a.network.startsWith('rozo:')});
      rows.push({a,f,precision});return el('div',{class:'form-grid'},[title(a.network,a.asset),f,precision]);});
    form('Review complete original asset-label set',fields,()=>buyer('/api/labels',{assets:rows.map(({a,f,precision})=>{
      const d=precision.querySelector('input').value;if(!/^\d+$/.test(d))throw Error('Use whole asset precision.');
      return {...a,symbol:f.querySelector('input').value,decimals:Number(d)};})},rev,r));
  }
  function editBuyerPeriod(p){const rev=nativeB(),r=revision();form('Native buyer period',[
    field('Name','name',p?.name??'',{required:true}),field('First recognition day','from_day',p?.from_day??'',{type:'date',required:true}),
    field('Last recognition day (inclusive)','through_day',p?.through_day??'',{type:'date',required:true})],
    f=>buyer('/api/periods',{...(p?{id:p.id}:{}),name:input(f,'name'),from_day:input(f,'from_day'),through_day:input(f,'through_day')},rev,r));}
  function reopenBuyer(p){const rev=nativeB(),r=revision();form('Reopen original buyer period',[field('Reason','reason','',{required:true,type:'textarea'})],
    f=>buyer('/api/periods/'+enc(p.id)+'/reopen',{operator:actor(),reason:input(f,'reason')},rev,r));}
  async function buyerPeriod(p){
    const rev=nativeB(),r=revision(),body=el('div',{},no('Reading current native period…')),current=dialog(p.name,body);
    const report=await read({target:'buyer',binding:bindingB(),path:'/api/periods/'+enc(p.id)+'/report'});if(!current())return;
    const issues=table(['Original issue','Message','Permitted review'],report.issues.map(i=>[title(i.code,i.item_id),i.message??i.reason??'Review original evidence',
      i.allowed_kinds?.length?button('Decide',()=>buyerDisposition(p,i),'secondary'):no('Use source review or coding')]));
    body.replaceChildren(title(report.ready?'Ready for original review':'Resolve original exceptions',report.context_sha256),issues,reveal('Full native period report',report));
    if(p.state==='OPEN')body.append(button('Retain native review',()=>form('Review buyer period',[
      field('Reviewer role','role','Finance reviewer',{required:true}),field('Review notes','notes','',{required:true,type:'textarea'})],async f=>{
        const accepted=await buyer('/api/periods/'+enc(p.id)+'/review',{reviewer:actor(),role:input(f,'role'),notes:input(f,'notes')},rev,r);
        const full=await outcome(accepted);if(full?.result?.decision==='READY'){model=await api('/api/finance/state');closeBuyer(p,full.result);}return accepted;
      },'Save reviewed period'), ''));
    if(p.latest_close)body.append(button('Download original issued packet',()=>file({target:'buyer',binding:bindingB(),path:'/api/closes/'+enc(p.latest_close)+'/packet',name:'buyer-period.zip'})));
  }
  function buyerDisposition(p,issue){
    const rev=nativeB(),r=revision();form('Original buyer exception decision',[
      title(issue.code,issue.item_id),select('Permitted disposition','kind',issue.allowed_kinds.map(k=>[k,k.replaceAll('_',' ')])),
      field('Reason','reason','',{required:true,type:'textarea'})],f=>buyer('/api/periods/'+enc(p.id)+'/disposition',{
        item_id:issue.item_id,code:issue.code,basis:issue.basis,kind:input(f,'kind'),reason:input(f,'reason'),operator:actor()},rev,r));
  }
  function closeBuyer(p,review){const rev=nativeB(),r=revision();form('Issue original buyer period',[title(p.name,review.context_sha256),no('The original reviewed source, coding, dispositions and native captures will be frozen together.')],
    ()=>buyer('/api/periods/'+enc(p.id)+'/close',{review_id:review.id},rev,r),'Issue complete buyer period');}
  async function buyerHistory(p,offset=0){
    const body=el('div',{},no('Reading retained period history…')),current=dialog(p.name+' history',body);
    const history=await read({target:'buyer',binding:bindingB(),path:'/api/periods/'+enc(p.id)+'/history?offset='+offset+'&limit=100'});if(!current())return;
    body.replaceChildren(...history.items.map(row=>reveal(row.kind+' · '+row.id,row)),
      ...(history.next!==null?[button('Next original history page',()=>buyerHistory(p,history.next))]:[]));
  }
  async function createBuyerAccountant(closeId){
    if(!model.accounting)throw Error('Select the original configured accountant owner.');
    const result=await post('file',{target:'buyer',binding:bindingB(),path:'/api/closes/'+enc(closeId)+'/accountant-source',name:'original-buyer-source.json'});
    createAccountant('buyer',{id:closeId,sha256:result.sha256});
  }
  function createAccountant(kind,c){
    if(!model.accounting)throw Error('Select the configured accountant owner.');
    const r=revision(),native=model.accounting.accountant.revision;
    form('Create original accountant handoff',[title(c.id,c.sha256),field('Handoff name','name','ROZO reviewed period',{required:true})],
      f=>command(kind==='buyer'?'finance.buyer.accountant':'finance.accountant.create',{
        binding:bindingA(),...(kind==='buyer'?{buyerBinding:bindingB()}:{}),nativeRevision:native,closeId:c.id,sourceSha256:c.sha256,name:input(f,'name')},r),'Create complete accountant files');
  }
  function accountantPage(){
    const a=model.accounting;if(!a)return card('Accountant handoffs',no('Select an original configured accountant owner.'));
    return card('Original accountant handoffs',[table(['Handoff','Original period source','Return editions',''],a.accountant.handoffs.map(row=>[
      title(row.name,row.id),row.source?.kind??row.sourceKind??'Original issued source',String(row.revisions?.length??0),
      el('div',{class:'actions'},[button('Inspect / download',()=>accountantDetail(row.id)),button('Preview returned CSV',()=>accountantReturn(row.id),'secondary')])])),
      no('Download the original issued CSV, edit its permitted accounting fields, then upload it for the native preview. Full protected source columns remain unchanged.')]);
  }
  async function accountantDetail(id,revisionId){
    const body=el('div',{},no('Reading original handoff…')),current=dialog('Accountant handoff',body);
    const value=await read({target:'accountant',binding:bindingA(),id,query:{revisionId:revisionId??'initial'}});if(!current())return;
    const selected=revisionId?value.record.revisions.find(r=>r.id===revisionId):value.record;
    body.replaceChildren(title(value.record.name,id),reveal('Original source and totals',value),table(['Original file','Bytes','SHA-256',''],selected.files.map(f=>[
      f.name,String(f.bytes),f.sha256,button('Download',()=>file({target:'accountant',binding:bindingA(),id,name:f.name,...(revisionId?{revisionId}:{})}),'ghost')])),
      ...value.record.revisions.map(r=>button('Return '+r.name,()=>accountantDetail(id,r.id),'secondary')));
    if(revisionId&&selected.files.some(f=>f.name==='buyer-return.json')&&model.buyer)
      body.append(button('Return bookkeeping to buyer',()=>buyerBookkeeping(id,revisionId),''));
  }
  async function accountantReturn(handoffId){
    const r=revision(),native=model.accounting.accountant.revision,originalActor=actor(),body=el('div'),valid=dialog('Preview accountant return',body);
    const detail=await read({target:'accountant',binding:bindingA(),id:handoffId});if(!valid())return;
    const parent=detail.record.revisions.at(-1)?.id??null,f=el('form'),fileInput=el('input',{type:'file',accept:'.csv,text/csv',required:true}),previewArea=el('div');
    let file=null,serial=0,preview=null;
    fileInput.onchange=async()=>{
      file=null;preview=null;previewArea.replaceChildren();const at=++serial,selected=fileInput.files[0];if(!selected)return;
      if(selected.size>64*1024*1024){notify('The full accountant CSV must fit within 64 MiB.',true);return;}
      const raw=new Uint8Array(await selected.arrayBuffer());if(!valid()||at!==serial)return;
      let binary='';for(let i=0;i<raw.length;i+=32768)binary+=String.fromCharCode(...raw.subarray(i,i+32768));
      file={name:selected.name,csvBase64:btoa(binary)};previewArea.replaceChildren(no(selected.name+' · '+raw.length+' original bytes'));
    };
    const name=field('Return name','name','Reviewed accountant return',{required:true});
    f.append(name,el('label',{class:'field'},['Original returned CSV',fileInput]),previewArea,
      button('Preview exact returned file',async()=>{
        if(!file)throw Error('Select and finish reading the original CSV first.');
        const at=++serial,selected={...file,name:input(f,'name')};
        const value=await post('accountant-preview',{binding:bindingA(),handoffId,csvBase64:selected.csvBase64,name:selected.name,actor:originalActor,expectedParentId:parent});
        if(!valid()||at!==serial)return;preview={value,file:selected};
        previewArea.replaceChildren(reveal('Original return preview',value),button('Save reviewed return',async()=>{
          if(!preview)throw Error('Preview the unchanged original file and name first.');
          if(actor()!==originalActor)throw Error('The operator changed. Reopen and preview the original return again.');
          const p=preview,version=p.value.revision;
          await command('finance.accountant.return',{binding:bindingA(),nativeRevision:native,handoffId,
            return:{id:version.id,createdAt:version.createdAt,csvBase64:p.file.csvBase64,name:p.file.name,
              expectedParentId:parent,previewSha256:version.integrity.sha256}},r);
          if(valid())h.closeDialog();
        },''));
      },'secondary'));
    name.querySelector('input').oninput=()=>{preview=null;serial++;previewArea.replaceChildren();};
    f.onsubmit=e=>e.preventDefault();body.replaceChildren(f);
  }
  function buyerBookkeeping(handoffId,revisionId){
    const periods=model.buyer.state.periods.filter(p=>p.latest_close),r=revision(),native=nativeB(),f=el('form'),panel=el('div');
    f.append(select('Issued original buyer period','closeId',periods.map(p=>[p.latest_close,p.name])),
      field('Bookkeeping return name','name','Accountant reviewed bookkeeping',{required:true}),
      field('Reason','reason','',{type:'textarea'}),field('Superseded original return ID (if replacing)','supersedes',''),panel);
    const valid=dialog('Apply original accountant return to buyer',f);let preview=null,serial=0;
    f.oninput=()=>{preview=null;serial++;panel.replaceChildren();};
    f.append(button('Preview buyer bookkeeping',async()=>{
      const value={binding:bindingB(),accountingBinding:bindingA(),closeId:input(f,'closeId'),handoffId,revisionId,
        name:input(f,'name'),actor:actor(),reason:input(f,'reason'),supersedes:input(f,'supersedes')||null},at=++serial;
      const result=await post('buyer-return-preview',value);if(!valid()||at!==serial)return;preview={value,result};
      panel.replaceChildren(reveal('Original bookkeeping preview',result),button('Save buyer bookkeeping return',async()=>{
        if(!preview)throw Error('Preview this exact original returned edition.');
        const {value,result}=preview;
        if(actor()!==value.actor)throw Error('The operator changed. Preview the original bookkeeping return again.');
        await command('finance.buyer.return',{binding:value.binding,accountingBinding:value.accountingBinding,nativeRevision:native,
          closeId:value.closeId,handoffId,revisionId,fileSha256:result.file.sha256,
          input:{name:value.name,reason:value.reason,supersedes:value.supersedes,previewSha256:result.preview.preview_sha256}},r);
        if(valid())h.closeDialog();
      },''));
    },'secondary'));f.onsubmit=e=>e.preventDefault();
  }
  function deliveryPage(){
    const buttons=[];
    if(model.buyer)buttons.push(button('Retain full Buyer project',()=>command('finance.delivery',{target:'buyer',binding:bindingB(),nativeRevision:nativeB()},revision()),''));
    const rows=model.operations.filter(row=>row.value?.summary?.files?.length).flatMap(row=>row.value.summary.files.map(f=>[
      title(row.value.target,row.value.id),f.name,String(f.bytes),button('Download original file',()=>download('/api/objects/'+f.sha256+'?name='+enc(f.name),f),'ghost')]));
    if(model.accounting)for(const row of model.accounting.accountant.handoffs){
      buttons.push(button('Retain all files: '+row.name,()=>command('finance.delivery',{target:'accountant',binding:bindingA(),id:row.id},revision()),'secondary'));
      for(const ret of row.revisions??[])buttons.push(button('Retain complete return: '+ret.name,()=>command('finance.delivery',{target:'accountant',binding:bindingA(),id:row.id,revisionId:ret.id},revision()),'secondary'));
    }
    return el('div',{},[card('Retain complete original finance files',[no('Capture the Buyer complete-project archive and every issued accountant file into this ROZO workspace before its explicit custody handover. Merchant Accounting keeps its native recovery/backup operation and full history.'),el('div',{class:'actions'},buttons)]),
      card('Retained original financial deliveries',table(['Original operation','File','Bytes',''],rows)),
      card('Full financial operation history',table(['Operation','Native workspace','Result',''],model.operations.map(row=>[
        row.value.id,title(row.value.target,row.value.binding.workspaceId),row.value.nativeRequestId,
        button('Read original result',async()=>{const result=await api('/api/objects/'+row.value.originalResult.sha256);dialog('Original native finance response',json(result));},'ghost')])) )]);
  }
  return {render};
}
