import type { Json, Revision, Mutation, Paging, Envelope, Outcome, Page, ByteRange } from "./client.mjs";
export interface ConsumerFile { id: string; name: string; mediaType: string; bytes: number; sha256: string }
export interface ConsumerTarget { family: string; product: string; version: string; build: string; environment: string; operator: string }
export interface ConsumerRow { id: string; values: Record<string, Json> }
export interface ConsumerQuestion {
  id: string; label: string; query: string; expected: ConsumerRow[]; expectedEvidenceFileIds: string[]; note: string;
}
export interface ConsumerPlanContent {
  title: string; projectionId: string; projectionVersionId: string; target: ConsumerTarget;
  interface: { format: string; description: string; inputFileIds: string[]; mappingFileIds: string[] };
  acceptanceOwner: string; questions: ConsumerQuestion[]; boundaryNote: string;
}
export interface ConsumerBinding {
  workspaceId: string; projectionId: string; projectionVersionId: string; gridSha256: string;
  projectionContentSha256: string; modelId: string; modelVersionId: string; modelContentSha256: string; contextId: string;
}
export interface ConsumerStamp { author: string; note: string; createdAt: string }
export interface ConsumerProject { id: string; createdAt: string; createdBy: string; headId: string }
export interface ConsumerPlanVersion extends ConsumerStamp {
  id: string; format: "commons.haystack.consumer-plan.v1"; projectId: string; parents: string[];
  content: ConsumerPlanContent; binding: ConsumerBinding;
}
export type ConsumerPlanMetadata = Omit<ConsumerPlanVersion, "content">;
export interface ConsumerFinding { code: string; message: string; questionId?: string }
export interface ConsumerAssessment {
  canReviewReady: boolean; findings: ConsumerFinding[]; questions: number; expectedRows: number;
  currentProjectionHead: string; selectedProjectionIsCurrent: boolean;
}
export interface ConsumerPlanReview extends ConsumerStamp {
  id: string; format: "commons.haystack.consumer-plan-review.v1"; projectId: string; planVersionId: string;
  binding: ConsumerBinding; decision: "ready" | "changes";
}
export interface ConsumerRun {
  id: string; projectId: string; planVersionId: string; planReviewId: string; mode: "actual" | "engineering";
  supersedesRunId: string | null; openedAt: string; openedBy: string; originalSha256: string; headId: string;
}
export interface ConsumerObservedQuestion {
  questionId: string; status: "observed" | "not-run" | "failed"; observed: ConsumerRow[]; outputFileIds: string[]; note: string;
}
export interface ConsumerReceivingContent {
  externalOperationId: string; operator: string; startedAt: string; endedAt: string; target: ConsumerTarget;
  outcome: "completed" | "failed" | "interrupted"; inputFileIds: string[]; outputFileIds: string[];
  commandFileId: string | null; stdoutFileId: string | null; stderrFileId: string | null;
  questions: ConsumerObservedQuestion[]; projectionReturnId: string | null; note: string;
}
export interface ConsumerValueDifference { id: string; key: string; expected: Json; actualPresent: boolean; actual?: Json }
export interface ConsumerQuestionResult {
  questionId: string; status: ConsumerObservedQuestion["status"]; expectedCount: number; observedCount: number;
  expectedIds: string[]; observedIds: string[]; missingIds: string[]; unexpectedIds: string[]; duplicateIds: string[];
  valueDifferences: ConsumerValueDifference[]; matched: boolean; outputFileIds: string[]; note: string;
}
export interface ConsumerResult {
  projectId: string; planVersionId: string; planReviewId: string; runId: string; binding: ConsumerBinding;
  mode: ConsumerRun["mode"]; processOutcome: ConsumerReceivingContent["outcome"]; findings: ConsumerFinding[];
  questions: ConsumerQuestionResult[]; allQuestionsMatched: boolean; technicalMatch: boolean;
  eligibleForAcceptance: boolean; failedQuestionIds: string[];
}
export type ConsumerResultSummary = Pick<ConsumerResult, "processOutcome" | "technicalMatch" | "eligibleForAcceptance" | "failedQuestionIds" | "findings">;
export type ConsumerRunVersion = ConsumerStamp & {
  id: string; format: "commons.haystack.consumer-run-version.v1"; runId: string; parents: string[]; originalRunSha256: string;
} & ({ status: "awaiting-evidence"; content: null; result: null } | { status: "received"; content: ConsumerReceivingContent; result: ConsumerResult });
export interface ConsumerException { questionId: string; reason: string }
export interface ConsumerReview extends ConsumerStamp {
  id: string; format: "commons.haystack.consumer-review.v1"; projectId: string; planVersionId: string; runId: string;
  runVersionId: string; decision: "accept" | "accept-exceptions" | "changes"; exceptions: ConsumerException[];
}
export type ConsumerAcceptance = (ConsumerReview & { current: boolean; status?: "plan-review-reopened" }) |
  { decision: "pending"; current: true; projectId: string; planVersionId: string; runId: string; runVersionId: string };
export interface ConsumerRunSummary extends ConsumerRun { status: ConsumerRunVersion["status"]; result: ConsumerResultSummary | null; latestReview: ConsumerReview | null }
export interface ConsumerProjectSummary extends ConsumerProject {
  title: string; target: ConsumerTarget; binding: ConsumerBinding; questionCount: number; runCount: number; currentAcceptance: ConsumerAcceptance | null;
}
export interface ConsumerReturnReceipt extends ConsumerStamp {
  id: string; format: "commons.haystack.consumer-return-receipt.v1"; projectId: string; runId: string; planVersionId: string;
  beforeRunHeadId: string; incomingRunHeadId: string; packageSha256: string; payloadSha256: string; bytes: number;
  originalFileId: string; customerReviews: ConsumerReview[];
}
export interface ConsumerProjectRead extends Envelope {
  project: ConsumerProject; version: ConsumerPlanVersion; history: ConsumerPlanMetadata[]; planReviews: ConsumerPlanReview[];
  runs: ConsumerRunSummary[]; reviews: ConsumerReview[]; returns: ConsumerReturnReceipt[]; files: ConsumerFile[];
  currentAcceptance: ConsumerAcceptance | null; assessment: ConsumerAssessment;
}
export interface ConsumerRunRead extends Envelope {
  run: ConsumerRun; version: ConsumerRunVersion; history: ConsumerRunVersion[]; planVersion: ConsumerPlanVersion;
  planReview: ConsumerPlanReview; reviews: ConsumerReview[]; result: ConsumerResult | null; files: ConsumerFile[];
}
export interface ConsumerReturnDependency { kind: "projection-return"; id: string; message: string }
export interface ConsumerReturnCapacity {
  canApply: boolean; currentStateBytes: number; projectedStateBytes: number | null; maximumStateBytes: 134217728;
  remainingBytes?: number; includesOriginalEnvelope: true; includesOriginalOperation?: true;
  evidenceLimit: 500; totalFileLimit: 10500; originalEnvelopeBytes?: number; projectedFiles?: number; reason: string | null;
}
export interface ConsumerProjectionEvidence {
  id: string; localDecisionPresent: boolean; authorGridAdoptionRequired: boolean; meaning: string;
}
export interface ConsumerReturnPreview extends Envelope {
  projectId: string; runId: string; expectedRunHeadId: string; incomingRunHeadId: string; planVersionId: string;
  packageSha256: string; bytes: number; alreadyRetained: boolean; result: ConsumerResult;
  customerReviews: ConsumerReview[]; files: ConsumerFile[]; authorAcceptanceRequired: true;
  capacity: ConsumerReturnCapacity; dependencies: ConsumerReturnDependency[]; canApply: boolean;
  projectionEvidence: ConsumerProjectionEvidence | null;
}
export interface ConsumerCounts { projects: number; plans: number; runs: number; files: number; reviews: number; returns: number }
export interface ConsumerAuthor { author: string; note?: string }
export interface ConsumerProjectHead { projectId: string; expectedHeadId: string }
export interface ConsumerRunHead { runId: string; expectedRunHeadId: string }
export type ConsumerDeliveryArguments = Mutation & (
  { kind: "consumer-report"; consumerProjectId: string; format?: "json" | "csv" | "html" } |
  { kind: "consumer-return"; consumerRunId: string }
);
export interface ConsumerActionMap {
  "consumer.file.retain": { args: Mutation & { name: string; mediaType: string; base64: string; author: string }; result: Outcome & { file: ConsumerFile; alreadyRetained: boolean } };
  "consumer.file.read": { args: { fileId: string; offset?: number; length?: number }; result: ByteRange & { fileId?: string } };
  "consumer.files.list": { args: Revision & Paging; result: Page<ConsumerFile> };
  "consumer.projects.list": { args: Revision & Paging; result: Page<ConsumerProjectSummary> };
  "consumer.project.read": { args: Revision & { projectId: string; versionId?: string }; result: ConsumerProjectRead };
  "consumer.plan.preview": { args: Revision & { content: ConsumerPlanContent }; result: Envelope & { content: ConsumerPlanContent; binding: ConsumerBinding; assessment: ConsumerAssessment } };
  "consumer.project.create": { args: Mutation & ConsumerAuthor & { projectId?: string; content: ConsumerPlanContent }; result: Outcome & { project: ConsumerProject; version: ConsumerPlanMetadata; assessment: ConsumerAssessment } };
  "consumer.project.save": { args: Mutation & ConsumerAuthor & ConsumerProjectHead & { content: ConsumerPlanContent }; result: Outcome & { project: ConsumerProject; version: ConsumerPlanMetadata; assessment: ConsumerAssessment } };
  "consumer.plan.review": { args: Mutation & ConsumerProjectHead & { decision: "ready" | "changes"; author: string; note: string }; result: Outcome & { project: ConsumerProject; review: ConsumerPlanReview } };
  "consumer.run.open": { args: Mutation & ConsumerAuthor & ConsumerProjectHead & { planReviewId: string; mode: ConsumerRun["mode"]; supersedesRunId: string | null; runId?: string }; result: Outcome & { run: ConsumerRun; version: ConsumerRunVersion } };
  "consumer.run.read": { args: Revision & { runId: string }; result: ConsumerRunRead };
  "consumer.run.preview": { args: Revision & ConsumerRunHead & { content: ConsumerReceivingContent }; result: Envelope & { run: ConsumerRun; content: ConsumerReceivingContent; result: ConsumerResult } };
  "consumer.run.receive": { args: Mutation & ConsumerAuthor & ConsumerRunHead & { content: ConsumerReceivingContent }; result: Outcome & { run: ConsumerRun; version: { id: string; status: "received" }; result: ConsumerResultSummary } };
  "consumer.run.review": { args: Mutation & ConsumerProjectHead & ConsumerRunHead & { decision: ConsumerReview["decision"]; exceptions: ConsumerException[]; author: string; note: string }; result: Outcome & { project: ConsumerProject; review: ConsumerReview; currentAcceptance: ConsumerAcceptance | null } };
  "consumer.return.preview": { args: Revision & { base64: string }; result: ConsumerReturnPreview };
  "consumer.return.apply": { args: Mutation & ConsumerRunHead & { base64: string; author: string; note: string }; result: Outcome & { run: ConsumerRun; return: ConsumerReturnReceipt } & ({ alreadyRetained: true } | { result: ConsumerResultSummary; authorAcceptanceRequired: true }) };
}
