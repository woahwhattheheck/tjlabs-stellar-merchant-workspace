// Staff comparison and explicit original-period reopening; all writes use the existing request journal.
export function createFinanceAmendments(h,{model,revision}){
  const {el,field,input,check,button,card,table,json,notify,command}=h;
  const post=value=>h.api('/api/finance/amendment-preview',{method:'POST',value});
  const no=message=>el('p',{class:'muted',text:message});
  const detail=(label,value)=>el('details',{},[el('summary',{text:label}),json(value)]);
  const identity=value=>value?String(value.amount?.units??'Unmeasured')+' '+(value.amount?.asset?.tokenSymbol??value.kind)+' · '+value.providerStatus:'Absent';
  const saveFile=value=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));
    const a=el('a',{href:url,download:'rozo-financial-source-impact.json'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  function render(){
    const state=model(),closes=state.accounting?.finance?.closes??[];
    return el('div',{'data-finance-amendments':'true'},[
      card('Following financial edition',[no('Compare a corrected saved report with the accepted source. Review the original issued periods before reopening, recoding and issuing their following closes. The first close, accountant files and complete archive remain retained.'),
        state.accounting?.finance?button('Review corrected report',()=>review(),'',
          {'data-action':'finance-amendment-review'}):no('Choose a configured merchant Accounting owner.'),
        no('For the complete following programme, use finance-amendment-plan with the completed prior finance directory. Its plan preserves the full first archive and requires explicit financial decisions.')]),
      card('Merchant close history',table(['Period','Edition','State','Previous close','Original source'],closes.map(c=>[
        c.period.name,String(c.sequence),c.status,c.previousCloseId??'Initial',detail(c.id,{sha256:c.sha256,period:c.period,reopens:c.reopens})]))),
      card('Buyer periods',table(['Period','State','Current issued close','Recorded reopenings'],(state.buyer?.state.periods??[]).map(p=>[
        p.name,p.state,p.latest_close??'Not issued',detail(String(p.reopenings?.length??0),p.reopenings??[])])))
    ]);
  }
  function review(){
    const state=model(),reports=h.context().state.reports??[],binding=state.accounting.binding,buyerBinding=state.buyer?.binding??null;
    const f=el('form',{'data-finance-amendment-form':'true'}),area=el('div'),previewArea=el('div');
    const report=field('Corrected saved report','report','',{required:true,choices:[['','Choose…'],...reports.map(r=>[r.id,r.title])]}),
      useBuyer=check('Include explicitly reviewed Buyer purchases','includeBuyer');
    if(!buyerBinding)useBuyer.querySelector('input').disabled=true;
    f.append(el('div',{class:'form-grid'},[report,field('Source name','name','ROZO corrected report',{required:true}),
      field('Source provenance','provenance','',{required:true,wide:true}),
      field('Data context','dataContext','development',{choices:['development','operational']}),useBuyer]),area,
      el('div',{class:'form-actions'},el('button',{type:'submit',text:'Compare original financial editions'})),previewArea);
    const token=h.showDialog('Review corrected financial report',f),current=()=>h.dialogCurrent(token);
    let serial=0,reportSerial=0,selected=null,purchases=[];
    const invalidate=()=>{serial++;previewArea.replaceChildren();};
    f.addEventListener('input',invalidate);
    report.querySelector('select').onchange=async()=>{
      ++serial;const round=++reportSerial;selected=null;purchases=[];previewArea.replaceChildren();area.replaceChildren(no('Reading complete original report…'));
      try{
        const row=reports.find(r=>r.id===input(f,'report'));if(!row){area.replaceChildren();return;}
        const selection={reportId:row.id,reportVersion:row.version,expectedReportSha256:row.sha256};
        const facts=await h.api('/api/finance/report',{method:'POST',value:selection});
        if(!current()||round!==reportSerial||input(f,'report')!==row.id)return;selected={selection,facts};
        purchases=facts.movements.filter(m=>m.kind==='source_payment').map(m=>{
          const included=check('Select purchase','purchase-'+m.id);
          const owner=field('Purchase owner','owner-'+m.id,''),
            reference=field('Purchase reference','reference-'+m.id,''),reason=field('Selection reason','reason-'+m.id,'');
          return {movement:m,included,owner,reference,reason};
        });
        area.replaceChildren(no('Each Buyer purchase must be selected with its actual owner, reference and reason. Leave all unselected for reference-only intake.'),
          table(['Source payment','Exact original amount','Explicit purchase selection'],purchases.map(p=>[
            p.movement.paymentId,identity(p.movement),el('div',{'data-amendment-purchase':p.movement.id},[p.included,p.owner,p.reference,p.reason])])));
      }catch(error){if(current()&&round===reportSerial)area.replaceChildren(no(error.message));}
    };
    const value=()=>{
      if(!selected)throw Error('Choose and read the corrected saved report first.');
      const withBuyer=useBuyer.querySelector('input').checked;
      return {binding,buyerBinding:withBuyer?buyerBinding:null,report:selected.selection,
        source:{name:input(f,'name'),provenance:input(f,'provenance'),dataContext:input(f,'dataContext')},actor:h.actor(),
        purchaseSelection:withBuyer?{schema:'stellar-forge.rozo-buyer-selection.v1',sourceId:selected.facts.sourceId,
          purchases:purchases.filter(p=>p.included.querySelector('input').checked).map(p=>({
            movementId:p.movement.id,basisSha256:p.movement.basisSha256,
            purchaseOwner:p.owner.querySelector('input').value,purchaseReference:p.reference.querySelector('input').value,
            reason:p.reason.querySelector('input').value}))}:null};
    };
    f.onsubmit=async e=>{
      e.preventDefault();const round=++serial,actor=h.actor(),rozo=revision();e.submitter.disabled=true;
      try{
        const request=value(),response=await post(request);
        if(!current()||round!==serial||actor!==h.actor()||JSON.stringify(value())!==JSON.stringify(request))return;
        const comparison=response.accounting.comparison;
        const panel=el('div',{'data-amendment-preview':'true','data-preview-sha':response.previewSha256},[
          el('h3',{text:'Original source impact'}),
          no(Object.entries(comparison.counts).map(([key,n])=>n+' '+key).join(' · ')),
          table(['Movement','Change','Original','Corrected','Native-unit difference'],comparison.rows.map(r=>[
            detail(r.movementId,r),r.status,identity(r.previous),identity(r.current),r.amountDelta??'Assets or measurements differ'])),
          card('Issued merchant periods',table(['Period','Edition','Changed recognised movements',''],response.accounting.closes.map(c=>[
            c.period.name,String(c.sequence),String(c.affectedMovementIds.length),
            button('Review reopening',()=>reopen(response,request,'merchant',c,rozo),'secondary',{'data-amendment-close':c.id})]))),
          response.buyer?card('Issued Buyer periods',table(['Period','Edition','Original close',''],response.buyer.closedPeriods.map(c=>[
            c.period.name,String(c.sequence),c.closeId,button('Review reopening',()=>reopen(response,request,'buyer',c,rozo),'secondary',{'data-amendment-buyer-close':c.closeId})]))):null,
          detail('Complete source and period comparison',response),
          button('Save complete comparison',()=>saveFile(response),'secondary',{'data-action':'save-amendment-comparison'})
        ]);
        previewArea.replaceChildren(panel);
      }catch(error){if(current()&&round===serial)previewArea.replaceChildren(no(error.message));}
      finally{if(current())e.submitter.disabled=false;}
    };
  }
  function reopen(preview,original,kind,close,rozoRevision){
    const f=el('form',{'data-finance-amendment-reopen':kind},[
      no('Reopen only this original period. The issued close and its accountant files remain immutable. Continue through source review, coding and the following close after this operation.'),
      detail('Original issued period',close),field('Reopening reason','reason','',{required:true,type:'textarea',wide:true}),
      el('div',{class:'form-actions'},el('button',{type:'submit',text:'Reopen original '+(kind==='merchant'?'merchant':'Buyer')+' period'}))]);
    const token=h.showDialog('Review original period reopening',f),current=()=>h.dialogCurrent(token);
    f.onsubmit=async e=>{
      e.preventDefault();if(!current())return;e.submitter.disabled=true;
      try{
        if(h.actor()!==original.actor)throw Error('The operator changed. Review the source impact again.');
        const fresh=await post(original);if(!current())return;
        if(fresh.previewSha256!==preview.previewSha256)throw Error('The source, selection or issued periods changed. Review the current impact again.');
        const payload=kind==='merchant'?{binding:preview.accounting.binding,nativeRevision:preview.accounting.revision,
          command:'period.reopen',payload:{closeId:close.id,reason:input(f,'reason')}}:
          {binding:preview.buyer.binding,nativeRevision:preview.buyer.revision,path:'/api/periods/'+close.periodId+'/reopen',
            payload:{operator:original.actor,reason:input(f,'reason')}};
        const result=await command(kind==='merchant'?'finance.accounting.mutate':'finance.buyer.mutate',payload,rozoRevision);
        if(result?.state!=='pending'&&current())h.closeDialog();
      }catch(error){notify(error.message,true);}finally{if(current())e.submitter.disabled=false;}
    };
  }
  return {render,review};
}
