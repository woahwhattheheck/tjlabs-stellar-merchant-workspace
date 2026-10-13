// MIT. Replayable native merchant setup using the original release-store initializer.
import { readdir, lstat, rename, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CONFIG_SCHEMA, readMerchantConfig } from '../../stellar-forge/mcp-merchant-operator/config.mjs';
import { writePrivate, failure, line } from '../../stellar-forge/mcp-merchant-operator/host-files.mjs';
import { initReleaseStore, readReleaseState } from '../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs';
import { privateDirectory, withPrivateLock, atomicJson, readPrivateJson } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/routescan/quota.mjs';
import { canonical as canonicalJson } from './agent-io.mjs';
import { readHarbourConfiguration } from './agent-client.mjs';

const SETUP = 'stellar-forge.harbour-source-native-setup.v1';
const need = (value, message) => { if (!value) throw failure('HARBOUR_SERIES_SETUP_CONFLICT', message); };
async function optional(path, maximum = 1024 * 1024) {
  try { return await readPrivateJson(path, maximum); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function directorySync(path) {
  let handle;
  try { handle = await open(path, 'r'); await handle.sync(); }
  catch(error) { if (!['EINVAL','EPERM','EISDIR','ENOTSUP'].includes(error.code)) throw error; }
  finally { await handle?.close(); }
}
async function exactConfiguration(path, value) {
  const found = await optional(path);
  if (found) { need(canonicalJson(found) === canonicalJson(value), 'The original native merchant configuration changed.'); return; }
  try { await writePrivate(path, value); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    need(canonicalJson(await optional(path)) === canonicalJson(value), 'Another setup selected a different native merchant configuration.');
  }
}
export async function initializeHarbourMerchant({
  directory, connection, name = 'Starforge harbour source workspace', releaseStore,
} = {}) {
  need(typeof directory === 'string' && directory && typeof connection === 'string' && connection,
    'Supply the native merchant directory and original private workspace connection file.');
  name = line(name, 'Native merchant name');
  const root = resolve(directory), selectedConnection = resolve(connection);
  const selected = await readHarbourConfiguration(selectedConnection);
  const binding = { schema: SETUP, name, connection: selectedConnection,
    releaseStore: releaseStore ? resolve(releaseStore) : null };
  await privateDirectory(root);
  return withPrivateLock(root, 'harbour-source-setup.lock', async () => {
    let intent = await optional(join(root, 'harbour-source-setup.json'), 1024 * 1024);
    if (intent) need(canonicalJson(intent.binding) === canonicalJson(binding),
      'This original setup belongs to another selected host configuration.');
    else {
      need((await readdir(root)).every(name => name === 'harbour-source-setup.lock'),
        'Initialize a new empty native merchant directory or replay its original setup.');
      intent = { binding, attempts: [] };
      await atomicJson(root, 'harbour-source-setup.json', intent);
    }
    const store = binding.releaseStore ?? join(root, 'releases');
    if (binding.releaseStore) await readReleaseState(store);
    else {
      let info;
      try { info = await lstat(store); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (info) {
        need(info.isDirectory() && !info.isSymbolicLink(), 'Keep the original release store directory.');
        await readReleaseState(store);
      } else {
        let stage = intent.attempts.at(-1)?.directory, ready = false;
        if (stage) {
          try { await readReleaseState(stage); ready = true; }
          catch (error) {
            intent.attempts.at(-1).interrupted = true;
            intent.attempts.at(-1).lastError = { code: String(error.code ?? 'RELEASE_SETUP_ERROR'),
              message: String(error.message ?? 'Release-store setup was interrupted.') };
            await atomicJson(root, 'harbour-source-setup.json', intent);
          }
        }
        if (!ready) {
          stage = join(root, 'release-store-preparing-' + randomUUID());
          intent.attempts.push({ directory: stage, startedAt: new Date().toISOString() });
          await atomicJson(root, 'harbour-source-setup.json', intent);
          await initReleaseStore(stage);
        }
        await privateDirectory(join(stage, 'releases'));
        await rename(stage, store); await directorySync(root);
        await readReleaseState(store);
      }
    }
    await privateDirectory(join(root, 'customer-exports'));
    const configuration = join(root, 'merchant-mcp.json');
    const config = { schema: CONFIG_SCHEMA, name,
      releaseStore: binding.releaseStore ?? './releases',
      exportsDirectory: './customer-exports', sources: {}, harbourSourceConnection: selectedConnection };
    await exactConfiguration(configuration, config); await directorySync(root);
    await readMerchantConfig(configuration);
    const result = { schema: CONFIG_SCHEMA, configuration, state: 'INITIALIZED',
      harbourSourceConfigured: true,
      workspaces: Object.entries(selected.workspaces).map(([workspace, item]) =>
        ({ workspace, label: item.label, inputs: Object.keys(item.inputs) })),
      hostOwnership: 'ORIGINAL_HARBOUR_SERIES_WORKSPACES' };
    await atomicJson(root, 'harbour-source-setup-result.json', result);
    return result;
  });
}
