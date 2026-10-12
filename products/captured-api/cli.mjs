#!/usr/bin/env node
// MIT. Customer entrypoint; original source, compiler, transport and release owners are unchanged.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const HELP = 'Captured API merchant workspace\n\n' +
  '  starforge captured-api init --dir NEW_PRIVATE_DIRECTORY [--name NAME]\n' +
  '       [--projects EXISTING_PRIVATE_PROJECTS] [--oauth-connections PRIVATE_JSON]\n' +
  '       [--console-url-file ORIGINAL_PRIVATE_URL_FILE]\n' +
  '  starforge captured-api open --dir PRIVATE_DIRECTORY [--port 0] [--mcp-port 0]\n' +
  '       [--token-env MCP_ACCESS_TOKEN] [--browser-only]\n' +
  '       [--managed-binding-sha256 INSPECTED_LAUNCH_SHA256]\n' +
  '  starforge captured-api inspect --dir PRIVATE_DIRECTORY\n' +
  '  starforge captured-api inspect-launch --dir PRIVATE_DIRECTORY\n' +
  '       [--port 0] [--mcp-port 0] [--token-env MCP_ACCESS_TOKEN] [--browser-only]\n' +
  '  starforge captured-api capture --dir PRIVATE_DIRECTORY --file ORIGINAL.har\n' +
  '       [--label NAME] [--sha256 ORIGINAL_SHA256] [--previous SAVED_SELECTION.json]\n' +
  '  starforge captured-api adopt --dir PRIVATE_DIRECTORY --kind capture|refresh\n' +
  '       --from COMPLETE_NATIVE_SOURCE_DIRECTORY [--label NAME]\n\n' +
  'Complete selected source and merchant handover:\n' +
  '  starforge captured-api handover inventory|prepare|publish|inspect ...\n' +
  '  starforge captured-api handover receive-review|receive|status ...\n\n' +
  'Complete operating backup, restore and original-path receiving:\n' +
  '  starforge captured-api recovery inspect|plan|capture|verify|restore ...\n' +
  '  starforge captured-api recovery receive-review|receive|status|open ...\n\n' +
  'Original commands, with their arguments passed unchanged:\n' +
  '  starforge captured-api har prepare|inspect|review|save|export|copy|package|refresh ...\n' +
  '  starforge captured-api worksheet inventory|reconcile|review|save|export ...\n' +
  '  starforge captured-api policies list|load|save|review|package|export|read ...\n' +
  '  starforge captured-api workflows --help\n' +
  '  starforge captured-api releases ...\n' +
  '  starforge captured-api merchant ...\n\n' +
  'Use the source entrypoint before installation:\n' +
  '  node products/captured-api/cli.mjs COMMAND ...\n\n' +
  'Open the private browser to upload the actual HAR, review operations, author merchant\n' +
  'terms and exact route prices, save the original package, run it and continue releases.\n' +
  'The operatorUrl opens persistent Requests, Workflows and Customers on the same\n' +
  'merchant host. Profiles and complete customer downloads remain under operator-console.\n' +
  'Both native MCP providers use workspace alias merchant. Set the existing incoming\n' +
  'MCP access token in its environment; --browser-only opens the original browser alone.\n' +
  'An external Applications console keeps its original ownership and private URL record.\n' +
  'Ctrl-C drains the agent and then this command’s owned original browser and seller.\n' +
  'Retained captures, reviews, packages, releases and complete exports remain in place.\n';
const failure = message => Object.assign(new Error(message), { code: 'CAPTURED_API_ARGUMENTS' });
function options(args, names, switches = []) {
  const result = new Map();
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (result.has(key) || !names.includes(key) && !switches.includes(key))
      throw failure('Unknown or repeated option: ' + key);
    if (switches.includes(key)) { result.set(key, true); continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw failure('Missing value for ' + key);
    result.set(key, value);
  }
  if (!result.has('--dir')) throw failure('Supply --dir with the retained private product directory.');
  return result;
}
function port(value) {
  if (value === undefined) return 0;
  if (!/^\d{1,5}$/.test(value) || Number(value) > 65535) throw failure('Port must be 0–65535.');
  return Number(value);
}
const print = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
function report(error) {
  process.stderr.write((error.code ? error.code + ': ' : '') + error.message + '\n');
  process.exitCode = 1;
}
export async function main(args = process.argv.slice(2)) {
  if (!args.length || args.length === 1 && ['--help','help'].includes(args[0])) {
    process.stdout.write(HELP); return;
  }
  const [command, ...rest] = args;
  if (command === 'handover') return (await import('./handover-cli.mjs')).runCapturedHandoverCLI(rest);
  if (command === 'recovery') return (await import('./recovery/cli.mjs')).runCapturedRecoveryCLI(rest);
  if (command === 'har') return (await import('../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/har/cli.mjs')).runHarCLI(rest);
  const forwarded = { worksheet: 'merchant-route-worksheet', policies: 'merchant-operation-policies',
    workflows: 'merchant-openapi-workflows', releases: 'releases', merchant: 'merchant-mcp' };
  if (Object.hasOwn(forwarded, command))
    return (await import('../../stellar/scf-starforge-20261009/distribution/cli.mjs')).main([forwarded[command], ...rest]);
  const product = await import('./workspace.mjs');
  let result;
  if (command === 'init') {
    const input = options(rest, ['--dir','--name','--projects','--console-url-file','--oauth-connections']);
    result = await product.initializeCapturedApi({ directory: input.get('--dir'), name: input.get('--name'),
      projects: input.get('--projects'), consoleUrlFile: input.get('--console-url-file'),
      oauthConnectionsFile: input.get('--oauth-connections') });
  } else if (command === 'inspect') {
    const input = options(rest, ['--dir']); result = await product.inspectCapturedApi(input.get('--dir'));
  } else if (command === 'inspect-launch') {
    const input = options(rest, ['--dir','--port','--mcp-port','--token-env'], ['--browser-only']);
    result = await (await import('./managed.mjs')).inspectCapturedApiLaunch({
      directory: input.get('--dir'), port: port(input.get('--port')), mcpPort: port(input.get('--mcp-port')),
      browserOnly: input.has('--browser-only'), tokenEnv: input.get('--token-env') ?? 'MCP_ACCESS_TOKEN' });
  } else if (command === 'capture') {
    const input = options(rest, ['--dir','--file','--label','--sha256','--previous']);
    if (!input.has('--file')) throw failure('Supply the original --file.');
    let previous;
    if (input.has('--previous')) {
      const { readSf61HostFile } = await import('../../stellar-forge/mcp-merchant-operator/sf61-connection.mjs');
      previous = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
        await readSf61HostFile(resolve(input.get('--previous')), 1024 * 1024, { privateFile: true })));
    }
    result = await product.ingestCapturedApi({ directory: input.get('--dir'), path: input.get('--file'),
      label: input.get('--label'), expectedSha256: input.get('--sha256'), previous });
  } else if (command === 'adopt') {
    const input = options(rest, ['--dir','--kind','--from','--label']);
    if (!input.has('--from') || !input.has('--kind')) throw failure('Supply the original --kind and complete --from directory.');
    result = await product.adoptCapturedApi({ directory: input.get('--dir'), kind: input.get('--kind'),
      sourceDirectory: input.get('--from'), label: input.get('--label') });
  } else if (command === 'open') {
    const input = options(rest, ['--dir','--port','--mcp-port','--token-env','--managed-binding-sha256'], ['--browser-only']);
    let active, closing, stopping = false;
    const signals = ['SIGINT','SIGTERM'];
    const remove = () => { for (const signal of signals) process.removeListener(signal, stop); };
    const close = () => {
      if (closing) return closing;
      const attempt = Promise.resolve().then(() => active.close());
      closing = attempt;
      void attempt.then(remove, () => { if (closing === attempt) closing = undefined; });
      return attempt;
    };
    const stop = () => { stopping = true; if (active) close().catch(report); };
    // Repeated signals join the same native drain; they never restore Node's
    // default termination handler while these original owners remain open.
    for (const signal of signals) process.on(signal, stop);
    try {
      const selected = { directory: input.get('--dir'), port: port(input.get('--port')),
        mcpPort: port(input.get('--mcp-port')), browserOnly: input.has('--browser-only'),
        tokenEnv: input.get('--token-env') ?? 'MCP_ACCESS_TOKEN' };
      active = input.has('--managed-binding-sha256')
        ? await (await import('./managed.mjs')).openCapturedApiManaged({ ...selected,
          expectedBindingSha256: input.get('--managed-binding-sha256') })
        : await product.openCapturedApi(selected);
      if (stopping) { await close(); return { state: 'CLOSED' }; }
      if (input.has('--managed-binding-sha256')) process.stdout.write(JSON.stringify(active.startup) + '\n');
      else print({ state: active.state, name: active.name, browserUrl: active.browserUrl, mcpUrl: active.mcpUrl,
        operatorUrl: active.operatorUrl, operatorConsoleDirectory: active.operatorConsoleDirectory,
        workspace: active.workspace, directory: active.directory, projectsDirectory: active.projectsDirectory,
        configuration: active.configuration, consoleOwnership: active.console.ownership });
      return { ...active, close };
    } catch (error) {
      if (!active && typeof error.close === 'function') active = { close: error.close };
      if (!active) remove();
      throw error;
    }
  } else throw failure('Unknown captured API command. Use --help.');
  print(result); return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(report);
