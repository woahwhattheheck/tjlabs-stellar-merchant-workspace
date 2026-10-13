// SPDX-License-Identifier: MIT
// Original bank statement intake. Node built-ins only; no network or workspace mutation.
import { createHash } from 'node:crypto';
import { readCamt053Statements } from './source-camt053.mjs';

export const BANK_STATEMENT_SOURCE_SCHEMA = 'stellar-forge.bank-statement-source.v1';
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_ROWS = 100000;
const MAX_NODES = 1500000;
const hash = value => createHash('sha256').update(value).digest('hex');
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const jsonHash = value => hash(JSON.stringify(value));
const textValue = value => value == null ? '' : String(value);

export class BankStatementSourceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BankStatementSourceError';
    this.code = code;
    this.status = 400;
    this.details = details;
  }
}
function fail(code, message, details = {}) { throw new BankStatementSourceError(code, message, details); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT', label + ' must be an object');
  return value;
}
function issue(list, code, message, source = null, severity = 'ERROR', detail = {}) {
  const entry = { code, severity, message, ...(source ? { source } : {}), ...detail };
  list.push(entry);
  return entry;
}
function attempt(list, source, fn) {
  try { return fn(); }
  catch (error) {
    if (!(error instanceof BankStatementSourceError)) throw error;
    issue(list, error.code, error.message, source, 'ERROR', { detail: error.details });
    return null;
  }
}
function strictString(value, label, limit = 4096) {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    fail('INVALID_TEXT', label + ' must be a bounded text string', { limit });
  }
  return value.trim();
}
function readFile(value) {
  const file = object(value, 'file');
  const name = strictString(file.name, 'file.name', 240);
  if (!name || /[/\\]/.test(name)) fail('INVALID_FILE_NAME', 'Use the original file basename');
  const hasBase64 = own(file, 'dataBase64');
  const hasContent = own(file, 'content');
  if (hasBase64 === hasContent) fail('INVALID_FILE', 'Provide exactly one of file.dataBase64 or file.content');
  let bytes;
  const encoding = hasBase64 ? 'base64' : file.encoding;
  const content = hasBase64 ? file.dataBase64 : file.content;
  if (typeof content !== 'string') fail('INVALID_FILE', 'Original file content must be a string');
  if (encoding === 'base64') {
    if (content.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) {
      fail('INVALID_BASE64', 'Provide complete standard base64 of the original bytes');
    }
    bytes = Buffer.from(content, 'base64');
    if (bytes.toString('base64') !== content) fail('INVALID_BASE64', 'Base64 contains noncanonical trailing bits');
  } else if (encoding === 'utf8') {
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(content)) {
      fail('INVALID_UNICODE', 'UTF-8 content contains an unpaired surrogate');
    }
    bytes = Buffer.from(content, 'utf8');
  } else fail('INVALID_FILE_ENCODING', 'file.encoding must be utf8 or base64');
  if (!bytes.length || bytes.length > MAX_BYTES) fail('FILE_SIZE', 'Statement file must be between 1 and 33554432 bytes');
  return { bytes, file: { name, bytes: bytes.length, sha256: hash(bytes) }, transport: encoding };
}
function normalizeEncoding(label) {
  const value = String(label || '').trim().toLowerCase().replaceAll('_', '-');
  if (['utf8', 'utf-8', '65001'].includes(value)) return 'utf-8';
  if (['ascii', 'usascii', 'us-ascii', '20127'].includes(value)) return 'us-ascii';
  if (['1252', 'windows-1252', 'cp1252', 'ansi'].includes(value)) return 'windows-1252';
  if (['latin1', 'latin-1', 'iso-8859-1', '8859-1'].includes(value)) return 'iso-8859-1';
  if (['utf16', 'utf-16', 'unicode', 'utf-16le', 'utf16le'].includes(value)) return 'utf-16le';
  if (['utf-16be', 'utf16be'].includes(value)) return 'utf-16be';
  fail('UNSUPPORTED_TEXT_ENCODING', 'Use UTF-8, ASCII, Windows-1252, ISO-8859-1, or BOM-marked UTF-16', { encoding: label });
}
function decodeText(bytes, format, explicit, transport) {
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 'utf-8'
    : bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : null;
  const probeEncoding = bom || 'utf-8';
  let probe;
  if (bom) probe = new TextDecoder(probeEncoding, { fatal: false, ignoreBOM: true }).decode(bytes.subarray(0, Math.min(bytes.length, 16384)));
  else probe = bytes.subarray(0, Math.min(bytes.length, 16384)).toString('latin1');
  const xml = probe.match(/<\?xml\b[^?]*\bencoding\s*=\s*["']([^"']+)["']/i);
  const nativeHeader = Object.create(null);
  const rootIndex = probe.search(/<OFX(?:\s|>)/i);
  const header = rootIndex >= 0 ? probe.slice(0, rootIndex) : '';
  for (const line of header.replace(/^\ufeff/, '').split(/\r\n|\n|\r/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9]*)\s*:\s*([^\r\n]*)$/i);
    if (m) {
      const key = m[1].toUpperCase();
      if (own(nativeHeader, key)) fail('DUPLICATE_OFX_HEADER', 'Duplicate OFX header field', { field: key });
      nativeHeader[key] = m[2].trim();
    }
  }
  let declared = xml ? (format === 'CAMT053' && /^utf-?16$/i.test(xml[1]) && bom?.startsWith('utf-16') ? bom : normalizeEncoding(xml[1])) : null;
  if (!declared && format !== 'CSV' && nativeHeader.ENCODING) {
    const enc = nativeHeader.ENCODING.toUpperCase();
    const charset = nativeHeader.CHARSET;
    if (enc === 'USASCII' && charset && charset.toUpperCase() !== 'NONE') declared = normalizeEncoding(charset);
    else if (enc === 'UNICODE' && (!charset || charset.toUpperCase() === 'NONE')) declared = bom || 'utf-16le';
    else declared = normalizeEncoding(enc);
  }
  const chosen = explicit ? normalizeEncoding(explicit) : bom || declared || 'utf-8';
  if (bom && chosen !== bom) fail('TEXT_ENCODING_CONFLICT', 'Selected encoding conflicts with the original byte-order mark', { chosen, bom });
  if (declared && chosen !== declared && !(declared === 'us-ascii' && ['utf-8', 'windows-1252'].includes(chosen))) {
    fail('TEXT_ENCODING_CONFLICT', 'Selected encoding conflicts with the file declaration', { chosen, declared });
  }
  if (chosen === 'us-ascii' && bytes.some(b => b > 127)) fail('INVALID_ASCII', 'ASCII file contains non-ASCII bytes');
  if (chosen.startsWith('utf-16') && bytes.length % 2) fail('INVALID_UTF16', 'UTF-16 bytes end in a partial code unit');
  if (transport === 'utf8' && !['utf-8', 'us-ascii'].includes(chosen) && bytes.some(b => b > 127)) {
    fail('ORIGINAL_BYTES_REQUIRED', 'Upload base64 of the original file for a non-UTF-8 bank encoding', { declared: chosen });
  }
  let text;
  try {
    if (chosen === 'iso-8859-1') text = bytes.toString('latin1');
    else text = new TextDecoder(chosen === 'us-ascii' ? 'utf-8' : chosen, { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch { fail('INVALID_TEXT_ENCODING', 'Original bytes are not valid in the selected encoding', { encoding: chosen }); }
  if (format === 'CAMT053') {
    const originalDeclaration = text.match(/^\ufeff?<\?xml\b[^?]*\bencoding\s*=\s*["']([^"']+)["']/i);
    if (originalDeclaration) {
      const originalEncoding = /^utf-?16$/i.test(originalDeclaration[1]) && chosen.startsWith('utf-16') ? chosen : normalizeEncoding(originalDeclaration[1]);
      if (chosen !== originalEncoding && !(originalEncoding === 'us-ascii' && chosen === 'utf-8')) fail('TEXT_ENCODING_CONFLICT', 'Selected CAMT encoding conflicts with its original XML declaration', { chosen, declared: originalEncoding });
      declared = originalEncoding;
    }
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) fail('INVALID_TEXT', 'Decoded statement contains invalid control characters');
  return { text, encoding: chosen, declaration: declared, bom, header: nativeHeader };
}
function decimal(value, { decimalSeparator = '.', groupSeparator = '', allowNegative = true } = {}) {
  if (!['.', ','].includes(decimalSeparator) || !['', '.', ',', ' ', '\u00a0', '\u202f', "'"].includes(groupSeparator) || decimalSeparator === groupSeparator) {
    fail('INVALID_NUMBER_FORMAT', 'Select distinct decimal and group separators');
  }
  if (typeof value !== 'string') fail('INVALID_AMOUNT', 'Amounts must retain their original decimal text');
  let raw = value.trim();
  if (!raw || raw.length > 260) fail('INVALID_AMOUNT', 'Amount is missing or too long', { value: raw });
  let negative = false;
  if (raw.startsWith('(') || raw.endsWith(')')) {
    if (!/^\([^()]+\)$/.test(raw)) fail('INVALID_AMOUNT', 'Amount has malformed parentheses', { value });
    raw = raw.slice(1, -1).trim();
    negative = true;
    if (/^[+-]/.test(raw)) fail('INVALID_AMOUNT', 'Amount has both parentheses and an explicit sign', { value });
  } else if (/^[+-]/.test(raw)) {
    negative = raw[0] === '-';
    raw = raw.slice(1);
  }
  const pieces = raw.split(decimalSeparator);
  if (pieces.length > 2) fail('INVALID_AMOUNT', 'Amount has more than one decimal separator', { value });
  let integer = pieces[0];
  const fraction = pieces.length === 2 ? pieces[1] : '';
  if (groupSeparator && integer.includes(groupSeparator)) {
    const groups = integer.split(groupSeparator);
    if (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some(x => !/^\d{3}$/.test(x))) fail('INVALID_AMOUNT_GROUPING', 'Amount grouping does not match the selected separator', { value });
    integer = groups.join('');
  }
  if (!/^\d+$/.test(integer) || (pieces.length === 2 && !/^\d+$/.test(fraction)) || integer.length + fraction.length > 128) {
    fail('INVALID_AMOUNT', 'Amount must be an exact decimal without exponent or currency symbols', { value });
  }
  integer = integer.replace(/^0+(?=\d)/, '');
  const kept = fraction.replace(/0+$/, '');
  const zero = integer === '0' && !kept;
  if (negative && !allowNegative && !zero) fail('NEGATIVE_DEBIT_CREDIT', 'Separate debit and credit columns must contain nonnegative amounts', { value });
  return (!zero && negative ? '-' : '') + integer + (kept ? '.' + kept : '');
}
function currency(value) {
  const result = strictString(value, 'currency', 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(result)) fail('INVALID_CURRENCY', 'Use the original three-letter currency code', { value });
  return result;
}
function calendarDate(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [0,31,leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
  if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1 || d > days[m]) fail('INVALID_DATE', 'Source date is not a valid calendar date', { year, month, day });
  return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
function ofxDate(value) {
  const raw = strictString(value, 'OFX date', 80);
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(?:(\d{2})(?:(\d{2})(?:\.(\d{1,9}))?)?)?)?(?:\[([+-]?\d{1,2}(?:\.\d{1,2})?)(?::([^\]\r\n]+))?\])?$/);
  if (!m) fail('INVALID_OFX_DATE', 'Use the original OFX calendar date, optional time and GMT offset', { value });
  const date = calendarDate(m[1], m[2], m[3]);
  if (Number(m[4] || 0) > 23 || Number(m[5] || 0) > 59 || Number(m[6] || 0) > 60) fail('INVALID_OFX_DATE', 'OFX time is outside its valid range', { value });
  if (m[8] && Math.abs(Number(m[8])) > 12) fail('INVALID_OFX_DATE', 'OFX GMT offset exceeds twelve hours', { value });
  return {
    raw, date,
    time: m[4] ? m[4] + ':' + (m[5] || '00') + ':' + (m[6] || '00') + (m[7] ? '.' + m[7] : '') : null,
    precision: m[7] ? 'FRACTION' : m[6] ? 'SECOND' : m[5] ? 'MINUTE' : m[4] ? 'HOUR' : 'DATE',
    offsetHours: m[8] || '0', zone: m[9] || null,
    offsetExplicit: Boolean(m[8]), calendarBasis: 'SOURCE_CALENDAR'
  };
}
function csvDate(value, format) {
  const raw = strictString(value, 'CSV date', 80);
  const m = raw.match(/^(\d{1,4})([-/.])(\d{1,2})\2(\d{1,4})$/);
  if (!m) fail('INVALID_CSV_DATE', 'Map a calendar-date column using the selected YMD, DMY or MDY format', { value, format });
  const parts = format === 'YMD' ? [m[1],m[3],m[4]] : format === 'DMY' ? [m[4],m[3],m[1]] : [m[4],m[1],m[3]];
  if (parts[0].length !== 4 || parts[1].length > 2 || parts[2].length > 2) fail('INVALID_CSV_DATE', 'CSV date must contain an explicit four-digit year', { value, format });
  return { raw, date: calendarDate(...parts), time: null, precision: 'DATE', offsetHours: null, zone: null, offsetExplicit: false, calendarBasis: 'SOURCE_CALENDAR' };
}
function addDecimals(values) {
  let scale = 0;
  const parsed = values.map(value => {
    const negative = value.startsWith('-');
    const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
    scale = Math.max(scale, fraction.length);
    return { negative, whole, fraction };
  });
  let total = 0n;
  for (const p of parsed) total += (p.negative ? -1n : 1n) * BigInt(p.whole + p.fraction.padEnd(scale, '0'));
  const sign = total < 0n ? '-' : '';
  const digits = (total < 0n ? -total : total).toString().padStart(scale + 1, '0');
  return decimal(sign + (scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits));
}
function makeLocator(text, encoding) {
  let char = 0, byte = 0, line = 1, pendingCR = false;
  return position => {
    if (position < char) fail('SOURCE_POSITION', 'Source parser moved behind its retained byte cursor');
    const piece = text.slice(char, position);
    byte += encoding === 'utf-8' ? Buffer.byteLength(piece, 'utf8') : encoding.startsWith('utf-16') ? piece.length * 2 : piece.length;
    for (const c of piece) {
      if (c === '\r') { line++; pendingCR = true; }
      else if (c === '\n') { if (!pendingCR) line++; pendingCR = false; }
      else pendingCR = false;
    }
    char = position;
    return { char: position, byte, line };
  };
}
function entities(value, legacy) {
  const known = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  if (!legacy && /&(?!#(?:[0-9]+|x[0-9a-fA-F]+);|(?:amp|lt|gt|quot|apos);)/.test(value)) fail('INVALID_XML_ENTITY', 'XML text contains an undeclared or incomplete entity');
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (all, code) => {
    if (own(known, code)) return known[code];
    if (code[0] !== '#') {
      if (legacy) return all;
      fail('INVALID_XML_ENTITY', 'Undeclared XML entity', { entity: code });
    }
    const point = Number.parseInt(code.slice(code[1] === 'x' ? 2 : 1), code[1] === 'x' ? 16 : 10);
    if (!Number.isSafeInteger(point) || point < 1 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff) || (point < 32 && ![9,10,13].includes(point))) fail('INVALID_XML_ENTITY', 'Invalid numeric character reference');
    return String.fromCodePoint(point);
  });
}
const AGGREGATES = new Set(('OFX SIGNONMSGSRSV1 SONRS STATUS FI BANKMSGSRSV1 STMTTRNRS STMTRS BANKACCTFROM BANKACCTTO BANKTRANLIST BANKTRANLISTP STMTTRN STMTTRNP LEDGERBAL AVAILBAL BALLIST BAL CREDITCARDMSGSRSV1 CCSTMTTRNRS CCSTMTRS CCACCTFROM CCACCTTO STMTENDTRNRS STMTENDRS CLOSING CCSTMTENDTRNRS CCSTMTENDRS CCCLOSING CURRENCY ORIGCURRENCY PAYEE IMAGEDATA LOANPMTINFO ESCRWAMT CREDITLINEINFO LASTPMTINFO REWARDINFO OFXEXTENSION LOANDETAIL').split(' '));
const SCALARS = new Set(('CODE SEVERITY MESSAGE DTSERVER LANGUAGE DTPROFUP DTACCTUP DTFI DTSYNC SESSCOOKIE USERKEY TSKEYEXP ORG FID INTU.BID INTU.USERID TRNUID CLTCOOKIE TAN CURDEF BANKID BRANCHID ACCTID ACCTTYPE ACCTKEY DTSTART DTEND DTASOF BALAMT NAME DESC BALTYPE VALUE TRNTYPE DTPOSTED DTUSER DTAVAIL DTTRAN DTEXPIRE TRNAMT FITID CORRECTFITID CORRECTACTION SRVRTID CHECKNUM REFNUM SIC PAYEEID EXTDNAME MEMO CURSYM CURRATE INV401KSOURCE ADDR1 ADDR2 ADDR3 CITY STATE POSTALCODE COUNTRY PHONE DTOPEN DTCLOSE DTNEXT BALOPEN BALCLOSE BALMIN DEPANDCREDIT CHKANDDEB TOTALFEES TOTALINT INTRATE INTYTD DTPOSTSTART DTPOSTEND DTPMTDUE MINPMTDUE PASTDUEAMT LATEFEEAMT FINCHG INTRATEPURCH INTRATECASH INTRATEXFER PAYANDCREDIT PURANDADV DEBADJ CREDITLIMIT CASHADVBALAMT CASHADVAVAILAMT CASHADVCREDITLIMIT AUTOPAY REWARDBAL REWARDEARNED MKTGINFO').split(' '));
function parseOfx(text, encoding, header) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) fail('UNSUPPORTED_XML_DECLARATION', 'OFX must contain its original inline data without a DTD or external entity');
  const legacy = String(header.OFXHEADER || '') === '100' || String(header.VERSION || '').startsWith('1');
  const rootAt = text.search(/<OFX(?:\s|>)/i);
  if (rootAt < 0) fail('OFX_ROOT_MISSING', 'The original file contains no OFX root');
  if (!legacy && text.slice(0,rootAt).replace(/^\ufeff/, '').replace(/<\?[\s\S]*?\?>/g, '').trim()) fail('INVALID_OFX_PREAMBLE', 'Unexpected text before OFX XML root');
  if (legacy && header.COMPRESSION && header.COMPRESSION.toUpperCase() !== 'NONE') fail('UNSUPPORTED_OFX_COMPRESSION', 'Decompress the original OFX response before importing it');
  const closedNames = new Set([...text.matchAll(/<\/\s*([A-Za-z_][A-Za-z0-9_.:-]*)\s*>/g)].map(x=>x[1].toUpperCase()));
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(?:[^<>"']|"[^"]*"|'[^']*')*>/g;
  tokens.lastIndex = rootAt;
  const locator = makeLocator(text, encoding);
  const stack = [];
  let root = null, last = rootAt, count = 0, token;
  function addText(piece, cdata = false) {
    const top = stack.at(-1);
    if (!top) { if (piece.trim()) fail('INVALID_OFX_STRUCTURE', 'Text occurs outside the OFX root'); return; }
    if (top.aggregate) { if (piece.trim()) fail('INVALID_OFX_STRUCTURE', 'OFX aggregate contains untagged data', { tag: top.name }); }
    else top.value += cdata ? piece : entities(piece, legacy);
  }
  function finish(node, end) { node.end = end.char; node.byteEnd = end.byte; node.lineEnd = end.line; }
  while ((token = tokens.exec(text))) {
    const start = locator(token.index), markup = token[0];
    if (text.slice(last, token.index).includes('<')) fail('INVALID_OFX_TAG', 'Malformed OFX markup between tags');
    addText(text.slice(last, token.index));
    if (markup.startsWith('<!--')) {
      if (markup.slice(4,-3).includes('--')) fail('INVALID_XML_COMMENT', 'Malformed XML comment');
      locator(tokens.lastIndex); last = tokens.lastIndex; continue;
    }
    if (markup.startsWith('<![CDATA[')) {
      addText(markup.slice(9,-3), true); locator(tokens.lastIndex); last = tokens.lastIndex; continue;
    }
    if (markup.startsWith('<?')) {
      if (stack.length) fail('UNSUPPORTED_OFX_PROCESSING', 'Processing instruction occurs inside the statement');
      locator(tokens.lastIndex); last = tokens.lastIndex; continue;
    }
    const closing = markup.match(/^<\/\s*([A-Za-z_][A-Za-z0-9_.:-]*)\s*>$/);
    if (closing) {
      const name = closing[1].toUpperCase();
      if (legacy && stack.length && !stack.at(-1).aggregate && stack.at(-1).name !== name) finish(stack.pop(), start);
      const top = stack.pop();
      if (!top || top.name !== name) fail('INVALID_OFX_STRUCTURE', 'OFX closing tag does not match its open tag', { tag: name, open: top?.name || null });
      finish(top, locator(tokens.lastIndex));
    } else {
      const open = markup.match(/^<([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*?)>$/);
      if (!open || markup.startsWith('<!')) fail('INVALID_OFX_TAG', 'Unsupported OFX declaration or malformed tag');
      const name = open[1].toUpperCase();
      if (name.includes(':')) fail('UNSUPPORTED_OFX_NAMESPACE', 'Prefixed OFX tags require an explicit source adapter', { tag: name });
      const selfClosing = /\/\s*$/.test(open[2]);
      let attributes = open[2].replace(/\/\s*$/, '');
      while (attributes.trim()) {
        const m = attributes.match(/^\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*("[^"]*"|'[^']*')/);
        if (!m) fail('INVALID_XML_ATTRIBUTE', 'OFX contains malformed tag attributes', { tag: name });
        entities(m[2].slice(1,-1), legacy);
        attributes = attributes.slice(m[0].length);
      }
      if (legacy && stack.length && !stack.at(-1).aggregate) finish(stack.pop(), start);
      if (stack.length && !stack.at(-1).aggregate) fail('INVALID_OFX_STRUCTURE', 'A scalar OFX field contains nested tags', { tag: stack.at(-1).name });
      if (++count > MAX_NODES || stack.length >= 64) fail('OFX_LIMIT', 'OFX structure exceeds supported node or depth limits');
      const parent = stack.at(-1);
      if (!parent && root) fail('INVALID_OFX_STRUCTURE', 'The file contains more than one OFX root');
      if (!parent && name !== 'OFX') fail('INVALID_OFX_STRUCTURE', 'The outermost tag must be OFX');
      const index = parent ? (parent.counts[name] = (parent.counts[name] || 0) + 1) : 1;
      const node = { name, aggregate: AGGREGATES.has(name) || (!SCALARS.has(name) && closedNames.has(name)), children: [], counts: Object.create(null), value: '', start: start.char, byteStart: start.byte, lineStart: start.line, end: null, byteEnd: null, lineEnd: null, pointer: (parent?.pointer || '') + '/' + name + '[' + index + ']', parent };
      if (parent) parent.children.push(node); else root = node;
      if (selfClosing) finish(node, locator(tokens.lastIndex)); else { stack.push(node); locator(tokens.lastIndex); }
    }
    last = tokens.lastIndex;
  }
  addText(text.slice(last));
  if (stack.length) fail('INCOMPLETE_OFX', 'The original OFX file ends before all aggregates close', { open: stack.map(n=>n.name) });
  if (!root) fail('OFX_ROOT_MISSING', 'No complete OFX statement was found');
  if (text.slice(last).trim()) fail('INVALID_OFX_STRUCTURE', 'Unexpected trailing data after OFX root');
  return { root, legacy, nodeCount: count };
}
function children(node, name) { return node?.children.filter(n=>n.name === name) || []; }
function one(node, name) {
  const found = children(node, name);
  if (found.length > 1) fail('DUPLICATE_OFX_FIELD', 'OFX field appears more than once', { pointer: node.pointer, field: name });
  return found[0] || null;
}
function scalar(node, name, required = false) {
  const found = one(node, name);
  if (!found) {
    if (required) fail('MISSING_OFX_FIELD', 'Required OFX field is missing', { pointer: node?.pointer || '/', field: name });
    return '';
  }
  if (found.children.length) fail('INVALID_OFX_FIELD', 'Expected a scalar OFX field', { pointer: found.pointer });
  const value = found.value.trim();
  if (required && !value) fail('MISSING_OFX_FIELD', 'Required OFX field is empty', { pointer: found.pointer, field: name });
  return value;
}
function walk(node, names, output = []) {
  if (names.has(node.name)) output.push(node);
  for (const child of node.children) walk(child, names, output);
  return output;
}
function sourceOf(node, text, recordNumber = null) {
  return { pointer: node.pointer, pointerSyntax: 'OFX_PATH', recordNumber, lineStart: node.lineStart, lineEnd: node.lineEnd, charStart: node.start, charEnd: node.end, byteStart: node.byteStart, byteEnd: node.byteEnd, raw: text.slice(node.start,node.end) };
}
function flatOriginal(node) {
  const result = Object.create(null);
  for (const child of node.children) {
    const v = child.children.length ? flatOriginal(child) : child.value.trim();
    if (!own(result, child.name)) result[child.name] = v;
    else if (Array.isArray(result[child.name])) result[child.name].push(v);
    else result[child.name] = [result[child.name], v];
  }
  return result;
}

function nativeAccount(node, fi, list, text, explicitNamespace) {
  const source = sourceOf(node, text);
  const bank = attempt(list, source, () => one(node, 'BANKACCTFROM'));
  const card = attempt(list, source, () => one(node, 'CCACCTFROM'));
  if (bank && card) issue(list, 'AMBIGUOUS_ACCOUNT', 'Statement includes both a bank account and a credit card account', source);
  const from = bank || card;
  if (!from) issue(list, 'ACCOUNT_MISSING', 'Statement has no original account aggregate', source);
  const get = name => attempt(list, source, () => scalar(from, name)) || '';
  const account = {
    kind: card ? 'CREDIT_CARD' : 'BANK',
    bankId: get('BANKID'), branchId: get('BRANCHID'), accountId: get('ACCTID'),
    accountType: card ? 'CREDITCARD' : get('ACCTTYPE'), accountKey: get('ACCTKEY'),
    financialInstitution: { id: fi.id || '', name: fi.name || '' },
    currency: attempt(list, source, () => currency(scalar(node, 'CURDEF', true))) || null,
    namespace: explicitNamespace ? strictString(explicitNamespace, 'accountNamespace', 255) : '',
    source: from ? sourceOf(from, text) : source
  };
  return finishAccount(account, list);
}
function finishAccount(account, list) {
  if (!account.accountId) issue(list, 'ACCOUNT_ID_MISSING', 'Account number or identifier is required for source binding', account.source);
  const institution = account.bankId ? 'BANKID:' + account.bankId
    : account.financialInstitution.id ? 'FID:' + account.financialInstitution.id
    : account.namespace ? 'OPERATOR:' + account.namespace
    : account.financialInstitution.name ? 'ORG:' + account.financialInstitution.name : '';
  account.identityBasis = { kind: account.kind, institution, branchId: account.branchId, accountId: account.accountId };
  account.identitySha256 = institution && account.accountId ? jsonHash(account.identityBasis) : null;
  if (!institution) issue(list, 'BANK_NAMESPACE_MISSING', 'Bind the source to an explicit bank account; this file does not identify the financial institution', account.source, 'WARNING');
  if (!account.bankId && !account.financialInstitution.id && !account.namespace && account.financialInstitution.name) issue(list, 'BANK_NAME_NAMESPACE', 'Source identity uses the institution name; retain explicit account binding across bank naming changes', account.source, 'WARNING');
  return account;
}
function nativeCurrency(node, defaultCurrency, list, text) {
  const source = sourceOf(node, text);
  const cur = attempt(list, source, () => one(node, 'CURRENCY'));
  const original = attempt(list, source, () => one(node, 'ORIGCURRENCY'));
  if (cur && original) issue(list, 'AMBIGUOUS_CURRENCY', 'The same transaction contains both CURRENCY and ORIGCURRENCY', source);
  const aggregate = cur || original;
  if (!aggregate) return { currency: defaultCurrency, conversion: null };
  const code = attempt(list, source, () => currency(scalar(aggregate, 'CURSYM', true)));
  const rateRaw = attempt(list, source, () => scalar(aggregate, 'CURRATE', true)) || '';
  const rate = attempt(list, source, () => decimal(rateRaw, { allowNegative: false }));
  if (rate === '0') issue(list, 'INVALID_CURRENCY_RATE', 'Currency conversion rate must be positive', source);
  const conversion = { kind: cur ? 'UNCONVERTED_CURRENCY' : 'BANK_CONVERTED_ORIGINAL', currency: code, rate, rateRaw, source: sourceOf(aggregate,text), original: flatOriginal(aggregate) };
  return { currency: cur ? code : defaultCurrency, conversion };
}
function nativeDateField(node, field, list, text, required = false) {
  const raw = attempt(list, sourceOf(node,text), () => scalar(node,field,required));
  return raw ? attempt(list, sourceOf(node,text), () => ofxDate(raw)) : null;
}
function nativeBalance(node, name, currencyCode, list, text) {
  const found = attempt(list, sourceOf(node,text), () => one(node,name));
  if (!found) return null;
  const source = sourceOf(found,text);
  return {
    kind: name, currency: currencyCode,
    amount: attempt(list,source,()=>decimal(scalar(found,'BALAMT',true))),
    amountRaw: attempt(list,source,()=>scalar(found,'BALAMT')) || '',
    asOf: nativeDateField(found,'DTASOF',list,text,true),
    source, original: flatOriginal(found)
  };
}
function nativeClosing(node, account, text) {
  const issues = [], source = sourceOf(node,text);
  const get = name => attempt(issues,source,()=>scalar(node,name)) || '';
  const providerId = get('FITID');
  if (!providerId) issue(issues,'CLOSING_ID_MISSING','Closing statement does not contain its original FITID',source);
  const money = field => {
    const raw = get(field);
    return raw ? { raw, amount: attempt(issues,source,()=>decimal(raw)) } : null;
  };
  const converted = nativeCurrency(node,account.currency,issues,text);
  const opening = money('BALOPEN'), closing = money('BALCLOSE');
  if (!opening || !closing) issue(issues,'CLOSING_BALANCE_MISSING','Original closing statement is missing BALOPEN or BALCLOSE',source);
  const dates = Object.fromEntries(['DTOPEN','DTCLOSE','DTNEXT','DTPOSTSTART','DTPOSTEND'].map(field=>[field,nativeDateField(node,field,issues,text,['DTOPEN','DTCLOSE'].includes(field))]));
  const totals = Object.fromEntries(['BALMIN','DEPANDCREDIT','CHKANDDEB','TOTALFEES','TOTALINT','INTYTD','MINPMTDUE','PASTDUEAMT','LATEFEEAMT','FINCHG','PAYANDCREDIT','PURANDADV','DEBADJ','CREDITLIMIT','CASHADVBALAMT','CASHADVAVAILAMT','CASHADVCREDITLIMIT'].map(field=>[field,money(field)]).filter(([,value])=>value));
  return {
    id: jsonHash({ account: account.identityBasis, pointer: source.pointer, raw: source.raw }),
    kind: node.name, providerId: providerId || null,
    providerKey: account.identitySha256 && providerId ? jsonHash({account:account.identitySha256,kind:'CLOSING',providerId}) : null,
    currency: converted.currency, currencyConversion: converted.conversion,
    from: dates.DTOPEN?.date || null, until: dates.DTCLOSE?.date || null,
    opening: opening ? { amount: opening.amount, amountRaw: opening.raw, asOf: dates.DTOPEN, currency:converted.currency, source } : null,
    closing: closing ? { amount: closing.amount, amountRaw: closing.raw, asOf: dates.DTCLOSE, currency:converted.currency, source } : null,
    dates, totals, source, original:flatOriginal(node), issues,
    eligible: !issues.some(x=>x.severity==='ERROR')
  };
}
function nativeRow(node, account, file, text, recordNumber, pending) {
  const issues = [], source = sourceOf(node,text,recordNumber);
  const get = (name,required=false) => attempt(issues,source,()=>scalar(node,name,required)) || '';
  const providerId = get('FITID',!pending);
  if (providerId.length>255) issue(issues,'PROVIDER_ID_LENGTH','Native FITID exceeds 255 characters',source);
  const target = get('CORRECTFITID'), action = get('CORRECTACTION');
  if ((target && !['REPLACE','DELETE'].includes(action)) || (!target && action)) issue(issues,'INVALID_CORRECTION','A correction requires CORRECTFITID plus REPLACE or DELETE',source);
  if (target && providerId && target===providerId) issue(issues,'SELF_CORRECTION','Correction record reuses its target FITID; preserve its source revision for the reviewed replacement',source,'WARNING');
  if (pending && (providerId || target || action)) issue(issues,'PENDING_IDENTITY','Pending OFX rows must not carry posted transaction identity or corrections',source);
  const postedAtRaw = get(pending ? 'DTTRAN' : 'DTPOSTED',true);
  const postedAt = postedAtRaw ? attempt(issues,source,()=>ofxDate(postedAtRaw)) : null;
  const amountRaw = get('TRNAMT',true);
  const amount = amountRaw ? attempt(issues,source,()=>decimal(amountRaw)) : null;
  const converted = nativeCurrency(node,account.currency,issues,text);
  if (converted.currency && account.currency && converted.currency!==account.currency) issue(issues,'FOREIGN_TRANSACTION_CURRENCY','Amount remains in its original foreign currency; select explicit conversion evidence before accounting',source,'WARNING',{currency:converted.currency,accountCurrency:account.currency});
  let payee = get('NAME');
  const payeeNode = attempt(issues,source,()=>one(node,'PAYEE'));
  if (payee && payeeNode) issue(issues,'AMBIGUOUS_PAYEE','OFX contains both NAME and PAYEE',source);
  if (!payee && payeeNode) payee = attempt(issues,source,()=>scalar(payeeNode,'NAME')) || '';
  const row = {
    id: jsonHash({file:file.sha256,pointer:source.pointer}),
    providerId:providerId || null,
    providerKey: account.identitySha256 && providerId ? jsonHash({account:account.identitySha256,kind:'TRANSACTION',providerId}) : null,
    status:pending ? 'PENDING' : 'POSTED',
    postedDate:postedAt?.date || null, postedAtRaw, postedAt,
    amount, amountRaw, currency:converted.currency, currencyConversion:converted.conversion,
    type:get('TRNTYPE',true), payee, extendedName:get('EXTDNAME'), memo:get('MEMO'),
    reference:get('REFNUM'), checkNumber:get('CHECKNUM'), serverTransactionId:get('SRVRTID'),
    userDate:nativeDateField(node,'DTUSER',issues,text),
    availableDate:nativeDateField(node,'DTAVAIL',issues,text),
    expiresAt:nativeDateField(node,'DTEXPIRE',issues,text),
    correction:target || action ? {action,providerId:target,providerKey:account.identitySha256 && target ? jsonHash({account:account.identitySha256,kind:'TRANSACTION',providerId:target}) : null} : null,
    runningBalance:null, source, original:flatOriginal(node), issues
  };
  row.candidateFingerprint = candidateFingerprint(account,row);
  row.eligible = !pending && !issues.some(x=>x.severity==='ERROR') && Boolean(row.postedDate && row.amount!==null && row.currency);
  return row;
}
function candidateFingerprint(account,row) {
  return jsonHash({account:account.identityBasis,date:row.postedDate,amount:row.amount,currency:row.currency,payee:row.payee,reference:row.reference,checkNumber:row.checkNumber});
}
function statementSummary(rows,pendingRows) {
  const groups = new Map();
  for (const row of rows) {
    if (row.amount===null || !row.currency || row.correction?.action==='DELETE') continue;
    const values = groups.get(row.currency) || [];
    values.push(row.amount); groups.set(row.currency,values);
  }
  return { postedCount:rows.length,pendingCount:pendingRows.length,invalidPostedCount:rows.filter(row=>!row.eligible).length,
    currencyTotals:[...groups].map(([code,values])=>({currency:code,credit:addDecimals(values.filter(x=>!x.startsWith('-'))),debit:addDecimals(values.filter(x=>x.startsWith('-')).map(x=>x.slice(1))),net:addDecimals(values)})),
    totalsBasis:'SOURCE_ROWS_BEFORE_DEDUPLICATION_OR_CORRECTION_APPLICATION' };
}
function markDuplicates(statements) {
  const seen = new Map();
  for (const statement of statements) for (const row of statement.rows) {
    if (!row.providerKey) continue;
    const fingerprint = jsonHash({date:row.postedDate,amount:row.amount,currency:row.currency,type:row.type,payee:row.payee,memo:row.memo,reference:row.reference,correction:row.correction,...(row.camt?{camt:{creditDebit:row.camt.creditDebit,reversal:row.camt.reversal}}:{})});
    const prior = seen.get(row.providerKey);
    if (!prior) { seen.set(row.providerKey,{row,statement,fingerprint}); continue; }
    const same = prior.fingerprint===fingerprint;
    const code = same ? 'DUPLICATE_PROVIDER_TRANSACTION' : 'CONFLICTING_PROVIDER_TRANSACTION';
    issue(row.issues,code,same ? 'The same account transaction occurs elsewhere in this original file' : 'One account FITID has different transaction details in this original file',row.source,same ? 'WARNING':'ERROR',{otherRowId:prior.row.id});
    row.duplicateOf = prior.row.id;
    if (!same) {
      row.eligible=false; prior.row.eligible=false;
      issue(prior.row.issues,code,'A later record in the original file gives different details for this account FITID',prior.row.source,'ERROR',{otherRowId:row.id});
    }
  }
  for (const statement of statements) statement.summary=statementSummary(statement.rows,statement.pendingRows);
}
function nativeStatements(decoded,file,explicitNamespace) {
  const {text,encoding,header}=decoded;
  const parsed=parseOfx(text,encoding,header), issues=[];
  const fiNodes=walk(parsed.root,new Set(['FI']));
  if (fiNodes.length>1) issue(issues,'MULTIPLE_FINANCIAL_INSTITUTIONS','The OFX envelope contains multiple FI descriptions; bind each account explicitly',null,'WARNING');
  const fi=fiNodes.length===1 ? {id:scalar(fiNodes[0],'FID'),name:scalar(fiNodes[0],'ORG')} : {id:'',name:''};
  const statuses=walk(parsed.root,new Set(['STATUS'])).map(node=>{
    const source=sourceOf(node,text);
    const code=attempt(issues,source,()=>scalar(node,'CODE',true)) || '';
    const severity=attempt(issues,source,()=>scalar(node,'SEVERITY')) || '';
    const message=attempt(issues,source,()=>scalar(node,'MESSAGE')) || '';
    if (code && code!=='0') issue(issues,'PROVIDER_STATUS','OFX provider returned a non-success status',source,severity==='ERROR' ? 'ERROR':'WARNING',{providerCode:code,providerSeverity:severity,providerMessage:message});
    return {code,severity,message,source};
  });
  const containers=walk(parsed.root,new Set(['STMTRS','CCSTMTRS','STMTENDRS','CCSTMTENDRS']));
  if (!containers.length) fail('NO_BANK_STATEMENT','OFX has no banking or credit-card statement response');
  if (containers.length>1000) fail('STATEMENT_LIMIT','File contains too many account statement sections');
  const statements=[];
  let recordNumber=0;
  for (const node of containers) {
    const statementIssues=[], source=sourceOf(node,text);
    const account=nativeAccount(node,fi,statementIssues,text,explicitNamespace);
    const list=attempt(statementIssues,source,()=>one(node,'BANKTRANLIST'));
    const pendingList=attempt(statementIssues,source,()=>one(node,'BANKTRANLISTP'));
    const start=list ? nativeDateField(list,'DTSTART',statementIssues,text) : null;
    const end=list ? nativeDateField(list,'DTEND',statementIssues,text) : null;
    const rows=[],pendingRows=[];
    for (const rowNode of children(list,'STMTTRN')) {
      if (++recordNumber>MAX_ROWS) fail('ROW_LIMIT','Statement file exceeds 100000 transaction rows');
      rows.push(nativeRow(rowNode,account,file,text,recordNumber,false));
    }
    for (const rowNode of children(pendingList,'STMTTRNP')) {
      if (++recordNumber>MAX_ROWS) fail('ROW_LIMIT','Statement file exceeds 100000 transaction rows');
      pendingRows.push(nativeRow(rowNode,account,file,text,recordNumber,true));
    }
    const closing=children(node,node.name==='CCSTMTENDRS' ? 'CCCLOSING':'CLOSING').map(n=>nativeClosing(n,account,text));
    const ledger=nativeBalance(node,'LEDGERBAL',account.currency,statementIssues,text);
    const available=nativeBalance(node,'AVAILBAL',account.currency,statementIssues,text);
    const isClosing=node.name==='STMTENDRS'||node.name==='CCSTMTENDRS';
    if (!isClosing && !ledger) issue(statementIssues,'LEDGER_BALANCE_MISSING','File contains no ledger balance snapshot; retain a separate original closing balance for reconciliation',source,'WARNING');
    statements.push({
      id:jsonHash({file:file.sha256,pointer:source.pointer}),kind:isClosing?'CLOSING_INFORMATION':'TRANSACTION_DOWNLOAD',account,
      period:{kind:isClosing?'CLOSING_INFORMATION':'DOWNLOAD_COVERAGE',from:start?.date||null,until:end?.date||null,rawFrom:start?.raw||'',rawUntil:end?.raw||'',fromDateTime:start,untilDateTime:end,untilExclusive:!isClosing},
      balances:{ledger,available,closing,sourceBalances:[]},rows,pendingRows,excludedRows:[],
      source,issues:statementIssues,summary:statementSummary(rows,pendingRows)
    });
  }
  // Joining an original closing block to the same account exposes evidence without merging its transactions.
  for (const statement of statements.filter(x=>x.kind==='TRANSACTION_DOWNLOAD')) {
    statement.balances.closing=statements.filter(x=>x.kind==='CLOSING_INFORMATION' && x.account.identitySha256 && x.account.identitySha256===statement.account.identitySha256 && x.account.currency===statement.account.currency).flatMap(x=>x.balances.closing.map(c=>({...c,linkedFromStatementId:x.id})));
  }
  const supportedRows=new Set(statements.flatMap(x=>[...x.rows,...x.pendingRows].map(r=>r.source.pointer)));
  const detached=walk(parsed.root,new Set(['STMTTRN','STMTTRNP'])).filter(n=>!supportedRows.has(n.pointer));
  if (detached.length) {
    issue(issues,'UNSUPPORTED_TRANSACTION_LOCATION','Some native transaction records are outside supported bank statement lists; the original file retains them',null,'WARNING',{pointers:detached.map(n=>n.pointer)});
    for (const statement of statements) {
      const pointers=detached.filter(n=>n.pointer.startsWith(statement.source.pointer+'/')).map(n=>n.pointer);
      if (pointers.length) issue(statement.issues,'INCOMPLETE_TRANSACTION_MAPPING','This statement contains transaction records outside its supported posted or pending list',statement.source,'ERROR',{pointers});
    }
  }
  const unsupported=walk(parsed.root,new Set(['INVSTMTRS','LOANSTMTRS','LOANSTMTENDRS']));
  if (unsupported.length) issue(issues,'OTHER_ACCOUNT_SECTIONS','File also contains investment or loan statements requiring their own accounting adapter',null,'WARNING',{pointers:unsupported.map(n=>n.pointer)});
  markDuplicates(statements);
  for (const statement of statements) {
    if (issues.some(x=>x.severity==='ERROR') || statement.issues.some(x=>x.severity==='ERROR')) for (const row of statement.rows) row.eligible=false;
    statement.summary=statementSummary(statement.rows,statement.pendingRows);
  }
  return {statements,issues,native:{dialect:parsed.legacy?'OFX1_SGML':'OFX2_XML',header:{...header},financialInstitution:fi,statuses,nodeCount:parsed.nodeCount}};
}
function readCsvRecords(text,delimiter,encoding) {
  if (![',',';','\t','|'].includes(delimiter)) fail('INVALID_DELIMITER','Choose comma, semicolon, tab or pipe explicitly');
  const records=[],locate=makeLocator(text,encoding);
  let cell='',cells=[],quoted=false,closed=false,start=0,startLocation=locate(0);
  function emit(end,lastLine) {
    cells.push(cell);
    if (records.length===0 && cells.length) cells[0]=cells[0].replace(/^\ufeff/,'');
    const endLocation=locate(end);
    records.push({recordNumber:records.length+1,cells,source:{pointer:'/records/'+records.length,pointerSyntax:'CSV_RECORD',recordNumber:records.length+1,lineStart:startLocation.line,lineEnd:lastLine??endLocation.line,charStart:start,charEnd:end,byteStart:startLocation.byte,byteEnd:endLocation.byte,raw:text.slice(start,end)}});
    if (records.length>MAX_ROWS+10000) fail('ROW_LIMIT','CSV exceeds the supported transaction and metadata row limit');
    cell='';cells=[];closed=false;start=end;startLocation=endLocation;
  }
  for (let i=0;i<text.length;i++) {
    const ch=text[i];
    if (quoted) {
      if (ch==='"') { if (text[i+1]==='"') {cell+='"';i++;} else {quoted=false;closed=true;} }
      else cell+=ch;
      continue;
    }
    if (closed && ch!==delimiter && ch!=='\r' && ch!=='\n') {
      if (ch===' '||ch==='\t') continue;
      fail('INVALID_CSV','Characters occur after a quoted field',{recordNumber:records.length+1,charOffset:i});
    }
    if (ch===delimiter) {cells.push(cell);cell='';closed=false;}
    else if (ch==='\r'||ch==='\n') {
      const end=ch==='\r'&&text[i+1]==='\n'?i+2:i+1;
      const contentLocation=locate(i);
      emit(end,contentLocation.line);
      i=end-1;
    } else if (ch==='"') {
      if (cell!=='') fail('INVALID_CSV','Quote occurs inside an unquoted field',{recordNumber:records.length+1,charOffset:i});
      quoted=true;
    } else cell+=ch;
  }
  if (quoted) fail('INCOMPLETE_CSV','Original CSV ends inside a quoted field',{recordNumber:records.length+1});
  if (start<text.length||cell||cells.length) emit(text.length);
  return records;
}
function columnIndex(spec,headers,label,required=false) {
  if (spec===undefined||spec===null||spec==='') {
    if (required) fail('MISSING_COLUMN','Map the '+label+' column');
    return null;
  }
  if (Number.isInteger(spec)) {
    if (spec<1||spec>headers.length) fail('INVALID_COLUMN','Column indexes are one-based and must exist in the header',{field:label,column:spec});
    return spec-1;
  }
  if (typeof spec!=='string') fail('INVALID_COLUMN','Map columns by exact header or one-based index',{field:label});
  const matches=headers.map((header,index)=>header===spec.trim()?index:-1).filter(index=>index>=0);
  if (matches.length!==1) fail('AMBIGUOUS_COLUMN','Mapped header is missing or repeated; select a one-based column index',{field:label,column:spec});
  return matches[0];
}
function csvAccount(config,record,indexes,list,source) {
  const def=object(config.account,'csv.account');
  const get=name=>indexes[name]!==null && indexes[name]!==undefined ? textValue(record?.cells[indexes[name]]).trim() : textValue(def[name]).trim();
  const institution=def.financialInstitution && typeof def.financialInstitution==='object' ? def.financialInstitution : {};
  const account={
    kind:def.kind==='CREDIT_CARD'?'CREDIT_CARD':'BANK',
    bankId:get('bankId'),branchId:get('branchId'),accountId:get('accountId'),
    accountType:get('accountType')||(def.kind==='CREDIT_CARD'?'CREDITCARD':''),accountKey:textValue(def.accountKey).trim(),
    financialInstitution:{id:textValue(institution.id).trim(),name:textValue(institution.name).trim()},
    currency:attempt(list,source,()=>currency(get('currency'))),
    namespace:textValue(def.namespace).trim(),source
  };
  for (const key of ['bankId','branchId','accountId','accountType','accountKey','namespace']) attempt(list,source,()=>strictString(account[key],key,255));
  return finishAccount(account,list);
}
function mappedCorrection(get,issues,source,account) {
  const target=get('correctsProviderId'),action=get('correctionAction').toUpperCase();
  if (!target&&!action) return null;
  if (!target||!['REPLACE','DELETE'].includes(action)) issue(issues,'INVALID_CORRECTION','Map an original correction target together with REPLACE or DELETE',source);
  return {action,providerId:target,providerKey:account.identitySha256&&target?jsonHash({account:account.identitySha256,kind:'TRANSACTION',providerId:target}):null};
}
function csvStatements(decoded,file,config) {
  object(config,'csv');
  if (!['YMD','DMY','MDY'].includes(config.dateFormat)) fail('INVALID_DATE_FORMAT','Select csv.dateFormat as YMD, DMY or MDY');
  if (!['SIGNED','DEBIT_CREDIT'].includes(config.amountMode)) fail('INVALID_AMOUNT_MODE','Select SIGNED or DEBIT_CREDIT amount mode');
  const numberFormat={decimalSeparator:config.decimalSeparator??'.',groupSeparator:config.groupSeparator??''};
  decimal('0',numberFormat);
  const records=readCsvRecords(decoded.text,config.delimiter,decoded.encoding);
  const headerRow=config.headerRow??1;
  if (!Number.isInteger(headerRow)||headerRow<1||headerRow>records.length) fail('INVALID_HEADER_ROW','headerRow must identify an original CSV logical record');
  const headerRecord=records[headerRow-1],headers=headerRecord.cells.map(x=>x.trim());
  if (!headers.length||headers.every(x=>!x)) fail('EMPTY_HEADER','Selected header record is empty');
  const columns=object(config.columns,'csv.columns');
  const fields=['postedDate','valueDate','amount','debit','credit','providerId','payee','memo','reference','checkNumber','type','balance','currency','status','correctsProviderId','correctionAction','accountId','bankId','branchId','accountType'];
  for (const key of Object.keys(columns)) if (!fields.includes(key)) fail('UNKNOWN_COLUMN_MAPPING','Unknown bank statement field',{field:key});
  const required=new Set(['postedDate',...(config.amountMode==='SIGNED'?['amount']:['debit','credit'])]);
  const indexes=Object.fromEntries(fields.map(field=>[field,columnIndex(columns[field],headers,field,required.has(field))]));
  const used=new Map();
  for (const [field,index] of Object.entries(indexes)) if (index!==null) {
    if (used.has(index)) fail('REUSED_COLUMN','One source column cannot represent two different mapped fields',{column:index+1,fields:[used.get(index),field]});
    used.set(index,field);
  }
  const sourceIssues=[],groups=new Map(),skipped=[],balanceRows=new Map();
  let transactionCount=0;
  const statusValues=config.statusValues||{};
  if (indexes.status!==null && (!Array.isArray(statusValues.posted)||!Array.isArray(statusValues.pending))) fail('STATUS_MAPPING_REQUIRED','For a status column, provide explicit statusValues.posted and statusValues.pending arrays');
  const postedStatuses=new Set((statusValues.posted||[]).map(x=>strictString(x,'posted status',80)));
  const pendingStatuses=new Set((statusValues.pending||[]).map(x=>strictString(x,'pending status',80)));
  if ([...postedStatuses].some(x=>pendingStatuses.has(x))) fail('AMBIGUOUS_STATUS_MAPPING','A bank status cannot mean both posted and pending');
  const skipRecords=new Map();
  for (const item of config.skipRecords||[]) {
    object(item,'skipRecords entry');
    if (!Number.isInteger(item.recordNumber)||item.recordNumber<=headerRow||item.recordNumber>records.length||skipRecords.has(item.recordNumber)) fail('INVALID_SKIPPED_RECORD','Select a distinct existing data record to exclude');
    const reason=strictString(item.reason,'skip reason',1000);
    if (!reason) fail('SKIP_REASON_REQUIRED','Record exclusion requires a reason');
    skipRecords.set(item.recordNumber,reason);
  }
  for (const item of config.balanceRecords||[]) {
    object(item,'balanceRecords entry');
    if (!Number.isInteger(item.recordNumber)||item.recordNumber<1||item.recordNumber>records.length||item.recordNumber===headerRow||balanceRows.has(item.recordNumber)||skipRecords.has(item.recordNumber)) fail('INVALID_BALANCE_RECORD','Balance records must select distinct original non-header records');
    if (!['OPENING','CLOSING','LEDGER','AVAILABLE'].includes(item.kind)) fail('INVALID_BALANCE_KIND','Select OPENING, CLOSING, LEDGER or AVAILABLE');
    balanceRows.set(item.recordNumber,item);
  }
  function groupFor(account,issues,source) {
    const key=jsonHash({identity:account.identityBasis,currency:account.currency});
    if (!groups.has(key) && groups.size>=1000) fail('STATEMENT_LIMIT','CSV contains more than 1000 account/currency groups');
    if (!groups.has(key)) groups.set(key,{
      id:jsonHash({file:file.sha256,csvAccount:key}),kind:'CSV_TRANSACTIONS',account,
      period:{kind:'ROW_DATE_RANGE',from:null,until:null,rawFrom:'',rawUntil:'',fromDateTime:null,untilDateTime:null,untilExclusive:false},
      balances:{ledger:null,available:null,closing:[],sourceBalances:[]},
      rows:[],pendingRows:[],excludedRows:[],source:{pointer:'/csv/accounts/'+groups.size,pointerSyntax:'CSV_ACCOUNT_GROUP',recordNumbers:[],header:headerRecord.source},issues:[],summary:null
    });
    const group=groups.get(key);
    for (const entry of issues) if (!group.issues.some(x=>x.code===entry.code&&x.message===entry.message)) group.issues.push(entry);
    if (source.recordNumber) group.source.recordNumbers.push(source.recordNumber);
    return group;
  }
  for (const record of records) {
    if (record.recordNumber===headerRow) continue;
    if (balanceRows.has(record.recordNumber)) {
      const spec=balanceRows.get(record.recordNumber),issues=[],source=record.source;
      const account=csvAccount(config,record,indexes,issues,source);
      const group=groupFor(account,issues,source);
      const amountIndex=columnIndex(spec.amountColumn,headers,'balance amount',true);
      const dateIndex=columnIndex(spec.dateColumn,headers,'balance date');
      const amountRaw=textValue(record.cells[amountIndex]);
      const amount=attempt(issues,source,()=>decimal(amountRaw,numberFormat));
      const asOf=dateIndex===null?null:attempt(issues,source,()=>csvDate(textValue(record.cells[dateIndex]),config.dateFormat));
      const balance={kind:spec.kind,amount,amountRaw,currency:account.currency,asOf,source:{...source,amountColumn:amountIndex+1,dateColumn:dateIndex===null?null:dateIndex+1},original:{cells:record.cells},issues};
      group.balances.sourceBalances.push(balance);
      if (issues.length) group.issues.push(...issues);
      continue;
    }
    if (record.recordNumber<headerRow) continue;
    if (record.cells.every(x=>!x.trim())) {skipped.push({reason:'EMPTY_RECORD',source:record.source,original:{cells:record.cells}});continue;}
    if (skipRecords.has(record.recordNumber)) {skipped.push({reason:skipRecords.get(record.recordNumber),operatorSelected:true,source:record.source,original:{cells:record.cells}});continue;}
    if (++transactionCount>MAX_ROWS) fail('ROW_LIMIT','CSV exceeds 100000 transaction records');
    const issues=[],source=record.source,account=csvAccount(config,record,indexes,issues,source);
    const group=groupFor(account,issues,source);
    if (record.cells.length!==headers.length) issue(issues,'CSV_COLUMN_COUNT','Data record has a different field count from the selected header',source,'ERROR',{expected:headers.length,actual:record.cells.length});
    const get=name=>indexes[name]===null?'':textValue(record.cells[indexes[name]]).trim();
    const correction=mappedCorrection(get,issues,source,account);
    const postedAtRaw=get('postedDate'),postedAt=attempt(issues,source,()=>csvDate(postedAtRaw,config.dateFormat));
    let amount=null,amountRaw='';
    if (config.amountMode==='SIGNED') {
      amountRaw=get('amount');
      amount=attempt(issues,source,()=>decimal(amountRaw,numberFormat));
    } else {
      const debitRaw=get('debit'),creditRaw=get('credit');
      const debit=debitRaw?attempt(issues,source,()=>decimal(debitRaw,{...numberFormat,allowNegative:false})):'0';
      const credit=creditRaw?attempt(issues,source,()=>decimal(creditRaw,{...numberFormat,allowNegative:false})):'0';
      amountRaw=JSON.stringify({debit:debitRaw,credit:creditRaw});
      if (!debitRaw&&!creditRaw) issue(issues,'AMOUNT_MISSING','Both debit and credit cells are empty',source);
      else if (debit!==null&&credit!==null) {
        if (debit!=='0'&&credit!=='0') issue(issues,'BOTH_DEBIT_AND_CREDIT','A single bank transaction has nonzero debit and credit cells',source);
        else amount=credit!=='0'?credit:debit!=='0'?'-'+debit:'0';
      }
    }
    let status='POSTED';
    const statusRaw=get('status');
    if (indexes.status!==null) {
      if (postedStatuses.has(statusRaw)) status='POSTED';
      else if (pendingStatuses.has(statusRaw)) status='PENDING';
      else {status='UNMAPPED';issue(issues,'UNMAPPED_BANK_STATUS','Source status has no explicit posted/pending mapping',source,'ERROR',{status:statusRaw});}
    }
    const providerId=get('providerId')||null;
    if (providerId&&providerId.length>255) issue(issues,'PROVIDER_ID_LENGTH','Provider transaction ID exceeds 255 characters',source);
    if (!providerId&&status==='POSTED') issue(issues,'PROVIDER_ID_MISSING','Keep this original row distinct; matching similar rows in overlapping CSV files requires review',source,'WARNING');
    const runningRaw=get('balance');
    const runningBalance=runningRaw?{kind:'RUNNING',amount:attempt(issues,source,()=>decimal(runningRaw,numberFormat)),amountRaw:runningRaw,currency:account.currency,asOf:postedAt,source:{...source,column:indexes.balance+1}}:null;
    const row={
      id:jsonHash({file:file.sha256,pointer:source.pointer}),
      providerId,providerKey:account.identitySha256&&providerId?jsonHash({account:account.identitySha256,kind:'TRANSACTION',providerId}):null,
      status,statusRaw,postedDate:postedAt?.date||null,postedAtRaw,postedAt,
      amount,amountRaw,currency:account.currency,currencyConversion:null,
      type:get('type'),payee:get('payee'),extendedName:'',memo:get('memo'),reference:get('reference'),checkNumber:get('checkNumber'),serverTransactionId:'',
      userDate:null,availableDate:get('valueDate')?attempt(issues,source,()=>csvDate(get('valueDate'),config.dateFormat)):null,expiresAt:null,
      correction,runningBalance,source,original:{cells:record.cells},issues
    };
    row.candidateFingerprint=candidateFingerprint(account,row);
    row.eligible=status==='POSTED'&&!issues.some(x=>x.severity==='ERROR')&&Boolean(row.postedDate&&row.amount!==null&&row.currency);
    if (status==='PENDING') group.pendingRows.push(row); else group.rows.push(row);
  }
  if (!groups.size) {
    const issues=[],source=headerRecord.source,account=csvAccount(config,null,Object.fromEntries(fields.map(x=>[x,null])),issues,source);
    groupFor(account,issues,source);
  }
  const statements=[...groups.values()];
  for (const statement of statements) {
    const dates=statement.rows.map(x=>x.postedDate).filter(Boolean).sort();
    statement.period.from=dates[0]||null;statement.period.until=dates.at(-1)||null;
    statement.excludedRows=skipped;
    const balances=statement.balances.sourceBalances;
    for (const kind of ['LEDGER','AVAILABLE']) {
      const matches=balances.filter(x=>x.kind===kind);
      if (matches.length===1) statement.balances[kind.toLowerCase()]=matches[0];
      if (matches.length>1) issue(statement.issues,'MULTIPLE_BALANCE_CANDIDATES','Select which original '+kind.toLowerCase()+' balance belongs to the reconciliation',null,'WARNING');
    }
    const opening=balances.filter(x=>x.kind==='OPENING'),closing=balances.filter(x=>x.kind==='CLOSING');
    if (opening.length===1&&closing.length===1) statement.balances.closing.push({
      id:jsonHash({file:file.sha256,opening:opening[0].source.pointer,closing:closing[0].source.pointer}),kind:'CSV_MAPPED_BALANCES',providerId:null,providerKey:null,currency:statement.account.currency,currencyConversion:null,
      from:opening[0].asOf?.date||null,until:closing[0].asOf?.date||null,opening:opening[0],closing:closing[0],dates:{},totals:{},
      source:{pointer:'/csv/balance-pairs/'+statement.id,pointerSyntax:'CSV_BALANCE_PAIR',opening:opening[0].source,closing:closing[0].source},original:{},issues:[...opening[0].issues,...closing[0].issues],
      eligible:![...opening[0].issues,...closing[0].issues].some(x=>x.severity==='ERROR')
    });
    else if (opening.length>1||closing.length>1) issue(statement.issues,'MULTIPLE_CLOSING_CANDIDATES','Original CSV has multiple mapped opening or closing records; select the intended pair explicitly',null,'WARNING');
  }
  markDuplicates(statements);
  return {statements,issues:sourceIssues,csv:{delimiter:config.delimiter,headerRow,headers,columns:{...columns},resolvedColumns:Object.fromEntries(Object.entries(indexes).map(([key,index])=>[key,index===null?null:index+1])),dateFormat:config.dateFormat,numberFormat,amountMode:config.amountMode,statusValues:{posted:[...postedStatuses],pending:[...pendingStatuses]},preamble:records.filter(x=>x.recordNumber<headerRow&&!balanceRows.has(x.recordNumber)).map(x=>({source:x.source,cells:x.cells})),header:headerRecord.source,excludedRecords:skipped,recordCount:records.length}};
}
export function readBankStatementSource(value) {
  object(value,'statement source input');
  const format=String(value.format||'').toUpperCase();
  if (!['OFX','QFX','CSV','CAMT053'].includes(format)) fail('INVALID_FORMAT','Choose original OFX, QFX, CAMT053 or explicitly mapped CSV');
  const input=readFile(value.file);
  const decoded=decodeText(input.bytes,format,value.textEncoding,input.transport);
  const parsed=format==='CSV'?csvStatements(decoded,input.file,value.csv):format==='CAMT053'?readCamt053Statements(decoded,input.file,value,{fail,object,issue,attempt,strictString,decimal,currency,calendarDate,addDecimals,makeLocator,entities,finishAccount,candidateFingerprint,statementSummary,markDuplicates,jsonHash}):nativeStatements(decoded,input.file,value.accountNamespace);
  return {
    schema:BANK_STATEMENT_SOURCE_SCHEMA,format,
    file:{...input.file,type:format==='CSV'?'text/csv':format==='CAMT053'?'application/xml':format==='QFX'?'application/vnd.intu.qfx':'application/x-ofx',textEncoding:decoded.encoding},
    bytes:input.bytes,
    interpretation:{
      textEncoding:decoded.encoding,declaredEncoding:decoded.declaration,byteOrderMark:decoded.bom,
      amountBasis:'SIGNED_CUSTOMER_ACCOUNT',dateBasis:'SOURCE_CALENDAR',
      nativeIdScope:'FINANCIAL_INSTITUTION_AND_ACCOUNT',sourceOffsets:'ORIGINAL_BYTES_AND_DECODED_UTF16_CHARACTERS',
      automaticCurrencyConversion:false,automaticRowDeduplication:false,
      closingBalancesInferred:false,sourceFormat:format
    },
    ...parsed
  };
}
