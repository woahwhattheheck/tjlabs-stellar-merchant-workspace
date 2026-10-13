import type {PrepaidApiStarterRequest,PrepaidApiStarterTemplate,PrepaidApiSetup} from './index.mjs';
export const COMMISSION_SCHEMA:'stellar-forge.prepaid-api-commissioning.v1';
export const MAX_COMMISSION_BYTES:number;
export interface CommissionEdition {id:string;parents:string[];request:PrepaidApiStarterRequest|PrepaidApiStarterTemplate;directory:string;actor:string;note:string;at:string}
export type CaptureKind='setup-plan'|'setup-result'|'publication'|'customer-handoff'|'customer-files'|'customer-setup';
export interface CommissionCapture {id:string;kind:CaptureKind;editionId:string;parentId:string|null;raw:string;sourceSha256:string;at:string}
export interface Commission {schema:typeof COMMISSION_SCHEMA;id:string;head:string;editions:CommissionEdition[];captures:CommissionCapture[]}
export interface CommissionSummary {id:string;head:string;title:string;directory:string;requestSha256:string;issues:string[];editions:number;captures:Array<Pick<CommissionCapture,'id'|'kind'|'sourceSha256'|'at'>>;historicalCaptures:number;maximumSuccessfulCalls:number|null;remainingUnits:number|null}
export interface EditionInput {request:CommissionEdition['request'];directory:string;actor:string;note?:string;at:string}
export interface CommissionMember {name:string;bytes:number;sha256:string}
export function createCommission(input:EditionInput&{id:string}):Commission;
export function reviseCommission(state:Commission,input:EditionInput):Commission;
export function validateCommission(state:unknown):Commission;
export function openCommission(raw:string):Commission;
export function exportCommission(state:Commission):string;
export function currentEdition(state:Commission):CommissionEdition;
export function validateRequestDraft(request:unknown):CommissionEdition['request'];
export function canonical(value:unknown):string;
export function requestIssues(request:CommissionEdition['request']):string[];
export function receiveOriginal(state:Commission,input:{kind:CaptureKind;raw:string;parentId?:string|null;editionId?:string;at:string}):Commission;
export function commissioningSummary(state:Commission):CommissionSummary;
export interface ComparisonField {key:string;base:unknown;current:unknown;incoming:unknown;present:{base:boolean;current:boolean;incoming:boolean};selected:'current'|'incoming'|null}
export function compareCommission(local:Commission,incoming:Commission):{schema:'stellar-forge.prepaid-api-comparison.v1';commissionId:string;currentHead:string;incomingHead:string;base:string|null;bases:string[];ambiguousBase:boolean;fields:ComparisonField[]};
export function mergeCommission(local:Commission,incoming:Commission,choices:Record<string,'current'|'incoming'>,input:{actor:string;note:string;at:string}):Commission;
export function generatedSourceFiles(state:Commission,planId:string):Array<{name:string;bytes:number;sha256:string;content:string}>;
export function buildPrepaidCommissioning(input:{out:string;document?:string;directory?:string;actor?:string}):Promise<{schema:'stellar-forge.prepaid-commissioning-built.v1';directory:string;summary:CommissionSummary;files:CommissionMember[]}>;
export function preparePrepaidCommissioning(input:{document:string;out:string;workspaceId?:string;runtimeId?:string}):Promise<{schema:'stellar-forge.prepaid-commissioning-prepared.v1';status:'PREPARED';directory:string;commissioningId:string;editionId:string;requestSha256:string;originalSetup:PrepaidApiSetup;applicationSetupFile:string|null;files:CommissionMember[]}>;
export function inspectPrepaidCommissioning(document:string):Promise<CommissionSummary>;
