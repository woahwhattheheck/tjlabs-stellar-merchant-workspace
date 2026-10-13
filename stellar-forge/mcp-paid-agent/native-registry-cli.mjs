#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { readFile } from 'node:fs/promises';
import { initializeNativeRegistry, inspectNativeRegistry, openNativeRegistry } from './native-registry.mjs';
import { startMcpWorkspace } from './serve.mjs';

const fail = code => { throw Object.assign(new Error(code),{code}); };
const print = value => process.stdout.write(JSON.stringify(value,null,2) + '\n');
const commands = {init:['--description'],inspect:[],serve:['--port']};
function parse(args) {
  const [command,...rest] = args;
  if (!Object.hasOwn(commands,command) || rest.length % 2) fail('MCP_NATIVE_REGISTRY_CLI_ARGUMENTS_INVALID');
  const values = {};
  for (let index = 0; index < rest.length; index += 2) {
    if (!['--dir',...commands[command]].includes(rest[index]) ||
      Object.hasOwn(values,rest[index]) || !rest[index+1]) fail('MCP_NATIVE_REGISTRY_CLI_ARGUMENTS_INVALID');
    values[rest[index]] = rest[index+1];
  }
  if (!values['--dir']) fail('MCP_NATIVE_REGISTRY_DIRECTORY_REQUIRED');
  return {command,values};
}
async function description(path) {
  if (!path) fail('MCP_NATIVE_REGISTRY_DESCRIPTION_REQUIRED');
  const bytes = await readFile(path);
  if (bytes.length > 65536) fail('MCP_NATIVE_REGISTRY_DESCRIPTION_TOO_LARGE');
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
  catch { fail('MCP_NATIVE_REGISTRY_DESCRIPTION_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => !['schema','defaultWorkspaceId','workspaces','catalogs'].includes(key)))
    fail('MCP_NATIVE_REGISTRY_DESCRIPTION_INVALID');
  return value;
}
async function main(args) {
  if (args.length === 1 && ['--help','-h'].includes(args[0])) {
    process.stdout.write(
      'One native buyer console for existing host-configured SF88 service workspaces.\n' +
      'init --dir NEW_PRIVATE_ABSOLUTE_DIR --description OPERATOR_JSON\n' +
      'inspect --dir EXISTING_PRIVATE_ABSOLUTE_DIR\n' +
      'serve --dir EXISTING_PRIVATE_ABSOLUTE_DIR [--port N]\n\n' +
      'The description names a defaultWorkspaceId and 1–16 workspaces, each with id, label and\n' +
      'its existing absolute native directory. Each service retains its original catalog URL.\n' +
      'Optional catalogs assigns readable labels and IDs to that exact set of original source URLs.\n' +
      'Serve requires the existing MCP_ACCESS_TOKEN or MCP_OAUTH_CONFIG. Original SF81\n' +
      'approval uses the controlling terminal or SF81_APPROVAL_SOCKET and SF81_APPROVAL_TOKEN.\n' +
      'Use the authenticated console or native-requests SDK for lifecycle calls while this host runs.\n' +
      'Guide: NATIVE_REGISTRY.md\n');
    return;
  }
  const {command,values} = parse(args), directory = values['--dir'];
  if (command === 'init')
    return print(await initializeNativeRegistry({...await description(values['--description']),directory}));
  if (command === 'inspect') return print(await inspectNativeRegistry(directory));
  const port = values['--port'] ?? '3210';
  if (!/^(0|[1-9][0-9]*)$/.test(port) || Number(port) > 65535) fail('MCP_NATIVE_PORT_INVALID');
  const registry = await openNativeRegistry(directory);
  let server;
  try {
    server = await startMcpWorkspace({environment:{...process.env,...registry.environment,
      MCP_OPERATOR_MODULE:undefined,MCP_PORT:port},
      operatorAdapter:{discoveryCatalogs:registry.discoveryCatalogs,
        agentCommerce:(request,context) => registry.call(request,context),
        approve:async () => false,
        signPayment:async () => { fail('MCP_NATIVE_TOOL_REQUIRED'); },
        close:() => registry.close()}});
    print({schema:'stellar-forge.mcp-native-registry-startup.v1',
      status:'NATIVE_MCP_REGISTRY_LISTENING',url:server.address + '/mcp',consoleUrl:server.consoleUrl,
      defaultWorkspaceId:registry.manifest.defaultWorkspaceId,discoveryCatalogs:registry.discoveryCatalogs,
      workspaces:registry.manifest.workspaces.map(({id,label}) => ({workspaceId:id,workspaceLabel:label})),
      tool:'sf43_discover_review_and_pay'});
  } catch (error) {
    await registry.close().catch(() => {});
    throw error;
  }
  let stopping;
  const stop = () => {
    stopping ??= server.close().catch(error => {
      process.stderr.write(JSON.stringify({error:error.code ?? 'MCP_NATIVE_REGISTRY_CLOSE_FAILED'}) + '\n');
      process.exitCode = 2;
    });
  };
  process.once('SIGINT',stop); process.once('SIGTERM',stop);
}
main(process.argv.slice(2)).catch(error => {
  const code = /^[A-Z0-9_]{1,120}$/.test(error?.code ?? '') ? error.code : 'MCP_NATIVE_REGISTRY_OPERATION_FAILED';
  process.stderr.write(JSON.stringify({error:code}) + '\n');
  process.exitCode = 1;
});
