#!/usr/bin/env node
// MIT. Original ALFRED source operations share the native project and capture formats.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { need,normalizeSelection,MAX_CAPTURE_BYTES } from '../model.mjs';
import { fredAlfredRequest } from './model.mjs';
import { captureFredAlfred,inspectFredAlfredAcquisition,readFredAlfredCapture,storeFredAlfredCapture,
  sealFredAlfredCapture,validateFredAlfredCapture,createFredAlfredFileResponse,adoptFredAlfredMetadata } from './source.mjs';

export const FRED_ALFRED_USAGE=[
  'Original ALFRED historical observations — explicit vintage, complete source, same-request recovery',
  '',
  'starforge fred alfred acquire --directory ABS --selection FILE [--metadata FILE]',
  'starforge fred alfred status --directory ABS',
  'starforge fred alfred inspect --input CAPTURE_JSON',
  'starforge fred alfred import --directory ABS --selection FILE --csv ORIGINAL_CSV --received-at ISO [--metadata FILE]',
  'starforge fred alfred import --directory ABS --selection FILE --records ORIGINAL_RECORDS_JSON',
  'starforge fred alfred metadata --directory NEW_ABS --input CAPTURE_JSON --metadata FILE',
  'starforge fred alfred migrate --project ABS --id OPERATION --expected-revision N --migration ID [--metadata FILE]',
  'starforge fred alfred adopt --project ABS --id OPERATION --expected-revision N --input CAPTURE_JSON',
  '',
  'A selection uses the original series/asOf/start/end/pageSize/maxRows fields.',
  'CSV import takes a one-series selection and the actual original retrieval timestamp.',
  'The returned original series_YYYYMMDD column must name that selected vintage.',
  'Records import retains each exact request, original response and optional historical metadata edition.',
  'Metadata files contain an array of original README editions with exact text ranges and real-time intervals.',
  'Acquire resumes its original directory; SIGINT/SIGTERM retains completed original responses.',
  'Adopt uses the existing project import transaction. The original review, briefing, export and merchant commands then apply.',
].join('\n');
const OPTIONS={
  acquire:['directory','selection','metadata'],status:['directory'],inspect:['input'],
  import:['directory','selection','csv','received-at','records','metadata'],
  migrate:['project','id','expected-revision','migration','metadata'],metadata:['directory','input','metadata'],adopt:['project','id','expected-revision','input'],
};
function parse(args){
  const [command,...values]=args;
  if(!command||command==='help'||command==='--help')return {command:'help',options:{}};
  need(Object.hasOwn(OPTIONS,command),'Choose an original ALFRED source command.');
  const options={};
  for(let i=0;i<values.length;i+=2){
    const key=values[i];need(key?.startsWith('--')&&OPTIONS[command].includes(key.slice(2))&&typeof values[i+1]==='string'&&!values[i+1].startsWith('--'),
      'Provide a known --option and its value.');
    need(!Object.hasOwn(options,key.slice(2)),'An option was supplied twice.');options[key.slice(2)]=values[i+1];
  }
  return {command,options};
}
function required(options,key){need(typeof options[key]==='string'&&options[key].length>0,'Supply --'+key+'.');return options[key];}
async function json(path){
  const data=await readFile(resolve(path));need(data.length<=MAX_CAPTURE_BYTES*2,'The original source JSON exceeds its capacity.');
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}catch{need(false,'The retained source file is not UTF-8 JSON.');}
}
function describe(result){
  return {directory:result.directory,captureSha256:result.capture.captureSha256,reused:result.reused,
    selection:result.model.selection,sourceMode:result.model.sourceMode,timeBasis:result.model.timeBasis,
    rowCount:result.model.rowCount,missing:result.model.missing,metadataComplete:result.model.metadataComplete,series:result.model.series};
}
async function withSignals(work,providedSignal){
  const controller=new AbortController(),forward=()=>controller.abort(providedSignal.reason);
  const stop=()=>controller.abort(Object.assign(new Error('Original ALFRED acquisition interrupted.'),{name:'AbortError'}));
  if(providedSignal){if(providedSignal.aborted)forward();else providedSignal.addEventListener('abort',forward,{once:true});}
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{return await work(controller.signal);}
  finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);providedSignal?.removeEventListener('abort',forward);}
}
export async function runFredAlfredCommand(args,{signal:providedSignal,fetchImpl}={}){
  const {command,options:o}=parse(args);if(command==='help')return {usage:FRED_ALFRED_USAGE};
  if(command==='status')return inspectFredAlfredAcquisition({directory:required(o,'directory')});
  if(command==='inspect'){
    const capture=await json(required(o,'input')),model=validateFredAlfredCapture(capture);
    return describe({directory:null,capture,model,reused:true});
  }
  if(command==='adopt'){
    const expectedRevision=Number(required(o,'expected-revision'));need(Number.isSafeInteger(expectedRevision)&&expectedRevision>=0,'Use the exact original project revision.');
    const {importFredCapture}=await import('../project.mjs'),capture=await json(required(o,'input'));validateFredAlfredCapture(capture);
    return importFredCapture({directory:required(o,'project'),id:required(o,'id'),expectedRevision,capture});
  }
  if(command==='migrate'){
    const expectedRevision=Number(required(o,'expected-revision'));need(Number.isSafeInteger(expectedRevision)&&expectedRevision>=0,'Use the exact original project revision.');
    const {acquireFredDdpMigration}=await import('../project.mjs');
    const metadata=o.metadata?await json(o.metadata):undefined;
    return withSignals(signal=>acquireFredDdpMigration({directory:required(o,'project'),id:required(o,'id'),expectedRevision,
      migrationId:required(o,'migration'),sourceMode:'ALFRED_VINTAGE',metadata,signal,fetchImpl}),providedSignal);
  }
  if(command==='metadata'){
    const capture=adoptFredAlfredMetadata(await json(required(o,'input')),await json(required(o,'metadata')));
    return describe(await storeFredAlfredCapture(required(o,'directory'),capture));
  }
  const selection=normalizeSelection(await json(required(o,'selection'))),metadata=o.metadata?await json(o.metadata):[];
  need(Array.isArray(metadata),'Metadata is an array of original historical editions.');
  if(command==='import'){
    need(Boolean(o.csv)!==Boolean(o.records),'Choose one original CSV or complete original record list.');
    let records;
    if(o.records){need(!o['received-at']&&!o.metadata,'Complete original records already retain retrieval and metadata.');records=await json(o.records);}
    else{
      need(selection.series.length===1,'One original CSV import requires exactly its original series.');
      const bytes=await readFile(resolve(o.csv));need(bytes.length<=MAX_CAPTURE_BYTES,'The original CSV exceeds source capacity.');
      const body=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),request=fredAlfredRequest(selection,selection.series[0]);
      need(Buffer.from(body,'utf8').equals(bytes),'Preserve the complete original UTF-8 CSV bytes.');
      need(metadata.length<=1,'A one-series import accepts only that historical metadata edition.');
      records=[{request,response:createFredAlfredFileResponse({body,url:request.url,receivedAt:required(o,'received-at')}),metadata:metadata[0]??null}];
    }
    return describe(await storeFredAlfredCapture(required(o,'directory'),sealFredAlfredCapture(selection,records)));
  }
  return withSignals(signal=>captureFredAlfred({directory:required(o,'directory'),selection,metadata,fetchImpl,signal}).then(describe),providedSignal);
}
export async function main(args=process.argv.slice(2)){
  try{const result=await runFredAlfredCommand(args);process.stdout.write(JSON.stringify(result,null,2)+'\n');}
  catch(error){process.stderr.write(JSON.stringify({error:error.code??error.name??'ALFRED_FAILURE',message:error.message,status:error.status??null})+'\n');process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
