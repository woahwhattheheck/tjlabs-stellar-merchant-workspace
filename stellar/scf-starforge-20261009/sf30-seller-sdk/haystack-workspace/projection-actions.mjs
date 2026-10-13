const s = { type: "string" }, n = { type: "integer", minimum: 0 };
const revision = { expectedRevision: n }, mutation = { ...revision, operationId: s };
const paging = { offset: n, limit: { type: "integer", minimum: 1, maximum: 250 } };
const saved = { projectionId: s, expectedHeadId: s }, selection = { modelId: s, versionId: s, profile: {} };
const author = { author: s, note: s };
const bindings = { type: "array", items: { type: "object", properties: { entityId: s, rowIndex: n }, required: ["entityId", "rowIndex"], additionalProperties: false } };
const incoming = { name: s, base64: s, bindings, consumerReference: s };
const decisions = { type: "array", items: { type: "object", properties: { entityId: s, decision: { enum: ["keep", "adopt"] } }, required: ["entityId", "decision"], additionalProperties: false } };
export const projectionDefinitions = [
  ["projection.list", "Page complete typed-grid projection projects and their exact current review state.", { ...revision, ...paging }, ["expectedRevision"], false],
  ["projection.read", "Read the whole saved projection, per-cell original source lineage, version history, reviews, native publications and received corrections.", { ...revision, projectionId: s, versionId: s }, ["expectedRevision", "projectionId"], false],
  ["projection.preview", "Preview deliberate model/source-column conversions into a typed Haystack JSON v4 grid without changing the original source.", { ...revision, ...selection }, ["expectedRevision", "modelId", "versionId", "profile"], false],
  ["projection.create", "Save the complete first immutable projection of an exact retained semantic model version.", { ...mutation, ...selection, ...author, projectionId: s }, ["operationId", "expectedRevision", "modelId", "versionId", "profile", "author"], true],
  ["projection.save", "Save the complete revised mapping against its opened projection head, preserving every earlier original version.", { ...mutation, ...saved, ...selection, ...author }, ["operationId", "expectedRevision", "projectionId", "expectedHeadId", "modelId", "versionId", "profile", "author"], true],
  ["projection.review", "Record ready or changes for the exact saved typed grid; ready requires resolved structural and semantic errors.", { ...mutation, ...saved, ...author, decision: { enum: ["ready", "changes"] } }, ["operationId", "expectedRevision", "projectionId", "expectedHeadId", "decision", "author", "note"], true],
  ["projection.publish", "Add the exact reviewed derived grid to the original native source store without sending it to a station or external consumer.", { ...mutation, ...saved, ...author, select: { type: "boolean" } }, ["operationId", "expectedRevision", "projectionId", "expectedHeadId", "author", "note", "select"], true],
  ["projection.compare", "Page complete entity and typed-cell differences between two retained projection versions.", { ...revision, ...paging, projectionId: s, beforeVersionId: s, afterVersionId: s }, ["expectedRevision", "projectionId", "beforeVersionId", "afterVersionId"], false],
  ["projection.return.preview", "Compare an actual complete returned JSON v4 grid through explicit one-to-one original entity/row bindings.", { ...revision, projectionId: s, versionId: s, ...incoming }, ["expectedRevision", "projectionId", "name", "base64", "bindings"], false],
  ["projection.return.apply", "Retain the complete returned grid and explicit keep/adopt decisions as a new source-bound projection version, preserving the original consumer record reference.", { ...mutation, ...saved, ...incoming, ...author, expectedReturnSha256: s, decisions }, ["operationId", "expectedRevision", "projectionId", "expectedHeadId", "name", "base64", "bindings", "consumerReference", "expectedReturnSha256", "decisions", "author", "note"], true]
];
