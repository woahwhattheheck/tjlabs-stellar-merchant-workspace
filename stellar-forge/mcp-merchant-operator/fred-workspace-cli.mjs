#!/usr/bin/env node
// MIT. Installed customer/operator CLI for the original economic-edition workspace.
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { open, link, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { MerchantFredWorkspaces } from './fred-workspace.mjs';
import { fredFileSelection } from './catalog/fred-workspace.mjs';
import { FredWorkspaceClient, FredWorkspaceError, FRED_WORKSPACE_CONNECTION_SCHEMA, readFredWorkspaceConfiguration,
  readFredHostFile, canonicalFredJSON, saveFredFile, inspectFredWorkspaceFile, receiveFredWorkspaceFile } from './fred-workspace-client.mjs';

export const FRED_WORKSPACE_HELP = [
  'Starforge economic workspace customer',
  '',
  'Retain a connection to the ORIGINAL running fred serve / managed Application:',
  '  connection-init --out PRIVATE_CONNECTION.json --console-url-file ORIGINAL_STARTUP.json',
  '                  [--workspace macro] [--project-id ORIGINAL_UUID] [--binding-sha SHA256]',
  '                  [--inputs-file INPUT_ALIASES.json] [--profiles-file MERCHANT_PROFILES.json]',
  '                  [--payment-file ORIGINAL_PAYMENT.json --merchant-origin HTTPS --profile native]',
  '                  [--label "Economic editions"]',
  '',
  'Every remote command: --connection PRIVATE_CONNECTION.json [--workspace ALIAS]',
  'Use --args-file JSON for complete native tool inputs. Additional flags must agree.',
  '',
  'Inspect and review:',
  '  status | inputs | input-inspect --input ALIAS',
  '  records --kind captures|reviews|publications|operations|briefingTemplates|briefingSuccessors',
  '      |releaseCaptures|releaseWatches|releasePlans|ddpCrosswalks|ddpPackages|ddpMigrations|ddpReceivings',
  '      [--offset 0 --limit 50 --revision N]',
  '  record --kind KIND --id ID [--revision N]',
  '  operation --id ORIGINAL_ID | wait --id ORIGINAL_ID [--wait-ms 60000]',
  '  observations --capture SHA [--series UNRATE --offset 0]',
  '  compare --before SHA --after SHA [--offset 0]',
  '  briefing-preview --capture SHA --briefing-file JSON [--offset 0]',
  '  briefing --review SHA [--offset 0]',
  '  briefing-templates [--kind templates|successors --offset 0 --limit 50 --revision N]',
  '  briefing-successor-preview --template TEMPLATE_ID --capture SHA [--anchor-date YYYY-MM-DD]',
  '      [--baseline-review SHA --previous-successor SUCCESSOR_ID --note-file TEXT]',
  '      [--offset 0 --limit 100 --changes-only true|false]',
  '  briefing-successor --successor SUCCESSOR_ID [--offset 0 --limit 100 --changes-only true|false]',
  '',
  'Build the original product:',
  '  configure --id ID --revision N --selection-file SELECTION.json',
  '  capture --id ID --revision N',
  '  import --id ID --revision N --input ORIGINAL_SOURCE_ALIAS [--sha256 FILE_SHA]',
  '  combine --id ID --revision N --captures SHA,SHA,SHA',
  '  select --id ID --revision N --capture SHA',
  '  review --id ID --revision N --capture SHA [--policy-file JSON --note-file TEXT --briefing-file JSON]',
  '  briefing-template-save --id ID --revision N --review SHA [--name NAME --window-file JSON]',
  '      [--previous-template TEMPLATE_ID]',
  '  briefing-successor-save --id ID --revision N --template TEMPLATE_ID --capture SHA --preview-id SHA',
  '      [--anchor-date YYYY-MM-DD --baseline-review SHA --previous-successor SUCCESSOR_ID --note-file TEXT]',
  '  publish --id ID --revision N --review SHA --profile HOST_PROFILE',
  '  abandon --id ID --revision N --pending ORIGINAL_ID',
  '',
  'Release calendars, watches and exact vintage catch-up:',
  '  release-captures [--offset 0 --limit 50 --revision N]',
  '  release-capture --release-capture SHA [--section series|releases|calendar|vintages --offset 0 --limit 100]',
  '  release-import --id ID --revision N --input RELEASE_SOURCE_ALIAS [--sha256 FILE_SHA --release-capture SHA]',
  '      Continue an already staged import with the same --id and --release-capture SHA.',
  '  release-acquire --id ID --revision N [--selection-file RELEASE_SELECTION.json]',
  '      A new acquisition requires selection; an omitted selection resumes the same pending acquisition.',
  '  release-watches [--kind watches|plans|catchUps --offset 0 --limit 50 --revision N]',
  '  release-watch-save --id ID --revision N --name NAME --observation-start YYYY-MM-DD',
  '      --baseline-as-of YYYY-MM-DD [--watch-series PPIACO,GDP | --template TEMPLATE_ID]',
  '      [--observation-end as_of|YYYY-MM-DD --catch-up all_vintages|latest_vintage --page-size 1000 --max-rows 1000000]',
  '  release-plan-preview --watch WATCH_ID --after-release SHA [--before-release SHA]',
  '      [--section acquisitions|calendarChanges|vintageChanges|events|schedule --offset 0 --limit 100]',
  '  release-plan-save --id ID --revision N --watch WATCH_ID --after-release SHA --preview-id SHA',
  '      [--before-release SHA]',
  '  release-plan --plan PLAN_ID [--section acquisitions|calendarChanges|vintageChanges|events|schedule --offset 0 --limit 100]',
  '  release-vintage-capture --id ID --revision N --plan PLAN_ID --as-of YYYY-MM-DD',
  '',
  "DDP package migration and completed reconciliation:",
  "  ddp-sources [--kind crosswalks|packages|migrations|receivings --offset 0 --limit 50 --revision N]",
  "  ddp-crosswalk --crosswalk CROSSWALK_ID [--release H15 --query TEXT --offset 0 --limit 100]",
  "  ddp-crosswalk-import --id ID --revision N --input CROSSWALK_ALIAS [--sha256 FILE_SHA --crosswalk ID]",
  "  ddp-crosswalk-acquire --id ID --revision N [--url ORIGINAL_OFFICIAL_CSV_URL]",
  "  ddp-package --package PACKAGE_ID [--section series|observations --package-series ORIGINAL_SERIES_ID]",
  "      [--frequency ORIGINAL_FREQUENCY --query TEXT --offset 0 --limit 100]",
  "  ddp-package-import --id ID --revision N --input PACKAGE_ALIAS [--sha256 FILE_SHA --package ID]",
  "      Resume either staged source import using the same --id, --revision and original source ID.",
  "  ddp-migration-preview --package PACKAGE_ID --crosswalk CROSSWALK_ID --name NAME --as-of YYYY-MM-DD",
  "      [--window-file WINDOW.json --decisions-file DECISIONS.json --bindings-file BINDINGS.json]",
  "      [--bookmark ORIGINAL_DDP_URL --note-file TEXT --page-size 1000 --max-rows 1000000]",
  "      [--section series|acquisitions|mappings --offset 0 --limit 100]",
  "  ddp-migration-save --args-file EXACT_REVIEWED_SELECTION.json --id ID --revision N --preview-id SHA",
  "  ddp-migration --migration MIGRATION_ID [--section series|acquisitions|mappings --offset 0 --limit 100]",
  "  ddp-migration-acquire --id ID --revision N --migration MIGRATION_ID",
  "      [--source-mode API_VINTAGE|ALFRED_VINTAGE --metadata-input HOST_ALIAS]",
  "      [--metadata-file-sha256 RAW_FILE_SHA --metadata-sha256 SORTED_EDITION_SHA]",
  "      One original operation owns every source batch and its completed receiving.",
  "  ddp-receiving --receiving RECEIVING_ID [--package-series ORIGINAL_SERIES_ID]",
  "      [--changes-only true|false --offset 0 --limit 100]",
  "",
  'Portable complete customer workspaces:',
  '  handovers [--offset 0 --limit 50] | handover --id ORIGINAL_ID',
  '  handover-export --id ORIGINAL_ID --revision N --captured-at ISO_TIMESTAMP',
  '      [--publication-ids EDITION_ID,EDITION_ID --plan-input PLAN_ALIAS --plan-file-sha256 SHA]',
  '      [--use-current-plan true] retains the current received customer procedure.',
  '      Retry the original export with the same --id; retain its original selection.',
  '  handover-upload --id ORIGINAL_ID --input ARCHIVE_ALIAS [--sha256 ORIGINAL_SHA]',
  '  handover-inspect --id ORIGINAL_ID | handover-receive --id ORIGINAL_ID',
  '  handover-open --id ORIGINAL_ID',
  '  handover-download --id ORIGINAL_ID --sha256 ORIGINAL_SHA --out NEW_ARCHIVE.tar.gz',
  '      Streaming transfers preserve full bytes; status returns the original continuation phase.',
  '',
  'Complete current-publication editions:',
  '  published-operations [--offset 0 --limit 100]',
  '  published-operation --id ORIGINAL_PUBLICATION',
  '  published-start --id ORIGINAL_PUBLICATION --migration ORIGINAL_PLAN --revision ORIGINAL_REVISION',
  '  published-report --id ORIGINAL_PUBLICATION [--query TEXT --offset 0 --limit 100]',
  '  published-rows --id ORIGINAL_PUBLICATION --comparison ORIGINAL_COMPARISON',
  '      [--series-id ORIGINAL_SERIES --result-status DIFFERENT --offset 0 --limit 100]',
  '  published-file-read --id ORIGINAL_PUBLICATION --name EXACT_LISTED_PATH --sha256 EXACT_SHA',
  '      [--offset 0 --limit 196608]',
  '  published-download --id ORIGINAL_PUBLICATION --name edition-package.tar.gz --sha256 EXACT_SHA --out NEW_FILE',
  '',
  'Run the configured merchant and original customer:',
  '  merchant-start --publication SHA | merchant-stop --publication SHA',
  '  publication --publication SHA',
  '  requests --publication SHA [--offset 0 --limit 50 --view-sha SHA]',
  '  preview --publication SHA [--query QUERY]',
  '  prepare --publication SHA --intent ORIGINAL_ID [--query QUERY --previous-file PAGE_METADATA.json]',
  '          [--file ADVERTISED_FILE_PATH] [--accept N]',
  '  buy --publication SHA --intent ORIGINAL_ID',
  '  recover --publication SHA --intent ORIGINAL_ID',
  '',
  'Complete retained downloads and local project receiving:',
  '  download --kind source --capture SHA --out NEW_FILE [--sha256 FILE_SHA]',
  '  download --kind release-source --release-capture SHA --out NEW_CAPTURE.json [--sha256 FILE_SHA]',
  '  download --kind release-plan --plan PLAN_ID --out NEW_PLAN.json [--sha256 FILE_SHA]',
  '  download --kind ddp-crosswalk --crosswalk CROSSWALK_ID --out ORIGINAL_CROSSWALK.json',
  '  download --kind ddp-package --package PACKAGE_ID --out ORIGINAL_PACKAGE.json',
  '  download --kind ddp-migration --migration MIGRATION_ID --out COMPLETE_PLAN.json',
  '  download --kind ddp-receiving --receiving RECEIVING_ID --format json|csv|html --out COMPLETE_REPORT',
  '  download --kind comparison --before SHA --after SHA --out NEW_FILE',
  '  download --kind briefing --review SHA --format html|csv|json|manifest --out NEW_FILE',
  '  download --kind briefing-successor --successor SUCCESSOR_ID --format html|csv|json --out NEW_FILE',
  '  download --kind customer --publication SHA --intent ORIGINAL_ID --out NEW_FILE',
  '  download --kind project --out NEW_PROJECT_BUNDLE.json',
  '  bundle-inspect --source ORIGINAL_PROJECT_BUNDLE.json [--sha256 FILE_SHA]',
  '  receive --source ORIGINAL_PROJECT_BUNDLE.json --project EMPTY_PRIVATE_DIRECTORY [--sha256 FILE_SHA]',
  '  disconnect',
  '',
  'The original startup record stays private and is reread when the host restarts.',
  'After an interrupted mutation inspect its saved operation; recover the same buyer',
  'intent. Complete source and customer downloads retain their exact bytes and SHA.',
  'Receive uses the maintained FRED project receiver. Reopen that directory with',
  'starforge fred serve and retain its new startup record for the same project.',
  ''
].join('\n');

const fail = message => { throw new FredWorkspaceError('FRED_CLI_USAGE', message); };
const remote = new Set(['workspaces','status','inputs','input-inspect','records','record','operation','observations','compare','briefing-preview','briefing',
  'configure','capture','import','combine','select','review','publish','abandon','merchant-start','merchant-stop',
  'publication','requests','preview','prepare','buy','recover','disconnect',
  'briefing-templates','briefing-template-save','briefing-successor-preview','briefing-successor-save','briefing-successor',
  'release-captures','release-capture','release-import','release-acquire','release-watches','release-watch-save',
  'release-plan-preview','release-plan-save','release-plan','release-vintage-capture',
  'ddp-sources','ddp-crosswalk','ddp-crosswalk-import','ddp-crosswalk-acquire','ddp-package','ddp-package-import',
  'ddp-migration-preview','ddp-migration-save','ddp-migration','ddp-migration-acquire','ddp-receiving',
  'handovers','handover','handover-export','handover-upload','handover-inspect','handover-receive','handover-open',
  'published-operations','published-operation','published-start','published-report','published-rows','published-file-read']);
const allowed = new Set(['connection','workspace','args-file','out','console-url-file','project-id','binding-sha','label',
  'inputs-file','profiles-file','payment-file','merchant-origin','merchant-path','kind','id','capture','series','offset','limit','revision','before','after','input','sha256',
  'captures','review','profile','pending','publication','intent','query','file','accept','view-sha','selection-file',
  'policy-file','note-file','briefing-file','format','previous-file','wait-ms','source','project','help',
  'template','successor','name','window-file','previous-template','anchor-date','baseline-review','previous-successor','preview-id','changes-only',
  'release-capture','watch','plan','before-release','after-release','section','as-of','watch-series',
  'observation-start','observation-end','baseline-as-of','catch-up','page-size','max-rows',
  'crosswalk','package','migration','receiving','package-series','release','frequency','bookmark','url','decisions-file','bindings-file',
  'comparison','result-status','series-id','source-mode','metadata-input','metadata-file-sha256','metadata-sha256','captured-at','publication-ids','plan-input','plan-file-sha256','use-current-plan']);
function parse(values) {
  const argv = [...values], command = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'help', flags = {};
  while (argv.length) {
    const flag = argv.shift();
    if (!flag.startsWith('--') || !allowed.has(flag.slice(2))) fail('Unknown economic-workspace option. Read --help.');
    const key = flag.slice(2);
    if (Object.hasOwn(flags, key)) fail('Supply --' + key + ' once.');
    if (key === 'help') flags.help = true;
    else { if (!argv.length || argv[0].startsWith('--')) fail('Supply a value for --' + key + '.'); flags[key] = argv.shift(); }
  }
  return { command, flags };
}
const required = (flags, key) => flags[key] ?? fail('Supply --' + key + '.');
function number(value, label) {
  if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    fail('Supply an integer --' + label + '.');
  return Number(value);
}
async function jsonFile(path, maximum = 16 * 1024 * 1024) {
  const bytes = await readFredHostFile(path, maximum);
  let value; try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('Use complete JSON in the original input file.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Use a JSON object in the original input file.');
  return value;
}
async function jsonArrayFile(path) {
  const bytes = await readFredHostFile(path, 16 * 1024 * 1024);
  let value; try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('Use a complete JSON array in the reviewed decisions or bindings file.'); }
  if (!Array.isArray(value)) fail('Use a complete JSON array in the reviewed decisions or bindings file.');
  return value;
}
function only(flags, names) {
  for (const key of Object.keys(flags)) if (!names.includes(key)) fail('--' + key + ' is not used by this command.');
}
async function connectionInit(flags) {
  only(flags, ['out','console-url-file','workspace','project-id','binding-sha','label','inputs-file','profiles-file','payment-file','merchant-origin','merchant-path','profile']);
  if (flags['profiles-file'] && flags['payment-file']) fail('Choose the original profiles file or original payment file.');
  if (Boolean(flags['payment-file']) !== Boolean(flags['merchant-origin'])) fail('Supply --payment-file and --merchant-origin together.');
  if (!flags['payment-file'] && (flags.profile || flags['merchant-path'])) fail('Use --profile and --merchant-path with the original payment file.');
  const destination = resolve(required(flags, 'out')), workspace = flags.workspace ?? 'macro';
  const entry = { label: flags.label ?? 'Economic editions', consoleUrlFile: resolve(required(flags, 'console-url-file')),
    ...(flags['project-id'] ? { projectId: flags['project-id'] } : {}),
    ...(flags['binding-sha'] ? { expectedBindingSha256: flags['binding-sha'] } : {}),
    inputs: flags['inputs-file'] ? await jsonFile(flags['inputs-file'], 1024 * 1024) : {},
    merchantProfiles: flags['profiles-file'] ? await jsonFile(flags['profiles-file'], 1024 * 1024) : {} };
  if (flags['payment-file']) entry.merchantProfiles[flags.profile ?? 'native'] = { label: 'Original configured merchant',
    origin: flags['merchant-origin'], path: flags['merchant-path'] ?? '/economic-data', payment: await jsonFile(flags['payment-file'], 65536) };
  const value = { schema: FRED_WORKSPACE_CONNECTION_SCHEMA, workspaces: { [workspace]: entry } };
  // Inputs in a generated definition use original absolute paths, regardless of
  // where the complete input-alias file and connection file are retained.
  if (flags['inputs-file']) for (const input of Object.values(entry.inputs)) {
    if (input && typeof input.path === 'string') input.path = resolve(dirname(resolve(flags['inputs-file'])), input.path);
  }
  const temporary = resolve(dirname(destination), '.fred-connection-' + randomUUID());
  let handle, client, reused = false;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); await handle.close(); handle = null;
    const configured = await readFredWorkspaceConfiguration(temporary);
    client = new FredWorkspaceClient(configured.workspaces[workspace]);
    const launch = await client.launch();
    try { await link(temporary, destination); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const previous = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFredHostFile(destination, 1024 * 1024, { privateFile: true })));
      if (canonicalFredJSON(previous) !== canonicalFredJSON(value)) fail('The existing private connection belongs to another original definition.');
      reused = true;
    }
    return { schema: value.schema, connection: destination, workspace, projectId: launch.binding.projectId,
      bindingSha256: launch.binding.sha256, instanceId: launch.instanceId, reused };
  } finally { client?.close(); await handle?.close(); await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
async function toolArgs(flags, workspace) {
  const args = flags['args-file'] ? await jsonFile(flags['args-file']) : {};
  const put = (key, value) => {
    if (Object.hasOwn(args, key) && canonicalFredJSON(args[key]) !== canonicalFredJSON(value))
      fail('The complete request file disagrees with --' + key + '. Keep the original request.');
    args[key] = value;
  };
  if (workspace !== undefined) put('workspace', workspace);
  const strings = { kind:'kind', id:'id', capture:'captureId', series:'series', before:'before', after:'after',
    input:'input', sha256:'expectedSha256', review:'reviewId', profile:'profile', pending:'pendingId',
    publication:'publicationId', intent:'intentId', query:'query', file:'file', format:'format', 'view-sha':'expectedViewSha256',
    template:'templateId', successor:'successorId', name:'name', 'previous-template':'previousTemplateId',
    'anchor-date':'anchorDate', 'baseline-review':'baselineReviewId', 'previous-successor':'previousSuccessorId', 'preview-id':'previewId',
    'release-capture':'releaseCaptureId', watch:'watchId', plan:'planId', 'before-release':'beforeCaptureId',
    'after-release':'afterCaptureId', section:'section', 'as-of':'asOf', 'observation-start':'observationStart',
    'observation-end':'observationEnd', 'baseline-as-of':'baselineAsOf', 'catch-up':'catchUp',
    crosswalk:'crosswalkId', package:'packageId', migration:'migrationId', receiving:'receivingId',
    'package-series':'seriesId', release:'release', frequency:'frequency', bookmark:'bookmark', url:'url',
    comparison:'comparisonId', 'result-status':'status', 'series-id':'seriesId',
    'captured-at':'capturedAt','plan-input':'planInput','plan-file-sha256':'planFileSha256',
    'source-mode':'sourceMode', 'metadata-input':'metadataInput', 'metadata-file-sha256':'metadataFileSha256', 'metadata-sha256':'metadataSha256' };
  for (const [flag, key] of Object.entries(strings)) if (flags[flag] !== undefined) put(key, flags[flag]);
  for (const [flag, key] of Object.entries({ offset:'offset', limit:'limit', revision:'expectedRevision', accept:'acceptIndex', 'page-size':'pageSize', 'max-rows':'maxRows' }))
    if (flags[flag] !== undefined) put(key, number(flags[flag], flag));
  if(flags['use-current-plan']!==undefined){
    if(!['true','false'].includes(flags['use-current-plan']))fail('Use --use-current-plan true or false.');
    put('useCurrentPlan',flags['use-current-plan']==='true');
  }
  if (flags['publication-ids'] !== undefined) put('publicationIds', flags['publication-ids'] ? flags['publication-ids'].split(',') : []);
  if (flags.captures !== undefined) put('captureIds', flags.captures.split(','));
  if (flags['watch-series'] !== undefined) put('series', flags['watch-series'].split(','));
  for (const [flag, key] of Object.entries({ 'selection-file':'selection', 'policy-file':'policy', 'previous-file':'previous', 'briefing-file':'briefing', 'window-file':'window' }))
    if (flags[flag] !== undefined) put(key, await jsonFile(flags[flag]));
  for (const [flag, key] of Object.entries({ 'decisions-file':'decisions', 'bindings-file':'bindings' }))
    if (flags[flag] !== undefined) put(key, await jsonArrayFile(flags[flag]));
  if (flags['note-file'] !== undefined) put('note', (await readFredHostFile(flags['note-file'], 32768)).toString('utf8'));
  if (flags['changes-only'] !== undefined) {
    if (!['true', 'false'].includes(flags['changes-only'])) fail('Use --changes-only true or --changes-only false.');
    put('changesOnly', flags['changes-only'] === 'true');
  }
  return args;
}
export async function runFredWorkspaceCLI(argv, { write = value => process.stdout.write(value) } = {}) {
  const { command, flags } = parse(argv);
  const done = value => { write(JSON.stringify(value, null, 2) + '\n'); return value; };
  if (command === 'help' || flags.help) { write(FRED_WORKSPACE_HELP); return { help: true }; }
  if (command === 'connection-init') return done(await connectionInit(flags));
  if (command === 'bundle-inspect') {
    only(flags, ['source','sha256']);
    return done(await inspectFredWorkspaceFile(required(flags, 'source'), { expectedSha256: flags.sha256 }));
  }
  if (command === 'receive') {
    only(flags, ['source','project','sha256']);
    return done(await receiveFredWorkspaceFile(required(flags, 'source'), required(flags, 'project'), { expectedSha256: flags.sha256 }));
  }
  if (!remote.has(command) && !['download', 'published-download', 'handover-download', 'wait'].includes(command)) fail('Choose an economic-workspace command from --help.');
  const config = await readFredWorkspaceConfiguration(required(flags, 'connection'));
  const aliases = Object.keys(config.workspaces);
  const workspace = flags.workspace ?? (aliases.length === 1 ? aliases[0] : undefined);
  if (command !== 'workspaces' && (!workspace || !config.workspaces[workspace])) fail('Choose --workspace from this original connection.');
  const args = await toolArgs(flags, command === 'workspaces' ? undefined : workspace);
  const setupFlags = ['out','console-url-file','project-id','binding-sha','label','inputs-file','profiles-file','payment-file','merchant-origin','merchant-path','source','project'];
  if (!['download', 'published-download', 'handover-download'].includes(command) && setupFlags.some(key => flags[key] !== undefined)) fail('A setup or download option was supplied to a remote operation.');
  if (flags['wait-ms'] !== undefined && command !== 'wait') fail('Use wait with the same original project operation ID.');
  if (command === 'download' || command === 'published-download' || command === 'handover-download' || command === 'wait') {
    const client = new FredWorkspaceClient(config.workspaces[workspace]);
    try {
      if (command === 'handover-download') {
        if (Object.keys(args).some(key => !['workspace','id','expectedSha256'].includes(key)) ||
            setupFlags.filter(key=>key!=='out').some(key=>flags[key]!==undefined))
          fail('Download the exact original handover archive into a new file.');
        return done(await client.downloadOperatingHandover({id:args.id,expectedSha256:args.expectedSha256},required(flags,'out')));
      }
      if (command === 'published-download') {
        if (Object.keys(args).some(key => !['workspace', 'id', 'name', 'expectedSha256'].includes(key)) ||
            setupFlags.filter(key => key !== 'out').some(key => flags[key] !== undefined))
          fail('Download the exact listed original publication member into a new file.');
        return done(await client.downloadPublishedFile({ id: args.id, name: args.name, expectedSha256: args.expectedSha256 }, required(flags, 'out')));
      }
      if (command === 'wait') {
        if (Object.keys(args).some(key => !['workspace', 'id'].includes(key))) fail('Wait selects only the original operation ID.');
        return done(await client.wait(args.id, { timeoutMs: flags['wait-ms'] ? number(flags['wait-ms'], 'wait-ms') : 60000 }));
      }
      if (setupFlags.filter(key => key !== 'out').some(key => flags[key] !== undefined)) fail('Download uses only its original file selection and destination.');
      if (Object.keys(args).some(key => !['workspace','expectedSha256',...Object.keys(fredFileSelection)].includes(key)))
        fail('Download selects only the complete original file and optional expected SHA256.');
      const selection = Object.fromEntries(Object.keys(fredFileSelection).filter(key => args[key] !== undefined).map(key => [key, args[key]]));
      return done(await saveFredFile(client, selection, required(flags, 'out'), { expectedSha256: args.expectedSha256 }));
    } finally { client.close(); }
  }
  const adapter = new MerchantFredWorkspaces({ fredWorkspaces: config, exportsDirectory: dirname(config.path) });
  try { return done(await adapter.call('merchant_fred_' + command.replaceAll('-', '_'), args)); }
  finally { await adapter.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  runFredWorkspaceCLI(process.argv.slice(2)).catch(error => {
    process.stderr.write(JSON.stringify({ code: error.code ?? 'FRED_WORKSPACE_FAILED', message: error.message,
      ...(error.status ? { status: error.status } : {}), ...(error.operationId ? { operationId: error.operationId } : {}),
      ...(error.ambiguous !== undefined ? { ambiguous: error.ambiguous } : {}),
      ...(error.retryAt ? { retryAt: error.retryAt } : {}) }) + '\n'); process.exitCode = 1;
  });
