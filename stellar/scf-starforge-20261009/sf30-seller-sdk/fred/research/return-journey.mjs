// MIT. Receive actual Economic Research customer returns through the maintained application.
import { resolve,join,dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { privateDirectory,atomicJson,readPrivateJson,withPrivateLock } from '../../routescan/quota.mjs';
import { readBytes,writeBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { exportFredProject,receiveFredProject,readFredProject } from '../project.mjs';
import { canonical,clone,need,sha,catalogue } from './model.mjs';
import { RESEARCH_PACKAGE } from './commerce-model.mjs';
import { decodeResearchEditionDelivery } from './delivery.mjs';
import { readRetainedResearchReturn,researchReturnCompare,researchReturnWork } from './returns.mjs';
import { validateResearchReturnExtension } from './return-bundle.mjs';
import { retainIssuedGraph,researchHash,researchExchange } from './return-model.mjs';
export const RESEARCH_RETURN_COURSE='stellar-forge.research-return-course.v1';
const MAX=480*1024*1024,MANIFEST='return-course.json';
const bytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n'),same=(a,b)=>canonical(a)===canonical(b);
async function optional(path,limit=2*1024*1024){try{return await readPrivateJson(path,limit);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function immutableFile(path,data){
  const root=await privateDirectory(dirname(path)),name=path.slice(path.lastIndexOf('/')+1);
  try{await writeBytes(path,data,{exclusive:true});}catch(e){if(e.code!=='EEXIST')throw e;
    need((await readBytes(join(root,name),Math.max(1,data.length))).equals(data),'The original course file changed.');}
}
async function retainedBundle(directory,path,original){
  let raw;try{raw=await readBytes(path,MAX);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!raw){
    const current=await readFredProject(directory);
    need(current.id===original.projectId&&current.revision===original.revision&&!current.pending,
      'Continue the retained source edition before preparing this exact course snapshot.');
    const bundle=await exportFredProject({directory});
    need(bundle.state.id===original.projectId&&bundle.state.revision===original.revision,
      'The selected source project changed while its whole archive was being prepared.');
    raw=bytes(bundle);await immutableFile(path,raw);
  }
  const bundle=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  need(bundle.state?.id===original.projectId&&bundle.state.revision===original.revision,'The original full project selection changed.');
  return {bundle,raw,sha256:sha(raw),bytes:raw.length};
}
function independentPaths(output,producer,customer){
  need(producer!==customer,'Choose independent original producer and customer projects.');
  for(const source of [producer,customer])need(output!==source&&!output.startsWith(source+'/')&&!source.startsWith(output+'/'),
    'Use an independent private course output directory.');
}
export async function prepareResearchReturnCourse({directory,producerDirectory,customerDirectory,productId,packageSha256}={}){
  directory=await privateDirectory(resolve(directory));producerDirectory=resolve(producerDirectory);customerDirectory=resolve(customerDirectory);
  independentPaths(directory,producerDirectory,customerDirectory);researchHash(packageSha256);
  const selection={producerDirectory,customerDirectory,productId,packageSha256};
  return withPrivateLock(directory,'return-course.lock',async()=>{
    let manifest=await optional(join(directory,MANIFEST));
    if(manifest)need(manifest.schema===RESEARCH_RETURN_COURSE&&same(manifest.selection,selection),
      'Continue this original return course with its retained source selection.');
    else {
      const producer=await readFredProject(producerDirectory),customer=await readFredProject(customerDirectory);
      need(!producer.pending&&!customer.pending,'Finish the actual source project requests before receiving their complete copies.');
      const record=customer.researchCommerce?.receivings.find(r=>r.id===packageSha256&&r.productId===productId);
      need(record&&record.sourceProjectId===producer.id,'Select an actual customer receiving from this original producer.');
      const raw=await readBytes(join(customerDirectory,'research','receivings',packageSha256,RESEARCH_PACKAGE),256*1024*1024);
      need(sha(raw)===packageSha256,'The original received package changed.');
      const {delivery}=decodeResearchEditionDelivery(raw);
      need(delivery.sourceProjectId===producer.id&&delivery.productId===productId&&delivery.editionId===record.editionId,
        'The actual customer package differs from the chosen source project.');
      retainIssuedGraph(catalogue(producer),delivery.research,productId);retainIssuedGraph(catalogue(customer),delivery.research,productId);
      manifest={schema:RESEARCH_RETURN_COURSE,operation:'ESI-RESEARCH-RETURN-'+sha(bytes(selection)).slice(0,24),selection,
        original:{producer:{projectId:producer.id,revision:producer.revision},customer:{projectId:customer.id,revision:customer.revision}},
        productId,packageSha256,originalEditionId:record.editionId,
        originalDefinitionId:delivery.research.products[0].editions[0].definitionId,
        producerDirectory:join(directory,'producer'),customerDirectory:join(directory,'customer'),
        phase:'PREPARING',createdAt:new Date().toISOString(),
        scenario:{label:'Internal operating course',customerTitleSuffix:' · customer review',
          producerNoteAppend:'Additional producer note retained during the internal return review.'}};
      await atomicJson(directory,MANIFEST,manifest,{exclusive:true});
    }
    if(['PREPARED','RECEIVED','COMPLETE'].includes(manifest.phase))return manifest;
    const p=await retainedBundle(producerDirectory,join(directory,'producer-original.json'),manifest.original.producer),
      c=await retainedBundle(customerDirectory,join(directory,'customer-original.json'),manifest.original.customer);
    await receiveFredProject({directory:manifest.producerDirectory,bundle:p.bundle});
    await receiveFredProject({directory:manifest.customerDirectory,bundle:c.bundle});
    manifest.original.producer.archive={filename:'producer-original.json',bytes:p.bytes,sha256:p.sha256,bundleSha256:p.bundle.bundleSha256};
    manifest.original.customer.archive={filename:'customer-original.json',bytes:c.bytes,sha256:c.sha256,bundleSha256:c.bundle.bundleSha256};
    manifest.phase='PREPARED';manifest.preparedAt=new Date().toISOString();await atomicJson(directory,MANIFEST,manifest);return manifest;
  });
}
async function completeBundle(directory,path){
  let raw;try{raw=await readBytes(path,MAX);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(raw){const bundle=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));validateResearchReturnExtension(bundle.researchReturns,bundle.state);
    need(same(bundle.state,await readFredProject(directory)),'The copied project changed after this retained archive; preserve its following edition before finishing the original course.');return {bundle,raw};}
  const bundle=await exportFredProject({directory});need(bundle.schema==='stellar-forge.fred-project-bundle.v9','Keep the full original return/source history in v9.');
  raw=bytes(bundle);await immutableFile(path,raw);return {bundle,raw};
}
export async function finishResearchReturnCourse({directory}={}){
  directory=await privateDirectory(resolve(directory));
  return withPrivateLock(directory,'return-course.lock',async()=>{
    const m=await readPrivateJson(join(directory,MANIFEST),2*1024*1024);
    need(m.schema===RESEARCH_RETURN_COURSE&&['PREPARED','RECEIVED','COMPLETE'].includes(m.phase),'Prepare the original source course first.');
    if(['RECEIVED','COMPLETE'].includes(m.phase))return m;
    const browser=await readPrivateJson(join(directory,'return-browser.json'),768*1024*1024);
    need(browser.operation===m.operation&&browser.phase==='OPERATED','Complete the actual original browser operation first.');
    const producer=await readFredProject(m.producerDirectory),customer=await readFredProject(m.customerDirectory);
    need(producer.id===m.original.producer.projectId&&customer.id===m.original.customer.projectId&&
      !producer.pending&&!customer.pending,'Retain both complete original copied project identities and completed requests.');
    const checked=await readRetainedResearchReturn(m.producerDirectory,browser.returnId,producer);
    need(checked.packet.productId===m.productId&&checked.packet.originalPackage.sha256===m.packageSha256&&
      checked.packet.customer.projectId===customer.id,'The browser returned another original selection.');
    const customerReturn=researchExchange(customer).sent.find(r=>r.id===browser.returnId);
    need(customerReturn&&customerReturn.bodyId===checked.packet.id,'The producer file lost its exact customer return.');
    const adoption=researchExchange(producer).adoptions.filter(a=>a.returnId===browser.returnId).at(-1);
    need(adoption&&adoption.definitionId===browser.appliedDefinitionId,'The browser choices were not retained by the original producer journal.');
    const saved=await researchReturnWork(m.producerDirectory,{returnId:browser.returnId,revision:adoption.draftRevision});
    need(saved.work.choices['product/notes']==='current'&&saved.work.choices['product/title']==='returned',
      'The actual course must preserve later producer notes and adopt the customer title explicitly.');
    const product=catalogue(producer).products.find(p=>p.id===m.productId),version=product.versions.find(v=>v.id===adoption.definitionId);
    const returned=checked.packet.research.products[0].versions.find(v=>v.id===checked.packet.selectedDefinitionId).definition;
    const old=saved.work.context.research.products[0],current=old.versions.find(v=>v.id===old.currentId).definition;
    need(version?.definition.title===returned.title&&version.definition.notes===current.notes&&
      product.editions.some(e=>e.id===browser.issuedEditionId&&e.definitionId===version.id),
      'The following actual issued edition differs from the saved explicit choices.');
    const originalP=JSON.parse((await readBytes(join(directory,'producer-original.json'),MAX)).toString('utf8')).state;
    const originalC=JSON.parse((await readBytes(join(directory,'customer-original.json'),MAX)).toString('utf8')).state;
    retainIssuedGraph(catalogue(producer),catalogue(originalP),m.productId);
    retainIssuedGraph(catalogue(customer),catalogue(originalC),m.productId);
    const p=await completeBundle(m.producerDirectory,join(directory,'producer-project.json')),
      c=await completeBundle(m.customerDirectory,join(directory,'customer-project.json'));
    const producerReceivedDirectory=join(directory,'producer-received'),customerReceivedDirectory=join(directory,'customer-received');
    const pr=await receiveFredProject({directory:producerReceivedDirectory,bundle:p.bundle}),
      cr=await receiveFredProject({directory:customerReceivedDirectory,bundle:c.bundle});
    const reopened=await readRetainedResearchReturn(producerReceivedDirectory,browser.returnId);
    need(reopened.bytes.equals(checked.bytes),'The independently received customer file changed.');
    const rw=await researchReturnWork(producerReceivedDirectory,{returnId:browser.returnId,revision:adoption.draftRevision});
    need(same(rw.work,saved.work),'The complete original saved comparison changed during receiving.');
    m.phase='RECEIVED';m.receivedAt=new Date().toISOString();
    Object.assign(m,{returnId:browser.returnId,producerReceivedDirectory,customerReceivedDirectory,
      producerBundleSha256:p.bundle.bundleSha256,customerBundleSha256:c.bundle.bundleSha256,
      received:{producer:pr,customer:cr},files:[
        {filename:'producer-project.json',bytes:p.raw.length,sha256:sha(p.raw)},
        {filename:'customer-project.json',bytes:c.raw.length,sha256:sha(c.raw)}]});
    await atomicJson(directory,MANIFEST,m);return m;
  });
}
export async function sealResearchReturnCourse({directory}={}){
  directory=await privateDirectory(resolve(directory));
  return withPrivateLock(directory,'return-course.lock',async()=>{
    const m=await readPrivateJson(join(directory,MANIFEST),2*1024*1024);
    need(m.schema===RESEARCH_RETURN_COURSE&&['RECEIVED','COMPLETE'].includes(m.phase),'Receive the whole original v9 projects first.');
    if(m.phase==='COMPLETE')return m;
    const browser=await readPrivateJson(join(directory,'return-browser-received.json'),768*1024*1024);
    need(browser.operation===m.operation&&browser.phase==='RECEIVED'&&browser.returnId===m.returnId,
      'Open and use the independently received project and complete saved review in the actual browser.');
    const producer=await readFredProject(m.producerReceivedDirectory),customer=await readFredProject(m.customerReceivedDirectory);
    need(producer.id===m.original.producer.projectId&&customer.id===m.original.customer.projectId,
      'The independently received project identities changed.');
    await researchReturnCompare(m.producerReceivedDirectory,m.returnId);
    m.phase='COMPLETE';m.completedAt=new Date().toISOString();m.browserReports=['return-browser.json','return-browser-received.json'];
    await atomicJson(directory,MANIFEST,m);return m;
  });
}
export async function runResearchReturnCourse(input){
  need(input&&['prepare','finish','seal'].includes(input.phase),'Choose prepare, finish or seal for the original course.');
  return input.phase==='prepare'?prepareResearchReturnCourse(input):input.phase==='finish'?finishResearchReturnCourse(input):sealResearchReturnCourse(input);
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const input=await readPrivateJson(resolve(process.argv[2]),2*1024*1024);
  process.stdout.write(JSON.stringify(await runResearchReturnCourse(input),null,2)+'\n');
}
