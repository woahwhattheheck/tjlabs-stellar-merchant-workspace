export type DatasetStudyMode = 'LOCAL_OPERATOR_PREVIEW';
export interface RetainedFile { name: string; bytes: number; sha256: string }
export interface SavedStudy<T = Record<string, unknown>> { storageRevision: number; study: T; recovered?: boolean }
export interface StudySummary { id: string; title: string; storageRevision: number; updatedAt: string; editionCount: number }
export interface StudyExport {
  id: string; mode: DatasetStudyMode; status: 'READY'|'RUNNING'|'PAUSED'|'COMPLETE';
  studyId: string; storageRevision: number; title: string; snapshot: string; query: string;
  pages: number; rows: number; total: number|null; createdAt: string; files: RetainedFile[];
  error?: {code: string; message: string};
}
export type ComparisonKind='all'|'added'|'removed'|'changed'|'unchanged'|'ambiguous'|'moved';
export interface ComparisonField {baseline:string|null;target:string|null;key:boolean}
export interface ComparisonInput {
 id:string;title:string;baselineId:string;targetId:string;baselineSha256:string;targetSha256:string;fields:ComparisonField[];
}
export interface ComparisonSource {
 id:string;title:string;studyId:string;storageRevision:number;source:Record<string,unknown>;snapshot:string;query:string;rows:number;
 columns:Array<{name:string;type:'string'|'integer'|'number'|'boolean';nullable:boolean}>;manifestSha256:string;manifestBytes:number;data:RetainedFile;files:RetainedFile[];
}
export interface ComparisonRecord {
 schema:'stellar-forge.dataset-study-comparison.v1';id:string;title:string;createdAt:string;workspaceId:string;
 status:'READY'|'RUNNING'|'PAUSED'|'COMPLETE';inputSha256:string;sha256:string|null;
 baseline:ComparisonSource;target:ComparisonSource;plan:Record<string,unknown>;groups:number;
 counts:Record<string,number>|null;rowCounts:Record<string,number>|null;moved:number;files:RetainedFile[];error?:{code:string;message:string};
}
export interface ComparisonPage {
 rows:Array<Record<string,unknown>>;offset:number;limit:number;kind:ComparisonKind;total:number;nextOffset:number|null;
}
export interface ComparisonRead {comparison:ComparisonRecord;page:ComparisonPage}
export interface ComparisonMembers {
 comparisonId:string;comparisonSha256:string;ordinal:number;kind:string;key:Array<Record<string,unknown>>;keyTruncated?:true;
 reasons:string[];side:'baseline'|'target';rows:Array<{ordinal:number;values:Record<string,string|number|boolean|null>}>;
 page:{offset:number;limit:number;total:number;nextOffset:number|null;oversized?:{index:number;bytes:number;wholeFileAvailable:true}};
}
export interface DatasetStudyStore {
  readonly directory: string;
  readonly workspaceId: string;
  list(): Promise<{enabled: true; studies: StudySummary[]}>;
  get(id: string, options?: {revision?: number}): Promise<SavedStudy>;
  save(input: {study: Record<string, unknown>; expectedRevision: number|null}): Promise<SavedStudy>;
  history(id: string): Promise<Array<Omit<StudySummary,'id'> & {recordSha256: string; studySha256: string}>>;
  beginExport(input: {studyId: string; expectedRevision: number; query: string; snapshot: string; requestId: string}): Promise<{export: StudyExport}>;
  resumeExport(id: string): Promise<{export: StudyExport}>;
  exportStatus(id: string): Promise<{export: StudyExport}>;
  listExports(options?: {studyId?: string}): Promise<{exports: StudyExport[]}>;
  readExportFile(id: string, name: string): Promise<{descriptor: RetainedFile; stream: import('node:stream').Readable; contentType: string}>;
  openExportFile(id: string,name: string): Promise<{readonlyFileHandle: import('node:fs/promises').FileHandle;name: string;bytes: number;sha256: string;type: string}>;
  openStudyFile(id: string,options?: {revision?: number}): Promise<{readonlyFileHandle: import('node:fs/promises').FileHandle;name: string;bytes: number;sha256: string;type: string;studyId: string;storageRevision: number}>;
  waitExport(id: string): Promise<{export: StudyExport}>;
  comparisonInspect(input:{baselineId:string;targetId:string}):Promise<{workspaceId:string;baseline:ComparisonSource;target:ComparisonSource;fields:ComparisonField[]}>;
  comparisonList():Promise<{workspaceId:string;comparisons:ComparisonRecord[];warnings:Array<{id:string;code:string;message:string}>}>;
  comparisonCreate(input:ComparisonInput):Promise<ComparisonRead>;
  comparisonRead(input:{id:string;kind?:ComparisonKind;offset?:number;limit?:number}):Promise<ComparisonRead>;
  comparisonMembers(input:{id:string;ordinal:number;side:'baseline'|'target';offset?:number;limit?:number}):Promise<ComparisonMembers>;
  comparisonResume(id:string):Promise<ComparisonRead>;
  waitComparison(id:string):Promise<ComparisonRead>;
  openComparisonFile(id:string,name:string):Promise<{readonlyFileHandle:import('node:fs/promises').FileHandle;name:string;bytes:number;sha256:string;type:string}>;
  close(): Promise<void>;
}
export function openDatasetQueryStudies(options: {
  directory: string;
  schema?: () => Promise<Record<string, unknown>>;
  queryPage?: (query: string) => Promise<Record<string, unknown>>;
}): Promise<DatasetStudyStore>;
