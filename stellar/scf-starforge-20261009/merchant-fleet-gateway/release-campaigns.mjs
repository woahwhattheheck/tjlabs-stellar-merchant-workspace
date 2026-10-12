// MIT. Saved ordered release waves over the original fleet manager and native journal.
import { constants, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';

export const FLEET_CAMPAIGN_SCHEMA = 'stellar-forge.fleet-campaign.v1';
export const FLEET_CAMPAIGN_EXPORT_SCHEMA = 'stellar-forge.fleet-campaign-export.v1';
const CONTROL = 'stellar-forge.fleet-campaign-control.v1';
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const REQUEST = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PLANS = 128;
const MAX_REQUESTS = 256;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const stable = value => JSON.stringify(canonical(value));
const hash = value => createHash('sha256').update(stable(value)).digest('hex');
const copy = value => structuredClone(value);
const stamp = () => new Date().toISOString();
const fail = (code, status = 409) => Object.assign(new Error(code), { code, status });
const need = (value, code, status) => { if (!value) throw fail(code, status); };
function fields(value, names) {
  need(object(value) && Object.keys(value).every(key => names.includes(key)), 'FLEET_CAMPAIGN_INPUT_INVALID', 400);
}
function text(value, maximum, code) {
  need(typeof value === 'string' && value.trim() && value.trim().length <= maximum &&
    !/[\u0000-\u001f]/.test(value), code, 400);
  return value.trim();
}
function id(value) { need(typeof value === 'string' && ID.test(value), 'FLEET_CAMPAIGN_ID_INVALID', 400); return value; }
function requestId(value) {
  need(typeof value === 'string' && REQUEST.test(value), 'FLEET_CAMPAIGN_REQUEST_ID_INVALID', 400); return value;
}
function revision(value) {
  need(Number.isSafeInteger(value) && value > 0, 'FLEET_CAMPAIGN_REVISION_REQUIRED', 400); return value;
}
const mappingKey = mapping => stable([...mapping].sort((a, b) => a.tenant.localeCompare(b.tenant)));
const sameMapping = (a, b) => Array.isArray(a) && Array.isArray(b) && mappingKey(a) === mappingKey(b);
const nativeIdentity = row => ({ revision: row.revision, digest: row.digest, snapshotId: row.snapshotId });
const sameNative = (a, b) => a?.revision === b?.revision && a?.digest === b?.digest && a?.snapshotId === b?.snapshotId;
const nativeSelection = state => ({ ...nativeIdentity(state.native), mapping: copy(state.mapping) });
const selectedTargets = wave => wave.targets.map(({ tenant, slot, releaseId }) => ({ tenant, slot, releaseId }));

function privateDirectory(path) {
  try { mkdirSync(path, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const info = lstatSync(path);
  need(info.isDirectory() && !info.isSymbolicLink() && !(info.mode & 0o077) &&
    (process.getuid === undefined || info.uid === process.getuid()), 'FLEET_CAMPAIGN_PRIVATE_DIRECTORY_REQUIRED');
}
function read(path, optional = false) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const first = fstatSync(fd, { bigint: true });
    need(first.isFile() && first.nlink === 1n && !(first.mode & 0o077n) && first.size <= BigInt(MAX_BYTES),
      'FLEET_CAMPAIGN_FILE_INVALID');
    const bytes = readFileSync(fd), last = fstatSync(fd, { bigint: true });
    need(bytes.length <= MAX_BYTES && BigInt(bytes.length) === last.size &&
      ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => first[key] === last[key]), 'FLEET_CAMPAIGN_FILE_CHANGED');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
  finally { if (fd !== undefined) closeSync(fd); }
}
function write(path, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  need(bytes.length <= MAX_BYTES, 'FLEET_CAMPAIGN_FILE_TOO_LARGE', 413);
  const temporary = path + '.pending-' + randomUUID();
  let fd;
  try {
    fd = openSync(temporary, 'wx', 0o600); writeFileSync(fd, bytes); fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temporary, path);
    const parent = openSync(join(path, '..'), constants.O_RDONLY | constants.O_DIRECTORY);
    try { fsyncSync(parent); } finally { closeSync(parent); }
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

/**
 * The original release operator supplies its already-serialized native actions.
 * This desk owns retained decisions only; the original manager owns all children,
 * routing, snapshots, source verification, and its single workspace lease.
 */
export function createFleetCampaignDesk({ directory, planDigest, assertOpen, snapshot, describe,
  actions, fleetStatus } = {}) {
  const root = join(directory, 'campaigns'), reviews = new Map();
  let stopping = false;
  const active = () => { assertOpen(); need(!stopping, 'FLEET_CAMPAIGN_CLOSING', 503); };
  const path = value => join(root, id(value) + '.json');
  const controlPath = value => join(root, id(value) + '.control.json');
  const ensureRoot = () => { assertOpen(); privateDirectory(root); };
  function readPlan(value, optional = false) {
    ensureRoot(); const plan = read(path(value), true);
    if (!plan) return null;
    need(plan.schema === FLEET_CAMPAIGN_SCHEMA && plan.id === value && plan.planDigest === planDigest &&
      Number.isSafeInteger(plan.revision) && plan.revision > 0 && Array.isArray(plan.waves) &&
      Array.isArray(plan.requests) && Array.isArray(plan.history) && plan.waves.length <= 32 &&
      plan.requests.length <= MAX_REQUESTS, 'FLEET_CAMPAIGN_STATE_CHANGED');
    return plan;
  }
  function control(value) {
    ensureRoot();
    const saved = read(controlPath(value), true) ?? { schema: CONTROL, id: value, planDigest,
      revision: 1, paused: false, reason: '', requests: [], updatedAt: null };
    need(saved.schema === CONTROL && saved.id === value && saved.planDigest === planDigest &&
      typeof saved.paused === 'boolean' && Number.isSafeInteger(saved.revision) && saved.revision > 0 &&
      Array.isArray(saved.requests), 'FLEET_CAMPAIGN_CONTROL_CHANGED');
    return saved;
  }
  function save(plan, kind, details = {}, complete) {
    assertOpen();
    plan.revision++; plan.updatedAt = stamp();
    if (kind) plan.history.push({ sequence: plan.history.length + 1, at: plan.updatedAt, kind, ...copy(details) });
    need(plan.history.length <= 2048, 'FLEET_CAMPAIGN_HISTORY_LIMIT');
    if (complete) complete();
    write(path(plan.id), plan);
  }
  function summary(plan) {
    const held = control(plan.id);
    return { id: plan.id, title: plan.title, revision: plan.revision, planDigest,
      state: plan.state, nextWave: plan.nextWave, totalWaves: plan.waves.length,
      native: nativeIdentity(plan.expected), paused: held.paused, controlRevision: held.revision,
      pauseReason: held.reason, pendingRequest: plan.pending?.requestId ?? null,
      updatedAt: plan.updatedAt };
  }
  function checkSelection(plan, observed, expected = plan.expected) {
    need(sameNative(observed.native, expected) && sameMapping(observed.mapping, expected.mapping),
      'FLEET_CAMPAIGN_FLEET_CHANGED');
  }
  function replay(plan, input, kind) {
    requestId(input.requestId);
    const prior = plan.requests.find(row => row.id === input.requestId);
    if (prior) need(prior.kind === kind && prior.requestSha256 === hash(input), 'FLEET_CAMPAIGN_REQUEST_ID_REUSED');
    return prior;
  }
  function request(plan, input, kind) {
    need(plan.requests.length < MAX_REQUESTS, 'FLEET_CAMPAIGN_REQUEST_LIMIT');
    const value = { id: requestId(input.requestId), kind, requestSha256: hash(input),
      request: copy(input), phase: 'PENDING', createdAt: stamp() };
    plan.requests.push(value); return value;
  }
  function complete(plan, row, kind, history = {}, details = {}) {
    save(plan, kind, history, () => {
      row.phase = 'COMPLETE'; row.finishedAt = stamp();
      row.result = { ...summary(plan), requestId: row.id, ...copy(details) };
    });
    return copy(row.result);
  }
  function reviewToken(value) {
    const now = Date.now();
    for (const [key, item] of reviews) if (item.expiresAt <= now) reviews.delete(key);
    need(reviews.size < 32, 'FLEET_CAMPAIGN_REVIEW_LIMIT');
    const reviewId = randomUUID();
    const reviewed = { ...copy(value), reviewId, expiresAt: now + 10 * 60 * 1000 };
    reviews.set(reviewId, reviewed);
    return { ...copy(reviewed), expiresAt: new Date(reviewed.expiresAt).toISOString() };
  }
  function takeReview(value, plan, kind) {
    const reviewed = reviews.get(value); reviews.delete(value);
    need(reviewed && reviewed.expiresAt > Date.now() && reviewed.kind === kind &&
      reviewed.id === plan.id && reviewed.revision === plan.revision, 'FLEET_CAMPAIGN_REVIEW_CHANGED');
    return reviewed;
  }
  async function pinWaves(input, initial) {
    need(Array.isArray(input) && input.length > 0 && input.length <= 32, 'FLEET_CAMPAIGN_WAVES_INVALID', 400);
    const names = new Set(); let mapping = copy(initial), total = 0;
    const waves = [];
    for (const [index, row] of input.entries()) {
      fields(row, ['id', 'label', 'targets']); id(row.id);
      need(!names.has(row.id), 'FLEET_CAMPAIGN_WAVE_ID_REUSED', 400); names.add(row.id);
      need(Array.isArray(row.targets) && row.targets.length > 0 && row.targets.length <= mapping.length,
        'FLEET_CAMPAIGN_TARGETS_INVALID', 400);
      total += row.targets.length; need(total <= 256, 'FLEET_CAMPAIGN_TARGET_LIMIT', 400);
      const selected = new Set(), targets = [];
      for (const target of row.targets) {
        fields(target, ['tenant', 'slot', 'releaseId']);
        need(typeof target.tenant === 'string' && !selected.has(target.tenant), 'FLEET_CAMPAIGN_TENANT_REPEATED', 400);
        selected.add(target.tenant);
        const before = mapping.find(item => item.tenant === target.tenant);
        need(before && before.slot !== target.slot, 'FLEET_CAMPAIGN_OTHER_SLOT_REQUIRED', 400);
        targets.push(await describe(target.tenant, target.slot, target.releaseId));
      }
      const after = mapping.map(before => targets.find(target => target.tenant === before.tenant) ?? before);
      waves.push({ id: row.id, label: text(row.label ?? 'Wave ' + (index + 1), 120, 'FLEET_CAMPAIGN_LABEL_INVALID'),
        targets, before: copy(mapping), after: copy(after) });
      mapping = after;
    }
    return waves;
  }
  function completedNative(pending, observed) {
    if (!pending.digest) return null;
    const candidates = [nativeSelection(observed), ...observed.revisions];
    return candidates.find(row => row.revision === pending.before.revision + 1 && row.digest === pending.digest &&
      sameMapping(row.mapping, pending.after) && (sameNative(row, observed.native) ||
        observed.native.history.some(item => sameNative(item, row)))) ?? null;
  }
  function finish(plan, row, committed) {
    const pending = plan.pending;
    need(committed, 'FLEET_CAMPAIGN_COMMIT_UNRESOLVED');
    plan.expected = { ...nativeIdentity(committed), mapping: copy(committed.mapping) };
    if (pending.kind === 'wave') {
      plan.nextWave = pending.waveIndex + 1;
      plan.state = plan.nextWave === plan.waves.length ? 'COMPLETE' : 'READY';
    } else plan.state = 'ROLLED_BACK';
    const detail = { requestId: row.id, waveIndex: pending.waveIndex ?? null, native: nativeIdentity(committed),
      before: copy(pending.before), after: copy(pending.after), approval: copy(pending.approval),
      ...(pending.restoreMode?{restoreMode:pending.restoreMode,targetRevision:pending.targetRevision}:{}) };
    plan.pending = null;
    return complete(plan, row, pending.kind === 'wave' ? 'WAVE_ACTIVATED' : 'ROLLED_BACK', detail,
      { native: nativeIdentity(committed) });
  }
  async function execute(plan, row) {
    active();
    const pending = plan.pending;
    need(pending && pending.requestId === row.id, 'FLEET_CAMPAIGN_PENDING_REQUEST_REQUIRED');
    let observed = await snapshot();
    const committed = completedNative(pending, observed);
    if (committed) return finish(plan, row, committed);
    checkSelection(plan, observed, pending.before);
    if (control(plan.id).paused) return { ...summary(plan), requestId: row.id, awaiting: 'CONTINUE_APPROVED_REQUEST' };
    try {
      if (pending.kind === 'wave' || pending.restoreMode === 'RETAINED_RELEASES') {
        let prepared = await actions.recoverPrepared({ baseRevision: pending.before.revision,
          baseDigest: pending.before.digest, mapping: pending.after });
        if (!prepared) {
          observed = await snapshot(); checkSelection(plan, observed, pending.before);
          need((!observed.native.candidate || Date.parse(observed.native.candidate.expiresAt) <= Date.now()), 'FLEET_CAMPAIGN_OTHER_CANDIDATE_PRESENT');
          const reviewed = pending.kind === 'wave'
            ? await actions.reviewWave({ targets: selectedTargets(plan.waves[pending.waveIndex]) })
            : await actions.reviewMapping({ mapping: pending.after });
          need(reviewed.baseRevision === pending.before.revision && reviewed.baseDigest === pending.before.digest &&
            sameMapping(reviewed.before, pending.before.mapping) && sameMapping(reviewed.after, pending.after),
            'FLEET_CAMPAIGN_APPROVED_SOURCE_CHANGED');
          active(); pending.phase = 'PREPARING'; save(plan, 'WAVE_PREPARING', { requestId: row.id, waveIndex: pending.waveIndex });
          prepared = await actions.prepare({ reviewId: reviewed.reviewId });
        }
        pending.phase = 'PREPARED'; pending.candidateId = prepared.candidateId; pending.digest = prepared.native.candidate.digest;
        pending.expiresAt = prepared.expiresAt;
        save(plan, 'WAVE_PREPARED', { requestId: row.id, waveIndex: pending.waveIndex,
          candidateId: pending.candidateId, digest: pending.digest, expiresAt: pending.expiresAt });
        if (control(plan.id).paused) return { ...summary(plan), requestId: row.id, awaiting: 'CONTINUE_APPROVED_REQUEST' };
        active(); pending.phase = 'ACTIVATING'; save(plan, 'WAVE_ACTIVATING', { requestId: row.id, waveIndex: pending.waveIndex });
        await actions.activate({ candidateId: pending.candidateId, expectedRevision: pending.before.revision });
      } else {
        need((!observed.native.candidate || Date.parse(observed.native.candidate.expiresAt) <= Date.now()), 'FLEET_CAMPAIGN_OTHER_CANDIDATE_PRESENT');
        const reviewed = await actions.reviewRollback({ targetRevision: pending.targetRevision });
        need(reviewed.baseRevision === pending.before.revision, 'FLEET_CAMPAIGN_FLEET_CHANGED');
        active(); pending.phase = 'ROLLING_BACK'; save(plan, 'ROLLBACK_STARTED', { requestId: row.id, targetRevision: pending.targetRevision });
        await actions.rollback({ reviewId: reviewed.reviewId });
      }
      return finish(plan, row, completedNative(pending, await snapshot()));
    } catch (error) {
      pending.lastError = { code: error.code ?? error.message, at: stamp() };
      save(plan, 'OPERATION_REQUIRES_CONTINUATION', { requestId: row.id, phase: pending.phase,
        code: String(error.code ?? error.message).slice(0,160) });
      throw error;
    }
  }
  return {
    cancel() { stopping = true; },
    list() {
      ensureRoot();
      const names = readdirSync(root).filter(name => /^[a-z][a-z0-9-]{0,63}\.json$/.test(name));
      need(names.length <= MAX_PLANS, 'FLEET_CAMPAIGN_PLAN_LIMIT');
      return { schema: 'stellar-forge.fleet-campaign-list.v1', planDigest,
        campaigns: names.sort().map(name => summary(readPlan(name.slice(0,-5)))) };
    },
    async inspect({ id: value }) {
      const plan = readPlan(value); need(plan, 'FLEET_CAMPAIGN_NOT_FOUND', 404);
      const observed = await snapshot(), status = await fleetStatus();
      const committed = plan.pending ? completedNative(plan.pending, observed) : null;
      const matching = sameNative(observed.native, plan.expected) && sameMapping(observed.mapping, plan.expected.mapping);
      const before = new Map();
      for (const row of plan.history.filter(row => ['WAVE_ACTIVATED','ROLLED_BACK'].includes(row.kind)))
        for (const item of row.before.mapping) before.set(item.tenant+'/'+item.slot+'/'+item.releaseDigest, item);
      const retiring = [...before.values()].map(item => {
        const slot = status.tenants.find(row => row.id === item.tenant)?.slots.find(row => row.name === item.slot);
        return { ...item, instanceId: slot?.runningDigest === item.releaseDigest ? slot.instanceId : null,
          owned: Boolean(slot?.owned && slot.runningDigest === item.releaseDigest), serving: slot?.serving ?? false,
          candidate: slot?.candidate ?? false, drainingRequests: slot?.drainingRequests ?? 0,
          canRetire: Boolean(slot?.canRetire && slot.runningDigest === item.releaseDigest) };
      });
      const earlier = [plan.baseline, ...plan.history.filter(row=>row.kind==='WAVE_ACTIVATED')
        .map(row=>({...row.native,mapping:row.after}))];
      const rollbackTargets = earlier.filter((row,index,all)=>row.revision!==observed.native.revision &&
        all.findIndex(item=>item.revision===row.revision)===index).map(target=>{
        const blockers = target.mapping.flatMap(item=>{
          const slot=status.tenants.find(row=>row.id===item.tenant)?.slots.find(row=>row.name===item.slot);
          if(!slot)return [{tenant:item.tenant,slot:item.slot,code:'SLOT_UNAVAILABLE'}];
          return slot.owned && slot.runningDigest!==item.releaseDigest ?
            [{tenant:item.tenant,slot:item.slot,code:'SLOT_IN_USE',serving:slot.serving,candidate:slot.candidate,
              drainingRequests:slot.drainingRequests,canRetire:slot.canRetire,runningReleaseId:slot.runningReleaseId}] : [];
        });
        const retained=observed.native.history.some(row=>sameNative(row,target)) &&
          observed.revisions.some(row=>sameNative(row,target) && sameMapping(row.mapping,target.mapping));
        return {...nativeIdentity(target),mapping:copy(target.mapping),mode:retained?'NATIVE_HISTORY':'RETAINED_RELEASES',
          availability:blockers.length?'SLOT_IN_USE':'REVIEW_REQUIRED',blockers};
      });
      return { ...summary(plan), plan: copy(plan), control: copy(control(plan.id)), rollbackTargets,
        observed: nativeIdentity(observed.native), relationship: committed ? 'COMMITTED_REQUEST_AVAILABLE' : matching ? 'CURRENT' : 'FLEET_CHANGED',
        retirements: retiring, pendingRequest: plan.pending ? copy(plan.requests.find(row => row.id === plan.pending.requestId)?.request) : null };
    },
    async save(input) {
      active(); fields(input, ['id','title','waves','requestId','expectedRevision']);
      id(input.id); requestId(input.requestId);
      const existing = readPlan(input.id, true);
      if (existing) {
        const prior = replay(existing, input, 'save'); if (prior) return copy(prior.result);
        need(!existing.pending && existing.nextWave === 0 && existing.state === 'READY' &&
          existing.history.every(row => row.kind === 'SAVED'), 'FLEET_CAMPAIGN_ALREADY_STARTED');
        need(revision(input.expectedRevision) === existing.revision, 'FLEET_CAMPAIGN_REVISION_CHANGED');
      } else {
        need(input.expectedRevision === undefined || input.expectedRevision === null, 'FLEET_CAMPAIGN_REVISION_CHANGED');
        need(this.list().campaigns.length < MAX_PLANS, 'FLEET_CAMPAIGN_PLAN_LIMIT');
      }
      const observed = await snapshot(), baseline = nativeSelection(observed);
      const waves = await pinWaves(input.waves, baseline.mapping);
      const plan = existing ?? { schema: FLEET_CAMPAIGN_SCHEMA, id: input.id, planDigest,
        revision: 0, createdAt: stamp(), requests: [], history: [] };
      Object.assign(plan, { title: text(input.title,160,'FLEET_CAMPAIGN_TITLE_INVALID'), baseline, expected: copy(baseline),
        waves, nextWave: 0, state: 'READY', pending: null });
      const row = request(plan, input, 'save');
      return complete(plan, row, 'SAVED', { requestId: row.id,
        targets: waves.reduce((n,wave)=>n+wave.targets.length,0), waves: waves.length });
    },
    async review({ id: value, expectedRevision }) {
      active(); const plan = readPlan(value); need(plan, 'FLEET_CAMPAIGN_NOT_FOUND',404);
      need(revision(expectedRevision) === plan.revision, 'FLEET_CAMPAIGN_REVISION_CHANGED');
      need(!plan.pending && plan.state === 'READY' && plan.nextWave < plan.waves.length, 'FLEET_CAMPAIGN_REVIEW_UNAVAILABLE');
      need(!control(value).paused, 'FLEET_CAMPAIGN_PAUSED');
      const observed = await snapshot(); checkSelection(plan, observed);
      need((!observed.native.candidate || Date.parse(observed.native.candidate.expiresAt) <= Date.now()), 'FLEET_CAMPAIGN_OTHER_CANDIDATE_PRESENT');
      const wave = plan.waves[plan.nextWave];
      need(sameMapping(plan.expected.mapping,wave.before), 'FLEET_CAMPAIGN_ORDER_CHANGED');
      const native = await actions.reviewWave({ targets: selectedTargets(wave) });
      need(sameMapping(native.before,wave.before) && sameMapping(native.after,wave.after), 'FLEET_CAMPAIGN_SOURCE_CHANGED');
      return reviewToken({ id: value, kind: 'wave', revision: plan.revision, waveIndex: plan.nextWave,
        waveId: wave.id, label: wave.label, before: copy(plan.expected), after: copy(wave.after),
        comparisons: native.comparisons, atomicMerchants: wave.targets.length, nativeReviewId: native.reviewId });
    },
    async advance(input) {
      active(); fields(input,['id','expectedRevision','requestId','reviewId']);
      const plan = readPlan(input.id); need(plan,'FLEET_CAMPAIGN_NOT_FOUND',404);
      let row = replay(plan,input,'wave');
      if (row?.phase === 'COMPLETE') return copy(row.result);
      if (!row) {
        need(revision(input.expectedRevision) === plan.revision,'FLEET_CAMPAIGN_REVISION_CHANGED');
        need(!plan.pending && plan.state === 'READY','FLEET_CAMPAIGN_PENDING_REQUEST_REQUIRED');
        need(!control(plan.id).paused,'FLEET_CAMPAIGN_PAUSED');
        const reviewed = takeReview(input.reviewId,plan,'wave');
        checkSelection(plan,await snapshot(),reviewed.before);
        row = request(plan,input,'wave');
        plan.pending = { kind:'wave',requestId:row.id,waveIndex:reviewed.waveIndex,phase:'APPROVED',
          before:copy(reviewed.before),after:copy(reviewed.after),
          approval:{reviewId:reviewed.reviewId,reviewedAt:stamp(),comparisonSha256:hash(reviewed.comparisons),
            comparisons:copy(reviewed.comparisons)} };
        plan.state='PENDING'; save(plan,'WAVE_APPROVED',{requestId:row.id,waveIndex:reviewed.waveIndex});
      }
      return execute(plan,row);
    },
    pause(input) {
      active(); fields(input,['id','requestId','expectedControlRevision','paused','reason']);
      const plan=readPlan(input.id); need(plan,'FLEET_CAMPAIGN_NOT_FOUND',404);
      requestId(input.requestId); need(typeof input.paused==='boolean','FLEET_CAMPAIGN_PAUSE_INVALID',400);
      const held=control(input.id), prior=held.requests.find(row=>row.id===input.requestId);
      if(prior){need(prior.requestSha256===hash(input),'FLEET_CAMPAIGN_REQUEST_ID_REUSED');return copy(prior.result);}
      need(revision(input.expectedControlRevision)===held.revision,'FLEET_CAMPAIGN_CONTROL_REVISION_CHANGED');
      need(held.requests.length<MAX_REQUESTS,'FLEET_CAMPAIGN_REQUEST_LIMIT');
      held.paused=input.paused; held.reason=input.reason===undefined||input.reason===''
        ? '':text(input.reason,500,'FLEET_CAMPAIGN_PAUSE_REASON_INVALID');
      held.revision++; held.updatedAt=stamp();
      const result={id:input.id,paused:held.paused,controlRevision:held.revision,reason:held.reason,
        pendingRequest:plan.pending?.requestId??null};
      held.requests.push({id:input.requestId,requestSha256:hash(input),at:held.updatedAt,result});
      write(controlPath(input.id),held); return copy(result);
    },
    async reviewRollback({id:value,expectedRevision,targetRevision}) {
      active(); const plan=readPlan(value); need(plan,'FLEET_CAMPAIGN_NOT_FOUND',404);
      need(revision(expectedRevision)===plan.revision,'FLEET_CAMPAIGN_REVISION_CHANGED');
      need(!plan.pending&&plan.nextWave>0&&plan.state!=='ROLLED_BACK','FLEET_CAMPAIGN_ROLLBACK_UNAVAILABLE');
      const observed=await snapshot();
      need((!observed.native.candidate || Date.parse(observed.native.candidate.expiresAt) <= Date.now()),'FLEET_CAMPAIGN_OTHER_CANDIDATE_PRESENT');
      const selected=targetRevision??plan.baseline.revision;
      const allowed=[plan.baseline,...plan.history.filter(row=>row.kind==='WAVE_ACTIVATED').map(row=>({...row.native,mapping:row.after}))];
      const target=allowed.find(row=>row.revision===selected);
      need(target&&target.revision!==observed.native.revision,'FLEET_CAMPAIGN_ROLLBACK_TARGET_INVALID');
      const retained = observed.native.history.some(row => sameNative(row,target)) &&
        observed.revisions.some(row => sameNative(row,target) && sameMapping(row.mapping,target.mapping));
      const restoreMode = retained ? 'NATIVE_HISTORY' : 'RETAINED_RELEASES';
      const native = retained ? await actions.reviewRollback({targetRevision:target.revision})
        : await actions.reviewMapping({mapping:target.mapping});
      return reviewToken({id:value,kind:'rollback',revision:plan.revision,before:nativeSelection(observed),
        after:copy(target.mapping),targetRevision:target.revision,digest:target.digest,restoreMode,comparisons:native.comparisons});
    },
    async rollback(input) {
      active();fields(input,['id','expectedRevision','requestId','reviewId']);
      const plan=readPlan(input.id);need(plan,'FLEET_CAMPAIGN_NOT_FOUND',404);
      let row=replay(plan,input,'rollback');
      if(row?.phase==='COMPLETE')return copy(row.result);
      if(!row){
        need(revision(input.expectedRevision)===plan.revision,'FLEET_CAMPAIGN_REVISION_CHANGED');
        need(!plan.pending,'FLEET_CAMPAIGN_PENDING_REQUEST_REQUIRED');
        const reviewed=takeReview(input.reviewId,plan,'rollback');
        checkSelection(plan,await snapshot(),reviewed.before);row=request(plan,input,'rollback');
        plan.pending={kind:'rollback',requestId:row.id,phase:'APPROVED',before:copy(reviewed.before),
          after:copy(reviewed.after),targetRevision:reviewed.targetRevision,restoreMode:reviewed.restoreMode,
          ...(reviewed.restoreMode==='NATIVE_HISTORY'?{digest:reviewed.digest}:{}),
          approval:{reviewId:reviewed.reviewId,reviewedAt:stamp(),comparisonSha256:hash(reviewed.comparisons),
            comparisons:copy(reviewed.comparisons)}};
        plan.state='PENDING';save(plan,'ROLLBACK_APPROVED',{requestId:row.id,targetRevision:reviewed.targetRevision});
      }
      return execute(plan,row);
    },
    async retire(input) {
      active();fields(input,['id','expectedRevision','requestId','tenant','slot','instanceId','expectedNativeRevision']);
      const plan=readPlan(input.id);need(plan,'FLEET_CAMPAIGN_NOT_FOUND',404);
      let row=replay(plan,input,'retire');if(row?.phase==='COMPLETE')return copy(row.result);
      if(!row){
        need(revision(input.expectedRevision)===plan.revision,'FLEET_CAMPAIGN_REVISION_CHANGED');
        need(!plan.pending,'FLEET_CAMPAIGN_PENDING_REQUEST_REQUIRED');
        const view=await this.inspect({id:input.id}), target=view.retirements.find(item=>
          item.tenant===input.tenant&&item.slot===input.slot&&item.instanceId===input.instanceId&&item.canRetire);
        need(target,'FLEET_CAMPAIGN_DRAIN_REQUIRED');
        need(input.expectedNativeRevision===view.observed.revision,'FLEET_CAMPAIGN_FLEET_CHANGED');
        row=request(plan,input,'retire');row.target=copy(target);save(plan,'RETIREMENT_REQUESTED',{requestId:row.id,target:copy(target)});
      }
      const status=await fleetStatus(), slot=status.tenants.find(item=>item.id===input.tenant)?.slots.find(item=>item.name===input.slot);
      if(slot?.owned && slot.instanceId===input.instanceId){
        need(slot.runningDigest===row.target.releaseDigest,'FLEET_CAMPAIGN_SOURCE_CHANGED');
        await actions.retire({tenant:input.tenant,slot:input.slot,instanceId:input.instanceId,expectedRevision:input.expectedNativeRevision});
      }else need(slot && (!slot.owned || slot.instanceId!==input.instanceId),'FLEET_CAMPAIGN_RETIREMENT_UNRESOLVED');
      return complete(plan,row,'RETIRED',{requestId:row.id,tenant:input.tenant,slot:input.slot,instanceId:input.instanceId},
        {retiredInstanceId:input.instanceId});
    },
    export({id:value}) {
      const plan=readPlan(value);need(plan,'FLEET_CAMPAIGN_NOT_FOUND',404);
      const document={schema:FLEET_CAMPAIGN_EXPORT_SCHEMA,planDigest,plan:copy(plan),control:copy(control(value))};
      return {...document,sha256:hash(document)};
    },
  };
}
