// MIT. Original maker-declared production, receiving and exact-source decision authority.
import {createMakerProductionCore} from './maker-production-core.mjs';
import {cacheMakerProductionReads} from './src/cached-core.mjs';
import {createMakerProductionSessionAPI} from './src/session.mjs';
import {appendMakerObservation} from './src/domain-actions.mjs';
import * as codec from './host/codec.mjs';
export {codec,appendMakerObservation};
export const core=cacheMakerProductionReads(createMakerProductionCore()),sessions=createMakerProductionSessionAPI(core,codec);
export function workspaceHead(workspace){return core.reopen(workspace).head;}
export function applyDomain(workspace,operation){
 if(!operation||!['receive','observation','decision'].includes(operation.kind))throw Error('Choose an original maker production operation.');
 const w=core.reopen(workspace);if(operation.expectedHead!==w.head)throw Error('The original source and decision head changed.');
 return {workspace:operation.kind==='receive'?core.addEdition(w,operation.payload):operation.kind==='observation'?appendMakerObservation(core,w,operation.payload):core.decide(w,operation.payload)};
}
