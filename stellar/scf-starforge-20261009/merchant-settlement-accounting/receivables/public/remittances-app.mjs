import {RemittancesClient} from './remittances-client.mjs';

const $ = id => document.getElementById(id);
let api, identity, review = null, request = null, busy = false;
function message(text,error = false) { $('status').textContent = text;$('status').dataset.error = String(error); }
function buttonState() {
  $('apply').disabled = busy || !(request || review?.review.canApply);
  $('save-request').disabled = busy || !(request || review?.review.canApply);
}
async function operate(work) {
  if (busy) return;
  busy = true;buttonState();
  try { await work(); } catch (error) { message((error.code ? error.code+': ' : '')+error.message,true); }
  finally { busy = false;buttonState(); }
}
function download(name,content,type) {
  const url = URL.createObjectURL(new Blob([content],{type}));
  const link = document.createElement('a');link.href = url;link.download = name;link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
const labels = {READY_NEW_RECEIPT:'New receipt',READY_EXISTING_RECEIPT:'Use existing receipt',ALREADY_IMPORTED:'Already received',CONFLICT:'Review conflict'};
function cells(row,values) { for (const value of values) {const cell = document.createElement('td');cell.textContent = value ?? '';row.append(cell);} }
function renderReview(value) {
  const selected = value.review,body = $('review-table').querySelector('tbody');body.replaceChildren();
  $('review-table').hidden = false;
  $('summary').replaceChildren();
  const summary = document.createElement('p');
  summary.textContent = selected.recordCount+' rows · '+selected.newReceiptCount+' new receipts · '+
    selected.allocationCount+' allocations · '+selected.alreadyImportedCount+' already imported · '+selected.conflictCount+' conflicts';
  $('summary').append(summary);
  const original = document.createElement('p');
  original.textContent = 'Source: '+selected.sourceId+' / '+selected.filename+' · '+selected.sourceBytes+' bytes';
  $('summary').append(original);
  for (const group of selected.groups) {
    const row = document.createElement('tr');
    const allocations = group.allocations.map(item => item.invoiceNumber+' — '+item.amount+' on '+item.allocatedDate).join('\n');
    cells(row,[group.remittanceId,(group.customerName ?? group.customerReference)+'\n'+group.customerReference,
      group.reference+'\n'+group.amount+' '+group.currency.code+' ('+group.currency.scale+' places)',
      (labels[group.status] ?? group.status)+(group.message ? '\n'+group.message : '')+(group.batchId ? '\nOriginal batch: '+group.batchId : ''),allocations || 'Unapplied receipt',
      group.availableAfter === undefined ? '' : group.availableAfter+' as of '+group.availableAsOf]);
    body.append(row);
  }
  $('row-errors').hidden = selected.errors.length === 0;
  $('row-errors').textContent = selected.errors.map(error => 'Record '+error.record+': '+error.code+' — '+error.message).join('\n');
}
function currentRequest() {
  if (!request) {
    if (!review?.review.canApply) throw new Error('Review a conflict-free remittance first.');
    const actor = $('actor').value.trim();
    if (!actor) throw new Error('Enter the operator name.');
    request = {workspaceId:review.workspaceId,revision:review.revision,source:review.source,
      reviewSha256:review.reviewSha256,actor,requestId:'remittance-'+crypto.randomUUID()};
  }
  $('recover-id').value = request.requestId;
  $('request-status').textContent = 'Original request: '+request.requestId;
  return request;
}
async function showBatch(id) {
  const result = await api.detail(id),article = $('batch-detail');
  article.replaceChildren();article.hidden = false;
  const title = document.createElement('h3');title.textContent = result.batch.filename;article.append(title);
  const text = document.createElement('p');text.textContent = result.batch.sourceId+' · '+result.batch.appliedAt+' · '+result.batch.actor;article.append(text);
  const links = document.createElement('div');links.className = 'downloads';
  for (const name of result.files) {const link = document.createElement('a');link.href = api.fileUrl(id,name);link.textContent = name;links.append(link);}
  article.append(links);
  const summary = document.createElement('p');summary.textContent = result.allocationIds.length+' retained allocations; '+result.newReceiptIds.length+' new receipts. Original invoice and payment histories remain in the receivables desk.';article.append(summary);
}
async function refresh() {
  identity = await api.list();
  const target = $('batches');target.replaceChildren();
  if (!identity.batches.length) {target.textContent = 'No remittance batches have been received.';return;}
  for (const batch of identity.batches) {
    const row = document.createElement('div');row.className = 'batch';
    const text = document.createElement('p');text.textContent = batch.filename+' · '+batch.sourceId+'\n'+
      batch.appliedAt+' · '+batch.allocationCount+' allocations · '+batch.newReceiptCount+' new receipts';
    const open = document.createElement('button');open.type = 'button';open.textContent = 'Open batch';
    open.addEventListener('click',() => operate(() => showBatch(batch.id)));row.append(text,open);target.append(row);
  }
}
$('source-form').addEventListener('submit',event => {
  event.preventDefault();operate(async () => {
    if (!identity) throw new Error('Open the original accounting workspace before reviewing a CSV.');
    const file = $('csv-file').files[0];if (!file) throw new Error('Choose the original remittance CSV.');
    if (file.size > 500000) throw new Error('Choose a CSV of at most 500,000 bytes.');
    const bytes = await file.arrayBuffer();
    let csv;try { csv = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes); }
    catch { throw new Error('Save this remittance as UTF-8 CSV.'); }
    const sourceId = $('source-id').value.trim();if (!sourceId) throw new Error('Enter the stable source identifier.');
    review = await api.preview({workspaceId:identity.workspaceId,source:{sourceId,filename:file.name,csv}});
    request = null;$('request-status').textContent = '';renderReview(review);
    message(review.review.canApply ? 'Review the exact receipts and allocations, then receive the batch.' :
      'Resolve the listed source or account conflicts and review the corrected CSV.',!review.review.canApply);
  });
});
$('apply').addEventListener('click',() => operate(async () => {
  const original = currentRequest();
  message('Receiving the original reviewed batch…');
  const result = await api.apply(original);
  const replay = result.operation?.replayed ? ' Recovered the previously saved operation.' : '';
  message('Received '+result.remittanceBatch.filename+'.'+replay);
  $('request-status').textContent = 'Saved request: '+original.requestId;
  request = null;review = null;await refresh();await showBatch(result.remittanceBatch.id);
}));
$('save-request').addEventListener('click',() => operate(async () => {
  const original = currentRequest();
  download(original.requestId+'.json',JSON.stringify(original,null,2)+'\n','application/json');
  message('Reviewed request saved. Keep this file to recover the same operation after reopening.');
}));
$('request-file').addEventListener('change',() => operate(async () => {
  const file = $('request-file').files[0];if (!file) return;
  if (file.size > 2000000) throw new Error('Choose an original reviewed request within the document limit.');
  const value = JSON.parse(await file.text());
  if (value?.workspaceId !== identity.workspaceId || typeof value.requestId !== 'string' || !value.source ||
    typeof value.reviewSha256 !== 'string' || typeof value.actor !== 'string') throw new Error('Choose the original reviewed request for this workspace.');
  request = value;review = null;$('actor').value = value.actor;$('source-id').value = value.source.sourceId;
  $('recover-id').value = value.requestId;$('request-status').textContent = 'Recovered request: '+value.requestId;
  $('review-table').hidden = true;$('row-errors').hidden = true;
  $('summary').textContent = 'Original reviewed request '+value.requestId+' for '+value.source.filename+
    '. Find its saved operation or retry it unchanged with Receive batch.';
  message('Original request loaded. Its saved revision and source digest are retained.');
}));
$('recover').addEventListener('click',() => operate(async () => {
  const id = $('recover-id').value.trim();if (!id) throw new Error('Enter the original request identifier.');
  const result = await api.operation(id);
  message('Found saved operation '+id+'.');await refresh();await showBatch(result.remittanceBatch.id);
  if (request?.requestId === id) {request = null;review = null;}
}));
$('refresh').addEventListener('click',() => operate(async () => {await refresh();message('Saved remittance batches refreshed.');}));
$('template').addEventListener('click',() => download('remittance-columns.csv',
  'remittance_id,customer_reference,payment_reference,payment_method,payment_date,currency,scale,payment_amount,invoice_number,allocation_amount,allocation_date\r\n','text/csv'));
await operate(async () => {
  const response = await fetch('./config.json',{cache:'no-store'});
  if (!response.ok) throw new Error('Open remittance receiving from the original receivables workspace.');
  const config = await response.json();api = new RemittancesClient(config.apiPath);
  await refresh();message('Original accounting workspace opened. Choose a remittance CSV to review.');
});
