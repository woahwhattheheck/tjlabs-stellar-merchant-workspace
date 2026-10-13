/** MIT. Complete original governance source and same-operation exchange. */
export type GovernanceCollection='committees'|'meetings'|'decisions'|'evaluations'|'findings'|'responses'|'followups';
export interface GovernanceSourceSelection {format:'csv'|'json';recordsPointer?:string;}
export type GovernanceMappingRule=
 |{column:string;encoding?:'text'|'json';empty?:'null'|'array'}
 |{pointer:string;encoding?:'text'|'json';empty?:'null'|'array'}
 |{value:unknown};
export interface GovernanceImportInput {
 operationId:string;actor:string;filename:string;documentId:string;nodeId:string;grantId?:string|null;
 collection:GovernanceCollection;selection:GovernanceSourceSelection;recordKey:GovernanceMappingRule;
 mapping:Record<string,GovernanceMappingRule>;
 identities:Record<string,{id:string;expectedRevision:number;supersedesId?:string|null}>;
}
export interface GovernanceImportPlan {
 schema:'stellar-forge.governance-import-plan.v1';
 portfolio:{id:string;revision:number;snapshot:string};
 source:{bytes:number;sha256:string;filename:string;contentType:string};
 selection:GovernanceSourceSelection;input:GovernanceImportInput;
 rows:Array<{index:number;key:string;original:Record<string,unknown>;before:unknown;supersedes:unknown;change:unknown}>;
 action:{operationId:string;action:'portfolio.save';payload:Record<string,unknown>};
 actionSha256:string;
}
export interface GovernanceFile {
 schema:'stellar-forge.governance-exchange-file.v1';
 portfolio:{id:string;revision:number;snapshot:string};governanceRevision:number;
 nodeId?:string;grantId?:string;format:'csv'|'json';contentType:string;filename:string;
 spreadsheetSafe:boolean;rows:number;bytes:number;sha256:string;content:Uint8Array;
}
export const GOVERNANCE_IMPORT_SCHEMA:'stellar-forge.governance-import-plan.v1';
export const GOVERNANCE_COLLECTIONS:readonly GovernanceCollection[];
export function inspectGovernanceSource(source:Uint8Array,selection:GovernanceSourceSelection):{
 selection:GovernanceSourceSelection;headers:string[]|null;rows:Record<string,unknown>[];bytes:number;
};
export function prepareGovernanceImport(portfolio:unknown,input:GovernanceImportInput,source:Uint8Array):Promise<GovernanceImportPlan>;
export function verifyGovernanceImportPlan(portfolio:unknown,plan:GovernanceImportPlan,source:Uint8Array):Promise<GovernanceImportPlan>;
export function reopenGovernanceImportPlan(client:unknown,plan:GovernanceImportPlan,source:Uint8Array,options?:{signal?:AbortSignal}):Promise<GovernanceImportPlan>;
export function submitGovernanceImport(client:unknown,plan:GovernanceImportPlan,source:Uint8Array,options?:{signal?:AbortSignal}):Promise<unknown>;
export function exportGovernanceRecords(portfolio:unknown,options?:{
 collection?:GovernanceCollection;nodeId?:string;grantId?:string;format?:'csv'|'json';spreadsheetSafe?:boolean;
}):Promise<GovernanceFile>;
