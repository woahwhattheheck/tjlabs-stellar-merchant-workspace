// MIT. HTTP client for the original receivables remittance routes.
export class RemittancesClient {
  constructor(apiBase = '/api/receivables', {fetch: fetcher = globalThis.fetch} = {}) {
    if (typeof apiBase !== 'string' || !apiBase || apiBase.includes('?') || apiBase.includes('#') ||
        typeof fetcher !== 'function') throw new TypeError('Choose the original receivables API address and fetch implementation.');
    this.apiBase = apiBase.replace(/\/+$/,''); this.fetcher = fetcher;
  }
  async request(method,path,value,{signal} = {}) {
    const response = await this.fetcher(this.apiBase + '/remittances' + path,{method,signal,
      ...(value === undefined ? {} : {headers:{'Content-Type':'application/json','X-Workspace-Request':'1'},body:JSON.stringify(value)})});
    let result;
    try { result = await response.json(); } catch {
      throw Object.assign(new Error('The remittance service returned an unreadable result. Keep the original request ID.'),
        {code:'REMITTANCE_RESPONSE_INVALID',status:response.status});
    }
    if (!response.ok) throw Object.assign(new Error(result?.error?.message ?? 'The remittance request could not finish.'),
      {code:result?.error?.code ?? 'REMITTANCE_REQUEST_FAILED',status:response.status,details:result?.error?.details});
    return result;
  }
  list(options) { return this.request('GET','',undefined,options); }
  detail(id,options) { return this.request('GET','/'+encodeURIComponent(id),undefined,options); }
  preview(value,options) { return this.request('POST','/preview',value,options); }
  apply(value,options) { return this.request('POST','',value,options); }
  operation(requestId,options) { return this.request('GET','/operations/'+encodeURIComponent(requestId),undefined,options); }
  fileUrl(id,name) { return this.apiBase+'/remittances/'+encodeURIComponent(id)+'/files/'+encodeURIComponent(name); }
}
