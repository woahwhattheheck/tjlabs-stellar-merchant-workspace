#!/usr/bin/env node
// MIT. Foreground terminal over the same original fleet release lifecycle object.
import { createInterface } from 'node:readline';
import { resolve, dirname } from 'node:path';
import { constants } from 'node:fs';
import { open, link, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openFleetReleaseOperator } from './release-operator.mjs';
import { bootstrapFleet, readFleetBootstrapStatus } from './release-bootstrap.mjs';

const COMMANDS = `status
campaign-list
campaign-inspect ID
campaign-save JSON_OR_@FILE
campaign-review ID REVISION
campaign-advance JSON_OR_@FILE
campaign-pause JSON_OR_@FILE
campaign-review-rollback ID REVISION [TARGET_NATIVE_REVISION]
campaign-rollback JSON_OR_@FILE
campaign-retire JSON_OR_@FILE
campaign-export ID [FILE]
catalog TENANT SLOT
operations TENANT SLOT INSTANCE_ID
discovery TENANT
discovery-enrollment TENANT
discovery-review-enrollment TENANT SLOT INSTANCE_ID SELLER_ID [SOURCE_URL]
discovery-review-recovery TENANT SLOT INSTANCE_ID SELLER_ID INSPECTION_ID [SOURCE_URL]
discovery-enroll TENANT REVIEW_ID
discovery-start TENANT
discovery-stop TENANT INSTANCE_ID
discovery-source TENANT SLOT RELEASE_ID
discovery-review TENANT SLOT INSTANCE_ID
discovery-review-withdrawal TENANT SLOT INSTANCE_ID SOURCE_SLOT SOURCE_RELEASE ROUTE_ID REASON
discovery-apply TENANT REVIEW_ID
discovery-history TENANT CATALOG_KEY
discovery-consume TENANT [JSON_PAGE_OPTIONS]
client-list TENANT SLOT [AFTER [LIMIT]]
client-inspect TENANT SLOT EXPORT_ID
client-generate TENANT SLOT INSTANCE_ID EXPORT_ID
client-adopt TENANT SLOT EXPORT_ID FILES_SHA256
client-manifest TENANT SLOT EXPORT_ID
client-download TENANT SLOT EXPORT_ID MANIFEST_SHA256 DESTINATION
delivery-status TENANT SLOT
delivery-control TENANT SLOT ACTION JSON_INPUT
delivery-events TENANT SLOT DESTINATION [JSON_PAGE_OPTIONS]
delivery-transfers TENANT SLOT [AFTER [LIMIT]]
delivery-transfer TENANT SLOT TRANSFER_ID SOURCE_FINGERPRINT
delivery-manifest TENANT SLOT TRANSFER_ID [TRANSFER_FINGERPRINT]
stage TENANT SLOT PACKAGE RELEASE
review TENANT SLOT RELEASE
prepare REVIEW_ID
activate CANDIDATE_ID REVISION
review-rollback REVISION
rollback REVIEW_ID
retire TENANT SLOT INSTANCE_ID REVISION
quit`;
const USAGE = `Usage: node release-cli.mjs setup --declaration FILE --directory PRIVATE_DIRECTORY
  [--plan OUTPUT_FILE]
  node release-cli.mjs setup-status --directory PRIVATE_DIRECTORY
  node release-cli.mjs start --plan FILE --directory PRIVATE_DIRECTORY
  [--state PRIVATE_GATEWAY_DIRECTORY]

Runs the existing SF82 seller sessions and original fleet in this foreground process.
Setup initializes the original stores and initial releases, then writes the original
plan. Repeating setup resumes its retained progress. See BOOTSTRAP.md.
The plan declares stores, ports and package aliases. See RELEASE_OPERATOR.md.
Tenant enrollment, reviewed signing and native buyer discovery use that same
foreground owner. See DISCOVERY.md for original-source and withdrawal commands.
Original settlement delivery keeps each store’s native journal and destination
cursors through upgrades. See DELIVERY.md for its worker and receiving workflow.
Saved rollout waves use the same native owner. See CAMPAIGNS.md and the MCP
FLEET_CAMPAIGN_CLIENT.md for exact-request recovery and separate pause controls.

Session commands:
${COMMANDS}`;
const print = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
function revision(value) {
  if (!/^[1-9]\d*$/.test(value ?? '') || !Number.isSafeInteger(Number(value))) throw new TypeError('A positive revision is required.');
  return Number(value);
}

const CAMPAIGN_REQUEST_COMMANDS = Object.freeze({
  'campaign-save': 'campaignSave', 'campaign-advance': 'campaignAdvance',
  'campaign-pause': 'campaignPause', 'campaign-rollback': 'campaignRollback',
  'campaign-retire': 'campaignRetire',
});
const CAMPAIGN_READ_COMMANDS = new Set(['status', 'help', 'campaign-list', 'campaign-inspect', 'campaign-export']);
const MAX_CAMPAIGN_JSON_BYTES = 8 * 1024 * 1024;
const MAX_CAMPAIGN_EXPORT_BYTES = 32 * 1024 * 1024;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function campaignPath(value) {
  const path = value.startsWith('"') ? JSON.parse(value) : value;
  if (typeof path !== 'string' || !path || path.includes('\0')) throw new TypeError('Provide an exact local filename.');
  return resolve(path);
}
async function readCampaignFile(path, maximum = MAX_CAMPAIGN_JSON_BYTES) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(maximum))
      throw new TypeError('Use a regular JSON file within the selected byte limit.');
    const bytes = await file.readFile(), after = await file.stat({ bigint: true });
    if (BigInt(bytes.length) !== after.size || ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(key => before[key] !== after[key]))
      throw new Error('The selected JSON file changed while it was being read.');
    return bytes;
  } finally { await file.close(); }
}
async function campaignInput(value) {
  const bytes = value.startsWith('@') ? await readCampaignFile(campaignPath(value.slice(1))) : Buffer.from(value, 'utf8');
  if (bytes.length > MAX_CAMPAIGN_JSON_BYTES) throw new TypeError('Campaign JSON exceeds 8 MiB.');
  const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!plain(input)) throw new TypeError('Supply one original campaign request JSON object, inline or through @FILE.');
  return input;
}
async function writeCampaignExport(document, destination) {
  const path = campaignPath(destination), bytes = Buffer.from(JSON.stringify(document, null, 2) + '\n');
  if (bytes.length > MAX_CAMPAIGN_EXPORT_BYTES) throw new TypeError('Campaign export exceeds 32 MiB.');
  const temporary = path + '.pending-' + randomUUID();
  let file, created = false, reopened = false;
  try {
    file = await open(temporary, 'wx', 0o600);
    created = true;
    await file.writeFile(bytes); await file.sync(); await file.close(); file = null;
    try { await link(temporary, path); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const retained = await readCampaignFile(path, MAX_CAMPAIGN_EXPORT_BYTES);
      if (!retained.equals(bytes)) throw new Error('The export destination already contains different bytes. Select another filename.');
      reopened = true;
    }
    await unlink(temporary); created = false;
    const directory = await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY);
    try { await directory.sync(); } finally { await directory.close(); }
    return { schema: 'stellar-forge.fleet-campaign-file.v1', id: document.plan.id,
      planDigest: document.planDigest, revision: document.plan.revision,
      controlRevision: document.control.revision, documentSha256: document.sha256,
      file: { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }, reopened };
  } finally {
    if (file) await file.close();
    if (created) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
async function dispatchCampaignCommand(operator, action, suffix) {
  if (Object.hasOwn(CAMPAIGN_REQUEST_COMMANDS, action)) {
    if (!suffix) throw new TypeError('Use ' + action + ' JSON or ' + action + ' @FILE; retain the complete original requestId and body.');
    return operator[CAMPAIGN_REQUEST_COMMANDS[action]](await campaignInput(suffix));
  }
  if (action === 'campaign-list') {
    if (suffix) throw new TypeError('Use campaign-list.');
    return operator.campaignList();
  }
  if (action === 'campaign-inspect') {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(suffix)) throw new TypeError('Use campaign-inspect ID.');
    return operator.campaignInspect({ id: suffix });
  }
  if (action === 'campaign-export') {
    const selected = /^([a-z][a-z0-9-]{0,63})(?:\s+(.+))?$/.exec(suffix);
    if (!selected) throw new TypeError('Use campaign-export ID [FILE]. Quote a filename containing spaces as a JSON string.');
    const document = await operator.campaignExport({ id: selected[1] });
    return selected[2] === undefined ? document : writeCampaignExport(document, selected[2]);
  }
  if (action === 'campaign-review' || action === 'campaign-review-rollback') {
    const selected = /^([a-z][a-z0-9-]{0,63})\s+([1-9]\d*)(?:\s+([1-9]\d*))?$/.exec(suffix);
    if (!selected || action === 'campaign-review' && selected[3] !== undefined)
      throw new TypeError(action === 'campaign-review' ? 'Use campaign-review ID REVISION.' : 'Use campaign-review-rollback ID REVISION [TARGET_NATIVE_REVISION].');
    const input = { id: selected[1], expectedRevision: revision(selected[2]),
      ...(selected[3] === undefined ? {} : { targetRevision: revision(selected[3]) }) };
    return action === 'campaign-review' ? operator.campaignReview(input) : operator.campaignRollbackReview(input);
  }
  throw new TypeError(COMMANDS);
}

export async function dispatchFleetCommand(operator, line) {
  const campaign = /^(campaign-[a-z-]+)(?:\s+([\s\S]*))?$/.exec(line.trim());
  if (campaign) return dispatchCampaignCommand(operator, campaign[1], campaign[2] ?? '');
  const words = line.trim().split(/\s+/), action = words[0]; let args = words.slice(1);
  const download = /^client-download\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/.exec(line.trim());
  if (download) {
    const destination = download[5];
    args = [...download.slice(1, 5), destination.startsWith('"') ? JSON.parse(destination) : destination];
  }
  const withdrawal = /^discovery-review-withdrawal\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/.exec(line.trim());
  if (withdrawal) args = [...withdrawal.slice(1, 7),
    withdrawal[7].startsWith('"') ? JSON.parse(withdrawal[7]) : withdrawal[7]];
  const history = /^discovery-history\s+(\S+)\s+(.+)$/.exec(line.trim());
  if (history) args = [history[1], history[2].startsWith('"') ? JSON.parse(history[2]) : history[2]];
  const consume = /^discovery-consume\s+(\S+)(?:\s+(.+))?$/.exec(line.trim());
  if (consume) args = [consume[1], ...(consume[2] ? [consume[2]] : [])];
  const deliveryControl = /^delivery-control\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/.exec(line.trim());
  if (deliveryControl) args = [...deliveryControl.slice(1, 4), deliveryControl[4]];
  const deliveryEvents = /^delivery-events\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(.+))?$/.exec(line.trim());
  if (deliveryEvents) args = [...deliveryEvents.slice(1, 4), ...(deliveryEvents[4] ? [deliveryEvents[4]] : [])];
  const required = { status: 0, catalog: 2, operations: 3, stage: 4, review: 3, prepare: 1,
    activate: 2, 'review-rollback': 1, rollback: 1, retire: 4, help: 0,
    'client-list': [2, 3, 4], 'client-inspect': 3, 'client-generate': 4, 'client-adopt': 4,
    'client-manifest': 3, 'client-download': 5,
    'delivery-status': 2, 'delivery-control': 4, 'delivery-events': [3, 4],
    'delivery-transfers': [2, 3, 4], 'delivery-transfer': 4, 'delivery-manifest': [3, 4],
    discovery: 1, 'discovery-enrollment': 1, 'discovery-review-enrollment': [4, 5],
    'discovery-review-recovery': [5, 6],
    'discovery-enroll': 2, 'discovery-start': 1, 'discovery-stop': 2,
    'discovery-source': 3, 'discovery-review': 3, 'discovery-review-withdrawal': 7,
    'discovery-apply': 2, 'discovery-history': 2, 'discovery-consume': [1, 2] };
  const count = required[action];
  if (!Object.hasOwn(required, action) || (Array.isArray(count) ? !count.includes(args.length) : args.length !== count))
    throw new TypeError(COMMANDS);
  if (action === 'help') return { commands: COMMANDS };
  if (action === 'status') return operator.status();
  if (action === 'catalog') return operator.catalog({ tenant: args[0], slot: args[1] });
  if (action === 'operations') return operator.operations({ tenant: args[0], slot: args[1], instanceId: args[2] });
  if (action === 'discovery') return operator.discoveryStatus({ tenant: args[0] });
  if (action === 'discovery-enrollment') return operator.discoveryEnrollment({ tenant: args[0] });
  if (action === 'discovery-review-enrollment') return operator.discoveryReviewEnrollment({
    tenant: args[0], slot: args[1], instanceId: args[2], sellerId: args[3],
    ...(args[4] !== undefined ? { sourceURL: args[4] } : {}) });
  if (action === 'discovery-review-recovery') return operator.discoveryReviewEnrollment({
    tenant: args[0], slot: args[1], instanceId: args[2], sellerId: args[3], expectedIncompleteId: args[4],
    ...(args[5] !== undefined ? { sourceURL: args[5] } : {}) });
  if (action === 'discovery-enroll') return operator.discoveryCreateEnrollment({ tenant: args[0], reviewId: args[1] });
  if (action === 'discovery-start') return operator.discoveryStart({ tenant: args[0] });
  if (action === 'discovery-stop') return operator.discoveryStop({ tenant: args[0], instanceId: args[1] });
  if (action === 'discovery-source') return operator.discoverySource({ tenant: args[0], slot: args[1], releaseId: args[2] });
  if (action === 'discovery-review') return operator.discoveryReview({ tenant: args[0], slot: args[1],
    instanceId: args[2], action: 'publish' });
  if (action === 'discovery-review-withdrawal') return operator.discoveryReview({ tenant: args[0], slot: args[1],
    instanceId: args[2], sourceSlot: args[3], sourceReleaseId: args[4], routeId: args[5], reason: args[6], action: 'withdraw' });
  if (action === 'discovery-apply') return operator.discoveryApply({ tenant: args[0], reviewId: args[1] });
  if (action === 'discovery-history') return operator.discoveryHistory({ tenant: args[0], catalogKey: args[1] });
  if (action === 'discovery-consume') {
    const options = args[1] === undefined ? {} : JSON.parse(args[1]);
    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.hasOwn(options, 'tenant'))
      throw new TypeError('Supply a JSON object of original discovery page options.');
    return operator.discoveryConsume({ tenant: args[0], ...options });
  }
  const scope = { tenant: args[0], slot: args[1] };
  if (action === 'delivery-status') return operator.deliveryStatus(scope);
  if (action === 'delivery-control') return operator.deliveryControl({ ...scope, action: args[2], input: JSON.parse(args[3]) });
  if (action === 'delivery-events') {
    const options = args[3] === undefined ? {} : JSON.parse(args[3]);
    if (!options || typeof options !== 'object' || Array.isArray(options) ||
        Object.keys(options).some(key => !['state', 'offset', 'limit'].includes(key)))
      throw new TypeError('Supply a JSON object containing state, offset and limit.');
    return operator.deliveryEvents({ ...scope, id: args[2], ...options });
  }
  if (action === 'delivery-transfers') return operator.deliveryTransfers({ ...scope,
    ...(args[2] ? { after: args[2] } : {}), ...(args[3] ? { limit: revision(args[3]) } : {}) });
  if (action === 'delivery-transfer') return operator.deliveryTransfer({ ...scope, id: args[2], expectedSourceFingerprint: args[3] });
  if (action === 'delivery-manifest') return operator.deliveryTransferManifest({ ...scope, id: args[2],
    ...(args[3] ? { expectedFingerprint: args[3] } : {}) });
  if (action === 'client-list') return operator.clientList({ ...scope,
    ...(args[2] ? { after: args[2] } : {}), ...(args[3] ? { limit: revision(args[3]) } : {}) });
  if (action === 'client-inspect') return operator.clientInspect({ ...scope, exportId: args[2] });
  if (action === 'client-generate') return operator.clientGenerate({ ...scope, instanceId: args[2], id: args[3] });
  if (action === 'client-adopt') return operator.clientAdopt({ ...scope, exportId: args[2], expectedFilesSha256: args[3] });
  if (action === 'client-manifest') return operator.clientManifest({ ...scope, exportId: args[2] });
  if (action === 'client-download') return operator.downloadClient({ ...scope, exportId: args[2],
    expectedManifestSha256: args[3], directory: args[4] });
  if (action === 'stage') return operator.stage({ tenant: args[0], slot: args[1], package: args[2], releaseId: args[3] });
  if (action === 'review') return operator.review({ tenant: args[0], slot: args[1], releaseId: args[2] });
  if (action === 'prepare') return operator.prepare({ reviewId: args[0] });
  if (action === 'activate') return operator.activate({ candidateId: args[0], expectedRevision: revision(args[1]) });
  if (action === 'review-rollback') return operator.reviewRollback({ targetRevision: revision(args[0]) });
  if (action === 'rollback') return operator.rollback({ reviewId: args[0] });
  return operator.retire({ tenant: args[0], slot: args[1], instanceId: args[2], expectedRevision: revision(args[3]) });
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') { process.stdout.write(USAGE + '\n'); return; }
  const action = args[0];
  if (!['setup', 'setup-status', 'start'].includes(action)) throw new TypeError(USAGE);
  const allowed = action === 'setup' ? ['--declaration', '--directory', '--plan'] :
    action === 'setup-status' ? ['--directory'] : ['--plan', '--directory', '--state'];
  const flags = new Map();
  for (let index = 1; index < args.length; index += 2) {
    const name = args[index], value = args[index + 1];
    if (!allowed.includes(name) || flags.has(name) || !value || value.startsWith('--'))
      throw new TypeError(USAGE);
    flags.set(name, value);
  }
  if (!flags.has('--directory')) throw new TypeError(USAGE);
  if (action === 'setup-status') { print(await readFleetBootstrapStatus({ directory: flags.get('--directory') })); return; }
  if (action === 'setup') {
    if (!flags.has('--declaration')) throw new TypeError(USAGE);
    const controller = new AbortController();
    const stop = () => controller.abort(new Error('Fleet setup interrupted; repeat the same setup command to resume.'));
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try {
      print(await bootstrapFleet({ declarationFile: flags.get('--declaration'), directory: flags.get('--directory'),
        planFile: flags.get('--plan'), signal: controller.signal,
        onProgress: event => process.stdout.write(JSON.stringify(event) + '\n') }));
    } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
    return;
  }
  if (!flags.has('--plan')) throw new TypeError(USAGE);
  let operator, lines, requestedClose = false;
  let commandQueue = Promise.resolve(), activeCommand = null;
  const concurrentCommands = new Set();
  const requestClose = () => {
    requestedClose = true;
    if (operator) void operator.close().then(() => lines?.close(), error => {
      process.stderr.write(String(error.message) + '\n'); process.exitCode = 1; lines?.close();
    });
  };
  // Install before the first native child can start. SF82 signal handling is
  // explicitly delegated to this owner; gateway admission/drain closes first.
  process.on('SIGINT', requestClose); process.on('SIGTERM', requestClose);
  try {
    operator = await openFleetReleaseOperator({ planFile: flags.get('--plan'), directory: flags.get('--directory'),
      gatewayStateDirectory: flags.get('--state') });
    if (requestedClose) return;
    print({ fleet: operator.publicURL, status: await operator.status(), commands: COMMANDS });
    lines = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
    lines.on('SIGINT', requestClose);
    if (process.stdin.isTTY) lines.setPrompt('fleet> ');
    lines.prompt();
    // Ordinary commands retain input order. The original pause control and
    // current reads can run while an approved wave awaits its native result.
    for await (const line of lines) {
      if (requestedClose || line.trim() === 'quit') break;
      if (!line.trim()) { if (!requestedClose) lines.prompt(); continue; }
      const action = line.trim().split(/\s+/, 1)[0];
      const execute = async () => {
        if (requestedClose) return;
        try { print(await dispatchFleetCommand(operator, line)); }
        catch (error) { print({ error: error.message, code: error.code ?? null, status: error.status ?? null }); }
        if (!requestedClose) lines.prompt();
      };
      if (action === 'campaign-pause' ||
          ['campaign-advance', 'campaign-rollback'].includes(activeCommand) && CAMPAIGN_READ_COMMANDS.has(action)) {
        const pending = execute(); concurrentCommands.add(pending);
        void pending.then(() => concurrentCommands.delete(pending), () => concurrentCommands.delete(pending));
      } else commandQueue = commandQueue.then(async () => {
        activeCommand = action;
        try { await execute(); } finally { activeCommand = null; }
      });
    }
  } finally {
    try {
      const settled = await Promise.allSettled([commandQueue, ...concurrentCommands]);
      const failures = settled.filter(result => result.status === 'rejected').map(result => result.reason);
      if (failures.length) throw new AggregateError(failures, 'Accepted terminal commands did not finish cleanly.');
    } finally {
      try { await operator?.close(); }
      finally {
        lines?.close();
        process.removeListener('SIGINT', requestClose); process.removeListener('SIGTERM', requestClose);
      }
    }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { process.stderr.write(String(error.message) + '\n'); process.exitCode = 1; });
