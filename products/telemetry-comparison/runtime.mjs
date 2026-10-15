// MIT. The installed host uses the complete original telemetry and operator models.
import * as codec from './operator/codec.mjs';
import {createTelemetryAPI,blankInput} from './telemetry/core.mjs';
import {createArchiveAPI} from './telemetry/archive.mjs';
import {createSessionAPI} from './operator/session.mjs';
export {codec};
export const runtime={encode:codec.utf8Encode,decode:codec.utf8Decode,sha256:v=>codec.sha256Bytes(typeof v==='string'?codec.utf8Encode(v):v),toBase64:codec.toBase64,fromBase64:codec.fromBase64};
export const core=createTelemetryAPI(runtime);
export const archive=createArchiveAPI(core,runtime);
const rawSessions=createSessionAPI(core,runtime,{archive});
export const sessions={...rawSessions,create:(label='Telemetry workspace')=>rawSessions.create({title:label,createdAt:new Date().toISOString(),input:blankInput()})};
export function applyDomain(workspace,operation){
 if(!operation||!['add-source','save-edition','review'].includes(operation.kind))throw Error('Choose an original telemetry domain operation.');
 const meta={operationId:operation.id,expectedRoot:operation.expectedRoot,at:operation.at};
 if(operation.kind==='add-source')return core.addSource(workspace,operation.payload,meta);
 if(operation.kind==='save-edition')return core.saveEdition(workspace,operation.payload,meta);
 return {workspace:core.review(workspace,operation.payload,meta)};
}
