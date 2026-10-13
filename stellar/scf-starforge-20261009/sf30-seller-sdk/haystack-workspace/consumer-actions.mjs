// MIT. Consumer receiving uses the original workspace revision and mutation journal.
const s = { type: "string" }, n = { type: "integer", minimum: 0 };
const object = properties => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const list = items => ({ type: "array", items });
const choice = values => ({ enum: values });
const nullable = { anyOf: [s, { type: "null" }] };
const revision = { expectedRevision: n }, mutation = { ...revision, operationId: s };
const paging = { offset: n, limit: { type: "integer", minimum: 1, maximum: 250 } };
const author = { author: s, note: s };
const project = { projectId: s, expectedHeadId: s }, run = { runId: s, expectedRunHeadId: s };
const target = object({ family: s, product: s, version: s, build: s, environment: s, operator: s });
const row = object({ id: s, values: { description: "Complete JSON field/value object. The original domain validates its keys, finite values, nesting and total size." } });
export const consumerPlanSchema = object({
  title: s, projectionId: s, projectionVersionId: s, target,
  interface: object({ format: s, description: s, inputFileIds: list(s), mappingFileIds: list(s) }),
  acceptanceOwner: s,
  questions: list(object({ id: s, label: s, query: s, expected: list(row), expectedEvidenceFileIds: list(s), note: s })),
  boundaryNote: s
});
export const consumerReceivingSchema = object({
  externalOperationId: s, operator: s, startedAt: s, endedAt: s, target,
  outcome: choice(["completed", "failed", "interrupted"]), inputFileIds: list(s), outputFileIds: list(s),
  commandFileId: nullable, stdoutFileId: nullable, stderrFileId: nullable,
  questions: list(object({ questionId: s, status: choice(["observed", "not-run", "failed"]), observed: list(row), outputFileIds: list(s), note: s })),
  projectionReturnId: nullable, note: s
});
const exceptions = list(object({ questionId: s, reason: s }));
export const consumerDefinitions = [
  ["consumer.file.retain", "Retain the complete named original consumer evidence bytes in this workspace, with their content identity.", { ...mutation, name: s, mediaType: s, base64: s, author: s }, ["operationId", "expectedRevision", "name", "mediaType", "base64", "author"], true],
  ["consumer.file.read", "Read an immutable original consumer evidence file in complete content-bound byte ranges.", { fileId: s, offset: n, length: { type: "integer", minimum: 1, maximum: 4194304 } }, ["fileId"], false],
  ["consumer.files.list", "Page every retained consumer evidence file and its exact name, media type, byte count and SHA-256.", { ...revision, ...paging }, ["expectedRevision"], false],
  ["consumer.projects.list", "Page original consumer projects, frozen projection/model bindings and their current acceptance state.", { ...revision, ...paging }, ["expectedRevision"], false],
  ["consumer.project.read", "Read a complete consumer plan, selected target and expected populations, version history, runs and decisions.", { ...revision, projectId: s, versionId: s }, ["expectedRevision", "projectId"], false],
  ["consumer.plan.preview", "Preview the complete independently specified target, input files and acceptance questions before saving a plan.", { ...revision, content: consumerPlanSchema }, ["expectedRevision", "content"], false],
  ["consumer.project.create", "Create an original consumer project bound to an exact retained projection and semantic model version.", { ...mutation, projectId: s, content: consumerPlanSchema, ...author }, ["operationId", "expectedRevision", "content", "author"], true],
  ["consumer.project.save", "Save a complete successor plan at the opened project head while retaining all historical expectations and decisions.", { ...mutation, ...project, content: consumerPlanSchema, ...author }, ["operationId", "expectedRevision", "projectId", "expectedHeadId", "content", "author"], true],
  ["consumer.plan.review", "Freeze a complete plan as ready, or record changes, with the named review and its independent expectation basis.", { ...mutation, ...project, decision: choice(["ready", "changes"]), ...author }, ["operationId", "expectedRevision", "projectId", "expectedHeadId", "decision", "author", "note"], true],
  ["consumer.run.open", "Open one original actual or engineering receiving run against the exact latest ready plan review, optionally linked to a corrected prior run.", { ...mutation, ...project, planReviewId: s, mode: choice(["actual", "engineering"]), supersedesRunId: nullable, runId: s, ...author }, ["operationId", "expectedRevision", "projectId", "expectedHeadId", "planReviewId", "mode", "supersedesRunId", "author"], true],
  ["consumer.run.read", "Read the entire original run, frozen plan/review, observed population and value comparisons, files and review history.", { ...revision, runId: s }, ["expectedRevision", "runId"], false],
  ["consumer.run.preview", "Compare complete original observations against every frozen expected identity and value before receiving them.", { ...revision, ...run, content: consumerReceivingSchema }, ["expectedRevision", "runId", "expectedRunHeadId", "content"], false],
  ["consumer.run.receive", "Receive immutable complete, failed or interrupted observations into the original pending run and retain every comparison.", { ...mutation, ...run, content: consumerReceivingSchema, ...author }, ["operationId", "expectedRevision", "runId", "expectedRunHeadId", "content", "author"], true],
  ["consumer.run.review", "Record named acceptance, explicit per-question exceptions or requested changes for the exact current plan and original run result.", { ...mutation, ...project, ...run, decision: choice(["accept", "accept-exceptions", "changes"]), exceptions, ...author }, ["operationId", "expectedRevision", "projectId", "expectedHeadId", "runId", "expectedRunHeadId", "decision", "exceptions", "author", "note"], true],
  ["consumer.return.preview", "Preview a full original opened-run return with every input, output, observation and customer review before receiving it.", { ...revision, base64: s }, ["expectedRevision", "base64"], false],
  ["consumer.return.apply", "Receive the exact original pending-run return, preserving its frozen plan, complete evidence and customer decisions for the author's subsequent review.", { ...mutation, base64: s, ...run, ...author }, ["operationId", "expectedRevision", "base64", "runId", "expectedRunHeadId", "author", "note"], true]
];
