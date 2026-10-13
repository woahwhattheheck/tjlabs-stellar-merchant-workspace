export interface RemittanceSource { sourceId: string; filename: string; csv: string; }
export interface RemittanceCurrency { code: string; scale: number; }
export interface RemittanceAllocation {
  record: number; allocationId: string; invoiceId: string; invoiceNumber: string;
  invoiceVersion: number; allocatedDate: string; amount: string; amountDueBefore: string;
  amountDueAfter: string; receiptAvailableBefore: string; receiptAvailableAfter: string;
}
export interface RemittanceGroup {
  remittanceId: string; records: number[]; customerReference: string; reference: string;
  method: string; receivedDate: string; currency: RemittanceCurrency; amount: string;
  status: 'READY_NEW_RECEIPT' | 'READY_EXISTING_RECEIPT' | 'ALREADY_IMPORTED' | 'CONFLICT';
  allocations: RemittanceAllocation[]; inputSha256?: string; customerId?: string;
  customerName?: string; receiptId?: string; batchId?: string; receiptSourceKind?: string;
  sourceNetwork?: string | null; sourceAmountAtomic?: string | null;
  sourceAssetDigest?: string | null; transactionFingerprint?: string | null;
  availableAsOf?: string; availableAfter?: string; code?: string; message?: string;
}
export interface RemittanceReview {
  schema: 'stellar-forge.merchant-remittance-review.v1'; workspaceId: string; revision: number;
  sourceId: string; filename: string; sourceSha256: string; sourceBytes: number;
  recordCount: number; canApply: boolean; conflictCount: number; newReceiptCount: number;
  allocationCount: number; alreadyImportedCount: number; groups: RemittanceGroup[];
  errors: Array<{record: number; code: string; message: string}>;
}
export interface RemittancePreviewInput { workspaceId: string; source: RemittanceSource; }
export interface RemittancePreview extends RemittancePreviewInput {
  revision: number; review: RemittanceReview; reviewSha256: string;
}
export interface RemittanceApplyInput extends RemittancePreviewInput {
  revision: number; reviewSha256: string; actor: string; requestId: string;
}
export interface RemittanceBatchSummary {
  id: string; sourceId: string; filename: string; sourceSha256: string;
  appliedAt: string; actor: string; sourceRevision: number; groupCount: number;
  allocationCount: number; newReceiptCount: number; reviewSha256: string;
}
export interface RemittanceList {
  workspaceId: string; revision: number; batches: RemittanceBatchSummary[];
}
export interface RemittanceDetail {
  workspaceId: string; revision: number; batch: RemittanceBatchSummary;
  review: RemittanceReview; receiptIds: string[]; invoiceIds: string[];
  allocationIds: string[]; newReceiptIds: string[]; files: string[];
}
export interface RemittanceOperation {
  id: string; action: 'remittance_applied'; actor: string; at: string;
  intentSha256: string; result: {remittanceBatchId: string}; replayed?: boolean;
}
export interface RemittanceApplied {
  workspaceId: string; revision: number; remittanceBatch: RemittanceBatchSummary;
  remittanceReview: RemittanceReview; operation: RemittanceOperation;
}
export interface RemittanceRequestOptions { signal?: AbortSignal; }
export declare class RemittancesClient {
  constructor(apiBase?: string, options?: {fetch?: typeof globalThis.fetch});
  list(options?: RemittanceRequestOptions): Promise<RemittanceList>;
  detail(id: string, options?: RemittanceRequestOptions): Promise<RemittanceDetail>;
  preview(value: RemittancePreviewInput, options?: RemittanceRequestOptions): Promise<RemittancePreview>;
  apply(value: RemittanceApplyInput, options?: RemittanceRequestOptions): Promise<RemittanceApplied>;
  operation(requestId: string, options?: RemittanceRequestOptions): Promise<RemittanceApplied>;
  fileUrl(id: string, name: 'source.csv' | 'review.json' | 'review.csv' | 'batch.json' | 'manifest.json'): string;
}
