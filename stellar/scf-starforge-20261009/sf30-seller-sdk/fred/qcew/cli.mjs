#!/usr/bin/env node
// MIT. Installed county-report production uses the original saved FRED project.
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, open, mkdir, lstat } from 'node:fs/promises';
import { need } from './model.mjs';
import { defaultSanFranciscoProfile } from './profile.mjs';
import { importQcewSource, saveQcewProfile, produceQcewEdition, viewQcewProject, getQcewEdition, downloadQcewMember } from './project.mjs';
import { readQcewOriginalMember, MAX_QCEW_CAPTURE_BYTES, sha256 } from './source.mjs';
import { initializeFredProject, importFredCapture, exportFredProject, receiveFredProject } from '../project.mjs';
import { sealFredPublicTable } from '../source.mjs';
import { FRED_DDP_PROJECT_BUNDLE_MAX_BYTES } from '../ddp/project-validation.mjs';
export const QCEW_USAGE=[
  'County wage reports — original BLS QCEW sources in the saved FRED project','',
  'starforge fred qcew init --project ABS --title TEXT --price-source ORIGINAL_PUBLIC_TABLE_JSON',
  'starforge fred qcew cpi --project ABS --id ID --expected-revision N --source ORIGINAL_PUBLIC_TABLE_JSON',
  'starforge fred qcew profile-template --out PROFILE_JSON',
  'starforge fred qcew show --project ABS',
  'starforge fred qcew import --project ABS --id ID --expected-revision N --input-directory ORIGINAL_INTAKE',
  'starforge fred qcew import --project ABS --id ID --expected-revision N --source COMPLETE_CAPTURE_JSON',
  'starforge fred qcew profile --project ABS --id ID --expected-revision N --source PROFILE_JSON',
  'starforge fred qcew produce --project ABS --id ID --expected-revision N --capture SHA --cpi SHA --profile SHA --period YYYY-QN [--previous EDITION_SHA] [--chromium ABS]',
  'starforge fred qcew edition --project ABS [--edition SHA] [--verify-sources]',
  'starforge fred qcew download --project ABS --edition SHA --file MEMBER --out FILE',
  'starforge fred qcew original --project ABS --capture SHA --file RETAINED_CSV_GZ_NAME --out ORIGINAL_CSV',
  'starforge fred qcew export --project ABS --out COMPLETE_FRED_PROJECT_JSON',
  'starforge fred qcew receive --project ABS_EMPTY --source COMPLETE_FRED_PROJECT_JSON','',
  'Acquire originals with: python3 fred/qcew/source_fetch.py --directory ABS --years 1990:2026',
  'Import the original CPI public table with qcew cpi, or a previously sealed capture with the existing fred import command.',
  'A saved profile is reused for each reporting quarter; original source editions and report files stay immutable.',
  'Use the same operation ID/revision to resume. Exports are create-only. PDF uses the configured local Chromium executable.'
].join('\n');
const options={
  init:['project','title','price-source'],cpi:['project','id','expected-revision','source'],
  'profile-template':['out'],show:['project'],
  import:['project','id','expected-revision','input-directory','source'],
  profile:['project','id','expected-revision','source'],
  produce:['project','id','expected-revision','capture','cpi','profile','period','previous','chromium'],
  edition:['project','edition','verify-sources'],
  download:['project','edition','file','out'],
  original:['project','capture','file','out'],
  export:['project','out'],receive:['project','source']
};
function parse(command,args) {
  need(options[command],'Choose a supported county report command.');
  const flags={};
  for(let i=0;i<args.length;i++) {
    const token=args[i];need(/^--[a-z-]+$/.test(token),'Use named county report command options.');
    const key=token.slice(2);need(options[command].includes(key)&&flags[key]===undefined,'An option is unknown or repeated: '+token);
    if(key==='verify-sources') flags[key]=true;
    else {need(typeof args[i+1]==='string'&&!args[i+1].startsWith('--'),'Supply a value for '+token);flags[key]=args[++i];}
  }
  if(command!=='profile-template')need(flags.project,'--project selects the existing FRED project.');
  return flags;
}
async function jsonFile(path,maximum=MAX_QCEW_CAPTURE_BYTES) {
  need(typeof path==='string'&&path,'Choose the complete input JSON file.');
  path=resolve(path);const stat=await lstat(path);
  need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=maximum,'The original input JSON is unavailable or exceeds capacity.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readFile(path)));
}
async function output(path,bytes) {
  need(typeof path==='string'&&path,'--out is required for a complete export.');
  path=resolve(path);await mkdir(dirname(path),{recursive:true,mode:0o700});
  const file=await open(path,'wx',0o600);
  try {await file.writeFile(bytes);await file.sync();} finally {await file.close();}
  return {file:path,bytes:bytes.length,sha256:sha256(bytes)};
}
function when(value) {
  const match=/^([0-9]{4})-Q([1-4])$/.exec(value??'');
  need(match,'Use a reporting period such as 2025-Q4.');
  return {year:Number(match[1]),quarter:Number(match[2])};
}
export async function runQcewCli(args=process.argv.slice(2)) {
  if(!args.length||['help','-h','--help'].includes(args[0])||args.includes('--help')) {console.log(QCEW_USAGE);return;}
  const [command,...rest]=args,flags=parse(command,rest),directory=flags.project?resolve(flags.project):null;
  const common=()=>{
    need(typeof flags.id==='string'&&/^[0-9]+$/.test(flags['expected-revision']??''),'Use the retained operation ID and original project revision.');
    return {directory,id:flags.id,expectedRevision:Number(flags['expected-revision'])};
  };
  let result;
  switch(command) {
    case 'init':{
      const capture=sealFredPublicTable(await jsonFile(flags['price-source'],8*1024*1024));
      need(flags.title,'--title names the original FRED project.');
      result=await initializeFredProject({directory,title:flags.title,selection:capture.selection});break;
    }
    case 'cpi':result=await importFredCapture({...common(),capture:sealFredPublicTable(await jsonFile(flags.source,8*1024*1024))});break;
    case 'profile-template':result=await output(flags.out,Buffer.from(JSON.stringify(defaultSanFranciscoProfile().definition,null,2)+'\n'));break;
    case 'show':result=await viewQcewProject({directory});break;
    case 'import':
      need(Boolean(flags.source)!==Boolean(flags['input-directory']),'Choose the complete original intake directory or sealed capture JSON.');
      result=await importQcewSource({...common(),...(flags.source?{capture:await jsonFile(flags.source)}:{inputDirectory:resolve(flags['input-directory'])})});break;
    case 'profile':result=await saveQcewProfile({...common(),profile:await jsonFile(flags.source,64*1024)});break;
    case 'produce':result=await produceQcewEdition({...common(),captureSha256:flags.capture,cpiCaptureSha256:flags.cpi,profileId:flags.profile,
      period:when(flags.period),previousEditionId:flags.previous??null,browserPath:flags.chromium?resolve(flags.chromium):null});break;
    case 'edition':{
      const edition=await getQcewEdition(directory,flags.edition,{validateSources:Boolean(flags['verify-sources'])});
      result={edition:edition.entry,directory:edition.directory,availability:edition.report.availability,files:edition.manifest.files};break;
    }
    case 'download':{
      const file=await downloadQcewMember({directory,editionId:flags.edition,name:flags.file});
      result={...(await output(flags.out,file.bytes)),contentType:file.contentType};break;
    }
    case 'original':{
      const file=await readQcewOriginalMember(directory,flags.capture,flags.file);
      result=await output(flags.out,file.bytes);break;
    }
    case 'export':result=await output(flags.out,Buffer.from(JSON.stringify(await exportFredProject({directory}),null,2)+'\n'));break;
    case 'receive':result=await receiveFredProject({directory,bundle:await jsonFile(flags.source,FRED_DDP_PROJECT_BUNDLE_MAX_BYTES)});break;
  }
  console.log(JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  runQcewCli().catch(error=>{console.error(JSON.stringify({code:error.code??'QCEW_COMMAND_FAILED',message:error.message}));process.exitCode=1;});
