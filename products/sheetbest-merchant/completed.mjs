#!/usr/bin/env node
// MIT. Receive original completed Sheet Best publications without replaying them.
import { DatabaseSync } from 'node:sqlite';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lstat } from 'node:fs/promises';
import { privateDirectory, acquireWorkspace, readJson, readPrivate, hashPrivate,
  bytes, digest, identity, fault } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/files.mjs';
import { readSheetBestSourceFile } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/sheetbest/declaration.mjs';
import { readSheetBestCapture, bindSheetBestCapture } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/sheetbest/capture.mjs';
import { packetFromCapture, validatePacket, createOrVerify, MAX_PACKET_BYTES } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/sheetbest/workspace/packet.mjs';
import { sheetBestPublisherDriver } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/sheetbest/publisher/driver.mjs';
import { options, absolute } from './product.mjs';

export const COMPLETED_SCHEMA = 'stellar-forge.sheetbest-completed-authoring-input.v1';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const positive = value => Number.isSafeInteger(value) && value > 0;
function need(value, code) { if (!value) throw fault(code); }
const unpack = row => row ? { ...row, data: JSON.parse(row.data) } : null;

/** Read the original schema under its native flock; SQLite remains read-only. */
export async function receiveCompletedPublications({ publisherDirectory, runIds, output, reviewer, title = 'Sheet Best merchant' }) {
  absolute(publisherDirectory); absolute(output);
  need(Array.isArray(runIds) && runIds.length > 0 && runIds.length <= 16 &&
    new Set(runIds).size === runIds.length && runIds.every(id => UUID.test(id)), 'SHEETBEST_ORIGINAL_RUN_IDS_REQUIRED');
  need(typeof reviewer === 'string' && reviewer.trim() && reviewer.length <= 128, 'SHEETBEST_RECEIVING_REVIEWER_REQUIRED');
  need(typeof title === 'string' && title.trim() && title.length <= 128, 'SHEETBEST_RECEIVING_TITLE_REQUIRED');
  // Keep all generated receiving files outside the original publisher tree.
  const folder = dirname(output);
  need(folder !== publisherDirectory && !folder.startsWith(publisherDirectory + '/'), 'SHEETBEST_SEPARATE_RECEIVING_DIRECTORY_REQUIRED');
  await privateDirectory(publisherDirectory); await privateDirectory(folder, true);
  const releaseOutput = await acquireWorkspace(folder);
  let db, releaseOriginal;
  try {
    releaseOriginal = await acquireWorkspace(publisherDirectory);
    const settings = await readJson(join(publisherDirectory, 'workspace.json'), 4096);
    need(settings.schema === sheetBestPublisherDriver.workspaceSchema, 'SHEETBEST_ORIGINAL_PUBLISHER_REQUIRED');
    const database = join(publisherDirectory, 'publisher.sqlite');
    const before = await hashPrivate(database, 256 * 1024 * 1024);
    db = new DatabaseSync(database, { readOnly: true });
    const editions = [];
    for (const runId of runIds) {
      const run = unpack(db.prepare('SELECT * FROM runs WHERE id=?').get(runId));
      need(run?.state === 'PUBLISHED' && positive(run.plan), 'SHEETBEST_COMPLETED_PUBLICATION_REQUIRED');
      const plan = unpack(db.prepare('SELECT * FROM plans WHERE id=?').get(run.plan));
      need(plan && UUID.test(plan.folder) && plan.data.schema === 'stellar-forge.sheetbest-dataset-plan.v1',
        'SHEETBEST_ORIGINAL_PLAN_REQUIRED');
      const planRoot = join(publisherDirectory, 'plans', plan.folder);
      const savedPlan = await readJson(join(planRoot, 'plan.json'), 1024 * 1024);
      need(identity(savedPlan) === identity(plan.data), 'SHEETBEST_ORIGINAL_PLAN_CHANGED');
      const { digest: planDigest, ...planBody } = plan.data;
      need(planDigest === identity(planBody), 'SHEETBEST_ORIGINAL_PLAN_DIGEST_CHANGED');
      need(digest(await readPrivate(join(planRoot, 'original-source.json'), 1024 * 1024)) === plan.data.sourceHash, 'SHEETBEST_ORIGINAL_SOURCE_CHANGED');
      const source = await readSheetBestSourceFile(join(planRoot, 'source.json'));
      need(source.hash === plan.data.runtimeSourceHash && source.captureFile, 'SHEETBEST_FROZEN_PLAN_SOURCE_REQUIRED');
      const capture = await readSheetBestCapture(source.captureFile, source.config.connection.sha256);
      bindSheetBestCapture(capture, source.config);
      const runRoot = join(publisherDirectory, 'runs', runId);
      const candidate = await readJson(join(runRoot, 'candidate.json'), 1024 * 1024);
      const { candidateDigest, ...candidateBody } = candidate;
      need(candidate.schema === sheetBestPublisherDriver.candidateSchema && candidate.run === runId &&
        candidate.planDigest === planDigest && candidateDigest === identity(candidateBody) &&
        run.data.review?.candidateDigest === candidateDigest && UUID.test(run.data.review.id) &&
        sheetBestPublisherDriver.validateExtraction(candidate.extraction), 'SHEETBEST_ORIGINAL_CANDIDATE_CHANGED');
      const csv = await readPrivate(join(runRoot, 'data.csv'), plan.data.extraction.maxBytes);
      const dataset = await readPrivate(join(runRoot, 'dataset.json'), 65536);
      need(digest(csv) === candidate.csvHash && csv.length === candidate.csvBytes &&
        digest(dataset) === candidate.configHash &&
        run.data.publication?.snapshot === candidate.dataset.snapshot &&
        candidate.extraction.observation.capture.manifestSha256 === capture.manifestSha256 &&
        candidate.extraction.rowCount === capture.manifest.rowCount &&
        identity(candidate.extraction.order) === identity(plan.data.extraction.order), 'SHEETBEST_COMPLETED_BYTES_CHANGED');
      const projected = source.config.queries[plan.data.query]?.columns;
      const aliases = Object.keys(plan.data.dataset.columns);
      need(projected && aliases.every(name => Object.hasOwn(projected, name)), 'SHEETBEST_PUBLISHED_PROJECTION_MISSING');
      need(plan.data.extraction.order.every(item => aliases.includes(item.column)),
        'SHEETBEST_PUBLISHED_ORDER_NEEDS_UNPUBLISHED_COLUMN');
      // Reconstruct the actual published column subset, not every field in the raw response.
      const selected = { ...source.config, queries: { [plan.data.query]: {
        columns: Object.fromEntries(aliases.map(name => [name, projected[name]])),
      } } };
      const packet = packetFromCapture(capture, selected, {
        orders: { [plan.data.query]: plan.data.extraction.order },
        origin: { sourceSha256: plan.data.sourceHash, sourceBytes: plan.data.sourceBytes,
          captureSha256: capture.manifestSha256, orderOrigin: 'ORIGINAL_PUBLISHED_PLAN',
          publication: { runId, planId: plan.id, folder: plan.folder, planDigest,
            snapshot: candidate.dataset.snapshot, candidateDigest, review: run.data.review } },
      });
      validatePacket(packet);
      const outputRoot = join(folder, runId); await privateDirectory(outputRoot, true);
      const packetBytes = bytes(packet);
      await createOrVerify(join(outputRoot, 'source-packet.json'), packetBytes, MAX_PACKET_BYTES);
      await createOrVerify(join(outputRoot, 'published.csv'), csv, plan.data.extraction.maxBytes);
      await createOrVerify(join(outputRoot, 'dataset.json'), dataset, 65536);
      await createOrVerify(join(outputRoot, 'plan.json'), bytes(plan.data), 1024 * 1024);
      await createOrVerify(join(outputRoot, 'candidate.json'), bytes(candidate), 1024 * 1024);
      const file = (name, content) => ({ file: runId + '/' + name, bytes: content.length, sha256: digest(content) });
      editions.push({
        runId, planId: plan.id, planFolder: plan.folder, originalSnapshot: candidate.dataset.snapshot,
        originalReview: run.data.review, query: plan.data.query, order: plan.data.extraction.order,
        rowCount: capture.manifest.rowCount, captureSha256: capture.manifestSha256,
        responseSha256: capture.manifest.sourceSha256, aliases,
        packet: file('source-packet.json', packetBytes), csv: file('published.csv', csv),
        dataset: file('dataset.json', dataset), plan: file('plan.json', bytes(plan.data)),
        candidate: file('candidate.json', bytes(candidate)),
      });
    }
    db.close(); db = null;
    const after = await hashPrivate(database, 256 * 1024 * 1024);
    need(before.hash === after.hash && before.bytes === after.bytes, 'SHEETBEST_ORIGINAL_DATABASE_CHANGED');
    const result = { schema: COMPLETED_SCHEMA, title: title.trim(), reviewer: reviewer.trim(),
      originalPublisher: { directory: publisherDirectory, databaseSha256: before.hash, bytes: before.bytes,
        sourceFile: settings.sourceFile, targetDirectory: settings.targetDirectory },
      editions, providerReads: 0, publications: 0, signatures: 0, payments: 0 };
    await createOrVerify(output, bytes(result), 1024 * 1024);
    return result;
  } finally {
    try { db?.close(); } finally {
      try { await releaseOriginal?.(); } finally { await releaseOutput(); }
    }
  }
}
export async function readCompletedInput(file) {
  absolute(file); const root = dirname(file), raw = await readPrivate(file, 1024 * 1024), value = JSON.parse(raw);
  need(value.schema === COMPLETED_SCHEMA && Array.isArray(value.editions) &&
    value.editions.length > 0 && value.editions.length <= 16, 'SHEETBEST_COMPLETED_INPUT_REQUIRED');
  await privateDirectory(root);
  const seen = new Set(), editions = [];
  for (const edition of value.editions) {
    need(UUID.test(edition.runId) && !seen.has(edition.runId), 'SHEETBEST_COMPLETED_RUN_CHANGED'); seen.add(edition.runId);
    await privateDirectory(join(root, edition.runId));
    const retained = {};
    for (const key of ['packet', 'csv', 'dataset', 'plan', 'candidate']) {
      const item = edition[key], expectedName = { packet: 'source-packet.json', csv: 'published.csv',
        dataset: 'dataset.json', plan: 'plan.json', candidate: 'candidate.json' }[key];
      need(item?.file === edition.runId + '/' + expectedName, 'SHEETBEST_COMPLETED_FILE_PATH_CHANGED');
      const content = await readPrivate(join(root, item.file), key === 'packet' ? MAX_PACKET_BYTES : key === 'csv' ? 64 * 1024 * 1024 : 1024 * 1024);
      need(content.length === item.bytes && digest(content) === item.sha256, 'SHEETBEST_COMPLETED_FILE_CHANGED');
      retained[key] = key === 'csv' ? content : JSON.parse(content);
    }
    const checked = validatePacket(retained.packet);
    const { digest: planDigest, ...planBody } = retained.plan;
    const { candidateDigest, ...candidateBody } = retained.candidate;
    need(positive(edition.planId) && UUID.test(edition.planFolder) &&
      retained.plan.schema === 'stellar-forge.sheetbest-dataset-plan.v1' && planDigest === identity(planBody) &&
      retained.candidate.schema === sheetBestPublisherDriver.candidateSchema &&
      candidateDigest === identity(candidateBody) && retained.candidate.planDigest === planDigest &&
      retained.candidate.run === edition.runId && edition.originalReview?.candidateDigest === candidateDigest &&
      sheetBestPublisherDriver.validateExtraction(retained.candidate.extraction) &&
      retained.candidate.dataset.snapshot === edition.originalSnapshot &&
      retained.candidate.csvHash === edition.csv.sha256 && retained.candidate.csvBytes === edition.csv.bytes &&
      retained.candidate.configHash === edition.dataset.sha256 &&
      retained.candidate.extraction.rowCount === edition.rowCount &&
      retained.candidate.extraction.observation.capture.manifestSha256 === edition.captureSha256 &&
      identity(retained.candidate.extraction.order) === identity(edition.order) &&
      identity(retained.plan.extraction.order) === identity(edition.order) &&
      identity(Object.keys(retained.plan.dataset.columns)) === identity(edition.aliases) &&
      retained.plan.query === edition.query, 'SHEETBEST_COMPLETED_PUBLICATION_CHANGED');
    need(checked.manifest.rowCount === edition.rowCount && checked.manifestSha256 === edition.captureSha256 &&
      checked.manifest.sourceSha256 === edition.responseSha256 &&
      identity(retained.packet.orders[edition.query]) === identity(edition.order) &&
      identity(Object.keys(retained.packet.source.queries[edition.query].columns)) === identity(edition.aliases),
    'SHEETBEST_COMPLETED_SOURCE_CHANGED');
    editions.push({ ...edition, retained });
  }
  return { ...value, inputFile: file, inputSha256: digest(raw), editions };
}
export async function main(argv = process.argv.slice(2)) {
  if (!argv.length || argv[0] === '--help') {
    console.log('sheetbest-completed-input --publisher ORIGINAL_PRIVATE_PUBLISHER --run ORIGINAL_UUID [--run UUID ...] --out NEW_PRIVATE_INPUT.json --reviewer NAME [--title TITLE]');
    return 0;
  }
  const selected = options(argv, ['--publisher', '--run', '--out', '--reviewer', '--title'], ['--run']);
  const result = await receiveCompletedPublications({ publisherDirectory: absolute(selected['--publisher']),
    runIds: selected['--run'], output: absolute(selected['--out']), reviewer: selected['--reviewer'], title: selected['--title'] });
  console.log(JSON.stringify({ schema: result.schema, output: selected['--out'], editions: result.editions.map(({ runId, originalSnapshot, rowCount, aliases }) =>
    ({ runId, originalSnapshot, rowCount, aliases })), providerReads: 0, publications: 0 }, null, 2)); return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(JSON.stringify({ error: error.code ?? 'SHEETBEST_COMPLETED_RECEIVING_ERROR', message: error.message }));
    process.exitCode = 1;
  });
