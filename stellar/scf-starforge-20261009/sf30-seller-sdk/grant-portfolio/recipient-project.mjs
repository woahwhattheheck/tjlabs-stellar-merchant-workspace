// MIT. Native recipient project preparation and original-operation continuation.
import {createHash} from 'node:crypto';
import {originalEngrantPlanBytes,parseEngrantApplicationPlan,prepareRecipientProjectStructure,
  verifyRecipientProjectStructure,sameRecipientValue} from './recipient-project-core.mjs';
export {parseEngrantApplicationPlan};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'GRANT_RECIPIENT_INPUT'});};
/** Caller supplies every stable ID. Retain this whole result before dispatch. */
export function prepareRecipientProject(portfolio,input){
  const bytes=originalEngrantPlanBytes(input.bytes),plan=prepareRecipientProjectStructure(portfolio,{...input,bytes},sha(bytes));
  return {...plan,actionSha256:sha(Buffer.from(JSON.stringify(plan.action),'utf8'))};
}
/** Complete source and selected historical basis are rechecked before a same-ID save. */
export async function submitRecipientProject(client,plan,sourceBytes,options={}){
  const bytes=originalEngrantPlanBytes(sourceBytes),digest=sha(bytes);
  need(plan?.source?.sha256===digest&&plan.source.bytes===bytes.length,'The original application-plan file differs from the reviewed handover.');
  need(plan.actionSha256===sha(Buffer.from(JSON.stringify(plan.action),'utf8')),'The exact original handover action changed.');
  const basis=await client.portfolio(plan.portfolio.id,{revision:plan.portfolio.revision,signal:options.signal});
  need(basis.snapshot===plan.portfolio.snapshot,'The saved handover selected a different original portfolio snapshot.');
  verifyRecipientProjectStructure(basis,plan,bytes,digest);
  let original=null;
  try{original=await client.request(plan.action.operationId,options);}
  catch(error){if(error.code!=='NOT_FOUND')throw error;}
  if(original){
    need(sameRecipientValue(original.input,plan.action),'A different saved input already uses this operation ID.');
    return client.action(plan.action,options);
  }
  const current=await client.portfolio(plan.portfolio.id,{signal:options.signal});
  need(current.revision===basis.revision&&current.snapshot===basis.snapshot,
    'The portfolio changed before this original handover was dispatched. Review a new plan explicitly.');
  const uploaded=await client.uploadProgrammeDocument({body:bytes,bytes:bytes.length,sha256:digest},options);
  need(uploaded.sha256===digest&&uploaded.bytes===bytes.length,'The original application-plan upload changed.');
  return client.action(plan.action,options);
}
