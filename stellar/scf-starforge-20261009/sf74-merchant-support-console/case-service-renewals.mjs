import {randomUUID, createHash} from 'node:crypto';
import {parseWorkspace, serializeWorkspace, workspaceDraft} from './workspace-file.mjs';
import {createServiceRecord, validateServiceRecord, serviceCanonical, serviceSha256} from './service-commitments.mjs';
import {
  previewServiceRenewal, retainServiceRenewal, recordServiceRenewalDecision,
  buildServiceRenewalQueue, serviceRenewalError, validateServiceRenewalHandover
} from './service-renewals.mjs';
import {commercialContext} from './commercial-quote.mjs';
import {commissioningFileBytes} from './commissioning.mjs';

export const CASE_SERVICE_RENEWALS_SCHEMA = 'stellar-forge.merchant-case-service-renewals.v1';
export const SERVICE_RENEWAL_HANDOVER_SCHEMA = 'stellar-forge.merchant-service-renewal-handover.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const copy = value => JSON.parse(JSON.stringify(value));
const need = (condition, message, code = 'SERVICE_RENEWAL_INVALID', status = 422) => {
  if (!condition) throw serviceRenewalError(code, message, status);
};
function object(value, allowed, label) {
  need(value && typeof value === 'object' && !Array.isArray(value), 'Provide ' + label + ' as an object.');
  for (const key of Object.keys(value)) need(allowed.includes(key), 'Unknown ' + label + ' field: ' + key + '.');
  return value;
}
function caseId(value) {
  need(typeof value === 'string' && UUID.test(value), 'Choose the original case ID.');
  return value;
}
function revision(value) {
  need(typeof value === 'string' && SHA.test(value), 'Open the case revision before changing its renewal.');
  return value;
}
function requestId(value) {
  need(typeof value === 'string' && UUID.test(value), 'Use one original UUID request ID for this change and its retries.');
  return value;
}
function integer(value, fallback, min, max, label) {
  value ??= fallback;
  need(Number.isSafeInteger(value) && value >= min && value <= max, 'Choose a valid ' + label + '.');
  return value;
}
function summary(value) {
  return Object.fromEntries(Object.entries({
    id: value.id, revision: value.revision,
    currentRevision: value.currentRevision ?? value.revision,
    name: value.name, metadata: value.metadata, updatedAt: value.updatedAt
  }).filter(([, field]) => field !== undefined));
}
function heads(rows) {
  const result = new Map();
  for (const row of rows ?? []) if (!result.has(row.id) || result.get(row.id).revision < row.revision) result.set(row.id, row);
  return [...result.values()].sort((a, b) => a.id.localeCompare(b.id));
}
const ref = row => row ? {id: row.id, revision: row.revision, sha256: row.sha256} : null;
function resolve(rows, reference, label) {
  if (reference === null || reference === undefined) return null;
  const found = rows.find(row => row.id === reference.id && row.revision === reference.revision && row.sha256 === reference.sha256);
  need(found, 'The retained ' + label + ' is unavailable in this case revision.', 'SERVICE_RENEWAL_HISTORY_CONFLICT', 409);
  return found;
}
function current(value, expectedRevision) {
  need((value.currentRevision ?? value.revision) === expectedRevision,
    'The case has a newer revision. Open it before changing the renewal.', 'CASE_CONFLICT', 409);
}
function newestResponse(rows) {
  return [...rows].sort((a, b) => b.payload.observedAt.localeCompare(a.payload.observedAt) ||
    b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0] ?? null;
}
function boundInput(args, action) {
  object(args, action === 'preview' ? ['id', 'expectedRevision', 'input'] :
    ['id', 'expectedRevision', 'requestId', 'input'], 'case renewal request');
  caseId(args.id);
  revision(args.expectedRevision);
  need(args.input && typeof args.input === 'object' && !Array.isArray(args.input), 'Provide the renewal inputs as an object.');
  const input = copy(args.input);
  need(input.expectedCaseRevision === undefined || input.expectedCaseRevision === args.expectedRevision,
    'The renewal inputs select another case revision.', 'SERVICE_RENEWAL_OPERATION_CONFLICT', 409);
  const selectedRequest = action === 'preview' ? (input.requestId ?? randomUUID()) : requestId(args.requestId);
  requestId(selectedRequest);
  need(input.requestId === undefined || input.requestId === selectedRequest,
    'The renewal inputs select another request ID.', 'SERVICE_RENEWAL_OPERATION_CONFLICT', 409);
  return {...input, requestId: selectedRequest, expectedCaseRevision: args.expectedRevision};
}

/** Original case files remain the sole writer and history for renewal work. */
export function openCaseServiceRenewals({caseStore, commercialDesk, workspaceId} = {}) {
  need(caseStore && typeof caseStore.read === 'function' && typeof caseStore.save === 'function' &&
    typeof caseStore.list === 'function', 'Open the original case store.');
  need(workspaceId === undefined || typeof workspaceId === 'string' && workspaceId.trim(),
    'Choose the original commercial workspace identity.');
  async function workspaceIdentity(id) {
    if (workspaceId !== undefined) return workspaceId;
    need(commercialDesk && typeof commercialDesk.read === 'function',
      'Provide the original commercial workspace identity or desk.');
    const commercialView = await commercialDesk.read({id});
    need(typeof commercialView.scope?.workspaceId === 'string' && commercialView.scope.workspaceId,
      'The commercial desk did not return its workspace identity.');
    return commercialView.scope.workspaceId;
  }
  async function load(id, selectedRevision = null, includeCommercial = true) {
    caseId(id);
    if (selectedRevision !== null && selectedRevision !== undefined) revision(selectedRevision);
    const value = await caseStore.read(id, selectedRevision ?? null);
    const workspace = await parseWorkspace(value.workspaceText);
    const service = await validateServiceRecord(workspace.service ?? createServiceRecord());
    service.renewals ??= [];
    for (const row of service.renewals) need(row.caseId === id,
      'A renewal in this workspace belongs to another case.', 'SERVICE_RENEWAL_HISTORY_CONFLICT', 409);
    const commercial = includeCommercial ? await commercialContext(workspace, {
      caseId: id, workspaceId: await workspaceIdentity(id), revision: value.revision
    }) : {quotes: [], documents: []};
    const quotes = (commercial.quotes ?? []).filter(row => row.originCaseId === id);
    const responses = (commercial.documents ?? []).filter(row => row.kind === 'RESPONSE' && row.caseId === id);
    return {value, workspace, service, commercial, context: {caseId: id, quotes, responses}};
  }
  function view(loaded) {
    const {value, service, context} = loaded;
    const renewals = heads(service.renewals);
    const responses = context.responses.filter(row => context.quotes.some(quote =>
      row.payload?.quoteId === quote.id && row.payload?.quoteSha256 === quote.sha256));
    const newest = new Map(context.quotes.map(quote => [quote.id,
      newestResponse(context.responses.filter(row => row.payload?.quoteId === quote.id))?.id]));
    const quotes = context.quotes.map(quote => {
      const binding = quote.sourceBindings?.service;
      const eligibleRenewalIds = renewals.filter(renewal => {
        const proposed = resolve(service.terms, renewal.continuationTerms, 'proposed continuation');
        return renewal.state === 'proposed' && binding?.id === proposed.id + ':' + proposed.revision &&
          binding.sha256 === proposed.sha256 && serviceCanonical(binding.snapshot) === serviceCanonical(proposed) &&
          quote.lines?.some(line => line.kind === 'RECURRING_SERVICE' &&
            line.sourceId === binding.id && line.sourceRowId === proposed.id);
      }).map(row => row.id);
      return {...copy(quote), eligibleRenewalIds, latestResponseId: newest.get(quote.id) ?? null};
    });
    return {
      schema: CASE_SERVICE_RENEWALS_SCHEMA, case: summary(value),
      service: copy(service), terms: copy(service.terms), termHeads: copy(heads(service.terms)),
      renewals: copy(renewals), renewalHistory: copy(service.renewals),
      quotes, responses: copy(responses),
      acceptances: responses.filter(row => row.payload.status === 'ACCEPTED').map(row =>
        ({...copy(row), latest: newest.get(row.payload.quoteId) === row.id}))
    };
  }
  async function read(args) {
    object(args, ['id', 'revision'], 'case renewal read');
    return view(await load(args.id, args.revision ?? null));
  }
  async function preview(args) {
    const input = boundInput(args, 'preview'), loaded = await load(args.id);
    current(loaded.value, args.expectedRevision);
    return {...await previewServiceRenewal(loaded.service, input, loaded.context), case: summary(loaded.value)};
  }
  async function mutate(args, action) {
    const input = boundInput(args, action);
    const operation = action === 'propose' ? retainServiceRenewal : recordServiceRenewalDecision;
    const loaded = await load(args.id);
    // Recover an existing request before head guards; reject a fresh stale case before preparing terms.
    const retainedRequest = loaded.service.renewals.some(row => row.requestId === input.requestId);
    if (!retainedRequest) current(loaded.value, args.expectedRevision);
    const changed = await operation(loaded.service, input, loaded.context);
    need(changed.renewal.caseId === args.id, 'This renewal request belongs to another case.',
      'SERVICE_RENEWAL_OPERATION_CONFLICT', 409);
    if (changed.reused) return {...view(loaded), renewal: changed.renewal, termsChanged: changed.terms, reused: true};
    need(!retainedRequest, 'The original renewal request did not replay.', 'SERVICE_RENEWAL_OPERATION_CONFLICT', 409);
    const workspaceText = await serializeWorkspace({
      ...workspaceDraft(loaded.workspace), service: changed.record
    }, {now: loaded.workspace.savedAt});
    try {
      const saved = await caseStore.save({
        id: args.id, expectedRevision: args.expectedRevision, workspaceText,
        supportText: loaded.value.supportText, metadata: loaded.value.metadata
      });
      const savedValue = {...saved.case, currentRevision: saved.case.revision};
      const updated = {...loaded, service: changed.record, value: savedValue};
      return {...view(updated), renewal: changed.renewal, termsChanged: changed.terms, reused: saved.unchanged === true};
    } catch (error) {
      let latest;
      try { latest = await load(args.id); } catch { throw error; }
      if (!latest.service.renewals.some(row => row.requestId === input.requestId)) throw error;
      const retained = await operation(latest.service, input, latest.context);
      need(retained.reused && retained.renewal.caseId === args.id,
        'The concurrent renewal request changed.', 'SERVICE_RENEWAL_OPERATION_CONFLICT', 409);
      return {...view(latest), renewal: retained.renewal, termsChanged: retained.terms, reused: true};
    }
  }
  async function queue(args = {}) {
    object(args, ['asOf', 'through', 'noticeDays', 'offset', 'limit', 'q', 'includeClosed'], 'renewal queue');
    const offset = integer(args.offset, 0, 0, Number.MAX_SAFE_INTEGER, 'queue offset');
    const limit = integer(args.limit, 50, 1, 200, 'queue page size');
    const q = args.q ?? '';
    need(typeof q === 'string' && q.length <= 1000, 'Use a search of at most 1,000 characters.');
    const schedule = await buildServiceRenewalQueue([], {
      asOf: args.asOf, through: args.through, noticeDays: args.noticeDays,
      includeClosed: args.includeClosed ?? false
    });
    const cases = [], unavailable = new Map(), seen = new Set(), caseStatuses = new Map();
    // The native index excludes archived cases by default. Read both disjoint scopes.
    for (const status of ['', 'archived']) {
      const pages = new Set();
      let cursor = 0;
      while (cursor !== null) {
        need(!pages.has(cursor), 'The case index repeated a page.', 'CASE_INDEX_CONFLICT', 409);
        pages.add(cursor);
        const page = await caseStore.list({status, offset: cursor, limit: 200});
        for (const id of page.unavailable ?? []) if (!caseStatuses.has(id) && !unavailable.has(id))
          unavailable.set(id, {id, code: 'CASE_UNAVAILABLE', message: 'The case could not be opened from the case index.'});
        for (const item of page.cases ?? []) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          try {
            const loaded = await load(item.id, null, false);
            cases.push({id: item.id, revision: loaded.value.revision, name: loaded.value.name, service: loaded.service});
            caseStatuses.set(item.id, loaded.value.metadata?.status ?? item.metadata?.status ?? null);
            unavailable.delete(item.id);
          } catch (error) {
            unavailable.set(item.id, {id: item.id, name: item.name,
              code: error.code ?? 'CASE_UNAVAILABLE', message: error.message});
          }
        }
        const next = page.nextOffset;
        need(next === null || next === undefined || Number.isSafeInteger(next) && next > cursor,
          'The case index did not advance.', 'CASE_INDEX_CONFLICT', 409);
        cursor = next ?? null;
      }
    }
    const result = await buildServiceRenewalQueue(cases, {
      asOf: schedule.asOf, through: schedule.through, noticeDays: schedule.noticeDays,
      includeClosed: schedule.includeClosed
    });
    const rows = result.rows.map(row => ({...row, caseStatus: caseStatuses.get(row.caseId) ?? null}));
    const needle = q.trim().toLocaleLowerCase('en-US');
    const matches = needle ? rows.filter(row =>
      [row.caseId, row.caseName, row.termsId, row.title, row.customer, row.owner,
        row.merchantId, row.state, row.urgency, row.caseStatus].some(value => String(value ?? '').toLocaleLowerCase('en-US').includes(needle))) : rows;
    return {...result, rows: matches.slice(offset, offset + limit), total: matches.length, offset, limit,
      nextOffset: offset + limit < matches.length ? offset + limit : null, q, unavailable: [...unavailable.values()]};
  }
  async function handover(args) {
    object(args, ['id', 'revision', 'renewalId'], 'renewal handover');
    caseId(args.renewalId);
    const loaded = await load(args.id, args.revision ?? null);
    const renewal = heads(loaded.service.renewals).find(row => row.id === args.renewalId);
    need(renewal, 'Choose a retained renewal in this case.', 'SERVICE_RENEWAL_NOT_FOUND', 404);
    const sourceTerms = resolve(loaded.service.terms, renewal.sourceTerms, 'source agreement');
    const proposedContinuation = resolve(loaded.service.terms, renewal.continuationTerms, 'proposed continuation');
    const activeTerms = resolve(loaded.service.terms, renewal.activatedTerms, 'activated continuation');
    const quote = renewal.quote ? loaded.context.quotes.find(row =>
      row.id === renewal.quote.id && row.sha256 === renewal.quote.sha256) : null;
    need(!renewal.quote || quote, 'The renewal quotation is unavailable in this case revision.',
      'SERVICE_RENEWAL_QUOTE_CHANGED', 409);
    const response = renewal.acceptance ? loaded.context.responses.find(row =>
      row.id === renewal.acceptance.id && row.payload?.quoteId === renewal.quote.id &&
      row.payload?.quoteSha256 === renewal.quote.sha256 && row.payload?.status === 'ACCEPTED') : null;
    need(!renewal.acceptance || response, 'The original accepted response is unavailable in this case revision.',
      'SERVICE_RENEWAL_ACCEPTANCE_CHANGED', 409);
    if (quote) need(serviceCanonical(quote.material) === serviceCanonical(renewal.quote.material),
      'The quotation material differs from the retained renewal.', 'SERVICE_RENEWAL_QUOTE_CHANGED', 409);
    if (response) need(serviceCanonical(response.material) === serviceCanonical(renewal.acceptance.material) &&
      response.payload.observedAt === renewal.acceptance.observedAt,
      'The accepted response differs from the retained renewal.', 'SERVICE_RENEWAL_ACCEPTANCE_CHANGED', 409);
    const quoteDocument = quote ? loaded.commercial.documents.find(row =>
      row.kind === 'QUOTE' && row.id === quote.id && row.caseId === args.id && row.payload?.sha256 === quote.sha256) : null;
    need(!quote || quoteDocument, 'The original quotation document is unavailable in this case revision.',
      'SERVICE_RENEWAL_QUOTE_CHANGED', 409);
    function material(document) {
      if (!document) return null;
      const bytes = Buffer.from(commissioningFileBytes(loaded.commercial.state, document.material.sha256));
      need(bytes.length === document.material.bytes &&
        createHash('sha256').update(bytes).digest('hex') === document.material.sha256,
        'The original commercial material changed.', 'SERVICE_RENEWAL_MATERIAL_CHANGED', 409);
      return {...copy(document.material), encoding: 'base64', data: bytes.toString('base64')};
    }
    const accepted = loaded.service.renewals.filter(row => row.id === renewal.id && row.state === 'accepted')
      .sort((a, b) => b.revision - a.revision)[0] ?? null;
    // A sealed historical handover depends only on its selected saved case.
    const retainedCase = summary(loaded.value);
    delete retainedCase.currentRevision;
    const body = {
      schema: SERVICE_RENEWAL_HANDOVER_SCHEMA,
      case: retainedCase, renewal: copy(renewal),
      renewalHistory: copy(loaded.service.renewals), termsHistory: copy(loaded.service.terms), acceptedHead: ref(accepted),
      sourceTerms: copy(sourceTerms), proposedContinuation: copy(proposedContinuation),
      activeTerms: activeTerms ? copy(activeTerms) : null,
      currentTerms: copy(heads(loaded.service.terms).find(row => row.id === sourceTerms.id) ?? null),
      quote: quote ? copy(quote) : null, quoteDocument: quoteDocument ? copy(quoteDocument) : null,
      acceptance: response ? copy(response) : null,
      materials: {quote: material(quoteDocument), acceptance: material(response)},
      continuity: {
        sourceEndsAt: sourceTerms.effectiveUntil, continuationStartsAt: proposedContinuation.effectiveFrom,
        gapMilliseconds: Date.parse(proposedContinuation.effectiveFrom) - Date.parse(sourceTerms.effectiveUntil)
      },
      financialJoin: {
        caseId: args.id, caseRevision: loaded.value.revision, agreementId: sourceTerms.id,
        sourceTerms: ref(sourceTerms), proposedContinuation: ref(proposedContinuation), activeTerms: ref(activeTerms),
        quoteId: quote?.id ?? null, quoteSha256: quote?.sha256 ?? null,
        acceptanceId: response?.id ?? null, acceptedAt: response?.payload?.observedAt ?? null
      }
    };
    return validateServiceRenewalHandover({...body, sha256: await serviceSha256(body)});
  }
  return {queue, read, preview, propose: args => mutate(args, 'propose'),
    decide: args => mutate(args, 'decide'), handover};
}
