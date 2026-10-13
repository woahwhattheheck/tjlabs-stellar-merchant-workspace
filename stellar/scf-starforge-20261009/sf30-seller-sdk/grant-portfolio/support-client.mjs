// MIT. Complete defect-support access through the original portfolio console.
import { GrantPortfolioClient, readGrantPortfolioConnection } from './client.mjs';

export const DEFECT_SUPPORT_SCHEMA = 'tjlabs.pmrs.defect-support/v1';
export const DEFECT_SUPPORT_ACTIONS = Object.freeze([
  'support.contract.save', 'support.contract.acceptance',
  'support.issue.open', 'support.issue.triage', 'support.issue.acknowledge',
  'support.issue.plan', 'support.issue.workaround', 'support.issue.correction',
  'support.issue.validate', 'support.issue.close', 'support.issue.reopen',
  'support.issue.note', 'support.issue.clock-review',
  'support.delivery.prepare', 'support.delivery.receive',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (message, details = {}) => Object.assign(new Error(message), {code:'DEFECT_SUPPORT_INPUT', ...details});
const require = (value, message) => { if (!value) throw fail(message); };
const id = value => { require(typeof value === 'string' && UUID.test(value), 'Select the original support record ID.'); return value; };
const positive = (value, minimum = 0) => {
  require(Number.isSafeInteger(value) && value >= minimum, 'Select the inspected nonnegative revision or page offset.'); return value;
};
const query = values => new URLSearchParams(Object.entries(values).filter(([,value]) =>
  value !== undefined && value !== null && value !== '').map(([key,value]) => [key,String(value)])).toString();

export class DefectSupportClient extends GrantPortfolioClient {
  #token; #abort = new AbortController(); #requests = new Set(); #timeout;
  constructor(consoleUrl, options = {}) {
    super(consoleUrl, options);
    this.#token = new URL(consoleUrl).hash.slice(1);
    this.#timeout = options.timeoutMs ?? 240000;
  }
  async #read(path, {signal} = {}) {
    require(!this.closed, 'This borrowed support client is closed.');
    require(signal === undefined || signal instanceof AbortSignal, 'Use an AbortSignal for this read.');
    const task = (async () => {
      const response = await fetch(this.origin + path, {redirect:'error',
        signal:AbortSignal.any([this.#abort.signal, AbortSignal.timeout(this.#timeout), ...(signal ? [signal] : [])]),
        headers:{authorization:'Bearer ' + this.#token, origin:this.origin}});
      const maximum = response.ok ? 16 * 1024 * 1024 : 65536;
      const parts = []; let size = 0;
      try {
        for await (const part of response.body ?? []) {
          size += part.byteLength;
          require(size <= maximum, 'Use the retained support page or its complete file handover.');
          parts.push(Buffer.from(part));
        }
        let value;
        try { value = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts,size))); }
        catch { throw fail('The original support console returned incomplete JSON.', {code:'DEFECT_SUPPORT_RESPONSE'}); }
        if (!response.ok) throw fail(value.message ?? 'The original support read was rejected.',
          {code:value.code ?? 'DEFECT_SUPPORT_HTTP', status:response.status, details:value});
        require(object(value), 'The support console returned an incomplete object.');
        return value;
      } finally { await response.body?.cancel().catch(() => {}); }
    })();
    this.#requests.add(task);
    try { return await task; } finally { this.#requests.delete(task); }
  }
  async supportState(filters = {}, options) {
    require(object(filters) && Object.keys(filters).every(key =>
      ['contractId','state','search','offset','limit','asOf'].includes(key)), 'Use the declared support board filters.');
    if (filters.contractId) id(filters.contractId);
    if (filters.offset !== undefined) positive(filters.offset);
    if (filters.limit !== undefined) require(positive(filters.limit,1) <= 250, 'Use 1 to 250 reports per page.');
    const value = await this.#read('/api/support/state?' + query(filters), options);
    require(value.schema === DEFECT_SUPPORT_SCHEMA + '.state' && UUID.test(value.workspaceId ?? '')
      && Array.isArray(value.rows) && Array.isArray(value.contracts) && Number.isSafeInteger(value.total),
    'The original support board returned another format.');
    return value;
  }
  async supportContract(recordId, {revision, ...options} = {}) {
    if (revision !== undefined) positive(revision,1);
    const value = await this.#read('/api/support/contract?' + query({id:id(recordId),revision}), options);
    require(value.schema === DEFECT_SUPPORT_SCHEMA + '.contract' && value.id === recordId
      && HASH.test(value.sha256 ?? '') && (revision === undefined || value.revision === revision),
    'The original contract selection differs.');
    return value;
  }
  async supportIssue(recordId, {revision, ...options} = {}) {
    if (revision !== undefined) positive(revision,1);
    const value = await this.#read('/api/support/issue?' + query({id:id(recordId),revision}), options);
    require(value.schema === DEFECT_SUPPORT_SCHEMA + '.issue' && value.id === recordId
      && HASH.test(value.sha256 ?? '') && (revision === undefined || value.revision === revision),
    'The original support report selection differs.');
    return value;
  }
  supportHistory({kind, id:recordId, offset = 0, limit = 50}, options) {
    require(['contract','issue'].includes(kind), 'Select contract or issue history.');
    positive(offset); require(positive(limit,1) <= 250, 'Use 1 to 250 original revisions per page.');
    return this.#read('/api/support/history?' + query({kind,id:id(recordId),offset,limit}), options);
  }
  async *supportHistoryPages(selection, options = {}) {
    let offset = selection.offset ?? 0, total;
    for (;;) {
      const page = await this.supportHistory({...selection,offset}, options);
      if (total === undefined) total = page.total;
      require(page.total === total && page.offset === offset && Array.isArray(page.rows),
        'The support history changed; select its current complete history.');
      yield page;
      if (page.nextOffset === null) break;
      require(page.rows.length > 0 && page.nextOffset === offset + page.rows.length,
        'The support history cursor would skip or repeat a revision.');
      offset = page.nextOffset;
    }
  }
  supportReleases({contractId, mode = 'affected', offset = 0, limit = 100}, options) {
    id(contractId); positive(offset);
    require(['affected','installation','delivery'].includes(mode) && positive(limit,1) <= 250,
      'Select an actual installed or delivered release page.');
    return this.#read('/api/support/releases?' + query({contractId,mode,offset,limit}), options);
  }
  supportCorrections({contractId, offset = 0, limit = 100}, options) {
    id(contractId); positive(offset);
    require(positive(limit,1) <= 100, 'Use 1 to 100 actual original corrections per page.');
    return this.#read('/api/support/corrections?' + query({contractId,offset,limit}), options);
  }
  supportAction(operationId, action, payload, {expectedRevision, ...options} = {}) {
    require(DEFECT_SUPPORT_ACTIONS.includes(action), 'Select a complete original support action.');
    return this.action({operationId,action,payload,...(expectedRevision === undefined ? {} : {expectedRevision})}, options);
  }
  saveSupportContract(operationId, payload, options) { return this.supportAction(operationId,'support.contract.save',payload,options); }
  recordSupportAcceptance(operationId, payload, options) { return this.supportAction(operationId,'support.contract.acceptance',payload,options); }
  openSupportIssue(operationId, payload, options) { return this.supportAction(operationId,'support.issue.open',payload,options); }
  triageSupportIssue(operationId, payload, options) { return this.supportAction(operationId,'support.issue.triage',payload,options); }
  acknowledgeSupportIssue(operationId, payload, options) { return this.supportAction(operationId,'support.issue.acknowledge',payload,options); }
  planSupportIssue(operationId, payload, options) { return this.supportAction(operationId,'support.issue.plan',payload,options); }
  recordSupportWorkaround(operationId, payload, options) { return this.supportAction(operationId,'support.issue.workaround',payload,options); }
  linkSupportCorrection(operationId, payload, options) { return this.supportAction(operationId,'support.issue.correction',payload,options); }
  validateSupportCorrection(operationId, payload, options) { return this.supportAction(operationId,'support.issue.validate',payload,options); }
  closeSupportIssue(operationId, payload, options) { return this.supportAction(operationId,'support.issue.close',payload,options); }
  reopenSupportIssue(operationId, payload, options) { return this.supportAction(operationId,'support.issue.reopen',payload,options); }
  noteSupportIssue(operationId, payload, options) { return this.supportAction(operationId,'support.issue.note',payload,options); }
  reviewSupportClock(operationId, payload, options) { return this.supportAction(operationId,'support.issue.clock-review',payload,options); }
  prepareSupportDelivery(operationId, payload, options) { return this.supportAction(operationId,'support.delivery.prepare',payload,options); }
  receiveSupportDelivery(operationId, payload, options) { return this.supportAction(operationId,'support.delivery.receive',payload,options); }
  async dispose() {
    this.#abort.abort(fail('The borrowed support client is closing.', {code:'DEFECT_SUPPORT_CLOSED'}));
    await Promise.allSettled([super.dispose(), ...this.#requests]);
    this.#token = '';
  }
}
export async function connectDefectSupport({consoleUrl, consoleUrlFile, timeoutMs} = {}) {
  require((consoleUrl === undefined) !== (consoleUrlFile === undefined),
    'Select one private URL or the original private connection file.');
  return new DefectSupportClient(consoleUrlFile === undefined ? consoleUrl :
    await readGrantPortfolioConnection(consoleUrlFile), {timeoutMs});
}
