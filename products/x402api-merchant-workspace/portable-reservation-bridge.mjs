#!/usr/bin/env node
/** Native reservation semantics for the maintained Python project-ZIP driver. */
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { inspectMerchantReservations, restoreMerchantReservations } from './portable-reservations.mjs';

const SCHEMA = 'stellar-forge.merchant-portable-reservation-bridge.v1';
const MAX_INPUT = 32 * 1024 * 1024;
// JSON objects retain their original values across the Python serializer even
// when its canonical encoder orders their keys. Native lock byte order stays
// with the original inspected record passed directly to the native restorer.
const canonical = value => JSON.stringify(order(value));
function order(value) {
  if (Array.isArray(value)) return value.map(order);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, order(value[key])]));
  return value;
}
const chunks = [];
let size = 0;
try {
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT) throw new Error('The complete reservation request exceeds its retained limit.');
    chunks.push(chunk);
  }
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!request || request.schema !== SCHEMA || !['inspect', 'restore'].includes(request.action))
    throw new Error('Use the original reservation bridge request.');
  let result;
  if (request.action === 'inspect') {
    const database = new DatabaseSync(request.database, { readOnly: true });
    try {
      result = await inspectMerchantReservations({
        database, directory: request.directory, recordedDirectory: request.recordedDirectory,
      });
    } finally { database.close(); }
  } else {
    const database = new DatabaseSync(request.database, { readOnly: true });
    let original;
    try {
      original = await inspectMerchantReservations({
        database, directory: join(request.stage, 'workspace'), recordedDirectory: request.recordedDirectory,
      });
    } finally { database.close(); }
    if (canonical(original) !== canonical(request.reservations))
      throw new Error('Keep the complete original native reservation mapping.');
    result = await restoreMerchantReservations({
      stage: request.stage, directory: request.directory, reservations: original,
    });
  }
  process.stdout.write(JSON.stringify({ schema: SCHEMA, action: request.action, result }) + '\n');
} catch (error) {
  process.stderr.write(String(error?.code || error?.message || error) + '\n');
  process.exitCode = 1;
}
