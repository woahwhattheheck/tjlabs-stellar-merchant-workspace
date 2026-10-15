// SPDX-License-Identifier: MIT
// Pure x402 v2 Bazaar facilitator sidechannel projection. This module never
// mutates a catalog, forwards the internal sidechannel to a buyer, or writes a
// transport header by itself.

export const EXTENSION_RESPONSES_HEADER = 'EXTENSION-RESPONSES';

const STATUSES = new Set(['success', 'processing', 'rejected']);

function checkedReason(value) {
  if (typeof value !== 'string' || value.length === 0)
    throw new TypeError('rejectedReason must be a non-empty string');
  return value;
}

/** Build the Bazaar member of the server-internal EXTENSION-RESPONSES object. */
export function bazaarExtensionResponse(status, rejectedReason) {
  if (!STATUSES.has(status)) throw new TypeError('Invalid Bazaar extension response status');
  if (status === 'rejected')
    return { status, rejectedReason: checkedReason(rejectedReason) };
  if (rejectedReason !== undefined)
    throw new TypeError('rejectedReason is only valid when status is rejected');
  return { status };
}

/**
 * Convert a synchronous PaymentAutoCatalog outcome to the standard Bazaar
 * sidechannel member. Asynchronous callers can request `processing` directly
 * through bazaarExtensionResponse().
 */
export function catalogResultToBazaarExtensionResponse(result) {
  if (result?.decision === 'accepted') return bazaarExtensionResponse('success');
  if (result?.decision === 'reject' || result?.decision === 'soft_drop')
    return bazaarExtensionResponse('rejected', result.reason ?? 'cataloging rejected');
  throw new TypeError('Unsupported catalog result');
}

/** Encode the complete keyed sidechannel object for an HTTP response header. */
export function encodeBazaarExtensionResponses(response) {
  if (response === null || typeof response !== 'object' || Array.isArray(response))
    throw new TypeError('Bazaar extension response object required');
  // Reconstruct instead of serializing caller-owned extra fields. This keeps
  // the wire shape exactly within the current Bazaar status contract.
  const bazaar = bazaarExtensionResponse(response.status, response.rejectedReason);
  return {
    name: EXTENSION_RESPONSES_HEADER,
    value: Buffer.from(JSON.stringify({ bazaar }), 'utf8').toString('base64'),
  };
}

