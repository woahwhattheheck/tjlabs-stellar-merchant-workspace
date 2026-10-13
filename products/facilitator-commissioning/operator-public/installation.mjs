// SPDX-License-Identifier: MIT
// Full typed preparation over the original source, case and funded Installation.
const clone=v=>JSON.parse(JSON.stringify(v));
const labels={
 task:{completeOutput:'Complete useful output',repeatTrigger:'Reason for a new purchase',pricedUnit:'Actual priced unit'},
 source:{reference:'Actual source edition or live connection',mode:'Original source mode',population:'Complete source population',meaning:'Keys, units, types and time',authority:'Source-use authority',changePolicy:'Source changes and withdrawal'},
 payment:{network:'Payment network',asset:'Payment asset',recipient:'Merchant recipient',priceAtomic:'Unit price in atomic units',taskUnits:'Useful task units',taskBudgetAtomic:'Approved task budget in atomic units',authority:'Buyer approval and spending authority',termsSourceIds:'Original payment-terms source IDs'},
 receiving:{application:'Receiving application and source edition',host:'Actual receiving host',operator:'Named receiving engineer',acceptanceRule:'Complete useful-output acceptance',changeAndWithdraw:'Independent change and withdrawal',recovery:'Original operation recovery',maintenance:'Maintenance and support owner'}
};
export function createInstallationView({api,esc,detail,badge,when,size,option,input,select,area,button,submit,panel,table,fileField,value,ref,prepare,retainJson,state,desk}){
  const link=(id,name,label)=>'<a href="'+esc(api.fileURL({kind:'installation',id,name}))+'">'+esc(label??name)+'</a>';
  const ids=v=>Array.isArray(v)?v.join('\n'):'';
  const field=(section,key,label,v)=>{
    const name=section+'.'+key,required=['host','operator','authority'].includes(key);
    if(key==='termsSourceIds')return area(name,label,ids(v),false)+'<p class="source-note full">Use one actual source ID per line from the original case. Existing seed terms remain attached.</p>';
    if(['priceAtomic','taskBudgetAtomic'].includes(key))return input(name,label,v??'','text',false,'inputmode="numeric" pattern="(0|[1-9][0-9]{0,29})"');
    if(key==='taskUnits')return input(name,label,v??'','number',false,'min="0" max="1000000000000" step="1"');
    return ['mode','network','asset','recipient','host','operator'].includes(key)?input(name,label,v??'','text',required):area(name,label,v??'',required);
  };
  function editor(data){
    const r=data.preparation,base=data.defaults,b=data.bindings;
    let forms='<form data-form="installation-prepare" data-template="'+esc(r.operationId)+'" data-draft-key="installation-prepare:'+esc(r.operationId)+'" data-installation-basis="'+esc(r.operationId)+'">';
    forms+='<p>The source, case version and two provider identities below stay bound to this template. Save the completed preparation, then open its complete document in the original Installation application for preview and save.</p>';
    forms+='<fieldset><legend>Existing accountable deployments</legend><div class="form-grid">'+input('merchantDeploymentId','Merchant deployment ID',b.merchantDeploymentId??base.merchantDeploymentId??'','text',false)+area('buyerDeploymentIds','Original buyer deployment IDs',ids(b.buyerDeploymentIds??base.buyerDeploymentIds),false)+'</div><p class="source-note">Use one original buyer deployment ID per line. These IDs belong to the selected Operations case.</p></fieldset>';
    for(const section of ['task','source','payment','receiving']){
      const title={task:'Complete customer task',source:'Authorized original source',payment:'Payment and whole-task budget',receiving:'Independent receiving and operation'}[section];
      forms+='<fieldset><legend>'+title+'</legend><div class="form-grid">'+Object.entries(labels[section]).map(([key,label])=>field(section,key,label,base[section]?.[key])).join('')+'</div></fieldset>';
    }
    forms+=panel('Original facilitator selections',table(['Operator','Endpoint','Authority sources'],b.payment.facilitators.map(p=>[esc(p.operatorId),esc(p.endpoint),p.sourceIds.map(esc).join('<br>')]))+detail('Complete fixed provider selections',b.payment.facilitators));
    forms+=detail('Retained original source attachment IDs',{source:b.source.sourceIds,receiving:b.receiving.sourceIds})+
      '<p class="source-note">Blank optional values remain explicit selections for native review. Preparing this document retains the original funding and work assignments.</p>'+submit('Review complete Installation preparation')+'</form>';
    return forms;
  }
  function pager(page,kind){
    return '<div class="actions">'+button('Previous page','installation-page','data-kind="'+kind+'" data-offset="'+Math.max(0,page.offset-page.limit)+'"'+(page.offset===0?' disabled':''))+
      button('Next page','installation-page','data-kind="'+kind+'" data-offset="'+esc(page.next_offset??0)+'"'+(page.next_offset===null?' disabled':''))+'</div>';
  }
  function documentReview(document){
    if(!document||typeof document!=='object')return detail('Complete native document',document);
    const titles={task:'Customer task',source:'Original source',payment:'Payment and facilitator authority',receiving:'Independent receiving',workorder:'Original workorder',workshare:'Funded Workshare',assignments:'Original assignments',checks:'Original acceptance checks',workflowPeriods:'Workflow periods',coordination:'Coordination'};
    const label=k=>k.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
    const value=v=>v===null?'<span class="muted">Not selected</span>':Array.isArray(v)?(v.length?'<ol>'+v.map(x=>'<li>'+(x&&typeof x==='object'?detail('Complete original item',x):esc(x))+'</li>').join('')+'</ol>':'<span class="muted">None recorded</span>'):v&&typeof v==='object'?detail('Complete original value',v):esc(v===true?'Yes':v===false?'No':v===''?'Not selected':v);
    return Object.entries(document).map(([key,section])=>{
      const body=section&&typeof section==='object'&&!Array.isArray(section)?table(['Field','Original native value'],Object.entries(section).map(([name,v])=>[esc(labels[key]?.[name]??label(name)),value(v)])):value(section);
      return '<section class="native-section"><h3>'+esc(titles[key]??label(key))+'</h3>'+body+'</section>';
    }).join('');
  }
  async function nativeWorkspace(preparation){
    const q=desk(),catalog=await api.installationReceivings();q.nativeCatalog=catalog;
    const matching=catalog.items.filter(x=>x.preparationOperationId===preparation.operationId);
    if(q.receivingId&&!matching.some(x=>x.receivingOperationId===q.receivingId)){q.receivingId=null;q.snapshotSha256=null;}
    if(!q.receivingId&&matching.length){q.receivingId=matching.at(-1).receivingOperationId;q.snapshotSha256=null;}
    let html=panel('Preview in the original Installation application',
      '<p>The selected host borrows the existing source and receiving services. Preview checks the same case version and produces the native document for explicit Save. The receiving name is retained with this operation.</p>'+
      (catalog.hosts.length?'<form data-form="installation-preview" data-preparation="'+esc(preparation.operationId)+'" data-draft-key="installation-preview:'+esc(preparation.operationId)+'" data-installation-basis="'+esc(preparation.operationId)+'"><div class="form-grid">'+
        select('hostAlias','Original source and receiving services',option('','Choose the configured original connection')+catalog.hosts.map(x=>option(x.alias,x.title)).join(''))+
        input('actor','Recording operator')+input('receivingName','Name of the independently received case')+area('note','Installation reason and reviewed customer context')+
        '</div>'+submit('Review native Preview command')+'</form>':'<p class="notice">No original receiving connection is configured on this host. The complete preparation and its downloads remain available. The host operator selects the existing source and receiving services in its private setup file.</p>'));
    if(!matching.length)return html;
    html+=panel('Original native receiving operations','<form data-form="installation-receiving-select" data-draft-key="installation-receiving-select:'+esc(preparation.operationId)+'">'+
      select('receivingId','Saved native operation',matching.map(x=>option(x.receivingOperationId,x.state+' · '+x.hostAlias+' · '+(x.observedAt?when(x.observedAt):'Original command pending'),q.receivingId===x.receivingOperationId)).join(''))+submit('Open saved native operation')+'</form>');
    const row=matching.find(x=>x.receivingOperationId===q.receivingId);
    if(!row)return html;
    if(row.state==='PENDING'){
      q.nativeDetail=null;
      return html+panel('Receive the original Preview','<p>The full Preview command is saved. Recover its original result and continue the same UUID.</p>'+button('Receive original saved command','recover-id','data-id="'+esc(row.receivingOperationId)+'"'));
    }
    const snap=q.snapshotSha256??row.snapshotSha256;
    const observed=await api.installationReceiving({id:q.receivingId,snapshotSha256:snap});q.nativeDetail=observed;q.snapshotSha256=observed.snapshotSha256;
    const linkNative=(name,label)=>'<a class="button" href="'+esc(api.fileURL({kind:'installation-native',id:q.receivingId,name,snapshotSha256:observed.snapshotSha256}))+'">'+esc(label??name)+'</a>';
    let body='<dl><dt>Native state</dt><dd>'+badge(observed.state)+'</dd><dt>Original operation</dt><dd>'+esc(observed.receivingOperationId)+'</dd><dt>Saved observation</dt><dd>'+when(observed.observedAt)+'</dd></dl>'+
      '<div class="actions">'+button('Open latest saved observation','installation-native-latest')+button('Receive original phase command','recover-id','data-id="'+esc(observed.outerOperationId)+'"')+linkNative('operation.json','Complete operation and responses')+linkNative('intent.json','Original native choices')+'</div>'+
      detail('Original source and receiving workspaces',observed.host);
    if(observed.errorCount)body+='<p class="notice">'+esc(observed.errorCount)+' original error observations are retained. Open the complete operation or selected error file and recover the same saved command. Accepted native work keeps its original request.</p>';
    html+=panel('Native receiving position',body);
    if(observed.responses.preview?.validated){
      const preview=await api.installationReceiving({id:q.receivingId,kind:'preview',snapshotSha256:observed.snapshotSha256});q.nativePreview=preview.value;
      html+=panel('Review the original native preview',
        '<p>This is the complete native preview returned for the selected original case, plan and Installation revision. Review the document and its native findings before Save.</p>'+
        documentReview(preview.value.document??preview.value)+detail('Full native preview, validation and source',preview.value)+linkNative('native-preview.json','Download complete native preview'));
    }
    const phase=(action,label,prerequisite,description)=>{
      if(!observed.responses[prerequisite]?.validated)return '';
      return '<form data-form="'+action+'" data-receiving="'+esc(q.receivingId)+'" data-snapshot="'+esc(observed.snapshotSha256)+'" data-draft-key="'+action+':'+esc(q.receivingId)+'" data-installation-basis="'+esc(q.receivingId+':'+observed.snapshotSha256)+'"><p>'+esc(description)+'</p>'+submit(label)+'</form>';
    };
    html+=panel('Explicit original native actions',
      phase('installation-save','Review Save command','preview','Save the reviewed native document in the original Operations case. The original save request ID and expected case/Installation revisions remain fixed.')+
      phase('installation-export','Review complete Export command','save','Retain the complete saved Installation and operating-case archive through its original exporter.')+
      phase('installation-receive','Review independent Receive command','export','Import that exact whole case into the configured independent receiving workspace, then reopen the same selected Installation and every original attached source.'));
    if(observed.responses.save?.validated)html+=panel('Original saved Installation',linkNative('native-save.json','Original Save response')+
      (observed.files?'<p>The full accepted edition is available among the retained native files. If a reply interrupted the edition read, recover the same Save or Export command.</p>':''));
    if(observed.responses.export?.validated)html+=panel('Complete case and source handoff',linkNative('complete-case.zip','Download complete native case ZIP')+
      '<p>Extract this original archive and open every contained deliverable and the received working case. Its independent receipt selects the same Installation edition.</p>');
    if(observed.completion)html+=panel('Independently received original edition',detail('Complete native receiving result',observed.completion)+linkNative('native-receive.json','Original import response')+linkNative('independently-received-edition.json','Complete received Installation'));
    const files=await api.installationReceiving({id:q.receivingId,kind:'files',offset:q.nativeFileOffset??0,limit:25,snapshotSha256:observed.snapshotSha256});
    html+=panel('Complete native files · '+files.total,table(['Original file','Size','Download'],files.items.map(f=>[esc(f.name),size(f.bytes),linkNative(f.name,'Complete file')+detail('Original SHA256',f.sha256)]))+
      '<div class="actions">'+button('Previous native files','installation-native-page','data-offset="'+Math.max(0,files.offset-files.limit)+'"'+(files.offset===0?' disabled':''))+
      button('Next native files','installation-native-page','data-offset="'+esc(files.next_offset??0)+'"'+(files.next_offset===null?' disabled':''))+'</div>');
    return html;
  }
  async function render(){
    const q=desk(),s=state(),catalog=await api.installations();q.catalog=catalog;
    if(q.selectedId&&!catalog.preparations.some(r=>r.operationId===q.selectedId))q.selectedId=null;
    const sources=option('','Choose an original complete transfer')+catalog.sources.map(r=>option(r.operationId,when(r.completedAt)+' · '+r.sourceMembers+' source members · '+r.operationId)).join('');
    const saved=option('','Choose a saved preparation')+catalog.preparations.map(r=>option(r.operationId,(r.mode==='template'?'Template':'Prepared Installation')+' · '+when(r.completedAt)+' · Case '+r.basis.caseId+' v'+r.basis.caseVersion,r.operationId===q.selectedId)).join('');
    let html='<h1>Customer Installation</h1><p>Prepare the same complete service for its existing funded case. Source selection, original provider authority and customer receiving stay with the saved job.</p>';
    html+=panel('Prepare from the original case','<form data-form="installation-template" data-installation-basis="'+esc(catalog.selectionSha256)+'"><div class="form-grid">'+select('sourceTransferId','Original complete service transfer',sources)+fileField('caseSnapshot','Complete current Operations case JSON')+fileField('seed','Original Workshare / Installation seed JSON')+'</div><p>Upload both complete files in Files. If source attachments changed, receive the case and seed again at the same current version.</p>'+submit('Review original source template')+'</form><div class="actions">'+button('Open Files','navigate','data-page="files"')+button('Open complete Handover','navigate','data-page="handover"')+'</div>');
    if(!catalog.sources.length)html+='<p class="notice">Retain a complete service transfer in Handover first. Its full original source cut supplies this Installation.</p>';
    html+=panel('Saved preparations','<form data-form="installation-select">'+select('selectedId','Original template or prepared Installation',saved,false)+submit('Open saved preparation')+'</form>');
    if(!q.selectedId){q.detail=null;return html;}
    const data=await api.installation({id:q.selectedId});q.detail=data;
    const r=data.preparation;
    html+=panel(r.mode==='template'?'Original source template':'Complete prepared Installation',
      '<dl><dt>Case</dt><dd>'+esc(r.basis.caseId)+' · Version '+esc(r.basis.caseVersion)+'</dd><dt>Workshare</dt><dd>'+esc(r.basis.workshareCaseId??'Awaiting original Workshare selection')+'</dd><dt>Plan edition</dt><dd>'+esc(r.basis.planId)+' · '+esc(r.basis.planRevision)+'</dd><dt>Original requests</dt><dd>'+esc(r.basis.requestCount)+' per provider</dd><dt>Prepared files</dt><dd>'+esc(r.files)+'</dd><dt>Missing source matches</dt><dd>'+esc(r.missingSourceCount)+'</dd></dl>'+
      detail('Complete original source basis',r.basis)+detail('Original funded work and assignments',{workshare:data.workshare,workorder:data.workorder,assignments:data.assignments,checks:data.checks})+
      '<div class="actions">'+link(r.operationId,'bindings.json','Download complete bindings')+'<a class="button" href="'+esc(api.installationArchiveURL(r.operationId))+'">Download complete preparation TAR</a></div>');
    const sourcePage=await api.installation({id:q.selectedId,kind:'sources',offset:q.sourceOffset??0,limit:25});
    html+=panel('Original source matching · '+sourcePage.total+' files',table(['Original member','Case source','Result'],sourcePage.items.map(f=>[esc(f.path)+'<br><span class="muted">'+size(f.bytes)+'</span>',esc(f.sourceId??'Attach this exact original file'),badge(f.state)+detail('Exact original identity and matching sources',{sha256:f.sha256,bytes:f.bytes,matchingSourceIds:f.matchingSourceIds??[]})]))+pager(sourcePage,'sources'));
    if(r.mode==='template'){
      if(r.missingSourceCount)html+=panel('Complete source attachment','<p>The source table identifies every missing original. Download this whole preparation and attach its complete originals through the existing Operations case. Then receive the current case and seed and prepare a new template. The previous template remains saved with its original version.</p>');
      else html+=panel('Edit complete operating choices',editor(data));
    }else{
      html+=panel('Native Installation handoff','<p>The complete Installation document below uses original case version '+esc(r.basis.caseVersion)+'. Use the explicit native Preview, Save, Export and Receive controls below; each keeps its original operation identity.</p><div class="actions">'+link(r.operationId,'installation-input.json','Complete Installation document')+link(r.operationId,'installation-preview-input.json','Native preview input')+link(r.operationId,'WORKORDER.md','Readable complete workorder')+'</div>'+
        (r.selections.length?table(['Selection still needed','Purpose'],r.selections.map(x=>[esc(x.field),esc(x.purpose)])):'<p>All preparer selections have values. Inspect the native preview and actual customer conditions before saving.</p>')+
        detail('Full prepared native document',data.prepared));
    }
    if(r.mode==='prepare')html+=await nativeWorkspace(r);
    const filesPage=await api.installation({id:q.selectedId,kind:'files',offset:q.fileOffset??0,limit:25});
    html+=panel('Complete original files · '+filesPage.total,table(['File','Size','Download'],filesPage.items.map(f=>[esc(f.path),size(f.bytes),link(r.operationId,f.path,'Complete file')+detail('Original SHA256',f.sha256)]))+pager(filesPage,'files'));
    html+=panel('Continue at another operator','<p>The complete commissioning handover retains this preparation, its current source files, original request, exact case and seed, profile and bindings. Receive that full operator TAR through the existing commissioning receiver, reopen this same job, and select this preparation in Customer Installation. Its individual files and complete package are reconstructed from the original retained identities.</p><p>Open the complete workorder, native document, source matching and all delivered attachments. Operate and view the actual desktop and narrow application, downloads and reopened project before presenting the installation to its customer.</p>');
    return html;
  }
  async function form(form){
    if(form.dataset.form==='installation-receiving-select'){desk().receivingId=value(form,'receivingId')||null;desk().snapshotSha256=null;desk().nativeFileOffset=0;return{viewChanged:true};}
    if(form.dataset.form==='installation-preview')return prepare('installation-preview',{hostAlias:value(form,'hostAlias'),preparationOperationId:form.dataset.preparation,actor:value(form,'actor'),note:value(form,'note'),receivingName:value(form,'receivingName')},form);
    if(['installation-save','installation-export','installation-receive'].includes(form.dataset.form))return prepare(form.dataset.form,{receivingOperationId:form.dataset.receiving,expectedSnapshotSha256:form.dataset.snapshot},form);
    if(form.dataset.form==='installation-select'){desk().selectedId=value(form,'selectedId')||null;desk().sourceOffset=0;desk().fileOffset=0;desk().receivingId=null;desk().snapshotSha256=null;desk().nativeFileOffset=0;return{viewChanged:true};}
    if(form.dataset.form==='installation-template')return prepare('installation-template',{sourceTransferId:value(form,'sourceTransferId'),seed:ref(form,'seed'),caseSnapshot:ref(form,'caseSnapshot')},form);
    if(form.dataset.form!=='installation-prepare')return false;
    const templateId=form.dataset.template,data=desk().detail;
    if(!data||data.preparation.operationId!==templateId||data.preparation.mode!=='template')throw new Error('Reopen the original complete template before editing.');
    const b=clone(data.bindings),split=v=>v.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    b.merchantDeploymentId=value(form,'merchantDeploymentId')||null;b.buyerDeploymentIds=split(value(form,'buyerDeploymentIds'));
    for(const section of Object.keys(labels)){
      b[section]??={};
      for(const key of Object.keys(labels[section])){
        const v=value(form,section+'.'+key);
        b[section][key]=key==='termsSourceIds'?split(v):['priceAtomic','taskBudgetAtomic'].includes(key)?v||null:key==='taskUnits'?(v===''?null:Number(v)):v;
      }
    }
    const bindings=await retainJson('installation-bindings-'+templateId+'.json',b);
    return prepare('installation-prepare',{templateOperationId:templateId,bindings},form);
  }
  return{render,form};
}
