// MIT. Configure the existing merchant host around original Rumble workspace aliases.
import {mkdir, lstat} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {acquirePrivateDirectoryWriter} from '../../../sf30-seller-sdk/operations/history.mjs';
import {initReleaseStore, readReleaseState} from '../../../sf82-seller-pilot/releases.mjs';
import {readRumbleWorkspaceConfiguration} from './mcp.mjs';
import {rumbleExact, rumbleNeed, rumbleAbsolute, rumblePrivateDirectory, rumbleReadPrivateJson, rumbleWritePrivateJson} from './connection.mjs';

const CONFIG_SCHEMA = 'stellar-forge.merchant-mcp.v1';
async function directory(path) {
  try { await mkdir(path,{mode:0o700}); }
  catch (error) { if(error.code !== 'EEXIST') throw error; }
  return rumblePrivateDirectory(path);
}
export async function initializeRumbleWorkspaceMerchant(options) {
  rumbleExact(options,['directory','connection','name'],['directory','connection']);
  rumbleNeed(typeof options.directory === 'string' && options.directory.length > 0 &&
    typeof options.connection === 'string' && options.connection.length > 0,
  'RUMBLE_CONFIGURATION_INVALID','Choose the merchant directory and original Rumble connection configuration.');
  const root = rumbleAbsolute(resolve(options.directory)), connection = rumbleAbsolute(resolve(options.connection));
  const name = options.name ?? 'Starforge Rumble data operator';
  rumbleNeed(typeof name === 'string' && name.trim() === name && name.length > 0 && name.length <= 240 &&
    !/[\x00-\x1f\x7f]/.test(name), 'RUMBLE_CONFIGURATION_INVALID','Use a readable merchant name.');
  const selected = await readRumbleWorkspaceConfiguration(connection);
  rumbleNeed(Object.values(selected.workspaces).every(item => item.directory !== root),
    'RUMBLE_MERCHANT_DIRECTORY_CONFLICT','Give the merchant host its own private directory beside the original Rumble workspace.');
  await rumblePrivateDirectory(dirname(root)); await directory(root);
  const lease = await acquirePrivateDirectoryWriter(root);
  try {
    const configuration = join(root,'merchant-mcp.json');
    const value = {schema:CONFIG_SCHEMA,name,releaseStore:'./releases',
      exportsDirectory:'./customer-exports',sources:{},rumbleWorkspaceConnection:connection};
    let prior;
    try { prior = await rumbleReadPrivateJson(configuration); }
    catch (error) { if(error.code !== 'ENOENT') throw error; }
    if (prior) rumbleNeed(JSON.stringify(prior.value) === JSON.stringify(value),
      'RUMBLE_MERCHANT_CONFIGURATION_CHANGED','This merchant directory belongs to different configured input.',409);
    const releases = join(root,'releases');
    let existing;
    try { existing = await lstat(releases); }
    catch (error) { if(error.code !== 'ENOENT') throw error; }
    if (existing) { await rumblePrivateDirectory(releases); await readReleaseState(releases); }
    else await initReleaseStore(releases);
    await directory(join(root,'customer-exports'));
    if (!prior) await rumbleWritePrivateJson(configuration,value);
    await (await import('../../../../../stellar-forge/mcp-merchant-operator/config.mjs')).readMerchantConfig(configuration);
    return {schema:CONFIG_SCHEMA,configuration,state:'INITIALIZED',reused:Boolean(prior),
      rumbleWorkspacesConfigured:true,connectionSha256:selected.sha256,
      workspaces:Object.entries(selected.workspaces).map(([workspace,item]) => ({workspace,label:item.label})),
      authoring:'ORIGINAL_APPLICATION_LISTENER'};
  } finally { await lease.release(); }
}
