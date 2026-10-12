// MIT. Complete original SQLite publisher -> dbt context -> independent editable receiving.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DbtProjectClient } from './client.mjs';
import { DbtSqliteProject } from './publisher.mjs';

const supplied = process.argv.slice(2);
assert(supplied.length === 2 && supplied[0] === '--work', 'Usage: node EXERCISE_PUBLISHER.mjs --work NEW_DIRECTORY');
const root = resolve(supplied[1]);
await mkdir(root, { recursive: false, mode: 0o700 });
const sender = join(root, 'sender');
await mkdir(sender, { mode: 0o700 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const record = (name, value) => writeFile(join(root, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const project = join(sender, 'dbt');
const publisherDirectory = join(sender, 'publisher');
const sourceFile = join(sender, 'source.json');
const targetDirectory = join(root, 'published-dataset');
const originalDatabase = join(sender, 'warehouse.sqlite');
const uid = 'model.local.customer_totals';
const query = 'select id,total,note from customer_totals where id >= $minimum';
const counts = 1000;
const database = new DatabaseSync(originalDatabase);
try {
  database.exec('CREATE TABLE customer_totals(id INTEGER PRIMARY KEY,total TEXT NOT NULL,note TEXT)');
  const put = database.prepare('INSERT INTO customer_totals VALUES(?,?,?)');
  database.exec('BEGIN');
  for (let i = 0; i < counts; i++) put.run(9007199254740993n + BigInt(i), '0.123456789123456789', i % 3 === 0 ? null : 'row ' + i + ', café');
  database.exec('COMMIT');
} finally { database.close(); }
await writeFile(sourceFile, JSON.stringify({ schema: 'stellar-forge.sqlite-source.v1', database: originalDatabase,
  queries: { totals: { sql: query, columns: ['id','total','note'], parameters: { minimum: { type: 'integer' } },
    maxRows: 2, maxBytes: 8192, timeoutMs: 30000 } } }), { mode: 0o600 });
const manifest = {
  metadata: { dbt_schema_version: 'https://schemas.getdbt.com/dbt/manifest/v12.json', dbt_version: '1.11.0',
    generated_at: '2026-10-12T15:00:00Z', invocation_id: 'native-publisher-example', project_name: 'publisher_example' },
  nodes: { [uid]: { unique_id: uid, resource_type: 'model', name: 'customer_totals', package_name: 'local',
    database: 'warehouse', schema: 'main', alias: 'customer_totals', relation_name: 'main.customer_totals',
    raw_code: query, compiled_code: query, depends_on: { nodes: [], macros: [] },
    columns: { id: { name: 'id', data_type: 'BIGINT' }, total: { name: 'total', data_type: 'TEXT' }, note: { name: 'note', data_type: 'TEXT' } } } },
  sources: {}, macros: {}
};
await writeFile(join(sender, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 });
let client = new DbtProjectClient({ directory: project });
let bridge;
const phases = [];
phases.push = function (...items) { for (const item of items) console.error(item); return Array.prototype.push.apply(this, items); };
try {
  await client.create('Original publisher customer review');
  const artifact = await client.import(join(sender, 'manifest.json'));
  const edition = await client.createEdition({ title: 'Original warehouse selection', manifest: artifact.id, request_id: 'native-edition' });
  phases.push('original dbt artifact and selected edition');
  bridge = await DbtSqliteProject.open({ project, publisherDirectory, sourceFile, targetDirectory, create: true });
  const source = await bridge.call('source');
  const plan = await bridge.call('plan.save', { title: 'Exact customer totals', query: 'totals', input: { minimum: '9007199254740993' },
    sourceHash: source.hash,
    dataset: { name: 'customer_totals', columns: { id: 'string', total: 'string', note: { type: 'string', nullable: true } }, sorts: ['id'], defaultLimit: 20, maxLimit: 1000 },
    extraction: { maxRows: 2000, maxBytes: 1048576, timeoutMs: 30000, order: [{ column: 'id', direction: 'asc' }] } });
  const id = randomUUID();
  const ready = await bridge.call('extract', { plan: plan.id, id });
  assert.equal(ready.state, 'READY', JSON.stringify(ready));
  assert.equal(ready.data.candidate.extraction.rowCount, counts);
  assert.deepEqual(await bridge.call('extract', { plan: plan.id, id }), ready);
  const preview = await bridge.call('inspect', { id, query: 'limit=1000' });
  assert(preview.preview, 'Original native candidate preview');
  phases.push('one original read transaction, complete 1000-row extraction, same-run recovery');
  const reviewed = await bridge.call('review', { id, review: { reviewer: 'Native receiving operator', note: 'Complete ordered source reviewed', initialize: true } });
  const published = await bridge.call('publish', { id, reviewId: reviewed.data.review.id });
  assert.equal(published.state, 'PUBLISHED', JSON.stringify(published));
  phases.push('original version writer publication');
  const bindInput = { id, edition: edition.id, uid, request_id: 'native-binding', expectedQueryHash: plan.data.queryHash,
    expectedCandidateHash: ready.data.candidate.candidateDigest };
  const binding = await bridge.call('bind', bindInput);
  assert.deepEqual(await bridge.call('bind', bindInput), binding);
  assert.equal(binding.source_kind, 'original-sqlite-publisher');
  assert.equal(binding.original_request_id, id);
  phases.push('original result, SQL and candidate provenance bound to selected dbt node');
  await bridge.close(); bridge = null;
  bridge = await DbtSqliteProject.open({ project, publisherDirectory });
  assert.equal((await bridge.call('run', { id })).state, 'PUBLISHED');
  assert.deepEqual(await bridge.call('bind', bindInput), binding);
  phases.push('native publisher close and durable reopening');
  const review = await client.saveReview({ name: 'Customer delivery', edition: edition.id, selection: [uid], decisions: {},
    reviewer: 'Native receiving operator', note: 'Published complete source result', request_id: 'delivery-review' });
  for (const format of ['json','csv','html']) await client.report(edition.id, { review: review.id, format, output: join(root, 'review.' + format) });
  const csvOriginal = await readFile(join(publisherDirectory, 'runs', id, 'data.csv'));
  assert.equal(hash(csvOriginal), binding.file.sha256);
  assert(csvOriginal.includes(Buffer.from('9007199254740993')));
  assert(csvOriginal.includes(Buffer.from('9007199254741992')));
  assert(csvOriginal.includes(Buffer.from('0.123456789123456789')));
  const archive = await client.export(join(root, 'project.zip'));
  await bridge.close(); bridge = null;
  await client.close();
  await rm(sender, { recursive: true }); // Only this exercise's new, owned sender tree.
  const receivedDirectory = join(root, 'received');
  client = new DbtProjectClient({ directory: receivedDirectory });
  await client.receive(archive.path, receivedDirectory, archive.sha256);
  const reopened = await client.node(edition.id, uid);
  assert.equal(reopened.results[0].id, binding.id);
  await client.copyObject(binding.file.sha256, join(root, 'received.csv'));
  await client.copyObject(binding.query.sha256, join(root, 'received-query.sql'));
  await client.copyObject(binding.provenance.sha256, join(root, 'received-provenance.json'));
  assert.deepEqual(await readFile(join(root, 'received.csv')), csvOriginal);
  assert.equal(await readFile(join(root, 'received-query.sql'), 'utf8'), query);
  const provenance = JSON.parse(await readFile(join(root, 'received-provenance.json'), 'utf8'));
  assert.equal(provenance.candidate.extraction.rowCount, counts);
  assert.equal(provenance.candidate.extraction.transaction.readOnly, true);
  const edited = await client.saveReview({ name: 'Customer delivery', edition: edition.id, selection: [uid], decisions: {},
    reviewer: 'Receiving operator', note: 'Edited independently after sender removal', request_id: 'received-review', expected_revision: 1 });
  assert.equal(edited.revision, 2);
  phases.push('all reports, full ZIP, sender removal, exact independent receiving and revision-two editing');
  const output = { state: 'complete', node: process.version, source: 'authored local SQLite warehouse through original merchant publisher',
    rows: counts, regularEndpointMaxRows: 2, run: id, plan: plan.id, edition: edition.id, binding: binding.id,
    publishedSnapshot: published.data.publication.snapshot, resultSha256: binding.file.sha256,
    resultBytes: csvOriginal.length, archive: { sha256: archive.sha256, bytes: archive.bytes },
    received: receivedDirectory, reviewRevision: edited.revision, phases };
  await record('result.json', output);
  console.log(JSON.stringify(output, null, 2));
} finally { await bridge?.close(); await client.close(); }
