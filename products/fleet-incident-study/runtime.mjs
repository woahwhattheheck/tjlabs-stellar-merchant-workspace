// MIT. The original full-chain model and compact session remain authoritative.
import Core from './core.cjs';
import OriginalSessions from './src/session-cache.cjs';
import * as codec from './host/codec.mjs';
import {createFleetIncidentStudySessionAPI} from './src/session.mjs';
const core=Core,originalSessions=OriginalSessions,sessions=createFleetIncidentStudySessionAPI(core,originalSessions,codec);
export {core,originalSessions,sessions,codec};
export const workspaceHead=w=>{originalSessions.validate(w);return originalSessions.hash(w);};
export function applyDomain(workspace,operation){
 originalSessions.validate(workspace);if(operation.expectedHead!==workspaceHead(workspace))throw Error('The complete selected fleet study session changed');const p=operation.payload||{},w=workspace.study;let next,reason=operation.kind;
 if(operation.kind==='import')next=core.importExtract(w,p);
 else if(operation.kind==='choose')next=core.choose(w,p.kind,p.side,p.extractId);
 else if(operation.kind==='crosswalk')next=core.crosswalk(w,p.kind,p.pairs);
 else if(operation.kind==='match-ids')next=core.matchIds(w,p.kind);
 else if(operation.kind==='document')next=core.addDocument(w,{...p,bytes:codec.fromBase64(p.contentBase64)});
 else if(operation.kind==='document-availability')next=core.documentAvailability(w,p);
 else if(operation.kind==='link-document')next=core.linkDocument(w,p);
 else if(operation.kind==='unlink-document')next=core.unlinkDocument(w,p);
 else if(operation.kind==='review')next=core.review(w,p);
 else if(operation.kind==='configure'){next=core.clone(w);next.config={...next.config,...p,selection:w.config.selection,fleet:w.config.fleet};core.validate(next);}
 else if(operation.kind==='edit-row'){if(p.study_id!==w.id||p.expected_extract_id!==(core.selected(w,p.kind,p.side)?.id||null))throw Error('Selected records changed after this correction began');next=core.editRow(w,p);}
 else if(operation.kind==='fleet-plan'){next=core.clone(w);next.config.fleet={...next.config.fleet,...p};core.validate(next);}
 else if(operation.kind==='notes'){next=core.clone(w);next.notes=p.text;core.validate(next);}
 else throw Error('Choose a declared complete fleet study operation');
 let successor=originalSessions.checkpoint(workspace,next,'Native '+reason);successor=originalSessions.retain(successor,workspace,'Complete editor before '+reason);return {workspace:originalSessions.validate(successor)};
}
