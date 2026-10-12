#!/usr/bin/env node
// MIT. Installed operator entry and complete customer files from the original owners.
import {constants} from 'node:fs';
import {promises as fs} from 'node:fs';
import {resolve,join,dirname,isAbsolute,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {MerchantReleaseOperator} from '../operator.mjs';
import {readMerchantConfig} from '../config.mjs';
import {retainCaseArtifact} from '../../../stellar/scf-starforge-20261009/sf74-merchant-support-console/case-store.mjs';
import {MAX_FILE_RANGE,bytesHash,valueHash,object,requireValue,hash} from './model.mjs';

const json=value=>JSON.stringify(value,null,2)+'\n';
const PREFIX='merchant_lineage_support_';
const commands=new Set(['sources','preview','save','read','return-preview','return-prepare','return-execute','file','export']);
const HELP=[
 'Lineage incident to Support',
 '',
 '  starforge lineage-support sources --config /private/merchant.json [--out /private/sources.json]',
 '  starforge lineage-support preview|save|read|return-preview|return-prepare|return-execute|export',
 '    --config /private/merchant.json --request /private/original-request.json [--out /private/response.json]',
 '  starforge lineage-support file --config /private/merchant.json --request /private/file-selection.json',
 '    --destination /private/original-file.json',
 '  starforge lineage-support deliver --config /private/merchant.json --request /private/export-request.json',
 '    --directory /private/customer-delivery',
 '',
 'Request files contain the complete declared MCP arguments. Save them before dispatch.',
 'Preview and saving use the original case/native revisions and exact reviewed preview SHA.',
 'Keep the same request UUID and body across a lost response. Execute a retained intent',
 'again to recover its original native result. An explicit native conflict needs a new review.',
 '',
 'An existing --out file is the retained response to that exact request; choose a new',
 'output path for a new live read. Complete delivery reuses the original case export ID.',
 'See OPERATING.md for all fields, original configuration, source custody and receiving.'
].join('\n');
async function privateDirectory(path){
 requireValue(isAbsolute(path),'LINEAGE_SUPPORT_PATH','Choose an absolute private output directory.');
 await fs.mkdir(path,{recursive:true,mode:0o700});
 const st=await fs.lstat(path);
 requireValue(st.isDirectory()&&!st.isSymbolicLink()&&(process.platform==='win32'||!(st.mode&0o077)),
  'LINEAGE_SUPPORT_PATH','The output directory must be a real private directory (0700).');
 return path;
}
async function fileDigest(path){
 const handle=await fs.open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const before=await handle.stat();
  requireValue(before.isFile()&&(process.platform==='win32'||!(before.mode&0o077)),'LINEAGE_SUPPORT_FILE','Select a private regular file.');
  const sha=createHash('sha256'),buffer=Buffer.alloc(262144);let bytes=0;
  for(;;){const read=await handle.read(buffer,0,buffer.length,null);if(!read.bytesRead)break;bytes+=read.bytesRead;sha.update(buffer.subarray(0,read.bytesRead));}
  const after=await handle.stat();
  requireValue(after.size===bytes&&before.size===after.size&&before.mtimeMs===after.mtimeMs,'LINEAGE_SUPPORT_FILE_CHANGED','The original file changed during reading.',409);
  return {bytes,sha256:sha.digest('hex')};
 }finally{await handle.close();}
}
async function sameFile(path,expected){
 try{const actual=await fileDigest(path);requireValue(actual.bytes===expected.bytes&&actual.sha256===expected.sha256,
  'LINEAGE_SUPPORT_OUTPUT_CHANGED','An existing output belongs to different original bytes.',409);return true;}
 catch(error){if(error.code==='ENOENT')return false;throw error;}
}
async function syncDirectory(path){
 if(process.platform==='win32')return;const handle=await fs.open(path,'r');try{await handle.sync();}finally{await handle.close();}
}
async function publishStream(destination,expected,parts){
 requireValue(isAbsolute(destination),'LINEAGE_SUPPORT_PATH','Choose an absolute output filename.');hash(expected.sha256);
 await privateDirectory(dirname(destination));
 if(await sameFile(destination,expected))return {path:destination,...expected,reused:true};
 const staging=join(dirname(destination),'.lineage-source-'+randomUUID()),handle=await fs.open(staging,'wx',0o600);
 const sha=createHash('sha256');let size=0,closed=false;
 try{
  for await(const bytes of parts()){
   requireValue(bytes instanceof Uint8Array&&size+bytes.length<=expected.bytes,'LINEAGE_SUPPORT_FILE_CHANGED','Original file ranges exceed their selected size.',409);
   let written=0;while(written<bytes.length){const part=await handle.write(bytes,written,bytes.length-written,null);requireValue(part.bytesWritten>0,'LINEAGE_SUPPORT_WRITE','The output write did not advance.',503);written+=part.bytesWritten;}
   size+=bytes.length;sha.update(bytes);
  }
  requireValue(size===expected.bytes&&sha.digest('hex')===expected.sha256,'LINEAGE_SUPPORT_FILE_CHANGED','The complete original file differs from its selected manifest.',409);
  await handle.sync();await handle.close();closed=true;
  try{await fs.link(staging,destination);}catch(error){if(error.code!=='EEXIST')throw error;await sameFile(destination,expected);}
  await syncDirectory(dirname(destination));
  return {path:destination,...expected,reused:false};
 }finally{if(!closed)await handle.close().catch(()=>{});await fs.unlink(staging).catch(()=>{});}
}
async function* nativeFileParts(path,expected){
 const handle=await fs.open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const before=await handle.stat();
  requireValue(before.isFile()&&before.size===expected.bytes&&(process.platform==='win32'||!(before.mode&0o077)),
   'LINEAGE_SUPPORT_FILE_CHANGED','The original native export file differs from its retained manifest.',409);
  const buffer=Buffer.alloc(MAX_FILE_RANGE);let offset=0;
  while(offset<expected.bytes){const result=await handle.read(buffer,0,Math.min(buffer.length,expected.bytes-offset),null);
   requireValue(result.bytesRead>0,'LINEAGE_SUPPORT_FILE_CHANGED','The original native export ended early.',409);
   offset+=result.bytesRead;yield buffer.subarray(0,result.bytesRead);}
  const after=await handle.stat();requireValue(before.size===after.size&&before.mtimeMs===after.mtimeMs,'LINEAGE_SUPPORT_FILE_CHANGED','The native export changed during receiving.',409);
 }finally{await handle.close();}
}
/** Streams the complete original export; it never reconstructs case or source content. */
export async function deliverSupportCase({operator,configuration,request,directory}){
 const root=await privateDirectory(resolve(directory));
 object(request,['id','expectedRevision','exportId']);
 const intent={schema:'stellar-forge.lineage-support-delivery-intent.v1',request:structuredClone(request)};
 await retainCaseArtifact(join(root,'lineage-support-delivery-intent.json'),Buffer.from(json(intent)));
 await operator.call(PREFIX+'export',request);
 const manifest=await operator.call('merchant_support_export_manifest',{exportId:request.exportId});
 requireValue(manifest.exportId===request.exportId&&manifest.case?.id===request.id&&manifest.case.revision===request.expectedRevision&&
  manifest.manifestFile?.name==='support-export.json'&&Array.isArray(manifest.files),
  'LINEAGE_SUPPORT_EXPORT','The original Support export manifest is incomplete.',409);
 const all=[...manifest.files,manifest.manifestFile],names=new Set(),files=[];
 const nativeRoot=join(configuration.exportsDirectory,request.exportId);
 const nativeStat=await fs.lstat(nativeRoot);
 requireValue(nativeStat.isDirectory()&&!nativeStat.isSymbolicLink(),'LINEAGE_SUPPORT_EXPORT','The selected native export is not its original directory.',409);
 for(const file of all){
  requireValue(typeof file.name==='string'&&file.name===basename(file.name)&&file.name!=='.'&&file.name!=='..'&&!file.name.includes('\\')&&!names.has(file.name),
   'LINEAGE_SUPPORT_EXPORT','The original export contains an invalid or duplicate filename.',409);
  names.add(file.name);hash(file.sha256);
  requireValue(Number.isSafeInteger(file.bytes)&&file.bytes>=0,'LINEAGE_SUPPORT_EXPORT','The original export file size is invalid.',409);
  const output=await publishStream(join(root,file.name),{bytes:file.bytes,sha256:file.sha256},()=>nativeFileParts(join(nativeRoot,file.name),file));
  files.push({name:file.name,path:output.path,bytes:file.bytes,sha256:file.sha256});
 }
 const result={schema:'stellar-forge.lineage-support-delivery.v1',request:structuredClone(request),
  manifestSha256:manifest.manifestFile.sha256,files};
 await retainCaseArtifact(join(root,'lineage-support-delivery.json'),Buffer.from(json(result)));return result;
}
/** Original ranged case file reader; immutable selected case and material bind every chunk. */
export async function downloadMaterialFile({operator,request,destination}){
 object(request,['id','revision','materialId','expectedMaterialSha256','name']);
 const first=await operator.call(PREFIX+'file',{...request,offset:0,length:MAX_FILE_RANGE});
 function check(value,offset){
  requireValue(value.case?.id===request.id&&value.case.revision===request.revision&&value.materialId===request.materialId&&
   value.materialSha256===request.expectedMaterialSha256&&value.name===request.name&&value.offset===offset&&
   value.sha256===first.sha256&&value.totalBytes===first.totalBytes,'LINEAGE_SUPPORT_FILE_CHANGED','The original selected file response changed.',409);
  const bytes=Buffer.from(value.base64??'','base64');
  requireValue(bytes.toString('base64')===value.base64&&value.bytes===bytes.length&&offset+bytes.length<=first.totalBytes,
   'LINEAGE_SUPPORT_FILE_CHANGED','The original file range is incomplete.',409);
  const end=offset+bytes.length;
  requireValue(end===first.totalBytes?value.complete===true&&value.nextOffset===null:bytes.length>0&&value.complete===false&&value.nextOffset===end,
   'LINEAGE_SUPPORT_FILE_CHANGED','The original file continuation changed.',409);
  return bytes;
 }
 const firstBytes=check(first,0);
 const output=await publishStream(resolve(destination),{bytes:first.totalBytes,sha256:first.sha256},async function*(){
  let value=first,offset=0;
  for(;;){const bytes=offset===0?firstBytes:check(value,offset);yield bytes;offset+=bytes.length;if(value.nextOffset===null)break;
   value=await operator.call(PREFIX+'file',{...request,offset,length:MAX_FILE_RANGE});}
 });
 return {...output,case:first.case,materialId:first.materialId,materialSha256:first.materialSha256,name:first.name,mediaType:first.mediaType};
}
/** Receive the full original native workspace/application export through its exact range API. */
export async function downloadLineageWorkspace({operator,workspace,selection,destination}){
 hash(selection.id);requireValue(Number.isSafeInteger(selection.bytes)&&selection.bytes>0,'LINEAGE_SUPPORT_EXPORT','Use the actual native workspace export selection.');
 const output=await publishStream(resolve(destination),{bytes:selection.bytes,sha256:selection.id},async function*(){
  let offset=0;
  while(offset<selection.bytes){
   const value=await operator.call('merchant_lineage_export_read',{workspace,id:selection.id,offset,length:MAX_FILE_RANGE});
   const bytes=Buffer.from(value.base64??'','base64'),end=offset+bytes.length;
   requireValue(value.id===selection.id&&value.offset===offset&&value.totalBytes===selection.bytes&&value.bytes===bytes.length&&
    bytes.length>0&&bytes.toString('base64')===value.base64&&end<=selection.bytes&&value.nextOffset===end&&value.complete===(end===selection.bytes),
    'LINEAGE_SUPPORT_EXPORT_CHANGED','The original Lineage export range differs from its complete selection.',409);
   yield bytes;offset=end;
  }
 });
 return {...output,workspaceId:selection.workspaceId,revision:selection.revision,name:selection.name};
}
async function configurationSelection(path){
 requireValue(path&&isAbsolute(path),'LINEAGE_SUPPORT_INPUT','Select the original private merchant configuration.');
 const handle=await fs.open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{const before=await handle.stat();requireValue(before.isFile()&&before.size>0&&before.size<=4*1024*1024&&(process.platform==='win32'||!(before.mode&0o077)),
  'LINEAGE_SUPPORT_INPUT','Use the original private merchant configuration file.');
  const bytes=await handle.readFile(),after=await handle.stat();
  requireValue(before.size===bytes.length&&before.size===after.size&&before.mtimeMs===after.mtimeMs,'LINEAGE_SUPPORT_INPUT','The selected configuration changed during reading.',409);
  return {path:await fs.realpath(path),sha256:bytesHash(bytes)};
 }finally{await handle.close();}
}
async function readJson(path,maximum=128*1024){
 requireValue(path&&isAbsolute(path),'LINEAGE_SUPPORT_PATH','Choose an absolute original JSON file.');
 const handle=await fs.open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{const stat=await handle.stat();requireValue(stat.isFile()&&stat.size>0&&stat.size<=maximum&&(process.platform==='win32'||!(stat.mode&0o077)),
  'LINEAGE_SUPPORT_INPUT','Use a complete private JSON file within the request limit.');
  const bytes=await handle.readFile();requireValue(bytes.length===stat.size,'LINEAGE_SUPPORT_INPUT','The original request file changed.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }finally{await handle.close();}
}
function parse(argv){
 const args=[...argv],command=args.shift(),options={};
 while(args.length){const key=args.shift();requireValue(['--config','--request','--out','--directory','--destination'].includes(key)&&!Object.hasOwn(options,key),
  'LINEAGE_SUPPORT_INPUT','Choose the documented command options.');const value=args.shift();requireValue(value&&!value.startsWith('--'),'LINEAGE_SUPPORT_INPUT','Supply the original option value.');options[key]=value;}
 return {command,options};
}
export async function main(argv=process.argv.slice(2)){
 if(!argv.length||['help','--help','-h'].includes(argv[0])){console.log(HELP);return 0;}
 const {command,options}=parse(argv);
 requireValue(commands.has(command)||command==='deliver','LINEAGE_SUPPORT_INPUT','Choose a documented Lineage Support command.');
 const request=options['--request']?await readJson(options['--request']):{};
 requireValue(command==='sources'||options['--request'],'LINEAGE_SUPPORT_INPUT','Keep the complete original request file before dispatch.');
 const method=PREFIX+command.replaceAll('-','_');
 const selection=await configurationSelection(options['--config']);
 if(options['--out']){
  requireValue(command!=='file'&&command!=='deliver','LINEAGE_SUPPORT_INPUT','File delivery uses its original destination option.');
  let retained;try{retained=await readJson(resolve(options['--out']),32*1024*1024);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(retained){
   requireValue(retained.schema==='stellar-forge.lineage-support-command.v1'&&retained.tool===method&&retained.configuration&&valueHash(retained.configuration)===valueHash(selection)&&retained.requestSha256===valueHash(request)&&
    valueHash(retained.request)===retained.requestSha256,'LINEAGE_SUPPORT_OUTPUT_CHANGED','The saved output belongs to another original request.',409);
   console.log(json(retained));return 0;
  }
 }
 requireValue(options['--config']&&isAbsolute(options['--config']),'LINEAGE_SUPPORT_INPUT','Select the original private merchant configuration.');
 const configuration=await readMerchantConfig(options['--config']);
 requireValue(valueHash(await configurationSelection(options['--config']))===valueHash(selection),'LINEAGE_SUPPORT_INPUT','The selected configuration changed during opening.',409);
 const operator=new MerchantReleaseOperator(configuration);
 try{
  let result;
  if(command==='deliver'){
   requireValue(options['--directory']&&isAbsolute(options['--directory']),'LINEAGE_SUPPORT_INPUT','Choose an absolute complete customer directory.');
   result=await deliverSupportCase({operator,configuration,request,directory:options['--directory']});
  }else if(command==='file'){
   requireValue(options['--destination']&&isAbsolute(options['--destination']),'LINEAGE_SUPPORT_INPUT','Choose an absolute original file destination.');
   result=await downloadMaterialFile({operator,request,destination:options['--destination']});
  }else result=await operator.call(method,request);
  const receipt={schema:'stellar-forge.lineage-support-command.v1',tool:method,configuration:selection,requestSha256:valueHash(request),request,result};
  if(options['--out']){await privateDirectory(dirname(resolve(options['--out'])));await retainCaseArtifact(resolve(options['--out']),Buffer.from(json(receipt)));}
  console.log(json(receipt));return 0;
 }finally{await operator.close();}
}
if(process.argv[1]&&await fs.realpath(resolve(process.argv[1])).then(path=>path===fileURLToPath(import.meta.url),()=>false))
 main().then(code=>{process.exitCode=code;}).catch(error=>{
  console.error(json({code:error.code??'LINEAGE_SUPPORT_ERROR',message:error.message,status:error.status??500,...(error.details?{details:error.details}:{})}));process.exitCode=1;
 });
