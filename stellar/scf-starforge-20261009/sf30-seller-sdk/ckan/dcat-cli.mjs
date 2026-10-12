#!/usr/bin/env node
// MIT. DCAT catalog operations through the original retained workspace and loopback service.
import { resolve, dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { verifyDcatManagedSelection } from '../../distribution/runtime-workspace/application-dcat.mjs';
import { openCkanWorkbench } from './model.mjs';
import { parseCkanJson } from './capture.mjs';
import { startCkanServer } from './server.mjs';
import { inspectCkanWorkspaceArchive, receiveCkanWorkspaceArchive } from './archive.mjs';
import { readPrivate, createFile, privateDirectory, digest, fault } from '../postgres/publisher/files.mjs';

const usage = [
  'DCAT catalog migration workspace',
  '  dcat init --workspace DIR --origin https://publisher.example',
  '  dcat serve --workspace DIR [--port 0]',
  '  dcat status --workspace DIR',
  '  dcat import --workspace DIR --file FILE.json [--profile auto|1.1|3.0] [--label TEXT] [--origin URL] [--sha256 HASH]',
  '  dcat review --workspace DIR --source ID [--comparison ID] [--candidate ID] [--mappings FILE.json] [--label TEXT] [--normalize-v3 true]',
  '  dcat inspect --workspace DIR --review ID',
  '  dcat cutover --workspace DIR --review ID --expected-active none|ID --note TEXT [--review-sha256 HASH] [--candidate-sha256 HASH]',
  '  dcat rollback --workspace DIR --release ID --expected-active ID --note TEXT [--review-sha256 HASH] [--candidate-sha256 HASH]',
  '  dcat export --workspace DIR --kind candidate|report --review ID --out FILE.json',
  '  dcat export --workspace DIR --kind original --catalog ID --out FILE.json',
  '  dcat export --workspace DIR --kind current --out FILE.json',
  '  dcat archive --workspace DIR --out FILE.ckanw',
  '  dcat inspect-archive --file FILE.ckanw [--sha256 HASH]',
  '  dcat receive --file FILE.ckanw --sha256 HASH --workspace NEW_DIR',
  'Set SCF_DCAT_PYTHON to the absolute Python 3.13 executable prepared by DCAT_ENGINE.md.',
  'Catalog originals, corrected candidates, full reviews and release history remain in the same saved project.',
].join('\n');
const output = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const optionsByCommand = {
  init: ['workspace', 'origin'], serve: ['workspace', 'port', 'managed-selection'],
  status: ['workspace'], import: ['workspace', 'file', 'profile', 'label', 'origin', 'sha256'],
  review: ['workspace', 'source', 'comparison', 'candidate', 'mappings', 'label', 'normalize-v3'],
  inspect: ['workspace', 'review'], cutover: ['workspace', 'review', 'expected-active', 'note', 'review-sha256', 'candidate-sha256'],
  rollback: ['workspace', 'release', 'expected-active', 'note', 'review-sha256', 'candidate-sha256'],
  export: ['workspace', 'kind', 'review', 'catalog', 'out'], archive: ['workspace', 'out'],
  'inspect-archive': ['file', 'sha256'], receive: ['file', 'sha256', 'workspace'],
};
export async function main(supplied = process.argv.slice(2)) {
  const argv = [...supplied], command = argv.shift(), options = {};
  if (!command || ['help', '--help'].includes(command)) { process.stdout.write(usage + '\n'); return; }
  if (!optionsByCommand[command]) throw fault('DCAT_COMMAND_UNKNOWN', usage);
  for (let i = 0; i < argv.length; i += 2) {
    if (!/^--[a-z][a-z-]*$/.test(argv[i]) || argv[i + 1] === undefined || argv[i + 1].startsWith('--'))
      throw fault('DCAT_COMMAND_ARGUMENTS', 'Use named --option value arguments.\n' + usage);
    const key = argv[i].slice(2);
    if (!optionsByCommand[command].includes(key) || Object.hasOwn(options, key))
      throw fault('DCAT_COMMAND_ARGUMENTS', 'Unknown or repeated option: --' + key);
    options[key] = argv[i + 1];
  }
  const required = name => {
    if (!options[name]) throw fault('DCAT_COMMAND_ARGUMENTS', 'Supply --' + name + '.');
    return options[name];
  };
  if (command === 'inspect-archive') {
    output(await inspectCkanWorkspaceArchive({ file: resolve(required('file')), expectedSha256: options.sha256 })); return;
  }
  if (command === 'receive') {
    output(await receiveCkanWorkspaceArchive({ file: resolve(required('file')), directory: resolve(required('workspace')),
      expectedSha256: required('sha256') })); return;
  }
  const project = await openCkanWorkbench({ directory: resolve(required('workspace')), create: command === 'init',
    ...(command === 'init' ? { sourceKind: 'dcat-us', origin: required('origin') } : {}) });
  let served = false;
  try {
    if (command === 'serve') {
      let selection;
      if (options['managed-selection']) {
        try { selection = JSON.parse(options['managed-selection']); }
        catch { throw fault('DCAT_MANAGED_SELECTION_INVALID'); }
        await verifyDcatManagedSelection(selection, { directory: project.directory,
          sourceRoot: resolve(fileURLToPath(new URL('../../../../', import.meta.url))) });
      }
      const web = await startCkanServer({ workbench: project, port: Number(options.port ?? 0) });
      const state = project.status();
      process.stdout.write(JSON.stringify({ schema: 'stellar-forge.dcat-workbench-startup.v1', pid: process.pid, directory: project.directory,
        projectCreatedAt: state.createdAt, catalogOrigin: state.catalogOrigin, sourceKind: state.sourceKind,
        instanceId: web.instanceId, origin: web.origin, url: web.url }) + '\n');
      served = true; let ending = false;
      const shutdown = async () => {
        if (ending) return; ending = true;
        await web.close(); await project.close();
      };
      process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
      return { project, ...web, shutdown };
    }
    let result;
    if (command === 'init' || command === 'status') result = project.status();
    else if (command === 'import') result = project.importDcatCatalog({ file: resolve(required('file')),
      profile: options.profile ?? 'auto', label: options.label ?? 'Catalog edition', origin: options.origin,
      expectedSha256: options.sha256 });
    else if (command === 'review') {
      let mappings;
      if (options.mappings) {
        mappings = parseCkanJson(await readFile(resolve(options.mappings)));
        if (!Array.isArray(mappings)) throw fault('DCAT_MAPPINGS_INVALID', 'The mappings file must contain a JSON array.');
      }
      if (options['normalize-v3'] !== undefined && !['true', 'false'].includes(options['normalize-v3']))
        throw fault('DCAT_COMMAND_ARGUMENTS', 'Use --normalize-v3 true or false.');
      result = project.prepareDcatReview({ sourceId: required('source'), comparisonId: options.comparison,
        candidateId: options.candidate, identityMappings: mappings, label: options.label,
        normalizeV3: options['normalize-v3'] === 'true' });
    } else if (command === 'inspect') result = await project.dcatReview(required('review'));
    else if (command === 'cutover' || command === 'rollback') {
      const expected = required('expected-active'), input = {
        expectedActiveReleaseId: expected === 'none' ? null : expected, note: required('note'),
        expectedReviewSha256: options['review-sha256'], expectedCandidateSha256: options['candidate-sha256'],
      };
      result = command === 'cutover' ? project.cutoverDcat({ ...input, reviewId: required('review') }) :
        project.rollbackDcat({ ...input, releaseId: required('release') });
    } else if (command === 'export') {
      const kind = required('kind');
      let selected;
      if (kind === 'current') selected = await project.dcatCurrentDownload();
      else if (kind === 'original') selected = await project.dcatCatalogDownload(required('catalog'));
      else if (['candidate', 'report'].includes(kind)) selected = await project.dcatReviewDownload(required('review'), kind);
      else throw fault('DCAT_DOWNLOAD_KIND', 'Choose original, candidate, report or current.');
      const raw = await readPrivate(selected.file, selected.bytes);
      if (raw.length !== selected.bytes || digest(raw) !== selected.sha256) throw fault('DCAT_RETAINED_EDITION_CHANGED');
      const out = resolve(required('out')); await privateDirectory(dirname(out)); await createFile(out, raw);
      result = { kind, out, bytes: raw.length, sha256: selected.sha256, id: selected.id,
        ...(selected.releaseId ? { releaseId: selected.releaseId } : {}) };
    } else if (command === 'archive') result = project.archiveWorkspace({ out: resolve(required('out')) });
    if (result?.completion) {
      result = await result.completion; output(result);
      if (result.state !== 'COMPLETE') process.exitCode = 1;
    } else output(result);
  } finally { if (!served) await project.close(); }
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href)
  main().catch(error => { process.stderr.write((error.code ?? 'DCAT_COMMAND_FAILED') + ': ' + error.message + '\n'); process.exitCode = 1; });
