// MIT. One original MySQL editor, publisher and versioned seller per product owner.
import { DatabaseSync } from 'node:sqlite';
import { chmod, lstat, readFile, readdir, mkdir, rename, open, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { createMysqlWorkspace } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/mysql/workspace/model.mjs';
import { startMysqlMerchantWorkspace } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/mysql/workspace/server.mjs';
import { createMysqlNativeFactory } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/mysql/merchant.mjs';
import { openMysqlPublisher } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/mysql/publisher/model.mjs';
import { openPostgresSchedule } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/schedule.mjs';
import { startPostgresPublisherServer } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/server.mjs';
import { openDatasetVersions, DATASET_SNAPSHOT_PARAMETER } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/versions.mjs';
import { startVersionedDatasetSeller, datasetControl } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/service.mjs';
import { buildDatasetSellerConfig } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-cli.mjs';
import { readSellerConfig } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/serve.mjs';
import { MerchantPublisher } from '../../stellar-forge/mcp-merchant-operator/publisher.mjs';
import { readMysqlProduct, privateDirectory, readPrivate, readJson, once, exists, bytes, digest,
  identity, atomicJson, syncDirectory, acquireDatasetLease, need, fault, stamp, object, UUID, SHA, SESSION_SCHEMA } from './setup.mjs';
import { createMysqlArchive, inspectMysqlArchive } from './receiving.mjs';

const ID = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const DRAFT = 'stellar-forge.mysql-editor-draft.v1';
const draftFields = ['release-id','release-label','public-origin','endpoint-id','route-path','route-method',
  'service-name','endpoint-description','max-rows','max-bytes','timeout-ms'];
const clone = value => structuredClone(value);
const parse = value => value === null ? null : JSON.parse(value);
const errorValue = error => ({ code: error.code ?? 'MYSQL_PRODUCT_OPERATION_FAILED', message: String(error.message).slice(0,1000) });
function only(value, names) {
  need(object(value) && Object.keys(value).every(key => names.includes(key)), 'MYSQL_PRODUCT_INPUT_INVALID');
}
function nativeId(value) { need(typeof value === 'string' && UUID.test(value), 'MYSQL_PRODUCT_REQUEST_ID_INVALID'); return value; }
function releaseId(value) {
  need(typeof value === 'string' && ID.test(value) && !['constructor','prototype','__proto__'].includes(value),
    'MYSQL_PRODUCT_RELEASE_ID_INVALID'); return value;
}
function text(value, limit, name) {
  need(typeof value === 'string' && value.trim() && value.length <= limit && !value.includes('\0'),
    'MYSQL_PRODUCT_TEXT_REQUIRED', 'Enter ' + name + ' within ' + limit + ' characters.'); return value.trim();
}
function page(value = {}) {
  only(value, ['offset','limit']); const offset = value.offset ?? 0, limit = value.limit ?? 25;
  need(Number.isSafeInteger(offset) && offset >= 0 && offset <= 1000000 &&
    Number.isInteger(limit) && limit >= 1 && limit <= 100, 'MYSQL_PRODUCT_PAGE_INVALID');
  return { offset, limit };
}
function validateDraft(value) {
  only(value,['schema','fields','table','schemaFingerprint','columns','endpoints','filters','orders','payments','editing','endpointDirty']);
  need(value.schema === DRAFT && object(value.fields) &&
    Object.keys(value.fields).length === draftFields.length && draftFields.every(key =>
      typeof value.fields[key] === 'string' && value.fields[key].length <= 4096) &&
    typeof value.table === 'string' && value.table.length <= 256 &&
    (value.schemaFingerprint === null || SHA.test(value.schemaFingerprint)) &&
    (value.editing === null || typeof value.editing === 'string' && ID.test(value.editing)) &&
    typeof value.endpointDirty === 'boolean', 'MYSQL_PRODUCT_DRAFT_INVALID');
  const rows = (items, maximum) => Array.isArray(items) && items.length <= maximum && items.every(object);
  need(Array.isArray(value.columns) && value.columns.length <= 64 &&
    value.columns.every(item => typeof item === 'string' && item.length <= 256) &&
    rows(value.endpoints,64) && rows(value.filters,16) && rows(value.orders,4) && rows(value.payments,8),
    'MYSQL_PRODUCT_DRAFT_INVALID');
  for (const endpoint of value.endpoints)
    need(['id','table','path','method'].every(key => typeof endpoint[key] === 'string') &&
      Array.isArray(endpoint.columns) && Array.isArray(endpoint.filters) && Array.isArray(endpoint.orderBy),
      'MYSQL_PRODUCT_DRAFT_INVALID');
  for (const item of [...value.filters,...value.orders]) need(typeof item.column === 'string', 'MYSQL_PRODUCT_DRAFT_INVALID');
  for (const payment of value.payments) need(['network','amount','maxTimeoutSeconds','asset','payTo','extraText']
    .every(key => typeof payment[key] === 'string' || key === 'maxTimeoutSeconds' && Number.isInteger(payment[key])),
    'MYSQL_PRODUCT_DRAFT_INVALID');
  need(bytes(value).length <= 480 * 1024, 'MYSQL_PRODUCT_DRAFT_TOO_LARGE');
  return clone(value);
}
function viewAction(row) {
  return row ? { requestId: row.id, action: row.action, createdAt: row.created, updatedAt: row.updated,
    state: row.state, request: parse(row.request), result: parse(row.result), error: parse(row.error) } : null;
}
async function closeListener(listener) {
  if (!listener) return;
  const timer = setTimeout(() => listener.server?.closeAllConnections?.(),15000);
  try { await listener.close(); } finally { clearTimeout(timer); }
}

/** This owner is created by the original merchant provider, never by an HTTP pathname. */
export async function openMysqlProductRuntime({ directory, environment = process.env, browserPort = 0 } = {}) {
  const opened = await readMysqlProduct(directory), { profile, paths: p } = opened;
  const lease = acquireDatasetLease(p.directory);
  let db, model, browser, factory, closing, phase = 'STARTING', queue = Promise.resolve();
  const publications = new Map(), tickets = new Map(), streams = new Set();
  let publisherAdapter = new MerchantPublisher({});
  const instanceId = randomUUID();
  function serial(fn) {
    if (['CLOSING','CLOSED'].includes(phase)) return Promise.reject(fault('MYSQL_PRODUCT_CLOSING', 'This product is closing.',503));
    const operation = queue.then(async () => {
      need(phase === 'OPEN', 'MYSQL_PRODUCT_BUSY', 'Wait for the retained original product operation.'); lease.assertHeld();
      return fn();
    });
    queue = operation.catch(() => {}); return operation;
  }
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  async function openDatabase() {
    if (await exists(p.database)) {
      const stat = await lstat(p.database);
      need(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && !(stat.mode & 0o077), 'MYSQL_PRODUCT_DATABASE_INVALID');
    }
    db = new DatabaseSync(p.database); await chmod(p.database,0o600);
    db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;" +
      "CREATE TABLE IF NOT EXISTS product_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);" +
      "CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,label TEXT NOT NULL,revision INTEGER NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL);" +
      "CREATE TABLE IF NOT EXISTS draft_versions(id TEXT NOT NULL,revision INTEGER NOT NULL,created TEXT NOT NULL,note TEXT NOT NULL,digest TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(id,revision),FOREIGN KEY(id) REFERENCES drafts(id));" +
      "CREATE TABLE IF NOT EXISTS product_actions(id TEXT PRIMARY KEY,action TEXT NOT NULL,hash TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,state TEXT NOT NULL,request TEXT NOT NULL,result TEXT,error TEXT);" +
      "CREATE TABLE IF NOT EXISTS product_events(id INTEGER PRIMARY KEY,created TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL);");
    const selected = db.prepare("SELECT value FROM product_meta WHERE key='product_id'").get();
    if (selected) need(selected.value === profile.productId,'MYSQL_PRODUCT_DATABASE_IDENTITY');
    else db.prepare("INSERT INTO product_meta(key,value) VALUES('product_id',?)").run(profile.productId);
    if (await exists(join(p.directory,'MYSQL_RECEIVED.json'))) {
      const received = await readJson(join(p.directory,'MYSQL_RECEIVED.json'),65536);
      const id = received.transferId ?? received.manifest?.transferId;
      if (id && UUID.test(id)) db.prepare("UPDATE product_actions SET state='RESTORED',updated=?,result=?,error=NULL WHERE id=? AND action='archive' AND state<>'COMPLETED'")
        .run(stamp(),JSON.stringify({schema:'stellar-forge.mysql-product-restored-action.v1',receipt:received}),id);
    }
  }
  function event(kind,data) { db.prepare('INSERT INTO product_events(created,kind,data) VALUES(?,?,?)').run(stamp(),kind,JSON.stringify(data)); }
  function action(id) { nativeId(id); return viewAction(db.prepare('SELECT * FROM product_actions WHERE id=?').get(id)); }
  function begin(id,name,input) {
    nativeId(id); const hash = identity({name,input}), row = db.prepare('SELECT * FROM product_actions WHERE id=?').get(id);
    if (row) {
      need(row.hash === hash && row.action === name,'MYSQL_PRODUCT_ACTION_CONFLICT','This request UUID belongs to different original input.');
      return viewAction(row);
    }
    const now = stamp();
    db.prepare('INSERT INTO product_actions(id,action,hash,created,updated,state,request) VALUES(?,?,?,?,?,?,?)')
      .run(id,name,hash,now,now,'PENDING',JSON.stringify(input)); return null;
  }
  function complete(id,result) {
    db.prepare("UPDATE product_actions SET state='COMPLETED',updated=?,result=?,error=NULL WHERE id=?")
      .run(stamp(),JSON.stringify(result),id); return clone(result);
  }
  async function retained(id,name,input,fn) {
    const prior = begin(id,name,input);
    if (['COMPLETED','RESTORED'].includes(prior?.state)) return { ...prior.result, replayed:true };
    db.prepare("UPDATE product_actions SET state='RUNNING',updated=?,error=NULL WHERE id=?").run(stamp(),id);
    try { return complete(id,await fn(prior)); }
    catch (error) {
      if (db) db.prepare("UPDATE product_actions SET state='PENDING',updated=?,error=? WHERE id=?")
        .run(stamp(),JSON.stringify(errorValue(error)),id);
      throw error;
    }
  }
  async function reopenModel() {
    model = await createMysqlWorkspace({ sourceFile:p.sourceFile,stateDirectory:p.workspaceDirectory,environment,
      sellerPort:profile.runtime.sellerPort,operationsPort:profile.runtime.operationsPort,nativeFactory:factory });
  }
  function draftGet(id,revision) {
    nativeId(id); const head = db.prepare('SELECT * FROM drafts WHERE id=?').get(id);
    need(head,'MYSQL_PRODUCT_DRAFT_NOT_FOUND');
    const selected = revision ?? head.revision;
    need(Number.isSafeInteger(selected) && selected >= 1,'MYSQL_PRODUCT_DRAFT_VERSION_INVALID');
    const row = db.prepare('SELECT * FROM draft_versions WHERE id=? AND revision=?').get(id,selected);
    need(row,'MYSQL_PRODUCT_DRAFT_VERSION_NOT_FOUND');
    return { id, label:head.label, revision:row.revision, currentRevision:head.revision,
      createdAt:row.created,note:row.note,sha256:row.digest,draft:parse(row.data) };
  }
  function draftsList(input = {}) {
    const paging = page(input), count = db.prepare('SELECT count(*) AS total FROM drafts').get().total;
    return { ...paging,total:count,next:paging.offset+paging.limit<count?paging.offset+paging.limit:null,
      items:db.prepare('SELECT id,label,revision,created,updated FROM drafts ORDER BY updated DESC,id LIMIT ? OFFSET ?')
        .all(paging.limit,paging.offset) };
  }
  function draftSave(input) {
    only(input,['requestId','draftId','expectedRevision','label','note','draft']);
    const data = validateDraft(input.draft), id = nativeId(input.draftId), requestId = nativeId(input.requestId);
    const label = text(input.label,160,'a draft name'), note = text(input.note,2000,'the saved-version note');
    need(Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 0,'MYSQL_PRODUCT_DRAFT_REVISION_INVALID');
    return transaction(() => {
      const prior = begin(requestId,'draft_save',input);
      if (prior?.state === 'COMPLETED') return { ...prior.result,replayed:true };
      const head = db.prepare('SELECT * FROM drafts WHERE id=?').get(id);
      need((head?.revision ?? 0) === input.expectedRevision,'MYSQL_PRODUCT_DRAFT_CHANGED',
        'Open the current draft version before saving another version.');
      const revision = input.expectedRevision+1, now = stamp();
      if (!head) db.prepare('INSERT INTO drafts VALUES(?,?,?,?,?)').run(id,label,revision,now,now);
      else db.prepare('UPDATE drafts SET label=?,revision=?,updated=? WHERE id=?').run(label,revision,now,id);
      db.prepare('INSERT INTO draft_versions VALUES(?,?,?,?,?,?)').run(id,revision,now,note,identity(data),JSON.stringify(data));
      const saved = draftGet(id,revision); event('DRAFT_VERSION_SAVED',{id,revision,requestId,sha256:saved.sha256});
      return complete(requestId,saved);
    });
  }
  function publicationPaths(id) {
    const directory = join(p.publicationDirectory,releaseId(id));
    return { directory,ledger:join(directory,'ledger'),dataset:join(directory,'dataset'),
      configurations:join(directory,'configurations'),binding:join(directory,'binding.json') };
  }
  async function publicationBinding(id,expected) {
    const path = publicationPaths(id), binding = await readJson(path.binding,65536);
    need(binding.schema === 'stellar-forge.mysql-product-publication.v1' && binding.releaseId === id &&
      binding.productId === profile.productId && SHA.test(binding.manifestSha256),'MYSQL_PRODUCT_PUBLICATION_INVALID');
    if (expected) need(expected === binding.manifestSha256,'MYSQL_PRODUCT_PUBLICATION_CHANGED');
    const release = await model.open(id);
    need(binding.manifestSha256 === release.manifestSha256 && binding.planId === release.planId &&
      binding.sourceSha256 === digest(await readPrivate(join(release.directory,'source.json'))),
      'MYSQL_PRODUCT_PUBLICATION_SOURCE_CHANGED');
    return { path,binding,release };
  }
  async function publicationCreate(input) {
    only(input,['requestId','releaseId','manifestSha256']);
    nativeId(input.requestId); releaseId(input.releaseId); need(SHA.test(input.manifestSha256),'MYSQL_PRODUCT_RELEASE_REVIEW_REQUIRED');
    return retained(input.requestId,'publication_create',input,async () => {
      if (await exists(publicationPaths(input.releaseId).binding))
        return { ...await publicationBinding(input.releaseId,input.manifestSha256),created:false };
      const release = await model.open(input.releaseId);
      need(release.manifestSha256 === input.manifestSha256,'MYSQL_PRODUCT_RELEASE_CHANGED');
      const final = publicationPaths(input.releaseId), stage = join(p.publicationDirectory,'.prepare-'+input.requestId);
      const binding = {schema:'stellar-forge.mysql-product-publication.v1',productId:profile.productId,
        releaseId:release.releaseId,manifestSha256:release.manifestSha256,planId:release.planId,
        sourceSha256:digest(await readPrivate(join(release.directory,'source.json'))),requestId:input.requestId,
        createdAt:action(input.requestId).createdAt};
      await privateDirectory(stage,true);
      await once(join(stage,'binding.json'),binding);
      const ledger=join(stage,'ledger');
      if(!await exists(ledger)){
        const pending=join(stage,'.ledger-'+randomUUID());let initial,published=false;
        try{
          initial=await openMysqlPublisher({directory:pending,create:true,
            sourceFile:join(release.directory,'source.json'),targetDirectory:join(stage,'dataset'),
            relativePaths:true,environment});
          await initial.close();initial=null;lease.assertHeld();
          need(!await exists(ledger),'MYSQL_PRODUCT_PUBLICATION_DESTINATION_EXISTS');
          await rename(pending,ledger);published=true;await syncDirectory(stage);
        }finally{await initial?.close();if(!published)await rm(pending,{recursive:true,force:true});}
      }else{
        const initial=await openMysqlPublisher({directory:ledger,sourceFile:join(release.directory,'source.json'),
          targetDirectory:join(stage,'dataset'),relativePaths:true,environment});
        await initial.close();
      }
      await privateDirectory(join(stage,'configurations'),true); lease.assertHeld();
      need(!await exists(final.directory),'MYSQL_PRODUCT_PUBLICATION_DESTINATION_EXISTS',
        'Inspect the retained original publication before assigning this release again.');
      await rename(stage,final.directory); await syncDirectory(p.publicationDirectory);
      event('PUBLICATION_CREATED',binding);
      return { ...await publicationBinding(input.releaseId,input.manifestSha256),created:true };
    });
  }
  function publicationView(entry) {
    return {releaseId:entry.binding.releaseId,manifestSha256:entry.binding.manifestSha256,
      instanceId:entry.instanceId,browserUrl:entry.browser?.url??null,
      state:'OPEN',dataset:entry.seller ? {runId:entry.sellerRunId,configId:entry.configId,
        configSha256:entry.configSha256,url:entry.seller.url,mode:entry.seller.mode,
        current:entry.seller.versions.status().current,revision:entry.seller.versions.status().revision} : null,
      native:entry.publisher.status(),schedule:entry.schedule.status()};
  }
  async function attachPublisher(entry,withBrowser=false) {
    entry.publisher = await openMysqlPublisher({directory:entry.path.ledger,environment,
      ...(entry.seller ? {seller:entry.seller.url,resource:entry.resource} : {})});
    try {
      entry.schedule = await openPostgresSchedule({publisher:entry.publisher});
      if (withBrowser) entry.browser = await startPostgresPublisherServer({
        publisher:entry.publisher,schedule:entry.schedule,ownsPublisher:false,port:0});
      entry.schedule.start();
    } catch (error) {
      await closeListener(entry.browser).catch(()=>{}); await entry.schedule?.close().catch(()=>{});
      await entry.publisher.close(); throw error;
    }
  }
  async function detachPublisher(entry) {
    const outcomes = await Promise.allSettled([closeListener(entry.browser),entry.schedule?.close()]);
    entry.browser=null;
    try { await entry.publisher?.close(); } finally { entry.publisher=null;entry.schedule=null; }
    const failed=outcomes.find(item=>item.status==='rejected'); if(failed)throw failed.reason;
  }
  async function publicationOpen(input) {
    only(input,['releaseId','manifestSha256','browser']);
    releaseId(input.releaseId);need(SHA.test(input.manifestSha256),'MYSQL_PRODUCT_RELEASE_REVIEW_REQUIRED');
    const existing=publications.get(input.releaseId);
    if(existing){
      need(existing.binding.manifestSha256===input.manifestSha256,'MYSQL_PRODUCT_PUBLICATION_CHANGED');
      if(input.browser===true&&!existing.browser)existing.browser=await startPostgresPublisherServer({
        publisher:existing.publisher,schedule:existing.schedule,ownsPublisher:false,port:0});
      return publicationView(existing);
    }
    const selected=await publicationBinding(input.releaseId,input.manifestSha256);
    const entry={...selected,instanceId:randomUUID(),publisher:null,schedule:null,browser:null,seller:null};
    await attachPublisher(entry,input.browser===true);publications.set(input.releaseId,entry);
    event('PUBLICATION_OPENED',{releaseId:input.releaseId,instanceId:entry.instanceId});return publicationView(entry);
  }
  function entryFor(input) {
    const entry=publications.get(releaseId(input.releaseId));
    need(entry&&entry.publisher,'MYSQL_PRODUCT_PUBLICATION_NOT_OPEN','Open this release’s original publication workspace first.');
    if(input.instanceId!==undefined)need(input.instanceId===entry.instanceId,'MYSQL_PRODUCT_PUBLICATION_INSTANCE_CHANGED');
    return entry;
  }
  async function publicationClose(input) {
    only(input,['releaseId','instanceId']);const entry=entryFor(input);
    need(input.instanceId===entry.instanceId,'MYSQL_PRODUCT_PUBLICATION_INSTANCE_CHANGED');
    try { await detachPublisher(entry); } finally { await entry.seller?.close(); }
    publications.delete(input.releaseId);
    event('PUBLICATION_CLOSED',{releaseId:input.releaseId,instanceId:entry.instanceId});
    return {closed:true,releaseId:input.releaseId,instanceId:entry.instanceId};
  }
  async function publicationsList() {
    const rows=[];
    for(const item of (await readdir(p.publicationDirectory,{withFileTypes:true})).filter(x=>x.isDirectory()&&ID.test(x.name)).sort((a,b)=>a.name.localeCompare(b.name))){
      try {const {binding}=await publicationBinding(item.name);const active=publications.get(item.name);
        rows.push({...binding,state:active?'OPEN':'CLOSED',instanceId:active?.instanceId??null,browserUrl:active?.browser?.url??null,
          dataset:active?.seller?{runId:active.sellerRunId,url:active.seller.url,mode:active.seller.mode}:null});}
      catch(error){rows.push({releaseId:item.name,error:errorValue(error)});}
    }
    return {items:rows};
  }
  async function publisherCall(input) {
    only(input,['releaseId','instanceId','tool','arguments']);
    const entry=entryFor(input), args=input.arguments??{};
    need(typeof input.tool==='string'&&input.tool.startsWith('merchant_publisher_')&&object(args)&&!Object.hasOwn(args,'publisher'),
      'MYSQL_PRODUCT_PUBLISHER_ACTION_INVALID');
    const alias='mysql_'+digest(Buffer.from(entry.binding.releaseId)).slice(0,24);
    return publisherAdapter.callBorrowed({alias,publisher:entry.publisher,schedule:entry.schedule,instanceId:entry.instanceId},
      input.tool,{...args,publisher:alias});
  }
  async function configurationRead(id,configId) {
    nativeId(configId);const selected=await publicationBinding(id);
    const saved=await readJson(join(selected.path.configurations,configId+'.json'),262144);
    need(saved.schema==='stellar-forge.mysql-dataset-configuration.v1'&&saved.id===configId&&
      saved.productId===profile.productId&&saved.releaseId===id&&saved.manifestSha256===selected.binding.manifestSha256,
      'MYSQL_PRODUCT_DATASET_CONFIGURATION_INVALID');
    const configPath=join(selected.path.configurations,configId+'.seller.json'),raw=await readPrivate(configPath);
    need(digest(raw)===saved.configSha256,'MYSQL_PRODUCT_DATASET_CONFIGURATION_CHANGED');
    return {...saved,configPath,config:JSON.parse(raw)};
  }
  async function datasetConfigure(input) {
    only(input,['requestId','releaseId','manifestSha256','expectedSnapshot','expectedRevision','paymentIndex','path','reviewer','note']);
    const id=nativeId(input.requestId),selected=await publicationBinding(input.releaseId,input.manifestSha256);
    need(SHA.test(input.expectedSnapshot)&&Number.isSafeInteger(input.expectedRevision)&&input.expectedRevision>=0,
      'MYSQL_PRODUCT_DATASET_REVIEW_REQUIRED');
    const options=selected.release.choices.paymentOptions??[selected.release.choices.payment];
    need(Number.isInteger(input.paymentIndex)&&input.paymentIndex>=0&&input.paymentIndex<options.length,
      'MYSQL_PRODUCT_PAYMENT_SELECTION_REQUIRED');
    need(typeof input.path==='string'&&/^\/[A-Za-z0-9_/-]{1,180}$/.test(input.path)&&!input.path.includes('//'),
      'MYSQL_PRODUCT_DATASET_PATH_INVALID');
    text(input.reviewer,128,'the reviewer');text(input.note,2000,'the dataset service review');
    return retained(id,'dataset_configure',input,async()=>{
      if(await exists(join(selected.path.configurations,id+'.json')))return configurationRead(input.releaseId,id);
      need(!publications.get(input.releaseId)?.seller,'MYSQL_PRODUCT_DATASET_RUNNING','Stop the selected dataset seller before configuring its native route.');
      let versions;
      try{
        versions=await openDatasetVersions({directory:selected.path.dataset});
        const status=versions.status();
        need(status.current===input.expectedSnapshot&&status.revision===input.expectedRevision,'MYSQL_PRODUCT_DATASET_CHANGED');
        const payment=clone(options[input.paymentIndex]);
        const basePayment=Object.fromEntries(Object.entries(payment).filter(([key])=>key!=='extra'));
        const config=await buildDatasetSellerConfig(versions,{payment:basePayment,origin:selected.release.choices.publicOrigin,path:input.path});
        config.routes[0].definition.payment=payment;
        const {compileHttpSellerOffer,paymentRequiredResponse}=await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/seller.mjs');
        paymentRequiredResponse(compileHttpSellerOffer({...config.routes[0].definition,url:config.publicOrigin+input.path}));
        const parameters=config.routes[0].definition.queryParameters;
        need(parameters.length<32,'MYSQL_PRODUCT_SNAPSHOT_PARAMETER_LIMIT');
        parameters.push({...DATASET_SNAPSHOT_PARAMETER});
        const saved={schema:'stellar-forge.mysql-dataset-configuration.v1',id,productId:profile.productId,
          releaseId:input.releaseId,manifestSha256:selected.binding.manifestSha256,createdAt:action(id).createdAt,
          expectedSnapshot:status.current,expectedRevision:status.revision,paymentIndex:input.paymentIndex,
          payment,paymentSha256:identity(payment),resource:new URL(input.path,selected.release.choices.publicOrigin).href,
          reviewer:input.reviewer.trim(),note:input.note.trim(),configSha256:digest(bytes(config))};
        await once(join(selected.path.configurations,id+'.seller.json'),config);
        await once(join(selected.path.configurations,id+'.json'),saved);
        event('DATASET_CONFIGURATION_REVIEWED',saved);return configurationRead(input.releaseId,id);
      }finally{await versions?.close();}
    });
  }
  async function datasetStart(input) {
    only(input,['releaseId','instanceId','configId','configSha256','expectedSnapshot','expectedRevision','port']);
    const entry=entryFor(input),selected=await configurationRead(input.releaseId,input.configId);
    need(input.configSha256===selected.configSha256,'MYSQL_PRODUCT_DATASET_CONFIGURATION_CHANGED');
    const port=input.port??0;need(Number.isInteger(port)&&port>=0&&port<=65535,'MYSQL_PRODUCT_PORT_INVALID');
    if(entry.seller){need(entry.configId===input.configId&&entry.configSha256===input.configSha256,
      'MYSQL_PRODUCT_DATASET_ALREADY_RUNNING');return publicationView(entry);}
    need(!entry.publisher.status().active,'MYSQL_PRODUCT_PUBLICATION_BUSY','Finish or cancel the retained source operation first.');
    let versions;const hadBrowser=Boolean(entry.browser);
    await detachPublisher(entry);
    try{
      versions=await openDatasetVersions({directory:entry.path.dataset});
      const current=versions.status();
      need(current.current===input.expectedSnapshot&&current.revision===input.expectedRevision,'MYSQL_PRODUCT_DATASET_CHANGED');
      const config=await readSellerConfig(selected.configPath);
      entry.seller=await startVersionedDatasetSeller({versions,config,port,nativeFactory:factory,controlTransport:'loopback'});
      versions=null;entry.sellerRunId=randomUUID();entry.configId=input.configId;
      entry.configSha256=input.configSha256;entry.resource=selected.resource;
      await attachPublisher(entry,hadBrowser);
      event('DATASET_SELLER_STARTED',{releaseId:input.releaseId,runId:entry.sellerRunId,configId:input.configId,
        configSha256:input.configSha256,url:entry.seller.url,resource:entry.resource,mode:entry.seller.mode});
      return publicationView(entry);
    }catch(error){
      await versions?.close();await entry.seller?.close();entry.seller=null;
      if(!entry.publisher)await attachPublisher(entry,hadBrowser);
      throw error;
    }
  }
  async function datasetStop(input) {
    only(input,['releaseId','instanceId','runId']);const entry=entryFor(input);
    need(entry.seller&&entry.sellerRunId===input.runId,'MYSQL_PRODUCT_DATASET_RUN_CHANGED');
    const hadBrowser=Boolean(entry.browser);
    await detachPublisher(entry);await entry.seller.close();entry.seller=null;
    await attachPublisher(entry,hadBrowser);event('DATASET_SELLER_STOPPED',{releaseId:input.releaseId,runId:input.runId});
    return publicationView(entry);
  }
  async function datasetStatus(input) {
    only(input,['releaseId']);const selected=await publicationBinding(input.releaseId),active=publications.get(input.releaseId);
    let current=null;
    if(active?.seller)current=await datasetControl(selected.path.dataset,'schema');
    else if(await exists(selected.path.dataset)){
      const versions=await openDatasetVersions({directory:selected.path.dataset});
      try{current={versions:versions.status(),dataset:versions.describe()};}finally{await versions.close();}
    }
    const configurations=[];
    for(const name of (await readdir(selected.path.configurations)).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).sort())
      configurations.push(await configurationRead(input.releaseId,name.slice(0,-5)));
    return {releaseId:input.releaseId,current,configurations,dataset:active?.seller?publicationView(active).dataset:null};
  }
  async function quiesce() {
    const entries=[...publications.values()];
    const results=await Promise.allSettled(entries.map(async entry=>{
      try{await detachPublisher(entry);}finally{await entry.seller?.close();}
    }));
    publications.clear();
    try{await model?.close();}finally{model=null;}
    const failed=results.find(row=>row.status==='rejected');if(failed)throw failed.reason;
  }
  async function archive(input) {
    only(input,['requestId']);const id=nativeId(input.requestId);
    return retained(id,'archive',input,async()=>{
      phase='QUIESCING';let result,error;
      try{
        await quiesce();event('PRODUCT_QUIESCED_FOR_HANDOVER',{requestId:id});
        db.close();db=null;phase='EXPORTING';lease.assertHeld();
        result=await createMysqlArchive(p.directory,{transferId:id,lease});
      }catch(issue){error=issue;}
      finally{
        await openDatabase();await reopenModel();phase='OPEN';
      }
      if(error)throw error;
      event('PRODUCT_HANDOVER_CREATED',{requestId:id,sha256:result.sha256,bytes:result.bytes});
      return result;
    });
  }
  async function archiveGet(input) {
    only(input,['requestId']);const id=nativeId(input.requestId);
    const saved=action(id);
    need(saved?.action==='archive'&&['COMPLETED','RESTORED'].includes(saved.state),'MYSQL_PRODUCT_ARCHIVE_NOT_READY');
    if(saved.state==='RESTORED')return {state:'RESTORED',receipt:saved.result};
    const result=saved.result;
    const inspection=await inspectMysqlArchive(result.path);
    need(inspection.sha256===result.sha256,'MYSQL_PRODUCT_ARCHIVE_CHANGED');
    return result;
  }
  async function status() {
    return {schema:'stellar-forge.mysql-product-status.v1',productId:profile.productId,name:profile.name,
      workspace:profile.workspace,instanceId,state:phase,browserUrl:browser?.url??null,
      source:await model.info(),drafts:draftsList({limit:10}),publications:await publicationsList(),
      actions:db.prepare('SELECT * FROM product_actions ORDER BY created DESC,id LIMIT 20').all().map(viewAction),
      history:db.prepare('SELECT * FROM product_events ORDER BY id DESC LIMIT 20').all().map(row=>({...row,data:parse(row.data)}))};
  }
  async function retainClient(input){
    const native=await model.exportClient(input),directory=join(p.directory,'customer-clients');
    await privateDirectory(directory,true);
    const path=join(directory,native.sha256+'.tar.gz');
    const saved={filename:native.filename,bytes:native.bytes.length,sha256:native.sha256,
      releaseId:input.releaseId,manifestSha256:input.manifestSha256};
    await once(path,native.bytes);await once(join(directory,native.sha256+'.json'),saved);
    return{native,saved:{...saved,path}};
  }
  async function dispatch(name,input={}) {
    switch(name){
      case 'status':return status();
      case 'drafts':return draftsList(input);
      case 'draft_get':only(input,['draftId','revision']);return draftGet(input.draftId,input.revision);
      case 'draft_save':return draftSave(input);
      case 'draft_versions':{only(input,['draftId','offset','limit']);nativeId(input.draftId);
        const paging=page({offset:input.offset,limit:input.limit});
        return {...paging,items:db.prepare('SELECT id,revision,created,note,digest FROM draft_versions WHERE id=? ORDER BY revision DESC LIMIT ? OFFSET ?')
          .all(input.draftId,paging.limit,paging.offset)};}
      case 'action':only(input,['requestId']);return action(input.requestId);
      case 'actions':{const paging=page(input);return {...paging,items:db.prepare('SELECT * FROM product_actions ORDER BY created DESC,id LIMIT ? OFFSET ?')
        .all(paging.limit,paging.offset).map(viewAction)};}
      case 'publications':return publicationsList();
      case 'publication_create':return publicationCreate(input);
      case 'publication_open':return publicationOpen(input);
      case 'publication_close':return publicationClose(input);
      case 'publisher':return publisherCall(input);
      case 'dataset_configure':return datasetConfigure(input);
      case 'dataset_start':return datasetStart(input);
      case 'dataset_stop':return datasetStop(input);
      case 'dataset_status':return datasetStatus(input);
      case 'archive':return archive(input);
      case 'archive_get':return archiveGet(input);
      case 'source_catalog':only(input,['table']);return model.catalog(input.table);
      case 'source_review':return model.review(input);
      case 'source_preview':return model.preview(input);
      case 'source_prepare':return model.prepare(input);
      case 'releases':only(input,['page']);return model.list(input.page??0);
      case 'release':only(input,['releaseId']);return model.open(input.releaseId);
      case 'seller_start':return model.run(input);
      case 'seller_stop':return model.stop(input);
      case 'seller_status':return model.runtime();
      case 'client_export':return(await retainClient(input)).saved;
      case 'client_get':{only(input,['sha256']);need(SHA.test(input.sha256),'MYSQL_PRODUCT_CLIENT_HASH_REQUIRED');
        const saved=await readJson(join(p.directory,'customer-clients',input.sha256+'.json'),65536);
        need(saved.sha256===input.sha256,'MYSQL_PRODUCT_CLIENT_CHANGED');
        const path=join(p.directory,'customer-clients',input.sha256+'.tar.gz');
        need(digest(await readPrivate(path,33554432))===saved.sha256,'MYSQL_PRODUCT_CLIENT_CHANGED');return {...saved,path};}
      default:throw fault('MYSQL_PRODUCT_ACTION_NOT_FOUND','Unknown MySQL product action.',404);
    }
  }
  async function extension() {
    const files=await Promise.all([['/mysql-product.mjs','product.mjs','text/javascript; charset=utf-8'],
      ['/mysql-product.css','product.css','text/css; charset=utf-8']].map(async([path,name,type])=>({
        path,type,bytes:await readFile(new URL('./public/'+name,import.meta.url))})));
    return {files,head:'<link rel="stylesheet" href="/mysql-product.css"><script type="module" src="/mysql-product.mjs"></script>',
      async handle({req,res,url,json,body}){
        if(req.method==='GET'&&url.pathname==='/api/product'&&!url.search){
          json(res,200,await serial(status));return true;
        }
        if(req.method==='POST'&&url.pathname==='/api/product/action'&&!url.search){
          const input=await body(req);only(input,['action','input']);
          json(res,200,await serial(()=>dispatch(input.action,input.input)));return true;
        }
        if(req.method==='POST'&&url.pathname==='/api/product/download'&&!url.search){
          const input=await body(req),saved=await serial(()=>archiveGet(input));
          need(saved.path,'MYSQL_PRODUCT_ARCHIVE_NOT_LOCAL','This product was restored from that original delivery; create a new handover for its current state.');
          const token=randomBytes(32).toString('hex');
          for(const[key,value]of tickets)if(value.expires<Date.now())tickets.delete(key);
          while(tickets.size>=8)tickets.delete(tickets.keys().next().value);
          tickets.set(token,{...saved,expires:Date.now()+60000});
          json(res,200,{download:'/product-download/'+token,filename:basename(saved.path),bytes:saved.bytes,sha256:saved.sha256});return true;
        }
        return false;
      },
      async download({req,res,url,json}){
        if(!/^\/product-download\/[a-f0-9]{64}$/.test(url.pathname)||url.search)return false;
        const token=url.pathname.slice('/product-download/'.length),selected=tickets.get(token);
        tickets.delete(token);
        if(!selected||selected.expires<Date.now()){json(res,410,{error:'MYSQL_PRODUCT_DOWNLOAD_EXPIRED'});return true;}
        const handle=await open(selected.path,constants.O_RDONLY|constants.O_NOFOLLOW);
        try{
          const stat=await handle.stat();need(stat.isFile()&&stat.nlink===1&&!(stat.mode&0o077)&&stat.size===selected.bytes,'MYSQL_PRODUCT_ARCHIVE_CHANGED');
          const hash=createHash('sha256');let counted=0;
          for await(const part of handle.createReadStream({autoClose:false})){counted+=part.length;hash.update(part);}
          const after=await handle.stat();
          need(counted===selected.bytes&&hash.digest('hex')===selected.sha256&&stat.size===after.size&&
            stat.mtimeMs===after.mtimeMs&&stat.ctimeMs===after.ctimeMs,'MYSQL_PRODUCT_ARCHIVE_CHANGED');
          const stream=handle.createReadStream({autoClose:false,start:0});streams.add(stream);
          res.writeHead(200,{'content-type':'application/gzip','content-length':selected.bytes,
            'content-disposition':'attachment; filename="'+basename(selected.path)+'"','cache-control':'no-store',
            'x-content-type-options':'nosniff','x-content-sha256':selected.sha256});
          try{await pipeline(stream,res);}finally{streams.delete(stream);}
        }finally{await handle.close();}
        return true;
      },
      async close(){
        tickets.clear();
        if(streams.size)await Promise.race([Promise.allSettled([...streams].map(stream=>new Promise(done=>{if(stream.readableEnded||stream.destroyed)return done();stream.once('end',done);stream.once('close',done);stream.once('error',done);}))),
          new Promise(done=>setTimeout(done,15000))]);
        for(const stream of streams)stream.destroy();streams.clear();
      }};
  }
  try{
    factory=await createMysqlNativeFactory(profile.runtime);
    await openDatabase();await reopenModel();
    const proxy={};
    for(const method of ['info','catalog','review','preview','prepare','list','open','run','stop','runtime','exportClient'])
      proxy[method]=(...args)=>serial(async()=>method==='exportClient'?(await retainClient(args[0])).native:model[method](...args));
    browser=await startMysqlMerchantWorkspace({model:proxy,ownsModel:false,port:browserPort,extension:await extension()});
    phase='OPEN';event('PRODUCT_OPENED',{instanceId,browserUrl:browser.url,productId:profile.productId});
    return {directory:p.directory,profile,instanceId,browserUrl:browser.url,
      call:(name,input)=>serial(()=>dispatch(name,input)),
      async close(){
        if(closing)return closing;
        phase='CLOSING';
        closing=(async()=>{
          await queue;
          let issue;
          try{await closeListener(browser);}catch(error){issue=error;}
          try{await quiesce();}catch(error){issue??=error;}
          try{await publisherAdapter.close();}catch(error){issue??=error;}
          if(db){event('PRODUCT_CLOSED',{instanceId,...(issue?{error:errorValue(issue)}:{})});db.close();db=null;}
          try{
            if(await exists(p.sessionFile)){
              const saved=await readJson(p.sessionFile,65536);
              if(saved.schema===SESSION_SCHEMA&&saved.productId===profile.productId&&saved.nativeInstanceId===instanceId)
                await atomicJson(p.directory,'connection.json',{...saved,state:saved.state==='FAILED'?'FAILED':'CLOSED',
                  stoppedAt:stamp(),...(issue?{closeError:errorValue(issue)}:{})});
            }
          }catch(error){issue??=error;}
          phase='CLOSED';await lease.close();if(issue)throw issue;
        })();
        return closing;
      }};
  }catch(error){
    try{await closeListener(browser);}catch{}
    try{await quiesce();}catch{}
    try{db?.close();}finally{await lease.close();}
    throw error;
  }
}
