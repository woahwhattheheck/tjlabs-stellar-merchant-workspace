// MIT. The native project receiver calls the original directory reservation engine.
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { inspectMerchantReservations, restoreMerchantReservations } from './portable-reservations.mjs';

// Python's canonical manifest encoder may reorder object keys. Compare complete
// values, then retain the inspected lock record's original order for restore.
const canonical = value => JSON.stringify(order(value));
function order(value) {
  if (Array.isArray(value)) return value.map(order);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, order(value[key])]));
  return value;
}

const raw = await new Promise((resolve, reject) => {
  let size = 0; const parts = [];
  process.stdin.on('data', part => {
    size += part.length;
    if (size > 32 * 1024 * 1024) {
      reject(Object.assign(new Error('MERCHANT_RESERVATION_REQUEST_TOO_LARGE'), { code: 'MERCHANT_RESERVATION_REQUEST_TOO_LARGE' }));
      process.stdin.destroy();
    } else parts.push(part);
  });
  process.stdin.on('end', () => resolve(Buffer.concat(parts)));
  process.stdin.on('error', reject);
});
try {
  const request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  let result;
  if (request.action === 'inspect') {
    const database = new DatabaseSync(request.database, { readOnly: true });
    try {
      database.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
      result = await inspectMerchantReservations({
        database, directory: request.directory, recordedDirectory: request.recordedDirectory
      });
    } finally { database.close(); }
  } else if (request.action === 'restore') {
    // The Python driver owns the original private receiving lease and stages all
    // retained files before asking this unchanged engine to relocate the copy.
    const database = new DatabaseSync(request.database, { readOnly: true });
    let original;
    try {
      database.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
      original = await inspectMerchantReservations({
        database, directory: join(request.stage, 'workspace'), recordedDirectory: request.recordedDirectory
      });
    } finally { database.close(); }
    if (canonical(original) !== canonical(request.reservations))
      throw Object.assign(new Error('MERCHANT_RESERVATION_MAPPING_CHANGED'), { code: 'MERCHANT_RESERVATION_MAPPING_CHANGED' });
    result = await restoreMerchantReservations({
      stage: request.stage, directory: request.directory, reservations: original
    });
  } else throw Object.assign(new Error('MERCHANT_RESERVATION_ACTION_INVALID'), { code: 'MERCHANT_RESERVATION_ACTION_INVALID' });
  process.stdout.write(JSON.stringify({ schema: 'stellar-forge.merchant-project-reservations.v1', result }) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ error: { code: error.code ?? 'MERCHANT_RESERVATION_FAILED', message: String(error.message) } }) + '\n');
  process.exitCode = 1;
}
