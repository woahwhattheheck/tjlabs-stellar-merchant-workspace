// MIT. Host-only setup for a dedicated original whole-host handoff operator.
import { mkdir, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { exact, line, writePrivate, failure } from '../../../../stellar-forge/mcp-merchant-operator/host-files.mjs';
import { CONFIG_SCHEMA, readMerchantConfig } from '../../../../stellar-forge/mcp-merchant-operator/config.mjs';
import { initReleaseStore } from '../../sf82-seller-pilot/releases.mjs';
import { readHostHandoffMerchantConfiguration } from './host-handoff-merchant.mjs';

async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await handle.sync(); }
  finally { await handle.close(); }
}

export async function initializeHostHandoffMerchant(options = {}) {
  exact(options, ['directory', 'connection', 'name'], ['directory', 'connection']);
  for (const key of ['directory', 'connection'])
    if (typeof options[key] !== 'string' || !isAbsolute(options[key]) || resolve(options[key]) !== options[key])
      throw failure('CONFIGURATION_ERROR', key + ' must be a normalized absolute host path.');
  const root = options.directory, hostHandoffConnection = options.connection;
  const name = line(options.name ?? 'Starforge whole-host handoffs', 'Merchant name');
  const releaseStore = join(root, 'releases'), exportsDirectory = join(root, 'customer-exports');
  // Check complete source/receiving custody before creating any operator state.
  const selected = await readHostHandoffMerchantConfiguration(hostHandoffConnection, {
    operatorDirectory: root, releaseStore, exportsDirectory
  });
  await mkdir(root, { mode: 0o700 });
  await initReleaseStore(releaseStore);
  await mkdir(exportsDirectory, { mode: 0o700 });
  const configuration = join(root, 'merchant-mcp.json');
  await writePrivate(configuration, {
    schema: CONFIG_SCHEMA, name, releaseStore: './releases',
    exportsDirectory: './customer-exports', sources: {}, hostHandoffConnection
  });
  await readMerchantConfig(configuration);
  // Persist the new config and both new directory entries before reporting success.
  await syncDirectory(exportsDirectory);
  await syncDirectory(root);
  await syncDirectory(dirname(root));
  return {
    schema: CONFIG_SCHEMA, configuration, state: 'INITIALIZED', hostHandoffsConfigured: true,
    ownership: 'ORIGINAL_WHOLE_HOST_HANDOFF',
    hosts: Object.entries(selected.hosts).map(([host, value]) => ({
      host, label: value.label, source: Boolean(value.selectionFile), receiving: Boolean(value.restoreDirectory)
    }))
  };
}
