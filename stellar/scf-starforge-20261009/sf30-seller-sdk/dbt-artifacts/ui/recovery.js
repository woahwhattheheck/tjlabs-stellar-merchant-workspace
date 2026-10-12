// MIT. Recovery joins the original native job journal; never a second executor.
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key)+':'+canonical(value[key])).join(',') + '}';
}
export class Epoch {
  constructor() { this.value = 0; }
  next() { return ++this.value; }
  current(value) { return value === this.value; }
  invalidate() { ++this.value; }
}
export class JobJournal {
  constructor({request, storage, scope, uuid = () => crypto.randomUUID(), pause = ms => new Promise(resolve=>setTimeout(resolve,ms)), changed = () => {}}) {
    Object.assign(this,{request,storage,scope,uuid,pause,changed});
    this.key = 'dbt-original-jobs:'+scope;
    this.active = new Map();
    this.records = JSON.parse(storage.getItem(this.key) || '{}');
  }
  persist() { this.storage.setItem(this.key, JSON.stringify(this.records)); this.changed(); }
  pending() { return Object.values(this.records); }
  run(action,input={},id) {
    const fingerprint = canonical({action,input});
    if (this.active.has(fingerprint)) return this.active.get(fingerprint);
    let record = this.records[fingerprint];
    if (id && record && record.id !== id) throw Error('Another original operation with this input is awaiting completion.');
    if (!record) {
      record = {id:id||this.uuid(),action,input:structuredClone(input)};
      this.records[fingerprint] = record;
      // Persist BEFORE the first request. A failed write must not dispatch.
      this.persist();
    }
    const promise = this.execute(record).then(result=>{
      delete this.records[fingerprint]; this.persist(); return result;
    }).finally(()=>this.active.delete(fingerprint));
    this.active.set(fingerprint,promise);
    return promise;
  }
  async execute(record) {
    let current = await this.request('/api/jobs',record);
    while (['queued','running'].includes(current.state)) {
      await this.pause(350);
      current = await this.request('/api/jobs/'+record.id,undefined,'GET');
    }
    if (current.state !== 'complete') {
      const error = Error((current.error?.message||current.state)+' · original operation '+record.id);
      error.code=current.error?.code||'ORIGINAL_OPERATION_INCOMPLETE'; error.operationId=record.id; throw error;
    }
    return current.result;
  }
}
export class DraftSession {
  constructor({request,uuid=()=>crypto.randomUUID(),changed=()=>{}}) {
    Object.assign(this,{request,uuid,changed}); this.id=''; this.revision=0;
    this.saved=null; this.tail=Promise.resolve(); this.pending=0;
  }
  async open(id) {
    await this.tail.catch(()=>{});
    const record = await this.request('/api/browser/'+id,undefined,'GET');
    this.id=id; this.revision=record.revision; this.saved=canonical(record.context);
    this.changed(record); return structuredClone(record.context);
  }
  async fork() {
    // Fork remains available after a revision conflict; the current context wins
    // only in a NEW working copy, never over another operator's saved revision.
    await this.tail.catch(()=>{});
    this.id=this.uuid(); this.revision=0; this.saved=null;
    return this.id;
  }
  save(context) {
    const copy=structuredClone(context);
    this.pending++;
    const execute=async()=>{
      if (!this.id) { this.id=this.uuid(); this.revision=0; }
      const digest=canonical(copy);
      if (digest===this.saved) return null;
      const record=await this.request('/api/browser/'+this.id,{expected_revision:this.revision,context:copy},'PUT');
      this.revision=record.revision; this.saved=digest; this.changed(record); return record;
    };
    const result=this.tail.catch(()=>{}).then(execute).finally(()=>{this.pending--;});
    this.tail=result; return result;
  }
}
