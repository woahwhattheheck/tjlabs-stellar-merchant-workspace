// MIT. Continue an existing complete export without changing its frozen product source.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const require = createRequire(import.meta.url);
const {orderSourcesForCheckpoint, compactPreparedPayloads} = require('./checkpoint-source-order.cjs');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i].startsWith('--') || process.argv[i+1] === undefined) throw Error('Supply named option/value pairs');
  const name = process.argv[i].slice(2);
  if (Object.hasOwn(args, name)) throw Error('Repeated option ' + name);
  args[name] = process.argv[i+1];
}
for (const name of ['product-root','input-manifest','input-root','output'])
  if (!args[name] || !path.isAbsolute(args[name])) throw Error('Supply absolute --' + name);
if (!/^[a-f0-9]{64}$/.test(args['checkpoint-sha256'] || '')) throw Error('Supply the exact --checkpoint-sha256');
const allowed = new Set(['product-root','input-manifest','input-root','output','checkpoint-sha256','max-archive-bytes','max-uncompressed-bytes','max-entries','lock-held']);
for (const name of Object.keys(args)) if (!allowed.has(name)) throw Error('Unknown option ' + name);
const output = args.output;
async function syncDirectory(directory) { const handle = await fs.open(directory, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
const firstCreated = await fs.mkdir(output, {recursive:true});
if (firstCreated) { for (let at=output;;at=path.dirname(at)) { await syncDirectory(at); if(at===path.dirname(firstCreated)) break; } }
if (args['lock-held'] !== 'true') {
  if (args['lock-held'] !== undefined) throw Error('Invalid internal lock option');
  const code = await new Promise((resolve,reject) => {
    const child = spawn('flock', ['--exclusive','--nonblock',path.join(output,'.complete-export.lock'),process.execPath,process.argv[1],...process.argv.slice(2),'--lock-held','true'], {stdio:'inherit'});
    child.once('error', reject); child.once('exit', (code, signal) => signal ? reject(Error('Native continuation interrupted: '+signal)) : resolve(code));
  });
  process.exitCode = code;
} else {
  const product = args['product-root'];
  const importProduct = leaf => import(pathToFileURL(path.join(product, leaf)).href);
  const [runtime, exports, desk, engine] = await Promise.all([importProduct('runtime.mjs'),importProduct('host/export.mjs'),importProduct('src/build-installed.mjs'),importProduct('host/export-core.mjs')]);
  const {core,originalSessions,sessions,codec} = runtime;
  const zip = require(path.join(product,'src/connected_zip.cjs'));
  const storage = require(path.join(product,'receiving/checkpoint-storage.cjs'));
  const reader = require(path.join(product,'receiving/checkpoint-reader.cjs'));
  const files = await exports.moduleSources();
  const input = JSON.parse(await fs.readFile(args['input-manifest'],'utf8'));
  const safeInput = relative => {
    if(typeof relative!=='string'||path.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(x=>!x||x==='.'||x==='..')) throw Error('Unsafe input fragment path');
    return path.join(args['input-root'],relative);
  };
  let compact = '';
  for(const row of input.parts) {
    const text = await fs.readFile(safeInput(row.path),'utf8');
    if(codec.utf8Encode(text).length!==row.bytes || codec.hashText(text)!==row.sha256) throw Error('Complete input fragment changed');
    compact += text;
  }
  const inputSha = input.compactSha256 || input.sha256;
  if(codec.hashText(compact)!==inputSha || codec.utf8Encode(compact).length!==(input.compactBytes||input.bytes)) throw Error('Complete input identity changed');
  const workload = reader(JSON.parse(compact)); compact = '';
  const state = workload.read(workload.field(workload.root,'state'));
  const records = workload.sequence(workload.field(workload.root,'records')), editions = workload.sequence(workload.field(workload.root,'editions'));
  const indexPath = path.join(output,'checkpoint.json'), indexText = await fs.readFile(indexPath,'utf8');
  if(codec.hashText(indexText)!==args['checkpoint-sha256']) throw Error('Checkpoint text differs from selected immutable input');
  const priorIndex = JSON.parse(indexText);
  const checkpoint = await storage.restore(priorIndex, relative => {
    if(typeof relative!=='string'||!/^objects\/[a-f0-9]{64}\.part$/.test(relative)) throw Error('Unsafe prepared object path');
    return fs.readFile(path.join(output,relative),'utf8');
  }, codec);
  const orderedFiles = orderSourcesForCheckpoint(files,checkpoint,codec);
  const archiveLimits = {};
  for (const [arg,key] of [['max-archive-bytes','maxBytes'],['max-uncompressed-bytes','maxUncompressedBytes'],['max-entries','maxEntries']]) {
    if(args[arg]!==undefined) {
      if(!/^[0-9]+$/.test(args[arg])||!Number.isSafeInteger(Number(args[arg]))) throw Error('Choose a safe whole-number '+arg);
      archiveLimits[key] = Number(args[arg]);
    }
  }
  const makeJob = engine.createDistributionLotOrderStudyExportJob;
  if(typeof makeJob!=='function' || typeof desk.buildDistributionLotOrderStudyDesk!=='function') throw Error('Select the complete Distribution installed product');
  const job = makeJob(orderedFiles,state,records,editions,{codec,core,originalSessions,sessions,buildDesk:desk.buildDistributionLotOrderStudyDesk,zip},{verifiedInputSha256:inputSha,checkpoint,archiveLimits});
  const objectDirectory = path.join(output,'objects');
  await fs.mkdir(objectDirectory,{recursive:true}); await syncDirectory(output);
  const durable = new Set([...priorIndex.metadata.parts,...priorIndex.payloads.flatMap(x=>x.parts)].map(row=>row.path));
  let serial=0;
  async function atomic(name, body, immutable=false) {
    const destination=path.join(output,name), temporary=destination+'.pending-'+process.pid+'-'+serial++;
    const handle=await fs.open(temporary,'wx');
    try { await handle.writeFile(body,'utf8'); await handle.sync(); } finally { await handle.close(); }
    try {
      if(immutable) {
        try { await fs.link(temporary,destination); }
        catch(error) { if(error.code!=='EEXIST') throw error; if(await fs.readFile(destination,'utf8')!==body) throw Error('Existing prepared object differs'); }
        await fs.unlink(temporary);
      } else await fs.rename(temporary,destination);
      await syncDirectory(path.dirname(destination));
    } catch(error) { await fs.unlink(temporary).catch(()=>{}); throw error; }
  }
  const prepare=storage.createPreparer(codec); let progress=job.statistics();
  while(!progress.done) {
    progress=job.run({maxGroups:8,maxMilliseconds:25000});
    const saved=prepare(compactPreparedPayloads(job.checkpoint()));
    for(const [name,body] of Object.entries(saved.objects)) { if(durable.has(name)) continue; await atomic(name,body,true); durable.add(name); }
    await atomic('checkpoint.json',JSON.stringify(saved.manifest)+'\n');
    process.stdout.write(JSON.stringify({...progress,checkpointSha256:codec.hashText(JSON.stringify(saved.manifest)+'\n')})+'\n');
  }
  const finalText=await fs.readFile(indexPath,'utf8');
  const receipt={schema:'commons.complete-prepared-export-native-continuation.v1',checkpoint:indexPath,checkpointSha256:codec.hashText(finalText),originalCheckpointSha256:args['checkpoint-sha256'],identity:checkpoint.identity,complete:true,sourceFiles:Object.keys(orderedFiles).length,inputSha256:inputSha,requests:records.length,editions:editions.length,completedGroups:progress.completedGroups};
  await atomic('native-continuation.json',JSON.stringify(receipt,null,2)+'\n');
  process.stdout.write(JSON.stringify(receipt)+'\n');
}
