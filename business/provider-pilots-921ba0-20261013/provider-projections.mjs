// SPDX-License-Identifier: MIT
// Provider-documented projections only. This module performs no network or payment action.
function need(ok, code) {
  if (!ok) { const error = new TypeError(code); error.code = code; throw error; }
}
function record(value, code) {
  need(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  return value;
}
function integerText(value, code) {
  if (typeof value === 'number') {
    need(Number.isSafeInteger(value) && value >= 0, code);
    return String(value);
  }
  need(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 256, code);
  return value;
}
function optionalText(value, code) {
  if (value === undefined || value === null || value === '') return null;
  need(typeof value === 'string' && value.length > 0 && value.length <= 2048, code);
  return value;
}
function optionalInteger(value, code) {
  return value === undefined || value === null ? null : integerText(value, code);
}
function signedIntegerText(value, code) {
  if (typeof value === 'number') {
    need(Number.isSafeInteger(value), code);
    return String(value);
  }
  need(typeof value === 'string' && /^(0|-?[1-9][0-9]*)$/.test(value) && value.length <= 256, code);
  return value;
}
export function formatUsdMicros(value) {
  const amount = BigInt(signedIntegerText(value, 'INVALID_USD_MICROS'));
  const magnitude = amount < 0n ? -amount : amount;
  return (amount < 0n ? '-' : '') + (magnitude / 1000000n).toString() + '.' + (magnitude % 1000000n).toString().padStart(6, '0');
}

/** Project a captured original Nevermined settle response; verification is a separate action. */
export function projectNeverminedSettlement(input) {
  const value = record(input, 'INVALID_NEVERMINED_SETTLEMENT');
  need(typeof value.success === 'boolean', 'MISSING_SETTLEMENT_SUCCESS');
  const model = value.billingModel ?? null;
  need(model === null || model === 'credits' || model === 'pay-as-you-go', 'UNKNOWN_BILLING_MODEL');
  need(!value.success || model !== null, 'SUCCESSFUL_SETTLEMENT_NEEDS_BILLING_MODEL');
  const orderTx = optionalText(value.orderTx, 'INVALID_ORDER_TX');
  const transaction = optionalText(value.transaction, 'INVALID_TRANSACTION');
  const network = optionalText(value.network, 'INVALID_NETWORK');
  const redeemed = optionalInteger(value.creditsRedeemed, 'INVALID_CREDITS_REDEEMED');
  const remaining = optionalInteger(value.remainingBalance, 'INVALID_REMAINING_BALANCE');
  const errorReason = optionalText(value.errorReason, 'INVALID_ERROR_REASON');
  return {
    schema: 'tjlabs.nevermined-settlement-view.v1',
    evidence: 'PROVIDER_REPORTED_SETTLEMENT_RESPONSE',
    settlementReportedSuccessful: value.success,
    billingModel: model,
    credits: { redeemed, remaining },
    chargeReferences: { orderTx, transaction, network },
    amountUsd: null,
    fulfillment: 'NOT_ASSESSED',
    interpretation: !value.success
      ? 'The provider did not report successful settlement.'
      : model === 'pay-as-you-go'
        ? 'The provider reports PAYG settlement. Zero credits do not establish a free purchase.'
        : 'The provider reports credit settlement. This response alone does not price credits in USD.',
    reconciliation: {
      chargeReferencePresent: orderTx !== null || transaction !== null,
      needsOriginalPlanAndChargeRecordForUsd: true,
      needsOriginalOutputAndAcceptanceForFulfillment: true
    },
    errorReason
  };
}

const MAX_AISA_WINDOW_SECONDS = 31 * 24 * 60 * 60;
function interval(startTime, endTime) {
  need(Number.isSafeInteger(startTime) && startTime > 0, 'INVALID_START_SECONDS');
  need(Number.isSafeInteger(endTime) && endTime > startTime, 'INVALID_END_SECONDS');
  return { startTime, endTime };
}
function keyReference(value) {
  need(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value), 'INVALID_KEY_REFERENCE');
  return value;
}
function usageSelection(value) {
  record(value, 'INVALID_USAGE_SELECTION');
  const times = interval(value.startTime, value.endTime);
  need(times.endTime - times.startTime <= MAX_AISA_WINDOW_SECONDS, 'AISA_WINDOW_EXCEEDS_31_DAYS');
  need(value.scope === 'key' && value.bucketWidth === '1d', 'UNSUPPORTED_AISA_USAGE_SELECTION');
  return { keyReference: keyReference(value.keyReference), ...times, scope: 'key', bucketWidth: '1d' };
}

/** Yield adjacent [start,end) requests. keyReference is a local label, never an API key. */
export function* planAisaUsageWindows({ keyReference: selectedKey, startTime, endTime }) {
  interval(startTime, endTime);
  keyReference(selectedKey);
  let start = startTime;
  while (start < endTime) {
    const end = endTime - start <= MAX_AISA_WINDOW_SECONDS ? endTime : start + MAX_AISA_WINDOW_SECONDS;
    yield {
      keyReference: selectedKey,
      startTime: start,
      endTime: end,
      scope: 'key',
      bucketWidth: '1d',
      method: 'GET',
      url: 'https://api.aisa.one/v1/usage?start_time=' + start + '&end_time=' + end + '&bucket_width=1d&scope=key'
    };
    start = end;
  }
}

/**
 * The capture envelope is TJLabs' local association, not an AIsa wire schema.
 * response must be the already-captured original JSON body containing documented totals.
 */
export function projectAisaUsageCapture(input) {
  record(input, 'INVALID_USAGE_CAPTURE');
  const selection = usageSelection(input.selection);
  const response = record(input.response, 'INVALID_USAGE_RESPONSE');
  const totals = record(response.totals, 'MISSING_USAGE_TOTALS');
  const charged = signedIntegerText(totals.charged_micros_usd, 'INVALID_CHARGED_MICROS_USD');
  const value = signedIntegerText(totals.usage_value_micros_usd, 'INVALID_USAGE_VALUE_MICROS_USD');
  return {
    schema: 'tjlabs.aisa-key-usage-view.v1',
    evidence: 'PROVIDER_REPORTED_KEY_WINDOW_TOTALS',
    selection,
    currency: 'USD',
    chargedMicrosUsd: charged,
    usageValueMicrosUsd: value,
    chargedUsd: formatUsdMicros(charged),
    usageValueUsd: formatUsdMicros(value),
    individualRequestOutcome: 'NOT_ASSESSED',
    historicalTopUpOutcome: 'NOT_ASSESSED'
  };
}

/** Sum original non-overlapping windows for one locally identified key; reject duplicate intervals. */
export function combineAisaUsageCaptures(captures) {
  need(Array.isArray(captures) && captures.length > 0 && captures.length <= 4096, 'INVALID_CAPTURE_COLLECTION');
  const views = captures.map(projectAisaUsageCapture).sort((a, b) => a.selection.startTime - b.selection.startTime);
  const selectedKey = views[0].selection.keyReference;
  let previousEnd = null;
  let charged = 0n;
  let value = 0n;
  const gaps = [];
  for (const view of views) {
    const selection = view.selection;
    need(selection.keyReference === selectedKey, 'MIXED_KEY_REFERENCES');
    if (previousEnd !== null) {
      need(selection.startTime >= previousEnd, 'OVERLAPPING_USAGE_WINDOWS');
      if (selection.startTime > previousEnd) gaps.push({ startTime: previousEnd, endTime: selection.startTime });
    }
    previousEnd = selection.endTime;
    charged += BigInt(view.chargedMicrosUsd);
    value += BigInt(view.usageValueMicrosUsd);
  }
  return {
    schema: 'tjlabs.aisa-key-usage-summary.v1',
    evidence: 'SUM_OF_NON_OVERLAPPING_PROVIDER_KEY_WINDOWS',
    keyReference: selectedKey,
    currency: 'USD',
    selections: views.map(view => view.selection),
    gaps,
    chargedMicrosUsd: charged.toString(),
    usageValueMicrosUsd: value.toString(),
    chargedUsd: formatUsdMicros(charged.toString()),
    usageValueUsd: formatUsdMicros(value.toString()),
    individualRequestOutcome: 'NOT_ASSESSED',
    historicalTopUpOutcome: 'NOT_ASSESSED'
  };
}
