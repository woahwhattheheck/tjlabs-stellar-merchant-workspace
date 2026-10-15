// MIT. The installed host uses the complete original planning and operator models.
import * as codec from './operator/codec.mjs';
import {cachePlanningValidation} from './planning/installed-cache.mjs';
import {createPlanningAPI,blankInput} from './planning/core.mjs';
import {createArchiveAPI} from './planning/archive.mjs';
import {createOperatorArchive} from './operator/portable.mjs';
import {cachePlanningReceive} from './operator/installed-receive.mjs';
import {createSessionAPI} from './operator/session.mjs';
export {codec};
export const runtime={encode:codec.utf8Encode,decode:codec.utf8Decode,sha256:v=>codec.sha256Bytes(typeof v==='string'?codec.utf8Encode(v):v),toBase64:codec.toBase64,fromBase64:codec.fromBase64};
export const core=cachePlanningValidation(createPlanningAPI(runtime));
export const archive=createArchiveAPI(core,runtime);
const rawSessions=createSessionAPI(core,runtime);
export const portable=createOperatorArchive(rawSessions,createArchiveAPI,core,runtime);
export const sessions={...rawSessions,receive:cachePlanningReceive(rawSessions,portable.receive),advance,create:(label='Planning workspace')=>rawSessions.create({title:label,createdAt:new Date().toISOString(),input:blankInput()})};
export function applyDomain(workspace,operation){
 if(!operation||!['add-source','save-edition','propose','review'].includes(operation.kind))throw Error('Choose an original planning domain operation.');
 const meta={operationId:operation.id,expectedRoot:operation.expectedRoot,at:operation.at};
 if(operation.kind==='add-source')return core.addSource(workspace,operation.payload,meta);
 if(operation.kind==='save-edition')return core.saveEdition(workspace,operation.payload,meta);
 if(operation.kind==='propose')return core.propose(workspace,operation.payload,meta);
 return {workspace:core.review(workspace,operation.payload,meta)};
}

function advance(current,result,operation){
 const next=rawSessions.copy(current);next.backups.push(rawSessions.backup(current,'Complete editor before '+operation.kind+' '+operation.id));next.workspace=result.workspace;next.updatedAt=operation.at;
 if(result.editionId){next.draft.selectedEditionId=result.editionId;next.draft.parentEditionId=result.editionId;}
 if(result.proposalId)next.draft.selectedProposalId=result.proposalId;
 return rawSessions.validate(next);
}
