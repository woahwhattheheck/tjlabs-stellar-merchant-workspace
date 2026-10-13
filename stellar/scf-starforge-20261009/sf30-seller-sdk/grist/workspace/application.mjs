// MIT. Original Grist source authoring through the maintained Applications lifecycle.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectMerchantRuntime } from '../../../sf46-release/runtime-package.mjs';
import { absolute, plain, need } from '../../../distribution/runtime-workspace/storage.mjs';

const SOURCE = 'stellar/scf-starforge-20261009/sf30-seller-sdk/grist/workspace';
const STARTUP = 'stellar-forge.grist-authoring-startup.v1';
import {SOURCE_FILES} from './source-files.mjs';
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const field = (name, label, type = 'path', required = false, description = '') =>
  ({ name, label, type, required, description });

export function gristApplication(common) {
  return {
    id: 'grist-authoring', command: 'grist-workspace', title: 'Grist source authoring', terminal: false,
    requiredSource: SOURCE + '/launch.mjs',
    description: 'Review original records and field observations, retain complete captures and public projections, publish through the saved dataset publisher, prepare complete customer operating plans with explicit source observations and return reviews, and reopen the same private workspace.',
    fields: [
      field('workspaceDirectory', 'Initialized private Grist workspace', 'path', true,
        'Select the original workspace. Initialize a new one with grist-workspace init before reviewing this application.'),
      field('connectionsFile', 'Private Grist connections file', 'path', false,
        'Optional original connection IDs and environment-key references. Leave empty for retained source packets; opening the application does not contact Grist.'),
      ...common,
    ],
  };
}

export async function prepareGristApplication(settings, { inputPath, runtimeDirectory } = {}) {
  need(typeof inputPath === 'function', 'APPLICATION_GRIST_INPUT_READER_REQUIRED');
  const directory = absolute(settings.workspaceDirectory);
  const inputs = [await inputPath(directory, 'directory', false, true)];
  const runtime = await inspectMerchantRuntime(absolute(runtimeDirectory), { load: false });
  const sourceDirectory = join(runtime.sourceRoot, SOURCE);
  const pinned = [];
  for (const name of SOURCE_FILES) pinned.push(await inputPath(join(sourceDirectory, name), 'file'));
  const native = await import(pathToFileURL(join(sourceDirectory, 'launch.mjs')).href);
  need(typeof native.inspectGristAuthoring === 'function' &&
    typeof native.inspectGristLaunchSource === 'function' &&
    typeof native.readGristLaunchConnections === 'function', 'APPLICATION_GRIST_NATIVE_READER_REQUIRED');
  const workspace = await native.inspectGristAuthoring(directory);
  const source = await native.inspectGristLaunchSource(sourceDirectory);
  need(Array.isArray(source.files) && source.files.length === SOURCE_FILES.length,
    'APPLICATION_GRIST_SOURCE_CHANGED');
  for (const [index, file] of source.files.entries())
    need(file.name === SOURCE_FILES[index] && file.sha256 === pinned[index]?.sha256,
      'APPLICATION_GRIST_SOURCE_CHANGED');
  inputs.push(...pinned);
  const args = ['serve', '--directory', directory,
    '--workspace-identity', workspace.sha256, '--source-directory', sourceDirectory,
    '--source-sha256', source.sha256, '--startup-json'];
  if (settings.connectionsFile) {
    const connection = await inputPath(settings.connectionsFile, 'file');
    await native.readGristLaunchConnections(settings.connectionsFile, { expectedSha256: connection.sha256 });
    inputs.push(connection);
    args.push('--connections', settings.connectionsFile, '--connections-sha256', connection.sha256);
  }
  // The original SQLite inode and immutable settings bind this launch. Captures,
  // source selection, draft revisions and publisher records remain mutable work.
  return { args, inputs, createDirectories: [] };
}

function option(request, name, optional = false) {
  need(Array.isArray(request.args), 'APPLICATION_GRIST_STARTUP_CHANGED');
  const positions = request.args.flatMap((value, index) => value === name ? [index] : []);
  if (optional && positions.length === 0) return undefined;
  need(positions.length === 1 && typeof request.args[positions[0] + 1] === 'string' &&
    !request.args[positions[0] + 1].startsWith('--'), 'APPLICATION_GRIST_STARTUP_CHANGED');
  return request.args[positions[0] + 1];
}

export async function gristStartup(request, text) {
  if (request.command !== 'grist-workspace' || typeof text !== 'string' || text.length > 32768 ||
      !text.startsWith('{"schema":"' + STARTUP + '",')) return null;
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  if (!plain(value) || value.schema !== STARTUP || value.status !== 'GRIST_AUTHORING_READY') return null;
  need(request.args?.[0] === 'serve' &&
    !request.args.includes('--create') &&
    request.args.filter(item => item === '--startup-json').length === 1,
  'APPLICATION_GRIST_STARTUP_CHANGED');
  const directory = absolute(option(request, '--directory'));
  const sourceDirectory = absolute(option(request, '--source-directory'));
  const launchSourceDirectory = join(absolute(request.releaseDirectory), 'source', SOURCE);
  const workspaceIdentity = option(request, '--workspace-identity');
  const sourceSha256 = option(request, '--source-sha256');
  need(HASH.test(workspaceIdentity) && HASH.test(sourceSha256) &&
    value.directory === directory && value.workspaceIdentity === workspaceIdentity &&
    value.sourceDirectory === sourceDirectory && value.launchSourceDirectory === launchSourceDirectory &&
    value.sourceSha256 === sourceSha256 && UUID.test(value.instanceId ?? '') &&
    Number.isSafeInteger(value.pid) && value.pid > 0, 'APPLICATION_GRIST_STARTUP_CHANGED');
  const native = await import(pathToFileURL(join(sourceDirectory, 'launch.mjs')).href);
  const source = await native.inspectGristLaunchSource(sourceDirectory, { expectedSha256: sourceSha256 });
  await native.inspectGristLaunchSource(launchSourceDirectory, { expectedSha256: sourceSha256 });
  const workspace = await native.inspectGristAuthoring(directory, { expectedIdentity: workspaceIdentity });
  need(value.settingsSha256 === workspace.settingsSha256 &&
    value.sourceFile === workspace.settings.sourceFile &&
    value.publisherDirectory === workspace.settings.publisherDirectory &&
    value.targetDirectory === workspace.settings.targetDirectory &&
    JSON.stringify(value.sourceFiles) === JSON.stringify(source.files), 'APPLICATION_GRIST_STARTUP_CHANGED');
  const connectionsFile = option(request, '--connections', true);
  const connectionsSha256 = option(request, '--connections-sha256', true);
  need(Boolean(connectionsFile) === Boolean(connectionsSha256), 'APPLICATION_GRIST_STARTUP_CHANGED');
  const connection = await native.readGristLaunchConnections(connectionsFile, { expectedSha256: connectionsSha256 });
  need(value.connectionsFile === connection.file && value.connectionsSha256 === connection.sha256,
    'APPLICATION_GRIST_STARTUP_CHANGED');
  const port = Number(option(request, '--port', true) ?? 8482);
  let url;
  try { url = new URL(value.gristWorkspace); }
  catch { need(false, 'APPLICATION_GRIST_STARTUP_CHANGED'); }
  need(url.protocol === 'http:' && url.hostname === '127.0.0.1' &&
    !url.username && !url.password && !url.search && url.pathname === '/' &&
    /^#token=[a-f0-9]{64}$/.test(url.hash) && Number.isInteger(port) && port >= 0 && port <= 65535 &&
    Number(url.port || 80) >= 1 && Number(url.port || 80) <= 65535 &&
    (port === 0 || Number(url.port || 80) === port), 'APPLICATION_GRIST_STARTUP_CHANGED');
  return { url: url.href, original: {
    schema: STARTUP, directory, workspaceIdentity, settingsSha256: workspace.settingsSha256,
    sourceDirectory, launchSourceDirectory, sourceSha256, sourceFiles: source.files,
    sourceFile: workspace.settings.sourceFile, publisherDirectory: workspace.settings.publisherDirectory,
    targetDirectory: workspace.settings.targetDirectory, connectionsFile: connection.file,
    connectionsSha256: connection.sha256, instanceId: value.instanceId, pid: value.pid,
  } };
}
