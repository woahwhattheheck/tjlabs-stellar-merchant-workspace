// MIT. Receive the already retained publisher fixture through the new source arm.
// This function is imported by the complete original catalogue receiving course;
// it does not start a server, browser, profile engine or a second workspace.
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readBMEcatSourceRows } from './source.mjs';
import { bmecatInputProfile } from './projection.mjs';
export const OFFICIAL_BMECAT_INPUT = Object.freeze({
  archiveUrl:'https://www.etim-international.com/wp-content/uploads/2021/09/ETIM-BMEcat-Guideline-V5-0-2-2024-12-12.zip',
  archiveBytes:3242056,archiveSha256:'aa0fdcfae703005eeeebfe542f877b4167c4e4b04594f2095fc105364d224de4',
  files:[
    {name:'SampleFile_bmecat_etim_V5_T_NEW_CATALOG_ETIM10.xml',bytes:18076,sha256:'50568f0357c982a853eaf523475d18d6f2a594d0c8a392143a4df50007cddf8e'},
    {name:'bmecat_etim_501.xsd',bytes:99041,sha256:'821e4dbcec9fa32b64df4298531adc5d3cdab68507686317dd08e8266378b005'},
    {name:'etim10-supplier-products.jsonl',bytes:5123,sha256:'e8903a41da5ddbaef6bbaa9b6a585aef051488400c02ff5538d364bba0f72903'}
  ]});
const canonical=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(canonical):
  Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const same=(a,b,label)=>{if(JSON.stringify(canonical(a))!==JSON.stringify(canonical(b)))throw Error(label+' differs from the original publisher conversion.');};
async function original(path,identity){
  const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const stat=await h.stat();if(!stat.isFile()||stat.size!==identity.bytes)throw Error('The retained original length differs: '+identity.name);
    const bytes=await h.readFile();if(bytes.length!==identity.bytes||createHash('sha256').update(bytes).digest('hex')!==identity.sha256)throw Error('The retained original hash differs: '+identity.name);
    return bytes;
  }finally{await h.close();}
}
export async function receiveOfficialBMEcatSource({db,fixtureDirectory=fileURLToPath(new URL('../../../examples/supplier-etim/',import.meta.url))}={}){
  const [xml,xsd,expected]=OFFICIAL_BMECAT_INPUT.files;
  await original(join(fixtureDirectory,xml.name),xml);
  await original(join(fixtureDirectory,xsd.name),xsd);
  const expectedRow=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await original(join(fixtureDirectory,expected.name),expected)).trim());
  let metadata=null,callbackCount=0,rows=0,first=null;
  for await(const row of readBMEcatSourceRows(join(fixtureDirectory,xml.name),{db,expectedBytes:xml.bytes,expectedSha256:xml.sha256,
    onDocument:value=>{callbackCount++;metadata=value;}})){
    if(!metadata||callbackCount!==1)throw Error('Original source was not completed before its first catalogue row.');
    rows++;if(rows>1)throw Error('Published source product count changed.');
    same({materialId:row.record.materialId,supplier:row.record.supplier},expectedRow,'Supplier projection');
    const m=row.record.bmecat.mapping;
    same([m.sourceFields,m.mappedUniqueSourceFields,m.unmappedSourceFields.length],[301,203,98],'Complete source field coverage');
    if(row.record.supplier.classification.etim.features.length!==30)throw Error('Original feature count changed.');
    first=row;
  }
  if(rows!==1||callbackCount!==1||metadata.productCount!==1)throw Error('The complete original receiving count changed.');
  return {schema:'stellar-forge.bmecat-original-source-receiving.v1',completed:true,scope:'original source parsing and projection',
    original:xml,schemaSource:xsd,existingProjection:expected,products:rows,materialId:first.record.materialId,originalFeatures:30,
    sourceFields:301,mappedSourceFields:203,unmappedSourceFields:98,originalSupplierProjectionExact:true,
    completeDocumentBeforeFirstRow:true,metadata,inputProfile:bmecatInputProfile(metadata),
    next:'Continue this same original source through catalogue mapping, review, supplier acceptance, complete customer export and recipient reopen.'};
}
