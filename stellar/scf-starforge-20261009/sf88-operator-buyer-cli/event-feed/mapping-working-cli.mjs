/* MIT. Complete file-only Event mapping working copies; native acceptance stays with Analysis. */
import {open,mkdir,link,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as parser from './analysis-source.mjs';
import {createEventMappingWorkingAPI,eventMappingHash,MAX_EVENT_MAPPING_WORKING_BYTES} from './mapping-working.mjs';
import {renderEventMappingWorking} from './mapping-working-html.mjs';

const api=createEventMappingWorkingAPI(parser),here=dirname(fileURLToPath(import.meta.url));
async function original(path,max=MAX_EVENT_MAPPING_WORKING_BYTES){
 const fd=await open(resolve(path),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const before=await fd.stat();if(!before.isFile()||before.size>max)throw Error('Open a complete regular input file within its allowance.');
  const bytes=await fd.readFile(),after=await fd.stat();
  if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||bytes.length!==before.size)throw Error('The original input changed while being read.');
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 }finally{await fd.close();}
}
async function publish(path,text){
 const target=resolve(path),body=Buffer.from(text,'utf8');await mkdir(dirname(target),{recursive:true,mode:0o700});
 const temporary=join(dirname(target),'.event-mapping-'+randomUUID()+'.part');
 const file=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
 try{
  try{await file.writeFile(body);await file.sync();}finally{await file.close();}
  try{await link(temporary,target);}
  catch(error){if(error.code!=='EEXIST')throw error;const prior=await original(target,Math.max(body.length,1));if(prior!==text)throw Error('Keep the different existing output; select a new complete destination.');return {path:target,bytes:body.length,sha256:eventMappingHash(text),reused:true};}
  return {path:target,bytes:body.length,sha256:eventMappingHash(text),reused:false};
 }finally{await unlink(temporary);}
}
function options(args){
 const value={};for(let i=0;i<args.length;i+=2){if(!/^--[a-z-]+$/.test(args[i])||args[i+1]===undefined||Object.hasOwn(value,args[i]))throw Error('Use distinct named options with complete values.');value[args[i]]=args[i+1];}return value;
}
function exact(o,allowed,required){if(Object.keys(o).some(k=>!allowed.includes(k))||required.some(k=>!o[k]))throw Error('Select '+required.join(', ')+'; supported options: '+allowed.join(', ')+'.');}
async function checked(text){
 const value=JSON.parse(text),comparison=value.schema==='stellar-forge.event-mapping-source-pair.v1'?value.comparison:value.original?.comparison;
 const source=await original(join(here,'analysis-source.mjs'),1024*1024);
 if(!comparison||eventMappingHash(source)!==comparison.receiver?.core_sha256)throw Error('Use the original installed parser selected by this source. Preserve historical working files with their complete editable HTML.');
 return value;
}
function distinct(input,output){if(resolve(input)===resolve(output))throw Error('Keep the original input; select a different complete output filename.');}
export async function main(argv=process.argv.slice(2)){
 const [command,...rest]=argv,o=options(rest);
 if(command==='create'){
  exact(o,['--source','--draft','--out'],['--source','--out']);distinct(o['--source'],o['--out']);if(o['--draft'])distinct(o['--draft'],o['--out']);
  const source=await checked(await original(o['--source'])),draft=o['--draft']?JSON.parse(await original(o['--draft'],4*1024*1024)):undefined;
  return publish(o['--out'],api.serialize(api.create(source,{draft})));
 }
 exact(o,command==='update'?['--in','--draft','--out']:command==='sources'?['--in','--out-dir']:command==='inspect'?['--in']:['--in','--out'],command==='update'?['--in','--draft','--out']:command==='sources'?['--in','--out-dir']:command==='inspect'?['--in']:['--in','--out']);
 const value=api.reopen(await checked(await original(o['--in'])));
 if(command==='inspect')return {schema:value.schema,original:value.original.comparison,status:api.status(value),comparison:value.comparison,history:value.history,draft:value.draft,files:api.files(value).map(({text,...file})=>file)};
 if(command==='sources'){
  const destination=resolve(o['--out-dir']),input=resolve(o['--in']);
  const files=api.files(value),outputs=[];
  const names=files.map(f=>f.side+'-'+(f.kind==='ndjson'?'events.ndjson':'events.manifest.json'));
  for(const name of [...names,'Original_sources.json'])if(join(destination,name)===input)throw Error('Retain the working input outside its extracted source filenames.');
  for(let i=0;i<files.length;i++)outputs.push(await publish(join(destination,names[i]),files[i].text));
  const index={schema:'stellar-forge.event-mapping-original-files.v1',original:value.original.comparison,files:files.map(({text,...f},i)=>({...f,path:names[i]}))};
  outputs.push(await publish(join(destination,'Original_sources.json'),JSON.stringify(index)+'\n'));return {directory:destination,files:outputs};
 }
 distinct(o['--in'],o['--out']);
 if(command==='update'){distinct(o['--draft'],o['--out']);return publish(o['--out'],api.serialize(api.updateDraft(value,JSON.parse(await original(o['--draft'],4*1024*1024)))));}
 if(command==='compare')return publish(o['--out'],api.serialize(api.compare(value)));
 if(command==='native')return publish(o['--out'],JSON.stringify(api.nativeReview(value))+'\n');
 if(command==='html'){
  const [modelSource,parserSource,controllerSource,reviewModelSource,reviewControllerSource]=await Promise.all(['mapping-working.mjs','analysis-source.mjs','mapping-working-ui.mjs','mapping-review.mjs','mapping-review-ui.mjs'].map(name=>original(join(here,name),1024*1024)));
  return publish(o['--out'],renderEventMappingWorking(value,{modelSource,parserSource,controllerSource,reviewModelSource,reviewControllerSource}));
 }
 throw Error('Use create, update, compare, inspect, native, html or sources.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().then(value=>process.stdout.write(JSON.stringify(value)+'\n')).catch(error=>{process.stderr.write(JSON.stringify({error:error.message})+'\n');process.exitCode=1;});
