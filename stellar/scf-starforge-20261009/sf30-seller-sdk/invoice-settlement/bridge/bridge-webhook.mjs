import { createHash, createPublicKey, verify, constants } from 'node:crypto';
import { BridgeContractError, describeWebhookEvent } from './bridge-provider.mjs';

function need(ok, code, message) {
  if (!ok) throw new BridgeContractError(code, message);
}
/** Strict duplicate-free JSON; retain original bytes outside the parsed value. */
export function parseProviderJSON(text, { maxDepth = 64, maxNodes = 100000 } = {}) {
  need(typeof text === 'string', 'INVALID_JSON', 'Expected decoded provider JSON.');
  let at = 0, nodes = 0;
  const ws = () => { while (/[\t\n\r ]/.test(text[at] || '\0')) at++; };
  function string() {
    const start = at++;
    while (at < text.length) {
      const ch = text[at++];
      if (ch === '"') {
        let value;
        try { value = JSON.parse(text.slice(start, at)); }
        catch { throw new BridgeContractError('INVALID_JSON', 'Invalid JSON string.'); }
        // Lone surrogate values cannot identify an unambiguous UTF-8 source field.
        for (let i = 0; i < value.length; i++) {
          const code = value.charCodeAt(i);
          if (code >= 0xd800 && code <= 0xdbff) {
            const low = value.charCodeAt(++i);
            need(low >= 0xdc00 && low <= 0xdfff, 'INVALID_UNICODE', 'Unpaired JSON surrogate.');
          } else need(code < 0xdc00 || code > 0xdfff, 'INVALID_UNICODE', 'Unpaired JSON surrogate.');
        }
        return value;
      }
      if (ch === '\\') at++;
    }
    throw new BridgeContractError('INVALID_JSON', 'Unterminated JSON string.');
  }
  function value(depth) {
    need(++nodes <= maxNodes && depth <= maxDepth, 'JSON_BOUND', 'Provider JSON exceeds the configured structural bound.');
    ws(); const ch = text[at];
    if (ch === '"') return string();
    if (ch === '{') {
      at++; ws(); const out = Object.create(null), keys = new Set();
      if (text[at] === '}') { at++; return out; }
      while (true) {
        ws(); need(text[at] === '"', 'INVALID_JSON', 'Expected an object key.');
        const key = string();
        need(!keys.has(key), 'DUPLICATE_JSON_KEY', 'Provider JSON repeats an object key.');
        keys.add(key); ws(); need(text[at++] === ':', 'INVALID_JSON', 'Expected object colon.');
        Object.defineProperty(out, key, { value: value(depth + 1), writable: true, enumerable: true, configurable: true });
        ws(); const separator = text[at++];
        if (separator === '}') return out;
        need(separator === ',', 'INVALID_JSON', 'Expected object separator.');
      }
    }
    if (ch === '[') {
      at++; ws(); const out = [];
      if (text[at] === ']') { at++; return out; }
      while (true) {
        out.push(value(depth + 1)); ws(); const separator = text[at++];
        if (separator === ']') return out;
        need(separator === ',', 'INVALID_JSON', 'Expected array separator.');
      }
    }
    for (const [word, literal] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(word, at)) { at += word.length; return literal; }
    }
    const match = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(at));
    need(match && match.index === 0, 'INVALID_JSON', 'Expected a JSON value.');
    at += match[0].length;
    const n = Number(match[0]);
    need(Number.isFinite(n) && (!Number.isInteger(n) || Number.isSafeInteger(n)),
      'UNSAFE_JSON_NUMBER', 'Provider integer cannot be represented exactly; retain the original source for review.');
    return n;
  }
  const result = value(0); ws();
  need(at === text.length, 'INVALID_JSON', 'Unexpected bytes after provider JSON.');
  return result;
}
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
/**
 * Verify original raw delivery using Bridge's current per-endpoint RSA contract.
 * No event is acknowledged, stored or applied to the original customer ledger here.
 */
export function verifyBridgeDelivery({
  rawBody, signatureHeader, publicKeyPem, endpointId, binding,
  receivedAtMs, maxAgeMs = 600000, maxFutureSkewMs = 60000, maxBodyBytes = 8388608
}) {
  need(rawBody instanceof Uint8Array, 'RAW_BODY_REQUIRED', 'Verify original received bytes before JSON parsing.');
  need(Number.isSafeInteger(maxBodyBytes) && maxBodyBytes > 0 &&
    rawBody.byteLength > 0 && rawBody.byteLength <= maxBodyBytes,
    'BODY_BOUND', 'Original webhook body is empty or exceeds the declared application bound.');
  const raw = Buffer.from(rawBody);
  need(typeof signatureHeader === 'string' && signatureHeader.length <= 16384,
    'SIGNATURE_REQUIRED', 'Exactly one original X-Webhook-Signature header is required.');
  const parts = signatureHeader.split(',').map(x => x.trim());
  need(parts.length === 2, 'INVALID_SIGNATURE_HEADER', 'Expected exactly t and v0 signature fields.');
  const fields = Object.create(null);
  for (const part of parts) {
    const at = part.indexOf('=');
    need(at > 0, 'INVALID_SIGNATURE_HEADER', 'Malformed signature field.');
    const key = part.slice(0, at), value = part.slice(at + 1);
    need((key === 't' || key === 'v0') && fields[key] === undefined,
      'INVALID_SIGNATURE_HEADER', 'Unexpected or repeated signature field.');
    fields[key] = value;
  }
  need(/^(?:0|[1-9][0-9]*)$/.test(fields.t || ''), 'INVALID_SIGNATURE_TIME', 'Delivery timestamp must be original decimal milliseconds.');
  const timestamp = Number(fields.t);
  need(Number.isSafeInteger(timestamp) && Number.isSafeInteger(receivedAtMs) &&
    Number.isSafeInteger(maxAgeMs) && maxAgeMs >= 0 &&
    Number.isSafeInteger(maxFutureSkewMs) && maxFutureSkewMs >= 0,
    'INVALID_SIGNATURE_TIME', 'Supply safe millisecond values and explicit freshness bounds.');
  need(timestamp >= receivedAtMs - maxAgeMs && timestamp <= receivedAtMs + maxFutureSkewMs,
    'SIGNATURE_TIME_OUTSIDE_WINDOW', 'Signed delivery timestamp falls outside this original receipt window.');
  const encoded = fields.v0;
  need(typeof encoded === 'string' && encoded.length > 0 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded),
    'INVALID_SIGNATURE_BASE64', 'Signature must be strict padded base64.');
  const signature = Buffer.from(encoded, 'base64');
  need(signature.toString('base64') === encoded, 'INVALID_SIGNATURE_BASE64', 'Signature base64 is not canonical.');
  need(typeof publicKeyPem === 'string' && typeof endpointId === 'string' && endpointId.length > 0,
    'ENDPOINT_KEY_REQUIRED', 'Use the public key captured for this exact original endpoint.');
  let key;
  try { key = createPublicKey(publicKeyPem); }
  catch { throw new BridgeContractError('INVALID_ENDPOINT_KEY', 'The original endpoint public key is invalid.'); }
  need(key.asymmetricKeyType === 'rsa', 'INVALID_ENDPOINT_KEY', 'Bridge signature contract requires an RSA public key.');
  const firstDigest = createHash('sha256').update(fields.t + '.', 'utf8').update(raw).digest();
  let verified = false;
  try { verified = verify('sha256', firstDigest, { key, padding: constants.RSA_PKCS1_PADDING }, signature); }
  catch { throw new BridgeContractError('SIGNATURE_VERIFICATION_FAILED', 'Original RSA verification could not complete.'); }
  need(verified, 'SIGNATURE_INVALID', 'Original delivery signature does not match this endpoint key.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { throw new BridgeContractError('INVALID_UTF8', 'Provider delivery is not complete UTF-8.'); }
  const document = parseProviderJSON(text);
  const event = describeWebhookEvent(document, binding);
  return {
    schema: 'bloccpay.bridge-verified-delivery.v1', endpointId,
    endpointKeySha256: sha256(key.export({ format: 'der', type: 'spki' })),
    receivedAtMs, signedAtMs: timestamp,
    signature: { algorithm: 'RSA-PKCS1-v1_5-SHA256-of-SHA256', header: signatureHeader },
    source: { bytes: raw.length, sha256: sha256(raw), encoding: 'utf-8' },
    rawBody: raw, document, event, ledgerAction: 'NONE',
    status: 'VERIFIED_NOT_COMMITTED'
  };
}
