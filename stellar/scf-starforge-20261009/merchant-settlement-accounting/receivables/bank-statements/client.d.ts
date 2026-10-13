// SPDX-License-Identifier: MIT
import type {BankStatementSourceInput,BankStatementSourceReport,BankStatementRow,BankSourceAccount,SourceLocation,SourceClosing,SourceBalance,CamtPagination,CamtStatementMetadata,BankSourceIssue} from './source.mjs';
import type {BankAccount as ReceiptIntakeAccount,BankReceiptSourceBinding} from '../bank-client-types.d.ts';
export type Currency={code:string;scale:number};
export type RequestIdentity={revision:number;actor:string;requestId:string;workspaceId?:string};
export type RequestOptions={signal?:AbortSignal};
export type BankTransactionStatus='POSTED'|'OVERLAP_REVIEW'|'CONFLICT'|'CORRECTION_REVIEW'|'INVALID'|'FOREIGN_CURRENCY'|'DUPLICATE'|'SUPERSEDED'|'DELETED'|'EXCLUDED';
export interface BankAccount {id:string;name:string;currency:Currency;sourceIdentitySha256:string;sourceIdentity?:BankSourceAccount['identityBasis'];receiptIntakeAccountId?:string;note:string;createdAt:string;actor:string;
  importCount?:number;postedCount?:number;matchedCount?:number;reviewCount?:number;activeCloseCount?:number}
export type CompactSourceRow=Omit<BankStatementRow,'original'>;
/** Full CAMT original nodes remain in the retained parsed report; compact state keeps the complete entry metadata. */
export type CompactExcludedSourceRow=Omit<BankStatementSourceReport['statements'][number]['excludedRows'][number],'original'|'row'>&{
  original?:BankStatementSourceReport['statements'][number]['excludedRows'][number]['original'];row?:CompactSourceRow};
export interface SourceCopy {importId:string;sourceRowId:string;source:SourceLocation}
export interface PostingInput {kind:'RECEIPT'|'REFUND'|'FEE'|'EXPENSE'|'INCOME'|'INTEREST'|'TRANSFER'|'CAPITAL';
  amount:string;receiptId?:string;refundId?:string;targetId?:string;coverageKey?:string;note?:string;ledgerCode?:string;reference?:string}
export interface Posting {kind:PostingInput['kind'];targetId:string|null;amount:string;minorAmount:string;note:string;ledgerCode:string;
  reference:string;target:Record<string,unknown>|null}
export interface ReceiptCoverageReview {key:string;repeatedSource:boolean;receiptAmount:string;beforeMatchedAmount:string;
  coveredByThisSource:string;newlyMatchedAmount:string;afterMatchedAmount:string;remainingUnmatchedAmount:string}
export interface ReceiptCoverage {receiptId:string;distinctPaymentReason:string;review:ReceiptCoverageReview}
export interface BankMatch {id:string;transactionId:string;accountId:string;currency:Currency;amount:string;parts:Posting[];receiptCoverage:ReceiptCoverage[];
  reason:string;sourceFingerprint:string;createdAt:string;actor:string;createdReceiptId?:string;
  undoneAt?:string;undoneBy?:string;undoReason?:string}
export interface BankTransaction extends Omit<BankStatementRow,'status'|'source'|'original'> {
  id:string;sourceRowId:string;accountId:string;sourceStatus:BankStatementRow['status'];status:BankTransactionStatus;
  source:SourceLocation;sourceAmount:string|null;sourceIdentity:string|null;financialSha256:string;copies:SourceCopy[];
  candidateIds:string[];candidates?:Array<Pick<BankTransaction,'id'|'postedDate'|'amount'|'currency'|'payee'|'providerId'|'status'|'reference'>>;
  createdAt:string;actor:string;history:Array<Record<string,unknown>>;duplicateOf?:string;supersedesId?:string;correctedBy?:string;interpretationReplacesId?:string;interpretationAction?:'REPLACE'|'DELETE';
  valuation?:{amount:string;currency:Currency;reason:string;actor:string;at:string};exclusionReason?:string;
  match?:BankMatch|null;closed?:boolean
}
export interface FileDescriptor {name:string;type:string;bytes:number;sha256:string}
export interface BankImport {id:string;accountId:string;statementId:string;kind:string;file:BankStatementSourceReport['file'];
  camtMessage?:Omit<NonNullable<BankStatementSourceReport['camt']>,'sourceTree'>;camt?:BankStatementSourceReport['statements'][number]['camt'];
  format:BankStatementSourceInput['format'];reviewSha256:string;sourceAccount:BankStatementSourceReport['statements'][number]['account'];
  interpretation:BankStatementSourceReport['interpretation'];period:BankStatementSourceReport['statements'][number]['period'];
  balances:BankStatementSourceReport['statements'][number]['balances'];issues:BankStatementSourceReport['issues'];
  sourceSummary:BankStatementSourceReport['statements'][number]['summary'];excludedRows:CompactExcludedSourceRow[];
  createdAt:string;actor:string;requestId:string;files:Record<string,FileDescriptor>;rowCount?:number;pendingCount?:number;
  rowIds?:string[];pendingRows?:CompactSourceRow[];supersedesImportId?:string|null}
export interface BankClose {id:string;schema:string;accountId:string;name:string;note:string;from:string;until:string;
  openingBalance:string;closingBalance:string;currency:Currency;createdAt:string;actor:string;requestId:string;reviewSha256:string;
  transactionIds:string[];matchIds:string[];files:Record<string,FileDescriptor>;
  sourceClosing:BankClosingSelection|null;periodClose:Record<string,unknown>|null;previousCloseId:string|null}
export interface Reopening {id:string;closeId:string;accountId:string;reason:string;actor:string;at:string;requestId:string}
export interface BankOperation {id:string;action:string;actor:string;at:string;intentSha256:string;
  result:Record<string,unknown>;replayed:boolean}
export interface BankResult {revision:number;workspaceId:string;operation:BankOperation;account?:BankAccount;import?:BankImport;
  transaction?:BankTransaction;close?:BankClose;reopening?:Reopening;receipt?:Record<string,unknown>;allocation?:Record<string,unknown>;invoice?:Record<string,unknown>}
export interface BankState {schema:string;revision:number;workspaceId:string;sourcesSha256:string;accounts:BankAccount[];
  receiptIntakeAccounts:Array<ReceiptIntakeAccount&{statementSourceIdentitySha256:string|null;statementSourceIdentity:BankSourceAccount['identityBasis']|null}>;
  imports:BankImport[];closes:BankClose[];reopenings:Reopening[];currencies:Currency[];
  customers:Array<{id:string;name:string;reference:string;email?:string;address?:string;[key:string]:unknown}>;
  periodCloses:Array<{id:string;name:string;period:Record<string,unknown>;runId:string;exportId:string;createdAt:string}>;
  history:Array<Record<string,unknown>>}
export interface SourcePreview extends Omit<BankStatementSourceReport,'bytes'|'statements'|'camt'> {
  camt?:Omit<NonNullable<BankStatementSourceReport['camt']>,'sourceTree'>;
  revision:number;workspaceId:string;reviewSha256:string;
  statements:Array<Omit<BankStatementSourceReport['statements'][number],'rows'|'pendingRows'|'source'|'excludedRows'> & {
    excludedRows:CompactExcludedSourceRow[];sample:CompactSourceRow[];pendingCount:number}>
}
export interface TransactionPage {items:BankTransaction[];total:number;offset:number;limit:number;revision:number}
export interface ReceiptCoverageChoice {key:string;amount:string;sources:BankReceiptSourceBinding[]}
export interface MatchSuggestions {
  receipts:Array<{id:string;reference:string;customerId:string;customerName:string;receivedDate:string;amount:string;
    remaining:string;exactAmount:boolean;sourceMatch:boolean;sourceCoveredAmount:string;coverageGroups:ReceiptCoverageChoice[];referenceMatch:boolean}>;
  refunds:Array<{id:string;customerId:string;customerName:string;receiptId:string;currency:Currency;amount:string;
    remaining:string;exactAmount:boolean;reference:string|null;[key:string]:unknown}>
}
export interface TransactionDetail {transaction:BankTransaction;account:BankAccount;suggestions:MatchSuggestions;
  invoices:Array<Record<string,unknown>>;revision:number;workspaceId:string}
export interface CamtAssemblyInput {accountId:string;importIds:string[];groupingNote?:string;summaryScope?:'STATEMENT'|'PAGE'}
export interface CamtAssemblySelection {kind:'CAMT_PAGE_ASSEMBLY';id:string;importIds:string[];groupingNote:string;summaryScope:'STATEMENT'|'PAGE'}
export type BankClosingSelection={importId:string;id:string}|CamtAssemblySelection;
export type CamtAssemblyIssue=BankSourceIssue&{importId?:string;[key:string]:unknown};
export interface CamtAssemblyPage {importId:string;file:BankStatementSourceReport['file'];statementId:string;originalStatementId:string;
  messageId:string;messageVersion:string;reviewSha256:string;pagination:CamtPagination|null;
  sequences:CamtStatementMetadata['sequences'];copyDuplicate:string|null;period:BankImport['period'];
  entryCount:number;bookedCount:number;pendingCount:number;bookedNet:string|null;opening:SourceBalance|null;closing:SourceBalance|null;
  balanceCheck:'MATCH'|'REVIEW';source:{importId:string;fileSha256:string;statementId:string;source:SourceLocation};sourceIssues:BankSourceIssue[]}
export type AssembledSourceClosing=Omit<SourceClosing,'kind'|'source'|'camt'>&{kind:'CAMT_ASSEMBLED_BOOKED_BALANCES';
  source:{pointerSyntax:'CAMT_RETAINED_PAGE_ASSEMBLY';assemblyId:string;imports:string[]};
  camt:{completeSinglePage:false;completePageAssembly:boolean;reportingPeriodBasis:'ORIGINAL_FR_TO_DT';
    dateBoundary:'INCLUSIVE_SOURCE_CALENDAR';pageCount:number;balanceCheck:{status:'MATCH'|'REVIEW';difference:string|null;scope:'COMPLETE_STATEMENT'}}};
export interface CamtAssembly {schema:'stellar-forge.merchant-camt-page-assembly.v1';id:string;accountId:string;currency:Currency;
  selection:Required<CamtAssemblyInput>;grouping:{basis:'ORIGINAL_SEQUENCE'|'ORIGINAL_STATEMENT_ID'|'REVIEWED_ACCOUNT_AND_PERIOD';
    sequence:Record<string,unknown>;commonStatementId:string|null;originalStatementIds:string[];note:string};
  namespace:string;messageVersion:string;paginationLevel:'STATEMENT'|'MESSAGE';period:BankImport['period'];
  pages:CamtAssemblyPage[];transitions:Array<{fromImportId:string;toImportId:string;closing:SourceBalance;opening:SourceBalance;matches:true}>;
  summaryChecks:Array<Omit<CamtStatementMetadata['summaryChecks'][number],'expected'|'matches'>&{importId:string;scope:'STATEMENT'|'PAGE';expected:string|null;matches:boolean}>;
  entries:Array<{importId:string;sourceRowId:string;providerKey:string|null;status:BankStatementRow['status'];amount:string|null;currency:string|null;postedDate:string|null;source:SourceLocation}>;
  entryCount:number;bookedCount:number;bookedNet:string|null;difference:string|null;missingPages:number[];issues:CamtAssemblyIssue[];eligible:boolean;
  closing:AssembledSourceClosing;sourceClosing:CamtAssemblySelection}
export interface CamtAssemblyPreview extends CamtAssembly {revision:number;workspaceId:string}
export type RetainedClosingSource={importId:string;fileSha256:string;closing:SourceClosing}|
  {kind:'CAMT_PAGE_ASSEMBLY';importId:string;fileSha256:string;importIds:string[];closing:AssembledSourceClosing;assembly:CamtAssembly};
export interface CloseInput {accountId:string;from:string;until:string;openingBalance:string;closingBalance:string;balanceNote:string;
  sourceClosing?:BankClosingSelection;periodCloseId?:string}
export interface ClosePreview {schema:string;revision:number;workspaceId:string;account:BankAccount;from:string;until:string;
  currency:Currency;openingBalance:string;incoming:string;outgoing:string;calculatedClosing:string;closingBalance:string;difference:string;
  balanceBasis:'ORIGINAL_SOURCE_CLOSING'|'ORIGINAL_SOURCE_PAGE_ASSEMBLY'|'OPERATOR_ENTERED_STATEMENT_BALANCES';balanceNote:string;
  sourceClosing:RetainedClosingSource|null;periodClose:Record<string,unknown>|null;
  transactions:BankTransaction[];matches:BankMatch[];pending:BankStatementRow[];imports:BankImport[];priorCloseId:string|null;
  problems:Array<{code:string;message:string;transactionId?:string;amount?:string;[key:string]:unknown}>;ready:boolean;reviewSha256:string}
export interface CloseDetail {close:BankClose;report:Omit<ClosePreview,'revision'|'workspaceId'>&{id:string;name:string;note:string;createdAt:string;actor:string;requestId:string};
  reopening:Reopening|null;currentProblems:ClosePreview['problems'];currentDifference:string;changedTransactionIds:string[];newTransactionIds:string[];revision:number}
export type ResolveInput=RequestIdentity&{action:'ACCEPT_DISTINCT'|'LINK_DUPLICATE'|'APPLY_CORRECTION'|'VALUE'|'EXCLUDE';
  targetId?:string;accountAmount?:string;reason:string};
export type ReceiptInput=RequestIdentity&{customerId:string;grossAmount:string;feeAmount?:string;reference:string;note?:string;
  reason:string;feeNote?:string;feeLedgerCode?:string;invoiceId?:string;allocationAmount?:string;allocatedDate?:string};
export declare class BankStatementsClient {
  constructor(options?:{baseUrl?:string;fetch?:typeof fetch});
  request(path:string,options?:RequestOptions&{method?:string;body?:unknown;binary?:boolean}):Promise<unknown>;
  state(options?:RequestOptions):Promise<BankState>;
  previewSource(value:{source:BankStatementSourceInput},options?:RequestOptions):Promise<SourcePreview>;
  saveAccount(value:RequestIdentity&{account:Pick<BankAccount,'name'|'currency'|'sourceIdentitySha256'>&{note?:string}},options?:RequestOptions):Promise<BankResult>;
  receiveSource(value:RequestIdentity&{accountId:string;statementId:string;source:BankStatementSourceInput;reviewSha256:string;supersedesImportId?:string;receiptIntakeAccountId?:string},options?:RequestOptions):Promise<BankResult>;
  transactions(filters?:{accountId?:string;status?:BankTransactionStatus|'UNMATCHED'|'MATCHED'|'REVIEW';search?:string;offset?:number;limit?:number},options?:RequestOptions):Promise<TransactionPage>;
  detail(id:string,options?:RequestOptions):Promise<TransactionDetail>;
  importDetail(id:string,options?:RequestOptions):Promise<{import:BankImport;report:Omit<BankStatementSourceReport,'bytes'>;revision:number}>;
  importFile(id:string,name:'original'|'parsed.json',options?:RequestOptions):Promise<Response>;
  match(id:string,value:RequestIdentity&{parts:PostingInput[];reason:string},options?:RequestOptions):Promise<BankResult>;
  receiveReceipt(id:string,value:ReceiptInput,options?:RequestOptions):Promise<BankResult>;
  undo(id:string,value:RequestIdentity&{reason:string},options?:RequestOptions):Promise<BankResult>;
  resolve(id:string,value:ResolveInput,options?:RequestOptions):Promise<BankResult>;
  previewAssembly(value:CamtAssemblyInput,options?:RequestOptions):Promise<CamtAssemblyPreview>;
  previewClose(value:CloseInput,options?:RequestOptions):Promise<ClosePreview>;
  retainClose(value:RequestIdentity&CloseInput&{reviewSha256:string;name:string;note?:string},options?:RequestOptions):Promise<BankResult>;
  closeDetail(id:string,options?:RequestOptions):Promise<CloseDetail>;
  closeFile(id:string,name:string,options?:RequestOptions):Promise<Response>;
  reopenClose(id:string,value:RequestIdentity&{reason:string},options?:RequestOptions):Promise<BankResult>;
  getOperation(id:string,options?:RequestOptions):Promise<BankResult>;
}
export declare const createBankStatementsClient:(options?:ConstructorParameters<typeof BankStatementsClient>[0])=>BankStatementsClient;
