import type { CanadaBuysMerchantClient, FilePublication, FileDescriptor } from './canadabuys-client.mjs';
import type { Publication, WorkspaceMetadata, ReceiveResult } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/workspace.mjs';
export interface PublicationFile { name: string; bytes: number; sha256: string; mime: string; originalReadName: string; original: FileDescriptor }
export interface PublicationManifest {
 schema: 'stellar-forge.canadabuys-publication-receiving.v1'; publicationId: string;
 workspace: { alias: string; id: string }; originalResponse: FilePublication; files: PublicationFile[];
}
export interface PublicationInspection { manifest: PublicationManifest; manifestSha256: string }
export interface DownloadOptions {
 client: CanadaBuysMerchantClient; publicationId: string; directory: string; expectedManifestSha256?: string;
 signal?: AbortSignal; chunkSize?: number;
 onProgress?: (value: { exportId: string; file: string; bytes: number; total: number; state: 'DOWNLOADING' }) => void | Promise<void>;
}
export interface DownloadResult {
 schema: string; state: 'COMPLETE'; directory: string; exportId: string; publicationId: string;
 workspace: string; workspaceId: string; publication: Publication; manifestSha256: string; resumed: boolean;
 resumedBytes: number; files: number; bytes: number;
}
export interface VerifyOptions { directory: string; publicationId: string; expectedManifestSha256?: string; signal?: AbortSignal }
export interface Verification {
 schema: string; state: 'VERIFIED'; directory: string; publicationId: string; manifest: PublicationManifest;
 manifestSha256: string; files: number; bytes: number; networkRequests: 0;
}
export interface PackageReceiveOptions extends VerifyOptions {
 workspaceDirectory: string; expectedRevision: number; operator?: string; title?: string;
}
export interface PackageReceiving {
 schema: string; state: 'RECEIVED'; source: { publicationId: string; workspaceId: string; manifestSha256: string;
 file: { name: string; bytes: number; sha256: string } }; workspace: WorkspaceMetadata; result: ReceiveResult; networkRequests: 0;
}
export declare const CANADABUYS_PUBLICATION_MANIFEST: 'canadabuys-publication.json';
export declare const CANADABUYS_PUBLICATION_SCHEMA: 'stellar-forge.canadabuys-publication-receiving.v1';
export declare const CANADABUYS_PUBLICATION_LIMITS: Readonly<{ files: number; fileBytes: number; totalBytes: number; manifestBytes: number; checkpointBytes: number }>;
export declare function parseCanadaBuysPublication(bytes: Uint8Array, publicationId: string): PublicationManifest;
export declare function inspectCanadaBuysPublication(options: { client: CanadaBuysMerchantClient; publicationId: string; signal?: AbortSignal }): Promise<PublicationInspection>;
export declare function downloadCanadaBuysPublication(options: DownloadOptions): Promise<DownloadResult>;
export declare function verifyCanadaBuysDownload(options: VerifyOptions): Promise<Verification>;
export declare function receiveCanadaBuysPackage(options: PackageReceiveOptions): Promise<PackageReceiving>;
