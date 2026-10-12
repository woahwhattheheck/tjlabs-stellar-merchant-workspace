import {mountStatements} from './operations_statements.mjs';
import {mountForecast} from './forecast.mjs';
import {mountPortfolio} from './portfolio.mjs';
import {mountSupportDelivery} from './operations_support.mjs';
import {mountBuyerReceiving} from './operations_buyer.mjs';
import {mountCompletion} from './operations_completion.mjs';
import {mountEngagements} from './operations_engagements.mjs';
import {mountDeliveryCalendar} from './operations_calendar.mjs';
import {mountCohort} from './operations_cohort.mjs';
import {mountInstallations} from './operations_installations.mjs';
import {mountInstallationReturns} from './operations_installation_returns.mjs';
import {mountDispatch} from './operations_dispatch.mjs';
import {mountPerformance} from './operations_performance.mjs';
import {mountLedgerIntake} from './operations_ledger_intake.mjs';
import {mountPayables} from './operations_payables.mjs';
import {mountCashAccounts} from './operations_cash_accounts.mjs';
import {mountImplementationEvidence} from './operations_implementation.mjs';
import {mountAmendments} from './operations_amendments.mjs';
import {mountWorkIntake} from './operations_work_intake.mjs';
import {mountCommercialReceivables} from './operations_commercial.mjs';

const retainedStatementSessions=new Map();
const retainedSupportSessions=new Map();
const retainedBuyerSessions=new Map();
const retainedCompletionSessions=new Map();
const retainedEngagementSessions=new Map();
const retainedCalendarSessions=new Map();
const retainedCohortSessions=new Map();
const retainedInstallationSessions=new Map();
const retainedInstallationReturnSessions=new Map();
const retainedDispatchSessions=new Map();
const retainedPerformanceSessions=new Map();
const retainedLedgerIntakeSessions=new Map();
const retainedPayablesSessions=new Map();
const retainedCashAccountSessions=new Map();
const retainedImplementationSessions=new Map();
const retainedAmendmentSessions=new Map();
const retainedWorkIntakeSessions=new Map();
const retainedCommercialSessions=new Map();

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title = value => String(value ?? '').toLowerCase().replaceAll('_',' ').replace(/^./, c => c.toUpperCase());
const money = value => value === null || value === undefined ? 'Unvalued' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value));
const date = () => new Date().toISOString().slice(0,10);
const timestamp = () => new Date().toISOString();
const labels = {contributors:'Contributors',work:'Recorded work',invoices:'Invoices',cash:'Observed cash',awards:'Issuer events',deployments:'Deployments',purchases:'Purchase observations',outcomes:'Delivery outcomes'};
const singular = {contributors:'contributor',work:'work',invoices:'invoice',cash:'cash',awards:'award',deployments:'deployment',purchases:'purchase',outcomes:'outcome'};
const values = (...choices) => choices.map(value => [value,title(value)]);
const choices = {
  mode: values('OPERATIONS','WALKTHROUGH'), person:values('PERSON','ORGANIZATION','TEAM','ROLE'),
  funding:values('PREAWARD','GRANT','CUSTOMER','INTERNAL'), direction:values('IN','OUT'),
  category:values('GRANT','INVOICE','CUSTOMER','CAPITAL','REFUND','OTHER'),
  stage:values('INTEREST_ACKNOWLEDGED','INVITED','SUBMITTED','AWARDED','DECLINED','WITHDRAWN'),
  role:values('MERCHANT','BUYER','BOTH'),participant:values('TEAM_OPERATED','INDEPENDENT_OPERATOR','CUSTOMER'),
  environment:values('LOCAL','TESTNET','MAINNET','OTHER'),
  deployment:values('PLANNED','INSTALLED','OPERATING','HANDED_OVER','RETIRED'),
  settlement:values('UNKNOWN','PENDING','SETTLED','FAILED'),output:values('UNKNOWN','PARTIAL','COMPLETE','FAILED'),
  attempt:values('APPROVED','ATTEMPTED','NOT_ATTEMPTED','CANCELLED'),
  order:values('NOT_APPLICABLE','PENDING','FULFILLED','CANCELLED','REFUNDED'),
  origin:values('NATIVE','RECOVERED','SOURCE_SUMMARY','OPERATOR_ENTRY'),
  outcome:values('IN_PROGRESS','SUBMITTED','ACCEPTED','CHANGES_REQUESTED','WITHDRAWN')
};
const button = (label, action, data='', disabled=false) => '<button type="button" data-ops-action="'+action+'" '+data+(disabled?' disabled data-ops-fixed="true"':'')+'>'+esc(label)+'</button>';
const table = (head, rows) => '<div class="ops-table"><table><thead><tr>'+head.map(x=>'<th scope="col">'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const empty = text => '<p class="ops-empty">'+esc(text)+'</p>';
function b64(buffer) {let out='';const bytes=new Uint8Array(buffer);for(let n=0;n<bytes.length;n+=8192)out+=String.fromCharCode(...bytes.subarray(n,n+8192));return btoa(out);}
function downloadFile(raw,filename,type='application/json') {const url=URL.createObjectURL(raw instanceof Blob?raw:new Blob([raw],{type}));const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}

export function mountOperations({container,api:transport,plan,inform:notify,mutationId}) {
  const root=document.createElement('section');root.className='operations';root.setAttribute('aria-label','Delivery and cash operations');container.replaceChildren(root);
  const view={cases:[],current:null,tab:'overview',busy:false,events:[],nextAfter:null,form:null};
  let active=true,statementView=null,forecastView=null,forecastViewCase=null,portfolioView=null,supportView=null,completionView=null,calendarView=null,buyerView=null,cohortView=null,installationView=null,installationReturnView=null,dispatchView=null,implementationView=null,engagementView=null,performanceView=null,ledgerIntakeView=null,payablesView=null,cashAccountView=null,commercialView=null,workIntakeView=null,amendmentView=null;
  let localBusy=false,hostBusy=false;
  view.forecastId=null;view.forecastDraft=null;view.portfolioId=null;
  const available=()=>active&&root.isConnected;
  function requireActive() {if(!available()){const error=new Error('This operations view is closed. Reopen the retained case to continue.');error.code='OPERATIONS_VIEW_CLOSED';throw error;}}
  function dispose() {active=false;forecastView?.dispose();portfolioView?.dispose();supportView?.dispose();completionView?.dispose();calendarView?.dispose();buyerView?.dispose();cohortView?.dispose();installationView?.dispose();installationReturnView?.dispose();dispatchView?.dispose();implementationView?.dispose();statementView?.dispose();performanceView?.dispose();engagementView?.dispose();ledgerIntakeView?.dispose();payablesView?.dispose();cashAccountView?.dispose();commercialView?.dispose();workIntakeView?.dispose();amendmentView?.dispose();const dialog=root.querySelector('dialog.ops-dialog');if(dialog?.open)dialog.close();}
  const inform=(...args)=>{if(available())notify(...args);};
  const download=(...args)=>{if(available())downloadFile(...args);};
  async function api(...args) {
    requireActive();
    // A dispatched mutation retains its original request/receipt on the server.
    // Closing this view suppresses later UI work without issuing it again.
    const value=await transport(...args);
    requireActive();return value;
  }
  let actor='';try{actor=sessionStorage.getItem('sf47.operations.actor')||'';}catch{}
  const $=selector=>root.querySelector(selector);
  const options=kind=>(view.current?.records[kind]||[]).map(row=>[row.id,row.name||row.number||row.description||row.id]);
  const costs=()=>view.current.plan.scenario.future_costs.map(row=>[row.id,row.id]);
  const sourceOptions=()=>view.current.sources.map(row=>[row.id,row.filename+' · '+row.sha256.slice(0,12)]);
  const sourceText=row=>(row.sourceIds?.length?row.sourceIds.length+' retained source'+(row.sourceIds.length===1?'':'s'):'Operator entry');
  const name=(kind,id)=>(view.current.records[kind].find(row=>row.id===id)||{}).name||id||'Unassigned';
  const editable=()=>view.current?.program.state==='OPEN';
  const kindButton=(label,kind,row=null)=>button(label,'record','data-kind="'+kind+'"'+(row?' data-id="'+row.id+'"':''),!editable());
  const transition=(label,action,row)=>button(label,'transition','data-command="'+action+'" data-id="'+row.id+'"',!editable());
  function field(label,key,value='',config={}) {
    const attrs=' name="'+esc(key)+'"'+(config.required?' required':'')+(config.readonly?' readonly':'');
    let input;
    if(config.options) input='<select'+attrs+(config.multiple?' multiple size="4"':'')+'>'+config.options.map(([id,text])=>'<option value="'+esc(id)+'"'+((config.multiple?(value||[]).includes(id):String(value??'')===String(id))?' selected':'')+'>'+esc(text)+'</option>').join('')+'</select>';
    else if(config.area)input='<textarea'+attrs+' rows="'+(config.rows||3)+'">'+esc(value)+'</textarea>';
    else input='<input'+attrs+' type="'+(config.type||'text')+'" value="'+esc(value)+'"'+(config.type==='number'?' step="'+(config.step||'1')+'"':'')+'>';
    return '<label class="'+(config.wide?'ops-wide':'')+'">'+esc(label)+input+(config.help?'<small>'+esc(config.help)+'</small>':'')+'</label>';
  }
  const optional=(list,label='Unassigned')=>[['',label],...list];
  const commonSource=row=>'<fieldset class="ops-wide"><legend>Original sources</legend><div class="ops-fields">'+field('Retained attachments','sourceIds',row.sourceIds||[],{options:sourceOptions(),multiple:true,wide:true})+field('Original reference and observation','sourceNote',row.sourceNote||'',{area:true,wide:true,help:'Attach documents in Sources. A direct operator entry remains labeled as such.'})+'</div></fieldset>';
  const flag=value=>'<span class="ops-state">'+esc(title(value))+'</span>';
  function applyBusy() {
    const value=localBusy||hostBusy;
    view.busy=value;root.setAttribute('aria-busy',String(value));
    root.querySelectorAll('button,input,select,textarea').forEach(el=>{if(!el.closest('.operating-forecast,.portfolio,.support-delivery,.completion-desk,.grant-delivery-calendar,.buyer-receiving,.cohort-desk,.installation-desk,.installation-return-desk,.delivery-queue,.implementation-evidence-desk,.engagement-desk,.statement-desk,.budget-performance,.ledger-intake,.supplier-accounts,.cash-account-desk,.commercial-desk,.work-intake-desk,.plan-amendments'))el.disabled=value||el.dataset.opsFixed==='true';});
    forecastView?.setHostBusy(value);portfolioView?.setHostBusy(value);supportView?.setHostBusy(value);completionView?.setHostBusy(value);calendarView?.setHostBusy(value);buyerView?.setHostBusy(value);cohortView?.setHostBusy(value);installationView?.setHostBusy(value);installationReturnView?.setHostBusy(value);dispatchView?.setHostBusy(value);implementationView?.setHostBusy(value);statementView?.setHostBusy(value);performanceView?.setHostBusy(value);engagementView?.setHostBusy(value);ledgerIntakeView?.setHostBusy(value);amendmentView?.setHostBusy(value);payablesView?.setHostBusy(value);cashAccountView?.setHostBusy(value);commercialView?.setHostBusy(value);workIntakeView?.setHostBusy(value);
  }
  function setBusy(value) {localBusy=Boolean(value);applyBusy();}
  function setHostBusy(value) {hostBusy=Boolean(value);if(available())applyBusy();}
  function alertError(error) {if(!available())return;inform(error.message,true);const target=$('[data-ops-message]');if(target){target.textContent=error.message;target.setAttribute('role','alert');}}
  async function run(action) {if(view.busy||!available())return;setBusy(true);try{await action();}catch(error){alertError(error);}finally{if(available())setBusy(false);}}
  function recordingActor() {requireActive();const value=($('[name=recordingActor]')?.value||actor).trim();if(!value)throw new Error('Enter the recording operator before saving.');actor=value;try{sessionStorage.setItem('sf47.operations.actor',value);}catch{}return value;}
  async function loadCases(prefer) {
    view.cases=(await api('/api/operations')).cases;
    let retained;try{retained=sessionStorage.getItem('sf47.operations.case.'+plan.id);}catch{}
    const target=prefer||view.cases.find(row=>row.id===retained)?.id||view.cases[0]?.id;
    if(view.current?.program.id!==target){view.forecastId=null;view.forecastDraft=null;view.portfolioId=null;}
    view.current=target?await api('/api/operations/'+target):null;
    if(target)try{sessionStorage.setItem('sf47.operations.case.'+plan.id,target);}catch{}
    view.events=[];view.nextAfter=null;render();
  }
  async function refresh() {const current=view.current.program.id;view.current=await api('/api/operations/'+current);view.cases=(await api('/api/operations')).cases;view.events=[];view.nextAfter=null;render();}
  async function command(action,data={},note='') {
    requireActive();
    const payload={expectedVersion:view.current.program.version,actor:recordingActor(),note,action,data};
    payload.requestId=await mutationId('operations:'+view.current.program.id,payload);
    const result=await api('/api/operations/'+view.current.program.id+'/command',payload);
    await refresh();inform('Saved '+title(action.replace('.',' '))+' · operations version '+result.version+'.');return result;
  }
  function heading(label,description,actions='') {return '<div class="ops-heading"><div><h3>'+esc(label)+'</h3><p>'+esc(description)+'</p></div><div class="ops-actions">'+actions+'</div></div>';}
  function overview() {
    const c=view.current,r=c.report;
    const stats=[['Recorded cash in',money(r.cash.inUsd),'Observed amounts with a USD value'],['Recorded cash out',money(r.cash.outUsd),'Payments and other outflows'],['Net recorded cash',money(r.cash.netUsd),'Forecast capital and payouts excluded'],['Open invoices',money(r.cash.openInvoiceUsd),'Including disputed balances']];
    return heading('Plan and recorded results','The selected saved plan is immutable here. New planning revisions do not rewrite this case.')
      +'<div class="ops-stats">'+stats.map(([a,b,c])=>'<div><span>'+esc(a)+'</span><strong>'+esc(b)+'</strong><small>'+esc(c)+'</small></div>').join('')+'</div>'
      +'<p><strong>Issuer stage:</strong> '+esc(title(r.applicationStage))+'. <strong>Observed grant receipts:</strong> '+esc(money(r.cash.grantReceiptsUsd))+'. <strong>Conditional plan request:</strong> '+esc(money(r.plan.requestUsd))+'.</p>'
      +heading('Work-package comparison','Recorded hours, invoiced liabilities and paid allocations are separate amounts.')
      +table(['Original work package','Planned USD','Recorded / accepted hours','Invoiced','Paid','Invoice variance'],r.packages.map(row=>[esc(row.id),money(row.plannedUsd),esc(row.recordedHours)+' / '+esc(row.acceptedHours),money(row.invoicedUsd),money(row.paidUsd),money(row.invoiceVarianceUsd)]))
      +heading('Tranche cash','Planned releases remain conditional. Only separately recorded grant receipts appear in the last column.')
      +table(['Tranche','Conditional planned amount','Hypothetical payment day','Observed grant receipts'],r.tranches.map(row=>[esc(row.tranche),money(row.conditionalPlannedUsd),esc(row.hypotheticalPaidDay),money(row.observedGrantUsd)]))
      +heading('Open review items','These do not imply an issuer decision or release of a recorded liability.')
      +(r.unresolved.length?table(['Record','Current item','Amount'],r.unresolved.map(row=>[esc(row.kind),esc(row.message),row.amountUsd?money(row.amountUsd):'—'])):empty('No outstanding record-review items.'))
      +(r.cash.unvaluedIds.length?'<p class="ops-note">Some original asset quantities have no recorded USD valuation; their original amounts remain in Cash.</p>':'')+nodeAccounting();
  }
  function nodeAccounting() {
    const report=view.current.report.delivery.nodeAccounting;
    if(!report)return '';
    const rows=report.rows.flatMap(group=>group.editions.map(edition=>[
      esc(group.intentId)+'<small class="ops-break">'+esc(group.sourceIdentitySha256)+'</small>',
      esc(name('deployments',edition.deploymentId))+'<small>'+esc(edition.purchaseId||'No purchase association')+'</small>',
      title(edition.disposition)+'<small>'+title(edition.node.recordAuthority)+'</small>',
      'HTTP '+esc(edition.output.httpStatus??'unknown')+'<small>Capture '+esc(title(edition.output.captureStatus))+' · body not embedded</small>',
      esc(edition.node.sourceObservedAt)+'<small>Accounting '+esc(edition.node.accountingCompletedAt)+'</small>',
      esc(edition.filename)+'<small class="ops-break">'+esc(edition.sourceSha256)+'</small>'+
        button('Download original carrier','source-download','data-id="'+edition.sourceId+'"')
    ]));
    return heading('Original Node operational observations',
      'Original identities and immutable source editions, separately from purchases and financial totals.')
      +'<p>'+esc(report.operations)+' original operation'+(report.operations===1?'':'s')+' · '+
        esc(report.sourceEditions)+' source edition'+(report.sourceEditions===1?'':'s')+' · '+
        esc(report.unpaidOperations)+' original identities with an unpaid response observation.</p>'
      +'<p class="ops-note">'+esc(report.basis)+'</p>'
      +table(['Original intent / identity','Deployment / purchase','Source disposition','Response coverage','Original observation / accounting time','Source edition'],rows);
  }
  function contributors() {const rows=view.current.records.contributors;return heading('Contributors and suppliers','Actual named work and invoice counterparties; planned staffing remains in the selected plan.',kindButton('Add contributor','contributors'))+(rows.length?table(['Name','Kind','Contact','Source',''],rows.map(row=>[esc(row.name),title(row.kind),esc(row.contact),esc(sourceText(row)),kindButton('Edit','contributors',row)])):empty('Add a contributor to record work or an invoice.'));}
  function work() {const rows=view.current.records.work;return heading('Recorded contributor work','Log completed work against the original package, submit it for internal review, and retain any reopening.',kindButton('Log work','work'))+(rows.length?table(['Contributor / work','Package','Hours / basis','State','Actions'],rows.map(row=>[esc(name('contributors',row.contributorId))+'<p>'+esc(row.description)+'</p>',esc(row.costId||'Unplanned'),esc(row.hours)+' / '+title(row.fundingBasis),flag(row.state),'<div class="ops-actions">'+(row.state==='LOGGED'?kindButton('Edit','work',row)+transition('Submit','work.submit',row):'')+(row.state==='SUBMITTED'?transition('Accept work','work.accept',row):'')+(['SUBMITTED','ACCEPTED'].includes(row.state)?transition('Reopen','work.reopen',row):'')+(row.state!=='VOID'?transition('Void','work.void',row):'')+'</div>'])):empty('No completed work has been recorded.'));}
  function invoices() {const rows=view.current.records.invoices;return heading('Invoices and expenses','Retain source lines, review or dispute the invoice, then allocate observed payments in Cash.',kindButton('Record invoice','invoices'))+(rows.length?table(['Invoice / supplier','Issued / due','Total / paid / open','State','Actions'],rows.map(row=>{const balance=view.current.report.invoices.find(item=>item.id===row.id);return [esc(row.number)+'<p>'+esc(name('contributors',row.contributorId))+'</p>',esc(row.issuedDate)+' / '+esc(row.dueDate||'Not specified'),money(row.totalUsd)+' / '+money(balance.paidUsd)+' / '+money(balance.openUsd),flag(row.state),'<div class="ops-actions">'+(row.state==='RECEIVED'?kindButton('Edit','invoices',row)+transition('Review','invoice.review',row):'')+(['RECEIVED','REVIEWED'].includes(row.state)?transition('Dispute','invoice.dispute',row):'')+(['REVIEWED','DISPUTED','VOID'].includes(row.state)?transition('Reopen','invoice.reopen',row):'')+(row.state!=='VOID'?transition('Void','invoice.void',row):'')+'</div>'];})):empty('No invoice has been recorded.'));}
  function cash() {return '<div data-ops-cash-account></div>'
      +heading('Issuer and application events','Record actual issuer correspondence separately from the conditional plan.',kindButton('Record issuer event','awards'))
      +(view.current.records.awards.length?table(['Date','Stage','Original reference','Agreed award amount','Source'],view.current.records.awards.map(row=>[esc(row.date),title(row.stage),esc(row.reference),row.amountUsd===null?'Not recorded':money(row.amountUsd),esc(sourceText(row))])):empty('No issuer event has been recorded.'));}
  function delivery() {const r=view.current.report.delivery;return heading('Merchant and buyer deployments','Keep the accountable operator, actual environment, original source release and receiving handover together.',kindButton('Add deployment','deployments'))
    +(view.current.records.deployments.length?table(['Deployment / operator','Participation','State','Environment / role',''],view.current.records.deployments.map(row=>[esc(row.name)+'<p>'+esc(row.operator)+'</p>',title(row.participantClass),flag(row.state),title(row.environment)+' / '+title(row.role),kindButton('Update','deployments',row)])):empty('No deployment has been recorded.'))
    +'<p><strong>Distinct external merchant operators:</strong> '+r.externalMerchantOperators.length+' · <strong>Distinct external buyer operators:</strong> '+r.externalBuyerOperators.length+'. Team-operated demonstrations are counted separately.</p>'
    +heading('Original purchase observations','Keep native intent, payment and delivered-output identities. Record later recovery against the existing observation.',kindButton('Record purchase observation','purchases'))
    +(view.current.records.purchases.length?table(['Deployment / original transaction','Network / quantity','Settlement / output','Original intent',''],view.current.records.purchases.map(row=>[esc(name('deployments',row.deploymentId))+'<small class="ops-break">'+esc(row.transactionHash||'Transaction not yet observed')+'</small>',esc(row.network)+'<p>'+esc(row.amountStroops)+' stroops</p>',title(row.settlementStatus)+' / '+title(row.outputStatus),esc(row.intentId||'Join not supplied'),flag(row.state)+(row.state==='RECORDED'?kindButton('Later observation','purchases',row)+transition('Void observation','purchase.void',row):'')])):empty('No native purchase observations have been recorded.'))
    +(r.purchaseGroups.length?table(['Network / participation','Canonical transactions','Settled atomic units','Complete outputs'],r.purchaseGroups.map(row=>[esc(row.network)+' / '+title(row.participantClass),esc(row.transactions),esc(row.settledAtomicUnits),esc(row.completeOutputs)])):'')
    +'<p>Known attempted intents: '+r.attemptedKnownIntents+'; completed: '+r.completedKnownIntents+'; completion rate: '+(r.completionRate===null?'No known denominator':Number(r.completionRate)*100+'%')+'. Observations without an original intent join: '+r.purchaseObservationsWithoutIntentJoin.length+'.</p>'
    +nodeAccounting()
    +heading('Delivery outcomes','Retain the actual submitted or reviewed outcome and its original source. Internal review does not create issuer acceptance.',kindButton('Record outcome','outcomes'))
    +(view.current.records.outcomes.length?table(['Tranche','State','Outcome','Date',''],view.current.records.outcomes.map(row=>[esc(row.tranche),flag(row.state),esc(row.description),esc(row.date),kindButton('Update','outcomes',row)])):empty('No submitted or accepted outcome has been recorded.'));}
  function sources() {const rows=view.current.sources;return heading('Original documents and source records','Exact uploaded bytes remain with the case and complete export. Source URLs identify provenance; they are not fetched automatically.',button('Attach source','attach','',!editable()))
    +(rows.length?table(['Filename / kind','Original observation','Size / SHA-256','Source',''],rows.map(row=>[esc(row.filename)+'<small>'+title(row.kind)+'</small>',esc(row.observedAt),esc(row.bytes)+' bytes<small class="ops-break">'+esc(row.sha256)+'</small>',row.sourceUrl?'<a href="'+esc(row.sourceUrl)+'" target="_blank" rel="noopener noreferrer">Original source</a>':'Uploaded file',button('Download','source-download','data-id="'+row.id+'"')])):empty('Attach an invoice, issuer message, original work result or native purchase record.'));}
  function reviews() {const c=view.current;return heading('Frozen reviews and reopening','Each review retains the exact business records, source identities and calculated report at that time.',button('Freeze review','freeze-review','',!editable()))
    +(c.reviews.length?table(['Review','Operator','Note','Actions'],c.reviews.map(row=>[esc(row.createdAt)+'<small>Version '+row.version+'</small>',esc(row.actor),esc(row.note),button('Open review','review-view','data-id="'+row.id+'"')+button('Close on this review','close-review','data-id="'+row.id+'"',!editable())])):empty('Freeze a review after examining the recorded cash and outcomes.'))
    +heading('Original event history','Paged changes retain the recording operator, reason and original before/after values.',button('Load history','history-more'))
    +(view.events.length?table(['Version / time','Operator','Action / note'],view.events.map(row=>[esc(row.version)+'<small>'+esc(row.at)+'</small>',esc(row.actor),esc(row.action)+'<p>'+esc(row.note)+'</p><details><summary>Record values</summary><pre>'+esc(JSON.stringify({before:row.before,after:row.after},null,2))+'</pre></details>'])):empty('Open the retained event history.'));}
  function render() {
    if(!available())return;
    if(forecastView&&forecastViewCase===view.current?.program.id){try{view.forecastDraft=forecastView.draftInputs();}catch{}}
    amendmentView?.dispose();amendmentView=null;
    forecastView?.dispose();forecastView=null;forecastViewCase=null;
    portfolioView?.dispose();portfolioView=null;
    supportView?.dispose();supportView=null;
    completionView?.dispose();completionView=null;
    engagementView?.dispose();engagementView=null;
    calendarView?.dispose();calendarView=null;
    cohortView?.dispose();cohortView=null;
    buyerView?.dispose();buyerView=null;
    installationView?.dispose();installationView=null;
    installationReturnView?.dispose();installationReturnView=null;
    dispatchView?.dispose();dispatchView=null;
    performanceView?.dispose();performanceView=null;
    payablesView?.dispose();payablesView=null;
    cashAccountView?.dispose();cashAccountView=null;
    ledgerIntakeView?.dispose();ledgerIntakeView=null;
    implementationView?.dispose();statementView?.dispose();implementationView=null;statementView=null;
    workIntakeView?.dispose();workIntakeView=null;
    commercialView?.dispose();commercialView=null;
    const c=view.current;
    root.innerHTML='<div class="ops-heading"><div><h2>Delivery and cash operations</h2><p>New cases use saved plan '+esc(plan.name)+' · revision '+plan.revision+'</p></div><div class="ops-actions">'+button('Open case from saved plan','new-case')+button('Import complete case','import')+button('Import original source packet','intake')+'</div></div>'
      +'<div class="ops-toolbar">'+field('Recording operator','recordingActor',actor,{help:'Retained with every saved operation.'})+(view.cases.length?field('Retained case','caseSelect',c?.program.id,{options:view.cases.map(row=>[row.id,row.name+' · '+row.mode+' · v'+row.version])}):'')+'</div>'
      +'<p data-ops-message role="status" aria-live="polite"></p>'
      +(c?'<div class="ops-case-heading"><div><strong>'+esc(c.program.name)+'</strong> '+flag(c.program.state)+' <span>Version '+c.program.version+' · '+esc(c.plan.name)+' · pinned revision '+c.program.planRevision+'</span></div><div class="ops-actions">'+button('Refresh case','refresh')+button('Export complete case','export')+(c.program.state==='CLOSED'?button('Reopen review','reopen'):'')+'</div></div>'
       +(c.program.mode==='WALKTHROUGH'?'<p class="ops-note"><strong>Internal walkthrough.</strong> These fictional workflow records are separate from operating cash, awards and customer outcomes.</p>':'')
       +(c.program.currentPlanRevision!==c.program.planRevision?'<p class="ops-note">The planner has a newer saved revision. This case retains its selected baseline revision '+c.program.planRevision+'.</p>':'')
       +'<nav class="ops-tabs" aria-label="Delivery operations sections">'+[['overview','Plan / actual'],['amendments','Plan amendments'],['performance','Budget performance'],['ledger-intake','Bulk ledger intake'],['supplier-account','Supplier accounts'],['contributors','Contributors'],['engagements','Contributor engagements'],['work','Work'],['invoices','Invoices'],['work-intake','Work / invoice intake'],['cash','Cash / issuer'],['statements','Account statements'],['completion','Tranche completion'],['calendar','Delivery calendar'],['cohort','Cohort acceptance'],['forecast','Operating forecast'],['portfolio','Portfolio allocation'],['delivery','Deployment / buyers'],['installations','Customer installations'],['installation-returns','Receiving returns'],['commercial','Customer billing'],['dispatch','Delivery queue'],['implementation','Implementation evidence'],['support','Merchant support'],['buyer','Native buyer receiving'],['sources','Sources'],['reviews','Reviews / history']].map(([id,label])=>'<button type="button" data-ops-tab="'+id+'"'+(view.tab===id?' aria-current="page"':'')+'>'+esc(label)+'</button>').join('')+'</nav><div class="ops-panel">'+({overview,contributors,work,invoices,cash,delivery,sources,reviews,amendments:()=>'<div data-ops-amendments></div>','work-intake':()=>'<div data-ops-work-intake></div>',statements:()=>'<div data-ops-statements></div>',support:()=>'<div data-ops-support></div>',buyer:()=>'<div data-ops-buyer></div>',completion:()=>'<div data-ops-completion></div>',engagements:()=>'<div data-ops-engagements></div>',calendar:()=>'<div data-ops-calendar></div>',cohort:()=>'<div data-ops-cohort></div>',installations:()=>'<div data-ops-installations></div>','installation-returns':()=>'<div data-ops-installation-returns></div>',commercial:()=>'<div data-ops-commercial></div>',dispatch:()=>'<div data-ops-dispatch></div>',performance:()=>'<div data-ops-performance></div>','ledger-intake':()=>'<div data-ops-ledger-intake></div>','supplier-account':()=>'<div data-ops-payables></div>',implementation:()=>'<div data-ops-implementation></div>',forecast:()=>'<div data-ops-forecast></div>',portfolio:()=>'<div data-ops-portfolio></div>'}[view.tab])()+'</div>'
       :empty('Open a case from the selected saved plan or import an original case. Forecast staffing and payouts do not populate actual records.'))
      +'<dialog class="ops-dialog" aria-labelledby="ops-dialog-title"><form method="dialog" data-ops-form><h3 id="ops-dialog-title"></h3><div data-ops-fields class="ops-fields"></div><p data-ops-form-error role="alert"></p><div class="ops-actions"><button type="button" data-ops-action="cancel">Cancel</button><button type="submit" class="primary">Save</button></div></form></dialog>'
      +'<input type="file" data-ops-import hidden accept=".zip,application/zip"><input type="file" data-ops-intake hidden accept=".json,application/json">';
    if(c&&view.tab==='forecast'){
      const retained=c.forecasts.some(row=>row.id===view.forecastId)?view.forecastId:null;
      forecastViewCase=c.program.id;
      forecastView=mountForecast({container:$('[data-ops-forecast]'),current:c,api,mutationId,recordingActor,
        initialForecastId:retained,initialInputs:retained?null:view.forecastDraft,onSelection:id=>{view.forecastId=id;if(id)view.forecastDraft=null;},
        onSaved:async result=>{if(view.current?.program.id!==c.program.id)return;view.forecastId=result.recordId;view.forecastDraft=null;forecastView?.dispose();forecastView=null;await refresh();inform('Saved the original operating forecast with its source, dated cash and remaining work.');}});
      forecastView.setHostBusy(view.busy);forecastView.ready.catch(alertError);
    }
    if(c&&view.tab==='portfolio'){
      portfolioView=mountPortfolio({container:$('[data-ops-portfolio]'),current:c,api,mutationId,recordingActor,
        initialPortfolioId:view.portfolioId,onSelection:id=>{view.portfolioId=id;},onReload:refresh,
        onSaved:async result=>{if(view.current?.program.id!==c.program.id)return;view.portfolioId=result.recordId;await refresh();inform('Saved the complete source-bound delivery allocation and original cash alternatives.');},
        onForecastInputs:async(inputs,selection)=>{if(view.current?.program.id!==c.program.id)return;view.forecastDraft=structuredClone(inputs);view.forecastId=null;view.tab='forecast';render();inform('Opened an editable forecast from '+selection.alternativeId+'. Review original collection dates before previewing and saving its cash assumptions.');}});
      portfolioView.setHostBusy(view.busy);portfolioView.ready.catch(alertError);
    }
    if(c&&view.tab==='statements'){
      if(!retainedStatementSessions.has(c.program.id))retainedStatementSessions.set(c.program.id,{});
      statementView=mountStatements({container:$('[data-ops-statements]'),current:c,saveApi:transport,
        session:retainedStatementSessions.get(c.program.id),mutationId,recordingActor,
        onCash:()=>{if(!available())return;view.tab='cash';render();},
        onCase:async(next,result)=>{
          if(!available()||view.current?.program.id!==next.program.id)return;
          view.current=next;view.events=[];view.nextAfter=null;
          const listed=view.cases.find(row=>row.id===next.program.id);
          if(listed)Object.assign(listed,{version:next.program.version,state:next.program.state});
          render();inform('Received the original account statement and reconciled its cash observations.');
        }});
      statementView.setHostBusy(view.busy);statementView.ready.catch(alertError);
    }
    if(c&&view.tab==='work-intake'){
      if(!retainedWorkIntakeSessions.has(c.program.id))retainedWorkIntakeSessions.set(c.program.id,{});
      workIntakeView=mountWorkIntake({container:$('[data-ops-work-intake]'),current:c,saveApi:transport,
        session:retainedWorkIntakeSessions.get(c.program.id),mutationId,recordingActor,
        onOpen:tab=>{if(!available())return;view.tab=tab;render();},
        onCase:async(next,result)=>{
          if(!available()||view.current?.program.id!==next.program.id)return;
          view.current=next;view.events=[];view.nextAfter=null;
          const listed=view.cases.find(row=>row.id===next.program.id);
          if(listed)Object.assign(listed,{version:next.program.version,state:next.program.state,updatedAt:next.program.updatedAt});
          render();inform(result.state==='APPLIED'?'Applied the complete work/invoice intake and retained its native record links.':'Saved the original intake source and mapping edition.');
        }});
      workIntakeView.setHostBusy(view.busy);workIntakeView.ready.catch(alertError);
    }
    if(c&&view.tab==='amendments'){
      if(!retainedAmendmentSessions.has(c.program.id))retainedAmendmentSessions.set(c.program.id,{});
      amendmentView=mountAmendments({container:$('[data-ops-amendments]'),current:c,api,saveApi:transport,
        session:retainedAmendmentSessions.get(c.program.id),mutationId,recordingActor,
        onSources:()=>{if(!available())return;view.tab='sources';render();},
        onCase:async(next,result)=>{
          if(!available()||view.current?.program.id!==next.program.id)return;
          view.current=next;view.events=[];view.nextAfter=null;
          const listed=view.cases.find(row=>row.id===next.program.id);
          if(listed)Object.assign(listed,{version:next.program.version,state:next.program.state,updatedAt:next.program.updatedAt});
          render();inform('Retained '+result.action+' · case version '+result.version+'.');
        }});
      amendmentView.setHostBusy(view.busy);amendmentView.ready.catch(alertError);
    }
    if(c&&view.tab==='implementation'){
      if(!retainedImplementationSessions.has(c.program.id))retainedImplementationSessions.set(c.program.id,{});
      implementationView=mountImplementationEvidence({container:$('[data-ops-implementation]'),current:c,saveApi:transport,
        session:retainedImplementationSessions.get(c.program.id),mutationId,recordingActor,
        onSources:async()=>{if(!available())return;view.tab='sources';render();},
        onCase:async(next,result)=>{
          if(!available()||view.current?.program.id!==next.program.id)return;
          view.current=next;view.events=[];view.nextAfter=null;
          const listed=view.cases.find(row=>row.id===next.program.id);
          if(listed)Object.assign(listed,{version:next.program.version,state:next.program.state});
          render();inform('Retained original implementation evidence in the current Operations case.');
        }});
      implementationView.setHostBusy(view.busy);implementationView.ready.catch(alertError);
    }
    if(c&&view.tab==='cash'){
      if(!retainedCashAccountSessions.has(c.program.id))retainedCashAccountSessions.set(c.program.id,{});
      cashAccountView=mountCashAccounts({container:$('[data-ops-cash-account]'),current:c,api,saveApi:transport,
        session:retainedCashAccountSessions.get(c.program.id),mutationId,recordingActor,
        onOpen:(tab,detail)=>{
          if(!available())return;
          if(tab==='forecast'&&detail?.inputs){
            if(view.forecastDraft)download(JSON.stringify(view.forecastDraft,null,2)+'\n',c.program.id+'-forecast-draft-before-cash-continuation.json');
            view.forecastId=null;view.forecastDraft=JSON.parse(JSON.stringify(detail.inputs));
          }
          view.tab=tab;render();
        },
        onCase:async(next,result)=>{
          if(!available()||view.current?.program.id!==next.program.id)return;
          view.current=next;view.events=[];view.nextAfter=null;
          const listed=view.cases.find(row=>row.id===next.program.id);
          if(listed)Object.assign(listed,{version:next.program.version,state:next.program.state,updatedAt:next.program.updatedAt});
          render();inform((result.action==='refresh'||result.action==='reconcile'?'Opened current cash account':'Recorded original cash change')+' · case version '+result.version+'.');
        }});
      cashAccountView.setHostBusy(view.busy);cashAccountView.ready.catch(alertError);
    }
    if(c&&view.tab==='supplier-account'){
      if(!retainedPayablesSessions.has(c.program.id))retainedPayablesSessions.set(c.program.id,{});
      payablesView=mountPayables({container:$('[data-ops-payables]'),current:c,api,saveApi:transport,
        session:retainedPayablesSessions.get(c.program.id),mutationId,recordingActor,
        onOpen:tab=>{if(!available())return;view.tab=tab;render();},
        onCase:async(next,result)=>{
          if(!available()||view.current?.program.id!==next.program.id)return;
          view.current=next;view.events=[];view.nextAfter=null;
          const listed=view.cases.find(row=>row.id===next.program.id);
          if(listed)Object.assign(listed,{version:next.program.version,state:next.program.state,updatedAt:next.program.updatedAt});
          render();inform((result.action==='refresh'||result.action==='reconcile'?'Opened current supplier account':'Recorded supplier account change')+' · case version '+result.version+'.');
        }});
      payablesView.setHostBusy(view.busy);payablesView.ready.catch(alertError);
    }
    if(c&&view.tab==='ledger-intake'){
      if(!retainedLedgerIntakeSessions.has(c.program.id))retainedLedgerIntakeSessions.set(c.program.id,{});
      ledgerIntakeView=mountLedgerIntake({container:$('[data-ops-ledger-intake]'),current:c,api,saveApi:transport,
        session:retainedLedgerIntakeSessions.get(c.program.id),mutationId,recordingActor,
        onOpen:tab=>{if(!available())return;view.tab=tab;render();},
        onCase:async(next,result)=>{
          if(!available()||view.current?.program.id!==next.program.id)return;
          view.current=next;view.events=[];view.nextAfter=null;
          const listed=view.cases.find(row=>row.id===next.program.id);
          if(listed)Object.assign(listed,{version:next.program.version,state:next.program.state,updatedAt:next.program.updatedAt});
          render();inform('Recorded complete ledger intake · case version '+result.version+'.');
        }});
      ledgerIntakeView.setHostBusy(view.busy);ledgerIntakeView.ready.catch(alertError);
    }
    if(c&&view.tab==='performance'){
      if(!retainedPerformanceSessions.has(c.program.id))retainedPerformanceSessions.set(c.program.id,{});
      performanceView=mountPerformance({container:$('[data-ops-performance]'),current:c,api,
        session:retainedPerformanceSessions.get(c.program.id),
        onOpen:tab=>{if(!available())return;view.tab=tab;render();}});
      performanceView.setHostBusy(view.busy);performanceView.ready.catch(alertError);
    }
    if(c&&view.tab==='dispatch'){
      if(!retainedDispatchSessions.has(c.program.id))retainedDispatchSessions.set(c.program.id,{});
      dispatchView=mountDispatch({container:$('[data-ops-dispatch]'),current:c,api,
        session:retainedDispatchSessions.get(c.program.id),
        onOpen:(id,revision,edit,taskId)=>{
          if(!available()||view.current?.program.id!==c.program.id)return;
          if(id){
            const retained=retainedInstallationSessions.get(c.program.id)||{};
            retained.requestOpen={id,revision,edit,taskId};
            retainedInstallationSessions.set(c.program.id,retained);
          }
          view.tab='installations';render();
        }});
      dispatchView.setHostBusy(view.busy);dispatchView.ready.catch(alertError);
    }
    if(c&&view.tab==='commercial'){
      if(!retainedCommercialSessions.has(c.program.id))retainedCommercialSessions.set(c.program.id,{});
      commercialView=mountCommercialReceivables({container:$('[data-ops-commercial]'),current:c,api,saveApi:transport,
        session:retainedCommercialSessions.get(c.program.id),mutationId,recordingActor,
        onSources:()=>{view.tab='sources';render();},
        onInstallations:()=>{view.tab='installations';render();}});
      commercialView.setHostBusy(view.busy);commercialView.ready.catch(alertError);
    }
    if(c&&view.tab==='installation-returns'){
      if(!retainedInstallationReturnSessions.has(c.program.id))retainedInstallationReturnSessions.set(c.program.id,{});
      installationReturnView=mountInstallationReturns({container:$('[data-ops-installation-returns]'),current:c,api,saveApi:transport,
        session:retainedInstallationReturnSessions.get(c.program.id),mutationId,recordingActor,
        onSources:()=>{view.tab='sources';render();},onInstallations:()=>{view.tab='installations';render();},
        onCase:async(next,result)=>{
          if(!available()||view.current?.program.id!==next.program.id)return;
          view.current=next;view.events=[];view.nextAfter=null;
          const listed=view.cases.find(row=>row.id===next.program.id);
          if(listed)Object.assign(listed,{version:next.version??next.program.version,state:next.program.state,updatedAt:next.program.updatedAt});
          render();
        }});
      installationReturnView.setHostBusy(view.busy);installationReturnView.ready.catch(alertError);
    }
    if(c&&view.tab==='installations'){
      if(!retainedInstallationSessions.has(c.program.id))retainedInstallationSessions.set(c.program.id,{});
      installationView=mountInstallations({container:$('[data-ops-installations]'),current:c,api,saveApi:transport,
        session:retainedInstallationSessions.get(c.program.id),mutationId,recordingActor,
      onSources:()=>{view.tab='sources';render();},
        onCase:async(next,result)=>{
          if(!available()||view.current?.program.id!==next.program.id)return;
          view.current=next;view.events=[];view.nextAfter=null;
          const listed=view.cases.find(row=>row.id===next.program.id);
          if(listed)Object.assign(listed,{version:next.program.version,state:next.program.state,updatedAt:next.program.updatedAt});
          render();
        }});
      installationView.setHostBusy(view.busy);installationView.ready.catch(alertError);
    }
    if(c&&view.tab==='engagements'){
      if(!retainedEngagementSessions.has(c.program.id))retainedEngagementSessions.set(c.program.id,{});
      const receiveCase=next=>{
        if(!available()||view.current?.program.id!==next.program.id)return false;
        view.current=next;view.events=[];view.nextAfter=null;
        const listed=view.cases.find(row=>row.id===next.program.id);
        if(listed)Object.assign(listed,{version:next.program.version,state:next.program.state,updatedAt:next.program.updatedAt});
        return true;
      };
      engagementView=mountEngagements({container:$('[data-ops-engagements]'),current:c,saveApi:transport,
        session:retainedEngagementSessions.get(c.program.id),mutationId,recordingActor,
        onCase:async(next,result)=>{if(receiveCase(next))render();},
        onSources:async()=>{if(!available()||view.current?.program.id!==c.program.id)return;view.tab='sources';render();},
        onForecast:async({forecastId})=>{
          const next=await api('/api/operations/'+c.program.id);
          if(!receiveCase(next))return;
          if(!next.forecasts.some(row=>row.id===forecastId))throw new Error('The selected original Forecast is unavailable in this case.');
          view.forecastId=forecastId;view.forecastDraft=null;view.tab='forecast';render();
        },
        onPortfolio:async({portfolioId})=>{
          const next=await api('/api/operations/'+c.program.id);
          if(!receiveCase(next))return;
          if(!next.portfolios.some(row=>row.id===portfolioId))throw new Error('The selected original Portfolio is unavailable in this case.');
          view.portfolioId=portfolioId;view.tab='portfolio';render();
        }});
      engagementView.setHostBusy(view.busy);engagementView.ready.catch(alertError);
    }
    if(c&&view.tab==='completion'){
      if(!retainedCompletionSessions.has(c.program.id))retainedCompletionSessions.set(c.program.id,{});
      completionView=mountCompletion({container:$('[data-ops-completion]'),current:c,saveApi:transport,
        session:retainedCompletionSessions.get(c.program.id),mutationId,recordingActor,
        onCase:async(next,result)=>{
          if(!available()||view.current?.program.id!==next.program.id)return;
          view.current=next;view.events=[];view.nextAfter=null;
          const listed=view.cases.find(row=>row.id===next.program.id);
          if(listed)Object.assign(listed,{version:next.program.version,state:next.program.state,updatedAt:next.program.updatedAt});
          render();
        }});
      completionView.setHostBusy(view.busy);completionView.ready.catch(alertError);
    }
    if(c&&view.tab==='calendar'){
      if(!retainedCalendarSessions.has(c.program.id))retainedCalendarSessions.set(c.program.id,{});
      calendarView=mountDeliveryCalendar({container:$('[data-ops-calendar]'),current:c,api,
        session:retainedCalendarSessions.get(c.program.id),
        onOpen:(tab,tranche,selection={})=>{
          if(!available()||view.current?.program.id!==c.program.id)return;
          if(tab==='completion'){
            const retained=retainedCompletionSessions.get(c.program.id)||{};
            retained.requestCalendar={
              tranche:[1,2,3].includes(tranche)?tranche:null,
              asOfDate:selection.asOfDate,receiptId:selection.receiptId,
              costId:selection.costId,reviewId:selection.reviewId,
            };
            retainedCompletionSessions.set(c.program.id,retained);
          }
          view.tab=tab;render();
        }});
      calendarView.setHostBusy(view.busy);calendarView.ready.catch(alertError);
    }
    if(c&&view.tab==='cohort'){
      if(!retainedCohortSessions.has(c.program.id))retainedCohortSessions.set(c.program.id,{});
      cohortView=mountCohort({container:$('[data-ops-cohort]'),current:c,saveApi:transport,
        session:retainedCohortSessions.get(c.program.id),mutationId,recordingActor,
        onCase:async(next,result)=>{
          if(!available()||view.current?.program.id!==next.program.id)return;
          view.current=next;view.events=[];view.nextAfter=null;
          const listed=view.cases.find(row=>row.id===next.program.id);
          if(listed)Object.assign(listed,{version:next.program.version,state:next.program.state,updatedAt:next.program.updatedAt});
          render();
        }});
      cohortView.setHostBusy(view.busy);cohortView.ready.catch(alertError);
    }
    if(c&&view.tab==='buyer'){
      if(!retainedBuyerSessions.has(c.program.id))retainedBuyerSessions.set(c.program.id,{});
      buyerView=mountBuyerReceiving({container:$('[data-ops-buyer]'),current:c,api,saveApi:transport,
        session:retainedBuyerSessions.get(c.program.id),mutationId,recordingActor,
        onReload:refresh,onSaved:async result=>{
          if(view.current?.program.id!==c.program.id)return;
          await refresh();inform(result.unchanged?'Reopened the same received buyer source and purchase associations.':
            'Received '+result.purchaseIds.length+' original buyer jobs at operations version '+result.version+'.');
        }});
      buyerView.setHostBusy(view.busy);buyerView.ready.catch(alertError);
    }
    if(c&&view.tab==='support'){
      const supportKey=c.program.id;
      if(!retainedSupportSessions.has(supportKey))retainedSupportSessions.set(supportKey,{});
      supportView=mountSupportDelivery({container:$('[data-ops-support]'),current:c,api,saveApi:transport,
        session:retainedSupportSessions.get(supportKey),mutationId,recordingActor,
        onReload:refresh,onSaved:async result=>{
          if(view.current?.program.id!==c.program.id)return;
          await refresh();inform(result.unchanged?'Reopened the support source already attached to this deployment.':
            'Received the original merchant support file and runtime review at operations version '+result.version+'.');
        }});
      supportView.setHostBusy(view.busy);supportView.ready.catch(alertError);
    }
  }
  function showForm(kind, row={}, meta={}) {
    requireActive();
    if(kind==='invoices'&&!view.current.records.contributors.length)throw new Error('Add the invoice contributor or supplier first.');
    if(kind==='work'&&!view.current.records.contributors.length)throw new Error('Add the contributor first.');
    if(kind==='purchases'&&!view.current.records.deployments.length)throw new Error('Add the original deployment first.');
    view.form={kind,row:structuredClone(row),...meta};
    const dialog=$('dialog.ops-dialog'),form=$('[data-ops-form]');form.reset();$('[data-ops-form-error]').textContent='';
    $('#ops-dialog-title').textContent=meta.title||((row.id?'Update ':'Record ')+(labels[kind]||title(kind)).toLowerCase());
    let html='';
    if(kind==='new-case') html=field('Case name','name',plan.name+' — delivery operations',{required:true,wide:true})+field('Purpose','mode','OPERATIONS',{options:choices.mode})+field('Operational calendar anchor','calendarStart',plan.planning.calendarStart||'',{type:'date',help:'Optional explicit date; it does not record an award or forecast payout.'})+'<p class="ops-wide">This case pins saved revision '+plan.revision+' and its original source. Unsaved planning edits are not used.</p>';
    else if(kind==='contributors')html=field('Name','name',row.name,{required:true})+field('Kind','kind',row.kind||'PERSON',{options:choices.person})+field('Contact reference','contact',row.contact)+field('Notes','note',row.note,{area:true});
    else if(kind==='work')html=field('Contributor','contributorId',row.contributorId,{options:options('contributors'),required:true})+field('Original work package','costId',row.costId,{options:optional(costs(),'Unplanned work')})+field('Work start','startDate',row.startDate||date(),{type:'date',required:true})+field('Work end','endDate',row.endDate||date(),{type:'date',required:true})+field('Completed hours','hours',row.hours,{type:'number',step:'.0001',required:true})+field('Work funding basis','fundingBasis',row.fundingBasis||'PREAWARD',{options:choices.funding})+field('Completed work','description',row.description,{area:true,wide:true,required:true});
    else if(kind==='invoices') html=field('Contributor / supplier','contributorId',row.contributorId,{options:options('contributors'),required:true})+field('Original invoice number','number',row.number,{required:true})+field('Issued date','issuedDate',row.issuedDate||date(),{type:'date',required:true})+field('Due date','dueDate',row.dueDate,{type:'date'})+'<div class="ops-wide" data-ops-lines>'+invoiceLines(row.lines||[{}])+'</div><div class="ops-wide">'+button('Add invoice line','add-line')+'</div>';
    else if(kind==='cash')html=field('Direction','direction','IN',{options:choices.direction})+field('Category','category','GRANT',{options:choices.category})+field('Observed cash date','date',date(),{type:'date',required:true})+field('Currency / symbol','currency','USD',{required:true})+field('Original network','network','')+field('Original asset identity','asset','')+field('Exact observed amount','amount','',{required:true})+field('USD value, if non-USD','usdValue','',{help:'Leave blank when unvalued. USD movements use their exact amount.'})+field('Original payment reference','externalRef','',{required:true,wide:true})+field('Grant tranche','tranche','',{options:[['','Not assigned'],['0','0 · advance'],['1','1'],['2','2'],['3','3']]})+field('Valuation basis','valuationNote','',{area:true})+field('Valuation source documents','valuationSourceIds',[],{options:sourceOptions(),multiple:true,wide:true})+'<div class="ops-wide" data-ops-allocations></div><div class="ops-wide">'+button('Allocate invoice payment','add-allocation')+'</div>';
    else if(kind==='awards')html=field('Actual issuer stage','stage',row.stage||'INTEREST_ACKNOWLEDGED',{options:choices.stage})+field('Original source date','date',row.date||date(),{type:'date',required:true})+field('Original issuer reference','reference',row.reference,{required:true,wide:true})+field('Agreed award amount (USD)','amountUsd',row.amountUsd,{help:'Leave empty unless an actual award agreement supplies it.'});
    else if(kind==='deployments')html=field('Deployment name','name',row.name,{required:true})+field('Accountable operator','operator',row.operator,{required:true})+field('Stable operator identity','operatorId',row.operatorId,{help:'Reuse across that same operator’s routes, seats and hosts.'})+field('Role','role',row.role||'MERCHANT',{options:choices.role})+field('Participation','participantClass',row.participantClass||'TEAM_OPERATED',{options:choices.participant})+field('Environment','environment',row.environment||'TESTNET',{options:choices.environment})+field('Actual state','state',row.state||'PLANNED',{options:choices.deployment})+field('Tranche','tranche',row.tranche,{options:[['','Not assigned'],['1','1'],['2','2'],['3','3']]})+field('Original endpoint','endpoint',row.endpoint,{type:'url',wide:true})+field('Original source / release reference','releaseRef',row.releaseRef,{wide:true})+field('Original merchant case or workorder','caseRef',row.caseRef,{wide:true})+field('Receiving operator','acceptedBy',row.acceptedBy)+field('Actual handover date','acceptedAt',row.acceptedAt,{type:'date'})+field('Original work packages','costIds',row.costIds||[],{options:costs(),multiple:true,wide:true});
    else if(kind==='purchases')html=field('Original deployment','deploymentId',row.deploymentId,{options:options('deployments'),required:true})+field('Network','network',row.network||'stellar:testnet',{required:true})+field('Original asset','asset',row.asset||'native:XLM',{required:true})+field('Original atomic amount (stroops)','amountStroops',row.amountStroops||'0',{required:true})+field('Original transaction hash','transactionHash',row.transactionHash,{wide:true})+field('Native ledger','ledger',row.ledger,{type:'number'})+field('Native fees (stroops)','feesStroops',row.feesStroops)+field('Attempt state','attemptStatus',row.attemptStatus||'ATTEMPTED',{options:choices.attempt})+field('Settlement state','settlementStatus',row.settlementStatus||'UNKNOWN',{options:choices.settlement})+field('Delivered output state','outputStatus',row.outputStatus||'UNKNOWN',{options:choices.output})+field('Order state','orderStatus',row.orderStatus||'NOT_APPLICABLE',{options:choices.order})+field('Original delivered bytes','deliveredBytes',row.deliveredBytes,{type:'number'})+field('Original delivered SHA-256','deliveredSha256',row.deliveredSha256)+field('Observation origin','origin',row.id?'RECOVERED':row.origin||'OPERATOR_ENTRY',{options:choices.origin})+field('Actual observation time','observedAt',row.id?timestamp():row.observedAt||timestamp(),{required:true,help:'ISO timestamp including timezone.'})+['intentId','operationId','requestId','reservationId','merchantEventId','recipient','acceptedTermsSha256'].map(key=>field('Original '+title(key),key,row[key],{help:key==='intentId'?'Leave empty when the original approved-intent join is unavailable.':undefined})).join('')+['firstAttemptAt','settledAt','outputCompletedAt'].map(key=>field('Original '+title(key),key,row[key],{help:'Original ISO timestamp with timezone; no inferred dates.'})).join('');
    else if(kind==='outcomes')html=field('Tranche','tranche',row.tranche||1,{options:[['1','1'],['2','2'],['3','3']]})+field('Actual outcome state','state',row.state||'IN_PROGRESS',{options:choices.outcome})+field('Source date','date',row.date||date(),{type:'date',required:true})+field('Related deployments','deploymentIds',row.deploymentIds||[],{options:options('deployments'),multiple:true})+field('Outcome and reviewer reference','description',row.description,{area:true,required:true,wide:true});
    else if(kind==='attach')html=field('Original file','file','',{type:'file',required:true,wide:true})+field('Source kind','kind','other',{options:values('invoice','work','grant','payment','deployment','purchase','other')})+field('Original observation time','observedAt',timestamp(),{required:true})+field('Original source URL','sourceUrl','',{type:'url',wide:true});
    else if(['transition','freeze-review','close-review','reopen'].includes(kind))html=field('Reason or review note','operationNote','',{area:true,required:true,wide:true});
    else if(['import','intake'].includes(kind))html=field('Receiving case name','name',meta.filename?.replace(/\.(zip|json)$/i,'')||'Imported operations',{required:true,wide:true})+(kind==='intake'?'<p class="ops-wide">Uses the selected saved plan and exact supplied pre-award source packet. Recorded issuer and native testnet facts remain separate from cash and external customer outcomes.</p>':'<p class="ops-wide">Imports the complete original planner and operations history. Closed cases retain their closed review.</p>');
    if(labels[kind])html+=commonSource(row);
    if(kind==='purchases'&&row.id)html+=field('Reason for later observation','operationNote','',{area:true,required:true,wide:true});
    $('[data-ops-fields]').innerHTML=html;dialog.showModal();form.querySelector('input,select,textarea')?.focus();
  }
  function invoiceLines(lines) {return lines.map((line,index)=>'<fieldset class="ops-line" data-ops-line><legend>Invoice line '+(index+1)+'</legend><div class="ops-fields">'+field('Original work package','lineCost',line.costId,{options:optional(costs(),'Unplanned expense')})+field('Amount (USD)','lineAmount',line.amountUsd,{required:true})+field('Original line description','lineDescription',line.description,{required:true,wide:true})+field('Completed work records','lineWork',line.workIds||[],{options:options('work'),multiple:true,wide:true})+'<input type="hidden" name="lineId" value="'+esc(line.id||'')+'"></div>'+button('Remove line','remove-line')+'</fieldset>').join('');}
  function allocation() {return '<fieldset data-ops-allocation><legend>Observed payment allocation</legend><div class="ops-fields">'+field('Invoice','allocationInvoice','',{options:options('invoices'),required:true})+field('Allocated USD','allocationAmount','',{required:true})+'</div>'+button('Remove allocation','remove-allocation')+'</fieldset>';}
  function formData(form) {
    const data=Object.fromEntries(new FormData(form));
    for(const select of form.querySelectorAll('select[multiple]'))data[select.name]=[...select.selectedOptions].map(option=>option.value);
    const integers=['tranche','ledger','deliveredBytes'];for(const key of integers)if(key in data)data[key]=data[key]===''?null:Number(data[key]);
    for(const key of ['dueDate','acceptedAt','calendarStart','firstAttemptAt','settledAt','outputCompletedAt','usdValue','amountUsd'])if(data[key]==='')data[key]=null;
    if(view.form.kind==='invoices')data.lines=[...form.querySelectorAll('[data-ops-line]')].map((row,index)=>({id:row.querySelector('[name=lineId]').value||'line-'+(index+1),costId:row.querySelector('[name=lineCost]').value||null,description:row.querySelector('[name=lineDescription]').value,amountUsd:row.querySelector('[name=lineAmount]').value,workIds:[...row.querySelector('[name=lineWork]').selectedOptions].map(x=>x.value)}));
    if(view.form.kind==='cash')data.allocations=[...form.querySelectorAll('[data-ops-allocation]')].map(row=>({invoiceId:row.querySelector('[name=allocationInvoice]').value,amountUsd:row.querySelector('[name=allocationAmount]').value}));
    return data;
  }
  root.addEventListener('change',event=>{
    if(event.target.name==='recordingActor'){actor=event.target.value;try{sessionStorage.setItem('sf47.operations.actor',actor);}catch{}}
    if(event.target.name==='caseSelect')run(async()=>{const selectedCase=await api('/api/operations/'+event.target.value);if(selectedCase.program.id!==view.current?.program.id){view.forecastId=null;view.forecastDraft=null;view.portfolioId=null;}view.current=selectedCase;view.events=[];view.nextAfter=null;try{sessionStorage.setItem('sf47.operations.case.'+plan.id,view.current.program.id);}catch{}render();});
    if(event.target.matches('[data-ops-import],[data-ops-intake]')){const file=event.target.files[0];if(file)run(async()=>showForm(event.target.matches('[data-ops-intake]')?'intake':'import',{}, {file,filename:file.name,title:'Receive operations source'}));}
  });
  root.addEventListener('click',event=>{
    const tab=event.target.closest('[data-ops-tab]');if(tab&&!view.busy){view.tab=tab.dataset.opsTab;render();return;}
    const target=event.target.closest('[data-ops-action]');if(!target)return;
    const action=target.dataset.opsAction;
    // Open native pickers in the click gesture before busy state disables inputs.
    if(action==='import'||action==='intake'){
      if(view.busy||!available())return;
      const input=$(action==='intake'?'[data-ops-intake]':'[data-ops-import]');input.value='';input.click();return;
    }
    run(async()=>{
      if(action==='cancel'){$('dialog.ops-dialog').close();return;}
      if(action==='new-case')return showForm('new-case',{}, {title:'Open operations from saved plan'});
      if(action==='refresh')return refresh();
      if(action==='record'){const kind=target.dataset.kind;return showForm(kind,view.current.records[kind].find(row=>row.id===target.dataset.id)||{});}
      if(action==='attach')return showForm('attach',{}, {title:'Attach original source'});
      if(action==='transition')return showForm('transition',{}, {command:target.dataset.command,id:target.dataset.id,title:title(target.dataset.command.replace('.',' '))});
      if(action==='freeze-review'||action==='reopen')return showForm(action,{}, {title:title(action.replace('-',' '))});
      if(action==='close-review')return showForm('close-review',{}, {review:view.current.reviews.find(row=>row.id===target.dataset.id),title:'Close on this exact review'});
      if(action==='add-line'){$('[data-ops-lines]').insertAdjacentHTML('beforeend',invoiceLines([{}]));return;}
      if(action==='remove-line'){target.closest('[data-ops-line]').remove();return;}
      if(action==='add-allocation'){if(!view.current.records.invoices.length)throw new Error('Record the original invoice before allocating a payment.');$('[data-ops-allocations]').insertAdjacentHTML('beforeend',allocation());return;}
      if(action==='remove-allocation'){target.closest('[data-ops-allocation]').remove();return;}
      if(action==='source-download'){const meta=view.current.sources.find(row=>row.id===target.dataset.id);const response=await api('/api/operations/'+view.current.program.id+'/sources/'+meta.id,undefined,{download:true});download(await response.blob(),meta.filename);return;}
      if(action==='export'){const response=await api('/api/operations/'+view.current.program.id+'/export.zip',undefined,{download:true});download(await response.blob(),view.current.program.id+'.zip');inform('Exported the complete operations case and original planner history.');return;}
      if(action==='review-view'){const review=await api('/api/operations/'+view.current.program.id+'/reviews/'+target.dataset.id);download(JSON.stringify(review,null,2),review.id+'.json');inform('Downloaded the original frozen review with its full recorded source and report.');return;}
      if(action==='history-more'){if(view.events.length&&view.nextAfter===null){inform('All retained history is already displayed.');return;}const page=await api('/api/operations/'+view.current.program.id+'/history?after='+(view.nextAfter||0));view.events.push(...page.events);view.nextAfter=page.nextAfter;render();return;}
    });
  });
  root.addEventListener('submit',event=>{
    if(!event.target.matches('[data-ops-form]'))return;event.preventDefault();
    // Read form values before disabling controls; disabled controls are omitted by FormData.
    const form=event.target,meta=view.form,data=formData(form),file=form.querySelector('[name=file]')?.files[0];
    run(async()=>{
      try {
        const actor=recordingActor();
        if(meta.kind==='new-case'){
          const payload={name:data.name,mode:data.mode,calendarStart:data.calendarStart,planId:plan.id,selectedRevision:plan.revision,expectedContentSha256:plan.contentSha256,actor};
          payload.requestId=await mutationId('operations:create',payload);const result=await api('/api/operations',payload);await loadCases(result.id);inform('Opened operations from the selected saved plan.');return;
        }
        if(meta.kind==='intake'||meta.kind==='import'){
          const raw=await meta.file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),n=>n.toString(16).padStart(2,'0')).join('');
          let result;
          if(meta.kind==='intake'){
            const payload={name:data.name,planId:plan.id,selectedRevision:plan.revision,expectedContentSha256:plan.contentSha256,actor,packetBase64:b64(raw)};
            payload.requestId=await mutationId('operations:intake',{...payload,packetBase64:hash});result=await api('/api/operations/intake',payload);
          }else{
            const requestId=await mutationId('operations:import',{hash,name:data.name,actor});
            result=await api('/api/operations/import?name='+encodeURIComponent(data.name),raw,{raw:true,headers:{'content-type':'application/zip','X-Request-ID':requestId,'X-Recorded-By':encodeURIComponent(actor)}});
          }
          if(result.performance){
            const retained=retainedPerformanceSessions.get(result.id)||{};
            Object.assign(retained,{initialized:true,startDate:result.performance.startDate||'',
              endDate:result.performance.endDate,page:0});
            retainedPerformanceSessions.set(result.id,retained);view.tab='performance';
          }
          if(result.supplierAccount){
            const selected=result.supplierAccount,retained=retainedPayablesSessions.get(result.id)||{};
            Object.assign(retained,{initialized:true,contributorId:selected.contributorId,
              startDate:selected.startDate||'',endDate:selected.endDate,panel:'summary',page:0});
            retainedPayablesSessions.set(result.id,retained);view.tab='supplier-account';
          }
          if(result.cashAccount){
            const selected=result.cashAccount,retained=retainedCashAccountSessions.get(result.id)||{};
            Object.assign(retained,{initialized:true,selection:{startDate:selected.startDate||'',
              endDate:selected.endDate,network:selected.network??null,currency:selected.currency??null,asset:selected.asset??null},
              panel:'transactions',page:0});
            retainedCashAccountSessions.set(result.id,retained);view.tab='cash';
          }
          if(result.deliveryQueue){
            const retained=retainedDispatchSessions.get(result.id)||{};
            Object.assign(retained,{initialized:true,asOfDate:result.deliveryQueue.asOfDate,page:0});
            retainedDispatchSessions.set(result.id,retained);view.tab='dispatch';
          }
          if(result.selectedInstallation){
            installationView?.dispose();installationView=null;
            const retained=retainedInstallationSessions.get(result.id)||{};
            if(!retained.initialized){
              let stored;try{stored=JSON.parse(sessionStorage.getItem('sf47.installations.'+result.id)||'null');}catch{}
              if(stored?.schema==='sf47.installation-editor.v1'&&stored.caseId===result.id){
                for(const key of ['drafts','pending','accepted','notice'])
                  if(!Object.hasOwn(retained,key)&&Object.hasOwn(stored,key))retained[key]=stored[key];
              }
            }
            Object.assign(retained,{initialized:true,selected:{id:result.selectedInstallation.id,
              revision:result.selectedInstallation.revision},mode:'saved',draftKey:null});
            retainedInstallationSessions.set(result.id,retained);
            view.tab='installations';
          }
          if(result.selectedInstallationReturn){
            const retained=retainedInstallationReturnSessions.get(result.id)||{};
            Object.assign(retained,{selectedReview:result.selectedInstallationReturn.id,mode:'saved'});
            retainedInstallationReturnSessions.set(result.id,retained);view.tab='installation-returns';
          }
          await loadCases(result.id);inform('Received complete operations source with its retained history.');return;
        }
        if(meta.kind==='attach'){
          if(!file)throw new Error('Select an original source file.');
          await command('source.add',{filename:file.name,contentBase64:b64(await file.arrayBuffer()),kind:data.kind,mediaType:(file.type||'application/octet-stream').split(';')[0],sourceUrl:data.sourceUrl,observedAt:data.observedAt});return;
        }
        if(meta.kind==='transition'){await command(meta.command,{id:meta.id},data.operationNote);return;}
        if(meta.kind==='freeze-review'){await command('review',{},data.operationNote);return;}
        if(meta.kind==='close-review'){await command('close',{reviewId:meta.review.id,expectedReviewSha256:meta.review.businessSha256},data.operationNote);return;}
        if(meta.kind==='reopen'){await command('reopen',{},data.operationNote);return;}
        let action=singular[meta.kind]+'.'+(['cash','purchases'].includes(meta.kind)?'record':'save');
        if(meta.kind==='purchases'&&meta.row.id)action='purchase.observe';
        const record={...meta.row,...data};delete record.operationNote;
        await command(action,record,data.operationNote||'');
      }catch(error){const errorNode=$('[data-ops-form-error]');if(errorNode)errorNode.textContent=error.message;throw error;}
    });
  });
  root.innerHTML='<p>Opening retained delivery operations…</p>';
  const ready=loadCases();
  return {ready,refresh,dispose,setHostBusy,root};
}
