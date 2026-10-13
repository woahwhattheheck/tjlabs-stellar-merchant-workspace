// MIT. VOLTTRON commissioning actions share the original workspace revision and operation journal.
const s = { type: "string" }, n = { type: "integer", minimum: 0 };
const list = items => ({ type: "array", items });
const choice = values => ({ enum: values });
const revision = { expectedRevision: n }, mutation = { ...revision, operationId: s };
const authored = { author: s, note: s };
const nullableHash = { anyOf: [s, { type: "null" }] };
const presence = { anyOf: [
  { type: "object", properties: { present: { enum: [false] } }, required: ["present"], additionalProperties: false },
  { type: "object", properties: { present: { enum: [true] }, value: s }, required: ["present", "value"], additionalProperties: false }
] };
const change = { type: "object", properties: {
  columnIndex: n, before: presence, after: presence, rule: s, evidence: s, approvedBy: s, approvalReference: s
}, required: ["columnIndex", "before", "after", "rule", "evidence"], additionalProperties: false };
const row = { type: "object", properties: {
  deviceKey: s, rowIndex: n, outcome: choice(["include", "exclude", "unresolved"]), reason: s, changes: list(change)
}, required: ["deviceKey", "rowIndex", "outcome", "reason", "changes"], additionalProperties: false };
const returnDecision = { type: "object", properties: {
  profileId: s, decision: choice(["keep", "adopt"]), expectedLocalHeadId: nullableHash, expectedIncomingHeadId: s
}, required: ["profileId", "decision", "expectedLocalHeadId", "expectedIncomingHeadId"], additionalProperties: false };
export const volttronDefinitions = [
  ["volttron.status", "Read all retained registry configurations, profile versions, editions, actual receiving and contractor returns.", revision, ["expectedRevision"], false],
  ["volttron.configuration.import", "Retain a complete original VOLTTRON configuration with its exact file bytes.", { ...mutation, ...authored, name: s, base64: s }, ["operationId", "expectedRevision", "name", "base64", "author"], true],
  ["volttron.configuration.read", "Read one complete retained configuration and its original source identity.", { ...revision, configurationId: s }, ["expectedRevision", "configurationId"], false],
  ["volttron.profile.template", "Prepare explicit source-column mapping from an original native CSV intake and configuration without saving or inferring station acceptance.", { ...revision, intakeId: s, configurationId: s, deviceKey: s }, ["expectedRevision", "intakeId", "configurationId", "deviceKey"], false],
  ["volttron.profile.save", "Save a complete reviewed registry profile at its original head and current workspace revision.", { ...mutation, ...authored, profileId: s, expectedHeadId: nullableHash, content: {} }, ["operationId", "expectedRevision", "content", "author"], true],
  ["volttron.profile.read", "Read a full retained profile and selected immutable version.", { ...revision, profileId: s, versionId: s }, ["expectedRevision", "profileId"], false],
  ["volttron.edition.preview", "Preview every original row and explicit include, exclude or unresolved decision without publishing a registry.", { ...revision, profileId: s, profileVersionId: s, decisions: list(row) }, ["expectedRevision", "profileId", "profileVersionId"], false],
  ["volttron.edition.save", "Save the whole reviewed registry edition, row and cell lineage, exclusions and complete output files.", { ...mutation, ...authored, profileId: s, profileVersionId: s, parentEditionId: s, decisions: list(row) }, ["operationId", "expectedRevision", "profileId", "profileVersionId", "decisions", "author"], true],
  ["volttron.edition.read", "Read the complete original saved registry edition and every retained output.", { ...revision, editionId: s }, ["expectedRevision", "editionId"], false],
  ["volttron.edition.compare", "Compare the complete selected registry editions without collapsing duplicate physical source rows.", { ...revision, beforeEditionId: s, afterEditionId: s }, ["expectedRevision", "beforeEditionId", "afterEditionId"], false],
  ["volttron.receiving.record", "Retain actual or engineering-only receiving evidence against its exact saved registry manifest.", { ...mutation, ...authored, editionId: s, evidence: {} }, ["operationId", "expectedRevision", "editionId", "evidence", "author"], true],
  ["volttron.receiving.read", "Read the complete original receiving evidence and retained output files.", { ...revision, receivingId: s }, ["expectedRevision", "receivingId"], false],
  ["volttron.return.preview", "Verify a complete returned application and compare every incoming registry profile with its current local head.", { ...revision, base64: s }, ["expectedRevision", "base64"], false],
  ["volttron.return.apply", "Apply explicit Keep or Adopt decisions to the complete original return, retaining all profile histories and referred source bytes.", { ...mutation, ...authored, base64: s, decisions: list(returnDecision) }, ["operationId", "expectedRevision", "base64", "decisions", "author"], true]
];
