export type Money = string;
export type DateOnly = string;
export type Revision = number;
export interface Currency { code: string; scale: number }
export interface MutationContext { revision: Revision; actor: string; requestId: string }
export interface Issuer {
  name: string; address?: string; email?: string; taxReference?: string;
  paymentInstructions?: string; invoicePrefix?: string; creditPrefix?: string; version?: number;
}
export interface Customer {
  id: string; name: string; reference?: string; version?: number; email?: string; address?: string; [key: string]: unknown;
}
export interface DraftLine {
  id?: string; description: string; quantity: string; unitAmount: Money; discountAmount?: Money; taxAmount?: Money;
}
export interface InvoiceLine {
  id: string; description: string; quantity: string; unitAmount: Money; subtotal: Money;
  discountAmount: Money; netAmount: Money; taxAmount: Money; total: Money;
}
export interface InvoiceTotals { subtotal: Money; discount: Money; net: Money; tax: Money; total: Money }
export interface DraftInput {
  customerId: string; currency: Currency; issueDate: DateOnly; dueDate: DateOnly;
  purchaseOrder?: string; note?: string; lines: DraftLine[]; replacesId?: string | null; sourceReference?: string;
}
export interface SaveDraft extends MutationContext, DraftInput { id?: string; expectedVersion?: number }
export interface InvoiceDraft extends Omit<DraftInput, 'lines'> { lines: InvoiceLine[]; totals: InvoiceTotals }
export interface InvoiceSummary {
  id: string; number: string | null; status: 'DRAFT' | 'ISSUED' | 'VOID'; version: number;
  customerId: string; customerName: string; currency: Currency; issueDate: DateOnly; dueDate: DateOnly;
  total: Money; paid: Money; credited: Money; balance: Money; amountDue: Money; creditBalance: Money;
  paymentStatus: 'DRAFT' | 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CREDIT_BALANCE' | 'VOID' | 'FUTURE';
  overdueDays: number; voidDate: DateOnly | null; asOf: DateOnly; [key: string]: unknown;
}
export interface InvoiceDocument extends InvoiceDraft {
  schema: string; kind: 'INVOICE'; id: string; number: string | null;
  issuedAt: string | null; actor: string | null; issuer: Issuer; customer: Customer;
}
export interface FileMetadata { bytes: number; sha256: string }
export type DocumentFiles = Record<string, FileMetadata>;
export interface CreditLine {
  invoiceLineId: string; description: string; netAmount: Money; taxAmount: Money; total: Money;
}
export interface CreditDocument {
  schema: string; kind: 'CREDIT_NOTE'; id: string; number: string; issuedAt: string; actor: string;
  invoiceId: string; invoiceNumber: string; invoiceSha256: string; customer: Customer; issuer: Issuer; currency: Currency;
  creditDate: DateOnly; reason: string; lines: CreditLine[]; totals: {net: Money; tax: Money; total: Money};
}
export interface CreditSummary {
  id: string; invoiceId: string; number: string; customerId: string; currency: Currency;
  creditDate: DateOnly; reason: string; total: Money;
}
export interface CreditRecord {
  id: string; invoiceId: string; number: string; document: CreditDocument; directoryId: string; files: DocumentFiles;
}
export type Credit = CreditSummary;
export interface Receipt {
  id: string; customerId: string; customer: Customer; currency: Currency; amount: Money; allocated: Money; available: Money;
  receivedDate: DateOnly; method: string; reference: string; note: string; status: 'RECORDED' | 'VOID';
  voidDate?: DateOnly | null; sourceKey: string; source: {kind: string; runId?: string; eventId?: string; [key: string]: unknown};
  createdAt: string; actor: string; history: HistoryEntry[]; asOf?: DateOnly; [key: string]: unknown;
}
export interface Allocation {
  id: string; invoiceId: string; receiptId: string; customerId: string; currency: Currency;
  amount: Money; minorAmount: string; allocatedDate: DateOnly; releasedDate: DateOnly | null;
  reason?: string; releasedBy?: string; createdAt: string; actor: string; history: HistoryEntry[];
}
export interface HistoryEntry {
  action: string; actor: string; at: string; requestId?: string; revision?: number;
  details?: Record<string, unknown>; [key: string]: unknown;
}
export interface SettlementRun { id: string; name: string; createdAt: string; completedAt: string; reportSha256: string }
export interface AgingCurrency {
  currency: Currency; current: Money; days1to30: Money; days31to60: Money; days61to90: Money; days91plus: Money;
  amountDue: Money; creditBalance: Money; unappliedPayments: Money; invoices: number;
}
export interface AgingReport { asOf: DateOnly; currencies: AgingCurrency[]; invoices: InvoiceSummary[] }
export interface ReceivablesState {
  schema: string; revision: Revision; asOf: DateOnly; issuer: Issuer; customers: Customer[]; runs: SettlementRun[];
  invoices: InvoiceSummary[]; receipts: Receipt[]; credits: CreditSummary[]; allocations: Allocation[];
  aging: AgingReport; history: HistoryEntry[]; paymentRequests: PaymentRequestSummary[];
}
export interface SourceQuote {
  customerId: string; directoryId: string; files: DocumentFiles; sourceSha256: string;
  quoteId: string; quoteSha256: string; originalDraftSha256: string; review: Record<string, unknown>;
}
export interface InvoiceDetail {
  invoice: InvoiceSummary; draft: InvoiceDraft; document: InvoiceDocument | null;
  credits: CreditRecord[]; allocations: Allocation[]; receipts: Receipt[]; files: DocumentFiles;
  sourceQuote: SourceQuote | null; quoteDraftChanged: boolean; history: HistoryEntry[]; revision: Revision;
}
export type QuoteImportInput = MutationContext & {
  quoteContent: string; responseContent?: string; customerId: string; issueDate: DateOnly; dueDate: DateOnly; currencyScale?: number;
} & ({scope: 'IMPLEMENTATION'; periodCount?: 1; periodLabel?: string} | {scope: 'RECURRING'; periodCount: number; periodLabel: string});
export interface Operation {
  id: string; action: string; actor: string; at: string; intentSha256: string; replayed: boolean;
  result: {invoiceId?: string; receiptId?: string; creditId?: string; allocationId?: string; paymentRequestId?: string; paymentReturnId?: string; settings?: boolean};
}
export interface MutationResult { revision: Revision; operation: Operation }
export interface Preview { document: InvoiceDocument; previewSha256: string; expectedVersion: number; revision: Revision }
export interface CreditInput extends MutationContext {
  creditDate: DateOnly; reason: string; lines: Array<{invoiceLineId: string; netAmount: Money; taxAmount: Money}>;
}
export interface ReceiptInput extends MutationContext {
  customerId: string; currency: Currency; amount: Money; receivedDate: DateOnly; method: string; reference: string; note?: string;
}
export interface SettlementReceiptInput extends MutationContext {
  customerId: string; runId: string; eventId: string; currency: Currency; amount: Money; receivedDate: DateOnly; valuationNote: string;
  reference?: string; note?: string;
}
export interface AllocateInput extends MutationContext { invoiceId: string; receiptId: string; amount: Money; allocatedDate: DateOnly }
export interface LedgerQuery { runId: string; customerId: string; offset?: number; limit?: number }
export interface LedgerItem {
  eventId: string; orderReferenceDigest: string; network: string; amountAtomic: string; assetDigest?: string; recipientDigest?: string;
  transfer: string; verificationScope: string; transactionFingerprint: string; recordedAt: string; eligible: boolean;
  importedReceiptId: string | null; adjustmentSummary: unknown; [key: string]: unknown;
}
export interface LedgerPage {
  items: LedgerItem[]; total: number; offset: number; limit: number; runId: string; reportSha256: string; revision: Revision;
}
export interface CustomerExport {
  schema: string; customer: Customer; currencies: AgingCurrency[]; invoices: InvoiceSummary[];
  credits: CreditSummary[]; receipts: Receipt[]; allocations: Allocation[]; asOf: DateOnly; [key: string]: unknown;
}

export type StellarPaymentNetwork = 'stellar:pubnet' | 'stellar:testnet';
export type StellarPaymentAssetInput = {kind: 'native'; code?: 'XLM'; issuer?: null}
  | {kind: 'credit'; code: string; issuer: string};
export type StellarPaymentAsset = {kind: 'native'; code: 'XLM'; issuer: null}
  | {kind: 'credit'; code: string; issuer: string};
export interface StellarPaymentMemo {
  type: 'MEMO_TEXT' | 'MEMO_ID' | 'MEMO_HASH' | 'MEMO_RETURN';
  /** Text, unsigned decimal ID, or canonical base64 of 32 bytes. */
  value: string;
}
export interface PaymentRequestInput {
  id?: string; invoiceAmount?: Money; network: StellarPaymentNetwork;
  destination: string; asset: StellarPaymentAssetInput; stellarAmount: string;
  memo?: StellarPaymentMemo; msg?: string; expiresAt?: string | null;
  /** Required except native XLM at the exact invoice face amount. */
  valuationNote?: string;
}
export interface PaymentInvoiceSnapshot {
  id: string; number: string; sha256: string; version: number; currency: Currency;
  total: Money; amountDue: Money; asOf: DateOnly; customer: Customer; issuer: Issuer;
}
export interface PaymentRequestProposal {
  schema: 'stellar-forge.invoice-payment-proposal.v1'; id: string;
  invoice: PaymentInvoiceSnapshot; invoiceAmount: Money; network: StellarPaymentNetwork;
  networkPassphrase: string; destination: string; asset: StellarPaymentAsset;
  stellarAmount: string; amountAtomic: string; memo: StellarPaymentMemo; msg: string;
  expiresAt: string | null; valuationNote: string; uri: string;
}
export interface PaymentRequestPreview {
  proposal: PaymentRequestProposal; reviewSha256: string; invoice: InvoiceSummary; revision: Revision;
}
export interface CreatePaymentRequestInput extends MutationContext {
  proposal: PaymentRequestProposal; reviewSha256: string;
}
export interface ReturnedPaymentInput extends MutationContext {
  /** Exact 64-character lowercase hexadecimal wallet transaction hash. */
  transaction: string;
  /** Optional operation sender; the verifier derives the actual payer when omitted. */
  payer?: string | null; note?: string;
}
export interface ReceivePaymentRequestInput extends MutationContext {
  returnId: string;
  /** Defaults to the received value that fits every retained invoice balance. */
  allocate?: boolean; allocationAmount?: Money; allocatedDate?: DateOnly; note?: string;
}
export interface CancelPaymentRequestInput extends MutationContext { reason: string }
export type PaymentObservationStatus = 'RECORDED' | 'TESTNET_VERIFIED' | 'NOT_FOUND' | 'FAILED'
  | 'VERIFICATION_UNAVAILABLE' | 'TRANSFER_PRECEDES_REQUEST' | 'TRANSFER_AFTER_EXPIRY' | 'TRANSFER_AFTER_CANCELLATION';
export type PaymentRequestStatus = 'OPEN' | 'AWAITING_VERIFICATION' | 'SATISFIED' | 'PARTIALLY_APPLIED'
  | 'RECEIVED_UNAPPLIED' | 'CANCELLED' | 'EXPIRED' | 'RECEIPT_REVERSED' | Exclude<PaymentObservationStatus, 'RECORDED'>;
export interface PaymentProofReference {
  directoryId: string; name: 'transfer-proof.json'; bytes: number; sha256: string;
}
export interface StellarTransferProof {
  rpcEndpoint: string; networkResponse?: Record<string, unknown>;
  transactionResponse?: Record<string, unknown>; proofArtifact?: PaymentProofReference; [key: string]: unknown;
}
export interface PaymentTransferVerification {
  schema?: 'stellar-forge.invoice-stellar-transfer.v1';
  status: 'VERIFIED' | 'NOT_FOUND' | 'FAILED'; network: StellarPaymentNetwork;
  transaction: string; observedAt: string; networkPassphrase?: string;
  payer?: string; recipient?: string; amountAtomic?: string; asset?: StellarPaymentAsset;
  memo?: StellarPaymentMemo; ledger?: number; closedAt?: string;
  transactionFingerprint?: string; transactionFingerprints?: string[];
  verificationScope?: 'OFFICIAL_PUBNET_RPC' | 'OFFICIAL_TESTNET_RPC';
  proof: StellarTransferProof; proofArtifact?: PaymentProofReference; [key: string]: unknown;
}
export interface PaymentObservation {
  id: string; recordedAt: string; actor: string; status: PaymentObservationStatus;
  verification: PaymentTransferVerification; proofArtifact?: PaymentProofReference; [key: string]: unknown;
}
export interface PaymentReturn {
  id: string; transaction: string; payer: string | null; note: string; reportedAt: string; actor: string;
  observations: PaymentObservation[]; receiptId: string | null; allocationId: string | null;
}
export interface PaymentRequestSummary {
  id: string; invoiceId: string; invoiceNumber: string; customerId: string; customerName: string;
  status: PaymentRequestStatus; issuedAt: string; expiresAt: string | null; cancelledAt: string | null;
  currency: Currency; invoiceAmount: Money; currentAmountDue: Money; balanceChanged: boolean;
  received: Money; applied: Money; unapplied: Money; payable: boolean;
  network: StellarPaymentNetwork; asset: StellarPaymentAsset; stellarAmount: string;
  destination: string; memo: StellarPaymentMemo; uri: string; valuationNote: string; documentSha256: string;
  returnCount: number; receiptIds: string[];
  lastObservation: {status: PaymentObservationStatus; recordedAt: string; transaction: string} | null;
  asOf: DateOnly; observedAt: string;
}
export interface PaymentRequestDocument {
  schema: 'stellar-forge.invoice-payment-request.v1'; id: string; issuedAt: string;
  proposal: PaymentRequestProposal; reviewSha256: string;
}
export interface PaymentRequestDetail {
  paymentRequest: PaymentRequestSummary; proposal: PaymentRequestProposal; issuedAt: string;
  reviewSha256: string; documentSha256: string; returns: PaymentReturn[];
  receipts: Receipt[]; allocations: Allocation[]; cancelledAt: string | null;
  cancellationReason: string | null; history: HistoryEntry[]; revision: Revision;
}
export interface PaymentRequestQuery {
  invoiceId?: string; customerId?: string; asOf?: DateOnly; offset?: number; limit?: number;
}
export interface PaymentRequestPage {
  items: PaymentRequestSummary[]; total: number; offset: number; limit: number; revision: Revision;
}
export interface PaymentRequestMutationResult extends MutationResult {
  paymentRequest: PaymentRequestSummary; invoice: InvoiceSummary;
  paymentReturn?: PaymentReturn; receipt?: Receipt; allocation?: Allocation;
}
export type PaymentRequestFileName = 'payment-request.json' | 'payment-request.html' | 'payment-request.uri'
  | 'status.json' | 'receiving.json' | `proof-${string}.json`;
export interface PaymentRequestDownload { name: PaymentRequestFileName; type: string; bytes: Uint8Array }
export interface RequestOptions { signal?: AbortSignal }

export interface ClientOptions { baseUrl?: string; fetch?: typeof fetch }
export class ReceivablesApiError extends Error {
  status: number; code: string; details: unknown; requestId: string | null; response: unknown;
}
export class ReceivablesClient {
  constructor(options?: ClientOptions);
  state(query?: {asOf?: DateOnly}): Promise<ReceivablesState>;
  settings(value: Issuer & MutationContext): Promise<MutationResult & {issuer: Issuer}>;
  saveDraft(value: SaveDraft): Promise<MutationResult & {invoice: InvoiceSummary}>;
  importQuote(value: QuoteImportInput): Promise<MutationResult & {invoice: InvoiceSummary}>;
  quoteFile(id: string, name: 'quote.json' | 'response.json' | 'source.json' | 'review.json'): Promise<Response>;
  detail(id: string, query?: {asOf?: DateOnly}): Promise<InvoiceDetail>;
  preview(id: string): Promise<Preview>;

  previewPaymentRequest(invoiceId: string, value: PaymentRequestInput, options?: RequestOptions): Promise<PaymentRequestPreview>;
  createPaymentRequest(invoiceId: string, value: CreatePaymentRequestInput, options?: RequestOptions): Promise<PaymentRequestMutationResult>;
  paymentRequests(query?: PaymentRequestQuery, options?: RequestOptions): Promise<PaymentRequestPage>;
  paymentRequest(id: string, query?: {asOf?: DateOnly}, options?: RequestOptions): Promise<PaymentRequestDetail>;
  cancelPaymentRequest(id: string, value: CancelPaymentRequestInput, options?: RequestOptions): Promise<PaymentRequestMutationResult>;
  reportPaymentReturn(id: string, value: ReturnedPaymentInput, options?: RequestOptions): Promise<PaymentRequestMutationResult & {paymentReturn: PaymentReturn}>;
  receivePaymentRequest(id: string, value: ReceivePaymentRequestInput, options?: RequestOptions): Promise<PaymentRequestMutationResult & {paymentReturn: PaymentReturn}>;
  paymentRequestFile(id: string, name: PaymentRequestFileName, options?: RequestOptions): Promise<Response>;
  paymentRequestBytes(id: string, name: PaymentRequestFileName, options?: RequestOptions): Promise<PaymentRequestDownload>;
  issue(id: string, value: MutationContext & {expectedVersion: number; previewSha256: string}): Promise<MutationResult & {invoice: InvoiceSummary}>;
  voidInvoice(id: string, value: MutationContext & {voidDate: DateOnly; reason: string}): Promise<MutationResult & {invoice: InvoiceSummary}>;
  credit(id: string, value: CreditInput): Promise<MutationResult & {credit: CreditRecord; invoice: InvoiceSummary}>;
  receipt(value: ReceiptInput): Promise<MutationResult & {receipt: Receipt}>;
  importSettlement(value: SettlementReceiptInput): Promise<MutationResult & {receipt: Receipt}>;
  allocate(value: AllocateInput): Promise<MutationResult & {allocation: Allocation; invoice: InvoiceSummary; receipt: Receipt}>;
  release(id: string, value: MutationContext & {releasedDate: DateOnly; reason: string}): Promise<MutationResult & {allocation: Allocation; invoice: InvoiceSummary; receipt: Receipt}>;
  voidReceipt(id: string, value: MutationContext & {voidDate: DateOnly; reason: string}): Promise<MutationResult & {receipt: Receipt}>;
  ledger(query: LedgerQuery): Promise<LedgerPage>;
  exportCustomer(customerId: string, query?: {asOf?: DateOnly}): Promise<CustomerExport>;
  customerFile(customerId: string, name: 'account.tar' | 'account.json' | 'account.html' | 'invoices.csv' | 'manifest.json', query?: {asOf?: DateOnly}): Promise<Response>;
  file(id: string, name: 'invoice.json' | 'invoice.html' | 'invoice.csv' | 'manifest.json' | 'status.json' | 'credit.json' | 'credit.html' | 'credit.csv'): Promise<Response>;
}
export function createReceivablesClient(options?: ClientOptions): ReceivablesClient;
