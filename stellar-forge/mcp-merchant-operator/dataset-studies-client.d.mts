import type {StudyExport,ComparisonInput,ComparisonRead,ComparisonSource,ComparisonField,ComparisonKind,ComparisonRecord,ComparisonMembers} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-query-studies.mjs';
export interface CallOptions {requestSignal?: AbortSignal|null; timeoutMs?: number}
export interface MerchantStudyTransport {
 readonly endpoint: string;
 call(name: string,args: Record<string,unknown>,options?: CallOptions): Promise<any>;
}
export interface PageInput {offset?: number; limit?: number}
export interface PageInfo {offset: number; limit: number; total: number; nextOffset: number|null; oversized?: {index: number; bytes: number; wholeFileAvailable: true}}
export interface Paged<T=Record<string,unknown>> {values: T[]; page: PageInfo}
export interface StudyColumnDraft {
 name: string; include: boolean; eqEnabled: boolean; eqValue: string;
 lowerOp: ''|'gt'|'gte'; lowerValue: string; upperOp: ''|'lt'|'lte'; upperValue: string;
}
export interface StudyDraft {
 mode: 'guided'|'raw'; raw: string; selectedSnapshot: string; columns: StudyColumnDraft[];
 sort: string; descending: boolean; limit: string;
}
export interface StudySourceSummary {
 mode: 'file'|'service'; resource: string|null;
 dataset: {name: string; snapshot: string; rowCount: number; columns: number};
 semanticsAvailable?: boolean;
}
export interface StudySuccessSummary {
 snapshot: string; query: string; executedAt: string; requestUrl: string|null; requestUnavailable: string|null;
 fields: string[]; page: {returned: number; total: number; nextCursor: string|null; [key: string]: unknown};
}
export interface SavedStudySummary {
 studyId: string; title: string; storageRevision: number; updatedAt: string; editionCount: number;
 source: StudySourceSummary; lastSuccess: StudySuccessSummary|null; exportId: string; recovered?: boolean;
}
export interface OpenedStudyWorkspace {
 workspace: string; workspaceId: string; instanceId: string; label: string; state: 'OPEN'|'CLOSING';
 source: StudySourceSummary; studies: Array<{id: string;title: string;storageRevision: number;updatedAt: string;editionCount: number}>;
 studiesPage: PageInfo; browser: {open: boolean;url?: string}; imports: string[]; fileReads: Record<string,unknown>;
}
export interface StudyFileDescriptor {name: string;bytes: number;sha256: string}
export interface ComparisonDownloadSource {resultId:string;studyId:string;storageRevision:number;manifestSha256:string}
export interface StudyDownloadManifest {
 schema: 'stellar-forge.dataset-study-download.v1';mode: 'LOCAL_OPERATOR_PREVIEW';
 workspaceId: string;exportId: string;kind: 'study'|'result'|'comparison';studyId?: string;storageRevision?: number;comparisonId?:string;comparisonSha256?:string;baseline?:ComparisonDownloadSource;target?:ComparisonDownloadSource;files: StudyFileDescriptor[];
}
export interface ManifestSelection {
 state: 'MANIFEST_RETAINED';exportId: string;manifestFile: StudyFileDescriptor;kind: 'study'|'result'|'comparison';fileCount: number;workspaceId: string;
}
export interface DownloadOptions {
 exportId: string;directory: string;signal?: AbortSignal;chunkSize?: number;expectedManifestSha256?: string;
 onProgress?: (progress: Record<string,unknown>)=>void|Promise<void>;
}
export interface DownloadResult {
 schema: 'stellar-forge.dataset-study-downloaded.v1';state: 'COMPLETE';directory: string;exportId: string;
 workspaceId: string;kind: 'study'|'result'|'comparison';studyId?: string;storageRevision?: number;comparisonId?:string;comparisonSha256?:string;baseline?:ComparisonDownloadSource;target?:ComparisonDownloadSource;manifestSha256: string;
 resumed: boolean;resumedBytes: number;files: number;bytes: number;
}
export interface ImportInspection {
 sourceImport: string;sourceBytes: number;sourceSha256: string;studyId: string;title: string;editionCount: number;
 source: StudySourceSummary;sourceMatches: boolean;
}
export interface FileReadInput {
 exportId: string;file: string;expectedManifestSha256: string;expectedSha256: string;
 readId?: string;offset?: number;limit?: number;
}
export interface FileReadResult {
 exportId: string;manifestSha256: string;data: string;encoding: 'base64';
 offset: number;bytesRead: number;nextOffset: number|null;readId: string;file: StudyFileDescriptor&{type?: string};
}
export interface DatasetStudiesClient {
 readonly workspace: string;readonly workspaceId: string|undefined;readonly instanceId: string|undefined;readonly endpoint: string;
 list(input?: PageInput,options?: CallOptions): Promise<Paged<{workspace: string;label: string;source: 'file'|'service';state: 'OPEN'|'CLOSED';imports: string[]}>>;
 open(options?: CallOptions): Promise<OpenedStudyWorkspace>;
 status(input?: PageInput,options?: CallOptions): Promise<OpenedStudyWorkspace|{workspace: string;label: string;state: 'CLOSED'}>;
 inspect(input: {studyId: string;revision?: number;section?: 'working'|'editions'|'history'|'rows'}&PageInput,options?: CallOptions): Promise<SavedStudySummary&Paged&Record<string,unknown>>;
 create(input: {studyId: string;title?: string;at: string},options?: CallOptions): Promise<SavedStudySummary>;
 save(input: {studyId: string;expectedRevision: number;changes: {title?: string;draft?: StudyDraft};at: string;reason?: string},options?: CallOptions): Promise<SavedStudySummary>;
 inspectImport(sourceImport: string,options?: CallOptions): Promise<ImportInspection>;
 import(input: {sourceImport: string;expectedSourceSha256: string;expectedRevision: number|null;targetId?: string;title?: string;at?: string},options?: CallOptions): Promise<SavedStudySummary&{sourceSha256: string;sourceBytes: number;sourceMatches: boolean}>;
 fork(input: {studyId: string;revision: number;targetId: string;title?: string;at: string},options?: CallOptions): Promise<SavedStudySummary>;
 restore(input: {studyId: string;expectedRevision: number;edition: number;at: string},options?: CallOptions): Promise<SavedStudySummary>;
 rebind(input: {studyId: string;expectedRevision: number;expectedSnapshot: string;at: string},options?: CallOptions): Promise<SavedStudySummary>;
 query(input: {studyId: string;expectedRevision: number;at: string}&PageInput,options?: CallOptions): Promise<SavedStudySummary&Paged>;
 startExport(input: {studyId: string;expectedRevision: number;requestId: string},options?: CallOptions): Promise<{export: StudyExport}>;
 resumeExport(exportId: string,options?: CallOptions): Promise<{export: StudyExport}>;
 exports(input: {exportId: string;studyId?: string}&PageInput,options?: CallOptions): Promise<{export: StudyExport}>;
 exports(input?: {studyId?: string}&PageInput,options?: CallOptions): Promise<Paged<StudyExport>>;
 comparisons(input?:PageInput,options?:CallOptions):Promise<Paged<ComparisonRecord>&{workspaceId:string;warnings:Array<Record<string,unknown>>}>;
 inspectComparison(input:{baselineId:string;targetId:string},options?:CallOptions):Promise<{workspaceId:string;baseline:ComparisonSource;target:ComparisonSource;fields:ComparisonField[]}>;
 createComparison(input:ComparisonInput,options?:CallOptions):Promise<ComparisonRead>;
 readComparison(input:{id:string;kind?:ComparisonKind}&PageInput,options?:CallOptions):Promise<ComparisonRead>;
 comparisonMembers(input:{id:string;ordinal:number;side:'baseline'|'target'}&PageInput,options?:CallOptions):Promise<ComparisonMembers>;
 resumeComparison(id:string,options?:CallOptions):Promise<ComparisonRead>;
 waitComparison(id:string,options?:{signal?:AbortSignal;intervalMs?:number;onProgress?:(value:ComparisonRead)=>void|Promise<void>}):Promise<ComparisonRead>;
 downloadComparison(id:string,options:Omit<DownloadOptions,'exportId'>):Promise<DownloadResult>;
 manifest(exportId: string,options?: CallOptions): Promise<ManifestSelection>;
 file(input: FileReadInput,options?: CallOptions): Promise<FileReadResult>;
 releaseFile(exportId: string,readId: string,options?: CallOptions): Promise<{released: true;exportId: string;readId: string}>;
 openBrowser(port?: number,options?: CallOptions): Promise<{workspace: string;workspaceId: string;instanceId: string;state: 'OPEN';url: string}>;
 closeBrowser(options?: CallOptions): Promise<{workspace: string;workspaceId: string;instanceId: string;state: 'CLOSED'}>;
 close(options?: CallOptions): Promise<{workspace: string;workspaceId: string;instanceId: string;state: 'CLOSED'}>;
 waitExport(exportId: string,options?: {signal?: AbortSignal;intervalMs?: number;onProgress?: (value: {export: StudyExport})=>void|Promise<void>}): Promise<{export: StudyExport}>;
 inspectDownload(exportId: string,options?: {signal?: AbortSignal}): Promise<{manifest: StudyDownloadManifest;manifestSha256: string}>;
 download(options: DownloadOptions): Promise<DownloadResult>;
 downloadStudy(studyId: string,storageRevision: number,options: Omit<DownloadOptions,'exportId'>): Promise<DownloadResult>;
}
export function openDatasetStudiesClient(options: {
 url?: string;tokenEnv?: string;environment?: Record<string,string|undefined>;workspace: string;
 workspaceId?: string;instanceId?: string;client?: MerchantStudyTransport;signal?: AbortSignal;
}): Promise<DatasetStudiesClient>;
