// SPDX-License-Identifier: MIT
// Own the original release console for this OpenAQ project's existing store.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { lstat } from 'node:fs/promises';
import { absolute, identity, object } from '../postgres/publisher/files.mjs';
import { need, uuid, HASH } from './contract.mjs';

const SCHEMA = 'stellar-forge.openaq-merchant-console.v1';
const RELEASE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
function fields(value, allowed) {
  need(object(value) && Object.keys(value).every(key => allowed.includes(key)),
    'OPENAQ_MERCHANT_INPUT_INVALID', 'Use the selected study release and current console identity.');
}
async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

/** Release, payment, account readiness and customer delivery remain original SF82.
 * Browser inputs cannot choose a different store, application module or host path.
 * Console URLs are live capabilities, returned only through the private caller;
 * they never enter an OpenAQ operation, source export or portable customer record.
 */
export function createOpenAQMerchant({
  directory, workspaceId, configurationSha256, readOperation, environment = process.env,
} = {}) {
  directory = absolute(directory); uuid(workspaceId);
  need(HASH.test(configurationSha256 ?? '') && typeof readOperation === 'function',
    'OPENAQ_MERCHANT_CONFIGURATION_REQUIRED');
  const store = join(directory, 'release-store'), env = { ...environment };
  let owned = null, retiring = false, closing = null, sequence = Promise.resolve();
  const ended = new Set();
  const check = () => need(!retiring, 'OPENAQ_MERCHANT_CLOSING',
    'The original project is closing its merchant console.', 409);
  function serial(fn) {
    check();
    const run = sequence.then(() => { check(); return fn(); });
    sequence = run.catch(() => {});
    return run;
  }
  const binding = () => ({
    schema: SCHEMA, workspaceId, configurationSha256, releaseDirectory: store,
    state: retiring ? 'CLOSING' : owned ? (owned.closing ? 'CLOSING' : 'OPEN') : 'CLOSED',
    consoleId: owned?.id ?? null, openedAt: owned?.openedAt ?? null,
    processOwner: 'original OpenAQ Applications or CLI host',
    merchantOwner: 'original SF82 release console',
  });
  async function selection(stageRequestId) {
    const staged = await readOperation(uuid(stageRequestId));
    need(staged.action === 'release.stage' && staged.state === 'COMPLETE' &&
      RELEASE.test(staged.result?.id ?? '') && HASH.test(staged.result?.digest ?? ''),
    'OPENAQ_STAGED_RELEASE_REQUIRED', 'Choose a completed original release.stage request.', 409);
    const prepared = await readOperation(uuid(staged.input.preparationId));
    need(prepared.action === 'release.prepare' && prepared.state === 'COMPLETE',
      'OPENAQ_RELEASE_PREPARATION_REQUIRED', 'Reopen the original reviewed release preparation.', 409);
    const { inspectRelease } = await import('../../sf82-seller-pilot/releases.mjs');
    const current = await inspectRelease(store, staged.result.id);
    need(current.digest === staged.result.digest && object(current.dataset) && object(staged.result.dataset) &&
      identity(current.dataset) === identity(staged.result.dataset),
    'OPENAQ_STAGED_RELEASE_CHANGED', 'The retained release differs from this study staging request.', 409);
    return {
      stageRequestId: staged.id, preparationRequestId: prepared.id,
      captureId: prepared.input.captureId, sourceReviewId: prepared.input.sourceReviewId,
      publicationRunId: prepared.input.runId, release: current,
    };
  }
  async function current(input = {}) {
    fields(input, ['stageRequestId']);
    if (!await exists(store)) {
      need(input.stageRequestId === undefined, 'OPENAQ_STAGED_RELEASE_REQUIRED',
        'Prepare and stage a reviewed dataset before opening the merchant workspace.', 409);
      return { ...binding(), available: false, status: null, selection: null };
    }
    const selected = input.stageRequestId ? await selection(input.stageRequestId) : null;
    const { releaseStatus } = await import('../../sf82-seller-pilot/releases.mjs');
    return { ...binding(), available: true, status: await releaseStatus(store), selection: selected };
  }
  async function stopOwned(consoleId, final = false) {
    if (!owned) {
      if (!final) need(ended.has(consoleId), 'OPENAQ_MERCHANT_CONSOLE_CHANGED',
        'Refresh the current project merchant console before closing it.', 409);
      return { ...binding(), closedConsoleId: consoleId ?? null, closed: true };
    }
    if (!final && ended.has(consoleId)) return {
      ...binding(), closedConsoleId: consoleId, closed: true,
    };
    need(final || consoleId === owned.id, 'OPENAQ_MERCHANT_CONSOLE_CHANGED',
      'Close only the exact merchant console opened by this project.', 409);
    const selected = owned;
    selected.closing = true;
    // The original console drains accepted actions, its seller, source readers,
    // receiving client and delivery handles. Retain it if any disposal fails.
    await selected.handle.close();
    if (owned === selected) owned = null;
    ended.add(selected.id);
    return { ...binding(), closedConsoleId: selected.id, closed: true };
  }
  return Object.freeze({
    status: input => serial(() => current(input)),
    inspect: input => serial(async () => {
      fields(input, ['stageRequestId']); return current(input);
    }),
    open: input => serial(async () => {
      fields(input, ['stageRequestId']);
      const selected = await selection(input.stageRequestId);
      need(!owned?.closing, 'OPENAQ_MERCHANT_CLOSE_PENDING',
        'Finish closing the original merchant console before reopening it.', 409);
      if (!owned) {
        const { startReleaseConsole } = await import('../../sf82-seller-pilot/release-console.mjs');
        const id = randomUUID(), openedAt = new Date().toISOString();
        const handle = await startReleaseConsole(store, {
          port: 0, env,
          managedBinding: { schema: SCHEMA, workspaceId, configurationSha256, consoleId: id },
        });
        owned = { id, openedAt, handle, closing: false };
        const url = new URL(handle.operatorUrl);
        need(url.protocol === 'http:' && url.hostname === '127.0.0.1' &&
          Number(url.port) > 0 && Number(url.port) <= 65535 &&
          !url.username && !url.password && !url.search && url.pathname === '/' &&
          url.hash === '#' + handle.token && /^[a-f0-9]{64}$/.test(handle.token),
        'OPENAQ_MERCHANT_CONSOLE_ORIGIN_CHANGED', 'The original release console returned another origin.', 409);
      }
      return { ...await current({ stageRequestId: selected.stageRequestId }),
        operatorUrl: owned.handle.operatorUrl };
    }),
    stop: input => serial(async () => {
      fields(input, ['consoleId']); uuid(input.consoleId);
      return stopOwned(input.consoleId);
    }),
    close() {
      if (closing) return closing;
      retiring = true;
      closing = (async () => {
        await sequence;
        await stopOwned(owned?.id, true);
      })();
      closing.catch(() => { closing = null; });
      return closing;
    },
  });
}
