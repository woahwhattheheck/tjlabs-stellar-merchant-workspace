const $ = id => document.getElementById(id);
let working = false, busy = false, timer;
function notice(message) { $('notice').textContent = message || ''; }
async function request(path, method = 'GET', headers = {}) {
  const response = await fetch(path, { method, headers, ...(method === 'POST' ? { body: '{}' } : {}) });
  if (response.status === 204) return null;
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Unable to complete this action.');
  return value;
}
function render(value) {
  const job = value.job; busy = value.receiving;
  $('state').textContent = busy ? 'Receiving' : job.state;
  $('job-id').textContent = job.id;
  $('source').textContent = job.sourceKind === 'SF88_SAVED_HTTP_RESPONSE' ? 'Original saved buyer response' : 'Retained job document';
  $('response').textContent = job.latestObservation ? 'HTTP ' + job.latestObservation.httpStatus + ' · ' +
    (job.latestObservation.providerStatus || 'Status unavailable') : 'Awaiting status response';
  $('retained').textContent = new Date(job.retainedAt).toLocaleString();
  $('next-poll').textContent = job.nextPollAt ? new Date(job.nextPollAt).toLocaleTimeString() : 'Ready';
  const delivered = Boolean(job.delivery);
  $('empty-result').hidden = delivered; $('result-info').hidden = !delivered; $('download').hidden = !delivered; $('video').hidden = !delivered;
  if (delivered) {
    $('result-bytes').textContent = job.delivery.bytes.toLocaleString() + ' bytes · ' + job.delivery.contentType;
    $('result-hash').textContent = job.delivery.sha256;
    if (!$('video').hasAttribute('src')) $('video').src = '/api/video';
  }
  $('poll').disabled = working || busy || delivered; $('receive').disabled = working || busy || delivered;
  $('pause').disabled = working || !busy; $('export').disabled = working || busy;
  $('archive').hidden = !value.archive;
  if (value.archive) $('archive-info').textContent = value.archive.bytes.toLocaleString() + ' bytes · SHA-256 ' + value.archive.sha256;
  const error = value.lastError || job.lastReceivingError?.code || job.latestObservation?.error;
  if (error) notice(error.replaceAll('_', ' '));
}
async function refresh() {
  try { render(await request('/api/status')); }
  catch (error) { notice(error.message === 'VIDEO_OPERATOR_AUTH_REQUIRED' ?
    'Open the current operator URL from the terminal to continue.' : error.message); }
}
for (const action of ['poll', 'receive', 'pause', 'export']) {
  $(action).addEventListener('click', async () => {
    if (working) return;
    working = true; notice(''); await refresh();
    try { render(await request('/api/' + action, 'POST')); }
    catch (error) { notice(error.message.replaceAll('_', ' ')); }
    finally { working = false; await refresh(); }
  });
}
const token = location.hash.slice(1);
if (token) {
  try { await request('/api/auth', 'POST', { authorization: 'Bearer ' + token }); history.replaceState(null, '', location.pathname); }
  catch (error) { notice(error.message); }
}
await refresh();
timer = setInterval(refresh, 2000);
window.addEventListener('pagehide', () => clearInterval(timer));
