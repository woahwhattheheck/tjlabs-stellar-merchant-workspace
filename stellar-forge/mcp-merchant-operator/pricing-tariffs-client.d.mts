/** Complete tariff workflow over the original authenticated Merchant Pricing MCP. */
import type {
  JsonObject, JsonValue, TariffPreviewInput, TariffPreviewResult, TariffSaveInput,
  TariffPlan, TariffPlanList, TariffSelectionInput, TariffSelection,
  TariffCommitSelectionInput, TariffCommitSelectionResult, TariffWorkspaceState,
  TariffSource, TariffBundle, TariffRepricingInput, TariffDownload
} from '../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/tariffs/client.mjs';
export type {
  JsonObject, JsonValue, QuantityInput, TariffMode, TariffTier, TariffDefinition,
  TariffPreviewInput, TariffPreviewResult, TariffSaveInput, TariffQuoteLine,
  RationalUnitUsd, TariffQuote, TariffComparison, TariffBoundary, TariffReview,
  TariffSelectionInput, TariffSelection, TariffCommitSelectionInput,
  TariffCommitSelectionResult, TariffWorkspaceState, TariffSource, TariffBundle,
  TariffRepricingInput, TariffBundleOptions, TariffPortfolioSelection, TariffPortfolioInspection
} from '../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/tariffs/client.mjs';

export interface MerchantTariffConnection {
  /** The original HTTPS MCP endpoint or loopback HTTP listener, without token query parameters. */
  readonly url: string;
  /** Defaults to MCP_ACCESS_TOKEN. The original transport reads the token from environment. */
  readonly tokenEnv?: string;
  readonly environment?: Readonly<Record<string,string|undefined>>;
  readonly signal?: AbortSignal;
}
export interface MerchantTariffClientOptions extends MerchantTariffConnection {
  /** Host-declared existing Pricing workspace alias. */
  readonly workspace: string;
}
export interface MerchantTariffRequestOptions { readonly signal?: AbortSignal; }
export interface MerchantTariffReadOptions extends MerchantTariffRequestOptions {
  /** Original retained reader accepts 1 through 196608 bytes. */
  readonly chunkSize?: number;
}
export interface MerchantTariffBundleOptions extends MerchantTariffReadOptions {
  /** Reopen these exact retained original bytes after later saves or process restart. */
  readonly portfolioSha256?: string;
  /** Original pricingRequestId; with a digest, verifies that same retained selected export. */
  readonly selectionRequestId?: string;
}

/** The full input is validated by the native inspector; this reply lists its source bindings. */
export interface MerchantTariffPortfolioInspection {
  readonly schema: 'stellar-forge.merchant-tariff-portfolio-inspection.v1';
  readonly sourceReviewSchema: 'stellar-forge.merchant-tariff-portfolio-review.v1';
  readonly portfolioSha256: string;
  readonly planCount: number;
  readonly selectionCount: number;
  readonly plans: readonly {
    readonly planId: string;
    readonly version: string;
    readonly label: string;
    readonly sourceLabel: string;
    readonly tariffReviewSha256: string;
  }[];
  readonly selections: readonly {
    readonly id: string;
    readonly planId: string;
    readonly comparisonId: string;
    readonly planRequestId: string;
    readonly pricingRequestId: string;
    readonly completed: boolean;
    readonly scenarioPlanId: string | null;
    readonly pricingVersion: string | null;
  }[];
}
export interface MerchantTariffFile extends TariffDownload {
  readonly sha256: string;
  readonly manifestSha256: string;
}

export const TARIFF_MCP_OPERATIONS: Readonly<{
  state:'merchant_pricing_tariff_state';
  source:'merchant_pricing_tariff_source';
  preview:'merchant_pricing_tariff_preview';
  save:'merchant_pricing_tariff_save';
  list:'merchant_pricing_tariff_list';
  load:'merchant_pricing_tariff_load';
  selection:'merchant_pricing_tariff_selection';
  commitSelection:'merchant_pricing_tariff_commit_selection';
  download:'merchant_pricing_tariff_download';
  report:'merchant_pricing_tariff_report';
  bundle:'merchant_pricing_tariff_bundle';
  inspectPortfolio:'merchant_pricing_tariff_inspect_portfolio';
  receive:'merchant_pricing_tariff_receive';
  repricingSource:'merchant_pricing_tariff_repricing_source';
  downloadRepricing:'merchant_pricing_tariff_download_repricing';
  downloadPricing:'merchant_pricing_tariff_download_pricing';
  previewRepricing:'merchant_pricing_tariff_repricing_preview';
  saveRepricing:'merchant_pricing_tariff_repricing_save';
  stageRepricing:'merchant_pricing_tariff_repricing_stage';
}>;
export const tariffClientOperations: Readonly<Record<string,string>>;

/** Native request UUIDs and hashes are supplied by the caller and captured before any await. */
export class MerchantTariffClient {
  constructor(options:MerchantTariffClientOptions);
  readonly workspace:string;
  state(options?:MerchantTariffRequestOptions):Promise<TariffWorkspaceState>;
  source(version:string,options?:MerchantTariffRequestOptions):Promise<TariffSource>;
  preview(input:TariffPreviewInput,options?:MerchantTariffRequestOptions):Promise<TariffPreviewResult>;
  save(input:TariffSaveInput,options?:MerchantTariffRequestOptions):Promise<TariffPlan>;
  list(options?:MerchantTariffRequestOptions):Promise<TariffPlanList>;
  load(planId:string,options?:MerchantTariffRequestOptions):Promise<TariffPlan>;
  selection(input:TariffSelectionInput,options?:MerchantTariffRequestOptions):Promise<TariffSelection>;
  commitSelection(input:TariffCommitSelectionInput,options?:MerchantTariffRequestOptions):Promise<TariffCommitSelectionResult>;
  download(planId:string,name:string,options?:MerchantTariffReadOptions):Promise<MerchantTariffFile>;
  report(planId:string,name?:string,options?:MerchantTariffReadOptions):Promise<MerchantTariffFile>;
  /** Receives complete original JSON by verified chunks from its retained export. */
  bundle(options?:MerchantTariffBundleOptions):Promise<TariffBundle>;
  inspectPortfolio(bundle:TariffBundle,options?:MerchantTariffRequestOptions):Promise<MerchantTariffPortfolioInspection>;
  receive(bundle:TariffBundle,options?:MerchantTariffRequestOptions):Promise<JsonValue>;
  repricingSource(version:string,options?:MerchantTariffRequestOptions):Promise<JsonValue>;
  downloadRepricing(decision:string,name:string,options?:MerchantTariffReadOptions):Promise<MerchantTariffFile>;
  downloadPricing(version:string,name:string,options?:MerchantTariffReadOptions):Promise<MerchantTariffFile>;
  previewRepricing(input:TariffRepricingInput,options?:MerchantTariffRequestOptions):Promise<JsonValue>;
  saveRepricing(input:TariffRepricingInput,options?:MerchantTariffRequestOptions):Promise<JsonValue>;
  stageRepricing(input:TariffRepricingInput,options?:MerchantTariffRequestOptions):Promise<JsonValue>;
}
export function createMerchantTariffClient(options:MerchantTariffClientOptions):MerchantTariffClient;

export interface MerchantTariffDownloadProgress {
  readonly exportId:string;
  readonly file:string;
  readonly bytes:number;
  readonly total:number;
  readonly state:'DOWNLOADING';
}
export interface MerchantTariffDownloadOptions extends MerchantTariffConnection {
  readonly workspace:string;
  readonly directory:string;
  readonly chunkSize?:number;
  readonly expectedManifestSha256?:string;
  readonly onProgress?:(progress:MerchantTariffDownloadProgress)=>void|Promise<void>;
}
export interface MerchantTariffSavedDownload {
  readonly schema:string;
  readonly state:'COMPLETE';
  readonly directory:string;
  readonly exportId:string;
  readonly manifestSha256:string;
  readonly resumed:boolean;
  readonly resumedBytes:number;
  readonly files:number;
  readonly bytes:number;
  readonly planId?:string;
  readonly version?:string;
  readonly tariffReviewSha256?:string;
  readonly portfolioSha256?:string;
  readonly selectionRequestId?:string;
  readonly planCount?:number;
  readonly selectionCount?:number;
  readonly sellerSha256?:string;
  readonly snapshotSha256?:string;
}
export interface MerchantTariffManifestInspection {
  readonly manifest:JsonObject;
  readonly manifestSha256:string;
}
export function downloadMerchantTariffPlan(options:MerchantTariffDownloadOptions&{readonly planId:string}):Promise<MerchantTariffSavedDownload>;
export function inspectMerchantTariffPlan(options:MerchantTariffClientOptions&{readonly planId:string}):Promise<MerchantTariffManifestInspection>;
export function downloadMerchantTariffPortfolio(options:MerchantTariffDownloadOptions&{readonly portfolioSha256?:string;readonly selectionRequestId?:string}):Promise<MerchantTariffSavedDownload>;
export function inspectMerchantTariffPortfolio(options:MerchantTariffClientOptions&{readonly portfolioSha256:string}):Promise<MerchantTariffManifestInspection>;
export function downloadMerchantTariffPricingReview(options:MerchantTariffDownloadOptions&{readonly version:string}):Promise<MerchantTariffSavedDownload>;
export function inspectMerchantTariffPricingReview(options:MerchantTariffClientOptions&{readonly version:string}):Promise<MerchantTariffManifestInspection>;

export function downloadMerchantTariffReport(options:MerchantTariffDownloadOptions&{readonly planId:string}):Promise<MerchantTariffSavedDownload>;
export function inspectMerchantTariffReport(options:MerchantTariffClientOptions&{readonly planId:string}):Promise<MerchantTariffManifestInspection>;
