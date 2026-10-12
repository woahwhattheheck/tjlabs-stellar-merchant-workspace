/** Browser and Node client for the original OCDS operator HTTP service. */
export class OcdsClientError extends Error {
  constructor(message, { code = 'OCDS_REQUEST_FAILED', status = null, details = null } = {}) {
    super(message);
    this.name = 'OcdsClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class OcdsClient {
  constructor(baseUrl, { fetch: fetchImplementation = globalThis.fetch, headers = {}, timeoutMs = 30000, maxResponseBytes = 64 * 1024 * 1024 } = {}) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TypeError('Use an HTTP(S) operator URL without embedded credentials.');
    if (typeof fetchImplementation !== 'function') throw new TypeError('A fetch implementation is required.');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) throw new TypeError('Use positive integer timeout and response limits.');
    this.baseUrl = url.origin;
    this.fetch = fetchImplementation;
    this.headers = { ...headers };
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;
  }

  async request(path, { method = 'GET', body, signal, raw = false, binary = false } = {}) {
    const url = new URL(path, this.baseUrl);
    if (url.origin !== this.baseUrl || url.username || url.password) throw new TypeError('Requests must target the configured operator origin.');
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('OCDS request timed out')), this.timeoutMs);
    try {
      const response = await this.fetch(url, {
        method, signal: controller.signal, redirect: 'error', credentials: 'same-origin',
        headers: { accept: raw || binary ? '*/*' : 'application/json', ...this.headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const expectedLength = response.headers.get('content-length');
      if (expectedLength !== null && Number(expectedLength) > this.maxResponseBytes) {
        await response.body?.cancel();
        throw new OcdsClientError('Response exceeds the configured client limit.', { code: 'RESPONSE_TOO_LARGE', status: response.status });
      }
      const reader = response.body?.getReader();
      const chunks = [];
      let bytes = 0;
      if (reader) {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > this.maxResponseBytes) {
              await reader.cancel();
              throw new OcdsClientError('Response exceeds the configured client limit.', { code: 'RESPONSE_TOO_LARGE', status: response.status });
            }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
      }
      const joined = new Uint8Array(bytes);
      let position = 0;
      for (const chunk of chunks) { joined.set(chunk, position); position += chunk.byteLength; }
      if (binary && response.ok) return {mime:response.headers.get('content-type') || 'application/octet-stream',
        filename:response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/)?.[1] || null,body:joined,bytes};
      const bodyText = new TextDecoder('utf-8', { fatal: true }).decode(joined);
      let value;
      const json = response.headers.get('content-type')?.includes('json');
      if (json && bodyText) {
        try { value = JSON.parse(bodyText); }
        catch { throw new OcdsClientError('Operator returned invalid JSON.', { code: 'INVALID_RESPONSE', status: response.status }); }
      }
      if (!response.ok) {
        const error = value?.error;
        throw new OcdsClientError(error?.message ?? value?.message ?? 'OCDS request returned HTTP ' + response.status, {
          code: error?.code ?? (typeof error === 'string' ? error : 'OCDS_REQUEST_FAILED'),
          status: response.status, details: error?.details ?? null,
        });
      }
      if (raw) return { mime: response.headers.get('content-type') ?? 'application/octet-stream',
        filename: response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/)?.[1] ?? null, body: bodyText, bytes };
      if (!json || !bodyText) throw new OcdsClientError('Expected an operator JSON response.', { code: 'INVALID_RESPONSE', status: response.status });
      return value;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  sourceState(options) { return this.request('/api/source-operations',options); }
  sourceWindow(id,options) { return this.request('/api/source-windows/'+encodeURIComponent(id),options); }
  sourceReceiving(id,options) { return this.request('/api/source-receiving/'+encodeURIComponent(id),options); }
  saveSourceSelection(selection,expectedRevision,options={}) {
    return this.request('/api/source-selections',{...options,method:'POST',body:{selection,expectedRevision}});
  }
  refreshSources(input,options={}) { return this.request('/api/source-windows',{...options,method:'POST',body:input}); }
  pauseSourceWindow(id,options={}) { return this.request('/api/source-windows/'+encodeURIComponent(id)+'/cancel',{...options,method:'POST',body:{}}); }
  sourceReview(id,options) { return this.request('/api/source-reviews/'+encodeURIComponent(id),options); }
  updateSourceReview(id,patch,options={}) {
    return this.request('/api/source-reviews/'+encodeURIComponent(id),{...options,method:'PATCH',body:patch});
  }
  sourceDocument(id,{sha256,...options}={}) {
    return this.request('/api/source-documents/'+encodeURIComponent(id)+(sha256?'?'+new URLSearchParams({sha256}):''),{...options,binary:true});
  }
  adoptSourceObservation(input,options={}) { return this.request('/api/source-observation',{...options,method:'POST',body:input}); }
  importSourceOriginal(input,options={}) { return this.request('/api/source-original',{...options,method:'POST',body:input}); }
  exportSourceHandoff(directory,ocids,options={}) {
    return this.request('/api/source-export',{...options,method:'POST',body:{directory,ocids}});
  }
  receiveSourceHandoff(directory,expectedRevision,{expectedHandoffId,...options}={}) {
    return this.request('/api/source-receive',{...options,method:'POST',body:{directory,expectedRevision,expectedHandoffId}});
  }
  workspace(options) { return this.request('/api/workspace', options); }
  entry(id, options) { return this.request('/api/entries/' + encodeURIComponent(id), options); }
  source(id, options) { return this.request('/api/sources/' + encodeURIComponent(id), options); }
  captureRecord(id, options) { return this.request('/api/captures/' + encodeURIComponent(id), options); }
  receiving(packageId, options) { return this.request('/api/receiving/' + encodeURIComponent(packageId), options); }
  compare(before, after, options) {
    return this.request('/api/compare?' + new URLSearchParams({ before, after }), options);
  }
  importDocument(document, { rawText, label, url, expectedRevision, ...options } = {}) {
    return this.request('/api/import', { ...options, method: 'POST', body: { document, rawText, label, url, expectedRevision } });
  }
  capture(selection, options = {}) { return this.request('/api/capture', { ...options, method: 'POST', body: selection }); }
  updateReview(ocid, review, options = {}) {
    return this.request('/api/projects/' + encodeURIComponent(ocid) + '/review', { ...options, method: 'PATCH', body: review });
  }
  report({ format = 'json', scope = 'all', ocids = [], ...options } = {}) {
    const query = new URLSearchParams({ format, scope });
    for (const ocid of ocids) query.append('ocid', ocid);
    return this.request('/api/export?' + query, { ...options, raw: true });
  }
  exportPackage(options) { return this.request('/api/package', options); }
  receivePackage(pkg, expectedRevision, options = {}) {
    return this.request('/api/receive', { ...options, method: 'POST', body: { package: pkg, expectedRevision } });
  }
}
