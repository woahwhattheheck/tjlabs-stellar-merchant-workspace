// MIT. Cash commissioning inside the original Xero handover desk.
import {parseXeroNativeJson} from './native-json.mjs';

const el=(tag,text,attrs={})=>{
  const node=document.createElement(tag);
  if(text!==undefined&&text!==null)node.textContent=String(text);
  for(const [key,value]of Object.entries(attrs)) {
    if(value===undefined||value===null)continue;
    if(['value','checked','disabled','hidden','readOnly','multiple','className'].includes(key))node[key]=value;
    else node.setAttribute(key,String(value));
  }
  return node;
};
const text=value=>value===undefined||value===null?'—':String(value);
const money=(value,currency)=>text(value)+(currency?.code?' '+currency.code:'');
const dateTime=value=>value?String(value).replace('T',' ').replace(/\.\d+Z$/,' UTC'):'—';
const short=value=>String(value??'').length>26?String(value).slice(0,22)+'…':String(value??'');
const opt=(value,label)=>el('option',label,{value});
const keyOf=row=>row.kind+'/'+row.id;
const organisation=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
function action(label,key,value,primary=false) {
  return el('button',label,{type:'button','data-cash-action':key,'data-cash-value':value,className:primary?'primary':undefined});
}
function field(label,control,hint) {
  const item=el('label',label);item.append(control);if(hint)item.append(el('span',hint,{className:'hint'}));return item;
}
function table(headers,rows,caption) {
  const wrap=el('div',null,{className:'table-wrap'}),result=el('table'),head=el('tr'),body=el('tbody');
  if(caption)result.append(el('caption',caption,{className:'sr-only'}));
  for(const title of headers)head.append(el('th',title));
  const thead=el('thead');thead.append(head);result.append(thead,body);
  for(const values of rows) {
    const row=el('tr');
    for(const value of values) {const cell=el('td');cell.append(value instanceof Node?value:document.createTextNode(text(value)));row.append(cell);}
    body.append(row);
  }
  wrap.append(result);return wrap;
}
function stack(main,detail) {const node=el('div');node.append(el('span',main));if(detail)node.append(el('span',detail,{className:'subtext'}));return node;}
function jsonDetails(label,value) {
  const details=el('details'),summary=el('summary',label),pre=el('pre',JSON.stringify(value,null,2),{className:'cash-json'});
  details.append(summary,pre);return details;
}
function sameCurrency(a,b){return a?.code===b?.code&&a?.scale===b?.scale;}
function exactUnits(value,currency) {
  const match=/^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(String(value??''));
  if(!match||(match[2]??'').length>(currency?.scale??0))throw new Error('Enter an exact nonnegative amount in the displayed currency.');
  return BigInt(match[1]+(match[2]??'').padEnd(currency.scale,'0'));
}

export function createCashDesk(host) {
  const root=host.root,view={
    package:null,packageIds:new Set(),packages:new Map(),importIds:new Set(),files:[],
    asOf:'',label:'',baselineCycleId:'',cycles:[],selectedCycle:null,
    matches:new Map(),sourceBindings:[],preview:null,review:null,epoch:0,cohortEpoch:0,cycleEpoch:0,sourceEpoch:0,working:0,
    entryFilter:'',entryStatus:'',dialog:null
  };
  const context=()=>host.context();
  const report=error=>host.report(error);
  const changed=(clear=false)=>{
    view.epoch++;view.preview=null;if(clear){view.review=null;root.querySelector('[data-cash-live-review]')?.remove();}
    sync();
  };
  const ready=()=>view.preview&&view.preview.epoch===view.epoch&&view.preview.revision===context().data?.revision;
  function sync() {
    const busy=view.working>0||context().busy||Boolean(context().pending);
    for(const control of root.querySelectorAll('[data-cash-edit]'))control.disabled=busy;
    for(const control of root.querySelectorAll('[data-cash-action="preview"]'))control.disabled=busy||!view.package;
    for(const control of root.querySelectorAll('[data-cash-action="capture"]'))control.disabled=busy||!ready();
    const state=root.querySelector('[data-cash-review-state]');
    if(state)state.textContent=ready()?'This review matches the current source selection and accounting revision.':
      view.review?'Selection changed. Review the current cycle before saving.':'Select the original responses and review this cycle.';
  }
  function selectControl(values,value,attrs={}) {
    const select=el('select',null,{'data-cash-edit':'1',...attrs});
    select.append(...values.map(row=>opt(row.value,row.label)));select.value=value??'';return select;
  }
  function inputControl(type,value,attrs={}) {
    return el('input',null,{type,value:value??'','data-cash-edit':'1',...attrs});
  }
  function selection() {
    if(!view.package)throw new Error('Open an original Xero handover package.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(view.asOf))throw new Error('Choose the customer account date.');
    return {packageIds:[...view.packageIds],asOf:view.asOf,label:view.label.trim()||'Cash cycle '+view.asOf,
      baselineCycleId:view.baselineCycleId||null,importIds:[...view.importIds],
      additionalSources:view.files.map(row=>({file:row.file,observedAt:row.observedAt})),
      sourceBindings:structuredClone(view.sourceBindings),matches:[...view.matches.values()].map(row=>structuredClone(row))};
  }
  function originalImports() {
    const rows=new Map();
    for(const record of view.packages.values())for(const item of record.imports??[])
      if(item.format==='NATIVE_JSON')rows.set(item.id,item);
    return [...rows.values()].sort((a,b)=>String(a.receivedAt).localeCompare(String(b.receivedAt)));
  }
  function samePackages() {
    const current=view.package;if(!current)return [];
    return (context().data?.packages??[]).filter(row=>organisation(row.organisation)===organisation(current.organisation)&&
      (!row.totals?.currency||sameCurrency(row.totals.currency,current.profile.currency)));
  }
  async function loadCohort() {
    const epoch=++view.cohortEpoch,id=view.package?.id;
    if(!id)return;
    view.working++;sync();
    try {
      const selected=[...view.packageIds];
      const records=await Promise.all(selected.map(async packageId=>packageId===id?view.package:(await context().client.detail(packageId)).package));
      if(epoch!==view.cohortEpoch||id!==view.package?.id)return;
      view.packages=new Map(records.map(row=>[row.id,row]));
      const eligible=new Set(originalImports().map(row=>row.id));
      for(const importId of [...view.importIds])if(!eligible.has(importId))view.importIds.delete(importId);
      const cycles=new Map(records.flatMap(row=>(row.cashCycles??[]).map(cycle=>[cycle.id,cycle])));
      if(!cycles.size)for(const record of records) {
        const result=await context().client.cashCycles(record.id);
        if(epoch!==view.cohortEpoch||id!==view.package?.id)return;
        for(const cycle of result.items)cycles.set(cycle.id,cycle);
      }
      view.cycles=[...cycles.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
      render();
    }finally{view.working--;sync();}
  }
  function renderSelection() {
    const section=el('section',null,{className:'review'});section.append(el('h3','Cycle and original package cohort'));
    section.append(el('p','Use the earlier and current billing packages together when the next cycle adds new invoices or credits.',{className:'hint'}));
    const grid=el('div',null,{className:'form-grid'});
    grid.append(field('Cycle label',inputControl('text',view.label,{'data-cash-field':'label',maxlength:200})),
      field('Customer account date',inputControl('date',view.asOf,{'data-cash-field':'asOf',required:true})),
      field('Compare with saved cycle',selectControl([{value:'',label:'First cycle — no baseline'},...view.cycles.map(row=>({
        value:row.id,label:row.label+' · '+row.asOf+' · '+dateTime(row.createdAt)}))],view.baselineCycleId,{'data-cash-field':'baselineCycleId'})));
    section.append(grid);
    section.append(table(['Include','Original package','Documents','Created'],samePackages().map(row=>{
      const check=inputControl('checkbox','',{'data-cash-package':row.id,'aria-label':'Include original package '+row.title});
      check.checked=view.packageIds.has(row.id);if(row.id===view.package.id){check.disabled=true;check.removeAttribute('data-cash-edit');}
      return [check,stack(row.title||short(row.id),row.id),row.documentCount,dateTime(row.createdAt)];
    }),'Original package cohort'));
    return section;
  }
  function renderSources() {
    const section=el('section',null,{className:'review'});section.append(el('h3','Original provider responses'));
    const rows=originalImports();
    section.append(el('p','Select the native responses already retained with these packages. Add original Payments, Invoices, CreditNotes, Prepayments or Overpayments JSON when it contains the current cash detail.',{className:'hint'}));
    if(rows.length)section.append(table(['Use','Original response','Observed','Received into workspace','Source'],rows.map(row=>{
      const check=inputControl('checkbox','',{'data-cash-import':row.id,'aria-label':'Use '+row.file.name});check.checked=view.importIds.has(row.id);
      return [check,stack(row.file.name,short(row.id)),dateTime(row.receivedAt),dateTime(row.recordedAt),
        stack(row.file.bytes+' bytes',row.file.sha256)];
    }),'Retained native Xero responses'));
    else section.append(el('p','This package cohort has no retained native JSON responses. Add original responses below or receive them in Package and results.',{className:'hint'}));
    const upload=inputControl('file','',{'data-cash-upload':'1',accept:'.json,application/json',multiple:true});
    section.append(field('Add complete original JSON files',upload,'Each original response is kept unchanged. Up to 8 MiB per file.'));
    if(view.files.length)section.append(table(['Original file','Observed at, UTC','Source contents','Action'],view.files.map((row,index)=>{
      const observed=inputControl('text',row.observedAt,{'data-cash-observed':String(index),'aria-label':'Observation time for '+row.file.name});
      const remove=action('Remove','remove-source',String(index));remove.setAttribute('data-cash-edit','1');
      return [stack(row.file.name,row.bytes+' bytes · '+row.sha256),observed,
        Object.entries(row.collections).map(([key,count])=>key+': '+count).join(' · '),remove];
    }),'Additional original provider files'));
    return section;
  }
  function renderDecisions() {
    if(!view.matches.size&&!view.sourceBindings.length)return null;
    const section=el('details',null,{className:'review'}),summary=el('summary',
      'Retained review decisions · '+view.matches.size+' cash matches · '+view.sourceBindings.length+' customer bindings');
    section.append(summary,el('p','These are the current review inputs. Remove a decision when its original source or ledger relationship changes, then review the updated cycle.',{className:'hint'}));
    if(view.matches.size)section.append(table(['Original source entry','Native ledger portions','Action'],[...view.matches.values()].map(row=>{
      const controls=el('div',null,{className:'actions'});
      if(view.review?.entries?.some(entry=>entry.key===row.entryKey)) {
        const edit=action('Edit match','match',row.entryKey);edit.setAttribute('data-cash-edit','1');controls.append(edit);
      }
      const clear=action('Remove match','clear-match',row.entryKey);clear.setAttribute('data-cash-edit','1');controls.append(clear);
      return [row.entryKey,stack(row.native.map(item=>item.kind+' '+short(item.id)+' · '+item.amount).join('; '),row.dateDifferenceReason),controls];
    }),'Retained cash matching decisions'));
    if(view.sourceBindings.length)section.append(table(['Original cash source','Native customer','Action'],view.sourceBindings.map(row=>{
      const customer=(context().data?.customers??[]).find(item=>item.id===row.customerId),
        clear=action('Remove binding','clear-binding',JSON.stringify({kind:row.kind,externalId:row.externalId}));
      clear.setAttribute('data-cash-edit','1');
      return [stack(row.externalId,row.kind),stack(customer?.name??row.customerId,row.customerId),clear];
    }),'Retained original customer bindings'));
    return section;
  }
  function changeValue(value) {
    if(value===null||typeof value!=='object')return text(value);
    const box=el('div'),pairs=Object.entries(value).filter(([,item])=>item===null||typeof item!=='object').slice(0,6);
    if(pairs.length)box.append(el('span',pairs.map(([key,item])=>key+': '+text(item)).join(' · ')));
    box.append(jsonDetails('Original comparison values',value));return box;
  }
  function renderHistory() {
    const section=el('section',null,{className:'review'});section.append(el('h3','Saved commissioning cycles'));
    if(!view.cycles.length){section.append(el('p','Save the reviewed first cycle to establish its original ledger, provider responses and customer handover.',{className:'hint'}));return section;}
    section.append(table(['Cycle','Account date','Outcome','Recorded','Open'],view.cycles.map(row=>[
      stack(row.label,short(row.id)),row.asOf,row.status,dateTime(row.createdAt),action('Open saved cycle','cycle',row.id)
    ]),'Saved original cash commissioning cycles'));
    return section;
  }
  function renderSaved() {
    const cycle=view.selectedCycle;if(!cycle)return null;
    const section=el('section',null,{className:'review'});
    const heading=el('div',null,{className:'section-heading'}),buttons=el('div',null,{className:'actions'});
    const baseline=action('Use as next baseline','baseline',cycle.id);baseline.setAttribute('data-cash-edit','1');
    buttons.append(action('Download complete handover','archive',cycle.id),baseline,action('Close saved cycle','close-cycle'));
    heading.append(el('h3',cycle.label),buttons);section.append(heading);
    section.append(el('p',cycle.organisation+' · account date '+cycle.asOf+' · recorded '+dateTime(cycle.createdAt)+' · '+cycle.status));
    section.append(el('p','Saved cycle '+cycle.id+' · original review '+cycle.reviewSha256,{className:'source-note mono'}));
    section.append(renderReport(cycle.review,{saved:true}));
    section.append(table(['Original handover file','Role','Bytes','SHA-256','Download'],cycle.files.map(row=>[
      row.name,row.role,row.bytes,row.sha256,action('Download','cycle-file',row.name)
    ]),'Original immutable commissioning files'));
    return section;
  }
  function render() {
    const contents=[];
    if(!view.package) {
      const empty=el('div',null,{className:'empty'});empty.append(el('h3','Open a handover package'),
        el('p','Choose a package from the handover queue to commission its customer cash and subsequent billing cycles.'));
      const go=el('button','Open handover queue',{type:'button','data-go':'queue'});empty.append(go);root.replaceChildren(empty);return;
    }
    contents.push(el('p',view.package.organisation+' · '+view.package.profile.currency.code+' · '+view.package.title));
    contents.push(renderSelection(),renderSources());
    const decisions=renderDecisions();if(decisions)contents.push(decisions);
    const controls=el('div',null,{className:'actions'}),review=action('Review cash cycle','preview',null,true),capture=action('Save reviewed cycle','capture');
    capture.setAttribute('data-mutation','');controls.append(review,capture);
    contents.push(controls,el('p','',{'data-cash-review-state':'1',className:'source-note'}));
    if(view.review)contents.push(renderReport(view.review,{saved:false}));
    contents.push(renderHistory());const saved=renderSaved();if(saved)contents.push(saved);
    root.replaceChildren(...contents);sync();
  }
  async function chooseSources(files) {
    if(view.files.length+files.length>20)throw new Error('Select no more than 20 additional original response files.');
    const id=view.package?.id,epoch=++view.sourceEpoch;view.working++;sync();
    try {
      const prepared=[];
      for(const original of files) {
        const loaded=await host.originalFile(original,8*1024*1024);
        const sourceText=new TextDecoder('utf-8',{fatal:true}).decode(loaded.bytes),parsed=parseXeroNativeJson(sourceText);
        const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',loaded.bytes)),
          sha256=[...hash].map(value=>value.toString(16).padStart(2,'0')).join('');
        const collections=Object.fromEntries(['Invoices','CreditNotes','Payments','Prepayments','Overpayments','Elements']
          .filter(key=>Array.isArray(parsed.value?.[key])).map(key=>[key,parsed.value[key].length]));
        if(!Object.keys(collections).length)throw new Error(original.name+' has no original Xero accounting response collection.');
        prepared.push({file:loaded.file,sha256,bytes:loaded.bytes.length,observedAt:new Date().toISOString(),collections});
      }
      if(id!==view.package?.id||epoch!==view.sourceEpoch)return;
      view.files.push(...prepared);changed(true);render();
    }finally{view.working--;sync();}
  }
  async function reviewCycle() {
    const id=view.package?.id,input=selection(),intent=JSON.stringify(input);view.working++;sync();
    try {
      let result;
      for(let attempt=0;attempt<2;attempt++) {
        result=await context().client.cashPreview(id,input);
        if(id!==view.package?.id||JSON.stringify(selection())!==intent)return;
        if(result.revision===context().data?.revision)break;
        await host.reloadState();
      }
      if(id!==view.package?.id||JSON.stringify(selection())!==intent)return;
      if(result.revision!==context().data?.revision)throw new Error('The accounting revision changed during this review. Review the updated customer account again.');
      view.review=result;view.preview={input,epoch:view.epoch,revision:result.revision,sha256:result.previewSha256};render();
    }finally{view.working--;sync();}
  }
  async function saveCycle() {
    if(!ready())throw new Error('Review the current cash selection and matches before saving.');
    const saved=view.preview;
    await host.mutate('cashCapture','Customer cash commissioning cycle',{...structuredClone(saved.input),previewSha256:saved.sha256},view.package.id);
  }
  async function openCycle(id) {
    const packageId=view.package?.id,epoch=++view.cycleEpoch;
    const summary=view.cycles.find(row=>row.id===id),owner=summary?.packageIds.includes(packageId)?packageId:summary?.packageId;
    if(!owner)throw new Error('Select a saved cycle from this original package cohort.');
    view.working++;sync();
    try {
      const result=await context().client.cashCycle(owner,id);
      if(epoch!==view.cycleEpoch||packageId!==view.package?.id)return;
      view.selectedCycle=result.cashCycle;render();
    }finally{view.working--;sync();}
  }
  async function open(record,{cycleId}={}) {
    if(record?.id!==view.package?.id) {
      view.epoch++;view.cohortEpoch++;view.cycleEpoch++;view.sourceEpoch++;view.dialog?.close();
      view.package=record??null;view.packageIds=new Set(record?[record.id]:[]);
      view.packages=new Map(record?[[record.id,record]]:[]);view.importIds=new Set();view.files=[];
      view.asOf=context().data?.asOf??record?.asOf??new Date().toISOString().slice(0,10);
      view.label='';view.baselineCycleId='';view.cycles=[];view.selectedCycle=null;view.matches.clear();
      view.sourceBindings=[];view.preview=null;view.review=null;
    }else if(record){view.package=record;view.packages.set(record.id,record);}
    render();if(!record)return;await loadCohort();if(cycleId)await openCycle(cycleId);
  }

  function renderEntries(review,{saved=false}={}) {
    const entries=(review.entries??[]).filter(row=>saved||(!view.entryStatus||row.status===view.entryStatus)&&
      (!view.entryFilter||[row.key,row.kind,row.reference,row.documentNumber,row.customerName,row.paymentId,row.externalId,row.amount]
        .some(value=>String(value??'').toLowerCase().includes(view.entryFilter.toLowerCase()))));
    return table(['Source cash entry','Customer / document','Original amount and date','Outcome','Original ledger match','Review'],entries.map(row=>{
      const original=stack((row.reference||row.paymentId||row.externalId||short(row.key)),row.kind);
      const matched=saved?(row.native??row.matches??[]):
        (view.matches.get(row.key)?.native??(ready()?(row.native??row.matches??[]):[]));
      const matchText=Array.isArray(matched)?matched.map(item=>item.kind+' '+short(item.id)+' · '+text(item.amount)).join('; '):text(matched);
      const sourceInfo=el('div');sourceInfo.append(stack(money(row.amount,row.currency),row.date??'Date not supplied'));
      if(row.bankAmount!==undefined&&row.bankAmount!==null)sourceInfo.append(el('span','Bank amount '+text(row.bankAmount),{className:'subtext'}));
      if(row.isReconciled!==undefined&&row.isReconciled!==null)sourceInfo.append(el('span','Xero reconciled: '+String(row.isReconciled),{className:'subtext'}));
      const controls=el('div',null,{className:'actions'});
      if(!saved) {
        const edit=action(view.matches.has(row.key)?'Edit match':'Match ledger entry','match',row.key);edit.setAttribute('data-cash-edit','1');controls.append(edit);
        if(view.matches.has(row.key)){const clear=action('Clear','clear-match',row.key);clear.setAttribute('data-cash-edit','1');controls.append(clear);}
      }
      const pointers=row.sources??row.sourcePointers??row.source;
      if(pointers)controls.append(jsonDetails('Original source',pointers));
      return [original,stack(row.customerName||row.customerId,row.documentNumber||row.documentId),sourceInfo,
        stack(saved||ready()?row.status:'Review required',row.message),matchText||'Unmatched',controls];
    }),'Original provider cash and native customer matches');
  }
  function renderBindingRequests(review,saved) {
    const rows=review.unboundSources??review.bindingRequests??[];
    if(!rows.length||saved)return null;
    const section=el('section',null,{className:'review'});section.append(el('h4','Customer for original cash sources'));
    section.append(el('p','Select the native customer for an original prepayment or overpayment that has no invoice relationship. The saved source and explicit customer remain part of this cycle.',{className:'hint'}));
    section.append(table(['Original source','Provider contact','Customer'],rows.map(row=>{
      const found=view.sourceBindings.find(item=>item.kind===row.kind&&item.externalId===row.externalId);
      const control=selectControl([{value:'',label:'Select original customer'},...(context().data?.customers??[]).map(customer=>({
        value:customer.id,label:customer.name+' · '+(customer.reference??short(customer.id))}))],found?.customerId??'',
        {'data-cash-binding':JSON.stringify({kind:row.kind,externalId:row.externalId})});
      return [stack(row.externalId,row.kind),row.contactName??row.contactId??'—',control];
    }),'Explicit customer bindings for original cash sources'));
    return section;
  }
  function renderReport(review,{saved=false}={}) {
    const section=el('section',null,{className:'review',...(saved?{}:{'data-cash-live-review':'1'})});section.append(el('h3',saved?'Original saved review':'Cash reconciliation review'));
    const counts=el('div',null,{className:'metrics'});
    for(const [key,value]of Object.entries(review.counts??{}).filter(([,value])=>Number.isFinite(value)).slice(0,8)) {
      const metric=el('div',null,{className:'metric'});metric.append(el('strong',value),el('span',key.replace(/([A-Z])/g,' $1')));counts.append(metric);
    }
    if(counts.children.length)section.append(counts);
    section.append(el('p',text(review.status)+(review.summary?' · '+review.summary:'')));
    if(review.documents?.length)section.append(table(
      ['Original document','Native paid','Xero direct payments','Xero prepaid / overpaid cash','Native credit notes','Xero credit-note applications','Native amount due','Xero amount due','Outcome'],
      review.documents.map(row=>{
        const native=row.native??row.ledger??{},provider=row.provider??row.xero??{};
        return [stack(row.number||row.documentNumber||short(row.id||row.documentId),row.customerName||row.customerId),
          money(native.paid,row.currency),money(provider.directPayments??provider.amountPaid,row.currency),
          money(provider.prepaymentApplied??provider.prepayments,row.currency)+' / '+money(provider.overpaymentApplied??provider.overpayments,row.currency),
          money(native.credited,row.currency),money(provider.creditNotesApplied??provider.creditNotes,row.currency),
          money(native.amountDue,row.currency),money(provider.amountDue,row.currency),stack(row.status,row.message)];
      }),'Customer ledger and provider document cash balances'));
    const issues=review.issues??review.findings??[];
    if(issues.length) {
      const title=el('h4','Items to resolve'),list=el('ul',null,{className:'cash-findings'});
      for(const issue of issues)list.append(el('li',typeof issue==='string'?issue:
        (issue.message??issue.code)+(issue.documentNumber?' · '+issue.documentNumber:'')));
      section.append(title,list);
    }
    const bindings=renderBindingRequests(review,saved);if(bindings)section.append(bindings);
    if(!saved&&review.entries?.length) {
      const filters=el('div',null,{className:'toolbar'});
      const statuses=[...new Set(review.entries.map(row=>row.status).filter(Boolean))];
      filters.append(field('Find a cash entry',inputControl('search',view.entryFilter,{'data-cash-filter':'1',placeholder:'Payment, customer, document or reference'})),
        field('Outcome',selectControl([{value:'',label:'All outcomes'},...statuses.map(status=>({value:status,label:status}))],view.entryStatus,{'data-cash-status':'1'})));
      section.append(filters);
    }
    if(review.entries?.length) {
      const entries=el('div',null,{'data-cash-entry-table':saved?'saved':'current'});entries.append(renderEntries(review,{saved}));section.append(entries);
    }
    if(review.baseline||review.changes) {
      const changes=review.changes??review.baseline?.changes;
      section.append(el('h4','Changes from the original baseline'));
      if(Array.isArray(changes)&&changes.length)section.append(table(['Original entry','Change','Previous cycle','Current cycle'],changes.map(row=>[
        row.documentNumber??row.key??row.id,row.message??row.kind??row.change,changeValue(row.before??row.previous),changeValue(row.after??row.current)
      ]),'Changes across saved billing cycles'));
      else if(changes)section.append(jsonDetails('Cycle comparison',changes));
      else section.append(el('p','This review retains the selected baseline and its original customer balances.',{className:'hint'}));
    }
    section.append(el('p','Source '+text(review.sourceFingerprint)+' · review '+text(review.previewSha256),{className:'source-note mono'}));
    return section;
  }
  function candidates(entry) {
    const rows=view.review?.nativeRows??[];
    const explicit=entry.candidateKeys??entry.candidates?.map(item=>typeof item==='string'?item:keyOf(item));
    return rows.filter(row=>(explicit?
      explicit.includes(keyOf(row))||explicit.includes(row.id):
      !entry.documentId||!row.invoiceId||entry.documentId===row.invoiceId)&&
      (!entry.customerId||!row.customerId||entry.customerId===row.customerId)&&sameCurrency(entry.currency,row.currency));
  }
  function matchDialog(entryKey) {
    const entry=view.review?.entries?.find(row=>row.key===entryKey);
    if(!entry)throw new Error('Review the current original cash entry first.');
    view.dialog?.close();view.dialog?.remove();
    const dialog=el('dialog',null,{className:'cash-dialog'}),form=el('form'),rows=el('div'),detail=el('div');
    view.dialog=dialog;dialog.append(form);
    form.append(el('h3','Match original customer cash'),el('p',(entry.reference||entry.externalId||entry.paymentId||entry.key)+' · '+money(entry.amount,entry.currency)+' · '+(entry.date??'Date not supplied')));
    const eligible=candidates(entry),byKey=new Map(eligible.map(row=>[keyOf(row),row]));
    form.append(el('p','Choose original ledger entries and the exact portion supplied by this provider cash entry. A receipt may contain several bank credits; the ledger and source coverage remain visible below.',{className:'hint'}));
    const existing=view.matches.get(entryKey),portions=(existing?.native??[]).map(row=>({...row}));
    if(!portions.length)portions.push({kind:'',id:'',amount:entry.amount??''});
    const editors=[];
    function showDetail(row) {
      detail.replaceChildren();if(!row)return;
      detail.append(el('h4','Original ledger and bank source'));
      detail.append(el('p',(row.reference||row.id)+' · '+row.kind+' · '+money(row.amount,row.currency)+' · '+(row.date??row.allocatedDate??row.creditDate??row.refundDate??'Date not supplied')));
      if(row.receiptId)detail.append(el('p','Receipt '+row.receiptId,{className:'mono'}));
      if(row.bankSources?.length)detail.append(table(['Bank credit','Original amount','Date','Source group'],row.bankSources.map(source=>[
        source.reference||source.transactionId||source.rowId,source.splitAmount??source.sourceAmount,source.bookedDate,source.coverageKey??source.sourceRowSha256
      ]),'Original bank source coverage'));
      if(row.replacementReceiptIds?.length||row.replacesReceiptId)detail.append(el('p','Original receipt '+text(row.replacesReceiptId)+' · successors '+(row.replacementReceiptIds??[]).join(', '),{className:'source-note'}));
      if(row.lineage)detail.append(jsonDetails('Original dated cash history',row.lineage));
    }
    function addEditor(portion) {
      const container=el('div',null,{className:'cash-match-row'}),select=el('select',null,{'aria-label':'Original ledger entry'}),amount=inputControl('text',portion.amount,{inputmode:'decimal','aria-label':'Matched amount'}),remove=el('button','Remove',{type:'button'});
      select.append(opt('','Select original ledger entry'),...eligible.map(row=>opt(keyOf(row),
        row.kind+' · '+(row.documentNumber||row.reference||short(row.id))+' · '+money(row.amount,row.currency)+' · '+(row.date??''))));
      select.value=portion.kind&&portion.id?portion.kind+'/'+portion.id:'';
      container.append(field('Original ledger entry',select),field('Matched amount',amount),remove);rows.append(container);
      const editor={container,select,amount};editors.push(editor);
      select.addEventListener('change',()=>showDetail(byKey.get(select.value)));
      remove.addEventListener('click',()=>{container.remove();editors.splice(editors.indexOf(editor),1);});
    }
    for(const portion of portions)addEditor(portion);
    const add=el('button','Add another ledger portion',{type:'button'});add.addEventListener('click',()=>addEditor({kind:'',id:'',amount:''}));
    const reason=el('textarea',existing?.dateDifferenceReason??'',{rows:3,maxlength:3000});
    form.append(rows,add,field('Explain an original date difference',reason,'Use this when the provider date and native allocation or refund date differ.'),detail);
    const actions=el('div',null,{className:'actions'}),save=el('button','Keep this match',{type:'submit',className:'primary'}),cancel=el('button','Cancel',{type:'button'});
    actions.append(save,cancel);form.append(actions);cancel.addEventListener('click',()=>dialog.close());
    form.addEventListener('submit',event=>{
      event.preventDefault();
      try {
        if(!editors.length)throw new Error('Add an original ledger portion.');
        const native=[],used=new Set();let sum=0n;
        for(const editor of editors) {
          const original=byKey.get(editor.select.value);
          if(!original)throw new Error('Choose an original ledger entry for every portion.');
          if(used.has(editor.select.value))throw new Error('Choose each original ledger entry once in this cash match.');
          used.add(editor.select.value);
          const amount=editor.amount.value.trim(),units=exactUnits(amount,entry.currency);
          if(units<=0n)throw new Error('Use a positive exact amount for each matched portion.');
          sum+=units;native.push({kind:original.kind,id:original.id,amount});
        }
        if(entry.amount!=null&&sum>exactUnits(entry.amount,entry.currency))throw new Error('The matched portions exceed the original provider cash amount.');
        view.matches.set(entryKey,{entryKey,native,...(reason.value.trim()?{dateDifferenceReason:reason.value.trim()}:{})});
        changed();dialog.close();render();
      }catch(error){report(error);}
    });
    dialog.addEventListener('close',()=>{if(view.dialog===dialog)view.dialog=null;dialog.remove();});
    root.append(dialog);dialog.showModal();showDetail(byKey.get(editors[0]?.select.value));
  }
  root.addEventListener('input',event=>{
    const target=event.target;
    if(target.dataset.cashField!==undefined) {view[target.dataset.cashField]=target.value;changed(target.dataset.cashField==='asOf');}
    if(target.dataset.cashObserved!==undefined) {view.files[Number(target.dataset.cashObserved)].observedAt=target.value;changed(true);}
    if(target.dataset.cashFilter!==undefined) {
      view.entryFilter=target.value;
      const tableRoot=root.querySelector('[data-cash-entry-table="current"]');
      if(tableRoot&&view.review)tableRoot.replaceChildren(renderEntries(view.review));
      sync();
    }
  });
  root.addEventListener('change',event=>{
    const target=event.target;
    Promise.resolve().then(async()=>{
      if(target.dataset.cashPackage!==undefined) {
        if(target.checked)view.packageIds.add(target.dataset.cashPackage);else view.packageIds.delete(target.dataset.cashPackage);
        changed(true);await loadCohort();
      }else if(target.dataset.cashImport!==undefined) {
        if(target.checked)view.importIds.add(target.dataset.cashImport);else view.importIds.delete(target.dataset.cashImport);
        changed(true);
      }else if(target.dataset.cashUpload!==undefined)await chooseSources([...target.files]);
      else if(target.dataset.cashBinding!==undefined) {
        const row=JSON.parse(target.dataset.cashBinding);
        view.sourceBindings=view.sourceBindings.filter(item=>!(item.kind===row.kind&&item.externalId===row.externalId));
        if(target.value)view.sourceBindings.push({...row,customerId:target.value});
        changed();
      }else if(target.dataset.cashStatus!==undefined) {
        view.entryStatus=target.value;
        const tableRoot=root.querySelector('[data-cash-entry-table="current"]');
        if(tableRoot&&view.review)tableRoot.replaceChildren(renderEntries(view.review));
        sync();
      }else if(target.dataset.cashField!==undefined){view[target.dataset.cashField]=target.value;changed(target.dataset.cashField==='asOf');}
    }).catch(report);
  });
  root.addEventListener('click',event=>{
    const target=event.target.closest('[data-cash-action]');if(!target||target.disabled)return;
    const name=target.dataset.cashAction,value=target.dataset.cashValue;
    Promise.resolve().then(async()=>{
      if(name==='preview')await reviewCycle();
      else if(name==='capture')await saveCycle();
      else if(name==='remove-source'){view.files.splice(Number(value),1);changed(true);render();}
      else if(name==='match')matchDialog(value);
      else if(name==='clear-match'){view.matches.delete(value);changed();render();}
      else if(name==='clear-binding') {
        const original=JSON.parse(value);view.sourceBindings=view.sourceBindings.filter(row=>!(row.kind===original.kind&&row.externalId===original.externalId));
        changed();render();
      }
      else if(name==='cycle')await openCycle(value);
      else if(name==='close-cycle'){view.cycleEpoch++;view.selectedCycle=null;render();}
      else if(name==='baseline') {
        const cycle=view.selectedCycle;if(!cycle||cycle.id!==value)return;
        view.baselineCycleId=value;view.packageIds=new Set([...view.packageIds,...cycle.packageIds]);
        view.sourceBindings=structuredClone(cycle.selection.sourceBindings??[]);
        view.matches=new Map((cycle.selection.matches??[]).map(row=>[row.entryKey,structuredClone(row)]));
        view.importIds=new Set(cycle.selection.importIds??[]);view.files=[];view.label='';
        view.asOf=context().data?.asOf??view.asOf;view.selectedCycle=null;changed(true);await loadCohort();
      }else if(name==='archive') {
        const cycle=view.selectedCycle;if(!cycle||cycle.id!==value)return;
        const response=await context().client.cashExportFile(cycle.packageId,cycle.id);
        await host.downloadResponse(response,'xero-cash-'+cycle.id+'.tar');
      }else if(name==='cycle-file') {
        const cycle=view.selectedCycle;if(!cycle)return;
        const response=await context().client.cashFile(cycle.packageId,cycle.id,value);
        await host.downloadResponse(response,value);
      }
    }).catch(report);
  });
  return {open,render,sync,invalidate:()=>{changed();},
    onState:()=>{if(view.preview?.revision!==context().data?.revision)changed();},
    afterCapture:async(result)=>open(context().package,{cycleId:result.cashCycle?.id??result.operation?.result?.xeroCashCycleId})};
}
