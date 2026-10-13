// SPDX-License-Identifier: MIT
import { readFileSync, writeFileSync } from 'node:fs';
import { projectBlockrunUsageCapture } from './blockrun-projections.mjs';
const original = JSON.parse(readFileSync(new URL('./blockrun-example.json', import.meta.url), 'utf8'));
const complete = projectBlockrunUsageCapture(original);
const partial = structuredClone(original);
partial.pages.pop();
partial.summary.responseText = partial.summary.responseText
  .replace('"counted_through":null', '"counted_through":"2026-10-10T23:00:00.000Z"')
  .replace('"unavailable_days":[]', '"unavailable_days":["2026-10-10"]');
const partialView = projectBlockrunUsageCapture(partial);
const pending = structuredClone(original);
pending.pages[1].responseText = pending.pages[1].responseText
  .replace('"cost_usd":0.000000000000000001,"cost_state":"priced"', '"cost_usd":null,"cost_state":"pending"');
pending.summary.responseText = pending.summary.responseText
  .replace('"unpriced_calls":0', '"unpriced_calls":1')
  .replace('"usd":0.028100000000000001', '"usd":0.0281');
const pendingView = projectBlockrunUsageCapture(pending);
if (complete.observed.knownPricedAndFreeUsd !== '0.028100000000000001' ||
    complete.observed.mediaJobs !== 1 || complete.observed.callsInWindow !== '3' ||
    complete.observed.rowsMinusSummaryUsd !== '0' || complete.coverage.issues.length ||
    complete.providerCredits.remainingInterpretation !== 'UNLIMITED')
  throw new Error('Original complete capture example mismatch');
if (!partialView.coverage.issues.includes('MORE_LEDGER_PAGES') ||
    !partialView.coverage.issues.includes('PROVIDER_UNAVAILABLE_DAYS') ||
    !partialView.coverage.issues.includes('PARTIAL_SUMMARY_CUTOFF'))
  throw new Error('Partial capture state mismatch');
if (pendingView.coverage.pendingRequestIds.join() !== 'example-chat-2' ||
    pendingView.observed.knownPricedAndFreeUsd !== '0.0281')
  throw new Error('Pending amount state mismatch');
const wrongCursor = structuredClone(original);
wrongCursor.pages[1].cursor = 'different';
let invalidCursorCode = null;
try { projectBlockrunUsageCapture(wrongCursor); } catch (error) { invalidCursorCode = error.code; }
if (invalidCursorCode !== 'CURSOR_CHAIN_MISMATCH') throw new Error('Original cursor chain was not preserved');
writeFileSync(1, JSON.stringify({
  notice: 'Authored documentation captures; no provider API request, charge, settlement or customer output occurred.',
  complete,
  partial: {coverage:partialView.coverage,observed:partialView.observed},
  pending: {coverage:pendingView.coverage,observed:pendingView.observed},
  invalidCursorCode
}, null, 2) + '\n');
