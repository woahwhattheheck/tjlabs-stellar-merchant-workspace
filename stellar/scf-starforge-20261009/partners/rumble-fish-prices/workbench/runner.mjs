import { randomBytes } from 'node:crypto';
import { compilePlan, normalizeConfiguration, providerDocument, validateProviderResponse, WorkbenchError, clone } from './contract.mjs';
import { createPricesClient } from './client.mjs';
import { openStore } from './workspace.mjs';
import { planSummary, projectWorkspace, responseCsv, runSummary, summarizeResponse } from './analysis.mjs';

const timestamp = () => new Date().toISOString();
const attempts = run => run.tasks.reduce((sum, task) => sum + task.attempts.length, 0);
const issue = (code, message, extra = {}) => ({ code, message, ...extra });
const stable = value => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
const terminal = status => ['COMPLETE', 'COMPLETED_WITH_ERRORS'].includes(status);

export async function openWorkbench({ directory, create = false, configuration, apiKey = process.env.STELLAR_PRICES_API_KEY, fetchImpl = globalThis.fetch } = {}) {
  const store = await openStore({ directory, create, configuration });
  let initial, boundOrigin;
  try {
    initial = await store.read(); boundOrigin = initial.configuration.baseUrl;
    if (initial.contractSha256 !== (await providerDocument()).sha256) throw new WorkbenchError('CONTRACT_VERSION_CHANGED', 'Open this workspace with its delivered application version to retain the original provider contract.', 409);
    createPricesClient({ baseUrl: boundOrigin, apiKey, fetchImpl });
  } catch (error) { await store.close(); throw error; }
  let controlTail = Promise.resolve(), active = null, closed = false, closePromise, lastRuntimeIssue = null, lastStartedAt = 0;
  const control = action => { const result = controlTail.then(() => { if (closed) throw new WorkbenchError('WORKSPACE_CLOSED', 'This workbench is closed.', 409); return action(); }); controlTail = result.catch(() => {}); return result; };
  for (const run of await store.runs()) {
    for (const task of run.tasks) for (const attempt of task.attempts) lastStartedAt = Math.max(lastStartedAt, Date.parse(attempt.startedAt) || 0);
    if (['RUNNING', 'RETRY_WAIT'].includes(run.status)) {
      run.status = 'INTERRUPTED'; run.updatedAt = timestamp(); run.lastIssue = issue('PROCESS_INTERRUPTED', 'The previous owning process ended. Resume from the first unfinished request.');
      for (const task of run.tasks) if (task.state === 'RUNNING') { task.state = 'PENDING'; const attempt = task.attempts.at(-1); if (attempt && !attempt.receivedAt) attempt.classification = issue('OUTCOME_UNKNOWN', 'The process ended before a complete response was retained.'); }
      await store.putRun(run);
    }
  }

  async function waitUntil(epoch, owner) {
    while (!owner.pauseRequested && epoch > Date.now()) {
      await new Promise(resolve => { const timer = setTimeout(() => { owner.wake = null; resolve(); }, Math.min(epoch - Date.now(), 1000)); owner.wake = () => { clearTimeout(timer); owner.wake = null; resolve(); }; });
    }
  }
  async function saveRun(run) { run.updatedAt = timestamp(); await store.putRun(run); }

  async function pump(owner) {
    const { run, plan } = owner; const config = plan.configuration;
    const client = createPricesClient({ baseUrl: config.baseUrl, apiKey, requestTimeoutMs: config.requestTimeoutMs, fetchImpl });
    try {
      for (;;) {
        const task = run.tasks.find(row => row.state === 'PENDING' || row.state === 'RUNNING');
        if (!task) { run.status = run.tasks.some(row => row.state === 'ERROR') ? 'COMPLETED_WITH_ERRORS' : 'COMPLETE'; run.finishedAt = timestamp(); run.nextRequestAt = null; await saveRun(run); return; }
        if (owner.pauseRequested) { run.status = 'PAUSED'; run.lastIssue = issue('OPERATOR_PAUSED', 'Collection paused after retaining the in-flight response.'); await saveRun(run); return; }
        if (attempts(run) - owner.budgetStart >= config.maxRequestsPerRun) { run.status = 'PAUSED'; run.lastIssue = issue('REQUEST_BUDGET', 'This run segment reached its request budget. Resume to continue the retained plan.', { budget: config.maxRequestsPerRun }); await saveRun(run); return; }
        if (task.request.path.startsWith('/v1/') && !client.access.keyConfigured) { run.status = 'KEY_REQUIRED'; run.lastIssue = issue('KEY_REQUIRED', 'Start the owning process with STELLAR_PRICES_API_KEY, then resume this saved run.'); await saveRun(run); return; }
        const startAfter = Math.max(lastStartedAt + config.requestIntervalMs, Date.parse(run.nextRequestAt ?? '') || 0);
        if (startAfter > Date.now()) { run.nextRequestAt = new Date(startAfter).toISOString(); owner.nextRequestAt = run.nextRequestAt; await waitUntil(startAfter, owner); if (owner.pauseRequested) continue; }
        task.state = 'RUNNING'; run.status = 'RUNNING'; run.lastIssue = null;
        const startedAt = timestamp(); lastStartedAt = Date.parse(startedAt); run.nextRequestAt = new Date(lastStartedAt + config.requestIntervalMs).toISOString(); owner.nextRequestAt = run.nextRequestAt;
        const attempt = { id: `attempt-${task.attempts.length + 1}`, startedAt, receivedAt: null, status: null, response: null, classification: null };
        task.attempts.push(attempt); await saveRun(run);
        let classification;
        try {
          const response = await client.request(task);
          const reference = await store.keepResponse(response.raw);
          Object.assign(attempt, { receivedAt: response.receivedAt, status: response.status, headers: response.headers, durationMs: response.durationMs, response: reference });
          classification = response.classification;
          if (classification.kind === 'success') {
            const validation = response.parseError ? { valid: false, errors: [response.parseError] } : await validateProviderResponse(task.kind, response.data);
            attempt.validation = validation;
            if (!validation.valid) classification = { kind: 'contract', code: 'CONTRACT_MISMATCH', message: 'The response does not match the retained live provider contract.', errors: validation.errors, retryable: false };
            else {
              task.summary = summarizeResponse(task, response.data, { receivedAt: response.receivedAt, freshnessSeconds: config.freshnessSeconds });
              if (task.kind === 'catalog' && task.summary.hasMore) {
                const cursor = task.summary.cursor;
                if (typeof cursor !== 'string' || !cursor || run.tasks.some(previous => previous.request.query.cursor === cursor)) classification = { kind: 'contract', code: 'PAGINATION_STALLED', message: 'The provider signaled another page without a new usable cursor.', retryable: false };
                else if (task.page < plan.specification.maxPages) run.tasks.push({ ...clone(task), id: `task-${String(run.tasks.length + 1).padStart(6, '0')}`, page: task.page + 1, request: { ...clone(task.request), query: { ...clone(task.request.query), cursor } }, state: 'PENDING', attempts: [], summary: null });
              }
            }
          }
        } catch (error) {
          if (!(error instanceof WorkbenchError)) throw error;
          attempt.receivedAt = timestamp();
          classification = { kind: 'transport', code: error.code, message: error.message, retryable: ['PROVIDER_TIMEOUT', 'PROVIDER_NETWORK', 'RESPONSE_INCOMPLETE'].includes(error.code), retryAfterMs: 1000 };
        }
        attempt.classification = clone(classification);
        if (classification.kind === 'success') task.state = 'COMPLETE';
        else if (classification.kind === 'key') { task.state = 'PENDING'; run.status = 'KEY_REQUIRED'; run.lastIssue = issue(classification.code, classification.message); await saveRun(run); return; }
        else if (classification.kind === 'quota') { task.state = 'PENDING'; run.status = 'QUOTA_WAIT'; run.nextRequestAt = classification.retryAt; run.lastIssue = issue(classification.code, classification.message, { resetAt: classification.retryAt }); await saveRun(run); return; }
        else if (classification.retryable) {
          task.state = 'PENDING'; const failedThisSegment = task.attempts.length - (owner.retryBase.get(task.id) ?? 0);
          if (failedThisSegment > config.maxRetries) { run.status = 'PAUSED'; run.lastIssue = issue('RETRIES_EXHAUSTED', 'The native request still failed after its retry allowance. The exact request and attempts are saved for continuation.', { providerCode: classification.code }); await saveRun(run); return; }
          const delay = Math.max(config.requestIntervalMs, classification.retryAfterMs ?? 1000, Math.min(60000, 1000 * 2 ** (failedThisSegment - 1)));
          run.status = 'RETRY_WAIT'; run.nextRequestAt = new Date(Date.now() + delay).toISOString(); owner.nextRequestAt = run.nextRequestAt; run.lastIssue = issue(classification.code, classification.message);
        } else { task.state = 'ERROR'; run.lastIssue = issue(classification.code, classification.message); }
        await saveRun(run);
      }
    } catch (error) {
      run.status = 'PAUSED'; run.lastIssue = issue(error instanceof WorkbenchError ? error.code : 'WORKSPACE_WRITE_FAILED', error instanceof WorkbenchError ? error.message : 'The workspace could not retain this run. Check local storage before resuming.'); lastRuntimeIssue = run.lastIssue;
      await saveRun(run).catch(() => {});
    }
  }

  async function begin(run, plan) {
    if (active) throw new WorkbenchError('RUN_ACTIVE', 'Pause the active run before starting another collection.', 409);
    if (run.status === 'QUOTA_WAIT' && Date.parse(run.nextRequestAt ?? '') > Date.now()) return runSummary(run);
    const current = await store.read();
    if (plan.configuration.baseUrl !== current.configuration.baseUrl || (apiKey && plan.configuration.baseUrl !== boundOrigin)) throw new WorkbenchError('ORIGIN_REOPEN_REQUIRED', 'This plan belongs to another provider origin. Open a matching owning process before running it.', 409);
    run.status = 'RUNNING'; run.updatedAt = timestamp(); run.nextRequestAt = new Date(Math.max(Date.now(), lastStartedAt + plan.configuration.requestIntervalMs, Date.parse(run.nextRequestAt ?? '') || 0)).toISOString(); run.lastIssue = null; delete run.finishedAt;
    const owner = { run, plan, pauseRequested: false, wake: null, nextRequestAt: run.nextRequestAt, budgetStart: attempts(run), retryBase: new Map(run.tasks.map(task => [task.id, task.attempts.length])) };
    await store.putRun(run); active = owner;
    owner.promise = pump(owner).finally(() => { if (active === owner) active = null; });
    return runSummary(run);
  }
  async function pauseActive() {
    const owner = active; if (!owner) return null;
    owner.pauseRequested = true; owner.wake?.(); await owner.promise;
    return runSummary(await store.getRun(owner.run.id));
  }

  const api = {
    async snapshot() {
      const workspace = await store.read(); const [plans, runs] = await Promise.all([store.plans(), store.runs()]);
      return {
        schema: 'tjlabs.prices-workbench.snapshot.v1', workspace,
        access: { keyConfigured: Boolean(apiKey), baseUrl: workspace.configuration.baseUrl, boundOrigin },
        runtime: { state: closed ? 'CLOSED' : active ? (active.pauseRequested ? 'PAUSING' : active.run.status) : 'IDLE', activeRunId: active?.run.id ?? null, nextRequestAt: active?.nextRequestAt ?? null, lastIssue: lastRuntimeIssue },
        plans: plans.map(planSummary), runs: runs.map(runSummary), consumers: await store.consumers.list(), ...projectWorkspace(runs, { freshnessSeconds: workspace.configuration.freshnessSeconds }),
      };
    },
    save(input) { return control(async () => { const normalized = normalizeConfiguration(input.configuration); if (apiKey && normalized.baseUrl !== boundOrigin) throw new WorkbenchError('ORIGIN_REOPEN_REQUIRED', 'The process API key is bound to its original provider. Close and reopen with an explicitly configured origin to change it.', 409); return store.save({ ...input, configuration: normalized }); }); },
    getPlan({ planId }) { return store.getPlan(planId); },
    plan(specification) { return control(async () => {
      const current = await store.read(); const compiled = compilePlan(specification, current.configuration);
      if (compiled.kind === 'catalog' && specification.cursor) {
        const expected = Object.fromEntries(Object.entries(compiled.tasks[0].request.query).filter(([key]) => key !== 'cursor'));
        const runs = await store.runs(); const known = runs.flatMap(run => run.tasks).find(task => task.kind === 'catalog' && task.state === 'COMPLETE' && task.summary?.cursor === specification.cursor);
        if (!known) throw new WorkbenchError('CURSOR_UNKNOWN', 'Continue from a catalog cursor retained by this workspace.');
        if (stable(expected) !== stable(known.summary.filters)) throw new WorkbenchError('CURSOR_FILTER_CHANGED', 'A saved catalog cursor must retain its original filters, sort, order, and page size.');
      }
      return store.putPlan(compiled);
    }); },
    start({ planId }) { return control(async () => { if (active) throw new WorkbenchError('RUN_ACTIVE', 'Pause the active run before starting another collection.', 409); const plan = await store.getPlan(planId); const now = timestamp(); const run = { schema: 'tjlabs.prices-workbench.run.v1', id: `run-${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`, planId: plan.id, name: plan.name, kind: plan.kind, createdAt: now, updatedAt: now, status: 'RUNNING', tasks: plan.tasks.map(task => ({ ...clone(task), state: 'PENDING', attempts: [], summary: null })), lastIssue: null, nextRequestAt: null }; return begin(run, plan); }); },
    pause() { return control(pauseActive); },
    resume({ runId }) { return control(async () => { if (active) throw new WorkbenchError('RUN_ACTIVE', 'Pause the active run before resuming another run.', 409); const run = await store.getRun(runId); if (terminal(run.status)) return runSummary(run); const plan = await store.getPlan(run.planId); return begin(run, plan); }); },
    async result({ runId, taskId, format = 'json' }) {
      if (!['json', 'csv'].includes(format)) throw new WorkbenchError('FORMAT_INVALID', 'Choose json or csv.');
      const run = await store.getRun(runId); const task = run.tasks.find(row => row.id === taskId);
      if (!task) throw new WorkbenchError('TASK_MISSING', 'The selected request does not belong to this run.', 404);
      const attempt = [...task.attempts].reverse().find(row => row.response);
      if (!attempt) throw new WorkbenchError('RESPONSE_MISSING', 'This request has no complete retained response.', 404);
      const bytes = await store.response(attempt.response); const rawText = bytes.toString('utf8'); let data = null; try { data = JSON.parse(rawText); } catch {}
      const metadata = { runId, taskId, kind: task.kind, request: clone(task.request), status: attempt.status, receivedAt: attempt.receivedAt, sha256: attempt.response.sha256, headers: clone(attempt.headers), summary: clone(task.summary), attemptId: attempt.id };
      if (format === 'csv') { if (!attempt.validation?.valid) throw new WorkbenchError('CSV_UNAVAILABLE', 'CSV is available for a valid successful native response. Inspect the original JSON or body for this attempt.', 409); return { filename: `${runId}-${taskId}.csv`, contentType: 'text/csv; charset=utf-8', content: responseCsv(task, data), summary: metadata.summary }; }
      return { ...metadata, data, rawText };
    },
    consumers() { return store.consumers.list(); },
    consumer(input) { return store.consumers.inspect(input); },
    saveConsumer(input) { return control(() => store.consumers.save(input)); },
    consumerEdition(input) { return store.consumers.getEdition(input); },
    createConsumerEdition(input) { return control(() => store.consumers.createEdition(input)); },
    reviewConsumerEdition(input) { return control(() => store.consumers.review(input)); },
    consumerOutput(input) { return store.consumers.output(input); },
    exportState() { return control(async () => { await pauseActive(); return store.exportFiles(); }); },
    close() { closePromise ??= control(async () => { await pauseActive(); closed = true; await store.close(); }); return closePromise; },
  };
  return api;
}
