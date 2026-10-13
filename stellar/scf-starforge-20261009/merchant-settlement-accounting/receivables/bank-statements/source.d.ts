// SPDX-License-Identifier: MIT
import type { Buffer } from 'node:buffer';

export declare const BANK_STATEMENT_SOURCE_SCHEMA: 'stellar-forge.bank-statement-source.v1';
export declare class BankStatementSourceError extends Error {
  code: string;
  status: 400;
  details: Record<string, unknown>;
}
export type OriginalStatementFile = { name: string; dataBase64: string; content?: never; encoding?: never }
  | { name: string; content: string; encoding: 'utf8' | 'base64'; dataBase64?: never };
export type BankStatementFormat = 'OFX' | 'QFX' | 'CSV' | 'CAMT053';
export type TextEncoding = 'utf-8' | 'us-ascii' | 'windows-1252' | 'iso-8859-1' | 'utf-16le' | 'utf-16be';
export type Column = string | number;
export interface SourceLocation {
  pointer: string;
  pointerSyntax: 'OFX_PATH' | 'CSV_RECORD' | 'CSV_ACCOUNT_GROUP' | 'CSV_BALANCE_PAIR' | 'CAMT_XML_PATH' | 'CAMT_BALANCE_PAIR';
  namespace?: string;
  valueCharStart?: number;
  valueCharEnd?: number;
  valueByteStart?: number;
  valueByteEnd?: number;
  recordNumber?: number | null;
  recordNumbers?: number[];
  lineStart?: number;
  lineEnd?: number;
  charStart?: number;
  charEnd?: number;
  byteStart?: number;
  byteEnd?: number;
  raw?: string;
  column?: number;
  amountColumn?: number;
  dateColumn?: number | null;
  header?: SourceLocation;
  opening?: SourceLocation;
  closing?: SourceLocation;
}
export interface BankSourceIssue {
  code: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  source?: SourceLocation;
  detail?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface SourceDateTime {
  raw: string;
  date: string;
  time: string | null;
  precision: 'DATE' | 'HOUR' | 'MINUTE' | 'SECOND' | 'FRACTION';
  offsetHours: string | null;
  /** Exact CAMT source offset in minutes; absent source offsets stay null. */
  offsetMinutes?: number | null;
  zone: string | null;
  offsetExplicit: boolean;
  calendarBasis: 'SOURCE_CALENDAR';
}
export interface CsvAccountDefaults {
  kind?: 'BANK' | 'CREDIT_CARD';
  bankId?: string;
  branchId?: string;
  accountId?: string;
  accountType?: string;
  accountKey?: string;
  currency?: string;
  financialInstitution?: { id?: string; name?: string };
  namespace?: string;
}
export interface CsvColumns {
  postedDate: Column;
  valueDate?: Column;
  amount?: Column;
  debit?: Column;
  credit?: Column;
  providerId?: Column;
  payee?: Column;
  memo?: Column;
  reference?: Column;
  checkNumber?: Column;
  type?: Column;
  balance?: Column;
  currency?: Column;
  status?: Column;
  correctsProviderId?: Column;
  correctionAction?: Column;
  accountId?: Column;
  bankId?: Column;
  branchId?: Column;
  accountType?: Column;
}
export interface CsvStatementOptions {
  delimiter: ',' | ';' | '\t' | '|';
  /** One-based logical CSV record number; multiline quoted fields count as one record. */
  headerRow?: number;
  columns: CsvColumns;
  dateFormat: 'YMD' | 'DMY' | 'MDY';
  decimalSeparator?: '.' | ',';
  groupSeparator?: '' | '.' | ',' | ' ' | '\u00a0' | '\u202f' | "'";
  amountMode: 'SIGNED' | 'DEBIT_CREDIT';
  /** Mapped account columns override defaults; all account/currency groups are returned. */
  account: CsvAccountDefaults;
  /** Required when columns.status is selected. Values are case-sensitive source strings. */
  statusValues?: { posted: string[]; pending: string[] };
  skipRecords?: Array<{ recordNumber: number; reason: string }>;
  /** References actual original CSV records/cells, including records before the header. */
  balanceRecords?: Array<{
    recordNumber: number;
    kind: 'OPENING' | 'CLOSING' | 'LEDGER' | 'AVAILABLE';
    amountColumn: Column;
    dateColumn?: Column;
  }>;
}
export interface BankStatementSourceInput {
  file: OriginalStatementFile;
  format: BankStatementFormat;
  /** Select only when needed; conflicts with the original BOM/declaration are rejected. */
  textEncoding?: TextEncoding | string;
  /** A retained operator FI namespace used when native BANKID/FID are absent. */
  accountNamespace?: string;
  csv?: CsvStatementOptions;
  camt?: CamtStatementOptions;
}
export interface BankSourceAccount {
  kind: 'BANK' | 'CREDIT_CARD';
  bankId: string;
  branchId: string;
  accountId: string;
  accountType: string;
  accountKey: string;
  financialInstitution: { id: string; name: string };
  currency: string | null;
  namespace: string;
  identityBasis: { kind: string; institution: string; branchId: string; accountId: string;
    accountIdentifier?: { kind: string | null; scheme: { kind: string; value: string } | null; issuer: string };
    institutionIdentifier?: Record<string, unknown> | null };
  camt?: CamtAccountMetadata;
  identitySha256: string | null;
  source: SourceLocation;
}
export interface SourceCurrencyConversion {
  kind: 'UNCONVERTED_CURRENCY' | 'BANK_CONVERTED_ORIGINAL';
  currency: string | null;
  /** CURDEF / CURSYM; retained exactly. The reader performs no conversion. */
  rate: string | null;
  rateRaw: string;
  source: SourceLocation;
  original: Record<string, unknown>;
}
export interface SourceBalance {
  kind?: string;
  amount: string | null;
  amountRaw: string;
  currency: string | null;
  asOf: SourceDateTime | null;
  source: SourceLocation;
  original?: Record<string, unknown>;
  issues?: BankSourceIssue[];
  camt?: CamtBalanceMetadata;
}
export interface SourceClosing {
  id: string;
  kind: 'CLOSING' | 'CCCLOSING' | 'CSV_MAPPED_BALANCES' | 'CAMT_BOOKED_BALANCES';
  providerId: string | null;
  providerKey: string | null;
  currency: string | null;
  currencyConversion: SourceCurrencyConversion | null;
  from: string | null;
  until: string | null;
  opening: SourceBalance | null;
  closing: SourceBalance | null;
  dates: Record<string, SourceDateTime | null>;
  totals: Record<string, { raw: string; amount: string | null }>;
  source: SourceLocation;
  original: Record<string, unknown>;
  issues: BankSourceIssue[];
  eligible: boolean;
  linkedFromStatementId?: string;
  camt?: CamtClosingMetadata;
}
export interface BankStatementRow {
  /** Identity of this exact original file + record location; never an automatic deduplication key. */
  id: string;
  providerId: string | null;
  providerKey: string | null;
  status: 'POSTED' | 'PENDING' | 'UNMAPPED';
  statusRaw?: string;
  postedDate: string | null;
  postedAtRaw: string;
  postedAt: SourceDateTime | null;
  /** Signed exact decimal string, in row.currency, never a JavaScript Number. */
  amount: string | null;
  amountRaw: string;
  currency: string | null;
  currencyConversion: SourceCurrencyConversion | null;
  type: string;
  payee: string;
  extendedName: string;
  memo: string;
  reference: string;
  checkNumber: string;
  serverTransactionId: string;
  userDate: SourceDateTime | null;
  availableDate: SourceDateTime | null;
  expiresAt: SourceDateTime | null;
  correction: null | { action: string; providerId: string; providerKey: string | null };
  runningBalance: SourceBalance | null;
  source: SourceLocation;
  original: Record<string, unknown>;
  issues: BankSourceIssue[];
  /** Similarity candidate only; legitimate identical transactions retain separate row IDs. */
  candidateFingerprint: string;
  eligible: boolean;
  duplicateOf?: string;
  camt?: CamtEntryMetadata;
}
export interface StatementSummary {
  postedCount: number;
  pendingCount: number;
  invalidPostedCount: number;
  currencyTotals: Array<{ currency: string; credit: string; debit: string; net: string }>;
  totalsBasis: 'SOURCE_ROWS_BEFORE_DEDUPLICATION_OR_CORRECTION_APPLICATION';
}
export interface BankSourceStatement {
  id: string;
  kind: 'TRANSACTION_DOWNLOAD' | 'CLOSING_INFORMATION' | 'CSV_TRANSACTIONS' | 'CAMT_STATEMENT';
  account: BankSourceAccount;
  period: {
    kind: 'DOWNLOAD_COVERAGE' | 'CLOSING_INFORMATION' | 'ROW_DATE_RANGE' | 'STATEMENT_COVERAGE';
    from: string | null;
    until: string | null;
    rawFrom: string;
    rawUntil: string;
    fromDateTime: SourceDateTime | null;
    untilDateTime: SourceDateTime | null;
    untilExclusive: boolean;
  };
  balances: {
    ledger: SourceBalance | null;
    available: SourceBalance | null;
    closing: SourceClosing[];
    sourceBalances: SourceBalance[];
  };
  rows: BankStatementRow[];
  pendingRows: BankStatementRow[];
  excludedRows: Array<{ reason: string; operatorSelected?: boolean; source: SourceLocation; original: { cells: string[] } | CamtSourceNode; row?: BankStatementRow }>;
  source: SourceLocation;
  issues: BankSourceIssue[];
  summary: StatementSummary;
  camt?: CamtStatementMetadata;
}
export interface BankStatementSourceReport {
  schema: typeof BANK_STATEMENT_SOURCE_SCHEMA;
  format: BankStatementFormat;
  file: { name: string; bytes: number; sha256: string; type: string; textEncoding: TextEncoding };
  /** Exact original bytes. Retain separately before compacting the report into workspace state. */
  bytes: Buffer;
  interpretation: {
    textEncoding: TextEncoding;
    declaredEncoding: TextEncoding | null;
    byteOrderMark: TextEncoding | null;
    amountBasis: 'SIGNED_CUSTOMER_ACCOUNT';
    dateBasis: 'SOURCE_CALENDAR';
    nativeIdScope: 'FINANCIAL_INSTITUTION_AND_ACCOUNT';
    sourceOffsets: 'ORIGINAL_BYTES_AND_DECODED_UTF16_CHARACTERS';
    automaticCurrencyConversion: false;
    automaticRowDeduplication: false;
    closingBalancesInferred: false;
    sourceFormat: BankStatementFormat;
  };
  statements: BankSourceStatement[];
  issues: BankSourceIssue[];
  native?: {
    dialect: 'OFX1_SGML' | 'OFX2_XML';
    header: Record<string, string>;
    financialInstitution: { id: string; name: string };
    statuses: Array<{ code: string; severity: string; message: string; source: SourceLocation }>;
    nodeCount: number;
  };
  camt?: CamtSourceMetadata;
  csv?: {
    delimiter: string;
    headerRow: number;
    headers: string[];
    columns: Record<string, Column>;
    resolvedColumns: Record<string, number | null>;
    dateFormat: 'YMD' | 'DMY' | 'MDY';
    numberFormat: { decimalSeparator: string; groupSeparator: string };
    amountMode: 'SIGNED' | 'DEBIT_CREDIT';
    statusValues: { posted: string[]; pending: string[] };
    preamble: Array<{ source: SourceLocation; cells: string[] }>;
    header: SourceLocation;
    excludedRecords: BankSourceStatement['excludedRows'];
    recordCount: number;
  };
}
/** Pure original-source parser. It makes no accounting writes, network requests or currency conversions. */
export declare function readBankStatementSource(value: BankStatementSourceInput): BankStatementSourceReport;


export type CamtMessageVersion = 'camt.053.001.02' | 'camt.053.001.08';
export type CamtReferencePolicy = 'ACCOUNT_SERVICER_REFERENCE' | 'SOURCE_ENTRY';
export type CamtNamespaceMode = 'DECLARED' | 'UNQUALIFIED';
export type CamtDetailPolicy = 'PRESERVE_ONLY' | 'ENTRY_CURRENCY_TX_AMT';
export interface CamtStatementOptions {
  /** The original namespace selects the version by default; required for explicitly unqualified elements. */
  messageVersion?: CamtMessageVersion;
  /** DECLARED by default. UNQUALIFIED preserves original empty namespaces and requires messageVersion. */
  namespaceMode?: CamtNamespaceMode;
  /** SOURCE_ENTRY retains references without assigning cross-file transaction identity; overlaps require review. */
  referencePolicy?: CamtReferencePolicy;
  /** Details always remain nested. This option only requests a separate exact original-detail comparison. */
  detailPolicy?: CamtDetailPolicy;
  /** Optional explicit source precision agreement; ordinary receiving needs no precision map. */
  currencyScales?: Record<string, number>;
}
export interface CamtSourceNode {
  name: string;
  qualifiedName: string;
  namespace: string;
  attributes: Array<{ name: string; qualifiedName: string; namespace: string; value: string; source: SourceLocation }>;
  /** Decoded XML leaf value. Complete original lexical forms remain in report.bytes. */
  text: string | null;
  /** Exact original ranges; ancestor raw substrings are not repeated. */
  source: SourceLocation;
  children: CamtSourceNode[];
  /** Present only inside the actual .08 SplmtryData/Envlp extension. */
  interpretation?: 'OPAQUE_SUPPLEMENTARY';
  /** Original decoded extension text/child order; core cash readers do not interpret these items. */
  content?: Array<{ kind: 'TEXT'; text: string } | { kind: 'ELEMENT'; childIndex: number }>;
  [key: string]: unknown;
}
export interface CamtCodeChoice {
  kind: 'CODE' | 'PROPRIETARY';
  value: string;
  source: SourceLocation;
}
export interface CamtMoney {
  amount: string;
  amountRaw: string;
  currency: string | null;
  source: SourceLocation;
  currencySource: SourceLocation | null;
}
export interface CamtReference {
  name: string;
  value: string;
  source: SourceLocation;
}
export interface CamtPagination {
  page: number;
  pageRaw: string;
  last: boolean;
  source: SourceLocation;
}
export interface CamtAccountMetadata {
  identifier: { kind: 'IBAN' | 'OTHER' | null; value: string; scheme: CamtCodeChoice | null; issuer: string; source: SourceLocation | null };
  name: string;
  type: CamtCodeChoice | null;
  owner: CamtSourceNode | null;
  proxy: CamtSourceNode | null;
  servicer: {
    bic: string;
    bicField: 'BIC' | 'BICFI';
    clearing: null | { system: CamtCodeChoice | null; memberId: string; source: SourceLocation; original: CamtSourceNode };
    other: null | { id: string; scheme: CamtCodeChoice | null; issuer: string; source: SourceLocation; original: CamtSourceNode };
    lei: string;
    name: string;
    branch: CamtSourceNode | null;
    source: SourceLocation | null;
    original: CamtSourceNode | null;
  };
}
export interface CamtExchange {
  sourceCurrency: string;
  targetCurrency: string;
  unitCurrency: string;
  rate: string | null;
  rateRaw: string;
  contractId: string;
  quotationDate: string;
  source: SourceLocation;
  original: CamtSourceNode;
}
export interface CamtAmountDetail {
  kind: string;
  amount: string | null;
  amountRaw: string;
  currency: string | null;
  currencySource: SourceLocation | null;
  type: string;
  exchange: CamtExchange | null;
  source: SourceLocation;
  amountSource: SourceLocation | null;
  original: CamtSourceNode;
}
export interface CamtChargeRecord {
  amount: string | null;
  amountRaw: string;
  currency: string | null;
  creditDebit: 'CRDT' | 'DBIT' | null;
  /** Present only when the original charge record itself supplies a direction. */
  signedAmount: string | null;
  included: boolean | null;
  type: { code: string; proprietary: CamtSourceNode | null };
  rate: string | null;
  rateRaw: string;
  bearer: string;
  agent: CamtSourceNode | null;
  tax: CamtSourceNode | null;
  source: SourceLocation;
  amountSource: SourceLocation | null;
  currencySource: SourceLocation | null;
  creditDebitSource: SourceLocation | null;
  includedSource: SourceLocation | null;
  original: CamtSourceNode;
}
export interface CamtCharges {
  total: CamtMoney | null;
  totalRaw: string;
  records: CamtChargeRecord[];
  source: SourceLocation;
  original: CamtSourceNode;
  entryAmountAdjustment: 'NONE';
}
export interface CamtParty {
  role: string;
  name: string;
  account: CamtSourceNode | null;
  source: SourceLocation;
  original: CamtSourceNode;
}
export interface CamtRemittance {
  unstructured: Array<{ value: string; source: SourceLocation }>;
  structured: Array<{ source: SourceLocation; original: CamtSourceNode }>;
  creditorReferences: CamtReference[];
  documentNumbers: CamtReference[];
  source: SourceLocation | null;
  original: CamtSourceNode | null;
}
export interface CamtBankTransactionCode {
  domain: string;
  family: string;
  subFamily: string;
  proprietary: string;
  issuer: string;
  source: SourceLocation;
  original: CamtSourceNode;
}
export interface CamtReturnInformation {
  source: SourceLocation;
  original: CamtSourceNode;
  references: CamtReference[];
}
export interface CamtTransactionDetail {
  id: string;
  groupIndex: number;
  index: number;
  references: CamtReference[];
  referenceSource: SourceLocation | null;
  directAmount: CamtMoney | null;
  amounts: CamtAmountDetail[];
  creditDebit: 'CRDT' | 'DBIT' | null;
  directionBasis: 'DETAIL' | 'BATCH' | 'ENTRY';
  creditDebitSource: SourceLocation | null;
  selectedSignedAmount: string | null;
  tieOutStatus: 'PRESERVED' | 'UNAVAILABLE' | 'AVAILABLE';
  parties: CamtParty[];
  agents: CamtSourceNode | null;
  remittance: CamtRemittance;
  charges: CamtCharges[];
  bankTransactionCode: CamtBankTransactionCode | null;
  returnInformation: CamtReturnInformation[];
  relatedDates: CamtSourceNode | null;
  additionalInformation: string;
  source: SourceLocation;
  original: CamtSourceNode;
  issues: BankSourceIssue[];
}
export interface CamtBatch {
  groupIndex: number;
  messageId: string;
  paymentInformationId: string;
  reportedCount: string | null;
  countRaw: string;
  amount: CamtMoney | null;
  creditDebit: 'CRDT' | 'DBIT' | null;
  directionBasis: 'BATCH' | 'ENTRY';
  reportedSignedAmount: string | null;
  detailCount: number;
  detailSignedAmount: string | null;
  countMatches: boolean | null;
  amountMatches: boolean | null;
  source: SourceLocation;
  groupSource: SourceLocation;
  original: CamtSourceNode;
}
export interface CamtDetailTieOut {
  policy: CamtDetailPolicy;
  signedAmount: string | null;
  entryAmount: string | null;
  matches: boolean | null;
  status: 'PRESERVED' | 'NO_DETAILS' | 'UNAVAILABLE' | 'MATCH' | 'DIFFERENCE';
}
export interface CamtEntryMetadata {
  entryReference: string;
  accountServicerReference: string;
  providerIdentityBasis: 'ACCOUNT_SERVICER_REFERENCE' | 'PLACEHOLDER' | 'MISSING' | 'SOURCE_ENTRY';
  creditDebit: 'CRDT' | 'DBIT' | null;
  reversal: boolean | null;
  status: { code: string; proprietary: string; source: SourceLocation | null };
  bookingDate: SourceDateTime | null;
  /** Original value date is distinct from availability and is never mapped to availableDate. */
  valueDate: SourceDateTime | null;
  bankTransactionCode: CamtBankTransactionCode | null;
  amountMagnitude: CamtMoney | null;
  referenceBasis: 'CREDITOR_REFERENCE' | 'ENTRY_REFERENCE' | 'END_TO_END_ID' | 'ACCOUNT_SERVICER_REFERENCE' | null;
  counterpartyRole: 'Dbtr' | 'Cdtr' | null;
  batches: CamtBatch[];
  details: CamtTransactionDetail[];
  detailTieOut: CamtDetailTieOut;
  charges: CamtCharges[];
  amountDetails: CamtAmountDetail[];
  returnInformation: CamtReturnInformation[];
  availability: Array<{ source: SourceLocation; original: CamtSourceNode }>;
  additionalInformation: string;
  fields: Record<string, SourceLocation | null>;
}
export interface CamtBalanceMetadata {
  type: CamtCodeChoice | null;
  subType: CamtCodeChoice | null;
  creditDebit: 'CRDT' | 'DBIT' | null;
  intermediate: boolean;
  creditLines: Array<{ source: SourceLocation; original: CamtSourceNode }>;
  availability: Array<{ source: SourceLocation; original: CamtSourceNode }>;
  fields: Record<string, SourceLocation | null>;
}
export interface CamtBalanceCheck {
  status: 'NOT_CHECKED' | 'MATCH' | 'DIFFERENCE';
  opening: string | null;
  bookedNet: string | null;
  expectedClosing: string | null;
  reportedClosing: string | null;
  difference: string | null;
  /** A page-local equation can match while the complete closing candidate is ineligible. */
  scope: 'STATEMENT_PAGE';
  source: SourceLocation;
}
export interface CamtSummaryCheck {
  field: string;
  kind: 'COUNT' | 'ABSOLUTE_AMOUNT' | 'NET_AMOUNT';
  expected: string | null;
  reported: string | null;
  reportedRaw: string;
  matches: boolean | null;
  source: SourceLocation;
}
export interface CamtClosingMetadata {
  pagination: CamtPagination | null;
  balanceCheck: CamtBalanceCheck;
  completeSinglePage: boolean;
  reportingPeriodBasis: 'ORIGINAL_FR_TO_DT';
  dateBoundary: 'INCLUSIVE_SOURCE_CALENDAR';
  intermediate: boolean;
}
export interface CamtStatementMetadata {
  statementId: string;
  createdAt: SourceDateTime | null;
  sequences: { electronic: string; legal: string; reporting: CamtSourceNode | null };
  copyDuplicate: string | null;
  pagination: CamtPagination | null;
  messagePagination: CamtPagination | null;
  statementPagination: CamtPagination | null;
  reportingSource: CamtSourceNode | null;
  reportingPeriodSource: SourceLocation | null;
  relatedAccount: CamtSourceNode | null;
  balanceCheck: CamtBalanceCheck;
  summaryChecks: CamtSummaryCheck[];
  summarySource: CamtSourceNode | null;
  detailPolicy: CamtDetailPolicy;
  entryCount: number;
  detailCount: number;
  unmappedCount: number;
  additionalInformation: string;
  fields: Record<string, SourceLocation | null>;
}
export interface CamtSourceMetadata {
  schema: 'stellar-forge.camt053-source.v1';
  namespace: string;
  messageVersion: CamtMessageVersion;
  profile: {
    messageVersion: CamtMessageVersion;
    versionSelection: 'EXPLICIT' | 'SOURCE_NAMESPACE';
    /** Present only for explicitly interpreted unqualified original XML. */
    namespaceMode?: 'UNQUALIFIED';
    originalNamespace?: '';
    /** Present only when original entries are explicitly retained separately. */
    referencePolicy?: 'SOURCE_ENTRY';
    detailPolicy: CamtDetailPolicy;
    currencyScales: Record<string, number> | null;
  };
  messageId: string;
  messageCreated: SourceDateTime;
  messagePagination: CamtPagination | null;
  nodeCount: number;
  entryCount: number;
  namespaceDeclarations: Array<{ prefix: string; namespace: string; source: SourceLocation }>;
  xmlDeclaration: string | null;
  sourceTree: CamtSourceNode;
  groupHeader: CamtSourceNode;
  source: SourceLocation;
  limits: { bytes: number; nodes: number; depth: number; text: number; statements: number; entries: number };
  arithmetic: {
    cashUnit: 'ENTRY';
    direction: 'ORIGINAL_CREDIT_DEBIT_INDICATOR';
    reversal: 'INDICATOR_RETAINED_WITHOUT_SECOND_SIGN_CHANGE';
    details: 'NESTED_SOURCE_ONLY';
    charges: 'ORIGINAL_ENTRY_AMOUNT_UNCHANGED';
    precision: 'EXACT_DECIMAL_STRINGS';
  };
}
