#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/** Preserve the complete Tourism working source in its original Customer Installation. */
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readProfile} from './profiles.mjs';
import {loadSource} from '../../../../services/tourism-series-workspace/build.mjs';
import {completeFiles,zipBytes,json} from '../../../../services/tourism-series-workspace/portable.mjs';
import {inspectTourism,tourismInstallationTemplate,prepareTourismInstallation,renderTourismSource,same,MAX_SOURCE} from './tourism-installation-core.mjs';
import {need,encoded,parse,identity,privateDirectory,retain,originalInput,originalUnchanged,regular,operationLease} from './tourism-installation-io.mjs';
const usage='tourism-installation inspect --input ORIGINAL_WORKING.json\n'+
 'tourism-installation template --input ORIGINAL_WORKING.json --case CASE.json --seed WORKSHARE_SEED.json --out PRIVATE_DIRECTORY\n'+
 'tourism-installation prepare --input ORIGINAL_WORKING.json --case CASE.json --seed WORKSHARE_SEED.json --bindings BINDINGS.json --selection EDITIONS.json --selection-source ORIGINAL_SOURCE_ID --out PRIVATE_DIRECTORY';
export async function main(argv=process.argv.slice(2)){
 const [command,...args]=argv,options={};need(['inspect','template','prepare'].includes(command),usage);
 for(let i=0;i<args.length;i+=2){const key=args[i]?.replace(/^--/,'');need(['input','case','seed','bindings','selection','selection-source','out'].includes(key)&&args[i+1]&&!Object.hasOwn(options,key),usage);options[key]=args[i+1];}
 const required=command==='inspect'?['input']:command==='template'?['input','case','seed','out']:['input','case','seed','bindings','selection','selection-source','out'];
 need(required.every(k=>options[k])&&Object.keys(options).every(k=>required.includes(k)),usage);
 for(const k of ['input','case','seed','bindings','selection','out'])if(options[k])options[k]=resolve(options[k]);
 if(command==='inspect'){const raw=await regular(options.input,MAX_SOURCE),source=inspectTourism(raw);await originalUnchanged(options.input,raw,MAX_SOURCE);console.log(json(source));return source;}
 const output=await privateDirectory(options.out),lease=await operationLease(join(output,'tourism-installation.lock'));
 try{
  await retain(join(output,'Original_Arguments.json'),encoded({command,...options}));
  const rows=[],take=async(name,key,max=MAX_SOURCE)=>{const row=await originalInput(output,name,options[key],max);rows.push({key,...row});return row;};
  const original=await take('Tourism_Original_Working.json','input');
  const caseInput=await take('Original_Operations_Case.json','case'),seed=await take('Original_Workshare_Seed.json','seed');
  const profile=readProfile('tourism-series'),source=inspectTourism(original.raw),programSource=await loadSource(),emitted=[];
  const emit=async(name,raw)=>{const row=await retain(join(output,name),raw);emitted.push({...row,path:name});};
  for(const row of rows)emitted.push({path:row.retained.slice(output.length+1),...row.identity});
  await emit('Original_Installation_Profile.json',encoded(profile.value));
  let value,selection;
  if(command==='template'){
   value=tourismInstallationTemplate({raw:original.raw,seed:parse(seed.raw),caseValue:parse(caseInput.raw),profile:profile.value});selection=value.selection;
   await emit('Selected_Tourism_Editions.json',encoded(selection));await emit('bindings.json',encoded(value.bindings));
  }else{
   const bindings=await take('Original_Bindings.json','bindings'),selected=await take('Selected_Tourism_Editions.json','selection');
   emitted.push({path:'Original_Bindings.json',...bindings.identity},{path:'Selected_Tourism_Editions.json',...selected.identity});selection=parse(selected.raw);
   value=prepareTourismInstallation({raw:original.raw,seed:parse(seed.raw),caseValue:parse(caseInput.raw),profile:profile.value,bindings:parse(bindings.raw),selectionRaw:selected.raw,selectionSourceId:options['selection-source']});
   const document=encoded(value.prepared.document);need(document.length<=128*1024,'The complete Installation document exceeds its native 128 KiB allowance.');
   await emit('installation-input.json',document);await emit('installation-preview-input.json',encoded(value.prepared.preview));
   await emit('WORKORDER.md',Buffer.from(value.workorder));await emit('Tourism_Installation_Editions.json',encoded(value.snapshot));
   await emit('preparation.json',encoded({...value.prepared,bindings:value.bindings}));
  }
  const record={...source.record,copyId:source.record.copyId||'tourism-installation-'+source.input.sha256};
  const working=completeFiles(programSource,record);
  for(const file of working){
   const raw=file.base64!==undefined?Buffer.from(file.base64,'base64'):Buffer.from(file.content);
   await emit('working/'+file.path,raw);
  }
  await emit('Tourism_Complete_Working.zip',Buffer.from(zipBytes(working)));
  await emit('Tourism_Complete_Source_Report.json',encoded(source));
  await emit('Tourism_Complete_Source_Report.html',Buffer.from(renderTourismSource(source,selection)));
  await emit('Original_Program_Source.json',encoded(programSource));
  for(const row of rows)await originalUnchanged(options[row.key],row.raw);
  const receipt={schema:'stellar-forge.tourism-installation-local-receiving.v1',command,
   sourceIdentities:Object.fromEntries(rows.map(row=>[row.key,row.identity])),profile:profile.source,outputs:emitted,
   workspace:source.workspace,caseId:parse(seed.raw).source.caseId,copyId:record.copyId,
   workingSource:identity(encoded(programSource)),
   nativeMutation:'Complete input for the existing Installation preview/save. Original tourism operations, reports, qualifications and target results retain their exact values.'};
  await retain(join(output,'Tourism_Installation_Receiving.json'),encoded(receipt));console.log(json(receipt));return receipt;
 }finally{await lease.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(error=>{console.error(JSON.stringify({code:error.code??'TOURISM_INSTALLATION_INPUT',message:String(error.message)}));process.exitCode=1;});
