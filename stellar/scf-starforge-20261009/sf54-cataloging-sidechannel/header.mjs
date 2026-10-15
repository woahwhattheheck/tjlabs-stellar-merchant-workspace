// MIT. Dependency-free facilitator-to-resource-server extension transport.
export const HEADER_NAME = 'EXTENSION-RESPONSES';
export const MAX_HEADER_BYTES = 16_384;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Keep a trusted upstream sidechannel only when its original base64 JSON is valid. */
export function validatedExtensionResponsesHeader(value) {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value, 'utf8') > MAX_HEADER_BYTES ||
      value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  try {
    const bytes = Buffer.from(value,'base64');
    if (bytes.toString('base64') !== value) return null;
    const fields = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    // x402 defines a JSON object keyed by extension name. Extension names and
    // members are deliberately opaque here; future or vendor extensions must
    // survive the facilitator -> resource-server hop byte-for-byte.
    if (!plain(fields)) return null;
    return value;
  } catch { return null; }
}

