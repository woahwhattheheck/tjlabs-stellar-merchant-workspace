#!/usr/bin/env node
// MIT. Complete original merchant/source handover through the product's native writers.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readSf61HostFile } from '../../stellar-forge/mcp-merchant-operator/sf61-connection.mjs';
import {
  inventoryCapturedHandover, prepareCapturedHandover, publishCapturedHandover,
  inspectCapturedHandover, reviewCapturedHandoverReceive, receiveCapturedHandover,
  inspectCapturedHandoverReceive,
} from './handover.mjs';
import { METADATA_LIMIT, decode } from './handover-files.mjs';

const HELP = 'Complete captured merchant handover\n\n' +
  '  starforge captured-api handover inventory --dir PRIVATE_PRODUCT\n' +
  '  starforge captured-api handover prepare --dir PRIVATE_PRODUCT\n' +
  '       --selection PRIVATE_SELECTION.json --out NEW_PRIVATE_HANDOVER\n' +
  '  starforge captured-api handover publish --out PRIVATE_HANDOVER\n' +
  '       --review-sha256 ORIGINAL_REVIEW_SHA256\n' +
  '  starforge captured-api handover inspect --bundle PRIVATE_HANDOVER\n' +
  '       [--manifest-sha256 ORIGINAL_HANDOVER_MANIFEST_SHA256]\n' +
  '  starforge captured-api handover receive-review --dir RECEIVING_PRODUCT\n' +
  '       --bundle PRIVATE_HANDOVER [--manifest-sha256 ORIGINAL_MANIFEST_SHA256]\n' +
  '       [--names PRIVATE_PACKAGE_NAME_MAP.json]\n' +
  '  starforge captured-api handover receive --dir RECEIVING_PRODUCT\n' +
  '       --bundle PRIVATE_HANDOVER --review-sha256 ORIGINAL_RECEIVING_REVIEW_SHA256\n' +
  '       [--manifest-sha256 ORIGINAL_MANIFEST_SHA256] [--names PRIVATE_PACKAGE_NAME_MAP.json]\n' +
  '  starforge captured-api handover status --dir RECEIVING_PRODUCT\n' +
  '       --operation ORIGINAL_RECEIVING_OPERATION_ID\n\n' +
  'prepare opens and copies the original selected packages and full captured histories.\n' +
  'Review handover-review.json, then publish its exact returned SHA-256. Move the whole\n' +
  'directory to the receiving host, inspect it, review names and receive the collection.\n' +
  'Repeat the same prepare or receive command to continue its retained native operation.\n' +
  'status reopens received sources/packages after restart without the original bundle.\n' +
  'Original consoles must be open for new source/package mutations. Publish, inspect,\n' +
  'receive-review and status use the complete retained files and can run offline.\n\n' +
  'Use absolute private paths. Every JSON input is read as one original private file.\n' +
  'See products/captured-api/HANDOVER.md for complete selections, recovery and reopen.\n';

const error = message => Object.assign(new Error(message), {code:'CAPTURED_HANDOVER_ARGUMENTS'});
function options(args, allowed, required) {
  const result = new Map();
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (!allowed.includes(name) || result.has(name)) throw error('Unknown or repeated option: ' + name);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw error('Supply the value for ' + name + '.');
    result.set(name,value);
  }
  for (const name of required) if (!result.has(name)) throw error('Supply ' + name + '.');
  return result;
}
async function originalJSON(path) {
  return decode(await readSf61HostFile(resolve(path),METADATA_LIMIT,{privateFile:true}));
}
function report(issue) {
  process.stderr.write((issue.code ? issue.code + ': ' : '') + issue.message + '\n');
  if (issue.outcomeUnknown) process.stderr.write(
    'The native operation may already have completed. Repeat the same request or reopen its retained receiving status.\n');
  process.exitCode = 1;
}
export async function runCapturedHandoverCLI(args = process.argv.slice(2)) {
  if (!args.length || args.length === 1 && ['help','--help'].includes(args[0])) {
    process.stdout.write(HELP); return;
  }
  const [command,...rest] = args;
  if (rest.length === 1 && rest[0] === '--help') {process.stdout.write(HELP);return;}
  let result;
  if (command === 'inventory') {
    const input = options(rest,['--dir'],['--dir']);
    result = await inventoryCapturedHandover({directory:input.get('--dir')});
  } else if (command === 'prepare') {
    const input = options(rest,['--dir','--selection','--out'],['--dir','--selection','--out']);
    result = await prepareCapturedHandover({directory:input.get('--dir'),out:input.get('--out'),
      request:await originalJSON(input.get('--selection'))});
  } else if (command === 'publish') {
    const input = options(rest,['--out','--review-sha256'],['--out','--review-sha256']);
    result = await publishCapturedHandover({out:input.get('--out'),expectedReviewSha256:input.get('--review-sha256')});
  } else if (command === 'inspect') {
    const input = options(rest,['--bundle','--manifest-sha256'],['--bundle']);
    result = await inspectCapturedHandover({bundle:input.get('--bundle'),expectedManifestSha256:input.get('--manifest-sha256')});
  } else if (command === 'receive-review' || command === 'receive') {
    const allowed = ['--dir','--bundle','--manifest-sha256','--names'];
    if (command === 'receive') allowed.push('--review-sha256');
    const input = options(rest,allowed,['--dir','--bundle',...(command === 'receive'?['--review-sha256']:[])]);
    const selected = {directory:input.get('--dir'),bundle:input.get('--bundle'),
      expectedManifestSha256:input.get('--manifest-sha256'),
      ...(input.has('--names') ? {names:await originalJSON(input.get('--names'))} : {})};
    result = command === 'receive-review' ? await reviewCapturedHandoverReceive(selected)
      : await receiveCapturedHandover({...selected,expectedReviewSha256:input.get('--review-sha256')});
  } else if (command === 'status') {
    const input = options(rest,['--dir','--operation'],['--dir','--operation']);
    result = await inspectCapturedHandoverReceive({directory:input.get('--dir'),operationId:input.get('--operation')});
  } else throw error('Unknown handover command. Use --help.');
  process.stdout.write(JSON.stringify(result,null,2) + '\n');
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  runCapturedHandoverCLI().catch(report);
