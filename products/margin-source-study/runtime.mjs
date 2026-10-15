// MIT. The original full-chain model and compact session remain authoritative.
import Core from './core.cjs';
import OriginalSessions from './src/session-cache.cjs';
import * as codec from './host/codec.mjs';
import {createMarginSourceStudySessionAPI} from './src/session.mjs';
const core=Core,originalSessions=OriginalSessions,sessions=createMarginSourceStudySessionAPI(core,originalSessions,codec);
export {core,originalSessions,sessions,codec};
export const workspaceHead=w=>{originalSessions.validate(w);return originalSessions.hash(w);};
export function applyDomain(workspace,operation){
 originalSessions.validate(workspace);if(operation.expectedHead!==workspaceHead(workspace))throw Error('The complete selected margin study session changed');const p=operation.payload||{},w=workspace.study;let next,reason=operation.kind;
 if(operation.kind==='import')next=core.importExtract(w,p);
 else if(operation.kind==='choose')next=core.choose(w,p.kind,p.side,p.extractId);
 else if(operation.kind==='crosswalk')next=core.crosswalk(w,p.kind,p.pairs);
 else if(operation.kind==='match-ids')next=core.matchIds(w,p.kind);
 else if(operation.kind==='document')next=core.addDocument(w,{...p,bytes:codec.fromBase64(p.contentBase64)});
 else if(operation.kind==='link-document')next=core.linkDocument(w,p);
 else if(operation.kind==='unlink-document')next=core.unlinkDocument(w,p);
 else if(operation.kind==='review')next=core.review(w,p);
 else if(operation.kind==='configure'){next=core.clone(w);next.config={...next.config,...p,selection:w.config.selection,margin:w.config.margin};core.validate(next);}
 else if(operation.kind==='edit-row'){if(p.study_id!==w.id||p.expected_extract_id!==(core.selected(w,p.kind,p.side)?.id||null))throw Error('Selected records changed after this correction began');next=core.editRow(w,p);}
 else if(operation.kind==='margin-plan'){next=core.clone(w);next.config.margin={...next.config.margin,...p,comparisons:w.config.margin.comparisons};core.validate(next);}
 else if(operation.kind==='comparison-plan'){if(p.study_id!==w.id||!p.reason?.trim())throw Error('Bind the exact study and explain the comparison revision');next=core.clone(w);const i=p.key===null?-1:next.config.margin.comparisons.findIndex(c=>c.id===p.key);if(p.key!==null&&(i<0||originalSessions.hash(next.config.margin.comparisons[i])!==p.expected_sha256))throw Error('Comparison changed after this draft began');if(i<0)next.config.margin.comparisons.push(p.value);else next.config.margin.comparisons[i]=p.value;core.validate(next);}
 else if(operation.kind==='remove-comparison'){next=core.clone(w);const i=next.config.margin.comparisons.findIndex(c=>c.id===p.id);if(i<0||originalSessions.hash(next.config.margin.comparisons[i])!==p.expected_sha256)throw Error('Select the exact current comparison');next.config.margin.comparisons.splice(i,1);core.validate(next);}
 else if(operation.kind==='notes'){next=core.clone(w);next.notes=p.text;core.validate(next);}
 else throw Error('Choose a declared complete margin study operation');
 let successor=originalSessions.checkpoint(workspace,next,'Native '+reason);successor=originalSessions.retain(successor,workspace,'Complete editor before '+reason);return {workspace:originalSessions.validate(successor)};
}
