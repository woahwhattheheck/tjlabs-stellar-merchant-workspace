// MIT. Retain provider JSON number lexemes before JavaScript can round them.
import { object, identity, fault } from '../postgres/publisher/files.mjs';
import { csvLine } from '../postgres/publisher/plan.mjs';

export class GristNumber {
  constructor(text) { this.text = text; Object.freeze(this); }
}
export function parseGristJSON(buffer) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer), (key, value, context) => {
      if (typeof value !== 'number') return value;
      if (typeof context?.source !== 'string') throw fault('GRIST_LOSSLESS_JSON_RUNTIME_REQUIRED', 'Use Node.js 24 or a supported JSON.parse source-context runtime.');
      return new GristNumber(context.source);
    });
  } catch (issue) { if (issue.code) throw issue; throw fault('GRIST_RESPONSE_JSON_INVALID'); }
}

const TYPE_CODES = new Set(['L','O','d','D','R','r']);
const blocked = new Set(['C','E','P','S','U','V','l']);
const natural = token => token instanceof GristNumber && /^(?:0|[1-9]\d*)$/.test(token.text);
export function typedJSON(value, depth=0) {
  if(depth>32)throw fault('GRIST_CELL_DEPTH_EXCEEDED');
  if(value instanceof GristNumber)return value.text;
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(!Array.isArray(value)||typeof value[0]!=='string'||!TYPE_CODES.has(value[0])) {
    if(Array.isArray(value)&&blocked.has(value[0]))throw fault('GRIST_UNPUBLISHABLE_CELL','A selected cell is censored, erroneous, pending, skipped, a conflict, or not serializable. Correct or omit it explicitly; it is never converted to null.');
    throw fault('GRIST_UNKNOWN_TYPED_CELL');
  }
  const code=value[0], recurse=x=>typedJSON(x,depth+1);
  if(code==='L')return'["L"'+value.slice(1).map(x=>','+recurse(x)).join('')+']';
  if(code==='O'){
    if(value.length!==2||!object(value[1])||value[1] instanceof GristNumber||Object.keys(value[1]).length>10000)throw fault('GRIST_TYPED_OBJECT_INVALID');
    return'["O",{'+Object.entries(value[1]).map(([k,v])=>JSON.stringify(k)+':'+recurse(v)).join(',')+'}]';
  }
  if(code==='d'&&(value.length!==2||!(value[1] instanceof GristNumber))||
      code==='D'&&(value.length!==3||!(value[1] instanceof GristNumber)||typeof value[2]!=='string'||value[2].length>256)||
      code==='R'&&(value.length!==3||typeof value[1]!=='string'||!natural(value[2]))||
      code==='r'&&(value.length!==3||typeof value[1]!=='string'||!Array.isArray(value[2])||!value[2].every(natural)))
    throw fault('GRIST_TYPED_VALUE_INVALID');
  if(code==='r')return'["r",'+JSON.stringify(value[1])+',['+value[2].map(x=>x.text).join(',')+']]';
  return'['+value.map((x,i)=>i===0?JSON.stringify(x):recurse(x)).join(',')+']';
}
export function parseGristRecords(buffer) {
  const response=parseGristJSON(buffer);
  if(!object(response)||Object.keys(response).some(k=>k!=='records')||!Array.isArray(response.records)||response.records.length>1000000)
    throw fault('GRIST_RECORDS_RESPONSE_INVALID');
  const ids=new Set();
  const records=response.records.map(row=>{
    if(!object(row)||Object.keys(row).some(k=>!['id','fields'].includes(k))||!natural(row.id)||row.id.text==='0'||
        !object(row.fields)||row.fields instanceof GristNumber||Object.keys(row.fields).length>10000)throw fault('GRIST_RECORD_INVALID','Require original typed records with native numeric row IDs and a complete fields object.');
    const id=row.id.text;
    if(ids.has(id))throw fault('GRIST_DUPLICATE_RECORD_ID');ids.add(id);
    return{id,fields:row.fields};
  });
  return{records};
}
export const recordIdentity=row=>'integer:'+row.id;
export const identityDigest=records=>identity(records.map(recordIdentity));
function canonicalNumber(text) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) throw fault('GRIST_JSON_NUMBER_INVALID');
  let digits = (match[2] + (match[3] ?? '')).replace(/^0+/, '');
  let exponent = BigInt(match[4] ?? '0') - BigInt((match[3] ?? '').length);
  if (!digits) return '0';
  const trailing = /0+$/.exec(digits)?.[0].length ?? 0;
  if (trailing) { digits = digits.slice(0, -trailing); exponent += BigInt(trailing); }
  return match[1] + digits + 'e' + exponent;
}

export function projectedGristValue(row,spec) {
  if(spec.source!=='$recordId'&&!Object.hasOwn(row.fields,spec.source))throw fault('GRIST_SELECTED_FIELD_MISSING','The selected account did not receive a declared field. Missing access/data is not null.');
  let value=spec.source==='$recordId'?new GristNumber(row.id):row.fields[spec.source];
  if(value===''&&spec.empty==='null')value=null;
  if(value===null){if(!spec.nullable)throw fault('DATASET_NULL_NOT_ALLOWED');return null;}
  // Validates typed cells even when an encoding would otherwise stringify them.
  if(Array.isArray(value))typedJSON(value);
  if(spec.encoding==='typed-json')return typedJSON(value);
  if(spec.encoding==='identity-text'){
    if(spec.source!=='$recordId'||!natural(value)||value.text==='0')throw fault('GRIST_IDENTITY_VALUE_INVALID');
    return value.text;
  }
  if(spec.encoding==='epoch-seconds-text'){
    const base=spec.providerType.split(':')[0],code=base==='Date'?'d':'D';
    if(!Array.isArray(value)||value[0]!==code||!(value[1] instanceof GristNumber)||
        code==='D'&&value[2]!==spec.providerType.slice('DateTime:'.length))
      throw fault('GRIST_DATE_VALUE_INVALID','Keep the provider date/time tuple and its declared timezone. This encoding publishes the original Unix seconds token, without calendar conversion.');
    return value[1].text;
  }
  if(spec.encoding==='reference-id-text'){
    if(!Array.isArray(value)||value[0]!=='R'||value[1]!==spec.providerType.slice('Ref:'.length)||!natural(value[2]))
      throw fault('GRIST_REFERENCE_VALUE_INVALID');
    return value[2].text;
  }
  if(spec.encoding==='number-text'){
    if(!(value instanceof GristNumber))throw fault('GRIST_NUMBER_TOKEN_REQUIRED','Number text requires a native JSON number. Alternate text and encoded dates/references require their explicit encodings.');
    return value.text;
  }
  if(value instanceof GristNumber){
    if(!['integer','number'].includes(spec.type))throw fault('GRIST_NATIVE_TYPE_CHANGED');
    const number=Number(value.text);
    if(!Number.isFinite(number)||Number.isInteger(number)&&!Number.isSafeInteger(number)||
        spec.type==='integer'&&!Number.isSafeInteger(number)||canonicalNumber(value.text)!==canonicalNumber(String(number)))
      throw fault('GRIST_NUMBER_PRECISION_LOSS','Choose exact number-text or typed-json when a native JavaScript number cannot retain the provider value.');
    return number;
  }
  if(spec.type==='string'&&typeof value==='string'||spec.type==='boolean'&&typeof value==='boolean')return value;
  throw fault('GRIST_NATIVE_TYPE_CHANGED','Select an explicit scalar or encoded value representation. Grist typed tuples are not coerced into display strings.');
}
export function scalarText(value, spec) {
  if (value === null) { if (!spec.nullable) throw fault('DATASET_NULL_NOT_ALLOWED'); return ''; }
  if (spec.type === 'string' && typeof value !== 'string' || spec.type === 'boolean' && typeof value !== 'boolean' ||
      spec.type === 'integer' && !Number.isSafeInteger(value) ||
      spec.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value)))
    throw fault('GRIST_PROJECTED_VALUE_INVALID');
  const text = String(value);
  if (!text.length && spec.nullable)
    throw fault('DATASET_EMPTY_NULL_CONFLICT', 'Choose explicit empty-to-null or a non-nullable Text column.');
  return text;
}
export function encodeGristRow(row, dataset) {
  return csvLine(Object.entries(dataset.columns).map(([name, spec]) => {
    const text = scalarText(row[name], spec);
    if (text.length > dataset.maxCellChars) throw fault('DATASET_CELL_TOO_LARGE');
    return text;
  }));
}
export function checkGristColumnTypes(columns, types) {
  if (!Array.isArray(types)) throw fault('GRIST_COLUMN_TYPES_MISSING');
  for (const [name, spec] of Object.entries(columns)) {
    const selected = types.find(column => column.name === name);
    if (!selected || selected.type !== spec.type) throw fault('GRIST_COLUMN_TYPE_MISMATCH', 'Use the reviewed type for ' + name + '.');
  }
}
