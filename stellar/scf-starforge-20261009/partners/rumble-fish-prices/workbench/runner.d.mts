import type { ConsumerConfigurationInput, ConsumerSummary, ConsumerState, ConsumerEdition, ConsumerValues, ConsumerCsv, CreateConsumerEditionInput, ReviewConsumerEditionInput, ConsumerReview } from './consumer.mjs';
export type AssetIdentifier = string;
export type Granularity = '1m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1M';
export type Timeframe = '1h' | '24h' | '7d' | '30d' | '1y' | 'all';
export interface CatalogSettings {
  type: 'all' | 'classic' | 'soroban'; search: string;
  sort: 'volume_24h' | 'price' | 'change_24h' | 'code'; order: 'desc' | 'asc'; limit: number;
  min_volume_usd?: number;
}
export interface HistorySettings {
  timeframe: Timeframe; granularity?: Granularity; base_currency: 'USD' | 'XLM'; start?: string; end?: string;
}
export interface Configuration {
  name: string; baseUrl: string; assetIdentifiers: AssetIdentifier[];
  catalog: CatalogSettings; history: HistorySettings; priceMinVolumeUsd: number | null;
  requestIntervalMs: number; maxRequestsPerRun: number; maxRetries: number;
  requestTimeoutMs: number; freshnessSeconds: number;
}
export type ConfigurationInput = Partial<Omit<Configuration, 'catalog' | 'history'>> & { catalog?: Partial<CatalogSettings>; history?: Partial<HistorySettings> };
export interface Workspace {
  id: string; revision: number; name: string; configuration: Configuration;
  createdAt: string; updatedAt: string; contractSha256: string;
}
export type PlanSpecification =
  | { kind: 'catalog'; name?: string; catalog?: Partial<CatalogSettings>; maxPages?: number; cursor?: string }
  | { kind: 'collection'; name?: string; assets?: AssetIdentifier[]; operations?: ('batch' | 'price' | 'detail' | 'history' | 'oracles')[]; history?: Partial<HistorySettings> }
  | { kind: 'coverage' | 'health'; name?: string };
export type RequestKind = 'catalog' | 'batch' | 'price' | 'detail' | 'history' | 'oracles' | 'coverage' | 'health';
export interface NativeRequest { method: 'GET' | 'POST'; path: string; query: Record<string, string | number>; body?: { assets: AssetIdentifier[] } }
export interface PlanTask { id: string; kind: RequestKind; request: NativeRequest; asset?: string; page?: number; window?: number; windows?: number }
export interface PlanSummary {
  id: string; planId: string; name: string; kind: 'catalog' | 'collection' | 'coverage' | 'health'; createdAt: string;
  requestCount: number; requestMaximum: number; notices: string[]; specification: Record<string, unknown>;
}
export interface Plan extends PlanSummary { schema: 'tjlabs.prices-workbench.plan.v1'; configuration: Configuration; tasks: PlanTask[]; sha256: string }
export type RunStatus = 'RUNNING' | 'RETRY_WAIT' | 'PAUSED' | 'QUOTA_WAIT' | 'KEY_REQUIRED' | 'INTERRUPTED' | 'COMPLETE' | 'COMPLETED_WITH_ERRORS';
export interface RunIssue { code: string; message: string; resetAt?: string; budget?: number; providerCode?: string }
export interface TaskSummary {
  id: string; kind: RequestKind; asset?: string; state: 'PENDING' | 'RUNNING' | 'COMPLETE' | 'ERROR';
  page?: number; window?: number; windows?: number; attemptCount: number; status: number | null;
  receivedAt: string | null; hasResponse: boolean; summary: Record<string, unknown> | null;
}
export interface Run {
  id: string; planId: string; name: string; kind: PlanSummary['kind']; status: RunStatus;
  createdAt: string; updatedAt: string; finishedAt: string | null;
  completedCount: number; errorCount: number; attemptCount: number; taskCount: number;
  nextRequestAt: string | null; lastIssue: RunIssue | null; tasks: TaskSummary[];
}
export interface SourceQuote { price: string; volume_24h: string }
export interface Price {
  asset: string; price_usd: string; price_xlm: string; vwap_24h: string; volume_24h_usd: string;
  change_24h_pct: string; sources: Record<string, SourceQuote>; updated_at: string; as_of: string;
  price_status: string; method: string; price_basis?: string;
}
export interface RetainedReference { runId: string; taskId: string; receivedAt: string | null }
export interface Freshness { ageSeconds: number | null; freshness: 'unpriced' | 'unknown' | 'within_target' | 'older_than_target' }
export type SavedPrice = Price & RetainedReference & Freshness;
export interface CatalogRow extends RetainedReference, Freshness {
  identifier: string | null; asset_code: string; asset_type: string; issuer_address: string; contract_address: string;
  home_domain: string; price_usd: string; change_24h_pct: string; change_7d_pct: string; volume_24h_usd: string;
  vwap_24h: string; sources: Record<string, SourceQuote>; updated_at: string; as_of: string; price_status: string; method: string; price_basis?: string;
}
export interface Candle {
  timestamp: string; open: string | null; high: string | null; low: string | null; close: string | null;
  volume_base: string; volume_quote_usd: string; vwap: string | null; trade_count: number;
  method: string | null; derived: boolean | null; pf_trade_count?: number | null; pf_vwap?: string | null;
  close_divergent?: boolean | null; source?: string | null; quality?: string | null;
}
export interface HistorySummary extends RetainedReference {
  asset: string; granularity: Granularity; base_currency: 'USD' | 'XLM'; rows: number; pricedRows: number; nullPriceRows: number;
  derivedRows: number; divergentRows: number; noPriceFormingTradeRows: number; firstTimestamp: string | null; lastTimestamp: string | null;
  gapsBetweenReturnedBuckets: number; emptyBucketIntervals: number; invalidTimestamps: number;
  methodCounts: Record<string, number>; qualityCounts: Record<string, number>; sourceCounts: Record<string, number>;
  backfill_note?: string; request: NativeRequest; window: number; windows: number;
}
export interface Snapshot {
  schema: 'tjlabs.prices-workbench.snapshot.v1'; workspace: Workspace;
  access: { keyConfigured: boolean; baseUrl: string; boundOrigin: string };
  runtime: { state: RunStatus | 'PAUSING' | 'IDLE' | 'CLOSED'; activeRunId: string | null; nextRequestAt: string | null; lastIssue: RunIssue | null };
  plans: PlanSummary[]; runs: Run[]; consumers: ConsumerSummary[];
  catalog: ({ rows: CatalogRow[]; cursor: string | null; hasMore: boolean; filters: Partial<CatalogSettings> } & RetainedReference) | null;
  prices: SavedPrice[]; histories: HistorySummary[]; details: (Record<string, unknown> & RetainedReference)[];
  oracles: ({ asset: string; oracles: { name: string; price_usd: string; updated_at: string }[] } & RetainedReference)[];
  coverage: ({ data: Record<string, unknown> } & RetainedReference) | null;
  usage: { workspaceAttempts: number; month: string; monthAttempts: number; monthlyProviderLimit: 100000; scope: 'this workspace' };
}
export interface JsonResult {
  runId: string; taskId: string; kind: RequestKind; request: NativeRequest; status: number; receivedAt: string;
  sha256: string; headers: Record<string, string>; summary: Record<string, unknown> | null; attemptId: string;
  data: unknown; rawText: string;
}
export interface CsvResult { filename: string; contentType: 'text/csv; charset=utf-8'; content: string; summary: Record<string, unknown> | null }
export interface ExportFile { path: string; encoding: 'base64'; bytes: number; sha256: string; content: string }
export interface Workbench {
  snapshot(): Promise<Snapshot>;
  save(input: { expectedRevision: number; configuration: ConfigurationInput }): Promise<Workspace>;
  plan(specification: PlanSpecification): Promise<Plan>;
  getPlan(input: { planId: string }): Promise<Plan>;
  start(input: { planId: string }): Promise<Run>;
  pause(): Promise<Run | null>;
  resume(input: { runId: string }): Promise<Run>;
  result(input: { runId: string; taskId: string; format?: 'json' }): Promise<JsonResult>;
  result(input: { runId: string; taskId: string; format: 'csv' }): Promise<CsvResult>;
  consumers(): Promise<ConsumerSummary[]>;
  consumer(input: { consumerId: string }): Promise<ConsumerState>;
  saveConsumer(input: { consumerId: string; expectedRevision: number; configuration: ConsumerConfigurationInput }): Promise<ConsumerState>;
  consumerEdition(input: { consumerId: string; editionId: string }): Promise<ConsumerEdition>;
  createConsumerEdition(input: CreateConsumerEditionInput): Promise<{ replayed: boolean; consumer: ConsumerState; edition: ConsumerEdition }>;
  reviewConsumerEdition(input: ReviewConsumerEditionInput): Promise<{ consumer: ConsumerState; review: ConsumerReview }>;
  consumerOutput(input: { consumerId: string; editionId?: string; format?: 'json' }): Promise<ConsumerValues>;
  consumerOutput(input: { consumerId: string; editionId?: string; format: 'csv' }): Promise<ConsumerCsv>;
  /** Pauses the active run, retains the complete response, and exports one coherent saved state. */
  exportState(): Promise<{ workspaceId: string; revision: number; files: ExportFile[] }>;
  close(): Promise<void>;
}
export function openWorkbench(options: { directory: string; create?: boolean; configuration?: ConfigurationInput; apiKey?: string; fetchImpl?: typeof fetch }): Promise<Workbench>;
