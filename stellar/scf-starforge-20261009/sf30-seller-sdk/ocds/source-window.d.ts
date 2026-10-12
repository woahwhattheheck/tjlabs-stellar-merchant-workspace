import type { JsonObject } from './domain.js';
import type { WorkspaceIdentity, WorkspacePackage } from './client.js';

export type SourceRequest = {
  kind?: 'record' | 'releases'; ocid?: string; noticeId?: string;
  updatedFrom?: string; updatedTo?: string; stages?: string | string[]; limit?: number;
  [key: string]: unknown;
};
export type OriginalAttachment = {
  ocid: string; entryId?: string; referenceUrl: string; document: JsonObject;
};
export type SourceSelectionInput = {
  id: string; label?: string; provider: string; request: SourceRequest; ocids: string[];
  owner?: string; enabled?: boolean; acquireDocuments?: boolean;
  documentEditionScope?: 'current' | 'all-retained'; documentHosts?: string[];
  attachments?: OriginalAttachment[]; reviewPolicy?: { administrativePointers?: string[] };
};
export type SourceSelection = SourceSelectionInput & {
  schema: 'stellar-forge.ocds.source-selection.v1'; revision: number;
  label: string; owner: string; enabled: boolean; acquireDocuments: boolean;
  documentEditionScope: 'current' | 'all-retained'; createdAt: string; updatedAt: string;
};
export type OriginalObservation = {
  id?: string; operationId: string; requestedUrl: string; finalUrl: string; retrievedAt: string;
  status: number; sha256: string; bytes: number; contentType?: string | null;
  originalFilename?: string; etag?: string | null; lastModified?: string | null;
  headers?: Record<string,string>|null; redirects?: {url:string;status:number;location:string}[];
  windowId?: string; [key:string]: unknown;
};
export type OriginalSourceObservation = {
  operationId:string;transport:string;requestedUrl:string;retrievedAt?:string|null;completedBy?:string;sha256:string;bytes:number;
  finalUrl?:string|null;status?:number|null;contentType?:string|null;headers?:Record<string,string>|null;
  [key:string]:unknown;
};
export type AdoptSourceObservationInput = {
  selectionId:string;selectionIds?:string[];windowId?:string;name?:string;baseline?:{ocid:string;entryId:string|null}[];
  context?:unknown;expectedWindowRevision?:number;rawText?:string;bodyBase64?:string;observation:OriginalSourceObservation;
};
export type SourceDocument = {
  id: string; logicalId: string; ocid: string; entryId: string | null; sourceId: string | null;
  sourcePointer: string | null; documentId: unknown; selectionId: string; origin: string;
  referenceUrl?: string; document: JsonObject; available: boolean;
  latest: OriginalObservation | null; versions: OriginalObservation[]; observations?: OriginalObservation[];
  acquisition?: {status:string;error?:unknown;[key:string]:unknown}; updatedAt: string;
};
export type SourceReview = {
  id:string; revision:number; ocid:string; windowId:string; selectionId:string; kind:string;
  status:'pending'|'reviewing'|'resolved'; owner:string; nextAction:string; resolution:string;
  beforeEntryId:string|null; afterEntryId:string|null;
  materialPaths:string[]; administrativePaths:string[]; comparisonCounts:unknown;
  documentChanges:Record<string,unknown>[]; documentReferenceChanges:Record<string,unknown>[];
  sourceIssues:Record<string,unknown>[]; projectReviewRevision:number|null;
  createdAt:string; updatedAt:string; [key:string]:unknown;
};
export type SourceReviewPatch = {
  expectedRevision:number; status:'pending'|'reviewing'|'resolved'; owner?:string; nextAction?:string; resolution?:string;
};
export type SourceWindow = {
  id:string; revision:number; workspaceId:string; name:string; status:string; createdAt:string; updatedAt:string;
  selections:SourceSelection[]; selectedOcids:string[];
  baseline:{ocid:string;entryId:string|null;reviewRevision?:number|null}[];
  current?:{ocid:string;entryId:string|null}[];
  sources:Record<string,unknown>[]; references:SourceDocument[]; documents:Record<string,unknown>[];
  workIds:string[]; issues:Record<string,unknown>[]; context?:unknown; receivedFromPackageId?:string;
  [key:string]:unknown;
};
export type SourceRunInput = {windowId:string} | {
  name:string; selectionIds?:string[]; baseline?:{ocid:string;entryId:string|null}[]; context?:unknown;
};
export type SourceReceiving = {
  id:string; packageId:string; receivedAt:string; sourceWorkspace:WorkspaceIdentity;
  destinationWorkspaceId:string; selectedOcids:string[]; imported:Record<string,number>; conflicts:Record<string,unknown>[];
  original?:Record<string,unknown>;
};
export type SourceState = {
  schema:'stellar-forge.ocds.source-operations.v1'; workspace:WorkspaceIdentity; providers:string[];
  selections:SourceSelection[]; windows:SourceWindow[]; work:SourceReview[]; documents:SourceDocument[];
  documentBodies:{sha256:string;bytes:number}[]; documentBytes:number; receivings:SourceReceiving[];
};
export type SourceOperationsPacket = {
  schema:'stellar-forge.ocds.source-operations.v1'; packageId:string; sourceWorkspace:WorkspaceIdentity;
  selectedOcids:string[]; exportedAt:string; selections:SourceSelection[]; windows:SourceWindow[];
  documents:SourceDocument[]; work:SourceReview[]; comparisons:Record<string,unknown>[];
  receivings:Record<string,unknown>[]; bodies:{sha256:string;bytes:number;path:string}[];
};
export type SourceHandoffSnapshot = {
  source:SourceOperationsPacket; workspace:WorkspacePackage|null;
  report:{mime:string;filename:string;body:string}|null;
};
export type SourceProgress = {windowId:string;revision:number;stage:string;status:string};
export type SourceAdapter = {
  validate?(selection:SourceSelectionInput):void;
  capture(workspace:object,selection:SourceSelection,context:{
    windowId:string;selectionId:string;previous:Record<string,unknown>;fetchImpl:typeof fetch;signal?:AbortSignal;
    onProgress(progress:Record<string,unknown>):Promise<void>;
  }):Promise<{status:'complete';captureId?:string;sourceIds:string[];observations:Record<string,unknown>[];[key:string]:unknown}>;
};
export type SourceOperationOptions = {
  adapters?:Record<string,SourceAdapter>;fetchImpl?:typeof fetch;
  resolveHost?:(hostname:string,options:{all:true})=>Promise<{address:string;family?:number}[]>;
  maxDocumentBytes?:number;maxRetainedDocumentBytes?:number;
};
export declare const SOURCE_OPERATIONS_SCHEMA:'stellar-forge.ocds.source-operations.v1';
export declare class SourceOperations {
  constructor(workspace:object,options?:SourceOperationOptions);
  workspace:object;maxDocumentBytes:number;maxRetainedDocumentBytes:number;
  saveSelection(input:SourceSelectionInput,options:{expectedRevision:number}):SourceSelection;
  state():SourceState;
  window(id:string):SourceWindow;
  receiving(id:string):SourceReceiving;
  document(id:string,options?:{sha256?:string}):{metadata:SourceDocument;sha256:string;bytes:number;body:Uint8Array};
  run(input:SourceRunInput,options?:{signal?:AbortSignal;onProgress?:(progress:SourceProgress)=>void|Promise<void>}):Promise<SourceState&{window:SourceWindow}>;
  adoptSourceObservation(input:Omit<AdoptSourceObservationInput,'bodyBase64'>&{rawBytes?:Uint8Array}):SourceState&{window:SourceWindow;observation:OriginalSourceObservation;repeated:boolean};
  importOriginalDocument(input:{selectionId:string;referenceId?:string;ocid?:string;documentId?:unknown;body:Uint8Array;observation:OriginalObservation}):SourceState&{window:SourceWindow};
  review(id:string):{review:SourceReview;comparison:unknown;documents:SourceDocument[]};
  reviewWork(id:string,patch:SourceReviewPatch):SourceReview;
  exportState(options:{ocids:string[]}):SourceOperationsPacket;
  prepareHandoff(options:{ocids:string[]}):SourceHandoffSnapshot;
  writeExport(directory:string,packet:SourceOperationsPacket):Promise<Record<string,unknown>>;
  exportDirectory(directory:string,options:{ocids?:string[];prepared?:SourceHandoffSnapshot}):Promise<Record<string,unknown>>;
  receiveDirectory(directory:string,options:{expectedRevision:number;expectedPackageId?:string}):Promise<SourceReceiving>;
  receiveHandoff(directory:string,options:{expectedRevision:number;expectedHandoffId?:string}):Promise<Record<string,unknown>>;
}
export declare function renderSourceReview(packet:SourceOperationsPacket):string;
