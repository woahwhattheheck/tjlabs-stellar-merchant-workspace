#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/** Preserve the complete Harbour working source in its original Customer Installation. */
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readProfile} from './profiles.mjs';
import {loadSource} from '../../../../services/harbour-source-workspace/build.mjs';
import {json} from '../../../../services/harbour-source-workspace/portable.mjs';
import {inspectHarbour,harbourInstallationTemplate,prepareHarbourInstallation,renderHarbourSource,same,MAX_SOURCE} from './harbour-installation-core.mjs';
import {need,encoded,parse,identity,privateDirectory,retain,originalInput,originalUnchanged,regular,operationLease} from './harbour-installation-io.mjs';
const usage='harbour-installation inspect --input ORIGINAL_WORKING.json\n'+
 'harbour-installation template --input ORIGINAL_WORKING.json --case CASE.json --seed WORKSHARE_SEED.json --out PRIVATE_DIRECTORY\n'+
 'harbour-installation prepare --input ORIGINAL_WORKING.json --case CASE.json --seed WORKSHARE_SEED.json --bindings BINDINGS.json --selection EDITIONS.json --selection-source ORIGINAL_SOURCE_ID --out PRIVATE_DIRECTORY';
async function frozenProgram(output){
 const file=join(output,'Original_Program_Source.json');let raw,prior;
 try{prior=parse(await regular(join(output,'Original_Program_Selection.json'),MAX_SOURCE));}catch(error){if(error.code!=='ENOENT')throw error;}
 try{raw=await regular(file,128*1024*1024);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!raw){need(!prior,'Restore the original complete program bytes before continuing.');raw=encoded(await loadSource());await retain(file,raw);}
 const source=parse(raw),required=['engine.mjs','sha256.mjs','portable.mjs','store.mjs','app.mjs','template.html','style.css','build.mjs','cli.mjs','API.md','README.md','BROWSER_OPERATING.md','run_browser_receiving.mjs','migration-receiving/continuation.mjs'];
 need(source&&typeof source==='object'&&!Array.isArray(source)&&required.every(name=>typeof source[name]==='string'),'Retain the complete original executable source selection.');
 const files=Object.entries(source).map(([path,text])=>{
  need(typeof text==='string'&&path&&!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').some(x=>!x||x==='.'||x==='..'),'Retain each complete original source leaf and relative name.');
  return{path,...identity(Buffer.from(text,'utf8'))};
 });
 const selection={schema:'stellar-forge.harbour-original-program-selection.v1',original:identity(raw),files};
 if(prior)need(same(prior,selection),'The original complete program selection changed.');
 await retain(join(output,'Original_Program_Selection.json'),encoded(selection));
 // Execute the frozen original packager as well as retaining its source. A later installed packager must not rebuild an old operation differently.
 const root=join(output,'original-program');
 for(const [name,text] of Object.entries(source)){
  const path=name.startsWith('migration-receiving/')?join(root,name):join(root,'harbour-source-workspace',name);
  await retain(path,Buffer.from(text,'utf8'));
 }
 const portable=await import(pathToFileURL(join(root,'harbour-source-workspace','portable.mjs')).href);
 return{source,raw,selection,portable};
}
async function frozenProfile(output){
 const file=join(output,'Original_Installation_Profile.json'),selectionFile=join(output,'Original_Profile_Selection.json');let raw,selected;
 try{raw=await regular(file,2*1024*1024);}catch(error){if(error.code!=='ENOENT')throw error;}
 try{selected=parse(await regular(selectionFile,MAX_SOURCE));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!raw){need(!selected,'Restore the original complete profile bytes before continuing.');const profile=readProfile('harbour-source');
  raw=await regular(profile.source.path,2*1024*1024);need(same(identity(raw),{bytes:profile.source.bytes,sha256:profile.source.sha256}),'The current profile changed before its initial selection.');
  // Freeze complete bytes first; a lost selection publication can derive its original identity from this original body.
  await retain(file,raw);
 }
 const value=parse(raw);need(value.schema==='stellar-forge.installation-workorder-profile.v1'&&value.id==='harbour-source','Keep the original Harbour profile.');
 if(!selected)selected={schema:'stellar-forge.harbour-original-profile-selection.v1',path:'Original_Installation_Profile.json',...identity(raw)};
 need(selected.schema==='stellar-forge.harbour-original-profile-selection.v1'&&selected.path==='Original_Installation_Profile.json'&&same({bytes:selected.bytes,sha256:selected.sha256},identity(raw)),'The retained original profile changed.');
 await retain(selectionFile,encoded(selected));return{value,source:selected,raw};
}
export async function main(argv=process.argv.slice(2)){
 const [command,...args]=argv,options={};need(['inspect','template','prepare'].includes(command),usage);
 for(let i=0;i<args.length;i+=2){const key=args[i]?.replace(/^--/,'');need(['input','case','seed','bindings','selection','selection-source','out'].includes(key)&&args[i+1]&&!Object.hasOwn(options,key),usage);options[key]=args[i+1];}
 const required=command==='inspect'?['input']:command==='template'?['input','case','seed','out']:['input','case','seed','bindings','selection','selection-source','out'];
 need(required.every(k=>options[k])&&Object.keys(options).every(k=>required.includes(k)),usage);
 for(const k of ['input','case','seed','bindings','selection','out'])if(options[k])options[k]=resolve(options[k]);
 if(command==='inspect'){const raw=await regular(options.input,MAX_SOURCE),source=inspectHarbour(raw);await originalUnchanged(options.input,raw,MAX_SOURCE);console.log(json(source));return source;}
 const output=await privateDirectory(options.out),lease=await operationLease(join(output,'harbour-installation.lock'));
 try{
  await retain(join(output,'Original_Arguments.json'),encoded({command,...options}));
  const rows=[],take=async(name,key,max=MAX_SOURCE)=>{const row=await originalInput(output,name,options[key],max);rows.push({key,...row});return row;};
  const original=await take('Harbour_Original_Working.json','input');
  const caseInput=await take('Original_Operations_Case.json','case'),seed=await take('Original_Workshare_Seed.json','seed');
  const profile=await frozenProfile(output),program=await frozenProgram(output),source=inspectHarbour(original.raw),programSource=program.source,emitted=[];
  const emit=async(name,raw)=>{const row=await retain(join(output,name),raw);emitted.push({...row,path:name});};
  for(const row of rows)emitted.push({path:row.retained.slice(output.length+1),...row.identity});
  await emit('Original_Installation_Profile.json',profile.raw);
  await emit('Original_Profile_Selection.json',encoded(profile.source));
  await emit('Original_Program_Selection.json',encoded(program.selection));
  let value,selection;
  if(command==='template'){
   value=harbourInstallationTemplate({raw:original.raw,seed:parse(seed.raw),caseValue:parse(caseInput.raw),profile:profile.value});selection=value.selection;
   await emit('Selected_Harbour_Editions.json',encoded(selection));await emit('bindings.json',encoded(value.bindings));
  }else{
   const bindings=await take('Original_Bindings.json','bindings'),selected=await take('Selected_Harbour_Editions.json','selection');
   emitted.push({path:'Original_Bindings.json',...bindings.identity},{path:'Selected_Harbour_Editions.json',...selected.identity});selection=parse(selected.raw);
   value=prepareHarbourInstallation({raw:original.raw,seed:parse(seed.raw),caseValue:parse(caseInput.raw),profile:profile.value,bindings:parse(bindings.raw),selectionRaw:selected.raw,selectionSourceId:options['selection-source']});
   const document=encoded(value.prepared.document);need(document.length<=128*1024,'The complete Installation document exceeds its native 128 KiB allowance.');
   await emit('installation-input.json',document);await emit('installation-preview-input.json',encoded(value.prepared.preview));
   await emit('WORKORDER.md',Buffer.from(value.workorder));await emit('Harbour_Installation_Editions.json',encoded(value.snapshot));
   await emit('preparation.json',encoded({...value.prepared,bindings:value.bindings}));
  }
  const record={...source.record,copyId:source.record.copyId||'harbour-installation-'+source.input.sha256};
  const working=program.portable.completeFiles(programSource,record);
  for(const file of working){
   const raw=Buffer.from(program.portable.memberBytes(file));
   await emit('working/'+file.path,raw);
  }
  await emit('Harbour_Complete_Working.zip',Buffer.from(program.portable.zipBytes(working)));
  await emit('Harbour_Complete_Source_Report.json',encoded(source));
  await emit('Harbour_Complete_Source_Report.html',Buffer.from(renderHarbourSource(source,selection)));
  await emit('Original_Program_Source.json',encoded(programSource));
  for(const row of rows)await originalUnchanged(options[row.key],row.raw);
  const receipt={schema:'stellar-forge.harbour-installation-local-receiving.v1',command,
   sourceIdentities:Object.fromEntries(rows.map(row=>[row.key,row.identity])),profile:profile.source,outputs:emitted,
   workspace:source.workspace,caseId:parse(seed.raw).source.caseId,copyId:record.copyId,
   workingSource:identity(encoded(programSource)),
   nativeMutation:'Complete input for the existing Installation preview/save. Original harbour operations, scopes, reviews, relationship witnesses, prepared tables and actual return comparisons retain their exact values.'};
  await retain(join(output,'Harbour_Installation_Receiving.json'),encoded(receipt));console.log(json(receipt));return receipt;
 }finally{await lease.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(error=>{console.error(JSON.stringify({code:error.code??'HARBOUR_INSTALLATION_INPUT',message:String(error.message)}));process.exitCode=1;});
