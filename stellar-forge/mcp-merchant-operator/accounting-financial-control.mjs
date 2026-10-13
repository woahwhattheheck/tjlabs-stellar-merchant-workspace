// MIT. TokenJunkieLabs. Agent bindings to the original receivables controllers.
// The existing accounting owner supplies its already-open ReceivablesWorkspace.
// These names introduce no additional state, journal, financial projection or issue writer.
export const FINANCIAL_CONTROL_METHODS = Object.freeze({
  collectionCases: 'collection_list',
  collectionCase: 'collection_detail',
  saveCollectionCase: 'collection_save',
  recordCollectionActivity: 'collection_activity',
  closeCollectionCase: 'collection_close',
  reopenCollectionCase: 'collection_reopen',
  collectionReminder: 'collection_reminder',
  cashPlans: 'cash_plan_list',
  previewCashPlan: 'cash_plan_preview',
  cashPlan: 'cash_plan_detail',
  saveCashPlan: 'cash_plan_save',
  archiveCashPlan: 'cash_plan_archive',
  reopenCashPlan: 'cash_plan_reopen',
  compareCashPlans: 'cash_plan_compare',
  creditControl: 'credit_control',
  creditPolicy: 'credit_policy_detail',
  saveCreditPolicy: 'credit_policy_save',
  previewCreditAssessment: 'credit_assessment_preview',
  saveCreditDecision: 'credit_decision_save',
  creditDecision: 'credit_decision_detail',
  withdrawCreditDecision: 'credit_decision_withdraw'
});
export const FINANCIAL_CONTROL_SELECTORS = Object.freeze({
  collection_detail: 'collectionCaseId',
  collection_activity: 'collectionCaseId',
  collection_close: 'collectionCaseId',
  collection_reopen: 'collectionCaseId',
  collection_reminder: 'collectionCaseId',
  cash_plan_detail: 'cashPlanId',
  cash_plan_archive: 'cashPlanId',
  cash_plan_reopen: 'cashPlanId',
  credit_policy_detail: 'creditPolicyId',
  credit_assessment_preview: 'invoiceId',
  credit_decision_save: 'invoiceId',
  credit_decision_detail: 'creditDecisionId',
  credit_decision_withdraw: 'creditDecisionId'
});
export const FINANCIAL_CONTROL_ACTIONS = Object.freeze({
  collection_save: 'collection_case_saved',
  collection_activity: 'collection_activity_recorded',
  collection_close: 'collection_case_close',
  collection_reopen: 'collection_case_reopen',
  cash_plan_save: 'cash_plan_saved',
  cash_plan_archive: 'cash_plan_archived',
  cash_plan_reopen: 'cash_plan_reopened',
  credit_policy_save: 'credit_policy_saved',
  credit_decision_save: 'credit_decision_saved',
  credit_decision_withdraw: 'credit_decision_withdrawn'
});
export const FINANCIAL_CONTROL_FILES = Object.freeze({
  'receivables-collection': Object.freeze(['case.json', 'case.csv', 'case.html', 'reminder.txt', 'manifest.json']),
  'receivables-collections': Object.freeze(['collections.json', 'collections.csv']),
  'receivables-cash-plan': Object.freeze(['plan.json', 'plan.csv', 'plan.html', 'manifest.json']),
  'receivables-cash-plan-comparison': Object.freeze(['comparison.json', 'comparison.csv']),
  'receivables-credit-decision': Object.freeze(['decision.json', 'decision.html', 'manifest.json'])
});
const METHODS_BY_OPERATION = Object.freeze(Object.fromEntries(
  Object.entries(FINANCIAL_CONTROL_METHODS).map(([method, operation]) => [operation, method])));
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function invalid(message) {
  return Object.assign(new Error(message), {code: 'ACCOUNTING_FINANCIAL_CONTROL_ARGUMENTS', status: 400});
}
/** Select a declared native controller method; keep the complete original value. */
export function financialControlInvocation(operation, input = {}) {
  const method = METHODS_BY_OPERATION[operation];
  if (!method) throw invalid('Choose an original customer collection, cash plan or credit operation.');
  if (!plain(input)) throw invalid('Supply one original JSON argument object.');
  const value = {...input};
  delete value.workspace;
  const selector = FINANCIAL_CONTROL_SELECTORS[operation];
  if (!selector) return {method, arguments: [value]};
  const id = value[selector];
  if (typeof id !== 'string' || !UUID.test(id))
    throw invalid('Select the original ' + selector + ' UUID.');
  delete value[selector];
  return {method, arguments: [id, value]};
}
export async function callFinancialControl(receivables, operation, input = {}) {
  const invocation = financialControlInvocation(operation, input);
  if (typeof receivables?.[invocation.method] !== 'function')
    throw Object.assign(new Error('This selected accounting edition does not include the original financial control operation.'),
      {code: 'ACCOUNTING_FINANCIAL_CONTROL_UNAVAILABLE', status: 409});
  return await receivables[invocation.method](...invocation.arguments);
}

/** Resolve only original generated members through their existing controllers. */
export async function financialControlFile(receivables, input) {
  if (!plain(input) || !FINANCIAL_CONTROL_FILES[input.kind]?.includes(input.file))
    throw invalid('Choose a complete original collection, cash-plan or credit decision file.');
  const {kind, file, workspace, ...query} = input;
  const selected = (key) => {
    const id = query[key];
    if (typeof id !== 'string' || !UUID.test(id)) throw invalid('Select the original ' + key + ' UUID.');
    delete query[key]; return id;
  };
  if (kind === 'receivables-collection') return receivables.collectionFile(selected('collectionCaseId'), file, query);
  if (kind === 'receivables-collections') return receivables.collectionsFile(file, query);
  if (kind === 'receivables-cash-plan') return receivables.cashPlanFile(selected('cashPlanId'), file, query);
  if (kind === 'receivables-cash-plan-comparison') return receivables.cashPlanComparisonFile(file, query);
  return receivables.creditDecisionFile(selected('creditDecisionId'), file);
}
