// MIT. Additive helpers on the original authenticated grant-portfolio client.
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const need = (ok, message) => { if (!ok) throw new TypeError(message); };
const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
function common(client, input) {
  need(client && typeof client.action === 'function', 'Use the existing grant-portfolio client.');
  need(object(input) && typeof input.operationId === 'string' && object(input.portfolio),
    'Retain the original operation and selected portfolio.');
  need(typeof input.actor === 'string' && input.actor.trim(), 'Retain the actual operator.');
  need(typeof input.portfolio.id === 'string' && Number.isSafeInteger(input.portfolio.revision) &&
    input.portfolio.revision > 0 && HASH.test(input.portfolio.snapshot), 'Select the exact original portfolio revision.');
}
export function runStaffProgramme(client, input, options) {
  common(client, input);
  need(HASH.test(input.programmeObject) && object(input.profileIds) && Object.keys(input.profileIds).length &&
    Object.values(input.profileIds).every(x => typeof x === 'string' && x), 'Select the uploaded complete programme and actual local actor profiles.');
  const payload = {actor:input.actor, portfolio:input.portfolio,
    programmeObject:input.programmeObject, profileIds:input.profileIds};
  return client.action({operationId:input.operationId, action:'dataverse.staff.programme', payload,
    ...(input.expectedRevision === undefined ? {} : {expectedRevision:input.expectedRevision})}, options);
}
export function captureStaffHistory(client, input, options) {
  common(client, input);
  need(typeof input.profileId === 'string' && typeof input.entity === 'string' &&
    UUID.test(input.projectRecordId) && UUID.test(input.commandOperationId) &&
    Number.isSafeInteger(input.historyStateVersion) && input.historyStateVersion > 0,
    'Select the actual completed native command/history.');
  const payload = Object.fromEntries(['actor','portfolio','profileId','entity','projectRecordId',
    'commandOperationId','historyStateVersion'].map(key => [key, input[key]]));
  return client.action({operationId:input.operationId, action:'dataverse.staff.capture', payload,
    ...(input.expectedRevision === undefined ? {} : {expectedRevision:input.expectedRevision})}, options);
}
export function resumeStaffOperation(client, operationId, options) {
  need(client && typeof client.resume === 'function' && typeof operationId === 'string',
    'Resume the original admitted operation through its existing client.');
  return client.resume(operationId, options);
}
