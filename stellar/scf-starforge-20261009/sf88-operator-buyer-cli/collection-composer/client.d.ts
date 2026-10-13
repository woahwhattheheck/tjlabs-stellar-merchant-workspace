export interface PlanParameter {
  name: string;
  label?: string;
  default?: string;
}
export type OperatorBinding =
  | { operatorWorkspace: string; operatorConfigFile?: never }
  | { operatorConfigFile: string; operatorWorkspace?: never };
export type PlannedRequest = OperatorBinding & {
  key: string;
  name: string;
  discoveryFile: string;
  rowIndex: number;
  acceptIndex: number;
  url: string;
  method: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
  bodyFile?: string;
  headers?: Record<string, string>;
  ticketFile?: string;
  ticketHeader?: string;
  responseOut?: string;
};
export interface CollectionPlan {
  schema: "stellar-forge.sf88.collection-plan.v1";
  id: string;
  name: string;
  description?: string;
  parameters?: PlanParameter[];
  requests: PlannedRequest[];
}
export interface SavedPlan {
  schema: "stellar-forge.sf88.collection-plan-revision.v1";
  id: string;
  planSha256: string;
  savedAt: string;
  plan: CollectionPlan & { parameters: PlanParameter[] };
}
export interface PlanSummary {
  id: string;
  planSha256: string;
  name: string;
  description?: string;
  savedAt?: string;
  requestCount?: number;
  parameters?: PlanParameter[];
  error?: string;
}
export interface AcceptedCatalogTerms {
  index: number;
  scheme?: string;
  network?: string;
  asset?: string;
  payTo?: string;
  amount?: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown> & { paymentFlow?: string };
  [key: string]: unknown;
}
export interface CatalogRow {
  index: number;
  resource: string;
  description: string;
  method: string;
  accepts: AcceptedCatalogTerms[];
  listing: unknown;
}
export interface CatalogView {
  schema: "stellar-forge.sf88.collection-catalog.v1";
  path: string;
  sha256: string;
  bytes: number;
  source: string | null;
  rows: CatalogRow[];
}
export interface EditionInput {
  planId: string;
  planSha256: string;
  collectionId: string;
  name: string;
  values?: Record<string, string>;
}
export interface AcceptedRequestTerms {
  scheme: "exact";
  network: "stellar:testnet" | "stellar:pubnet";
  asset: string;
  payTo: string;
  maxAtomic: string;
  maxTimeoutSeconds?: number;
  paymentFlow?: "authorization" | "upfront";
}
export interface NativeOperation {
  intentId: string;
  url: string;
  method: string;
  expect: AcceptedRequestTerms;
  bodyFile?: string;
  bodyBytes?: number;
  bodySha256?: string;
  headers?: Record<string, string>;
  ticketFile?: string;
  ticketHeader?: string;
  [key: string]: unknown;
}
export interface NativeCollectionPreview {
  schema: "stellar-forge.sf88.collection-preview.v1";
  itemCount: number;
  previewSha256: string;
  items: Array<{
    index: number;
    intentId: string;
    sourceConfig: { path: string; sha256: string; bytes: number };
    operation: NativeOperation;
    responseDestination: string | null;
    body: { sha256: string; bytes: number } | null;
    ticket: Record<string, unknown> | null;
    dependencies: Record<string, unknown>;
  }>;
  totals: Array<{
    network: string;
    asset: string;
    payTo: string;
    scheme: string;
    paymentFlow: string;
    maxAtomic: string;
    itemCount: number;
  }>;
}
export interface PreparedRequest {
  key: string;
  name: string;
  intentId: string;
  configFile: string;
  discovery: {
    path: string;
    sha256: string;
    bytes: number;
    retainedPath: string;
    rowIndex: number;
    acceptIndex: number;
  };
  operator: {
    configFile: string;
    sha256: string;
    actor: string;
    service: string;
    policy: string;
    ledger: string;
    signerModule: string;
    evidenceDir: string;
    workspaceDirectory?: string;
    manifestSha256?: string;
  };
  responseOut: string | null;
  operation: NativeOperation;
  operationTicket: Record<string, unknown> | null;
}
export interface OriginalCollection {
  id: string;
  name: string;
  state: string;
  manifestSha256: string;
  previewSha256: string;
  items: Array<Record<string, unknown> & { intentId: string; state: string }>;
  [key: string]: unknown;
}
export type EditionPhase = "PREPARING" | "PREPARED" | "REVIEW_REQUIRED" | "CREATED";
export interface EditionView {
  schema: "stellar-forge.sf88.collection-edition.v1";
  collectionId: string;
  name: string;
  planId: string;
  planSha256: string;
  values: Record<string, string>;
  createdAt: string;
  editionSha256: string | null;
  phase: EditionPhase;
  preview: NativeCollectionPreview | null;
  requests: PreparedRequest[];
  workspaceByIntent: Record<string, string>;
  collection: OriginalCollection | null;
  issues: Array<{ code: string; key?: string }>;
}
export interface EditionSummary {
  collectionId: string;
  name: string;
  planId?: string;
  planSha256?: string;
  values?: Record<string, string>;
  createdAt?: string;
  editionSha256?: string | null;
  phase: EditionPhase;
  requestCount?: number;
  error?: string;
}
export interface RequestOptions { signal?: AbortSignal }
export interface CreateEditionInput {
  collectionId: string;
  expectedEditionSha256: string;
  expectedPreviewSha256: string;
}
/** Identity and original period retained by a portable plan package. */
export interface PlanPackageOrigin {
  planId: string;
  planSha256: string;
  collectionId: string;
  editionSha256: string;
  createdAt: string;
  values: Record<string, string>;
}
export interface PlanPackageObject {
  sha256: string;
  bytes: number;
}
export interface PlanPackageOperator {
  id: string;
  kind: "workspace" | "configuration";
  path: string;
  configSha256: string;
  manifestSha256?: string;
  actor: string;
  service: string;
}
export interface OperationTicketMetadata {
  schema: string;
  operationKey: string;
  requestHash: string;
  expiresAt: number;
  requestHeader: string;
  sha256: string;
  bytes: number;
  expired?: boolean;
}
export interface PlanPackageHeader {
  name: string;
  kind: "included" | "local";
  credential: boolean;
}
export interface PlanPackageSource {
  key: string;
  operatorGroup: string;
  catalog: PlanPackageObject;
  body?: PlanPackageObject;
  ticket?: { required: true; metadata: OperationTicketMetadata };
  headers: PlanPackageHeader[];
}
export interface PlanPackageManifest {
  schema: "stellar-forge.sf88.collection-plan-package.v1";
  origin: PlanPackageOrigin;
  /** Portable placeholders replace sender input, operator and ticket file bindings. */
  plan: CollectionPlan & { parameters: PlanParameter[] };
  planSha256: string;
  operators: PlanPackageOperator[];
  sources: PlanPackageSource[];
  objects: PlanPackageObject[];
}
export interface PlanPackageObjectStatus extends PlanPackageObject {
  receivedBytes: number;
  complete: boolean;
}
export interface PlanPackageStatus {
  schema: "stellar-forge.sf88.collection-plan-package-status.v1";
  packageSha256: string;
  manifest: PlanPackageManifest;
  phase: "RECEIVING" | "READY";
  objects: PlanPackageObjectStatus[];
  receivedBytes: number;
  totalBytes: number;
}
export interface PlanPackageChunkReceipt {
  schema: "stellar-forge.sf88.collection-plan-package-chunk.v1";
  packageSha256: string;
  objectSha256: string;
  /** Complete object's size, not this chunk's size. */
  bytes: number;
  receivedBytes: number;
  complete: boolean;
}
export interface PlanPackageSummary {
  packageSha256: string;
  planId: string;
  name: string;
  sourceCollectionId: string;
  requestCount: number;
  phase: PlanPackageStatus["phase"];
  receivedBytes: number;
  totalBytes: number;
}
export interface PlanPackageFile {
  path: string;
  name: string;
  bytes: number;
  sha256: string;
  packageSha256: string;
  manifest: PlanPackageManifest;
  downloadUrl?: string;
}
export interface PlanPackageExportInput {
  collectionId: string;
  expectedEditionSha256: string;
  /** Explicitly include selected noncredential custom headers by request key. */
  headerSelections?: Array<{ key: string; names: string[] }>;
}
export type AdoptionOperatorBinding = OperatorBinding & { groupId: string };
export interface AdoptionRequestBinding {
  key: string;
  ticketFile?: string;
  headers?: Record<string, string>;
  omitHeaders?: string[];
}
export interface PlanAdoptionInput {
  packageSha256: string;
  planId: string;
  name: string;
  description?: string;
  operatorBindings: AdoptionOperatorBinding[];
  requestBindings?: AdoptionRequestBinding[];
  outputDirectory: string;
  deliveryParameter: string;
  deliveryValue: string;
}
export interface PlanAdoptionSource {
  key: string;
  operatorGroup: string;
  sourceCollectionId: string;
  sourceIntentId: string;
  catalog: PlanPackageObject;
  body?: PlanPackageObject;
  discoveryFile: string;
  bodyFile?: string;
}
export interface PlanAdoptionOperator {
  key: string;
  configFile: string;
  configSha256: string;
  manifestSha256?: string;
  expect: AcceptedRequestTerms;
  ticket: OperationTicketMetadata | null;
  responseOut: string;
}
export interface PlanAdoptionReview {
  reviewSha256: string;
  plan: CollectionPlan & { parameters: PlanParameter[] };
  packageSha256: string;
  origin: PlanPackageOrigin;
  operators: PlanAdoptionOperator[];
  sourceMap: PlanAdoptionSource[];
}
export interface PlanAdoptionRecord extends PlanAdoptionReview {
  schema: "stellar-forge.sf88.collection-plan-adoption.v1";
  planId: string;
  planSha256: string;
  savedAt: string;
}
export interface CollectionPlanSharingClient {
  listPackages(options?: RequestOptions): Promise<{
    schema: "stellar-forge.sf88.collection-plan-packages.v1";
    packages: PlanPackageSummary[];
  }>;
  exportPackage(input: PlanPackageExportInput, options?: RequestOptions): Promise<PlanPackageFile>;
  receiveManifest(input: { manifest: PlanPackageManifest }, options?: RequestOptions): Promise<PlanPackageStatus>;
  inspectPackage(input: { packageSha256: string }, options?: RequestOptions): Promise<PlanPackageStatus>;
  receiveChunk(input: {
    packageSha256: string;
    objectSha256: string;
    offset: number;
    base64: string;
  }, options?: RequestOptions): Promise<PlanPackageChunkReceipt>;
  finishReceiving(input: { packageSha256: string }, options?: RequestOptions): Promise<PlanPackageStatus>;
  packageFile(input: { packageSha256: string }, options?: RequestOptions): Promise<PlanPackageFile>;
  /** Authenticated GET. Stream response.body or use response.arrayBuffer() as appropriate. */
  downloadPackage(input: { packageSha256: string }, options?: RequestOptions): Promise<Response>;
  reviewAdoption(input: PlanAdoptionInput, options?: RequestOptions): Promise<PlanAdoptionReview>;
  adoptPlan(input: PlanAdoptionInput & { expectedReviewSha256: string }, options?: RequestOptions): Promise<{
    saved: SavedPlan;
    adoption: PlanAdoptionRecord;
  }>;
}

export interface CollectionComposerClient {
  readonly origin: string;
  readonly sharing: CollectionPlanSharingClient;
  listPlans(options?: RequestOptions): Promise<{
    schema: "stellar-forge.sf88.collection-plans.v1";
    directory: string;
    plans: PlanSummary[];
  }>;
  inspectPlan(input: { id: string; planSha256: string }, options?: RequestOptions): Promise<SavedPlan>;
  savePlan(input: { plan: CollectionPlan }, options?: RequestOptions): Promise<SavedPlan>;
  inspectCatalog(input: { path: string }, options?: RequestOptions): Promise<CatalogView>;
  listEditions(options?: RequestOptions): Promise<{
    schema: "stellar-forge.sf88.collection-editions.v1";
    directory: string;
    editions: EditionSummary[];
  }>;
  inspectEdition(input: { collectionId: string }, options?: RequestOptions): Promise<EditionView>;
  prepareEdition(input: EditionInput, options?: RequestOptions): Promise<EditionView>;
  createEdition(input: CreateEditionInput, options?: RequestOptions): Promise<EditionView>;
}
export declare function createCollectionComposerClient(options: {
  url: string;
  fetch?: typeof globalThis.fetch;
}): CollectionComposerClient;
