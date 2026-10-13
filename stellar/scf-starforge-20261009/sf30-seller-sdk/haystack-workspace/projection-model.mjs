import { semanticModelRead } from "./semantic-model.mjs";
import { validateValue, validateGrid, encodeGrid, parseGrid, isTagName } from "./haystack-types.mjs";
import { analyzeGrids } from "./haystack-index.mjs";
import { clone, digest, sha256, base64, need, plain, own, hash, id, text, integer, fields, now, page, canonical } from "./util.mjs";

const FORMAT = "commons.haystack.projection-work.v1";
const MAX_ROWS = 25000, MAX_COLUMNS = 256, MAX_VERSIONS = 10000;
const refKey = r => r.kind + ":" + r.sourceId + ":" + r.rowIndex;
const signed = value => ({ ...value, id: digest(value) });
const checkSigned = row => { const body = clone(row); delete body.id; need(row.id === digest(body), "The retained projection record changed.", "HAYSTACK_PROJECTION_HISTORY", 409); };
const take = (rows, value, label) => { const row = rows.find(x => x.id === value); need(row, "Choose a retained " + label + ".", "HAYSTACK_PROJECTION_MISSING", 404); return row; };
const list = (value, maximum, label) => { need(Array.isArray(value) && value.length <= maximum, "Supply the complete " + label + " within " + maximum + " entries."); return value; };
const distinct = (rows, key, label) => need(new Set(rows.map(key)).size === rows.length, "Choose each " + label + " once.");
function stateOf(state, create = false) {
  if (!state.projections && create) state.projections = { format: FORMAT, projects: [], versions: [], reviews: [], publications: [], returns: [] };
  return state.projections || { format: FORMAT, projects: [], versions: [], reviews: [], publications: [], returns: [] };
}
function selected(state, projectionId, versionId) {
  const s = stateOf(state), projection = take(s.projects, id(projectionId, "projection identity"), "projection");
  const version = take(s.versions, hash(versionId || projection.headId), "projection version");
  need(version.projectionId === projection.id, "Choose a version in this projection.", "HAYSTACK_PROJECTION_VERSION", 409);
  return { s, projection, version };
}
function validateSource(source) {
  need(plain(source), "Choose the exact source of a projected tag.");
  const fieldsByKind = {
    entity: ["kind", "field"], cell: ["kind", "intakeId", "column"], native: ["kind", "sourceId", "tag"],
    attribute: ["kind", "predicate"], relation: ["kind", "predicate", "multiple"], constant: ["kind", "value"]
  };
  const allowed = fieldsByKind[source.kind]; need(allowed, "Choose a declared projection source.");
  fields(source, allowed, allowed);
  if (source.kind === "entity") need(["id", "name", "label", "kind"].includes(source.field), "Choose the exact model field.");
  if (source.kind === "cell") { id(source.intakeId); integer(source.column, "original column position", 0, 255); }
  if (source.kind === "native") { hash(source.sourceId); need(isTagName(source.tag), "Choose a native Haystack tag."); }
  if (["attribute", "relation"].includes(source.kind)) text(source.predicate, "complete predicate IRI", 4000, true);
  if (source.kind === "relation") need(typeof source.multiple === "boolean", "Choose single or multiple target references explicitly.");
  if (source.kind === "constant") validateValue(source.value);
}
function validateConversion(c) {
  fields(c, ["kind", "blank", "trim", "unit", "prefix", "tz", "trueValues", "falseValues", "markerValues"], ["kind", "blank", "trim"]);
  need(["preserve", "string", "number", "boolean", "marker", "ref", "date", "time", "dateTime", "uri", "symbol", "json"].includes(c.kind), "Choose a declared typed conversion.");
  need(["omit", "null", "error", "keep"].includes(c.blank) && typeof c.trim === "boolean", "Choose blank-cell and whitespace treatment explicitly.");
  for (const key of ["unit", "prefix", "tz"]) if (own(c, key)) text(c[key], key, 240, true);
  need(!own(c, "unit") || c.kind === "number", "A unit belongs only to an explicit number conversion.");
  need(!own(c, "prefix") || c.kind === "ref", "A reference prefix belongs only to an explicit reference conversion.");
  need(!own(c, "tz") || c.kind === "dateTime", "A timezone belongs only to an explicit date-time conversion.");
  for (const key of ["trueValues", "falseValues", "markerValues"]) if (own(c, key)) {
    list(c[key], 100, key).forEach(v => text(v, "exact conversion token", 4000));
    distinct(c[key], x => x, "conversion token");
  }
  if (c.kind === "boolean") need(c.trueValues?.length && c.falseValues?.length &&
    !c.trueValues.some(v => c.falseValues.includes(v)), "Declare disjoint nonempty true and false token lists.");
  if (c.kind === "marker") need(c.markerValues?.length, "Declare the exact strings that introduce a marker.");
  need(c.kind === "boolean" || (!own(c, "trueValues") && !own(c, "falseValues")), "Boolean token lists require the boolean conversion.");
  need(c.kind === "marker" || !own(c, "markerValues"), "Marker tokens require the marker conversion.");
}
export function validateProjectionProfile(profile, model) {
  fields(profile, ["title", "description", "entityIds", "columns", "overrides", "meta"],
    ["title", "description", "entityIds", "columns", "overrides"]);
  text(profile.title, "projection title", 160, true); text(profile.description, "complete mapping description", 16000);
  list(profile.entityIds, MAX_ROWS, "selected entities"); need(profile.entityIds.length, "Select at least one model entity.");
  const entities = new Set(model.version.content.entities.map(x => x.id));
  profile.entityIds.forEach(value => { text(value, "original entity identity", 4000, true); need(entities.has(value), "Select an entity in the exact saved model version."); });
  distinct(profile.entityIds, x => x, "model entity");
  list(profile.columns, MAX_COLUMNS, "target columns"); need(profile.columns.length, "Declare the ordered target columns.");
  distinct(profile.columns, x => x.tag, "target tag");
  for (const column of profile.columns) {
    fields(column, ["tag", "source", "conversion", "meta"], ["tag", "source", "conversion"]);
    need(isTagName(column.tag), "Use a valid Haystack target tag.");
    validateSource(column.source); validateConversion(column.conversion);
    if (column.meta !== undefined) { need(plain(column.meta), "Supply complete column metadata."); validateValue(column.meta); }
  }
  need(profile.columns.some(x => x.tag === "id"), "Declare an explicit typed id column.");
  need(profile.columns.find(x => x.tag === "id").source.kind !== "relation", "Entity identity must be defined before relation projection.");
  const tags = new Set(profile.columns.map(x => x.tag)), selectedEntities = new Set(profile.entityIds);
  list(profile.overrides, MAX_ROWS * MAX_COLUMNS, "explicit cell overrides");
  distinct(profile.overrides, x => x.entityId + "\0" + x.tag, "entity/tag override");
  for (const override of profile.overrides) {
    fields(override, ["entityId", "tag", "present", "value"], ["entityId", "tag"]);
    need(selectedEntities.has(override.entityId) && tags.has(override.tag), "Override a selected entity and declared target tag.");
    need(override.present === undefined || typeof override.present === "boolean", "Use an explicit cell presence.");
    const present = override.present !== false;
    need(present === own(override, "value"), "A present override needs its full typed value; an absent override has no value.");
    if (present) validateValue(override.value);
  }
  if (profile.meta !== undefined) { need(plain(profile.meta), "Supply complete grid metadata."); validateValue(profile.meta); }
  need(profile.meta?.ver === undefined || profile.meta.ver === "3.0", "Keep the JSON v4 grid protocol version 3.0.");
  return profile;
}
function convert(value, conversion) {
  let input = value;
  if (conversion.trim && typeof input === "string") input = input.trim();
  if (input === undefined) {
    need(conversion.blank !== "error", "The original source cell is absent.", "HAYSTACK_PROJECTION_ABSENT");
    return { present: false };
  }
  const blank = input === null || input === "";
  if (blank) {
    if (conversion.blank === "omit") return { present: false };
    if (conversion.blank === "null") return { present: true, value: null };
    if (conversion.blank === "error") need(false, "The selected original cell is blank.", "HAYSTACK_PROJECTION_BLANK");
    need(input !== undefined, "An absent source cell cannot be kept as a typed value.", "HAYSTACK_PROJECTION_ABSENT");
  }
  const string = () => { need(typeof input === "string", "This conversion requires an original text value.", "HAYSTACK_PROJECTION_TYPE"); return input; };
  let output;
  switch (conversion.kind) {
    case "preserve": output = clone(input); break;
    case "string": need(["string", "number", "boolean"].includes(typeof input), "Convert only an explicit scalar to text; select preserve for a typed object.", "HAYSTACK_PROJECTION_TYPE"); output = String(input); break;
    case "number": {
      const token = string();
      need(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token), "Use a complete decimal number without grouping, unit suffix or implicit date conversion.", "HAYSTACK_PROJECTION_NUMBER");
      const number = Number(token);
      need(number !== 0 || !/[1-9]/.test(token.split(/[eE]/)[0]), "This decimal underflows the native number range.", "HAYSTACK_PROJECTION_NUMBER");
      need(Number.isFinite(number) && (!Number.isInteger(number) || Number.isSafeInteger(number)), "This decimal is outside the exact safe integer or finite Haystack range.", "HAYSTACK_PROJECTION_NUMBER");
      output = conversion.unit ? { _kind: "number", val: number, unit: conversion.unit } : number;
      break;
    }
    case "boolean": { const token = string(); need(conversion.trueValues.includes(token) || conversion.falseValues.includes(token), "The text matches neither selected boolean token list.", "HAYSTACK_PROJECTION_BOOLEAN"); output = conversion.trueValues.includes(token); break; }
    case "marker": need(conversion.markerValues.includes(string()), "The text is not a selected marker token.", "HAYSTACK_PROJECTION_MARKER"); output = { _kind: "marker" }; break;
    case "ref": output = { _kind: "ref", val: (conversion.prefix || "") + string() }; break;
    case "date": case "time": case "uri": case "symbol": output = { _kind: conversion.kind, val: string() }; break;
    case "dateTime": output = { _kind: "dateTime", val: string(), ...(conversion.tz ? { tz: conversion.tz } : {}) }; break;
    case "json": {
      // Parse with the maintained strict JSON decoder via a one-cell native grid.
      const token = string(), framed = '{"_kind":"grid","meta":{"ver":"3.0"},"cols":[{"name":"value"}],"rows":[{"value":' + token + '}]}';
      const decoded = parseGrid(framed, { format: "json-v4" }).grid;
      need(decoded.rows.length === 1 && Object.keys(decoded.rows[0]).length === 1 && own(decoded.rows[0], "value"), "Supply exactly one complete typed JSON value.", "HAYSTACK_PROJECTION_JSON");
      output = decoded.rows[0].value; break;
    }
    default: need(false, "Choose a declared typed conversion.");
  }
  validateValue(output); return { present: true, value: output };
}
function projectionLookups(model) {
  const attributes = new Map(), relations = new Map(), refs = new Map();
  const append = (map, key, value) => { const rows = map.get(key); if (rows) rows.push(value); else map.set(key, [value]); };
  for (const entity of model.version.content.entities) {
    const byPredicate = new Map(), bySource = new Map();
    for (const row of entity.attributes) append(byPredicate, row.predicate, row);
    for (const row of entity.sourceRefs) append(bySource, row.kind + ":" + row.sourceId, row);
    attributes.set(entity.id, byPredicate); refs.set(entity.id, bySource);
  }
  for (const row of model.version.content.relations) {
    if (!relations.has(row.subjectId)) relations.set(row.subjectId, new Map());
    append(relations.get(row.subjectId), row.predicate, row);
  }
  return { attributes, relations, refs };
}
function valueFrom(model, entity, source, rowsByRef, ids, lookups) {
  const origin = { source: clone(source), modelEntityId: entity.id };
  if (source.kind === "constant") return { value: clone(source.value), origin };
  if (source.kind === "entity") return { value: entity[source.field], origin: { ...origin, modelVersionId: model.version.id } };
  if (source.kind === "attribute") {
    const selected = lookups.attributes.get(entity.id).get(source.predicate) || [];
    need(selected.length <= 1, "The model has multiple values for this predicate; select a complete per-cell override.", "HAYSTACK_PROJECTION_AMBIGUOUS");
    return { value: selected[0]?.value, origin: { ...origin, attributes: clone(selected) } };
  }
  if (source.kind === "relation") {
    const relations = lookups.relations.get(entity.id)?.get(source.predicate) || [];
    need(source.multiple || relations.length <= 1, "Multiple relationships require an explicit list-valued target.", "HAYSTACK_PROJECTION_AMBIGUOUS");
    const refs = relations.map(r => {
      const value = ids.get(r.objectId);
      need(value, "A relationship target has no valid selected typed id.", "HAYSTACK_PROJECTION_RELATION");
      return clone(value);
    });
    return { value: source.multiple ? refs : refs[0], origin: { ...origin, relations: clone(relations) } };
  }
  const kind = source.kind === "cell" ? "intake" : "native";
  const sourceId = source.kind === "cell" ? source.intakeId : source.sourceId;
  const refs = lookups.refs.get(entity.id).get(kind + ":" + sourceId) || [];
  need(refs.length <= 1, "Several original rows match this source; make an explicit per-cell override.", "HAYSTACK_PROJECTION_AMBIGUOUS");
  if (!refs.length) return { value: undefined, origin: { ...origin, sourceRef: null } };
  const row = rowsByRef.get(refKey(refs[0]));
  need(row, "The exact model context no longer retains its original row.", "HAYSTACK_PROJECTION_SOURCE", 409);
  if (source.kind === "cell") {
    need(source.column < row.columns.length, "The column position is outside the original retained headings.", "HAYSTACK_PROJECTION_COLUMN");
    return { value: row.cells[source.column], origin: { ...origin, sourceRef: clone(refs[0]), heading: row.columns[source.column],
      column: source.column, physicalEndLine: row.physicalEndLine, sourceName: row.sourceName } };
  }
  return { value: own(row.tags, source.tag) ? row.tags[source.tag] : undefined, origin: { ...origin, sourceRef: clone(refs[0]), sourceName: row.sourceName } };
}
export function previewProjection(state, args) {
  hash(args.versionId, "exact model version");
  const model = semanticModelRead(state, { modelId: args.modelId, versionId: args.versionId });
  const profile = clone(validateProjectionProfile(args.profile, model));
  const entities = new Map(model.version.content.entities.map(e => [e.id, e]));
  const originals = new Map(model.context.records.map(r => [refKey(r.ref), r])), lookups = projectionLookups(model);
  const overrides = new Map(profile.overrides.map(r => [r.entityId + "\0" + r.tag, r]));
  const diagnostics = [], ids = new Map(), rows = [];
  const issue = (error, entityId, tag) => ({ severity: "error", code: error.code || "HAYSTACK_PROJECTION_VALUE", message: error.message, entityId, tag });
  function cell(entity, column) {
    const override = overrides.get(entity.id + "\0" + column.tag);
    try {
      if (override) return { tag: column.tag, present: override.present !== false,
        ...(override.present !== false ? { value: clone(override.value) } : {}),
        origin: { kind: "explicit-override", modelEntityId: entity.id, override: clone(override) } };
      const selected = valueFrom(model, entity, column.source, originals, ids, lookups), converted = convert(selected.value, column.conversion);
      return { tag: column.tag, ...converted, origin: { ...selected.origin,
        originalPresent: selected.value !== undefined, ...(selected.value !== undefined ? { originalValue: clone(selected.value) } : {}),
        conversion: clone(column.conversion) } };
    } catch (error) {
      const finding = issue(error, entity.id, column.tag); diagnostics.push(finding);
      return { tag: column.tag, present: false, origin: { source: clone(column.source) }, issue: finding };
    }
  }
  const idColumn = profile.columns.find(c => c.tag === "id"), first = new Map(), used = new Map();
  for (const entityId of profile.entityIds) {
    const row = cell(entities.get(entityId), idColumn); first.set(entityId, row);
    if (row.present && row.value?._kind === "ref" && typeof row.value.val === "string") {
      if (used.has(row.value.val)) diagnostics.push({ severity: "error", code: "HAYSTACK_PROJECTION_DUPLICATE_ID", message: "Two selected entities project the same reference id.", entityId, tag: "id", otherEntityId: used.get(row.value.val) });
      else used.set(row.value.val, entityId);
      ids.set(entityId, row.value);
    } else if (!row.issue) diagnostics.push({ severity: "error", code: "HAYSTACK_PROJECTION_ID", message: "Every selected row needs an explicit typed reference id.", entityId, tag: "id" });
  }
  const grid = { _kind: "grid", meta: { ...(clone(profile.meta || {})), ver: "3.0" },
    cols: profile.columns.map(c => ({ name: c.tag, ...(c.meta ? { meta: clone(c.meta) } : {}) })), rows: [] };
  for (const entityId of profile.entityIds) {
    const entity = entities.get(entityId), cells = profile.columns.map(c => c.tag === "id" ? first.get(entityId) : cell(entity, c));
    const values = {};
    for (const c of cells) if (c.present) Object.defineProperty(values, c.tag, { value: clone(c.value), enumerable: true, configurable: true, writable: true });
    grid.rows.push(values);
    rows.push({ entityId, rowIndex: rows.length, sourceRefs: clone(entity.sourceRefs), cells });
  }
  const validation = validateGrid(grid);
  for (const finding of validation.diagnostics || []) diagnostics.push({ ...clone(finding), scope: "grid" });
  const encoded = encodeGrid(grid, { format: "json-v4", indent: 2 }), gridSha256 = sha256(encoded);
  const analysis = analyzeGrids([{ sourceId: gridSha256, grid }]);
  for (const finding of analysis.diagnostics) diagnostics.push({ ...clone(finding), scope: "semantic" });
  const canPublish = !diagnostics.some(d => d.severity === "error");
  const result = { profile, modelId: model.model.id, modelVersionId: model.version.id,
    modelContentSha256: model.version.contentSha256, contextId: model.context.id,
    grid, gridSha256, rows, diagnostics, canPublish,
    counts: { rows: rows.length, columns: grid.cols.length, errors: diagnostics.filter(d => d.severity === "error").length,
      warnings: diagnostics.filter(d => d.severity === "warning").length, sourceRows: new Set(rows.flatMap(r => r.sourceRefs.map(refKey))).size } };
  return { ...result, contentSha256: digest(result) };
}
// Immutable versions retain the complete authored mapping and original model
// identities. Large derived grids and per-cell lineage are reconstructed from
// those retained inputs; their full digest remains bound to the saved version.
function projectionMaterial(result) {
  const { grid, rows, diagnostics, ...material } = result;
  return material;
}
function versionResult(state, version) {
  return previewProjection(state, { modelId: version.result.modelId,
    versionId: version.result.modelVersionId, profile: version.result.profile });
}
function versionMetadata(version) { const { result, ...meta } = version; return clone(meta); }
export function projectionRead(state, args) {
  const { s, projection, version } = selected(state, args.projectionId, args.versionId);
  return { ...versionResult(state, version), projection: clone(projection), version: versionMetadata(version),
    history: s.versions.filter(v => v.projectionId === projection.id).map(versionMetadata),
    reviews: clone(s.reviews.filter(r => r.projectionId === projection.id)),
    publications: clone(s.publications.filter(r => r.projectionId === projection.id)),
    returns: clone(s.returns.filter(r => r.projectionId === projection.id)) };
}
export function projectionRows(state) {
  const s = stateOf(state), versions = new Map(s.versions.map(v => [v.id, v])), reviews = new Map(), publications = new Map();
  for (const row of s.reviews) reviews.set(row.versionId, row);
  for (const row of s.publications) publications.set(row.versionId, (publications.get(row.versionId) || 0) + 1);
  return s.projects.map(p => {
    const v = versions.get(p.headId);
    need(v, "Choose a retained projection head.", "HAYSTACK_PROJECTION_MISSING", 404);
    return { ...clone(p), title: v.result.profile.title, modelId: v.result.modelId, modelVersionId: v.result.modelVersionId,
      counts: clone(v.result.counts), canPublish: v.result.canPublish,
      review: clone(reviews.get(v.id) || null), publications: publications.get(v.id) || 0 };
  });
}
export function projectionSummary(state) {
  const s = stateOf(state);
  return { projects: s.projects.length, versions: s.versions.length, reviews: s.reviews.length,
    publications: s.publications.length, returns: s.returns.length };
}
function saveVersion(state, args, project, parents, provenance = null) {
  const s = stateOf(state, true), result = projectionMaterial(previewProjection(state, args));
  need(s.versions.length < MAX_VERSIONS, "Keep the complete projection history within its declared 10,000 versions.", "HAYSTACK_SIZE", 413);
  const version = signed({ format: "commons.haystack.projection-version.v1", projectionId: project.id, parents,
    createdAt: now(), author: text(args.author, "mapping author", 240, true), note: text(args.note || "", "complete mapping note", 16000),
    result, provenance });
  s.versions.push(version); project.headId = version.id;
  return { projection: clone(project), version: versionMetadata(version), counts: clone(result.counts), canPublish: result.canPublish };
}
function current(state, args) {
  const value = selected(state, args.projectionId);
  need(value.projection.headId === hash(args.expectedHeadId), "The projection head changed. Open its complete current version before saving.", "HAYSTACK_PROJECTION_HEAD", 409);
  return value;
}
function returnProfile(version, incoming, rowDecisions) {
  list(rowDecisions, MAX_ROWS, "returned row decisions"); distinct(rowDecisions, x => x.entityId, "returned entity decision");
  need(rowDecisions.length === version.result.profile.entityIds.length, "Decide keep or adopt for every original projected entity.");
  const selectedEntities = new Set(version.result.profile.entityIds);
  const decisions = new Map(rowDecisions.map(d => {
    fields(d, ["entityId", "decision"], ["entityId", "decision"]);
    need(selectedEntities.has(d.entityId) && ["keep", "adopt"].includes(d.decision), "Choose keep or adopt for an original entity.");
    return [d.entityId, d.decision];
  }));
  const profile = clone(version.result.profile), columns = new Set(profile.columns.map(c => c.tag));
  const incomingColumns = [...incoming.grid.cols], incomingNames = new Set(incomingColumns.map(c => c.name));
  for (const row of incoming.grid.rows) for (const name of Object.keys(row)) if (isTagName(name) && !incomingNames.has(name)) { incomingColumns.push({ name }); incomingNames.add(name); }
  for (const column of incomingColumns) if (!columns.has(column.name)) {
    profile.columns.push({ tag: column.name, source: { kind: "constant", value: null },
      conversion: { kind: "preserve", blank: "omit", trim: false }, ...(column.meta ? { meta: clone(column.meta) } : {}) });
    columns.add(column.name);
  }
  const retained = new Map(profile.overrides.map(x => [x.entityId + "\0" + x.tag, x]));
  for (const row of incoming.rows) {
    // Freeze the complete chosen row. A kept relation must not silently follow
    // an adopted target identifier when the profile is re-evaluated.
    const chosen = decisions.get(row.entityId) === "adopt" ? row.after : row.before;
    for (const tag of columns) retained.set(row.entityId + "\0" + tag, {
      entityId: row.entityId, tag, present: own(chosen, tag), ...(own(chosen, tag) ? { value: clone(chosen[tag]) } : {})
    });
  }
  profile.overrides = [...retained.values()];
  return profile;
}
export function applyProjectionAction(state, action, args, helpers) {
  const s = stateOf(state, true);
  if (action === "projection.create") {
    need(s.projects.length < 200, "This complete workspace retains at most 200 projection projects.", "HAYSTACK_SIZE", 413);
    const project = { id: id(args.projectionId || args.operationId), createdAt: now(), createdBy: text(args.author, "mapping author", 240, true), headId: null };
    need(!s.projects.some(p => p.id === project.id), "This projection identity already exists.", "HAYSTACK_PROJECTION_ID", 409);
    const result = saveVersion(state, args, project, []); s.projects.push(project); return result;
  }
  if (action === "projection.save") {
    const { projection, version } = current(state, args);
    return saveVersion(state, args, projection, [version.id]);
  }
  if (action === "projection.review") {
    const { projection, version } = current(state, args);
    need(["ready", "changes"].includes(args.decision), "Choose ready or changes.");
    if (args.decision === "ready") need(version.result.canPublish, "Resolve all typed-grid errors before marking this version ready.", "HAYSTACK_PROJECTION_FINDINGS", 409);
    const review = signed({ format: "commons.haystack.projection-review.v1", projectionId: projection.id, versionId: version.id,
      gridSha256: version.result.gridSha256, decision: args.decision, author: text(args.author, "reviewer", 240, true),
      note: text(args.note, "complete review note", 16000, true), reviewedAt: now() });
    s.reviews.push(review); return { projection: clone(projection), review };
  }
  if (action === "projection.publish") {
    const { projection, version } = current(state, args), review = s.reviews.filter(r => r.versionId === version.id).at(-1);
    need(version.result.canPublish && review?.decision === "ready", "Review this exact typed grid before adding it as a native source.", "HAYSTACK_PROJECTION_REVIEW", 409);
    const bytes = encodeGrid(versionResult(state, version).grid, { format: "json-v4", indent: 2 });
    need(sha256(bytes) === version.result.gridSha256, "The selected derived grid changed.", "HAYSTACK_PROJECTION_GRID", 409);
    const source = helpers.sourceRecord(bytes, { name: version.result.profile.title + ".json", format: "json-v4",
      sourceUrl: "urn:commons:haystack-projection:" + projection.id + ":" + version.id });
    const prior = state.sources.find(x => x.id === source.id);
    if (!prior) { need(state.sources.length < helpers.sourceMaxCount, "Retain the complete source limit.", "HAYSTACK_SIZE", 413); state.sources.push(source); }
    if (args.select && !state.selectedSourceIds.includes(source.id)) state.selectedSourceIds.push(source.id);
    const publication = signed({ format: "commons.haystack.projection-publication.v1", projectionId: projection.id,
      versionId: version.id, reviewId: review.id, sourceId: source.id, bytes: bytes.length,
      author: text(args.author, "publishing operator", 240, true), note: text(args.note, "publication note", 16000),
      publishedAt: now(), selected: Boolean(args.select) });
    s.publications.push(publication); return { projection: clone(projection), publication, source: helpers.sourceSummary(prior || source) };
  }
  if (action === "projection.return.apply") {
    const { projection, version } = current(state, args);
    const incoming = previewProjectionReturn(state, { ...args, versionId: version.id });
    need(incoming.returnSha256 === hash(args.expectedReturnSha256), "The complete returned grid or explicit row bindings changed after review.", "HAYSTACK_PROJECTION_RETURN", 409);
    const profile = returnProfile(version, incoming, args.decisions);
    const receipt = signed({ format: "commons.haystack.projection-return.v1", projectionId: projection.id, beforeVersionId: version.id,
      returnSha256: incoming.returnSha256, source: incoming.source, base64: args.base64, bindings: clone(args.bindings),
      consumerReference: text(args.consumerReference, "existing consumer record reference", 4000),
      decisions: clone(args.decisions), receivedAt: now(), author: text(args.author, "receiving operator", 240, true),
      note: text(args.note, "complete return decision note", 16000, true) });
    const result = saveVersion(state, { ...args, modelId: version.result.modelId, versionId: version.result.modelVersionId, profile },
      projection, [version.id], { returnId: receipt.id, originalSourceSha256: incoming.source.sha256 });
    s.returns.push({ ...receipt, afterVersionId: result.version.id });
    // afterVersionId is linked outside the signed body to avoid circular version/receipt hashes.
    return { ...result, return: clone(s.returns.at(-1)) };
  }
  need(false, "Choose a declared projection action.", "HAYSTACK_ACTION", 404);
}
export function previewProjectionReturn(state, args) {
  const { version } = selected(state, args.projectionId, args.versionId);
  return previewProjectionReturnFromOriginal(args, version, versionResult(state, version));
}
function previewProjectionReturnFromOriginal(args, version, original) {
  text(args.name, "returned original filename", 240, true); text(args.consumerReference || "", "existing consumer record reference", 4000);
  const bytes = base64(args.base64, 32 * 1024 * 1024), received = parseGrid(bytes, { format: "json-v4" });
  list(args.bindings, MAX_ROWS, "complete returned row bindings"); distinct(args.bindings, x => x.entityId, "bound entity"); distinct(args.bindings, x => x.rowIndex, "incoming row");
  need(args.bindings.length === original.rows.length && args.bindings.length === received.grid.rows.length,
    "Bind every incoming row to exactly one original projected entity; use a separately reviewed projection for added or removed entities.");
  const mapped = new Map(), selectedEntities = new Set(version.result.profile.entityIds);
  for (const b of args.bindings) {
    fields(b, ["entityId", "rowIndex"], ["entityId", "rowIndex"]);
    need(selectedEntities.has(b.entityId), "Bind the original selected model entity.");
    integer(b.rowIndex, "incoming original row position", 0, received.grid.rows.length - 1); mapped.set(b.entityId, b.rowIndex);
  }
  const rows = original.rows.map(r => {
    const incomingRowIndex = mapped.get(r.entityId), before = original.grid.rows[r.rowIndex], after = received.grid.rows[incomingRowIndex];
    const tags = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const changes = tags.filter(tag => own(before, tag) !== own(after, tag) || digest(before[tag] ?? null) !== digest(after[tag] ?? null))
      .map(tag => ({ tag, before: { present: own(before, tag), ...(own(before, tag) ? { value: clone(before[tag]) } : {}) },
        after: { present: own(after, tag), ...(own(after, tag) ? { value: clone(after[tag]) } : {}) } }));
    return { entityId: r.entityId, originalRowIndex: r.rowIndex, incomingRowIndex, before: clone(before), after: clone(after), changes };
  });
  const source = { name: args.name, bytes: bytes.length, sha256: sha256(bytes), format: "json-v4" };
  const material = { versionId: version.id, source, bindings: clone(args.bindings), consumerReference: args.consumerReference || "" };
  return { projectionId: args.projectionId, versionId: version.id, source, grid: received.grid, rows,
    diagnostics: received.diagnostics, changedRows: rows.filter(r => r.changes.length).length, returnSha256: digest(material) };
}
export function compareProjections(state, args) {
  const beforeVersion = selected(state, args.projectionId, args.beforeVersionId).version;
  const afterVersion = selected(state, args.projectionId, args.afterVersionId).version;
  const before = versionResult(state, beforeVersion), after = versionResult(state, afterVersion);
  const left = new Map(before.rows.map(r => [r.entityId, r])), right = new Map(after.rows.map(r => [r.entityId, r]));
  // Retain the original union order and total, but materialize full comparison
  // cells only for this requested page. Do not clone every row before slicing.
  const selectedRows = page([...new Set([...left.keys(), ...right.keys()])], args);
  const items = selectedRows.items.map(entityId => {
    const a = left.get(entityId), b = right.get(entityId);
    return { entityId, before: a ? clone(a) : null, after: b ? clone(b) : null,
      state: !a ? "added" : !b ? "removed" : digest(a.cells) === digest(b.cells) ? "same" : "changed" };
  });
  return { beforeVersionId: beforeVersion.id, afterVersionId: afterVersion.id,
    beforeProfile: clone(before.profile), afterProfile: clone(after.profile), ...selectedRows, items };
}
export function validateProjectionState(state) {
  const s = state.projections; if (s === undefined) return state;
  fields(s, ["format", "projects", "versions", "reviews", "publications", "returns"], ["format", "projects", "versions", "reviews", "publications", "returns"]);
  need(s.format === FORMAT, "Use the complete projection state.", "HAYSTACK_PROJECTION_HISTORY", 409);
  for (const key of ["projects", "versions", "reviews", "publications", "returns"]) {
    list(s[key], key === "projects" ? 200 : MAX_VERSIONS, "projection " + key); distinct(s[key], x => x.id, "retained " + key + " identity");
  }
  const versions = new Map(s.versions.map(v => [v.id, v])), returnsByBefore = new Map();
  for (const r of s.returns) {
    need(versions.has(r.beforeVersionId),
      "The return lost its complete original bytes or exact resulting version.", "HAYSTACK_PROJECTION_HISTORY", 409);
    const rows = returnsByBefore.get(r.beforeVersionId);
    if (rows) rows.push(r); else returnsByBefore.set(r.beforeVersionId, [r]);
  }
  function verifyReturn(r, before, original) {
    const signedBody = clone(r); delete signedBody.afterVersionId; checkSigned(signedBody);
    const bytes = base64(r.base64, 32 * 1024 * 1024);
    const after = versions.get(r.afterVersionId);
    need(r.format === "commons.haystack.projection-return.v1" && bytes.length === r.source.bytes && sha256(bytes) === r.source.sha256 &&
      before?.projectionId === r.projectionId && after?.projectionId === r.projectionId &&
      after.parents.length === 1 && after.parents[0] === before.id &&
      after.provenance?.returnId === r.id && after.provenance.originalSourceSha256 === r.source.sha256,
      "The return lost its complete original bytes or exact resulting version.", "HAYSTACK_PROJECTION_HISTORY", 409);
    // Preserve the public selection checks without deriving the grid again.
    selected(state, r.projectionId, r.beforeVersionId);
    const incoming = previewProjectionReturnFromOriginal({ projectionId: r.projectionId, versionId: r.beforeVersionId,
      name: r.source.name, base64: r.base64, bindings: r.bindings, consumerReference: r.consumerReference }, before, original);
    need(incoming.returnSha256 === r.returnSha256 && digest(incoming.source) === digest(r.source),
      "The retained return differs from its original file or complete row bindings.", "HAYSTACK_PROJECTION_HISTORY", 409);
    const profile = returnProfile(before, incoming, r.decisions);
    need(after.result.modelId === before.result.modelId && after.result.modelVersionId === before.result.modelVersionId &&
      after.result.contextId === before.result.contextId && digest(after.result.profile) === digest(profile) &&
      after.author === r.author && after.note === r.note,
      "The resulting version differs from the exact retained keep/adopt decisions.", "HAYSTACK_PROJECTION_HISTORY", 409);
  }
  for (const v of s.versions) {
    checkSigned(v); need(v.format === "commons.haystack.projection-version.v1", "Use a complete projection version.");
    id(v.projectionId); list(v.parents, 1, "projection parents");
    const rematerialized = versionResult(state, v);
    need(digest(projectionMaterial(rematerialized)) === digest(v.result),
      "The retained projection differs from its exact original model, context, profile or complete derived grid and cell lineage.", "HAYSTACK_PROJECTION_HISTORY", 409);
    for (const parent of v.parents) need(versions.get(parent)?.projectionId === v.projectionId && parent !== v.id, "Retain the original projection parent.");
    // Reuse this exact checked version for all of its retained return records.
    // Only one full derived grid/lineage is retained by this pass at a time.
    for (const r of returnsByBefore.get(v.id) || []) verifyReturn(r, v, rematerialized);
  }
  for (const p of s.projects) { id(p.id); need(versions.get(p.headId)?.projectionId === p.id, "The projection head belongs to another project."); }
  const visited = new Set();
  for (const v of s.versions) {
    let cursor = v; const chain = new Set();
    while (cursor && !visited.has(cursor.id)) { need(!chain.has(cursor.id), "The projection history contains a cycle."); chain.add(cursor.id); cursor = cursor.parents.length ? versions.get(cursor.parents[0]) : null; }
    for (const value of chain) visited.add(value);
  }
  for (const r of s.reviews) { checkSigned(r); need(["ready", "changes"].includes(r.decision) && (r.decision !== "ready" || versions.get(r.versionId)?.result.canPublish), "Retain the actual review decision."); need(versions.get(r.versionId)?.projectionId === r.projectionId && versions.get(r.versionId).result.gridSha256 === r.gridSha256, "The review refers to another projected grid."); }
  for (const r of s.publications) {
    checkSigned(r); const v = versions.get(r.versionId), review = s.reviews.find(x => x.id === r.reviewId);
    need(v?.projectionId === r.projectionId && v.result.gridSha256 === r.sourceId && review?.versionId === v.id && review.decision === "ready" &&
      state.sources.some(x => x.id === r.sourceId && x.bytes === r.bytes), "The publication lost its reviewed grid or retained native source.");
  }

  return state;
}
