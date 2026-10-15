// MIT. Original rational-unit, source-event and exception-review authority.
import {createBreweryCore} from './src/brewery-core.mjs';
import {createBreweryDeskController} from './src/desk-controller.mjs';
import {cacheBreweryReads} from './src/cached-core.mjs';
import {createBrewerySessionAPI} from './src/session.mjs';
import * as codec from './host/codec.mjs';
export {codec};
export const core=cacheBreweryReads(createBreweryCore()),deskController=createBreweryDeskController(core),sessions=createBrewerySessionAPI(core,codec,deskController);
export function workspaceHead(workspace){return core.reopen(workspace).head;}
export function applyDomain(workspace,operation){
 if(!operation||!['receive','review'].includes(operation.kind))throw Error('Choose an original brewery operation.');
 const w=core.reopen(workspace);if(operation.expectedHead!==w.head)throw Error('The original source and exception-review head changed.');
 const p={...operation.payload,expectedRevision:w.revision,commandId:operation.id};return {workspace:operation.kind==='receive'?core.receive(w,p):core.review(w,p)};
}
