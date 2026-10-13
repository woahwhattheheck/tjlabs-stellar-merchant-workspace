/** Portable data primitives. CSV and canonical JSON are reused from the maintained supplier domain,
 * blob 776e81d5f4ae95a57fcabd33efdee8daa2449d09 (2026-10-12). */
import {sha256Utf8, sha256Bytes} from './sha256.mjs';
export {sha256Utf8, sha256Bytes};
export class WorkbenchError extends Error {
  constructor(code,message,details={}) { super(message); this.name='WorkbenchError'; this.code=code; this.details=details; }
}
export function need(ok,code,message,details={}) { if(!ok) throw new WorkbenchError(code,message,details); }
export const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export const plain=o=>o!==null && typeof o==='object' && (Object.getPrototypeOf(o)===Object.prototype || Object.getPrototypeOf(o)===null);
function validUnicode(s) { for(const c of s) need(!(c.codePointAt(0)>=0xd800&&c.codePointAt(0)<=0xdfff),'UNICODE','Text contains an unpaired surrogate.'); }
function text(s,label,nonempty=true) { need(typeof s==='string'&&(!nonempty||s.length>0),'TEXT',label+' must be text.'); validUnicode(s); return s; }
export function canonicalJSON(value) {
  const seen = new Set();
  function encode(v) {
    if (v === null) return 'null';
    if (typeof v === 'string') { validUnicode(v); return JSON.stringify(v); }
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') { need(Number.isFinite(v), 'INVALID_JSON', 'JSON numbers must be finite.'); return JSON.stringify(v); }
    need(Array.isArray(v) || plain(v), 'INVALID_JSON', 'Use only complete JSON values.');
    need(!seen.has(v), 'INVALID_JSON', 'JSON data cannot contain cycles.');
    seen.add(v);
    let out;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) need(own(v, i), 'INVALID_JSON', 'JSON arrays cannot have missing entries.');
      out = '[' + v.map(encode).join(',') + ']';
    } else out = '{' + Object.keys(v).sort().map(k => encode(k) + ':' + encode(v[k])).join(',') + '}';
    seen.delete(v);
    return out;
  }
  return encode(value);
}
export function parseCSV(csv, {delimiter = ','} = {}) {
  text(csv, 'CSV input', false);
  need(typeof delimiter === 'string' && delimiter.length === 1 && !/["\r\n\u0000-\u001f]/.test(delimiter),
    'INVALID_CSV_DIALECT', 'The CSV delimiter must be one non-control character other than a quote.');
  const input = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  need(input.length > 0, 'CSV_EMPTY', 'The CSV must include a header.');
  const records = [];
  let row = [], field = '', mode = 'start', line = 1, startLine = 1, touched = false;
  function finishField() { row.push(field); field = ''; mode = 'start'; }
  function finishRow() { finishField(); records.push({cells: row, lineNumber: startLine}); row = []; touched = false; }
  for (let i = 0; i < input.length; i++) {
    const c = input[i], newline = c === '\r' || c === '\n', crlf = c === '\r' && input[i + 1] === '\n';
    if (mode === 'quoted') {
      if (c === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; } else mode = 'closed';
      } else if (newline) { field += crlf ? '\r\n' : c; line++; if (crlf) i++; }
      else field += c;
      touched = true;
      continue;
    }
    if (mode === 'closed') need(c === delimiter || newline, 'CSV_QUOTE', 'Only a delimiter or newline may follow a closing quote.', {line});
    if (newline) {
      finishRow(); line++; if (crlf) i++; startLine = line;
    } else if (c === delimiter) {
      finishField(); touched = true;
    } else if (c === '"') {
      need(mode === 'start', 'CSV_QUOTE', 'A quoted field must start with its opening quote.', {line});
      mode = 'quoted'; touched = true;
    } else {
      need(mode !== 'closed', 'CSV_QUOTE', 'Unexpected content after a closing quote.', {line});
      field += c; mode = 'unquoted'; touched = true;
    }
  }
  need(mode !== 'quoted', 'CSV_UNCLOSED_QUOTE', 'The CSV has an unterminated quoted field.', {line: startLine});
  if (touched || row.length || field.length || mode === 'closed') finishRow();
  need(records.length > 0, 'CSV_EMPTY', 'The CSV must include a header.');
  const columns = records.shift().cells;
  need(columns.every(c => c.length > 0) && new Set(columns).size === columns.length, 'CSV_HEADERS', 'CSV headers must be nonempty and unique.');
  const rows = records.map((record, index) => {
    need(record.cells.length === columns.length, 'CSV_WIDTH', 'CSV row width differs from the header.',
      {rowNumber: index + 2, lineNumber: record.lineNumber, expected: columns.length, actual: record.cells.length});
    return {rowNumber: index + 2, lineNumber: record.lineNumber,
      raw: Object.fromEntries(columns.map((column, i) => [column, record.cells[i]]))};
  });
  return {columns, rows};
}

export const clone=o=>JSON.parse(canonicalJSON(o));
export const digest=o=>sha256Utf8(canonicalJSON(o)).sha256;
export function safePath(path) {
  need(typeof path==='string'&&path.length>0&&path.length<=2048&&!path.startsWith('/')&&!/^[A-Za-z]:/.test(path)&&!/[\\\x00-\x1f]/.test(path),'PATH','Use a relative file path.');
  need(path.split('/').every(p=>p!=='.'&&p!=='..'&&p.length>0),'PATH','File path contains an empty or traversal component.');
  return path;
}
export function csvExport(columns,records) {
  const cell=value=>{const s=value===null||value===undefined?'':typeof value==='object'?canonicalJSON(value):String(value);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  return [columns.map(cell).join(','),...records.map(row=>columns.map(c=>cell(row[c])).join(','))].join('\r\n')+'\r\n';
}
export function bytesFromBase64(value) {
  need(typeof value==='string'&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),'BASE64','The complete asset must use canonical base64.');
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', out=[];
  for(let i=0;i<value.length;i+=4) {
    const a=chars.indexOf(value[i]),b=chars.indexOf(value[i+1]),c=chars.indexOf(value[i+2]),d=chars.indexOf(value[i+3]);
    out.push((a<<2)|(b>>4));
    if(value[i+2]!=='=')out.push(((b&15)<<4)|(c>>2));
    if(value[i+3]!=='=')out.push(((c&3)<<6)|d);
    if(value[i+2]==='=')need((b&15)===0,'BASE64','Noncanonical base64 padding.');
    else if(value[i+3]==='=')need((c&3)===0,'BASE64','Noncanonical base64 padding.');
  }
  return Uint8Array.from(out);
}
export function base64FromBytes(bytes) {
  const c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let out='';
  for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=bytes[i+1],d=bytes[i+2];out+=c[a>>2]+c[((a&3)<<4)|((b||0)>>4)]+(i+1<bytes.length?c[((b&15)<<2)|((d||0)>>6)]:'=')+(i+2<bytes.length?c[d&63]:'=');}
  return out;
}
export function utf8Bytes(value) {
  text(value,'UTF-8 input',false);const out=[];
  for(const c of value){const n=c.codePointAt(0);if(n<128)out.push(n);else if(n<2048)out.push(192|(n>>6),128|(n&63));else if(n<65536)out.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else out.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63));}
  return Uint8Array.from(out);
}
export function utf8Text(bytes) {
  let out='';
  for(let i=0;i<bytes.length;) {
    const b=bytes[i++];let n,min,count;
    if(b<128){out+=String.fromCharCode(b);continue;}
    if(b>=194&&b<=223){n=b&31;min=128;count=1;}
    else if(b>=224&&b<=239){n=b&15;min=2048;count=2;}
    else if(b>=240&&b<=244){n=b&7;min=65536;count=3;}
    else throw new WorkbenchError('UTF8','The file is not valid UTF-8.',{offset:i-1});
    need(i+count<=bytes.length,'UTF8','The file ends inside a UTF-8 character.');
    for(let j=0;j<count;j++){const x=bytes[i++];need((x&192)===128,'UTF8','Invalid UTF-8 continuation.',{offset:i-1});n=(n<<6)|(x&63);}
    need(n>=min&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff),'UTF8','Invalid UTF-8 code point.');out+=String.fromCodePoint(n);
  }
  return out;
}
export function rational(input) {
  if(plain(input)&&typeof input.n==='bigint'&&typeof input.d==='bigint') return fraction(input.n,input.d);
  const s=String(input);need(s.length<=2048&&/^[+-]?(?:\d+(?:\.\d+)?|\d+\/\d+)$/.test(s),'DECIMAL','Use an exact decimal or integer fraction.',{value:s});
  if(s.includes('/')){const [a,b]=s.split('/');return fraction(BigInt(a),BigInt(b));}
  const sign=s[0]==='-'?-1n:1n, parts=s.replace(/^[+-]/,'').split('.');
  return fraction(sign*BigInt(parts[0]+(parts[1]||'')),10n**BigInt((parts[1]||'').length));
}
function fraction(n,d) {
  need(d!==0n,'DECIMAL','A rational denominator cannot be zero.'); if(d<0n){n=-n;d=-d;}
  let a=n<0n?-n:n,b=d;while(b!==0n){const r=a%b;a=b;b=r;}const g=a||1n;return {n:n/g,d:d/g};
}
export const add=(a,b)=>{a=rational(a);b=rational(b);return fraction(a.n*b.d+b.n*a.d,a.d*b.d);};
export const sub=(a,b)=>{a=rational(a);b=rational(b);return fraction(a.n*b.d-b.n*a.d,a.d*b.d);};
export const mul=(a,b)=>{a=rational(a);b=rational(b);return fraction(a.n*b.n,a.d*b.d);};
export const div=(a,b)=>{a=rational(a);b=rational(b);return fraction(a.n*b.d,a.d*b.n);};
export const cmp=(a,b)=>{a=rational(a);b=rational(b);const n=a.n*b.d-b.n*a.d;return n<0n?-1:n>0n?1:0;};
export function exact(input) {
  const q=rational(input);let d=q.d,two=0,five=0;
  while(d%2n===0n){d/=2n;two++;}while(d%5n===0n){d/=5n;five++;}
  if(d!==1n)return q.n+'/'+q.d;
  const scale=Math.max(two,five),whole=q.n*(10n**BigInt(scale))/q.d,neg=whole<0n,s=(neg?-whole:whole).toString().padStart(scale+1,'0');
  if(!scale)return (neg?'-':'')+s;
  return ((neg?'-':'')+s.slice(0,-scale)+'.'+s.slice(-scale)).replace(/0+$/,'').replace(/\.$/,'');
}
export function decimal(input) {const s=exact(input);need(!s.includes('/'),'DECIMAL_PRECISION','This conversion has a recurring decimal; select an explicit native representation or rounding rule.',{exact:s});return s;}
export function rounded(input,places=2,mode='half_even') {
  need(Number.isSafeInteger(places)&&places>=0&&places<=18,'ROUNDING','Decimal places must be between 0 and 18.');
  need(['half_even','half_up','toward_zero'].includes(mode),'ROUNDING','Choose half_even, half_up or toward_zero.');
  const q=mul(input,10n**BigInt(places)),sign=q.n<0n?-1n:1n,a=q.n<0n?-q.n:q.n;
  let n=a/q.d;const r=a%q.d;
  if(mode!=='toward_zero'&&(r*2n>q.d||(r*2n===q.d&&(mode==='half_up'||n%2n===1n))))n++;
  const v=sign*n,s=(v<0n?-v:v).toString().padStart(places+1,'0');
  return (v<0n?'-':'')+(places?s.slice(0,-places)+'.'+s.slice(-places):s);
}
export function allocateRounded(amounts,total,places=2,mode='half_even') {
  const scale=10n**BigInt(places), units=amounts.map(a=>mul(a,scale));
  const floor=q=>q.n>=0n?q.n/q.d:-((-q.n+q.d-1n)/q.d);
  const values=units.map(floor),target=rational(rounded(total,places,mode)).n*scale/rational(rounded(total,places,mode)).d;
  let remaining=target-values.reduce((a,b)=>a+b,0n);
  const order=units.map((q,i)=>({i,remainder:sub(q,values[i])})).sort((a,b)=>cmp(b.remainder,a.remainder)||a.i-b.i);
  need(remaining>=0n&&remaining<=BigInt(order.length),'ALLOCATION','Rounding allocation does not match the exact group.');
  for(let j=0;j<Number(remaining);j++)values[order[j].i]++;
  return values.map(n=>rounded(fraction(n,scale),places,'toward_zero'));
}
