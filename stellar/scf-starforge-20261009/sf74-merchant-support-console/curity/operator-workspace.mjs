// MIT. Complete source intake and native-case receiving for the Curity operator.
import {join,dirname} from 'node:path';
import {open,link,unlink,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildEdition,openEdition,compareSourceEditions} from './source.mjs';
import {openCurityEditionSource} from './edition-source.mjs';
import {openCurityCaseBridge} from './case-bridge.mjs';
import {openCurityPortable,parseCurityPackageManifest} from './portable.mjs';
import {ID,SHA,hash,bytes,ensure,fields,same,canonical,privateDirectory,read,readJson,optional,retain,locked,member} from './case-io.mjs';

const MAX_SOURCE=1024*1024*1024;
function id(value){ensure(ID.test(value??''),'INPUT_ID','Use a lowercase input ID of at most 64 characters.');return value;}
async function upload(path,pin,stream){
  ensure(Number.isSafeInteger(pin.bytes)&&pin.bytes>=0&&pin.bytes<=2*1024*1024*1024&&SHA.test(pin.sha256??''),
    'UPLOAD','Select one complete original file identity.');
  const partial=path+'.incoming';await privateDirectory(dirname(path));
  let finished=null;try{finished=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);}catch(e){if(e.code!=='ENOENT')throw e;}
  const fd=finished??await open(partial,constants.O_RDWR|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
  try{
    const st=await fd.stat({bigint:true});
    ensure(st.isFile()&&st.nlink===1n&&(st.mode&0o077n)===0n&&st.size<=BigInt(pin.bytes),
      'UPLOAD_PREFIX','Preserve the different existing file.',409);
    const digest=createHash('sha256');let offset=0;
    for await(const part of stream){
      const chunk=Buffer.from(part);ensure(offset+chunk.length<=pin.bytes,'UPLOAD_LIMIT','The uploaded original exceeds its selected size.',413);
      digest.update(chunk);
      const overlap=Math.min(chunk.length,Math.max(0,Number(st.size)-offset));
      if(overlap){
        const old=Buffer.allocUnsafe(overlap);const got=await fd.read(old,0,overlap,offset);
        ensure(got.bytesRead===overlap&&old.equals(chunk.subarray(0,overlap)),'UPLOAD_PREFIX','The original upload differs from its retained prefix.',409);
      }
      ensure(!finished||overlap===chunk.length,'UPLOAD_CHANGED','The completed original has a different length.',409);
      let written=overlap;
      while(!finished&&written<chunk.length){const got=await fd.write(chunk,written,chunk.length-written,offset+written);
        ensure(got.bytesWritten>0,'UPLOAD_WRITE','The upload write did not advance.');written+=got.bytesWritten;}
      offset+=chunk.length;
    }
    ensure(offset===pin.bytes&&digest.digest('hex')===pin.sha256,'UPLOAD_INCOMPLETE','The complete selected original bytes and SHA-256 are required.',409);
    if(!finished){
      await fd.sync();
      try{await link(partial,path);}catch(e){if(e.code!=='EEXIST')throw e;ensure(false,'UPLOAD_CHANGED','The destination changed during upload.',409);}
      const parent=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY);try{await parent.sync();}finally{await parent.close();}
      await unlink(partial);
    }
    return {bytes:pin.bytes,sha256:pin.sha256,reused:Boolean(finished)};
  }finally{await fd.close();}
}
export async function openCurityOperator({directory,store,casesDirectory,sourceDelivery,incidentDesk=null,applicationFiles,
  python=process.env.SCF_PYTHON||'python3',environment=process.env}={}){
  const root=await privateDirectory(directory),editions=join(root,'editions'),inputs=join(root,'inputs'),
    incoming=join(root,'incoming'),receiving=join(root,'receiving');
  await Promise.all([editions,inputs,incoming,receiving].map(x=>privateDirectory(x)));
  const source=await openCurityEditionSource({directory:editions});
  const bridge=await openCurityCaseBridge({store,directory:join(root,'case-operations'),source,incidentDesk});
  const portable=await openCurityPortable({store,casesDirectory,sourceDelivery,bridge,source,
    directory:join(root,'packages'),applicationFiles,python,environment});
  async function compareSource(input){
    fields(input,['comparisonId','beforeEditionId','afterEditionId'],'complete source comparison');id(input.comparisonId);
    const folder=join(root,'comparisons',input.comparisonId);
    return locked(folder,async()=>{
      const before=await source.locate(input.beforeEditionId),after=await source.locate(input.afterEditionId);
      const selected={schema:'curity.operator-comparison/v1',...input,
        beforeManifestSha256:before.manifestSha256,afterManifestSha256:after.manifestSha256};
      const previous=await optional(join(folder,'INPUT.json'));
      if(previous)same(previous,selected);else await retain(join(folder,'INPUT.json'),selected);
      const comparison=await compareSourceEditions(before.directory,after.directory,{directory:join(folder,'result')});
      const result={comparisonId:input.comparisonId,comparison};
      await retain(join(folder,'RESULT.json'),result);return result;
    });
  }
  async function comparison({comparisonId}){
    id(comparisonId);const folder=join(root,'comparisons',comparisonId);
    const previous=await readJson(join(folder,'INPUT.json')),result=await readJson(join(folder,'RESULT.json'));
    const before=await source.locate(previous.beforeEditionId),after=await source.locate(previous.afterEditionId);
    same({beforeManifestSha256:before.manifestSha256,afterManifestSha256:after.manifestSha256},
      {beforeManifestSha256:previous.beforeManifestSha256,afterManifestSha256:previous.afterManifestSha256});
    // The original comparator receives only an already completed published
    // result here; unfinished requests are continued through the POST action.
    await readJson(join(folder,'result','comparison.json'));
    same(result,{comparisonId,comparison:await compareSourceEditions(before.directory,after.directory,{directory:join(folder,'result')})});
    return result;
  }
  async function comparisons(){
    let rows=[];try{rows=await readdir(join(root,'comparisons'),{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
    const found=[];for(const row of rows)if(row.isDirectory()&&!row.isSymbolicLink()&&ID.test(row.name)){
      const result=await optional(join(root,'comparisons',row.name,'RESULT.json'));
      if(result)found.push({id:row.name,before:result.comparison.before,after:result.comparison.after,counts:result.comparison.counts,sourceState:result.comparison.sourceState});
    }return {comparisons:found};
  }
  async function comparisonFile({comparisonId,name}){
    ensure(['comparison.json','changes.jsonl'].includes(name),'COMPARISON_FILE','Select the complete original comparison or change report.');
    const selected=await comparison({comparisonId}),folder=join(root,'comparisons',comparisonId,'result');
    const pin=name==='changes.jsonl'?selected.comparison.changes:await(async()=>{const raw=await read(join(folder,name));return {bytes:raw.length,sha256:hash(raw)};})();
    return {path:await member(folder,name),file:{name,bytes:pin.bytes,sha256:pin.sha256}};
  }
  async function prepareSource(input){
    fields(input,['id','installationId','sourceContext','sourceEdition','files','mapping','coverage','binding','review']);
    id(input.id);
    ensure(Array.isArray(input.files)&&input.files.length>0&&input.files.length<=20,'SOURCE_FILES','Select 1..20 complete source files.');
    for(const file of input.files){
      fields(file,['name','bytes','sha256','format','sourceUri','exportId','metadata']);
      ensure(typeof file.name==='string'&&file.name.length>0&&file.name.length<=1000&&
        Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=MAX_SOURCE&&SHA.test(file.sha256??'')&&
        ['json','ndjson'].includes(file.format),'SOURCE_FILES','Supply each original filename, framing, exact byte count and SHA-256.');
    }
    ensure(input.files.reduce((sum,file)=>sum+file.bytes,0)<=MAX_SOURCE,'SOURCE_FILES','The selected complete originals exceed one GiB.');
    return locked(join(inputs,input.id),async()=>{
      const selected={schema:'curity.operator-input/v1',...input},previous=await optional(join(inputs,input.id,'INPUT.json'));
      if(previous)same(previous,selected);else await retain(join(inputs,input.id,'INPUT.json'),selected);
      return {id:input.id,files:input.files,sourceContext:input.sourceContext,reused:Boolean(previous)};
    });
  }
  async function sourceInput(selected){
    const seen=new Set();let current=selected;
    while(current.sourceInputId){
      ensure(!seen.has(current.sourceInputId),'SOURCE_CYCLE','The retained source input contains a cycle.');
      seen.add(current.sourceInputId);ensure(seen.size<=1000,'SOURCE_CYCLE','The selected source history is too long.');
      const previous=await readJson(join(inputs,id(current.sourceInputId),'INPUT.json'));
      same(current.files,previous.files);current=previous;
    }
    return current.id;
  }
  async function uploadSource({inputId,index,stream}){
    id(inputId);ensure(Number.isSafeInteger(index)&&index>=0&&index<20,'SOURCE_FILE','Select an original source file.');
    return locked(join(inputs,inputId),async()=>{
      const request=await readJson(join(inputs,inputId,'INPUT.json'));
      ensure(!request.sourceInputId,'SOURCE_RECEIVED','This reviewed edition uses its original retained source files.');
      const selected=request.files[index];ensure(selected,'SOURCE_FILE','The selected source file is absent.');
      return upload(join(inputs,inputId,'files',String(index)+'.bin'),selected,stream);
    });
  }
  async function buildSource({inputId}){
    id(inputId);
    return locked(join(inputs,inputId),async()=>{
      const request=await readJson(join(inputs,inputId,'INPUT.json'));
      const existing=await optional(join(inputs,inputId,'BUILT.json'));
      if(existing){await source.locate(existing.editionId);return existing;}
      const originalId=await sourceInput(request);
      const files=request.files.map((row,index)=>({path:join(inputs,originalId,'files',String(index)+'.bin'),
        name:row.name,format:row.format,sha256:row.sha256,...(row.sourceUri===undefined?{}:{sourceUri:row.sourceUri}),
        ...(row.exportId===undefined?{}:{exportId:row.exportId}),...(row.metadata===undefined?{}:{metadata:row.metadata})}));
      const destination=join(editions,inputId),published=await optional(join(destination,'manifest.json'));
      let manifest;
      if(published){
        manifest=await openEdition(destination,{verify:true});
        same({installationId:manifest.installationId,sourceContext:manifest.sourceContext,sourceEdition:manifest.sourceEdition,
          binding:manifest.binding,coverage:manifest.coverage},
          {installationId:request.installationId,sourceContext:request.sourceContext,sourceEdition:request.sourceEdition,
          binding:{...request.binding,observation:request.binding.observation??null},coverage:request.coverage});
        same(await readJson(join(destination,'mapping.json')),request.mapping);
        same(manifest.sourceFiles,request.files.map((row,index)=>({
          sourceId:'source-'+(index+1),index,name:row.name,path:'originals/'+row.sha256+'.bin',
          sha256:row.sha256,bytes:row.bytes,format:row.format,sourceUri:row.sourceUri??null,
          exportId:row.exportId??null,metadata:row.metadata??{},sourceEdition:request.sourceEdition})));
        const retainedReview=await readJson(join(destination,'review.json'));
        const {schema,selectedReferences,id:reviewId,...reviewInput}=retainedReview;
        same(reviewInput,{confirmed:false,operator:null,reason:null,decisions:[],selection:[],...(request.review??{})});
      }else{
        manifest=await buildEdition({directory:destination,installationId:request.installationId,
          sourceContext:request.sourceContext,sourceEdition:request.sourceEdition,files,mapping:request.mapping,
          coverage:request.coverage,binding:request.binding,review:request.review});
      }
      const result={inputId,editionId:manifest.id,sourceContext:manifest.sourceContext,state:manifest.state,
        review:manifest.review,counts:manifest.counts};
      await retain(join(inputs,inputId,'BUILT.json'),result);return result;
    });
  }
  async function freezeReview({inputId,sourceInputId,review,mapping}){
    id(inputId);id(sourceInputId);ensure(inputId!==sourceInputId,'REVIEW','Choose a new edition ID for the reviewed selection.');
    return locked(join(inputs,inputId),async()=>{
      const before=await readJson(join(inputs,sourceInputId,'INPUT.json'));
      ensure(await optional(join(inputs,sourceInputId,'BUILT.json')),'REVIEW','Inspect the original source before freezing its review.');
      const selected={...before,id:inputId,sourceInputId,review,...(mapping===undefined?{}:{mapping})};
      const previous=await optional(join(inputs,inputId,'INPUT.json'));
      if(previous)same(previous,selected);else await retain(join(inputs,inputId,'INPUT.json'),selected);
      return {inputId,sourceInputId,prepared:true};
    });
  }
  async function preparePackage({inputId,manifestText}){
    id(inputId);ensure(typeof manifestText==='string'&&Buffer.byteLength(manifestText)<=64*1024*1024,'PACKAGE','Supply the complete package manifest.');
    const manifest=parseCurityPackageManifest(JSON.parse(manifestText)),raw=Buffer.from(manifestText);
    return locked(join(incoming,inputId),async()=>{
      await retain(join(incoming,inputId,'curity-case-package.json'),raw);
      return {inputId,manifestSha256:hash(raw),id:manifest.id,files:manifest.files};
    });
  }
  async function uploadPackage({inputId,name,stream}){
    id(inputId);
    return locked(join(incoming,inputId),async()=>{
      const manifest=parseCurityPackageManifest(await readJson(join(incoming,inputId,'curity-case-package.json'),64*1024*1024));
      const row=manifest.files.find(x=>x.name===name);ensure(row,'PACKAGE_FILE','Select a declared original package member.');
      return upload(await member(join(incoming,inputId),name,{parents:true}),row,stream);
    });
  }
  async function receivePackage({inputId,requestId,actor}){
    id(inputId);id(requestId);
    const raw=await read(join(incoming,inputId,'curity-case-package.json'),64*1024*1024);
    return portable.receive({packageDirectory:join(incoming,inputId),expectedManifestSha256:hash(raw),requestId,actor,
      receivingDirectory:join(receiving,requestId)});
  }
  async function packages(){
    const result=[];
    let rows=[];try{rows=await readdir(join(portable.directory,'exports'),{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')throw e;}
    for(const row of rows)if(row.isDirectory()&&ID.test(row.name)){
      const manifest=await optional(join(portable.directory,'exports',row.name,'curity-case-package.json'),64*1024*1024);
      if(manifest)result.push({exportId:row.name,id:manifest.id,operationId:manifest.operationId,source:manifest.source,
        files:manifest.files.length,createdAt:manifest.createdAt});
    }
    return {packages:result};
  }
  async function packageFile({exportId,name}){
    id(exportId);
    const folder=join(portable.directory,'exports',exportId),manifest=await readJson(join(folder,'curity-case-package.json'),64*1024*1024);
    let pin;
    if(name==='curity-case-package.json'){const raw=await read(join(folder,name),64*1024*1024);pin={bytes:raw.length,sha256:hash(raw)};}
    else pin=manifest.files.find(row=>row.name===name);
    ensure(pin,'PACKAGE_FILE','The selected completed package has no such member.',404);
    return {path:await member(folder,name),file:{name,...pin}};
  }
  return Object.freeze({directory:root,identity:hash(root),store,incidentDesk,source,bridge,portable,prepareSource,uploadSource,buildSource,freezeReview,
    preparePackage,uploadPackage,receivePackage,packages,packageFile,compareSource,comparison,comparisons,comparisonFile,
    async state(){return {identity:hash(root),sources:await source.catalog(),operations:await bridge.list(),packages:await packages(),comparisons:await comparisons(),
      incidentProfiles:incidentDesk?incidentDesk.profiles():{enabled:false,sources:[]}};},
    async close(){}});
}
