// MIT. Complete source export with durable progress and exact final member readback.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {core,originalSessions,sessions,codec} from '../runtime.mjs';
import {moduleSources} from '../host/export.mjs';
import {buildFleetAvailabilityStudyDesk} from '../src/build-installed.mjs';
import {createFleetAvailabilityStudyExportJob} from '../host/export-core.mjs';
const require=createRequire(import.meta.url),zip=require('../src/connected_zip.cjs'),storage=require('./checkpoint-storage.cjs'),reader=require('./checkpoint-reader.cjs');
const args={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i].startsWith('--')||process.argv[i+1]===undefined)throw Error('Use --input-manifest PATH --input-root PATH --output PATH');args[process.argv[i].slice(2)]=process.argv[i+1];}
for(const key of ['input-manifest','input-root','output'])if(!args[key]||!path.isAbsolute(args[key]))throw Error('Use absolute '+key);
const files=await moduleSources();
const input=JSON.parse(await fs.readFile(args['input-manifest'],'utf8'));let compact='';
for(const row of input.parts){const text=await fs.readFile(path.resolve(args['input-root'],row.path),'utf8');if(codec.utf8Encode(text).length!==row.bytes||codec.hashText(text)!==row.sha256)throw Error('Complete input fragment changed');compact+=text;}
const inputSha=input.compactSha256||input.sha256;if(codec.hashText(compact)!==inputSha||codec.utf8Encode(compact).length!==(input.compactBytes||input.bytes))throw Error('Complete input identity changed');
const workload=reader(JSON.parse(compact)),state=workload.read(workload.field(workload.root,'state')),records=workload.sequence(workload.field(workload.root,'records')),editions=workload.sequence(workload.field(workload.root,'editions')),output=args.output;
await fs.mkdir(path.join(output,'objects'),{recursive:true});
async function atomic(name,body){const destination=path.join(output,name),temporary=destination+'.pending';await fs.writeFile(temporary,body);await fs.rename(temporary,destination);}
const indexPath=path.join(output,'checkpoint.json'),durableObjects=new Set();let checkpoint=null;
let indexText;try{indexText=await fs.readFile(indexPath,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}if(indexText!==undefined){const priorIndex=JSON.parse(indexText);checkpoint=await storage.restore(priorIndex,p=>fs.readFile(path.join(output,p),'utf8'),codec);for(const p of [...priorIndex.metadata.parts,...priorIndex.payloads.flatMap(x=>x.parts)])durableObjects.add(p.path);}
const job=createFleetAvailabilityStudyExportJob(files,state,records,editions,{codec,core,originalSessions,sessions,buildDesk:buildFleetAvailabilityStudyDesk,zip},{verifiedInputSha256:inputSha,checkpoint});
const prepare=storage.createPreparer(codec);let progress=job.statistics();
while(!progress.done){progress=job.run({maxGroups:8,maxMilliseconds:25000});const saved=prepare(job.checkpoint());
 for(const [name,content]of Object.entries(saved.objects)){if(durableObjects.has(name))continue;let existing;try{existing=await fs.readFile(path.join(output,name),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}if(existing!==undefined){if(existing!==content)throw Error('Existing checkpoint object differs');}else await atomic(name,content);durableObjects.add(name);}
 await atomic('checkpoint.json',JSON.stringify(saved.manifest,null,2)+'\n');process.stdout.write(JSON.stringify(progress)+'\n');
}
const checkpointComplete=job.checkpoint(),bytes=job.finish(),expected=new Map(checkpointComplete.entries.map(x=>[x.name,x]));let manifest=null;
const P=require('../vendor/pako.cjs'),rows=zip.readZip(bytes,{maxBytes:256*1024*1024,maxUncompressedBytes:512*1024*1024,maxEntries:60000,inflateRaw:b=>P.inflateRaw(b),visitEntry(row){const expectedRow=expected.get(row.name);if(!expectedRow||expectedRow.bytes!==row.bytes||expectedRow.sha256!==codec.sha256Bytes(row.data))throw Error('Final complete ZIP member differs '+row.name);expected.delete(row.name);if(row.name==='EXPORT_MANIFEST.json')manifest=JSON.parse(codec.utf8Decode(row.data));if(row.name.startsWith('source/')&&codec.utf8Decode(row.data)!==files[row.name.slice(7)])throw Error('Final source differs');}});
if(expected.size||!manifest||manifest.files.length!==rows.length-1)throw Error('Final archive population incomplete');
await atomic('Complete_Source_Handover.zip',bytes);
const receipt={schema:'commons.complete-resumable-export-receipt.v1',sourceFiles:Object.keys(files).length,inputSha256:inputSha,stateSha256:state.sha256,requests:records.length,editions:editions.length,members:rows.length,bytes:bytes.length,sha256:codec.sha256Bytes(bytes),everyMemberCRCAndSHAExact:true,completedGroups:progress.completedGroups};
await atomic('receipt.json',JSON.stringify(receipt,null,2)+'\n');process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
