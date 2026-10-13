#!/usr/bin/env node
// MIT. Installed complete prepaid API setup and original merchant/customer entrypoints.
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {requestTemplate, preparePrepaidApi, inspectPrepaidApi, readPrepaidApiRequest} from './setup.mjs';
import {publishPrepaidApi, preparePrepaidCustomer, downloadPrepaidCustomer} from './workflow.mjs';
import {inspectPrepaidCustomerFiles, preparePrepaidCustomerWorkspace, inspectPrepaidCustomerWorkspace,
  servePrepaidCustomer} from './customer.mjs';
import {absolute, ownedDirectory, writeExact, encoded, need, integer}
  from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/configuration.mjs';
import {runCustomerWorkspaceLifetime}
  from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-access/workspace/cli.mjs';
import {main as originalMerchantMain}
  from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/cli.mjs';

import {buildPrepaidCommissioning,preparePrepaidCommissioning,inspectPrepaidCommissioning} from './commissioning-native.mjs';

const HELP = [
  'Prepaid API product',
  '',
  'starforge prepaid-api commissioning --directory ABS_SETUP --out ABS_PRIVATE_OUTPUT',
  '  [--document ABS_COMMISSIONING_JSON --actor NAME]',
  'starforge prepaid-api commissioning-inspect --document ABS_COMMISSIONING_JSON',
  'starforge prepaid-api commissioning-prepare --document ABS_COMMISSIONING_JSON --out ABS_PRIVATE_OUTPUT',
  '  [--runtime-workspace-id ACTUAL_ID --runtime-id READY_ID]',
  '',
  'starforge prepaid-api template --out ABS_JSON',
  'starforge prepaid-api prepare --directory ABS --request ABS_JSON',
  'starforge prepaid-api inspect --directory ABS',
  'starforge prepaid-api serve --directory ABS [--port 0]',
  'starforge prepaid-api publish --directory ABS --launch ABS [--resume] [--wait-ms 120000]',
  'starforge prepaid-api customer --directory ABS --launch ABS --order REFERENCE --label NAME',
  '  [--resume] [--wait-ms 120000]',
  'starforge prepaid-api receive --directory ABS --launch ABS --order REFERENCE --out ABS_DIRECTORY',
  '',
  'starforge prepaid-api customer-files --handoff-directory ABS',
  'starforge prepaid-api customer-configure --handoff-directory ABS --directory ABS',
  '  --mode purchase --buyer-workspace ORIGINAL_OPERATOR_ABS --intent STABLE_INTENT',
  '  [--runtime ABS --buyer-state ABS --inbox ABS --python EXEC --title TITLE]',
  'starforge prepaid-api customer-configure --handoff-directory ABS --directory ABS --mode access',
  '  [--runtime ABS --buyer-state ABS --inbox ABS --python EXEC --title TITLE]',
  'starforge prepaid-api customer-inspect --config ABS_CUSTOMER_CONFIG',
  'starforge prepaid-api customer-serve --config ABS_CUSTOMER_CONFIG [--port 0]',
  '  [--approval-mode auto|browser|terminal --approval-module ABS --expected-approval-sha256 SHA]',
  '  [--agent-directory ABS --expected-agent-setup-sha256 SHA|new --expected-workspace-sha256 SHA|new]',
  '',
  'Setup requires actual public HTTPS checkout/payment terms and a configured API origin.',
  'Publish and customer commands retain each original operation ID and request before dispatch.',
  '--resume continues original ATTENTION work or a recorded, definitively rejected admission.',
  'Customer configuration opens the original purchase review; payment is selected in that existing review.',
  'After publication, use the merchant browser Start action to run the selected original worker and gateway.',
  'The original api-merchant-workspace command owns all further offer/access/execution/backup actions.',
].join('\n');

function argumentsOf(argv) {
  const command = argv.shift();
  if (command === undefined || ['help', '--help', '-h'].includes(command)) return {command: 'help', values: new Map()};
  const values = new Map();
  while (argv.length) {
    const token = argv.shift();
    need(typeof token === 'string' && token.startsWith('--') && token.length > 2, 'PREPAID_API_OPTION_REQUIRED');
    const equal = token.indexOf('='), key = token.slice(2, equal < 0 ? undefined : equal);
    need(!values.has(key), 'PREPAID_API_OPTION_REPEATED');
    if (key === 'resume' && equal < 0) {values.set(key, true); continue;}
    const value = equal < 0 ? argv.shift() : token.slice(equal + 1);
    need(typeof value === 'string' && value.length > 0, 'PREPAID_API_OPTION_VALUE_REQUIRED');
    values.set(key, value);
  }
  return {command, values};
}
function only(values, keys) {need([...values.keys()].every(key => keys.includes(key)), 'PREPAID_API_UNKNOWN_OPTION');}
const value = (values, name, fallback) => values.get(name) ?? fallback;
function number(values, name, fallback, maximum) {
  const text = value(values, name, String(fallback));
  need(typeof text === 'string' && /^(?:0|[1-9][0-9]*)$/.test(text), 'PREPAID_API_INTEGER_OPTION_REQUIRED');
  return integer(Number(text), 0, maximum, 'PREPAID_API_INTEGER_OPTION_REQUIRED');
}
function resumeValue(values) {
  const flag = value(values, 'resume', false);
  need(typeof flag === 'boolean', 'PREPAID_API_RESUME_FLAG_REQUIRED');
  return flag;
}
async function withSignal(operation) {
  const controller = new AbortController();
  const stop = () => controller.abort(Object.assign(new Error('PREPAID_API_COMMAND_INTERRUPTED'), {code: 'PREPAID_API_COMMAND_INTERRUPTED'}));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {return await operation(controller.signal);}
  finally {process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);}
}
const output = value => {if (value !== undefined) process.stdout.write(encoded(value));};


export async function main(argv = process.argv.slice(2)) {
  const {command, values} = argumentsOf([...argv]);
  if (command === 'help') {process.stdout.write(HELP + '\n'); return;}
  if (command === 'commissioning') {
    only(values, ['directory', 'out', 'document', 'actor']);
    return buildPrepaidCommissioning({directory:value(values,'directory'),out:value(values,'out'),
      document:value(values,'document'),actor:value(values,'actor','merchant-operator')});
  }
  if (command === 'commissioning-inspect') {
    only(values, ['document']);return inspectPrepaidCommissioning(value(values,'document'));
  }
  if (command === 'commissioning-prepare') {
    only(values, ['document','out','runtime-workspace-id','runtime-id']);
    return preparePrepaidCommissioning({document:value(values,'document'),out:value(values,'out'),
      workspaceId:value(values,'runtime-workspace-id'),runtimeId:value(values,'runtime-id')});
  }
  if (command === 'template') {
    only(values, ['out']);
    const path = absolute(value(values, 'out'));
    await ownedDirectory(dirname(path), {create: true});
    await writeExact(path, encoded(requestTemplate()));
    return {schema: 'stellar-forge.prepaid-api-template.v1', file: path,
      required: ['publicOrigin', 'gatewayBaseUrl', 'payment.asset', 'payment.payTo', 'payment.amount']};
  }
  if (command === 'prepare') {
    only(values, ['directory', 'request']);
    return preparePrepaidApi({directory: value(values, 'directory'), request: await readPrepaidApiRequest(value(values, 'request'))});
  }
  if (command === 'inspect' || command === 'serve') {
    only(values, command === 'serve' ? ['directory', 'port'] : ['directory']);
    const selected = await inspectPrepaidApi(value(values, 'directory'));
    if (command === 'inspect') return selected;
    return originalMerchantMain(['serve', '--config', selected.config, '--port', String(number(values, 'port', 0, 65535)),
      '--expected-config-sha256', selected.configSha256, '--expected-source-sha256', selected.sourceSha256]);
  }
  if (command === 'publish' || command === 'customer') {
    only(values, ['directory', 'launch', 'resume', 'wait-ms', ...(command === 'customer' ? ['order', 'label'] : [])]);
    const selected = {directory: value(values, 'directory'), launchFile: value(values, 'launch'),
      resume: resumeValue(values), maxWaitMs: number(values, 'wait-ms', 120000, 3600000)};
    const result = await withSignal(signal => command === 'publish' ? publishPrepaidApi({...selected, signal}) :
      preparePrepaidCustomer({...selected, signal, orderReference: value(values, 'order'), label: value(values, 'label')}));
    if (!['READY', 'COMPLETE'].includes(result.status)) process.exitCode = 3;
    return result;
  }
  if (command === 'receive') {
    only(values, ['directory', 'launch', 'order', 'out']);
    return withSignal(signal => downloadPrepaidCustomer({directory: value(values, 'directory'),
      launchFile: value(values, 'launch'), orderReference: value(values, 'order'), out: value(values, 'out'), signal}));
  }
  if (command === 'customer-files') {
    only(values, ['handoff-directory']);
    return inspectPrepaidCustomerFiles(value(values, 'handoff-directory'));
  }
  if (command === 'customer-configure') {
    only(values, ['handoff-directory', 'directory', 'mode', 'buyer-workspace', 'intent',
      'runtime', 'buyer-state', 'inbox', 'python', 'title']);
    const options = {handoffDirectory: value(values, 'handoff-directory'), directory: value(values, 'directory'),
      mode: value(values, 'mode', 'purchase')};
    for (const [flag, key] of [['buyer-workspace', 'buyerWorkspace'], ['intent', 'intentId'],
      ['runtime', 'runtimeDirectory'], ['buyer-state', 'buyerStateDirectory'], ['inbox', 'inboxDirectory'],
      ['python', 'python'], ['title', 'title']])
      if (values.has(flag)) options[key] = value(values, flag);
    return preparePrepaidCustomerWorkspace(options);
  }
  if (command === 'customer-inspect') {
    only(values, ['config']);
    return inspectPrepaidCustomerWorkspace(value(values, 'config'));
  }
  if (command === 'customer-serve') {
    only(values, ['config', 'port', 'approval-mode', 'approval-module', 'expected-approval-sha256',
      'agent-directory', 'expected-agent-setup-sha256', 'expected-workspace-sha256']);
    const options = {configurationFile: value(values, 'config'), port: number(values, 'port', 0, 65535),
      approvalMode: value(values, 'approval-mode', 'auto')};
    for (const [flag, key] of [['approval-module', 'approvalModule'], ['expected-approval-sha256', 'expectedApprovalSha256'],
      ['agent-directory', 'agentDirectory'], ['expected-agent-setup-sha256', 'expectedAgentSetupSha256'],
      ['expected-workspace-sha256', 'expectedWorkspaceSha256']])
      if (values.has(flag)) options[key] = value(values, flag);
    return runCustomerWorkspaceLifetime(() => servePrepaidCustomer(options), {describe: app => ({
      ...app.prepaid, status: 'LISTENING', url: app.url, launchFile: app.launchFile,
      instanceId: app.launch.instanceId, ...(app.launch.agent ? {agent: app.launch.agent} : {})})});
  }
  need(false, 'PREPAID_API_COMMAND_REQUIRED');
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().then(output).catch(error => {
    const code = /^[A-Z][A-Z0-9_]{1,120}$/.test(error?.code ?? '') ? error.code : 'PREPAID_API_COMMAND_FAILED';
    output({ok: false, error: code, status: Number.isInteger(error?.status) ? error.status : 503,
      ...(error?.outcomeUnknown === true ? {outcomeUnknown: true} : {}),
      ...Object.fromEntries(['operationId', 'requestSha256', 'requestFile', 'workflowId']
        .filter(key => typeof error?.[key] === 'string').map(key => [key, error[key]]))});
    process.exitCode = 2;
  });
