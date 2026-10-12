// MIT. Private, resumable capture of complete original FRED release sources.
import { resolve, join } from 'node:path';
import { privateDirectory, atomicJson, readPrivateJson, withPrivateLock } from '../../routescan/quota.mjs';
import { MAX_CAPTURE_BYTES, canonical, clone, need, plain } from '../model.mjs';
import { requestFred } from '../source.mjs';
import { normalizeFredReleaseSelection, fredReleaseSourceFlow, releaseHash,
  inspectFredReleaseCapture, sealFredReleaseCapture } from './model.mjs';
export { inspectFredReleaseCapture, validateFredReleaseCapture, sealFredReleaseCapture } from './model.mjs';

export const FRED_RELEASE_ACQUISITION = 'stellar-forge.fred-release-acquisition.v1';
const same = (a, b) => canonical(a) === canonical(b);
async function optional(path) {
  try { return await readPrivateJson(path, MAX_CAPTURE_BYTES * 2); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function environmentName(value) {
  need(typeof value === 'string' && /^[A-Z_][A-Z0-9_]{0,127}$/.test(value), 'Use the existing FRED key environment-variable name.');
  return value;
}
function progressIdentity(previous, selection, apiKeyEnv) {
  need(previous === null || plain(previous) && previous.schema === FRED_RELEASE_ACQUISITION &&
    same(previous.selection, selection) && previous.apiKeyEnv === apiKeyEnv && Array.isArray(previous.records),
    'This release acquisition belongs to another source selection or key binding.', 'FRED_CAPTURE_CONFLICT', 409);
  if (previous) for (const record of previous.records)
    need(typeof record.body === 'string' && releaseHash(Buffer.from(record.body, 'utf8')) === record.sha256,
      'The retained original release page bytes changed.');
}
export async function readFredReleaseCapture(path) {
  const capture = await readPrivateJson(resolve(path), MAX_CAPTURE_BYTES);
  return { capture, model: inspectFredReleaseCapture(capture) };
}
export async function storeFredReleaseCapture(directory, supplied) {
  const capture = clone(supplied), model = inspectFredReleaseCapture(capture);
  directory = await privateDirectory(resolve(directory));
  return withPrivateLock(directory, 'capture.lock', async () => {
    const previous = await optional(join(directory, 'capture.json'));
    if (previous) {
      inspectFredReleaseCapture(previous);
      need(same(previous, capture), 'Another original release capture already owns this directory.', 'FRED_CAPTURE_CONFLICT', 409);
      return { directory, capture: previous, model, reused: true };
    }
    const progress = await optional(join(directory, 'progress.json'));
    if (progress) {
      progressIdentity(progress, capture.selection, progress.apiKeyEnv);
      need(progress.records.length <= capture.records.length && progress.records.every((record, index) =>
        same(record, capture.records[index])), 'Received release source differs from this unfinished acquisition.', 'FRED_CAPTURE_CONFLICT', 409);
    }
    await atomicJson(directory, 'capture.json', capture, { exclusive: true });
    return { directory, capture, model, reused: false };
  });
}
export async function inspectFredReleaseAcquisition({ directory }) {
  directory = await privateDirectory(resolve(directory));
  const complete = await optional(join(directory, 'capture.json'));
  if (complete) {
    const model = inspectFredReleaseCapture(complete);
    return { directory, state: 'COMPLETE', selection: clone(complete.selection), captureSha256: complete.captureSha256,
      responses: complete.records.length, rowCount: model.rowCount, nextRequest: null, lastError: null };
  }
  const progress = await optional(join(directory, 'progress.json'));
  if (!progress) return { directory, state: 'EMPTY', responses: 0, nextRequest: null, lastError: null };
  const selection = normalizeFredReleaseSelection(progress.selection);
  progressIdentity(progress, selection, environmentName(progress.apiKeyEnv));
  const flow = fredReleaseSourceFlow(selection);
  let cursor = 0, step = flow.next(), sourceError = null;
  try {
    while (cursor < progress.records.length && !step.done) step = flow.next(progress.records[cursor++]);
    need(cursor === progress.records.length, 'Acquisition has unexpected original source pages.');
  } catch (error) { sourceError = { code: error.code ?? 'FRED_INVALID', status: error.status ?? 400 }; }
  return { directory, state: progress.state, selection, apiKeyEnv: progress.apiKeyEnv, startedAt: progress.startedAt,
    responses: progress.records.length, nextRequest: sourceError || step.done ? null : clone(step.value),
    lastError: progress.lastError, sourceError };
}

/** A directory identifies one source acquisition. Reuse it to resume the exact request graph. */
export async function captureFredReleases({ directory, selection: supplied, apiKeyEnv = 'FRED_API_KEY',
  environment = process.env, signal, fetchImpl, onProgress } = {}) {
  const selection = normalizeFredReleaseSelection(supplied);
  environmentName(apiKeyEnv);
  directory = await privateDirectory(resolve(directory));
  return withPrivateLock(directory, 'capture.lock', async () => {
    const previous = await optional(join(directory, 'progress.json'));
    progressIdentity(previous, selection, apiKeyEnv);
    const complete = await optional(join(directory, 'capture.json'));
    if (complete) {
      const model = inspectFredReleaseCapture(complete);
      need(same(complete.selection, selection), 'Retained release capture uses another source selection.', 'FRED_CAPTURE_CONFLICT', 409);
      return { directory, capture: complete, model, reused: true };
    }
    const progress = previous ?? { schema: FRED_RELEASE_ACQUISITION, selection, apiKeyEnv,
      startedAt: new Date().toISOString(), records: [], state: 'CAPTURING', lastError: null };
    if (progress.lastError?.retryAt && Date.parse(progress.lastError.retryAt) > Date.now())
      throw Object.assign(new Error('Continue the same release acquisition after the retained provider retry time.'), {
        code: 'FRED_RATE_LIMITED', status: 429, retryAt: progress.lastError.retryAt,
        retryAfter: Math.ceil((Date.parse(progress.lastError.retryAt) - Date.now()) / 1000) });
    await atomicJson(directory, 'progress.json', progress);
    const flow = fredReleaseSourceFlow(selection);
    let cursor = 0, step = flow.next();
    try {
      while (!step.done) {
        signal?.throwIfAborted();
        const request = step.value;
        let record;
        if (cursor < progress.records.length) record = progress.records[cursor++];
        else {
          record = await requestFred(request, { apiKey: environment[apiKeyEnv], signal, fetchImpl });
          progress.records.push(record); cursor++;
          progress.lastError = null; progress.state = 'CAPTURING';
          // Save the full returned page before semantic inspection, preserving actual provider output on interruption.
          await atomicJson(directory, 'progress.json', progress);
          need(Buffer.byteLength(JSON.stringify(progress)) <= MAX_CAPTURE_BYTES,
            'Combined release source exceeds 64 MiB.', 'FRED_CAPTURE_TOO_LARGE', 413);
          if (onProgress) await onProgress({ responses: progress.records.length, endpoint: request.endpoint,
            series: request.parameters.series_id ?? null, releaseId: request.parameters.release_id ?? null,
            offset: Number(request.parameters.offset ?? 0) });
        }
        step = flow.next(record);
      }
      need(cursor === progress.records.length, 'Saved acquisition includes unexpected original release responses.');
      const capture = sealFredReleaseCapture(selection, progress.records);
      await atomicJson(directory, 'capture.json', capture, { exclusive: true });
      progress.state = 'COMPLETE'; progress.completedAt = new Date().toISOString(); progress.lastError = null;
      await atomicJson(directory, 'progress.json', progress);
      return { directory, capture, model: inspectFredReleaseCapture(capture), reused: false };
    } catch (error) {
      progress.state = 'INTERRUPTED';
      progress.lastError = { code: typeof error.code === 'string' ? error.code : 'FRED_CAPTURE_INTERRUPTED',
        status: Number.isInteger(error.status) ? error.status : null, at: new Date().toISOString(),
        retryAt: typeof error.retryAt === 'string' ? error.retryAt : null };
      await atomicJson(directory, 'progress.json', progress);
      throw error;
    }
  });
}
