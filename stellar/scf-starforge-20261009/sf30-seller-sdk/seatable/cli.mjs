// MIT. Discover, resume, inspect, transfer and freeze original SeaTable observations.
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { open, lstat, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { bytes, digest, readPrivate, privateDirectory, acquireWorkspace, syncDirectory, fault } from '../postgres/publisher/files.mjs';
import { readSeaTableSourceFile } from './declaration.mjs';
import { captureSeaTableSource, importSeaTableCapture, readSeaTableCapture, bindSeaTableCapture,
  inspectSeaTableCaptureAttempt, exportSeaTableCapturePacket, importSeaTableCapturePacket } from './capture.mjs';
import { discoverSeaTableTable } from './http.mjs';
import { inspectSeaTableSource } from './source.mjs';

const HELP = 'SeaTable source, original publisher and managed deployment\n\n' +
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
  'SQL mode uses reviewed filter parameters and native _id order, with actual opening/closing counts.\n' +
  'Native view mode preserves the original visible columns, filters and order, with no invented count.\n' +
  'Capture retains every original page and the actual empty terminal page. Resume uses the same saved read.\n' +
  'Complete packet import/freeze make no provider call. Private raw view captures contain all visible columns.\n';
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
  if (!def) throw fault('SEATABLE_COMMAND_REQUIRED', HELP);
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (Object.hasOwn(options, key)) throw fault('SEATABLE_OPTION_DUPLICATE');
    if (key === '--resume' && def.resume) { options[key] = true; continue; }
    if (!def.required.includes(key) || !args[index + 1] || args[index + 1].startsWith('--')) throw fault('SEATABLE_OPTION_INVALID', HELP);
    options[key] = resolve(args[++index]);
  }
  if (def.required.some(key => !options[key])) throw fault('SEATABLE_REQUIRED_OPTIONS', HELP);
  return { command, options };
}
async function retainFile(filename, content, resume) {
  const parent = dirname(filename); await privateDirectory(parent);
  const release = await acquireWorkspace(parent);
  try {
    let present = true; try { await lstat(filename); } catch (issue) { if (issue.code !== 'ENOENT') throw issue; present = false; }
    if (present) {
      if (!resume) throw fault('SEATABLE_OUTPUT_EXISTS', 'Use a new output or explicit same-byte resume.');
      const original = await readPrivate(filename, content.length);
      if (!original.equals(content)) throw fault('SEATABLE_OUTPUT_CHANGED');
      return { reused: true, file: filename, bytes: content.length, sha256: digest(content) };
    }
    const temp = join(parent, '.seatable-output-' + randomUUID());
    const handle = await open(temp, 'wx', 0o600);
    try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
    // The original exclusive directory lease owns this create-only publication.
    try { await lstat(filename); throw fault('SEATABLE_OUTPUT_CHANGED'); } catch (issue) { if (issue.code !== 'ENOENT') throw issue; }
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
  const selected = options['--source'] ? await readSeaTableSourceFile(options['--source'], { allowUnprojected: command === 'discover' }) : null;
  let result;
  if (command === 'discover') result = await discoverSeaTableTable(selected.config);
  if (command === 'inspect') result = await inspectSeaTableSource(options['--source']);
  if (command === 'attempt') result = await inspectSeaTableCaptureAttempt(options['--capture']);
  if (command === 'capture' || command === 'import' || command === 'packet-import') {
    await privateDirectory(dirname(options['--out']));
    const capture = command === 'capture' ? await captureSeaTableSource(selected.config, options['--out'], { resume }) :
      command === 'import' ? await importSeaTableCapture(options['--capture'], options['--out'], selected.config, { resume }) :
      await importSeaTableCapturePacket(await readPrivate(options['--packet'], 400 * 1024 * 1024), options['--out'], selected.config, { resume });
    result = { file: capture.manifestFile, sha256: capture.manifestSha256, ...capture.manifest };
  }
  if (command === 'packet-export') {
    const capture = await readSeaTableCapture(options['--capture']);
    result = await retainFile(options['--out'], await exportSeaTableCapturePacket(capture), resume);
  }
  if (command === 'freeze') {
    const capture = await readSeaTableCapture(options['--capture']); bindSeaTableCapture(capture, selected.config);
    const config = { ...selected.config, connection: { kind: 'capture', file: capture.manifestFile, sha256: capture.manifestSha256 } };
    const retained = await retainFile(options['--out'], bytes(config), resume);
    result = { ...retained, sourceSha256: (await readSeaTableSourceFile(options['--out'])).hash, captureSha256: capture.manifestSha256 };
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n'); return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(issue => { process.stderr.write((issue.code ?? 'SEATABLE_SOURCE') + ': ' +
    (issue.code ? issue.message : 'Review the selected private inputs.') + '\n'); process.exitCode = 1; });
