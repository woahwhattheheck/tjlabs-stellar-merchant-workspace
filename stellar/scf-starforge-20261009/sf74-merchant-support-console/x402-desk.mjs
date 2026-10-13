// MIT. X402 source registration and retained observations in the existing Incident desk.
// The enclosing desk owns authenticated requests, configuration revision and worker lifetime.
import {mountX402Observation} from './x402-render.mjs';

const add=(parent,tag,text,cls='')=>{
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(cls)node.className=cls;
  parent.append(node);return node;
};
const sourceId=/^[A-Za-z0-9_-]{1,64}$/;
const forbidden=new Set(['__proto__','constructor','prototype']);
const fields=[
  ['timeoutMs','Source deadline (milliseconds)',5000,100],
  ['paymentAfterSeconds','Unresolved payment age (seconds)',300,1],
  ['outputAfterSeconds','Verified receipt awaiting output (seconds)',300,1]
];
const show=value=>value===null||value===undefined?'Not observed':
  typeof value==='object'?JSON.stringify(value):String(value);

/**
 * run(action) uses the enclosing Incident desk's existing busy/schedule lifecycle.
 * request(input) calls that desk's same-origin inspect-x402 operation.
 * Draft adoption only edits its existing configuration textarea.
 */
export function mountX402Registration({
  root,readCurrent,readDraft,writeDraft,request,run,
  isBusy,isCurrentRevision,say,signal
}) {
  let epoch=0,review=null,choicesKey='',disposed=false;
  const panel=add(root,'section',undefined,'incident-x402-registration');
  panel.id='incident-x402-registration';panel.hidden=true;
  add(panel,'h3','Watch merchant payment and delivery');
  add(panel,'p','Select an observation source registered in this console’s private startup configuration. Inspect its original resource and authority, then add that reviewed selection to the existing watcher draft.');
  add(panel,'p','The read-only source keeps original receipt verification, unresolved attempts and fulfillment outcomes separate. Repairs use the original merchant operation.','hint');
  const form=add(panel,'form'),grid=add(form,'div',undefined,'form-grid');
  const choiceLabel=add(grid,'label','Registered original observation source'),choice=add(choiceLabel,'select');
  choice.id='incident-x402-source';
  const idLabel=add(grid,'label','Watcher source ID'),id=add(idLabel,'input');
  id.id='incident-x402-id';id.required=true;id.maxLength=64;id.pattern='[A-Za-z0-9_-]{1,64}';id.autocomplete='off';
  const labelLabel=add(grid,'label','Source label'),label=add(labelLabel,'input');
  label.id='incident-x402-label';label.required=true;label.maxLength=120;
  const identity=add(form,'div',undefined,'scope');identity.id='incident-x402-identity';
  const settings=add(form,'details',undefined,'source-details');
  add(settings,'summary','Observation and condition settings');
  add(settings,'p','These settings apply to the original read-only observation and its existing SF93 conditions. A complete fresh observation is required before the original watcher can review recovery.','hint');
  const settingsGrid=add(settings,'div',undefined,'form-grid'),inputs={};
  const pollingLabel=add(settingsGrid,'label','Observation polling'),polling=add(pollingLabel,'select');
  polling.id='incident-x402-polling';
  const fullPolling=add(polling,'option','Full original history');fullPolling.value='full';
  add(polling,'option','Complete conditions with bounded detail').value='summary';
  add(settings,'p','Summary polling keeps complete condition totals and obtains the full original capture when incidents or the source change and at the configured capture interval. A private reviewed-input pin is preserved during inspection and draft adoption.','hint');
  for(const [key,title,value,min]of fields) {
    const field=add(settingsGrid,'label',title),input=add(field,'input');
    input.id='incident-x402-'+key;input.type='number';input.value=String(value);
    input.min=String(min);input.step='1';input.required=true;
    if(key.endsWith('Percent'))input.max='100';
    inputs[key]=input;
  }
  const actions=add(form,'div',undefined,'actions'),inspect=add(actions,'button','Inspect original resource','secondary');
  inspect.id='incident-x402-inspect';inspect.type='submit';
  const adopt=add(actions,'button','Add or replace source in draft','secondary');
  adopt.id='incident-x402-add';adopt.type='button';
  const status=add(panel,'p','Choose a registered source to inspect.','hint');
  status.id='incident-x402-review-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const facts=add(panel,'div',undefined,'scope');facts.id='incident-x402-review-facts';
  const safeSay=(message,error=false)=>{if(!disposed&&!signal?.aborted)say(message,error);};
  const current=()=>readCurrent();
  const selected=()=>current()?.source.x402Merchants?.find(row=>row.id===choice.value)??null;
  const ready=()=>!disposed&&!signal?.aborted&&!isBusy()&&current()&&isCurrentRevision();
  function fact(parent,name,value) {
    const row=add(parent,'div',undefined,'scope-row');add(row,'b',name);add(row,'span',show(value));
  }
  function drawIdentity() {
    identity.replaceChildren();const source=selected();
    if(!source)return;
    fact(identity,'Reviewed merchant store',source.storeId);
    fact(identity,'Reviewed configuration SHA-256',source.configurationSha256);
    fact(identity,'Configured polling',source.polling??'full');
    if(source.inputsSha256!==undefined)fact(identity,'Pinned reviewed inputs SHA-256',source.inputsSha256);
    add(identity,'p','The original endpoint and credential reference are selected on the server. This form cannot grant access to another source.','hint');
  }
  function selectPolling() {
    const source=selected();
    fullPolling.disabled=source?.inputsSha256!==undefined;
    polling.value=source?.polling??'full';
  }
  function controls() {
    const unavailable=!ready();
    for(const input of [choice,id,label,polling,...Object.values(inputs)])input.disabled=unavailable;
    inspect.disabled=unavailable||!selected();
    adopt.disabled=unavailable||!review;
  }
  function invalidate(message='Inspect the selected original resource before adding it to the draft.') {
    epoch++;review=null;facts.replaceChildren();status.textContent=message;status.className='hint';controls();
  }
  function input() {
    const state=current(),limits=Object.fromEntries(Object.entries(inputs).map(([key,node])=>[key,Number(node.value)]));
    if(Object.values(limits).some(value=>!Number.isSafeInteger(value)))throw new Error('Use whole numbers for observation settings.');
    return {x402SourceId:choice.value,expectedConfigRevision:state.configRevision,polling:polling.value,...limits};
  }
  function formKey() {
    return JSON.stringify({source:current()?.source.id,input:input(),id:id.value,label:label.value});
  }
  function update() {
    if(disposed)return;
    const state=current(),choices=state?.source.x402Merchants??[];
    panel.hidden=!choices.length;
    const key=JSON.stringify({source:state?.source.id??null,choices});
    if(key!==choicesKey) {
      choicesKey=key;invalidate();const prior=choice.value;choice.replaceChildren();
      for(const row of choices)add(choice,'option',row.label).value=row.id;
      if(choices.some(row=>row.id===prior))choice.value=prior;
      const chosen=selected();id.value=chosen?.id??'';label.value=chosen?.label??'';
      for(const [name,,value]of fields)inputs[name].value=String(value);
      selectPolling();drawIdentity();
    }
    if(review&&review.configRevision!==state?.configRevision)
      invalidate('Watcher settings changed. Inspect this original resource against the current revision.');
    controls();
  }
  async function inspectSource() {
    if(!ready()||!form.reportValidity()||!selected())return;
    invalidate('Reading the original registered observation…');
    const state=current(),source=selected(),selectedEpoch=epoch,key=formKey(),body=input();
    try {
      await run(async()=>{
        const result=await request(body);
        if(disposed||signal?.aborted||epoch!==selectedEpoch||key!==formKey()||
            current()?.source.id!==state.source.id)return;
        if(result.source?.id!==state.source.id||result.x402SourceId!==source.id||
            result.configRevision!==body.expectedConfigRevision||
            result.schema!=='stellar-forge.sf93.x402-source-review.v1')
          throw new Error('The X402 review returned a different source or watcher revision.');
        if(['storeId','tenantId','resourceVersionId','configurationSha256'].some(k=>result.x402?.[k]!==source[k]))
          throw new Error('The original resource or authority changed. Ask the host operator to review the private source selection before registering this observation.');
        if((result.x402?.polling??'full')!==body.polling||result.x402?.inputsSha256!==source.inputsSha256)
          throw new Error('The inspected polling mode or original reviewed-input pin changed. Inspect the selected source again.');
        if(result.sourceObservation?.configurationSha256!==undefined&&
            result.sourceObservation.configurationSha256!==result.x402.configurationSha256)
          throw new Error('The original observation digest differs from its reviewed configuration.');
        review={key,configRevision:result.configRevision,result};
        facts.replaceChildren();
        fact(facts,'Observed merchant store',result.x402.storeId);
        fact(facts,'Observed configuration SHA-256',result.x402.configurationSha256);
        fact(facts,'Reviewed polling',result.x402.polling??'full');
        if(result.x402.inputsSha256!==undefined)fact(facts,'Pinned reviewed inputs SHA-256',result.x402.inputsSha256);
        fact(facts,'Observed at',result.observedAt);
        fact(facts,'Original source bytes',result.sourceObservation?.bytes??null);
        fact(facts,'Original owner runtime',result.sourceObservation?.runtimeId??null);
        fact(facts,'Tenant',result.x402.tenantId);
        fact(facts,'Resource version',result.x402.resourceVersionId);
        fact(facts,'Complete source SHA-256',result.sourceObservation?.sha256??null);
        const original=add(facts,'details',undefined,'source-details');
        add(original,'summary','Original record counts');
        add(original,'pre',JSON.stringify(result.sourceObservation?.counts??null,null,2)).tabIndex=0;
        status.textContent='Original resource inspected. Review the authority and observation settings, then add this exact selection to the watcher draft.';
        status.className='hint';safeSay('Original merchant inspected.');
      });
    } catch(error) {
      if(!disposed&&!signal?.aborted&&epoch===selectedEpoch) {
        review=null;status.textContent=error.message;status.className='status error';safeSay(error.message,true);
      }
    } finally {controls();}
  }
  function addDraft() {
    if(!ready()||!review||!form.reportValidity())return;
    try {
      const state=current();
      if(review.configRevision!==state.configRevision||review.key!==formKey())
        throw new Error('The reviewed source selection or watcher revision changed. Inspect the original source again.');
      if(!sourceId.test(id.value)||forbidden.has(id.value))throw new Error('Use a distinct valid watcher source ID.');
      const draft=JSON.parse(readDraft());
      if(!Array.isArray(draft.merchants))throw new Error('Use the existing watcher configuration before adding a source.');
      const item={id:id.value,label:label.value,x402:structuredClone(review.result.x402)};
      const index=draft.merchants.findIndex(row=>row.id===item.id);
      if(index<0) {
        if(draft.merchants.length>=8)throw new Error('The watcher already has eight sources. Remove or replace an entry in the existing draft first.');
        draft.merchants.push(item);
      } else draft.merchants[index]=item;
      writeDraft(JSON.stringify(draft,null,2));
      status.textContent='Reviewed merchant selection added to the draft. Apply the existing configuration form to register it with the original watcher.';
      safeSay('Original merchant selection added to the watcher draft.');controls();
    } catch(error) {safeSay(error.message,true);}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void inspectSource();},{signal});
  adopt.addEventListener('click',addDraft,{signal});
  choice.addEventListener('change',()=>{
    invalidate();const chosen=selected();id.value=chosen?.id??'';label.value=chosen?.label??'';selectPolling();drawIdentity();controls();
  },{signal});
  polling.addEventListener('change',()=>invalidate(),{signal});
  for(const node of [id,label,...Object.values(inputs)])
    node.addEventListener('input',()=>invalidate(),{signal});
  function clear() {choicesKey='';invalidate();choice.replaceChildren();identity.replaceChildren();panel.hidden=true;}
  function destroy() {if(disposed)return;disposed=true;epoch++;review=null;panel.remove();}
  signal?.addEventListener('abort',destroy,{once:true});
  update();
  return {panel,update,controls,invalidate,clear,destroy};
}

export function renderX402Status(parent,merchants) {
  parent.replaceChildren();
  const rows=(merchants??[]).filter(row=>row.kind==='X402_MERCHANT');
  parent.hidden=!rows.length;if(!rows.length)return;
  add(parent,'h3','Merchant payment and delivery observations');
  for(const row of rows) {
    const box=add(parent,'section',undefined,'runtime-capture');
    if(row.observation)mountX402Observation(box,row.observation,row.label);
    else {
      add(box,'h4',row.label);
      add(box,'p','No retained original observation is available yet. The existing watcher keeps this registered resource and its original capture history.','hint');
    }
  }
}
export function renderX402Detail(parent,observations) {
  parent.replaceChildren();
  for(const [side,summary]of Object.entries(observations??{})) {
    const box=add(parent,'div');
    mountX402Observation(box,summary,(side==='before'?'Before':'After')+' original merchant capture');
  }
}
