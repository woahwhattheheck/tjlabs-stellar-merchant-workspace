// MIT. Original SDK interpretation of one complete received public document.
// This worker exposes no network transport and sends no merchant input.
import {parentPort, workerData} from 'node:worker_threads';
import {normalizeSupportedResponse} from './facilitator-supported.mjs';

function errorRecord(error, seen = new Set()) {
  if (error === null || typeof error !== 'object') return {message:String(error)};
  if (seen.has(error)) return {circular:true};
  seen.add(error);
  return {name:error.name ?? 'Error', message:String(error.message ?? error),
    ...(error.code === undefined ? {} : {code:error.code}),
    ...(error.stack === undefined ? {} : {stack:error.stack}),
    ...(error.cause === undefined ? {} : {cause:errorRecord(error.cause, seen)})};
}
try {
  const response = normalizeSupportedResponse(workerData);
  let reads = 0;
  globalThis.fetch = async (input, options) => {
    const request = new Request(input, options);
    if (request.url !== response.url || request.method !== 'GET' || request.body !== null ||
        [...request.headers.keys()].some(name => name !== 'content-type') || ++reads !== 1)
      throw Object.assign(new Error('The original SDK requested something other than this received supported document.'),
        {code:'FACILITATOR_RESPONSE_TRANSPORT'});
    return new Response(Buffer.from(response.body.data, 'base64'), {
      status:200, headers:{'content-type':response.body.contentType}
    });
  };
  const {HTTPFacilitatorClient} = await import('@x402/core/server');
  const client = new HTTPFacilitatorClient({
    url:response.url.slice(0, -'/supported'.length), timeoutMs:30000
  });
  const supported = await client.getSupported();
  if (reads !== 1) throw new Error('The original SDK did not read the received supported response.');
  parentPort.postMessage({ok:true, supported});
} catch (error) {
  parentPort.postMessage({ok:false, error:errorRecord(error)});
} finally { parentPort.close(); }
