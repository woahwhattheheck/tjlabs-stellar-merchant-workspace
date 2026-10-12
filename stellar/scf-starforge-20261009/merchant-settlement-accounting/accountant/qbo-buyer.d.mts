/** Original buyer allocation projection and same-book QuickBooks reservations. */
import type {QboBuyerPlan, QboPlan, QboEnvironment, QboAccountInput} from "./qbo.mjs";

export interface QboBuyerAssignment {
  externalStatus: string; externalBookRef: string; externalAccountCode: string; externalNote: string;
}
export interface QboBuyerLabel {
  assetLabel: string; unitLabel: string; accountCode: string; accountName: string;
}
export interface QboBuyerComponent {
  id: string; kind: "BUYER_EXPENSE" | "BUYER_CREDIT"; rowId: string;
  sourceLineId: string; sourceRowSha256: string; economicId: string;
  network: string; sourceAt: string; sourceTimeBasis: "BUYER_REVIEWED_RECOGNITION_DATE";
  amountAtomic: string; originalEconomicAmount: string; asset: string;
  assetLabel: string; unitLabel: string; transfer: string;
  transactionFingerprint: string | null; observationSha256: string | null;
  dataContext: string; costCenter: string; project: string; sourceAccountCode: string;
  codingId: string; line: number; itemId: string; creditId: string | null;
}
export interface QboBuyerRow extends QboBuyerComponent, QboBuyerAssignment {
  sourceComponentId: string; sourceAllocation: QboBuyerComponent;
  recognitionDate: string; original: Record<string, unknown>; label: QboBuyerLabel;
}
export interface QboBuyerPlanFacts {
  rowId: string; sourceRowSha256: string; sourceLineId: string; sourceComponentId: string;
  economicId: string; kind: "BUYER_EXPENSE" | "BUYER_CREDIT"; sourceNetwork: string;
  sourceAmountAtomic: string; sourceLabel: QboBuyerLabel; sourceAllocation: QboBuyerComponent;
}
export interface QboBuyerIncludeSelection {
  rowId: string; decision: "include"; amount: string;
  debitAccount: QboAccountInput; creditAccount: QboAccountInput;
  valuationNote: string; description?: string;
}
export interface QboBuyerExcludeSelection {
  rowId: string; decision: "exclude"; reason: string;
}
export type QboBuyerSelection = QboBuyerIncludeSelection | QboBuyerExcludeSelection;
export interface QboBuyerExcludedRow extends QboBuyerPlanFacts {
  assignmentSha256: string; decision: "exclude"; reason: string;
}
export interface QboBuyerReservation {
  sourceKind: "buyer-expense-period"; buyerWorkspaceId: string; buyerCloseId: string;
  buyerSourceSha256: string; buyerSourceLineIds: string[]; buyerEconomicIds: string[];
}
export declare const qboBuyerAssignmentHash: (row: Partial<QboBuyerAssignment>) => string;
/** Identifies the discriminator; validateQboPlan checks the complete sealed packet. */
export declare const isQboBuyerPlan: (plan: unknown) => plan is QboBuyerPlan;
/** Handoff/revision inputs are validated by the original accountant engine. */
export declare function qboBuyerRows(handoff: unknown, revision?: unknown | null): QboBuyerRow[];
export declare function qboBuyerPlanFacts(row: QboBuyerRow): QboBuyerPlanFacts;
export declare function qboBuyerDecisions(input: {
  handoff: unknown; revision?: unknown | null; rows: readonly QboBuyerSelection[];
  environment: QboEnvironment; valuationBasis: string;
}): {
  included: {row: QboBuyerRow; selection: QboBuyerIncludeSelection}[];
  excluded: QboBuyerExcludedRow[]; valuationBasis: string;
};
/** Returns nonbuyer values unchanged; a buyer discriminator invokes the complete typed check. */
export declare function validateQboBuyerPlan<T>(plan: T): T;
export declare function checkQboBuyerSource(plan: QboBuyerPlan, handoff: unknown, revision?: unknown | null): true;
export declare function qboBuyerReservation(plan: QboBuyerPlan): QboBuyerReservation;
export declare function qboBuyerReservation(plan: QboPlan): QboBuyerReservation | Record<string, never>;
/** Called with original validated qboPlans records after realm/environment filtering. */
export declare function qboBuyerReservationOverlap(
  selected: Partial<QboBuyerReservation>, other: Partial<QboBuyerReservation>
): boolean;
