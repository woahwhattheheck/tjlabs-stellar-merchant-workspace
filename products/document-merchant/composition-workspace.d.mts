import type {JobWorkspace} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/job-workspace/index.mjs';
import type {VerifiedDownload} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/resource-library/verified-downloads.mjs';
import type {DocumentProviderId,DocumentFormat,JsonValue} from './index.mjs';
import type {
  DocumentCompositionRequest,DocumentCompositionCounts,DocumentCompositionFile,
  DocumentCompositionProgress,ComposedDocument
} from './composition.mjs';
import type {DocumentBatchPlan,DocumentBatchRow,DocumentBatchSnapshot,DocumentBatchExport} from './batch.mjs';

export const DOCUMENT_COMPOSITION_WORKSPACE_SCHEMA:'stellar-forge.document-composition-workspace.v1';
export interface DocumentUploadedSource {name:string;base64:string;bytes:number;sha256:string}
export interface DocumentCompositionSourceSummary {
  id:string;name:string;provider:DocumentProviderId;merchantOrigin:string;directory:string;
  sourceSha256:string;sourceBytes:number;counts:DocumentCompositionCounts;
}
export type DocumentCompositionAction='stage'|'restore'|'prepare'|'run'|'receive'|'export';
export interface DocumentCompositionOperation {
  id:string;compositionId:string;kind:DocumentCompositionAction;
  state:'RUNNING'|'COMPLETE'|'CONTINUATION_REQUIRED'|'STOPPED'|'FAILED';
  startedAt:string;endedAt:string|null;progress:DocumentCompositionProgress|{stage:'DOCUMENT_COLLECTION_EXPORT';exportId:string}|null;
  result:Record<string,unknown>|null;error:{code:string;message:string}|null;
}
export interface DocumentCompositionWorkspaceStatus {
  schema:typeof DOCUMENT_COMPOSITION_WORKSPACE_SCHEMA;workspaceDirectory:string;sourceRoot:string;
  defaults:{provider:DocumentProviderId;merchantOrigin:string|null;formats:DocumentFormat[];settings:Record<string,JsonValue>};
  providers:Array<{id:DocumentProviderId;formats:DocumentFormat[];settings:Record<string,JsonValue>}>;
  closing:boolean;active:DocumentCompositionOperation[];
}
export interface DocumentCompositionBrowserExport {
  id:string;state:'COMPLETE';source:{path:string;bytes:number;sha256:string};counts:DocumentCompositionCounts;
  documents:number;receivedDocuments:number;collection:DocumentBatchExport['collection'];
  archive:DocumentBatchExport['archive'];observedAt:string;
}
export interface DocumentCompositionDetail extends DocumentCompositionSourceSummary {
  request:DocumentCompositionRequest;sourceFiles:Array<Omit<DocumentCompositionFile,'content'>>;
  page:{offset:number;limit:number;total:number};
  documents:Array<Omit<ComposedDocument,'settings'>&{native:DocumentBatchRow|null}>;
  native:null|{
    planSha256:string;planBytes:number;directory:string;createdAt:string;
    totals:DocumentBatchPlan['totals'];units:DocumentBatchPlan['unitMeaning'];
    receivedDocuments:number;documents:number;counts:DocumentBatchSnapshot['counts'];
    parentTasks:DocumentBatchSnapshot['parentTasks'];
  };
  exports:Array<DocumentCompositionBrowserExport|{id:string;directory:string;state:'CONTINUATION_REQUIRED'|'REVIEW_REQUIRED';error?:{code:string;message:string}}>;
  active:DocumentCompositionOperation|null;
}
export interface DocumentCompositionSelection {id:string;sourceSha256:string}
export interface DocumentCompositionStageInput {
  id:string;request:DocumentCompositionRequest;dataset:DocumentUploadedSource;
  templates:Record<string,DocumentUploadedSource>;
}
export type DocumentCompositionDownloadInput=DocumentCompositionSelection&(
  |{kind:'source-plan'}
  |{kind:'source';file:string}
  |{kind:'native-plan'}
  |{kind:'pdf';documentId:string}
  |{kind:'export';exportId:string;file:string}
  |{kind:'report';reportId:string;file:'batch-plan.json'|'batch-results.json'|'batch-results.csv'|'batch-review.html'}
);
export interface DocumentCompositionWorkspaceOptions {
  workspace:JobWorkspace;
  /** A private directory inside an original customer file root; defaults to artifacts/document-compositions. */
  sourceRoot?:string;provider?:DocumentProviderId;merchantOrigin?:string|null;
  intakeAccessToken?:string|null;deadlineMs?:number;pollMs?:number;
}
export interface DocumentCompositionWorkspace {
  readonly workspace:JobWorkspace;readonly sourceRoot:string;
  status():DocumentCompositionWorkspaceStatus;
  list(options?:{offset?:number;limit?:number}):Promise<{
    total:number;offset:number;limit:number;items:Array<
      (DocumentCompositionSourceSummary|{id:string;directory:string;state:'SOURCE_REQUIRED'|'SOURCE_UNAVAILABLE';
        error:{code:string;message:string}})&{active:DocumentCompositionOperation|null}>;
  }>;
  get(options:{id:string;offset?:number;limit?:number;sourceSha256?:string;signal?:AbortSignal}):Promise<DocumentCompositionDetail>;
  operation(options:{operationId:string}):DocumentCompositionOperation;
  start(kind:'stage',input:DocumentCompositionStageInput):DocumentCompositionOperation;
  start(kind:'restore',input:DocumentCompositionSelection&({sourceFile:string;source?:never}|{source:DocumentUploadedSource;sourceFile?:never})):DocumentCompositionOperation;
  start(kind:'run',input:DocumentCompositionSelection&{planSha256:string}):DocumentCompositionOperation;
  start(kind:'prepare'|'receive',input:DocumentCompositionSelection):DocumentCompositionOperation;
  start(kind:'export',input:DocumentCompositionSelection&{exportId?:string}):DocumentCompositionOperation;
  cancel(options:{operationId:string}):Promise<DocumentCompositionOperation>;
  download(input:DocumentCompositionDownloadInput,options?:{signal?:AbortSignal}):Promise<VerifiedDownload>;
  /** Drains only work owned by this extension; the original host and customer retain their own close. */
  close():Promise<void>;
}
export function openDocumentCompositionWorkspace(options:DocumentCompositionWorkspaceOptions):Promise<DocumentCompositionWorkspace>;
