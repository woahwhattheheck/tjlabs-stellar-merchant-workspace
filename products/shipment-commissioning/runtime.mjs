// MIT. The original replayable command journal is authoritative.
import core from './runtime/shipment-review.cjs';
import * as codec from './host/codec.mjs';
import {createShipmentCommissioningSessionAPI} from './src/session.mjs';
const sessions=createShipmentCommissioningSessionAPI(core,codec);
const originalSessions={create:sessions.fresh,validate:sessions.original,normalize:sessions.original,hash:w=>codec.hashText(JSON.stringify(sessions.original(w)))};
export {core,codec,sessions,originalSessions};
export const workspaceHead=w=>originalSessions.hash(w);
export const commandKinds=['add_original','save_case','review_case','save_contract','create_run','add_capture','select_capture','review_run','record_effort'];
export function applyDomain(editor,operation){
 sessions.original(editor);if(operation.expectedHead!==workspaceHead(editor))throw Error('The complete selected shipment editor changed');
 if(!commandKinds.includes(operation.kind))throw Error('Choose a declared shipment command');
 const old=editor.workspace,command={id:operation.id,kind:operation.kind,value:sessions.clone(operation.payload||{}),actor:operation.actor,at:operation.at,expected_revision:old.revision,expected_hash:core.hash(old)};
 const next=sessions.clone(editor);next.workspace=core.apply(old,command);next.actor=operation.actor;
 return {workspace:sessions.fromSession(sessions.retain(next,editor,'Complete editor before '+operation.kind,operation.at)).workspace,command};
}
