import type { Json, Revision, Mutation, Envelope, Outcome, Paging, Page, Source } from "./client.mjs";
import type { SemanticSourceRef } from "./semantic-types.mjs";
export type ProjectionSource =
  { kind: "entity"; field: "id" | "name" | "label" | "kind" } |
  { kind: "cell"; intakeId: string; column: number } |
  { kind: "native"; sourceId: string; tag: string } |
  { kind: "attribute"; predicate: string } |
  { kind: "relation"; predicate: string; multiple: boolean } |
  { kind: "constant"; value: Json };
export interface ProjectionConversion {
  kind: "preserve" | "string" | "number" | "boolean" | "marker" | "ref" | "date" | "time" | "dateTime" | "uri" | "symbol" | "json";
  blank: "omit" | "null" | "error" | "keep"; trim: boolean;
  unit?: string; prefix?: string; tz?: string; trueValues?: string[]; falseValues?: string[]; markerValues?: string[];
}
export interface ProjectionColumn { tag: string; source: ProjectionSource; conversion: ProjectionConversion; meta?: Record<string, Json> }
export type ProjectionOverride = { entityId: string; tag: string } & ({ present: false } | { present?: true; value: Json });
export interface ProjectionProfile {
  title: string; description: string; entityIds: string[]; columns: ProjectionColumn[];
  overrides: ProjectionOverride[]; meta?: Record<string, Json>;
}
export interface ProjectionDiagnostic {
  severity: "error" | "warning" | "info"; code: string; message: string; entityId?: string; tag?: string;
  scope?: string; [name: string]: unknown;
}
export interface ProjectionCell {
  tag: string; present: boolean; value?: Json; origin: Record<string, unknown>; issue?: ProjectionDiagnostic;
}
export interface ProjectionRow { entityId: string; rowIndex: number; sourceRefs: SemanticSourceRef[]; cells: ProjectionCell[] }
export interface ProjectionGrid {
  _kind: "grid"; meta: Record<string, Json>; cols: Array<{ name: string; meta?: Record<string, Json> }>; rows: Array<Record<string, Json>>;
}
export interface ProjectionCounts { rows: number; columns: number; errors: number; warnings: number; sourceRows: number }
export interface ProjectionPreview {
  profile: ProjectionProfile; modelId: string; modelVersionId: string; modelContentSha256: string; contextId: string;
  grid: ProjectionGrid; gridSha256: string; rows: ProjectionRow[]; diagnostics: ProjectionDiagnostic[];
  canPublish: boolean; counts: ProjectionCounts; contentSha256: string;
}
export interface ProjectionProject { id: string; headId: string; createdAt: string; createdBy: string }
export interface ProjectionVersion {
  id: string; format: "commons.haystack.projection-version.v1"; projectionId: string; parents: string[];
  createdAt: string; author: string; note: string; provenance: { returnId: string; originalSourceSha256: string } | null;
}
export interface ProjectionReview {
  id: string; format: "commons.haystack.projection-review.v1"; projectionId: string; versionId: string;
  gridSha256: string; decision: "ready" | "changes"; author: string; note: string; reviewedAt: string;
}
export interface ProjectionPublication {
  id: string; format: "commons.haystack.projection-publication.v1"; projectionId: string; versionId: string; reviewId: string;
  sourceId: string; bytes: number; author: string; note: string; publishedAt: string; selected: boolean;
}
export interface ProjectionBinding { entityId: string; rowIndex: number }
export interface ProjectionReturnDecision { entityId: string; decision: "keep" | "adopt" }
export interface ProjectionReturnSource { name: string; bytes: number; sha256: string; format: "json-v4" }
export interface ProjectionReturnReceipt {
  id: string; format: "commons.haystack.projection-return.v1"; projectionId: string; beforeVersionId: string; afterVersionId: string;
  returnSha256: string; source: ProjectionReturnSource; base64: string; bindings: ProjectionBinding[];
  consumerReference: string; decisions: ProjectionReturnDecision[]; receivedAt: string; author: string; note: string;
}
export interface ProjectionRead extends ProjectionPreview {
  projection: ProjectionProject; version: ProjectionVersion; history: ProjectionVersion[]; reviews: ProjectionReview[];
  publications: ProjectionPublication[]; returns: ProjectionReturnReceipt[];
}
export interface ProjectionListRow extends ProjectionProject {
  title: string; modelId: string; modelVersionId: string; counts: ProjectionCounts; canPublish: boolean;
  review: ProjectionReview | null; publications: number;
}
export interface ProjectionSaveOutcome {
  projection: ProjectionProject; version: ProjectionVersion; counts: ProjectionCounts; canPublish: boolean;
}
export interface ProjectionDifference { entityId: string; before: ProjectionRow | null; after: ProjectionRow | null; state: "added" | "removed" | "same" | "changed" }
export interface ProjectionReturnRow {
  entityId: string; originalRowIndex: number; incomingRowIndex: number; before: Record<string, Json>; after: Record<string, Json>;
  changes: Array<{ tag: string; before: { present: boolean; value?: Json }; after: { present: boolean; value?: Json } }>;
}
export interface ProjectionReturnPreview {
  projectionId: string; versionId: string; source: ProjectionReturnSource; grid: ProjectionGrid; rows: ProjectionReturnRow[];
  diagnostics: ProjectionDiagnostic[]; changedRows: number; returnSha256: string;
}
export type ProjectionSelection = { modelId: string; versionId: string; profile: ProjectionProfile };
export type ProjectionAuthor = { author: string; note?: string };
export type ProjectionHead = { projectionId: string; expectedHeadId: string };
export type ProjectionIncoming = { name: string; base64: string; bindings: ProjectionBinding[]; consumerReference?: string };
export type ProjectionDeliveryArguments = Mutation & { projectionId: string; versionId?: string } & (
  { kind: "projection-grid"; format?: "json" } |
  { kind: "projection-lineage"; format?: "json" | "csv" } |
  { kind: "projection-report"; format?: "json" | "html" }
);
export interface ProjectionActionMap {
  "projection.list": { args: Revision & Paging; result: Page<ProjectionListRow> };
  "projection.read": { args: Revision & { projectionId: string; versionId?: string }; result: Envelope & ProjectionRead };
  "projection.preview": { args: Revision & ProjectionSelection; result: Envelope & ProjectionPreview };
  "projection.create": { args: Mutation & ProjectionSelection & ProjectionAuthor & { projectionId?: string }; result: Outcome & ProjectionSaveOutcome };
  "projection.save": { args: Mutation & ProjectionHead & ProjectionSelection & ProjectionAuthor; result: Outcome & ProjectionSaveOutcome };
  "projection.review": { args: Mutation & ProjectionHead & { decision: "ready" | "changes"; author: string; note: string }; result: Outcome & { projection: ProjectionProject; review: ProjectionReview } };
  "projection.publish": { args: Mutation & ProjectionHead & { author: string; note: string; select: boolean }; result: Outcome & { projection: ProjectionProject; publication: ProjectionPublication; source: Source } };
  "projection.compare": { args: Revision & Paging & { projectionId: string; beforeVersionId: string; afterVersionId: string }; result: Page<ProjectionDifference> & { beforeVersionId: string; afterVersionId: string; beforeProfile: ProjectionProfile; afterProfile: ProjectionProfile } };
  "projection.return.preview": { args: Revision & ProjectionIncoming & { projectionId: string; versionId?: string }; result: Envelope & ProjectionReturnPreview };
  "projection.return.apply": { args: Mutation & ProjectionHead & ProjectionIncoming & { consumerReference: string; expectedReturnSha256: string; decisions: ProjectionReturnDecision[]; author: string; note: string }; result: Outcome & ProjectionSaveOutcome & { return: ProjectionReturnReceipt } };
}
