// MIT. Explicit optional facilities in the original Forecast editor and reports.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const own=(v,k)=>Object.hasOwn(v,k);
const val=(node,name)=>node.querySelector('[name="'+name+'"]')?.value??'';
const optional=(node,name)=>val(node,name)===''?null:val(node,name);
const ids=(node,name)=>[...(node.querySelector('[name="'+name+'"]')?.selectedOptions||[])].map(x=>x.value);
const kinds=[['DRAW','Draw: cash in / principal increases'],['REPAYMENT','Principal repayment: cash out / debt decreases'],['INTEREST','Interest: explicit cash expense'],['FEE','Fee: explicit cash expense']];
export const newBridgeFacility=()=>({id:'facility-'+crypto.randomUUID(),name:'',currency:'USD',openingPrincipalUsd:null,creditLimitUsd:null,availableDate:null,maturityDate:null,termsBasis:'PLANNING_ASSUMPTION',sourceIds:[],note:'',events:[]});
export const newBridgeEvent=()=>({id:'event-'+crypto.randomUUID(),kind:'DRAW',amountUsd:null,date:null,note:''});

export function bridgeEventEditor(event,{field,button}){
 return '<fieldset data-forecast-bridge-event="'+esc(event.id)+'"><legend>Facility cash event</legend><div class="forecast-fields">'+
  field('Event kind','bridgeKind',event.kind,{options:kinds})+
  field('Cash date','bridgeDate',event.date,{type:'date',help:'After the as-of date; blank keeps timing unresolved.'})+
  field('Explicit amount (USD)','bridgeAmount',event.amountUsd,{help:'Blank means unknown. Zero is an explicit zero; interest is never calculated from an assumed rate.'})+
  field('Event source / assumption','bridgeEventNote',event.note,{area:true,wide:true})+
  '</div>'+button('Remove this event','remove-bridge-event')+'</fieldset>';
}
export function bridgeFacilityEditor(f,options){
 const {field,button,sourceOptions}=options;
 return '<fieldset data-forecast-bridge="'+esc(f.id)+'"><legend>'+esc(f.name||'Named USD facility')+'</legend><div class="forecast-fields">'+
  field('Facility name','bridgeName',f.name,{required:true,wide:true})+
  field('Principal outstanding at end of as-of date (USD)','bridgeOpening',f.openingPrincipalUsd,{help:'Existing debt only. This does not add cash; available borrowed proceeds belong in the original opening cash balance.'})+
  field('Outstanding-principal cap (USD)','bridgeLimit',f.creditLimitUsd,{help:'Blank means unknown. This is not a cumulative commitment or permission to redraw a term loan.'})+
  field('Original availability date','bridgeAvailable',f.availableDate,{type:'date'})+
  field('Original maturity date','bridgeMaturity',f.maturityDate,{type:'date'})+
  field('Terms basis','bridgeBasis',f.termsBasis,{options:[['NOT_ENTERED','Terms not entered'],['DOCUMENTED_TERMS','Retained documented terms'],['PLANNING_ASSUMPTION','Explicit planning assumption']]})+
  field('Original facility source attachments','bridgeSources',f.sourceIds,{options:sourceOptions,multiple:true,wide:true})+
  field('Terms, draw conditions and cost basis','bridgeNote',f.note,{area:true,wide:true,help:'Explain the entered USD schedule, any conversion, existing debt and contractual draw conditions. Review non-revolving utilization in the original source; this calculator does not authorize reborrowing.'})+
  '</div><div data-forecast-bridge-events>'+f.events.map(e=>bridgeEventEditor(e,options)).join('')+'</div><div class="forecast-actions">'+
  button('Add dated cash event','add-bridge-event')+button('Remove this facility','remove-bridge')+'</div></fieldset>';
}
export function bridgeEditor(inputs,options){
 const {field,button}=options;
 if(!own(inputs,'bridgeFunding'))return '<details><summary>Optional bridge funding</summary><p>Enter named USD facilities and their explicit cash dates, principal repayments, interest and fees. The original cash forecast remains visible.</p>'+button('Add bridge-funding schedule','start-bridge')+'</details>';
 return '<details open data-forecast-bridge-root><summary>Bridge funding: explicit USD schedules</summary><p>Draws are borrowing, not revenue. Principal repayments are debt settlement, not operating expense. All same-day draws precede repayments when checking the outstanding-principal cap. Daily cash is an end-of-day forecast.</p>'+
  '<div data-forecast-bridges>'+inputs.bridgeFunding.facilities.map(f=>bridgeFacilityEditor(f,options)).join('')+'</div>'+
  field('Overall bridge assumptions','bridgeFundingNote',inputs.bridgeFunding.note,{area:true,wide:true})+
  '<div class="forecast-actions">'+button('Add named facility','add-bridge')+button('Remove optional bridge schedule','remove-bridge-schedule')+'</div></details>';
}
export function readBridge(form){
 const section=form.querySelector('[data-forecast-bridge-root]');if(!section)return undefined;
 return {facilities:[...section.querySelectorAll('[data-forecast-bridge]')].map(f=>({
  id:f.dataset.forecastBridge,name:val(f,'bridgeName'),currency:'USD',openingPrincipalUsd:optional(f,'bridgeOpening'),
  creditLimitUsd:optional(f,'bridgeLimit'),availableDate:optional(f,'bridgeAvailable'),maturityDate:optional(f,'bridgeMaturity'),
  termsBasis:val(f,'bridgeBasis'),sourceIds:ids(f,'bridgeSources'),note:val(f,'bridgeNote'),
  events:[...f.querySelectorAll('[data-forecast-bridge-event]')].map(e=>({id:e.dataset.forecastBridgeEvent,
    kind:val(e,'bridgeKind'),amountUsd:optional(e,'bridgeAmount'),date:optional(e,'bridgeDate'),note:val(e,'bridgeEventNote')}))
 })),note:val(section,'bridgeFundingNote')};
}
export function validateBridgeDraft(value){
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v),need=(v,m)=>{if(!v)throw Error(m);};
 const optional=v=>v===null||typeof v==='string'||typeof v==='number'&&Number.isFinite(v);
 need(object(value)&&Object.keys(value).every(k=>['facilities','note'].includes(k))&&typeof value.note==='string'&&value.note.length<=8000&&Array.isArray(value.facilities)&&value.facilities.length<=30,'Retain the complete bridge-funding draft.');
 const seen=new Set();
 for(const f of value.facilities){
  need(object(f)&&Object.keys(f).every(k=>['id','name','currency','openingPrincipalUsd','creditLimitUsd','availableDate','maturityDate','termsBasis','sourceIds','note','events'].includes(k))&&
   typeof f.id==='string'&&f.id&&!seen.has(f.id)&&typeof f.name==='string'&&f.name.length<=200&&f.currency==='USD'&&
   ['openingPrincipalUsd','creditLimitUsd','availableDate','maturityDate'].every(k=>optional(f[k]))&&
   ['NOT_ENTERED','DOCUMENTED_TERMS','PLANNING_ASSUMPTION'].includes(f.termsBasis)&&Array.isArray(f.sourceIds)&&f.sourceIds.every(x=>typeof x==='string')&&
   typeof f.note==='string'&&f.note.length<=8000&&Array.isArray(f.events)&&f.events.length<=200,'Retain each original facility, unfinished value and source identity.');
  seen.add(f.id);const events=new Set();
  for(const e of f.events){need(object(e)&&Object.keys(e).every(k=>['id','kind','amountUsd','date','note'].includes(k))&&typeof e.id==='string'&&e.id&&!events.has(e.id)&&
    kinds.some(([k])=>k===e.kind)&&optional(e.amountUsd)&&optional(e.date)&&typeof e.note==='string'&&e.note.length<=4000,'Retain each original facility event and unfinished amount/date.');events.add(e.id);}
 }
 return JSON.parse(JSON.stringify(value));
}
export function bridgeReport(bridge,{table,usd}){
 if(!bridge)return '';
 const show=v=>v===null||v===undefined?'Unresolved':usd(v);
 const scenarios=Object.entries(bridge.scenarios).flatMap(([key,s])=>{
  const label={spendingOnly:'Existing obligations and grant work',conditionalGrant:'Conditional grant cash',commercial:'Selected customer cash'}[key];
  const result=[[esc(label),esc(show(s.unfinanced.gapAfterOpeningCashUsd)),esc(show(s.gapAfterOpeningCashUsd)),esc(show(s.endBalanceUsd)),esc(s.peakNeedDate||'Unresolved')]];
  if(!s.datedCashComplete)result.push([esc(label)+' — known dated portion','',esc(show(s.knownDatedPortion.gapAfterOpeningCashUsd)),esc(show(s.knownDatedPortion.endBalanceUsd)),esc(s.knownDatedPortion.peakNeedDate)]);
  return result;
 });
 return '<section class="forecast-bridge-report"><h4>Bridge funding and outstanding principal</h4><p>'+esc(bridge.basis)+'</p><p>'+esc(bridge.ordering)+'</p><p>'+esc(bridge.availabilityBasis)+'</p>'+
  '<p>Dated financing cash: '+(bridge.datedCashComplete?'all entered dates and amounts supplied':'partial — retain missing amounts and dates')+'. Contractual draw availability remains a separate source-term review.</p><div class="forecast-stats"><div><span>Opening principal</span><strong>'+esc(show(bridge.openingPrincipalUsd))+'</strong></div><div><span>Ending principal</span><strong>'+esc(show(bridge.endingPrincipalUsd))+'</strong></div><div><span>Entered cap / date feasibility</span><strong>'+esc(bridge.creditFeasibility.replaceAll('_',' ').toLowerCase())+'</strong></div></div>'+
  table(['Original scenario','Unfinanced gap after opening','Financed gap after opening','Financed ending cash','Financed peak-need date'],scenarios)+
  '<details open><summary>Named facilities</summary>'+table(['Facility / basis','Opening principal','Outstanding cap','Availability / maturity','Ending / peak debt','Cap / date review'],bridge.facilities.map(f=>[
   esc(f.name)+'<small>'+esc(f.termsBasis)+'</small>',esc(show(f.openingPrincipalUsd)),esc(show(f.creditLimitUsd)),
   esc(f.availableDate||'Unknown')+' / '+esc(f.maturityDate||'Unknown'),esc(show(f.endingPrincipalUsd))+' / '+esc(show(f.peakPrincipalUsd)),
   esc(f.creditFeasibility.replaceAll('_',' ').toLowerCase())+'<small>'+esc(f.note)+'</small>']))+'</details>'+
  '<details><summary>Every entered cash event</summary>'+table(['Facility','Event / date','Entered amount','Cash effect','Principal effect','Financing expense','Basis'],bridge.events.map(e=>[
   esc(e.facilityName),esc(e.kind)+' / '+esc(e.date||'Undated'),esc(show(e.amountUsd)),esc(show(e.cashEffectUsd)),esc(show(e.principalEffectUsd)),esc(show(e.financingExpenseUsd)),esc(e.note)]))+'</details>'+
  '<details><summary>Complete financed daily cash</summary>'+table(['Date','Draws','Repayments','Interest','Fees','Combined financed change','Combined ending cash'],bridge.days.map(d=>[esc(d.date),esc(show(d.drawUsd)),esc(show(d.repaymentUsd)),esc(show(d.interestUsd)),esc(show(d.feeUsd)),esc(show(d.commercialFinancedDeltaUsd)),esc(show(d.commercialFinancedBalanceUsd))]))+'</details>'+
  '<details><summary>Principal and limit progression</summary>'+table(['Facility','Date','Opening principal','Draws','Peak before repayments','Repayments','Closing principal'],bridge.principalDays.map(d=>[esc(d.facilityId),esc(d.date),esc(show(d.openingPrincipalUsd)),esc(show(d.drawUsd)),esc(show(d.peakBeforeRepaymentUsd)),esc(show(d.repaymentUsd)),esc(show(d.closingPrincipalUsd))]))+'</details>'+
  '<details'+(bridge.issues.length?' open':'')+'><summary>Financing decisions ('+bridge.issues.length+')</summary><ul>'+bridge.issues.map(i=>'<li><strong>'+esc(i.code)+'</strong> '+esc(i.id)+(i.eventId?' / '+esc(i.eventId):'')+': '+esc(i.message)+'</li>').join('')+'</ul></details><p>'+esc(bridge.note)+'</p></section>';
}
