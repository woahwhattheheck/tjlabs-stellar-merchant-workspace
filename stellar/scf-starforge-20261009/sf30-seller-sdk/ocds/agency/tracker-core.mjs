// TokenJunkieLabs agency pilot helper. Source documents and native workspace identities stay exact.
export const TRACKER_COLUMNS = Object.freeze([
  'portfolio_seed','title','ocid','source_notice','published_date','stage',
  'full_deadline_text','full_deadline_date','summary_deadline_text','enquiry_deadline_text',
  'portal_url','portal_reference','review_state','assigned_owner','next_action','source_url','history_source_urls',
  'portfolio_id','current_entry_id','current_release_id','previous_entry_id','previous_release_id','source_id',
  'buyer','change_summary','comparison_file','deadline_source_url','deadline_timezone',
  'deadline_context_status','review_revision','shortlisted','exported_at'
]);
export function valueText(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
}
export function csvCell(value) {
  let text = valueText(value);
  if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function trackerCsv(rows) {
  return [TRACKER_COLUMNS, ...rows.map(row => TRACKER_COLUMNS.map(key => row[key]))]
    .map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
function field(document,path) {
  let value=document;
  for(const token of String(path||'').split('/').slice(1).map(value=>value.replaceAll('~1','/').replaceAll('~0','~'))){
    if(!value||typeof value!=='object'||!Object.hasOwn(value,token))return undefined;
    value=value[token];
  }
  return value;
}
export function deadlineContext({context,boundEntryId,current,source,document}) {
  const binding=context?.nativeDeadline;
  const selected=binding?field(document,binding.pointer):undefined;
  const enquiry=field(document,binding?.enquiry?.pointer||'/tender/enquiryPeriod/endDate');
  if(binding&&selected!==undefined){
    const literal=valueText(selected),same=literal===valueText(binding.literal);
    const label=binding.kind==='expression-of-interest'?'Expression of interest: ':'';
    const display=same&&context.full_deadline_text?context.full_deadline_text:literal;
    return {
      full_deadline_text:display?label+display:'',
      full_deadline_date:/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(literal)?literal.slice(0,10):'',
      summary_deadline_text:context.summary_deadline_text||'',
      enquiry_deadline_text:valueText(enquiry)===valueText(binding.enquiry?.literal)&&context.enquiry_deadline_text
        ?context.enquiry_deadline_text:valueText(enquiry),
      deadline_source_url:source?.url||binding.sourceUrl||'',
      deadline_timezone:literal.match(/(?:Z|[+-]\d{2}:\d{2})$/)?.[0]||'',
      deadline_context_status:selected===null?'native-deadline-null':
        (same?'confirmed-current-':'updated-native-')+(binding.kind==='expression-of-interest'?'expression-of-interest':'tender-deadline')
    };
  }
  if(context?.full_deadline_text){
    return {
      full_deadline_text:context.full_deadline_text,
      full_deadline_date:context.full_deadline_date||'',
      summary_deadline_text:context.summary_deadline_text||'',
      enquiry_deadline_text:context.enquiry_deadline_text||'',
      deadline_source_url:context.source_url||'',
      deadline_timezone:context.deadline_timezone||'',
      deadline_context_status:binding?'earlier-edition-context':!boundEntryId?'public-notice-reference'
        :boundEntryId===current.id?'bound-current-edition':'earlier-edition-context'
    };
  }
  const tender=field(document,'/tender/tenderPeriod/endDate')??current.summary?.dates?.tenderEnd;
  const eoi=field(document,'/tender/expressionOfInterestDeadline');
  const isEoi=(tender===undefined||tender===null)&&eoi!==undefined;
  const literal=valueText(isEoi?eoi:tender);
  return {
    full_deadline_text:literal?(isEoi?'Expression of interest: ':'')+literal:'',
    full_deadline_date:/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(literal)?literal.slice(0,10):'',
    summary_deadline_text:'',enquiry_deadline_text:valueText(enquiry),
    deadline_source_url:source?.url||'',
    deadline_timezone:literal.match(/(?:Z|[+-]\d{2}:\d{2})$/)?.[0]||'',
    deadline_context_status:literal?(isEoi?'native-expression-of-interest':'native-tender-deadline'):'no-deadline-value'
  };
}
export function trackerRow({portfolio,project,current,source,context,boundEntryId,
  previous,comparison,comparisonFile='',historyUrls=[],exportedAt,document}) {
  if (!current || current.id !== project.currentEntryId || current.ocid !== project.ocid)
    throw new Error('Tracker edition must be the workspace currentEntryId for the selected OCID');
  const review = project.review;
  if (!review || !Number.isSafeInteger(review.revision)) throw new Error('Saved review revision is required');
  let changeSummary = 'Baseline retained';
  if (previous?.entryId) {
    if (previous.entryId === current.id) changeSummary = 'Selected edition unchanged';
    else if (comparison?.representationChange) changeSummary = comparison.representationChange;
    else if (comparison) {
      const counts = comparison.counts;
      changeSummary = counts.total === 0 ? 'New retained edition; no document field changes'
        : counts.added + ' added; ' + counts.removed + ' removed; ' + counts.changed + ' changed';
    } else throw new Error('A changed selected edition requires its exact comparison');
  } else if (previous?.newToPortfolio) changeSummary = 'Added to this client portfolio';
  const urls = [...new Set([
    ...(context?.history_source_urls || '').split(' | ').filter(Boolean),
    ...historyUrls.filter(url => typeof url === 'string' && url.length > 0)
  ])];
  const summary = current.summary || project.summary || {};
  return {
    portfolio_seed: context?.portfolio_seed || portfolio.marketSegment || '',
    title: valueText(summary.title) || context?.title || '',
    ocid: project.ocid,
    source_notice: context?.source_notice || valueText(current.releaseId),
    published_date: valueText(current.date) || context?.published_date || '',
    stage: valueText(summary.stage) || context?.stage || '',
    ...deadlineContext({context,boundEntryId,current,source,document}),
    portal_url: context?.portal_url || '',
    portal_reference: context?.portal_reference || '',
    review_state: review.disposition,
    assigned_owner: review.owner,
    next_action: review.nextAction,
    source_url: context?.source_url || source?.url || '',
    history_source_urls: urls.join(' | '),
    portfolio_id: portfolio.id,
    current_entry_id: current.id,
    current_release_id: valueText(current.releaseId),
    previous_entry_id: previous?.entryId || '',
    previous_release_id: valueText(previous?.releaseId),
    source_id: current.sourceId,
    buyer: valueText(summary.buyer?.name || summary.buyer?.id),
    change_summary: changeSummary,
    comparison_file: comparisonFile,
    review_revision: review.revision,
    shortlisted: review.shortlisted,
    exported_at: exportedAt
  };
}
