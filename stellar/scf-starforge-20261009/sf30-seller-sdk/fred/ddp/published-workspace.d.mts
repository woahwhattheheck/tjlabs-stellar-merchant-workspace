import type { FileHandle } from 'node:fs/promises';
import type { FredCurrentPublicationComparison,FredCurrentPublicationStatus } from './published-comparison.mjs';
import type { FredPublishedProgrammeSummary } from './published-cli.mjs';
export const FRED_PUBLISHED_OPERATION:'stellar-forge.fred-ddp-publication-operation.v1';
export const FRED_PUBLISHED_EDITION:'stellar-forge.fred-ddp-publication-edition.v1';
export const FRED_PUBLISHED_STATUSES:readonly FredCurrentPublicationStatus[];
export const FRED_PUBLISHED_CHUNK_BYTES:number;
export interface FredDdpPublicationFile {name:string;bytes:number;sha256:string;contentType:string;}
export interface FredDdpPublicationOperation {
  schema:typeof FRED_PUBLISHED_OPERATION;projectId:string;revision:number;id:string;requestSha256:string;
  migrationId:string;mode:'collect'|'retained';createdAt:string;expectedRevision:number;
  state:'RUNNING'|'INTERRUPTED'|'FAILED'|'COMPLETE';progress:Record<string,unknown>|null;
  result:FredPublishedProgrammeSummary|null;comparisonId:string|null;files:FredDdpPublicationFile[];
}
export interface FredDdpPublicationStart {
  directory:string;id:string;expectedRevision:number;migrationId:string;signal?:AbortSignal;
  onRetained?:(operation:FredDdpPublicationOperation)=>unknown;
}
export interface FredDdpPublicationPage {offset?:number;limit?:number;}
export interface FredDdpPublicationInventory {
  projectId:string;revision:number;total:number;offset:number;limit:number;nextOffset:number|null;
  items:Array<Omit<FredDdpPublicationOperation,'files'|'progress'>&{fileCount:number;progress:string|null}>;
}
export interface FredDdpPublicationReportPage {
  projectId:string;revision:number;operationId:string;requestSha256:string;
  schema:FredCurrentPublicationComparison['schema'];id:string;basis:FredCurrentPublicationComparison['basis'];
  packageId:string;packageSha256:string;crosswalkId:string;crosswalkSha256:string;sourcePlanId:string;
  summary:FredCurrentPublicationComparison['summary'];targetRetrieval:FredCurrentPublicationComparison['targetRetrieval'];
  sourceLocationBasis:FredCurrentPublicationComparison['sourceLocationBasis'];
  differenceBasis:FredCurrentPublicationComparison['differenceBasis'];
  total:number;offset:number;limit:number;nextOffset:number|null;query:string;rows:Array<Record<string,unknown>>;
  files:FredDdpPublicationFile[];[key:string]:unknown;
}
export interface FredDdpPublicationRow {
  index:number;source_series_id:string;board_series_id:string;fred_series_id:string;source_period:string|null;
  period_key:string;status:FredCurrentPublicationStatus;source_value:string|null;source_status:string|null;
  target_date:string|null;target_value:string|null;difference:string|null;source_file_sha256:string|null;
  source_byte_start:number|null;source_byte_end:number|null;target_file_sha256:string|null;
  target_byte_start:number|null;target_byte_end:number|null;
}
export interface FredDdpPublicationRowSelection extends FredDdpPublicationPage {
  directory:string;id:string;comparisonId:string;seriesId?:string|null;status?:FredCurrentPublicationStatus|null;
}
export interface FredDdpPublicationRowsPage {
  projectId:string;operationId:string;comparisonId:string;seriesId:string|null;status:FredCurrentPublicationStatus|null;
  total:number;offset:number;limit:number;nextOffset:number|null;rows:FredDdpPublicationRow[];
  sourceLocationBasis:FredCurrentPublicationComparison['sourceLocationBasis'];
  differenceBasis:FredCurrentPublicationComparison['differenceBasis'];
}
export interface FredDdpPublicationFileSelection {directory:string;id:string;name:string;expectedSha256:string;}
export interface FredDdpPublicationFileChunk {
  projectId:string;operationId:string;file:FredDdpPublicationFile;offset:number;bytes:number;nextOffset:number|null;
  encoding:'base64';base64:string;chunkSha256:string;
}
export function readFredDdpPublicationOperation(options:{directory:string;id:string}):Promise<FredDdpPublicationOperation>;
export function listFredDdpPublicationOperations(options:{directory:string}&FredDdpPublicationPage):Promise<FredDdpPublicationInventory>;
export function runFredDdpPublicationOperation(options:FredDdpPublicationStart):Promise<FredDdpPublicationOperation>;
export function attachFredDdpPublishedProgramme(options:FredDdpPublicationStart&{workspace:string;output?:string;manifest?:string}):Promise<FredDdpPublicationOperation>;
export function readFredDdpPublicationReport(options:{directory:string;id:string;query?:string}&FredDdpPublicationPage):Promise<FredDdpPublicationReportPage>;
export function pageFredDdpPublicationRows(options:FredDdpPublicationRowSelection):Promise<FredDdpPublicationRowsPage>;
export function openFredDdpPublicationFile(options:FredDdpPublicationFileSelection):Promise<{
  file:FileHandle;descriptor:FredDdpPublicationFile;projectId:string;operationId:string}>;
export function readFredDdpPublicationFileChunk(options:FredDdpPublicationFileSelection&FredDdpPublicationPage):Promise<FredDdpPublicationFileChunk>;
