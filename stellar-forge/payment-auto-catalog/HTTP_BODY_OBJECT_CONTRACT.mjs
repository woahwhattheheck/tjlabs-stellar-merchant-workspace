import assert from 'node:assert/strict';
import { validateBazaarExtension } from './schema-validation.mjs';

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const METHODS = ['POST', 'PUT', 'PATCH'];
const BODY_TYPES = ['json', 'form-data', 'text'];

function extension({ method = 'POST', bodyType = 'json', body = { value: 'ok' }, bodySchema = { type: 'object' } } = {}) {
  return {
    info: {
      input: { type: 'http', method, bodyType, body },
      output: { type: 'json' },
    },
    schema: {
      $schema: DRAFT,
      type: 'object',
      properties: {
        input: {
          type: 'object',
          properties: {
            type: { type: 'string', const: 'http' },
            method: { type: 'string', enum: METHODS },
            bodyType: { type: 'string', enum: BODY_TYPES },
            body: bodySchema,
          },
          required: ['type', 'method', 'bodyType', 'body'],
          additionalProperties: false,
        },
        output: {
          type: 'object',
          properties: { type: { type: 'string' } },
          required: ['type'],
          additionalProperties: false,
        },
      },
      required: ['input'],
      additionalProperties: false,
    },
  };
}

const accepted = [];
for (const method of METHODS) {
  for (const bodyType of BODY_TYPES) {
    const result = validateBazaarExtension(extension({ method, bodyType }));
    assert.deepEqual(result, { ok: true }, `${method}/${bodyType} object body must remain valid`);
    accepted.push(`${method}:${bodyType}`);
  }
}

const invalidBodies = ['plain text', [], null];
const rejectedRuntime = [];
for (const body of invalidBodies) {
  const schema = typeof body === 'string' ? { type: 'string' } : Array.isArray(body) ? { type: 'array' } : { type: 'null' };
  const result = validateBazaarExtension(extension({ body, bodySchema: schema }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'BAZAAR_SCHEMA_CONTRACT_MISMATCH');
  assert.deepEqual(result.errors, ['INFO_HTTP_BODY_INVALID']);
  rejectedRuntime.push(body === null ? 'null' : Array.isArray(body) ? 'array' : 'string');
}

const permissive = validateBazaarExtension(extension({ bodySchema: {} }));
assert.equal(permissive.ok, false);
assert.equal(permissive.reason, 'BAZAAR_SCHEMA_CONTRACT_MISMATCH');
assert.deepEqual(permissive.errors, ['SCHEMA_HTTP_BODY_NOT_CONSTRAINED']);

console.log(JSON.stringify({
  source: 'x402-foundation/x402@faa1c694c66a3732aaabbce93bdae140e521a67d',
  accepted,
  rejectedRuntime,
  rejectedSchema: permissive.errors[0],
}));
