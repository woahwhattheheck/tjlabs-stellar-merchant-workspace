// MIT. Retained customer drafts and original HTTP operations in the economic workspace.
const SCHEMA = 'stellar-forge.fred-customer-work.v1';
const DRAFT = 'stellar-forge.fred-customer-draft.v1';
const OPERATION = 'stellar-forge.fred-customer-operation.v1';
const actions = new Set(['prepare','buy','recover','receive-county-purchase']);
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const hex = /^[a-f0-9]{64}$/;
const stable = value => Array.isArray(value) ? '[' + value.map(stable).join(',') + ']' :
  plain(value) ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}' : JSON.stringify(value);
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(typeof value === 'string' ? value : stable(value))))).map(x => x.toString(16).padStart(2,'0')).join('');
const uid = () => crypto.randomUUID().replaceAll('-','');
const now = () => new Date().toISOString();
const displayTime = value => Number.isFinite(Date.parse(value)) ?
  new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : value;
function need(value, message) { if (!value) throw new Error(message); }
let database;
async function db() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('fred-customer-work', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('drafts', { keyPath:'id' });
      request.result.createObjectStore('operations', { keyPath:'id' });
      request.result.createObjectStore('heads', { keyPath:'id' });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Reopen the older customer tab to use the retained work.'));
    request.onsuccess = () => {
      const value = request.result;
      value.onversionchange = () => { value.close(); database = null; };
      resolve(value);
    };
  }).catch(error => { database = null; throw error; });
  return database;
}
async function transaction(stores, mode, work) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(typeof result === 'function' ? result() : result);
    tx.onerror = () => reject(tx.error ?? new Error('Customer work could not be retained.'));
    tx.onabort = () => reject(tx.error ?? new Error('Customer work could not be retained.'));
    try { result = work(tx); } catch (error) { tx.abort(); reject(error); }
  });
}
const get = (store, id) => transaction([store], 'readonly', tx => {
  const request = tx.objectStore(store).get(id); return () => request.result;
});
const all = store => transaction([store], 'readonly', tx => {
  const request = tx.objectStore(store).getAll(); return () => request.result;
});
function validateDraft(value, projectId) {
  need(plain(value) && value.schema === DRAFT && value.projectId === projectId && identifier.test(value.id) &&
    plain(value.value) && typeof value.createdAt === 'string' && plain(value.value.fields) &&
    Object.values(value.value.fields).every(item => typeof item === 'string'), 'Open a complete draft for this original economic project.');
  return value;
}
async function validateOperation(value, projectId) {
  need(plain(value) && value.schema === OPERATION && value.projectId === projectId && identifier.test(value.id) &&
    typeof value.bodyText === 'string' && hex.test(value.bodySha256 ?? '') &&
    ['prepared','submitted','returned','uncertain','error'].includes(value.phase) &&
    Array.isArray(value.observations) && plain(value.nativeWorkspace) &&
    value.nativeWorkspace.projectId === projectId && typeof value.nativeWorkspace.directory === 'string' &&
    value.nativeWorkspace.directory.startsWith('/'), 'Open the complete original customer request.');
  const observations = new Set();
  for (const item of value.observations) {
    need(plain(item) && identifier.test(item.id ?? '') && !observations.has(item.id) &&
      typeof item.at === 'string' && (Object.hasOwn(item,'result') !== Object.hasOwn(item,'error')) &&
      (!Object.hasOwn(item,'error') || plain(item.error) && typeof item.error.message === 'string'),
      'The complete original request observation is invalid.');
    observations.add(item.id);
  }
  const body = JSON.parse(value.bodyText);
  need(plain(body) && body.id === value.id && body.projectId === projectId &&
    actions.has(body.action) && identifier.test(body.intentId ?? '') && hex.test(body.publicationId ?? '') &&
    Number.isSafeInteger(body.expectedRevision) && body.expectedRevision >= 1 &&
    await hash(value.bodyText) === value.bodySha256,
    'The retained customer request identity or complete body changed.');
  validateDraft(value.draft, projectId);
  return body;
}
function mergeOperation(previous, value) {
  if (!previous) return value;
  need(previous.projectId === value.projectId && previous.bodyText === value.bodyText &&
    previous.bodySha256 === value.bodySha256 && stable(previous.nativeWorkspace) === stable(value.nativeWorkspace),
    'This original customer request already retains a different body or native workspace.');
  const seen = new Map();
  for (const item of [...previous.observations, ...value.observations]) {
    if (seen.has(item.id)) need(stable(seen.get(item.id)) === stable(item), 'A retained request observation changed.');
    else seen.set(item.id, item);
  }
  const observations = [...seen.values()].sort((a,b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const returned = observations.filter(item => Object.hasOwn(item,'result'));
  const complete = returned.filter(item => item.result?.state === 'DELIVERED' || item.result?.state === 'RECEIVED');
  const selected = complete.at(-1) ?? returned.at(-1);
  return { ...previous, ...value, observations, ...(selected ? { phase:'returned', result:selected.result } : {}) };
}
function downloadJson(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2) + '\n'], { type:'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function element(tag, text, className) {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text;
  if (className) node.className = className; return node;
}
export function mountFredCustomerWork({ root, getProject, capture, adopt, context, send, returned, changed, message }) {
  let projectId = null, ready = null, opening = false, busy = false, preparing = false, navigating = false, generation = 0, chain = Promise.resolve();
  let lastDraft = null, tabId;
  const unsavedDrafts = new Map(), volatileOperations = new Map(), cachedDrafts = new Map(), cachedOperations = new Map();
  let completeCacheProject = null, paintGeneration = 0, draftLimit = 25, operationLimit = 25;
  try {
    tabId = sessionStorage.getItem('fred-customer-tab');
    if (!identifier.test(tabId ?? '')) { tabId = uid(); sessionStorage.setItem('fred-customer-tab', tabId); }
  } catch { tabId = uid(); }
  const section = element('section', undefined, 'card');
  section.id = 'customer-saved-work';
  section.append(element('h3','Customer work and original requests'),
    element('p','Retain the complete form and each original request. Open earlier work, continue its original intent, or carry this complete browser companion with the economic project.'));
  const status = element('p'), toolbar = element('div',undefined,'toolbar');
  const exportButton = element('button','Export complete customer work');
  const currentFormButton = element('button','Download current complete form');
  const importFile = element('input'); importFile.type = 'file'; importFile.accept = '.json,application/json'; importFile.id = 'customer-work-file';
  const importLabel = element('label','Receive customer work'); importLabel.append(importFile);
  const importButton = element('button','Receive retained work');
  const refreshButton = element('button','Refresh retained work');
  for (const button of [exportButton,currentFormButton,importButton,refreshButton]) button.type = 'button';
  toolbar.append(currentFormButton,exportButton,importLabel,importButton,refreshButton);
  const drafts = element('div'), operations = element('div');
  section.append(status,toolbar,element('h4','Complete form editions'),drafts,element('h4','Original customer requests'),operations);
  root.append(section);
  const active = () => projectId && getProject()?.id === projectId;
  const nativeWorkspace = () => ({ projectId:getProject()?.id, directory:getProject()?.directory });
  const sameNativeWorkspace = value => stable(value.nativeWorkspace) === stable(nativeWorkspace());
  const headId = id => id + ':' + tabId;
  const queue = work => {
    const task = chain.then(work);
    chain = task.catch(() => {});
    return task;
  };
  const report = error => message(error.message, true);
  function sync() {
    status.textContent = opening ? 'Opening this project’s retained customer work…' : navigating ?
      'Opening the selected original form. Its preceding fields remain retained.' : busy || preparing ?
      'The original customer action is running. Later form edits remain in their own draft.' :
      unsavedDrafts.size || volatileOperations.size ?
        'The current form and later work remain in this tab. Download the current complete form, export retained history, or retry browser storage.' :
        'Original form editions and returned results are retained for this economic project.';
    currentFormButton.disabled = opening || navigating || !active();
    exportButton.disabled = opening || navigating || !active();
    importButton.disabled = opening || busy || preparing || navigating || !active();
    for (const button of section.querySelectorAll('[data-customer-work-navigation]'))
      button.disabled = opening || busy || preparing || navigating || !active() || button.dataset.customerWorkForeign === 'true';
    refreshButton.disabled = opening || !active();
    changed?.();
  }
  async function writeDraft(value, makeCurrent = true) {
    await transaction(['drafts','heads'], 'readwrite', tx => {
      tx.objectStore('drafts').put(value);
      if (makeCurrent) tx.objectStore('heads').put({ id:headId(value.projectId), projectId:value.projectId, draftId:value.id });
    });
    unsavedDrafts.delete(value.id); cachedDrafts.set(value.id,value);
  }
  async function retain(reason = 'Form edited') {
    need(active(), 'Open the original economic project before retaining customer work.');
    const id = projectId, value = clone(capture());
    if (lastDraft?.projectId === id && stable(lastDraft.value) === stable(value)) {
      const draft = lastDraft;
      if (unsavedDrafts.has(draft.id)) await queue(() => writeDraft(draft));
      return draft;
    }
    const draft = { schema:DRAFT, id:uid(), projectId:id, tabId, createdAt:now(), reason, value };
    lastDraft = draft; unsavedDrafts.set(draft.id,draft);
    try {
      await queue(async () => {
        for (const previous of [...unsavedDrafts.values()]) if (previous.projectId === id && previous.id !== draft.id)
          await writeDraft(previous,false);
        // A prior queued save may already have retained this edition as history.
        // Its own queued turn must still advance this tab's current pointer.
        await writeDraft(draft,true);
      });
      return draft;
    } finally { sync(); }
  }
  function edit(reason) { if (active() && !opening) retain(reason).catch(report); }
  async function persistOperation(value) {
    volatileOperations.set(value.id,mergeOperation(volatileOperations.get(value.id),value));
    value = volatileOperations.get(value.id);
    try {
      let merged, conflict;
      await transaction(['operations'], 'readwrite', tx => {
        const store = tx.objectStore('operations'), request = store.get(value.id);
        request.onsuccess = () => {
          try { merged = mergeOperation(request.result,value); store.put(merged); }
          catch (error) { conflict = error; tx.abort(); }
        };
      }).catch(error => { throw conflict ?? error; });
      cachedOperations.set(value.id,merged);
      volatileOperations.delete(value.id);
      return merged;
    } finally { sync(); }
  }
  async function records(id = projectId) {
    try {
      const [savedDrafts,savedOperations] = await Promise.all([all('drafts'),all('operations')]);
      for (const value of savedDrafts) cachedDrafts.set(value.id,value);
      for (const value of savedOperations) cachedOperations.set(value.id,mergeOperation(cachedOperations.get(value.id),value));
      completeCacheProject = id;
    } catch (error) {
      if (completeCacheProject !== id) throw error;
      message('Browser storage could not be reread. The complete previously received history and all later work remain available in this tab: ' + error.message,true);
    }
    const draftMap = new Map([...cachedDrafts.values()].filter(x => x.projectId === id).map(x => [x.id,x]));
    for (const value of unsavedDrafts.values()) if (value.projectId === id) draftMap.set(value.id,value);
    const opMap = new Map([...cachedOperations.values()].filter(x => x.projectId === id).map(x => [x.id,x]));
    for (const value of volatileOperations.values()) if (value.projectId === id)
      opMap.set(value.id,mergeOperation(opMap.get(value.id),value));
    return { drafts:[...draftMap.values()], operations:[...opMap.values()] };
  }
  async function showDraft(value) {
    need(active() && !opening && !busy && !preparing && !navigating,
      'Finish the current customer action before opening another retained form.');
    const selectedProject = projectId, ticket = generation;
    validateDraft(value,selectedProject);
    navigating = true; sync();
    try {
      await retain('Before reopening a retained form');
      need(active() && projectId === selectedProject && generation === ticket, 'Reopen this draft in its original project.');
      await adopt(clone(value.value));
      need(active() && projectId === selectedProject && generation === ticket, 'Reopen this draft in its original project.');
      const selected = clone(context());
      await retain('Reopened retained form ' + value.id);
      need(active() && projectId === selectedProject && generation === ticket, 'Reopen this draft in its original project.');
      return selected;
    } finally { navigating = false; sync(); await paint().catch(report); }
  }
  function downloadCurrentForm() {
    need(active() && !opening && !navigating, 'Open the original customer form before downloading it.');
    const value = clone(capture());
    let draft = lastDraft;
    if (draft?.projectId !== projectId || stable(draft.value) !== stable(value)) {
      draft = { schema:DRAFT, id:uid(), projectId, tabId, createdAt:now(), reason:'Current complete form downloaded', value };
      lastDraft = draft; unsavedDrafts.set(draft.id,draft);
    }
    downloadJson(draft,'economic-customer-form-' + draft.id + '.json');
    sync();
  }
  async function performRecord(value, submittedContext) {
    need(active() && !opening && !busy && !navigating, 'Open the original customer work before continuing this action.');
    const selectedProject = projectId, selected = clone(submittedContext ?? context());
    const body = await validateOperation(value,selectedProject);
    need(!busy && !opening && !navigating, 'The original customer operation or retained-form opening is still running.');
    need(active() && projectId === selectedProject && sameNativeWorkspace(value),
      'This request belongs to its recorded native customer directory. Open it there to continue; its complete history remains available here.');
    need(selected.projectId === value.projectId && selected.publicationId === body.publicationId &&
      selected.intentId === body.intentId, 'Open this original publication and intent before continuing its saved request.');
    busy = true; sync();
    const observationId = uid();
    let accepted = false, result, saved = clone(value);
    try {
      saved = { ...saved, phase:'submitted', updatedAt:now() };
      saved = await persistOperation(saved);
      need(active() && projectId === selectedProject, 'Reopen the original project before sending this retained request.');
      try {
        result = await send(body,selectedProject);
        accepted = true;
        saved = { ...saved, phase:'returned', result:clone(result), updatedAt:now(), lastError:null,
          observations:[...saved.observations,{ id:observationId, at:now(), result:clone(result) }] };
        try { saved = await persistOperation(saved); }
        catch (error) {
          volatileOperations.set(saved.id,saved);
          message('The original result returned. Export the complete customer work while browser storage is unavailable: ' + error.message,true);
        }
        if (active() && projectId === selectedProject) await returned?.(body,result,selected);
        return { result, record:saved, accepted:true };
      } catch (error) {
        if (accepted) {
          message('The original result is retained. Its view could not refresh: ' + error.message,true);
          return { result,record:saved,accepted:true };
        }
        saved = { ...saved, phase:saved.result ? 'returned' : Number.isInteger(error.status) ? 'error' : 'uncertain',
          updatedAt:now(), lastError:{message:error.message,status:error.status??null,code:error.code??null},
          observations:[...saved.observations,{id:observationId,at:now(),
            error:{message:error.message,status:error.status??null,code:error.code??null}}] };
        try { saved = await persistOperation(saved); } catch { volatileOperations.set(saved.id,saved); }
        throw error;
      }
    } finally { busy = false; sync(); await paint().catch(report); }
  }
  async function perform(body) {
    const selectedProject = body.projectId, submittedWorkspace = clone(nativeWorkspace()), submittedContext = clone(context());
    need(active() && selectedProject === projectId && !opening && !busy && !preparing && !navigating,
      'Open the current customer workspace before starting this action.');
    preparing = true; sync();
    try {
    // Capture the full form before the first asynchronous storage operation.
    const retainedDraft = retain('Before ' + body.action);
    body = clone(body);
    const draft = await retainedDraft;
    need(active() && projectId === selectedProject && stable(nativeWorkspace()) === stable(submittedWorkspace),
      'The original native customer workspace changed before this action was sent.');
    const bodyText = JSON.stringify(body);
    let value = { schema:OPERATION, id:body.id, projectId:selectedProject, nativeWorkspace:submittedWorkspace,
      action:body.action, intentId:body.intentId, bodyText, bodySha256:await hash(bodyText),
      draft:clone(draft), phase:'prepared',createdAt:now(),updatedAt:now(),observations:[] };
    await validateOperation(value,selectedProject);
    value = await persistOperation(value);
    return await performRecord(value,submittedContext);
    } finally { preparing = false; sync(); }
  }
  async function paint() {
    const id = projectId, ticket = ++paintGeneration;
    if (!id) return;
    const values = await records(id);
    if (projectId !== id || paintGeneration !== ticket || !active()) return;
    drafts.replaceChildren(); operations.replaceChildren();
    for (const draft of values.drafts.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,draftLimit)) {
      const detail = element('details'), summary = element('summary',draft.reason + ' · ' + displayTime(draft.createdAt));
      const buttons = element('div',undefined,'toolbar'), open = element('button','Open complete form'), download = element('button','Download form');
      open.type = download.type = 'button';
      open.dataset.customerWorkNavigation = 'draft';
      open.disabled = opening || busy || preparing || navigating;
      open.addEventListener('click',() => showDraft(draft).catch(report));
      download.addEventListener('click',() => downloadJson(draft,'economic-customer-form-' + draft.id + '.json'));
      buttons.append(open,download); detail.append(summary,buttons,element('pre',JSON.stringify(draft,null,2))); drafts.append(detail);
    }
    if (values.drafts.length > draftLimit) {
      const more=element('button','Show earlier complete forms');more.type='button';
      more.addEventListener('click',()=>{draftLimit+=25;paint().catch(report);});drafts.append(more);
    }
    for (const record of values.operations.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,operationLimit)) {
      const detail = element('details'), summary = element('summary',record.action + ' · ' + record.intentId + ' · ' + record.phase + ' · ' + displayTime(record.createdAt));
      detail.dataset.customerOperation = record.id;
      const buttons = element('div',undefined,'toolbar'), open = element('button','Open original request'), download = element('button','Download complete request');
      open.type = download.type = 'button'; open.dataset.customerWorkNavigation = 'request';
      open.disabled = opening || busy || preparing || navigating;
      open.addEventListener('click',async() => {
        try {
          const selected = await showDraft(record.draft);
          if (Object.hasOwn(record,'result')) await returned?.(JSON.parse(record.bodyText),record.result,selected);
          message('The complete original request and selected form are open.');
        } catch (error) { report(error); }
      });
      download.addEventListener('click',() => downloadJson(record,'economic-customer-request-' + record.id + '.json'));
      buttons.append(open,download);
      if (!Object.hasOwn(record,'result')) {
        const resume = element('button','Continue original action'); resume.type = 'button';
        resume.dataset.customerWorkNavigation = 'continue';
        resume.dataset.customerWorkForeign = String(!sameNativeWorkspace(record));
        resume.disabled = opening || busy || preparing || navigating || !sameNativeWorkspace(record);
        if (!sameNativeWorkspace(record)) resume.title = 'Continue from the recorded native customer directory: ' + record.nativeWorkspace.directory;
        resume.addEventListener('click',async() => {
          try { const selected = await showDraft(record.draft); await performRecord(record,selected); } catch(error) { report(error); }
        });
        buttons.append(resume);
      }
      detail.append(summary,buttons,element('pre',JSON.stringify(record,null,2))); operations.append(detail);
    }
    if (values.operations.length > operationLimit) {
      const more=element('button','Show earlier original requests');more.type='button';
      more.addEventListener('click',()=>{operationLimit+=25;paint().catch(report);});operations.append(more);
    }
    if (!values.drafts.length) drafts.append(element('p','Form editions appear as customer work is saved.'));
    if (!values.operations.length) operations.append(element('p','Prepare, purchase, recover and receive actions retain their original body here.'));
  }
  async function exportWork() {
    if (ready) await ready;
    const selectedProject = projectId;
    await retain('Complete customer work exported').catch(report);
    const values = await records(selectedProject);
    need(active() && projectId === selectedProject, 'Reopen the original project to export its complete customer work.');
    const payload = { schema:SCHEMA,projectId:selectedProject,nativeWorkspace:nativeWorkspace(),exportedAt:now(),currentDraftId:lastDraft?.id??null,...values };
    downloadJson({...payload,sha256:await hash(payload)},'fred-customer-work-' + projectId.replace(/[^A-Za-z0-9_-]/g,'_') + '.json');
  }
  async function importWork() {
    if (ready) await ready;
    const file = importFile.files[0], selected = projectId;
    need(file && file.size > 0 && file.size <= 64*1024*1024,'Select the complete customer-work JSON within 64 MiB.');
    const text = await file.text();
    need(active() && projectId === selected,'Reopen the original project before receiving its customer work.');
    let packet = JSON.parse(text);
    if (packet.schema === DRAFT) {
      validateDraft(packet,selected);
      packet = { drafts:[packet], operations:[] };
    } else {
      const {sha256,...payload} = packet;
      need(packet.schema === SCHEMA && packet.projectId === projectId && hex.test(sha256??'') &&
        await hash(payload) === sha256 && Array.isArray(packet.drafts) && Array.isArray(packet.operations),
        'Receive the unchanged customer-work file for this economic project.');
    }
    const seen = new Set();
    for (const value of packet.drafts) {
      validateDraft(value,projectId); need(!seen.has(value.id),'The form edition inventory repeats an identity.');seen.add(value.id);
    }
    seen.clear();
    for (const value of packet.operations) {
      await validateOperation(value,projectId);need(!seen.has(value.id),'The request inventory repeats an identity.');seen.add(value.id);
    }
    await retain('Before receiving complete customer work');
    need(active() && projectId === selected,'Reopen the original project before receiving its customer work.');
    await transaction(['drafts','operations'],'readwrite',tx => {
      for (const value of packet.drafts) {
        const store=tx.objectStore('drafts'),request=store.get(value.id);
        request.onsuccess=()=>{try {
          need(!request.result||stable(request.result)===stable(value),'A retained original form edition changed.');store.put(value);
        } catch {tx.abort();}};
      }
      for (const value of packet.operations) {
        const store=tx.objectStore('operations'),request=store.get(value.id);
        request.onsuccess=()=>{try {store.put(mergeOperation(request.result,value));} catch {tx.abort();}};
      }
    });
    if (importFile.files[0] === file) importFile.value='';
    await paint();message('Complete customer work received. Open its original form or request from the retained history.');
  }
  currentFormButton.addEventListener('click',()=>{try{downloadCurrentForm();}catch(error){report(error);}});
  exportButton.addEventListener('click',()=>exportWork().catch(report));
  importButton.addEventListener('click',()=>importWork().catch(report));
  refreshButton.addEventListener('click',()=>paint().catch(report));
  async function open(selected) {
    if (projectId === selected && ready) return ready;
    projectId=selected;generation++;paintGeneration++;draftLimit=25;operationLimit=25;lastDraft=null;opening=true;sync();
    const ticket=generation;
    const operation=(async()=>{
      const head=await get('heads',headId(selected));
      const draft=head?await get('drafts',head.draftId):null;
      if (generation!==ticket||projectId!==selected||!active())return;
      if (draft) {validateDraft(draft,selected);await adopt(clone(draft.value));lastDraft=draft;}
      opening=false;sync();
      if (!draft) await retain('Opened customer workspace');
      await paint();
    })();
    ready=operation;
    try {await operation;}
    catch(error) {if(generation===ticket){opening=false;ready=null;sync();}throw error;}
  }
  return {open,edit,retain,perform,paint,exportWork,
    isBusy:()=>opening||busy||preparing||navigating, isNavigating:()=>navigating,
    isReady:()=>active()&&!opening&&!navigating&&Boolean(ready),
    contextChanged:()=>{paintGeneration++;},
    async flush(){await chain;for(const value of [...unsavedDrafts.values()])await writeDraft(value,false);
      if(lastDraft)await writeDraft(lastDraft,true);
      for(const value of [...volatileOperations.values()])await persistOperation(value);sync();}
  };
}
