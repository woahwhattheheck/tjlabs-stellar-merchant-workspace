#!/usr/bin/env node
// MIT. Complete current-publication comparison and original project receiving.
import { readFile,writeFile,mkdir,link,unlink,stat } from 'node:fs/promises';
import { resolve,join,basename } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { need,canonical } from '../model.mjs';
import { hash,validateCapture } from '../source.mjs';
import { initializeFredProject,readFredProject,importFredCapture,importFredDdpCrosswalk,importFredDdpPackage,
  previewFredDdpMigration,saveFredDdpMigration,exportFredProject,receiveFredProject } from '../project.mjs';
import { fredDdpFileBytes } from './files.mjs';
import { validateFredDdpMigrationPlan } from './migration.mjs';
import { createFredPublishedSourceCaptures,originalFredPublishedTransports } from './published-source.mjs';
import { compareFredDdpCurrentPublication } from './published-comparison.mjs';

export const USAGE=`Complete DDP current publications and customer receiving

starforge fred-ddp-published collect --workspace ABS --plan JSON [--intake published-targets]
starforge fred-ddp-published run --workspace ABS --package JSON --crosswalk JSON --plan JSON
  [--project retained-project --receive received-project --output current-publication]
  [--manifest published-targets/manifest.json --collect --intake published-targets]
starforge fred-ddp-published receive --workspace ABS --bundle JSON --project EMPTY_DIR
  [--originals original-sources]

Paths other than --workspace resolve inside that workspace unless absolute.
Run collects every original mapped series when --collect is supplied, compares
all selected source periods, saves the complete native economic project, receives
it independently and materializes every retained original public transport.
Complete collections resume without refetching already retained source bytes.
The current-publication retrieval basis travels with the original public captures.
Use a new intake directory when collecting a later source edition.`;

const load=async path=>JSON.parse(await readFile(path,'utf8'));
async function exists(path){try{await stat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function exactFile(path,body){
  body=Buffer.isBuffer(body)?body:Buffer.from(body);await mkdir(resolve(path,'..'),{recursive:true});
  if(await exists(path)){
    const retained=await readFile(path);need(retained.length===body.length&&hash(retained)===hash(body),
      'This completed output retains another original source or project.','FRED_PUBLISHED_OUTPUT_CONFLICT',409);return;
  }
  const temporary=path+'.'+randomUUID()+'.part';
  try{await writeFile(temporary,body,{flag:'wx',mode:0o600});
    try{await link(temporary,path);}catch(error){if(error.code!=='EEXIST')throw error;const retained=await readFile(path);
      need(retained.length===body.length&&hash(retained)===hash(body),'The receiving output changed concurrently.');}
  }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}

export async function collectFredDdpCurrentPublications({workspace,planPath,intake='published-targets',stdout=process.stdout,stderr=process.stderr,signal}={}){
  const script=fileURLToPath(new URL('./published-collector.py',import.meta.url));
  await new Promise((accept,reject)=>{
    const child=spawn('python3',[script,'--workspace',resolve(workspace),'--plan',resolve(workspace,planPath),'--output',intake],
      {stdio:['ignore','pipe','pipe'],signal});
    child.stdout.on('data',bytes=>stdout.write(bytes.toString('utf8')));child.stderr.on('data',bytes=>stderr.write(bytes.toString('utf8')));
    child.once('error',reject);child.once('exit',(code,terminated)=>code===0?accept():reject(Object.assign(new Error(
      'Original publication collection ended with '+(terminated??code)+'. Retained completed sources are available for resuming.'),{code:'FRED_PUBLISHED_COLLECTION_FAILED'})));
  });
  return load(resolve(workspace,intake,'manifest.json'));
}

export async function materializeFredPublishedOriginals({bundle,directory}={}){
  let publicFiles=0,publicBytes=0,boardFiles=0,boardBytes=0;
  const seriesOwners=new Map();
  for(const capture of bundle.captures??[])for(const source of originalFredPublishedTransports(capture)){
    const owners=seriesOwners.get(source.seriesId)??new Set();owners.add(capture.captureSha256);seriesOwners.set(source.seriesId,owners);
  }
  for(const capture of bundle.captures??[])for(const source of originalFredPublishedTransports(capture)){
    need(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(source.seriesId),'Use the original retained public series ID.');
    const name=basename(source.path);need(['metadata.html','observations.csv'].includes(name),'Materialize an original metadata or observation member.');
    const parts=['fred',source.seriesId];
    if(seriesOwners.get(source.seriesId).size>1){
      need(/^[a-f0-9]{64}$/.test(capture.captureSha256),'Retain every original publication capture identity.');
      parts.push(capture.captureSha256);
    }
    await exactFile(join(resolve(directory),...parts,name),source.body);publicFiles++;publicBytes+=source.body.length;
  }
  for(const capture of [...bundle.ddpCrosswalks??[],...bundle.ddpPackages??[]]){
    need(/^fred-ddp-(?:package|crosswalk)-[a-f0-9]{64}$/.test(capture.id),'Materialize the original Board capture identity.');
    for(const file of [capture.file,...capture.supplementalFiles??[]]){
      const body=fredDdpFileBytes(file);need(basename(file.name)===file.name,'Retain the original Board filename.');
      await exactFile(join(resolve(directory),'board',capture.id,file.name),body);boardFiles++;boardBytes+=body.length;
    }
  }
  return {publicFiles,publicBytes,boardFiles,boardBytes};
}

export async function runFredDdpPublishedProgramme({workspace,packagePath,crosswalkPath,planPath,manifestPath=null,
  project='retained-project',receive='received-project',output='current-publication',collect=false,intake='published-targets',
  stdout=process.stdout,stderr=process.stderr,signal}={}){
  workspace=resolve(workspace);const directory=resolve(workspace,project),destination=resolve(workspace,receive),out=resolve(workspace,output),started=performance.now();
  need(directory!==destination,'Receive the complete project into its own destination.');
  const packageCapture=await load(resolve(workspace,packagePath)),crosswalk=await load(resolve(workspace,crosswalkPath)),plan=await load(resolve(workspace,planPath));
  validateFredDdpMigrationPlan(plan,{packageCapture,crosswalk});need(plan.summary.ready&&plan.acquisitions.length,'Use the complete ready original migration plan.');
  if(collect)await collectFredDdpCurrentPublications({workspace,planPath,intake,stdout,stderr,signal});
  const manifest=await load(resolve(workspace,manifestPath??join(intake,'manifest.json')));await mkdir(out,{recursive:true});
  const report=await compareFredDdpCurrentPublication({packageCapture,crosswalk,plan,manifest,directory:workspace,outputDirectory:join(out,'comparison'),
    onProgress:value=>stdout.write(JSON.stringify({step:'comparison',...value})+'\n')});
  if(!await exists(join(directory,'project.json')))await initializeFredProject({directory,title:'Complete original DDP current publications',selection:plan.acquisitions[0].selection});
  let state=await readFredProject(directory);
  if(!(state.ddpCrosswalks??[]).some(source=>source.id===crosswalk.id))await importFredDdpCrosswalk({directory,
    id:'published-crosswalk-'+crosswalk.captureSha256,expectedRevision:state.revision,capture:crosswalk});
  state=await readFredProject(directory);
  if(!(state.ddpPackages??[]).some(source=>source.id===packageCapture.id))await importFredDdpPackage({directory,
    id:'published-package-'+packageCapture.captureSha256,expectedRevision:state.revision,capture:packageCapture});
  state=await readFredProject(directory);
  if(!(state.ddpMigrations??[]).some(migration=>migration.id===plan.id)){
    const request={directory,packageId:packageCapture.id,crosswalkId:crosswalk.id,...plan.input};
    const preview=await previewFredDdpMigration(request);state=await readFredProject(directory);
    const saved=await saveFredDdpMigration({...request,id:'published-plan-'+plan.id.split('-').at(-1),expectedRevision:state.revision,previewId:preview.previewId});
    need(saved.migrationId===plan.id,'The original complete saved migration identity changed.');
  }
  const captures=await createFredPublishedSourceCaptures({directory:workspace,manifest,batchSize:10});let observations=0;
  for(const capture of captures){
    signal?.throwIfAborted();const model=validateCapture(capture);observations+=model.rowCount;state=await readFredProject(directory);
    if(!state.captures.some(source=>source.id===capture.captureSha256))await importFredCapture({directory,
      id:'current-published-'+capture.captureSha256,expectedRevision:state.revision,capture});
    stdout.write(JSON.stringify({step:'original-public-capture-retained',captureSha256:capture.captureSha256,rows:model.rowCount,timeBasis:model.timeBasis})+'\n');
  }
  const bundlePath=join(out,'original-project-with-current-publications.json');let bundle;
  if(await exists(bundlePath)){
    bundle=await load(bundlePath);
    state=await readFredProject(directory);
    need(bundle.state?.id===state.id&&
      (bundle.ddpPackages??[]).some(source=>source.id===packageCapture.id&&source.captureSha256===packageCapture.captureSha256)&&
      (bundle.ddpCrosswalks??[]).some(source=>source.id===crosswalk.id&&source.captureSha256===crosswalk.captureSha256)&&
      (bundle.ddpMigrations??[]).some(saved=>saved.id===plan.id)&&
      captures.every(capture=>(bundle.captures??[]).some(source=>source.captureSha256===capture.captureSha256)),
      'Resume the complete original publication snapshot and its exact source population.','FRED_PUBLISHED_OUTPUT_CONFLICT',409);
  }else{
    bundle=await exportFredProject({directory});await exactFile(bundlePath,JSON.stringify(bundle));
  }
  const received=await receiveFredProject({directory:destination,bundle}),reopened=await exportFredProject({directory:destination});
  need(reopened.bundleSha256===bundle.bundleSha256,'The complete customer export identity changed during receiving.');
  const originals=await materializeFredPublishedOriginals({bundle:reopened,directory:join(destination,'original-sources')});
  const summary={schema:'tjlabs.scf-fred-ddp-current-published-programme.v1',finishedAt:new Date().toISOString(),comparisonId:report.id,
    summary:report.summary,sourceMode:'PUBLIC_TABLE',timeBasis:'PUBLIC_TABLE_RETRIEVAL_DATE',captureCount:captures.length,observations,
    bundleSchema:bundle.schema,bundleSha256:bundle.bundleSha256,projectId:bundle.state.id,received,
    exactOriginalFiles:originals.publicFiles,exactOriginalBytes:originals.publicBytes,originals,elapsedMs:performance.now()-started,memory:process.memoryUsage()};
  const summaryPath=join(out,'programme-summary.json');
  if(await exists(summaryPath)){
    const retained=await load(summaryPath);need(retained.schema===summary.schema&&retained.projectId===summary.projectId&&
      retained.comparisonId===summary.comparisonId&&retained.bundleSha256===summary.bundleSha256&&
      retained.captureCount===summary.captureCount&&retained.observations===summary.observations&&
      retained.sourceMode===summary.sourceMode&&retained.timeBasis===summary.timeBasis&&canonical(retained.summary)===canonical(summary.summary),
      'This complete output belongs to another source edition; choose its own output directory.','FRED_PUBLISHED_OUTPUT_CONFLICT',409);
    return retained;
  }else await exactFile(summaryPath,JSON.stringify(summary,null,2)+'\n');
  return summary;
}

export async function main(argv=process.argv.slice(2),io={}){
  const stdout=io.stdout??process.stdout,stderr=io.stderr??process.stderr;
  if(!argv.length||argv.includes('--help')){stdout.write(USAGE+'\n');return {help:true};}
  const [command,...args]=argv;need(['collect','run','receive'].includes(command),'Use fred-ddp-published --help.');
  const allowed={collect:['workspace','plan','intake'],run:['workspace','package','crosswalk','plan','project','receive','output','manifest','collect','intake'],
    receive:['workspace','bundle','project','originals']}[command],flags={};
  for(let index=0;index<args.length;index++){
    const flag=args[index];need(flag.startsWith('--')&&allowed.includes(flag.slice(2))&&!Object.hasOwn(flags,flag.slice(2)),'Unknown or duplicate command option: '+flag);
    if(flag==='--collect')flags.collect=true;else{need(typeof args[index+1]==='string'&&!args[index+1].startsWith('--'),'Supply '+flag+'.');flags[flag.slice(2)]=args[++index];}
  }
  need(typeof flags.workspace==='string','--workspace is required.');const workspace=resolve(flags.workspace);let result;
  if(command==='collect'){
    need(flags.plan,'--plan is required.');const manifest=await collectFredDdpCurrentPublications({workspace,planPath:flags.plan,intake:flags.intake,...io,stdout,stderr});
    result={seriesCount:manifest.seriesCount,observationCount:manifest.observationCount,errors:manifest.errors};
  }else if(command==='run'){
    need(flags.package&&flags.crosswalk&&flags.plan,'--package, --crosswalk and --plan are required.');
    result=await runFredDdpPublishedProgramme({workspace,packagePath:flags.package,crosswalkPath:flags.crosswalk,planPath:flags.plan,
      manifestPath:flags.manifest,project:flags.project,receive:flags.receive,output:flags.output,collect:flags.collect,intake:flags.intake,...io,stdout,stderr});
  }else{
    need(flags.bundle&&flags.project,'--bundle and --project are required.');const bundle=await load(resolve(workspace,flags.bundle)),directory=resolve(workspace,flags.project);
    const receipt=await receiveFredProject({directory,bundle}),reopened=await exportFredProject({directory});
    need(reopened.bundleSha256===bundle.bundleSha256,'The complete customer receiving changed the original bundle identity.');
    result={receipt,originals:await materializeFredPublishedOriginals({bundle:reopened,directory:resolve(workspace,flags.originals??'original-sources')})};
  }
  stdout.write(JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{
  console.error(JSON.stringify({code:error.code??'FRED_PUBLISHED_PROGRAMME_FAILED',message:error.message}));process.exitCode=1;
});
