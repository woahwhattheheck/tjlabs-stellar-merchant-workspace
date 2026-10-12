#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startOpen311Server } from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/open311/server.mjs';
import { createClient } from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/open311/client.mjs';
import { canonical, sha256 } from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/open311/workspace.mjs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function retainedFactory(path, config) {
  if (!path) return undefined;
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  assert(manifest.schema === 'commons.open311.retained-source.v1' && Array.isArray(manifest.captures) && manifest.captures.length, 'Use the documented retained-source manifest.');
  const sources = manifest.captures.map(entry => {
    const { raw, receipt } = entry;
    assert(raw?.encoding === 'base64' && typeof raw.body === 'string' && raw.complete !== false, 'A retained response needs its complete original base64 body.');
    const bytes = Buffer.from(raw.body, 'base64');
    assert(bytes.toString('base64') === raw.body && bytes.length === raw.bytes && sha256(bytes) === raw.sha256, 'A retained original response failed its byte count or SHA-256 check.');
    assert(receipt && (receipt.method == null || receipt.method === 'GET') && typeof receipt.url === 'string' && (receipt.status == null || (receipt.status >= 200 && receipt.status < 300)) && Number.isFinite(Date.parse(receipt.observedAt)), 'A retained response needs its original URL, observation time, and successful response or import provenance.');
    assert(receipt.status != null || receipt.provenance, 'An unknown origin HTTP status requires the actual source-import provenance.');
    const url = new URL(receipt.url), endpoint = new URL(config.baseUrl);
    assert(url.origin === endpoint.origin && url.pathname.startsWith(endpoint.pathname.replace(/\/+$/, '') + '/'), 'Retained response belongs to another endpoint.');
    return { raw, receipt, bytes };
  });
  const used = new Map();
  return connection => {
    // Retained receipts use the client's redacted URL; replay never needs a live secret.
    const replayConnection = { ...connection };
    if (replayConnection.apiKeyEnv) {
      delete replayConnection.apiKeyEnv;
      replayConnection.apiKey = '[redacted]';
    }
    let selected;
    const client = createClient(replayConnection, { fetchImpl: async (url, init) => {
      assert(init.method === 'GET', 'The commissioning source is a GET resource.');
      const matches = sources.filter(entry => entry.receipt.url === String(url));
      assert(matches.length, 'No retained response matches the exact requested URL: ' + String(url).split('?')[0]);
      const index = used.get(String(url)) || 0;
      selected = matches[Math.min(index, matches.length - 1)]; used.set(String(url), index + 1);
      return new Response(selected.bytes, { status: selected.receipt.status ?? 200, statusText: selected.receipt.statusText || '', headers: selected.receipt.headers || { 'content-type': selected.raw.contentType || 'application/json' } });
    } });
    return Object.fromEntries(['services', 'requests', 'service', 'request', 'token', 'discovery'].map(method => [method, async (...args) => {
      selected = null;
      const result = await client[method](...args);
      assert(selected && result.raw.sha256 === selected.raw.sha256, 'The decoded response differs from its retained original.');
      const original = selected.receipt;
      return { ...result, receipt: { ...original, method: original.method ?? null, status: original.status ?? null, headers: original.headers ?? null,
        startedAt: original.startedAt ?? null, durationMs: original.durationMs ?? null,
        ...Object.fromEntries(['kind', 'query', 'coverage'].filter(key => result.receipt[key] !== undefined).map(key => [key, result.receipt[key]])),
        replayedAt: new Date().toISOString(), replaySource: resolve(path), replayTransportStatus: original.status ?? 200 } };
    }]));
  };
}


const directory = resolve(process.env.OPEN311_DATA || './private-data');
const mode = process.env.OPEN311_SOURCE_MODE || 'retained';
assert(['retained', 'live'].includes(mode), 'OPEN311_SOURCE_MODE must be retained or live.');
const profile = JSON.parse(await readFile(new URL('../../../stellar/scf-starforge-20261009/sf30-seller-sdk/open311/examples/helsinki.commission.json', import.meta.url), 'utf8'));
const retainedPath = fileURLToPath(new URL('./fixtures/helsinki-retained-source.json', import.meta.url));
const clientFactory = mode === 'retained' ? await retainedFactory(retainedPath, profile.connection) : undefined;
await mkdir(directory, { recursive: true, mode: 0o700 });
const services = [];
try {
  const source = await startOpen311Server({ workspace: join(directory, 'source'), host: '127.0.0.1', port: 7311, clientFactory });
  services.push(source);
  const receiver = await startOpen311Server({ workspace: join(directory, 'receiver'), host: '127.0.0.1', port: 7312 });
  services.push(receiver);
  const state = source.workspace.state();
  const current = state.connections.find(c => c.id === profile.connection.id);
  if (!current) {
    source.workspace.putConnection({
      requestId: 'windmill-helsinki-connection-v1',
      expectedRevision: state.revision,
      connection: profile.connection
    });
  } else {
    assert(current.baseUrl === profile.connection.baseUrl, 'The retained source connection points to a different endpoint.');
  }
  const manifest = mode === 'retained' ? JSON.parse(await readFile(retainedPath, 'utf8')) : null;
  const startup = {
    schema: 'tjlabs.windmill.open311.services.v1',
    startedAt: new Date().toISOString(),
    node: process.version,
    sourceMode: mode,
    source: source.startup,
    receiver: receiver.startup,
    retainedSource: manifest ? {
      operationId: manifest.operationId, sourcePage: manifest.sourcePage,
      captures: manifest.captures.map(c => ({ filename: c.filename, bytes: c.raw.bytes, sha256: c.raw.sha256, receipt: c.receipt }))
    } : null
  };
  await writeFile(join(directory, 'startup.json'), JSON.stringify(startup, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(startup));
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await Promise.all(services.map(service => service.close()));
    process.exitCode = 0;
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
} catch (error) {
  await Promise.allSettled(services.map(service => service.close()));
  throw error;
}
