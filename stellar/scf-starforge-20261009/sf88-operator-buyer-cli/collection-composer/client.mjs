// MIT — Typed-method HTTP client for the original private Collections listener.
const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => {
  need(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value), 'COLLECTION_PLAN_ID_INVALID');
  return encodeURIComponent(value);
};
const revision = value => {
  need(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'COLLECTION_PLAN_REVISION_REQUIRED');
  return value;
};
/**
 * Open the existing listener from its private URL. The client creates no host.
 * Caller-selected fetch allows the original trusted host transport to be reused.
 */
export function createCollectionComposerClient({ url, fetch: send = globalThis.fetch } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch {}
  need(parsed && !parsed.username && !parsed.password && !parsed.search
    && parsed.pathname === '/' && typeof send === 'function'
    && (parsed.protocol === 'https:' || parsed.protocol === 'http:'
      && ['127.0.0.1', '[::1]', 'localhost'].includes(parsed.hostname)),
  'COLLECTION_AUTHORING_CONNECTION_INVALID');
  const token = parsed.hash.slice(1);
  need(/^[a-f0-9]{64}$/.test(token), 'COLLECTION_AUTHORING_SESSION_REQUIRED');
  const origin = parsed.origin;
  async function request(path, input, { signal } = {}) {
    const response = await send(origin + path, {
      method: input === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + token,
        ...(input === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal,
    });
    need(response && typeof response.json === 'function', 'COLLECTION_AUTHORING_RESPONSE_INVALID');
    let payload;
    try { payload = await response.json(); } catch {
      throw Object.assign(new Error('COLLECTION_AUTHORING_RESPONSE_INVALID'),
        { code: 'COLLECTION_AUTHORING_RESPONSE_INVALID', status: response.status });
    }
    if (!response.ok) {
      const code = /^[A-Z0-9_]{1,120}$/.test(payload?.error ?? '') ? payload.error : 'COLLECTION_AUTHORING_REQUEST_FAILED';
      throw Object.assign(new Error(code), { code, status: response.status });
    }
    need(plain(payload), 'COLLECTION_AUTHORING_RESPONSE_INVALID');
    return payload;
  }
  return Object.freeze({
    origin,
    listPlans: options => request('/api/composer/plans', undefined, options),
    inspectPlan: ({ id: planId, planSha256 }, options) =>
      request('/api/composer/plans/' + id(planId) + '/' + revision(planSha256), undefined, options),
    savePlan: ({ plan }, options) => request('/api/composer/plans', { plan }, options),
    inspectCatalog: ({ path }, options) => request('/api/composer/catalog', { path }, options),
    listEditions: options => request('/api/composer/editions', undefined, options),
    inspectEdition: ({ collectionId }, options) => request('/api/composer/editions/' + id(collectionId), undefined, options),
    prepareEdition: (input, options) => request('/api/composer/editions/prepare', input, options),
    createEdition: ({ collectionId, expectedEditionSha256, expectedPreviewSha256 }, options) =>
      request('/api/composer/editions/' + id(collectionId) + '/create',
        { expectedEditionSha256: revision(expectedEditionSha256), expectedPreviewSha256: revision(expectedPreviewSha256) }, options),
  });
}
