// SPDX-License-Identifier: MIT
// CAMT053 adaptation for the maintained bank source reader.
// Source lineage: smb-showcase-inventory/apps/camt053_intake/engine.py,
// 80e7cb59f0e936c6df89b34a113ec03e2cc0a0ea (Z-Copperfin, Z-Cairn-6F42,
// ZZ-PARALLAX-73 and the maintained intake contributors). The original Python
// product retains its ownership. This Node adapter uses the existing merchant
// decimal, account, source-position and duplicate helpers; it creates no cash.
export const CAMT053_SOURCE_SCHEMA = 'stellar-forge.camt053-source.v1';
const VERSIONS = ['camt.053.001.02', 'camt.053.001.08'];
const NS_PREFIX = 'urn:iso:std:iso:20022:tech:xsd:';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const LIMITS = Object.freeze({ bytes: 33554432, nodes: 1500000, depth: 64, text: 65536, statements: 1000, entries: 100000 });
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/** Internal adapter. Shared helpers are supplied by source.mjs, its public owner. */
export function readCamt053Statements(decoded, file, input, shared) {
  const { fail, object, issue, attempt, strictString, decimal, currency, calendarDate,
    addDecimals, makeLocator, entities, finishAccount, candidateFingerprint,
    statementSummary, markDuplicates, jsonHash } = shared;
  const config = input.camt === undefined ? {} : object(input.camt, 'camt');
  const allowed = new Set(['messageVersion', 'namespaceMode', 'referencePolicy', 'detailPolicy', 'currencyScales']);
  for (const key of Object.keys(config)) if (!allowed.has(key)) fail('CAMT_PROFILE_FIELD', 'Unknown CAMT source interpretation option', { field: key });
  if (config.messageVersion !== undefined && !VERSIONS.includes(config.messageVersion)) fail('CAMT_MESSAGE_VERSION', 'Select camt.053.001.02 or camt.053.001.08');
  const namespaceMode = config.namespaceMode ?? 'DECLARED';
  if (!['DECLARED', 'UNQUALIFIED'].includes(namespaceMode)) fail('CAMT_NAMESPACE_MODE', 'Select DECLARED or UNQUALIFIED original XML elements');
  if (namespaceMode === 'UNQUALIFIED' && !config.messageVersion) fail('CAMT_UNQUALIFIED_VERSION', 'Choose the documented message version for this unqualified original source');
  const referencePolicy = config.referencePolicy ?? 'ACCOUNT_SERVICER_REFERENCE';
  if (!['ACCOUNT_SERVICER_REFERENCE', 'SOURCE_ENTRY'].includes(referencePolicy)) fail('CAMT_REFERENCE_POLICY', 'Select ACCOUNT_SERVICER_REFERENCE or separate SOURCE_ENTRY identity');
  const detailPolicy = config.detailPolicy ?? 'PRESERVE_ONLY';
  if (!['PRESERVE_ONLY', 'ENTRY_CURRENCY_TX_AMT'].includes(detailPolicy)) fail('CAMT_DETAIL_POLICY', 'Select PRESERVE_ONLY or ENTRY_CURRENCY_TX_AMT');
  let scales = null;
  if (config.currencyScales !== undefined) {
    const supplied = object(config.currencyScales, 'camt.currencyScales');
    if (!Object.keys(supplied).length || Object.keys(supplied).length > 30) fail('CAMT_CURRENCY_SCALES', 'A selected precision profile must contain one to thirty currencies');
    scales = Object.create(null);
    for (const code of Object.keys(supplied).sort()) {
      const scale = supplied[code];
      if (!/^[A-Z]{3}$/.test(code) || !Number.isInteger(scale) || scale < 0 || scale > 6) fail('CAMT_CURRENCY_SCALE', 'Precision profile codes and scales must be explicit', { currency: code });
      scales[code] = scale;
    }
  }
  if (file.bytes > LIMITS.bytes) fail('CAMT_FILE_LIMIT', 'CAMT source exceeds the bank statement file limit', LIMITS);
  const { text, encoding } = decoded;
  const issues = [];
  const namespaceDeclarations = [];
  const xml = parseXml();
  const namespace = xml.root.namespace;
  const messageVersion = namespaceMode === 'UNQUALIFIED' ? config.messageVersion : VERSIONS.find(version => namespace === NS_PREFIX + version);
  if (!messageVersion) fail('CAMT_NAMESPACE', 'The original document namespace must be camt.053.001.02 or camt.053.001.08', { namespace });
  if (config.messageVersion && config.messageVersion !== messageVersion) fail('CAMT_VERSION_CONFLICT', 'Selected CAMT version conflicts with the original namespace', { selected: config.messageVersion, original: messageVersion });
  const legacy = messageVersion === 'camt.053.001.02';
  const profile = { messageVersion, versionSelection: config.messageVersion ? 'EXPLICIT' : 'SOURCE_NAMESPACE', detailPolicy, currencyScales: scales,
    ...(namespaceMode === 'UNQUALIFIED' ? { namespaceMode, originalNamespace: namespace } : {}),
    ...(referencePolicy === 'SOURCE_ENTRY' ? { referencePolicy } : {}) };
  if (namespaceMode === 'UNQUALIFIED') issue(issues, 'CAMT_UNQUALIFIED_SOURCE', 'Original unqualified XML is interpreted using the explicitly selected message version; original elements and namespace declarations are retained unchanged', location(xml.root), 'WARNING', { messageVersion });
  if (referencePolicy === 'SOURCE_ENTRY') issue(issues, 'CAMT_SOURCE_ENTRY_IDENTITY', 'Each original entry remains separate; account-servicer references are retained as source information and overlapping files require review', location(xml.root), 'WARNING');
  const projectionCache = new WeakMap();

  function location(node, recordNumber = null) {
    if (!node) return null;
    return {
      pointer: node.pointer, pointerSyntax: 'CAMT_XML_PATH', namespace: node.namespace,
      ...(recordNumber === null ? {} : { recordNumber }),
      lineStart: node.lineStart, lineEnd: node.lineEnd,
      charStart: node.start, charEnd: node.end, byteStart: node.byteStart, byteEnd: node.byteEnd
    };
  }
  function project(node) {
    if (!node) return null;
    if (projectionCache.has(node)) return projectionCache.get(node);
    const value = { name: node.name, qualifiedName: node.qualifiedName, namespace: node.namespace,
      attributes: node.attributes.map(a => ({ name: a.name, qualifiedName: a.qualifiedName, namespace: a.namespace, value: a.value, source: a.source })),
      text: node.children.length ? null : node.value,
      source: location(node), children: [],
      ...(node.opaqueSupplementary ? { interpretation: 'OPAQUE_SUPPLEMENTARY', content: node.content.map(item => ({ ...item })) } : {}) };
    projectionCache.set(node, value);
    value.children = node.children.map(project);
    return value;
  }
  function childNodes(node, name) { return node?.children.filter(n => n.name === name && n.namespace === namespace) || []; }
  function one(node, name, required = false) {
    const values = childNodes(node, name);
    if (values.length > 1) fail('CAMT_DUPLICATE_FIELD', 'A singleton CAMT field is repeated', { pointer: node?.pointer || '/', field: name });
    if (!values.length && required) fail('CAMT_MISSING_FIELD', 'A required CAMT field is missing', { pointer: node?.pointer || '/', field: name });
    return values[0] || null;
  }
  function at(node, path, required = false) {
    for (const name of path.split('/')) {
      if (!node) {
        if (required) fail('CAMT_MISSING_FIELD', 'A required CAMT field is missing', { field: path });
        return null;
      }
      node = one(node, name, required);
    }
    return node;
  }
  function leaf(node, required = false, limit = LIMITS.text) {
    if (!node) {
      if (required) fail('CAMT_MISSING_FIELD', 'A required CAMT value is missing');
      return '';
    }
    if (node.children.length) fail('CAMT_SCALAR_EXPECTED', 'CAMT scalar field contains child elements', { pointer: node.pointer });
    const value = node.value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
    if (value.length > limit || (required && !value)) fail('CAMT_INVALID_VALUE', 'CAMT value is empty or exceeds its supported length', { pointer: node.pointer, limit });
    return value;
  }
  function scalar(node, path, required = false, limit = LIMITS.text) { return leaf(at(node, path, required), required, limit); }
  function get(list, node, path, required = false, limit = LIMITS.text) {
    return attempt(list, location(node), () => scalar(node, path, required, limit)) ?? '';
  }
  function optionalNode(list, node, path) { return attempt(list, location(node), () => at(node, path)); }
  function knownChildren(node, known, list, severity = 'WARNING') {
    const names = new Set(known.split(' '));
    for (const child of node?.children || []) if (!names.has(child.name)) {
      issue(list, 'CAMT_UNINTERPRETED_FIELD', 'Original CAMT field is retained in the source tree', location(child), severity, { field: child.name });
    }
  }
  function choice(node, required = false) {
    if (!node) {
      if (required) fail('CAMT_MISSING_CHOICE', 'A required coded or proprietary value is missing');
      return null;
    }
    const code = one(node, 'Cd'), proprietary = one(node, 'Prtry');
    if ((!code && !proprietary) || (code && proprietary) || node.children.length !== 1) fail('CAMT_INVALID_CHOICE', 'CAMT field requires exactly one code or proprietary value', { pointer: node.pointer });
    const selected = code || proprietary;
    return { kind: code ? 'CODE' : 'PROPRIETARY', value: leaf(selected, true, 140), source: location(selected) };
  }
  function bool(node, required = false) {
    const value = leaf(node, required, 5);
    if (!node) return null;
    if (!['true', 'false', '1', '0'].includes(value)) fail('CAMT_BOOLEAN', 'CAMT boolean must use true, false, 1 or 0', { pointer: node.pointer });
    return value === 'true' || value === '1';
  }
  function codeCurrency(value, node) {
    if (!/^[A-Z]{3}$/.test(value)) fail('CAMT_CURRENCY', 'CAMT currency must be its original three-letter uppercase code', { pointer: node?.pointer });
    return currency(value);
  }
  function count(node, required = false) {
    const value = leaf(node, required, 15);
    if (!node) return null;
    if (!/^[0-9]{1,15}$/.test(value)) fail('CAMT_COUNT', 'CAMT control count must be an unsigned integer', { pointer: node.pointer });
    return BigInt(value).toString();
  }
  function magnitude(node, { expectedCurrency = null, needsCurrency = true, usePrecision = false } = {}) {
    const raw = leaf(node, true, 260);
    if (!/^[0-9]+(?:\.[0-9]+)?$/.test(raw)) fail('CAMT_AMOUNT', 'CAMT amount must be an unsigned exact decimal', { pointer: node.pointer });
    const ccyAttribute = node.attributes.find(a => a.name === 'Ccy' && !a.namespace);
    const code = ccyAttribute ? codeCurrency(ccyAttribute.value.trim(), node) : null;
    if (needsCurrency && !code) fail('CAMT_AMOUNT_CURRENCY', 'CAMT currency amount is missing its Ccy attribute', { pointer: node.pointer });
    if (!needsCurrency && ccyAttribute) fail('CAMT_UNEXPECTED_AMOUNT_CURRENCY', 'This CAMT summary amount inherits the account currency', { pointer: node.pointer });
    if (expectedCurrency && code && code !== expectedCurrency) fail('CAMT_AMOUNT_CURRENCY_MISMATCH', 'CAMT amount currency differs from the account currency', { pointer: node.pointer, accountCurrency: expectedCurrency, currency: code });
    const actualCurrency = code || expectedCurrency;
    if (usePrecision && scales && actualCurrency) {
      if (!own(scales, actualCurrency)) fail('CAMT_UNCONFIGURED_CURRENCY', 'Selected CAMT precision profile does not include the original currency', { currency: actualCurrency, pointer: node.pointer });
      const fraction = raw.split('.')[1] || '';
      if (fraction.length > scales[actualCurrency]) fail('CAMT_PROFILE_PRECISION', 'Original amount is finer than the explicitly selected precision profile', { pointer: node.pointer, currency: actualCurrency, scale: scales[actualCurrency] });
    }
    return { amount: decimal(raw, { allowNegative: false }), amountRaw: raw, currency: actualCurrency,
      source: location(node), currencySource: ccyAttribute?.source || null };
  }
  function direction(value, node) {
    if (!['CRDT', 'DBIT'].includes(value)) fail('CAMT_CREDIT_DEBIT', 'CAMT amount direction must be CRDT or DBIT', { pointer: node?.pointer });
    return value;
  }
  function signed(amount, code) { return code === 'DBIT' && amount !== '0' ? '-' + amount : amount; }
  function parseDate(node, kind = 'datetime') {
    const raw = leaf(node, true, 100);
    const m = raw.match(kind === 'date'
      ? /^(\d{4})-(\d{2})-(\d{2})(Z|[+-]\d{2}:\d{2})?$/
      : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})?$/);
    if (!m) fail('CAMT_DATE', 'CAMT date or timestamp does not use its ISO calendar form', { pointer: node.pointer });
    const date = calendarDate(m[1], m[2], m[3]);
    const zone = kind === 'date' ? m[4] : m[8];
    if (kind !== 'date' && (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59)) fail('CAMT_TIME', 'CAMT timestamp time is out of range', { pointer: node.pointer });
    let offsetMinutes = null;
    if (zone === 'Z') offsetMinutes = 0;
    else if (zone) {
      const hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(4, 6));
      if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) fail('CAMT_TIMEZONE', 'CAMT UTC offset is outside its ISO range', { pointer: node.pointer });
      offsetMinutes = (zone[0] === '-' ? -1 : 1) * (hours * 60 + minutes);
    }
    // A missing source offset stays missing. It is never interpreted as UTC.
    const offsetHours = offsetMinutes === null || offsetMinutes % 3 !== 0 ? null : decimal((offsetMinutes < 0 ? '-' : '') + String(Math.floor(Math.abs(offsetMinutes) / 60)) + '.' + String((Math.abs(offsetMinutes) % 60) * 100 / 60).padStart(2, '0'));
    return { raw, date, time: kind === 'date' ? null : m[4] + ':' + m[5] + ':' + m[6] + (m[7] ? '.' + m[7] : ''),
      precision: kind === 'date' ? 'DATE' : m[7] ? 'FRACTION' : 'SECOND',
      offsetHours, offsetMinutes, zone: zone || null, offsetExplicit: Boolean(zone), calendarBasis: 'SOURCE_CALENDAR' };
  }
  function dateChoice(node) {
    if (!node) return null;
    const day = one(node, 'Dt'), time = one(node, 'DtTm');
    if ((!day && !time) || (day && time) || node.children.length !== 1) fail('CAMT_DATE_CHOICE', 'CAMT date choice requires one Dt or DtTm value', { pointer: node.pointer });
    return parseDate(day || time, day ? 'date' : 'datetime');
  }
  function dateField(list, node, path, required = false, choiceField = true) {
    return attempt(list, location(node), () => {
      const selected = at(node, path, required);
      return selected ? choiceField ? dateChoice(selected) : parseDate(selected) : null;
    });
  }
  function temporalOrder(a, b) {
    if (!a || !b) return null;
    if (!a.time && !b.time) return a.date.localeCompare(b.date);
    if (!a.time || !b.time) return a.date === b.date ? null : a.date.localeCompare(b.date);
    if (a.offsetExplicit !== b.offsetExplicit) return null;
    const comparable = value => {
      const [clock, fraction = ''] = value.time.split('.');
      const [hours, minutes, seconds] = clock.split(':').map(Number);
      const midnight = BigInt(Date.parse(value.date + 'T00:00:00Z') / 1000);
      return (midnight + BigInt(hours * 3600 + minutes * 60 + seconds - (value.offsetMinutes || 0) * 60)) * 1000000000n + BigInt(fraction.padEnd(9, '0'));
    };
    const da = comparable(a), db = comparable(b);
    return da < db ? -1 : da > db ? 1 : 0;
  }
  function pagination(node) {
    if (!node) return null;
    const pageRaw = leaf(one(node, 'PgNb', true), true, 5);
    if (!/^[0-9]{1,5}$/.test(pageRaw) || BigInt(pageRaw) < 1n) fail('CAMT_PAGE_NUMBER', 'CAMT page number must be one to five digits and positive', { pointer: node.pointer });
    const lastNode = one(node, 'LastPgInd', true);
    return { page: Number(pageRaw), pageRaw, last: bool(lastNode, true), source: location(node) };
  }

  function parseXml() {
    const locate = makeLocator(text, encoding);
    const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(?:[^<>"']|"[^"]*"|'[^']*')*>/g;
    const stack = [];
    let root = null, last = 0, count = 0, declaration = null, token;
    function xmlCharacters(value) {
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(value)) fail('CAMT_XML_CHARACTER', 'XML contains a disallowed character');
      return value;
    }
    function decode(value, attribute = false) {
      const normal = attribute ? value.replace(/\r\n?|\n|\t/g, ' ') : value.replace(/\r\n?/g, '\n');
      return xmlCharacters(entities(normal, false));
    }
    function addText(piece, cdata = false) {
      if (piece.includes(']]>') && !cdata) fail('CAMT_XML_TEXT', 'XML text contains an unescaped CDATA closing delimiter');
      const value = cdata ? xmlCharacters(piece.replace(/\r\n?/g, '\n')) : decode(piece);
      const top = stack.at(-1);
      if (!top) {
        const outside = last === 0 ? value.replace(/^\ufeff/, '') : value;
        if (/[^ \t\r\n]/.test(outside)) fail('CAMT_XML_OUTSIDE_ROOT', 'Text occurs outside the CAMT document');
        return;
      }
      if (top.opaqueSupplementary) {
        if (value) top.content.push({ kind: 'TEXT', text: value });
        top.value += value;
        if (top.value.length > LIMITS.text) fail('CAMT_XML_TEXT_LIMIT', 'Supplementary XML text exceeds the supported text length', { pointer: top.pointer, limit: LIMITS.text });
      } else if (top.children.length) {
        if (/[^ \t\r\n]/.test(value)) fail('CAMT_XML_MIXED_CONTENT', 'CAMT aggregate contains mixed text and child elements', { pointer: top.pointer });
      } else {
        top.value += value;
        if (top.value.length > LIMITS.text) fail('CAMT_XML_TEXT_LIMIT', 'CAMT scalar exceeds the supported text length', { pointer: top.pointer, limit: LIMITS.text });
      }
    }
    function finish(node, end) { node.end = end.char; node.byteEnd = end.byte; node.lineEnd = end.line; }
    while ((token = tokens.exec(text))) {
      const start = locate(token.index), markup = token[0];
      const before = text.slice(last, token.index);
      if (before.includes('<')) fail('CAMT_XML_MARKUP', 'Malformed XML markup occurs between complete tags');
      addText(before);
      if (markup.startsWith('<!--')) {
        if (markup.slice(4, -3).includes('--') || markup.slice(4, -3).endsWith('-')) fail('CAMT_XML_COMMENT', 'Malformed XML comment');
        locate(tokens.lastIndex); last = tokens.lastIndex; continue;
      }
      if (markup.startsWith('<![CDATA[')) {
        if (!stack.length) fail('CAMT_XML_CDATA', 'CDATA occurs outside the CAMT document');
        addText(markup.slice(9, -3), true); locate(tokens.lastIndex); last = tokens.lastIndex; continue;
      }
      if (markup.startsWith('<?')) {
        const atBeginning = token.index === 0 || (token.index === 1 && text[0] === '\ufeff');
        if (!atBeginning || declaration || root || !/^<\?xml\s+version\s*=\s*(['"])1\.0\1(?:\s+encoding\s*=\s*(['"])[A-Za-z][A-Za-z0-9._-]*\2)?(?:\s+standalone\s*=\s*(['"])(?:yes|no)\3)?\s*\?>$/.test(markup)) {
          fail('CAMT_XML_PROCESSING', 'Only an XML 1.0 declaration at the beginning is supported');
        }
        declaration = markup; locate(tokens.lastIndex); last = tokens.lastIndex; continue;
      }
      const closing = markup.match(/^<\/([A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?)\s*>$/);
      if (closing) {
        const top = stack.pop();
        if (!top || top.qualifiedName !== closing[1]) fail('CAMT_XML_CLOSE', 'XML closing tag does not match its original open tag', { tag: closing[1], open: top?.qualifiedName || null });
        finish(top, locate(tokens.lastIndex));
      } else {
        const opened = markup.match(/^<([A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?)([\s\S]*?)>$/);
        if (!opened || markup.startsWith('<!')) fail('CAMT_XML_DECLARATION', 'CAMT source must contain inline XML without DTDs or entity declarations');
        const qualifiedName = opened[1], selfClosing = /\/$/.test(opened[2]);
        let rest = selfClosing ? opened[2].slice(0, -1) : opened[2];
        let offset = token.index + 1 + qualifiedName.length;
        const attributes = [], rawNames = new Set();
        while (/[^ \t\r\n]/.test(rest)) {
          const match = rest.match(/^([ \t\r\n]+)([A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?)(\s*=\s*)("[^"]*"|'[^']*')/);
          if (!match) fail('CAMT_XML_ATTRIBUTE', 'XML contains a malformed attribute', { tag: qualifiedName });
          const attributeName = match[2];
          if (rawNames.has(attributeName)) fail('CAMT_XML_DUPLICATE_ATTRIBUTE', 'XML repeats an attribute', { tag: qualifiedName, attribute: attributeName });
          rawNames.add(attributeName);
          const rawValue = match[4].slice(1, -1);
          if (rawValue.includes('<')) fail('CAMT_XML_ATTRIBUTE', 'An XML attribute contains an unescaped less-than sign', { tag: qualifiedName, attribute: attributeName });
          const aStart = locate(offset + match[1].length);
          const vStart = locate(offset + match[1].length + attributeName.length + match[3].length + 1);
          const vEnd = locate(offset + match[0].length - 1);
          const aEnd = locate(offset + match[0].length);
          attributes.push({ qualifiedName: attributeName, value: decode(rawValue, true), aStart, aEnd, vStart, vEnd });
          offset += match[0].length; rest = rest.slice(match[0].length);
        }
        if (++count > LIMITS.nodes || stack.length >= LIMITS.depth) fail('CAMT_XML_STRUCTURE_LIMIT', 'CAMT XML exceeds the supported element or depth limit', LIMITS);
        const parent = stack.at(-1);
        if (!parent && root) fail('CAMT_XML_MULTIPLE_ROOTS', 'The original file contains more than one document root');
        const ns = Object.assign(Object.create(null), parent?.ns || { xml: XML_NS });
        for (const attr of attributes) {
          if (attr.qualifiedName === 'xmlns') {
            if ([XMLNS_NS, XML_NS].includes(attr.value)) fail('CAMT_XML_NAMESPACE_DECLARATION', 'Reserved XML namespace cannot become the default');
            ns[''] = attr.value;
          } else if (attr.qualifiedName.startsWith('xmlns:')) {
            const prefix = attr.qualifiedName.slice(6);
            if (!attr.value || prefix === 'xmlns' || attr.value === XMLNS_NS || (prefix === 'xml') !== (attr.value === XML_NS)) fail('CAMT_XML_NAMESPACE_DECLARATION', 'XML contains an invalid reserved namespace binding');
            ns[prefix] = attr.value;
          }
        }
        const [first, second] = qualifiedName.split(':');
        const prefix = second === undefined ? '' : first, name = second === undefined ? first : second;
        if (prefix && !own(ns, prefix)) fail('CAMT_XML_UNBOUND_PREFIX', 'XML element prefix has no namespace declaration', { prefix });
        const uri = ns[prefix] || '';
        if (!parent && name !== 'Document') fail('CAMT_XML_ROOT', 'CAMT source requires its Document root');
        if (!parent) {
          if (namespaceMode === 'UNQUALIFIED') {
            if (uri) fail('CAMT_NAMESPACE_MODE_CONFLICT', 'This original has a namespace; select its original declared namespace', { namespace: uri });
            const declaredVersions = [...new Set(Object.values(ns).filter(value => VERSIONS.some(version => value === NS_PREFIX + version)))];
            if (declaredVersions.some(value => value !== NS_PREFIX + config.messageVersion)) fail('CAMT_VERSION_CONFLICT', 'Selected version conflicts with a version declared on the original document', { selected: config.messageVersion, declaredNamespaces: declaredVersions });
          } else if (!VERSIONS.some(v => uri === NS_PREFIX + v)) fail('CAMT_NAMESPACE', 'The original document namespace must be camt.053.001.02 or camt.053.001.08; an unqualified original requires explicit UNQUALIFIED interpretation and version', { namespace: uri });
        }
        const opaqueSupplementary = Boolean(parent?.opaqueSupplementary || parent?.supplementaryEnvelope);
        const supplementaryEnvelope = Boolean(parent && !opaqueSupplementary &&
          (root.namespace === NS_PREFIX + 'camt.053.001.08' || (namespaceMode === 'UNQUALIFIED' && config.messageVersion === 'camt.053.001.08')) &&
          uri === root.namespace && name === 'Envlp' &&
          parent.namespace === root.namespace && parent.name === 'SplmtryData');
        if (parent && uri !== root.namespace && !opaqueSupplementary) fail('CAMT_MIXED_NAMESPACE', 'CAMT core source contains an element in a different namespace', { tag: qualifiedName, namespace: uri });
        if (parent && !parent.opaqueSupplementary) {
          if (/[^ \t\r\n]/.test(parent.value)) fail('CAMT_XML_MIXED_CONTENT', 'CAMT aggregate contains mixed text and child elements', { pointer: parent.pointer });
          parent.value = '';
        }
        const key = uri + '\u0000' + name;
        const index = parent ? (parent.counts[key] = (parent.counts[key] || 0) + 1) : 1;
        const pointer = (parent?.pointer || '') + '/' + qualifiedName + '[' + index + ']';
        const node = { name, qualifiedName, namespace: uri, ns, attributes: [], children: [], counts: Object.create(null), value: '',
          opaqueSupplementary, supplementaryEnvelope, content: [],
          start: start.char, byteStart: start.byte, lineStart: start.line, end: null, byteEnd: null, lineEnd: null, pointer };
        const expanded = new Set();
        for (const attr of attributes) {
          const bits = attr.qualifiedName.split(':'), ap = bits.length === 2 ? bits[0] : '', an = bits.at(-1);
          const declarationAttribute = attr.qualifiedName === 'xmlns' || ap === 'xmlns';
          if (ap && !declarationAttribute && !own(ns, ap)) fail('CAMT_XML_UNBOUND_PREFIX', 'XML attribute prefix has no namespace declaration', { prefix: ap });
          const au = declarationAttribute ? XMLNS_NS : ap ? ns[ap] : '';
          const expandedKey = au + '\u0000' + an;
          if (expanded.has(expandedKey)) fail('CAMT_XML_DUPLICATE_ATTRIBUTE', 'Two XML attributes have the same expanded name', { pointer, attribute: attr.qualifiedName });
          expanded.add(expandedKey);
          const source = { pointer: pointer + '/@' + attr.qualifiedName, pointerSyntax: 'CAMT_XML_PATH', namespace: au,
            lineStart: attr.aStart.line, lineEnd: attr.aEnd.line, charStart: attr.aStart.char, charEnd: attr.aEnd.char,
            byteStart: attr.aStart.byte, byteEnd: attr.aEnd.byte,
            valueCharStart: attr.vStart.char, valueCharEnd: attr.vEnd.char, valueByteStart: attr.vStart.byte, valueByteEnd: attr.vEnd.byte };
          node.attributes.push({ name: an, qualifiedName: attr.qualifiedName, namespace: au, value: attr.value, source });
          if (declarationAttribute) namespaceDeclarations.push({ prefix: attr.qualifiedName === 'xmlns' ? '' : an, namespace: attr.value, source });
        }
        if (parent) {
          if (parent.opaqueSupplementary) parent.content.push({ kind: 'ELEMENT', childIndex: parent.children.length });
          parent.children.push(node);
        } else root = node;
        if (selfClosing) finish(node, locate(tokens.lastIndex)); else { stack.push(node); locate(tokens.lastIndex); }
      }
      last = tokens.lastIndex;
    }
    if (text.slice(last).includes('<')) fail('CAMT_XML_INCOMPLETE', 'Original XML ends in incomplete markup');
    addText(text.slice(last));
    if (stack.length) fail('CAMT_XML_INCOMPLETE', 'Original XML ends before all elements close', { open: stack.map(n => n.qualifiedName) });
    if (!root) fail('CAMT_XML_ROOT', 'No complete CAMT document was found');
    return { root, nodeCount: count, declaration };
  }


  function advisory(list, node, fn) {
    const found = [];
    const result = attempt(found, location(node), fn);
    for (const item of found) list.push({ ...item, severity: 'WARNING' });
    return result;
  }
  function readAccount(stmt, list) {
    const node = attempt(list, location(stmt), () => one(stmt, 'Acct', true));
    const idNode = optionalNode(list, node, 'Id');
    let identifier = { kind: null, value: '', scheme: null, issuer: '', source: location(idNode) };
    if (!idNode) issue(list, 'CAMT_ACCOUNT_IDENTIFIER_MISSING', 'Statement does not contain its original account identifier', location(node || stmt));
    else {
      const value = attempt(list, location(idNode), () => {
        const iban = one(idNode, 'IBAN'), other = one(idNode, 'Othr');
        if ((!iban && !other) || (iban && other) || idNode.children.length !== 1) fail('CAMT_ACCOUNT_IDENTIFIER_CHOICE', 'Account identifier requires exactly one IBAN or Other value', { pointer: idNode.pointer });
        if (iban) return { kind: 'IBAN', value: leaf(iban, true, 34), scheme: null, issuer: '', source: location(iban) };
        return { kind: 'OTHER', value: scalar(other, 'Id', true, 34), scheme: choice(one(other, 'SchmeNm')), issuer: scalar(other, 'Issr', false, 35), source: location(other) };
      });
      if (value) identifier = value;
    }
    const servicerNode = optionalNode(list, node, 'Svcr');
    const fi = optionalNode(list, servicerNode, 'FinInstnId');
    const bicName = legacy ? 'BIC' : 'BICFI';
    const wrongBic = optionalNode(list, fi, legacy ? 'BICFI' : 'BIC');
    if (wrongBic) issue(list, 'CAMT_SERVICER_VERSION_FIELD', 'Account servicer uses the other CAMT version’s BIC field', location(wrongBic));
    const bic = get(list, fi, bicName, false, 11);
    const clearingNode = optionalNode(list, fi, 'ClrSysMmbId');
    const clearing = clearingNode ? {
      system: attempt(list, location(clearingNode), () => choice(one(clearingNode, 'ClrSysId'))),
      memberId: get(list, clearingNode, 'MmbId', true, 35), source: location(clearingNode), original: project(clearingNode)
    } : null;
    const otherNode = optionalNode(list, fi, 'Othr');
    const other = otherNode ? {
      id: get(list, otherNode, 'Id', true, 35),
      scheme: attempt(list, location(otherNode), () => choice(one(otherNode, 'SchmeNm'))),
      issuer: get(list, otherNode, 'Issr', false, 35), source: location(otherNode), original: project(otherNode)
    } : null;
    const branch = optionalNode(list, servicerNode, 'BrnchId');
    const accountCurrencyNode = optionalNode(list, node, 'Ccy');
    const accountCurrency = accountCurrencyNode ? attempt(list, location(accountCurrencyNode), () => codeCurrency(leaf(accountCurrencyNode, true, 3), accountCurrencyNode)) : null;
    if (!accountCurrencyNode) issue(list, 'CAMT_ACCOUNT_CURRENCY_MISSING', 'Account currency is absent; the original amount currencies remain visible', location(node || stmt));
    if (scales && accountCurrency && !own(scales, accountCurrency)) issue(list, 'CAMT_UNCONFIGURED_CURRENCY', 'Selected precision profile does not include this account currency', location(accountCurrencyNode), 'ERROR', { currency: accountCurrency });
    const accountTypeNode = optionalNode(list, node, 'Tp');
    const accountType = attempt(list, location(accountTypeNode || node), () => choice(accountTypeNode));
    const fiName = get(list, fi, 'Nm', false, 140);
    const account = {
      kind: 'BANK', bankId: bic || clearing?.memberId || '', branchId: get(list, branch, 'Id', false, 35),
      accountId: identifier.value, accountType: accountType ? (accountType.kind === 'PROPRIETARY' ? 'PROPRIETARY:' : '') + accountType.value : '',
      accountKey: '', financialInstitution: { id: !bic && !clearing?.memberId ? other?.id || '' : '', name: fiName },
      currency: accountCurrency, namespace: input.accountNamespace ? strictString(input.accountNamespace, 'accountNamespace', 255) : '',
      source: location(node || stmt),
      camt: { identifier, name: get(list, node, 'Nm', false, 140), type: accountType,
        owner: project(optionalNode(list, node, 'Ownr')), proxy: project(optionalNode(list, node, 'Prxy')),
        servicer: { bic, bicField: bicName, clearing, other, lei: get(list, fi, 'LEI', false, 35), name: fiName,
          branch: project(branch), source: location(servicerNode), original: project(servicerNode) } }
    };
    finishAccount(account, list);
    account.identityBasis = { ...account.identityBasis,
      accountIdentifier: { kind: identifier.kind, scheme: identifier.scheme ? { kind: identifier.scheme.kind, value: identifier.scheme.value } : null, issuer: identifier.issuer },
      institutionIdentifier: bic ? { kind: 'BIC' } : clearing?.memberId ? { kind: 'CLEARING_MEMBER', system: clearing.system ? { kind: clearing.system.kind, value: clearing.system.value } : null }
        : other?.id ? { kind: 'OTHER', scheme: other.scheme ? { kind: other.scheme.kind, value: other.scheme.value } : null, issuer: other.issuer } : null
    };
    account.identitySha256 = account.identityBasis.institution && account.accountId ? jsonHash(account.identityBasis) : null;
    return account;
  }
  function references(node) {
    if (!node) return [];
    const values = [];
    function collect(current) {
      if (!current.children.length) {
        values.push({ name: current.name, value: current.value.trim(), source: location(current) });
      } else for (const child of current.children) collect(child);
    }
    for (const child of node.children) collect(child);
    return values;
  }
  function exchange(node, list) {
    if (!node) return null;
    const rateNode = advisory(list, node, () => one(node, 'XchgRate'));
    const rateRaw = rateNode ? rawScalar(rateNode) : '';
    return {
      sourceCurrency: advisory(list, node, () => scalar(node, 'SrcCcy', false, 3)) || '',
      targetCurrency: advisory(list, node, () => scalar(node, 'TrgtCcy', false, 3)) || '',
      unitCurrency: advisory(list, node, () => scalar(node, 'UnitCcy', false, 3)) || '',
      rate: rateRaw ? advisory(list, rateNode, () => decimal(rateRaw, { allowNegative: false })) : null,
      rateRaw, contractId: advisory(list, node, () => scalar(node, 'CtrctId')) || '',
      quotationDate: advisory(list, node, () => scalar(node, 'QtnDt')) || '',
      source: location(node), original: project(node)
    };
  }
  function amountDetails(node, list) {
    if (!node) return [];
    return node.children.map(part => {
      const amountNode = advisory(list, part, () => one(part, 'Amt'));
      const originalAmount = amountNode ? advisory(list, amountNode, () => magnitude(amountNode)) : null;
      const currencyExchange = advisory(list, part, () => one(part, 'CcyXchg'));
      return { kind: part.name,
        amount: originalAmount?.amount ?? null, amountRaw: amountNode ? rawScalar(amountNode) : '', currency: originalAmount?.currency || null,
        currencySource: originalAmount?.currencySource || null,
        type: advisory(list, part, () => scalar(part, 'Tp')) || '',
        exchange: exchange(currencyExchange, list), source: location(part), amountSource: location(amountNode), original: project(part) };
    });
  }
  function charges(owner, list) {
    return childNodes(owner, 'Chrgs').map(node => {
      const totalNode = advisory(list, node, () => one(node, 'TtlChrgsAndTaxAmt'));
      const total = totalNode ? advisory(list, totalNode, () => magnitude(totalNode)) : null;
      const records = childNodes(node, 'Rcrd');
      // Some older charge structures place their record fields directly under Chrgs.
      const directAmount = advisory(list, node, () => one(node, 'Amt'));
      if (directAmount && records.length) issue(list, 'CAMT_CHARGE_RECORD_SHAPE', 'Charge source supplies both a direct amount and nested records; both remain in the original tree', location(node), 'WARNING');
      const chosen = records.length ? records : directAmount ? [node] : [];
      return { total, totalRaw: totalNode ? rawScalar(totalNode) : '',
        records: chosen.map(record => {
          const amountNode = advisory(list, record, () => one(record, 'Amt', true));
          const money = amountNode ? advisory(list, amountNode, () => magnitude(amountNode)) : null;
          const cdNode = advisory(list, record, () => one(record, 'CdtDbtInd'));
          const creditDebit = cdNode ? advisory(list, cdNode, () => direction(leaf(cdNode, true), cdNode)) : null;
          const includedNode = advisory(list, record, () => one(record, 'ChrgInclInd'));
          const typeNode = advisory(list, record, () => one(record, 'Tp'));
          const rateRaw = advisory(list, record, () => scalar(record, 'Rate')) || '';
          return {
            amount: money?.amount ?? null, amountRaw: amountNode ? rawScalar(amountNode) : '', currency: money?.currency || null,
            creditDebit, signedAmount: money && creditDebit ? signed(money.amount, creditDebit) : null,
            included: includedNode ? advisory(list, includedNode, () => bool(includedNode)) : null,
            type: { code: advisory(list, typeNode, () => scalar(typeNode, 'Cd')) || '',
              proprietary: project(advisory(list, typeNode, () => one(typeNode, 'Prtry'))) },
            rate: rateRaw ? advisory(list, record, () => decimal(rateRaw, { allowNegative: false })) : null,
            rateRaw, bearer: advisory(list, record, () => scalar(record, 'Br')) || '',
            agent: project(advisory(list, record, () => one(record, 'Agt'))),
            tax: project(advisory(list, record, () => one(record, 'Tax'))),
            source: location(record), amountSource: location(amountNode), currencySource: money?.currencySource || null,
            creditDebitSource: location(cdNode), includedSource: location(includedNode), original: project(record)
          };
        }),
        source: location(node), original: project(node), entryAmountAdjustment: 'NONE'
      };
    });
  }
  function parties(node, list) {
    if (!node) return [];
    return node.children.map(part => {
      let party = part;
      if (part.name.endsWith('Acct')) {
        const id = advisory(list, part, () => one(part, 'Id'));
        return { role: part.name, name: '', account: project(id), source: location(part), original: project(part) };
      }
      const wrapped = advisory(list, part, () => one(part, 'Pty'));
      const agent = advisory(list, part, () => one(part, 'Agt'));
      if (wrapped && agent) issue(list, 'CAMT_PARTY_CHOICE', 'Related party source supplies both a party and an agent', location(part), 'WARNING');
      if (wrapped) party = wrapped;
      const name = advisory(list, party, () => scalar(party, 'Nm', false, 140)) || '';
      return { role: part.name, name, account: null, source: location(part), original: project(part) };
    });
  }
  function remittance(node, list) {
    if (!node) return { unstructured: [], structured: [], creditorReferences: [], documentNumbers: [], source: null, original: null };
    const unstructured = childNodes(node, 'Ustrd').map(n => ({ value: leaf(n), source: location(n) }));
    const structured = [], creditorReferences = [], documentNumbers = [];
    for (const part of childNodes(node, 'Strd')) {
      const creditor = advisory(list, part, () => one(part, 'CdtrRefInf'));
      const ref = creditor ? advisory(list, creditor, () => one(creditor, 'Ref')) : null;
      if (ref) creditorReferences.push({ name: 'CreditorReference', value: leaf(ref), source: location(ref) });
      for (const document of childNodes(part, 'RfrdDocInf')) {
        const number = advisory(list, document, () => one(document, 'Nb'));
        if (number) documentNumbers.push({ name: 'ReferredDocumentNumber', value: leaf(number), source: location(number) });
      }
      structured.push({ source: location(part), original: project(part) });
    }
    return { unstructured, structured, creditorReferences, documentNumbers, source: location(node), original: project(node) };
  }
  function transactionCode(node, list) {
    if (!node) return null;
    return {
      domain: advisory(list, node, () => scalar(node, 'Domn/Cd')) || '',
      family: advisory(list, node, () => scalar(node, 'Domn/Fmly/Cd')) || '',
      subFamily: advisory(list, node, () => scalar(node, 'Domn/Fmly/SubFmlyCd')) || '',
      proprietary: advisory(list, node, () => scalar(node, 'Prtry/Cd')) || '',
      issuer: advisory(list, node, () => scalar(node, 'Prtry/Issr')) || '',
      source: location(node), original: project(node)
    };
  }
  function uniqueText(values) { const found = [...new Set(values.filter(Boolean))]; return found.length === 1 ? found[0] : ''; }
  function detailsAndBatches(entry, account, entryDirection, entryAmount, rowIssues) {
    const details = [], batches = [];
    for (const [gi, group] of childNodes(entry, 'NtryDtls').entries()) {
      const batch = advisory(rowIssues, group, () => one(group, 'Btch'));
      const batchCdNode = batch ? advisory(rowIssues, batch, () => one(batch, 'CdtDbtInd')) : null;
      const batchDirection = batchCdNode ? advisory(rowIssues, batchCdNode, () => direction(leaf(batchCdNode, true), batchCdNode)) : entryDirection;
      const groupDetails = [];
      for (const [di, node] of childNodes(group, 'TxDtls').entries()) {
        const detailIssues = [];
        const refNode = advisory(detailIssues, node, () => one(node, 'Refs'));
        const detailCdNode = advisory(detailIssues, node, () => one(node, 'CdtDbtInd'));
        let detailDirection = batchDirection;
        let directionBasis = batchCdNode ? 'BATCH' : 'ENTRY';
        if (detailCdNode) {
          if (legacy) issue(detailIssues, 'CAMT_V02_DETAIL_DIRECTION', 'Direct transaction-detail direction is outside the .02 source structure and is not applied', location(detailCdNode), 'WARNING');
          else {
            detailDirection = advisory(detailIssues, detailCdNode, () => direction(leaf(detailCdNode, true), detailCdNode));
            directionBasis = 'DETAIL';
          }
        }
        const amountNode = advisory(detailIssues, node, () => one(node, 'Amt'));
        const directAmount = amountNode ? advisory(detailIssues, amountNode, () => magnitude(amountNode)) : null;
        if (legacy && amountNode) issue(detailIssues, 'CAMT_V02_DIRECT_DETAIL_AMOUNT', 'Direct transaction-detail amount is retained separately from the .02 amount-detail structure', location(amountNode), 'WARNING');
        const amountsNode = advisory(detailIssues, node, () => one(node, 'AmtDtls'));
        const amounts = amountDetails(amountsNode, detailIssues);
        const txAmounts = amounts.filter(item => item.kind === 'TxAmt');
        let selectedSignedAmount = null;
        let tieOutStatus = detailPolicy === 'PRESERVE_ONLY' ? 'PRESERVED' : 'UNAVAILABLE';
        if (detailPolicy === 'ENTRY_CURRENCY_TX_AMT') {
          if (txAmounts.length !== 1 || txAmounts[0].amount === null) {
            issue(detailIssues, 'CAMT_DETAIL_AMOUNT_UNAVAILABLE', 'Selected detail tie-out needs one original AmtDtls/TxAmt/Amt', location(node), 'WARNING');
          } else if (txAmounts[0].currency !== account.currency) {
            issue(detailIssues, 'CAMT_DETAIL_CURRENCY_DIFFERENT', 'Original transaction amount remains in its own currency; detail tie-out cannot convert it', txAmounts[0].source, 'WARNING', { currency: txAmounts[0].currency, accountCurrency: account.currency });
          } else if (detailDirection) {
            selectedSignedAmount = signed(txAmounts[0].amount, detailDirection);
            tieOutStatus = 'AVAILABLE';
          }
        }
        const partyNode = advisory(detailIssues, node, () => one(node, 'RltdPties'));
        const remittanceNode = advisory(detailIssues, node, () => one(node, 'RmtInf'));
        const additional = advisory(detailIssues, node, () => scalar(node, 'AddtlTxInf')) || '';
        const detail = {
          id: jsonHash({ file: file.sha256, pointer: node.pointer }), groupIndex: gi + 1, index: di + 1,
          references: references(refNode), referenceSource: location(refNode),
          directAmount, amounts, creditDebit: detailDirection || null, directionBasis,
          creditDebitSource: location(detailCdNode || batchCdNode || advisory(rowIssues, entry, () => one(entry, 'CdtDbtInd'))),
          selectedSignedAmount, tieOutStatus, parties: parties(partyNode, detailIssues),
          agents: project(advisory(detailIssues, node, () => one(node, 'RltdAgts'))),
          remittance: remittance(remittanceNode, detailIssues),
          charges: charges(node, detailIssues),
          bankTransactionCode: transactionCode(advisory(detailIssues, node, () => one(node, 'BkTxCd')), detailIssues),
          returnInformation: childNodes(node, 'RtrInf').map(n => ({ source: location(n), original: project(n), references: references(n) })),
          relatedDates: project(advisory(detailIssues, node, () => one(node, 'RltdDts'))),
          additionalInformation: additional, source: location(node), original: project(node), issues: detailIssues
        };
        details.push(detail); groupDetails.push(detail);
        rowIssues.push(...detailIssues);
      }
      if (batch) {
        const countNode = advisory(rowIssues, batch, () => one(batch, 'NbOfTxs'));
        const amountNode = advisory(rowIssues, batch, () => one(batch, 'TtlAmt'));
        const countValue = countNode ? advisory(rowIssues, countNode, () => count(countNode)) : null;
        const originalAmount = amountNode ? advisory(rowIssues, amountNode, () => magnitude(amountNode)) : null;
        const complete = groupDetails.length > 0 && groupDetails.every(d => d.selectedSignedAmount !== null);
        const detailTotal = complete ? addDecimals(groupDetails.map(d => d.selectedSignedAmount)) : null;
        const batchSignedAmount = originalAmount && batchDirection && originalAmount.currency === account.currency ? signed(originalAmount.amount, batchDirection) : null;
        const batchRecord = { groupIndex: gi + 1,
          messageId: advisory(rowIssues, batch, () => scalar(batch, 'MsgId')) || '',
          paymentInformationId: advisory(rowIssues, batch, () => scalar(batch, 'PmtInfId')) || '',
          reportedCount: countValue, countRaw: countNode ? rawScalar(countNode) : '',
          amount: originalAmount, creditDebit: batchDirection || null, directionBasis: batchCdNode ? 'BATCH' : 'ENTRY',
          reportedSignedAmount: batchSignedAmount, detailCount: groupDetails.length, detailSignedAmount: detailTotal,
          countMatches: countValue === null ? null : countValue === String(groupDetails.length),
          amountMatches: detailTotal === null || batchSignedAmount === null ? null : detailTotal === batchSignedAmount,
          source: location(batch), groupSource: location(group), original: project(batch)
        };
        if (detailPolicy === 'ENTRY_CURRENCY_TX_AMT' && batchRecord.countMatches === false) issue(rowIssues, 'CAMT_BATCH_DETAIL_COUNT_DIFFERENCE', 'Reported batch count differs from the supplied transaction-detail count', location(batch), 'WARNING', { expected: countValue, actual: String(groupDetails.length) });
        if (detailPolicy === 'ENTRY_CURRENCY_TX_AMT' && batchRecord.amountMatches === false) issue(rowIssues, 'CAMT_BATCH_AMOUNT_DIFFERENCE', 'Selected original detail amounts differ from the reported batch amount', location(batch), 'WARNING', { expected: batchSignedAmount, actual: detailTotal });
        batches.push(batchRecord);
      }
    }
    const complete = detailPolicy === 'ENTRY_CURRENCY_TX_AMT' && details.length > 0 && details.every(d => d.selectedSignedAmount !== null);
    const total = complete ? addDecimals(details.map(d => d.selectedSignedAmount)) : null;
    const match = total === null || entryAmount === null ? null : total === entryAmount;
    if (match === false) issue(rowIssues, 'CAMT_DETAIL_ENTRY_AMOUNT_DIFFERENCE', 'Selected original detail amounts differ from the single booked entry; the entry amount remains unchanged', location(entry), 'WARNING', { expected: entryAmount, actual: total });
    return { details, batches, detailTieOut: { policy: detailPolicy, signedAmount: total, entryAmount, matches: match,
      status: detailPolicy === 'PRESERVE_ONLY' ? 'PRESERVED' : !details.length ? 'NO_DETAILS' : total === null ? 'UNAVAILABLE' : match ? 'MATCH' : 'DIFFERENCE' } };
  }


  function readRow(node, account, recordNumber) {
    const rowIssues = [], source = location(node, recordNumber);
    const amountNode = optionalNode(rowIssues, node, 'Amt');
    if (!amountNode) issue(rowIssues, 'CAMT_ENTRY_AMOUNT_MISSING', 'Entry is missing its original amount', source);
    const money = amountNode ? attempt(rowIssues, location(amountNode), () => magnitude(amountNode, { usePrecision: true })) : null;
    const cdNode = optionalNode(rowIssues, node, 'CdtDbtInd');
    const creditDebit = attempt(rowIssues, location(cdNode || node), () => direction(leaf(cdNode, true), cdNode || node));
    const amount = money && creditDebit ? signed(money.amount, creditDebit) : null;
    if (money?.currency && account.currency && money.currency !== account.currency) issue(rowIssues, 'CAMT_ENTRY_CURRENCY_MISMATCH', 'The original entry amount currency differs from the statement account currency', location(amountNode), 'ERROR', { currency: money.currency, accountCurrency: account.currency });
    const reversalNode = optionalNode(rowIssues, node, 'RvslInd');
    const reversal = reversalNode ? attempt(rowIssues, location(reversalNode), () => bool(reversalNode)) : null;
    const statusNode = optionalNode(rowIssues, node, 'Sts');
    const statusValue = attempt(rowIssues, location(statusNode || node), () => {
      if (!statusNode) fail('CAMT_ENTRY_STATUS_MISSING', 'Entry is missing its original status', { pointer: node.pointer });
      if (legacy) {
        const code = leaf(statusNode, true, 35);
        if (!['BOOK', 'PDNG', 'INFO'].includes(code)) fail('CAMT_V02_ENTRY_STATUS', 'The .02 entry status must be BOOK, PDNG or INFO', { pointer: statusNode.pointer });
        return { code, proprietary: '', source: location(statusNode) };
      }
      const selected = choice(statusNode, true);
      return { code: selected.kind === 'CODE' ? selected.value : '', proprietary: selected.kind === 'PROPRIETARY' ? selected.value : '', source: selected.source };
    });
    const status = statusValue?.code === 'BOOK' ? 'POSTED' : statusValue?.code === 'PDNG' ? 'PENDING' : 'UNMAPPED';
    if (status === 'UNMAPPED') issue(rowIssues, statusValue?.code === 'INFO' ? 'CAMT_INFORMATION_ONLY_ENTRY' : 'CAMT_UNMAPPED_ENTRY_STATUS',
      statusValue?.code === 'INFO' ? 'Informational entry is retained outside booked cash rows' : 'Unmapped or proprietary entry status is retained outside booked cash rows',
      location(statusNode || node), 'WARNING');
    const bookingNode = optionalNode(rowIssues, node, 'BookgDt');
    const valueNode = optionalNode(rowIssues, node, 'ValDt');
    const bookingDate = bookingNode ? attempt(rowIssues, location(bookingNode), () => dateChoice(bookingNode)) : null;
    const valueDate = valueNode ? attempt(rowIssues, location(valueNode), () => dateChoice(valueNode)) : null;
    if (status === 'POSTED' && !bookingDate) issue(rowIssues, 'CAMT_BOOKING_DATE_MISSING', 'Booked entry needs its original booking date before accounting', location(bookingNode || node));
    const entryRefNode = optionalNode(rowIssues, node, 'NtryRef');
    const bankRefNode = optionalNode(rowIssues, node, 'AcctSvcrRef');
    const entryReference = entryRefNode ? attempt(rowIssues, location(entryRefNode), () => leaf(entryRefNode, false, 35)) || '' : '';
    const accountServicerReference = bankRefNode ? attempt(rowIssues, location(bankRefNode), () => leaf(bankRefNode, false, 35)) || '' : '';
    const placeholder = ['NOTPROVIDED', 'NONREF'].includes(accountServicerReference);
    const providerId = accountServicerReference && !placeholder ? accountServicerReference : null;
    if (!providerId && status === 'POSTED') issue(rowIssues, placeholder ? 'CAMT_PROVIDER_REFERENCE_PLACEHOLDER' : 'CAMT_PROVIDER_REFERENCE_MISSING',
      'Keep this original entry distinct; it supplies no usable account-servicer booking identity', location(bankRefNode || node), 'WARNING');
    const codeNode = optionalNode(rowIssues, node, 'BkTxCd');
    if (!codeNode) issue(rowIssues, 'CAMT_BANK_TRANSACTION_CODE_MISSING', 'Entry is missing its original bank transaction code', source);
    const bankTransactionCode = transactionCode(codeNode, rowIssues);
    const nested = detailsAndBatches(node, account, creditDebit, amount, rowIssues);
    const entryCharges = charges(node, rowIssues);
    const entryAmountDetails = amountDetails(optionalNode(rowIssues, node, 'AmtDtls'), rowIssues);
    const addInfo = get(rowIssues, node, 'AddtlNtryInf');
    const creditorRefs = nested.details.flatMap(d => d.remittance.creditorReferences.map(r => r.value));
    const endToEndRefs = nested.details.flatMap(d => d.references.filter(r => r.name === 'EndToEndId' && r.value !== 'NOTPROVIDED').map(r => r.value));
    const creditorReference = uniqueText(creditorRefs);
    const endToEndReference = uniqueText(endToEndRefs);
    const reference = creditorReference || entryReference || endToEndReference || accountServicerReference;
    const referenceBasis = creditorReference ? 'CREDITOR_REFERENCE' : entryReference ? 'ENTRY_REFERENCE' : endToEndReference ? 'END_TO_END_ID' : accountServicerReference ? 'ACCOUNT_SERVICER_REFERENCE' : null;
    const counterpartyRole = reversal ? null : creditDebit === 'CRDT' ? 'Dbtr' : creditDebit === 'DBIT' ? 'Cdtr' : null;
    const payee = counterpartyRole ? uniqueText(nested.details.flatMap(d => d.parties.filter(p => p.role === counterpartyRole).map(p => p.name))) : '';
    const memo = [...new Set([addInfo, ...nested.details.flatMap(d => [d.additionalInformation, ...d.remittance.unstructured.map(r => r.value)])].filter(Boolean))].join('\n');
    const checkNumber = uniqueText(nested.details.flatMap(d => d.references.filter(r => r.name === 'ChqNb').map(r => r.value)));
    const type = bankTransactionCode ? [bankTransactionCode.domain, bankTransactionCode.family, bankTransactionCode.subFamily].filter(Boolean).join('/')
      || (bankTransactionCode.proprietary ? 'PROPRIETARY:' + bankTransactionCode.proprietary : '') : '';
    const row = {
      id: jsonHash({ file: file.sha256, pointer: source.pointer }),
      providerId, providerKey: referencePolicy === 'ACCOUNT_SERVICER_REFERENCE' && account.identitySha256 && providerId ? jsonHash({ account: account.identitySha256, kind: 'TRANSACTION', providerId }) : null,
      status, statusRaw: statusValue?.code || statusValue?.proprietary || rawScalar(statusNode),
      postedDate: bookingDate?.date || null, postedAtRaw: bookingDate?.raw || '', postedAt: bookingDate,
      amount, amountRaw: amountNode ? rawScalar(amountNode) : '', currency: money?.currency || account.currency,
      currencyConversion: null, type, payee, extendedName: '', memo, reference, checkNumber, serverTransactionId: accountServicerReference,
      userDate: null, availableDate: null, expiresAt: null, correction: null, runningBalance: null,
      source, original: project(node), issues: rowIssues,
      camt: {
        entryReference, accountServicerReference, providerIdentityBasis: referencePolicy === 'SOURCE_ENTRY' ? 'SOURCE_ENTRY' : providerId ? 'ACCOUNT_SERVICER_REFERENCE' : placeholder ? 'PLACEHOLDER' : 'MISSING',
        creditDebit, reversal, status: statusValue || { code: '', proprietary: '', source: location(statusNode) },
        bookingDate, valueDate, bankTransactionCode, amountMagnitude: money,
        referenceBasis, counterpartyRole, batches: nested.batches, details: nested.details, detailTieOut: nested.detailTieOut,
        charges: entryCharges, amountDetails: entryAmountDetails,
        returnInformation: [...childNodes(node, 'RtrInf').map(n => ({ source: location(n), original: project(n), references: references(n) })), ...nested.details.flatMap(d => d.returnInformation)],
        availability: childNodes(node, 'Avlbty').map(n => ({ source: location(n), original: project(n) })),
        additionalInformation: addInfo,
        fields: { amount: location(amountNode), currency: money?.currencySource || null, creditDebit: location(cdNode),
          reversal: location(reversalNode), status: location(statusNode), bookingDate: location(bookingNode), valueDate: location(valueNode),
          entryReference: location(entryRefNode), accountServicerReference: location(bankRefNode), bankTransactionCode: location(codeNode) }
      }
    };
    row.candidateFingerprint = candidateFingerprint(account, row);
    row.eligible = status === 'POSTED' && !rowIssues.some(item => item.severity === 'ERROR')
      && Boolean(row.postedDate && row.amount !== null && row.currency && account.currency === row.currency);
    return row;
  }
  function readBalance(node, account) {
    const balanceIssues = [], source = location(node);
    const typeNode = optionalNode(balanceIssues, node, 'Tp');
    const type = attempt(balanceIssues, location(typeNode || node), () => choice(one(typeNode, 'CdOrPrtry', true), true));
    const subType = attempt(balanceIssues, location(typeNode || node), () => choice(one(typeNode, 'SubTp')));
    const amountNode = optionalNode(balanceIssues, node, 'Amt');
    const originalAmount = amountNode ? attempt(balanceIssues, location(amountNode), () => magnitude(amountNode, { usePrecision: true })) : null;
    if (!amountNode) issue(balanceIssues, 'CAMT_BALANCE_AMOUNT_MISSING', 'Balance is missing its original amount', source);
    const cdNode = optionalNode(balanceIssues, node, 'CdtDbtInd');
    const creditDebit = attempt(balanceIssues, location(cdNode || node), () => direction(leaf(cdNode, true), cdNode || node));
    const dateNode = optionalNode(balanceIssues, node, 'Dt');
    const asOf = dateNode ? attempt(balanceIssues, location(dateNode), () => dateChoice(dateNode)) : null;
    if (!dateNode) issue(balanceIssues, 'CAMT_BALANCE_DATE_MISSING', 'Balance is missing its original date', source);
    if (originalAmount?.currency && account.currency && originalAmount.currency !== account.currency) issue(balanceIssues, 'CAMT_BALANCE_CURRENCY_MISMATCH', 'Original balance currency differs from the account currency', location(amountNode), 'ERROR', { currency: originalAmount.currency, accountCurrency: account.currency });
    return {
      kind: type ? (type.kind === 'PROPRIETARY' ? 'PROPRIETARY:' : '') + type.value : 'UNMAPPED',
      amount: originalAmount && creditDebit ? signed(originalAmount.amount, creditDebit) : null,
      amountRaw: amountNode ? rawScalar(amountNode) : '', currency: originalAmount?.currency || account.currency,
      asOf, source, original: project(node), issues: balanceIssues,
      camt: { type, subType, creditDebit, intermediate: subType?.kind === 'CODE' && subType.value === 'INTM',
        creditLines: childNodes(node, 'CdtLine').map(n => ({ source: location(n), original: project(n) })),
        availability: childNodes(node, 'Avlbty').map(n => ({ source: location(n), original: project(n) })),
        fields: { type: location(typeNode), amount: location(amountNode), currency: originalAmount?.currencySource || null, creditDebit: location(cdNode), date: location(dateNode) } }
    };
  }
  function summaryControls(node, allRows, account, list) {
    if (!node) return [];
    const checks = [];
    const credits = allRows.filter(row => row.camt.creditDebit === 'CRDT');
    const debits = allRows.filter(row => row.camt.creditDebit === 'DBIT');
    const complete = rows => rows.every(row => row.amount !== null && row.currency === account.currency);
    const absoluteTotal = rows => complete(rows) ? addDecimals(rows.map(row => row.amount.startsWith('-') ? row.amount.slice(1) : row.amount)) : null;
    const net = complete(allRows) ? addDecimals(allRows.map(row => row.amount)) : null;
    for (const [name, rows] of [['TtlNtries', allRows], ['TtlCdtNtries', credits], ['TtlDbtNtries', debits]]) {
      const block = optionalNode(list, node, name);
      if (!block) continue;
      for (const [field, kind, expected] of [['NbOfNtries', 'COUNT', String(rows.length)], ['Sum', 'ABSOLUTE_AMOUNT', absoluteTotal(rows)]]) {
        const fieldNode = optionalNode(list, block, field);
        if (!fieldNode) continue;
        const reported = advisory(list, fieldNode, () => kind === 'COUNT' ? count(fieldNode) : magnitude(fieldNode, { expectedCurrency: account.currency, needsCurrency: false }).amount);
        const matches = reported === null || expected === null ? null : reported === expected;
        checks.push({ field: name + '/' + field, kind, expected, reported, reportedRaw: rawScalar(fieldNode), matches, source: location(fieldNode) });
        if (matches === false) issue(list, 'CAMT_SUMMARY_CONTROL_DIFFERENCE', 'Supplied transaction summary differs from the original entry-level records', location(fieldNode), 'WARNING', { field: name + '/' + field, expected, reported });
      }
      if (name !== 'TtlNtries') continue;
      const netNode = optionalNode(list, block, legacy ? 'TtlNetNtryAmt' : 'TtlNetNtry');
      const directDirection = optionalNode(list, block, 'CdtDbtInd');
      if (legacy && Boolean(netNode) !== Boolean(directDirection)) {
        issue(list, 'CAMT_V02_SUMMARY_NET_PAIR', 'Original .02 net summary needs both its amount and direction', location(block), 'WARNING');
        checks.push({ field: name + '/TtlNetNtryAmt', kind: 'NET_AMOUNT', expected: net, reported: null, reportedRaw: netNode ? rawScalar(netNode) : '', matches: null, source: location(block) });
      } else if (netNode) {
        const reported = advisory(list, netNode, () => {
          const amountNode = legacy ? netNode : one(netNode, 'Amt', true);
          const directionNode = legacy ? directDirection : one(netNode, 'CdtDbtInd', true);
          const money = magnitude(amountNode, { expectedCurrency: account.currency, needsCurrency: false });
          return signed(money.amount, direction(leaf(directionNode, true), directionNode));
        });
        const matches = net === null || reported === null ? null : net === reported;
        checks.push({ field: name + '/' + (legacy ? 'TtlNetNtryAmt' : 'TtlNetNtry'), kind: 'NET_AMOUNT', expected: net, reported,
          reportedRaw: legacy ? rawScalar(netNode) : get(list, netNode, 'Amt'), matches, source: location(netNode) });
        if (matches === false) issue(list, 'CAMT_SUMMARY_NET_DIFFERENCE', 'Supplied net summary differs from the original entry-level records', location(netNode), 'WARNING', { expected: net, reported });
      }
      const wrongVersionNet = optionalNode(list, block, legacy ? 'TtlNetNtry' : 'TtlNetNtryAmt');
      if (wrongVersionNet || (!legacy && directDirection)) issue(list, 'CAMT_SUMMARY_VERSION_FIELD', 'Summary uses fields belonging to the other CAMT version; the original fields remain visible', location(wrongVersionNet || directDirection), 'WARNING');
    }
    for (const block of childNodes(node, 'TtlNtriesPerBkTxCd')) issue(list, 'CAMT_BANK_CODE_SUMMARY_RETAINED', 'Per-bank-code summary is retained separately from the statement entry controls', location(block), 'WARNING');
    return checks;
  }
  function statementBalances(stmt, account, allRows, period, page, list) {
    const balances = childNodes(stmt, 'Bal').map(node => readBalance(node, account));
    if (!balances.length) issue(list, 'CAMT_BALANCES_MISSING', 'Statement has no original balance records', location(stmt), 'WARNING');
    const openingCandidates = balances.filter(b => b.camt.type?.kind === 'CODE' && b.camt.type.value === 'OPBD');
    const closingCandidates = balances.filter(b => b.camt.type?.kind === 'CODE' && b.camt.type.value === 'CLBD');
    const interimCandidates = balances.filter(b => b.camt.type?.kind === 'CODE' && b.camt.type.value === 'ITBD');
    const availableCandidates = balances.filter(b => b.camt.type?.kind === 'CODE' && b.camt.type.value === 'CLAV');
    const interimAvailable = balances.filter(b => b.camt.type?.kind === 'CODE' && b.camt.type.value === 'ITAV');
    const ledger = closingCandidates.length === 1 ? closingCandidates[0] : !closingCandidates.length && interimCandidates.length === 1 ? interimCandidates[0] : null;
    const available = availableCandidates.length === 1 ? availableCandidates[0] : !availableCandidates.length && interimAvailable.length === 1 ? interimAvailable[0] : null;
    const posted = allRows.filter(row => row.status === 'POSTED');
    const completeAmounts = posted.every(row => row.amount !== null && row.currency === account.currency);
    const bookedNet = completeAmounts ? addDecimals(posted.map(row => row.amount)) : null;
    const opening = openingCandidates.length === 1 ? openingCandidates[0] : null;
    const closing = closingCandidates.length === 1 ? closingCandidates[0] : null;
    const comparable = opening && closing && opening.amount !== null && closing.amount !== null && opening.currency === account.currency && closing.currency === account.currency && bookedNet !== null;
    const expectedClosing = comparable ? addDecimals([opening.amount, bookedNet]) : null;
    const difference = comparable ? addDecimals([closing.amount, expectedClosing === '0' ? '0' : expectedClosing.startsWith('-') ? expectedClosing.slice(1) : '-' + expectedClosing]) : null;
    const balanceCheck = { status: !comparable ? 'NOT_CHECKED' : difference === '0' ? 'MATCH' : 'DIFFERENCE',
      opening: opening?.amount ?? null, bookedNet, expectedClosing, reportedClosing: closing?.amount ?? null,
      difference, scope: 'STATEMENT_PAGE', source: location(stmt) };
    const candidates = [];
    if (!opening || !closing) {
      issue(list, 'CAMT_BOOKED_BALANCES_AMBIGUOUS', 'The original statement needs one opening-booked and one closing-booked balance for its pair', location(stmt), 'WARNING', { openingCount: openingCandidates.length, closingCount: closingCandidates.length });
    } else {
      const pairIssues = [...opening.issues, ...closing.issues];
      const source = { pointer: stmt.pointer + '/booked-balance-pair', pointerSyntax: 'CAMT_BALANCE_PAIR',
        namespace, opening: opening.source, closing: closing.source };
      if (page && (page.page !== 1 || !page.last)) issue(pairIssues, 'CAMT_INCOMPLETE_PAGINATION', 'A statement page does not establish a complete account-period close', page.source);
      if (opening.camt.intermediate || closing.camt.intermediate) issue(pairIssues, 'CAMT_INTERMEDIATE_BALANCE', 'Intermediate booked balances remain page boundaries', source);
      if (!period.from || !period.until) issue(pairIssues, 'CAMT_REPORTING_PERIOD_REQUIRED', 'Original reporting-period bounds are needed for the complete inclusive close', location(stmt));
      if (period.from && period.until && temporalOrder(period.fromDateTime, period.untilDateTime) === 1) issue(pairIssues, 'CAMT_REPORTING_PERIOD_ORDER', 'Original reporting-period bounds are reversed', location(stmt));
      if (temporalOrder(opening.asOf, closing.asOf) === 1) issue(pairIssues, 'CAMT_BALANCE_DATE_ORDER', 'Original opening balance follows the closing balance', source);
      if (opening.asOf?.date && period.from && opening.asOf.date > period.from) issue(pairIssues, 'CAMT_OPENING_AFTER_PERIOD_START', 'Opening balance date follows the original reporting-period start', opening.source);
      if (closing.asOf?.date && period.until && (closing.asOf.date < period.from || closing.asOf.date > period.until)) issue(pairIssues, 'CAMT_CLOSING_OUTSIDE_PERIOD', 'Closing balance date lies outside the original reporting period', closing.source);
      if (balanceCheck.status !== 'MATCH') issue(pairIssues, balanceCheck.status === 'DIFFERENCE' ? 'CAMT_BOOKED_BALANCE_DIFFERENCE' : 'CAMT_BOOKED_BALANCE_UNAVAILABLE',
        balanceCheck.status === 'DIFFERENCE' ? 'Opening plus the original booked entries differs from the closing balance' : 'The original booked-balance equation cannot be completed', source, 'ERROR',
        { expected: expectedClosing, reported: closing.amount, difference });
      if (posted.some(row => !row.eligible)) issue(pairIssues, 'CAMT_BOOKED_ROWS_REQUIRE_REVIEW', 'The statement contains booked rows with unresolved source issues', location(stmt));
      const unresolvedStatusRows = allRows.filter(row => row.status === 'UNMAPPED' && row.camt.status.code !== 'INFO');
      if (unresolvedStatusRows.length) issue(pairIssues, 'CAMT_ENTRY_STATUS_REQUIRES_REVIEW',
        'The complete close requires the original booking status of every non-informational entry', location(stmt), 'ERROR',
        { entries: unresolvedStatusRows.map(row => ({ rowId: row.id, statusRaw: row.statusRaw, status: row.camt.status, source: row.source, issues: row.issues })) });
      const providerId = get(pairIssues, stmt, 'Id', true, 35) || null;
      candidates.push({
        id: jsonHash({ file: file.sha256, opening: opening.source.pointer, closing: closing.source.pointer }),
        kind: 'CAMT_BOOKED_BALANCES', providerId,
        providerKey: account.identitySha256 && providerId ? jsonHash({ account: account.identitySha256, kind: 'CAMT_BOOKED_BALANCES', providerId }) : null,
        currency: account.currency, currencyConversion: null,
        from: period.from, until: period.until, opening, closing,
        dates: { REPORT_FROM: period.fromDateTime, REPORT_UNTIL: period.untilDateTime, OPENING_AS_OF: opening.asOf, CLOSING_AS_OF: closing.asOf },
        totals: {}, source, original: { opening: opening.original, closing: closing.original },
        issues: pairIssues, eligible: !pairIssues.some(item => item.severity === 'ERROR'),
        camt: { pagination: page, balanceCheck, completeSinglePage: !page || (page.page === 1 && page.last),
          reportingPeriodBasis: 'ORIGINAL_FR_TO_DT', dateBoundary: 'INCLUSIVE_SOURCE_CALENDAR',
          intermediate: opening.camt.intermediate || closing.camt.intermediate }
      });
    }
    return { balances: { ledger, available, closing: candidates, sourceBalances: balances }, balanceCheck };
  }


  function rawScalar(node) { return node && !node.children.length ? node.value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '') : ''; }

  if (xml.root.children.length !== 1 || xml.root.children[0].name !== 'BkToCstmrStmt') fail('CAMT_DOCUMENT_ENVELOPE', 'Document must contain its original BankToCustomerStatement envelope');
  const body = one(xml.root, 'BkToCstmrStmt', true);
  const header = one(body, 'GrpHdr', true);
  const messageId = scalar(header, 'MsgId', true, 35);
  const messageCreatedNode = one(header, 'CreDtTm', true);
  const messageCreated = parseDate(messageCreatedNode);
  const messagePage = pagination(one(header, 'MsgPgntn'));
  const statementNodes = childNodes(body, 'Stmt');
  if (!statementNodes.length) fail('CAMT_STATEMENTS_MISSING', 'The original CAMT document contains no statement');
  if (statementNodes.length > LIMITS.statements) fail('CAMT_STATEMENT_LIMIT', 'CAMT file exceeds the supported statement count', LIMITS);
  knownChildren(body, legacy ? 'GrpHdr Stmt' : 'GrpHdr Stmt SplmtryData', issues);
  knownChildren(header, legacy ? 'MsgId CreDtTm MsgRcpt MsgPgntn AddtlInf' : 'MsgId CreDtTm MsgRcpt MsgPgntn OrgnlBizQry AddtlInf', issues);
  for (const supplement of childNodes(body, 'SplmtryData')) issue(issues, 'CAMT_SUPPLEMENTARY_DATA_RETAINED', 'Supplementary data remains in the complete original source tree', location(supplement), 'WARNING');
  const statements = [], statementIdentities = new Map();
  let recordNumber = 0;
  for (const stmt of statementNodes) {
    const statementIssues = [], source = location(stmt);
    const account = readAccount(stmt, statementIssues);
    const statementId = get(statementIssues, stmt, 'Id', true, 35);
    const createdAt = dateField(statementIssues, stmt, 'CreDtTm', legacy, false);
    const statementPage = attempt(statementIssues, source, () => pagination(one(stmt, 'StmtPgntn')));
    if (legacy && statementPage) issue(statementIssues, 'CAMT_V02_STATEMENT_PAGINATION', 'Statement-level pagination belongs to .08; the original .02 header pagination remains authoritative', statementPage.source);
    if (messagePage && statementPage) issue(statementIssues, 'CAMT_AMBIGUOUS_PAGINATION', 'The same source supplies both message and statement pagination', source);
    const page = statementPage || messagePage;
    const periodNode = optionalNode(statementIssues, stmt, 'FrToDt');
    const from = periodNode ? dateField(statementIssues, periodNode, 'FrDtTm', true, false) : null;
    const until = periodNode ? dateField(statementIssues, periodNode, 'ToDtTm', true, false) : null;
    const period = { kind: 'STATEMENT_COVERAGE', from: from?.date || null, until: until?.date || null,
      rawFrom: from?.raw || '', rawUntil: until?.raw || '', fromDateTime: from, untilDateTime: until, untilExclusive: false };
    if (!periodNode) issue(statementIssues, 'CAMT_REPORTING_PERIOD_MISSING', 'Original statement does not supply FrToDt; its balance dates remain separate observations', source, 'WARNING');
    if (from && until && (from.date > until.date || temporalOrder(from, until) === 1)) issue(statementIssues, 'CAMT_REPORTING_PERIOD_ORDER', 'Original statement reporting-period bounds are reversed', location(periodNode));
    if (from && until && temporalOrder(from, until) === null) issue(statementIssues, 'CAMT_REPORTING_TIMEZONE_UNSPECIFIED', 'Mixed source timestamp offsets prevent an absolute-time period comparison; original calendar dates remain unchanged', location(periodNode), 'WARNING');
    if (until && temporalOrder(messageCreated, until) === -1) issue(statementIssues, 'CAMT_MESSAGE_CREATED_BEFORE_PERIOD_END', 'Original message creation time precedes the end of its reporting period', location(messageCreatedNode), 'WARNING');
    if (until && createdAt && temporalOrder(createdAt, until) === -1) issue(statementIssues, 'CAMT_STATEMENT_CREATED_BEFORE_PERIOD_END', 'Original statement creation time precedes the end of its reporting period', source, 'WARNING');
    const copyDuplicate = get(statementIssues, stmt, 'CpyDplctInd', false, 35);
    if (copyDuplicate) issue(statementIssues, ['COPY', 'DUPL', 'CODU'].includes(copyDuplicate) ? 'CAMT_COPY_OR_DUPLICATE_STATEMENT' : 'CAMT_COPY_DUPLICATE_CODE',
      'Original copy or duplicate indicator is retained for reviewed source matching', location(optionalNode(statementIssues, stmt, 'CpyDplctInd')), 'WARNING', { value: copyDuplicate });
    const identity = jsonHash({ account: account.identityBasis, currency: account.currency, statementId, page: page?.page || null });
    const prior = statementIdentities.get(identity);
    if (prior) issue(statementIssues, 'CAMT_REPEATED_STATEMENT_IDENTITY', 'Original file repeats an account, statement and page identity; all entries remain retained', source, 'WARNING', { otherStatementId: prior });
    const allRows = [];
    for (const node of childNodes(stmt, 'Ntry')) {
      if (++recordNumber > LIMITS.entries) fail('CAMT_ENTRY_LIMIT', 'CAMT file exceeds the supported original entry count', LIMITS);
      const row = readRow(node, account, recordNumber);
      if (row.postedDate && period.from && period.until && (row.postedDate < period.from || row.postedDate > period.until)) {
        issue(row.issues, 'CAMT_BOOKING_OUTSIDE_PERIOD', 'Original booking date lies outside the statement reporting period', row.camt.fields.bookingDate || row.source, row.status === 'POSTED' ? 'ERROR' : 'WARNING');
        row.eligible = false;
      }
      allRows.push(row);
    }
    const entryReferences = new Map();
    for (const row of allRows) {
      const ref = row.camt.entryReference;
      if (!ref || ['NOTPROVIDED', 'NONREF'].includes(ref)) continue;
      const priorRowId = entryReferences.get(ref);
      if (priorRowId) issue(row.issues, 'CAMT_REPEATED_ENTRY_REFERENCE', 'Entry reference repeats within this statement; it is not used as account-servicer identity', row.camt.fields.entryReference, 'WARNING', { otherRowId: priorRowId });
      else entryReferences.set(ref, row.id);
    }
    const rows = allRows.filter(row => row.status === 'POSTED');
    const pendingRows = allRows.filter(row => row.status === 'PENDING');
    const excludedRows = allRows.filter(row => row.status === 'UNMAPPED').map(row => ({
      reason: row.camt.status.code === 'INFO' ? 'CAMT_INFORMATION_ONLY_ENTRY' : 'CAMT_UNMAPPED_ENTRY_STATUS',
      source: row.source, original: row.original, row
    }));
    const summaryNode = optionalNode(statementIssues, stmt, 'TxsSummry');
    const summaryChecks = summaryControls(summaryNode, allRows, account, statementIssues);
    const balanceResult = statementBalances(stmt, account, allRows, period, page, statementIssues);
    for (const candidate of balanceResult.balances.closing) {
      candidate.totals = Object.fromEntries(summaryChecks.filter(c => c.kind !== 'COUNT' && c.reported !== null).map(c => [c.field, { raw: c.reportedRaw, amount: c.reported }]));
      if (summaryChecks.some(c => c.matches !== true)) {
        issue(candidate.issues, 'CAMT_SUMMARY_REQUIRES_REVIEW', 'Original transaction-summary controls differ from the complete supplied entry records', location(summaryNode));
        candidate.eligible = false;
      }
      if (statementIssues.some(i => i.severity === 'ERROR')) {
        issue(candidate.issues, 'CAMT_STATEMENT_REQUIRES_REVIEW', 'Original statement or account fields have unresolved source issues', source);
        candidate.eligible = false;
      }
    }
    if (statementIssues.some(item => item.severity === 'ERROR')) for (const row of rows) row.eligible = false;
    const statement = {
      id: jsonHash({ file: file.sha256, pointer: source.pointer }), kind: 'CAMT_STATEMENT', account, period,
      balances: balanceResult.balances, rows, pendingRows, excludedRows, source, issues: statementIssues,
      summary: statementSummary(rows, pendingRows),
      camt: {
        statementId, createdAt, sequences: {
          electronic: get(statementIssues, stmt, 'ElctrncSeqNb'),
          legal: get(statementIssues, stmt, 'LglSeqNb'),
          reporting: project(optionalNode(statementIssues, stmt, 'RptgSeq'))
        },
        copyDuplicate: copyDuplicate || null, pagination: page, messagePagination: messagePage, statementPagination: statementPage,
        reportingSource: project(optionalNode(statementIssues, stmt, 'RptgSrc')), reportingPeriodSource: location(periodNode),
        relatedAccount: project(optionalNode(statementIssues, stmt, 'RltdAcct')),
        balanceCheck: balanceResult.balanceCheck, summaryChecks, summarySource: project(summaryNode),
        detailPolicy, entryCount: allRows.length, detailCount: allRows.reduce((sum, row) => sum + row.camt.details.length, 0),
        unmappedCount: excludedRows.length, additionalInformation: get(statementIssues, stmt, 'AddtlStmtInf'),
        fields: { id: location(optionalNode(statementIssues, stmt, 'Id')), createdAt: location(optionalNode(statementIssues, stmt, 'CreDtTm')), period: location(periodNode) }
      }
    };
    statements.push(statement);
    if (!prior) statementIdentities.set(identity, statement.id);
  }
  markDuplicates(statements);
  for (const statement of statements) {
    const unresolvedSourceIssues = [...issues, ...statement.issues].filter(item => item.severity === 'ERROR');
    if (unresolvedSourceIssues.length) for (const row of statement.rows) row.eligible = false;
    for (const candidate of statement.balances.closing) {
      if (unresolvedSourceIssues.length) {
        if (!candidate.issues.some(item => item.code === 'CAMT_STATEMENT_REQUIRES_REVIEW')) {
          issue(candidate.issues, 'CAMT_STATEMENT_REQUIRES_REVIEW', 'Original report, statement or account fields have unresolved source issues', statement.source, 'ERROR', { sourceIssues: unresolvedSourceIssues });
        }
        candidate.eligible = false;
      }
      if (statement.rows.some(row => !row.eligible)) {
        if (!candidate.issues.some(i => i.code === 'CAMT_BOOKED_ROWS_REQUIRE_REVIEW')) issue(candidate.issues, 'CAMT_BOOKED_ROWS_REQUIRE_REVIEW', 'Booked original source rows need review before using this complete close', statement.source);
        candidate.eligible = false;
      }
    }
    statement.summary = statementSummary(statement.rows, statement.pendingRows);
  }
  return {
    statements, issues,
    camt: {
      schema: CAMT053_SOURCE_SCHEMA, namespace, messageVersion, profile, messageId, messageCreated,
      messagePagination: messagePage, nodeCount: xml.nodeCount, entryCount: recordNumber,
      namespaceDeclarations, xmlDeclaration: xml.declaration, sourceTree: project(xml.root),
      groupHeader: project(header), source: location(xml.root), limits: { ...LIMITS },
      arithmetic: { cashUnit: 'ENTRY', direction: 'ORIGINAL_CREDIT_DEBIT_INDICATOR', reversal: 'INDICATOR_RETAINED_WITHOUT_SECOND_SIGN_CHANGE',
        details: 'NESTED_SOURCE_ONLY', charges: 'ORIGINAL_ENTRY_AMOUNT_UNCHANGED', precision: 'EXACT_DECIMAL_STRINGS' }
    }
  };
}
