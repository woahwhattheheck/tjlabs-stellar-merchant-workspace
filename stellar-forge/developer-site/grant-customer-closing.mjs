// MIT. Continue the installed customer service workflow in the existing SCF reader.
export const CUSTOMER_CLOSING_OPERATION='SCF-CUSTOMER-CLOSING-APPLICATION-5245-20261012';
export const CUSTOMER_CLOSING_HEADING='### Customer service close, corrections and complete handover';
export const CUSTOMER_CLOSING_SCHEMA='stellar-forge.grant-customer-closing.v1';
const REPOSITORY='https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/';
const ROOT='stellar-forge/mcp-merchant-operator/';
const START='<!-- grant-customer-closing:start -->',END='<!-- grant-customer-closing:end -->';
const CHAPTER='./grant-companion.html#customer-service-close-corrections-and-complete-handover';
const COMPONENTS=[
  {id:'merchant-customer-closing-workbench',label:'Installed customer setup, statements and complete closing workbench',path:ROOT+'ACCOUNTING_STATEMENT_WORKBENCH.md',
    operator_workflow:'Customer profile and original assignment, native capture import, reviewed statement cycles, lifecycle and complete customer handover.'},
  {id:'merchant-customer-service-close-planner',label:'Explicit customer service periods and portable plans',path:ROOT+'ACCOUNTING_STATEMENT_SERVICE_PLANNER.md',
    operator_workflow:'Original capture catalogue, customer/pass history, explicit opening and closing selection, native preview, portable plan and original saved-cycle preparation.'},
  {id:'merchant-customer-statement-cycles',label:'Saved original customer cycles and partial delivery continuation',path:ROOT+'ACCOUNTING_STATEMENT_CYCLES.md',
    operator_workflow:'Frozen complete native reviews, original request recovery, statement retention, complete or partial file delivery and operator archive reopening.'},
  {id:'merchant-customer-statement-dossiers',label:'Grouped complete customer handover source',path:ROOT+'accounting-statement-customer-dossier.mjs',
    operator_workflow:'Customer grouping, original statement/period registers, immutable complete files, current saved lifecycle and repeat export reuse.'},
  {id:'merchant-customer-closing-reference',label:'Complete original customer operating and receiving guide',path:ROOT+'examples/CUSTOMER_CLOSING_WORKBENCH.md',
    operator_workflow:'Original repository customer and native captures through setup, service planning, retained cycle, correction, withdrawal, grouped handover and desktop/mobile use.'},
  {id:'merchant-customer-closing-operation',label:'Original native customer, MCP and browser operation',path:ROOT+'examples/customer-closing-workbench.mjs',
    operator_workflow:'Resume the same complete native customer operation from its original directory, request identities and saved artifacts.'},
  {id:'merchant-customer-closing-installed',label:'Installed Customer statements application and typed package entry points',
    path:'stellar/scf-starforge-20261009/distribution/contributions/customer-closing.json',
    operator_workflow:'Original customer-closing command, Applications provider, typed interfaces and complete browser source selection.'},
  {id:'merchant-customer-closing-browser',label:'Original customer workbench browser assets',path:ROOT+'accounting-statement-cycle-browser-assets.json',
    operator_workflow:'The same served setup, cycle, customer handover and service-planner browser modules in the installed product.'},
];
const CALENDAR_COMPONENTS=[
  {id:'merchant-customer-service-calendars-guide',label:'Recurring customer calendar operating and receiving guide',path:ROOT+'ACCOUNTING_STATEMENT_SERVICE_CALENDARS.md',
    operator_workflow:'Weekly/monthly calendar editions, original customer/pass identity, actual capture review, interrupted settings/preparation recovery and complete receiving.'},
  {id:'merchant-customer-service-calendars-store',label:'Original calendar, service-plan and saved-cycle continuation',path:ROOT+'accounting-statement-service-schedules.mjs',
    operator_workflow:'UTC period generation, immutable settings, exact original plan requests, cycle ownership and merged complete history receiving.'},
  {id:'merchant-customer-service-calendars-browser',label:'Installed service calendar browser workflow',path:ROOT+'cycle-public/service-schedules.mjs',
    operator_workflow:'Customer period selection, native preview, complete exports, original settings/plan recovery and preservation of newer browser drafts.'},
  {id:'merchant-customer-service-calendars-terminal',label:'Installed customer-service-calendar command',path:ROOT+'accounting-statement-service-schedules-cli.mjs',
    operator_workflow:'Use the existing local workbench to save, review, prepare, recover, export and receive complete customer calendar requests.'},
  {id:'merchant-customer-service-calendars-types',label:'Typed calendar and original preparation interfaces',path:ROOT+'accounting-statement-service-schedules.d.mts',
    operator_workflow:'Full settings, calendar windows, selected capture plans, original cycle references and portable history contracts.'},
];
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function need(value,message){if(!value)throw new Error(message);}
function chapter(markdown){
  need(typeof markdown==='string','Read the complete customer product and finance companion.');
  const matches=[...markdown.matchAll(/^### Customer service close, corrections and complete handover\s*$/gm)];
  need(matches.length===1,'Retain one complete customer service-close subsection in the original financial chapter.');
  const start=matches[0].index,nextLine=markdown.indexOf('\n',start)+1,next=markdown.slice(nextLine).search(/^#{1,3}\s/m);
  const selected=markdown.slice(start,next<0?markdown.length:nextLine+next);
  need(selected.trim().length>CUSTOMER_CLOSING_HEADING.length,'Retain the complete customer service workflow beneath its heading.');
  return selected;
}
/** Register this customer source independently of other original financial components. */
export function attachCustomerClosingSources(sourceIndex,{customerClosingCommit,customerServiceCalendarsCommit=null,productAndFinanceMarkdown}){
  need(sourceIndex?.schema==='stellar-forge.grant-reviewer-source-index.v1'&&Array.isArray(sourceIndex.sources),
    'Use the original reviewer source index.');
  need(typeof customerClosingCommit==='string'&&/^[a-f0-9]{40}$/.test(customerClosingCommit),
    'Select the complete merged customer-closing product commit.');
  need(customerServiceCalendarsCommit===null||typeof customerServiceCalendarsCommit==='string'&&/^[a-f0-9]{40}$/.test(customerServiceCalendarsCommit),
    'Select the complete merged service-calendar product commit.');
  chapter(productAndFinanceMarkdown);
  const index=JSON.parse(JSON.stringify(sourceIndex));
  const sources=COMPONENTS.map(component=>({...component,kind:'maintained-product',repository:REPOSITORY,
    source_commit:customerClosingCommit,url:REPOSITORY+'blob/'+customerClosingCommit+'/'+component.path,
    application_operation:CUSTOMER_CLOSING_OPERATION}));
  const calendarSources=customerServiceCalendarsCommit?CALENDAR_COMPONENTS.map(component=>({...component,
    kind:'maintained-product',repository:REPOSITORY,source_commit:customerServiceCalendarsCommit,
    url:REPOSITORY+'blob/'+customerServiceCalendarsCommit+'/'+component.path,
    application_operation:CUSTOMER_CLOSING_OPERATION})):[];
  sources.push(...calendarSources);
  for(const source of sources){
    const positions=index.sources.map((value,i)=>value.id===source.id?i:-1).filter(i=>i>=0);
    need(positions.length<=1,'Keep one original customer source entry for '+source.id+'.');
    if(positions.length)index.sources[positions[0]]=source;else index.sources.push(source);
  }
  const workflow={
    schema:CUSTOMER_CLOSING_SCHEMA,heading:CUSTOMER_CLOSING_HEADING.slice(4),
    source_commit:customerClosingCommit,source_ids:sources.map(source=>source.id),
    companion_route:CHAPTER,reviewer_opening:'#review-customer-close',
    installed_selection:'merchant-receivables',application_provider:'customer-closing',
    application_label:'Customer statements',installed_command:'customer-closing',
    operation:CUSTOMER_CLOSING_OPERATION,
    native_receiving_operation:'SCF-CUSTOMER-CLOSING-5245-20261012',
    native_receiving_guide:sources.find(source=>source.id==='merchant-customer-closing-reference').url,
    native_receiving_entrypoint:ROOT+'examples/customer-closing-workbench.mjs',
    stages:['Customer setup and original assignments','Original native capture intake',
      'Explicit service-close selection and full preview','Portable plan and saved original cycle',
      'Issue and resume original customer statements','Linked correction and withdrawal history',
      'Complete grouped customer packet and operator continuation'],
    source_meaning:'Original purchased order, immutable pass, actual capture pair, completed accounting run, retained statement and original customer files.',
    financial_meaning:'Original purchase amounts, service allowance activity and separately issued invoice/receipt records retain their own financial identities.',
    funded_work:'Selected customer source/identity adaptation, accountable handover and production recovery within the original six priced packages.',
  };
  if(customerServiceCalendarsCommit){
    workflow.service_calendars={
      source_commit:customerServiceCalendarsCommit,source_ids:calendarSources.map(source=>source.id),
      application_navigation:'Service calendars',installed_command:'customer-service-calendar',
      typed_export:'./merchant/customer-closing/service-schedules',
      original_native_operation:workflow.native_receiving_operation,
      native_receiving_entrypoint:workflow.native_receiving_entrypoint,
      native_receiving_source_commit:customerClosingCommit,
      native_receiving_guide:REPOSITORY+'blob/'+customerServiceCalendarsCommit+'/'+ROOT+'ACCOUNTING_STATEMENT_SERVICE_CALENDARS.md',
      stages:['Save the original customer and purchased-pass calendar edition',
        'Read the UTC period window and review actual opening and closing captures',
        'Retain the complete chosen plan before preparing its original cycle',
        'Recover the original save or preparation while preserving newer local drafts',
        'Receive all calendar editions and the original saved cycle archive',
        'Refresh corrected or withdrawn statement history and reopen after restart'],
      receiving_meaning:'The original period-only prepared cycle and the native period/cumulative issuing cycle keep separate provenance in the complete customer programme.',
    };
    workflow.stages.splice(3,0,'Saved recurring calendar and reviewed actual capture boundaries',
      'Original settings/preparation recovery and complete calendar receiving');
  }
  index.customer_closing=workflow;
  index.narrative_source={...index.narrative_source,customer_closing_product_commit:customerClosingCommit,
    customer_closing_application_operation:CUSTOMER_CLOSING_OPERATION,
    ...(customerServiceCalendarsCommit?{customer_service_calendars_product_commit:customerServiceCalendarsCommit}:{})};
  return {sourceIndex:index,customerClosing:workflow,customerClosingSources:sources};
}
function withoutPrevious(html){
  const start=html.indexOf(START),end=html.indexOf(END);
  need((start<0)===(end<0),'Keep the complete customer-service opening together.');
  if(start>=0){
    need(end>start&&html.indexOf(START,start+START.length)<0&&html.indexOf(END,end+END.length)<0,
      'Keep one customer-service opening in the original reviewer.');
    let after=end+END.length;if(html[after]==='\n')after++;
    html=html.slice(0,start)+html.slice(after);
  }
  return html.replace(/<a data-grant-customer-closing-jump="v1"[^>]*>[\s\S]*?<\/a>/g,'');
}
function calendarOpening(workflow){
  const calendar=workflow.service_calendars;if(!calendar)return '';
  need(/^[a-f0-9]{40}$/.test(calendar.source_commit||''),'Retain the selected service-calendar source identity.');
  const guide=REPOSITORY+'blob/'+calendar.source_commit+'/'+ROOT+'ACCOUNTING_STATEMENT_SERVICE_CALENDARS.md';
  return '<section aria-labelledby="review-customer-calendar-title"><h4 id="review-customer-calendar-title">Continue recurring service calendars</h4>'+
    '<p>In the same Customer statements application, open <strong>Service calendars</strong>. Save the original customer and purchased pass with its weekly or monthly cadence, first opening date, due interval and optional final service date. Saved editions retain that original assignment.</p>'+
    '<ol class="grant-entry-steps"><li><strong>Review the period.</strong> Read the service window, choose actual native opening and closing captures, and explicitly accept any difference from the scheduled boundaries. Open the complete native usage preview.</li>'+
    '<li><strong>Prepare and recover.</strong> Save the complete chosen plan and prepare its original cycle. Recover an interrupted settings save or preparation through its original request. Later edits in the browser remain available.</li>'+
    '<li><strong>Issue and continue.</strong> Open the saved cycle and use its existing issue or resume action. Refresh the calendar to see current linked correction and withdrawal history.</li>'+
    '<li><strong>Receive the whole workspace.</strong> Download the whole-window HTML/CSV and complete calendar JSON. Receive its settings and original plan history together with the saved cycle archive, then reopen that original cycle after restart.</li></ol>'+
    '<p>The terminal command <code>customer-service-calendar</code> uses the same running workbench. <a href="'+escape(guide)+'" target="_blank" rel="noopener noreferrer">Complete calendar, recovery and receiving guide</a></p></section>';
}
function opening(workflow){
  const base=REPOSITORY+'blob/'+workflow.source_commit+'/'+ROOT;
  const link=(path,label)=>'<a href="'+escape(base+path)+'" target="_blank" rel="noopener noreferrer">'+escape(label)+'</a>';
  return START+'\n<section class="grant-entry-operate" id="review-customer-close" aria-labelledby="review-customer-close-title">'+
    '<h3 id="review-customer-close-title">Continue the customer’s service period.</h3>'+
    '<p>A recurring-service customer needs its purchased pass, actual use and complete statements to remain understandable after the first result. Open <strong>Customer statements</strong> in the installed merchant receivables application and continue that customer’s original service records.</p>'+
    '<div class="grant-entry-grid"><section aria-labelledby="review-customer-open-title"><h4 id="review-customer-open-title">Open the existing customer workbench</h4>'+
    '<ol class="grant-entry-steps"><li>In the Runtime workspace, attach the installed merchant runtime and choose <strong>Applications → Customer statements</strong>.</li>'+
    '<li>Select the original private closing directory, merchant MCP connection, accounting workspace and operator. Keep its credential in the existing server environment or private environment file.</li>'+
    '<li>Choose <strong>Review → Save → Start → Open</strong>. The saved application supplies the actual local workbench address and keeps the same directory across restarts.</li></ol>'+
    '<p>'+link('ACCOUNTING_STATEMENT_WORKBENCH.md','Installed opening and complete workbench guide')+'</p>'+
    '<dl class="grant-entry-facts"><div><dt>Customer</dt><dd>Original profile, order assignment and purchased pass.</dd></div>'+
    '<div><dt>Period</dt><dd>Explicit original opening and closing captures.</dd></div>'+
    '<div><dt>Handover</dt><dd>Complete statement files, period register and current saved history.</dd></div></dl></section>'+
    '<section aria-labelledby="review-customer-journey-title"><h4 id="review-customer-journey-title">Complete the original service close</h4>'+
    '<ol class="grant-entry-steps"><li><strong>Set up.</strong> In Customers and service, review the customer, original order assignment and native capture imports.</li>'+
    '<li><strong>Plan.</strong> In Plan service close, inspect the pass and history, select the actual opening/closing pair and open the native usage preview.</li>'+
    '<li><strong>Prepare.</strong> Review the complete plan, download or reopen its JSON/HTML/CSV, and prepare the original saved cycle.</li>'+
    '<li><strong>Issue and continue.</strong> Open the saved statement reviews and issue or resume the cycle. Each customer keeps its original request and statement number.</li>'+
    '<li><strong>Correct.</strong> Review a linked replacement or the original withdrawal reason. Refresh delivered statements to retain the current lifecycle snapshot.</li>'+
    '<li><strong>Hand over.</strong> Download the grouped customer packet, extract it and open index.html. Use the complete private cycle archive to continue the operator’s saved work.</li></ol>'+
    '<p>'+link('ACCOUNTING_STATEMENT_SERVICE_PLANNER.md','Full service-period planning guide')+' · '+
    link('examples/CUSTOMER_CLOSING_WORKBENCH.md','Original native customer programme')+'</p></section></div>'+
    calendarOpening(workflow)+
    '<p><a href="'+escape(CHAPTER)+'">Read the complete customer workflow and its funded installation role</a></p>'+
    '<p class="grant-entry-caption">The original retained purchase establishes its payment and returned output. This customer service continuation opens its own original pass, captures and statements. Purchase amounts, service activity and customer invoice records keep their original meaning.</p>'+
    '</section>\n'+END+'\n';
}
/** Add the complete continuation inside the existing reviewer opening and stylesheet. */
export function attachCustomerClosingOpening({templateHtml,sourceIndex}){
  need(typeof templateHtml==='string','Use the complete original reviewer page.');
  const workflow=sourceIndex?.customer_closing;
  if(!workflow)return {templateHtml,sourceIndex};
  need(workflow.schema===CUSTOMER_CLOSING_SCHEMA&&/^[a-f0-9]{40}$/.test(workflow.source_commit||''),
    'Retain the selected original customer source identity.');
  let html=withoutPrevious(templateHtml);
  const target='<section class="grant-entry-documents" aria-labelledby="review-documents-title">';
  need(html.indexOf(target)>=0&&html.indexOf(target)===html.lastIndexOf(target),
    'Keep the original reviewer opening and its document downloads.');
  html=html.replace(target,opening(workflow)+target);
  const jump='<a href="#project-and-requested-outcome">Read the application</a>';
  need(html.includes(jump),'Retain the existing reviewer product navigation.');
  html=html.replace(jump,'<a data-grant-customer-closing-jump="v1" href="#review-customer-close">Continue customer service</a>'+jump);
  return {templateHtml:html,sourceIndex};
}
