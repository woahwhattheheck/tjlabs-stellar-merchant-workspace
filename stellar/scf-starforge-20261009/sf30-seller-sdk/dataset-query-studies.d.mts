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
  close(): Promise<void>;
}
export function openDatasetQueryStudies(options: {
  directory: string;
  schema?: () => Promise<Record<string, unknown>>;
  queryPage?: (query: string) => Promise<Record<string, unknown>>;
}): Promise<DatasetStudyStore>;
