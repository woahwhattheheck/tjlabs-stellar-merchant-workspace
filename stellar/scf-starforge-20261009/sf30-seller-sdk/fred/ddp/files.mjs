// MIT. Complete original DDP files and their actual acquisition provenance.
import { createHash } from 'node:crypto';
import { canonicalJSONDigest } from '../canonical-stream.mjs';
import { canonical, clone, need, plain } from '../model.mjs';

export const MAX_DDP_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_DDP_CAPTURE_BYTES = 384 * 1024 * 1024;
export function normalizeFredDdpRelease(value) {
  need(typeof value === 'string' && value.length >= 1 && value.length <= 100 && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value), 'Retain the original DDP release identity.');
  return value;
}
export function sealFredDdpFile({name,mediaType,bytes,provenance}) { return createFredDdpSourceFile({name,mediaType,content:bytes,provenance}); }
export const ddpHash = value => createHash('sha256').update(value).digest('hex');
export const ddpDigest = value => canonicalJSONDigest(value);
export const DDP_CROSSWALK_URL = 'https://www.federalreserve.gov/data/documents/DDP-FRED%20Data%20Series%20Crosswalk.csv';
export const DDP_H15_ARCHIVE_URL = 'https://www.federalreserve.gov/releases/h15/data/FRB_h15_xml.zip';
const same = (a, b) => ddpDigest(a) === ddpDigest(b);
const allowedKeys = (value, allowed, label) => need(plain(value) && Object.keys(value).every(key => allowed.includes(key)), 'Unknown ' + label + ' field.');
export function ddpFileName(value) {
  need(typeof value === 'string' && value.length >= 1 && value.length <= 1024 && !/[\\:\u0000-\u001f\u007f]/.test(value) &&
    !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..'), 'Use the original portable relative source filename.');
  return value;
}
export function ddpBoardUrl(value) {
  need(typeof value === 'string' && value.length <= 8192, 'A Board source URL is required.');
  let url; try { url = new URL(value); } catch { need(false, 'The Board source URL is invalid.'); }
  need(url.protocol === 'https:' && ['www.federalreserve.gov', 'federalreserve.gov'].includes(url.hostname) &&
    !url.username && !url.password && !url.port && !url.hash, 'Use an original HTTPS Federal Reserve Board source URL.');
  return url.href;
}
export function ddpTimestamp(value) {
  need(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)),
    'Retain the actual source acquisition timestamp.');
  return value;
}
export function ddpProvenance(input) {
  need(plain(input), 'Original source provenance is required.');
  if (input.kind === 'file') {
    allowedKeys(input, ['kind', 'receivedAt'], 'file provenance');
    return { kind: 'file', receivedAt: ddpTimestamp(input.receivedAt) };
  }
  allowedKeys(input, ['kind', 'receivedAt', 'url', 'finalUrl', 'status', 'headers'], 'HTTP provenance');
  need(input.kind === 'http' && input.status === 200, 'Retain the original successful HTTP response status.');
  const headers = {};
  need(plain(input.headers), 'Retain the original source response headers.');
  const allowed = ['content-type', 'content-length', 'content-disposition', 'content-encoding', 'date', 'etag', 'last-modified', 'cache-control'];
  for (const [key, value] of Object.entries(input.headers)) {
    need(allowed.includes(key) && typeof value === 'string' && value.length <= 8192 && !/[\r\n]/.test(value), 'Invalid retained source response header.');
    headers[key] = value;
  }
  return { kind: 'http', receivedAt: ddpTimestamp(input.receivedAt), url: ddpBoardUrl(input.url),
    finalUrl: ddpBoardUrl(input.finalUrl), status: 200, headers };
}
export function createFredDdpSourceFile({ name, mediaType = 'application/octet-stream', content, provenance }) {
  need(Buffer.isBuffer(content) || content instanceof Uint8Array, 'Provide the complete original file bytes.');
  const bytes = Buffer.from(content);
  need(bytes.length <= MAX_DDP_FILE_BYTES, 'The original DDP file exceeds the supported file capacity.');
  need(typeof mediaType === 'string' && mediaType.length >= 1 && mediaType.length <= 256 && !/[\r\n\u0000]/.test(mediaType), 'Invalid original media type.');
  return { name: ddpFileName(name), mediaType, bytes: bytes.length, sha256: ddpHash(bytes), base64: bytes.toString('base64'),
    provenance: ddpProvenance(provenance) };
}
export function fredDdpFileBytes(file) {
  allowedKeys(file, ['name', 'mediaType', 'bytes', 'sha256', 'base64', 'provenance'], 'original source file');
  need(typeof file.base64 === 'string' && file.base64.length % 4 === 0 &&
    file.base64.length <= Math.ceil(MAX_DDP_FILE_BYTES / 3) * 4 && !/[^A-Za-z0-9+/=]/.test(file.base64), 'Invalid original source encoding.');
  const bytes = Buffer.from(file.base64, 'base64');
  need(bytes.toString('base64') === file.base64 && bytes.length === file.bytes && ddpHash(bytes) === file.sha256,
    'The complete original source bytes do not match their retained size and SHA256.');
  return bytes;
}
export function validateFredDdpSourceFile(file) {
  const bytes = fredDdpFileBytes(file);
  const normalized = createFredDdpSourceFile({ name: file.name, mediaType: file.mediaType, content: bytes, provenance: file.provenance });
  need(same(file, normalized), 'The original source file descriptor changed.');
  return clone(normalized);
}
export function fredDdpFileText(file) {
  const bytes = fredDdpFileBytes(file);
  try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}
  catch{need(false,'This original source requires a supported explicit text encoding.');}
}
export function fredDdpFileDescriptor(file) {
  validateFredDdpSourceFile(file);
  const { base64, ...descriptor } = file;
  return clone(descriptor);
}
