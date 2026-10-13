// MIT. TokenJunkieLabs. Types reuse the original financial models and mutation results.
import type * as Collections from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/collections-types.d.ts';
import type * as Cash from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/cash-planning-types.d.ts';
import type * as Credit from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/credit-control-types.d.ts';
import type {ReceivablesCallOptions, ReceivablesFileOptions, ReceivablesFileMetadata} from './accounting-receivables-client.mjs';
export type {Collections, Cash, Credit};
export interface FinancialControlArgumentsMap {
  collection_list: Collections.CollectionsQuery;
  collection_detail: {collectionCaseId:string;asOf?:string};
  collection_save: Collections.SaveCollectionCase;
  collection_activity: Collections.CollectionActivityInput & {collectionCaseId:string};
  collection_close: Collections.CollectionTransitionInput & {collectionCaseId:string};
  collection_reopen: Collections.CollectionTransitionInput & {collectionCaseId:string;nextActionDate:string};
  collection_reminder: {collectionCaseId:string;asOf?:string};
  cash_plan_list: Cash.CashPlanListQuery;
  cash_plan_preview: Cash.CashPlanPreviewInput;
  cash_plan_detail: {cashPlanId:string;editionId?:string};
  cash_plan_save: Cash.SaveCashPlanInput;
  cash_plan_archive: Cash.CashPlanStatusInput & {cashPlanId:string};
  cash_plan_reopen: Cash.CashPlanStatusInput & {cashPlanId:string};
  cash_plan_compare: Cash.CashPlanCompareQuery;
  credit_control: Credit.CreditControlQuery;
  credit_policy_detail: {creditPolicyId:string};
  credit_policy_save: Credit.SaveCreditPolicyInput;
  credit_assessment_preview: {invoiceId:string;workspaceId:string};
  credit_decision_save: Credit.SaveCreditDecisionInput & {invoiceId:string};
  credit_decision_detail: {creditDecisionId:string};
  credit_decision_withdraw: Credit.WithdrawCreditDecisionInput & {creditDecisionId:string};
}
export interface FinancialControlResultsMap {
  collection_list: Collections.CollectionsReport;
  collection_detail: Collections.CollectionDetail;
  collection_save: Collections.CollectionMutationResult;
  collection_activity: Collections.CollectionMutationResult;
  collection_close: Collections.CollectionMutationResult;
  collection_reopen: Collections.CollectionMutationResult;
  collection_reminder: Collections.CollectionReminder;
  cash_plan_list: Cash.CashPlanList;
  cash_plan_preview: Cash.CashPlanPreview;
  cash_plan_detail: Cash.CashPlanDetail;
  cash_plan_save: Cash.CashPlanMutationResult;
  cash_plan_archive: Cash.CashPlanMutationResult;
  cash_plan_reopen: Cash.CashPlanMutationResult;
  cash_plan_compare: Cash.CashPlanComparison;
  credit_control: Credit.CreditControlReport;
  credit_policy_detail: Credit.CreditPolicyDetail;
  credit_policy_save: Credit.CreditPolicyMutationResult;
  credit_assessment_preview: Credit.CreditAssessmentPreview;
  credit_decision_save: Credit.CreditDecisionMutationResult;
  credit_decision_detail: Credit.CreditDecisionDetail;
  credit_decision_withdraw: Credit.CreditDecisionMutationResult;
}
export type FinancialControlOperation = keyof FinancialControlArgumentsMap;
export type FinancialControlMutation = 'collection_save' | 'collection_activity' | 'collection_close' | 'collection_reopen' | 'cash_plan_save' | 'cash_plan_archive' | 'cash_plan_reopen' | 'credit_policy_save' | 'credit_decision_save' | 'credit_decision_withdraw';
export interface FinancialControlMethods {
  collectionCases: 'collection_list';
  collectionCase: 'collection_detail';
  saveCollectionCase: 'collection_save';
  recordCollectionActivity: 'collection_activity';
  closeCollectionCase: 'collection_close';
  reopenCollectionCase: 'collection_reopen';
  collectionReminder: 'collection_reminder';
  cashPlans: 'cash_plan_list';
  previewCashPlan: 'cash_plan_preview';
  cashPlan: 'cash_plan_detail';
  saveCashPlan: 'cash_plan_save';
  archiveCashPlan: 'cash_plan_archive';
  reopenCashPlan: 'cash_plan_reopen';
  compareCashPlans: 'cash_plan_compare';
  creditControl: 'credit_control';
  creditPolicy: 'credit_policy_detail';
  saveCreditPolicy: 'credit_policy_save';
  previewCreditAssessment: 'credit_assessment_preview';
  saveCreditDecision: 'credit_decision_save';
  creditDecision: 'credit_decision_detail';
  withdrawCreditDecision: 'credit_decision_withdraw';
}
export const FINANCIAL_CONTROL_METHODS: Readonly<FinancialControlMethods>;
export const FINANCIAL_CONTROL_ACTIONS: Readonly<Record<FinancialControlMutation,string>>;
export const FINANCIAL_CONTROL_SELECTORS: Readonly<Partial<Record<FinancialControlOperation,string>>>;
export type FinancialControlFileSelection =
  {kind:'receivables-collection';collectionCaseId:string;asOf?:string;file:Collections.CollectionFileName} |
  (Collections.CollectionsQuery & {kind:'receivables-collections';file:'collections.json'|'collections.csv'}) |
  {kind:'receivables-cash-plan';cashPlanId:string;editionId?:string;file:Cash.CashPlanFileName} |
  (Cash.CashPlanCompareQuery & {kind:'receivables-cash-plan-comparison';file:'comparison.json'|'comparison.csv'}) |
  {kind:'receivables-credit-decision';creditDecisionId:string;file:Credit.CreditDecisionFileName};
export const FINANCIAL_CONTROL_FILES: Readonly<Record<FinancialControlFileSelection['kind'], readonly string[]>>;
export interface FinancialControlClient {
  collectionCases(args?: FinancialControlArgumentsMap['collection_list'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['collection_list']>;
  collectionCase(args: FinancialControlArgumentsMap['collection_detail'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['collection_detail']>;
  saveCollectionCase(args: FinancialControlArgumentsMap['collection_save'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['collection_save']>;
  recordCollectionActivity(args: FinancialControlArgumentsMap['collection_activity'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['collection_activity']>;
  closeCollectionCase(args: FinancialControlArgumentsMap['collection_close'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['collection_close']>;
  reopenCollectionCase(args: FinancialControlArgumentsMap['collection_reopen'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['collection_reopen']>;
  collectionReminder(args: FinancialControlArgumentsMap['collection_reminder'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['collection_reminder']>;
  cashPlans(args?: FinancialControlArgumentsMap['cash_plan_list'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['cash_plan_list']>;
  previewCashPlan(args: FinancialControlArgumentsMap['cash_plan_preview'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['cash_plan_preview']>;
  cashPlan(args: FinancialControlArgumentsMap['cash_plan_detail'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['cash_plan_detail']>;
  saveCashPlan(args: FinancialControlArgumentsMap['cash_plan_save'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['cash_plan_save']>;
  archiveCashPlan(args: FinancialControlArgumentsMap['cash_plan_archive'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['cash_plan_archive']>;
  reopenCashPlan(args: FinancialControlArgumentsMap['cash_plan_reopen'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['cash_plan_reopen']>;
  compareCashPlans(args: FinancialControlArgumentsMap['cash_plan_compare'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['cash_plan_compare']>;
  creditControl(args?: FinancialControlArgumentsMap['credit_control'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['credit_control']>;
  creditPolicy(args: FinancialControlArgumentsMap['credit_policy_detail'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['credit_policy_detail']>;
  saveCreditPolicy(args: FinancialControlArgumentsMap['credit_policy_save'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['credit_policy_save']>;
  previewCreditAssessment(args: FinancialControlArgumentsMap['credit_assessment_preview'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['credit_assessment_preview']>;
  saveCreditDecision(args: FinancialControlArgumentsMap['credit_decision_save'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['credit_decision_save']>;
  creditDecision(args: FinancialControlArgumentsMap['credit_decision_detail'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['credit_decision_detail']>;
  withdrawCreditDecision(args: FinancialControlArgumentsMap['credit_decision_withdraw'], options?: ReceivablesCallOptions): Promise<FinancialControlResultsMap['credit_decision_withdraw']>;
  collectionFile(args:Omit<Extract<FinancialControlFileSelection,{kind:'receivables-collection'}>,'kind'>,options?:ReceivablesFileOptions & {maximumBytes?:number}):Promise<{bytes:Uint8Array;file:ReceivablesFileMetadata}>;
  collectionsFile(args:Omit<Extract<FinancialControlFileSelection,{kind:'receivables-collections'}>,'kind'>,options?:ReceivablesFileOptions & {maximumBytes?:number}):Promise<{bytes:Uint8Array;file:ReceivablesFileMetadata}>;
  cashPlanFile(args:Omit<Extract<FinancialControlFileSelection,{kind:'receivables-cash-plan'}>,'kind'>,options?:ReceivablesFileOptions & {maximumBytes?:number}):Promise<{bytes:Uint8Array;file:ReceivablesFileMetadata}>;
  cashPlanComparisonFile(args:Omit<Extract<FinancialControlFileSelection,{kind:'receivables-cash-plan-comparison'}>,'kind'>,options?:ReceivablesFileOptions & {maximumBytes?:number}):Promise<{bytes:Uint8Array;file:ReceivablesFileMetadata}>;
  creditDecisionFile(args:Omit<Extract<FinancialControlFileSelection,{kind:'receivables-credit-decision'}>,'kind'>,options?:ReceivablesFileOptions & {maximumBytes?:number}):Promise<{bytes:Uint8Array;file:ReceivablesFileMetadata}>;
}
export function financialControlInvocation(operation:FinancialControlOperation,input:Record<string,unknown>):{method:string;arguments:unknown[]};
export function callFinancialControl(receivables:Record<string,unknown>,operation:FinancialControlOperation,input:Record<string,unknown>):Promise<unknown>;
export function financialControlFile(receivables:Record<string,unknown>,input:FinancialControlFileSelection):Promise<{name:string;type:string;bytes:Uint8Array}>;
