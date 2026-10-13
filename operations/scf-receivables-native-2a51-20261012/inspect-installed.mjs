#!/usr/bin/env node
// MIT. Admit the same source-owned providers from the selected installed manifest.
import assert from 'node:assert/strict';
import {readFile, realpath} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const args = process.argv.slice(2);
assert.ok(args.length === 4 || args.length === 7);
assert.equal(args[0], '--source'); assert.equal(args[2], '--ref');
const source = await realpath(args[1]), expected = args[3];
const customerHandover = args.length === 7;
if (customerHandover) { assert.equal(args[4], '--selection'); assert.equal(args[6], '--customer-handover'); }
const selection = customerHandover ? args[5] : 'merchant-receivables';
assert.ok(['merchant-receivables', 'merchant-commissioning-collections'].includes(selection));
assert.match(expected, /^[0-9a-f]{40}$/);
const manifest = JSON.parse(await readFile(resolve(source, '../manifest.json'), 'utf8'));
assert.equal(manifest.sourceCommit, expected);
assert.equal(manifest.sourceSelection?.id, selection);
const original = await import(pathToFileURL(join(source, 'stellar/scf-starforge-20261009/distribution/specification.mjs')));
const distribution = await original.readDistributionSpecification({sourceRoot: source, selection});
assert.equal(distribution.manifest.sourceCommit, expected);
assert.equal(distribution.selection.id, selection);
const {MERCHANT_PROVIDER_REGISTRY: registry} = await import(pathToFileURL(join(source, 'stellar-forge/mcp-merchant-operator/providers.mjs')));
assert.equal(await realpath(registry.sourceRoot), source);
assert.equal(registry.sourceCommit, expected);
assert.ok(registry.providers.accounting);
const declared = Object.keys(distribution.spec.merchantProviders).sort();
assert.deepEqual(registry.sources.map(item => item.id).sort(), declared);
assert.ok(!declared.includes('grist-workspaces'));
assert.ok(!declared.includes('seatable-workspaces'));
for (const item of distribution.inputFiles) {
  const bytes = await readFile(join(source, item.path));
  assert.equal(bytes.length, item.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
}
const installedCommands = [], installedExports = [];
if (customerHandover) {
  const packageRoot = resolve(source, '..'), metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  const cli = join(source, 'stellar/scf-starforge-20261009/distribution/cli.mjs');
  for (const command of ['customer-case', 'customer-case-followup', 'customer-case-serve', 'customer-xero-handover']) {
    assert.ok(distribution.spec.commands[command], 'Selected package omits ' + command);
    const output = execFileSync(process.execPath, [cli, command, '--help'],
      {cwd: packageRoot, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 60000});
    assert.ok(output.trim().length > 0);
    installedCommands.push({command: 'starforge ' + command + ' --help', exitCode: 0,
      bytes: Buffer.byteLength(output), sha256: createHash('sha256').update(output).digest('hex')});
  }
  for (const [entry, names] of [
    ['./merchant/customer-case', ['createDurableCustomerCase', 'captureDurableCustomerCase', 'checkpointDurableCustomerCase']],
    ['./merchant/customer-case/followup', ['continueRetainedCustomerFollowup', 'finishRetainedCustomerFollowup']],
    ['./merchant/customer-case/server', ['serveRetainedCustomerCase']],
    ['./merchant/customer-case/xero-handover', ['prepareXeroCustomerHandover', 'receiveXeroCustomerHandover']],
  ]) {
    const target = metadata.exports[entry];
    assert.ok(typeof target === 'string' && target.startsWith('./source/'));
    const module = await import(pathToFileURL(join(packageRoot, target)));
    for (const name of names) assert.equal(typeof module[name], 'function', entry + ':' + name);
    installedExports.push({entry: metadata.name + '/' + entry.slice(2), source: target, names});
  }
}
console.log(JSON.stringify({result: 'PASS', selection: distribution.selection.id,
  sourceCommit: expected, sourceRoot: source,
  distributionInputs: distribution.inputFiles, providerSources: registry.sources,
  runtime: process.version, ...(customerHandover ? {installedCommands, installedExports} : {})}, null, 2));
