// SPDX-License-Identifier: MIT
// Read-only original Material Catalog/SF49 engine. No catalogue or case writer.
import {readSync} from 'node:fs';
import {mkdir,writeFile,cp,lstat,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {readProfile} from '../../sf49_data_commissioning/installation-workorders/profiles.mjs';
import {inspectMaterialSource,materialInstallationTemplate,prepareMaterialInstallation,identity,need,same} from '../../../../products/material-catalog/commissioning/core.mjs';
import {compareEditions,TABLES} from '../../../../products/material-catalog/recipient/core.mjs';
import {prepareMaterialInstallationFiles,reopenMaterialInstallation} from '../../../../products/material-catalog/commissioning/files.mjs';
export const MAX_SOURCE=128*1024*1024,MAX_REQUEST=400*1024*1024,MAX_RESPONSE=512*1024*1024;
const clone=value=>JSON.parse(JSON.stringify(value));
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
function bytes(value,maximum,label,allowEmpty=false){
 need(typeof value==='string'&&value.length<=4*Math.ceil(maximum/3),'Select complete bounded base64 '+label+'.');
 const raw=Buffer.from(value,'base64');
 need((allowEmpty||raw.length>0)&&raw.length<=maximum&&raw.toString('base64')===value,'Original '+label+' encoding or size differs.');
 return raw;
}
function page(rows,input){
 const offset=input.offset??0,limit=input.limit??50;
 need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=200,'Use an original whole offset and a page size from 1 to 200.');
 need(offset<=rows.length,'The original record offset is outside this selection.');
 let count=0,size=0;
 for(const value of rows.slice(offset,offset+limit)){
  const length=Buffer.byteLength(JSON.stringify(value));
  need(length<=24*1024*1024,'An original record exceeds the complete report bound.');
  if(count&&size+length>24*1024*1024)break;
  size+=length;++count;
 }
 return {total:rows.length,offset,rows:rows.slice(offset,offset+count).map(clone),nextOffset:offset+count<rows.length?offset+count:null};
}
const selectedFields=(record,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(record,key)).map(key=>[key,clone(record[key])]));
function describe(bundle){
 return {schema:'stellar-forge.material-source-desk-inspection.v1',file:clone(bundle.identity),summary:clone(bundle.summary),
  catalogue:selectedFields(bundle.catalog,['id','title','tenantId','revision','activeEditionId']),
  editions:bundle.tables.catalog_editions.map(row=>selectedFields(row.record,['id','catalogId','parentEditionId','baseEditionId','sourceId','createdAt','kind','mode','counts','materialRoot'])),
  sources:[...bundle.sources.values()].map(({manifest,bytes})=>({manifest:clone(manifest),file:identity(bytes)})),
  supplierPlans:bundle.tables.catalog_supplier_plans.map(row=>({id:row.id,revision:row.revision,title:row.record.title??row.record.name??row.id})),
  supplierReviews:bundle.tables.catalog_supplier_reviews.map(row=>({id:row.id,planId:row.record.planId,editionId:row.record.editionId,createdAt:row.record.createdAt})),
  tables:Object.fromEntries(Object.entries(bundle.tables).map(([name,rows])=>[name,rows.length]))};
}
function originalInputs(input,raw){
 const commissioningBytes=bytes(input.commissioningBase64,8*1024*1024,'original commissioning source');
 const packetBytes=input.packetBase64===null||input.packetBase64===undefined?null:bytes(input.packetBase64,8*1024*1024,'original receiving packet');
 return {bundleBytes:raw,expectedBundleSha256:identity(raw).sha256,seed:input.seed,caseSnapshot:input.caseValue,
  profile:readProfile('supplier-catalogues').value,commissioningBytes,commissioning:JSON.parse(commissioningBytes.toString('utf8')),
  packetBytes,operationId:input.operationId,selection:input.selection,bindings:input.bindings,
  attachments:(input.attachments??[]).map(file=>{
   need(file&&typeof file.filename==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(file.filename)&&typeof file.purpose==='string'&&file.purpose.trim(),'Retain each selected complete additional original source.');
   const raw=bytes(file.contentBase64,64*1024*1024,'selected additional source',true);
   need(same(identity(raw),{bytes:file.bytes,sha256:file.sha256}),'The original selected additional source changed.');
   return {path:'attachments/'+file.filename,purpose:file.purpose,bytes:raw};
  })};
}
export async function performMaterialSource(input){
 const raw=bytes(input.sourceBase64,MAX_SOURCE,'retained material catalogue'),sha=identity(raw).sha256;
 if(input.action==='template')return materialInstallationTemplate(originalInputs(input,raw));
 if(input.action==='prepare')return prepareMaterialInstallation(originalInputs(input,raw));
 if(input.action==='handover'){
  const data=originalInputs(input,raw),prepared=prepareMaterialInstallation(data);
  need(identity(Buffer.from(JSON.stringify(prepared))).sha256===input.expectedPreparedSha256,'The original reviewed material preparation differs.');
  need(typeof input.outputRoot==='string'&&resolve(input.outputRoot)===input.outputRoot,'Use the original private receiving directory.');
  const stat=await lstat(input.outputRoot);
  need(stat.isDirectory()&&!stat.isSymbolicLink()&&!(stat.mode&0o077)&&(await readdir(input.outputRoot)).length===0,'Use an empty owned private receiving directory.');
  const inputs=join(input.outputRoot,'inputs'),out=join(input.outputRoot,'handover'),cold=join(input.outputRoot,'independent-reopen');
  await mkdir(inputs,{mode:0o700});
  await mkdir(join(inputs,'attachments'),{mode:0o700});
  const files={'bundle.jsonl':raw,'seed.json':json(data.seed),'case.json':json(data.caseSnapshot),
   'commissioning.json':data.commissioningBytes,'bindings.json':json(data.bindings),'selection.json':json(data.selection)};
  if(data.packetBytes)files['packet.json']=data.packetBytes;
  const attachments={schema:'stellar-forge.material-customer-installation.v1.attachments',files:data.attachments.map(file=>({filename:file.path.slice('attachments/'.length),path:file.path,purpose:file.purpose,...identity(file.bytes)}))};
  files['attachments.json']=json(attachments);
  for(const file of data.attachments)files[file.path]=Buffer.from(file.bytes);
  for(const [name,body]of Object.entries(files))await writeFile(join(inputs,name),body,{flag:'wx',mode:0o600});
  const receipt=await prepareMaterialInstallationFiles({bundle:join(inputs,'bundle.jsonl'),sha256:sha,
   seed:join(inputs,'seed.json'),case:join(inputs,'case.json'),commissioning:join(inputs,'commissioning.json'),
   ...(data.packetBytes?{packet:join(inputs,'packet.json')}:{}),bindings:join(inputs,'bindings.json'),
   selection:join(inputs,'selection.json'),attachments:join(inputs,'attachments.json'),out});
  await cp(out,cold,{recursive:true,errorOnExist:true,force:false});
  const reopened=await reopenMaterialInstallation(cold);
  need(same(receipt,reopened),'Independent complete material handover reopening differs.');
  return {schema:'stellar-forge.material-source-desk-handover.v1',directory:out,receipt,
   independentReopen:{complete:true,files:receipt.files.length+1},source:identity(raw)};
 }
 const bundle=inspectMaterialSource(raw,sha);
 if(input.action==='intake-custody')return {schema:'stellar-forge.material-intake-custody.v1',file:clone(bundle.identity),header:clone(bundle.header),catalogue:selectedFields(bundle.catalog,['id','tenantId','revision','activeEditionId','mappingSha256']),summary:clone(bundle.summary)};
 if(input.action==='custody')return {schema:'stellar-forge.material-source-desk-custody.v1',file:clone(bundle.identity),summary:clone(bundle.summary)};
 if(input.action==='inspect')return describe(bundle);
 if(input.action==='member'){
  const source=bundle.sources.get(input.originalSourceId);
  need(source,'Select one exact original source from the complete retained catalogue.');
  const offset=input.offset??0,limit=input.limit??65536;
  need(Number.isSafeInteger(offset)&&offset>=0&&offset<=source.bytes.length&&Number.isSafeInteger(limit)&&limit>=1&&limit<=262144,'Select a complete original byte range up to 256 KiB.');
  const part=source.bytes.slice(offset,offset+limit);
  return {schema:'stellar-forge.material-source-desk-member.v1',source:clone(source.manifest),file:identity(source.bytes),offset,
   contentBase64:Buffer.from(part).toString('base64'),nextOffset:offset+part.length<source.bytes.length?offset+part.length:null};
 }
 if(input.action==='rows'){
  need(Object.hasOwn(TABLES,input.table),'Select a retained original table.');
  return {table:input.table,...page(bundle.tables[input.table],input)};
 }
 if(input.action==='compare'){
  const result=compareEditions(bundle,input.beforeEditionId,input.afterEditionId);
  return {...result,...page(result.rows,input)};
 }
 throw Error('Select an original material-source operation.');
}
function readInput(){
 const chunks=[];let total=0;const buffer=Buffer.allocUnsafe(65536);
 for(;;){const length=readSync(0,buffer,0,buffer.length,null);if(!length)break;total+=length;
  need(total<=MAX_REQUEST,'The complete original material request exceeds 400 MiB.');chunks.push(Buffer.from(buffer.subarray(0,length)));}
 return JSON.parse(Buffer.concat(chunks,total).toString('utf8'));
}
try{
 const result=await performMaterialSource(readInput()),resultSha256=identity(Buffer.from(JSON.stringify(result))).sha256,body=JSON.stringify({ok:true,result,resultSha256});
 need(Buffer.byteLength(body)<=MAX_RESPONSE,'The complete source response exceeds the complete 512 MiB delivery bound.');
 process.stdout.write(body);
}catch(error){process.stdout.write(JSON.stringify({ok:false,error:{code:'MATERIAL_SOURCE_INPUT',message:error.message}}));process.exitCode=1;}
