// MIT. Request declarations and the original seller's form/explode query codec.
import { encodeQueryParameters, decodeQueryParameters, validateQuerySerialization,
  queryParameterShape } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/query-parameters.mjs';
import { prepareHttpPath } from '../route-identity/http-path.mjs';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unsupported = () => Object.assign(new Error(
  'Required query names must be a direct list of up to 30 unique, nonempty names of at most 100 characters without control characters.'
), { code: 'INPUT_SCHEMA_UNSUPPORTED' });

export function requiredQueryKeys(bazaarSchema) {
  let query = bazaarSchema;
  for (const key of ['properties', 'input', 'properties', 'queryParams']) {
    if (!record(query) || !Object.hasOwn(query, key)) return [];
    query = query[key];
  }
  if (!record(query) || !Object.hasOwn(query, 'required')) return [];
  const required = query.required;
  if (!Array.isArray(required) || required.length > 30) throw unsupported();
  const keys = [];
  const seen = new Set();
  for (const key of required) {
    if (typeof key !== 'string' || key.length === 0 || key.length > 100 ||
        /[\u0000-\u001f\u007f]/.test(key) || seen.has(key)) throw unsupported();
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

const QUERY_KEYS = 30, QUERY_NAME = 100, QUERY_VALUE = 1024, QUERY_ITEMS = 1024, QUERY_BYTES = 8192;
const own = (value, key) => Object.hasOwn(value, key);
const inputError = (code, message, details) => Object.assign(new Error(message), {code, ...(details ? {details} : {})});
const validText = (value, limit, empty = false) => typeof value === 'string' &&
  (empty || value.length > 0) && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);
const types = value => typeof value === 'string' ? value :
  Array.isArray(value) && value.every(item => typeof item === 'string') ? [...value] : null;

/** This is the seller's direct query declaration, not its example values. */
export function querySchema(bazaarSchema) {
  let current = bazaarSchema;
  for (const key of ['properties', 'input', 'properties', 'queryParams']) {
    if (!record(current) || !own(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

export function describeHttpQuery(recorded) {
  const schema = querySchema(recorded.bazaar?.schema);
  if (schema !== undefined && schema !== true && !record(schema))
    throw inputError('INPUT_SCHEMA_UNSUPPORTED', 'The published query schema must describe an object.');
  if (record(schema) && schema.type !== undefined && schema.type !== 'object' &&
      !(Array.isArray(schema.type) && schema.type.includes('object')))
    throw inputError('INPUT_SCHEMA_UNSUPPORTED', 'The published query schema must allow an object.');
  if (record(schema) && own(schema, 'properties') && !record(schema.properties))
    throw inputError('INPUT_SCHEMA_UNSUPPORTED', 'Query properties must be an object.');
  const declared = record(schema?.properties);
  const properties = declared ? schema.properties : null;
  const examples = record(recorded.input?.queryParams) ? recorded.input.queryParams : {};
  const keys = Object.keys(properties ?? examples);
  if (keys.length > 256 || keys.some(key => !validText(key, QUERY_NAME)))
    throw inputError('INPUT_SCHEMA_UNSUPPORTED', 'Query declarations support at most 256 names of 1–100 control-free characters.');
  const required = requiredQueryKeys(recorded.bazaar?.schema);
  const serialization = recorded.bazaar?.querySerialization;
  let rules = {};
  if (serialization !== undefined) {
    try { rules = validateQuerySerialization(schema, serialization); }
    catch (error) { throw inputError('INPUT_SCHEMA_UNSUPPORTED', error.message); }
  }
  const keysSource = declared
    ? 'bazaar.schema.properties.input.properties.queryParams.properties'
    : 'bazaar.info.input.queryParams';
  return {
    advertisedKeys:keys,
    keysSource,
    parameters:keys.map(name => {
      const property = record(properties?.[name]) ? properties[name] : {};
      return {name, required:required.includes(name), type:types(property.type),
        itemType:record(property.items) ? types(property.items.type) : null,
        title:typeof property.title === 'string' ? property.title.slice(0,256) : null,
        description:typeof property.description === 'string' ? property.description.slice(0,2048) : null,
        encoding:serialization === undefined ? 'literal-or-repeated' :
          rules[name]?.explode === false ? 'form-comma' : 'form-repeated',
        source:keysSource,
      };
    }),
    querySerialization:serialization === undefined ? null : structuredClone(serialization),
    valueType:'string or nonempty array of strings',
    maxKeys:QUERY_KEYS, maxKeyLength:QUERY_NAME, maxValueLength:QUERY_VALUE,
    maxArrayItems:QUERY_ITEMS, maxEncodedQueryBytes:QUERY_BYTES,
  };
}

/** Build only the explicit selected query; the caller still owns origin checks. */
export function prepareHttpQuery(recorded, input = {}) {
  if (!record(input) || Object.keys(input).some(key => !['path','query'].includes(key)))
    throw inputError('INVALID_PARAMS', 'Only path and query input are supported for GET/HEAD.');
  const query = input.query === undefined ? {} : input.query;
  if (!record(query) || Object.keys(query).length > QUERY_KEYS)
    throw inputError('INVALID_PARAMS', 'Query values must be an object with at most 30 fields.');
  const declaration = describeHttpQuery(recorded), allowed = new Set(declaration.advertisedKeys);
  const supplied = Object.keys(query);
  const unknown = supplied.filter(key => !allowed.has(key));
  if (unknown.length) throw inputError('INPUT_NOT_ADVERTISED', 'Query keys must be declared by the seller.',
    {keys:unknown, advertisedKeys:declaration.advertisedKeys, keysSource:declaration.keysSource});
  for (const [key, value] of Object.entries(query)) {
    const items = Array.isArray(value) ? value : [value];
    if (!validText(key, QUERY_NAME) || !items.length || items.length > QUERY_ITEMS ||
        items.some(item => !validText(item, QUERY_VALUE, true)))
      throw inputError('INVALID_PARAMS', 'Query values must be control-free strings or nonempty arrays of strings.',
        {key, maxItems:QUERY_ITEMS, maxValueLength:QUERY_VALUE});
  }
  const schema = querySchema(recorded.bazaar?.schema), serialization = recorded.bazaar?.querySerialization;
  let encoded;
  if (serialization === undefined) {
    encoded = new URLSearchParams();
    for (const [name, value] of Object.entries(query))
      for (const item of Array.isArray(value) ? value : [value]) encoded.append(name, item);
  } else {
    for (const name of supplied) {
      try { queryParameterShape(schema.properties[name], name); }
      catch (error) { throw inputError('INPUT_SCHEMA_UNSUPPORTED', error.message, {key:name}); }
    }
    const selected = Object.create(null);
    try {
      for (const [name, value] of Object.entries(query)) {
        // Explicit arrays are selected items, not a comma-encoded scalar. Parse
        // them as repeated values, then encode with the seller's retained rule.
        const inputRules = Array.isArray(value) ? {...serialization,
          parameters:{...serialization.parameters, [name]:{style:'form', explode:true}}} : serialization;
        selected[name] = decodeQueryParameters({[name]:value}, schema, inputRules)[name];
      }
      encoded = new URLSearchParams(encodeQueryParameters(selected, schema, serialization));
    } catch (error) { throw inputError('INPUT_SERIALIZATION', error.message, {keys:supplied}); }
  }
  const url = prepareHttpPath(recorded, input.path);
  // Delete each selected key once so repeated encoded pairs survive intact.
  for (const name of supplied) url.searchParams.delete(name);
  for (const [name, value] of encoded) url.searchParams.append(name, value);
  if (url.search.slice(1).length > QUERY_BYTES)
    throw inputError('INPUT_SERIALIZATION', 'The complete encoded query exceeds 8 KiB.');
  const missing = requiredQueryKeys(recorded.bazaar?.schema).filter(key => !url.searchParams.has(key));
  if (missing.length) throw inputError('INPUT_REQUIRED', 'Supply the required query inputs.',
    {keys:missing, keysSource:'bazaar.schema.properties.input.properties.queryParams.required'});
  return url;
}
