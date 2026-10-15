/**
 * SF-25: v2 PaymentPayload Bazaar extension -> trusted SF-46 catalog commit.
 * Source pin: x402-foundation/x402@faa1c694c66a3732aaabbce93bdae140e521a67d
 * Bazaar spec blob: 442708e76d5a129e0c1393471d8ed71e3604c94e
 * Facilitator extractor blob: 083013ee19544e182c2e3185d7853309c34b9d9c
 * HTTP types blob: 4e7f4b00c7bbf8fbb858ee86634217726165e4e4
 * MCP types blob: ec1f9ab2ba32d9ef22506722890dee33b96b3700
 */
import { compileSchemaPattern } from './schema-pattern.mjs';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => structuredClone(value);
const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
// One budget covers all alternatives and recursive instance descent in a validation.
const MAX_SCHEMA_EVALUATIONS = 100_000;
const SCHEMA_KEYS = new Set([
  '$schema', '$id', '$ref', '$defs', 'definitions', 'type', 'properties', 'required',
  'additionalProperties', 'items', 'const', 'enum', 'anyOf', 'allOf', 'oneOf', 'not', 'propertyNames',
  'minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems',
  'uniqueItems', 'title', 'description', 'default', 'examples',
  'exclusiveMinimum', 'exclusiveMaximum', 'pattern', 'format', 'readOnly', 'writeOnly', 'deprecated', '$comment',
]);
const TYPES = {
  object: plain,
  array: Array.isArray,
  string: value => typeof value === 'string',
  number: value => typeof value === 'number' && Number.isFinite(value),
  integer: value => Number.isSafeInteger(value),
  boolean: value => typeof value === 'boolean',
  null: value => value === null,
};
const QUERY_METHODS = new Set(['GET', 'HEAD', 'DELETE']);
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const BODY_TYPES = new Set(['json', 'form-data', 'text']);
const MCP_TRANSPORTS = new Set(['streamable-http', 'sse']);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function equal(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }

function inspectSchema(schema, depth = 0, state = { nodes: 0, schemas: new WeakSet(), references: [] }) {
  state.nodes += 1;
  if (state.nodes > 512 || depth > 16) return 'SCHEMA_COMPLEXITY_LIMIT';
  if (schema === true || schema === false) return null;
  if (!plain(schema)) return 'SCHEMA_NODE_INVALID';
  if (state.schemas.has(schema)) return null;
  state.schemas.add(schema);
  for (const [key, value] of Object.entries(schema)) {
    if (!SCHEMA_KEYS.has(key)) return `SCHEMA_KEYWORD_UNSUPPORTED:${key}`;
    if ((key === '$ref' || key === '$id') && (typeof value !== 'string' || !value.startsWith('#'))) {
      return 'SCHEMA_EXTERNAL_REFERENCE';
    }
    if (key === '$ref') state.references.push(value);
    // A malformed assertion keyword cannot be treated as an absent assertion.
    // Network-supplied schemas must fail closed rather than over-admit info.
    if (key === 'type') {
      const types = Array.isArray(value) ? value : [value];
      if (!types.length || types.some(t => typeof t !== 'string' || !Object.hasOwn(TYPES, t)) ||
          new Set(types).size !== types.length) return 'SCHEMA_TYPE_INVALID';
    }
    if (['minLength', 'maxLength', 'minItems', 'maxItems'].includes(key) &&
        (!Number.isSafeInteger(value) || value < 0)) return 'SCHEMA_' + key.toUpperCase() + '_INVALID';
    if (['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'].includes(key) &&
        (typeof value !== 'number' || !Number.isFinite(value))) return 'SCHEMA_' + key.toUpperCase() + '_INVALID';
    if (key === 'uniqueItems' && typeof value !== 'boolean') return 'SCHEMA_UNIQUEITEMS_INVALID';
    if (key === 'required' && (!Array.isArray(value) ||
        value.some(k => typeof k !== 'string') || new Set(value).size !== value.length))
      return 'SCHEMA_REQUIRED_INVALID';
    if (key === 'enum' && (!Array.isArray(value) || value.length === 0))
      return 'SCHEMA_ENUM_INVALID';
    if (['title', 'description', 'format', '$comment'].includes(key) && typeof value !== 'string')
      return 'SCHEMA_' + key.toUpperCase() + '_INVALID';
    if (['readOnly', 'writeOnly', 'deprecated'].includes(key) && typeof value !== 'boolean')
      return 'SCHEMA_' + key.toUpperCase() + '_INVALID';
    if (key === 'pattern') {
      try { compileSchemaPattern(value); } catch (error) { return error.message; }
    }
    if (key === 'examples' && !Array.isArray(value)) return 'SCHEMA_EXAMPLES_INVALID';
    if (['properties', '$defs', 'definitions'].includes(key)) {
      if (!plain(value)) return `SCHEMA_${key.toUpperCase()}_INVALID`;
      for (const child of Object.values(value)) {
        const error = inspectSchema(child, depth + 1, state); if (error) return error;
      }
    } else if (['items', 'additionalProperties', 'not', 'propertyNames'].includes(key)) {
      if (!plain(value) && typeof value !== 'boolean')
        return 'SCHEMA_' + key.toUpperCase() + '_INVALID';
      const error = inspectSchema(value, depth + 1, state); if (error) return error;
    } else if (['anyOf', 'allOf', 'oneOf'].includes(key)) {
      if (!Array.isArray(value) || value.length === 0) return `SCHEMA_${key.toUpperCase()}_INVALID`;
      for (const child of value) {
        const error = inspectSchema(child, depth + 1, state); if (error) return error;
      }
    }
  }
  return null;
}

function resolvePointer(root, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#'))
    throw new TypeError('SCHEMA_LOCAL_REFERENCE_INVALID');
  let pointer;
  try { pointer = decodeURIComponent(ref.slice(1)); }
  catch { throw new TypeError('SCHEMA_LOCAL_REFERENCE_INVALID'); }
  if (pointer === '') return root;
  if (!pointer.startsWith('/')) throw new TypeError('SCHEMA_LOCAL_REFERENCE_INVALID');
  let node = root;
  for (const raw of pointer.slice(1).split('/')) {
    if (/~(?:[^01]|$)/.test(raw)) throw new TypeError('SCHEMA_LOCAL_REFERENCE_INVALID');
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!plain(node) || !Object.hasOwn(node, key)) throw new TypeError('SCHEMA_LOCAL_REFERENCE_MISSING');
    node = node[key];
  }
  return node;
}

function inspectSchemaDocument(schema) {
  const state = { nodes: 0, schemas: new WeakSet(), references: [] };
  const inspection = inspectSchema(schema, 0, state);
  if (inspection) return inspection;
  try {
    // Check every referenced target, including alternatives not taken by an
    // example. Resolve fragments against this schema document, never its
    // surrounding discovery envelope or an external source.
    const checked = new Set();
    for (let index = 0; index < state.references.length; index++) {
      const ref = state.references[index];
      if (checked.has(ref)) continue;
      checked.add(ref);
      const invalid = inspectSchema(resolvePointer(schema, ref), 0, state);
      if (invalid) return invalid;
    }
    return null;
  } catch (error) {
    return error.message;
  }
}

function validateNode(value, schema, root, path = '$', refs = new Set(), depth = 0, evaluation = { nodes: 0 }) {
  if (++evaluation.nodes > MAX_SCHEMA_EVALUATIONS) throw new TypeError('SCHEMA_EVALUATION_LIMIT');
  if (depth > 512) throw new TypeError('SCHEMA_EVALUATION_DEPTH_LIMIT');
  if (schema === true) return [];
  if (schema === false) return [`${path}:false_schema`];
  if (!plain(schema)) throw new TypeError('SCHEMA_NODE_INVALID');
  if (schema.$ref !== undefined) {
    if (refs.has(schema.$ref)) throw new TypeError('SCHEMA_REFERENCE_CYCLE');
    const next = new Set(refs); next.add(schema.$ref);
    const errors = validateNode(value, resolvePointer(root, schema.$ref), root, path, next, depth + 1, evaluation);
    if (errors.length) return errors;
    // Draft 2020-12 applies adjacent keywords as well as the referenced schema.
    // Keep the reference stack local to its branch: a sibling can reuse it.
  }
  if (schema.const !== undefined && !equal(value, schema.const)) return [`${path}:const`];
  if (Array.isArray(schema.enum) && !schema.enum.some(item => equal(value, item))) return [`${path}:enum`];
  if (schema.type !== undefined) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.some(type => TYPES[type]?.(value))) return [`${path}:type`];
  }
  for (const group of ['allOf', 'anyOf', 'oneOf']) {
    if (schema[group] !== undefined && !Array.isArray(schema[group])) return [`${path}:${group}_invalid`];
  }
  if (schema.allOf) {
    const errors = schema.allOf.flatMap(part => validateNode(value, part, root, path, refs, depth + 1, evaluation));
    if (errors.length) return errors;
  }
  if (schema.anyOf && !schema.anyOf.some(part => validateNode(value, part, root, path, refs, depth + 1, evaluation).length === 0)) return [`${path}:anyOf`];
  if (schema.oneOf && schema.oneOf.filter(part => validateNode(value, part, root, path, refs, depth + 1, evaluation).length === 0).length !== 1) return [`${path}:oneOf`];
  if (Object.hasOwn(schema, 'not')) {
    const errors = validateNode(value, schema.not, root, path, refs, depth + 1, evaluation);
    if (!errors.length) return [`${path}:not`];
  }
  if (typeof value === 'string' && schema.pattern !== undefined && !compileSchemaPattern(schema.pattern).test(value))
    return [`${path}:pattern`];
  if (typeof value === 'string' &&
      (Number.isSafeInteger(schema.minLength) || Number.isSafeInteger(schema.maxLength))) {
    // JSON Schema counts Unicode code points, not UTF-16 code units or graphemes.
    // Iterate without allocating a second array proportional to the string size.
    let length = 0;
    for (const character of value) length++;
    if (Number.isSafeInteger(schema.minLength) && length < schema.minLength) return [`${path}:minLength`];
    if (Number.isSafeInteger(schema.maxLength) && length > schema.maxLength) return [`${path}:maxLength`];
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) return [`${path}:minimum`];
    if (typeof schema.maximum === 'number' && value > schema.maximum) return [`${path}:maximum`];
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) return [`${path}:exclusiveMinimum`];
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) return [`${path}:exclusiveMaximum`];
  }
  if (Array.isArray(value)) {
    if (Number.isSafeInteger(schema.minItems) && value.length < schema.minItems) return [`${path}:minItems`];
    if (Number.isSafeInteger(schema.maxItems) && value.length > schema.maxItems) return [`${path}:maxItems`];
    if (schema.uniqueItems === true && new Set(value.map(item => JSON.stringify(canonical(item)))).size !== value.length) return [`${path}:uniqueItems`];
    if (schema.items !== undefined) {
      for (let index = 0; index < value.length; index++) {
        const errors = validateNode(value[index], schema.items, root, `${path}[${index}]`, new Set(), depth + 1, evaluation); if (errors.length) return errors;
      }
    }
  }
  if (plain(value)) {
    if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== 'string'))) return [`${path}:required_invalid`];
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) return [`${path}.${key}:required`];
    const properties = plain(schema.properties) ? schema.properties : {};
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(schema, 'propertyNames')) {
        const errors = validateNode(key, schema.propertyNames, root, `${path}.${key}:propertyName`, new Set(), depth + 1, evaluation);
        if (errors.length) return errors;
      }
      if (Object.hasOwn(properties, key)) {
        const errors = validateNode(item, properties[key], root, `${path}.${key}`, new Set(), depth + 1, evaluation); if (errors.length) return errors;
      } else if (schema.additionalProperties === false) return [`${path}.${key}:additionalProperties`];
      else if (plain(schema.additionalProperties) || typeof schema.additionalProperties === 'boolean') {
        const errors = validateNode(item, schema.additionalProperties, root, `${path}.${key}`, new Set(), depth + 1, evaluation); if (errors.length) return errors;
      }
    }
  }
  return [];
}

function bazaarContractError(info, schema) {
  const input = info.input;
  if (!plain(input)) return 'INFO_INPUT_REQUIRED';
  if (input.type !== 'http' && input.type !== 'mcp') return 'INFO_INPUT_TYPE_INVALID';

  const rejected = mutate => {
    const witness = clone(info);
    mutate(witness);
    return validateNode(witness, schema, schema).length > 0;
  };
  const mustReject = (mutate, reason) => rejected(mutate) ? null : reason;
  const removeInput = mustReject(witness => { delete witness.input; }, 'SCHEMA_INPUT_NOT_REQUIRED');
  if (removeInput) return removeInput;
  const removeType = mustReject(witness => { delete witness.input.type; }, 'SCHEMA_INPUT_TYPE_NOT_REQUIRED');
  if (removeType) return removeType;
  for (const value of [input.type === 'http' ? 'mcp' : 'http', '__invalid__']) {
    const error = mustReject(witness => { witness.input.type = value; }, 'SCHEMA_INPUT_TYPE_NOT_CONSTRAINED');
    if (error) return error;
  }

  const outputError = () => {
    if (info.output === undefined) return null;
    if (!plain(info.output)) return 'INFO_OUTPUT_INVALID';
    if (typeof info.output.type !== 'string') return 'INFO_OUTPUT_TYPE_INVALID';
    if (info.output.format !== undefined && typeof info.output.format !== 'string')
      return 'INFO_OUTPUT_FORMAT_INVALID';
    const outputObject = mustReject(witness => { witness.output = []; }, 'SCHEMA_OUTPUT_NOT_CONSTRAINED');
    if (outputObject) return outputObject;
    const outputTypeRequired = mustReject(witness => { delete witness.output.type; }, 'SCHEMA_OUTPUT_TYPE_NOT_REQUIRED');
    if (outputTypeRequired) return outputTypeRequired;
    const outputType = mustReject(witness => { witness.output.type = 7; }, 'SCHEMA_OUTPUT_TYPE_NOT_CONSTRAINED');
    if (outputType) return outputType;
    if (info.output.format !== undefined) {
      const outputFormat = mustReject(witness => { witness.output.format = []; }, 'SCHEMA_OUTPUT_FORMAT_NOT_CONSTRAINED');
      if (outputFormat) return outputFormat;
    }
    // output.example is intentionally arbitrary JSON under the official contract.
    return null;
  };

  if (input.type === 'http') {
    if (typeof input.method !== 'string') return 'INFO_HTTP_METHOD_REQUIRED';
    const family = QUERY_METHODS.has(input.method) ? QUERY_METHODS : BODY_METHODS.has(input.method) ? BODY_METHODS : null;
    if (!family) return 'INFO_HTTP_METHOD_INVALID';
    const removeMethod = mustReject(witness => { delete witness.input.method; }, 'SCHEMA_HTTP_METHOD_NOT_REQUIRED');
    if (removeMethod) return removeMethod;
    const opposite = family === QUERY_METHODS ? BODY_METHODS : QUERY_METHODS;
    for (const value of [...opposite, '__invalid__']) {
      const error = mustReject(witness => { witness.input.method = value; }, 'SCHEMA_HTTP_METHOD_FAMILY_NOT_CONSTRAINED');
      if (error) return error;
    }
    if (family === BODY_METHODS) {
      if (!BODY_TYPES.has(input.bodyType)) return 'INFO_HTTP_BODY_TYPE_INVALID';
      if (!Object.hasOwn(input, 'body') || !plain(input.body))
        return 'INFO_HTTP_BODY_INVALID';
      for (const [field, reason] of [
        ['bodyType', 'SCHEMA_HTTP_BODY_TYPE_NOT_REQUIRED'],
        ['body', 'SCHEMA_HTTP_BODY_NOT_REQUIRED'],
      ]) {
        const error = mustReject(witness => { delete witness.input[field]; }, reason);
        if (error) return error;
      }
      const bodyType = mustReject(witness => { witness.input.bodyType = '__invalid__'; }, 'SCHEMA_HTTP_BODY_TYPE_NOT_CONSTRAINED');
      if (bodyType) return bodyType;
      for (const value of ['not-an-object', null, []]) {
        const error = mustReject(witness => { witness.input.body = value; }, 'SCHEMA_HTTP_BODY_NOT_CONSTRAINED');
        if (error) return error;
      }
    }
    for (const [field, label] of [
      ['queryParams', 'QUERY_PARAMS'],
      ['pathParams', 'PATH_PARAMS'],
    ]) {
      if (input[field] === undefined) continue;
      if (!plain(input[field])) return `INFO_HTTP_${label}_INVALID`;
      const error = mustReject(
        witness => { witness.input[field] = []; },
        `SCHEMA_HTTP_${label}_NOT_CONSTRAINED`,
      );
      if (error) return error;
    }
    if (input.headers !== undefined) {
      if (!plain(input.headers) || Object.values(input.headers).some(value => typeof value !== 'string'))
        return 'INFO_HTTP_HEADERS_INVALID';
      const objectError = mustReject(
        witness => { witness.input.headers = []; },
        'SCHEMA_HTTP_HEADERS_NOT_CONSTRAINED',
      );
      if (objectError) return objectError;
      const [acceptedHeader = 'x-contract-witness'] = Object.keys(input.headers);
      const valueError = mustReject(
        witness => { witness.input.headers = { ...witness.input.headers, [acceptedHeader]: 7 }; },
        'SCHEMA_HTTP_HEADER_VALUES_NOT_CONSTRAINED',
      );
      if (valueError) return valueError;
    }
    return outputError();
  }

  if (typeof input.toolName !== 'string' || input.toolName.length === 0) return 'INFO_MCP_TOOL_NAME_INVALID';
  if (!plain(input.inputSchema)) return 'INFO_MCP_INPUT_SCHEMA_INVALID';
  // Bazaar's MCP contract is the MCP Tool.inputSchema object-root subset, not
  // merely any JSON object carried under the inputSchema field.
  if (input.inputSchema.type !== 'object') return 'INFO_MCP_INPUT_SCHEMA_TYPE_INVALID';
  if (input.inputSchema.properties !== undefined) {
    if (!plain(input.inputSchema.properties) ||
        Object.values(input.inputSchema.properties).some(value => !plain(value) && typeof value !== 'boolean')) {
      return 'INFO_MCP_INPUT_SCHEMA_PROPERTIES_INVALID';
    }
  }
  if (input.inputSchema.required !== undefined) {
    const required = input.inputSchema.required;
    if (!Array.isArray(required) || required.some(value => typeof value !== 'string') ||
        new Set(required).size !== required.length) {
      return 'INFO_MCP_INPUT_SCHEMA_REQUIRED_INVALID';
    }
  }
  const inputSchemaInspection = inspectSchemaDocument(input.inputSchema);
  if (inputSchemaInspection) return `INFO_MCP_INPUT_SCHEMA_INVALID:${inputSchemaInspection}`;
  for (const [field, reason] of [
    ['toolName', 'SCHEMA_MCP_TOOL_NAME_NOT_REQUIRED'],
    ['inputSchema', 'SCHEMA_MCP_INPUT_SCHEMA_NOT_REQUIRED'],
  ]) {
    const error = mustReject(witness => { delete witness.input[field]; }, reason);
    if (error) return error;
  }
  const toolName = mustReject(witness => { witness.input.toolName = 7; }, 'SCHEMA_MCP_TOOL_NAME_NOT_CONSTRAINED');
  if (toolName) return toolName;
  for (const value of ['not-an-object', []]) {
    const error = mustReject(witness => { witness.input.inputSchema = value; }, 'SCHEMA_MCP_INPUT_SCHEMA_NOT_CONSTRAINED');
    if (error) return error;
  }
  if (input.transport !== undefined) {
    if (!MCP_TRANSPORTS.has(input.transport)) return 'INFO_MCP_TRANSPORT_INVALID';
    const transport = mustReject(witness => { witness.input.transport = '__invalid__'; }, 'SCHEMA_MCP_TRANSPORT_NOT_CONSTRAINED');
    if (transport) return transport;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== 'string') return 'INFO_MCP_DESCRIPTION_INVALID';
    const description = mustReject(
      witness => { witness.input.description = 7; },
      'SCHEMA_MCP_DESCRIPTION_NOT_CONSTRAINED',
    );
    if (description) return description;
  }
  if (input.example !== undefined) {
    if (!plain(input.example)) return 'INFO_MCP_EXAMPLE_INVALID';
    const example = mustReject(
      witness => { witness.input.example = []; },
      'SCHEMA_MCP_EXAMPLE_NOT_CONSTRAINED',
    );
    if (example) return example;
  }
  return outputError();
}

export function validateBazaarExtension(extension) {
  if (!plain(extension?.info) || !plain(extension?.schema)) return { ok: false, reason: 'BAZAAR_EXTENSION_INVALID' };
  let bytes;
  try { bytes = Buffer.byteLength(JSON.stringify(extension.schema), 'utf8'); }
  catch { return { ok: false, reason: 'SCHEMA_NOT_SERIALIZABLE' }; }
  if (bytes > 32_768) return { ok: false, reason: 'SCHEMA_SIZE_LIMIT' };
  if (extension.schema.$schema !== DRAFT) return { ok: false, reason: 'SCHEMA_DRAFT_REQUIRED' };
  const inspection = inspectSchemaDocument(extension.schema);
  if (inspection) return { ok: false, reason: inspection };
  try {
    const errors = validateNode(extension.info, extension.schema, extension.schema);
    if (errors.length) return { ok: false, reason: 'INFO_SCHEMA_MISMATCH', errors };
    const contract = bazaarContractError(extension.info, extension.schema);
    return contract
      ? { ok: false, reason: 'BAZAAR_SCHEMA_CONTRACT_MISMATCH', errors: [contract] }
      : { ok: true };
  } catch (error) {
    // Schema errors propagate through all combinators instead of becoming an instance mismatch.
    return { ok: false, reason: error.message };
  }
}

