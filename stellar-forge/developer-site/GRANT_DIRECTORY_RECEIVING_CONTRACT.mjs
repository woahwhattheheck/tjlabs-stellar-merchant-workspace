// Focused offline contract for distinct Directory manuscript/receipt outputs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDirectoryGrantReceiving } from './grant-directory.mjs';

const heading = '### Service-directory commissioning and referral destinations';
const manuscript = '# SCF\n\n## Referral implementation: source changes, returned outcomes and complete receiving\n\n' +
  heading + '\nOld Directory chapter.\n\n## Following chapter\nRetained.\n';
const chapter = heading + '\nNew Directory chapter.\n';
const start = manuscript.indexOf(heading);
const end = manuscript.indexOf('## Following chapter');
const expected = createHash('sha256').update(manuscript.slice(start, end)).digest('hex');
const directory = await mkdtemp(join(tmpdir(), 'scf-directory-receiving-'));

try {
  const manuscriptPath = join(directory, 'manuscript.md');
  const chapterPath = join(directory, 'chapter.md');
  await writeFile(manuscriptPath, manuscript);
  await writeFile(chapterPath, chapter);
  const base = ['--manuscript', manuscriptPath, '--chapter', chapterPath,
    '--expected-directory-sha256', expected];

  const shared = join(directory, 'shared-output.json');
  await assert.rejects(
    runDirectoryGrantReceiving([...base, '--out', shared, '--receipt', shared]),
    /distinct paths/
  );
  await assert.rejects(stat(shared), error => error?.code === 'ENOENT');

  const out = join(directory, 'received.md');
  const receipt = join(directory, 'receipt.json');
  const result = await runDirectoryGrantReceiving([...base, '--out', out, '--receipt', receipt]);
  assert.equal(result.schema, 'stellar-forge.directory-grant-chapter-receiving.v1');
  assert.match(await readFile(out, 'utf8'), /New Directory chapter\./);
  assert.equal(JSON.parse(await readFile(receipt, 'utf8')).after.sha256, result.after.sha256);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log(JSON.stringify({ aliasedDestinationRejectedBeforeWrite: true, distinctOutputs: true }));
