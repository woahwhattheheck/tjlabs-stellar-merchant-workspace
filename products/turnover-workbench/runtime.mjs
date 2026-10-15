// MIT. Original frame, occurrence, coverage, review and receiving rules remain authoritative.
import {createTurnoverCore} from './src/turnover-core.mjs';
import {cacheTurnoverReads} from './src/cached-core.mjs';
import {createTurnoverSessionAPI} from './src/session.mjs';
import * as codec from './host/codec.mjs';
export {codec};
export const core=cacheTurnoverReads(createTurnoverCore()),sessions=createTurnoverSessionAPI(core,codec);
export function workspaceHead(workspace){return core.reopen(workspace).head;}
export function applyDomain(workspace,operation){
 if(!operation||!['receive','review','receiving'].includes(operation.kind))throw Error('Choose an original turnover operation.');
 const w=core.reopen(workspace);
 if(operation.expectedHead!==w.head)throw Error('The original comparison and review head changed.');
 const payload={...operation.payload,expectedRevision:w.revision,commandId:operation.id};
 return {workspace:operation.kind==='receive'?core.receive(w,payload):operation.kind==='review'?core.review(w,payload):core.receiveNote(w,payload)};
}
