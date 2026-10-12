#!/usr/bin/env node
// MIT. Direct original-engine capture and private source inspection.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { collectCouchdbCapture, readCouchdbCapture } from './capture.mjs';
import { captureView, inspectCouchdbFields, compareCouchdbCaptures } from './inspection.mjs';
import { readCouchdbSourceFile } from './declaration.mjs';
import { inspectCouchdbSource } from './source.mjs';
import { readJson, only, need, safeIssue } from './common.mjs';
export async function couchdbMain(argv=process.argv.slice(2)){
  const command=argv.shift()??'help',options={};
  for(let i=0;i<argv.length;i++){need(argv[i].startsWith('--')&&argv[i+1]&&!Object.hasOwn(options,argv[i].slice(2)),'COUCHDB_CLI_OPTION_INVALID');options[argv[i].slice(2)]=argv[++i];}
  let result;
  if(command==='capture'){
    only(options,['connection','directory','id','base','base-sha256'],'COUCHDB_CLI_OPTION_INVALID');
    const connection=await readJson(resolve(options.connection),268435456);
    result=captureView(await collectCouchdbCapture({directory:resolve(options.directory),connection,id:options.id??randomUUID(),
      baseCaptureFile:options.base?resolve(options.base):null,baseCaptureSha256:options['base-sha256']??null}));
  }else if(command==='inspect'||command==='fields'){
    only(options,['capture','sha256','max-fields','max-depth'],'COUCHDB_CLI_OPTION_INVALID');
    const source=await readCouchdbCapture(resolve(options.capture),options.sha256);
    result=command==='inspect'?captureView(source):await inspectCouchdbFields(source,{maxFields:options['max-fields']?Number(options['max-fields']):10000,maxDepth:options['max-depth']?Number(options['max-depth']):16});
  }else if(command==='source'){
    only(options,['file'],'COUCHDB_CLI_OPTION_INVALID');result=await inspectCouchdbSource(resolve(options.file));
  }else if(command==='compare'){
    only(options,['left','right','offset','limit'],'COUCHDB_CLI_OPTION_INVALID');
    result=await compareCouchdbCaptures(await readCouchdbCapture(resolve(options.left)),await readCouchdbCapture(resolve(options.right)),
      {offset:Number(options.offset??0),limit:Number(options.limit??100)});
  }else if(command==='help')result={commands:{
    capture:'capture --connection ABS_JSON --directory ABS --id UUID [--base ABS_CAPTURE_JSON --base-sha256 SHA]',
    inspect:'inspect --capture ABS_CAPTURE_JSON [--sha256 SHA]',
    fields:'fields --capture ABS_CAPTURE_JSON [--max-fields 10000 --max-depth 16]',
    source:'source --file ABS_SOURCE_JSON',compare:'compare --left ABS_CAPTURE_JSON --right ABS_CAPTURE_JSON [--offset 0 --limit 100]'
  },operator:'couchdb-workspace help'};
  else need(false,'COUCHDB_CLI_COMMAND_INVALID');
  process.stdout.write(JSON.stringify(result)+'\n');return result;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))couchdbMain().catch(error=>{process.stderr.write(JSON.stringify({error:safeIssue(error)})+'\n');process.exitCode=1;});
