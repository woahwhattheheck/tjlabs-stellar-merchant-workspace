#!/usr/bin/env node
// MIT. Provider-specific setup and the original paid Jobs operator command.
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  absolute, ownedDirectory, ownedBytes, writeExact, encoded, parse, digest
} from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/configuration.mjs';
import {runJobCommand} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/jobs/cli.mjs';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {
  documentProviders, documentPriceReview, documentError
} from './contracts.mjs';
import {
  documentSetupTemplate, prepareDocumentMerchant, inspectDocumentMerchant, readDocumentSetupRequest
} from './setup.mjs';
import {readDocumentSupplierUsage} from './renderer.mjs';

const HELP = [
  'Starforge document merchant', '',
  'Install and run a complete HTML or Markdown document service on the existing paid Jobs engine.', '',
  '  document-merchant providers',
  '  document-merchant template --provider mintpdf|snaplab|pdfmint [--anonymous] [--out NEW_FILE]',
  '  document-merchant prepare --request FILE --directory DIR',
  '  document-merchant inspect --directory DIR',
  '  document-merchant price --directory DIR [--documents N] [--supplier-units N]',
  '  document-merchant usage --directory DIR --out NEW_PRIVATE_FILE',
  '  document-merchant customer-setup --directory DIR [--out NEW_FILE]',
  '  document-merchant serve --directory DIR [original jobs serve options]',
  '  document-merchant jobs --directory DIR COMMAND [original jobs command options]', '',
  'Prepare retains one complete provider application and the original Jobs configuration.',
  'Supply actual merchant payment terms in the template before preparing.',
  'Provider credentials are environment values; configuration names the variable only.',
  'usage performs the documented read-only provider account request and saves its full response.',
  'Snaplab accepts HTML; MintPDF and PDFMint also accept Markdown.', '',
  'serve uses the original Jobs service, native factory, worker and customer/operator workspaces.',
  'For native payments include --native-factory MODULE and --start-worker.',
  'jobs forwards the original status, create, work, show, outputs, output-file, retry and cancel operations.',
  'The original customer Request application stages the whole source file before checkout.'
].join('\n');
function commandError(message) {return documentError('DOCUMENT_COMMAND_INVALID', message);}
function options(argv, allowed, booleans = []) {
  const out = new Map();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!allowed.includes(flag) || out.has(flag)) throw commandError('Unknown or repeated option: ' + flag);
    if (booleans.includes(flag)) {out.set(flag, true); continue;}
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw commandError('Supply a value for ' + flag + '.');
    out.set(flag, value);
  }
  return out;
}
function required(out, flag) {
  if (!out.has(flag)) throw commandError('Supply ' + flag + '.');
  return out.get(flag);
}
function count(out, flag, fallback) {
  const value = out.get(flag);
  if (value === undefined) return fallback;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw commandError(flag + ' requires a whole nonnegative number.');
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw commandError(flag + ' exceeds the supported count.');
  return number;
}
async function save(path, value) {
  path = absolute(path);
  await ownedDirectory(dirname(path), {create: true});
  const bytes = encoded(value), lease = await acquireStateLease(dirname(path));
  try {
    lease.assertHeld();
    await writeExact(path, bytes);
    return {path, bytes: bytes.length, sha256: digest(bytes)};
  } finally {await lease.close();}
}
function forwarded(argv) {
  const position = argv.indexOf('--directory');
  if (position < 0 || argv.lastIndexOf('--directory') !== position || !argv[position + 1] ||
    argv[position + 1].startsWith('--')) throw commandError('Supply one --directory DIR.');
  const rest = [...argv.slice(0, position), ...argv.slice(position + 2)];
  if (rest.some(value => value === '--config' || value === '--state'))
    throw commandError('The retained document setup selects its original Jobs configuration and state.');
  return {directory: argv[position + 1], rest};
}
export async function runDocumentCommand(argv = process.argv.slice(2), {print = value => console.log(value)} = {}) {
  if (!argv.length || argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0])) return print(HELP);
  const [command, ...tail] = argv;
  const emit = value => print(JSON.stringify(value, null, 2));
  if (command === 'providers') {
    if (tail.length) throw commandError('providers takes no options.');
    return emit(documentProviders());
  }
  if (command === 'template') {
    const out = options(tail, ['--provider', '--anonymous', '--out'], ['--anonymous']);
    const value = documentSetupTemplate(required(out, '--provider'), {anonymous: out.has('--anonymous')});
    return emit(out.has('--out') ? await save(out.get('--out'), value) : value);
  }
  if (command === 'prepare') {
    const out = options(tail, ['--request', '--directory']);
    return emit(await prepareDocumentMerchant({
      request: await readDocumentSetupRequest(required(out, '--request')),
      directory: required(out, '--directory')
    }));
  }
  if (command === 'serve' || command === 'jobs') {
    const selected = forwarded(tail);
    const installation = await inspectDocumentMerchant(selected.directory);
    let operation, rest;
    if (command === 'serve') {operation = 'serve'; rest = selected.rest;}
    else {
      [operation, ...rest] = selected.rest;
      if (!operation || operation.startsWith('--')) throw commandError('Supply the original Jobs command.');
    }
    if (['inputs', 'delivery', 'receiver', 'recovery'].includes(operation))
      throw commandError('Use the original jobs ' + operation + ' command with jobsConfig and merchantState from inspect.');
    return runJobCommand([operation, '--config', installation.jobsConfig, '--state', installation.merchantState,
      ...rest], {print});
  }
  const allowed = {
    inspect: ['--directory'], price: ['--directory', '--documents', '--supplier-units'],
    usage: ['--directory', '--out'], 'customer-setup': ['--directory', '--out']
  };
  if (!Object.hasOwn(allowed, command)) throw commandError('Choose a command from --help.');
  const out = options(tail, allowed[command]);
  const installation = await inspectDocumentMerchant(required(out, '--directory'));
  if (command === 'inspect') return emit(installation);
  if (command === 'price') {
    const documents = count(out, '--documents', 1);
    return emit({
      ...documentPriceReview(installation.provider,
        {documents, supplierUnits: count(out, '--supplier-units', documents)}),
      merchantPaymentPerDocument: installation.payment,
      customerTaskUnits: {documentRequests: documents, outputPackages: documents, parentTaskCount: null},
      meaning: 'Each document request has one merchant payment and one output package. Parent-task count comes from the original task references and complete customer acceptance. Supplier units may differ for cache hits or explicit rerenders.'
    });
  }
  if (command === 'usage') {
    const destination = required(out, '--out');
    const result = await readDocumentSupplierUsage(installation.provider);
    const saved = await save(destination, result);
    return emit({provider: result.provider, observedAt: result.observedAt,
      originalAccountUrl: result.url, retainedAccountResponse: saved});
  }
  const value = parse(await ownedBytes(installation.customerSetup, 1048576));
  return emit(out.has('--out') ? await save(out.get('--out'), value) : value);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDocumentCommand().catch(error => {
    console.error(error.code ? error.code + ': ' + error.message : error.message);
    process.exitCode = 1;
  });
}
