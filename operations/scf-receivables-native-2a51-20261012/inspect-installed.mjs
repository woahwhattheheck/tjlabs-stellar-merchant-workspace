#!/usr/bin/env node
// MIT. Admit the same source-owned providers from the selected installed manifest.
import assert from 'node:assert/strict';
import {readFile, realpath} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const args = process.argv.slice(2);
assert.equal(args.length, 4);
assert.equal(args[0], '--source'); assert.equal(args[2], '--ref');
const source = await realpath(args[1]), expected = args[3];
assert.match(expected, /^[0-9a-f]{40}$/);
const manifest = JSON.parse(await readFile(resolve(source, '../manifest.json'), 'utf8'));
assert.equal(manifest.sourceCommit, expected);
assert.equal(manifest.sourceSelection?.id, 'merchant-receivables');
const original = await import(pathToFileURL(join(source, 'stellar/scf-starforge-20261009/distribution/specification.mjs')));
const distribution = await original.readDistributionSpecification({sourceRoot: source, selection: 'merchant-receivables'});
assert.equal(distribution.manifest.sourceCommit, expected);
assert.equal(distribution.selection.id, 'merchant-receivables');
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
console.log(JSON.stringify({result: 'PASS', selection: distribution.selection.id,
  sourceCommit: expected, sourceRoot: source,
  distributionInputs: distribution.inputFiles, providerSources: registry.sources,
  runtime: process.version}, null, 2));
