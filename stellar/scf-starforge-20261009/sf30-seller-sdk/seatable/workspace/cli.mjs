// MIT. The same retained SeaTable source workflow for operators and managed launch.
import { randomUUID, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, link, unlink } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJson, bytes, createFile, privateDirectory, hashPrivate, syncDirectory, fault } from '../../postgres/publisher/files.mjs';
import { openSeaTableAuthoring } from './model.mjs';
import { MAX_WORKSPACE_BYTES } from './handover.mjs';
import { serveSeaTableAuthoring } from './server.mjs';
import { makeSeaTableSourcePacket, MAX_PACKET_BYTES } from './packet.mjs';
import { readSeaTableLaunchConnections, inspectSeaTableAuthoring, inspectSeaTableLaunchSource,
  prepareSeaTableManagedLaunch, seatableManagedStartup } from './launch.mjs';

const HELP = [
  'SeaTable source-authoring workspace',
  '',
  '  init --directory PRIVATE_DIR [--target DATASET_DIR] [--connections PRIVATE_CONNECTIONS.json]',
  '  serve --directory PRIVATE_DIR [--create] [--port 8481] [--connections PRIVATE_CONNECTIONS.json]',
  '    [--seller PUBLIC_SELLER_ORIGIN --resource PUBLIC_RESOURCE_URL]',
  '  status --directory PRIVATE_DIR',
  '  discover --directory PRIVATE_DIR --connections FILE --connection ALIAS --base ID --table ID [--view ID] [--where-file PRIVATE_FILTER.json | --where JSON]',
  '  capture --directory PRIVATE_DIR --connections FILE --selection PRIVATE_SELECTION.json --title TITLE --expected-revision N',
  '  import-source --directory PRIVATE_DIR --source FROZEN_SOURCE.json --title TITLE --expected-revision N',
  '  import --directory PRIVATE_DIR --packet SOURCE_PACKET.json --title TITLE --expected-revision N',
  '  inspect-capture --directory PRIVATE_DIR --capture UUID',
  '  attempt --directory PRIVATE_DIR --request UUID',
  '  draft --directory PRIVATE_DIR --draft PRIVATE_DRAFT.json --expected-revision N',
  '  preview --directory PRIVATE_DIR --draft-revision N',
  '  save --directory PRIVATE_DIR --draft-revision N --preview UUID --reviewer NAME --note TEXT --expected-selected-version N|null',
  '  select --directory PRIVATE_DIR --version N --expected-selected-version N|null',
  '  compare --directory PRIVATE_DIR --left N --right N',
  '  export --directory PRIVATE_DIR --version N --out NEW_PACKET.json',
  '  export-capture --directory PRIVATE_DIR --capture UUID --out NEW_PACKET.json',
  '  packet --source FROZEN_SOURCE.json --out NEW_PACKET.json',
  '  operation --directory PRIVATE_DIR --request UUID',
  '  resume --directory PRIVATE_DIR --request UUID',
  '  publisher --directory PRIVATE_DIR --version N',
  '  deployment-status --directory PRIVATE_DIR',
  '  deployment-review --directory PRIVATE_DIR --input PRIVATE_REVIEW.json',
  '  deployment-prepare --directory PRIVATE_DIR --input PRIVATE_PACKAGE_REQUEST.json',
  '  deployment-stage --directory PRIVATE_DIR --input PRIVATE_STAGE.json',
  '  deployment-package --directory PRIVATE_DIR --request PACKAGE_UUID',
  '  deployment-console --directory PRIVATE_DIR',
  '  deployment-compare --directory PRIVATE_DIR --from RELEASE_ID --to RELEASE_ID',
  '  deployment-file --directory PRIVATE_DIR --request PACKAGE_UUID --file NAME --out NEW_FILE',
  '  workspace-export --directory PRIVATE_DIR --expected-revision N --expected-selected-version N|null --request UUID --out WHOLE_WORKSPACE.stwh',
  '  workspace-exports --directory PRIVATE_DIR',
  '  workspace-download --directory PRIVATE_DIR --request EXPORT_UUID --out WHOLE_WORKSPACE.stwh',
  '  workspace-receive --directory PRIVATE_DIR --archive WHOLE_WORKSPACE.stwh --sha256 SHA --name CHILD_NAME --request UUID',
  '  workspace-received --directory PRIVATE_DIR',
  "  return-capture --directory PRIVATE_DIR --name RECEIVED_NAME --expected-revision N --request UUID",
  "  returns --directory PRIVATE_DIR",
  "  return --directory PRIVATE_DIR --review UUID",
  "  return-preview --directory PRIVATE_DIR --review UUID [--offset N] [--limit 1..100]",
  "  return-review --directory PRIVATE_DIR --review UUID --expected-review-revision N --preview-sha256 SHA --choices CHOICES.json --note TEXT --request UUID",
  "  return-apply --directory PRIVATE_DIR --review UUID --expected-review-revision N --preview-sha256 SHA --request UUID",
  "  return-export --directory PRIVATE_DIR --review UUID [--revision N] --out FROZEN_REVIEW.json",
  '  identity --directory PRIVATE_DIR',
  '  source-identity [--source-directory INSTALLED_WORKSPACE_SOURCE_DIR]',
  '',
  'Writes accept --request UUID. Save the printed UUID and use operation/resume after an interrupted response.',
  'Capture Resume advances the original step journal under the same UUID/selection. Metadata recovery requires a retained response. A fresh observation uses a new explicit request.',
  'Capture packets retain every original page and metadata receipt without token values. SQL retains verified counts; native views retain terminal-page completeness.',
  'The browser supplies version review, original publisher and complete original SF82 deployment controls.',
  'Workspace export closes owned publisher/release consoles and freezes all saved private work. Save draft edits first.',
  'Whole workspace receiving preserves original records in an independent named destination. It does not activate sellers or replay external actions.',
  'Returned-review writes require --request UUID. Keep the exact choices file and preview SHA for retry/recovery.',
  'Choices replace the whole saved map. Read every preview page, save partial decisions, then refresh preview before apply.',
  'Apply changes the draft only. Run the original full-row preview and save-version/publication separately.',
  'Whole-workspace writes require an explicit retained --request UUID. Repeat the same command after uncertainty; do not substitute a new UUID.',
  '',
  'Managed serve additionally accepts --source-directory DIR --source-sha256 SHA --workspace-identity SHA',
  '  [--connections-sha256 SHA] --startup-json. These bind original immutable settings and installed source.',
].join('\n') + '\n';
const FLAGS = new Set(['--create','--startup-json']);
const VALUES = new Set(['--directory','--target','--connections','--port','--connection','--base','--table','--view','--where',
  '--selection','--title','--expected-revision','--source','--packet','--capture','--draft','--draft-revision','--preview',
  '--reviewer','--note','--expected-selected-version','--version','--left','--right','--out','--request','--input',
  '--from','--to','--file','--source-directory','--source-sha256','--workspace-identity','--connections-sha256','--where-file','--seller','--resource','--archive','--sha256','--name','--review','--expected-review-revision','--preview-sha256','--choices','--offset','--limit','--revision']);
const COMMANDS = new Set(['init','serve','status','discover','capture','import-source','import','inspect-capture','attempt',
  'draft','preview','save','select','compare','export','export-capture','packet','operation','resume','publisher',
  'deployment-status','deployment-review','deployment-prepare','deployment-stage','deployment-package',
  'deployment-console','deployment-compare','deployment-file','identity','source-identity',
  'workspace-export','workspace-exports','workspace-download','workspace-receive','workspace-received','return-capture','returns','return','return-preview','return-review','return-apply','return-export']);
const PATHS = new Set(['--directory','--target','--connections','--selection','--source','--packet','--draft','--out','--input','--source-directory','--where-file','--archive','--choices']);
function parse(argv) {
  const [command, ...args] = argv, options = {};
  if (!COMMANDS.has(command)) throw fault('COMMAND_REQUIRED', HELP);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (Object.hasOwn(options, key) || !FLAGS.has(key) && !VALUES.has(key)) throw fault('SEATABLE_OPTION_INVALID', 'Unknown or repeated option: ' + key);
    if (FLAGS.has(key)) options[key] = true;
    else {
      if (args[i + 1] === undefined || args[i + 1].startsWith('--')) throw fault('SEATABLE_OPTION_VALUE_REQUIRED', key);
      const value = args[++i]; options[key] = PATHS.has(key) ? resolve(value) : value;
    }
  }
  return { command, options };
}
const number = (value, label) => {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw fault('SEATABLE_INTEGER_REQUIRED', 'Supply ' + label + ' as the current nonnegative integer.');
  return Number(value);
};
const required = (o, key) => { if (o[key] === undefined || o[key] === '') throw fault('SEATABLE_OPTION_REQUIRED', key); return o[key]; };
const selected = o => required(o, '--expected-selected-version') === 'null' ? null : number(o['--expected-selected-version'], '--expected-selected-version');
const output = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
async function saveFile(file, content) {
  await privateDirectory(dirname(file)); await createFile(file, content);
  return { file, bytes: content.length };
}

// Stream the exact retained archive into a private output. Publication never overwrites
// another writer's file; identical completed output is an exact replay.
async function saveWorkspaceArchive(file, descriptor) {
  await privateDirectory(dirname(file));
  if (!descriptor || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1 ||
      descriptor.bytes > MAX_WORKSPACE_BYTES + 32 * 1024 * 1024 + 13 || !/^[a-f0-9]{64}$/.test(descriptor.sha256))
    throw fault('SEATABLE_WORKSPACE_ARCHIVE_IDENTITY_REQUIRED');
  const result = { file, bytes:descriptor.bytes, sha256:descriptor.sha256 };
  async function exactOutput() {
    let saved; try { saved = await hashPrivate(file, descriptor.bytes); }
    catch (issue) { if(issue.code==='ENOENT')return false;throw issue; }
    if(saved.bytes!==descriptor.bytes || saved.hash!==descriptor.sha256)
      throw fault('SEATABLE_WORKSPACE_OUTPUT_CHANGED','This output already holds different bytes. Select another new private output.');
    return true;
  }
  if(await exactOutput())return result;
  const temporary=join(dirname(file),'.seatable-workspace-'+randomUUID()+'.partial');
  let source, outputHandle, primary;
  try {
    source=await open(descriptor.path,constants.O_RDONLY | constants.O_NOFOLLOW);
    const before=await source.stat();
    if(!before.isFile()||before.nlink!==1||before.mode & 0o077||before.size!==descriptor.bytes)
      throw fault('SEATABLE_WORKSPACE_ARCHIVE_CHANGED');
    outputHandle=await open(temporary,'wx',0o600);
    const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);
    let position=0;
    while(position<descriptor.bytes){
      const count=await source.read(buffer,0,Math.min(buffer.length,descriptor.bytes-position),position);
      if(!count.bytesRead)throw fault('SEATABLE_WORKSPACE_ARCHIVE_CHANGED');
      const block=buffer.subarray(0,count.bytesRead);hash.update(block);
      let written=0;while(written<block.length){
        const part=await outputHandle.write(block,written,block.length-written,position+written);
        if(!part.bytesWritten)throw fault('SEATABLE_WORKSPACE_OUTPUT_WRITE_FAILED');
        written+=part.bytesWritten;
      }
      position+=block.length;
    }
    const after=await source.stat();
    if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||
        after.dev!==before.dev||after.ino!==before.ino||hash.digest('hex')!==descriptor.sha256)
      throw fault('SEATABLE_WORKSPACE_ARCHIVE_CHANGED');
    await outputHandle.sync();await outputHandle.close();outputHandle=null;
    try{await link(temporary,file);}
    catch(issue){if(issue.code!=='EEXIST')throw issue;if(!await exactOutput())throw issue;}
    await unlink(temporary);await syncDirectory(dirname(file));
    return result;
  } catch(issue) { primary=issue;throw issue; } finally {
    const issues=[];
    try{await outputHandle?.close();}catch(issue){issues.push(issue);}
    try{await source?.close();}catch(issue){issues.push(issue);}
    try{await unlink(temporary);}catch(issue){if(issue.code!=='ENOENT')issues.push(issue);}
    if(issues.length && !primary)throw issues[0];
  }
}


async function returnedChoicesFile(file) {
  const value=await readJson(file,1024*1024);
  if(!value||typeof value!=='object'||Array.isArray(value)||
      Object.entries(value).some(([path,side])=>!path.startsWith('/')||!['local','returned','base'].includes(side)))
    throw fault('SEATABLE_RETURN_CHOICES_INVALID','Use the complete JSON pointer to local/returned/base choice map, not a preview or local-download envelope.');
  return value;
}
async function saveReturnedReviewFile(file,artifact) {
  const content=artifact.bytes;
  const size=content?.length;
  if(!Number.isSafeInteger(size)||size<1)throw fault('SEATABLE_RETURN_EXPORT_INVALID');
  const digest=createHash('sha256').update(content).digest('hex');
  const result={file,bytes:size,sha256:digest};
  await privateDirectory(dirname(file));
  async function identical() {
    let existing;
    try{existing=await hashPrivate(file,size);}catch(issue){if(issue.code==='ENOENT')return false;throw issue;}
    if(existing.bytes!==size||existing.hash!==digest)
      throw fault('SEATABLE_RETURN_OUTPUT_CHANGED','The output already contains different bytes. Keep it and choose a new output for this review revision.');
    return true;
  }
  if(await identical())return result;
  const temporary=join(dirname(file),'.seatable-return-'+randomUUID()+'.partial');
  let primary;
  try{
    await createFile(temporary,content);
    try{await link(temporary,file);}catch(issue){if(issue.code!=='EEXIST'||!await identical())throw issue;}
    await unlink(temporary);await syncDirectory(dirname(file));return result;
  }catch(issue){primary=issue;throw issue;}
  finally{try{await unlink(temporary);}catch(issue){if(issue.code!=='ENOENT'&&!primary)throw issue;}}
}

async function lifetime(service, ready, { compact = false } = {}) {
  let stopping = null, stop;
  const close = () => stopping ??= service.close();
  const done = new Promise((resolve, reject) => {
    stop = () => close().then(resolve, reject);
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  });
  try { if (compact) process.stdout.write(JSON.stringify(ready) + '\n'); else output(ready); await done; }
  finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); await close(); }
}

async function filterOption(o) {
  if (o['--where'] !== undefined && o['--where-file'] !== undefined)
    throw fault('SEATABLE_FILTER_INPUT_CONFLICT','Choose one JSON filter input.');
  if (o['--where-file'] !== undefined) return readJson(o['--where-file'],8192);
  if (o['--where'] === undefined) return null;
  try { return JSON.parse(o['--where']); }
  catch { throw fault('SEATABLE_FILTER_JSON_INVALID','Use a complete declarative filter JSON object.'); }
}
function buyerOptions(o) {
  if ((o['--seller'] === undefined) !== (o['--resource'] === undefined))
    throw fault('SEATABLE_BUYER_BINDING_REQUIRED','Supply seller and resource together.');
  if (o['--seller'] === undefined) return {};
  for (const key of ['--seller','--resource']) {
    let url;try { url = new URL(o[key]); } catch {}
    if (!url || !['http:','https:'].includes(url.protocol) || url.username || url.password || url.hash)
      throw fault('SEATABLE_BUYER_URL_INVALID','Use an HTTP(S) URL without credentials or a fragment.');
  }
  return {seller:o['--seller'],resource:o['--resource']};
}

export async function main(argv = process.argv.slice(2)) {
  if (!argv.length || argv.includes('--help')) { process.stdout.write(HELP); return; }
  const { command, options: o } = parse(argv);
  if (command === 'packet') {
    const packet = await makeSeaTableSourcePacket(required(o, '--source'));
    const result = await saveFile(required(o, '--out'), bytes(packet)); output(result); return result;
  }
  if (command === 'source-identity') { const result = await inspectSeaTableLaunchSource(o['--source-directory'] ?? dirname(new URL(import.meta.url).pathname)); output(result); return result; }
  const directory = required(o, '--directory');
  if (o['--create'] && !['init','serve'].includes(command)) throw fault('SEATABLE_OPTION_INVALID', '--create is available only for initialization or serve.');
  if (command === 'identity') { const result = await inspectSeaTableAuthoring(directory); output(result); return result; }
  const managed = command === 'serve' && o['--source-sha256'] !== undefined;
  const launch = managed ? await prepareSeaTableManagedLaunch({ directory, sourceDirectory: required(o, '--source-directory'),
    expectedSourceSha256: o['--source-sha256'], expectedWorkspaceIdentity: required(o, '--workspace-identity'),
    connectionsFile: o['--connections'], expectedConnectionsSha256: o['--connections-sha256'] }) : null;
  if (!managed && ['--source-directory','--workspace-identity','--connections-sha256','--startup-json'].some(key => o[key] !== undefined))
    throw fault('SEATABLE_MANAGED_REVIEW_REQUIRED');
  const connection = launch?.connection ?? await readSeaTableLaunchConnections(o['--connections']);
  const workspace = await openSeaTableAuthoring({ directory, create: command === 'init' || o['--create'] === true,
    targetDirectory: o['--target'], connections: connection.connections, ...buyerOptions(o),
    ...(launch ? { expectedIdentity: launch.expectedWorkspaceIdentity } : {}) });
  let handed = false;
  const requestId = () => {
    o['--request'] ??= randomUUID();
    process.stderr.write('requestId=' + o['--request'] + '\n');
    return o['--request'];
  };
  try {
    let result;
    if (command === 'serve') {
      const service = await serveSeaTableAuthoring({ workspace, port: o['--port'] === undefined ? 8481 : number(o['--port'], '--port') });
      let ready;
      try { ready = launch ? await seatableManagedStartup({ launch, workspace, service }) :
        { schema: 'stellar-forge.seatable-authoring-startup.v1', status: 'SEATABLE_AUTHORING_READY', directory, url: service.url }; }
      catch (issue) { await service.close(); throw issue; }
      handed = true; await lifetime(service, ready, { compact: o['--startup-json'] === true }); return ready;
    }
    if (command === 'workspace-export') {
      const request = required(o,'--request'), destination=required(o,'--out');
      const receipt=await workspace.exportWorkspace({requestId:request,
        expectedDraftRevision:number(required(o,'--expected-revision'),'--expected-revision'),
        expectedSelectedVersion:selected(o)});
      const file=await saveWorkspaceArchive(destination,await workspace.exportWorkspaceFile(receipt.id));
      result={...receipt,...file};
    } else if (command === 'workspace-exports') result={exports:await workspace.workspaceExports()};
    else if (command === 'workspace-download') {
      const request=required(o,'--request');
      result={id:request,...await saveWorkspaceArchive(required(o,'--out'),await workspace.exportWorkspaceFile(request))};
    } else if (command === 'workspace-receive') result=await workspace.receiveWorkspaceFile({
      archiveFile:required(o,'--archive'),expectedSha256:required(o,'--sha256'),name:required(o,'--name'),requestId:required(o,'--request')
    });
    else if (command === 'workspace-received') result={received:await workspace.receivedWorkspaces()};
    else if(command==='return-capture')result=await workspace.captureReturnedReview({
      name:required(o,'--name'),expectedDraftRevision:number(required(o,'--expected-revision'),'--expected-revision'),requestId:required(o,'--request')});
    else if(command==='returns')result={returns:await workspace.returnedReviews()};
    else if(command==='return')result=await workspace.returnedReview(required(o,'--review'));
    else if(command==='return-preview'){
      const count=o['--limit']===undefined?100:number(o['--limit'],'--limit');
      if(count<1||count>100)throw fault('SEATABLE_RETURN_LIMIT_INVALID','Use a limit from 1 through 100.');
      result=await workspace.previewReturnedReview({reviewId:required(o,'--review'),offset:o['--offset']===undefined?0:number(o['--offset'],'--offset'),limit:count});
    } else if(command==='return-review')result=await workspace.saveReturnedReview({
      reviewId:required(o,'--review'),expectedReviewRevision:number(required(o,'--expected-review-revision'),'--expected-review-revision'),
      previewSha256:required(o,'--preview-sha256'),choices:await returnedChoicesFile(required(o,'--choices')),
      note:required(o,'--note'),requestId:required(o,'--request')});
    else if(command==='return-apply')result=await workspace.applyReturnedReview({
      reviewId:required(o,'--review'),expectedReviewRevision:number(required(o,'--expected-review-revision'),'--expected-review-revision'),
      previewSha256:required(o,'--preview-sha256'),requestId:required(o,'--request')});
    else if(command==='return-export')result=await saveReturnedReviewFile(required(o,'--out'),await workspace.exportReturnedReview({
      reviewId:required(o,'--review'),...(o['--revision']===undefined?{}:{revision:number(o['--revision'],'--revision')})}));
    else if (command === 'init' || command === 'status') result = await workspace.status();
    else if (command === 'discover') result = await workspace.discover({ connectionAlias: required(o, '--connection'),
      baseId: required(o, '--base'), tableId: required(o, '--table'), viewId: o['--view'] ?? null, where: await filterOption(o), requestId: requestId() });
    else if (command === 'capture') result = await workspace.readLive({ ...await readJson(required(o, '--selection')),
      title: required(o, '--title'), expectedDraftRevision: number(required(o, '--expected-revision'), '--expected-revision'), requestId: requestId() });
    else if (command === 'import-source') result = await workspace.importSource({ sourceFile: required(o, '--source'),
      title: required(o, '--title'), expectedDraftRevision: number(required(o, '--expected-revision'), '--expected-revision'), requestId: requestId() });
    else if (command === 'import') result = await workspace.importPacket({ packet: await readJson(required(o, '--packet'), MAX_PACKET_BYTES),
      title: required(o, '--title'), expectedDraftRevision: number(required(o, '--expected-revision'), '--expected-revision'), requestId: requestId() });
    else if (command === 'inspect-capture') result = await workspace.inspectCapture(required(o, '--capture'));
    else if (command === 'attempt') result = await workspace.captureAttempt(required(o, '--request'));
    else if (command === 'draft') result = await workspace.saveDraft({ draft: await readJson(required(o, '--draft')),
      expectedRevision: number(required(o, '--expected-revision'), '--expected-revision'), requestId: requestId() });
    else if (command === 'preview') result = await workspace.preview({ draftRevision: number(required(o, '--draft-revision'), '--draft-revision'), requestId: requestId() });
    else if (command === 'save') result = await workspace.saveVersion({ draftRevision: number(required(o, '--draft-revision'), '--draft-revision'),
      previewId: required(o, '--preview'), reviewer: required(o, '--reviewer'), note: required(o, '--note'),
      expectedSelectedVersion: selected(o), requestId: requestId() });
    else if (command === 'select') result = await workspace.selectVersion({ versionId: number(required(o, '--version'), '--version'),
      expectedSelectedVersion: selected(o), requestId: requestId() });
    else if (command === 'compare') result = await workspace.compareVersions(number(required(o, '--left'), '--left'), number(required(o, '--right'), '--right'));
    else if (command === 'export' || command === 'export-capture') {
      const artifact = command === 'export' ? await workspace.exportVersion(number(required(o, '--version'), '--version')) :
        await workspace.exportCapture(required(o, '--capture'));
      result = await saveFile(required(o, '--out'), artifact.bytes);
    } else if (command === 'operation') result = workspace.operation(required(o, '--request'));
    else if (command === 'resume') result = await workspace.resume(required(o, '--request'));
    else if (command === 'publisher') {
      const opened = await workspace.openPublisher({ expectedSelectedVersion: number(required(o, '--version'), '--version'), requestId: requestId() });
      handed = true; await lifetime(workspace, opened); return opened;
    } else if (command === 'deployment-status') result = await workspace.deploymentStatus();
    else if (command === 'deployment-review') result = await workspace.reviewDeployment({ ...await readJson(required(o, '--input')), requestId: requestId() });
    else if (command === 'deployment-prepare') result = await workspace.prepareDeployment({ ...await readJson(required(o, '--input')), requestId: requestId() });
    else if (command === 'deployment-stage') result = await workspace.stageDeployment({ ...await readJson(required(o, '--input')), requestId: requestId() });
    else if (command === 'deployment-package') result = await workspace.inspectDeploymentPackage(required(o, '--request'));
    else if (command === 'deployment-compare') result = await workspace.compareDeployment({ from: o['--from'], to: required(o, '--to') });
    else if (command === 'deployment-console') {
      const opened = await workspace.openDeploymentConsole({ requestId: requestId() });
      handed = true; await lifetime(workspace, opened); return opened;
    } else if (command === 'deployment-file') {
      const artifact = await workspace.deploymentFile(required(o, '--request'), required(o, '--file'));
      result = await saveFile(required(o, '--out'), artifact.bytes);
    } else throw fault('COMMAND_REQUIRED', HELP);
    output({ ...(result && typeof result === 'object' ? result : { result }),
      ...(o['--request'] && !['operation','resume','attempt','deployment-package','deployment-file'].includes(command) ? { requestId: o['--request'] } : {}) });
    return result;
  } finally { if (!handed) await workspace.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(issue => { process.stderr.write((issue.code ?? 'SEATABLE_WORKSPACE') + ': ' +
    (issue.code ? issue.message : 'Inspect the private source workspace and retained request.') + '\n'); process.exitCode = 1; });

