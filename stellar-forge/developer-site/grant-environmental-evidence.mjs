// MIT. Receive complete environmental evidence through the existing grant source registry.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateGrantProductRegistrations, receiveGrantProductSources, grantProductChapters } from './dist/grant-product-sources-core.mjs';

const need = (v, m) => { if (!v) throw new Error(m); };
const copy = v => JSON.parse(JSON.stringify(v));
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const bytes = text => Buffer.byteLength(text, 'utf8');
export const ENVIRONMENTAL_EVIDENCE_COMMIT = '2232525137522fa22848d6b51dd238653b78eedb';
export const ENVIRONMENTAL_EVIDENCE_FILES = [
  { name: 'environmental-evidence.md', id: 'environment-commercial-phase-guide', label: 'Complete five-workshare environmental scope, 25 phases and receiving evidence', bytes: 8979, sha256: '89729e48d2b35bf3d50f7cbe9e13daaf85529b20aaffc98e9791c53ec5ecfca0', git_blob: '7c8305bde660857845fa089f4ba4b9723efc452b' },
  { name: 'environmental-evidence.json', id: 'environment-commercial-phase-evidence', label: 'Exact environmental phase IDs, effort pointers, proposal amounts and funding separation', bytes: 22055, sha256: 'bfc9b6561c9ba0c4667ef81a70ff1c29178f6505268ad645e0592dce77833af7', git_blob: '8150913585444b1f009c45d75b3bf4b28b566774' },
];
const heading = '## Environmental data installations';
const marker = '### Environmental commissioning: scope, effort and receiving evidence';
const repository = 'woahwhattheheck/tjlabs-stellar-merchant-workspace';
const originalIds = ['environment-installation-laboratory-profile', 'environment-installation-geotech-profile', 'environment-installation-water-quality-profile', 'environment-installation-kiwis-profile', 'environment-installation-operating-guide', 'environment-installation-launcher', 'environment-installation-managed-launcher', 'environment-installation-original-selection', 'environment-installation-private-quickstart', 'environment-installation-complete-private-source'];
const pathFor = row => 'stellar-forge/developer-site/grant-sources/' + row.name;
const linkFor = row => 'https://github.com/' + repository + '/blob/' + ENVIRONMENTAL_EVIDENCE_COMMIT + '/' + pathFor(row);

export function receiveEnvironmentalEvidence({ companion, registration, evidenceMarkdown, evidenceJSON, sourceIndex }) {
  need(typeof companion === 'string' && typeof evidenceMarkdown === 'string' && typeof evidenceJSON === 'string', 'Receive complete UTF-8 source bodies.');
  [evidenceMarkdown, evidenceJSON].forEach((body, i) => {
    const pin = ENVIRONMENTAL_EVIDENCE_FILES[i];
    need(bytes(body) === pin.bytes && digest(body) === pin.sha256, 'Preserve the exact original ' + pin.name + '.');
  });
  const evidence = JSON.parse(evidenceJSON), funding = evidence.funding_separation;
  need(evidence.schema === 'stellar-forge.grant-environmental-evidence-summary.v1', 'Receive the original evidence schema.');
  need(funding.grant_request_usd === 38000 && funding.grant_prospective_hours === 400 && funding.grant_calendar_days === 150 && funding.grant_work_packages === 6 && funding.funded_installations === 2 && funding.commercial_cohort_is_additional_grant_hours === false && funding.commercial_cohort_is_commercial_320_hour_study === false, 'Retain the distinct funded and commercial assignments.');
  let phases = 0, hours = 0, fees = 0, start = 0, accepted = 0;
  need(evidence.cases.length === 5, 'Receive all five original independent plans.');
  for (const item of evidence.cases) {
    need(item.phases.length === 5 && new Set(item.phases.map(p => p.id)).size === 5, 'Receive five original phase identities for ' + item.name);
    let sum = 0;
    for (const p of item.phases) {
      need(typeof p.hours === 'string' && Number.isFinite(Number(p.hours)) && Number(p.hours) > 0 && p.source_pointer && p.source_file && p.basis, 'Retain each complete source-backed effort row.');
      sum += Number(p.hours);
    }
    need(sum === item.planned_hours, 'Match the unchanged plan total for ' + item.name);
    phases += item.phases.length; hours += sum; fees += item.proposed_fee_usd;
    start += item.agreed_start_milestone_usd; accepted += item.accepted_handover_milestone_usd;
  }
  need(phases === 25 && hours === 206 && fees === 24600 && start === 12300 && accepted === 12300, 'Preserve all original commercial totals.');
  const chapters = grantProductChapters(companion).filter(c => c.heading === heading);
  need(chapters.length === 1 && chapters[0].occurrences === 1, 'Select the one existing complete environmental chapter.');
  const beforeChapter = chapters[0].markdown;
  let addition = evidenceMarkdown.replace(/^(#{1,3}) /gm, (_, hashes) => hashes + '## ');
  addition = addition.replace('The adjacent `environmental-evidence.json` supplies', 'The [complete original environmental evidence JSON](' + linkFor(ENVIRONMENTAL_EVIDENCE_FILES[1]) + ') supplies');
  addition += '\nComplete published originals: [scope and all 25 phase rows](' + linkFor(ENVIRONMENTAL_EVIDENCE_FILES[0]) + ') · [machine-readable phase evidence](' + linkFor(ENVIRONMENTAL_EVIDENCE_FILES[1]) + '). These are the unchanged source-observed proposal records.\n';
  let nextChapter;
  if (beforeChapter.includes(marker)) {
    need(beforeChapter.includes(addition.trimEnd()), 'Preserve a differing previously received evidence section for explicit author review.');
    nextChapter = beforeChapter;
  } else nextChapter = beforeChapter.trimEnd() + '\n\n' + addition + '\n';
  const at = companion.indexOf(beforeChapter);
  need(at >= 0 && companion.indexOf(beforeChapter, at + 1) < 0, 'Locate the complete selected chapter exactly once.');
  const nextCompanion = companion.slice(0, at) + nextChapter + companion.slice(at + beforeChapter.length);
  need(registration?.id === 'environmental-installations' && registration.heading === heading, 'Use the original environmental declaration.');
  const nextRegistration = copy(registration);
  for (const id of originalIds) need(nextRegistration.sources.some(s => s.id === id), 'Retain original source ' + id);
  for (const row of ENVIRONMENTAL_EVIDENCE_FILES) {
    const spec = { id: row.id, label: row.label, repository, kind: 'blob', required: false, path: pathFor(row), commit: ENVIRONMENTAL_EVIDENCE_COMMIT, editions: [{ commit: ENVIRONMENTAL_EVIDENCE_COMMIT, bytes: row.bytes, sha256: row.sha256, git_blob: row.git_blob }] };
    const old = nextRegistration.sources.find(s => s.id === row.id);
    if (old) need(JSON.stringify(old) === JSON.stringify(spec), 'Preserve a different current evidence source edition.');
    else nextRegistration.sources.push(spec);
  }
  validateGrantProductRegistrations([nextRegistration]);
  let nextIndex = null;
  if (sourceIndex) {
    const baseline = copy(sourceIndex);
    nextIndex = receiveGrantProductSources(copy(sourceIndex), nextCompanion, [nextRegistration]);
    for (const original of baseline.sources) {
      const selected = nextIndex.sources.find(s => s.id === original.id);
      need(JSON.stringify(selected) === JSON.stringify(original), 'Preserve original source record ' + original.id);
    }
    const added = nextIndex.sources.filter(s => !baseline.sources.some(b => b.id === s.id));
    need(added.every(s => ENVIRONMENTAL_EVIDENCE_FILES.some(f => f.id === s.id)), 'Add only the two selected evidence records.');
    const replay = receiveGrantProductSources(copy(nextIndex), nextCompanion, [nextRegistration]);
    need(JSON.stringify(replay) === JSON.stringify(nextIndex), 'Reopening the same evidence must be identical.');
  }
  return {
    companion: nextCompanion, chapter: nextChapter,
    registration: nextRegistration, sourceIndex: nextIndex,
    receipt: { schema: 'stellar-forge.environmental-evidence-receiving.v1', evidenceCommit: ENVIRONMENTAL_EVIDENCE_COMMIT,
      before: { companionSha256: digest(companion), chapterSha256: digest(beforeChapter) },
      after: { companionSha256: digest(nextCompanion), chapterSha256: digest(nextChapter) },
      outsideChapterUnchanged: true, originalSourceRecordsUnchanged: Boolean(sourceIndex),
      phaseCount: phases, proposedHours: hours, proposedFeesUSD: fees, startUSD: start, acceptedHandoverUSD: accepted,
      funding: copy(funding), applicationChange: false, savedCaseMutation: false, nativeProductRun: false },
  };
}

export async function runEnvironmentalEvidenceReceiving(argv = process.argv.slice(2)) {
  const args = {};
  for (let n = 0; n < argv.length; n += 2) {
    need(['--directory', '--output'].includes(argv[n]) && argv[n + 1] && !args[argv[n]], 'Use --directory ABS_DIST --output NEW_RECEIVING_DIRECTORY.');
    args[argv[n]] = argv[n + 1];
  }
  need(args['--directory'] && args['--output'], 'Select the current cumulative dist and a separate receiving directory.');
  const own = dirname(fileURLToPath(import.meta.url)), directory = resolve(args['--directory']), output = resolve(args['--output']);
  need(output !== directory, 'Write a separate reviewed receiving edition before original composition.');
  const [companion, registration, evidenceMarkdown, evidenceJSON, sourceIndex] = await Promise.all([
    readFile(join(directory, 'grant-data/product-and-finance.md'), 'utf8'),
    readFile(join(own, 'grant-products/environmental-installations.json'), 'utf8'),
    readFile(join(own, 'grant-sources/environmental-evidence.md'), 'utf8'),
    readFile(join(own, 'grant-sources/environmental-evidence.json'), 'utf8'),
    readFile(join(directory, 'grant-data/source-index.json'), 'utf8'),
  ]);
  const result = receiveEnvironmentalEvidence({ companion, registration: JSON.parse(registration), evidenceMarkdown, evidenceJSON, sourceIndex: JSON.parse(sourceIndex) });
  const files = { 'product-and-finance.md': result.companion,
    'environmental-installations.json': JSON.stringify(result.registration, null, 2) + '\n',
    'GRANT_ENVIRONMENTAL_EVIDENCE_CHAPTER.md': result.chapter,
    'source-index-registry-receiving.json': JSON.stringify(result.sourceIndex, null, 2) + '\n',
    'receiving.json': JSON.stringify(result.receipt, null, 2) + '\n' };
  await mkdir(output, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    const path = join(output, name);
    try { await writeFile(path, body, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST' || await readFile(path, 'utf8') !== body) throw error; }
  }
  return { ...result.receipt, output, files: Object.entries(files).map(([path, body]) => ({ path, bytes: bytes(body), sha256: digest(body) })) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runEnvironmentalEvidenceReceiving().then(r => process.stdout.write(JSON.stringify(r, null, 2) + '\n'), e => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; });
}
