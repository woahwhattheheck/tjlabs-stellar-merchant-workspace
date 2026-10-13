/// <reference types="node" />
/** Original harbour source client. No vendor endpoint or authorization is inferred. */
export type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
export type Role='parties'|'vessels'|'places'|'applications'|'offers'|'agreements'|'visits'|'tariffs'|'charges'|'payments'|'allocations'|'assets'|'tasks'|'documents'|'principals'|'access_rules'|'relations'|'decisions'|'history';
export interface Genesis{id:string;title:string;createdAt:string}
export interface OriginalInput{path:string;sha256:string;bytes:number;filename:string;kind:'original'|'csv'|'operation';label?:string}
export interface Connection{label:string;workspacePath:string;operationsDirectory:string;genesis:Genesis;genesisSha256?:string;inputs:Record<string,OriginalInput>}
export interface Configuration{schema:'stellar-forge.harbour-source-agent.v1';workspaces:Record<string,Connection>}
export interface Pin{expectedRevision:number;expectedHead:string}
export interface Page{offset?:number;limit?:number}
export interface Operation{operationId:string;expectedRevision:number;at:string;actor:string}
export type Selector={column:number}|{constant:string};
export interface Reference{id:string;relation:string;purpose:'principal'|'protected'|'subject'|'from'|'to'|'attachment'|'other'|'party'|'vessel'|'place'|'application'|'offer'|'agreement'|'charge'|'payment';targetRole:Role;targetNamespace:string;key:Selector[];required:boolean}
export interface Basis{status:'unconfirmed'|'source-declared';sourceFileIds:string[];note:string}
export interface EvidenceBasis extends Basis{externalReferences?:Array<{namespace:string;parts:string[];reason:string;locator:string}>}
export interface ImportFile extends Operation{fileId?:string;filename:string;mimeType:string;purpose:string;sourceUrl?:string;representation?:'original'|'authored-transcription'|'authored-example';base64?:string}
export interface ImportCsv extends Operation{fileId?:string;filename:string;purpose?:string;sourceUrl?:string;representation?:'original'|'authored-transcription'|'authored-example';side:'source'|'target'|'reference';role:Role;text?:string}
export interface Mapping extends Operation{sourceId:string;namespace:string;keyColumns:number[];fields:Record<string,Selector>;references:Reference[];note:string}
export interface Correction extends Operation{sourceId:string;rowId:string;column:number;expectedValue:string|null;value:string;reason:string}
export interface Selection extends Operation{mappingIds:string[];fileIds:string[];roles:Record<Role,{status:'included'|'not-supplied'|'not-applicable';reason:string}>;declaredAcyclicRelations:string[];permissionBasis:Basis;historyBasis:Basis;evidenceBasis:EvidenceBasis;externalReferences?:Array<{namespace:string;role:Role;parts:string[];sourceFileIds:string[];locator:string;reason:string}>;note:string}
export interface Review extends Operation{selectionId:string;decision:'accepted'|'needs-work';note:string}
export type TargetSelector={field:string}|{column:number}|{keyIndex:number}|{constant:string}|{referenceId:string;keyIndex:number}|{crosswalkId:string;index:number}|{referenceId:string;crosswalkId:string;index:number};
export interface Contract extends Operation{selectionId:string;title:string;authority:'supplier-provided'|'authored-example';sourceFileIds:string[];crosswalks:Array<{id:string;fileId:string;sourceRole:Role;sourceNamespace:string;sourceKeyColumns:number[];targetColumns:number[]}>;tables:Array<{id:string;mappingId:string;templateFileId:string;keyColumns:number[];columns:Record<string,TargetSelector>;referenceBindings:Array<{referenceId:string;columns:number[];targetTableId:string}>}>;note:string}
export interface Preparation extends Operation{contractId:string;reviewId:string;note:string}
export interface Returned extends Operation{preparationId:string;tables:Array<{tableId:string;fileId:string;columns:Record<string,number|null>}>;submissionReference:string;note:string}
export interface Profile extends Operation{selectionId:string;title:string;sourceFileIds:string[];note:string}
export interface OperatingProfile extends Profile{bindings:Array<{
 mappingId:string;dateFields:Record<string,'date-only'|'offset-timestamp'>;codeMeanings:Record<string,Array<{value:string;meaning:string}>>;
 requiredByType:Array<{typeField:string;value:string;fields:string[]}>;dateOrders:Array<{earlierField:string;laterField:string}>;
 dimensions:Array<{valueField:string;unitField:string;allowedUnits:string[]}>;
 localContacts:Array<{whenField:string;whenValues:string[];referenceId:string;consentField:string;consentingValues:string[];evidenceReferenceId:string}>;
 waitingDecisions:Array<{flagField:string;trueValues:string[];recordedDateField:string;applicationReferenceId:string;applicationDateField:string}>
}>}
export interface FinancialProfile extends Profile{amountBasis:string;signBasis:string;bindings:Array<{mappingId:string;amountField:string;currencyField:string;accountField:string;periodField:string;entryTypeField:string;entryTypes:Array<{value:string;signMultiplier:1|-1}>}>;
 permittedNamespaceTriples:Array<{allocation:string;charge:string;payment:string}>;permittedPeriodTriples:Array<{allocation:string;charge:string;payment:string}>;
 coverage:Array<{namespace:string;account:string;currency:string;period:string;chargesComplete:boolean;paymentsComplete:boolean;allocationsComplete:boolean;openingItemsComplete:boolean;sourceFileIds:string[];note:string}>
}
export interface ActionInputs{saveOperatingProfile:OperatingProfile;saveFinancialProfile:FinancialProfile;importFile:ImportFile;importCsv:ImportCsv;saveMapping:Mapping;saveCorrection:Correction;saveSelection:Selection;saveReview:Review;saveContract:Contract;prepareTarget:Preparation;recordReturn:Returned}
export type Action=keyof ActionInputs;
export type Section='files'|'sources'|'mappings'|'corrections'|'selections'|'operatingProfiles'|'financialProfiles'|'reviews'|'contracts'|'preparations'|'returns'|'operations'|'drafts'|'selection';
export interface Status extends Genesis{revision:number;headSha256:string;genesisSha256:string;format:'workspace'|'recovery';copyId:string|null;unfinishedForms:string[];collections:Record<string,number>;selection:Record<string,Json>}
export interface SavedReceipt{schema:string;requestSha256:string;operationId:string;workspaceId:string;revision:number;receipt:Json;replayed:boolean;current:Status}
export interface Paged<T=Json>{items:T[];total:number;offset:number;nextOffset:number|null}
export type FileKind='workspace'|'source'|'original'|'section'|'analysis'|'target-preview'|'report'|'target'|'returned'|'working-html'|'handover'|'operation';
export interface FileSelection{kind:FileKind;id?:string;section?:Section;tableId?:string;selectionId?:string;operatingProfileId?:string;financialProfileId?:string;preparationId?:string;returnId?:string;expectedRevision?:number;expectedHead?:string;operationId?:string}
export interface CompleteFile{name:string;type:string;bytes:Buffer}
export declare const CONFIG_SCHEMA:'stellar-forge.harbour-source-agent.v1';
export declare const ACTIONS:Action[];
export declare const SECTIONS:Section[];
export declare function readHarbourConfiguration(file:string):Configuration;
export declare class HarbourSourceClient{
 constructor(entry:Connection);
 status():Status;
 section(input:Pin&Page&{section:Section}):Paged&{workspaceId:string;revision:number;headSha256:string;section:Section};
 rows(input:Pin&Page&{sourceId:string}):Paged&{headers:string[];sourceId:string};
 analyse(input:Pin&Page&{selectionId:string;operatingProfileId?:string;financialProfileId?:string;part?:'records'|'issues'|'edges'|'cycles'|'documents'|'permissions'|'history'|'operatingRows'|'operatingIssues'|'financialRows'|'financialIssues'|'financialTotals'|'allocations'|'residuals'}):Paged&{summary:Json;ready:boolean;stale:boolean};
 target(input:Pin&Page&{contractId:string;part?:'tables'|'rows'|'issues'|'crosswalks';tableId?:string}):Paged&{summary:Json;ready:boolean;stale:boolean};
 mutate<A extends Action>(action:A,input:ActionInputs[A],options?:{inputAlias?:string|null;expectedSha256?:string|null;expectedHead?:string|null;sourcePacket?:Json|null}):Promise<SavedReceipt>;
 applyInput(input:{operationId:string;inputAlias:string;expectedSha256:string;expectedHead?:string|null}):Promise<SavedReceipt>;
 replay(operationId:string):Promise<SavedReceipt>;
 operation(operationId:string):{operationId:string;action:Action;requestSha256:string;state:'PREPARED'|'COMMITTED';committedRevision:number|null;receiptSaved:boolean;current:Status};
 originalFile(input:FileSelection):Promise<CompleteFile>;
 close():Promise<void>;
}
