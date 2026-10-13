// MIT. Pure three-way authored-value review over original Research revisions.
// Typed operation graphs remain source-bound proposals with their native identities.
import {digest} from '../../node/store.mjs';
import {
  RETURN_SCHEMAS, RETURN_LIMITS, RETURN_TREATMENTS, ReturnError,
  returnNeed, returnPlain, returnClone, returnCanonical, returnDigest, returnEqual,
  returnNativeDigest, returnBytes, returnSha, returnDossierId, returnRevision,
  returnText, returnTime, validateReturnId, validateReturnEnvelope, validateReturnSource,
} from './contracts.mjs';

export const RETURN_TYPED_FAMILIES = Object.freeze([
  'citationReviews', 'eligibilityEvents', 'extractionEvents',
  'extractionPublicationEvents', 'riskOfBiasEvents', 'customerUpdateEvents',
  'templateExchangeEvents', 'dossierReturnEvents',
]);
const META = new Set(['schema', 'id', 'revision', 'previous', 'createdAt', 'updatedAt', 'change']);
const AUTHORED = new Set(['title', 'description', 'questions', 'editions', 'selections', 'findings']);
const TYPED = new Set(RETURN_TYPED_FAMILIES);
const FIELDS = Object.freeze({
  questions: ['text', 'notes', 'status'],
  selections: ['selected', 'note', 'classification'],
  findings: ['title', 'text', 'occurrenceIds'],
});
const BINDINGS = Object.freeze({
  questions: ['id', 'createdAt'],
  selections: ['occurrenceId', 'editionId', 'questionId', 'key'],
  findings: ['id', 'questionId', 'createdAt'],
});
const ID_FIELD = Object.freeze({questions: 'id', editions: 'id', selections: 'occurrenceId', findings: 'id'});
const NAMES = Object.freeze({
  title: 'Dossier title', description: 'Dossier description',
  questions: 'Question', editions: 'Source edition', selections: 'Evidence selection', findings: 'Finding',
  citationReviews: 'Citation reviews', eligibilityEvents: 'Eligibility reviews',
  extractionEvents: 'Study extraction', extractionPublicationEvents: 'Extraction publications',
  riskOfBiasEvents: 'Risk-of-bias appraisals', customerUpdateEvents: 'Customer updates',
  templateExchangeEvents: 'Workbook returns', dossierReturnEvents: 'Dossier return history',
});
const FIELD_NAMES = Object.freeze({
  text: 'Text', notes: 'Notes', status: 'Status', selected: 'Selected',
  note: 'Note', classification: 'Classification', title: 'Title', occurrenceIds: 'Exact cited occurrences',
});
const has = (value, key) => returnPlain(value) && Object.hasOwn(value, key);
const uuidId = (value, prefix) => typeof value === 'string' &&
  new RegExp('^' + prefix + '_[a-f0-9-]{36}$').test(value);
const editionId = value => typeof value === 'string' && /^e_[a-f0-9]{64}$/.test(value);
const occurrenceId = value => typeof value === 'string' && /^o_[a-f0-9]{64}$/.test(value);
const headPin = envelope => ({revision: envelope.state.revision, sha256: envelope.sha256});
const wirePin = source => ({id: source.id, sha256: source.sha256, bytes: source.bytes});
const brief = value => {
  if (typeof value === 'string') return value.length > 180 ? value.slice(0, 177) + '…' : value;
  if (Array.isArray(value)) return value.length + (value.length === 1 ? ' item' : ' items');
  if (returnPlain(value)) {
    for (const key of ['title', 'label', 'text', 'id', 'occurrenceId'])
      if (typeof value[key] === 'string') return brief(value[key]);
    return Object.keys(value).length + ' fields';
  }
  return String(value);
};
function side(present, value) {
  const raw = present ? {present: true, value: returnClone(value)} : {present: false};
  return {...raw, sha256: returnDigest(raw), summary: present ? brief(value) : 'Absent'};
}
const propertySide = (value, key) => side(has(value, key), has(value, key) ? value[key] : null);
const rowSide = value => side(value !== undefined, value);
const sameSide = (left, right) => left.sha256 === right.sha256 &&
  left.present === right.present && (!left.present || returnEqual(left.value, right.value));
const nativeRis = row => row?.provider === 'ris-document' || row?.origin?.mode === 'ORIGINAL_RIS_SOURCE_REVIEW';

function itemIdentity(context, item) {
  return returnDigest({
    source: context.source, dossierId: context.dossierId,
    base: context.base, current: context.current, returned: context.returned,
    kind: item.kind, family: item.family, path: item.path,
    treatment: item.treatment, baseValue: item.base.sha256,
    currentValue: item.current.sha256, returnedValue: item.returned.sha256,
  });
}
function labelsFor(item) {
  if (item.treatment !== RETURN_TREATMENTS.authored) return {
    CURRENT: 'Keep current authority',
    RETURNED: item.treatment === RETURN_TREATMENTS.extension ?
      'Retain returned extension' : 'Retain returned proposal',
  };
  const noun = (NAMES[item.family] ?? 'value').toLowerCase();
  const labels = {
    CURRENT: item.current.present ? 'Keep current ' + noun : 'Decline incoming ' + noun,
    RETURNED: item.returned.present ?
      (item.current.present ? 'Use returned ' + noun : 'Add returned ' + noun) :
      'Remove current ' + noun,
  };
  if (item.allowedChoices.includes('EDIT')) labels.EDIT = 'Use reviewed edited value';
  return labels;
}
function addItem(items, context, spec, before, current, returned) {
  if (sameSide(current, returned)) return;
  const currentChanged = !sameSide(current, before), returnedChanged = !sameSide(returned, before);
  const conflict = currentChanged && returnedChanged;
  const item = {
    ...spec, base: before, current, returned,
    status: conflict ? 'CONFLICT' : returnedChanged ? 'RETURNED_CHANGED' : 'CURRENT_CHANGED',
    conflict, suggestedChoice: conflict ? null : returnedChanged ? 'RETURNED' : 'CURRENT',
    allowedChoices: ['CURRENT', 'RETURNED'],
  };
  if (spec.editable) item.allowedChoices.push('EDIT');
  delete item.editable;
  item.choiceLabels = labelsFor(item);
  item.effect = item.treatment === RETURN_TREATMENTS.authored ?
    'The selected value changes the active dossier after the complete dependency check.' :
    'The current active value stays authoritative. A returned choice records a reviewed proposal bound to the complete original branch.';
  item.id = 'dri_' + itemIdentity(context, item);
  items.push(item);
}
function maps(state, family) {
  const key = ID_FIELD[family], result = new Map();
  for (const row of state[family]) {
    returnNeed(returnPlain(row) && typeof row[key] === 'string' && !result.has(row[key]),
      'RETURN_STATE_INVALID', {family});
    result.set(row[key], row);
  }
  return result;
}
function subject(family, id, row, field) {
  return {
    family, ...(id ? {id} : {}), ...(field ? {field} : {}),
    ...(typeof row?.questionId === 'string' ? {questionId: row.questionId} : {}),
    ...(typeof row?.editionId === 'string' ? {editionId: row.editionId} : {}),
    ...(family === 'questions' ? {questionId: id} : {}),
    ...(family === 'findings' ? {findingId: id} : {}),
    ...(family === 'selections' ? {occurrenceId: id} : {}),
  };
}
function fieldSpec(family, id, row, field, treatment = RETURN_TREATMENTS.authored, reason) {
  const rowTitle = brief(row?.title ?? row?.text ?? row?.label ?? id);
  return {
    kind: family === 'dossier' ? 'dossier-field' : 'authored-field',
    family, path: family === 'dossier' ? [field] : [family, id, field],
    label: family === 'dossier' ? NAMES[field] : NAMES[family] + ': ' + rowTitle + ' · ' + (FIELD_NAMES[field] ?? field),
    subject: subject(family, id, row, field),
    treatment, editable: treatment === RETURN_TREATMENTS.authored,
    ...(reason ? {authorityReason: reason} : {}),
  };
}
function countsFor(items) {
  return {
    total: items.length,
    conflicts: items.filter(row => row.conflict).length,
    authored: items.filter(row => row.treatment === RETURN_TREATMENTS.authored).length,
    typedProposals: items.filter(row => row.treatment === RETURN_TREATMENTS.typed).length,
    extensions: items.filter(row => row.treatment === RETURN_TREATMENTS.extension).length,
    additions: items.filter(row => !row.current.present && row.returned.present).length,
    removals: items.filter(row => row.current.present && !row.returned.present).length,
  };
}
function comparisonIdentity(value) {
  return {
    schema: RETURN_SCHEMAS.comparison, source: wirePin(value.source),
    dossierId: value.dossierId, base: value.base, current: value.current,
    returned: value.returned, items: value.items,
  };
}

/**
 * Compare native revision envelopes. The store proves that base belongs to both
 * complete histories and retains the source wire bytes before calling this code.
 * Full values are authoritative; summaries and suggested choices are display aids.
 */
export function buildReturnComparison({source, current, returned, base} = {}) {
  validateReturnSource(source);
  returnNeed(base !== null && base !== undefined, 'RETURN_NO_COMMON_ANCESTOR');
  validateReturnEnvelope(current, {dossierId: source.dossierId});
  validateReturnEnvelope(returned, {dossierId: source.dossierId});
  validateReturnEnvelope(base, {dossierId: source.dossierId});
  returnNeed(base.state.revision <= current.state.revision && base.state.revision <= returned.state.revision,
    'RETURN_BASE_INVALID');
  returnNeed(source.incomingHead.revision === returned.state.revision &&
    source.incomingHead.sha256 === returned.sha256, 'RETURN_SOURCE_CHANGED');
  for (const envelope of [base, current, returned]) validateReturnAuthoredState(envelope.state);
  const context = {source: wirePin(source), dossierId: current.state.id,
    base: headPin(base), current: headPin(current), returned: headPin(returned)};
  const a = base.state, c = current.state, r = returned.state, items = [];

  for (const field of ['title', 'description'])
    addItem(items, context, fieldSpec('dossier', null, null, field),
      propertySide(a, field), propertySide(c, field), propertySide(r, field));

  const cm = maps(c, 'editions'), rm = maps(r, 'editions'), am = maps(a, 'editions');
  const proposedEditions = new Set();
  for (const [id, row] of rm)
    if ((!cm.has(id) && nativeRis(row)) || (cm.has(id) && !returnEqual(cm.get(id), row)))
      proposedEditions.add(id);
  const returnedOccurrences = new Map(r.selections.map(row => [row.occurrenceId, row]));
  const proposalBinding = (family, row, field) => {
    if (!row) return false;
    if (family === 'selections') return proposedEditions.has(row.editionId);
    if (family === 'findings' && (field === undefined || field === 'occurrenceIds'))
      return row.occurrenceIds.some(id => proposedEditions.has(returnedOccurrences.get(id)?.editionId));
    return false;
  };

  for (const family of ['questions', 'selections', 'findings']) {
    const aa = maps(a, family), cc = maps(c, family), rr = maps(r, family);
    const ids = [...new Set([...aa.keys(), ...cc.keys(), ...rr.keys()])].sort();
    for (const id of ids) {
      const before = aa.get(id), left = cc.get(id), right = rr.get(id), display = left ?? right ?? before;
      if (!left && !right) continue;
      const immutableChanged = Boolean(left && right &&
        BINDINGS[family].some(key => !sameSide(propertySide(left, key), propertySide(right, key))));
      if (!left || !right || immutableChanged) {
        const boundProposal = immutableChanged || proposalBinding(family, right);
        addItem(items, context, {
          kind: 'authored-member', family, path: [family, id],
          label: NAMES[family] + ': ' + brief(display),
          subject: subject(family, id, display),
          treatment: boundProposal ? RETURN_TREATMENTS.typed : RETURN_TREATMENTS.authored,
          editable: !boundProposal && Boolean(left ?? right),
          editFields: [...FIELDS[family]],
          ...(boundProposal ? {authorityReason: immutableChanged ?
            'The native identity or binding differs. The original returned row remains in its complete branch.' :
            'The returned row depends on a source edition retained as a native proposal.'} : {}),
        }, rowSide(before), rowSide(left), rowSide(right));
        continue;
      }
      for (const field of FIELDS[family]) {
        const proposal = proposalBinding(family, right, field);
        addItem(items, context, fieldSpec(family, id, display, field,
          proposal ? RETURN_TREATMENTS.typed : RETURN_TREATMENTS.authored,
          proposal ? 'The returned value depends on a source edition retained as a native proposal.' : undefined),
          propertySide(before, field), propertySide(left, field), propertySide(right, field));
      }
      const ignored = new Set([...FIELDS[family], ...BINDINGS[family], 'updatedAt']);
      const unknown = [...new Set([...Object.keys(before ?? {}), ...Object.keys(left), ...Object.keys(right)])]
        .filter(key => !ignored.has(key)).sort();
      for (const field of unknown)
        addItem(items, context, {
          kind: 'extension', family, path: [family, id, field],
          label: NAMES[family] + ': ' + brief(display) + ' · ' + field,
          subject: subject(family, id, display, field), treatment: RETURN_TREATMENTS.extension,
          authorityReason: 'An extension stays with its current owner; the exact returned value can be retained for review.',
        }, propertySide(before, field), propertySide(left, field), propertySide(right, field));
    }
  }

  for (const id of [...new Set([...am.keys(), ...cm.keys(), ...rm.keys()])].sort()) {
    const before = am.get(id), left = cm.get(id), right = rm.get(id);
    if (!left && !right) continue;
    const immutableProposal = Boolean(left) || nativeRis(right);
    addItem(items, context, {
      kind: 'edition', family: 'editions', path: ['editions', id],
      label: 'Source edition: ' + brief(left ?? right ?? before),
      subject: subject('editions', id, left ?? right ?? before),
      treatment: immutableProposal ? RETURN_TREATMENTS.typed : RETURN_TREATMENTS.authored,
      authorityReason: immutableProposal ?
        (nativeRis(right) && !left ?
          'The original RIS import has revision-bound review authority and remains a complete native branch proposal.' :
          'Existing edition identities and source bindings remain immutable in the current dossier.') :
        'A selected new ordinary edition retains its complete original identity, provenance and raw source binding.',
    }, rowSide(before), rowSide(left), rowSide(right));
  }

  for (const family of RETURN_TYPED_FAMILIES)
    addItem(items, context, {
      kind: 'typed-family', family, path: [family], label: NAMES[family],
      subject: {family}, treatment: RETURN_TREATMENTS.typed,
      authorityReason: 'Original operation IDs, requests, revisions, dependencies and result graphs remain valid in the retained branch.',
    }, propertySide(a, family), propertySide(c, family), propertySide(r, family));

  const extensions = [...new Set([...Object.keys(a), ...Object.keys(c), ...Object.keys(r)])]
    .filter(key => !AUTHORED.has(key) && !TYPED.has(key) && !META.has(key)).sort();
  if (!sameSide(propertySide(c, 'createdAt'), propertySide(r, 'createdAt'))) extensions.unshift('createdAt');
  for (const key of extensions)
    addItem(items, context, {
      kind: 'extension', family: key, path: [key], label: 'Retained extension: ' + key,
      subject: {family: key}, treatment: RETURN_TREATMENTS.extension,
      authorityReason: 'The existing current value remains authoritative; the complete returned value remains source-bound.',
    }, propertySide(a, key), propertySide(c, key), propertySide(r, key));

  const result = {schema: RETURN_SCHEMAS.comparison, dossierId: current.state.id,
    source: returnClone(source), base: context.base, current: context.current,
    returned: context.returned, items, counts: countsFor(items)};
  const comparisonSha256 = returnDigest(comparisonIdentity(result));
  return {...result, id: 'drv_' + comparisonSha256, reviewId: 'drv_' + comparisonSha256, comparisonSha256};
}

/** Validate a retained comparison; supplying envelopes additionally proves completeness. */
export function validateReturnComparison(value, originals) {
  returnNeed(returnPlain(value) && value.schema === RETURN_SCHEMAS.comparison, 'RETURN_COMPARISON_INVALID');
  validateReturnSource(value.source);
  validateReturnId(value.reviewId, 'comparison');
  returnNeed(value.id === value.reviewId && returnSha(value.comparisonSha256) &&
    value.id === 'drv_' + value.comparisonSha256 && value.dossierId === value.source.dossierId &&
    Array.isArray(value.items), 'RETURN_COMPARISON_INVALID');
  for (const pin of [value.base, value.current, value.returned])
    returnNeed(returnPlain(pin) && returnRevision(pin.revision) && returnSha(pin.sha256),
      'RETURN_COMPARISON_INVALID');
  returnNeed(value.returned.revision === value.source.incomingHead.revision &&
    value.returned.sha256 === value.source.incomingHead.sha256, 'RETURN_SOURCE_CHANGED');
  const context = {source: wirePin(value.source), dossierId: value.dossierId,
    base: value.base, current: value.current, returned: value.returned};
  const ids = new Set();
  for (const item of value.items) {
    returnNeed(returnPlain(item) && typeof item.kind === 'string' && typeof item.family === 'string' &&
      Array.isArray(item.path) && item.path.length > 0 &&
      item.path.every(part => typeof part === 'string' && part.length > 0) &&
      Object.values(RETURN_TREATMENTS).includes(item.treatment), 'RETURN_COMPARISON_INVALID');
    validateReturnId(item.id, 'item');
    returnNeed(!ids.has(item.id), 'RETURN_COMPARISON_INVALID'); ids.add(item.id);
    for (const selected of [item.base, item.current, item.returned]) {
      returnNeed(returnPlain(selected) && typeof selected.present === 'boolean' &&
        (selected.present === Object.hasOwn(selected, 'value')) && returnSha(selected.sha256) &&
        typeof selected.summary === 'string', 'RETURN_COMPARISON_INVALID');
      const expected = side(selected.present, selected.value);
      returnNeed(returnEqual(selected, expected), 'RETURN_COMPARISON_CHANGED');
    }
    returnNeed(!sameSide(item.current, item.returned) &&
      item.id === 'dri_' + itemIdentity(context, item), 'RETURN_COMPARISON_CHANGED');
    returnNeed(Array.isArray(item.allowedChoices) &&
      item.allowedChoices[0] === 'CURRENT' && item.allowedChoices[1] === 'RETURNED' &&
      (item.allowedChoices.length === 2 || item.allowedChoices.length === 3 &&
        item.allowedChoices[2] === 'EDIT' && item.treatment === RETURN_TREATMENTS.authored),
      'RETURN_COMPARISON_INVALID');
  }
  returnNeed(returnDigest(comparisonIdentity(value)) === value.comparisonSha256 &&
    returnEqual(value.counts, countsFor(value.items)), 'RETURN_COMPARISON_CHANGED');
  if (originals) {
    const rebuilt = buildReturnComparison(originals);
    returnNeed(returnEqual(rebuilt, value), 'RETURN_COMPARISON_CHANGED');
  }
  return value;
}

function invalidDecision(itemId, reason, extra = {}) {
  throw new ReturnError('RETURN_DECISION_INVALID', {
    requirements: [{itemId, reason, ...extra}],
  });
}
function editedValue(item, value) {
  if (item.treatment !== RETURN_TREATMENTS.authored || !item.allowedChoices.includes('EDIT'))
    invalidDecision(item.id, 'This item does not accept authored edits.');
  returnCanonical(value);
  if (item.path.length === 1) {
    if (item.path[0] === 'title' && !returnText(value, 240))
      invalidDecision(item.id, 'Use a nonempty dossier title of at most 240 characters.');
    if (item.path[0] === 'description' && !returnText(value, 20000, true))
      invalidDecision(item.id, 'Use a description of at most 20,000 characters.');
  } else if (item.path.length === 2) {
    const template = item.current.present ? item.current.value : item.returned.value;
    if (!returnPlain(value) || !returnPlain(template))
      invalidDecision(item.id, 'An edited member must retain its complete original object.');
    const fields = FIELDS[item.family];
    if (!fields) invalidDecision(item.id, 'This native binding is immutable.');
    const left = returnClone(template), right = returnClone(value);
    for (const field of fields) { delete left[field]; delete right[field]; }
    if (!returnEqual(left, right))
      invalidDecision(item.id, 'Preserve the original identity, creation time, source binding and extension fields.', {editableFields: fields});
  } else if (item.path.length !== 3 || !FIELDS[item.family]?.includes(item.path[2])) {
    invalidDecision(item.id, 'Only native authored fields can be edited.');
  }
  return returnClone(value);
}
export function validateReturnDecisions(comparison, decisions) {
  validateReturnComparison(comparison);
  returnNeed(Array.isArray(decisions) && returnBytes(decisions) <= RETURN_LIMITS.reviewBytes,
    'RETURN_DECISION_INVALID', {requirements: [{reason: 'Provide the complete bounded decision array.'}]});
  const byId = new Map();
  for (const decision of decisions) {
    if (!returnPlain(decision) || typeof decision.itemId !== 'string' ||
      Object.keys(decision).some(key => !['itemId', 'choice', 'value'].includes(key)))
      invalidDecision(decision?.itemId ?? null, 'A decision contains an unsupported field or lacks its item identity.');
    if (byId.has(decision.itemId)) invalidDecision(decision.itemId, 'Provide exactly one decision for this item.');
    byId.set(decision.itemId, decision);
  }
  const known = new Set(comparison.items.map(item => item.id));
  for (const id of byId.keys()) if (!known.has(id)) invalidDecision(id, 'This item is not in the retained comparison.');
  const missing = comparison.items.filter(item => !byId.has(item.id));
  if (missing.length) throw new ReturnError('RETURN_DECISION_INVALID', {
    requirements: missing.map(item => ({itemId: item.id, reason: 'An explicit choice is required.'})),
  });
  return comparison.items.map(item => {
    const decision = byId.get(item.id);
    if (!item.allowedChoices.includes(decision.choice))
      invalidDecision(item.id, 'Select one of the published choices.', {allowedChoices: item.allowedChoices});
    if (decision.choice === 'EDIT') {
      if (!Object.hasOwn(decision, 'value')) invalidDecision(item.id, 'Supply the complete edited value.');
      return {itemId: item.id, choice: 'EDIT', value: editedValue(item, decision.value)};
    }
    if (Object.hasOwn(decision, 'value')) invalidDecision(item.id, 'A branch choice uses its exact retained value.');
    return {itemId: item.id, choice: decision.choice};
  });
}

function applyAuthored(state, item, selected) {
  const [family, id, field] = item.path;
  if (item.path.length === 1) {
    if (!selected.present) invalidDecision(item.id, 'A required dossier field cannot be removed.');
    state[family] = returnClone(selected.value);
    return;
  }
  const idField = ID_FIELD[family];
  returnNeed(idField && Array.isArray(state[family]), 'RETURN_COMPARISON_INVALID');
  const index = state[family].findIndex(row => row[idField] === id);
  if (item.path.length === 2) {
    if (!selected.present) {
      if (index >= 0) state[family].splice(index, 1);
    } else if (index < 0) {
      state[family].push(returnClone(selected.value));
    } else {
      state[family][index] = returnClone(selected.value);
    }
  } else {
    if (index < 0) invalidDecision(item.id, 'The selected authored field requires its original member.', {family, id});
    if (!selected.present) invalidDecision(item.id, 'A required authored field cannot be removed.');
    state[family][index][field] = returnClone(selected.value);
  }
}
function assertCurrentAuthority(current, state) {
  for (const key of Object.keys(current))
    if (!AUTHORED.has(key))
      returnNeed(has(state, key) && returnEqual(current[key], state[key]), 'RETURN_CURRENT_AUTHORITY_CHANGED', {field: key});
  for (const key of Object.keys(state))
    if (!AUTHORED.has(key))
      returnNeed(has(current, key), 'RETURN_CURRENT_AUTHORITY_CHANGED', {field: key});
  const editions = maps(state, 'editions');
  for (const row of current.editions)
    returnNeed(editions.has(row.id) && returnEqual(row, editions.get(row.id)),
      'RETURN_CURRENT_AUTHORITY_CHANGED', {editionId: row.id});
  for (const family of ['questions', 'selections', 'findings']) {
    const present = maps(state, family);
    for (const before of current[family]) {
      const after = present.get(before[ID_FIELD[family]]);
      if (!after) continue; // Explicit authored deletion is checked by native dependencies.
      const original = returnClone(before), next = returnClone(after);
      for (const field of FIELDS[family]) { delete original[field]; delete next[field]; }
      returnNeed(returnEqual(original, next), 'RETURN_CURRENT_AUTHORITY_CHANGED',
        {family, id: before[ID_FIELD[family]]});
    }
  }
}

/**
 * Resolve exactly the retained comparison. The returned state keeps current
 * revision metadata, all current typed histories and current unknown extensions.
 * The owning store performs its original raw-source/typed validation and one CAS.
 */
export function resolveReturnComparison(comparison, decisions, {currentState, returnedState, baseState} = {}) {
  const originals = {
    source: comparison?.source,
    current: {state: currentState, sha256: returnNativeDigest(currentState)},
    returned: {state: returnedState, sha256: returnNativeDigest(returnedState)},
    base: {state: baseState, sha256: returnNativeDigest(baseState)},
  };
  validateReturnComparison(comparison, originals);
  const chosen = validateReturnDecisions(comparison, decisions);
  const state = returnClone(currentState), changes = [], proposals = [];
  for (let index = 0; index < comparison.items.length; index++) {
    const item = comparison.items[index], decision = chosen[index];
    if (item.treatment !== RETURN_TREATMENTS.authored) {
      if (decision.choice === 'RETURNED') proposals.push({
        itemId: item.id, kind: item.kind, family: item.family, path: returnClone(item.path),
        treatment: item.treatment, disposition: 'RETAINED_RETURNED_PROPOSAL',
        activeAuthority: 'CURRENT', sourceId: comparison.source.id,
        comparisonSha256: comparison.comparisonSha256, returnedHead: returnClone(comparison.returned),
        current: {present: item.current.present, sha256: item.current.sha256},
        returned: {present: item.returned.present, sha256: item.returned.sha256},
      });
      continue;
    }
    const selected = decision.choice === 'EDIT' ? side(true, decision.value) :
      decision.choice === 'RETURNED' ? item.returned : item.current;
    if (!sameSide(item.current, selected)) {
      applyAuthored(state, item, selected);
      changes.push({itemId: item.id, kind: item.kind, family: item.family,
        path: returnClone(item.path), choice: decision.choice,
        before: returnClone(item.current), after: returnClone(selected)});
    }
  }
  assertCurrentAuthority(currentState, state);
  validateReturnAuthoredState(state);
  return {state, decisions: chosen, proposals, changes};
}

/**
 * Validate the native authored graph without acquiring provider data. The store's
 * original validator additionally resolves retained raw occurrence membership and
 * every typed operation graph; opaque reference-only handles retain that native rule.
 */
export function validateReturnAuthoredState(state) {
  const requirements = [];
  const need = (condition, reason, details = {}) => {
    if (!condition) requirements.push({reason, ...details});
  };
  need(returnPlain(state), 'Use the complete original native dossier state.');
  if (!returnPlain(state)) throw new ReturnError('RETURN_DECISION_INVALID', {requirements});
  need(state.schema === 'sf88-research-dossier-v1' && returnDossierId(state.id) &&
    returnRevision(state.revision), 'Preserve the native dossier identity and revision.');
  need(returnText(state.title, 240) && returnText(state.description, 20000, true),
    'Use the native dossier title and description limits.');
  need(returnTime(state.createdAt) && returnTime(state.updatedAt) && returnText(state.change, 1000),
    'Preserve native revision metadata.');
  for (const family of ['questions', 'editions', 'selections', 'findings'])
    need(Array.isArray(state[family]), 'Retain the complete native collection.', {family});
  if (requirements.length) throw new ReturnError('RETURN_DECISION_INVALID', {requirements});
  const questions = new Map(), editions = new Map(), selections = new Map(), findings = new Set();
  for (const row of state.questions) {
    const valid = returnPlain(row) && uuidId(row.id, 'q') && returnText(row.text, 4000) &&
      returnText(row.notes, 100000, true) && ['open', 'answered', 'parked'].includes(row.status) &&
      returnTime(row.createdAt) && (row.updatedAt === undefined || returnTime(row.updatedAt));
    need(valid, 'Use a valid original question and authored fields.', {questionId: row?.id ?? null});
    if (!valid) continue;
    need(!questions.has(row.id), 'Question identities must be unique.', {questionId: row.id});
    questions.set(row.id, row);
  }
  for (const row of state.editions) {
    const valid = returnPlain(row) && editionId(row.id) && returnText(row.label, 240) &&
      returnText(row.provider, 80) && returnTime(row.createdAt);
    need(valid, 'Use a complete immutable source edition.', {editionId: row?.id ?? null});
    if (!valid) continue;
    need(questions.has(row.questionId), 'Select the original question required by this edition.',
      {editionId: row.id, questionId: row.questionId});
    need(!editions.has(row.id), 'Edition identities must be unique.', {editionId: row.id});
    editions.set(row.id, row);
    if (row.mode === 'retained') {
      need(returnPlain(row.raw) && returnSha(row.raw.sha256) &&
        Number.isSafeInteger(row.raw.bytes) && row.raw.bytes >= 0 && row.raw.bytes <= RETURN_LIMITS.chunkBytes &&
        returnText(row.sourceReference, 4000, true) && returnText(row.sourceTerms, RETURN_LIMITS.chunkBytes) &&
        (row.origin === undefined || row.origin === null || returnPlain(row.origin)),
        'Preserve the exact retained bytes, source provenance and terms.', {editionId: row.id});
    } else {
      const keys = new Set(['id', 'editionId', 'queryId', 'workspaceId', 'operationId']);
      need(row.mode === 'reference' && /^[a-z0-9-]+$/.test(row.provider) &&
        returnPlain(row.reference) && Object.keys(row.reference).length > 0 &&
        (typeof row.reference.editionId === 'string' || typeof row.reference.id === 'string') &&
        Object.entries(row.reference).every(([key, value]) => keys.has(key) && returnText(value, 512)),
        'Preserve the original reference-only provider binding.', {editionId: row.id});
    }
  }
  for (const row of state.selections) {
    const valid = returnPlain(row) && occurrenceId(row.occurrenceId) &&
      returnText(row.key, 512) && typeof row.selected === 'boolean' &&
      returnText(row.note, 100000, true) &&
      ['supports', 'contradicts', 'background', 'unreviewed'].includes(row.classification) &&
      returnTime(row.updatedAt);
    need(valid, 'Use a complete exact occurrence selection.', {occurrenceId: row?.occurrenceId ?? null});
    if (!valid) continue;
    const edition = editions.get(row.editionId);
    need(edition && edition.questionId === row.questionId && questions.has(row.questionId),
      'Select the exact original edition and question required by this occurrence.',
      {occurrenceId: row.occurrenceId, editionId: row.editionId, questionId: row.questionId});
    need(row.occurrenceId === 'o_' + digest(row.editionId + '\n' + row.key),
      'Preserve the occurrence identity derived from its exact edition and source key.',
      {occurrenceId: row.occurrenceId, editionId: row.editionId, key: row.key});
    need(!selections.has(row.occurrenceId), 'Occurrence selections must be unique.',
      {occurrenceId: row.occurrenceId});
    selections.set(row.occurrenceId, row);
  }
  for (const row of state.findings) {
    const valid = returnPlain(row) && uuidId(row.id, 'f') && returnText(row.title, 240) &&
      returnText(row.text, 100000) && Array.isArray(row.occurrenceIds) &&
      row.occurrenceIds.every(occurrenceId) && new Set(row.occurrenceIds).size === row.occurrenceIds.length &&
      returnTime(row.createdAt) && (row.updatedAt === undefined || returnTime(row.updatedAt));
    need(valid, 'Use a valid original finding and exact cited occurrence identities.', {findingId: row?.id ?? null});
    if (!valid) continue;
    need(questions.has(row.questionId), 'Select the original question required by this finding.',
      {findingId: row.id, questionId: row.questionId});
    need(!findings.has(row.id), 'Finding identities must be unique.', {findingId: row.id});
    findings.add(row.id);
    for (const id of row.occurrenceIds) {
      const selected = selections.get(id);
      need(!selected || selected.questionId === row.questionId,
        'A finding can cite only occurrences belonging to its question.',
        {findingId: row.id, occurrenceId: id, questionId: row.questionId});
    }
  }
  if (requirements.length) throw new ReturnError('RETURN_DECISION_INVALID', {requirements});
  returnNeed(returnBytes(state) <= RETURN_LIMITS.stateBytes, 'RETURN_STATE_TOO_LARGE');
  return state;
}
