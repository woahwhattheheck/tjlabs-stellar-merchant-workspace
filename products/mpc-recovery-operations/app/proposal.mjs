import Planner from './proposal/planner.cjs';
import * as Model from './domain.mjs';
export const PROPOSAL_SOURCE={commit:'34aafb8b181e7e4a8fa21f05cd5c27707abe73ca',coreSha256:'58493e4e4339ba0bbc662fb75fee62cd7ceb0af4bdc79e0736d1a8aebd6ff7e0',schema:'mpc-backup-planning/v1'};
function registerRows(register){if(!register||!Array.isArray(register.requirements)||!Array.isArray(register.steps))throw Error('The complete original proposal register is required.');return register;}
export function inspectProposal(content,register){
 registerRows(register);if(typeof content!=='string'||content.length>3000000)throw Error('Choose a complete proposal case JSON below 3 MB.');
 const state=JSON.parse(content.replace(/^\uFEFF/,''));Planner.validate(state);
 for(const [area,rows] of [['responses',register.requirements],['acceptance',register.steps]]){
  const known=new Set(rows.map(r=>r.id));for(const key of Object.keys(state[area]))if(!known.has(key))throw Error('Unknown original proposal '+area+' entry '+key);
 }
 const result=Planner.calculate(state);
 return {sourceSha256:Model.sha256(content),method:PROPOSAL_SOURCE,case:state,result,
  requirements:register.requirements.map(r=>({...r,recorded:Object.prototype.hasOwnProperty.call(state.responses,r.id),decision:state.responses[r.id]||{status:'open',notes:''}})),
  acceptance:register.steps.map(r=>({...r,recorded:Object.prototype.hasOwnProperty.call(state.acceptance,r.id),decision:state.acceptance[r.id]||{status:'planned',notes:''}}))};
}
export function importProposal(workspace,{id,actor,at,name,origin,content},register){
 const proposal=inspectProposal(content,register);
 const existing=workspace.sources.find(s=>s.encoding==='utf8'&&s.sha256===proposal.sourceSha256&&s.content===content);
 if(existing)return {workspace,sourceId:existing.id,proposal,reused:true};
 const bytes=unescape(encodeURIComponent(content)).length;
 const outcome=Model.applyCommand(workspace,{id:id+'-command',actor,at,expectedRevision:workspace.revision,type:'source.import',payload:{
  id,name,mediaType:'application/json',encoding:'utf8',content,bytes,sha256:proposal.sourceSha256,origin,observedAt:at}});
 return {workspace:outcome.workspace,sourceId:id,proposal,reused:false};
}
export function retainedProposals(workspace,register){
 const result=[];for(const source of workspace.sources){if(source.encoding!=='utf8')continue;let value;try{value=JSON.parse(source.content.replace(/^\uFEFF/,''));}catch{continue;}
 if(value?.schema!==PROPOSAL_SOURCE.schema)continue;
 result.push({source,proposal:inspectProposal(source.content,register)});}return result;
}
export function compareProposals(left,right,register){
 const a=inspectProposal(left,register),b=inspectProposal(right,register),changes=[];
 function visit(x,y,path){if(Model.canonical(x)===Model.canonical(y))return;
  if(x&&y&&typeof x==='object'&&typeof y==='object'&&!Array.isArray(x)&&!Array.isArray(y)){for(const k of new Set([...Object.keys(x),...Object.keys(y)]))visit(Object.prototype.hasOwnProperty.call(x,k)?x[k]:null,Object.prototype.hasOwnProperty.call(y,k)?y[k]:null,path+'/'+k.replace(/~/g,'~0').replace(/\//g,'~1'));}
  else changes.push({path,previous:x,current:y});}
 visit(a.case,b.case,'');return {previousSha256:a.sourceSha256,currentSha256:b.sourceSha256,changes};
}
export function proposalPlanDraft(workspace,sourceId,{id,title},register){
 const source=workspace.sources.find(s=>s.id===sourceId);if(!source)throw Error('Choose a retained complete proposal source.');
 const proposal=inspectProposal(source.content,register),current=workspace.plans.find(p=>p.id===workspace.activePlanId),ref={sourceId,locator:'whole-file'};
 const copy=value=>JSON.parse(JSON.stringify(value));
 return {id,title:title||proposal.case.name+' — installation design',previousPlanId:workspace.activePlanId,
 note:'Planning basis: '+proposal.case.name+'. The retained proposal assumptions, quote sources and response decisions inform this edition. Enter the actual installation inventory and agree each workload target.',
 sourceRefs:[ref,...copy(current?.sourceRefs||[]).filter(r=>r.sourceId!==sourceId)],
 repositories:copy(current?.repositories||[]),workloads:copy(current?.workloads||[])};
}
