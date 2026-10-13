#!/usr/bin/env node
// MIT. Continue one complete original weather report through two receiving workspaces.
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {initializeWeatherReview,WeatherWorkspace,readWeatherSettings,safeCode} from '../workspace.mjs';
import {weatherHandoverFromZip} from '../legacy.mjs';
import {inspectWeatherHandover,MAX_LEGACY_ARCHIVE_BYTES} from '../portable.mjs';
import {startWeatherServer} from '../server.mjs';
import {absolute,privateDirectory,readPrivate,publish,publishJson} from '../files.mjs';
import {need,encoded,sha,canonical} from '../contract.mjs';

/** Uses the exact retained ZIP and the normal authenticated HTTP and native
 * workspace operations. The output directory is new and privately owned. */
export async function continueOriginalWeatherReport({
 archive,output,expectedArchiveSha256,
 note='Independent receiving review completed from the retained source package.'
}){
 absolute(archive);absolute(output);await privateDirectory(resolve(output,'..'));
 need(typeof note==='string'&&note.trim()&&note.length<=1000,'RECEIVING_NOTE_REQUIRED');
 const archiveBytes=await readPrivate(archive,MAX_LEGACY_ARCHIVE_BYTES);
 const original=await weatherHandoverFromZip(archiveBytes,{expectedArchiveSha256});
 const originalBytes=encoded(original),originalText=originalBytes.toString('utf8');
 await mkdir(output,{mode:0o700});await privateDirectory(output);
 await publish(join(output,'original-report.zip'),archiveBytes);
 await publish(join(output,'original-report.weather.json'),originalBytes);
 const firstRoot=join(output,'first-review'),secondRoot=join(output,'second-review');
 let first,second,server,coldFirst,coldSecond;
 try{
  await initializeWeatherReview({stateRoot:firstRoot});
  first=await WeatherWorkspace.open(await readWeatherSettings(join(firstRoot,'settings.json')));
  server=await startWeatherServer({workspace:first});
  const launch=await fetch(server.url,{redirect:'manual'});
  need(launch.status===303,'RECEIVING_LOCAL_LAUNCH_FAILED');
  const cookie=launch.headers.get('set-cookie')?.split(';')[0];
  need(cookie,'RECEIVING_LOCAL_SESSION_REQUIRED');
  async function request(path,body){
   const response=await fetch(server.origin+path,{
    method:body===undefined?'GET':'POST',
    headers:{cookie,...(body===undefined?{}:{origin:server.origin,'content-type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
   });
   const bytes=Buffer.from(await response.arrayBuffer());
   let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{}
   need(response.ok,value?.error??'RECEIVING_HTTP_FAILED');return {value,bytes,response};
  }
  const meta=(await request('/api/meta')).value;
  need(meta.reviewMode===true,'RECEIVING_REVIEW_MODE_CHANGED');
  const review=(await request('/api/handover/review',{content:originalText})).value;
  const received=(await request('/api/handover/receive',{content:originalText,expectedSha256:review.packageSha256})).value;
  need(!received.reopened&&received.receipt.originalReport.sha256===original.report.sha256,'RECEIVING_ORIGINAL_REPORT_CHANGED');
  const localReport=(await request('/api/reports/'+received.receipt.mapping.report.local+'/download?format=json')).value;
  const state=(await request('/api/state')).value;
  const current=state.decisions.find(decision=>decision.id===localReport.decisions[0].id);
  need(current,'RECEIVING_SELECTED_DECISION_MISSING');
  const notes=[current.notes,note.trim()].filter(Boolean).join('\n\n');
  need(notes.length<=10000,'RECEIVING_NOTES_TOO_LONG');
  const revised=(await request('/api/decisions',{
   id:current.id,expectedRevision:current.revision,captureId:current.captureId,
   decision:{title:current.title,owner:current.owner,disposition:current.disposition,notes,rule:current.rule}
  })).value;
  const continued=(await request('/api/reports',{
   title:original.report.title,owner:original.report.owner,notes:original.report.notes,
   decisions:[{id:revised.id,revision:revised.revision}]
  })).value;
  const exported=await request('/api/reports/'+continued.id+'/download?format=handover');
  need(exported.response.headers.get('x-content-sha256')===sha(exported.bytes),'RECEIVING_EXPORT_BYTES_CHANGED');
  const nextText=exported.bytes.toString('utf8'),next=inspectWeatherHandover(nextText);
  const nextFile=await publish(join(output,'continued-report.weather.json'),exported.bytes);
  const replay=(await request('/api/handover/receive',{content:originalText,expectedSha256:review.packageSha256})).value;
  need(replay.reopened&&replay.receipt.id===received.receipt.id,'RECEIVING_REPLAY_IDENTITY_CHANGED');
  const latest=(await request('/api/state')).value.decisions.find(decision=>decision.id===revised.id);
  need(canonical(latest)===canonical(revised),'RECEIVING_LOCAL_REVISION_CHANGED');
  const retained=await request('/api/receiving/'+review.packageSha256+'/original');
  need(sha(retained.bytes)===sha(originalBytes),'RECEIVING_ORIGINAL_BYTES_CHANGED');
  await server.close();server=null;first=null;

  coldFirst=await WeatherWorkspace.open(await readWeatherSettings(join(firstRoot,'settings.json')));
  const reopened=(await coldFirst.summary()).decisions.find(decision=>decision.id===revised.id);
  need(canonical(reopened)===canonical(revised),'RECEIVING_REOPEN_REVISION_CHANGED');
  await coldFirst.close();coldFirst=null;

  await initializeWeatherReview({stateRoot:secondRoot});
  second=await WeatherWorkspace.open(await readWeatherSettings(join(secondRoot,'settings.json')));
  const secondReview=await second.reviewHandover(nextText);
  const onward=await second.receiveHandover(nextText,{expectedSha256:secondReview.packageSha256});
  const onwardPackage=await second.handover(onward.receipt.mapping.report.local);
  const onwardBytes=encoded(onwardPackage),onwardInspection=inspectWeatherHandover(onwardBytes.toString('utf8'));
  const expectedSources=original.sources.map(source=>source.capture.sha256).sort();
  need(canonical(onwardInspection.value.sources.map(source=>source.capture.sha256).sort())===canonical(expectedSources),'RECEIVING_ONWARD_SOURCE_CHANGED');
  const onwardFile=await publish(join(output,'onward-report.weather.json'),onwardBytes);
  await second.close();second=null;
  coldSecond=await WeatherWorkspace.open(await readWeatherSettings(join(secondRoot,'settings.json')));
  const secondReplay=await coldSecond.receiveHandover(nextText,{expectedSha256:secondReview.packageSha256});
  need(secondReplay.reopened&&secondReplay.receipt.id===onward.receipt.id,'RECEIVING_SECOND_REOPEN_CHANGED');
  await coldSecond.close();coldSecond=null;

  const result={schema:'stellar-forge.weather-receiving-continuation.v1',completedAt:new Date().toISOString(),
   originalArchive:{path:archive,bytes:archiveBytes.length,sha256:sha(archiveBytes)},
   originalReport:{id:original.report.id,sha256:original.report.sha256},
   sources:original.sources.map(source=>({id:source.capture.id,bytes:source.capture.bytes,sha256:source.capture.sha256})),
   firstReview:{settings:join(firstRoot,'settings.json'),receivingId:received.receipt.id,reportId:localReport.id,
    revisedDecisionId:revised.id,localRevision:revised.revision,continuedReportId:continued.id,
    decisionHistory:next.value.decisionHistory.length,reopenedOriginal:true},
   secondReview:{settings:join(secondRoot,'settings.json'),receivingId:onward.receipt.id,
    reportId:onward.receipt.mapping.report.local,receivingHistory:onwardInspection.value.receivingHistory.length,reopened:true},
   deliveries:{continued:nextFile,onward:onwardFile}};
  const saved=await publishJson(join(output,'receiving-continuation.json'),result);
  return {...result,saved};
 }finally{
  if(server)await server.close();else if(first)await first.close();
  for(const workspace of [second,coldFirst,coldSecond])if(workspace)await workspace.close();
 }
}
async function main(args=process.argv.slice(2)){
 const options={};
 for(let i=0;i<args.length;i+=2){
  need(['--archive','--output','--archive-sha','--note'].includes(args[i])&&args[i+1]!==undefined&&
   !Object.hasOwn(options,args[i]),'RECEIVING_OPTION_INVALID');options[args[i]]=args[i+1];
 }
 const result=await continueOriginalWeatherReport({archive:options['--archive'],output:options['--output'],
  expectedArchiveSha256:options['--archive-sha'],...(options['--note']?{note:options['--note']}:{})});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(error=>{process.stderr.write(JSON.stringify({error:safeCode(error)})+'\n');process.exitCode=1;});
