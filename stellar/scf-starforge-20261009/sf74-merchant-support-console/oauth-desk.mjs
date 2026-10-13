// MIT. OAuth source registration and retained observations in the existing Incident desk.
// The enclosing desk owns authenticated requests, configuration revision and worker lifetime.
import {oauthObservationHtml} from './oauth-render.mjs';

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
  ['windowMinutes','Original observation window (minutes)',5,1],
  ['unavailableMinimum','Minimum unavailable checks',1,1],
  ['unavailablePercent','Unavailable threshold percent',10,0],
  ['hostErrorMinimum','Minimum host callback errors',1,1],
  ['hostErrorPercent','Host callback error threshold percent',10,0]
];
const show=value=>value===null||value===undefined?'Not observed':
  typeof value==='object'?JSON.stringify(value):String(value);

/**
 * run(action) uses the enclosing Incident desk's existing busy/schedule lifecycle.
 * request(input) calls that desk's same-origin inspect-oauth operation.
 * Draft adoption only edits its existing configuration textarea.
 */
export function mountOAuthRegistration({
  root,readCurrent,readDraft,writeDraft,request,run,
  isBusy,isCurrentRevision,say,signal
}) {
  let epoch=0,review=null,choicesKey='',disposed=false;
  const panel=add(root,'section',undefined,'incident-oauth-registration');
  panel.id='incident-oauth-registration';panel.hidden=true;
  add(panel,'h3','Watch an original OAuth resource');
  add(panel,'p','Select an observation source registered in this console’s private startup configuration. Inspect its original resource and authority, then add that reviewed selection to the existing watcher draft.');
  add(panel,'p','Authentication and authorization counts are checks. Ordinary access, token and scope denials remain enforcement observations.','hint');
  const form=add(panel,'form'),grid=add(form,'div',undefined,'form-grid');
  const choiceLabel=add(grid,'label','Registered original observation source'),choice=add(choiceLabel,'select');
  choice.id='incident-oauth-source';
  const idLabel=add(grid,'label','Watcher source ID'),id=add(idLabel,'input');
  id.id='incident-oauth-id';id.required=true;id.maxLength=64;id.pattern='[A-Za-z0-9_-]{1,64}';id.autocomplete='off';
  const labelLabel=add(grid,'label','Source label'),label=add(labelLabel,'input');
  label.id='incident-oauth-label';label.required=true;label.maxLength=120;
  const identity=add(form,'div',undefined,'scope');identity.id='incident-oauth-identity';
  const settings=add(form,'details',undefined,'source-details');
  add(settings,'summary','Observation and condition settings');
  add(settings,'p','These settings apply to the original read-only observation and its existing SF93 conditions. A complete fresh window and observed successful checks are required before the original watcher can review recovery.','hint');
  const settingsGrid=add(settings,'div',undefined,'form-grid'),inputs={};
  for(const [key,title,value,min]of fields) {
    const field=add(settingsGrid,'label',title),input=add(field,'input');
    input.id='incident-oauth-'+key;input.type='number';input.value=String(value);
    input.min=String(min);input.step='1';input.required=true;
    if(key.endsWith('Percent'))input.max='100';
    inputs[key]=input;
  }
  const actions=add(form,'div',undefined,'actions'),inspect=add(actions,'button','Inspect original resource','secondary');
  inspect.id='incident-oauth-inspect';inspect.type='submit';
  const adopt=add(actions,'button','Add or replace source in draft','secondary');
  adopt.id='incident-oauth-add';adopt.type='button';
  const status=add(panel,'p','Choose a registered source to inspect.','hint');
  status.id='incident-oauth-review-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const facts=add(panel,'div',undefined,'scope');facts.id='incident-oauth-review-facts';
  const safeSay=(message,error=false)=>{if(!disposed&&!signal?.aborted)say(message,error);};
  const current=()=>readCurrent();
  const selected=()=>current()?.source.oauthResources?.find(row=>row.id===choice.value)??null;
  const ready=()=>!disposed&&!signal?.aborted&&!isBusy()&&current()&&isCurrentRevision();
  function fact(parent,name,value) {
    const row=add(parent,'div',undefined,'scope-row');add(row,'b',name);add(row,'span',show(value));
  }
  function drawIdentity() {
    identity.replaceChildren();const source=selected();
    if(!source)return;
    fact(identity,'Reviewed resource',source.resource);
    fact(identity,'Reviewed configuration SHA-256',source.configurationSha256);
    add(identity,'p','The original endpoint and credential reference are selected on the server. This form cannot grant access to another source.','hint');
  }
  function controls() {
    const unavailable=!ready();
    for(const input of [choice,id,label,...Object.values(inputs)])input.disabled=unavailable;
    inspect.disabled=unavailable||!selected();
    adopt.disabled=unavailable||!review;
  }
  function invalidate(message='Inspect the selected original resource before adding it to the draft.') {
    epoch++;review=null;facts.replaceChildren();status.textContent=message;status.className='hint';controls();
  }
  function input() {
    const state=current(),limits=Object.fromEntries(Object.entries(inputs).map(([key,node])=>[key,Number(node.value)]));
    if(Object.values(limits).some(value=>!Number.isSafeInteger(value)))throw new Error('Use whole numbers for observation settings.');
    return {oauthSourceId:choice.value,expectedConfigRevision:state.configRevision,...limits};
  }
  function formKey() {
    return JSON.stringify({source:current()?.source.id,input:input(),id:id.value,label:label.value});
  }
  function update() {
    if(disposed)return;
    const state=current(),choices=state?.source.oauthResources??[];
    panel.hidden=!choices.length;
    const key=JSON.stringify({source:state?.source.id??null,choices});
    if(key!==choicesKey) {
      choicesKey=key;invalidate();const prior=choice.value;choice.replaceChildren();
      for(const row of choices)add(choice,'option',row.label).value=row.id;
      if(choices.some(row=>row.id===prior))choice.value=prior;
      const chosen=selected();id.value=chosen?.id??'';label.value=chosen?.label??'';
      for(const [name,,value]of fields)inputs[name].value=String(value);
      drawIdentity();
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
        if(result.source?.id!==state.source.id||result.oauthSourceId!==source.id||
            result.configRevision!==body.expectedConfigRevision||
            result.schema!=='stellar-forge.sf93.oauth-source-review.v1')
          throw new Error('The OAuth review returned a different source or watcher revision.');
        if(result.oauth?.resource!==source.resource||
            result.oauth?.configurationSha256!==source.configurationSha256)
          throw new Error('The original resource or authority changed. Ask the host operator to review the private source selection before registering this observation.');
        if(result.sourceObservation?.configurationSha256!==undefined&&
            result.sourceObservation.configurationSha256!==result.oauth.configurationSha256)
          throw new Error('The original observation digest differs from its reviewed configuration.');
        review={key,configRevision:result.configRevision,result};
        facts.replaceChildren();
        fact(facts,'Observed resource',result.oauth.resource);
        fact(facts,'Observed configuration SHA-256',result.oauth.configurationSha256);
        fact(facts,'Observed at',result.observedAt);
        fact(facts,'Original source bytes',result.sourceObservation?.bytes??null);
        fact(facts,'Original session ID',result.sourceObservation?.sessionId??null);
        fact(facts,'Host callback configured',result.authority?.hostCallback??null);
        fact(facts,'Configured issuer entries',Array.isArray(result.authority?.servers)?result.authority.servers.length:null);
        fact(facts,'Resource closed at capture',result.state?.closed??null);
        fact(facts,'Observer errors',result.state?.observerErrors??null);
        const original=add(facts,'details',undefined,'source-details');
        add(original,'summary','Original authority and observer state');
        add(original,'pre',JSON.stringify({authority:result.authority??null,state:result.state??null},null,2)).tabIndex=0;
        status.textContent='Original resource inspected. Review the authority and observation settings, then add this exact selection to the watcher draft.';
        status.className='hint';safeSay('Original OAuth resource inspected.');
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
      const item={id:id.value,label:label.value,oauth:structuredClone(review.result.oauth)};
      const index=draft.merchants.findIndex(row=>row.id===item.id);
      if(index<0) {
        if(draft.merchants.length>=8)throw new Error('The watcher already has eight sources. Remove or replace an entry in the existing draft first.');
        draft.merchants.push(item);
      } else draft.merchants[index]=item;
      writeDraft(JSON.stringify(draft,null,2));
      status.textContent='Reviewed OAuth selection added to the draft. Apply the existing configuration form to register it with the original watcher.';
      safeSay('Original OAuth selection added to the watcher draft.');controls();
    } catch(error) {safeSay(error.message,true);}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void inspectSource();},{signal});
  adopt.addEventListener('click',addDraft,{signal});
  choice.addEventListener('change',()=>{
    invalidate();const chosen=selected();id.value=chosen?.id??'';label.value=chosen?.label??'';drawIdentity();controls();
  },{signal});
  for(const node of [id,label,...Object.values(inputs)])
    node.addEventListener('input',()=>invalidate(),{signal});
  function clear() {choicesKey='';invalidate();choice.replaceChildren();identity.replaceChildren();panel.hidden=true;}
  function destroy() {if(disposed)return;disposed=true;epoch++;review=null;panel.remove();}
  signal?.addEventListener('abort',destroy,{once:true});
  update();
  return {panel,update,controls,invalidate,clear,destroy};
}

export function renderOAuthStatus(parent,merchants) {
  parent.replaceChildren();
  const rows=(merchants??[]).filter(row=>row.kind==='OAUTH_RESOURCE');
  parent.hidden=!rows.length;if(!rows.length)return;
  add(parent,'h3','Original OAuth observations');
  for(const row of rows) {
    const box=add(parent,'section',undefined,'runtime-capture');
    if(row.observation)box.innerHTML=oauthObservationHtml(row.observation,{title:row.label});
    else {
      add(box,'h4',row.label);
      add(box,'p','No retained original observation is available yet. The existing watcher keeps this registered resource and its original capture history.','hint');
    }
  }
}
export function renderOAuthDetail(parent,observations) {
  parent.replaceChildren();
  for(const [side,summary]of Object.entries(observations??{})) {
    const box=add(parent,'div');
    box.innerHTML=oauthObservationHtml(summary,{title:(side==='before'?'Before':'After')+' original OAuth capture'});
  }
}
