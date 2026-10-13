// MIT. Full Curity companion around the original SF74 complete-case receiver.
import {join,dirname,resolve} from 'node:path';
import {open,lstat,link,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {exportCaseSourcePackage,inspectCaseSourcePackage,receiveCaseSourcePackage} from '../case-source-package.mjs';
import {openEdition} from './source.mjs';
import {SHA,ID,UUID,hash,bytes,ensure,fields,same,privateDirectory,read,readJson,optional,retain,member,disjoint,locked,relativeName} from './case-io.mjs';

export const CURITY_PACKAGE_SCHEMA='stellar-forge.curity-case-package.v1';
const MAX_FILE=2*1024*1024*1024,MAX_TOTAL=8*1024*1024*1024;
const filePin=value=>({bytes:value.bytes,sha256:value.sha256});
const safePin=value=>ensure(value&&Number.isSafeInteger(value.bytes)&&value.bytes>=0&&value.bytes<=MAX_FILE&&SHA.test(value.sha256??''),
  'PACKAGE_FILE','A selected package member has an invalid byte identity.');
async function inspectFile(path,pin){
  safePin(pin);const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const before=await fd.stat({bigint:true});
    ensure(before.isFile()&&before.size===BigInt(pin.bytes)&&(before.mode&0o077n)===0n,'PACKAGE_FILE','The original member is not a private complete file.');
    const hashValue=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);let offset=0;
    for(;;){const got=await fd.read(buffer,0,buffer.length,null);if(!got.bytesRead)break;offset+=got.bytesRead;hashValue.update(buffer.subarray(0,got.bytesRead));}
    const after=await fd.stat({bigint:true});
    ensure(offset===pin.bytes&&hashValue.digest('hex')===pin.sha256&&
      ['dev','ino','size','mtimeNs','ctimeNs'].every(k=>before[k]===after[k]),
      'PACKAGE_FILE_CHANGED','The original member bytes changed.',409);
  }finally{await fd.close();}
}
async function copyPinned(source,destination,pin){
  safePin(pin);
  try{await inspectFile(destination,pin);return;}catch(e){if(e.code!=='ENOENT')throw e;}
  await privateDirectory(dirname(destination));
  const from=await open(source,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const partial=destination+'.incoming';let to;
  try{
    const identity=await from.stat({bigint:true});
    ensure(identity.isFile()&&identity.size===BigInt(pin.bytes),'PACKAGE_FILE','The selected original file size changed.',409);
    to=await open(partial,constants.O_RDWR|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
    const prior=await to.stat({bigint:true});
    ensure(prior.isFile()&&prior.nlink===1n&&prior.size<=identity.size&&(prior.mode&0o077n)===0n,
      'PACKAGE_PREFIX','Preserve the conflicting retained member.',409);
    const buffer=Buffer.allocUnsafe(1024*1024),retained=Buffer.allocUnsafe(1024*1024),digest=createHash('sha256');
    let offset=0;
    for(;;){
      const got=await from.read(buffer,0,buffer.length,offset);if(!got.bytesRead)break;
      const chunk=buffer.subarray(0,got.bytesRead);digest.update(chunk);
      const overlap=Math.min(got.bytesRead,Math.max(0,Number(prior.size)-offset));
      if(overlap){
        const existing=await to.read(retained,0,overlap,offset);
        ensure(existing.bytesRead===overlap&&retained.subarray(0,overlap).equals(chunk.subarray(0,overlap)),
          'PACKAGE_PREFIX','The retained original member has a different prefix.',409);
      }
      let written=overlap;
      while(written<got.bytesRead){const result=await to.write(chunk,written,got.bytesRead-written,offset+written);
        ensure(result.bytesWritten>0,'PACKAGE_WRITE','The original member write did not advance.');written+=result.bytesWritten;}
      offset+=got.bytesRead;
    }
    const after=await from.stat({bigint:true}),stage=await to.stat({bigint:true});
    ensure(offset===pin.bytes&&digest.digest('hex')===pin.sha256&&stage.size===identity.size&&
      ['dev','ino','size','mtimeNs','ctimeNs'].every(k=>identity[k]===after[k]),
      'PACKAGE_FILE_CHANGED','The selected original file changed during receiving.',409);
    await to.sync();await to.close();to=null;
    try{await link(partial,destination);}catch(e){if(e.code!=='EEXIST')throw e;await inspectFile(destination,pin);}
    const parent=await open(dirname(destination),constants.O_RDONLY|constants.O_DIRECTORY);
    try{await parent.sync();}finally{await parent.close();}
    await unlink(partial);
  }finally{await to?.close();await from.close();}
}
export function parseCurityPackageManifest(value){
  fields(value,['schema','id','exportId','createdAt','operationId','source','casePackage','caseOperation','application','history','files'],'Curity package');
  ensure(value.schema===CURITY_PACKAGE_SCHEMA&&ID.test(value.exportId??'')&&SHA.test(value.id??'')&&Array.isArray(value.files),
    'PACKAGE','Select a complete Curity case package.');
  const {id,...unsigned}=value;same(id,hash(bytes(unsigned)));
  ensure(value.files.length>0&&value.files.length<=100000&&new Set(value.files.map(x=>x.name)).size===value.files.length,
    'PACKAGE','Package member names must be complete and distinct.');
  let total=0;
  for(const row of value.files){fields(row,['name','bytes','sha256','role']);relativeName(row.name);safePin(row);ensure(['audit','native-case','case-operation','application','history'].includes(row.role)&&row.name.startsWith(row.role+'/'),'PACKAGE_FILE','The member role and original relative path differ.');total+=row.bytes;}
  ensure(total<=MAX_TOTAL,'PACKAGE_LIMIT','The complete selected package exceeds 8 GiB.');
  ensure(SHA.test(value.source?.manifestSha256??'')&&SHA.test(value.casePackage?.manifestSha256??''),
    'PACKAGE','The original edition and case package identities are required.');
  return value;
}
function companionObservation(file,nativeManifest){
  const meanings={'PLAN.json':'PLANNED_CASE_BASELINE','ROLLBACK_PLAN.json':'PLANNED_CASE_BASELINE','ORIGINAL_PLAN.json':'PLANNED_CASE_BASELINE',
    'APPLIED.json':'RECORDED_CASE_OUTCOME','ROLLED_BACK.json':'RECORDED_CASE_OUTCOME','ORIGINAL_APPLIED.json':'RECORDED_CASE_OUTCOME',
    'INCIDENT_BEFORE.json':'ORIGINAL_INCIDENT_OBSERVATION','ACK_REQUEST.json':'ORIGINAL_INCIDENT_OBSERVATION',
    'ACKNOWLEDGED.json':'ORIGINAL_INCIDENT_OBSERVATION','SOURCE_SELECTION.json':'REVIEWED_SOURCE_SELECTION',
    'RECEIVED_HISTORY.json':'PASSIVE_RECEIVED_HISTORY'};
  ensure(Object.hasOwn(meanings,file.name),'CASE_HISTORY','Select an original companion observation.');
  const original=file.value.case,caseRevision=UUID.test(original?.id??'')&&SHA.test(original?.revision??'')?
    {id:original.id,revision:original.revision}:null;
  return {name:file.name,scope:meanings[file.name],case:caseRevision,includedInNativeHistory:caseRevision===null?null:
    caseRevision.id===nativeManifest.case.id&&nativeManifest.caseHistory.revisions.some(row=>row.revision===caseRevision.revision)};
}
async function inspect(directory,expectedManifestSha256,runtime={}){
  const root=await privateDirectory(directory,{create:false}),raw=await read(join(root,'curity-case-package.json'),64*1024*1024);
  ensure(SHA.test(expectedManifestSha256??'')&&hash(raw)===expectedManifestSha256,'PACKAGE_CHANGED','The selected package manifest changed.',409);
  const manifest=parseCurityPackageManifest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));
  for(const row of manifest.files)await inspectFile(await member(root,row.name),row);
  const original=await read(join(root,'audit','manifest.json'));
  ensure(hash(original)===manifest.source.manifestSha256,'SOURCE_CHANGED','The original audit manifest differs.',409);
  const edition=await openEdition(join(root,'audit'),{verify:true});
  ensure(edition.id===manifest.source.editionId,'SOURCE_CHANGED','The original audit edition differs.',409);
  const declaredAudit=edition.files.map(x=>'audit/'+x.path).concat('audit/manifest.json').sort();
  same(manifest.files.filter(x=>x.role==='audit').map(x=>x.name).sort(),declaredAudit);
  const native=await inspectCaseSourcePackage({directory:join(root,'native-case'),expectedManifestSha256:manifest.casePackage.manifestSha256,...runtime});
  const nativeManifest=await readJson(join(root,'native-case','case-source-package.json'),64*1024*1024);
  same(manifest.files.filter(x=>x.role==='native-case').map(x=>x.name).sort(),
    nativeManifest.files.map(x=>'native-case/'+x.name).concat('native-case/case-source-package.json').sort());
  same(manifest.files.filter(x=>x.role==='application').map(({name,bytes,sha256})=>({name:name.slice('application/'.length),bytes,sha256})),
    manifest.application.slice().sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0));
  const selected=await read(join(root,'case-operation','SOURCE_SELECTION.json'));
  ensure(hash(selected)===manifest.caseOperation.sourceSha256,'SOURCE_CHANGED','The packaged evidence selection changed.',409);
  const plan=await readJson(join(root,'case-operation','PLAN.json'));
  const applied=await readJson(join(root,'case-operation','APPLIED.json'));
  same(applied,manifest.caseOperation.applied);same(nativeManifest.case,manifest.casePackage.case);same(JSON.parse(selected),plan.source);
  ensure(applied.case.id===nativeManifest.case.id&&nativeManifest.caseHistory.selectedChain.includes(applied.case.revision),
    'CASE_HISTORY','The exported staff baseline must contain the original accepted operation.');
  ensure(plan.id===manifest.operationId&&applied.id===plan.id&&plan.sourceSha256===hash(selected)&&
    plan.source.editionId===edition.id&&plan.source.manifestSha256===manifest.source.manifestSha256,
    'PACKAGE','The case operation and complete audit edition do not agree.');
  ensure(manifest.history&&Array.isArray(manifest.history.operations)&&Array.isArray(manifest.history.editions),
    'CASE_HISTORY','Retain the complete provider history for this native case.');
  ensure(typeof manifest.history.capturedAt==='string'&&Number.isFinite(Date.parse(manifest.history.capturedAt)),
    'CASE_HISTORY','Retain the original companion capture time.');
  same(manifest.history.nativeBoundary,{case:nativeManifest.case,headRevision:nativeManifest.caseHistory.headRevision});
  const declaredHistory=[],historical=new Map();
  for(const item of manifest.history.editions){
    ensure(SHA.test(item.manifestSha256??'')&&item.prefix==='history/editions/'+item.manifestSha256&&!historical.has(item.editionId),
      'CASE_HISTORY','The historical source identity or member root differs.');
    const folder=await member(root,item.prefix),originalManifest=await read(join(folder,'manifest.json'));
    ensure(hash(originalManifest)===item.manifestSha256,'CASE_HISTORY','A historical manifest changed.',409);
    const opened=await openEdition(folder,{verify:true});ensure(opened.id===item.editionId,'CASE_HISTORY','A historical edition changed.',409);
    same(item.files,[...opened.files.map(row=>item.prefix+'/'+row.path),item.prefix+'/manifest.json']);
    declaredHistory.push(...item.files);historical.set(item.editionId,item.manifestSha256);
  }
  const seenOperations=new Set(),historicalPlans=[];
  for(const item of manifest.history.operations){
    const identity=item.caseId+'/'+item.id,prefix='history/operations/'+identity;
    ensure(UUID.test(item.caseId??'')&&ID.test(item.id??'')&&!seenOperations.has(identity),'CASE_HISTORY','Historical case operations must be distinct.');seenOperations.add(identity);
    ensure(Array.isArray(item.files)&&item.files.every(name=>name.startsWith(prefix+'/')),'CASE_HISTORY','A historical operation leaves its source root.');
    for(const name of ['PLAN.json','SOURCE_SELECTION.json'])ensure(item.files.includes(prefix+'/'+name),'CASE_HISTORY','The full historical operation is missing.');
    const historicalPlan=await readJson(join(root,prefix,'PLAN.json'));
    const selection=await read(join(root,prefix,'SOURCE_SELECTION.json'));
    ensure(historicalPlan.id===item.id&&historicalPlan.case.id===item.caseId&&hash(selection)===historicalPlan.sourceSha256&&
      historical.get(historicalPlan.source.editionId)===historicalPlan.source.manifestSha256,'CASE_HISTORY','The historical operation and original source differ.',409);
    same(JSON.parse(selection),historicalPlan.source);
    const observations=[];for(const name of item.files)observations.push(companionObservation({name:name.split('/').at(-1),value:await readJson(await member(root,name))},nativeManifest));
    same(item.observations,observations);historicalPlans.push(historicalPlan);declaredHistory.push(...item.files);
  }
  ensure(seenOperations.has(plan.case.id+'/'+manifest.operationId),'CASE_HISTORY','The selected active operation is absent from full history.');
  const lineage=new Set([plan.case.id]);
  for(let pass=0;pass<historicalPlans.length;pass++){
    let added=false;
    for(const item of historicalPlans)if(lineage.has(item.case.id)&&item.received&&!lineage.has(item.received.sourceCase.id)){
      ensure(UUID.test(item.received.sourceCase.id),'CASE_HISTORY','The imported historical case identity differs.');
      lineage.add(item.received.sourceCase.id);added=true;
    }
    if(!added)break;
  }
  ensure(historicalPlans.every(item=>lineage.has(item.case.id)),'CASE_HISTORY','A historical operation belongs to another case lineage.');
  same(manifest.files.filter(row=>row.role==='history').map(row=>row.name).sort(),declaredHistory.sort());
  return {root,manifest,manifestSha256:expectedManifestSha256,native,edition};
}
export async function openCurityPortable({store,casesDirectory,sourceDelivery,bridge,source,directory,applicationFiles,
  python=process.env.SCF_PYTHON||'python3',environment=process.env}={}){
  ensure(store&&bridge&&source&&sourceDelivery,'PACKAGE','Open the original cases, source delivery and Curity bridge.');
  ensure(Array.isArray(applicationFiles)&&applicationFiles.length>0,'APPLICATION_SOURCE','Select the complete published application source closure.');
  const root=await privateDirectory(directory);disjoint(root,casesDirectory);disjoint(root,source.directory);disjoint(root,bridge.directory);
  ensure(new Set(applicationFiles.map(row=>row.name)).size===applicationFiles.length,'APPLICATION_SOURCE','The complete application inventory contains duplicate names.');
  for(const row of applicationFiles){relativeName(row.name);safePin(row);ensure(typeof row.path==='string'&&resolve(row.path)===row.path,'APPLICATION_SOURCE','Use exact local application source files.');}
  async function exportPackage({operationId,exportId}){
    ensure(ID.test(operationId??'')&&ID.test(exportId??''),'PACKAGE','Select the original import and a package ID.');
    const output=join(root,'exports',exportId);
    return locked(output,async()=>{
      const finished=await optional(join(output,'curity-case-package.json'),64*1024*1024);
      if(finished){
        ensure(finished.operationId===operationId&&finished.exportId===exportId,'PACKAGE_CHANGED','This package ID belongs to another import.',409);
        return summary(await inspect(output,hash(await read(join(output,'curity-case-package.json'),64*1024*1024)),{python,environment}));
      }
      const plan=await bridge.read(operationId),applied=await bridge.result(operationId);
      ensure(applied,'NOT_APPLIED','Complete or reconcile the original evidence attachment before packaging.',409);
      return bridge.withCaseHistory(plan.case.id,async caseHistory=>{
      const edition=await source.locate(plan.source.editionId);
      ensure(edition.manifestSha256===plan.source.manifestSha256,'SOURCE_CHANGED','The selected immutable audit source changed.',409);
      const intentPath=join(output,'EXPORT_INTENT.json'),oldIntent=await optional(intentPath);
      const selectedCase=oldIntent?.case??await (async()=>{const current=await store.read(plan.case.id);
        return {id:current.id,revision:current.revision,workspaceSha256:hash(current.workspaceText),
          supportSha256:current.supportText===null?null:hash(current.supportText)};})();
      const selected={operationId,exportId,case:selectedCase,
        source:{editionId:edition.manifest.id,manifestSha256:edition.manifestSha256},
        application:applicationFiles.map(({name,bytes,sha256})=>({name,bytes,sha256}))};
      let intent=oldIntent;
      if(intent){const {createdAt,...original}=intent;same(original,selected);}
      else{intent={...selected,createdAt:new Date().toISOString()};await retain(intentPath,intent);}
      // Freeze the native case history under the same provider lock before
      // freezing its companion closure. A later retry uses the native package's
      // already-retained head, not a newly sampled head without its sources.
      await exportCaseSourcePackage({store,casesDirectory,id:intent.case.id,revision:intent.case.revision,
        directory:join(output,'native-case'),exportId,sourceDelivery,generatedAt:intent.createdAt,python,environment});
      const nativeBody=await read(join(output,'native-case','case-source-package.json'),64*1024*1024);
      const nativeManifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(nativeBody)),inventory=[];
      const requestPath=join(output,'EXPORT_REQUEST.json');let request=await optional(requestPath);
      if(request){const {companion,history,historyEditions,companionCapturedAt,...original}=request;same(original,intent);}
      else{
        const revisions=new Set(nativeManifest.caseHistory.revisions.map(row=>row.revision));
        const history=caseHistory.operations.filter(row=>row.applied?revisions.has(row.applied.case.revision):revisions.has(row.plan.case.revision));
        const selectedOperation=history.find(row=>row.id===operationId);
        ensure(selectedOperation,'CASE_HISTORY','The selected operation is absent from its native case history.',409);
        const combined=new Map(),editionPins=new Map();
        const addOperation=row=>{const identity=row.caseId+'/'+row.id,prior=combined.get(identity);
          if(prior)same(prior,row);else combined.set(identity,row);};
        for(const row of history){
          addOperation({caseId:row.plan.case.id,id:row.id,files:row.files});
          if(row.plan.received){
            const received=row.files.find(file=>file.name==='RECEIVED_HISTORY.json')?.value;
            ensure(received&&hash(bytes(received))===row.plan.received.historySha256&&received.packageId===row.plan.received.packageId,
              'CASE_HISTORY','The received original companion history is absent or changed.',409);
            for(const original of received.operations)addOperation(original);
            for(const original of received.editions){const prior=editionPins.get(original.editionId);
              if(prior)same(prior,original);else editionPins.set(original.editionId,original);}
          }
        }
        const historyEditions=[...editionPins.values()];
        for(const row of history){
          const found=await source.locate(row.plan.source.editionId);
          ensure(found.manifestSha256===row.plan.source.manifestSha256,'SOURCE_CHANGED','A historical case source edition changed.',409);
          if(!historyEditions.some(x=>x.manifestSha256===found.manifestSha256))
            historyEditions.push({editionId:found.manifest.id,manifestSha256:found.manifestSha256});
        }
        request={...intent,companion:selectedOperation.files,
          history:[...combined.values()],historyEditions,companionCapturedAt:new Date().toISOString()};
        await retain(requestPath,request);
      }
      for(const row of nativeManifest.files)inventory.push({name:'native-case/'+row.name,...filePin(row),role:'native-case'});
      inventory.push({name:'native-case/case-source-package.json',bytes:nativeBody.length,sha256:hash(nativeBody),role:'native-case'});
      const auditMembers=edition.manifest.files.map(row=>({name:row.path,...filePin(row)}));
      const auditManifest=await read(join(edition.directory,'manifest.json'));
      auditMembers.push({name:'manifest.json',bytes:auditManifest.length,sha256:hash(auditManifest)});
      for(const row of auditMembers){
        await copyPinned(await member(edition.directory,row.name),await member(output,'audit/'+row.name,{parents:true}),row);
        inventory.push({name:'audit/'+row.name,...filePin(row),role:'audit'});
      }
      for(const row of request.companion){
        const content=bytes(row.value),name='case-operation/'+row.name;
        await retain(await member(output,name,{parents:true}),content);
        inventory.push({name,bytes:content.length,sha256:hash(content),role:'case-operation'});
      }
      for(const row of applicationFiles){
        await copyPinned(row.path,await member(output,'application/'+row.name,{parents:true}),row);
        inventory.push({name:'application/'+row.name,...filePin(row),role:'application'});
      }
      const history={operations:[],editions:[],capturedAt:request.companionCapturedAt,
        nativeBoundary:{case:nativeManifest.case,headRevision:nativeManifest.caseHistory.headRevision},
        interpretation:'Provider companion observations at capture time; each native revision and incident observation retains its separate scope.'};
      for(const operation of request.history){
        const rows=[];
        for(const file of operation.files){
          const content=bytes(file.value),name='history/operations/'+operation.caseId+'/'+operation.id+'/'+file.name;
          await retain(await member(output,name,{parents:true}),content);
          inventory.push({name,bytes:content.length,sha256:hash(content),role:'history'});rows.push(name);
        }
        history.operations.push({caseId:operation.caseId,id:operation.id,files:rows,
          observations:operation.files.map(file=>companionObservation(file,nativeManifest))});
      }
      for(const selectedEdition of request.historyEditions){
        const found=await source.locate(selectedEdition.editionId);
        ensure(found.manifestSha256===selectedEdition.manifestSha256,'SOURCE_CHANGED','A frozen historical edition changed.',409);
        const prefix='history/editions/'+selectedEdition.manifestSha256;
        const raw=await read(join(found.directory,'manifest.json'));
        const members=[...found.manifest.files,{path:'manifest.json',bytes:raw.length,sha256:hash(raw)}];
        for(const row of members){
          const name=prefix+'/'+row.path;
          await copyPinned(await member(found.directory,row.path),await member(output,name,{parents:true}),row);
          inventory.push({name,...filePin(row),role:'history'});
        }
        history.editions.push({...selectedEdition,prefix,files:members.map(row=>prefix+'/'+row.path)});
      }
      inventory.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
      const unsigned={schema:CURITY_PACKAGE_SCHEMA,exportId,createdAt:request.createdAt,operationId,
        source:request.source,casePackage:{manifestSha256:hash(nativeBody),case:request.case},
        caseOperation:{sourceSha256:plan.sourceSha256,applied},application:request.application,history,files:inventory};
      const manifest={id:hash(bytes(unsigned)),...unsigned};parseCurityPackageManifest(manifest);
      const content=bytes(manifest);await retain(join(output,'curity-case-package.json'),content);
      return summary(await inspect(output,hash(content),{python,environment}));
      });
    });
  }
  function summary(context){return {schema:CURITY_PACKAGE_SCHEMA,directory:context.root,id:context.manifest.id,exportId:context.manifest.exportId,
    manifestSha256:context.manifestSha256,source:context.manifest.source,casePackage:context.manifest.casePackage,
    files:context.manifest.files.length,bytes:context.manifest.files.reduce((sum,x)=>sum+x.bytes,0)};}
  async function receive({packageDirectory,expectedManifestSha256,requestId,actor,receivingDirectory,receivingCasesDirectory=casesDirectory,
    receivingSourceDelivery=sourceDelivery,receivingEditionDirectory=source.directory,receivingBridge=bridge}){
    ensure(ID.test(requestId??''),'RECEIVE','Select the original receiving request.');
    const destination=await privateDirectory(receivingDirectory);
    for(const path of [packageDirectory,receivingCasesDirectory,receivingEditionDirectory,receivingSourceDelivery.directory])disjoint(destination,path);
    return locked(destination,async()=>{
      const retainedRoot=join(destination,'package'),completed=await optional(join(destination,'RECEIVED.json'));
      const have=await optional(join(retainedRoot,'curity-case-package.json'),64*1024*1024);
      const context=await inspect(have?retainedRoot:packageDirectory,expectedManifestSha256,{python,environment});
      const selection={requestId,actor,manifestSha256:expectedManifestSha256,packageId:context.manifest.id,
        casesDirectory:resolve(receivingCasesDirectory),sourceDirectory:resolve(receivingSourceDelivery.directory),
        editionDirectory:resolve(receivingEditionDirectory),bridgeDirectory:resolve(receivingBridge.directory)};
      const previous=await optional(join(destination,'RECEIVE_REQUEST.json'));
      if(previous)same(previous,selection);else await retain(join(destination,'RECEIVE_REQUEST.json'),selection);
      if(completed)same(completed.selection,selection);
      if(!have){
        await privateDirectory(retainedRoot);
        for(const row of context.manifest.files)await copyPinned(await member(context.root,row.name),
          await member(retainedRoot,row.name,{parents:true}),row);
        await retain(join(retainedRoot,'curity-case-package.json'),await read(join(context.root,'curity-case-package.json'),64*1024*1024));
      }
      // The existing receiver preserves its original local case ID and all later
      // staff changes when this same complete package is received again.
      const native=await receiveCaseSourcePackage({directory:join(retainedRoot,'native-case'),
        receivingDirectory:join(destination,'native-receiving'),casesDirectory:receivingCasesDirectory,
        sourceDelivery:receivingSourceDelivery,requestId,actor,
        expectedManifestSha256:context.manifest.casePackage.manifestSha256,python,environment});
      const editions=await privateDirectory(receivingEditionDirectory),editionPath=join(editions,'received-'+context.manifest.source.manifestSha256.slice(0,32));
      await privateDirectory(editionPath);
      for(const row of context.manifest.files.filter(x=>x.role==='audit')){
        await copyPinned(await member(retainedRoot,row.name),await member(editionPath,row.name.slice('audit/'.length),{parents:true}),row);
      }
      const reopened=await openEdition(editionPath,{verify:true});
      ensure(reopened.id===context.manifest.source.editionId,'SOURCE_CHANGED','The received audit edition changed.',409);
      for(const item of context.manifest.history.editions){
        const historicalPath=await privateDirectory(join(editions,'received-'+item.manifestSha256.slice(0,32)));
        for(const name of item.files){
          const pin=context.manifest.files.find(row=>row.name===name),relative=name.slice(item.prefix.length+1);
          await copyPinned(await member(retainedRoot,name),await member(historicalPath,relative,{parents:true}),pin);
        }
        const opened=await openEdition(historicalPath,{verify:true});
        ensure(opened.id===item.editionId,'CASE_HISTORY','The received historical source differs.',409);
      }
      const sourcePlan=await readJson(join(retainedRoot,'case-operation','PLAN.json'));
      const sourceApplied=await readJson(join(retainedRoot,'case-operation','APPLIED.json'));
      const sourceMetadata=(await readJson(join(retainedRoot,'native-case','case.json'))).metadata;
      const sourceHistory={packageId:context.manifest.id,manifestSha256:expectedManifestSha256,
        capture:{capturedAt:context.manifest.history.capturedAt,nativeBoundary:context.manifest.history.nativeBoundary,interpretation:context.manifest.history.interpretation},
        operations:[],editions:context.manifest.history.editions.map(({editionId,manifestSha256})=>({editionId,manifestSha256}))};
      for(const item of context.manifest.history.operations){
        const files=[];
        for(const name of item.files)files.push({name:name.split('/').at(-1),value:await readJson(await member(retainedRoot,name))});
        sourceHistory.operations.push({caseId:item.caseId,id:item.id,files});
      }
      const caseBinding=await receivingBridge.receiveBinding({sourcePlan,sourceApplied,
        sourceCase:context.manifest.casePackage.case,sourceMetadata,sourceHistory,nativeReceipt:native,packageId:context.manifest.id});
      const actual={schema:'stellar-forge.curity-case-receiving.v1',caseBinding,selection,sourceCase:context.manifest.casePackage.case,
        history:context.manifest.history,native,edition:{id:reopened.id,directory:editionPath,manifestSha256:context.manifest.source.manifestSha256},
        retainedPackage:{directory:retainedRoot,manifestSha256:expectedManifestSha256},
        firstReceivedAt:completed?.firstReceivedAt??new Date().toISOString()};
      if(!completed)await retain(join(destination,'RECEIVED.json'),actual);
      return {receipt:completed??actual,currentNative:native,caseBinding,sourceEdition:actual.edition,reused:Boolean(completed)};
    });
  }
  return Object.freeze({directory:root,exportPackage,receive,inspect:async input=>summary(await inspect(input.directory,input.expectedManifestSha256,{python,environment})),
    manifest:async input=>(await inspect(input.directory,input.expectedManifestSha256,{python,environment})).manifest});
}
