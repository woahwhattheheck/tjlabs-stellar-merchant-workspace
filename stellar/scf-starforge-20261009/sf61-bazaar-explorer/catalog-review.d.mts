// SPDX-License-Identifier: MIT
import type { CaptureFilters, OriginalListing } from './workspace.mjs';
export const CATALOG_REVIEW_SCHEMA: 'stellar-forge.sf61.catalog-review.v1';
export const CATALOG_REVIEW_LIMITS: Readonly<{ pageBytes: number; packetBytes: number; rows: number }>;
export interface CatalogReviewSource {
  pageFile: 'page-000000.json';
  pageSha256: string;
  bytes: number;
  rows: number;
  sourceUrl: string | null;
  capturedAt: string | null;
  pageText: string;
}
export interface CatalogReviewPacket {
  schema: typeof CATALOG_REVIEW_SCHEMA;
  packetId: string;
  label: string;
  source: CatalogReviewSource;
  selection: { row: number; acceptIndex: number; catalogKey: string | null };
  search: { query: string; filters: CaptureFilters };
}
export interface CatalogReviewCoverage {
  receivedRows: number;
  reportedTotal: number | null;
  offset: number | null;
  partialResults: boolean | null;
  allReportedRowsPresent: boolean | null;
}
export interface InspectedCatalogReview {
  packet: CatalogReviewPacket;
  text: string;
  bytes: number;
  sha256: string;
  listing: OriginalListing;
  acceptedTerms: Record<string, unknown>;
  rank: number | null;
  coverage?: CatalogReviewCoverage;
}
export interface CatalogReviewSummary {
  schema: typeof CATALOG_REVIEW_SCHEMA;
  packetId: string;
  label: string;
  bytes: number;
  sha256: string;
  source: Omit<CatalogReviewSource, 'pageText'>;
  selection: CatalogReviewPacket['selection'];
  search: CatalogReviewPacket['search'];
  rank: number | null;
  coverage: CatalogReviewCoverage | null;
  listing: OriginalListing;
  acceptedTerms: Record<string, unknown>;
}
export interface CatalogReviewPage {
  source: CatalogReviewSource;
  coverage: CatalogReviewCoverage;
  search(input?: { query?: string; filters?: CaptureFilters; page?: number; pageSize?: number }): {
    request: { query: string; filters: CaptureFilters; page: number; pageSize: number };
    order: 'relevance' | 'source'; total: number; indexedRows: number; unindexedRows: number;
    source: Omit<CatalogReviewSource, 'pageText'>; coverage: CatalogReviewCoverage;
    offers: Array<{ pageFile: string; pageSha256: string; row: number; catalogKey: string | null;
      searchable: boolean; rank: number | null; listing: OriginalListing; matchingAcceptIndexes: number[];
      indexingError?: { code: string; message: string } }>;
    nextPage: number | null;
  };
  createSelection(input: { row: number; acceptIndex: number; query?: string; filters?: CaptureFilters; label: string }): Promise<InspectedCatalogReview>;
}
export function openCatalogReviewPage(input: { pageText: string; sourceUrl?: string | null;
  capturedAt?: string | null; expectedSha256?: string | null }): Promise<CatalogReviewPage>;
export function inspectCatalogReview(text: string): Promise<InspectedCatalogReview>;
export function catalogReviewSummary(review: InspectedCatalogReview): CatalogReviewSummary;
