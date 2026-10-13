import { clone, digest, WorkbenchError } from './contract.mjs';
import { verifyConsumerValues } from './consumer.mjs';

export const WALLET_SCHEMA = 'tjlabs.prices-workbench.wallet-values.v1';
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value !== null && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const hash = value => digest(Buffer.from(canonical(value)));
const fail = (code, message) => { throw new WorkbenchError(code, message, 409); };

export function verifyWalletState(state) {
  if (state?.schema !== WALLET_SCHEMA || !Array.isArray(state.receipts) || !state.receipts.length) fail('WALLET_STATE_INVALID', 'Unsupported downstream wallet state.');
  const { sha256, ...body } = state;
  if (hash(body) !== sha256) fail('WALLET_STATE_CHANGED', 'The saved downstream wallet state changed.');
  const revisions = new Set();
  for (const receipt of state.receipts) {
    const feed = verifyConsumerValues(receipt.feed);
    if (feed.consumerId !== state.consumerId || feed.workspaceId !== state.sourceWorkspaceId || feed.customerRevision !== receipt.sourceRevision || feed.sha256 !== receipt.sourceSha256 || feed.publicationState !== 'published' || !Number.isSafeInteger(receipt.sourceRevision) || receipt.sourceRevision < 1 || revisions.has(receipt.sourceRevision)) fail('WALLET_SOURCE_INVALID', 'A downstream receipt has an inconsistent customer, publication or revision.');
    revisions.add(receipt.sourceRevision);
  }
  if (!revisions.has(state.currentSourceRevision) || Math.max(...revisions) !== state.currentSourceRevision) fail('WALLET_STATE_INVALID', 'The downstream current pointer is inconsistent.');
  return clone(state);
}

/** The receiving application persists the returned state in its existing storage. */
export function receiveConsumerFeed(previous, incoming, { receivedAt = new Date().toISOString() } = {}) {
  const feed = verifyConsumerValues(incoming);
  if (feed.publicationState !== 'published') fail('WALLET_PUBLICATION_REQUIRED', 'Receive the customer’s published feed.');
  if (!Number.isSafeInteger(feed.customerRevision) || feed.customerRevision < 1 || !Number.isFinite(Date.parse(receivedAt))) fail('WALLET_INPUT_INVALID', 'A source revision and valid receiving time are required.');
  if (previous) {
    verifyWalletState(previous);
    if (previous.consumerId !== feed.consumerId || previous.sourceWorkspaceId !== feed.workspaceId) fail('WALLET_CUSTOMER_MISMATCH', 'Continue the same customer and original source workspace.');
    const found = previous.receipts.find(receipt => receipt.sourceRevision === feed.customerRevision);
    if (found) {
      if (found.sourceSha256 !== feed.sha256) fail('WALLET_REVISION_CONFLICT', 'This source revision was already received with different values.');
      return { outcome: 'replayed', state: clone(previous), view: walletView(previous) };
    }
  }
  const receipts = [...(previous?.receipts ?? []), { sourceRevision: feed.customerRevision, sourceSha256: feed.sha256, receivedAt, feed }];
  const body = {
    schema: WALLET_SCHEMA, consumerId: feed.consumerId, sourceWorkspaceId: feed.workspaceId,
    createdAt: previous?.createdAt ?? receivedAt, updatedAt: receivedAt,
    currentSourceRevision: Math.max(previous?.currentSourceRevision ?? 0, feed.customerRevision), receipts,
  };
  const state = { ...body, sha256: hash(body) };
  return { outcome: feed.customerRevision < (previous?.currentSourceRevision ?? 0) ? 'retained_older' : 'received', state, view: walletView(state) };
}

export function walletView(state) {
  verifyWalletState(state);
  const feed = state.receipts.find(receipt => receipt.sourceRevision === state.currentSourceRevision).feed;
  return {
    consumerId: state.consumerId, customerName: feed.book.configuration.name,
    customerReference: feed.book.configuration.customerReference,
    sourceWorkspaceId: state.sourceWorkspaceId, sourceRevision: state.currentSourceRevision,
    editionId: feed.edition.id, editionSha256: feed.edition.sha256, evaluatedAt: feed.edition.createdAt,
    currentBookMatches: feed.currentBookMatches, currency: feed.edition.currency,
    positions: clone(feed.edition.rows), totals: clone(feed.edition.totals),
    comparison: clone(feed.edition.comparison), review: clone(feed.review),
    receivedEditions: state.receipts.length,
  };
}
