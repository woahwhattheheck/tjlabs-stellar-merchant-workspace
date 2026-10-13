// MIT License. Review the original merchant configuration and its selected files.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { canonicalJson } from './protocol.mjs';
import { fileBinding } from './fulfillment/file-delivery.mjs';

export const MERCHANT_INPUT_SCHEMA = 'stellar-forge.merchant-application-inputs.v1';
const hash = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function need(value, code) { if (!value) throw Object.assign(new Error(code), { code }); }
function absolute(value) {
  need(typeof value === 'string' && isAbsolute(value) && resolve(value) === value && !value.includes('\0'),
    'MERCHANT_APPLICATION_ABSOLUTE_INPUT_REQUIRED');
  return value;
}
export function merchantInputFiles(value = []) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); }
    catch { need(false, 'MERCHANT_APPLICATION_INPUT_FILES_INVALID'); }
  }
  need(Array.isArray(value) && value.length <= 32, 'MERCHANT_APPLICATION_INPUT_FILES_INVALID');
  const paths = value.map(absolute);
  need(new Set(paths).size === paths.length, 'MERCHANT_APPLICATION_INPUT_FILES_DUPLICATE');
  return paths.sort();
}
export async function readMerchantInput(path, { maximum = 4 * 1024 * 1024, collect = false, privateOnly = false } = {}) {
  absolute(path);
  need(await realpath(dirname(path)) === dirname(path), 'MERCHANT_APPLICATION_REAL_INPUT_REQUIRED');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    need(before.isFile() && before.size <= maximum, 'MERCHANT_APPLICATION_REGULAR_INPUT_REQUIRED');
    if (privateOnly) need(before.nlink === 1 && !(before.mode & 0o077) &&
      (process.getuid === undefined || before.uid === process.getuid()), 'MERCHANT_APPLICATION_PRIVATE_CONFIG_REQUIRED');
    const digest = createHash('sha256'), chunks = [];
    const buffer = Buffer.allocUnsafe(65536); let bytes = 0;
    while (bytes < before.size) {
      const current = await handle.read(buffer, 0, Math.min(buffer.length, before.size - bytes), bytes);
      need(current.bytesRead > 0, 'MERCHANT_APPLICATION_INPUT_CHANGED');
      const chunk = buffer.subarray(0, current.bytesRead);
      digest.update(chunk); if (collect) chunks.push(Buffer.from(chunk)); bytes += chunk.length;
    }
    const extra = await handle.read(buffer, 0, 1, bytes), after = await handle.stat();
    need(extra.bytesRead === 0 && bytes === before.size && after.size === before.size &&
      after.dev === before.dev && after.ino === before.ino && after.mtimeMs === before.mtimeMs &&
      after.ctimeMs === before.ctimeMs, 'MERCHANT_APPLICATION_INPUT_CHANGED');
    return { descriptor: { path, bytes, sha256: digest.digest('hex') },
      ...(collect ? { raw: Buffer.concat(chunks) } : {}) };
  } finally { await handle.close(); }
}
function parse(raw, code) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { need(false, code); }
}

/** Read each configured source once; catalog discovery never loads a customer handler. */
export async function reviewMerchantInputs(configurationFile, {
  inputFiles = [], allowLoopback = false, validateConfig,
} = {}) {
  need(typeof validateConfig === 'function', 'MERCHANT_APPLICATION_CONFIG_VALIDATOR_REQUIRED');
  const files = new Map();
  const retain = async (path, options) => {
    const previous = files.get(path);
    if (previous) return previous;
    const value = await readMerchantInput(path, options); files.set(path, value); return value;
  };
  const selected = await retain(absolute(configurationFile), { maximum: 1048576, collect: true, privateOnly: true });
  const config = validateConfig(parse(selected.raw, 'MERCHANT_APPLICATION_CONFIG_JSON_REQUIRED'), { allowLoopback });
  need(typeof config.fulfillmentModule === 'string' && config.fulfillmentModule.length > 0,
    'MERCHANT_APPLICATION_FULFILLMENT_MODULE_REQUIRED');
  const modulePath = resolve(dirname(configurationFile), config.fulfillmentModule);
  await retain(modulePath);
  const declaredFiles = [];
  const manifestName = config.fulfillmentOptions?.manifest;
  if (manifestName !== undefined) {
    need(typeof manifestName === 'string' && manifestName.length > 0, 'MERCHANT_APPLICATION_MANIFEST_PATH_INVALID');
    const manifestPath = resolve(dirname(configurationFile), manifestName);
    const manifestSource = await retain(manifestPath, { maximum: 1048576, collect: true });
    const manifest = parse(manifestSource.raw, 'MERCHANT_APPLICATION_MANIFEST_JSON_REQUIRED');
    if (manifest?.schema === 'stellar-forge.merchant-file-delivery.v1') {
      need(object(manifest.files) && Object.keys(manifest.files).length > 0, 'MERCHANT_APPLICATION_DELIVERY_FILES_REQUIRED');
      for (const [binding, entry] of Object.entries(manifest.files)) {
        need(object(entry) && typeof entry.path === 'string' && binding === fileBinding(entry),
          'MERCHANT_APPLICATION_DELIVERY_BINDING_CHANGED');
        const path = resolve(dirname(manifestPath), entry.path);
        const observed = await retain(path, { maximum: 1024 * 1024 * 1024 });
        need(observed.descriptor.bytes === entry.bytes && observed.descriptor.sha256 === entry.sha256,
          'MERCHANT_APPLICATION_DELIVERY_FILE_CHANGED');
        declaredFiles.push({ binding, ...observed.descriptor });
      }
      need(Object.hasOwn(manifest.files, config.fulfillmentBinding), 'MERCHANT_APPLICATION_DELIVERY_EDITION_REQUIRED');
    }
  }
  for (const path of merchantInputFiles(inputFiles)) await retain(path);
  const descriptors = [...files.values()].map(value => value.descriptor).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const inputs = { schema: MERCHANT_INPUT_SCHEMA, configurationFile, modulePath, files: descriptors,
    deliveryFiles: declaredFiles.sort((a, b) => a.binding < b.binding ? -1 : a.binding > b.binding ? 1 : 0) };
  return { config, rawConfig: selected.raw, inputs, inputsSha256: hash(canonicalJson(inputs)),
    configSha256: selected.descriptor.sha256, inputPaths: descriptors.map(value => value.path) };
}

export function verifyMerchantInputFingerprint(value, expected) {
  need(typeof expected === 'string' && /^[0-9a-f]{64}$/.test(expected) && value.inputsSha256 === expected,
    'REVIEWED_MERCHANT_INPUTS_CHANGED');
  return value;
}
