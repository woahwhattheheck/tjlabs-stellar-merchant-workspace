// MIT. Paged worksheet review and exact file selections on an existing platform client.
import { qboWorksheetFileProperties, qboWorksheetFileSelectors, qboWorksheetFileNames } from './catalog/accounting-qbo-worksheets.mjs';
const SCHEMA = 'stellar-forge.accounting-qbo-worksheet-client.v1';
const SHA = /^[a-f0-9]{64}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function need(ok, message) {
  if (!ok) throw Object.assign(new Error(message), { code: 'ACCOUNTING_QBO_WORKSHEET_CLIENT_REPLY' });
}
function matches(value, rule) {
  return typeof value === rule.type && (!rule.enum || rule.enum.includes(value)) &&
    (!rule.pattern || new RegExp(rule.pattern).test(value));
}
function original(client) {
  need(client?.platform === 'qbo' && typeof client.workspace === 'string' && typeof client.read === 'function',
    'Use the existing selected QuickBooks accounting platform client.');
}

/** Select a complete original file using the source/result pins returned by its native view. */
export function qboWorksheetFileSelection(inventory, name) {
  need(plain(inventory) && inventory.schema === SCHEMA &&
    ['export', 'open', 'inspect', 'plan-input'].includes(inventory.action) && SHA.test(inventory.resultSha256),
    'Keep the complete original worksheet response, with its file inventory and source/result digests.');
  need(qboWorksheetFileNames.includes(name) && Array.isArray(inventory.files),
    'Choose the exact original filename from that worksheet response.');
  const found = inventory.files.filter(row => row?.name === name);
  need(found.length === 1, 'The original file inventory must contain this filename exactly once.');
  const file = found[0], selected = file.selection;
  need(plain(selected) && Object.keys(selected).every(key => ['kind', 'file', ...qboWorksheetFileSelectors].includes(key)) &&
    selected.kind === 'qbo-worksheet' && selected.file === name &&
    selected.worksheetAction === inventory.action && selected.worksheetResultSha256 === inventory.resultSha256,
    'The download selection belongs to another original worksheet result.');
  for (const [key, rule] of Object.entries(qboWorksheetFileProperties)) {
    if (Object.hasOwn(selected, key)) need(matches(selected[key], rule), 'The original file selector is invalid: ' + key + '.');
  }
  for (const [fileKey, inputKey] of [
    ['worksheetSource', 'source'], ['worksheetSourceSha256', 'sourceSha256'],
    ['worksheetReturnedSource', 'returnedSource'], ['worksheetReturnedSourceSha256', 'returnedSourceSha256'],
    ['worksheetCompanySource', 'companySource'], ['worksheetCompanySourceSha256', 'companySourceSha256'],
  ]) need(selected[fileKey] === inventory[inputKey], 'The file selection differs from its retained original input: ' + inputKey + '.');
  need(typeof selected.worksheetSource === 'string' && SHA.test(selected.worksheetSourceSha256) &&
    SHA.test(file.sha256) && Number.isSafeInteger(file.bytes) && file.bytes >= 0 && file.bytes <= 512 * 1024 * 1024 &&
    typeof file.contentType === 'string', 'The complete original file identity is missing or exceeds the retained reader limit.');
  return { selection: structuredClone(selected), expectedSha256: file.sha256, name, bytes: file.bytes,
    contentType: file.contentType, workspace: inventory.workspace, resultSha256: inventory.resultSha256 };
}

/** Page every selected native row while holding the first complete source/result identity.
 * A changed source or returned file stops the iteration; no partial list is presented as complete.
 */
export async function* qboWorksheetPages(client, action, args, { view = 'rows', pageSize = 200,
  expectedResultSha256, ...options } = {}) {
  original(client);
  need(['export', 'open', 'inspect', 'plan-preview'].includes(action) && plain(args) &&
    !['view', 'offset', 'limit'].some(key => Object.hasOwn(args, key)),
    'Choose the original worksheet read and source arguments; select its complete view through the paging options.');
  need(Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= 200 &&
    (expectedResultSha256 === undefined || SHA.test(expectedResultSha256)), 'Use a page size of 1–200 and the optional exact reviewed result SHA256.');
  let selected = structuredClone(args), offset = 0, total = null, expected = expectedResultSha256;
  for (;;) {
    options.requestSignal?.throwIfAborted();
    const result = await client.read('worksheet-' + action, { ...selected, view, offset, limit: pageSize }, options);
    need(result?.schema === SCHEMA && result.workspace === client.workspace &&
      result.action === (action === 'plan-preview' ? 'plan-input' : action) && SHA.test(result.resultSha256),
      'The page is not the original selected worksheet response.');
    expected ??= result.resultSha256;
    need(result.resultSha256 === expected, 'The complete worksheet source or inspected result changed between pages. Preserve the prior pages and start a new reviewed view.');
    for (const alias of ['source', 'returnedSource', 'companySource']) {
      const checksum = alias + 'Sha256';
      if (selected[alias] !== undefined) {
        need(result[alias] === selected[alias] && SHA.test(result[checksum]) &&
          (selected[checksum] === undefined || selected[checksum] === result[checksum]),
          'The paged original input changed: ' + alias + '.');
        selected[checksum] = result[checksum];
      } else need(result[alias] === undefined, 'The page introduced another original input alias.');
    }
    const chunk = result.page;
    need(plain(chunk) && chunk.view === view && chunk.offset === offset && chunk.limit === pageSize &&
      Number.isSafeInteger(chunk.total) && chunk.total >= 0 && Array.isArray(chunk.items) &&
      chunk.items.length === Math.min(pageSize, Math.max(0, chunk.total - offset)),
      'The native worksheet page is incomplete or has inconsistent offsets.');
    total ??= chunk.total;
    need(total === chunk.total && offset <= total, 'The original worksheet row inventory changed during paging.');
    yield result;
    offset += chunk.items.length;
    if (offset === total) return;
  }
}
