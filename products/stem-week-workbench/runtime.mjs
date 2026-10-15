// MIT. Original exact-variety, source-origin, supply-basis and grower decision authority.
import {createStemWeekCore} from './stem-week-core.mjs';
import {cacheStemWeekReads} from './src/cached-core.mjs';
import {createStemWeekSessionAPI} from './src/session.mjs';
import * as codec from './host/codec.mjs';
export {codec};
export const core=cacheStemWeekReads(createStemWeekCore()),sessions=createStemWeekSessionAPI(core,codec);
export function workspaceHead(workspace){return core.reopen(workspace).head;}
export function applyDomain(workspace,operation){
 if(!operation||!['receive','decision'].includes(operation.kind))throw Error('Choose an original weekly stem operation.');
 const w=core.reopen(workspace);if(operation.expectedHead!==w.head)throw Error('The original source and decision head changed.');
 return {workspace:operation.kind==='receive'?core.addEdition(w,operation.payload):core.decide(w,operation.payload)};
}
