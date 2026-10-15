// SPDX-License-Identifier: MIT
// Focused offline probe for optional fields in the official x402 Bazaar discovery contract.
import assert from 'node:assert/strict';
import { validateBazaarExtension } from './schema-validation.mjs';

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';

function schemaFor(type, inputProperties = {}, output) {
  const core = type === 'http'
    ? { type: { const: 'http' }, method: { type: 'string', enum: ['GET', 'HEAD', 'DELETE'] } }
    : { type: { const: 'mcp' }, toolName: { type: 'string' }, inputSchema: { type: 'object' } };
  const required = type === 'http' ? ['type', 'method'] : ['type', 'toolName', 'inputSchema'];
  return {
    $schema: DRAFT,
    type: 'object',
    required: ['input'],
    properties: {
      input: { type: 'object', required, properties: { ...core, ...inputProperties } },
      ...(output === undefined ? {} : { output }),
    },
  };
}

const httpInput = {
  type: 'http', method: 'GET', queryParams: { port: 'Reykjavik' },
  pathParams: { vesselId: 'v-7' }, headers: { 'x-region': 'north' },
};
const mcpInput = {
  type: 'mcp', toolName: 'inspect_vessel', description: 'Inspect a vessel',
  inputSchema: { type: 'object', properties: { vesselId: { type: 'string' } } },
  example: { vesselId: 'v-7' },
};
const strictOutput = {
  type: 'object', required: ['type'],
  properties: { type: { type: 'string' }, format: { type: 'string' }, example: {} },
};
const strictHTTP = schemaFor('http', {
  queryParams: { type: 'object' }, pathParams: { type: 'object' },
  headers: { type: 'object', additionalProperties: { type: 'string' } },
}, strictOutput);
const strictMCP = schemaFor('mcp', {
  description: { type: 'string' }, example: { type: 'object' },
}, strictOutput);

for (const example of [null, ['arbitrary'], { nested: true }, 7]) {
  assert.deepEqual(validateBazaarExtension({
    info: { input: structuredClone(httpInput), output: { type: 'json', format: 'application/json', example } },
    schema: strictHTTP,
  }), { ok: true });
}
assert.deepEqual(validateBazaarExtension({
  info: { input: mcpInput, output: { type: 'text', format: 'mcp-content', example: null } },
  schema: strictMCP,
}), { ok: true });
assert.deepEqual(validateBazaarExtension({
  info: { input: { type: 'http', method: 'GET' } }, schema: schemaFor('http'),
}), { ok: true });
assert.deepEqual(validateBazaarExtension({
  info: { input: { type: 'mcp', toolName: 'minimal', inputSchema: { type: 'object' } } },
  schema: schemaFor('mcp'),
}), { ok: true });

const runtimeCases = [
  ['HTTP queryParams', { ...httpInput, queryParams: [] }, schemaFor('http', {
    queryParams: {}, pathParams: { type: 'object' },
    headers: { type: 'object', additionalProperties: { type: 'string' } },
  }), 'INFO_HTTP_QUERY_PARAMS_INVALID'],
  ['HTTP pathParams', { ...httpInput, pathParams: 'bad' }, schemaFor('http', {
    queryParams: { type: 'object' }, pathParams: {},
    headers: { type: 'object', additionalProperties: { type: 'string' } },
  }), 'INFO_HTTP_PATH_PARAMS_INVALID'],
  ['HTTP headers object', { ...httpInput, headers: [] }, schemaFor('http', {
    queryParams: { type: 'object' }, pathParams: { type: 'object' }, headers: {},
  }), 'INFO_HTTP_HEADERS_INVALID'],
  ['HTTP header values', { ...httpInput, headers: { accept: 7 } }, schemaFor('http', {
    queryParams: { type: 'object' }, pathParams: { type: 'object' }, headers: {},
  }), 'INFO_HTTP_HEADERS_INVALID'],
  ['MCP description', { ...mcpInput, description: 7 }, schemaFor('mcp', {
    description: {}, example: { type: 'object' },
  }), 'INFO_MCP_DESCRIPTION_INVALID'],
  ['MCP example', { ...mcpInput, example: [] }, schemaFor('mcp', {
    description: { type: 'string' }, example: {},
  }), 'INFO_MCP_EXAMPLE_INVALID'],
];
const observedRuntime = [];
for (const [name, input, schema, expected] of runtimeCases) {
  const result = validateBazaarExtension({ info: { input }, schema });
  assert.equal(result.ok, false, name);
  assert.equal(result.reason, 'BAZAAR_SCHEMA_CONTRACT_MISMATCH', name);
  assert.deepEqual(result.errors, [expected], name);
  observedRuntime.push(expected);
}
for (const [name, output, expected] of [
  ['output object', [], 'INFO_OUTPUT_INVALID'],
  ['output type', { type: 7 }, 'INFO_OUTPUT_TYPE_INVALID'],
  ['output format', { type: 'json', format: [] }, 'INFO_OUTPUT_FORMAT_INVALID'],
]) {
  const result = validateBazaarExtension({
    info: { input: { type: 'http', method: 'GET' }, output },
    schema: schemaFor('http', {}, {}),
  });
  assert.equal(result.ok, false, name);
  assert.equal(result.reason, 'BAZAAR_SCHEMA_CONTRACT_MISMATCH', name);
  assert.deepEqual(result.errors, [expected], name);
  observedRuntime.push(expected);
}

const witnessCases = [
  ['queryParams schema', { input: httpInput }, schemaFor('http', { queryParams: {}, pathParams: { type: 'object' }, headers: { type: 'object', additionalProperties: { type: 'string' } } }), 'SCHEMA_HTTP_QUERY_PARAMS_NOT_CONSTRAINED'],
  ['pathParams schema', { input: httpInput }, schemaFor('http', { queryParams: { type: 'object' }, pathParams: {}, headers: { type: 'object', additionalProperties: { type: 'string' } } }), 'SCHEMA_HTTP_PATH_PARAMS_NOT_CONSTRAINED'],
  ['headers schema', { input: httpInput }, schemaFor('http', { queryParams: { type: 'object' }, pathParams: { type: 'object' }, headers: {} }), 'SCHEMA_HTTP_HEADERS_NOT_CONSTRAINED'],
  ['header values schema', { input: httpInput }, schemaFor('http', { queryParams: { type: 'object' }, pathParams: { type: 'object' }, headers: { type: 'object' } }), 'SCHEMA_HTTP_HEADER_VALUES_NOT_CONSTRAINED'],
  ['header values behind propertyNames', { input: httpInput }, schemaFor('http', {
    queryParams: { type: 'object' }, pathParams: { type: 'object' },
    headers: { type: 'object', propertyNames: { enum: ['x-region'] } },
  }), 'SCHEMA_HTTP_HEADER_VALUES_NOT_CONSTRAINED'],
  ['description schema', { input: mcpInput }, schemaFor('mcp', { description: {}, example: { type: 'object' } }), 'SCHEMA_MCP_DESCRIPTION_NOT_CONSTRAINED'],
  ['example schema', { input: mcpInput }, schemaFor('mcp', { description: { type: 'string' }, example: {} }), 'SCHEMA_MCP_EXAMPLE_NOT_CONSTRAINED'],
  ['output object schema', { input: { type: 'http', method: 'GET' }, output: { type: 'json' } }, schemaFor('http', {}, {}), 'SCHEMA_OUTPUT_NOT_CONSTRAINED'],
  ['output type required', { input: { type: 'http', method: 'GET' }, output: { type: 'json' } }, schemaFor('http', {}, { type: 'object', properties: { type: { type: 'string' } } }), 'SCHEMA_OUTPUT_TYPE_NOT_REQUIRED'],
  ['output type schema', { input: { type: 'http', method: 'GET' }, output: { type: 'json' } }, schemaFor('http', {}, { type: 'object', required: ['type'], properties: { type: {} } }), 'SCHEMA_OUTPUT_TYPE_NOT_CONSTRAINED'],
  ['output format schema', { input: { type: 'http', method: 'GET' }, output: { type: 'json', format: 'application/json' } }, schemaFor('http', {}, { type: 'object', required: ['type'], properties: { type: { type: 'string' }, format: {} } }), 'SCHEMA_OUTPUT_FORMAT_NOT_CONSTRAINED'],
];
const observedWitnesses = [];
for (const [name, info, schema, expected] of witnessCases) {
  const result = validateBazaarExtension({ info, schema });
  assert.equal(result.ok, false, name);
  assert.equal(result.reason, 'BAZAAR_SCHEMA_CONTRACT_MISMATCH', name);
  assert.deepEqual(result.errors, [expected], name);
  observedWitnesses.push(expected);
}

console.log(JSON.stringify({
  validHTTP: true,
  validMCP: true,
  arbitraryOutputExamples: 4,
  runtimeRejected: observedRuntime,
  schemaWitnessesRejected: observedWitnesses,
}));
