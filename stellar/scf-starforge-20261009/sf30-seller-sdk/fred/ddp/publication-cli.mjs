#!/usr/bin/env node
// MIT. Complete retained publication desk, same-project continuation and original file exports.
import { constants } from 'node:fs';
import { open,link,unlink } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID,createHash } from 'node:crypto';
import { need } from '../model.mjs';
import { listFredDdpPublicationOperations,readFredDdpPublicationOperation,runFredDdpPublicationOperation,
  attachFredDdpPublishedProgramme,readFredDdpPublicationReport,pageFredDdpPublicationRows,openFredDdpPublicationFile } from './published-workspace.mjs';
export const USAGE = [
  'Retained complete DDP current-publication editions',
  '',
  'starforge fred ddp-publication list --project ABS [--offset N --limit N]',
  'starforge fred ddp-publication status --project ABS --id ORIGINAL',
  'starforge fred ddp-publication run --project ABS --id ORIGINAL --migration ID --expected-revision N',
  'starforge fred ddp-publication resume --project ABS --id ORIGINAL',
  'starforge fred ddp-publication attach --project ABS --id ORIGINAL --migration ID --expected-revision N',
  '  --workspace ABS [--output current-publication --manifest published-targets/manifest.json]',
  'starforge fred ddp-publication report --project ABS --id ORIGINAL [--query TEXT --offset N --limit N]',
  'starforge fred ddp-publication rows --project ABS --id ORIGINAL --comparison ID [--series ID --status STATUS --offset N --limit N]',
  'starforge fred ddp-publication file --project ABS --id ORIGINAL --name ORIGINAL_PATH --sha256 SHA --out ABS',
  '',
  'Run uses the saved original migration and collects a complete new edition.',
  'Resume continues the same retained request and completed source files.',
  'Attach opens an already completed original programme without collecting another source.',
  'File streams a listed complete edition member or edition-package.tar.gz to a create-only destination.',
  'The full archive carries the original native project, all source files, complete rows and original programme inputs.'
].join('\n');
const allowed = {list:['offset','limit'],status:['id'],run:['id','migration','expected-revision'],resume:['id'],
  attach:['id','migration','expected-revision','workspace','output','manifest'],report:['id','query','offset','limit'],
  rows:['id','comparison','series','status','offset','limit'],file:['id','name','sha256','out']};
function parse(args) {
  const [command,...rest] = args; need(Object.hasOwn(allowed,command),'Choose a retained publication command; use --help.');
  const flags = {};
  for(let i = 0;i < rest.length;i++) {
    const name = rest[i].startsWith('--') ? rest[i].slice(2) : '';
    need(['project',...allowed[command]].includes(name) && !Object.hasOwn(flags,name) &&
      typeof rest[i + 1] === 'string' && rest[i + 1].length && !rest[i + 1].startsWith('--'),
      'Supply each declared command option and its complete value.');
    flags[name] = rest[++i];
  }
  need(flags.project,'--project selects the original private economic project.');
  return {command,flags};
}
const number = (value,fallback) => { if(value === undefined) return fallback;
  need(/^\d+$/.test(value) && Number.isSafeInteger(Number(value)),'Supply a complete integer option.'); return Number(value); };
async function writeOriginal(selected,destination) {
  need(typeof destination === 'string' && destination.length,'--out selects a new original-file destination.');
  const path = resolve(destination), temporary = path + '.' + randomUUID() + '.part';
  const output = await open(temporary,constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,0o600);
  const hash = createHash('sha256'); let bytes = 0;
  try {
    for await(const chunk of selected.file.createReadStream({autoClose:false})) {
      hash.update(chunk); bytes += chunk.length; let offset = 0;
      while(offset < chunk.length) { const value = await output.write(chunk,offset,chunk.length - offset);
        need(value.bytesWritten > 0,'The original download destination stopped accepting bytes.'); offset += value.bytesWritten; }
    }
    const sha256 = hash.digest('hex');
    need(bytes === selected.descriptor.bytes && sha256 === selected.descriptor.sha256,'The complete original download changed.');
    await output.sync(); await output.close(); await link(temporary,path);
    const directory = await open(dirname(path),constants.O_RDONLY); try { await directory.sync(); } finally { await directory.close(); }
    return {projectId:selected.projectId,operationId:selected.operationId,destination:path,bytes,sha256};
  } finally { await output.close().catch(() => {}); await selected.file.close();
    await unlink(temporary).catch(error => { if(error.code !== 'ENOENT') throw error; }); }
}
export async function main(args = process.argv.slice(2),io = {}) {
  const stdout = io.stdout ?? process.stdout;
  if(!args.length || args.includes('--help')) { stdout.write(USAGE + '\n'); return {help:true}; }
  const {command,flags} = parse(args), directory = resolve(flags.project);
  const common = {directory,id:flags.id},page = {offset:number(flags.offset,0),limit:number(flags.limit,100)};
  const abort = new AbortController(), stop = () => abort.abort(new Error('Continue the original retained publication operation.'));
  process.once('SIGINT',stop); process.once('SIGTERM',stop);
  try {
    let result;
    if(command === 'list') result = await listFredDdpPublicationOperations({directory,...page});
    else if(command === 'status') result = await readFredDdpPublicationOperation(common);
    else if(command === 'run' || command === 'attach') {
      const request = {...common,migrationId:flags.migration,expectedRevision:number(flags['expected-revision']),signal:abort.signal};
      if(command === 'run') result = await runFredDdpPublicationOperation(request);
      else { need(flags.workspace,'--workspace selects the complete existing original programme.');
        result = await attachFredDdpPublishedProgramme({...request,workspace:flags.workspace,output:flags.output,manifest:flags.manifest}); }
    } else if(command === 'resume') {
      const original = await readFredDdpPublicationOperation(common);
      result = await runFredDdpPublicationOperation({...common,migrationId:original.migrationId,expectedRevision:original.expectedRevision,signal:abort.signal});
    } else if(command === 'report') result = await readFredDdpPublicationReport({...common,...page,query:flags.query ?? ''});
    else if(command === 'rows') result = await pageFredDdpPublicationRows({...common,...page,comparisonId:flags.comparison,
      seriesId:flags.series ?? null,status:flags.status ?? null});
    else if(command === 'file') result = await writeOriginal(await openFredDdpPublicationFile({...common,name:flags.name,expectedSha256:flags.sha256}),flags.out);
    stdout.write(JSON.stringify(result,null,2) + '\n'); return result;
  } finally { process.removeListener('SIGINT',stop); process.removeListener('SIGTERM',stop); }
}
if(process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { process.stderr.write((error.code ? error.code + ': ' : '') + error.message + '\n'); process.exitCode = 1; });
