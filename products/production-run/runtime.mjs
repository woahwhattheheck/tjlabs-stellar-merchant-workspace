// MIT. Installed host retains the exact original production domain and complete operator sessions.
import * as codec from './operator/codec.mjs';
import {createProductionAPI} from './production/core.mjs';
import {createSessionAPI} from './operator/session.mjs';
export {codec};
export const runtime={encode:codec.utf8Encode,decode:codec.utf8Decode,sha256:v=>codec.sha256Bytes(typeof v==='string'?codec.utf8Encode(v):v),toBase64:codec.toBase64,fromBase64:codec.fromBase64};
export const core=createProductionAPI(runtime);
const rawSessions=createSessionAPI(core,runtime);
export const sessions={...rawSessions,create:(label='Production workspace')=>rawSessions.create({title:label,createdAt:new Date().toISOString(),input:core.blankInput()})};
export function applyDomain(workspace,operation){
 if(!operation||!['add-source','save-edition','propose','review'].includes(operation.kind))throw Error('Choose an original production operation.');
 const meta={operationId:operation.id,expectedRoot:operation.expectedRoot,at:operation.at};
 if(operation.kind==='add-source')return core.addSource(workspace,operation.payload,meta);
 if(operation.kind==='save-edition')return core.saveEdition(workspace,operation.payload,meta);
 if(operation.kind==='propose')return core.propose(workspace,operation.payload,meta);
 return {workspace:core.review(workspace,operation.payload,meta)};
}
