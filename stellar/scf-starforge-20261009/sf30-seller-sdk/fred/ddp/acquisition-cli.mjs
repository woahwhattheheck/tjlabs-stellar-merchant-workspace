#!/usr/bin/env node
// MIT. Complete original DDP source, mapping and receiving operations.
import { constants } from 'node:fs';
import { open,link,unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve,dirname,basename,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonical,need,plain } from '../model.mjs';
import { privateDirectory,atomicJson,readPrivateJson } from '../../routescan/quota.mjs';
import { MAX_DDP_FILE_BYTES,MAX_DDP_CAPTURE_BYTES,sealFredDdpFile,fredDdpFileBytes } from './files.mjs';
import { sealFredDdpCrosswalk,inspectFredDdpCrosswalk,pageFredDdpCrosswalk,resolveFredDdpMappings,compareFredDdpCrosswalks } from './crosswalk.mjs';
import { sealFredDdpPackage,inspectFredDdpPackage,pageFredDdpPackage } from './package.mjs';
import { normalizeFredDdpMigrationInput,buildFredDdpMigrationPlan,validateFredDdpMigrationPlan,pageFredDdpMigrationPlan } from './migration.mjs';
import { buildFredDdpReceiving,validateFredDdpReceiving,pageFredDdpReceiving } from './receiving.mjs';
import { captureFredDdpCrosswalk,captureFredDdpPackage,inspectFredDdpAcquisition,
  readFredDdpCrosswalkCapture,readFredDdpPackageCapture,storeFredDdpCrosswalkCapture,storeFredDdpPackageCapture } from './source.mjs';

export const FRED_DDP_ACQUISITION_HELP=`starforge fred ddp <command> [options]

capture  --kind crosswalk|package --directory DIR [--url URL] [--name NAME]
         [--release H15] [--format board-sdmx-zip|board-sdmx-xml|ddp-csv]
         [--supplemental URL ...] [--layout JSON]
status   --directory DIR
inspect  --input CAPTURE.json [--section series|observations] [--series-id ID]
         [--release CODE] [--frequency CODE] [--query TEXT] [--offset N] [--limit N]
receive  --kind crosswalk|package --input FILE --directory DIR
         [--release H15] [--format board-sdmx-zip|board-sdmx-xml|ddp-csv]
         [--supplemental FILE ...] [--layout JSON]
export   --input CAPTURE_OR_REPORT.json --output FILE [--raw-file ORIGINAL_NAME]
         or --directory DIR --output FILE [--progress]
map      --crosswalk CAPTURE.json --package CAPTURE.json --output MAPPINGS.json
         [--decisions JSON]; or --before OLD_CROSSWALK.json --crosswalk NEW.json --output FILE
plan     --crosswalk CAPTURE.json --package CAPTURE.json --config JSON --output PLAN.json
compare  --crosswalk CAPTURE.json --package CAPTURE.json --plan PLAN.json
         --capture FRED_CAPTURE.json [--capture FRED_CAPTURE.json ...] --output RECEIVING.json
page     --input CAPTURE_OR_REPORT.json [--section series|observations|acquisitions|mappings]
         [--series-id ID] [--frequency CODE] [--query TEXT] [--release CODE]
         [--offset N] [--limit N] [--changes-only true|false]

The direct module accepts these same arguments. Capture resumes its original directory.
Complete source capture, mapping, plan and receiving files are written atomically.
Source downloads are public Board requests. FRED target captures use the existing FRED operator.
`;

const repetitions=new Set(['capture','supplemental']);
function parseArgs(argv){
  const options={};
  for(let i=0;i<argv.length;i++){
    const token=argv[i];need(typeof token==='string'&&token.startsWith('--'),'Use the documented DDP command options.');
    const key=token.slice(2);need(key&&!key.includes('='),'Use --name VALUE for DDP command options.');
    const value=key==='progress'||key==='help'?true:argv[++i];
    need(value!==undefined&&(typeof value!=='string'||!value.startsWith('--')),'A DDP command option is missing its value.');
    if(repetitions.has(key)){(options[key]??=[]).push(value);continue;}
    need(!Object.hasOwn(options,key),'Each DDP option may appear once.');options[key]=value;
  }return options;
}
function selected(options,keys){need(Object.keys(options).every(key=>keys.includes(key)),'This DDP command received an unknown option.');}
function required(options,key){need(typeof options[key]==='string'&&options[key].length>0,'Supply --'+key+'.');return options[key];}
function integer(options,key,fallback){const value=options[key];if(value===undefined)return fallback;
  need(/^\d+$/.test(value),'Use a nonnegative integer for --'+key+'.');const result=Number(value);
  need(Number.isSafeInteger(result),'The selected '+key+' exceeds the supported range.');return result;}
function boolean(options,key,fallback){const value=options[key];if(value===undefined)return fallback;
  need(value==='true'||value==='false','Use true or false for --'+key+'.');return value==='true';}
async function json(path,max=MAX_DDP_CAPTURE_BYTES){return readPrivateJson(resolve(path),max);}
async function raw(path,maxBytes=MAX_DDP_FILE_BYTES){
  const handle=await open(resolve(path),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const stat=await handle.stat();need(stat.isFile()&&stat.size<=maxBytes,'Select a complete original file within the supported capacity.');
    const body=await handle.readFile();need(body.length<=maxBytes,'The original input file grew beyond its supported capacity.');return body;
  }finally{await handle.close();}
}
async function fileInput(path,format,retained=null,suppliedBytes=null){
  const content=suppliedBytes??await raw(path),name=basename(path),extension=name.toLowerCase().split('.').at(-1);
  const mediaType=format==='ddp-csv'||extension==='csv'?'text/csv':format==='board-sdmx-zip'||extension==='zip'?'application/zip':
    format==='board-sdmx-xml'||['xml','xsd'].includes(extension)?'application/xml':'application/octet-stream';
  if(retained&&retained.name===name&&retained.mediaType===mediaType&&fredDdpFileBytes(retained).equals(content))return retained;
  return sealFredDdpFile({name,mediaType,bytes:content,provenance:{kind:'file',receivedAt:new Date().toISOString()}});
}
async function writeJson(path,value){
  path=resolve(path);const directory=await privateDirectory(dirname(path));
  try{const old=await json(path);need(canonical(old)===canonical(value),'Another saved result owns the selected output path.','FRED_CAPTURE_CONFLICT',409);return path;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  await atomicJson(directory,basename(path),value,{exclusive:true});return path;
}
async function writeRaw(path,bytes){
  path=resolve(path);await privateDirectory(dirname(path));
  const temporary=path+'.tmp-'+randomUUID();let handle;
  try{
    handle=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
    try{await link(temporary,path);}catch(error){if(error.code!=='EEXIST')throw error;const previous=await raw(path);
      need(previous.equals(bytes),'Another original file owns the selected output path.','FRED_CAPTURE_CONFLICT',409);}
    return path;
  }finally{if(handle)await handle.close();try{await unlink(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
}
function captureKind(value){
  if(value?.schema==='stellar-forge.fred-ddp-crosswalk.v1')return 'crosswalk';
  if(value?.schema==='stellar-forge.fred-ddp-package.v1')return 'package';
  return null;
}
function sourceSummary(result){return {directory:result.directory,captureId:result.capture.id,captureSha256:result.capture.captureSha256,
  sourceFile:join(result.directory,'capture.json'),summary:result.model.summary,reused:result.reused};}
function page(value,options){
  const paging={offset:integer(options,'offset',0),limit:integer(options,'limit',100)};
  if(captureKind(value)==='crosswalk')return pageFredDdpCrosswalk(value,{...paging,release:options.release??null,query:options.query??''});
  if(captureKind(value)==='package')return pageFredDdpPackage(value,{...paging,section:options.section??'series',seriesId:options['series-id']??null,
    frequency:options.frequency??null,query:options.query??''});
  if(value?.schema==='stellar-forge.fred-ddp-migration-plan.v1')return pageFredDdpMigrationPlan(value,{...paging,section:options.section??'series'});
  if(value?.schema==='stellar-forge.fred-ddp-receiving.v1')return pageFredDdpReceiving(value,{...paging,seriesId:options['series-id']??null,
    changesOnly:boolean(options,'changes-only',true)});
  need(false,'Select a complete original DDP capture, migration plan or receiving report.');
}
async function original(path,kind){
  return kind==='crosswalk'?(await readFredDdpCrosswalkCapture(path)).capture:(await readFredDdpPackageCapture(path)).capture;
}
function validateFile(value){
  const kind=captureKind(value);if(kind==='crosswalk'){inspectFredDdpCrosswalk(value);return;}
  if(kind==='package'){inspectFredDdpPackage(value);return;}
  if(value?.schema==='stellar-forge.fred-ddp-migration-plan.v1'){validateFredDdpMigrationPlan(value);return;}
  if(value?.schema==='stellar-forge.fred-ddp-receiving.v1'){validateFredDdpReceiving(value);return;}
  need(false,'Export a complete retained original source, migration plan or receiving report.');
}
export async function runFredDdpAcquisitionCli(argv=process.argv.slice(2),{
  stdout=process.stdout,stderr=process.stderr,signal,fetchImpl
}={}){
  const [command,...rest]=argv;
  if(!command||command==='help'||command==='--help'||rest.includes('--help')){stdout.write(FRED_DDP_ACQUISITION_HELP);return;}
  const options=parseArgs(rest),controller=new AbortController();
  const abort=()=>controller.abort(new Error('The original DDP operation was interrupted.'));
  const externalAbort=()=>controller.abort(signal.reason);
  process.once('SIGINT',abort);process.once('SIGTERM',abort);
  if(signal?.aborted)externalAbort();else signal?.addEventListener('abort',externalAbort,{once:true});
  try{
    let result;
    if(command==='capture'){
      selected(options,['kind','directory','url','name','release','format','supplemental','layout']);
      const kind=required(options,'kind');need(['crosswalk','package'].includes(kind),'Choose crosswalk or package acquisition.');
      const input={directory:required(options,'directory'),url:options.url,name:options.name,release:options.release,format:options.format,
        supplementalUrls:options.supplemental??[],csvLayout:options.layout?await json(options.layout,1024*1024):null,
        signal:controller.signal,fetchImpl,onProgress:event=>stderr.write(JSON.stringify({source:event})+'\n')};
      if(kind==='crosswalk')need(!options.release&&!options.format&&!options.supplemental&&!options.layout,'Crosswalk acquisition takes its original CSV only.');
      result=sourceSummary(await (kind==='crosswalk'?captureFredDdpCrosswalk(input):captureFredDdpPackage(input)));
    }else if(command==='status'){
      selected(options,['directory']);result=await inspectFredDdpAcquisition({directory:required(options,'directory')});
    }else if(command==='inspect'||command==='page'){
      selected(options,['input','section','series-id','release','frequency','query','offset','limit','changes-only']);
      result=page(await json(required(options,'input')),options);
    }else if(command==='receive'){
      selected(options,['kind','input','directory','release','format','supplemental','layout']);
      const kind=required(options,'kind'),input=required(options,'input');need(['crosswalk','package'].includes(kind),'Choose crosswalk or package receiving.');
      let retained=null;try{retained=await json(join(required(options,'directory'),'capture.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
      if(retained)need(captureKind(retained)===kind,'Another original source kind owns this directory.','FRED_CAPTURE_CONFLICT',409);
      const bytes=await raw(input,MAX_DDP_CAPTURE_BYTES);let capture=null;
      if(bytes.subarray(0,1024).toString('utf8').replace(/^\uFEFF/,'').trimStart().startsWith('{')){try{const decoded=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));if(captureKind(decoded))capture=decoded;}catch{}}
      if(capture){
        need(captureKind(capture)===kind,'The complete source envelope has another kind.');
        need(!options.release&&!options.format&&!options.supplemental&&!options.layout,'A complete source envelope already retains its original interpretation.');
      }else{
        if(kind==='crosswalk'){
          need(!options.release&&!options.format&&!options.supplemental&&!options.layout,'Crosswalk receiving takes the original CSV only.');
          capture=sealFredDdpCrosswalk({file:await fileInput(input,'ddp-csv',retained?.file,bytes)});
        }else{
          const format=options.format??'board-sdmx-zip',supplementalFiles=[];
          for(const [index,path] of (options.supplemental??[]).entries())supplementalFiles.push(await fileInput(path,undefined,retained?.supplementalFiles?.[index]));
          capture=sealFredDdpPackage({file:await fileInput(input,format,retained?.file,bytes),release:options.release??'H15',format,supplementalFiles,
            csvLayout:options.layout?await json(options.layout,1024*1024):null});
        }
      }
      result=sourceSummary(await (kind==='crosswalk'?storeFredDdpCrosswalkCapture(required(options,'directory'),capture):
        storeFredDdpPackageCapture(required(options,'directory'),capture)));
    }else if(command==='export'){
      selected(options,['input','directory','output','raw-file','progress']);
      need(Boolean(options.input)!==Boolean(options.directory),'Choose one complete source file or acquisition directory.');
      need(!options.progress||options.directory,'The retained progress file belongs to an acquisition directory.');
      const path=options.input??join(required(options,'directory'),options.progress?'progress.json':'capture.json'),value=await json(path),output=required(options,'output');
      if(options.progress){need(!options['raw-file'],'Export the complete original progress envelope.');await inspectFredDdpAcquisition({directory:options.directory});
        result={file:await writeJson(output,value),state:value.state};}
      else{
        validateFile(value);
        if(options['raw-file']){
          need(captureKind(value),'Choose a retained original source capture.');
          const file=[value.file,...(value.supplementalFiles??[])].find(item=>item.name===options['raw-file']);need(file,'This original filename is absent from the capture.');
          result={file:await writeRaw(output,fredDdpFileBytes(file)),bytes:file.bytes,sha256:file.sha256,captureId:value.id};
        }else result={file:await writeJson(output,value),id:value.id,summary:value.summary??null};
      }
    }else if(command==='map'){
      selected(options,['crosswalk','package','before','decisions','output']);
      const crosswalk=await original(required(options,'crosswalk'),'crosswalk');let value;
      if(options.before){need(!options.package&&!options.decisions,'Crosswalk comparison takes its two complete original captures.');
        value=compareFredDdpCrosswalks({before:await original(options.before,'crosswalk'),after:crosswalk});}
      else{
        const source=inspectFredDdpPackage(await original(required(options,'package'),'package'));
        const seen=new Set(),series=[];for(const item of source.series){const key=item.release+'\0'+item.boardSeriesId;
          if(!seen.has(key)){seen.add(key);series.push({release:item.release,boardSeriesId:item.boardSeriesId});}}
        value=resolveFredDdpMappings({crosswalk,series,decisions:options.decisions?await json(options.decisions,8*1024*1024):[]});
      }
      result={file:await writeJson(required(options,'output'),value),id:value.id,summary:value.summary};
    }else if(command==='plan'){
      selected(options,['crosswalk','package','config','output']);
      const crosswalk=await original(required(options,'crosswalk'),'crosswalk'),packageCapture=await original(required(options,'package'),'package');
      const config=await json(required(options,'config'),16*1024*1024);need(plain(config),'Select the reviewed migration configuration object.');
      const value=buildFredDdpMigrationPlan({...normalizeFredDdpMigrationInput(config),packageCapture,crosswalk});
      result={file:await writeJson(required(options,'output'),value),id:value.id,summary:value.summary};
    }else if(command==='compare'){
      selected(options,['crosswalk','package','plan','capture','output']);
      need(Array.isArray(options.capture)&&options.capture.length>0,'Supply every complete original FRED batch capture using --capture.');
      const crosswalk=await original(required(options,'crosswalk'),'crosswalk'),packageCapture=await original(required(options,'package'),'package');
      const plan=await json(required(options,'plan')),captures=[];
      for(const path of options.capture)captures.push(await json(path));
      const value=buildFredDdpReceiving({packageCapture,crosswalk,plan,captures});
      result={file:await writeJson(required(options,'output'),value),id:value.id,summary:value.summary};
    }else need(false,'Choose a documented DDP command; use ddp --help.');
    stdout.write(JSON.stringify(result,null,2)+'\n');return result;
  }finally{
    process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);signal?.removeEventListener('abort',externalAbort);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runFredDdpAcquisitionCli().catch(error=>{
    process.stderr.write(JSON.stringify({error:{code:error.code??'FRED_DDP_INVALID',message:error.message,status:error.status??400,retryAt:error.retryAt??null}})+'\n');
    process.exitCode=1;
  });
}
