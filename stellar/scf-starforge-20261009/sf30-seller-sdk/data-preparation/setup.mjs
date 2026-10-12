// MIT. Configure the existing merchant host around original preparation workspace aliases.
import {mkdir, lstat} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {acquirePrivateDirectoryWriter} from '../operations/history.mjs';
import {initReleaseStore, readReleaseState} from '../../sf82-seller-pilot/releases.mjs';
import {readPreparationWorkspaceConfiguration} from './mcp.mjs';
import {preparationExact, preparationNeed, preparationAbsolute, preparationPrivateDirectory, preparationReadJson, preparationWriteJson} from './connection.mjs';

const CONFIG_SCHEMA = 'stellar-forge.merchant-mcp.v1';
async function directory(path) {
  try { await mkdir(path,{mode:0o700}); }
  catch (error) { if(error.code !== 'EEXIST') throw error; }
  return preparationPrivateDirectory(path);
}
export async function initializePreparationWorkspaceMerchant(options) {
  preparationExact(options,['directory','connection','name'],['directory','connection']);
  preparationNeed(typeof options.directory === 'string' && options.directory.length > 0 &&
    typeof options.connection === 'string' && options.connection.length > 0,
  'PREPARATION_CONFIGURATION_INVALID','Choose the merchant directory and original preparation connection configuration.');
  const root = preparationAbsolute(resolve(options.directory)), connection = preparationAbsolute(resolve(options.connection));
  const name = options.name ?? 'Starforge preparation data operator';
  preparationNeed(typeof name === 'string' && name.trim() === name && name.length > 0 && name.length <= 240 &&
    !/[\x00-\x1f\x7f]/.test(name), 'PREPARATION_CONFIGURATION_INVALID','Use a readable merchant name.');
  const selected = await readPreparationWorkspaceConfiguration(connection);
  preparationNeed(Object.values(selected.workspaces).every(item => item.directory !== root),
    'PREPARATION_MERCHANT_DIRECTORY_CONFLICT','Give the merchant host its own private directory beside the original preparation workspace.');
  await preparationPrivateDirectory(dirname(root)); await directory(root);
  const lease = await acquirePrivateDirectoryWriter(root);
  try {
    const configuration = join(root,'merchant-mcp.json');
    const value = {schema:CONFIG_SCHEMA,name,releaseStore:'./releases',
      exportsDirectory:'./customer-exports',sources:{},preparationWorkspaceConnection:connection};
    let prior;
    try { prior = await preparationReadJson(configuration); }
    catch (error) { if(error.code !== 'ENOENT') throw error; }
    if (prior) preparationNeed(JSON.stringify(prior.value) === JSON.stringify(value),
      'PREPARATION_MERCHANT_CONFIGURATION_CHANGED','This merchant directory belongs to different configured input.',409);
    const releases = join(root,'releases');
    let existing;
    try { existing = await lstat(releases); }
    catch (error) { if(error.code !== 'ENOENT') throw error; }
    if (existing) { await preparationPrivateDirectory(releases); await readReleaseState(releases); }
    else await initReleaseStore(releases);
    await directory(join(root,'customer-exports'));
    if (!prior) await preparationWriteJson(configuration,value);
    await (await import('../../../../stellar-forge/mcp-merchant-operator/config.mjs')).readMerchantConfig(configuration);
    return {schema:CONFIG_SCHEMA,configuration,state:'INITIALIZED',reused:Boolean(prior),
      preparationWorkspacesConfigured:true,connectionSha256:selected.sha256,
      workspaces:Object.entries(selected.workspaces).map(([workspace,item]) => ({workspace,label:item.label})),
      authoring:'ORIGINAL_APPLICATION_LISTENER'};
  } finally { await lease.release(); }
}
