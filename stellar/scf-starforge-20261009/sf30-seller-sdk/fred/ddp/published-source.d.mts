export interface FredPublishedTransportDescriptor {
  url:string;finalUrl:string;status:200;retrievedAt:string;headers:Record<string,string>;
  path:string;bytes:number;sha256:string;
}
export interface FredPublishedTargetCapture {
  schema:'stellar-forge.fred-ddp-current-publication.v1';id:string;seriesId:string;
  basis:'CURRENT_PUBLICATION_RETRIEVAL';metadata:Record<string,string>;
  files:[FredPublishedTransportDescriptor,FredPublishedTransportDescriptor];
  observationCount:number;missingCount:number;firstDate:string;lastDate:string;metadataPageObservationCount:number;
}
export interface FredPublishedTargetManifest {
  schema:'stellar-forge.fred-ddp-current-publication-set.v1';planId:string;packageId:string;crosswalkId:string;
  basis:'CURRENT_PUBLICATION_RETRIEVAL';seriesCount:number;captures:FredPublishedTargetCapture[];
  errors:Array<{seriesId:string;errorType:string;message:string}>;observationCount:number;finishedAt:string;
}
export interface FredPublishedOriginal extends FredPublishedTransportDescriptor {
  seriesId:string;originalId:string;base64:string;body:Uint8Array;
}
export interface FredPublishedObservation {
  index:number;date:string;value:string;missing:boolean;location:{start:number;end:number;line:number};
}
export interface FredPublishedRetainedCapture {
  schema:string;captureSha256:string;source:{tables:Array<Record<string,unknown>>};
  [key:string]:unknown;
}
export function validateFredPublishedCapture(capture:unknown):FredPublishedTargetCapture;
export function validateFredPublishedManifest(manifest:unknown):FredPublishedTargetManifest;
export function readFredPublishedTransport(directory:string,descriptor:FredPublishedTransportDescriptor):Promise<Uint8Array>;
export function readFredPublishedTarget(directory:string,capture:FredPublishedTargetCapture):Promise<{
  capture:FredPublishedTargetCapture;html:Uint8Array;csv:Uint8Array;rows:FredPublishedObservation[];
  metadataDescriptor:FredPublishedTransportDescriptor;observationsDescriptor:FredPublishedTransportDescriptor;
}>;
export function createFredPublishedSourceCaptures(options:{directory:string;manifest:FredPublishedTargetManifest;batchSize?:number}):Promise<FredPublishedRetainedCapture[]>;
export function originalFredPublishedTransports(capture:unknown):FredPublishedOriginal[];
