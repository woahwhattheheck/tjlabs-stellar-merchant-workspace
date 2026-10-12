/** The original QuickBooks compiler, native response validator and accountant return. */
import type {
  QboBuyerSelection, QboBuyerPlanFacts, QboBuyerExcludedRow
} from "./qbo-buyer.mjs";

export type QboEnvironment = "sandbox" | "production";
export type QboCurrency = "USD" | "CAD" | "EUR" | "GBP" | "AUD" | "NZD";
export interface QboIntegrity { sha256: string }
export interface QboAccountReference { value: string; name?: string }
export interface QboAccountInput extends QboAccountReference {
  Active?: boolean; CurrencyRef?: {value: string}; AccountType?: string;
}
export interface QboCompanySnapshot {
  schema: "stellar-forge.quickbooks-company.v1";
  realmId: string; companyName: string; baseCurrency: string; multiCurrencyEnabled: boolean;
  accounts: readonly (QboAccountInput & {selectable: boolean; [key: string]: unknown})[];
  summary: Record<string, unknown>;
  sourceDocuments: {companyInfo: string; preferences: string; accounts: string};
  sourceDigests: Record<string, unknown>; integrity: QboIntegrity;
}
export interface QboMerchantSelection {
  rowId: string; amount: string | number; debitAccount: QboAccountInput;
  creditAccount: QboAccountInput; description?: string;
}
export interface QboCreatePlanInput {
  /** Original validated merchant or issued buyer accountant handoff, never an invented event projection. */
  handoff: unknown; revision?: unknown | null;
  id: string; name: string; actor: string; createdAt: string;
  realmId: string; companyName: string; baseCurrency: QboCurrency;
  environment?: QboEnvironment; txnDate: string; docNumber?: string | null;
  rows: readonly (QboMerchantSelection | QboBuyerSelection)[];
  companySnapshot?: QboCompanySnapshot | null;
  /** Required for buyer handoffs together with explicit decisions for every allocation. */
  valuationBasis?: string;
}
export interface QboMappedRow {
  rowId: string; sourceRowSha256: string; assignmentSha256: string;
  sourceNetwork: string; sourceAmountAtomic: string;
  amount: string; debitAccount: QboAccountReference; creditAccount: QboAccountReference; description: string;
}
export interface QboMerchantPlanRow extends QboMappedRow {
  eventId: string; sourceLabel: unknown; sourceAdjustments: unknown | null;
}
export interface QboBuyerPlanRow extends QboMappedRow, QboBuyerPlanFacts {
  decision: "include"; valuationNote: string;
}
export interface QboJournalLine {
  Amount: number; Description: string; DetailType: "JournalEntryLineDetail";
  JournalEntryLineDetail: {PostingType: "Debit" | "Credit"; AccountRef: QboAccountReference};
}
export interface QboJournalEntry {
  TxnDate: string; DocNumber: string; PrivateNote: string;
  CurrencyRef: {value: QboCurrency}; Line: QboJournalLine[];
}
export interface QboPlanSummary {
  rowCount: number; lineCount: number; totalDebit: string; totalCredit: string;
}
export interface QboBuyerSource {
  kind: "buyer-expense-period"; runId: null; reportSha256: string; reportBytes: number;
  reportSchema: "stellar-forge.buyer-accountant-source.v1"; reportCreatedAt: string;
  periodClose: Record<string, unknown>;
  buyer: {
    workspaceId: string; periodId: string; closeId: string; sequence: number;
    contextSha256: string; dataContext: string; review: Record<string, unknown>;
    totals: readonly unknown[]; creditTotals: readonly unknown[]; netTotals: readonly unknown[];
    outstandingReservations: readonly unknown[]; sourceCaptures: readonly unknown[];
  };
}
export interface QboPlanBase {
  schema: "stellar-forge.quickbooks-journal-plan.v1";
  id: string; name: string; actor: string; createdAt: string;
  handoffId: string; handoffSha256: string;
  accountantRevisionId: string | null; accountantRevisionSha256: string | null;
  realmId: string; companyName: string; baseCurrency: QboCurrency; environment: QboEnvironment;
  txnDate: string; docNumber: string; companySnapshot: QboCompanySnapshot | null;
  summary: QboPlanSummary; docs: {title: string; url: string}[];
  journalEntry: QboJournalEntry; integrity: QboIntegrity;
}
export interface QboMerchantPlan extends QboPlanBase {
  sourceKind?: undefined; source: Record<string, unknown>; rows: QboMerchantPlanRow[];
  valuationBasis?: undefined; excluded?: undefined;
}
export interface QboBuyerPlan extends QboPlanBase {
  sourceKind: "buyer-expense-period"; source: QboBuyerSource; rows: QboBuyerPlanRow[];
  valuationBasis: string; excluded: QboBuyerExcludedRow[];
  summary: QboPlanSummary & {buyerExpenseRows: number; buyerCreditRows: number; excludedRows: number};
}
export type QboPlan = QboMerchantPlan | QboBuyerPlan;
export interface QboResponseBase {
  schema: "stellar-forge.quickbooks-journal-response.v1";
  id: string; name: string; actor: string; createdAt: string;
  planId: string; planSha256: string; realmId: string;
  responseSha256: string; responseBytes: number; integrity: QboIntegrity;
}
export interface QboMatchedResponse extends QboResponseBase {
  kind: "MATCHED"; journalEntryId: string; syncToken: string; errors: [];
  summary: {matchedRows: number; lineCount: number; totalDebit: string; totalCredit: string};
}
export interface QboFaultResponse extends QboResponseBase {
  kind: "FAULT"; journalEntryId: null; syncToken: null;
  errors: {code: string; message: string; detail: string}[]; summary: {matchedRows: 0};
}
export type QboResponse = QboMatchedResponse | QboFaultResponse;
export declare const QBO_PLAN_SCHEMA: "stellar-forge.quickbooks-journal-plan.v1";
export declare const QBO_RESPONSE_SCHEMA: "stellar-forge.quickbooks-journal-response.v1";
export declare const QBO_CURRENCIES: readonly ["USD", "CAD", "EUR", "GBP", "AUD", "NZD"];
export declare const QBO_DOCS: readonly {title: string; url: string}[];
export declare const qboHash: (value: string | Uint8Array) => string;
export declare function qboCheck(ok: unknown, code: string, message: string, status?: number): asserts ok;
export declare function qboCanonical(value: unknown): string;
export declare const qboJson: (value: unknown) => Uint8Array;
export declare function qboId(value: string): string;
export declare function qboText(value: string, label: string, max?: number, options?: {empty?: boolean}): string;
export declare function createQboPlan(input: QboCreatePlanInput): QboPlan;
export declare function validateQboPlan(value: unknown): QboPlan;
export declare function checkQboSource(plan: QboPlan, handoff: unknown, revision?: unknown | null): true;
export declare function inspectQboResponse(input: {
  plan: QboPlan; responseBytes: Uint8Array; realmId: string;
  id: string; name: string; actor: string; createdAt: string;
}): QboResponse;
export declare function validateQboResult(value: unknown): QboResponse;
export declare function qboReturnCsv(
  plan: QboPlan, result: QboMatchedResponse, handoff: unknown, revision?: unknown | null
): Uint8Array;
export declare function renderQboReview(plan: QboPlan): Uint8Array;
