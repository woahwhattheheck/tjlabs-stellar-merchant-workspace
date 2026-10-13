import type { Envelope, Mutation, Outcome, Revision } from "./client.mjs";

export type VolttronMode = "engineering" | "commissioning";
export interface VolttronTarget {
  product: "VOLTTRON"; version: string; build: string; driverRelease: string;
  interfaceName: "BACnet CSV registry"; documentationUrl: string; environment: string;
  receivingMethod: string; selectionReference: string;
}
export type VolttronColumn = { header: string; sourceIndex: number; constant?: never } |
  { header: string; sourceIndex: null; constant: string; reason: string };
export interface VolttronBinding {
  deviceKey: string; intakeId: string; configurationId: string; registryName: string;
  columns: VolttronColumn[]; omissions: Array<{ sourceIndex: number; reason: string }>;
  approvalReference: string;
}
export interface VolttronProfileContent {
  title: string; buildingReference: string; mode: VolttronMode;
  target: VolttronTarget; bindings: VolttronBinding[];
}
export type VolttronCell = { present: false } | { present: true; value: string };
export interface VolttronCellChange {
  columnIndex: number; before: VolttronCell; after: VolttronCell; rule: string;
  evidence: string; approvedBy?: string; approvalReference?: string;
}
export interface VolttronRowDecision {
  deviceKey: string; rowIndex: number; outcome: "include" | "exclude" | "unresolved";
  reason: string; changes: VolttronCellChange[];
}
export interface VolttronReceivingEvidence {
  mode: "engineering" | "actual"; product: string; version: string; build: string;
  environment: string; operationId: string; startedAt: string; endedAt: string;
  outcome: "passed" | "failed" | "interrupted"; inputManifestSha256: string;
  outputs: Array<{ name: string; base64: string }>;
  observations: Array<{ deviceKey: string; pointName: string; values: Record<string, string>; outputName: string; locator: string }>;
  supersedesReceivingId?: string;
}
export interface VolttronReturnDecision {
  profileId: string; decision: "keep" | "adopt"; expectedLocalHeadId: string | null;
  expectedIncomingHeadId: string;
}
export interface VolttronAuthored { author: string; note?: string }

export interface VolttronProfileHead { id: string; headId: string }
export interface VolttronProfileVersion {
  id: string; format: "commons.haystack.volttron-profile-version.v1"; profileId: string;
  parents: string[]; content: VolttronProfileContent; author: string; note: string; createdAt: string;
}
export interface VolttronFile {
  name: string; mediaType: string; bytes: number; sha256: string; base64: string;
  deviceKey?: string; targetReference?: string | null; kind?: string; sourceSha256?: string;
}
export type VolttronFileMetadata = Omit<VolttronFile, "base64">;
export interface VolttronConfiguration {
  id: string; format: "commons.haystack.volttron-configuration.v1"; name: string; bytes: number;
  sha256: string; base64: string; author: string; note: string; createdAt: string;
}
export interface VolttronConfigurationInspection extends VolttronConfiguration {
  inspection: { value: unknown; issues: Array<{ code: string; path: Array<string | number>; raw?: string }> };
}
export interface VolttronFinding {
  code: string; detail: string; rowId?: string | null; deviceKey?: string; [key: string]: unknown;
}
export interface VolttronReviewRow {
  rowId: string; deviceKey: string; configurationId: string; intakeId: string; sourceSha256: string;
  rowIndex: number; physicalEndLine: number; sourceColumns: string[]; rawCells: string[];
  outcome: "include" | "exclude" | "unresolved"; reason: string;
  changes: Array<VolttronCellChange & { header: string; protectedField: boolean }>;
  cells: VolttronCell[]; values: Record<string, string>;
  lineage: Array<{ targetColumnIndex: number; targetHeader: string; sourceColumnIndex: number | null;
    sourceHeader: string | null; sourceCell: VolttronCell | null; targetCell: VolttronCell }>;
  effectiveDefaults?: Record<string, unknown>;
}
export interface VolttronReview {
  format: "commons.haystack.volttron-review.v1"; profileId: string; profileVersionId: string;
  mode: VolttronMode; target: VolttronTarget; rows: VolttronReviewRow[];
  findings: VolttronFinding[]; advisories: VolttronFinding[];
  expected: Array<{ rowId: string; deviceKey: string; pointName: string | null; values: Record<string, string>; comparisonBasis: string }>;
  files: VolttronFile[]; manifest: VolttronFileMetadata[]; manifestSha256: string;
  counts: { physicalRows: number; included: number; excluded: number; unresolved: number; findings: number; configurations: number };
  targetReady: boolean; configurationChanges: 0;
}
export interface VolttronEdition {
  id: string; format: "commons.haystack.volttron-edition.v1"; profileId: string; profileVersionId: string;
  parentEditionId: string | null; decisions: VolttronRowDecision[]; reviewSha256: string; manifestSha256: string;
  author: string; note: string; createdAt: string;
}
export interface VolttronReceivingResult {
  editionId: string; inputManifestSha256: string; mode: "engineering" | "actual";
  processOutcome: "passed" | "failed" | "interrupted";
  comparisonOutcome: "no_points" | "process_incomplete" | "differences" | "matched";
  missing: Array<Record<string, unknown>>; extra: Array<Record<string, unknown>>;
  duplicates: Array<Record<string, unknown>>; mismatches: Array<Record<string, unknown>>;
  outputs: VolttronFile[]; observedRows: number; expectedRows: number;
  deviceCoverage: Array<{ deviceKey: string; expectedRows: number; observedRows: number }>;
  receivingMatches: boolean;
}
export interface VolttronReceiving {
  id: string; format: "commons.haystack.volttron-receiving.v1"; editionId: string;
  evidence: VolttronReceivingEvidence; result: VolttronReceivingResult;
  author: string; note: string; createdAt: string;
}
export interface VolttronReturn {
  id: string; format: "commons.haystack.volttron-return.v1"; sourcePackageSha256: string;
  outcomes: Array<VolttronReturnDecision & { headId: string }>; author: string; note: string; createdAt: string;
}
export interface VolttronSummary {
  profiles: VolttronProfileHead[]; configurations: Array<Omit<VolttronConfiguration, "base64">>;
  editions: Array<Omit<VolttronEdition, "decisions">>;
  receivings: Array<{ id: string; editionId: string; mode: "engineering" | "actual";
    outcome: "passed" | "failed" | "interrupted"; receivingMatches: boolean; createdAt: string }>;
  returns: VolttronReturn[]; configurationCount: number; versionCount: number;
  editionCount: number; receivingCount: number; returnCount: number;
}
export interface VolttronComparison {
  beforeEditionId: string; afterEditionId: string; profileChanged: boolean;
  rows: Array<{ rowId: string; kind: "added" | "removed" | "changed"; before: VolttronReviewRow | null; after: VolttronReviewRow | null }>;
  counts: { before: VolttronReview["counts"]; after: VolttronReview["counts"] };
  files: { before: VolttronFileMetadata[]; after: VolttronFileMetadata[] };
}
export interface VolttronReturnPreview {
  workspaceId: string; profiles: Array<{ profileId: string; localHeadId: string | null;
    incomingHeadId: string; same: boolean; local: VolttronProfileContent | null; incoming: VolttronProfileContent }>;
  incomingCounts: VolttronSummary;
}

export interface VolttronActionMap {
  "volttron.status": { args: Revision; result: Envelope & VolttronSummary };
  "volttron.configuration.import": { args: Mutation & VolttronAuthored & { name: string; base64: string }; result: Outcome & { configurationId: string; configuration: VolttronConfigurationInspection } };
  "volttron.configuration.read": { args: Revision & { configurationId: string }; result: Envelope & { configuration: VolttronConfigurationInspection } };
  "volttron.profile.template": { args: Revision & { intakeId: string; configurationId: string; deviceKey: string }; result: Envelope & { content: VolttronProfileContent; source: { intakeId: string; sha256: string; columns: string[]; physicalRows: number }; unselected: true } };
  "volttron.profile.save": { args: Mutation & VolttronAuthored & { profileId?: string; expectedHeadId?: string | null; content: VolttronProfileContent }; result: Outcome & { profileId: string; versionId: string; profile: VolttronProfileVersion } };
  "volttron.profile.read": { args: Revision & { profileId: string; versionId?: string }; result: Envelope & { profile: VolttronProfileHead; version: VolttronProfileVersion; history: VolttronProfileVersion[] } };
  "volttron.edition.preview": { args: Revision & { profileId: string; profileVersionId: string; decisions?: VolttronRowDecision[] }; result: Envelope & { review: VolttronReview } };
  "volttron.edition.save": { args: Mutation & VolttronAuthored & { profileId: string; profileVersionId: string; parentEditionId?: string; decisions: VolttronRowDecision[] }; result: Outcome & { editionId: string; edition: VolttronEdition; review: VolttronReview } };
  "volttron.edition.read": { args: Revision & { editionId: string }; result: Envelope & { edition: VolttronEdition; review: VolttronReview; receivings: VolttronReceiving[] } };
  "volttron.edition.compare": { args: Revision & { beforeEditionId: string; afterEditionId: string }; result: Envelope & VolttronComparison };
  "volttron.receiving.record": { args: Mutation & VolttronAuthored & { editionId: string; evidence: VolttronReceivingEvidence }; result: Outcome & { receivingId: string; receiving: VolttronReceiving } };
  "volttron.receiving.read": { args: Revision & { receivingId: string }; result: Envelope & { receiving: VolttronReceiving } };
  "volttron.return.preview": { args: Revision & { base64: string }; result: Envelope & VolttronReturnPreview };
  "volttron.return.apply": { args: Mutation & VolttronAuthored & { base64: string; decisions: VolttronReturnDecision[] }; result: Outcome & { return: VolttronReturn; summary: VolttronSummary } };
}

export type VolttronDeliveryArguments = Mutation & (
  { kind: "volttron-report"; registryEditionId: string; format?: "json" | "csv" | "html" } |
  { kind: "volttron-output"; registryEditionId: string; name: string } |
  { kind: "volttron-receiving-output"; receivingId: string; name: string }
);
