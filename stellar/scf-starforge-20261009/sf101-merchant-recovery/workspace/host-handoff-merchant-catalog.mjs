// MIT. Source-owned metadata for the original offline whole-host handoff engine.
export const HOST_HANDOFF_MERCHANT_PREFIX = 'merchant_host_handoff_';
export const HOST_HANDOFF_MERCHANT_ALIAS_PATTERN = '^[a-z0-9][a-z0-9_-]{0,63}$';
export const HOST_HANDOFF_MERCHANT_SHA_PATTERN = '^[a-f0-9]{64}$';
const host = { type: 'string', pattern: HOST_HANDOFF_MERCHANT_ALIAS_PATTERN,
  description: 'An exact alias selected by the operator in the standalone host-handoff connection.' };
const digest = { type: 'string', pattern: HOST_HANDOFF_MERCHANT_SHA_PATTERN };
const selected = { host };
const quiesced = { const: true,
  description: 'Confirm that the original source or receiving producers selected for this operation are stopped and will remain stopped throughout the native operation.' };
const read = { readOnly: true, idempotent: true };
const native = { readOnly: false, idempotent: false };

export function hostHandoffMerchantTools(tool) {
  return [
    tool('merchant_host_handoff_hosts',
      'Read the operator-selected whole-host handoff aliases and available source/receiving capabilities. This standalone provider invokes the existing offline engine; it does not borrow a running recovery listener.',
      {}, [], read),
    tool('merchant_host_handoff_selection',
      'Read the complete original host-selected source-selection file, exact UTF-8 bytes and SHA-256. Inspect every source before acknowledging producer quiescence and creating a plan. This read does not create a plan or dispatch capture.',
      selected, ['host'], read),
    tool('merchant_host_handoff_plan',
      'Create the original native plan once from the exact reviewed source-selection SHA-256 and explicit quiescence. Plan creation is create-only. After a lost response, use saved_plan to read the original complete saved plan instead of repeating creation.',
      { ...selected, expectedSelectionSha256: digest, quiesced },
      ['host', 'expectedSelectionSha256', 'quiesced'], native),
    tool('merchant_host_handoff_saved_plan',
      'Read the complete original plan at the operator-selected path, its exact bytes and SHA-256. Optionally require the previously observed plan SHA. This recovers a lost plan response without regenerating a plan or dispatching capture.',
      { ...selected, expectedPlanSha256: digest }, ['host'], read),
    tool('merchant_host_handoff_export',
      'Invoke original whole-host capture for the exact saved plan SHA-256 with explicit continued source-producer quiescence. Uses the fixed original bundle and capture-operation directories and original leases/reconciliation. After uncertainty, read capture for this same host and plan before deciding whether to continue the original operation.',
      { ...selected, expectedPlanSha256: digest, quiesced },
      ['host', 'expectedPlanSha256', 'quiesced'], native),
    tool('merchant_host_handoff_capture',
      'Read the original recorded capture result for the exact plan SHA-256. Returns recorded-only evidence; it does not authenticate the bundle, acquire capture leases or dispatch an export.',
      { ...selected, expectedPlanSha256: digest }, ['host', 'expectedPlanSha256'], read),
    tool('merchant_host_handoff_restore',
      'Invoke original whole-host bundle restore using the exact reviewed manifest SHA-256 and the operator-selected bundle, passphrase environment name and restore directory. Preserve complete native results and original paths; do not automatically retry an uncertain response.',
      { ...selected, expectedManifestSha256: digest }, ['host', 'expectedManifestSha256'], native),
    tool('merchant_host_handoff_review',
      'Run the original receiving review for the exact manifest SHA-256 and fixed restored source, target and adoption-operation paths. Inspect the complete native receiving review and its review SHA before adoption. This operation may retain native review state.',
      { ...selected, expectedManifestSha256: digest }, ['host', 'expectedManifestSha256'], native),
    tool('merchant_host_handoff_adopt',
      'Adopt only the exact native manifest and receiving review SHA-256 with explicit receiving-producer quiescence. Uses the original adoption operation and its locks, saved progress and supported cancellation. After a lost response, read operation for this same host and review before explicitly continuing.',
      { ...selected, expectedManifestSha256: digest, expectedReviewSha256: digest, quiesced },
      ['host', 'expectedManifestSha256', 'expectedReviewSha256', 'quiesced'], native),
    tool('merchant_host_handoff_operation',
      'Read the original recorded adoption operation for the exact review SHA-256. Returns recorded-only progress/results; it does not authenticate, acquire adoption leases, dispatch adoption or mark an incomplete operation complete.',
      { ...selected, expectedReviewSha256: digest }, ['host', 'expectedReviewSha256'], read)
  ];
}
