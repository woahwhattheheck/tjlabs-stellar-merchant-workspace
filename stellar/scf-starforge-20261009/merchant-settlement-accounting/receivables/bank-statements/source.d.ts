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
export type BankStatementFormat = 'OFX' | 'QFX' | 'CSV';
export type TextEncoding = 'utf-8' | 'us-ascii' | 'windows-1252' | 'iso-8859-1' | 'utf-16le' | 'utf-16be';
export type Column = string | number;
export interface SourceLocation {
  pointer: string;
  pointerSyntax: 'OFX_PATH' | 'CSV_RECORD' | 'CSV_ACCOUNT_GROUP' | 'CSV_BALANCE_PAIR';
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
  identityBasis: { kind: string; institution: string; branchId: string; accountId: string };
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
}
export interface SourceClosing {
  id: string;
  kind: 'CLOSING' | 'CCCLOSING' | 'CSV_MAPPED_BALANCES';
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
  kind: 'TRANSACTION_DOWNLOAD' | 'CLOSING_INFORMATION' | 'CSV_TRANSACTIONS';
  account: BankSourceAccount;
  period: {
    kind: 'DOWNLOAD_COVERAGE' | 'CLOSING_INFORMATION' | 'ROW_DATE_RANGE';
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
  excludedRows: Array<{ reason: string; operatorSelected?: boolean; source: SourceLocation; original: { cells: string[] } }>;
  source: SourceLocation;
  issues: BankSourceIssue[];
  summary: StatementSummary;
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
