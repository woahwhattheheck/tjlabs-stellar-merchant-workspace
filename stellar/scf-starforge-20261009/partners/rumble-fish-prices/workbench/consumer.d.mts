export type Currency = 'USD' | 'XLM';
export interface ConsumerPosition { asset: string; quantity: string; label?: string }
export interface ConsumerQuality { maxAgeSeconds: number; allowCarried: boolean; allowOlder: boolean; allowUnknown: boolean }
export interface ConsumerConfiguration { name: string; customerReference: string; currency: Currency; positions: Required<ConsumerPosition>[]; quality: ConsumerQuality }
export type ConsumerConfigurationInput = { name: string; customerReference?: string; currency?: Currency; positions: ConsumerPosition[]; quality?: Partial<ConsumerQuality> };
export interface ConsumerBook {
  schema: 'tjlabs.prices-workbench.consumer-book.v1'; id: string; consumerId: string; workspaceId: string;
  revision: number; createdAt: string; sha256: string;
  previousBook: { id: string; sha256: string } | null; configuration: ConsumerConfiguration;
}
export interface ConsumerSourceTask {
  runId: string; taskId: string; kind: 'batch' | 'price'; taskState: string; attemptId: string | null;
  receivedAt: string | null; status: number | null; request: Record<string, unknown>;
  response: { sha256: string; bytes: number } | null;
}
export interface ConsumerRow extends Required<ConsumerPosition> {
  currency: Currency; priceField: 'price_usd' | 'price_xlm'; unitPrice: string | null; value: string | null;
  availability: 'valued' | 'unavailable'; flags: { code: string; message: string; blocking: boolean }[];
  ageSeconds: number | null; asOf: string | null; updatedAt: string | null; priceStatus: string | null;
  method: string | null; source: ConsumerSourceTask | null; providerPrice: Record<string, unknown> | null;
}
export interface ConsumerTotals { currency: Currency; positions: number; valuedPositions: number; unavailablePositions: number; complete: boolean; pricedSubtotal: string; total: string | null }
export interface ConsumerComparisonRow {
  asset: string; status: 'added' | 'removed' | 'currency_changed' | 'became_available' | 'became_unavailable' | 'value_unchanged' | 'value_changed';
  previousQuantity: string | null; quantity: string | null; previousValue: string | null; value: string | null;
  quantityDelta: string | null; priceDelta: string | null; valueDelta: string | null;
  quantityEffect: string | null; priceEffect: string | null; observationChanged: boolean; qualityChanged: boolean;
  previousAsOf: string | null; asOf: string | null;
}
export interface ConsumerComparison {
  previousEditionId: string; previousEditionSha256: string; sameCurrency: boolean;
  previousCurrency: Currency; currency: Currency; totalDelta: string | null;
  comparableValueDelta: string | null; comparedValuedPositions: number; rows: ConsumerComparisonRow[];
}
export interface ConsumerEdition {
  schema: 'tjlabs.prices-workbench.consumer-edition.v1'; id: string; consumerId: string; workspaceId: string;
  operationId: string; inputSha256: string; name: string; note: string; createdAt: string;
  bookId: string; bookSha256: string; bookRevision: number; customerReference: string; currency: Currency;
  quality: ConsumerQuality; previousEditionId: string | null; contractSha256: string;
  rows: ConsumerRow[]; totals: ConsumerTotals; comparison: ConsumerComparison | null; sha256: string;
  source: { runId: string; planId: string; planSha256: string; runState: string; providerOrigin: string;
    selectedRunCreatedAt: string; firstReceivedAt: string | null; lastReceivedAt: string | null;
    selection: 'only-this-retained-run'; tasks: ConsumerSourceTask[] };
}
export interface ConsumerEditionSummary { id: string; sha256: string; name: string; createdAt: string; bookRevision: number; sourceRunId: string; currency: Currency; totals: ConsumerTotals; previousEditionId: string | null }
export interface ConsumerReview { schema: 'tjlabs.prices-workbench.consumer-review.v1'; id: string; consumerId: string; workspaceId: string; editionId: string; editionSha256: string; decision: 'publish' | 'reject'; reviewedBy: string; note: string; createdAt: string; sha256: string }
export interface ConsumerState {
  schema: 'tjlabs.prices-workbench.consumer.v1'; workspaceId: string; consumerId: string; revision: number;
  createdAt: string; updatedAt: string; book: ConsumerBook; editions: ConsumerEditionSummary[];
  publishedEditionId: string | null; reviews: ConsumerReview[];
}
export interface ConsumerSummary { consumerId: string; name: string; customerReference: string; currency: Currency; revision: number; bookRevision: number; positions: number; editions: number; latestEdition: ConsumerEditionSummary | null; publishedEditionId: string | null; updatedAt: string }
export interface ConsumerValues {
  schema: 'tjlabs.prices-workbench.consumer-values.v1'; consumerId: string; workspaceId: string;
  customerRevision: number; publicationState: 'published' | 'saved-edition'; currentBookMatches: boolean;
  book: ConsumerBook; edition: ConsumerEdition; review: ConsumerReview | null; sha256: string;
}
export interface ConsumerCsv { filename: string; contentType: 'text/csv; charset=utf-8'; content: string }
export interface CreateConsumerEditionInput { consumerId: string; expectedRevision: number; sourceRunId: string; name?: string; note?: string; operationId: string }
export interface ReviewConsumerEditionInput { consumerId: string; expectedRevision: number; editionId: string; decision: 'publish' | 'reject'; reviewedBy: string; note?: string }
export interface WalletState {
  schema: 'tjlabs.prices-workbench.wallet-values.v1'; consumerId: string; sourceWorkspaceId: string;
  createdAt: string; updatedAt: string; currentSourceRevision: number;
  receipts: { sourceRevision: number; sourceSha256: string; receivedAt: string; feed: ConsumerValues }[];
  sha256: string;
}
export interface WalletView {
  consumerId: string; customerName: string; customerReference: string; sourceWorkspaceId: string;
  sourceRevision: number; editionId: string; editionSha256: string; evaluatedAt: string;
  currentBookMatches: boolean; currency: Currency; positions: ConsumerRow[]; totals: ConsumerTotals;
  comparison: ConsumerComparison | null; review: ConsumerReview | null; receivedEditions: number;
}
export const CONSUMER_SCHEMA: 'tjlabs.prices-workbench.consumer.v1';
export const EDITION_SCHEMA: 'tjlabs.prices-workbench.consumer-edition.v1';
export const VALUES_SCHEMA: 'tjlabs.prices-workbench.consumer-values.v1';
export function normalizeConsumerBook(input: ConsumerConfigurationInput): ConsumerConfiguration;
export function addDecimal(left: string, right: string): string;
export function subtractDecimal(left: string, right: string): string;
export function multiplyDecimal(left: string, right: string): string;
export function compareConsumerEditions(previous: ConsumerEdition | null, current: ConsumerEdition): ConsumerComparison | null;
export function verifyConsumerValues(input: ConsumerValues): ConsumerValues;
export function consumerCsv(input: ConsumerValues): string;
