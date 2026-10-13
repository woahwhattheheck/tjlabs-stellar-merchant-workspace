// MIT. The native project receiver calls the original directory reservation engine.
import { DatabaseSync } from 'node:sqlite';
import { inspectMerchantReservations, restoreMerchantReservations } from './portable-reservations.mjs';

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
    result = await restoreMerchantReservations({
      stage: request.stage, directory: request.directory, reservations: request.reservations
    });
  } else throw Object.assign(new Error('MERCHANT_RESERVATION_ACTION_INVALID'), { code: 'MERCHANT_RESERVATION_ACTION_INVALID' });
  process.stdout.write(JSON.stringify({ schema: 'stellar-forge.merchant-project-reservations.v1', result }) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ error: { code: error.code ?? 'MERCHANT_RESERVATION_FAILED', message: String(error.message) } }) + '\n');
  process.exitCode = 1;
}
