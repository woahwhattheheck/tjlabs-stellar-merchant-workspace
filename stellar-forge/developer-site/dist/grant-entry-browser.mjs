// MIT. Open the existing grant reviewer and receive its original complete export.
import { FRED_EXAMPLE, downloadFredExample } from './example-download.mjs';

const MAX_PACKET_BYTES = 8 * 1024 * 1024;
const MAX_CONNECTION_BYTES = 16 * 1024;
const PACKET_SCHEMA = 'stellar-forge.grant-reviewer-packet.v1';
const CONNECTION_SCHEMA = 'stellar-forge.grant-reviewer-workbench-connection.v1';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
function absolutePath(value, label) {
  if (typeof value !== 'string' || !value.startsWith('/') || value === '/' ||
      /[\u0000-\u001f\u007f]/.test(value) || value.split('/').some(part => part === '..'))
    throw new TypeError('Choose an absolute ' + label + ' under its existing private parent.');
  return value;
}
function commandPrefix(installation) {
  if (installation === 'installed') return 'starforge grant-demo';
  if (installation === 'source') return 'node stellar/scf_2026/presentation/reviewer/cli.mjs';
  throw new TypeError('Choose the installed command or source checkout.');
}
function selectedPacketArguments(input) {
  const path = absolutePath(input.packetFile, 'packet file');
  if (typeof input.packetSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.packetSha256))
    throw new TypeError('Use the exact 64-character lowercase SHA-256 from the exported packet.');
  return ' --packet ' + quote(path) + ' --sha256 ' + input.packetSha256;
}
export function grantReviewerCommand(input) {
  const prefix = commandPrefix(input.installation);
  if (!['bundled', 'received'].includes(input.purchaseSource))
    throw new TypeError('Choose the bundled purchase or a complete received packet.');
  let command = prefix + ' workbench --dir ' + quote(absolutePath(input.directory, 'workbench directory'));
  if (input.purchaseSource === 'received') command += selectedPacketArguments(input);
  return command + ' --port 0';
}
/** Native inspect finishes successfully before the receiving workbench is opened. */
export function grantReviewerCommands(input) {
  const openCommand = grantReviewerCommand(input);
  const inspectCommand = input.purchaseSource === 'received' ?
    commandPrefix(input.installation) + ' inspect' + selectedPacketArguments(input) : null;
  return {openCommand, inspectCommand, command:inspectCommand ? inspectCommand + ' &&\n' + openCommand : openCommand};
}
async function selectedJsonFile(file, maximum, label) {
  if (!file || typeof file.arrayBuffer !== 'function' || !Number.isSafeInteger(file.size) ||
      file.size < 1 || file.size > maximum)
    throw new TypeError('Choose the complete ' + label + ' within its ' +
      (maximum === MAX_PACKET_BYTES ? '8 MiB' : '16 KiB') + ' size limit.');
  const buffer = await file.arrayBuffer();
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== file.size)
    throw new TypeError('Read the complete selected ' + label + ' again.');
  const bytes = new Uint8Array(buffer);
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
  catch { throw new TypeError('Choose the original complete JSON ' + label + '.'); }
  return {bytes, value};
}
/** Inspect the chosen local file; the native command validates and receives the original packet. */
export async function inspectGrantReviewerPacket(file) {
  const {bytes, value} = await selectedJsonFile(file, MAX_PACKET_BYTES, 'reviewer packet');
  if (!plain(value) || value.schema !== PACKET_SCHEMA || !/^[a-f0-9]{64}$/.test(value.packetId || '') ||
      !plain(value.source) || typeof value.source.operationId !== 'string' ||
      !Array.isArray(value.documents) || !value.documents.length || value.documents.length > 128 ||
      !Array.isArray(value.quotes) || !value.quotes.length || value.quotes.length > 20)
    throw new TypeError('Select a complete exported Grant purchase reviewer packet.');
  if (!globalThis.crypto?.subtle)
    throw new TypeError('Open this page through HTTPS or localhost to read the packet digest.');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
  return {filename:String(file.name || 'reviewer-packet.json'), bytes:bytes.length, sha256:hash,
    packetId:value.packetId, operationId:value.source.operationId,
    documents:value.documents.length, quotes:value.quotes.length};
}
/** The running native workbench writes this exact loopback connection contract. */
export function grantReviewerConnection(value) {
  if (!plain(value) || value.schema !== CONNECTION_SCHEMA || value.active !== true ||
      typeof value.workbenchId !== 'string' || !value.workbenchId || value.workbenchId.length > 128 ||
      typeof value.instanceId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.instanceId) ||
      typeof value.accessToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.accessToken))
    throw new TypeError('Select workbench-connection.json from the currently running Grant purchase reviewer.');
  let url;
  try { url = new URL(value.url); } catch { throw new TypeError('The workbench connection address is invalid.'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !/^[0-9]+$/.test(url.port) ||
      Number(url.port) < 1 || Number(url.port) > 65535 || url.pathname !== '/' ||
      url.username || url.password || url.search || url.hash)
    throw new TypeError('Use the original local connection file written by this running workbench.');
  return {url:url.href, openingUrl:url.href + '#' + encodeURIComponent(value.accessToken),
    workbenchId:value.workbenchId, instanceId:value.instanceId};
}
export function grantReviewerOpeningGuide({command, reviewerGuide, runtimeGuide, packet = null}) {
  const packetDetails = packet ? '## Selected receiving packet\n\n' +
    '- File: ' + packet.filename.replace(/[\u0000-\u001f\u007f\x60<>]/g, '_') + '\n' +
    '- Full file bytes: ' + packet.bytes + '\n- SHA-256: ' + packet.sha256 + '\n' +
    '- Packet: ' + packet.packetId + '\n- Original documents: ' + packet.documents +
    '\n- Retained quotes: ' + packet.quotes + '\n\n' : '';
  return '# Open and receive the retained grant purchase\n\n' +
    'Run this command from the selected maintained runtime or source checkout, beneath an existing private parent directory. A received packet is inspected by the native product before its workbench opens:\n\n' +
    '~~~sh\n' + command + '\n~~~\n\n' +
    '## Open the current running workbench\n\n' +
    'Use Applications → Open, or select this instance’s workbench-connection.json in the grant page’s Open a running workbench panel. Use a browser on the same host as the workbench. Select the file again after a restart to open that current instance.\n\n' +
    packetDetails +
    '## Source and complete result\n\n' +
    '1. In Packet intake, choose Review bundled purchase, or select the complete receiving packet.\n' +
    '2. Open Source and query. Inspect the original query, terms and source documents.\n' +
    '3. Choose Receive this packet and Open original Buyer.\n' +
    '4. In Buyer results, select each quote and Read complete saved result. Retain both original outcomes and full result files.\n\n' +
    '## Handover and receiving\n\n' +
    '1. Choose Handover → Close Buyer and export packet.\n' +
    '2. Retain the full packet and its displayed SHA-256.\n' +
    '3. In the grant entry, choose Existing exported packet, its path on the receiving host, its digest, and a separate private workbench directory. Selecting the file in the browser compares its complete bytes with the supplied digest.\n' +
    '4. Run the prepared inspect-and-open command. In the receiving workbench, receive that packet and open its original results.\n' +
    '5. Keep the original directory and action identities when reopening or continuing interrupted work.\n\n' +
    '## Maintained instructions\n\n' +
    '- Reviewer and customer delivery: ' + reviewerGuide + '\n' +
    '- Runtime installation: ' + runtimeGuide + '\n';
}
function saveFile(document, bytes, filename, type, urls) {
  const url = URL.createObjectURL(new Blob([bytes], {type}));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.append(anchor);
  anchor.click(); anchor.remove();
  const timer = setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); }, 30000);
  urls.set(url, timer);
}
function releaseFiles(urls) {
  for (const [url, timer] of urls) { clearTimeout(timer); URL.revokeObjectURL(url); }
  urls.clear();
}
function bindReportDownload(document) {
  const link = document.getElementById('grant-entry-report-download'),
    cancel = document.getElementById('grant-entry-report-cancel'),
    status = document.getElementById('grant-entry-report-status');
  if (!link || !cancel || !status) return null;
  const selection = new URL(link.getAttribute('href'), document.baseURI);
  const report = document.querySelector('#review-result a[data-grant-report]');
  if (!report || new URL(report.getAttribute('href'), document.baseURI).href !== FRED_EXAMPLE.reportHref ||
      selection.href !== new URL(FRED_EXAMPLE.filename, new URL('./', FRED_EXAMPLE.guideHref)).href)
    return null;
  let current = null, closed = false;
  const urls = new Map();
  link.addEventListener('click', async event => {
    event.preventDefault();
    if (current || closed) return;
    const controller = new AbortController(); current = controller;
    link.setAttribute('aria-disabled', 'true'); link.setAttribute('aria-busy', 'true');
    cancel.hidden = false;
    status.textContent = 'Reading the complete current economic-report edition…';
    try {
      const result = await downloadFredExample({signal:controller.signal, onProgress:progress => {
        if (current === controller && !closed)
          status.textContent = 'Reading ' + progress.completedFiles + ' of ' + progress.totalFiles + ' complete report files…';
      }});
      if (current !== controller || closed || controller.signal.aborted) return;
      saveFile(document, result.bytes, result.filename, 'application/zip', urls);
      status.textContent = 'Downloaded all ' + result.files + ' files. Extract the ZIP and open START_HERE.md, then briefing.html. Package SHA-256: ' + result.sha256;
    } catch (error) {
      if (current === controller && !closed)
        status.textContent = controller.signal.aborted ? 'Download cancelled. Select Download to read the same complete edition.' : error.message;
    } finally {
      if (current === controller) {
        current = null; link.removeAttribute('aria-disabled'); link.removeAttribute('aria-busy'); cancel.hidden = true;
      }
    }
  });
  cancel.addEventListener('click', () => current?.abort());
  document.defaultView?.addEventListener('pagehide', () => { closed = true; current?.abort(); releaseFiles(urls); });
  document.defaultView?.addEventListener('pageshow', () => { closed = false; });
  return {cancel:() => current?.abort()};
}
function bindRunningWorkbench(document) {
  const input = document.getElementById('grant-entry-connection-file'),
    open = document.getElementById('grant-entry-open-workbench'),
    forget = document.getElementById('grant-entry-forget-connection'),
    status = document.getElementById('grant-entry-connection-status');
  if (!input || !open || !forget || !status) return null;
  let selected = null, sequence = 0;
  function clear() {
    sequence++; selected = null; input.value = ''; open.disabled = true; forget.disabled = true;
    status.textContent = 'Choose the connection file from the running workbench on this browser’s host.';
  }
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; clear();
    if (!file) return;
    const current = sequence; status.textContent = 'Reading the selected workbench connection…';
    try {
      const {value} = await selectedJsonFile(file, MAX_CONNECTION_BYTES, 'workbench connection file');
      const connection = grantReviewerConnection(value);
      if (current !== sequence) return;
      selected = connection; open.disabled = false; forget.disabled = false;
      status.textContent = 'Workbench ' + connection.workbenchId + ' · instance ' + connection.instanceId +
        ' · ' + connection.url + '. Open this running instance.';
    } catch (error) { if (current === sequence) status.textContent = error.message; }
  });
  open.addEventListener('click', () => {
    if (!selected) return;
    const anchor = document.createElement('a');
    anchor.href = selected.openingUrl; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
    document.body.append(anchor); anchor.click(); anchor.remove();
    status.textContent = 'Opened instance ' + selected.instanceId + ' in another tab. Select its new connection file after a workbench restart.';
  });
  forget.addEventListener('click', clear);
  document.defaultView?.addEventListener('pagehide', clear);
  clear(); return {clear};
}
export function bindGrantReviewerEntry(document) {
  const reportDownload = bindReportDownload(document), runningWorkbench = bindRunningWorkbench(document);
  const form = document.getElementById('grant-entry-command-form');
  if (!form) return {reportDownload, runningWorkbench};
  const command = document.getElementById('grant-entry-command'),
    fields = document.getElementById('grant-entry-packet-fields'),
    status = document.getElementById('grant-entry-status'),
    packetStatus = document.getElementById('grant-entry-packet-status'),
    packetInput = document.getElementById('grant-entry-packet-file'),
    copy = document.getElementById('grant-entry-copy'),
    download = document.getElementById('grant-entry-download');
  let selected = null, sequence = 0, packet = null, packetSequence = 0, packetReading = false;
  const urls = new Map();
  const input = () => Object.fromEntries(new FormData(form).entries());
  function showPacket() {
    if (!packetStatus) return;
    if (packetReading) { packetStatus.textContent = 'Reading the complete selected packet…'; return; }
    if (!packet) { packetStatus.textContent = 'Select the exported file to compare it with the supplied SHA-256.'; return; }
    const expected = form.elements.packetSha256.value;
    packetStatus.textContent = packet.filename + ' · ' + packet.bytes + ' bytes · ' + packet.quotes +
      ' retained quotes · SHA-256 ' + packet.sha256 + '. ' +
      (!expected ? 'Enter the digest supplied with the export.' :
        expected === packet.sha256 ? 'Matches the supplied export digest.' : 'The supplied digest differs from this file.');
  }
  function invalidate() {
    sequence++; selected = null; copy.disabled = true; download.disabled = true;
    fields.hidden = form.elements.purchaseSource.value !== 'received';
    for (const name of ['packetFile', 'packetSha256']) {
      form.elements[name].disabled = fields.hidden; form.elements[name].required = !fields.hidden;
    }
    if (packetInput) packetInput.disabled = fields.hidden;
    status.textContent = 'Prepare the command after selecting the directory.';
    showPacket();
  }
  function sourceLink(label) {
    return [...document.querySelectorAll('#review-operate a')].find(node => node.textContent === label)?.href;
  }
  form.addEventListener('input', invalidate); form.addEventListener('change', invalidate);
  packetInput?.addEventListener('change', async () => {
    const file = packetInput.files?.[0], current = ++packetSequence;
    packet = null; packetReading = !!file; invalidate();
    if (!file) return;
    try {
      const received = await inspectGrantReviewerPacket(file);
      if (current !== packetSequence) return;
      packet = received; packetReading = false; invalidate();
    } catch (error) {
      if (current !== packetSequence) return;
      packetReading = false; packet = null; packetStatus.textContent = error.message;
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const values = input(), commands = grantReviewerCommands(values);
      if (values.purchaseSource === 'received' && packetInput?.files?.length) {
        if (packetReading || !packet) throw new TypeError('Finish reading a complete reviewer packet before preparing its receiving command.');
        if (packet.sha256 !== values.packetSha256)
          throw new TypeError('The selected file and supplied export digest differ. Select the matching original packet and digest.');
        if (values.packetFile.split('/').at(-1) !== packet.filename)
          throw new TypeError('Use this selected packet’s filename in its absolute path on the receiving host.');
      }
      const reviewerGuide = sourceLink('Full reviewer operating guide'),
        runtimeGuide = sourceLink('Install or inspect the maintained runtime');
      if (!reviewerGuide || !runtimeGuide)
        throw new TypeError('Open the complete current grant page with its operating guides.');
      selected = {...commands, reviewerGuide, runtimeGuide,
        packet:values.purchaseSource === 'received' && packetInput?.files?.length ? packet : null};
      sequence++; command.textContent = commands.command; copy.disabled = false; download.disabled = false;
      status.textContent = commands.inspectCommand ?
        'Receiving command prepared. Run it on the receiving host; native inspection completes before the workbench opens.' :
        'Command prepared. Run it on the selected host, then use Applications or the running workbench connection below.';
    } catch (error) {
      selected = null; copy.disabled = true; download.disabled = true; status.textContent = error.message;
    }
  });
  copy.addEventListener('click', async () => {
    if (!selected) return;
    const current = sequence;
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error('Clipboard access unavailable');
      await globalThis.navigator.clipboard.writeText(selected.command);
      if (current === sequence) status.textContent = 'Command copied.';
    } catch {
      if (current !== sequence) return;
      const range = document.createRange(); range.selectNodeContents(command);
      const selection = globalThis.getSelection?.(); selection?.removeAllRanges(); selection?.addRange(range);
      status.textContent = 'The command is selected. Copy it with your keyboard or browser menu.';
    }
  });
  download.addEventListener('click', () => {
    if (!selected) return;
    saveFile(document, grantReviewerOpeningGuide(selected), 'grant-reviewer-opening.md', 'text/markdown;charset=utf-8', urls);
    status.textContent = 'Downloaded the selected command, packet details, opening and complete receiving instructions.';
  });
  document.defaultView?.addEventListener('pagehide', () => {
    selected = null; packet = null; packetSequence++; releaseFiles(urls);
  });
  invalidate();
  return {form, invalidate, reportDownload, runningWorkbench};
}
if (typeof document !== 'undefined') bindGrantReviewerEntry(document);
