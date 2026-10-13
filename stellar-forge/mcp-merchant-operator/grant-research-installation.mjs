// SPDX-License-Identifier: MIT
// Research originals and whole Installation receiving through the existing owner.
import {RESEARCH_INSTALLATION_LIMITS} from '../../stellar/scf_2026/sf47_budget_model/workspace/research-installation-agent.mjs';
const prefix='research_installation_';
const reads={request:'request',original_request:'original-request',inspect:'inspect',template:'template',
  file_describe:'file-describe',archive_describe:'archive-describe'};
export const grantResearchInstallationVerbs=new Set([...Object.keys(reads).map(x=>prefix+x),prefix+'import',prefix+'resume',prefix+'file',prefix+'archive']);
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'GRANT_RESEARCH_INSTALLATION_INPUT'});};
export async function executeGrantResearchInstallationTool(verb,args,ctx){
  args=JSON.parse(JSON.stringify(args));need(grantResearchInstallationVerbs.has(verb),'Select a declared Research Installation tool.');
  const action=verb.slice(prefix.length),{workspace:_,...input}=args;
  if(action==='file'||action==='archive')return ctx.retainFile(action,input,{tool:'merchant_grant_'+verb,...input});
  if(action==='import'){
    const maximum=RESEARCH_INSTALLATION_LIMITS[input.kind];
    need(maximum,'Choose the original Research source kind.');
    const loaded=await ctx.load(input.input,input.expectedInputSha256,maximum);
    const {input:reference,expectedInputSha256,...metadata}=input;
    const response=await ctx.client.researchInstallation('import',{...metadata,bytes:loaded.bytes,sha256:expectedInputSha256});
    return ctx.retain(response,{tool:'merchant_grant_'+verb,caseId:input.caseId,draftId:input.draftId,
      requestId:input.requestId,actor:input.actor,kind:input.kind,sha256:expectedInputSha256});
  }
  const response=await ctx.client.researchInstallation(action==='resume'?'resume':reads[action],input);
  return ctx.retain(response,{tool:'merchant_grant_'+verb,...input,body:undefined});
}
