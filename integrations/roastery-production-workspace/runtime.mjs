// MIT. The original roastery core remains the sole calculation and receiving authority.
import {createRoasteryCore} from './src/roastery-core.mjs';
import {createRoasterySessionAPI} from './src/session.mjs';
import * as codec from './host/codec.mjs';
export {codec};
export const core=createRoasteryCore(),sessions=createRoasterySessionAPI(core,codec);
export function workspaceHead(workspace){return codec.sha256Bytes(codec.utf8Encode(JSON.stringify(core.reopen(workspace))));}
export function applyDomain(workspace,operation){
 if(!operation||!['receive','freeze','outcome','notes','name'].includes(operation.kind))throw Error('Choose an original roastery operation.');
 if(operation.expectedHead!==workspaceHead(workspace))throw Error('The complete roastery input and working edition changed.');
 const p=operation.payload||{};let next=core.reopen(workspace);
 if(operation.kind==='receive')next=core.receive(next,p.table,p.text,p.filename,operation.at);
 if(operation.kind==='freeze')next=core.freeze(next,p.reviewer,p.note,operation.at);
 if(operation.kind==='outcome')next=core.recordOutcome(next,p.planId,p.batchId,p.green_g,p.roasted_g,p.reference,p.note,operation.at);
 if(operation.kind==='notes')next.notes=String(p.value);
 if(operation.kind==='name')next.caseName=String(p.value);
 return {workspace:core.reopen(next)};
}
