/**
 * OCDS source inspection and comparison with no runtime dependencies.
 * Contracts: OCDS 1.1.5 (package version 1.1), release and record schemas.
 * https://standard.open-contracting.org/schema/1__1__5/release-schema.json
 * https://standard.open-contracting.org/latest/en/schema/records_reference/
 *
 * Entries are original documents. This module does not compile release history.
 * Document comparison is separate from the OCDS release merge algorithm.
 */

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const array = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value : null;
const scalarId = value => typeof value === 'string' || (typeof value === 'number' && Number.isInteger(value));
const idKey = value => typeof value + ':' + JSON.stringify(value);
const escapePointer = value => String(value).replace(/~/g, '~0').replace(/\//g, '~1');
const pointer = (base, key) => base + '/' + escapePointer(key);
const nonempty = value => typeof value === 'string' && value.length > 0;
const RELEASE_TAGS = new Set(['planning', 'planningUpdate', 'tender', 'tenderAmendment',
  'tenderUpdate', 'tenderCancellation', 'award', 'awardUpdate', 'awardCancellation',
  'contract', 'contractUpdate', 'contractAmendment', 'implementation',
  'implementationUpdate', 'contractTermination', 'compiled']);
const IDENTIFIED_COLLECTIONS = new Set(['parties', 'awards', 'contracts', 'items', 'documents',
  'milestones', 'transactions', 'amendments', 'relatedProcesses']);

export class OcdsInputError extends Error {
  constructor(message, code = 'INVALID_JSON') {
    super(message);
    this.name = 'OcdsInputError';
    this.code = code;
  }
}

function diagnostic(list, severity, code, message, path = '', extra = {}) {
  list.push({ severity, code, message, path, ...extra });
}

function assertJsonTree(root) {
  const active = new WeakSet();
  const stack = [{ value: root, path: '', leave: false }];
  while (stack.length) {
    const item = stack.pop(), value = item.value;
    if (item.leave) { active.delete(value); continue; }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new OcdsInputError('Number exceeds the finite runtime range at ' + (item.path || '/'), 'UNSUPPORTED_NUMBER');
    }
    if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) continue;
    if (typeof value !== 'object') throw new OcdsInputError('Non-JSON value at ' + (item.path || '/'));
    if (active.has(value)) throw new OcdsInputError('Cyclic input at ' + (item.path || '/'));
    const proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) {
      throw new OcdsInputError('Expected a plain JSON object at ' + (item.path || '/'));
    }
    active.add(value);
    stack.push({ value, leave: true });
    const keys = Object.keys(value);
    for (let i = keys.length - 1; i >= 0; i--) {
      stack.push({ value: value[keys[i]], path: pointer(item.path, keys[i]), leave: false });
    }
  }
}

function walk(root, visit) {
  const stack = [{ value: root, path: '' }];
  while (stack.length) {
    const node = stack.pop();
    const descend = visit(node.value, node.path);
    if (descend === false || node.value === null || typeof node.value !== 'object') continue;
    const keys = Object.keys(node.value);
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      stack.push({ value: node.value[key], path: pointer(node.path, key) });
    }
  }
}

function numericDiagnostics(root, list) {
  walk(root, (value, path) => {
    if (typeof value !== 'number') return;
    if (!Number.isFinite(value)) {
      diagnostic(list, 'error', 'NONFINITE_NUMBER', 'This number exceeds the finite JSON number range supported by the runtime.', path);
    } else if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      diagnostic(list, 'warning', 'UNSAFE_INTEGER', 'This integer is outside the exact JavaScript integer range. Consult the retained original source bytes for its digits.', path);
    }
  });
}

function validDateTime(value) {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if (!parts) return false;
  const [, y, m, d, h, min, sec, zone] = parts;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(h) > 23 || Number(min) > 59 || Number(sec) > 60) return false;
  return zone.toUpperCase() === 'Z' || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4, 6)) <= 59);
}

function valueView(value) {
  if (!object(value)) return null;
  return {
    amount: own(value, 'amount') ? value.amount : null,
    currency: own(value, 'currency') ? value.currency : null,
    amountPresent: own(value, 'amount'),
    currencyPresent: own(value, 'currency'),
  };
}

function organizationView(value) {
  if (!object(value)) return null;
  return { id: scalarId(value.id) ? value.id : null, name: text(value.name) };
}

function stageOf(document) {
  const weights = { planning: 1, tender: 2, award: 3, contract: 4, implementation: 5 };
  let stage = null;
  for (const tag of array(document.tag)) {
    const candidate = typeof tag === 'string' && Object.keys(weights).find(key => tag.startsWith(key));
    if (candidate && (!stage || weights[candidate] > weights[stage])) stage = candidate;
  }
  if (stage) return stage;
  if (array(document.contracts).some(contract => object(contract) && object(contract.implementation) && Object.keys(contract.implementation).length)) return 'implementation';
  if (array(document.contracts).length) return 'contract';
  if (array(document.awards).length) return 'award';
  if (object(document.tender)) return 'tender';
  if (object(document.planning)) return 'planning';
  return 'unknown';
}

function commonStatus(values) {
  const statuses = [...new Set(values.filter(nonempty))];
  return statuses.length === 1 ? statuses[0] : statuses.length ? 'mixed' : null;
}

function versionedValues(value) {
  return Array.isArray(value) && value.length > 0 && value.every(item => object(item)
    && Object.keys(item).length === 4 && ['releaseID', 'releaseDate', 'releaseTag', 'value'].every(key => own(item, key)));
}

function historyFields(document) {
  const fields = [];
  walk(document, (value, path) => {
    if (versionedValues(value)) { fields.push({ path, revisions: value }); return false; }
  });
  return fields;
}

function historySummary(document, fields = historyFields(document)) {
  return {
    ocid: text(document.ocid), title: 'Version history', buyer: null, stage: 'history', status: null,
    description: null, procurementMethod: null, values: [], dates: {}, parties: [], awards: [], contracts: [],
    documents: [], references: [], links: [],
    counts: { parties: 0, awards: 0, contracts: 0, documents: 0, milestones: 0, transactions: 0,
      versionedFields: fields.length, revisions: fields.reduce((total, field) => total + field.revisions.length, 0) },
  };
}

/** Project only information present in the selected original document. */
export function summarizeDocument(document) {
  if (!object(document)) throw new OcdsInputError('A release summary requires an object.', 'INVALID_DOCUMENT');
  if (!own(document, 'tag') && !own(document, 'date')) {
    const fields = historyFields(document);
    if (fields.length) return historySummary(document, fields);
  }
  const tender = object(document.tender) ? document.tender : {};
  const planning = object(document.planning) ? document.planning : {};
  const parties = [];
  array(document.parties).forEach((party, index) => {
    if (object(party)) parties.push({ ...organizationView(party),
      roles: array(party.roles).filter(value => typeof value === 'string'), path: '/parties/' + index });
  });
  const partyById = new Map();
  for (const party of parties) if (party.id !== null && !partyById.has(idKey(party.id))) partyById.set(idKey(party.id), party);
  const values = [];
  function addValue(value, stage, role, id, path) {
    if (object(value)) values.push({ stage, role, id: scalarId(id) ? id : null, ...valueView(value), path });
  }
  addValue(planning.budget?.amount, 'planning', 'budget', planning.budget?.id, '/planning/budget/amount');
  addValue(tender.value, 'tender', 'value', tender.id, '/tender/value');
  addValue(tender.minValue, 'tender', 'minimum', tender.id, '/tender/minValue');
  const references = [];
  function addReference(value, role, path) {
    const view = organizationView(value);
    if (!view) return;
    references.push({ ...view, role, path, targetPath: view.id === null ? null : partyById.get(idKey(view.id))?.path ?? null });
  }
  addReference(document.buyer, 'buyer', '/buyer');
  addReference(tender.procuringEntity, 'procuringEntity', '/tender/procuringEntity');
  array(tender.tenderers).forEach((party, index) => addReference(party, 'tenderer', '/tender/tenderers/' + index));
  const awards = [];
  array(document.awards).forEach((award, index) => {
    if (!object(award)) return;
    const path = '/awards/' + index;
    addValue(award.value, 'award', 'value', award.id, path + '/value');
    array(award.suppliers).forEach((party, supplierIndex) => addReference(party, 'supplier', path + '/suppliers/' + supplierIndex));
    awards.push({ id: scalarId(award.id) ? award.id : null, title: text(award.title), status: text(award.status),
      date: text(award.date), value: valueView(award.value), suppliers: array(award.suppliers).map(organizationView).filter(Boolean), path });
  });
  let transactionCount = 0;
  const contracts = [];
  array(document.contracts).forEach((contract, index) => {
    if (!object(contract)) return;
    const path = '/contracts/' + index;
    addValue(contract.value, 'contract', 'value', contract.id, path + '/value');
    array(contract.implementation?.transactions).forEach((transaction, transactionIndex) => {
      if (!object(transaction)) return;
      const transactionPath = path + '/implementation/transactions/' + transactionIndex;
      transactionCount++;
      addValue(transaction.value, 'implementation', 'transaction', transaction.id, transactionPath + '/value');
      addReference(transaction.payer, 'payer', transactionPath + '/payer');
      addReference(transaction.payee, 'payee', transactionPath + '/payee');
    });
    contracts.push({ id: scalarId(contract.id) ? contract.id : null, awardID: scalarId(contract.awardID) ? contract.awardID : null,
      title: text(contract.title), status: text(contract.status), dateSigned: text(contract.dateSigned),
      value: valueView(contract.value), period: object(contract.period) ? contract.period : null, path });
  });
  const documents = [], links = [];
  let milestoneCount = 0;
  walk(document, (value, path) => {
    if (!Array.isArray(value)) return;
    if (path.endsWith('/milestones')) milestoneCount += value.filter(object).length;
    if (!path.endsWith('/documents')) return;
    value.forEach((item, index) => {
      if (!object(item)) return;
      const documentPath = pointer(path, index);
      const row = { id: scalarId(item.id) ? item.id : null, title: text(item.title), documentType: text(item.documentType),
        url: text(item.url), format: text(item.format), datePublished: text(item.datePublished), dateModified: text(item.dateModified), path: documentPath };
      documents.push(row);
      if (row.url) links.push({ url: row.url, title: row.title, kind: 'document', path: documentPath + '/url' });
    });
  });
  array(document.relatedProcesses).forEach((related, index) => {
    if (object(related) && text(related.uri)) links.push({ url: related.uri, title: text(related.title), kind: 'relatedProcess', path: '/relatedProcesses/' + index + '/uri' });
  });
  const stage = stageOf(document);
  const status = stage === 'award' ? commonStatus(awards.map(award => award.status))
    : stage === 'contract' || stage === 'implementation' ? commonStatus(contracts.map(contract => contract.status))
      : text(tender.status);
  const buyer = organizationView(document.buyer);
  if (buyer && buyer.id !== null && !buyer.name) buyer.name = partyById.get(idKey(buyer.id))?.name ?? null;
  return {
    ocid: text(document.ocid), title: text(tender.title) ?? awards.find(award => award.title)?.title
      ?? contracts.find(contract => contract.title)?.title ?? text(planning.rationale) ?? text(document.ocid) ?? 'Untitled process',
    buyer, stage, status, description: text(tender.description) ?? text(planning.rationale),
    procurementMethod: text(tender.procurementMethod), values,
    dates: { release: text(document.date), tenderStart: text(tender.tenderPeriod?.startDate), tenderEnd: text(tender.tenderPeriod?.endDate),
      awardStart: text(tender.awardPeriod?.startDate), awardEnd: text(tender.awardPeriod?.endDate),
      contractStart: text(tender.contractPeriod?.startDate), contractEnd: text(tender.contractPeriod?.endDate) },
    counts: { parties: parties.length, awards: awards.length, contracts: contracts.length, documents: documents.length,
      milestones: milestoneCount, transactions: transactionCount },
    parties, awards, contracts, documents, references, links,
  };
}

function inspectRelease(document, kind, path, diagnostics, recordOcid) {
  const context = { ocid: text(document.ocid) };
  const required = kind === 'versionedRelease' ? ['ocid'] : ['ocid', 'id', 'date', 'tag', 'initiationType'];
  for (const field of required) if (!own(document, field)) {
    diagnostic(diagnostics, 'error', 'MISSING_RELEASE_FIELD', 'Required release field is missing: ' + field, pointer(path, field), context);
  }
  if (own(document, 'ocid') && !nonempty(document.ocid)) diagnostic(diagnostics, 'error', 'INVALID_OCID', 'ocid must be a nonempty string.', path + '/ocid', context);
  if (recordOcid !== undefined && document.ocid !== recordOcid) diagnostic(diagnostics, 'error', 'RECORD_OCID_MISMATCH', 'The embedded document ocid differs from its record ocid.', path + '/ocid', { ...context, recordOcid });
  if (kind === 'versionedRelease') return;
  if (own(document, 'id') && (!nonempty(document.id) || document.id.includes('#'))) diagnostic(diagnostics, 'error', 'INVALID_RELEASE_ID', 'A release id must be a nonempty string without a # character.', path + '/id', context);
  if (own(document, 'date') && !validDateTime(document.date)) diagnostic(diagnostics, 'error', 'INVALID_RELEASE_DATE', 'Release date must be an RFC 3339 date-time with a timezone.', path + '/date', context);
  if (own(document, 'initiationType') && document.initiationType !== 'tender') diagnostic(diagnostics, 'error', 'INVALID_INITIATION_TYPE', 'OCDS 1.1 initiationType must be tender.', path + '/initiationType', context);
  if (own(document, 'tag')) {
    if (!Array.isArray(document.tag) || !document.tag.length) diagnostic(diagnostics, 'error', 'INVALID_RELEASE_TAG', 'tag must be a nonempty array.', path + '/tag', context);
    else document.tag.forEach((tag, index) => {
      if (!RELEASE_TAGS.has(tag)) diagnostic(diagnostics, 'error', 'UNKNOWN_RELEASE_TAG', 'The value is outside the OCDS 1.1 releaseTag codelist.', path + '/tag/' + index, context);
    });
  }
  for (const field of ['parties', 'awards', 'contracts', 'relatedProcesses']) {
    if (own(document, field) && !Array.isArray(document[field])) diagnostic(diagnostics, 'error', 'INVALID_COLLECTION', field + ' must be an array.', pointer(path, field), context);
  }
  walk(document, (value, relative) => {
    if (!Array.isArray(value) || !IDENTIFIED_COLLECTIONS.has(relative.split('/').at(-1))) return;
    const ids = new Map();
    value.forEach((item, index) => {
      if (!object(item)) {
        diagnostic(diagnostics, 'error', 'INVALID_COLLECTION_ITEM', 'Expected an object in this collection.', path + relative + '/' + index, context);
        return;
      }
      if (!own(item, 'id') || !scalarId(item.id)) return;
      const key = idKey(item.id);
      if (ids.has(key)) diagnostic(diagnostics, 'warning', 'REPEATED_OBJECT_ID', 'Objects in this array repeat the same typed id. Both source objects are retained.', path + relative + '/' + index + '/id', { ...context, previousPath: path + relative + '/' + ids.get(key) + '/id' });
      else ids.set(key, index);
    });
  });
}

/**
 * Accept an OCDS package, individual record/release, or a JSON array of these.
 * Source pointers refer to the input JSON; documents and unknown fields survive.
 * Diagnostics cover import structure and references, not full Schema validation.
 */
export function normalizeOcds(input, meta = {}) {
  let root = input;
  if (typeof input === 'string') {
    try { root = JSON.parse(input); }
    catch (error) { throw new OcdsInputError('Could not parse JSON: ' + error.message); }
  }
  assertJsonTree(root);
  const diagnostics = [], entries = [], links = [], packages = [];
  numericDiagnostics(root, diagnostics);
  const source = { id: meta.sourceId ?? null, label: meta.label ?? null, url: meta.url ?? null,
    retrievedAt: meta.retrievedAt ?? null, kind: 'unknown', version: null, publisher: null,
    publishedDate: null, uri: null, license: null, publicationPolicy: null, extensions: [], packages };
  const identities = new Map();

  function addDocument(document, kind, sourcePointer, recordOcid) {
    if (!object(document)) { diagnostic(diagnostics, 'error', 'INVALID_RELEASE', 'Expected an object for this release.', sourcePointer); return; }
    if (kind === 'release' && array(document.tag).includes('compiled')) kind = 'compiledRelease';
    inspectRelease(document, kind, sourcePointer, diagnostics, recordOcid);
    const summary = kind === 'versionedRelease' ? historySummary(document) : summarizeDocument(document);
    const entry = { sourcePointer, kind, ocid: text(document.ocid), releaseId: text(document.id), date: text(document.date),
      tags: array(document.tag).filter(value => typeof value === 'string'), document, summary };
    if (recordOcid !== undefined) entry.recordOcid = recordOcid;
    entries.push(entry);
    if (kind !== 'versionedRelease' && entry.ocid && entry.releaseId) {
      const key = JSON.stringify([entry.ocid, entry.releaseId, kind]);
      if (identities.has(key)) {
        const previous = identities.get(key);
        const identical = equalJson(previous.document, document);
        diagnostic(diagnostics, identical ? 'info' : 'error', identical ? 'DUPLICATE_RELEASE' : 'CONFLICTING_RELEASE_ID',
          identical ? 'The same release is present more than once; every source location is retained.' : 'Different documents reuse the same release id within one ocid.', sourcePointer,
          { ocid: entry.ocid, previousPath: previous.sourcePointer });
      } else identities.set(key, entry);
    }
    if (kind !== 'versionedRelease') {
      for (const value of summary.values) {
        if (value.amountPresent && value.amount !== null && (typeof value.amount !== 'number' || !Number.isFinite(value.amount))) {
          diagnostic(diagnostics, 'error', 'INVALID_VALUE_AMOUNT', 'A monetary amount must be a finite number or null; the source value is retained.', sourcePointer + value.path + '/amount', { ocid: entry.ocid });
        }
        if (value.currencyPresent && value.currency !== null && (typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency))) {
          diagnostic(diagnostics, 'warning', 'INVALID_CURRENCY', 'A currency code should contain three uppercase letters.', sourcePointer + value.path + '/currency', { ocid: entry.ocid });
        }
      }
      for (const reference of summary.references) if (reference.id !== null && reference.targetPath === null) {
        diagnostic(diagnostics, 'info', 'PARTY_REFERENCE_OUTSIDE_DOCUMENT', 'This party id is referenced but has no parties entry in this document; it may occur in another release.', sourcePointer + reference.path,
          { ocid: entry.ocid, id: reference.id, role: reference.role });
      }
      const awardIds = new Set(summary.awards.filter(award => award.id !== null).map(award => idKey(award.id)));
      for (const contract of summary.contracts) if (contract.awardID !== null && !awardIds.has(idKey(contract.awardID))) {
        diagnostic(diagnostics, 'info', 'AWARD_REFERENCE_OUTSIDE_DOCUMENT', 'This contract refers to an award absent from this document; it may occur in another release.', sourcePointer + contract.path + '/awardID', { ocid: entry.ocid, id: contract.awardID });
      }
    }
  }

  function addLinkedRelease(link, sourcePointer, recordOcid) {
    let packageUrl = null, releaseId = null;
    if (typeof link.url === 'string') {
      try {
        const parsed = new URL(link.url);
        releaseId = parsed.hash ? decodeURIComponent(parsed.hash.slice(1)) : null;
        parsed.hash = '';
        packageUrl = parsed.href;
        if (!['http:', 'https:'].includes(parsed.protocol)) diagnostic(diagnostics, 'warning', 'LINK_SCHEME', 'Linked-release URL uses a scheme other than HTTP or HTTPS.', sourcePointer + '/url');
      } catch { diagnostic(diagnostics, 'error', 'INVALID_LINK_URL', 'Linked-release url must be an absolute URI with an encoded release id fragment.', sourcePointer + '/url'); }
    } else diagnostic(diagnostics, 'error', 'INVALID_LINK_URL', 'Linked-release url must be a string.', sourcePointer + '/url');
    if (!releaseId) diagnostic(diagnostics, 'error', 'MISSING_LINK_RELEASE_ID', 'The linked-release URL has no release-id fragment.', sourcePointer + '/url');
    if (!validDateTime(link.date)) diagnostic(diagnostics, 'error', 'INVALID_LINK_DATE', 'Linked release date must be an RFC 3339 date-time with a timezone.', sourcePointer + '/date');
    links.push({ kind: 'linkedRelease', sourcePointer, ocid: text(recordOcid), url: text(link.url), packageUrl,
      releaseId, date: text(link.date), tags: array(link.tag).filter(value => typeof value === 'string'), resolved: false, document: link });
  }

  function addRecord(record, sourcePointer) {
    if (!object(record)) { diagnostic(diagnostics, 'error', 'INVALID_RECORD', 'Expected a record object.', sourcePointer); return; }
    if (!nonempty(record.ocid)) diagnostic(diagnostics, 'error', 'INVALID_RECORD_OCID', 'A record requires a nonempty ocid.', sourcePointer + '/ocid');
    if (!Array.isArray(record.releases)) diagnostic(diagnostics, 'error', 'INVALID_RECORD_RELEASES', 'A record requires a releases array.', sourcePointer + '/releases');
    else record.releases.forEach((release, index) => {
      const releasePointer = sourcePointer + '/releases/' + index;
      if (object(release) && own(release, 'url') && !own(release, 'id') && !own(release, 'initiationType')) addLinkedRelease(release, releasePointer, record.ocid);
      else addDocument(release, 'release', releasePointer, record.ocid);
    });
    for (const kind of ['compiledRelease', 'versionedRelease']) if (own(record, kind)) addDocument(record[kind], kind, sourcePointer + '/' + kind, record.ocid);
  }

  function packageMetadata(value, sourcePointer, kind) {
    const metadata = { sourcePointer, kind, version: text(value.version), uri: text(value.uri), publishedDate: text(value.publishedDate),
      publisher: object(value.publisher) ? value.publisher : null, license: text(value.license), publicationPolicy: text(value.publicationPolicy),
      extensions: array(value.extensions).filter(item => typeof item === 'string') };
    packages.push(metadata);
    if (packages.length === 1) Object.assign(source, { version: metadata.version, uri: metadata.uri, publishedDate: metadata.publishedDate,
      publisher: metadata.publisher, license: metadata.license, publicationPolicy: metadata.publicationPolicy });
    source.extensions = [...new Set([...source.extensions, ...metadata.extensions])];
    if (!own(value, 'version')) diagnostic(diagnostics, 'warning', 'PACKAGE_VERSION_MISSING', 'The package omits version; the standard interprets this as 1.0. This workspace retains and inspects its documents.', sourcePointer + '/version');
    else if (value.version !== '1.1') diagnostic(diagnostics, /^\d+\.\d+$/.test(String(value.version)) && Number(String(value.version).split('.')[0]) > 1 ? 'error' : 'warning', 'PACKAGE_VERSION_UNSUPPORTED',
      'The importer targets OCDS 1.1. This package declares ' + String(value.version) + '; inspect the retained source for version-specific fields.', sourcePointer + '/version');
    for (const field of ['uri', 'publishedDate', 'publisher']) if (!own(value, field)) diagnostic(diagnostics, 'warning', 'PACKAGE_METADATA_MISSING', 'Package metadata is missing: ' + field, pointer(sourcePointer, field));
    if (own(value, 'extensions') && (!Array.isArray(value.extensions) || value.extensions.some(extension => typeof extension !== 'string'))) diagnostic(diagnostics, 'error', 'INVALID_EXTENSIONS', 'Package extensions must be an array of extension URLs.', sourcePointer + '/extensions');
    if (metadata.extensions.length) diagnostic(diagnostics, 'info', 'EXTENSIONS_RETAINED', 'Declared extension fields are retained without applying extension schemas.', sourcePointer + '/extensions', { extensions: metadata.extensions });
  }

  function addReleaseList(releases, path) {
    if (!Array.isArray(releases)) diagnostic(diagnostics, 'error', 'INVALID_RELEASES', 'releases must be an array.', path);
    else releases.forEach((release, index) => addDocument(release, 'release', pointer(path, index)));
  }

  const pending = [{ value: root, path: '' }];
  while (pending.length) {
    const { value, path } = pending.pop();
    if (Array.isArray(value)) {
      if (path === '') source.kind = 'collection';
      for (let i = value.length - 1; i >= 0; i--) pending.push({ value: value[i], path: pointer(path, i) });
    } else if (!object(value)) {
      diagnostic(diagnostics, 'error', 'UNKNOWN_ENVELOPE', 'Expected an OCDS release, record or package object.', path);
    } else if (own(value, 'records')) {
      if (path === '') source.kind = own(value, 'releases') ? 'mixed-package' : 'record-package';
      packageMetadata(value, path, 'record-package');
      if (!Array.isArray(value.records)) diagnostic(diagnostics, 'error', 'INVALID_RECORDS', 'records must be an array.', path + '/records');
      else value.records.forEach((record, index) => addRecord(record, path + '/records/' + index));
      if (own(value, 'releases')) {
        diagnostic(diagnostics, 'warning', 'AMBIGUOUS_PACKAGE', 'This object has both records and releases. Both collections are retained and indexed.', path);
        addReleaseList(value.releases, path + '/releases');
      }
    } else if (own(value, 'releases') && own(value, 'ocid')) {
      if (path === '') source.kind = 'record';
      addRecord(value, path);
    } else if (own(value, 'releases')) {
      if (path === '') source.kind = 'release-package';
      packageMetadata(value, path, 'release-package');
      addReleaseList(value.releases, path + '/releases');
    } else if (own(value, 'ocid') || own(value, 'tag') || own(value, 'tender')) {
      if (path === '') source.kind = 'release';
      addDocument(value, array(value.tag).includes('compiled') ? 'compiledRelease' : 'release', path);
    } else {
      diagnostic(diagnostics, 'error', 'UNKNOWN_ENVELOPE', 'The document has no recognizable OCDS package or release envelope.', path);
    }
  }
  for (const item of diagnostics) item.sourceId = source.id;
  return { source, entries, links, diagnostics };
}

function equalJson(before, after) {
  const stack = [[before, after]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (Object.is(a, b)) continue;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (const key of keys) {
      if (!own(b, key)) return false;
      stack.push([a[key], b[key]]);
    }
  }
  return true;
}

function identityArray(value) {
  const result = new Map();
  for (let index = 0; index < value.length; index++) {
    const item = value[index];
    if (!object(item) || !own(item, 'id') || !scalarId(item.id)) return null;
    const key = idKey(item.id);
    if (result.has(key)) return null;
    result.set(key, { item, index, id: item.id });
  }
  return result;
}

/**
 * Compare documents, matching unambiguous object-array ids across positions.
 * path is the after JSON Pointer (before for removals). beforePath/afterPath
 * retain both original positions. Reorders are reported as ordinary changes.
 */
export function compareDocuments(before, after) {
  assertJsonTree(before);
  assertJsonTree(after);
  const changes = [];
  const counts = { added: 0, removed: 0, changed: 0, total: 0 };
  function add(a, b, beforePath, afterPath, beforePresent, afterPresent, extra = {}) {
    const type = !beforePresent ? 'added' : !afterPresent ? 'removed' : 'changed';
    changes.push({ path: afterPresent ? afterPath : beforePath, type,
      before: beforePresent ? a : null, after: afterPresent ? b : null,
      beforePresent, afterPresent, beforePath: beforePresent ? beforePath : null,
      afterPath: afterPresent ? afterPath : null, ...extra });
    counts[type]++; counts.total++;
  }
  const pending = [{ a: before, b: after, ap: '', bp: '', presentA: true, presentB: true }];
  while (pending.length) {
    const { a, b, ap, bp, presentA, presentB, identity } = pending.pop();
    const extra = identity ? { identity } : {};
    if (!presentA || !presentB) { add(a, b, ap, bp, presentA, presentB, extra); continue; }
    if (Object.is(a, b)) continue;
    if (object(a) && object(b)) {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
      for (let i = keys.length - 1; i >= 0; i--) {
        const key = keys[i];
        pending.push({ a: a[key], b: b[key], ap: pointer(ap, key), bp: pointer(bp, key),
          presentA: own(a, key), presentB: own(b, key), identity });
      }
    } else if (Array.isArray(a) && Array.isArray(b)) {
      const aIds = identityArray(a), bIds = identityArray(b);
      if (aIds && bIds && (a.length || b.length)) {
        const commonA = [...aIds.keys()].filter(key => bIds.has(key));
        const commonB = [...bIds.keys()].filter(key => aIds.has(key));
        if (commonA.some((key, index) => key !== commonB[index])) add(a, b, ap, bp, true, true, { ...extra, reason: 'array-order' });
        const keys = [...new Set([...aIds.keys(), ...bIds.keys()])];
        for (let i = keys.length - 1; i >= 0; i--) {
          const oldItem = aIds.get(keys[i]), newItem = bIds.get(keys[i]);
          pending.push({ a: oldItem?.item, b: newItem?.item,
            ap: oldItem ? pointer(ap, oldItem.index) : ap, bp: newItem ? pointer(bp, newItem.index) : bp,
            presentA: Boolean(oldItem), presentB: Boolean(newItem), identity: { id: (newItem ?? oldItem).id, arrayPath: bp } });
        }
      } else if (!equalJson(a, b)) add(a, b, ap, bp, true, true, extra);
    } else add(a, b, ap, bp, true, true, extra);
  }
  return { changes, counts };
}

/** Typed relational rows from one selected document, with original JSON Pointers. */
export function projectRows(document) {
  if (!object(document)) throw new OcdsInputError('Export requires a release document.', 'INVALID_DOCUMENT');
  const common = { ocid: text(document.ocid), releaseId: text(document.id), releaseDate: text(document.date) };
  if (!own(document, 'tag') && !own(document, 'date')) {
    const fields = historyFields(document);
    if (fields.length) return fields.flatMap(field => field.revisions.map((revision, index) => ({
      ...common, rowType: 'field-revision', sourcePointer: pointer(field.path, index), fieldPath: field.path,
      revisionReleaseId: revision.releaseID, revisionDate: revision.releaseDate, revisionTags: revision.releaseTag, value: revision.value,
    })));
  }
  const summary = summarizeDocument(document);
  const rows = [{ ...common, rowType: 'process', sourcePointer: '', title: summary.title, description: summary.description,
    buyerId: summary.buyer?.id ?? null, buyerName: summary.buyer?.name ?? null, stage: summary.stage, status: summary.status,
    procurementMethod: summary.procurementMethod, tags: array(document.tag), ...summary.dates }];
  for (const party of summary.parties) rows.push({ ...common, rowType: 'party', sourcePointer: party.path, id: party.id, name: party.name, roles: party.roles });
  for (const award of summary.awards) rows.push({ ...common, rowType: 'award', sourcePointer: award.path, id: award.id, title: award.title, status: award.status,
    date: award.date, amount: award.value?.amount ?? null, currency: award.value?.currency ?? null, suppliers: award.suppliers });
  for (const contract of summary.contracts) rows.push({ ...common, rowType: 'contract', sourcePointer: contract.path, id: contract.id, awardID: contract.awardID,
    title: contract.title, status: contract.status, dateSigned: contract.dateSigned, amount: contract.value?.amount ?? null,
    currency: contract.value?.currency ?? null, periodStart: text(contract.period?.startDate), periodEnd: text(contract.period?.endDate) });
  for (const value of summary.values) rows.push({ ...common, rowType: 'value', sourcePointer: value.path, stage: value.stage, role: value.role,
    id: value.id, amount: value.amount, currency: value.currency, amountPresent: value.amountPresent, currencyPresent: value.currencyPresent });
  for (const item of summary.documents) rows.push({ ...common, rowType: 'document', sourcePointer: item.path,
    id: item.id, title: item.title, documentType: item.documentType, url: item.url, format: item.format,
    datePublished: item.datePublished, dateModified: item.dateModified });
  walk(document, (value, path) => {
    if (!Array.isArray(value)) return;
    const collection = path.split('/').at(-1);
    if (!['transactions', 'milestones', 'items'].includes(collection)) return;
    value.forEach((item, index) => {
      if (!object(item)) return;
      const sourcePointer = pointer(path, index);
      if (collection === 'transactions') rows.push({ ...common, rowType: 'transaction', sourcePointer, id: item.id ?? null,
        date: text(item.date), amount: item.value?.amount ?? null, currency: item.value?.currency ?? null,
        payerId: item.payer?.id ?? null, payeeId: item.payee?.id ?? null, source: text(item.source), uri: text(item.uri) });
      else if (collection === 'milestones') rows.push({ ...common, rowType: 'milestone', sourcePointer, id: item.id ?? null, title: text(item.title),
        type: text(item.type), status: text(item.status), dueDate: text(item.dueDate), dateMet: text(item.dateMet), dateModified: text(item.dateModified) });
      else rows.push({ ...common, rowType: 'item', sourcePointer, id: item.id ?? null, description: text(item.description),
        quantity: own(item, 'quantity') ? item.quantity : null, classificationScheme: text(item.classification?.scheme),
        classificationId: item.classification?.id ?? null, classificationDescription: text(item.classification?.description),
        unitId: item.unit?.id ?? null, unitName: text(item.unit?.name), unitPriceAmount: item.unit?.value?.amount ?? null,
        unitPriceCurrency: item.unit?.value?.currency ?? null });
    });
  });
  return rows;
}
