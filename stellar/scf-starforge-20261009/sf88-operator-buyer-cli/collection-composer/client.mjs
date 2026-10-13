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
  async function request(path, input, { signal, raw = false } = {}, responseType = 'json') {
    const response = await send(origin + path, {
      method: input === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + token,
        ...(input === undefined ? {} : { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' }) },
      ...(input === undefined ? {} : { body: raw ? input : JSON.stringify(input) }),
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal,
    });
    need(response && typeof response.json === 'function', 'COLLECTION_AUTHORING_RESPONSE_INVALID');
    if (response.ok && responseType === 'file') {
      need(typeof response.arrayBuffer === 'function', 'COLLECTION_PACKAGE_FILE_RESPONSE_INVALID');
      return response;
    }
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
  const inputPath = uploadId => '/api/composer/inputs/' + revision(uploadId);
  const packagePath = packageSha256 => '/api/composer/sharing/packages/' + revision(packageSha256);
  const adoption = (action, input, options) => {
    const { packageSha256, ...bindings } = input;
    return request(packagePath(packageSha256) + '/' + action, bindings, options);
  };
  return Object.freeze({
    origin,
    inputs: Object.freeze({
      begin: ({manifest},options) => request('/api/composer/inputs',{manifest},options),
      list: (input={},options) => request('/api/composer/inputs/list',input,options),
      inspect: ({uploadId},options) => request(inputPath(uploadId),undefined,options),
      receiveChunk: ({uploadId,index,source},options) => {
        need(Number.isSafeInteger(index) && index>=0 && index<16,'COLLECTION_INPUT_CHUNK_INDEX_INVALID');
        need(source instanceof Uint8Array || source instanceof ArrayBuffer
          || typeof Blob!=='undefined' && source instanceof Blob,'COLLECTION_INPUT_CHUNK_REQUIRED');
        const bytes=source.byteLength??source.size;
        need(bytes>0 && bytes<=1048576,'COLLECTION_INPUT_CHUNK_SIZE_INVALID');
        return request(inputPath(uploadId)+'/chunks/'+index,source,{...options,raw:true});
      },
      complete: ({uploadId},options) => request(inputPath(uploadId)+'/complete',{},options),
      catalog: ({uploadId},options) => request(inputPath(uploadId)+'/catalog',undefined,options),
      downloadFile: ({uploadId},options) => request(inputPath(uploadId)+'/file',undefined,options,'file'),
    }),
    sharing: Object.freeze({
      listPackages: options => request('/api/composer/sharing/packages', undefined, options),
      exportPackage: ({ collectionId, expectedEditionSha256, headerSelections }, options) =>
        request('/api/composer/sharing/export', { collectionId,
          expectedEditionSha256: revision(expectedEditionSha256),
          ...(headerSelections === undefined ? {} : { headerSelections }) }, options),
      receiveManifest: ({ manifest }, options) =>
        request('/api/composer/sharing/packages', { manifest }, options),
      inspectPackage: ({ packageSha256 }, options) =>
        request(packagePath(packageSha256), undefined, options),
      receiveChunk: ({ packageSha256, objectSha256, offset, base64 }, options) =>
        request(packagePath(packageSha256) + '/chunks',
          { objectSha256: revision(objectSha256), offset, base64 }, options),
      finishReceiving: ({ packageSha256 }, options) =>
        request(packagePath(packageSha256) + '/complete', {}, options),
      packageFile: ({ packageSha256 }, options) =>
        request(packagePath(packageSha256) + '/file', {}, options),
      downloadPackage: ({ packageSha256 }, options) =>
        request(packagePath(packageSha256) + '/file', undefined, options, 'file'),
      reviewAdoption: (input, options) => adoption('review', input, options),
      adoptPlan: (input, options) => adoption('adopt', input, options),
    }),
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
