#!/usr/bin/env node
// MIT. One retained commissioning operation against the original provider and application.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline, finished } from 'node:stream/promises';

const digest = value => createHash('sha256').update(value).digest('hex');
const bytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const date = () => new Date().toISOString();
function requireValue(value, code, detail) {
  if (!value) throw Object.assign(new Error(code), { code, detail });
}
function flags(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    requireValue(argv[i].startsWith('--') && argv[i + 1] !== undefined, 'ARGUMENT_REQUIRED');
    result[argv[i].slice(2)] = argv[i + 1];
  }
  return result;
}
async function mkdir(directory) { await fs.mkdir(directory, { recursive: true, mode: 0o700 }); }
async function read(file, optional = false) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
}
async function exact(file, body) {
  await mkdir(path.dirname(file));
  try {
    const existing = await fs.readFile(file);
    requireValue(existing.equals(body), 'ORIGINAL_FILE_CONFLICT', { file });
    return;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = file + '.pending-' + randomUUID();
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(body); await handle.sync(); } finally { await handle.close(); }
  try { await fs.link(temporary, file); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    requireValue((await fs.readFile(file)).equals(body), 'ORIGINAL_FILE_CONFLICT');
  } finally { await fs.unlink(temporary); }
}
async function replace(file, value) {
  await mkdir(path.dirname(file));
  const temporary = file + '.pending-' + randomUUID();
  await fs.writeFile(temporary, bytes(value), { flag: 'wx', mode: 0o600 });
  const handle = await fs.open(temporary, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temporary, file);
}
async function processIdentity() {
  const stat = await fs.readFile('/proc/self/stat', 'utf8');
  const procPid = Number(stat.slice(0, stat.indexOf(' ')));
  const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
  requireValue(Number.isSafeInteger(procPid) && procPid > 0 && /^\d+$/.test(fields[19]),
    'ORIGINAL_OWNER_UNCERTAIN');
  return {
    pid: process.pid, procPid, startTicks: fields[19],
    bootId: (await fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
    namespace: await fs.readlink('/proc/self/ns/pid'),
    procMountNamespace: await fs.readlink('/proc/self/ns/mnt'),
  };
}
async function active(identity) {
  if (!identity?.bootId || !identity.namespace || !identity.startTicks) return true;
  try {
    const current = await processIdentity();
    if (current.bootId !== identity.bootId) return false;
    if (!Number.isSafeInteger(identity.procPid) || identity.procPid <= 0) return true;
    const base = '/proc/' + identity.procPid;
    let stat;
    try { stat = await fs.readFile(base + '/stat', 'utf8'); }
    catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
      return !(identity.procMountNamespace &&
        current.procMountNamespace === identity.procMountNamespace &&
        current.namespace === identity.namespace);
    }
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    const namespace = await fs.readlink(base + '/ns/pid');
    if (namespace === identity.namespace && fields[19] === identity.startTicks)
      return fields[0] !== 'Z' && fields[0] !== 'X';
    return !(identity.procMountNamespace &&
      current.procMountNamespace === identity.procMountNamespace &&
      current.namespace === identity.namespace);
  } catch (error) {
    if (['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes(error.code)) return true;
    throw error;
  }
}
async function ownOperation(directory) {
  const lock = path.join(directory, 'owner');
  await mkdir(directory);
  try { await fs.mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const prior = await read(path.join(lock, 'identity.json'), true);
    requireValue(prior, 'ORIGINAL_OWNER_UNCERTAIN');
    requireValue(!await active(prior), 'ORIGINAL_OPERATION_ACTIVE', prior);
    await fs.rename(lock, lock + '.retired-' + randomUUID());
    await fs.mkdir(lock, { mode: 0o700 });
  }
  await exact(path.join(lock, 'identity.json'), bytes(await processIdentity()));
  return async () => fs.rename(lock, lock + '.complete-' + randomUUID());
}
async function child(executable, args, selection = {}) {
  selection.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const output = [], errors = [];
    let firstError = null;
    const owned = spawn(executable, args, {
      cwd: selection.cwd, env: selection.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stop = error => {
      firstError ??= error;
      // Retain the same child through its stdio close; never finish on 'error' alone.
      try { owned.kill('SIGTERM'); } catch (failure) { firstError ??= failure; }
    };
    const abort = () => stop(selection.signal.reason ??
      Object.assign(new Error('Commissioning interrupted.'), { code: 'COMMISSIONING_STOPPED' }));
    owned.stdout.on('data', chunk => output.push(chunk));
    owned.stderr.on('data', chunk => errors.push(chunk));
    owned.stdout.on('error', stop); owned.stderr.on('error', stop);
    owned.on('error', error => { firstError ??= error; });
    selection.signal?.addEventListener('abort', abort, { once: true });
    if (selection.signal?.aborted) abort();
    owned.once('close', (code, signal) => {
      selection.signal?.removeEventListener('abort', abort);
      const result = { executable, args, code, signal,
        stdout: Buffer.concat(output).toString('utf8'), stderr: Buffer.concat(errors).toString('utf8') };
      if (firstError) { firstError.childResult = result; reject(firstError); } else resolve(result);
    });
  });
}
async function hashFile(filename) {
  const stream = createReadStream(filename, { highWaterMark: 128 * 1024 });
  const hash = createHash('sha256'); let size = 0, failure = null;
  try { for await (const chunk of stream) { hash.update(chunk); size += chunk.length; } }
  catch (error) { failure = error; }
  finally {
    stream.destroy();
    try { await finished(stream, { cleanup: true }); } catch (error) { failure ??= error; }
  }
  if (failure) throw failure;
  return { path: filename, bytes: size, sha256: hash.digest('hex') };
}
async function materialize({ packetFile, packetSha256, sourceDirectory, operationDirectory }) {
  if (!packetFile) {
    requireValue(sourceDirectory, 'SOURCE_DIRECTORY_OR_COMPLETE_PACKET_REQUIRED');
    const raw = await fs.readFile(path.join(sourceDirectory, 'source-files.json'));
    return { directory: path.resolve(sourceDirectory), sha256: digest(raw), packetSha256: null };
  }
  const raw = await fs.readFile(packetFile);
  if (packetSha256) requireValue(digest(raw) === packetSha256, 'SOURCE_PACKET_MISMATCH');
  const packet = JSON.parse(raw);
  requireValue(Array.isArray(packet.files), 'COMPLETE_SOURCE_PACKET_REQUIRED');
  const identity = digest(raw);
  const directory = path.join(operationDirectory, 'applications', identity);
  const prefix = packet.sourceRoot ? packet.sourceRoot.replace(/\/$/, '') + '/' : '';
  const names = new Set();
  for (const member of packet.files) {
    let relative = member.path;
    if (prefix && relative.startsWith(prefix)) relative = relative.slice(prefix.length);
    requireValue(!relative.startsWith('/') && !relative.split('/').some(x => !x || x === '.' || x === '..'),
      'INVALID_SOURCE_MEMBER');
    requireValue(!names.has(relative), 'DUPLICATE_SOURCE_MEMBER');
    names.add(relative);
    const body = Buffer.from(member.content, 'utf8');
    requireValue(body.length === member.bytes && digest(body) === member.sha256, 'SOURCE_MEMBER_MISMATCH');
    await exact(path.join(directory, relative), body);
    await fs.chmod(path.join(directory, relative), member.mode ?? 0o644);
  }
  const manifest = await fs.readFile(path.join(directory, 'source-files.json'));
  await exact(path.join(operationDirectory, 'source-packets', identity + '.json'), raw);
  return { directory, sha256: digest(manifest), packetSha256: identity };
}
function normalizeName(value) { return value.replace(/[^a-z0-9]/gi, '').toLowerCase(); }
function reference(schema, components) {
  if (!schema?.$ref) return schema ?? {};
  requireValue(schema.$ref.startsWith('#/components/schemas/'), 'UNSUPPORTED_NATIVE_SCHEMA_REFERENCE');
  return components?.schemas?.[schema.$ref.split('/').at(-1)] ?? {};
}
function safeSchemaValue(schema, context, components, key = '', depth = 0) {
  requireValue(depth < 30, 'NATIVE_SCHEMA_DEPTH');
  schema = reference(schema, components);
  const name = normalizeName(key);
  if (context[name] !== undefined) return { value: context[name] };
  if (schema.default !== undefined) return { value: schema.default };
  if (schema.const !== undefined) return { value: schema.const };
  if (schema.enum?.length === 1) return { value: schema.enum[0] };
  if (schema.allOf) {
    let value = {};
    for (const part of schema.allOf) {
      const selected = safeSchemaValue(part, context, components, key, depth + 1);
      if (selected.missing) return selected;
      if (selected.value && typeof selected.value === 'object') value = { ...value, ...selected.value };
    }
    return { value };
  }
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf ?? schema.anyOf).map(item =>
      safeSchemaValue(item, context, components, key, depth + 1)).filter(item => !item.missing);
    return variants.length === 1 ? variants[0] : { missing: key || 'variant' };
  }
  if (schema.type === 'object' || schema.properties) {
    const result = {};
    for (const property of schema.required ?? []) {
      const selected = safeSchemaValue(schema.properties?.[property] ?? {}, context,
        components, property, depth + 1);
      if (selected.missing) return selected;
      result[property] = selected.value;
    }
    // Original page selectors are included even when optional.
    for (const [property, item] of Object.entries(schema.properties ?? {})) {
      if (result[property] !== undefined) continue;
      if (['pagenumber', 'pagesize', 'limit', 'offset'].includes(normalizeName(property))) {
        const selected = safeSchemaValue(item, context, components, property, depth + 1);
        if (!selected.missing) result[property] = selected.value;
      }
    }
    return { value: result };
  }
  if (schema.nullable) return { value: null };
  return { missing: key || schema.title || schema.type || 'value' };
}
function originalReadInput(entry, context) {
  const input = {}, metadata = entry.inputSchema;
  const components = metadata.components ?? {};
  for (const parameter of metadata.parameters ?? []) {
    const resolved = parameter.$ref ? null : parameter;
    requireValue(resolved, 'UNRESOLVED_NATIVE_PARAMETER');
    if (!resolved.required && context[normalizeName(resolved.name)] === undefined) continue;
    const selected = safeSchemaValue(resolved.schema, context, components, resolved.name);
    if (selected.missing) return selected;
    const part = resolved.in === 'path' ? 'params' : resolved.in === 'query' ? 'query' : null;
    if (!part) continue;
    (input[part] ??= {})[resolved.name] = selected.value;
  }
  if (metadata.requestBody) {
    const schema = metadata.requestBody.content?.['application/json']?.schema;
    if (schema) {
      const selected = safeSchemaValue(schema, context, components);
      if (selected.missing && metadata.requestBody.required) return selected;
      if (!selected.missing) input.body = selected.value;
    }
  }
  return { value: input };
}

export async function commissionBloccpay(configuration, options = {}) {
  requireValue(Number(process.versions.node.split('.')[0]) === 24, 'NODE_24_REQUIRED');
  requireValue(configuration && typeof configuration === 'object' && !Array.isArray(configuration), 'CONFIGURATION_REQUIRED');
  requireValue(typeof options.operationDirectory === 'string' && options.operationDirectory, 'OPERATION_DIRECTORY_REQUIRED');
  const operationDirectory = path.resolve(options.operationDirectory);
  const release = await ownOperation(operationDirectory);
  const phasesDirectory = path.join(operationDirectory, 'phases');
  const receipt = {
    schema: 'bloccpay.native-commissioning.v1',
    operation: 'BLOCCPAY-PAYROLL-RECONCILIATION-COMMISSIONING-6BBB-20261013',
    startedAt: date(), phases: [], source: null, workspace: null,
  };
  let originalServer = null, receivedServer = null, browser = null;
  let api;
  const working = new Set();
  const operatingOwners = new Set();
  const commissioningSelections = {};
  const contexts = new Set(), contextClosures = new Map();
  const controller = new AbortController();
  let firstError = null, closePromise = null, released = false, closing = false, finalReceipt = null;
  const closeReceiptId = randomUUID();
  const describeError = error => ({ code: error.code ?? 'NATIVE_ERROR', message: error.message });
  function track(work) {
    const accepted = Promise.resolve(work);
    working.add(accepted);
    accepted.then(() => working.delete(accepted), () => working.delete(accepted));
    return accepted;
  }
  function stop(reason) {
    firstError ??= reason instanceof Error ? reason :
      Object.assign(new Error('Commissioning interrupted by ' + reason), { code: 'COMMISSIONING_STOPPED' });
    if (!controller.signal.aborted) controller.abort(firstError);
    for (const context of contexts) track(closeBrowserContext(context)).catch(() => {});
    if (closing) close().catch(error => { firstError ??= error; });
  }
  const onINT = () => stop('SIGINT'), onTERM = () => stop('SIGTERM');
  const onOutputError = error => stop(error);
  process.on('SIGINT', onINT); process.on('SIGTERM', onTERM);
  process.stdout.on('error', onOutputError); process.stderr.on('error', onOutputError);
  const runChild = (executable, args, selection = {}) => track(child(executable, args,
    { ...selection, signal: controller.signal }));
  async function openBrowserContext(options = {}) {
    controller.signal.throwIfAborted();
    requireValue(!closing && browser, 'COMMISSIONING_DEPENDENCY_MISSING',
      { required: 'The original selected browser must be open.' });
    const context = await browser.newContext({ acceptDownloads: true, ...options });
    contexts.add(context);
    if (controller.signal.aborted) {
      await closeBrowserContext(context);
      controller.signal.throwIfAborted();
    }
    return context;
  }
  function closeBrowserContext(context) {
    if (!contexts.has(context)) return Promise.resolve();
    if (contextClosures.has(context)) return contextClosures.get(context);
    const pending = Promise.resolve().then(() => context.close()).then(() => {
      contexts.delete(context); contextClosures.delete(context);
    }, error => { contextClosures.delete(context); throw error; });
    contextClosures.set(context, pending);
    return pending;
  }
  async function startHost(module, configuration, which) {
    controller.signal.throwIfAborted();
    try {
      const host = await track(module.startBloccpayServer(configuration));
      if (which === 'original') originalServer = host; else receivedServer = host;
      controller.signal.throwIfAborted();
      return host;
    } catch (error) {
      // The maintained server retains failed acquisition in this exact close closure.
      if (typeof error.close === 'function') operatingOwners.add({
        close: () => error.close(), inspect: () => error.application?.inspect?.() ?? null,
      });
      throw error;
    }
  }
  function close() {
    if (released) return Promise.resolve();
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => {
      const errors = [];
      while (working.size) {
        const outcomes = await Promise.allSettled([...working]);
        for (const outcome of outcomes) if (outcome.status === 'rejected') firstError ??= outcome.reason;
      }
      for (const owner of [...operatingOwners]) {
        try { await owner.close(); operatingOwners.delete(owner); } catch (error) { errors.push(error); }
      }
      // Helpers borrow these resources. Keep all parent owners until helpers have drained.
      if (!operatingOwners.size) {
        for (const context of [...contexts]) {
          try { await closeBrowserContext(context); } catch (error) { errors.push(error); }
        }
        if (!contexts.size && browser) {
          try { await browser.close(); browser = null; } catch (error) { errors.push(error); }
        }
        if (!contexts.size && !browser) {
          if (receivedServer) {
            try { await receivedServer.close(); receivedServer = null; } catch (error) { errors.push(error); }
          }
          if (originalServer) {
            try { await originalServer.close(); originalServer = null; } catch (error) { errors.push(error); }
          }
        }
      }
      receipt.finishedAt = date();
      receipt.status ??= 'FAILED';
      receipt.closure = { helpers: operatingOwners.size === 0, contexts: contexts.size === 0,
        browser: browser === null, originalServer: originalServer === null, receivedServer: receivedServer === null,
        errors: errors.map(describeError) };
      const allClosed = Object.entries(receipt.closure).every(([key, value]) => key === 'errors' || value === true);
      if (!allClosed || errors.length) {
        receipt.status = 'CLOSE_UNCERTAIN';
        try { await replace(path.join(operationDirectory, 'latest-result.private.json'), receipt); }
        catch (error) { errors.push(error); }
        throw errors[0] ?? Object.assign(new Error('Original commissioning owners remain open.'), { code: 'CLOSE_UNCERTAIN' });
      }
      if (firstError) {
        receipt.status = 'FAILED';
        receipt.error = describeError(firstError);
      } else receipt.status = receipt.phases.some(item => item.status === 'FAILED') ? 'PARTIAL' :
        receipt.phases.some(item => item.status === 'BLOCKED') ? 'AWAITING_ORIGINAL_DEPENDENCIES' : 'COMPLETE';
      finalReceipt ??= structuredClone(receipt);
      await replace(path.join(operationDirectory, 'latest-result.private.json'), finalReceipt);
      // Reentry after a publication or release failure uses these exact already-frozen bytes.
      await exact(path.join(operationDirectory, 'results', closeReceiptId + '.json'), bytes(finalReceipt));
      await release(); released = true;
      process.off('SIGINT', onINT); process.off('SIGTERM', onTERM);
      process.stdout.off('error', onOutputError); process.stderr.off('error', onOutputError);
    })().catch(error => { closePromise = null; throw error; });
    return closePromise;
  }
  const commissionOwner = { close, inspect: () => ({
    released, closing, helpers: operatingOwners.size, contexts: contexts.size,
    browser: Boolean(browser), originalServer: Boolean(originalServer), receivedServer: Boolean(receivedServer),
    acceptedWork: working.size,
  }) };
  async function operatorPage(context, server) {
    const page = await context.newPage();
    await page.goto(server.startup.origin, { waitUntil: 'domcontentloaded' });
    await page.locator('#operator-token').fill(server.token);
    await page.locator('#access-form button[type=submit]').click();
    await page.waitForFunction(id =>
      document.querySelector('#workspace-identity')?.textContent === id,
    server.workspace.describe().workspace.id);
    return page;
  }
  async function openRecord(page, table, id) {
    controller.signal.throwIfAborted();
    await page.locator('nav [data-view="' + table + '"]').click();
    const form = page.locator('#record-filter');
    await form.evaluate(element => element.reset());
    const listed = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/list' && url.searchParams.get('table') === table && response.ok();
    });
    listed.catch(() => {});
    await form.locator('button[type=submit]').click();
    const listing = await (await listed).json();
    requireValue(Array.isArray(listing.rows), 'ORIGINAL_BROWSER_LIST_REQUIRED');
    await page.waitForFunction(expected => {
      const actual = [...document.querySelectorAll('#record-table tbody small.mono')].map(node => node.textContent);
      return JSON.stringify(actual) === JSON.stringify(expected) &&
        document.querySelector('#record-page-label')?.textContent?.startsWith(expected.length + ' retained rows loaded');
    }, listing.rows.map(row => row.id));
    for (;;) {
      const row = page.locator('#record-table tbody tr').filter({
        has: page.locator('small.mono').filter({
          hasText: new RegExp('^' + id.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&') + '$'),
        }),
      });
      if (await row.count()) {
        await row.locator('button').first().click();
        await page.waitForFunction(value =>
          document.querySelector('#detail-summary')?.textContent?.includes(value), id);
        return page.locator('#record-detail');
      }
      const more = page.locator('#records-more');
      requireValue(await more.isVisible(), 'ORIGINAL_BROWSER_RECORD_NOT_FOUND', { table, id });
      const previous = await page.locator('#record-table tbody tr').count();
      await more.click();
      await page.waitForFunction(count =>
        document.querySelectorAll('#record-table tbody tr').length > count ||
        document.querySelector('#records-more')?.hidden, previous);
      controller.signal.throwIfAborted();
    }
  }
  async function downloadFile(page, control, file, key) {
    requireValue(file?.id && Number.isSafeInteger(file.bytes) && /^[a-f0-9]{64}$/.test(file.sha256),
      'ORIGINAL_DOWNLOAD_DESCRIPTOR_REQUIRED');
    let download = null, pending = null, closeAttempt = null, closed = false;
    const owner = {
      close() {
        if (closed) return Promise.resolve();
        if (closeAttempt) return closeAttempt;
        closeAttempt = (async () => {
          if (pending) { try { await pending; } catch {} }
          if (download) { await download.delete(); download = null; }
          closed = true; operatingOwners.delete(owner);
        })().catch(error => { closeAttempt = null; throw error; });
        return closeAttempt;
      },
    };
    operatingOwners.add(owner);
    let failure = null, result;
    try {
      pending = page.waitForEvent('download', { timeout: 30000 }).then(value => {
        download = value; return value;
      });
      pending.catch(() => {});
      await control.click(); await pending;
      const directory = path.join(operationDirectory, 'operator-downloads', digest(key));
      await mkdir(directory);
      const target = path.join(directory, file.id);
      const temporary = target + '.pending-' + randomUUID();
      try {
        await download.saveAs(temporary);
        const actual = await hashFile(temporary);
        requireValue(actual.bytes === file.bytes && actual.sha256 === file.sha256,
          'ORIGINAL_BROWSER_DOWNLOAD_CHANGED', { id: file.id });
        try { await fs.link(temporary, target); }
        catch (error) {
          if (error.code !== 'EEXIST') throw error;
          const prior = await hashFile(target);
          requireValue(prior.bytes === file.bytes && prior.sha256 === file.sha256, 'ORIGINAL_FILE_CONFLICT');
        }
        result = { id: file.id, path: target, bytes: actual.bytes, sha256: actual.sha256 };
      } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    } catch (error) { failure = error; }
    finally {
      try { await owner.close(); } catch (error) { if (failure) failure.downloadCloseError = error; else failure = error; }
    }
    if (failure) throw failure;
    return result;
  }
  async function phase(name, run) {
    controller.signal.throwIfAborted();
    const selected = path.join(phasesDirectory, digest(name));
    await mkdir(selected);
    const attempt = randomUUID();
    await exact(path.join(selected, attempt + '.start.json'), bytes({ name, attempt, startedAt: date() }));
    try {
      const result = await track(Promise.resolve().then(run));
      controller.signal.throwIfAborted();
      const completed = { name, attempt, status: 'COMPLETE', finishedAt: date(), result };
      await exact(path.join(selected, attempt + '.result.json'), bytes(completed));
      receipt.phases.push(completed);
      process.stdout.write(JSON.stringify({ phase: name, status: 'COMPLETE', attempt }) + '\n');
      return result;
    } catch (error) {
      const failed = {
        name, attempt, status: error.code === 'COMMISSIONING_DEPENDENCY_MISSING' ? 'BLOCKED' : 'FAILED',
        finishedAt: date(), error: { code: error.code ?? 'NATIVE_ERROR', message: error.message, detail: error.detail ?? null },
      };
      await exact(path.join(selected, attempt + '.result.json'), bytes(failed));
      receipt.phases.push(failed);
      process.stdout.write(JSON.stringify({ phase: name, status: failed.status, code: failed.error.code, attempt }) + '\n');
      if (controller.signal.aborted) throw controller.signal.reason;
      return null;
    } finally {
      await replace(path.join(operationDirectory, 'latest-result.private.json'), receipt);
    }
  }
  async function request(workspace, key, method, args) {
    controller.signal.throwIfAborted();
    const directory = path.join(operationDirectory, 'original-requests', digest(key));
    const originalFile = path.join(directory, 'request.json');
    let original = await read(originalFile, true);
    const identity = digest(bytes({ method, args }));
    if (!original) {
      original = {
        requestId: randomUUID(), method, args,
        expectedRevision: workspace.describe().workspace.revision,
        semanticSha256: identity,
      };
      await exact(originalFile, bytes(original));
    }
    requireValue(original.semanticSha256 === identity, 'COMMISSIONING_REQUEST_SELECTION_CHANGED', { key });
    let selected = await read(path.join(directory, 'latest-selection.json'), true) ?? original;
    for (let index = 0; index < 10; index++) {
      try {
        const result = await track(workspace.command({ ...selected, signal: controller.signal }));
        await exact(path.join(directory, 'result.json'), bytes(result));
        return result.result;
      } catch (error) {
        if (error.code !== 'REVISION_CONFLICT') throw error;
        const next = { ...original, expectedRevision: workspace.describe().workspace.revision };
        const revisionAttempt = {
          requestId: original.requestId, semanticSha256: identity,
          previousExpectedRevision: selected.expectedRevision,
          expectedRevision: next.expectedRevision,
          rejection: { code: error.code, details: error.details }, observedAt: date(),
        };
        await exact(path.join(directory, 'revision-' + randomUUID() + '.json'), bytes(revisionAttempt));
        await replace(path.join(directory, 'latest-selection.json'), next);
        selected = next;
      }
    }
    throw Object.assign(new Error('Original revision selection remains contested.'), { code: 'REVISION_CONFLICT' });
  }
  try {
    receipt.source = await phase('complete-original-source', async () => {
      const selected = await materialize({
        packetFile: options.packetFile, packetSha256: options.packetSha256,
        sourceDirectory: options.sourceDirectory, operationDirectory,
      });
      const source = JSON.parse(await fs.readFile(path.join(selected.directory, 'source-files.json')));
      requireValue(source.schema === 'bloccpay.application-source.v1', 'APPLICATION_MANIFEST_REQUIRED');
      for (const member of source.files) {
        const raw = await fs.readFile(path.join(selected.directory, member.path));
        requireValue(raw.length === member.bytes && digest(raw) === member.sha256, 'ORIGINAL_SOURCE_MISMATCH');
      }
      return { ...selected, files: source.files.length + 1 };
    });
    requireValue(receipt.source, 'COMPLETE_APPLICATION_SOURCE_REQUIRED');
    const sourceDirectory = receipt.source.directory;
    const importSource = filename => import(pathToFileURL(path.join(sourceDirectory, filename)).href);
    api = {
      workspace: await importSource('lib/workspace.mjs'),
      runtime: await importSource('lib/runtime.mjs'),
      receiving: await importSource('lib/receiving.mjs'),
      archive: await importSource('lib/archive.mjs'),
      server: await importSource('server.mjs'),
      native: await importSource('lib/native.mjs'),
    };
    await phase('native-cli-syntax-and-imports', async () => {
      const manifest = await read(path.join(sourceDirectory, 'source-files.json'));
      const results = [];
      for (const member of manifest.files.filter(file => file.path.endsWith('.mjs'))) {
        const result = await runChild(process.execPath, ['--check', path.join(sourceDirectory, member.path)]);
        results.push(result);
        requireValue(result.code === 0, 'NATIVE_MODULE_PARSE_FAILED', result);
      }
      const help = await runChild(process.execPath, [path.join(sourceDirectory, 'cli.mjs'), 'help']);
      requireValue(help.code === 0 && help.stdout.includes('runtime-retain'), 'NATIVE_CLI_HELP_FAILED', help);
      return { results, help, node: process.version, sqlite: process.versions.sqlite };
    });
    const runtimeDirectory = path.join(operationDirectory, 'runtime');
    const runtime = await phase('retain-complete-native-node', async () => {
      const selected = await api.runtime.retainBloccpayRuntime({
        directory: runtimeDirectory, nodeExecutable: configuration.nodeExecutable ?? process.execPath,
        licenseFiles: configuration.runtimeLicenseFiles ?? [],
      });
      const result = await runChild(selected.nodeExecutable, ['-e',
        "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(':memory:');console.log(JSON.stringify({node:process.version,sqlite:d.prepare('select sqlite_version() AS version').get()}));d.close();"]);
      requireValue(result.code === 0, 'RETAINED_NATIVE_NODE_FAILED', result);
      return { ...api.runtime.publicBloccpayRuntime(selected), directory: selected.directory, nodeExecutable: selected.nodeExecutable, native: result };
    });
    const serverConfiguration = {
      ...configuration, name: configuration.name ?? 'Bloccpay payroll commissioning',
      connections: configuration.connections ?? {},
      collections:{...(configuration.collections??{}),enabled:false},
    };
    originalServer = await startHost(api.server, {
      directory: path.join(operationDirectory, 'workspace'), sourceDirectory,
      configuration: serverConfiguration,
      runtimeDirectory: runtime?.directory, expectedManifestSha256: runtime?.manifestSha256,
      port: Number(options.port ?? 8781),
    }, 'original');
    const workspace = originalServer.workspace;
    receipt.workspace = { ...workspace.describe().workspace, directory: workspace.directory };
    await exact(path.join(operationDirectory, 'startup-' + receipt.source.sha256 + '.json'),
      bytes({ ...originalServer.startup, startedAt: undefined }));
    await phase('original-http-workspace-identity', async () => {
      const headers = { authorization: 'Bearer ' + originalServer.token };
      const response = await fetch(originalServer.startup.origin + '/api/bootstrap', { headers, signal: controller.signal });
      requireValue(response.ok, 'NATIVE_HTTP_BOOTSTRAP_FAILED');
      const body = await response.json();
      requireValue(body.workspace.id === workspace.describe().workspace.id &&
        body.methods.some(method => method.name === 'operation.reconcile'), 'HTTP_WORKSPACE_MISMATCH');
      return { workspaceId: body.workspace.id, methods: body.methods.length,
        origin: originalServer.startup.origin, revision: body.workspace.revision };
    });


    const observations=[],readTasks=new Map();
    const addRead=(alias,task,origin)=>{
      const entry=api.native.NATIVE_ACTIONS.find(row=>(row.id??row.action)===task.action);
      requireValue(entry && !entry.mutation,'NATIVE_READ_ACTION_REQUIRED',{action:task.action});
      const selectedConnection=serverConfiguration.connections[alias];
      requireValue(selectedConnection,'ORIGINAL_CONNECTION_REQUIRED',{alias});
      requireValue(entry.provider===selectedConnection.provider,'RELATED_PROVIDER_SCOPE_MISMATCH');
      const identity=digest(bytes([alias,task.action,task.input]));
      if(!readTasks.has(identity))readTasks.set(identity,{
        id:identity,connectionAlias:alias,action:task.action,input:task.input,
        required:task.required!==false,origin,
      });
    };
    await phase('original-native-inventory-plan',async()=>{
      requireValue(Object.keys(serverConfiguration.connections).length,
        'COMMISSIONING_DEPENDENCY_MISSING',{required:'Selected owner SDP, Horizon or Bridge connection.'});
      const plans=[];
      for(const [alias,connection] of Object.entries(serverConfiguration.connections)){
        const plan=await api.native.initialReadPlan(connection);
        for(const task of plan.tasks??plan) addRead(alias,task,{kind:'initial',alias});
        plans.push({alias,plan});
      }
      const selected=bytes(plans),identity=digest(selected);
      await exact(path.join(operationDirectory,'provider-plans',identity+'.json'),selected);
      return{planSha256:identity,tasks:readTasks.size,plans};
    });
    async function completeRead(task){
      const capture=await request(workspace,'capture:'+task.id,'capture.start',{
        connectionAlias:task.connectionAlias,action:task.action,input:task.input,
      });
      let result=workspace.privateItem('captures',capture.id);
      for(let pass=0;pass<(configuration.maximumReadPasses??100);pass++){
        if(result.status==='COMPLETE')break;
        const selection=digest(bytes({pages:result.pages,attempts:result.pageAttempts??[],next:result.next}));
        result=await request(workspace,'capture-pass:'+task.id+':'+selection,'capture.run',{
          captureId:capture.id,maxPages:configuration.maxPagesPerPass??100,
        });
        if(result.status==='PARTIAL'||result.status==='PAUSED')break;
      }
      requireValue(result.status==='COMPLETE','ORIGINAL_NATIVE_CAPTURE_INCOMPLETE',{
        action:task.action,captureId:result.id,status:result.status,next:result.next,error:result.error,
      });
      return{taskId:task.id,captureId:result.id,action:task.action,pages:result.pages,
        connectionAlias:task.connectionAlias};
    }
    const attempted=new Set();
    async function captureReadPlan(){
      for(const [id,task]of readTasks){
        if(attempted.has(id))continue;
        attempted.add(id);
        const result=await phase('original-read:'+id,()=>completeRead(task));
        if(result)observations.push(result);
      }
    }
    await captureReadPlan();
    await phase('original-resource-related-read-plan',async()=>{
      const unresolved=[];
      // Retained provider records, not caller-invented IDs, define the dependent reads.
      for(let wave=0;wave<8;wave++){
        const before=readTasks.size;
        for(const resource of workspace.privateList('resources')){
          const version=workspace.privateItem('resourceVersions',resource.currentVersionId);
          for(const read of version.relatedReads??[]){
            const alias=read.connectionAlias??version.connectionAlias;
            const entry=api.native.NATIVE_ACTIONS.find(row=>(row.id??row.action)===read.action);
            const selected=serverConfiguration.connections[alias];
            if(!entry||!selected||entry.provider!==selected.provider){
              unresolved.push({versionId:version.id,read,reason:'Explicit selected provider connection required.'});
              continue;
            }
            if(entry.provider==='horizon'&&version.environment==='sandbox'&&
                version.provider==='bridge'){
              unresolved.push({versionId:version.id,read,reason:'Bridge sandbox does not submit a Stellar transaction.'});
              continue;
            }
            addRead(alias,read,{kind:'related',versionId:version.id});
          }
        }
        if(before===readTasks.size)break;
        await captureReadPlan();
      }
      return{tasks:readTasks.size,observed:observations,unresolved};
    });

    let programme=null,payroll=null,instructions=null;
    programme=await phase('retain-original-programme-definition',async()=>{
      const definition=configuration.programme ??
        (configuration.programmeFile?await read(path.resolve(configuration.programmeFile)):null);
      requireValue(definition,'COMMISSIONING_DEPENDENCY_MISSING',{
        required:'Actual company payroll programme, source wallet, asset and explicit input mapping.',
      });
      const identity=digest(bytes(definition));
      await exact(path.join(operationDirectory,'programme-inputs',identity+'.json'),bytes(definition));
      return request(workspace,'programme:'+identity,'programme.save',{definition});
    });
    if(programme)payroll=await phase('retain-original-customer-payroll',async()=>{
      const original=configuration.payroll;
      requireValue(original?.file,'COMMISSIONING_DEPENDENCY_MISSING',{
        required:'Original customer payroll file and its selected CSV or JSON mapping.',
      });
      const body=await fs.readFile(path.resolve(original.file));
      const identity=digest(body);
      const file=await workspace.retainFile(body,{
        filename:path.basename(original.file),contentType:original.format==='csv'?'text/csv':'application/json',
        private:true,
      });
      await exact(path.join(operationDirectory,'payroll-inputs',identity),body);
      const result=await request(workspace,'payroll:'+programme.id+':'+identity,'payroll.import',{
        programmeVersionId:programme.id,fileId:file.id,format:original.format??'csv',
        recordsPath:original.recordsPath??'',
      });
      requireValue(result.data.rows.length>0,'ORIGINAL_PAYROLL_ROWS_REQUIRED');
      return result;
    });
    const selectedVersion=(selection,kind)=>{
      if(selection?.versionId)return workspace.privateItem('resourceVersions',selection.versionId);
      const candidates=workspace.privateList('resources').filter(row=>
        row.kind===kind && (!selection?.connectionAlias||row.connectionAlias===selection.connectionAlias) &&
        (!selection?.resourceId||String(row.resourceId)===String(selection.resourceId)));
      requireValue(candidates.length===1,'EXPLICIT_NATIVE_RESOURCE_SELECTION_REQUIRED',{
        kind,candidateIds:candidates.map(row=>row.id),
      });
      return workspace.privateItem('resourceVersions',candidates[0].currentVersionId);
    };
    if(payroll)instructions=await phase('original-sdp-instruction-file',async()=>{
      const binding=configuration.commissioning??{};
      const wallet=selectedVersion(binding.wallet,'sdp-wallet');
      const disbursement=selectedVersion(binding.disbursement,'sdp-disbursement');
      const result=await request(workspace,'instructions:'+payroll.id+':'+wallet.id+':'+disbursement.id,
        'payroll.instructions',{payrollId:payroll.id,walletVersionId:wallet.id,
          disbursementVersionId:disbursement.id});
      const body=await workspace.fileBytes(result.fileId);
      requireValue(digest(body)===result.sha256,'ORIGINAL_INSTRUCTION_IDENTITY_MISMATCH');
      await exact(path.join(operationDirectory,'instructions',result.sha256+'.csv'),body);
      return result;
    });

    await phase('explicit-original-provider-operations',async()=>{
      const selected=configuration.commissioning??{};
      const wantsPayroll=selected.uploadInstructions===true||selected.startDisbursement===true;
      if(!wantsPayroll && !selected.operations?.length)return{
        status:'READ_ONLY',reason:'No original provider mutation selected.',
      };
      requireValue(selected.dispatch===true,'COMMISSIONING_DEPENDENCY_MISSING',{
        required:'Explicit selected provider-operation dispatch and native creator/approver authority.',
      });
      await request(workspace,'enable-selected-provider-dispatch','delivery.configure',{enabled:true});
      const results=[];
      async function capabilitiesEvidence(alias,base,key){
        if(base.sourceIds?.capabilities)return base;
        const selectionFile=path.join(operationDirectory,'capability-selections',
          digest(bytes([alias,key]))+'.json');
        let selected=await read(selectionFile,true);
        if(!selected){
          const candidates=workspace.privateList('sources').filter(source=>
            source.connectionAlias===alias &&
            source.kind==='sdp.distribution-wallet.capabilities' &&
            source.classification?.outcome==='accepted' && source.bodyComplete)
            .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||b.id.localeCompare(a.id));
          const descriptor=api.native.describeConnection(serverConfiguration.connections[alias]);
          let matching=null;
          for(const candidate of candidates){
            const original=JSON.parse((await workspace.fileBytes(candidate.receiptFileId,{private:true})).toString());
            const input=original.request?.input??{},value=original.parsed?.value;
            if(value?.wallet_id===descriptor.sourceWalletId &&
                original.request?.context?.credentialBinding===descriptor.credentialBinding &&
                !input.query?.user_id && !input.query?.role && !value.user_id && !value.role){
              matching=candidate;break;
            }
          }
          requireValue(matching,'COMMISSIONING_DEPENDENCY_MISSING',{
            required:'Actual capabilities response for the selected SDP actor and source wallet.',connectionAlias:alias,
          });
          selected={connectionAlias:alias,sourceId:matching.id,selectedAt:date()};
          await exact(selectionFile,bytes(selected));
        }
        const source=workspace.privateItem('sources',selected.sourceId);
        requireValue(source.connectionAlias===alias,'CAPABILITY_ACTOR_SELECTION_CHANGED');
        return{...base,sourceIds:{...(base.sourceIds??{}),capabilities:source.id}};
      }
      async function performSelected(key,args){
        const entry=api.native.NATIVE_ACTIONS.find(row=>(row.id??row.action)===args.action);
        requireValue(entry?.mutation,'SELECTED_MUTATION_NOT_IN_NATIVE_CATALOGUE');
        const connection=serverConfiguration.connections[args.connectionAlias];
        requireValue(connection && connection.provider===entry.provider,'ORIGINAL_CONNECTION_REQUIRED');
        const identity=digest(bytes({key,args}));
        const prepared=await request(workspace,'prepare-selected:'+identity,'operation.prepare',args);
        const observed=await request(workspace,'dispatch-selected:'+identity,'operation.dispatch',{
          operationId:prepared.id,
        });
        let readback=null;
        if(prepared.readback)readback=await request(workspace,'read-selected:'+identity,'operation.reconcile',{
          operationId:prepared.id,
        });
        results.push({operationId:prepared.id,state:observed.state,readback});
        requireValue(observed.state==='ACCEPTED','ORIGINAL_PROVIDER_MUTATION_UNRESOLVED',{
          operationId:prepared.id,state:observed.state,
        });
        return{prepared,observed,readback};
      }
      if(wantsPayroll){
        requireValue(instructions,'COMMISSIONING_DEPENDENCY_MISSING',{
          required:'Retained original payroll, wallet, batch and generated SDP instruction file.',
        });
        const contract=instructions.providerContract;
        const evidence={programmeVersionId:programme.id,payrollId:payroll.id,instructionId:instructions.id,
          versionIds:{wallet:instructions.walletVersionId,disbursement:instructions.disbursementVersionId},
          sourceIds:{...(selected.evidenceSourceIds??{})}};
        if(selected.uploadInstructions===true){
          requireValue(selected.creatorAlias,'COMMISSIONING_DEPENDENCY_MISSING',{
            required:'Existing native SDP creator connection alias.',
          });
          const upload=await performSelected('payroll-instructions:'+instructions.id,{
            connectionAlias:selected.creatorAlias,action:contract.uploadAction,
            input:contract.uploadInput,fileId:instructions.fileId,
            evidence:await capabilitiesEvidence(selected.creatorAlias,evidence,'upload:'+instructions.id),
          });
          requireValue(upload.readback?.reconciliation?.matched,'ORIGINAL_BATCH_READBACK_REQUIRED');
          const ids=upload.readback.reconciliation.versionIds;
          const candidates=ids.map(id=>workspace.privateItem('resourceVersions',id))
            .filter(row=>row.kind==='sdp-disbursement');
          requireValue(candidates.length===1,'ORIGINAL_BATCH_VERSION_AMBIGUOUS');
          evidence.versionIds.disbursement=candidates[0].id;
        }
        if(selected.uploadInstructions===true||selected.startDisbursement===true){
          const alias=selected.creatorAlias??selected.approverAlias;
          const input={params:{id:contract.uploadInput.params.id}};
          const action='sdp.disbursement.instructions.download';
          const task={id:digest(bytes(['stored-instructions',instructions.id,alias,input])),
            connectionAlias:alias,action,input};
          const observed=await completeRead(task);
          const capture=workspace.privateItem('captures',observed.captureId);
          requireValue(capture.pages.length===1,'ORIGINAL_INSTRUCTION_DOWNLOAD_REQUIRED');
          const source=workspace.privateItem('sources',capture.pages[0].sourceId);
          const original=await workspace.fileBytes(source.responseFileId,{private:true});
          const generated=await workspace.fileBytes(instructions.fileId);
          requireValue(original.equals(generated),'PROVIDER_INSTRUCTION_BYTES_DIFFER',{
            sourceId:source.id,expectedSha256:digest(generated),actualSha256:digest(original),
          });
          results.push({action,sourceId:source.id,sha256:digest(original),
            bytes:original.length,exactOriginalInstructions:true});
        }
        if(selected.startDisbursement===true){
          requireValue(selected.approverAlias,'COMMISSIONING_DEPENDENCY_MISSING',{
            required:'Existing native SDP approver connection alias; SDP retains creator/approver separation.',
          });
          await performSelected('payroll-start:'+payroll.id,{
            connectionAlias:selected.approverAlias,action:contract.startAction,input:contract.startInput,
            evidence:await capabilitiesEvidence(selected.approverAlias,evidence,'start:'+instructions.id),
          });
        }
      }
      for(const [index,input]of (selected.operations??[]).entries()){
        const args={connectionAlias:input.connectionAlias,action:input.action,input:input.input??{},
          evidence:input.evidence??{}};
        if(input.usePayrollInstructions){
          requireValue(instructions,'COMMISSIONING_DEPENDENCY_MISSING',{required:'Original SDP instruction file.'});
          args.fileId=instructions.fileId;
          args.evidence={...args.evidence,programmeVersionId:programme.id,payrollId:payroll.id,
            instructionId:instructions.id,versionIds:{...(args.evidence.versionIds??{}),
              wallet:instructions.walletVersionId,disbursement:instructions.disbursementVersionId}};
        }
        await performSelected('additional:'+index,args);
      }
      return{results};
    });
    await phase('actual-signed-bridge-webhook-custody', async () => {
      // Inspect already-delivered original bytes. Provider delivery stays with the real endpoint.
      const prior = workspace.privateList('webhooks').filter(row => row.verified);
      const rows = [];
      for (const row of prior) {
        const body = await workspace.fileBytes(row.bodyFileId, { private: true });
        requireValue(digest(body) === row.rawSha256, 'ORIGINAL_WEBHOOK_BYTES_CHANGED');
        rows.push({ id: row.id, sha256: row.rawSha256, bytes: body.length,
          connectionAlias: row.connectionAlias, subscriptionId: row.subscriptionId });
      }
      return { verifiedOriginals: rows, legacyDeliveryFiles:
        (configuration.retainedWebhookDeliveries ?? []).length,
        coverage: rows.length ? 'Original accepted signed deliveries retained without replay.' :
          'No verified signed delivery is present in this installation.' };
    });

    let sdpEventInbox=null,sdpEventSelection=null;
    if(configuration.sdpEventInbox){
      sdpEventSelection=await phase('original-sdp-event-inbox-selection',async()=>{
        const selected=await importSource('lib/sdp-event-commissioning.mjs');
        sdpEventInbox=selected.createSDPEventInboxCommissioning({
          workspace,selection:configuration.sdpEventInbox,operationDirectory,
          signal:controller.signal,request,openBrowserContext,closeBrowserContext,
        });
        operatingOwners.add(sdpEventInbox);
        const result=await sdpEventInbox.select();
        commissioningSelections.sdpEventInbox={inputSha256:result.inputSha256};
        return result;
      });
      requireValue(sdpEventSelection, 'SDP_SELECTED_COMMISSIONING_INCOMPLETE');
    }

    let collection=null;
    if(payroll)collection=await phase('complete-original-read-only-collection',async()=>{
      const aliases=new Set(Object.values(programme.definition.connectionAliases).flat());
      const tasks=[...readTasks.values()].filter(task=>aliases.has(task.connectionAlias))
        .map(({id,connectionAlias,action,input,required})=>({id,connectionAlias,action,input,required}));
      requireValue(tasks.length,'COMMISSIONING_DEPENDENCY_MISSING',{required:'Actual selected programme source reads.'});
      const value=await request(workspace,'collection:'+programme.id+':'+digest(bytes(tasks)),'collection.save',{
        name:'Original payroll operating period',programmeVersionId:programme.id,payrollId:payroll.id,
        intervalSeconds:configuration.collectionIntervalSeconds??900,tasks,
      });
      const run=await request(workspace,'collection-run:'+value.id,'collection.run',{
        collectionId:value.id,maxPages:configuration.maxPagesPerPass??100,
      });
      let current=run;
      for(let pass=0;current.status==='RUNNING'&&pass<(configuration.maximumReadPasses??100);pass++){
        current=await request(workspace,'collection-continue:'+run.id+':'+current.passes.length,
          'run.continue',{runId:run.id,maxPages:configuration.maxPagesPerPass??100});
      }
      requireValue(current.status==='COMPLETE','ORIGINAL_COLLECTION_INCOMPLETE',{
        collectionId:value.id,runId:run.id,status:current.status,
      });
      // Scheduling remains a separate explicit installation selection.
      if(configuration.enableReadOnlyCollection===true)
        await request(workspace,'enable-collection:'+value.id,'collection.enable',{collectionId:value.id,enabled:true});
      return{...value,runId:current.id};
    });

    const editionSelection=digest(bytes({
      programme:programme?.id,payroll:payroll?.id,
      resources:workspace.privateList('resources').map(row=>[row.id,row.currentVersionId,row.conflict]),
      captures:workspace.privateList('captures').map(row=>[row.id,row.status,row.pages.length]),
      corrections:workspace.privateList('corrections').map(row=>row.id),
    }));
    const reconciliation=payroll?await phase('immutable-payroll-reconciliation',async()=>{
      return request(workspace,'payroll-reconciliation:'+editionSelection,'reconciliation.create',{
        programmeVersionId:programme.id,payrollId:payroll.id,
        name:'Original payroll operating period',...(collection?{runIds:[collection.runId]}:{}),
      });
    }):null;
    const report=reconciliation?await phase('complete-payroll-report-files',async()=>{
      const result=await request(workspace,'payroll-report:'+reconciliation.id,'report.create',{
        reconciliationId:reconciliation.id,name:'Payroll, SDP, Horizon and Bridge original observations',
      });
      requireValue(result.files.length===3,'COMPLETE_REPORT_MEMBERS_REQUIRED');
      for(const file of result.files)requireValue(digest(await workspace.fileBytes(file.id))===file.sha256,
        'ORIGINAL_REPORT_IDENTITY_MISMATCH');
      return result;
    }):null;
    await phase('actual-browser-original-response-recovery', async () => {
      const modulePath = configuration.playwrightModule;
      requireValue(modulePath && configuration.chromiumExecutable, 'COMMISSIONING_DEPENDENCY_MISSING',
        { required: 'Existing Playwright module and actual selected Chromium executable.' });
      const playwright = await import(pathToFileURL(path.resolve(modulePath)).href);
      const chromium = playwright.chromium ?? playwright.default?.chromium;
      browser = await track(chromium.launch({
        headless: true, executablePath: configuration.chromiumExecutable,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      }));
      controller.signal.throwIfAborted();
      const context = await openBrowserContext({ viewport: { width: 1440, height: 1000 } });
      let failure = null, result;
      try {
        const page = await operatorPage(context, originalServer), browserErrors = [];
        page.on('pageerror', error => browserErrors.push(error.message));
        const reviewed = [];
        for (const section of ['programmes','payrolls','collections','operations','captures','resources','reconciliations','reports','transfer']) {
          controller.signal.throwIfAborted();
          const tab = page.locator('nav [data-view="' + section + '"]');
          if (await tab.count()) { await tab.click(); reviewed.push(section); }
        }
        await page.locator('nav [data-view=settings]').click();
        const name = await page.locator('#profile-form input[name=name]').inputValue();
        requireValue(name === workspace.describe().workspace.name, 'ORIGINAL_BROWSER_WORKSPACE_CHANGED');
        await page.screenshot({ path: path.join(operationDirectory, 'original-operator.png'), fullPage: true });
        requireValue(!browserErrors.length, 'BROWSER_EXECUTION_ERROR', browserErrors);
        result = { workspaceId: workspace.describe().workspace.id, name, reviewed,
          behavior: 'Inspect the actual saved installation without creating a profile change.' };
      } catch (error) { failure = error; }
      finally {
        try { await closeBrowserContext(context); } catch (error) { failure ??= error; }
      }
      if (failure) throw failure;
      return result;
    });

    await phase('actual-browser-original-file-recovery', async () => {
      requireValue(browser, 'COMMISSIONING_DEPENDENCY_MISSING', { required: 'The existing original browser runtime.' });
      const available = workspace.privateList('sources').filter(row => row.bodyComplete);
      const source = available.find(row => row.downloadableFileId || row.publicFileId) ?? available[0];
      if (!source) return { sources: 0, coverage: 'No complete original source is present yet.' };
      const context = await openBrowserContext({ viewport: { width: 1440, height: 1000 } });
      let failure = null, result;
      try {
        // Headless operators use the application's ordinary download fallback.
        await context.addInitScript(() => {
          Object.defineProperty(globalThis, 'showSaveFilePicker', { value: undefined, configurable: true });
        });
        const page = await operatorPage(context, originalServer);
        const detail = await openRecord(page, 'sources', source.id);
        if (source.bodySha256) requireValue((await detail.textContent()).includes(source.bodySha256),
          'ORIGINAL_BROWSER_SOURCE_CHANGED');
        const fileId = source.downloadableFileId ?? source.publicFileId;
        let downloaded = null;
        if (fileId) {
          const descriptor = workspace.file(fileId);
          downloaded = await downloadFile(page, detail.getByRole('button', {
            name: source.downloadableFileId ? 'Download complete statement' : 'Download public source', exact: true,
          }), descriptor, 'source:' + source.id);
        }
        result = { sourceId: source.id, bodySha256: source.bodySha256, downloaded,
          privateBody: source.privateBody, completeOriginalRetained: true };
      } catch (error) { failure = error; }
      finally {
        try { await closeBrowserContext(context); } catch (error) { failure ??= error; }
      }
      if (failure) throw failure;
      return result;
    });

    const sdpEventOperated = sdpEventInbox && sdpEventSelection ? await phase('actual-sdp-event-inbox-operation',async()=>{
      const result=await sdpEventInbox.operate({browser,server:originalServer});
      commissioningSelections.sdpEventInbox={
        inputSha256:result.inputSha256,resultSha256:digest(bytes(result)),
        observationFileId:result.retainedObservation.file.id,
        commands:result.commands.map(row=>row.native.id),
      };
      return result;
    }) : null;
    if (configuration.sdpEventInbox) requireValue(sdpEventOperated, 'SDP_SELECTED_COMMISSIONING_INCOMPLETE');

    if(payroll)await phase('actual-browser-payroll-file-recovery',async()=>{
      requireValue(browser, 'COMMISSIONING_DEPENDENCY_MISSING', { required: 'Existing original browser runtime.' });
      const context = await openBrowserContext({ viewport: { width: 1440, height: 1000 } });
      let failure = null, result;
      try {
        await context.addInitScript(() => {
          Object.defineProperty(globalThis, 'showSaveFilePicker', { value: undefined, configurable: true });
        });
        const page = await operatorPage(context, originalServer);
        const detail = await openRecord(page, 'payrolls', payroll.id);
        requireValue((await detail.textContent()).includes(programme.id), 'ORIGINAL_BROWSER_PAYROLL_CHANGED');
        const source = workspace.privateItem('sources', payroll.sourceId);
        const original = await workspace.fileBytes(payroll.fileId, { private: true });
        requireValue(source.bodySha256 === digest(original), 'ORIGINAL_PAYROLL_FILE_HASH_CHANGED');
        const downloads = [];
        for (const instruction of workspace.privateList('instructions').filter(row => row.payrollId === payroll.id)) {
          const current = await openRecord(page, 'instructions', instruction.id);
          const file = instruction.file ?? (instruction.fileId ? workspace.file(instruction.fileId) : null);
          if (file && file.private !== true) downloads.push(await downloadFile(page,
            current.getByRole('button', { name: 'Download', exact: true }).first(), file,
            'instruction:' + instruction.id));
        }
        result = { payrollId: payroll.id, sourceId: source.id, programmeVersionId: programme.id,
          sha256: source.bodySha256, rows: payroll.data.rows.length, downloads };
      } catch (error) { failure = error; }
      finally {
        try { await closeBrowserContext(context); } catch (error) { failure ??= error; }
      }
      if (failure) throw failure;
      return result;
    });

    let bridgeCommissioning = null;
    if (configuration.bridgeIntake) {
      bridgeCommissioning = await phase('actual-retained-bridge-intake', async () => {
        const module = await importSource('lib/bridge-commissioning.mjs');
        const owner = module.createBridgeCommissioning({workspace, operationDirectory,
          selection: configuration.bridgeIntake, signal: controller.signal});
        operatingOwners.add(owner);
        let result, first;
        try {
          result = await owner.produce();
          commissioningSelections.bridge = {
            selectionSha256: result.selectionSha256,
            originalWorkspaceId: result.originalWorkspaceId,
            requests: result.requests, files: result.files,
          };
        } catch(error) { first=error; }
        try { await owner.close(); operatingOwners.delete(owner); }
        catch(error) { first ??= error; }
        if(first)throw first;
        return result;
      });
      requireValue(bridgeCommissioning, 'BRIDGE_SELECTED_COMMISSIONING_INCOMPLETE');
      if (configuration.bridgeIntake.browser) await phase('actual-bridge-desk-original-records', async () => {
        requireValue(browser, 'COMMISSIONING_DEPENDENCY_MISSING', {required:'The selected original browser runtime.'});
        const module = await importSource('lib/bridge-commissioning.mjs');
        const owner = module.createBridgeCommissioning({workspace, operationDirectory,
          selection: configuration.bridgeIntake, signal: controller.signal});
        operatingOwners.add(owner);
        let result, first;
        try {
          result = await owner.observeBrowser({server:originalServer,
            openContext:openBrowserContext, closeContext:closeBrowserContext,
            original:bridgeCommissioning, phase:'original'});
        } catch(error) { first=error; }
        try { await owner.close(); operatingOwners.delete(owner); }
        catch(error) { first ??= error; }
        if(first)throw first;
        return result;
      });
    } else {
      await phase('actual-retained-bridge-intake', async () => ({
        status:'NOT_SELECTED', providerRequests:0, domainWrites:0,
        reason:'No actual retained Bridge review or incident decision was selected.',
      }));
    }

    let exported = null, received = null;
    // Producing operator stages run before this immutable full-workspace selection.
    const workspaceExportSelection = digest(bytes({ editionSelection, commissioningSelections }));
    if (runtime) exported = await phase('full-private-source-runtime-workspace-export', async () => {
      return request(workspace, 'workspace-export:' + receipt.source.sha256 + ':' + workspaceExportSelection,
        'workspace.export', { destination: path.join(operationDirectory, 'deliveries', receipt.source.sha256, workspaceExportSelection) });
    });
    if (exported) {
      const archiveFile = path.join(operationDirectory, 'archives', exported.manifestSha256 + '.tar.gz');
      const unpacked = await phase('stream-complete-delivery-and-independent-unpack', async () => {
        await mkdir(path.dirname(archiveFile));
        let existing;
        try { existing = await fs.stat(archiveFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (!existing) {
          const temporary = archiveFile + '.pending-' + randomUUID();
          let source = null, target = null, failure = null, published = false;
          try {
            source = await api.archive.streamBloccpayDelivery({
              sourceDirectory: exported.directory, expectedManifestSha256: exported.manifestSha256,
              signal: controller.signal,
            });
            target = createWriteStream(temporary, { flags: 'wx', mode: 0o600 });
            await pipeline(source, target, { signal: controller.signal });
            await fs.rename(temporary, archiveFile); published = true;
          } catch (error) { failure = error; }
          finally {
            for (const stream of [source, target].filter(Boolean)) {
              stream.destroy();
              try { await finished(stream, { cleanup: true }); } catch (error) { failure ??= error; }
            }
            if (source?.completion) {
              try { await source.completion; } catch (error) { failure ??= error; }
            }
            if (!published) {
              try { await fs.unlink(temporary); } catch (error) { if (error.code !== 'ENOENT') failure ??= error; }
            }
          }
          if (failure) throw failure;
        }
        const input = createReadStream(archiveFile);
        let output, failure = null;
        try {
          output = await api.archive.unpackBloccpayDelivery({
            input, destination: path.join(operationDirectory, 'unpacked', exported.manifestSha256),
            expectedManifestSha256: exported.manifestSha256, signal: controller.signal,
          });
        } catch (error) { failure = error; }
        finally {
          input.destroy();
          try { await finished(input, { cleanup: true }); }
          catch (error) { if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE' || !output) failure ??= error; }
        }
        if (failure) throw failure;
        return { directory: output.directory, manifestSha256: output.manifestSha256,
          files: output.fileCount, archiveFile, archiveBytes: (await fs.stat(archiveFile)).size };
      });
      if (unpacked) received = await phase('independent-original-installation-receiving', async () => {
        const selected = await api.receiving.receiveBloccpayDelivery({
          sourceDirectory: unpacked.directory,
          destination: path.join(operationDirectory, 'received', exported.manifestSha256),
          expectedManifestSha256: exported.manifestSha256,
          requestId: 'receive-' + exported.manifestSha256,
        });
        requireValue(selected.workspace.id !== workspace.describe().workspace.id,
          'RECEIVED_INSTALLATION_IDENTITY_NOT_DISTINCT');
        requireValue(selected.dispatchEnabled === false, 'RECEIVED_DISPATCH_NOT_PAUSED');
        const native = await runChild(selected.runtime.nodeExecutable, [selected.application.cli,
          'describe', '--directory', selected.workspace.directory]);
        requireValue(native.code === 0, 'RECEIVED_NATIVE_CLI_FAILED', native);
        const state = JSON.parse(native.stdout);
        requireValue(state.workspace.dispatchEnabled === false, 'RECEIVED_PROVIDER_DISPATCH_ENABLED');
        return { ...selected, native };
      });
      if (received) await phase('received-operator-and-original-history-reopen', async () => {
        const restoredServerModule = await import(pathToFileURL(received.application.server).href);
        receivedServer = await startHost(restoredServerModule, {
          directory: received.workspace.directory, sourceDirectory: received.application.directory,
          configuration: { ...configuration, connections: configuration.connections ?? {}, collections: { enabled: false },
            webhookProjection: { ...configuration.webhookProjection, enabled: false } },
          runtimeDirectory: received.runtime.directory,
          expectedManifestSha256: received.runtime.manifestSha256,
          port: 0,
        }, 'received');
        const response = await fetch(receivedServer.startup.origin + '/api/bootstrap', {
          headers: { authorization: 'Bearer ' + receivedServer.token }, signal: controller.signal,
        });
        requireValue(response.ok, 'RECEIVED_HTTP_FAILED');
        const body = await response.json();
        requireValue(body.workspace.id === received.workspace.id && !body.workspace.dispatchEnabled,
          'RECEIVED_WORKSPACE_IDENTITY_FAILED');
        for (const table of ['programmes','payrolls','instructions','collections','runs','resources','resourceVersions','sources','webhooks','reports']) {
          // The sealed delivery validates the complete snapshot. The live source may have later rows.
          const originalIds = new Set(workspace.privateList(table).map(row => row.id));
          requireValue(receivedServer.workspace.privateList(table).every(row => originalIds.has(row.id)),
            'RECEIVED_ORIGINAL_IDENTITY_CHANGED', { table });
        }
        if (browser) {
          const context = await openBrowserContext({ viewport: { width: 1440, height: 1000 } });
          let failure = null;
          try {
            const page = await operatorPage(context, receivedServer);
            const reports = page.locator('nav [data-view=reports]');
            await reports.waitFor(); await reports.click();
            await page.screenshot({ path: path.join(operationDirectory, 'received-operator.png'), fullPage: true });
          } catch (error) { failure = error; }
          finally {
            try { await closeBrowserContext(context); } catch (error) { failure ??= error; }
          }
          if (failure) throw failure;
        }
        if(sdpEventInbox&&commissioningSelections.sdpEventInbox?.resultSha256){
          await phase('received-sdp-event-inbox-observation',()=>sdpEventInbox.receive({
            browser,server:receivedServer,
          }));
        }
        return { startup: receivedServer.startup, originalHistoryPreserved: true,
          reports: body.summary.reports, independentWorkspaceId: body.workspace.id,
          collectionDispatchPaused:receivedServer.workspace.privateList('collections').every(row=>!row.enabled) };
      });
    }
    if (bridgeCommissioning) await phase('received-original-bridge-evidence', async () => {
      requireValue(received && receivedServer, 'COMMISSIONING_DEPENDENCY_MISSING',
        {required:'The original independent full-workspace receiving and its actual host.'});
      const module = await import(pathToFileURL(path.join(received.application.directory,
        'lib/bridge-commissioning.mjs')).href);
      const owner = module.createBridgeCommissioning({workspace:receivedServer.workspace,
        operationDirectory, selection:configuration.bridgeIntake, signal:controller.signal});
      operatingOwners.add(owner);
      let result, first;
      try {
        const inspected = await owner.receive(bridgeCommissioning);
        let observation = null;
        if (configuration.bridgeIntake.browser) {
          requireValue(browser, 'COMMISSIONING_DEPENDENCY_MISSING', {required:'The selected original browser runtime.'});
          observation = await owner.observeBrowser({server:receivedServer,
            openContext:openBrowserContext, closeContext:closeBrowserContext,
            original:bridgeCommissioning, phase:'received'});
        }
        result = {inspection:inspected, browser:observation};
      } catch(error) { first=error; }
      try { await owner.close(); operatingOwners.delete(owner); }
      catch(error) { first ??= error; }
      if(first)throw first;
      return result;
    });
    if (report) await phase('scoped-report-export-and-independent-receive', async () => {
      const selected = await request(workspace, 'report-export:' + report.id, 'report.export', {
        reportId: report.id, destination: path.join(operationDirectory, 'report-deliveries', report.id),
      });
      const result = await api.receiving.receiveBloccpayDelivery({
        sourceDirectory: selected.directory, expectedManifestSha256: selected.manifestSha256,
        destination: path.join(operationDirectory, 'received-reports', report.id),
        requestId: 'receive-report-' + report.id,
      });
      requireValue(result.kind === 'report' && !result.workspace && !result.runtime,
        'SCOPED_REPORT_CONTAINS_PRIVATE_WORKSPACE');
      return result;
    });
    receipt.finishedAt = date();
    receipt.status = receipt.phases.some(item => item.status === 'FAILED') ? 'PARTIAL' :
      receipt.phases.some(item => item.status === 'BLOCKED') ? 'AWAITING_ORIGINAL_DEPENDENCIES' : 'COMPLETE';
    return receipt;
  } catch (error) {
    firstError ??= error;
    throw error;
  } finally {
    try { await close(); }
    catch (closeError) {
      const failure = firstError ?? closeError;
      if (failure !== closeError) failure.closeError = closeError;
      failure.close = close;
      failure.commissioningOwner = commissionOwner;
      throw failure;
    }
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = flags(process.argv.slice(2));
  const configuration = args.configuration ? await read(path.resolve(args.configuration)) : {};
  commissionBloccpay(configuration, {
    operationDirectory: args['operation-directory'],
    sourceDirectory: args['source-directory'],
    packetFile: args.packet,
    packetSha256: args['packet-sha256'],
    port: args.port,
  }).then(result => {
    process.stdout.write(JSON.stringify({
      operation: result.operation, status: result.status,
      phases: result.phases.map(({ name, status }) => ({ name, status })),
      resultFile: path.join(path.resolve(args['operation-directory']), 'latest-result.private.json'),
    }) + '\n');
    if (result.status === 'PARTIAL') process.exitCode = 1;
  }).catch(async error => {
    let cleanupError = null;
    if (typeof error.close === 'function') {
      try { await error.close(); } catch (failure) { cleanupError = failure; }
    }
    process.stderr.write(JSON.stringify({
      error: { code: error.code ?? 'NATIVE_ERROR', message: error.message },
      ...(cleanupError ? { cleanupError: { code: cleanupError.code ?? 'CLOSE_UNCERTAIN',
        message: cleanupError.message }, owner: error.commissioningOwner?.inspect() ?? null } : {}),
    }) + '\n');
    process.exitCode = 1;
  });
}
