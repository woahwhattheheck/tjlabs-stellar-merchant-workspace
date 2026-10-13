// SPDX-License-Identifier: MIT
// One original research→portfolio→full cold receiving course. No source acquisition or screening.
import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {lstat,readFile,rename} from 'node:fs/promises';
import {openGleifWorkspace,receiveGleifWorkspace} from '../workspace.mjs';
import {privateDirectory,readPrivate,createFile,bytes,identity,digest,atomicJson} from '../../postgres/publisher/files.mjs';
import {need,stable,label} from '../core.mjs';

const SCHEMA='stellar-forge.gleif-monitoring-receiving.v1';
const exists=async path=>{try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
async function retained(path,raw){
  if(await exists(path))need((await readPrivate(path,256*1024*1024)).equals(raw),'GLEIF_RECEIVING_CHANGED','The original receiving file differs: '+path);
  else await createFile(path,raw);
}
async function python(command,args){
  return new Promise((resolve_,reject)=>{
    const child=spawn(command,['-B',...args],{stdio:['ignore','pipe','pipe'],windowsHide:true});
    const out=[],err=[];let count=0;
    child.stdout.on('data',data=>{count+=data.length;if(count>64*1024*1024){child.kill();reject(Error('The native receiving response exceeded its complete output limit.'));}else out.push(data);});
    child.stderr.on('data',data=>{if(Buffer.concat(err).length<1024*1024)err.push(data);});
    child.on('error',reject);child.on('close',code=>{
      if(code!==0){reject(Error('Original Monitoring command exited '+code+': '+Buffer.concat(err).toString('utf8')));return;}
      try{resolve_(JSON.parse(Buffer.concat(out).toString('utf8')));}catch(error){reject(Error('The original Monitoring response was not complete JSON: '+error.message));}
    });
  });
}
export async function receiveMonitoring({gleifWorkspace,monitoringWorkspace,selection,pythonCommand,output,reviewer,note=''}) {
  for(const value of [gleifWorkspace,monitoringWorkspace,pythonCommand,output])need(typeof value==='string'&&isAbsolute(value),'GLEIF_RECEIVING_PATH','Use explicit absolute application, workspace, Python and output paths.');
  for(const workspace of [gleifWorkspace,monitoringWorkspace]){
    const below=relative(workspace,output);
    need(below!==''&&(below==='..'||below.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(below)),'GLEIF_RECEIVING_OUTPUT','Keep the receiving output outside either original workspace.');
  }
  reviewer=label(reviewer,'receiving reviewer',160);need(typeof note==='string'&&note.length<=4000,'GLEIF_RECEIVING_NOTE');
  await privateDirectory(output,true);
  const cli=fileURLToPath(new URL('../../ndjson/opensanctions/cli.py',import.meta.url));
  const source=await openGleifWorkspace({directory:gleifWorkspace});
  let intent,result;
  try{
    const basis={schema:SCHEMA,workspaceId:source.metadata.id,selection,monitoringWorkspace,reviewer,note};
    const path=join(output,'receiving-intent.json');
    if(await exists(path)){
      intent=JSON.parse(await readPrivate(path));
      need(stable(intent.basis)===stable(basis),'GLEIF_RECEIVING_SELECTION_CHANGED','Continue the original exact receiving selection or choose a new output directory.');
    }else{
      const preview=await source.monitoringPreview(selection);
      const request={id:'monitoring-'+identity(basis).slice(0,64),action:'monitoring.prepare',
        input:{...selection,expectedPreviewSha256:preview.previewSha256}};
      intent={schema:SCHEMA,basis,request,intakeRequestId:'gleif-'+identity({basis,previewSha256:preview.previewSha256})};
      await retained(path,bytes(intent));
    }
    await source.start(intent.request);const operation=await source.wait(intent.request.id);
    need(operation.state==='COMPLETE','GLEIF_RECEIVING_OPERATION',operation.error?.message??'The original handover operation is incomplete.');
    result=operation.result;
    const names=['gleif-monitoring-portfolio.json','portfolio.ftm.json','mapping.json','gleif-project.json','research-report.json','research-report.html','entities.csv','entities.spreadsheet.csv','original-records.jsonl'];
    need(result.files.length===names.length&&new Set(result.files.map(file=>file.name)).size===names.length&&result.files.every(file=>names.includes(file.name)),'GLEIF_RECEIVING_FILES');
    for(const file of result.files){const raw=await source.object(file.sha256);need(raw.length===file.bytes,'GLEIF_RECEIVING_FILE');await retained(join(output,file.name),raw);}
  }finally{await source.close();}
  const handover=join(output,'gleif-monitoring-portfolio.json');
  const preview=await python(pythonCommand,[cli,'--workspace',monitoringWorkspace,'gleif-preview','--input',handover]);
  const request={requestId:intent.intakeRequestId,original:preview.original,expectedPreviewSha256:preview.previewSha256,reviewer,note};
  const requestPath=join(output,'monitoring-intake-request.json');await retained(requestPath,bytes(request));
  const received=await python(pythonCommand,[cli,'--workspace',monitoringWorkspace,'gleif-receive','--request',requestPath]);
  need(received.receipt?.requestId===request.requestId&&received.receipt.original===preview.original,'GLEIF_RECEIVING_IDENTITY');
  const archive=join(output,'Monitoring_Research_Receiving.zip');
  if(!await exists(archive)){
    const temporary=join(output,'Monitoring_Research_Receiving.pending.zip');
    // Original exporter removes incomplete output on failure. A completed pending archive can be resumed.
    if(!await exists(temporary))await python(pythonCommand,[cli,'--workspace',monitoringWorkspace,'export','--output',temporary]);
    await rename(temporary,archive);
  }
  const restored=join(output,'received-monitoring');
  const create=!await exists(restored);
  await python(pythonCommand,[cli,'--workspace',restored,...(create?['--create']:[]),'import','--input',archive]);
  const reopened=await python(pythonCommand,[cli,'--workspace',restored,'gleif-intake','--request-id',request.requestId]);
  need(reopened.committed&&stable(reopened.receipt)===stable(received.receipt)&&reopened.portfolio.id===received.portfolio.id,'GLEIF_RECEIVING_COLD_IDENTITY','The complete cold workspace did not retain the original portfolio and research custody.');
  const research=join(output,'received-gleif'),pkg=JSON.parse(await readPrivate(join(output,'gleif-project.json'),256*1024*1024));
  if(!await exists(join(research,'workspace.json')))await receiveGleifWorkspace({directory:research,package:pkg});
  const reopenedResearch=await openGleifWorkspace({directory:research});
  let researchStatus;
  try{
    researchStatus=reopenedResearch.status();
    need(researchStatus.workspace.id===pkg.metadata.id,'GLEIF_RECEIVING_RESEARCH_IDENTITY');
    for(const captureId of result.captureIds)need((await reopenedResearch.entities(captureId)).complete,'GLEIF_RECEIVING_RESEARCH_SOURCE');
  }finally{await reopenedResearch.close();}
  const archiveDigest=createHash('sha256');let archiveBytes=0;for await(const part of createReadStream(archive)){archiveBytes+=part.length;archiveDigest.update(part);}
  const receipt={schema:SCHEMA,state:'COMPLETE',originalResearchWorkspace:gleifWorkspace,
    originalMonitoringWorkspace:monitoringWorkspace,receivedMonitoringWorkspace:restored,receivedResearchWorkspace:research,
    handoverOperationId:result.id,handoverId:result.handoverId,portfolioId:received.portfolio.id,
    intakeRequestId:request.requestId,originalProjectSha256:pkg.sha256,sourceCaptures:result.captureIds,
    archive:{path:archive,bytes:archiveBytes,sha256:archiveDigest.digest('hex')},files:result.files,
    nativeReopening:{monitoring:reopened.committed,researchRevision:researchStatus.revision},
    visualAcceptance:'Pending original operator observation of both applications and every outgoing attachment.'};
  await atomicJson(output,'gleif-monitoring-receiving.json',receipt);
  return receipt;
}
export async function main(args=process.argv.slice(2)){
  const opts={};for(let i=0;i<args.length;i++){need(args[i].startsWith('--')&&!Object.hasOwn(opts,args[i])&&args[i+1]&&!args[i+1].startsWith('--'),'GLEIF_RECEIVING_ARGUMENT');opts[args[i]]=args[++i];}
  const selection=JSON.parse(await readPrivate(resolve(opts['--selection'])));
  const result=await receiveMonitoring({gleifWorkspace:resolve(opts['--gleif-workspace']),monitoringWorkspace:resolve(opts['--monitoring-workspace']),
    selection,pythonCommand:resolve(opts['--python']),output:resolve(opts['--output']),reviewer:opts['--reviewer'],note:opts['--note']??''});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{process.stderr.write(JSON.stringify({error:error.code??'GLEIF_MONITORING_RECEIVING',message:error.message})+'\n');process.exitCode=1;});
