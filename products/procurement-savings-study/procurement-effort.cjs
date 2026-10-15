'use strict';
const T=require('./study-time.cjs'),R=T.R,C=require('./canonical.cjs');
const phases=['source_capture','supplier_mapping','evidence_retrieval','reconciliation','exception_resolution','procurement_submission','finance_review','correction'];
function analyze(engine,population,config){
 const q=engine.queries,cut=T.time(config.as_of),issues=[],raw=q.current('effort').map(r=>r.values),members=population.members.filter(m=>m.status==='included'),required=config.required_effort_phases,methods=[config.baseline_method,config.current_method],byMember=new Map(members.map(m=>[m.member_id,m]));
 const out=[],groups=new Map();const add=(row,code,detail)=>{const x={code,id:row?.id||'',detail};issues.push(x);return x;};
 for(const x of raw){const a=T.time(x.started_at),b=T.time(x.ended_at),m=T.nonnegative(x.person_minutes),row={record_id:x.id,values:x,valid:true,issues:[],minutes:m},fail=(code,d)=>{row.valid=false;row.issues.push(add(x,code,d));};
  if(a===null||b===null||b<a||b>cut||T.time(x.recorded_at)<b||!m||m&&a!==null&&b!==null&&R.cmp(m,R.R(BigInt(Math.max(0,b-a)),60000n))>0n)fail('EFFORT_TIME_UNRESOLVED','Actual single-person active minutes require a complete ordered observation interval');
  if(!x.person_id||!q.context('people',x.person_id,a,config.operator_id)||!x.work_key)fail('EFFORT_IDENTITY_UNRESOLVED','Named observer and stable work identity required');
  const member=byMember.get(x.member_id);row.included=!!member;row.scope=x.method==='setup'?'setup':methods.includes(x.method)?'study_method':'other_method';
  if(methods.includes(x.method)&&(!member||!required.includes(x.phase)))fail('EFFORT_MEMBER_OR_PHASE_UNRESOLVED','Method observations must identify an included member and required phase');
  if(methods.includes(x.method)&&(x.population_complete!=='true'||x.phase_complete!=='true'))fail('EFFORT_COVERAGE_UNRESOLVED','Actual complete phase and population observations are required, including observed zero');
  const key=[x.person_id,x.work_key].join('\u0000');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);out.push(row);
 }
 const canonical=[],aliases=[];
 for(const [work_key,xs]of groups){const signature=z=>C.hash(Object.fromEntries(['member_id','phase','method','person_id','started_at','ended_at','person_minutes','matched_group_id','population_complete','phase_complete'].map(k=>[k,z.values[k]])));const valid=xs.every(z=>z.valid)&&new Set(xs.map(signature)).size===1;const row=xs[0];if(!valid)for(const z of xs){z.valid=false;z.issues.push(add(z.values,'EFFORT_WORK_IDENTITY_CONFLICT','Aliases for one actual work slice disagree or are incomplete'));}canonical.push(row);aliases.push({work_key,record_ids:xs.map(z=>z.record_id),complete:valid});}
 for(let a=0;a<canonical.length;a++)for(let b=a+1;b<canonical.length;b++){const x=canonical[a],y=canonical[b];if(x.values.person_id===y.values.person_id&&x.minutes?.n>0n&&y.minutes?.n>0n&&T.overlap(T.time(x.values.started_at),T.time(x.values.ended_at),T.time(y.values.started_at),T.time(y.values.ended_at))){for(const z of[x,y]){z.valid=false;z.issues.push(add(z.values,'EFFORT_PERSON_INTERVAL_OVERLAP','Different work identities overlap for the same person; reconcile actual active allocation'));}}}
 const cells=[],pairs=[];let baseline=R.zero(),current=R.zero(),matchedComplete=true;
 for(const member of members)for(const phase of required){
  const ms=methods.map(method=>{const rs=canonical.filter(r=>r.values.member_id===member.member_id&&r.values.phase===phase&&r.values.method===method),complete=rs.length>0&&rs.every(r=>r.valid),minutes=complete?R.sum(rs.map(r=>r.minutes)):null;const cell={member_id:member.member_id,phase,method,complete,record_ids:rs.map(r=>r.record_id),minutes};cells.push(cell);return{...cell,groups:new Set(rs.map(r=>r.values.matched_group_id))};});
  const match=ms.every(z=>z.complete&&z.groups.size===1&&![...z.groups].includes(''))&&[...ms[0].groups][0]===[...ms[1].groups][0];
  pairs.push({member_id:member.member_id,phase,complete:match,baseline:ms[0].minutes,current:ms[1].minutes,change:match?R.sub(ms[1].minutes,ms[0].minutes):null});
  if(match){baseline=R.add(baseline,ms[0].minutes);current=R.add(current,ms[1].minutes);}else matchedComplete=false;
 }
 const rawSource=q.source.all.effort,snap=q.source.snapshot(cut),sourceComplete=rawSource.every(r=>{const at=T.time(r.values?.available_at);return at!==null&&at>cut||!r.invalid&&snap.known.effort.has(r.values.id);});
 const currentRows=canonical.filter(r=>r.values.method===config.current_method),setupRows=canonical.filter(r=>r.values.method==='setup'),allCurrentComplete=currentRows.length>0&&currentRows.every(r=>r.valid)&&sourceComplete;
 const complete=population.complete&&members.length>0&&matchedComplete&&sourceComplete&&canonical.filter(r=>methods.includes(r.values.method)).every(r=>r.valid);
 if(!sourceComplete)add(null,'EFFORT_SOURCE_UNRESOLVED','Potential effort observations have unresolved original source identity');
 if(!members.length||!raw.length)add(null,'EFFORT_UNOBSERVED','No complete recurring member/phase observation population is available');
 if(!matchedComplete)add(null,'EFFORT_MATCHED_COVERAGE_INCOMPLETE','Every included member and required phase needs matched actual baseline/current observations');
 return{complete,unit:'active_person_minutes',sign_convention:'current minus baseline; negative means less measured work',required_phases:required,methods,records:out,aliases,cells,pairs,matched_groups:pairs.filter(x=>x.complete).length,baseline_person_minutes:complete?baseline:null,current_person_minutes:complete?current:null,change_person_minutes:complete?R.sub(current,baseline):null,matched_known_baseline:baseline,matched_known_current:current,all_observed_current_person_minutes:allCurrentComplete?R.sum(currentRows.map(r=>r.minutes)):null,all_current_complete:allCurrentComplete,setup_person_minutes:setupRows.length&&setupRows.every(r=>r.valid)?R.sum(setupRows.map(r=>r.minutes)):null,setup_observed:setupRows.length>0,unpaired_record_ids:canonical.filter(r=>!pairs.some(p=>p.complete&&p.member_id===r.values.member_id&&p.phase===r.values.phase)&&methods.includes(r.values.method)).map(r=>r.record_id),issues};
}
module.exports={analyze,phases};
