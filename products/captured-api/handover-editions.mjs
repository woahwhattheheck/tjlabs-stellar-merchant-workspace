// MIT. Retained incoming/current edition comparisons on the original handover job writer.
import { join } from 'node:path';
import { readCapturedApi } from './workspace.mjs';
import { inspectCapturedHandover } from './handover.mjs';
import { readPackage } from '../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/model.mjs';
import { packageName } from '../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/package-name.mjs';
import { inspectMerchantPackage } from '../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/package-transfer.mjs';
import { parseOpenApiSource } from '../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/source-document.mjs';
import { compareCapturedMerchantEditions, CAPTURED_EDITION_SNAPSHOT_SCHEMA } from './edition-comparison.mjs';
import { HASH, METADATA_LIMIT, canonical, digest, encode, decode, exact, plain, directory,
  present, bytes, readJSON, publishJSON } from './handover-files.mjs';

export const CAPTURED_INCOMING_EDITIONS_SCHEMA='stellar-forge.captured-incoming-editions.v1';
const CONTEXT='stellar-forge.captured-incoming-edition-context.v1';
const RECORD='stellar-forge.captured-incoming-edition-record.v1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail=(code,message,status=409)=>{throw Object.assign(new Error(message),{code,status});};
const need=(value,code,message,status)=>{if(!value)fail(code,message,status);};
const copy=value=>JSON.parse(JSON.stringify(value));
const sha=value=>digest(canonical(value));
const identity=profile=>({directory:profile.directory,projectsDirectory:profile.projectsDirectory,
  receivingDirectory:profile.receivingDirectory,name:profile.name});
const same=(left,right)=>canonical(left)===canonical(right);
const fileName=(index,side)=>'native-inputs/edition-'+String(index).padStart(4,'0')+'-'+side+'.json';

export function capturedEditionBaselines(value={}) {
  need(plain(value)&&Object.keys(value).length<=1000,'CAPTURED_EDITION_BASELINES',
    'Choose installed package names for this incoming collection.');
  return Object.fromEntries(Object.entries(value).map(([name,selected])=>[
    packageName(name),selected===null?null:packageName(selected),
  ]));
}
async function checkedJSON(folder,name,files) {
  const selected=files.find(row=>row.name===name);
  need(selected,'CAPTURED_EDITION_SOURCE','Reopen this original complete merchant package.');
  const raw=await bytes(folder,name,METADATA_LIMIT);
  need(raw.length===selected.bytes&&digest(raw)===selected.sha256,'CAPTURED_EDITION_CHANGED',
    'The selected original package file changed: '+name+'.');
  return decode(raw);
}
async function snapshot(parent,name) {
  const retained=await inspectMerchantPackage({parent,name}),project=await readPackage(parent,name);
  need(project.name===name&&digest(Buffer.from(project.specText))===retained.package.sourceSha256&&
    same(project.manifest,retained.manifest),'CAPTURED_EDITION_CHANGED',
    'The original package changed while selecting its full plan and API source.');
  const original=await checkedJSON(project.folder,'merchant-package.json',retained.files);
  need(same(original,project.manifest),'CAPTURED_EDITION_CHANGED','The selected original manifest changed.');
  const plan=await checkedJSON(project.folder,'merchant-plan.json',retained.files);
  const facade=await checkedJSON(project.folder,'facade-openapi.json',retained.files);
  const selections=await checkedJSON(project.folder,'selections.json',retained.files);
  const routeBindings=await checkedJSON(project.folder,'route-bindings.json',retained.files);
  const upstreams=await checkedJSON(project.folder,'upstreams.json',retained.files);
  return {schema:CAPTURED_EDITION_SNAPSHOT_SCHEMA,package:retained.package,files:retained.files,
    totalBytes:retained.totalBytes,plan,
    sourceDocument:parseOpenApiSource(project.specText).document,facade,
    configuration:{selections,routeBindings,upstreams,preview:project.manifest.preview??null,
      sourceRevision:project.sourceRevision??null}};
}
function nativeFiles(member) {
  // Match the original package-transfer binary ordering, not portable locale order.
  return member.files.filter(row=>row.name!=='package-export.json')
    .slice().sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
}
function incomingMatches(snapshot,member) {
  need(snapshot&&same(snapshot.package,member.package)&&same(snapshot.files,nativeFiles(member)),
    'CAPTURED_EDITION_CHANGED','The incoming merchant differs from its original complete handover: '+member.name+'.');
}
async function currentSnapshot(profile,name) {
  if(name===null||!await present(join(profile.projectsDirectory,name)))return null;
  return snapshot(profile.projectsDirectory,name);
}
async function retainedRecord(root,name,expected) {
  const raw=await bytes(root,name,METADATA_LIMIT),record=decode(raw);
  if(expected)need(raw.length===expected.bytes&&digest(raw)===expected.sha256,
    'CAPTURED_EDITION_RECORD_CHANGED','The retained original edition comparison file changed.');
  need(record.schema===RECORD,'CAPTURED_EDITION_RECORD_CHANGED','Read the original complete comparison record.');
  return {record,file:{name,bytes:raw.length,sha256:digest(raw)}};
}
async function writeRecord(root,name,binding,data) {
  let retained;
  if(await present(join(root,name)))retained=await retainedRecord(root,name);
  else {
    await publishJSON(root,name,{schema:RECORD,...binding,data});
    retained=await retainedRecord(root,name);
  }
  const {data:old,...metadata}=retained.record;
  need(same(metadata,{schema:RECORD,...binding}),'CAPTURED_EDITION_RECORD_CHANGED',
    'Continue the original comparison with its selected package and installed baseline.');
  return retained;
}
function checkedResult(value) {
  need(plain(value)&&value.schema===CAPTURED_INCOMING_EDITIONS_SCHEMA&&
    HASH.test(value.comparisonSha256??'')&&plain(value.binding)&&Array.isArray(value.packages)&&value.packages.length<=1000,
    'CAPTURED_EDITION_RECORD_CHANGED','Open the original completed incoming-edition comparison.');
  const {comparisonSha256,...core}=value;
  need(sha(core)===comparisonSha256,'CAPTURED_EDITION_RECORD_CHANGED','The original comparison identity changed.');
  return value;
}
/** The caller holds its original handover job lease. Native-inputs is covered
 * by that writer's existing interrupted whole-file publication recovery. */
export async function prepareCapturedHandoverEditions({directory:productDirectory,root,request,selection}) {
  const profile=await readCapturedApi(productDirectory);
  need(UUID.test(request.id??'')&&UUID.test(selection.draftId??'')&&HASH.test(selection.revision??'')&&
    selection.kind==='RECEIVING'&&selection.form.bundle&&HASH.test(selection.form.manifestSha256??''),
    'CAPTURED_EDITION_SELECTION','Save the original complete receiving collection before comparing editions.');
  const inspected=await inspectCapturedHandover({bundle:selection.form.bundle,
    expectedManifestSha256:selection.form.manifestSha256});
  const overrides=capturedEditionBaselines(request.baselines);
  const members=new Set(inspected.manifest.packages.map(row=>row.name));
  need(Object.keys(overrides).every(name=>members.has(name)),'CAPTURED_EDITION_BASELINES',
    'Choose baselines only for packages in this original incoming collection.');
  const baselines=inspected.manifest.packages.map(member=>({name:member.name,
    baselineName:Object.hasOwn(overrides,member.name)?overrides[member.name]:
      packageName(selection.form.names[member.name]??member.name)}));
  const context={schema:CONTEXT,product:identity(profile),id:request.id,draftId:selection.draftId,
    revision:selection.revision,bundle:inspected.directory,handoverId:inspected.handoverId,
    manifestSha256:inspected.manifestSha256,baselines};
  await directory(join(root,'native-inputs'),true);
  await publishJSON(root,'native-inputs/edition-context.json',context);
  const contextSha256=sha(context),rows=[];
  for(let index=0;index<inspected.manifest.packages.length;index++) {
    const member=inspected.manifest.packages[index],baselineName=baselines[index].baselineName;
    const binding={contextSha256,index,name:member.name,baselineName};
    const currentName=fileName(index,'current'),incomingName=fileName(index,'incoming');
    const originalCurrent=await present(join(root,currentName))
      ?(await retainedRecord(root,currentName)).record.data:await currentSnapshot(profile,baselineName);
    const current=await writeRecord(root,currentName,{...binding,side:'current'},originalCurrent);
    const originalIncoming=await present(join(root,incomingName))
      ?(await retainedRecord(root,incomingName)).record.data:
        await snapshot(await directory(join(inspected.directory,'packages')),member.name);
    const incoming=await writeRecord(root,incomingName,{...binding,side:'incoming'},originalIncoming);
    incomingMatches(incoming.record.data,member);
    const report=compareCapturedMerchantEditions({current:current.record.data,incoming:incoming.record.data});
    const comparison=await writeRecord(root,fileName(index,'comparison'),{...binding,side:'comparison'},report);
    need(same(comparison.record.data,report),'CAPTURED_EDITION_RECORD_CHANGED',
      'The retained comparison differs from its original current and incoming snapshots.');
    rows.push({name:member.name,baselineName,current:current.record.data?.package??null,
      incoming:incoming.record.data.package,summary:report.summary,
      files:{current:current.file,incoming:incoming.file,comparison:comparison.file}});
  }
  const core={schema:CAPTURED_INCOMING_EDITIONS_SCHEMA,id:request.id,directory:root,
    binding:context,contextSha256,packages:rows,sources:inspected.manifest.sources.length,
    totalFiles:rows.length*3+1};
  const result={...core,comparisonSha256:sha(core)};
  // Finish only a comparison of the same installed inputs. A changed baseline
  // keeps these first snapshots intact and calls for a new comparison job.
  await assertCapturedHandoverEditions({directory:productDirectory,root,result});
  return result;
}
async function readEdition(root,result,row,index,side) {
  const retained=await retainedRecord(root,row.files[side].name,row.files[side]);
  need(retained.record.contextSha256===result.contextSha256&&retained.record.index===index&&
    retained.record.name===row.name&&retained.record.baselineName===row.baselineName&&retained.record.side===side,
    'CAPTURED_EDITION_RECORD_CHANGED','The selected record belongs to another original comparison.');
  return {schema:CAPTURED_INCOMING_EDITIONS_SCHEMA,id:result.id,comparisonSha256:result.comparisonSha256,
    name:row.name,side,file:retained.file,data:retained.record.data};
}
export async function readCapturedHandoverEdition({root,result,name,side='comparison'}) {
  result=checkedResult(result);packageName(name);
  need(['current','incoming','comparison'].includes(side),'CAPTURED_EDITION_VIEW',
    'Choose the original current, incoming or comparison document.');
  const index=result.packages.findIndex(row=>row.name===name),row=result.packages[index];
  need(row,'CAPTURED_EDITION_VIEW','Choose a merchant in this completed original comparison.',404);
  return readEdition(root,result,row,index,side);
}
/** Called for a NEW decision. Completed original draft saves resolve their
 * immutable receipt first and do not depend on today's package locations. */
export async function assertCapturedHandoverEditions({directory:productDirectory,root,result}) {
  result=checkedResult(result);
  const profile=await readCapturedApi(productDirectory),binding=result.binding;
  need(same(binding.product,identity(profile))&&result.directory===root&&
    result.contextSha256===sha(binding),'CAPTURED_EDITION_PRODUCT_CHANGED',
    'Reopen this comparison in its original captured product.');
  const retained=await readJSON(root,'native-inputs/edition-context.json');
  need(same(retained,binding),'CAPTURED_EDITION_RECORD_CHANGED','The original comparison context changed.');
  const inspected=await inspectCapturedHandover({bundle:binding.bundle,expectedManifestSha256:binding.manifestSha256});
  need(inspected.handoverId===binding.handoverId&&result.packages.length===inspected.manifest.packages.length,
    'CAPTURED_EDITION_CHANGED','The selected incoming collection changed.');
  for(let index=0;index<result.packages.length;index++) {
    const row=result.packages[index],member=inspected.manifest.packages[index];
    const current=await readEdition(root,result,row,index,'current');
    const incoming=await readEdition(root,result,row,index,'incoming');
    need(member?.name===row.name&&binding.baselines[index]?.name===row.name&&
      binding.baselines[index]?.baselineName===row.baselineName&&same(current.data?.package??null,row.current)&&same(incoming.data?.package,row.incoming),
      'CAPTURED_EDITION_RECORD_CHANGED','The original compared package identity changed.');
    incomingMatches(incoming.data,member);
    if(row.baselineName===null) {
      need(current.data===null,'CAPTURED_EDITION_RECORD_CHANGED','An unselected baseline must remain unselected.');
      continue;
    }
    const exists=await present(join(profile.projectsDirectory,row.baselineName));
    need(exists===Boolean(current.data),'CAPTURED_EDITION_BASELINE_CHANGED',
      'The installed baseline changed: '+row.baselineName+'. Keep this report and start a new comparison.');
    if(exists) {
      const actual=await inspectMerchantPackage({parent:profile.projectsDirectory,name:row.baselineName});
      need(same(actual.package,current.data.package)&&same(actual.files,current.data.files),
        'CAPTURED_EDITION_BASELINE_CHANGED',
        'The installed baseline changed: '+row.baselineName+'. Keep this report and start a new comparison.');
    }
  }
  return result;
}
export function capturedEditionPage(result,value={}) {
  result=checkedResult(result);
  exact(value,['name','view','offset','limit','expectedComparisonSha256']);
  const view=value.view??'summary',offset=Number(value.offset??0),limit=Number(value.limit??25);
  need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,
    'CAPTURED_EDITION_PAGE','Choose a page of 1–100 rows and a nonnegative offset.',400);
  if(value.expectedComparisonSha256!==undefined)
    need(value.expectedComparisonSha256===result.comparisonSha256,'CAPTURED_EDITION_CHANGED',
      'Continue the exact original completed comparison.');
  need(['summary','packages','routes','settings','source','contract','configuration','files'].includes(view),
    'CAPTURED_EDITION_VIEW','Choose a complete original comparison section.',400);
  return {view,offset,limit,...(value.name===undefined?{}:{name:packageName(value.name)})};
}
