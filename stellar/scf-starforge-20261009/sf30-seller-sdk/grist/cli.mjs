// MIT. Discover, resume, inspect, transfer and freeze original Grist observations.
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { open, lstat, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { bytes, digest, readPrivate, privateDirectory, acquireWorkspace, syncDirectory, fault } from '../postgres/publisher/files.mjs';
import { readGristSourceFile } from './declaration.mjs';
import { captureGristSource, importGristCapture, readGristCapture, bindGristCapture,
  inspectGristCaptureAttempt, exportGristCapturePacket, importGristCapturePacket } from './capture.mjs';
import { discoverGristTable } from './http.mjs';
import { inspectGristSource } from './source.mjs';

const HELP = 'Grist source, original publisher and managed deployment\n\n' +
  '  discover --source PRIVATE_REST_SOURCE.json\n' +
  '  inspect --source PRIVATE_SOURCE.json\n' +
  '  capture --source PRIVATE_REST_SOURCE.json --out PRIVATE_CAPTURE_DIRECTORY [--resume]\n' +
  '  attempt --capture PRIVATE_CAPTURE_DIRECTORY\n' +
  '  import --source PRIVATE_SOURCE.json --capture ORIGINAL_CAPTURE.json --out PRIVATE_CAPTURE_DIRECTORY [--resume]\n' +
  '  packet-export --capture ORIGINAL_CAPTURE.json --out PRIVATE_PACKET.json [--resume]\n' +
  '  packet-import --source PRIVATE_SOURCE.json --packet PRIVATE_PACKET.json --out PRIVATE_CAPTURE_DIRECTORY [--resume]\n' +
  '  freeze --source PRIVATE_SOURCE.json --capture ORIGINAL_CAPTURE.json --out PRIVATE_SOURCE.json [--resume]\n' +
  '  publisher --help\n  deployment --help\n  workspace --help\n\n' +
  'Discovery reads original metadata only; queries may be empty while choosing actual field keys.\n' +
  'Capture uses native membership filters and an explicit native order ending in id.\n' +
  'Both complete typed record responses, column metadata and document history heads are retained.\n' +
  'The result is the selected account\'s visible table rows; no atomic snapshot or independent count is claimed.\n' +
  'Resume reuses the original step receipts and credential binding. Private packet import/freeze makes no provider call.\n';
const defs = {
  discover: { required: ['--source'] }, inspect: { required: ['--source'] },
  capture: { required: ['--source', '--out'], resume: true },
  attempt: { required: ['--capture'] },
  import: { required: ['--source', '--capture', '--out'], resume: true },
  'packet-export': { required: ['--capture', '--out'], resume: true },
  'packet-import': { required: ['--source', '--packet', '--out'], resume: true },
  freeze: { required: ['--source', '--capture', '--out'], resume: true },
};
function parse(argv) {
  const [command, ...args] = argv, def = defs[command], options = {};
  if (!def) throw fault('GRIST_COMMAND_REQUIRED', HELP);
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (Object.hasOwn(options, key)) throw fault('GRIST_OPTION_DUPLICATE');
    if (key === '--resume' && def.resume) { options[key] = true; continue; }
    if (!def.required.includes(key) || !args[index + 1] || args[index + 1].startsWith('--')) throw fault('GRIST_OPTION_INVALID', HELP);
    options[key] = resolve(args[++index]);
  }
  if (def.required.some(key => !options[key])) throw fault('GRIST_REQUIRED_OPTIONS', HELP);
  return { command, options };
}
async function retainFile(filename, content, resume) {
  const parent = dirname(filename); await privateDirectory(parent);
  const release = await acquireWorkspace(parent);
  try {
    let present = true; try { await lstat(filename); } catch (issue) { if (issue.code !== 'ENOENT') throw issue; present = false; }
    if (present) {
      if (!resume) throw fault('GRIST_OUTPUT_EXISTS', 'Use a new output or explicit same-byte resume.');
      const original = await readPrivate(filename, content.length);
      if (!original.equals(content)) throw fault('GRIST_OUTPUT_CHANGED');
      return { reused: true, file: filename, bytes: content.length, sha256: digest(content) };
    }
    const temp = join(parent, '.grist-output-' + randomUUID());
    const handle = await open(temp, 'wx', 0o600);
    try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
    // The original exclusive directory lease owns this create-only publication.
    try { await lstat(filename); throw fault('GRIST_OUTPUT_CHANGED'); } catch (issue) { if (issue.code !== 'ENOENT') throw issue; }
    await rename(temp, filename); await syncDirectory(parent);
    return { reused: false, file: filename, bytes: content.length, sha256: digest(content) };
  } finally { await release(); }
}
export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === '--help') { process.stdout.write(HELP); return; }
  if (argv[0] === 'publisher') return (await import('./publisher/cli.mjs')).main(argv.slice(1));
  if (argv[0] === 'deployment') return (await import('./deployment-cli.mjs')).main(argv.slice(1));
  if (argv[0] === 'workspace') return (await import('./workspace/cli.mjs')).main(argv.slice(1));
  const { command, options } = parse(argv), resume = options['--resume'] ?? false;
  const selected = options['--source'] ? await readGristSourceFile(options['--source'], { allowUnprojected: command === 'discover' }) : null;
  let result;
  if (command === 'discover') result = await discoverGristTable(selected.config);
  if (command === 'inspect') result = await inspectGristSource(options['--source']);
  if (command === 'attempt') result = await inspectGristCaptureAttempt(options['--capture']);
  if (command === 'capture' || command === 'import' || command === 'packet-import') {
    await privateDirectory(dirname(options['--out']));
    const capture = command === 'capture' ? await captureGristSource(selected.config, options['--out'], { resume }) :
      command === 'import' ? await importGristCapture(options['--capture'], options['--out'], selected.config, { resume }) :
      await importGristCapturePacket(await readPrivate(options['--packet'], 400 * 1024 * 1024), options['--out'], selected.config, { resume });
    result = { file: capture.manifestFile, sha256: capture.manifestSha256, ...capture.manifest };
  }
  if (command === 'packet-export') {
    const capture = await readGristCapture(options['--capture']);
    result = await retainFile(options['--out'], await exportGristCapturePacket(capture), resume);
  }
  if (command === 'freeze') {
    const capture = await readGristCapture(options['--capture']); bindGristCapture(capture, selected.config);
    const config = { ...selected.config, connection: { kind: 'capture', file: capture.manifestFile, sha256: capture.manifestSha256 } };
    const retained = await retainFile(options['--out'], bytes(config), resume);
    result = { ...retained, sourceSha256: (await readGristSourceFile(options['--out'])).hash, captureSha256: capture.manifestSha256 };
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n'); return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(issue => { process.stderr.write((issue.code ?? 'GRIST_SOURCE') + ': ' +
    (issue.code ? issue.message : 'Review the selected private inputs.') + '\n'); process.exitCode = 1; });
