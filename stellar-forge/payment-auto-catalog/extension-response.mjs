// SPDX-License-Identifier: MIT
// Pure x402 v2 Bazaar facilitator sidechannel projection. This module never
// mutates a catalog, forwards the internal sidechannel to a buyer, or writes a
// transport header by itself.

export const EXTENSION_RESPONSES_HEADER = 'EXTENSION-RESPONSES';
export const MAX_EXTENSION_RESPONSES_HEADER_BYTES = 16 * 1024;

const STATUSES = new Set(['success', 'processing', 'rejected']);

function cloneJsonValue(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Extension responses must contain JSON values');
    return value;
  }
  if (typeof value !== 'object')
    throw new TypeError('Extension responses must contain JSON values');
  if (ancestors.has(value)) throw new TypeError('Extension responses must not be cyclic');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype)
        throw new TypeError('Extension responses must contain JSON values');
      if (Object.getOwnPropertySymbols(value).length > 0)
        throw new TypeError('Extension responses must contain JSON values');

      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Object.keys(descriptors).length !== value.length + 1)
        throw new TypeError('Extension response arrays must be dense JSON arrays');
      const clone = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
          throw new TypeError('Extension response arrays must be dense JSON arrays');
        clone.push(cloneJsonValue(descriptor.value, ancestors));
      }
      return clone;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new TypeError('Extension responses must contain JSON values');
    if (Object.getOwnPropertySymbols(value).length > 0)
      throw new TypeError('Extension responses must contain JSON values');

    const clone = {};
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
        throw new TypeError('Extension responses must contain JSON values');
      Object.defineProperty(clone, key, {
        configurable: true,
        enumerable: true,
        value: cloneJsonValue(descriptor.value, ancestors),
        writable: true,
      });
    }
    return clone;
  } finally {
    ancestors.delete(value);
  }
}

function cloneJsonObjectWithout(value, omittedKey) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError('Facilitator result must contain JSON values');
  if (Object.getOwnPropertySymbols(value).length > 0)
    throw new TypeError('Facilitator result must contain JSON values');

  const ancestors = new WeakSet([value]);
  const clone = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (key === omittedKey) continue;
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
      throw new TypeError('Facilitator result must contain JSON values');
    Object.defineProperty(clone, key, {
      configurable: true,
      enumerable: true,
      value: cloneJsonValue(descriptor.value, ancestors),
      writable: true,
    });
  }
  return clone;
}

function checkedMaxHeaderBytes(value) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError('maxHeaderBytes must be a positive safe integer');
  return value;
}

function checkedReason(value) {
  if (typeof value !== 'string')
    throw new TypeError('rejectedReason must be a string when present');
  return value;
}

/** Build the Bazaar member of the server-internal EXTENSION-RESPONSES object. */
export function bazaarExtensionResponse(status, rejectedReason) {
  if (!STATUSES.has(status)) throw new TypeError('Invalid Bazaar extension response status');
  if (status === 'rejected') {
    if (rejectedReason === undefined) return { status };
    return { status, rejectedReason: checkedReason(rejectedReason) };
  }
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

/**
 * Add Bazaar's outcome to an already-decoded EXTENSION-RESPONSES object.
 * Sibling extensions are treated as opaque JSON and detached from the caller.
 */
export function composeBazaarExtensionResponses(response, existingResponses = {}) {
  if (existingResponses === null || typeof existingResponses !== 'object' || Array.isArray(existingResponses))
    throw new TypeError('Existing extension responses must be a keyed object');
  if (response === null || typeof response !== 'object' || Array.isArray(response))
    throw new TypeError('Bazaar extension response object required');

  const composed = cloneJsonValue(existingResponses);
  const bazaar = bazaarExtensionResponse(response.status, response.rejectedReason);
  // Replace the complete stale member rather than merging any caller-owned
  // fields. Reinsert it last to keep a deterministic extension order.
  delete composed.bazaar;
  Object.defineProperty(composed, 'bazaar', {
    configurable: true,
    enumerable: true,
    value: bazaar,
    writable: true,
  });
  return composed;
}

/** Encode the complete keyed sidechannel object for an HTTP response header. */
export function encodeBazaarExtensionResponses(
  response,
  existingResponses = {},
  { maxHeaderBytes = MAX_EXTENSION_RESPONSES_HEADER_BYTES } = {},
) {
  const responses = composeBazaarExtensionResponses(response, existingResponses);
  const value = Buffer.from(JSON.stringify(responses), 'utf8').toString('base64');
  if (Buffer.byteLength(value, 'utf8') > checkedMaxHeaderBytes(maxHeaderBytes))
    throw new RangeError('Encoded EXTENSION-RESPONSES exceeds maxHeaderBytes');
  return {
    name: EXTENSION_RESPONSES_HEADER,
    value,
  };
}

function strictBase64Bytes(value) {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) return undefined;
  const bytes = Buffer.from(value, 'base64');
  return bytes.toString('base64') === value ? bytes : undefined;
}

/**
 * Decode the server-internal x402 facilitator sidechannel. A malformed or
 * oversized header is transport metadata failure, not payment failure, so it
 * is ignored exactly like a missing header.
 */
export function decodeExtensionResponsesHeader(
  value,
  { maxHeaderBytes = MAX_EXTENSION_RESPONSES_HEADER_BYTES } = {},
) {
  if (typeof value !== 'string') return undefined;
  if (Buffer.byteLength(value, 'utf8') > checkedMaxHeaderBytes(maxHeaderBytes)) return undefined;

  const bytes = strictBase64Bytes(value);
  if (bytes === undefined) return undefined;
  let parsed;
  try {
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  try {
    return cloneJsonValue(parsed);
  } catch {
    return undefined;
  }
}

/**
 * Attach a decoded sidechannel to a verify or settle result without trusting
 * an identically named response-body member or merging body `extensions`.
 */
export function attachFacilitatorExtensionResponses(result, headerValue, options) {
  if (result === null || typeof result !== 'object' || Array.isArray(result))
    throw new TypeError('Facilitator result must be a keyed object');
  const attached = cloneJsonObjectWithout(result, 'extensionResponses');
  const extensionResponses = decodeExtensionResponsesHeader(headerValue, options);
  if (extensionResponses !== undefined) {
    Object.defineProperty(attached, 'extensionResponses', {
      configurable: true,
      enumerable: true,
      value: extensionResponses,
      writable: true,
    });
  }
  return attached;
}

/** Remove server-internal facilitator metadata before buyer serialization. */
export function facilitatorResultForBuyer(result) {
  if (result === null || typeof result !== 'object' || Array.isArray(result))
    throw new TypeError('Facilitator result must be a keyed object');
  return cloneJsonObjectWithout(result, 'extensionResponses');
}

