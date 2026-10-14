/** Explicit original cash selection and complete Portfolio projections. */
export const PORTFOLIO_CASH_BASES=[
 ['SPENDING','Original spending only'],
 ['GRANT','Original spending with conditional grant'],
 ['COMMERCIAL','Original pooled grant and customer cash'],
 ['PROTECTED','Original customer-protected commercial cash'],
 ['FINANCED_SPENDING','Financed spending only'],
 ['FINANCED_GRANT','Financed conditional grant cash'],
 ['FINANCED_COMMERCIAL','Financed pooled commercial cash'],
 ['FINANCED_PROTECTED','Financed customer-protected commercial cash']
];
const measures=[['REQUIRED_STARTING_CASH','Required starting cash'],['GAP_AFTER_OPENING','Gap after entered opening cash']];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>v===null||v===undefined?'Unresolved':'USD '+esc(v);
const table=(head,rows)=>'<div class="portfolio-table"><table><thead><tr>'+head.map(v=>'<th scope="col">'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const select=(label,value,options,attr)=>'<label>'+esc(label)+'<select '+attr+'>'+options.map(([key,name])=>'<option value="'+esc(key)+'"'+(key===value?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>';
export function validateCashComparison(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['basis','measure','note'].includes(k)))throw Error('Retain the complete declared cash comparison.');
 if(!PORTFOLIO_CASH_BASES.some(([id])=>id===value.basis)||!measures.some(([id])=>id===value.measure))throw Error('Select a supported shared cash basis and measure.');
 if(typeof value.note!=='string'||value.note.length>8000||value.note.includes('\0'))throw Error('Retain a cash decision note of at most 8,000 characters.');
 return structuredClone(value);
}
export function renderCashComparisonEditor(value){
 return '<section class="portfolio-cash-choice" aria-label="Schedule cash comparison"><h4>Compare schedule cash</h4><p>One cash basis applies to the original forecast and every entered schedule. The original full cash results stay available. Finance and customer-protection inputs come from the selected saved Forecast.</p><div class="portfolio-fields">'+
 select('Cash basis',value?.basis||'',[['','Keep original comparison'],...PORTFOLIO_CASH_BASES],'data-portfolio-cash-basis')+
 (value?select('Cash measure',value.measure,measures,'data-portfolio-cash-measure')+'<label class="portfolio-wide">Comparison decision<textarea rows="3" maxlength="8000" data-portfolio-cash-note>'+esc(value.note)+'</textarea></label>':'')+
 '</div><p class="portfolio-muted">Required starting cash excludes the opening balance. Gap after opening uses the explicitly entered total once. A missing facility, reservation, date or valuation remains unresolved. Change source terms in Operating forecast, save a successor, then start its allocation.</p></section>';
}
function reasons(curve){
 return curve?.reasons?.length?'<ul class="portfolio-findings">'+curve.reasons.map(r=>'<li>'+esc(r.message)+'</li>').join('')+'</ul>':'<p>Selected dated cash and modeled constraints are complete.</p>';
}
function curves(projection){
 return table(['Cash basis','Required starting cash','Gap after opening','Ending available cash','Full source / selected dated cash','Comparable','Facility constraints'],projection.curves.map(r=>[
 esc(r.label),money(r.requiredStartingCashUsd),money(r.extraFundingAfterOpeningUsd),money(r.endAvailableCashUsd),
 esc((r.scopeValuationComplete?'Scope valued':'Scope unresolved')+' / '+(r.datedCashComplete?'dated cash complete':'dated cash unresolved')),
 r.financialComparisonEligible?'Yes':'No'+(r.reasons.length?'<br><small>'+esc(r.reasons.map(x=>x.message).join(' '))+'</small>':''),
 esc(r.creditFeasibility||'Not selected')
 ]));
}
export function renderCashComparisonAnalysis(report,chosen,{page=0,pager=()=>''}={}){
 if(!report.cashComparison)return '';
 const config=report.cashComparison,original=report.baseline.cashComparison,projection=chosen.summary?.cashComparison,selected=projection?.selected;
 const rows=report.comparison.map(row=>{const x=row.selectedCash;return[
 esc(row.name),esc(row.status),esc(row.finishDate||'Unscheduled'),esc(row.lateTasks??'—'),
 x?money(x.comparisonValueUsd):'Unresolved',money(row.selectedCashDeltaUsd),
 row.financialComparisonEligible?'Eligible':'Excluded',row.frontier===null?'Not compared':row.frontier?'Yes':'No',
 esc(row.financialComparisonReason)
 ];});
 let html='<section class="portfolio-cash-results" aria-label="Selected schedule cash"><h4>Selected cash comparison</h4><p>'+esc(config.basis)+'</p><p>'+esc(config.choice.note)+'</p>'+
 '<p>Common financing assessment through <strong>'+esc(config.assessmentEndDate)+'</strong>. Original forecast cash ends '+esc(original.originalForecastEndDate)+'. Work dates change each alternative\'s original expense timing; entered collection, debt and facility dates stay fixed.</p>'+
 table(['Alternative','Allocation','Finish','Late tasks','Selected measure','Change from original','Financial comparison','Frontier','Reason'],rows)+
 '<details><summary>Original forecast: every cash basis</summary>'+curves(original)+reasons(original.selected)+'</details>';
 if(projection){
  const days=projection.days,offset=Math.max(0,Math.min(page,Math.max(0,Math.ceil(days.length/40)-1)))*40;
  html+='<h5>'+esc(chosen.name)+' — '+esc(selected.label)+'</h5>'+reasons(selected)+
   '<div class="portfolio-metrics"><div><span>Selected dated measure</span><strong>'+money(selected.comparisonValueUsd)+'</strong></div><div><span>Known portion required cash</span><strong>'+money(selected.knownPortion.requiredStartingCashUsd)+'</strong></div><div><span>Ending principal</span><strong>'+(selected.principalComplete===null?'Not selected':money(selected.endingPrincipalUsd))+'</strong></div><div><span>Entered financing costs</span><strong>'+(selected.principalComplete===null?'Not selected':money(selected.datedFinancingExpenseUsd))+'</strong></div></div>'+
   '<p>Original cash ends '+esc(projection.originalForecastEndDate)+'; selected curve ends '+esc(selected.lastForecastDate||'Unresolved')+'. Known portions omit unknown flows or reserves and are neither a complete requirement nor a lower bound.</p>'+
   '<details><summary>Every cash basis for this allocation</summary>'+curves(projection)+'</details>'+
   '<details open><summary>Selected dated cash ('+days.length+')</summary>'+
   table(['Date','Before customer reservation','Customer reserve','Selected cumulative change','Available after opening','Known cumulative portion','Cumulative financing','Draw','Principal repayment','Interest','Fee'],days.slice(offset,offset+40).map(r=>[
    esc(r.date),money(r.cashBeforeReservationDeltaUsd),r.reservedCustomerFundsUsd===null?(selected.basis.includes('PROTECTED')?'Unresolved':'Not selected'):money(r.reservedCustomerFundsUsd),
    money(r.selectedDeltaUsd),money(r.selectedAvailableCashUsd),money(r.knownSelectedDeltaUsd),
    ...['financingDeltaUsd','drawUsd','repaymentUsd','interestUsd','feeUsd'].map(k=>r[k]===null?'Not selected':money(r[k]))
   ]))+pager('financing',Math.floor(offset/40),days.length,40)+'</details>';
  if(projection.assessedBridge){
   const b=projection.assessedBridge;
   html+='<details><summary>Original facility constraints through common assessment</summary>'+table(['Facility','Source basis','Availability','Maturity','Principal at maturity','Ending principal','Outstanding cap','State'],b.facilities.map(f=>[
    esc(f.name),esc(f.termsBasis),esc(f.availableDate||'Unentered'),esc(f.maturityDate||'Unentered'),
    f.maturityDate&&f.maturityDate>config.assessmentEndDate?'Beyond assessment':money(f.principalAtMaturityUsd),
    money(f.endingPrincipalUsd),money(f.creditLimitUsd),esc(f.creditFeasibility)
   ]))+(b.issues.length?'<ul class="portfolio-findings">'+b.issues.map(x=>'<li>'+esc(x.id)+': '+esc(x.message)+'</li>').join('')+'</ul>':'')+'</details>';
  }
 }
 return html+'<p>'+esc(original.reservationBasis)+'</p><p>'+esc(original.availabilityBasis)+'</p><p>'+esc(original.timingBasis)+'</p></section>';
}
