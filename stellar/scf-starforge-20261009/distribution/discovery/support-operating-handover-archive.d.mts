import type {SupportOperatingHandover,SupportHandoverArtifact,SupportHandoverBlob,SupportHandoverRead,SupportHandoverReadOptions,SupportHandoverVerification} from './support-operating-handover.mjs';
export interface PreparedSupportHandoverArchive extends SupportHandoverVerification {
  parts:Array<Uint8Array|SupportHandoverBlob>;documentFile:SupportHandoverArtifact;byteCount:number;
}
export interface ReadSupportHandoverArchive extends SupportHandoverVerification {
  archive:SupportHandoverBlob;archiveFile:SupportHandoverArtifact;
  documentFile:SupportHandoverArtifact;read:SupportHandoverRead;
}
/** Headers and original File/Blob slices. Native callers may stream each part. */
export function prepareSupportHandoverArchive(value:SupportOperatingHandover,read:SupportHandoverRead,options?:SupportHandoverReadOptions):Promise<PreparedSupportHandoverArchive>;
/** Browser callers supply actual File/Blob members. The complete constructed archive is independently reopened. */
export function createSupportHandoverArchive(value:SupportOperatingHandover,read:SupportHandoverRead,options?:SupportHandoverReadOptions):Promise<ReadSupportHandoverArchive&{archive:Blob}>;
export function readSupportHandoverArchive(archive:SupportHandoverBlob,options?:SupportHandoverReadOptions&{expectedArchive?:SupportHandoverArtifact}):Promise<ReadSupportHandoverArchive>;
