// MIT. Original QCEW CSV semantics and exact arithmetic for county reports.
export const QCEW_CAPTURE = 'stellar-forge.qcew-capture.v1';
export const QCEW_PROFILE = 'stellar-forge.qcew-wage-profile.v1';
export const QCEW_REPORT = 'stellar-forge.qcew-wage-report.v1';
export const MAX_CSV_BYTES = 64 * 1024 * 1024;
export const KEY_FIELDS = Object.freeze(['area_fips','own_code','industry_code','agglvl_code','size_code','year','qtr']);
export const VALUE_FIELDS = Object.freeze(['qtrly_estabs','month1_emplvl','month2_emplvl','month3_emplvl','total_qtrly_wages','avg_wkly_wage']);
export function need(condition, message, code = 'QCEW_INVALID', status = 400) {
  if (!condition) throw Object.assign(new Error(message), { code, status });
}
export const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const clone = value => JSON.parse(JSON.stringify(value));
export function canonical(value) {
  if (value === null || ['string','boolean'].includes(typeof value)) return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  need(plain(value), 'QCEW records contain only JSON values.');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
export function text(value, label, max = 500) {
  need(typeof value === 'string' && value.trim() && value.length <= max, label + ' is required.');
  return value.trim();
}
export function areaCode(value) {
  need(typeof value === 'string' && /^(US000|[0-9]{5})$/.test(value), 'Use the original five-character BLS area code.');
  return value;
}
export function period(value) {
  need(plain(value) && Number.isSafeInteger(value.year) && value.year >= 1990 && value.year <= 2100 &&
    Number.isSafeInteger(value.quarter) && value.quarter >= 1 && value.quarter <= 4, 'Choose a QCEW year and quarter.');
  return { year: value.year, quarter: value.quarter };
}
export const periodKey = value => String(value.year) + '-Q' + value.quarter;
export const periodOrdinal = value => value.year * 4 + value.quarter - 1;
export function periodDate(value) {
  period(value);
  return value.year + '-' + String((value.quarter - 1) * 3 + 1).padStart(2, '0') + '-01';
}
export function rowKey(row) { return KEY_FIELDS.map(key => row[key]).join('|'); }

// Both the 42-column open slices and 47-column titled historical members are
// identified by their original header names. Quoted commas/newlines stay intact.
export function* csvRecords(input) {
  need(typeof input === 'string', 'Supply the complete original CSV text.');
  let field = '', row = [], quoted = false, closed = false, started = false, i = input.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += c;
      continue;
    }
    if (c === '"' && !started && !closed) { quoted = true; started = true; continue; }
    if (c === ',' || c === '\r' || c === '\n') {
      row.push(field); field = ''; started = false; closed = false;
      if (c !== ',') {
        if (c === '\r' && input[i + 1] === '\n') i++;
        if (!(row.length === 1 && row[0] === '')) yield row;
        row = [];
      }
      continue;
    }
    need(!closed || c === ' ' || c === '\t', 'Characters follow a quoted CSV field.');
    need(c !== '"', 'An original CSV field has an unexpected quote.');
    if (!closed) { field += c; started = true; }
  }
  need(!quoted, 'The original CSV ends inside a quoted field.');
  if (started || closed || field || row.length) { row.push(field); yield row; }
}
export function inspectCsv(input, { expectedArea, expectedYear, select = null } = {}) {
  const it = csvRecords(input), first = it.next();
  need(!first.done, 'The original QCEW CSV is empty.');
  const columns = first.value.map(value => value.trim());
  const establishmentColumns = ['qtrly_estabs','qtrly_estabs_count'].filter(key => columns.includes(key));
  need(establishmentColumns.length === 1, 'The original establishment column is absent or ambiguous.');
  const establishmentColumn = establishmentColumns[0];
  const requiredColumns = [...KEY_FIELDS, 'disclosure_code', ...VALUE_FIELDS.map(key => key === 'qtrly_estabs' ? establishmentColumn : key)];
  // The original 1990 titled archive repeats an unused taxable-wage change
  // heading. Require unambiguous calculation keys and preserve the full header.
  need(columns.length <= 100 && requiredColumns.every(key => columns.filter(column => column === key).length === 1),
    'The original QCEW quarterly CSV header is incomplete or a calculation key is repeated.');
  const areas = new Set(), periods = new Set(), keys = new Set(), rows = [];
  let rowCount = 0, withheld = 0;
  for (const values of it) {
    rowCount++;
    need(values.length === columns.length && rowCount <= 2000000, 'The original CSV row width or capacity differs.');
    const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    row.qtrly_estabs = row[establishmentColumn];
    for (const key of [...KEY_FIELDS, 'disclosure_code']) row[key] = row[key].trim();
    areaCode(row.area_fips);
    need(/^[0-9]$/.test(row.own_code) && /^[0-9]{2,6}(?:-[0-9]{2})?$/.test(row.industry_code) &&
      /^[0-9]{2}$/.test(row.agglvl_code) && /^[0-9]$/.test(row.size_code), 'An original QCEW row has invalid classification keys.');
    const when = period({ year: Number(row.year), quarter: Number(row.qtr) });
    need(/^[0-9]{4}$/.test(row.year) && /^[1-4]$/.test(row.qtr), 'Use quarterly QCEW files with their original year and quarter.');
    need(expectedArea === undefined || row.area_fips === expectedArea, 'The area member contains another area.');
    need(expectedYear === undefined || when.year === expectedYear, 'The area member contains another year.');
    need(['', 'N', '-'].includes(row.disclosure_code), 'The original disclosure flag is unrecognized.');
    for (const key of VALUE_FIELDS) {
      const value = row[key].trim();
      need(value === '-' || value === '' || /^-?[0-9]{1,18}$/.test(value), 'The original QCEW field is neither a numeric value nor its unavailable marker: ' + key + '.');
      row[key] = value;
      if (value !== '-' && value !== '' && key !== 'total_qtrly_wages' && key !== 'avg_wkly_wage')
        need(BigInt(value) >= 0n, 'QCEW establishment and employment counts must be nonnegative.');
    }
    const key = rowKey(row);
    need(!keys.has(key), 'The original CSV repeats a QCEW classification/period key.');
    keys.add(key); areas.add(row.area_fips); periods.add(periodKey(when));
    if (row.disclosure_code === 'N') withheld++;
    if (select === null || select(row)) rows.push({ ...row, originalRow: rowCount + 1 });
  }
  need(rowCount > 0, 'The original QCEW CSV has no records.');
  return { columns, rowCount, withheld, areas: [...areas].sort(), periods: [...periods].sort(), rows };
}
export function rowState(row) {
  if (row.disclosure_code === 'N') return 'withheld';
  if (row.disclosure_code === '-' || VALUE_FIELDS.some(key => row[key] === '-'))
    return Number(row.year) <= 2000 ? 'historical_unavailable' : 'no_activity';
  if (VALUE_FIELDS.some(key => row[key] === '')) return 'missing';
  return 'available';
}
function gcd(a, b) {
  a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  while (b) { const next = a % b; a = b; b = next; }
  return a || 1n;
}
export function rational(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  need(d !== 0n, 'A calculation has a zero denominator.', 'QCEW_ZERO_DENOMINATOR');
  if (d < 0n) { n = -n; d = -d; }
  const divisor = gcd(n, d);
  return { n: n / divisor, d: d / divisor };
}
export function decimal(value) {
  need(typeof value === 'string' && /^-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(value), 'Use an original numeric decimal string.');
  const match = /^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(value);
  const fraction = match[3] ?? '', exponent = Number(match[4] ?? 0) - fraction.length;
  need(Math.abs(exponent) <= 100 && match[2].length + fraction.length <= 200, 'The original decimal exceeds calculation capacity.');
  let n = BigInt((match[1] || '') + match[2] + fraction), d = 1n;
  if (exponent >= 0) n *= 10n ** BigInt(exponent); else d = 10n ** BigInt(-exponent);
  return rational(n, d);
}
export const add = (a, b) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
export const subtract = (a, b) => rational(a.n * b.d - b.n * a.d, a.d * b.d);
export const multiply = (a, b) => rational(a.n * b.n, a.d * b.d);
export const divide = (a, b) => rational(a.n * b.d, a.d * b.n);
export function decimalText(value, places = 8) {
  need(Number.isInteger(places) && places >= 0 && places <= 18, 'Choose at most eighteen display decimal places.');
  const negative = value.n < 0n, absolute = negative ? -value.n : value.n, scale = 10n ** BigInt(places);
  const rounded = (absolute * scale * 2n + value.d) / (value.d * 2n);
  const whole = rounded / scale, fraction = places ? String(rounded % scale).padStart(places, '0').replace(/0+$/, '') : '';
  return (negative && rounded ? '-' : '') + whole + (fraction ? '.' + fraction : '');
}
export function quantity(value, status = 'available', details = {}) {
  if (!value) return { value: null, exact: null, status, ...details };
  return { value: decimalText(value), exact: { numerator: String(value.n), denominator: String(value.d) }, status, ...details };
}
export const restoreQuantity = item => item?.exact ? rational(item.exact.numerator, item.exact.denominator) : null;
export function compareQuantity(before, after, mode = 'change') {
  const a = restoreQuantity(before), b = restoreQuantity(after);
  if (!a || !b) return quantity(null, !a ? before?.status ?? 'missing' : after?.status ?? 'missing');
  if (mode === 'change') return quantity(subtract(b, a));
  if (a.n === 0n) return quantity(null, 'zero_denominator');
  return quantity(mode === 'ratio' ? divide(b, a) : multiply(subtract(divide(b, a), rational(1n)), rational(100n)));
}
export function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}
