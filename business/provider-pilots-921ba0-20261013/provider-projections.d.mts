// SPDX-License-Identifier: MIT
export type IntegerInput = string | number;
export interface NeverminedSettlement {
  success: boolean;
  billingModel?: 'credits' | 'pay-as-you-go' | null;
  creditsRedeemed?: IntegerInput | null;
  remainingBalance?: IntegerInput | null;
  orderTx?: string | null;
  transaction?: string | null;
  network?: string | null;
  errorReason?: string | null;
}
export interface NeverminedSettlementView {
  schema: 'tjlabs.nevermined-settlement-view.v1';
  evidence: 'PROVIDER_REPORTED_SETTLEMENT_RESPONSE';
  settlementReportedSuccessful: boolean;
  billingModel: 'credits' | 'pay-as-you-go' | null;
  credits: { redeemed: string | null; remaining: string | null };
  chargeReferences: { orderTx: string | null; transaction: string | null; network: string | null };
  amountUsd: null;
  fulfillment: 'NOT_ASSESSED';
  interpretation: string;
  reconciliation: {
    chargeReferencePresent: boolean;
    needsOriginalPlanAndChargeRecordForUsd: true;
    needsOriginalOutputAndAcceptanceForFulfillment: true;
  };
  errorReason: string | null;
}
export interface AisaSelection {
  /** Local configuration label; never put an API key here. */
  keyReference: string;
  /** Positive Unix seconds; [startTime,endTime). */
  startTime: number;
  endTime: number;
  scope: 'key';
  bucketWidth: '1d';
}
export interface AisaCapture {
  /** This wrapper associates an existing private selection and already-captured original response. */
  selection: AisaSelection;
  response: {
    totals: { charged_micros_usd: IntegerInput; usage_value_micros_usd: IntegerInput; [field: string]: unknown };
    [field: string]: unknown;
  };
}
export interface AisaUsageView {
  schema: 'tjlabs.aisa-key-usage-view.v1';
  evidence: 'PROVIDER_REPORTED_KEY_WINDOW_TOTALS';
  selection: AisaSelection;
  currency: 'USD';
  chargedMicrosUsd: string;
  usageValueMicrosUsd: string;
  chargedUsd: string;
  usageValueUsd: string;
  individualRequestOutcome: 'NOT_ASSESSED';
  historicalTopUpOutcome: 'NOT_ASSESSED';
}
export interface AisaUsageSummary {
  schema: 'tjlabs.aisa-key-usage-summary.v1';
  evidence: 'SUM_OF_NON_OVERLAPPING_PROVIDER_KEY_WINDOWS';
  keyReference: string;
  currency: 'USD';
  selections: AisaSelection[];
  gaps: Array<{startTime:number;endTime:number}>;
  chargedMicrosUsd: string;
  usageValueMicrosUsd: string;
  chargedUsd: string;
  usageValueUsd: string;
  individualRequestOutcome: 'NOT_ASSESSED';
  historicalTopUpOutcome: 'NOT_ASSESSED';
}
export function formatUsdMicros(value: IntegerInput): string;
export function projectNeverminedSettlement(input: NeverminedSettlement): NeverminedSettlementView;
export function planAisaUsageWindows(selection: Pick<AisaSelection,'keyReference'|'startTime'|'endTime'>):
  Generator<AisaSelection & {method:'GET';url:string},void,unknown>;
export function projectAisaUsageCapture(input: AisaCapture): AisaUsageView;
export function combineAisaUsageCaptures(captures: readonly AisaCapture[]): AisaUsageSummary;
