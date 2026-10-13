// MIT. Complete portable draft review for the original Service buyer workbench.
export const SERVICE_BUYER_DRAFT_SCHEMA = 'stellar-forge.service-buyer-browser-draft.v1';
export const SERVICE_BUYER_DRAFT_LIMIT = 2 * 1024 * 1024;
const need = (value, message) => { if (!value) throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const own = (value, keys, label) => {
  need(object(value) && Object.keys(value).every(key => keys.includes(key)), 'Use the complete original ' + label + ' shape.');
};
const string = (value, maximum, label) => need(typeof value === 'string' && value.length <= maximum && !value.includes('\u0000'), 'Retain a complete text value for ' + label + '.');
export function sameServiceBuyerDraftScope(left, right) {
  return ['caseId','captureOutcomeId','buyerWorkspace','workspaceId'].every(key =>
    typeof left?.[key] === 'string' && left[key].length > 0 && left[key] === right?.[key]);
}
export function reviewServiceBuyerDraft(value, {scope, fieldSpec} = {}) {
  own(value, ['schema','scope','savedAt','caseRevision','fields','allocations','labels','labelBasis','centerBasis','periodBasis'], 'buyer draft');
  need(value.schema === SERVICE_BUYER_DRAFT_SCHEMA, 'Choose an original Service buyer draft JSON file.');
  own(value.scope, ['caseId','captureOutcomeId','buyerWorkspace','workspaceId'], 'draft scope');
  need(sameServiceBuyerDraftScope(value.scope, scope), 'This draft belongs to another original case, capture, alias or buyer workspace. Open that exact workflow first.');
  need(typeof value.savedAt === 'string' && Number.isFinite(Date.parse(value.savedAt)), 'Retain the original saved draft time.');
  need(value.caseRevision === null || /^[a-f0-9]{64}$/.test(value.caseRevision || ''), 'Retain the original draft case revision.');
  need(object(value.fields) && object(fieldSpec), 'Read the complete original buyer form before receiving its draft.');
  const expected = Object.keys(fieldSpec).sort(), supplied = Object.keys(value.fields).sort();
  need(JSON.stringify(expected) === JSON.stringify(supplied), 'The draft and this installed buyer form have different fields. Select their matching original application edition.');
  for (const [id, spec] of Object.entries(fieldSpec)) {
    if (spec.type === 'boolean') need(typeof value.fields[id] === 'boolean', 'Retain the original checkbox value for ' + id + '.');
    else string(value.fields[id], spec.maximum || 65536, id);
  }
  const actions = fieldSpec['buyer-action']?.options || [];
  need(actions.includes(value.fields['buyer-action']), 'This application cannot receive the selected original buyer operation.');
  for (const [name, keys] of [['allocations',['center','amount','project','account']], ['labels',['network','asset','symbol','decimals']]]) {
    need(Array.isArray(value[name]) && value[name].length <= 10000, 'Retain the complete original ' + name + ' rows.');
    for (const row of value[name]) {
      own(row, keys, name + ' row');
      need(keys.every(key => Object.hasOwn(row,key)), 'Receive every field of each original ' + name + ' row.');
      for (const key of keys) string(row[key], 65536, name + ' ' + key);
    }
  }
  for (const key of ['labelBasis','centerBasis','periodBasis']) {
    const basis = value[key];
    need(basis === null || object(basis), 'Retain the original loaded edit basis for ' + key + '.');
    if (basis) {
      need(basis.buyer === scope.buyerWorkspace, 'The original edit basis belongs to another buyer alias.');
      if (key === 'labelBasis') {
        own(basis, ['buyer','labels'], 'label basis');
        need(Array.isArray(basis.labels), 'Retain the full original label basis.');
      } else {
        own(basis, ['buyer','original'], 'edit basis');
        need(object(basis.original), 'Retain the complete original edit record.');
      }
    }
  }
  return clone(value);
}
