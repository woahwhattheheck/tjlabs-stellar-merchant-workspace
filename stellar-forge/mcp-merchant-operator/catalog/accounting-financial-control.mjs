// MIT. TokenJunkieLabs. Original collection, cash-plan and credit controller inputs.
export function financialControlDefinitions({read, mutate, uuid, hash, date, revision, text, money, currency, object}) {
  const workspaceId = hash;
  const enumeration = values => ({type: 'string', enum: values});
  const nullable = value => ({anyOf: [value, {type: 'null'}]});
  const terms = {title: text(6000, 1), owner: text(1000, 1),
    priority: enumeration(['NORMAL', 'HIGH', 'URGENT']), nextActionDate: date};
  const accountDate = {asOf: date};
  const collectionQuery = {...accountDate, customerId: uuid, owner: text(1000),
    status: enumeration(['ALL', 'OPEN', 'CLOSED', 'FUTURE']), search: text(6000)};
  const caseContext = {workspaceId, collectionCaseId: uuid, expectedVersion: revision, effectiveDate: date};
  const caseRequired = ['workspaceId', 'collectionCaseId', 'expectedVersion', 'effectiveDate'];
  const override = object({invoiceId: uuid, mode: enumeration(['DATE', 'EXCLUDE']),
    expectedDate: nullable(date), reason: text(6000, 1)}, ['invoiceId', 'mode', 'reason']);
  const plan = object({title: text(6000, 1), owner: text(1000, 1), note: text(6000),
    asOf: date, through: date, bucket: enumeration(['DAY', 'WEEK', 'MONTH']),
    customerId: nullable(uuid), pastDueDelayDays: {type: 'integer', minimum: 0},
    futureDelayDays: {type: 'integer', minimum: 0}, usePromises: {type: 'boolean'},
    disputes: enumeration(['SEPARATE', 'INCLUDE']), overrides: {type: 'array', items: override}},
    ['title', 'owner', 'asOf', 'through']);
  const comparison = {leftId: uuid, rightId: uuid, leftEditionId: uuid, rightEditionId: uuid};
  const creditTerms = object({enabled: {type: 'boolean'}, creditLimit: nullable(money),
    overdueDays: nullable({type: 'integer', minimum: 0}), reviewDisputes: {type: 'boolean'},
    reviewEveryOrder: {type: 'boolean'}},
    ['enabled', 'creditLimit', 'overdueDays', 'reviewDisputes', 'reviewEveryOrder']);
  return [
    read('collection_list', 'Read the complete dated collection queue, unassigned original balances, per-currency totals and workspace identity. Preserve all cases and source balances.', collectionQuery),
    read('collection_detail', 'Open one complete original collection case, its selected-date projection, immutable activity and current case version.',
      {collectionCaseId: uuid, ...accountDate}, ['collectionCaseId']),
    mutate('collection_save', 'Assign an original issued invoice or edit its existing follow-up. Retain workspaceId, exact effectiveDate, current revision and id/expectedVersion for an edit.',
      {workspaceId, id: uuid, invoiceId: uuid, expectedVersion: revision, effectiveDate: date, ...terms, note: text(6000)},
      ['workspaceId', 'effectiveDate', 'title', 'owner', 'priority', 'nextActionDate']),
    mutate('collection_activity', 'Record the actual dated note, contact, promise, promise outcome, dispute or dispute resolution on the original case. Retain the original promise/dispute ID for its outcome and the complete source amount.',
      {...caseContext, kind: enumeration(['NOTE', 'CONTACT', 'PROMISE', 'PROMISE_OUTCOME', 'DISPUTE', 'DISPUTE_RESOLUTION']),
        occurredDate: date, note: text(6000), reference: text(6000), nextActionDate: date,
        channel: enumeration(['EMAIL', 'PHONE', 'MEETING', 'OTHER']), direction: enumeration(['INBOUND', 'OUTBOUND']),
        contact: text(6000), amount: money, dueDate: date, promiseId: uuid,
        outcome: enumeration(['KEPT', 'BROKEN', 'WITHDRAWN']), disputeId: uuid,
        category: enumeration(['PRICING', 'DELIVERY', 'DUPLICATE', 'OTHER'])}, [...caseRequired, 'kind', 'note']),
    mutate('collection_close', 'Close the original follow-up with its actual effective date and reason. Original promise, dispute and financial history remain retained.',
      {...caseContext, note: text(6000, 1)}, [...caseRequired, 'note']),
    mutate('collection_reopen', 'Reopen the existing case at its current version with the reason and next follow-up date.',
      {...caseContext, note: text(6000, 1), nextActionDate: date}, [...caseRequired, 'note', 'nextActionDate']),
    read('collection_reminder', 'Prepare the original customer reminder from the selected dated case balance. This returns complete subject/text and original invoice context.',
      {collectionCaseId: uuid, ...accountDate}, ['collectionCaseId']),
    read('cash_plan_list', 'Read all saved merchant collection plans with their retained latest editions and current versions.',
      {status: enumeration(['ALL', 'ACTIVE', 'ARCHIVED']), search: text(6000)}),
    read('cash_plan_preview', 'Calculate the complete original invoice/installment/promise collection scenario. Retain plan, projection, source issues, currency groups, workspaceId, revision and reviewSha256 before saving.',
      {workspaceId, plan}, ['workspaceId', 'plan']),
    read('cash_plan_detail', 'Open a retained cash-plan edition with its complete original projection, edition inventory and plan history.',
      {cashPlanId: uuid, editionId: uuid}, ['cashPlanId']),
    mutate('cash_plan_save', 'Save the exact reviewed complete scenario as a new immutable edition. Existing plans require their original id and current expectedVersion.',
      {workspaceId, id: uuid, expectedVersion: revision, plan, reviewSha256: hash}, ['workspaceId', 'plan', 'reviewSha256']),
    mutate('cash_plan_archive', 'Archive an original plan at its current version while keeping its complete saved editions and exports.',
      {workspaceId, cashPlanId: uuid, expectedVersion: revision, note: text(1500, 1)},
      ['workspaceId', 'cashPlanId', 'expectedVersion', 'note']),
    mutate('cash_plan_reopen', 'Reopen an archived original plan for a following reviewed edition.',
      {workspaceId, cashPlanId: uuid, expectedVersion: revision, note: text(1500, 1)},
      ['workspaceId', 'cashPlanId', 'expectedVersion', 'note']),
    read('cash_plan_compare', 'Compare two explicitly selected original plan editions, preserving each source revision and complete per-currency and date differences.',
      comparison, ['leftId', 'rightId']),
    read('credit_control', 'Open current original customer policies, draft invoices and retained release decisions. Credit release uses the current account date.',
      {customerId: uuid, search: text(6000)}),
    read('credit_policy_detail', 'Read the complete original customer/currency credit policy with all saved editions and reasoned history.',
      {creditPolicyId: uuid}, ['creditPolicyId']),
    mutate('credit_policy_save', 'Save the merchant’s explicit customer/currency credit policy. Enabled policies apply their selected review rules to original invoice issue; a disabled policy retains ordinary issue.',
      {workspaceId, id: uuid, expectedVersion: revision, customerId: uuid, currency,
        owner: text(300, 1), terms: creditTerms, reason: text(3000, 1)},
      ['workspaceId', 'customerId', 'currency', 'owner', 'terms', 'reason']),
    read('credit_assessment_preview', 'Review the complete current original draft, account exposure, future issued obligations, overdue balances, recorded disputes and available funds. Preserve assessmentSha256 and original invoice preview metadata.',
      {workspaceId, invoiceId: uuid}, ['workspaceId', 'invoiceId']),
    mutate('credit_decision_save', 'Retain an operator APPROVE or DECLINE decision for the exact reviewed assessment. Original invoice issue consumes a matching approval in the same original ledger commit.',
      {workspaceId, invoiceId: uuid, assessmentSha256: hash, outcome: enumeration(['APPROVE', 'DECLINE']),
        reason: text(3000, 1)}, ['workspaceId', 'invoiceId', 'assessmentSha256', 'outcome', 'reason']),
    read('credit_decision_detail', 'Open the complete saved decision and assessment, current account comparison, release eligibility and original draft preview metadata.',
      {creditDecisionId: uuid}, ['creditDecisionId']),
    mutate('credit_decision_withdraw', 'Withdraw a current original approval or decline with the responsible operator’s reason and current decision version.',
      {workspaceId, creditDecisionId: uuid, expectedVersion: revision, reason: text(3000, 1)},
      ['workspaceId', 'creditDecisionId', 'expectedVersion', 'reason'])
  ];
}
