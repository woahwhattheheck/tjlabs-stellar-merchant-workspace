#!/usr/bin/env node
// MIT. Receive one original selected product through its actual builder and installed exports.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, realpath, stat} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';

const selection = 'merchant-receivables';
const distribution = 'stellar/scf-starforge-20261009/distribution';
const merchant = 'stellar-forge/mcp-merchant-operator';
const receivables = 'stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
function need(value, code, message) {
  if (!value) throw Object.assign(new Error(message), {code});
}
function flags(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--resume' || args[i] === '--offline' || args[i] === '--bank') {
      need(!result[args[i]], 'PACKAGE_ARGUMENTS', 'Use each flag once.');
      result[args[i]] = true; continue;
    }
    need(['--repo', '--ref', '--out', '--python'].includes(args[i]) &&
      result[args[i]] === undefined && args[i + 1], 'PACKAGE_ARGUMENTS',
      'Use --repo CHECKOUT --ref ORIGINAL_COMMIT --out PRIVATE_DIRECTORY [--resume] [--offline] [--bank] [--python EXECUTABLE].');
    result[args[i]] = args[++i];
  }
  need(result['--repo'] && result['--out'] && /^[a-f0-9]{40}$/.test(result['--ref'] ?? ''),
    'PACKAGE_ARGUMENTS', 'Select the complete original Git checkout, exact commit and private output.');
  return result;
}
function run(command, args, options = {}) {
  return execFileSync(command, args, {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'], ...options});
}
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function privateJson(path, value) {
  await writeFile(path, json(value), {flag: 'wx', mode: 0o600});
}
function progress(value) { process.stderr.write('[selected receivables] ' + JSON.stringify(value) + '\n'); }

export async function receiveSelectedReceivables({repository, ref, output, resume = false,
  offline = false, bank = false, python = 'python3'} = {}) {
  const repo = await realpath(resolve(repository)), out = resolve(output);
  need(/^[a-f0-9]{40}$/.test(ref ?? ''), 'PACKAGE_SOURCE_REF', 'Use the full original source commit.');
  const commit = run('git', ['-C', repo, 'rev-parse', '--verify', ref + '^{commit}']).trim();
  need(commit === ref, 'PACKAGE_SOURCE_REF', 'The requested source commit changed.');
  const head = run('git', ['-C', repo, 'rev-parse', 'HEAD']).trim();
  need(head === commit, 'PACKAGE_CHECKOUT', 'Run from a complete checkout at the selected commit: ' + commit);
  // The builder reads payload files through Git. Its local executable helpers must
  // also be the selected original source before importing the maintained builder.
  run('git', ['-C', repo, 'diff', '--exit-code', commit, '--',
    distribution + '/*.mjs', distribution + '/runtime-unpack.py']);
  if (!resume) await mkdir(out, {mode: 0o700});
  else need((await stat(out)).isDirectory(), 'PACKAGE_OUTPUT', 'Resume the original output directory.');
  need(await realpath(out) === out && !((await stat(out)).mode & 0o077),
    'PACKAGE_OUTPUT', 'Use a real private output directory.');
  let phase = 'build';
  try {
    const {buildDistribution} = await import(pathToFileURL(join(repo, distribution, 'build.mjs')));
    const built = await buildDistribution({repository: repo, ref: commit,
      output: join(out, 'build'), selection, offline, resume, python, onProgress: event => {
        if (['selected', 'materializing', 'materialized', 'packaged', 'reused'].includes(event.phase))
          progress(event);
      }});
    need(built.status === 'PACKAGED' && built.sourceCommit === commit &&
      built.sourceSelection?.id === selection, 'PACKAGE_RECEIPT', 'The builder returned another source selection.');
    const stage = join(out, 'build', 'package'), manifest = await readJson(join(stage, 'manifest.json'));
    const metadata = await readJson(join(stage, 'package.json'));
    need(manifest.sourceCommit === commit && manifest.sourceSelection?.id === selection &&
      metadata.name === built.packageName, 'PACKAGE_MANIFEST', 'The native package manifest does not match the original build.');
    const names = new Set(manifest.files.map(file => file.path));
    const required = [
      merchant + '/accounting-receivables.mjs',
      merchant + '/accounting-receivables-client.mjs',
      merchant + '/accounting-receivables-client.d.mts',
      merchant + '/accounting-receivables-cli.mjs',
      merchant + '/accounting-receivables-cli.d.mts',
      merchant + '/catalog/accounting-receivables.mjs',
      merchant + '/ACCOUNTING_RECEIVABLES.md',
      merchant + '/operation-error.mjs',
      receivables + '/payment-requests.mjs',
      receivables + '/payment-requests-workspace.mjs',
      receivables + '/payment-requests-verifier.mjs',
      receivables + '/public/payment-requests.mjs',
      receivables + '/PAYMENT_REQUESTS.md',
      distribution + '/contributions/receivables-agent.json',
      'stellar/scf-starforge-20261009/sf86-rpc-transfer-reconcile/networks.json',
      'stellar/scf-starforge-20261009/sf88-operator-buyer-cli/package.json',
      'stellar-forge/mcp-paid-agent/package.json',
    ];
    const bankRequired = [
      receivables + '/bank-receipts.mjs',
      receivables + '/bank-receipts-workspace.mjs',
      receivables + '/bank-statement-source.mjs',
      receivables + '/bank-client-types.d.ts',
      receivables + '/refund-client-types.d.ts',
      receivables + '/public/bank-statements.mjs',
      receivables + '/BANK_STATEMENTS.md',
      receivables + '/bank-parsers/bridge.py',
      receivables + '/bank-parsers/ofx_intake.py',
      receivables + '/bank-parsers/mt940_engine.py',
      receivables + '/bank-parsers/README.md',
    ];
    if (bank) required.push(...bankRequired);
    for (const path of required)
      need(names.has(path), 'PACKAGE_ENTRY', 'The selected product is missing its original runtime entry: ' + path);
    const contributions = new Set(manifest.distributionContributions.map(row => row.id));
    for (const id of ['merchant-receivables', 'receivables-agent', 'merchant-payment-plans'])
      need(contributions.has(id), 'PACKAGE_CONTRIBUTION', 'The selected product is missing the original contribution: ' + id);
    const nativeMcp = await readJson(join(stage, 'source/stellar-forge/mcp-paid-agent/package.json'));
    const mcpVersion = nativeMcp.dependencies['@modelcontextprotocol/sdk'];
    need(mcpVersion && metadata.optionalDependencies?.['@modelcontextprotocol/sdk'] === mcpVersion,
      'PACKAGE_MCP_DEPENDENCY', 'Preserve the selected original MCP runtime dependency.');
    for (const [key, runtime, declaration] of [
      ['./merchant/accounting-receivables', 'accounting-receivables-client.mjs', 'accounting-receivables-client.d.mts'],
      ['./merchant/accounting-receivables/operations', 'accounting-receivables-cli.mjs', 'accounting-receivables-cli.d.mts'],
    ]) {
      const entry = metadata.exports[key];
      need(entry?.default === './source/' + merchant + '/' + runtime &&
        entry?.types === './source/' + merchant + '/' + declaration,
        'PACKAGE_TYPED_EXPORT', 'Preserve the original runtime and declaration export: ' + key);
    }
    if (bank) {
      const entry = metadata.exports['./merchant/receivables/client'];
      need(entry?.default === './source/' + receivables + '/client.mjs' &&
        entry?.types === './source/' + receivables + '/client.d.ts',
        'PACKAGE_HTTP_EXPORT', 'Preserve the original typed HTTP client export.');
    }
    phase = 'install';
    const consumer = join(out, 'consumer');
    if (!resume) {
      await mkdir(consumer, {mode: 0o700});
      await privateJson(join(consumer, 'package.json'), {name: 'receivables-receiving',
        version: '1.0.0', private: true, type: 'module'});
    }
    // Reuse the native owner's existing npm cache; --offline binds both Git and dependency acquisition.
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const installOutput = run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund',
      '--package-lock=false', offline ? '--offline' : '--prefer-offline', built.archive], {cwd: consumer});
    progress({phase: 'installed', packageName: metadata.name, sourceCommit: commit});
    phase = 'installed-command';
    const executable = join(consumer, 'node_modules', '.bin',
      process.platform === 'win32' ? 'starforge.cmd' : 'starforge');
    const help = run(executable, ['merchant-accounting-receivables', '--help'], {cwd: consumer});
    need(help.includes('payment-receive') && help.includes('quote-import') &&
      help.includes('reconcile'), 'PACKAGE_COMMAND', 'The installed command did not expose the complete receivables workflow.');
    let nativeHelp = null;
    if (bank) {
      need(['bank-source-inspect', 'bank-source-import', 'bank-posting-preview', 'bank-receipts-post',
        'bank-rows-restore', '--source'].every(command => help.includes(command)),
        'PACKAGE_BANK_COMMAND', 'The installed agent command is missing the bank intake or durable posting workflow.');
      nativeHelp = run(executable, ['receivables', 'help'], {cwd: consumer});
      need(['bank-source-inspect', 'bank-source-import', 'bank-posting-preview', 'bank-receipts-post',
        'bank-import-close', 'bank-file', '--source'].every(command => nativeHelp.includes(command)),
        'PACKAGE_BANK_NATIVE_COMMAND', 'The installed native command is missing the original bank workflow.');
    }
    phase = 'installed-exports';
    const importProgram = [
      "const name = process.argv[1], bank = process.argv[2] === 'bank';",
      "const client = await import(name + '/merchant/accounting-receivables');",
      "const operations = await import(name + '/merchant/accounting-receivables/operations');",
      "for (const key of ['createAccountingReceivablesClient','connectAccountingReceivablesClient','accountingInvoiceIssueArguments','accountingPaymentRequestArguments'])",
      "  if (typeof client[key] !== 'function') throw new Error('Missing installed client export: ' + key);",
      "for (const key of ['prepareAccountingReceivablesOperation','runAccountingReceivablesOperation','downloadAccountingReceivablesFile'])",
      "  if (typeof operations[key] !== 'function') throw new Error('Missing installed operations export: ' + key);",
      "const count = Object.keys(client.ACCOUNTING_RECEIVABLES_METHODS).length;",
      "if (count !== (bank ? 46 : 24)) throw new Error('Incomplete installed receivables operation map: ' + count);",
      "let httpMethods = null, bankOperations = null;",
      "if (bank) {",
      "  const http = await import(name + '/merchant/receivables/client');",
      "  httpMethods = ['bankAccounts','saveBankAccount','inspectBankSource','importBankSource','bankImports','bankImport','previewBankPosting','postBankReceipts','ignoreBankRows','restoreBankRows','closeBankImport','bankImportFile'];",
      "  for (const method of httpMethods) if (typeof http.ReceivablesClient?.prototype[method] !== 'function') throw new Error('Missing installed HTTP bank method: ' + method);",
      "  bankOperations = ['bank_accounts','bank_account_save','bank_source_inspect','bank_source_import','bank_import_list','bank_import_detail','bank_posting_preview','bank_receipts_post','bank_rows_ignore','bank_rows_restore','bank_import_close'];",
      "  for (const operation of bankOperations) if (!Object.values(client.ACCOUNTING_RECEIVABLES_METHODS).includes(operation)) throw new Error('Missing installed bank operation: ' + operation);",
      "  for (const key of ['accountingBankPostingPreview','accountingBankPostingArguments','accountingRefundArguments','accountingCreditDispositionArguments']) if (typeof client[key] !== 'function') throw new Error('Missing installed reviewed cash helper: ' + key);",
      "}",
      "console.log(JSON.stringify({client:true,operations:true,nativeOperations:count,bank,httpMethods,bankOperations}));",
    ].join('\n');
    const imported = JSON.parse(run(process.execPath,
      ['--input-type=module', '--eval', importProgram, metadata.name, bank ? 'bank' : 'collection'], {cwd: consumer}));
    const installedSource = [];
    if (bank) {
      phase = 'installed-bank-source';
      for (const path of bankRequired) {
        const bytes = await readFile(join(consumer, 'node_modules', metadata.name, 'source', path));
        const original = run('git', ['-C', repo, 'show', commit + ':' + path], {encoding: null});
        need(bytes.length === original.length && hash(bytes) === hash(original),
          'PACKAGE_INSTALLED_SOURCE', 'The installed original bank source differs from the selected commit: ' + path);
        installedSource.push({path, bytes: bytes.length, sha256: hash(bytes)});
      }
    }
    const result = {schema: 'stellar-forge.selected-receivables-receiving.v1',
      status: 'RECEIVED', sourceCommit: commit, sourceSelection: selection,
      build: built, manifestSha256: hash(await readFile(join(stage, 'manifest.json'))),
      packagedRuntimeEntries: required.length,
      nativeMcpVersion: mcpVersion, nativePeers: manifest.optionalNativePeers,
      installedCommand: {command: 'starforge merchant-accounting-receivables --help',
        exitCode: 0, outputBytes: Buffer.byteLength(help), sha256: hash(help)},
      installedExports: imported, bank,
      ...(bank ? {installedBankSources: installedSource,
        installedNativeCommand: {command: 'starforge receivables help', exitCode: 0,
          outputBytes: Buffer.byteLength(nativeHelp), sha256: hash(nativeHelp)}} : {}),
      installation: {directory: consumer, outputBytes: Buffer.byteLength(installOutput)},
      completedAt: new Date().toISOString()};
    const resultFile = join(out, 'selected-receivables-receiving-' + Date.now() + '.json');
    await privateJson(resultFile, result);
    return {...result, resultFile};
  } catch (error) {
    error.phase = phase; error.sourceCommit = commit; error.output = out;
    throw error;
  }
}
async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('node SELECTED_RECEIVABLES_CHECK.mjs --repo CHECKOUT --ref ORIGINAL_COMMIT --out PRIVATE_DIRECTORY [--resume] [--offline] [--bank] [--python EXECUTABLE]');
    return;
  }
  const input = flags(args);
  const result = await receiveSelectedReceivables({repository: input['--repo'], ref: input['--ref'],
    output: input['--out'], resume: input['--resume'], offline: input['--offline'], bank: input['--bank'], python: input['--python']});
  process.stdout.write(json(result));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(json({status: 'FAILED', phase: error.phase ?? 'source',
      code: error.code ?? 'ERROR', message: error.message,
      sourceCommit: error.sourceCommit, output: error.output,
      nativeStderr: error.stderr?.toString().slice(-12000)}));
    process.exitCode = 1;
  });
