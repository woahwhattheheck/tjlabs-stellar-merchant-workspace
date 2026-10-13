// MIT. Saved calendar commissioning within the original Collections authoring tree.
import { readdir } from 'node:fs/promises';
import { join, basename, isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { acquireCollectionLease } from '../collections/model.mjs';
import { openCollectionComposer } from './model.mjs';
import { captureInbox } from '../operations-handoff/capture.mjs';
import { inspectHandoff, MAX_BYTES as INBOX_MAX_BYTES } from '../operations-handoff/contract.mjs';
import { createCustomerUseReturn, inspectCustomerUseReturn, CUSTOMER_USE_RETURN_MAX_BYTES } from './customer-use-return.mjs';
import { validateCollectionPlan, resolveCollectionEdition, stableJson } from './plan.mjs';
import { initializationDirectory, initializationBytes, optionalInitializationBytes,
  retainInitializationFile, retainInitializationRecord } from '../initialization.mjs';
import { CUSTOMER_USE_COMMISSION_SCHEMA, CUSTOMER_USE_LIMITS, customerUseError,
  requireCustomerUse as need, plainObject, canonical, digest, valueDigest, copy, commissionId,
  hash, planKey, entryKey, readCustomerUseSource, sourceCatalogue, customerUseDocument,
  checkCustomerUsePlans, commissionSelection, customerUseReview, customerUseCsv } from './customer-use-definition.mjs';

const ROOT = 'stellar-forge.sf88.customer-use-commissioning.v1';
const REVISION = CUSTOMER_USE_COMMISSION_SCHEMA + '.revision';
const REQUEST = CUSTOMER_USE_COMMISSION_SCHEMA + '.request';
const MAX_RECORD = 16 * 1024 * 1024;
const MAX_REVISIONS = 10000;
const REVISION_FILE = /^(\d{8})-([a-f0-9]{64})\.json$/;
const REQUEST_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
function parse(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw customerUseError('CUSTOMER_USE_RECORD_INVALID', 'The retained original commissioning record is not complete UTF-8 JSON.', 409); }
}
function requestId(value) {
  need(typeof value === 'string' && REQUEST_ID.test(value), 'CUSTOMER_USE_REQUEST_ID_REQUIRED',
    'Retain the original UUID request identity when continuing an interrupted action.');
  return value;
}
function actor(value) {
  need(typeof value === 'string' && value.trim() && value.length <= 200 && !value.includes('\0'),
    'CUSTOMER_USE_ACTOR_REQUIRED', 'Name the operator responsible for this saved commissioning action.');
  return value;
}
function absolute(value) {
  need(typeof value === 'string' && isAbsolute(value) && resolve(value) === value && value !== '/' && !value.includes('\0'),
    'CUSTOMER_USE_DIRECTORY_REQUIRED', 'Use the existing private Collections directory.');
  return value;
}
function errorView(error) {
  return { code: /^[A-Z0-9_]{1,120}$/.test(error?.code ?? '') ? error.code : 'CUSTOMER_USE_ORIGINAL_READ_FAILED',
    message: String(error?.message ?? 'The original source could not be read.').slice(0,2000) };
}
async function optional(path, maximum = MAX_RECORD) {
  const bytes = await optionalInitializationBytes(path, maximum);
  return bytes === null ? null : { bytes, value: parse(bytes), sha256: digest(bytes) };
}
async function record(path, maximum = MAX_RECORD) {
  const bytes = await initializationBytes(path, maximum);
  return { bytes, value: parse(bytes), sha256: digest(bytes) };
}
async function exact(path, value) {
  await retainInitializationRecord(path, value, { resume: true });
  const saved = await record(path);
  need(canonical(saved.value) === canonical(value), 'CUSTOMER_USE_RETAINED_RECORD_CHANGED',
    'Keep the complete original saved commissioning record.', 409);
  return saved;
}
async function lease(path, action, options) {
  const release = await acquireCollectionLease(path, options);
  try { return await action(); } finally { await release(); }
}
function nativePlan(record, selected) {
  need(plainObject(record) && record.schema === 'stellar-forge.sf88.collection-plan-revision.v1'
    && record.id === selected.planId && record.planSha256 === selected.planSha256
    && plainObject(record.plan), 'CUSTOMER_USE_PLAN_BINDING_CHANGED',
  'The original saved Request plan has a different identity.', 409);
  const plan = validateCollectionPlan(record.plan);
  need(plan.id === selected.planId && digest(stableJson(plan) + '\n') === selected.planSha256,
    'CUSTOMER_USE_PLAN_BINDING_CHANGED', 'The complete saved Request plan bytes differ from their native revision.', 409);
  return plan;
}
function periodMatches(saved, selected) {
  return saved?.planId === selected.planId && saved?.planSha256 === selected.planSha256
    && saved?.collectionId === selected.collectionId && saved?.name === selected.name
    && canonical(saved.values) === canonical(selected.values);
}
function revisionView(record, sha256) {
  return { id: record.id, revision: record.revision, sha256, parentSha256: record.parentSha256,
    createdAt: record.createdAt, actor: record.actor, documentSha256: record.documentSha256,
    calendarSha256: record.document.calendarSha256, name: record.document.name };
}
/** Borrow existing native owners. Closing this leaf never closes the buyer inbox or Collections store. */
export function openCustomerUseCommissioning({ collections, composer: suppliedComposer } = {}) {
  need(collections && typeof collections.inspect === 'function' && typeof collections.withRecoveryLock === 'function',
    'CUSTOMER_USE_COLLECTIONS_REQUIRED', 'Open the original Collections workspace first.');
  const directory = absolute(collections.directory), queueRoot = absolute(collections.queueRoot);
  const root = join(directory, 'authoring', 'customer-use');
  const composer = suppliedComposer ?? openCollectionComposer({ collections });
  const ownsComposer = !suppliedComposer, pending = new Set();
  let closing = false, closePromise;
  function tracked(action) {
    if (closing) return Promise.reject(customerUseError('CUSTOMER_USE_CLOSED', 'The commissioning workspace is closing.', 409));
    const promise = Promise.resolve().then(action);
    pending.add(promise);
    promise.then(() => pending.delete(promise), () => pending.delete(promise));
    return promise;
  }
  async function header(create = false) {
    if (create) {
      await initializationDirectory(join(directory, 'authoring'), { create: true });
      await initializationDirectory(root, { create: true });
      await lease(root, async () => {
        const original = await optional(join(root, 'customer-use.json'), 65536);
        await exact(join(root, 'customer-use.json'), original?.value ?? {
          schema: ROOT, directory, queueRoot, createdAt: new Date().toISOString(),
        });
        for (const name of ['sources', 'commissions'])
          await initializationDirectory(join(root, name), { create: true });
      });
    }
    const current = await optional(join(root, 'customer-use.json'), 65536);
    if (!current) return null;
    need(current.value.schema === ROOT && current.value.directory === directory && current.value.queueRoot === queueRoot,
      'CUSTOMER_USE_STORE_BINDING_CHANGED', 'Reopen this commissioning history with its original Collections store and inbox.', 409);
    return current.value;
  }
  async function writeAt(id, action) {
    return lease(directory, async () => {
      await header(true);
      const path = id === null ? root : join(root, 'commissions', commissionId(id));
      await initializationDirectory(path, { create: true });
      return lease(path, () => action(path));
    }, { shared: true });
  }
  async function sourceAt(sha256) {
    hash(sha256);
    const path = join(root, 'sources', sha256);
    const meta = (await record(join(path, 'source.json'), 65536)).value;
    const bytes = await initializationBytes(join(path, 'calendar.json'), CUSTOMER_USE_LIMITS.sourceBytes);
    const source = readCustomerUseSource(bytes);
    need(meta.schema === ROOT + '.source' && meta.sha256 === sha256 && source.sha256 === sha256
      && meta.bytes === bytes.length && canonical(meta.case) === canonical(source.value.source),
    'CUSTOMER_USE_SOURCE_CHANGED', 'The retained original Calendar export no longer matches its selected source.', 409);
    return { metadata: meta, bytes, value: source.value, sha256 };
  }
  async function historyAt(id) {
    commissionId(id);
    const path = join(root, 'commissions', id, 'revisions');
    const files = await readdir(path, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const selected = files.filter(row => REVISION_FILE.test(row.name)).sort((a,b) => a.name.localeCompare(b.name));
    need(selected.length <= MAX_REVISIONS, 'CUSTOMER_USE_HISTORY_LIMIT', 'The original commissioning history exceeds its declared revision limit.', 413);
    const rows = [];
    for (const file of selected) {
      need(file.isFile() && !file.isSymbolicLink(), 'CUSTOMER_USE_HISTORY_INVALID', 'Retain ordinary original revision files.', 409);
      const match = REVISION_FILE.exec(file.name), saved = await record(join(path, file.name));
      const value = saved.value, previous = rows.at(-1);
      need(saved.sha256 === match[2] && value.schema === REVISION && value.id === id
        && value.revision === rows.length + 1 && Number(match[1]) === value.revision
        && value.parentSha256 === (previous?.sha256 ?? null)
        && value.document?.id === id && value.documentSha256 === valueDigest(value.document)
        && typeof value.createdAt === 'string' && plainObject(value.plans),
      'CUSTOMER_USE_HISTORY_CHANGED', 'The complete saved revision chain has changed.', 409);
      rows.push({ ...saved, path: join(path, file.name), summary: revisionView(value, saved.sha256) });
    }
    return rows;
  }
  async function selectedAt(id, sha256) {
    const rows = await historyAt(id), selected = sha256 === undefined ? rows.at(-1) : rows.find(row => row.sha256 === hash(sha256));
    need(selected, 'CUSTOMER_USE_COMMISSION_NOT_FOUND', 'Choose an existing saved commissioning revision.', 404);
    const source = await sourceAt(selected.value.document.calendarSha256);
    const document = customerUseDocument(selected.value.document, source.value, source.sha256);
    checkCustomerUsePlans(document, new Map(Object.entries(selected.value.plans).map(([key,value]) => [key,value.plan])));
    for (const period of document.periods) {
      const plan = nativePlan(selected.value.plans[planKey(period)], period);
      need(canonical(resolveCollectionEdition(plan, period).values) === canonical(period.values),
        'CUSTOMER_USE_PERIOD_BINDING_CHANGED', 'The saved period parameters differ from their original normalized selection.', 409);
    }
    return { rows, selected, source, document, head: rows.at(-1).summary };
  }
  async function readPlans(document) {
    const plans = {};
    for (const period of document.periods) {
      const key = planKey(period);
      if (Object.hasOwn(plans,key)) continue;
      const selected = await composer.inspectPlan(period.planId,period.planSha256);
      nativePlan(selected,period);
      plans[key] = copy(selected);
    }
    checkCustomerUsePlans(document,new Map(Object.entries(plans).map(([key,value]) => [key,value.plan])));
    return plans;
  }
  async function actionAt(path, id, kind, input, prepare) {
    const parent = join(path, 'actions', requestId(id));
    await initializationDirectory(join(path,'actions'), { create:true });
    await initializationDirectory(parent, { create:true });
    const old = await optional(join(parent,'request.json'));
    const inputSha256 = valueDigest(input);
    if (old) {
      need(old.value.schema === REQUEST && old.value.kind === kind && old.value.requestId === id
        && old.value.inputSha256 === inputSha256 && canonical(old.value.input) === canonical(input),
      'CUSTOMER_USE_REQUEST_CHANGED', 'The original request ID belongs to a different selected action.', 409);
      return { directory:parent, request:old.value, result:await optional(join(parent,'result.json')) };
    }
    const extra = await prepare();
    const value = { schema:REQUEST, kind, requestId:id, inputSha256, input:copy(input),
      preparedAt:new Date().toISOString(), ...extra };
    need(json(value).length <= MAX_RECORD, 'CUSTOMER_USE_RECORD_SIZE',
      'The complete saved plan and commissioning request exceed the original 16 MiB record limit.', 413);
    await exact(join(parent,'request.json'),value);
    return { directory:parent, request:value, result:null };
  }
  async function resultAt(action,value) {
    return (await exact(join(action.directory,'result.json'),value)).value;
  }
  async function importSource({ bytes, name = 'customer-use-calendar.json', expectedSha256 } = {}) {
    const parsed = readCustomerUseSource(bytes);
    if (expectedSha256 !== undefined) need(hash(expectedSha256) === parsed.sha256,
      'CUSTOMER_USE_SOURCE_CHANGED','The supplied source digest differs from the selected original file.',409);
    need(typeof name === 'string' && name.length > 0 && name.length <= 240 && !name.includes('\0'),
      'CUSTOMER_USE_SOURCE_NAME_INVALID','Retain the original export filename.');
    return writeAt(null, async () => {
      const path = join(root,'sources',parsed.sha256);
      await initializationDirectory(path,{create:true});
      const previous = await optional(join(path,'source.json'),65536);
      await retainInitializationFile(join(path,'calendar.json'),Buffer.from(bytes),{resume:true});
      const meta = previous?.value ?? { schema:ROOT+'.source',sha256:parsed.sha256,bytes:bytes.length,
        name:basename(name),case:copy(parsed.value.source),asOfDate:parsed.value.asOfDate,
        importedAt:new Date().toISOString(),installations:copy(parsed.value.selection) };
      await exact(join(path,'source.json'),meta);
      const saved = await sourceAt(parsed.sha256);
      return { metadata:saved.metadata,source:copy(saved.value),catalogue:sourceCatalogue(saved.value),executionStarted:false };
    });
  }
  async function listSources() {
    if (!await header()) return {schema:ROOT+'.sources',directory,sources:[]};
    const files = await readdir(join(root,'sources'),{withFileTypes:true}),sources=[];
    for (const file of files) {
      if (!/^[a-f0-9]{64}$/.test(file.name)) continue;
      need(file.isDirectory() && !file.isSymbolicLink(),'CUSTOMER_USE_SOURCE_INVALID','Retain the original source directories.',409);
      const saved = await sourceAt(file.name);
      sources.push(saved.metadata);
    }
    return {schema:ROOT+'.sources',directory,sources:sources.sort((a,b)=>b.importedAt.localeCompare(a.importedAt))};
  }
  async function sourceView(sha256) {
    const saved = await sourceAt(sha256);
    return {metadata:saved.metadata,source:copy(saved.value),catalogue:sourceCatalogue(saved.value)};
  }
  async function save({ document:value, expectedHeadSha256 = null, actor:who, requestId:rid } = {}) {
    actor(who);requestId(rid);
    if (expectedHeadSha256 !== null) hash(expectedHeadSha256);
    const source = await sourceAt(hash(value?.calendarSha256));
    const document = customerUseDocument(value,source.value,source.sha256);
    const plans = await readPlans(document);
    document.periods = document.periods.map(period => ({...period,
      values:resolveCollectionEdition(plans[planKey(period)].plan,period).values}));
    const input = {document,expectedHeadSha256,actor:who};
    return writeAt(document.id,async path => {
      await initializationDirectory(join(path,'revisions'),{create:true});
      const action = await actionAt(path,rid,'SAVE',input,async () => {
        const history = await historyAt(document.id),head = history.at(-1);
        need((head?.sha256 ?? null) === expectedHeadSha256,'CUSTOMER_USE_HEAD_CHANGED',
          'A newer saved edition exists. Reopen it before saving this edited definition.',409,
          {expectedHeadSha256,currentHead:head?.summary ?? null});
        if (head && head.value.documentSha256 === valueDigest(document))
          return {existingRevision:head.summary,revision:null};
        return {existingRevision:null,revision:{schema:REVISION,id:document.id,revision:history.length+1,
          parentSha256:head?.sha256 ?? null,createdAt:new Date().toISOString(),actor:who,
          requestId:rid,documentSha256:valueDigest(document),document,plans}};
      });
      if (!action.result) {
        const history = await historyAt(document.id),head = history.at(-1);
        if (action.request.existingRevision) {
          const saved = history.find(row=>row.sha256===action.request.existingRevision.sha256);
          need(saved,'CUSTOMER_USE_HISTORY_CHANGED','The exact previously saved definition is missing.',409);
          await resultAt(action,{schema:REVISION+'.saved',requestId:rid,reused:true,...saved.summary});
        } else {
          const value = action.request.revision,bytes = json(value),sha256 = digest(bytes);
          let saved = history.find(row=>row.sha256===sha256);
          if (!saved) {
            need((head?.sha256 ?? null)===value.parentSha256 && history.length+1===value.revision,
              'CUSTOMER_USE_HEAD_CHANGED','Preserve the intervening saved revision before continuing this original request.',409,
              {currentHead:head?.summary??null});
            const target=join(path,'revisions',String(value.revision).padStart(8,'0')+'-'+sha256+'.json');
            await retainInitializationFile(target,bytes,{resume:true});
            saved={value,sha256};
          }
          await resultAt(action,{schema:REVISION+'.saved',requestId:rid,reused:false,...revisionView(saved.value,saved.sha256)});
        }
      }
      const result=(await record(join(action.directory,'result.json'))).value;
      const history=await historyAt(document.id);
      return {...result,currentHead:history.at(-1).summary,executionStarted:false};
    });
  }
  async function list() {
    if (!await header()) return {schema:ROOT,directory,queueRoot,commissions:[]};
    const files=await readdir(join(root,'commissions'),{withFileTypes:true}),commissions=[];
    for (const file of files) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(file.name)) continue;
      need(file.isDirectory()&&!file.isSymbolicLink(),'CUSTOMER_USE_HISTORY_INVALID','Retain the original commissioning directories.',409);
      const rows=await historyAt(file.name);
      if (rows.length) commissions.push({...rows.at(-1).summary,revisions:rows.length});
    }
    commissions.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
    return {schema:ROOT,directory,queueRoot,commissions};
  }
  async function nativePeriods(document) {
    const rows=[];
    for (const period of document.periods) {
      try {
        const saved=await composer.inspectEdition(period.collectionId);
        need(periodMatches(saved,period),'CUSTOMER_USE_PERIOD_BINDING_CHANGED',
          'The original period belongs to another saved plan or parameter selection.',409);
        rows.push({selection:copy(period),native:saved,error:null});
      } catch(error) {
        rows.push({selection:copy(period),native:null,error:errorView(error)});
      }
    }
    return rows;
  }
  async function observedUses(saved, periods, responses) {
    const nativePeriods = new Map(periods.map(row => [row.selection.collectionId, row]));
    const originalUses = new Map(sourceCatalogue(saved.source.value).map(row => [entryKey(row.ref), row]));
    const rows = [];
    for (const binding of saved.document.bindings) {
      const original = originalUses.get(entryKey(binding.entry)), requests = [];
      for (const reference of binding.requests) {
        const period = nativePeriods.get(reference.collectionId);
        const native = period?.native;
        const request = native?.requests?.find(row => row.key === reference.requestKey);
        const item = request ? native.collection?.items?.find(row => row.intentId === request.intentId) : null;
        requests.push({selection:copy(reference),periodPhase:native?.phase??null,
          request:request?copy(request):null,collectionId:native?.collection?.id??null,
          manifestSha256:native?.collection?.manifestSha256??null,item:item?copy(item):null,
          error:period?.error??(request?null:{code:'CUSTOMER_USE_ORIGINAL_REQUEST_UNPREPARED',
            message:'Prepare this original saved period to retain its request identity.'})});
      }
      rows.push({bindingId:binding.id,entry:copy(binding.entry),calendarUse:copy(original.entry),
        task:copy(original.task),buyer:copy(original.buyer),funding:copy(original.funding),
        requests,responses:responses.filter(row=>row.bindingId===binding.id)});
    }
    return {schema:ROOT+'.observations',commission:saved.selected.summary,
      source:copy(saved.source.value.source),observedAt:new Date().toISOString(),rows,
      qualification:'Original current collection and job records are shown without assigning a new purchase. Retained response references are reverified by the original download or buyer handoff. Grant receiving owns the actual receipt and deployment association.'};
  }
  async function retainedResponses(document) {
    const rows=[];
    for (const binding of document.bindings) for (const ref of binding.responses) {
      try {
        const collection=await collections.inspect(ref.collectionId);
        need(collection.manifestSha256===ref.manifestSha256,'CUSTOMER_USE_COLLECTION_CHANGED','The original result collection changed.',409);
        const item=collection.items.find(item=>item.intentId===ref.intentId),file=item?.job?.outcome?.responseFile;
        need(file?.status==='SAVED'&&file.sha256===ref.responseSha256,'CUSTOMER_USE_RESPONSE_CHANGED',
          'The selected retained response is missing or has a different original digest.',409);
        rows.push({bindingId:binding.id,selection:copy(ref),collectionId:collection.id,
          item:copy(item),nativeFile:copy(file),error:null});
      } catch(error) {rows.push({bindingId:binding.id,selection:copy(ref),error:errorView(error)});}
    }
    return rows;
  }
  async function returnsAt(id) {
    const path=join(root,'commissions',id,'actions');
    const files=await readdir(path,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
    const returned=[];
    for(const file of files) {
      if(!REQUEST_ID.test(file.name))continue;
      need(file.isDirectory()&&!file.isSymbolicLink(),'CUSTOMER_USE_REQUEST_CHANGED','Retain original action directories.',409);
      const request=await optional(join(path,file.name,'request.json'));
      if(request?.value.kind!=='CAPTURE_BUYER_RETURN')continue;
      const result=await optional(join(path,file.name,'result.json'));
      if(result) {
        const verified=await returnedFile({id,requestId:file.name});
        returned.push({requestId:file.name,revisionSha256:verified.revisionSha256,file:result.value.file,
          capturedAt:result.value.report.source.capturedAt,counts:result.value.report.counts,
          bindingIds:request.value.input.bindingIds,state:'RETURNED'});
      } else returned.push({requestId:file.name,revisionSha256:request.value.input.sha256,
        bindingIds:request.value.input.bindingIds,state:'RECONCILE_ORIGINAL'});
    }
    return returned;
  }
  async function inspect({id,sha256}={}) {
    const saved=await selectedAt(id,sha256);
    const [periods,responses]=await Promise.all([nativePeriods(saved.document),retainedResponses(saved.document)]);
    return {schema:ROOT+'.selection',directory,queueRoot,selected:saved.selected.summary,currentHead:saved.head,
      history:saved.rows.map(row=>row.summary),document:copy(saved.document),
      calendar:{metadata:saved.source.metadata,source:copy(saved.source.value)},
      plans:copy(saved.selected.value.plans),review:customerUseReview(saved.document,saved.source.value),
      periods,responses,returns:await returnsAt(id),observations:await observedUses(saved,periods,responses),executionStarted:false};
  }
  async function prepare({id,sha256,collectionId,actor:who,requestId:rid}={}) {
    commissionId(id);hash(sha256);commissionId(collectionId);actor(who);requestId(rid);
    return writeAt(id,async path=>{
      const selected=await selectedAt(id,sha256);
      const selection=commissionSelection(selected.document,selected.source.value,collectionId);
      const input={id,sha256,collectionId,actor:who};
      const action=await actionAt(path,rid,'PREPARE_PERIOD',input,async()=>({period:selection.period,
        commissioningSelection:selection,sourceSha256:selected.source.sha256}));
      if (action.result) return {...action.result.value,current:await composer.inspectEdition(collectionId)};
      // Original prepare owns interrupted input capture and stable request identities.
      const native=await composer.prepareEdition(action.request.period);
      need(periodMatches(native,action.request.period),'CUSTOMER_USE_PERIOD_BINDING_CHANGED',
        'Original period preparation returned a different saved selection.',409);
      const result={schema:ROOT+'.period-prepared',requestId:rid,commission:{id,sha256},
        selection:action.request.commissioningSelection,native:copy(native),executionStarted:false};
      await resultAt(action,result);
      return result;
    });
  }
  async function create({id,sha256,collectionId,expectedEditionSha256,expectedPreviewSha256,actor:who,requestId:rid}={}) {
    commissionId(id);hash(sha256);commissionId(collectionId);hash(expectedEditionSha256);hash(expectedPreviewSha256);
    actor(who);requestId(rid);
    return writeAt(id,async path=>{
      const selected=await selectedAt(id,sha256),selection=commissionSelection(selected.document,selected.source.value,collectionId);
      const input={id,sha256,collectionId,expectedEditionSha256,expectedPreviewSha256,actor:who};
      const action=await actionAt(path,rid,'CREATE_PERIOD',input,async()=>{
        const native=await composer.inspectEdition(collectionId);
        need(periodMatches(native,selection.period),'CUSTOMER_USE_PERIOD_BINDING_CHANGED',
          'Review the same original plan and period before creation.',409);
        need(native.editionSha256===expectedEditionSha256&&native.preview?.previewSha256===expectedPreviewSha256,
          'CUSTOMER_USE_PERIOD_REVIEW_CHANGED','The original period or spending preview changed after review.',409);
        return {period:selection.period,commissioningSelection:selection};
      });
      if (action.result) return {...action.result.value,current:await composer.inspectEdition(collectionId)};
      const native=await composer.createEdition({collectionId,expectedEditionSha256,expectedPreviewSha256});
      need(periodMatches(native,action.request.period),'CUSTOMER_USE_PERIOD_BINDING_CHANGED',
        'Original collection creation returned a different period.',409);
      const result={schema:ROOT+'.period-created',requestId:rid,commission:{id,sha256},
        selection:action.request.commissioningSelection,native:copy(native),executionStarted:false};
      await resultAt(action,result);
      return result;
    });
  }
  async function captureSelection(saved,bindingIds) {
    const originals=new Map(sourceCatalogue(saved.source.value).map(row=>[entryKey(row.ref),row]));
    const periods=new Map(),currentCollections=new Map(),bindings=[];
    async function currentCollection(id) {
      if(!currentCollections.has(id))currentCollections.set(id,await collections.inspect(id));
      return currentCollections.get(id);
    }
    for(const bindingId of bindingIds) {
      const selected=saved.document.bindings.find(row=>row.id===bindingId);
      need(selected,'CUSTOMER_USE_BINDING_NOT_FOUND','Choose a binding from the saved commissioning revision.',404);
      const original=originals.get(entryKey(selected.entry)),requests=[];
      for(const reference of selected.requests) {
        if(!periods.has(reference.collectionId)) {
          const choice=saved.document.periods.find(row=>row.collectionId===reference.collectionId);
          const native=await composer.inspectEdition(reference.collectionId);
          need(periodMatches(native,choice)&&native.phase==='CREATED',
            'CUSTOMER_USE_ORIGINAL_PERIOD_REQUIRED','Open the original created period before returning buyer results.',409);
          periods.set(reference.collectionId,native);
        }
        const period=periods.get(reference.collectionId);
        const request=period.requests.find(row=>row.key===reference.requestKey);
        need(request,'CUSTOMER_USE_ORIGINAL_REQUEST_REQUIRED','Retain the original resolved request identity.',409);
        const collection=await currentCollection(reference.collectionId);
        need(collection.manifestSha256===period.collection?.manifestSha256,
          'CUSTOMER_USE_COLLECTION_CHANGED','The original created period and collection disagree.',409);
        const item=collection.items.find(row=>row.intentId===request.intentId);
        need(item?.job&&!item.error&&item.job.sourceConfigSha256===item.sourceConfig.sha256,
          'CUSTOMER_USE_NATIVE_JOB_REQUIRED','Run or inspect this request through the original Inbox before capturing its results.',409);
        requests.push({collectionId:reference.collectionId,manifestSha256:hash(collection.manifestSha256),
          requestKey:reference.requestKey,intentId:request.intentId,jobId:hash(item.job.id),
          configSha256:hash(item.job.configSha256),sourceConfigSha256:hash(item.sourceConfig.sha256),responseSha256:null});
      }
      for(const reference of selected.responses) {
        const collection=await currentCollection(reference.collectionId);
        need(collection.manifestSha256===reference.manifestSha256,'CUSTOMER_USE_COLLECTION_CHANGED',
          'Retain the exact original result collection.',409);
        const item=collection.items.find(row=>row.intentId===reference.intentId);
        need(item?.job&&!item.error&&item.job.outcome?.responseFile?.status==='SAVED'
          &&item.job.outcome.responseFile.sha256===reference.responseSha256,
          'CUSTOMER_USE_RESPONSE_CHANGED','Retain the original saved response before capturing its reopened use.',409);
        requests.push({collectionId:reference.collectionId,manifestSha256:reference.manifestSha256,
          requestKey:null,intentId:reference.intentId,jobId:hash(item.job.id),
          configSha256:hash(item.job.configSha256),sourceConfigSha256:hash(item.sourceConfig.sha256),responseSha256:reference.responseSha256});
      }
      bindings.push({id:selected.id,entry:copy(selected.entry),kind:selected.kind,use:copy(original.entry),requests});
    }
    const intents=[...new Set(bindings.flatMap(row=>row.requests.map(request=>request.intentId)))];
    need(intents.length>0&&intents.length<=100,'CUSTOMER_USE_CAPTURE_LIMIT',
      'Select between one and 100 distinct original Inbox intents for this complete return.',413);
    const source=saved.source.value.source;
    return {intents,customerUse:{source:{caseId:source.caseId,caseVersion:source.caseVersion,mode:source.mode,
      planId:source.planId,planContentSha256:source.planContentSha256,calendarSha256:saved.source.sha256},
      commission:{id:saved.document.id,revision:saved.selected.value.revision,
        revisionSha256:saved.selected.sha256,documentSha256:saved.selected.value.documentSha256},bindings}};
  }
  async function capture({id,sha256,bindingIds,maxVerifyBytes=268435456,actor:who,requestId:rid}={}) {
    commissionId(id);hash(sha256);actor(who);requestId(rid);
    need(Array.isArray(bindingIds)&&bindingIds.length>0&&bindingIds.length<=2000
      &&bindingIds.every(value=>typeof value==='string')&&new Set(bindingIds).size===bindingIds.length,
      'CUSTOMER_USE_CAPTURE_BINDINGS_REQUIRED','Choose distinct saved use bindings for this buyer return.');
    bindingIds=bindingIds.map(commissionId).sort();
    need(Number.isSafeInteger(maxVerifyBytes)&&maxVerifyBytes>=0&&maxVerifyBytes<=1073741824,
      'CUSTOMER_USE_CAPTURE_VERIFY_LIMIT','Choose the original per-file verification bound from zero through 1 GiB.');
    return writeAt(id,async path=>{
      const input={id,sha256,bindingIds,maxVerifyBytes,actor:who};
      const action=await actionAt(path,rid,'CAPTURE_BUYER_RETURN',input,async()=>{
        const saved=await selectedAt(id,sha256);
        return captureSelection(saved,bindingIds);
      });
      const originalPath=join(action.directory,'original-buyer-handoff.json');
      let original=await optionalInitializationBytes(originalPath,INBOX_MAX_BYTES);
      if(!original) {
        need(!action.result,'CUSTOMER_USE_CAPTURE_SOURCE_MISSING','Restore the exact original retained buyer capture.',409);
        // This original read-only API verifies outputs and source stability; it never executes a request.
        const captured=await captureInbox({directory:queueRoot,intentIds:action.request.intents,
          maxVerifyBytes:action.request.input.maxVerifyBytes});
        await retainInitializationFile(originalPath,captured.raw,{resume:true});
        original=await initializationBytes(originalPath,INBOX_MAX_BYTES);
      }
      inspectHandoff(original);
      const built=createCustomerUseReturn({raw:original,customerUse:action.request.customerUse});
      const filePath=join(action.directory,'customer-use-return.json');
      await retainInitializationFile(filePath,built.raw,{resume:true});
      const bytes=await initializationBytes(filePath,CUSTOMER_USE_RETURN_MAX_BYTES),report=inspectCustomerUseReturn(bytes);
      need(digest(bytes)===digest(built.raw),'CUSTOMER_USE_RETURN_CHANGED','Preserve the exact first captured buyer return.',409);
      const result={schema:ROOT+'.buyer-return',requestId:rid,commission:{id,sha256},
        file:{name:id+'-'+rid+'-buyer-return.json',bytes:bytes.length,sha256:digest(bytes)},
        original:{bytes:original.length,sha256:digest(original)},report,executionStarted:false,
        receiving:'Review this complete return in the original Grant Buyer receiving screen; keep the selected deployment and original purchase identities.'};
      need(json(result).length<=MAX_RECORD,'CUSTOMER_USE_RECORD_SIZE','Select a smaller complete buyer return.',413);
      if(action.result)need(canonical(action.result.value)===canonical(result),'CUSTOMER_USE_RETURN_CHANGED',
        'Preserve the original captured return receipt.',409);
      else await resultAt(action,result);
      return result;
    });
  }
  async function returnedFile({id,requestId:rid}={}) {
    commissionId(id);requestId(rid);
    const path=join(root,'commissions',id,'actions',rid);
    const request=(await record(join(path,'request.json'))).value,result=(await record(join(path,'result.json'))).value;
    need(request.schema===REQUEST&&request.kind==='CAPTURE_BUYER_RETURN'&&request.requestId===rid
      &&request.inputSha256===valueDigest(request.input)&&request.input.id===id&&result.requestId===rid,
      'CUSTOMER_USE_RETURN_REQUEST_CHANGED','Retain the original completed capture request.',409);
    const bytes=await initializationBytes(join(path,'customer-use-return.json'),CUSTOMER_USE_RETURN_MAX_BYTES);
    const report=inspectCustomerUseReturn(bytes);
    need(result.file.sha256===digest(bytes)&&result.file.bytes===bytes.length
      &&canonical(report)===canonical(result.report)&&canonical(report.customerUse)===canonical(request.customerUse),
      'CUSTOMER_USE_RETURN_CHANGED','The saved buyer return differs from its original receipt.',409);
    return {name:result.file.name,type:'application/json; charset=utf-8',bytes,
      sha256:result.file.sha256,revisionSha256:request.input.sha256};
  }
  async function action({id,requestId:rid}={}) {
    commissionId(id);requestId(rid);
    // Mutations hold the original directory's shared lease. Inspect admission under
    // its exclusive lease so absence cannot race an in-flight journal publication.
    return lease(directory,async()=>{
      await header();
      const path=join(root,'commissions',id,'actions',rid),request=await optional(join(path,'request.json'));
      if(!request)return {schema:ROOT+'.action',id,requestId:rid,request:null,result:null,
        state:'NOT_ADMITTED',checkedAt:new Date().toISOString(),executionStarted:false};
      need(request.value.schema===REQUEST&&request.value.requestId===rid&&request.value.inputSha256===valueDigest(request.value.input),
        'CUSTOMER_USE_REQUEST_CHANGED','The original retained request no longer matches.',409);
      const result=await optional(join(path,'result.json'));
      return {schema:ROOT+'.action',id,requestId:rid,request:request.value,result:result?.value??null,
        state:result?'RETURNED':'RECONCILE_ORIGINAL',executionStarted:false};
    });
  }
  async function exportSelection({id,sha256,format='json'}={}) {
    need(['json','csv'].includes(format),'CUSTOMER_USE_EXPORT_FORMAT','Choose the complete JSON or dated-use CSV export.');
    const selected=await selectedAt(id,sha256),view=await inspect({id,sha256:selected.selected.sha256});
    if(format==='csv') {
      const bytes=customerUseCsv(view.review);
      return {name:id+'-customer-use.csv',type:'text/csv; charset=utf-8',
        bytes,sha256:digest(bytes),revisionSha256:selected.selected.sha256};
    }
    const sources=[];
    for(const sourceSha of new Set(selected.rows.map(row=>row.value.document.calendarSha256))) {
      const saved=await sourceAt(sourceSha);
      sources.push({metadata:saved.metadata,encoding:'base64',content:saved.bytes.toString('base64')});
    }
    const payload={schema:ROOT+'.export',directory,queueRoot,selectedSha256:selected.selected.sha256,
      currentHead:selected.head,revisions:selected.rows.map(row=>({sha256:row.sha256,record:row.value})),
      sources,current:view,
      receiving:'The original complete encrypted Collections backup retains this authoring tree, exact prepared request files, operator roots, inbox and completed response files. Use that maintained recovery workflow to continue execution.'};
    const bytes=json(payload);
    need(bytes.length<=64*1024*1024,'CUSTOMER_USE_EXPORT_SIZE',
      'Use the original complete encrypted Collections backup for a history exceeding the 64 MiB inspection export limit.',413);
    return {name:id+'-customer-use.json',type:'application/json; charset=utf-8',bytes,
      sha256:digest(bytes),revisionSha256:selected.selected.sha256};
  }
  async function verifyReceiving() {
    const library=await list(),summaries=[];
    for(const item of library.commissions) {
      const view=await inspect({id:item.id});
      summaries.push({id:item.id,currentHead:view.currentHead,revisions:view.history.length,
        source:view.calendar.metadata,returns:view.returns,periods:view.periods.map(row=>({collectionId:row.selection.collectionId,
          nativePhase:row.native?.phase??null,error:row.error})),responses:view.responses.map(row=>({
            bindingId:row.bindingId,selection:row.selection,error:row.error??null}))});
    }
    return {schema:ROOT+'.receiving',directory,queueRoot,commissions:summaries,executionStarted:false,
      preserved:'Original immutable Calendar bytes, all commissioning revisions, saved plan definitions and native period/result identities.'};
  }
  return {
    directory:root,collectionsDirectory:directory,queueRoot,
    importSource:input=>tracked(()=>importSource(input)),
    listSources:()=>tracked(listSources),source:sha=>tracked(()=>sourceView(sha)),
    save:input=>tracked(()=>save(input)),list:()=>tracked(list),inspect:input=>tracked(()=>inspect(input)),
    prepare:input=>tracked(()=>prepare(input)),create:input=>tracked(()=>create(input)),
    capture:input=>tracked(()=>capture(input)),returnedFile:input=>tracked(()=>returnedFile(input)),action:input=>tracked(()=>action(input)),
    export:input=>tracked(()=>exportSelection(input)),verifyReceiving:()=>tracked(verifyReceiving),
    close(){
      if(closePromise)return closePromise;
      closing=true;
      closePromise=(async()=>{await Promise.allSettled([...pending]);if(ownsComposer)composer.close();})();
      return closePromise;
    },
  };
}
