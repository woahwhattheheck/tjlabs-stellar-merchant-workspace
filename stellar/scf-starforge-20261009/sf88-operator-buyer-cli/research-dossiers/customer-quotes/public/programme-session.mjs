// MIT. The original quotation forms submit to the original retained programme jobs.
const PREFIX='/api/customer-quote-programmes',uuid=()=>crypto.randomUUID();
const need=(value,message)=>{if(!value)throw new Error(message);};
const clone=value=>structuredClone(value);
const commands={
 '/cases/create':'create-case','/prepare':'prepare','/apply':'apply','/responses/prepare':'prepare-response',
 '/publications/prepare':'prepare-publication','/publications/enroll':'enroll-publication','/reports/prepare':'prepare-report',
 '/case-transfers/prepare':'prepare-case-transfer','/case-transfers/apply':'apply-case-transfer'
};
export function programmeFormCommand(route){
 if(commands[route])return {command:commands[route]};
 const caseMatch=/^\/cases\/([a-f0-9-]{36})\/([a-z][a-z-]*)$/.exec(route);
 if(caseMatch)return {command:'native-case',caseId:caseMatch[1],action:caseMatch[2]};
 const pricing=/^\/pricing\/([a-z0-9][a-z0-9_-]{0,63})\/([a-z][a-z-]*)$/.exec(route);
 if(pricing)return {command:'pricing',profile:pricing[1],action:pricing[2]};
 throw new Error('This operation does not belong to a quotation programme step.');
}
export function newProgrammeFormBinding(programmeId,caseId){
 return {programmeId,caseId,original:{jobId:uuid(),stepId:'browser-'+uuid(),status:'PENDING'},replay:null};
}
/**
 * persist must finish in the original browser request journal before dispatch.
 * The retained native job keeps working if this browser goes away.
 */
export async function runProgrammeFormRequest({binding,route,body,replay=false,resume=false,originalComplete=false,api,persist,message}){
 const selected=clone(binding),command=programmeFormCommand(route);
 need(/^[a-f0-9-]{36}$/.test(selected.programmeId??''),'Open the selected original programme.');
 if(command.caseId)need(command.caseId===selected.caseId,'This case belongs to a different programme. Open its original programme before submitting.');
 if(originalComplete)selected.original.status='COMPLETE';
 // A pending outer receipt continues its original native job. Only a completed
 // original request admits a new replay; an already-pending replay keeps its ID.
 const resumeReplay=resume&&(selected.active==='REPLAY'||
  (selected.active===undefined&&originalComplete&&selected.replay!==null));
 const replaying=selected.original.status==='COMPLETE'&&
  (resume?resumeReplay:replay||selected.replay?.status==='PENDING');
 let operation=selected.original,job;
 if(replaying){
  if(!selected.replay||!resume&&selected.replay.status!=='PENDING')selected.replay={jobId:uuid(),stepId:'browser-'+uuid(),status:'PENDING'};
  operation=selected.replay;selected.active='REPLAY';
  job={id:operation.jobId,kind:'REPLAY',programmeId:selected.programmeId,
   sourceStepId:selected.original.stepId,stepId:operation.stepId};
 }else{
  selected.active='ORIGINAL';
  job={id:operation.jobId,kind:'SUBMIT',programmeId:selected.programmeId,stepId:operation.stepId,
   command:command.command,value:clone(body),
   ...(command.action?{action:command.action}:{}),...(command.profile?{profile:command.profile}:{})};
 }
 await persist(clone(selected));
 const endpoint=PREFIX+'/jobs'+(job.command==='prepare-case-transfer'?'/case-transfer':'');
 let current=await api(endpoint,{body:job}),started=Date.now();
 for(;;){
  need(current.id===job.id,'The original programme job changed.');
  if(current.status==='COMPLETE'){
   const saved=await api(PREFIX+'/jobs/'+job.id+'?result=true'),step=saved.result;
   need(step?.record?.programmeId===selected.programmeId&&step.record.stepId===operation.stepId&&
    step.native?.result?.result,'The original programme step did not return its complete native result.');
   if(replaying)selected.replay.status='COMPLETE';
   else selected.original.status='COMPLETE';
   await persist(clone(selected));
   message?.('Saved in the original customer programme.');
   return clone(step.native.result.result);
  }
  if(current.status==='RETRY_REQUIRED'){
   const failure=current.error??{};
   throw Object.assign(new Error(failure.message??'The original programme step needs continuation.'),failure,
    {outcomeUnknown:true,programmeJobId:job.id});
  }
  if(Date.now()-started>900000)throw Object.assign(new Error(
   'The native programme is still running. Its exact request is retained; reopen this operation to continue.'),
   {outcomeUnknown:true,programmeJobId:job.id});
  message?.('The original programme is processing this request. Its saved operation remains available from Programmes.');
  await new Promise(resolve=>setTimeout(resolve,1000));
  current=await api(PREFIX+'/jobs/'+job.id);
 }
}
