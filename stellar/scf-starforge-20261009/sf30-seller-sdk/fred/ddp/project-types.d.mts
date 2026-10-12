import type { Buffer } from 'node:buffer';
import type { FredDdpFileDescriptor } from './files.mjs';
import type { FredDdpCrosswalkCapture, FredDdpCrosswalkModel } from './crosswalk.mjs';
import type { FredDdpPackageCapture, FredDdpPackageModel } from './package.mjs';
import type {
  FredDdpMigrationInput as FredDdpMigrationSettings, FredDdpMigrationPlan, FredDdpMigrationPlanPage
} from './migration.mjs';
import type { FredDdpReceiving, FredDdpReceivingPage } from './receiving.mjs';
import type { FredDdpReceivingFileManifest, FredDdpReceivingFile } from './receiving-report.mjs';

export interface FredDdpCrosswalkSummary {
  id: FredDdpCrosswalkCapture['id'];
  captureSha256: string;
  source: FredDdpFileDescriptor;
  summary: FredDdpCrosswalkModel['summary'];
}
export interface FredDdpPackageSummary {
  id: FredDdpPackageCapture['id'];
  captureSha256: string;
  source: FredDdpFileDescriptor;
  summary: FredDdpPackageModel['summary'];
  release: string;
  format: FredDdpPackageCapture['format'];
}
export type FredDdpSourceSummary = FredDdpCrosswalkSummary | FredDdpPackageSummary;
export interface FredDdpMigrationSummary {
  id: FredDdpMigrationPlan['id'];
  packageId: FredDdpMigrationPlan['packageId'];
  packageSha256: string;
  crosswalkId: FredDdpMigrationPlan['crosswalkId'];
  crosswalkSha256: string;
  name: string;
  asOf: string;
  window: FredDdpMigrationPlan['input']['window'];
  acquisitionCount: number;
  summary: FredDdpMigrationPlan['summary'];
}
export interface FredDdpReceivingCoreSummary {
  id: FredDdpReceiving['id'];
  planId: FredDdpReceiving['planId'];
  packageId: FredDdpReceiving['packageId'];
  packageSha256: string;
  crosswalkId: FredDdpReceiving['crosswalkId'];
  crosswalkSha256: string;
  captureIds: string[];
  summary: FredDdpReceiving['summary'];
}
export interface FredDdpReceivingSummary extends FredDdpReceivingCoreSummary, FredDdpReceivingFileManifest {}
export interface FredDdpProjectInventory {
  projectId: string;
  revision: number;
  crosswalks: FredDdpCrosswalkSummary[];
  packages: FredDdpPackageSummary[];
  migrations: FredDdpMigrationSummary[];
  receivings: FredDdpReceivingSummary[];
}
export interface FredDdpProjectFamilyState {
  ddpCrosswalks?: FredDdpCrosswalkSummary[];
  ddpPackages?: FredDdpPackageSummary[];
  ddpMigrations?: FredDdpMigrationSummary[];
  ddpReceivings?: FredDdpReceivingSummary[];
}
export interface FredDdpMutation {
  directory: string;
  id: string;
  expectedRevision: number;
}
export interface FredDdpSourceAccess {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}
export type FredDdpMigrationInput = FredDdpMigrationSettings & {
  packageId: FredDdpPackageCapture['id'];
  crosswalkId: FredDdpCrosswalkCapture['id'];
};
export interface FredDdpMigrationPaging {
  section?: 'series' | 'mappings' | 'acquisitions';
  offset?: number;
  limit?: number;
}
export interface FredDdpReceivingPaging {
  offset?: number;
  limit?: number;
  changesOnly?: boolean;
  seriesId?: string | null;
}
export interface FredDdpMigrationPreview {
  projectId: string;
  revision: number;
  migrationId: FredDdpMigrationPlan['id'];
  previewId: string;
  migration: FredDdpMigrationPlanPage;
}
export interface FredDdpMigrationView {
  projectId: string;
  revision: number;
  migration: FredDdpMigrationPlanPage;
  receivings: FredDdpReceivingSummary[];
}
export interface FredDdpReceivingView {
  projectId: string;
  revision: number;
  receiving: FredDdpReceivingPage;
}
export interface FredDdpMutationResult { revision: number; replayed?: true }
export interface FredDdpCrosswalkImportResult extends FredDdpMutationResult {
  crosswalkId: FredDdpCrosswalkCapture['id'];
  source: FredDdpCrosswalkSummary;
}
export interface FredDdpPackageImportResult extends FredDdpMutationResult {
  packageId: FredDdpPackageCapture['id'];
  source: FredDdpPackageSummary;
}
export type FredDdpSourceImportResult = FredDdpCrosswalkImportResult | FredDdpPackageImportResult;
export interface FredDdpCrosswalkAcquireResult extends FredDdpCrosswalkImportResult {
  acquisitionId: string;
  url: string;
}
export interface FredDdpMigrationSaveResult extends FredDdpMutationResult {
  migrationId: FredDdpMigrationPlan['id'];
  migration: FredDdpMigrationSummary;
}
export interface FredDdpMigrationAcquireResult extends FredDdpMutationResult {
  migrationId: FredDdpMigrationPlan['id'];
  receivingId: FredDdpReceiving['id'];
  receiving: FredDdpReceivingSummary;
  captureIds: string[];
  acquisitionId: string;
  reusedReceiving: boolean;
}
export interface FredDdpMigrationDownload {
  migrationId: FredDdpMigrationPlan['id'];
  path: 'fred-ddp-migration-plan.json';
  contentType: 'application/json';
  bytes: number;
  sha256: string;
  body: Buffer;
}
export type FredDdpReceivingDownload = FredDdpReceivingFile & {
  receivingId: FredDdpReceiving['id'];
  body: Buffer;
};
export interface FredDdpProjectApi {
  listFredDdpSources(input: { directory: string }): Promise<FredDdpProjectInventory>;
  getFredDdpCrosswalk(input: { directory: string; crosswalkId: FredDdpCrosswalkCapture['id'] }): Promise<FredDdpCrosswalkCapture>;
  importFredDdpCrosswalk(input: FredDdpMutation & {
    capture?: FredDdpCrosswalkCapture; crosswalkId?: FredDdpCrosswalkCapture['id'];
  }): Promise<FredDdpCrosswalkImportResult>;
  acquireFredDdpCrosswalk(input: FredDdpMutation & FredDdpSourceAccess & { url?: string }): Promise<FredDdpCrosswalkAcquireResult>;
  getFredDdpPackage(input: { directory: string; packageId: FredDdpPackageCapture['id'] }): Promise<FredDdpPackageCapture>;
  importFredDdpPackage(input: FredDdpMutation & {
    capture?: FredDdpPackageCapture; packageId?: FredDdpPackageCapture['id'];
  }): Promise<FredDdpPackageImportResult>;
  previewFredDdpMigration(input: FredDdpMigrationInput & FredDdpMigrationPaging & {
    directory: string;
  }): Promise<FredDdpMigrationPreview>;
  saveFredDdpMigration(input: FredDdpMutation & FredDdpMigrationInput & {
    previewId: string;
  }): Promise<FredDdpMigrationSaveResult>;
  getFredDdpMigration(input: FredDdpMigrationPaging & {
    directory: string; migrationId: FredDdpMigrationPlan['id'];
  }): Promise<FredDdpMigrationView>;
  downloadFredDdpMigration(input: {
    directory: string; migrationId: FredDdpMigrationPlan['id'];
  }): Promise<FredDdpMigrationDownload>;
  acquireFredDdpMigration(input: FredDdpMutation & FredDdpSourceAccess & {
    migrationId: FredDdpMigrationPlan['id']; environment?: Record<string, string | undefined>;
  }): Promise<FredDdpMigrationAcquireResult>;
  getFredDdpReceiving(input: FredDdpReceivingPaging & {
    directory: string; receivingId: FredDdpReceiving['id'];
  }): Promise<FredDdpReceivingView>;
  downloadFredDdpReceiving(input: {
    directory: string; receivingId: FredDdpReceiving['id']; format?: 'json' | 'csv' | 'html';
  }): Promise<FredDdpReceivingDownload>;
}

// The installed ./seller/fred/ddp/project runtime points to the original project.mjs.
// Preserve real named value exports alongside the reusable request/result types.
export declare const listFredDdpSources: FredDdpProjectApi['listFredDdpSources'];
export declare const getFredDdpCrosswalk: FredDdpProjectApi['getFredDdpCrosswalk'];
export declare const importFredDdpCrosswalk: FredDdpProjectApi['importFredDdpCrosswalk'];
export declare const acquireFredDdpCrosswalk: FredDdpProjectApi['acquireFredDdpCrosswalk'];
export declare const getFredDdpPackage: FredDdpProjectApi['getFredDdpPackage'];
export declare const importFredDdpPackage: FredDdpProjectApi['importFredDdpPackage'];
export declare const previewFredDdpMigration: FredDdpProjectApi['previewFredDdpMigration'];
export declare const saveFredDdpMigration: FredDdpProjectApi['saveFredDdpMigration'];
export declare const getFredDdpMigration: FredDdpProjectApi['getFredDdpMigration'];
export declare const downloadFredDdpMigration: FredDdpProjectApi['downloadFredDdpMigration'];
export declare const acquireFredDdpMigration: FredDdpProjectApi['acquireFredDdpMigration'];
export declare const getFredDdpReceiving: FredDdpProjectApi['getFredDdpReceiving'];
export declare const downloadFredDdpReceiving: FredDdpProjectApi['downloadFredDdpReceiving'];
